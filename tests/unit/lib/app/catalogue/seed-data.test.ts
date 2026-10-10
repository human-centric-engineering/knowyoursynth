/**
 * The committed seed data, as exported from the prototype (`prototype/tools/export-content.mjs`), and the loader and
 * seed unit that read it.
 *
 * The counts are the prototype's own (`EXPORTED` below). An export that dropped or doubled anything fails here.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { planCatalogue } from '@/lib/app/catalogue/seed';
import { getSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import {
  CATALOGUE_DATA_DIR,
  catalogueDataFiles,
  loadCatalogueData,
} from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

vi.mock('@/lib/app/catalogue/seed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/catalogue/seed')>()),
  seedCatalogue: vi.fn().mockResolvedValue({ synths: {}, sounds: {}, lineage: {}, notes: {} }),
}));

const data = loadCatalogueData();

/**
 * Each exported synth's counts, as the prototype has them. Sounds are plan §3's synth table; lineage, unusual notes
 * and limits are counted in the prototype's lineage and unusual files for the synth and in its `src/lib/limits.js`.
 */
const EXPORTED: {
  id: string;
  sounds: number;
  timeline: number;
  relatives: number;
  unusual: number;
  limits: number;
}[] = [
  { id: 'model-d', sounds: 99, timeline: 9, relatives: 5, unusual: 38, limits: 2 },
  { id: 'neutron', sounds: 103, timeline: 11, relatives: 5, unusual: 42, limits: 3 },
  { id: 'pro-1', sounds: 98, timeline: 7, relatives: 5, unusual: 33, limits: 4 },
  { id: 'k2', sounds: 93, timeline: 8, relatives: 5, unusual: 30, limits: 5 },
  { id: 'b2600', sounds: 93, timeline: 7, relatives: 5, unusual: 45, limits: 4 },
  { id: 'kobol', sounds: 40, timeline: 5, relatives: 3, unusual: 16, limits: 4 },
  { id: 'wasp-deluxe', sounds: 30, timeline: 4, relatives: 2, unusual: 17, limits: 5 },
  { id: 'tb-303', sounds: 20, timeline: 5, relatives: 3, unusual: 9, limits: 4 },
  { id: 'td-3', sounds: 20, timeline: 4, relatives: 3, unusual: 9, limits: 4 },
  { id: 'model-15', sounds: 12, timeline: 5, relatives: 4, unusual: 14, limits: 5 },
  { id: 'grandmother', sounds: 8, timeline: 5, relatives: 3, unusual: 15, limits: 4 },
];

describe('the exported content', () => {
  it('has every file the export writes, and nothing for a synth not exported', () => {
    const ids = EXPORTED.map((e) => e.id).sort();
    expect(catalogueDataFiles()).toEqual(
      [
        ...ids.map((id) => `lineage/${id}.json`),
        ...[...ids, 'shared'].sort().map((id) => `notes/${id}.json`),
        ...ids.map((id) => `sounds/${id}.json`),
        'synths.json',
      ].sort()
    );
  });

  it('lists each synth at its place in the prototype’s picker', () => {
    expect(data.listing.synths).toEqual([
      { id: 'model-d', order: 0, listed: true },
      { id: 'neutron', order: 1, listed: true },
      { id: 'pro-1', order: 2, listed: true },
      { id: 'k2', order: 3, listed: true },
      { id: 'b2600', order: 4, listed: true },
      { id: 'kobol', order: 8, listed: true },
      { id: 'wasp-deluxe', order: 10, listed: true },
      { id: 'tb-303', order: 15, listed: true },
      { id: 'td-3', order: 16, listed: true },
      { id: 'model-15', order: 23, listed: true },
      { id: 'grandmother', order: 24, listed: true },
    ]);
  });

  it('has the 5 limits true of every panel', () => {
    expect(data.shared.limits).toHaveLength(5);
  });

  describe.each(EXPORTED)('$id', (want) => {
    const sounds = data.sounds.find((f) => f.synth === want.id);
    const lineage = data.lineage.find((f) => f.synth === want.id);
    const notes = data.notes.find((f) => f.synth === want.id);

    it('matches the prototype’s counts of sounds, lineage entries, unusual notes and limits', () => {
      expect(sounds?.sounds).toHaveLength(want.sounds);
      expect(new Set(sounds?.sounds.map((s) => s.id)).size).toBe(want.sounds);
      expect(lineage?.timeline).toHaveLength(want.timeline);
      expect(lineage?.relatives).toHaveLength(want.relatives);
      expect(notes?.unusual).toHaveLength(want.unusual);
      expect(notes?.limits.items).toHaveLength(want.limits);
    });

    it('records the definition version the sounds were made on, and leaves "Heard on" to the databank', () => {
      const version = getSynthDef(want.id)?.version;
      expect(version, `${want.id} is registered with a version`).toBeDefined();
      expect(sounds?.version).toBe(version);
      expect(lineage).not.toHaveProperty('heard');
    });

    it('passes the validator, sound by sound, for its definition version', () => {
      const def = getSynthDef(want.id);
      if (!def) throw new Error(`${want.id} is registered`);
      const failures = (sounds?.sounds ?? []).flatMap((s) => {
        const r = validatePreset(def, s);
        return r.ok ? [] : [`${String(s.id)}: ${r.problems.map((p) => p.message).join('; ')}`];
      });
      expect(failures).toEqual([]);
    });
  });

  it('plans into rows with nothing refused: every sound, and each synth’s notes, limits intro and limits', () => {
    const rows = planCatalogue(data);
    const sum = (f: (e: (typeof EXPORTED)[number]) => number) =>
      EXPORTED.reduce((n, e) => n + f(e), 0);
    expect(rows.sounds).toHaveLength(sum((e) => e.sounds));
    const notes = sum((e) => e.unusual + 1 + e.limits) + 5;
    expect(rows.notes).toHaveLength(notes);
    expect(new Set(rows.notes.map((n) => n.key)).size).toBe(notes);
  });
});

describe('loadCatalogueData', () => {
  function folder(files: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), 'kys-catalogue-'));
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), JSON.stringify(content));
    }
    return dir;
  }

  it('names the file and the field when a file has the wrong shape', () => {
    const dir = folder({
      'synths.json': { synths: [{ id: 'model-d', order: -1, listed: true }] },
      'sounds/.keep.json': {},
      'lineage/x.json': {},
      'notes/shared.json': { limits: [] },
    });
    expect(() => loadCatalogueData(dir)).toThrow(/^synths\.json: [\s\S]*order/);
  });

  it('names the file when it is not JSON at all', () => {
    const dir = folder({ 'notes/shared.json': { limits: [{ title: 'T', text: 'X' }] } });
    writeFileSync(join(dir, 'synths.json'), '{ "synths": [], }');
    expect(() => loadCatalogueData(dir)).toThrow(/^synths\.json: /);
  });

  it('refuses a per-synth file whose name is not its synth', () => {
    const dir = folder({
      'synths.json': { synths: [] },
      'sounds/neutron.json': { synth: 'model-d', version: 1, sounds: [] },
      'lineage/.keep.json': {
        synth: '.keep',
        title: 'T',
        intro: 'I',
        timeline: [{ year: '1', name: 'N', text: 'X' }],
        relatives: [],
      },
      'notes/shared.json': { limits: [{ title: 'T', text: 'X' }] },
    });
    expect(() => loadCatalogueData(dir)).toThrow(
      'sounds/neutron.json: is for model-d, so it should be sounds/model-d.json'
    );
  });

  it('reads every per-synth file but shared.json as a synth’s', () => {
    const dir = folder({
      'synths.json': { synths: [] },
      'sounds/a.json': { synth: 'a', version: 1, sounds: [] },
      'lineage/a.json': {
        synth: 'a',
        title: 'T',
        intro: 'I',
        timeline: [{ year: '1', name: 'N', text: 'X' }],
        relatives: [],
      },
      'notes/a.json': { synth: 'a', unusual: [], limits: { intro: 'I', items: [] } },
      'notes/shared.json': { limits: [{ title: 'T', text: 'X' }] },
    });
    const loaded = loadCatalogueData(dir);
    expect(loaded.notes.map((n) => n.synth)).toEqual(['a']);
    expect(loaded.shared.limits).toEqual([{ title: 'T', text: 'X' }]);
  });
});

describe('the seed unit', () => {
  it('re-runs when anything that decides its rows changes: every hash input exists', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/001-catalogue');
    const here = resolve(CATALOGUE_DATA_DIR, '..');
    const inputs = unit.hashInputs ?? [];
    expect(inputs.filter((rel) => !existsSync(resolve(here, rel)))).toEqual([]);
    const normalised = inputs.map((rel) => resolve(here, rel));
    for (const expected of [
      'prisma/seeds/app-knowyoursynth/data/sounds/model-d.json',
      'prisma/seeds/app-knowyoursynth/data/notes/shared.json',
      'prisma/seeds/app-knowyoursynth/catalogue-data.ts',
      'lib/app/catalogue/seed.ts',
      'lib/app/synths/defs/model-d.ts',
      'lib/app/synths/validate.ts',
      'lib/app/synths/contract.ts',
      'lib/app/synths/lib/patch.ts',
    ])
      expect(normalised).toContain(resolve(process.cwd(), expected));
  });

  it('seeds the loaded data through the context’s client', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/001-catalogue');
    const { seedCatalogue } = await import('@/lib/app/catalogue/seed');
    const prisma = {};
    const logger = { info: vi.fn() };
    await unit.run({ prisma, logger } as never);
    expect(seedCatalogue).toHaveBeenCalledWith(prisma, data);
    expect(logger.info).toHaveBeenCalledWith('Catalogue seeded', expect.any(Object));
  });
});
