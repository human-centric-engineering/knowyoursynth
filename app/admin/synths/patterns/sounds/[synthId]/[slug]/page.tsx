import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { PATTERNS_ADMIN_ROOT } from '@/components/app/admin/patterns/paths';
import { SoundPatternsEditor } from '@/components/app/admin/patterns/sound-patterns-editor';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSoundPatterns } from '@/lib/app/patterns/library-edit';
import { logger } from '@/lib/logging';

interface Props {
  params: Promise<{ synthId: string; slug: string }>;
}

export const metadata: Metadata = {
  title: 'Patch patterns · Patterns',
  description: 'Put a patch’s patterns in order and choose its default.',
};

/**
 * Admin — one patch's patterns, in order (`f-pattern-library` t-126). A thin server shell over
 * `GET /api/v1/admin/synths/[id]/sounds/[slug]/patterns`; the editor saves through its PUT. `'missing'` for a 404 (or
 * ids that cannot be one), `null` when it could not be loaded.
 */
async function getSound(
  synthId: string,
  slug: string
): Promise<AdminSoundPatterns | 'missing' | null> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/synths/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(slug)}/patterns`
    );
    if (res.status === 404 || res.status === 400) return 'missing';
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminSoundPatterns>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('patch patterns admin page: fetch failed', err, { synthId, slug });
    return null;
  }
}

export default async function SoundPatternsAdminPage({ params }: Props) {
  const { synthId, slug } = await params;
  const sound = await getSound(synthId, slug);
  if (sound === 'missing') notFound();
  const catalogue = `/admin/synths/catalogue/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(slug)}`;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={PATTERNS_ADMIN_ROOT} className="text-muted-foreground text-sm hover:underline">
          ← Patterns
        </Link>
        {sound && <h1 className="text-2xl font-semibold">{sound.name}</h1>}
        <p className="text-muted-foreground text-sm">
          <code>{synthId}</code> ·{' '}
          <Link href={catalogue} className="hover:underline">
            Edit the patch
          </Link>
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {!sound ? (
        <p role="alert" className="text-destructive text-sm">
          The patch&apos;s patterns could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <SoundPatternsEditor sound={sound} />
      )}
    </div>
  );
}
