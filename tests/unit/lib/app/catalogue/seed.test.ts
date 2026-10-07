/**
 * The catalogue seed's rules (`fp4`), against a small stateful fake of the four tables.
 *
 * The fake hands JSON columns back with their keys in a different order, as Postgres `jsonb` does, so "a re-run
 * writes nothing" is proved against the reordering that would otherwise make every row look changed.
 *
 * The data is real: Model D's definition, and the first sounds, lineage and notes from the committed seed data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  CatalogueDataError,
  planCatalogue,
  sameValue,
  seedCatalogue,
} from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

type Row = Record<string, unknown>;

/** Reverse every object's key order, all the way down: what a jsonb round trip may do. */
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reorder(v)])
    );
  return value;
}

/** One table: rows by natural key, `findMany` on an `in` filter, `create` and `update`. Nothing can delete. */
function table(keyOf: (row: Row) => string, filterField: string) {
  const rows = new Map<string, Row>();
  return {
    rows,
    findMany: vi.fn(async ({ where }: { where: Record<string, { in: string[] }> }) => {
      const wanted = new Set(where[filterField].in);
      return [...rows.values()]
        .filter((r) => wanted.has(String(r[filterField])))
        .map((r) => reorder(r) as Row);
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { ...data, editedAt: null };
      rows.set(keyOf(row), row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const key = keyOf('synthId_slug' in where ? (where.synthId_slug as Row) : where);
      const row = { ...rows.get(key), ...data };
      rows.set(key, row);
      return row;
    }),
  };
}

function fakeDb() {
  return {
    synth: table((r) => String(r.id), 'id'),
    synthSound: table((r) => `${String(r.synthId)}/${String(r.slug)}`, 'synthId'),
    synthLineage: table((r) => String(r.synthId), 'synthId'),
    synthNote: table((r) => String(r.key), 'key'),
  };
}
type FakeDb = ReturnType<typeof fakeDb>;
const asClient = (db: FakeDb) => db as unknown as TenancyClient;

const writes = (db: FakeDb) =>
  Object.values(db).reduce(
    (n, t) => n + t.create.mock.calls.length + t.update.mock.calls.length,
    0
  );

const real = loadCatalogueData();

/** Model D with its first three sounds: small, and every part of it real. */
function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  data.sounds = data.sounds.map((f) => ({ ...f, sounds: f.sounds.slice(0, 3) }));
  return data;
}

describe('seedCatalogue', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = fakeDb();
  });

  it('creates every row on an empty database', async () => {
    const report = await seedCatalogue(asClient(db), sample());

    expect(report.synths).toEqual({ created: 1, updated: 0, unchanged: 0, edited: 0 });
    expect(report.sounds.created).toBe(3);
    expect(report.lineage.created).toBe(1);
    // 38 unusual notes, the intro, 2 Model D limits and 5 shared ones.
    expect(report.notes.created).toBe(46);
    const synth = db.synth.rows.get('model-d');
    expect(synth).toMatchObject({ name: 'Model D', maker: 'Behringer', listed: true, order: 0 });
    const first = db.synthSound.rows.get(`model-d/${String(real.sounds[0].sounds[0].id)}`);
    expect(first).toMatchObject({ definitionVersion: 1, order: 0 });
    expect(sameValue(first?.steps, real.sounds[0].sounds[0].steps)).toBe(true);
  });

  it('writes nothing on a re-run, though jsonb hands the JSON back in another key order', async () => {
    await seedCatalogue(asClient(db), sample());
    const before = writes(db);
    // The fake really does reorder: a plain comparison would call every sound changed.
    const stored = await db.synthSound.findMany({ where: { synthId: { in: ['model-d'] } } });
    expect(JSON.stringify(stored[0].steps)).not.toBe(
      JSON.stringify(db.synthSound.rows.get(`model-d/${String(stored[0].slug)}`)?.steps)
    );

    const report = await seedCatalogue(asClient(db), sample());

    expect(writes(db)).toBe(before);
    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 3, edited: 0 });
    expect(report.notes).toEqual({ created: 0, updated: 0, unchanged: 46, edited: 0 });
  });

  it('updates a row whose data changed, and only that row', async () => {
    await seedCatalogue(asClient(db), sample());
    const data = sample();
    const sound = data.sounds[0].sounds[1];
    sound.blurb = 'A changed blurb.';

    const report = await seedCatalogue(asClient(db), data);

    expect(report.sounds).toEqual({ created: 0, updated: 1, unchanged: 2, edited: 0 });
    expect(db.synthSound.update).toHaveBeenCalledTimes(1);
    expect(db.synthSound.rows.get(`model-d/${String(sound.id)}`)?.blurb).toBe('A changed blurb.');
  });

  it('never writes a row an admin has edited, even when the data differs', async () => {
    await seedCatalogue(asClient(db), sample());
    const slug = String(real.sounds[0].sounds[0].id);
    const edited = db.synthSound.rows.get(`model-d/${slug}`);
    db.synthSound.rows.set(`model-d/${slug}`, {
      ...edited,
      blurb: 'The admin’s blurb.',
      editedAt: new Date('2026-10-07'),
    });
    db.synth.rows.set('model-d', {
      ...db.synth.rows.get('model-d'),
      order: 5,
      editedAt: new Date('2026-10-07'),
    });

    const report = await seedCatalogue(asClient(db), sample());

    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 2, edited: 1 });
    expect(report.synths).toEqual({ created: 0, updated: 0, unchanged: 0, edited: 1 });
    expect(db.synthSound.rows.get(`model-d/${slug}`)?.blurb).toBe('The admin’s blurb.');
    expect(db.synth.rows.get('model-d')?.order).toBe(5);
    expect(db.synthSound.update).not.toHaveBeenCalled();
    expect(db.synth.update).not.toHaveBeenCalled();
  });

  it('deletes nothing when the source is empty', async () => {
    await seedCatalogue(asClient(db), sample());
    const counts = Object.values(db).map((t) => t.rows.size);
    expect(counts.every((n) => n > 0)).toBe(true);

    const report = await seedCatalogue(asClient(db), {
      listing: { synths: [] },
      sounds: [],
      lineage: [],
      notes: [],
      shared: real.shared,
    });

    expect(Object.values(db).map((t) => t.rows.size)).toEqual(counts);
    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 0, edited: 0 });
  });

  it('deletes nothing when a sound leaves the data', async () => {
    await seedCatalogue(asClient(db), sample());
    const data = sample();
    data.sounds[0].sounds.pop();

    await seedCatalogue(asClient(db), data);

    expect(db.synthSound.rows.size).toBe(3);
  });

  it('refuses a sound its definition rejects, and writes nothing at all', async () => {
    const data = sample();
    const steps = data.sounds[0].sounds[1].steps;
    if (!Array.isArray(steps)) throw new Error('fixture: a sound has steps');
    const id = String(data.sounds[0].sounds[1].id);
    data.sounds[0].sounds[1].steps = [
      ...steps,
      { title: 'Too far', module: 'filter', why: 'Out of range.', set: { 'filter.cutoff': 99 } },
    ];

    const run = seedCatalogue(asClient(db), data);

    await expect(run).rejects.toBeInstanceOf(CatalogueDataError);
    await expect(run).rejects.toThrow(`sound ${id} at steps.${steps.length}.set.filter.cutoff`);
    expect(writes(db)).toBe(0);
    expect(db.synth.findMany).not.toHaveBeenCalled();
  });
});

describe('planCatalogue', () => {
  it('refuses sounds made on a definition version the registry does not have', () => {
    const data = sample();
    data.sounds[0].version = 2;
    expect(() => planCatalogue(data)).toThrow(
      'sounds/model-d.json was made on definition version 2, and model-d is at version 1'
    );
  });

  it('refuses an unusual note on something the synth does not have', () => {
    const data = sample();
    data.notes[0].unusual.push({ target: 'osc9.wave', text: 'No such oscillator.' });
    expect(() => planCatalogue(data)).toThrow(
      'has an unusual note on osc9.wave, which model-d does not have'
    );
  });

  it('refuses a listed synth with no definition, and files for a synth not listed', () => {
    const data = sample();
    data.listing.synths.push({ id: 'neutron', order: 1, listed: true });
    data.listing.synths = data.listing.synths.filter((s) => s.id !== 'model-d');

    try {
      planCatalogue(data);
      expect.unreachable('planCatalogue should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogueDataError);
      const { problems } = error as CatalogueDataError;
      expect(problems).toEqual(
        expect.arrayContaining([
          'synths.json lists neutron, which has no definition in lib/app/synths/defs',
          'sounds/model-d.json is for model-d, which synths.json does not list',
          'lineage/model-d.json is for model-d, which synths.json does not list',
          'notes/model-d.json is for model-d, which synths.json does not list',
        ])
      );
    }
  });

  it('refuses two sounds with one id, and a synth listed twice', () => {
    const data = sample();
    data.sounds[0].sounds.push(structuredClone(data.sounds[0].sounds[0]));
    data.listing.synths.push({ id: 'model-d', order: 3, listed: false });
    expect(() => planCatalogue(data)).toThrow(
      /two sounds with the id[\s\S]*lists model-d twice|lists model-d twice[\s\S]*two sounds/
    );
  });

  it('refuses a second file of one kind for a synth, which would otherwise fail part way through writing', () => {
    const data = sample();
    data.lineage.push(structuredClone(data.lineage[0]));
    data.notes.push(structuredClone(data.notes[0]));
    expect(() => planCatalogue(data)).toThrow(
      /more than one lineage file is for model-d[\s\S]*more than one notes file is for model-d/
    );
  });

  it('refuses a library sound marked as designed by the tutor', () => {
    const data = sample();
    data.sounds[0].sounds[0].ai = true;
    expect(() => planCatalogue(data)).toThrow(
      `sound ${String(data.sounds[0].sounds[0].id)} is marked ai, which a library sound cannot be`
    );
  });

  it('takes a synth’s descriptive columns from its definition', () => {
    const def = getSynthDef('model-d');
    const rows = planCatalogue(sample());
    expect(rows.synths).toEqual([
      {
        id: 'model-d',
        name: def?.name,
        maker: def?.maker,
        year: def?.year,
        heritage: def?.heritage,
        summary: def?.summary,
        listed: true,
        order: 0,
      },
    ]);
  });
});

describe('sameValue', () => {
  it('ignores object key order and undefined members, but not array order', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(
      true
    );
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(new Date('2026-10-07'), new Date('2026-10-07'))).toBe(true);
    expect(sameValue('1', 1)).toBe(false);
  });
});
