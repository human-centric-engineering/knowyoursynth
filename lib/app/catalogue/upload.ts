/**
 * Upload one synth's content as JSON (`f-catalogue-admin`, t-33): its sounds, lineage and notes, in the shape the data
 * page's template gives (`SynthContentSchema`).
 *
 * Content only (2026-10-11 ruling, D2): an upload fills or adds to a synth the registry already has. A synth with no
 * definition is refused, because adding an instrument is developer work.
 *
 * The rules, each tested:
 *
 * - **Checked as the seed checks, all before anything is written.** The body goes through `SynthContentSchema`, then
 *   the seed's own per-synth planning (`planSynthContent`): every sound through `validatePreset` on its definition
 *   version, every note against a real control, jack or area. One problem anywhere refuses the whole file, naming
 *   every problem.
 * - **An admin-edited row is never overwritten.** A row with `editedAt` set is skipped, unless it already holds what
 *   the file has, which counts as unchanged.
 * - **What an upload writes is the admin's.** A row it creates or updates gets `editedAt`, as an edit in the
 *   Catalogue pages does (`lib/app/catalogue/edit.ts`). Otherwise the next seed run would put a seeded row back,
 *   silently undoing the upload.
 * - **Idempotent.** A row that already holds what the file has is not written, so a re-upload writes nothing.
 * - **Never deletes.** A row the file does not have stays, so an empty or partial file cannot empty the synth.
 * - **Placement is set once.** A new sound goes after the synth's last; an existing sound keeps its place.
 *
 * The write runs in one transaction holding the synth's row, so it is all or nothing and cannot interleave with a new
 * sound or a reorder on the same synth. Other edits do not take that lock, so an update writes only a row that is
 * still unedited when it lands: an admin's edit made meanwhile is skipped, not overwritten. A note an admin creates
 * meanwhile with a key the file also has fails the upload whole, writing nothing.
 */
import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import {
  APIError,
  ConflictError,
  ErrorCodes,
  NotFoundError,
  ValidationError,
} from '@/lib/api/errors';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { MAX_CONTENT_BYTES, SynthContentSchema, toSeedFiles } from '@/lib/app/catalogue/data';
import { lockSynth, SoundSlugSchema } from '@/lib/app/catalogue/edit';
import {
  catalogueKey,
  planSynthContent,
  sameValue,
  type SeedCounts,
  type SynthContentRows,
} from '@/lib/app/catalogue/seed';

/** A problem with the file, in the shape `validateRequestBody` uses, so the page shows both the same way. */
export interface UploadProblem {
  path: string;
  message: string;
}

/** What an upload did, per table. `edited` counts the rows skipped because an admin had edited them. */
export type UploadReport = Record<'sounds' | 'lineage' | 'notes', SeedCounts>;

/**
 * Read the request body as UTF-8 text, refusing it once it passes `max` bytes, whatever the `Content-Length` header
 * says. Only a JSON content type is accepted.
 */
export async function readJsonBody(request: NextRequest, max = MAX_CONTENT_BYTES): Promise<string> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type))
    throw new APIError('Upload the content as JSON', ErrorCodes.INVALID_FILE_TYPE, 415);

  const tooLarge = () =>
    new APIError(
      `The file is larger than ${Math.round(max / (1024 * 1024))} MB`,
      ErrorCodes.FILE_TOO_LARGE,
      413,
      { maxBytes: max }
    );
  if (Number(request.headers.get('content-length')) > max) throw tooLarge();

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new ValidationError('The file is not UTF-8 text');
  }
}

/** The file checked and planned into rows, ready to write. */
export interface CheckedContent {
  def: AppSynthDef;
  rows: SynthContentRows;
}

function refuse(problems: UploadProblem[]): never {
  throw new ValidationError(`The file has ${problems.length} problem(s). Nothing was written.`, {
    errors: problems,
  });
}

/**
 * Check an uploaded file for synth `id` and plan its rows. Pure. Throws `ValidationError` listing every problem, so the
 * caller writes nothing.
 */
export function checkSynthContent(id: string, text: string): CheckedContent {
  const def = getSynthDef(id);
  if (!def)
    refuse([
      {
        path: 'synth',
        message: `${id} has no definition. An upload adds content to a synth the app already has; adding a synth is developer work.`,
      },
    ]);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    refuse([{ path: '', message: 'The file is not valid JSON' }]);
  }

  const parsed = SynthContentSchema.safeParse(body);
  if (!parsed.success)
    refuse(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const content = parsed.data;

  const problems: UploadProblem[] = [];
  if (content.synth !== id)
    problems.push({ path: 'synth', message: `The file is for ${content.synth}, not ${id}` });
  content.sounds.forEach((sound, i) => {
    if (!SoundSlugSchema.safeParse(sound.id).success)
      problems.push({
        path: `sounds.${i}.id`,
        message: `${sound.id} is not a usable id: lowercase letters, digits and hyphens`,
      });
  });
  // The seed's planner names its problems by seed file (`sounds/model-d.json sound …`); the message carries the path.
  const planned = planSynthContent(def, toSeedFiles({ ...content, synth: id }));
  problems.push(...planned.problems.map((message) => ({ path: '', message })));
  if (problems.length) refuse(problems);

  return { def, rows: planned.rows };
}

type Tx = Prisma.TransactionClient;
type Stored = Record<string, unknown> & { editedAt: Date | null };

const counts = (): SeedCounts => ({ created: 0, updated: 0, unchanged: 0, edited: 0 });

/** Whether every column the file sets already holds the file's value. */
const holds = (current: Record<string, unknown>, planned: object) =>
  Object.entries(planned).every(([k, v]) => sameValue(current[k], v));

const byKey = <T>(rows: T[], keyOf: (row: T) => string) => new Map(rows.map((r) => [keyOf(r), r]));

/**
 * Bring each planned row in under the rules above. `create` and `update` receive the row with `editedAt` set; columns
 * listed in `placement` are left out of the comparison and of an update. The edits in the Catalogue pages do not take
 * the synth's lock, so an update is conditional on the row still being unedited rather than trusting what was read.
 */
async function bringIn<Row extends object>(
  planned: Row[],
  keyOf: (row: NoInfer<Row>) => string,
  stored: Map<string, Stored>,
  create: (row: Row & { editedAt: Date }) => Promise<unknown>,
  /** Writes only while the row is still unedited, and returns how many rows it wrote. */
  update: (row: Row & { editedAt: Date }) => Promise<{ count: number }>,
  placement: readonly string[] = []
): Promise<SeedCounts> {
  const c = counts();
  const now = new Date();
  for (const row of planned) {
    const current = stored.get(keyOf(row));
    const content = Object.fromEntries(
      Object.entries(row).filter(([column]) => !placement.includes(column))
    ) as Row;
    if (!current) {
      await create({ ...row, editedAt: now });
      c.created++;
    } else if (holds(current, content)) {
      c.unchanged++;
    } else if (current.editedAt) {
      c.edited++;
    } else if ((await update({ ...content, editedAt: now })).count) {
      c.updated++;
    } else {
      // An admin's edit committed after this upload read the row: theirs stands.
      c.edited++;
    }
  }
  return c;
}

/**
 * Write a checked file's rows for synth `id`. Throws `NotFoundError` when the catalogue has no such synth, and
 * `ConflictError` when an admin created one of the file's rows while it was being written; either way, having written
 * nothing.
 */
export async function writeSynthContent(id: string, rows: SynthContentRows): Promise<UploadReport> {
  try {
    return await write(id, rows);
  } catch (err) {
    // Read structurally: lib/app may not import Prisma's runtime (its error classes included).
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002')
      throw new ConflictError(
        `${id} changed while the file was being written, so nothing was written. Upload it again.`
      );
    throw err;
  }
}

async function write(id: string, rows: SynthContentRows): Promise<UploadReport> {
  return prisma.$transaction(
    async (tx: Tx) => {
      await lockSynth(tx, id);
      if (!(await tx.synth.findUnique({ where: { id }, select: { id: true } })))
        throw new NotFoundError('Synth not found');

      const storedSounds = await tx.synthSound.findMany({ where: { synthId: id } });
      let next = storedSounds.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      const sounds = await bringIn(
        rows.sounds,
        catalogueKey.SOUND,
        byKey(storedSounds, catalogueKey.SOUND),
        (data) =>
          tx.synthSound.create({
            data: { ...data, order: storedSounds.length ? next++ : data.order },
          }),
        ({ synthId, slug, ...data }) =>
          tx.synthSound.updateMany({ where: { synthId, slug, editedAt: null }, data }),
        ['order']
      );

      const lineage = await bringIn(
        rows.lineage,
        catalogueKey.LINEAGE,
        byKey(await tx.synthLineage.findMany({ where: { synthId: id } }), catalogueKey.LINEAGE),
        (data) => tx.synthLineage.create({ data }),
        ({ synthId, ...data }) =>
          tx.synthLineage.updateMany({ where: { synthId, editedAt: null }, data })
      );

      const notes = await bringIn(
        rows.notes,
        catalogueKey.NOTE,
        byKey(
          await tx.synthNote.findMany({ where: { key: { in: rows.notes.map((n) => n.key) } } }),
          catalogueKey.NOTE
        ),
        (data) => tx.synthNote.create({ data }),
        ({ key, ...data }) => tx.synthNote.updateMany({ where: { key, editedAt: null }, data })
      );

      return { sounds, lineage, notes };
    },
    // A whole library is a few hundred row reads and writes: more than the default five seconds allows for.
    { timeout: 30_000 }
  );
}

/** Where an accepted upload's file is kept. Private: it is read only through a signed URL. */
export function uploadStorageKey(id: string, now = new Date()): string {
  return `catalogue-uploads/${id}/${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
}
