import { renderAsync } from '@resvg/resvg-js';

import { CARD_DEFAULT_FAMILY, cardFontFiles } from '@/components/app/sharing/card-fonts';
import { panelSvg, type PanelSvgInput } from '@/components/app/sharing/panel-svg';

/**
 * A shared sound's panel as a picture, for its social card (t-50): the synth page's own faceplate (`SynthPanel`), drawn
 * with this sound's values and cables in the synth's `Synth.design`, rendered to SVG on the server and rasterised to
 * PNG by resvg with the panel's fonts (`card-fonts.ts`).
 *
 * The faceplate is the browser's component, unchanged: rendered once to static markup, its hooks run their first
 * render and nothing else (no effects, no stores written), which is all a picture needs. The view is the one the page
 * opens in (`DEFAULT_VIEW`): the modular case for a modular synth.
 *
 * The App Router's server code sees a `'use client'` module as a reference it cannot call, and refuses
 * `react-dom/server`, so the faceplate is rendered by a stand-alone bundle of it (`panel-render.ts`). The rasteriser is
 * native, so it is a server external (`next.config.js`, a divergence row).
 */

export interface PanelImageInput extends PanelSvgInput {
  /** The box the picture must fit inside, in pixels; it keeps the panel's own proportions. */
  box: { width: number; height: number };
}

/**
 * The panel as a PNG that fits `box`, as wide or as tall as the box allows. Rasterised off the main thread: a large
 * panel takes the better part of a second.
 */
export async function panelPng(
  input: PanelImageInput
): Promise<{ png: Buffer; width: number; height: number }> {
  const { svg, width, height } = panelSvg(input);
  const { box } = input;
  const byWidth = width / height >= box.width / box.height;
  const image = await renderAsync(svg, {
    fitTo: byWidth ? { mode: 'width', value: box.width } : { mode: 'height', value: box.height },
    font: {
      fontFiles: cardFontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: CARD_DEFAULT_FAMILY,
    },
  });
  return { png: image.asPng(), width: image.width, height: image.height };
}
