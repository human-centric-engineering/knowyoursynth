/**
 * The pattern library (`f-pattern-library` t-122): patterns in their own table, and each sound's ordered list of them.
 * The design is `.context/app/pattern-library.md`.
 *
 * A sound's riff (`SynthSound.phrase`) is kept, and is always its default pattern's notes: the first of its list,
 * compiled for its first loop. Every reader of a sound's riff (the panel, the probe, lessons, the tutor, sharing, the
 * content template) reads that one column, so none of them changed. What keeps the two together, each tested:
 *
 * - **A sound's riff is its first pattern.** Every sound gets a library pattern made from its riff by `importPhrase`,
 *   keyed `riff:<synthId>/<slug>`, at the head of its list ({@link syncRiffPatterns}). The seed, a new sound and an
 *   upload all go through it.
 * - **The riff pattern follows the riff while nobody has edited it.** An unedited riff pattern that is still its
 *   sound's default is rewritten from the sound's riff whenever the two differ, so a changed seed file reaches both.
 * - **Whatever an admin does to a default marks the sound edited** ({@link syncSoundPhrases}): an edit to the
 *   pattern, or a new pattern at the head of the list. The riff is rewritten to the new notes where they differ, and
 *   the sound is marked edited even where they do not, so the seed and an upload leave the pair alone, as they leave
 *   any admin's edit. A riff already holding the pattern's notes is not rewritten, so a re-run writes nothing.
 * - **A default plays whole as a riff** ({@link riffProblem}). A riff has one part and loops at its last note's end,
 *   so a pattern with a second part in its chain, or rests after its last note, cannot be a sound's default.
 * - **Nothing is deleted.** A pattern stays in the library, and in every list it is on, whatever happens to it.
 */
import { z } from 'zod';
import type { LibraryPattern, PatternInspiration, Prisma } from '@prisma/client';
import type { Phrase } from '@/lib/app/synths/contract';
import { importPhrase, phraseBeats } from '@/lib/app/sequencer/import';
import { PresetSchema } from '@/lib/app/synths/validate';
import { PATTERN_VERSION, PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { sameValue } from '@/lib/app/catalogue/seed';
import {
  defaultRole,
  firstLoop,
  patternFacts,
  type PatternFacts,
} from '@/lib/app/patterns/library-facts';

type Json = Prisma.InputJsonValue;

/** The tables the library reads and writes, from a transaction or the seed's client alike. */
export type LibraryDb = Pick<
  Prisma.TransactionClient,
  | 'synth'
  | 'synthSound'
  | 'libraryPattern'
  | 'synthSoundPattern'
  | 'bankArtist'
  | 'bankMaker'
  | 'bankSong'
>;

/** A copy typed as JSON for a Prisma `Json` column. */
export const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** Where a researched pattern's notes came from, in the design's order of trust. */
export const PATTERN_SOURCE_TYPES = [
  'score',
  'stems',
  'isolated_part',
  'interview',
  'gear_writeup',
  'video',
  'transcription',
  'by_ear',
] as const;

/** One source for a pattern. The citation is kept; the source itself never is (`pattern-library.md`, Sources). */
export const PatternSourceSchema = z
  .object({
    type: z.enum(PATTERN_SOURCE_TYPES),
    /** Author, title, publisher or site, and date: enough to find it again. */
    citation: z.string().trim().min(1).max(500),
    url: z.string().url().max(2000).optional(),
    /** When it was checked, `YYYY-MM-DD`. */
    checkedAt: z.string().date(),
  })
  .strict();
export type PatternSource = z.infer<typeof PatternSourceSchema>;

export const PatternSourcesSchema = z.array(PatternSourceSchema).max(20);

/** The key of the pattern made from a sound's own riff. */
export const riffKey = (synthId: string, slug: string): string => `riff:${synthId}/${slug}`;

/** Starts and lengths are kept to a millionth of a beat, so a compiled riff does not carry float noise. */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/** A pattern's first loop as a riff: what a sound whose default it is plays. */
export function phraseOf(pattern: Pattern): Phrase {
  return {
    bpm: pattern.bpm,
    loop: pattern.loop,
    steps: firstLoop(pattern).notes.map(([beat, note, len, velocity]) =>
      velocity === undefined
        ? [tidy(beat), note, tidy(len)]
        : [tidy(beat), note, tidy(len), velocity]
    ),
  };
}

/**
 * Why a pattern cannot be a sound's default, or `null` when it can: the riff it becomes must play it whole. A riff
 * has one part, plays at least one note, and loops where its last note ends.
 */
export function riffProblem(pattern: Pattern): string | null {
  if (new Set(pattern.chain).size > 1)
    return 'A sound plays its default as a riff, which has one part: a chain of two parts cannot be a default';
  // A riff is the first loop, frozen: anything that makes one loop differ from the next is lost.
  if (!['forward', 'reverse'].includes(pattern.direction))
    return 'A sound plays its default as a riff, the same every loop: a default plays forward or in reverse';
  const steps = pattern.parts.flatMap((p) => p.steps);
  if (steps.some((s) => s.probability !== undefined || s.condition !== undefined))
    return 'A sound plays its default as a riff, the same every loop: a default has no probability or conditions';
  if (pattern.lanes?.length)
    return 'A sound plays its default as a riff, which moves no controls: a default has no mod lanes';
  const riff = phraseOf(pattern);
  if (!riff.steps.length) return 'A default plays at least one note on its first loop';
  // The engine loops a riff at its last note's end, rounded up to a whole beat.
  if (phraseBeats(riff) !== firstLoop(pattern).beats)
    return 'A sound plays its default as a riff, which loops where its last note ends: a default cannot end in rests';
  return null;
}

/** A riff, as a sound stores it. */
export const PhraseSchema = PresetSchema.shape.phrase;

/** Whether a sound's riff already plays this pattern: as written, or as the pattern was imported from it. */
function riffPlays(riff: unknown, pattern: Pattern): boolean {
  if (sameValue(riff, phraseOf(pattern))) return true;
  const phrase = PhraseSchema.safeParse(riff);
  if (!phrase.success) return false;
  try {
    return sameValue(importPhrase(phrase.data), pattern);
  } catch {
    return false;
  }
}

// ─── Inspired by, for a riff ─────────────────────────────────────────────────

/** What the riffs' Inspired by is read against: the databank's artists, and the names of synths and their makers. */
export interface InspirationContext {
  /** Lowercased artist name → artist. */
  artists: Map<string, { id: string; name: string }>;
  /** Lowercased names that mean a synth or a maker rather than a player: "oberheim sem", "behringer". */
  synthWords: Set<string>;
  /** Catalogue synth id → name. */
  synths: Map<string, string>;
}

/** Credits that name nobody: the riff is credited to the synth it was written for until someone names a player. */
const NAMES_NOBODY = ['classic technique', 'various'];

export async function loadInspirationContext(db: LibraryDb): Promise<InspirationContext> {
  const [artists, synths, makers] = await Promise.all([
    db.bankArtist.findMany({ select: { id: true, name: true } }),
    db.synth.findMany({ select: { id: true, name: true, maker: true } }),
    db.bankMaker.findMany({ select: { name: true } }),
  ]);
  const synthWords = new Set<string>(NAMES_NOBODY);
  for (const s of synths)
    for (const w of [s.name, s.maker, `${s.maker} ${s.name}`]) synthWords.add(w.toLowerCase());
  for (const m of makers) synthWords.add(m.name.toLowerCase());
  return {
    artists: new Map(artists.map((a) => [a.name.trim().toLowerCase(), a])),
    synthWords,
    synths: new Map(synths.map((s) => [s.id, s.name])),
  };
}

type Inspiration = Pick<
  LibraryPattern,
  'inspiration' | 'inspiredBy' | 'inspiredArtistId' | 'inspiredSynthId'
>;

/**
 * A riff's Inspired by, from its sound's credit (`pattern-library.md`, Reviewing the current riffs): a databank artist
 * links to them; a synth, a maker or nobody is the synth the sound was written for; anything else is a genre.
 */
export function riffInspiration(
  sound: { synthId: string; artist: string },
  ctx: InspirationContext
): Inspiration {
  const credit = sound.artist.trim();
  const artist = ctx.artists.get(credit.toLowerCase());
  if (artist)
    return {
      inspiration: 'artist',
      inspiredBy: artist.name,
      inspiredArtistId: artist.id,
      inspiredSynthId: null,
    };
  if (!credit || ctx.synthWords.has(credit.toLowerCase()))
    return {
      inspiration: 'synth',
      inspiredBy: ctx.synths.get(sound.synthId) ?? sound.synthId,
      inspiredArtistId: null,
      inspiredSynthId: sound.synthId,
    };
  return {
    inspiration: 'genre',
    inspiredBy: credit,
    inspiredArtistId: null,
    inspiredSynthId: null,
  };
}

/** The columns of the pattern made from a sound's riff: what the seed plans for it. */
export interface RiffPatternRow extends Inspiration {
  key: string;
  name: string;
  pattern: Json;
  version: number;
  role: LibraryPattern['role'];
  fidelity: 'in_the_style_of';
  origin: 'ai_generated';
}

/**
 * The library pattern a sound's riff becomes: its notes through `importPhrase`, the role the default role rule gives
 * them, _In the style of_ (no riff was researched), and _AI-generated_ (owner ruling, 2026-10-31). Pure.
 */
export function planRiffPattern(
  sound: { synthId: string; slug: string; name: string; artist: string; phrase: Phrase },
  ctx: InspirationContext
): RiffPatternRow {
  const pattern = importPhrase(sound.phrase);
  const { notes, beats } = firstLoop(pattern);
  return {
    key: riffKey(sound.synthId, sound.slug),
    name: sound.name,
    pattern: toJson(pattern),
    version: PATTERN_VERSION,
    role: defaultRole(notes, beats),
    fidelity: 'in_the_style_of',
    origin: 'ai_generated',
    ...riffInspiration(sound, ctx),
  };
}

// ─── Keeping sounds and patterns together ────────────────────────────────────

/** What one sync did to the riff patterns. */
export interface RiffSyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Riff patterns an admin has edited, or that are no longer their sound's default: left alone. */
  edited: number;
  /** Other sounds an admin put an updated riff pattern at the head of, whose riffs followed it. */
  rewritten: RewrittenRiff[];
}

/** The order a sound's list is read in: its default first. Every read of "the default" uses it. */
export const DEFAULT_FIRST: Prisma.SynthSoundPatternOrderByWithRelationInput[] = [
  { order: 'asc' },
  { patternId: 'asc' },
];

/**
 * Give each sound its riff pattern, and bring unedited riff patterns in line with their sounds' riffs. `where` picks
 * the sounds; the seed passes none, for all of them. A new riff pattern goes at the head of an empty list and at the
 * end of one that has patterns already, so it never takes a default an admin chose.
 *
 * Throws when a riff cannot be a pattern (`importPhrase`): none in the library is, and a caller writing a new riff
 * checks it first.
 */
export async function syncRiffPatterns(
  db: LibraryDb,
  where: Prisma.SynthSoundWhereInput = {},
  { ctx, markEdited = false }: { ctx?: InspirationContext; markEdited?: boolean } = {}
): Promise<RiffSyncCounts> {
  const counts: RiffSyncCounts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    edited: 0,
    rewritten: [],
  };
  const sounds = await db.synthSound.findMany({
    where,
    select: {
      id: true,
      synthId: true,
      slug: true,
      name: true,
      artist: true,
      phrase: true,
      patterns: { orderBy: DEFAULT_FIRST, select: { patternId: true, order: true } },
    },
  });
  if (!sounds.length) return counts;
  const context = ctx ?? (await loadInspirationContext(db));
  const stored = new Map(
    (
      await db.libraryPattern.findMany({
        where: { key: { in: sounds.map((s) => riffKey(s.synthId, s.slug)) } },
      })
    ).map((p) => [p.key, p])
  );

  const changed: string[] = [];
  for (const sound of sounds) {
    // Every write checks a sound's riff, so a riff that does not parse was changed by hand: the reader leaves that
    // sound out, and so does this.
    const phrase = PhraseSchema.safeParse(sound.phrase);
    if (!phrase.success) continue;
    const planned = planRiffPattern({ ...sound, phrase: phrase.data }, context);
    const current = stored.get(planned.key);
    if (!current) {
      const last = sound.patterns.reduce((max, l) => Math.max(max, l.order), -1);
      // One statement, so a pattern is never left without its place on its sound.
      await db.libraryPattern.create({
        data: { ...planned, sounds: { create: { soundId: sound.id, order: last + 1 } } },
      });
      counts.created++;
    } else if (current.editedAt || sound.patterns[0]?.patternId !== current.id) {
      counts.edited++;
    } else if (
      Object.entries(planned).every(([k, v]) => sameValue(current[k as keyof LibraryPattern], v))
    ) {
      counts.unchanged++;
    } else {
      await db.libraryPattern.update({ where: { id: current.id }, data: planned });
      changed.push(current.id);
      counts.updated++;
    }
  }
  // A riff pattern an admin also put at the head of another sound's list: that sound's riff follows it. Such a sound
  // is already edited (putting another sound's pattern first marked it), so the seed's pass changes no ownership.
  // One read for all of them. A riff pattern's own sound already plays it, so it is not rewritten.
  if (changed.length)
    counts.rewritten = await syncSoundPhrases(
      db,
      { patterns: { some: { patternId: { in: changed } } } },
      { heads: changed, markEdited, onlyRewritten: true }
    );
  return counts;
}

/** A sound whose riff was rewritten to its default's notes, before and after. */
export interface RewrittenRiff {
  synthId: string;
  slug: string;
  name: string;
  before: unknown;
  after: Phrase;
}

/**
 * Rewrite each sound's riff as its default pattern's notes, where it does not already play them. `head` limits it to
 * the sounds that pattern is the default of. `markEdited`, which every admin write passes, marks each such sound as an
 * admin's whether or not its riff changed: the seed and an upload would otherwise write a riff the default no longer
 * matches. Returns each sound whose riff changed, before and after, for the caller to audit.
 */
export async function syncSoundPhrases(
  db: LibraryDb,
  where: Prisma.SynthSoundWhereInput,
  {
    markEdited = false,
    heads,
    onlyRewritten = false,
  }: { markEdited?: boolean; heads?: string[]; onlyRewritten?: boolean } = {}
): Promise<RewrittenRiff[]> {
  const sounds = await db.synthSound.findMany({
    where,
    select: {
      id: true,
      synthId: true,
      slug: true,
      name: true,
      phrase: true,
      editedAt: true,
      patterns: {
        orderBy: DEFAULT_FIRST,
        take: 1,
        select: { patternId: true, pattern: { select: { pattern: true } } },
      },
    },
  });
  const rewritten: RewrittenRiff[] = [];
  for (const sound of sounds) {
    const first = sound.patterns[0];
    if (!first || (heads !== undefined && !heads.includes(first.patternId))) continue;
    // `onlyRewritten` marks only the sounds whose riff changed: a riff pattern's own sound already plays it.
    const mark = markEdited && !sound.editedAt && !onlyRewritten ? { editedAt: new Date() } : {};
    const parsed = PatternSchema.safeParse(first.pattern.pattern);
    // Checked on every write; a row changed by hand is left for the admin page to show.
    if (!parsed.success || riffPlays(sound.phrase, parsed.data)) {
      if ('editedAt' in mark) await db.synthSound.update({ where: { id: sound.id }, data: mark });
      continue;
    }
    const after = phraseOf(parsed.data);
    await db.synthSound.update({
      where: { id: sound.id },
      data: {
        phrase: toJson(after),
        ...(markEdited && !sound.editedAt ? { editedAt: new Date() } : {}),
      },
    });
    rewritten.push({
      synthId: sound.synthId,
      slug: sound.slug,
      name: sound.name,
      before: sound.phrase,
      after,
    });
  }
  return rewritten;
}

/** A library pattern an admin write changed, before and after, for the caller to audit. */
export interface PatternChange {
  id: string;
  name: string;
  /** The columns that changed, as they were and as they are. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** A sound's default pattern, and whether it is the sound's own riff pattern. */
async function headOf(db: LibraryDb, soundId: string) {
  const sound = await db.synthSound.findUniqueOrThrow({
    where: { id: soundId },
    select: {
      synthId: true,
      slug: true,
      phrase: true,
      patterns: { orderBy: DEFAULT_FIRST, take: 1, select: { pattern: true } },
    },
  });
  const head = sound.patterns[0]?.pattern ?? null;
  return { sound, head, own: head?.key === riffKey(sound.synthId, sound.slug) };
}

/**
 * Whether a sound's riff leads its default, and so may be edited directly: the default is the sound's own riff
 * pattern, still exactly the riff's import, and _In the style of_ (an admin may have changed its name or role, not
 * its notes, anything that plays them, or the claim that they come from a source). Any other
 * default is a pattern in its own right (an admin's, another sound's, or this one's with notes an admin changed),
 * and is changed as a pattern, never by flattening a riff into it.
 */
export async function riffLeadsDefault(db: LibraryDb, soundId: string): Promise<boolean> {
  const { sound, head, own } = await headOf(db, soundId);
  if (!head) return true;
  if (!own) return false;
  if (!head.editedAt) return true;
  // A transcribed or reconstructed pattern names its sources for these notes; a new riff would not be them.
  if (head.fidelity !== 'in_the_style_of') return false;
  // Exactly what the riff imports to, so a new riff replaces nothing the riff did not already say: no swing, scale,
  // second part or anything else an admin added. Comparing notes would not do, since the riff is always rewritten
  // to its default's notes.
  const phrase = PhraseSchema.safeParse(sound.phrase);
  if (!phrase.success) return false;
  try {
    return sameValue(importPhrase(phrase.data), head.pattern);
  } catch {
    return false;
  }
}

/**
 * After an admin changed a sound whose riff leads its default ({@link riffLeadsDefault}), bring its riff pattern
 * along: re-made as the seed would while nobody has edited it, or, once an admin has, given the new notes and nothing
 * else. Returns every other sound whose riff followed, marked edited, for the caller to audit.
 */
export async function followSoundRiff(db: LibraryDb, soundId: string): Promise<RewrittenRiff[]> {
  const { sound, head, own } = await headOf(db, soundId);
  if (!head || !own || !head.editedAt) {
    const { rewritten } = await syncRiffPatterns(db, { id: soundId }, { markEdited: true });
    return rewritten;
  }
  const phrase = PhraseSchema.parse(sound.phrase);
  const current = PatternSchema.safeParse(head.pattern);
  if (current.success && riffPlays(phrase, current.data)) return [];
  // A tempo range the new riff's bpm falls outside of no longer says anything about it.
  const outside =
    head.bpmMin !== null &&
    head.bpmMax !== null &&
    (phrase.bpm < head.bpmMin || phrase.bpm > head.bpmMax);
  await db.libraryPattern.update({
    where: { id: head.id },
    data: {
      pattern: toJson(importPhrase(phrase)),
      version: PATTERN_VERSION,
      ...(outside ? { bpmMin: null, bpmMax: null } : {}),
    },
  });
  return syncSoundPhrases(
    db,
    { id: { not: soundId }, patterns: { some: { patternId: head.id } } },
    { heads: [head.id], markEdited: true }
  );
}

// ─── The view every read serves ──────────────────────────────────────────────

/** A library pattern as the API serves it. */
export interface LibraryPatternView {
  id: string;
  key: string;
  name: string;
  pattern: Pattern;
  role: LibraryPattern['role'];
  /** The tempo range it still works in; null when only its own bpm is known to. */
  tempo: { min: number; max: number } | null;
  inspiredBy: {
    kind: PatternInspiration;
    /** What to show: the work's title, the artist's or synth's name, or the genre. */
    label: string;
    songId: string | null;
    partId: string | null;
    artistId: string | null;
    synthId: string | null;
  };
  fidelity: LibraryPattern['fidelity'];
  sources: PatternSource[];
  origin: LibraryPattern['origin'];
  facts: PatternFacts;
}

/**
 * A stored row as the API serves it, or `null` when its pattern or sources no longer parse: every write checks both,
 * so that is a row changed by hand, which the reader leaves out rather than send to a sequencer that cannot play it.
 */
export function toView(row: LibraryPattern): LibraryPatternView | null {
  const pattern = PatternSchema.safeParse(row.pattern);
  const sources = PatternSourcesSchema.safeParse(row.sources);
  if (!pattern.success || !sources.success) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    pattern: pattern.data,
    role: row.role,
    tempo: row.bpmMin !== null && row.bpmMax !== null ? { min: row.bpmMin, max: row.bpmMax } : null,
    inspiredBy: {
      kind: row.inspiration,
      label: row.inspiredBy,
      songId: row.inspiredSongId,
      partId: row.inspiredPartId,
      artistId: row.inspiredArtistId,
      synthId: row.inspiredSynthId,
    },
    fidelity: row.fidelity,
    sources: sources.data,
    origin: row.origin,
    facts: patternFacts(pattern.data),
  };
}
