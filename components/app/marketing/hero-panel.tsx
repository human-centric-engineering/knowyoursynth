import type { SynthDesign } from '@/lib/app/catalogue/designs';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { logger } from '@/lib/logging';

/**
 * The home page's picture: a synth's panel at its starting values, drawn by the app itself (`panelSvg`, the social
 * card's renderer) in the synth's catalogue design (`site-copy.md` §6, "The instrument is the image").
 *
 * Inline SVG rather than a PNG: it stays sharp at any width, and the faces it names (`'Michroma'`, …) are on the page,
 * imported by the marketing pages' `faces.ts`. The markup is the app's own faceplate with the definition's own values,
 * no user input, so writing it into the page is safe.
 *
 * Drawn once per synth, definition version and design, and kept: the panel does not change between visits. The
 * drawing code is loaded on first use, inside the fallback, as the social card loads it: a server where it cannot load
 * shows the home page without the picture rather than an error.
 */

export interface DrawnPanel {
  svg: string;
  width: number;
  height: number;
}

const drawn = new Map<string, DrawnPanel>();

/** The panel's SVG, or null (logged) when it could not be drawn. */
export async function drawHeroPanel(
  def: AppSynthDef,
  design: SynthDesign
): Promise<DrawnPanel | null> {
  const key = `${def.id}:${def.version}:${design}`;
  const kept = drawn.get(key);
  if (kept) return kept;
  try {
    const { panelSvg } = await import('@/components/app/sharing/panel-svg');
    const panel = panelSvg({ def, values: {}, cables: [], design });
    drawn.set(key, panel);
    return panel;
  } catch (err) {
    // Not kept: the next visit tries again.
    logger.error('Home page: the panel could not be drawn', err, { synthId: def.id });
    return null;
  }
}

export function HeroPanel({ name, panel }: { name: string; panel: DrawnPanel }) {
  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={`The ${name} panel`}
        className="overflow-hidden rounded-md border border-(--kys-line) bg-(--kys-desk) shadow-sm [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
        dangerouslySetInnerHTML={{ __html: panel.svg }}
      />
      <figcaption className="kys-label mt-2 text-[11px] text-(--kys-muted)">
        The {name} panel, as the app draws it
      </figcaption>
    </figure>
  );
}
