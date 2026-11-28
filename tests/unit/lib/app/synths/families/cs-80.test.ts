/**
 * The CS-80 family's map (t-338): what carries between the Yamaha CS-80 and the Deckard's Dream, and what each says
 * when it does not.
 *
 * @see lib/app/synths/families/cs-80.ts
 */
import { describe, expect, it } from 'vitest';
import type { SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { translate } from '@/lib/app/synths/families/translate';

const def = (id: string): SynthDef => {
  const d = getSynthDef(id);
  if (!d) throw new Error(`no definition ${id}`);
  return d;
};
const cs80 = def('cs-80');
const dd = def('deckards-dream');

describe('CS-80 → Deckard’s Dream', () => {
  it('carries the shared sliders under the same ids', () => {
    const t = translate({ 'ch1.lpf': 3.5, 'ch2.feet': '5.33', 'mix.mix': 5 }, [], cs80, dd);
    expect(t.values).toEqual({ 'ch1.lpf': 3.5, 'ch2.feet': '5.33', 'mix.mix': 5 });
    expect(t.dropped).toEqual([]);
  });

  it('takes NOISE as RND', () => {
    expect(translate({ 'sub.function': 'noise' }, [], cs80, dd).values).toEqual({
      'sub.function': 'rnd',
    });
  });

  it('brings the sub oscillator’s depths across at 0 when it was on EXT, saying why', () => {
    const t = translate({ 'sub.function': 'ext', 'sub.vco': 5 }, [], cs80, dd);
    expect(t.values).toEqual({ 'sub.vco': 0 });
    expect(t.dropped.map((d) => (d.kind === 'control' ? d.id : ''))).toEqual([
      'sub.function',
      'sub.vco',
    ]);
    expect(t.changed[0].reason).toMatch(/EXT/);
  });

  it('names the preset rows, the ring modulator and the tremolo as what does not carry', () => {
    const t = translate({ 'ch1.tone': 'brass1', 'ring.mod': 5, 'trem.on': 'on' }, [], cs80, dd);
    expect(t.values).toEqual({});
    expect(t.dropped.map((d) => d.reason)).toEqual([
      expect.stringMatching(/no preset rows/),
      'The Deckard’s Dream has no ring modulator',
      'The Deckard’s Dream has no tremolo or chorus',
    ]);
  });

  it('brings TOUCH SPEED across at 0, since it answers to pressure there and velocity here', () => {
    const t = translate({ 'touch.speed': 8 }, [], cs80, dd);
    expect(t.values).toEqual({ 'touch.speed': 0 });
    expect(t.changed[0].reason).toMatch(/pressure/);
  });

  it('clamps COARSE to the Deckard’s Dream’s five semitones', () => {
    const t = translate({ 'tune.coarse': -6 }, [], cs80, dd);
    expect(t.values).toEqual({ 'tune.coarse': -5 });
    expect(t.changed).toHaveLength(1);
  });
});

describe('Deckard’s Dream → CS-80', () => {
  it('takes RND as NOISE, and S/H as NOISE with what is lost', () => {
    expect(translate({ 'sub.function': 'rnd' }, [], dd, cs80).values).toEqual({
      'sub.function': 'noise',
    });
    const sh = translate({ 'sub.function': 'sh' }, [], dd, cs80);
    expect(sh.values).toEqual({ 'sub.function': 'noise' });
    expect(sh.changed[0].reason).toMatch(/no S\/H/);
  });

  it('turns the P/G centre into PORTAMENTO at 0, so nothing glides', () => {
    const t = translate({ 'porta.mode': 'off', 'porta.time': 8 }, [], dd, cs80);
    expect(t.values).toEqual({ 'porta.mode': 'porta', 'porta.time': 0 });
    expect(t.changed.map((c) => c.id).sort()).toEqual(['porta.mode', 'porta.time']);
  });

  it('says a velocity TOUCH SPEED is lost on the CS-80', () => {
    const t = translate({ 'touch.speed': 8 }, [], dd, cs80);
    expect(t.values).toEqual({ 'touch.speed': 0 });
    expect(t.dropped[0]).toMatchObject({
      id: 'touch.speed',
      reason: expect.stringMatching(/pressure/),
    });
  });

  it('carries a glide on P or G as it is', () => {
    expect(translate({ 'porta.mode': 'gliss', 'porta.time': 6 }, [], dd, cs80).values).toEqual({
      'porta.mode': 'gliss',
      'porta.time': 6,
    });
  });
});
