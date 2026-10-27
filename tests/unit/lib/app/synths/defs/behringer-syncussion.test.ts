/**
 * Behringer SYNCUSSION SY-1 definition tests: what is the Behringer's own on top of the voice it shares with the Pearl
 * original (`syncussion-kit.ts`, whose mapping `pearl-syncussion.test.ts` pins control by control): the FINE knobs,
 * the TRIG buttons and SENSE knobs, the sockets, the maker's marks and the areas.
 *
 * @see lib/app/synths/defs/behringer-syncussion.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, TextDecor } from '@/lib/app/synths/contract';
import behringer from '@/lib/app/synths/defs/behringer-syncussion';
import pearl from '@/lib/app/synths/defs/pearl-syncussion';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => behringer.toEngine({ ...behringer.init, ...set }, CTX);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('Behringer SYNCUSSION toEngine at the init patch', () => {
  const p = run();

  it('is the Pearl’s voice with FINE centred, at a fixed volume (no POWER on the panel)', () => {
    const { volume, ...rest } = p;
    const { volume: pv, ...pearlRest } = pearl.toEngine(pearl.init, CTX);
    expect(volume).toBe(0.8);
    expect(pv).toBe(0.8);
    expect(rest).toEqual(pearlRest);
  });

  it('plays the two channels split at middle C, each at its OUTPUT level', () => {
    expect(p.dual).toMatchObject({ assign: 'split', split: 60 });
    expect(p.dual?.level[0]).toBeCloseTo(level(8, 1.6), 10);
    expect(run({ 'ch2.output': 0 }).dual?.level[1]).toBe(0);
  });
});

describe('Behringer SYNCUSSION controls of its own', () => {
  it('tunes each channel by FINE, a semitone either way', () => {
    const base = run().osc[0].fixedNote ?? 0;
    expect(run({ 'ch1.fine': 10 }).osc[0].fixedNote).toBeCloseTo(base + 1, 10);
    expect(run({ 'ch1.fine': 0 }).osc[0].fixedNote).toBeCloseTo(base - 1, 10);
    expect(run({ 'ch2.fine': 10 }).dual?.b.osc[1].fixedNote).toBeCloseTo(base + 1, 10);
  });

  it('changes nothing from the TRIG buttons or the SENSE knobs', () => {
    const flipped = run({ 'ch1.trig': true, 'ch2.trig': true, 'ch1.sense': 10, 'ch2.sense': 0 });
    expect(flipped).toEqual(run());
    expect(behringer.controls.filter((c) => c.ui).map((c) => c.id)).toEqual([
      'ch1.trig',
      'ch2.trig',
    ]);
  });
});

describe('Behringer SYNCUSSION sockets', () => {
  const jack = (id: string) => {
    const j = behringer.jacks.find((x) => x.id === id);
    if (!j) throw new Error(`no jack ${id}`);
    return j;
  };

  it('sends each channel to its own OUTPUT and both to PHONES', () => {
    expect(jack('j.ch1Out')).toMatchObject({ dir: 'out', signal: 'vca', part: 0 });
    expect(jack('j.ch2Out')).toMatchObject({ dir: 'out', signal: 'vca', part: 1 });
    expect(jack('j.phones')).toMatchObject({ dir: 'out', signal: 'out' });
  });

  it('leaves TUNE, TRIG and MUTE unmodelled, and says so', () => {
    for (const id of ['j.ch1Tune', 'j.ch1Trig', 'j.ch2Tune', 'j.ch2Trig', 'j.mute']) {
      const j = jack(id);
      expect(j).toMatchObject({ dir: 'in', dest: null });
      expect(j.help, id).toMatch(/Not modelled here/);
    }
  });
});

describe('Behringer SYNCUSSION panel', () => {
  it('tags the behringer logo and the printed SYNCUSSION and SY-1 as brand, and nothing else', () => {
    const brand = behringer.decor.filter((d) => d.brand);
    expect(brand.map((d) => (d.t === 'text' ? d.text : d.t))).toEqual([
      'logo',
      'SYNCUSSION',
      'SY-1',
    ]);
    const unbranded = behringer.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /syncussion|behringer/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('puts every control and jack in exactly one area, inside the view', () => {
    const all = [...behringer.controls, ...behringer.jacks];
    expect(all.length).toBeGreaterThan(30);
    for (const c of all) {
      const at = behringer.areas.filter((a) =>
        a.rects.some((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        c.id
      ).toHaveLength(1);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(behringer.view.w);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(behringer.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of behringer.controls) expect(behringer.init[c.id], c.id).toBe(c.def);
  });
});
