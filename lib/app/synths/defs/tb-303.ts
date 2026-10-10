/**
 * Roland TB-303 Bass Line: the definition (D1). Positions are measured on the 1000×562 product
 * photo (ref/roland-tb-303.jpg) and scaled by K into view units: X() and Y() take photo pixels.
 *
 * Transliterated from the prototype file `src/synths/tb-303.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand`
 * (the Roland mark and the printed "Computer Controlled Bass Line TB-303"), and panel values read
 * through `num()`.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlValues,
  Decor,
  EngineParams,
  Jack,
  KnobControl,
  LitWhen,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { expMap, fmtHz, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

/** `Omit` over each member of a union, so a discriminated control or jack keeps its variants. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos'>;
type ButtonRest = Pick<ButtonControl, 'label' | 'name' | 'help'> &
  Partial<Pick<ButtonControl, 'cap' | 'ui' | 'module'>>;
type JackRest = OmitEach<Jack, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos'>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'fill' | 'weight' | 'spacing' | 'brand'>>;

/** A panel value as a number. A continuous control always holds one. */
const num = (v: ControlValues, id: string): number => Number(v[id]);

const K = 2.8;
const X = (x: number): number => Math.round((x - 122) * K);
const Y = (y: number): number => Math.round((y - 108) * K);
const RED = '#c4322b';

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const knob = (id: string, x: number, y: number, r: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: Math.round(r * K),
    style: 'd-silver',
    labelPos: 'none',
    ...rest,
  });
};
const text = (x: number, y: number, t: string, size = 15, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x: X(x), y: Y(y), text: t, size, anchor: 'middle', ...rest });
};
const plate = (
  x: number,
  y: number,
  w: number,
  h: number,
  t: string,
  size = 13,
  rest: { fill?: string; ink?: string } = {}
): void => {
  decor.push({
    t: 'rect',
    x: X(x - w / 2),
    y: Y(y - h / 2),
    w: Math.round(w * K),
    h: Math.round(h * K),
    r: 3,
    fill: rest.fill || '#2a2a2a',
  });
  text(x, y + 1.6, t, size, { fill: rest.ink || '#e9e9e4', weight: 700 });
};
const box = (x: number, y: number, w: number, h: number, t: string, size = 13): void => {
  decor.push({
    t: 'rect',
    x: X(x - w / 2),
    y: Y(y - h / 2),
    w: Math.round(w * K),
    h: Math.round(h * K),
    r: 2,
    fill: 'none',
    stroke: '#2a2a2a',
    sw: 1.6,
  });
  text(x, y + 1.6, t, size, { weight: 700 });
};
const led = (x: number, y: number, litWhen: LitWhen): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r: 6, color: 'red', litWhen });
};

// ── Faceplate print ───────────────────────────────────────────────────────
decor.push(
  { t: 'line', x1: X(308), y1: Y(110), x2: X(308), y2: Y(170), w: 2 },
  { t: 'line', x1: X(655), y1: Y(110), x2: X(655), y2: Y(170), w: 2 }
);
// the Roland mark: the stylised R in a rounded square, then the name
decor.push({
  t: 'rect',
  x: X(172),
  y: Y(148),
  w: 44,
  h: 44,
  r: 8,
  fill: 'none',
  stroke: '#262626',
  sw: 4,
  brand: true,
});
text(180, 160, 'R', 34, { weight: 700, brand: true });
text(222, 162, 'Roland', 54, { weight: 700, brand: true });
text(766, 162, 'Bass Line', 52, { weight: 500, brand: true });
text(642, 232, 'TB-303', 46, { weight: 500, spacing: 2, brand: true });
decor.push({ t: 'line', x1: X(571), y1: Y(238), x2: X(712), y2: Y(238), w: 2, brand: true });
text(642, 254, 'Computer Controlled', 30, { brand: true });

// ── Rear edge: connections and the waveform switch ────────────────────────
const rearJack = (id: string, ax: number, label: string, tx: number, rest: JackRest): void => {
  jacks.push({ id, x: X(ax), y: Y(118), r: 15, label, labelPos: 'none', ...rest });
  text(tx, 120, label, 14, { anchor: 'start' });
};
rearJack('j.mixIn', 147, 'MIX IN', 155, {
  dir: 'in',
  dest: 'dryIn',
  amt: 1,
  add: true,
  help: 'Mixes another sound, such as a drum machine, in with the bass at equal level, just before the outputs. Its level is set at the source.',
});
rearJack('j.sync', 258, 'SYNC IN', 266, {
  dir: 'in',
  dest: null,
  help: 'A five-pin DIN socket that takes tempo, start and stop from a Roland rhythm machine such as the TR-606 or TR-808. Not modelled here: a cable in it does nothing.',
});
rearJack('j.cv', 664, 'CV', 672, {
  dir: 'out',
  signal: 'kbd',
  name: 'CV (pitch)',
  help: 'The pitch of the note playing as a control voltage, 1 V per octave, so the sequencer can play another synth. It glides on slid notes. Accent is not sent.',
});
rearJack('j.gate', 693, 'GATE', 701, {
  dir: 'out',
  signal: 'gate',
  help: 'On while a note is held and off between notes, for triggering another synth’s envelopes. It stays on through a slide.',
});
rearJack('j.phones', 733, 'HEADPHONE', 741, {
  dir: 'out',
  signal: 'out',
  help: 'Headphone output: the same sound as OUTPUT.',
});
rearJack('j.output', 797, 'OUTPUT', 805, {
  dir: 'out',
  signal: 'out',
  help: 'Main audio output, after VOLUME and anything coming in at MIX IN.',
});
text(843, 120, '▲ DC 9V', 14, { anchor: 'start' });

decor.push(
  { t: 'wave', x: X(214), y: Y(115), size: 13, shape: 'saw' },
  { t: 'wave', x: X(232), y: Y(115), size: 13, shape: 'sq' }
);
text(223, 126, 'WAVEFORM', 14);
controls.push({
  id: 'osc.wave',
  type: 'slide',
  orient: 'h',
  x: X(223),
  y: Y(136),
  w: 52,
  h: 22,
  kind: 'enum',
  module: 'osc',
  options: [
    { v: 'saw', label: 'Sawtooth' },
    { v: 'sq', label: 'Square' },
  ],
  def: 'saw',
  label: 'WAVEFORM',
  labelPos: 'none',
  help: 'Chooses the oscillator’s waveform. Sawtooth is bright and buzzy, the usual acid sound; square is hollower and rounder.',
});

// ── Tone control: the knob row ────────────────────────────────────────────
const TOP: [id: string, x: number, label: string][] = [
  ['osc.tuning', 343, 'TUNING'],
  ['filter.cutoff', 400, 'CUT OFF FREQ'],
  ['filter.res', 456, 'RESONANCE'],
  ['filter.envMod', 513, 'ENV MOD'],
  ['env.decay', 569, 'DECAY'],
  ['amp.accent', 623, 'ACCENT'],
];
TOP.forEach(([, x, label]) => text(x, 120, label, 14));
const cutHz = (v: number): number => expMap(v / 10, 160, 5200);
const decayS = (v: number): number => expMap(v / 10, 0.2, 2);
knob('osc.tuning', 343, 148, 13, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'osc',
  label: 'TUNING',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} cents`,
  help: 'Tunes the whole instrument up or down by up to about five semitones, so it can match other instruments.',
});
knob('filter.cutoff', 400, 148, 13, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'filter',
  label: 'CUT OFF FREQ',
  fmt: (v) => fmtHz(cutHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull, round bass; high settings let the full buzz through.',
});
knob('filter.res', 456, 148, 13, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'filter',
  label: 'RESONANCE',
  help: 'Boosts the frequencies right at the cutoff, so filter movement turns into a squelch. It also sets how far accented notes push the filter.',
});
knob('filter.envMod', 513, 148, 13, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'filter',
  label: 'ENV MOD',
  help: 'How far the envelope opens the filter on each note. Turned up, every note starts bright and closes down.',
});
knob('env.decay', 569, 148, 13, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'env',
  label: 'DECAY',
  fmt: (v) => fmtTime(decayS(v)),
  help: 'How long the envelope takes to close the filter after each note starts. Short gives clipped, plucky notes; long lets each note open and close slowly.',
});
knob('amp.accent', 623, 148, 13, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'env',
  label: 'ACCENT',
  help: 'How much accented notes stand out: louder, and with an extra sweep of the filter. Notes that are not accented are not affected.',
});

// ── Tempo, track, mode, volume ────────────────────────────────────────────
text(227, 192, 'TEMPO', 17);
knob('seq.tempo', 227, 234, 19, {
  kind: 'cont',
  min: 40,
  max: 300,
  def: 120,
  step: 1,
  module: 'mode',
  ui: true,
  label: 'TEMPO',
  name: 'TEMPO',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'Speed of the pattern, from 40 to 300 beats a minute. Here it sets the speed of the riff, and each sound starts at its own riff’s tempo.',
});
text(196, 270, 'SLOW', 12);
text(258, 270, 'FAST', 12);

plate(318, 191, 30, 9, 'TRACK', 13);
text(360, 192, 'PATT.GROUP', 15);
const TRACK_A = [-125, -92, -55, -18, 18, 55, 92];
knob('seq.track', 338, 242, 19, {
  kind: 'enum',
  options: TRACK_A.map((a, i) => ({ v: `t${i + 1}`, label: '', a })),
  def: 't1',
  module: 'mode',
  ui: true,
  label: 'TRACK / PATT.GROUP',
  name: 'TRACK / PATT. GROUP',
  help: 'In the track modes it picks TRACK 1 to 7, a song built from a chain of patterns. In the pattern modes it picks PATTERN GROUP I to IV (positions 1–2, 3–4, 5–6 and 7). This app plays one riff per sound, so the switch does not change it.',
});
TRACK_A.forEach((a, i) => {
  const rad = (a * Math.PI) / 180;
  text(338 + Math.sin(rad) * 33, 245 - Math.cos(rad) * 33, String(i + 1), 13);
});
text(306, 236, 'I', 13);
text(318, 208, 'II', 13);
text(358, 208, 'III', 13);
text(377, 276, 'IV', 13);

text(453, 192, 'MODE', 17);
const MODES: [v: string, a: number][] = [
  ['track_write', 52],
  ['track_play', 76],
  ['pattern_play', 104],
  ['pattern_write', 128],
];
knob('seq.mode', 447, 242, 19, {
  kind: 'enum',
  options: MODES.map(([v, a]) => ({ v, label: '', a })),
  def: 'pattern_play',
  module: 'mode',
  ui: true,
  label: 'MODE',
  name: 'MODE',
  help: 'What the sequencer is doing: writing or playing a track, or playing or writing a pattern. Patterns are written in PATTERN WRITE and played in PATTERN PLAY. This app has no pattern memory, so the switch does not change the sound.',
});
text(489, 216, '· WRITE', 12, { anchor: 'start' });
text(489, 230, '· PLAY', 12, { anchor: 'start' });
plate(533, 223, 26, 8, 'TRACK', 11);
text(489, 251, '· PLAY', 12, { anchor: 'start' });
text(489, 265, '· WRITE', 12, { anchor: 'start' });
text(538, 259, 'PATTERN', 12);
decor.push(
  { t: 'path', d: `M${X(515)} ${Y(216)} H${X(519)} V${Y(230)} H${X(515)}`, w: 1.4 },
  { t: 'path', d: `M${X(515)} ${Y(251)} H${X(522)} V${Y(265)} H${X(515)}`, w: 1.4 }
);

text(777, 192, 'VOLUME', 17);
knob('out.volume', 777, 242, 19, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  help: 'Output level. On the TB-303 the first click of this knob also switches the power on.',
});
text(745, 274, 'POWER SW OFF', 11);
text(810, 274, 'MAX', 11);

// ── Sequencer section ─────────────────────────────────────────────────────
decor.push(
  {
    t: 'rect',
    x: X(128),
    y: Y(290),
    w: Math.round(740 * K),
    h: Math.round(157 * K),
    r: 4,
    fill: 'none',
    stroke: '#2a2a2a',
    sw: 2,
  },
  { t: 'line', x1: X(213), y1: Y(290), x2: X(213), y2: Y(426), w: 1.6 },
  { t: 'line', x1: X(783), y1: Y(290), x2: X(783), y2: Y(426), w: 1.6 },
  { t: 'line', x1: X(128), y1: Y(368), x2: X(213), y2: Y(368), w: 1.6 },
  { t: 'line', x1: X(783), y1: Y(368), x2: X(868), y2: Y(368), w: 1.6 },
  { t: 'line', x1: X(128), y1: Y(426), x2: X(868), y2: Y(426), w: 1.6 }
);
const btn = (id: string, x: number, y: number, w: number, h: number, rest: ButtonRest): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: Math.round(w * K),
    h: Math.round(h * K),
    kind: 'bool',
    def: false,
    module: 'mode',
    ui: true,
    labelPos: 'none',
    ...rest,
  });
};

box(150, 303, 18, 9, 'D.C.', 12);
box(189, 303, 40, 9, 'BAR RESET', 11);
text(171, 324, 'PATTERN CLEAR', 12);
btn('seq.clear', 171, 344, 26, 14, {
  label: 'PATTERN CLEAR',
  name: 'PATTERN CLEAR (BAR RESET / D.C.)',
  help: 'Clears the pattern being written. In a track it goes back to the first measure (BAR RESET) and marks a track’s last measure (D.C.). Not modelled here.',
});
text(153, 380, 'RUN', 11);
led(171, 378, { id: 'seq.run', eq: true });
text(195, 380, 'BATTERY', 11);
btn('seq.run', 171, 396, 34, 18, {
  label: 'RUN/STOP',
  name: 'RUN/STOP',
  help: 'Starts and stops the pattern or track. In this app, use Play riff instead.',
});
text(171, 418, 'RUN/STOP', 12);

plate(250, 302, 64, 9, 'PITCH MODE', 12);
led(250, 317, { id: 'seq.pitch', eq: true });
btn('seq.pitch', 250, 336, 26, 15, {
  cap: 'black',
  label: 'PITCH MODE',
  name: 'PITCH MODE',
  help: 'Enters the notes of a pattern on the 13 keys, one press per note, with TRANSPOSE DOWN and UP for octaves. Held while a pattern plays, a key press transposes the pattern.',
});
text(238, 364, 'FUNCTION', 12);
led(267, 362, { id: 'seq.pitch', eq: false });
text(270, 375, 'NORMAL\nMODE', 10);
btn('seq.function', 233, 391, 20, 15, {
  label: 'FUNCTION',
  name: 'FUNCTION',
  help: 'Returns the sequencer to normal mode. Held, it gives second functions: the step count of a pattern, and inserting or deleting measures in a track.',
});
box(233, 413, 18, 8, 'BAR', 11);

// the 13 keys
const KEY_X: Record<string, number> = {
  C: 307,
  'C#': 328,
  D: 348,
  'D#': 369,
  E: 388,
  F: 430,
  'F#': 450,
  G: 470,
  'G#': 490,
  A: 511,
  'A#': 531,
  B: 551,
  C2: 593,
};
decor.push({
  t: 'rect',
  x: X(285),
  y: Y(296),
  w: Math.round(330 * K),
  h: Math.round(109 * K),
  r: 2,
  fill: '#f3f3ef',
  stroke: '#2a2a2a',
  sw: 1.4,
});
[327, 368, 409, 450, 490, 531, 572].forEach((x) =>
  decor.push({ t: 'line', x1: X(x), y1: Y(310), x2: X(x), y2: Y(405), w: 1.2 })
);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C2'];
const SPOKEN: Record<string, string> = {
  C: 'C',
  'C#': 'C sharp',
  D: 'D',
  'D#': 'D sharp',
  E: 'E',
  F: 'F',
  'F#': 'F sharp',
  G: 'G',
  'G#': 'G sharp',
  A: 'A',
  'A#': 'A sharp',
  B: 'B',
  C2: 'upper C',
};
let white = 0;
NAMES.forEach((k) => {
  const x = KEY_X[k];
  const black = k.includes('#');
  text(x, 304, k === 'C2' ? 'C' : k, 13);
  const id = `seq.key${k.replace('#', 's')}`;
  if (black) {
    decor.push({
      t: 'rect',
      x: X(x - 12),
      y: Y(309),
      w: Math.round(24 * K),
      h: Math.round(60 * K),
      r: 2,
      fill: '#3b3b3d',
    });
    led(x, 318, { id, eq: true });
    const role =
      k === 'C#'
        ? ' In track writing it is DEL, which deletes a measure.'
        : k === 'D#'
          ? ' In track writing it is INS, which inserts a measure.'
          : '';
    btn(id, x, 341, 16, 15, {
      label: k,
      name: `${k} key`,
      help: `Enters ${SPOKEN[k]} in PITCH MODE.${role}`,
    });
    if (k === 'C#') plate(x, 358, 18, 8, 'DEL', 11, { fill: RED });
    if (k === 'D#') plate(x, 358, 18, 8, 'INS', 11, { fill: RED });
  } else {
    white++;
    const n = white;
    led(x, 363, { id, eq: true });
    btn(id, x, 388, 22, 15, {
      label: k === 'C2' ? 'C' : k,
      name: `${k === 'C2' ? 'Upper C' : k} key / PATTERN ${n}`,
      help: `Enters ${SPOKEN[k]} in PITCH MODE. It is also PATTERN ${n}, which picks a pattern to play or write, and selector digit ${n} for measure numbers.`,
    });
    text(x, 415, String(n), 14, { fill: RED, weight: 700 });
    box(x, 436, 13, 9, String(n), 12);
  }
});
text(268, 415, 'PATTERN', 12, { fill: RED, weight: 700 });
text(242, 437, 'SELECTOR', 13);
box(328, 436, 16, 9, 'DEL', 10);
box(369, 436, 16, 9, 'INS', 10);

// time mode, transpose, accent, slide
text(668, 304, 'TIME MODE', 15);
text(640, 329, '● ♪', 20);
text(678, 329, '○ ♪', 20);
text(713, 329, '—', 20);
decor.push({ t: 'path', d: `M${X(722)} ${Y(323)} q4 6 12 0 L${X(722)} ${Y(334)}`, w: 2.5 });
btn('seq.time', 757, 327, 26, 14, {
  label: 'TIME MODE',
  name: 'TIME MODE',
  help: 'Gives each step its timing: a note, a tie that holds the note before, or a rest. Pitches go in first in PITCH MODE; timing follows here.',
});
text(657, 341, 'TRANSPOSE', 10);
plate(636, 351, 34, 8, 'DOWN', 11);
plate(678, 351, 34, 8, 'UP', 11);
plate(717, 351, 34, 8, 'ACCENT', 11);
plate(757, 351, 34, 8, 'SLIDE', 11);
led(636, 363, { id: 'seq.down', eq: true });
led(678, 363, { id: 'seq.up', eq: true });
led(717, 363, { id: 'seq.accent', eq: true });
led(757, 363, { id: 'seq.slide', eq: true });
btn('seq.down', 636, 388, 22, 15, {
  label: 'DOWN',
  name: 'TRANSPOSE DOWN / NOTE / STEP',
  help: 'In PITCH MODE it puts the next note an octave down. In TIME MODE it enters a note on this step. With FUNCTION held it counts the steps in a pattern.',
});
btn('seq.up', 678, 388, 22, 15, {
  label: 'UP',
  name: 'TRANSPOSE UP / TIE / TRIPLET',
  help: 'In PITCH MODE it puts the next note an octave up. In TIME MODE it enters a tie, so the note before is held through this step. It also sets triplet timing.',
});
btn('seq.accent', 717, 388, 22, 15, {
  ui: false,
  module: 'env',
  label: 'ACCENT',
  name: 'ACCENT button',
  help: 'On the TB-303 this writes an accent into the step being edited, and selects pattern section A. In this app, while it is lit every note you play is accented, so you can hear the ACCENT knob. The riffs carry their own accents.',
});
btn('seq.slide', 757, 388, 22, 15, {
  ui: false,
  module: 'glide',
  label: 'SLIDE',
  name: 'SLIDE button',
  help: 'On the TB-303 this writes a slide into the step being edited, and selects pattern section B. In this app, while it is lit every note glides from the one before. Without it, notes glide only when they overlap, as slid steps do in the riffs.',
});
text(636, 414, 'STEP', 12);
text(678, 414, '♪♪♪', 12);
text(717, 414, 'A', 12, { fill: RED, weight: 700 });
text(757, 414, 'B', 12, { fill: RED, weight: 700 });
text(737, 421, 'PATT. SECTION', 9, { fill: RED });
(
  [
    [636, '9'],
    [678, '0'],
    [717, '100'],
    [757, '200'],
  ] as [number, string][]
).forEach(([x, t]) => box(x, 436, t.length > 1 ? 20 : 13, 9, t, 12));

// back, write/next
box(820, 302, 14, 9, 'S', 13);
text(820, 318, 'BACK', 12);
btn('seq.back', 820, 338, 26, 14, {
  label: 'BACK',
  name: 'BACK',
  help: 'Steps back one note while checking or editing a pattern.',
});
box(820, 376, 18, 9, 'D.S.', 11);
btn('seq.write', 820, 396, 34, 18, {
  label: 'WRITE/NEXT',
  name: 'WRITE/NEXT (TAP)',
  help: 'Moves on to the next step while writing, writes a pattern into a track, and enters timing by tapping (TAP), held longer for a longer note.',
});
text(820, 418, 'WRITE/NEXT', 12);
text(820, 437, 'TAP', 12);

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x: number, y: number, w: number, h: number): ViewRect => ({
  x: X(x),
  y: Y(y),
  w: Math.round(w * K),
  h: Math.round(h * K),
});
const areas: Area[] = [
  {
    id: 'rear',
    label: 'Rear connections',
    module: 'patch',
    keywords: 'jacks sockets cv gate din sync headphones output mix in drum machine',
    rects: [R(124, 108, 80, 20), R(250, 108, 58, 30), R(655, 108, 216, 22)],
    help: 'The sockets along the back edge. CV and GATE let the sequencer play another synth; SYNC IN takes tempo from a Roland drum machine; MIX IN mixes another sound in before the outputs.',
  },
  {
    id: 'wave',
    label: 'Waveform',
    module: 'osc',
    keywords: 'oscillator vco saw square',
    rects: [R(204, 108, 46, 36)],
    help: 'The TB-303 has one oscillator, and this switch on the back edge chooses its waveform: sawtooth or square. Everything else about the tone is done by the filter.',
  },
  {
    id: 'tuning',
    label: 'Tuning',
    module: 'osc',
    keywords: 'pitch tune cents',
    rects: [R(308, 110, 63, 60)],
    help: 'TUNING moves the whole instrument up or down by up to about five semitones, to match other instruments. The notes themselves come from the sequencer.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'cutoff resonance squelch env mod brightness acid',
    rects: [R(371, 110, 170, 60)],
    help: 'The resonant low-pass filter that makes the TB-303’s sound. CUT OFF FREQ sets its resting point, RESONANCE the squelch, and ENV MOD how far each note opens it. Turning these three while a pattern plays is how acid lines are performed.',
  },
  {
    id: 'envacc',
    label: 'Decay and accent',
    module: 'env',
    keywords: 'envelope decay accent wow length',
    rects: [R(541, 110, 114, 60)],
    help: 'DECAY sets how quickly the filter closes after each note. ACCENT sets how much accented steps stand out: they are louder, their filter decay is short whatever DECAY says, and they sweep the filter higher. The higher RESONANCE is, the bigger that sweep.',
  },
  {
    id: 'tempo',
    label: 'Tempo',
    module: 'mode',
    keywords: 'bpm speed clock',
    rects: [R(180, 178, 95, 100)],
    help: 'TEMPO sets the speed of the sequencer. Here it sets the speed of the riff.',
  },
  {
    id: 'track',
    label: 'Track and pattern group',
    module: 'mode',
    keywords: 'song chain group bank',
    rects: [R(290, 178, 105, 100)],
    help: 'Picks one of seven tracks (songs made of patterns) or one of four groups of patterns, depending on MODE. Not modelled: this app plays one riff per sound.',
  },
  {
    id: 'modesw',
    label: 'Mode',
    module: 'mode',
    keywords: 'write play pattern track',
    rects: [R(415, 178, 140, 100)],
    help: 'Chooses between writing and playing, for patterns or for tracks. Not modelled: there is no pattern memory here.',
  },
  {
    id: 'volume',
    label: 'Volume',
    module: 'out',
    keywords: 'level power',
    rects: [R(735, 178, 90, 100)],
    help: 'VOLUME sets the output level; it is also the power switch.',
  },
  {
    id: 'runclear',
    label: 'Clear and run',
    module: 'mode',
    keywords: 'start stop run clear reset',
    rects: [R(129, 291, 83, 134)],
    help: 'PATTERN CLEAR empties the pattern being written, and in a track resets it to the first measure. RUN/STOP starts and stops the sequencer; its lamp lights while it runs.',
  },
  {
    id: 'pitchfn',
    label: 'Pitch mode and function',
    module: 'mode',
    keywords: 'pitch entry normal mode function',
    rects: [R(214, 291, 70, 134)],
    help: 'A pattern is written in two passes. PITCH MODE is the first: each press of a key enters the next note. FUNCTION returns to normal mode, and held it gives the second functions.',
  },
  {
    id: 'keys',
    label: 'Note keys and pattern selectors',
    module: 'mode',
    keywords: 'keyboard notes pattern select selector transpose',
    rects: [R(285, 291, 330, 134)],
    help: 'Thirteen keys, one octave from C to C. In PITCH MODE they enter notes. The eight white keys double as PATTERN 1 to 8 and as digits for measure numbers, and C sharp and D sharp as DEL and INS for editing tracks. The on-screen keyboard plays the synth here.',
  },
  {
    id: 'timemode',
    label: 'Time mode, accent and slide',
    module: 'mode',
    keywords: 'timing note tie rest accent slide glide transpose octave',
    rects: [R(616, 291, 166, 134)],
    help: 'TIME MODE is the second pass of writing a pattern: each step becomes a note, a tie or a rest. TRANSPOSE DOWN and UP set octaves while entering pitches. ACCENT and SLIDE mark steps: an accent makes a note louder and sharper, and a slide glides into the next note without starting it again. Here ACCENT and SLIDE also work on the notes you play.',
  },
  {
    id: 'backwrite',
    label: 'Back and write',
    module: 'mode',
    keywords: 'next tap write step back',
    rects: [R(784, 291, 83, 134)],
    help: 'BACK and WRITE/NEXT step back and forward through a pattern while it is written or checked. WRITE/NEXT also stores a pattern into a track, and can be tapped to enter timing in time.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  const res = num(v, 'filter.res') / 10;
  const env = num(v, 'filter.envMod') / 10;
  const acc = num(v, 'amp.accent') / 10;
  const decay = decayS(num(v, 'env.decay'));
  return {
    osc: [
      {
        level: 0.8,
        mix: v['osc.wave'] === 'saw' ? { saw: 1 } : { pulse: 1 },
        pw: 0.5,
        semi: num(v, 'osc.tuning'),
        kbd: true,
        syncTo: -1,
      },
    ],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    // ENV MOD also pulls the filter's resting point down a little, as on the hardware
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutHz(num(v, 'filter.cutoff')) * Math.pow(2, -0.9 * env),
      res: res * 0.97,
      envAmt: 0.5 + env * 4,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: { a: 0.003, d: decay, s: 0, r: decay },
    env2: { a: 0.003, d: 3.5, s: 0, r: 0.012 },
    vca: { envSrc: 'env2', bias: 0 },
    acid: {
      thresh: 0.9,
      force: !!v['seq.accent'],
      decay: 0.2,
      rise: 0.012,
      fall: 0.06 + 0.35 * res,
      cut: acc * (0.6 + 2.6 * res),
      amp: acc * 0.9,
    },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0.07, legato: !v['seq.slide'] },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
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

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const tb303: SynthDef & { version: number } = {
  id: 'tb-303',
  version: 1,
  name: 'TB-303',
  maker: 'Roland',
  year: 1981,
  heritage: 'The original Computer Controlled Bass Line, 1981–84',
  summary:
    'One sawtooth or square oscillator → a resonant low-pass filter → a VCA, with a single decay envelope, accent and slide, played by a 16-step sequencer.',
  view: { w: 2103, h: 1000 },
  theme: {
    panel: '#d3d3cf',
    panel2: '#bdbdb9',
    ink: '#262626',
    font: 'helv',
    cheeks: 'none',
    cheekW: 0,
    knobRing: true,
  },
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the volume envelope',
    kbd: 'the pitch CV',
    gate: 'the gate',
    out: 'the output',
  },
  tempo: 'seq.tempo',
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default tb303;
