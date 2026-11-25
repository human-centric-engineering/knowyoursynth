/**
 * System 55 definition tests: the app-only 960 CLOCK box on the output panel (t-317) sits clear of the
 * blank panel's BP8 label, and a mark over the whole box gives it a hover card.
 *
 * @see lib/app/synths/defs/system-55.ts
 * @see lib/app/synths/defs/moog900/modules.ts (`appOut`)
 */
import { describe, expect, it } from 'vitest';
import type { RectDecor, TextDecor } from '@/lib/app/synths/contract';
import system55 from '@/lib/app/synths/defs/system-55';
import { FOLLOW_960 } from '@/lib/app/synths/defs/moog900/modules';

const texts = system55.decor.filter((d): d is TextDecor => d.t === 'text');
const text = (s: string) => {
  const found = texts.filter((d) => d.text === s);
  if (found.length !== 1) throw new Error(`expected one "${s}", found ${found.length}`);
  return found[0];
};
const switchBox = () => {
  const label = text('960 CLOCK');
  const box = system55.decor.find(
    (d): d is RectDecor =>
      d.t === 'rect' &&
      !!d.appOnly &&
      label.x >= d.x &&
      label.x <= d.x + d.w &&
      label.y >= d.y &&
      label.y <= d.y + d.h
  );
  if (!box) throw new Error('no 960 CLOCK box');
  return box;
};
const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe('System 55 960 CLOCK box', () => {
  it('ends above the BP8 label, so the label does not print over it', () => {
    const box = switchBox();
    const bp8 = text('BP8');
    // a text's y is its baseline; its capitals reach up about its size
    expect(box.y + box.h).toBeLessThan(bp8.y - (bp8.size ?? 17));
  });

  it('holds its title, FREE, BEAT, THIS APP ONLY and the switch', () => {
    const box = switchBox();
    const rocker = system55.controls.find((c) => c.id === FOLLOW_960);
    if (!rocker) throw new Error('no 960 CLOCK switch');
    expect(inside(rocker.x, rocker.y, box)).toBe(true);
    for (const s of ['960 CLOCK', 'FREE', 'BEAT']) {
      const t = text(s);
      expect(inside(t.x, t.y, box), s).toBe(true);
    }
    const appOnly = texts.find((d) => d.text === 'THIS APP ONLY' && inside(d.x, d.y, box));
    expect(appOnly).toBeDefined();
  });

  it('is covered by a mark whose card says what FREE and BEAT do', () => {
    const box = switchBox();
    const mark = system55.marks?.find((m) => m.id === 'out.follow960.box');
    if (!mark) throw new Error('no mark over the 960 CLOCK box');
    expect(mark.rect).toEqual({ x: box.x, y: box.y, w: box.w, h: box.h });
    expect(mark.help).toMatch(/Not on the hardware/);
    expect(mark.help).toMatch(/At FREE/);
    expect(mark.help).toMatch(/At BEAT/);
  });
});
