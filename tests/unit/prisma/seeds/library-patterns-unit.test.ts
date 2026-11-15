/**
 * The pattern library's seed unit, `005-library-patterns` (t-254): it hashes the researched defaults, runs the riff,
 * batch and defaults passes in that order, then brings the riffs in the catalogue's record in line, and warns
 * on what any pass skipped. The passes themselves are tested in `tests/unit/lib/app/patterns/`. Also the defaults file's loader, which
 * names the file when it cannot read it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const calls = vi.hoisted(() => [] as string[]);
const counts = vi.hoisted(() => ({
  researchedSkipped: [] as { key: string; reason: string }[],
  defaultsSkipped: [] as { sound: string; reason: string }[],
}));

vi.mock('@/lib/app/patterns/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/patterns/library')>()),
  syncRiffPatterns: vi.fn(async () => {
    calls.push('riffs');
    return {};
  }),
  riffFollowers: vi.fn(async () => {
    calls.push('followers');
    return new Set(['teo-5/teo-jump-brass']);
  }),
}));
vi.mock('@/lib/app/catalogue/seed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/catalogue/seed')>()),
  syncFollowedRiffRecords: vi.fn(async () => {
    calls.push('records');
    return 1;
  }),
}));
vi.mock('@/lib/app/patterns/library-researched', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/patterns/library-researched')>()),
  syncResearchedPatterns: vi.fn(async () => {
    calls.push('researched');
    return { skipped: counts.researchedSkipped };
  }),
}));
vi.mock('@/lib/app/patterns/library-defaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/patterns/library-defaults')>()),
  syncResearchedDefaults: vi.fn(async () => {
    calls.push('defaults');
    return { skipped: counts.defaultsSkipped };
  }),
}));

import unit from '@/prisma/seeds/app-knowyoursynth/005-library-patterns';
import { syncResearchedPatterns } from '@/lib/app/patterns/library-researched';
import { syncResearchedDefaults } from '@/lib/app/patterns/library-defaults';
import { syncFollowedRiffRecords } from '@/lib/app/catalogue/seed';
import {
  PATTERN_DATA_DIR,
  PATTERN_DEFAULTS_FILE,
  loadPatternDefaults,
} from '@/prisma/seeds/app-knowyoursynth/pattern-data';

const run = async () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  const prisma = {};
  await unit.run({ prisma, logger } as never);
  return { logger, prisma };
};

beforeEach(() => {
  calls.length = 0;
  counts.researchedSkipped = [];
  counts.defaultsSkipped = [];
  vi.clearAllMocks();
});

describe('005-library-patterns', () => {
  it('re-runs when the defaults change: they are a hash input, and every input exists', () => {
    const here = resolve(PATTERN_DATA_DIR, '..', '..');
    const inputs = (unit.hashInputs ?? []).map((rel) => resolve(here, rel));
    expect(inputs.filter((f) => !existsSync(f))).toEqual([]);
    expect(inputs).toContain(PATTERN_DEFAULTS_FILE);
  });

  it('runs the riffs, the batches, the defaults, then brings the catalogue record’s riffs in line', async () => {
    const { prisma } = await run();
    const { defaults } = loadPatternDefaults();
    expect(calls).toEqual(['riffs', 'researched', 'defaults', 'followers', 'records']);
    expect(syncResearchedPatterns).toHaveBeenCalledWith(prisma, expect.any(Array));
    expect(syncResearchedDefaults).toHaveBeenCalledWith(prisma, defaults);
    expect(syncFollowedRiffRecords).toHaveBeenCalledWith(
      prisma,
      new Set(['teo-5/teo-jump-brass']),
      expect.any(Map)
    );
  });

  it('warns on what the batch and defaults passes skipped, and only then', async () => {
    expect((await run()).logger.warn).not.toHaveBeenCalled();

    counts.researchedSkipped = [{ key: 'researched:a/b', reason: 'gone' }];
    counts.defaultsSkipped = [{ sound: 'a/b', reason: 'gone' }];
    const { logger } = await run();
    expect(logger.warn).toHaveBeenCalledWith('Researched patterns skipped', {
      skipped: counts.researchedSkipped,
    });
    expect(logger.warn).toHaveBeenCalledWith('Researched defaults skipped', {
      skipped: counts.defaultsSkipped,
    });
  });
});

describe('loadPatternDefaults', () => {
  it('names the file when it is not JSON, or does not fit the schema', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'defaults-')), 'pattern-defaults.json');
    writeFileSync(file, '{ not json');
    expect(() => loadPatternDefaults(file)).toThrow(/^pattern-defaults\.json: /);
    writeFileSync(file, JSON.stringify({ task: 'nope' }));
    expect(() => loadPatternDefaults(file)).toThrow(/^pattern-defaults\.json: .*task/s);
  });
});
