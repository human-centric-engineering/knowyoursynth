import type { Metadata } from 'next';
import { z } from 'zod';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { filterQuery, type PatternFilters } from '@/components/app/admin/patterns/paths';
import { PatternTable } from '@/components/app/admin/patterns/pattern-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminLibraryRow, LibraryPatternChoices } from '@/lib/app/patterns/library-edit';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Patterns',
  description: 'Find and edit the library’s patterns, and the order they come in on each patch.',
};

const MetaSchema = z.object({ page: z.number().int(), total: z.number().int() });

/** A page of the list. */
const LIMIT = 50;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ListPage {
  rows: AdminLibraryRow[];
  total: number;
  page: number;
}

/**
 * Admin — Patterns (`f-pattern-library` t-126). A thin server shell over `GET /api/v1/admin/library-patterns`, which
 * filters and pages, and `GET /api/v1/admin/library-patterns/choices`, which names the synths and artists the filters
 * offer. The query string is the API's, so a filtered list is a link. A failed fetch says so in place of the table.
 */
async function getPage(filters: PatternFilters): Promise<ListPage | null> {
  try {
    const query = filterQuery(filters);
    const res = await serverFetch(
      `/api/v1/admin/library-patterns${query ? `${query}&` : '?'}limit=${LIMIT}`
    );
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminLibraryRow[]>(res);
    if (!body.success || !Array.isArray(body.data)) return null;
    const meta = MetaSchema.safeParse(body.meta);
    return {
      rows: body.data,
      total: meta.success ? meta.data.total : body.data.length,
      page: meta.success ? meta.data.page : 1,
    };
  } catch (err) {
    logger.error('patterns admin page: list fetch failed', err);
    return null;
  }
}

async function getChoices(): Promise<LibraryPatternChoices | null> {
  try {
    const res = await serverFetch('/api/v1/admin/library-patterns/choices');
    if (!res.ok) return null;
    const body = await parseApiResponse<LibraryPatternChoices>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('patterns admin page: choices fetch failed', err);
    return null;
  }
}

export default async function PatternsAdminPage({ searchParams }: Props) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === 'string' ? params[k] : undefined);
  const page = Number(one('page'));
  const filters: PatternFilters = {
    q: one('q'),
    synth: one('synth'),
    role: one('role'),
    artist: one('artist'),
    fidelity: one('fidelity'),
    origin: one('origin'),
    rights: one('rights'),
    status: one('status'),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
  const [list, choices] = await Promise.all([getPage(filters), getChoices()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Patterns{' '}
          <FieldHelp title="The pattern library">
            <p>
              Every pattern a patch can play, hidden synths&apos; included. A patch lists one or
              more, and plays the first as its riff: its default.
            </p>
            <p className="mt-2">
              Saving a pattern makes it an admin&apos;s, so the seed never overwrites it, and
              rewrites the riff of every patch it is the default of. Nothing is deleted: to stop a
              riff being a patch&apos;s default, put another of its patterns first. Every change is
              in the audit log.
            </p>
            <p className="mt-2">
              Each pattern also has a rights risk and a status. A disabled pattern is hidden from
              players, and a patch whose default it was plays its next enabled pattern. Filter by
              them here, and change several at once with the bar above the list.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">Find a pattern to edit.</p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {list === null || choices === null ? (
        <p role="alert" className="text-destructive text-sm">
          The patterns could not be loaded. Clear the filters, or reload the page to try again.
        </p>
      ) : (
        <PatternTable
          rows={list.rows}
          total={list.total}
          page={list.page}
          limit={LIMIT}
          filters={filters}
          choices={choices}
        />
      )}
    </div>
  );
}
