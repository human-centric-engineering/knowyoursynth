import { LRUCache } from 'lru-cache';
import { ImageResponse } from 'next/og';

import { drawSlot, loadDrawingCode } from '@/components/app/sharing/drawing';
import type { PanelImageInput } from '@/components/app/sharing/panel-image';
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
 * Drawing the panel is the slow part (up to a second for the largest), so:
 *
 * - drawn panels are kept in memory (`kept`), under a hash of everything they are drawn from: a crawler's repeat visit
 *   costs a read, an edit is a new picture, and the unfurlers that fetch one link at the same moment share one drawing;
 * - they wait their turn in the queue every server-drawn panel shares (`drawSlot`, `drawing.ts`);
 * - the drawing code, native rasteriser included, is loaded on first use, inside the fallback: a server where it
 *   cannot load serves text cards rather than errors.
 */

/** A panel, drawn for the card; undefined when it could not be (logged), which is never kept. */
async function draw(input: PanelImageInput): Promise<SocialCardPanel | undefined> {
  try {
    const { panelPng } = await loadDrawingCode();
    const { png, width, height } = await drawSlot(() => panelPng(input));
    return { src: `data:image/png;base64,${png.toString('base64')}`, width, height };
  } catch (err) {
    logger.error('Sound card: the panel could not be drawn', err, { synthId: input.def.id });
    return undefined;
  }
}

/** The drawn panels: the most recently used 64, within 24MB of PNG. */
const kept = new LRUCache<string, SocialCardPanel, PanelImageInput>({
  max: 64,
  maxSize: 24 * 1024 * 1024,
  sizeCalculation: (panel) => panel.src.length,
  fetchMethod: (_key, _stale, { context }) => draw(context),
  // A drawing whose entry is pushed out before it finishes still answers its request, rather than rejecting.
  ignoreFetchAbort: true,
});

/** The sound's panel for the card, or null for the text card. */
async function cardPanel(
  def: SynthDef,
  sound: PublicSound,
  design: SynthDesign
): Promise<SocialCardPanel | null> {
  const from = sound.panel ?? sound.fitted;
  if (!from) return null;
  const key = computeETag({ synth: def.id, version: def.version, design, from });
  const panel = await kept.fetch(key, {
    context: { def, values: from.values, cables: from.cables, design, box: SOCIAL_CARD_PANEL_BOX },
  });
  return panel ?? null;
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
