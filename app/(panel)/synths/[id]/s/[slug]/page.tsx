import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

import '@/components/app/synth/synth.css';

import { SynthPage } from '@/components/app/synth/synth-page';
import { sharedSoundHref } from '@/components/app/synth/routes';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { getSharedSound } from '@/lib/app/sounds/public';

/**
 * A shared sound's page, `/synths/[id]/s/[slug]` (`f-sharing` h2): the synth page with that sound loaded, readable
 * signed out.
 *
 * In-process, from the read `GET /api/v1/public/sounds/:slug` serves, as the synth page reads its catalogue
 * (`../../page.tsx`). Private, unknown, malformed and on another synth are the same 404, which says "This sound isn't
 * shared any more" (`not-found.tsx`); a synth the catalogue does not serve is one too.
 *
 * A link share is `noindex`: sharing a link is not listing it. A published sound is indexed, under this address.
 */

type Props = {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewParam = z.string().max(32).optional().catch(undefined);

// the metadata and the page share one read; a synth the catalogue does not serve has no metadata either
const readShared = cache(async (id: string, slug: string) => {
  if (!getSynthDef(id)) return null;
  const [sound, synths] = await Promise.all([getSharedSound(slug), listSynths()]);
  return sound && sound.synthId === id && synths.some((s) => s.id === id) ? sound : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const sound = await readShared(id, slug);
  const def = getSynthDef(id);
  if (!sound || !def) return { title: 'Not found' };
  const by = sound.author ? ` by @${sound.author}` : '';
  const description = `${sound.name}, a sound on the ${def.name}${by}. Play it in your browser.`;
  return {
    title: `${sound.name} · ${def.name}`,
    description,
    openGraph: { title: `${sound.name} · ${def.name}`, description },
    ...(sound.visibility === 'published'
      ? { alternates: { canonical: sharedSoundHref(id, slug) } }
      : { robots: { index: false, follow: false } }),
  };
}

export default async function SharedSoundRoute({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const sound = await readShared(id, slug);
  if (!sound) notFound();

  const [detail, synths] = await Promise.all([getSynthDetail(id), listSynths()]);
  if (!detail) notFound();

  const query = await searchParams;
  return (
    <SynthPage
      key={`${id}/${slug}`}
      detail={detail}
      synths={synths}
      viewParam={viewParam.parse(query.view) ?? null}
      shared={sound}
    />
  );
}
