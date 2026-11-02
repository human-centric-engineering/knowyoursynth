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
 * - **Admin control** (t-156, `pattern-library.md`, Admin control). Rights risk and status are set with a reason, one
 *   pattern or many at once, and are not edits to the pattern: the seed may still bring its notes up to date. A
 *   blocked pattern is always disabled. Disabling a sound's default hands the sound to its next enabled pattern
 *   (`headOf`), and one that would leave a sound with none is refused until the admin acknowledges it. A rights risk
 *   no admin has set follows the fidelity.
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
import { ACKNOWLEDGE_PATH } from '@/lib/app/patterns/library-labels';
import { forgetSuggestLibrary } from '@/lib/app/patterns/suggest-read';
import { LibraryPatternIdSchema } from '@/lib/app/patterns/library-read';
import {
  DEFAULT_FIRST,
  defaultRightsRisk,
  headOf,
  PLACES,
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

export const PATTERN_ORIGINS = ['ai_generated', 'human_authored', 'user_contributed'] as const;
export const PATTERN_RIGHTS_RISKS = ['none', 'needs_review', 'cleared', 'blocked'] as const;
export const PATTERN_STATUSES = ['enabled', 'disabled'] as const;

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
  origin: z.enum(PATTERN_ORIGINS),
  /** Who or what made it, when no user account did: the agent and its task or session. */
  madeBy: z.string().trim().min(1).max(200).nullable(),
};

/** A new pattern. Tempo and sources may be left out; origin defaults to _Human-authored_, as an admin wrote it. */
export const LibraryPatternCreateSchema = z
  .object({
    ...fields,
    tempo: fields.tempo.default(null),
    sources: fields.sources.default([]),
    origin: fields.origin.default('human_authored'),
    madeBy: fields.madeBy.default(null),
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
    | 'madeBy'
    | 'rightsRisk'
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
    select: { patterns: PLACES },
  });
  return sounds.some((s) => headOf(s.patterns)?.patternId === id);
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
    ...(input.madeBy !== undefined && { madeBy: input.madeBy }),
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
  madeBy: row.madeBy,
  rightsRisk: row.rightsRisk,
});

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * A pattern as admin sees it: the public view, its key, whether an admin has edited it, the sounds listing it, and its
 * admin control: who made it, a research batch's record, its rights risk and status, each with a reason.
 */
export interface AdminLibraryPattern extends LibraryPatternView {
  editedAt: string | null;
  sounds: { synthId: string; slug: string; name: string; order: number; isDefault: boolean }[];
  madeBy: string | null;
  /** The person who made it, where one did: the admin who added it, or the user it came from. */
  madeByUser: { id: string; name: string } | null;
  madeAt: string | null;
  /** A research batch's record (`ResearchRecordSchema` and its task); null for a pattern no batch wrote. */
  research: Record<string, unknown> | null;
  rightsRisk: LibraryPattern['rightsRisk'];
  /** Why an admin set the rights risk; null while it is the default for the fidelity. */
  rightsReason: string | null;
  status: LibraryPattern['status'];
  statusReason: string | null;
}

/** A pattern as admin reads it, or what is wrong with a stored one that no longer parses. */
export type AdminLibraryRow =
  AdminLibraryPattern | { id: string; key: string; name: string; problem: string };

/** A stored row as admin sees it, or a placeholder naming the problem when it no longer parses. */
type AdminRow = LibraryPattern & {
  sounds: {
    order: number;
    sound: {
      synthId: string;
      slug: string;
      name: string;
      patterns: {
        patternId: string;
        pattern: { status: LibraryPattern['status']; pattern: unknown };
      }[];
    };
  }[];
};

/** What a person no longer here is shown as. */
const GONE = 'A deleted account';

/** Each person's name by id, in one read. */
async function namesOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.flatMap((id) => id ?? []))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** The names of the people rows were made by, in one read. */
const madeByNames = (rows: LibraryPattern[]) => namesOf(rows.map((r) => r.madeByUserId));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function adminView(row: AdminRow, names: Map<string, string>): AdminLibraryRow {
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
      isDefault: headOf(sound.patterns)?.patternId === row.id,
    })),
    madeBy: row.madeBy,
    madeByUser: row.madeByUserId
      ? { id: row.madeByUserId, name: names.get(row.madeByUserId) ?? GONE }
      : null,
    madeAt: row.madeAt?.toISOString() ?? null,
    research: isRecord(row.research) ? row.research : null,
    rightsRisk: row.rightsRisk,
    rightsReason: row.rightsReason,
    status: row.status,
    statusReason: row.statusReason,
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
            select: { patternId: true, pattern: { select: { status: true, pattern: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.LibraryPatternInclude;

export const AdminLibraryQuerySchema = z.object({
  role: z.enum(PATTERN_ROLES).optional(),
  /** On a sound of this synth. */
  synth: Id.optional(),
  /** Inspired by this databank artist, or by a work they are credited on. */
  artist: Id.optional(),
  fidelity: fields.fidelity.optional(),
  origin: fields.origin.optional(),
  rights: z.enum(PATTERN_RIGHTS_RISKS).optional(),
  status: z.enum(PATTERN_STATUSES).optional(),
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
    AND: [
      ...(query.role ? [{ role: query.role }] : []),
      ...(query.fidelity ? [{ fidelity: query.fidelity }] : []),
      ...(query.origin ? [{ origin: query.origin }] : []),
      ...(query.rights ? [{ rightsRisk: query.rights }] : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.synth ? [{ sounds: { some: { sound: { synth: { id: query.synth } } } } }] : []),
      ...(query.artist
        ? [
            {
              OR: [
                { inspiredArtistId: query.artist },
                { inspiredSong: { artists: { some: { artistId: query.artist } } } },
              ],
            },
          ]
        : []),
      ...(query.q
        ? [
            {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' as const } },
                { inspiredBy: { contains: query.q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ],
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
  const names = await madeByNames(rows);
  return { patterns: rows.map((r) => adminView(r, names)), total };
}

/** One library pattern, or `null`. */
export async function getAdminLibraryPattern(id: string): Promise<AdminLibraryRow | null> {
  const row = await prisma.libraryPattern.findUnique({ where: { id }, include: withSounds });
  return row && adminView(row, await madeByNames([row]));
}

/** A sound's patterns as admin reads them, default first, hidden synths' included. */
export interface AdminSoundPatterns {
  synthId: string;
  slug: string;
  name: string;
  patterns: AdminLibraryRow[];
}

/** A sound's patterns in order, the default first, or `null` when there is no such sound. */
export async function getAdminSoundPatterns(
  synthId: string,
  slug: string
): Promise<AdminSoundPatterns | null> {
  const sound = await prisma.synthSound.findUnique({
    where: { synthId_slug: { synthId, slug } },
    select: { name: true, patterns: { orderBy: DEFAULT_FIRST, select: { patternId: true } } },
  });
  if (!sound) return null;
  const ids = sound.patterns.map((p) => p.patternId);
  const rows = await prisma.libraryPattern.findMany({
    where: { id: { in: ids } },
    include: withSounds,
  });
  const names = await madeByNames(rows);
  const byId = new Map(rows.map((r) => [r.id, adminView(r, names)]));
  return {
    synthId,
    slug,
    name: sound.name,
    patterns: ids.flatMap((id) => byId.get(id) ?? []),
  };
}

/** What a pattern's Inspired by and the list's filters choose from. */
export interface LibraryPatternChoices {
  synths: { id: string; name: string; maker: string }[];
  artists: { id: string; name: string }[];
  /** Works in the databank, each with the parts a pattern may recreate. */
  songs: { id: string; title: string; parts: { id: string; on: string }[] }[];
}

/** Every synth, databank artist and work, by name: one read for the admin page's pickers. */
export async function listLibraryPatternChoices(): Promise<LibraryPatternChoices> {
  const [synths, artists, songs] = await Promise.all([
    prisma.synth.findMany({
      select: { id: true, name: true, maker: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.bankArtist.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }] }),
    prisma.bankSong.findMany({
      select: {
        id: true,
        title: true,
        parts: { orderBy: { order: 'asc' }, select: { id: true, on: true } },
      },
      orderBy: [{ title: 'asc' }],
    }),
  ]);
  return {
    synths: synths.map(({ id, name, maker }) => ({ id, name, maker })),
    artists: artists.map(({ id, name }) => ({ id, name })),
    songs: songs.map(({ id, title, parts }) => ({
      id,
      title,
      parts: parts.map((p) => ({ id: p.id, on: p.on })),
    })),
  };
}

/** One entry in a pattern's audit history (`pattern-library.md`, The provenance panel). */
export interface PatternHistoryEntry {
  id: string;
  action: string;
  /** The admin who made the change; null once their account is gone. */
  by: string | null;
  at: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

/** An admin's comment on a pattern. */
export interface PatternComment {
  id: string;
  body: string;
  /** Null once the author's account is gone. */
  author: { id: string; name: string } | null;
  createdAt: string;
}

/** The changes column of an audit row, when it has the shape `computeChanges` writes. */
const ChangesSchema = z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() }));

/** The last 100 audited changes to a pattern, newest first, or `null` when there is no such pattern. */
export async function getLibraryPatternHistory(id: string): Promise<PatternHistoryEntry[] | null> {
  const exists = await prisma.libraryPattern.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  const rows = await prisma.aiAdminAuditLog.findMany({
    where: { entityType: 'library_pattern', entityId: id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
    select: {
      id: true,
      action: true,
      changes: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return rows.map((r) => {
    const changes = ChangesSchema.safeParse(r.changes);
    return {
      id: r.id,
      action: r.action,
      by: r.user?.name ?? null,
      at: r.createdAt.toISOString(),
      changes: changes.success ? changes.data : null,
    };
  });
}

/** A pattern's comments, oldest first, or `null` when there is no such pattern. */
export async function listLibraryPatternComments(id: string): Promise<PatternComment[] | null> {
  const exists = await prisma.libraryPattern.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  const rows = await prisma.libraryPatternComment.findMany({
    where: { patternId: id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return withAuthors(rows);
}

async function withAuthors(
  rows: { id: string; body: string; authorId: string | null; createdAt: Date }[]
): Promise<PatternComment[]> {
  const names = await namesOf(rows.map((r) => r.authorId));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: r.authorId ? { id: r.authorId, name: names.get(r.authorId) ?? GONE } : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Once a write that can change what players see has committed, drop the library suggestions keep, so the next
 * suggestion reads it afresh (in this process; another instance's copy lasts out its minute).
 */
async function fresh<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  forgetSuggestLibrary();
  return result;
}

/** Add a pattern to the library, on no sound yet, made by the admin adding it. */
export async function createLibraryPattern(
  input: LibraryPatternCreate,
  userId: string
): Promise<AdminLibraryRow> {
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
      madeBy: input.madeBy,
      rightsRisk: defaultRightsRisk(input.fidelity),
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
        madeByUserId: userId,
        madeAt: new Date(),
        editedAt: new Date(),
      },
      include: withSounds,
    });
    return adminView(row, await madeByNames([row]));
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
  return fresh(
    prisma.$transaction(async (tx) => {
      const row = await tx.libraryPattern.findUnique({ where: { id } });
      if (!row) throw new NotFoundError('Pattern not found');
      const before = pick(row);
      const after = { ...before, ...(await columnsOf(tx, input)) };
      // A rights risk no admin has set follows the fidelity (`pattern-library.md`, Rights risk).
      if (row.rightsReason === null) after.rightsRisk = defaultRightsRisk(after.fidelity);
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
    })
  );
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
  return fresh(
    prisma.$transaction(async (tx) => {
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
        if (seen.has(id))
          problems.push({ path: `patternIds.${i}`, message: `${id} appears twice` });
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
        select: { id: true, pattern: true, status: true },
      });
      const known = new Set(found.map((p) => p.id));
      patternIds.forEach((id, i) => {
        if (!known.has(id))
          problems.push({
            path: `patternIds.${i}`,
            message: `No library pattern has the id ${id}`,
          });
      });
      if (problems.length) refuse('The list must keep every pattern the sound has, once', problems);

      if (sameValue(patternIds, before))
        return { before, after: before, sound: null, name: sound.name };
      // The admin's choice is the first enabled pattern: disabled ones ahead of it are passed over, as they were, and a
      // new choice must be able to be a riff. The riff then follows the default as `headOf` reads it.
      const byId = new Map(found.map((p) => [p.id, p]));
      const places = (ids: string[]) =>
        ids.flatMap((id) => byId.get(id) ?? []).map((p) => ({ patternId: p.id, pattern: p }));
      const firstEnabled = (ids: string[]) => ids.find((id) => byId.get(id)?.status === 'enabled');
      const chosen = firstEnabled(patternIds);
      const head = chosen === undefined ? undefined : byId.get(chosen);
      if (head && chosen !== firstEnabled(before))
        checkDefault(
          PatternSchema.parse(head.pattern),
          `patternIds.${patternIds.indexOf(head.id)}`
        );
      const newDefault =
        headOf(places(patternIds))?.patternId !== headOf(places(before))?.patternId;
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
    })
  );
}

// ─── Admin control ───────────────────────────────────────────────────────────

/** A comment on a pattern. */
export const PatternCommentSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** Add an admin's comment to a pattern. */
export async function addLibraryPatternComment(
  id: string,
  authorId: string,
  body: string
): Promise<{ comment: PatternComment; name: string }> {
  const pattern = await prisma.libraryPattern.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!pattern) throw new NotFoundError('Pattern not found');
  const row = await prisma.libraryPatternComment.create({
    data: { patternId: id, authorId, body },
  });
  const [comment] = await withAuthors([row]);
  return { comment, name: pattern.name };
}

/**
 * Set the rights risk or status of one pattern or many, with one reason for all of them (`pattern-library.md`, Admin
 * control). `acknowledge` is the admin's answer to the warning a disable gives when it would leave a sound with no
 * enabled pattern to play.
 */
export const PatternControlSchema = z
  .object({
    ids: z.array(LibraryPatternIdSchema).min(1).max(100),
    rightsRisk: z.enum(PATTERN_RIGHTS_RISKS).optional(),
    status: z.enum(PATTERN_STATUSES).optional(),
    reason: z.string().trim().min(1).max(1000),
    acknowledge: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.rightsRisk !== undefined || v.status !== undefined, {
    message: 'Set a rights risk, a status or both',
  });
export type PatternControl = z.infer<typeof PatternControlSchema>;

/** A sound a change left with no enabled pattern to play: it keeps the riff it had. */
export interface SoundLeftWithout {
  synthId: string;
  slug: string;
  name: string;
}

/**
 * Set rights risk and status on each pattern named, and hand each sound whose default that changes to its new one,
 * rewriting its riff (`syncSoundPhrases`). Refuses the whole change when a pattern is not there, when it would enable
 * a blocked pattern, or, unless acknowledged, when it would leave a sound with no enabled pattern that can be its
 * default. A pattern the change leaves as it was writes and audits nothing.
 */
export async function setLibraryPatternControl(input: PatternControl): Promise<{
  changes: PatternChange[];
  sounds: RewrittenRiff[];
  leftWithout: SoundLeftWithout[];
}> {
  return fresh(
    prisma.$transaction(async (tx) => {
      const ids = [...new Set(input.ids)];
      const rows = await tx.libraryPattern.findMany({ where: { id: { in: ids } } });
      const known = new Set(rows.map((r) => r.id));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length)
        refuse(
          'No library pattern has that id',
          unknown.map((id) => ({ path: 'ids', message: `No library pattern has the id ${id}` }))
        );

      const problems: { path: string; message: string }[] = [];
      const planned = rows.map((row) => {
        const rightsRisk = input.rightsRisk ?? row.rightsRisk;
        // A blocked pattern must not be shown, so it is always disabled.
        if (rightsRisk === 'blocked' && input.status === 'enabled')
          problems.push({
            path: 'status',
            message: `${row.name} is blocked: a blocked pattern is always disabled`,
          });
        const status = rightsRisk === 'blocked' ? 'disabled' : (input.status ?? row.status);
        const before = {
          rightsRisk: row.rightsRisk,
          rightsReason: row.rightsReason,
          status: row.status,
          statusReason: row.statusReason,
        };
        const after = {
          rightsRisk,
          // An admin who sets a rights risk has decided it, even where it is the value it had: the reason records that,
          // and stops it following the fidelity.
          rightsReason: input.rightsRisk !== undefined ? input.reason : row.rightsReason,
          status,
          statusReason: status !== row.status ? input.reason : row.statusReason,
        };
        return { row, before, after };
      });
      if (problems.length) refuse('A blocked pattern cannot be enabled', problems);
      const changed = planned.filter((p) => !sameValue(p.before, p.after));
      const moved = changed.filter((p) => p.before.status !== p.after.status).map((p) => p.row.id);

      // Each sound listing a pattern whose status changes: its default before and after.
      const soundWhere = { patterns: { some: { patternId: { in: moved } } } };
      const heads = async (): Promise<SoundHeads> =>
        moved.length ? soundHeads(tx, soundWhere) : new Map();
      const headsBefore = await heads();
      for (const { row, after } of changed)
        await tx.libraryPattern.update({ where: { id: row.id }, data: after });
      const headsAfter = await heads();

      const leftWithout: SoundLeftWithout[] = [];
      const handed: string[] = [];
      for (const [soundId, after] of headsAfter) {
        const before = headsBefore.get(soundId);
        if (!before || before.head === after.head) continue;
        if (after.head === null) leftWithout.push(after.sound);
        else handed.push(soundId);
      }
      if (leftWithout.length && !input.acknowledge)
        refuse(
          'This would leave a patch with no enabled pattern to play',
          leftWithout.map((s) => ({
            path: ACKNOWLEDGE_PATH,
            message: `${s.name} (${s.synthId}) would have no enabled pattern that can be its default, and would keep playing the riff it has`,
          }))
        );
      const sounds = handed.length
        ? await syncSoundPhrases(tx, { id: { in: handed } }, { markEdited: true })
        : [];
      return {
        changes: changed.map(({ row, before, after }) => ({
          id: row.id,
          name: row.name,
          before,
          after,
        })),
        sounds,
        leftWithout,
      };
    })
  );
}

/** Each sound by id: its default pattern id (`headOf`), or null where it has none. */
type SoundHeads = Map<string, { sound: SoundLeftWithout; head: string | null }>;

async function soundHeads(db: LibraryDb, where: Prisma.SynthSoundWhereInput): Promise<SoundHeads> {
  const sounds = await db.synthSound.findMany({
    where,
    select: { id: true, synthId: true, slug: true, name: true, patterns: PLACES },
  });
  return new Map(
    sounds.map((s) => [
      s.id,
      {
        sound: { synthId: s.synthId, slug: s.slug, name: s.name },
        head: headOf(s.patterns)?.patternId ?? null,
      },
    ])
  );
}
