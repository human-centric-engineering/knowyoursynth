/**
 * The synth families' seed data loader and seed unit (`f-synth-families`): the loader refuses a file it cannot read,
 * shape or place, and the unit hands the files to `seedFamilies` and says when a member went in without its synth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { familyDataFiles, loadFamilyData } from '@/prisma/seeds/app-knowyoursynth/family-data';
import { seedFamilies } from '@/lib/app/families/seed';
import type { TenancyClient } from '@/lib/db/tenancy-extension';

vi.mock('@/lib/app/families/seed', () => ({ seedFamilies: vi.fn() }));

const family = {
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  members: [
    {
      slug: 'td-3',
      label: 'TD-3',
      instrument: 'behringer-td-3',
      synth: 'td-3',
      differences: 'A copy.',
    },
    { slug: 'tb-303', label: 'TB-303', instrument: 'roland-tb-303', differences: 'The original.' },
  ],
};
const folder = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'families-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};

describe('loadFamilyData', () => {
  it('reads every family file, sorted, and nothing else', () => {
    const dir = folder({ 'tb-303.json': JSON.stringify(family), 'notes.txt': 'not a family' });
    expect(familyDataFiles(dir)).toEqual(['tb-303.json']);
    expect(loadFamilyData(dir)).toEqual([family]);
  });

  it('has no files for a folder that is not there', () => {
    expect(familyDataFiles(join(tmpdir(), 'no-such-families-folder'))).toEqual([]);
  });

  it('refuses a file that is not JSON, one of the wrong shape, and one named for another family', () => {
    expect(() => loadFamilyData(folder({ 'tb-303.json': '{ nope' }))).toThrow(
      /^families\/tb-303\.json: /
    );
    expect(() =>
      loadFamilyData(folder({ 'tb-303.json': JSON.stringify({ ...family, members: 'two' }) }))
    ).toThrow(/^families\/tb-303\.json: /);
    expect(() => loadFamilyData(folder({ 'other.json': JSON.stringify(family) }))).toThrow(
      "families/other.json: names family tb-303, not the file's name"
    );
  });
});

describe('the 007-families seed unit', () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  const prisma = {} as TenancyClient;
  const report = (synthTaken: string[], defaultWithoutSynth: string[] = []) => ({
    families: { created: 4, updated: 0, unchanged: 0, edited: 0 },
    members: { created: 9, updated: 0, unchanged: 0, edited: 0 },
    synthTaken,
    defaultWithoutSynth,
    replaced: [],
  });

  beforeEach(() => vi.clearAllMocks());

  it('seeds the committed families and hashes their files', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/007-families');
    vi.mocked(seedFamilies).mockResolvedValue(report([]));

    await unit.run({ prisma, logger } as never);

    // every family file, in file order (t-324)
    expect(vi.mocked(seedFamilies).mock.calls[0][1].map((f) => f.id)).toEqual([
      'arp-2600',
      'cat',
      'cs-80',
      'dfam',
      'grandmother',
      'jupiter-8',
      'kobol',
      'minimoog',
      'moog-modular-systems',
      'ms-20',
      'music-easel',
      'ob-xa',
      'odyssey',
      'polivoks',
      'pro-one',
      'prophet-600',
      'syncussion-sy-1',
      'tb-303',
      'two-voice',
      'wasp',
    ]);
    expect(unit.hashInputs).toContain('data/families/tb-303.json');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns, naming them, when members went in without their synth', async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/007-families');
    vi.mocked(seedFamilies).mockResolvedValue(report(['tb-303/tb-303']));

    await unit.run({ prisma, logger } as never);

    expect(logger.warn).toHaveBeenCalledWith(
      'Family members written without their synth: another member has it',
      { members: ['tb-303/tb-303'] }
    );
  });

  it("warns, naming them, when a family's default member has no synth", async () => {
    const { default: unit } = await import('@/prisma/seeds/app-knowyoursynth/007-families');
    vi.mocked(seedFamilies).mockResolvedValue(report([], ['tb-303']));

    await unit.run({ prisma, logger } as never);

    expect(logger.warn).toHaveBeenCalledWith(
      'Families whose default member has no synth: the read opens on another',
      { families: ['tb-303'] }
    );
  });
});
