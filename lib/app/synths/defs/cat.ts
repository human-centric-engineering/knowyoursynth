/**
 * Behringer CAT: the definition (D1). Positions are pixels on the 2000×801 product image (ref/behringer-cat.jpeg),
 * used directly as view units; the faceplate ends at y 700, below it is the photo's reflection. The data model is
 * ref/behringer-cat.synth.json (Quick Start Guide, 59 numbered controls, with figures from the Octave CAT SRM manual),
 * which follows the Octave CAT SRM II: a duophonic synth whose two VCOs each run several waveforms at once on their own
 * level sliders, one 24 dB low-pass filter, an ADSR and an AR envelope, a delayed LFO, sample and hold, and
 * switch-selected modulation (a source switch and a depth knob, two per VCO and two for the filter).
 *
 * Duophonic playing uses the engine's `duo` keyboard with `note2Osc: 0`: VCO 1 (osc 0) takes the highest key held,
 * VCO 2 the lowest. Sub-octave squares are `mix.sub`, SYNC MODE A is `syncGate` and the S&H is clocked from the LFO
 * (`sh.clock`).
 *
 * Transliterated from the prototype file `src/synths/cat.js` (D3), the way `defs/model-d.ts` was: no content (sounds,
 * lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the "behringer" logo and the printed "CAT
 * electronic music synthesizer"), and panel values read through `num()`.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineParams,
  EngineRoute,
  FaderControl,
  InputJack,
  Jack,
  KnobControl,
  OscParams,
  OutputJack,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type ContRest = Omit<ControlCommon, 'id' | 'x' | 'y'> & Partial<Omit<ContinuousValue, 'kind'>>;
type KnobRest = ContRest & Partial<Pick<KnobControl, 'r' | 'scale'>>;
type FaderRest = ContRest & Partial<Pick<FaderControl, 'ticks'>>;
type SwitchRest = Pick<ControlCommon, 'name' | 'module' | 'help'>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'spacing' | 'brand'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The data model's figures come from the Octave CAT SRM manual; the slider laws between the end points are not
// documented.
const lfoHz = (v: number): number => expMap(v / 10, 0.03, 30); // 0.03 Hz to 30 Hz, as printed
const cutHz = (v: number): number => expMap(v / 10, 16, 20000); // the SRM gives about 5 Hz to 27 kHz; this app's filter stops at 20 kHz
const adsrA = (v: number): number => expMap(v / 10, 0.003, 6);
const adsrDR = (v: number): number => expMap(v / 10, 0.005, 7);
const arA = (v: number): number => expMap(v / 10, 0.003, 7);
const arR = (v: number): number => expMap(v / 10, 0.005, 7);
const glideTime = (v: number): number => (v <= 0 ? 0 : 0.02 * Math.pow(75, v / 10)); // up to about 1.5 s
/** VCO 1 COARSE with the keyboard on: unison with VCO 2 at the centre, about six octaves either way. */
const coarseSemi = (v: number): number => (v - 5) * 14.4;
/** VCO 1 COARSE with KEYBOARD CONTROL off: a free-running frequency, 0.2 Hz to 2 kHz as printed. */
const coarseHz = (v: number): number => expMap(v / 10, 0.2, 2000);
const hzToNote = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
const vco1Fine = (v: number): number => v * 0.2; // about a semitone either way
const vco2Semi = (v: number): number => v * 3; // FINE TUNE: about 2.5 octaves in all
const wave = (v: number): number => (v > 0 ? Math.pow(v / 10, 1.5) * 0.5 : 0);
const fmtOct = (st: number): string => fmtSemi(st);

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#f1f0ea';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 15, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x,
    y: y + size * 0.35,
    text: t,
    size,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const lines = (x: number, y: number, t: string, size = 15, gap = 17, rest: TextRest = {}): void => {
  t.split('\n').forEach((s, i) => text(x, y + i * gap, s, size, rest));
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 1.8): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w });
};
const glyph = (x: number, y: number, shape: WaveShape, size = 12): void => {
  decor.push({ t: 'wave', x, y, size, shape });
};
const frame = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({ t: 'frame', x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: 5, labelAt: 'none' });
};
/** A heading printed with a short rule either side, as the panel does for MODULATION DEPTH and AUDIO LEVEL. */
const ruled = (x: number, y: number, t: string, x0: number, x1: number): void => {
  text(x, y, t, 16);
  line(x0, y, x0 + 18, y);
  line(x1 - 18, y, x1, y);
};
const arrowDown = (x: number, y0: number, y1: number): void => {
  line(x, y0, x, y1 - 4, 1.4);
  decor.push({ t: 'arrow', x, y: y1 - 2, dir: 'down', size: 4 });
};

const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 38,
    style: 'cat',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    scale: { ticks: 11, tickR: 1.3 },
    ...rest,
  });
};
const fader = (id: string, x: number, y: number, cap: string, rest: FaderRest): void => {
  controls.push({
    id,
    type: 'fader',
    x,
    y,
    len: 108,
    orient: 'v',
    cap,
    pad: 12,
    ticks: 7,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
const slide = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string | number,
  rest: SwitchRest
): void => {
  controls.push({
    id,
    type: 'slide',
    x,
    y,
    w: 20,
    h: options.length === 3 ? 56 : 42,
    orient: 'v',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
/** The two source switches of a modulation group, with their printed glyphs and the arrow down to the depth knob. */
const MOD1: ControlOption[] = [
  { v: 'sine', label: 'LFO sine' },
  { v: 'square', label: 'LFO square' },
  { v: 'sh', label: 'S+H' },
];
const mod2Opts = (other: string): ControlOption[] => [
  { v: 'adsr', label: 'ADSR' },
  { v: 'ar', label: 'AR' },
  { v: other, label: other === 'vco1' ? 'VCO 1' : 'VCO 2' },
];
const src1Glyphs = (x: number, y: number): void => {
  glyph(x + 34, y - 27, 'sine', 11);
  glyph(x + 34, y - 1, 'sq', 11);
  text(x + 33, y + 26, 'S+H', 12);
  arrowDown(x, y + 34, y + 60);
};
const src2Glyphs = (x: number, y: number, other: string): void => {
  glyph(x + 34, y - 27, 'adsr', 12);
  glyph(x + 34, y - 1, 'ar', 12);
  text(x + 36, y + 26, other, 12);
  arrowDown(x, y + 34, y + 60);
};
const pct = (v: number): string => `${Math.round(v * 10)} %`;

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[
  [88, 20],
  [740, 20],
  [1392, 20],
  [1910, 20],
  [88, 684],
  [740, 684],
  [1392, 684],
  [1910, 684],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 10 }));
frame(53, 22, 440, 195);
frame(53, 460, 440, 690);
frame(449, 20, 842, 690);
frame(851, 20, 1148, 690);
frame(1157, 20, 1428, 690);
frame(1437, 20, 1572, 120);
frame(1578, 20, 1945, 118);
frame(1437, 122, 1785, 195);
frame(1792, 122, 1945, 195);
frame(1437, 205, 1817, 690);
frame(1825, 205, 1945, 452);
frame(1825, 460, 1945, 690);
decor.push({ t: 'usb', x: 112, y: 127, w: 62, h: 58 });
decor.push({ t: 'din', x: 234, y: 127, r: 44 }, { t: 'din', x: 356, y: 127, r: 44 });
text(112, 62, 'USB', 14);
text(234, 63, 'MIDI IN', 16);
text(356, 63, 'MIDI THRU', 16);
decor.push({
  t: 'logo',
  x: 245,
  y: 300,
  size: 22,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
text(300, 372, 'CAT', 86, { weight: 800, spacing: -2, brand: true });
text(247, 426, 'electronic music synthesizer', 17, { brand: true });

// ── Pitch, glide and LFO rate (bottom left) ───────────────────────────────
fader('pitch.bend', 100, 546, 'red', {
  min: -1,
  max: 1,
  def: 0,
  ticks: 0,
  name: 'Pitch bend',
  module: 'glide',
  fmt: (v) => fmtOct(v * 12),
  help: 'Bends the pitch of both VCOs up or down by as much as an octave. It has a click stop at the centre, which is in tune.',
});
text(125, 497, '+1', 13);
text(140, 551, '0', 13);
line(122, 551, 132, 551, 1.6);
line(148, 551, 158, 551, 1.6);
text(125, 604, '−1', 13);
lines(100, 638, 'PITCH\nBEND', 17);
slide(
  'pitch.octave',
  182,
  551,
  [
    { v: 2, label: '+2' },
    { v: 0, label: '0' },
    { v: -2, label: '−2' },
  ],
  0,
  {
    name: 'Octave shift',
    module: 'glide',
    help: 'Moves everything the keys play up or down two octaves. VCO 1 follows it only while KEYBOARD CONTROL is on POLY or MONO.',
  }
);
text(183, 506, '+2', 13);
text(183, 596, '−2', 13);
lines(182, 638, 'OCTAVE\nSHIFT', 17);
fader('pitch.glide', 264, 546, 'red', {
  name: 'Glide',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each new note slides from the last one instead of jumping. Higher is a slower slide.',
});
text(233, 498, 'MAX', 13);
text(236, 604, 'MIN', 13);
text(264, 638, 'GLIDE', 17);
fader('lfo.rate', 345, 546, 'red', {
  def: 5,
  name: 'LFO frequency',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every half minute to 30 Hz. The same fader clocks the sample and hold and the ADSR repeat. The red lamp beside it flashes at this rate.',
});
text(378, 498, '30Hz', 13);
text(390, 604, '0.03Hz', 13);
lines(345, 638, 'LFO\nFREQ', 17);
decor.push({ t: 'led', x: 413, y: 551, r: 7, color: 'red', litWhen: 'lfo' });

// ── VCO 1 ─────────────────────────────────────────────────────────────────
text(583, 63, 'FREQUENCY', 17);
knob('vco1.fine', 522, 128, {
  min: -5,
  max: 5,
  def: 0,
  name: 'VCO 1 fine',
  module: 'osc',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(vco1Fine(v) * 100)} cents`,
  help: 'Fine tuning of VCO 1, about a semitone either way. A small offset against VCO 2 makes the two beat slowly, which thickens the sound.',
});
text(484, 183, '−', 15);
text(560, 183, '+', 15);
text(525, 193, 'FINE', 13);
knob('vco1.coarse', 640, 128, {
  def: 5,
  name: 'VCO 1 coarse',
  module: 'osc',
  fmt: (v) => fmtSemi(coarseSemi(v)),
  help: 'Tunes VCO 1 over many octaves. At the centre it is in unison with VCO 2; each step of the knob is a little over an octave. With KEYBOARD CONTROL on OFF it sets VCO 1’s frequency on its own, from 0.2 Hz (a slow modulator) to 2 kHz.',
});
text(597, 183, '0.2Hz', 13);
text(645, 193, 'COARSE', 13);
text(695, 183, '2KHz', 13);
lines(768, 63, 'KEYBOARD\nCONTROL', 16);
slide(
  'pitch.kbdCtrl',
  767,
  132,
  [
    { v: 'poly', label: 'POLY' },
    { v: 'off', label: 'OFF' },
    { v: 'mono', label: 'MONO' },
  ],
  'poly',
  {
    name: 'VCO 1 keyboard control',
    module: 'osc',
    help: 'Which key VCO 1 follows. POLY: hold two keys and VCO 1 plays the higher while VCO 2 plays the lower. MONO: both play the lowest key. OFF: VCO 1 ignores the keys and stays where COARSE puts it.',
  }
);
text(786, 106, 'POLY', 13, { anchor: 'start' });
text(786, 132, 'OFF', 13, { anchor: 'start' });
text(786, 158, 'MONO', 13, { anchor: 'start' });

slide('vco1.mod1Src', 522, 258, MOD1, 'sine', {
  name: 'VCO 1 mod source (LFO)',
  module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to VCO 1’s pitch: the LFO sine (vibrato, faded in by LFO DELAY), the LFO square (a trill between two notes) or the sample and hold (random steps).',
});
src1Glyphs(522, 258);
slide('vco1.mod2Src', 645, 258, mod2Opts('vco2'), 'adsr', {
  name: 'VCO 1 mod source (envelope)',
  module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to VCO 1’s pitch: the ADSR or the AR envelope (a pitch sweep on each note), or VCO 2 itself for audio-rate frequency modulation, which gives metallic and bell-like tones.',
});
src2Glyphs(645, 258, 'VCO 2');
slide(
  'vco1.pwmSrc',
  767,
  258,
  [
    { v: 'sine', label: 'LFO sine' },
    { v: 'adsr', label: 'ADSR' },
    { v: 'dc', label: 'DC' },
  ],
  'dc',
  {
    name: 'Pulse width source',
    module: 'mod',
    help: 'What moves VCO 1’s pulse width. DC: nothing, and PULSE WIDTH sets a fixed width. LFO sine: the width sweeps back and forth, a chorus-like shimmer. ADSR: the width follows the envelope on each note.',
  }
);
glyph(801, 231, 'sine', 11);
glyph(801, 257, 'adsr', 12);
text(800, 285, 'DC', 12);
knob('vco1.mod1Depth', 522, 380, {
  name: 'VCO 1 mod depth (LFO)',
  module: 'mod',
  fmt: pct,
  help: 'How far the LFO-group source moves VCO 1’s pitch. Small amounts give vibrato; turned right, sirens and wide trills.',
});
knob('vco1.mod2Depth', 645, 380, {
  name: 'VCO 1 mod depth (envelope)',
  module: 'mod',
  fmt: pct,
  help: 'How far the envelope-group source moves VCO 1’s pitch: an upward sweep on each note from ADSR or AR, or the depth of frequency modulation from VCO 2.',
});
text(768, 315, 'PULSE WIDTH', 16);
knob('vco1.pw', 767, 378, {
  name: 'Pulse width',
  module: 'osc',
  fmt: pct,
  help: 'With the switch above on DC, sets VCO 1’s pulse from a square (fully left, hollow) to a thin pulse (fully right, nasal). With LFO or ADSR selected it sets how far they move the width instead. Only heard through the PULSE slider.',
});
glyph(724, 437, 'sq', 11);
glyph(810, 437, 'npulse', 11);
arrowDown(767, 426, 470);
ruled(585, 444, 'MODULATION DEPTH', 482, 688);
ruled(645, 464, 'AUDIO LEVEL', 532, 758);
fader('vco1.sub', 522, 546, 'white', {
  name: 'VCO 1 sub octave',
  module: 'osc',
  help: 'A square wave an octave below VCO 1, added to its mix. It adds weight and body without changing the note.',
});
fader('vco1.saw', 605, 546, 'white', {
  def: 7,
  name: 'VCO 1 sawtooth',
  module: 'osc',
  help: 'Level of VCO 1’s sawtooth: the brightest, buzziest of its waves, full of harmonics for the filter to work on.',
});
fader('vco1.tri', 686, 546, 'white', {
  name: 'VCO 1 triangle',
  module: 'osc',
  help: 'Level of VCO 1’s triangle: a soft, flute-like wave with few harmonics.',
});
fader('vco1.pulse', 768, 546, 'white', {
  name: 'VCO 1 pulse',
  module: 'osc',
  help: 'Level of VCO 1’s pulse wave, whose width is set by PULSE WIDTH. All four waves play at once, so the sliders are a mixer: blend them to build a tone.',
});
lines(522, 638, 'SUB\nOCTAVE', 17);
glyph(604, 637, 'saw', 12);
glyph(686, 637, 'tri', 12);
glyph(768, 637, 'pulse', 12);
text(647, 677, 'VCO 1', 19);

// ── VCO 2 ─────────────────────────────────────────────────────────────────
knob('vco2.fine', 938, 128, {
  min: -5,
  max: 5,
  def: 0,
  name: 'VCO 2 fine tune',
  module: 'osc',
  fmt: (v) => fmtSemi(vco2Semi(v)),
  help: 'Tunes VCO 2, about an octave and a quarter either way; in unison with VCO 1 at the centre. VCO 2 always plays the lowest key held.',
});
text(900, 183, '−', 15);
text(976, 183, '+', 15);
text(938, 193, 'FINE TUNE', 13);
text(1060, 80, 'SYNC', 17);
slide(
  'vco1.sync',
  1060,
  132,
  [
    { v: 'mode_a', label: 'MODE A' },
    { v: 'off', label: 'OFF' },
    { v: 'mode_b', label: 'MODE B' },
  ],
  'off',
  {
    name: 'Sync',
    module: 'osc',
    help: 'Locks VCO 1 to VCO 2: VCO 1 restarts every VCO 2 cycle, so VCO 1’s tuning changes its tone rather than its note. MODE B is plain hard sync. MODE A also silences VCO 1 for half of every VCO 2 cycle, which is rougher. Tune VCO 1 above VCO 2 or it goes quiet.',
  }
);
text(1079, 106, 'MODE A', 13, { anchor: 'start' });
text(1079, 132, 'OFF', 13, { anchor: 'start' });
text(1079, 158, 'MODE B', 13, { anchor: 'start' });
slide('vco2.mod1Src', 938, 258, MOD1, 'sine', {
  name: 'VCO 2 mod source (LFO)',
  module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to VCO 2’s pitch: the delayed LFO sine, the LFO square or the sample and hold.',
});
src1Glyphs(938, 258);
slide('vco2.mod2Src', 1060, 258, mod2Opts('vco1'), 'adsr', {
  name: 'VCO 2 mod source (envelope)',
  module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to VCO 2’s pitch: the ADSR, the AR, or VCO 1 for audio-rate frequency modulation.',
});
src2Glyphs(1060, 258, 'VCO 1');
knob('vco2.mod1Depth', 938, 380, {
  name: 'VCO 2 mod depth (LFO)',
  module: 'mod',
  fmt: pct,
  help: 'How far the LFO-group source moves VCO 2’s pitch.',
});
knob('vco2.mod2Depth', 1055, 380, {
  name: 'VCO 2 mod depth (envelope)',
  module: 'mod',
  fmt: pct,
  help: 'How far the envelope-group source moves VCO 2’s pitch, or how deep VCO 1 frequency-modulates it.',
});
ruled(1000, 444, 'MODULATION DEPTH', 893, 1106);
ruled(1000, 464, 'AUDIO LEVEL', 920, 1080);
fader('vco2.sub', 918, 546, 'white', {
  name: 'VCO 2 sub octave',
  module: 'osc',
  help: 'A square an octave below VCO 2. With VCO 2 on the lowest key, this is the deepest sound the CAT makes.',
});
fader('vco2.square', 1000, 546, 'white', {
  name: 'VCO 2 square',
  module: 'osc',
  help: 'Level of VCO 2’s square wave: hollow and woody. Its width is fixed.',
});
fader('vco2.saw', 1080, 546, 'white', {
  name: 'VCO 2 sawtooth',
  module: 'osc',
  help: 'Level of VCO 2’s sawtooth: bright and buzzy. Like VCO 1, all its waves play at once and these sliders mix them.',
});
lines(918, 638, 'SUB\nOCTAVE', 17);
glyph(1000, 637, 'sq', 12);
glyph(1080, 637, 'saw', 12);
text(1000, 677, 'VCO 2', 19);

// ── VCF ───────────────────────────────────────────────────────────────────
lines(1232, 63, 'VCO 1\nAUDIO', 16);
controls.push({
  id: 'vcf.vco1Audio',
  type: 'slide',
  x: 1232,
  y: 132,
  w: 20,
  h: 42,
  orient: 'v',
  kind: 'bool',
  def: true,
  labelPos: 'none',
  name: 'VCO 1 audio',
  module: 'mixer',
  help: 'ON: VCO 1’s mix goes into the filter. OFF: VCO 1 keeps running but is not heard, so it can modulate VCO 2 or the filter on its own.',
});
text(1258, 106, 'ON', 13, { anchor: 'start' });
text(1258, 158, 'OFF', 13, { anchor: 'start' });
lines(1354, 46, 'KEYBOARD\nCONTROL', 16);
knob('vcf.kbd', 1352, 128, {
  def: 5,
  name: 'Filter keyboard control',
  module: 'filter',
  fmt: pct,
  help: 'How far the cutoff follows the keys. At MAX it follows them exactly, so every note is equally bright and a whistling filter plays in tune; at OFF high notes sound duller.',
});
text(1310, 183, 'OFF', 13);
text(1400, 183, 'MAX', 13);
slide('vcf.mod1Src', 1232, 258, MOD1, 'sine', {
  name: 'Filter mod source (LFO)',
  module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to the cutoff: the delayed LFO sine (a wah), the LFO square (jumping between two brightnesses) or the sample and hold (random steps).',
});
src1Glyphs(1232, 258);
slide('vcf.mod2Src', 1355, 258, mod2Opts('vco1'), 'adsr', {
  name: 'Filter mod source (envelope)',
  module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to the cutoff: the ADSR or AR envelope, which opens the filter on each note, or VCO 1 at audio rate for a rough, growling edge.',
});
src2Glyphs(1355, 258, 'VCO 1');
knob('vcf.mod1Depth', 1225, 380, {
  name: 'Filter mod depth (LFO)',
  module: 'filter',
  fmt: pct,
  help: 'How far the LFO-group source moves the cutoff.',
});
knob('vcf.mod2Depth', 1350, 380, {
  def: 3,
  name: 'Filter mod depth (envelope)',
  module: 'filter',
  fmt: (v) => `+${(v * 0.6).toFixed(1)} oct`,
  help: 'How far the envelope opens the filter on each note: the usual filter envelope amount. With VCO 1 selected, how deep VCO 1 shakes the cutoff.',
});
ruled(1292, 444, 'MODULATION DEPTH', 1182, 1403);
fader('vcf.fc', 1250, 546, 'red', {
  def: 6,
  name: 'Cutoff (Fc)',
  module: 'filter',
  fmt: (v) => fmtHz(cutHz(v)),
  help: 'Cutoff of the 24 dB low-pass filter. Down, the sound gets darker until only a dull thud is left; fully up, everything passes.',
});
fader('vcf.q', 1332, 546, 'red', {
  name: 'Resonance (Q)',
  module: 'filter',
  fmt: pct,
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near the top the filter whistles on its own and drowns out the oscillators.',
});
text(1250, 640, 'Fc', 18);
text(1332, 640, 'Q', 18);
text(1292, 677, 'VCF', 19);

// ── Transient generators: ADSR, AR, repeat, sample and hold, LFO delay ────
const ADSR_X = { attack: 1504, decay: 1585, sustain: 1667, release: 1748 };
fader('adsr.attack', ADSR_X.attack, 304, 'grey', {
  name: 'ADSR attack',
  module: 'env',
  fmt: (v) => fmtTime(adsrA(v)),
  help: 'How long the ADSR takes to rise when a note starts. Short for plucks and basses, long for swells.',
});
fader('adsr.decay', ADSR_X.decay, 304, 'grey', {
  def: 5,
  name: 'ADSR decay',
  module: 'env',
  fmt: (v) => fmtTime(adsrDR(v)),
  help: 'How long the ADSR takes to fall from its peak to the sustain level.',
});
fader('adsr.sustain', ADSR_X.sustain, 304, 'grey', {
  def: 8,
  name: 'ADSR sustain',
  module: 'env',
  fmt: pct,
  help: 'The level the ADSR holds at while a key is held. With the VCA on ADSR, this is how loud a held note stays.',
});
fader('adsr.release', ADSR_X.release, 304, 'grey', {
  def: 3,
  name: 'ADSR release',
  module: 'env',
  fmt: (v) => fmtTime(adsrDR(v)),
  help: 'How long the ADSR takes to die away after the key is let go.',
});
Object.entries(ADSR_X).forEach(([k, x]) => {
  text(x, 217, k[0].toUpperCase(), 17);
  glyph(x, 392, 'adsr', 13);
});
fader('ar.attack', 1504, 546, 'grey', {
  name: 'AR attack',
  module: 'env',
  fmt: (v) => fmtTime(arA(v)),
  help: 'How long the AR envelope takes to rise when a note starts. It then stays at full level until the key is let go.',
});
fader('ar.release', 1585, 546, 'grey', {
  def: 3,
  name: 'AR release',
  module: 'env',
  fmt: (v) => fmtTime(arR(v)),
  help: 'How long the AR envelope takes to die away after the key is let go.',
});
glyph(1504, 465, 'ar', 13);
glyph(1585, 465, 'ar', 13);
text(1504, 640, 'A', 17);
text(1585, 640, 'R', 17);
slide(
  'trig.repeat',
  1667,
  458,
  [
    { v: 'gated', label: 'GATED' },
    { v: 'off', label: 'OFF' },
    { v: 'auto', label: 'AUTO' },
  ],
  'off',
  {
    name: 'ADSR repeat',
    module: 'mod',
    help: 'Retriggers both envelopes at the LFO rate. GATED: only while a key is held, so a held note pulses. AUTO: all the time, so the CAT plays by itself. OFF: one envelope per note.',
  }
);
text(1686, 433, 'GATED', 13, { anchor: 'start' });
text(1686, 459, 'OFF', 13, { anchor: 'start' });
text(1686, 485, 'AUTO', 13, { anchor: 'start' });
lines(1667, 504, 'ADSR\nREPEAT', 16);
slide(
  'sh.src',
  1667,
  583,
  [
    { v: 'vco1', label: 'VCO 1' },
    { v: 'noise', label: 'NOISE' },
  ],
  'noise',
  {
    name: 'Sample and hold source',
    module: 'mod',
    help: 'What the sample and hold measures on each LFO cycle. NOISE gives random steps. VCO 1 samples VCO 1’s mix of waves: with VCO 1 slow, the steps repeat in a pattern, a short sequence.',
  }
);
text(1686, 558, 'VCO 1', 13, { anchor: 'start' });
text(1686, 611, 'NOISE', 13, { anchor: 'start' });
lines(1667, 630, 'SAMPLE\n+\nHOLD', 15, 14);
fader('lfo.delay', 1748, 546, 'grey', {
  name: 'LFO delay',
  module: 'lfo',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(v / 2)),
  help: 'After each new note the LFO sine is silent and fades in over this time, up to 5 seconds: the delayed vibrato of a singer or violinist. It affects only the sine positions of the modulation switches.',
});
text(1783, 498, '5 SEC.', 13);
text(1770, 604, '0', 13);
lines(1748, 640, 'LFO\nDELAY', 17);
text(1627, 677, 'TRANSIENT GENERATORS', 19);

// ── VCA and noise ─────────────────────────────────────────────────────────
slide(
  'vca.mode',
  1885,
  262,
  [
    { v: 'adsr', label: 'ADSR' },
    { v: 'ar', label: 'AR' },
    { v: 'bypass', label: 'BYPASS' },
  ],
  'adsr',
  {
    name: 'VCA source',
    module: 'amp',
    help: 'What shapes the loudness of each note: the ADSR, the AR envelope, or BYPASS, which holds the VCA open so the CAT sounds all the time.',
  }
);
glyph(1918, 237, 'adsr', 12);
glyph(1918, 262, 'ar', 12);
text(1923, 288, 'BYPASS', 12);
text(1885, 315, 'VOLUME', 17);
knob('out.volume', 1885, 380, {
  def: 7,
  name: 'Volume',
  module: 'out',
  fmt: pct,
  help: 'Overall output level, to MAIN OUT and the headphones.',
});
text(1885, 437, 'VCA', 19);
fader('noise.level', 1885, 546, 'white', {
  name: 'Noise level',
  module: 'mixer',
  help: 'White noise into the filter, alongside the two VCOs: hiss for breath, wind, snares and surf.',
});
lines(1885, 638, 'NOISE\nLEVEL', 17);

// ── Jacks ─────────────────────────────────────────────────────────────────
type JackIn = OmitEach<InputJack, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'dir'>;
type JackOut = OmitEach<OutputJack, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'dir'>;
const jackIn = (id: string, x: number, y: number, label: string, rest: JackIn): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir: 'in', ...rest });
  text(x, y - 30, label, 12);
};
const jackOut = (id: string, x: number, y: number, label: string, rest: JackOut): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir: 'out', ...rest });
  text(x, y - 30, label, 12);
};
text(1502, 32, 'INPUT', 16);
text(1716, 32, 'OUTPUT', 16);
jackIn('j.vco1Cv', 1466, 87, 'VCO1 CV', {
  dest: 'pitchAll',
  amt: 12,
  add: true,
  help: 'Pitch control voltage, added to the notes played: a full-scale voltage moves both VCOs an octave. In this app it reaches the VCOs that follow the keys, so VCO 1 ignores it while KEYBOARD CONTROL is OFF.',
});
jackIn('j.gateIn', 1537, 87, 'GATE', {
  name: 'GATE in',
  dest: 'gateIn',
  amt: 1,
  help: 'An outside gate for both envelopes, in place of the notes played, for example from a sequencer.',
});
jackOut('j.kbCv', 1608, 87, 'KB CV', {
  signal: 'kbd',
  help: 'The keyboard’s pitch as a control voltage: the lowest key held, the one VCO 2 plays.',
});
jackOut('j.gateOut', 1680, 87, 'GATE', {
  name: 'GATE out',
  signal: 'gate',
  help: 'High while a key is held.',
});
jackOut('j.adsrOut', 1752, 87, 'ADSR', {
  name: 'ADSR out',
  signal: 'env1',
  help: 'The ADSR envelope as a voltage.',
});
glyph(1778, 57, 'adsr', 9);
jackOut('j.arOut', 1823, 87, 'AR', {
  name: 'AR out',
  signal: 'env2',
  help: 'The AR envelope as a voltage.',
});
glyph(1843, 57, 'ar', 9);
decor.push({ t: 'led', x: 1895, y: 87, r: 7, color: 'amber', litWhen: 'power' });
text(1895, 57, 'POWER', 12);
jackIn('j.vco2Cv', 1466, 160, 'VCO2 CV', {
  dest: 'pitch2',
  amt: 12,
  add: true,
  help: 'Pitch control voltage for VCO 2 alone, added to its note: a full-scale voltage moves it an octave.',
});
jackIn('j.vcfFc', 1537, 160, 'VCF Fc', {
  dest: 'cutoff',
  amt: 5,
  add: true,
  help: 'Voltage control of the filter cutoff, added to the Fc slider and the modulation.',
});
jackIn('j.vcfQ', 1608, 160, 'VCF Q', {
  dest: 'res',
  amt: 1,
  add: true,
  help: 'Voltage control of resonance, added to the Q slider.',
});
jackIn('j.extAudio', 1680, 160, 'EXT AUDIO', {
  dest: 'extIn',
  amt: 1,
  add: true,
  help: 'Outside audio into the filter, mixed with the VCOs and noise.',
});
jackIn('j.vcaCv', 1752, 160, 'VCA CV', {
  dest: 'amp',
  amt: 1,
  add: true,
  check: (v) =>
    v['vca.mode'] === 'bypass'
      ? 'The VCA is on BYPASS, so it is already fully open and a voltage here makes little difference. Set the VCA switch to ADSR or AR.'
      : null,
  help: 'Voltage control of the VCA, added to the envelope chosen by the VCA switch.',
});
jackOut('j.phones', 1823, 160, 'PHONES', { signal: 'out', help: 'Headphone output.' });
jackOut('j.mainOut', 1895, 160, 'MAIN OUT', { signal: 'out', help: 'The main audio output.' });

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'midi',
    label: 'MIDI and USB',
    module: 'util',
    keywords: 'midi usb thru poly chain',
    rects: [R(40, 0, 445, 455)],
    help: 'The CAT has no keyboard: it is played over MIDI IN or USB, here from the on-screen keyboard. MIDI THRU passes the notes on, which is how several CATs are chained for more voices.',
  },
  {
    id: 'pitch',
    label: 'Pitch bend, octave and glide',
    module: 'glide',
    keywords: 'bend octave transpose portamento glide',
    rects: [R(40, 455, 305, 705)],
    help: 'PITCH BEND bends both VCOs up to an octave either way from a centre click. OCTAVE SHIFT moves the keys two octaves up or down, and GLIDE makes each note slide into the next.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'vibrato wobble trill rate delay delayed vibrato',
    rects: [R(305, 455, 445, 705), R(1712, 410, 1820, 705)],
    help: 'One LFO with a sine and a square, from 0.03 to 30 Hz. There are no LFO depth knobs here: each VCO and the filter picks the sine or square with its own switch and sets the depth with its own knob. LFO DELAY fades the sine in after each note.',
  },
  {
    id: 'vco1',
    label: 'VCO 1',
    module: 'osc',
    keywords:
      'oscillator pitch coarse fine sub octave sawtooth triangle pulse pwm pulse width duophonic keyboard control',
    rects: [R(445, 0, 846, 705)],
    help: 'The first oscillator, with four waves that all play at once: sub octave, sawtooth, triangle and pulse, each on its own slider. COARSE and FINE tune it, KEYBOARD CONTROL decides which key it plays, and the switches and knobs below pick and set its pitch modulation and pulse-width modulation.',
  },
  {
    id: 'vco2',
    label: 'VCO 2 and sync',
    module: 'osc',
    keywords: 'oscillator fine tune sub octave square sawtooth sync hard sync',
    rects: [R(846, 0, 1152, 705)],
    help: 'The second oscillator, always on the lowest key held, with a sub octave, a square and a sawtooth on sliders. FINE TUNE sets its pitch against VCO 1. SYNC locks VCO 1 to VCO 2 for tearing, vocal tones.',
  },
  {
    id: 'vcf',
    label: 'VCF (filter)',
    module: 'filter',
    keywords: 'cutoff resonance brightness low-pass tracking envelope amount self-oscillation wah',
    rects: [R(1152, 0, 1432, 705)],
    help: 'A 24 dB low-pass filter shared by both VCOs and the noise. Fc sets the cutoff and Q the resonance, up to self-oscillation. KEYBOARD CONTROL sets how far the cutoff follows the keys. The two switch-and-knob pairs are its modulation: LFO or sample and hold on the left, an envelope or VCO 1 on the right. VCO 1 AUDIO takes VCO 1 out of the filter.',
  },
  {
    id: 'inputs',
    label: 'Patch inputs',
    module: 'util',
    keywords: 'cv gate input external audio patch',
    rects: [R(1432, 0, 1575, 120), R(1432, 120, 1788, 200)],
    help: 'Control voltage inputs for the pitch of each VCO, the cutoff, the resonance and the VCA, a gate input for the envelopes, and EXT AUDIO to put another sound through the filter.',
  },
  {
    id: 'outputs',
    label: 'Patch outputs and audio out',
    module: 'out',
    keywords: 'cv gate output envelope out headphones main out',
    rects: [R(1575, 0, 1950, 120), R(1788, 120, 1950, 200)],
    help: 'KB CV and GATE send the notes on to other gear; ADSR and AR send the envelopes. PHONES and MAIN OUT are the audio outputs.',
  },
  {
    id: 'adsr',
    label: 'ADSR envelope',
    module: 'env',
    keywords: 'envelope attack decay sustain release contour loudness',
    rects: [R(1432, 200, 1820, 410)],
    help: 'The four-stage envelope. It is not wired to anything by itself: pick it on the VCA switch for loudness, and on a modulation switch to sweep a VCO or the filter.',
  },
  {
    id: 'ar',
    label: 'AR envelope',
    module: 'env',
    keywords: 'envelope attack release organ',
    rects: [R(1432, 410, 1625, 705)],
    help: 'A second, simpler envelope: it rises over A, stays at full level while the key is held and falls over R. Like the ADSR, it can shape the loudness or any of the modulation switches.',
  },
  {
    id: 'repeat',
    label: 'ADSR repeat and sample and hold',
    module: 'mod',
    keywords: 'repeat retrigger clock sample hold random steps sequence',
    rects: [R(1625, 410, 1712, 705)],
    help: 'ADSR REPEAT uses the LFO as a clock to fire both envelopes again and again, while a key is held or all the time. The sample and hold measures noise or VCO 1 once per LFO cycle and holds it, making the stepped S+H source for the modulation switches.',
  },
  {
    id: 'vca',
    label: 'VCA and volume',
    module: 'amp',
    keywords: 'loudness amplifier volume bypass drone',
    rects: [R(1820, 200, 1950, 455)],
    help: 'The switch picks what shapes each note’s loudness: the ADSR, the AR, or BYPASS for a sound that never stops. VOLUME sets the output level.',
  },
  {
    id: 'noise',
    label: 'Noise',
    module: 'mixer',
    keywords: 'white noise hiss breath wind',
    rects: [R(1820, 455, 1950, 705)],
    help: 'White noise, mixed into the filter by NOISE LEVEL. The sample and hold can also use it for random steps.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const MOD1_SIG: Record<string, string> = { sine: 'vib', square: 'lfoSq', sh: 'sh' };
const MOD2_SIG: Record<string, string> = { adsr: 'env1', ar: 'env2', vco1: 'osc1', vco2: 'osc2' };
const semiDepth = (d: number, max: number): number => (d > 0 ? Math.pow(d / 10, 2) * max : 0);

function toEngine(v: ControlValues): EngineParams {
  const kc = v['pitch.kbdCtrl'];
  const sync = v['vco1.sync'];
  const pwSrc = v['vco1.pwmSrc'];
  const routes: EngineRoute[] = [];
  const add = (src: string, dst: string, amt: number): void => {
    if (amt) routes.push({ src, dst, amt });
  };
  // pitch modulation: the LFO group up to two octaves, the envelope group (or the other VCO) up to three
  add(MOD1_SIG[String(v['vco1.mod1Src'])], 'pitch1', semiDepth(num(v, 'vco1.mod1Depth'), 24));
  add(MOD2_SIG[String(v['vco1.mod2Src'])], 'pitch1', semiDepth(num(v, 'vco1.mod2Depth'), 36));
  add(MOD1_SIG[String(v['vco2.mod1Src'])], 'pitch2', semiDepth(num(v, 'vco2.mod1Depth'), 24));
  add(MOD2_SIG[String(v['vco2.mod2Src'])], 'pitch2', semiDepth(num(v, 'vco2.mod2Depth'), 36));
  // filter: the LFO group up to three octaves; an envelope through envAmt, VCO 1 as a route
  add(MOD1_SIG[String(v['vcf.mod1Src'])], 'cutoff', (num(v, 'vcf.mod1Depth') / 10) * 3);
  const fEnv = v['vcf.mod2Src'] !== 'vco1';
  if (!fEnv) add('osc1', 'cutoff', (num(v, 'vcf.mod2Depth') / 10) * 3);
  // pulse width: a fixed width at DC, otherwise PULSE WIDTH is the depth of the sine or the ADSR
  const pwK = num(v, 'vco1.pw') / 10;
  if (pwSrc === 'sine') add('vib', 'pw1', pwK * 0.42);
  if (pwSrc === 'adsr') add('env1', 'pw1', -pwK * 0.45);
  const kbdOff = kc === 'off';
  const osc: OscParams[] = [
    {
      level: v['vcf.vco1Audio'] ? 1 : 0,
      mix: {
        sub: wave(num(v, 'vco1.sub')),
        saw: wave(num(v, 'vco1.saw')),
        tri: wave(num(v, 'vco1.tri')),
        pulse: wave(num(v, 'vco1.pulse')),
      },
      pw: pwSrc === 'dc' ? 0.5 - pwK * 0.45 : 0.5,
      semi: (kbdOff ? 0 : coarseSemi(num(v, 'vco1.coarse'))) + vco1Fine(num(v, 'vco1.fine')),
      kbd: !kbdOff,
      fixedNote: hzToNote(coarseHz(num(v, 'vco1.coarse'))),
      syncTo: sync === 'off' ? -1 : 1,
      syncGate: sync === 'mode_a',
    },
    {
      level: 1,
      mix: {
        sub: wave(num(v, 'vco2.sub')),
        pulse: wave(num(v, 'vco2.square')),
        saw: wave(num(v, 'vco2.saw')),
      },
      pw: 0.5,
      semi: vco2Semi(num(v, 'vco2.fine')),
      kbd: true,
      fixedNote: 60,
      syncTo: -1,
    },
  ];
  const vm = v['vca.mode'];
  const rep = v['trig.repeat'];
  const rate = lfoHz(num(v, 'lfo.rate'));
  return {
    osc,
    duo: true,
    paraphonic: kc === 'poly',
    note2Osc: 0,
    noise: { level: level10(num(v, 'noise.level'), 0.6), color: 'white' },
    ext: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutHz(num(v, 'vcf.fc')),
      res: (num(v, 'vcf.q') / 10) * 1.1,
      envAmt: fEnv ? num(v, 'vcf.mod2Depth') * 0.6 : 0,
      envSrc: v['vcf.mod2Src'] === 'ar' ? 'env2' : 'env1',
      kbd: num(v, 'vcf.kbd') / 10,
    },
    env1: {
      a: adsrA(num(v, 'adsr.attack')),
      d: adsrDR(num(v, 'adsr.decay')),
      s: num(v, 'adsr.sustain') / 10,
      r: adsrDR(num(v, 'adsr.release')),
    },
    env2: { a: arA(num(v, 'ar.attack')), d: 0.01, s: 1, r: arR(num(v, 'ar.release')) },
    vca:
      vm === 'bypass'
        ? { envSrc: 'none', bias: 1 }
        : { envSrc: vm === 'ar' ? 'env2' : 'env1', bias: 0 },
    lfo: { rate, mix: { sq: 1 }, keySync: false, vibDelay: num(v, 'lfo.delay') / 2, vibDepth: 1 },
    glide: { time: glideTime(num(v, 'pitch.glide')), legato: false },
    trig: {
      retrig: false,
      drone: false,
      repeat: rep === 'gated',
      auto: rep === 'auto',
      src: ['gate', 'gate'],
    },
    routes,
    normals: { gateIn: 'gate', shIn: v['sh.src'] === 'vco1' ? 'osc1' : 'noise' },
    od: { on: false },
    delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: num(v, 'pitch.octave') * 12 + num(v, 'pitch.bend') * 12,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const cat: SynthDef & { version: number } = {
  id: 'cat',
  version: 1,
  name: 'CAT',
  maker: 'Behringer',
  year: 2021,
  heritage: 'Based on the Octave CAT SRM II, from New York in the early 1980s',
  summary:
    'A duophonic synth: two VCOs, each with several waveforms on their own level sliders, into one 24 dB low-pass filter and a VCA. Hold two keys and VCO 1 plays the higher, VCO 2 the lower. An ADSR and an AR envelope, a delayed LFO, sample and hold, and switch-selected modulation for each VCO and the filter.',
  view: { w: 2000, h: 700 },
  theme: {
    panel: '#1f2022',
    panel2: '#151617',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: 40,
    jack: 'black',
  },
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    env1: 'the ADSR',
    env2: 'the AR envelope',
    vib: 'the LFO sine (after LFO DELAY)',
    lfoSq: 'the LFO square',
    sh: 'the sample and hold',
    kbd: 'the keyboard CV',
    noise: 'the noise generator',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default cat;
