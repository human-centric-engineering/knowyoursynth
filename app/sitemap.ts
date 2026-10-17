import type { MetadataRoute } from 'next';
import { bankSitemapPaths } from '@/components/app/bank/sitemap';
import { sharingSitemapPaths } from '@/components/app/sharing/sitemap';

/**
 * Sitemap Configuration
 *
 * Generates a sitemap for search engine discovery.
 * Lists all public pages with their last modified dates and change frequencies.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 *
 * Phase 3.5: Landing Page & Marketing
 *
 * Know Your Synth: adds the databank's pages, and Explore with every published
 * sound, read from its tables per request (`.context/app/divergences.md`).
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Public pages - add new public pages here
  const publicPages = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/contact', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    ...(await bankSitemapPaths()),
    ...(await sharingSitemapPaths()),
  ];

  return publicPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
