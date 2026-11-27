/**
 * Moog DFAM definition tests (t-269): the panel's settings as the engine takes them (`dfam-kit.ts`), at the init patch
 * and for each switch, plus the jacks, the presses and the maker's marks. The engine side (the sequencer, buses and
 * envelopes) is `audio/dfam-path.test.ts`'s.
 *
 * @see lib/app/synths/defs/dfam.ts
 * @see lib/app/synths/defs/dfam-kit.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, EngineParams } from '@/lib/app/synths/contract';
import dfam from '@/lib/app/synths/defs/dfam';
import {
  CENTRE_NOTE,
  DECAY_MAX,
  DECAY_MIN,
  EG_SEMI,
  FM_FULL,
  STEP_SEMI,
  VCF_EG_OCT,
  VCF_MOD_OCT,
  cutoffHz,
  decayS,
  egSemi,
  freqNote,
  tempoHz,
} from '@/lib/app/synths/defs/dfam-kit';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams => dfam.toEngine({ ...dfam.init, ...set }, CTX);
const route = (p: EngineParams, src: string, dst: string) =>
  p.routes?.find((r) => r.src === src && r.dst === dst);

describe('DFAM toEngine at the init patch', () => {
  const p = run();

  it('is two triangle VCOs, VCO 1 in the mix, both at FREQUENCY’s centre (C3) on the keys from C4', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ level: 0.7, mix: { tri: 1 }, semi: CENTRE_NOTE - 60 });
    expect(p.osc[1]).toMatchObject({
      level: 0,
      mix: { tri: 1 },
      semi: CENTRE_NOTE - 60,
      syncTo: -1,
    });
    expect(p.osc[1].fmLin).toEqual({ from: 0, depth: 0 });
  });

  it('runs the voice from the core: no voice envelope at the VCA, the core’s VCA EG at amp', () => {
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(route(p, 'dfmEgVca', 'amp')?.amt).toBe(1);
    expect(p.trig.retrig).toBe(true);
    expect(p.follow).toBe(true);
  });

  it('sends the NOISE / EXT channel into the mixer’s EXT input, with the voice’s own noise at 0', () => {
    expect(route(p, 'dfmNz', 'extIn')?.amt).toBe(1);
    expect(p.ext).toEqual({ level: 1 });
    expect(p.noise).toEqual({ level: 0, color: 'white' });
    expect(p.normals).toEqual({ att2In: 'noise' });
  });

  it('opens the ladder LP fully with no resonance', () => {
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', cutoff: 20000, res: 0 });
  });

  it('gives the core TEMPO at its centre, every step centred at full velocity, stopped, and the three decays', () => {
    expect(p.dfam).toMatchObject({
      tempo: tempoHz(5),
      pitch: Array(8).fill(0),
      vel: Array(8).fill(1),
      run: false,
      noise: 0,
    });
    expect(p.dfam?.perBeat).toBeUndefined();
    expect(p.dfam?.eg.map((e) => e.decay)).toEqual([0.2, 0.3, 0.3]);
    for (const e of p.dfam?.eg ?? []) expect(e).toMatchObject({ min: DECAY_MIN, max: DECAY_MAX });
    expect(p.dfam?.eg[2].attack).toBe(0.001);
  });

  it('routes no step pitch with SEQ PITCH MOD off', () => {
    expect(route(p, 'dfmPitch', 'pitch1')).toBeUndefined();
    expect(route(p, 'dfmPitch', 'pitch2')).toBeUndefined();
  });
});

describe('DFAM switches', () => {
  it('SEQ PITCH MOD sends the step pitch to both VCOs, to VCO 2 alone, or to neither', () => {
    const both = run({ 'seq.pitch_mod': 'vco12' });
    expect(route(both, 'dfmPitch', 'pitch1')?.amt).toBe(STEP_SEMI);
    expect(route(both, 'dfmPitch', 'pitch2')?.amt).toBe(STEP_SEMI);
    const two = run({ 'seq.pitch_mod': 'vco2' });
    expect(route(two, 'dfmPitch', 'pitch1')).toBeUndefined();
    expect(route(two, 'dfmPitch', 'pitch2')?.amt).toBe(STEP_SEMI);
  });

  it('each VCO’s wave switch picks a square (50% pulse) or a triangle', () => {
    const sq = run({ 'vco1.wave': 'square', 'vco2.wave': 'square' });
    expect(sq.osc[0]).toMatchObject({ mix: { pulse: 1 }, pw: 0.5 });
    expect(sq.osc[1]).toMatchObject({ mix: { pulse: 1 }, pw: 0.5 });
    expect(run({ 'vco2.wave': 'square' }).osc[0].mix).toEqual({ tri: 1 });
  });

  it('HARD SYNC syncs VCO 2 to VCO 1', () => {
    expect(run({ 'vco2.sync': 'on' }).osc[1].syncTo).toBe(0);
  });

  it('VCF MODE picks the ladder’s high-pass', () => {
    expect(run({ 'vcf.mode': 'hp' }).filter.mode).toBe('hp');
  });

  it('VCA EG FAST / SLOW sets the VCA envelope’s attack, and only its', () => {
    const slow = run({ 'vca_eg.attack': 'slow' }).dfam?.eg;
    expect(slow?.map((e) => e.attack)).toEqual([0.001, 0.001, 0.1]);
  });

  it('RUN / STOP lit runs the sequencer', () => {
    expect(run({ 'seq.run': true }).dfam?.run).toBe(true);
  });

  it('ADVANCE and TRIGGER are press buttons that change no setting', () => {
    const presses = dfam.controls
      .filter((c) => c.ui)
      .map((c) => [c.id, 'press' in c ? c.press : null]);
    expect(presses).toEqual([
      ['seq.trigger', 'trigger'],
      ['seq.advance', 'next'],
    ]);
    expect(run({ 'seq.trigger': true, 'seq.advance': true })).toEqual(run());
  });
});

describe('DFAM knobs', () => {
  it('FREQUENCY spans ten octaves about C3', () => {
    expect(run({ 'vco1.freq': 0 }).osc[0].semi).toBe(freqNote(0) - 60);
    expect(freqNote(10) - freqNote(0)).toBe(120);
  });

  it('VCO EG AMOUNT swings either way on a square taper, to the EG’s 8 octaves at full', () => {
    expect(route(run({ 'vco1.eg_amt': 5 }), 'dfmEgVco', 'pitch1')?.amt).toBe(EG_SEMI);
    expect(route(run({ 'vco2.eg_amt': -5 }), 'dfmEgVco', 'pitch2')?.amt).toBe(-EG_SEMI);
    expect(egSemi(2.5)).toBeCloseTo(EG_SEMI / 4, 10);
  });

  it('1→2 FM AMOUNT sets the linear FM depth', () => {
    expect(run({ 'vco2.fm_amt': 10 }).osc[1].fmLin?.depth).toBe(FM_FULL);
  });

  it('VCF EG AMOUNT and NOISE / VCF MOD route to the cutoff', () => {
    expect(route(run({ 'vcf_eg.amt': -5 }), 'dfmEgVcf', 'cutoff')?.amt).toBe(-VCF_EG_OCT);
    expect(route(run({ 'vcfmod.amt': 10 }), 'att2', 'cutoff')?.amt).toBe(VCF_MOD_OCT);
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBeCloseTo(cutoffHz(0), 10);
  });

  it('each step’s PITCH and VELOCITY reach the core, ±5 V and 0..10', () => {
    const d = run({ 'seq.pitch3': -5, 'seq.vel3': 4, 'seq.pitch8': 2.5 }).dfam;
    expect(d?.pitch[2]).toBe(-1);
    expect(d?.pitch[7]).toBe(0.5);
    expect(d?.vel[2]).toBeCloseTo(0.4, 10);
  });

  it('the decays run 10 ms to 10 s', () => {
    expect(decayS(0)).toBeCloseTo(DECAY_MIN, 10);
    expect(decayS(10)).toBeCloseTo(DECAY_MAX, 10);
    expect(run({ 'vcf_eg.decay': 10 }).dfam?.eg[1].decay).toBe(1);
  });

  it('NOISE / EXT LEVEL is the core’s channel level', () => {
    expect(run({ 'mix.noise': 10 }).dfam?.noise).toBe(1);
  });
});

describe('DFAM panel', () => {
  it('has no EDGE controls', () => {
    const ids = dfam.controls.map((c) => c.id);
    expect(ids).not.toContain('noise.color');
    expect(ids).not.toContain('clock.source');
    expect(ids).not.toContain('clock.scale');
  });

  it('has the 24 patch points, every one followed', () => {
    expect(dfam.jacks).toHaveLength(24);
    for (const j of dfam.jacks) expect(j.dir === 'in' ? j.dest : j.signal, j.id).toBeTruthy();
  });

  it('tags the printed DFAM, its name, its description and the moog logo as brand', () => {
    const brand = dfam.decor.filter((d) => d.brand).map((d) => (d.t === 'text' ? d.text : d.t));
    expect(brand).toEqual([
      'DFAM',
      'DRUMMER FROM',
      'ANOTHER MOTHER',
      'SEMI-MODULAR ANALOG',
      'PERCUSSION SYNTHESIZER',
      'moog',
    ]);
  });

  it('is played by its own sequencer, whose RUN / STOP is the panel’s', () => {
    expect(dfam.ownSequencer).toEqual({ run: 'seq.run' });
  });
});
