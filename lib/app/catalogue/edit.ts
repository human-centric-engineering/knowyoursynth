/**
 * Admin edits to the catalogue (D2, `f-catalogue-admin`): synths, their sounds and lessons, lineage and notes.
 *
 * The rules, each tested:
 *
 * - **Checked as the seed checks.** A sound goes through `validatePreset` on its synth's definition, and an unusual
 *   note's target must be one of the synth's controls, jacks or areas (`noteTargets`). A refusal names the problem.
 * - **An edit is the admin's.** Every content write sets `editedAt`, and the seed then never writes that row again
 *   (`lib/app/catalogue/seed.ts`).
 * - **Placement is not content.** Reordering and hiding (`order`, `listed`) do not set `editedAt`: if they did, one
 *   reorder would stop the seed updating every synth. The seed writes placement only when it creates a row.
 *
 * Each write returns the row before and after, for the route to audit. Read-modify-writes run in a transaction.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Preset } from '@/lib/app/synths/contract';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset, type SoundProblem } from '@/lib/app/synths/validate';
import { LineageFileSchema, noteKey, noteTargets } from '@/lib/app/catalogue/data';
import { sameValue } from '@/lib/app/catalogue/seed';
import { listSynthDesigns, type AdminSynthDesign } from '@/lib/app/catalogue/designs';

type Json = Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;

/** A synth id as the registry writes them (`model-d`, `2-xm`). */
export const SynthIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
/** A sound's id within its synth (`stacked-night-bass`). */
export const SoundSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);

const text = z.string().trim().min(1);

/** A refusal in the shape `validateRequestBody` uses, so a page shows both the same way. */
function refuse(message: string, problems: { path: string; message: string }[]): never {
  throw new ValidationError(message, { errors: problems });
}

const fromSoundProblems = (problems: SoundProblem[]) =>
  problems.map((p) => ({ path: p.path || 'sound', message: p.message, code: p.code }));

/** A copy typed as JSON for a Prisma `Json` column. */
const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

/**
 * Hold the synth's row until the transaction ends, so a reorder of its sounds and a new sound on it cannot interleave:
 * the reorder's check that it lists every sound would otherwise miss one created meanwhile, which then shares a place.
 */
async function lockSynth(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM synth WHERE id = ${id} FOR UPDATE`;
}

async function synthOr404(tx: Tx, id: string) {
  const row = await tx.synth.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Synth not found');
  return row;
}

/** The synth's definition, which every sound and note on it is checked against. */
function defOrRefuse(id: string): AppSynthDef {
  const def = getSynthDef(id);
  if (!def)
    refuse(`${id} has no definition, so its sounds and notes cannot be checked`, [
      { path: 'synth', message: `${id} is not in lib/app/synths/defs` },
    ]);
  return def;
}

// ─── Synths ──────────────────────────────────────────────────────────────────

/** A synth as the admin lists it: its design, its descriptive columns and how much content it has. */
export interface AdminSynth extends AdminSynthDesign {
  year: number;
  heritage: string;
  summary: string;
  /** When an admin last changed its content, `null` while it is still the seed's. */
  editedAt: string | null;
  counts: { sounds: number; notes: number; lineage: boolean };
}

/** Every synth in the catalogue, listed or not, in catalogue order. One query for the content, one for designs. */
export async function listAdminSynths(): Promise<AdminSynth[]> {
  const [designs, rows] = await Promise.all([
    listSynthDesigns(),
    prisma.synth.findMany({
      select: {
        id: true,
        year: true,
        heritage: true,
        summary: true,
        editedAt: true,
        lineage: { select: { synthId: true } },
        _count: { select: { sounds: true, notes: true } },
      },
    }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return designs.flatMap((d) => {
    const row = byId.get(d.id);
    if (!row) return [];
    return [
      {
        ...d,
        year: row.year,
        heritage: row.heritage,
        summary: row.summary,
        editedAt: row.editedAt?.toISOString() ?? null,
        counts: { sounds: row._count.sounds, notes: row._count.notes, lineage: !!row.lineage },
      },
    ];
  });
}

export const SynthEditSchema = z
  .object({
    name: text.max(200),
    maker: text.max(200),
    year: z.number().int().min(1900).max(2100),
    heritage: text.max(200),
    summary: text.max(5000),
    /** Placement: shown in the public catalogue. Changing it alone does not mark the synth edited. */
    listed: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type SynthEdit = z.infer<typeof SynthEditSchema>;

const synthEditColumns = {
  name: true,
  maker: true,
  year: true,
  heritage: true,
  summary: true,
  listed: true,
} as const;
type SynthEditable = Pick<
  Prisma.SynthGetPayload<object>,
  'name' | 'maker' | 'year' | 'heritage' | 'summary' | 'listed'
>;

/** The columns the seed reconciles; `listed` is placement. */
const CONTENT_COLUMNS = ['name', 'maker', 'year', 'heritage', 'summary'] as const;

const pickSynth = (row: SynthEditable): SynthEditable => ({
  name: row.name,
  maker: row.maker,
  year: row.year,
  heritage: row.heritage,
  summary: row.summary,
  listed: row.listed,
});

/** Change a synth's descriptive columns or whether it is listed. */
export async function editSynth(
  id: string,
  input: SynthEdit
): Promise<{ before: SynthEditable; after: SynthEditable }> {
  return prisma.$transaction(async (tx) => {
    const before = pickSynth(await synthOr404(tx, id));
    const changes = (column: keyof SynthEditable) =>
      input[column] !== undefined && input[column] !== before[column];
    // An edit that changes nothing writes nothing.
    if (!changes('listed') && !CONTENT_COLUMNS.some(changes)) return { before, after: before };
    const changesContent = CONTENT_COLUMNS.some(changes);
    const after = await tx.synth.update({
      where: { id },
      data: { ...input, ...(changesContent ? { editedAt: new Date() } : {}) },
      select: synthEditColumns,
    });
    return { before, after: pickSynth(after) };
  });
}

/** An order for a whole list: every member exactly once. */
export const OrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) }).strict();

/** Check `ids` is the same set as `current`, each once. */
function checkPermutation(ids: string[], current: string[], what: string) {
  const known = new Set(current);
  const seen = new Set<string>();
  const problems: { path: string; message: string }[] = [];
  ids.forEach((id, i) => {
    if (!known.has(id))
      problems.push({ path: `ids.${i}`, message: `${id} is not one of the ${what}` });
    else if (seen.has(id)) problems.push({ path: `ids.${i}`, message: `${id} appears twice` });
    seen.add(id);
  });
  const missing = current.filter((id) => !seen.has(id));
  if (missing.length)
    problems.push({ path: 'ids', message: `The order leaves out ${missing.join(', ')}` });
  if (problems.length) refuse(`The order must list every one of the ${what} once`, problems);
}

/**
 * Put the whole catalogue in this order. Writes only the synths whose position moved, and does not mark them edited.
 */
export async function reorderSynths(ids: string[]): Promise<{ before: string[]; after: string[] }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.synth.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { id: true, order: true },
    });
    const before = rows.map((r) => r.id);
    checkPermutation(ids, before, 'synths');
    const orderOf = new Map(rows.map((r) => [r.id, r.order]));
    for (const [order, id] of ids.entries())
      if (orderOf.get(id) !== order) await tx.synth.update({ where: { id }, data: { order } });
    return { before, after: ids };
  });
}

// ─── One synth, everything about it ──────────────────────────────────────────

/** A stored sound as the admin edits it, with whatever stops it being served. */
export interface AdminSound {
  slug: string;
  definitionVersion: number;
  order: number;
  editedAt: string | null;
  /** The sound as `Preset` fields, as stored: `problems` says whether they still fit. */
  sound: ReturnType<typeof soundOf>;
  /** Empty when the public page serves it. */
  problems: { path: string; message: string }[];
}

export interface AdminNote {
  id: string;
  kind: 'UNUSUAL' | 'LIMIT_INTRO' | 'LIMIT';
  target: string | null;
  title: string | null;
  text: string;
  order: number;
  editedAt: string | null;
}

export interface AdminSynthDetail {
  synth: SynthEditable & { id: string; order: number; editedAt: string | null; playable: boolean };
  /** The definition's current version, which a new sound is made on. `null` when the registry lacks the synth. */
  definitionVersion: number | null;
  sounds: AdminSound[];
  lineage: (LineageView & { editedAt: string | null }) | null;
  notes: AdminNote[];
  /** The limits true of every panel, edited once for all of them. */
  sharedLimits: AdminNote[];
}

type SoundRow = Prisma.SynthSoundGetPayload<object>;

const soundOf = (s: SoundRow) => ({
  id: s.slug,
  name: s.name,
  ref: s.ref,
  artist: s.artist,
  tags: s.tags,
  level: s.level,
  blurb: s.blurb,
  how: s.how,
  phrase: s.phrase,
  steps: s.steps,
  context: s.context,
  tweaks: s.tweaks,
});

/** Why the public page would leave a stored sound out, as `read.ts` decides it. */
function soundProblems(def: AppSynthDef | null, s: SoundRow) {
  if (!def) return [{ path: 'synth', message: `${s.synthId} has no definition` }];
  if (s.definitionVersion !== def.version)
    return [
      {
        path: 'definitionVersion',
        message: `Made on definition version ${s.definitionVersion}; ${def.id} is at version ${def.version}`,
      },
    ];
  const result = validatePreset(def, soundOf(s));
  return result.ok ? [] : fromSoundProblems(result.problems);
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

const noteOf = (n: Prisma.SynthNoteGetPayload<object>): AdminNote => ({
  id: n.id,
  kind: n.kind,
  target: n.target,
  title: n.title,
  text: n.text,
  order: n.order,
  editedAt: iso(n.editedAt),
});

/** One synth, listed or not, with every sound, its lineage and its notes. `null` when no synth has the id. */
export async function getAdminSynth(id: string): Promise<AdminSynthDetail | null> {
  const [row, notes] = await Promise.all([
    prisma.synth.findUnique({
      where: { id },
      include: { sounds: { orderBy: [{ order: 'asc' }, { slug: 'asc' }] }, lineage: true },
    }),
    prisma.synthNote.findMany({
      where: { OR: [{ synthId: id }, { synthId: null }] },
      orderBy: [{ kind: 'asc' }, { order: 'asc' }, { key: 'asc' }],
    }),
  ]);
  if (!row) return null;
  const def = getSynthDef(id);
  const { sounds, lineage } = row;
  return {
    synth: {
      ...pickSynth(row),
      id: row.id,
      order: row.order,
      editedAt: iso(row.editedAt),
      playable: def !== null,
    },
    definitionVersion: def?.version ?? null,
    sounds: sounds.map((s) => ({
      slug: s.slug,
      definitionVersion: s.definitionVersion,
      order: s.order,
      editedAt: iso(s.editedAt),
      sound: soundOf(s),
      problems: soundProblems(def, s),
    })),
    lineage: lineage && { ...lineageOf(lineage), editedAt: iso(lineage.editedAt) },
    notes: notes.filter((n) => n.synthId === id).map(noteOf),
    sharedLimits: notes.filter((n) => n.synthId === null).map(noteOf),
  };
}

// ─── Sounds ──────────────────────────────────────────────────────────────────

/**
 * The fields of a sound an edit may change: everything but its id, which is the key the seed and users' copies match
 * on. Each is checked by `validatePreset` once merged into the stored sound, so here they are only present or not.
 */
export const SoundEditSchema = z
  .object({
    name: z.unknown(),
    ref: z.unknown(),
    artist: z.unknown(),
    tags: z.unknown(),
    level: z.unknown(),
    blurb: z.unknown(),
    how: z.unknown(),
    phrase: z.unknown(),
    steps: z.unknown(),
    context: z.unknown(),
    tweaks: z.unknown(),
  })
  .partial()
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type SoundEdit = z.infer<typeof SoundEditSchema>;

/** A new sound: a whole `Preset`, checked by `validatePreset`. */
export const SoundCreateSchema = z.record(z.string(), z.unknown());

/** Check a sound against its synth's current definition; the checked sound, or a refusal naming every problem. */
function checkSound(def: AppSynthDef, input: unknown): Preset {
  const result = validatePreset(def, input);
  if (!result.ok) refuse(`The sound does not fit ${def.id}`, fromSoundProblems(result.problems));
  if (result.value.ai)
    refuse('A library sound cannot be marked as designed by the tutor', [
      { path: 'ai', message: 'Leave ai out of a library sound' },
    ]);
  return result.value;
}

const soundColumns = (p: Preset) => ({
  name: p.name,
  ref: p.ref,
  artist: p.artist,
  tags: p.tags,
  level: p.level,
  blurb: p.blurb,
  how: p.how,
  phrase: toJson(p.phrase),
  steps: toJson(p.steps),
  context: toJson(p.context),
  tweaks: toJson(p.tweaks),
});

/** Change a sound: the edit is merged into the stored sound and the whole is checked before anything is written. */
export async function editSound(
  synthId: string,
  slug: string,
  input: SoundEdit
): Promise<{ before: ReturnType<typeof soundOf>; after: ReturnType<typeof soundOf> }> {
  const def = defOrRefuse(synthId);
  return prisma.$transaction(async (tx) => {
    const row = await tx.synthSound.findUnique({ where: { synthId_slug: { synthId, slug } } });
    if (!row) throw new NotFoundError('Sound not found');
    if (row.definitionVersion !== def.version)
      // No definition has a mapping between versions yet; the first rename ships one (plan §5).
      refuse(`${slug} was made on an older definition of ${synthId}`, [
        {
          path: 'definitionVersion',
          message: `Made on version ${row.definitionVersion}; ${synthId} is at version ${def.version}, and there is no mapping between them`,
        },
      ]);
    const before = soundOf(row);
    const edits = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const sound = checkSound(def, { ...before, ...edits });
    // An edit that changes nothing is not an edit: the row stays the seed's.
    const { id: _slug, ...stored } = before;
    if (sameValue(soundColumns(sound), stored)) return { before, after: before };
    const after = await tx.synthSound.update({
      where: { synthId_slug: { synthId, slug } },
      data: { ...soundColumns(sound), editedAt: new Date() },
    });
    return { before, after: soundOf(after) };
  });
}

/** Add a sound at the end of the synth's library, made on the definition's current version. */
export async function createSound(
  synthId: string,
  input: unknown
): Promise<ReturnType<typeof soundOf>> {
  const def = defOrRefuse(synthId);
  const sound = checkSound(def, input);
  if (!SoundSlugSchema.safeParse(sound.id).success)
    refuse('A sound id is lowercase letters, digits and hyphens', [
      { path: 'id', message: `${sound.id} is not a usable id` },
    ]);
  return prisma.$transaction(async (tx) => {
    await lockSynth(tx, synthId);
    await synthOr404(tx, synthId);
    const taken = await tx.synthSound.findUnique({
      where: { synthId_slug: { synthId, slug: sound.id } },
      select: { slug: true },
    });
    if (taken) throw new ConflictError(`${synthId} already has a sound with the id ${sound.id}`);
    const last = await tx.synthSound.aggregate({ where: { synthId }, _max: { order: true } });
    const row = await tx.synthSound.create({
      data: {
        synthId,
        slug: sound.id,
        definitionVersion: def.version,
        ...soundColumns(sound),
        order: (last._max.order ?? -1) + 1,
        // An admin's sound is the admin's: a seed file that later has the same id leaves it alone.
        editedAt: new Date(),
      },
    });
    return soundOf(row);
  });
}

/** Put a synth's library in this order. Does not mark the sounds edited. */
export async function reorderSounds(
  synthId: string,
  slugs: string[]
): Promise<{ before: string[]; after: string[] }> {
  return prisma.$transaction(async (tx) => {
    await lockSynth(tx, synthId);
    await synthOr404(tx, synthId);
    const rows = await tx.synthSound.findMany({
      where: { synthId },
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
      select: { slug: true, order: true },
    });
    const before = rows.map((r) => r.slug);
    checkPermutation(slugs, before, `sounds on ${synthId}`);
    const orderOf = new Map(rows.map((r) => [r.slug, r.order]));
    for (const [order, slug] of slugs.entries())
      if (orderOf.get(slug) !== order)
        await tx.synthSound.update({
          where: { synthId_slug: { synthId, slug } },
          data: { order },
        });
    return { before, after: slugs };
  });
}

// ─── Lineage ─────────────────────────────────────────────────────────────────

/** A synth's history section: the seed's lineage file, less the synth it is for. */
export const LineageEditSchema = LineageFileSchema.omit({ synth: true }).strict();
export type LineageEdit = z.infer<typeof LineageEditSchema>;

type LineageRow = Prisma.SynthLineageGetPayload<object>;
type LineageView = Pick<
  LineageRow,
  'title' | 'intro' | 'timeline' | 'relatives' | 'users' | 'note'
>;
function lineageOf(r: LineageRow): LineageView;
function lineageOf(r: LineageRow | null): LineageView | null;
function lineageOf(r: LineageRow | null): LineageView | null {
  return (
    r && {
      title: r.title,
      intro: r.intro,
      timeline: r.timeline,
      relatives: r.relatives,
      users: r.users,
      note: r.note,
    }
  );
}

/** Replace a synth's lineage, creating it if the synth has none. */
export async function setLineage(
  synthId: string,
  input: LineageEdit
): Promise<{ before: LineageView | null; after: LineageView }> {
  return prisma.$transaction(async (tx) => {
    await synthOr404(tx, synthId);
    const before = lineageOf(await tx.synthLineage.findUnique({ where: { synthId } }));
    const content = {
      title: input.title,
      intro: input.intro,
      timeline: toJson(input.timeline),
      relatives: toJson(input.relatives),
      users: input.users ?? [],
      note: input.note ?? null,
    };
    if (before && sameValue(before, content)) return { before, after: before };
    const data = { ...content, editedAt: new Date() };
    const after = await tx.synthLineage.upsert({
      where: { synthId },
      create: { synthId, ...data },
      update: data,
    });
    return { before, after: lineageOf(after) };
  });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export const NoteEditSchema = z
  .object({ text: text.max(5000), title: text.max(200) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type NoteEdit = z.infer<typeof NoteEditSchema>;

/** Change a note's text, or a limit's title. What a note is about (its synth, kind and target) does not change. */
export async function editNote(
  noteId: string,
  input: NoteEdit
): Promise<{ before: AdminNote; after: AdminNote; synthId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.synthNote.findUnique({ where: { id: noteId } });
    if (!row) throw new NotFoundError('Note not found');
    if (input.title !== undefined && row.kind !== 'LIMIT')
      refuse('Only a limit has a title', [
        { path: 'title', message: 'Leave the title out of this note' },
      ]);
    const before = noteOf(row);
    if (Object.entries(input).every(([k, v]) => v === undefined || row[k as keyof NoteEdit] === v))
      return { before, after: before, synthId: row.synthId };
    const after = await tx.synthNote.update({
      where: { id: noteId },
      data: { ...input, editedAt: new Date() },
    });
    return { before, after: noteOf(after), synthId: row.synthId };
  });
}

export const UnusualNoteCreateSchema = z
  .object({ target: text.max(100), text: text.max(5000) })
  .strict();
export type UnusualNoteCreate = z.infer<typeof UnusualNoteCreateSchema>;

/** Add an "Unusual on…" note about one of the synth's controls, jacks or areas. One note per target. */
export async function createUnusualNote(
  synthId: string,
  input: UnusualNoteCreate
): Promise<AdminNote> {
  const def = defOrRefuse(synthId);
  if (!noteTargets(def).has(input.target))
    refuse(`${synthId} has no control, jack or area called ${input.target}`, [
      { path: 'target', message: `${input.target} is not on ${synthId}` },
    ]);
  return prisma.$transaction(async (tx) => {
    await synthOr404(tx, synthId);
    const key = noteKey.unusual(synthId, input.target);
    if (await tx.synthNote.findUnique({ where: { key }, select: { id: true } }))
      throw new ConflictError(`${synthId} already has a note on ${input.target}; edit that one`);
    const last = await tx.synthNote.aggregate({
      where: { synthId, kind: 'UNUSUAL' },
      _max: { order: true },
    });
    const row = await tx.synthNote.create({
      data: {
        key,
        kind: 'UNUSUAL',
        synthId,
        target: input.target,
        text: input.text,
        order: (last._max.order ?? -1) + 1,
        editedAt: new Date(),
      },
    });
    return noteOf(row);
  });
}
