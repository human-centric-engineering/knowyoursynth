/**
 * Elta Music SOLAR 42N definition tests: the panel → engine mapping at the init patch and for each switch, the
 * cartridge programs, the jacks' scaling, and the maker's marks.
 *
 * The SOLAR 42N has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/solar-42n.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  ControlValues,
  EngineContext,
  InputJack,
  OutputJack,
  SolarDrone,
  SolarParams,
  SolarSrapa,
  SolarVco,
  TextDecor,
} from '@/lib/app/synths/contract';
import solar from '@/lib/app/synths/defs/solar-42n';
import { cablesToEngine } from '@/lib/app/synths/lib/patch';

const CTX: EngineContext = { wheel: 0, patched: {} };
const values = (set: ControlValues = {}): ControlValues => ({ ...solar.init, ...set });
const sol = (set: ControlValues = {}): SolarParams => {
  const s = solar.toEngine(values(set), CTX).solar;
  if (!s) throw new Error('no solar path');
  return s;
};
const drone = (set: ControlValues, i: number): SolarDrone => {
  const v = sol(set).voices[i];
  if (v.kind !== 'drone') throw new Error(`voice ${i} is ${v.kind}`);
  return v;
};
const srapa = (set: ControlValues, i: number): SolarSrapa => {
  const v = sol(set).voices[i];
  if (v.kind !== 'srapa') throw new Error(`voice ${i} is ${v.kind}`);
  return v;
};
const vco = (set: ControlValues, i: number): SolarVco => {
  const v = sol(set).voices[i];
  if (v.kind !== 'vco') throw new Error(`voice ${i} is ${v.kind}`);
  return v;
};
const input = (id: string): InputJack => {
  const j = solar.jacks.find((x) => x.id === id);
  if (!j || j.dir !== 'in') throw new Error(`no input ${id}`);
  return j;
};
const output = (id: string): OutputJack => {
  const j = solar.jacks.find((x) => x.id === id);
  if (!j || j.dir !== 'out') throw new Error(`no output ${id}`);
  return j;
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);

describe('SOLAR 42N toEngine at the init patch', () => {
  const p = solar.toEngine(solar.init, CTX);
  const s = sol();

  it('runs the Solar path with its eight voices in mixer order', () => {
    expect(s.voices.map((v) => v.kind)).toEqual([
      'drone',
      'drone',
      'srapa',
      'vco',
      'vco',
      'drone',
      'drone',
      'srapa',
    ]);
    expect(p.osc).toEqual([]);
  });

  it('leaves every drone shut and every generator in, at the middle of its range', () => {
    for (const i of [0, 1, 5, 6]) {
      const d = drone({}, i);
      expect(d.gate).toBe(false);
      expect(d.env.hold).toBe(false);
      expect(d.volt).toBe(0);
      expect(d.gens.map((g) => g.on)).toEqual([true, true, true, true, true]);
      expect(d.gens.map((g) => g.mod)).toEqual([false, false, false, false, false]);
      expect(d.gens.map((g) => g.note)).toEqual([27.5, 45, 60.5, 74, 88.5]);
    }
    expect(srapa({}, 2).gate).toBe(false);
    expect(srapa({}, 7).gate).toBe(false);
  });

  it('plays VCO A alone on the keyboard: a saw at its pitch, VCO B silent', () => {
    const a = vco({}, 3);
    expect(a).toMatchObject({ wave: 'saw', sub: false, fm: 0, shape: 0.5, gate: false });
    expect(a.semi).toBeCloseTo(0, 10);
    expect(a.level).toBeCloseTo(0.8 * 0.49, 10);
    expect(vco({}, 4).level).toBe(0);
    // split at F♯4, the seventh plate, so each half has six; the encoder’s portamento off
    expect(s.keys).toEqual({ mode: 'single', split: 66, glide: 0 });
  });

  it('opens the filters as low-pass, with no distortion heard, and loads no cartridge', () => {
    expect(s.vcf.l).toMatchObject({ mode: 'lp', drive: 0.25 });
    expect(s.vcf.l.cutoff).toBeCloseTo(exp(0.7, 40, 16000), 6);
    expect(s.vcf.l.res).toBeCloseTo(0.196, 10);
    expect(s.vcf.link).toBe(false);
    expect(s.vcf.dist).toEqual({ mix: 0, gain: 0.5 });
    expect(s.fx.l).toEqual({ alg: null, p: {} });
    expect(s.fx.r).toEqual({ alg: null, p: {} });
    expect(s.fx.xyz).toEqual([]);
    expect(s.master).toBeCloseTo(0.7, 10);
  });

  it('turns the preamp off at the bottom of GAIN, and follows it with the envelope follower', () => {
    expect(p.preamp).toEqual({ gain: 0 });
    expect(p.normals).toEqual({ envfIn: 'preamp' });
  });
});

describe('SOLAR 42N switches', () => {
  it('opens a drone from its DRONE VOICES button and keeps it open with HOLD', () => {
    expect(drone({ 'gate.d1': true }, 0).gate).toBe(true);
    expect(drone({ 'gate.d4': true }, 5).gate).toBe(true);
    expect(srapa({ 'gate.d6': true }, 7).gate).toBe(true);
    expect(drone({ 'd5.hold': true }, 6).env.hold).toBe(true);
  });

  it('mutes a generator and lets MOD bend it', () => {
    const d = drone({ 'd2.on3': false, 'd2.mod5': true }, 1);
    expect(d.gens[2].on).toBe(false);
    expect(d.gens[4].mod).toBe(true);
  });

  it('shines light on each eye from its photosensor control, dark at init', () => {
    expect(drone({}, 5).light).toBe(0);
    expect(drone({ 'd4.light': 6 }, 5).light).toBeCloseTo(0.6);
    // the dome is drawn as a `solar-eye` knob that the meters light by its voice
    const eye = solar.controls.find((c) => c.id === 'd4.light');
    expect(eye && eye.type === 'knob' && [eye.style, eye.eye]).toEqual(['solar-eye', 5]);
  });

  it('tunes each generator over its range and VOLT over the whole travel', () => {
    const d = drone({ 'd1.tune1': 0, 'd1.tune5': 10, 'd1.volt': 8 }, 0);
    expect(d.gens[0].note).toBe(12);
    expect(d.gens[4].note).toBe(98);
    expect(d.volt).toBeCloseTo(0.8, 10);
  });

  it('switches a Papa Srapa voice’s FM, AM, rate range and pitch range', () => {
    const q = srapa({ 'd3.fm': true, 'd3.am': true, 'd3.x10': true, 'd3.hi': true }, 2);
    expect(q.fm).toBe(true);
    expect(q.am).toBe(true);
    expect(q.rate).toBeCloseTo(exp(0.4, 0.1, 10) * 10, 6);
    expect(q.note).toBe(48 + 26);
    expect(srapa({}, 2).note).toBe(12 + 26);
    // MOD 3 and DIVIDER 0: 4 × 0.3 octaves; DIVIDER 10 divides it by 4
    expect(srapa({}, 2).dev).toBeCloseTo(1.2, 10);
    expect(srapa({ 'd3.div': 10 }, 2).dev).toBeCloseTo(0.3, 10);
  });

  it('drops a VCO three octaves at LOW, adds the sub, and picks each wave', () => {
    expect(vco({ 'va.oct': 'low' }, 3).semi).toBeCloseTo(-36, 10);
    expect(vco({ 'vb.sub': 'on' }, 4).sub).toBe(true);
    for (const w of ['sine', 'tri', 'saw', 'square', 'sawInv', 'sineTri'])
      expect(vco({ 'va.wave': w }, 3).wave).toBe(w);
  });

  it('moves both VCOs an octave with the keyboard’s octave buttons', () => {
    expect(vco({ 'keys.up': true }, 3).semi).toBeCloseTo(12, 10);
    expect(vco({ 'keys.down': true }, 4).semi).toBeCloseTo(-12, 10);
    expect(vco({ 'keys.up': true, 'keys.down': true }, 3).semi).toBeCloseTo(0, 10);
  });

  it('loops a VCO envelope and holds it open', () => {
    expect(vco({}, 3).env.mode).toBe('adsr');
    expect(vco({ 'ea.loop': true }, 3).env.mode).toBe('loop');
    expect(vco({ 'eb.hold': true }, 4).env.hold).toBe(true);
  });

  it('splits the keyboard', () => {
    expect(sol({ 'keys.mode': 'split' }).keys.mode).toBe('split');
  });

  it('glides the keyboard by the encoder’s portamento, off at the bottom', () => {
    expect(sol({ 'kb.glide': 0 }).keys.glide).toBe(0);
    expect(sol({ 'kb.glide': 5 }).keys.glide).toBeCloseTo(Math.sqrt(0.01 * 2), 6);
    expect(sol({ 'kb.glide': 10 }).keys.glide).toBeCloseTo(2, 6);
  });

  it('gives each touch plate its note, C4 to B4, holding no value and leaving the sound alone', () => {
    const plates = solar.controls.filter((c) => c.type === 'button' && c.note != null);
    expect(plates.map((c) => (c.type === 'button' ? c.note : null))).toEqual(
      Array.from({ length: 12 }, (_, k) => 60 + k)
    );
    expect(plates.every((c) => c.ui)).toBe(true);
    expect(solar.toEngine(values({ 'kb.plate1': true }), CTX)).toEqual(
      solar.toEngine(values(), CTX)
    );
  });

  it('explains the triangles and the sun, which have nothing to turn', () => {
    expect(solar.marks?.map((m) => m.id)).toEqual(['kb.triangle1', 'kb.triangle2', 'kb.sun']);
  });

  it('switches each filter side to band-pass and links them', () => {
    const s = sol({ 'vcf.rmode': 'bp', 'vcf.link': true });
    expect(s.vcf.l.mode).toBe('lp');
    expect(s.vcf.r.mode).toBe('bp');
    expect(s.vcf.link).toBe(true);
  });

  it('sets the distortion after the filters from DIST and GAIN', () => {
    expect(sol({ 'vcf.dist': 10, 'vcf.gain': 2 }).vcf.dist).toEqual({ mix: 1, gain: 0.2 });
  });

  it('multiplies each LFO’s rate with its speed switch, and runs the wave from triangle to square', () => {
    const s = sol({ 'lfoa.speed': 'x6', 'lfob.speed': 'x10', 'lfob.wave': 10 });
    expect(s.lfo.a.hz).toBeCloseTo(exp(0.4, 0.02, 2) * 6, 6);
    expect(s.lfo.b.hz).toBeCloseTo(exp(0.4, 0.2, 20) * 10, 6);
    expect(s.lfo.a.wave).toBe(1);
    expect(s.lfo.b.wave).toBe(0);
  });

  it('runs the sequencer on its stages and gate switches', () => {
    const s = sol({ 'seq.stages': '3', 'seq.g2': false, 'seq.s2': 3, 'seq.s5': 10 });
    expect(s.seq.stages).toBe(3);
    expect(s.seq.gates).toEqual([true, false, true, true, true]);
    expect(s.seq.levels[1]).toBeCloseTo(0.3, 10);
    expect(s.seq.levels[4]).toBe(1);
  });

  it('starts the sequencer on a minor figure in semitones, not octaves apart', () => {
    // a level of 1 is 5 V at the cv out, 60 semitones at 1v/oct
    const semis = sol().seq.levels.map((l) => Math.round(l * 60));
    expect(semis).toEqual([0, 3, 7, 5, 10]);
  });

  it('adds each joystick offset to its axis, 5 V either side', () => {
    const p = solar.toEngine(values({ 'joy.x': 1, 'joy.ox': -5, 'joy.y': -0.5, 'joy.oy': 2 }), CTX);
    expect(p.joy).toEqual([0, -0.5]);
  });

  it('turns the preamp up to 40 dB', () => {
    expect(solar.toEngine(values({ 'pre.gain': 10 }), CTX).preamp).toEqual({ gain: 100 });
  });
});

describe('SOLAR 42N cartridges', () => {
  it('loads each side’s program from its own cartridge', () => {
    const s = sol({ 'fx.cartL': 'cathedral', 'fx.cartR': 'time', 'fx.progR': '2' });
    expect(s.fx.l.alg).toBe('hallrev');
    expect(s.fx.r.alg).toBe('moddlyrev');
    expect(s.fx.l.p).toMatchObject({ MIX: 100, SIZ: 140 });
  });

  it('turns the left program’s parameters with X, Y and Z, and leaves an unmodelled knob out', () => {
    const xyz = sol({ 'fx.cartL': 'cathedral', 'fx.x': 2, 'fx.z': 10 }).fx.xyz;
    expect(xyz).toEqual([{ side: 'l', k: 2, ref: 'DCY', lo: 0.6, hi: 4.9, v: 1 }]);
  });

  it('turns the right program’s parameters on the right when the left side is empty', () => {
    const xyz = sol({ 'fx.cartR': 'magic', 'fx.progR': '3' }).fx.xyz;
    expect(xyz.map((k) => [k.side, k.k, k.ref])).toEqual([
      ['r', 0, 'FB1'],
      ['r', 1, 'DL1'],
      ['r', 2, 'SM1'],
    ]);
  });

  it('gives each side its own program’s parameters when the two programs differ', () => {
    const xyz = sol({
      'fx.cartL': 'cathedral',
      'fx.cartR': 'magic',
      'fx.progR': '3',
      'fx.z': 10,
    }).fx.xyz;
    expect(xyz.filter((k) => k.side === 'l').map((k) => k.ref)).toEqual(['DCY']);
    expect(xyz.filter((k) => k.side === 'r').map((k) => k.ref)).toEqual(['FB1', 'DL1', 'SM1']);
    expect(xyz.find((k) => k.side === 'r' && k.k === 2)?.v).toBe(1);
  });
});

describe('SOLAR 42N jacks', () => {
  it('scales the classic drone CV jack by its CV knob into the photosensor', () => {
    const j = input('d1.cvin');
    expect(j.dest).toBe('solPh1');
    const amt = j.amt;
    if (typeof amt !== 'function') throw new Error('amt is not a function of the panel');
    expect(amt(values({ 'd1.cv': 10 }))).toBeCloseTo(0.1, 10);
  });

  it('gives each drone its own voice’s gate and envelope', () => {
    expect(input('d4.gate').dest).toBe('solG6');
    expect(output('d6.env').signal).toBe('solEnv8');
    expect(input('ea.gate').dest).toBe('solG4');
    expect(output('vb.out').signal).toBe('sol5');
  });

  it('plays a VCO a semitone per twelfth of a volt from the sequencer', () => {
    const [c] = cablesToEngine(solar, [{ from: 'seq.cv', to: 'va.voct' }], values());
    expect(c).toMatchObject({ src: 'solSeqCv', dst: 'solP4', amt: 60 });
  });

  it('sends CV L and CV R to their own sides, with MOD L and MOD R as the engine depths', () => {
    const v = values({ 'vcf.lmod': 7, 'vcf.rmod': 3 });
    const [l] = cablesToEngine(solar, [{ from: 'lfoa.out', to: 'vcf.cvl' }], v);
    const [r] = cablesToEngine(solar, [{ from: 'lfoa.out', to: 'vcf.cvr' }], v);
    expect(l).toMatchObject({ src: 'solLfoA', dst: 'solCutL' });
    expect(r).toMatchObject({ src: 'solLfoA', dst: 'solCutR' });
    const { vcf } = sol({ 'vcf.lmod': 7, 'vcf.rmod': 3 });
    expect(vcf.l.mod).toBeCloseTo(0.7, 10);
    expect(vcf.r.mod).toBeCloseTo(0.3, 10);
  });

  it('leaves the unmodelled jacks with no signal or destination', () => {
    expect(input('ea.vca').dest).toBeNull();
    expect(input('d3.shin').dest).toBeNull();
    expect(output('ef.gate').signal).toBeNull();
    expect(output('kb.press').signal).toBeNull();
  });
});

describe('SOLAR 42N brand marks', () => {
  it('tags the SOLAR 42N logo, AMBIENT MACHINE, ELTA MUSIC and the keyboard’s print', () => {
    const marks = solar.decor
      .filter((d): d is TextDecor => d.t === 'text' && !!d.brand)
      .map((d) => d.text);
    expect(marks).toEqual(
      expect.arrayContaining(['SOLAR', '42', 'N', 'AMBIENT', 'MACHINE', 'ELTA', 'MUSIC', '42N'])
    );
    const unbranded = solar.decor
      .filter((d): d is TextDecor => d.t === 'text' && !d.brand)
      .map((d) => d.text);
    expect(unbranded).not.toContain('SOLAR');
    expect(unbranded).not.toContain('ELTA');
  });
});
