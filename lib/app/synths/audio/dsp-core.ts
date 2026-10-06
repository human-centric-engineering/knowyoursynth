// KnowYourSynth voice: one generic semi-modular mono/paraphonic voice, driven entirely by EngineParams
// (see CONTRACT.md). Runs per-sample inside an AudioWorklet, or a ScriptProcessor when worklets are blocked.
// No allocations in process(). Its only import is the DeepMind effects engine, bundled in with it for the worklet.
//
// Transliterated from the prototype's `prototype/src/audio/dsp-core.js` (D3): same names, order and arithmetic (every
// Math.random() call in the same place, Float32Array where it was one), so the ported engine renders the recorded
// baseline (`.context/app/check/`) sample for sample. Types added; where the prototype grew an object's fields on the
// fly, the type lists them as optional and the reads assert them, rather than initialising them to a value they never had.
import type {
  EngineParams,
  EaselParams,
  NormalSource,
  OscMix,
  OverdriveParams,
  DelayParams,
  SampleHoldParams,
  NoiseParams,
  ReverbParams,
  LfoMix,
  Phrase,
  TrapParams,
  TrigParams,
  EnvTrigSource,
  ChorusParams,
} from '@/lib/app/synths/contract';
import { createFx } from '@/lib/app/synths/audio/dm-fx';
import { createMoog, MOOG_SIGNALS, MOOG_DESTS } from '@/lib/app/synths/audio/moog-core';

/** The settings one voice takes. A voice of a `dual` synth gets its module's settings, which carry no `volume`. */
export type VoiceParams = Omit<EngineParams, 'volume'> & { volume?: number };

/** A message to the synth (from the page, the worklet port or the phrase player). */
export type SynthMessage =
  | { type: 'params'; p: EngineParams }
  | { type: 'noteOn'; n: number; v?: number }
  | { type: 'noteOff'; n: number }
  | { type: 'phrase'; phrase: Phrase | null }
  | { type: 'tempo'; bpm: number }
  | { type: 'stopPhrase' }
  | { type: 'panic' }
  | { type: 'offset'; semi?: number }
  | { type: 'phase'; lfo?: number; lfo2?: number };

/** A message to one voice: as {@link SynthMessage}, but its params may be a `dual` module's. */
type VoiceMessage = Exclude<SynthMessage, { type: 'params' }> | { type: 'params'; p: VoiceParams };

/** The meter the synth sends about 25 times a second. */
export interface MeterEvent {
  type: 'meter';
  /** Largest mixer level since the last meter. */
  overload: number;
  gate: boolean;
  lfo: number;
  env1: number;
  env2: number;
  /** Bit k: oscillator k is sounding a note. */
  oscs?: number;
  /** Bit k: voice k is sounding (poly and dual). */
  voices?: number;
  /** The Easel's sequencer stage, or the 960's (0-based). */
  seq?: number;
  /** The Easel's pulser ramp. */
  pulser?: number;
}

/** What the synth reports back. */
export type SynthEvent =
  | { type: 'note'; n: number; on: boolean }
  | { type: 'allOff' }
  | { type: 'phraseEnd' }
  | MeterEvent;

export type SynthEventHandler = (e: SynthEvent) => void;

/** One oscillator's running state. */
interface VoiceOsc {
  phase: number;
  level: number;
  levelT: number;
  pw: number;
  pwT: number;
  semi: number;
  semiT: number;
  kbd: boolean;
  fixed: number;
  syncTo: number;
  on: boolean;
  tri: number;
  shark: number;
  saw: number;
  rsaw: number;
  pulse: number;
  sine: number;
  tmod: number;
  notch: number;
  inc: number;
  wrapped: boolean;
  wrapFrac: number;
  mo: boolean;
  morph: number;
  morphT: number;
  sub: number;
  subSt: number;
  syncGate: boolean;
  skew: number;
  skewT: number;
  sineShape: number;
  /** Set by setParams once the oscillator is in use. */
  subL?: number;
}

/** One envelope's running state. The optional fields are set by setParams and the stage changes. */
interface VoiceEnv {
  stage: number;
  level: number;
  a: number;
  d: number;
  s: number;
  r: number;
  prevGate: boolean;
  ca: number;
  cd: number;
  cr: number;
  dlyN: number;
  holdN: number;
  wait: number;
  kf: number;
  kfNote: number;
  ba: number;
  bd: number;
  br: number;
  curved?: boolean;
  pa?: number;
  pd?: number;
  pr?: number;
  cdBase?: number;
  t?: number;
  from?: number;
  loop?: boolean;
  freeze?: boolean;
}

/** A phrase note event: at beat `b` (and sample `t` once timed), key `n` goes down (`on`, velocity `v`) or up. */
interface VoicePhraseEvent {
  b: number;
  on: boolean;
  n: number;
  v?: number;
  t?: number;
}

interface VoicePhrase {
  evs: VoicePhraseEvent[];
  beats: number;
  len: number;
  loop: boolean;
  transpose: number;
}

/** A phrase note event of the poly and dual wrappers: at sample `t`, key `n` goes down (`on`, velocity `v`) or up. */
interface SynthPhraseEvent {
  t: number;
  on: boolean;
  n: number;
  v?: number;
}

interface SynthPhrase {
  evs: SynthPhraseEvent[];
  len: number;
  loop: boolean;
  transpose: number;
}

/** One voice, as the poly and dual wrappers drive it. */
interface Voice {
  handle: (m: VoiceMessage) => void;
  process: (out: Float32Array, n: number, outR?: Float32Array) => void;
  /** Silent until its next note. */
  idle: () => boolean;
  /** Copy the signals this voice's cross-module cables read from the other voice. */
  link: (peer: Float64Array) => void;
  /** The voice's signals. */
  S: Float64Array;
  /** Some cable reads the other voice. */
  linked: () => boolean;
}

/** The synth: send it messages, and ask it for samples. With `outR` the output is stereo; without it `out` gets the mono sum. */
export interface Synth {
  handle: (m: SynthMessage) => void;
  process: (out: Float32Array, n: number, outR?: Float32Array) => void;
}

/** Separate waveform outputs of each oscillator (`o1saw` … `o3sine`), filled in when EngineParams `oscOuts` is on. */
export const OSC_WAVES: string[] = ['saw', 'pulse', 'tri', 'sine'];
const OSC_OUTS = [1, 2, 3].flatMap((n) => OSC_WAVES.map((w) => `o${n}${w}`));
export const SIGNALS: string[] = [
  'osc1',
  'osc2',
  'osc3',
  'oscMix',
  'mixer',
  'noise',
  'vcf1',
  'vcf2',
  'od',
  'vca',
  'out',
  'lfo',
  'lfoTri',
  'lfoSq',
  'lfoUni',
  'sh',
  'slew',
  'att1',
  'att2',
  'sum1',
  'sum2',
  'invert',
  'mult',
  'env1',
  'env2',
  'gate',
  'wheel',
  'vel',
  'one',
  'kbd',
  ...OSC_OUTS,
  'ring',
  'lfoSine',
  'lfoSaw',
  'vib',
  'shClk',
  'preamp',
  'envf',
  'inv1',
  'inv2',
  'esw',
  'rev',
  'master',
  'kbd2',
  'vcfHp',
  'env3',
  'lfo2',
  'lfo2Uni',
  'env1v',
  'env2v',
  'osc4',
  'trap',
  'joyX',
  'joyY',
  'keyv',
  'kpulse',
  'press',
  'pressV',
  'preset',
  'pulser',
  'seq',
  'rnd1',
  'rnd2',
  'rnd3',
  'rnd4',
  'inv10',
  'lpg1',
  'lpg2',
  'ezMix',
  'ezBal',
  'pink',
  'sub',
  'hp6',
  ...MOOG_SIGNALS,
];
export const DESTS: string[] = [
  'pitchAll',
  'pitch1',
  'pitch2',
  'pitch3',
  'pw1',
  'pw2',
  'cutoff',
  'res',
  'amp',
  'lfoRate',
  'delayTime',
  'lfoTrig',
  'gate1',
  'gate2',
  'shClock',
  'extIn',
  'vcfIn',
  'odIn',
  'vcaIn',
  'delayIn',
  'shIn',
  'slewIn',
  'att1In',
  'att1CV',
  'att2In',
  'sum1A',
  'sum1B',
  'sum2A',
  'sum2B',
  'invertIn',
  'multIn',
  'pw3',
  'ampExp',
  'ringA',
  'ringB',
  'vibIn',
  'preampIn',
  'envfIn',
  'inv1In',
  'inv1A',
  'inv1B',
  'inv2In',
  'inv2A',
  'eswA',
  'eswB',
  'revIn',
  'dryIn',
  'gateIn',
  'trigIn',
  'envClk',
  'cutoffHp',
  'wave1',
  'wave2',
  'lvl1',
  'lvl2',
  'pitch4',
  'out1In',
  'out2In',
  'out1Lvl',
  'out2Lvl',
  'decayCv',
  'revMix',
  'gate1Lvl',
  'gate2Lvl',
  'lpg1In',
  'lpg2In',
  'index',
  'fold',
  'period',
  'envA',
  'envS',
  'envD',
  'portaIn',
  'ezPulse',
  'ezPress',
  'ezPitch',
  'fmIn',
  'inv10In',
  'hp6In',
  ...MOOG_DESTS,
];

/** Audio path and gates the voice always has unless a SynthDef's `normals` or a cable overrides them. */
export const BUILTIN_NORMALS: Record<string, string> = {
  vcfIn: 'mixer',
  odIn: 'vcf1',
  vcaIn: 'od',
  delayIn: 'vca',
  gate1: 'gate',
  gate2: 'gate',
  shIn: 'noise',
  dryIn: 'out',
};
const TWO_PI = Math.PI * 2;
const LN2_12 = Math.LN2 / 12;

/**
 * One voice. `part` = it is one of the voices of a polyphonic synth (EngineParams `poly`): the wrapper below owns the
 * phrase player, the note events and the output stage, and this voice hands back its signal before volume and clipping.
 */
function createVoice(sr: number, onEvent: SynthEventHandler | null, part = false): Voice {
  const SI: Record<string, number> = {};
  SIGNALS.forEach((n, i) => {
    SI[n] = i;
  });
  const DI: Record<string, number> = {};
  DESTS.forEach((n, i) => {
    DI[n] = i;
  });
  // The upper half holds copies of the other voice's signals, for cables between the two modules of a `dual` synth.
  const NS = SIGNALS.length;
  const S = new Float64Array(NS * 2);
  S[SI.one] = 1;
  const ND = DESTS.length;
  let xNeed: number[] = [];

  // compiled routing: per-dest flat lists
  let destSrc: number[][] = DESTS.map(() => []);
  let destAmt: number[][] = DESTS.map(() => []);
  let destBy: number[][] = DESTS.map(() => []);
  const normSig = new Int32Array(ND).fill(-1);
  const normAmt = new Float64Array(ND).fill(1);
  const cabled = new Uint8Array(ND);
  // Each oscillator's own output signal and pitch destination (the fourth was added later, so they are not contiguous).
  const OSC_SI = [SI.osc1, SI.osc2, SI.osc3, SI.osc4];
  const PITCH_DI = [DI.pitch1, DI.pitch2, DI.pitch3, DI.pitch4];

  const ev = (d: number): number => {
    let x = normSig[d] >= 0 ? S[normSig[d]] * normAmt[d] : 0;
    const src = destSrc[d];
    const amt = destAmt[d];
    const by = destBy[d];
    for (let i = 0; i < src.length; i++)
      x += by[i] < 0 ? S[src[i]] * amt[i] : S[src[i]] * amt[i] * S[by[i]];
    return x;
  };

  // ── state ──
  let P: VoiceParams | null = null;
  const osc: VoiceOsc[] = [0, 1, 2, 3].map(() => ({
    phase: Math.random(),
    level: 0,
    levelT: 0,
    pw: 0.5,
    pwT: 0.5,
    semi: 0,
    semiT: 0,
    kbd: true,
    fixed: 60,
    syncTo: -1,
    on: false,
    tri: 0,
    shark: 0,
    saw: 0,
    rsaw: 0,
    pulse: 0,
    sine: 0,
    tmod: 0,
    notch: 0,
    inc: 0,
    wrapped: false,
    wrapFrac: 0,
    mo: false,
    morph: 0,
    morphT: 0,
    sub: 0,
    subSt: 0,
    syncGate: false,
    skew: -1,
    skewT: -1,
    sineShape: 0,
  }));
  let nOsc = 0;
  const held: number[] = [];
  let gate = 0,
    vel = 0.8,
    wheel = 0;
  let note = 60,
    noteT = 60,
    note2 = 60,
    note2T = 60;
  let retrigFlag = false;
  // EngineParams `acid` (TB-303): whether the note playing is accented, and the accent sweep circuit's capacitor
  let accOn = false,
    accSweep = 0;
  // `oscAssign` (Poly D): each oscillator plays a note of its own. slotKey = the key it was given (−1 none), slotHeld =
  // that key is still down, slotN / slotNT its (gliding) pitch, slotG / slotGT its on/off gain, slotT when it was given it.
  const slotKey = new Int32Array(4).fill(-1),
    slotHeld = new Uint8Array(4),
    slotT = new Float64Array(4);
  const slotN = new Float64Array(4).fill(60),
    slotNT = new Float64Array(4).fill(60);
  const slotG = new Float64Array(4),
    slotGT = new Float64Array(4);
  let slotClock = 0,
    slotLast = -1;
  const mkEnv = (): VoiceEnv => ({
    stage: 0,
    level: 0,
    a: 0.005,
    d: 0.3,
    s: 0.7,
    r: 0.2,
    prevGate: false,
    ca: 0,
    cd: 0,
    cr: 0,
    dlyN: 0,
    holdN: 0,
    wait: 0,
    kf: 0,
    kfNote: 60,
    ba: 0.005,
    bd: 0.3,
    br: 0.2,
  });
  const env = [mkEnv(), mkEnv(), mkEnv()];
  let lfoPhase = 0,
    lfoTrigPrev = 0;
  // Opt-in extras (added for the DeepMind): LFO delay + fade-in, sample-and-hold shapes, a second LFO, a per-voice pitch
  // offset (unison detune) and slow random drift.
  let lfoT = 0,
    lfoGatePrev = 0,
    lfoSh = 0,
    lfoShg = 0;
  const lfo2 = { phase: 0, t: 0, sh: 0, shg: 0 };
  let vOff = 0,
    drift = 0,
    driftT = 0,
    driftN = 0;
  let shPhase = 0,
    shHeld = 0,
    shOut = 0,
    shClkPrev = 0,
    slewOut = 0;
  let pinkB0 = 0,
    pinkB1 = 0,
    pinkB2 = 0,
    hp6Lp = 0;
  let cutLog = Math.log(1000),
    cutLogT = cutLog,
    res = 0,
    resT = 0,
    vol = 0,
    volT = 0,
    noiseL = 0,
    noiseLT = 0;
  let s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0,
    ic1 = 0,
    ic2 = 0,
    fPrevIn = 0;
  // Optional 24 dB high-pass stage in front of the main filter (EngineParams `hpf`). Two SVF sections in series.
  let hpLog = Math.log(20),
    hpLogT = hpLog,
    hpRes = 0,
    hpResT = 0;
  let hA1 = 0,
    hA2 = 0,
    hB1 = 0,
    hB2 = 0;
  let odLp = 0,
    vcaGain = 0,
    dcX = 0,
    dcY = 0,
    a440Phase = 0;
  const DLEN = 1 << 16;
  const dbuf = new Float32Array(DLEN);
  let dW = 0,
    dTime = 0.3,
    dLp = 0;
  let overloadPeak = 0,
    meterCount = 0;
  // 2600-style extras: delayed vibrato, trigger pulses, ring-mod input coupling, envelope follower, low-frequency noise
  const OW = [0, 1, 2].map((k) => OSC_WAVES.map((w) => SI[`o${k + 1}${w}`]));
  let vibT = 0,
    vibGatePrev = 0,
    ringHp = 0,
    efLevel = 0,
    lfNoise = 0;
  const trigPrev = new Float64Array(2),
    trigCnt = new Float64Array(2);
  const ringHpC = 1 - Math.exp((-TWO_PI * 12) / sr);
  const efAtt = 1 - Math.exp(-1 / (0.004 * sr)),
    efRel = 1 - Math.exp(-1 / (0.09 * sr));
  const lfNoiseC = 1 - Math.exp((-TWO_PI * 40) / sr);
  // VCS3 extras: the noise colour tilt, the second ring-mod input's coupling, the trapezoid envelope generator, the
  // joystick and the two output amplifiers (level, tone, pan) that make the voice stereo.
  let nTiltLp = 0,
    ringHpB = 0,
    trapSt = 0,
    trapLvl = 0,
    trapT = 0,
    trapPrevG = false,
    joyX = 0,
    joyY = 0;
  const nTiltC = 1 - Math.exp((-TWO_PI * 650) / sr);
  const oaG = new Float64Array(2),
    oaLp = new Float64Array(2),
    oaHp = new Float64Array(2),
    oaY = new Float64Array(2);
  const oaDc = new Float64Array(4),
    oaPan = new Float64Array(4);
  // spring reverb: a dispersive allpass chain (the "boing"), four damped combs, two diffusing allpasses
  const rvComb = [0.0297, 0.0371, 0.0411, 0.0437].map((t) => new Float32Array(Math.round(t * sr)));
  const rvCombI = new Int32Array(4),
    rvCombLp = new Float64Array(4);
  const rvAp = [0.005, 0.0017].map((t) => new Float32Array(Math.round(t * sr)));
  const rvApI = new Int32Array(2);
  const rvDisp = new Float64Array(24);
  function spring(x: number, fb: number, damp: number) {
    for (let s = 0; s < 12; s++) {
      const y = -0.68 * x + rvDisp[2 * s] + 0.68 * rvDisp[2 * s + 1];
      rvDisp[2 * s] = x;
      rvDisp[2 * s + 1] = y;
      x = y;
    }
    let acc = 0;
    for (let c = 0; c < 4; c++) {
      const buf = rvComb[c],
        i = rvCombI[c],
        o = buf[i];
      rvCombLp[c] = o + (rvCombLp[c] - o) * damp;
      buf[i] = x + rvCombLp[c] * fb + 1e-18;
      rvCombI[c] = i + 1 >= buf.length ? 0 : i + 1;
      acc += o;
    }
    let y = acc * 0.25;
    for (let a = 0; a < 2; a++) {
      const buf = rvAp[a],
        i = rvApI[a],
        b = buf[i];
      buf[i] = y + b * 0.5;
      y = b - y * 0.5;
      rvApI[a] = i + 1 >= buf.length ? 0 : i + 1;
    }
    return y;
  }
  // Buchla Music Easel (EngineParams `easel`): its own sound path, run in place of the oscillators, mixer, filter and VCA.
  let ezNote = 60,
    ezGap = 0,
    ezPress = 0,
    ezPulsePrev = 0,
    ezFire = 0;
  let ezCPh = Math.random(),
    ezMPh = Math.random();
  let ezPul = 0,
    ezPulRun = false,
    ezPulEnd = false,
    ezSeqSt = 0,
    ezSeqP = false;
  let ezEnv = 0,
    ezEnvSt = 0,
    ezEnvT = 0,
    ezArpWait = 0,
    ezArpPos = 0,
    ezArpNote = -1;
  const ezRnd = new Float64Array(4).map(() => Math.random());
  const ezVA = new Float64Array(2),
    ezVF = new Float64Array(2),
    ezI1 = new Float64Array(2),
    ezI2 = new Float64Array(2);
  // the slider law printed on the Easel's time scales: 10 s at 0, 3.5 at 2, 1 at 4, .2 at 6, .025 at 8 and .002 s at 10
  const EZ_T = [
    Math.log(10),
    Math.log(3.5),
    Math.log(1),
    Math.log(0.2),
    Math.log(0.025),
    Math.log(0.002),
  ];
  const ezTime = (v: number): number => {
    const x = v < 0 ? 0 : v > 10 ? 10 : v;
    const k = x >= 10 ? 4 : Math.floor(x / 2);
    return Math.exp(EZ_T[k] + (EZ_T[k + 1] - EZ_T[k]) * (x / 2 - k));
  };
  // Moog 900-series modular (EngineParams `moog`): its own sound path of separate modules, see moog-core.js.
  const moog = createMoog(sr, S, SI, DI, (d) => ev(d), cabled);
  // phrase player
  let phrase: VoicePhrase | null = null,
    phrasePos = 0,
    phraseIdx = 0;
  const phraseHeld = new Set<number>();

  const sm = 1 - Math.exp(-1 / (0.004 * sr)); // 4 ms parameter smoothing
  const curveP = (c: number): number => Math.pow(2, (Math.min(Math.max(c, 0), 1) - 0.5) * 4);
  const expCoef = (t: number): number => 1 - Math.exp(-1 / (Math.max(t, 0.0005) * sr));

  function compile() {
    destSrc = DESTS.map(() => []);
    destAmt = DESTS.map(() => []);
    destBy = DESTS.map(() => []);
    normSig.fill(-1);
    normAmt.fill(1);
    cabled.fill(0);
    const normals: Record<string, NormalSource> = { ...BUILTIN_NORMALS, ...(P!.normals || {}) };
    for (const [d, val] of Object.entries(normals)) {
      if (!(d in DI) || val == null) continue;
      const sig = Array.isArray(val) ? val[0] : val;
      if (!(sig in SI)) continue;
      normSig[DI[d]] = SI[sig];
      normAmt[DI[d]] = Array.isArray(val) ? val[1] : 1;
    }
    const need = new Set<number>();
    for (const c of P!.cables || []) {
      if (!(c.src in SI) || !(c.dst in DI)) continue;
      const d = DI[c.dst];
      if (!c.add) normSig[d] = -1;
      cabled[d] = 1;
      // `x`: the cable comes from the other voice of a dual synth, so it reads that voice's copy (see link())
      if (c.x) need.add(SI[c.src]);
      destSrc[d].push(c.x ? NS + SI[c.src] : SI[c.src]);
      destAmt[d].push(c.amt);
      destBy[d].push(-1);
    }
    xNeed = Array.from(need);
    for (const r of P!.routes || []) {
      if (!(r.src in SI) || !(r.dst in DI)) continue;
      destSrc[DI[r.dst]].push(SI[r.src]);
      destAmt[DI[r.dst]].push(r.amt);
      // `by`: the route's depth is scaled by a second signal (Jupiter-6 CROSS MOD ENV-1: Envelope 1 opens the cross mod)
      destBy[DI[r.dst]].push(r.by && r.by in SI ? SI[r.by] : -1);
    }
  }

  function setParams(p: VoiceParams) {
    const first = !P;
    P = p;
    compile();
    if (p.moog) moog.set(p.moog, new Set((p.cables || []).map((c) => c.src)));
    nOsc = Math.min(4, p.osc.length);
    for (let i = 0; i < 4; i++) {
      const o = osc[i];
      const q = p.osc[i];
      if (!q) {
        o.on = false;
        o.levelT = 0;
        continue;
      }
      const m: OscMix = q.mix || {};
      o.tri = m.tri || 0;
      o.shark = m.shark || 0;
      o.saw = m.saw || 0;
      o.rsaw = m.rsaw || 0;
      o.pulse = m.pulse || 0;
      o.sine = m.sine || 0;
      o.tmod = m.tmod || 0;
      o.notch = m.notch || 0;
      o.sub = m.sub || 0;
      // `subLevel` (Model 15): the sub square goes straight into the mixer at this level, not into the oscillator's own output
      o.subL = q.subLevel || 0;
      o.on = true;
      o.levelT = q.level || 0;
      o.pwT = q.pw == null ? 0.5 : q.pw;
      // `morph` 0..1 (Kobol): one continuous waveform control, triangle → sawtooth → square → narrowing pulse with PWM
      o.mo = q.morph != null;
      o.morphT = o.mo ? q.morph! : 0;
      o.semiT = q.semi || 0;
      o.kbd = q.kbd !== false;
      o.fixed = q.fixedNote == null ? 60 : q.fixedNote;
      o.syncTo = q.syncTo == null ? -1 : q.syncTo;
      // `syncGate` (CAT SYNC MODE A): as well as the hard sync, the oscillator is silent for the second half of each master cycle
      o.syncGate = !!q.syncGate;
      // `skew` 0..1 (VCS3 SHAPE): the triangle output rises for that share of the cycle, so it leans into a ramp either
      // side of 0.5. `sineShape` −1..1 (VCS3 Oscillator 1 SHAPE): the sine output folds towards a rectified sine.
      o.skewT = q.skew == null ? -1 : Math.min(Math.max(q.skew, 0.005), 0.995);
      if (first || o.skew < 0 || o.skewT < 0) o.skew = o.skewT;
      o.sineShape = q.sineShape || 0;
      if (first || !o.mo) o.morph = o.morphT;
      if (first) {
        o.level = o.levelT;
        o.pw = o.pwT;
        o.semi = o.semiT;
      }
    }
    cutLogT = Math.log(Math.min(Math.max(p.filter.cutoff, 10), 20000));
    resT = p.filter.res || 0;
    hpLogT = Math.log(Math.min(Math.max(p.hpf ? p.hpf.cutoff : 20, 10), 20000));
    hpResT = (p.hpf && p.hpf.res) || 0;
    volT = p.volume == null ? 0.7 : p.volume;
    noiseLT = p.noise ? p.noise.level : 0;
    wheel = p.wheel || 0;
    [p.env1, p.env2, p.env3].forEach((e, i) => {
      if (!e) return;
      const t = env[i];
      t.a = e.a;
      t.d = e.d;
      t.s = e.s;
      t.r = e.r;
      // `curve` { a, d, r } 0..1 (0.5 = straight line, lower = fast start, higher = slow start) switches the envelope to
      // timed stages that last exactly a / d / r seconds, as on the DeepMind. Without it, the RC-style curves below.
      t.curved = !!e.curve;
      if (e.curve) {
        t.pa = curveP(e.curve.a);
        t.pd = curveP(e.curve.d);
        t.pr = curveP(e.curve.r);
      }
      // `kf` (Jupiter KEY FOLLOW): the times shorten on higher notes, halving every two octaves above middle C at kf 1
      // (and lengthening below it). The note is taken at each key; see envTimes().
      t.kf = e.kf || 0;
      t.ba = e.a;
      t.bd = e.d;
      t.br = e.r;
      envTimes(t);
      t.dlyN = Math.round((e.dly || 0) * sr);
      t.holdN = Math.round((e.hold || 0) * sr);
      // `loop` (Wasp REPEAT): while the gate is held the envelope runs attack, decay to silence, attack again, and so on.
      // `freeze` (Wasp HOLD): the level stops where it is; gate changes are still noted, so the envelope carries on when it thaws.
      t.loop = !!e.loop;
      t.freeze = !!e.freeze;
    });
    if (first) {
      cutLog = cutLogT;
      res = resT;
      vol = volT;
      hpLog = hpLogT;
      hpRes = hpResT;
    }
  }

  /** An envelope's stage times and coefficients, scaled by its key follow for the note it was last started on. */
  function envTimes(t: VoiceEnv) {
    const m = t.kf ? Math.pow(2, (-t.kf * (t.kfNote - 60)) / 24) : 1;
    t.a = t.ba * m;
    t.d = t.bd * m;
    t.r = t.br * m;
    t.ca = expCoef(t.a / 1.6);
    t.cd = expCoef(t.d / 3.2);
    t.cr = expCoef(t.r / 3.2);
    t.cdBase = t.cd;
  }

  function noteOn(n: number, v?: number) {
    if (!P) return;
    for (let k = 0; k < 3; k++)
      if (env[k].kf) {
        env[k].kfNote = n;
        envTimes(env[k]);
      }
    const i = held.indexOf(n);
    if (i >= 0) held.splice(i, 1);
    const wasHeld = held.length > 0;
    held.push(n);
    vel = v == null ? 0.8 : v;
    if (P.acid) accOn = vel >= (P.acid.thresh || 0.9) || !!P.acid.force;
    if (P.oscAssign) assignOscs(n);
    assignNotes(wasHeld);
    if (!wasHeld || P.trig.retrig) retrigFlag = true;
    gate = 1;
    if (!part && onEvent) onEvent({ type: 'note', n, on: true });
  }
  function noteOff(n: number) {
    const i = held.indexOf(n);
    if (i < 0) return;
    held.splice(i, 1);
    if (P!.oscAssign) releaseOsc(n);
    if (held.length) assignNotes(true);
    else gate = 0;
    if (!part && onEvent) onEvent({ type: 'note', n, on: false });
  }
  function assignNotes(legato: boolean) {
    const top = held[held.length - 1];
    const second = held.length > 1 ? held[held.length - 2] : top;
    if (P!.duo) {
      // duophonic keyboard: the main pitch is the lowest key held, `kbd2` the highest
      noteT = top;
      note2T = top;
      for (let i = 0; i < held.length; i++) {
        if (held[i] < noteT) noteT = held[i];
        if (held[i] > note2T) note2T = held[i];
      }
    } else {
      noteT = top;
      note2T = P!.paraphonic ? second : top;
    }
    // with a note per oscillator, filter tracking follows the note Oscillator 1 is playing
    if (P!.oscAssign && slotKey[0] >= 0) noteT = slotKey[0];
    const glides = P!.glide.time > 0.001 && (!P!.glide.legato || legato);
    if (!glides) {
      note = noteT;
      note2 = note2T;
      slotN.set(slotNT);
    }
  }
  /** The oscillators that take part in `oscAssign`: switched in and following the keyboard. */
  function assignable() {
    const ks: number[] = [];
    for (let k = 0; k < nOsc; k++) if (osc[k].on && osc[k].kbd) ks.push(k);
    return ks;
  }
  function giveSlot(k: number, n: number) {
    slotKey[k] = n;
    slotHeld[k] = 1;
    slotT[k] = ++slotClock;
    slotNT[k] = n;
    slotGT[k] = 1;
  }
  /**
   * `oscAssign.mode` 'poly': each new key takes the next free oscillator in rotation, starting after the one that took the
   * last key (the Korg Mono/Poly's logic), so even single notes step round the oscillators; when all are busy the oldest
   * note is taken over. 'unison': the keys held (the newest four) are dealt out round the oscillators, so one key gets
   * all of them, two keys two each, four keys one each.
   */
  function assignOscs(n: number) {
    const ks = assignable();
    if (!ks.length) return;
    if (P!.oscAssign!.mode === 'unison') {
      dealUnison(ks);
      return;
    }
    let pick = ks.find((k) => slotKey[k] === n && slotHeld[k]);
    if (pick == null) {
      // a let-go note rings on (without AUTO DAMP) until the next new note, which silences it
      for (let k = 0; k < 4; k++)
        if (!slotHeld[k]) {
          slotKey[k] = -1;
          slotGT[k] = 0;
        }
      const from = ks.findIndex((k) => k > slotLast);
      const order = from < 0 ? ks : [...ks.slice(from), ...ks.slice(0, from)];
      pick = order.find((k) => slotKey[k] < 0);
      if (pick == null) pick = ks.reduce((a, k) => (slotT[k] < slotT[a] ? k : a), ks[0]);
    }
    slotLast = pick;
    giveSlot(pick, n);
  }
  function dealUnison(ks: number[]) {
    const keys = held.slice(-4);
    if (!keys.length) return;
    ks.forEach((k, i) => {
      const n = keys[i % keys.length];
      if (slotKey[k] !== n) giveSlot(k, n);
      else {
        slotHeld[k] = 1;
        slotGT[k] = 1;
      }
    });
  }
  function releaseOsc(n: number) {
    if (P!.oscAssign!.mode === 'unison') {
      if (held.length) dealUnison(assignable());
      else slotHeld.fill(0);
      return;
    }
    for (let k = 0; k < 4; k++) {
      if (slotKey[k] !== n) continue;
      slotHeld[k] = 0;
      // AUTO DAMP: a let-go note stops at once while other keys are held. The last key lets go through the envelope.
      if (P!.oscAssign!.damp && held.length) {
        slotKey[k] = -1;
        slotGT[k] = 0;
      }
    }
  }
  function panic() {
    held.length = 0;
    gate = 0;
    phraseHeld.clear();
    slotKey.fill(-1);
    slotHeld.fill(0);
    slotGT.fill(0);
    slotLast = -1;
    if (onEvent) onEvent({ type: 'allOff' });
  }
  // A step may carry a velocity as its fourth item (the 303's accented steps). Times are kept in beats too, so a
  // `tempo` message can move the riff to a new BPM while it plays (the TB-303's TEMPO knob).
  function setPhrase(ph: Phrase | null) {
    stopPhrase(true);
    if (!ph || !ph.steps || !ph.steps.length) return;
    const evs: VoicePhraseEvent[] = [];
    let end = 0;
    for (const [b, n, len, v] of ph.steps) {
      evs.push({ b, on: true, n, v: v == null ? 0.85 : v });
      evs.push({ b: b + len, on: false, n });
      end = Math.max(end, b + len);
    }
    evs.sort((x, y) => x.b - y.b || (x.on ? 1 : 0) - (y.on ? 1 : 0));
    const beats = Math.max(1, Math.ceil(end - 0.001));
    phrase = { evs, beats, len: 0, loop: ph.loop !== false, transpose: ph.transpose || 0 };
    phraseTiming(ph.bpm);
    phrasePos = 0;
    phraseIdx = 0;
  }
  function phraseTiming(bpm: number) {
    const spb = (60 / bpm) * sr;
    const old = phrase!.len;
    for (const e of phrase!.evs) e.t = Math.round(e.b * spb);
    phrase!.len = Math.round(phrase!.beats * spb);
    if (old) phrasePos = Math.min(Math.round((phrasePos * phrase!.len) / old), phrase!.len - 1);
  }
  function stopPhrase(silent?: boolean) {
    if (!phrase) return;
    phrase = null;
    for (const n of Array.from(phraseHeld)) noteOff(n);
    phraseHeld.clear();
    if (!silent && onEvent) onEvent({ type: 'phraseEnd' });
  }

  function handle(m: VoiceMessage) {
    switch (m.type) {
      case 'params':
        setParams(m.p);
        break;
      case 'noteOn':
        noteOn(m.n, m.v);
        break;
      case 'noteOff':
        noteOff(m.n);
        break;
      case 'phrase':
        setPhrase(m.phrase);
        break;
      case 'tempo':
        if (phrase && m.bpm > 0) phraseTiming(m.bpm);
        break;
      case 'stopPhrase':
        stopPhrase(true);
        break;
      case 'panic':
        stopPhrase(true);
        panic();
        break;
      case 'offset':
        vOff = m.semi || 0;
        break;
      case 'phase':
        lfoPhase = m.lfo || 0;
        lfo2.phase = m.lfo2 || 0;
        break;
      default:
        break;
    }
  }

  const blep = (t: number, dt: number): number => {
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  };

  /** Timed stages with a shaped curve: each stage runs from where the level is to its target in exactly its time. */
  function runEnvC(e: VoiceEnv, g: boolean) {
    if ((g && !e.prevGate) || (g && retrigFlag)) {
      e.stage = 1;
      e.t = 0;
      e.from = e.level;
    } else if (!g && e.prevGate && e.stage !== 0) {
      e.stage = 4;
      e.t = 0;
      e.from = e.level;
    }
    e.prevGate = g;
    switch (e.stage) {
      case 1:
        e.t! += 1 / (Math.max(e.a, 0.0002) * sr);
        if (e.t! >= 1) {
          e.level = 1;
          e.stage = 2;
          e.t = 0;
        } else e.level = e.from! + (1 - e.from!) * Math.pow(e.t!, e.pa!);
        break;
      case 2:
        e.t! += 1 / (Math.max(e.d, 0.0005) * sr);
        if (e.t! >= 1) {
          e.level = e.s;
          e.stage = 3;
        } else e.level = e.s + (1 - e.s) * (1 - Math.pow(e.t!, e.pd!));
        break;
      case 3:
        e.level += (e.s - e.level) * sm;
        break;
      case 4:
        e.t! += 1 / (Math.max(e.r, 0.0005) * sr);
        if (e.t! >= 1) {
          e.level = 0;
          e.stage = 0;
        } else e.level = e.from! * (1 - Math.pow(e.t!, e.pr!));
        break;
      default:
        break;
    }
    return e.level;
  }

  function runEnv(e: VoiceEnv, g: boolean) {
    if (e.curved) return runEnvC(e, g);
    if ((g && !e.prevGate) || (g && retrigFlag)) {
      e.stage = e.dlyN > 0 ? 5 : 1;
      e.wait = e.dlyN;
    } else if (!g && e.prevGate) e.stage = 4;
    e.prevGate = g;
    if (e.freeze) return e.level;
    switch (e.stage) {
      case 5: // `dly`: wait before the attack starts (K-2 EG1 DELAY TIME)
        if (--e.wait <= 0) e.stage = 1;
        break;
      case 1:
        e.level += (1.25 - e.level) * e.ca;
        if (e.level >= 1) {
          e.level = 1;
          e.stage = e.holdN > 0 ? 6 : 2;
          e.wait = e.holdN;
        }
        break;
      case 6: // `hold`: stay at the peak before the decay (K-2 EG2 HOLD TIME)
        if (--e.wait <= 0) e.stage = 2;
        break;
      case 2:
        if (e.loop) {
          e.level += (0 - e.level) * e.cd;
          if (e.level < 0.01) e.stage = 1;
        } else e.level += (e.s - e.level) * e.cd;
        break;
      case 4:
        e.level += (0 - e.level) * e.cr;
        if (e.level < 0.00002) {
          e.level = 0;
          e.stage = 0;
        }
        break;
      default:
        break;
    }
    return e.level;
  }

  /**
   * The VCS3 trapezoid (EngineParams `trap` { a, on, d, off, auto, hold }), which replaces Envelope 1. Four timed stages:
   * a linear rise over `a`, full for `on`, a linear fall over `d` (scaled by 2^decayCv), silent for `off`, and round
   * again while `auto` is on. Without `auto` it stops after the fall and waits; a key (or `hold`, the ATTACK button)
   * starts it, and then ON lasts at least `on` and for as long as the key or button is held. Signal `trap` is the
   * printed trapezoid, 1 − 2 × the level: it swings negative while the envelope is up.
   */
  function runTrap(t: TrapParams) {
    const g = gate > 0.5 || !!t.hold;
    if (g && !trapPrevG) {
      trapSt = 1;
      trapT = 0;
    }
    trapPrevG = g;
    switch (trapSt) {
      case 0:
        if (t.auto) trapSt = 1;
        break;
      case 1:
        trapLvl += 1 / (Math.max(t.a, 0.0005) * sr);
        if (trapLvl >= 1) {
          trapLvl = 1;
          trapSt = 2;
          trapT = 0;
        }
        break;
      case 2:
        trapT += 1 / sr;
        if (trapT >= t.on && (t.auto || !g)) trapSt = 3;
        break;
      case 3: {
        let dm = Math.exp(ev(DI.decayCv) * Math.LN2);
        dm = dm < 1 / 64 ? 1 / 64 : dm > 64 ? 64 : dm;
        trapLvl -= 1 / (Math.max(t.d * dm, 0.0005) * sr);
        if (trapLvl <= 0) {
          trapLvl = 0;
          trapSt = 4;
          trapT = 0;
        }
        break;
      }
      case 4:
        if (!t.auto) {
          trapSt = 0;
          break;
        }
        trapT += 1 / sr;
        if (trapT >= t.off) trapSt = 1;
        break;
      default:
        break;
    }
    return trapLvl;
  }

  /**
   * One sample of the Buchla Music Easel (EngineParams `easel`, see CONTRACT.md). Control voltages are 0..1 for the
   * Easel's 0..10. `hitKey` = a key was touched this sample. Writes the Easel's signals and `ezMix`, the mix of the two
   * lowpass gates, which the output stage hears through the `dryIn` and `revIn` normals.
   */
  function easelStep(ez: EaselParams, hitKey: boolean) {
    // ── 218: the keyboard, with its arpeggiator ──
    let key = noteT;
    if (ez.arp && ez.arp.on && held.length) {
      if (--ezArpWait <= 0) {
        ezArpWait = Math.max(1, Math.round(sr / Math.max(ez.arp.rate, 0.05)));
        const ks = held.slice().sort((a, b) => a - b);
        ezArpNote =
          ez.arp.mode === 'random'
            ? ks[Math.floor(Math.random() * ks.length)]
            : ks[ezArpPos++ % ks.length];
        hitKey = true;
      }
      key = ezArpNote < 0 ? noteT : ezArpNote;
    } else {
      ezArpWait = 0;
      ezArpPos = 0;
      ezArpNote = -1;
    }
    // the pulse drops out for 2 ms at each new touch, so a following key is a new pulse even when played legato
    if (hitKey) ezGap = Math.round(0.002 * sr);
    S[SI.kpulse] = gate && ezGap <= 0 ? 1 : 0;
    if (ezGap > 0) ezGap--;
    // portamento: SLOPE sets the longest glide (linear); a voltage at its input shortens it, by 6 octaves of time at full scale
    const gt =
      ez.porta * (cabled[DI.portaIn] ? Math.exp(-6 * Math.LN2 * Math.max(0, ev(DI.portaIn))) : 1);
    const step = gt < 0.001 ? 99 : 28 / (gt * sr);
    ezNote += key > ezNote ? Math.min(step, key - ezNote) : -Math.min(step, ezNote - key);
    S[SI.keyv] = (ezNote - 48 + (ez.add || 0)) / 28;
    const pt = gate ? vel : 0;
    ezPress += (pt - ezPress) * (pt > ezPress ? 0.004 : 0.0004) * (48000 / sr);
    S[SI.press] = ezPress;
    S[SI.preset] = ez.preset || 0;
    // ── 208: the three keyboard inputs ──
    const pin = ev(DI.ezPulse);
    const hit = pin > 0.5 && ezPulsePrev <= 0.5;
    ezPulsePrev = pin;
    const kGate = pin > 0.5;
    S[SI.pressV] = ev(DI.ezPress);
    const kv = ev(DI.ezPitch);
    // ── pulser: a falling ramp, and a trigger when it reaches the bottom ──
    const pu = ez.pulser;
    const fire = (pu.fire || 0) !== ezFire;
    ezFire = pu.fire || 0;
    const prevEnd = ezPulEnd;
    ezPulEnd = false;
    if (pu.mode !== 'off') {
      const t =
        fire ||
        (pu.trig === 'kbd' ? hit : pu.trig === 'seq' ? ezSeqP : false) ||
        (pu.trig === 'self' && !ezPulRun && !prevEnd);
      if (t) {
        ezPul = 1;
        ezPulRun = true;
      }
    }
    if (ezPulRun) {
      ezPul -= 1 / (ezTime(pu.v + ev(DI.period) * 10) * sr);
      if (ezPul <= 0) {
        ezPul = 0;
        ezPulRun = false;
        ezPulEnd = true;
        if (
          pu.mode !== 'off' &&
          (pu.trig === 'self' || (pu.mode === 'sus' && pu.trig === 'kbd' && kGate))
        ) {
          ezPul = 1;
          ezPulRun = true;
        }
      }
    }
    S[SI.pulser] = ezPul;
    // ── sequential voltage source ──
    const sq = ez.seq;
    ezSeqP = false;
    if (sq.trig === 'kbd' ? hit : sq.trig === 'pulser' ? ezPulEnd : false) {
      ezSeqSt = (ezSeqSt + 1) % sq.stages;
      ezSeqP = !!sq.pulses[ezSeqSt];
    }
    if (ezSeqSt >= sq.stages) ezSeqSt = 0;
    S[SI.seq] = sq.levels[ezSeqSt];
    // ── random voltage source: four new levels on each trigger ──
    const rt = ez.rvs.trig;
    if (rt === 'kbd' ? hit : rt === 'pulser' ? ezPulEnd : rt === 'seq' ? ezSeqP : false)
      for (let r = 0; r < 4; r++) ezRnd[r] = Math.random();
    S[SI.rnd1] = ezRnd[0];
    S[SI.rnd2] = ezRnd[1];
    S[SI.rnd3] = ezRnd[2];
    S[SI.rnd4] = ezRnd[3];
    // ── envelope generator: attack, sustain (held, or timed), decay ──
    const en = ez.env;
    const et = en.trig === 'kbd' ? hit : en.trig === 'pulser' ? ezPulEnd : ezSeqP;
    if (et || (en.mode === 'self' && ezEnvSt === 0)) {
      ezEnvSt = 1;
      ezEnvT = 0;
    }
    switch (ezEnvSt) {
      case 1:
        ezEnv += 1 / (ezTime(en.a + ev(DI.envA) * 10) * sr);
        if (ezEnv >= 1) {
          ezEnv = 1;
          ezEnvSt = 2;
          ezEnvT = 0;
        }
        break;
      case 2:
        if (en.mode === 'sus') {
          if (!(en.trig === 'kbd' && kGate)) ezEnvSt = 3;
        } else {
          ezEnvT += 1 / sr;
          if (ezEnvT >= ezTime(en.s + ev(DI.envS) * 10)) ezEnvSt = 3;
        }
        break;
      case 3:
        ezEnv *= Math.exp(-4.6 / (ezTime(en.d + ev(DI.envD) * 10) * sr));
        if (ezEnv < 1e-4) {
          ezEnv = 0;
          ezEnvSt = 0;
        }
        break;
      default:
        break;
    }
    S[SI.env1] = ezEnv;
    S[SI.inv10] = 1 - ev(DI.inv10In);
    // ── modulation oscillator ──
    const mo = ez.mosc;
    let mhz = mo.hz * Math.exp(((mo.kbd ? 28 * kv : 0) + ev(DI.pitch2)) * LN2_12);
    // the f.m. in jack: outside audio frequency-modulates this oscillator, at the depth of its f.m. in knob
    if (cabled[DI.fmIn]) mhz *= 1 + ev(DI.fmIn) * (mo.fmIn || 0);
    const mdt = (mhz < 0 ? 0 : Math.min(mhz, sr * 0.45)) / sr;
    ezMPh += mdt;
    if (ezMPh >= 1) ezMPh -= Math.floor(ezMPh);
    let m;
    if (mo.wave === 'saw') m = 2 * ezMPh - 1 - blep(ezMPh, mdt);
    else if (mo.wave === 'sq') {
      let p2 = ezMPh - 0.5;
      if (p2 < 0) p2 += 1;
      m = (ezMPh < 0.5 ? 1 : -1) + blep(ezMPh, mdt) - blep(p2, mdt);
    } else m = ezMPh < 0.5 ? 4 * ezMPh - 1 : 3 - 4 * ezMPh;
    S[SI.osc2] = m;
    let idx = mo.index + ev(DI.index);
    idx = idx < 0 ? 0 : idx > 1 ? 1 : idx;
    // ── complex oscillator ──
    const co = ez.cosc;
    let hz =
      440 * Math.exp((co.note + (co.kbd ? 28 * kv : 0) + co.sign * ev(DI.pitch1) - 69) * LN2_12);
    // FM: at INDEX .2 about a semitone either way; near 1 the frequency swings through zero and the centre pitch is lost
    if (mo.mode === 'fm') hz *= 1 + 1.5 * idx * idx * m;
    hz = hz > sr * 0.45 ? sr * 0.45 : hz < -sr * 0.45 ? -sr * 0.45 : hz;
    const cdt = hz / sr;
    ezCPh += cdt;
    if (ezCPh >= 1) ezCPh -= 1;
    else if (ezCPh < 0) ezCPh += 1;
    const adt = cdt < 0 ? -cdt : cdt;
    let tb = co.timbre + ev(DI.fold);
    tb = tb < 0 ? 0 : tb > 1 ? 1 : tb;
    // TIMBRE: a folder on the sine and the triangle, which adds harmonics instead of taking them away
    const fk = tb * 3 > 1 ? 1 : tb * 3,
      fg = (Math.PI / 2) * (1 + 5 * tb);
    const fold = (x: number): number => (tb < 0.001 ? x : x * (1 - fk) + Math.sin(fg * x) * fk);
    const sine = Math.sin(TWO_PI * ezCPh);
    let w;
    if (co.wave === 'sq') {
      let p2 = ezCPh - 0.5;
      if (p2 < 0) p2 += 1;
      w = (ezCPh < 0.5 ? 1 : -1) + blep(ezCPh, adt) - blep(p2, adt);
    } else if (co.wave === 'spike') {
      // a narrow peak once a cycle, with its average taken off
      const q = 0.5 + 0.5 * Math.cos(TWO_PI * ezCPh);
      const q2 = q * q,
        q4 = q2 * q2;
      w = (q4 * q4 * q4 - 0.161) * 2.4;
    } else w = fold(ezCPh < 0.5 ? 4 * ezCPh - 1 : 3 - 4 * ezCPh);
    let c = fold(sine) * (1 - co.shape) + w * co.shape;
    // AM: a tremolo deepening into ring modulation at INDEX 1, where only the sidebands are left
    if (mo.mode === 'am') c *= 1 - idx + idx * m;
    S[SI.osc1] = c;
    S[SI.o1sine] = sine;
    S[SI.ezBal] = S[SI.preamp] * (1 - idx + idx * m);
    // ── dual lowpass gate: vactrols, quick to open and slow to close, the filter element slower than the amplifier ──
    for (let g = 0; g < 2; g++) {
      const gp = ez.gates[g];
      const x = ev(g ? DI.lpg2In : DI.lpg1In);
      let cv = gp.level + ev(g ? DI.gate2Lvl : DI.gate1Lvl);
      cv = cv < 0 ? 0 : cv > 1.2 ? 1.2 : cv;
      const a = ezVA[g],
        f = ezVF[g];
      ezVA[g] = a + (cv - a) * (cv > a ? 0.02 : 0.0003 * (0.3 + a)) * (48000 / sr);
      ezVF[g] = f + (cv - f) * (cv > f ? 0.008 : 0.00012 * (0.3 + f)) * (48000 / sr);
      const gain = gp.mode === 'lp' ? 1 : Math.pow(ezVA[g], 1.4);
      let y = x;
      if (gp.mode !== 'vca') {
        let fc = 25 * Math.exp(9.6 * Math.LN2 * ezVF[g]);
        fc = fc > sr * 0.42 ? sr * 0.42 : fc;
        const gg = Math.tan((Math.PI * fc) / sr),
          kq = 1.5;
        const a1 = 1 / (1 + gg * (gg + kq)),
          a2 = gg * a1,
          a3 = gg * a2;
        const v3 = x - ezI2[g];
        const bp = a1 * ezI1[g] + a2 * v3;
        const lp = ezI2[g] + a2 * ezI1[g] + a3 * v3;
        ezI1[g] = 2 * bp - ezI1[g];
        ezI2[g] = 2 * lp - ezI2[g];
        y = lp;
      }
      // a gate turns its signal upside down, so a gate mixed with what it was fed partly cancels it
      S[g ? SI.lpg2 : SI.lpg1] = -y * gain;
    }
    S[SI.ezMix] = ez.mix[0] * S[SI.lpg1] + ez.mix[1] * S[SI.lpg2];
    S[SI.noise] = Math.random() * 2 - 1;
  }

  /** Gate for envelope k when the SynthDef picks each envelope's source (`trig.src`): 'gate' | 'trig' | 'sh'. */
  function gateFor(tr: TrigParams, k: number, src: EnvTrigSource, rep: boolean, sqV: number) {
    if (tr.drone) return true;
    if (tr.auto) return sqV > 0;
    let on;
    if (src === 'sh') on = ev(DI.envClk) > 0.5;
    else if (src === 'trig') {
      // a trigger fires the envelope for just long enough to finish its attack, however long the key is held
      const t = ev(DI.trigIn);
      if ((t > 0.5 && trigPrev[k] <= 0.5) || (retrigFlag && !cabled[DI.trigIn]))
        trigCnt[k] = Math.max(0.004, env[k].a * 1.05) * sr + 1;
      trigPrev[k] = t;
      on = trigCnt[k] > 0;
      if (trigCnt[k] > 0) trigCnt[k]--;
    } else {
      // A per-envelope gate jack (dest gate1 / gate2) fires just its own envelope, separately from the keyboard —
      // the MS-20's EG1 TRIG IN. Those dests are normalled to the key gate, so with nothing patched there is
      // nothing to tell apart and the shared gate input is what counts.
      const own = k === 0 ? DI.gate1 : DI.gate2;
      on = cabled[own] ? ev(own) > 0.5 : ev(DI.gateIn) > 0.5;
    }
    return on && rep;
  }

  function process(out: Float32Array, n: number, outR?: Float32Array) {
    if (!P) {
      out.fill(0);
      if (outR) outR.fill(0);
      return;
    }
    const p = P;
    const f = p.filter;
    const ladder = f.type !== 'svf';
    const morph = f.morph == null ? 0 : f.morph < 0 ? 0 : f.morph > 1 ? 1 : f.morph;
    const glideC = expCoef(Math.max(p.glide.time, 0.001) / 3);
    const lm: LfoMix = p.lfo.mix || {};
    const lTri = lm.tri || 0,
      lSaw = lm.saw || 0,
      lRsaw = lm.rsaw || 0,
      lSq = lm.sq || 0,
      lSine = lm.sine || 0;
    const envSrcIdx = SI[f.envSrc] == null ? SI.env1 : SI[f.envSrc];
    const vcaSrcIdx = p.vca.envSrc && p.vca.envSrc !== 'none' ? SI[p.vca.envSrc] : -1;
    const od: Partial<OverdriveParams> = p.od || {},
      dl: Partial<DelayParams> = p.delay || {},
      sh: Partial<SampleHoldParams> = p.sh || {},
      att = p.att || [1, 1];
    const shGlideC = expCoef(Math.max(sh.glide || 0, 0.0005));
    const slewC = expCoef(Math.max((p.slew && p.slew.time) || 0.001, 0.0005) / 2);
    const odToneC = 1 - Math.exp((-TWO_PI * 900) / sr);
    const dlLpC = 1 - Math.exp((-TWO_PI * 3200) / sr);
    const dlTimeC = expCoef(0.12);
    const vcaC = expCoef(0.0012);
    const dOn = !!dl.on,
      odOn = !!od.on;
    const shExt = cabled[DI.shClock];
    const att1CvOn = cabled[DI.att1CV];
    const outs = !!p.oscOuts,
      pwSplit = !!p.pwSplit;
    const fDrive = f.drive == null ? 0.8 : f.drive;
    const hpf = p.hpf;
    const hpEnvIdx = hpf && SI[hpf.envSrc] != null ? SI[hpf.envSrc] : SI.env1;
    const hpEnvAmt = hpf ? hpf.envAmt || 0 : 0;
    const hpKbd = hpf ? hpf.kbd || 0 : 0;
    const nzp: Partial<NoiseParams> = p.noise || {};
    const nzTone = nzp.tone == null ? -1 : nzp.tone;
    const nzGain = nzp.gain == null ? 1 : nzp.gain;
    const vibDelay = p.lfo.vibDelay || 0,
      vibDepth = p.lfo.vibDepth == null ? 1 : p.lfo.vibDepth;
    const trigSrc = p.trig.src || null;
    const ringAc = !!(p.ring && p.ring.ac);
    const ringAcB = !!(p.ring && p.ring.acB);
    const nTilt = nzp.tilt || 0;
    const tp = p.trap || null;
    const jy = p.joy || null;
    const oa = p.outAmps || null;
    const oaLpC = [0, 0],
      oaHpC = [0, 0],
      oaPanT = [0, 0, 0, 0];
    if (oa) {
      for (let c = 0; c < 2; c++) {
        const t = oa[c].tone || 0;
        // OUTPUT FILTER: left of centre a treble cut down to about 400 Hz, right of centre a bass cut up to about 1.2 kHz
        oaLpC[c] = t < 0 ? 1 - Math.exp((-TWO_PI * 18000 * Math.pow(400 / 18000, -t)) / sr) : 1;
        oaHpC[c] = t > 0 ? 1 - Math.exp((-TWO_PI * 20 * Math.pow(60, t)) / sr) : 0;
        const a = (Math.min(Math.max(oa[c].pan == null ? c : oa[c].pan, 0), 1) * Math.PI) / 2;
        oaPanT[c * 2] = Math.cos(a);
        oaPanT[c * 2 + 1] = Math.sin(a);
      }
    }
    const preGain = (p.preamp && p.preamp.gain) || 0;
    const efSens = p.envf && p.envf.sens != null ? p.envf.sens : 1;
    const rv: Partial<ReverbParams> = p.rev || {};
    const rvUnit = !!rv.unit;
    // `subOut` (Model 15): signal `sub` is Oscillator 2's sub-octave square, whatever the mixer does with it
    const subOut = !!p.subOut;
    // `hp6` (Model 15): a separate 6 dB high-pass utility, dest `hp6In` → signal `hp6`
    const hp6C = p.hp6
      ? 1 - Math.exp((-TWO_PI * Math.min(Math.max(p.hp6.cutoff || 20, 5), sr * 0.4)) / sr)
      : 0;
    const rvOn = !!rv.on,
      rvMix = rv.mix || 0,
      rvFb = rv.decay == null ? 0.82 : rv.decay,
      rvDamp = rv.damp == null ? 0.4 : rv.damp;
    // DeepMind extras, all off unless set
    const lShM = lm.sh || 0,
      lShgM = lm.shg || 0,
      lShOn = lShM !== 0 || lShgM !== 0;
    const shgC1 = lShOn ? expCoef(0.3 / Math.max(p.lfo.rate, 0.01)) : 0;
    const lDly = p.lfo.delay || 0;
    const L2 = p.lfo2 || null;
    const m2: LfoMix | null = L2 ? L2.mix || {} : null;
    const l2Sh = L2 ? (m2!.sh || 0) !== 0 || (m2!.shg || 0) !== 0 : false;
    const shgC2 = l2Sh ? expCoef(0.3 / Math.max(L2!.rate, 0.01)) : 0;
    const l2Dly = L2 ? L2.delay || 0 : 0;
    const fadeOf = (t: number, D: number): number =>
      t < 0.4 * D ? 0 : t >= D ? 1 : (t - 0.4 * D) / (0.6 * D);
    const dAmt = p.drift ? p.drift.depth || 0 : 0;
    const dPer = dAmt > 0 ? Math.max(1, Math.round((p.drift!.rate || 1) * sr)) : 0;
    const dC = dAmt > 0 ? expCoef(p.drift!.rate || 1) : 0;
    const vg = p.vca.gain == null ? 1 : p.vca.gain;
    // `note2Osc`: the oscillator that follows the second note when `paraphonic` (default 1; the CAT's VCO 1, osc 0, takes the high note)
    const hiOsc = p.note2Osc == null ? 1 : p.note2Osc;
    const shLfo = sh.clock === 'lfo';
    const assign = !!p.oscAssign;
    const ez = p.easel || null;
    const mg = !!p.moog;
    // TB-303 accent (EngineParams `acid`): an accented note decays Envelope 1 over `decay` instead of its own time,
    // charges the accent sweep from Envelope 1 (rising over `rise`, falling over `fall`, so a run of accents climbs),
    // which lifts the cutoff by `cut` octaves, and adds Envelope 1 × `amp` to the VCA.
    const ac = p.acid || null;
    const accCd = ac ? expCoef((ac.decay || 0.2) / 3.2) : 0;
    const accRiseC = ac ? expCoef(ac.rise || 0.01) : 0,
      accFallC = ac ? expCoef(ac.fall || 0.2) : 0;

    for (let i = 0; i < n; i++) {
      // ── phrase player ──
      if (phrase) {
        const evs = phrase.evs;
        while (phraseIdx < evs.length && evs[phraseIdx].t! <= phrasePos) {
          const e = evs[phraseIdx++];
          const nn = e.n + phrase.transpose;
          if (e.on) {
            phraseHeld.add(nn);
            noteOn(nn, e.v);
          } else if (phraseHeld.has(nn)) {
            phraseHeld.delete(nn);
            noteOff(nn);
          }
        }
        if (++phrasePos >= phrase.len) {
          if (phrase.loop) {
            phrasePos = 0;
            phraseIdx = 0;
          } else {
            stopPhrase();
          }
        }
      }

      // ── smoothing & pitch ──
      note += (noteT - note) * glideC;
      note2 += (note2T - note2) * glideC;
      if (p.oscAssign)
        for (let k = 0; k < 4; k++) {
          slotN[k] += (slotNT[k] - slotN[k]) * glideC;
          slotG[k] += (slotGT[k] - slotG[k]) * sm;
        }
      cutLog += (cutLogT - cutLog) * sm;
      res += (resT - res) * sm;
      hpLog += (hpLogT - hpLog) * sm;
      hpRes += (hpResT - hpRes) * sm;
      vol += (volT - vol) * sm;
      noiseL += (noiseLT - noiseL) * sm;
      S[SI.kbd] = (note - 60) / 12;
      S[SI.kbd2] = (note2 - 60) / 12;
      S[SI.gate] = gate;
      S[SI.wheel] = wheel;
      S[SI.vel] = vel;
      if (jy) {
        joyX += (jy[0] - joyX) * sm;
        joyY += (jy[1] - joyY) * sm;
        S[SI.joyX] = joyX;
        S[SI.joyY] = joyY;
      }

      // ── LFO ──
      const lfoHz = Math.min(p.lfo.rate * Math.exp(ev(DI.lfoRate) * Math.LN2), sr * 0.4);
      const trig = ev(DI.lfoTrig);
      if ((trig > 0.5 && lfoTrigPrev <= 0.5) || (retrigFlag && p.lfo.keySync)) lfoPhase = 0;
      lfoTrigPrev = trig;
      lfoPhase += lfoHz / sr;
      const lfoWrapped = lfoPhase >= 1;
      if (lfoWrapped) lfoPhase -= Math.floor(lfoPhase);
      const triV = lfoPhase < 0.5 ? 4 * lfoPhase - 1 : 3 - 4 * lfoPhase;
      const sqV = lfoPhase < 0.5 ? 1 : -1;
      const sawV = 2 * lfoPhase - 1;
      const sineV = Math.sin(TWO_PI * lfoPhase);
      let lfoV = triV * lTri + sawV * lSaw - sawV * lRsaw + sqV * lSq + sineV * lSine;
      if (lShOn) {
        if (lfoWrapped) lfoSh = Math.random() * 2 - 1;
        lfoShg += (lfoSh - lfoShg) * shgC1;
        lfoV += lfoSh * lShM + lfoShg * lShgM;
      }
      if (lDly > 0 || l2Dly > 0) {
        // LFO DELAY: silent for the first 40 % of the time from each new note, then a fade-in over the rest
        if ((gate && !lfoGatePrev) || retrigFlag) lfoT = 0;
        lfoGatePrev = gate;
        if (lfoT < 1e6) lfoT += 1 / sr;
        if (lDly > 0) lfoV *= fadeOf(lfoT, lDly);
      }
      S[SI.lfoTri] = triV;
      S[SI.lfoSq] = sqV;
      S[SI.lfoSine] = sineV;
      S[SI.lfoSaw] = sawV;
      S[SI.lfo] = lfoV;
      S[SI.lfoUni] = (lfoV + 1) * 0.5;
      if (L2) {
        if (retrigFlag && L2.keySync) lfo2.phase = 0;
        lfo2.phase += Math.min(L2.rate, sr * 0.4) / sr;
        let w2 = false;
        if (lfo2.phase >= 1) {
          lfo2.phase -= Math.floor(lfo2.phase);
          w2 = true;
        }
        const q = lfo2.phase;
        const sq2 = q < 0.5 ? 1 : -1,
          saw2 = 2 * q - 1;
        let y2 =
          (q < 0.5 ? 4 * q - 1 : 3 - 4 * q) * (m2!.tri || 0) +
          saw2 * ((m2!.saw || 0) - (m2!.rsaw || 0)) +
          sq2 * (m2!.sq || 0) +
          (m2!.sine ? Math.sin(TWO_PI * q) * m2!.sine : 0);
        if (l2Sh) {
          if (w2) lfo2.sh = Math.random() * 2 - 1;
          lfo2.shg += (lfo2.sh - lfo2.shg) * shgC2;
          y2 += lfo2.sh * (m2!.sh || 0) + lfo2.shg * (m2!.shg || 0);
        }
        if (l2Dly > 0) y2 *= fadeOf(lfoT, l2Dly);
        S[SI.lfo2] = y2;
        S[SI.lfo2Uni] = (y2 + 1) * 0.5;
      }
      // delayed vibrato: the sine fades in over `vibDelay` seconds from the start of each note
      if ((gate && !vibGatePrev) || retrigFlag) vibT = 0;
      vibGatePrev = gate;
      if (vibT < 1e6) vibT += 1 / sr;
      S[SI.vib] =
        sineV * vibDepth * (vibDelay <= 0.001 || vibT >= vibDelay ? 1 : vibT / vibDelay) +
        ev(DI.vibIn);

      // ── gates & envelopes ──
      const hitKey = retrigFlag;
      const tr = p.trig;
      const rep = tr.repeat ? sqV > 0 : true;
      const g1 = trigSrc
        ? gateFor(tr, 0, trigSrc[0], rep, sqV)
        : tr.drone
          ? true
          : ev(DI.gate1) > 0.5 && rep;
      const g2 = trigSrc
        ? gateFor(tr, 1, trigSrc[1], rep, sqV)
        : tr.drone
          ? true
          : ev(DI.gate2) > 0.5 && rep;
      if (ac) env[0].cd = accOn ? accCd : env[0].cdBase!;
      S[SI.env1] = tp ? runTrap(tp) : runEnv(env[0], g1);
      if (tp) S[SI.trap] = 1 - 2 * S[SI.env1];
      S[SI.env2] = runEnv(env[1], g2);
      S[SI.env1v] = S[SI.env1] * vel;
      S[SI.env2v] = S[SI.env2] * vel;
      if (p.env3) S[SI.env3] = runEnv(env[2], g2);
      retrigFlag = false;
      let accCut = 0,
        accAmp = 0;
      if (ac) {
        const tgt = accOn ? S[SI.env1] : 0;
        accSweep += (tgt - accSweep) * (tgt > accSweep ? accRiseC : accFallC);
        accCut = accSweep * (ac.cut || 0);
        accAmp = accOn ? S[SI.env1] * (ac.amp || 0) : 0;
      }

      // ── utilities ──
      let tick = false;
      if (shLfo && !shExt) {
        // `sh.clock: 'lfo'` (CAT): sampled on each rising edge of the LFO square, so the steps keep time with the LFO
        tick = lfoWrapped;
        S[SI.shClk] = sqV > 0 ? 1 : 0;
      } else if (shExt) {
        const c = ev(DI.shClock);
        tick = c > 0.5 && shClkPrev <= 0.5;
        shClkPrev = c;
        S[SI.shClk] = c > 0.5 ? 1 : 0;
      } else {
        shPhase += (sh.rate || 5) / sr;
        if (shPhase >= 1) {
          shPhase -= 1;
          tick = true;
        }
        S[SI.shClk] = shPhase < 0.5 ? 1 : 0;
      }
      if (tick) shHeld = ev(DI.shIn);
      shOut += (shHeld - shOut) * shGlideC;
      S[SI.sh] = shOut;
      slewOut += (ev(DI.slewIn) - slewOut) * slewC;
      S[SI.slew] = slewOut;
      S[SI.att2] = ev(DI.att2In) * att[1];
      S[SI.att1] =
        ev(DI.att1In) * att[0] * (att1CvOn ? Math.max(0, Math.min(1.5, ev(DI.att1CV))) : 1);
      S[SI.sum1] = ev(DI.sum1A) + ev(DI.sum1B);
      S[SI.sum2] = ev(DI.sum2A) + ev(DI.sum2B);
      S[SI.invert] = -ev(DI.invertIn);
      S[SI.mult] = ev(DI.multIn);
      if (hp6C) {
        const hx = ev(DI.hp6In);
        hp6Lp += (hx - hp6Lp) * hp6C;
        S[SI.hp6] = hx - hp6Lp;
      }
      S[SI.inv1] = -(ev(DI.inv1In) + ev(DI.inv1A) + ev(DI.inv1B));
      S[SI.inv2] = -(ev(DI.inv2In) + ev(DI.inv2A));
      S[SI.esw] = S[SI.shClk] > 0.5 ? ev(DI.eswA) : ev(DI.eswB);
      let ra = ev(DI.ringA);
      if (ringAc) {
        ringHp += (ra - ringHp) * ringHpC;
        ra -= ringHp;
      }
      let rb = ev(DI.ringB);
      if (ringAcB) {
        ringHpB += (rb - ringHpB) * ringHpC;
        rb -= ringHpB;
      }
      S[SI.ring] = ra * rb;
      S[SI.preamp] = preGain > 0 ? Math.tanh(ev(DI.preampIn) * preGain) : 0;
      const efIn = Math.abs(ev(DI.envfIn)) * efSens;
      efLevel += (efIn - efLevel) * (efIn > efLevel ? efAtt : efRel);
      S[SI.envf] = efLevel * 1.5 > 1.5 ? 1.5 : efLevel * 1.5;

      // The Easel has its own sound path, in place of everything from here to the reverb.
      core: {
        if (ez) {
          easelStep(ez, hitKey);
          break core;
        }
        if (mg) {
          moog.step(note, gate > 0);
          break core;
        }
        // ── oscillators ──
        const pmAll = ev(DI.pitchAll);
        if (dAmt > 0) {
          if (--driftN <= 0) {
            driftT = (Math.random() * 2 - 1) * dAmt;
            driftN = dPer;
          }
          drift += (driftT - drift) * dC;
        }
        for (let k = 0; k < nOsc; k++) {
          const o = osc[k];
          o.level += (o.levelT - o.level) * sm;
          o.pw += (o.pwT - o.pw) * sm;
          if (o.mo) o.morph += (o.morphT - o.morph) * sm;
          o.semi += (o.semiT - o.semi) * sm;
          const kn = assign ? slotN[k] : k === hiOsc && p.paraphonic ? note2 : note;
          const base = o.kbd ? kn + pmAll + (p.tune || 0) + vOff + drift : o.fixed;
          const nn = base + o.semi + ev(PITCH_DI[k]);
          let hz = 440 * Math.exp((nn - 69) * LN2_12);
          if (hz > sr * 0.45) hz = sr * 0.45;
          o.inc = hz / sr;
          o.phase += o.inc;
          o.wrapped = false;
          if (o.phase >= 1) {
            o.phase -= 1;
            o.wrapped = true;
            o.wrapFrac = o.phase / o.inc;
            o.subSt ^= 1;
          }
        }
        let mixSum = 0;
        for (let k = 0; k < nOsc; k++) {
          const o = osc[k];
          if (o.syncTo >= 0 && o.syncTo < nOsc && osc[o.syncTo].wrapped) {
            o.phase = osc[o.syncTo].wrapFrac * o.inc;
            if (!o.wrapped) o.subSt ^= 1;
          }
          const ph = o.phase,
            dt = o.inc;
          let y = 0;
          let saw = 0;
          if (o.mo) {
            // Morphing wave (dest wave1 / wave2 moves it): 0 triangle · 0.5 sawtooth · 2/3 square · 1 narrow pulse. Over the
            // last third the pulse narrows and the pulse-width destination fades in, so PWM is heard only at the pulse end.
            let m = o.morph + (k < 2 ? ev(DI.wave1 + k) : 0);
            m = m < 0 ? 0 : m > 1 ? 1 : m;
            saw = 2 * ph - 1 - blep(ph, dt);
            if (m < 0.5) {
              const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
              const t = m * 2;
              y = tri * (1 - t) + saw * t;
            } else {
              const t = m < 2 / 3 ? 1 : (m - 2 / 3) * 3;
              let pw = m < 2 / 3 ? 0.5 : 0.5 - 0.3 * t + ev(DI.pw1 + (k > 1 ? 1 : k)) * t;
              pw = pw < 0.03 ? 0.03 : pw > 0.97 ? 0.97 : pw;
              let ph2 = ph - pw;
              if (ph2 < 0) ph2 += 1;
              const pulse = (ph < pw ? 1 : -1) + blep(ph, dt) - blep(ph2, dt) - (2 * pw - 1);
              if (m < 2 / 3) {
                const u = (m - 0.5) * 6;
                y = saw * (1 - u) + pulse * u;
              } else y = pulse;
            }
            S[OSC_SI[k]] = y;
            mixSum += y * Math.max(0, o.level + (k < 2 ? ev(DI.lvl1 + k) : 0));
            continue;
          }
          if (outs || o.saw || o.rsaw || o.shark || o.tmod) saw = 2 * ph - 1 - blep(ph, dt);
          if (o.saw) y += saw * o.saw;
          if (o.rsaw) y -= saw * o.rsaw;
          let tri = 0;
          if (o.skew >= 0) o.skew += (o.skewT - o.skew) * sm;
          if (outs || o.tri || o.shark)
            tri =
              o.skew >= 0
                ? ph < o.skew
                  ? (2 * ph) / o.skew - 1
                  : 1 - (2 * (ph - o.skew)) / (1 - o.skew)
                : ph < 0.5
                  ? 4 * ph - 1
                  : 3 - 4 * ph;
          if (o.tri) y += tri * o.tri;
          if (o.shark) y += (0.55 * tri + 0.55 * saw) * o.shark;
          let sine = outs || o.sine ? Math.sin(TWO_PI * ph) : 0;
          if (o.sineShape) {
            // folds towards a full-wave rectified sine: one way up, the other way down
            const sa = o.sineShape < 0 ? -o.sineShape : o.sineShape;
            sine =
              (1 - sa) * sine +
              sa * (o.sineShape < 0 ? -1 : 1) * (2 * (sine < 0 ? -sine : sine) - 1);
          }
          if (o.sine) y += sine * o.sine;
          let pulse = 0;
          if (outs || o.pulse || o.tmod) {
            let pw = o.pw + ev(k === 2 && pwSplit ? DI.pw3 : DI.pw1 + (k > 1 ? 1 : k));
            pw = pw < 0.03 ? 0.03 : pw > 0.97 ? 0.97 : pw;
            let ph2 = ph - pw;
            if (ph2 < 0) ph2 += 1;
            pulse = (ph < pw ? 1 : -1) + blep(ph, dt) - blep(ph2, dt) - (2 * pw - 1);
            if (o.pulse) y += pulse * o.pulse;
            if (o.tmod) y += 0.6 * (saw + (2 * ph2 - 1 - blep(ph2, dt))) * o.tmod;
          }
          if (o.notch) {
            // DeepMind OSC2 TONE MOD: a square whose every half cycle starts with a gap of `pw` (0..0.6) of the half cycle
            let wd = o.pw + ev(DI.pw1 + (k > 1 ? 1 : k));
            wd = wd < 0 ? 0 : wd > 0.6 ? 0.6 : wd;
            const a = wd * 0.5;
            const fr = (x: number): number => (x < 0 ? x + 1 : x);
            const val = ph < a ? 0 : ph < 0.5 ? 1 : ph < 0.5 + a ? 0 : -1;
            y +=
              (val +
                0.5 *
                  (blep(ph, dt) +
                    blep(fr(ph - a), dt) -
                    blep(fr(ph - 0.5), dt) -
                    blep(fr(ph - 0.5 - a), dt))) *
              o.notch;
          }
          if (o.sub || o.subL || (subOut && k === 1)) {
            // `mix.sub`: a square an octave down, from a flip-flop that changes state each time this oscillator's cycle restarts
            const sp = (o.subSt ? 0.5 : 0) + ph * 0.5,
              sd = dt * 0.5;
            let sp2 = sp - 0.5;
            if (sp2 < 0) sp2 += 1;
            const sq = (sp < 0.5 ? 1 : -1) + blep(sp, sd) - blep(sp2, sd);
            if (o.sub) y += sq * o.sub;
            if (o.subL) mixSum += sq * o.subL;
            if (k === 1) S[SI.sub] = sq;
          }
          if (o.syncGate && o.syncTo >= 0 && o.syncTo < nOsc && osc[o.syncTo].phase >= 0.5) y = 0;
          if (outs && k < 3) {
            const w = OW[k];
            S[w[0]] = saw;
            S[w[1]] = pulse;
            S[w[2]] = tri;
            S[w[3]] = sine;
          }
          S[OSC_SI[k]] = y;
          mixSum +=
            y *
            (k < 2 ? Math.max(0, o.level + ev(DI.lvl1 + k)) : o.level) *
            (assign && o.kbd ? slotG[k] : 1);
        }
        S[SI.oscMix] = mixSum;

        // ── noise & mixer ──
        const white = Math.random() * 2 - 1;
        pinkB0 = 0.99765 * pinkB0 + white * 0.099046;
        pinkB1 = 0.963 * pinkB1 + white * 0.2965164;
        pinkB2 = 0.57 * pinkB2 + white * 1.0526913;
        const pink = (pinkB0 + pinkB1 + pinkB2 + white * 0.1848) * 0.28;
        let nz = nzp.color === 'pink' ? pink : white;
        if (nzTone >= 0) {
          // continuous colour: low-frequency rumble (0) → pink (0.5) → white (1)
          lfNoise += (white - lfNoise) * lfNoiseC;
          const low = lfNoise * 18;
          nz =
            nzTone < 0.5
              ? low + (pink - low) * nzTone * 2
              : pink + (white - pink) * (nzTone - 0.5) * 2;
        }
        if (nTilt) {
          // COLOUR (VCS3): dark is the low half of the spectrum, light the high half, white in the middle
          nTiltLp += (nz - nTiltLp) * nTiltC;
          nz =
            nTilt < 0
              ? nz + (nTiltLp * 2.6 - nz) * -nTilt
              : nz + ((nz - nTiltLp) * 1.15 - nz) * nTilt;
        }
        nz *= nzGain;
        S[SI.noise] = nz;
        S[SI.pink] = pink * nzGain;
        const mixer = mixSum + nz * noiseL + ev(DI.extIn) * (p.ext ? p.ext.level : 0);
        S[SI.mixer] = mixer;
        const am = mixer < 0 ? -mixer : mixer;
        if (am > overloadPeak) overloadPeak = am;

        const kbdOct = (note - 60) / 12;

        // ── optional high-pass stage, in series before the main filter ──
        let fin = ev(DI.vcfIn);
        if (hpf && hpf.poles === 1) {
          // `poles: 1` (Jupiter-8 / Jupiter-4 HPF): a plain 6 dB high-pass with no resonance
          let hc = Math.exp(
            hpLog + (hpEnvAmt * S[hpEnvIdx] + hpKbd * kbdOct + ev(DI.cutoffHp)) * Math.LN2
          );
          hc = hc < 10 ? 10 : hc > sr * 0.35 ? sr * 0.35 : hc;
          hA1 += (fin - hA1) * (1 - Math.exp((-TWO_PI * hc) / sr));
          fin -= hA1;
        } else if (hpf) {
          let hc = Math.exp(
            hpLog + (hpEnvAmt * S[hpEnvIdx] + hpKbd * kbdOct + ev(DI.cutoffHp)) * Math.LN2
          );
          hc = hc < 10 ? 10 : hc > sr * 0.35 ? sr * 0.35 : hc;
          const hg = Math.tan((Math.PI * hc) / sr);
          const hk = hpRes >= 1 ? -0.015 : 2 - 2 * Math.pow(hpRes, 0.75) * 0.995;
          // resonant section, then a flat one for the second 12 dB of slope
          let a1 = 1 / (1 + hg * (hg + hk)),
            a2 = hg * a1,
            a3 = hg * a2;
          let x = Math.tanh(fin * 0.9);
          let v3 = x - hA2;
          let bp = a1 * hA1 + a2 * v3;
          let lp = hA2 + a2 * hA1 + a3 * v3;
          hA1 = 2 * bp - hA1;
          hA2 = 2 * lp - hA2;
          if (hA1 > 1.6) hA1 = 1.6;
          else if (hA1 < -1.6) hA1 = -1.6;
          if (hA2 > 1.6) hA2 = 1.6;
          else if (hA2 < -1.6) hA2 = -1.6;
          x = (x - hk * bp - lp) * 1.2;
          a1 = 1 / (1 + hg * (hg + 1.414));
          a2 = hg * a1;
          a3 = hg * a2;
          v3 = x - hB2;
          bp = a1 * hB1 + a2 * v3;
          lp = hB2 + a2 * hB1 + a3 * v3;
          hB1 = 2 * bp - hB1;
          hB2 = 2 * lp - hB2;
          if (hB1 > 1.6) hB1 = 1.6;
          else if (hB1 < -1.6) hB1 = -1.6;
          if (hB2 > 1.6) hB2 = 1.6;
          else if (hB2 < -1.6) hB2 = -1.6;
          fin = x - 1.414 * bp - lp;
        }
        S[SI.vcfHp] = fin;

        // ── filter (2× oversampled) ──
        let fc = Math.exp(
          cutLog + (f.envAmt * S[envSrcIdx] + f.kbd * kbdOct + ev(DI.cutoff) + accCut) * Math.LN2
        );
        fc = fc < 12 ? 12 : fc > sr * 0.42 ? sr * 0.42 : fc;
        let rr = res + ev(DI.res);
        rr = rr < 0 ? 0 : rr > 1.15 ? 1.15 : rr;
        const g = Math.tan((Math.PI * fc) / (sr * 2));
        let v1o = 0,
          v2o = 0;
        if (ladder) {
          const G = g / (1 + g),
            b = 1 / (1 + g),
            k4 = rr * 4.1;
          const G2 = G * G,
            G3 = G2 * G,
            G4 = G3 * G;
          const comp = 1 + rr * 1.1;
          for (let os = 0; os < 2; os++) {
            const x =
              ((os ? fin : (fin + fPrevIn) * 0.5) * comp + (Math.random() - 0.5) * 2e-5) * fDrive;
            const Sg = (G3 * s1 + G2 * s2 + G * s3 + s4) * b;
            let u = (x - k4 * Sg) / (1 + k4 * G4);
            u = Math.tanh(u);
            let v = (u - s1) * G;
            const y1 = v + s1;
            s1 = y1 + v;
            v = (y1 - s2) * G;
            const y2 = v + s2;
            s2 = y2 + v;
            v = (y2 - s3) * G;
            const y3 = v + s3;
            s3 = y3 + v;
            v = (y3 - s4) * G;
            const y4 = v + s4;
            s4 = y4 + v;
            if (os) {
              const lp = y4 * 1.25,
                hp = (u - 4 * y1 + 6 * y2 - 4 * y3 + y4) * 1.1,
                bp = (y2 - y4) * 3;
              v1o = f.mode === 'hp' ? hp : f.mode === 'bp' ? bp : lp;
              v2o = f.mode2 === 'hp' ? hp : f.mode2 === 'bp' ? bp : lp;
            }
          }
        } else {
          const kq = rr >= 1 ? -0.015 : 2 - 2 * Math.pow(rr, 0.75) * 0.995;
          const a1 = 1 / (1 + g * (g + kq)),
            a2 = g * a1,
            a3 = g * a2;
          for (let os = 0; os < 2; os++) {
            const x = Math.tanh(
              ((os ? fin : (fin + fPrevIn) * 0.5) + (Math.random() - 0.5) * 2e-5) * 0.8
            );
            const v3 = x - ic2;
            const bp = a1 * ic1 + a2 * v3;
            const lp = ic2 + a2 * ic1 + a3 * v3;
            ic1 = 2 * bp - ic1;
            ic2 = 2 * lp - ic2;
            if (ic1 > 1.6) ic1 = 1.6;
            else if (ic1 < -1.6) ic1 = -1.6;
            if (ic2 > 1.6) ic2 = 1.6;
            else if (ic2 < -1.6) ic2 = -1.6;
            if (os) {
              const hp = x - kq * bp - lp;
              // `morph` (0..1, the SEM's NOTCH knob): low-pass fading into high-pass, with a notch where they meet halfway
              v1o =
                f.mode === 'morph'
                  ? ((lp * (1 - morph) + hp * morph) * 1.25) / (morph > 0.5 ? morph : 1 - morph)
                  : (f.mode === 'hp' ? hp : f.mode === 'bp' ? bp : lp) * 1.25;
              const m2 = f.mode2 || 'lp';
              v2o = (m2 === 'hp' ? hp : m2 === 'bp' ? bp : lp) * 1.25;
            }
          }
        }
        fPrevIn = fin;
        S[SI.vcf1] = v1o;
        S[SI.vcf2] = v2o;

        // ── overdrive ──
        let x = ev(DI.odIn);
        if (odOn) {
          const pre = 1 + od.drive! * od.drive! * 24;
          let y = Math.tanh(x * pre) / Math.tanh(Math.min(pre, 3) * 0.6);
          odLp += (y - odLp) * odToneC;
          const t = od.tone == null ? 0.5 : od.tone;
          y = t < 0.5 ? odLp + (y - odLp) * (t * 2) : y + (y - odLp) * (t - 0.5) * 2.4;
          x = y * (od.level == null ? 1 : od.level) * 0.8;
        }
        S[SI.od] = x;

        // ── VCA ──
        // `ampExp` is an exponential control input: small voltages barely open the VCA, the top of the range opens it fast
        const ex = ev(DI.ampExp);
        let ga =
          p.vca.bias +
          (vcaSrcIdx >= 0 ? S[vcaSrcIdx] : 0) +
          ev(DI.amp) +
          accAmp +
          (ex > 0 ? (Math.exp(2 * ex) - 1) / 6.389 : 0);
        ga = ga < 0 ? 0 : ga > 1.6 ? 1.6 : ga;
        vcaGain += (ga - vcaGain) * vcaC;
        let y = ev(DI.vcaIn) * vcaGain * vg;
        S[SI.vca] = y;

        // ── delay ──
        if (dOn) {
          const din = ev(DI.delayIn);
          let tt = dl.time! * Math.exp(ev(DI.delayTime) * Math.LN2);
          tt = tt < 0.004 ? 0.004 : tt > 1.2 ? 1.2 : tt;
          dTime += (tt - dTime) * dlTimeC;
          const rp = dW - dTime * sr;
          const ri = Math.floor(rp);
          const fr = rp - ri;
          const a = dbuf[(ri + DLEN) & (DLEN - 1)],
            b2 = dbuf[(ri + 1 + DLEN) & (DLEN - 1)];
          const wet = a + (b2 - a) * fr;
          dLp += (wet - dLp) * dlLpC;
          dbuf[dW] = Math.tanh(din + dLp * dl.fb! * 1.04);
          dW = (dW + 1) & (DLEN - 1);
          y = din * (1 - dl.mix!) + dLp * dl.mix! * 1.2;
        } else {
          y = ev(DI.delayIn);
        }
        S[SI.out] = y;
      }

      // ── reverb & output ──
      let fo = ev(DI.dryIn);
      if (rvOn) {
        const rin = ev(DI.revIn);
        const w = spring(rin, rvFb, rvDamp);
        if (rvUnit) {
          // a self-contained reverb unit (VCS3): its output is already the dry/wet blend set by MIX and dest `revMix`
          let m = rvMix + ev(DI.revMix);
          m = m < 0 ? 0 : m > 0.95 ? 0.95 : m;
          S[SI.rev] = rin * (1 - m) + w * m * 1.4;
        } else {
          S[SI.rev] = w;
          fo += w * rvMix;
        }
      }
      if (oa) {
        // Two output amplifiers (VCS3): signal in on out1In / out2In, a level that is itself a control voltage (panel
        // setting plus out1Lvl / out2Lvl), a tone control, and a pan between the left and right outputs.
        for (let c = 0; c < 2; c++) {
          let g = oa[c].level + ev(c ? DI.out2Lvl : DI.out1Lvl);
          g = g < 0 ? 0 : g > 1.6 ? 1.6 : g;
          oaG[c] += (g - oaG[c]) * vcaC;
          let yc = ev(c ? DI.out2In : DI.out1In) * oaG[c];
          oaLp[c] += (yc - oaLp[c]) * oaLpC[c];
          yc = oaLp[c];
          if (oaHpC[c] > 0) {
            oaHp[c] += (yc - oaHp[c]) * oaHpC[c];
            yc -= oaHp[c];
          }
          oaY[c] = yc;
        }
        for (let k = 0; k < 4; k++) oaPan[k] += (oaPanT[k] - oaPan[k]) * sm;
        const l = oaY[0] * oaPan[0] + oaY[1] * oaPan[2],
          r = oaY[0] * oaPan[1] + oaY[1] * oaPan[3];
        fo = (l + r) * 0.5;
        S[SI.master] = fo;
        if (part) {
          out[i] = fo;
          continue;
        }
        const dl = l - oaDc[0] + 0.9975 * oaDc[1];
        oaDc[0] = l;
        oaDc[1] = dl;
        const dr = r - oaDc[2] + 0.9975 * oaDc[3];
        oaDc[2] = r;
        oaDc[3] = dr;
        const ol = Math.tanh(dl * vol * 1.35),
          or = Math.tanh(dr * vol * 1.35);
        if (outR) {
          out[i] = ol;
          outR[i] = or;
        } else out[i] = (ol + or) * 0.5;
        continue;
      }
      S[SI.master] = fo;
      if (part) {
        out[i] = fo;
        continue;
      }
      const dc = fo - dcX + 0.9975 * dcY;
      dcX = fo;
      dcY = dc;
      let o = dc * vol * 1.35;
      if (p.a440) {
        a440Phase += 440 / sr;
        if (a440Phase >= 1) a440Phase -= 1;
        o += Math.sin(TWO_PI * a440Phase) * 0.12;
      }
      out[i] = Math.tanh(o);
    }

    meterCount += n;
    if (meterCount > sr / 25) {
      meterCount = 0;
      if (onEvent)
        onEvent({
          type: 'meter',
          overload: overloadPeak,
          gate: env[1].prevGate || env[0].prevGate,
          lfo: S[SI.lfo],
          env1: S[SI.env1],
          env2: S[SI.env2],
          oscs: oscMask(),
          ...(P.easel ? { gate: gate > 0, seq: ezSeqSt, pulser: ezPul } : null),
          // the 960's lamps: its stage (0-based) while it has one
          ...(P.moog && moog.seqState() ? { seq: moog.seqState()!.stage } : null),
        });
      overloadPeak = 0;
    }
  }

  /** Which oscillators are sounding a note: all of them while a key is down, or with `oscAssign` the ones given a note. */
  function oscMask() {
    if (!P) return 0;
    const sounding = gate || env[vcaEnvIdx()].stage !== 0;
    let m = 0;
    for (let k = 0; k < nOsc; k++)
      if (osc[k].on && sounding && (!P.oscAssign || !osc[k].kbd || slotGT[k] > 0)) m |= 1 << k;
    return m;
  }
  const vcaEnvIdx = () =>
    P && (P.vca.envSrc === 'env1' || P.vca.envSrc === 'env1v')
      ? 0
      : P && P.vca.envSrc === 'env3'
        ? 2
        : 1;
  /** Nothing held, the loudness envelope finished and the VCA shut: the voice is silent until its next note. */
  const idle = () =>
    !P ||
    (held.length === 0 &&
      !P.trig.drone &&
      !P.vca.bias &&
      env[vcaEnvIdx()].stage === 0 &&
      vcaGain < 1e-6);
  /** Copy the signals this voice's cross-module cables read from the other voice (`peer` = its signal array). */
  function link(peer: Float64Array) {
    for (let j = 0; j < xNeed.length; j++) S[NS + xNeed[j]] = peer[xNeed[j]];
  }
  return { handle, process, idle, link, S, linked: () => xNeed.length > 0 };
}

/**
 * A bucket-brigade stereo chorus after the voice (Poly D; the Juno-60 circuit it copies): two delay lines swept in
 * opposite directions by one triangle LFO, each added to the dry sound on its own side. `mode` 1 and 2 are slow sweeps,
 * 2 deeper; 3 (both buttons) a fast, shallow one. Mono in (the average of the two sides), stereo out.
 *   chorus: { on, mode: 1|2|3 }
 */
const CHORUS_MODES: Record<number, [number, number, number]> = {
  1: [0.513, 1.66, 5.35],
  2: [0.863, 1.66, 5.35],
  3: [9.75, 3.3, 3.7],
}; // Hz, shortest and longest delay (ms)
function createChorus(sr: number): {
  process: (L: Float32Array, R: Float32Array, n: number, c: ChorusParams) => void;
} {
  const LEN = 1 << 11;
  const buf = new Float32Array(LEN);
  let w = 0,
    ph = 0,
    wet = 0,
    lpL = 0,
    lpR = 0;
  const lpC = 1 - Math.exp((-TWO_PI * 7500) / sr); // the bucket brigade's own anti-alias filter darkens the delayed copy
  const wetC = 1 - Math.exp(-1 / (0.01 * sr));
  const tap = (d: number): number => {
    const rp = w - d;
    const ri = Math.floor(rp),
      fr = rp - ri;
    const a = buf[ri & (LEN - 1)],
      b = buf[(ri + 1) & (LEN - 1)];
    return a + (b - a) * fr;
  };
  function process(L: Float32Array, R: Float32Array, n: number, c: ChorusParams) {
    const md = CHORUS_MODES[c.mode] || CHORUS_MODES[1];
    const on = c.on && c.mode > 0;
    const inc = md[0] / sr;
    const mid = ((md[1] + md[2]) / 2000) * sr,
      dep = ((md[2] - md[1]) / 2000) * sr;
    for (let s = 0; s < n; s++) {
      wet += ((on ? 1 : 0) - wet) * wetC;
      const x = (L[s] + R[s]) * 0.5;
      buf[w & (LEN - 1)] = x;
      if (wet < 1e-4 && !on) {
        w++;
        continue;
      }
      ph += inc;
      if (ph >= 1) ph -= 1;
      const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
      lpL += (tap(mid + dep * tri) - lpL) * lpC;
      lpR += (tap(mid - dep * tri) - lpR) * lpC;
      L[s] = L[s] * (1 - 0.3 * wet) + lpL * 0.7 * wet;
      R[s] = R[s] * (1 - 0.3 * wet) + lpR * 0.7 * wet;
      w++;
    }
  }
  return { process };
}

/**
 * The synth. Without EngineParams `poly` it is exactly one voice (every mono and paraphonic panel). With `poly` it is a
 * pool of voices behind a note allocator, with unison stacks, an optional arpeggiator (`arp`) and a common output
 * stage after the voices are summed (`post`: the DeepMind's 6 dB high-pass and bass boost), then the effects engine
 * (`fx`, see dm-fx.js), which is the one stereo part of the synth.
 *   poly: { voices, stack, mono, detune /*semitones, outermost voice of a stack*\/ }
 *   arp:  { on, bpm, gate /*0..1 of a step*\/, mode: 'up'|'down'|'updown'|'downup'|'random'|'played', octaves, hold }
 *   post: { hpf /*Hz*\/, boost /*bool*\/ }
 *   fx:   { mode, routing, slots } (dm-fx.js)
 * process(out, n, outR): with `outR` the output is stereo; without it, `out` gets the mono sum.
 *
 * With EngineParams `dual` it is two different voices side by side (the 2-XM's two modules): the top-level params are
 * the first voice and `dual.b` the second, each with its own settings, mixed to stereo by their own level and pan.
 *   dual: { b: EngineParams, assign: 'unison'|'split'|'duo', split /*MIDI note*\/, level: [a, b], pan: [a, b] /*−1..1*\/ }
 * UNISON plays one key on both voices, and a second held key on the second voice. SPLIT gives keys below `split` to the
 * first voice and the rest to the second. DUO hands each new key to a free voice, taking the older note when both are busy.
 * Cables carry `sp` / `dp` (0 or 1, the voice of their source and destination jack); one between the voices reads the
 * other voice's signal a sample late, so the two are then run sample by sample.
 */
export function createSynth(sr: number, onEvent: SynthEventHandler | null): Synth {
  const mono = createVoice(sr, onEvent);
  let P: EngineParams | null = null;
  let polyOn = false;
  let dualOn = false;
  let monoStereo = false; // a one-voice synth whose voice writes both sides itself (EngineParams `outAmps`)
  const parts: Voice[] = [];
  const partCur = [-1, -1]; // the note each voice of a dual synth is playing, −1 for none
  const partT = [0, 0]; // when each last took or let go of a note: DUO gives a new key to the voice free longest
  let dualShape = '',
    linked = false;
  let bufB = new Float32Array(128);
  const dcL = [0, 0],
    dcR = [0, 0];
  const pg = [0, 0, 0, 0]; // smoothed gains: voice A left, A right, B left, B right
  const voices: Voice[] = [];
  const meters: MeterEvent[] = [];
  let groups: { note: number; held: boolean; t: number }[] = [];
  let shape = '';
  let clock = 0,
    lead = 0;
  let scratch = new Float32Array(128);
  let fxL = new Float32Array(128),
    fxR = new Float32Array(128);
  const fx = createFx(sr);
  const chorus = createChorus(sr);
  const keys: number[] = []; // keys held down (the phrase player counts as keys)
  let vel = 0.85;
  // arpeggiator
  // (the prototype also declared an `arpDir` here that nothing reads; TypeScript refuses an unused local, so it is left out)
  let arpNotes: number[] = [],
    arpPos = 0,
    arpWait = 0,
    arpOff = 0,
    arpCur = -1,
    arpRun = false;
  // phrase player
  let phrase: SynthPhrase | null = null,
    phrasePos = 0,
    phraseIdx = 0;
  const phraseHeld = new Set<number>();
  // output stage
  let bLp = 0,
    hLp = 0,
    vol = 0.7,
    meterCount = 0;
  const cBoost = 1 - Math.exp((-TWO_PI * 110) / sr);
  const volC = 1 - Math.exp(-1 / (0.004 * sr));

  const emit = (e: SynthEvent): void => {
    if (onEvent) onEvent(e);
  };
  const offsetOf = (j: number): number => {
    const st = P!.poly!.stack || 1;
    return st < 2 ? 0 : ((j - (st - 1) / 2) / ((st - 1) / 2)) * (P!.poly!.detune || 0);
  };
  function voice(i: number) {
    while (voices.length <= i) {
      const k = voices.length;
      const v = createVoice(
        sr,
        (e) => {
          if (e.type === 'meter') meters[k] = e;
        },
        true
      );
      if (P) v.handle({ type: 'params', p: P });
      v.handle({ type: 'phase', lfo: Math.random(), lfo2: Math.random() }); // each voice's LFOs run free of the others
      voices.push(v);
    }
    return voices[i];
  }
  const groupVoices = (g: number, f: (v: Voice, i: number) => void): void => {
    const st = P!.poly!.stack || 1;
    for (let j = 0; j < st; j++) f(voice(g * st + j), g * st + j);
  };

  function setParams(p: EngineParams) {
    P = p;
    fx.set(p.fx);
    const q = p.poly!;
    const st = Math.max(1, q.stack || 1);
    const want = `${q.voices}/${st}/${q.mono ? 'm' : 'p'}`;
    if (want !== shape) {
      voices.forEach((v) => v.handle({ type: 'panic' }));
      shape = want;
      const n = q.mono ? 1 : Math.max(1, Math.floor(q.voices / st));
      groups = Array.from({ length: n }, () => ({ note: -1, held: false, t: 0 }));
      // stop the arpeggiator's current note as well: it belonged to a voice layout that no longer exists
      arpCur = -1;
    }
    for (let i = 0; i < voices.length; i++) {
      voices[i].handle({ type: 'params', p });
      voices[i].handle({ type: 'offset', semi: offsetOf(i % st) });
    }
    if (!(p.arp && p.arp.on) && arpRun) arpStop();
  }

  function voiceOn(n: number) {
    if (P!.poly!.mono) {
      groupVoices(0, (v, i) => {
        v.handle({ type: 'offset', semi: offsetOf(i) });
        v.handle({ type: 'noteOn', n, v: vel });
        lead = i;
      });
      return;
    }
    let g = groups.findIndex((x) => x.held && x.note === n);
    if (g < 0) {
      let best = -1,
        rank = 9,
        bt = Infinity;
      groups.forEach((x, i) => {
        let silent = !x.held;
        if (silent)
          groupVoices(i, (v) => {
            if (!v.idle()) silent = false;
          });
        const r = silent ? 0 : !x.held ? 1 : 2; // free, then still ringing, then steal the oldest held note
        if (r < rank || (r === rank && x.t < bt)) {
          best = i;
          rank = r;
          bt = x.t;
        }
      });
      g = best;
    }
    const x = groups[g];
    if (x.held && x.note !== n) groupVoices(g, (v) => v.handle({ type: 'noteOff', n: x.note }));
    groupVoices(g, (v, i) => {
      if (x.held && x.note === n) v.handle({ type: 'noteOff', n });
      v.handle({ type: 'noteOn', n, v: vel });
      lead = i;
    });
    x.note = n;
    x.held = true;
    x.t = ++clock;
  }
  function voiceOff(n: number) {
    if (P!.poly!.mono) {
      groupVoices(0, (v) => v.handle({ type: 'noteOff', n }));
      return;
    }
    groups.forEach((x, g) => {
      if (x.held && x.note === n) {
        x.held = false;
        x.t = ++clock;
        groupVoices(g, (v) => v.handle({ type: 'noteOff', n }));
      }
    });
  }

  // ── dual: two different voices ──
  function partParams(p: EngineParams, k: number): VoiceParams {
    const q: VoiceParams = k === 0 ? p : p.dual!.b;
    const cables = (p.cables || [])
      .filter((c) => (c.dp || 0) === k)
      .map((c) => ((c.sp || 0) === k ? c : { ...c, x: true }));
    return { ...q, cables };
  }
  function dualSet(p: EngineParams) {
    P = p;
    while (parts.length < 2) {
      const k = parts.length;
      const v = createVoice(
        sr,
        (e) => {
          if (e.type === 'meter') meters[k] = e;
        },
        true
      );
      v.handle({ type: 'phase', lfo: Math.random(), lfo2: Math.random() }); // the two modules' LFOs run free of each other
      parts.push(v);
    }
    const want = `${p.dual!.assign}/${p.dual!.split}`;
    parts.forEach((v, k) => v.handle({ type: 'params', p: partParams(p, k) }));
    if (want !== dualShape) {
      dualShape = want;
      for (let k = 0; k < 2; k++) partNote(k, -1, false);
      if (keys.length) dualAssign(keys[keys.length - 1]);
    }
    linked = parts[0].linked() || parts[1].linked();
  }
  /** Move voice k to note n (−1 = let go). `fresh` = a new key: the envelopes start again; otherwise it slides legato. */
  function partNote(k: number, n: number, fresh: boolean) {
    const v = parts[k];
    const cur = partCur[k];
    if (n === cur && !fresh) return;
    if (n < 0) {
      if (cur >= 0) v.handle({ type: 'noteOff', n: cur });
    } else if (fresh || cur < 0) {
      if (cur >= 0) v.handle({ type: 'noteOff', n: cur });
      v.handle({ type: 'noteOn', n, v: vel });
    } else {
      v.handle({ type: 'noteOn', n, v: vel });
      v.handle({ type: 'noteOff', n: cur });
    }
    partCur[k] = n;
    partT[k] = ++clock;
  }
  /** Share the held keys between the two voices. `pressed` = the key just pressed, or −1 after a key was let go. */
  function dualAssign(pressed: number) {
    const d = P!.dual!;
    const last = (xs: number[]): number => (xs.length ? xs[xs.length - 1] : -1);
    if (d.assign === 'split') {
      const lo = last(keys.filter((n) => n < d.split)),
        hi = last(keys.filter((n) => n >= d.split));
      partNote(0, lo, pressed >= 0 && lo === pressed);
      partNote(1, hi, pressed >= 0 && hi === pressed);
    } else if (d.assign === 'unison') {
      const a = last(keys);
      const b = keys.length > 1 ? keys[keys.length - 2] : a;
      partNote(0, a, pressed >= 0 && a === pressed);
      partNote(1, b, pressed >= 0 && b === pressed);
    } else if (pressed >= 0) {
      let k = partCur.indexOf(pressed);
      if (k < 0) {
        const free = [0, 1].filter((i) => partCur[i] < 0);
        const pool = free.length ? free : [0, 1];
        k = pool.length > 1 ? (partT[0] <= partT[1] ? 0 : 1) : pool[0];
      }
      partNote(k, pressed, true);
    } else {
      for (let k = 0; k < 2; k++) {
        if (partCur[k] < 0 || keys.includes(partCur[k])) continue;
        // a key still held but not sounding (a third finger) takes over the voice that was let go
        partNote(k, last(keys.filter((n) => n !== partCur[0] && n !== partCur[1])), false);
      }
    }
  }
  function processDual(out: Float32Array, n: number, outR?: Float32Array) {
    if (scratch.length < n) {
      scratch = new Float32Array(n);
      fxL = new Float32Array(n);
      fxR = new Float32Array(n);
    }
    if (bufB.length < n) bufB = new Float32Array(n);
    const A = scratch,
      B = bufB;
    let i = 0;
    while (i < n) {
      const k = Math.min(events(n - i), n - i);
      if (linked) {
        for (let s = i; s < i + k; s++) {
          parts[0].link(parts[1].S);
          parts[0].process(A.subarray(s, s + 1), 1);
          parts[1].link(parts[0].S);
          parts[1].process(B.subarray(s, s + 1), 1);
        }
      } else {
        for (let v = 0; v < 2; v++) {
          const buf = (v ? B : A).subarray(i, i + k);
          if (parts[v].idle()) buf.fill(0);
          else parts[v].process(buf, k);
        }
      }
      if (phrase) phrasePos += k;
      i += k;
    }
    const d = P!.dual!;
    const lv = d.level || [1, 1],
      pn = d.pan || [0, 0];
    // equal-power pan, scaled so that a module in the centre is as loud as a mono synth
    const tg = [0, 1].flatMap((v) => {
      const a = ((Math.max(-1, Math.min(1, pn[v])) + 1) * Math.PI) / 4;
      return [lv[v] * Math.cos(a) * Math.SQRT2, lv[v] * Math.sin(a) * Math.SQRT2];
    });
    const volT = P!.volume == null ? 0.7 : P!.volume;
    for (let s = 0; s < n; s++) {
      for (let g = 0; g < 4; g++) pg[g] += (tg[g] - pg[g]) * volC;
      vol += (volT - vol) * volC;
      const l = A[s] * pg[0] + B[s] * pg[2],
        r = A[s] * pg[1] + B[s] * pg[3];
      const yl = l - dcL[0] + 0.9975 * dcL[1];
      dcL[0] = l;
      dcL[1] = yl;
      const yr = r - dcR[0] + 0.9975 * dcR[1];
      dcR[0] = r;
      dcR[1] = yr;
      const ol = Math.tanh(yl * vol * 1.35),
        or = Math.tanh(yr * vol * 1.35);
      if (outR) {
        out[s] = ol;
        outR[s] = or;
      } else out[s] = (ol + or) * 0.5;
    }
    meterCount += n;
    if (meterCount > sr / 25) {
      meterCount = 0;
      let mask = 0,
        over = 0;
      parts.forEach((v, k) => {
        if (!v.idle()) {
          mask |= 1 << k;
          if (meters[k]) over = Math.max(over, meters[k].overload);
        }
      });
      const m: Partial<MeterEvent> = meters[partCur[0] < 0 && partCur[1] >= 0 ? 1 : 0] || {};
      emit({
        type: 'meter',
        overload: over,
        gate: keys.length > 0,
        lfo: m.lfo || 0,
        env1: m.env1 || 0,
        env2: m.env2 || 0,
        voices: mask,
      });
    }
  }

  // ── arpeggiator: 16th notes at the master BPM ──
  const arpOn = () => !!(P && P.arp && P.arp.on);
  const stepLen = (): number => Math.max(1, Math.round((60 / Math.max(P!.arp!.bpm, 1) / 4) * sr));
  function arpSeq() {
    const a = P!.arp!;
    const base =
      a.mode === 'played' || a.mode === 'random'
        ? arpNotes.slice()
        : arpNotes.slice().sort((x, y) => x - y);
    const seq: number[] = [];
    for (let o = 0; o < Math.max(1, a.octaves || 1); o++) base.forEach((n) => seq.push(n + 12 * o));
    if (a.mode === 'down' || a.mode === 'downup') seq.reverse();
    if ((a.mode === 'updown' || a.mode === 'downup') && seq.length > 2)
      for (let i = seq.length - 2; i > 0; i--) seq.push(seq[i]);
    return seq;
  }
  function arpStep() {
    if (arpCur >= 0) {
      voiceOff(arpCur);
      arpCur = -1;
    }
    if (!arpNotes.length) {
      arpRun = false;
      return;
    }
    const seq = arpSeq();
    const n =
      P!.arp!.mode === 'random'
        ? seq[Math.floor(Math.random() * seq.length)]
        : seq[arpPos % seq.length];
    arpPos++;
    const len = stepLen();
    arpWait = len;
    const g = Math.min(Math.max(P!.arp!.gate, 0), 1);
    if (g > 0) {
      voiceOn(n);
      arpCur = n;
      arpOff = Math.max(1, Math.round(len * g));
      if (g >= 1) arpOff = len + 1;
    } else arpOff = 0;
  }
  function arpStop() {
    if (arpCur >= 0) voiceOff(arpCur);
    arpCur = -1;
    arpRun = false;
    arpNotes = [];
    arpPos = 0;
  }

  function keyDown(n: number, v?: number) {
    const i = keys.indexOf(n);
    if (i >= 0) keys.splice(i, 1);
    keys.push(n);
    vel = v == null ? 0.85 : v;
    emit({ type: 'note', n, on: true });
    if (dualOn) {
      dualAssign(n);
      return;
    }
    if (arpOn()) {
      if (P!.arp!.hold && keys.length === 1) arpNotes = []; // a fresh chord replaces the latched one
      if (!arpNotes.includes(n)) arpNotes.push(n);
      if (!arpRun) {
        arpRun = true;
        arpPos = 0;
        arpWait = 0;
      }
      return;
    }
    voiceOn(n);
  }
  function keyUp(n: number) {
    const i = keys.indexOf(n);
    if (i < 0) return;
    keys.splice(i, 1);
    emit({ type: 'note', n, on: false });
    if (dualOn) {
      dualAssign(-1);
      return;
    }
    if (arpOn()) {
      if (!P!.arp!.hold) arpNotes = arpNotes.filter((x) => x !== n);
      return;
    }
    voiceOff(n);
  }
  function panic() {
    keys.length = 0;
    phraseHeld.clear();
    arpStop();
    voices.forEach((v) => v.handle({ type: 'panic' }));
    groups.forEach((x) => {
      x.held = false;
      x.note = -1;
    });
    parts.forEach((v) => v.handle({ type: 'panic' }));
    partCur[0] = -1;
    partCur[1] = -1;
    emit({ type: 'allOff' });
  }
  function setPhrase(ph: Phrase | null) {
    stopPhrase(true);
    if (!ph || !ph.steps || !ph.steps.length) return;
    const spb = (60 / ph.bpm) * sr;
    const evs: SynthPhraseEvent[] = [];
    let end = 0;
    for (const [b, n, len, v] of ph.steps) {
      evs.push({ t: Math.round(b * spb), on: true, n, v: v == null ? 0.85 : v });
      evs.push({ t: Math.round((b + len) * spb), on: false, n });
      end = Math.max(end, b + len);
    }
    evs.sort((x, y) => x.t - y.t || (x.on ? 1 : 0) - (y.on ? 1 : 0));
    const beats = Math.max(1, Math.ceil(end - 0.001));
    phrase = {
      evs,
      len: Math.round(beats * spb),
      loop: ph.loop !== false,
      transpose: ph.transpose || 0,
    };
    phrasePos = 0;
    phraseIdx = 0;
  }
  function stopPhrase(silent?: boolean) {
    if (!phrase) return;
    phrase = null;
    for (const n of Array.from(phraseHeld)) keyUp(n);
    phraseHeld.clear();
    if (!silent) emit({ type: 'phraseEnd' });
  }

  function handle(m: SynthMessage) {
    if (m.type === 'params') {
      if (m.p.dual) {
        if (polyOn) {
          panic();
          stopPhrase(true);
          polyOn = false;
        }
        if (!dualOn) {
          mono.handle({ type: 'panic' });
          dualOn = true;
        }
        dualSet(m.p);
        return;
      }
      if (dualOn) {
        panic();
        stopPhrase(true);
        dualOn = false;
      }
      if (!m.p.poly) {
        if (polyOn) {
          panic();
          stopPhrase(true);
          polyOn = false;
        }
        monoStereo = !!m.p.outAmps;
        mono.handle(m);
        return;
      }
      if (!polyOn) {
        mono.handle({ type: 'panic' });
        polyOn = true;
      }
      setParams(m.p);
      return;
    }
    if (!polyOn && !dualOn) {
      mono.handle(m);
      return;
    }
    switch (m.type) {
      case 'noteOn':
        keyDown(m.n, m.v);
        break;
      case 'noteOff':
        keyUp(m.n);
        break;
      case 'phrase':
        setPhrase(m.phrase);
        break;
      case 'stopPhrase':
        stopPhrase(true);
        break;
      case 'panic':
        stopPhrase(true);
        panic();
        break;
      default:
        break;
    }
  }

  /** Samples until the next phrase or arpeggiator event, at most `max`. Fires everything due now first. */
  function events(max: number) {
    if (phrase) {
      const evs = phrase.evs;
      while (phraseIdx < evs.length && evs[phraseIdx].t <= phrasePos) {
        const e = evs[phraseIdx++];
        const nn = e.n + phrase.transpose;
        if (e.on) {
          phraseHeld.add(nn);
          keyDown(nn, e.v);
        } else if (phraseHeld.has(nn)) {
          phraseHeld.delete(nn);
          keyUp(nn);
        }
      }
      if (phrasePos >= phrase.len) {
        if (phrase.loop) {
          phrasePos = 0;
          phraseIdx = 0;
          return 0;
        }
        stopPhrase();
      }
    }
    if (arpRun && arpOn()) {
      if (arpOff > 0 && arpOff <= 0.5 && arpCur >= 0) {
        voiceOff(arpCur);
        arpCur = -1;
      }
      if (arpWait <= 0) arpStep();
    } else if (arpRun) arpStop();
    let k = max;
    if (phrase)
      k = Math.min(
        k,
        phraseIdx < phrase.evs.length ? phrase.evs[phraseIdx].t - phrasePos : phrase.len - phrasePos
      );
    if (arpRun) {
      k = Math.min(k, arpWait);
      if (arpCur >= 0 && arpOff > 0) k = Math.min(k, arpOff);
    }
    return Math.max(1, k);
  }

  function process(out: Float32Array, n: number, outR?: Float32Array) {
    if (dualOn && P) {
      processDual(out, n, outR);
      return;
    }
    if (!polyOn) {
      mono.process(out, n, monoStereo ? outR : undefined);
      if (outR && !monoStereo) outR.set(out.subarray(0, n));
      return;
    }
    if (!P) {
      out.fill(0, 0, n);
      if (outR) outR.fill(0, 0, n);
      return;
    }
    if (scratch.length < n) {
      scratch = new Float32Array(n);
      fxL = new Float32Array(n);
      fxR = new Float32Array(n);
    }
    out.fill(0, 0, n);
    let i = 0;
    while (i < n) {
      const k = Math.min(events(n - i), n - i);
      const buf = scratch.subarray(0, k);
      for (let v = 0; v < voices.length; v++) {
        if (voices[v].idle()) continue;
        voices[v].process(buf, k);
        for (let s = 0; s < k; s++) out[i + s] += buf[s];
      }
      if (phrase) phrasePos += k;
      if (arpRun) {
        arpWait -= k;
        if (arpCur >= 0) arpOff -= k;
      }
      i += k;
    }
    const post: Partial<NonNullable<EngineParams['post']>> = P.post || {};
    const cH = 1 - Math.exp((-TWO_PI * Math.max(post.hpf || 20, 5)) / sr);
    const boost = post.boost ? 3 : 0; // +12 dB below about 110 Hz
    const volT = P.volume == null ? 0.7 : P.volume;
    // one voice about as loud as a mono synth; a unison stack is scaled down so it is not twelve times louder
    const vGain = 1.1 / Math.sqrt(Math.max(1, P.poly!.stack || 1));
    for (let s = 0; s < n; s++) {
      let x = out[s] * vGain;
      bLp += (x - bLp) * cBoost;
      x += bLp * boost;
      hLp += (x - hLp) * cH;
      out[s] = x - hLp;
    }
    // the effects sit after the high-pass and before the output level, as on the hardware
    fx.process(out, fxL, fxR, n);
    if (P.chorus) chorus.process(fxL, fxR, n, P.chorus);
    for (let s = 0; s < n; s++) {
      vol += (volT - vol) * volC;
      const l = Math.tanh(fxL[s] * vol * 1.35),
        r = Math.tanh(fxR[s] * vol * 1.35);
      if (outR) {
        out[s] = l;
        outR[s] = r;
      } else out[s] = (l + r) * 0.5;
    }
    meterCount += n;
    if (meterCount > sr / 25) {
      meterCount = 0;
      let mask = 0,
        over = 0;
      voices.forEach((v, k) => {
        if (!v.idle()) {
          mask |= 1 << k;
          if (meters[k]) over = Math.max(over, meters[k].overload);
        }
      });
      const m: Partial<MeterEvent> = meters[lead] || {};
      emit({
        type: 'meter',
        overload: over,
        gate: keys.length > 0 || arpCur >= 0,
        lfo: m.lfo || 0,
        env1: m.env1 || 0,
        env2: m.env2 || 0,
        voices: mask,
        oscs: m.oscs || 0,
      });
    }
  }

  return { handle, process };
}
