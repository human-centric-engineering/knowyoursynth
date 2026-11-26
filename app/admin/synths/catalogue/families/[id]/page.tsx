import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import { FamilyForm } from '@/components/app/admin/catalogue/family-form';
import { familyAdminPath } from '@/components/app/admin/catalogue/paths';
import { getAdminFamily, getFamilyFormOptions } from '@/app/admin/synths/catalogue/families/load';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const family = await getAdminFamily((await params).id);
  return {
    title: family && family !== 'missing' ? `${family.name} · Families` : 'Family · Catalogue',
    description: 'Edit a synth family: its members, their differences and the member it opens on.',
  };
}

/** Admin — one synth family (`f-synth-families` t-323): a thin server shell over the admin API. */
export default async function FamilyPage({ params }: Props) {
  const { id } = await params;
  const [family, options] = await Promise.all([getAdminFamily(id), getFamilyFormOptions()]);
  if (family === 'missing') notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={familyAdminPath()} className="text-muted-foreground text-sm hover:underline">
          ← Families
        </Link>
        {family && <h1 className="text-2xl font-semibold">{family.name}</h1>}
      </header>

      <SharedSettingsReadOnlyNotice />

      {family === null || options === null ? (
        <p role="alert" className="text-destructive text-sm">
          The family could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <>
          <SharedSettingsSaveHint />
          <FamilyForm key={family.id} family={family} options={options} />
        </>
      )}
    </div>
  );
}
