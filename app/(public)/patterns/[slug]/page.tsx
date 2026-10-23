import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { sharedPatternHref } from '@/components/app/synth/routes';
import { listSynths } from '@/lib/app/catalogue/read';
import { getSharedPattern, patternHomeSynth } from '@/lib/app/patterns/public';

/**
 * A shared pattern's address, `/patterns/[slug]` (`f-step-sequencer` t-83): the one its owner copies, since a pattern
 * belongs to no synth. It sends the visitor to the pattern on the synth it was made on, or the catalogue's first when
 * that one is not served (`patternHomeSynth`), where its page lets them play it on any other.
 *
 * Private, unlisted, unknown and malformed are one 404 (`not-found.tsx`).
 */

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function PatternAddressRoute({ params }: Props) {
  const { slug } = await params;
  const [pattern, synths] = await Promise.all([getSharedPattern(slug), listSynths()]);
  const home = pattern ? patternHomeSynth(pattern.synthId, synths) : null;
  if (!pattern || !home) notFound();
  redirect(sharedPatternHref(home, pattern.slug));
}
