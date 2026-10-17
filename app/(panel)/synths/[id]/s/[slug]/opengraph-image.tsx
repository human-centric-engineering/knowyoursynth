import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

import { SOCIAL_CARD_SIZE, SocialCard } from '@/components/app/sharing/social-card';
import { getSynthDef } from '@/lib/app/synths/defs';
import { getSharedSound } from '@/lib/app/sounds/public';
import { BRAND } from '@/lib/brand';

/**
 * A shared sound's social card (`f-sharing` h2): a text card in the synth's own colours (`SocialCard`). The same read
 * as the page, so a sound made private stops having a card when it stops having a page.
 */

export const alt = `A sound shared on ${BRAND.name}`;
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const def = getSynthDef(id);
  const sound = def ? await getSharedSound(slug) : null;
  if (!def || !sound || sound.synthId !== id) notFound();
  return new ImageResponse(
    <SocialCard
      name={sound.name}
      synthName={def.name}
      maker={def.maker}
      author={sound.author}
      theme={def.theme}
      brand={BRAND.name}
    />,
    size
  );
}
