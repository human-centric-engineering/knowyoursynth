/**
 * A shared sound's panel as a picture (t-50): the synth page's own faceplate, rendered on the server and rasterised.
 * Pins, against the real registry and the real rasteriser:
 *
 * - the sound's values and cables are what is drawn, checked against the synth as the page checks them;
 * - each design path: `neutral` leaves the maker's marks out, `faithful` keeps them;
 * - a modular synth is drawn as the page opens it, as the modular case;
 * - the PNG fits the box, by width or by height as the panel's shape decides.
 *
 * The faceplate renderer is the bundle's entry itself (`panel-render-entry.tsx`): the bundle is a build product, and
 * what it bundles is what is under test.
 *
 * @see components/app/sharing/panel-image.ts
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@/components/app/sharing/panel-render',
  async () => import('@/components/app/sharing/panel-render-entry')
);

import { panelPng, panelSvg } from '@/components/app/sharing/panel-image';
import { getSynthDef } from '@/lib/app/synths/defs';
import { modularDef } from '@/lib/app/synths/lib/layout';

const modelD = getSynthDef('model-d')!;

const svg = (over: Partial<Parameters<typeof panelSvg>[0]> = {}) =>
  panelSvg({ def: modelD, values: {}, cables: [], design: 'neutral', ...over }).svg;

/** How many paths are drawn: a cable adds its own. */
const pathCount = (markup: string) => markup.split('<path').length;

describe('panelSvg', () => {
  it('is a standalone SVG at the panel’s own size', () => {
    const {
      svg: out,
      width,
      height,
    } = panelSvg({
      def: modelD,
      values: {},
      cables: [],
      design: 'neutral',
    });
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect([width, height]).toEqual([modelD.view.w, modelD.view.h]);
    expect(out).toContain(`width="${width}" height="${height}"`);
  });

  it('draws the sound’s values, and drops what the synth does not have', () => {
    const control = Object.keys(modelD.init).find((k) => typeof modelD.init[k] === 'number')!;
    const plain = svg();
    const moved = svg({ values: { [control]: 4, 'no.such.control': 9 } });
    expect(moved).not.toBe(plain);
    expect(svg({ values: { 'no.such.control': 9 } })).toBe(plain);
  });

  it('draws the sound’s cables, and drops ones between jacks the synth does not have', () => {
    const [out, into] = [
      modelD.jacks.find((j) => j.dir === 'out')!,
      modelD.jacks.find((j) => j.dir === 'in')!,
    ];
    const plain = svg();
    const patched = svg({ cables: [[out.id, into.id]] });
    expect(pathCount(patched)).toBeGreaterThan(pathCount(plain));
    expect(svg({ cables: [['j.nope', 'j.nada']] })).toBe(plain);
  });

  it.each(['model-d', 'pro-1'])(
    '%s: neutral leaves the maker’s marks out, faithful keeps them',
    (id) => {
      const def = getSynthDef(id)!;
      const marks = def.decor.filter((d) => d.brand);
      expect(marks.length).toBeGreaterThan(0);
      const neutral = svg({ def, design: 'neutral' });
      const faithful = svg({ def, design: 'faithful' });
      expect(faithful).not.toBe(neutral);
      expect(faithful.length).toBeGreaterThan(neutral.length);
    }
  );

  it('draws a modular synth as the modular case, as the page opens it', () => {
    const def = getSynthDef('jupiter-8')!;
    const { width, height } = panelSvg({ def, values: {}, cables: [], design: 'neutral' });
    expect([width, height]).toEqual([modularDef(def).view.w, modularDef(def).view.h]);
    expect(width).not.toBe(def.view.w);
  });
});

describe('panelPng', () => {
  const box = { width: 1104, height: 408 };

  it('fits a wide panel to the box’s width', async () => {
    const { png, width, height } = await panelPng({
      def: modelD,
      values: {},
      cables: [],
      design: 'neutral',
      box,
    });
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(width).toBe(box.width);
    expect(height).toBeLessThanOrEqual(box.height);
  });

  it('fits a tall panel to the box’s height', async () => {
    const { width, height } = await panelPng({
      def: getSynthDef('jupiter-4')!,
      values: {},
      cables: [],
      design: 'neutral',
      box,
    });
    expect(height).toBe(box.height);
    expect(width).toBeLessThanOrEqual(box.width);
  });
});
