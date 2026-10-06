// Explains a patch cable in plain English: what the output jack carries right now, what the input jack does
// with it (units, depth, whether it replaces or adds to the internal wiring), and what that does to the sound.
// Nothing here is synth-specific. It reads the Jack defs, the live EngineParams from `toEngine()` and the
// engine's routing rules (see dsp-core `compile()` / `ev()`), so the text follows the panel as it is set.
//
// Transliterated from the prototype file `src/lib/explain.js` (decision D3). Where the prototype read an optional engine
// parameter that a well-formed EngineParams may leave out (`ep.sh`, `ep.trap`, `osc.syncTo` …), the reads below say
// what the prototype got from `undefined` (a comparison that fails, a fallback of nothing).
import { BUILTIN_NORMALS } from '@/lib/app/synths/audio/dsp-core';
import {
  jackAmt as jackDepth,
  jackGain,
  jackMap,
  type CableLike,
} from '@/lib/app/synths/lib/patch';
import { fmtHz, fmtTime } from '@/lib/app/synths/lib/maps';
import { explainMoog } from '@/lib/app/synths/lib/explain-moog';
import type {
  ControlValues,
  EngineParams,
  EnvParams,
  InputJack,
  Jack,
  JackHearContext,
  NormalSource,
  OutputJack,
  SampleHoldParams,
  SynthDef,
} from '@/lib/app/synths/contract';

const SIGNAL_NAMES: Record<string, string | undefined> = {
  osc1: 'Oscillator 1',
  osc2: 'Oscillator 2',
  osc3: 'Oscillator 3',
  osc4: 'Oscillator 4',
  oscMix: 'the oscillator mix',
  mixer: 'the mixer output',
  noise: 'noise',
  vcfHp: 'the high-pass filter output',
  vcf1: 'the filter output',
  vcf2: 'the filter’s second output',
  od: 'the overdrive output',
  vca: 'the amplifier output',
  out: 'the main output',
  lfo: 'the LFO',
  lfoTri: 'the triangle LFO',
  lfoSq: 'the square LFO',
  lfoUni: 'the one-way LFO',
  sh: 'the sample-and-hold',
  slew: 'the slew limiter',
  att1: 'Attenuator 1',
  att2: 'Attenuator 2',
  sum1: 'summer 1',
  sum2: 'summer 2',
  invert: 'the inverter',
  mult: 'the multiple',
  env1: 'Envelope 1',
  env2: 'Envelope 2',
  gate: 'the key gate',
  kbd: 'the keyboard pitch',
  wheel: 'the mod wheel',
  vel: 'key velocity',
  one: 'a fixed voltage',
  random: 'the sample-and-hold',
  none: 'nothing',
  ring: 'the ring modulator',
  lfoSine: 'the sine LFO',
  lfoSaw: 'the sawtooth LFO',
  vib: 'the delayed vibrato',
  shClk: 'the sample-and-hold clock',
  preamp: 'the preamp',
  envf: 'the envelope follower',
  inv1: 'inverter 1',
  inv2: 'inverter 2',
  esw: 'the electronic switch',
  rev: 'the reverb',
  master: 'the final output',
  kbd2: 'the upper-voice pitch',
  env1v: 'Envelope 1 scaled by velocity',
  env2v: 'Envelope 2 scaled by velocity',
  trap: 'the trapezoid',
  pink: 'pink noise',
  sub: 'the sub-oscillator',
  hp6: 'the high-pass filter',
  joyX: 'the joystick’s left-right position',
  joyY: 'the joystick’s up-down position',
};
const WAVE_WORD: Record<string, string> = {
  saw: 'sawtooth',
  pulse: 'pulse',
  tri: 'triangle',
  sine: 'sine',
};
const OSC_OUT = /^o([123])(saw|pulse|tri|sine)$/;
for (const n of [1, 2, 3])
  for (const w of Object.keys(WAVE_WORD))
    SIGNAL_NAMES[`o${n}${w}`] = `the Oscillator ${n} ${WAVE_WORD[w]}`;
const sigName = (def: SynthDef, s: string): string =>
  (def.signalNames && def.signalNames[s]) || SIGNAL_NAMES[s] || s;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const jackName = (j: Pick<Jack, 'name' | 'label'>): string => j.name || j.label;

/** The engine signal an output jack carries (an input carries none). */
const signalOf = (j: Jack | undefined): string | null => (j && j.dir === 'out' ? j.signal : null);
/** The engine destination an input jack feeds (an output feeds none). */
const destOf = (j: Jack | undefined): string | null => (j && j.dir === 'in' ? j.dest : null);
/** The signal a normal carries, without its gain. */
const normalSignal = (n: NormalSource | undefined): string | null =>
  n ? (Array.isArray(n) ? n[0] : n) : null;

// Utilities pass on (a changed copy of) whatever reaches their inputs. `resolve()` follows them back to a real source.
interface UtilSpec {
  ins: string[];
  att?: number;
  sign?: number;
  sample?: boolean;
  follow?: boolean;
}
const UTIL: Record<string, UtilSpec | undefined> = {
  att1: { ins: ['att1In'], att: 0 },
  att2: { ins: ['att2In'], att: 1 },
  slew: { ins: ['slewIn'] },
  invert: { ins: ['invertIn'], sign: -1 },
  mult: { ins: ['multIn'] },
  sum1: { ins: ['sum1A', 'sum1B'] },
  sum2: { ins: ['sum2A', 'sum2B'] },
  sh: { ins: ['shIn'], sample: true },
  inv1: { ins: ['inv1In', 'inv1A', 'inv1B'], sign: -1 },
  inv2: { ins: ['inv2In', 'inv2A'], sign: -1 },
  esw: { ins: ['eswA', 'eswB'] },
  preamp: { ins: ['preampIn'] },
  hp6: { ins: ['hp6In'] },
  // Easel: the inverter turns 0..10 upside down (10 − x), and the patch field's violet jacks repeat the pressure input
  inv10: { ins: ['inv10In'], sign: -1 },
  pressV: { ins: ['ezPress'] },
  envf: { ins: ['envfIn'], follow: true }, // a source of its own, but only when something reaches its input
};
const UTIL_OF_DEST: Record<string, string | undefined> = {
  att1In: 'att1',
  att1CV: 'att1',
  att2In: 'att2',
  slewIn: 'slew',
  invertIn: 'invert',
  multIn: 'mult',
  sum1A: 'sum1',
  sum1B: 'sum1',
  sum2A: 'sum2',
  sum2B: 'sum2',
  shIn: 'sh',
  inv1In: 'inv1',
  inv1A: 'inv1',
  inv1B: 'inv1',
  inv2In: 'inv2',
  inv2A: 'inv2',
  eswA: 'esw',
  eswB: 'esw',
  preampIn: 'preamp',
  ringA: 'ring',
  ringB: 'ring',
  envfIn: 'envf',
  vibIn: 'vib',
  inv10In: 'inv10',
  ezPress: 'pressV',
  hp6In: 'hp6',
};
const AUDIO_STAGE: Record<string, number | undefined> = {
  osc1: 0,
  osc2: 0,
  osc3: 0,
  noise: 0,
  pink: 0,
  sub: 0,
  ring: 0,
  oscMix: 1,
  mixer: 1,
  vcfHp: 2,
  vcf1: 2,
  vcf2: 2,
  od: 3,
  vca: 4,
  out: 5,
  rev: 5,
  master: 6,
};
for (const n of [1, 2, 3]) for (const w of Object.keys(WAVE_WORD)) AUDIO_STAGE[`o${n}${w}`] = 0;
const IN_STAGE: Record<string, number | undefined> = {
  extIn: 1,
  vcfIn: 2,
  odIn: 3,
  vcaIn: 4,
  delayIn: 5,
  dryIn: 6,
};
const STAGE_NAME: Record<number, string | undefined> = {
  1: 'the mixer',
  2: 'the filter',
  3: 'the overdrive',
  4: 'the amplifier',
  5: 'the delay',
  6: 'the output',
};
/** The stage of an audio input (NaN, which no comparison passes, where the prototype read `undefined`). */
const inStage = (dest: string) => IN_STAGE[dest] ?? NaN;
const stageName = (dest: string) => STAGE_NAME[inStage(dest)];
const GROUP: Record<string, string | undefined> = {
  pitchAll: 'pitch',
  pitch1: 'pitch',
  pitch2: 'pitch',
  pitch3: 'pitch',
  pitch4: 'pitch',
  pw1: 'pw',
  pw2: 'pw',
  pw3: 'pw',
  cutoff: 'cutoff',
  cutoffHp: 'cutoff',
  res: 'res',
  amp: 'amp',
  ampExp: 'amp',
  lfoRate: 'lfoRate',
  delayTime: 'delayTime',
  gate1: 'trig',
  gate2: 'trig',
  lfoTrig: 'trig',
  shClock: 'trig',
  gateIn: 'trig',
  trigIn: 'trig',
  envClk: 'trig',
  ezPulse: 'trig',
  wave1: 'wave',
  wave2: 'wave',
  lvl1: 'level',
  lvl2: 'level',
  extIn: 'audioIn',
  vcfIn: 'audioIn',
  odIn: 'audioIn',
  vcaIn: 'audioIn',
  delayIn: 'audioIn',
  dryIn: 'audioIn',
};
/** Inside-the-synth destinations, in running text, for routes that no single jack names. A SynthDef may override with `destNames`. */
const DEST_NAMES: Record<string, string | undefined> = {
  vcfIn: 'the filter input',
  vcaIn: 'the amplifier input',
  delayIn: 'the delay input',
  cutoff: 'the filter cutoff',
  cutoffHp: 'the high-pass cutoff',
  pitchAll: 'the pitch of every oscillator',
  pitch1: 'Oscillator 1 pitch',
  pitch2: 'Oscillator 2 pitch',
  pitch3: 'Oscillator 3 pitch',
  pitch4: 'Oscillator 4 pitch',
  pw1: 'Oscillator 1 pulse width',
  pw2: 'Oscillator 2 pulse width',
  pw3: 'Oscillator 3 pulse width',
  wave1: 'Oscillator 1 waveform',
  wave2: 'Oscillator 2 waveform',
  lvl1: 'Oscillator 1 level',
  lvl2: 'Oscillator 2 level',
  amp: 'the amplifier',
  ampExp: 'the amplifier',
  res: 'the resonance',
  dryIn: 'the output',
};
const destName = (def: SynthDef, d: string) =>
  (def.destNames && def.destNames[d]) || DEST_NAMES[d] || d;
const KIND_LABEL: Record<string, string> = {
  pitch: 'Pitch modulation',
  pw: 'Pulse-width modulation',
  cutoff: 'Filter modulation',
  res: 'Resonance modulation',
  amp: 'Loudness control',
  lfoRate: 'LFO speed control',
  delayTime: 'Delay-time modulation',
  wave: 'Waveform modulation',
  level: 'Level control',
  trig: 'Trigger',
  audioIn: 'Audio re-route',
  util: 'Utility',
};
const UNIT: Record<string, string | undefined> = {
  pitch: 'the pitch',
  pw: 'the pulse width',
  wave: 'the waveform',
  level: 'the oscillator level',
  cutoff: 'the cutoff',
  res: 'the resonance',
  amp: 'the loudness',
  lfoRate: 'the LFO speed',
  delayTime: 'the delay time',
};
const LFO_SHAPES: Record<string, string | undefined> = {
  tri: 'triangle',
  saw: 'rising ramp',
  rsaw: 'falling ramp',
  sq: 'square',
  sine: 'sine',
};

const r1 = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, '');
const times = (hz: number) =>
  hz >= 0.95
    ? `${hz < 10 ? r1(hz) : Math.round(hz)} times a second`
    : `once every ${r1(1 / hz)} seconds`;
const list = (xs: string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** One voice's engine parameters: the whole EngineParams, or the second module of a two-module synth (`dual.b`). */
type Voice = Omit<EngineParams, 'volume' | 'dual'>;

/** Everything the explainer reads about the panel as it is now. */
interface Ctx {
  def: SynthDef;
  jm: Record<string, Jack | undefined>;
  values: ControlValues;
  cables: CableLike[];
  ep: Voice;
  part: number;
  normals: Record<string, NormalSource | undefined>;
}

/** A real source reached by following a signal back through the utilities. */
interface Leaf {
  root: string;
  sign: number;
  gain: number;
  path: string[];
  loop?: boolean;
  empty?: string;
  of?: string;
  gatedBy?: string | null;
  lagOnly?: boolean;
  cancel?: string | null;
}

/** An envelope by its signal name (`env1v` is Envelope 1 scaled by velocity). */
const envOf = (ep: Voice, name: string): EnvParams => (name.startsWith('env2') ? ep.env2 : ep.env1);
/** The sample-and-hold (a voice that has a `random` or `shClk` source has one; the prototype read it unguarded). */
const shOf = (ep: Voice): SampleHoldParams => ep.sh ?? { rate: 0, glide: 0 };

/**
 * `part`: on a two-module synth (EngineParams `dual`) each module is its own voice, so a jack is read against the
 * settings of its own module (`dual.b` for the second), and only the cables that end in that module count.
 */
function makeCtx(def: SynthDef, values: ControlValues, cables: CableLike[], part = 0): Ctx {
  const jm = jackMap(def);
  const patched = Object.fromEntries(
    cables.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );
  const full = def.toEngine(values, { wheel: 0, patched });
  let ep: Voice = full;
  if (full.dual) {
    if (part === 1) ep = full.dual.b;
    cables = cables.filter((c) => (jm[c.to]?.part || 0) === part);
  }
  return {
    def,
    jm,
    values,
    cables,
    ep,
    part,
    normals: { ...BUILTIN_NORMALS, ...(ep.normals || {}) },
  };
}

/** Signals reaching a destination: every cable into it, plus its normalled source unless a cable has broken that. */
function feeds(ctx: Ctx, dest: string): string[] {
  const out: string[] = [];
  let broken = false;
  for (const c of ctx.cables) {
    const a = ctx.jm[c.from];
    const b = ctx.jm[c.to];
    const sig = signalOf(a);
    if (!a || !b || b.dir !== 'in' || b.dest !== dest || !sig) continue;
    out.push(sig);
    if (!b.add) broken = true;
  }
  const n = ctx.normals[dest];
  if (n && !broken && !(Array.isArray(n) && Math.abs(n[1]) < 0.0001))
    out.push(Array.isArray(n) ? n[0] : n);
  return out;
}
/** The gain a normal applies (a normal may carry one: `['one', -0.5]`). */
const normalGain = (ctx: Ctx, dest: string, sig: string) => {
  const n = ctx.normals[dest];
  return Array.isArray(n) && n[0] === sig ? n[1] : 1;
};

/** Follow a signal back through the utilities to the real sources: [{ root, sign, gain, path }]. */
function resolve(ctx: Ctx, signal: string, seen: string[] = []): Leaf[] {
  // The trapezoid (VCS3) swings negative while its envelope is up, so it reads as an envelope turned upside down.
  if (signal === 'trap') return [{ root: 'trap', sign: -1, gain: 1, path: [signal] }];
  const u = UTIL[signal];
  if (!u) return [{ root: signal, sign: 1, gain: 1, path: [signal] }];
  if (seen.includes(signal))
    return [{ root: 'none', sign: 1, gain: 1, path: [signal], loop: true }];
  const ins = u.ins.flatMap((d) => feeds(ctx, d).map((s): [string, string] => [d, s]));
  if (!ins.length) return [{ root: 'none', sign: 1, gain: 1, path: [signal], empty: signal }];
  const gain = u.att == null ? 1 : (ctx.ep.att || [1, 1])[u.att];
  // a normal's own gain (the 2600's −10 V input is ['one', −level]) scales and may flip what it passes on
  const leaves = ins.flatMap(([d, s]) =>
    resolve(ctx, s, [...seen, signal]).map((l) => {
      const ng = normalGain(ctx, d, s);
      return ng === 1 ? l : { ...l, sign: ng < 0 ? -l.sign : l.sign, gain: l.gain * Math.abs(ng) };
    })
  );
  if (u.follow) {
    const fed = leaves.find((l) => l.root !== 'none');
    return fed
      ? [{ root: signal, sign: 1, gain: 1, path: [signal], of: fed.root }]
      : [{ root: 'none', sign: 1, gain: 1, path: [signal], empty: signal }];
  }
  if (u.sample) {
    const first = leaves[0];
    return [
      {
        ...first,
        root: first.root === 'none' ? 'none' : 'random',
        of: first.root,
        sign: 1,
        path: [signal, ...first.path],
      },
    ];
  }
  let gatedBy: string | null = null;
  if (signal === 'att1') {
    const cv = ctx.cables
      .map((c) => [ctx.jm[c.from], ctx.jm[c.to]])
      .find(([a, b]) => a && b && destOf(b) === 'att1CV' && signalOf(a));
    const cvSig = cv ? signalOf(cv[0]) : null;
    if (cvSig) gatedBy = resolve(ctx, cvSig, [...seen, signal])[0].root;
  }
  return leaves.map((l) => ({
    ...l,
    sign: l.sign * (u.sign || 1),
    gain: l.gain * gain,
    gatedBy: l.gatedBy || gatedBy,
    path: [signal, ...l.path],
  }));
}

/**
 * Copies of one source that meet again (in a summer, or at one input) add up before anything is heard, so they are one signal,
 * not several. With S the signed total of the slewed copies of x and D the total of the plain ones, what arrives is
 *   S·slew(x) + D·x  =  (S + D)·x  +  S·(slew(x) − x).
 * The first part is x at its net strength: nothing when the copies are equal and opposite. The second (`lagOnly`) is zero while x
 * holds still and appears only when x moves: slew(x) − kbd on a pitch input is a glide, not a second dose of keyboard tracking.
 */
function combine(leaves: Leaf[]): Leaf[] {
  const groups = new Map<string, Leaf[]>();
  for (const l of leaves) {
    if (l.root === 'none') continue;
    const key = [l.root, l.of || '', l.gatedBy || '', l.path.includes('esw') ? 'esw' : ''].join(
      '|'
    );
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  const out: Leaf[] = [];
  let cancelled: string | null = null;
  for (const ls of groups.values()) {
    if (ls.length === 1) {
      out.push(ls[0]);
      continue;
    }
    const total = (xs: Leaf[]) => xs.reduce((sum, l) => sum + l.sign * l.gain, 0);
    const slewed = ls.filter((l) => l.path.includes('slew'));
    const plain = ls.filter((l) => !l.path.includes('slew'));
    const S = total(slewed);
    const net = S + total(plain);
    const before = out.length;
    if (Math.abs(net) >= 0.02)
      out.push({ ...(plain[0] || slewed[0]), sign: net < 0 ? -1 : 1, gain: Math.abs(net) });
    if (plain.length && Math.abs(S) >= 0.02)
      out.push({ ...slewed[0], sign: S < 0 ? -1 : 1, gain: Math.abs(S), lagOnly: true });
    if (out.length === before) cancelled = ls[0].root;
  }
  if (out.length) return out;
  const dead = leaves.filter((l) => l.root === 'none');
  return cancelled || !dead.length
    ? [{ root: 'none', sign: 1, gain: 1, path: [], cancel: cancelled }]
    : dead;
}
const slewTime = (ctx: Ctx) => fmtTime((ctx.ep.slew && ctx.ep.slew.time) || 0.1);
/** Sources that move in jumps, so that the difference from their slewed copy is a push after each jump rather than a constant stir. */
const steps = (ctx: Ctx, leaf: Leaf) =>
  ['kbd', 'gate', 'random'].includes(kindOf(ctx, leaf)) ||
  leaf.root === 'lfoSq' ||
  leaf.root === 'shClk';

/** The oscillator a signal comes from (0-based), or -1. */
const oscIndex = (r: string) => {
  const m = OSC_OUT.exec(r) || /^osc([123])$/.exec(r);
  return m ? Number(m[1]) - 1 : -1;
};
/** Frequency of an oscillator that is not following the keyboard (a VCO switched to its LF range, say), else null. */
function freeOscHz(ctx: Ctx, r: string): number | null {
  const k = oscIndex(r);
  const o = k >= 0 ? ctx.ep.osc[k] : null;
  if (!o || o.kbd !== false) return null;
  return 440 * Math.pow(2, ((o.fixedNote == null ? 60 : o.fixedNote) + (o.semi || 0) - 69) / 12);
}
/** Speed of whatever LFO-like thing a leaf is: the LFO itself, or a free-running slow oscillator. */
const leafHz = (ctx: Ctx, leaf: Leaf) => freeOscHz(ctx, leaf.root) || ctx.ep.lfo.rate;
function kindOf(ctx: Ctx, leaf: Leaf): string {
  const r = leaf.root;
  if (r === 'none') return 'none';
  if (r === 'noise') return 'noise';
  const slow = freeOscHz(ctx, r);
  if (slow != null && slow < 20) return 'lfo';
  if (r in AUDIO_STAGE) return 'audio';
  if (r.startsWith('lfo') || r === 'vib') return ctx.ep.lfo.rate >= 20 ? 'fast' : 'lfo';
  if (r === 'env1' || r === 'env2' || r === 'env1v' || r === 'env2v' || r === 'trap') return 'env';
  if (r === 'random') return 'random';
  if (r === 'kbd2') return 'kbd';
  return r === 'gate' || r === 'kbd' ? r : 'other';
}
const OSC_OUT_SHAPE: Record<string, string> = { saw: 'saw', pulse: 'sq', tri: 'tri', sine: 'sine' };
const lfoShape = (ctx: Ctx, root: string): string => {
  if (root === 'lfoTri') return 'tri';
  if (root === 'lfoSq') return 'sq';
  if (root === 'lfoSine' || root === 'vib') return 'sine';
  if (root === 'lfoSaw') return 'saw';
  const ow = OSC_OUT.exec(root);
  if (ow) return OSC_OUT_SHAPE[ow[2]];
  const mix: Record<string, number | undefined> = { ...ctx.ep.lfo.mix };
  return Object.keys(mix).sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))[0] || 'tri';
};
const unipolar = (leaf: Leaf) =>
  ['env1', 'env2', 'env1v', 'env2v', 'gate', 'lfoUni', 'kbd', 'envf', 'shClk', 'one'].includes(
    leaf.root
  );

/** "the LFO (triangle, 5.2 Hz)" – the real source with the facts that matter right now. */
function liveSource(ctx: Ctx, leaf: Leaf): string {
  const { def, ep } = ctx;
  const r = leaf.root;
  if (r === 'none') return 'nothing';
  if (r === 'random') {
    const sh = shOf(ep);
    const clocked = feeds(ctx, 'shClock').length > 0;
    const what =
      leaf.of === 'noise'
        ? 'a new random level'
        : `a new reading of ${sigName(def, leaf.of || 'none')}`;
    return `${what} ${clocked ? 'each time its CLOCK input fires' : times(sh.rate)}${sh.glide > 0.002 ? `, sliding over ${fmtTime(sh.glide)}` : ', in hard steps'}`;
  }
  const slow = freeOscHz(ctx, r);
  if (slow != null && slow < 20)
    return `${sigName(def, r)}, running as a slow modulation source at ${fmtHz(slow)}`;
  if (r === 'lfoTri' || r === 'lfoSq' || r === 'lfoSine' || r === 'lfoSaw')
    return `${sigName(def, r)} (${fmtHz(ep.lfo.rate)})`;
  if (r === 'vib')
    return `${sigName(def, r)} (a ${fmtHz(ep.lfo.rate)} sine${(ep.lfo.vibDelay ?? 0) > 0.05 ? ` that fades in over ${fmtTime(ep.lfo.vibDelay ?? 0)} after each new note` : ''})`;
  if (r.startsWith('lfo'))
    return `${sigName(def, r)} (${LFO_SHAPES[lfoShape(ctx, r)]}, ${fmtHz(ep.lfo.rate)}${r === 'lfoUni' ? ', upwards only' : ''})`;
  if (r === 'trap') {
    const t = ep.trap;
    return `${sigName(def, r)} (it swings negative over ${fmtTime(t?.a || 0)}, holds for ${fmtTime(t?.on || 0)}, comes back over ${fmtTime(t?.d || 0)}${t?.auto ? `, rests for ${fmtTime(t.off || 0)} and starts again on its own` : ' and waits for the next key or the ATTACK button'})`;
  }
  if (r === 'joyX' || r === 'joyY')
    return `${sigName(def, r)}, a steady voltage that changes only when you move the stick`;
  if (r === 'env1' || r === 'env2' || r === 'env1v' || r === 'env2v') {
    const e = envOf(ep, r);
    return `${sigName(def, r)} (${e.a < 0.003 ? 'rises at once' : `rises in ${fmtTime(e.a)}`}, falls to ${Math.round(e.s * 100)}% over ${fmtTime(e.d)}, dies away over ${fmtTime(e.r)} after release)`;
  }
  if (r === 'gate')
    return leaf.path.includes('slew')
      ? `the key gate, slowed down so that it rises over about ${fmtTime((ep.slew && ep.slew.time) || 0.1)} when a key goes down and falls as slowly on release`
      : 'the key gate (fully on while a key is held, off otherwise)';
  if (r === 'kbd') return 'the keyboard pitch (zero at middle C, one step up per octave)';
  if (r === 'noise') return 'noise, which is random at audio rate';
  if (r === 'one') return 'a steady voltage';
  if (r === 'kbd2') return `${sigName(def, r)} (zero at middle C, one step up per octave)`;
  if (r === 'shClk') return `${sigName(def, r)} (a square wave, ${times(shOf(ep).rate)})`;
  if (r === 'envf')
    return `${sigName(def, r)}, a voltage that rises and falls with the loudness of ${leaf.of ? sigName(def, leaf.of) : 'its input'}`;
  if (r in AUDIO_STAGE) return `${sigName(def, r)}, an audio signal`;
  return sigName(def, r);
}

/** What the output jack is carrying at this moment, including anything the utilities have done to it. */
function carriesNow(ctx: Ctx, a: OutputJack, leaves: Leaf[]): string {
  const { def, ep } = ctx;
  if (leaves.every((l) => l.root === 'none')) {
    const l = leaves[0];
    if (l.cancel)
      return `Right now: nothing. Two copies of ${sigName(def, l.cancel)} meet on the way here, equal and opposite, and cancel.`;
    return l.loop
      ? 'Right now: nothing useful, because its input is fed from its own output.'
      : `Right now: nothing. ${cap(sigName(def, l.empty || a.signal || 'none'))} has no signal patched into it.`;
  }
  const parts = leaves
    .filter((l) => l.root !== 'none')
    .map((l) => {
      if (l.lagOnly) {
        return `the difference between ${liveSource(ctx, { ...l, path: [] })} and its slewed copy${Math.abs(l.gain - 1) > 0.02 ? ` (at ${Math.round(l.gain * 100)}% strength)` : ''}, which is nothing while it holds still and ${steps(ctx, l) ? `a push that dies away over ${slewTime(ctx)} each time it jumps` : 'only its quick movements otherwise'}`;
      }
      const bits: string[] = [];
      if (l.sign < 0) bits.push('turned upside down');
      if (l.path.includes('slew') && l.root !== 'gate')
        bits.push(`smoothed over ${fmtTime((ep.slew && ep.slew.time) || 0.1)}`);
      if (l.gatedBy)
        bits.push(`let through only as far as ${sigName(def, l.gatedBy)} opens Attenuator 1`);
      if (l.path.includes('esw'))
        bits.push(`switched in and out by the electronic switch ${times(shOf(ep).rate * 2)}`);
      if (Math.abs(l.gain - 1) > 0.02)
        bits.push(`at ${l.gain < 0.095 ? r1(l.gain * 100) : Math.round(l.gain * 100)}% strength`);
      return `${l.root === 'random' ? `the sample-and-hold, giving ${liveSource(ctx, l)}` : liveSource(ctx, l)}${bits.length ? `, ${bits.join(', ')}` : ''}`;
    });
  return `Right now: ${parts.join(' plus ')}.`;
}

function sizeText(group: string, amount: number): string {
  const a = Math.abs(amount);
  if (group === 'pitch') {
    if (a >= 12 && Math.abs(a / 12 - Math.round(a / 12)) < 0.02)
      return `${Math.round(a / 12)} octave${a >= 23 ? 's' : ''}`;
    return a < 1
      ? `${Math.max(1, Math.round(a * 100))} cents`
      : `${r1(a)} semitone${r1(a) === '1' ? '' : 's'}`;
  }
  if (group === 'cutoff' || group === 'lfoRate' || group === 'delayTime')
    return a < 0.1 ? 'a small fraction of an octave' : `${r1(a)} octave${r1(a) === '1' ? '' : 's'}`;
  return `${Math.round(a * 100)}% of its range`;
}
function depthText(group: string, amount: number, leaf: Leaf): string {
  if (Math.abs(amount) < 0.0005) return 'by nothing at all until the depth is turned up';
  const size = sizeText(group, amount);
  if (leaf.root === 'kbd') return `${size} for each octave you play`;
  if (!unipolar(leaf)) return `up to ${size} either way`;
  return `${leaf.sign * Math.sign(amount || 1) < 0 ? 'down' : 'up'} by as much as ${size}`;
}

// ── "What you will hear", by destination group and kind of source ───────────
type HearFn = (x: JackHearContext) => string;
const HEAR: Record<string, Record<string, HearFn | undefined> | undefined> = {
  pitch: {
    lfo: (x) =>
      x.shape === 'sq'
        ? `A trill: ${x.target} jump${x.plural ? '' : 's'} between two pitches ${times(x.hz)}, ${x.depth}.`
        : x.hz < 1 && x.amount > 2
          ? `A slow pitch sweep: ${x.target} glide${x.plural ? '' : 's'} up and down ${times(x.hz)}, ${x.depth}. At this speed and width you hear a rising and falling siren, not a vibrato.`
          : `Vibrato: the pitch of ${x.target} rises and falls ${times(x.hz)}, ${x.depth}.${x.amount > 2 ? ' That is far wider than a musical vibrato, so expect a siren.' : ''}`,
    fast: (x) =>
      `Frequency modulation. The LFO is running at ${fmtHz(x.hz)}, too fast to hear as a wobble, so ${x.target} gain${x.plural ? '' : 's'} rough, clangy overtones instead. The LFO does not follow the keyboard, so each note has a different tone.`,
    audio: (x) =>
      x.self
        ? `${cap(x.target)} is bending its own pitch at audio rate. Its waveform leans over and the tone gets brighter and harsher as the depth rises.`
        : `Frequency modulation: ${x.src} shakes the pitch of ${x.target} at audio rate. You do not hear a wobble; you hear new, clangy, metallic overtones. More depth gives more of them (here ${x.depth}).`,
    noise: (x) =>
      `The pitch of ${x.target} jitters at random, ${x.depth}. Small amounts roughen the tone; large amounts turn it into pitched noise.`,
    env: (x) =>
      x.synced
        ? `${cap(x.target)} is hard-synced, so its pitch cannot move. The envelope sweeps its tone instead: each note starts with sharp, tearing harmonics and mellows as the envelope falls. This is the classic sync sweep.`
        : x.sign < 0
          ? `Each note dips by as much as ${x.size} as the envelope rises, then climbs back to pitch as it falls.`
          : `The pitch of ${x.target} follows the envelope: each note rises by as much as ${x.size}, then falls back to pitch as the envelope decays. A short decay gives a drum-like thump or a "pew"; a long one gives a slow swoop.`,
    gate: (x) =>
      `While a key is held the pitch of ${x.target} is shifted ${x.depth}. Every note is shifted the same, so it just sounds transposed.`,
    kbd: (x) => {
      const step = 1 + (x.sign * x.amount) / 12;
      const whole = Math.abs(step - Math.round(step)) < 0.02 && Math.round(step) !== 0;
      const n = Math.abs(Math.round(step));
      if (whole && step < 0) {
        return `The keyboard now reaches ${x.target} twice: once as normal, and again, upside down, through this cable (${x.depth}). The second wins, so the keyboard runs backwards: playing up the keys makes the pitch go down${n === 1 ? ', one semitone per key, and every note is still in tune' : `, ${n} semitones per key`}. Middle C stays where it is.`;
      }
      return `The keyboard now reaches ${x.target} twice: once as normal, and again through this cable (${x.depth}). ${
        whole
          ? `Each key is now exactly ${n} semitone${n === 1 ? '' : 's'} from the next, so every note is in tune but is not the note the key normally plays. Wide, leaping patterns come out of ordinary fingerings.`
          : `Notes land ${step < 1 ? 'closer together' : 'further apart'} than normal semitones, so scales come out stretched and out of tune.`
      } Middle C stays where it is.`;
    },
    random: (x) =>
      `The pitch of ${x.target} moves to ${x.live}, ${x.depth}. ${x.stepped ? `The readings come from ${x.stepped}, not from noise, so the steps trace its shape: a slow ramp or triangle comes out as a repeating staircase of notes.` : 'Wide settings give an atonal burble; turned well down it becomes a random melody.'}`,
  },
  pw: {
    lfo: (x) =>
      `Pulse-width modulation: the pulse wave of ${x.target} gets thinner and fatter ${times(x.hz)}. The ear hears that as a chorus-like shimmer, as if two oscillators were drifting against each other.`,
    fast: (x) =>
      `The pulse width of ${x.target} is shaken at ${fmtHz(x.hz)}, which adds a buzzing, ring-modulator-like edge to the pulse wave.`,
    audio: (x) =>
      `${cap(x.src)} shakes the pulse width of ${x.target} at audio rate, adding a harsh, buzzing edge to the pulse wave.`,
    noise: (x) =>
      `Noise jitters the pulse width of ${x.target}, which adds a gritty hiss to the pulse wave.`,
    env: (x) =>
      `The pulse width of ${x.target} follows the envelope, ${x.depth}. Each note changes tone as it sounds, between hollow (square) and thin and nasal (narrow).`,
    gate: (x) =>
      `While a key is held the pulse width of ${x.target} is shifted ${x.depth}. It is a fixed change of tone, the same as turning the width knob.`,
    kbd: (x) =>
      `The pulse width of ${x.target} changes across the keyboard (${x.depth}), so high and low notes have different tones.`,
    random: (x) =>
      `The pulse width of ${x.target} moves to ${x.live}, so the tone flickers between hollow and nasal.`,
  },
  cutoff: {
    lfo: (x) =>
      x.shape === 'sq'
        ? `The filter snaps between two settings ${times(x.hz)} (${x.depth}): a choppy bright-dark-bright-dark effect.`
        : x.shape === 'saw' || x.shape === 'rsaw'
          ? `A repeating filter sweep ${times(x.hz)} (${x.depth}): the tone ${(x.shape === 'saw') === x.sign > 0 ? 'brightens steadily, then drops back' : 'jumps bright, then darkens steadily'}.`
          : `Filter wobble: the cutoff rises and falls ${times(x.hz)}, ${x.depth}. Slow rates sound like a sweep, faster ones like a "wah-wah" or a dubstep wobble.`,
    fast: (x) =>
      `Audio-rate filter modulation: the LFO is at ${fmtHz(x.hz)}, so the wobble blurs into a rasping growl laid over the note. The LFO rate sets the pitch of the rasp.`,
    audio: (x) =>
      `${cap(x.src)} shakes the cutoff at audio rate (${x.depth} at full level; a quieter source moves it less). Instead of a sweep you hear a rasp or growl on top of the note, strongest when the filter is part closed and resonance is up.`,
    noise: (x) =>
      `Noise shakes the cutoff (${x.depth}), which adds a crackling, breathy roughness to the tone.`,
    env: (x) =>
      x.sign < 0
        ? `The envelope now pulls the cutoff down by as much as ${x.size}. Each note gets darker as the envelope rises and brightens again as it falls: the reverse of the usual filter pluck.`
        : `The envelope pushes the cutoff ${x.depth} on every note, then lets it fall back. A short decay gives a pluck or "wow"; a slow attack gives a brassy swell.`,
    gate: (x) =>
      `The filter jumps ${x.sign < 0 ? 'shut' : 'open'} by ${x.size} the moment a key goes down and snaps back on release. Notes are ${x.sign < 0 ? 'dull' : 'bright'} while held, and the release tail is ${x.sign < 0 ? 'brighter' : 'duller'}.`,
    kbd: (x) =>
      `Key tracking by cable: the cutoff moves ${x.depth}, so ${x.sign < 0 ? 'higher notes get duller' : 'higher notes stay as bright as low ones (or brighter)'}.`,
    random: (x) =>
      `The cutoff moves to ${x.live} (${x.depth}).${x.smooth ? ' With the glide this long the steps blur into a slow, aimless drift in brightness.' : ' With resonance up, each step rings at its own pitch: the burbling "computer" effect.'}`,
  },
  res: {
    lfo: (x) =>
      `The resonance swells and fades ${times(x.hz)}, so the whistling edge of the filter comes and goes.`,
    fast: () =>
      'The resonance is shaken at audio rate, which adds a thin, gritty edge around the cutoff frequency.',
    audio: (x) =>
      `${cap(x.src)} shakes the resonance at audio rate, which adds a thin, gritty edge around the cutoff frequency.`,
    noise: () => 'Noise jitters the resonance, which makes the resonant peak sputter.',
    env: (x) =>
      x.sign < 0
        ? 'Resonance drops as the envelope rises, so each note starts plain and gets more squelchy as it fades.'
        : 'Resonance rises and falls with the envelope: each note starts squelchy and whistling, then dries out as the envelope falls.',
    gate: () => 'Resonance jumps up while a key is held and drops back on release.',
    kbd: (x) =>
      `Resonance changes across the keyboard: ${x.sign < 0 ? 'lower' : 'higher'} notes ring more.`,
    random: (x) => `Resonance moves to ${x.live}, so some steps whistle and others do not.`,
  },
  amp: {
    lfo: (x) =>
      x.replaced
        ? `Loudness now follows the LFO instead of ${x.normal}. The sound pulses ${times(x.hz)}${x.gated ? '' : ' whether or not a key is held; the keys only change the pitch'}.${x.uni ? '' : ' During the lower half of each LFO cycle the amplifier is shut, so you get equal bursts of sound and silence.'}`
        : `Tremolo: the volume rises and falls ${times(x.hz)} on top of the loudness envelope.${x.uni || x.gated ? '' : ' The LFO is added to the envelope, so the upper half of each LFO cycle also opens the amplifier a little when no key is held.'}`,
    fast: (x) =>
      `Amplitude modulation at ${fmtHz(x.hz)}: too fast to hear as tremolo, it adds bell-like, ring-modulator overtones that do not follow the keyboard.${x.leaks}`,
    audio: (x) =>
      `Amplitude modulation: ${x.src} opens and shuts the amplifier at audio rate, adding ring-modulator-like overtones.${x.replaced ? ` ${cap(x.normal)} no longer shapes the loudness, so sound comes through with no key held.` : x.leaks}`,
    noise: (x) =>
      `Noise shakes the volume, which makes the sound gritty and torn.${x.replaced ? ` ${cap(x.normal)} no longer shapes the loudness.` : ''}`,
    env: (x) =>
      x.same
        ? x.shared
          ? `${cap(x.src)} still shapes the loudness, just as it does with no cable in.`
          : 'This is the connection the synth already makes inside, so nothing changes.'
        : x.replaced
          ? `Loudness now follows ${x.src} instead of ${x.normal}. ${cap(x.normal)} still runs, and is free to be patched to something else.`
          : x.doubles
            ? `${cap(x.src)} is already what drives the amplifier, so this doubles it: every note keeps the same shape and comes out louder.`
            : `${cap(x.src)} adds to the loudness envelope, so its shape is laid over the volume of each note.`,
    gate: (x) =>
      x.replaced
        ? `Loudness is simply on while a key is down and off when it is released, like an organ. ${cap(x.normal)} no longer shapes the volume.`
        : 'The amplifier is pushed fully open for as long as a key is held, whatever the loudness envelope is doing.',
    kbd: () =>
      'Loudness follows the keyboard: notes above middle C get louder the higher you play, and the amplifier never fully closes between them.',
    random: (x) =>
      `The volume moves to ${x.live}, so notes come out at random levels.${x.replaced ? ` ${cap(x.normal)} no longer shapes the loudness.` : ''}`,
  },
  lfoRate: {
    lfo: () =>
      'The LFO changes its own speed as it goes, which bends its cycle into a lopsided shape: it lingers at one end and hurries through the other.',
    fast: () =>
      'The LFO changes its own speed as it goes, which bends its cycle into a lopsided shape.',
    audio: (x) =>
      `${cap(x.src)} jitters the LFO speed at audio rate, which blurs the LFO into something closer to noise.`,
    noise: () => 'Noise jitters the LFO speed, so the wobble becomes unsteady.',
    env: (x) =>
      `The LFO ${x.sign < 0 ? 'slows down' : 'speeds up'} as the envelope rises and ${x.sign < 0 ? 'speeds up' : 'slows down'} again as it falls (${x.depth}). ${x.slowAttack ? `This envelope takes ${x.slowAttack} to rise, so the change of speed comes on gradually over the start of each note and reverses as the envelope falls.` : `Every note starts with a ${x.sign < 0 ? 'slow wobble that quickens' : 'fast wobble that relaxes'}.`}`,
    gate: (x) =>
      `The LFO runs ${x.sign < 0 ? 'slower' : 'faster'} while a key is held (${x.depth}) and goes back to the knob setting on release.`,
    kbd: (x) =>
      `LFO speed follows the keyboard, ${x.depth}: ${x.sign < 0 ? 'lower' : 'higher'} notes wobble faster.`,
    random: (x) => `The LFO speed moves to ${x.live}, so the wobble keeps changing pace.`,
  },
  wave: {
    lfo: (x) =>
      `The waveform of ${x.target} sweeps back and forth ${times(x.hz)}, ${x.depth}: the tone swings between smooth and buzzy, like a filter sweep that stays in step with each oscillator.`,
    fast: (x) =>
      `The waveform of ${x.target} is shaken at ${fmtHz(x.hz)}, which roughens the tone with a buzzing edge.`,
    audio: (x) =>
      `${cap(x.src)} moves the waveform of ${x.target} at audio rate, which adds harsh, metallic overtones.`,
    noise: (x) => `Noise jitters the waveform of ${x.target}, which makes the tone gritty.`,
    env: (x) =>
      `The waveform of ${x.target} follows the envelope, ${x.depth}: each note changes shape as it sounds, ${x.sign < 0 ? 'starting smoother and getting brighter as the envelope falls' : 'starting brighter and settling back as the envelope falls'}.`,
    gate: (x) =>
      `While a key is held the waveform of ${x.target} is shifted ${x.depth}. It is a fixed change of tone, the same as turning the WAVEFORM knob.`,
    kbd: (x) =>
      `The waveform of ${x.target} changes across the keyboard (${x.depth}), so high and low notes have different tones.`,
    random: (x) => `The waveform of ${x.target} moves to ${x.live}, so each step has its own tone.`,
  },
  level: {
    lfo: (x) =>
      `The level of ${x.target} rises and falls ${times(x.hz)}, ${x.depth}. With the other oscillator at a steady level, the mix pulses between the two.`,
    fast: (x) =>
      `The level of ${x.target} is shaken at ${fmtHz(x.hz)}: amplitude modulation, which adds bell-like overtones to that oscillator.`,
    audio: (x) =>
      `${cap(x.src)} opens and shuts ${x.target} at audio rate: amplitude modulation, which adds ring-modulator-like overtones to it.`,
    noise: (x) => `Noise shakes the level of ${x.target}, which makes it gritty and torn.`,
    env: (x) =>
      `The level of ${x.target} follows the envelope, ${x.depth}. Patch the other envelope to the other oscillator and each note crossfades from one to the other.`,
    gate: (x) => `${cap(x.target)} is pushed up ${x.depth} while a key is held.`,
    kbd: (x) =>
      `The level of ${x.target} follows the keyboard (${x.depth}), so the mix changes across the range.`,
    random: (x) =>
      `The level of ${x.target} moves to ${x.live}, so the balance of the two oscillators keeps changing.`,
  },
  delayTime: {
    lfo: (x) =>
      `The delay time drifts ${times(x.hz)} (${x.depth}). Changing delay time bends the pitch of the echoes, so small amounts give a chorus or tape-flutter effect and large amounts give a seasick warble.`,
    fast: () =>
      'The delay time is shaken at audio rate, which smears the echoes into a metallic, flanger-like blur.',
    audio: (x) =>
      `${cap(x.src)} shakes the delay time at audio rate, which smears the echoes into a grainy, metallic blur.`,
    noise: () => 'Noise jitters the delay time, which makes the echoes grainy and unstable.',
    env: () =>
      'The delay time moves with the envelope, so the echoes bend in pitch at the start of every note and settle as it fades.',
    gate: () =>
      'The delay time jumps while a key is held and jumps back on release. Each jump bends the pitch of echoes already in the delay.',
    kbd: () =>
      'The delay time follows the keyboard, so every new note bends the pitch of the echoes already sounding.',
    random: (x) =>
      `The delay time moves to ${x.live}, and every change bends the pitch of the echoes.`,
  },
};

function hearTrig(ctx: Ctx, b: InputJack, x: JackHearContext): string {
  const { def } = ctx;
  const d = b.dest || '';
  const both = d === 'gateIn' || d === 'trigIn' || d === 'envClk';
  const gateIn = d === 'gate1' || d === 'gate2' || both;
  const what = both
    ? 'the envelopes set to this input'
    : gateIn
      ? sigName(def, d === 'gate1' ? 'env1' : 'env2')
      : d === 'lfoTrig'
        ? 'the LFO'
        : 'the sample-and-hold';
  const fires = both
    ? 'The envelopes set to this input fire'
    : gateIn
      ? `${cap(what)} fires`
      : d === 'lfoTrig'
        ? 'The LFO restarts its cycle'
        : 'The sample-and-hold takes a new reading';
  const tail = d === 'shClock' ? ' Its RATE knob no longer has any effect.' : '';
  if (x.kind === 'gate') {
    if (gateIn && d !== 'envClk')
      return `${cap(what)} already gets the key gate inside the synth, so this cable changes nothing${x.replaced ? ' unless another cable had replaced it' : ''}.`;
    return `${fires} each time you press a key.${d === 'lfoTrig' ? ' Every note starts at the same point in the wobble.' : ' You get one new value per note.'}${tail}`;
  }
  if (x.kind === 'lfo' || x.kind === 'fast') {
    const keys =
      !gateIn || x.gated
        ? ''
        : x.replaced
          ? ` The keys no longer fire ${what}; they only set the pitch, and the pulses carry on with no key held.`
          : ' This input adds to the key gate, so the pulses also carry on with no key held.';
    const result = gateIn
      ? ' A held note turns into a stream of repeated notes or filter pulses, as long as the envelope is short enough to finish between them.'
      : '';
    return `${fires} on every ${x.slowOsc ? 'cycle of the slow oscillator' : 'LFO cycle'}, ${times(x.hz)}.${result}${keys}${tail}`;
  }
  if (x.kind === 'audio' || x.kind === 'noise')
    return `${fires} every time ${x.src} swings past half level, which is ${x.kind === 'noise' ? 'at random, many times a second' : 'hundreds of times a second'}. Expect a buzz or a stutter rather than a rhythm.${tail}`;
  if (x.kind === 'random')
    return `${fires} whenever the sample-and-hold lands on a value above half level, so it fires at irregular moments.${tail}`;
  return `${fires} each time ${x.src} rises past half level.${tail}`;
}

function hearAudioIn(ctx: Ctx, _a: OutputJack, b: InputJack, x: JackHearContext): string {
  const { ep } = ctx;
  const dest = b.dest || '';
  const into = stageName(dest) || '';
  const lost =
    x.replaced && x.normal
      ? ` ${cap(x.normal)} is disconnected from ${into} while the cable is in.`
      : '';
  if (x.kind === 'none') return `Nothing: no signal is on this cable yet.${lost}`;
  if (x.kind !== 'audio' && x.kind !== 'noise' && x.kind !== 'fast' && dest === 'extIn') {
    return `${cap(x.src)} is a slow control signal, not a sound, and this input only adds to the mixer, so the oscillators carry on as normal. What you get is a click or thump each time the signal jumps: an envelope with an instant attack puts a thump on the front of every note. The level knob for this input sets how hard.${lost}`;
  }
  if (x.kind !== 'audio' && x.kind !== 'noise' && x.kind !== 'fast') {
    const res = dest === 'vcfIn' ? ep.filter.res : 0;
    const rings =
      res >= 0.98
        ? ' With resonance this high the filter rings on its own, and each click sets it ringing, so the filter itself becomes the sound source.'
        : res >= 0.8
          ? ' With resonance this high, every sudden jump in the signal "pings" the filter: it rings briefly at the cutoff pitch and dies away, like a struck block. The filter becomes the sound source, and the cutoff sets its pitch.'
          : '';
    return `${cap(x.src)} is a slow control signal, not a sound. Fed into ${into} it gives clicks and thumps at most.${x.replaced ? `${lost}${rings || ' That usually means silence.'}` : rings}`;
  }
  const s = x.kind === 'fast' ? 1 : (AUDIO_STAGE[x.root] ?? 0);
  const dStage = inStage(dest);
  if (x.same && x.shared)
    return `${cap(x.src)} still reaches ${into}, just as it does with no cable in.`;
  if (x.same)
    return `This is the connection the synth already makes inside${s >= dStage ? ' (its built-in feedback loop)' : ''}, so the sound does not change. On the hardware a cable here does the same job as the internal wiring.`;
  if (x.kind !== 'fast' && s >= dStage) {
    return `A feedback loop: ${x.src} is taken from after ${into} and fed back into it. A little thickens and compresses the tone; more overdrives it, and with resonance up it can howl.${dest === 'extIn' ? ' The level knob for this input sets how much goes round the loop.' : ''}${lost}`;
  }
  const skipped: string[] = [];
  for (let k = s + 1; k < dStage; k++)
    if ((k !== 3 || (ep.od && ep.od.on)) && (k !== 5 || (ep.delay && ep.delay.on)))
      skipped.push(STAGE_NAME[k] || '');
  const mixIn = dest === 'extIn';
  const first =
    x.kind === 'fast'
      ? `The LFO is running at ${fmtHz(x.hz)}, fast enough to be heard as a tone, and it now feeds ${into}. Its pitch does not follow the keyboard.`
      : mixIn
        ? `${cap(x.src)} is mixed in alongside the oscillators, at the level set by this input’s level knob.`
        : `${cap(into)} now hears ${x.src}${x.replaced && x.normal ? ` instead of ${x.normal}` : ''}.`;
  const skip =
    skipped.length && !mixIn && !b.add
      ? ` The signal skips ${list(skipped)}, so ${skipped.length > 1 ? 'their' : 'its'} controls no longer affect it.`
      : '';
  const after = dest === 'vcaIn' ? ' It is still shaped by the loudness envelope.' : '';
  return `${first}${skip}${after}`;
}

/** Where a utility's output goes at the moment: internal wiring plus cables. */
function consumers(ctx: Ctx, signal: string): string[] {
  const names: string[] = [];
  const cabledIn = (dest: string) =>
    ctx.cables.some((c) => {
      const j = ctx.jm[c.to];
      return j && j.dir === 'in' && j.dest === dest && !j.add;
    });
  for (const [dest, n] of Object.entries(ctx.normals)) {
    if (normalSignal(n) !== signal || cabledIn(dest)) continue;
    const j = ctx.def.jacks.find(
      (k) => k.dir === 'in' && k.dest === dest && (k.part || 0) === ctx.part
    );
    names.push(`${j ? j.label : dest} (wired inside)`);
  }
  for (const r of ctx.ep.routes || []) {
    if (r.src === signal && Math.abs(r.amt) > 0.0005)
      names.push(`${destName(ctx.def, r.dst)} (wired inside)`);
  }
  for (const c of ctx.cables) {
    const a = ctx.jm[c.from];
    const b = ctx.jm[c.to];
    if (a && b && signalOf(a) === signal) names.push(`${b.label} (by cable)`);
  }
  return [...new Set(names)];
}

function hearUtil(ctx: Ctx, b: InputJack, x: JackHearContext): string {
  const { def } = ctx;
  const dest = b.dest || '';
  const u = UTIL_OF_DEST[dest];
  if (!u) return `${cap(x.src)} now feeds ${b.label}.`;
  const name = sigName(def, u);
  const jobs: Record<string, string | undefined> = {
    att1In: `${cap(name)} now sets the level of ${x.src} with its knob.`,
    att2In: `${cap(name)} now sets the level of ${x.src} with its knob.`,
    att1CV: `${cap(x.src)} now sets how far Attenuator 1 is open, so it works as a second voltage-controlled amplifier for whatever is patched into its input.`,
    slewIn: `The slew limiter now follows ${x.src} but cannot move quickly, so jumps come out as slides.`,
    invertIn: `The inverter now turns ${x.src} upside down: rises become falls.`,
    multIn: `The multiple now copies ${x.src} to both of its outputs.`,
    shIn: `The sample-and-hold now takes its readings from ${x.src}${x.replaced && x.normal ? ` instead of ${x.normal}` : ''}, and holds each one as a fixed step until the next.`,
    inv1In: `Inverter 1 now adds ${x.src} to its other inputs and turns the total upside down.`,
    inv1A: `Inverter 1 now takes ${x.src}${x.replaced && x.normal ? ` instead of ${x.normal}` : ''}, scaled by this input’s slider, adds it to its other inputs and turns the total upside down.`,
    inv1B: `Inverter 1 now takes ${x.src}${x.replaced && x.normal ? ` instead of ${x.normal}` : ''}, scaled by this input’s slider, adds it to its other inputs and turns the total upside down.`,
    inv2In: `Inverter 2 now adds ${x.src} to its other input and turns the total upside down.`,
    inv2A: `Inverter 2 now takes ${x.src}${x.replaced && x.normal ? ` instead of ${x.normal}` : ''}, scaled by this input’s slider, and turns it upside down.`,
    eswA: `The electronic switch now passes ${x.src} for one half of each sample-and-hold clock cycle, and its other input for the other half.`,
    eswB: `The electronic switch now passes ${x.src} for one half of each sample-and-hold clock cycle, and its other input for the other half.`,
    preampIn: `The preamp now amplifies ${x.src}. It is built for quiet outside signals, so a signal from the synth itself comes out heavily clipped unless GAIN is low.`,
    ringA: `The ring modulator now multiplies ${x.src}${x.normal ? ` (added to ${x.normal})` : ''} with its other input. The result keeps neither pitch: you hear the sum and difference of the two, which is the clangy, bell-like ring-mod sound.`,
    ringB: `The ring modulator now multiplies ${x.src}${x.normal ? ` (added to ${x.normal})` : ''} with its other input. The result keeps neither pitch: you hear the sum and difference of the two, which is the clangy, bell-like ring-mod sound.`,
    envfIn: `The envelope follower now tracks how loud ${x.src} is and turns that into a control voltage.`,
    vibIn: `${cap(x.src)} is now added to the delayed vibrato signal.`,
    hp6In: `The high-pass filter now takes ${x.src} and removes its low end below the cutoff set on the panel, so it comes out thinner.`,
  };
  const job = jobs[dest] || `${cap(name)} adds ${x.src} to whatever is on its other input.`;
  const to = consumers(ctx, u);
  const outs = def.jacks.filter((j) => j.dir === 'out' && j.signal === u).map((j) => j.label);
  const where = to.length
    ? ` Its output currently goes to ${list(to)}, so that is where you will hear the change.`
    : ` On its own this changes nothing you can hear, because nothing is connected to its output yet. Patch ${list(outs)} to a destination next.`;
  return `${job}${where}`;
}

/** Is the LFO reaching anything audible: a panel routing, the internal wiring, a cable, or REPEAT mode? */
function lfoInUse(ctx: Ctx): boolean {
  const { ep } = ctx;
  const viaLfo = (sig: string, g = 1) =>
    resolve(ctx, sig).some((l) => l.root.startsWith('lfo') && Math.abs(l.gain * g) > 0.001);
  if (ep.trig && ep.trig.repeat) return true;
  if ((ep.routes || []).some((r) => r.src.startsWith('lfo') && Math.abs(r.amt) > 0.0005))
    return true;
  if (
    ctx.cables.some((c) => {
      const sig = signalOf(ctx.jm[c.from]);
      const dest = destOf(ctx.jm[c.to]);
      return !!dest && !!GROUP[dest] && !!sig && viaLfo(sig);
    })
  )
    return true;
  return Object.entries(ctx.normals).some(([dest, n]) => {
    const sig = normalSignal(n);
    return (
      !!GROUP[dest] &&
      sig != null &&
      feeds(ctx, dest).includes(sig) &&
      viaLfo(sig, Array.isArray(n) ? n[1] : 1)
    );
  });
}

const targetName = (ctx: Ctx, dest: string): string => {
  const { def, ep } = ctx;
  if (dest === 'pitchAll') return ep.osc.length === 2 ? 'both oscillators' : 'all the oscillators';
  if (dest.startsWith('pitch')) return sigName(def, `osc${dest.slice(5)}`);
  if (dest === 'pw1') return sigName(def, 'osc1');
  if (dest === 'pw2') return sigName(def, 'osc2');
  if (dest === 'pw3') return sigName(def, 'osc3');
  if (/^(wave|lvl)[12]$/.test(dest)) return sigName(def, `osc${dest.slice(-1)}`);
  return '';
};

/** What the explainer says about one cable. */
export interface CableExplanation {
  from: string;
  to: string;
  /** The cable is in; otherwise the player is only thinking about it. */
  plugged: boolean;
  title: string;
  fromLabel: string;
  toLabel: string;
  fromHelp: string;
  toHelp: string;
  /** What sort of connection it is: `Pitch modulation`, `Feedback loop`, `Not modelled` … */
  kind: string;
  /** False when one end is a jack the engine does not model. */
  modelled: boolean;
  /** What the output jack carries right now. */
  carries: string;
  /** What the input jack does with it. */
  does: string;
  /** What you will hear. */
  hear: string;
  /** Things that would stop you hearing it. */
  warnings: string[];
}

/**
 * Explain the cable `from` (output jack id) → `to` (input jack id) with the panel as it is now.
 * Works for a cable that is already plugged in and for one the player is only thinking about.
 * Returns null when the pair is not an output and an input.
 */
export function explainCable(
  def: SynthDef,
  from: string,
  to: string,
  values: ControlValues,
  cables: CableLike[] = []
): CableExplanation | null {
  const jm = jackMap(def);
  const a = jm[from];
  const b = jm[to];
  if (!a || !b || a.dir !== 'out' || b.dir !== 'in') return null;
  const plugged = cables.some((c) => c.from === from && c.to === to);
  const all = plugged ? cables : [...cables, { from, to }];
  const base = {
    from,
    to,
    plugged,
    title: `${jackName(a)} → ${jackName(b)}`,
    fromLabel: jackName(a),
    toLabel: jackName(b),
    fromHelp: a.help,
    toHelp: b.help,
    warnings: [],
  };
  if (!a.signal || !b.dest) {
    const dead = !a.signal ? a : b;
    return {
      ...base,
      kind: 'Not modelled',
      modelled: false,
      carries: '',
      does: '',
      hear: `Nothing in this app. ${jackName(dead)} is on the panel so the layout matches the hardware, but the sound engine does not model it, so this cable has no audible effect here.`,
    };
  }
  const aSignal = a.signal;
  const bDest = b.dest;

  // A Moog 900-series modular has its own explainer: separate modules, everything in volts.
  const patched = Object.fromEntries(
    all.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );
  const ep0 = def.toEngine(values, { wheel: 0, patched });
  if (ep0.moog) return explainMoog(def, ep0, from, to, values, cables);
  const ctx = makeCtx(def, values, all, b.part || 0);
  const { ep } = ctx;
  // A cable from one module of a two-module synth to the other: the source is read against its own module.
  const sctx = (a.part || 0) === (b.part || 0) ? ctx : makeCtx(def, values, all, a.part || 0);
  const leaves = combine(resolve(sctx, aSignal));
  const live = leaves.filter((l) => l.root !== 'none');
  const group = GROUP[bDest] || 'util';
  const controlGroup = !['trig', 'audioIn', 'util'].includes(group);
  // An output jack's `gain` (a VCS3 row's level knob) scales the signal before it reaches the input.
  const jackAmt = jackDepth(b, values) * jackGain(a, values);
  const normal = ctx.normals[bDest];
  const normalSig = normalSignal(normal);
  const replaced = !b.add;
  const others = ctx.cables
    .filter((c) => c.to === to && c.from !== from && jm[c.from])
    .map((c) => {
      const j = jm[c.from];
      return j ? jackName(j) : c.from;
    });
  const unit = UNIT[group] || '';

  // what the input does with it
  const does: string[] = [];
  // A jack's own `does` (string or function of the values) replaces the generic first sentence about depth.
  const ownDoes = typeof b.does === 'function' ? b.does(values) : b.does;
  if (ownDoes) does.push(ownDoes);
  else if (controlGroup && Math.abs(jackAmt) < 0.0005)
    does.push(
      `The depth knob for this input is at zero, so at the moment nothing arriving here moves ${unit}.`
    );
  else if (controlGroup)
    does.push(
      `A full-strength signal here moves ${unit} by as much as ${sizeText(group, jackAmt)}${typeof b.amt === 'function' ? ', with its depth knob where it is now' : ''}: up when the signal is positive, down when it is negative.`
    );
  if (group === 'audioIn' && bDest === 'extIn')
    does.push(
      'This is an extra audio input to the mixer. Whatever arrives is mixed in alongside the oscillators, at the level set by this input’s own level knob.'
    );
  if (group === 'trig')
    does.push(
      'This is a trigger input: it fires each time the incoming signal rises past half level. Only the moment of crossing matters, not the shape.'
    );
  if (normalSig)
    does.push(
      replaced
        ? `Inside the synth this input is fed by ${sigName(def, normalSig)}. A cable here disconnects that.`
        : `Inside the synth this input is also fed by ${sigName(def, normalSig)}. The cable adds to it.`
    );
  else if (controlGroup)
    does.push(
      b.add
        ? 'The cable adds to the panel setting and to any other modulation already going there.'
        : 'Nothing is wired to it inside the synth, so the cable is its only source.'
    );
  if (others.length)
    does.push(
      `${list(others)} ${others.length > 1 ? 'are' : 'is'} plugged in here too. Signals into the same input add together.`
    );

  // what you will hear, per real source
  const hearOne = (leaf: Leaf): string => {
    const kind = kindOf(sctx, leaf);
    const amount = jackAmt * leaf.gain;
    const oscIdx =
      bDest.startsWith('pitch') && bDest !== 'pitchAll' ? Number(bDest.slice(5)) - 1 : -1;
    const x: JackHearContext = {
      kind,
      root: leaf.root,
      sign: leaf.sign * (jackAmt < 0 ? -1 : 1),
      amount: Math.abs(amount),
      hz: leafHz(sctx, leaf),
      shape: lfoShape(sctx, leaf.root),
      slowOsc: freeOscHz(sctx, leaf.root) != null,
      src: leaf.lagOnly
        ? `the difference between ${sigName(def, leaf.root)} and its slewed copy`
        : leaf.path.includes('slew')
          ? `the slewed copy of ${sigName(def, leaf.root)}`
          : sigName(def, leaf.root),
      live: liveSource(sctx, leaf),
      target: targetName(ctx, bDest),
      plural: bDest === 'pitchAll',
      uni: unipolar(leaf),
      size: sizeText(group, amount),
      depth: depthText(group, amount, leaf),
      normal: normalSig ? sigName(def, normalSig) : '',
      // The normalled source can come back down the cable (through a summer, say): then nothing has really been replaced.
      replaced: replaced && !(normalKept && leaf.root !== normalSig),
      shared: live.length > 1,
      same:
        replaced &&
        normalSig === leaf.root &&
        leaf.sign > 0 &&
        Math.abs(amount - (Array.isArray(normal) ? normal[1] : 1)) < 0.05,
      slowAttack:
        (leaf.root === 'env1' || leaf.root === 'env2') && envOf(sctx.ep, leaf.root).a > 0.1
          ? fmtTime(envOf(sctx.ep, leaf.root).a)
          : '',
      leaks:
        !replaced && !leaf.gatedBy && !unipolar(leaf)
          ? ' This input adds to the loudness envelope, so the upper half of every swing also holds the amplifier part open with no key held. Unless the filter is shut at rest, the oscillators will drone between notes.'
          : '',
      gated: leaf.gatedBy ? sigName(def, leaf.gatedBy) : '',
      stepped: leaf.root === 'random' && leaf.of !== 'noise' ? sigName(def, leaf.of || 'none') : '',
      smooth: leaf.root === 'random' && shOf(ep).glide > 0.25,
      doubles: group === 'amp' && !replaced && leaf.root === ep.vca.envSrc,
      self: oscIdx >= 0 && leaf.root === `osc${oscIdx + 1}`,
      synced: oscIdx >= 0 && !!ep.osc[oscIdx] && (ep.osc[oscIdx].syncTo ?? -1) >= 0,
    };
    if (leaf.cancel)
      return `Nothing. Two copies of ${sigName(def, leaf.cancel)} meet on the way to this cable, equal and opposite, so they cancel. Turn one of them down and the rest gets through.`;
    if (leaf.lagOnly && controlGroup) {
      const name = sigName(def, leaf.root);
      const t = slewTime(ctx);
      const where = `${unit}${x.target ? ` of ${x.target}` : ''}`;
      const lags = leaf.sign * (jackAmt < 0 ? -1 : 1) > 0; // slew(x) − x: the push is back towards where x was
      if (group === 'pitch' && kind === 'kbd') {
        const held =
          'While a note is held the slewed and plain copies of the keyboard pitch cancel, so the tuning does not change.';
        const who = cap(x.target || 'the oscillator');
        const s1 = x.plural ? '' : 's';
        if (!lags)
          return `${who} overshoot${s1} each new note: ${x.plural ? 'they jump' : 'it jumps'} ${x.size} too far for each octave of the leap, then settle${s1} back to the proper pitch over about ${t}. ${held}`;
        return Math.abs(x.amount - 12) < 0.4
          ? `${who} start${s1} each new note at the pitch of the note before and slide${s1} to the new one over about ${t}: a glide on ${x.plural ? 'these oscillators' : 'this oscillator'} alone. ${held}`
          : `${who} ${x.plural ? 'are' : 'is'} pulled back towards the previous note by ${x.size} for each octave of the leap, then slide${s1} to the proper pitch over about ${t}. ${held}`;
      }
      return steps(ctx, leaf)
        ? `The slewed copy of ${name} and the plain copy are opposite, so they cancel while ${name} holds still. Each time it jumps, the slewed copy lags behind and the difference gets through: ${where} is pushed ${lags ? 'against' : 'further in'} the direction of the jump, by up to ${x.size} for a full-size jump, then settles back over about ${t}.`
        : `The slewed copy of ${name} and the plain copy are opposite, so they cancel wherever ${name} moves slowly. Only its quick movements get through, and they move ${where} by up to ${x.size}. The slew limiter is working here as a filter that takes the slow part away.`;
    }
    // A jack's own `hear` replaces the generated sentence; returning null hands this source back to the generic text.
    if (typeof b.hear === 'function') {
      const own = b.hear(values, x);
      if (own) return own;
    }
    if (kind === 'none' && group !== 'audioIn') return 'Nothing yet: no signal is on this cable.';
    const fn =
      group === 'trig' || group === 'audioIn' || group === 'util' ? null : HEAR[group]?.[kind];
    // A key gate through the slew limiter is a home-made envelope: up while the key is held, back down after.
    if (fn && kind === 'gate' && leaf.path.includes('slew')) {
      const t = fmtTime((ep.slew && ep.slew.time) || 0.1);
      return `The slew limiter turns the key gate into a slow rise and fall. ${cap(unit)}${x.target ? ` of ${x.target}` : ''} slides ${x.depth} over about ${t} while a key is held, then slides back over the same time when you let go.`;
    }
    const switched = leaf.path.includes('esw') && unit;
    const text = switched
      ? `The electronic switch lets ${x.src} through for half of each sample-and-hold clock cycle, so ${unit}${x.target ? ` of ${x.target}` : ''} jumps back and forth ${times(shOf(ep).rate * 2)} (${x.depth}).${group === 'pitch' ? ' On pitch that is a trill between two notes.' : ''}`
      : group === 'trig'
        ? hearTrig(ctx, b, x)
        : group === 'audioIn'
          ? hearAudioIn(ctx, a, b, x)
          : group === 'util'
            ? hearUtil(ctx, b, x)
            : fn
              ? fn(x)
              : `${cap(x.src)} moves ${unit} ${x.depth}.`;
    const gate = !x.gated
      ? ''
      : leaf.gatedBy === 'gate'
        ? ' Attenuator 1 is opened by the key gate, so this only gets through while a key is held.'
        : ` Attenuator 1 is opened and closed by ${x.gated}, so this only gets through while ${x.gated} is up, and in proportion to it.`;
    const floor =
      group === 'res' && ep.filter.res < 0.03 && (!unipolar(leaf) || leaf.sign < 0)
        ? ' The resonance knob is at 0 and resonance cannot go below zero, so only the upward half of the swing does anything.'
        : '';
    return `${text}${floor}${gate}`;
  };
  const normalKept = replaced && live.some((l) => l.root === normalSig);
  // Both filter outputs added together: the classic way to get a filter shape the MODE button does not offer.
  const roots = live.map((l) => l.root);
  const bothFilters = group === 'audioIn' && roots.includes('vcf1') && roots.includes('vcf2');
  const pair = [ep.filter.mode, ep.filter.mode2].sort().join('+');
  const notch = `Both filter outputs arrive together, added. ${
    pair === 'hp+lp'
      ? 'Low-pass plus high-pass pass everything except a narrow band at the cutoff, where the two cancel: a notch. Sweep the cutoff and the dip moves through the tone, which is the sound of a phaser. Keep the resonance low, because resonance fills the dip back in.'
      : 'Adding two filter types gives a broader shape than either alone: more of the sound gets through, with the emphasis still at the cutoff.'
  } ${cap(stageName(bDest) || 'this input')} now hears that sum instead of ${normalSig ? sigName(def, normalSig) : 'its usual feed'} alone.`;
  const hear = bothFilters
    ? notch
    : live.length > 1
      ? `${live.length === 2 ? 'Two' : 'Several'} signals arrive down this cable, added together. ${live.map((l) => `From ${sigName(def, l.root)}: ${hearOne(l)}`).join(' ')}`
      : hearOne(live[0] || leaves[0]);

  // things that would stop you hearing it
  const warnings: string[] = [];
  [a, b].forEach((j) => {
    if (typeof j.check === 'function') {
      const w = j.check(values);
      if (w) warnings.push(w);
    }
  });
  if (live.length && live.every((l) => Math.abs(l.gain) < 0.002) && !warnings.length)
    warnings.push(
      'The signal reaches this cable at zero strength: an attenuator in its path is turned fully down.'
    );
  if (controlGroup && typeof b.amt === 'function' && Math.abs(jackAmt) < 0.0005 && !warnings.length)
    warnings.push('The depth knob for this input is at zero, so nothing gets through yet.');
  if (group === 'pw') {
    const idx = bDest === 'pw1' ? [0] : bDest === 'pw3' ? [2] : ep.pwSplit ? [1] : [1, 2];
    const pulseOut = (k: number) => all.some((c) => signalOf(jm[c.from]) === `o${k + 1}pulse`);
    const hasPulse = idx.some((k) => {
      const o = ep.osc[k];
      return (
        (!!o && (o.morph ?? 0) > 2 / 3) ||
        (!!o && !!o.mix && (o.mix.pulse || 0) + (o.mix.tmod || 0) > 0.01) ||
        pulseOut(k)
      );
    });
    if (!hasPulse) {
      warnings.push(
        ep.oscOuts
          ? `${cap(targetName(ctx, bDest))}’s pulse wave is not being heard, and pulse width only changes the pulse wave. Patch its PULSE output into an audio input to hear this cable.`
          : `${cap(targetName(ctx, bDest))} is not set to a pulse shape, and pulse width only changes pulse shapes. Switch it to a pulse wave to hear this cable.`
      );
    }
  }
  if (group === 'pitch' || group === 'pw') {
    const idx =
      bDest === 'pitchAll'
        ? ep.osc.map((_, k) => k)
        : bDest === 'pw2'
          ? [1, 2]
          : [Number(bDest.slice(-1)) - 1];
    const silent = idx.every((k) => !ep.osc[k] || ep.osc[k].level < 0.005);
    if (silent && !ctx.cables.some((c) => /^(osc|o\d)/.test(signalOf(jm[c.from]) || '')))
      warnings.push(
        `${cap(targetName(ctx, bDest))} ${idx.length > 1 ? 'are' : 'is'} turned down in the mixer, so there is nothing to hear this on yet.`
      );
  }
  if (
    group === 'cutoff' &&
    ep.filter.mode === 'lp' &&
    ep.filter.cutoff > 9000 &&
    live.length &&
    live.every((l) => l.sign > 0 && unipolar(l))
  )
    warnings.push(
      'The filter is already almost fully open, so pushing it further up changes very little. Lower the cutoff first.'
    );
  if (
    (bDest === 'delayIn' || bDest === 'delayTime') &&
    ep.delay &&
    ep.delay.on &&
    ep.delay.mix != null &&
    ep.delay.mix < 0.01
  )
    warnings.push('The delay MIX is at zero, so the delay is not heard at all yet. Turn MIX up.');
  if (group === 'lfoRate' && !lfoInUse(ctx))
    warnings.push(
      'The LFO is not moving anything at the moment, so changing its speed makes no audible difference yet. Send the LFO to pitch, the filter or pulse width first.'
    );
  const widest = Math.max(0, ...live.map((l) => Math.abs(l.gain * jackAmt)));
  const syncedOsc = /^pitch\d$/.test(bDest) ? ep.osc[Number(bDest.slice(5)) - 1] : undefined;
  const synced = !!syncedOsc && (syncedOsc.syncTo ?? -1) >= 0;
  const viaAtt = live.some((l) => l.path.includes('att1') || l.path.includes('att2'));
  if (
    group === 'pitch' &&
    widest > 2 &&
    !synced &&
    !viaAtt &&
    typeof b.amt !== 'function' &&
    live.some((l) => ['env', 'random', 'lfo'].includes(kindOf(ctx, l))) &&
    def.jacks.some((j) => j.dir === 'out' && j.signal === 'att1')
  )
    warnings.push(
      'Pitch inputs are very sensitive. For a musical amount, send the signal through an attenuator first and set the depth with its knob.'
    );

  const feedback =
    group === 'audioIn' && live.some((l) => (AUDIO_STAGE[l.root] ?? -1) >= inStage(bDest));
  return {
    ...base,
    kind: feedback ? 'Feedback loop' : KIND_LABEL[group],
    modelled: true,
    carries: carriesNow(sctx, a, leaves),
    does: does.join(' '),
    hear,
    warnings,
  };
}

/** First sentence of the "hear" text, for lists. */
export function shortHear(x: Pick<CableExplanation, 'hear'> | null | undefined): string {
  if (!x) return '';
  const m = x.hear.match(/^.*?[.:](?=\s|$)/);
  return (m ? m[0] : x.hear).replace(/:$/, '.');
}
