import type { Metadata } from 'next';
import { z } from 'zod';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { LINK_OWNER_KINDS, LINKS_API, readLinks } from '@/components/app/admin/links/data';
import { LinksTable, type LinkFilters } from '@/components/app/admin/links/links-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { LINK_PROVIDERS } from '@/lib/app/links/providers';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Videos and links',
  description: 'Every video and link on the instruments, patches, records and artists.',
};

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The address's filters, each kept only when it is one the API knows; anything else reads as no filter. */
const one = <T extends string>(values: readonly T[], raw: unknown): T | '' =>
  values.find((v) => v === raw) ?? '';

const MetaSchema = z.object({ page: z.number(), totalPages: z.number(), total: z.number() });

/**
 * Admin — every video and link (`f-videos-and-links` t-181). A thin server shell over `GET /api/v1/admin/links`; the
 * filters and page are in the address. A failed fetch says so in place of the table rather than throwing.
 */
export default async function LinksAdminPage({ searchParams }: Props) {
  const asked = await searchParams;
  const filters: LinkFilters = {
    owner: one(LINK_OWNER_KINDS, asked.owner),
    provider: one(LINK_PROVIDERS, asked.provider),
    ours: one(['true', 'false'], asked.ours),
  };
  const pageAsked = Number(asked.page);
  const page = Number.isInteger(pageAsked) && pageAsked > 0 ? pageAsked : 1;

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  for (const k of ['owner', 'provider', 'ours'] as const) if (filters[k]) query.set(k, filters[k]);

  let result: { links: ReturnType<typeof readLinks>; meta: z.infer<typeof MetaSchema> } | null =
    null;
  try {
    const res = await serverFetch(`${LINKS_API}?${query.toString()}`);
    if (res.ok) {
      const body = await parseApiResponse<unknown>(res);
      const meta = body.success ? MetaSchema.safeParse(body.meta) : null;
      if (body.success && meta?.success) result = { links: readLinks(body.data), meta: meta.data };
    }
  } catch (err) {
    logger.error('links admin page: fetch failed', err);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-1 text-2xl font-semibold">
          Videos and links
          <FieldHelp title="Videos and links">
            <p>
              Demos, reviews, lessons and records from YouTube, Vimeo, Spotify, SoundCloud and
              Bandcamp, and plain web links, each about one databank instrument, record or artist,
              or one library patch.
            </p>
            <p className="mt-2">
              They are also listed, and ours put in order, on each of those things&apos; own admin
              pages. Every change is in the audit log.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">Newest edit first. Filter, add or edit one.</p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {result === null ? (
        <p role="alert" className="text-destructive text-sm">
          The links could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <LinksTable
          links={result.links}
          filters={filters}
          page={result.meta.page}
          totalPages={result.meta.totalPages}
          total={result.meta.total}
        />
      )}
    </div>
  );
}
