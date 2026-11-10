/**
 * Roland JP-8080: the definition (D1). Positions are measured on the owner's straight-on photo of the rack unit
 * (`.context/app/synth-data/jp-8080/raw/Roland JP 8080.jpg`, local only, 3712 × 2057), scaled to 1800 × 997, and
 * written in those pixels, which are the view units; the rack ears are inside the view. The owner's spec is
 * `.context/app/synth-data/jp-8080/jp-8080.synth.json` (the JP-8080 Owner's Manual, JP-8080_e3, also in `raw/`).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/super-gemini.ts` (two
 * parts split or layered) and `defs/deepmind-12d.ts` (the effects engine). Unlike the Super Gemini, the JP-8080 has one
 * set of knobs and sliders: PANEL SELECT picks whether they edit the Upper or the Lower patch. So every patch control
 * is here twice at the same spot, `up.*` and `lo.*`, each shown while PANEL SELECT names its part, and each keeps its
 * value while hidden. KEY MODE plays the PANEL SELECT part alone (SINGLE), both on every key (DUAL, the engine's
 * `layer`) or Lower below C4 and Upper from it (SPLIT, `layer.split`), with the Upper patch at the top level.
 *
 * A patch: OSC 1 in seven waveforms, each with its own CONTROL 1 and 2 (the super saw, feedback osc, triangle mod and
 * filtered noise are the engine's t-217 waves); OSC 2 in four, with RANGE, FINE/WIDE, SYNC and RING; cross mod from OSC
 * 2 to OSC 1; a pitch envelope (the engine's third envelope) and LFO 1 on both oscillators, OSC 2 or the cross mod
 * depth; OSC BALANCE; a 12 dB state-variable filter or, at -24 dB, the ladder (low-pass), the series high-pass (high-pass)
 * or both (band-pass); the filter envelope (envelope 1) and amp envelope (envelope 2); LFO 1 as tremolo or auto pan; LFO
 * 2 on the mod wheel; then the tone control, multi-effect and delay on the effects engine (`audio/dm-fx.ts`).
 *
 * The manual gives no times, rates or frequencies (every control is 0-127 or -64 to +63, `not_in_source`), so the
 * readouts' physical units are this app's estimates, as are the tone control's frequencies. Not modelled, drawn with
 * help that says so: the Voice Modulator and the external inputs (EXT silences OSC 2), RPS, motion control, morphing
 * (velocity and control assign; the JP-8080 has no other velocity response), performance memory and the menus behind
 * the display other than the two effect types. Twisting and the two freeze phases play dry.
 */
import type {
  ArpMode,
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  FaderControl,
  FxParams,
  FxSlot,
  KnobScale,
  LayerParams,
  LfoMix,
  OscMix,
  OscParams,
  ShowCondition,
  SynthDef,
  SynthModule,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type Part = 'up' | 'lo';
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand' | 'hw'>>;
type Common = {
  module: SynthModule;
  name: string;
  help: string;
  show?: ShowCondition | ShowCondition[];
  ui?: boolean;
  label?: string;
};

// ── Ranges and tapers (estimates: the manual gives 0-127 only) ─────────────
/** Envelope stages: 2 ms to 10 s over 0-127. */
const envTime = (v: number): number => 0.002 * Math.pow(5000, clamp(v, 0, 127) / 127);
/** LFO 1 and LFO 2: 0.05-40 Hz. */
const lfoHz = (v: number): number => expMap(v / 127, 0.05, 40);
/** LFO 1 FADE: up to 5 s. */
const fadeTime = (v: number): number => 5 * Math.pow(v / 127, 2);
const cutoffHz = (v: number): number => expMap(v / 127, 20, 20000);
const portaTime = (v: number): number => 5 * Math.pow(v / 127, 3);
/** -64..+63 as −1..1, centre zero. */
const bi = (v: number): number => (v < 0 ? v / 64 : v / 63);
const signed = (v: number): string => (v > 0 ? `+${v}` : String(v));
const plain = (v: number): string => String(Math.round(v));

// ── Photo → view ──────────────────────────────────────────────────────────
const VIEW_W = 1800;
const VIEW_H = 997;
const PANEL = '#46507f';
const BOX = '#232428';
const INK = '#ecebe6';
const TITLE = '#efb544';
const BLUE = '#3696c2';
const SUB = '#58a9d6';
const CAP = '#f1efe8';
const BTN = '#38393d';
const KEY = '#ece9df';

const controls: Control[] = [];
const decor: Decor[] = [];
const NOT_HERE = 'Not modelled here.';
const SHOW: Record<Part, ShowCondition> = {
  up: { id: 'perf.panel', eq: 'upper' },
  lo: { id: 'perf.panel', eq: 'lower' },
};
const PART_NAME: Record<Part, string> = { up: 'UPPER', lo: 'LOWER' };

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
    fill: INK,
    ...rest,
  });
};
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 4): void => {
  decor.push({ t: 'rect', x, y, w, h, r, fill });
};
/** A dark section box with its title in amber. */
const box = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  title?: string,
  ty = y0 + 11
): void => {
  rect(x0, y0, x1 - x0, y1 - y0, BOX, 5);
  if (title) text((x0 + x1) / 2, ty, title, 13, { fill: TITLE, weight: 700, spacing: 0.5 });
};
/** A button drawn but not wired to anything (the hardware's edit and memory keys). */
const dummyButton = (x: number, y: number, w = 40, h = 22, fill = BTN): void => {
  rect(x - w / 2, y - h / 2, w, h, fill, 3);
};
const wave = (x: number, y: number, shape: WaveShape, size = 9): void => {
  decor.push({ t: 'wave', x, y, size, shape, stroke: INK, w: 1.3 });
};
const LED = (x: number, y: number, litWhen?: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push(
    litWhen
      ? { t: 'led', x, y, r: 4, color: 'red', litWhen }
      : { t: 'led', x, y, r: 4, color: 'red' }
  );
};

// ── Control helpers ───────────────────────────────────────────────────────
type KnobRest = Common & { scale?: KnobScale } & (
    | { kind: 'cont'; min: number; max: number; def: number; fmt?: (v: number) => string }
    | { kind: 'enum'; options: ControlOption[]; def: string }
  );
const knob = (id: string, x: number, y: number, rest: KnobRest, r = 19): void => {
  const step = rest.kind === 'cont' ? { step: 1 } : {};
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r,
    style: 'vcs3',
    cap: CAP,
    labelPos: 'none',
    label: rest.name,
    ...step,
    ...rest,
  });
};
type FaderRest = Common & Partial<Pick<FaderControl, 'min' | 'max' | 'def' | 'fmt'>>;
const fader = (id: string, x: number, rest: FaderRest, y = 528, len = 112): void => {
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len,
    orient: 'v',
    pad: 8,
    ticks: 11,
    face: 'block',
    cap: '#2c2d31',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    step: 1,
    fmt: plain,
    labelPos: 'none',
    label: rest.name,
    ...rest,
  });
};
/** A dark push button with a lamp in its cap. */
const button = (
  id: string,
  x: number,
  y: number,
  rest: Common &
    ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string }),
  cap = BTN
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
    w: 40,
    h: 22,
    labelPos: 'none',
    label: rest.name,
    capColor: cap,
    capLamp: kind !== 'enum',
    ...more,
    ...value,
  });
};
/**
 * One of the JP-8080's LED rows: the button beside it steps through the settings and an LED lights for the one chosen.
 * Each patch has its own, so the LEDs here are the control (a small lamp per option, at its LED), the button beside
 * them decor.
 */
const ledSelect = (
  id: string,
  options: { v: string; x: number; y: number; label: string; hide?: boolean }[],
  def: string,
  rest: Common & { offValue?: string }
): void => {
  const first = options.find((o) => !o.hide) ?? options[0];
  controls.push({
    id,
    type: 'select',
    x: first.x,
    y: first.y,
    w: 11,
    h: 11,
    lamp: 'red',
    labelPos: 'none',
    label: rest.name,
    kind: 'enum',
    def,
    ...rest,
    options: options.map((o) =>
      o.hide ? { v: o.v, label: o.label, hide: true } : { v: o.v, label: o.label, x: o.x, y: o.y }
    ),
  });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
decor.push({ t: 'rect', x: 0, y: 8, w: 70, h: 980, r: 6, fill: '#414a76' });
decor.push({ t: 'rect', x: 1730, y: 8, w: 70, h: 980, r: 6, fill: '#414a76' });
for (const y of [150, 358, 636, 842]) {
  decor.push({ t: 'circle', x: 47, y, r: 13, fill: '#c9a77a' });
  decor.push({ t: 'circle', x: 1748, y, r: 13, fill: '#c9a77a' });
}
text(207, 65, 'Roland', 34, { weight: 700, brand: true, spacing: -0.5 });
text(384, 65, 'JP-8080', 34, { weight: 500, fill: TITLE, brand: true, spacing: 1 });

// power and memory card, drawn only
box(145, 90, 272, 213, 'POWER', 99);
dummyButton(192, 160, 34, 46, '#1d1e21');
text(240, 154, 'ON', 8.5, { anchor: 'start' });
text(240, 166, 'OFF', 8.5, { anchor: 'start' });
rect(290, 92, 160, 120, '#2a2b30', 4);
rect(305, 118, 130, 32, '#151618', 3);
text(470, 96, 'MEMORY\nCARD', 7.5);
text(470, 200, 'S2M-5/\nS4M-5', 7.5);

// ── Section boxes and their print ─────────────────────────────────────────
box(480, 87, 1032, 214, 'EFFECTS', 99);
text(568, 110, '__TONE CONTROL__', 11);
text(895, 110, '________DELAY________', 11);
for (const [x, t] of [
  [518, 'BASS'],
  [612, 'TREBLE'],
  [803, 'TIME'],
  [893, 'FEEDBACK'],
  [985, 'LEVEL'],
] as const)
  text(x, 128, t, 10);
text(710, 119, 'MULTI-FX\nLEVEL', 10);
for (const [x, t] of [
  [710, 'ENSEMBLE'],
  [803, 'TIME'],
  [893, 'FEEDBACK'],
  [985, 'LEVEL'],
] as const)
  text(x, 211, t, 8, { fill: SUB, hw: true });

// the Voice Modulator and external input blocks, in blue
rect(1038, 86, 258, 132, BLUE, 6);
rect(1300, 86, 346, 132, BLUE, 6);
text(1200, 98, 'VOICE MODULATOR', 12, { weight: 700 });
text(1071, 100, 'ON', 9.5);
text(1069, 160, 'VOICE MOD\nSEND', 8.5);
text(1160, 128, 'CONTROL 1', 10);
text(1250, 128, 'CONTROL 2', 10);
text(1470, 96, 'EXTERNAL INPUT', 12, { weight: 700 });
text(1392, 110, '— SIG/LIMITER —', 7.5);
decor.push({ t: 'circle', x: 1346, y: 110, r: 4, fill: '#9bc9dc' });
decor.push({ t: 'circle', x: 1438, y: 110, r: 4, fill: '#9bc9dc' });
text(1350, 127, 'INST  LOWER', 8.5);
text(1442, 127, 'VOCAL  UPPER', 8.5);
text(1556, 118, 'REAR', 8.5, { anchor: 'start' });
text(1556, 132, 'FRONT (LIT)', 8.5, { anchor: 'start' });
for (const x of [1350, 1442]) {
  text(x - 26, 202, 'MIN', 7);
  text(x + 26, 202, 'MAX', 7);
}
decor.push({ t: 'circle', x: 1594, y: 166, r: 30, fill: '#18191b' });
decor.push({ t: 'circle', x: 1594, y: 166, r: 13, fill: '#060607', stroke: '#c9c39a', sw: 2 });

box(145, 223, 335, 410, 'LFO 1', 233);
box(343, 223, 1032, 410);
text(452, 233, 'OSC 1', 13, { fill: TITLE, weight: 700 });
text(835, 233, 'OSC 2', 13, { fill: TITLE, weight: 700 });
box(1038, 223, 1430, 410, 'FILTER', 232);
box(1437, 223, 1645, 410, 'AMP', 231);
box(145, 425, 335, 622, 'MODULATION (LFO 2)', 435);
box(343, 425, 440, 622, 'PORTAMENTO', 435);
box(448, 425, 770, 622, 'OSC COMMON', 435);
box(778, 425, 1005, 622, 'PITCH ENVELOPE', 435);
box(1013, 425, 1365, 622, 'FILTER ENVELOPE', 435);
box(1372, 425, 1645, 622, 'AMP ENVELOPE', 435);
box(145, 630, 520, 735, 'CONTROL', 644);
box(580, 643, 870, 735);
text(645, 653, 'PANEL SELECT', 10.5, { fill: TITLE, weight: 700 });
text(790, 653, 'KEY MODE', 10.5, { fill: TITLE, weight: 700 });
box(145, 755, 368, 918, 'VOLUME', 764);
box(1312, 645, 1650, 925, 'ARPEGGIATOR/RPS', 656);

// LFO 1 print
text(195, 260, 'WAVEFORM', 9.5);
dummyButton(192, 283);
const LFO1_LED_Y = [250, 271, 292, 314];
(['tri', 'saw', 'sq', 'noise'] as WaveShape[]).forEach((s, i) => wave(270, LFO1_LED_Y[i], s, 9));
text(187, 333, 'RATE', 10);
text(277, 333, 'FADE', 10);

// OSC 1 print
const OSC1_LEFT = [
  [251, 'SUPER SAW'],
  [273, 'TRIANGLE MOD'],
  [295, 'NOISE'],
  [317, 'FEEDBACK OSC'],
] as const;
for (const [y, t] of OSC1_LEFT) text(396, y, t, 9, { anchor: 'start' });
(['pulse', 'saw', 'tri'] as WaveShape[]).forEach((s, i) => wave(533, [254, 275, 297][i], s, 9));
text(385, 354, 'WAVEFORM', 9.5);
dummyButton(385, 376);
text(473, 333, 'CONTROL 1', 10);
text(570, 333, 'CONTROL 2', 10);
text(640, 260, 'RING', 10);
text(744, 260, 'SYNC', 10);

// OSC 2 print
rect(818, 254, 40, 13, BLUE, 2);
text(838, 260, 'EXT', 9, { weight: 700 });
text(902, 260, 'WAVEFORM', 9.5);
dummyButton(902, 281);
(['pulse', 'saw', 'tri'] as WaveShape[]).forEach((s, i) => wave(980, [239, 261, 283][i], s, 9));
text(971, 305, 'NOISE', 9, { anchor: 'start' });
text(698, 328, 'RANGE', 10);
text(790, 333, 'FINE/WIDE', 10);
text(885, 333, 'CONTROL 1', 10);
text(980, 333, 'CONTROL 2', 10);
for (const [x, y, t] of [
  [692, 342, '0'],
  [664, 352, '-12'],
  [722, 352, '+12'],
  [660, 395, '-24'],
  [726, 395, '+24'],
] as const)
  text(x, y, t, 7.5);
text(662, 406, '-WIDE', 7, { fill: TITLE });
text(724, 406, '+WIDE', 7, { fill: TITLE });

// filter and amp print
text(1096, 241, 'CUTOFF\nFREQ', 9.5);
text(1165, 246, 'RESONANCE', 9.5);
text(1262, 247, '-12dB\n-24dB (LIT)', 8.5);
text(1329, 257, 'TYPE', 10);
dummyButton(1329, 280);
for (const [y, t] of [
  [258, 'HPF'],
  [280, 'BPF'],
  [302, 'LPF'],
] as const)
  text(1394, y, t, 9, { anchor: 'start' });
text(1270, 331, 'KEY FOLLOW', 9.5);
text(1357, 331, 'LFO 1 DEPTH', 9.5);
text(1096, 408, 'VOCAL MIX', 8, { fill: SUB, hw: true });
text(1165, 408, 'RESONANCE', 8, { fill: SUB, hw: true });
text(1495, 256, 'PAN', 10);
dummyButton(1495, 277);
text(1556, 268, 'AUTO', 9, { anchor: 'start' });
text(1556, 290, 'MANUAL', 9, { anchor: 'start' });
text(1505, 331, 'LFO 1 DEPTH', 9.5);
text(1610, 331, 'LEVEL', 9.5);
text(1495, 300, 'VOCAL HOLD', 7.5, { fill: SUB, hw: true });

// LFO 2 and portamento print
text(195, 460, 'DEPTH\nSELECT', 9.5);
dummyButton(192, 488);
for (const [y, t] of [
  [466, 'PITCH'],
  [488, 'FILTER'],
  [510, 'AMP'],
] as const)
  text(257, y, t, 9, { anchor: 'start' });
text(187, 541, 'RATE', 10);
text(277, 541, 'DEPTH', 10);
text(187, 617, 'NOISE CUTOFF', 7.5, { fill: SUB, hw: true });
text(277, 617, 'NOISE LEVEL', 7.5, { fill: SUB, hw: true });
text(390, 466, 'ON', 10);
text(387, 541, 'TIME', 10);
text(387, 617, 'GATE THRESHOLD', 7.5, { fill: SUB, hw: true });

// OSC COMMON print
text(520, 452, '_OSC SHIFT_', 9.5);
text(490, 466, '-OCT', 9.5);
text(548, 466, '+OCT', 9.5);
rect(470, 477, 40, 22, BTN, 3);
rect(528, 477, 40, 22, BTN, 3);
text(642, 463, 'LFO 1 & ENV\nDESTINATION', 9);
dummyButton(640, 488);
for (const [y, t] of [
  [467, 'OSC 1+2'],
  [488, 'OSC 2'],
  [509, 'X-MOD'],
] as const)
  text(704, y, t, 9, { anchor: 'start' });
text(492, 541, 'OSC BALANCE', 9.5);
text(603, 541, 'X-MOD DEPTH', 9.5);
text(712, 541, 'LFO 1 DEPTH', 9.5);
text(462, 610, 'OSC 1', 7.5);
text(522, 610, 'OSC 2', 7.5);
text(492, 618, 'ROBOT PITCH', 7.5, { fill: SUB, hw: true });
text(603, 618, 'ROBOT CONTROL', 7.5, { fill: SUB, hw: true });
text(712, 618, 'ROBOT LEVEL', 7.5, { fill: SUB, hw: true });

// envelope print: DEPTH, A, D, S, R over each slider, its number below
const ENV_X = {
  pDepth: 830,
  pA: 905,
  pD: 964,
  fDepth: 1065,
  fA: 1142,
  fD: 1200,
  fS: 1259,
  fR: 1317,
  aA: 1424,
  aD: 1482,
  aS: 1540,
  aR: 1598,
};
for (const [x, t] of [
  [ENV_X.pDepth, 'DEPTH'],
  [ENV_X.pA, 'A'],
  [ENV_X.pD, 'D'],
  [ENV_X.fDepth, 'DEPTH'],
  [ENV_X.fA, 'A'],
  [ENV_X.fD, 'D'],
  [ENV_X.fS, 'S'],
  [ENV_X.fR, 'R'],
  [ENV_X.aA, 'A'],
  [ENV_X.aD, 'D'],
  [ENV_X.aS, 'S'],
  [ENV_X.aR, 'R'],
] as const)
  text(x, 452, t, 9.5);
[
  ENV_X.pDepth,
  ENV_X.pA,
  ENV_X.pD,
  ENV_X.fDepth,
  ENV_X.fA,
  ENV_X.fD,
  ENV_X.fS,
  ENV_X.fR,
  ENV_X.aA,
  ENV_X.aD,
  ENV_X.aS,
  ENV_X.aR,
].forEach((x, i) => text(x, 616, String(i + 1), 8, { fill: SUB, hw: true }));

// CONTROL print
text(305, 664, '____SOLO SW____', 9.5);
text(452, 652, '_MORPHING_', 9.5);
for (const [x, t] of [
  [193, 'MONO'],
  [250, 'LEGATO'],
  [308, 'UNISON'],
  [365, 'VELOCITY'],
] as const)
  text(x, 682, t, 9);
text(422, 676, 'VELOCITY\nASSIGN', 8.5);
text(480, 676, 'CONTROL\nASSIGN', 8.5);

// PANEL SELECT / KEY MODE print
text(617, 681, 'LOWER', 9.5);
text(674, 681, 'UPPER', 9.5);
text(674, 724, 'VOICE MOD', 7.5);
for (const [y, t] of [
  [674, 'SINGLE'],
  [696, 'DUAL'],
  [717, 'SPLIT'],
] as const)
  text(810, y, t, 9, { anchor: 'start' });

// the display, the memory and edit keys: drawn only
rect(885, 645, 245, 88, '#1a1c1a', 4);
text(423, 773, 'PRE-\nVIEW', 9);
dummyButton(423, 803);
text(462, 766, 'PERFORM\nPATCH SELECT', 8, { anchor: 'start' });
dummyButton(480, 803);
text(452, 842, '_GROUP_', 9);
text(423, 856, 'DOWN', 9);
text(480, 856, 'UP', 9);
dummyButton(423, 880);
dummyButton(480, 880);
const BANK_X = [565, 645, 724, 804, 884, 964, 1043, 1123];
const BANK = ['PFM COMMON', 'VOICE MOD', 'PART', 'PATCH', 'MIDI', 'SETUP', 'INIT/UTIL', 'SCOPE'];
text(530, 783, 'BANK >', 8);
text(530, 857, 'NUMBER >', 8);
BANK_X.forEach((x, i) => {
  text(x, 783, String(i + 1), 11);
  text(x, 857, String(i + 1), 11);
  dummyButton(x, 805, 62, 22, KEY);
  dummyButton(x, 878, 62, 22, KEY);
  text(x, 829, BANK[i], 7.5);
});
text(560, 902, 'RPS > USER · CARD', 7.5);
text(880, 902, 'MOTION > USER · CARD 1 · CARD 2 · SET A · SET B', 7.5);
for (const [x, y, t, fill] of [
  [1202, 682, 'DEC', BTN],
  [1262, 682, 'INC', BTN],
  [1202, 785, 'EDIT', BTN],
  [1262, 785, 'WRITE', '#7a3226'],
  [1202, 859, 'SHIFT', BTN],
  [1262, 859, 'EXIT', BTN],
] as const) {
  text(x, y, t, 9.5);
  dummyButton(x, y + 21, 40, 22, fill);
}
text(1232, 905, 'DEMO', 8.5);

// ARPEGGIATOR/RPS print
text(1350, 684, 'ON', 9.5);
text(1350, 749, 'HOLD', 9.5);
text(1442, 683, 'TEMPO', 10);
text(1527, 716, 'MODE', 9.5);
dummyButton(1527, 740);
text(1527, 834, 'RANGE', 9.5);
for (const [y, t] of [
  [706, 'UP'],
  [728, 'DOWN'],
  [750, 'RND'],
  [772, 'RPS'],
  [826, '1 OCT'],
  [848, '2 OCT'],
  [870, '3 OCT'],
  [892, '4 OCT'],
] as const)
  text(1590, y, t, 9, { anchor: 'start' });
text(1352, 800, 'MOTION\nCONTROL', 8.5, { anchor: 'start' });
text(1440, 836, 'REC', 8.5);
for (const [x, y, t] of [
  [1442, 699, '120'],
  [1405, 726, '90'],
  [1478, 726, '150'],
  [1412, 778, '20'],
  [1472, 778, '250'],
] as const)
  text(x, y, t, 7.5);

// ── The patch controls, once per part ─────────────────────────────────────
const LFO1_WAVES = ['tri', 'saw', 'square', 'sh'] as const;
const OSC1_WAVES = [
  { v: 'superSaw', x: 385, y: 251, label: 'SUPER SAW' },
  { v: 'triMod', x: 385, y: 273, label: 'TRIANGLE MOD' },
  { v: 'noise', x: 385, y: 295, label: 'NOISE' },
  { v: 'feedback', x: 385, y: 317, label: 'FEEDBACK OSC' },
  { v: 'square', x: 511, y: 254, label: 'SQR (PWM)' },
  { v: 'saw', x: 511, y: 275, label: 'SAW' },
  { v: 'tri', x: 511, y: 297, label: 'TRIANGLE' },
];
const OSC2_WAVES = [
  { v: 'square', x: 957, y: 239, label: 'SQR (PWM)' },
  { v: 'saw', x: 957, y: 261, label: 'SAW' },
  { v: 'tri', x: 957, y: 283, label: 'TRIANGLE' },
  { v: 'noise', x: 957, y: 305, label: 'NOISE' },
];
const MFX_TYPES: ControlOption[] = [
  { v: 'chorusSlow', label: 'SUPER CHORUS SLW' },
  { v: 'chorusMid', label: 'SUPER CHORUS MID' },
  { v: 'chorusFast', label: 'SUPER CHORUS FST' },
  { v: 'chorusClear', label: 'SUPER CHORUS CLR' },
  { v: 'flangerSlow', label: 'FLANGER SLOW' },
  { v: 'flangerDeep', label: 'FLANGER DEEP' },
  { v: 'flangerFast', label: 'FLANGER FAST' },
  { v: 'deepPhasing', label: 'DEEP PHASING SLW' },
  { v: 'jetPhasing', label: 'JET PHASING' },
  { v: 'twisting', label: 'TWISTING' },
  { v: 'freeze1', label: 'FREEZE PHASE 1' },
  { v: 'freeze2', label: 'FREEZE PHASE 2' },
  { v: 'distortion', label: 'DISTORTION' },
];
const DELAY_TYPES: ControlOption[] = [
  { v: 'panLR', label: 'PANNING L>R' },
  { v: 'panRL', label: 'PANNING R>L' },
  { v: 'panShort', label: 'PANNING SHORT' },
  { v: 'monoShort', label: 'MONO SHORT' },
  { v: 'monoLong', label: 'MONO LONG' },
];
/** OSC 2 RANGE: −25 and +25 are −WIDE and +WIDE. */
const rangeFmt = (v: number): string =>
  v <= -25 ? '-WIDE' : v >= 25 ? '+WIDE' : `${v > 0 ? '+' : ''}${v} st`;

function part(s: Part): void {
  const id = (k: string): string => `${s}.${k}`;
  const nm = (k: string): string => `${PART_NAME[s]} ${k}`;
  const show = SHOW[s];
  const which = s === 'up' ? 'the Upper patch' : 'the Lower patch';

  // effects
  knob(id('bass'), 518, 163, {
    module: 'fx',
    name: nm('TONE BASS'),
    help: `Boosts (right) or cuts (left) the bass of ${which}, after its voices are mixed. Centre is flat.`,
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });
  knob(id('treble'), 612, 163, {
    module: 'fx',
    name: nm('TONE TREBLE'),
    help: `Boosts (right) or cuts (left) the treble of ${which}. Centre is flat.`,
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });
  knob(id('mfxLevel'), 710, 162, {
    module: 'fx',
    name: nm('MULTI-FX LEVEL'),
    help: 'How much of the multi-effect is heard: chorus, flanger, phaser or distortion, the type chosen on the display. At 0 the effect is out.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  knob(id('dlyTime'), 803, 162, {
    module: 'fx',
    name: nm('DELAY TIME'),
    help: 'The time between echoes, up to 1.25 s on MONO LONG, 625 ms on the panning types and 156 ms on the short ones.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 64,
    fmt: plain,
    show,
  });
  knob(id('dlyFeedback'), 893, 162, {
    module: 'fx',
    name: nm('DELAY FEEDBACK'),
    help: 'How many echoes follow each note: a single repeat at the left, a long trail to the right.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 40,
    fmt: plain,
    show,
  });
  knob(id('dlyLevel'), 985, 162, {
    module: 'fx',
    name: nm('DELAY LEVEL'),
    help: 'How loud the echoes are against the dry sound. At 0 the delay is out.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  button(id('vmSend'), 1071, 190, {
    module: 'fx',
    name: nm('VOICE MOD SEND'),
    help: `Sends ${which} to the Voice Modulator, the vocoder, as the instrument a voice is imposed on. ${NOT_HERE}`,
    ui: true,
    show,
  });

  // LFO 1
  ledSelect(
    id('lfo1Wave'),
    LFO1_WAVES.map((v, i) => ({ v, x: 246, y: LFO1_LED_Y[i], label: v.toUpperCase() })),
    'tri',
    {
      module: 'lfo',
      name: nm('LFO 1 WAVEFORM'),
      help: 'LFO 1’s shape: triangle, sawtooth, square (switching between two settings) or sample and hold (random steps). The WAVEFORM button steps through them.',
      show,
    }
  );
  knob(id('lfo1Rate'), 187, 372, {
    module: 'lfo',
    name: nm('LFO 1 RATE'),
    help: 'The speed of LFO 1, from a slow sweep to a fast flutter.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 64,
    fmt: (v) => fmtHz(lfoHz(v)),
    show,
  });
  knob(id('lfo1Fade'), 277, 372, {
    module: 'lfo',
    name: nm('LFO 1 FADE'),
    help: 'How long LFO 1 takes to reach full depth after each key, so vibrato or wobble can arrive on held notes only. Auto pan ignores it.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: (v) => fmtTime(fadeTime(v)),
    show,
  });

  // OSC 1
  ledSelect(id('osc1Wave'), OSC1_WAVES, 'saw', {
    module: 'osc',
    name: nm('OSC 1 WAVEFORM'),
    help: 'OSC 1’s seven waveforms. Four are the JP-8000’s own: the super saw (seven detuned saws), triangle mod, noise and feedback osc. Each gives CONTROL 1 and CONTROL 2 their own job.',
    show,
  });
  knob(id('osc1Ctl1'), 473, 372, {
    module: 'osc',
    name: nm('OSC 1 CONTROL 1'),
    help: 'Changes with the waveform: the super saw’s DETUNE, triangle mod’s OFFSET (how far it is folded), the noise’s CUTOFF, the feedback osc’s HARMONICS, or the square’s PULSE WIDTH. On saw and triangle it is SHAPE, which is not modelled here.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  knob(id('osc1Ctl2'), 570, 372, {
    module: 'osc',
    name: nm('OSC 1 CONTROL 2'),
    help: 'Changes with the waveform: the super saw’s MIX (the six side saws against the centre one), the noise’s RESONANCE, the feedback osc’s FEEDBACK amount, or how far LFO 1 moves the square’s pulse width or triangle mod’s offset. On saw and triangle it moves SHAPE, not modelled here.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  button(id('ring'), 640, 281, {
    module: 'osc',
    name: nm('RING'),
    help: 'Ring modulation: OSC 1 multiplied by OSC 2, a metallic, bell-like clang. It takes OSC 2’s side of OSC BALANCE.',
    show,
  });
  button(id('sync'), 744, 281, {
    module: 'osc',
    name: nm('SYNC'),
    help: 'Restarts OSC 2 with every cycle of OSC 1: the pitch stays with OSC 1 while OSC 2’s RANGE now changes the tone, the hard-sync tear. Not with noise or EXT.',
    show,
  });

  // OSC 2
  button(id('osc2Ext'), 838, 281, {
    module: 'osc',
    name: nm('OSC 2 EXT'),
    help: `Replaces OSC 2 with the audio at the EXTERNAL INPUT (Upper: VOCAL/UPPER or the mic; Lower: INST/LOWER), gated by the keys. The app has no audio input, so OSC 2 is silent with EXT on.`,
    show,
  });
  ledSelect(id('osc2Wave'), OSC2_WAVES, 'saw', {
    module: 'osc',
    name: nm('OSC 2 WAVEFORM'),
    help: 'OSC 2’s waveform: square with pulse width, sawtooth, triangle or noise. Pressing WAVEFORM also turns EXT off.',
    show,
  });
  knob(id('osc2Range'), 692, 372, {
    module: 'osc',
    name: nm('OSC 2 RANGE'),
    help: 'OSC 2’s pitch against OSC 1, two octaves either way in semitones. At the ends, -WIDE and +WIDE, FINE/WIDE becomes a sweep of four octaves down or up.',
    kind: 'cont',
    min: -25,
    max: 25,
    def: 0,
    fmt: rangeFmt,
    show,
  });
  knob(id('osc2Fine'), 790, 372, {
    module: 'osc',
    name: nm('OSC 2 FINE/WIDE'),
    help: 'Fine tuning of OSC 2, 50 cents either way, for a slow beating against OSC 1. With RANGE at -WIDE or +WIDE it sweeps OSC 2 across four octaves instead.',
    kind: 'cont',
    min: -50,
    max: 50,
    def: 0,
    fmt: signed,
    show,
  });
  knob(id('osc2Ctl1'), 885, 372, {
    module: 'osc',
    name: nm('OSC 2 CONTROL 1'),
    help: 'The square’s PULSE WIDTH or the noise’s CUTOFF (with EXT on, the gate threshold). Nothing on saw or triangle.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  knob(id('osc2Ctl2'), 980, 372, {
    module: 'osc',
    name: nm('OSC 2 CONTROL 2'),
    help: 'How far LFO 1 moves the square’s pulse width (PWM), or the noise’s RESONANCE. Nothing on saw, triangle or EXT.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });

  // filter
  fader(
    id('cutoff'),
    1096,
    {
      module: 'filter',
      name: nm('CUTOFF FREQ'),
      help: 'The filter’s cutoff: on the low-pass, lower is darker; on the high-pass, higher is thinner. High HPF or BPF settings can silence a low sound altogether.',
      def: 127,
      fmt: (v) => fmtHz(cutoffHz(v)),
      show,
    },
    327,
    104
  );
  fader(
    id('res'),
    1165,
    {
      module: 'filter',
      name: nm('RESONANCE'),
      help: 'Emphasis at the cutoff: a nasal peak, then a whistle, and at the top the filter rings by itself.',
      show,
    },
    327,
    104
  );
  button(id('slope'), 1260, 280, {
    module: 'filter',
    name: nm('-12dB/-24dB'),
    help: 'The filter’s slope: lit for -24 dB per octave, a steeper, more synth-like cut; unlit for a gentler -12 dB.',
    def: true,
    show,
  });
  ledSelect(
    id('vcfType'),
    [
      { v: 'hpf', x: 1385, y: 258, label: 'HPF' },
      { v: 'bpf', x: 1385, y: 280, label: 'BPF' },
      { v: 'lpf', x: 1385, y: 302, label: 'LPF' },
    ],
    'lpf',
    {
      module: 'filter',
      name: nm('FILTER TYPE'),
      help: 'Low-pass (the usual warm cut of the treble), band-pass (only a band round the cutoff, thin and vocal) or high-pass (the bass cut away).',
      show,
    }
  );
  knob(id('keyFollow'), 1270, 368, {
    module: 'filter',
    name: nm('KEY FOLLOW'),
    help: 'How far the cutoff follows the keys: centre not at all, +32 fully (every note as bright), the left side the other way, darker up the keyboard.',
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });
  knob(id('vcfLfo'), 1357, 368, {
    module: 'filter',
    name: nm('FILTER LFO 1 DEPTH'),
    help: 'How far LFO 1 sweeps the cutoff, for a wah or a wobble. Left of centre sweeps it the other way.',
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });

  // amp
  ledSelect(
    id('pan'),
    [
      { v: 'off', x: 1547, y: 268, label: 'OFF', hide: true },
      { v: 'auto', x: 1547, y: 268, label: 'AUTO' },
      { v: 'manual', x: 1547, y: 290, label: 'MANUAL' },
    ],
    'off',
    {
      module: 'amp',
      name: nm('PAN'),
      help: 'What AMP LFO 1 DEPTH does. Both LEDs off: LFO 1 moves the volume (tremolo). AUTO: LFO 1 moves the sound from side to side. MANUAL: the knob sets a fixed place in the stereo field, which is not modelled here.',
      offValue: 'off',
      show,
    }
  );
  knob(id('ampLfo'), 1505, 368, {
    module: 'amp',
    name: nm('AMP LFO 1 DEPTH'),
    help: 'With PAN off, how far LFO 1 moves the volume (tremolo); on AUTO, how wide it pans. Left of centre turns the movement over.',
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });
  knob(id('ampLevel'), 1610, 368, {
    module: 'amp',
    name: nm('AMP LEVEL'),
    help: `The volume of ${which}, to balance it against the other part.`,
    kind: 'cont',
    min: 0,
    max: 127,
    def: 100,
    fmt: plain,
    show,
  });

  // LFO 2 (MODULATION)
  knob(id('lfo2Rate'), 187, 580, {
    module: 'lfo',
    name: nm('MODULATION RATE'),
    help: 'The speed of LFO 2, a triangle the mod wheel brings in.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 80,
    fmt: (v) => fmtHz(lfoHz(v)),
    show,
  });
  for (const [k, dest, help] of [
    [
      'lfo2Pitch',
      'pitch',
      'How far LFO 2 moves the pitch at full mod wheel: vibrato. Left of centre turns it over.',
    ],
    [
      'lfo2Filter',
      'filter',
      'How far LFO 2 moves the cutoff at full mod wheel: a wah. Left of centre turns it over.',
    ],
    [
      'lfo2Amp',
      'amp',
      'How far LFO 2 moves the volume at full mod wheel: tremolo. Left of centre turns it over.',
    ],
  ] as const)
    knob(id(k), 277, 580, {
      module: 'lfo',
      name: nm(`MODULATION DEPTH (${dest.toUpperCase()})`),
      help: `${help} DEPTH SELECT chooses which of the three depths this knob shows; all three work at once.`,
      kind: 'cont',
      min: -64,
      max: 63,
      def: 0,
      fmt: signed,
      show: [show, { id: 'ui.lfo2Depth', eq: dest }],
    });

  // portamento
  button(id('porta'), 390, 488, {
    module: 'glide',
    name: nm('PORTAMENTO ON'),
    help: 'Glide: each note slides to the next instead of jumping.',
    show,
  });
  knob(id('portaTime'), 387, 582, {
    module: 'glide',
    name: nm('PORTAMENTO TIME'),
    help: 'How long the slide between notes takes.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 40,
    fmt: (v) => fmtTime(portaTime(v)),
    show,
  });

  // OSC COMMON
  ledSelect(
    id('shift'),
    [
      { v: '0', x: 480, y: 488, label: '0', hide: true },
      { v: '-2', x: 480, y: 488, label: '-2' },
      { v: '-1', x: 500, y: 488, label: '-1' },
      { v: '1', x: 538, y: 488, label: '+1' },
      { v: '2', x: 558, y: 488, label: '+2' },
    ],
    '0',
    {
      module: 'osc',
      name: nm('OSC SHIFT'),
      help: 'Moves the whole patch up or down by one or two octaves: the -OCT and +OCT buttons, lit orange for one octave and red for two.',
      offValue: '0',
      show,
    }
  );
  ledSelect(
    id('dest'),
    [
      { v: 'osc12', x: 694, y: 467, label: 'OSC 1+2' },
      { v: 'osc2', x: 694, y: 488, label: 'OSC 2' },
      { v: 'xmod', x: 694, y: 509, label: 'X-MOD' },
    ],
    'osc12',
    {
      module: 'mod',
      name: nm('LFO 1 & ENV DESTINATION'),
      help: 'Where the pitch envelope and OSC COMMON’s LFO 1 DEPTH act: the pitch of both oscillators, of OSC 2 alone (for sync sweeps), or the depth of the cross mod.',
      show,
    }
  );
  knob(id('balance'), 492, 582, {
    module: 'mixer',
    name: nm('OSC BALANCE'),
    help: 'The mix of OSC 1 (left) and OSC 2, or the ring modulator (right). They are equal at the centre.',
    kind: 'cont',
    min: -64,
    max: 63,
    def: -64,
    fmt: signed,
    show,
  });
  knob(id('xmod'), 603, 582, {
    module: 'mod',
    name: nm('X-MOD DEPTH'),
    help: 'How far OSC 2 frequency-modulates OSC 1: metallic and clangorous as it rises. Sweep OSC 2’s RANGE to change the tone. No effect on the super saw or noise.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 0,
    fmt: plain,
    show,
  });
  knob(id('oscLfo'), 712, 582, {
    module: 'mod',
    name: nm('OSC LFO 1 DEPTH'),
    help: 'How far LFO 1 moves the pitch (or the cross mod depth), wherever LFO 1 & ENV DESTINATION points: vibrato, a siren or a trill. Left of centre turns it over.',
    kind: 'cont',
    min: -64,
    max: 63,
    def: 0,
    fmt: signed,
    show,
  });

  // the envelopes
  fader(id('pDepth'), ENV_X.pDepth, {
    module: 'env',
    name: nm('PITCH ENVELOPE DEPTH'),
    help: 'How far the pitch envelope bends the pitch (or the cross mod depth): up above the centre, down below it. At the centre it does nothing.',
    min: -64,
    max: 63,
    fmt: signed,
    show,
  });
  fader(id('pA'), ENV_X.pA, {
    module: 'env',
    name: nm('PITCH ENVELOPE A'),
    help: 'How long the pitch takes to reach its furthest point after each key.',
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('pD'), ENV_X.pD, {
    module: 'env',
    name: nm('PITCH ENVELOPE D'),
    help: 'How long the pitch takes to come back to the note: short for a blip on a drum, long for a slow swoop.',
    def: 40,
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('fDepth'), ENV_X.fDepth, {
    module: 'env',
    name: nm('FILTER ENVELOPE DEPTH'),
    help: 'How far the filter envelope moves the cutoff: up above the centre, down below it.',
    min: -64,
    max: 63,
    fmt: signed,
    show,
  });
  fader(id('fA'), ENV_X.fA, {
    module: 'env',
    name: nm('FILTER ENVELOPE A'),
    help: 'How long the filter takes to open after each key.',
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('fD'), ENV_X.fD, {
    module: 'env',
    name: nm('FILTER ENVELOPE D'),
    help: 'How long the filter takes to fall back to the sustain level.',
    def: 64,
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('fS'), ENV_X.fS, {
    module: 'env',
    name: nm('FILTER ENVELOPE S'),
    help: 'Where the filter rests while the key is held.',
    show,
  });
  fader(id('fR'), ENV_X.fR, {
    module: 'env',
    name: nm('FILTER ENVELOPE R'),
    help: 'How long the filter takes to close after the key is let go.',
    def: 40,
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('aA'), ENV_X.aA, {
    module: 'env',
    name: nm('AMP ENVELOPE A'),
    help: 'How long each note takes to fade in.',
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('aD'), ENV_X.aD, {
    module: 'env',
    name: nm('AMP ENVELOPE D'),
    help: 'How long each note takes to fall to the sustain level.',
    def: 64,
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });
  fader(id('aS'), ENV_X.aS, {
    module: 'env',
    name: nm('AMP ENVELOPE S'),
    help: 'The volume while the key is held. At 0 every note dies away.',
    def: 127,
    show,
  });
  fader(id('aR'), ENV_X.aR, {
    module: 'env',
    name: nm('AMP ENVELOPE R'),
    help: 'How long each note takes to fade after the key is let go.',
    def: 30,
    fmt: (v) => fmtTime(envTime(v)),
    show,
  });

  // CONTROL
  button(id('mono'), 193, 702, {
    module: 'mode',
    name: nm('MONO'),
    help: 'One note at a time, each one played afresh. The feedback osc turns it on by itself.',
    show,
  });
  button(id('legato'), 250, 702, {
    module: 'mode',
    name: nm('LEGATO'),
    help: 'One note at a time; a note played before the last is let go slides on without restarting the envelopes. With UNISON as well, legato unison.',
    show,
  });
  button(id('unison'), 308, 702, {
    module: 'mode',
    name: nm('UNISON'),
    help: 'Every voice of the part on one note, slightly detuned: the thickest lead the JP-8080 has. Not with the feedback osc.',
    show,
  });
  button(id('velocity'), 365, 702, {
    module: 'mod',
    name: nm('VELOCITY'),
    help: `Lets velocity move the patch by the widths VELOCITY ASSIGN stored; with it off every note plays at 80. The JP-8080 has no other velocity response. ${NOT_HERE}`,
    ui: true,
    show,
  });

  // the two effect types, on the display
  controls.push({
    id: id('mfxType'),
    type: 'menu',
    x: 1007,
    y: 672,
    w: 230,
    h: 26,
    size: 10.5,
    vw: 132,
    module: 'fx',
    label: 'MULTI-FX',
    name: nm('MULTI-FX TYPE'),
    help: 'The multi-effect, chosen in the PATCH menu: four super choruses, three flangers, two phasers, twisting, two freeze phases and distortion. Twisting and the freeze phases are not modelled here and play dry.',
    kind: 'enum',
    options: MFX_TYPES,
    def: 'chorusSlow',
    show,
  });
  controls.push({
    id: id('dlyType'),
    type: 'menu',
    x: 1007,
    y: 706,
    w: 230,
    h: 26,
    size: 10.5,
    vw: 132,
    module: 'fx',
    label: 'DELAY',
    name: nm('DELAY TYPE'),
    help: 'The delay, chosen in the PATCH menu: echoes that bounce between the speakers (panning, long or short) or stay in the middle (mono). PANNING R>L bounces the same way as L>R here.',
    kind: 'enum',
    options: DELAY_TYPES,
    def: 'panLR',
    show,
  });
}
part('up');
part('lo');

// ── The performance and the rest ──────────────────────────────────────────
ledSelect(
  'ui.lfo2Depth',
  [
    { v: 'pitch', x: 246, y: 466, label: 'PITCH' },
    { v: 'filter', x: 246, y: 488, label: 'FILTER' },
    { v: 'amp', x: 246, y: 510, label: 'AMP' },
  ],
  'pitch',
  {
    module: 'lfo',
    name: 'DEPTH SELECT',
    help: 'Which of LFO 2’s three depths the DEPTH knob shows: pitch, filter or amp. It changes what you see, not the sound: all three act together.',
    ui: true,
  }
);
controls.push({
  id: 'perf.panel',
  type: 'select',
  x: 617,
  y: 702,
  w: 40,
  h: 22,
  lamp: 'white',
  labelPos: 'none',
  label: 'PANEL SELECT',
  name: 'PANEL SELECT',
  module: 'mode',
  help: 'Which part the knobs and sliders edit, LOWER or UPPER, and in SINGLE the part you hear. Each part keeps its own settings while the other is shown.',
  kind: 'enum',
  options: [
    { v: 'lower', label: 'LOWER', x: 617, y: 702 },
    { v: 'upper', label: 'UPPER', x: 674, y: 702 },
  ],
  def: 'upper',
});
button(
  'perf.keyMode',
  746,
  700,
  {
    module: 'mode',
    name: 'KEY MODE',
    help: 'SINGLE plays the PANEL SELECT part; DUAL plays both on every key, layered; SPLIT plays the Lower part below C4 and the Upper from it.',
    kind: 'enum',
    options: [
      { v: 'single', label: 'SINGLE' },
      { v: 'dual', label: 'DUAL' },
      { v: 'split', label: 'SPLIT' },
    ],
    def: 'single',
  },
  BTN
);
LED(800, 674, { id: 'perf.keyMode', eq: 'single' });
LED(800, 696, { id: 'perf.keyMode', eq: 'dual' });
LED(800, 717, { id: 'perf.keyMode', eq: 'split' });

button('ui.velAssign', 422, 702, {
  module: 'mod',
  name: 'VELOCITY ASSIGN',
  help: `Morphing: while it is lit, moving knobs and sliders stores how far each moves with velocity, so a hard note can be a different sound. ${NOT_HERE}`,
  ui: true,
});
button('ui.ctlAssign', 480, 702, {
  module: 'mod',
  name: 'CONTROL ASSIGN',
  help: `Morphing: stores how far each knob and slider moves with aftertouch or breath (Control Up and Down), so one gesture can push the whole sound. ${NOT_HERE}`,
  ui: true,
});

// the Voice Modulator and external inputs: drawn only
button(
  'ui.vmOn',
  1071,
  122,
  {
    module: 'fx',
    name: 'VOICE MODULATOR ON',
    help: `Turns on the Voice Modulator: a 12-band vocoder that imposes a voice at the VOCAL input (or the mic) on a part, the INST input or its robot oscillator, and drops the polyphony to 8. ${NOT_HERE}`,
    ui: true,
  },
  CAP
);
for (const [k, x, label] of [
  ['ui.vmCtl1', 1160, 'VOICE MODULATOR CONTROL 1'],
  ['ui.vmCtl2', 1250, 'VOICE MODULATOR CONTROL 2'],
] as const)
  knob(k, x, 160, {
    module: 'fx',
    name: label,
    help: `Plays whichever Voice Modulator setting is assigned to it (vocal mix, ensemble level, the delay and others) while the Voice Modulator is on. ${NOT_HERE}`,
    kind: 'cont',
    min: 0,
    max: 127,
    def: 64,
    fmt: plain,
    ui: true,
  });
for (const [k, x, label, help] of [
  [
    'ui.instLevel',
    1350,
    'INST/LOWER LEVEL',
    'The level of the INST/LOWER input, which the Lower part’s EXT plays and the Voice Modulator can take as its instrument.',
  ],
  [
    'ui.vocalLevel',
    1442,
    'VOCAL/UPPER LEVEL',
    'The level of the VOCAL/UPPER input or the mic, which the Upper part’s EXT plays and the Voice Modulator takes as its voice.',
  ],
] as const)
  knob(k, x, 160, {
    module: 'util',
    name: label,
    help: `${help} The app has no audio input. ${NOT_HERE}`,
    kind: 'cont',
    min: 0,
    max: 127,
    def: 64,
    fmt: plain,
    ui: true,
  });
button(
  'ui.rearFront',
  1513,
  167,
  {
    module: 'util',
    name: 'REAR/FRONT',
    help: `Chooses the voice input: the rear VOCAL/UPPER socket, or (lit) the front mic socket beside it. ${NOT_HERE}`,
    ui: true,
  },
  CAP
);

// volume
decor.push({ t: 'circle', x: 198, y: 857, r: 30, fill: '#18191b' });
decor.push({ t: 'circle', x: 198, y: 857, r: 13, fill: '#060607', stroke: '#9a9a9a', sw: 2 });
text(198, 815, 'PHONES', 9);
text(295, 812, 'LEVEL', 10);
knob(
  'out.volume',
  295,
  855,
  {
    module: 'out',
    name: 'VOLUME LEVEL',
    help: 'The overall volume of the unit, both parts and the headphones. It is not stored with a sound.',
    kind: 'cont',
    min: 0,
    max: 127,
    def: 100,
    fmt: plain,
  },
  20
);

// arpeggiator
button('arp.on', 1350, 705, {
  module: 'mode',
  name: 'ARPEGGIATOR ON',
  help: 'Turns the arpeggiator on: hold a chord and it plays the notes one after another, at TEMPO, in sixteenths.',
});
button('arp.hold', 1350, 770, {
  module: 'mode',
  name: 'HOLD',
  help: 'Keeps the arpeggio going after the keys are let go, until a new chord replaces it.',
});
knob(
  'arp.tempo',
  1442,
  745,
  {
    module: 'mode',
    name: 'TEMPO',
    help: 'The arpeggiator’s speed in beats a minute, 20 to 250. On the hardware it also times RPS, motion control and the synced effects.',
    kind: 'cont',
    min: 20,
    max: 250,
    def: 120,
    fmt: (v) => `${Math.round(v)} BPM`,
  },
  20
);
button('arp.mode', 1527, 740, {
  module: 'mode',
  name: 'ARPEGGIATOR MODE',
  help: 'The order of the notes: UP, DOWN, UP and DOWN (both LEDs lit), RANDOM, or RPS, the JP-8080’s one-key phrase player, which is not modelled here.',
  kind: 'enum',
  options: [
    { v: 'up', label: 'UP' },
    { v: 'down', label: 'DOWN' },
    { v: 'updown', label: 'UP&DOWN' },
    { v: 'random', label: 'RND' },
    { v: 'rps', label: 'RPS' },
  ],
  def: 'up',
});
LED(1580, 706, { id: 'arp.mode', in: ['up', 'updown'] });
LED(1580, 728, { id: 'arp.mode', in: ['down', 'updown'] });
LED(1580, 750, { id: 'arp.mode', eq: 'random' });
LED(1580, 772, { id: 'arp.mode', eq: 'rps' });
button('arp.range', 1527, 857, {
  module: 'mode',
  name: 'ARPEGGIO RANGE',
  help: 'How many octaves the arpeggio climbs through, one to four.',
  kind: 'enum',
  options: ['1', '2', '3', '4'].map((v) => ({ v, label: `${v} OCT` })),
  def: '1',
});
['1', '2', '3', '4'].forEach((v, i) => LED(1580, 826 + 22 * i, { id: 'arp.range', eq: v }));
for (const [k, y, label] of [
  ['ui.motion1', 830, 'MOTION 1'],
  ['ui.motion2', 880, 'MOTION 2'],
] as const)
  button(
    k,
    1350,
    y,
    {
      module: 'mode',
      name: label,
      help: `Plays back a recorded motion: knob and slider moves, looped in time with TEMPO. ${NOT_HERE}`,
      ui: true,
    },
    '#cfcabd'
  );
button(
  'ui.motionRec',
  1440,
  857,
  {
    module: 'mode',
    name: 'MOTION REC',
    help: `Records knob and slider moves as a motion, layered loop by loop. ${NOT_HERE}`,
    ui: true,
  },
  '#8a3a2c'
);

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'effects',
    label: 'Effects',
    module: 'fx',
    keywords: 'tone control eq bass treble chorus flanger phaser distortion echo delay',
    rects: [R(478, 85, 1034, 216)],
    help: 'Each patch’s own effects, in order: a TONE CONTROL (bass and treble), the MULTI-FX (chorus, flanger, phaser or distortion, the type picked on the display) and a DELAY with TIME, FEEDBACK and LEVEL.',
  },
  {
    id: 'voicemod',
    label: 'Voice Modulator',
    module: 'fx',
    keywords: 'vocoder voice modulator formant robot talk',
    rects: [R(1036, 85, 1298, 218)],
    help: 'The JP-8080’s vocoder: twelve bands of a voice imposed on a part, the instrument input or a robot oscillator, with its own ensemble and delay. VOICE MOD SEND sends the patch to it. It is drawn here but not modelled.',
  },
  {
    id: 'extinput',
    label: 'External input',
    module: 'util',
    keywords: 'input audio in mic microphone line vocal instrument',
    rects: [R(1298, 85, 1648, 218)],
    help: 'Two line inputs and a front mic socket, with level knobs and limiter lights. A part’s OSC 2 EXT plays its input through the filter and amp, and the Voice Modulator takes its voice and instrument from here. The app has no audio input, so they are drawn only.',
  },
  {
    id: 'lfo1',
    label: 'LFO 1',
    module: 'lfo',
    keywords: 'lfo vibrato wobble tremolo sample and hold fade',
    rects: [R(143, 221, 339, 412)],
    help: 'The patch’s main LFO: four waveforms, RATE, and FADE, which lets it fade in after each key. Its depth is set where it is used: OSC COMMON, the filter, the amp and the oscillators’ pulse width or shape.',
  },
  {
    id: 'osc1',
    label: 'OSC 1',
    module: 'osc',
    keywords: 'oscillator supersaw super saw feedback triangle mod noise ring',
    rects: [R(341, 221, 665, 412)],
    help: 'The first oscillator, in seven waveforms: the super saw (seven detuned saws in one), triangle mod, noise, feedback osc, square, saw and triangle. CONTROL 1 and CONTROL 2 do something different on each. RING multiplies it by OSC 2.',
  },
  {
    id: 'osc2',
    label: 'OSC 2',
    module: 'osc',
    keywords: 'oscillator sync detune external pulse width pwm',
    rects: [R(665, 221, 1034, 412)],
    help: 'The second oscillator: square, saw, triangle or noise, or the external input with EXT. RANGE sets its pitch against OSC 1 and FINE/WIDE tunes it finely, or sweeps it widely at the ends of RANGE. SYNC locks it to OSC 1.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance low-pass high-pass band-pass slope keytrack',
    rects: [R(1036, 221, 1433, 412)],
    help: 'A resonant filter: low-pass, band-pass or high-pass at -12 or -24 dB per octave, with CUTOFF and RESONANCE sliders, KEY FOLLOW and LFO 1. The filter envelope below moves it too.',
  },
  {
    id: 'amp',
    label: 'Amp',
    module: 'amp',
    keywords: 'vca volume level tremolo pan auto pan',
    rects: [R(1433, 221, 1648, 412)],
    help: 'The patch’s volume (LEVEL) and what LFO 1 does to it: tremolo, auto pan from side to side, or a fixed pan with PAN on MANUAL.',
  },
  {
    id: 'lfo2',
    label: 'Modulation (LFO 2)',
    module: 'lfo',
    keywords: 'mod wheel vibrato lfo 2 modulation',
    rects: [R(143, 423, 339, 624)],
    help: 'A second LFO, a triangle that the mod wheel brings in: one RATE and three depths, on pitch, filter and amp, all at once. DEPTH SELECT picks which depth the knob shows.',
  },
  {
    id: 'porta',
    label: 'Portamento',
    module: 'glide',
    keywords: 'glide portamento slide',
    rects: [R(339, 423, 446, 624)],
    help: 'Glide between notes: ON and TIME.',
  },
  {
    id: 'osccommon',
    label: 'OSC COMMON',
    module: 'mod',
    keywords: 'octave shift balance mix cross modulation fm vibrato',
    rects: [R(446, 423, 774, 624)],
    help: 'What acts on both oscillators: OSC SHIFT by octaves, OSC BALANCE between them, X-MOD DEPTH (OSC 2 modulating OSC 1’s frequency) and LFO 1 DEPTH, sent with the pitch envelope wherever LFO 1 & ENV DESTINATION points.',
  },
  {
    id: 'pitchenv',
    label: 'Pitch envelope',
    module: 'env',
    keywords: 'pitch envelope ad sweep',
    rects: [R(774, 423, 1009, 624)],
    help: 'A simple attack-decay envelope on pitch (or cross mod depth): DEPTH up or down, A and D. A quick one gives a blip at the start of each note; a slow one a swoop.',
  },
  {
    id: 'filterenv',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'filter envelope adsr contour',
    rects: [R(1009, 423, 1368, 624)],
    help: 'An ADSR for the cutoff, with a DEPTH slider that opens the filter (above centre) or closes it (below).',
  },
  {
    id: 'ampenv',
    label: 'Amp envelope',
    module: 'env',
    keywords: 'amp envelope adsr volume contour',
    rects: [R(1368, 423, 1648, 624)],
    help: 'An ADSR for the volume of each note: A, D, S and R.',
  },
  {
    id: 'control',
    label: 'Control',
    module: 'mode',
    keywords: 'mono legato unison velocity morphing aftertouch',
    rects: [R(143, 626, 524, 738)],
    help: 'SOLO SW sets how the patch plays its keys: MONO, LEGATO or UNISON (every voice on one note). MORPHING’s VELOCITY, VELOCITY ASSIGN and CONTROL ASSIGN let velocity, aftertouch or breath move many knobs at once; they are drawn but not modelled.',
  },
  {
    id: 'parts',
    label: 'Panel select and key mode',
    module: 'mode',
    keywords: 'upper lower part dual split layer single performance',
    rects: [R(576, 640, 874, 738)],
    help: 'The JP-8080 holds two patches, Upper and Lower. PANEL SELECT picks which one the knobs edit; KEY MODE plays one (SINGLE), both layered (DUAL) or one each side of a split (SPLIT).',
  },
  {
    id: 'display',
    label: 'Display',
    module: 'fx',
    keywords: 'lcd menu multi-fx type delay type',
    rects: [R(880, 640, 1136, 738)],
    help: 'The display shows the menus. Here it holds the two settings most patches need from them: the multi-effect type and the delay type, for the part PANEL SELECT shows.',
  },
  {
    id: 'volume',
    label: 'Volume',
    module: 'out',
    keywords: 'volume master headphones output',
    rects: [R(143, 752, 371, 921)],
    help: 'The overall volume, and the headphone socket.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator/RPS',
    module: 'mode',
    keywords: 'arpeggiator arp rps phrase motion tempo',
    rects: [R(1310, 642, 1652, 928)],
    help: 'The arpeggiator: ON, HOLD, TEMPO, MODE and RANGE. MODE’s fifth setting is RPS, the JP-8080’s phrase player, and MOTION CONTROL records and replays knob moves; both are drawn but not modelled.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO1_MIX: Record<string, LfoMix> = {
  tri: { tri: 1 },
  saw: { saw: 1 },
  square: { sq: 1 },
  sh: { sh: 1 },
};
const ARP_ENGINE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
};
const OSC_LEVEL = 0.4;

/** The parameters an effect algorithm defaults to, in the effects engine's units. */
const defaultsOf = (alg: string): Record<string, number | string> =>
  Object.fromEntries((FX_ALGOS.find((a) => a.id === alg)?.params ?? []).map((q) => [q.ref, q.def]));

/** One multi-effect type, at MULTI-FX LEVEL 0..1, on the effects engine; `null` for the types not modelled. */
function mfxSlot(type: string, lvl: number): FxSlot | null {
  const mix = Math.round(55 * lvl);
  const chorus = (spd: number, width: number): FxSlot => ({
    alg: 'chorus',
    level: 1,
    p: { ...defaultsOf('chorus'), SPD: spd, WDL: width, WDR: width, MIX: mix, PHS: 90 },
  });
  const flanger = (spd: number, fd: number): FxSlot => ({
    alg: 'flanger',
    level: 1,
    p: { ...defaultsOf('flanger'), SPD: spd, FD: fd, MIX: Math.round(50 * lvl) },
  });
  const phaser = (spd: number, res: number, dep: number): FxSlot => ({
    alg: 'phaser',
    level: 1,
    p: { ...defaultsOf('phaser'), SPD: spd, RES: res, DEP: dep, MIX: Math.round(50 * lvl) },
  });
  switch (type) {
    case 'chorusSlow':
      return chorus(0.3, 50);
    case 'chorusMid':
      return chorus(0.8, 45);
    case 'chorusFast':
      return chorus(2.5, 35);
    case 'chorusClear':
      return chorus(0.5, 25);
    case 'flangerSlow':
      return flanger(0.15, 50);
    case 'flangerDeep':
      return flanger(0.3, 80);
    case 'flangerFast':
      return flanger(1.5, 55);
    case 'deepPhasing':
      return phaser(0.2, 50, 90);
    case 'jetPhasing':
      return phaser(0.12, 85, 100);
    case 'distortion':
      return {
        alg: 'rackamp',
        level: 1,
        p: { ...defaultsOf('rackamp'), PRE: Math.round(10 * (0.2 + 0.8 * lvl) * 10) / 10, LVL: 4 },
      };
    default:
      return null;
  }
}

/** The longest echo each delay type gives, in milliseconds (`delay_max_ms`). */
const DELAY_MAX: Record<string, number> = {
  panLR: 625,
  panRL: 625,
  panShort: 156,
  monoShort: 156,
  monoLong: 1250,
};

/** A part's tone control, auto pan, multi-effect and delay as the effects engine's four slots. */
function partFx(v: ControlValues, s: Part): FxParams {
  const n = (k: string): number => num(v, `${s}.${k}`);
  const e = (k: string): string => String(v[`${s}.${k}`]);
  const slots: FxSlot[] = [];
  // AUTO pan: LFO 1 moves the sound across the outputs (the effects engine's auto-panner)
  const depth = Math.abs(bi(n('ampLfo')));
  if (e('pan') === 'auto' && depth > 0) {
    const w = e('lfo1Wave');
    slots.push({
      alg: 'auto-pan',
      level: 1,
      p: {
        ...defaultsOf('auto-pan'),
        SPD: Math.round(clamp(lfoHz(n('lfo1Rate')), 0, 5) * 100) / 100,
        PHS: 180,
        WAV: w === 'square' ? 50 : w === 'tri' ? -50 : 0,
        DEP: Math.round(100 * depth),
      },
    });
  }
  const bass = n('bass'),
    treble = n('treble');
  if (bass !== 0 || treble !== 0)
    slots.push({
      alg: 'midaseq',
      level: 1,
      p: {
        ...defaultsOf('midaseq'),
        LSG: Math.round(12 * bi(bass) * 10) / 10,
        LSF: 150,
        HSG: Math.round(12 * bi(treble) * 10) / 10,
        HSF: 5000,
      },
    });
  const mfxLevel = n('mfxLevel') / 127;
  const mfx = mfxLevel > 0 ? mfxSlot(e('mfxType'), mfxLevel) : null;
  if (mfx) slots.push(mfx);
  const dlyLevel = n('dlyLevel') / 127;
  if (dlyLevel > 0) {
    const type = e('dlyType');
    const fb = Math.round(90 * (n('dlyFeedback') / 127));
    slots.push({
      alg: 'delay',
      level: 1,
      p: {
        ...defaultsOf('delay'),
        MIX: Math.round(50 * dlyLevel),
        TIM: Math.max(1, Math.round((DELAY_MAX[type] ?? 625) * (n('dlyTime') / 127))),
        MOD: type.startsWith('pan') ? 'P-P' : 'M',
        FCL: '1',
        FCR: '1',
        OFS: 0,
        FBL: fb,
        FBR: fb,
        LC: 10,
        HC: 20000,
        FLC: 10,
        FHC: 20000,
      },
    });
  }
  if (!slots.length) return { mode: 'bypass' };
  while (slots.length < 4) slots.push({ alg: null });
  return { mode: 'insert', routing: 1, slots };
}

/** One patch as a voice. */
function patchVoice(v: ControlValues, s: Part, gain: number): LayerParams {
  const n = (k: string): number => num(v, `${s}.${k}`);
  const e = (k: string): string => String(v[`${s}.${k}`]);
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };

  // ── oscillators ──
  const w1 = e('osc1Wave');
  const c1 = n('osc1Ctl1') / 127,
    c2 = n('osc1Ctl2') / 127;
  const t = (n('balance') + 64) / 127;
  const g1 = Math.cos((t * Math.PI) / 2),
    g2 = Math.sin((t * Math.PI) / 2);
  const mix1: OscMix = {};
  const osc1: OscParams = { level: OSC_LEVEL * g1, mix: mix1, semi: 0, kbd: true, syncTo: -1 };
  if (w1 === 'superSaw') {
    mix1.ssaw = 1;
    osc1.ssDetune = c1;
    osc1.ssMix = c2;
  } else if (w1 === 'triMod') {
    mix1.tfold = 1;
    osc1.fold = c1;
    // CONTROL 2: LFO 1 moves the fold (the pulse-width destination moves CONTROL 1)
    route('lfo', 'pw1', 0.5 * c2);
  } else if (w1 === 'noise') {
    mix1.fnoise = 1;
    osc1.nCut = n('osc1Ctl1') - 64;
    osc1.nRes = c2;
  } else if (w1 === 'feedback') {
    mix1.fbk = 1;
    osc1.fbHarm = c1;
    osc1.fbAmt = c2;
  } else if (w1 === 'square') {
    mix1.pulse = 1;
    osc1.pw = 0.5 - 0.46 * c1;
    route('lfo', 'pw1', 0.45 * c2);
  } else if (w1 === 'tri') mix1.tri = 1;
  else mix1.saw = 1;

  const ext = v[`${s}.osc2Ext`] === true;
  const w2 = e('osc2Wave');
  const d1 = n('osc2Ctl1') / 127,
    d2 = n('osc2Ctl2') / 127;
  const ring = v[`${s}.ring`] === true && !ext;
  const sync = v[`${s}.sync`] === true && !ext && w2 !== 'noise';
  const range = n('osc2Range'),
    fine = n('osc2Fine');
  const semi2 =
    range <= -25
      ? (-48 * (50 - fine)) / 100
      : range >= 25
        ? (48 * (fine + 50)) / 100
        : range + fine / 100;
  const mix2: OscMix = {};
  const osc2: OscParams = {
    level: ext || ring ? 0 : OSC_LEVEL * g2,
    mix: mix2,
    semi: semi2,
    kbd: true,
    syncTo: sync ? 0 : -1,
  };
  if (w2 === 'square') {
    mix2.pulse = 1;
    osc2.pw = 0.5 - 0.46 * d1;
    route('lfo', 'pw2', 0.45 * d2);
  } else if (w2 === 'noise') {
    // OSC 2's noise ignores the keys: at full RESONANCE, CUTOFF 64 rings at C4 on every key
    mix2.fnoise = 1;
    osc2.kbd = false;
    osc2.fixedNote = 60;
    osc2.semi = 0;
    osc2.nCut = n('osc2Ctl1') - 64;
    osc2.nRes = d2;
  } else if (w2 === 'tri') mix2.tri = 1;
  else mix2.saw = 1;

  // ── OSC COMMON: cross mod, LFO 1 and the pitch envelope ──
  const dest = e('dest');
  const xmodOk = w1 !== 'superSaw' && w1 !== 'noise' && !ext;
  const xm = 36 * Math.pow(n('xmod') / 127, 2);
  if (xmodOk) route('osc2', 'pitch1', xm);
  const oscLfo = bi(n('oscLfo'));
  const pDepth = bi(n('pDepth'));
  if (dest === 'xmod') {
    // LFO 1 and the envelope move the cross mod depth
    if (xmodOk) {
      route('osc2', 'pitch1', 36 * 0.5 * oscLfo, 'lfo');
      route('osc2', 'pitch1', 36 * pDepth, 'env3');
    }
  } else {
    const pd = dest === 'osc2' ? 'pitch2' : 'pitchAll';
    route('lfo', pd, 12 * Math.sign(oscLfo) * oscLfo * oscLfo);
    route('env3', pd, 48 * Math.sign(pDepth) * pDepth * pDepth);
  }

  // ── filter ──
  const type = e('vcfType');
  const steep = v[`${s}.slope`] === true;
  const cut = cutoffHz(n('cutoff'));
  const res = 1.08 * (n('res') / 127);
  const envAmt = 8 * bi(n('fDepth'));
  // KEY FOLLOW: +32 tracks fully, +63 about twice, -64 fully the other way
  const kf = n('keyFollow') < 0 ? n('keyFollow') / 64 : (2 * n('keyFollow')) / 63;
  // the -24 dB high-pass and band-pass use the series high-pass, so the cutoff routes reach it too
  const hp24 = steep && (type === 'hpf' || type === 'bpf');
  const lowpass = !(steep && type === 'hpf');
  const cutRoute = (src: string, amt: number, by?: string): void => {
    if (lowpass) route(src, 'cutoff', amt, by);
    if (hp24) route(src, 'cutoffHp', amt, by);
  };
  cutRoute('kbd', kf);
  cutRoute('lfo', 4 * bi(n('vcfLfo')));
  const filter: LayerParams['filter'] = lowpass
    ? {
        type: steep ? 'ladder' : 'svf',
        mode: steep ? 'lp' : type === 'hpf' ? 'hp' : type === 'bpf' ? 'bp' : 'lp',
        cutoff: cut,
        res,
        envAmt,
        envSrc: 'env1',
        kbd: 0,
      }
    : { type: 'svf', mode: 'lp', cutoff: 20000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 };

  // ── amp ──
  const pan = e('pan');
  const ampLfo = bi(n('ampLfo'));
  if (pan === 'off') route('lfo', 'amp', 0.8 * ampLfo, 'env2');

  // ── LFO 2, on the mod wheel ──
  const p2 = bi(n('lfo2Pitch'));
  route('lfo2', 'pitchAll', 12 * Math.sign(p2) * p2 * p2, 'wheel');
  if (lowpass) route('lfo2', 'cutoff', 4 * bi(n('lfo2Filter')), 'wheel');
  if (hp24) route('lfo2', 'cutoffHp', 4 * bi(n('lfo2Filter')), 'wheel');
  route('lfo2', 'amp', 0.8 * bi(n('lfo2Amp')), 'wheel');

  const legato = v[`${s}.legato`] === true;
  const pd = envTime(n('pD'));
  return {
    osc: [osc1, osc2],
    noise: { level: 0 },
    ext: { level: ring ? OSC_LEVEL * g2 : 0 },
    ...(ring ? { normals: { extIn: 'ring', ringA: 'osc1', ringB: 'osc2' } } : {}),
    ...(hp24
      ? {
          hpf: {
            cutoff: cut,
            res: type === 'hpf' ? res : 0,
            envAmt,
            envSrc: 'env1' as const,
            kbd: 0,
          },
        }
      : {}),
    filter,
    env1: { a: envTime(n('fA')), d: envTime(n('fD')), s: n('fS') / 127, r: envTime(n('fR')) },
    env2: { a: envTime(n('aA')), d: envTime(n('aD')), s: n('aS') / 127, r: envTime(n('aR')) },
    env3: { a: envTime(n('pA')), d: pd, s: 0, r: pd },
    vca: { envSrc: 'env2', bias: 0, gain: level10(n('ampLevel') / 12.7, 1) * gain },
    lfo: {
      rate: lfoHz(n('lfo1Rate')),
      mix: LFO1_MIX[e('lfo1Wave')] ?? { tri: 1 },
      keySync: false,
      delay: fadeTime(n('lfo1Fade')),
    },
    lfo2: { rate: lfoHz(n('lfo2Rate')), mix: { tri: 1 }, keySync: false },
    glide: { time: v[`${s}.porta`] === true ? portaTime(n('portaTime')) : 0, legato },
    trig: { retrig: !legato, drone: false, repeat: false },
    routes,
    tune: 12 * (Number(v[`${s}.shift`]) || 0),
  };
}

/** Voices per note and the mono switch: the SOLO SW of the part that leads, with the feedback osc forcing mono. */
function solo(v: ControlValues, s: Part): { mono: boolean; unison: boolean } {
  const fb = v[`${s}.osc1Wave`] === 'feedback';
  const unison = v[`${s}.unison`] === true && !fb;
  const mono = unison || fb || v[`${s}.mono`] === true || v[`${s}.legato`] === true;
  return { mono, unison };
}

function toEngine(v: ControlValues): EngineParams {
  const mode = String(v['perf.keyMode']);
  const single = mode === 'single';
  const lead: Part = single && v['perf.panel'] === 'lower' ? 'lo' : 'up';
  // two parts on every key are summed, so DUAL turns each down; SPLIT plays one a key
  const gain = mode === 'dual' ? 0.75 : 1;
  const top = patchVoice(v, lead, gain);
  // DUAL shares the ten voices 5-5 (each note takes one of each part); SPLIT lets the two sides share ten notes
  const voices = mode === 'dual' ? 5 : 10;
  const { mono, unison } = solo(v, lead);
  const arpMode = ARP_ENGINE[String(v['arp.mode'])];
  return {
    ...top,
    poly: {
      voices,
      stack: unison ? voices : 1,
      mono,
      // Unison Detune at its default of 5 cents between the highest and lowest voice
      detune: unison ? 0.025 : 0,
    },
    ...(single
      ? {}
      : {
          layer:
            mode === 'split'
              ? { ...patchVoice(v, 'lo', gain), split: 60 }
              : patchVoice(v, 'lo', gain),
        }),
    arp: {
      on: v['arp.on'] === true && arpMode !== undefined,
      bpm: Math.round(num(v, 'arp.tempo')),
      gate: 0.5,
      mode: arpMode ?? 'up',
      octaves: Number(v['arp.range']) || 1,
      hold: v['arp.hold'] === true,
    },
    fx: partFx(v, lead),
    volume: level10(num(v, 'out.volume') / 12.7, 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const jp8080: SynthDef & { version: number } = {
  id: 'jp-8080',
  version: 1,
  name: 'JP-8080',
  maker: 'Roland',
  year: 1998,
  heritage:
    'The rack version of Roland’s 1996 JP-8000, the virtual analogue whose super saw defined trance',
  summary:
    'Two patches, Upper and Lower, played singly, layered or split, each a virtual-analogue voice: OSC 1 with the super saw, feedback osc, triangle mod and noise beside the classic waves, OSC 2 with sync, ring and cross mod, a 12 or 24 dB multimode filter, three envelopes, two LFOs, and its own tone control, multi-effect and delay. An arpeggiator serves both.',
  view: { w: VIEW_W, h: VIEW_H },
  theme: {
    panel: PANEL,
    panel2: '#3b446f',
    ink: INK,
    font: 'helv',
    cheeks: 'none',
    knobRing: true,
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the amp envelope',
    env3: 'the pitch envelope',
    lfo: 'LFO 1',
    lfo2: 'LFO 2',
    osc1: 'OSC 1',
    osc2: 'OSC 2',
    ring: 'the ring modulator',
    kbd: 'the keyboard',
    wheel: 'the mod wheel',
  },
};

export default jp8080;
