import type { Metadata } from 'next';
import Link from 'next/link';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { PickerSettingsForm } from '@/components/app/admin/catalogue/picker-form';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { SitePickerSettingsSchema, type SitePickerSettings } from '@/lib/app/picker/settings';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Synth picker · Catalogue',
  description: 'How the synth picker lists synths for every visitor who has not changed it.',
};

/** The site's settings through the admin API an API client reads, or null when they could not be loaded. */
async function load(): Promise<SitePickerSettings | null> {
  try {
    const res = await serverFetch('/api/v1/admin/synths/picker');
    if (!res.ok) return null;
    const body = await parseApiResponse<unknown>(res);
    if (!body.success) return null;
    const parsed = SitePickerSettingsSchema.safeParse(body.data);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    logger.error('synth picker admin: fetch failed', err);
    return null;
  }
}

/**
 * Admin: the synth picker's site settings (`f-synth-picker` t-329), a thin server shell over
 * `GET /api/v1/admin/synths/picker`. A failed fetch says so in place of the form rather than throwing.
 */
export default async function SynthPickerSettingsPage() {
  const settings = await load();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/synths/catalogue"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Catalogue
        </Link>
        <h1 className="text-2xl font-semibold">
          Synth picker{' '}
          <FieldHelp title="Synth picker settings">
            <p>
              How the synth picker lists synths for every visitor who has not changed it in Advanced
              search. A visitor who changed one choice still follows these for the rest.
            </p>
            <p className="mt-2">Every change is in the audit log.</p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose how synths are grouped and ordered, which kinds are listed, and what visitors may
          change.
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {settings === null ? (
        <p role="alert" className="text-destructive text-sm">
          The picker settings could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <PickerSettingsForm initial={settings} />
      )}
    </div>
  );
}
