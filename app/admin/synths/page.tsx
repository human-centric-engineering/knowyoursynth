import type { Metadata } from 'next';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { SynthDesignsTable } from '@/components/app/admin/synths/synth-designs-table';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSynthDesign } from '@/lib/app/catalogue/designs';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Synth designs',
  description: "Each synth's panel design, and the maker's approval to show their marks.",
};

/**
 * Admin — Designs (D11, `f-panel-designs`).
 *
 * A thin server shell over `GET /api/v1/admin/synths`, the same list an API client reads; the table changes a design
 * through `PATCH /api/v1/admin/synths/[id]/design`. Through the API rather than the read layer, unlike the public
 * synth page: an admin's request carries their session, so it is limited per admin, and nothing is saved by skipping
 * the round trip. A failed fetch says so in place of the table rather than throwing.
 */
async function getDesigns(): Promise<AdminSynthDesign[] | null> {
  try {
    const res = await serverFetch('/api/v1/admin/synths');
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminSynthDesign[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('synth designs page: fetch failed', err);
    return null;
  }
}

export default async function SynthDesignsPage() {
  const synths = await getDesigns();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Designs{' '}
          <FieldHelp title="Neutral and faithful designs">
            <p>
              Every synth&apos;s panel can be drawn two ways. <strong>Neutral</strong>, the default,
              leaves out the maker&apos;s logos, wordmarks and badges. <strong>Faithful</strong>{' '}
              draws them.
            </p>
            <p className="mt-2">
              The marks belong to the maker, so a synth can be switched to faithful only once their
              approval is recorded: who gave it, and when. Switching back to neutral keeps the
              approval, and every change is in the audit log.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Every synth in the catalogue, listed or not, with the design its panel draws.
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {synths === null ? (
        <p role="alert" className="text-destructive text-sm">
          The synth list could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <SynthDesignsTable synths={synths} />
      )}
    </div>
  );
}
