/**
 * Yamaha CS-80: the definition (D1). The layout follows the straight-on photograph inside the manual's front cover
 * (`.context/app/synth-data/cs-80/raw/Yamaha CS-80 Owner's Manual.pdf`, p. 3) and the colours of the owner's photo
 * (`raw/Yamaha CS-80.jpg`, 1680 × 915, both local only), laid on a regular grid: the hardware is a grid of identical
 * slider columns. The owner's spec is `.context/app/synth-data/cs-80/cs-80.synth.json` (the CS-80 Instruction Manual).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/jupiter-8.ts`, the nearest
 * instrument: an eight-voice analogue poly built of sliders. Every key plays two complete voices, channel I and channel
 * II, each with a sawtooth VCO shaped into square, sawtooth and sine, white noise, a high-pass then a low-pass filter
 * with their own resonance moved by the IL-AL-A-D-R envelope, and a VCA with its own ADSR. The sine skips the filters.
 * MIX blends the two channels; the sub oscillator, ring modulator and tremolo/chorus work on both. That is the engine's
 * `layer` (t-132): channel I is the top-level voice and channel II the layer.
 *
 * Each channel's TONE SELECTOR row picks one of eleven presets or the PANEL, so the panel's sliders for a channel are
 * heard only while its PANEL button is lit. The presets are the manual's own charts of the panel settings that
 * duplicate them (`defs/cs-80-presets.ts`). The four memories are miniature panels under the cover, with nothing to
 * store here: their buttons are printed, and the library keeps sounds.
 *
 * The levers of the lower strip and the performance panel give most pulled towards the player (manual p. 6), so they are
 * faders with `maxAt: 'bottom'`; the programmable panels' sliders have 10 at the top, as printed. The rockers are on
 * rocked forward, so each is an enum whose first option (off) is the top half.
 *
 * Not modelled, because the app's keyboard has no pressure and no ribbon: AFTER touch (the AFTER sliders and the three
 * pressure levers of TOUCH RESPONSE) and the ribbon. The foot switch and pedal are absent too, so sustain and portamento
 * are always on as on the hardware with no foot switch plugged in, and the pedal selector changes nothing. SUSTAIN II
 * mode, EXT on the sub oscillator and the HIGH/LOW output switch are printed only.
 *
 * Ranges the manual gives: envelope attack 1 ms–1 s, decay and release 10 ms–10 s, sustain up to about 10 s,
 * portamento about 2 s an octave, DETUNE CH II about a semitone, PITCH about an octave coarse and a semitone fine,
 * chorus 0.5–5 Hz and tremolo 5–20 Hz. Everything else (filter ranges, the envelope's IL/AL depths, the PWM and sub
 * oscillator speeds, the ring modulator's speed, the key timing pulse) is this app's estimate (`not_in_source`).
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValue,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  FaderControl,
  LayerParams,
  LfoMix,
  RockerControl,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { CS80_PRESETS, PANEL_COLS, type PanelCol } from '@/lib/app/synths/defs/cs-80-presets';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;
type FaderRest = Omit<
  FaderControl,
  'id' | 'type' | 'x' | 'y' | 'len' | 'orient' | 'kind' | 'labelPos'
> &
  Partial<Pick<FaderControl, 'len' | 'labelPos'>>;
/** A programmable-panel slider's settings: always 0–10, so no range. */
type SliderRest = Omit<FaderRest, 'cap' | 'min' | 'max' | 'def'> & { def?: number };

// ── Ranges and tapers ─────────────────────────────────────────────────────
const attTime = (v: number): number => 0.001 * Math.pow(1000, clamp(v, 0, 10) / 10);
const drTime = (v: number): number => 0.01 * Math.pow(1000, clamp(v, 0, 10) / 10);
const pwmHz = (v: number): number => expMap(v / 10, 0.2, 20);
const hpfHz = (v: number): number => expMap(v / 10, 20, 6000);
const lpfHz = (v: number): number => expMap(v / 10, 40, 16000);
/** IL and AL in octaves at full travel. */
const IL_OCT = 4;
const AL_OCT = 4;
const subHz = (v: number): number => expMap(v / 10, 0.1, 80);
const ringHz = (v: number): number => expMap(v / 10, 1, 1500);
const ringTime = (v: number): number => expMap(v / 10, 0.005, 4);
const sustainTime = (v: number): number => 10 * Math.pow(v / 10, 2);
const portaTime = (v: number): number => 2 * Math.pow(v / 10, 2);
const tremHz = (v: number, chorus: boolean): number =>
  chorus ? expMap(v / 10, 0.5, 5) : expMap(v / 10, 5, 20);
/** The key timing pulse's length, seconds. */
const PULSE_S = 0.25;
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signed = (v: number): string =>
  Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

// ── Photo → view ──────────────────────────────────────────────────────────
const CHEEK = 22;
const VIEW_W = 2380;
const VIEW_H = 1010;
const INK = '#efeee8';
const DIM = '#b9b8b2';
const PANEL = '#2a2a29';
const COVER = '#33332f';
const CAP = {
  white: '#f1f0e9',
  grey: '#b9bdc2',
  green: '#2e9a52',
  red: '#d9302b',
  yellow: '#efd23c',
  black: '#1b1b1c',
};

const controls: Control[] = [];
const decor: Decor[] = [];

/** Silkscreen text centred on (x, y) (the renderer places text by its baseline). */
const text = (x: number, y: number, t: string, size = 10, rest: TextRest = {}): void => {
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
const line = (x1: number, y1: number, x2: number, y2: number, w = 1.4): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w });
};
/** A bracket over (or under) a run of controls: ticks down from a line, with a name in a gap. */
const bracket = (
  x1: number,
  x2: number,
  y: number,
  name?: string,
  size = 10,
  down = true
): void => {
  const d = down ? 7 : -7;
  if (name) {
    const gap = name.length * size * 0.36 + 10;
    const mid = (x1 + x2) / 2;
    line(x1, y, mid - gap, y);
    line(mid + gap, y, x2, y);
    text(mid, y, name, size);
  } else line(x1, y, x2, y);
  line(x1, y, x1, y + d);
  line(x2, y, x2, y + d);
};

// ── Control helpers ───────────────────────────────────────────────────────
/** A slider of a programmable panel: 0–10, 10 at the top, a coloured cap; `top` / `bottom` are the printed ends. */
const slider = (
  id: string,
  x: number,
  y: number,
  name: string,
  cap: keyof typeof CAP,
  rest: SliderRest & { top: string; bottom: string }
): void => {
  const { top, bottom, def, ...more } = rest;
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len: 84,
    orient: 'v',
    pad: 7,
    ticks: 6,
    face: 'block',
    cap: CAP[cap],
    kind: 'cont',
    min: 0,
    max: 10,
    def: def ?? 0,
    labelPos: 'none',
    ...more,
  });
  text(x, y - 62, top, 8, { fill: DIM });
  text(x, y + 61, bottom, 8, { fill: DIM });
  if (name) text(x, y + 76, name, 9.5);
};
/** A lever of the lower strip or the performance panel: most pulled down, towards the player. */
const lever = (id: string, x: number, y: number, cap: keyof typeof CAP, rest: FaderRest): void => {
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len: 58,
    orient: 'v',
    pad: 8,
    ticks: 0,
    face: 'block',
    cap: CAP[cap],
    maxAt: 'bottom',
    kind: 'cont',
    labelPos: 'none',
    ...rest,
  });
};
/** A black rocker: off with the top half pressed, on rocked forward (the bottom half), as the CS-80's are. */
const rocker = (
  id: string,
  x: number,
  y: number,
  rest: Omit<
    RockerControl,
    'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'color' | 'orient' | 'kind' | 'options' | 'def'
  > & {
    options?: ControlOption[];
    def?: string;
    w?: number;
    h?: number;
  }
): void => {
  const { options, def, w, h, ...more } = rest;
  controls.push({
    id,
    type: 'rocker',
    x,
    y,
    w: w ?? 24,
    h: h ?? 50,
    color: 'black',
    orient: 'v',
    kind: 'enum',
    options: options ?? [
      { v: 'off', label: 'Off' },
      { v: 'on', label: 'On' },
    ],
    def: def ?? 'off',
    labelPos: 'none',
    ...more,
  });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
// the two upright panels (memory cover, programmable panels), the lower strip and the performance panel
decor.push({
  t: 'rect',
  x: 40,
  y: 28,
  w: 584,
  h: 506,
  r: 6,
  fill: COVER,
  stroke: '#00000066',
  sw: 2,
});
decor.push({
  t: 'rect',
  x: 648,
  y: 28,
  w: 1694,
  h: 506,
  r: 6,
  fill: '#262625',
  stroke: '#00000066',
  sw: 2,
});
line(40, 556, VIEW_W - CHEEK - 18, 556, 1.6);
line(40, 778, VIEW_W - CHEEK - 18, 778, 1.6);
line(640, 778, 640, VIEW_H - 18, 1.6);

// the simplified block diagram printed on the memory cover (manual p. 41): one channel's panel
{
  const box = (x: number, y: number, w: number, h: number, t: string): void => {
    decor.push({ t: 'rect', x, y, w, h, r: 3, fill: 'none', stroke: INK, sw: 1.6 });
    text(x + w / 2, y + h / 2, t, 11);
  };
  const arrow = (x1: number, y: number, x2: number): void => {
    line(x1, y, x2 - 6, y, 1.6);
    decor.push({
      t: 'path',
      d: `M${x2 - 8} ${y - 4} L${x2} ${y} L${x2 - 8} ${y + 4} Z`,
      w: 0,
      fill: INK,
    });
  };
  const Y0 = 120;
  box(70, Y0 - 22, 60, 44, 'VCO');
  box(158, Y0 - 22, 60, 44, 'WSC');
  box(250, Y0 - 22, 60, 44, 'HPF');
  box(340, Y0 - 22, 60, 44, 'LPF');
  box(450, Y0 - 22, 60, 44, 'VCA');
  arrow(130, Y0, 158);
  arrow(218, Y0, 250);
  arrow(310, Y0, 340);
  arrow(400, Y0, 450);
  arrow(510, Y0, 560);
  text(586, Y0, 'MIX', 10);
  // the sine bypasses the filters
  line(188, Y0 + 22, 188, Y0 + 52, 1.4);
  line(188, Y0 + 52, 470, Y0 + 52, 1.4);
  line(470, Y0 + 52, 470, Y0 + 28, 1.4);
  decor.push({ t: 'arrow', x: 470, y: Y0 + 25, dir: 'up', size: 4 });
  decor.push({ t: 'wave', x: 320, y: Y0 + 52, size: 9, shape: 'sine', w: 1.4 });
  box(70, Y0 + 98, 74, 40, 'PWM OSC');
  line(107, Y0 + 98, 107, Y0 + 32, 1.4);
  decor.push({ t: 'arrow', x: 107, y: Y0 + 26, dir: 'up', size: 4 });
  box(272, Y0 + 98, 106, 40, 'IL AL A D R');
  line(325, Y0 + 98, 325, Y0 + 32, 1.4);
  decor.push({ t: 'arrow', x: 325, y: Y0 + 26, dir: 'up', size: 4 });
  box(430, Y0 + 98, 100, 40, 'A D S R');
  line(480, Y0 + 98, 480, Y0 + 32, 1.4);
  decor.push({ t: 'arrow', x: 480, y: Y0 + 26, dir: 'up', size: 4 });
  decor.push({ t: 'wave', x: 325, y: Y0 + 168, size: 16, shape: 'adsr', w: 1.4 });
  decor.push({ t: 'wave', x: 480, y: Y0 + 168, size: 16, shape: 'adsr', w: 1.4 });
  text(220, Y0 + 230, 'BRILLIANCE · INITIAL · AFTER', 9.5, { fill: DIM });
  text(470, Y0 + 230, 'LEVEL · INITIAL · AFTER', 9.5, { fill: DIM });
  text(332, 460, 'MEMORY 1 · 2 · 3 · 4  (BENEATH THIS COVER)', 10, { fill: DIM });
}

// ── Programmable panels: channel I (top) and channel II ───────────────────
const ROW_Y = [158, 402];
const VCO_X = [702, 761, 820, 879, 938, 997];
const VCF_X = Array.from({ length: 9 }, (_, i) => 1098 + i * 59);
const VCA_X = Array.from({ length: 7 }, (_, i) => 1671 + i * 59);
const TCH_X = [2126, 2185, 2244, 2303];
const NOT_PRESSURE =
  'The app’s keyboard senses no pressure, so this does nothing here; on the hardware pressing harder after the key is down';
const panelOnly = (c: number): string =>
  `Heard while channel ${c === 1 ? 'I' : 'II'}’s PANEL button is lit in the TONE SELECTOR.`;
[1, 2].forEach((c) => {
  const y = ROW_Y[c - 1];
  const ch = c === 1 ? 'I' : 'II';
  const p = `ch${c}`;
  const nm = (n: string): string => `${n} ${ch}`;
  const only = panelOnly(c);
  text(672, y, ch, 20, { weight: 800 });
  // ── VCO ──
  slider(`${p}.speed`, VCO_X[0], y, 'SPEED', 'white', {
    top: 'FAST',
    bottom: 'SLOW',
    def: 3,
    module: 'lfo',
    label: 'SPEED',
    name: nm('PWM SPEED'),
    fmt: (v) => fmtHz(pwmHz(v)),
    help: `How fast the channel’s own pulse-width modulator sweeps the square wave’s width (with PWM up). ${only}`,
  });
  slider(`${p}.pwm`, VCO_X[1], y, 'PWM', 'green', {
    top: '10',
    bottom: '0',
    def: 0,
    module: 'osc',
    label: 'PWM',
    name: nm('PWM'),
    fmt: pct,
    help: `How far the pulse-width modulator sweeps the square wave’s width, from none at 0. Slow, it makes a square shimmer like a chorus. ${only}`,
  });
  slider(`${p}.pw`, VCO_X[2], y, 'PW', 'green', {
    top: '90%',
    bottom: '50%',
    def: 0,
    module: 'osc',
    label: 'PW',
    name: nm('PW'),
    fmt: (v) => `${Math.round(50 + 4 * v)} %`,
    help: `The square wave’s duty cycle, from a hollow 50 % square at the bottom to a thin, nasal 90 % pulse at the top. It changes only the square. ${only}`,
  });
  rocker(`${p}.square`, VCO_X[3], y - 4, {
    def: 'off',
    module: 'osc',
    label: 'SQUARE',
    name: nm('SQUARE WAVE'),
    help: `Switches the square wave on (rocked forward) or off. With the sawtooth also on, the two add. ${only}`,
  });
  rocker(`${p}.saw`, VCO_X[4], y - 4, {
    def: 'on',
    module: 'osc',
    label: 'SAW',
    name: nm('SAWTOOTH WAVE'),
    help: `Switches the sawtooth wave on (rocked forward) or off: the brightest of the waves, the start of most strings and brass. ${only}`,
  });
  text(VCO_X[3], y - 62, 'ON', 8, { fill: DIM });
  text(VCO_X[4], y - 62, 'ON', 8, { fill: DIM });
  decor.push({ t: 'wave', x: VCO_X[3], y: y + 64, size: 9, shape: 'sq', w: 1.4 });
  decor.push({ t: 'wave', x: VCO_X[4], y: y + 64, size: 9, shape: 'saw', w: 1.4 });
  slider(`${p}.noise`, VCO_X[5], y, 'NOISE', 'grey', {
    top: '10',
    bottom: '0',
    def: 0,
    module: 'mixer',
    label: 'NOISE',
    name: nm('NOISE'),
    fmt: pct,
    help: `White noise into the filters with the waves, for breath, wind and surf. ${only}`,
  });
  // the bracket from PWM's SPEED and depth to the square it modulates
  bracket(VCO_X[0], VCO_X[3], y - 76, undefined, 8, true);
  // ── VCF ──
  const vcf: [string, string, string, keyof typeof CAP, string, string, Partial<SliderRest>][] = [
    [
      'hpf',
      'HPF',
      'filter',
      'green',
      'HIGH',
      'LOW',
      {
        def: 0,
        fmt: (v) => fmtHz(hpfHz(v)),
        help: `The high-pass filter’s cutoff, at middle C: at LOW (the bottom) it is wide open, and raising it takes away the bottom of the sound. Both filters follow the keyboard. ${only}`,
      },
    ],
    [
      'resH',
      'RES H',
      'filter',
      'red',
      'HIGH',
      'LOW',
      {
        def: 0,
        fmt: pct,
        help: `Resonance of the high-pass filter: a peak at its cutoff, heard only when the filter is partly closed. ${only}`,
      },
    ],
    [
      'lpf',
      'LPF',
      'filter',
      'green',
      'HIGH',
      'LOW',
      {
        def: 7,
        fmt: (v) => fmtHz(lpfHz(v)),
        help: `The low-pass filter’s cutoff, at middle C: at HIGH (the top) wide open, and lowering it makes the sound darker. Between the two filters lies a band the sound passes through. ${only}`,
      },
    ],
    [
      'resL',
      'RES L',
      'filter',
      'red',
      'HIGH',
      'LOW',
      {
        def: 2,
        fmt: pct,
        help: `Resonance of the low-pass filter: a peak at its cutoff that gives a twang or a wah when the filter moves. ${only}`,
      },
    ],
    [
      'il',
      'IL',
      'env',
      'black',
      '−5',
      '0',
      {
        def: 0,
        fmt: (v) => (v < 0.05 ? '0' : `−${(v / 2).toFixed(1)}`),
        help: `Initial Level: how far below their set cutoffs both filters start each note. They then rise over A. With AL at 0 they rise to the set cutoffs and stay. ${only}`,
      },
    ],
    [
      'al',
      'AL',
      'env',
      'black',
      '+5',
      '0',
      {
        def: 0,
        fmt: (v) => (v < 0.05 ? '0' : `+${(v / 2).toFixed(1)}`),
        help: `Attack Level: how far above their set cutoffs both filters rise at the end of A, before falling back to the set cutoffs over D. ${only}`,
      },
    ],
    [
      'fa',
      'A',
      'env',
      'black',
      'LONG',
      'SHORT',
      {
        def: 0,
        fmt: (v) => fmtTime(attTime(v)),
        help: `How long the filters take to move from IL up to AL, 1 ms to 1 s. Nothing happens with IL and AL both at 0. ${only}`,
      },
    ],
    [
      'fd',
      'D',
      'env',
      'black',
      'LONG',
      'SHORT',
      {
        def: 0,
        fmt: (v) => fmtTime(drTime(v)),
        help: `How long the filters take to fall from AL back to the set cutoffs, 10 ms to 10 s. ${only}`,
      },
    ],
    [
      'fr',
      'R',
      'env',
      'yellow',
      'LONG',
      'SHORT',
      {
        def: 0,
        fmt: (v) => fmtTime(drTime(v)),
        help: `How long the filters take to return to IL after the key is let go, 10 ms to 10 s. Heard only while the note is still sounding, so with a long VCA release or SUSTAIN. ${only}`,
      },
    ],
  ];
  vcf.forEach(([k, name, module, cap, top, bottom, rest], i) => {
    slider(`${p}.${k}`, VCF_X[i], y, name, cap, {
      top,
      bottom,
      module: module === 'env' ? 'env' : 'filter',
      label: name,
      name: nm(name === 'A' || name === 'D' || name === 'R' ? `VCF ${name}` : name),
      help: '',
      ...rest,
    });
  });
  // ── VCA ──
  const vca: [string, string, keyof typeof CAP, string, string, Partial<SliderRest>][] = [
    [
      'vcfLevel',
      'VCF LEVEL',
      'grey',
      '10',
      '0',
      {
        def: 10,
        fmt: pct,
        help: `How much of the filtered sound (square, sawtooth and noise) goes into the VCA. ${only}`,
      },
    ],
    [
      'sine',
      '',
      'grey',
      '10',
      '0',
      {
        def: 0,
        fmt: pct,
        help: `How much sine wave goes into the VCA. The sine skips the filters, so a pure fundamental can sit under a filtered tone, or be the whole sound. ${only}`,
      },
    ],
    [
      'a',
      'A',
      'black',
      'LONG',
      'SHORT',
      {
        def: 0,
        fmt: (v) => fmtTime(attTime(v)),
        help: `How long each note takes to reach full level, 1 ms to 1 s. ${only}`,
      },
    ],
    [
      'd',
      'D',
      'black',
      'LONG',
      'SHORT',
      {
        def: 0,
        fmt: (v) => fmtTime(drTime(v)),
        help: `How long the level takes to fall from full to S, 10 ms to 10 s. ${only}`,
      },
    ],
    [
      's',
      'S',
      'black',
      '10',
      '0',
      {
        def: 10,
        fmt: pct,
        help: `The level held while the key is down, after A and D. ${only}`,
      },
    ],
    [
      'r',
      'R',
      'yellow',
      'LONG',
      'SHORT',
      {
        def: 3,
        fmt: (v) => fmtTime(drTime(v)),
        help: `How long the note takes to die away after the key is let go, 10 ms to 10 s. SUSTAIN can make it longer still. ${only}`,
      },
    ],
    [
      'level',
      'LEVEL',
      'grey',
      '10',
      '0',
      {
        def: 8,
        fmt: pct,
        help: `The channel’s volume: the highest level the VCA reaches. ${only}`,
      },
    ],
  ];
  vca.forEach(([k, name, cap, top, bottom, rest], i) => {
    slider(`${p}.${k}`, VCA_X[i], y, name, cap, {
      top,
      bottom,
      module: k === 'level' || k === 'vcfLevel' || k === 'sine' ? 'amp' : 'env',
      label: name || 'SINE',
      name: nm(
        k === 'sine' ? 'SINE WAVE LEVEL' : ['a', 'd', 's', 'r'].includes(k) ? `VCA ${name}` : name
      ),
      help: '',
      ...rest,
    });
  });
  // the sine slider's name is the printed wave
  decor.push({ t: 'wave', x: VCA_X[1], y: y + 76, size: 9, shape: 'sine', w: 1.4 });
  // ── TOUCH RESPONSE ──
  const tch: [string, string, keyof typeof CAP, string][] = [
    ['initBrill', 'BRILLIANCE', 'green', 'INITIAL-TOUCH BRILLIANCE'],
    ['initLevel', 'LEVEL', 'grey', 'INITIAL-TOUCH LEVEL'],
    ['afterBrill', 'BRILLIANCE', 'green', 'AFTER-TOUCH BRILLIANCE'],
    ['afterLevel', 'LEVEL', 'grey', 'AFTER-TOUCH LEVEL'],
  ];
  tch.forEach(([k, label, cap, full], i) => {
    const after = i >= 2;
    const brill = i % 2 === 0;
    slider(`${p}.${k}`, TCH_X[i], y, label, cap, {
      top: '10',
      bottom: '0',
      def: 0,
      module: brill ? 'filter' : 'amp',
      label,
      name: nm(full),
      fmt: pct,
      ...(after ? { ui: true } : {}),
      help: after
        ? `${NOT_PRESSURE} makes the note ${brill ? 'brighter' : 'louder'}. ${only}`
        : `How much a harder, faster key makes the note ${brill ? 'brighter (both filters open)' : 'louder'}, for a moment at its start: the key timing pulse dies away, so the note settles back. The app’s keyboard plays every key at the same velocity; the sequencer can play softer and harder notes. ${only}`,
    });
  });
  bracket(TCH_X[0] - 12, TCH_X[1] + 12, y - 76, 'INITIAL', 8);
  bracket(TCH_X[2] - 12, TCH_X[3] + 12, y - 76, 'AFTER', 8);
});
// the section names between the two rows
bracket(VCO_X[0] - 16, VCO_X[5] + 16, 280, 'VCO', 11, false);
bracket(VCF_X[0] - 16, VCF_X[8] + 16, 280, 'VCF', 11, false);
bracket(VCA_X[0] - 16, VCA_X[6] + 16, 280, 'VCA', 11, false);
bracket(TCH_X[0] - 16, TCH_X[3] + 16, 280, 'TOUCH RESPONSE', 11, false);

// ── Lower strip ───────────────────────────────────────────────────────────
const LY = 690; // the levers' centre line
const LT = 598; // the names above them
const STRIP_LABEL = 576; // the section names
// PITCH: a concentric knob, the outer ring coarse and the inner knob fine
text(90, LT, 'PITCH', 11);
controls.push({
  id: 'tune.coarse',
  type: 'knob',
  x: 90,
  y: LY,
  r: 30,
  style: 'obxa',
  kind: 'cont',
  min: -6,
  max: 6,
  def: 0,
  module: 'out',
  label: 'PITCH',
  name: 'PITCH (outer ring)',
  labelPos: 'none',
  fmt: (v) => fmtSemi(v),
  help: 'Tunes the whole keyboard, both channels, up or down by about half an octave either way; it is detented at the centre for normal pitch.',
});
controls.push({
  id: 'tune.fine',
  type: 'knob',
  x: 90,
  y: LY,
  r: 14,
  style: 'obxa',
  kind: 'cont',
  min: -0.5,
  max: 0.5,
  def: 0,
  module: 'out',
  label: 'FINE',
  name: 'PITCH (inner knob)',
  labelPos: 'none',
  fmt: (v) => fmtSemi(v),
  help: 'Fine tuning, about a semitone across its travel; centred for normal pitch.',
});
text(66, LY + 44, '−', 13);
text(114, LY + 44, '+', 13);
// DETUNE CH II
text(196, LT, 'DETUNE CH II', 10);
lever('tune.detune', 196, LY, 'white', {
  min: -5,
  max: 5,
  def: 0,
  module: 'osc',
  label: 'DETUNE CH II',
  name: 'DETUNE CH II',
  fmt: (v) => fmtSemi(v / 5),
  help: 'Raises (pulled down, +) or lowers (pushed up, −) channel II against channel I, by up to about a semitone. A little detune thickens strings and gives a honky-tonk piano; centred, channel II sits exactly at its FEET.',
});
text(196, LY - 44, '−', 13);
text(196, LY + 44, '+', 13);
// RING MODULATOR
bracket(270, 512, STRIP_LABEL, 'RING MODULATOR', 10, true);
const RING_X = [282, 340, 398, 456, 514];
(
  [
    [
      'ring.attack',
      'ATTACK\nTIME',
      'black',
      'ATTACK TIME',
      0,
      (v: number) => fmtTime(ringTime(v)),
      'How long the ring modulator’s speed takes to rise from SPEED to its peak when a note starts. Works with DEPTH.',
    ],
    [
      'ring.decay',
      'DECAY\nTIME',
      'black',
      'DECAY TIME',
      0,
      (v: number) => fmtTime(ringTime(v)),
      'How long the speed takes to fall back from the peak to SPEED. Works with DEPTH.',
    ],
    [
      'ring.depth',
      'DEPTH',
      'grey',
      'DEPTH',
      0,
      pct,
      'How far ATTACK and DECAY sweep the ring modulator’s speed above SPEED, for swooping and pinging effects. Up, they do nothing. It starts again only on a key played after every key has been let go.',
    ],
    [
      'ring.speed',
      'SPEED',
      'white',
      'SPEED',
      3,
      (v: number) => fmtHz(ringHz(v)),
      'The ring modulator’s own oscillator speed: slow, it pulses like a tremolo; fast, it rings like a gong or a bell, with new pitches unrelated to the note.',
    ],
    [
      'ring.mod',
      'MODULATION',
      'grey',
      'MODULATION',
      0,
      pct,
      'How much ring modulation: up none, pulled down the most. It works on the sound of both channels.',
    ],
  ] as [string, string, keyof typeof CAP, string, number, (v: number) => string, string][]
).forEach(([id, lab, cap, name, def, fmt, help], i) => {
  text(RING_X[i], LT + (lab.includes('\n') ? -4 : 0), lab, 8.5);
  lever(id, RING_X[i], LY, cap, {
    min: 0,
    max: 10,
    def,
    module: 'fx',
    label: lab.replace('\n', ' '),
    name: `RING MOD ${name}`,
    fmt,
    help,
  });
});
// SUB OSCILLATOR
bracket(570, 852, STRIP_LABEL, 'SUB OSCILLATOR', 10, true);
const SUB_FN: ControlOption[] = [
  { v: 'sine', label: 'Sine' },
  { v: 'saw', label: 'Sawtooth' },
  { v: 'rsaw', label: 'Inverted sawtooth' },
  { v: 'square', label: 'Square' },
  { v: 'noise', label: 'Noise' },
  { v: 'ext', label: 'EXT' },
];
text(612, LT, 'FUNCTION', 8.5);
controls.push({
  id: 'sub.function',
  type: 'slide',
  x: 612,
  y: LY,
  w: 14,
  h: 84,
  orient: 'v',
  kind: 'enum',
  options: SUB_FN,
  def: 'sine',
  module: 'lfo',
  label: 'FUNCTION',
  name: 'SUB OSCILLATOR FUNCTION',
  labelPos: 'none',
  help: 'The sub oscillator’s wave: sine for vibrato and smooth wah, sawtooth for a falling sweep, inverted sawtooth for a rising one, square for a trill, or noise for breath and rasp. EXT takes the external input, which this app does not have, so here it switches the sub oscillator off.',
});
(['sine', 'saw', 'rsaw', 'sq'] as const).forEach((w, i) =>
  decor.push({ t: 'wave', x: 586, y: LY - 35 + i * 14, size: 7, shape: w, w: 1.2 })
);
text(586, LY + 21, 'NOISE', 6.5);
text(586, LY + 35, 'EXT', 6.5);
const SUB_X = [668, 726, 784, 842];
(
  [
    [
      'sub.speed',
      'SPEED',
      'white',
      3,
      (v: number) => fmtHz(subHz(v)),
      'The sub oscillator’s speed, from a slow wave to fast enough to buzz. It does not change noise or EXT.',
    ],
    [
      'sub.vco',
      'VCO',
      'white',
      0,
      pct,
      'How far the sub oscillator moves the pitch of both channels: vibrato, or a trill with the square. Up nothing, pulled down the most.',
    ],
    [
      'sub.vcf',
      'VCF',
      'green',
      0,
      pct,
      'How far it moves both filters: an automatic wah-wah. RESONANCE makes the wah stronger.',
    ],
    [
      'sub.vca',
      'VCA',
      'grey',
      0,
      pct,
      'How far it moves the volume: tremolo, or pulsing at speed.',
    ],
  ] as [string, string, keyof typeof CAP, number, (v: number) => string, string][]
).forEach(([id, lab, cap, def, fmt, help], i) => {
  text(SUB_X[i], LT, lab, 8.5);
  lever(id, SUB_X[i], LY, cap, {
    min: 0,
    max: 10,
    def,
    module: 'lfo',
    label: lab,
    name: `SUB OSCILLATOR ${lab}`,
    fmt,
    help,
  });
});
// I — FEET — II
const FEET: ControlOption[] = [
  { v: '16', label: "16'" },
  { v: '8', label: "8'" },
  { v: '5.33', label: "5⅓'" },
  { v: '4', label: "4'" },
  { v: '2.67', label: "2⅔'" },
  { v: '2', label: "2'" },
];
const FEET_SEMI: Record<string, number> = {
  '16': -12,
  '8': 0,
  '5.33': 7,
  '4': 12,
  '2.67': 19,
  '2': 24,
};
text(946, LT, 'I — FEET — II', 9.5);
[1, 2].forEach((c) => {
  controls.push({
    id: `ch${c}.feet`,
    type: 'slide',
    x: c === 1 ? 920 : 972,
    y: LY,
    w: 14,
    h: 84,
    orient: 'v',
    kind: 'enum',
    options: FEET,
    def: '8',
    module: 'osc',
    label: 'FEET',
    name: `FEET ${c === 1 ? 'I' : 'II'}`,
    labelPos: 'none',
    help: `Channel ${c === 1 ? 'I' : 'II'}’s octave, in organ footages: 8' is normal pitch, 16' an octave down, 4' and 2' one and two octaves up, 5⅓' and 2⅔' a fifth above 8' and 4'. It applies to a preset as well as the panel.`,
  });
});
["16'", "8'", "5⅓'", "4'", "2⅔'", "2'"].forEach((t, i) => text(946, LY - 35 + i * 14, t, 6.5));

// TONE SELECTOR: two rows of eleven presets, two memories and PANEL
const TONE_X0 = 1052;
const TONE_DX = 36;
const TONE_Y = [668, 714];
const ROW_PRESETS: [string, string, string][][] = [
  [
    ['string1', 'STRING\n1', CAP.yellow],
    ['string2', 'STRING\n2', CAP.yellow],
    ['brass1', 'BRASS\n1', CAP.red],
    ['flute', 'FLUTE', CAP.white],
    ['epiano', 'ELECTRIC\nPIANO', CAP.yellow],
    ['clav1', 'CLAVI-\nCHORD 1', CAP.yellow],
    ['harpsi1', 'HARPSI-\nCHORD 1', CAP.yellow],
    ['organ1', 'ORGAN\n1', CAP.white],
    ['guitar1', 'GUITAR\n1', CAP.yellow],
    ['funky1', 'FUNKY\n1', CAP.green],
    ['funky3', 'FUNKY\n3', CAP.green],
  ],
  [
    ['string3', 'STRING\n3', CAP.yellow],
    ['string4', 'STRING\n4', CAP.yellow],
    ['brass2', 'BRASS\n2', CAP.red],
    ['brass3', 'BRASS\n3', CAP.red],
    ['bass', 'BASS', CAP.yellow],
    ['clav2', 'CLAVI-\nCHORD 2', CAP.yellow],
    ['harpsi2', 'HARPSI-\nCHORD 2', CAP.yellow],
    ['organ2', 'ORGAN\n2', CAP.white],
    ['guitar2', 'GUITAR\n2', CAP.yellow],
    ['funky2', 'FUNKY\n2', CAP.green],
    ['funky4', 'FUNKY\n4', CAP.green],
  ],
];
const MEMORIES = [
  ['MEMORY\n1', 'MEMORY\n3'],
  ['MEMORY\n2', 'MEMORY\n4'],
];
text(TONE_X0 + 6.5 * TONE_DX, STRIP_LABEL, 'TONE SELECTOR', 10);
line(TONE_X0 - 18, STRIP_LABEL, TONE_X0 + 4.6 * TONE_DX, STRIP_LABEL);
line(TONE_X0 + 8.4 * TONE_DX, STRIP_LABEL, TONE_X0 + 13 * TONE_DX + 18, STRIP_LABEL);
[1, 2].forEach((c) => {
  const y = TONE_Y[c - 1];
  const ch = c === 1 ? 'I' : 'II';
  text(TONE_X0 - 30, y, ch, 11, { weight: 800 });
  text(TONE_X0 + 13 * TONE_DX + 30, y, ch, 11, { weight: 800 });
  // the memory buttons are printed: nothing is stored in them here
  MEMORIES[c - 1].forEach((m, k) => {
    const x = TONE_X0 + (11 + k) * TONE_DX;
    decor.push({
      t: 'rect',
      x: x - 16,
      y: y - 20,
      w: 32,
      h: 40,
      r: 3,
      fill: CAP.white,
      stroke: '#0008',
      sw: 1.2,
    });
    decor.push({
      t: 'text',
      x,
      y: y - 1,
      text: m,
      size: 7.5,
      anchor: 'middle',
      weight: 700,
      fill: '#1b1b1d',
    });
  });
  controls.push({
    id: `ch${c}.tone`,
    type: 'select',
    x: TONE_X0 + 6 * TONE_DX,
    y,
    w: 32,
    h: 40,
    lamp: 'amber',
    kind: 'enum',
    options: [
      ...ROW_PRESETS[c - 1].map(([v, cap, color], i) => ({
        v,
        label: cap.replace('-\n', '').replace('\n', ' '),
        x: TONE_X0 + i * TONE_DX,
        y,
        capColor: color,
        caption: cap,
      })),
      {
        v: 'panel',
        label: 'PANEL',
        x: TONE_X0 + 13 * TONE_DX,
        y,
        capColor: CAP.white,
        caption: 'PANEL',
      },
    ],
    def: 'panel',
    module: 'mode',
    label: `TONE SELECTOR ${ch}`,
    name: `TONE SELECTOR ${ch}`,
    labelPos: 'none',
    help: `Channel ${ch}’s voice: one of the eleven presets in this row, or PANEL for the programmable panel’s channel ${ch} sliders. Only one button per row is lit. The two MEMORY buttons recall the miniature panels under the cover; this app keeps sounds in the library instead, so they are printed only.`,
  });
});

// MIX, BRILLIANCE, RESONANCE
const MIX_X = [1594, 1652, 1710];
text(MIX_X[0], LT, 'MIX', 9);
text(MIX_X[1] + 29, LT, 'BRILLIANCE  RESONANCE', 8.5);
text(MIX_X[0], LY - 44, 'I', 11, { weight: 800 });
text(MIX_X[0], LY + 44, 'II', 11, { weight: 800 });
lever('mix.mix', MIX_X[0], LY, 'black', {
  min: 0,
  max: 10,
  def: 0,
  module: 'mixer',
  label: 'MIX',
  name: 'MIX I-II',
  fmt: (v) =>
    v < 0.3
      ? 'I only'
      : v > 9.7
        ? 'II only'
        : `I ${Math.round(100 - v * 10)} : II ${Math.round(v * 10)}`,
  help: 'Balances the two channels every key plays: at the top channel I only, at the bottom channel II only, in between both together. Two different sounds, one from each row, can be played as one.',
});
lever('global.brilliance', MIX_X[1], LY, 'green', {
  min: -5,
  max: 5,
  def: 0,
  module: 'filter',
  label: 'BRILLIANCE',
  name: 'BRILLIANCE',
  fmt: signed,
  help: 'Moves both filters of both channels together, presets included: pulled down the sound is brighter, pushed up more mellow. Centred is normal for every patch.',
});
lever('global.resonance', MIX_X[2], LY, 'red', {
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'RESONANCE',
  name: 'RESONANCE',
  fmt: pct,
  help: 'Adds resonance to both filters of both channels, presets included: up none, pulled down the most, for twang and wah. Works with BRILLIANCE.',
});
// TOUCH RESPONSE
const TR_X = [1800, 1858, 1916, 1974];
bracket(TR_X[0] - 12, TR_X[3] + 12, STRIP_LABEL, 'TOUCH RESPONSE', 10, true);
text(TR_X[0], LT, 'PITCHBEND', 7.5);
text(TR_X[1], LT, 'SPEED', 8.5);
text(TR_X[2], LT, 'VCO', 8.5);
text(TR_X[3], LT, 'VCF', 8.5);
text(TR_X[0], LY + 46, 'INITIAL', 7.5, { fill: DIM });
bracket(TR_X[1] - 10, TR_X[3] + 10, LY + 46, 'SUB OSC  AFTER', 7.5, false);
lever('touch.pitchbend', TR_X[0], LY, 'white', {
  min: 0,
  max: 10,
  def: 0,
  module: 'mod',
  label: 'PITCHBEND',
  name: 'TOUCH RESPONSE PITCHBEND',
  fmt: pct,
  help: 'Notes start below their pitch and slide up into it; the harder and faster the key, the further below. Up there is none. The app’s keyboard plays every key at one velocity; the sequencer can play softer and harder notes.',
});
(
  [
    ['touch.speed', 'SPEED', 'white', 'raises the sub oscillator’s speed'],
    ['touch.vco', 'VCO', 'white', 'adds sub-oscillator vibrato to that note'],
    ['touch.vcf', 'VCF', 'green', 'adds sub-oscillator wah to that note'],
  ] as [string, string, keyof typeof CAP, string][]
).forEach(([id, lab, cap, what], i) => {
  lever(id, TR_X[i + 1], LY, cap, {
    min: 0,
    max: 10,
    def: 0,
    module: 'mod',
    label: lab,
    name: `TOUCH RESPONSE ${lab} (after)`,
    fmt: pct,
    ui: true,
    help: `${NOT_PRESSURE} ${what}, key by key.`,
  });
});
// KEYBOARD CONTROL
const KC_X = [2066, 2124, 2182, 2240];
bracket(KC_X[0] - 12, KC_X[3] + 12, STRIP_LABEL, 'KEYBOARD CONTROL', 10, true);
text((KC_X[0] + KC_X[1]) / 2, LT - 6, 'BRILLIANCE', 7.5);
text((KC_X[2] + KC_X[3]) / 2 - 29, LT - 6, 'LEVEL', 7.5);
text((KC_X[2] + KC_X[3]) / 2 + 29, LT - 6, 'LEVEL', 7.5);
(
  [
    ['kbd.brillLow', 'LOW', 'green', 'BRILLIANCE LOW', 'brightness', 'lower', 'brighter', 'duller'],
    [
      'kbd.brillHigh',
      'HIGH',
      'green',
      'BRILLIANCE HIGH',
      'brightness',
      'upper',
      'brighter',
      'duller',
    ],
    ['kbd.levelLow', 'LOW', 'grey', 'LEVEL LOW', 'volume', 'lower', 'louder', 'quieter'],
    ['kbd.levelHigh', 'HIGH', 'grey', 'LEVEL HIGH', 'volume', 'upper', 'louder', 'quieter'],
  ] as [string, string, keyof typeof CAP, string, string, string, string, string][]
).forEach(([id, lab, cap, name, what, half, more, less], i) => {
  text(KC_X[i], LT + 6, lab, 7.5);
  lever(id, KC_X[i], LY, cap, {
    min: -5,
    max: 5,
    def: 0,
    module: 'mod',
    label: lab,
    name: `KEYBOARD CONTROL ${name}`,
    fmt: signed,
    help: `Balances the ${what} across the keyboard: pulled down, the ${half} part of the keyboard gets gradually ${more} towards its end; pushed up, ${less}. Centred, nothing changes. The middle of the keyboard is never affected.`,
  });
});
// VOLUME
text(2304, LT, 'VOLUME', 9.5);
controls.push({
  id: 'out.volume',
  type: 'knob',
  x: 2304,
  y: LY,
  r: 26,
  style: 'obxa',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  labelPos: 'none',
  fmt: pct,
  help: 'The level of all the outputs.',
});

// ── Performance panel (left of the keys) ──────────────────────────────────
const PY = 868; // the levers and knobs
text(78, 806, 'FOOT PEDAL\nSELECTOR', 8);
controls.push({
  id: 'pedal.select',
  type: 'select',
  x: 78,
  y: 860,
  w: 34,
  h: 22,
  capColor: CAP.grey,
  kind: 'enum',
  options: [
    { v: 'exp', label: 'EXP', x: 78, y: 852, capColor: CAP.grey, caption: 'EXP' },
    { v: 'wah', label: 'EXP/WAH', x: 78, y: 880, capColor: CAP.grey, caption: 'EXP/\nWAH' },
  ],
  def: 'exp',
  module: 'util',
  ui: true,
  label: 'FOOT PEDAL SELECTOR',
  labelPos: 'none',
  help: 'What the foot pedal does: EXP makes it a volume pedal, EXP/WAH a volume pedal that also sweeps both filters with resonance (wah-wah). This app has no foot pedal, so it changes nothing here.',
});
text(170, 806, 'SUSTAIN', 9);
lever('sustain.time', 170, PY, 'yellow', {
  min: 0,
  max: 10,
  def: 0,
  module: 'env',
  label: 'SUSTAIN',
  name: 'SUSTAIN',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(sustainTime(v))),
  help: 'How long notes die away after the key is let go, up to about 10 seconds, on top of each channel’s VCA R: pushed up short, pulled down long.',
});
text(236, 806, 'PORTAMENTO\nGLISSANDO', 7.5);
lever('porta.time', 236, PY, 'white', {
  min: 0,
  max: 10,
  def: 0,
  module: 'glide',
  label: 'PORTAMENTO / GLISSANDO',
  name: 'PORTAMENTO / GLISSANDO',
  fmt: (v) => (v <= 0 ? 'off' : `${fmtTime(portaTime(v))} / oct`),
  help: 'How long each voice takes to move from its last note to the new one, up to about 2 seconds an octave: a smooth slide (PORTAMENTO) or semitone steps (GLISSANDO), chosen by the rocker below. Pushed up there is none.',
});
text(332, 806, 'SPEED', 9);
text(414, 806, 'DEPTH', 9);
controls.push({
  id: 'trem.speed',
  type: 'knob',
  x: 332,
  y: PY - 8,
  r: 22,
  style: 'obxa',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'fx',
  label: 'SPEED',
  name: 'TREMOLO SPEED',
  labelPos: 'none',
  fmt: (v) => `${fmtHz(tremHz(v, false))} (tremolo) · ${fmtHz(tremHz(v, true))} (chorus)`,
  help: 'How fast the tremolo or chorus moves: about 5–20 Hz for tremolo, 0.5–5 Hz for chorus. Fastest fully clockwise.',
});
controls.push({
  id: 'trem.depth',
  type: 'knob',
  x: 414,
  y: PY - 8,
  r: 22,
  style: 'obxa',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'fx',
  label: 'DEPTH',
  name: 'TREMOLO DEPTH',
  labelPos: 'none',
  fmt: pct,
  help: 'How strong the tremolo or chorus is. Most fully clockwise.',
});
// the bottom row of rockers
const RY = 960;
rocker('sustain.fs', 60, RY, {
  module: 'env',
  ui: true,
  label: 'FOOT SW',
  name: 'SUSTAIN FOOT SWITCH',
  help: 'On, the foot switch turns sustain on and off. With no foot switch plugged in, as here, sustain is always on whichever way this is set.',
});
rocker('sustain.mode', 118, RY, {
  options: [
    { v: 'I', label: 'I' },
    { v: 'II', label: 'II' },
  ],
  def: 'I',
  module: 'env',
  ui: true,
  label: 'SUSTAIN I-II',
  name: 'SUSTAIN I-II',
  help: 'I: every note sustains on its own. II: a new note or chord cuts off the sustain of the last one. Only I is modelled here.',
});
rocker('porta.fs', 176, RY, {
  module: 'glide',
  ui: true,
  label: 'P/G FOOT SW',
  name: 'P/G FOOT SWITCH',
  help: 'On, the foot switch turns portamento or glissando on and off. With no foot switch plugged in, as here, it is always on whichever way this is set.',
});
rocker('porta.mode', 234, RY, {
  options: [
    { v: 'porta', label: 'Portamento' },
    { v: 'gliss', label: 'Glissando' },
  ],
  def: 'porta',
  module: 'glide',
  label: 'P/G',
  name: 'PORTAMENTO / GLISSANDO mode',
  help: 'Rocked back, PORTAMENTO: a continuous slide between notes. Rocked forward, GLISSANDO: the pitch steps through every semitone on the way, like a chromatic run.',
});
text(60, RY + 38, 'FOOT\nSW', 7, { fill: DIM });
text(118, RY + 38, 'I–II', 7, { fill: DIM });
text(176, RY + 38, 'FOOT\nSW', 7, { fill: DIM });
text(234, RY + 38, 'PORTA\nGLISS', 7, { fill: DIM });
bracket(46, 132, RY - 36, 'SUSTAIN', 7.5);
bracket(162, 248, RY - 36, 'P / G', 7.5);
// the tremolo / chorus rockers: one paddle block of three
decor.push({ t: 'rect', x: 316, y: RY - 34, w: 120, h: 68, r: 4, fill: '#111112' });
rocker('trem.tremolo', 340, RY, {
  module: 'fx',
  label: 'TREMOLO',
  name: 'TREMOLO',
  w: 30,
  h: 54,
  help: 'Sets the tremolo/chorus to its moderate-to-fast range (tremolo). It is heard while ON/OFF is on.',
});
rocker('trem.chorus', 376, RY, {
  module: 'fx',
  label: 'CHORUS',
  name: 'CHORUS',
  w: 30,
  h: 54,
  help: 'Sets the tremolo/chorus to its very slow range (chorus). With TREMOLO also down, the tremolo range wins.',
});
rocker('trem.on', 412, RY, {
  module: 'fx',
  label: 'ON/OFF',
  name: 'TREMOLO ON/OFF',
  w: 30,
  h: 54,
  help: 'Switches the tremolo or chorus on: the two sides’ levels swing and a short delay sweeps, like a rotary speaker in stereo, and the output drops slightly.',
});
text(340, RY + 44, 'TREMOLO', 6.5, { fill: DIM });
text(376, RY + 44, 'CHORUS', 6.5, { fill: DIM });
text(412, RY + 44, 'ON', 6.5, { fill: DIM });
bracket(300, 446, 786, 'TREMOLO / CHORUS', 8.5, true);

// ── Nameplate and ribbon ──────────────────────────────────────────────────
text(1490, 830, 'YAMAHA', 34, { weight: 800, spacing: 4, brand: true });
decor.push({
  t: 'rect',
  x: 820,
  y: 900,
  w: 1340,
  h: 34,
  r: 4,
  fill: '#121212',
  stroke: '#00000088',
  sw: 2,
});
text(1490, 960, 'RIBBON CONTROLLER', 8, { fill: DIM });

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const rowRects = (x0: number, x1: number): ViewRect[] => [R(x0, 66, x1, 252), R(x0, 300, x1, 500)];
const areas: Area[] = [
  {
    id: 'cover',
    label: 'Memory cover',
    module: 'util',
    keywords: 'memory panels block diagram store',
    rects: [R(40, 28, 624, 534)],
    help: 'A hinged cover with the block diagram of one channel printed on it. Under it are four miniature copies of a channel’s panel, MEMORY 1 to 4, set by hand with tiny sliders and recalled from the TONE SELECTOR. This app keeps sounds in the library instead, so the memories are not modelled.',
  },
  {
    id: 'vco',
    label: 'VCO',
    module: 'osc',
    keywords: 'oscillator square sawtooth pulse width pwm noise waveform',
    rects: rowRects(672, 1026),
    help: 'One oscillator per channel. Its sawtooth runs through a wave shape converter that also gives a square (with its own pulse-width modulator: SPEED, PWM and PW) and a sine. The two switches choose the square and the sawtooth into the filters, and NOISE adds white noise.',
  },
  {
    id: 'vcf',
    label: 'VCF',
    module: 'filter',
    keywords: 'filter cutoff resonance high-pass low-pass band-pass envelope il al',
    rects: rowRects(1068, 1600),
    help: 'A high-pass filter then a low-pass filter, each with its own resonance, so together they pass a band. Both follow the keyboard. The envelope beside them moves both cutoffs: from IL below the set cutoffs, up to AL above over A, back to the set cutoffs over D, and back to IL over R after the key is let go.',
  },
  {
    id: 'vca',
    label: 'VCA',
    module: 'amp',
    keywords: 'amplifier envelope adsr level volume sine',
    rects: rowRects(1641, 2073),
    help: 'Each channel’s amplifier, shaped by its own ADSR envelope. VCF LEVEL and the sine slider mix the filtered sound with a pure sine that skips the filters, and LEVEL is the channel’s volume.',
  },
  {
    id: 'touch',
    label: 'Touch response (panel)',
    module: 'mod',
    keywords: 'velocity initial after touch aftertouch pressure dynamics brilliance level',
    rects: rowRects(2098, 2330),
    help: 'How the way you play changes each channel. INITIAL acts on how hard and fast a key goes down: brighter and louder for a moment at the start of the note. AFTER acts on pressing harder once the key is down, which the app’s keyboard cannot do.',
  },
  {
    id: 'pitch',
    label: 'Pitch and detune',
    module: 'out',
    keywords: 'tune tuning coarse fine detune chorus honky',
    rects: [R(40, 560, 240, 776)],
    help: 'PITCH tunes the whole instrument: the outer ring coarse, the inner knob fine. DETUNE CH II moves channel II up or down against channel I, by up to a semitone, to thicken the sound.',
  },
  {
    id: 'ring',
    label: 'Ring modulator',
    module: 'fx',
    keywords: 'ring mod bell gong metallic clang swoop',
    rects: [R(250, 560, 540, 776)],
    help: 'Multiplies the sound of both channels by its own sine oscillator, which leaves sum and difference pitches: pulsing when slow, bells and gongs when fast. MODULATION sets how much; ATTACK, DECAY and DEPTH sweep its speed up and back at the start of each phrase.',
  },
  {
    id: 'sub',
    label: 'Sub oscillator',
    module: 'lfo',
    keywords: 'lfo vibrato wah tremolo trill modulation',
    rects: [R(560, 560, 870, 776)],
    help: 'A modulation oscillator shared by both channels. FUNCTION picks its wave and SPEED its rate; VCO, VCF and VCA set how far it moves the pitch (vibrato, trill), the filters (wah) and the volume (tremolo). Up does nothing, pulled down the most.',
  },
  {
    id: 'feet',
    label: 'Feet',
    module: 'osc',
    keywords: 'octave footage range transpose',
    rects: [R(890, 560, 1000, 776)],
    help: 'Each channel’s octave, in organ footages: 16’, 8’ (normal), 5⅓’, 4’, 2⅔’ and 2’. Setting the two channels differently stacks octaves or fifths.',
  },
  {
    id: 'tone',
    label: 'Tone selector',
    module: 'mode',
    keywords: 'preset patch memory panel strings brass organ piano bass funky',
    rects: [R(1012, 560, 1572, 776)],
    help: 'Two rows of buttons, one per channel. Each row picks that channel’s voice: one of eleven presets (strings, brass, flute, pianos, organs, guitars, funky), a memory, or PANEL for the sliders of the programmable panel. MIX then balances the two.',
  },
  {
    id: 'mix',
    label: 'Mix, brilliance and resonance',
    module: 'mixer',
    keywords: 'balance blend channels brightness tone',
    rects: [R(1572, 560, 1740, 776)],
    help: 'MIX balances channel I against channel II. BRILLIANCE brightens or mellows both channels at once and RESONANCE adds to both filters’ resonance, presets included: the quickest way to change a preset.',
  },
  {
    id: 'touchStrip',
    label: 'Touch response',
    module: 'mod',
    keywords: 'pitch bend velocity aftertouch pressure vibrato',
    rects: [R(1772, 560, 2002, 776)],
    help: 'PITCHBEND makes a hard key start flat and slide up. SPEED, VCO and VCF let pressure on a key speed up the sub oscillator and add its vibrato or wah to that note, which needs a keyboard that senses pressure.',
  },
  {
    id: 'kbdctl',
    label: 'Keyboard control',
    module: 'mod',
    keywords: 'key scaling key tracking balance brightness volume low high',
    rects: [R(2040, 560, 2266, 776)],
    help: 'Balances brightness and volume across the keyboard: each lever gradually brightens or darkens, or raises or lowers, its end of the keyboard, the low or the high. The middle is untouched.',
  },
  {
    id: 'volume',
    label: 'Volume',
    module: 'out',
    keywords: 'master level output',
    rects: [R(2272, 560, 2340, 776)],
    help: 'The overall volume.',
  },
  {
    id: 'performance',
    label: 'Sustain, portamento and foot pedal',
    module: 'glide',
    keywords: 'sustain portamento glissando glide foot switch pedal expression wah',
    rects: [R(40, 790, 300, 1000)],
    help: 'SUSTAIN lets notes ring on after the keys are let go. PORTAMENTO / GLISSANDO slides, or steps in semitones, between notes. The foot switch rockers choose what the foot switch controls, and the pedal selector what the foot pedal does; this app has neither pedal, so sustain and portamento are always on.',
  },
  {
    id: 'tremolo',
    label: 'Tremolo / chorus',
    module: 'fx',
    keywords: 'chorus tremolo rotary leslie stereo vibrato',
    rects: [R(300, 790, 630, 1000)],
    help: 'A stereo effect on the whole instrument: the two sides’ levels swing and a short delay sweeps, like a rotary speaker. TREMOLO and CHORUS choose a fast or very slow range, ON/OFF turns it on, and SPEED and DEPTH set it.',
  },
  {
    id: 'ribbon',
    label: 'Ribbon controller',
    module: 'mod',
    keywords: 'ribbon pitch bend glide string bend vibrato',
    rects: [R(800, 880, 2180, 970)],
    help: 'A felt strip above the keys: touch it anywhere and slide to bend every note, up to about an octave sharp to the right and much further flat to the left. Wherever you first touch is the starting point. The app has no ribbon, so it is drawn only.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const SUB_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { saw: 1 },
  rsaw: { rsaw: 1 },
  square: { sq: 1 },
};

/** One channel's panel values: its own sliders with PANEL lit, or the chosen preset's chart. */
function channelValues(v: ControlValues, c: number): Record<string, ControlValue> {
  const tone = String(v[`ch${c}.tone`]);
  const row = tone === 'panel' ? null : CS80_PRESETS[tone];
  return Object.fromEntries(
    PANEL_COLS.map((k, i): [PanelCol, ControlValue] => {
      if (!row) return [k, v[`ch${c}.${k}`]];
      const x = row[i];
      return [k, typeof x === 'boolean' ? (x ? 'on' : 'off') : x];
    })
  );
}

/** One channel's voice settings. */
function channel(v: ControlValues, c: number, gain: number): LayerParams {
  const p = channelValues(v, c);
  const n = (k: PanelCol): number => Number(p[k]);
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  // the global levers, on both filters of both channels
  const bright = num(v, 'global.brilliance') * 0.6;
  const resAdd = (num(v, 'global.resonance') / 10) * 0.15;
  // IL-AL-A-D-R on the ADSR: start IL below the set cutoff, peak AL above, sustain on the set cutoff
  const il = -(n('il') / 10) * IL_OCT;
  const al = (n('al') / 10) * AL_OCT;
  const span = al - il;
  const sus = span > 0 ? -il / span : 0;
  const resH = clamp((n('resH') / 10) * 0.85 + resAdd, 0, 0.98);
  // both stop short of self-oscillation (1), as the notes say
  const resL = clamp((n('resL') / 10) * 0.88 + resAdd, 0, 0.98);
  // resonance piles level onto the cutoff; the filtered path is turned down to match, as a player would
  const resComp = 1 / (1 + 1.4 * resL + 0.6 * resH);
  const hp = hpfHz(n('hpf')) * Math.pow(2, il + bright);
  const lp = lpfHz(n('lpf')) * Math.pow(2, il + bright);
  // PWM: the channel's own modulator sweeps the square's duty cycle
  route('lfo', 'pw1', (n('pwm') / 10) * 0.35);
  // the sine skips the filters, straight into the VCA
  route('osc2', 'vcaIn', (n('sine') / 10) * 0.35);
  // INITIAL touch: the key timing pulse, for a moment at the start of the note
  const ib = (n('initBrill') / 10) * 3;
  route('velp', 'cutoff', ib);
  route('velp', 'cutoffHp', ib);
  route('velp', 'amp', n('initLevel') / 10, 'env2');
  // TOUCH RESPONSE PITCHBEND (shared): a hard key starts flat
  route('velp', 'pitchAll', -(num(v, 'touch.pitchbend') / 10) * 7);
  // KEYBOARD CONTROL (shared): each end of the keyboard brighter or duller, louder or quieter
  const bl = num(v, 'kbd.brillLow') * 0.6,
    bh = num(v, 'kbd.brillHigh') * 0.6;
  route('kbdLo', 'cutoff', bl);
  route('kbdLo', 'cutoffHp', bl);
  route('kbdHi', 'cutoff', bh);
  route('kbdHi', 'cutoffHp', bh);
  route('kbdLo', 'amp', num(v, 'kbd.levelLow') * 0.16, 'env2');
  route('kbdHi', 'amp', num(v, 'kbd.levelHigh') * 0.16, 'env2');
  // the SUB OSCILLATOR (shared): EXT is off here; NOISE moves things with the noise generator itself
  const fn = String(v['sub.function']);
  const src = fn === 'noise' ? 'noise' : 'lfo2';
  if (fn !== 'ext') {
    const k = fn === 'noise' ? 0.3 : 1;
    route(src, 'pitchAll', 12 * Math.pow(num(v, 'sub.vco') / 10, 2) * k);
    const sf = (num(v, 'sub.vcf') / 10) * 4 * k;
    route(src, 'cutoff', sf);
    route(src, 'cutoffHp', sf);
    route(src, 'amp', (num(v, 'sub.vca') / 10) * 0.5 * k, 'env2');
  }
  const sustain = sustainTime(num(v, 'sustain.time'));
  const feet = FEET_SEMI[String(v[`ch${c}.feet`])] ?? 0;
  const semi = feet + (c === 2 ? num(v, 'tune.detune') / 5 : 0);
  const porta = portaTime(num(v, 'porta.time'));
  return {
    osc: [
      {
        level: 0.36,
        mix: { saw: p.saw === 'on' ? 1 : 0, pulse: p.square === 'on' ? 1 : 0 },
        pw: 0.5 + 0.04 * n('pw'),
        semi,
        kbd: true,
        syncTo: -1,
      },
      // the sine, heard only through its route into the VCA
      { level: 0, mix: { sine: 1 }, semi, kbd: true, syncTo: -1 },
    ],
    noise: { level: (n('noise') / 10) * 0.5, color: 'white' },
    ext: { level: 0 },
    hpf: {
      cutoff: hp,
      res: resH,
      envAmt: span,
      envSrc: 'env1',
      kbd: 1,
    },
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: lp,
      res: resL,
      envAmt: span,
      envSrc: 'env1',
      kbd: 1,
    },
    env1: { a: attTime(n('fa')), d: drTime(n('fd')), s: sus, r: drTime(n('fr')) },
    env2: {
      a: attTime(n('a')),
      d: drTime(n('d')),
      s: n('s') / 10,
      r: Math.max(drTime(n('r')), sustain),
    },
    vca: { envSrc: 'env2', bias: 0, gain: level10(n('level'), 1.1) * gain },
    lfo: { rate: pwmHz(n('speed')), mix: { tri: 1 }, keySync: false },
    lfo2: { rate: subHz(num(v, 'sub.speed')), mix: SUB_MIX[fn] ?? { sine: 1 }, keySync: false },
    glide: { time: porta, legato: false, steps: v['porta.mode'] === 'gliss' },
    trig: { retrig: true, drone: false, repeat: false },
    pulse: { time: PULSE_S },
    keyEnds: { mid: 66, span: 30 },
    routes,
    // VCF LEVEL: how much of the filtered sound reaches the VCA
    normals: { vcaIn: ['od', (n('vcfLevel') / 10) * resComp] },
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: num(v, 'tune.coarse') + num(v, 'tune.fine'),
  };
}

function toEngine(v: ControlValues): EngineParams {
  // MIX: an equal-power blend, channel I at the top
  const m = num(v, 'mix.mix') / 10;
  const g1 = Math.cos((m * Math.PI) / 2),
    g2 = Math.sin((m * Math.PI) / 2);
  const ch1 = channel(v, 1, g1);
  const ch2 = channel(v, 2, g2);
  const ringMod = num(v, 'ring.mod');
  const tremOn = v['trem.on'] === 'on' && (v['trem.tremolo'] === 'on' || v['trem.chorus'] === 'on');
  const chorus = v['trem.tremolo'] !== 'on';
  return {
    ...ch1,
    poly: { voices: 8, stack: 1, mono: false },
    layer: ch2,
    ...(ringMod > 0
      ? {
          ringMod: {
            hz: ringHz(num(v, 'ring.speed')),
            depth: ringMod / 10,
            env: {
              a: ringTime(num(v, 'ring.attack')),
              d: ringTime(num(v, 'ring.decay')),
              amt: (num(v, 'ring.depth') / 10) * 5,
            },
          },
        }
      : {}),
    tremolo: {
      on: tremOn,
      rate: tremHz(num(v, 'trem.speed'), chorus),
      depth: num(v, 'trem.depth') / 10,
    },
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const cs80: SynthDef & { version: number } = {
  id: 'cs-80',
  version: 1,
  name: 'CS-80',
  maker: 'Yamaha',
  year: 1977,
  heritage: 'Yamaha’s flagship polysynth, 1977–80',
  summary:
    'Eight analogue voices, each playing two complete channels at once: a VCO giving square, sawtooth and sine, noise, a high-pass then a low-pass filter moved by the IL-AL-A-D-R envelope, and a VCA, the sine skipping the filters. Each channel takes a preset or the programmable panel, and MIX blends them. Velocity touch, a sub oscillator, a ring modulator and a stereo tremolo/chorus act on the whole.',
  view: { w: VIEW_W, h: VIEW_H },
  theme: {
    panel: PANEL,
    panel2: '#1f1f1e',
    ink: INK,
    font: 'helv',
    cheeks: 'wood',
    cheekW: CHEEK,
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the VCA envelope',
    lfo: 'the PWM oscillator',
    lfo2: 'the sub oscillator',
    osc1: 'the VCO',
    osc2: 'the sine',
    velp: 'the key timing pulse',
    kbdLo: 'KEYBOARD CONTROL LOW',
    kbdHi: 'KEYBOARD CONTROL HIGH',
  },
};

export default cs80;
