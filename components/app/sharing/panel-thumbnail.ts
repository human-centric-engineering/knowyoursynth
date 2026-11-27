import { LRUCache } from 'lru-cache';

import { drawSlot, loadDrawingCode } from '@/components/app/sharing/drawing';
import type { SynthDesign } from '@/lib/app/catalogue/designs';
import type { SynthDef } from '@/lib/app/synths/contract';
import { computeETag } from '@/lib/api/etag';
import { logger } from '@/lib/logging';

/**
 * A synth's panel as a small PNG, for its row in the synth picker (`f-synth-picker` t-328): the faceplate as the page
 * opens it, every control at its starting value and nothing patched, in the synth's `Synth.design`. Drawn by the share
 * card's renderer (`panelPng`), through the queue every server-drawn panel shares (`drawing.ts`). Server only.
 *
 * Kept in memory under a hash of what it is drawn from (`thumbnailKey`): the picker asks for every synth at once, so a
 * second visitor costs reads, and a new definition or a design change is a new picture. Requests for one synth that
 * arrive together share one drawing. One that would not draw is not tried again for `NOT_DRAWN_SECONDS`, so it does
 * not hold up the share card's drawings behind it in the queue.
 */

/** The box a thumbnail fits inside: twice the picker's 92×38 slot, for high-density screens. */
export const THUMBNAIL_BOX = { width: 240, height: 100 } as const;

/**
 * Bumped when the way thumbnails are drawn changes without a synth's definition changing (the faceplate's drawing, or
 * what a thumbnail shows), so a browser holding the old picture is sent the new one rather than a 304.
 */
const THUMBNAIL_DRAWING = 1;

/** What a thumbnail is drawn from, hashed: its ETag, and its key in memory. */
export function thumbnailKey(def: SynthDef, design: SynthDesign): string {
  return computeETag({
    thumbnail: def.id,
    version: def.version,
    design,
    box: THUMBNAIL_BOX,
    drawing: THUMBNAIL_DRAWING,
  });
}

interface DrawInput {
  def: SynthDef;
  design: SynthDesign;
}

/** A thumbnail, or undefined when it could not be drawn (logged), which is never kept. */
async function draw({ def, design }: DrawInput): Promise<Buffer | undefined> {
  try {
    const { panelPng } = await loadDrawingCode();
    const { png } = await drawSlot(() =>
      panelPng({ def, values: {}, cables: [], design, box: THUMBNAIL_BOX })
    );
    return png;
  } catch (err) {
    logger.error('Synth thumbnail: the panel could not be drawn', err, { synthId: def.id });
    return undefined;
  }
}

/** The drawn thumbnails: every synth's in both designs fits well inside these limits. */
const kept = new LRUCache<string, Buffer, DrawInput>({
  max: 256,
  maxSize: 16 * 1024 * 1024,
  sizeCalculation: (png) => png.length,
  fetchMethod: (_key, _stale, { context }) => draw(context),
  // A drawing whose entry is pushed out before it finishes still answers its request, rather than rejecting.
  ignoreFetchAbort: true,
});

/** How long a thumbnail that would not draw is not tried again: a panel that fails once fails every time until a fix. */
export const NOT_DRAWN_SECONDS = 600;

/** The thumbnails that would not draw lately, so a picker opened meanwhile does not queue them again. */
const notDrawn = new LRUCache<string, true>({ max: 256, ttl: NOT_DRAWN_SECONDS * 1000 });

/** The synth's thumbnail as PNG bytes, or null when it could not be drawn (now, or in the last ten minutes). */
export async function panelThumbnail(def: SynthDef, design: SynthDesign): Promise<Buffer | null> {
  const key = thumbnailKey(def, design);
  if (notDrawn.has(key)) return null;
  const png = await kept.fetch(key, { context: { def, design } });
  if (!png) notDrawn.set(key, true);
  return png ?? null;
}
