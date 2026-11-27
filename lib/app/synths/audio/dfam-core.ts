// Moog DFAM (EngineParams `dfam`, see contract.ts), and so the Behringer EDGE, which recreates it: its control section,
// run by dsp-core.ts beside the fixed voice's two oscillators, noise, mixer, ladder filter and VCA. The specs are
// `.context/app/synth-data/dfam/` and `edge/`: modules `clock`, `seq`, `trig`, `vel`, `vco_eg`, `vcf_eg` and `vca_eg`,
// behaviours b02–b04 and b09–b10.
//
// - The clock is an oscillator, TEMPO plus the TEMPO input at 1 V an octave, from 0.7 Hz into audio rate. While the
//   sequencer runs, each of its cycles moves the sequencer on a step and fires a trigger. A rising edge at ADV / CLOCK
//   does that instead, and TEMPO is then ignored.
// - RUN / STOP starts the sequencer from the step it is on, which plays first, and stops it there. A cable in the RUN /
//   STOP input takes over from it: high runs, low stops.
// - The trigger bus is normalled to the sequencer's triggers; a cable in TRIGGER breaks that, and its rising edges fire
//   the bus on the step where the sequencer is, without moving it. The bus fires all three envelopes and TRIGGER OUT,
//   a 1 ms pulse.
// - The velocity bus is normalled to the step's VELOCITY; a cable in VELOCITY breaks that. When the bus fires, each
//   envelope takes the velocity there as its peak (0..1, the EG OUT's 0..8 V), and the velocity lengthens its decay a
//   little. A step at velocity 0 is silent.
// - Each envelope rises over its attack from where it is to that peak, then falls away exponentially, reaching
//   −60 dB at its decay time. The decay CV adds to the knob, ±5 V spanning the knob's whole turn from the centre (the
//   manual: centre the knob for the widest range), read every sample, so a CV moving mid-decay moves it.
// - The mixer's NOISE / EXT channel is the voice's noise, or EXT AUDIO once that is cabled, at NOISE / EXT LEVEL plus
//   the NOISE LEVEL input. A definition routes it into the mixer (`extIn`), with `ext.level` set and the voice's own noise level at 0.
// - With the sequencer stopped, ADVANCE (`press('next')`) moves it on a step without triggering, and TRIGGER
//   (`press('trigger')`) fires the bus on the step it is on.
// - A key is the EDGE's MIDI note: it fires the bus at the key's velocity, and its pitch is the oscillators' (the
//   definition puts them on the keys from C4). While the sequencer runs a key only transposes it, as a key does on
//   the Subharmonicon; it fires the bus only while the sequencer is stopped. On the DFAM, which has no MIDI, that is
//   the app's stand-in for its TRIGGER input.
//
// Following the app's transport (`follow`, `f-own-sequencer`), the sequencer runs only while the transport does and
// RUN / STOP is lit, and starts on step 1 at the run's first beat. Its clock is locked to the beat (`beat-lock.ts`) as
// the 960's is: each step lasts the nearest whole division of the beat at TEMPO's rate, read again at every step. A
// clock above `LOCK_MAX_HZ`, or a cable in ADV / CLOCK, runs free. On the EDGE's MIDI or USB clock (`perBeat`) each
// step is instead exactly the share of the beat its SCALE sets, and the sequencer stands still without the clock.
//
// Choices the spec leaves open are the app's (`not_in_source`): how much velocity lengthens a decay (`VEL_DECAY`), that
// a positive decay CV lengthens it, that ADV / CLOCK moves the sequencer only while it runs (the manual's sync pages
// have the follower started first), and that a trigger during an envelope rises from where the envelope is.
import type { DfamParams, SubharmPress } from '@/lib/app/synths/contract';
import { LOCK_MAX_HZ, createBeatLock, snapStep } from '@/lib/app/synths/audio/beat-lock';
import type { ClockAt } from '@/lib/app/synths/audio/subharm-core';

/**
 * Signals (outputs): PITCH, VELOCITY and TRIGGER OUT, the VCO, VCF and VCA EG, and the mixer's NOISE / EXT channel
 * (`dfmNz`, the noise or EXT AUDIO at its level, which a definition routes into the mixer's `extIn`, with `ext.level` set).
 */
export const DFAM_SIGNALS: string[] = [
  'dfmPitch',
  'dfmVel',
  'dfmTrig',
  'dfmEgVco',
  'dfmEgVcf',
  'dfmEgVca',
  'dfmNz',
];

/**
 * Destinations (inputs): TEMPO, RUN / STOP, ADV / CLOCK, TRIGGER, VELOCITY, the three decay CVs, EXT AUDIO (`dfmExt`,
 * ±1 for ±5 V, which replaces the noise once cabled) and NOISE LEVEL (`dfmNzLvl`, in shares of the full level, added
 * to the knob).
 */
export const DFAM_DESTS: string[] = [
  'dfmTempo',
  'dfmRun',
  'dfmAdv',
  'dfmTrigIn',
  'dfmVelIn',
  'dfmDecVco',
  'dfmDecVcf',
  'dfmDecVca',
  'dfmExt',
  'dfmNzLvl',
];

/** The steps. */
export const DFAM_STEPS = 8;
/** Octaves a full-scale TEMPO input (5 V) moves the clock: 1 V an octave. */
const TEMPO_OCT = 5;
/** How long TRIGGER OUT's pulse lasts, seconds (the manual: roughly 1 ms). */
const TRIG_OUT_S = 0.001;
/** A decay at velocity v lasts 1 + VEL_DECAY × (v − 0.5) of its time: "slightly longer" at full velocity. */
export const VEL_DECAY = 0.3;
/** ln(1000): an exponential decay reaches −60 dB after this many time constants. */
const LN_1000 = Math.log(1000);
/** The clock's top, as a share of the sample rate. */
const CLOCK_MAX = 0.2;
/** The NOISE / EXT channel's level with its CV added: past the knob's full turn it clips (the manual: it may clip). */
const NOISE_MAX = 1.6;
/** A gate or edge input is high above this (full scale; 2.5 V). */
const HIGH = 0.5;

/** What `createDfam` hands back to the voice. */
export interface Dfam {
  /** The settings, and whether the sequencer waits for the app's clock (`EngineParams.follow`). */
  set: (p: DfamParams, follow?: boolean) => void;
  /** A click on ADVANCE (`next`) or TRIGGER, taken on the next sample. Any other press does nothing here. */
  press: (name: SubharmPress) => void;
  /** The app's master clock (`f-own-sequencer`), taken on the next sample. */
  clock: (at: ClockAt, from?: number) => void;
  /** The voice has left the DFAM: the next `set` starts afresh. */
  off: () => void;
  /** The sequencer is running, or an envelope is still moving: the voice must keep stepping. */
  busy: () => boolean;
  /** One sample, before the oscillators: whether a key was just struck, and its velocity (0..1). */
  step: (keyHit: boolean, keyVel: number) => void;
  /** The step the sequencer is on (0-based), for the step lamps. */
  stage: () => number;
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * `S` / `SI` / `DI` / `ev` / `cabled` are the voice's signal array, the name → index maps, its routing evaluator and the
 * cabled-destination flags (see dsp-core.ts), shared so cables between the DFAM's jacks just work.
 */
export function createDfam(
  sr: number,
  S: Float64Array,
  SI: Record<string, number>,
  DI: Record<string, number>,
  ev: (d: number) => number,
  cabled: Uint8Array
): Dfam {
  const EG_OUT = [SI.dfmEgVco, SI.dfmEgVcf, SI.dfmEgVca];
  const EG_CV = [DI.dfmDecVco, DI.dfmDecVcf, DI.dfmDecVca];
  const lock = createBeatLock(sr);

  let P: DfamParams | null = null;
  let follow = false;
  // the sequencer: its step, whether the next clock plays the step it is on (just started), its clock's phase
  let st = 0,
    armed = true,
    running = false,
    ph = 0;
  // the beat lock's grid: where the current step began, in beats, and how long it is (0 = to be measured)
  let gridAt = 0,
    gridLen = 0,
    locked = false;
  // edges: ADV / CLOCK, TRIGGER and RUN / STOP last sample, and whether RUN / STOP was cabled
  let advPrev = false,
    trigPrev = false,
    runPrev = false,
    runCab = false;
  // ADVANCE and TRIGGER pressed since the last sample
  let pNext = false,
    pTrig = false;
  // TRIGGER OUT's samples still high; the velocity the last key fired with, shown at VELOCITY until the step moves
  let trigOut = 0,
    keyVelOut = -1;
  // per envelope: its level, whether it is rising, the peak it rises to, and the velocity's share of its decay
  const lvl = [0, 0, 0],
    rising = [false, false, false],
    peak = [0, 0, 0],
    velMul = [1, 1, 1];

  function set(p: DfamParams, follows = false) {
    const first = !P;
    const followChanged = follows !== follow;
    follow = follows;
    // a change of RUN / STOP, or of whether it waits for the transport, sets the sequencer going or stops it
    if ((first || followChanged || p.run !== P!.run) && !runCab) {
      const was = running;
      // following the app's clock, a lit RUN / STOP waits for its run; otherwise it starts on this sample
      running = p.run && (!follow || lock.running());
      if (running && (first || !was)) {
        armed = true;
        ph = 1;
        gridLen = 0;
      }
    }
    P = p;
  }

  function off() {
    P = null;
    st = 0;
    armed = true;
    running = false;
    ph = 0;
    gridAt = gridLen = 0;
    locked = false;
    advPrev = trigPrev = runPrev = runCab = false;
    pNext = pTrig = false;
    trigOut = 0;
    keyVelOut = -1;
    for (let k = 0; k < 3; k++) {
      lvl[k] = peak[k] = 0;
      rising[k] = false;
      velMul[k] = 1;
    }
  }

  function advance() {
    st = (st + 1) % DFAM_STEPS;
    keyVelOut = -1;
  }

  /** One clock of the sequencer: the step it is on if it has just started, else the next. Returns true (a trigger). */
  function tick(): boolean {
    if (armed) armed = false;
    else advance();
    return true;
  }

  function stepVel(p: DfamParams): number {
    return clamp(p.vel[st] || 0, 0, 1);
  }

  function fire(v: number) {
    trigOut = Math.max(1, Math.round(TRIG_OUT_S * sr));
    const pk = clamp(v, 0, 1);
    for (let k = 0; k < 3; k++) {
      peak[k] = pk;
      velMul[k] = 1 + VEL_DECAY * (pk - 0.5);
      // a trigger during an envelope rises from where it is; one already above the new peak falls from there
      rising[k] = lvl[k] < pk;
    }
  }

  function step(keyHit: boolean, keyVel: number) {
    if (!P) return;
    const p = P;

    // ── the app's master clock ──
    const le = lock.step();
    if (follow && !runCab) {
      if (le === 'start') {
        // a run starts on step 1 at its first beat, which plays first
        st = 0;
        armed = true;
        gridLen = 0;
        running = p.run;
        if (running) {
          ph = 1;
          keyVelOut = -1;
        }
      } else if (le === 'stop') running = false;
    }

    // ── RUN / STOP ──
    const rc = !!cabled[DI.dfmRun];
    if (rc !== runCab) {
      runCab = rc;
      // a fresh cable takes over from where the sequencer is; an unplugged one hands it back to the panel
      runPrev = running;
      if (!rc) {
        running = p.run && (!follow || lock.running());
        // handed back running, it starts again on the step it is on, as any start does
        if (running && !runPrev) {
          armed = true;
          ph = 1;
          gridLen = 0;
        }
      }
    }
    if (rc) {
      const g = ev(DI.dfmRun) > HIGH && (!follow || lock.running());
      if (g && !runPrev) {
        running = true;
        armed = true;
        ph = 1;
        gridLen = 0;
      } else if (!g && runPrev) running = false;
      runPrev = g;
    }

    // ── the clock ──
    let seqFire = false;
    const advCab = !!cabled[DI.dfmAdv];
    const adv = ev(DI.dfmAdv) > HIGH;
    const hz = Math.min(p.tempo * Math.exp(ev(DI.dfmTempo) * TEMPO_OCT * Math.LN2), sr * CLOCK_MAX);
    // on the EDGE's MIDI or USB clock (`perBeat`) a step is a fixed share of the beat, and nothing runs without it
    const per = p.perBeat && p.perBeat > 0 ? p.perBeat : 0;
    const len = (bps: number): number => (per ? 1 / per : snapStep(hz, bps));
    const nowLocked = !advCab && (per > 0 || (follow && hz <= LOCK_MAX_HZ));
    if (advCab) {
      // ADV / CLOCK takes over from TEMPO; it moves the sequencer only while it runs
      if (running && adv && !advPrev) seqFire = tick();
    } else if (nowLocked) {
      // a run's first step plays on its first beat, before the pulses have measured the beat
      if (le === 'start' && running && armed) seqFire = tick();
      if (lock.running()) {
        const bps = lock.bps(),
          b = lock.beat();
        // taking the lock mid-run (TEMPO turned down to a tempo) measures the grid from where the run is
        if (!locked) gridLen = 0;
        if (gridLen === 0 && bps > 0) {
          gridLen = len(bps);
          gridAt = Math.floor(b / gridLen + 1e-9) * gridLen;
          // lit inside a run, it plays on the next step of the grid (the loop below), unless it is on one now
          if (running && armed && b - gridAt < 1e-6) seqFire = tick();
        }
        // far behind (the step shortened a long way at once), the grid is moved up rather than walked a step a pass
        if (gridLen > 0 && b - gridAt > 4 * gridLen)
          gridAt += Math.floor((b - gridAt) / gridLen - 1) * gridLen;
        while (gridLen > 0 && b >= gridAt + gridLen - 1e-9) {
          gridAt += gridLen;
          if (running) seqFire = tick();
          gridLen = len(bps);
        }
      }
    } else if (running) {
      // the phase is read before it moves, so a start (phase 1) ticks on this very sample
      if (ph >= 1) {
        ph -= Math.floor(ph);
        seqFire = tick();
      }
      ph += hz / sr;
    }
    locked = nowLocked;
    advPrev = adv;

    // ── ADVANCE, TRIGGER and the keys, with the sequencer stopped ──
    if (pNext && !running) {
      advance();
      armed = false;
    }
    const btnFire = pTrig && !running;
    pNext = pTrig = false;
    const keyFire = keyHit && !running;

    // ── the trigger and velocity buses ──
    // a cable in TRIGGER breaks the sequencer's normal; the button and the keys still fire the bus
    const tc = !!cabled[DI.dfmTrigIn];
    const tIn = ev(DI.dfmTrigIn) > HIGH;
    const bus = (tc ? tIn && !trigPrev : seqFire) || btnFire || keyFire;
    trigPrev = tIn;
    // VELOCITY OUT shows a key's velocity after the key fires the bus, and the step's after anything else does
    if (keyFire) keyVelOut = clamp(keyVel, 0, 1);
    else if (bus) keyVelOut = -1;
    if (bus) fire(cabled[DI.dfmVelIn] ? ev(DI.dfmVelIn) : keyFire ? keyVel : stepVel(p));
    S[SI.dfmTrig] = trigOut > 0 ? 1 : 0;
    if (trigOut > 0) trigOut--;

    // ── the envelopes ──
    for (let k = 0; k < 3; k++) {
      const e = p.eg[k];
      if (rising[k]) {
        const a = Math.max(e.attack, 1 / sr);
        lvl[k] += peak[k] / (a * sr);
        if (lvl[k] >= peak[k]) {
          lvl[k] = peak[k];
          rising[k] = false;
        }
      } else if (lvl[k] > 0) {
        const pos = clamp(e.decay + 0.5 * ev(EG_CV[k]), 0, 1);
        const lo = Math.max(e.min, 1e-4),
          hi = Math.max(e.max, lo);
        const t = lo * Math.pow(hi / lo, pos) * velMul[k];
        lvl[k] *= Math.exp(-LN_1000 / (t * sr));
        if (lvl[k] < 1e-6) lvl[k] = 0;
      }
      S[EG_OUT[k]] = lvl[k];
    }

    // ── PITCH and VELOCITY ──
    // ── the NOISE / EXT channel: the voice's noise (last sample's), or EXT AUDIO once cabled, at the knob plus its CV ──
    const src = cabled[DI.dfmExt] ? ev(DI.dfmExt) : S[SI.noise] || 0;
    const nl = p.noise + ev(DI.dfmNzLvl);
    S[SI.dfmNz] = src * (nl > 0 ? (nl < NOISE_MAX ? nl : NOISE_MAX) : 0);

    S[SI.dfmPitch] = clamp(p.pitch[st] || 0, -1, 1);
    S[SI.dfmVel] = keyVelOut >= 0 ? keyVelOut : stepVel(p);
  }

  function press(name: SubharmPress) {
    if (!P) return;
    if (name === 'next') pNext = true;
    else if (name === 'trigger') pTrig = true;
  }

  // the lock hears the transport even while the voice is another synth's, so it knows whether a run is going on its return
  function clock(at: ClockAt, from?: number) {
    lock.clock(at, from);
  }

  return {
    set,
    press,
    clock,
    off,
    busy: () => running || lvl[0] > 0 || lvl[1] > 0 || lvl[2] > 0,
    step,
    stage: () => st,
  };
}
