import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import {
  SYNTH_EDITOR_TABS,
  SynthEditor,
  type SynthEditorTab,
} from '@/components/app/admin/synths/synth-editor';
import { Badge } from '@/components/ui/badge';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAdminSynthDetail(id);
  return {
    title:
      detail && detail !== 'missing'
        ? `${detail.synth.maker} ${detail.synth.name} · Catalogue`
        : 'Synth · Catalogue',
    description: "Edit a synth's details, patches, lessons, lineage and notes.",
  };
}

const isTab = (tab: unknown): tab is SynthEditorTab => SYNTH_EDITOR_TABS.some((t) => t === tab);

/**
 * Admin — one synth in the catalogue (`f-catalogue-admin`): a thin server shell over `GET /api/v1/admin/synths/[id]`.
 * `?tab=` opens a tab, so the sound editor can link back to the library.
 */
export default async function CatalogueSynthPage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const detail = await getAdminSynthDetail(id);
  if (detail === 'missing') notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/synths/catalogue"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Catalogue
        </Link>
        {detail && (
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {detail.synth.maker} {detail.synth.name}
            <Badge variant={detail.synth.listed ? 'outline' : 'secondary'}>
              {detail.synth.listed ? 'Listed' : 'Unlisted'}
            </Badge>
            {!detail.synth.playable && <Badge variant="secondary">Not built</Badge>}
          </h1>
        )}
      </header>

      <SharedSettingsReadOnlyNotice />

      {detail === null ? (
        <p role="alert" className="text-destructive text-sm">
          The synth could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <>
          <SharedSettingsSaveHint />
          <SynthEditor detail={detail} tab={isTab(tab) ? tab : 'details'} />
        </>
      )}
    </div>
  );
}
