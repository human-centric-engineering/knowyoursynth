/**
 * The databank's pages in the sitemap.
 *
 * @see components/app/bank/sitemap.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bankSitemapPaths } from '@/components/app/bank/sitemap';
import { loadBank } from '@/lib/app/bank/read';
import { logger } from '@/lib/logging';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

vi.mock('@/lib/app/bank/read', () => ({ loadBank: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

const bank = loadBankData();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bankSitemapPaths', () => {
  it('lists /bank, each other tab, and every row of every kind', async () => {
    vi.mocked(loadBank).mockResolvedValue(bank);
    const paths = (await bankSitemapPaths()).map((p) => p.path);
    expect(paths.slice(0, 4)).toEqual([
      '/bank',
      '/bank/makers',
      '/bank/songs',
      '/bank/instruments',
    ]);
    expect(paths).toHaveLength(
      4 + bank.artists.length + bank.makers.length + bank.songs.length + bank.instruments.length
    );
    expect(paths).toContain('/bank/artists/kraftwerk');
    expect(paths).toContain('/bank/instruments/moog-minimoog');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('still lists the tabs when the databank cannot be read, and logs it', async () => {
    vi.mocked(loadBank).mockRejectedValue(new Error('db down'));
    const paths = (await bankSitemapPaths()).map((p) => p.path);
    expect(paths).toEqual(['/bank', '/bank/makers', '/bank/songs', '/bank/instruments']);
    expect(logger.error).toHaveBeenCalledWith(
      'bank: sitemap could not read the databank, rows left out',
      expect.any(Error)
    );
  });
});
