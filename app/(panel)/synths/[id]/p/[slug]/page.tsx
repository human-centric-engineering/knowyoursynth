import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

import '@/components/app/synth/synth.css';

import { SynthPage } from '@/components/app/synth/synth-page';
import { sharedPatternHref } from '@/components/app/synth/routes';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { getSharedPattern, patternHomeSynth } from '@/lib/app/patterns/public';

/**
 * A shared pattern on one synth, `/synths/[id]/p/[slug]` (`f-step-sequencer` t-83): the synth page with the pattern
 * in its sequencer, open, readable signed out. A pattern plays on any synth, so any synth the catalogue serves has
 * this page for it; `/patterns/[slug]`, the address its owner copies, sends a visitor to the synth it was made on.
 *
 * In-process, from the read `GET /api/v1/public/patterns/:slug` serves. Private, unlisted, unknown and malformed are
 * the same 404 (`not-found.tsx`), and so is a synth the catalogue does not serve.
 *
 * A link share is `noindex`. A published pattern is indexed once, at the synth it opens on (`patternHomeSynth`): every
 * other synth's page for it names that one as canonical.
 */

type Props = {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewParam = z.string().max(32).optional().catch(undefined);

// the metadata and the page share one read
const readShared = cache(async (id: string, slug: string) => {
  if (!getSynthDef(id)) return null;
  const [pattern, synths] = await Promise.all([getSharedPattern(slug), listSynths()]);
  return pattern && synths.some((s) => s.id === id) ? { pattern, synths } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const shared = await readShared(id, slug);
  const def = getSynthDef(id);
  if (!shared || !def) return { title: 'Not found' };
  const { pattern, synths } = shared;
  const by = pattern.author ? ` by @${pattern.author}` : '';
  const description = `${pattern.name}, a pattern${by}, playing on the ${def.name}. Play it in your browser, on any synth.`;
  const home = patternHomeSynth(pattern.synthId, synths) ?? id;
  return {
    title: `${pattern.name} · pattern on the ${def.name}`,
    description,
    openGraph: { title: `${pattern.name} · pattern`, description },
    ...(pattern.visibility === 'published'
      ? { alternates: { canonical: sharedPatternHref(home, slug) } }
      : { robots: { index: false, follow: false } }),
  };
}

export default async function SharedPatternRoute({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const shared = await readShared(id, slug);
  if (!shared) notFound();

  const detail = await getSynthDetail(id);
  if (!detail) notFound();

  const query = await searchParams;
  return (
    <SynthPage
      key={`${id}/p/${slug}`}
      detail={detail}
      synths={shared.synths}
      viewParam={viewParam.parse(query.view) ?? null}
      sharedPattern={shared.pattern}
    />
  );
}
