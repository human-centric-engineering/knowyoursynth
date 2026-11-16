/**
 * Dreadbox Nymphes: the definition (D1). Positions are measured on the owner's 1285 × 708 photo of the panel from
 * above (`.context/app/synth-data/nymphes/raw/Dreadbox Nymphes Synthesizer.jpg`, local only), and written in view
 * units of half a photo pixel, from the faceplate's top-left corner at photo (35, 38): view x = (photo x − 35) × 2,
 * y = (photo y − 38) × 2. The owner's spec is `.context/app/synth-data/nymphes/nymphes.synth.json` (the Owner's
 * Manual V2.0, whose PDF is in `raw/`).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), starting from `defs/deepmind-12d.ts`:
 * both are analogue polys programmed from faders, with a 6 dB high-pass on the summed voices (`post`) and a digital
 * reverb (here on the DeepMind's effects engine, `audio/dm-fx.ts`, as its hall). Six voices, each one oscillator whose
 * WAVE morphs sawtooth → square → triangle, a square sub an octave down and white noise → a 24 dB resonant ladder
 * low-pass → the VCA. No content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the
 * NYMPHES wordmark and the dre:adbox logo), and panel values read through `num()`.
 *
 * Fourteen sliders control 28 parameters: the label under a slider normally, the one above it while SHIFT is lit
 * (`ui.shift`), following the Sub 37's KNOB SHIFT. MENU (`ui.page`) steps through the three menu pages that change what
 * the sliders do here: MODE (the play mode on the right-hand column of the menu legend, and the settings the manual's
 * menu map holds, which the spec cannot place), LFO 2 and REVERB. Two controls on one slider sit at one point, each
 * shown only on its page and SHIFT state; a hidden one keeps its value. The app is the pages' only reader: the hardware
 * edits a page with MENU and the rotary switch.
 *
 * The manual gives the cutoff's range (32.7 Hz to 16.7 kHz) and that the filter self-oscillates and tracks 1:1 at full
 * TRACK; it gives no envelope or LFO times, glide rate, detune, high-pass or reverb ranges (`not_in_source`), so those
 * curves are the app's estimates. Of the assignable modulation (four sources, each with a depth on most slider
 * parameters), LFO 2's depth on PW, LVL, NOISE, CUT and RES is modelled, as engine routes, added rather than mixed in;
 * the mod wheel, velocity and aftertouch pages are not. The seven chords are programmed by playing them and the spec
 * gives none, so CHORD is drawn and not modelled; nor is LFO FADE, which the engine has no stage for.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineParams,
  EngineRoute,
  FxSlot,
  LfoMix,
  ShowCondition,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
import { num } from '@/lib/app/synths/lib/def-kit';
import { type CurvePoint, expMap, fmtHz, fmtTime, level10, pwl } from '@/lib/app/synths/lib/maps';

type FaderRest = Omit<ControlCommon, 'id' | 'x' | 'y' | 'module' | 'show'> &
  Partial<Omit<ContinuousValue, 'kind'>>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;

/** Photo pixels to view units: half a photo pixel each, from the faceplate's top-left corner. */
const X = (px: number): number => Math.round((px - 35) * 2);
const Y = (py: number): number => Math.round((py - 38) * 2);
const PANEL = '#2a3fae';
const PINK = '#e9a6d6';
const SLOT = '#0b0c12';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// Only the cutoff's range is in the manual. Everything else here is the app's estimate (`not_in_source`).
const ENV_PTS: CurvePoint[] = [
  [0, 0.001],
  [2.5, 0.03],
  [5, 0.3],
  [7.5, 2.5],
  [10, 15],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const vcfHz = (v: number): number => expMap(v / 10, 32.7, 16744);
/** HPF: a 6 dB high-pass on the summed voices, out of the way at 0. */
const hpfHz = (v: number): number => expMap(v / 10, 20, 2000);
/** LFO RATE in the LOW range (BPM with no MIDI clock runs here too, as the manual says) and in the HIGH range. */
const lfoLowHz = (v: number): number => expMap(v / 10, 0.03, 30);
const lfoHighHz = (v: number): number => expMap(v / 10, 1, 1000);
const lfoDelay = (v: number): number => 5 * Math.pow(v / 10, 2);
const glideTime = (v: number): number => 2 * Math.pow(v / 10, 2);
/** DTN at full: semitones of spread between stacked voices. */
const DETUNE_SEMI = 0.6;
/** EG (pitch) at full: semitones, squared below. */
const EG_PITCH_SEMI = 24;
/** LFO (pitch) at full: semitones each way, squared below. */
const LFO_PITCH_SEMI = 12;
/** EG (filter) at full: octaves. */
const EG_CUT_OCT = 7;
/** LFO (filter) at full: octaves each way. */
const LFO_CUT_OCT = 4;
/** LFO 2 at full depth on CUT: octaves each way. */
const LFO2_CUT_OCT = 5;
const pct = (v: number): string => `${Math.round(v * 10)} %`;

/** WAVE: sawtooth at the bottom, square halfway, triangle at the top, crossfading between them. */
export const waveMix = (v: number): { saw: number; pulse: number; tri: number } => {
  const w = Math.min(1, Math.max(0, v / 10));
  return {
    saw: Math.max(0, 1 - 2 * w),
    pulse: 1 - Math.abs(2 * w - 1),
    tri: Math.max(0, 2 * w - 1),
  };
};
/** PW: square at 0, narrowing to a 5 % pulse at 10. */
const pulseWidth = (v: number): number => 0.5 - 0.045 * v;

/** LFO WAVE, slider position 0–4 from the bottom: the five shapes the panel prints, triangle first. */
const LFO_SHAPES: { name: string; mix: LfoMix }[] = [
  { name: 'triangle', mix: { tri: 1 } },
  { name: 'saw down', mix: { rsaw: 1 } },
  { name: 'saw up', mix: { saw: 1 } },
  { name: 'square', mix: { sq: 1 } },
  { name: 'random', mix: { sh: 1 } },
];
const lfoShape = (v: number): { name: string; mix: LfoMix } =>
  LFO_SHAPES[Math.min(4, Math.max(0, Math.round(v)))];
/** LFO TYPE, slider position 0–3. */
const LFO_TYPES = ['LOW', 'HIGH', 'TRACK', 'BPM'];
const lfoType = (v: number): string => LFO_TYPES[Math.min(3, Math.max(0, Math.round(v)))];
const lfoHz = (rate: number, type: number): number =>
  lfoType(type) === 'HIGH' ? lfoHighHz(rate) : lfoLowHz(rate);
const onOff = (v: number): string => (Math.round(v) >= 1 ? 'on' : 'off');

/** MODE → [voices per note, mono]. Six voices in all. */
const PLAY_MODES: { v: string; label: string; stack: number; mono: boolean }[] = [
  { v: 'poly', label: 'POLY', stack: 1, mono: false },
  { v: 'uniA', label: 'UNI A', stack: 6, mono: true },
  { v: 'uniB', label: 'UNI B', stack: 4, mono: true },
  { v: 'tri', label: 'TRI', stack: 2, mono: false },
  { v: 'duo', label: 'DUO', stack: 3, mono: false },
  { v: 'mono', label: 'MONO', stack: 1, mono: true },
];

const controls: Control[] = [];
const decor: Decor[] = [];
const text = (px: number, py: number, t: string, size = 22, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x: X(px), y: Y(py), text: t, size, anchor: 'middle', ...rest });
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
text(298, 92, '6-VOICE ANALOG SYNTHESIZER', 30, { weight: 700, spacing: '0.08em' });
text(333, 146, 'NYMPHES', 116, { weight: 800, spacing: '0.06em', brand: true });
decor.push({
  t: 'line',
  x1: X(80),
  y1: Y(620),
  x2: X(975),
  y2: Y(620),
  w: 5,
  stroke: PINK,
});
text(1098, 632, 'dre:adbox', 50, { weight: 500, brand: true });

/** A section's frame: a line up the left side, curving into a line across the top with the name under it. */
const section = (x0: number, x1: number, name: string, nameX: number): void => {
  decor.push({
    t: 'path',
    d: `M ${X(x0)} ${Y(578)} V ${Y(252)} Q ${X(x0)} ${Y(240)} ${X(x0 + 12)} ${Y(240)} H ${X(x1)}`,
    w: 5,
    stroke: PINK,
  });
  text(nameX, 264, name, 28, { weight: 700, anchor: 'start' });
};
section(80, 250, 'OSCILLATOR', 102);
section(410, 512, 'FILTER', 432);
section(622, 770, 'ENVELOPE', 648);
section(890, 990, 'LFO 1', 913);
// The ENVELOPE and LFO 1 names close on the right, with the menu page they double as in a box underneath.
decor.push({ t: 'path', d: `M ${X(770)} ${Y(240)} V ${Y(270)}`, w: 5, stroke: PINK });
decor.push({ t: 'path', d: `M ${X(990)} ${Y(240)} V ${Y(270)}`, w: 5, stroke: PINK });
decor.push({
  t: 'frame',
  x: X(704),
  y: Y(271),
  w: X(778) - X(704),
  h: Y(292) - Y(271),
  r: 4,
  sw: 3,
});
text(741, 288, 'REVERB', 20, { weight: 700 });
decor.push({
  t: 'frame',
  x: X(933),
  y: Y(271),
  w: X(992) - X(933),
  h: Y(292) - Y(271),
  r: 4,
  sw: 3,
});
text(962, 288, 'LFO 2', 20, { weight: 700 });

/** A filled pink label bar with panel-coloured lettering: the SHIFT labels and the button names. */
const pill = (x0: number, x1: number, y: number, labels: [number, string][], h = 16): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y - h / 2),
    w: X(x1) - X(x0),
    h: h * 2,
    r: h,
    fill: PINK,
  });
  labels.forEach(([x, t]) => text(x, y + 5, t, 21, { weight: 700, fill: PANEL }));
};
pill(85, 372, 319, [
  [125, 'PW'],
  [180, 'GLD'],
  [234, 'DTN'],
  [290, 'CHORD'],
  [345, 'EG'],
]);
pill(415, 580, 319, [
  [450, 'HPF'],
  [505, 'TRACK'],
  [559, 'LFO'],
]);
pill(627, 846, 320, [
  [662, 'A'],
  [718, 'D'],
  [773, 'S'],
  [827, 'R'],
]);
text(860, 325, 'VCA', 21, { weight: 700 });
// REVERB's row under the amp envelope's: an outlined bar, the menu page's labels in pink
decor.push({
  t: 'frame',
  x: X(627),
  y: Y(333),
  w: X(846) - X(627),
  h: Y(351) - Y(333),
  r: 18,
  sw: 3,
});
[
  [663, 'SIZE'],
  [717, 'DEC'],
  [773, 'FILT'],
  [828, 'MIX'],
].forEach(([x, t]) => text(Number(x), 347, String(t), 20, { weight: 700 }));
pill(895, 1012, 320, [
  [930, 'DELAY'],
  [985, 'FADE'],
]);

// The printed rungs between the sliders of each section.
const rungs = (x0: number, x1: number): void => {
  for (let i = 0; i < 16; i++) {
    const y = 370 + i * 10.3;
    decor.push({ t: 'line', x1: X(x0), y1: Y(y), x2: X(x1), y2: Y(y), w: 2.4, stroke: PINK });
  }
};
rungs(188, 368);
rungs(455, 565);
rungs(668, 822);
rungs(935, 982);

// WAVE's three shapes, triangle at the top; LFO WAVE's five, random at the top.
decor.push({ t: 'wave', x: X(100), y: Y(372), shape: 'tri', size: 18, w: 3 });
decor.push({ t: 'wave', x: X(100), y: Y(450), shape: 'sq', size: 18, w: 3 });
decor.push({ t: 'wave', x: X(100), y: Y(526), shape: 'saw', size: 18, w: 3 });
text(1012, 377, 'RND', 18, { weight: 700 });
decor.push({ t: 'wave', x: X(1012), y: Y(410), shape: 'sq', size: 16, w: 3 });
decor.push({ t: 'wave', x: X(1012), y: Y(450), shape: 'saw', size: 16, w: 3 });
decor.push({ t: 'wave', x: X(1012), y: Y(488), shape: 'rsaw', size: 16, w: 3 });
decor.push({ t: 'wave', x: X(1012), y: Y(526), shape: 'tri', size: 16, w: 3 });

// The labels under the sliders.
const SLOTS = [125, 180, 234, 290, 345, 449, 504, 559, 662, 717, 772, 827, 931, 986];
[
  'WAVE',
  'LVL',
  'SUB',
  'NOISE',
  'LFO',
  'CUT',
  'RES',
  'EG',
  'A',
  'D',
  'S',
  'R',
  'RATE',
  'WAVE',
].forEach((t, i) => text(SLOTS[i], 580, t, 22, { weight: 700 }));
// The slots, drawn as artwork so a slider with nothing on the open page still shows its slot.
SLOTS.forEach((x) =>
  decor.push({
    t: 'rect',
    x: X(x) - 9,
    y: Y(357),
    w: 18,
    h: Y(541) - Y(357),
    r: 3,
    fill: SLOT,
    hw: true,
  })
);

// VOLUME, in a pink arc
text(938, 98, 'VOLUME', 26, { weight: 700 });
decor.push({
  t: 'arc',
  x: X(938),
  y: Y(160),
  r: 88,
  a0: -135,
  a1: 135,
  w: 36,
  stroke: PINK,
  cap: 'butt',
});

// PRESET CONTROL: the banks over the preset numbers, joined to the rotary switch
text(1120, 92, 'PRESET CONTROL', 22, { weight: 700 });
decor.push({
  t: 'frame',
  x: X(1042),
  y: Y(98),
  w: X(1200) - X(1042),
  h: Y(136) - Y(98),
  r: 4,
  sw: 3,
});
decor.push({ t: 'line', x1: X(1042), y1: Y(116), x2: X(1200), y2: Y(116), w: 3, stroke: PINK });
'ABCDEFG'.split('').forEach((b, i) => {
  const x = 1055 + i * 22.2;
  text(x, 112, b, 16, { weight: 700 });
  text(x, 132, String(i + 1), 18, { weight: 700 });
  decor.push({
    t: 'path',
    d: `M ${X(x)} ${Y(137)} V ${Y(150 + Math.abs(i - 3) * 6)} L ${X(1125 + (i - 3) * 9)} ${Y(178)}`,
    w: 3,
    stroke: PINK,
  });
});
decor.push({ t: 'circle', x: X(1125), y: Y(206), r: 70, fill: PINK });

// SHIFT and SAVE / LOAD
pill(1047, 1107, 321, [[1077, 'SHIFT']]);
pill(1135, 1192, 321, [[1163, 'SAVE']]);
text(1164, 345, 'LOAD', 21, { weight: 700 });

// MENU: the numbered menu and, on the right, the MODE page's submenu
decor.push({
  t: 'frame',
  x: X(1037),
  y: Y(357),
  w: X(1207) - X(1037),
  h: Y(579) - Y(357),
  r: 8,
  sw: 4,
});
text(1043, 386, 'MENU', 26, { weight: 700, anchor: 'start' });
decor.push({ t: 'line', x1: X(1037), y1: Y(400), x2: X(1207), y2: Y(400), w: 3, stroke: PINK });
decor.push({ t: 'line', x1: X(1182), y1: Y(400), x2: X(1182), y2: Y(552), w: 3, stroke: PINK });
const MENU_ROWS = ['MODE', 'LFO 2', 'REVERB', 'MOD W', 'VELO', 'AFTER', 'MIDI C'];
const SUB_ROWS = ['POLY', 'UNI A', 'UNI B', 'TRI', 'DUO', 'MONO', 'CHORD'];
MENU_ROWS.forEach((t, i) => {
  const y = 418 + i * 25;
  decor.push({
    t: 'line',
    x1: X(1037),
    y1: Y(y - 17),
    x2: X(1105),
    y2: Y(y - 17),
    w: 2,
    stroke: PINK,
  });
  text(1046, y, String(i + 1), 21, { weight: 700 });
  text(1058, y, t, 21, { weight: 700, anchor: 'start' });
  text(1145, y, SUB_ROWS[i], 21, { weight: 700 });
  text(1195, y, String(i + 1), 21, { weight: 700 });
});
decor.push({ t: 'line', x1: X(1105), y1: Y(400), x2: X(1105), y2: Y(579), w: 2, stroke: PINK });

// ── Controls ──────────────────────────────────────────────────────────────
const FADER_Y = Y(448);
/** The menu pages the app models. `none` is the panel with MENU off. */
type Page = 'none' | 'mode' | 'lfo2' | 'reverb';
const on = (pages: Page[], shift?: boolean): ShowCondition[] => [
  pages.length === 1 ? { id: 'ui.page', eq: pages[0] } : { id: 'ui.page', in: pages },
  ...(shift === undefined ? [] : [{ id: 'ui.shift', eq: shift }]),
];
const MAIN: Page[] = ['none', 'mode'];
const fader = (
  id: string,
  slot: number,
  module: Control['module'],
  show: ShowCondition[],
  rest: FaderRest
): void => {
  controls.push({
    id,
    type: 'fader',
    x: X(SLOTS[slot - 1]),
    y: FADER_Y,
    len: 320,
    orient: 'v',
    ticks: 0,
    pad: 14,
    cap: 'black',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    module,
    show,
    ...rest,
  });
};
const SHIFTED = ' The label above the slider: it moves this while SHIFT is lit.';
const NOT_GIVEN = ' The manual gives no times; the readout is the app’s estimate.';

// OSCILLATOR
fader('osc.wave', 1, 'osc', on(MAIN, false), {
  label: 'WAVE',
  def: 0,
  fmt: (v) => {
    const m = waveMix(v);
    if (m.saw === 1) return 'sawtooth';
    if (m.pulse === 1) return 'square';
    if (m.tri === 1) return 'triangle';
    return m.saw > 0 ? 'saw → square' : 'square → triangle';
  },
  help: 'Morphs the oscillator’s wave: sawtooth at the bottom, square halfway, triangle at the top, blending smoothly between them.',
});
fader('osc.pw', 1, 'osc', on(MAIN, true), {
  label: 'PW',
  def: 0,
  fmt: (v) => `${Math.round(pulseWidth(v) * 100)} %`,
  help: `Narrows the square part of the wave into a thinner, nasal pulse. With WAVE on a pure sawtooth or triangle there is no pulse, so it does nothing.${SHIFTED}`,
});
fader('osc.level', 2, 'mixer', on(['none'], false), {
  label: 'LVL',
  def: 10,
  fmt: pct,
  help: 'How loud the oscillator is in the mix going into the filter.',
});
fader('glide.time', 2, 'glide', on(['none'], true), {
  label: 'GLD',
  def: 0,
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: `Glide: each new note slides in pitch from the last one instead of jumping. On the hardware it is a fixed rate, so a wider leap takes longer; here it is a time.${SHIFTED}`,
});
fader('osc.sub', 3, 'mixer', on(MAIN, false), {
  label: 'SUB',
  def: 0,
  fmt: pct,
  help: 'Adds a square wave an octave below the oscillator, for weight underneath.',
});
fader('voice.detune', 3, 'mode', on(MAIN, true), {
  label: 'DTN',
  def: 0,
  fmt: (v) => `±${Math.round(v * DETUNE_SEMI * 10)} cents`,
  help: `Detunes the voices stacked on each note against each other, from a slow shimmer to a sour spread. It is heard in the modes that stack voices (UNI A, UNI B, TRI, DUO); here it does nothing in POLY and MONO.${SHIFTED}`,
});
fader('noise.level', 4, 'mixer', on(MAIN, false), {
  label: 'NOISE',
  def: 0,
  fmt: pct,
  help: 'Mixes white noise in with the oscillator and sub: breath, wind and hiss, or the body of a drum.',
});
fader('voice.chord', 4, 'mode', on(MAIN, true), {
  label: 'CHORD',
  def: 0,
  fmt: (v) => (v <= 0.2 ? 'off' : `chord ${Math.min(7, Math.ceil((v / 10) * 7))}`),
  help: `On the hardware, chooses one of the seven chords stored with the preset, each played into it from a keyboard, so one key plays a chord in the stacked modes. The chords are the player’s own and the spec gives none, so here it does nothing.${SHIFTED}`,
});
fader('lfo1.pitch', 5, 'lfo', on(MAIN, false), {
  label: 'LFO',
  name: 'LFO (pitch)',
  def: 0,
  fmt: (v) => `±${(LFO_PITCH_SEMI * Math.pow(v / 10, 2)).toFixed(2)} st`,
  help: 'How far LFO 1 moves the oscillator’s pitch: a touch of vibrato low down, a siren further up.',
});
fader('env1.pitch', 5, 'env', on(MAIN, true), {
  label: 'EG',
  name: 'EG (pitch)',
  def: 0,
  fmt: (v) => `+${(EG_PITCH_SEMI * Math.pow(v / 10, 2)).toFixed(1)} st`,
  help: `How far the filter envelope bends the oscillator’s pitch up at the start of each note, then back down: a blip, a zap or a falling drum.${SHIFTED}`,
});

// FILTER
fader('vcf.cutoff', 6, 'filter', on(MAIN, false), {
  label: 'CUT',
  name: 'CUT (cutoff)',
  def: 10,
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'The low-pass filter’s cutoff, 32.7 Hz to 16.7 kHz: down for darker, up for brighter.',
});
fader('hpf.cutoff', 6, 'filter', on(MAIN, true), {
  label: 'HPF',
  def: 0,
  fmt: (v) => fmtHz(hpfHz(v)),
  help: `A gentle high-pass after the low-pass, on all six voices together: raise it to thin out the bass. With the low-pass, the two make a band-pass.${SHIFTED}`,
});
fader('vcf.res', 7, 'filter', on(MAIN, false), {
  label: 'RES',
  name: 'RES (resonance)',
  def: 0,
  fmt: pct,
  help: 'Boosts the frequencies at the cutoff into a ringing peak. At the top the filter whistles on its own, a sine wave it can play by itself.',
});
fader('vcf.track', 7, 'filter', on(MAIN, true), {
  label: 'TRACK',
  def: 0,
  fmt: pct,
  help: `How far the cutoff follows the keys, so higher notes are as bright as low ones. At the top it follows note for note, so a self-oscillating filter plays in tune.${SHIFTED}`,
});
fader('vcf.env', 8, 'filter', on(MAIN, false), {
  label: 'EG',
  name: 'EG (filter)',
  def: 0,
  fmt: (v) => `+${((EG_CUT_OCT * v) / 10).toFixed(1)} oct`,
  help: 'How far the filter envelope opens the cutoff on each note: the bite or swell at the start of the sound.',
});
fader('vcf.lfo', 8, 'filter', on(MAIN, true), {
  label: 'LFO',
  name: 'LFO (filter)',
  def: 0,
  fmt: (v) => `±${((LFO_CUT_OCT * v) / 10).toFixed(1)} oct`,
  help: `How far LFO 1 sweeps the cutoff up and down: a wah, a wobble or a slow wash.${SHIFTED}`,
});

// ENVELOPE, and REVERB on the same four sliders
const STAGES: [string, string, string][] = [
  ['attack', 'A', 'how long it takes to rise to its peak after a key goes down'],
  ['decay', 'D', 'how long it takes to fall from the peak to the sustain level'],
  ['sustain', 'S', 'the level it holds while the key is held'],
  ['release', 'R', 'how long it takes to fall away after the key is let go'],
];
const ENV_DEFS: Record<string, number[]> = { env1: [0, 5, 5, 3], env2: [0, 5, 10, 2] };
STAGES.forEach(([stage, label, what], i) => {
  const isTime = stage !== 'sustain';
  const fmt = isTime ? (v: number) => fmtTime(envTime(v)) : pct;
  fader(`env1.${stage}`, 9 + i, 'env', on(MAIN, false), {
    label,
    name: `Filter EG ${label}`,
    def: ENV_DEFS.env1[i],
    fmt,
    help: `The filter envelope, which moves the cutoff by EG and the pitch by EG above the oscillator: ${what}.${isTime ? NOT_GIVEN : ''}`,
  });
  fader(`env2.${stage}`, 9 + i, 'amp', on(MAIN, true), {
    label,
    name: `Amp EG ${label}`,
    def: ENV_DEFS.env2[i],
    fmt,
    help: `The amp envelope (VCA), which shapes each note’s loudness: ${what}.${isTime ? NOT_GIVEN : ''}${SHIFTED}`,
  });
});
const REVERB = ' On the REVERB menu page (MENU 3), where the other sliders do nothing.';
fader('rev.size', 9, 'fx', on(['reverb']), {
  label: 'SIZE',
  name: 'Reverb SIZE',
  def: 5,
  fmt: pct,
  help: `The size of the reverb’s space, from a small room to a hall.${REVERB}`,
});
fader('rev.decay', 10, 'fx', on(['reverb']), {
  label: 'DEC',
  name: 'Reverb DEC',
  def: 5,
  fmt: (v) => fmtTime(expMap(v / 10, 0.2, 4.9)),
  help: `How long the reverb’s tail rings on.${REVERB}`,
});
fader('rev.filter', 11, 'fx', on(['reverb']), {
  label: 'FILT',
  name: 'Reverb FILT',
  def: 3,
  fmt: (v) => fmtHz(revCut(v)),
  help: `A low-pass on the reverb: up for a darker, softer tail.${REVERB}`,
});
fader('rev.mix', 12, 'fx', on(['reverb']), {
  label: 'MIX',
  name: 'Reverb MIX',
  def: 0,
  fmt: pct,
  help: `How much reverb against the dry sound. At the bottom the reverb is off.${REVERB}`,
});

// LFO 1, and LFO 2 on its menu page
fader('lfo1.rate', 13, 'lfo', on(['none'], false), {
  label: 'RATE',
  name: 'LFO 1 RATE',
  def: 5,
  fmt: (v, all) => fmtHz(lfoHz(v, all ? num(all, 'lfo1.type') : 0)),
  help: 'How fast LFO 1 cycles. LFO 1 runs separately in each voice, and only moves the pitch and the cutoff.',
});
fader('lfo1.delay', 13, 'lfo', on(['none'], true), {
  label: 'DELAY',
  name: 'LFO 1 DELAY',
  def: 0,
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(lfoDelay(v))),
  help: `How long after each note LFO 1 waits before fading in, so a held note takes on vibrato only once it has sounded.${NOT_GIVEN}${SHIFTED}`,
});
fader('lfo1.wave', 14, 'lfo', on(['none'], false), {
  label: 'WAVE',
  name: 'LFO 1 WAVE',
  def: 0,
  max: 4,
  step: 1,
  fmt: (v) => lfoShape(v).name,
  help: 'LFO 1’s shape, five steps from the bottom: triangle, saw down, saw up, square and random (sample and hold).',
});
fader('lfo1.fade', 14, 'lfo', on(['none'], true), {
  label: 'FADE',
  name: 'LFO 1 FADE',
  def: 0,
  fmt: pct,
  help: `On the hardware, how long LFO 1 runs before it fades away (at 0 it never does; with DELAY at 0 and FADE full it runs one cycle). The app’s engine has no fade, so here it does nothing.${SHIFTED}`,
});
const LFO2 =
  ' On the LFO 2 menu page (MENU 2). LFO 2 is one wave shared by all six voices; on this page the other sliders set how far it moves each of them.';
fader('lfo2.rate', 13, 'lfo', on(['lfo2'], false), {
  label: 'RATE',
  name: 'LFO 2 RATE',
  def: 4,
  fmt: (v, all) => fmtHz(lfoHz(v, all ? num(all, 'lfo2.type') : 0)),
  help: `How fast LFO 2 cycles.${LFO2}`,
});
fader('lfo2.delay', 13, 'lfo', on(['lfo2'], true), {
  label: 'DELAY',
  name: 'LFO 2 DELAY',
  def: 0,
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(lfoDelay(v))),
  help: `How long after a note LFO 2 waits before fading in.${NOT_GIVEN}${LFO2}`,
});
fader('lfo2.wave', 14, 'lfo', on(['lfo2'], false), {
  label: 'WAVE',
  name: 'LFO 2 WAVE',
  def: 0,
  max: 4,
  step: 1,
  fmt: (v) => lfoShape(v).name,
  help: `LFO 2’s shape: triangle, saw down, saw up, square and random, from the bottom.${LFO2}`,
});
fader('lfo2.fade', 14, 'lfo', on(['lfo2'], true), {
  label: 'FADE',
  name: 'LFO 2 FADE',
  def: 0,
  fmt: pct,
  help: `On the hardware, how long LFO 2 runs before fading away. The app’s engine has no fade, so here it does nothing.${LFO2}`,
});
// LFO 2's depths: each slider on the LFO 2 page sets how far LFO 2 moves that slider's parameter
const DEPTH = (what: string, shifted: boolean): string =>
  `How far LFO 2 moves ${what}: the slider’s position is the depth, and at the bottom LFO 2 leaves it alone.${shifted ? ' SHIFT lit, as for the parameter it moves.' : ''}${LFO2}`;
fader('lfo2.pw', 1, 'lfo', on(['lfo2'], true), {
  label: 'PW',
  name: 'LFO 2 → PW',
  def: 0,
  fmt: pct,
  help: DEPTH('the pulse width (PW): the shifting, chorused sound of pulse-width modulation', true),
});
fader('lfo2.level', 2, 'lfo', on(['lfo2'], false), {
  label: 'LVL',
  name: 'LFO 2 → LVL',
  def: 0,
  fmt: pct,
  help: DEPTH('the oscillator’s level (LVL): a tremolo on the oscillator alone', false),
});
fader('lfo2.noise', 4, 'lfo', on(['lfo2'], false), {
  label: 'NOISE',
  name: 'LFO 2 → NOISE',
  def: 0,
  fmt: pct,
  help: DEPTH('the noise level: waves of hiss, surf or wind', false),
});
fader('lfo2.cutoff', 6, 'lfo', on(['lfo2'], false), {
  label: 'CUT',
  name: 'LFO 2 → CUT',
  def: 0,
  fmt: (v) => `±${((LFO2_CUT_OCT * v) / 10).toFixed(1)} oct`,
  help: DEPTH('the cutoff (CUT), every voice in step, unlike LFO 1’s', false),
});
fader('lfo2.res', 7, 'lfo', on(['lfo2'], false), {
  label: 'RES',
  name: 'LFO 2 → RES',
  def: 0,
  fmt: pct,
  help: DEPTH('the resonance (RES)', false),
});

// The MODE page: the play mode on the menu legend's right-hand column, and the settings the menu map holds
controls.push({
  id: 'voice.mode',
  type: 'select',
  x: X(1195),
  y: Y(493),
  w: 30,
  h: 30,
  lamp: 'white',
  kind: 'enum',
  def: 'poly',
  label: 'MODE',
  name: 'Play MODE',
  labelPos: 'none',
  module: 'mode',
  show: on(['mode']),
  options: PLAY_MODES.map((m, i) => ({ v: m.v, label: m.label, x: X(1195), y: Y(411 + i * 25) })),
  help: 'How the six voices are shared out. POLY plays six notes, one voice each. UNI A stacks all six on one note and UNI B four; TRI plays three notes of two voices and DUO two notes of three; MONO plays one voice. On the MODE menu page (MENU 1, then MENU again and the rotary switch).',
});
const MODE_PAGE =
  ' On the hardware it is set in the menu, where the spec cannot say; here it is on the MODE page (MENU 1).';
fader('glide.legato', 2, 'glide', on(['mode']), {
  label: 'LEGATO',
  def: 0,
  max: 1,
  step: 1,
  fmt: onOff,
  help: `On: glide only between notes played legato, overlapping the last. Off: every note glides.${MODE_PAGE}`,
});
fader('lfo1.type', 13, 'lfo', on(['mode'], false), {
  label: 'TYPE',
  name: 'LFO 1 TYPE',
  def: 0,
  max: 3,
  step: 1,
  fmt: lfoType,
  help: `LFO 1’s range: LOW for sweeps and vibrato, HIGH up into audio rates. TRACK sets the rate from the key and BPM follows MIDI clock; here TRACK plays as LOW, as BPM does with no clock coming in.${MODE_PAGE}`,
});
fader('lfo1.sync', 14, 'lfo', on(['mode'], false), {
  label: 'KEY SYNC',
  name: 'LFO 1 KEY SYNC',
  def: 1,
  max: 1,
  step: 1,
  fmt: onOff,
  help: `On: LFO 1 starts its cycle again with each note. Off: it runs freely.${MODE_PAGE}`,
});
fader('lfo2.type', 13, 'lfo', on(['mode'], true), {
  label: 'TYPE',
  name: 'LFO 2 TYPE',
  def: 0,
  max: 3,
  step: 1,
  fmt: lfoType,
  help: `LFO 2’s range: LOW or HIGH; TRACK and BPM play as LOW here.${MODE_PAGE} With SHIFT lit.`,
});
fader('lfo2.sync', 14, 'lfo', on(['mode'], true), {
  label: 'KEY SYNC',
  name: 'LFO 2 KEY SYNC',
  def: 0,
  max: 1,
  step: 1,
  fmt: onOff,
  help: `On: LFO 2 starts its cycle again with each note. Off: it runs freely.${MODE_PAGE} With SHIFT lit.`,
});

// The knobs and buttons
controls.push({
  id: 'out.volume',
  type: 'knob',
  x: X(938),
  y: Y(160),
  r: 58,
  style: 'd-silver',
  ring: false,
  kind: 'cont',
  min: 0,
  max: 10,
  def: 8,
  label: 'VOLUME',
  labelPos: 'none',
  module: 'out',
  fmt: pct,
  help: 'The level at the line output and headphones.',
});
controls.push({
  id: 'ui.preset',
  type: 'knob',
  x: X(1125),
  y: Y(206),
  r: 58,
  style: 'd-silver',
  ring: false,
  ui: true,
  kind: 'enum',
  def: '1',
  options: ['1', '2', '3', '4', '5', '6', '7'].map((v, i) => ({ v, label: '', a: -60 + i * 20 })),
  label: 'PRESET',
  name: 'Rotary switch',
  labelPos: 'none',
  module: 'mode',
  help: 'On the hardware, picks the bank (with SHIFT) and the preset 1–7 for LOAD and SAVE, and the menu item with MENU. Here the sounds are in the app’s library, so it does nothing.',
});
controls.push({
  id: 'ui.shift',
  type: 'button',
  x: X(1063),
  y: Y(290),
  w: 34,
  h: 34,
  lamp: 'white',
  ui: true,
  kind: 'bool',
  def: false,
  label: 'SHIFT',
  labelPos: 'none',
  module: 'mode',
  help: 'While lit, each slider moves the parameter printed above it instead of the one below: 14 sliders, 28 parameters. On the hardware, hold it or double-click it to keep it lit; here a click turns it on and off.',
});
controls.push({
  id: 'ui.save',
  type: 'button',
  x: X(1165),
  y: Y(290),
  w: 34,
  h: 34,
  ui: true,
  kind: 'bool',
  def: false,
  label: 'SAVE / LOAD',
  labelPos: 'none',
  module: 'mode',
  help: 'On the hardware, loads a preset (a click for the user one, held for the factory one) and, with SHIFT, saves one. Here the app’s library holds the sounds, so it does nothing.',
});
controls.push({
  id: 'ui.page',
  type: 'button',
  x: X(1165),
  y: Y(378),
  w: 34,
  h: 34,
  lamp: 'white',
  ui: true,
  kind: 'enum',
  def: 'none',
  options: [
    { v: 'none', label: 'off' },
    { v: 'mode', label: '1 MODE' },
    { v: 'lfo2', label: '2 LFO 2' },
    { v: 'reverb', label: '3 REVERB' },
  ],
  label: 'MENU',
  labelPos: 'none',
  module: 'mode',
  help: 'Steps through the menu pages that change what the sliders do: 1 MODE (the play mode, LEGATO and the LFO types), 2 LFO 2 and 3 REVERB, then back off. On the hardware MENU and the rotary switch choose one of seven; MOD W, VELO, AFTER and MIDI C are not modelled.',
});

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: X(x1) - X(x0),
  h: Y(y1) - Y(y0),
});
const areas: Area[] = [
  {
    id: 'osc',
    label: 'Oscillator',
    module: 'osc',
    keywords:
      'vco wave sawtooth square triangle pulse width sub noise glide portamento detune chord pitch',
    rects: [R(76, 236, 404, 600)],
    help: 'One oscillator per voice, with a sub an octave down and white noise. WAVE morphs from sawtooth through square to triangle and LVL, SUB and NOISE mix the three. With SHIFT: PW, glide, the detune between stacked voices, the chord, and the filter envelope on the pitch.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf low-pass lowpass high-pass highpass band-pass cutoff resonance key tracking',
    rects: [R(404, 236, 604, 600)],
    help: 'A 24 dB resonant low-pass per voice (CUT, RES, and EG for how far the filter envelope opens it), then a 6 dB high-pass on all the voices together (HPF). With SHIFT: HPF, key TRACK, and LFO 1 on the cutoff.',
  },
  {
    id: 'env',
    label: 'Envelope and reverb',
    module: 'env',
    keywords: 'eg adsr attack decay sustain release vca amplitude reverb size decay filter mix',
    rects: [R(604, 236, 872, 600)],
    help: 'Two ADSR envelopes on four sliders: the filter envelope normally, the amp envelope (VCA) with SHIFT lit. On the REVERB menu page the same four set the reverb’s SIZE, DEC (decay), FILT (a low-pass on it) and MIX.',
  },
  {
    id: 'lfo',
    label: 'LFO 1 and LFO 2',
    module: 'lfo',
    keywords:
      'low frequency oscillator vibrato wobble rate shape delay fade sample and hold random',
    rects: [R(872, 236, 1028, 600)],
    help: 'LFO 1 runs in each voice and moves only the pitch and the cutoff (the LFO sliders in OSCILLATOR and FILTER set how far). RATE and WAVE, and with SHIFT, DELAY and FADE. On the LFO 2 menu page they set LFO 2, one LFO for all the voices, whose depths the other sliders set there.',
  },
  {
    id: 'volume',
    label: 'Volume',
    module: 'out',
    keywords: 'master output level headphones',
    rects: [R(860, 70, 1028, 236)],
    help: 'The output and headphone level.',
  },
  {
    id: 'presets',
    label: 'Preset control',
    module: 'mode',
    keywords: 'rotary switch bank preset patch memory load save shift',
    rects: [R(1028, 70, 1215, 352)],
    help: 'The rotary switch picks a bank and preset (49 user and 49 factory) for SAVE and LOAD, and a menu item with MENU. SHIFT makes every slider move the parameter printed above it. Here the app’s library holds the sounds, so the switch and SAVE / LOAD do nothing.',
  },
  {
    id: 'menu',
    label: 'Menu',
    module: 'mode',
    keywords:
      'menu page play mode poly unison uni tri duo mono chord lfo2 reverb mod wheel velocity aftertouch midi',
    rects: [R(1028, 352, 1215, 600)],
    help: 'MENU opens the settings the sliders double for: 1 MODE (how the six voices are shared out, on the right-hand column), 2 LFO 2 and 3 REVERB. Here MENU steps through those three. MOD W, VELO and AFTER set how far the mod wheel, velocity and aftertouch move each slider’s parameter, and MIDI C the MIDI channel; those are not modelled.',
  },
];

// ── toEngine ──────────────────────────────────────────────────────────────
/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
/** FILT: no filtering at 0, closing to 800 Hz at 10. */
function revCut(v: number): number {
  return expMap(1 - v / 10, 800, 20000);
}
function reverbSlot(v: ControlValues): FxSlot {
  const base = FX_DEFAULTS.get('hallrev');
  // a literal id: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error('Nymphes: no effects algorithm hallrev');
  return {
    alg: 'hallrev',
    level: 1,
    p: {
      ...base,
      SIZ: Math.round(expMap(num(v, 'rev.size') / 10, 2, 200)),
      DCY: Number(expMap(num(v, 'rev.decay') / 10, 0.2, 4.9).toFixed(2)),
      HC: Math.round(revCut(num(v, 'rev.filter'))),
      MIX: Math.round(num(v, 'rev.mix') * 10),
    },
  };
}

function toEngine(v: ControlValues): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src, dst, amt });
  };
  // the fixed modulation: LFO 1 and the filter envelope to the pitch, LFO 1 to the cutoff
  route('lfo', 'pitchAll', LFO_PITCH_SEMI * Math.pow(num(v, 'lfo1.pitch') / 10, 2));
  route('env1', 'pitchAll', EG_PITCH_SEMI * Math.pow(num(v, 'env1.pitch') / 10, 2));
  route('lfo', 'cutoff', (LFO_CUT_OCT * num(v, 'vcf.lfo')) / 10);
  // LFO 2's depths
  route('lfo2', 'pw1', 0.45 * (num(v, 'lfo2.pw') / 10));
  route('lfo2', 'lvl1', 0.5 * (num(v, 'lfo2.level') / 10));
  route('lfo2', 'noiseLvl', 0.6 * (num(v, 'lfo2.noise') / 10));
  route('lfo2', 'cutoff', (LFO2_CUT_OCT * num(v, 'lfo2.cutoff')) / 10);
  route('lfo2', 'res', num(v, 'lfo2.res') / 10);

  const mode = PLAY_MODES.find((m) => m.v === v['voice.mode']) ?? PLAY_MODES[0];
  const revOn = num(v, 'rev.mix') > 0;
  const env = (e: 'env1' | 'env2') => ({
    a: envTime(num(v, `${e}.attack`)),
    d: envTime(num(v, `${e}.decay`)),
    s: num(v, `${e}.sustain`) / 10,
    r: envTime(num(v, `${e}.release`)),
  });
  const delay1 = num(v, 'lfo1.delay');
  const delay2 = num(v, 'lfo2.delay');
  return {
    osc: [
      {
        level: level10(num(v, 'osc.level'), 0.5),
        mix: waveMix(num(v, 'osc.wave')),
        pw: pulseWidth(num(v, 'osc.pw')),
        semi: 0,
        kbd: true,
        syncTo: -1,
        subLevel: level10(num(v, 'osc.sub'), 0.5),
      },
    ],
    noise: { level: level10(num(v, 'noise.level'), 0.6), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * 1.1,
      envAmt: (EG_CUT_OCT * num(v, 'vcf.env')) / 10,
      envSrc: 'env1',
      kbd: num(v, 'vcf.track') / 10,
    },
    env1: env('env1'),
    env2: env('env2'),
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo1.rate'), num(v, 'lfo1.type')),
      mix: lfoShape(num(v, 'lfo1.wave')).mix,
      keySync: num(v, 'lfo1.sync') >= 1,
      ...(delay1 > 0 ? { delay: lfoDelay(delay1) } : {}),
    },
    lfo2: {
      rate: lfoHz(num(v, 'lfo2.rate'), num(v, 'lfo2.type')),
      mix: lfoShape(num(v, 'lfo2.wave')).mix,
      common: true,
      ...(delay2 > 0 ? { delay: lfoDelay(delay2) } : {}),
    },
    glide: { time: glideTime(num(v, 'glide.time')), legato: num(v, 'glide.legato') >= 1 },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: {
      voices: 6,
      stack: mode.stack,
      mono: mode.mono,
      detune: (num(v, 'voice.detune') / 10) * DETUNE_SEMI,
    },
    post: { hpf: hpfHz(num(v, 'hpf.cutoff')), boost: false },
    fx: revOn
      ? {
          mode: 'insert',
          routing: 1,
          slots: [reverbSlot(v), { alg: null }, { alg: null }, { alg: null }],
        }
      : { mode: 'bypass' },
    routes,
    normals: {},
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const nymphes: SynthDef & { version: number } = {
  id: 'nymphes',
  version: 1,
  name: 'Nymphes',
  maker: 'Dreadbox',
  year: 2021,
  heritage:
    'An original six-voice analogue desktop poly from Greece, after the simplicity of the Sequential Six-Trak',
  summary:
    'Six analogue voices, each one oscillator morphing sawtooth → square → triangle, a sub an octave down and white noise → a 24 dB resonant low-pass → the VCA; then a 6 dB high-pass on all six and a digital reverb. A filter and an amp envelope and an LFO per voice, a shared LFO 2, and six play modes from six-voice poly to six-voice unison.',
  view: { w: X(1245), h: Y(665) },
  theme: {
    panel: PANEL,
    panel2: '#22358f',
    ink: PINK,
    font: 'din',
    weight: 700,
    cheeks: 'none',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
};

export default nymphes;
