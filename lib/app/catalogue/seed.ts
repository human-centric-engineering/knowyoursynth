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
 * - **Never deletes.** A row the data no longer has stays, so an empty or partial source cannot empty a table. Retiring
 *   content is an admin's act.
 *
 * Without a transaction, deliberately: a write that fails part way leaves rows the next run completes, because each
 * row is matched on its natural key.
 */
import type { Prisma, SynthNoteKind } from '@prisma/client';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { noteKey, type CatalogueSeedData } from '@/lib/app/catalogue/data';

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

export type SeedReport = Record<'synths' | 'sounds' | 'lineage' | 'notes', SeedCounts>;

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

/** A plain-data copy, typed as JSON for a Prisma `Json` column. */
const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

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
  // Each synth has at most one file of each kind: a second would plan the same rows twice and fail on a unique key
  // part way through writing, which is the half-written state this check exists to prevent.
  const seen = new Set<string>();
  const defFor = (file: string, synth: string) => {
    const kind = file.slice(0, file.indexOf('/'));
    if (seen.has(`${kind}/${synth}`)) {
      problems.push(`more than one ${kind} file is for ${synth} (${file} is a second)`);
      return undefined;
    }
    seen.add(`${kind}/${synth}`);
    const def = defs.get(synth);
    if (!def) problems.push(`${file} is for ${synth}, which synths.json does not list`);
    return def;
  };

  for (const file of data.sounds) {
    const name = `sounds/${file.synth}.json`;
    const def = defFor(name, file.synth);
    if (!def) continue;
    if (file.version !== def.version) {
      // No definition has a mapping between versions yet; the first rename ships one (plan §5).
      problems.push(
        `${name} was made on definition version ${file.version}, and ${def.id} is at version ${def.version}`
      );
      continue;
    }
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

  for (const file of data.lineage) {
    if (!defFor(`lineage/${file.synth}.json`, file.synth)) continue;
    rows.lineage.push({
      synthId: file.synth,
      title: file.title,
      intro: file.intro,
      timeline: toJson(file.timeline),
      relatives: toJson(file.relatives),
      users: file.users ?? [],
      note: file.note ?? null,
    });
  }

  const keys = new Set<string>();
  const addNote = (file: string, note: NoteRow) => {
    if (keys.has(note.key)) problems.push(`${file} has two notes with the key ${note.key}`);
    keys.add(note.key);
    rows.notes.push(note);
  };
  for (const file of data.notes) {
    const name = `notes/${file.synth}.json`;
    const def = defFor(name, file.synth);
    if (!def) continue;
    const targets = new Set([
      ...def.controls.map((c) => c.id),
      ...def.jacks.map((j) => j.id),
      ...def.areas.map((a) => a.id),
    ]);
    file.unusual.forEach(({ target, text }, order) => {
      if (!targets.has(target))
        problems.push(`${name} has an unusual note on ${target}, which ${def.id} does not have`);
      const key = noteKey.unusual(def.id, target);
      addNote(name, { key, kind: 'UNUSUAL', synthId: def.id, target, title: null, text, order });
    });
    addNote(name, {
      key: noteKey.limitIntro(def.id),
      kind: 'LIMIT_INTRO',
      synthId: def.id,
      target: null,
      title: null,
      text: file.limits.intro,
      order: 0,
    });
    file.limits.items.forEach(({ title, text }, order) =>
      addNote(name, {
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
  data.shared.limits.forEach(({ title, text }, order) =>
    addNote('notes/shared.json', {
      key: noteKey.limit(null, title),
      kind: 'LIMIT',
      synthId: null,
      target: null,
      title,
      text,
      order,
    })
  );

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
  update: (row: Row) => Promise<unknown>
): Promise<SeedCounts> {
  const c = counts();
  for (const row of planned) {
    const current = existing.get(keyOf(row));
    if (!current) {
      await create(row);
      c.created++;
    } else if (current.editedAt) {
      c.edited++;
    } else if (matches(current, row)) {
      c.unchanged++;
    } else {
      await update(row);
      c.updated++;
    }
  }
  return c;
}

const byKey = <T>(rows: T[], keyOf: (row: T) => string) => new Map(rows.map((r) => [keyOf(r), r]));
const soundKey = (r: { synthId: string; slug: string }) => `${r.synthId}/${r.slug}`;

/** Check the data, then write it. Throws {@link CatalogueDataError}, having written nothing, when the data is wrong. */
export async function seedCatalogue(
  prisma: TenancyClient,
  data: CatalogueSeedData,
  getDef: (id: string) => AppSynthDef | null = getSynthDef
): Promise<SeedReport> {
  const rows = planCatalogue(data, getDef);
  const synthIds = rows.synths.map((s) => s.id);

  // Synths first: every other row points at one.
  const synths = await reconcile(
    rows.synths,
    (r) => r.id,
    byKey(await prisma.synth.findMany({ where: { id: { in: synthIds } } }), (r) => r.id),
    (data) => prisma.synth.create({ data }),
    ({ id, ...data }) => prisma.synth.update({ where: { id }, data })
  );

  const sounds = await reconcile(
    rows.sounds,
    soundKey,
    byKey(await prisma.synthSound.findMany({ where: { synthId: { in: synthIds } } }), soundKey),
    (data) => prisma.synthSound.create({ data }),
    ({ synthId, slug, ...data }) =>
      prisma.synthSound.update({ where: { synthId_slug: { synthId, slug } }, data })
  );

  const lineage = await reconcile(
    rows.lineage,
    (r) => r.synthId,
    byKey(
      await prisma.synthLineage.findMany({ where: { synthId: { in: synthIds } } }),
      (r) => r.synthId
    ),
    (data) => prisma.synthLineage.create({ data }),
    ({ synthId, ...data }) => prisma.synthLineage.update({ where: { synthId }, data })
  );

  const notes = await reconcile(
    rows.notes,
    (r) => r.key,
    byKey(
      await prisma.synthNote.findMany({ where: { key: { in: rows.notes.map((n) => n.key) } } }),
      (r) => r.key
    ),
    (data) => prisma.synthNote.create({ data }),
    ({ key, ...data }) => prisma.synthNote.update({ where: { key }, data })
  );

  return { synths, sounds, lineage, notes };
}
