/**
 * Admin edits to the pattern library (D2, `f-pattern-library` t-122): add a pattern, change one, and set a sound's
 * list. The catalogue's rules hold here too (`lib/app/catalogue/edit.ts`), each tested:
 *
 * - **An edit is the admin's.** A changed pattern gets `editedAt`, and the seed never writes it again. An edit that
 *   changes nothing writes nothing.
 * - **A sound's riff follows its default.** Changing a pattern rewrites the riff of every sound it is the default of,
 *   and a new order for a sound's list rewrites that sound's riff when its default changed (`syncSoundPhrases`). Those
 *   sounds are marked edited, so the seed leaves them alone.
 * - **Nothing is removed.** A sound's new list must hold every pattern it had; a pattern is never deleted. Demoting a
 *   riff is putting another pattern first (`pattern-library.md`, Reviewing the current riffs).
 * - **Honest labels.** A _Transcribed_ or _Reconstructed_ pattern recreates a part of a work, so it must link to the
 *   work in the databank and list its sources (`pattern-library.md`, Provenance).
 *
 * Each write returns what it changed, before and after, for the route to audit.
 */
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { LibraryPattern, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  MAX_BPM,
  MIN_BPM,
  PATTERN_VERSION,
  PatternSchema,
  type Pattern,
} from '@/lib/app/sequencer/pattern';
import { sameValue } from '@/lib/app/catalogue/seed';
import { lockSynth } from '@/lib/app/catalogue/edit';
import { getSynthDef } from '@/lib/app/synths/defs';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import {
  DEFAULT_FIRST,
  PatternSourcesSchema,
  phraseOf,
  riffProblem,
  toJson,
  syncSoundPhrases,
  toView,
  type LibraryDb,
  type LibraryPatternView,
  type PatternChange,
  type RewrittenRiff,
} from '@/lib/app/patterns/library';

function refuse(message: string, problems: { path: string; message: string }[]): never {
  throw new ValidationError(message, { errors: problems });
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

const Id = z.string().trim().min(1).max(64);

/** What a pattern is inspired by. A linked kind takes its label from the row it links to. */
export const InspiredBySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work'), songId: Id, partId: Id.nullable().optional() }).strict(),
  z.object({ kind: z.literal('artist'), artistId: Id }).strict(),
  z.object({ kind: z.literal('synth'), synthId: Id }).strict(),
  z.object({ kind: z.literal('genre'), label: z.string().trim().min(1).max(120) }).strict(),
]);
export type InspiredByInput = z.infer<typeof InspiredBySchema>;

const Bpm = z.number().int().min(MIN_BPM).max(MAX_BPM);
const TempoSchema = z
  .object({ min: Bpm, max: Bpm })
  .strict()
  .refine((t) => t.min <= t.max, { message: 'The slowest tempo is above the fastest' })
  .nullable();

const fields = {
  name: z.string().trim().min(1).max(120),
  pattern: PatternSchema,
  role: z.enum(PATTERN_ROLES),
  tempo: TempoSchema,
  inspiredBy: InspiredBySchema,
  fidelity: z.enum(['transcribed', 'reconstructed', 'in_the_style_of']),
  sources: PatternSourcesSchema,
  origin: z.enum(['ai_generated', 'human_authored', 'user_contributed']),
};

/** A new pattern. Tempo and sources may be left out; origin defaults to _Human-authored_, as an admin wrote it. */
export const LibraryPatternCreateSchema = z
  .object({
    ...fields,
    tempo: fields.tempo.default(null),
    sources: fields.sources.default([]),
    origin: fields.origin.default('human_authored'),
  })
  .strict();
export type LibraryPatternCreate = z.infer<typeof LibraryPatternCreateSchema>;

/** A change to a pattern: any of its fields but its key. */
export const LibraryPatternEditSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type LibraryPatternEdit = z.infer<typeof LibraryPatternEditSchema>;

/** A sound's patterns in their new order, the default first. */
export const SoundPatternsSchema = z.object({ patternIds: z.array(Id).min(1).max(100) }).strict();

// ─── Checks ──────────────────────────────────────────────────────────────────

/** A pattern's columns, its two JSON columns as plain values. */
type Columns = Omit<
  Pick<
    LibraryPattern,
    | 'name'
    | 'pattern'
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
    | 'sources'
    | 'origin'
  >,
  'pattern' | 'sources'
> & { pattern: unknown; sources: unknown };

/** The inspiration's columns, its label read from the row it links to. Refuses a link to nothing. */
async function inspirationColumns(db: LibraryDb, input: InspiredByInput) {
  const none = {
    inspiredSongId: null,
    inspiredPartId: null,
    inspiredArtistId: null,
    inspiredSynthId: null,
  };
  const missing = (path: string, what: string): never =>
    refuse('Inspired by names something that is not there', [
      { path: `inspiredBy.${path}`, message: `No ${what} has that id` },
    ]);
  switch (input.kind) {
    case 'work': {
      const song = await db.bankSong.findUnique({
        where: { id: input.songId },
        select: { title: true, parts: { select: { id: true } } },
      });
      if (!song) return missing('songId', 'song in the databank');
      const partId = input.partId ?? null;
      if (partId && !song.parts.some((p) => p.id === partId))
        return missing('partId', 'part of that song');
      return {
        ...none,
        inspiration: 'work' as const,
        inspiredBy: song.title,
        inspiredSongId: input.songId,
        inspiredPartId: partId,
      };
    }
    case 'artist': {
      const artist = await db.bankArtist.findUnique({
        where: { id: input.artistId },
        select: { name: true },
      });
      if (!artist) return missing('artistId', 'artist in the databank');
      return {
        ...none,
        inspiration: 'artist' as const,
        inspiredBy: artist.name,
        inspiredArtistId: input.artistId,
      };
    }
    case 'synth': {
      const synth = await db.synth.findUnique({
        where: { id: input.synthId },
        select: { name: true },
      });
      if (!synth) return missing('synthId', 'synth in the catalogue');
      return {
        ...none,
        inspiration: 'synth' as const,
        inspiredBy: synth.name,
        inspiredSynthId: input.synthId,
      };
    }
    case 'genre':
      return { ...none, inspiration: 'genre' as const, inspiredBy: input.label };
  }
}

/** The rules a whole pattern must keep, checked once an edit is merged into it. */
function checkWhole(c: Columns) {
  const problems: { path: string; message: string }[] = [];
  const parsed = PatternSchema.safeParse(c.pattern);
  // Only a stored row changed by hand fails here: a pattern in the request was parsed already.
  if (!parsed.success)
    refuse('The stored pattern no longer parses', [
      {
        path: 'pattern',
        message: 'The stored pattern no longer parses: send a whole pattern to replace it',
      },
    ]);
  const pattern = parsed.data;
  if (!phraseOf(pattern).steps.length)
    problems.push({
      path: 'pattern',
      message: 'A library pattern plays at least one note on its first loop',
    });
  if (c.bpmMin !== null && c.bpmMax !== null && (pattern.bpm < c.bpmMin || pattern.bpm > c.bpmMax))
    problems.push({
      path: 'tempo',
      message: `The tempo range must include the ${pattern.bpm} bpm the pattern is written at`,
    });
  if (c.fidelity !== 'in_the_style_of') {
    if (c.inspiration !== 'work')
      problems.push({
        path: 'inspiredBy',
        message:
          'A transcribed or reconstructed pattern recreates a part of a work, so it is inspired by that work',
      });
    if (!PatternSourcesSchema.parse(c.sources).length)
      problems.push({
        path: 'sources',
        message: 'A transcribed or reconstructed pattern lists its sources',
      });
  }
  if (problems.length) refuse('The pattern cannot be saved as it is', problems);
}

/** Whether any sound plays this pattern as its default. */
async function isADefault(db: LibraryDb, id: string): Promise<boolean> {
  const sounds = await db.synthSound.findMany({
    where: { patterns: { some: { patternId: id } } },
    select: { patterns: { orderBy: DEFAULT_FIRST, take: 1, select: { patternId: true } } },
  });
  return sounds.some((s) => s.patterns[0]?.patternId === id);
}

/** Refuse a pattern that cannot be a sound's default, because its riff would not play it whole (`riffProblem`). */
function checkDefault(pattern: Pattern, path: string) {
  const why = riffProblem(pattern);
  if (why) refuse('The pattern cannot be a sound’s default', [{ path, message: why }]);
}

/** The columns an input sets, inspiration resolved. */
async function columnsOf(db: LibraryDb, input: LibraryPatternEdit): Promise<Partial<Columns>> {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.pattern !== undefined && { pattern: input.pattern }),
    ...(input.role !== undefined && { role: input.role }),
    ...(input.tempo !== undefined && {
      bpmMin: input.tempo?.min ?? null,
      bpmMax: input.tempo?.max ?? null,
    }),
    ...(input.inspiredBy !== undefined && (await inspirationColumns(db, input.inspiredBy))),
    ...(input.fidelity !== undefined && { fidelity: input.fidelity }),
    ...(input.sources !== undefined && { sources: input.sources }),
    ...(input.origin !== undefined && { origin: input.origin }),
  };
}

const pick = (row: LibraryPattern): Columns => ({
  name: row.name,
  pattern: row.pattern,
  role: row.role,
  bpmMin: row.bpmMin,
  bpmMax: row.bpmMax,
  inspiration: row.inspiration,
  inspiredBy: row.inspiredBy,
  inspiredSongId: row.inspiredSongId,
  inspiredPartId: row.inspiredPartId,
  inspiredArtistId: row.inspiredArtistId,
  inspiredSynthId: row.inspiredSynthId,
  fidelity: row.fidelity,
  sources: row.sources,
  origin: row.origin,
});

// ─── Reads ───────────────────────────────────────────────────────────────────

/** A pattern as admin sees it: the public view, its key, whether an admin has edited it, and the sounds listing it. */
export interface AdminLibraryPattern extends LibraryPatternView {
  editedAt: string | null;
  sounds: { synthId: string; slug: string; name: string; order: number; isDefault: boolean }[];
}

/** A pattern as admin reads it, or what is wrong with a stored one that no longer parses. */
export type AdminLibraryRow =
  AdminLibraryPattern | { id: string; key: string; name: string; problem: string };

/** A stored row as admin sees it, or a placeholder naming the problem when it no longer parses. */
function adminView(
  row: LibraryPattern & {
    sounds: {
      order: number;
      sound: {
        synthId: string;
        slug: string;
        name: string;
        patterns: { patternId: string }[];
      };
    }[];
  }
): AdminLibraryRow {
  const view = toView(row);
  if (!view)
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      problem: 'The stored pattern or its sources no longer parse',
    };
  return {
    ...view,
    editedAt: row.editedAt?.toISOString() ?? null,
    sounds: row.sounds.map(({ order, sound }) => ({
      synthId: sound.synthId,
      slug: sound.slug,
      name: sound.name,
      order,
      isDefault: sound.patterns[0]?.patternId === row.id,
    })),
  };
}

const withSounds = {
  sounds: {
    orderBy: [{ sound: { synthId: 'asc' } }, { sound: { slug: 'asc' } }],
    select: {
      order: true,
      sound: {
        select: {
          synthId: true,
          slug: true,
          name: true,
          patterns: {
            orderBy: DEFAULT_FIRST,
            take: 1,
            select: { patternId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.LibraryPatternInclude;

export const AdminLibraryQuerySchema = z.object({
  role: z.enum(PATTERN_ROLES).optional(),
  /** Matches a pattern's name or Inspired by. */
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminLibraryQuery = z.infer<typeof AdminLibraryQuerySchema>;

/** A page of every library pattern, hidden synths' included, by name. */
export async function listAdminLibraryPatterns(
  query: AdminLibraryQuery
): Promise<{ patterns: AdminLibraryRow[]; total: number }> {
  const where: Prisma.LibraryPatternWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.q && {
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { inspiredBy: { contains: query.q, mode: 'insensitive' } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.libraryPattern.findMany({
      where,
      include: withSounds,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.libraryPattern.count({ where }),
  ]);
  return { patterns: rows.map(adminView), total };
}

/** One library pattern, or `null`. */
export async function getAdminLibraryPattern(id: string): Promise<AdminLibraryRow | null> {
  const row = await prisma.libraryPattern.findUnique({ where: { id }, include: withSounds });
  return row && adminView(row);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Add a pattern to the library, on no sound yet. */
export async function createLibraryPattern(input: LibraryPatternCreate): Promise<AdminLibraryRow> {
  return prisma.$transaction(async (tx) => {
    const columns: Columns = {
      name: input.name,
      pattern: input.pattern,
      role: input.role,
      bpmMin: input.tempo?.min ?? null,
      bpmMax: input.tempo?.max ?? null,
      ...(await inspirationColumns(tx, input.inspiredBy)),
      fidelity: input.fidelity,
      sources: input.sources,
      origin: input.origin,
    };
    checkWhole(columns);
    const row = await tx.libraryPattern.create({
      data: {
        ...columns,
        pattern: toJson(columns.pattern),
        sources: toJson(columns.sources),
        // An admin's pattern is not one the seed plans, so its key only has to be unique.
        key: `admin:${randomUUID()}`,
        version: PATTERN_VERSION,
        editedAt: new Date(),
      },
      include: withSounds,
    });
    return adminView(row);
  });
}

/**
 * Change a pattern: the edit is merged into the stored pattern and the whole is checked before anything is written.
 * Returns the pattern before and after, and every sound whose riff changed with it.
 */
export async function editLibraryPattern(
  id: string,
  input: LibraryPatternEdit
): Promise<{ change: PatternChange | null; sounds: RewrittenRiff[] }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.libraryPattern.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Pattern not found');
    const before = pick(row);
    const after = { ...before, ...(await columnsOf(tx, input)) };
    checkWhole(after);
    // An edit that changes nothing is not an edit: the row stays the seed's.
    if (sameValue(after, before)) return { change: null, sounds: [] };
    if (await isADefault(tx, id)) checkDefault(PatternSchema.parse(after.pattern), 'pattern');
    await tx.libraryPattern.update({
      where: { id },
      data: {
        ...after,
        pattern: toJson(after.pattern),
        sources: toJson(after.sources),
        version: PATTERN_VERSION,
        editedAt: new Date(),
      },
    });
    const change: PatternChange = { id, name: after.name, before, after };
    const sounds = await syncSoundPhrases(
      tx,
      { patterns: { some: { patternId: id } } },
      { heads: [id], markEdited: true }
    );
    return { change, sounds };
  });
}

/**
 * Put a sound's patterns in a new order, the default first, adding any not on it yet. Every pattern it has must stay
 * on it, and a new default must play whole as a riff (`riffProblem`). A new default makes the sound's riff its notes
 * and marks the sound edited; a new order behind the same default writes only the list. Holds the synth's row, as a
 * reorder of its sounds does, so two admins' lists for one sound cannot interleave.
 */
export async function setSoundPatterns(
  synthId: string,
  slug: string,
  patternIds: string[]
): Promise<{ before: string[]; after: string[]; sound: RewrittenRiff | null; name: string }> {
  return prisma.$transaction(async (tx) => {
    await lockSynth(tx, synthId);
    const sound = await tx.synthSound.findUnique({
      where: { synthId_slug: { synthId, slug } },
      select: {
        id: true,
        name: true,
        definitionVersion: true,
        patterns: {
          orderBy: DEFAULT_FIRST,
          select: { patternId: true, order: true },
        },
      },
    });
    if (!sound) throw new NotFoundError('Patch not found');
    // As a sound edit is refused (`editSound`): a new default rewrites its riff and makes the row an admin's.
    const version = getSynthDef(synthId)?.version;
    if (sound.definitionVersion !== version)
      refuse(`${slug} cannot be changed`, [
        {
          path: 'definitionVersion',
          message:
            version === undefined
              ? `${synthId} has no definition`
              : `Made on version ${sound.definitionVersion}; ${synthId} is at version ${version}, and there is no mapping between them`,
        },
      ]);
    const before = sound.patterns.map((p) => p.patternId);

    const problems: { path: string; message: string }[] = [];
    const seen = new Set<string>();
    patternIds.forEach((id, i) => {
      if (seen.has(id)) problems.push({ path: `patternIds.${i}`, message: `${id} appears twice` });
      seen.add(id);
    });
    const missing = before.filter((id) => !seen.has(id));
    if (missing.length)
      problems.push({
        path: 'patternIds',
        message: `A pattern is never taken off a sound; the list leaves out ${missing.join(', ')}`,
      });
    const found = await tx.libraryPattern.findMany({
      where: { id: { in: patternIds } },
      select: { id: true, pattern: true },
    });
    const known = new Set(found.map((p) => p.id));
    patternIds.forEach((id, i) => {
      if (!known.has(id))
        problems.push({ path: `patternIds.${i}`, message: `No library pattern has the id ${id}` });
    });
    if (problems.length) refuse('The list must keep every pattern the sound has, once', problems);

    if (sameValue(patternIds, before))
      return { before, after: before, sound: null, name: sound.name };
    const newDefault = patternIds[0] !== before[0];
    const head = found.find((p) => p.id === patternIds[0]);
    if (newDefault && head) checkDefault(PatternSchema.parse(head.pattern), 'patternIds.0');
    const orderOf = new Map(sound.patterns.map((p) => [p.patternId, p.order]));
    for (const [order, patternId] of patternIds.entries()) {
      if (!orderOf.has(patternId))
        await tx.synthSoundPattern.create({ data: { soundId: sound.id, patternId, order } });
      else if (orderOf.get(patternId) !== order)
        await tx.synthSoundPattern.update({
          where: { soundId_patternId: { soundId: sound.id, patternId } },
          data: { order },
        });
    }
    const [riff = null] = newDefault
      ? await syncSoundPhrases(tx, { id: sound.id }, { markEdited: true })
      : [];
    return { before, after: patternIds, sound: riff, name: sound.name };
  });
}
