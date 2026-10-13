import type { Metadata } from 'next';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { CatalogueTable } from '@/components/app/admin/synths/catalogue-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSynth } from '@/lib/app/catalogue/edit';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Synth catalogue',
  description: 'Order and list the synths, and edit their sounds, lessons, lineage and notes.',
};

/**
 * Admin — Catalogue (`f-catalogue-admin`).
 *
 * A thin server shell over `GET /api/v1/admin/synths`, the same list an API client reads and the Designs page loads.
 * A failed fetch says so in place of the table rather than throwing.
 */
async function getSynths(): Promise<AdminSynth[] | null> {
  try {
    const res = await serverFetch('/api/v1/admin/synths');
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminSynth[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('synth catalogue page: fetch failed', err);
    return null;
  }
}

export default async function SynthCataloguePage() {
  const synths = await getSynths();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Catalogue{' '}
          <FieldHelp title="The synth catalogue">
            <p>
              Every synth, listed or not, in the order the public catalogue shows them. Order and
              listing are placement: changing them leaves the synth&apos;s content to the seed.
            </p>
            <p className="mt-2">
              Editing a synth&apos;s details, sounds, history or notes makes that content an
              admin&apos;s: the seed never overwrites it again. Every change is in the audit log.
              Adding a synth is developer work.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Order and list the synths, and edit what each one teaches.
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {synths === null ? (
        <p role="alert" className="text-destructive text-sm">
          The synth list could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <CatalogueTable synths={synths} />
      )}
    </div>
  );
}
