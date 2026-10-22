/**
 * Explore, every published sound (`f-sharing` h2) and every published pattern (`f-step-sequencer` t-83), for
 * `app/sitemap.ts`. Never a link share: sharing a link is not listing it, and its page is `noindex`.
 *
 * A pattern is listed at its page on the synth it opens on, the address its page names as canonical, not at its
 * `/patterns/<slug>` address, which only sends a visitor there.
 *
 * Read from the tables when the sitemap is asked for. If a read fails, the sitemap still serves Explore and the site's
 * other pages, as the databank's entries do (`components/app/bank/sitemap.ts`).
 */

import type { SitemapPath } from '@/components/app/bank/sitemap';
import { sharedPatternHref, sharedSoundHref } from '@/components/app/synth/routes';
import { publishedPatternAddresses } from '@/lib/app/patterns/public';
import { publishedSoundAddresses } from '@/lib/app/sounds/public';
import { logger } from '@/lib/logging';

const entry = (path: string): SitemapPath => ({
  path,
  priority: 0.4,
  changeFrequency: 'monthly',
});

export async function sharingSitemapPaths(): Promise<SitemapPath[]> {
  const explore: SitemapPath[] = [
    { path: '/explore', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/explore/patterns', priority: 0.6, changeFrequency: 'weekly' },
  ];
  const [sounds, patterns] = await Promise.all([
    publishedSoundAddresses().catch((error: unknown) => {
      logger.error('sharing: sitemap could not read published sounds, left out', error);
      return [];
    }),
    publishedPatternAddresses().catch((error: unknown) => {
      logger.error('sharing: sitemap could not read published patterns, left out', error);
      return [];
    }),
  ]);
  return [
    ...explore,
    ...sounds.map(({ synthId, slug }) => entry(sharedSoundHref(synthId, slug))),
    ...patterns.map(({ synthId, slug }) => entry(sharedPatternHref(synthId, slug))),
  ];
}
