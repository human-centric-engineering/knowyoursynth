/**
 * The committed seed data, as exported from the prototype (`prototype/tools/export-content.mjs`), and the loader and
 * seed unit that read it.
 *
 * The counts are the prototype's own: plan §3's synth table records 99 sounds for Model D, and the lineage, notes and
 * limits are counted in the prototype's Model D lineage and unusual files and in its `src/lib/limits.js`. An export that
 * dropped or doubled anything fails here.
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

describe('the exported Model D content', () => {
  it('has every file the export writes', () => {
    expect(catalogueDataFiles()).toEqual([
      'lineage/model-d.json',
      'notes/model-d.json',
      'notes/shared.json',
      'sounds/model-d.json',
      'synths.json',
    ]);
  });

  it('matches the prototype’s counts: 99 sounds, 9 lineage entries, 38 unusual notes, 2 + 5 limits', () => {
    const sounds = data.sounds.find((f) => f.synth === 'model-d');
    const lineage = data.lineage.find((f) => f.synth === 'model-d');
    const notes = data.notes.find((f) => f.synth === 'model-d');
    expect(sounds?.sounds).toHaveLength(99);
    expect(new Set(sounds?.sounds.map((s) => s.id)).size).toBe(99);
    expect(lineage?.timeline).toHaveLength(9);
    expect(lineage?.relatives).toHaveLength(5);
    expect(notes?.unusual).toHaveLength(38);
    expect(notes?.limits.items).toHaveLength(2);
    expect(data.shared.limits).toHaveLength(5);
    expect(data.listing.synths).toEqual([{ id: 'model-d', order: 0, listed: true }]);
  });

  it('records the definition version the sounds were made on, and leaves "Heard on" to the databank', () => {
    expect(data.sounds[0].version).toBe(getSynthDef('model-d')?.version);
    expect(data.lineage[0]).not.toHaveProperty('heard');
  });

  it('passes the validator, sound by sound, for its definition version', () => {
    const def = getSynthDef('model-d');
    if (!def) throw new Error('model-d is registered');
    const failures = data.sounds[0].sounds.flatMap((s) => {
      const r = validatePreset(def, s);
      return r.ok ? [] : [`${String(s.id)}: ${r.problems.map((p) => p.message).join('; ')}`];
    });
    expect(failures).toEqual([]);
  });

  it('plans into rows with nothing refused', () => {
    const rows = planCatalogue(data);
    expect(rows.sounds).toHaveLength(99);
    expect(rows.notes).toHaveLength(46);
    expect(new Set(rows.notes.map((n) => n.key)).size).toBe(46);
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
