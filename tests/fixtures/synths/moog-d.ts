/**
 * Moog D: a small, hand-written Moog 900-series fixture for `explain-moog.ts`'s unit tests.
 *
 * One of each module slot `explain-moog.ts` and `moog-core.ts` name directly (one 921 oscillator, one 921A driver,
 * one 904A/904B filter pair, one 902 amplifier, one 911 envelope, one 994 mixer channel, one 992 controller, one
 * 995 attenuator, one 962 switch input, one 961 interface, one 960 sequencer row, one CM1A trigger), plus one
 * output jack per signal the explainer's test matrix reaches and one input jack per destination it reaches.
 *
 * Not a copy of any real system: coordinates are tidy and the panel has no controls (a Moog patch has nothing to
 * turn beyond cables and the knobs on each module, which the explainer reads from `EngineParams.moog` directly,
 * not from panel controls). Hand-written: the app never imports the prototype sources.
 */
import type {
  ControlValues,
  EngineParams,
  Jack,
  MoogParams,
  SynthDef,
} from '@/lib/app/synths/contract';

const outp = (id: string, x: number, signal: string, label: string): Jack => ({
  id,
  x,
  y: 0,
  r: 10,
  label,
  help: `${label} output.`,
  dir: 'out',
  signal,
});
const inp = (id: string, x: number, dest: string, label: string): Jack => ({
  id,
  x,
  y: 60,
  r: 10,
  label,
  help: `${label} input.`,
  dir: 'in',
  dest,
});

/** One output jack per signal `explain-moog.ts`'s `resolve()` / `kindOf()` branches read. */
export const MOOG_JACKS: Jack[] = [
  outp('out.v1sin', 0, 'v1sin', 'VCO 1 SIN'),
  outp('out.v1saw', 40, 'v1saw', 'VCO 1 SAW'),
  outp('out.kcv1', 80, 'kcv1', 'KB CV 1'),
  outp('out.e1', 120, 'e1', 'ENV 1'),
  outp('out.p6', 160, 'p6', '+6V'),
  outp('out.n6', 200, 'n6', '−6V'),
  outp('out.d1f', 240, 'd1f', 'DRIVER 1 FREQ'),
  outp('out.d1w', 280, 'd1w', 'DRIVER 1 WIDTH'),
  outp('out.white', 320, 'white', 'WHITE NOISE'),
  outp('out.mu1', 360, 'mu1', 'MULTIPLE 1'),
  outp('out.t1', 400, 't1', 'ATTEN 1 (992)'),
  outp('out.x1p', 440, 'x1p', 'MIXER 1 +'),
  outp('out.a1p', 480, 'a1p', '902 AMP 1 +'),
  outp('out.c1', 520, 'c1', 'CONTROLLER 1'),
  outp('out.ktrU', 560, 'ktrU', 'UPPER TRIG'),
  outp('out.i9a', 600, 'i9a', '961 AUDIO TRIG'),
  outp('out.i9sL', 640, 'i9sL', '961 S-TRIG L'),
  outp('out.s960a', 680, 's960a', '960 ROW A'),
  outp('out.s960clk', 720, 's960clk', '960 CLOCK'),

  inp('in.v1lf', 0, 'v1lf', 'VCO 1 LIN FREQ'),
  inp('in.v1dc', 40, 'v1dc', 'VCO 1 DC MOD'),
  inp('in.v1ac', 80, 'v1ac', 'VCO 1 AC MOD'),
  inp('in.v1lw', 120, 'v1lw', 'VCO 1 LIN WIDTH'),
  inp('in.d1fi', 160, 'd1fi', 'DRIVER 1 FREQ IN'),
  inp('in.lp904Cv', 200, 'lp904Cv', '904A CUTOFF CV'),
  inp('in.hp904Cv', 240, 'hp904Cv', '904B CUTOFF CV'),
  inp('in.a1cv', 280, 'a1cv', '902 AMP 1 CV'),
  inp('in.a1ip', 320, 'a1ip', '902 AMP 1 IN +'),
  inp('in.a1in', 360, 'a1in', '902 AMP 1 IN −'),
  inp('in.e1st', 400, 'e1st', 'ENV 1 S-TRIG IN'),
  inp('in.v1tv', 440, 'v1tv', 'VCO 1 V-TRIG'),
  inp('in.v1sy', 480, 'v1sy', 'VCO 1 SYNC'),
  inp('in.s960cv', 520, 's960cv', '960 CLOCK CV'),
  inp('in.mu1In', 560, 'mu1In', 'MULTIPLE 1 IN'),
  inp('in.t1In', 600, 't1In', 'ATTEN 1 IN'),
  inp('in.x1i1', 640, 'x1i1', 'MIXER 1 IN 1'),
  inp('in.c1i1', 680, 'c1i1', 'CONTROLLER 1 IN 1'),
  inp('in.c1x', 720, 'c1x', 'CONTROLLER 1 EXT'),
  inp('in.sw962i1', 760, 'sw962i1', '962 IN 1'),
  inp('in.q1In', 800, 'q1In', '995 ATTEN 1 IN'),
  inp('in.dryIn', 840, 'dryIn', 'OUTPUT'),
  inp('in.i9siL', 880, 'i9siL', '961 S-TRIG IN L'),
  inp('in.dtI1', 920, 'dtI1', '911A DELAY IN 1'),
];

/** One slot of everything, in volts/seconds as the contract says. A test overrides a field to reach a branch. */
export const DEFAULT_MOOG: MoogParams = {
  vco: [{ kind: '921', semi: 0, sync: 'off' }],
  drv: [{ v: 0, w: 0 }],
  vca: [{ v: 0, exp: false }],
  env: [{ t1: 0.01, t2: 0.2, t3: 0.3, sus: 0.6 }],
  mix: [{ g: [1, 1, 1, 1], m: 1 }],
  att: [1],
  ctl: [{ on: [true, true, true], x: 1 }],
  cm1a: { trig: 's' },
  s960: {
    hz: 2,
    timing: true,
    rows: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    range: [10, 10, 10],
    mode: ['normal', 'normal', 'normal'],
    btn: {
      on: false,
      off: false,
      shift: false,
      set: [false, false, false, false, false, false, false, false],
    },
  },
  q995: [1, 1, 1, 1, 1, 1],
};

/** The non-`moog` stub every `EngineParams` must carry (CONTRACT.md: "still supplies the stubs"). */
const BASE_VOICE: Omit<EngineParams, 'moog'> = {
  osc: [],
  noise: { level: 0 },
  ext: { level: 0 },
  filter: { type: 'ladder', mode: 'lp', cutoff: 1000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
  env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
  env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
  vca: { envSrc: 'none', bias: 1 },
  lfo: { rate: 5, mix: { tri: 1 }, keySync: false },
  glide: { time: 0, legato: false },
  trig: { retrig: true, drone: false, repeat: false },
  volume: 1,
};

export function moogToEngine(_v: ControlValues): EngineParams {
  return { ...BASE_VOICE, moog: DEFAULT_MOOG };
}

/** A fresh Moog D. Each call returns new objects, so a test may annotate or mutate its own copy. */
export function makeMoogD(overrides: Partial<SynthDef> = {}): SynthDef {
  return {
    id: 'moog-d',
    name: 'Moog D (test)',
    maker: 'Test',
    year: 2026,
    heritage: 'A test Moog 900-series system',
    summary: 'A minimal Moog modular fixture for explain-moog tests.',
    view: { w: 1000, h: 120 },
    theme: { panel: '#222', panel2: '#111', ink: '#eee', font: 'din', cheeks: 'none' },
    decor: [],
    areas: [
      {
        id: 'patch',
        label: 'Patch bay',
        module: 'patch',
        keywords: 'cable pin',
        rects: [{ x: 0, y: 0, w: 1000, h: 120 }],
        help: 'Patch points.',
      },
    ],
    controls: [],
    jacks: MOOG_JACKS.map((j) => ({ ...j })),
    init: {},
    toEngine: moogToEngine,
    ...overrides,
  };
}
