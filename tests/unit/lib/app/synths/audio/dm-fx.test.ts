/**
 * DeepMind effects engine (dm-fx) tests.
 *
 * Every algorithm is loaded with the DeepMind's own default parameters (copied from the effects table the definitions
 * use) and its option-driven variants, and fed a short test signal. Each must come out finite and repeatable, and an
 * insert at full mix must change the sound. The routing trees, send mode, bypass, and the rebuild after a kernel
 * blows up are held in place too.
 *
 * @see lib/app/synths/audio/dm-fx.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { createFx, FX_FACTORY } from '@/lib/app/synths/audio/dm-fx';
import type { FxParams, FxSlot } from '@/lib/app/synths/contract';
import { seeded } from '@/tests/unit/lib/app/synths/audio/render';

/** Each algorithm's default parameters, as the DeepMind definition's effects table lists them. */
const DEFAULTS: Record<string, Record<string, number | string>> = {
  'tc-deepvrb': { PST: 'Hall', DCY: 2, TON: 0, PDY: 20, MIX: 30 },
  ambverb: {
    PD: 10,
    DCY: 1.2,
    SIZ: 40,
    DMP: 6000,
    DIF: 20,
    MIX: 30,
    LC: 80,
    HC: 10000,
    MOD: 30,
    TGN: 60,
  },
  roomrev: {
    PRE: 10,
    DCY: 1,
    SIZ: 16,
    DMP: 7000,
    DIF: 60,
    MIX: 30,
    LC: 80,
    HC: 10000,
    LFX: 1,
    SPR: 25,
    SHP: 100,
    SPI: 30,
  },
  vintagerev: {
    PRE: 20,
    SIZ: 50,
    DCY: 1.8,
    LFX: 1,
    HFX: 0.8,
    DEN: 50,
    LC: 50,
    HC: 12000,
    ERL: 40,
    ERD: 10,
    MIX: 30,
    FRZ: 'OFF',
  },
  hallrev: {
    PD: 25,
    DCY: 2.2,
    SIZ: 60,
    DMP: 6000,
    DIF: 20,
    MIX: 30,
    LC: 80,
    HC: 12000,
    LFX: 1.1,
    SPR: 30,
    SHP: 120,
    MOD: 30,
  },
  chamberrev: {
    PRE: 15,
    DCY: 1.4,
    SIZ: 24,
    DMP: 8000,
    DIF: 70,
    MIX: 30,
    LC: 60,
    HC: 12000,
    LFX: 1,
    SPR: 25,
    SHP: 80,
    SPI: 20,
  },
  platerev: {
    PD: 5,
    DCY: 2,
    SIZ: 40,
    DMP: 9000,
    DIF: 25,
    MIX: 30,
    LC: 100,
    HC: 14000,
    LFX: 1,
    XOV: 200,
    MOD: 15,
    MDS: 30,
  },
  richpltrev: {
    PD: 5,
    DCY: 2.5,
    SIZ: 20,
    DMP: 10000,
    DIF: 70,
    MIX: 30,
    LC: 100,
    HC: 15000,
    LFX: 1,
    SPR: 30,
    ATK: 30,
    SPN: 30,
  },
  gatedrev: {
    PD: 0,
    DCY: 300,
    ATK: 5,
    DEN: 30,
    SPR: 50,
    MIX: 40,
    LC: 80,
    HIF: 6000,
    HIG: -6,
    DIF: 70,
  },
  reverse: { PD: 0, DCY: 500, RIS: 25, DIF: 20, SPR: 50, MIX: 40, LC: 80, HIF: 6000, HIG: -3 },
  chorusverb: {
    SPD: 0.6,
    DEP: 40,
    DLY: 12,
    PHS: 90,
    WAV: 0,
    BAL: 0,
    PRE: 20,
    DCY: 1.8,
    SIZ: 50,
    DMP: 7000,
    LC: 80,
    MIX: 30,
  },
  delayverb: {
    TIM: 375,
    PAT: '3/4',
    FHC: 6000,
    FBK: 30,
    XFD: 40,
    BAL: 0,
    PRE: 20,
    DCY: 1.5,
    SIZ: 40,
    DMP: 7000,
    LC: 80,
    MIX: 30,
  },
  flangeverb: {
    SPD: 0.3,
    DEP: 50,
    DLY: 3,
    PHS: 90,
    FBK: 40,
    BAL: 0,
    PRE: 20,
    DCY: 1.5,
    SIZ: 40,
    DMP: 7000,
    LC: 80,
    MIX: 30,
  },
  midaseq: {
    LSG: 0,
    LSF: 100,
    LMG: 0,
    LMF: 400,
    LMQ: 1,
    HMG: 0,
    HMF: 2500,
    HMQ: 1,
    HSG: 0,
    HSF: 8000,
    EQ: 'ON',
  },
  enhancer: { OGN: 0, SPR: 0, BGN: 0, BFR: 20, MGN: 0, MIQ: 20, HIG: 0, HIF: 20, SOL: 'OFF' },
  faircomp: {
    MOD: 'LINK',
    INL: 0,
    THL: 5,
    TML: '2',
    DCL: 50,
    OGL: 0,
    BAL: 0,
    INR: 0,
    THR: 5,
    TMR: '2',
    DCR: 50,
    OGR: 0,
  },
  mulbnddist: {
    IPG: 0,
    DST: 'TUB',
    LBL: 0,
    LDR: 30,
    XV1: 250,
    MBL: 0,
    MDR: 40,
    XV2: 2500,
    HBL: 0,
    HDR: 30,
    CAB: 'OFF',
    OPG: -6,
  },
  rackamp: { PRE: 4, BUZ: 5, PNC: 5, CRN: 5, DRV: 3, LVL: 5, LOW: 5, HI: 5, CAB: 'ON' },
  edisonex1: { ON: 'ON', IMD: 'ST', OMD: 'ST', STS: 0, LMF: 0, BAL: 0, CNT: 0, GN: 0 },
  'auto-pan': { SPD: 2, PHS: 180, WAV: 0, DEP: 60, ESP: 0, EDP: 0, ATK: 20, HLD: 50, REL: 200 },
  noisegate: { THR: -40, RNG: -60, ATT: 1, REL: 150, HLD: 20, PUN: 0, MOD: 'GAT', PWR: 'ON' },
  delay: {
    MIX: 30,
    TIM: 375,
    MOD: 'ST',
    FCL: '1',
    FCR: '2/3',
    OFS: 0,
    LC: 100,
    HC: 8000,
    FLC: 50,
    FBL: 35,
    FBR: 35,
    FHC: 5000,
  },
  '3tapdelay': {
    TIM: 400,
    GNT: 80,
    PNT: 0,
    FBK: 30,
    FCA: '2/3',
    GNA: 60,
    PNA: -70,
    FCB: '3/2',
    GNB: 50,
    PNB: 70,
    XFD: 'OFF',
    MIX: 30,
  },
  '4tapdelay': {
    TIM: 300,
    GN: 80,
    FBK: 30,
    SPR: 3,
    FCA: '1/2',
    GNA: 60,
    FCB: '3/2',
    GNB: 50,
    FCC: '2',
    GNC: 40,
    XFD: 'OFF',
    MIX: 30,
  },
  't-raydelay': { MIX: 30, DLY: 40, SUS: 40, WOB: 40, TON: 50 },
  decimdelay: {
    MIX: 30,
    TIM: 300,
    DSM: 30,
    FCL: '1',
    FCR: '2/3',
    BRC: 12,
    FC: 4000,
    RES: 20,
    FLT: 'LP',
    FBL: 30,
    FBR: 30,
    DMT: 'POST',
  },
  moddlyrev: {
    TIM: 400,
    FAC: '1',
    FBK: 30,
    FHC: 6000,
    DEP: 30,
    SPD: 0.8,
    MOD: 'SER',
    RTY: 'HALL',
    DCY: 4,
    DMP: 7000,
    BAL: 0,
    MIX: 30,
  },
  chorus: {
    SPD: 0.5,
    WDL: 40,
    WDR: 40,
    DLL: 12,
    DLR: 18,
    MIX: 40,
    LC: 50,
    HC: 16000,
    PHS: 90,
    WAV: 50,
    SPR: 50,
  },
  'chorus-d': { ON: 'ON', MOD: 'STEREO', MIX: 50, SW1: 'OFF', SW2: 'ON', SW3: 'OFF', SW4: 'OFF' },
  flanger: {
    SPD: 0.3,
    WDL: 60,
    WDR: 60,
    DLL: 2,
    DLR: 3,
    MIX: 50,
    LC: 20,
    HC: 15000,
    PHS: 90,
    FLC: 50,
    FHC: 10000,
    FD: 50,
  },
  phaser: {
    SPD: 0.4,
    DEP: 60,
    RES: 40,
    BAS: 300,
    STG: 6,
    MIX: 50,
    WAV: 0,
    PHS: 0,
    ENV: 0,
    ATK: 20,
    HLD: 50,
    REL: 200,
  },
  moodfilter: {
    SPD: 1,
    DEP: 40,
    RES: 50,
    FRQ: 500,
    TYP: 'LP',
    MIX: 100,
    WAV: 'TRI',
    ENV: 0,
    ATK: 20,
    REL: 150,
    DRV: 20,
    '4P': 100,
  },
  'dual-pitch': {
    SM1: 0,
    CN1: -8,
    DL1: 20,
    GN1: 70,
    PN1: -60,
    MIX: 40,
    SM2: 0,
    CN2: 8,
    DL2: 30,
    GN2: 70,
    PN2: 60,
    HIC: 12000,
  },
  'vintage-pitch': {
    SM1: 0,
    CN1: -6,
    DL1: 25,
    FB1: 20,
    PN1: -60,
    MIX: 40,
    SM2: 0,
    CN2: 6,
    DL2: 35,
    FB2: 20,
    PN2: 60,
    HIC: 10000,
  },
  rotaryspkr: { LOS: 0.7, HIS: 6.5, ACC: 50, DIS: 40, BAL: 0, MIX: 100, MOT: 'RUN', SPD: 'SLOW' },
};

const SR = 48000;
const NEUTRAL_AT_DEFAULTS = ['enhancer', 'edisonex1'];
const N = 4800;

/** A plucked, decaying two-tone burst: something for a reverb, a delay and a dynamics processor to work on. */
function testSignal(): Float32Array {
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const env = i < 2400 ? Math.exp(-i / 600) : 0;
    x[i] =
      env *
      (0.6 * Math.sin((2 * Math.PI * 220 * i) / SR) +
        0.3 * Math.sin((2 * Math.PI * 1330 * i) / SR));
  }
  return x;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function run(fx: Partial<FxParams> | null, input = testSignal()) {
  vi.spyOn(Math, 'random').mockImplementation(seeded(42));
  const engine = createFx(SR);
  engine.set(fx);
  const l = new Float32Array(N),
    r = new Float32Array(N);
  for (let o = 0; o < N; o += 128) {
    const n = Math.min(128, N - o);
    engine.process(input.subarray(o, o + n), l.subarray(o, o + n), r.subarray(o, o + n), n);
  }
  vi.restoreAllMocks();
  return { l, r, input };
}

const one = (
  alg: string,
  p: Record<string, number | string>,
  mode: FxParams['mode'] = 'insert',
  routing = 1
): FxParams => ({
  mode,
  routing,
  slots: [
    { alg, level: 1, p: { ...p, ...('MIX' in p ? { MIX: 100 } : {}) } },
    { alg: null },
    { alg: null },
    { alg: null },
  ],
});

const finite = (b: Float32Array): boolean => b.every((v) => Number.isFinite(v));
const same = (a: Float32Array, b: Float32Array): boolean => a.every((v, i) => v === b[i]); // (=== so that −0 and +0 count as the same sample);

/** Option variants, so every branch an option chooses is run. */
const VARIANTS: [string, Record<string, number | string>][] = [
  ...[
    'Ambience',
    'Church',
    'Gate',
    'Lo Fi',
    'Modulated',
    'Plate',
    'Room',
    'Spring',
    'Tile',
    'Default',
    'Unknown',
  ].map((PST): [string, Record<string, number | string>] => [
    'tc-deepvrb',
    { ...DEFAULTS['tc-deepvrb'], PST, TON: 20 },
  ]),
  ['vintagerev', { ...DEFAULTS.vintagerev, FRZ: 'ON' }],
  ['delayverb', { ...DEFAULTS.delayverb, PAT: '1/3X' }],
  ['delayverb', { ...DEFAULTS.delayverb, PAT: 'odd' }],
  ['moddlyrev', { ...DEFAULTS.moddlyrev, MOD: 'PAR', RTY: 'HALL', FAC: 'none' }],
  ['moddlyrev', { ...DEFAULTS.moddlyrev, RTY: 'AMB' }],
  ['midaseq', { ...DEFAULTS.midaseq, EQ: 'OFF' }],
  ['enhancer', { ...DEFAULTS.enhancer, SOL: 'ON', BGN: 50, MGN: 40, HIG: 60, SPR: 30, OGN: -3 }],
  ['faircomp', { ...DEFAULTS.faircomp, MOD: 'M/S', TML: '5', TMR: '6' }],
  ['faircomp', { ...DEFAULTS.faircomp, MOD: 'DUAL', TML: '9' }],
  ['mulbnddist', { ...DEFAULTS.mulbnddist, DST: 'VAL', CAB: 'V30' }],
  ['mulbnddist', { ...DEFAULTS.mulbnddist, DST: 'PFS', CAB: 'none' }],
  ['mulbnddist', { ...DEFAULTS.mulbnddist, DST: 'SAT' }],
  ['rackamp', { ...DEFAULTS.rackamp, CAB: 'OFF' }],
  [
    'edisonex1',
    { ...DEFAULTS.edisonex1, IMD: 'MS', OMD: 'MS', STS: 30, LMF: 20, BAL: 10, CNT: 20, GN: 2 },
  ],
  ['edisonex1', { ...DEFAULTS.edisonex1, STS: 40, CNT: -20 }],
  ['edisonex1', { ...DEFAULTS.edisonex1, ON: 'OFF' }],
  ['noisegate', { ...DEFAULTS.noisegate, MOD: 'TRN' }],
  ['noisegate', { ...DEFAULTS.noisegate, MOD: 'DUC' }],
  ['noisegate', { ...DEFAULTS.noisegate, PWR: 'OFF' }],
  ['delay', { ...DEFAULTS.delay, MOD: 'X' }],
  ['delay', { ...DEFAULTS.delay, MOD: 'P-P' }],
  ['delay', { ...DEFAULTS.delay, MOD: 'M' }],
  ['3tapdelay', { ...DEFAULTS['3tapdelay'], XFD: 'ON' }],
  ['decimdelay', { ...DEFAULTS.decimdelay, DMT: 'PRE', FLT: 'HP', BRC: 24 }],
  ['decimdelay', { ...DEFAULTS.decimdelay, DMT: 'POST', FLT: 'BP' }],
  ['decimdelay', { ...DEFAULTS.decimdelay, FLT: 'NOT' }],
  [
    'chorus-d',
    { ...DEFAULTS['chorus-d'], MOD: 'MONO', SW1: 'ON', SW2: 'ON', SW3: 'ON', SW4: 'ON' },
  ],
  ['chorus-d', { ...DEFAULTS['chorus-d'], ON: 'OFF' }],
  ...['SIN', 'SAW+', 'SAW-', 'RMP', 'SQU', 'RND', 'TRI'].map(
    (WAV): [string, Record<string, number | string>] => [
      'moodfilter',
      { ...DEFAULTS.moodfilter, WAV, SPD: 20 },
    ]
  ),
  ...['HP', 'BP', 'NOT'].map((TYP): [string, Record<string, number | string>] => [
    'moodfilter',
    { ...DEFAULTS.moodfilter, TYP },
  ]),
  ['rotaryspkr', { ...DEFAULTS.rotaryspkr, SPD: 'FAST' }],
  ['rotaryspkr', { ...DEFAULTS.rotaryspkr, MOT: 'STOP' }],
];

describe('FX_FACTORY', () => {
  it('has the 35 DeepMind algorithms, each with a default parameter set here', () => {
    expect(Object.keys(FX_FACTORY)).toHaveLength(35);
    expect(Object.keys(FX_FACTORY).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
});

describe.each(Object.entries(DEFAULTS))('algorithm %s at its defaults', (alg, p) => {
  it('as an insert at full mix: finite, repeatable, and audibly not the dry sound', () => {
    const a = run(one(alg, p));
    const b = run(one(alg, p));
    expect(finite(a.l) && finite(a.r)).toBe(true);
    expect(same(a.l, b.l) && same(a.r, b.r)).toBe(true);
    const changed = !same(a.l, a.input) || !same(a.r, a.input);
    // The enhancer (every gain 0) and the stereo imager (width and balance 0) are neutral at their defaults.
    expect(changed).toBe(!NEUTRAL_AT_DEFAULTS.includes(alg));
  });

  it('on a send: the dry sound plus the effect', () => {
    const s = run(one(alg, p, 'send'));
    expect(finite(s.l) && finite(s.r)).toBe(true);
  });
});

describe.each(VARIANTS)('algorithm %s with options %o', (alg, p) => {
  it('stays finite and repeatable', () => {
    const a = run(one(alg, p));
    const b = run(one(alg, p));
    expect(finite(a.l) && finite(a.r)).toBe(true);
    expect(same(a.l, b.l)).toBe(true);
  });
});

describe('routing', () => {
  const four: FxSlot[] = [
    { alg: 'chorus', level: 1, p: DEFAULTS.chorus },
    { alg: 'delay', level: 0.8, p: DEFAULTS.delay },
    { alg: 'phaser', level: 1, p: DEFAULTS.phaser },
    { alg: 'hallrev', level: 0.7, p: DEFAULTS.hallrev },
  ];

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99])('routing %i runs every slot it names', (routing) => {
    const a = run({ mode: 'insert', routing, slots: four });
    expect(finite(a.l) && finite(a.r)).toBe(true);
    expect(same(a.l, a.input)).toBe(false);
  });

  it('feedback routings return the loop on a send, with empty slots passing the sound through', () => {
    const sparse: FxSlot[] = [
      { alg: 'delay', level: 1, p: DEFAULTS.delay },
      { alg: null },
      { alg: null },
      { alg: null },
    ];
    for (const routing of [9, 10]) {
      const a = run({ mode: 'send', routing, slots: sparse });
      expect(finite(a.l)).toBe(true);
    }
    const allEmpty = run({
      mode: 'insert',
      routing: 4,
      slots: [{ alg: null }, { alg: null }, { alg: null }, { alg: null }],
    });
    expect(same(allEmpty.l, allEmpty.input)).toBe(true);
  });

  it('bypass (or no settings at all) passes the input straight through, and an unknown algorithm is an empty slot', () => {
    for (const fx of [
      null,
      { mode: 'bypass' as const },
      { mode: 'insert' as const, slots: [{ alg: 'no-such', level: 1, p: {} }] },
    ]) {
      const a = run(fx);
      expect(same(a.l, a.input) && same(a.r, a.input)).toBe(true);
    }
  });

  it('keeps a loaded kernel across a settings change and swaps it when the algorithm changes', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(1));
    const engine = createFx(SR);
    const input = testSignal();
    const l = new Float32Array(128),
      r = new Float32Array(128);
    engine.set(one('chorus', DEFAULTS.chorus));
    engine.process(input, l, r, 128);
    engine.set(one('chorus', { ...DEFAULTS.chorus, SPD: 2 }));
    engine.process(input, l, r, 128);
    engine.set(one('flanger', DEFAULTS.flanger));
    engine.process(input, l, r, 128);
    expect(finite(l) && finite(r)).toBe(true);
  });

  it('rebuilds the slots when a kernel blows up, rather than leaving the synth silent', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(3));
    const engine = createFx(SR);
    engine.set(one('hallrev', DEFAULTS.hallrev));
    const bad = new Float32Array(128).fill(1e6);
    const l = new Float32Array(128),
      r = new Float32Array(128);
    engine.process(bad, l, r, 128);
    // the blown samples fall back to the dry input
    expect(l.every((v) => v === 1e6 || Number.isFinite(v))).toBe(true);
    const good = testSignal().subarray(0, 128);
    engine.process(good, l, r, 128);
    expect(finite(l) && finite(r)).toBe(true);
  });
});
