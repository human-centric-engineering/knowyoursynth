import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import { SoundForm } from '@/components/app/admin/synths/sound-form';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Add a patch · Catalogue',
  description: "Add a patch and its lesson to a synth's library.",
};

/**
 * Admin — a new library sound (`f-catalogue-admin`). Saved through `POST /api/v1/admin/synths/[id]/sounds`, on the
 * definition's current version, at the end of the library. A synth with no definition cannot take one.
 */
export default async function NewCatalogueSoundPage({ params }: Props) {
  const { id } = await params;
  const detail = await getAdminSynthDetail(id);
  if (detail === 'missing') notFound();

  const back = `/admin/synths/catalogue/${encodeURIComponent(id)}?tab=sounds`;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={back} className="text-muted-foreground text-sm hover:underline">
          ← {detail ? `${detail.synth.maker} ${detail.synth.name}` : id} sounds
        </Link>
        <h1 className="text-2xl font-semibold">Add a patch</h1>
      </header>

      <SharedSettingsReadOnlyNotice />

      {detail === null ? (
        <p role="alert" className="text-destructive text-sm">
          The synth could not be loaded. Reload the page to try again.
        </p>
      ) : detail.definitionVersion === null ? (
        <p className="text-muted-foreground text-sm">
          {detail.synth.name} is not built yet, so a patch cannot be checked against it.
        </p>
      ) : (
        <>
          <SharedSettingsSaveHint />
          <SoundForm synthId={id} mode="new" />
        </>
      )}
    </div>
  );
}
