import {
  NOT_DRAWN_SECONDS,
  panelThumbnail,
  thumbnailKey,
} from '@/components/app/sharing/panel-thumbnail';
import { getListedSynthDesign } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';

/**
 * A synth's panel as a small picture, for its row in the synth picker (`f-synth-picker` t-328): `panelThumbnail`, as
 * the page opens the panel, in the synth's design. Only a synth the catalogue serves has one; any other id is a 404.
 *
 * A page route, beside the share card's `opengraph-image`, rather than one under `/api/v1`: the picker asks for every
 * synth's at once, which the API's per-visitor limit is not sized for, and like that card it is a picture of a page,
 * not data. It is cheap to repeat: the picture is kept in memory, and a browser revalidates it on every use by its
 * ETag, which changes with the synth's definition and design, so the answer is usually an empty 304. It is never served
 * from a cache unasked: a design turned back to neutral (D11, the maker's approval withdrawn) takes the maker's marks
 * off the picker at once. A panel that will not draw is a 404 for as long as the failure is remembered.
 */

const CACHE_CONTROL = 'public, no-cache';
const NOT_DRAWN_CACHE_CONTROL = `public, max-age=${NOT_DRAWN_SECONDS}`;

const notFound = (headers: Record<string, string> = {}) =>
  new Response(null, { status: 404, headers });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const def = getSynthDef(id);
  const design = def ? await getListedSynthDesign(id) : null;
  if (!def || !design) return notFound();

  const etag = thumbnailKey(def, design);
  const headers = { ETag: etag, 'Cache-Control': CACHE_CONTROL };
  // Its own 304 rather than `checkConditional`'s, whose directive is the API's: this one keeps the picture's. A cache
  // may send several tags, or `*`.
  const held = (request.headers.get('If-None-Match') ?? '').split(',').map((t) => t.trim());
  if (held.includes(etag) || held.includes('*'))
    return new Response(null, { status: 304, headers });

  const png = await panelThumbnail(def, design);
  // A panel that will not draw has no picture; the picker shows the row without one.
  if (!png) return notFound({ 'Cache-Control': NOT_DRAWN_CACHE_CONTROL });
  return new Response(new Uint8Array(png), {
    headers: { ...headers, 'Content-Type': 'image/png' },
  });
}
