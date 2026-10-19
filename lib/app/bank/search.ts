/**
 * Search the databank by name and text (`f-tutor-knowledge` t-57): the lexical layer, which calls no AI provider.
 *
 * Serves the public `GET /api/v1/bank/search` and the tutor's `search_databank` tool. The ranking is BM25 over three
 * fields of each row, weighted: its name, its own text, and the names of the rows it links to (an artist's records and
 * instruments, an instrument's people and records). So "Vangelis" finds the artist first and their records after, and
 * "who played a Minimoog" still reaches the artists whose rows only link to it. A query that contains a row's whole
 * name, as most of what it asks, lifts that row above every partial match.
 *
 * In memory, over the whole bank, read once per search as the databank pages read it (`lib/app/bank/read.ts`): about
 * 1,420 short rows. Building the documents (each row's joins) takes some 150 ms, so the built index is kept for as long
 * as the bank hashes the same: a search costs the read layer's four queries, the hash and a few milliseconds of
 * scoring, and an admin's edit shows on the next search. Postgres's `ts_rank_cd` was the plan's first idea; scoring here gives real BM25, needs
 * no raw SQL, and keeps the ranking testable over the committed data. When the bank grows past where one read per
 * search is cheap, index it in a table instead.
 *
 * The meaning-based layer (t-58, `lib/app/bank/knowledge.ts`) projects these same documents into the knowledge base, and
 * the tutor's tool merges its results in: this file never calls a model.
 *
 * Tenancy posture: shared by decision. The one cached index is the databank's, which is global config
 * (`GLOBAL_CONFIG_MODELS`) and the same for every org; it would be wrong only if the bank became per-org.
 */
import { computeETag } from '@/lib/api/etag';
import type { Bank } from '@/lib/app/bank/data';
import { detailFrom, loadBank, type BankKind } from '@/lib/app/bank/read';
import { bankHref } from '@/components/app/bank/routes';

/** A query is at most this long: a question, not a document. */
export const MAX_QUERY_LENGTH = 200;
/** Results one search returns at most, and by default. */
export const MAX_RESULTS = 20;
export const DEFAULT_RESULTS = 10;
/** Linked rows one result lists at most. */
const MAX_RELATED = 8;
const EXCERPT_CHARS = 240;

/** BM25's usual constants. */
const K1 = 1.2;
const B = 0.75;
/** How much a match in each field counts. A name says what a row is; a link only says what it touches. */
const WEIGHTS = { name: 3, text: 1, links: 0.5 } as const;
/**
 * Added when the query contains a row's whole name and the name is at least half the query, so the row itself outranks
 * every row that mentions it or adds to its name: "Minimoog Model D" finds the original before "Minimoog Model D
 * (2016)". The half is what keeps a one-word name (the artists Europe and Air, the record "Blue") from topping every
 * question that happens to use the word.
 */
const WHOLE_NAME_BONUS = 10;

type Field = keyof typeof WEIGHTS;

/** A row another row links to. */
export interface BankRef {
  kind: BankKind;
  id: string;
  name: string;
}

export interface BankSearchHit extends BankRef {
  /** Its page on the site. */
  href: string;
  /** One line that places it: "Moog · 1970 · synth", "group · UK · 1970s". */
  about: string;
  /** The sentence of its text that best matches the query, or its opening. */
  excerpt: string;
  /** The rows it links to, so a lead can be followed without another search. */
  related: BankRef[];
  score: number;
}

export interface BankSearchOptions {
  kind?: BankKind;
  limit?: number;
}

/** The words of a text, as the index compares them. */
const STOP = new Set(
  'a an and are as at be by did do does for from had has have he her his i in is it its of on or she that the their them they this to was were what when where which who whom why with you your'.split(
    ' '
  )
);

/** Lower case, accents off, possessives off, split on anything not a letter or digit. */
function split(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words of a text as the index scores them: stop words out, and plurals folded. */
export function tokens(text: string): string[] {
  return split(text)
    .filter((t) => !STOP.has(t))
    .map(fold);
}

/**
 * Every word, stop words kept: what a whole name is matched on, so a name made only of stop words ("The Who") can
 * still be found by it.
 */
function allTokens(text: string): string[] {
  return split(text).map((t) => (STOP.has(t) ? t : fold(t)));
}

/**
 * A crude stemmer: enough that "synths" finds "synth" and "melodies" finds "melody", and no more. Only words of
 * letters: a model name keeps its letter ("DX7s" is not a plural of "DX7").
 */
function fold(t: string): string {
  if (!/^[a-z]+$/.test(t)) return t;
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) {
    return t.slice(0, -1);
  }
  return t;
}

/** One row of the bank as the search sees it. */
export interface BankDoc {
  ref: BankRef;
  about: string;
  /** The text an excerpt is cut from. */
  prose: string;
  /** All of the row's own text, as one string: what its text field is tokenised from. */
  body: string;
  related: BankRef[];
  fields: Record<Field, string[]>;
  /** The name's every word, stop words kept, for the whole-name bonus. */
  nameTokens: string[];
}

const words = (...parts: (string | string[] | undefined | null)[]): string =>
  parts
    .flat()
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ');

const refs = (kind: BankKind, rows: { id: string; name: string }[]): BankRef[] =>
  rows.map((r) => ({ kind, id: r.id, name: r.name }));

const dedupe = (rows: BankRef[]): BankRef[] => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.kind}/${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const songRefs = (songs: { id: string; title: string }[]): BankRef[] =>
  songs.map((s) => ({ kind: 'songs', id: s.id, name: s.title }));

/** Every row of the bank as a document of three fields, with what a result shows of it. */
function documents(bank: Bank): BankDoc[] {
  const docs: BankDoc[] = [];
  const add = (
    ref: BankRef,
    about: string,
    prose: string,
    text: string,
    related: BankRef[]
  ): void => {
    const linked = dedupe(related);
    docs.push({
      ref,
      about,
      prose,
      body: text,
      related: linked,
      fields: {
        name: tokens(ref.name),
        text: tokens(text),
        links: tokens(linked.map((r) => r.name).join(' ')),
      },
      nameTokens: allTokens(ref.name),
    });
  };

  for (const a of bank.artists) {
    const d = detailFrom(bank, 'artists', a.id);
    if (!d) continue;
    const prose = words(a.summary, a.story);
    add(
      { kind: 'artists', id: a.id, name: a.name },
      [a.kind, a.country, d.eras.join(', ')].filter(Boolean).join(' · '),
      prose,
      words(prose, a.innovations, a.genres, a.roles, a.country),
      [
        ...refs('artists', d.members),
        ...refs('artists', d.groups),
        ...songRefs(d.songs),
        ...refs('instruments', d.instruments),
      ]
    );
  }
  for (const m of bank.makers) {
    const d = detailFrom(bank, 'makers', m.id);
    if (!d) continue;
    const prose = words(m.summary, m.story);
    const life = m.born ? `${m.born}–${m.died ?? ''}` : '';
    add(
      { kind: 'makers', id: m.id, name: m.name },
      [life, m.country].filter(Boolean).join(' · '),
      prose,
      words(prose, m.innovations, m.companies, m.country),
      refs('instruments', d.instruments)
    );
  }
  for (const i of bank.instruments) {
    const d = detailFrom(bank, 'instruments', i.id);
    if (!d) continue;
    add(
      { kind: 'instruments', id: i.id, name: i.name },
      [i.maker, i.year, i.kind].filter(Boolean).join(' · '),
      i.text,
      words(i.text, i.maker, i.kind),
      [
        ...refs('makers', d.people),
        ...(d.recreationOf ? refs('instruments', [d.recreationOf]) : []),
        ...refs('instruments', d.recreations),
        ...refs('artists', d.artists),
        ...songRefs(d.songs),
      ]
    );
  }
  for (const s of bank.songs) {
    const d = detailFrom(bank, 'songs', s.id);
    if (!d) continue;
    const prose = words(s.parts.map((p) => p.text));
    add(
      { kind: 'songs', id: s.id, name: s.title },
      [d.song.who, s.year, s.kind].filter(Boolean).join(' · '),
      prose,
      words(
        prose,
        s.parts.map((p) => p.on),
        s.album,
        s.credit
      ),
      [
        ...refs('artists', d.artists),
        ...refs('artists', d.players),
        ...refs('instruments', d.instruments),
      ]
    );
  }
  return docs;
}

/** The last bank's documents, by its content hash. */
let built: { key: string; docs: BankDoc[] } | null = null;

/** Every row of `bank` as a document, built once per content hash. */
export function documentsOf(bank: Bank): BankDoc[] {
  const key = computeETag(bank);
  if (built?.key !== key) built = { key, docs: documents(bank) };
  return built.docs;
}

/** Does `hay` hold `needle` as a run of consecutive tokens, and is `needle` at least half of it? */
function holdsWholeName(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length * 2 < hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, j) => hay[i + j] === t)) return true;
  }
  return false;
}

/** The sentence of `prose` holding the most query words, cut to length; its opening when none does. */
function excerptOf(prose: string, query: Set<string>): string {
  const sentences = prose.split(/(?<=[.!?])\s+/).filter(Boolean);
  let best = sentences[0] ?? '';
  let bestHits = 0;
  for (const s of sentences) {
    const hits = new Set(tokens(s).filter((t) => query.has(t))).size;
    if (hits > bestHits) {
      best = s;
      bestHits = hits;
    }
  }
  return best.length <= EXCERPT_CHARS ? best : `${best.slice(0, EXCERPT_CHARS - 1).trimEnd()}…`;
}

/** Rank `bank`'s rows against `query`. Pure: the bank is passed in. */
export function searchBankIn(
  bank: Bank,
  query: string,
  options: BankSearchOptions = {}
): BankSearchHit[] {
  // Every word of the query, for the whole-name match; only a query of nothing at all is refused here.
  const queryWords = allTokens(query);
  if (!queryWords.length) return [];
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_RESULTS, 1), MAX_RESULTS);
  const docs = documentsOf(bank);
  const unique = [...new Set(tokens(query))];

  // Per field: its average length, and each query term's inverse document frequency over the whole bank.
  const fieldNames = Object.keys(WEIGHTS) as Field[];
  const stats = Object.fromEntries(
    fieldNames.map((f) => {
      const avg = docs.reduce((n, d) => n + d.fields[f].length, 0) / Math.max(docs.length, 1);
      const idf = new Map(
        unique.map((t) => {
          const df = docs.filter((d) => d.fields[f].includes(t)).length;
          return [t, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5))];
        })
      );
      return [f, { avg: avg || 1, idf }];
    })
  ) as Record<Field, { avg: number; idf: Map<string, number> }>;

  const scored = docs
    .filter((d) => !options.kind || d.ref.kind === options.kind)
    .map((d) => {
      let score = 0;
      for (const f of fieldNames) {
        const field = d.fields[f];
        if (!field.length) continue;
        const { avg, idf } = stats[f];
        for (const t of unique) {
          const tf = field.filter((x) => x === t).length;
          if (!tf) continue;
          const norm = tf + K1 * (1 - B + (B * field.length) / avg);
          score += WEIGHTS[f] * (idf.get(t) ?? 0) * ((tf * (K1 + 1)) / norm);
        }
      }
      if (holdsWholeName(queryWords, d.nameTokens)) score += WHOLE_NAME_BONUS;
      return { d, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.d.ref.name.localeCompare(b.d.ref.name))
    .slice(0, limit);

  return scored.map(({ d, score }) => hitOf(d, query, score));
}

/** A row as a result: what the search returns, and what the tutor's tool returns for a row found by meaning. */
export function hitOf(d: BankDoc, query: string, score: number): BankSearchHit {
  return {
    ...d.ref,
    href: bankHref(d.ref.kind, d.ref.id),
    about: d.about,
    excerpt: excerptOf(d.prose, new Set(tokens(query))),
    related: d.related.slice(0, MAX_RELATED),
    score: Math.round(score * 100) / 100,
  };
}

/** Search the databank as it stands now. */
export async function searchBank(
  query: string,
  options: BankSearchOptions = {}
): Promise<BankSearchHit[]> {
  return searchBankIn(await loadBank(), query, options);
}
