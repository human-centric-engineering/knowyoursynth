/**
 * The one queue every server-drawn panel goes through: a shared sound's social card (`sound-card-image.tsx`) and the
 * synth picker's thumbnails (`panel-thumbnail.ts`). Server only.
 *
 * - At most `DRAWING_AT_ONCE` panels are drawn at a time (`drawSlot`). The rasteriser runs on Node's thread pool, four
 *   threads by default, which the rest of the app's file, DNS and crypto work shares, so the two callers share one
 *   limit rather than having one each.
 * - The drawing code, native rasteriser included, is loaded on first use (`loadDrawingCode`), so a server where it
 *   cannot load fails only the drawing, which each caller answers in its own way.
 */

/** At most this many panels are drawn at once; the rest wait their turn. */
const DRAWING_AT_ONCE = 2;
let drawing = 0;
const waiting: (() => void)[] = [];

/** `draw`, once a drawing slot is free. A finished drawing hands its slot straight to the next in line. */
export async function drawSlot<T>(draw: () => Promise<T>): Promise<T> {
  if (drawing < DRAWING_AT_ONCE) drawing++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await draw();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else drawing--;
  }
}

let drawingCode: Promise<typeof import('@/components/app/sharing/panel-image')> | undefined;

/** The drawing code, loaded once and shared by every drawing; a failed load is tried again next time. */
export function loadDrawingCode(): Promise<typeof import('@/components/app/sharing/panel-image')> {
  drawingCode ??= import('@/components/app/sharing/panel-image').catch((err: unknown) => {
    drawingCode = undefined;
    throw err;
  });
  return drawingCode;
}
