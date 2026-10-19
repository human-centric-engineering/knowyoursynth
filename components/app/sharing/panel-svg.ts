import { renderPanel } from '@/components/app/sharing/panel-render';
import type { SynthDesign } from '@/lib/app/catalogue/designs';
import type { SynthDef } from '@/lib/app/synths/contract';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { sanitizeCables, sanitizeSet } from '@/lib/app/synths/lib/patch';

/**
 * A panel as standalone SVG: the synth page's own faceplate (`SynthPanel`), drawn with the given values and cables in
 * the given design, by the stand-alone renderer (`panel-render.ts`). The social card rasterises it (`panel-image.ts`);
 * the home page writes it into the page as it is (`components/app/marketing/hero-panel.tsx`).
 *
 * A module of its own, apart from the rasteriser, so a page can draw a panel without loading resvg's native binding,
 * which the App Router's page layer cannot resolve.
 */

const noop = () => undefined;

/** The panel's SVG, standalone: namespaced, and sized at its own view so a rasteriser can scale it. */
export function panelSvg({
  def,
  values,
  cables,
  design,
}: {
  def: SynthDef;
  /** The panel as stored: checked against `def` here, as the page checks it (`fitPanel`). */
  values: unknown;
  cables: unknown;
  design: SynthDesign;
}): {
  svg: string;
  width: number;
  height: number;
} {
  const shown = def.modular ? modularDef(def) : def;
  const markup = renderPanel({
    def: shown,
    values: { ...def.init, ...sanitizeSet(def, values) },
    cables: sanitizeCables(def, cables).map(([from, to], i) => ({
      from,
      to,
      color: CABLE_COLORS[i % CABLE_COLORS.length],
    })),
    design,
    onChange: noop,
    onConnect: noop,
    onRemoveCable: noop,
  });
  const { w, h } = shown.view;
  return {
    svg: markup.replace(
      /^<svg /,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `
    ),
    width: w,
    height: h,
  };
}
