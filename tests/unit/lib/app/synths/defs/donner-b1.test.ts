/**
 * Donner B1 definition tests: the panel → engine mapping, the readouts, the maker's marks and the areas.
 *
 * The B1 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except its
 * own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip shows up
 * with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/donner-b1.ts
 */
import { describe, expect, it } from 'vitest';
import type { Control, ControlValues, EngineContext, TextDecor } from '@/lib/app/synths/contract';
import donnerB1 from '@/lib/app/synths/defs/donner-b1';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => donnerB1.toEngine({ ...donnerB1.init, ...set }, CTX);

const control = (id: string): Control => {
  const c = donnerB1.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number): string => {
  const c = control(id);
  if (c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('Donner B1 toEngine at the init patch', () => {
  const p = run();

  it('sounds one sawtooth oscillator at pitch', () => {
    expect(p.osc).toHaveLength(1);
    expect(p.osc[0]).toMatchObject({ level: 0.8, mix: { saw: 1 }, pw: 0.5, semi: 0, kbd: true });
  });

  it('maps the filter from CUT OFF, RESONANCE and DEPTH', () => {
    // CUT OFF 4 is 0.4 of the way up a 140 Hz–6 kHz log sweep; DEPTH 5 is half of 4.5.
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', envSrc: 'env1', kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.4, 140, 6000), 6);
    expect(p.filter.res).toBeCloseTo(0.5 * 1.05, 10);
    expect(p.filter.envAmt).toBeCloseTo(2.25, 10);
  });

  it('runs the filter and the VCA from the one DECAY, with no release on the volume', () => {
    const decay = exp(0.4, 0.12, 2.2);
    expect(p.env1).toMatchObject({ a: 0.003, s: 0 });
    expect(p.env1.d).toBeCloseTo(decay, 10);
    expect(p.env1.r).toBeCloseTo(decay, 10);
    expect(p.env2).toMatchObject({ a: 0.003, s: 0, r: 0.012 });
    expect(p.env2.d).toBeCloseTo(0.15 + decay * 1.5, 10);
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
  });

  it('routes filter → VCA → saturation → delay, with both effects off', () => {
    expect(p.normals).toEqual({ vcaIn: 'vcf1', odIn: 'vca', delayIn: 'od' });
    expect(p.od).toEqual({ on: false });
    expect(p.delay).toEqual({ on: false });
  });

  it('sets MASTER and leaves the unused parts quiet', () => {
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
    expect(p.noise).toEqual({ level: 0, color: 'white' });
    expect(p.ext).toEqual({ level: 0 });
    expect(p.routes).toEqual([]);
  });
});

describe('Donner B1 toEngine, control by control', () => {
  it('switches the wave to square', () => {
    expect(run({ 'vco.wave': 'sq' }).osc[0].mix).toEqual({ pulse: 1 });
  });

  it('tunes by PITCH in semitones, a fifth either way', () => {
    expect(run({ 'vco.pitch': -7 }).osc[0].semi).toBe(-7);
    expect(run({ 'vco.pitch': 7 }).osc[0].semi).toBe(7);
    expect(readout('vco.pitch', 0)).toBe(readout('vco.pitch', -0));
  });

  it('brings the saturation in with its DRIVE and TONE', () => {
    expect(run({ 'sat.on': true, 'sat.drive': 8, 'sat.tone': 3 }).od).toEqual({
      on: true,
      drive: 0.8,
      tone: 0.3,
      level: 0.8,
    });
  });

  it('brings the delay in with LEVEL, TIME and FEEDBACK', () => {
    const d = run({ 'dly.on': true, 'dly.level': 10, 'dly.time': 10, 'dly.feedback': 0 }).delay;
    // TIME 10 is the half second the B1 tops out at; FEEDBACK 0 leaves the single echo.
    expect(d).toMatchObject({ on: true, fb: 0 });
    expect(d?.time).toBeCloseTo(0.5, 10);
    expect(d?.mix).toBeCloseTo(0.6, 10);
    expect(run({ 'dly.on': true, 'dly.time': 0 }).delay?.time).toBeCloseTo(0.04, 10);
    expect(run({ 'dly.on': true, 'dly.feedback': 10 }).delay?.fb).toBeCloseTo(0.85, 10);
  });

  it('accents every note while ACCENT is lit, by the ACCENT knob', () => {
    expect(run().acid?.force).toBe(false);
    const p = run({ 'seq.accent': true, 'vca.accent': 10, 'vcf.resonance': 0 });
    expect(p.acid).toMatchObject({ force: true, amp: 0.9 });
    expect(p.acid?.cut).toBeCloseTo(0.6, 10);
    expect(run({ 'vca.accent': 0 }).acid).toMatchObject({ amp: 0, cut: 0 });
  });

  it('glides every note while SLIDE is lit, and only overlapping ones otherwise', () => {
    expect(run().glide).toEqual({ time: 0.07, legato: true });
    expect(run({ 'seq.slide': true }).glide).toEqual({ time: 0.07, legato: false });
  });

  it('ignores the panel modes: the keys, the tempo and the sequencer buttons', () => {
    const base = run();
    const modes = donnerB1.controls.filter((c) => c.ui);
    expect(modes.length).toBeGreaterThan(30);
    const flipped: ControlValues = {};
    for (const c of modes)
      flipped[c.id] = c.kind === 'bool' ? true : c.kind === 'cont' ? c.max : c.def;
    expect(run(flipped)).toEqual(base);
  });
});

describe('Donner B1 readouts', () => {
  it('reads CUT OFF, DECAY and TIME in units', () => {
    expect(readout('vcf.cutoff', 0)).toMatch(/140 ?Hz/);
    expect(readout('env.decay', 10)).toMatch(/2\.2 ?s/);
    expect(readout('dly.time', 10)).toMatch(/500 ?ms/);
    expect(readout('seq.tempo', 120)).toBe('120');
  });
});

describe('Donner B1 panel', () => {
  it('tags every maker’s mark as brand, and nothing else', () => {
    const brand = donnerB1.decor.filter((d) => d.brand);
    const texts = brand.filter((d): d is TextDecor => d.t === 'text').map((d) => d.text);
    expect(texts).toEqual(['DONNER', 'DONNER SYN BASS', 'ANALOG SYNTHESIZER AND SEQUENCER']);
    // the waveform bars of the logo
    expect(brand.filter((d) => d.t === 'path')).toHaveLength(1);
    const unbranded = donnerB1.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /donner/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('draws the 26 keys, the 16 numbered as steps', () => {
    const keys = donnerB1.controls.filter((c) => c.id.startsWith('kbd.key'));
    expect(keys).toHaveLength(26);
    expect(keys.filter((c) => /step \d+$/.test(c.name ?? ''))).toHaveLength(16);
  });

  it('puts every control and jack in exactly one area, inside the view', () => {
    const all = [...donnerB1.controls, ...donnerB1.jacks];
    expect(all.length).toBeGreaterThan(50);
    for (const p of all) {
      const at = (donnerB1.areas ?? []).filter((a) =>
        a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        p.id
      ).toHaveLength(1);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(donnerB1.view.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(donnerB1.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of donnerB1.controls) expect(donnerB1.init[c.id], c.id).toBe(c.def);
  });
});
