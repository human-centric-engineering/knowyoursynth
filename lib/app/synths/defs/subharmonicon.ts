/**
 * Moog Subharmonicon: the definition. Positions are measured on the owner's photo of the panel straight on,
 * `.context/app/synth-data/subharmonicon/raw/Moog Subharmonicon.jpg` (2048 × 1024, local only), read at 2000 × 1000
 * (divide a file pixel by 1.024), and turned into view units by P() / Q(): view x = (x − 205) × 1.25 + the cheek,
 * view y = (y − 170) × 1.25. The view is the faceplate between the wooden cheeks. The owner's spec is
 * `.context/app/synth-data/subharmonicon/subharmonicon.synth.json` (0.13.0): 22 modules, 63 parameters, 34 ports.
 *
 * Written straight into the app (`f-next-synths`), from `defs/0-coast.ts` (a semi-modular desktop panel with its
 * patchbay) and `defs/sub-37.ts` (Moog's knobs and marks). The sound path is the engine's `subharm` (t-283,
 * `audio/subharm-core.ts`): two VCOs, each with two subharmonic oscillators that divide it by 1 to 16, four rhythm
 * generators dividing the clock into two 4-step sequencers, QUANTIZE and SEQ OCT, all in place of the fixed voice's
 * oscillators; the voice's own ladder filter, its two envelopes (Envelope 1 the VCF EG, Envelope 2 the VCA EG) and its
 * VCA follow. The core gates the two envelopes itself (signals `sbhEg1` / `sbhEg2`), so they are `free` of the keys
 * and normalled to those gates. A key plays as an offset from C4 on both VCOs and gates both envelopes, as MIDI notes
 * do on the hardware.
 *
 * SUB FREQ and RHYTHM are sixteen-position knobs, 16 fully left to 1 fully right, as the panel turns. RESET, NEXT and
 * TRIGGER are momentary (`ButtonControl.press`): each click sends the engine one press, and they hold no setting.
 * Held QUANTIZE and SEQ OCT, Fine Tune, Rhythm Generator Logic (OR always, here) and the MIDI settings are drawn or
 * described but not modelled.
 *
 * The spec gives no panel numbering (`not_in_source`): unmarked knobs are 0–10 from fully left, the STEP knobs and VCF
 * EG AMT −5 to +5 with nothing at the centre. Its ranges are used where it states them (FREQ C4 to C8, CUTOFF 20 Hz to
 * 20 kHz, ATTACK 1 ms to 10 s, DECAY 5 ms to 10 s, TEMPO 20 to 3,000 BPM); the tapers between them, and VCF EG AMT's
 * depth at full, are this app's, noted where they are set.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlValues,
  Decor,
  EngineParams,
  InputJack,
  Jack,
  LedColor,
  LitWhen,
  OutputJack,
  SubharmParams,
  SubharmPress,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { DIV_PER_VOLT, quantize, SUBHARM_PPQ } from '@/lib/app/synths/audio/subharm-core';
import { num } from '@/lib/app/synths/lib/def-kit';
import { MAX_BPM, MIN_BPM } from '@/lib/app/sequencer/pattern';
import {
  clamp,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  noteName,
} from '@/lib/app/synths/lib/maps';

type InRest = Omit<InputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label'>;
type OutRest = Omit<OutputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label'>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'spacing' | 'brand'>>;
type Common = Omit<ControlCommon, 'id' | 'x' | 'y'>;

// ── Ranges and tapers ──────────────────────────────────────────────────────
/** Middle C, where FREQ sits fully left (the spec: C4 to C8). */
const C4_HZ = 261.6255653005986;
/** VCO FREQ: four octaves, 0 at C4 and 10 at C8. */
const freqSemi = (v: number): number => clamp(v, 0, 10) * 4.8;
/** CUTOFF: 20 Hz to 20 kHz (the spec), exponential. */
const cutoffHz = (v: number): number => expMap(clamp(v, 0, 10) / 10, 20, 20000);
/** RESONANCE: the ladder self-oscillates only near full (the spec: at maximum, with a low cutoff). */
const resonance = (v: number): number => (clamp(v, 0, 10) / 10) * 1.05;
/** VCF EG AMT at full either way, in octaves: the EG's 8 V at the CUTOFF input's 1 V an octave (this app's reading). */
const EG_OCT = 8;
/** ATTACK: 1 ms to 10 s; DECAY: 5 ms to 10 s (the spec), exponential. */
const attackS = (v: number): number => expMap(clamp(v, 0, 10) / 10, 0.001, 10);
const decayS = (v: number): number => expMap(clamp(v, 0, 10) / 10, 0.005, 10);
/** TEMPO: 0.333 to 50 Hz, 20 to 3,000 BPM at one clock a beat (the spec), exponential. */
const TEMPO_LO = 0.333,
  TEMPO_HI = 50;
const tempoHz = (v: number): number => expMap(clamp(v, 0, 10) / 10, TEMPO_LO, TEMPO_HI);
/**
 * TEMPO as the app's tempo (`SynthDef.tempoMap`, `f-own-sequencer`): on a MIDI clock the Subharmonicon takes four clocks
 * a beat (the spec's 4 PPQ), so the app's BPM is a quarter of TEMPO's clocks a minute, and the app's transport clocks
 * the sequencers at the speed TEMPO runs them. Whole BPM, as the knob's positions are stored to a hundredth of a turn:
 * a riff's 120 comes back as 120, not 119.8.
 */
const tempoMap = {
  // held to the app's tempos (20 to 300): past either end the bar, the riff and MIDI out stay at that end
  toBpm: (v: number): number =>
    clamp(Math.round((tempoHz(v) * 60) / SUBHARM_PPQ), MIN_BPM, MAX_BPM),
  fromBpm: (bpm: number): number =>
    clamp(
      (10 * Math.log((bpm * SUBHARM_PPQ) / 60 / TEMPO_LO)) / Math.log(TEMPO_HI / TEMPO_LO),
      0,
      10
    ),
};
/** The mixer levels: straight 0..1 (the core's mixer overdrives near the top of the six together). */
const mixLevel = (v: number): number => clamp(v, 0, 10) / 10;
/** A QUANTIZE setting the engine knows. */
const isQuantize = (x: unknown): x is SubharmParams['quantize'] =>
  x === 'off' || x === '12-ET' || x === '8-ET' || x === '12-JI' || x === '8-JI';
/** The sixteen positions of a SUB FREQ or RHYTHM knob, 16 fully left to 1 fully right. */
const DIVISORS = Array.from({ length: 16 }, (_, i) => 16 - i);

// ── Geometry (photo pixels at 2000 × 1000 in, view units out) ───────────────
const OX = 205,
  OY = 170,
  K = 1.25,
  CHEEK = 46;
const P = (x: number): number => (x - OX) * K + CHEEK;
const Q = (y: number): number => (y - OY) * K;
const INK = '#e9e8e4';
const PANEL = '#1f1f21';

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];

const text = (x: number, y: number, t: string, size = 15, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: P(x),
    y: Q(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 2): void => {
  decor.push({ t: 'line', x1: P(x1), y1: Q(y1), x2: P(x2), y2: Q(y2), w });
};
const led = (x: number, y: number, litWhen?: LitWhen, color: LedColor = 'white'): void => {
  decor.push({ t: 'led', x: P(x), y: Q(y), r: 8, color, ...(litWhen ? { litWhen } : {}) });
};

const knob = (
  id: string,
  x: number,
  y: number,
  r: number,
  rest: Common & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number, values?: ControlValues) => string;
  }
): void => {
  const { min = 0, max = 10, def = 0, fmt, ...common } = rest;
  controls.push({
    id,
    type: 'knob',
    x: P(x),
    y: Q(y),
    r: r * K,
    style: 'd-silver',
    kind: 'cont',
    min,
    max,
    def,
    ...(fmt ? { fmt } : {}),
    labelPos: 'none',
    ...common,
  });
};
/** A sixteen-position knob (SUB FREQ, RHYTHM): its value is the divisor, 16 fully left to 1 fully right. */
const divKnob = (id: string, x: number, y: number, r: number, def: number, rest: Common): void => {
  controls.push({
    id,
    type: 'knob',
    x: P(x),
    y: Q(y),
    r: r * K,
    style: 'd-silver',
    kind: 'enum',
    def,
    options: DIVISORS.map((d, i) => ({ v: d, label: '', a: -150 + 20 * i })),
    fmt: (v) => (Number(v) === 1 ? '1 (unison)' : `÷${String(v)}`),
    labelPos: 'none',
    ...rest,
  });
};
/** One of the panel's grey buttons, its name on the cap; `lamp` lights it while it is on (or off its first option). */
const button = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  caption: string,
  rest: Common &
    (
      | { kind: 'bool'; def: boolean; press?: SubharmPress }
      | { kind: 'enum'; def: string | number; options: { v: string | number; label: string }[] }
    ),
  lamp = true
): void => {
  controls.push({
    id,
    type: 'button',
    x: P(x),
    y: Q(y),
    w: w * K,
    h: h * K,
    face: 'ring',
    caption,
    captionSize: 11,
    ...(lamp ? { lamp: 'white' as const } : {}),
    label: caption,
    labelPos: 'none',
    ...rest,
  });
};
const jackIn = (id: string, x: number, y: number, label: string, rest: InRest): void => {
  jacks.push({ id, x: P(x), y: Q(y), r: 19, dir: 'in', label, labelPos: 'none', ...rest });
};
const jackOut = (id: string, x: number, y: number, label: string, rest: OutRest): void => {
  jacks.push({ id, x: P(x), y: Q(y), r: 19, dir: 'out', label, labelPos: 'none', ...rest });
};

// ── Faceplate ──────────────────────────────────────────────────────────────
for (const [x, y] of [
  [243, 187],
  [1360, 185],
  [1757, 185],
  [243, 828],
  [829, 826],
  [1360, 826],
  [1757, 827],
])
  decor.push({ t: 'screw', x: P(x), y: Q(y), r: 10, hw: true });
// the dividing lines: down the middle of the oscillators, and before the patchbay
line(913, 215, 913, 248);
line(913, 650, 913, 830);
line(1495, 172, 1495, 838, 1.5);

// ── Sequencers ─────────────────────────────────────────────────────────────
const STEP_X = [272, 371, 471, 570];
const ONE_SEQ = (s: 1 | 2): void => {
  const top = s === 1 ? 0 : 128;
  text(422, 210 + top, `SEQUENCER ${s}`, 15, { weight: 700 });
  STEP_X.forEach((x, i) => {
    text(x, 228 + top, `STEP ${i + 1}`, 11);
    knob(`seq${s}.step${i + 1}`, x, 265 + top, 18, {
      module: 'mod',
      min: -5,
      max: 5,
      def: 0,
      label: `STEP ${i + 1}`,
      name: `SEQ ${s} STEP ${i + 1}`,
      fmt: (v, values) => {
        const oct = (clamp(v, -5, 5) / 5) * Number(values?.['seq.oct'] ?? 2);
        // with only the subs assigned, the step moves their divisors, not a pitch
        const subsOnly =
          !values?.[`seq${s}.assign_osc`] &&
          (!!values?.[`seq${s}.assign_sub1`] || !!values?.[`seq${s}.assign_sub2`]);
        if (!subsOnly) return fmtSemi(oct * 12);
        // unrounded: the core rounds the knob's divisor and the step together
        const set = values?.['vco.quantize'];
        const st = quantize(oct * 12, isQuantize(set) ? set : 'off') / 12;
        const d = -Math.round(DIV_PER_VOLT * st * 10) / 10;
        return `divisor ${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
      },
      help: `Step ${i + 1} of Sequencer ${s}: how far this step moves what the SEQ ${s} ASSIGN buttons choose, up to the right or down to the left, within the SEQ OCT range. At the centre the step changes nothing. The readout is the step’s pitch before QUANTIZE snaps it, or, with only the subs assigned, how far it moves their divisors (a step to the right lowers them, so the subs climb).`,
    });
    led(x + 1, 318 + top, s === 1 ? { seq: i } : { seq2: i });
  });
};
ONE_SEQ(1);
ONE_SEQ(2);

// ── Polyrhythm: the four rhythm generators ─────────────────────────────────
text(422, 468, 'POLYRHYTHM', 15, { weight: 700 });
STEP_X.forEach((x, i) => {
  const n = i + 1;
  text(x, 487, `RHYTHM ${n}`, 11);
  divKnob(`rhythm${n}.div`, x, 522, 18, n, {
    module: 'mod',
    label: `RHYTHM ${n}`,
    help: `Rhythm generator ${n} divides the tempo by a whole number: 1 fully right fires on every clock, 16 fully left on every sixteenth. It moves the sequencers its SEQ 1 and SEQ 2 buttons choose; two or more on one sequencer make a polyrhythm that comes round again when they meet on a downbeat.`,
  });
  for (const s of [1, 2] as const)
    button(`rhythm${n}.seq${s}`, x, s === 1 ? 591 : 638, 52, 26, `SEQ ${s}`, {
      module: 'mod',
      kind: 'bool',
      def: false,
      name: `RHYTHM ${n} SEQ ${s}`,
      help: `Lit, Rhythm ${n} advances Sequencer ${s} (and, with EG on, triggers the envelopes) each time it fires. A sequencer no rhythm drives stays on its step.`,
    });
});

// ── Tempo and transport ────────────────────────────────────────────────────
text(322, 675, 'TEMPO', 17, { weight: 700 });
knob('clock.tempo', 322, 745, 44, {
  module: 'mod',
  // ♩ = 120, to a hundredth of a turn as a knob's positions are stored
  def: Math.round(tempoMap.fromBpm(120) * 100) / 100,
  label: 'TEMPO',
  fmt: (v) => `${Math.round(tempoHz(v) * 60)} BPM · ♩ = ${tempoMap.toBpm(v)}`,
  help: 'The master clock, from 20 to 3,000 beats a minute, one clock a beat. The four rhythm generators divide it; it runs only while PLAY is lit, and a cable in CLOCK takes over from it. In this app it is also the tempo on the bar (♩): on a MIDI clock the Subharmonicon counts four clocks to a beat, so a beat of the app is four of its clocks, and the app’s Play clocks it as a MIDI clock would. The app’s tempos run from 20 to 300, so past those the knob turns without moving ♩.',
});
button(
  'transport.reset',
  440,
  706,
  40,
  28,
  'RESET',
  {
    module: 'mod',
    kind: 'bool',
    def: false,
    ui: true,
    press: 'reset',
    help: 'Sends both sequencers back to step 1 and the rhythm generators to the downbeat, so the polyrhythm starts again from the top. Each click is one press; it holds no setting, so loading a sound never presses it. On the hardware holding it holds step 1; here a gate at the RESET input does that.',
  },
  false
);
button('transport.eg', 508, 706, 40, 28, 'EG', {
  module: 'env',
  kind: 'enum',
  def: 'on',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'on', label: 'On' },
    { v: 'held', label: 'Held' },
  ],
  label: 'EG',
  help: 'Whether the sequencers play the envelopes. On (lit): every step triggers both. Off: steps change the pitch but the envelopes wait for TRIGGER, a key or the TRIGGER input. Held (a long press on the hardware, blinking): both envelopes are held fully open, a drone whose pitch the sequencers move.',
});
button(
  'transport.next',
  576,
  706,
  40,
  28,
  'NEXT',
  {
    module: 'mod',
    kind: 'bool',
    def: false,
    ui: true,
    press: 'next',
    help: 'Moves both sequencers on one step without triggering the envelopes, to tune a sequence step by step while it is stopped. Each click is one press; it holds no setting, so loading a sound never presses it.',
  },
  false
);
button('transport.play', 456, 764, 64, 36, 'PLAY', {
  module: 'mod',
  kind: 'bool',
  def: false,
  help: 'Starts and stops the clock, the rhythm generators and the sequencers (and CLOCK OUT). A cable in the PLAY input takes over from it. In this app the clock is the app’s, as a MIDI clock is on the hardware: lit, the sequencers run while Play on the bar runs, from step 1 on its downbeat, and stop with Stop. Lighting it while nothing plays presses Play for you.',
});
button(
  'transport.trigger',
  559,
  764,
  64,
  36,
  'TRIGGER',
  {
    module: 'env',
    kind: 'bool',
    def: false,
    ui: true,
    press: 'trigger',
    help: 'Fires both envelopes once, as a step does with EG on; a press during an envelope’s attack is ignored, and with EG held it does nothing. Each click is one press; it holds no setting, so loading a sound never presses it. On the hardware, with EG off, holding it holds the envelopes open like a gate.',
  },
  false
);

// ── Oscillators ────────────────────────────────────────────────────────────
text(912, 195, 'OSCILLATORS', 16, { weight: 700 });
line(660, 195, 852, 195, 1.5);
line(972, 195, 1165, 195, 1.5);
line(637, 195, 637, 215, 1.5);
line(1190, 195, 1190, 215, 1.5);
text(648, 207, '1', 15, { weight: 700 });
text(1177, 207, '2', 15, { weight: 700 });

const VCO = (n: 1 | 2): void => {
  const cx = n === 1 ? 767 : 1058; // the FREQ knob's column
  const tx = n === 1 ? 661 : 1153; // the WAVE switch
  const sub = n === 1 ? [693, 838] : [985, 1128];
  text(cx, 236, `VCO ${n} FREQ`, 15, { weight: 700 });
  knob(`vco${n}.freq`, cx, 305, 42, {
    module: 'osc',
    label: `VCO ${n} FREQ`,
    fmt: (v, values) => {
      const set = values?.['vco.quantize'];
      const q = isQuantize(set) ? set : 'off';
      const hz = C4_HZ * Math.pow(2, quantize(freqSemi(v), q) / 12);
      return `${noteName(hz)} · ${fmtHz(hz)}`;
    },
    help: `VCO ${n}’s pitch over four octaves, from middle C fully left to the C four octaves up fully right; with QUANTIZE on it steps through the scale. Its subs follow it. Keys play as an offset from here, so fully left they sound as written.`,
  });
  text(tx + 7, 265, `VCO ${n} WAVE`, 12, { weight: 700 });
  controls.push({
    id: `vco${n}.wave`,
    type: 'toggle',
    x: P(tx),
    y: Q(300),
    w: 30,
    kind: 'enum',
    def: 'saw',
    options: [
      { v: 'square', label: 'Square' },
      { v: 'pwm', label: 'Pulse (PWM)' },
      { v: 'saw', label: 'Sawtooth' },
    ],
    module: 'osc',
    label: `VCO ${n} WAVE`,
    labelPos: 'none',
    help: `The wave of VCO ${n} and both its subs: up, all square (hollow); middle, VCO ${n} a pulse whose width SUB 1’s sawtooth moves, with sawtooth subs (an extra pitched ripple, even with SUB 1 silent); down, all sawtooth (bright).`,
  });
  decor.push(
    { t: 'wave', x: P(tx), y: Q(279), size: 12, shape: 'sq', w: 2 },
    { t: 'wave', x: P(n === 1 ? tx - 42 : tx + 42), y: Q(300), size: 12, shape: 'pulse', w: 2 },
    { t: 'wave', x: P(tx), y: Q(343), size: 12, shape: 'saw', w: 2 }
  );
  sub.forEach((x, j) => {
    const s = j + 1;
    text(x + (j ? 2 : 0), 386, `SUB ${s} FREQ`, 13, { weight: 700 });
    divKnob(`sub${n}${s}.div`, x, 444, 33, s + 1, {
      module: 'osc',
      label: `SUB ${s} FREQ`,
      name: `VCO ${n} SUB ${s} FREQ`,
      help: `The divisor of VCO ${n} SUB ${s}: it plays VCO ${n}’s pitch divided by a whole number, from unison (1, fully right) down through the octave (2), the octave and a fifth (3) and two octaves (4) to 16 fully left. Those are the undertones, so a sub always lands on a note of the subharmonic series under its VCO.`,
    });
  });
  // SEQ ASSIGN: what this VCO's sequencer moves
  const ax = n === 1 ? [697, 767, 835] : [990, 1058, 1126];
  text(cx, 507, `SEQ ${n} ASSIGN`, 12, { weight: 700 });
  line(ax[0] - 30, 507, cx - 52, 507, 1.5);
  line(cx + 52, 507, ax[2] + 30, 507, 1.5);
  line(ax[0] - 30, 507, ax[0] - 30, 538, 1.5);
  line(ax[2] + 30, 507, ax[2] + 30, 538, 1.5);
  (['osc', 'sub1', 'sub2'] as const).forEach((what, k) => {
    const cap = what === 'osc' ? `OSC ${n}` : what === 'sub1' ? 'SUB 1' : 'SUB 2';
    button(`seq${n}.assign_${what}`, ax[k], 538, 44, 26, cap, {
      module: 'osc',
      kind: 'bool',
      def: false,
      name: `SEQ ${n} ASSIGN ${cap}`,
      help:
        what === 'osc'
          ? `Lit, Sequencer ${n} moves VCO ${n}’s pitch, and its subs follow, so the whole chord moves.`
          : `Lit, Sequencer ${n} moves SUB ${k}’s divisor instead of its pitch: turning a step right lowers the divisor, so the sub climbs the undertone series while VCO ${n} stays put.`,
    });
  });
  // the mixer: the VCO level, then its subs' levels below
  text(cx - 2, 572, `VCO ${n} LEVEL`, 13, { weight: 700 });
  knob(`mix.vco${n}`, cx - 2, 630, 30, {
    module: 'mixer',
    def: n === 1 ? 7 : 0,
    label: `VCO ${n} LEVEL`,
    help: `How loud VCO ${n} is in the mix into the filter. The six levels together overdrive the mixer warmly near the top.`,
  });
  sub.forEach((x, j) => {
    const s = j + 1;
    text(x, 690, `SUB ${s} LEVEL`, 13, { weight: 700 });
    knob(`mix.sub${n}${s}`, x - (j ? 0 : 4), 755, 30, {
      module: 'mixer',
      label: `SUB ${s} LEVEL`,
      name: `VCO ${n} SUB ${s} LEVEL`,
      help: `How loud VCO ${n} SUB ${s} is in the mix. Brought in under VCO ${n} it adds a lower note of the same chord.`,
    });
  });
};
VCO(1);
VCO(2);

// the shared column: SEQ OCT and QUANTIZE
(
  [
    [5, 265, '±5'],
    [2, 291, '±2'],
    [1, 317, '±1'],
  ] as const
).forEach(([o, y, t]) => {
  led(911, y, { id: 'seq.oct', eq: o });
  text(930, y, t, 11, { anchor: 'start' });
});
button(
  'seq.oct',
  912,
  362,
  44,
  26,
  'SEQ OCT',
  {
    module: 'mod',
    kind: 'enum',
    def: 2,
    options: [
      { v: 5, label: '±5' },
      { v: 2, label: '±2' },
      { v: 1, label: '±1' },
    ],
    label: 'SEQ OCT',
    help: 'The range of every STEP knob on both sequencers: a step turned fully either way moves its pitch 5, 2 or 1 octaves. ±1 makes fine melodies easy to set; ±5 reaches the whole range with FREQ fully left (the sequencers cannot push a VCO above about 10 kHz).',
  },
  false
);
(
  [
    ['12-ET', 497],
    ['8-ET', 524],
    ['12-JI', 551],
    ['8-JI', 577],
  ] as const
).forEach(([q, y]) => {
  led(911, y, { id: 'vco.quantize', eq: q });
  text(928, y, q, 11, { anchor: 'start' });
});
button(
  'vco.quantize',
  913,
  622,
  50,
  26,
  'QUANTIZE',
  {
    module: 'osc',
    kind: 'enum',
    def: 'off',
    options: [
      { v: 'off', label: 'Off' },
      { v: '12-ET', label: '12-ET' },
      { v: '8-ET', label: '8-ET' },
      { v: '12-JI', label: '12-JI' },
      { v: '8-JI', label: '8-JI' },
    ],
    label: 'QUANTIZE',
    help: 'Snaps both FREQ knobs and every sequencer step to a scale, for both VCOs at once: off (no lamp), the twelve notes in equal temperament (12-ET), C major (8-ET), or the same two in just intonation (12-JI, 8-JI), whose chords are pure and do not beat. The C major scales are rooted on C.',
  },
  false
);

// ── Filter, envelopes and VCA ──────────────────────────────────────────────
text(1276, 195, 'CUTOFF', 17, { weight: 700 });
knob('vcf.cutoff', 1276, 262, 40, {
  module: 'filter',
  def: 10,
  label: 'CUTOFF',
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the Moog ladder filter starts to take away the highs, from 20 Hz to 20 kHz: turned down the sound grows darker and rounder. It cuts 24 dB an octave above that point.',
});
text(1276, 355, 'RESONANCE', 17, { weight: 700 });
knob('vcf.resonance', 1276, 425, 40, {
  module: 'filter',
  label: 'RESONANCE',
  help: 'A peak at the cutoff that rings and whistles as it rises; fully up, with the cutoff low, the filter sings on its own as a sine.',
});
text(1432, 195, 'VOLUME', 17, { weight: 700 });
knob('vca.volume', 1432, 262, 40, {
  module: 'amp',
  def: 7,
  label: 'VOLUME',
  help: 'The output level: the VCA EG opens the amplifier up to this setting.',
});
text(1432, 355, 'VCF EG AMT', 17, { weight: 700 });
text(1388, 490, '(–)', 11);
text(1471, 490, '(+)', 11);
knob('vcf_eg.amount', 1432, 425, 40, {
  module: 'filter',
  min: -5,
  max: 5,
  def: 0,
  label: 'VCF EG AMT',
  fmt: (v) => {
    const oct = Math.round((clamp(v, -5, 5) / 5) * EG_OCT * 10) / 10;
    return `${oct > 0 ? '+' : oct < 0 ? '−' : ''}${Math.abs(oct)} oct`;
  },
  help: 'How far the VCF EG moves the cutoff on each trigger: right of centre it opens the filter, left of centre it closes it, and at the centre it does nothing. Here fully right lifts the cutoff eight octaves at the envelope’s peak.',
});
(
  [
    ['vcf_eg', 'VCF', 'env', 587, 515],
    ['vca_eg', 'VCA', 'env', 752, 676],
  ] as const
).forEach(([eg, name, module, y, ty]) => {
  text(1276, ty, `${name} ATTACK`, 17, { weight: 700 });
  knob(`${eg}.attack`, 1276, y, 42, {
    module,
    label: `${name} ATTACK`,
    fmt: (v) => fmtTime(attackS(v)),
    help: `How long the ${name} EG takes to rise to its peak, 1 ms to 10 s. A trigger during the attack is ignored, so a long attack lets only some steps through.`,
  });
  text(1432, ty, `${name} DECAY`, 17, { weight: 700 });
  knob(`${eg}.decay`, 1432, y, 42, {
    module,
    def: eg === 'vcf_eg' ? 3 : 2,
    label: `${name} DECAY`,
    fmt: (v) => fmtTime(decayS(v)),
    help: `How long the ${name} EG takes to fall from its peak, 5 ms to 10 s. A key or gate held past the attack holds the peak, and the decay starts when it lets go.`,
  });
});

// ── Patchbay ───────────────────────────────────────────────────────────────
text(1640, 197, 'IN / OUT', 14, { weight: 700 });
const COL = [1533, 1605, 1675, 1745];
const ROW = [262, 332, 402, 473, 543, 612, 683, 755];
const LROW = [229, 299, 369, 440, 510, 580, 650, 720];
/** A jack's printed name; an output's sits on a plate, as the panel boxes them. */
const name = (c: number, r: number, t: string, out: boolean): void => {
  if (out)
    decor.push({
      t: 'rect',
      x: P(COL[c] - 31),
      y: Q(LROW[r] - 8),
      w: 62 * K,
      h: 16 * K,
      r: 2,
      fill: INK,
      hw: true,
    });
  text(COL[c], LROW[r], t, 10, out ? { fill: PANEL, weight: 700 } : { weight: 700 });
};
const inJ = (c: number, r: number, id: string, t: string, rest: InRest): void => {
  name(c, r, t, false);
  jackIn(id, COL[c], ROW[r], t, rest);
};
const outJ = (c: number, r: number, id: string, t: string, rest: OutRest): void => {
  name(c, r, t, true);
  jackOut(id, COL[c], ROW[r], t, rest);
};
const VOLTS = 'Volts, as the hardware’s: 1 V an octave.';
// row 1
inJ(0, 0, 'j.vco1_in', 'VCO 1', {
  name: 'VCO 1 input',
  dest: 'sbhP1',
  amt: 1,
  help: `VCO 1’s pitch, one volt an octave, from −5 to +5 V. It is wired to VCO 2’s input too, so one cable moves both VCOs until VCO 2’s own input is patched. ${VOLTS}`,
});
inJ(1, 0, 'j.vco1_sub_in', 'VCO 1 SUB', {
  name: 'VCO 1 SUB input',
  dest: 'sbhSub1',
  amt: 1,
  help: 'Moves the divisors of both VCO 1 subs at once: a rising voltage lowers them, so the subs climb the undertone series. Centre the SUB FREQ knobs to give it room either way.',
});
inJ(2, 0, 'j.vco1_pwm', 'VCO 1 PWM', {
  name: 'VCO 1 PWM input',
  dest: 'sbhPwm1',
  amt: 1,
  help: 'Sets the pulse width of VCO 1, and of its subs on square, from −5 V (1 %) to +5 V (99 %). With WAVE in the middle SUB 1’s sawtooth is wired here; a cable replaces it.',
});
outJ(3, 0, 'j.vca_out', 'VCA', {
  name: 'VCA OUT',
  signal: 'vca',
  gain: 5,
  help: 'The whole synth, after the filter and VCA, at modular level (10 V peak to peak), to patch on or back in.',
});
// row 2
outJ(0, 1, 'j.vco1_out', 'VCO 1', {
  name: 'VCO 1 OUT',
  signal: 'sbhVco1',
  gain: 5,
  help: 'VCO 1 on its own, before the mixer, at 10 V peak to peak. Patching it takes nothing from the mix.',
});
outJ(1, 1, 'j.sub11_out', 'VCO 1 SUB 1', {
  name: 'VCO 1 SUB 1 OUT',
  signal: 'sbhSub11',
  gain: 5,
  help: 'VCO 1 SUB 1 on its own, at 10 V peak to peak.',
});
outJ(2, 1, 'j.sub12_out', 'VCO 1 SUB 2', {
  name: 'VCO 1 SUB 2 OUT',
  signal: 'sbhSub12',
  gain: 5,
  help: 'VCO 1 SUB 2 on its own, at 10 V peak to peak.',
});
inJ(3, 1, 'j.vca_in', 'VCA', {
  name: 'VCA input',
  dest: 'amp',
  amt: 1 / 8,
  help: 'Opens the VCA from 0 to +8 V, added to the VCA EG. A clock or a sequencer’s CLK here makes a pulse of its own; a steady voltage holds the sound on.',
});
// row 3
inJ(0, 2, 'j.vco2_in', 'VCO 2', {
  name: 'VCO 2 input',
  dest: 'sbhP2',
  amt: 1,
  help: `VCO 2’s pitch, one volt an octave, from −5 to +5 V. A cable here breaks the link from VCO 1’s input. ${VOLTS}`,
});
inJ(1, 2, 'j.vco2_sub_in', 'VCO 2 SUB', {
  name: 'VCO 2 SUB input',
  dest: 'sbhSub2',
  amt: 1,
  help: 'Moves the divisors of both VCO 2 subs at once: a rising voltage lowers them. Centre the SUB FREQ knobs to give it room either way.',
});
inJ(2, 2, 'j.vco2_pwm', 'VCO 2 PWM', {
  name: 'VCO 2 PWM input',
  dest: 'sbhPwm2',
  amt: 1,
  help: 'Sets the pulse width of VCO 2, and of its subs on square, from −5 V (1 %) to +5 V (99 %), in place of SUB 1’s sawtooth.',
});
outJ(3, 2, 'j.vca_eg_out', 'VCA EG', {
  name: 'VCA EG OUT',
  signal: 'env2',
  gain: 8,
  help: 'The VCA EG as a voltage, 0 to +8 V: patched into a RHYTHM input it changes the rhythm as each note swells and fades.',
});
// row 4
outJ(0, 3, 'j.vco2_out', 'VCO 2', {
  name: 'VCO 2 OUT',
  signal: 'sbhVco2',
  gain: 5,
  help: 'VCO 2 on its own, at 10 V peak to peak.',
});
outJ(1, 3, 'j.sub21_out', 'VCO 2 SUB 1', {
  name: 'VCO 2 SUB 1 OUT',
  signal: 'sbhSub21',
  gain: 5,
  help: 'VCO 2 SUB 1 on its own, at 10 V peak to peak.',
});
outJ(2, 3, 'j.sub22_out', 'VCO 2 SUB 2', {
  name: 'VCO 2 SUB 2 OUT',
  signal: 'sbhSub22',
  gain: 5,
  help: 'VCO 2 SUB 2 on its own, at 10 V peak to peak.',
});
inJ(3, 3, 'j.cutoff_in', 'CUTOFF', {
  name: 'CUTOFF input',
  dest: 'cutoff',
  amt: 1,
  add: true,
  help: 'Moves the filter’s cutoff, one octave a volt, up to five octaves either way, added to the knob and the VCF EG. A sequencer here plays the filter as a second melody.',
});
// row 5
inJ(0, 4, 'j.play_in', 'PLAY', {
  name: 'PLAY input',
  dest: 'sbhPlay',
  amt: 1,
  help: 'A gate here starts the sequencers as it rises and stops them as it falls, taking over from the PLAY button.',
});
inJ(1, 4, 'j.reset_in', 'RESET', {
  name: 'RESET input',
  dest: 'sbhReset',
  amt: 1,
  help: 'A trigger here sends both sequencers back to step 1 and the rhythms to the downbeat; a held gate holds them there while the envelopes keep firing.',
});
inJ(2, 4, 'j.trigger_in', 'TRIGGER', {
  name: 'TRIGGER input',
  dest: 'sbhTrigIn',
  amt: 1,
  help: 'A rising edge here fires both envelopes, as the TRIGGER button does (not during an attack, and not with EG held). SEQ 1 CLK patched here fires them on Sequencer 1’s steps only.',
});
outJ(3, 4, 'j.vcf_eg_out', 'VCF EG', {
  name: 'VCF EG OUT',
  signal: 'env1',
  gain: 8,
  help: 'The VCF EG as a voltage, 0 to +8 V, to move a rhythm, a VCO or the VCA.',
});
// row 6: the four RHYTHM inputs
for (let i = 0; i < 4; i++)
  inJ(i, 5, `j.rhythm${i + 1}_in`, `RHYTHM ${i + 1}`, {
    name: `RHYTHM ${i + 1} input`,
    dest: `sbhR${i + 1}`,
    amt: 1,
    help: `Moves Rhythm ${i + 1}’s divisor, −5 to +5 V: a rising voltage lowers it, so the rhythm speeds up. Centre the RHYTHM ${i + 1} knob to give it room either way. An envelope here makes the rhythm rush and slow.`,
  });
// row 7: the sequencers' outputs
(
  [
    [0, 'j.seq1_out', 'SEQ 1', 'sbhSeq1', 1],
    [1, 'j.seq1_clk', 'SEQ 1 CLK', 'sbhSeq1Clk', 5],
    [2, 'j.seq2_out', 'SEQ 2', 'sbhSeq2', 1],
    [3, 'j.seq2_clk', 'SEQ 2 CLK', 'sbhSeq2Clk', 5],
  ] as const
).forEach(([c, id, t, signal, gain]) => {
  const s = t.includes('2') ? 2 : 1;
  outJ(c, 6, id, t, {
    name: `${t} OUT`,
    signal,
    gain,
    help: t.endsWith('CLK')
      ? `A pulse (0 to +5 V) each time Sequencer ${s} steps: patched into TRIGGER, CUTOFF or VCA it plays a part on that sequencer’s rhythm only.`
      : `Sequencer ${s}’s step voltage, −5 to +5 V, snapped by QUANTIZE and scaled by SEQ OCT. Patched into the other VCO’s input it plays that VCO too, or into CUTOFF, PWM or a RHYTHM input.`,
  });
});
// row 8
decor.push({ t: 'led', x: P(1497), y: Q(720), r: 7, color: 'red', litWhen: 'gate' });
inJ(0, 7, 'j.midi_in', 'MIDI IN', {
  dest: null,
  help: 'MIDI on a minijack (an adapter to DIN comes with it): notes play as an offset from C4 on both VCOs and gate the envelopes, and MIDI clock runs the tempo. Here the app’s keyboard and your MIDI controller play the Subharmonicon directly, so nothing is patched here.',
});
inJ(1, 7, 'j.clock_in', 'CLOCK', {
  name: 'CLOCK input',
  dest: 'sbhClkIn',
  amt: 1,
  help: 'An external clock: each rising edge is one clock, in place of TEMPO, while PLAY is lit.',
});
outJ(2, 7, 'j.clock_out', 'CLOCK', {
  name: 'CLOCK OUT',
  signal: 'sbhClock',
  gain: 10,
  help: 'The clock the Subharmonicon is running on (0 to +10 V), only while it plays: patched into VCA it adds a beat of its own, and on the hardware it clocks a DFAM.',
});
outJ(3, 7, 'j.trigger_out', 'TRIGGER', {
  name: 'TRIGGER OUT',
  signal: 'sbhTrig',
  gain: 5,
  help: 'A short pulse (1 ms, +5 V) each time the envelopes are triggered.',
});

// ── Maker's marks ──────────────────────────────────────────────────────────
text(483, 822, 'SUBHARMONICON', 30, { brand: true, weight: 700 });
line(598, 806, 598, 836, 1.5);
text(606, 815, 'SEMI-MODULAR ANALOG', 12, { brand: true, anchor: 'start', weight: 700 });
text(606, 830, 'POLYRHYTHMIC SYNTHESIZER', 12, { brand: true, anchor: 'start', weight: 700 });
text(1003, 816, 'moog', 42, { brand: true, weight: 400, spacing: '0.02em' });

// ── Areas (photo pixels, converted) ────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: P(x0),
  y: Q(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'seq',
    label: 'Sequencers',
    module: 'mod',
    keywords: 'sequencer step steps 4-step four step seq 1 seq 2 lamps',
    rects: [R(205, 170, 620, 458)],
    help: 'Two four-step sequencers: Sequencer 1 belongs to VCO 1, Sequencer 2 to VCO 2. Each step’s knob moves its VCO’s pitch and/or its subs’ divisors, as the SEQ ASSIGN buttons choose; a lamp shows the step each is on.',
  },
  {
    id: 'rhythm',
    label: 'Polyrhythm',
    module: 'mod',
    keywords: 'polyrhythm rhythm generator clock divider divide seq 1 seq 2 rhythmicon',
    rects: [R(205, 458, 620, 660)],
    help: 'Four rhythm generators, each dividing the tempo by 1 to 16 and stepping Sequencer 1, 2 or both. Two on one sequencer make a polyrhythm, as Henry Cowell’s Rhythmicon played rhythms in whole-number ratios.',
  },
  {
    id: 'transport',
    label: 'Tempo and transport',
    module: 'mod',
    keywords: 'tempo clock bpm play reset next trigger eg envelope trigger',
    rects: [R(205, 660, 620, 840)],
    help: 'TEMPO sets the clock; PLAY starts and stops it with the rhythms and sequencers; RESET goes back to the top; NEXT steps by hand. EG decides whether steps play the envelopes, and TRIGGER fires them by hand.',
  },
  {
    id: 'vco1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords:
      'vco 1 oscillator freq pitch wave square pwm saw sub subharmonic undertone divisor seq 1 assign',
    rects: [R(620, 170, 885, 560)],
    help: 'VCO 1 and its two subharmonic oscillators, which divide its pitch by 1 to 16 and follow it. WAVE sets all three; SEQ 1 ASSIGN chooses whether Sequencer 1 moves VCO 1 or its subs’ divisors.',
  },
  {
    id: 'shared',
    label: 'SEQ OCT and QUANTIZE',
    module: 'osc',
    keywords:
      'seq oct octave range quantize scale just intonation equal temperament 12-et 8-et 12-ji 8-ji',
    rects: [R(885, 248, 940, 650)],
    help: 'Two buttons both oscillators and both sequencers share: SEQ OCT sets how far a step reaches, QUANTIZE the scale the VCOs and steps snap to.',
  },
  {
    id: 'vco2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords:
      'vco 2 oscillator freq pitch wave square pwm saw sub subharmonic undertone divisor seq 2 assign',
    rects: [R(940, 170, 1210, 560)],
    help: 'VCO 2 and its two subs, as VCO 1’s, moved by Sequencer 2. Its pitch input follows VCO 1’s until patched.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level vco sub levels six sources chord',
    rects: [R(620, 560, 885, 840), R(940, 560, 1210, 840), R(885, 650, 940, 840)],
    help: 'Six levels, one for each VCO and each sub, into the filter. Up near the top together they overdrive the mixer warmly.',
  },
  {
    id: 'vcf',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf filter ladder cutoff resonance eg amount moog 24 db low-pass',
    rects: [R(1210, 170, 1355, 330), R(1210, 330, 1495, 500)],
    help: 'The Moog ladder filter, 24 dB an octave low-pass, with RESONANCE up to self-oscillation and VCF EG AMT to let the VCF EG open or close it.',
  },
  {
    id: 'out',
    label: 'Volume',
    module: 'amp',
    keywords: 'volume vca output level amplifier',
    rects: [R(1355, 170, 1495, 330)],
    help: 'VOLUME sets the output: the VCA EG opens the amplifier up to it.',
  },
  {
    id: 'vcf_eg',
    label: 'VCF EG',
    module: 'env',
    keywords: 'vcf eg envelope attack decay filter envelope ad',
    rects: [R(1210, 500, 1495, 660)],
    help: 'The filter’s attack–decay envelope. A step, TRIGGER or a key fires it; a held gate holds its peak; a trigger during its attack is ignored.',
  },
  {
    id: 'vca_eg',
    label: 'VCA EG',
    module: 'env',
    keywords: 'vca eg envelope attack decay amplifier envelope ad',
    rects: [R(1210, 660, 1495, 840)],
    help: 'The amplifier’s attack–decay envelope, opening the VCA up to VOLUME, fired with the VCF EG.',
  },
  {
    id: 'patchbay',
    label: 'Patchbay',
    module: 'patch',
    keywords: 'patchbay patch jacks in out cv gate clock trigger midi',
    rects: [R(1495, 170, 1795, 840)],
    help: 'Thirty-two jacks; the outputs’ names are boxed. Everything is wired inside already, so a cable only changes the sound, never makes it work.',
  },
];

// ── Engine mapping ─────────────────────────────────────────────────────────

function toEngine(v: ControlValues): EngineParams {
  const vco = (n: 1 | 2): SubharmParams['vco'][number] => {
    const w = v[`vco${n}.wave`];
    return {
      freq: freqSemi(num(v, `vco${n}.freq`)),
      wave: w === 'square' || w === 'pwm' ? w : 'saw',
      div: [num(v, `sub${n}1.div`), num(v, `sub${n}2.div`)],
      level: [
        mixLevel(num(v, `mix.vco${n}`)),
        mixLevel(num(v, `mix.sub${n}1`)),
        mixLevel(num(v, `mix.sub${n}2`)),
      ],
    };
  };
  const seq = (n: 1 | 2): SubharmParams['seq'][number] => ({
    steps: [1, 2, 3, 4].map((i) => clamp(num(v, `seq${n}.step${i}`), -5, 5) / 5) as [
      number,
      number,
      number,
      number,
    ],
    assign: [!!v[`seq${n}.assign_osc`], !!v[`seq${n}.assign_sub1`], !!v[`seq${n}.assign_sub2`]],
  });
  const rhythm = (n: number): SubharmParams['rhythm'][number] => ({
    div: num(v, `rhythm${n}.div`),
    seq1: !!v[`rhythm${n}.seq1`],
    seq2: !!v[`rhythm${n}.seq2`],
  });
  const q = v['vco.quantize'];
  const oct = Number(v['seq.oct']);
  const eg = v['transport.eg'];
  const subharm: SubharmParams = {
    vco: [vco(1), vco(2)],
    seq: [seq(1), seq(2)],
    rhythm: [rhythm(1), rhythm(2), rhythm(3), rhythm(4)],
    quantize: isQuantize(q) ? q : 'off',
    oct: oct === 5 || oct === 1 ? oct : 2,
    // Rhythm Generator Logic is set over MIDI on the hardware (CC 113), OR as it comes; the app keeps it there
    logic: 'or',
    tempo: tempoHz(num(v, 'clock.tempo')),
    play: !!v['transport.play'],
    eg: eg === 'off' || eg === 'held' ? eg : 'on',
  };
  // attack, then decay; a gate held past the attack holds the peak, and the decay runs once it falls
  const env = (eg: 'vcf_eg' | 'vca_eg') => {
    const d = decayS(num(v, `${eg}.decay`));
    return { a: attackS(num(v, `${eg}.attack`)), d, s: 1, r: d, free: true };
  };
  return {
    osc: [],
    subharm,
    noise: { level: 0 },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      res: resonance(num(v, 'vcf.resonance')),
      envAmt: (clamp(num(v, 'vcf_eg.amount'), -5, 5) / 5) * EG_OCT,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: env('vcf_eg'),
    env2: env('vca_eg'),
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    normals: { gate1: 'sbhEg1', gate2: 'sbhEg2' },
    routes: [],
    od: { on: false },
    delay: { on: false },
    tune: 0,
    volume: level10(num(v, 'vca.volume'), 1),
    // the sequencers run on the app's clock (`f-own-sequencer`): a lit PLAY waits for Play on the bar
    follow: true,
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const subharmonicon: SynthDef & { version: number } = {
  id: 'subharmonicon',
  version: 1,
  name: 'Subharmonicon',
  maker: 'Moog Music',
  year: 2020,
  heritage:
    'An original Moog design, after Oskar Sala’s Mixtur-Trautonium (its subharmonic oscillators) and Henry Cowell’s Rhythmicon (its whole-number polyrhythms)',
  summary:
    'A semi-modular analogue polyrhythmic synth: two VCOs, each with two subharmonic oscillators dividing it by 1 to 16, six levels into a Moog ladder filter and a VCA, each with an attack–decay envelope. Four rhythm generators divide the tempo and step two 4-step sequencers into polyrhythms; QUANTIZE snaps it all to equal or just tunings.',
  view: { w: (1795 - OX) * K + 2 * CHEEK, h: (840 - OY) * K },
  theme: {
    panel: PANEL,
    panel2: '#161618',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: CHEEK,
    knobRing: true,
    jack: 'black',
  },
  signalNames: {
    sbhVco1: 'VCO 1',
    sbhSub11: 'VCO 1 SUB 1',
    sbhSub12: 'VCO 1 SUB 2',
    sbhVco2: 'VCO 2',
    sbhSub21: 'VCO 2 SUB 1',
    sbhSub22: 'VCO 2 SUB 2',
    sbhSeq1: 'SEQ 1',
    sbhSeq1Clk: 'SEQ 1 CLK',
    sbhSeq2: 'SEQ 2',
    sbhSeq2Clk: 'SEQ 2 CLK',
    sbhClock: 'CLOCK OUT',
    sbhTrig: 'TRIGGER OUT',
    env1: 'the VCF EG',
    env2: 'the VCA EG',
    vca: 'the VCA',
  },
  destNames: {
    sbhP1: 'VCO 1’s pitch',
    sbhP2: 'VCO 2’s pitch',
    sbhSub1: 'the VCO 1 subs’ divisors',
    sbhSub2: 'the VCO 2 subs’ divisors',
    sbhPwm1: 'VCO 1’s pulse width',
    sbhPwm2: 'VCO 2’s pulse width',
    sbhPlay: 'PLAY',
    sbhReset: 'RESET',
    sbhTrigIn: 'the envelopes’ TRIGGER',
    sbhClkIn: 'the clock',
    sbhR1: 'Rhythm 1’s divisor',
    sbhR2: 'Rhythm 2’s divisor',
    sbhR3: 'Rhythm 3’s divisor',
    sbhR4: 'Rhythm 4’s divisor',
    amp: 'the VCA',
    cutoff: 'the cutoff',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  tempo: 'clock.tempo',
  tempoMap,
  ownSequencer: { run: 'transport.play', ppq: SUBHARM_PPQ },
  // Init is already the Default patch: VCO 1 alone on its sawtooth at C4 (so keys sound as played), the filter fully
  // open with no envelope on it, the VCA EG a 1 ms attack and a short decay, so a held key holds the peak like a gate.
  toEngine,
};

export default subharmonicon;
