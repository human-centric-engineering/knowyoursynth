/**
 * The sitemap: the platform's public pages, then the databank's.
 *
 * @see app/sitemap.ts
 */

import { describe, expect, it, vi } from 'vitest';
import sitemap, { dynamic } from '@/app/sitemap';

vi.mock('@/components/app/bank/sitemap', () => ({
  bankSitemapPaths: vi.fn(async () => [
    { path: '/bank', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/bank/artists/kraftwerk', priority: 0.5, changeFrequency: 'monthly' },
  ]),
}));

describe('sitemap', () => {
  it('is built per request, since the databank rows are in the tables', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it("lists the site's pages, then the databank's, as absolute URLs", async () => {
    const entries = await sitemap();
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    expect(entries.map((e) => e.url)).toEqual([
      base,
      `${base}/about`,
      `${base}/contact`,
      `${base}/privacy`,
      `${base}/terms`,
      `${base}/bank`,
      `${base}/bank/artists/kraftwerk`,
    ]);
    expect(entries.at(-1)).toMatchObject({ priority: 0.5, changeFrequency: 'monthly' });
  });
});
