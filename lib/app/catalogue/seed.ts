/**
 * Write the catalogue's seed data into its tables (plan §9, `fp4`).
 *
 * Called by the seed unit `prisma/seeds/app-knowyoursynth/001-catalogue.ts`, which reads the data files and passes
 * them in. The properties, each tested:
 *
 * - **Checked before anything is written.** Every sound must pass `validatePreset` against the definition version it
 *   was made on, every note must point at something on its synth, and every file must name a listed synth. One
 *   problem anywhere and the seed throws with the whole list, having written nothing.
 * - **Idempotent.** A row whose columns already match is not written, so a re-run touches nothing and `updatedAt`
 *   stays put. JSON columns are compared by value, not key order: Postgres `jsonb` does not keep the order it was given.
 * - **Operator-owned once edited.** A row with `editedAt` set has been changed by an admin and is never written again.
 * - **Placement is set once.** A synth's `listed` and `order`, and a sound's `order`, are written when the row is created
 *   and never after. A row added to a list that already has rows goes after the last of them, whatever its place in
 *   the file. An admin reorders and hides without setting `editedAt` (`lib/app/catalogue/edit.ts`), so the seed
 *   keeps updating the row's content while leaving its place alone.
 * - **Never deletes.** A row the data no longer has stays, so an empty or partial source cannot empty a table. Retiring
 *   content is an admin's act.
 *
 * Without a transaction, deliberately: a write that fails part way leaves rows the next run completes, because each
 * row is matched on its natural key.
 */
import type { CatalogueTable, Prisma, SynthNoteKind } from '@prisma/client';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import {
  noteKey,
  noteTargets,
  type CatalogueSeedData,
  type LineageFile,
  type NotesFile,
  type SoundsFile,
} from '@/lib/app/catalogue/data';

/** The data does not fit the definitions. Nothing was written. */
export class CatalogueDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`The catalogue seed data has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'CatalogueDataError';
  }
}

/** What one run did, per table. */
export interface SeedCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Rows an admin has edited, left alone. */
  edited: number;
}

/** What one run did to the seed's record of what it planned (`CatalogueSeedRecord`). */
export interface RecordCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Records of rows the data no longer has. The rows themselves stay. */
  removed: number;
}

export type SeedReport = Record<'synths' | 'sounds' | 'lineage' | 'notes', SeedCounts> & {
  records: RecordCounts;
};

type Json = Prisma.InputJsonValue;

interface SynthRow {
  id: string;
  name: string;
  maker: string;
  year: number;
  heritage: string;
  summary: string;
  listed: boolean;
  order: number;
}

interface SoundRow {
  synthId: string;
  slug: string;
  definitionVersion: number;
  name: string;
  ref: string;
  artist: string;
  tags: string[];
  level: number;
  blurb: string;
  how: string;
  phrase: Json;
  steps: Json;
  context: Json;
  tweaks: Json;
  order: number;
}

interface LineageRow {
  synthId: string;
  title: string;
  intro: string;
  timeline: Json;
  relatives: Json;
  users: string[];
  note: string | null;
}

interface NoteRow {
  key: string;
  kind: SynthNoteKind;
  synthId: string | null;
  target: string | null;
  title: string | null;
  text: string;
  order: number;
}

/** The rows the data describes. */
export interface CatalogueRows {
  synths: SynthRow[];
  sounds: SoundRow[];
  lineage: LineageRow[];
  notes: NoteRow[];
}

/** One synth's content rows: everything but the synth row itself and the limits every panel shares. */
export type SynthContentRows = Omit<CatalogueRows, 'synths'>;

/** One synth's content files, each optional: a synth may have no sounds, lineage or notes yet. */
export interface SynthContentFiles {
  sounds?: SoundsFile;
  lineage?: LineageFile;
  notes?: NotesFile;
}

/** A plain-data copy, typed as JSON for a Prisma `Json` column. */
const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

/**
 * Turn one synth's content into rows, checking it against the synth's definition: every sound against the version it
 * was made on, every note against what the synth has. Pure. Returns every problem rather than throwing, so a caller
 * planning many synths can report them all at once.
 *
 * The seed plans each synth's files through this; an upload of one synth's content (`f-catalogue-admin` c4) reuses it.
 */
export function planSynthContent(
  def: AppSynthDef,
  files: SynthContentFiles
): { rows: SynthContentRows; problems: string[] } {
  const problems: string[] = [];
  const rows: SynthContentRows = { sounds: [], lineage: [], notes: [] };

  const file = files.sounds;
  if (file) {
    const name = `sounds/${def.id}.json`;
    if (file.version !== def.version) {
      // No definition has a mapping between versions yet; the first rename ships one (plan §5).
      problems.push(
        `${name} was made on definition version ${file.version}, and ${def.id} is at version ${def.version}`
      );
    } else {
      const slugs = new Set<string>();
      file.sounds.forEach((input, order) => {
        const result = validatePreset(def, input);
        if (!result.ok) {
          const label = typeof input.id === 'string' ? input.id : `#${order}`;
          for (const p of result.problems)
            problems.push(`${name} sound ${label}${p.path ? ` at ${p.path}` : ''}: ${p.message}`);
          return;
        }
        const sound = result.value;
        // `ai` marks a sound the tutor designed, which is a user's sound, not the library's; the table has no column for it.
        if (sound.ai)
          problems.push(`${name} sound ${sound.id} is marked ai, which a library sound cannot be`);
        if (slugs.has(sound.id)) problems.push(`${name} has two sounds with the id ${sound.id}`);
        slugs.add(sound.id);
        rows.sounds.push({
          synthId: def.id,
          slug: sound.id,
          definitionVersion: file.version,
          name: sound.name,
          ref: sound.ref,
          artist: sound.artist,
          tags: sound.tags,
          level: sound.level,
          blurb: sound.blurb,
          how: sound.how,
          phrase: toJson(sound.phrase),
          steps: toJson(sound.steps),
          context: toJson(sound.context),
          tweaks: toJson(sound.tweaks),
          order,
        });
      });
    }
  }

  if (files.lineage)
    rows.lineage.push({
      synthId: def.id,
      title: files.lineage.title,
      intro: files.lineage.intro,
      timeline: toJson(files.lineage.timeline),
      relatives: toJson(files.lineage.relatives),
      users: files.lineage.users ?? [],
      note: files.lineage.note ?? null,
    });

  if (files.notes) {
    const name = `notes/${def.id}.json`;
    const keys = new Set<string>();
    const addNote = (note: NoteRow) => {
      if (keys.has(note.key)) problems.push(`${name} has two notes with the key ${note.key}`);
      keys.add(note.key);
      rows.notes.push(note);
    };
    const targets = noteTargets(def);
    files.notes.unusual.forEach(({ target, text }, order) => {
      if (!targets.has(target))
        problems.push(`${name} has an unusual note on ${target}, which ${def.id} does not have`);
      const key = noteKey.unusual(def.id, target);
      addNote({ key, kind: 'UNUSUAL', synthId: def.id, target, title: null, text, order });
    });
    addNote({
      key: noteKey.limitIntro(def.id),
      kind: 'LIMIT_INTRO',
      synthId: def.id,
      target: null,
      title: null,
      text: files.notes.limits.intro,
      order: 0,
    });
    files.notes.limits.items.forEach(({ title, text }, order) =>
      addNote({
        key: noteKey.limit(def.id, title),
        kind: 'LIMIT',
        synthId: def.id,
        target: null,
        title,
        text,
        order,
      })
    );
  }

  return { rows, problems };
}

/**
 * Turn the seed data into rows, checking it against the definitions. Throws {@link CatalogueDataError} listing every
 * problem. Pure: it reads nothing but its arguments.
 */
export function planCatalogue(
  data: CatalogueSeedData,
  getDef: (id: string) => AppSynthDef | null = getSynthDef
): CatalogueRows {
  const problems: string[] = [];
  const rows: CatalogueRows = { synths: [], sounds: [], lineage: [], notes: [] };
  const defs = new Map<string, AppSynthDef>();

  for (const entry of data.listing.synths) {
    if (defs.has(entry.id)) {
      problems.push(`synths.json lists ${entry.id} twice`);
      continue;
    }
    const def = getDef(entry.id);
    if (!def) {
      problems.push(
        `synths.json lists ${entry.id}, which has no definition in lib/app/synths/defs`
      );
      continue;
    }
    defs.set(entry.id, def);
    const { name, maker, year, heritage, summary } = def;
    rows.synths.push({
      id: def.id,
      name,
      maker,
      year,
      heritage,
      summary,
      listed: entry.listed,
      order: entry.order,
    });
  }

  // Gather each listed synth's files. Each synth has at most one file of each kind: a second would plan the same rows
  // twice and fail on a unique key part way through writing, which is the half-written state this check exists to
  // prevent.
  const content = new Map<string, SynthContentFiles>();
  const gather = <K extends keyof SynthContentFiles>(
    kind: K,
    files: NonNullable<SynthContentFiles[K]>[]
  ) => {
    for (const file of files) {
      const name = `${kind}/${file.synth}.json`;
      if (!defs.has(file.synth)) {
        problems.push(`${name} is for ${file.synth}, which synths.json does not list`);
        continue;
      }
      const forSynth = content.get(file.synth) ?? {};
      if (forSynth[kind]) {
        problems.push(`more than one ${kind} file is for ${file.synth} (${name} is a second)`);
        continue;
      }
      forSynth[kind] = file;
      content.set(file.synth, forSynth);
    }
  };
  gather('sounds', data.sounds);
  gather('lineage', data.lineage);
  gather('notes', data.notes);

  for (const [id, files] of content) {
    const def = defs.get(id);
    if (!def) continue; // gathered only for listed synths
    const planned = planSynthContent(def, files);
    problems.push(...planned.problems);
    rows.sounds.push(...planned.rows.sounds);
    rows.lineage.push(...planned.rows.lineage);
    rows.notes.push(...planned.rows.notes);
  }

  // Seeded with every synth's note keys, so a shared limit cannot take a key a synth's note already has.
  const keys = new Set(rows.notes.map((n) => n.key));
  data.shared.limits.forEach(({ title, text }, order) => {
    const key = noteKey.limit(null, title);
    if (keys.has(key))
      problems.push(`notes/shared.json has a note with the key ${key}, which is taken`);
    keys.add(key);
    rows.notes.push({ key, kind: 'LIMIT', synthId: null, target: null, title, text, order });
  });

  if (problems.length) throw new CatalogueDataError(problems);
  return rows;
}

/** JSON values compared by content: object key order is not significant, array order is. */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Whether every planned column already holds the planned value. */
function matches<T extends object>(current: Record<string, unknown>, planned: T): boolean {
  return Object.entries(planned).every(([k, v]) => sameValue(current[k], v));
}

const counts = (): SeedCounts => ({ created: 0, updated: 0, unchanged: 0, edited: 0 });

/**
 * Bring each planned row in: create it when missing, update it when it differs and no admin has edited it, and
 * otherwise leave it. Returns what it did.
 */
async function reconcile<Row extends object>(
  planned: Row[],
  keyOf: (row: Row) => string,
  existing: Map<string, Record<string, unknown> & { editedAt: Date | null }>,
  create: (row: Row) => Promise<unknown>,
  update: (row: Row) => Promise<unknown>,
  /** Columns written on create only: neither compared nor updated after. */
  placement: readonly (keyof Row)[] = []
): Promise<SeedCounts> {
  const c = counts();
  const content = (row: Row): Row =>
    Object.fromEntries(
      Object.entries(row).filter(([column]) => !placement.includes(column as keyof Row))
    ) as Row;
  for (const row of planned) {
    const current = existing.get(keyOf(row));
    if (!current) {
      await create(row);
      c.created++;
    } else if (current.editedAt) {
      c.edited++;
    } else if (matches(current, content(row))) {
      c.unchanged++;
    } else {
      await update(content(row));
      c.updated++;
    }
  }
  return c;
}

const byKey = <T>(rows: T[], keyOf: (row: T) => string) => new Map(rows.map((r) => [keyOf(r), r]));

/**
 * Where a new row goes. In an empty list, the file's position. In one that already has rows, after the last of them:
 * the stored order may be an admin's, so a file position could land on one already taken.
 */
function placer(lastStored: number | null): (fileOrder: number) => number {
  let next = lastStored === null ? null : lastStored + 1;
  return (fileOrder) => (next === null ? fileOrder : next++);
}

/** Each table's natural key: what the seed matches a planned row on, and what its record is keyed by. */
export const catalogueKey = {
  SYNTH: (r: { id: string }) => r.id,
  SOUND: (r: { synthId: string; slug: string }) => `${r.synthId}/${r.slug}`,
  LINEAGE: (r: { synthId: string }) => r.synthId,
  NOTE: (r: { key: string }) => r.key,
} satisfies Record<CatalogueTable, unknown>;

/** Columns the seed writes only when it creates a row. They are placement, not content, so no record holds them. */
const PLACEMENT = { SYNTH: ['listed', 'order'], SOUND: ['order'] } as const;

const withoutPlacement = (
  row: object,
  placement: readonly string[] = []
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).filter(([column]) => !placement.includes(column)));

/** What the seed planned for one row, as `CatalogueSeedRecord` stores it. */
export interface SeedRecord {
  table: CatalogueTable;
  key: string;
  synthId: string | null;
  values: Record<string, unknown>;
}

/** The record of every planned row: its content columns, placement left out. */
export function seedRecords(rows: CatalogueRows): SeedRecord[] {
  return [
    ...rows.synths.map((r) => ({
      table: 'SYNTH' as const,
      key: catalogueKey.SYNTH(r),
      synthId: r.id,
      values: withoutPlacement(r, PLACEMENT.SYNTH),
    })),
    ...rows.sounds.map((r) => ({
      table: 'SOUND' as const,
      key: catalogueKey.SOUND(r),
      synthId: r.synthId,
      values: withoutPlacement(r, PLACEMENT.SOUND),
    })),
    ...rows.lineage.map((r) => ({
      table: 'LINEAGE' as const,
      key: catalogueKey.LINEAGE(r),
      synthId: r.synthId,
      values: withoutPlacement(r),
    })),
    ...rows.notes.map((r) => ({
      table: 'NOTE' as const,
      key: catalogueKey.NOTE(r),
      synthId: r.synthId,
      values: withoutPlacement(r),
    })),
  ];
}

const recordId = (r: { table: CatalogueTable; key: string }) => `${r.table}:${r.key}`;

/**
 * Bring the seed's record in line with what it just planned: create a record for a new row, rewrite one whose values
 * changed, and remove the records of rows the data no longer has. The record table is the seed's alone, so removing
 * from it is safe in a way removing catalogue rows is not: it never touches content, and the next run rebuilds it.
 */
async function rewriteSeedRecord(
  prisma: TenancyClient,
  planned: SeedRecord[]
): Promise<RecordCounts> {
  const c: RecordCounts = { created: 0, updated: 0, unchanged: 0, removed: 0 };
  const stored = byKey(await prisma.catalogueSeedRecord.findMany(), recordId);
  const fresh: SeedRecord[] = [];
  for (const r of planned) {
    const current = stored.get(recordId(r));
    stored.delete(recordId(r));
    if (!current) fresh.push(r);
    else if (current.synthId === r.synthId && sameValue(current.values, r.values)) c.unchanged++;
    else {
      await prisma.catalogueSeedRecord.update({
        where: { table_key: { table: r.table, key: r.key } },
        data: { synthId: r.synthId, values: toJson(r.values) },
      });
      c.updated++;
    }
  }
  if (fresh.length) {
    await prisma.catalogueSeedRecord.createMany({
      data: fresh.map((r) => ({ ...r, values: toJson(r.values) })),
    });
    c.created = fresh.length;
  }
  if (stored.size) {
    await prisma.catalogueSeedRecord.deleteMany({
      where: { OR: [...stored.values()].map(({ table, key }) => ({ table, key })) },
    });
    c.removed = stored.size;
  }
  return c;
}

/** Check the data, then write it. Throws {@link CatalogueDataError}, having written nothing, when the data is wrong. */
export async function seedCatalogue(
  prisma: TenancyClient,
  data: CatalogueSeedData,
  getDef: (id: string) => AppSynthDef | null = getSynthDef
): Promise<SeedReport> {
  const rows = planCatalogue(data, getDef);
  const synthIds = rows.synths.map((s) => s.id);

  // Synths first: every other row points at one.
  const placeSynth = placer((await prisma.synth.aggregate({ _max: { order: true } }))._max.order);
  const synths = await reconcile(
    rows.synths,
    catalogueKey.SYNTH,
    byKey(await prisma.synth.findMany({ where: { id: { in: synthIds } } }), catalogueKey.SYNTH),
    (data) => prisma.synth.create({ data: { ...data, order: placeSynth(data.order) } }),
    ({ id, ...data }) => prisma.synth.update({ where: { id }, data }),
    PLACEMENT.SYNTH
  );

  const storedSounds = await prisma.synthSound.findMany({ where: { synthId: { in: synthIds } } });
  const placeSound = new Map(
    synthIds.map((id) => {
      const orders = storedSounds.filter((s) => s.synthId === id).map((s) => s.order);
      return [id, placer(orders.length ? Math.max(...orders) : null)];
    })
  );
  const sounds = await reconcile(
    rows.sounds,
    catalogueKey.SOUND,
    byKey(storedSounds, catalogueKey.SOUND),
    (data) =>
      prisma.synthSound.create({
        data: { ...data, order: placeSound.get(data.synthId)?.(data.order) ?? data.order },
      }),
    ({ synthId, slug, ...data }) =>
      prisma.synthSound.update({ where: { synthId_slug: { synthId, slug } }, data }),
    PLACEMENT.SOUND
  );

  const lineage = await reconcile(
    rows.lineage,
    catalogueKey.LINEAGE,
    byKey(
      await prisma.synthLineage.findMany({ where: { synthId: { in: synthIds } } }),
      catalogueKey.LINEAGE
    ),
    (data) => prisma.synthLineage.create({ data }),
    ({ synthId, ...data }) => prisma.synthLineage.update({ where: { synthId }, data })
  );

  const notes = await reconcile(
    rows.notes,
    catalogueKey.NOTE,
    byKey(
      await prisma.synthNote.findMany({ where: { key: { in: rows.notes.map((n) => n.key) } } }),
      catalogueKey.NOTE
    ),
    (data) => prisma.synthNote.create({ data }),
    ({ key, ...data }) => prisma.synthNote.update({ where: { key }, data })
  );

  // Last, so a run that fails part way leaves the record of the run before, which the next run completes.
  const records = await rewriteSeedRecord(prisma, seedRecords(rows));

  return { synths, sounds, lineage, notes, records };
}
