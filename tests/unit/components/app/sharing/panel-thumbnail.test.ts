/**
 * A synth's panel thumbnail for the picker (`f-synth-picker` t-328). Pins:
 *
 * - it is the panel as the page opens it (no values, no cables), in the design given, fitted to the thumbnail box;
 * - one is drawn once, and again only for a new definition or design; requests at the same moment share a drawing;
 * - a failed drawing is null, logged, and not tried again meanwhile (for `NOT_DRAWN_SECONDS`);
 * - thumbnails wait in the same queue as the share card: no more than two panels are drawn at once between them.
 *
 * Each test loads the modules afresh, so it starts with nothing kept and every drawing slot free.
 *
 * @see components/app/sharing/panel-thumbnail.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { panelPng, loggerError } = vi.hoisted(() => ({ panelPng: vi.fn(), loggerError: vi.fn() }));
vi.mock('@/components/app/sharing/panel-image', () => ({ panelPng }));
vi.mock('@/lib/logging', () => ({ logger: { error: loggerError } }));

import type * as Thumbnail from '@/components/app/sharing/panel-thumbnail';
import type * as Drawing from '@/components/app/sharing/drawing';
import { getSynthDef } from '@/lib/app/synths/defs';

const modelD = getSynthDef('model-d')!;
const tb303 = getSynthDef('tb-303')!;
const DRAWN = { png: Buffer.from('png'), width: 240, height: 90 };

let thumbnail: typeof Thumbnail;
let drawing: typeof Drawing;
beforeEach(async () => {
  vi.clearAllMocks();
  panelPng.mockResolvedValue(DRAWN);
  vi.resetModules();
  thumbnail = await import('@/components/app/sharing/panel-thumbnail');
  drawing = await import('@/components/app/sharing/drawing');
});

describe('panelThumbnail', () => {
  it('draws the panel as it opens, in the design given, inside the thumbnail box', async () => {
    const png = await thumbnail.panelThumbnail(modelD, 'faithful');
    expect(png).toEqual(Buffer.from('png'));
    expect(panelPng).toHaveBeenCalledExactlyOnceWith({
      def: modelD,
      values: {},
      cables: [],
      design: 'faithful',
      box: thumbnail.THUMBNAIL_BOX,
    });
  });

  it('draws one once, and again only for another synth or design', async () => {
    await thumbnail.panelThumbnail(modelD, 'neutral');
    await thumbnail.panelThumbnail(modelD, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(1);
    await thumbnail.panelThumbnail(modelD, 'faithful');
    await thumbnail.panelThumbnail(tb303, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(3);
  });

  it('shares one drawing between requests for the same thumbnail at the same moment', async () => {
    const pngs = await Promise.all(
      [1, 2, 3].map(() => thumbnail.panelThumbnail(modelD, 'neutral'))
    );
    expect(panelPng).toHaveBeenCalledTimes(1);
    expect(pngs.every((p) => p?.equals(Buffer.from('png')))).toBe(true);
  });

  it('is null, and says why, when the panel cannot be drawn; and is not tried again meanwhile', async () => {
    const failure = new Error('rasteriser fell over');
    panelPng.mockRejectedValueOnce(failure);
    expect(await thumbnail.panelThumbnail(modelD, 'neutral')).toBeNull();
    expect(loggerError).toHaveBeenCalledWith(
      'Synth thumbnail: the panel could not be drawn',
      failure,
      { synthId: 'model-d' }
    );
    // Remembered (for `NOT_DRAWN_SECONDS`, the cache's own expiry): a picker opened meanwhile does not queue it again.
    expect(await thumbnail.panelThumbnail(modelD, 'neutral')).toBeNull();
    expect(panelPng).toHaveBeenCalledTimes(1);
    // What it remembers is that drawing alone: another synth, or another design, is drawn as usual.
    expect(await thumbnail.panelThumbnail(tb303, 'neutral')).toEqual(Buffer.from('png'));
    expect(await thumbnail.panelThumbnail(modelD, 'faithful')).toEqual(Buffer.from('png'));
    expect(panelPng).toHaveBeenCalledTimes(3);
  });

  it('waits its turn behind other drawings in the shared queue', async () => {
    const finish: (() => void)[] = [];
    const busy = () => drawing.drawSlot(() => new Promise<void>((r) => finish.push(r)));
    const others = [busy(), busy()];
    const thumb = thumbnail.panelThumbnail(modelD, 'neutral');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(panelPng).not.toHaveBeenCalled();
    finish[0]();
    await vi.waitFor(() => expect(panelPng).toHaveBeenCalledTimes(1));
    finish[1]();
    await Promise.all([...others, thumb]);
  });
});

describe('thumbnailKey', () => {
  it('changes with the synth, its definition version and its design', () => {
    const key = thumbnail.thumbnailKey(modelD, 'neutral');
    expect(thumbnail.thumbnailKey(modelD, 'neutral')).toBe(key);
    expect(thumbnail.thumbnailKey(modelD, 'faithful')).not.toBe(key);
    expect(thumbnail.thumbnailKey(tb303, 'neutral')).not.toBe(key);
    expect(thumbnail.thumbnailKey({ ...modelD, version: modelD.version + 1 }, 'neutral')).not.toBe(
      key
    );
  });
});
