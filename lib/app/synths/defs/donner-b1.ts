/**
 * Donner Essential B1 (sold as the Donner Syn Bass): the definition (D1). Positions are measured on the 1500×683 product
 * photo (`.context/app/synth-data/donner-b1/raw/donner-b1.png`, local only) and scaled by 1.5 into view units: X() and Y()
 * take photo pixels. The owner's spec is `.context/app/synth-data/donner-b1/donner-b1.synth.json`.
 *
 * The first synth written straight into the app, with no prototype version to transliterate (`f-donner-b1`). Its voice
 * follows the spec: one VCO, a resonant low-pass, one decay envelope to the filter (DEPTH) and the VCA, accent, then
 * saturation and delay, each switchable. Built like `defs/td-3.ts`, the nearest instrument: no content (sounds,
 * lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the DONNER logo and the printed "DONNER SYN
 * BASS / ANALOG SYNTHESIZER AND SEQUENCER"), and panel values read through `num()`.
 *
 * The keyboard, the step keys and the sequencer buttons are drawn and explained. As on the TB-303 and TD-3 pages, each
 * sound's riff plays its pattern; ACCENT and SLIDE also work on the notes you play.
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
  RectDecor,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos'>;
type ButtonRest = Pick<ButtonControl, 'label' | 'name' | 'help'> &
  Partial<Pick<ButtonControl, 'ui' | 'module' | 'lamp'>>;
type JackRest = OmitEach<Jack, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos'>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor'>>;
type RectRest = Partial<Pick<RectDecor, 'fill' | 'stroke' | 'sw' | 'r'>>;

const K = 1.5;
const X = (x: number): number => Math.round((x - 45) * K);
const Y = (y: number): number => Math.round((y - 30) * K);
const INK = '#f2f2ef';
const DECK = '#9da0a6';
const DECK_INK = '#3b3d42';
const BAR = '#c8cbd0';

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
    style: 'obxa',
    labelPos: 'none',
    ...rest,
  });
};
const text = (x: number, y: number, t: string, size = 20, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y),
    text: t,
    size,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const rect = (x: number, y: number, w: number, h: number, rest: RectRest = {}): void => {
  decor.push({
    t: 'rect',
    x: X(x),
    y: Y(y),
    w: Math.round(w * K),
    h: Math.round(h * K),
    r: 4,
    fill: BAR,
    ...rest,
  });
};

// ── The keyboard deck: the grey lower half of the case ────────────────────
rect(48, 262, 1442, 400, { fill: DECK, r: 24 });

// ── Faceplate print ───────────────────────────────────────────────────────
// the logo: a waveform of bars beside the wordmark
decor.push({
  t: 'path',
  d: [
    [152, 112, 124],
    [158, 104, 130],
    [164, 92, 140],
    [170, 100, 134],
    [176, 110, 122],
  ]
    .map(([x, y0, y1]) => `M${X(x)} ${Y(y0)} V${Y(y1)}`)
    .join(' '),
  w: 7,
  brand: true,
});
text(258, 132, 'DONNER', 64, { weight: 800, spacing: 1, brand: true });
text(240, 189, 'DONNER SYN BASS', 36, { weight: 700, brand: true });
text(240, 206, 'ANALOG SYNTHESIZER AND SEQUENCER', 16, { weight: 700, brand: true });

// the brackets round the four small sockets
decor.push({
  t: 'path',
  d: [
    `M${X(422)} ${Y(92)} V${Y(80)} q0 -6 6 -6 H${X(440)}`,
    `M${X(540)} ${Y(74)} H${X(551)} q6 0 6 6 V${Y(92)}`,
    `M${X(422)} ${Y(210)} V${Y(222)} q0 6 6 6 H${X(434)}`,
    `M${X(546)} ${Y(228)} H${X(551)} q6 0 6 -6 V${Y(210)}`,
  ].join(' '),
  w: 2.5,
});

// the silver bars behind the filter, saturation and delay knobs
rect(800, 66, 246, 60, { r: 45 });
rect(608, 168, 248, 60, { r: 45 });
rect(893, 168, 348, 60, { r: 45 });

// ── Jacks ─────────────────────────────────────────────────────────────────
const jack = (id: string, x: number, y: number, label: string, rest: JackRest): void => {
  jacks.push({ id, x: X(x), y: Y(y), r: 22, label, labelPos: 'none', ...rest });
  text(x, y + 35, label, 18);
};
jack('j.auxIn', 455, 110, 'AUX IN', {
  dir: 'in',
  dest: null,
  name: 'AUX IN',
  help: 'Outside audio mixed with the B1 at its outputs, so another instrument can share the headphones. It does not go through the filter or the effects. Not modelled here: a cable in it does nothing.',
});
jack('j.phones', 525, 110, 'PHONES', {
  dir: 'out',
  signal: 'out',
  name: 'PHONES',
  help: 'Headphone output: the finished sound, after the saturation, the delay and MASTER.',
});
jack('j.syncIn', 455, 182, 'SYNC IN', {
  dir: 'in',
  dest: null,
  name: 'SYNC IN',
  help: 'Clock pulses from other gear, so the sequencer follows its tempo. Not modelled here: a cable in it does nothing.',
});
jack('j.syncOut', 525, 182, 'SYNC OUT', {
  dir: 'out',
  signal: 'gate',
  name: 'SYNC OUT',
  help: 'Clock pulses for other gear, always on. Here it gives the gate, on while a note is held, the nearest signal the app has to a clock.',
});

// ── Top row: wave, VCO, filter, envelope, accent ──────────────────────────
const TOP = 100;
const BELOW = 134;
const cutHz = (v: number): number => expMap(v / 10, 140, 6000);
const decayS = (v: number): number => expMap(v / 10, 0.12, 2.2);

text(636, 58, 'WAVE', 20);
decor.push(
  { t: 'wave', x: X(636), y: Y(74), size: 14, shape: 'saw', stroke: INK },
  { t: 'wave', x: X(636), y: Y(122), size: 14, shape: 'sq', stroke: INK }
);
controls.push({
  id: 'vco.wave',
  type: 'toggle',
  x: X(636),
  y: Y(98),
  w: 30,
  kind: 'enum',
  module: 'osc',
  options: [
    { v: 'saw', label: 'Sawtooth' },
    { v: 'sq', label: 'Square' },
  ],
  def: 'saw',
  label: 'WAVE',
  labelPos: 'none',
  help: 'Chooses the oscillator’s waveform. Up is sawtooth, bright and buzzy, the usual acid sound; down is square, hollower and rounder.',
});

text(732, 58, 'VCO', 20);
text(732, BELOW + 4, 'PITCH', 17);
knob('vco.pitch', 732, TOP, 24, {
  kind: 'cont',
  min: -7,
  max: 7,
  def: 0,
  module: 'osc',
  label: 'PITCH',
  fmt: fmtSemi,
  help: 'Tunes the oscillator up to a fifth down or up, with a click at the centre. It moves every note, so it is for matching other instruments, or for playing a riff in another key.',
});

text(921, 58, 'FILTER', 20);
text(827, BELOW + 4, 'CUT OFF', 17);
text(921, BELOW + 4, 'RESONANCE', 17);
text(1017, BELOW + 4, 'DEPTH', 17);
knob('vcf.cutoff', 827, TOP, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'filter',
  label: 'CUT OFF',
  name: 'CUTOFF',
  fmt: (v) => fmtHz(cutHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull, round bass; high settings let the full buzz through.',
});
knob('vcf.resonance', 921, TOP, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'filter',
  label: 'RESONANCE',
  help: 'Boosts the frequencies right at the cutoff, so filter movement turns into a squelch. It also sets how far accented notes push the filter.',
});
knob('vcf.depth', 1017, TOP, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'filter',
  label: 'DEPTH',
  name: 'DEPTH (envelope to filter)',
  help: 'How far the envelope opens the filter on each note. Turned up, every note starts bright and closes down.',
});

text(1110, 58, 'ENVELOPE', 20);
text(1107, BELOW + 4, 'DECAY', 17);
knob('env.decay', 1107, TOP, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'env',
  label: 'DECAY',
  fmt: (v) => fmtTime(decayS(v)),
  help: 'How long each note takes to die away. The one envelope closes the filter and fades the note together: short gives clipped, plucky notes, long lets each note ring and close slowly.',
});

text(1205, 58, 'ACCENT', 20);
knob('vca.accent', 1205, TOP, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'env',
  label: 'ACCENT',
  help: 'How much accented notes stand out: louder, and with an extra sweep of the filter. Notes that are not accented are not affected.',
});

// ── Second row: saturation, delay ─────────────────────────────────────────
const LOW = 198;
const UNDER = 240;
const onOff = (x: number, id: string, label: string, help: string): void => {
  text(x, 166, 'ON', 18);
  text(x, UNDER, 'OFF', 18);
  controls.push({
    id,
    type: 'toggle',
    x: X(x),
    y: Y(196),
    w: 30,
    kind: 'bool',
    def: false,
    module: 'fx',
    label,
    labelPos: 'none',
    help,
  });
};

text(733, 162, 'SATURATION', 20);
onOff(
  636,
  'sat.on',
  'SATURATION ON/OFF',
  'Switches the saturation in. Off, DRIVE and TONE do nothing.'
);
text(732, UNDER, 'DRIVE', 17);
text(827, UNDER, 'TONE', 17);
knob('sat.drive', 732, LOW, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'DRIVE',
  name: 'Saturation DRIVE',
  help: 'How hard the saturation is driven. Low settings add warmth and grit; high settings turn the bass into a fuzzy, compressed roar.',
});
knob('sat.tone', 827, LOW, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'fx',
  label: 'TONE',
  name: 'Saturation TONE',
  help: 'Brightness of the saturation: left is darker and smoother, right is brighter and harsher.',
});

text(1062, 162, 'DELAY', 20);
onOff(
  918,
  'dly.on',
  'DELAY ON/OFF',
  'Switches the delay in. Off, LEVEL, TIME and FEEDBACK do nothing.'
);
const delayS = (v: number): number => expMap(v / 10, 0.04, 0.5);
text(1017, UNDER, 'LEVEL', 17);
text(1111, UNDER, 'TIME', 17);
text(1205, UNDER, 'FEEDBACK', 17);
knob('dly.level', 1017, LOW, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'LEVEL',
  name: 'Delay LEVEL',
  help: 'How loud the echoes are against the sound itself.',
});
knob('dly.time', 1111, LOW, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'fx',
  label: 'TIME',
  name: 'Delay TIME',
  fmt: (v) => fmtTime(delayS(v)),
  help: 'The gap before each echo, up to about half a second. It is not tied to the tempo, so set it by ear against the riff.',
});
knob('dly.feedback', 1205, LOW, 24, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'fx',
  label: 'FEEDBACK',
  name: 'Delay FEEDBACK',
  help: 'How many echoes follow each note. At the minimum there is one; turned up, the echoes keep going and darken as they fade.',
});

// ── Master ────────────────────────────────────────────────────────────────
text(1340, 208, 'MASTER', 20);
decor.push(
  { t: 'circle', x: X(1303), y: Y(186), r: 3, fill: INK },
  { t: 'circle', x: X(1376), y: Y(186), r: 3, fill: INK }
);
knob('out.master', 1345, 132, 36, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'MASTER',
  help: 'Output level at MAIN OUT and the headphone socket.',
});

// ── Display: the tempo ────────────────────────────────────────────────────
rect(1234, 290, 210, 79, { fill: '#121315', r: 6 });
controls.push({
  id: 'seq.tempo',
  type: 'menu',
  x: X(1339),
  y: Y(330),
  w: Math.round(190 * K),
  h: 56,
  size: 30,
  vw: 120,
  kind: 'cont',
  min: 40,
  max: 240,
  def: 120,
  step: 1,
  module: 'mode',
  ui: true,
  label: 'BPM',
  name: 'Tempo',
  fmt: (v) => String(Math.round(v)),
  help: 'The display shows the tempo, set with TEMPO TAP and the arrow buttons. Here it sets the speed of the riff, and each sound starts at its own riff’s tempo.',
});

// ── Function buttons ──────────────────────────────────────────────────────
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
const COLS = [1261, 1338, 1414];
const ROWS = [405, 452, 500, 548, 596];
const NOT_HERE = 'Not modelled here: each sound’s riff plays its pattern.';
const FUNCS: [id: string, label: string, help: string, rest?: Partial<ButtonRest>][][] = [
  [
    [
      'seq.down',
      '▼',
      `Lowers whatever is being set (tempo, octave, gate length, ratchet, pattern, arpeggio order); otherwise steps back to the previous step. ${NOT_HERE}`,
    ],
    [
      'kbd.octave',
      'OCT',
      'Octave mode: with it lit, ▼ and ▲ move the keyboard down or up an octave. The on-screen keyboard has its own octave buttons here.',
    ],
    [
      'seq.up',
      '▲',
      `Raises whatever is being set; otherwise steps on to the next step. ${NOT_HERE}`,
    ],
  ],
  [
    [
      'seq.tap',
      'TEMPO TAP',
      'Tap it two to four times in time to set the tempo, or press it once and set 40 to 240 BPM with ▼ and ▲. Here the tempo is the number on the display.',
    ],
    [
      'seq.play',
      'PLAY/STOP',
      'Starts and stops the pattern. Playing, the keys transpose it live. In this app, use Play riff instead.',
    ],
    [
      'seq.rec',
      'REC/EDIT',
      `Record mode: each key enters a note and moves to the next step. Held with a step key, it edits that one step, playing or not. ${NOT_HERE}`,
    ],
  ],
  [
    [
      'seq.pattern',
      'PATTERN',
      `Chooses one of 128 patterns with ▼ and ▲. Held for two seconds it reloads the saved pattern. ${NOT_HERE}`,
    ],
    [
      'seq.save',
      'SAVE',
      `Saves the pattern: SAVE, choose a slot, SAVE again. Edits that are not saved are lost when another pattern loads. The knobs are never saved. ${NOT_HERE}`,
    ],
    [
      'seq.clear',
      'CLEAR/REST',
      `Enters a rest while recording. Held for two seconds it clears the pattern; held while it plays it mutes it. ${NOT_HERE}`,
    ],
  ],
  [
    [
      'seq.gate',
      'GATE LENGTH',
      `Sets how long each step's note is held, in eighths of a step: 0 is a rest and 8 is a tie into the next step. Held while a pattern plays it sets every step at once. ${NOT_HERE}`,
    ],
    [
      'seq.accent',
      'ACCENT',
      'On the B1 this accents the step being recorded, or every step while held during playback. In this app, while it is lit every note you play is accented, so you can hear the ACCENT knob. The riffs carry their own accents.',
      { ui: false, module: 'env' },
    ],
    [
      'seq.ratchet',
      'RATCHET',
      `Plays a step two, three or four times inside its own length, for rolls and stutters. Held while a pattern plays it ratchets every step. ${NOT_HERE}`,
    ],
  ],
  [
    [
      'seq.slide',
      'SLIDE',
      'On the B1 this marks a step to glide into the next one. In this app, while it is lit every note glides from the one before. Without it, notes glide only when they overlap, as slid steps do in the riffs.',
      { ui: false, module: 'glide' },
    ],
    [
      'seq.arp',
      'ARP',
      'Arpeggiator on or off: held keys play one after another in one of eight orders, chosen with ▼ and ▲, at the tempo. Not modelled here.',
    ],
    [
      'kbd.hold',
      'HOLD',
      'With the keyboard it holds the note; with the arpeggiator it latches the held keys; while a pattern plays it repeats the current step. Not modelled here.',
    ],
  ],
];
FUNCS.forEach((row, r) =>
  row.forEach(([id, label, help, rest], c) => {
    btn(id, COLS[c], ROWS[r], 54, 21, { label, name: label, help, ...rest });
    // the arrows are printed as triangles: the panel fonts have no ▼ or ▲
    if (label === '▼' || label === '▲') {
      const x = X(COLS[c]);
      const y = Y(ROWS[r] + 22);
      const up = label === '▲' ? -1 : 1;
      decor.push({
        t: 'path',
        d: `M${x - 9} ${y - 5 * up} H${x + 9} L${x} ${y + 7 * up} Z`,
        w: 0,
        fill: DECK_INK,
      });
    } else text(COLS[c], ROWS[r] + 26, label, 14, { fill: DECK_INK, weight: 600 });
  })
);

// ── The keyboard: 16 white keys that are also the step keys, and 10 black keys ──
const WHITE = [
  'B1',
  'C2',
  'D2',
  'E2',
  'F2',
  'G2',
  'A2',
  'B2',
  'C3',
  'D3',
  'E3',
  'F3',
  'G3',
  'A3',
  'B3',
  'C4',
];
const BLACK: [note: string, x: number][] = [
  ['C#2', 230],
  ['D#2', 297],
  ['F#2', 432],
  ['G#2', 500],
  ['A#2', 567],
  ['C#3', 702],
  ['D#3', 770],
  ['F#3', 905],
  ['G#3', 972],
  ['A#3', 1040],
];
const spoken = (n: string): string => n.replace('#', ' sharp ');
const keyId = (n: string): string => `kbd.key${n.replace('#', 's')}`;
WHITE.forEach((n, i) => {
  const x = 130 + i * (1010 / 15);
  btn(keyId(n), x, 536, 54, 142, {
    lamp: 'blue',
    label: n,
    name: `${n} key / step ${i + 1}`,
    help: `Plays ${spoken(n)}. It is also step ${i + 1}: held with REC/EDIT it edits that step, and held for two seconds while a pattern plays it turns the step into a rest or back. The on-screen keyboard plays the synth here.`,
  });
  text(x, 624, String(i + 1), 13, { fill: DECK_INK, weight: 500 });
});
BLACK.forEach(([n, x]) =>
  btn(keyId(n), x, 377, 52, 145, {
    label: n,
    name: `${n} key`,
    help: `Plays ${spoken(n)}. While a pattern plays, any key transposes it, with C3 as the centre. The on-screen keyboard plays the synth here.`,
  })
);

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x: number, y: number, w: number, h: number): ViewRect => ({
  x: X(x),
  y: Y(y),
  w: Math.round(w * K),
  h: Math.round(h * K),
});
const areas: Area[] = [
  {
    id: 'jacks',
    label: 'Sockets',
    module: 'patch',
    keywords: 'jacks aux input headphones phones sync clock',
    rects: [R(420, 70, 140, 155)],
    help: 'Four small sockets. AUX IN mixes another instrument into the outputs, the headphone socket carries the finished sound, and SYNC IN and SYNC OUT take and give a clock so the sequencer can run with other gear.',
  },
  {
    id: 'wave',
    label: 'Wave',
    module: 'osc',
    keywords: 'oscillator vco saw sawtooth square waveform',
    rects: [R(606, 40, 62, 104)],
    help: 'The B1 has one oscillator, and this switch chooses its waveform: sawtooth or square. Everything else about the tone is done by the filter.',
  },
  {
    id: 'vco',
    label: 'VCO pitch',
    module: 'osc',
    keywords: 'pitch tune tuning transpose fifth',
    rects: [R(690, 40, 86, 104)],
    help: 'PITCH tunes the oscillator up to a fifth either way. The notes themselves come from the keys and the sequencer.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'cutoff resonance depth envelope squelch brightness acid',
    rects: [R(785, 40, 270, 104)],
    help: 'The resonant low-pass filter that makes the B1’s sound. CUT OFF sets its resting point, RESONANCE the squelch, and DEPTH how far each note’s envelope opens it. Turning these while a pattern plays is how acid lines are performed.',
  },
  {
    id: 'envacc',
    label: 'Envelope and accent',
    module: 'env',
    keywords: 'envelope decay accent length',
    rects: [R(1062, 40, 190, 104)],
    help: 'One envelope starts on every note and dies away at the DECAY rate, closing the filter and fading the note together. ACCENT sets how much accented notes stand out: louder, and with an extra sweep of the filter.',
  },
  {
    id: 'sat',
    label: 'Saturation',
    module: 'fx',
    keywords: 'drive distortion overdrive fuzz tone',
    rects: [R(606, 148, 252, 104)],
    help: 'A distortion stage after the filter and VCA. The switch brings it in; DRIVE sets how hard it is driven and TONE its brightness. The original TB-303 has none: players added pedals.',
  },
  {
    id: 'delay',
    label: 'Delay',
    module: 'fx',
    keywords: 'echo repeats feedback time level',
    rects: [R(890, 148, 355, 104)],
    help: 'Echoes after the saturation. The switch brings them in; LEVEL sets how loud they are, TIME the gap (up to about half a second), and FEEDBACK how many follow.',
  },
  {
    id: 'master',
    label: 'Master',
    module: 'out',
    keywords: 'volume level output',
    rects: [R(1265, 60, 160, 170)],
    help: 'MASTER sets the level at MAIN OUT and the headphone socket.',
  },
  {
    id: 'display',
    label: 'Display',
    module: 'mode',
    keywords: 'tempo bpm screen pattern number',
    rects: [R(1230, 285, 220, 90)],
    help: 'Three digits that show the tempo, and the pattern, octave, gate length, ratchet or arpeggio order while each is set. Here it shows the tempo of the riff.',
  },
  {
    id: 'transport',
    label: 'Octave, tempo and patterns',
    module: 'mode',
    keywords: 'octave tempo tap play stop record edit pattern save clear rest arrows',
    rects: [R(1225, 388, 228, 145)],
    help: '▼ and ▲ change whatever is being set, OCT shifts the keyboard, TEMPO TAP sets the speed, PLAY/STOP runs the pattern and REC/EDIT writes it. PATTERN, SAVE and CLEAR/REST choose, store and empty patterns.',
  },
  {
    id: 'steps',
    label: 'Step settings and arpeggiator',
    module: 'mode',
    keywords: 'gate length accent ratchet slide glide arpeggiator arp hold latch',
    rects: [R(1225, 534, 228, 100)],
    help: 'What a step does: GATE LENGTH holds it for part of a step or ties it to the next, ACCENT makes it louder and brighter, RATCHET repeats it, and SLIDE glides into the next note. ARP turns the keys into an arpeggiator and HOLD latches it. Here ACCENT and SLIDE also work on the notes you play.',
  },
  {
    id: 'keys',
    label: 'Keys and step keys',
    module: 'mode',
    keywords: 'keyboard notes touch keys steps sequencer transpose',
    rects: [R(95, 298, 1090, 340)],
    help: 'Twenty-six touch keys from B1 to C4. They play the synth, write notes into a pattern, and transpose it while it plays. The sixteen white keys are also the steps of the pattern, numbered 1 to 16 under them. The on-screen keyboard plays the synth here.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  const res = num(v, 'vcf.resonance') / 10;
  const depth = num(v, 'vcf.depth') / 10;
  const acc = num(v, 'vca.accent') / 10;
  const decay = decayS(num(v, 'env.decay'));
  return {
    osc: [
      {
        level: 0.8,
        mix: v['vco.wave'] === 'saw' ? { saw: 1 } : { pulse: 1 },
        pw: 0.5,
        semi: num(v, 'vco.pitch'),
        kbd: true,
        syncTo: -1,
      },
    ],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutHz(num(v, 'vcf.cutoff')),
      res: res * 1.05,
      envAmt: depth * 4.5,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: { a: 0.003, d: decay, s: 0, r: decay },
    // The one envelope runs the VCA too (Sound On Sound). Its volume half dies away a little slower than the filter
    // half, so a short DECAY still leaves a note to hear.
    env2: { a: 0.003, d: 0.15 + decay * 1.5, s: 0, r: 0.012 },
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
    // filter → VCA → saturation → delay → output
    normals: { vcaIn: 'vcf1', odIn: 'vca', delayIn: 'od' },
    od: v['sat.on']
      ? { on: true, drive: num(v, 'sat.drive') / 10, tone: num(v, 'sat.tone') / 10, level: 0.8 }
      : { on: false },
    // LEVEL is the echoes against the dry sound; FEEDBACK at its minimum leaves the single echo
    delay: v['dly.on']
      ? {
          on: true,
          time: delayS(num(v, 'dly.time')),
          fb: (num(v, 'dly.feedback') / 10) * 0.85,
          mix: (num(v, 'dly.level') / 10) * 0.6,
        }
      : { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: level10(num(v, 'out.master'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const donnerB1: SynthDef & { version: number } = {
  id: 'donner-b1',
  version: 1,
  name: 'B1',
  maker: 'Donner',
  year: 2022,
  heritage: 'A TB-303-style bass synth with its own sequencer, keyboard and effects',
  summary:
    'One sawtooth or square oscillator → a resonant low-pass filter → a VCA → saturation → delay, with a single decay envelope and accent, played from 26 touch keys or a 16-step sequencer.',
  view: { w: X(1495), h: Y(665) },
  theme: {
    panel: '#17181b',
    panel2: '#0d0e10',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    cheekW: 0,
    knobRing: false,
    button: 'black',
  },
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the volume envelope',
    kbd: 'the pitch',
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

export default donnerB1;
