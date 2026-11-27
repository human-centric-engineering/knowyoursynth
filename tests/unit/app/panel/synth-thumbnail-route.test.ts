/**
 * A synth's panel thumbnail, for its row in the synth picker (`f-synth-picker` t-328). Pins:
 *
 * - a synth the catalogue serves gets its PNG in its design, with an ETag, revalidated on every use;
 * - a request carrying that ETag gets a 304 with the same headers, and nothing is drawn;
 * - a synth with no definition, or one the catalogue does not serve, is a 404 without a database read or a drawing;
 * - a panel that cannot be drawn is a 404, cached for as long as the failure is remembered.
 *
 * @see app/(panel)/synths/[id]/thumbnail.png/route.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getListedSynthDesign, panelThumbnail } = vi.hoisted(() => ({
  getListedSynthDesign: vi.fn(),
  panelThumbnail: vi.fn(),
}));
vi.mock('@/lib/app/catalogue/read', () => ({ getListedSynthDesign }));
vi.mock('@/components/app/sharing/panel-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/sharing/panel-thumbnail')>()),
  panelThumbnail,
}));

import { GET } from '@/app/(panel)/synths/[id]/thumbnail.png/route';
import { NOT_DRAWN_SECONDS, thumbnailKey } from '@/components/app/sharing/panel-thumbnail';
import { getSynthDef } from '@/lib/app/synths/defs';

const modelD = getSynthDef('model-d')!;
const PNG = Buffer.from('a png');

const get = (id: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/synths/${id}/thumbnail.png`, { headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getListedSynthDesign.mockResolvedValue('faithful');
  panelThumbnail.mockResolvedValue(PNG);
});

describe('GET /synths/[id]/thumbnail.png', () => {
  it("serves the synth's thumbnail in its design, with its ETag, revalidated on every use", async () => {
    const res = await get('model-d');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('ETag')).toBe(thumbnailKey(modelD, 'faithful'));
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
    expect(getListedSynthDesign).toHaveBeenCalledWith('model-d');
    expect(panelThumbnail).toHaveBeenCalledWith(modelD, 'faithful');
  });

  it('answers a request that has it already with a 304, the same headers and no drawing', async () => {
    const etag = thumbnailKey(modelD, 'faithful');
    const res = await get('model-d', { 'If-None-Match': etag });
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(etag);
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache');
    expect(panelThumbnail).not.toHaveBeenCalled();
  });

  it('answers a 304 when its ETag is among several a cache sends, or for any', async () => {
    const etag = thumbnailKey(modelD, 'faithful');
    expect((await get('model-d', { 'If-None-Match': `W/"old", ${etag}` })).status).toBe(304);
    expect((await get('model-d', { 'If-None-Match': '*' })).status).toBe(304);
    expect(panelThumbnail).not.toHaveBeenCalled();
  });

  it('draws again for an ETag from before a design change', async () => {
    const res = await get('model-d', { 'If-None-Match': thumbnailKey(modelD, 'neutral') });
    expect(res.status).toBe(200);
    expect(panelThumbnail).toHaveBeenCalledTimes(1);
  });

  it('is a 404 for a synth with no definition, without reading or drawing', async () => {
    const res = await get('not-a-synth');
    expect(res.status).toBe(404);
    expect(getListedSynthDesign).not.toHaveBeenCalled();
    expect(panelThumbnail).not.toHaveBeenCalled();
  });

  it('is a 404 for a synth the catalogue does not serve', async () => {
    getListedSynthDesign.mockResolvedValue(null);
    const res = await get('model-d');
    expect(res.status).toBe(404);
    expect(panelThumbnail).not.toHaveBeenCalled();
  });

  it('is a 404 when the panel cannot be drawn, cached while the failure is remembered', async () => {
    panelThumbnail.mockResolvedValue(null);
    const res = await get('model-d');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${NOT_DRAWN_SECONDS}`);
  });
});
