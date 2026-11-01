/**
 * Researched patterns (`f-pattern-library` t-127 on): the patterns a research batch writes, and the seed that puts
 * them on their sounds. The method and the record kept per pattern are `.context/app/pattern-library.md`, Research
 * method.
 *
 * A batch is a data file under the seed's `data/patterns/`. Each pattern names the sounds it is for, and the seed puts
 * it on each one **behind** what the sound already has, never in front: a researched pattern becomes a sound's default
 * only once the owner has listened to it, by an admin's reorder (owner ruling, 2026-11-01). The rules the seed keeps,
 * each tested:
 *
 * - **A re-run writes nothing**, and **an empty batch writes nothing**.
 * - **An admin's pattern is never written**: one an admin has edited, or put at the head of a sound's list (its notes
 *   are that sound's riff now, so the seed changing them would split the pair).
 * - **Nothing is deleted or moved.** A pattern taken out of a batch file stays in the library and on its sounds.
 * - **A pattern whose sound or link is not there is skipped and reported**, not written, so the seed is safe on an
 *   empty catalogue. The batch's test checks every name against the seed data, so the seed only meets one an admin
 *   removed, or tables not seeded yet.
 */
import { z } from 'zod';
import type { LibraryPattern, Prisma } from '@prisma/client';
import { PatternSchema, PATTERN_VERSION, MIN_BPM, MAX_BPM } from '@/lib/app/sequencer/pattern';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
import { sameValue } from '@/lib/app/catalogue/seed';
import {
  DEFAULT_FIRST,
  PatternSourceSchema,
  PatternSourcesSchema,
  phraseOf,
  toJson,
  type LibraryDb,
} from '@/lib/app/patterns/library';

// ─── The batch file ──────────────────────────────────────────────────────────

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const Day = z.string().date();
const Bpm = z.number().int().min(MIN_BPM).max(MAX_BPM);

/**
 * What a researched pattern is inspired by, as a batch names it. A work's part is its place in the song's list in the
 * databank (`order`), since the seed data has no part ids.
 */
export const ResearchedInspirationSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('work'), songId: Slug, part: z.number().int().min(0).optional() })
    .strict(),
  z.object({ kind: z.literal('artist'), artistId: Slug }).strict(),
  z.object({ kind: z.literal('synth'), synthId: Slug }).strict(),
  z.object({ kind: z.literal('genre'), label: z.string().trim().min(1).max(120) }).strict(),
]);

/** A starting point that is not a source: a tab, a fan-made MIDI file, a tutorial (`pattern-library.md`, Order of trust). */
const LeadSchema = PatternSourceSchema.omit({ type: true });

/** What is kept with a pattern and never stored: the record a reader checks it against (Research method). */
export const ResearchRecordSchema = z
  .object({
    /** The work, as the record credits it. */
    work: z.string().trim().min(1).max(200),
    /** The part of the work, and which bars: "the synth bass under the verse, four bars". */
    part: z.string().trim().min(1).max(500),
    /** The original key and tempo, as far as they were found. */
    originalKey: z.string().trim().min(1).max(40).nullable(),
    originalBpm: z.number().positive().max(MAX_BPM).nullable(),
    /** Starting points used, which are not sources. */
    leads: z.array(LeadSchema).max(20),
    /** What was changed in reducing it, and why; and why the fidelity is what it is. */
    notes: z.string().trim().min(1).max(2000),
    /** When the owner listened to it against the record. Null until they have. */
    listenedAt: Day.nullable(),
  })
  .strict();

export const ResearchedPatternSchema = z
  .object({
    /** The seed's natural key: `researched:<artist>/<name>`. */
    key: z.string().regex(/^researched:[a-z0-9-]+\/[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(120),
    role: z.enum(PATTERN_ROLES),
    tempo: z.object({ min: Bpm, max: Bpm }).strict().nullable(),
    inspiredBy: ResearchedInspirationSchema,
    fidelity: z.enum(['transcribed', 'reconstructed', 'in_the_style_of']),
    sources: PatternSourcesSchema,
    pattern: PatternSchema,
    /** The sounds it is for, as `<synthId>/<slug>`. */
    sounds: z
      .array(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/))
      .min(1)
      .max(20),
    research: ResearchRecordSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!phraseOf(p.pattern).steps.length)
      ctx.addIssue({
        code: 'custom',
        path: ['pattern'],
        message: 'A library pattern plays at least one note on its first loop',
      });
    if (p.tempo && (p.pattern.bpm < p.tempo.min || p.pattern.bpm > p.tempo.max))
      ctx.addIssue({
        code: 'custom',
        path: ['tempo'],
        message: `The tempo range must include the ${p.pattern.bpm} bpm the pattern is written at`,
      });
    if (p.fidelity !== 'in_the_style_of') {
      if (p.inspiredBy.kind !== 'work')
        ctx.addIssue({
          code: 'custom',
          path: ['inspiredBy'],
          message: 'A transcribed or reconstructed pattern is inspired by the work it recreates',
        });
      if (!p.sources.length)
        ctx.addIssue({
          code: 'custom',
          path: ['sources'],
          message: 'A transcribed or reconstructed pattern lists its sources',
        });
    }
  });
export type ResearchedPattern = z.infer<typeof ResearchedPatternSchema>;

export const ResearchBatchSchema = z
  .object({
    /** The task that researched it: `t-127`. */
    task: z.string().regex(/^t-\d+$/),
    /** Who researched it: the agent and model, or the person. */
    researchedBy: z.string().trim().min(1).max(200),
    researchedAt: Day,
    patterns: z.array(ResearchedPatternSchema).max(200),
    /** Sounds the batch looked at and wrote no pattern for, each with why. */
    notRecreated: z
      .array(
        z
          .object({
            sound: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict()
      )
      .max(200),
  })
  .strict()
  .superRefine((b, ctx) => {
    const keys = new Set<string>();
    b.patterns.forEach((p, i) => {
      if (keys.has(p.key))
        ctx.addIssue({
          code: 'custom',
          path: ['patterns', i, 'key'],
          message: 'A key is used once',
        });
      keys.add(p.key);
    });
  });
export type ResearchBatch = z.infer<typeof ResearchBatchSchema>;

// ─── The seed ────────────────────────────────────────────────────────────────

/** What one sync did. */
export interface ResearchedSyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Patterns an admin has edited, or made a sound's default: left alone. */
  edited: number;
  /** Places made on a sound's list. */
  placed: number;
  /** Patterns not written, because a sound or a link they name is not there. */
  skipped: { key: string; reason: string }[];
}

type Row = Pick<
  LibraryPattern,
  | 'key'
  | 'name'
  | 'version'
  | 'role'
  | 'bpmMin'
  | 'bpmMax'
  | 'inspiration'
  | 'inspiredBy'
  | 'inspiredSongId'
  | 'inspiredPartId'
  | 'inspiredArtistId'
  | 'inspiredSynthId'
  | 'fidelity'
  | 'origin'
> & { pattern: Prisma.InputJsonValue; sources: Prisma.InputJsonValue };

/** The inspiration's columns, its label taken from the row it links to, or why the link leads to nothing. */
async function inspirationOf(db: LibraryDb, p: ResearchedPattern) {
  const none = {
    inspiredSongId: null,
    inspiredPartId: null,
    inspiredArtistId: null,
    inspiredSynthId: null,
  };
  const missing = (what: string) => ({ missing: `Inspired by names ${what}, which is not there` });
  const i = p.inspiredBy;
  switch (i.kind) {
    case 'work': {
      const song = await db.bankSong.findUnique({
        where: { id: i.songId },
        select: { title: true, parts: { select: { id: true, order: true } } },
      });
      if (!song) return missing(`the song ${i.songId}`);
      const part = i.part === undefined ? null : song.parts.find((x) => x.order === i.part);
      if (part === undefined) return missing(`part ${i.part} of ${i.songId}`);
      return {
        ...none,
        inspiration: 'work' as const,
        inspiredBy: song.title,
        inspiredSongId: i.songId,
        inspiredPartId: part?.id ?? null,
      };
    }
    case 'artist': {
      const artist = await db.bankArtist.findUnique({
        where: { id: i.artistId },
        select: { name: true },
      });
      if (!artist) return missing(`the artist ${i.artistId}`);
      return {
        ...none,
        inspiration: 'artist' as const,
        inspiredBy: artist.name,
        inspiredArtistId: i.artistId,
      };
    }
    case 'synth': {
      const synth = await db.synth.findUnique({ where: { id: i.synthId }, select: { name: true } });
      if (!synth) return missing(`the synth ${i.synthId}`);
      return {
        ...none,
        inspiration: 'synth' as const,
        inspiredBy: synth.name,
        inspiredSynthId: i.synthId,
      };
    }
    case 'genre':
      return { ...none, inspiration: 'genre' as const, inspiredBy: i.label };
  }
}

/**
 * The columns a researched pattern is stored as, or why it cannot be. Every batch pattern is _AI-generated_ (owner
 * ruling, 2026-10-31).
 */
async function planResearched(
  db: LibraryDb,
  p: ResearchedPattern
): Promise<Row | { missing: string }> {
  const inspiration = await inspirationOf(db, p);
  if ('missing' in inspiration) return inspiration;
  return {
    key: p.key,
    name: p.name,
    pattern: toJson(p.pattern),
    version: PATTERN_VERSION,
    role: p.role,
    bpmMin: p.tempo?.min ?? null,
    bpmMax: p.tempo?.max ?? null,
    fidelity: p.fidelity,
    sources: toJson(p.sources),
    origin: 'ai_generated',
    ...inspiration,
  };
}

/**
 * Put every batch pattern in the library, and on each of its sounds behind what the sound already lists. A pattern
 * that names a sound, song, part, artist or synth that is not there is skipped whole, with the reason.
 */
export async function syncResearchedPatterns(
  db: LibraryDb,
  batches: ResearchBatch[]
): Promise<ResearchedSyncCounts> {
  const counts: ResearchedSyncCounts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    edited: 0,
    placed: 0,
    skipped: [],
  };
  const patterns = batches.flatMap((b) => b.patterns);
  if (!patterns.length) return counts;

  const named = [...new Set(patterns.flatMap((p) => p.sounds))];
  const sounds = new Map(
    (
      await db.synthSound.findMany({
        where: {
          OR: named.map((s) => {
            const [synthId, slug] = s.split('/');
            return { synthId, slug };
          }),
        },
        select: {
          id: true,
          synthId: true,
          slug: true,
          patterns: { orderBy: DEFAULT_FIRST, select: { patternId: true, order: true } },
        },
      })
    ).map((s) => [`${s.synthId}/${s.slug}`, s])
  );
  const stored = new Map(
    (await db.libraryPattern.findMany({ where: { key: { in: patterns.map((p) => p.key) } } })).map(
      (p) => [p.key, p]
    )
  );
  // Any sound an admin made one of them the default of, the batch's own sounds or not.
  const heads = new Set(
    stored.size
      ? (
          await db.synthSound.findMany({
            where: {
              patterns: { some: { patternId: { in: [...stored.values()].map((p) => p.id) } } },
            },
            select: { patterns: { orderBy: DEFAULT_FIRST, take: 1, select: { patternId: true } } },
          })
        ).flatMap((s) => (s.patterns[0] ? [s.patterns[0].patternId] : []))
      : []
  );

  for (const p of patterns) {
    const lost = p.sounds.filter((s) => !sounds.has(s));
    if (lost.length) {
      counts.skipped.push({ key: p.key, reason: `Names ${lost.join(', ')}, not in the catalogue` });
      continue;
    }
    const mine = p.sounds.map((s) => sounds.get(s)!);
    const planned = await planResearched(db, p);
    if ('missing' in planned) {
      counts.skipped.push({ key: p.key, reason: planned.missing });
      continue;
    }
    const current = stored.get(p.key);
    let id: string;
    if (!current) {
      // A sound with an empty list would take it as its default (below), so a new pattern none of whose sounds has
      // its riff yet would sit in the library on no sound. It waits for the riff pass instead.
      if (!mine.some((sound) => sound.patterns.length)) {
        counts.skipped.push({ key: p.key, reason: 'No sound it names has its riff pattern yet' });
        continue;
      }
      id = (await db.libraryPattern.create({ data: planned })).id;
      counts.created++;
    } else {
      id = current.id;
      if (current.editedAt || heads.has(current.id)) counts.edited++;
      else if (
        Object.entries(planned).every(([k, v]) => sameValue(current[k as keyof LibraryPattern], v))
      )
        counts.unchanged++;
      else {
        await db.libraryPattern.update({ where: { id }, data: planned });
        counts.updated++;
      }
    }
    for (const sound of mine) {
      // A sound has its riff pattern by now (`005`'s first pass). One with an empty list would take this as its
      // default, so it is left for the riff pass to fill first.
      if (!sound.patterns.length || sound.patterns.some((l) => l.patternId === id)) continue;
      const order = sound.patterns.reduce((max, l) => Math.max(max, l.order), -1) + 1;
      await db.synthSoundPattern.create({ data: { soundId: sound.id, patternId: id, order } });
      sound.patterns.push({ patternId: id, order });
      counts.placed++;
    }
  }
  return counts;
}
