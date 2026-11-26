import type { Metadata } from 'next';
import Link from 'next/link';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { familyAdminPath } from '@/components/app/admin/catalogue/paths';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { getAdminFamilies } from '@/app/admin/synths/catalogue/families/load';

export const metadata: Metadata = {
  title: 'Synth families · Catalogue',
  description:
    'Edit the synth families: an original, its revisions and the instruments that copy it.',
};

/**
 * Admin — the synth families (`f-synth-families` t-323): a thin server shell over
 * `GET /api/v1/admin/synths/families`. A failed fetch says so in place of the list rather than throwing.
 */
export default async function SynthFamiliesPage() {
  const families = await getAdminFamilies();

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
          Families{' '}
          <FieldHelp title="Synth families">
            <p>
              An original, its revisions and the instruments that copy it. The synth picker shows a
              family as one entry, and the version toggle switches between its members.
            </p>
            <p className="mt-2">
              Saving a family makes it an admin&apos;s: the seed never overwrites it again. Every
              change is in the audit log.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Correct a member&apos;s differences, add a newly announced clone, or change which member a
          family opens on.
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      <Button asChild size="sm">
        <Link href={`${familyAdminPath()}/new`}>New family</Link>
      </Button>

      {families === null ? (
        <p role="alert" className="text-destructive text-sm">
          The families could not be loaded. Reload the page to try again.
        </p>
      ) : families.length === 0 ? (
        <p className="text-muted-foreground text-sm">There are no families yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {families.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 p-3">
              <Link href={familyAdminPath(f.id)} className="font-medium hover:underline">
                {f.name}
              </Link>
              <code className="text-muted-foreground text-xs">{f.id}</code>
              <span className="text-muted-foreground text-sm">
                {f.members.map((m) => m.label).join(' · ')}
              </span>
              {f.editedAt && <Badge variant="secondary">Edited</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
