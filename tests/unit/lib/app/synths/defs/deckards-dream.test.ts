/**
 * Deckard's Dream definition tests: the panel → engine mapping (two layers on every note, the IL-AL-A-D-R envelope with
 * the high-pass moving the other way, velocity, the shared sliders, every switch), the readouts, the maker's mark and
 * the areas.
 *
 * The Deckard's Dream has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/deckards-dream.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineParams,
  EngineRoute,
  LayerParams,
  TextDecor,
} from '@/lib/app/synths/contract';
import dd from '@/lib/app/synths/defs/deckards-dream';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams => dd.toEngine({ ...dd.init, ...set }, CTX);
const l2 = (p: EngineParams): LayerParams => {
  if (!p.layer) throw new Error('no layer');
  return p.layer;
};
const routesTo = (r: EngineRoute[] | undefined, src: string, dst: string): EngineRoute[] =>
  (r ?? []).filter((x) => x.src === src && x.dst === dst);
const control = (id: string): Control => {
  const c = dd.controls.find((x) => x.id === id);
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

describe('Deckard’s Dream toEngine at the init patch (the Default Saw)', () => {
  const p = run();

  it('plays eight notes of two layers each, layer I the voice and layer II the layer', () => {
    expect(p.poly).toEqual({ voices: 8, stack: 1, mono: false });
    // MIX at the top: layer I at full, layer II silent
    expect(p.vca.gain).toBeCloseTo(level(8, 1.1), 10);
    expect(l2(p).vca.gain).toBeCloseTo(0, 10);
  });

  it('sounds the sawtooth at 8′ through open filters, with no resonance and the sine silent', () => {
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1, pulse: 0 }, pw: 0.5, semi: 0, kbd: true });
    expect(routesTo(p.routes, 'osc2', 'vcaIn')).toEqual([]);
    expect(p.hpf).toMatchObject({ cutoff: 20, res: 0, kbd: 1 });
    expect(p.hpf?.envAmt).toBeCloseTo(0, 10);
    expect(p.filter).toMatchObject({ cutoff: 16000, envAmt: 0, res: 0, mode: 'lp' });
    expect(p.noise.level).toBe(0);
  });

  it('gates the VCA (A 0, S 10, a short R), with no glide and no modulation', () => {
    expect(p.env2).toMatchObject({ a: 0.001, s: 1 });
    expect(p.env2.r).toBeCloseTo(0.01 * Math.pow(1500, 0.2), 10);
    expect(p.glide).toEqual({ time: 0, legato: false, steps: false });
    expect(p.routes).toEqual([]);
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });

  it('has no ring modulator or tremolo, which the CS-80 has and it does not', () => {
    expect(p.ringMod).toBeUndefined();
    expect(p.tremolo).toBeUndefined();
  });
});

describe('Deckard’s Dream VCO and switches', () => {
  it('switches the square and the sawtooth on each layer', () => {
    const p = run({ 'ch1.square': 'on', 'ch1.saw': 'off', 'ch2.square': 'on' });
    expect(p.osc[0].mix).toEqual({ saw: 0, pulse: 1 });
    expect(l2(p).osc[0].mix).toEqual({ saw: 1, pulse: 1 });
  });

  it('stacks FEET by organ footage, on each layer', () => {
    const semis = { '16': -12, '8': 0, '5.33': 7, '4': 12, '2.67': 19, '2': 24 };
    for (const [f, s] of Object.entries(semis)) {
      const p = run({ 'ch1.feet': f, 'ch2.feet': f });
      expect(p.osc[0].semi, f).toBe(s);
      expect(p.osc[1].semi, f).toBe(s);
      expect(l2(p).osc[0].semi, f).toBe(s);
    }
  });

  it('detunes layer II alone by DETUNE CH II, and tunes both by COARSE and FINE', () => {
    const p = run({ 'tune.detune': 5, 'tune.coarse': -3, 'tune.fine': 0.5 });
    expect(l2(p).osc[0].semi).toBe(1);
    expect(p.osc[0].semi).toBe(0);
    expect(p.tune).toBe(-2.5);
    expect(l2(p).tune).toBe(-2.5);
  });

  it('sets PW from 50 % to 90 %, and sweeps it by PWM at SPEED, 0.7 to 70 Hz', () => {
    const p = run({ 'ch1.square': 'on', 'ch1.pw': 10, 'ch1.pwm': 5, 'ch1.speed': 10 });
    expect(p.osc[0].pw).toBeCloseTo(0.9, 10);
    expect(routesTo(p.routes, 'lfo', 'pw1')).toEqual([{ src: 'lfo', dst: 'pw1', amt: 0.175 }]);
    expect(p.lfo.rate).toBeCloseTo(70, 10);
    expect(run().lfo.rate).toBeCloseTo(0.7, 10);
  });

  it('sends the sine straight to the VCA, past the filters', () => {
    expect(routesTo(run({ 'ch1.sine': 10 }).routes, 'osc2', 'vcaIn')).toEqual([
      { src: 'osc2', dst: 'vcaIn', amt: 0.35 },
    ]);
  });
});

describe('Deckard’s Dream VCF and its IL-AL-A-D-R envelope', () => {
  it('starts IL thinner, peaks AL fuller and sustains on the set cutoffs, the high-pass moving the other way', () => {
    // IL 5 is −2 octaves, AL 10 is +4: the envelope spans 6, and sustain sits 2 of 6 up
    const p = run({ 'ch1.lpf': 7, 'ch1.hpf': 3, 'ch1.il': 5, 'ch1.al': 10 });
    expect(p.filter.envAmt).toBeCloseTo(6, 10);
    expect(p.hpf?.envAmt).toBeCloseTo(-6, 10);
    expect(p.env1.s).toBeCloseTo(2 / 6, 10);
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000) / 4, 6);
    expect(p.hpf?.cutoff).toBeCloseTo(exp(0.3, 20, 6000) * 4, 6);
  });

  it('times the filter envelope 1 ms–1 s attack and 10 ms–15 s decay and release', () => {
    const p = run({ 'ch1.fa': 10, 'ch1.fd': 10, 'ch1.fr': 10 });
    expect(p.env1.a).toBeCloseTo(1, 10);
    expect(p.env1.d).toBeCloseTo(15, 10);
    expect(p.env1.r).toBeCloseTo(15, 10);
  });

  it('keeps both resonances short of self-oscillation, RESO. adding to both', () => {
    const p = run({ 'ch1.resH': 10, 'ch1.resL': 10, 'global.resonance': 10 });
    expect(p.filter.res).toBeCloseTo(0.98, 10);
    expect(p.hpf?.res).toBeCloseTo(0.98, 10);
  });

  it('opens the band of both layers by BRIL., the low-pass up and the high-pass down', () => {
    const p = run({ 'global.brilliance': 5 });
    expect(p.filter.cutoff).toBeCloseTo(16000 * Math.pow(2, 3), 4);
    expect(l2(p).hpf?.cutoff).toBeCloseTo(20 * Math.pow(2, -3), 6);
  });
});

describe('Deckard’s Dream touch response', () => {
  it('opens the filters and raises the level by velocity, for the whole note', () => {
    const p = run({ 'ch1.initBrill': 10, 'ch1.initLevel': 5 });
    expect(routesTo(p.routes, 'vel', 'cutoff')).toEqual([{ src: 'vel', dst: 'cutoff', amt: 3 }]);
    // the band opens from both sides: the high-pass goes down as the low-pass goes up
    expect(routesTo(p.routes, 'vel', 'cutoffHp')).toEqual([
      { src: 'vel', dst: 'cutoffHp', amt: -3 },
    ]);
    expect(routesTo(p.routes, 'vel', 'amp')).toEqual([
      { src: 'vel', dst: 'amp', amt: 0.5, by: 'env2' },
    ]);
  });

  it('bends a hard note up from a semitone flat by P.BEND, on the velocity pulse', () => {
    const p = run({ 'touch.pitchbend': 10 });
    expect(routesTo(p.routes, 'velp', 'pitchAll')).toEqual([
      { src: 'velp', dst: 'pitchAll', amt: -1 },
    ]);
    expect(p.pulse).toEqual({ time: 0.25 });
  });

  it('speeds the sub oscillator by velocity with TOUCH SPEED, but not on RND', () => {
    expect(routesTo(run({ 'touch.speed': 10 }).routes, 'vel', 'lfo2Rate')).toEqual([
      { src: 'vel', dst: 'lfo2Rate', amt: 2 },
    ]);
    expect(
      routesTo(run({ 'touch.speed': 10, 'sub.function': 'rnd' }).routes, 'vel', 'lfo2Rate')
    ).toEqual([]);
  });

  it('leaves the aftertouch sliders out of the sound', () => {
    for (const id of ['ch1.afterBrill', 'ch1.afterLevel', 'touch.vco', 'touch.vcf']) {
      expect(control(id).ui, id).toBe(true);
      expect(run({ [id]: 10 }), id).toEqual(run());
    }
  });
});

describe('Deckard’s Dream sub oscillator', () => {
  it('takes each FUNCTION as its wave, at 0.7 to 25 Hz', () => {
    const waves: Record<string, object> = {
      sine: { sine: 1 },
      saw: { saw: 1 },
      rsaw: { rsaw: 1 },
      square: { sq: 1 },
      sh: { sh: 1 },
    };
    for (const [f, mix] of Object.entries(waves))
      expect(run({ 'sub.function': f }).lfo2?.mix, f).toEqual(mix);
    expect(run({ 'sub.speed': 0 }).lfo2?.rate).toBeCloseTo(0.7, 10);
    expect(run({ 'sub.speed': 10 }).lfo2?.rate).toBeCloseTo(25, 10);
  });

  it('sends the sub oscillator to pitch, filters and level of both layers', () => {
    const p = run({ 'sub.vco': 5, 'sub.vcf': 10, 'sub.vca': 10 });
    for (const x of [p, l2(p)]) {
      expect(routesTo(x.routes, 'lfo2', 'pitchAll')).toEqual([
        { src: 'lfo2', dst: 'pitchAll', amt: 3 },
      ]);
      expect(routesTo(x.routes, 'lfo2', 'cutoff')[0].amt).toBe(4);
      expect(routesTo(x.routes, 'lfo2', 'amp')).toEqual([
        { src: 'lfo2', dst: 'amp', amt: 0.5, by: 'env2' },
      ]);
    }
  });

  it('on RND moves things with the noise generator instead', () => {
    const p = run({ 'sub.function': 'rnd', 'sub.vcf': 10 });
    expect(routesTo(p.routes, 'noise', 'cutoff')[0].amt).toBeCloseTo(1.2, 10);
    expect(routesTo(p.routes, 'lfo2', 'cutoff')).toEqual([]);
  });
});

describe('Deckard’s Dream mix, glide and sustain', () => {
  it('crossfades the layers equally at the centre and gives layer II alone at the bottom', () => {
    const mid = run({ 'mix.mix': 5 });
    expect(mid.vca.gain).toBeCloseTo(l2(mid).vca.gain ?? NaN, 10);
    expect(run({ 'mix.mix': 10 }).vca.gain).toBeCloseTo(0, 10);
  });

  it('glides on P, steps on G, and not at all with the switch at its centre', () => {
    expect(run({ 'porta.mode': 'porta', 'porta.time': 10 }).glide).toEqual({
      time: 4,
      legato: false,
      steps: false,
    });
    expect(run({ 'porta.mode': 'gliss', 'porta.time': 5 }).glide).toEqual({
      time: 1,
      legato: false,
      steps: true,
    });
    expect(run({ 'porta.mode': 'off', 'porta.time': 10 }).glide.time).toBe(0);
  });

  it('lengthens both layers’ releases by SUSTAIN, up to 15 s, never shortening them', () => {
    const p = run({ 'sustain.time': 10, 'mix.mix': 5 });
    expect(p.env2.r).toBeCloseTo(15, 10);
    expect(p.env1.r).toBeCloseTo(15, 10);
    expect(l2(p).env2.r).toBeCloseTo(15, 10);
    expect(run({ 'sustain.time': 1, 'ch1.r': 10 }).env2.r).toBeCloseTo(15, 10);
  });

  it('prints SUSTAIN II only', () => {
    expect(control('sustain.mode').ui).toBe(true);
    expect(run({ 'sustain.mode': 'II' })).toEqual(run());
  });

  it('tilts brightness and level across the keys by KEYBOARD CONTROL', () => {
    const p = run({ 'kbd.brillLow': 5, 'kbd.levelHigh': -5 });
    expect(routesTo(p.routes, 'kbdLo', 'cutoff')[0].amt).toBeCloseTo(3, 10);
    expect(routesTo(p.routes, 'kbdLo', 'cutoffHp')[0].amt).toBeCloseTo(-3, 10);
    expect(routesTo(p.routes, 'kbdHi', 'amp')[0].amt).toBeCloseTo(-0.8, 10);
    expect(p.keyEnds).toEqual({ mid: 66, span: 30 });
  });
});

describe('Deckard’s Dream panel', () => {
  it('reads out times, rates and the mix in the hardware’s units', () => {
    expect(readout('ch1.a', 10)).toBe('1.0 s');
    expect(readout('sub.speed', 10)).toBe('25 Hz');
    expect(readout('mix.mix', 0)).toBe('I only');
    expect(readout('mix.mix', 10)).toBe('II only');
    expect(readout('porta.time', 0)).toBe('off');
  });

  it('tags every maker’s mark as a brand', () => {
    const marks = dd.decor.filter(
      (d): d is TextDecor => d.t === 'text' && /DECKARD|BLACK CORPORATION|8-VOICE/.test(d.text)
    );
    expect(marks).toHaveLength(3);
    for (const m of marks) expect(m.brand, m.text).toBe(true);
  });

  it('has an area over every control it draws', () => {
    const inside = (c: Control) =>
      dd.areas.some((a) =>
        a.rects.some((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h)
      );
    for (const c of dd.controls) expect(inside(c), c.id).toBe(true);
  });
});
