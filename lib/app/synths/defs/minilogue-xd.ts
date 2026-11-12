/**
 * Korg minilogue xd: the definition (D1). Positions are measured on the 1800 × 1132 product photo of the keyboard
 * (`.context/app/synth-data/minilogue-xd/raw/Korg Minilogue XD.jpg`, local only) and written in view units of half a
 * photo pixel, from photo (105, 95): view x = (photo x − 105) × 2, y = (photo y − 95) × 2. The view is the faceplate from
 * the joystick to the effects and down to the joystick, cropped close; the logo strip (its marks are left out) and the
 * keys are not in it. The owner's spec is `.context/app/synth-data/minilogue-xd/minilogue-xd.synth.json`
 * (the minilogue xd / xd module Owner's Manual).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/take-5.ts`, the nearest
 * instrument: a compact modern polysynth with effects, a display and a sequencer, here four voices, each two VCOs and
 * the digital MULTI ENGINE → the mixer → a resonant low-pass VCF with DRIVE → the VCA, with an ADSR on the VCA, an
 * attack-decay EG to pitch or cutoff, and an LFO. The joystick is the Mantis's (`defs/mantis.ts`). No content (sounds,
 * lineage, unusual notes), a `version`, no maker's marks (the KORG logo and the minilogue xd lettering are on the
 * logo strip, outside the view), and panel values read through `num()`.
 *
 * The engine work this needed is t-243 (the MULTI ENGINE: `mix.mnoise`, `mix.vpm`) and t-244 (the CHORD voice mode,
 * the 1-SHOT LFO and the saw SHAPE: `poly.chord`, `lfo.oneShot`, `mix.sfold`). The MULTI ENGINE is the engine's third
 * oscillator, with its own pulse-width input (`pwSplit`), so the LFO can reach its SHAPE alone.
 *
 * Panel modes, as on the Take 5: one VOICE MODE DEPTH knob is four controls, one per voice mode, shown while that mode
 * is chosen; the TYPE knob is one control per engine; and the effects' OFF/ON switch, TIME and DEPTH are one set per
 * effect, shown while DEL/REV/MOD picks it. The menus behind EDIT MODE are pages on the display, stepped by the EDIT
 * MODE button, as the DeepMind's are (`defs/deepmind-12d.ts`).
 *
 * The manual gives no envelope times, VCO range, filter slope or modulation depths (`not_in_source`), and says nothing
 * on the VPM types beyond a line each: every curve below is the app's estimate, said so where it is defined. The
 * effects run on the DeepMind's effects engine (`audio/dm-fx.ts`): slot 1 the modulation effect, slot 2 the delay,
 * slot 3 the reverb, in that order (the manual does not give it), each the nearest algorithm there.
 */
import type {
  ArpMode,
  Area,
  ButtonControl,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  FxSlot,
  KnobControl,
  LfoMix,
  MenuControl,
  OscMix,
  OscParams,
  PolyParams,
  SeqButton,
  ShowCondition,
  SynthDef,
  TextDecor,
  ToggleControl,
  ViewRect,
  VpmParams,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  clamp,
  expMap,
  fmtHz,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos'>;
type ToggleRest = OmitEach<ToggleControl, 'id' | 'type' | 'x' | 'y' | 'w' | 'labelPos'>;
type ButtonRest = Pick<ButtonControl, 'label' | 'name' | 'help'> &
  Partial<Pick<ButtonControl, 'ui' | 'module' | 'lamp' | 'show' | 'lit'>> &
  ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string });
type MenuRest = OmitEach<
  MenuControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'size' | 'vw' | 'show' | 'label'
>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor'>>;

const X = (x: number): number => (x - 105) * 2;
const Y = (y: number): number => (y - 95) * 2;
const INK = '#d4d5d8';
const SLOT = '#08090a';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// None of these is in the manual (`not_in_source`): the envelope times, the cutoff range, the portamento and the
// modulation depths are the app's estimates, in the range of the other polysynths here.
const ENV_PTS: CurvePoint[] = [
  [0, 0.0006],
  [256, 0.02],
  [512, 0.25],
  [768, 2],
  [1023, 12],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
/** The LFO's free speed, 0.05 to 28 Hz (the manual's range), exponential. */
const lfoHz = (v: number): number => expMap(v / 1023, 0.05, 28);
const vcfHz = (v: number): number => expMap(v / 1023, 20, 20000);
const portaTime = (v: number): number => 4 * Math.pow(v / 127, 2);
const pct1023 = (v: number): string => `${Math.round((v / 1023) * 100)} %`;
const signedPct = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} %`;
/** EG INT at ±100 % on pitch: ±48 semitones, squared so the middle of the knob is fine (reasoned). */
const EG_PITCH_ST = 48;
/** EG INT at ±100 % on cutoff: ±6 octaves (reasoned). */
const EG_CUT_OCT = 6;
/** LFO INT at full, on each target (reasoned): cutoff in octaves, pitch in semitones (squared), shape in its own unit. */
const LFO_CUT_OCT = 4;
const LFO_PITCH_ST = 12;
const LFO_SHAPE = 0.5;
/** CROSS MOD DEPTH at full: semitones of VCO 1 into VCO 2's pitch, squared (reasoned). */
const XMOD_ST = 36;
/** Each mixer channel's level at full. */
const MIX_LEVEL = 0.6;

const controls: Control[] = [];
const decor: Decor[] = [];
const seqButtons: Record<string, SeqButton> = {};

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x: number, y: number, t: string, size = 18, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y),
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
/** Text centred on y (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 18, rest: TextRest = {}): void =>
  text(x, y + size * 0.18, t, size, rest);
const line = (x1: number, y1: number, x2: number, y2: number, w = 2): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w });
};
const led = (x: number, y: number, litWhen: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r: 7, color: 'white', litWhen });
};
/** A dark slot behind a lever switch. */
const slot = (x: number, y: number, w: number, h: number): void => {
  decor.push({ t: 'rect', x: X(x - w / 2), y: Y(y - h / 2), w: w * 2, h: h * 2, r: w, fill: SLOT });
};

/** A knob; `lab` is the printed name, 43 photo pixels below it (null: none, or drawn separately). */
const knob = (
  id: string,
  x: number,
  y: number,
  lab: string | null,
  rest: KnobRest,
  r = 40
): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r,
    style: 'pro1',
    labelPos: 'none',
    ...rest,
  });
  if (lab) label(x, y + 43, lab);
};
/** A lever switch: an enum of three, top to bottom (or a bool, on at the top), its bat long as the hardware's. */
const lever = (id: string, x: number, y: number, rest: ToggleRest): void => {
  slot(x, y, 22, 66);
  controls.push({
    id,
    type: 'toggle',
    x: X(x),
    y: Y(y),
    w: 30,
    lean: 3.6,
    labelPos: 'none',
    tip: '#c9cacd',
    ...rest,
  });
};
/** A flat rectangular key. */
const btn = (id: string, x: number, y: number, rest: ButtonRest, w = 58, h = 30): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w,
    h,
    kind: 'bool',
    def: false,
    module: 'mode',
    labelPos: 'none',
    ...rest,
  });
};
const NOT_HERE = 'Not modelled here.';

// ── Faceplate artwork ─────────────────────────────────────────────────────
[
  [229, 120, 428],
  [330, 120, 428],
  [762, 120, 428],
  [862, 120, 428],
  [964, 120, 428],
  [1372, 120, 428],
].forEach(([x, y0, y1]) => line(x, y0, x, y1));
const SECTIONS: [number, number, string][] = [
  [557, 127, 'VCO 1'],
  [557, 229, 'VCO 2'],
  [557, 332, 'MULTI ENGINE'],
  [812, 127, 'MIXER'],
  [913, 127, 'FILTER'],
  [1168, 127, 'AMP EG'],
  [1168, 229, 'EG'],
  [1168, 332, 'LFO'],
  [1525, 127, 'EFFECTS'],
];
SECTIONS.forEach(([x, y, t]) => label(x, y, t, 26, { weight: 500 }));

// ── Master: MASTER, TEMPO, OCTAVE ─────────────────────────────────────────
knob('out.master', 172, 165, 'MASTER', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'MASTER',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level at the outputs and the headphone socket. It is not saved with a sound.',
});
knob('seq.tempo', 172, 268, 'TEMPO', {
  kind: 'cont',
  min: 56,
  max: 240,
  def: 120,
  step: 1,
  module: 'mode',
  label: 'TEMPO',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'The tempo of the sequencer and the arpeggiator, 56 to 240 beats a minute, and of the LFO and delay when they follow it. Each sound starts at its own riff’s tempo.',
});
const OCTS: ControlOption[] = ['-2', '-1', '0', '1', '2'].map((v, i) => ({
  v,
  label: v === '0' ? '0' : `${Number(v) > 0 ? '+' : '−'}${Math.abs(Number(v))}`,
  x: X(137 + i * 20),
  y: Y(344),
}));
controls.push({
  id: 'kbd.octave',
  type: 'select',
  x: X(177),
  y: Y(344),
  w: 14,
  h: 14,
  lamp: 'white',
  kind: 'enum',
  def: '0',
  options: OCTS,
  lever: { x: X(177), y: Y(385), len: 46, orient: 'h' },
  module: 'mode',
  label: 'OCTAVE',
  labelPos: 'none',
  help: 'Moves the keyboard up or down by up to two octaves; the lamps show where it is. Push the lever below left or right to step it; it springs back. A lamp can also be pressed. It is not saved with a sound.',
});
slot(177, 385, 66, 22);
label(178, 413, 'OCTAVE');

// ── Joystick ──────────────────────────────────────────────────────────────
decor.push({ t: 'circle', x: X(175), y: Y(473), r: 84, fill: '#111213', stroke: '#2b2c2f', sw: 3 });
const joyFmt = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))} %`;
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: X(175),
    y: Y(473),
    r: 38,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: joyFmt,
    help: 'The joystick. Left and right bend the pitch, as far as the X+ and X− bend ranges on the JOYSTICK page of the display. Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: X(175),
    y: Y(473) + 1,
    r: 38,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: joyFmt,
    help: 'The joystick’s up-down movement: up and down each move a control of your choice, set on the JOYSTICK page of the display (Y+ and Y− ASSIGN and RANGE).',
  }
);

// ── Portamento and voice mode ─────────────────────────────────────────────
knob('glide.time', 272, 165, 'PORTAMENTO', {
  kind: 'cont',
  min: 0,
  max: 127,
  def: 0,
  step: 1,
  module: 'glide',
  label: 'PORTAMENTO',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  help: 'How long each note takes to slide from the last note’s pitch; fully left, no slide. Portamento Mode on the OTHER page of the display sets whether it slides only between overlapping notes.',
});
const VOICE_MODES: ControlOption[] = [
  { v: 'poly', label: 'POLY' },
  { v: 'unison', label: 'UNISON' },
  { v: 'chord', label: 'CHORD' },
  { v: 'arp', label: 'ARP/LATCH' },
];
controls.push({
  id: 'voice.mode',
  type: 'slide',
  x: X(252),
  y: Y(370),
  w: 22,
  h: 86,
  orient: 'v',
  kind: 'enum',
  def: 'poly',
  options: VOICE_MODES,
  module: 'mode',
  label: 'VOICE MODE',
  labelPos: 'none',
  help: 'How the four voices play: POLY, four notes at once; UNISON, all four on one note; CHORD, a chord on each key; ARP/LATCH, the arpeggiator. VOICE MODE DEPTH above it changes job with it.',
});
slot(252, 370, 22, 92);
VOICE_MODES.forEach((o, i) => {
  led(290, 340 + i * 20, { id: 'voice.mode', eq: o.v });
  label(300, 340 + i * 20, o.v === 'arp' ? 'ARP/' : String(o.label), 13, {
    anchor: 'start',
    weight: 500,
  });
});
label(300, 409, 'LATCH', 13, { anchor: 'start', weight: 500 });
label(280, 311, 'VOICE MODE', 18);
label(280, 324, 'DEPTH', 18);
const onMode = (m: string): ShowCondition => ({ id: 'voice.mode', eq: m });
knob('voice.duo', 272, 268, null, {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 0,
  step: 1,
  module: 'mode',
  label: 'VOICE MODE DEPTH',
  name: 'VOICE MODE DEPTH (POLY)',
  show: onMode('poly'),
  fmt: (v) => (v <= 0 ? 'POLY' : `DUO ${Math.round(v)}`),
  help: 'In POLY, turned right it becomes DUO: two voices on every key, detuned further apart the further it goes, so two notes play at once instead of four.',
});
knob('voice.detune', 272, 268, null, {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 256,
  step: 1,
  module: 'mode',
  label: 'VOICE MODE DEPTH',
  name: 'VOICE MODE DEPTH (UNISON)',
  show: onMode('unison'),
  fmt: (v) => `${Math.round((v / 1023) * 50)} cents`,
  help: 'In UNISON, how far apart the four stacked voices are tuned, up to 50 cents: a little thickens the note, more makes it swirl.',
});
const CHORDS: [string, string, number[]][] = [
  ['mono', 'Mono', [0]],
  ['5th', '5th', [0, 7]],
  ['sus2', 'sus2', [0, 2, 7]],
  ['m', 'm', [0, 3, 7]],
  ['maj', 'Maj', [0, 4, 7]],
  ['sus4', 'sus4', [0, 5, 7]],
  ['m7', 'm7', [0, 3, 7, 10]],
  ['7', '7', [0, 4, 7, 10]],
  ['7sus4', '7sus4', [0, 5, 7, 10]],
  ['maj7', 'Maj7', [0, 4, 7, 11]],
  ['aug', 'aug', [0, 4, 8]],
  ['dim', 'dim', [0, 3, 6]],
  ['m7b5', 'm7♭5', [0, 3, 6, 10]],
  ['mmaj7', 'mMaj7', [0, 3, 7, 11]],
  ['maj7b5', 'Maj7♭5', [0, 4, 6, 11]],
];
const CHORD_NAME: Record<string, string> = Object.fromEntries(CHORDS.map(([v, n]) => [v, n]));
const CHORD_NOTES: Record<string, number[]> = Object.fromEntries(CHORDS.map(([v, , n]) => [v, n]));
knob('voice.chord', 272, 268, null, {
  kind: 'enum',
  def: 'maj',
  options: CHORDS.map(([v]) => ({ v, label: '' })),
  module: 'mode',
  label: 'VOICE MODE DEPTH',
  name: 'VOICE MODE DEPTH (CHORD)',
  show: onMode('chord'),
  fmt: (v) => CHORD_NAME[String(v)] ?? String(v),
  help: 'In CHORD, the chord every key plays, built up from the key: a fifth, sus2, minor, major, sus4, the four-note sevenths, augmented, diminished and the rest, or Mono, one note at a time. One chord sounds at a time.',
});
const ARP_TYPES: [string, string, ArpMode, number][] = [
  ['man1', 'MANUAL 1', 'played', 1],
  ['man2', 'MANUAL 2', 'played', 2],
  ['rise1', 'RISE 1', 'up', 1],
  ['rise2', 'RISE 2', 'up', 2],
  ['fall1', 'FALL 1', 'down', 1],
  ['fall2', 'FALL 2', 'down', 2],
  ['risefall1', 'RISE FALL 1', 'updown', 1],
  ['risefall2', 'RISE FALL 2', 'updown', 2],
  ['poly1', 'POLY 1', 'up', 1],
  ['poly2', 'POLY 2', 'up', 2],
  ['rand1', 'RANDOM 1', 'random', 1],
  ['rand2', 'RANDOM 2', 'random', 2],
  ['rand3', 'RANDOM 3', 'random', 3],
];
const ARP_NAME: Record<string, string> = Object.fromEntries(ARP_TYPES.map(([v, n]) => [v, n]));
knob('voice.arp', 272, 268, null, {
  kind: 'enum',
  def: 'rise1',
  options: ARP_TYPES.map(([v]) => ({ v, label: '' })),
  module: 'mode',
  label: 'VOICE MODE DEPTH',
  name: 'VOICE MODE DEPTH (ARP)',
  show: onMode('arp'),
  fmt: (v) => ARP_NAME[String(v)] ?? String(v),
  help: 'In ARP/LATCH, the arpeggio: in the order played (MANUAL), up (RISE), down (FALL), up and down, POLY or RANDOM. The manual does not say what 1, 2 and 3 change; here they are the octaves the arpeggio climbs, and POLY, which plays the held notes together, plays them upwards.',
});
btn(
  'arp.latch',
  290,
  400,
  {
    label: 'LATCH',
    module: 'mode',
    show: onMode('arp'),
    help: 'Latches the arpeggio, so it keeps playing after you let go of the keys. On the hardware you move the VOICE MODE switch down to ARP/LATCH a second time, and its lamp blinks. Here press the lamp.',
  },
  14,
  14
);

// ── VCO 1 and VCO 2 ───────────────────────────────────────────────────────
const WAVES: ControlOption[] = [
  { v: 'saw', label: 'Sawtooth' },
  { v: 'tri', label: 'Triangle' },
  { v: 'sqr', label: 'Square' },
];
const FEET: ControlOption[] = ["2'", "4'", "8'", "16'"].map((v) => ({ v, label: v }));
const FOOT_SEMI: Record<string, number> = { "16'": -12, "8'": 0, "4'": 12, "2'": 24 };
const waveGlyphs = (x: number, y: number): void => {
  decor.push(
    { t: 'wave', x: X(x), y: Y(y - 20), size: 12, shape: 'saw', w: 2 },
    { t: 'wave', x: X(x), y: Y(y), size: 12, shape: 'tri', w: 2 },
    { t: 'wave', x: X(x), y: Y(y + 20), size: 12, shape: 'sq', w: 2 }
  );
};
[
  [1, 165],
  [2, 268],
].forEach(([n, y]) => {
  const vco = `VCO ${n}`;
  lever(`vco${n}.wave`, 352, y, {
    kind: 'enum',
    def: 'saw',
    options: WAVES,
    module: 'osc',
    label: 'WAVE',
    name: `${vco} WAVE`,
    help: `${vco}’s wave: sawtooth (bright and buzzy), triangle (soft and round) or square (hollow). SHAPE then changes it.`,
  });
  waveGlyphs(378, y);
  label(356, y + 43, 'WAVE');
  controls.push({
    id: `vco${n}.octave`,
    type: 'select',
    x: X(443),
    y: Y(y - 30),
    w: 14,
    h: 14,
    lamp: 'white',
    kind: 'enum',
    def: "8'",
    options: FEET.map((o, i) => ({ ...o, x: X(443), y: Y(y - 30 + i * 20) })),
    lever: { x: X(402), y: Y(y), len: 46 },
    module: 'osc',
    label: 'OCTAVE',
    name: `${vco} OCTAVE`,
    labelPos: 'none',
    help: `Sets ${vco} in octaves, in organ feet: 16′ is the lowest, 2′ three octaves above it, and 8′ the keyboard’s own pitch. The lamps show which. Push the lever beside them up or down to step it; it springs back. A lamp can also be pressed.`,
  });
  slot(402, y, 22, 66);
  label(406, y + 43, 'OCTAVE');
  knob(`vco${n}.pitch`, 503, y, 'PITCH', {
    kind: 'cont',
    min: -1200,
    max: 1200,
    def: 0,
    step: 1,
    module: 'osc',
    label: 'PITCH',
    name: `${vco} PITCH`,
    fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} cents`,
    help: `Tunes ${vco} up to an octave either way, in cents. A few cents off the other VCO thickens the sound; 700 is a fifth.`,
  });
  knob(`vco${n}.shape`, 605, y, 'SHAPE', {
    kind: 'cont',
    min: 0,
    max: 1023,
    def: 0,
    step: 1,
    module: 'osc',
    label: 'SHAPE',
    name: `${vco} SHAPE`,
    fmt: pct1023,
    help: `Changes ${vco}’s wave. On the square it narrows the pulse from a hollow square to a thin, nasal buzz; on the triangle and sawtooth it folds the wave back on itself, adding overtones. The manual says only that it sets the wave’s “final shape, complexity”, so the folding here is the app’s estimate.`,
  });
});
lever('vco2.sync', 683, 160, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'SYNC',
  help: 'Hard sync: VCO 2 restarts its wave every time VCO 1 starts a cycle. VCO 1 then sets the note and VCO 2’s PITCH changes only its tone, which turns hard and tearing as you sweep it.',
});
label(685, 208, 'SYNC');
lever('vco2.ring', 733, 160, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'RING',
  help: 'Ring modulation: VCO 2 is multiplied by VCO 1, so the mixer’s VCO 2 channel carries the sum and difference of their pitches instead. Tune VCO 2 away from VCO 1 for metallic, bell-like and clangorous tones.',
});
label(735, 208, 'RING');
knob('vco2.xmod', 708, 268, null, {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 0,
  step: 1,
  module: 'osc',
  label: 'CROSS MOD DEPTH',
  fmt: pct1023,
  help: 'How far VCO 1 frequency-modulates VCO 2: a little roughens VCO 2, more turns it into a clangorous, inharmonic tone.',
});
label(710, 311, 'CROSS MOD');
label(710, 324, 'DEPTH');

// ── MULTI ENGINE ──────────────────────────────────────────────────────────
const ENGINES: ControlOption[] = [
  { v: 'usr', label: 'USR' },
  { v: 'vpm', label: 'VPM' },
  { v: 'noise', label: 'NOISE' },
];
lever('multi.engine', 354, 371, {
  kind: 'enum',
  def: 'noise',
  options: ENGINES,
  module: 'osc',
  label: 'NOISE/VPM/USR',
  help: 'What the MULTI ENGINE is: NOISE, one of four filtered noises; VPM, a digital phase-modulation oscillator of 16 types; or USR, an oscillator loaded with Korg’s logue SDK. TYPE and SHAPE change job with it.',
});
label(381, 350, 'USR', 14, { anchor: 'start', weight: 500 });
decor.push(
  { t: 'wave', x: X(388), y: Y(370), size: 12, shape: 'sine', w: 2 },
  { t: 'wave', x: X(388), y: Y(390), size: 12, shape: 'npulse', w: 2 }
);
decor.push({ t: 'rect', x: X(408), y: Y(348), w: 286, h: 94, r: 4, fill: '#060707' });
text(480, 380, 'MULTI', 30, { fill: '#9fd3ff', weight: 700, spacing: 4 });
const NOISES: [string, string][] = [
  ['hp', 'High'],
  ['lp', 'Low'],
  ['peak', 'Peak'],
  ['decim', 'Decim'],
];
const VPMS: [string, string][] = [
  ['sin1', 'Sin1'],
  ['sin2', 'Sin2'],
  ['sin3', 'Sin3'],
  ['sin4', 'Sin4'],
  ['saw1', 'Saw1'],
  ['saw2', 'Saw2'],
  ['squ1', 'Squ1'],
  ['squ2', 'Squ2'],
  ['fat1', 'Fat1'],
  ['fat2', 'Fat2'],
  ['air1', 'Air1'],
  ['air2', 'Air2'],
  ['decay1', 'Decay1'],
  ['decay2', 'Decay2'],
  ['creep', 'Creep'],
  ['throat', 'Throat'],
];
const nameOf =
  (list: [string, string][]) =>
  (v: string | number): string =>
    list.find(([k]) => k === v)?.[1] ?? String(v);
const onEngine = (e: string): ShowCondition => ({ id: 'multi.engine', eq: e });
knob('multi.noise', 605, 372, null, {
  kind: 'enum',
  def: 'hp',
  options: NOISES.map(([v]) => ({ v, label: '' })),
  module: 'osc',
  label: 'TYPE',
  name: 'TYPE (NOISE)',
  show: onEngine('noise'),
  fmt: nameOf(NOISES),
  help: 'The noise: High, through a high-pass filter; Low, through a low-pass; Peak, a band of noise centred on the note played, so it plays in tune; or Decim, noise at a lower sample rate, gritty and digital. SHAPE sets the cutoff, the bandwidth or the rate.',
});
knob('multi.vpm', 605, 372, null, {
  kind: 'enum',
  def: 'sin1',
  options: VPMS.map(([v]) => ({ v, label: '' })),
  module: 'osc',
  label: 'TYPE',
  name: 'TYPE (VPM)',
  show: onEngine('vpm'),
  fmt: nameOf(VPMS),
  help: 'The VPM oscillator’s type: Sin1 to Sin4 sine carriers with plain, fed-back, third- and fifth-harmonic modulators; Saw and Squ carriers; Fat, low and driven; Air, breathy with noise; Decay, with a fading modulation; and Creep and Throat, atonal and evolving. Korg gives a line on each; here every type’s settings are the app’s reading of it.',
});
knob('multi.usr', 605, 372, null, {
  kind: 'enum',
  def: '1',
  options: Array.from({ length: 16 }, (_, i) => ({ v: String(i + 1), label: '' })),
  module: 'osc',
  label: 'TYPE',
  name: 'TYPE (USR)',
  ui: true,
  show: onEngine('usr'),
  fmt: (v) => `USER ${v}`,
  help: `Chooses one of up to 16 user oscillators loaded with Korg’s logue SDK. ${NOT_HERE} With USR chosen the MULTI ENGINE is silent.`,
});
label(608, 415, 'TYPE');
knob('multi.shape', 710, 372, 'SHAPE', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 512,
  step: 1,
  module: 'osc',
  label: 'SHAPE',
  name: 'MULTI ENGINE SHAPE',
  fmt: pct1023,
  help: 'The MULTI ENGINE’s main setting. For High and Low noise, the filter’s cutoff (10 Hz to 21 kHz); for Peak, the band’s width (110 to 880 Hz); for Decim, the sample rate (240 Hz to 48 kHz); for VPM, the modulation depth, from a pure tone to a bright, buzzing one.',
});

// ── Mixer ─────────────────────────────────────────────────────────────────
const MIXER: [string, number, string, number, string][] = [
  ['mix.vco1', 165, 'VCO 1', 1023, 'The level of VCO 1 into the filter.'],
  [
    'mix.vco2',
    268,
    'VCO 2',
    0,
    'The level of VCO 2 into the filter; with RING on, of the ring-modulated VCO 2.',
  ],
  [
    'mix.multi',
    372,
    'MULTI',
    0,
    'The level of the MULTI ENGINE, into the filter or, with Multi Routing at Post VCF on the MULTI page of the display, straight to the VCA.',
  ],
];
MIXER.forEach(([id, y, lab, def, help]) =>
  knob(id, 812, y, lab, {
    kind: 'cont',
    min: 0,
    max: 1023,
    def,
    step: 1,
    module: 'mixer',
    label: lab,
    name: `Mixer ${lab}`,
    fmt: pct1023,
    help,
  })
);

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 913, 165, 'CUTOFF', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 1023,
  step: 1,
  module: 'filter',
  label: 'CUTOFF',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'The low-pass filter’s cutoff: everything above it is taken away. Down, the sound is dark and muffled; up, bright and open. The manual gives no range or slope; here it is a 12 dB filter from 20 Hz to 20 kHz.',
});
knob('vcf.resonance', 913, 268, 'RESONANCE', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 0,
  step: 1,
  module: 'filter',
  label: 'RESONANCE',
  fmt: pct1023,
  help: 'Emphasis at the cutoff: a peak that makes the filter sing and whistle as you sweep it.',
});
const STEPS3: ControlOption[] = [
  { v: '100', label: '100 %' },
  { v: '50', label: '50 %' },
  { v: '0', label: '0 %' },
];
lever('vcf.drive', 887, 371, {
  kind: 'enum',
  def: '0',
  options: STEPS3,
  module: 'filter',
  label: 'DRIVE',
  help: 'The filter’s drive circuit, off, half or full: it thickens the sound and then distorts it. Here it is a saturation stage after the filter in each voice.',
});
label(888, 413, 'DRIVE');
lever('vcf.keytrack', 937, 371, {
  kind: 'enum',
  def: '0',
  options: STEPS3,
  module: 'filter',
  label: 'KEY TRACK',
  help: 'How far the cutoff follows the keyboard, centred on C4: at 100 % it rises an octave for each octave up, so high notes stay as bright as low ones; at 50 %, half that.',
});
label(938, 413, 'KEY');
label(938, 425, 'TRACK');

// ── AMP EG and EG ─────────────────────────────────────────────────────────
const AMP: [string, number, string, number][] = [
  ['attack', 1015, 'ATTACK', 0],
  ['decay', 1118, 'DECAY', 512],
  ['sustain', 1220, 'SUSTAIN', 1023],
  ['release', 1322, 'RELEASE', 300],
];
AMP.forEach(([stage, x, lab, def]) =>
  knob(`amp.${stage}`, x, 165, lab, {
    kind: 'cont',
    min: 0,
    max: 1023,
    def,
    step: 1,
    module: 'amp',
    label: lab,
    name: `AMP EG ${lab}`,
    fmt: stage === 'sustain' ? pct1023 : (v) => fmtTime(envTime(v)),
    help:
      stage === 'attack'
        ? 'How long the loudness takes to rise when a key goes down: short for a sharp start, long for a swell.'
        : stage === 'decay'
          ? 'How long the loudness takes to fall from its peak to the SUSTAIN level.'
          : stage === 'sustain'
            ? 'The loudness held while the key stays down.'
            : 'How long the sound takes to die away after the key is let go.',
  })
);
knob('eg.attack', 1015, 268, 'ATTACK', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 0,
  step: 1,
  module: 'env',
  label: 'ATTACK',
  name: 'EG ATTACK',
  fmt: (v) => fmtTime(envTime(v)),
  help: 'How long the EG takes to rise when a key goes down.',
});
knob('eg.decay', 1117, 268, 'DECAY', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 512,
  step: 1,
  module: 'env',
  label: 'DECAY',
  name: 'EG DECAY',
  fmt: (v) => fmtTime(envTime(v)),
  help: 'How long the EG takes to fall back to nothing after its attack. It has no sustain: a sweep, then gone.',
});
knob('eg.int', 1219, 268, 'EG INT', {
  kind: 'cont',
  min: -100,
  max: 100,
  def: 0,
  step: 1,
  module: 'env',
  label: 'EG INT',
  fmt: signedPct,
  help: 'How far the EG moves its TARGET, either way from the centre: up a pitch or open the filter turned right, the opposite turned left. Left of centre turns the sweep upside down.',
});
const EG_TARGETS: ControlOption[] = [
  { v: 'pitch', label: 'PITCH' },
  { v: 'pitch2', label: 'PITCH 2' },
  { v: 'cutoff', label: 'CUTOFF' },
];
lever('eg.target', 1320, 268, {
  kind: 'enum',
  def: 'cutoff',
  options: EG_TARGETS,
  module: 'env',
  label: 'TARGET',
  name: 'EG TARGET',
  help: 'What the EG moves: PITCH, the pitch of both VCOs and the MULTI ENGINE (a drum’s drop, a brass blip); PITCH 2, VCO 2 alone (a sync sweep); or CUTOFF, the filter.',
});
['PITCH', 'PITCH 2', 'CUTOFF'].forEach((t, i) =>
  label(1336, 248 + i * 20, t, 13, { anchor: 'start', weight: 500 })
);
label(1320, 311, 'TARGET');

// ── LFO ───────────────────────────────────────────────────────────────────
lever('lfo.wave', 990, 371, {
  kind: 'enum',
  def: 'tri',
  options: WAVES,
  module: 'lfo',
  label: 'WAVE',
  name: 'LFO WAVE',
  help: 'The LFO’s wave: sawtooth (a ramp), triangle (a smooth sweep) or square (a trill between two values).',
});
waveGlyphs(1013, 371);
label(990, 413, 'WAVE');
const LFO_MODES: ControlOption[] = [
  { v: 'bpm', label: 'BPM' },
  { v: 'normal', label: 'NORMAL' },
  { v: 'oneshot', label: '1-SHOT' },
];
lever('lfo.mode', 1040, 371, {
  kind: 'enum',
  def: 'normal',
  options: LFO_MODES,
  module: 'lfo',
  label: 'MODE',
  name: 'LFO MODE',
  help: 'NORMAL: the LFO runs freely from 0.05 to 28 Hz. BPM: its speed is a note value at the TEMPO. 1-SHOT: each note starts it, it runs half a cycle and stops there, which makes it a simple extra envelope.',
});
['BPM', 'NORMAL', '1-SHOT'].forEach((t, i) =>
  label(1055, 350 + i * 20, t, 13, { anchor: 'start', weight: 500 })
);
label(1040, 413, 'MODE');
/** BPM mode's note values, in beats (quarter notes): the manual gives the ends (4 bars … 1/64), the steps are reasoned. */
const LFO_DIVS: [string, number][] = [
  ['4', 16],
  ['2', 8],
  ['1', 4],
  ['3/4', 3],
  ['1/2', 2],
  ['3/8', 1.5],
  ['1/3', 4 / 3],
  ['1/4', 1],
  ['3/16', 0.75],
  ['1/6', 2 / 3],
  ['1/8', 0.5],
  ['1/12', 1 / 3],
  ['1/16', 0.25],
  ['1/24', 1 / 6],
  ['1/32', 0.125],
  ['1/48', 1 / 12],
  ['1/64', 0.0625],
];
knob('lfo.rate', 1117, 371, 'RATE', {
  kind: 'cont',
  min: 0,
  max: 1023,
  def: 512,
  step: 1,
  module: 'lfo',
  label: 'RATE',
  name: 'LFO RATE',
  show: { id: 'lfo.mode', in: ['normal', 'oneshot'] },
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'How fast the LFO cycles, from one cycle every 20 seconds to 28 a second.',
});
knob('lfo.div', 1117, 371, null, {
  kind: 'enum',
  def: '1/4',
  options: LFO_DIVS.map(([v]) => ({ v, label: '' })),
  module: 'lfo',
  label: 'RATE',
  name: 'LFO RATE (BPM)',
  show: { id: 'lfo.mode', eq: 'bpm' },
  fmt: (v) => String(v),
  help: 'In BPM mode, one LFO cycle as a note value at the TEMPO, from four bars down to a 64th note.',
});
knob('lfo.int', 1219, 371, 'INT', {
  kind: 'cont',
  min: -511,
  max: 511,
  def: 0,
  step: 1,
  module: 'lfo',
  label: 'INT',
  name: 'LFO INT',
  fmt: (v) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`,
  help: 'How far the LFO moves its TARGET. On the hardware, turning it with SHIFT held gives the negative half, which turns the wave upside down; here it runs from −511 to 511.',
});
const LFO_TARGETS: ControlOption[] = [
  { v: 'pitch', label: 'PITCH' },
  { v: 'shape', label: 'SHAPE' },
  { v: 'cutoff', label: 'CUTOFF' },
];
lever('lfo.target', 1320, 371, {
  kind: 'enum',
  def: 'pitch',
  options: LFO_TARGETS,
  module: 'lfo',
  label: 'TARGET',
  name: 'LFO TARGET',
  help: 'What the LFO moves: PITCH (vibrato), SHAPE (the oscillators’ wave, so a square’s width or a fold sweeps), or CUTOFF (wah). LFO Target OSC on the LFO page of the display sets which oscillators PITCH and SHAPE reach.',
});
['PITCH', 'SHAPE', 'CUTOFF'].forEach((t, i) =>
  label(1336, 350 + i * 20, t, 13, { anchor: 'start', weight: 500 })
);
label(1320, 413, 'TARGET');

// ── Effects ───────────────────────────────────────────────────────────────
const FX_SEL: ControlOption[] = [
  { v: 'mod', label: 'MOD' },
  { v: 'rev', label: 'REV' },
  { v: 'del', label: 'DEL' },
];
lever('fx.select', 1397, 168, {
  kind: 'enum',
  def: 'del',
  options: FX_SEL,
  module: 'fx',
  label: 'DEL/REV/MOD',
  ui: true,
  help: 'Chooses which of the three effects the switch and knobs beside it set: the modulation effect, the reverb or the delay. Each keeps its own settings, and all three can run at once.',
});
['MOD', 'REV', 'DEL'].forEach((t, i) =>
  label(1413, 147 + i * 20, t, 13, { anchor: 'start', weight: 500 })
);
const FX_NAMES: Record<string, string> = { mod: 'MOD', rev: 'REVERB', del: 'DELAY' };
(['mod', 'rev', 'del'] as const).forEach((e) => {
  const show: ShowCondition = { id: 'fx.select', eq: e };
  const fx = FX_NAMES[e];
  lever(`${e}.on`, 1447, 168, {
    kind: 'bool',
    def: false,
    onAt: 'bottom',
    module: 'fx',
    label: 'OFF/ON/SELECT',
    name: `${fx} ON`,
    show,
    help: `Turns the ${fx === 'MOD' ? 'modulation effect' : fx.toLowerCase()} on (middle) or off (down). Pushed up to SELECT it steps through the effect’s types; here the type is on the EFFECTS page of the display.`,
  });
  knob(`${e}.time`, 1524, 165, null, {
    kind: 'cont',
    min: 0,
    max: 100,
    def: e === 'mod' ? 30 : 50,
    module: 'fx',
    label: 'TIME',
    name: `${fx} TIME`,
    show,
    fmt: (v) => `${Math.round(v)} %`,
    help:
      e === 'mod'
        ? 'The modulation effect’s speed.'
        : e === 'rev'
          ? 'How long the reverb lasts.'
          : 'The time between echoes; with a BPM type, a note value at the TEMPO.',
  });
  knob(`${e}.depth`, 1626, 165, null, {
    kind: 'cont',
    min: 0,
    max: 100,
    def: 50,
    module: 'fx',
    label: 'DEPTH',
    name: `${fx} DEPTH`,
    show,
    fmt: (v) => `${Math.round(v)} %`,
    help:
      e === 'mod'
        ? 'How deep the modulation effect sweeps.'
        : e === 'rev'
          ? 'How much reverb there is. With SHIFT held it sets the wet/dry balance, which is on the EFFECTS page of the display here.'
          : 'How long the echoes keep repeating. With SHIFT held it sets the wet/dry balance, which is on the EFFECTS page of the display here.',
  });
});
['SELECT', 'ON', 'OFF'].forEach((t, i) =>
  label(1463, 147 + i * 20, t, 13, { anchor: 'start', weight: 500 })
);
label(1524, 208, 'TIME');
label(1626, 208, 'DEPTH');

// ── Display, program and edit ─────────────────────────────────────────────
const PAGES: [string, string][] = [
  ['prog', 'PROGRAM'],
  ['multi', 'MULTI ENGINE'],
  ['vpm', 'VPM'],
  ['lfo', 'LFO / VELOCITY'],
  ['joy', 'JOYSTICK'],
  ['other', 'OTHER'],
  ['fx', 'EFFECTS'],
];
const LCD = { x0: 1395, y0: 222, x1: 1550, y1: 324 };
decor.push({
  t: 'rect',
  x: X(LCD.x0 - 8),
  y: Y(LCD.y0 - 6),
  w: (LCD.x1 - LCD.x0 + 16) * 2,
  h: (LCD.y1 - LCD.y0 + 12) * 2,
  r: 6,
  fill: '#141517',
});
decor.push({
  t: 'lcd',
  x: X(LCD.x0),
  y: Y(LCD.y0),
  w: (LCD.x1 - LCD.x0) * 2,
  h: (LCD.y1 - LCD.y0) * 2,
  page: 'ui.page',
  titles: Object.fromEntries(PAGES),
  notes: {
    prog: 'Press EDIT MODE to step\nthrough the menus.\nClick a value to\nchange it.',
  },
  titleH: 28,
});
const rows: Record<string, number> = {};
const menu = (page: string, id: string, lab: string, rest: MenuRest): void => {
  const i = (rows[page] = (rows[page] || 0) + 1) - 1;
  controls.push({
    id,
    type: 'menu',
    x: X((LCD.x0 + LCD.x1) / 2),
    y: Y(LCD.y0) + 42 + i * 25,
    w: (LCD.x1 - LCD.x0) * 2 - 14,
    h: 24,
    size: 13,
    vw: 118,
    show: { id: 'ui.page', eq: page },
    label: lab,
    deep: true,
    ...rest,
  });
};
const pctMenu = (
  min: number,
  max: number,
  def: number
): {
  kind: 'cont';
  min: number;
  max: number;
  def: number;
  step: number;
  fmt: (v: number) => string;
} => ({ kind: 'cont', min, max, def, step: 1, fmt: signedPct });

// MULTI ENGINE (PROGRAM EDIT button 9 and 10)
menu('multi', 'multi.octave', 'OCTAVE', {
  kind: 'enum',
  def: "8'",
  options: FEET,
  module: 'osc',
  name: 'Multi Octave',
  help: 'The MULTI ENGINE’s octave, in organ feet as the VCOs’ are: 8′ is the keyboard’s own pitch.',
});
menu('multi', 'multi.routing', 'ROUTING', {
  kind: 'enum',
  def: 'pre',
  options: [
    { v: 'pre', label: 'Pre VCF' },
    { v: 'post', label: 'Post VCF' },
  ],
  module: 'osc',
  name: 'Multi Routing',
  help: 'Whether the MULTI ENGINE goes through the filter with the VCOs (Pre VCF) or past it, straight to the VCA (Post VCF), so it stays bright however the filter is set.',
});
menu('multi', 'multi.ratio', 'RATIO OFS', {
  kind: 'enum',
  def: '1',
  options: [
    { v: '0.25', label: '1:4' },
    { v: '0.5', label: '1:2' },
    { v: '1', label: '1:1' },
    { v: '2', label: '2:1' },
    { v: '3', label: '3:1' },
    { v: '4', label: '4:1' },
  ],
  module: 'osc',
  name: 'VPM RATIO OFFSET',
  help: 'With VPM: the RATIO OFFSET, set on the hardware by turning SHAPE with SHIFT held. It moves the modulator’s pitch against the carrier’s, which changes which overtones the modulation adds. The manual gives only the first few steps; here it multiplies the type’s own ratio.',
});
menu('multi', 'multi.keytrack', 'KEY TRACK', {
  kind: 'cont',
  min: 0,
  max: 100,
  def: 0,
  step: 1,
  module: 'osc',
  name: 'Decim KEY TRACK',
  fmt: (v) => `${Math.round(v)} %`,
  help: 'With Decim noise: how far the sample rate follows the keyboard, so the grit rises with the note. Set on the hardware by turning SHAPE with SHIFT held.',
});
// VPM (PROGRAM EDIT button 10)
const VPM_PARAMS: [string, string, string][] = [
  [
    'multi.feedback',
    'FEEDBACK',
    'How much of the modulator is fed back into itself, which roughens it towards a sawtooth and then noise.',
  ],
  [
    'multi.noiseDepth',
    'NOISE DEPTH',
    'How much noise is added to the modulator, which makes the tone breathy.',
  ],
  [
    'multi.modInt',
    'SHAPE MOD INT',
    'How far the VPM’s own envelope moves the modulation depth. At −100 % the envelope does nothing, which on the Decay, Creep and Throat types holds them still; at +100 % it moves the depth as far as it goes.',
  ],
  ['multi.modAttack', 'MOD ATTACK', 'How long the VPM’s own envelope takes to rise.'],
  ['multi.modDecay', 'MOD DECAY', 'How long the VPM’s own envelope takes to fall away.'],
  [
    'multi.modKey',
    'MOD KEY TRACK',
    'How much the modulation thins out as you play higher, which keeps high notes from turning harsh.',
  ],
];
VPM_PARAMS.forEach(([id, lab, help]) =>
  menu('vpm', id, lab, {
    ...pctMenu(-100, 100, 0),
    module: 'osc',
    name: `VPM ${lab}`,
    help: `${help} Each is an offset from the type’s own setting, which is where it sits at 0 %.`,
  })
);
// LFO and velocity (PROGRAM EDIT buttons 7 and 8)
menu('lfo', 'lfo.targetOsc', 'TARGET OSC', {
  kind: 'enum',
  def: 'all',
  options: [
    { v: 'all', label: 'All' },
    { v: 'vco12', label: 'VCO1+2' },
    { v: 'vco2', label: 'VCO2' },
    { v: 'multi', label: 'Multi' },
  ],
  module: 'lfo',
  name: 'LFO Target OSC',
  help: 'Which oscillators the LFO reaches when its TARGET is PITCH or SHAPE: both VCOs and the MULTI ENGINE, the VCOs alone, VCO 2 alone, or the MULTI ENGINE alone.',
});
menu('lfo', 'lfo.keySync', 'KEY SYNC', {
  kind: 'enum',
  def: 'off',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'on', label: 'On' },
  ],
  module: 'lfo',
  name: 'LFO Key Sync',
  help: 'Starts the LFO from the beginning of its cycle on each note, so every note gets the same sweep.',
});
menu('lfo', 'lfo.voiceSync', 'VOICE SYNC', {
  kind: 'enum',
  def: 'off',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'on', label: 'On' },
  ],
  module: 'lfo',
  name: 'LFO Voice Sync',
  help: 'Keeps the four voices’ LFOs in step, so a chord moves as one. With 1-SHOT it has no effect here.',
});
menu('lfo', 'eg.velocity', 'EG VELOCITY', {
  kind: 'cont',
  min: 0,
  max: 127,
  def: 0,
  step: 1,
  module: 'env',
  name: 'EG Velocity',
  fmt: (v) => String(Math.round(v)),
  help: 'How much playing harder deepens the EG’s sweep of the cutoff. At 0 every note sweeps the same.',
});
menu('lfo', 'amp.velocity', 'AMP VELOCITY', {
  kind: 'cont',
  min: 0,
  max: 127,
  def: 0,
  step: 1,
  module: 'amp',
  name: 'Amp Velocity',
  fmt: (v) => String(Math.round(v)),
  help: 'How much playing harder makes a note louder. At 0 every note is as loud.',
});
// Joystick (PROGRAM EDIT button 4)
/** The 29 parameters the joystick's Y axis can move, with the control each one moves here. */
const ASSIGNS: [string, string][] = [
  ['gate', 'GATE TIME'],
  ['porta', 'PORTAMENTO'],
  ['vmd', 'VOICE MODE DEPTH'],
  ['vco1.pitch', 'VCO1 PITCH'],
  ['vco1.shape', 'VCO1 SHAPE'],
  ['vco2.pitch', 'VCO2 PITCH'],
  ['vco2.shape', 'VCO2 SHAPE'],
  ['vco2.xmod', 'CROSS MOD'],
  ['multi.shape', 'MULTI SHAPE'],
  ['mix.vco1', 'VCO1 LEVEL'],
  ['mix.vco2', 'VCO2 LEVEL'],
  ['mix.multi', 'MULTI LEVEL'],
  ['vcf.cutoff', 'CUTOFF'],
  ['vcf.resonance', 'RESONANCE'],
  ['amp.attack', 'A.EG ATTACK'],
  ['amp.decay', 'A.EG DECAY'],
  ['amp.sustain', 'A.EG SUSTAIN'],
  ['amp.release', 'A.EG RELEASE'],
  ['eg.attack', 'EG ATTACK'],
  ['eg.decay', 'EG DECAY'],
  ['eg.int', 'EG INT'],
  ['lfo.rate', 'LFO RATE'],
  ['lfo.int', 'LFO INT'],
  ['mod.time', 'MOD TIME'],
  ['mod.depth', 'MOD DEPTH'],
  ['rev.time', 'REVERB TIME'],
  ['rev.depth', 'REVERB DEPTH'],
  ['del.time', 'DELAY TIME'],
  ['del.depth', 'DELAY DEPTH'],
];
const BENDS: ControlOption[] = Array.from({ length: 13 }, (_, i) => ({
  v: String(i),
  label: i === 0 ? 'Off' : `${i} note`,
}));
menu('joy', 'joy.xPlus', 'X+ BEND', {
  kind: 'enum',
  def: '2',
  options: BENDS,
  module: 'mod',
  name: 'X+ Bend Range',
  help: 'How far the joystick bends the pitch up when pushed fully right, in semitones.',
});
menu('joy', 'joy.xMinus', 'X− BEND', {
  kind: 'enum',
  def: '2',
  options: BENDS,
  module: 'mod',
  name: 'X− Bend Range',
  help: 'How far the joystick bends the pitch down when pushed fully left, in semitones.',
});
(
  [
    ['Plus', '+', 'vcf.cutoff', 100, 'up'],
    ['Minus', '−', 'lfo.int', 100, 'down'],
  ] as const
).forEach(([k, s, def, range, dir]) => {
  menu('joy', `joy.y${k}Assign`, `Y${s} ASSIGN`, {
    kind: 'enum',
    def,
    options: ASSIGNS.map(([v, l]) => ({ v, label: l })),
    module: 'mod',
    name: `Y${s} Assign`,
    help: `What pushing the joystick ${dir} moves: any of 29 controls, from the oscillators’ pitch and shape to the filter, the envelopes, the LFO and the effects.`,
  });
  menu('joy', `joy.y${k}Range`, `Y${s} RANGE`, {
    ...pctMenu(-100, 100, range),
    module: 'mod',
    name: `Y${s} Range`,
    help: `How far, and which way, pushing the joystick fully ${dir} moves its control: at +100 % across the control’s whole travel upwards, at −100 % downwards.`,
  });
});
// Other settings (PROGRAM EDIT button 9) and the arpeggiator (SEQ EDIT button 6)
menu('other', 'eg.legato', 'EG LEGATO', {
  kind: 'enum',
  def: 'off',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'on', label: 'On' },
  ],
  module: 'env',
  name: 'EG Legato',
  help: 'In UNISON and CHORD: with it on, a key played while another is still held does not restart the envelopes, so legato playing runs on smoothly.',
});
menu('other', 'glide.mode', 'PORTA MODE', {
  kind: 'enum',
  def: 'auto',
  options: [
    { v: 'auto', label: 'Auto' },
    { v: 'on', label: 'On' },
  ],
  module: 'glide',
  name: 'Portamento Mode',
  help: 'Auto: notes slide only when a key is played before the last one is let go. On: every note slides.',
});
const ARP_RATES: [string, number][] = [
  ['64th', 1 / 16],
  ['48th', 1 / 12],
  ['24th', 1 / 6],
  ['16th', 1 / 4],
  ['16.th', 3 / 8],
  ['12th', 1 / 3],
  ['8th', 1 / 2],
  ['8.th', 3 / 4],
  ['6th', 2 / 3],
  ['4th', 1],
];
menu('other', 'arp.rate', 'ARP RATE', {
  kind: 'enum',
  def: '16th',
  options: ARP_RATES.map(([v]) => ({ v, label: v })),
  module: 'mode',
  name: 'ARP Rate',
  help: 'The note value of each arpeggio step against the TEMPO, from a 64th note to a quarter note, with triplets and dotted values.',
});
menu('other', 'arp.gate', 'ARP GATE', {
  kind: 'cont',
  min: 0,
  max: 100,
  def: 75,
  step: 1,
  module: 'mode',
  name: 'ARP Gate Time',
  fmt: (v) => `${Math.round(v)} %`,
  help: 'How long each arpeggio note sounds, as a share of its step: short for staccato, long for legato.',
});
menu('other', 'out.level', 'PROGRAM LVL', {
  kind: 'cont',
  min: -18,
  max: 6,
  def: 0,
  step: 0.5,
  module: 'out',
  name: 'Program Level',
  fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  help: 'The sound’s own volume against the other sounds, −18 to +6 dB.',
});
// Effect types (SELECT and SHIFT + SELECT) and the wet/dry balances (SHIFT + DEPTH)
const MOD_TYPES: ControlOption[] = [
  { v: 'chorus', label: 'Chorus' },
  { v: 'ensemble', label: 'Ensemble' },
  { v: 'phaser', label: 'Phaser' },
  { v: 'flanger', label: 'Flanger' },
  { v: 'user', label: 'User' },
];
const DELAY_TYPES: ControlOption[] = [
  'Stereo',
  'Mono',
  'Ping Pong',
  'Hipass',
  'Tape',
  'One Tap',
  'Stereo BPM',
  'Mono BPM',
  'Ping BPM',
  'Hipass BPM',
  'Tape BPM',
  'Doubling',
].map((t) => ({ v: t.toLowerCase().replace(/ /g, ''), label: t }));
const REVERB_TYPES: ControlOption[] = [
  'Hall',
  'Smooth',
  'Arena',
  'Plate',
  'Room',
  'Early Ref',
  'Space',
  'Riser',
  'Submarine',
  'Horror',
].map((t) => ({ v: t.toLowerCase().replace(/ /g, ''), label: t }));
menu('fx', 'mod.type', 'MOD', {
  kind: 'enum',
  def: 'chorus',
  options: MOD_TYPES,
  module: 'fx',
  name: 'MOD type',
  help: 'The modulation effect: chorus, ensemble, phaser or flanger, each the stereo kind here (the hardware has several of each, chosen with SHIFT + SELECT). User effects load with Korg’s logue SDK and are not modelled: with User chosen the sound passes dry.',
});
menu('fx', 'del.type', 'DELAY', {
  kind: 'enum',
  def: 'stereo',
  options: DELAY_TYPES,
  module: 'fx',
  name: 'DELAY type',
  help: 'The delay: stereo, mono, bouncing between the sides (Ping Pong), thinned of its bass (Hipass), a tape echo, a single echo (One Tap), a short doubling, or one of these timed to the TEMPO (BPM).',
});
menu('fx', 'rev.type', 'REVERB', {
  kind: 'enum',
  def: 'hall',
  options: REVERB_TYPES,
  module: 'fx',
  name: 'REVERB type',
  help: 'The reverb: hall, smooth, arena, plate, room, early reflections, or the unstable Space, Riser, Submarine and Horror. Riser’s and Submarine’s octave-shifted echoes are not modelled here: they play as a bright and a dark hall.',
});
menu('fx', 'del.mix', 'DELAY MIX', {
  ...pctMenu(-100, 100, 0),
  module: 'fx',
  name: 'DELAY wet/dry',
  fmt: (v: number) =>
    v === 0
      ? 'Balanced'
      : v < 0
        ? `Dry ${Math.round(100 + v)} % wet`
        : `Wet, dry ${Math.round(100 - v)} %`,
  help: 'The delay’s balance of dry sound and echoes, set on the hardware with SHIFT + DEPTH: fully left only the dry sound, fully right only the echoes.',
});
menu('fx', 'rev.mix', 'REVERB MIX', {
  ...pctMenu(-100, 100, 0),
  module: 'fx',
  name: 'REVERB wet/dry',
  fmt: (v: number) =>
    v === 0
      ? 'Balanced'
      : v < 0
        ? `Dry ${Math.round(100 + v)} % wet`
        : `Wet, dry ${Math.round(100 - v)} %`,
  help: 'The reverb’s balance of dry sound and reverb, set on the hardware with SHIFT + DEPTH: fully left only the dry sound, fully right only the reverb.',
});

knob('ui.value', 1626, 270, 'PROGRAM/VALUE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'mode',
  label: 'PROGRAM/VALUE',
  ui: true,
  help: 'Chooses one of the 500 programs, and changes the value on the display. Here the sounds are in the sound list, and a value on the display is changed by clicking it.',
});
label(1522, 346, 'EDIT', 15);
line(1420, 346, 1500, 346);
line(1545, 346, 1622, 346);
btn('ui.page', 1446, 370, {
  kind: 'enum',
  def: 'prog',
  options: PAGES.map(([v, t]) => ({ v, label: t })),
  lit: 'always',
  ui: true,
  label: 'EDIT MODE',
  help: 'Steps through the edit menus on the display: on the hardware PROGRAM EDIT, SEQ EDIT and GLOBAL EDIT, each a row of pages on the sixteen buttons. Here it steps through the pages the app models.',
});
(
  [
    [
      'ui.write',
      1497,
      'WRITE',
      'Saves the sound into one of the 500 programs; with SHIFT, loads the panel as the knobs are set.',
    ],
    ['ui.exit', 1548, 'EXIT', 'Leaves an edit page.'],
    [
      'ui.shift',
      1598,
      'SHIFT',
      'Gives the knobs and switches their second jobs. Here each second job has a control of its own.',
    ],
  ] as const
).forEach(([id, x, lab, help]) =>
  btn(id, x, 370, { label: lab, ui: true, help: `${help} ${NOT_HERE}` })
);
label(1447, 391, 'EDIT', 12, { weight: 500 });
label(1447, 401, 'MODE', 12, { weight: 500 });
label(1497, 391, 'WRITE', 12, { weight: 500 });
label(1548, 391, 'EXIT', 12, { weight: 500 });
label(1598, 391, 'SHIFT', 12, { weight: 500 });

// ── Sequencer ─────────────────────────────────────────────────────────────
label(1522, 449, 'SEQUENCER', 15);
line(1420, 449, 1478, 449);
line(1566, 449, 1622, 449);
(
  [
    [
      'seq.motion',
      1446,
      'MOTION MODE',
      null,
      `Records and shows motion: up to four controls’ movements, step by step, played back with the sequence. ${NOT_HERE}`,
    ],
    [
      'seq.play',
      1496,
      'PLAY',
      'run',
      'Starts and stops the sequence saved with the sound. Here it starts and stops the sequencer under the panel.',
    ],
    [
      'seq.rec',
      1547,
      'REC',
      'record',
      'Records a sequence of up to 16 steps, one note or chord per step. Here it turns on the sequencer’s step record.',
    ],
    [
      'seq.rest',
      1597,
      'REST',
      'rest',
      'While step recording, enters a rest; with a key held, a tie.',
    ],
  ] as const
).forEach(([id, x, lab, sb, help]) => {
  btn(id, x, 472, { label: lab, ui: true, help });
  if (sb) seqButtons[id] = sb;
});
label(1447, 493, 'MOTION', 12, { weight: 500 });
label(1447, 503, 'MODE', 12, { weight: 500 });
label(1496, 493, 'PLAY', 12, { weight: 500 });
label(1547, 493, 'REC', 12, { weight: 500 });
label(1597, 493, 'REST', 12, { weight: 500 });
line(510, 449, 1316, 449);
for (let i = 0; i < 16; i++) {
  const x = 533 + i * 50.6;
  btn(
    `seq.step${i + 1}`,
    x,
    471,
    {
      label: String(i + 1),
      name: `Button ${i + 1}`,
      ui: true,
      lamp: 'white',
      help:
        'One of the sixteen step buttons: in the sequencer, step ' +
        (i + 1) +
        '; in the edit modes, a page; with SHIFT, a favourite sound. Here it chooses the sequencer’s step.',
    },
    66,
    26
  );
  seqButtons[`seq.step${i + 1}`] = { step: i };
}

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * 2,
  h: (y1 - y0) * 2,
});
const areas: Area[] = [
  {
    id: 'master',
    label: 'Master, tempo and octave',
    module: 'out',
    keywords: 'volume level master tempo bpm octave transpose',
    rects: [R(120, 110, 228, 430)],
    help: 'MASTER sets the output level and TEMPO the speed of the sequencer and arpeggiator. OCTAVE moves the keyboard up or down two octaves.',
  },
  {
    id: 'joystick',
    label: 'Joystick',
    module: 'mod',
    keywords: 'joystick bend pitch bend modulation assign',
    rects: [R(110, 432, 240, 525)],
    help: 'Left and right bend the pitch. Up and down each move a control chosen on the JOYSTICK page of the display.',
  },
  {
    id: 'voice',
    label: 'Portamento and voice mode',
    module: 'mode',
    keywords: 'portamento glide voice mode poly duo unison chord arpeggiator arp latch detune',
    rects: [R(230, 110, 329, 430)],
    help: 'PORTAMENTO slides between notes. VOICE MODE sets how the four voices play: POLY, UNISON, CHORD or the arpeggiator; VOICE MODE DEPTH changes job with it, from DUO detune to the chord type or the arpeggio.',
  },
  {
    id: 'vco1',
    label: 'VCO 1',
    module: 'osc',
    keywords: 'oscillator vco wave saw triangle square octave pitch tune shape pulse width fold',
    rects: [R(331, 110, 640, 220)],
    help: 'The first analogue oscillator. WAVE picks sawtooth, triangle or square, OCTAVE sets its range and PITCH tunes it in cents; SHAPE narrows the square or folds the other two.',
  },
  {
    id: 'vco2',
    label: 'VCO 2',
    module: 'osc',
    keywords: 'oscillator vco sync ring modulation cross mod fm frequency modulation',
    rects: [R(331, 220, 761, 323), R(640, 110, 761, 220)],
    help: 'The second analogue oscillator, with the same controls as VCO 1, and three ways for VCO 1 to work on it: SYNC locks it to VCO 1, RING multiplies the two, and CROSS MOD DEPTH lets VCO 1 frequency-modulate it.',
  },
  {
    id: 'multi',
    label: 'MULTI ENGINE',
    module: 'osc',
    keywords: 'multi engine digital noise vpm phase modulation fm user oscillator decimator',
    rects: [R(331, 323, 761, 430)],
    help: 'A digital sound source beside the VCOs: four filtered noises or a VPM phase-modulation oscillator of 16 types (USR, user oscillators, are not modelled). TYPE chooses one and SHAPE is its main setting.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level balance volume',
    rects: [R(763, 110, 861, 430)],
    help: 'The levels of VCO 1, VCO 2 and the MULTI ENGINE into the filter.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance drive key track low-pass lowpass brightness',
    rects: [R(863, 110, 963, 430)],
    help: 'A resonant low-pass filter in each voice. CUTOFF sets how bright the sound is and RESONANCE adds a peak at the cutoff; DRIVE thickens and distorts, and KEY TRACK lets the cutoff follow the keyboard.',
  },
  {
    id: 'ampeg',
    label: 'AMP EG',
    module: 'amp',
    keywords: 'amp eg envelope adsr attack decay sustain release vca loudness',
    rects: [R(965, 110, 1371, 220)],
    help: 'The loudness envelope of each voice: ATTACK, DECAY, SUSTAIN and RELEASE.',
  },
  {
    id: 'eg',
    label: 'EG',
    module: 'env',
    keywords: 'eg envelope attack decay pitch sweep filter sweep intensity target',
    rects: [R(965, 220, 1371, 323)],
    help: 'A second envelope, attack and decay only, that sweeps the pitch, VCO 2’s pitch or the cutoff. EG INT sets how far, either way.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'lfo vibrato wobble wah modulation rate intensity one shot bpm sync',
    rects: [R(965, 323, 1371, 430)],
    help: 'The LFO in each voice. WAVE and RATE set its wave and speed, MODE whether it runs free, to the tempo or once per note, and INT and TARGET how far it moves the pitch, the oscillators’ shape or the cutoff.',
  },
  {
    id: 'effects',
    label: 'Effects',
    module: 'fx',
    keywords: 'effects fx delay echo reverb chorus ensemble phaser flanger modulation',
    rects: [R(1373, 110, 1680, 215)],
    help: 'Three digital effects after the voices: a modulation effect, a delay and a reverb, which can all run at once. DEL/REV/MOD picks which one the switch and knobs beside it set, and each keeps its own settings.',
  },
  {
    id: 'display',
    label: 'Display and program',
    module: 'mode',
    keywords: 'display screen oled menu program value edit settings',
    rects: [R(1373, 215, 1680, 336)],
    help: 'The display shows the program and the edit menus, and on the hardware an oscilloscope of the sound. PROGRAM/VALUE chooses programs and values. Here the display holds the settings with no knob of their own, a page at a time.',
  },
  {
    id: 'edit',
    label: 'Edit buttons',
    module: 'mode',
    keywords: 'edit mode write save exit shift menu',
    rects: [R(1373, 336, 1680, 432)],
    help: 'EDIT MODE opens the menus on the display, WRITE saves a sound, EXIT leaves a menu and SHIFT gives the controls their second jobs.',
  },
  {
    id: 'seq',
    label: 'Sequencer',
    module: 'mode',
    keywords: 'sequencer sequence step record play rest motion',
    rects: [R(1373, 432, 1680, 525), R(495, 440, 1340, 500)],
    help: 'A 16-step sequencer saved with each sound, with up to four lanes of recorded knob movements (motion). PLAY runs it, REC records it, REST enters rests and ties, and the sixteen buttons are its steps.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
function fxSlot(alg: string, p: Record<string, number | string>): FxSlot {
  const base = FX_DEFAULTS.get(alg);
  // every id here is a literal below: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error(`minilogue xd: no effects algorithm ${alg}`);
  return { alg, level: 1, p: { ...base, ...p } };
}
/** SHIFT + DEPTH's wet/dry, −100 (dry only) .. 0 (balanced) .. 100 (wet only), as a MIX percentage. */
const wetDry = (w: number): number => 50 + clamp(w, -100, 100) / 2;
/** The modulation effect, from its type and TIME / DEPTH (each 0..1). */
function modSlot(type: string, t: number, d: number): FxSlot {
  const spd = Number(expMap(t, 0.05, 5).toFixed(2));
  switch (type) {
    case 'chorus':
      return fxSlot('chorus', {
        SPD: spd,
        WDL: Math.round(d * 100),
        WDR: Math.round(d * 100),
        MIX: 50,
      });
    case 'ensemble':
      return fxSlot('chorus', {
        SPD: Number(expMap(t, 0.2, 8).toFixed(2)),
        WDL: Math.round(d * 60),
        WDR: Math.round(d * 60),
        DLL: 8,
        DLR: 14,
        PHS: 120,
        MIX: 50,
      });
    case 'phaser':
      return fxSlot('phaser', { SPD: spd, DEP: Math.round(d * 100) });
    case 'flanger':
      return fxSlot('flanger', { SPD: spd, WDL: Math.round(d * 100), WDR: Math.round(d * 100) });
    default:
      // a user effect: none loaded, so the sound passes dry
      return { alg: null };
  }
}
/** BPM delays: TIME picks a note value at the tempo, from a 32nd note to a whole note (reasoned). */
const DELAY_BEATS = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 2 / 3, 3 / 4, 1, 3 / 2, 2, 3, 4];
function delaySlot(type: string, t: number, d: number, mix: number, bpm: number): FxSlot {
  const free = Math.round(expMap(t, 10, 1500));
  const synced = Math.round(
    clamp((60000 / bpm) * DELAY_BEATS[Math.round(t * (DELAY_BEATS.length - 1))], 1, 1500)
  );
  const bpmType = type.endsWith('bpm');
  const tim = bpmType ? synced : free;
  const fb = Math.round(d * 95);
  const base = { MIX: Math.round(mix), TIM: tim, FBL: fb, FBR: fb };
  switch (type) {
    case 'mono':
    case 'monobpm':
      return fxSlot('delay', { ...base, MOD: 'M' });
    case 'pingpong':
    case 'pingbpm':
      return fxSlot('delay', { ...base, MOD: 'P-P' });
    case 'hipass':
    case 'hipassbpm':
      return fxSlot('delay', { ...base, LC: 400, FLC: 500 });
    case 'tape':
    case 'tapebpm':
      return fxSlot('t-raydelay', {
        MIX: Math.round(mix),
        DLY: bpmType ? Math.round(clamp(synced / 15, 0, 100)) : Math.round(t * 100),
        SUS: fb,
      });
    case 'onetap':
      return fxSlot('delay', { ...base, MOD: 'M', FBL: 0, FBR: 0 });
    case 'doubling':
      return fxSlot('delay', { ...base, TIM: Math.round(expMap(t, 10, 60)), FBL: 0, FBR: 0 });
    default:
      return fxSlot('delay', { ...base, MOD: 'ST' });
  }
}
/** The reverb, from its type, TIME (the decay) and DEPTH (how much), each 0..1, and its wet/dry MIX. */
function reverbSlot(type: string, t: number, d: number, mix: number): FxSlot {
  const MIX = Math.round(clamp(mix * d * 2, 0, 100));
  switch (type) {
    case 'plate':
      return fxSlot('platerev', { MIX, DCY: Number(expMap(t, 0.5, 10).toFixed(2)) });
    case 'room':
      return fxSlot('roomrev', { MIX, DCY: Number(expMap(t, 0.3, 6).toFixed(2)) });
    case 'earlyref':
      return fxSlot('vintagerev', { MIX, DCY: Number(expMap(t, 0.1, 3).toFixed(2)), ERL: 90 });
    case 'space':
    case 'horror':
      return fxSlot('ambverb', {
        MIX,
        DCY: Number(expMap(t, 0.5, 7.3).toFixed(2)),
        MOD: type === 'horror' ? 100 : 70,
      });
    case 'arena':
      return fxSlot('hallrev', { MIX, DCY: Number(expMap(t, 1, 4.9).toFixed(2)), SIZ: 200 });
    case 'smooth':
    case 'riser':
      return fxSlot('hallrev', {
        MIX,
        DCY: Number(expMap(t, 0.3, 4.9).toFixed(2)),
        HC: 18000,
        DIF: 30,
      });
    case 'submarine':
      return fxSlot('hallrev', {
        MIX,
        DCY: Number(expMap(t, 0.3, 4.9).toFixed(2)),
        HC: 2500,
        DMP: 2000,
      });
    default:
      return fxSlot('hallrev', { MIX, DCY: Number(expMap(t, 0.3, 4.9).toFixed(2)) });
  }
}

/**
 * Each VPM type's settings: the manual's line on each, read as one carrier and one modulator (`VpmParams`). All
 * reasoned: the manual gives no ratios, depths or curves. `eg` is set on the Decay, Creep and Throat types, the ones the
 * manual says Shape Mod Int −100 % stills; on the others the internal envelope starts at nothing.
 */
const VPM_TYPES: Record<string, Omit<VpmParams, 'depth'>> = {
  sin1: { ratio: 1 },
  sin2: { ratio: 1, fb: 0.5 },
  sin3: { ratio: 3 },
  sin4: { ratio: 5 },
  saw1: { carrier: 'saw', ratio: 1 },
  saw2: { ratio: 1, fb: 0.8 },
  squ1: { carrier: 'sqr', ratio: 1 },
  squ2: { ratio: 2, fb: 0.3 },
  fat1: { ratio: 0.25, fb: 0.5, drive: 0.6 },
  fat2: { ratio: 0.75, fb: 0.5, drive: 0.6 },
  air1: { ratio: 1, noise: 0.6 },
  air2: { ratio: 1, noise: 0.35 },
  decay1: { ratio: 1, eg: { a: 0.002, d: 0.6, amt: 0.8 } },
  decay2: { ratio: 2, eg: { a: 0.002, d: 0.3, amt: 1 } },
  creep: { ratio: 1.41, fb: 0.6, noise: 0.2, eg: { a: 1.2, d: 2.5, amt: 0.6 } },
  throat: { ratio: 2.73, fb: 0.8, drive: 0.4, eg: { a: 0.05, d: 0.8, amt: 0.8 } },
};
/** A type's base MOD KEY TRACK, and the internal envelope's times on a type that has none (reasoned). */
const VPM_KEY = 0.3;
const VPM_EG = { a: 0.002, d: 0.5 };

function vpmOf(v: ControlValues, depth: number): VpmParams {
  const type = VPM_TYPES[String(v['multi.vpm'])] ?? VPM_TYPES.sin1;
  const off = (id: string): number => clamp(num(v, id) / 100, -1, 1);
  const eg = type.eg;
  const amtOff = off('multi.modInt');
  // Shape Mod Int: on an enveloped type −100 % stills the envelope and +100 % takes it to the engine's full depth (1),
  // so a type already at full (Decay2) has no room upwards; on the others it opens it either way
  const amt = eg
    ? amtOff < 0
      ? eg.amt * (1 + amtOff)
      : eg.amt + (1 - eg.amt) * amtOff
    : clamp(amtOff, -1, 1);
  return {
    ...(type.carrier ? { carrier: type.carrier } : {}),
    ratio: type.ratio * Number(v['multi.ratio'] || 1),
    depth,
    fb: clamp((type.fb ?? 0) + off('multi.feedback'), 0, 1),
    noise: clamp((type.noise ?? 0) + off('multi.noiseDepth'), 0, 1),
    drive: type.drive ?? 0,
    // the envelope's times: an offset of ±100 % moves each 8× either way
    eg: {
      a: (eg ? eg.a : VPM_EG.a) * Math.pow(8, off('multi.modAttack')),
      d: (eg ? eg.d : VPM_EG.d) * Math.pow(8, off('multi.modDecay')),
      amt,
    },
    keyTrack: clamp(VPM_KEY + off('multi.modKey'), 0, 1),
  };
}

/** VCO SHAPE on each wave: the square's duty cycle narrows from 50 % to 5 %; the triangle and saw fold. */
function vcoOf(wave: string, s: number): Pick<OscParams, 'mix' | 'pw' | 'fold'> {
  if (wave === 'sqr') return { mix: { pulse: 1 }, pw: 0.5 - 0.45 * s };
  if (wave === 'tri') return { mix: { tfold: 1 }, fold: s };
  return { mix: { sfold: 1 }, fold: s };
}

/** Every joystick Y assignment's control and its range, for the effective panel the joystick sets. */
const RANGE = new Map(
  controls.flatMap((c) => (c.kind === 'cont' ? [[c.id, [c.min, c.max] as const]] : []))
);
/** The panel with the joystick's Y axis applied to its assigned control (the up and down halves each have their own). */
function withJoystick(v: ControlValues): ControlValues {
  const jy = clamp(num(v, 'joy.y') || 0, -1, 1);
  if (jy === 0) return v;
  const half = jy > 0 ? 'Plus' : 'Minus';
  let target = String(v[`joy.y${half}Assign`]);
  const range = num(v, `joy.y${half}Range`) / 100;
  if (target === 'vmd') {
    const m = String(v['voice.mode']);
    target = m === 'unison' ? 'voice.detune' : m === 'poly' ? 'voice.duo' : '';
  } else if (target === 'gate') target = 'arp.gate';
  else if (target === 'porta') target = 'glide.time';
  const r = RANGE.get(target);
  if (!r) return v;
  const [lo, hi] = r;
  return { ...v, [target]: clamp(num(v, target) + range * Math.abs(jy) * (hi - lo), lo, hi) };
}

const LFO_MIX: Record<string, LfoMix> = { saw: { saw: 1 }, tri: { tri: 1 }, sqr: { sq: 1 } };

function toEngine(panel: ControlValues): EngineParams {
  const v = withJoystick(panel);
  const routes: EngineRoute[] = [];
  const mode = String(v['voice.mode']);

  // the oscillators: VCO 1, VCO 2 (synced, ring-modulated, cross-modulated) and the MULTI ENGINE
  const l1 = MIX_LEVEL * (num(v, 'mix.vco1') / 1023);
  const l2 = MIX_LEVEL * (num(v, 'mix.vco2') / 1023);
  const lm = MIX_LEVEL * (num(v, 'mix.multi') / 1023);
  const ring = !!v['vco2.ring'];
  // RING: VCO 2's channel carries VCO 1 × VCO 2 instead of VCO 2
  if (ring && l2 > 0) routes.push({ src: 'ring', dst: 'vcfIn', amt: l2 });
  const xm = num(v, 'vco2.xmod') / 1023;
  if (xm > 0) routes.push({ src: 'osc1', dst: 'pitch2', amt: XMOD_ST * xm * xm });
  const vco = (n: number, level: number): OscParams => ({
    level,
    ...vcoOf(String(v[`vco${n}.wave`]), num(v, `vco${n}.shape`) / 1023),
    semi: (FOOT_SEMI[String(v[`vco${n}.octave`])] ?? 0) + num(v, `vco${n}.pitch`) / 100,
    kbd: true,
  });
  const engine = String(v['multi.engine']);
  const post = v['multi.routing'] === 'post';
  const mShape = num(v, 'multi.shape') / 1023;
  const multiMix: OscMix = {};
  const multi: OscParams = {
    level: post ? 0 : lm,
    semi: FOOT_SEMI[String(v['multi.octave'])] ?? 0,
    kbd: true,
    mix: multiMix,
  };
  if (engine === 'noise') {
    const type = String(v['multi.noise']);
    multiMix.mnoise = 1;
    multi.mnoise = {
      type: type === 'lp' || type === 'peak' || type === 'decim' ? type : 'hp',
      shape: mShape,
      ...(type === 'decim' ? { keyTrack: num(v, 'multi.keytrack') / 100 } : {}),
    };
  } else if (engine === 'vpm') {
    multiMix.vpm = 1;
    multi.vpm = vpmOf(v, mShape);
  }
  // Post VCF: the MULTI ENGINE goes past the filter, straight to the VCA
  if (post && lm > 0 && engine !== 'usr') routes.push({ src: 'osc3', dst: 'vcaIn', amt: lm });

  // the EG (Envelope 1): attack and decay, to pitch, VCO 2's pitch or the cutoff
  const egInt = num(v, 'eg.int') / 100;
  const egTarget = String(v['eg.target']);
  const egVel = num(v, 'eg.velocity') / 127;
  if (egInt !== 0 && egTarget !== 'cutoff') {
    routes.push({
      src: 'env1',
      dst: egTarget === 'pitch2' ? 'pitch2' : 'pitchAll',
      amt: Math.sign(egInt) * EG_PITCH_ST * egInt * egInt,
    });
  }
  const cutEnv = egTarget === 'cutoff' ? egInt * EG_CUT_OCT : 0;
  // EG Velocity: velocity scales part of the cutoff sweep (env1·(1 − k + k·vel))
  if (cutEnv !== 0 && egVel > 0) {
    routes.push({ src: 'env1', dst: 'cutoff', amt: -egVel * cutEnv });
    routes.push({ src: 'env1', dst: 'cutoff', amt: egVel * cutEnv, by: 'vel' });
  }
  // Amp Velocity, the same way on the loudness (env2·(1 − k + k·vel))
  const ampVel = num(v, 'amp.velocity') / 127;
  if (ampVel > 0) {
    routes.push({ src: 'env2', dst: 'amp', amt: -ampVel });
    routes.push({ src: 'env2', dst: 'amp', amt: ampVel, by: 'vel' });
  }

  // the LFO, to the cutoff, or to the pitch or shape of the oscillators LFO Target OSC names
  const lfoMode = String(v['lfo.mode']);
  const li = num(v, 'lfo.int') / 511;
  const lfoTarget = String(v['lfo.target']);
  const tOsc = String(v['lfo.targetOsc']);
  const reach = [
    tOsc === 'all' || tOsc === 'vco12',
    tOsc !== 'multi',
    tOsc === 'all' || tOsc === 'multi',
  ];
  if (li !== 0) {
    if (lfoTarget === 'cutoff') routes.push({ src: 'lfo', dst: 'cutoff', amt: LFO_CUT_OCT * li });
    else {
      const dsts = lfoTarget === 'shape' ? ['pw1', 'pw2', 'pw3'] : ['pitch1', 'pitch2', 'pitch3'];
      const amt = lfoTarget === 'shape' ? LFO_SHAPE * li : Math.sign(li) * LFO_PITCH_ST * li * li;
      dsts.forEach((dst, k) => {
        if (reach[k]) routes.push({ src: 'lfo', dst, amt });
      });
    }
  }
  const tempo = num(v, 'seq.tempo');
  const div = LFO_DIVS.find(([d]) => d === v['lfo.div']) ?? LFO_DIVS[7];
  const oneShot = lfoMode === 'oneshot';

  // the voice modes
  let poly: PolyParams = { voices: 4, stack: 1, mono: false };
  if (mode === 'poly') {
    const duo = num(v, 'voice.duo') / 1023;
    if (duo > 0) poly = { voices: 4, stack: 2, mono: false, detune: 0.3 * duo };
  } else if (mode === 'unison') {
    poly = { voices: 4, stack: 4, mono: true, detune: 0.5 * (num(v, 'voice.detune') / 1023) };
  } else if (mode === 'chord') {
    const chord = String(v['voice.chord']);
    poly =
      chord === 'mono'
        ? { voices: 4, stack: 1, mono: true }
        : { voices: 4, stack: 1, mono: true, chord: CHORD_NOTES[chord] ?? CHORD_NOTES.maj };
  }
  const arpType = ARP_TYPES.find(([k]) => k === v['voice.arp']) ?? ARP_TYPES[2];
  const arpRate = ARP_RATES.find(([k]) => k === v['arp.rate']) ?? ARP_RATES[3];
  const legatoEg = v['eg.legato'] === 'on' && (mode === 'unison' || mode === 'chord');

  const porta = num(v, 'glide.time');
  const drive = Number(v['vcf.drive']) / 100;
  const fxSel = (e: string) => !!v[`${e}.on`];
  const slots: FxSlot[] = [
    fxSel('mod')
      ? modSlot(String(v['mod.type']), num(v, 'mod.time') / 100, num(v, 'mod.depth') / 100)
      : { alg: null },
    fxSel('del')
      ? delaySlot(
          String(v['del.type']),
          num(v, 'del.time') / 100,
          num(v, 'del.depth') / 100,
          wetDry(num(v, 'del.mix')),
          tempo
        )
      : { alg: null },
    fxSel('rev')
      ? reverbSlot(
          String(v['rev.type']),
          num(v, 'rev.time') / 100,
          num(v, 'rev.depth') / 100,
          wetDry(num(v, 'rev.mix'))
        )
      : { alg: null },
    { alg: null },
  ];
  const anyFx = slots.some((s) => s.alg !== null);

  // the joystick's X axis bends the pitch, as far as each direction's bend range
  const jx = clamp(num(v, 'joy.x') || 0, -1, 1);
  const bend = jx * (jx > 0 ? Number(v['joy.xPlus']) : Number(v['joy.xMinus']));

  return {
    osc: [vco(1, l1), { ...vco(2, ring ? 0 : l2), syncTo: v['vco2.sync'] ? 0 : -1 }, multi],
    noise: { level: 0 },
    ext: { level: 0 },
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.resonance') / 1023) * 1.02,
      envAmt: cutEnv,
      envSrc: 'env1',
      kbd: Number(v['vcf.keytrack']) / 100,
    },
    env1: {
      a: envTime(num(v, 'eg.attack')),
      d: envTime(num(v, 'eg.decay')),
      s: 0,
      r: envTime(num(v, 'eg.decay')),
    },
    env2: {
      a: envTime(num(v, 'amp.attack')),
      d: envTime(num(v, 'amp.decay')),
      s: num(v, 'amp.sustain') / 1023,
      r: envTime(num(v, 'amp.release')),
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoMode === 'bpm' ? tempo / 60 / div[1] : lfoHz(num(v, 'lfo.rate')),
      mix: LFO_MIX[String(v['lfo.wave'])] ?? LFO_MIX.tri,
      keySync: v['lfo.keySync'] === 'on',
      ...(oneShot ? { oneShot: true } : v['lfo.voiceSync'] === 'on' ? { common: true } : {}),
    },
    glide: { time: porta > 0 ? portaTime(porta) : 0, legato: v['glide.mode'] !== 'on' },
    trig: { retrig: !legatoEg, drone: false, repeat: false },
    paraphonic: false,
    poly,
    arp: {
      on: mode === 'arp',
      // the engine steps in sixteenths: an ARP Rate step is that many sixteenths
      bpm: tempo / (4 * arpRate[1]),
      gate: num(v, 'arp.gate') / 100,
      mode: arpType[2],
      octaves: arpType[3],
      hold: mode === 'arp' && !!v['arp.latch'],
    },
    routes,
    normals: { ringA: 'osc1', ringB: 'osc2' },
    pwSplit: true,
    od:
      drive > 0 ? { on: true, drive: 0.25 + 0.35 * drive, tone: 0.5, level: 0.85 } : { on: false },
    delay: { on: false },
    fx: anyFx ? { mode: 'insert', routing: 1, slots } : { mode: 'bypass' },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 12 * Number(v['kbd.octave']) + bend,
    volume: Math.min(1, level10(num(v, 'out.master'), 1) * Math.pow(10, num(v, 'out.level') / 20)),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const minilogueXd: SynthDef & { version: number } = {
  id: 'minilogue-xd',
  version: 1,
  name: 'minilogue xd',
  maker: 'Korg',
  year: 2019,
  heritage: 'The 2016 minilogue’s successor, with the prologue’s digital MULTI ENGINE',
  summary:
    'Four analogue voices, each two VCOs (sawtooth, triangle or square, each with SHAPE, and sync, ring and cross mod) and a digital MULTI ENGINE of filtered noise or a VPM oscillator → a resonant low-pass filter with drive → the VCA, with an ADSR, an attack-decay EG and an LFO. Voice modes for duo, unison and chords, an arpeggiator, a joystick, and modulation, delay and reverb effects.',
  view: { w: X(1690), h: Y(540) },
  theme: {
    panel: '#202123',
    panel2: '#18191b',
    ink: INK,
    font: 'din',
    weight: 500,
    cheeks: 'none',
    cheekW: 0,
    knobRing: false,
  },
  signalNames: {
    env1: 'the EG',
    env2: 'the AMP EG',
    lfo: 'the LFO',
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    osc3: 'the MULTI ENGINE',
    ring: 'the ring modulator',
  },
  tempo: 'seq.tempo',
  seqButtons,
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // no Default patch: init is already VCO 1's sawtooth alone at 8′, the filter open, the loudness a gate with a short
  // release, and the EG, LFO and effects off
  toEngine,
};

export default minilogueXd;
