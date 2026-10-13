/**
 * The databank's loader (`bank-data.ts`) and seed unit (`002-bank.ts`). The committed data's counts and joins are
 * `joins.test.ts`'s; this covers how a bad file is reported and what re-runs the unit.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BANK_DATA_DIR,
  bankDataFiles,
  loadBankData,
} from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { catalogueDataFiles } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

vi.mock('@/lib/app/bank/seed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/bank/seed')>()),
  seedBank: vi.fn().mockResolvedValue({ joinsRewritten: 0 }),
}));

const EMPTY = {
  'makers.json': { makers: [] },
  'instruments.json': { instruments: [] },
  'artists.json': { artists: [] },
  'songs.json': { songs: [] },
};

function folder(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kys-bank-'));
  for (const [rel, content] of Object.entries(files))
    writeFileSync(join(dir, rel), JSON.stringify(content));
  return dir;
}

describe('loadBankData', () => {
  it('reads the four files', () => {
    expect(loadBankData(folder(EMPTY))).toEqual({
      makers: [],
      instruments: [],
      artists: [],
      songs: [],
    });
  });

  it('names the file and the field when a file has the wrong shape', () => {
    const dir = folder({
      ...EMPTY,
      'instruments.json': {
        instruments: [{ id: 'x', name: 'X', maker: 'M', year: '1980', kind: 'drum', text: 'T' }],
      },
    });
    expect(() => loadBankData(dir)).toThrow(/^bank\/instruments\.json: [\s\S]*kind/);
  });

  it('refuses an id that cannot sit in a URL', () => {
    const dir = folder({
      ...EMPTY,
      'songs.json': {
        songs: [
          {
            id: 'Bad Id',
            title: 'T',
            kind: 'song',
            artists: ['a'],
            parts: [{ instruments: ['i'], on: 'I', text: 'X' }],
          },
        ],
      },
    });
    expect(() => loadBankData(dir)).toThrow(/^bank\/songs\.json: [\s\S]*lowercase/);
  });

  it('names the file when it is not JSON, or is missing', () => {
    const dir = folder(EMPTY);
    writeFileSync(join(dir, 'makers.json'), '{ "makers": [], }');
    expect(() => loadBankData(dir)).toThrow(/^bank\/makers\.json: /);
    expect(() => loadBankData(mkdtempSync(join(tmpdir(), 'kys-bank-')))).toThrow(
      /^bank\/makers\.json: /
    );
  });
});

describe('bankDataFiles', () => {
  it('lists the JSON files only, in name order', () => {
    const dir = folder(EMPTY);
    writeFileSync(join(dir, 'README.txt'), 'not data');
    expect(bankDataFiles(dir)).toEqual([
      'artists.json',
      'instruments.json',
      'makers.json',
      'songs.json',
    ]);
  });

  it('is not part of the catalogue unit’s hash, which would re-run the catalogue for a databank edit', () => {
    expect(catalogueDataFiles().filter((f) => f.startsWith('bank'))).toEqual([]);
    expect(catalogueDataFiles().length).toBeGreaterThan(0);
  });
});

describe('the seed unit', () => {
  it('re-runs when the data, the loader or the databank code changes: every hash input exists', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/002-bank');
    const here = resolve(BANK_DATA_DIR, '..', '..');
    const inputs = unit.hashInputs ?? [];
    expect(inputs.filter((rel) => !existsSync(resolve(here, rel)))).toEqual([]);
    const normalised = inputs.map((rel) => resolve(here, rel));
    for (const expected of [
      'prisma/seeds/app-knowyoursynth/data/bank/songs.json',
      'prisma/seeds/app-knowyoursynth/data/bank/makers.json',
      'prisma/seeds/app-knowyoursynth/bank-data.ts',
      'lib/app/bank/seed.ts',
      'lib/app/bank/joins.ts',
      'lib/app/catalogue/seed.ts',
    ])
      expect(normalised).toContain(resolve(process.cwd(), expected));
  });

  it('runs after the catalogue, whose synths and sounds it points at', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/002-bank');
    const { default: catalogue } = await import('@/prisma/seeds/app-knowyoursynth/001-catalogue');
    expect([unit.name, catalogue.name].sort()).toEqual([catalogue.name, unit.name]);
  });

  it('seeds the loaded data through the context’s client', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/002-bank');
    const { seedBank } = await import('@/lib/app/bank/seed');
    const prisma = {};
    const logger = { info: vi.fn() };
    await unit.run({ prisma, logger } as never);
    expect(seedBank).toHaveBeenCalledWith(prisma, loadBankData());
    expect(logger.info).toHaveBeenCalledWith('Databank seeded', expect.any(Object));
  });
});
