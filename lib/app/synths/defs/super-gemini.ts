/**
 * UDO Audio Super Gemini: the definition (D1). Positions are measured on the owner's 2800 × 1182 straight-on product
 * photo (`.context/app/synth-data/super-gemini/raw/UDO Super Gemini.jpg`, local only) and written in its pixels, which
 * are the view units. The owner's spec is `.context/app/synth-data/super-gemini/super-gemini.synth.json` (the Super
 * Gemini Owner's Manual 1.0, November 2023, also in `raw/`).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/cs-80.ts`, the nearest
 * instrument: a polysynth whose keys play two complete layers. The Super Gemini's layers are the upper row of controls
 * (white caps) and the lower row (red caps), each a Super 6-style voice: DDS 1, a seven-oscillator "super" core, and DDS
 * 2, which can ring-modulate, sync or become an LFO with a sub-oscillator; MIX; a 6 dB high-pass into a 24 dB low-pass
 * with drive; a VCA with ENV 2 or a fixed envelope; ENV 1 with hold stages, invert and loop; LFO 1; and a delay send.
 * KEYBOARD plays one layer (SINGLE, the one LAYER picks), both stacked (DUAL, the engine's `layer`) or one each side of
 * C4 (SPLIT, `layer.split`, t-133). The view adds the performance section beside the keys and the top of the keys.
 *
 * Approximations, all in the notes' limits: DDS 1's super core is the centre oscillator and two detuned sisters (three
 * of the engine's four oscillators, DDS 2 the fourth; the sine or square sub takes the third); PW/WAVE morphs DDS 1's
 * wave only by hand (with LFO 1 or ENV 1 it modulates DDS 2's pulse width alone); the 32 alternative waves play a
 * sawtooth. Each layer is a mono voice: binaural stereo, LR PHASE / SPREAD and layer pan are not modelled. The shared
 * strip's voice assign, arpeggiator and chorus apply to both layers, and so do the one TIME and FEEDBACK of the delay;
 * each layer keeps its own SEND. The mod matrix, the sequencer, the bender's left-right movement, the ribbon,
 * aftertouch and program memory are drawn and explained but not modelled. The bender's push is the app's mod wheel,
 * which triggers LFO 2 as the push does.
 *
 * SHIFT shows the second functions printed under four controls: ATTACK HOLD and DECAY HOLD on the envelopes, DRIFT on
 * PW/DETUNE, PERF DETUNE on DETUNE and FINE ADJ on MOD AMOUNT. Each has its own control at the same spot. PAN (SHIFT +
 * MIX), U. SIZE, SWING and the rest are printed only.
 *
 * Ranges the manual gives: envelope stages 1 ms–10 s with holds up to 10 s, LFO 1 to 20 kHz in its HF modes, DDS 2
 * TUNE ±7 semitones (about 0.1–100 Hz as an LFO), portamento up to 10 s an octave, delay 1 ms–1 s, DETUNE ±7
 * semitones, FINE ADJ ±100 cents and TEMPO 30–300 BPM. The panel prints LFO 1 at 0.03–50 Hz and LFO 2's DELAY to 5 s.
 * The filters' ranges, the modulation depths and the second fixed envelope's release are this app's estimates
 * (`not_in_source`).
 */
import type {
  ArpMode,
  Area,
  Control,
  ContinuousValue,
  ControlOption,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnumValue,
  FxParams,
  FaderControl,
  KnobScale,
  LayerParams,
  LfoMix,
  OscMix,
  OscParams,
  ShowCondition,
  SynthDef,
  SynthModule,
  TextDecor,
  ToggleControl,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type Side = 'up' | 'lo';
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand' | 'hw'>>;
type Common = {
  module: SynthModule;
  name: string;
  help: string;
  show?: ShowCondition | ShowCondition[];
  ui?: boolean;
  find?: boolean;
};
type FaderRest = Common &
  Partial<Pick<FaderControl, 'min' | 'max' | 'def' | 'fmt' | 'len' | 'orient' | 'step'>>;
type KnobRest = Common & { scale?: KnobScale } & (ContinuousValue | EnumValue);

// ── Ranges and tapers ─────────────────────────────────────────────────────
/** Envelope stages: 1 ms to 10 s over the fader. */
const envTime = (v: number): number => 0.001 * Math.pow(10000, clamp(v, 0, 10) / 10);
/** A hold stage: none at the bottom, then up to 10 s. */
const holdTime = (v: number): number => (v <= 0 ? 0 : envTime(v));
/** LFO 1: 0.03–50 Hz, or 20 Hz–20 kHz in its HF modes (both printed beside the fader). */
const lfoHz = (v: number, hf: boolean): number =>
  hf ? expMap(v / 10, 20, 20000) : expMap(v / 10, 0.03, 50);
const lfo2Hz = (v: number): number => expMap(v / 10, 0.03, 50);
const lfoDelay = (v: number): number => 10 * Math.pow(v / 10, 2);
const lfo2Delay = (v: number): number => 5 * Math.pow(v / 10, 2);
const lpfHz = (v: number): number => expMap(v / 10, 20, 20000);
const hpfHz = (v: number): number => expMap(v / 10, 10, 5000);
/** DDS 2 at LFO range: TUNE −7…+7 sweeps about 0.1–100 Hz. */
const dds2LfoHz = (t: number): number => expMap((t + 7) / 14, 0.1, 100);
/** The MIDI note (fractional, below 0 for slow rates) that sounds at `hz`. */
const noteOf = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
const portaTime = (v: number): number => 10 * Math.pow(v / 10, 3);
const delayTime = (v: number): number => expMap(v / 10, 0.001, 1);
const tempoOf = (v: number): number => Math.round(v);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signedSemi = (v: number): string => fmtSemi(Math.round(v * 10) / 10);

// ── Photo → view ──────────────────────────────────────────────────────────
const VIEW_W = 2800;
const VIEW_H = 1140;
/** The lower row sits this far below the upper. */
const DY = 191;
const PANEL = '#e9e8e4';
const INK = '#3c3d40';
const DIM = '#77787b';
const RED = '#cf3a2f';
const BLOCK = '#2b2c2e';
const BLOCK_INK = '#e6e6e2';
const CAP = { up: '#f1f1ee', lo: '#d6372c' } as const;
const GREY_CAP = '#5d5f62';
const KEY = '#f4f3ef';

const controls: Control[] = [];
const decor: Decor[] = [];
const NOT_HERE = 'Not modelled here.';
const shiftOff: ShowCondition = { id: 'ui.shift', eq: false };
const shiftOn: ShowCondition = { id: 'ui.shift', eq: true };

/** Silkscreen text centred on (x, y) (the renderer places text by its baseline). */
const text = (x: number, y: number, t: string, size = 11, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x,
    y: Math.round(y + size * 0.35),
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 1.4, stroke?: string): void => {
  decor.push(stroke ? { t: 'line', x1, y1, x2, y2, w, stroke } : { t: 'line', x1, y1, x2, y2, w });
};
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 4): void => {
  decor.push({ t: 'rect', x, y, w, h, r, fill });
};
/** A section header: a red rule either side of the name. */
const header = (x1: number, x2: number, y: number, name: string, size = 13): void => {
  const gap = name.length * size * 0.36 + 14;
  const mid = (x1 + x2) / 2;
  line(x1, y, mid - gap, y, 2.4, RED);
  line(mid + gap, y, x2, y, 2.4, RED);
  text(mid, y, name, size, { weight: 500, spacing: 1 });
};
/** A small dark plate with light lettering, printed under a control for its second (SHIFT) function. */
const plate = (x: number, y: number, t: string, w = t.length * 7 + 10): void => {
  rect(x - w / 2, y - 7, w, 14, BLOCK, 1);
  text(x, y, t, 9, { fill: BLOCK_INK, weight: 700 });
};

// ── Control helpers ───────────────────────────────────────────────────────
const fader = (
  id: string,
  x: number,
  y: number,
  cap: string,
  rest: FaderRest,
  printed?: string,
  ink = INK
): void => {
  const { len, orient, ...more } = rest;
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len: len ?? 84,
    orient: orient ?? 'v',
    pad: 8,
    ticks: 11,
    face: 'block',
    cap,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    label: printed ?? rest.name,
    ...more,
  });
  if (printed && orient !== 'h') text(x, y + 64, printed, 10.5, { fill: ink });
};
const knob = (id: string, x: number, y: number, r: number, cap: string, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r,
    style: 'vcs3',
    cap,
    labelPos: 'none',
    label: rest.name,
    ...rest,
  });
};
/** A three-way bat toggle: `options` top to bottom. */
const toggle = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: Common
): void => {
  const t: ToggleControl = {
    id,
    type: 'toggle',
    x,
    y,
    w: 22,
    h: 46,
    tip: '#151516',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    label: rest.name,
    ...rest,
  };
  controls.push(t);
};
/** A square push button; a bool, or an enum it steps through. */
const button = (
  id: string,
  x: number,
  y: number,
  rest: Common &
    ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string }),
  dark = false
): void => {
  const { kind, ...more } = rest;
  const value =
    kind === 'enum'
      ? { kind: 'enum' as const, options: rest.options, def: rest.def }
      : { kind: 'bool' as const, def: rest.def ?? false };
  controls.push({
    id,
    type: 'button',
    x,
    y,
    w: 34,
    h: 46,
    labelPos: 'none',
    label: rest.name,
    capColor: dark ? '#3a3b3e' : '#f1f1ee',
    capLamp: true,
    ...more,
    ...value,
  });
};
/** A lamp. */
const led = (x: number, y: number, litWhen?: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push(
    litWhen
      ? { t: 'led', x, y, r: 4, color: 'red', litWhen }
      : { t: 'led', x, y, r: 4, color: 'red' }
  );
};
const wave = (x: number, y: number, shape: WaveShape, size = 9, stroke = INK): void => {
  decor.push({ t: 'wave', x, y, size, shape, stroke, w: 1.4 });
};
/** Print an enum knob's positions round it: a glyph or a word at each option's angle. */
const ring = (
  x: number,
  y: number,
  r: number,
  marks: string[],
  ink: string,
  spread = 240
): void => {
  const n = marks.length;
  marks.forEach((m, i) => {
    const a = ((-spread / 2 + (spread * i) / Math.max(1, n - 1)) * Math.PI) / 180;
    const px = x + Math.sin(a) * (r + 16),
      py = y - Math.cos(a) * (r + 16);
    if (isWave(m)) wave(px, py, m, 8, ink);
    else text(px, py, m, 8.5, { fill: ink });
  });
};
const WAVES = new Set<string>(['tri', 'saw', 'rsaw', 'sq', 'pulse', 'sine', 'noise']);
function isWave(m: string): m is WaveShape {
  return WAVES.has(m);
}

// ── Faceplate furniture ───────────────────────────────────────────────────
// the dark oscillator and envelope blocks of both rows
for (const dy of [0, DY]) {
  rect(1178, 72 + dy, 110, 168, BLOCK, 3);
  rect(1293, 72 + dy, 206, 168, BLOCK, 3);
  rect(2226, 72 + dy, 249, 168, BLOCK, 3);
  rect(2481, 72 + dy, 189, 168, BLOCK, 3);
  for (const [x, n] of [
    [1188, '1'],
    [1303, '2'],
    [2236, '1'],
    [2491, '2'],
  ] as const) {
    decor.push({
      t: 'rect',
      x: x - 6,
      y: 78 + dy,
      w: 14,
      h: 14,
      r: 1,
      fill: 'none',
      stroke: BLOCK_INK,
      sw: 1.2,
    });
    text(x + 1, 85 + dy, n, 9.5, { fill: BLOCK_INK, weight: 700 });
  }
}
// the row headers between the two layers
header(440, 715, 248, 'LFO 1');
header(722, 1170, 248, 'DDS MODULATOR');
header(1178, 1500, 248, 'OSCILLATORS');
header(1505, 1575, 248, 'MIXER', 11);
header(1585, 2010, 248, 'VCF');
header(2018, 2215, 248, 'VCA');
header(2226, 2670, 248, 'ENVELOPES');
header(2685, 2760, 248, 'DLY', 11);
header(335, 435, 248, 'LOWER', 11);

// ── Master volume, and the lower layer's detune ───────────────────────────
knob('out.volume', 380, 150, 24, '#3a3b3e', {
  module: 'out',
  name: 'MASTER VOLUME',
  help: 'The overall volume of both layers, to the outputs and the headphones. On the hardware it is the one setting not stored with a sound.',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  fmt: pct,
});
text(380, 192, 'MASTER VOLUME', 9.5);
knob('perf.lowerDetune', 383, 340, 24, CAP.lo, {
  module: 'osc',
  name: 'DETUNE (lower layer)',
  help: 'Tunes the lower layer against the upper by up to 7 semitones either way: a touch for a thicker DUAL sound, or a whole interval. It acts on the lower layer only.',
  kind: 'cont',
  min: -7,
  max: 7,
  def: 0,
  step: 0.01,
  fmt: signedSemi,
  show: shiftOff,
});
knob('perf.detune', 383, 340, 24, CAP.lo, {
  module: 'osc',
  name: 'PERF DETUNE',
  help: 'SHIFT + DETUNE: tunes the whole performance, both layers, by up to 7 semitones either way, for example to bring a cross-modulated sound back in tune.',
  kind: 'cont',
  min: -7,
  max: 7,
  def: 0,
  step: 0.01,
  fmt: signedSemi,
  show: shiftOn,
});
text(383, 382, 'DETUNE', 9.5);
plate(383, 396, 'PERF DETUNE');

// ── The two layer rows ────────────────────────────────────────────────────
const DDS1_WAVES: ControlOption[] = [
  { v: 'sine', label: '' },
  { v: 'saw', label: '' },
  { v: 'square', label: '' },
  { v: 'tri', label: '' },
  { v: 'noise', label: '' },
  { v: 'alt', label: '' },
];
const DDS2_WAVES: ControlOption[] = [
  { v: 'sine', label: '' },
  { v: 'saw', label: '' },
  { v: 'square', label: '' },
  { v: 'tri', label: '' },
  { v: 'noise', label: '' },
  { v: 'pulse', label: '' },
];
const FEET = ['64', '32', '16', '8', '4', '2'];
const FEET_SEMI: Record<string, number> = {
  '64': -36,
  '32': -24,
  '16': -12,
  '8': 0,
  '4': 12,
  '2': 24,
};
const LFO1_WAVES: ControlOption[] = [
  { v: 'tri', label: '' },
  { v: 'rsaw', label: '' },
  { v: 'sh', label: '' },
  { v: 'sq', label: '' },
  { v: 'hf', label: '' },
  { v: 'hftrk', label: '' },
];
const THREE = (top: string, mid: string, bottom: string, labels: [string, string, string]) => [
  { v: top, label: labels[0] },
  { v: mid, label: labels[1] },
  { v: bottom, label: labels[2] },
];
/** Prints a toggle's three positions to its right. */
const positions = (x: number, y: number, words: [string, string, string], ink = INK): void => {
  words.forEach((w, i) => text(x + 16, y - 16 + i * 16, w, 7.5, { fill: ink, anchor: 'start' }));
};

function layerRow(s: Side): void {
  const dy = s === 'up' ? 0 : DY;
  const L = s === 'up' ? 'UPPER' : 'LOWER';
  const cap = CAP[s];
  const id = (k: string): string => `${s}.${k}`;
  const nm = (k: string): string => `${L} ${k}`;
  const y = 148 + dy;

  // LFO 1
  led(453, 82 + dy, 'lfo');
  fader(
    id('lfoRate'),
    492,
    y,
    cap,
    {
      module: 'lfo',
      name: nm('LFO 1 RATE'),
      help: 'The speed of this layer’s LFO 1: 0.03–50 Hz, or 20 Hz–20 kHz when WAVEFORM is on HF or HF TRK, fast enough to be a third oscillator or to modulate at audio rate.',
      def: 5,
      fmt: (v) => fmtHz(lfoHz(v, false)),
    },
    'RATE'
  );
  fader(
    id('lfoDelay'),
    534,
    y,
    cap,
    {
      module: 'lfo',
      name: nm('LFO 1 DELAY'),
      help: 'How long after each key LFO 1 waits before it fades in, up to 10 s: vibrato that arrives only on held notes.',
      fmt: (v) => fmtTime(lfoDelay(v)),
    },
    'DELAY'
  );
  fader(
    id('lfoPhase'),
    575,
    y,
    cap,
    {
      module: 'lfo',
      name: nm('LFO 1 LR PHASE / SPREAD'),
      help: `In binaural mode, the phase of LFO 1 between the left and right voice of each stereo pair, so modulation swings across the stereo field; with BINAURAL off it spreads the voices across the stereo field. ${NOT_HERE} Each layer is one mono voice here.`,
      ui: true,
      fmt: pct,
    },
    'LR PHASE'
  );
  plate(575, 226 + dy, 'SPREAD');
  knob(id('lfoWave'), 640, 125 + dy, 19, cap, {
    module: 'lfo',
    name: nm('LFO 1 WAVEFORM'),
    help: 'LFO 1’s shape: triangle, reverse sawtooth, sample and hold or square, or HF for a sine at 20 Hz–20 kHz, or HF TRK, the same following the keyboard so it can be tuned against the oscillators.',
    kind: 'enum',
    options: LFO1_WAVES,
    def: 'tri',
  });
  ring(640, 125 + dy, 19, ['tri', 'rsaw', 'S/H', 'sq', 'HF', 'HF TRK'], INK);
  toggle(
    id('lfoMode'),
    643,
    190 + dy,
    THREE('reset', 'once', 'free', ['RESET', 'ONCE', 'FREE']),
    'free',
    {
      module: 'lfo',
      name: nm('LFO 1 MODE'),
      help: 'FREE runs LFO 1 on its own; RESET starts its wave again on every key; ONCE runs one cycle per key, like a simple envelope (here it restarts as RESET does). In the HF modes the switch reads NORM, DDS 1 and DDS 2 and can add LFO 1 to an oscillator’s sound, which is not modelled here.',
    }
  );
  positions(660, 190 + dy, ['RESET  DDS 2', 'ONCE  DDS 1', 'FREE  NORM']);
  text(643, 226 + dy, 'MODE', 10.5);

  // DDS modulator
  fader(
    id('modLfo'),
    752,
    y,
    cap,
    {
      module: 'mod',
      name: nm('DDS MOD LFO 1'),
      help: 'How far LFO 1 moves the pitch of the oscillators the switch beside it picks: a little for vibrato, more for sirens and trills.',
      fmt: pct,
    },
    'LFO 1'
  );
  fader(
    id('modEnv'),
    795,
    y,
    cap,
    {
      module: 'mod',
      name: nm('DDS MOD ENV 1'),
      help: 'How far envelope 1 sweeps the pitch of the oscillators the switch picks, up to two octaves: a pitch drop on drums, or a sweep through a synced DDS 2.',
      fmt: pct,
    },
    'ENV 1'
  );
  toggle(
    id('modDest'),
    846,
    150 + dy,
    THREE('dds2', 'both', 'dds1', ['DDS 2', '1 + 2', 'DDS 1']),
    'dds1',
    {
      module: 'mod',
      name: nm('DDS MOD destination'),
      help: 'Which oscillator the DDS MOD LFO 1 and ENV 1 faders move: DDS 1, both, or DDS 2 (the one to pick for a sync sweep).',
    }
  );
  positions(860, 150 + dy, ['DDS 2', '1+2', 'DDS 1']);
  toggle(id('super'), 907, 148 + dy, THREE('on', 'half', 'off', ['ON', '1/2', 'OFF']), 'off', {
    module: 'osc',
    name: nm('SUPER (DDS 1)'),
    help: 'Super mode: DDS 1’s sister oscillators join its centre one, spread in pitch by PW/DETUNE, for a thick “super” wave from one oscillator. 1/2 spreads them half as far (and on the hardware restarts their waves on each key); OFF leaves the centre oscillator alone.',
  });
  positions(921, 148 + dy, ['ON', '1/2', 'OFF']);
  fader(
    id('pwDetune'),
    967,
    y,
    GREY_CAP,
    {
      module: 'osc',
      name: nm('PW / DETUNE'),
      help: 'The pulse width of DDS 2’s pulse wave, from square to a thin pulse; with SUPER on, also how far DDS 1’s sister oscillators are spread from its centre one.',
      def: 0,
      fmt: pct,
      show: shiftOff,
    },
    'PW'
  );
  fader(id('drift'), 967, y, GREY_CAP, {
    module: 'osc',
    name: nm('DRIFT'),
    help: 'SHIFT + PW/DETUNE: a slow random wander of the voices’ pitch, from a gentle analogue unsteadiness to wild detuning. On the hardware it also nudges the filters and envelopes.',
    fmt: pct,
    show: shiftOn,
  });
  plate(967, 226 + dy, 'DRIFT');
  fader(
    id('pwWave'),
    1010,
    y,
    cap,
    {
      module: 'osc',
      name: nm('PW / WAVE'),
      help: 'Wave modulation. At MANUAL it morphs DDS 1 from its waveform towards the next one along (A at the bottom, B at the top) and narrows DDS 2’s pulse; at LFO 1 or ENV 1 it is how far that source sweeps DDS 2’s pulse width.',
      fmt: pct,
    },
    'PW'
  );
  toggle(
    id('pwSrc'),
    1058,
    150 + dy,
    THREE('env1', 'lfo1', 'manual', ['ENV 1', 'LFO 1', 'MANUAL']),
    'manual',
    {
      module: 'mod',
      name: nm('PW / WAVE source'),
      help: 'What moves PW/WAVE: your hand (MANUAL), LFO 1 or envelope 1. With LFO 1 or ENV 1 the hardware sweeps DDS 1’s wave morph too; here only DDS 2’s pulse width moves.',
    }
  );
  positions(1072, 150 + dy, ['ENV 1', 'LFO 1', 'MANUAL']);
  fader(
    id('xmod'),
    1133,
    y,
    GREY_CAP,
    {
      module: 'mod',
      name: nm('CROSS MOD'),
      help: 'Frequency modulation between the oscillators: DDS 2 modulates DDS 1 for bells and clangs. With SYNC on it is reversed, DDS 1 modulating the synced DDS 2, which reshapes its wave rather than its pitch.',
      fmt: pct,
    },
    'CROSS MOD'
  );
  plate(1133, 226 + dy, 'RING MOD');

  // oscillators
  knob(id('dds1Wave'), 1232, 120 + dy, 19, cap, {
    module: 'osc',
    name: nm('DDS 1 WAVEFORM'),
    help: 'DDS 1’s wave: sine, sawtooth, square, triangle, white noise, or (rightmost) the alternative waves, which play a sawtooth here.',
    kind: 'enum',
    options: DDS1_WAVES,
    def: 'saw',
  });
  ring(1232, 120 + dy, 19, ['sine', 'saw', 'sq', 'tri', 'noise', 'ALT'], BLOCK_INK);
  knob(id('dds1Range'), 1232, 205 + dy, 19, cap, {
    module: 'osc',
    name: nm('DDS 1 RANGE'),
    help: 'DDS 1’s octave, in organ footages from 64′ (three octaves down) to 2′ (two up); 8′ is the written pitch.',
    kind: 'enum',
    options: FEET.map((f) => ({ v: f, label: '' })),
    def: '8',
  });
  ring(1232, 205 + dy, 19, FEET, BLOCK_INK);
  knob(id('dds2Wave'), 1347, 120 + dy, 19, cap, {
    module: 'osc',
    name: nm('DDS 2 WAVEFORM'),
    help: 'DDS 2’s wave: sine, sawtooth, square, triangle, white noise or a pulse whose width PW/DETUNE sets.',
    kind: 'enum',
    options: DDS2_WAVES,
    def: 'saw',
  });
  ring(1347, 120 + dy, 19, ['sine', 'saw', 'sq', 'tri', 'noise', 'pulse'], BLOCK_INK);
  knob(id('dds2Range'), 1347, 205 + dy, 19, cap, {
    module: 'osc',
    name: nm('DDS 2 RANGE'),
    help: 'DDS 2’s octave, 32′ to 2′. Turned fully left to LFO it leaves the sound and becomes a slow modulator, about 0.1–100 Hz set by TUNE, and the mode switch then adds a sub-oscillator.',
    kind: 'enum',
    options: ['lfo', ...FEET.slice(1)].map((f) => ({ v: f, label: '' })),
    def: '8',
  });
  ring(1347, 205 + dy, 19, ['LFO', ...FEET.slice(1)], BLOCK_INK);
  knob(id('dds2Tune'), 1447, 122 + dy, 21, cap, {
    module: 'osc',
    name: nm('DDS 2 TUNE'),
    help: 'Tunes DDS 2 against DDS 1 by up to 7 semitones either way: a slight detune for a beating, thicker sound, or a fourth or fifth. At LFO range it sets DDS 2’s speed.',
    kind: 'cont',
    min: -7,
    max: 7,
    def: 0,
    step: 0.01,
    fmt: signedSemi,
    scale: { nums: [-7, -4, 0, 4, 7], numR: 1.75, size: 8 },
  });
  text(1447, 170 + dy, 'TUNE', 10, { fill: BLOCK_INK });
  toggle(
    id('dds2Mode'),
    1443,
    205 + dy,
    THREE('sync', 'ring', 'norm', ['SYNC', 'RING', 'NORM']),
    'norm',
    {
      module: 'osc',
      name: nm('DDS 2 MODE / SUB OSC'),
      help: 'NORM plays DDS 2 as it is; RING replaces it with DDS 1 × DDS 2, a ring-modulated clang; SYNC restarts DDS 2 with every cycle of DDS 1 for the hard-sync tear. At LFO range the same switch picks the sub-oscillator an octave below DDS 1: none, a square (middle) or a sine (top), heard through MIX.',
    }
  );
  positions(1457, 205 + dy, ['SYNC', 'RING', 'NORM'], BLOCK_INK);
  text(1400, 232 + dy, 'SUB OSC', 7.5, { fill: BLOCK_INK });

  // mixer
  knob(id('mix'), 1532, 140 + dy, 22, cap, {
    module: 'mixer',
    name: nm('MIX'),
    help: 'The balance between DDS 1 (left) and DDS 2 (right), or the ring modulator or the sub-oscillator when one has DDS 2’s place; even at 12 o’clock. On the hardware SHIFT + MIX pans the layer, which is not modelled here.',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    fmt: (v) => `${Math.round(100 - v * 10)} : ${Math.round(v * 10)}`,
  });
  text(1532, 186 + dy, 'MIX', 10.5);
  plate(1532, 200 + dy, 'PAN');

  // VCF
  toggle(id('drive'), 1611, 150 + dy, THREE('2', '1', 'off', ['2', '1', 'OFF']), 'off', {
    module: 'filter',
    name: nm('DRIVE'),
    help: 'Overdrives the low-pass filter: OFF clean, 1 a little saturation, 2 a healthy dose of grit.',
  });
  positions(1625, 150 + dy, ['2', '1', 'OFF']);
  text(1611, 186 + dy, 'DRIVE', 10.5);
  fader(
    id('hpf'),
    1670,
    y,
    cap,
    {
      module: 'filter',
      name: nm('HPF'),
      help: 'The cutoff of the gentle 6 dB high-pass filter before the low-pass: raise it to thin out the bass, for a lighter pad or a clearer mix.',
      fmt: (v) => fmtHz(hpfHz(v)),
    },
    'HPF'
  );
  fader(
    id('lpf'),
    1745,
    y,
    GREY_CAP,
    {
      module: 'filter',
      name: nm('LPF'),
      help: 'The cutoff of the 24 dB low-pass filter: lower is darker and rounder, higher brighter. The envelope, LFO 1 and DDS 2 faders beside it move it from here.',
      def: 8,
      fmt: (v) => fmtHz(lpfHz(v)),
    },
    'LPF'
  );
  fader(
    id('res'),
    1785,
    y,
    cap,
    {
      module: 'filter',
      name: nm('RES'),
      help: 'Resonance: a ringing peak at the cutoff. At the top the filter whistles on its own, a sine you can play with KEYTRACK on.',
      fmt: pct,
    },
    'RES'
  );
  toggle(
    id('vcfSrc'),
    1838,
    115 + dy,
    THREE('env2', 'both', 'env1', ['ENV 2', '1 + 2', 'ENV 1']),
    'env1',
    {
      module: 'filter',
      name: nm('VCF envelope source'),
      help: 'Which envelope the VCF ENV fader sends to the cutoff: envelope 1, envelope 2, or both added together.',
    }
  );
  positions(1852, 115 + dy, ['ENV 2', '1+2', 'ENV 1']);
  toggle(id('vcfKey'), 1838, 185 + dy, THREE('on', 'half', 'off', ['ON', '1/2', 'OFF']), 'half', {
    module: 'filter',
    name: nm('VCF KEYTRACK'),
    help: 'How far the cutoff follows the keys: OFF not at all, 1/2 half as fast (higher notes a little brighter, like an acoustic instrument), ON exactly, so a whistling filter plays in tune.',
  });
  positions(1852, 185 + dy, ['ON', '1/2', 'OFF']);
  text(1838, 226 + dy, 'KEYTRACK', 10.5);
  fader(
    id('vcfEnv'),
    1900,
    y,
    cap,
    {
      module: 'filter',
      name: nm('VCF ENV'),
      help: 'How far the envelope picked by the switch sweeps the cutoff up from LPF: the “wow” at the start of a brass note or the pluck of a bass.',
      fmt: pct,
    },
    'ENV'
  );
  fader(
    id('vcfLfo'),
    1943,
    y,
    cap,
    {
      module: 'filter',
      name: nm('VCF LFO 1'),
      help: 'How far LFO 1 moves the cutoff: a slow sweep, a wah or a growl, depending on its speed and shape.',
      fmt: pct,
    },
    'LFO 1'
  );
  fader(
    id('vcfDds2'),
    1983,
    y,
    cap,
    {
      module: 'filter',
      name: nm('VCF DDS 2'),
      help: 'How far DDS 2 moves the cutoff: slowly as an LFO, or at audio rate for gritty, metallic tones.',
      fmt: pct,
    },
    'DDS 2'
  );

  // VCA
  toggle(id('dyn'), 2040, 113 + dy, THREE('on', 'half', 'off', ['ON', '1/2', 'OFF']), 'off', {
    module: 'amp',
    name: nm('DYNAMICS'),
    help: 'How much playing harder makes the sound louder and brighter: OFF not at all, 1/2 subtly, ON fully, like a plucked string. Here 1/2 is as strong as ON on the level, and half on the brightness.',
  });
  positions(2054, 113 + dy, ['ON', '1/2', 'OFF']);
  text(2040, 146 + dy, 'DYNAMICS', 8);
  toggle(
    id('vcaMode'),
    2040,
    185 + dy,
    THREE('fixed2', 'fixed1', 'env2', ['FIXED 2', 'FIXED 1', 'ENV 2']),
    'env2',
    {
      module: 'amp',
      name: nm('VCA envelope'),
      help: 'What shapes the loudness: envelope 2 (bottom), a fixed gate that is simply on while the key is held (middle), or the same with a short fade after the key is let go (top). The fixed ones leave envelope 2 free for the filter.',
    }
  );
  positions(2054, 185 + dy, ['FIX 2', 'FIX 1', 'ENV 2']);
  fader(
    id('vcaEnv'),
    2110,
    y,
    GREY_CAP,
    {
      module: 'amp',
      name: nm('VCA ENV LEVEL'),
      help: 'How loud the envelope picked by the switch opens the VCA: in effect the layer’s volume, so set the two layers’ balance here.',
      def: 8,
      fmt: pct,
    },
    'ENV LEVEL'
  );
  fader(
    id('vcaLfo'),
    2152,
    y,
    cap,
    {
      module: 'amp',
      name: nm('VCA LFO 1'),
      help: 'How far LFO 1 moves the volume: a tremolo, smooth on the triangle and choppy on the square.',
      fmt: pct,
    },
    'LFO 1'
  );
  fader(
    id('vcaDds2'),
    2192,
    y,
    cap,
    {
      module: 'amp',
      name: nm('VCA DDS 2'),
      help: 'How far DDS 2 moves the volume: a pulse when it is an LFO, amplitude modulation and new partials when it is in audio range.',
      fmt: pct,
    },
    'DDS 2'
  );

  // ENV 1
  toggle(id('env1Key'), 2255, 125 + dy, THREE('on', 'half', 'off', ['ON', '1/2', 'OFF']), 'off', {
    module: 'env',
    name: nm('ENV 1 KEYTRACK'),
    help: 'Shortens envelope 1’s decay and release on higher notes, as a plucked string dies faster high up: OFF, 1/2 or ON.',
  });
  positions(2266, 125 + dy, ['ON', '1/2', 'OFF'], BLOCK_INK);
  toggle(
    id('env1Mode'),
    2255,
    185 + dy,
    THREE('loop', 'inv', 'norm', ['LOOP', 'INVERTED', 'NORMAL']),
    'norm',
    {
      module: 'env',
      name: nm('ENV 1 MODE'),
      help: 'NORMAL; inverted (middle), which turns the envelope upside down so it pulls the cutoff and pitch down instead of up; or LOOP (top), which repeats attack and decay while the key is held, an LFO that starts with each note.',
    }
  );
  led(2292, 207 + dy, { id: id('env1Mode'), eq: 'loop' });
  text(2268, 166 + dy, 'LOOP', 7.5, { fill: BLOCK_INK, anchor: 'start' });
  const ENV_X = [2324, 2364, 2404, 2444];
  const ENV2_X = [2516, 2556, 2597, 2637];
  const stage = (
    k: string,
    x: number,
    printed: string,
    name: string,
    help: string,
    rest: Partial<FaderRest> = {}
  ): void =>
    fader(
      id(k),
      x,
      y,
      cap,
      { module: 'env', name: nm(name), help, fmt: (v) => fmtTime(envTime(v)), ...rest },
      printed,
      BLOCK_INK
    );
  const sustain = { fmt: pct };
  stage(
    'e1a',
    ENV_X[0],
    'A',
    'ENV 1 ATTACK',
    'How long envelope 1 takes to rise to its peak after a key, 1 ms to 10 s.',
    {
      show: shiftOff,
    }
  );
  stage(
    'e1ah',
    ENV_X[0],
    '',
    'ENV 1 ATTACK HOLD',
    'SHIFT + A: how long envelope 1 waits after a key before it starts to rise, up to 10 s; at the bottom, not at all.',
    {
      show: shiftOn,
      fmt: (v) => fmtTime(holdTime(v)),
    }
  );
  stage(
    'e1d',
    ENV_X[1],
    'D',
    'ENV 1 DECAY',
    'How long envelope 1 takes to fall from its peak to the sustain level, 1 ms to 10 s.',
    {
      def: 5,
      show: shiftOff,
    }
  );
  stage(
    'e1dh',
    ENV_X[1],
    '',
    'ENV 1 DECAY HOLD',
    'SHIFT + D: how long envelope 1 stays at its peak before the decay begins, up to 10 s; at the bottom, not at all.',
    {
      show: shiftOn,
      fmt: (v) => fmtTime(holdTime(v)),
    }
  );
  stage(
    'e1s',
    ENV_X[2],
    'S',
    'ENV 1 SUSTAIN',
    'The level envelope 1 holds at while the key is down. In LOOP it is the level each repeat falls back to.',
    {
      def: 5,
      ...sustain,
    }
  );
  stage(
    'e1r',
    ENV_X[3],
    'R',
    'ENV 1 RELEASE',
    'How long envelope 1 takes to fall away after the key is let go, 1 ms to 10 s.',
    {
      def: 4,
    }
  );
  plate(ENV_X[0], 226 + dy, 'AH', 30);
  plate(ENV_X[1], 226 + dy, 'DH', 30);
  // ENV 2
  stage(
    'e2a',
    ENV2_X[0],
    'A',
    'ENV 2 ATTACK',
    'How long envelope 2 (normally the loudness) takes to rise after a key: a click at the bottom, a slow swell at the top.'
  );
  stage(
    'e2d',
    ENV2_X[1],
    'D',
    'ENV 2 DECAY',
    'How long envelope 2 takes to fall from its peak to the sustain level.',
    {
      def: 5,
      show: shiftOff,
    }
  );
  stage(
    'e2dh',
    ENV2_X[1],
    '',
    'ENV 2 DECAY HOLD',
    'SHIFT + D: how long envelope 2 stays at its peak before the decay begins, up to 10 s; at the bottom, not at all.',
    {
      show: shiftOn,
      fmt: (v) => fmtTime(holdTime(v)),
    }
  );
  stage(
    'e2s',
    ENV2_X[2],
    'S',
    'ENV 2 SUSTAIN',
    'The level envelope 2 holds while the key is down: at the top the note stays at full volume.',
    {
      def: 10,
      ...sustain,
    }
  );
  stage(
    'e2r',
    ENV2_X[3],
    'R',
    'ENV 2 RELEASE',
    'How long the sound takes to die away after the key is let go.',
    { def: 3.5 }
  );
  plate(ENV2_X[1], 226 + dy, 'DH', 30);

  // delay send
  fader(
    id('send'),
    2712,
    y,
    cap,
    {
      module: 'fx',
      name: nm('DELAY SEND'),
      help: 'How much of this layer goes into the delay; TIME and FEEDBACK in the strip below set the echoes. Here the two layers share one delay, which takes the larger SEND of the layers that sound.',
      fmt: pct,
    },
    'SEND'
  );
}
layerRow('up');
layerRow('lo');

// ── The shared strip ──────────────────────────────────────────────────────
decor.push({
  t: 'rect',
  x: 40,
  y: 462,
  w: 2708,
  h: 148,
  r: 6,
  fill: 'none',
  stroke: '#b9b8b3',
  sw: 1.5,
});
const SY = 548;
// MANUAL and INIT PATCH: program memory, not modelled
for (const [x, n] of [
  [90, 'MANUAL\nLOWER'],
  [137, 'MANUAL\nUPPER'],
] as const) {
  button(
    `ui.manual${x}`,
    x,
    SY,
    {
      module: 'mode',
      name: n.replace('\n', ' '),
      ui: true,
      help: `Plays the layer as the panel is set, rather than its stored patch; SHIFT + MANUAL loads the init patch. ${NOT_HERE} The panel is always live here, and the library keeps sounds.`,
    },
    x === 90
  );
  text(x, 498, n.split('\n')[0], 8.5);
  text(x, 509, n.split('\n')[1], 8.5);
}
plate(113, 583, 'INIT PATCH', 90);
knob('arp.tempo', 219, SY, 22, '#3a3b3e', {
  module: 'mode',
  name: 'TEMPO',
  help: 'The speed of the arpeggiator, 30–300 BPM. On the hardware it also clocks the sequencer and any synced LFO or delay.',
  kind: 'cont',
  min: 30,
  max: 300,
  def: 120,
  step: 1,
  fmt: (v) => `${tempoOf(v)} BPM`,
});
text(219, 508, 'TEMPO', 9.5);
led(250, 529);
header(280, 400, 480, 'HOLD');
button(
  'hold.lower',
  315,
  SY,
  {
    module: 'mode',
    name: 'HOLD LOWER',
    help: 'Holds the lower layer’s notes after the keys are let go, and latches its arpeggio. Here HOLD latches the arpeggiator; without it, notes are not sustained.',
  },
  true
);
button('hold.upper', 362, SY, {
  module: 'mode',
  name: 'HOLD UPPER',
  help: 'Holds the upper layer’s notes after the keys are let go, and latches its arpeggio. Here HOLD latches the arpeggiator; without it, notes are not sustained.',
});
text(315, 508, 'LOWER', 9);
text(362, 508, 'UPPER', 9);
header(405, 572, 480, 'KEYBOARD');
controls.push({
  id: 'kbd.mode',
  type: 'select',
  x: 488,
  y: SY,
  w: 34,
  h: 46,
  lamp: 'red',
  module: 'mode',
  name: 'KEYBOARD',
  label: 'KEYBOARD',
  labelPos: 'none',
  help: 'How the two layers share the keys: SINGLE plays the layer LAYER picks across the whole keyboard; DUAL stacks both on every key; SPLIT puts the lower layer below C4 and the upper from C4 up. On the hardware hold SPLIT and play a key to move the split; here it stays at C4.',
  kind: 'enum',
  def: 'single',
  options: [
    { v: 'single', label: 'SINGLE', x: 442, y: SY, capColor: '#f1f1ee' },
    { v: 'dual', label: 'DUAL', x: 488, y: SY, capColor: '#3a3b3e' },
    { v: 'split', label: 'SPLIT', x: 535, y: SY, capColor: '#3a3b3e' },
  ],
});
text(442, 508, 'SINGLE', 9);
text(488, 508, 'DUAL', 9);
text(535, 508, 'SPLIT', 9);
text(535, 583, '(NOTE)', 8.5);
rect(576, 462, 137, 148, BLOCK, 5);
text(644, 480, 'LAYER', 13, { fill: BLOCK_INK, weight: 700 });
controls.push({
  id: 'layer.select',
  type: 'select',
  x: 638,
  y: SY,
  w: 34,
  h: 46,
  lamp: 'red',
  module: 'mode',
  name: 'LAYER',
  label: 'LAYER',
  labelPos: 'none',
  help: 'Picks the layer SINGLE plays. On the hardware it also picks which layer the shared strip (voice assign, arpeggiator, matrix, waves, chorus, delay) is setting; here those settings serve both layers.',
  kind: 'enum',
  def: 'upper',
  options: [
    { v: 'lower', label: 'LOWER', x: 615, y: SY, capColor: '#3a3b3e' },
    { v: 'upper', label: 'UPPER', x: 661, y: SY, capColor: '#f1f1ee' },
  ],
});
text(615, 508, 'LOWER', 9, { fill: BLOCK_INK });
text(661, 508, 'UPPER', 9, { fill: BLOCK_INK });
header(718, 905, 480, 'VOICE ASSIGN');
const VOICE_MODES: ControlOption[] = [
  { v: 'solo', label: 'SOLO' },
  { v: 'legato', label: 'LEGATO' },
  { v: 'poly1', label: 'POLY 1' },
  { v: 'poly2', label: 'POLY 2' },
];
button('voice.mode', 742, SY, {
  module: 'mode',
  name: 'VOICE ASSIGN MODE',
  help: 'SOLO plays one note at a time, restarting the envelopes on each; LEGATO the same, but notes played while one is held slide on without restarting them; POLY 1 and POLY 2 play chords (on the hardware POLY 2 cuts a stolen note’s release short; here they are the same).',
  kind: 'enum',
  options: VOICE_MODES,
  def: 'poly1',
});
VOICE_MODES.forEach((m, i) => {
  led(770, 530 + i * 12.5, { id: 'voice.mode', eq: m.v });
  text(780, 530 + i * 12.5, m.label, 7, { anchor: 'start' });
});
text(742, 508, 'MODE', 9);
plate(742, 583, 'U. SIZE', 44);
button('voice.unison', 827, SY, {
  module: 'mode',
  name: 'UNISON',
  help: 'Stacks several voices, slightly detuned, on every note for a huge sound: all of them in SOLO and LEGATO, two to a note in the poly modes here (the hardware shares them out among the keys held).',
});
text(827, 508, 'UNISON', 9);
button('voice.binaural', 872, SY, {
  module: 'mode',
  name: 'BINAURAL',
  help: 'On the hardware, pairs the voices into stereo “super voices”, each side a complete voice, which halves the number of notes. Here it halves the notes too, but each voice is mono.',
  def: true,
});
plate(872, 508, 'BINAURAL', 56);
// arpeggiator
header(915, 1450, 480, 'ARPEGGIATOR / SEQUENCER');
button('arp.on', 953, SY, {
  module: 'mode',
  name: 'ARP ON',
  help: 'Turns the arpeggiator on: held notes play one after another at the TEMPO and CLK DIV, in the order MODE sets. With MODE on SEQ the hardware plays its sequencer instead, which the app’s sequencer under the panel stands in for.',
});
text(953, 508, 'ON', 9);
const DIVS: { v: string; beats: number }[] = [
  { v: '1/1', beats: 4 },
  { v: '1/2', beats: 2 },
  { v: '1/4', beats: 1 },
  { v: '1/8', beats: 0.5 },
  { v: '1/16', beats: 0.25 },
  { v: '1/32', beats: 0.125 },
  { v: '1/4T', beats: 2 / 3 },
  { v: '1/8T', beats: 1 / 3 },
];
knob('arp.div', 1023, SY, 22, '#f1f1ee', {
  module: 'mode',
  name: 'CLK DIV',
  help: 'The note value of each arpeggio step against TEMPO: whole notes to 32nds, or quarter- and eighth-note triplets.',
  kind: 'enum',
  options: DIVS.map((d) => ({ v: d.v, label: '' })),
  def: '1/16',
});
ring(
  1023,
  SY,
  22,
  DIVS.map((d) => d.v),
  INK,
  270
);
text(1023, 592, 'CLK DIV', 9);
button('ui.sync', 1117, SY, {
  module: 'mode',
  name: 'SYNC',
  ui: true,
  help: `Locks LFO 1’s RATE and the delay’s TIME to the tempo, so both are set in note values. ${NOT_HERE} They run free.`,
});
text(1117, 508, 'SYNC', 9);
plate(1117, 583, 'EXT CLK', 44);
const RANGES: ControlOption[] = ['1', '2', '3', '4'].map((v) => ({ v, label: v }));
button('arp.range', 1163, SY, {
  module: 'mode',
  name: 'ARP RANGE',
  help: 'How many octaves the arpeggio climbs through, 1 to 4.',
  kind: 'enum',
  options: RANGES,
  def: '1',
});
RANGES.forEach((r, i) => led(1190, 568 - i * 13, { id: 'arp.range', eq: r.v }));
text(1163, 508, 'RANGE', 9);
plate(1163, 583, 'SWING', 40);
const ARP_MODES: ControlOption[] = [
  { v: 'up', label: 'UP' },
  { v: 'down', label: 'DOWN' },
  { v: 'updown', label: 'U&D' },
  { v: 'random', label: 'RANDOM' },
  { v: 'seq', label: 'SEQ' },
];
button(
  'arp.mode',
  1230,
  SY,
  {
    module: 'mode',
    name: 'ARP MODE',
    help: 'The arpeggio’s order: UP, DOWN, up and down (U&D) or RANDOM. SEQ picks the hardware’s 64-step sequencer, not modelled here, so the arpeggiator stops.',
    kind: 'enum',
    options: ARP_MODES,
    def: 'up',
  },
  true
);
ARP_MODES.forEach((m, i) => {
  led(1258, 523 + i * 12.5, { id: 'arp.mode', eq: m.v });
  text(1268, 523 + i * 12.5, m.label, 7, { anchor: 'start' });
});
text(1230, 508, 'MODE', 9);
plate(1230, 583, 'LOAD', 36);
button('ui.seqRec', 1317, SY, {
  module: 'mode',
  name: 'SEQ REC',
  ui: true,
  help: `Records the hardware sequencer, step by step. ${NOT_HERE} The app’s sequencer under the panel records patterns.`,
});
text(1317, 508, 'SEQ REC', 9);
plate(1317, 583, 'STORE', 38);
button(
  'ui.track',
  1363,
  SY,
  {
    module: 'mode',
    name: 'TRACK',
    ui: true,
    help: `Steps through the sequencer’s five tracks: STEP, SLIDE, ACCENT, REST and LENGTH. ${NOT_HERE}`,
  },
  true
);
text(1363, 508, 'TRACK', 9);
['STEP', 'SLIDE', 'ACCENT', 'REST', 'LENGTH'].forEach((t, i) => {
  led(1388, 523 + i * 12.5);
  text(1398, 523 + i * 12.5, t, 7, { anchor: 'start' });
});
line(1454, 470, 1454, 600, 1.2, '#b9b8b3');
// the modulation matrix and memory
rect(1462, 474, 975, 13, BLOCK, 1);
text(1520, 480, 'MOD AMOUNT', 9, { fill: BLOCK_INK, weight: 700 });
knob('ui.modAmount', 1500, SY, 24, '#f1f1ee', {
  module: 'mod',
  name: 'MOD AMOUNT',
  ui: true,
  help: `Sets the depth, −100 % to +100 %, of the mod matrix connection being made. ${NOT_HERE} The matrix is left empty.`,
  kind: 'cont',
  min: -100,
  max: 100,
  def: 0,
  step: 1,
  fmt: (v) => `${Math.round(v)} %`,
  show: shiftOff,
});
knob('kbd.fine', 1500, SY, 24, '#f1f1ee', {
  module: 'out',
  name: 'FINE ADJ',
  help: 'SHIFT + MOD AMOUNT: fine-tunes the whole instrument by up to 100 cents either way.',
  kind: 'cont',
  min: -100,
  max: 100,
  def: 0,
  step: 1,
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`,
  show: shiftOn,
});
plate(1500, 583, 'FINE ADJ', 50);
button('ui.modAssign', 1575, SY, {
  module: 'mod',
  name: 'MOD ASSIGN',
  ui: true,
  help: `Opens the modulation matrix: buttons 1–8 become the sources (DDS 2, LFO 2, ENV 1, velocity, aftertouch, expression, ribbon, note number) and A–H the destinations, or hold a source and move a fader to send it there. ${NOT_HERE} The matrix is left empty.`,
});
text(1575, 508, 'MOD ASSIGN', 8);
plate(1575, 583, 'CLEAR', 38);
const SRC_X = [1634, 1668, 1703, 1737, 1771, 1805, 1839, 1873];
const DST_X = [1927, 1960, 1993, 2027, 2061, 2094, 2128, 2162];
const SRC = ['DDS 2', 'LFO 2', 'ENV 1', 'VEL', 'AT', 'EXPR', 'RIBN', 'NOTE'];
const DST = ['LFO 1', 'X MOD', 'WAVE', 'MIX', 'HPF', 'RES', 'ENV1-D', 'DLY TIME'];
const SHIFTED = ['MIDI CH', 'TX/RX E', 'TX/RX P', 'DUMP', 'LOCAL', 'TUNE', 'MPE', ''];
const selectButton = (x: number, dark: boolean): void => {
  decor.push({
    t: 'rect',
    x: x - 15,
    y: SY - 22,
    w: 30,
    h: 44,
    r: 3,
    fill: dark ? '#3a3b3e' : '#f4f4f1',
    stroke: '#9c9c98',
    sw: 1,
    hw: true,
  });
  led(x, SY - 10);
};
SRC_X.forEach((x, i) => {
  selectButton(x, false);
  text(x, 495, SRC[i], 7.5);
  text(x, 510, String(i + 1), 8.5);
  text(x, 600, `W${i + 1}`, 7.5, { fill: DIM });
});
DST_X.forEach((x, i) => {
  selectButton(x, true);
  text(x, 495, DST[i], 7.5);
  text(x, 510, 'ABCDEFGH'[i], 8.5);
  if (SHIFTED[i]) plate(x, 583, SHIFTED[i], 32);
  text(x, 600, `W${i + 9}`, 7.5, { fill: DIM });
});
for (const [x, n, t] of [
  [
    2229,
    'PERF',
    'Performance mode: the select buttons pick one of 128 stored performances, both layers and their settings.',
  ],
  [
    2282,
    'PATCH',
    'Patch mode: the select buttons load one of 256 stored patches into the layer LAYER picks.',
  ],
  [
    2390,
    'WAVE',
    'Wave mode: the select buttons load one of the 32 alternative waves into DDS 1’s channel A or B.',
  ],
] as const) {
  button(
    `ui.${n.toLowerCase()}`,
    x,
    SY,
    {
      module: 'mode',
      name: n,
      ui: true,
      help: `${t} ${NOT_HERE} The library keeps sounds, and the alternative waves play a sawtooth.`,
    },
    n === 'PATCH'
  );
  text(x, 508, n === 'WAVE' ? 'A  B' : n, 9);
}
plate(2229, 583, 'A / B', 36);
plate(2282, 583, 'A / B', 36);
button('ui.shift', 2336, SY, {
  module: 'mode',
  name: 'SHIFT',
  ui: true,
  help: 'Shows the second functions printed on the dark plates under the controls: ATTACK HOLD and DECAY HOLD on the envelopes, DRIFT, PERF DETUNE and FINE ADJ. Press again to go back.',
});
plate(2336, 583, 'SHIFT', 38);
// chorus and delay
header(2430, 2560, 480, 'CHORUS');
button('chorus.i', 2470, SY, {
  module: 'fx',
  name: 'CHORUS I',
  help: 'A subtle stereo chorus. With II as well, a third, denser ensemble like an old string machine.',
});
button('chorus.ii', 2523, SY, {
  module: 'fx',
  name: 'CHORUS II',
  help: 'A denser chorus, swept faster. With I as well, a third, denser ensemble like an old string machine.',
});
text(2470, 508, 'I', 9);
text(2523, 508, 'II', 9);
header(2570, 2745, 480, 'DELAY');
knob('dly.time', 2612, SY, 24, '#f1f1ee', {
  module: 'fx',
  name: 'DELAY TIME',
  help: 'The time between echoes, 1 ms to 1 s: short for a doubling or slapback, long for distinct repeats.',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 6,
  fmt: (v) => fmtTime(delayTime(v)),
});
led(2643, 527);
text(2612, 592, 'TIME', 9);
knob('dly.feedback', 2700, SY, 24, '#f1f1ee', {
  module: 'fx',
  name: 'DELAY FEEDBACK',
  help: 'How many times the echoes repeat; fully up, almost without end.',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  fmt: pct,
});
text(2700, 592, 'FEEDBACK', 9);

// ── The performance section, beside the keys ──────────────────────────────
decor.push({
  t: 'rect',
  x: 50,
  y: 632,
  w: 400,
  h: 432,
  r: 6,
  fill: 'none',
  stroke: '#b9b8b3',
  sw: 1.5,
});
const OCT: ControlOption[] = ['-2', '-1', '0', '+1', '+2'].map((v) => ({ v, label: '' }));
controls.push({
  id: 'perf.octave',
  type: 'slide',
  x: 127,
  y: 711,
  w: 96,
  h: 22,
  orient: 'h',
  module: 'osc',
  name: 'OCTAVE',
  label: 'OCTAVE',
  labelPos: 'none',
  help: 'Moves the keyboard up or down by up to two octaves, for the layer or layers the switch beside PORTAMENTO names. On the hardware it springs back; SHIFT + it transposes in semitones, which is not modelled here.',
  kind: 'enum',
  options: OCT,
  def: '0',
});
[101, 125, 150, 173, 198].forEach((x, i) => {
  led(x, 670, { id: 'perf.octave', eq: OCT[i].v });
  text(x, 656, ['-2', '-1', '', '+1', '+2'][i], 7.5);
});
text(150, 646, 'TRANSPOSED', 8);
plate(70, 711, 'ST−', 28);
plate(184, 711, 'ST+', 28);
fader('perf.porta', 300, 697, '#f1f1ee', {
  module: 'glide',
  name: 'PORTAMENTO',
  help: 'Slides each note’s pitch from the last one, up to 10 s an octave, larger leaps taking longer. It acts on the layer or layers the switch beside it names.',
  orient: 'h',
  len: 96,
  fmt: (v) => fmtTime(portaTime(v)),
});
text(300, 727, 'PORTAMENTO', 9);
toggle(
  'perf.portaLayer',
  401,
  697,
  THREE('upper', 'lower', 'both', ['UPPER', 'LOWER', 'BOTH']),
  'both',
  {
    module: 'glide',
    name: 'PORTAMENTO / OCTAVE layer',
    help: 'Which layer PORTAMENTO and OCTAVE act on: the upper, the lower or both. On the hardware each layer keeps its own setting and this picks the one you are setting; here the one setting goes to the layers it names.',
  }
);
positions(415, 697, ['UPPER', 'LOWER', 'BOTH']);
header(55, 380, 768, 'LFO 2');
header(390, 448, 768, 'DEST', 11);
const LFO2_WAVES: ControlOption[] = [
  { v: 'sine', label: '' },
  { v: 'rsaw', label: '' },
  { v: 'sh', label: '' },
  { v: 'sq', label: '' },
  { v: 'saw', label: '' },
  { v: 'shg', label: '' },
];
knob('lfo2.wave', 100, 823, 22, '#f1f1ee', {
  module: 'lfo',
  name: 'LFO 2 WAVEFORM',
  help: 'LFO 2’s shape: sine, reverse sawtooth, sample and hold, square, sawtooth, or sample and glide (random steps that slide into each other).',
  kind: 'enum',
  options: LFO2_WAVES,
  def: 'sine',
});
ring(100, 823, 22, ['sine', 'rsaw', 'S/H', 'sq', 'saw', 'S/G'], INK);
knob('lfo2.rate', 192, 820, 24, '#f1f1ee', {
  module: 'lfo',
  name: 'LFO 2 RATE',
  help: 'LFO 2’s speed, 0.03–50 Hz.',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 6,
  fmt: (v) => fmtHz(lfo2Hz(v)),
});
text(192, 858, 'RATE', 9);
led(221, 797, 'lfo');
knob('lfo2.delay', 270, 820, 24, '#f1f1ee', {
  module: 'lfo',
  name: 'LFO 2 DELAY',
  help: 'How long after each key LFO 2 waits before fading in, up to 5 s.',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  fmt: (v) => fmtTime(lfo2Delay(v)),
});
text(270, 858, 'DELAY', 9);
toggle(
  'perf.oscDest',
  345,
  820,
  THREE('dds2', 'both', 'dds1', ['DDS 2', '1 + 2', 'DDS 1']),
  'both',
  {
    module: 'mod',
    name: 'DEST oscillator',
    help: 'Which oscillator LFO 2’s DDS fader (and the bender, on the hardware) moves: DDS 1, both, or DDS 2.',
  }
);
positions(359, 820, ['DDS 2', '1+2', 'DDS 1']);
toggle(
  'perf.modLayer',
  401,
  820,
  THREE('upper', 'lower', 'both', ['UPPER', 'LOWER', 'BOTH']),
  'both',
  {
    module: 'mod',
    name: 'DEST layer',
    help: 'Which layer LFO 2 (and the bender, on the hardware) acts on: the upper, the lower or both. On the hardware each layer keeps its own settings and this picks the one you are setting; here the one set goes to the layers it names.',
  }
);
positions(415, 820, ['UPPER', 'LOWER', 'BOTH']);
toggle('lfo2.trig', 85, 937, THREE('on', 'at', 'trig', ['ON', 'AT + TRIG', 'TRIG']), 'trig', {
  module: 'lfo',
  name: 'LFO 2 trigger',
  help: 'What brings LFO 2 in. TRIG: pushing the bender up, here the mod wheel. AT + TRIG: the same or key pressure (the app’s keyboard has none). ON: always, at the depths the faders set.',
});
text(85, 904, 'LFO2 ON', 7);
text(85, 915, '(AT→BEND)', 6.5);
text(85, 976, 'TRIG', 7.5);
const PERF_Y = 940;
fader(
  'lfo2.rateMod',
  145,
  PERF_Y,
  GREY_CAP,
  {
    module: 'lfo',
    name: 'LFO 2 RATE (push)',
    help: 'How much pushing the bender up (here the mod wheel) speeds LFO 2 up, as well as bringing it in.',
    fmt: pct,
  },
  'LFO2 RATE'
);
fader(
  'lfo2.dds',
  212,
  PERF_Y,
  '#f1f1ee',
  {
    module: 'lfo',
    name: 'LFO 2 DDS',
    help: 'How far LFO 2 moves the pitch of the oscillators the DEST switch picks: vibrato.',
    fmt: pct,
  },
  'DDS'
);
fader(
  'lfo2.vcf',
  252,
  PERF_Y,
  '#f1f1ee',
  {
    module: 'lfo',
    name: 'LFO 2 VCF',
    help: 'How far LFO 2 moves the low-pass cutoff: a wah.',
    fmt: pct,
  },
  'VCF'
);
fader(
  'lfo2.vca',
  292,
  PERF_Y,
  '#f1f1ee',
  {
    module: 'lfo',
    name: 'LFO 2 VCA',
    help: 'How far LFO 2 moves the volume: tremolo.',
    fmt: pct,
  },
  'VCA'
);
fader(
  'ui.bendDds',
  363,
  PERF_Y,
  '#f1f1ee',
  {
    module: 'mod',
    name: 'BENDER DDS',
    ui: true,
    help: `How far moving the bender left or right bends the pitch, up to an octave. ${NOT_HERE} The app’s keyboard has no pitch bend.`,
    fmt: pct,
  },
  'DDS'
);
fader(
  'ui.bendVcf',
  403,
  PERF_Y,
  '#f1f1ee',
  {
    module: 'mod',
    name: 'BENDER VCF',
    help: `How far moving the bender left or right opens or closes the filter. ${NOT_HERE}`,
    ui: true,
    fmt: pct,
  },
  'VCF'
);
// the bender, the ribbon and the nameplate
decor.push({
  t: 'path',
  d: 'M75 1060 L160 1060 L200 1032 L360 1032 L400 1060 L445 1060',
  w: 1.4,
  fill: 'none',
});
rect(193, 1088, 120, 38, '#161617', 4);
rect(240, 1096, 26, 22, '#3b3c3f', 2);
text(395, 1107, 'AT', 8);
rect(546, 654, 1394, 76, '#58595c', 10);
for (let i = 0; i < 26; i++) {
  const x = 600 + i * 52.5;
  line(x, 664, x, 670, 1.2, '#c8c8c4');
  line(x, 714, x, 720, 1.2, '#c8c8c4');
}
text(580, 692, 'U·D·O', 12, { fill: '#a9aaad', brand: true, spacing: 2 });
text(2290, 692, 'U·D·O', 30, { weight: 700, spacing: 4, brand: true });
// the rule between the logo and the wordmark is part of the maker's lockup
decor.push({ t: 'line', x1: 2340, y1: 668, x2: 2340, y2: 716, w: 1.5, brand: true });
text(2365, 680, 'SUPER GEMINI', 34, { weight: 800, anchor: 'start', spacing: 2, brand: true });
text(2365, 704, '20 VOICE DUAL LAYER POLYPHONIC BINAURAL ANALOG-HYBRID', 9, {
  anchor: 'start',
  brand: true,
});
text(2365, 716, 'SYNTHESIZER WITH SUPER-WAVE TECHNOLOGY', 9, { anchor: 'start', brand: true });
// the top of the keys, for reference only (the keyboard strip under the panel is the one that plays)
{
  const x0 = 470,
    x1 = 2770,
    top = 800,
    kw = (x1 - x0) / 36;
  rect(x0 - 8, top - 6, x1 - x0 + 16, VIEW_H - top + 6, '#1d1d1f', 2);
  for (let i = 0; i < 36; i++)
    decor.push({
      t: 'rect',
      x: x0 + i * kw + 2,
      y: top,
      w: kw - 4,
      h: VIEW_H - top,
      r: 2,
      fill: KEY,
      hw: true,
    });
  // C to C: black keys after C, D, F, G and A of each octave
  const after = [0, 1, 3, 4, 5];
  for (let i = 0; i < 35; i++)
    if (after.includes(i % 7))
      decor.push({
        t: 'rect',
        x: x0 + (i + 1) * kw - 18,
        y: top,
        w: 36,
        h: 210,
        r: 3,
        fill: '#111113',
        hw: true,
      });
}

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'master',
    label: 'Master volume and lower detune',
    module: 'out',
    keywords: 'volume level output detune tuning perf detune',
    rects: [R(330, 60, 436, 440)],
    help: 'MASTER VOLUME sets the overall level. DETUNE tunes the lower layer against the upper, up to 7 semitones either way; with SHIFT it tunes the whole performance.',
  },
  {
    id: 'lfo1',
    label: 'LFO 1',
    module: 'lfo',
    keywords: 'lfo vibrato tremolo wobble rate delay hf audio rate',
    rects: [R(440, 60, 716, 440)],
    help: 'Each layer’s own LFO, one per voice: RATE, a DELAY before it fades in, WAVEFORM and MODE (free, once or restarted with each key). Its HF settings run it from 20 Hz to 20 kHz, fast enough to modulate at audio rate. The DDS MODULATOR, VCF and VCA sections each have a fader for how far it moves them.',
  },
  {
    id: 'ddsmod',
    label: 'DDS modulator',
    module: 'mod',
    keywords: 'pitch modulation vibrato super saw detune pulse width pwm wave morph cross mod fm',
    rects: [R(720, 60, 1172, 440)],
    help: 'Shapes and moves the oscillators. LFO 1 and ENV 1 move the pitch of DDS 1, DDS 2 or both. SUPER thickens DDS 1 into a stack of detuned copies, spread by PW/DETUNE, which also sets DDS 2’s pulse width. PW/WAVE morphs DDS 1’s wave and modulates DDS 2’s pulse, and CROSS MOD is FM between the two.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'oscillator dds waveform range footage tune ring modulation sync sub',
    rects: [R(1176, 60, 1502, 440)],
    help: 'Two digital oscillators per voice. DDS 1 has its waveform (or the alternative waves) and RANGE. DDS 2 has its waveform, RANGE and TUNE, and a switch for NORM, RING (ring modulation with DDS 1) or SYNC. Turned to LFO, DDS 2 becomes a modulator and the switch adds a sub-oscillator.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mix balance blend pan',
    rects: [R(1504, 60, 1578, 440)],
    help: 'One knob per layer that balances DDS 1 against DDS 2, or against the ring modulator or the sub-oscillator when one of them takes DDS 2’s place.',
  },
  {
    id: 'vcf',
    label: 'VCF',
    module: 'filter',
    keywords: 'filter cutoff resonance high-pass low-pass drive envelope keytrack',
    rects: [R(1582, 60, 2012, 440)],
    help: 'A gentle 6 dB high-pass (HPF) then a 24 dB low-pass (LPF) with RES and three-step DRIVE. ENV, LFO 1 and DDS 2 set how far each moves the cutoff, the switch above picks envelope 1, 2 or both, and KEYTRACK makes it follow the keys.',
  },
  {
    id: 'vca',
    label: 'VCA',
    module: 'amp',
    keywords: 'amplifier volume level tremolo velocity dynamics',
    rects: [R(2014, 60, 2220, 440)],
    help: 'Each layer’s amplifier. ENV LEVEL is in effect the layer’s volume, LFO 1 and DDS 2 add tremolo or amplitude modulation, the lower switch picks envelope 2 or a fixed gate, and DYNAMICS makes harder playing louder and brighter.',
  },
  {
    id: 'env',
    label: 'Envelopes',
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release hold loop invert',
    rects: [R(2222, 60, 2676, 440)],
    help: 'Two envelopes per layer, each 1 ms to 10 s a stage. ENV 1 (filter, pitch, wave) can be inverted or looped and shortens on high notes with KEYTRACK; ENV 2 normally shapes the loudness. SHIFT shows the hold stages: a wait before the attack (AH) and at the peak (DH).',
  },
  {
    id: 'send',
    label: 'Delay send',
    module: 'fx',
    keywords: 'delay echo send',
    rects: [R(2680, 60, 2765, 440)],
    help: 'How much of each layer goes into the delay; the delay’s TIME and FEEDBACK are in the strip below. Here one delay serves both layers at the larger of their SENDs.',
  },
  {
    id: 'manual',
    label: 'Manual and tempo',
    module: 'mode',
    keywords: 'manual init patch tempo bpm clock',
    rects: [R(44, 466, 278, 608)],
    help: 'The MANUAL buttons play a layer as the panel is set, rather than its stored patch (always the case here). TEMPO sets the arpeggiator’s speed.',
  },
  {
    id: 'keyboard',
    label: 'Hold, keyboard and layer',
    module: 'mode',
    keywords: 'hold single dual split layer bi-timbral performance',
    rects: [R(280, 466, 714, 608)],
    help: 'KEYBOARD sets how the two layers share the keys: one layer (SINGLE), both on every key (DUAL) or one each side of C4 (SPLIT). LAYER picks the layer SINGLE plays. HOLD keeps each layer’s arpeggio running after the keys are let go.',
  },
  {
    id: 'voice',
    label: 'Voice assign',
    module: 'mode',
    keywords: 'mono poly solo legato unison binaural stereo voices',
    rects: [R(716, 466, 908, 608)],
    help: 'MODE picks one note at a time (SOLO, LEGATO) or chords (POLY 1, POLY 2). UNISON stacks detuned voices on each note, and BINAURAL pairs voices into stereo “super voices”, which halves how many notes can play.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator / sequencer',
    module: 'mode',
    keywords: 'arpeggiator arp sequencer clock division range up down random',
    rects: [R(910, 466, 1452, 608)],
    help: 'ON starts the arpeggiator, which plays the held notes in turn at the TEMPO and CLK DIV, through 1–4 octaves (RANGE) in the order MODE sets. SEQ REC and TRACK record the hardware’s 64-step sequencer; the app’s sequencer under the panel stands in for it.',
  },
  {
    id: 'matrix',
    label: 'Modulation matrix and memory',
    module: 'mod',
    keywords:
      'mod matrix modulation sources destinations velocity aftertouch ribbon patch performance shift fine tune',
    rects: [R(1456, 466, 2420, 608)],
    help: 'MOD ASSIGN turns the sixteen buttons into a modulation matrix: sources 1–8 (DDS 2, LFO 2, ENV 1, velocity, aftertouch, expression, ribbon, note number) to destinations A–H, at the depth MOD AMOUNT sets. The same buttons pick performances (PERF), patches (PATCH) and alternative waves (WAVE). SHIFT shows the second functions printed on the dark plates. Only SHIFT and FINE ADJ do anything here.',
  },
  {
    id: 'chorus',
    label: 'Chorus',
    module: 'fx',
    keywords: 'chorus ensemble stereo string',
    rects: [R(2424, 466, 2562, 608)],
    help: 'A stereo chorus on the whole sound: I subtle, II denser and faster, both together an ensemble like a string machine.',
  },
  {
    id: 'delay',
    label: 'Delay',
    module: 'fx',
    keywords: 'delay echo time feedback',
    rects: [R(2566, 466, 2748, 608)],
    help: 'A stereo delay: TIME from 1 ms to 1 s and FEEDBACK up to endless repeats. Each layer’s SEND fader sets how much reaches it (here the larger of the two). On the hardware it follows the chorus; here it comes before it.',
  },
  {
    id: 'porta',
    label: 'Octave and portamento',
    module: 'glide',
    keywords: 'octave transpose portamento glide slide',
    rects: [R(52, 634, 448, 745)],
    help: 'OCTAVE moves the keyboard by up to two octaves; PORTAMENTO slides between notes. The switch beside them says which layer they act on.',
  },
  {
    id: 'lfo2',
    label: 'LFO 2',
    module: 'lfo',
    keywords: 'lfo vibrato wah tremolo bender push mod wheel delay sample glide',
    rects: [R(52, 750, 322, 1062)],
    help: 'A second LFO for performance: WAVEFORM, RATE and DELAY, with faders for how far it moves the pitch (DDS), the filter (VCF) and the volume (VCA). The trigger switch brings it in by pushing the bender up, here the mod wheel, or keeps it on; LFO2 RATE speeds it up as you push.',
  },
  {
    id: 'dest',
    label: 'Destination and bender',
    module: 'mod',
    keywords: 'bender pitch bend destination layer oscillator',
    rects: [R(324, 750, 448, 1062)],
    help: 'The two switches pick which oscillator and which layer LFO 2 and the bender act on. The bender’s faders set how far moving it sideways bends the pitch and the filter, which the app’s keyboard cannot do.',
  },
  {
    id: 'bender',
    label: 'Bender',
    module: 'mod',
    keywords: 'bender pitch bend lever push',
    rects: [R(60, 1066, 448, 1136)],
    help: 'A lever that bends the pitch and filter when moved sideways and triggers LFO 2 when pushed up. The app’s mod wheel stands in for the push; sideways bending is not modelled.',
  },
  {
    id: 'ribbon',
    label: 'Ribbon controller',
    module: 'mod',
    keywords: 'ribbon pitch bend slide',
    rects: [R(540, 646, 1946, 738)],
    help: 'A strip above the keys that bends held notes: start low and slide up for the most upward bend, or the other way. In the mod matrix it can move other things instead. The app has no ribbon, so it is drawn only.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO1_MIX: Record<string, LfoMix> = {
  tri: { tri: 1 },
  rsaw: { rsaw: 1 },
  sh: { sh: 1 },
  sq: { sq: 1 },
  hf: { sine: 1 },
  hftrk: { sine: 1 },
};
const LFO2_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  rsaw: { rsaw: 1 },
  sh: { sh: 1 },
  sq: { sq: 1 },
  saw: { saw: 1 },
  shg: { shg: 1 },
};
const ARP_ENGINE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
};
/** The engine's mix for one classic wave (noise is a mixer channel of its own; the alternative waves play a sawtooth). */
function waveGain(mix: OscMix, w: string, g: number): void {
  if (g <= 0) return;
  const k =
    w === 'sine'
      ? 'sine'
      : w === 'tri'
        ? 'tri'
        : w === 'square' || w === 'pulse'
          ? 'pulse'
          : w === 'noise'
            ? null
            : 'saw';
  if (k) mix[k] = (mix[k] ?? 0) + g;
}
/** The engine's pitch destinations for DDS 1, DDS 2 or both. DDS 1 is oscillators 1–3 (centre, sisters or sub). */
const pitchDests = (d: string): string[] =>
  d === 'dds2' ? ['pitch4'] : d === 'both' ? ['pitchAll'] : ['pitch1', 'pitch2', 'pitch3'];

/** Gains of DDS 1's centre oscillator and of each sister in super mode. */
const CENTRE = 0.42;
const SISTER = 0.3;
const DDS2_LEVEL = 0.42;
const SUB_LEVEL = 0.45;
/** Semitones each sister sits from the centre at full PW/DETUNE in SUPER ON. */
const SPREAD = 0.6;

interface LayerOpts {
  gain: number;
  tune: number;
  glide: number;
  /** LFO 2 reaches this layer (the DEST layer switch). */
  lfo2: boolean;
  /** Notes one at a time, envelopes not restarted (LEGATO). */
  legato: boolean;
}

/** One layer's voice settings. */
function layerVoice(v: ControlValues, s: Side, ctx: EngineContext, o: LayerOpts): LayerParams {
  const n = (k: string): number => num(v, `${s}.${k}`);
  const e = (k: string): string => String(v[`${s}.${k}`]);
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };

  // ── oscillators ──
  const semi1 = FEET_SEMI[e('dds1Range')] ?? 0;
  const lfoRange = e('dds2Range') === 'lfo';
  const mode2 = e('dds2Mode');
  const ring = !lfoRange && mode2 === 'ring';
  const sync = !lfoRange && mode2 === 'sync';
  const sub = lfoRange ? (mode2 === 'ring' ? 'square' : mode2 === 'sync' ? 'sine' : null) : null;
  // MIX: an equal-power blend, DDS 1 at the left
  const m = n('mix') / 10;
  const ga = Math.cos((m * Math.PI) / 2),
    gb = Math.sin((m * Math.PI) / 2);
  // DDS 1's wave, morphed by hand towards the next one along (A → B)
  const manual = e('pwSrc') === 'manual';
  const morph = manual ? n('pwWave') / 10 : 0;
  const w1 = e('dds1Wave');
  const waves1 = DDS1_WAVES.map((w) => String(w.v));
  const w1Next = waves1[Math.min(waves1.indexOf(w1) + 1, waves1.length - 1)];
  const mix1: OscMix = {};
  waveGain(mix1, w1, 1 - morph);
  waveGain(mix1, w1Next, morph);
  const noise1 =
    (w1 === 'noise' ? 1 - morph : 0) + (w1Next === 'noise' && w1 !== 'noise' ? morph : 0);
  // SUPER: the centre oscillator and two sisters spread either side (one, above, when the sub takes the third)
  const sup = e('super');
  const spread = sup === 'off' ? 0 : (n('pwDetune') / 10) * SPREAD * (sup === 'half' ? 0.5 : 1);
  const sisters = sup !== 'off';
  const dds1 = (level: number, semi: number): OscParams => ({
    level: level * ga,
    mix: mix1,
    pw: 0.5,
    semi: semi1 + semi,
    kbd: true,
    syncTo: -1,
  });
  // DDS 2's pulse: PW/DETUNE narrows it, and so does PW/WAVE by hand
  const pw2 = clamp(
    0.5 - 0.45 * (n('pwDetune') / 10) - (manual ? 0.45 * (n('pwWave') / 10) : 0),
    0.05,
    0.5
  );
  const w2 = e('dds2Wave');
  const mix2: OscMix = {};
  waveGain(mix2, w2, 1);
  const tune2 = n('dds2Tune');
  const dds2: OscParams = lfoRange
    ? {
        level: 0,
        mix: mix2,
        pw: w2 === 'pulse' ? pw2 : 0.5,
        semi: 0,
        kbd: false,
        fixedNote: noteOf(dds2LfoHz(tune2)),
        syncTo: -1,
      }
    : {
        level: ring || w2 === 'noise' ? 0 : DDS2_LEVEL * gb,
        mix: mix2,
        pw: w2 === 'pulse' ? pw2 : 0.5,
        semi: (FEET_SEMI[e('dds2Range')] ?? 0) + tune2,
        kbd: true,
        syncTo: sync ? 0 : -1,
      };
  const third: OscParams = sub
    ? {
        level: SUB_LEVEL * gb,
        mix: sub === 'sine' ? { sine: 1 } : { pulse: 1 },
        pw: 0.5,
        semi: semi1 - 12,
        kbd: true,
        syncTo: -1,
      }
    : dds1(sisters ? SISTER : 0, -spread);
  // with the sub on the third oscillator, the centre and the one sister sit either side of the pitch, so it stays in tune
  const half = sub ? spread / 2 : 0;
  const osc: OscParams[] = [
    dds1(CENTRE, -half),
    dds1(sisters ? SISTER : 0, sub ? half : spread),
    third,
    dds2,
  ];
  const noiseLevel = 0.5 * (noise1 * ga + (!lfoRange && !ring && w2 === 'noise' ? gb : 0));
  // DDS 2 as a modulation source: on its noise wave the engine's oscillator is silent, so the noise generator stands in
  const dds2Src = w2 === 'noise' ? 'noise' : 'osc4';

  // ── envelopes ──
  const env1Mode = e('env1Mode');
  const inv = env1Mode === 'inv' ? -1 : 1;
  const ek = e('env1Key');
  const env1 = {
    a: envTime(n('e1a')),
    d: envTime(n('e1d')),
    s: n('e1s') / 10,
    r: envTime(n('e1r')),
    dly: holdTime(n('e1ah')),
    hold: holdTime(n('e1dh')),
    kf: ek === 'on' ? 1 : ek === 'half' ? 0.5 : 0,
    loop: env1Mode === 'loop',
  };
  const env2 = {
    a: envTime(n('e2a')),
    d: envTime(n('e2d')),
    s: n('e2s') / 10,
    r: envTime(n('e2r')),
    hold: holdTime(n('e2dh')),
  };

  // ── DDS modulator ──
  const modDest = pitchDests(e('modDest'));
  const lfoPitch = 12 * Math.pow(n('modLfo') / 10, 2);
  const envPitch = 24 * Math.pow(n('modEnv') / 10, 2) * inv;
  for (const d of modDest) {
    route('lfo', d, lfoPitch);
    route('env1', d, envPitch);
  }
  if (!manual)
    route(
      e('pwSrc') === 'lfo1' ? 'lfo' : 'env1',
      'pw2',
      0.4 * (n('pwWave') / 10) * (e('pwSrc') === 'env1' ? inv : 1)
    );
  // CROSS MOD: DDS 2 frequency-modulates DDS 1, or the other way round with SYNC
  const xm = 36 * Math.pow(n('xmod') / 10, 2);
  if (sync) route('osc1', 'pitch4', xm);
  else for (const d of ['pitch1', 'pitch2', 'pitch3']) route(dds2Src, d, xm);

  // ── filter ──
  const dyn = e('dyn');
  const vel = dyn !== 'off';
  const src = e('vcfSrc');
  const envAmt = 7 * (n('vcfEnv') / 10);
  const kt = e('vcfKey');
  const driveOf: Record<string, number> = { off: 0.8, '1': 1.6, '2': 3.2 };
  if (src === 'both') route(vel ? 'env2v' : 'env2', 'cutoff', envAmt);
  route('lfo', 'cutoff', 4 * (n('vcfLfo') / 10));
  route(dds2Src, 'cutoff', 4 * (n('vcfDds2') / 10));
  // DYNAMICS: a harder key opens the filter further
  route('vel', 'cutoff', dyn === 'on' ? 2 : dyn === 'half' ? 1 : 0);

  // ── VCA ──
  const vm = e('vcaMode');
  const fixed = vm !== 'env2';
  const ampEnv = fixed ? 'env3' : vel ? 'env2v' : 'env2';
  route('lfo', 'amp', 0.8 * (n('vcaLfo') / 10), ampEnv);
  route(dds2Src, 'amp', 0.8 * (n('vcaDds2') / 10), ampEnv);

  // ── LFO 1 ──
  const lw = e('lfoWave');
  const hf = lw === 'hf' || lw === 'hftrk';
  if (lw === 'hftrk') route('kbd', 'lfoRate', 1);

  // ── LFO 2: in at the push (the mod wheel) unless it is switched on ──
  const trig = String(v['lfo2.trig']);
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const depth = o.lfo2 ? (trig === 'on' ? 1 : wheel) : 0;
  for (const d of pitchDests(String(v['perf.oscDest'])))
    route('lfo2', d, 12 * Math.pow(num(v, 'lfo2.dds') / 10, 2) * depth);
  route('lfo2', 'cutoff', 4 * (num(v, 'lfo2.vcf') / 10) * depth);
  route('lfo2', 'amp', 0.8 * (num(v, 'lfo2.vca') / 10) * depth, ampEnv);
  const lfo2Rate =
    lfo2Hz(num(v, 'lfo2.rate')) *
    (1 + 3 * (num(v, 'lfo2.rateMod') / 10) * (trig === 'on' ? 0 : wheel));

  return {
    osc,
    noise: { level: noiseLevel, color: 'white' },
    ext: { level: ring ? 0.6 * gb : 0 },
    ...(ring ? { normals: { extIn: 'ring', ringA: 'osc1', ringB: 'osc4' } } : {}),
    hpf: { cutoff: hpfHz(n('hpf')), res: 0, envAmt: 0, envSrc: 'env1', kbd: 0, poles: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: lpfHz(n('lpf')),
      res: 1.1 * (n('res') / 10),
      envAmt: src === 'env2' ? envAmt : envAmt * inv,
      envSrc: src === 'env2' ? (vel ? 'env2v' : 'env2') : vel ? 'env1v' : 'env1',
      kbd: kt === 'on' ? 1 : kt === 'half' ? 0.5 : 0,
      drive: driveOf[e('drive')] ?? 0.8,
    },
    env1,
    env2,
    ...(fixed ? { env3: { a: 0.001, d: 0.001, s: 1, r: vm === 'fixed2' ? 0.3 : 0.003 } } : {}),
    vca: { envSrc: ampEnv, bias: 0, gain: level10(n('vcaEnv'), 1) * o.gain },
    lfo: {
      rate: lfoHz(n('lfoRate'), hf),
      mix: LFO1_MIX[lw] ?? { tri: 1 },
      keySync: e('lfoMode') !== 'free',
      delay: lfoDelay(n('lfoDelay')),
    },
    lfo2: {
      rate: lfo2Rate,
      mix: LFO2_MIX[String(v['lfo2.wave'])] ?? { sine: 1 },
      keySync: false,
      delay: lfo2Delay(num(v, 'lfo2.delay')),
    },
    glide: { time: o.glide, legato: false },
    trig: { retrig: !o.legato, drone: false, repeat: false },
    drift: { depth: 0.5 * (n('drift') / 10), rate: 0.8 },
    delay: { on: false },
    routes,
    tune: o.tune,
  };
}

const DELAY_DEFAULTS: Record<string, number | string> = Object.fromEntries(
  (FX_ALGOS.find((a) => a.id === 'delay')?.params ?? []).map((q) => [q.ref, q.def])
);
/**
 * The delay, after the voices on the effects engine (`audio/dm-fx.ts`), so its echoes outlast the notes. One delay
 * serves the layers that sound, at the larger of their SENDs; its TIME and FEEDBACK are the strip's.
 */
function delayFx(v: ControlValues, sides: Side[]): FxParams {
  const send = Math.max(...sides.map((s) => num(v, `${s}.send`)));
  if (send <= 0) return { mode: 'bypass' };
  const fb = Math.round(num(v, 'dly.feedback') * 10);
  return {
    mode: 'insert',
    routing: 1,
    slots: [
      {
        alg: 'delay',
        level: 1,
        p: {
          ...DELAY_DEFAULTS,
          MIX: Math.round(send * 7),
          TIM: Math.max(1, Math.round(delayTime(num(v, 'dly.time')) * 1000)),
          MOD: 'ST',
          FCL: '1',
          FCR: '1',
          FBL: fb,
          FBR: fb,
          LC: 10,
          HC: 20000,
          FHC: 20000,
        },
      },
      { alg: null },
      { alg: null },
      { alg: null },
    ],
  };
}

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const mode = String(v['kbd.mode']);
  const single = mode === 'single';
  const binaural = v['voice.binaural'] === true;
  const vm = String(v['voice.mode']);
  const mono = vm === 'solo' || vm === 'legato';
  // notes per layer: 20 voices, halved by BINAURAL and again when two layers share them
  const perLayer = (binaural ? 10 : 20) / (single ? 1 : 2);
  const unison = v['voice.unison'] === true;
  const stack = unison ? (mono ? perLayer : 2) : 1;
  const voices = mode === 'split' ? perLayer * 2 : perLayer;
  // PORTAMENTO, OCTAVE and LFO 2 act on the layers their switches name
  const names =
    (id: string) =>
    (s: Side): boolean => {
      const l = String(v[id]);
      return l === 'both' || l === (s === 'up' ? 'upper' : 'lower');
    };
  const portaOn = names('perf.portaLayer');
  const modOn = names('perf.modLayer');
  const oct = Number(v['perf.octave']) || 0;
  const common = num(v, 'perf.detune') + num(v, 'kbd.fine') / 100;
  // two layers on every key are summed, so DUAL turns each down; SPLIT plays one a key
  const gain = mode === 'dual' ? 0.75 : 1;
  const opts = (s: Side): LayerOpts => ({
    gain,
    tune: (portaOn(s) ? oct * 12 : 0) + common + (s === 'lo' ? num(v, 'perf.lowerDetune') : 0),
    glide: portaOn(s) ? portaTime(num(v, 'perf.porta')) : 0,
    lfo2: modOn(s),
    legato: vm === 'legato',
  });
  const up = layerVoice(v, 'up', ctx, opts('up'));
  const lo = layerVoice(v, 'lo', ctx, opts('lo'));
  const top = single && v['layer.select'] === 'lower' ? lo : up;
  const div = DIVS.find((d) => d.v === v['arp.div']) ?? DIVS[4];
  const arpMode = ARP_ENGINE[String(v['arp.mode'])];
  const chorusMode = (v['chorus.i'] === true ? 1 : 0) + (v['chorus.ii'] === true ? 2 : 0);
  return {
    ...top,
    poly: { voices, stack, mono, detune: unison ? 0.15 : 0 },
    ...(single ? {} : { layer: mode === 'split' ? { ...lo, split: 60 } : lo }),
    arp: {
      on: v['arp.on'] === true && arpMode !== undefined,
      // the arpeggiator steps in sixteenths, so the tempo is scaled to the CLK DIV's note value
      bpm: (tempoOf(num(v, 'arp.tempo')) * 0.25) / div.beats,
      gate: 0.5,
      mode: arpMode ?? 'up',
      octaves: Number(v['arp.range']) || 1,
      hold: v['hold.upper'] === true || v['hold.lower'] === true,
    },
    chorus: { on: chorusMode > 0, mode: chorusMode as 0 | 1 | 2 | 3 },
    fx: delayFx(v, single ? (top === lo ? ['lo'] : ['up']) : ['up', 'lo']),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const superGemini: SynthDef & { version: number } = {
  id: 'super-gemini',
  version: 1,
  name: 'Super Gemini',
  maker: 'UDO Audio',
  year: 2023,
  heritage: 'UDO Audio’s 20-voice, two-layer flagship, built on the Super 6',
  summary:
    'Two complete layers, upper and lower, played singly, stacked or split: each a digital super-wave oscillator and a second that can ring-modulate, sync or become an LFO, a 6 dB high-pass into a 24 dB low-pass with drive, a VCA, two envelopes with hold stages and an LFO, with chorus and delay. A performance LFO, portamento and an arpeggiator serve both.',
  view: { w: VIEW_W, h: VIEW_H },
  theme: {
    panel: PANEL,
    panel2: '#dcdbd6',
    ink: INK,
    font: 'helv',
    cheeks: 'none',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  signalNames: {
    env1: 'envelope 1',
    env2: 'envelope 2',
    env3: 'the fixed envelope',
    lfo: 'LFO 1',
    lfo2: 'LFO 2',
    osc1: 'DDS 1',
    osc4: 'DDS 2',
    ring: 'the ring modulator',
    vel: 'velocity',
    kbd: 'the keyboard',
  },
};

export default superGemini;
