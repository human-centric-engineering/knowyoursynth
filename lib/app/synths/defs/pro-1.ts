/**
 * Behringer Pro-1: the definition (D1). Coordinates: faceplate crop of the 1200×1200 photo, ×2
 * (x = (photoX − 62) × 2, y = (photoY − 470) × 2). Wood cheeks sit inside view.w.
 *
 * Transliterated from the prototype file `src/synths/pro1.js` (D3), the way `defs/model-d.ts` was:
 * no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand`, and
 * panel values read through `num()`.
 */
import type {
  Area,
  Control,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  KnobScale,
  OutputJack,
  SlideControl,
  SynthDef,
  SynthModule,
  TextDecor,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = OmitEach<
  KnobControl,
  'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos' | 'labelSize'
>;
type SlideRest = OmitEach<
  SlideControl,
  'id' | 'type' | 'orient' | 'x' | 'y' | 'w' | 'h' | 'labelPos'
>;
type JackRest<J extends Jack> = Omit<J, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'dir'>;

const S10: KnobScale = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, size: 11 };
// FREQUENCY and MASTER TUNE are printed 5 … 0 … 5
const BIP: KnobScale = {
  ticks: 11,
  size: 11,
  labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({ at, text: String(Math.abs(at)) })),
};

const OCT_SEMI: Record<string, number> = { 0: -24, 1: -12, 2: 0, 3: 12 };
const OCTAVES = [
  { v: '0', label: '0', a: -60 },
  { v: '1', label: '1', a: -20 },
  { v: '2', label: '2', a: 20 },
  { v: '3', label: '3', a: 60 },
];
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
const lfoHz = (v: number): number => expMap(v / 10, 0.08, 30);
const attackT = (v: number): number => expMap(v / 10, 0.002, 6.5);
const decayT = (v: number): number => expMap(v / 10, 0.002, 15);
const releaseT = (v: number): number => expMap(v / 10, 0.002, 25);
const pwOf = (v: number): number => 0.03 + 0.94 * clamp(v / 10, 0, 1);
const fmtPw = (v: number): string => `${Math.round(pwOf(v) * 100)} %`;

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const text = (
  x: number,
  y: number,
  t: string,
  size = 12,
  rest: Partial<Pick<TextDecor, 'anchor'>> = {}
): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', weight: 700, ...rest });
};
const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 28,
    style: 'pro1',
    labelPos: 'bottom',
    labelSize: 13,
    scale: S10,
    ...rest,
  });
};
const slide = (id: string, x: number, y: number, rest: SlideRest): void => {
  controls.push({ id, type: 'slide', orient: 'v', x, y, w: 22, h: 44, labelPos: 'none', ...rest });
};
/** Labels above / below a vertical slide switch. */
const ends = (x: number, y: number, top: string, bottom: string): void => {
  if (top) text(x, y - (top.includes('\n') ? 46 : 32), top, 11);
  if (bottom) text(x, y + 38, bottom, 11);
};
const frame = (x: number, y: number, w: number, h: number, label: string, gapW: number): void => {
  decor.push({ t: 'frame', x, y, w, h, r: 12, label, labelAt: 'top', labelSize: 15, gapW });
};

// ── Frames ────────────────────────────────────────────────────────────────
frame(70, 16, 322, 586, 'MODULATION', 140);
frame(406, 86, 580, 170, 'OSCILLATOR A', 160);
frame(1000, 86, 406, 170, 'MIXER', 84);
frame(406, 266, 720, 160, 'OSCILLATOR B', 160);
frame(1140, 266, 266, 160, 'GLIDE', 80);
frame(406, 440, 350, 156, 'LFO/CLOCK', 130);
frame(772, 440, 180, 156, 'SEQUENCER', 126);
frame(966, 440, 104, 156, 'ARP', 56);
frame(1082, 440, 324, 156, 'MODE', 76);
frame(1420, 86, 556, 340, 'FILTER', 90);
frame(1420, 440, 556, 156, 'AMPLIFIER', 124);
[
  [76, 12],
  [760, 12],
  [1412, 12],
  [2080, 12],
  [76, 638],
  [760, 638],
  [1412, 638],
  [2080, 638],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 7 }));
decor.push({ t: 'logo', x: 486, y: 52, size: 34, text: 'PRO-1', style: 'plate', brand: true });

// ── Modulation matrix ─────────────────────────────────────────────────────
text(142, 50, 'FROM', 13);
text(340, 50, 'TO', 13);
decor.push({ t: 'line', x1: 296, y1: 40, x2: 296, y2: 590, w: 2 });
const SOURCES = [
  {
    key: 'env',
    y: 140,
    name: 'FIL ENV',
    long: 'the filter envelope',
    use: 'Use it for pitch sweeps at the start of a note, or to sweep a synced oscillator.',
  },
  {
    key: 'oscB',
    y: 316,
    name: 'OSC B',
    long: 'Oscillator B',
    use: 'In LO FREQ it is a second LFO; at audio rate it adds growl and metallic FM tones.',
  },
  {
    key: 'lfo',
    y: 496,
    name: 'LFO',
    long: 'the LFO',
    use: 'Use it for vibrato, pulse-width movement or filter wobble.',
  },
];
SOURCES.forEach(({ key, y, name, long, use }) => {
  knob(`mod.${key}Amt`, 142, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: `AMOUNT\n${name}`,
    module: 'mod',
    help: `How much of ${long} is sent into the modulation bus chosen by its ROUTE switch. ${use}`,
  });
  slide(`mod.${key}Route`, 260, y - 6, {
    kind: 'enum',
    options: [
      { v: 'wheel', label: 'WHEEL' },
      { v: 'direct', label: 'DIRECT' },
    ],
    def: 'direct',
    module: 'mod',
    label: `${name} route`,
    help: `Sends ${long} to the WHEEL bus (you only hear it as you push the mod wheel) or the DIRECT bus (always on at the AMOUNT you set).`,
  });
  ends(260, y - 6, 'WHEEL', 'DIRECT');
  text(260, y + 50, 'ROUTE', 11);
});
const DESTS = [
  {
    id: 'mod.toAFreq',
    y: 100,
    name: 'OSC A FREQ',
    help: 'Lets a modulation bus move the pitch of Oscillator A: vibrato, pitch sweeps, or (with SYNC on) the classic tearing sync sweep.',
  },
  {
    id: 'mod.toAPw',
    y: 214,
    name: 'OSC A PW',
    help: 'Lets a modulation bus move the pulse width of Oscillator A. With the LFO this gives the shifting, chorus-like tone called PWM.',
  },
  {
    id: 'mod.toBFreq',
    y: 324,
    name: 'OSC B FREQ',
    help: 'Lets a modulation bus move the pitch of Oscillator B.',
  },
  {
    id: 'mod.toBPw',
    y: 434,
    name: 'OSC B PW',
    help: 'Lets a modulation bus move the pulse width of Oscillator B.',
  },
  {
    id: 'mod.toFilter',
    y: 540,
    name: 'FILTER',
    help: 'Lets a modulation bus move the filter cutoff: wobble from the LFO, or a rasping growl when Oscillator B modulates it at audio rate.',
  },
];
DESTS.forEach(({ id, y, name, help }) => {
  slide(id, 346, y, {
    kind: 'enum',
    module: 'mod',
    label: `To ${name}`,
    options: [
      { v: 'wheel', label: 'WH' },
      { v: 'off', label: 'OFF' },
      { v: 'direct', label: 'DIR' },
    ],
    def: 'off',
    help: `${help} Up takes the WHEEL bus, down takes the DIRECT bus, middle is off.`,
  });
  text(316, y - 11, 'WH', 9, { anchor: 'end' });
  text(316, y + 3, 'OFF', 9, { anchor: 'end' });
  text(316, y + 17, 'DIR', 9, { anchor: 'end' });
  text(340, y + 40, name, 10);
});

// ── Oscillator A ──────────────────────────────────────────────────────────
knob('oscA.freq', 466, 176, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  label: 'FREQUENCY',
  module: 'osc',
  scale: BIP,
  fmt: (v) => fmtSemi((v / 5) * 7),
  help: 'Fine tuning of Oscillator A, about a fifth either way. With SYNC on it stops changing the pitch and changes the tone instead.',
});
knob('oscA.octave', 606, 176, {
  kind: 'enum',
  options: OCTAVES,
  def: '2',
  label: 'OCTAVE',
  module: 'osc',
  scale: undefined,
  help: 'Moves Oscillator A up or down in whole octaves. 0 is the lowest, 3 the highest.',
});
slide('oscA.saw', 700, 162, {
  kind: 'bool',
  def: true,
  module: 'osc',
  label: 'Osc A sawtooth',
  help: 'Switches on the sawtooth: bright and buzzy, with every harmonic. It can be on together with the pulse.',
});
slide('oscA.pulse', 756, 162, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'Osc A pulse',
  help: 'Switches on the pulse wave: hollow at half width, thinner and more nasal as PULSE WIDTH moves away from the middle.',
});
decor.push(
  { t: 'wave', x: 700, y: 122, size: 10, shape: 'saw' },
  { t: 'wave', x: 756, y: 122, size: 10, shape: 'pulse' }
);
text(728, 214, 'SHAPE', 11);
knob('oscA.pw', 850, 176, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'PULSE WIDTH',
  module: 'osc',
  fmt: fmtPw,
  help: 'Width of the pulse wave. 5 is a square wave (hollow); towards either end it gets thin and reedy, and at the extremes it nearly disappears.',
});
slide('oscA.sync', 940, 166, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'Sync',
  help: 'Hard sync: Oscillator A is forced to restart every time Oscillator B completes a cycle. B now sets the pitch, and changing A’s frequency changes the tone instead.',
});
ends(940, 166, 'SYNC', 'OFF');

// ── Mixer ─────────────────────────────────────────────────────────────────
knob('mix.oscA', 1076, 176, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 8,
  label: 'OSC A',
  module: 'mixer',
  help: 'Level of Oscillator A going into the filter. There is no on/off switch: 0 is off.',
});
knob('mix.oscB', 1196, 176, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'OSC B',
  module: 'mixer',
  help: 'Level of Oscillator B going into the filter. Turn it to 0 when B is only being used as a modulator.',
});
knob('mix.noise', 1320, 176, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'NOISE/EXT',
  module: 'mixer',
  help: 'Level of white noise into the filter. With a cable in the EXT jack it becomes the level of that external signal instead.',
});

// ── Oscillator B ──────────────────────────────────────────────────────────
knob('oscB.freq', 466, 356, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  label: 'FREQUENCY',
  module: 'osc',
  scale: BIP,
  fmt: (v) => fmtSemi((v / 5) * 7),
  help: 'Fine tuning of Oscillator B. A tiny offset against Oscillator A makes the pair beat and sound fatter. In LO FREQ it becomes a wide-ranging speed control.',
});
knob('oscB.octave', 606, 356, {
  kind: 'enum',
  options: OCTAVES,
  def: '2',
  label: 'OCTAVE',
  module: 'osc',
  scale: undefined,
  help: 'Moves Oscillator B up or down in whole octaves.',
});
slide('oscB.saw', 700, 342, {
  kind: 'bool',
  def: true,
  module: 'osc',
  label: 'Osc B sawtooth',
  help: 'Switches on Oscillator B’s sawtooth. As a modulator it gives a ramp that rises and drops.',
});
slide('oscB.tri', 756, 342, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'Osc B triangle',
  help: 'Switches on the triangle: soft in the mix, and the smoothest shape when Oscillator B is used as a modulator.',
});
slide('oscB.pulse', 812, 342, {
  kind: 'bool',
  def: false,
  module: 'osc',
  label: 'Osc B pulse',
  help: 'Switches on Oscillator B’s pulse wave. As a modulator it jumps between two values.',
});
decor.push(
  { t: 'wave', x: 700, y: 302, size: 10, shape: 'saw' },
  { t: 'wave', x: 756, y: 302, size: 10, shape: 'tri' },
  { t: 'wave', x: 812, y: 302, size: 10, shape: 'pulse' }
);
text(756, 394, 'SHAPE', 11);
knob('oscB.pw', 926, 356, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'PULSE WIDTH',
  module: 'osc',
  fmt: fmtPw,
  help: 'Width of Oscillator B’s pulse wave. 5 is square.',
});
slide('oscB.lo', 1002, 342, {
  kind: 'enum',
  options: [
    { v: 'lo', label: 'LO FREQ' },
    { v: 'normal', label: 'NORMAL' },
  ],
  def: 'normal',
  module: 'osc',
  label: 'Osc B low frequency',
  help: 'LO FREQ drops Oscillator B far below hearing so it works as a second LFO. FREQUENCY and OCTAVE then set its speed.',
});
ends(1002, 342, 'LO FREQ', 'NORMAL');
slide('oscB.kbd', 1072, 342, {
  kind: 'bool',
  def: true,
  module: 'osc',
  label: 'Osc B keyboard',
  help: 'On: Oscillator B follows the keys. Off: it stays at one fixed pitch whatever you play, which is what you usually want from a modulator.',
});
ends(1072, 342, 'KYBD', 'OFF');

// ── Glide ─────────────────────────────────────────────────────────────────
knob('glide.rate', 1236, 356, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'RATE',
  module: 'glide',
  fmt: (v) => (v === 0 ? 'off' : fmtTime(Math.pow(v / 10, 2) * 3)),
  help: 'Portamento. At 0 the pitch jumps between notes; higher settings make it slide.',
});
slide('glide.mode', 1346, 342, {
  kind: 'enum',
  options: [
    { v: 'auto', label: 'AUTO' },
    { v: 'normal', label: 'NORMAL' },
  ],
  def: 'normal',
  module: 'glide',
  label: 'Glide mode',
  help: 'NORMAL slides between every pair of notes. AUTO only slides when you press a new key while still holding the last one, so you choose which notes slur.',
});
ends(1346, 342, 'AUTO', 'NORMAL');

// ── LFO / Clock ───────────────────────────────────────────────────────────
knob('lfo.rate', 470, 524, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'FREQUENCY',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 12 seconds up to 30 Hz. It is also the clock for REPEAT.',
});
slide('lfo.saw', 576, 510, {
  kind: 'bool',
  def: false,
  module: 'lfo',
  label: 'LFO sawtooth',
  help: 'Adds a rising ramp to the LFO output: a repeating upward sweep that drops back.',
});
slide('lfo.tri', 646, 510, {
  kind: 'bool',
  def: true,
  module: 'lfo',
  label: 'LFO triangle',
  help: 'Adds the triangle to the LFO output: a smooth up-and-down movement, right for vibrato and PWM.',
});
slide('lfo.pulse', 712, 510, {
  kind: 'bool',
  def: false,
  module: 'lfo',
  label: 'LFO pulse',
  help: 'Adds a square to the LFO output: it jumps between two values, for trills and on/off effects.',
});
decor.push(
  { t: 'wave', x: 576, y: 470, size: 10, shape: 'saw' },
  { t: 'wave', x: 646, y: 470, size: 10, shape: 'tri' },
  { t: 'wave', x: 712, y: 470, size: 10, shape: 'sq' }
);
text(646, 562, 'SHAPE', 11);

// ── Sequencer / Arp (on the panel, not modelled) ─────────────────────────
slide('seq.select', 832, 514, {
  kind: 'enum',
  options: [
    { v: 'seq1', label: 'SEQ 1' },
    { v: 'off', label: 'OFF' },
    { v: 'seq2', label: 'SEQ 2' },
  ],
  def: 'off',
  module: 'mode',
  label: 'Sequencer select',
  help: 'On the hardware this picks one of two 64-note sequences. It is not modelled here: use the riff player under the keyboard instead.',
});
ends(832, 514, 'SEQ 1', 'SEQ 2');
text(802, 518, 'OFF', 9, { anchor: 'end' });
slide('seq.transport', 906, 514, {
  kind: 'enum',
  options: [
    { v: 'record', label: 'RECORD' },
    { v: 'play', label: 'PLAY' },
  ],
  def: 'play',
  module: 'mode',
  label: 'Sequencer record / play',
  help: 'On the hardware this records or plays the selected sequence. It is not modelled here.',
});
ends(906, 514, 'RECORD', 'PLAY');
slide('arp.mode', 1018, 514, {
  kind: 'enum',
  options: [
    { v: 'up', label: 'UP' },
    { v: 'off', label: 'OFF' },
    { v: 'updown', label: 'UP/DOWN' },
  ],
  def: 'off',
  module: 'mode',
  label: 'Arpeggiator',
  help: 'On the hardware this steps through held notes at the LFO rate. It is not modelled here.',
});
ends(1018, 514, 'UP', 'UP/DOWN');
text(1036, 518, 'OFF', 9, { anchor: 'start' });

// ── Mode ──────────────────────────────────────────────────────────────────
slide('mode.poly', 1136, 514, {
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'Poly / mono',
  help: 'Used when several Pro-1 units are chained to play chords. It has no effect on a single unit, or in this app.',
});
ends(1136, 514, 'POLY', 'MONO');
slide('mode.retrig', 1200, 514, {
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'Retrigger',
  help: 'NORMAL: playing a new note while holding another changes pitch but does not restart the envelopes (legato). RETRIG: every key press restarts them, so each note gets its full attack.',
});
ends(1200, 514, 'RETRIG', 'NORMAL');
slide('mode.repeat', 1260, 514, {
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'Repeat',
  help: 'While you hold a key, the LFO re-fires both envelopes over and over at its own rate. Short envelopes turn one held note into a stream of pulses.',
});
ends(1260, 514, 'REPEAT\n/EXT', 'NORMAL');
slide('mode.drone', 1326, 514, {
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'Drone',
  help: 'Holds the gate open for ever: the envelopes run to their sustain level and stay there, so the synth sounds without a key held.',
});
ends(1326, 514, 'DRONE', 'OFF');
text(1378, 482, 'GATE', 10);
decor.push({ t: 'led', x: 1378, y: 504, r: 5, color: 'red', litWhen: 'gate' });

// ── Filter ────────────────────────────────────────────────────────────────
knob('filter.cutoff', 1492, 166, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'CUTOFF',
  module: 'filter',
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull thump; high settings let all the buzz of the oscillators through.',
});
knob('filter.res', 1616, 166, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'RESONANCE',
  module: 'filter',
  help: 'Boosts a narrow band right at the cutoff, so filter movement sounds vocal and squelchy. Near maximum the filter whistles on its own.',
});
knob('filter.env', 1750, 166, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'ENVELOPE\nAMOUNT',
  module: 'filter',
  help: 'How far the filter envelope pushes the cutoff above its resting position each time a note starts.',
});
knob('filter.kbd', 1876, 166, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'KEYBOARD\nAMOUNT',
  module: 'filter',
  help: 'How much the cutoff follows the keyboard. At 0 high notes sound duller than low ones; at 10 the cutoff follows the notes exactly.',
});
const adsr = (prefix: string, y: number, module: SynthModule, what: string): void => {
  knob(`${prefix}.attack`, 1492, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: 'ATTACK',
    module,
    fmt: (v) => fmtTime(attackT(v)),
    help: `How long ${what} takes to rise to its peak after a key is pressed.`,
  });
  knob(`${prefix}.decay`, 1616, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    label: 'DECAY',
    module,
    fmt: (v) => fmtTime(decayT(v)),
    help: `How long ${what} takes to fall from its peak to the sustain level.`,
  });
  knob(`${prefix}.sustain`, 1750, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: prefix === 'aenv' ? 10 : 5,
    label: 'SUSTAIN',
    module,
    help: `Where ${what} settles while the key stays down. At 0 it falls away completely even if you keep holding.`,
  });
  knob(`${prefix}.release`, 1876, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 3.5,
    label: 'RELEASE',
    module,
    fmt: (v) => fmtTime(releaseT(v)),
    help: `How long ${what} takes to die away after you let go of the key.`,
  });
};
adsr('fenv', 350, 'env', 'the filter envelope');

// ── Amplifier ─────────────────────────────────────────────────────────────
adsr('aenv', 524, 'amp', 'the volume');

// ── Right-hand column ─────────────────────────────────────────────────────
decor.push({
  t: 'logo',
  x: 2036,
  y: 56,
  size: 15,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
decor.push({ t: 'din', x: 2036, y: 170, r: 34 });
text(2036, 232, 'MIDI IN', 12);
knob('out.tune', 2036, 340, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  label: 'MASTER TUNE',
  module: 'osc',
  scale: BIP,
  fmt: (v) => fmtSemi(v / 5),
  help: 'Overall tuning of both oscillators, roughly a semitone either way.',
});
text(2022, 448, 'POWER', 10);
decor.push({ t: 'led', x: 2070, y: 444, r: 5, color: 'red', litWhen: 'power' });
knob('out.volume', 2036, 530, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'VOLUME',
  module: 'out',
  help: 'Master output level.',
});

// ── Jacks (one row along the top) ─────────────────────────────────────────
const arrow = (x: number, dir: 'in' | 'out'): void => {
  decor.push({ t: 'arrow', x: x + 25, y: 58, dir: dir === 'in' ? 'down' : 'up', size: 6 });
};
const jackIn = (id: string, x: number, label: string, rest: JackRest<InputJack>): void => {
  jacks.push({ id, x, y: 58, r: 15, label, labelPos: 'top', dir: 'in', ...rest });
  arrow(x, 'in');
};
const jackOut = (id: string, x: number, label: string, rest: JackRest<OutputJack>): void => {
  jacks.push({ id, x, y: 58, r: 15, label, labelPos: 'top', dir: 'out', ...rest });
  arrow(x, 'out');
};
jackIn('j.modWh', 642, 'MOD WH CV', {
  dest: null,
  help: 'Voltage control of the WHEEL bus depth. Not modelled here: the mod wheel beside the keyboard does this job.',
});
jackIn('j.oscCv', 736, 'OSC CV', {
  dest: 'pitchAll',
  amt: 24,
  add: true,
  help: 'Pitch control voltage for both oscillators, added to the keyboard pitch.',
});
jackIn('j.gateClk', 826, 'GATE/CLK', {
  dest: 'gate1',
  amt: 1,
  add: true,
  help: 'External gate or clock. In this app a signal patched here re-triggers the filter envelope.',
});
jackIn('j.lfoCv', 916, 'LFO CV', {
  dest: 'lfoRate',
  amt: 3,
  add: true,
  help: 'Voltage control of LFO speed, added to the FREQUENCY knob. Patch an envelope in and the wobble changes speed during each note.',
});
jackOut('j.lfoOut', 1010, 'LFO OUT', {
  signal: 'lfo',
  help: 'The LFO, with whichever shapes are switched on.',
});
jackOut('j.kybdCv', 1100, 'KYBD CV', {
  signal: 'kbd',
  help: 'The keyboard pitch as a voltage: higher notes give a higher voltage.',
});
jackOut('j.gate', 1192, 'GATE', {
  signal: 'gate',
  help: 'High while a note is held, low otherwise.',
});
jackIn('j.ext', 1282, 'EXT', {
  dest: 'extIn',
  amt: 1,
  check: (v) =>
    num(v, 'mix.noise') <= 0
      ? 'NOISE/EXT is at 0. With a cable in EXT that knob is the level of this input, so turn it up.'
      : null,
  help: 'External audio into the mixer. A cable here switches the noise generator out, and NOISE/EXT becomes the level for this input.',
});
jackOut('j.mixer', 1372, 'MIXER', {
  signal: 'mixer',
  help: 'The mixer output before the filter: raw oscillators and noise.',
});
jackIn('j.cutoffCv', 1466, 'CUTOFF CV', {
  dest: 'cutoff',
  amt: 5,
  add: true,
  help: 'Voltage control of filter cutoff, added to the knob.',
});
jackIn('j.resoCv', 1556, 'RESO CV', {
  dest: 'res',
  amt: 1,
  add: true,
  help: 'Voltage control of resonance, added to the knob.',
});
jackOut('j.filterEnv', 1646, 'FILTER ENV', {
  signal: 'env1',
  help: 'The filter envelope as a voltage, 0 to 5 V.',
});
jackOut('j.ampEnv', 1736, 'AMP ENV', {
  signal: 'env2',
  help: 'The amplifier envelope as a voltage, 0 to 5 V.',
});
jackOut('j.phones', 1830, 'PHONES', { signal: 'out', help: 'Headphone output.' });
jackOut('j.audioOut', 1920, 'AUDIO OUT', { signal: 'out', help: 'Main audio output.' });

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas: Area[] = [
  {
    id: 'modulation',
    label: 'Modulation',
    module: 'mod',
    keywords: 'matrix wheel direct route vibrato pwm amount',
    rects: [{ x: 70, y: 16, w: 322, h: 586 }],
    help: 'Three sources on the left (filter envelope, Oscillator B and the LFO) and five destinations on the right. Each source has an AMOUNT, and a ROUTE switch that sends it DIRECT (always on) or to the WHEEL (only as you push the mod wheel). Each destination switch picks which of those two it listens to, or neither.',
  },
  {
    id: 'patch',
    label: 'Patch points',
    module: 'patch',
    keywords: 'jacks sockets cv gate',
    rects: [{ x: 606, y: 14, w: 1354, h: 66 }],
    help: 'The sockets along the top. Inputs accept a control voltage, gate or audio; outputs send the LFO, keyboard pitch, gate, mixer and both envelopes. Hover over a jack with Explain sections off to see what it does.',
  },
  {
    id: 'oscA',
    label: 'Oscillator A',
    module: 'osc',
    keywords: 'vco pitch sawtooth pulse width sync',
    rects: [{ x: 406, y: 86, w: 580, h: 170 }],
    help: 'The main sound source. FREQUENCY and OCTAVE set its pitch, the sawtooth and pulse switches turn its two waveforms on (both can be on at once), and PULSE WIDTH thins the pulse. SYNC locks it to Oscillator B for the classic sync sweep.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'level volume noise external',
    rects: [{ x: 1000, y: 86, w: 406, h: 170 }],
    help: 'Sets the level of Oscillator A, Oscillator B and noise (or the external input) going into the filter.',
  },
  {
    id: 'oscB',
    label: 'Oscillator B',
    module: 'osc',
    keywords: 'vco pitch triangle lo freq detune modulator',
    rects: [{ x: 406, y: 266, w: 720, h: 160 }],
    help: 'A second oscillator, with a triangle wave as well as sawtooth and pulse. Detune it against Oscillator A for thickness. The low-frequency switch turns it into a second LFO, and the keyboard switch stops it following the keys so it holds one pitch as a modulation source.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'portamento slide',
    rects: [{ x: 1140, y: 266, w: 266, h: 160 }],
    help: 'Makes the pitch slide between notes. RATE sets how long the slide takes. NORMAL slides every note; AUTO slides only when you press a new key while still holding the last one.',
  },
  {
    id: 'lfo',
    label: 'LFO / clock',
    module: 'lfo',
    keywords: 'low frequency oscillator vibrato wobble tempo',
    rects: [{ x: 406, y: 440, w: 350, h: 156 }],
    help: 'A slow wave for vibrato, filter wobble and pulse-width movement. FREQUENCY sets its speed and the three switches turn its sawtooth, triangle and pulse shapes on. You hear nothing from it until you give it an AMOUNT in the modulation section.',
  },
  {
    id: 'seq',
    label: 'Sequencer',
    module: 'mode',
    keywords: 'sequence record play',
    rects: [{ x: 772, y: 440, w: 180, h: 156 }],
    help: 'On the hardware this records and plays two 64-note sequences at the LFO rate. It is not modelled in this app: use the riff player under the keyboard instead.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arpeggio up down',
    rects: [{ x: 966, y: 440, w: 104, h: 156 }],
    help: 'On the hardware this steps through the keys you hold, at the LFO rate. It is not modelled in this app.',
  },
  {
    id: 'mode',
    label: 'Mode',
    module: 'mode',
    keywords: 'retrigger legato repeat drone poly',
    rects: [{ x: 1082, y: 440, w: 324, h: 156 }],
    help: 'How key presses fire the envelopes. RETRIG restarts them on every key press, REPEAT re-fires them at the LFO rate while a key is held, and DRONE holds the note on with no key pressed.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'cutoff resonance low-pass keyboard tracking envelope amount brightness',
    rects: [{ x: 1420, y: 86, w: 556, h: 174 }],
    help: 'A low-pass filter. CUTOFF sets brightness and RESONANCE emphasises the cutoff point. ENVELOPE AMOUNT sets how far the filter envelope sweeps the cutoff on each note, and KEYBOARD AMOUNT makes higher notes brighter.',
  },
  {
    id: 'fenv',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release sweep',
    rects: [{ x: 1420, y: 260, w: 556, h: 166 }],
    help: 'ATTACK, DECAY, SUSTAIN and RELEASE for the filter sweep on each note, by the amount set with ENVELOPE AMOUNT above. It can also be sent to pitch or pulse width from the modulation section.',
  },
  {
    id: 'amp',
    label: 'Amplifier envelope',
    module: 'amp',
    keywords: 'adsr attack decay sustain release volume loudness',
    rects: [{ x: 1420, y: 440, w: 556, h: 156 }],
    help: 'Shapes the loudness of each note: the fade-in, the fall to the held level, the level held while the key is down, and the fade-out after you let go.',
  },
  {
    id: 'master',
    label: 'Tune and volume',
    module: 'out',
    keywords: 'master tune midi output level',
    rects: [{ x: 1984, y: 110, w: 112, h: 486 }],
    help: 'MASTER TUNE shifts the whole synth’s pitch to match other instruments, and VOLUME is the main output level. MIDI IN is where a keyboard connects on the hardware.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const DEST_MAP: [id: string, dst: string, max: number][] = [
  ['mod.toAFreq', 'pitch1', 24],
  ['mod.toAPw', 'pw1', 0.45],
  ['mod.toBFreq', 'pitch2', 24],
  ['mod.toBPw', 'pw2', 0.45],
  ['mod.toFilter', 'cutoff', 5],
];
const SRC_MAP: [key: string, src: string][] = [
  ['env', 'env1'],
  ['oscB', 'osc2'],
  ['lfo', 'lfo'],
];

function shapeMix(pairs: [name: string, flag: unknown][]): Record<string, number> {
  const on = pairs.filter(([, flag]) => flag);
  const g = on.length > 1 ? 0.75 : 1;
  const mix: Record<string, number> = {};
  on.forEach(([name]) => {
    mix[name] = g;
  });
  return mix;
}

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const tune = num(v, 'out.tune') / 5;
  const lo = v['oscB.lo'] === 'lo';
  const kbdB = !!v['oscB.kbd'];
  const osc = [
    {
      level: level10(num(v, 'mix.oscA'), 0.9),
      mix: shapeMix([
        ['saw', v['oscA.saw']],
        ['pulse', v['oscA.pulse']],
      ]),
      pw: pwOf(num(v, 'oscA.pw')),
      semi: OCT_SEMI[String(v['oscA.octave'])] + (num(v, 'oscA.freq') / 5) * 7 + tune,
      kbd: true,
      fixedNote: 60,
      syncTo: v['oscA.sync'] ? 1 : -1,
    },
    {
      level: level10(num(v, 'mix.oscB'), 0.9),
      mix: shapeMix([
        ['saw', v['oscB.saw']],
        ['tri', v['oscB.tri']],
        ['pulse', v['oscB.pulse']],
      ]),
      pw: pwOf(num(v, 'oscB.pw')),
      semi:
        OCT_SEMI[String(v['oscB.octave'])] +
        (lo ? -60 + (num(v, 'oscB.freq') / 5) * 36 : (num(v, 'oscB.freq') / 5) * 7) +
        (kbdB ? tune : 0),
      kbd: kbdB,
      fixedNote: 60,
      syncTo: -1,
    },
  ];
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const routes: EngineRoute[] = [];
  DEST_MAP.forEach(([id, dst, max]) => {
    const bus = v[id];
    if (bus === 'off') return;
    SRC_MAP.forEach(([key, src]) => {
      if (v[`mod.${key}Route`] !== bus) return;
      const amt = Math.pow(num(v, `mod.${key}Amt`) / 10, 2) * max * (bus === 'wheel' ? wheel : 1);
      if (Math.abs(amt) > 0.0005) routes.push({ src, dst, amt });
    });
  });
  const extPatched = !!ctx.patched['j.ext'];
  const noiseExt = level10(num(v, 'mix.noise'), extPatched ? 1 : 0.8);
  return {
    osc,
    noise: { level: extPatched ? 0 : noiseExt, color: 'white' },
    ext: { level: extPatched ? noiseExt : 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutoffHz(num(v, 'filter.cutoff')),
      res: (num(v, 'filter.res') / 10) * 1.06,
      envAmt: (num(v, 'filter.env') / 10) * 8,
      envSrc: 'env1',
      kbd: num(v, 'filter.kbd') / 10,
    },
    env1: {
      a: attackT(num(v, 'fenv.attack')),
      d: decayT(num(v, 'fenv.decay')),
      s: num(v, 'fenv.sustain') / 10,
      r: releaseT(num(v, 'fenv.release')),
    },
    env2: {
      a: attackT(num(v, 'aenv.attack')),
      d: decayT(num(v, 'aenv.decay')),
      s: num(v, 'aenv.sustain') / 10,
      r: releaseT(num(v, 'aenv.release')),
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: shapeMix([
        ['saw', v['lfo.saw']],
        ['tri', v['lfo.tri']],
        ['sq', v['lfo.pulse']],
      ]),
      keySync: false,
    },
    glide: { time: Math.pow(num(v, 'glide.rate') / 10, 2) * 3, legato: v['glide.mode'] === 'auto' },
    trig: { retrig: !!v['mode.retrig'], drone: !!v['mode.drone'], repeat: !!v['mode.repeat'] },
    paraphonic: false,
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

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const pro1: SynthDef & { version: number } = {
  id: 'pro-1',
  version: 1,
  name: 'Pro-1',
  maker: 'Behringer',
  year: 2019,
  heritage: 'Modelled on the 1981 Sequential Circuits Pro-One',
  summary:
    'Two oscillators and noise feed a mixer, a 24 dB low-pass filter and the amplifier, each with its own ADSR. A switch-based modulation matrix sends the filter envelope, Oscillator B and the LFO to pitch, pulse width and cutoff, directly or under the mod wheel.',
  view: { w: 2156, h: 650 },
  theme: {
    panel: '#1a1a1b',
    panel2: '#101011',
    ink: '#f2f2ee',
    font: 'helv',
    cheeks: 'wood',
    cheekW: 56,
  },
  signalNames: {
    osc1: 'Oscillator A',
    osc2: 'Oscillator B',
    env1: 'the filter envelope',
    env2: 'the amplifier envelope',
    mixer: 'the mixer output (oscillators and noise)',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default pro1;
