/**
 * Black Corporation Deckard's Dream MK2: the definition. The layout is measured on the owner's photo
 * (`.context/app/synth-data/deckards-dream/raw/Deckards Dream Synthesizer.jpg`, 2317 × 834, local only), scaled to a
 * view 2000 wide, and takes its colours from it. The photo is of an MK1 panel, so the MK2's own controls (the SUSTAIN
 * slider and SUSTAIN I/II switch beside PORT/GLISS, S/H in place of EXT, the PANEL button) are placed as the manual's
 * panel graphic shows them (`raw/Deckard's Dream MK2 Manual 2.3.3.pdf`, p. 9). The owner's spec is
 * `.context/app/synth-data/deckards-dream/deckards-dream.synth.json`.
 *
 * Written straight into the app, starting from `defs/cs-80.ts`: the Deckard's Dream is a CS-80 voice without the
 * keyboard. Every note plays two layers, I and II, each a VCO giving square (with its own PWM LFO), sawtooth and sine,
 * white noise, a high-pass then a low-pass filter with their own resonance moved by the IL-AL-A-D-R envelope, and a
 * VCA with its own ADSR; the sine skips the filters. That is the engine's `layer` (t-132): layer I is the top-level
 * voice and layer II the layer. Control ids are the CS-80's wherever a control does the same job, as the spec's are, so
 * the family map between the two (`families/cs-80.ts`) is short.
 *
 * Unlike the CS-80 there are no preset rows on the panel: the sliders are the sound. The TONE SELECTOR's buttons and
 * screen step through stored presets and the settings menu, which this app keeps in the library instead, so they are
 * printed only. The menu's settings are taken at their defaults (spec, `parameters` with no panel control): poly, eight
 * voices, one card per voice, no drift, HPF MOD NORMAL, the sub oscillator 0.7–25 Hz and per voice, the PWM LFO
 * 0.7–70 Hz, attack up to 1 s, decay and release up to 15 s, TR PITCHBEND RANGE 1 semitone.
 *
 * Not modelled, because the app's keyboard has no pressure: the AFTER sliders of each layer's TOUCH RESPONSE and the
 * sub oscillator's VCO and VCF AFTER levers. SUSTAIN II is printed only.
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  FaderControl,
  LayerParams,
  LfoMix,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;
type FaderRest = Omit<
  FaderControl,
  'id' | 'type' | 'x' | 'y' | 'len' | 'orient' | 'kind' | 'labelPos'
> &
  Partial<Pick<FaderControl, 'len' | 'labelPos'>>;
/** A layer slider's settings: always 0–10, so no range. */
type SliderRest = Omit<FaderRest, 'cap' | 'min' | 'max' | 'def'> & { def?: number };

// ── Ranges and tapers (the manual's defaults for the TIME menu) ───────────
/** Attack, 1 ms to ATTACK TIME's default 1 s. */
const attTime = (v: number): number => 0.001 * Math.pow(1000, clamp(v, 0, 10) / 10);
/** Decay and release, 10 ms to DEC/REL TIME's default 15 s. */
const drTime = (v: number): number => 0.01 * Math.pow(1500, clamp(v, 0, 10) / 10);
const pwmHz = (v: number): number => expMap(v / 10, 0.7, 70);
const hpfHz = (v: number): number => expMap(v / 10, 20, 6000);
const lpfHz = (v: number): number => expMap(v / 10, 40, 16000);
/** IL and AL in octaves at full travel. */
const IL_OCT = 4;
const AL_OCT = 4;
const subHz = (v: number): number => expMap(v / 10, 0.7, 25);
/** The master SUSTAIN: a release for both layers, up to DEC/REL TIME's 15 s. */
const sustainTime = (v: number): number => 15 * Math.pow(v / 10, 2);
/** The app's glide takes the same time whatever the interval; the hardware's grows with it (notes). */
const portaTime = (v: number): number => 4 * Math.pow(v / 10, 2);
/** TR PITCHBEND RANGE, semitones (the menu's default). */
const TR_BEND = 1;
/** The velocity pulse behind TOUCH P.BEND, seconds: notes start flat and slide up quickly. */
const PULSE_S = 0.25;
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signed = (v: number): string =>
  Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

// ── Photo → view (photo px ÷ 1.1585) ──────────────────────────────────────
const VIEW_W = 2000;
const VIEW_H = 720;
const INK = '#eceeea';
const DIM = '#c3c6c2';
const PANEL = '#3b3e3d';
const CAP = {
  white: '#ecebe3',
  green: '#2f9b4f',
  red: '#d8484e',
  yellow: '#ecd85a',
  black: '#19191a',
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
/** A layer slider: 0–10, 10 at the top, a coloured cap; `top` / `bottom` are the printed ends. */
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
    len: 124,
    orient: 'v',
    pad: 8,
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
  text(x, y - 83, top, 10);
  text(x, y + 93, bottom, 10);
  if (name) text(x, y + 110, name, 11);
};
/** A slider of the master section, its range its own. */
const lever = (id: string, x: number, y: number, cap: keyof typeof CAP, rest: FaderRest): void => {
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len: 92,
    orient: 'v',
    pad: 8,
    ticks: 0,
    face: 'block',
    cap: CAP[cap],
    kind: 'cont',
    labelPos: 'none',
    ...rest,
  });
};
/** A layer's small waveform switch: off up, on down. */
const waveSwitch = (
  id: string,
  x: number,
  y: number,
  def: 'on' | 'off',
  name: string,
  help: string
): void => {
  controls.push({
    id,
    type: 'slide',
    x,
    y,
    w: 12,
    h: 34,
    orient: 'v',
    kind: 'enum',
    options: [
      { v: 'off', label: 'Off' },
      { v: 'on', label: 'On' },
    ],
    def,
    module: 'osc',
    label: name.split(' ')[0],
    name,
    labelPos: 'none',
    help,
  });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
// the rack ears' slots and screws
[155, 570].forEach((y) => {
  decor.push({ t: 'rect', x: 22, y: y - 10, w: 26, h: 20, r: 3, fill: '#151615' });
  decor.push({ t: 'rect', x: VIEW_W - 48, y: y - 10, w: 26, h: 20, r: 3, fill: '#151615' });
});
[
  [118, 85],
  [118, 640],
  [1874, 85],
  [1874, 640],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 9 }));
// the two printed frames, and the screws inside them
decor.push({ t: 'rect', x: 133, y: 22, w: 1725, h: 460, r: 14, fill: 'none', stroke: INK, sw: 2 });
decor.push({ t: 'rect', x: 133, y: 487, w: 1725, h: 228, r: 14, fill: 'none', stroke: INK, sw: 2 });
[
  [390, 44],
  [390, 414],
  [1110, 44],
  [1110, 414],
  [1576, 44],
  [1576, 414],
  [140, 250],
  [1847, 250],
  [153, 686],
  [826, 686],
  [1580, 668],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 6 }));

// ── Layers I (top) and II ─────────────────────────────────────────────────
const ROW_Y = [121, 356];
const VCO_X = [178, 241, 303, 366, 412, 477];
const VCF_X = [569, 631, 693, 756, 819, 881, 943, 1006, 1068];
const VCA_X = [1160, 1222, 1285, 1347, 1409, 1471, 1533];
const TCH_X = [1625, 1688, 1750, 1812];
const NOT_PRESSURE =
  'The app’s keyboard senses no pressure, so this does nothing here; on the hardware, aftertouch (pressing harder once the key is down)';
const VELOCITY =
  'The app’s keyboard plays every key at one velocity; the sequencer can play softer and harder notes.';
[1, 2].forEach((c) => {
  const y = ROW_Y[c - 1];
  const ch = c === 1 ? 'I' : 'II';
  const p = `ch${c}`;
  const nm = (n: string): string => `${n} ${ch}`;
  text(150, y + 6, ch, 14, { weight: 700 });
  // ── VCO ──
  slider(`${p}.speed`, VCO_X[0], y, 'SPEED', 'white', {
    top: 'FAST',
    bottom: 'SLOW',
    def: 0,
    module: 'lfo',
    label: 'SPEED',
    name: nm('PWM SPEED'),
    fmt: (v) => fmtHz(pwmHz(v)),
    help: `How fast the layer’s own PWM LFO sweeps the pulse wave’s width (with PWM up), 0.7 to 70 Hz.`,
  });
  slider(`${p}.pwm`, VCO_X[1], y, 'PWM', 'green', {
    top: '10',
    bottom: '0',
    def: 0,
    module: 'osc',
    label: 'PWM',
    name: nm('PWM'),
    fmt: pct,
    help: 'How far the PWM LFO sweeps the pulse wave’s width, from none at 0. Slow, it makes the square shimmer like a chorus.',
  });
  slider(`${p}.pw`, VCO_X[2], y, 'PW', 'green', {
    top: '90%',
    bottom: '50%',
    def: 0,
    module: 'osc',
    label: 'PW',
    name: nm('PW'),
    fmt: (v) => `${Math.round(50 + 4 * v)} %`,
    help: 'The pulse wave’s width, from a hollow 50 % square at the bottom to a thin, nasal 90 % pulse at the top. With PWM up, it is the width the sweep centres on.',
  });
  waveSwitch(
    `${p}.square`,
    VCO_X[3],
    y - 6,
    'off',
    nm('SQUARE'),
    'Switches the square (pulse) wave on, switch down, or off, switch up. SPEED, PWM and PW do nothing while it is off. With the sawtooth also on, the two add.'
  );
  waveSwitch(
    `${p}.saw`,
    VCO_X[4],
    y - 6,
    'on',
    nm('SAW'),
    'Switches the sawtooth wave on, switch down, or off, switch up: the brightest of the waves, the start of most strings and brass.'
  );
  text(VCO_X[3], y + 93, 'ON', 10);
  text(VCO_X[4], y + 93, 'ON', 10);
  decor.push({ t: 'wave', x: VCO_X[3], y: y + 110, size: 10, shape: 'sq', w: 1.4 });
  decor.push({ t: 'wave', x: VCO_X[4], y: y + 110, size: 10, shape: 'saw', w: 1.4 });
  slider(`${p}.noise`, VCO_X[5], y, 'NOISE', 'white', {
    top: '10',
    bottom: '0',
    def: 0,
    module: 'mixer',
    label: 'NOISE',
    name: nm('NOISE'),
    fmt: pct,
    help: 'White noise into the filters with the waves, for breath, wind and surf.',
  });
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
        help: 'The high-pass filter’s cutoff, at middle C: at LOW (the bottom) it is wide open, and raising it takes away the bottom of the sound. Both filters follow the keyboard.',
      },
    ],
    [
      'resH',
      'RESH',
      'filter',
      'red',
      'HIGH',
      '0',
      {
        def: 0,
        fmt: pct,
        help: 'Resonance of the high-pass filter: a peak at its cutoff, heard only when the filter is partly closed. It never self-oscillates.',
      },
    ],
    [
      'lpf',
      'LPF',
      'filter',
      'green',
      'HIGH',
      '0',
      {
        def: 10,
        fmt: (v) => fmtHz(lpfHz(v)),
        help: 'The low-pass filter’s cutoff, at middle C: at HIGH (the top) wide open, and lowering it makes the sound darker. Between the two filters lies a band the sound passes through.',
      },
    ],
    [
      'resL',
      'RESL',
      'filter',
      'red',
      'HIGH',
      '0',
      {
        def: 0,
        fmt: pct,
        help: 'Resonance of the low-pass filter: a peak at its cutoff that gives a twang or a wah when the filter moves. It never self-oscillates.',
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
        help: 'Initial Level: how far towards a thinner sound both filters start each note, the low-pass below its cutoff and the high-pass above its own. They open to the set cutoffs over A. At 0 it does nothing.',
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
        help: 'Attack Level: how far past their set cutoffs, towards a fuller sound, both filters open at the end of A, before closing back to the set cutoffs over D. Loosely, the envelope’s amount.',
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
        help: 'How long the filters take to move from IL to AL, 1 ms to 1 s. Nothing happens with IL and AL both at 0.',
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
        help: 'How long the filters take to come back from AL to the set cutoffs, 10 ms to 15 s.',
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
        help: 'How long the filters take to return to IL after the key is let go, 10 ms to 15 s. Heard only while the note still sounds, so with a long VCA R or SUSTAIN.',
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
      'white',
      '10',
      '0',
      {
        def: 10,
        fmt: pct,
        help: 'How much of the filtered sound (square, sawtooth and noise) goes into the VCA. At 0 only the sine is left.',
      },
    ],
    [
      'sine',
      '',
      'white',
      '10',
      '0',
      {
        def: 0,
        fmt: pct,
        help: 'How much sine wave goes into the VCA. The sine skips the filters, so a pure fundamental can sit under a filtered tone, or be the whole sound.',
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
        help: 'How long each note takes to reach full level, 1 ms to 1 s.',
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
        help: 'How long the level takes to fall from full to S, 10 ms to 15 s.',
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
        help: 'The level held while the key is down, after A and D.',
      },
    ],
    [
      'r',
      'R',
      'yellow',
      'LONG',
      'SHORT',
      {
        def: 2,
        fmt: (v) => fmtTime(drTime(v)),
        help: 'How long the note takes to die away after the key is let go, 10 ms to 15 s. The master SUSTAIN can make it longer still.',
      },
    ],
    [
      'level',
      'LEVEL',
      'white',
      '10',
      '0',
      {
        def: 8,
        fmt: pct,
        help: 'The layer’s volume: the highest level its VCA reaches. At 0 it is very quiet but not silent.',
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
        k === 'sine' ? 'SINE LEVEL' : ['a', 'd', 's', 'r'].includes(k) ? `VCA ${name}` : name
      ),
      help: '',
      ...rest,
    });
  });
  // the sine slider's name is the printed wave
  decor.push({ t: 'wave', x: VCA_X[1], y: y + 110, size: 10, shape: 'sine', w: 1.4 });
  // ── TOUCH RESPONSE ──
  const tch: [string, string, keyof typeof CAP, string][] = [
    ['initBrill', 'BRILLIANCE', 'green', 'INITIAL BRILLIANCE'],
    ['initLevel', 'LEVEL', 'white', 'INITIAL LEVEL'],
    ['afterBrill', 'BRILLIANCE', 'green', 'AFTER BRILLIANCE'],
    ['afterLevel', 'LEVEL', 'white', 'AFTER LEVEL'],
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
        ? `${NOT_PRESSURE} makes the layer ${brill ? 'brighter (both filters open)' : 'louder'}.`
        : `How much a harder key makes the layer ${brill ? 'brighter (both filters open)' : 'louder'}, for as long as the note sounds. At 0 velocity changes nothing. ${VELOCITY}`,
    });
  });
  text((TCH_X[0] + TCH_X[1]) / 2, y - 87, 'INITIAL', 8);
  text((TCH_X[2] + TCH_X[3]) / 2, y - 87, 'AFTER', 8);
});
// the section names between the two rows
bracket(VCO_X[0] - 28, VCO_X[5] + 28, 252, 'VCO', 12, false);
bracket(VCF_X[0] - 28, VCF_X[8] + 28, 252, 'VCF', 12, false);
bracket(VCA_X[0] - 28, VCA_X[6] + 28, 252, 'VCA', 12, false);
bracket(TCH_X[0] - 28, TCH_X[3] + 28, 252, 'TOUCH RESPONSE', 12, false);

// ── Master section ────────────────────────────────────────────────────────
const LY = 612; // the sliders' centre line
const LT = 524; // the names above them
const STRIP_LABEL = 505; // the section names
// PITCH and DETUNE CH II
bracket(166, 256, STRIP_LABEL, 'PITCH', 10, true);
text(181, LT, 'COARSE', 10);
text(241, LT, 'FINE', 10);
lever('tune.coarse', 181, LY, 'black', {
  min: -5,
  max: 5,
  def: 0,
  maxAt: 'bottom',
  module: 'out',
  label: 'COARSE',
  name: 'COARSE PITCH',
  fmt: (v) => fmtSemi(v),
  help: 'Tunes both layers down (pushed up) or up (pulled down) by up to about five semitones; it is detented at the centre for normal pitch.',
});
lever('tune.fine', 241, LY, 'black', {
  min: -1,
  max: 1,
  def: 0,
  maxAt: 'bottom',
  module: 'out',
  label: 'FINE',
  name: 'FINE PITCH',
  fmt: (v) => fmtSemi(v),
  help: 'Fine tuning of both layers, about a semitone either way; centred for normal pitch.',
});
text(302, STRIP_LABEL, 'DETUNE CH II', 10);
text(302, LT, '−', 13);
text(306, 700, '+', 13);
lever('tune.detune', 302, LY, 'white', {
  min: -5,
  max: 5,
  def: 0,
  maxAt: 'bottom',
  module: 'osc',
  label: 'DETUNE CH II',
  name: 'DETUNE CH II',
  fmt: (v) => fmtSemi(v / 5),
  help: 'Raises (pulled down, +) or lowers (pushed up, −) layer II against layer I, by up to about a semitone. A little detune thickens strings and brass; centred, layer II sits exactly at its FEET.',
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
text(437, STRIP_LABEL, 'I — FEET — II', 10);
[1, 2].forEach((c) => {
  controls.push({
    id: `ch${c}.feet`,
    type: 'slide',
    x: c === 1 ? 397 : 476,
    y: LY,
    w: 14,
    h: 124,
    orient: 'v',
    kind: 'enum',
    options: FEET,
    def: '8',
    module: 'osc',
    label: 'FEET',
    name: `FEET ${c === 1 ? 'I' : 'II'}`,
    labelPos: 'none',
    help: `Layer ${c === 1 ? 'I' : 'II'}’s octave, in organ footages: 8' is normal pitch, 16' an octave down, 4' and 2' one and two octaves up, 5⅓' and 2⅔' a fifth above 8' and 4'. To match a CS-80’s pitch from a 61-key MIDI keyboard, the manual sets it an octave lower.`,
  });
});
["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"].forEach((t, i) => text(437, 550 + i * 24.8, t, 8));
// SUB OSCILLATOR
bracket(547, 797, STRIP_LABEL, 'SUB OSCILLATOR', 10, true);
const SUB_FN: ControlOption[] = [
  { v: 'sine', label: 'Sine' },
  { v: 'saw', label: 'Saw' },
  { v: 'rsaw', label: 'Reverse saw' },
  { v: 'square', label: 'Square' },
  { v: 'rnd', label: 'RND' },
  { v: 'sh', label: 'S/H' },
];
text(595, LT, 'FUNCTION', 10);
controls.push({
  id: 'sub.function',
  type: 'slide',
  x: 595,
  y: LY,
  w: 14,
  h: 124,
  orient: 'v',
  kind: 'enum',
  options: SUB_FN,
  def: 'sine',
  module: 'lfo',
  label: 'FUNCTION',
  name: 'SUB OSCILLATOR FUNCTION',
  labelPos: 'none',
  help: 'The sub oscillator’s wave: sine for vibrato and smooth wah, saw for a rising sweep, reverse saw for a falling one, square for a trill, RND for a random wobble, or S/H for random steps at SPEED.',
});
(['sine', 'saw', 'rsaw', 'sq'] as const).forEach((w, i) =>
  decor.push({ t: 'wave', x: 553, y: 550 + i * 24.8, size: 9, shape: w, w: 1.3 })
);
text(553, 550 + 4 * 24.8, 'RND.', 8);
text(553, 550 + 5 * 24.8, 'S/H', 8);
const SUB_X = [657, 703, 748, 793];
(
  [
    [
      'sub.speed',
      'SPEED',
      'white',
      3,
      (v: number) => fmtHz(subHz(v)),
      'The sub oscillator’s speed, 0.7 to 25 Hz: the lower the slider, the faster. For S/H it is how often a new random step comes; RND it does not change.',
    ],
    [
      'sub.vco',
      'VCO',
      'white',
      0,
      pct,
      'How far the sub oscillator moves the pitch of both layers: vibrato, or a trill with the square. At the top nothing, pulled down the most.',
    ],
    [
      'sub.vcf',
      'VCF',
      'green',
      0,
      pct,
      'How far it moves both layers’ filters: an automatic wah-wah. RESO makes the wah stronger.',
    ],
    [
      'sub.vca',
      'VCA',
      'white',
      0,
      pct,
      'How far it moves the volume of both layers: tremolo, or pulsing at speed.',
    ],
  ] as [string, string, keyof typeof CAP, number, (v: number) => string, string][]
).forEach(([id, lab, cap, def, fmt, help], i) => {
  text(SUB_X[i], LT, lab, 10);
  lever(id, SUB_X[i], LY, cap, {
    min: 0,
    max: 10,
    def,
    maxAt: 'bottom',
    module: 'lfo',
    label: lab,
    name: `SUB OSCILLATOR ${lab}`,
    fmt,
    help,
  });
});
// MIX, BRIL., RESO.
text(855, STRIP_LABEL, 'MIX', 10);
text(855, LT, 'I', 11, { weight: 700 });
text(857, 700, 'II', 11, { weight: 700 });
text(902, STRIP_LABEL, 'BRIL.', 10);
text(948, STRIP_LABEL, 'RESO.', 10);
lever('mix.mix', 855, LY, 'black', {
  min: 0,
  max: 10,
  def: 0,
  maxAt: 'bottom',
  module: 'mixer',
  label: 'MIX',
  name: 'MIX I-II',
  fmt: (v) =>
    v < 0.3
      ? 'I only'
      : v > 9.7
        ? 'II only'
        : `I ${Math.round(100 - v * 10)} : II ${Math.round(v * 10)}`,
  help: 'Crossfades the two layers every note plays: at the top layer I only, at the centre both equally, at the bottom layer II only.',
});
lever('global.brilliance', 902, LY, 'green', {
  min: -5,
  max: 5,
  def: 0,
  maxAt: 'bottom',
  module: 'filter',
  label: 'BRIL.',
  name: 'BRILLIANCE',
  fmt: signed,
  help: 'Moves every filter of both layers together: pulled down the sound is brighter, pushed up more mellow. Centred, it changes nothing.',
});
lever('global.resonance', 948, LY, 'red', {
  min: 0,
  max: 10,
  def: 0,
  maxAt: 'bottom',
  module: 'filter',
  label: 'RESO.',
  name: 'RESONANCE',
  fmt: pct,
  help: 'Adds resonance to every filter of both layers: at the top none, pulled down the most, for twang and wah.',
});
// TOUCH RESPONSE
const TR_X = [1011, 1056, 1101, 1148];
bracket(TR_X[0] - 8, TR_X[3] + 8, STRIP_LABEL, 'TOUCH RESPONSE', 10, true);
text(TR_X[0], LT, 'P.BEND', 10);
text(TR_X[1], LT, 'SPEED', 10);
text(TR_X[2], LT, 'VCO', 10);
text(TR_X[3], LT, 'VCF', 10);
text(TR_X[0], 683, 'INITIAL', 9);
bracket(TR_X[1] - 6, TR_X[3] + 6, 683, 'SUB OSC', 9, false);
text(TR_X[2], 700, 'AFTER', 9);
lever('touch.pitchbend', TR_X[0], LY, 'white', {
  min: 0,
  max: 10,
  def: 0,
  maxAt: 'bottom',
  module: 'mod',
  label: 'P.BEND',
  name: 'TOUCH P.BEND',
  fmt: pct,
  help: `Notes start below their pitch and slide quickly up into it; the harder the key, the further below, up to a semitone. At the top there is none. ${VELOCITY}`,
});
lever('touch.speed', TR_X[1], LY, 'white', {
  min: 0,
  max: 10,
  def: 0,
  maxAt: 'bottom',
  module: 'mod',
  label: 'SPEED',
  name: 'TOUCH SPEED',
  fmt: pct,
  help: `How much a harder key speeds up the sub oscillator for that note. At the top there is none. ${VELOCITY}`,
});
(
  [
    ['touch.vco', 'VCO', 'white', 'adds sub-oscillator vibrato to that note'],
    ['touch.vcf', 'VCF', 'green', 'adds sub-oscillator wah to that note'],
  ] as [string, string, keyof typeof CAP, string][]
).forEach(([id, lab, cap, what], i) => {
  lever(id, TR_X[i + 2], LY, cap, {
    min: 0,
    max: 10,
    def: 0,
    maxAt: 'bottom',
    module: 'mod',
    label: lab,
    name: `TOUCH ${lab} (after)`,
    fmt: pct,
    ui: true,
    help: `${NOT_PRESSURE} ${what}, key by key.`,
  });
});
// KEYBOARD CONTROL
const KC_X = [1210, 1256, 1302, 1348];
bracket(KC_X[0] - 10, KC_X[3] + 4, STRIP_LABEL, 'KEYBOARD CONTROL', 10, true);
text((KC_X[0] + KC_X[1]) / 2, LT - 2, 'BRILLIANCE', 9);
text(KC_X[0], LT + 14, 'LOW', 9);
text(KC_X[1], LT + 14, 'HIGH', 9);
text(KC_X[2], LT - 2, 'LEVEL', 9);
text(KC_X[2], LT + 14, 'LOW', 9);
text(KC_X[3], LT - 2, 'LEVEL', 9);
text(KC_X[3], LT + 14, 'HIGH', 9);
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
    ['kbd.levelLow', 'LOW', 'white', 'LEVEL LOW', 'volume', 'lower', 'louder', 'quieter'],
    ['kbd.levelHigh', 'HIGH', 'white', 'LEVEL HIGH', 'volume', 'upper', 'louder', 'quieter'],
  ] as [string, string, keyof typeof CAP, string, string, string, string, string][]
).forEach(([id, lab, cap, name, what, half, more, less], i) => {
  lever(id, KC_X[i], LY, cap, {
    min: -5,
    max: 5,
    def: 0,
    maxAt: 'bottom',
    module: 'mod',
    label: lab,
    name: `KEYBOARD CONTROL ${name}`,
    fmt: signed,
    help: `Balances the ${what} across the keyboard: pulled down, the ${half} part of the keyboard gets gradually ${more} towards its end; pushed up, ${less}. Centred, nothing changes, and the middle of the keyboard is never affected.`,
  });
});
// PORTAMENTO / GLISSANDO and SUSTAIN (the MK2's slider and switch beside it)
const PG_X = 1410;
const SUS_X = 1476;
text(PG_X, STRIP_LABEL, 'PORT/GLISS', 9);
text(SUS_X, STRIP_LABEL, 'SUSTAIN', 9);
[PG_X, SUS_X].forEach((x) => {
  text(x, LT, 'LONG', 9);
  text(x, 664, 'SHORT', 9);
});
lever('porta.time', PG_X, 596, 'white', {
  len: 80,
  min: 0,
  max: 10,
  def: 0,
  module: 'glide',
  label: 'PORT/GLISS',
  name: 'PORTAMENTO / GLISSANDO',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  help: 'How long each voice takes to move from its last note to the new one: a smooth slide, or semitone steps, as the P/G switch below says. LONG at the top. With the switch at its centre there is no glide at all.',
});
lever('sustain.time', SUS_X, 596, 'white', {
  len: 80,
  min: 0,
  max: 10,
  def: 0,
  module: 'env',
  label: 'SUSTAIN',
  name: 'SUSTAIN',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(sustainTime(v))),
  help: 'The master sustain: lengthens the release of both layers at once, up to about 15 seconds, whatever their VCA R sliders say. LONG at the top, SHORT (off) at the bottom.',
});
controls.push({
  id: 'porta.mode',
  type: 'slide',
  x: PG_X,
  y: 692,
  w: 28,
  h: 12,
  orient: 'h',
  kind: 'enum',
  options: [
    { v: 'porta', label: 'P' },
    { v: 'off', label: 'Off' },
    { v: 'gliss', label: 'G' },
  ],
  def: 'porta',
  module: 'glide',
  label: 'P/G',
  name: 'P / G',
  labelPos: 'none',
  help: 'Left (P), PORTAMENTO: a smooth slide between notes. Right (G), GLISSANDO: the pitch steps through every semitone on the way. At the centre, notes change at once, whatever PORT/GLISS says.',
});
text(PG_X - 24, 692, 'P', 10);
text(PG_X + 24, 692, 'G', 10);
controls.push({
  id: 'sustain.mode',
  type: 'slide',
  x: SUS_X,
  y: 692,
  w: 30,
  h: 12,
  orient: 'h',
  kind: 'enum',
  options: [
    { v: 'I', label: 'I' },
    { v: 'II', label: 'II' },
  ],
  def: 'I',
  module: 'env',
  ui: true,
  label: 'SUSTAIN I / II',
  name: 'SUSTAIN I / II',
  labelPos: 'none',
  help: 'I: every note sustains and releases on its own. II: new notes cut off the release of the last ones, as on the CS-80, for a legato line over held chords. Only I is modelled here.',
});
text(SUS_X - 22, 692, 'I', 10);
text(SUS_X + 24, 692, 'II', 10);

// TONE SELECTOR: the screen and its buttons, printed only
text(1562, STRIP_LABEL, 'TONE SELECTOR', 10);
decor.push({
  t: 'rect',
  x: 1503,
  y: 527,
  w: 118,
  h: 46,
  r: 3,
  fill: '#0d0e0e',
  stroke: '#000',
  sw: 1,
});
text(1532, 540, 'PRESET', 6, { fill: DIM });
text(1532, 556, 'PNL', 14, { fill: '#f4f4f0', weight: 700 });
text(1592, 540, 'VOICES', 6, { fill: DIM });
text(1592, 556, '8', 12, { fill: '#f4f4f0', weight: 700 });
(
  [
    ['UP', 1518, 632],
    ['DOWN', 1547, 632],
    ['ENTER', 1576, 632],
    ['CANCEL', 1604, 632],
    ['SHIFT', 1518, 668],
    ['PANEL', 1547, 668],
  ] as [string, number, number][]
).forEach(([t, x, y]) => {
  text(x, y - 18, t, 6.5);
  decor.push({ t: 'circle', x, y, r: 7, fill: '#141414', stroke: '#000', sw: 1 });
});
// VOLUME, PHONES and POWER
text(1692, STRIP_LABEL, 'VOLUME', 10);
controls.push({
  id: 'out.volume',
  type: 'knob',
  x: 1692,
  y: 580,
  r: 32,
  style: 'obxa',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  labelPos: 'none',
  fmt: pct,
  help: 'The level of the AUDIO OUT and the headphones.',
});
text(1800, STRIP_LABEL, 'PHONES', 10);
decor.push({ t: 'circle', x: 1800, y: 545, r: 19, fill: '#9a9c9a', stroke: '#2a2a2a', sw: 2 });
decor.push({ t: 'circle', x: 1800, y: 545, r: 8, fill: '#111' });
text(1800, 588, 'POWER', 10);
decor.push({
  t: 'rect',
  x: 1780,
  y: 610,
  w: 40,
  h: 58,
  r: 4,
  fill: '#0e0e0e',
  stroke: '#000',
  sw: 2,
});
decor.push({ t: 'rect', x: 1788, y: 618, w: 24, h: 42, r: 2, fill: '#1d1d1d' });
// the nameplate
text(1700, 668, 'DECKARD’S DREAM MK2', 13, { weight: 800, spacing: 1, brand: true });
text(1700, 688, '8-VOICE ANALOGUE SYNTHESIZER', 9, { brand: true });
text(1700, 703, 'BY BLACK CORPORATION', 9, { brand: true });

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const rowRects = (x0: number, x1: number): ViewRect[] => [R(x0, 28, x1, 244), R(x0, 262, x1, 478)];
const areas: Area[] = [
  {
    id: 'vco',
    label: 'VCO',
    module: 'osc',
    keywords: 'oscillator square sawtooth pulse width pwm noise waveform',
    rects: rowRects(150, 510),
    help: 'One oscillator per layer, giving a square (with its own PWM LFO: SPEED, PWM and PW), a sawtooth and a sine. The two switches put the square and the sawtooth into the filters, and NOISE adds white noise.',
  },
  {
    id: 'vcf',
    label: 'VCF',
    module: 'filter',
    keywords: 'filter cutoff resonance high-pass low-pass band-pass envelope il al',
    rects: rowRects(540, 1098),
    help: 'A 12 dB high-pass filter then a 12 dB low-pass filter, each with its own resonance, so together they pass a band. Both follow the keyboard. The IL-AL-A-D-R envelope beside them starts each note thinner (IL), opens past the set cutoffs (AL) over A, settles back to them over D, and returns to IL over R.',
  },
  {
    id: 'vca',
    label: 'VCA',
    module: 'amp',
    keywords: 'amplifier envelope adsr level volume sine',
    rects: rowRects(1130, 1562),
    help: 'Each layer’s amplifier, shaped by its own ADSR envelope. VCF LEVEL and the sine slider mix the filtered sound with a pure sine that skips the filters, and LEVEL is the layer’s volume.',
  },
  {
    id: 'touch',
    label: 'Touch response (layers)',
    module: 'mod',
    keywords: 'velocity initial after touch aftertouch pressure dynamics brilliance level',
    rects: rowRects(1596, 1842),
    help: 'How the way you play changes each layer. INITIAL acts on velocity: a harder key is brighter and louder. AFTER acts on aftertouch, pressing harder once the key is down, which the app’s keyboard cannot do.',
  },
  {
    id: 'pitch',
    label: 'Pitch and detune',
    module: 'out',
    keywords: 'tune tuning coarse fine detune chorus',
    rects: [R(150, 494, 330, 712)],
    help: 'COARSE and FINE tune both layers, by about five semitones and one. DETUNE CH II moves layer II up or down against layer I, by up to a semitone, to thicken the sound.',
  },
  {
    id: 'feet',
    label: 'Feet',
    module: 'osc',
    keywords: 'octave footage range transpose',
    rects: [R(370, 494, 505, 712)],
    help: 'Each layer’s octave, in organ footages: 16’, 8’ (normal), 5⅓’, 4’, 2⅔’ and 2’. Setting the two layers differently stacks octaves or fifths.',
  },
  {
    id: 'sub',
    label: 'Sub oscillator',
    module: 'lfo',
    keywords: 'lfo vibrato wah tremolo trill modulation random sample hold',
    rects: [R(530, 494, 815, 712)],
    help: 'A modulation oscillator for both layers, its own for each voice. FUNCTION picks its wave and SPEED its rate; VCO, VCF and VCA set how far it moves the pitch (vibrato, trill), the filters (wah) and the volume (tremolo). At the top they do nothing, pulled down the most.',
  },
  {
    id: 'mix',
    label: 'Mix, brilliance and resonance',
    module: 'mixer',
    keywords: 'balance blend layers brightness tone crossfade',
    rects: [R(830, 494, 972, 712)],
    help: 'MIX crossfades layer I and layer II. BRIL. brightens or mellows both layers at once and RESO. adds to every filter’s resonance: the quickest way to change a whole patch.',
  },
  {
    id: 'touchStrip',
    label: 'Touch response',
    module: 'mod',
    keywords: 'pitch bend velocity aftertouch pressure vibrato',
    rects: [R(990, 494, 1170, 712)],
    help: 'P.BEND makes a hard key start flat and slide up. SPEED lets a hard key speed up the sub oscillator for that note. VCO and VCF let aftertouch add the sub oscillator’s vibrato or wah to a note, which needs a keyboard that senses pressure.',
  },
  {
    id: 'kbdctl',
    label: 'Keyboard control',
    module: 'mod',
    keywords: 'key scaling key tracking balance brightness volume low high',
    rects: [R(1190, 494, 1370, 712)],
    help: 'Balances brightness and volume across the keyboard: each slider gradually brightens or darkens, or raises or lowers, its end of the keyboard, the low or the high. The middle is untouched.',
  },
  {
    id: 'performance',
    label: 'Portamento, glissando and sustain',
    module: 'glide',
    keywords: 'portamento glissando glide sustain release slide legato',
    rects: [R(1380, 494, 1495, 712)],
    help: 'PORT/GLISS sets how long notes take to slide, or step in semitones, from one to the next, and the P/G switch picks which (or neither, at its centre). SUSTAIN lengthens the release of both layers at once; the I/II switch sets whether new notes cut off released ones.',
  },
  {
    id: 'tone',
    label: 'Tone selector',
    module: 'mode',
    keywords: 'preset patch memory bank settings menu panel display',
    rects: [R(1500, 494, 1630, 700)],
    help: 'The screen and buttons step through 1,152 stored presets in nine banks, save them, and open the settings menu (SHIFT + CANCEL). PANEL plays the sliders as they are set. This app keeps sounds in the library and plays the panel, so they are printed only.',
  },
  {
    id: 'volume',
    label: 'Volume',
    module: 'out',
    keywords: 'master level output headphones power',
    rects: [R(1650, 494, 1840, 650)],
    help: 'VOLUME sets the AUDIO OUT and the headphones. The PHONES jack and the POWER switch sit beside it.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const SUB_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { saw: 1 },
  rsaw: { rsaw: 1 },
  square: { sq: 1 },
  sh: { sh: 1 },
};

/** One layer's voice settings. */
function layer(v: ControlValues, c: number, gain: number): LayerParams {
  const n = (k: string): number => num(v, `ch${c}.${k}`);
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  // BRIL. and RESO., on every filter of both layers
  const bright = num(v, 'global.brilliance') * 0.6;
  const resAdd = (num(v, 'global.resonance') / 10) * 0.15;
  // IL-AL-A-D-R on the ADSR: start IL towards thinner, peak AL towards fuller, sustain on the set cutoffs
  const il = -(n('il') / 10) * IL_OCT;
  const al = (n('al') / 10) * AL_OCT;
  const span = al - il;
  const sus = span > 0 ? -il / span : 0;
  const resH = clamp((n('resH') / 10) * 0.85 + resAdd, 0, 0.98);
  // neither self-oscillates (1), as the manual says
  const resL = clamp((n('resL') / 10) * 0.88 + resAdd, 0, 0.98);
  // resonance piles level onto the cutoff; the filtered path is turned down to match, as a player would
  const resComp = 1 / (1 + 1.4 * resL + 0.6 * resH);
  // HPF MOD NORMAL: the high-pass envelope moves the other way in frequency, so the band narrows and widens together
  const hp = hpfHz(n('hpf')) * Math.pow(2, -il + bright);
  const lp = lpfHz(n('lpf')) * Math.pow(2, il + bright);
  // PWM: the layer's own LFO sweeps the pulse width
  route('lfo', 'pw1', (n('pwm') / 10) * 0.35);
  // the sine skips the filters, straight into the VCA
  route('osc2', 'vcaIn', (n('sine') / 10) * 0.35);
  // INITIAL touch: velocity, for the whole note
  const ib = (n('initBrill') / 10) * 3;
  route('vel', 'cutoff', ib);
  route('vel', 'cutoffHp', ib);
  route('vel', 'amp', n('initLevel') / 10, 'env2');
  // TOUCH P.BEND (shared): a hard key starts flat by up to TR PITCHBEND RANGE
  route('velp', 'pitchAll', -(num(v, 'touch.pitchbend') / 10) * TR_BEND);
  // KEYBOARD CONTROL (shared): each end of the keyboard brighter or duller, louder or quieter
  const bl = num(v, 'kbd.brillLow') * 0.6,
    bh = num(v, 'kbd.brillHigh') * 0.6;
  route('kbdLo', 'cutoff', bl);
  route('kbdLo', 'cutoffHp', bl);
  route('kbdHi', 'cutoff', bh);
  route('kbdHi', 'cutoffHp', bh);
  route('kbdLo', 'amp', num(v, 'kbd.levelLow') * 0.16, 'env2');
  route('kbdHi', 'amp', num(v, 'kbd.levelHigh') * 0.16, 'env2');
  // the SUB OSCILLATOR (shared): RND moves things with the noise generator, as the CS-80's NOISE position does
  const fn = String(v['sub.function']);
  const src = fn === 'rnd' ? 'noise' : 'lfo2';
  const k = fn === 'rnd' ? 0.3 : 1;
  route(src, 'pitchAll', 12 * Math.pow(num(v, 'sub.vco') / 10, 2) * k);
  const sf = (num(v, 'sub.vcf') / 10) * 4 * k;
  route(src, 'cutoff', sf);
  route(src, 'cutoffHp', sf);
  route(src, 'amp', (num(v, 'sub.vca') / 10) * 0.5 * k, 'env2');
  // TOUCH SPEED (shared): a hard key speeds the sub oscillator, up to two octaves
  if (fn !== 'rnd') route('vel', 'lfo2Rate', (num(v, 'touch.speed') / 10) * 2);
  const sustain = sustainTime(num(v, 'sustain.time'));
  const feet = FEET_SEMI[String(v[`ch${c}.feet`])] ?? 0;
  const semi = feet + (c === 2 ? num(v, 'tune.detune') / 5 : 0);
  const glide = v['porta.mode'] === 'off' ? 0 : portaTime(num(v, 'porta.time'));
  return {
    osc: [
      {
        level: 0.36,
        mix: { saw: v[`ch${c}.saw`] === 'on' ? 1 : 0, pulse: v[`ch${c}.square`] === 'on' ? 1 : 0 },
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
      envAmt: -span,
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
    // SUSTAIN lets the whole note die away slowly, so the filters' release stretches with the VCA's
    env1: {
      a: attTime(n('fa')),
      d: drTime(n('fd')),
      s: sus,
      r: Math.max(drTime(n('fr')), sustain),
    },
    env2: {
      a: attTime(n('a')),
      d: drTime(n('d')),
      s: n('s') / 10,
      r: Math.max(drTime(n('r')), sustain),
    },
    vca: { envSrc: 'env2', bias: 0, gain: level10(n('level'), 1.1) * gain },
    lfo: { rate: pwmHz(n('speed')), mix: { tri: 1 }, keySync: false },
    lfo2: { rate: subHz(num(v, 'sub.speed')), mix: SUB_MIX[fn] ?? { sine: 1 }, keySync: false },
    glide: { time: glide, legato: false, steps: v['porta.mode'] === 'gliss' },
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
  // MIX: an equal-power crossfade, layer I at the top
  const m = num(v, 'mix.mix') / 10;
  const g1 = Math.cos((m * Math.PI) / 2),
    g2 = Math.sin((m * Math.PI) / 2);
  return {
    ...layer(v, 1, g1),
    poly: { voices: 8, stack: 1, mono: false },
    layer: layer(v, 2, g2),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const deckardsDream: SynthDef & { version: number } = {
  id: 'deckards-dream',
  version: 1,
  name: 'Deckard’s Dream',
  maker: 'Black Corporation',
  year: 2020,
  heritage: 'Black Corporation’s CS-80-inspired module, MK2 2020',
  summary:
    'Eight analogue voices without a keyboard, each playing two layers at once: a VCO giving square, sawtooth and sine, noise, a high-pass then a low-pass filter moved by the IL-AL-A-D-R envelope, and a VCA, the sine skipping the filters. MIX crossfades the layers. Velocity, a sub oscillator, keyboard control, portamento or glissando and a master sustain act on both.',
  view: { w: VIEW_W, h: VIEW_H },
  theme: {
    panel: PANEL,
    panel2: '#2e3130',
    ink: INK,
    font: 'din',
    cheeks: 'none',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // Init is already the Default Saw: layer I's sawtooth alone (MIX at the top), its filters open, its loudness a gate.
  defaultPatch: {
    checklist: [
      {
        title: 'Start from the panel, and set the volume and the tuning',
        module: 'out',
        why: 'Press PANEL, so the sliders as they are set make the sound rather than a stored preset. VOLUME at 7 is the level every patch here assumes, and COARSE and FINE at their centre detents keep it at concert pitch.',
        controls: ['out.*', 'tune.coarse', 'tune.fine'],
      },
      {
        title: 'Hear layer I alone, with nothing on top',
        module: 'mixer',
        why: 'Every note plays two layers, I and II, each a whole synth voice. MIX pushed all the way up plays layer I alone. DETUNE CH II at the centre keeps layer II in tune for later. P/G on P with PORT/GLISS all the way down, SUSTAIN all the way down, and the sub oscillator’s depths and the touch response levers all the way up, so there is no slide, no hold and no wobble.',
        controls: ['mix.*', 'tune.detune', 'sustain.*', 'porta.*', 'sub.*', 'touch.*'],
      },
      {
        title: 'Set layer I to the sawtooth alone',
        module: 'osc',
        why: 'The saw switch down (on), the square switch up (off), FEET I at 8′: the buzzy wave with every harmonic. PWM, PW, SPEED, NOISE and the sine slider all the way down, so the saw is the only sound.',
        controls: [
          'ch1.feet',
          'ch1.saw',
          'ch1.square',
          'ch1.pwm',
          'ch1.pw',
          'ch1.speed',
          'ch1.noise',
          'ch1.sine',
        ],
      },
      {
        title: 'Open layer I’s filters all the way',
        module: 'filter',
        why: 'HPF I all the way down lets all the bass through, LPF I all the way up lets all the treble through, and both resonance sliders all the way down. With IL, AL and the VCF envelope sliders down, the filters do not move on each note, and INITIAL BRILLIANCE down keeps velocity off them.',
        controls: [
          'ch1.hpf',
          'ch1.resH',
          'ch1.lpf',
          'ch1.resL',
          'ch1.il',
          'ch1.al',
          'ch1.fa',
          'ch1.fd',
          'ch1.fr',
          'ch1.vcfLevel',
          'ch1.initBrill',
        ],
      },
      {
        title: 'Make layer I’s loudness a plain gate',
        module: 'amp',
        why: 'The VCA envelope: A and D all the way down start each note at once, S all the way up holds it at full while the key is down, and a short R stops it soon after you let go. LEVEL I at 8. INITIAL LEVEL down, so how hard you play makes no difference.',
        controls: ['ch1.a', 'ch1.d', 'ch1.s', 'ch1.r', 'ch1.level', 'ch1.initLevel'],
      },
      {
        title: 'Set layer II to match, ready for later patches',
        module: 'osc',
        why: 'Layer II is not heard while MIX is all the way up. Set it the same way, so it is ready when a patch brings it in.',
        controls: ['ch2.*'],
      },
      {
        title: 'Set the overall controls to change nothing',
        module: 'filter',
        why: 'BRIL. and the KEYBOARD CONTROL sliders at their centres change nothing, and RESO. all the way up adds no resonance.',
        controls: ['global.*', 'kbd.*'],
        listen:
          'play a chord: a bright, steady buzz on every note, starting the moment you press and stopping when you let go.',
      },
    ],
    values: {},
  },
  toEngine,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the VCA envelope',
    lfo: 'the PWM LFO',
    lfo2: 'the sub oscillator',
    osc1: 'the VCO',
    osc2: 'the sine',
    vel: 'velocity',
    velp: 'the velocity pulse',
    kbdLo: 'KEYBOARD CONTROL LOW',
    kbdHi: 'KEYBOARD CONTROL HIGH',
  },
};

export default deckardsDream;
