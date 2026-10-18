/**
 * A shared sound's social card (t-50): the panel with the sound on it, or the text card when there is no panel to
 * draw. Pins:
 *
 * - the panel drawn is the sound's own, or what still fits when the synth has moved on;
 * - a sound with nothing that fits, a panel that fails to draw, or drawing code that cannot load, gets the text card,
 *   and the failure is logged;
 * - a panel drawn once is not drawn again, requests for it at the same moment share one drawing, an edit to the sound
 *   is a new picture, and a failed drawing is tried again next time;
 * - no more than two panels are drawn at once;
 * - the card is the card's size.
 *
 * Each test loads the module afresh, so it starts with nothing kept and every drawing slot free.
 *
 * @see components/app/sharing/sound-card-image.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { imageResponse, panelPng, panelImageModule, loggerError } = vi.hoisted(() => {
  const panelPng = vi.fn();
  return {
    imageResponse: vi.fn(),
    panelPng,
    panelImageModule: () => ({ panelPng }),
    loggerError: vi.fn(),
  };
});
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: unknown) {
      imageResponse(element, options);
    }
  },
}));
vi.mock('@/components/app/sharing/panel-image', panelImageModule);
vi.mock('@/lib/logging', () => ({ logger: { error: loggerError } }));

import type { SocialCardInput } from '@/components/app/sharing/social-card';
import type { soundCard as SoundCard } from '@/components/app/sharing/sound-card-image';
import type { PublicSound } from '@/lib/app/sounds/data';
import { getSynthDef } from '@/lib/app/synths/defs';

const def = getSynthDef('model-d')!;

const SOUND = {
  slug: 'abcdefghjk',
  synthId: 'model-d',
  name: 'Glass pluck',
  author: 'patchwork',
  panel: { values: { 'filter.cutoff': -3 }, cables: [] },
  fitted: null,
} as unknown as PublicSound;

const DRAWN = { png: Buffer.from('png'), width: 1104, height: 395 };

/** The props `ImageResponse` was handed on its `n`th card. */
const cardProps = (n = 0) => {
  const [element, options] = imageResponse.mock.calls[n] as [
    ReactElement<SocialCardInput>,
    unknown,
  ];
  return { props: element.props, options };
};

/** A sound whose panel differs from every other's, so it needs its own drawing. */
const soundNo = (n: number) =>
  ({ ...SOUND, panel: { values: { 'filter.cutoff': n }, cables: [] } }) as PublicSound;

let soundCard: typeof SoundCard;
beforeEach(async () => {
  vi.clearAllMocks();
  panelPng.mockResolvedValue(DRAWN);
  vi.resetModules();
  ({ soundCard } = await import('@/components/app/sharing/sound-card-image'));
});

describe('soundCard', () => {
  it("draws the sound's own panel, in the design given, onto a card of the card's size", async () => {
    await soundCard(def, SOUND, 'faithful');
    expect(panelPng).toHaveBeenCalledWith(
      expect.objectContaining({ def, values: SOUND.panel!.values, cables: [], design: 'faithful' })
    );
    const { props, options } = cardProps();
    expect(props.panel).toEqual({
      src: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
      width: 1104,
      height: 395,
    });
    expect(props).toMatchObject({ name: 'Glass pluck', author: 'patchwork', theme: def.theme });
    expect(options).toEqual({ width: 1200, height: 630 });
  });

  it('draws what still fits when the synth has moved on', async () => {
    const fitted = { values: { 'filter.cutoff': 2 }, cables: [] };
    await soundCard(def, { ...SOUND, panel: null, fitted }, 'neutral');
    expect(panelPng).toHaveBeenCalledWith(expect.objectContaining({ values: fitted.values }));
    expect(cardProps().props.panel).not.toBeNull();
  });

  it('is the text card when nothing fits the synth any more', async () => {
    await soundCard(def, { ...SOUND, panel: null, fitted: null }, 'neutral');
    expect(panelPng).not.toHaveBeenCalled();
    expect(cardProps().props.panel).toBeNull();
  });

  it('draws a panel once, and again only when what it is drawn from changes', async () => {
    await soundCard(def, SOUND, 'neutral');
    await soundCard(def, SOUND, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(1);
    await soundCard(def, SOUND, 'faithful');
    await soundCard(def, soundNo(1.5), 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(3);
  });

  it('shares one drawing between requests for the same card at the same moment', async () => {
    await Promise.all([1, 2, 3].map(() => soundCard(def, SOUND, 'neutral')));
    expect(panelPng).toHaveBeenCalledTimes(1);
    for (const n of [0, 1, 2]) expect(cardProps(n).props.panel).not.toBeNull();
  });

  it('draws no more than two panels at once, and the rest in turn', async () => {
    const finish: (() => void)[] = [];
    panelPng.mockImplementation(() => new Promise((resolve) => finish.push(() => resolve(DRAWN))));
    const cards = Promise.all([1, 2, 3].map((n) => soundCard(def, soundNo(n), 'neutral')));
    await vi.waitFor(() => expect(panelPng).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(panelPng).toHaveBeenCalledTimes(2);
    finish[0]();
    await vi.waitFor(() => expect(panelPng).toHaveBeenCalledTimes(3));
    finish[1]();
    finish[2]();
    await cards;
    for (const n of [0, 1, 2]) expect(cardProps(n).props.panel).not.toBeNull();
  });

  it('is the text card, and says why, when the panel cannot be drawn; and tries again next time', async () => {
    const failure = new Error('rasteriser fell over');
    panelPng.mockRejectedValueOnce(failure);
    await soundCard(def, SOUND, 'neutral');
    expect(cardProps().props.panel).toBeNull();
    expect(loggerError).toHaveBeenCalledWith('Sound card: the panel could not be drawn', failure, {
      synthId: 'model-d',
    });
    await soundCard(def, SOUND, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(2);
    expect(cardProps(1).props.panel).not.toBeNull();
  });

  it('is the text card when the drawing code cannot load on this server', async () => {
    const missing = new Error('Cannot find module @resvg/resvg-js-linux-x64-musl');
    vi.doMock('@/components/app/sharing/panel-image', () => {
      throw missing;
    });
    try {
      vi.resetModules();
      const { soundCard: card } = await import('@/components/app/sharing/sound-card-image');
      await card(def, SOUND, 'neutral');
      expect(cardProps().props.panel).toBeNull();
      // The test runner wraps a failing mock factory's error, keeping it as the cause.
      expect(loggerError).toHaveBeenCalledWith(
        'Sound card: the panel could not be drawn',
        expect.objectContaining({ cause: missing }),
        { synthId: 'model-d' }
      );
    } finally {
      vi.doMock('@/components/app/sharing/panel-image', panelImageModule);
    }
  });
});
