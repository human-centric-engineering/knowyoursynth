import { ImageResponse } from 'next/og';

import { panelPng } from '@/components/app/sharing/panel-image';
import {
  SOCIAL_CARD_PANEL_BOX,
  SOCIAL_CARD_SIZE,
  SocialCard,
} from '@/components/app/sharing/social-card';
import type { SocialCardPanel } from '@/components/app/sharing/social-card';
import type { SynthDesign } from '@/lib/app/catalogue/designs';
import type { PublicSound } from '@/lib/app/sounds/data';
import type { SynthDef } from '@/lib/app/synths/contract';
import { computeETag } from '@/lib/api/etag';
import { BRAND } from '@/lib/brand';
import { logger } from '@/lib/logging';

/**
 * A shared sound's social card as a PNG (`f-sharing` h2, t-50): its panel with this sound on it, in the synth's
 * `Synth.design`, under the sound's name and byline, in the synth's own colours (`SocialCard`).
 *
 * A sound with nothing that fits the synth any more, or a panel that fails to draw, gets the text card instead: a link
 * preview is not worth an error. Server only.
 *
 * Drawing the panel is the slow part (up to a second for the largest), so the last few are kept in memory, under a
 * hash of everything they are drawn from: a crawler's repeat visit costs a read, and an edit is a new picture.
 */

/** How many drawn panels are kept; the oldest goes first. */
const KEPT = 64;
const kept = new Map<string, SocialCardPanel>();

/** The sound's panel for the card, or null for the text card. */
async function cardPanel(
  def: SynthDef,
  sound: PublicSound,
  design: SynthDesign
): Promise<SocialCardPanel | null> {
  const from = sound.panel ?? sound.fitted;
  if (!from) return null;
  const key = computeETag({ synth: def.id, version: def.version, design, from });
  const hit = kept.get(key);
  if (hit) return hit;
  try {
    const { png, width, height } = await panelPng({
      def,
      values: from.values,
      cables: from.cables,
      design,
      box: SOCIAL_CARD_PANEL_BOX,
    });
    const panel = { src: `data:image/png;base64,${png.toString('base64')}`, width, height };
    kept.set(key, panel);
    if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
    return panel;
  } catch (err) {
    logger.error('Sound card: the panel could not be drawn', {
      synthId: def.id,
      err: String(err),
    });
    return null;
  }
}

/** The card for `sound` on `def`, drawn in `design`. */
export async function soundCard(
  def: SynthDef,
  sound: PublicSound,
  design: SynthDesign
): Promise<ImageResponse> {
  const panel = await cardPanel(def, sound, design);
  return new ImageResponse(
    <SocialCard
      name={sound.name}
      synthName={def.name}
      maker={def.maker}
      author={sound.author}
      theme={def.theme}
      brand={BRAND.name}
      panel={panel}
    />,
    SOCIAL_CARD_SIZE
  );
}
