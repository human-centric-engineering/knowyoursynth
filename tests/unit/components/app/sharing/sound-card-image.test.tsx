/**
 * A shared sound's social card (t-50): the panel with the sound on it, or the text card when there is no panel to
 * draw. Pins:
 *
 * - the panel drawn is the sound's own, or what still fits when the synth has moved on;
 * - a sound with nothing that fits, or a panel that fails to draw, gets the text card, and the failure is logged;
 * - a panel drawn once is not drawn again, and an edit to the sound is a new picture;
 * - the card is the card's size.
 *
 * @see components/app/sharing/sound-card-image.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { imageResponse } = vi.hoisted(() => ({ imageResponse: vi.fn() }));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: unknown) {
      imageResponse(element, options);
    }
  },
}));
vi.mock('@/components/app/sharing/panel-image', () => ({ panelPng: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

import { panelPng } from '@/components/app/sharing/panel-image';
import { soundCard } from '@/components/app/sharing/sound-card-image';
import type { SocialCardInput } from '@/components/app/sharing/social-card';
import type { PublicSound } from '@/lib/app/sounds/data';
import { getSynthDef } from '@/lib/app/synths/defs';
import { logger } from '@/lib/logging';

const def = getSynthDef('model-d')!;

const SOUND = {
  slug: 'abcdefghjk',
  synthId: 'model-d',
  name: 'Glass pluck',
  author: 'patchwork',
  panel: { values: { 'filter.cutoff': -3 }, cables: [] },
  fitted: null,
} as unknown as PublicSound;

/** The card's props, as `ImageResponse` was handed them. */
const cardProps = () => {
  const [element, options] = imageResponse.mock.calls[0] as [
    ReactElement<SocialCardInput>,
    unknown,
  ];
  return { props: element.props, options };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(panelPng).mockResolvedValue({ png: Buffer.from('png'), width: 1104, height: 395 });
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
    const sound = {
      ...SOUND,
      panel: { values: { 'filter.cutoff': 1 }, cables: [] },
    } as PublicSound;
    await soundCard(def, sound, 'neutral');
    await soundCard(def, sound, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(1);
    await soundCard(def, sound, 'faithful');
    const edited = { values: { 'filter.cutoff': 1.5 }, cables: [] };
    await soundCard(def, { ...sound, panel: edited }, 'neutral');
    expect(panelPng).toHaveBeenCalledTimes(3);
  });

  it('is the text card, and says why, when the panel cannot be drawn', async () => {
    vi.mocked(panelPng).mockRejectedValue(new Error('rasteriser fell over'));
    await soundCard(def, { ...SOUND, panel: { values: { 'osc.x': 9 }, cables: [] } }, 'neutral');
    expect(cardProps().props.panel).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Sound card: the panel could not be drawn',
      expect.objectContaining({ synthId: 'model-d', err: expect.stringContaining('fell over') })
    );
  });
});
