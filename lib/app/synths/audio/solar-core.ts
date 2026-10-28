// Elta Music SOLAR 42 (EngineParams `solar`, see contract.ts): a sound path of eight independent voices, run by
// dsp-core.ts in place of its fixed voice. The spec is `.context/app/synth-data/solar-42n/`: modules
// `v1`–`v8`, `mixer`, `vcf`, `fx`, `lfo` and `seq`, behaviours b01–b07.
//
// - Three kinds of voice. A classic drone is five fixed-pitch saws; VOLT lowers them together to a knee, each by its
//   own amount (`DROP`), so a tuned chord drifts as it falls, and past the knee each saw frequency-modulates the next.
//   Its photosensor raises the pitch of the generators whose MOD is on with the light on `solPh<n>`. A Papa Srapa voice is a square tone under a
//   low-frequency square modulator, which moves its pitch (FM), chops it (AM) or both, with white noise blended in
//   and a sample and hold of noise clocked by the modulator. A VCO voice is an AS3340-style oscillator with six
//   waves (two of them morphs), a sub-oscillator an octave below, FM and sync, played from its side of the keyboard.
// - Every voice has its own envelope and VCA, opened by its gate flag (the push-button), dest `solG<n>`, HOLD, or for
//   a VCO its side of the keyboard. The second VCO's FM input is normalled to the first VCO's oscillator.
// - The ten-channel mixer pans each voice, EXT.AUDIO (`solExt`) and the preamp (signal `preamp`) to stereo; each side
//   goes through its own 12 dB state-variable filter, saturating in its band path like the Polivoks chip, and its own
//   cartridge (an `FX_FACTORY` algorithm, wet only, blended with the dry side by BLEND). On the 42N a distortion
//   sits between the two (`vcf.dist`): each side is clipped by a tanh after its filter, so a resonant peak is what
//   clips first, and DIST blends that in with the clean side; GAIN at full turn is `DIST_GAIN`.
// - LFO A and B (0..1, square to triangle), the pulser (±1) and the 5-step sequencer are signals for cables.
//
// The spec leaves the ranges out (`not_in_source`: LFO rates, filter cutoff range) and gives the VOLT behaviour only
// in words, so `DROP`, the knee, the cross-modulation depth, the filter's saturation and `DIST_GAIN` are the app's
// choices.
import { FX_FACTORY, type FxAlgo } from '@/lib/app/synths/audio/dm-fx';
import type { SolarEnv, SolarParams, SolarVoice } from '@/lib/app/synths/contract';

const VOICES = 8;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Signals (outputs). Per voice: its output after the VCA, its raw oscillator, its envelope, and a Papa Srapa's modulator and sample and hold. */
export const SOLAR_SIGNALS: string[] = [
  ...range(VOICES).flatMap((n) => [
    `sol${n}`,
    `solOsc${n}`,
    `solEnv${n}`,
    `solMod${n}`,
    `solSh${n}`,
  ]),
  'solNoise',
  'solLfoA',
  'solLfoB',
  'solPulser',
  'solSeqCv',
  'solSeqGate',
  'solKbd1',
  'solKbd2',
  'solKg1',
  'solKg2',
  'solMixL',
  'solMixR',
  'solL',
  'solR',
];

/** Destinations (inputs). Per voice: gate, pitch (semitones), photosensor light, VOLT, FM, sync, S&H clock and shape. */
export const SOLAR_DESTS: string[] = [
  ...range(VOICES).flatMap((n) => [
    `solG${n}`,
    `solP${n}`,
    `solPh${n}`,
    `solV${n}`,
    `solFm${n}`,
    `solSync${n}`,
    `solShClk${n}`,
    `solPw${n}`,
  ]),
  'solExt',
  'solCut',
  'solCutL',
  'solCutR',
  'solFxX',
  'solFxY',
  'solFxZ',
  'solSeqClk',
];

/** Semitones each of a drone's five generators has fallen when VOLT reaches the knee. */
export const DROP = [19, 16, 14, 12, 10];
/** VOLT at which the generators stop falling and start to cross-modulate. */
export const KNEE = 0.6;
/** How hard GAIN at full turn drives the 42N's distortion after the filter (the input is multiplied by 1 + this). */
export const DIST_GAIN = 24;

/** What `createSolar` hands back to the voice. */
export interface Solar {
  set: (p: SolarParams) => void;
  /** A key pressed or let go on the touch keyboard. */
  key: (n: number, on: boolean) => void;
  /** Let go of every key. */
  panic: () => void;
  /** One sample. */
  step: () => void;
  /** The sequencer's stage (0-based). */
  seqStage: () => number;
}

const TWO_PI = Math.PI * 2;

/** One envelope's state. */
interface Env {
  st: 0 | 1 | 2 | 3 | 4; // idle, attack, decay, sustain, release
  lvl: number;
  prev: boolean;
}
const idleEnv = (): Env => ({ st: 0, lvl: 0, prev: false });

/**
 * `S` / `SI` / `DI` / `ev` / `cabled` are the voice's signal array, the name → index maps, its routing evaluator and the
 * cabled-destination flags (see dsp-core.ts), shared so cables between the SOLAR's jacks just work.
 */
export function createSolar(
  sr: number,
  S: Float64Array,
  SI: Record<string, number>,
  DI: Record<string, number>,
  ev: (d: number) => number,
  cabled: Uint8Array
): Solar {
  const sm = 1 - Math.exp(-1 / (0.004 * sr));
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
  const hzOf = (note: number): number => {
    const hz = 440 * Math.pow(2, (note - 69) / 12);
    return hz > sr * 0.45 ? sr * 0.45 : hz;
  };

  let P: SolarParams | null = null;
  const v = range(VOICES).map((n) => ({
    o: [`sol${n}`, `solOsc${n}`, `solEnv${n}`, `solMod${n}`, `solSh${n}`].map((s) => SI[s]),
    d: [
      `solG${n}`,
      `solP${n}`,
      `solPh${n}`,
      `solV${n}`,
      `solFm${n}`,
      `solSync${n}`,
      `solShClk${n}`,
      `solPw${n}`,
    ].map((s) => DI[s]),
    subPh: 0,
    ph: new Float64Array(5),
    prevOut: new Float64Array(5),
    modPh: 0,
    shClkPrev: 0,
    sh: 0,
    syncPrev: 0,
    env: idleEnv(),
    level: 0,
    pan: 0,
    // which side of the keyboard plays it (a VCO voice), or −1
    side: -1,
  }));
  // the keyboard: the keys held on each side (newest last), and each side's glided note
  const held: number[][] = [[], []];
  const kNote = [60, 60],
    kNoteT = [60, 60];
  // the dual filter: per side its integrator states and its smoothed cutoff
  const fS1 = [0, 0],
    fS2 = [0, 0],
    fHz = [1000, 1000];
  // the cartridges
  const cart: (FxAlgo | null)[] = [null, null];
  const cartAlg: (string | null)[] = [null, null];
  const xyzDst = [DI.solFxX, DI.solFxY, DI.solFxZ];
  const xyzLast = [0, 0, 0];
  let blk = 0;
  let blend = 0,
    master = 0;
  // the distortion's DIST and GAIN, smoothed like the other knobs so a turn does not step the waveform
  let dMix = 0,
    dGain = 0;
  /** 0..1, and 0 for anything that is not a number, so a NaN never reaches the clipper or the cartridges' state. */
  const unit = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);
  let lfoA = 0,
    lfoB = 0,
    pul = 0,
    // starts high, so a pulser that starts high plays stage 0 first rather than stepping off it at once
    clkPrev = 1,
    stage = 0;

  function set(p: SolarParams) {
    const first = !P;
    P = p;
    // Free-running oscillators and LFOs start at random phases. They are drawn here, on the first settings, and not
    // when the voice is made: every voice makes a SOLAR path, and drawing then would move every other synth's seeded
    // random sequence (and so its check baseline).
    if (first) {
      for (const x of v) {
        for (let k = 0; k < 5; k++) x.ph[k] = Math.random();
        x.modPh = Math.random();
        x.subPh = x.ph[0];
      }
      lfoA = Math.random();
      lfoB = Math.random();
    }
    let vcoN = 0;
    for (let i = 0; i < VOICES; i++) {
      const q = p.voices[i];
      const x = v[i];
      x.side = q && q.kind === 'vco' ? (p.keys.mode === 'split' ? Math.min(vcoN++, 1) : 0) : -1;
      if (first && q) {
        x.level = q.level;
        x.pan = q.pan;
      }
    }
    for (let s = 0; s < 2; s++) {
      const want = p.fx[s ? 'r' : 'l'];
      const make = want.alg && Object.hasOwn(FX_FACTORY, want.alg) ? FX_FACTORY[want.alg] : null;
      if (!make) {
        cart[s] = null;
        cartAlg[s] = null;
        continue;
      }
      if (cartAlg[s] !== want.alg) {
        cart[s] = make(sr);
        cartAlg[s] = want.alg;
      }
    }
    applyXyz(true);
    if (first) {
      blend = p.fx.blend;
      master = p.master;
      dMix = p.vcf.dist ? unit(p.vcf.dist.mix) : 0;
      dGain = p.vcf.dist ? unit(p.vcf.dist.gain) : 0;
      fHz[0] = p.vcf.l.cutoff;
      fHz[1] = p.vcf.link ? p.vcf.l.cutoff : p.vcf.r.cutoff;
    }
  }

  /** Each cartridge's parameters with the X/Y/Z knobs (and their CV) laid over them; only re-set when one moves. */
  function applyXyz(force: boolean) {
    if (!P) return;
    let moved = force;
    const vals: number[] = [];
    for (let k = 0; k < P.fx.xyz.length && k < 3; k++) {
      const q = P.fx.xyz[k];
      let t = q.v + ev(xyzDst[k]);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const val = q.lo + (q.hi - q.lo) * t;
      vals.push(val);
      if (Math.abs(val - xyzLast[k]) > Math.abs(q.hi - q.lo) * 0.005) moved = true;
    }
    if (!moved) return;
    for (let k = 0; k < vals.length; k++) xyzLast[k] = vals[k];
    for (let s = 0; s < 2; s++) {
      const c = cart[s];
      if (!c) continue;
      const p = { ...P.fx[s ? 'r' : 'l'].p };
      for (let k = 0; k < vals.length; k++) p[P.fx.xyz[k].ref] = vals[k];
      c.set(p, true);
    }
  }

  function key(n: number, on: boolean) {
    if (!P) return;
    // a key is taken off both sides: the split may have moved since it went down
    for (const h of held) {
      const i = h.indexOf(n);
      if (i >= 0) h.splice(i, 1);
    }
    if (on) held[P.keys.mode === 'split' && n >= P.keys.split ? 1 : 0].push(n);
    for (let s = 0; s < 2; s++) if (held[s].length) kNoteT[s] = held[s][held[s].length - 1];
  }

  function panic() {
    held[0].length = 0;
    held[1].length = 0;
  }

  const rate = (t: number): number => 1 / (Math.max(t, 0.0005) * sr);
  const lfo = (ph: number, w: number): number =>
    (ph < 0.5 ? 1 : 0) * (1 - w) + (1 - 2 * Math.abs(ph - 0.5)) * w;

  /** One sample of an envelope. `gate` = open; a new gate starts an `ad` or `loop` from the top. */
  function envStep(e: Env, q: SolarEnv, gate: boolean): number {
    const g = gate || q.hold;
    if (g && !e.prev) e.st = 1;
    if (!g && e.prev && q.mode !== 'ad') e.st = e.st === 0 ? 0 : 4;
    e.prev = g;
    switch (e.st) {
      case 1:
        e.lvl += rate(q.a);
        if (e.lvl >= 1) {
          e.lvl = 1;
          e.st = q.mode === 'asr' ? 3 : 2;
        }
        break;
      case 2: {
        const to = q.mode === 'adsr' ? q.s : 0;
        e.lvl += (to - e.lvl) * rate(q.d) * 4;
        if (q.mode === 'adsr') {
          if (Math.abs(e.lvl - to) < 1e-4) e.st = 3;
        } else if (e.lvl < 1e-3) {
          e.lvl = 0;
          e.st = q.mode === 'loop' && g ? 1 : 0;
        }
        break;
      }
      case 4:
        e.lvl -= e.lvl * rate(q.r) * 4;
        if (e.lvl < 1e-5) {
          e.lvl = 0;
          e.st = 0;
        }
        break;
    }
    return e.lvl;
  }

  /** The dual filter: one side of a 12 dB state-variable filter that saturates in its band path. */
  function filter(
    s: number,
    x: number,
    hz: number,
    res: number,
    mode: 'lp' | 'bp',
    drive: number
  ): number {
    const g = Math.tan((Math.PI * (hz < 20 ? 20 : hz > sr * 0.45 ? sr * 0.45 : hz)) / sr);
    const k = 2 - 1.96 * (res < 0 ? 0 : res > 1 ? 1 : res);
    const xin = drive > 0 ? Math.tanh(x * (1 + drive * 6)) : x;
    const a1 = 1 / (1 + g * (g + k)),
      a2 = g * a1,
      a3 = g * a2;
    const v3 = xin - fS2[s];
    const v1 = a1 * fS1[s] + a2 * v3;
    const v2 = fS2[s] + a2 * fS1[s] + a3 * v3;
    fS1[s] = Math.tanh(2 * v1 - fS1[s]);
    fS2[s] = 2 * v2 - fS2[s];
    return mode === 'bp' ? v1 : v2;
  }

  function drone(q: Extract<SolarVoice, { kind: 'drone' }>, x: (typeof v)[number]): number {
    const D = x.d;
    let volt = q.volt + ev(D[3]);
    volt = volt < 0 ? 0 : volt > 1 ? 1 : volt;
    const fall = volt < KNEE ? volt / KNEE : 1;
    const xm = volt > KNEE ? ((volt - KNEE) / (1 - KNEE)) * 0.9 : 0;
    let light = ev(D[2]);
    light = light < 0 ? 0 : light > 1 ? 1 : light;
    const cv = ev(D[1]),
      bend = q.photo * light;
    let sum = 0;
    for (let k = 0; k < 5; k++) {
      const gn = q.gens[k];
      if (!gn || !gn.on) {
        x.prevOut[k] = 0;
        continue;
      }
      let dt = hzOf(gn.note + cv + (gn.mod ? bend : 0) - DROP[k] * fall) / sr;
      // past the knee each generator is frequency-modulated by the one below it (the 5th by the 1st)
      if (xm > 0) dt *= 1 + xm * x.prevOut[(k + 4) % 5];
      if (dt < 0) dt = 0;
      let t = x.ph[k] + dt;
      if (t >= 1) t -= 1;
      x.ph[k] = t;
      const y = 2 * t - 1 - blep(t, dt);
      x.prevOut[k] = y;
      sum += y;
    }
    return sum * 0.25;
  }

  function srapa(
    q: Extract<SolarVoice, { kind: 'srapa' }>,
    x: (typeof v)[number],
    white: number
  ): number {
    const D = x.d,
      O = x.o;
    x.modPh += q.rate / sr;
    if (x.modPh >= 1) x.modPh -= 1;
    const m = x.modPh < 0.5 ? 1 : 0;
    S[O[3]] = m;
    // the sample and hold takes the noise on each rising edge of its clock: the modulator, or a cable
    const clk = cabled[D[6]] ? (ev(D[6]) > 0.5 ? 1 : 0) : m;
    if (clk && !x.shClkPrev) x.sh = white;
    x.shClkPrev = clk;
    S[O[4]] = x.sh;
    const note = q.note + ev(D[1]) + (q.fm ? q.dev * 12 * m : 0);
    const dt = hzOf(note) / sr;
    let t = x.ph[0] + dt;
    if (t >= 1) t -= 1;
    x.ph[0] = t;
    let y = (t < 0.5 ? 1 : -1) + blep(t, dt) - blep((t + 0.5) % 1, dt);
    if (q.am) y *= m;
    const nz = q.noise < 0 ? 0 : q.noise > 1 ? 1 : q.noise;
    return y * (1 - nz) + white * nz;
  }

  function vco(
    q: Extract<SolarVoice, { kind: 'vco' }>,
    x: (typeof v)[number],
    fmNormal: number
  ): number {
    const D = x.d;
    const fmIn = ev(D[4]) + (cabled[D[4]] ? 0 : fmNormal);
    const note = kNote[x.side] + q.semi + ev(D[1]) + q.fm * 24 * fmIn;
    const dt = hzOf(note) / sr;
    const sy = ev(D[5]);
    let t = x.ph[0] + dt;
    const synced = sy > 0.5 && x.syncPrev <= 0.5;
    if (synced) t = 0;
    x.syncPrev = sy;
    if (t >= 1) t -= 1;
    x.ph[0] = t;
    // the sub-oscillator: a square at half the frequency, restarted with the main phase on a sync
    let sub = 0;
    if (q.sub) {
      let u = x.subPh + dt / 2;
      if (u >= 1) u -= 1;
      if (synced) u = 0;
      x.subPh = u;
      sub = 0.7 * ((u < 0.5 ? 1 : -1) + blep(u, dt / 2) - blep((u + 0.5) % 1, dt / 2));
    }
    return wave(q, t, dt, q.shape + ev(D[7])) + sub;
  }

  /** One sample of a VCO voice's waveform at phase `t`. */
  function wave(
    q: Extract<SolarVoice, { kind: 'vco' }>,
    t: number,
    dt: number,
    shape: number
  ): number {
    const sh = shape < 0 ? 0 : shape > 1 ? 1 : shape;
    const sine = Math.sin(TWO_PI * t);
    const tri = 1 - 4 * Math.abs(t - 0.5);
    switch (q.wave) {
      case 'sine':
        return sine;
      case 'tri':
        return tri;
      case 'saw':
        return 2 * t - 1 - blep(t, dt);
      case 'square': {
        const w = 0.05 + 0.9 * sh;
        return (t < w ? 1 : -1) + blep(t, dt) - blep((t + 1 - w) % 1, dt);
      }
      case 'sawInv': {
        // the rising part shrinks as SHAPE turns: a saw at 0, a triangle at the middle, an inverted saw at full
        const w = 0.01 + 0.98 * (1 - sh);
        return t < w ? -1 + (2 * t) / w : 1 - (2 * (t - w)) / (1 - w);
      }
      default:
        return sine * (1 - sh) + tri * sh;
    }
  }

  function step() {
    if (!P) return;
    const p = P;
    const white = Math.random() * 2 - 1;
    S[SI.solNoise] = white;

    // ── LFOs, pulser and sequencer ──
    lfoA += p.lfo.a.hz / sr;
    if (lfoA >= 1) lfoA -= 1;
    lfoB += p.lfo.b.hz / sr;
    if (lfoB >= 1) lfoB -= 1;
    S[SI.solLfoA] = lfo(lfoA, p.lfo.a.wave);
    S[SI.solLfoB] = lfo(lfoB, p.lfo.b.wave);
    pul += p.seq.hz / sr;
    if (pul >= 1) pul -= 1;
    const pulHi = pul < 0.5 ? 1 : 0;
    S[SI.solPulser] = pulHi ? 1 : -1;
    const clk = cabled[DI.solSeqClk] ? (ev(DI.solSeqClk) > 0.5 ? 1 : 0) : pulHi;
    const stages = Math.max(1, Math.min(p.seq.stages, p.seq.levels.length));
    if (clk && !clkPrev) stage = (stage + 1) % stages;
    if (stage >= stages) stage = 0;
    clkPrev = clk;
    S[SI.solSeqCv] = p.seq.levels[stage] || 0;
    S[SI.solSeqGate] = p.seq.gates[stage] && clk ? 1 : 0;

    // ── keyboard ──
    const gc = p.keys.glide > 0.001 ? 1 - Math.exp(-1 / (p.keys.glide * sr)) : 1;
    for (let s = 0; s < 2; s++) {
      kNote[s] += (kNoteT[s] - kNote[s]) * gc;
      S[s ? SI.solKbd2 : SI.solKbd1] = (kNote[s] - 60) / 12;
      S[s ? SI.solKg2 : SI.solKg1] = held[s].length ? 1 : 0;
    }

    // ── voices into the mixer ──
    let mL = 0,
      mR = 0,
      firstVco = -1,
      vcoN = 0;
    for (let i = 0; i < VOICES; i++) {
      const q = p.voices[i];
      const x = v[i];
      if (!q) {
        for (const o of x.o) S[o] = 0;
        x.env.st = 0;
        x.env.lvl = 0;
        x.env.prev = false;
        continue;
      }
      const keyGate = x.side >= 0 && held[x.side].length > 0;
      const gate = q.gate || ev(x.d[0]) > 0.5 || keyGate;
      const e = envStep(x.env, q.env, gate);
      S[x.o[2]] = e;
      let y = 0;
      if (q.kind === 'vco') {
        // only the second VCO has the first one's oscillator normalled into its FM input
        y = vco(q, x, vcoN === 1 ? S[v[firstVco].o[1]] : 0);
        if (vcoN++ === 0) firstVco = i;
      } else if (q.kind === 'srapa') {
        y = srapa(q, x, white);
      } else {
        // the drone's raw oscillator runs free, gate or no gate, like the other voices'
        y = drone(q, x);
      }
      S[x.o[1]] = y;
      y *= e;
      S[x.o[0]] = y;
      x.level += (q.level - x.level) * sm;
      x.pan += (q.pan - x.pan) * sm;
      const a = ((x.pan < -1 ? -1 : x.pan > 1 ? 1 : x.pan) + 1) * (Math.PI / 4);
      mL += y * x.level * Math.cos(a);
      mR += y * x.level * Math.sin(a);
    }
    for (let c = 0; c < 2; c++) {
      const ch = c ? p.pre : p.ext,
        y = c ? S[SI.preamp] : ev(DI.solExt);
      const a = ((ch.pan < -1 ? -1 : ch.pan > 1 ? 1 : ch.pan) + 1) * (Math.PI / 4);
      mL += y * ch.level * Math.cos(a);
      mR += y * ch.level * Math.sin(a);
    }
    S[SI.solMixL] = mL;
    S[SI.solMixR] = mR;

    // ── dual filter ──
    const cv = ev(DI.solCut);
    const cL = ev(DI.solCutL);
    const tL = p.vcf.l.cutoff * Math.pow(2, cv + cL);
    const tR = p.vcf.link ? tL : p.vcf.r.cutoff * Math.pow(2, cv + ev(DI.solCutR));
    fHz[0] += (tL - fHz[0]) * sm;
    fHz[1] += (tR - fHz[1]) * sm;
    let fl = filter(0, mL, fHz[0], p.vcf.l.res, p.vcf.l.mode, p.vcf.l.drive);
    let fr = filter(1, mR, fHz[1], p.vcf.r.res, p.vcf.r.mode, p.vcf.r.drive);
    // ── the 42N's distortion after the filter: DIST blends the clipped side in, GAIN drives it ──
    const dist = p.vcf.dist,
      mixT = dist ? unit(dist.mix) : 0;
    dMix += (mixT - dMix) * sm;
    // settled back at 0, the side is left exactly as the filter gave it
    if (mixT === 0 && dMix < 1e-6) dMix = 0;
    dGain += ((dist ? unit(dist.gain) : 0) - dGain) * sm;
    if (dMix > 0) {
      const k = 1 + dGain * DIST_GAIN;
      fl += (Math.tanh(fl * k) - fl) * dMix;
      fr += (Math.tanh(fr * k) - fr) * dMix;
    }

    // ── effector: each side's cartridge, wet only, blended with the dry side ──
    if (++blk >= 64) {
      blk = 0;
      applyXyz(false);
    }
    let wl = fl,
      wr = fr;
    if (cart[0]) {
      cart[0].tick(fl, fl);
      wl = cart[0].l;
    }
    if (cart[1]) {
      cart[1].tick(fr, fr);
      wr = cart[1].r;
    }
    blend += (p.fx.blend - blend) * sm;
    master += (p.master - master) * sm;
    S[SI.solL] = (fl * (1 - blend) + wl * blend) * master;
    S[SI.solR] = (fr * (1 - blend) + wr * blend) * master;
  }

  return { set, key, panic, step, seqStage: () => stage };
}
