import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import { soundPatternsPath } from '@/components/app/admin/patterns/paths';
import { SoundForm } from '@/components/app/admin/synths/sound-form';
import { Badge } from '@/components/ui/badge';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';

interface Props {
  params: Promise<{ id: string; slug: string }>;
}

export const metadata: Metadata = {
  title: 'Edit patch · Catalogue',
  description: 'Edit a library patch and its lesson steps.',
};

/**
 * Admin — one library sound and its lesson (`f-catalogue-admin`). Reads the synth from
 * `GET /api/v1/admin/synths/[id]`, which carries every stored sound, so the page needs no endpoint of its own.
 */
export default async function CatalogueSoundPage({ params }: Props) {
  const { id, slug } = await params;
  const detail = await getAdminSynthDetail(id);
  if (detail === 'missing') notFound();
  const sound = detail?.sounds.find((s) => s.slug === slug);
  if (detail && !sound) notFound();

  const back = `/admin/synths/catalogue/${encodeURIComponent(id)}?tab=sounds`;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={back} className="text-muted-foreground text-sm hover:underline">
          ← {detail ? `${detail.synth.maker} ${detail.synth.name}` : id} patches
        </Link>
        {sound && (
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {sound.sound.name}
            {sound.editedAt && <Badge variant="outline">Edited</Badge>}
          </h1>
        )}
        {sound && (
          <Link href={soundPatternsPath(id, slug)} className="text-sm hover:underline">
            Its patterns, and which is the default →
          </Link>
        )}
      </header>

      <SharedSettingsReadOnlyNotice />

      {!detail || !sound ? (
        <p role="alert" className="text-destructive text-sm">
          The patch could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <>
          {sound.problems.length > 0 && (
            <div role="status" className="border-destructive/50 rounded-md border p-3 text-sm">
              <p className="font-medium">The public page leaves this patch out:</p>
              <ul className="text-destructive mt-1 list-disc pl-5 text-xs">
                {sound.problems.map((p, i) => (
                  <li key={i}>{p.message}</li>
                ))}
              </ul>
            </div>
          )}
          <SharedSettingsSaveHint />
          <SoundForm synthId={id} mode="edit" sound={sound.sound} />
        </>
      )}
    </div>
  );
}
