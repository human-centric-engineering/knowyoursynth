import { z } from 'zod';
import { searchBankByMeaning, type MeaningSearch } from '@/lib/app/bank/knowledge';
import { BANK_KINDS, loadBank } from '@/lib/app/bank/read';
import {
  documentsOf,
  hitOf,
  MAX_QUERY_LENGTH,
  searchBankIn,
  type BankDoc,
  type BankSearchHit,
} from '@/lib/app/bank/search';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/**
 * How many rows one search returns. Each is about 600 characters with its links, and the tool loop sends every result
 * again on each later step, so a handful keeps a search near the other tools' budgets. The best match is usually
 * first; a narrower query or a `kind` finds the rest.
 */
const RESULTS = 6;
/** Rows each layer offers the fusion: enough that a row ranked low by one and high by the other still reaches the six. */
const CANDIDATES = 12;
/** Reciprocal rank fusion's usual constant: it flattens the gap between a first and a fifth place. */
const RRF_K = 60;

/** Which search found a row: by its words (`lexical`), by what it means (`meaning`), or both. */
export type DatabankLayer = 'lexical' | 'meaning';

export type DatabankHit = Omit<BankSearchHit, 'score'> & { matchedBy: DatabankLayer[] };

const schema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    kind: z.enum(BANK_KINDS).optional(),
  })
  .strict();

type Args = z.infer<typeof schema>;

export interface DatabankSearchData {
  results: DatabankHit[];
  /** The layers that ran: `lexical` alone when the meaning-based layer is not set up or failed. */
  search: 'lexical+meaning' | 'lexical';
  /** Said when nothing matched, so the model knows the databank has no answer rather than guessing one. */
  note?: string;
}

/**
 * Fuse the two layers' rankings by reciprocal rank (each row scores the sum of `1 / (k + rank)` over the layers that
 * found it), one entry per row. A row both found outranks one only a single layer found at a similar place. Ties keep
 * the lexical order, which is the one that reads a row's name. Pure.
 */
export function fuseDatabankResults(
  docs: BankDoc[],
  query: string,
  lexical: BankSearchHit[],
  meaning: MeaningSearch,
  limit: number
): DatabankSearchData {
  const rows = new Map<
    string,
    { hit: BankSearchHit; score: number; first: number; matchedBy: DatabankLayer[] }
  >();
  lexical.forEach((hit, rank) => {
    rows.set(`${hit.kind}/${hit.id}`, {
      hit,
      score: 1 / (RRF_K + rank + 1),
      first: rank,
      matchedBy: ['lexical'],
    });
  });
  if (meaning.status === 'ok') {
    const byKey = new Map(docs.map((d) => [`${d.ref.kind}/${d.ref.id}`, d]));
    meaning.hits.forEach(({ ref }, rank) => {
      const key = `${ref.kind}/${ref.id}`;
      const score = 1 / (RRF_K + rank + 1);
      const row = rows.get(key);
      if (row) {
        row.score += score;
        row.matchedBy.push('meaning');
        return;
      }
      // A projected row the bank no longer has (the projection lags an admin's delete until the next reconcile).
      const doc = byKey.get(key);
      if (doc) {
        rows.set(key, {
          hit: hitOf(doc, query, 0),
          score,
          first: lexical.length + rank,
          matchedBy: ['meaning'],
        });
      }
    });
  }
  const results = [...rows.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .slice(0, limit)
    .map(({ hit: { score: _score, ...hit }, matchedBy }) => ({ ...hit, matchedBy }));
  return { results, search: meaning.status === 'ok' ? 'lexical+meaning' : 'lexical' };
}

/**
 * `search_databank`: the databank's artists, innovators, instruments and records (`f-tutor-knowledge`). Two layers: by
 * name and text (t-57, no AI provider), and by meaning over the rows projected into the knowledge base (t-58), fused by
 * rank. The second is skipped, and the result says so, when it is not set up. Reads, never writes, and reads no user.
 */
export class SearchDatabankCapability extends BaseCapability<Args, DatabankSearchData> {
  readonly slug = 'search_databank';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'search_databank',
    description:
      'Search the app\'s databank of checked facts: artists, innovators (designers and engineers), instruments and records, with what each played on or made. Use it first for any question about a person, a record, a band or a real instrument, before answering from memory. Search by names and key words ("Vangelis Blade Runner", "Minimoog"), or ask a question in plain words ("who pioneered modular synthesis?"); narrow with kind. Each result has its page\'s link (href), the rows it links to, and matchedBy: found by its words, its meaning or both. Read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Names and key words to look for.',
          minLength: 1,
          maxLength: MAX_QUERY_LENGTH,
        },
        kind: {
          type: 'string',
          enum: [...BANK_KINDS],
          description:
            'Only this kind of row: artists, makers (innovators), instruments or songs (records).',
        },
      },
      required: ['query'],
    },
  };

  async execute(
    args: Args,
    _context: CapabilityContext
  ): Promise<CapabilityResult<DatabankSearchData>> {
    const bank = await loadBank();
    const [lexical, meaning] = await Promise.all([
      Promise.resolve(searchBankIn(bank, args.query, { kind: args.kind, limit: CANDIDATES })),
      searchBankByMeaning(args.query, { kind: args.kind, limit: CANDIDATES }),
    ]);
    const data = fuseDatabankResults(documentsOf(bank), args.query, lexical, meaning, RESULTS);
    return this.success(
      data.results.length
        ? data
        : {
            ...data,
            note: 'Nothing in the databank matches. Try other names or fewer words; if it still finds nothing, the databank does not cover this.',
          }
    );
  }
}
