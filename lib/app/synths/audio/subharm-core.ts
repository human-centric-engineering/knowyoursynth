// Moog Subharmonicon (EngineParams `subharm`, see contract.ts): its six sources and its polyrhythmic sequencing, run
// by dsp-core.ts in place of the fixed voice's oscillators. The mix this returns goes on into the voice's own ladder
// filter, its two envelopes (the VCF EG and the VCA EG) and its VCA. The spec is
// `.context/app/synth-data/subharmonicon/`: modules `clock`, `rhythm1`–`rhythm4`, `seq1`, `seq2`, `transport`,
// `vco1`, `vco2`, the four subs and `mixer`, behaviours b02–b11.
//
// - Two VCOs, each with two subs. A sub is a true divider: it counts its VCO's cycles, so it plays the VCO's frequency
//   divided by a whole number 1..16 and stays locked in phase to it. WAVE gives square on all three, saw on all three,
//   or (the middle position) a pulse on the VCO whose width SUB 1's saw moves, with saw subs. A cable in VCO PWM
//   replaces that normal and also sets the width of the squares.
// - The clock (TEMPO, or rising edges on dest `sbhClkIn`) runs while PLAY is lit. Each of the four rhythm generators
//   fires on every n-th clock, counted from the last RESET, so they all meet on the downbeat. A sequencer advances when
//   any of its assigned rhythms fires (OR), or only when exactly one does (XOR).
// - A step adds its knob's share of SEQ OCT, in octaves, to its VCO's FREQ (and the subs follow), and/or lowers each
//   assigned sub's divisor (a higher step is a higher pitch). QUANTIZE snaps the VCO's FREQ plus its step to the
//   scale, and the step alone before it moves a divisor.
// - The envelopes' gates are signals `sbhEg1` / `sbhEg2` (a definition normals `gate1` / `gate2` to them). A trigger
//   (a step with EG on, TRIGGER, the TRIGGER input, a key) opens a gate for its envelope's attack, and is ignored
//   while that attack runs; a held key holds the gate; EG held holds both open.
//
// Choices the spec leaves open are the app's (`not_in_source`): a volt moves a divisor by `DIV_PER_VOLT` (so ±5 V
// from a centred knob spans the range, as the manual's "centre the knob" implies), in both the sub and rhythm CVs;
// the 12-JI ratios are the 5-limit chromatic scale; XOR with three or more rhythms advances only on exactly one; keys
// gate the envelopes as a gate would, and play their pitch as an offset from C4 on both VCOs.
import type { SubharmParams } from '@/lib/app/synths/contract';

/** Signals (outputs): the six sources, the mix, both sequencers' CV and clock, CLOCK OUT, TRIGGER OUT, the EG gates. */
export const SUBHARM_SIGNALS: string[] = [
  'sbhVco1',
  'sbhSub11',
  'sbhSub12',
  'sbhVco2',
  'sbhSub21',
  'sbhSub22',
  'sbhMix',
  'sbhSeq1',
  'sbhSeq1Clk',
  'sbhSeq2',
  'sbhSeq2Clk',
  'sbhClock',
  'sbhTrig',
  'sbhEg1',
  'sbhEg2',
];

/**
 * Destinations (inputs), in volts: each VCO's pitch (1 V/oct; VCO 1's is normalled to VCO 2), each VCO's SUB divisor
 * CV and PWM, PLAY, RESET, TRIGGER, CLOCK and the four RHYTHM CVs. The VCA and CUTOFF inputs are the voice's own
 * `amp` and `cutoff`.
 */
export const SUBHARM_DESTS: string[] = [
  'sbhP1',
  'sbhP2',
  'sbhSub1',
  'sbhSub2',
  'sbhPwm1',
  'sbhPwm2',
  'sbhPlay',
  'sbhReset',
  'sbhTrigIn',
  'sbhClkIn',
  'sbhR1',
  'sbhR2',
  'sbhR3',
  'sbhR4',
];

/** How far a volt moves a sub's or a rhythm generator's divisor (a positive volt lowers it). */
export const DIV_PER_VOLT = 1.5;
/** The highest pitch the panel and the sequencers reach; the CV inputs can still drive a VCO above it. */
export const SEQ_MAX_HZ = 10000;
/** Middle C, where FREQ fully anticlockwise sits. */
const C4_HZ = 261.6255653005986;
/** How long TRIGGER OUT's pulse lasts, seconds. */
const TRIG_OUT_S = 0.001;
/** Each SEQ CLK pulse lasts half a clock, but no longer than this, seconds. */
const SEQ_CLK_MAX_S = 0.01;
/** A whole multiple of every divisor 1..16, so a sub's count of cycles never wraps out of phase. */
const CYCLE_WRAP = 720720;
/** SEQ_MAX_HZ as semitones above C4. */
const MAX_SEMI = 12 * Math.log2(SEQ_MAX_HZ / C4_HZ);

/** The scales, in semitones above C. */
const ji = (r: number[]): number[] => r.map((x) => 12 * Math.log2(x));
export const SCALES: Record<Exclude<SubharmParams['quantize'], 'off'>, number[]> = {
  '12-ET': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  '8-ET': [0, 2, 4, 5, 7, 9, 11],
  '12-JI': ji([
    1,
    16 / 15,
    9 / 8,
    6 / 5,
    5 / 4,
    4 / 3,
    45 / 32,
    3 / 2,
    8 / 5,
    5 / 3,
    9 / 5,
    15 / 8,
  ]),
  '8-JI': ji([1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8]),
};

/** `semi` (semitones above a C) snapped to the nearest note of the scale, or as it is when QUANTIZE is off. */
export function quantize(semi: number, q: SubharmParams['quantize']): number {
  if (q === 'off' || !Number.isFinite(semi)) return semi;
  const scale = SCALES[q];
  const oct = Math.floor(semi / 12);
  const r = semi - 12 * oct;
  let best = 0,
    dist = Infinity;
  for (const s of scale) {
    const d = Math.abs(r - s);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  // the C an octave up is nearer than the scale's top note
  if (12 - r < dist) best = 12;
  return 12 * oct + best;
}

/** What `createSubharm` hands back to the voice. */
export interface Subharm {
  /** The settings. */
  set: (p: SubharmParams) => void;
  /** The voice has left the Subharmonicon: the next `set` starts afresh (counters synced, a lit PLAY ticks at once). */
  off: () => void;
  /** Whether the clock is running (a running clock opens its own gates, so the voice is never idle). */
  running: () => boolean;
  /**
   * One sample: the played note (MIDI, with the voice's bend, tune, transpose and drift already added), whether a key
   * is held, whether a key was just struck. Returns the mix.
   */
  step: (note: number, keyGate: boolean, keyHit: boolean) => number;
  /** Each sequencer's step (0-based), for the step lamps. */
  stages: () => [number, number];
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
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
/** The settings with the press counts left out, to tell a click (only a count changes) from a patch load. */
const withoutPress = (p: SubharmParams): string => JSON.stringify({ ...p, press: null });
const divisor = (x: number): number => clamp(Math.round(Number.isFinite(x) ? x : 1), 1, 16);

/**
 * `S` / `SI` / `DI` / `ev` / `cabled` are the voice's signal array, the name → index maps, its routing evaluator and the
 * cabled-destination flags (see dsp-core.ts), shared so cables between the Subharmonicon's jacks just work.
 * `attackS` is how long envelope `k`'s attack (with any delay before it) runs now, in seconds, after its key follow
 * and its rate CV: a trigger is ignored for that long.
 */
export function createSubharm(
  sr: number,
  S: Float64Array,
  SI: Record<string, number>,
  DI: Record<string, number>,
  ev: (d: number) => number,
  cabled: Uint8Array,
  attackS: (k: number) => number
): Subharm {
  const sm = 1 - Math.exp(-1 / (0.004 * sr));
  const OUT = [
    [SI.sbhVco1, SI.sbhSub11, SI.sbhSub12],
    [SI.sbhVco2, SI.sbhSub21, SI.sbhSub22],
  ];
  const D_P = [DI.sbhP1, DI.sbhP2],
    D_SUB = [DI.sbhSub1, DI.sbhSub2],
    D_PWM = [DI.sbhPwm1, DI.sbhPwm2],
    D_R = [DI.sbhR1, DI.sbhR2, DI.sbhR3, DI.sbhR4];
  const SEQ_OUT = [SI.sbhSeq1, SI.sbhSeq2],
    SEQ_CLK = [SI.sbhSeq1Clk, SI.sbhSeq2Clk],
    EG_OUT = [SI.sbhEg1, SI.sbhEg2];

  let P: SubharmParams | null = null;
  // per VCO: its phase, its count of whole cycles, the last SUB 1 saw (its PWM normal), the smoothed mixer levels
  const ph = [0, 0],
    cyc = [0, 0],
    sub1Saw = [0, 0];
  const lvl = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  // transport and clock
  let running = false,
    clkPh = 0,
    clkPrev = false,
    playPrev = false,
    resetPrev = false,
    trigInPrev = false,
    // whether PLAY and CLOCK were cabled last sample, so a plug or unplug is seen
    playCab = false,
    clkCab = false,
    // samples since the last rising edge at CLOCK, and the period between the last two (sizes SEQ CLK's pulses)
    extSince = -1,
    extPeriod = 0,
    count = 0,
    trigOut = 0;
  const last = { reset: 0, next: 0, trigger: 0 };
  // per sequencer: its step, whether the next advance plays step 1 (just reset), and its SEQ CLK pulse
  const stage = [0, 0],
    armed = [true, true],
    seqClk = [0, 0];
  // per envelope: samples of attack still to run, whether its gate was high, and a gate to drop for one sample
  const egCnt = [0, 0],
    egPrev = [false, false],
    egDrop = [false, false];

  // which rhythm generators fired on this clock (kept, so a tick allocates nothing)
  const fired = [false, false, false, false];

  function set(p: SubharmParams) {
    const first = !P;
    // a cable in PLAY overrides the panel's PLAY
    if ((first || p.play !== P!.play) && !cabled[DI.sbhPlay]) {
      running = p.play;
      // a start ticks at once, so the first step plays from the start
      if (running) clkPh = 1;
    }
    // A press is a change of its count alone (one click). When anything else changed with it, a patch was loaded:
    // its button values are the patch's, not a click, so the counts are taken as they are and nothing is pressed.
    if (first || withoutPress(p) !== withoutPress(P!)) {
      last.reset = p.press.reset;
      last.next = p.press.next;
      last.trigger = p.press.trigger;
    }
    if (first)
      for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) lvl[k][j] = p.vco[k].level[j];
    P = p;
  }

  function off() {
    P = null;
    reset();
    running = false;
    clkPh = 0;
    trigOut = 0;
    playCab = clkCab = false;
    playPrev = clkPrev = resetPrev = trigInPrev = false;
    extSince = -1;
    extPeriod = 0;
    for (let k = 0; k < 2; k++) {
      seqClk[k] = egCnt[k] = 0;
      egPrev[k] = egDrop[k] = false;
    }
  }

  function reset() {
    count = 0;
    stage[0] = stage[1] = 0;
    armed[0] = armed[1] = true;
  }

  /** The step's share of SEQ OCT, in semitones, unquantised. */
  function stepSemi(p: SubharmParams, s: number, oct: number): number {
    return clamp(p.seq[s].steps[stage[s]] || 0, -1, 1) * oct * 12;
  }

  function step(note: number, keyGate: boolean, keyHit: boolean): number {
    if (!P) return 0;
    const p = P;

    // ── transport ──
    const pc = !!cabled[DI.sbhPlay];
    if (pc !== playCab) {
      playCab = pc;
      // a fresh cable takes over from where the transport is (so one already low stops it, one high starts it); an
      // unplugged one hands the transport back to the panel PLAY
      playPrev = running;
      if (!pc) {
        running = p.play;
        if (running) clkPh = 1;
      }
    }
    if (pc) {
      const g = ev(DI.sbhPlay) > 0.5;
      if (g && !playPrev) {
        running = true;
        clkPh = 1;
      } else if (!g && playPrev) running = false;
      playPrev = g;
    }
    // a gate at RESET holds the sequencers where they are; NEXT still moves them
    const hold = ev(DI.sbhReset) > 0.5;
    if ((hold && !resetPrev) || p.press.reset !== last.reset) reset();
    resetPrev = hold;
    last.reset = p.press.reset;

    // ── clock and rhythm generators ──
    let tick = false,
      clkHi = false;
    const cc = !!cabled[DI.sbhClkIn];
    if (cc !== clkCab) {
      // a new cable at CLOCK measures its own period and edges
      clkCab = cc;
      clkPrev = false;
      extSince = -1;
      extPeriod = 0;
    }
    if (cc) {
      const c = ev(DI.sbhClkIn) > 0.5;
      if (c && !clkPrev) {
        // -1 until the first edge: one edge alone gives no period
        if (extSince >= 0) extPeriod = extSince;
        // the edge's own sample counts, so the next edge reads the whole period
        extSince = 1;
      } else if (extSince >= 0) extSince++;
      tick = running && c && !clkPrev;
      clkHi = c;
      clkPrev = c;
    } else if (running) {
      // the phase is read before it moves, so a start (phase 1) ticks on this very sample
      if (clkPh >= 1) {
        clkPh -= Math.floor(clkPh);
        tick = true;
      }
      clkHi = clkPh < 0.5;
      clkPh += clamp(p.tempo, 0.01, 1000) / sr;
    }
    S[SI.sbhClock] = running && clkHi ? 1 : 0;

    let egHit = false;
    if (tick) {
      for (let r = 0; r < 4; r++)
        fired[r] = count % divisor(p.rhythm[r].div - DIV_PER_VOLT * ev(D_R[r])) === 0;
      count = (count + 1) % CYCLE_WRAP;
      // half the clock's period: the incoming clock's while CLOCK is cabled (once it has two edges), else TEMPO's
      const half = cc && extPeriod > 0 ? 0.5 * extPeriod : (0.5 * sr) / clamp(p.tempo, 0.01, 1000);
      const clkLen = Math.min(SEQ_CLK_MAX_S * sr, half);
      for (let s = 0; s < 2; s++) {
        let n = 0;
        for (let r = 0; r < 4; r++) if (fired[r] && (s ? p.rhythm[r].seq2 : p.rhythm[r].seq1)) n++;
        if (p.logic === 'xor' ? n !== 1 : n === 0) continue;
        if (!hold) {
          if (armed[s]) armed[s] = false;
          else stage[s] = (stage[s] + 1) % 4;
        }
        seqClk[s] = Math.max(1, Math.round(clkLen));
        if (p.eg === 'on') egHit = true;
      }
    }
    if (p.press.next !== last.next) {
      last.next = p.press.next;
      // NEXT always moves on a step, even just after a RESET (it is a manual advance, not a clock)
      for (let s = 0; s < 2; s++) {
        stage[s] = (stage[s] + 1) % 4;
        armed[s] = false;
      }
      // NEXT triggers the envelopes only while RESET holds the sequencers
      if (hold && p.eg === 'on') egHit = true;
    }
    for (let s = 0; s < 2; s++) {
      S[SEQ_CLK[s]] = seqClk[s] > 0 ? 1 : 0;
      if (seqClk[s] > 0) seqClk[s]--;
    }

    // ── envelope gates ──
    const tIn = ev(DI.sbhTrigIn) > 0.5;
    const pressed = p.press.trigger !== last.trigger;
    last.trigger = p.press.trigger;
    // TRIGGER and the TRIGGER input do nothing while EG holds the envelopes (firmware 1.1.0)
    if (p.eg !== 'held' && ((tIn && !trigInPrev) || pressed || keyHit)) egHit = true;
    trigInPrev = tIn;
    if (egHit) trigOut = Math.max(1, Math.round(TRIG_OUT_S * sr));
    S[SI.sbhTrig] = trigOut > 0 ? 1 : 0;
    if (trigOut > 0) trigOut--;
    for (let k = 0; k < 2; k++) {
      if (egHit && egCnt[k] <= 0) {
        egCnt[k] = Math.round(Math.max(0.004, attackS(k) * 1.05) * sr);
        // a gate already high drops for a sample, so the envelope sees a new one and starts again
        if (egPrev[k]) egDrop[k] = true;
      }
      let g = p.eg === 'held' || keyGate || egCnt[k] > 0;
      if (egDrop[k]) {
        g = false;
        egDrop[k] = false;
      }
      if (egCnt[k] > 0) egCnt[k]--;
      egPrev[k] = g;
      S[EG_OUT[k]] = g ? 1 : 0;
    }

    // ── sequencer outputs ──
    const q = p.quantize;
    for (let s = 0; s < 2; s++) {
      const outOct = p.seqOutFull ? 5 : p.oct;
      S[SEQ_OUT[s]] = quantize(stepSemi(p, s, outOct), p.seqOutRaw ? 'off' : q) / 12;
    }

    // ── the six sources ──
    const key = note - 60 + (p.fine || 0) / 100;
    let sum = 0;
    for (let k = 0; k < 2; k++) {
      const vc = p.vco[k],
        sq = p.seq[k];
      const raw = stepSemi(p, k, p.oct);
      // the step alone, snapped, in octaves (volts) for the divisors
      const st = quantize(raw, q) / 12;
      const panel = quantize(vc.freq + (sq.assign[0] ? raw : 0), q);
      // VCO 1's input is normalled to VCO 2's
      const cv = k === 1 && !cabled[D_P[1]] ? ev(D_P[0]) : ev(D_P[k]);
      let hz = C4_HZ * Math.pow(2, ((panel < MAX_SEMI ? panel : MAX_SEMI) + key + 12 * cv) / 12);
      hz = hz > sr * 0.45 ? sr * 0.45 : hz > 0 ? hz : 0;
      const dt = hz / sr;
      let t = ph[k] + dt;
      if (t >= 1) {
        t -= Math.floor(t);
        cyc[k] = (cyc[k] + 1) % CYCLE_WRAP;
      }
      ph[k] = t;

      const subCv = ev(D_SUB[k]);
      const pwCab = !!cabled[D_PWM[k]];
      const pwCv = clamp(0.5 + (0.49 * ev(D_PWM[k])) / 5, 0.01, 0.99);
      const out = OUT[k];
      let vco: number;
      if (vc.wave === 'saw') vco = 2 * t - 1 - blep(t, dt);
      else {
        const w =
          vc.wave === 'pwm'
            ? pwCab
              ? pwCv
              : clamp(0.5 + 0.4 * sub1Saw[k], 0.01, 0.99)
            : pwCab
              ? pwCv
              : 0.5;
        vco = (t < w ? 1 : -1) + blep(t, dt) - blep((t + 1 - w) % 1, dt);
      }
      S[out[0]] = vco;
      lvl[k][0] += (vc.level[0] - lvl[k][0]) * sm;
      sum += vco * lvl[k][0];
      for (let j = 0; j < 2; j++) {
        const d = divisor(vc.div[j] - DIV_PER_VOLT * ((sq.assign[j + 1] ? st : 0) + subCv));
        const u = ((cyc[k] % d) + t) / d,
          du = dt / d;
        const saw = 2 * u - 1 - blep(u, du);
        if (j === 0) sub1Saw[k] = saw;
        let y: number;
        if (vc.wave === 'square') {
          const w = pwCab ? pwCv : 0.5;
          y = (u < w ? 1 : -1) + blep(u, du) - blep((u + 1 - w) % 1, du);
        } else y = saw;
        S[out[j + 1]] = y;
        lvl[k][j + 1] += (vc.level[j + 1] - lvl[k][j + 1]) * sm;
        sum += y * lvl[k][j + 1];
      }
    }
    // ── mixer: near the top of its levels it overdrives warmly ──
    const mix = 1.2 * Math.tanh(sum * 0.7);
    S[SI.sbhMix] = mix;
    return mix;
  }

  return { set, off, step, running: () => running, stages: () => [stage[0], stage[1]] };
}
