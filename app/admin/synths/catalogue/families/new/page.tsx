import type { Metadata } from 'next';
import Link from 'next/link';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import { FamilyForm } from '@/components/app/admin/catalogue/family-form';
import { familyAdminPath } from '@/components/app/admin/catalogue/paths';
import { getFamilyFormOptions } from '@/app/admin/synths/catalogue/families/load';

export const metadata: Metadata = {
  title: 'New family · Catalogue',
  description: 'Create a synth family.',
};

/** Admin — create a synth family (`f-synth-families` t-323). */
export default async function NewFamilyPage() {
  const options = await getFamilyFormOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={familyAdminPath()} className="text-muted-foreground text-sm hover:underline">
          ← Families
        </Link>
        <h1 className="text-2xl font-semibold">New family</h1>
      </header>

      <SharedSettingsReadOnlyNotice />

      {options === null ? (
        <p role="alert" className="text-destructive text-sm">
          The synths and instruments could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <>
          <SharedSettingsSaveHint />
          <FamilyForm family={null} options={options} />
        </>
      )}
    </div>
  );
}
