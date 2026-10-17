/**
 * Explore and every published sound, for `app/sitemap.ts` (`f-sharing` h2). Never a link share: sharing a link is not
 * listing it, and its page is `noindex`.
 *
 * Read from the tables when the sitemap is asked for. If the read fails, the sitemap still serves Explore and the
 * site's other pages, as the databank's entries do (`components/app/bank/sitemap.ts`).
 */

import type { SitemapPath } from '@/components/app/bank/sitemap';
import { sharedSoundHref } from '@/components/app/synth/routes';
import { publishedSoundAddresses } from '@/lib/app/sounds/public';
import { logger } from '@/lib/logging';

export async function sharingSitemapPaths(): Promise<SitemapPath[]> {
  const explore: SitemapPath = { path: '/explore', priority: 0.7, changeFrequency: 'weekly' };
  try {
    const sounds = await publishedSoundAddresses();
    return [
      explore,
      ...sounds.map(({ synthId, slug }) => ({
        path: sharedSoundHref(synthId, slug),
        priority: 0.4,
        changeFrequency: 'monthly' as const,
      })),
    ];
  } catch (error) {
    logger.error('sharing: sitemap could not read published sounds, left out', error);
    return [explore];
  }
}
