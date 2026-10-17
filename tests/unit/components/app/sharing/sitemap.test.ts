/**
 * Explore and the published sounds in the sitemap (`f-sharing` h2).
 *
 * @see components/app/sharing/sitemap.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharingSitemapPaths } from '@/components/app/sharing/sitemap';
import { publishedSoundAddresses } from '@/lib/app/sounds/public';
import { logger } from '@/lib/logging';

vi.mock('@/lib/app/sounds/public', () => ({ publishedSoundAddresses: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sharingSitemapPaths', () => {
  it('lists /explore, then each published sound at its address', async () => {
    vi.mocked(publishedSoundAddresses).mockResolvedValue([
      { synthId: 'model-d', slug: 'abcdefghjk' },
      { synthId: 'pro-1', slug: 'mnpqrstvwx' },
    ]);
    expect((await sharingSitemapPaths()).map((p) => p.path)).toEqual([
      '/explore',
      '/synths/model-d/s/abcdefghjk',
      '/synths/pro-1/s/mnpqrstvwx',
    ]);
  });

  it('still lists /explore when the sounds cannot be read, and logs it', async () => {
    vi.mocked(publishedSoundAddresses).mockRejectedValue(new Error('db down'));
    expect((await sharingSitemapPaths()).map((p) => p.path)).toEqual(['/explore']);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
