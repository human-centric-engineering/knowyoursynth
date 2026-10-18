import { notFound } from 'next/navigation';

import { SOCIAL_CARD_SIZE } from '@/components/app/sharing/social-card';
import { soundCard } from '@/components/app/sharing/sound-card-image';
import { listSynths } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { getSharedSound } from '@/lib/app/sounds/public';
import { BRAND } from '@/lib/brand';

/**
 * A shared sound's social card (`f-sharing` h2): the synth's panel with this sound on it (t-50), in the synth's own
 * colours and `Synth.design` (`soundCard`). The same read as the page, so a sound made private, or on a synth the
 * catalogue stops serving, stops having a card when it stops having a page.
 */

export const alt = `A sound shared on ${BRAND.name}`;
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const def = getSynthDef(id);
  const [sound, synths] = def
    ? await Promise.all([getSharedSound(slug), listSynths()])
    : [null, []];
  const synth = synths.find((s) => s.id === id);
  if (!def || !sound || sound.synthId !== id || !synth) notFound();
  return soundCard(def, sound, synth.design);
}
