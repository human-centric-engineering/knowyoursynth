/**
 * Formanta Polivoks definition tests: the panel → engine mapping at init and for each switch, which key each generator
 * plays (rendered through the engine with two keys held), the readouts, the maker's marks and the English translation.
 *
 * The Polivoks has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/polivoks.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, EngineParams } from '@/lib/app/synths/contract';
import polivoks from '@/lib/app/synths/defs/polivoks';
import { render, type Timed } from '@/tests/unit/lib/app/synths/audio/render';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams =>
  polivoks.toEngine({ ...polivoks.init, ...set }, CTX);

const readout = (id: string, v: number): string => {
  const c = polivoks.controls.find((x) => x.id === id);
  if (!c || c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out on the 0–6 knob: (v / 6)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 6, 1.7) * max;

describe('Polivoks toEngine at the init patch', () => {
  const p = run();

  it('sounds Generator I’s sawtooth at 8′, following the top key through the glissando, and Generator II silent', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({
      mix: { saw: 1 },
      pw: 0.5,
      semi: 0,
      kbd: false,
      fixedNote: 60,
    });
    expect(p.osc[0].level).toBeCloseTo(level(4, 0.8), 10);
    expect(p.osc[1]).toMatchObject({ level: 0, mix: { pulse: 1 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.routes).toEqual([
      { src: 'kbd2', dst: 'slewIn', amt: 1 },
      { src: 'slew', dst: 'pitch1', amt: 12 },
    ]);
    expect(p.slew).toEqual({ time: 0 });
    expect(p.glide).toEqual({ time: 0, legato: false });
  });

  it('plays one voice, with no tuning offset', () => {
    expect(p.duo).toBe(false);
    expect(p.tune).toBe(0);
  });

  it('maps the filter: low-pass SVF, cutoff 3 of 6 on a 100 Hz–10 kHz sweep, half the envelope depth', () => {
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', res: 0, envSrc: 'env1', kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(1000, 6);
    expect(p.filter.envAmt).toBeCloseTo(2.5, 10);
    expect(p.od).toEqual({ on: false });
  });

  it('maps both envelopes, single-shot, and the amplifier from its own', () => {
    expect(p.env1).toEqual({ a: 0.002, d: exp(0.5, 0.01, 8), s: 0, r: 0.01 });
    expect(p.env2.a).toBe(0.002);
    expect(p.env2.d).toBe(0.01);
    expect(p.env2.s).toBe(1);
    expect(p.env2.r).toBeCloseTo(exp(1 / 6, 0.01, 10), 10);
    expect(p.env2.loop).toBeUndefined();
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
  });

  it('runs the modulator as a triangle at rate 3, and sets the volume', () => {
    expect(p.lfo).toEqual({ rate: exp(0.5, 0.1, 30), mix: { tri: 1 }, keySync: false });
    expect(p.volume).toBeCloseTo(level(4, 1), 10);
    expect(p.noise).toEqual({ level: 0, color: 'white' });
    expect(p.ext).toEqual({ level: 0 });
  });
});

describe('Polivoks toEngine, switch by switch', () => {
  it('2-ГОЛ. turns on the duophonic keyboard', () => {
    expect(run({ 'kbd.voices': '2' }).duo).toBe(true);
    expect(run({ 'kbd.voices': '1' }).duo).toBe(false);
  });

  it('ДИАПАЗОН moves each generator in octaves', () => {
    expect(run({ 'gen1.range': "32'" }).osc[0].semi).toBe(-24);
    expect(run({ 'gen1.range': "2'" }).osc[0].semi).toBe(24);
    expect(run({ 'gen2.range': "16'" }).osc[1].semi).toBe(-12);
    expect(run({ 'gen2.range': "4'" }).osc[1].semi).toBe(12);
  });

  it('ФОРМА picks the waveform and, for the pulses, the width', () => {
    const shape = (s: string) => {
      const o = run({ 'gen1.shape': s, 'gen2.shape': s }).osc;
      expect(o[1]).toMatchObject({ mix: o[0].mix, pw: o[0].pw });
      return { mix: o[0].mix, pw: o[0].pw };
    };
    expect(shape('triangle')).toEqual({ mix: { tri: 1 }, pw: 0.5 });
    expect(shape('sawtooth')).toEqual({ mix: { saw: 1 }, pw: 0.5 });
    expect(shape('square')).toEqual({ mix: { pulse: 1 }, pw: 0.5 });
    expect(shape('pulse_1')).toEqual({ mix: { pulse: 1 }, pw: 0.25 });
    expect(shape('pulse_2')).toEqual({ mix: { pulse: 1 }, pw: 0.1 });
  });

  it('НАСТРОЙКА tunes both generators a tone either way; Generator I carries it itself, off the keyboard', () => {
    const p = run({ 'gen.tune': 3 });
    expect(p.tune).toBeCloseTo(2, 10);
    expect(p.osc[0].semi).toBeCloseTo(2, 10);
    expect(p.osc[1].semi).toBe(0);
    expect(run({ 'gen.tune': -3, 'gen1.range': "16'" }).osc[0].semi).toBeCloseTo(-14, 10);
  });

  it('РАССТРОЙКА detunes Generator II alone, two tones either way', () => {
    const p = run({ 'gen2.detune': -3 });
    expect(p.osc[1].semi).toBeCloseTo(-4, 10);
    expect(p.osc[0].semi).toBe(0);
    expect(run({ 'gen2.detune': 1.5 }).osc[1].semi).toBeCloseTo(2, 10);
  });

  it('ГЛИССАНДО is the slew on Generator I’s pitch, never the engine’s glide', () => {
    const p = run({ 'gen1.glide': 6 });
    expect(p.slew!.time).toBeCloseTo(3, 10);
    expect(p.glide.time).toBe(0);
    expect(run({ 'gen1.glide': 3 }).slew!.time).toBeCloseTo(0.01 * Math.sqrt(300), 10);
  });

  it('РЕЖИМ picks the modulator’s wave; noise modulates from the noise generator instead', () => {
    expect(run({ 'lfo.shape': 'square' }).lfo.mix).toEqual({ sq: 1 });
    expect(run({ 'lfo.shape': 'stepped' }).lfo.mix).toEqual({ sh: 1 });
    const depths = { 'gen1.mod': 6, 'gen2.mod': 6, 'vcf.mod': 6, 'vca.mod': 6 };
    const srcs = (shape: string) =>
      run({ 'lfo.shape': shape, ...depths })
        .routes!.filter((r) => r.dst !== 'slewIn' && r.src !== 'slew')
        .map((r) => r.src);
    expect(srcs('triangle')).toEqual(['lfo', 'lfo', 'lfo', 'lfo']);
    expect(srcs('noise')).toEqual(['noise', 'noise', 'noise', 'noise']);
  });

  it('sends the modulator to each generator, the cutoff and the loudness at its own depth', () => {
    const r = run({ 'gen1.mod': 3, 'gen2.mod': 6, 'vcf.mod': 6, 'vca.mod': 3 }).routes!;
    expect(r).toContainEqual({ src: 'lfo', dst: 'pitch1', amt: 6 });
    expect(r).toContainEqual({ src: 'lfo', dst: 'pitch2', amt: 24 });
    expect(r).toContainEqual({ src: 'lfo', dst: 'cutoff', amt: 4 });
    expect(r).toContainEqual({ src: 'lfo', dst: 'amp', amt: 0.3, by: 'env2' });
  });

  it('ГЕНЕРАТОР II on Generator I is frequency modulation from Generator II', () => {
    expect(run({ 'gen1.fm': 6 }).routes).toContainEqual({ src: 'osc2', dst: 'pitch1', amt: 24 });
  });

  it('ПФ/ФНЧ switches the filter between band-pass and low-pass', () => {
    expect(run({ 'vcf.mode': 'band_pass' }).filter.mode).toBe('bp');
    expect(run({ 'vcf.mode': 'low_pass' }).filter.mode).toBe('lp');
  });

  it('closes the filter at ЧАСТОТА СРЕЗА 0 and opens it to 10 kHz at the top', () => {
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBe(10);
    expect(run({ 'vcf.cutoff': 6 }).filter.cutoff).toBeCloseTo(10000, 6);
  });

  it('РЕЗОНАНС drives the overdrive harder as it rises, up to self-oscillation', () => {
    const half = run({ 'vcf.resonance': 3 });
    expect(half.filter.res).toBeCloseTo(0.525, 10);
    expect(half.od).toEqual({ on: true, drive: 0.15, tone: 0.55, level: 1 });
    const full = run({ 'vcf.resonance': 6 });
    expect(full.filter.res).toBeCloseTo(1.05, 10);
    expect(full.od!.drive).toBeCloseTo(0.6, 10);
  });

  it('each РЕЖИМ ГЕНЕРАТОРА ОГИБАЮЩЕЙ switch makes its own envelope repeat', () => {
    const f = run({ 'fenv.mode': 'repeat' });
    expect(f.env1.loop).toBe(true);
    expect(f.env2.loop).toBeUndefined();
    const a = run({ 'aenv.mode': 'repeat' });
    expect(a.env2.loop).toBe(true);
    expect(a.env1.loop).toBeUndefined();
  });

  it('ВЫХОД off silences the output', () => {
    expect(run({ 'out.enable': false }).volume).toBe(0);
  });

  it('sets the mixer levels on their curves', () => {
    const p = run({ 'mixer.gen2': 6, 'mixer.noise': 3, 'mixer.ext': 6 });
    expect(p.osc[1].level).toBeCloseTo(0.8, 10);
    expect(p.noise.level).toBeCloseTo(level(3, 0.6), 10);
    expect(p.ext.level).toBeCloseTo(1, 10);
  });

  it('ТЛФ. and ВКЛ. change nothing the engine hears', () => {
    expect(run({ 'out.phones': 6, 'kbd.keyMemory': 'hold' })).toEqual(run());
  });
});

describe('Polivoks keys: which generator plays which key', () => {
  const SR = 48000;
  /** Hz from the upward zero crossings between two sample positions. */
  const hz = (b: Float32Array, from: number, to: number): number => {
    const ups: number[] = [];
    for (let i = from + 1; i < to; i++) if (b[i - 1] < 0 && b[i] >= 0) ups.push(i);
    return ((ups.length - 1) * SR) / (ups[ups.length - 1] - ups[0]);
  };
  const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);
  const C3 = 48,
    G3 = 55;
  const on = (at: number, n: number): Timed => [at, { type: 'noteOn', n, v: 0.8 }];
  // One generator heard at a time, both triangles, through an open filter at full loudness.
  const alone = (g: 1 | 2, set: ControlValues = {}): EngineParams =>
    run({
      'gen1.shape': 'triangle',
      'gen2.shape': 'triangle',
      'mixer.gen1': g === 1 ? 6 : 0,
      'mixer.gen2': g === 2 ? 6 : 0,
      'vcf.cutoff': 6,
      'vcf.env': 0,
      ...set,
    });
  // C3 held, then G3 pressed above it: both held from 0.1 s
  const twoKeys = { len: 14400, events: [on(0, C3), on(4800, G3)] };

  it('2-ГОЛ.: Generator I plays the top key and Generator II the bottom', () => {
    const duo = { 'kbd.voices': '2' };
    expect(hz(render(alone(1, duo), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(G3), -1);
    expect(hz(render(alone(2, duo), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(C3), -1);
  });

  it('1-ГОЛ.: both generators play the key pressed last', () => {
    const mono = { 'kbd.voices': '1' };
    expect(hz(render(alone(1, mono), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(G3), -1);
    expect(hz(render(alone(2, mono), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(G3), -1);
  });

  it('ГЛИССАНДО slides Generator I to the new key while Generator II jumps straight to it', () => {
    const slow = { 'kbd.voices': '1', 'gen1.glide': 6 };
    // just after G3 is pressed: Generator II is there, Generator I is still more than two semitones away, sliding
    expect(hz(render(alone(2, slow), twoKeys).out, 6000, 9600)).toBeCloseTo(midiHz(G3), -1);
    const g1 = hz(render(alone(1, slow), twoKeys).out, 6000, 9600);
    expect(Math.abs(12 * Math.log2(g1 / midiHz(G3)))).toBeGreaterThan(2);
  });
});

describe('Polivoks readouts', () => {
  it('gives the cutoff in hertz, the envelope times in seconds and the tuning in semitones', () => {
    expect(readout('vcf.cutoff', 3)).toBe('1.0 kHz');
    expect(readout('gen1.glide', 0)).toBe('off');
    expect(readout('gen.tune', 0)).toBe(readout('gen.tune', -0));
    expect(readout('mixer.gen1', 3)).toBe('50 %');
  });
});

describe('Polivoks faceplate', () => {
  it('tags the wordmark and the Formanta emblem as the maker’s marks, and nothing else', () => {
    const brand = polivoks.decor.filter((d) => d.brand);
    expect(brand.map((d) => d.t).sort()).toEqual(['circle', 'path', 'text']);
    expect(brand.some((d) => d.t === 'text' && d.text === 'ПОЛИВОКС')).toBe(true);
  });

  it('has an English reading for every Russian string the panel prints, and no other', () => {
    const cyrillic = /[А-Яа-яЁё]/;
    const printed = new Set<string>();
    for (const d of polivoks.decor)
      if (d.t === 'text' && cyrillic.test(d.text)) printed.add(d.text);
    for (const c of polivoks.controls) if (c.label && cyrillic.test(c.label)) printed.add(c.label);
    const english = polivoks.translation!.english;
    expect([...printed].filter((s) => !Object.hasOwn(english, s))).toEqual([]);
    expect(Object.keys(english).filter((s) => !printed.has(s))).toEqual([]);
    expect(polivoks.translation!.language).toBe('Russian');
  });
});
