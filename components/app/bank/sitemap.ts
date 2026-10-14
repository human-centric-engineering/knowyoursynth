/**
 * The databank's pages, for `app/sitemap.ts`: `/bank`, each other tab, and every row.
 *
 * Read from the tables when the sitemap is asked for. If the read fails, the sitemap still serves the site's other
 * pages: a crawler that gets an error gets nothing.
 */

import { loadBank } from '@/lib/app/bank/read';
import { logger } from '@/lib/logging';
import { BANK_TABS, DEFAULT_TAB, bankHref } from '@/components/app/bank/routes';

export interface SitemapPath {
  path: string;
  priority: number;
  changeFrequency: 'weekly' | 'monthly';
}

export async function bankSitemapPaths(): Promise<SitemapPath[]> {
  const tabs: SitemapPath[] = BANK_TABS.map(([tab]) => ({
    path: bankHref(tab),
    priority: tab === DEFAULT_TAB ? 0.8 : 0.6,
    changeFrequency: 'weekly',
  }));
  try {
    const bank = await loadBank();
    const rows = [
      ...bank.artists.map((r) => bankHref('artists', r.id)),
      ...bank.makers.map((r) => bankHref('makers', r.id)),
      ...bank.songs.map((r) => bankHref('songs', r.id)),
      ...bank.instruments.map((r) => bankHref('instruments', r.id)),
    ];
    return [
      ...tabs,
      ...rows.map((path) => ({ path, priority: 0.5, changeFrequency: 'monthly' as const })),
    ];
  } catch (error) {
    logger.error('bank: sitemap could not read the databank, rows left out', error);
    return tabs;
  }
}
