/**
 * Explore, the published sounds (`f-sharing` h2) and the published patterns (`f-step-sequencer` t-83) in the sitemap.
 *
 * @see components/app/sharing/sitemap.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharingSitemapPaths } from '@/components/app/sharing/sitemap';
import { publishedSoundAddresses } from '@/lib/app/sounds/public';
import { publishedPatternAddresses } from '@/lib/app/patterns/public';
import { logger } from '@/lib/logging';

vi.mock('@/lib/app/sounds/public', () => ({ publishedSoundAddresses: vi.fn() }));
vi.mock('@/lib/app/patterns/public', () => ({ publishedPatternAddresses: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(publishedPatternAddresses).mockResolvedValue([]);
});

describe('sharingSitemapPaths', () => {
  it('lists both Explore pages, then each published sound, then each published pattern on the synth it opens on', async () => {
    vi.mocked(publishedSoundAddresses).mockResolvedValue([
      { synthId: 'model-d', slug: 'abcdefghjk' },
      { synthId: 'pro-1', slug: 'mnpqrstvwx' },
    ]);
    vi.mocked(publishedPatternAddresses).mockResolvedValue([
      { synthId: 'tb-303', slug: '0123456789' },
    ]);
    expect((await sharingSitemapPaths()).map((p) => p.path)).toEqual([
      '/explore',
      '/explore/patterns',
      '/synths/model-d/s/abcdefghjk',
      '/synths/pro-1/s/mnpqrstvwx',
      '/synths/tb-303/p/0123456789',
    ]);
  });

  it('still lists Explore and the patterns when the sounds cannot be read, and logs it', async () => {
    vi.mocked(publishedSoundAddresses).mockRejectedValue(new Error('db down'));
    vi.mocked(publishedPatternAddresses).mockResolvedValue([
      { synthId: 'tb-303', slug: '0123456789' },
    ]);
    expect((await sharingSitemapPaths()).map((p) => p.path)).toEqual([
      '/explore',
      '/explore/patterns',
      '/synths/tb-303/p/0123456789',
    ]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('still lists Explore and the sounds when the patterns cannot be read, and logs it', async () => {
    vi.mocked(publishedSoundAddresses).mockResolvedValue([
      { synthId: 'model-d', slug: 'abcdefghjk' },
    ]);
    vi.mocked(publishedPatternAddresses).mockRejectedValue(new Error('db down'));
    expect((await sharingSitemapPaths()).map((p) => p.path)).toEqual([
      '/explore',
      '/explore/patterns',
      '/synths/model-d/s/abcdefghjk',
    ]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
