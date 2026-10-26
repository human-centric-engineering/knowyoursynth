/**
 * Yamaha CS-80 definition tests: the panel → engine mapping (two channels on every note, the presets, the IL-AL-A-D-R
 * envelope, the shared levers), the readouts, the maker's mark and the areas.
 *
 * The CS-80 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/cs-80.ts
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
import cs80 from '@/lib/app/synths/defs/cs-80';
import { CS80_PRESETS, PANEL_COLS } from '@/lib/app/synths/defs/cs-80-presets';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams => cs80.toEngine({ ...cs80.init, ...set }, CTX);
const ch2 = (p: EngineParams): LayerParams => {
  if (!p.layer) throw new Error('no layer');
  return p.layer;
};
const routesTo = (r: EngineRoute[] | undefined, src: string, dst: string): EngineRoute[] =>
  (r ?? []).filter((x) => x.src === src && x.dst === dst);
const control = (id: string): Control => {
  const c = cs80.controls.find((x) => x.id === id);
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

describe('CS-80 toEngine at the init patch', () => {
  const p = run();

  it('plays eight notes of two channels each, channel I the voice and channel II the layer', () => {
    expect(p.poly).toEqual({ voices: 8, stack: 1, mono: false });
    expect(p.layer).toBeDefined();
    // MIX at the top: channel I at full, channel II silent
    expect(p.vca.gain).toBeCloseTo(level(8, 1.1), 10);
    expect(ch2(p).vca.gain).toBeCloseTo(0, 10);
  });

  it('sounds the sawtooth at 8′ into the filters, with the sine silent', () => {
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1, pulse: 0 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.osc[1]).toMatchObject({ level: 0, mix: { sine: 1 }, semi: 0 });
    expect(routesTo(p.routes, 'osc2', 'vcaIn')).toEqual([]);
    expect(p.noise.level).toBe(0);
  });

  it('opens the high-pass and sets the low-pass at 7, a 12 dB filter following the keys', () => {
    expect(p.hpf).toMatchObject({ cutoff: 20, envAmt: 0, envSrc: 'env1', kbd: 1, res: 0 });
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', envAmt: 0, kbd: 1 });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000), 6);
    expect(p.filter.res).toBeCloseTo(0.2 * 0.88, 10);
  });

  it('holds the VCA at S 10 with R 3, and every effect off', () => {
    expect(p.env2).toMatchObject({ a: 0.001, s: 1 });
    expect(p.env2.r).toBeCloseTo(0.01 * Math.pow(1000, 0.3), 10);
    expect(p.ringMod).toBeUndefined();
    expect(p.tremolo?.on).toBe(false);
    expect(p.glide).toEqual({ time: 0, legato: false, steps: false });
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });

  it('keeps the key timing pulse and the keyboard ends running, and routes nothing from them at 0', () => {
    expect(p.pulse).toEqual({ time: 0.25 });
    expect(p.keyEnds).toEqual({ mid: 66, span: 30 });
    const fromTouch = (p.routes ?? []).filter((r) => ['velp', 'kbdLo', 'kbdHi'].includes(r.src));
    expect(fromTouch).toEqual([]);
  });
});

describe('CS-80 TONE SELECTOR', () => {
  it('holds 22 presets of the manual’s charts, one value per panel control, eleven in each row', () => {
    expect(Object.keys(CS80_PRESETS)).toHaveLength(22);
    for (const [id, row] of Object.entries(CS80_PRESETS))
      expect(row, id).toHaveLength(PANEL_COLS.length);
    const rows = [1, 2].map((c) => {
      const t = control(`ch${c}.tone`);
      if (t.kind !== 'enum') throw new Error('tone is an enum');
      return t.options.map((o) => o.v);
    });
    for (const r of rows) {
      expect(r).toHaveLength(12);
      expect(r[11]).toBe('panel');
    }
    expect([...rows[0].slice(0, 11), ...rows[1].slice(0, 11)].sort()).toEqual(
      Object.keys(CS80_PRESETS).sort()
    );
  });

  it('plays a preset’s chart on its channel, whatever that channel’s sliders say', () => {
    // BRASS 1: sawtooth only, LPF 4, RES L 4.5, IL 7.5, AL 7.5, VCA A 5.5, D 10, S 10, LEVEL 10
    const p = run({ 'ch1.tone': 'brass1', 'ch1.lpf': 0, 'ch1.square': 'on', 'ch1.level': 0 });
    expect(p.osc[0].mix).toEqual({ saw: 1, pulse: 0 });
    expect(p.vca.gain).toBeCloseTo(level(10, 1.1), 10);
    expect(p.env2.s).toBe(1);
    expect(p.env2.a).toBeCloseTo(0.001 * Math.pow(1000, 0.55), 10);
    const il = -0.75 * 4,
      al = 0.75 * 4;
    expect(p.filter.envAmt).toBeCloseTo(al - il, 10);
    expect(p.filter.cutoff).toBeCloseTo(exp(0.4, 40, 16000) * Math.pow(2, il), 6);
  });

  it('gives each channel its own preset, and the layer its own settings', () => {
    const p = run({ 'ch1.tone': 'organ2', 'ch2.tone': 'bass', 'mix.mix': 5 });
    expect(p.osc[0].mix).toEqual({ saw: 0, pulse: 1 });
    expect(ch2(p).osc[0].mix).toEqual({ saw: 1, pulse: 1 });
    // BASS's PW 7: a 78 % pulse
    expect(ch2(p).osc[0].pw).toBeCloseTo(0.78, 10);
  });

  it('hears a channel’s sliders only with its PANEL button lit', () => {
    const preset = run({ 'ch1.tone': 'flute' });
    expect(run({ 'ch1.tone': 'flute', 'ch1.lpf': 0, 'ch1.noise': 10, 'ch1.sine': 10 })).toEqual(
      preset
    );
    expect(run({ 'ch1.lpf': 0 })).not.toEqual(run());
  });
});

describe('CS-80 VCO', () => {
  it('stacks FEET by organ footage, on each channel', () => {
    const semis = { '16': -12, '8': 0, '5.33': 7, '4': 12, '2.67': 19, '2': 24 };
    for (const [f, s] of Object.entries(semis)) {
      const p = run({ 'ch1.feet': f, 'ch2.feet': f });
      expect(p.osc[0].semi, f).toBe(s);
      expect(p.osc[1].semi, f).toBe(s);
      expect(ch2(p).osc[0].semi, f).toBe(s);
    }
  });

  it('detunes channel II alone by DETUNE CH II, a semitone at each end', () => {
    const p = run({ 'tune.detune': 5 });
    expect(ch2(p).osc[0].semi).toBe(1);
    expect(p.osc[0].semi).toBe(0);
    expect(ch2(run({ 'tune.detune': -2.5 })).osc[0].semi).toBe(-0.5);
  });

  it('tunes both channels by PITCH, the ring and the inner knob together', () => {
    const p = run({ 'tune.coarse': -3, 'tune.fine': 0.25 });
    expect(p.tune).toBe(-2.75);
    expect(ch2(p).tune).toBe(-2.75);
  });

  it('sets the square’s width from 50 % to 90 % by PW, and sweeps it by PWM at SPEED', () => {
    const p = run({ 'ch1.square': 'on', 'ch1.pw': 10, 'ch1.pwm': 5, 'ch1.speed': 10 });
    expect(p.osc[0].mix).toEqual({ saw: 1, pulse: 1 });
    expect(p.osc[0].pw).toBeCloseTo(0.9, 10);
    expect(routesTo(p.routes, 'lfo', 'pw1')).toEqual([{ src: 'lfo', dst: 'pw1', amt: 0.175 }]);
    expect(p.lfo.rate).toBeCloseTo(20, 10);
  });

  it('mixes NOISE into the filters', () => {
    expect(run({ 'ch1.noise': 10 }).noise).toEqual({ level: 0.5, color: 'white' });
  });

  it('sends the sine straight to the VCA, past the filters', () => {
    expect(routesTo(run({ 'ch1.sine': 10 }).routes, 'osc2', 'vcaIn')).toEqual([
      { src: 'osc2', dst: 'vcaIn', amt: 0.35 },
    ]);
  });
});

describe('CS-80 VCF and its IL-AL-A-D-R envelope', () => {
  it('starts IL below the set cutoffs, peaks AL above and sustains on them', () => {
    // IL 5 is −2 octaves, AL 10 is +4: the envelope spans 6, and sustain sits 2 of 6 up
    const p = run({ 'ch1.il': 5, 'ch1.al': 10, 'ch1.fa': 5, 'ch1.fd': 5, 'ch1.fr': 5 });
    expect(p.filter.envAmt).toBeCloseTo(6, 10);
    expect(p.hpf?.envAmt).toBeCloseTo(6, 10);
    expect(p.env1.s).toBeCloseTo(2 / 6, 10);
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000) / 4, 6);
    expect(p.env1.a).toBeCloseTo(0.001 * Math.pow(1000, 0.5), 10);
    expect(p.env1.d).toBeCloseTo(0.01 * Math.pow(1000, 0.5), 10);
  });

  it('with IL alone, rises to the set cutoffs and stays; with AL alone, peaks and falls back', () => {
    const il = run({ 'ch1.il': 10 });
    expect(il.env1.s).toBe(1);
    expect(il.filter.envAmt).toBeCloseTo(4, 10);
    const al = run({ 'ch1.al': 10 });
    expect(al.env1.s).toBe(0);
    expect(al.filter.envAmt).toBeCloseTo(4, 10);
    expect(al.filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000), 6);
  });

  it('moves both channels’ filters by BRILLIANCE and adds resonance by RESONANCE', () => {
    const p = run({ 'global.brilliance': 5, 'global.resonance': 10 });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000) * 8, 4);
    expect(ch2(p).filter.cutoff).toBeCloseTo(exp(0.7, 40, 16000) * 8, 4);
    expect(p.filter.res).toBeCloseTo(0.2 * 0.88 + 0.15, 10);
    expect(p.hpf?.res).toBeCloseTo(0.15, 10);
  });

  it('stops both filters’ resonance short of self-oscillation, whatever RESONANCE adds', () => {
    const p = run({ 'ch1.resL': 10, 'ch1.resH': 10, 'global.resonance': 10 });
    expect(p.filter.res).toBe(0.98);
    expect(p.hpf?.res).toBe(0.98);
  });

  it('turns the filtered sound down as the resonance rises, by VCF LEVEL', () => {
    const vcaIn = (p: EngineParams): [string, number] => {
      const n = p.normals?.vcaIn;
      if (!Array.isArray(n)) throw new Error('vcaIn is not scaled');
      return n;
    };
    expect(vcaIn(run({ 'ch1.resL': 0 }))).toEqual(['od', 1]);
    expect(vcaIn(run({ 'ch1.resL': 10 }))[1]).toBeCloseTo(1 / (1 + 1.4 * 0.88), 10);
    expect(vcaIn(run({ 'ch1.resL': 0, 'ch1.vcfLevel': 5 }))[1]).toBeCloseTo(0.5, 10);
  });
});

describe('CS-80 VCA, MIX and SUSTAIN', () => {
  it('blends the channels by MIX with equal power, both at 0.71 in the middle', () => {
    const p = run({ 'mix.mix': 5, 'ch2.level': 8 });
    expect(p.vca.gain).toBeCloseTo(level(8, 1.1) * Math.SQRT1_2, 10);
    expect(ch2(p).vca.gain).toBeCloseTo(level(8, 1.1) * Math.SQRT1_2, 10);
    const ii = run({ 'mix.mix': 10 });
    expect(ii.vca.gain).toBeCloseTo(0, 10);
  });

  it('maps ADSR times, and lets SUSTAIN lengthen the release', () => {
    const p = run({ 'ch1.a': 10, 'ch1.d': 10, 'ch1.s': 5, 'ch1.r': 0 });
    expect(p.env2.a).toBeCloseTo(1, 10);
    expect(p.env2.d).toBeCloseTo(10, 10);
    expect(p.env2.s).toBe(0.5);
    expect(p.env2.r).toBeCloseTo(0.01, 10);
    expect(run({ 'ch1.r': 0, 'sustain.time': 10 }).env2.r).toBeCloseTo(10, 10);
    expect(run({ 'ch1.r': 10, 'sustain.time': 2 }).env2.r).toBeCloseTo(10, 10);
  });
});

describe('CS-80 touch and keyboard control', () => {
  it('sends the key timing pulse to the filters and the level by INITIAL, and to the pitch by PITCHBEND', () => {
    const p = run({ 'ch1.initBrill': 10, 'ch1.initLevel': 5, 'touch.pitchbend': 10 });
    expect(routesTo(p.routes, 'velp', 'cutoff')).toEqual([{ src: 'velp', dst: 'cutoff', amt: 3 }]);
    expect(routesTo(p.routes, 'velp', 'cutoffHp')).toEqual([
      { src: 'velp', dst: 'cutoffHp', amt: 3 },
    ]);
    expect(routesTo(p.routes, 'velp', 'amp')).toEqual([
      { src: 'velp', dst: 'amp', amt: 0.5, by: 'env2' },
    ]);
    expect(routesTo(p.routes, 'velp', 'pitchAll')).toEqual([
      { src: 'velp', dst: 'pitchAll', amt: -7 },
    ]);
    // PITCHBEND is shared, so channel II bends too
    expect(routesTo(ch2(p).routes, 'velp', 'pitchAll')).toHaveLength(1);
  });

  it('brightens or dulls, and raises or lowers, each end of the keyboard', () => {
    const p = run({
      'kbd.brillLow': -5,
      'kbd.brillHigh': 5,
      'kbd.levelLow': 5,
      'kbd.levelHigh': -5,
    });
    expect(routesTo(p.routes, 'kbdLo', 'cutoff')[0].amt).toBeCloseTo(-3, 10);
    expect(routesTo(p.routes, 'kbdHi', 'cutoffHp')[0].amt).toBeCloseTo(3, 10);
    expect(routesTo(p.routes, 'kbdLo', 'amp')).toEqual([
      { src: 'kbdLo', dst: 'amp', amt: 0.8, by: 'env2' },
    ]);
    expect(routesTo(p.routes, 'kbdHi', 'amp')).toEqual([
      { src: 'kbdHi', dst: 'amp', amt: -0.8, by: 'env2' },
    ]);
  });
});

describe('CS-80 sub oscillator, ring modulator and tremolo', () => {
  it('moves pitch, filters and level by the sub oscillator’s wave at its SPEED', () => {
    const p = run({
      'sub.function': 'square',
      'sub.speed': 10,
      'sub.vco': 5,
      'sub.vcf': 10,
      'sub.vca': 10,
    });
    expect(p.lfo2).toEqual({ rate: 80, mix: { sq: 1 }, keySync: false });
    expect(routesTo(p.routes, 'lfo2', 'pitchAll')[0].amt).toBeCloseTo(3, 10);
    expect(routesTo(p.routes, 'lfo2', 'cutoff')[0].amt).toBeCloseTo(4, 10);
    expect(routesTo(p.routes, 'lfo2', 'amp')).toEqual([
      { src: 'lfo2', dst: 'amp', amt: 0.5, by: 'env2' },
    ]);
  });

  it('uses the noise itself for NOISE, and nothing for EXT', () => {
    const noise = run({ 'sub.function': 'noise', 'sub.vco': 10 });
    expect(routesTo(noise.routes, 'noise', 'pitchAll')[0].amt).toBeCloseTo(3.6, 10);
    expect(routesTo(noise.routes, 'lfo2', 'pitchAll')).toEqual([]);
    const ext = run({ 'sub.function': 'ext', 'sub.vco': 10, 'sub.vcf': 10, 'sub.vca': 10 });
    expect((ext.routes ?? []).filter((r) => r.src === 'lfo2' || r.src === 'noise')).toEqual([]);
  });

  it('ring-modulates the sum by MODULATION, with ATTACK, DECAY and DEPTH on its speed', () => {
    expect(run({ 'ring.mod': 0 }).ringMod).toBeUndefined();
    const p = run({
      'ring.mod': 10,
      'ring.speed': 10,
      'ring.attack': 0,
      'ring.decay': 10,
      'ring.depth': 10,
    });
    expect(p.ringMod).toEqual({ hz: 1500, depth: 1, env: { a: 0.005, d: 4, amt: 5 } });
  });

  it('runs the tremolo only with ON and a range, slow for CHORUS and faster for TREMOLO', () => {
    expect(run({ 'trem.on': 'on' }).tremolo?.on).toBe(false);
    const chorus = run({
      'trem.on': 'on',
      'trem.chorus': 'on',
      'trem.speed': 10,
      'trem.depth': 10,
    });
    expect(chorus.tremolo).toEqual({ on: true, rate: 5, depth: 1 });
    const trem = run({ 'trem.on': 'on', 'trem.tremolo': 'on', 'trem.speed': 0 });
    expect(trem.tremolo).toMatchObject({ on: true, rate: 5 });
    expect(
      run({ 'trem.on': 'on', 'trem.tremolo': 'on', 'trem.speed': 10 }).tremolo?.rate
    ).toBeCloseTo(20, 10);
    expect(run({ 'trem.tremolo': 'on' }).tremolo?.on).toBe(false);
  });

  it('glides by PORTAMENTO, in semitone steps for GLISSANDO', () => {
    expect(run({ 'porta.time': 10 }).glide).toEqual({ time: 2, legato: false, steps: false });
    expect(run({ 'porta.time': 5, 'porta.mode': 'gliss' }).glide).toEqual({
      time: 0.5,
      legato: false,
      steps: true,
    });
  });
});

describe('CS-80 controls that are not modelled', () => {
  it('ignores them: AFTER touch, the pressure levers, the pedal selector, the foot switches and SUSTAIN II', () => {
    const base = run();
    const modes = cs80.controls.filter((c) => c.ui);
    expect(modes.map((c) => c.id).sort()).toEqual(
      [
        'ch1.afterBrill',
        'ch1.afterLevel',
        'ch2.afterBrill',
        'ch2.afterLevel',
        'touch.speed',
        'touch.vco',
        'touch.vcf',
        'pedal.select',
        'sustain.fs',
        'sustain.mode',
        'porta.fs',
      ].sort()
    );
    const flipped: ControlValues = {};
    for (const c of modes)
      flipped[c.id] =
        c.kind === 'bool' ? true : c.kind === 'cont' ? c.max : c.options[c.options.length - 1].v;
    expect(run(flipped)).toEqual(base);
  });
});

describe('CS-80 readouts', () => {
  it('reads the envelope times, the filters, IL and AL, MIX and the tremolo in words and units', () => {
    expect(readout('ch1.a', 0)).toMatch(/1 ?ms/);
    expect(readout('ch1.r', 10)).toMatch(/10 ?s/);
    expect(readout('ch1.lpf', 10)).toMatch(/16 ?kHz/);
    expect(readout('ch1.il', 10)).toBe('−5.0');
    expect(readout('ch1.al', 4)).toBe('+2.0');
    expect(readout('ch1.pw', 10)).toBe('90 %');
    expect(readout('mix.mix', 0)).toBe('I only');
    expect(readout('mix.mix', 5)).toBe('I 50 : II 50');
    expect(readout('mix.mix', 10)).toBe('II only');
    expect(readout('tune.detune', 5)).toMatch(/\+1/);
    expect(readout('sustain.time', 0)).toBe('off');
  });
});

describe('CS-80 panel', () => {
  it('tags the YAMAHA wordmark as brand, and nothing else', () => {
    const brand = cs80.decor.filter((d) => d.brand);
    expect(brand.map((d) => (d.t === 'text' ? d.text : d.t))).toEqual(['YAMAHA']);
    const unbranded = cs80.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /yamaha/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('has its levers do most pulled down, and its panel sliders at the top', () => {
    const lever = control('sub.vco');
    const slider = control('ch1.lpf');
    if (lever.type !== 'fader' || slider.type !== 'fader') throw new Error('faders');
    expect(lever.maxAt).toBe('bottom');
    expect(slider.maxAt).toBeUndefined();
  });

  it('puts every control in exactly one area, inside the view', () => {
    expect(cs80.controls.length).toBeGreaterThan(90);
    for (const p of cs80.controls) {
      const at = cs80.areas.filter((a) =>
        a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        p.id
      ).toHaveLength(1);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(cs80.view.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(cs80.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of cs80.controls) expect(cs80.init[c.id], c.id).toBe(c.def);
  });
});
