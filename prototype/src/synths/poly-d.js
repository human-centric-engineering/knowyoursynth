// Behringer Poly D — SynthDef. Positions are pixels on the 3000×1694 product photo (ref/behringer-poly-d.jpg), written in
// photo space and moved into the view by X()/Y() (the main panel) and LX()/LY() (the small panel to the left of the keys).
// The data model is ref/behringer-poly-d.synth.json (Quick Start Guide, 57 numbered controls and 15 sequencer controls).
//
// The view is the main panel with the small panel from the left of the keyboard stood beside it: LFO RATE and its wave
// switch, the GLIDE on/off switch and TRANSPOSE live there on the hardware, and the voice cannot be understood without
// them. The wheels are drawn for reference only; the mod wheel beside the app's keyboard is the one that works (and on the
// Poly D it is the only modulation depth control).
//
// Engine notes: four oscillators, each able to play a note of its own (`oscAssign`, added for this synth) for MONO / UNI /
// POLY and AUTO DAMP. Distortion sits after the VCA (`normals`), then a stereo bucket-brigade chorus (`chorus`, added for
// this synth). The arpeggiator is the engine's own, so the voice runs as a one-voice `poly` synth.
import { annotate, clamp, expMap, pwl, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/poly-d.js';
import lineage from '@/synths/lineage/poly-d.js';
import unusual from '@/synths/unusual/poly-d.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// Contour times as printed (10 M-SEC · 200 · 600 · 1 SEC · 5 · 10); the guide gives 1 ms to 10 s attack, 4 ms up decay.
const ATT_PTS = [[0, 0.001], [2, 0.2], [4, 0.6], [6, 1], [8, 5], [10, 10]];
const DEC_PTS = [[0, 0.004], [2, 0.2], [4, 0.6], [6, 1], [8, 5], [10, 10]];
const attTime = (v) => pwl(v, ATT_PTS, true);
const decTime = (v) => pwl(v, DEC_PTS, true);
const ENV_SCALE = {
  ticks: 11, size: 9,
  labels: [
    { at: 0, text: '10' }, { at: 2, text: '200' }, { at: 4, text: '600' },
    { at: 6, text: '1' }, { at: 8, text: '5' }, { at: 10, text: '10' },
  ],
};
const S10 = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 10 };
const cutoffHz = (v) => expMap((v + 5) / 10, 20, 20000);
const lfoHz = (v) => expMap(v / 10, 0.05, 200); // the guide's 0.05 to 200 Hz
const glideTime = (v) => Math.pow(v / 10, 2) * 2;
const tempoBpm = (v) => Math.round(expMap(v / 10, 40, 240));

const RANGES = [
  { v: 'lo', label: 'LO', a: -100 }, { v: '32', label: "32'", a: -60 }, { v: '16', label: "16'", a: -20 },
  { v: '8', label: "8'", a: 20 }, { v: '4', label: "4'", a: 60 }, { v: '2', label: "2'", a: 100 },
];
const RANGE_SEMI = { lo: -72, 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };
const waveShapes = (n) => ['tri', n === 4 ? 'rsaw' : 'shark', 'saw', 'sq', 'pulse', 'npulse'];
const WAVE_V = (n) => ['tri', n === 4 ? 'rsaw' : 'shark', 'saw', 'sq', 'wide', 'narrow'];
const WAVE_MIX = {
  tri: { mix: { tri: 1 }, pw: 0.5 }, shark: { mix: { shark: 1 }, pw: 0.5 }, rsaw: { mix: { rsaw: 1 }, pw: 0.5 },
  saw: { mix: { saw: 1 }, pw: 0.5 }, sq: { mix: { pulse: 1 }, pw: 0.5 },
  wide: { mix: { pulse: 1 }, pw: 0.3 }, narrow: { mix: { pulse: 1 }, pw: 0.14 },
};
const TRANSPOSE = { up: 12, norm: 0, down: -12 };
// The guide lists the eight arpeggio orders only in passing; this is how this app plays them.
const ARP_ORDERS = [
  { v: 'up', label: 'UP', mode: 'up', oct: 1 }, { v: 'down', label: 'DOWN', mode: 'down', oct: 1 },
  { v: 'updown', label: 'UP/DOWN', mode: 'updown', oct: 1 }, { v: 'random', label: 'RANDOM', mode: 'random', oct: 1 },
  { v: 'up2', label: 'UP 2 OCT', mode: 'up', oct: 2 }, { v: 'down2', label: 'DOWN 2 OCT', mode: 'down', oct: 2 },
  { v: 'updown2', label: 'UP/DOWN 2 OCT', mode: 'updown', oct: 2 }, { v: 'played', label: 'AS PLAYED', mode: 'played', oct: 1 },
];

// ── Photo → view ──────────────────────────────────────────────────────────
// Main panel: photo x 112…2890, y 25…830 (× 2/3). Left of it, a 280-wide plate for the keyboard-side controls, a wood strip.
const X = (x) => Math.round(x * (2 / 3) + 271);
const Y = (y) => Math.round(y * (2 / 3) - 15);
const LX = (x) => Math.round(x * (2 / 3) - 33);
const LY = (y) => Math.round((y - 1060) * (2 / 3) + 50);

const controls = [];
const decor = [];
const jacks = [];
const knob = (id, x, y, r, style, rest) => controls.push({ id, type: 'knob', x, y, r, style, labelSize: 12, ...rest });
const rocker = (id, x, y, color, rest) => controls.push({ id, type: 'rocker', x, y, w: 60, h: 26, color, labelPos: 'none', ...rest });
// Silkscreen text centred on a photo point (the renderer's y is the baseline).
const text = (x, y, t, size = 10, rest = {}) => decor.push({ t: 'text', x, y: Math.round(y + size * 0.35), text: t, size, anchor: 'middle', ...rest });
const T = (px, py, t, size, rest) => text(X(px), Y(py), t, size, rest);
const LT = (px, py, t, size, rest) => text(LX(px), LY(py), t, size, rest);
const line = (x1, y1, x2, y2, w = 1.6) => decor.push({ t: 'line', x1, y1, x2, y2, w });
const INK = '#ecebe6';
const PANEL = '#1b1c1e';
// The white-on-black plates the panel uses for a button's SHIFT function.
const plate = (px, py, t) => {
  const w = t.length * 5.6 + 8;
  decor.push({ t: 'rect', x: X(px) - w / 2, y: Y(py) - 6, w, h: 12, r: 2, fill: INK });
  T(px, py, t, 8.5, { fill: PANEL, weight: 700 });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
// The wood strip between the keyboard-side plate and the main panel, and the section lines.
decor.push({ t: 'rect', x: 320, y: -2, w: 26, h: 544, fill: 'url(#kysWood)', hw: true });
line(X(427), Y(40), X(427), Y(800));
line(X(1042), Y(40), X(1042), Y(800));
line(X(1623), Y(40), X(1623), Y(800));
line(X(2150), Y(40), X(2150), Y(617));
line(X(1672), Y(441), X(2150), Y(441));
line(X(1623), Y(617), X(2150), Y(617));
line(X(2737), Y(40), X(2737), Y(800));
line(X(2150), Y(267), X(2737), Y(267));
line(X(2150), Y(443), X(2737), Y(443));
line(X(2812), Y(405), X(2812), Y(465));
const section = (px, t) => T(px, 812, t, 24, { weight: 500 });
section(255, 'CONTROLLERS');
section(735, 'OSCILLATOR BANK');
section(1330, 'MIXER');
section(2183, 'SEQUENCER');
section(2812, 'OUTPUT');
text(180, Y(812), 'KEYBOARD', 24, { weight: 500 });
T(1920, 428, 'FILTER', 16);
T(1920, 606, 'LOUDNESS CONTOUR', 16);
T(2382, 252, 'DISTORTION', 17);
T(2383, 427, 'CHORUS', 17);
T(1260, 86, 'POLY', 27, { weight: 700 });
decor.push({ t: 'logo', x: X(1402), y: Y(84), size: 50, style: 'outline-d' });

// ── Keyboard-side plate: LFO, glide switch, transpose, wheels ──────────────
knob('lfo.rate', LX(185), LY(1165), 21, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 4.5, label: 'LFO RATE', labelPos: 'top', module: 'lfo', scale: S10, fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 20 seconds up to 200 Hz. The lamp beside it flashes at the rate.',
});
decor.push({ t: 'led', x: LX(265), y: LY(1106), r: 4, color: 'red', litWhen: 'lfo' });
controls.push({
  id: 'lfo.shape', type: 'rocker', color: 'black', x: LX(345), y: LY(1106), w: 60, h: 26, kind: 'enum', module: 'lfo', labelPos: 'none',
  options: [{ v: 'tri', label: 'Triangle' }, { v: 'sq', label: 'Square' }], def: 'tri', label: 'LFO wave shape',
  help: 'LFO shape. Triangle gives a smooth wobble (vibrato); square jumps between two values (trills).',
});
decor.push({ t: 'wave', x: LX(305), y: LY(1140), size: 9, shape: 'tri' }, { t: 'wave', x: LX(383), y: LY(1140), size: 9, shape: 'sq' });
rocker('glide.on', LX(345), LY(1215), 'white', {
  kind: 'bool', def: false, module: 'glide', label: 'GLIDE', labelPos: 'top', labelSize: 11,
  help: 'Switches glide on or off. The GLIDE knob in the CONTROLLERS section sets how long the slide takes.',
});
LT(383, 1253, 'ON', 8.5);
controls.push({
  id: 'kbd.transpose', type: 'rocker', color: 'white', orient: 'v', x: LX(455), y: LY(1160), w: 26, h: 58, kind: 'enum', module: 'util',
  options: [{ v: 'up', label: 'UP' }, { v: 'norm', label: 'NORM' }, { v: 'down', label: 'DOWN' }], def: 'norm',
  label: 'TRANSPOSE', labelPos: 'none',
  help: 'Moves the whole keyboard up or down an octave.',
});
LT(455, 1087, 'TRANSPOSE', 11);
LT(455, 1104, 'UP', 8.5);
LT(493, 1160, 'NORM', 8.5, { anchor: 'start' });
LT(455, 1217, 'DOWN', 8.5);
// The wheels, for reference (hardware view only).
[[240, 'PITCH'], [385, 'MOD']].forEach(([px, name]) => {
  decor.push(
    { t: 'rect', x: LX(px) - 26, y: LY(1305), w: 52, h: 180, r: 4, fill: '#060607', stroke: '#2a2b2e', sw: 1.5, hw: true },
    { t: 'rect', x: LX(px) - 19, y: LY(1312), w: 38, h: 166, r: 10, fill: '#d6d7d3', hw: true },
    { t: 'rect', x: LX(px) - 19, y: LY(1312), w: 38, h: 166, r: 10, fill: 'url(#kysPatStripes)', hw: true },
  );
  LT(px, 1593, name, 10);
});

// ── Controllers ───────────────────────────────────────────────────────────
knob('ctl.tune', X(250), Y(257), 32, 'd-silver', {
  kind: 'cont', min: -2.5, max: 2.5, def: 0, label: 'TUNE', labelPos: 'top', module: 'osc',
  scale: { nums: [-2, -1, 1, 2], ticks: 11, size: 10 }, fmt: fmtSemi,
  help: 'Master tuning for all four oscillators, about two semitones either way. With OSC 4 CONTROL off, Oscillator 4 ignores it.',
});
rocker('mod.toOsc', X(430), Y(264), 'white', {
  kind: 'bool', def: false, module: 'mod', label: 'OSCILLATOR\nMODULATION', labelPos: 'top', labelSize: 10,
  help: 'Sends the modulation mix to the pitch of the oscillators: vibrato from the LFO, pitch sweeps from the filter contour, or growl from OSC 4. How much is set by the mod wheel.',
});
T(466, 302, 'ON', 8.5);
controls.push({
  id: 'voice.mode', type: 'rocker', color: 'green', x: X(193), y: Y(395), w: 60, h: 25, kind: 'enum', module: 'mode',
  options: [{ v: 'mono', label: 'MONO' }, { v: 'uni', label: 'UNI' }, { v: 'poly', label: 'POLY' }], def: 'poly',
  label: 'MODE', labelPos: 'top', labelSize: 11,
  help: 'How notes are shared among the four oscillators. MONO: every oscillator plays the one note. UNI: the oscillators are shared among the keys you hold, all four on one key. POLY: each key gets an oscillator of its own, up to four.',
});
T(143, 428, 'MONO', 8.5);
T(190, 428, 'UNI', 8.5);
T(237, 428, 'POLY', 8.5);
rocker('voice.damp', X(345), Y(395), 'green', {
  kind: 'bool', def: false, module: 'mode', label: 'AUTO DAMP', labelPos: 'top', labelSize: 11,
  help: 'In POLY, what happens to a note you let go while other keys are still held. Off: it keeps sounding until you let go of everything or play a new note. On: it stops at once and only the held keys go on.',
});
T(382, 432, 'ON', 8.5);
knob('ctl.glide', X(180), Y(525), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 3, label: 'GLIDE', labelPos: 'top', module: 'glide', scale: S10,
  fmt: (v) => (v === 0 ? 'none' : fmtTime(glideTime(v))),
  help: 'How long the pitch takes to slide from one note to the next. It only works with the GLIDE switch beside the keyboard on.',
});
knob('mod.mix', X(330), Y(525), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 10, label: 'MODULATION MIX', labelPos: 'top', module: 'mod', scale: S10,
  help: 'Crossfades the two modulation sources. Fully left is the left switch’s source (OSC 4 or the filter contour); fully right is the right switch’s source (noise or the LFO).',
});
T(296, 603, 'OSC 4/\nFILTER EG', 8);
T(384, 603, 'NOISE/\nLFO', 8);
controls.push({
  id: 'mod.srcA', type: 'rocker', color: 'black', x: X(190), y: Y(703), w: 60, h: 26, kind: 'enum', module: 'mod', labelPos: 'none',
  options: [{ v: 'osc4', label: 'OSC 4' }, { v: 'eg', label: 'FILTER EG' }], def: 'osc4', label: 'OSC 4 / FILTER EG',
  help: 'First modulation source: Oscillator 4 (a second LFO when set to LO, or clangy FM at audio rate) or the filter contour.',
}, {
  id: 'mod.srcB', type: 'rocker', color: 'black', x: X(345), y: Y(703), w: 60, h: 26, kind: 'enum', module: 'mod', labelPos: 'none',
  options: [{ v: 'noise', label: 'NOISE' }, { v: 'lfo', label: 'LFO' }], def: 'lfo', label: 'NOISE / LFO',
  help: 'Second modulation source: noise (a random wobble) or the LFO.',
});
T(148, 735, 'OSC 4', 8);
T(227, 735, 'FILTER EG', 8);
T(312, 735, 'NOISE\n(MOD SRC)', 8);
T(383, 735, 'LFO', 8);
controls.push({
  id: 'osc4.kbd', type: 'rocker', color: 'white', orient: 'v', x: X(462), y: Y(705), w: 26, h: 58, kind: 'bool', def: true, module: 'osc',
  label: 'OSC 4\nCONTROL', labelPos: 'top', labelSize: 10,
  help: 'On: Oscillator 4 follows the keyboard like the others. Off: it runs at a fixed pitch and ignores the keys, the wheels and TUNE, which is what you want when it is a modulator.',
});

// ── Oscillator bank ───────────────────────────────────────────────────────
const OSC_Y = [170, 345, 520, 698];
const LED_Y = [100, 276, 452, 628];
T(585, 88, 'RANGE', 11);
T(765, 88, 'OSCILLATOR-1\nFREQUENCY', 11);
T(950, 88, 'WAVEFORM', 11);
[2, 3, 4].forEach((n) => T(765, [264, 440, 617][n - 2], `OSCILLATOR-${n}`, 11));
[1, 2, 3, 4].forEach((n) => {
  const y = Y(OSC_Y[n - 1]);
  knob(`osc${n}.range`, X(578), y, 26, 'd-chicken', {
    kind: 'enum', options: RANGES, def: '8', label: `Osc ${n} range`, labelPos: 'none', module: 'osc',
    scale: { size: 9 },
    help: 'Octave of the oscillator in organ-pipe feet: 32’ is lowest, 2’ highest. LO drops it below hearing so it clicks, or acts as an LFO.',
  });
  decor.push({ t: 'led', x: X(642), y: Y(LED_Y[n - 1]), r: 4, color: 'red', litWhen: { osc: n - 1 } });
  const shapes = waveShapes(n);
  knob(`osc${n}.wave`, X(945), y, 26, 'd-chicken', {
    kind: 'enum', options: WAVE_V(n).map((v, i) => ({ v, label: '', a: -100 + i * 40 })), def: 'saw', label: `Osc ${n} waveform`, labelPos: 'none', module: 'osc',
    help: n === 4
      ? 'Raw tone of Oscillator 4. The second position is a reverse sawtooth, there for when it is used as a modulator: a ramp that falls instead of rising.'
      : 'Raw tone of the oscillator. Triangle is soft, sawtooth bright and brassy, square hollow, and the two pulses thinner and more nasal.',
  });
  shapes.forEach((shape, i) => {
    const a = ((-100 + i * 40) * Math.PI) / 180;
    decor.push({ t: 'wave', x: X(945) + Math.sin(a) * 47, y: y - Math.cos(a) * 44, size: 8, shape });
  });
  if (n > 1) {
    knob(`osc${n}.freq`, X(760), y, 31, 'd-silver', {
      kind: 'cont', min: -7.5, max: 7.5, def: 0, label: `Osc ${n} frequency`, labelPos: 'none', module: 'osc',
      scale: { nums: [-7, -5, -3, -1, 1, 3, 5, 7], ticks: 15, size: 9 }, fmt: fmtSemi,
      help: n === 4
        ? 'Tunes Oscillator 4 against Oscillator 1, up to a fifth either way. With OSC 4 CONTROL off it sets Oscillator 4’s fixed pitch instead, over a much wider range.'
        : `Tunes Oscillator ${n} against Oscillator 1, up to a fifth either way. A hair off zero makes the two beat and sound thicker; a whole number of semitones gives an interval.`,
    });
  }
});

// ── Mixer ─────────────────────────────────────────────────────────────────
const VOL_Y = [165, 345, 520, 705];
const ON_Y = [177, 353, 528, 704];
[1, 2, 3, 4].forEach((n) => {
  knob(`mix.osc${n}`, X(1115), Y(VOL_Y[n - 1]), 24, 'd-silver', {
    kind: 'cont', min: 0, max: 10, def: 6, label: 'VOLUME', labelPos: 'top', labelSize: 11, module: 'mixer', scale: S10,
    help: `Level of Oscillator ${n} going into the filter. High levels from several oscillators drive the filter harder and thicken the tone.`,
  });
  rocker(`mix.osc${n}On`, X(1262), Y(ON_Y[n - 1]), 'orange', {
    kind: 'bool', def: true, module: 'mixer', label: `Osc ${n} on`,
    help: `Connects Oscillator ${n} to the mixer. In POLY every key is given an oscillator, so a key that lands on a switched-off oscillator plays nothing.`,
  });
  line(X(1170), Y(ON_Y[n - 1]), X(1215), Y(ON_Y[n - 1]), 1.3);
  T(1298, ON_Y[n - 1] + 37, 'ON', 8.5);
});
rocker('mix.extOn', X(1262), Y(265), 'orange', {
  kind: 'bool', def: false, module: 'mixer', label: 'External input on',
  help: 'Connects the external input. Nothing can be plugged in here in this app, so with this on the channel feeds the synth’s own output back into the mixer, a built-in overdrive.',
});
rocker('mix.noiseOn', X(1262), Y(616), 'orange', {
  kind: 'bool', def: false, module: 'mixer', label: 'Noise on', help: 'Connects the noise generator to the mixer.',
});
T(1298, 302, 'ON', 8.5);
T(1298, 653, 'ON', 8.5);
line(X(1308), Y(265), X(1345), Y(265), 1.3);
line(X(1308), Y(616), X(1345), Y(616), 1.3);
knob('mix.ext', X(1402), Y(265), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'EXT IN\nVOLUME', labelPos: 'top', labelSize: 11, module: 'mixer', scale: S10,
  help: 'Level of the external input. In this app it sets how much of the synth’s own output is fed back into the mixer: a little thickens the sound, a lot distorts it.',
});
knob('mix.noise', X(1400), Y(617), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'NOISE\nVOLUME', labelPos: 'top', labelSize: 11, module: 'mixer', scale: S10,
  help: 'Level of noise into the filter. A little adds breath and grit; on its own it makes wind, surf and percussion.',
});
T(1513, 246, 'OVERLOAD', 10);
decor.push({ t: 'led', x: X(1514), y: Y(268), r: 4, color: 'red', litWhen: 'overload' });
controls.push({
  id: 'noise.colour', type: 'rocker', color: 'orange', orient: 'v', x: X(1513), y: Y(617), w: 26, h: 58, kind: 'enum', module: 'mixer',
  options: [{ v: 'white', label: 'WHITE' }, { v: 'pink', label: 'PINK' }], def: 'white', label: 'Noise colour', labelPos: 'none',
  help: 'White noise is bright and hissy. Pink noise has less top end and sounds deeper, more like wind or surf.',
});
T(1513, 552, 'WHITE', 8.5);
T(1513, 684, 'PINK', 8.5);

// ── Filter switches (the column between the mixer and the filter) ─────────
const col = { w: 52, h: 19 };
rocker('filter.mode', X(1623), Y(177), 'teal', { ...col,
  kind: 'enum', options: [{ v: 'lp', label: 'LO' }, { v: 'hp', label: 'HI' }], def: 'lp', module: 'filter', label: 'Filter mode',
  help: 'LO is the usual low-pass: it takes brightness away above the cutoff. HI is high-pass: it takes bass away below the cutoff, for thin, reedy tones.',
});
rocker('mod.toFilter', X(1623), Y(265), 'teal', { ...col,
  kind: 'bool', def: false, module: 'mod', label: 'Filter modulation',
  help: 'Sends the modulation mix to the filter cutoff: wah-style sweeps from the LFO, or a rasp from OSC 4 at audio rate. How much is set by the mod wheel.',
});
rocker('filter.kbd1', X(1623), Y(353), 'teal', { ...col,
  kind: 'bool', def: false, module: 'filter', label: 'Keyboard control 1',
  help: 'Adds one third keyboard tracking: higher notes open the filter a little so they do not sound duller than low ones.',
});
rocker('filter.kbd2', X(1623), Y(441), 'teal', { ...col,
  kind: 'bool', def: false, module: 'filter', label: 'Keyboard control 2',
  help: 'Adds two thirds keyboard tracking. Switch both on for full tracking, where the cutoff follows the notes exactly.',
});
rocker('env.decay', X(1623), Y(529), 'white', { ...col,
  kind: 'bool', def: true, module: 'env', label: 'Decay',
  help: 'On: after you let go, the note fades (and the filter closes) over the DECAY times. Off: the note stops dead.',
});
T(1623, 140, 'FILTER MODE', 9);
T(1588, 212, 'LO', 8);
T(1658, 212, 'HI', 8);
T(1623, 212, 'FILTER\nMODULATION', 8.5);
T(1658, 300, 'ON', 8);
T(1658, 320, 'ON', 8);
T(1571, 353, '1', 9);
T(1623, 382, 'KEYBOARD\nCONTROL', 8.5);
T(1571, 441, '2', 9);
T(1658, 476, 'ON', 8);
T(1623, 495, 'DECAY', 9);
T(1658, 564, 'ON', 8);

// ── Filter and contours ───────────────────────────────────────────────────
knob('filter.cutoff', X(1770), Y(170), 24, 'd-silver', {
  kind: 'cont', min: -5, max: 5, def: 1, label: 'CUTOFF\nFREQUENCY', labelPos: 'top', labelSize: 11, module: 'filter',
  scale: { nums: [-4, -2, 2, 4], ticks: 11, size: 10 }, fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter starts cutting. Turn it left and the sound gets duller until only a thud is left; turn it right and the full buzz of the oscillators comes through.',
});
knob('filter.emphasis', X(1927), Y(170), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'EMPHASIS', labelPos: 'top', labelSize: 11, module: 'filter', scale: S10,
  help: 'Resonance: boosts a narrow band right at the cutoff so sweeps sound vocal and squelchy. Near the top the filter whistles on its own.',
});
knob('filter.contour', X(2085), Y(170), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'AMOUNT\nOF CONTOUR', labelPos: 'top', labelSize: 11, module: 'filter', scale: S10,
  help: 'How far the filter contour pushes the cutoff above where the knob leaves it, each time the contour starts.',
});
const envKnob = (id, px, py, label, isTime, help, def, module) =>
  knob(id, X(px), Y(py), 24, 'd-silver', {
    kind: 'cont', min: 0, max: 10, def, label, labelPos: 'top', labelSize: 11, module,
    scale: isTime ? ENV_SCALE : S10, fmt: isTime ? (v) => fmtTime(id.endsWith('attack') ? attTime(v) : decTime(v)) : undefined, help,
  });
envKnob('fenv.attack', 1772, 347, 'ATTACK', true, 'How long the filter takes to open after a key is pressed. Short for plucks and basses, long for slow brassy swells.', 0, 'env');
envKnob('fenv.decay', 1927, 347, 'DECAY', true, 'How long the filter takes to fall from its peak to the sustain level, and with DECAY on, how long it takes to close after you let go.', 4, 'env');
envKnob('fenv.sustain', 2086, 347, 'SUSTAIN', false, 'Where the filter settles while keys are held, as a share of AMOUNT OF CONTOUR.', 4, 'env');
envKnob('aenv.attack', 1772, 527, 'ATTACK', true, 'How quickly the sound reaches full volume. Near zero it starts at once; higher values fade it in.', 0, 'amp');
envKnob('aenv.decay', 1927, 527, 'DECAY', true, 'How long the volume takes to fall to the sustain level, and with DECAY on, how long the sound rings after you let go.', 3.5, 'amp');
envKnob('aenv.sustain', 2086, 527, 'SUSTAIN', false, 'Volume while keys are held. At 10 the sound holds at full level; at 0 it dies away even if you keep holding.', 10, 'amp');
[[1772, 347], [1927, 347], [1772, 527], [1927, 527]].forEach(([x, y]) => {
  T(x - 45, y + 64, 'M-SEC', 7.5);
  T(x + 24, y + 64, 'SEC', 7.5);
});

// ── Distortion and chorus ─────────────────────────────────────────────────
const fxKnob = (id, px, label, def, help) => knob(id, X(px), Y(170), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def, label, labelPos: 'top', labelSize: 11, module: 'fx', scale: S10, help,
});
fxKnob('fx.dist', 2240, 'DIST', 3, 'How hard the distortion is driven. Low settings warm and thicken the sound; high settings turn it into a buzzing, compressed fuzz.');
fxKnob('fx.tone', 2385, 'TONE', 5, 'Brightness of the distortion. Left is darker and smoother, right is brighter and harsher.');
fxKnob('fx.level', 2550, 'LEVEL', 5, 'Output level of the distortion, so it can be matched to the sound with the distortion switched off.');
rocker('fx.distOn', X(2673), Y(182), 'orange', {
  kind: 'bool', def: false, module: 'fx', label: 'Distortion on', help: 'Switches the distortion in or out.',
});
T(2710, 219, 'ON', 8.5);
[['fx.chorus1', 2308, 'I', 'Chorus I: a slow, gentle sweep. The sound widens and shimmers across the two outputs.'],
  ['fx.chorus2', 2462, 'II', 'Chorus II: a faster, deeper sweep. Press I and II together for a quick, shallow vibrato-like shimmer.']].forEach(([id, px, name, help]) => {
  controls.push({
    id, type: 'button', lamp: 'amber', x: X(px), y: Y(356), w: 46, h: 45, kind: 'bool', def: false, module: 'fx', label: `Chorus ${name}`, labelPos: 'none', help,
  });
  decor.push({ t: 'led', x: X(px - 2), y: Y(296), r: 4, color: 'red', litWhen: { id, eq: true } });
  T(px, 401, name, 11, { weight: 700 });
});
rocker('fx.chorusOn', X(2673), Y(358), 'orange', {
  kind: 'bool', def: false, module: 'fx', label: 'Chorus on',
  help: 'Switches the chorus in or out. It is what makes the Poly D stereo: with it off, both outputs carry the same sound.',
});
T(2710, 395, 'ON', 8.5);

// ── Sequencer (the arpeggiator part of it) ────────────────────────────────
knob('arp.tempo', X(2318), Y(528), 23, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'TEMPO/GATE LENGTH', labelPos: 'top', labelSize: 10, module: 'util',
  scale: { nums: [0, 10], ticks: 11, size: 10 }, fmt: (v) => `${tempoBpm(v)} BPM`,
  help: 'Speed of the arpeggiator (and, on the hardware, of the sequencer). The arpeggiator plays sixteenth notes at this tempo.',
});
plate(2305, 598, 'SWING');
decor.push({ t: 'logo', x: X(2535), y: Y(566), size: 20, text: 'behringer', style: 'behringer' });
decor.push({ t: 'path', d: `M${X(2535)} ${Y(470)} L${X(2585)} ${Y(530)} H${X(2485)} Z`, w: 1.6, fill: 'none', hw: true });
const seqBtn = (id, px, py, rest) => controls.push({ id, type: 'button', lamp: 'red', x: X(px), y: Y(py), w: 36, h: 15, labelPos: 'none', module: 'util', ...rest });
// the sequencer buttons this app does not model: printed, and lit as they are in the photo
const deadBtn = (px, py, w = 36, h = 15) => decor.push(
  { t: 'rect', x: X(px) - w / 2 - 3, y: Y(py) - h / 2 - 3, w: w + 6, h: h + 6, r: 4, fill: '#060607', hw: true },
  { t: 'rect', x: X(px) - w / 2, y: Y(py) - h / 2, w, h, r: 3, fill: '#b3261c', stroke: '#000', sw: 1, hw: true },
  { t: 'rect', x: X(px) - w / 2 + 3, y: Y(py) - h / 2 + 2, w: w - 6, h: h * 0.35, r: 2, fill: '#ff8a7a', hw: true },
);
seqBtn('arp.hold', 1702, 670, {
  kind: 'bool', def: false, label: 'HOLD', name: 'HOLD (arpeggiator latch)',
  help: 'With the arpeggiator on, HOLD keeps it playing the last chord after you let go. A new chord replaces the old one. (On the hardware it also rests or holds steps in the sequencer.)',
});
deadBtn(1766, 670);
seqBtn('arp.on', 1830, 670, {
  kind: 'bool', def: false, label: 'ARP', name: 'ARP (arpeggiator on)',
  help: 'Starts the arpeggiator: the keys you hold are played one after another at the TEMPO rate, in the order the LOCATION lamps show.',
});
deadBtn(1896, 670);
deadBtn(1702, 740);
deadBtn(1766, 740);
deadBtn(1830, 740);
deadBtn(1896, 740);
T(1702, 696, 'HOLD/\nREST', 8);
T(1766, 696, 'RESET/\nACCENT', 8);
T(1830, 696, 'ARP', 8);
plate(1830, 712, 'SET END');
T(1896, 696, 'PATTERN', 8);
plate(1896, 712, 'BANK');
plate(1702, 767, 'SHIFT');
T(1766, 767, 'PAGE', 8);
T(1830, 767, 'PLAY/STOP', 8);
T(1896, 767, 'REC', 8);
// LOCATION lamps: here they show which arpeggio order STEP has chosen.
ARP_ORDERS.forEach((o, i) => {
  decor.push({ t: 'led', x: X(1981 + i * 23.4), y: Y(670), r: 4.5, color: 'amber', litWhen: { id: 'arp.order', eq: o.v } });
  T(1981 + i * 23.4, 697, String(i + 1), 8);
});
decor.push(
  { t: 'path', d: `M${X(1973)} ${Y(740)} L${X(1990)} ${Y(729)} V${Y(751)} Z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(2153)} ${Y(740)} L${X(2136)} ${Y(729)} V${Y(751)} Z`, w: 0, fill: INK },
);
deadBtn(2030, 740);
plate(2030, 767, 'KYBD');
seqBtn('arp.order', 2097, 740, {
  kind: 'enum', options: ARP_ORDERS.map(({ v, label }) => ({ v, label })), def: 'up', lit: 'always', label: 'STEP', name: 'STEP (arpeggio order)',
  help: 'Chooses the order the arpeggiator plays the held keys in: each press moves on to the next of eight orders, shown on the LOCATION lamps 1 to 8. On the hardware KYBD steps back and STEP forward.',
});
plate(2097, 767, 'STEP');
for (let i = 0; i < 8; i++) {
  deadBtn(2230 + i * 63.6, 706, 38, 34);
  T(2230 + i * 63.6, 750, String(i + 1), 9);
}

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', X(2828), Y(173), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 7, label: 'VOLUME', labelPos: 'top', labelSize: 11, module: 'out', scale: S10,
  help: 'Main output level. With the external input switched on, it also sets how hard the feedback path is driven.',
});
knob('out.phones', X(2828), Y(356), 24, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'PHONES', labelPos: 'top', labelSize: 11, module: 'out', scale: S10,
  help: 'Headphone level on the hardware. It has no effect in this app.',
});
jacks.push({ id: 'j.phones', x: X(2812), y: Y(528), r: 17, label: 'PHONES', labelPos: 'none', dir: 'out', signal: 'out', help: 'Headphone output.' });
decor.push({ t: 'led', x: X(2812), y: Y(617), r: 4.5, color: 'amber', litWhen: 'power' });
T(2812, 648, 'POWER', 9);
decor.push(
  { t: 'rect', x: X(2815) - 15, y: Y(705) - 30, w: 30, h: 60, r: 4, fill: '#08080a', stroke: '#2a2b2e', sw: 1.5, hw: true },
  { t: 'rect', x: X(2815) - 11, y: Y(705) - 22, w: 22, h: 40, r: 3, fill: '#1e1f21', stroke: '#000', sw: 1, hw: true },
);

// ── Areas ─────────────────────────────────────────────────────────────────
const areas = [
  { id: 'keyside', label: 'Beside the keyboard: LFO, glide, transpose', module: 'lfo', keywords: 'lfo vibrato wobble rate shape glide portamento transpose octave wheels pitch bend mod wheel',
    rects: [{ x: 38, y: 0, w: 284, h: 540 }],
    help: 'The small panel to the left of the keys on the hardware. LFO RATE and the switch beside it set the LFO’s speed and shape, the GLIDE switch turns the slide between notes on or off, and TRANSPOSE moves the keyboard an octave either way. The pitch and mod wheels are printed for reference: use the mod wheel beside the keyboard below.' },
  { id: 'controllers', label: 'Controllers', module: 'mod', keywords: 'tune glide modulation mix osc 4 filter eg noise lfo vibrato',
    rects: [{ x: 346, y: 0, w: 258, h: Y(340) }, { x: 346, y: Y(450), w: 258, h: 540 - Y(450) }],
    help: 'Tuning, glide time and the modulation mix. TUNE moves all the oscillators together and GLIDE sets how long notes slide. MODULATION MIX blends two sources, picked by the switches under it, and OSCILLATOR MODULATION sends the blend to pitch. There is no depth knob: the mod wheel sets how much modulation you hear.' },
  { id: 'voices', label: 'Voice mode', module: 'mode', keywords: 'mono unison poly paraphonic chords polyphony auto damp voices',
    rects: [{ x: 346, y: Y(340), w: 258, h: Y(450) - Y(340) }],
    help: 'MODE decides how notes are shared among the four oscillators: all on one note (MONO), shared among the keys held (UNI) or one each, for four-note chords (POLY). The chords share one filter and one pair of contours, so every note of a chord opens and closes together. AUTO DAMP decides whether a key you let go stops at once or rings until the next new note.' },
  { id: 'oscbank', label: 'Oscillator bank', module: 'osc', keywords: 'vco range waveform detune pitch feet octave interval',
    rects: [{ x: 604, y: 0, w: 362, h: 540 }],
    help: 'Four oscillators make the raw sound. RANGE sets each one’s octave and WAVEFORM its shape. Oscillators 2 to 4 have a FREQUENCY knob to tune them against Oscillator 1. The red lamp by each RANGE knob lights while that oscillator is playing a note, which shows how POLY and UNI share them out. With OSC 4 CONTROL off, Oscillator 4 stops following the keys so it can be a modulator.' },
  { id: 'mixer', label: 'Mixer', module: 'mixer', keywords: 'volume level noise external input overload white pink',
    rects: [{ x: 966, y: 0, w: 355, h: 540 }],
    help: 'How loud each source is going into the filter: the four oscillators, the external input and noise, each with its own on/off switch. In POLY a key can land on any oscillator, so all four need to be on for full chords.' },
  { id: 'switches', label: 'Filter switches', module: 'filter', keywords: 'filter mode high-pass keyboard control tracking decay release filter modulation',
    rects: [{ x: 1321, y: 0, w: 65, h: 392 }],
    help: 'The column of switches between the mixer and the filter. From the top: low-pass or high-pass, modulation to the filter, two keyboard-tracking switches that make higher notes brighter, and DECAY, which decides whether notes fade out or stop dead when you let go.' },
  { id: 'filter', label: 'Filter and filter contour', module: 'filter', keywords: 'cutoff emphasis resonance contour envelope ladder brightness',
    rects: [{ x: 1386, y: 0, w: 318, h: Y(441) }],
    help: 'CUTOFF FREQUENCY sets how bright the sound is and EMPHASIS adds resonance at the cutoff. AMOUNT OF CONTOUR sets how far the ATTACK, DECAY and SUSTAIN knobs below it sweep the cutoff. It is one filter for all four notes.' },
  { id: 'loudness', label: 'Loudness contour', module: 'env', keywords: 'envelope attack decay sustain volume amplifier vca',
    rects: [{ x: 1386, y: Y(441), w: 318, h: 392 - Y(441) }],
    help: 'Shapes the volume. ATTACK is the fade-in and DECAY the fall to the SUSTAIN level, which holds while keys are down. With the DECAY switch on, DECAY is also the fade-out after you let go. Like the filter contour, it is shared by every note.' },
  { id: 'distortion', label: 'Distortion', module: 'fx', keywords: 'overdrive fuzz drive dirt',
    rects: [{ x: 1704, y: 0, w: 391, h: Y(267) }],
    help: 'A distortion after the amplifier. DIST sets how hard it is driven, TONE how bright it is and LEVEL how loud it comes out. The switch puts it in or takes it out.' },
  { id: 'chorus', label: 'Chorus', module: 'fx', keywords: 'chorus stereo width juno shimmer ensemble',
    rects: [{ x: 1704, y: Y(267), w: 391, h: Y(443) - Y(267) }],
    help: 'A stereo chorus after the distortion. It mixes in copies of the sound that are slightly delayed, with the delay swept up and down, which thickens the sound and spreads it across the two outputs. I is slow and gentle, II faster and deeper, both together a quick shimmer. The switch puts it in or takes it out.' },
  { id: 'sequencer', label: 'Sequencer and arpeggiator', module: 'util', keywords: 'arpeggiator arp tempo bpm hold latch sequencer pattern step',
    rects: [{ x: 1704, y: Y(443), w: 391, h: 392 - Y(443) }, { x: 1321, y: 392, w: 774, h: 148 }],
    help: 'The arpeggiator plays the keys you hold one after another. ARP starts it, TEMPO sets the speed, HOLD keeps it going after you let go and STEP picks one of eight orders, shown on the LOCATION lamps. The 32-step sequencer and its pattern memories are printed but not modelled.' },
  { id: 'output', label: 'Output', module: 'out', keywords: 'volume headphones phones power',
    rects: [{ x: 2095, y: 0, w: 103, h: 540 }],
    help: 'Main VOLUME, a separate headphone volume and socket, and the power switch with its lamp.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v, ctx) {
  const osc = [1, 2, 3, 4].map((n) => {
    const kbd = n === 4 ? v['osc4.kbd'] : true;
    const det = n === 1 ? 0 : v[`osc${n}.freq`];
    return {
      level: v[`mix.osc${n}On`] ? level10(v[`mix.osc${n}`], 0.8) : 0,
      ...WAVE_MIX[v[`osc${n}.wave`]],
      semi: RANGE_SEMI[v[`osc${n}.range`]] + (kbd ? det : det * (36 / 7)) + (kbd ? v['ctl.tune'] : 0),
      kbd, fixedNote: 60, syncTo: -1,
    };
  });
  // The Minimoog bus: MODULATION MIX blends the two switched sources, and the mod wheel alone sets the depth.
  const m = v['mod.mix'] / 10;
  const depth = clamp(ctx.wheel || 0, 0, 1);
  const srcA = v['mod.srcA'] === 'osc4' ? 'osc4' : 'env1';
  const srcB = v['mod.srcB'] === 'lfo' ? 'lfo' : 'noise';
  const routes = [];
  const bus = (dst, max) => {
    if ((1 - m) * depth > 0.0005) routes.push({ src: srcA, dst, amt: (1 - m) * depth * max });
    if (m * depth > 0.0005) routes.push({ src: srcB, dst, amt: m * depth * max });
  };
  if (v['mod.toOsc']) bus('pitchAll', 12);
  if (v['mod.toFilter']) bus('cutoff', 4.5);
  const fDecay = decTime(v['fenv.decay']);
  const aDecay = decTime(v['aenv.decay']);
  const rel = (d) => (v['env.decay'] ? d : 0.012);
  const mode = v['voice.mode'];
  const order = ARP_ORDERS.find((o) => o.v === v['arp.order']) || ARP_ORDERS[0];
  const chorusMode = (v['fx.chorus1'] ? 1 : 0) + (v['fx.chorus2'] ? 2 : 0);
  return {
    osc,
    oscAssign: mode === 'mono' ? undefined : { mode: mode === 'uni' ? 'unison' : 'poly', damp: !!v['voice.damp'] },
    noise: { level: v['mix.noiseOn'] ? level10(v['mix.noise'], 0.8) : 0, color: v['noise.colour'] },
    ext: { level: v['mix.extOn'] ? level10(v['mix.ext'], 1.6) * (0.4 + v['out.volume'] / 10) : 0 },
    filter: {
      type: 'ladder', mode: v['filter.mode'], cutoff: cutoffHz(v['filter.cutoff']), res: (v['filter.emphasis'] / 10) * 1.06,
      envAmt: (v['filter.contour'] / 10) * 8.5, envSrc: 'env1', kbd: (v['filter.kbd1'] ? 1 / 3 : 0) + (v['filter.kbd2'] ? 2 / 3 : 0),
    },
    env1: { a: attTime(v['fenv.attack']), d: fDecay, s: v['fenv.sustain'] / 10, r: rel(fDecay) },
    env2: { a: attTime(v['aenv.attack']), d: aDecay, s: v['aenv.sustain'] / 10, r: rel(aDecay) },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 }, keySync: false },
    glide: { time: v['glide.on'] ? glideTime(v['ctl.glide']) : 0, legato: false },
    // multi-trigger is the Poly D's default: every new key starts both contours again
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes,
    // distortion after the VCA, then the chorus
    normals: { extIn: 'out', vcaIn: 'vcf1', odIn: 'vca', delayIn: 'od' },
    od: { on: !!v['fx.distOn'], drive: v['fx.dist'] / 10, tone: v['fx.tone'] / 10, level: level10(v['fx.level'], 1.8) },
    delay: { on: false },
    chorus: { on: !!v['fx.chorusOn'], mode: chorusMode },
    poly: { voices: 1, stack: 1, mono: true },
    arp: { on: !!v['arp.on'], bpm: tempoBpm(v['arp.tempo']), gate: 0.5, mode: order.mode, octaves: order.oct, hold: !!v['arp.hold'] },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: TRANSPOSE[v['kbd.transpose']],
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'pd-poly-brass', name: 'Four-Note Brass', ref: 'In the style of early-80s synth-pop brass stabs', artist: 'Classic technique',
    tags: ['brass', 'poly', '80s'], level: 1,
    blurb: 'Bright sawtooth chords that bloom open on every stab.',
    how: 'In POLY each key of a chord takes an oscillator of its own, so four sawtooths set the same way play four notes. All the notes go through one filter and one contour, so every stab opens and closes as a block: that shared swell is the brass sound. Chorus widens it.',
    phrase: { bpm: 108, loop: true, steps: [[0, 60, 0.7], [0, 64, 0.7], [0, 67, 0.7], [0, 72, 0.7], [1.5, 62, 0.4], [1.5, 65, 0.4], [1.5, 69, 0.4], [1.5, 74, 0.4], [2, 64, 1.6], [2, 67, 1.6], [2, 71, 1.6], [2, 76, 1.6]] },
    steps: [
      { title: 'Four sawtooths, one per note', module: 'osc', why: 'POLY is the Poly D’s chord mode: each key you hold is given one of the four oscillators (the parts that make the raw tone), so a four-note chord uses all of them. Because every oscillator is a note, they all need the same settings or the chord comes out uneven.\n- MODE POLY: each new key takes the next oscillator in turn, and the red lamp by its RANGE knob lights. MONO would put all four on one key, so a chord would collapse to a single note.\n- RANGE 8’ on all four: footage comes from organ pipes; 8’ is normal pitch. One oscillator at another footage would throw one note of every chord up or down an octave.\n- WAVEFORM sawtooth on all four: the brightest, buzziest wave, full of harmonics, and the raw material of synth brass.\n- FREQUENCY +0.1 / −0.1 / +0.1 on 2–4: a tenth of a semitone either way. Too small to sound out of tune, enough to stop the chord sounding too clean.\n- Listen for: hold a four-note chord and watch four lamps light. Switch MODE to MONO and play it again: one note. Then back to POLY.',
        set: { 'voice.mode': 'poly', 'osc1.range': '8', 'osc2.range': '8', 'osc3.range': '8', 'osc4.range': '8', 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc3.wave': 'saw', 'osc4.wave': 'saw', 'osc2.freq': 0.08, 'osc3.freq': -0.08, 'osc4.freq': 0.05 } },
      { title: 'All four on, level', module: 'mixer', why: 'The mixer sets how loud each oscillator is going into the filter. In POLY each oscillator is a note, so these knobs are really the balance between the notes of a chord.\n- OSC 1–4 on: in POLY a key that lands on a switched-off oscillator plays nothing, so one note in four would go missing.\n- VOLUME 6 on all four: equal levels, so every note of the chord is as loud as the others and none sticks out. Turned up together, the four drive the filter harder and the tone thickens and roughens.\n- Listen for: switch OSC 4 off and play a four-note chord. One of its notes goes missing. Switch it back on.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': true, 'mix.osc1': 6, 'mix.osc2': 6, 'mix.osc3': 6, 'mix.osc4': 6 } },
      { title: 'A darker filter that swells', module: 'filter', why: 'The filter takes brightness away, and its contour (Moog’s word for envelope, a shape that runs each time you play) opens it on each stab. It is a Moog-style ladder filter in low-pass mode: lows pass, highs are cut. There is one filter for all four notes, so the whole chord opens as a block.\n- CUTOFF −1.5 (about 220 Hz): mellow between stabs, with most of the buzz rolled off.\n- EMPHASIS 1.5: Moog’s name for resonance, a boost at the cutoff. Just a hint of edge as the filter moves.\n- AMOUNT OF CONTOUR 5: how far the contour lifts the cutoff. Sets how bright the peak of each stab gets.\n- ATTACK 1.6 (about 70 ms): the filter takes a moment to open, like a brass player blowing harder at the start of a note. At 0 it is a hard stab; at 3 a slow swell.\n- DECAY 680 ms, SUSTAIN 4.5: after the peak it settles about halfway, so held chords stay fairly bright.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so high chords are not duller than low ones.\n- Listen for: the “bwah” at the front of each chord. Sweep ATTACK between 0 and 3 to hear stab turn into swell.',
        set: { 'filter.cutoff': -1.5, 'filter.emphasis': 1.5, 'filter.contour': 5, 'fenv.attack': 1.6, 'fenv.decay': 4.5, 'fenv.sustain': 4.5, 'filter.kbd1': true } },
      { title: 'Stab-shaped loudness', module: 'amp', why: 'The loudness contour shapes the volume of each chord, the job a VCA (voltage-controlled amplifier) does on other synths. Like the filter contour, it is shared by all four notes.\n- ATTACK 0.6 (5 ms): almost instant, just soft enough to avoid a click. The swell comes from the filter, not from the volume.\n- SUSTAIN 9: held chords stay at nearly full level.\n- DECAY 350 ms with the DECAY switch on: there is no release knob, so this switch makes DECAY the fade after you let go. A short fade keeps stabs separate.\n- Listen for: the gap between stabs. Switch DECAY off and chords stop dead on release; back on, they tail off briefly.',
        set: { 'aenv.attack': 0.6, 'aenv.decay': 3, 'aenv.sustain': 9, 'env.decay': true } },
      { title: 'Chorus for width', module: 'fx', why: 'The chorus mixes in slightly delayed copies of the sound with the delay swept up and down. It thickens the chord and is what makes the Poly D stereo: without it both outputs carry the same sound.\n- Chorus ON: puts the chorus in the signal path, after the distortion.\n- CHORUS I: the slow, gentle setting. It widens the chord without an obvious wobble. II alone is faster and deeper; I and II together a quick shimmer.\n- Listen for: on headphones, the stabs spread out from the centre. Switch the chorus off and on to hear the chord narrow and flatten, then widen again.', set: { 'fx.chorusOn': true, 'fx.chorus1': true } },
    ],
    context: {
      'voice.mode': 'In this sound: POLY, so each key of a chord gets its own oscillator. Try MONO and a chord collapses to one note.',
      'fenv.attack': 'In this sound: the bloom at the front of each stab. At 0 it is a hard, bright stab; at 3 a slow swell.',
      'filter.contour': 'In this sound: how bright the peak of each stab gets.',
      'mix.osc4On': 'In this sound: the fourth note of each chord. Switch it off and one note of every four-note chord goes missing.',
    },
    tweaks: [
      { id: 'fenv.attack', try: 'Sweep between 0 and 3', hear: 'A hard stab at 0, a slow brass swell at 3.' },
      { id: 'voice.damp', try: 'Switch on and let go of one note of a held chord', hear: 'The note you let go stops at once; with it off, it keeps sounding.' },
      { id: 'fx.chorus2', try: 'Add chorus II', hear: 'A deeper, faster sweep: wider but less steady.' },
    ],
  },
  {
    id: 'pd-unison-bass', name: 'Four-Saw Unison Bass', ref: 'In the style of 90s rave and big-room synth bass', artist: 'Classic technique',
    tags: ['bass', 'unison', '90s'], level: 1,
    blurb: 'Four detuned sawtooths on one note: a wide, heavy bass.',
    how: 'UNI puts all four oscillators on the one key you play. Each is tuned a little apart with its FREQUENCY knob, so they drift in and out of phase and the note sounds huge. Oscillator 4 goes an octave down for weight, and a fast filter contour gives each note a punch.',
    phrase: { bpm: 126, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.2], [0.75, 48, 0.2], [1, 36, 0.4], [1.5, 43, 0.4], [2, 36, 0.4], [2.5, 46, 0.2], [2.75, 48, 0.2], [3, 41, 0.4], [3.5, 43, 0.4]] },
    steps: [
      { title: 'All four on one key', module: 'mode', why: 'UNI (unison) shares the four oscillators among the keys you hold. A bass line is one key at a time, so every note gets all four stacked on it, which is what makes it big.\n- MODE UNI: hold one key and all four OSCILLATOR lamps light. Hold two keys and they split two and two, so each note gets thinner. In POLY each bass note would be one thin sawtooth.\n- Listen for: hold a low note. The four oscillators are still identical, so it only sounds like one louder sawtooth. The next step pulls them apart.', set: { 'voice.mode': 'uni' } },
      { title: 'Detuned sawtooths, one an octave down', module: 'osc', why: 'The oscillators are tuned slightly apart so they drift in and out of phase, and the fourth drops an octave for weight. This is the classic detuned rave bass stack.\n- RANGE 16’ on 1–3: footage comes from organ pipes; 16’ is an octave below normal 8’ pitch, bass territory.\n- RANGE 32’ on osc 4: another octave down. The sub layer you feel on a big system.\n- WAVEFORM sawtooth on all four: the buzziest wave, with every harmonic, so the stack has plenty of bite for the filter to shape.\n- FREQUENCY +0.2 / −0.1 / +0.1 on 2–4: small, different offsets, so each pair beats at a different speed and the note sounds wide rather than simply out of tune. Past about 0.3 it starts to sound sour.\n- Listen for: hold a low note and hear the slow churning. Set osc 2 FREQUENCY to 0 and the width shrinks; put it back.',
        set: { 'osc1.range': '16', 'osc2.range': '16', 'osc3.range': '16', 'osc4.range': '32', 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc3.wave': 'saw', 'osc4.wave': 'saw', 'osc2.freq': 0.18, 'osc3.freq': -0.14, 'osc4.freq': 0.05 } },
      { title: 'Mix', module: 'mixer', why: 'The mixer sets how loud each oscillator goes into the filter. Here the three 16’ saws lead and the sub sits a little under them.\n- OSC 1–4 on: all four needed for the full stack.\n- VOLUME 7 / 7 / 7 / 6: the 16’ saws carry the tone, and the 32’ sub at 6 adds weight without swamping the note. Levels this high push the filter a little harder, which thickens the sound.\n- Listen for: turn osc 4 VOLUME down to 0 and back up to 6 while holding a note. The bottom octave falls away and returns.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': true, 'mix.osc1': 7, 'mix.osc2': 7, 'mix.osc3': 7, 'mix.osc4': 6 } },
      { title: 'Punchy filter', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. Here it sits low and its contour (Moog’s word for envelope) flicks it open on each note, which gives every note a punch.\n- CUTOFF −2 (about 160 Hz): dark at rest, so the stack is mostly weight between hits.\n- EMPHASIS 2.5: Moog’s word for resonance, a boost at the cutoff. A little edge on the snap; at 6 it turns into a squelch.\n- AMOUNT OF CONTOUR 5: how far each note lifts the cutoff. More is a harder hit.\n- DECAY 310 ms, SUSTAIN 2.5: with ATTACK at 0 (1 ms) it opens at once, falls back in about a third of a second and settles low, so the punch is at the front.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so higher notes in the riff are a little brighter.\n- Listen for: a “dow” at the start of each note. Sweep DECAY while the riff plays to hear it tighten and loosen.',
        set: { 'filter.cutoff': -2, 'filter.emphasis': 2.5, 'filter.contour': 5, 'fenv.attack': 0, 'fenv.decay': 2.8, 'fenv.sustain': 2.5, 'filter.kbd1': true } },
      { title: 'Tight loudness', module: 'amp', why: 'The loudness contour shapes volume over time, the job a VCA (voltage-controlled amplifier) does on other synths. For a bass line you want notes that hit at once and stop clean.\n- ATTACK 0 (1 ms): full level instantly, lined up with the filter snap.\n- SUSTAIN 9: held notes keep almost all their weight.\n- DECAY 250 ms with the DECAY switch on: the Poly D has no release knob, so this switch makes DECAY the fade after you let go. Short, so notes stay separate.\n- Listen for: the gaps in the riff. Clean gaps keep the bass tight; raise DECAY to 5 and the notes smear into each other.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2.4, 'aenv.sustain': 9, 'env.decay': true } },
    ],
    context: {
      'voice.mode': 'In this sound: UNI, so one key gets all four oscillators. In POLY each note would be a single thin sawtooth.',
      'osc2.freq': 'In this sound: one of the three small offsets that make the width. More than about 0.3 starts to sound out of tune.',
      'mix.osc4': 'In this sound: the octave-down weight.',
    },
    tweaks: [
      { id: 'osc3.freq', try: 'Set to 7 (a fifth)', hear: 'Every note now plays a power chord.' },
      { id: 'fx.distOn', try: 'Switch the distortion on with DIST at 4', hear: 'A grittier, more compressed bass.' },
      { id: 'filter.emphasis', try: 'Raise to 6', hear: 'The punch turns into a squelch.' },
    ],
  },
  {
    id: 'pd-chorus-pad', name: 'Chorus Pad', ref: 'In the style of 80s Juno-era string pads', artist: 'Classic technique',
    tags: ['pad', 'poly', '80s'], level: 1,
    blurb: 'Slow, soft chords spread wide by the chorus.',
    how: 'Four sawtooths in POLY play the chord, a low cutoff softens them and slow attack and decay make each chord swell and fade. The chorus is the sound: its swept delays turn four plain oscillators into a wide, moving pad.',
    phrase: { bpm: 70, loop: true, steps: [[0, 57, 3.8], [0, 60, 3.8], [0, 64, 3.8], [0, 67, 3.8], [4, 53, 3.8], [4, 57, 3.8], [4, 60, 3.8], [4, 64, 3.8]] },
    steps: [
      { title: 'Matching sawtooths', module: 'osc', why: 'POLY gives each key you hold one of the four oscillators (the parts that make the raw tone), so a four-note chord uses all of them. For the notes to match, all four need the same octave and wave.\n- MODE POLY: each new key takes the next oscillator in turn, up to four at once.\n- RANGE 8’ on all four: footage comes from organ pipes; 8’ is normal pitch. Any other footage would put one note of each chord in another octave.\n- WAVEFORM sawtooth on all four: bright and full of harmonics. The classic string-pad starting point, which the filter will soften.\n- FREQUENCY 0 on 2–4: exactly in tune. The chorus will supply the movement later, so no detune is needed here.\n- Listen for: hold a chord. It is bright and static for now, like a plain organ.',
        set: { 'voice.mode': 'poly', 'osc1.range': '8', 'osc2.range': '8', 'osc3.range': '8', 'osc4.range': '8', 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc3.wave': 'saw', 'osc4.wave': 'saw', 'osc2.freq': 0, 'osc3.freq': 0, 'osc4.freq': 0 } },
      { title: 'Mix', module: 'mixer', why: 'The mixer sets how loud each oscillator (and so each note of a chord) goes into the filter.\n- OSC 1–4 on: in POLY a key that lands on a switched-off oscillator is silent, so all four must be on for full chords.\n- VOLUME 5.5 on all four: a moderate, even level. Every note of the chord matches, and the filter is not driven hard, so the pad stays soft rather than gritty.\n- Listen for: play a four-note chord and turn one VOLUME down to 0. One note fades out of the chord. Put it back to 5.5.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': true, 'mix.osc1': 5.5, 'mix.osc2': 5.5, 'mix.osc3': 5.5, 'mix.osc4': 5.5 } },
      { title: 'Soft filter', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. Here it is set low and its contour (Moog’s word for envelope) opens it only a little, and slowly, so each chord gently brightens as it swells.\n- CUTOFF −1 (about 320 Hz): how soft the pad is. Low enough to take the fizz off the sawtooths.\n- EMPHASIS 1: Moog’s word for resonance. Just a trace, no whistle.\n- AMOUNT OF CONTOUR 2.5: a small lift, so the change in brightness is gentle.\n- ATTACK 770 ms, DECAY 1.0 s, SUSTAIN 6: the filter takes most of a second to open, then settles only a little lower.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so high chords do not go dull.\n- Listen for: hold a chord and hear it start dark and brighten over the first second.',
        set: { 'filter.cutoff': -1, 'filter.emphasis': 1, 'filter.contour': 2.5, 'fenv.attack': 5, 'fenv.decay': 6, 'fenv.sustain': 6, 'filter.kbd1': true } },
      { title: 'Slow swell and fade', module: 'amp', why: 'The loudness contour shapes the volume, the job a VCA (voltage-controlled amplifier) does on other synths. A pad should fade in and fade out rather than start and stop.\n- ATTACK 4.8 (740 ms): each chord swells in over most of a second. Lower it for a keyboard-like chord; raise it for a slower fade-in.\n- SUSTAIN 9: held chords stay near full level.\n- DECAY 1.2 s with the DECAY switch on: with the switch on, DECAY is also the fade after you let go, so chords overlap as you change them.\n- Listen for: change chords and hear the old one tail away under the new one.',
        set: { 'aenv.attack': 4.8, 'aenv.decay': 6.2, 'aenv.sustain': 9, 'env.decay': true } },
      { title: 'Chorus I', module: 'fx', why: 'The chorus mixes in delayed copies of the sound with the delay swept up and down, which thickens it and spreads it across the two outputs. On this pad the chorus is the sound: it turns four plain oscillators into a wide, moving pad.\n- Chorus ON: puts the chorus in, after the distortion. With it off, both outputs carry the same sound.\n- CHORUS I on, II off: I alone is a slow, gentle sweep. Pressing II as well gives a quick, shallow shimmer instead.\n- Listen for: switch the chorus off and on while holding a chord. Off, the pad goes flat and narrow; on, it spreads wide and slowly moves.',
        set: { 'fx.chorusOn': true, 'fx.chorus1': true, 'fx.chorus2': false } },
    ],
    context: {
      'fx.chorusOn': 'In this sound: the whole character. Switch it off and the pad goes flat and narrow.',
      'aenv.attack': 'In this sound: the swell. Lower it for a keyboard-like chord; raise it for a slower fade-in.',
      'filter.cutoff': 'In this sound: how soft the pad is.',
    },
    tweaks: [
      { id: 'fx.chorus2', try: 'Switch II on as well as I', hear: 'A quicker, shallower shimmer.' },
      { id: 'osc2.freq', try: 'Set Oscillator 2 to 0.15', hear: 'In POLY this detunes only the notes that land on Oscillator 2, so the chord shimmers unevenly.' },
      { id: 'filter.cutoff', try: 'Raise to 1.5', hear: 'A brighter, string-like pad.' },
    ],
  },
  {
    id: 'pd-dist-lead', name: 'Fuzz Lead', ref: 'In the style of 70s prog-rock synth leads through a fuzz pedal', artist: 'Classic technique',
    tags: ['lead', 'prog', 'distortion'], level: 2,
    blurb: 'A singing mono lead with glide, driven through the distortion.',
    how: 'MONO puts every oscillator on the one note: two sawtooths and a square an octave down. Glide makes it slide between notes. The distortion after the amplifier compresses and fattens it, and the resonant filter gives it a vocal edge.',
    phrase: { bpm: 96, loop: true, steps: [[0, 62, 1.4], [1.5, 69, 0.5], [2, 67, 1], [3, 74, 1.4], [4.5, 72, 0.5], [5, 69, 0.9], [6, 67, 1.8]] },
    steps: [
      { title: 'One note, three oscillators', module: 'mode', why: 'MONO puts every switched-on oscillator (the parts that make the raw tone) on the one key you press, so three of them stack into one thick lead note. The mixer sets how loud each is going into the filter.\n- MODE MONO: one note at a time, all oscillators on it.\n- RANGE 8’ / 8’ / 16’: footage comes from organ pipes; 8’ is normal pitch and 16’ an octave below, for body.\n- WAVEFORM saw / saw / square: two bright saws on top, and a hollow square underneath for weight.\n- Osc 2 FREQUENCY +0.1: a tenth of a semitone sharp, so the two saws beat slowly and the note moves.\n- OSC 1–3 on, VOLUME 7 / 6.5 / 5: OSC 4 off. The saws lead and the square sits under them.\n- Listen for: hold a note and switch osc 3 off and on to hear the octave below come and go.',
        set: { 'voice.mode': 'mono', 'osc1.range': '8', 'osc1.wave': 'saw', 'osc2.range': '8', 'osc2.wave': 'saw', 'osc2.freq': 0.1, 'osc3.range': '16', 'osc3.wave': 'sq', 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': false, 'mix.osc1': 7, 'mix.osc2': 6.5, 'mix.osc3': 5 } },
      { title: 'Glide', module: 'glide', why: 'Glide slides the pitch from one note to the next instead of jumping, the singing, sliding move of a prog lead. On the Poly D it has an on/off switch beside the keys and a time knob on the main panel.\n- GLIDE switch on: without it the knob does nothing.\n- GLIDE knob 3.5 (240 ms): about a quarter of a second per slide. Higher is lazier and swoopier; lower is just a quick scoop.\n- Listen for: play two notes an octave apart. The pitch sweeps between them. Switch GLIDE off and it jumps.', set: { 'glide.on': true, 'ctl.glide': 3.5 } },
      { title: 'Resonant filter', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. Here it sits in the middle with some emphasis, so the lead has a vocal edge, and a gentle contour (Moog’s word for envelope) brightens each note’s start.\n- CUTOFF 0.2 (about 730 Hz): half open, so the saws still buzz but are not harsh.\n- EMPHASIS 4: Moog’s word for resonance, a boost at the cutoff. Gives the nasal, singing edge.\n- AMOUNT OF CONTOUR 3, DECAY 770 ms: with ATTACK at 8 ms and SUSTAIN 5, a mild lift at the start of each note that settles halfway.\n- KEYBOARD CONTROL 1 and 2 on: full key tracking, so the cutoff follows the notes and high notes keep the same colour as low ones.\n- Listen for: the slight “wah” at the start of each note. Sweep EMPHASIS from 0 to 6 to hear the edge grow.',
        set: { 'filter.cutoff': 0.2, 'filter.emphasis': 4, 'filter.contour': 3, 'fenv.attack': 0.8, 'fenv.decay': 5, 'fenv.sustain': 5, 'filter.kbd1': true, 'filter.kbd2': true } },
      { title: 'Sustained loudness', module: 'amp', why: 'The loudness contour shapes the volume, the job a VCA (voltage-controlled amplifier) does on other synths. A lead has to hold its level for as long as you hold the note.\n- ATTACK 0.3 (2 ms): immediate start without a click.\n- SUSTAIN 10: full level for as long as the key is down, so long notes sing.\n- DECAY 600 ms with the DECAY switch on: the fade after you let go, since the Poly D has no separate release.\n- Listen for: hold a long note. It stays at full level. Let go and it tails off over about half a second.', set: { 'aenv.attack': 0.3, 'aenv.decay': 4, 'aenv.sustain': 10, 'env.decay': true } },
      { title: 'Drive it', module: 'fx', why: 'The distortion sits after the amplifier and before the chorus. Driving it squashes the peaks, so the lead gets louder-sounding, more sustained and fuzzier, like a synth through a guitar pedal.\n- Distortion ON: puts it in the signal path.\n- DIST 6: well driven. Below 3 it only thickens; above 7 it buzzes hard.\n- TONE 4: a little dark, so the fuzz stays smooth rather than fizzy. Turn it right for a harsher top.\n- LEVEL 3.5: turned down to keep the volume close to the clean sound, as driving it makes it louder.\n- Listen for: switch the distortion off and on while holding a note. On, the note is thicker, compressed and grittier.',
        set: { 'fx.distOn': true, 'fx.dist': 6, 'fx.tone': 4, 'fx.level': 3.5 } },
    ],
    context: {
      'fx.dist': 'In this sound: the fuzz. Below 3 it only thickens; above 7 it buzzes hard.',
      'ctl.glide': 'In this sound: the slide between notes.',
      'voice.mode': 'In this sound: MONO, so all three oscillators play each note.',
    },
    tweaks: [
      { id: 'fx.tone', try: 'Turn from 2 to 8', hear: 'Smooth and woolly to bright and cutting.' },
      { id: 'mod.toOsc', try: 'Switch on, then push the mod wheel', hear: 'Vibrato from the LFO, as deep as you push the wheel.' },
      { id: 'filter.emphasis', try: 'Raise to 7', hear: 'A more nasal, wah-like lead.' },
    ],
  },
  {
    id: 'pd-arp-chords', name: 'Arpeggio Chords', ref: 'In the style of 80s arpeggiated synth-pop', artist: 'Classic technique',
    tags: ['seq', 'arp', '80s'], level: 2,
    blurb: 'Hold a chord and the arpeggiator plays it as a bright, bouncing line.',
    how: 'ARP plays the held keys one at a time at the TEMPO rate. Each arpeggio note is a single note, so the patch is set in MONO with three oscillators stacked on it. A plucky contour makes each step distinct and the chorus spreads the line.',
    phrase: { bpm: 110, loop: true, steps: [[0, 57, 3.9], [0, 60, 3.9], [0, 64, 3.9], [4, 53, 3.9], [4, 57, 3.9], [4, 60, 3.9]] },
    steps: [
      { title: 'A stacked single voice', module: 'mode', why: 'The arpeggiator will play held chords one note at a time, so the voice only ever plays single notes. MONO stacks three oscillators (the parts that make the raw tone) on each of those notes for a full sound.\n- MODE MONO: every switched-on oscillator plays the one note.\n- RANGE 8’ / 4’ / 16’: footage comes from organ pipes; 8’ is normal pitch, 4’ an octave up, 16’ an octave down. Three octaves in one note.\n- WAVEFORM saw / saw / square: bright saws on top, a hollow square underneath.\n- Osc 2 FREQUENCY +0.1: a hair sharp, so it beats slightly against osc 1.\n- OSC 1–3 on, VOLUME 7 / 4.5 / 5: OSC 4 off. The upper octave is quietest, adding sparkle without thinning the note.\n- Listen for: hold a note. Switch osc 2 off and on to hear the octave-up sparkle.',
        set: { 'voice.mode': 'mono', 'osc1.range': '8', 'osc1.wave': 'saw', 'osc2.range': '4', 'osc2.wave': 'saw', 'osc2.freq': 0.05, 'osc3.range': '16', 'osc3.wave': 'sq', 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': false, 'mix.osc1': 7, 'mix.osc2': 4.5, 'mix.osc3': 5 } },
      { title: 'Plucky filter', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. A short contour (Moog’s word for envelope) flicks it open on each note, so every arpeggio step pops.\n- CUTOFF −1.2 (about 280 Hz): fairly dark between steps.\n- EMPHASIS 3: Moog’s word for resonance, a boost at the cutoff. Adds a little quack to each pop.\n- AMOUNT OF CONTOUR 5.5: a big lift at the start of each note.\n- ATTACK 1 ms, DECAY 280 ms, SUSTAIN 1: open at once, closed again in under a third of a second. DECAY sets how long the bright part of each step lasts.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so the high notes of the arpeggio are not duller.\n- Listen for: tap a note and hear a bright blip that quickly goes dark.',
        set: { 'filter.cutoff': -1.2, 'filter.emphasis': 3, 'filter.contour': 5.5, 'fenv.attack': 0, 'fenv.decay': 2.6, 'fenv.sustain': 1, 'filter.kbd1': true } },
      { title: 'Short notes', module: 'amp', why: 'The loudness contour shapes the volume, the job a VCA (voltage-controlled amplifier) does on other synths. Short notes keep the arpeggio steps apart.\n- ATTACK 0 (1 ms): every step starts at once.\n- DECAY 350 ms, SUSTAIN 3: the volume falls quickly to a low level, so even held notes sound plucked.\n- DECAY switch on: the note also fades over 350 ms after release rather than stopping dead.\n- Listen for: hold a note and hear it drop in level after the first moment.',
        set: { 'aenv.attack': 0, 'aenv.decay': 3, 'aenv.sustain': 3, 'env.decay': true } },
      { title: 'Start the arpeggiator', module: 'util', why: 'The arpeggiator plays the keys you hold one after another, as sixteenth notes at the TEMPO rate. Hold a chord and it becomes a bouncing line.\n- ARP on: starts it. Switch it off to hear the chords themselves (as a single note in MONO).\n- TEMPO 5.2 (102 BPM): the speed of the line, in sixteenth notes.\n- STEP UP/DOWN: climbs through the held notes and back down. Each press of STEP moves to the next of the eight orders, shown on the LOCATION lamps.\n- Listen for: hold a three- or four-note chord. The notes run up and down. Change the chord and the line follows.',
        set: { 'arp.on': true, 'arp.tempo': 5.2, 'arp.order': 'updown' } },
      { title: 'Chorus', module: 'fx', why: 'The chorus mixes in slightly delayed copies of the sound with the delay swept up and down, which thickens it and spreads it across the two outputs.\n- Chorus ON: puts it in the signal path. Off, both outputs are the same.\n- CHORUS I: the slow, gentle sweep. It widens the line without a wobble that would blur the rhythm.\n- Listen for: switch the chorus off and on while the arpeggio runs. On, the line opens out to both sides.', set: { 'fx.chorusOn': true, 'fx.chorus1': true } },
    ],
    context: {
      'arp.on': 'In this sound: turns held chords into a line. Switch it off and, in MONO, a held chord plays as a single note.',
      'arp.order': 'In this sound: UP/DOWN. Each press of STEP moves to the next order.',
      'arp.tempo': 'In this sound: the speed of the line.',
      'fenv.decay': 'In this sound: how long the bright part of each step lasts.',
    },
    tweaks: [
      { id: 'arp.hold', try: 'Switch HOLD on, play a chord and let go', hear: 'The arpeggio keeps going until you play a new chord.' },
      { id: 'arp.order', try: 'Step through the orders', hear: 'Up, down, up and down, random, two octaves, and the order you played the keys.' },
      { id: 'voice.mode', try: 'Switch to POLY', hear: 'Each arpeggio note now gets the next oscillator in turn, so only one of them sounds per step and the line thins out.' },
    ],
  },
  {
    id: 'pd-fifth-stab', name: 'One-Finger Chord Stab', ref: 'In the style of early Detroit techno chord stabs', artist: 'Classic technique',
    tags: ['keys', 'techno', 'stab'], level: 2,
    blurb: 'A whole minor chord from one key, with a short, hollow stab.',
    how: 'In MONO all four oscillators play the key you press, so tuning them apart with their FREQUENCY knobs gives a chord on one finger: root, minor third, fifth and an octave. A short contour and a little emphasis make the stab.',
    phrase: { bpm: 124, loop: true, steps: [[0, 60, 0.2], [0.75, 60, 0.2], [1.5, 63, 0.2], [2.5, 58, 0.2], [3, 60, 0.2], [3.5, 58, 0.2]] },
    steps: [
      { title: 'Tune the oscillators into a chord', module: 'osc', why: 'MONO puts all four oscillators (the parts that make the raw tone) on the key you press, so tuning them apart turns one finger into a chord: root, minor third, fifth and octave.\n- MODE MONO: every oscillator plays the one key.\n- RANGE 8’ on 1–3, 4’ on osc 4: footage comes from organ pipes; 8’ is normal pitch, 4’ an octave up for the top of the chord.\n- WAVEFORM saw on 1–3, square on 4: bright chord tones with a hollower top note.\n- FREQUENCY +3 on osc 2: three semitones, a minor third. At 4 the chord turns major.\n- FREQUENCY +7 on osc 3: seven semitones, a fifth.\n- Osc 4 FREQUENCY 0: the octave stays exact.\n- Listen for: one key now plays a minor chord. Play a line and every note is its own minor chord, the Detroit stab trick.',
        set: { 'voice.mode': 'mono', 'osc1.range': '8', 'osc2.range': '8', 'osc3.range': '8', 'osc4.range': '4', 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc3.wave': 'saw', 'osc4.wave': 'sq', 'osc2.freq': 3, 'osc3.freq': 7, 'osc4.freq': 0 } },
      { title: 'Mix', module: 'mixer', why: 'The mixer sets how loud each oscillator, here each note of the chord, goes into the filter.\n- OSC 1–4 on: all four chord tones in.\n- VOLUME 6 / 6 / 6 / 4.5: root, third and fifth even, the octave a little quieter so the top of the chord does not stick out.\n- Listen for: switch OSC 2 off and on. Without the third the chord goes open and neutral; with it, it is clearly minor.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': true, 'mix.osc1': 6, 'mix.osc2': 6, 'mix.osc3': 6, 'mix.osc4': 4.5 } },
      { title: 'Stab filter', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. A short contour (Moog’s word for envelope) opens it for an instant on each stab.\n- CUTOFF −1.8 (about 180 Hz): dark at rest.\n- EMPHASIS 3.5: Moog’s word for resonance, a boost at the cutoff. Gives the stab its hollow, slightly nasal ring.\n- AMOUNT OF CONTOUR 4.5, DECAY 220 ms: with ATTACK at 1 ms and SUSTAIN 0, a bright flash that closes fully in about a fifth of a second.\n- KEYBOARD CONTROL 1 and 2 on: full key tracking, so stabs higher up stay as bright as low ones.\n- Listen for: a short “dunk” of brightness on each key. Sweep DECAY to lengthen or shorten the flash.',
        set: { 'filter.cutoff': -1.8, 'filter.emphasis': 3.5, 'filter.contour': 4.5, 'fenv.attack': 0, 'fenv.decay': 2.2, 'fenv.sustain': 0, 'filter.kbd1': true, 'filter.kbd2': true } },
      { title: 'Short notes', module: 'amp', why: 'The loudness contour shapes the volume, the job a VCA (voltage-controlled amplifier) does on other synths. For a stab, every hit should be the same short length.\n- ATTACK 0 (1 ms): instant start.\n- DECAY 310 ms, SUSTAIN 0: the volume falls to nothing even if the key is held, so every stab is the same length.\n- DECAY switch off: letting go early cuts the note dead instead of fading.\n- Listen for: hold a key and it still dies away. Short, even stabs whatever you do with your fingers.', set: { 'aenv.attack': 0, 'aenv.decay': 2.8, 'aenv.sustain': 0, 'env.decay': false } },
      { title: 'Chorus', module: 'fx', why: 'The chorus mixes in delayed copies of the sound with the delay swept up and down, which thickens the stab and spreads it across the two outputs.\n- Chorus ON with CHORUS I: the slow, gentle setting, for width without a wobble.\n- Listen for: the stabs widen out across the speakers. Switch the chorus off to hear them snap back to the centre.', set: { 'fx.chorusOn': true, 'fx.chorus1': true } },
    ],
    context: {
      'osc2.freq': 'In this sound: the minor third. At 4 the chord turns major.',
      'osc3.freq': 'In this sound: the fifth.',
      'voice.mode': 'In this sound: MONO, so one key plays all four oscillators and the tuning becomes a chord.',
    },
    tweaks: [
      { id: 'osc2.freq', try: 'Set to 4', hear: 'A major chord instead of minor.' },
      { id: 'fenv.decay', try: 'Turn slowly from 1.5 to 5 while it plays', hear: 'The stabs open up from ticks to full chords.' },
      { id: 'voice.mode', try: 'Try POLY', hear: 'The chord falls apart: each key now gets one oscillator, so successive notes step through root, third, fifth and octave.' },
    ],
  },
  {
    id: 'pd-round-robin', name: 'Rotating Oscillators', ref: 'The POLY mode’s oscillator rotation, used as an effect', artist: 'Classic technique',
    tags: ['seq', 'poly', 'experimental'], level: 3,
    blurb: 'Each new note lands on the next oscillator, so a plain line changes colour note by note.',
    how: 'In POLY every new key takes the next oscillator in turn. Set the four differently and a single-note line cycles through four timbres and pitches: here a sawtooth, a square an octave up, a triangle a fifth up and a narrow pulse. The OSCILLATOR lamps show which one each note lands on.',
    phrase: { bpm: 118, loop: true, steps: [[0, 48, 0.4], [0.5, 48, 0.4], [1, 51, 0.4], [1.5, 48, 0.4], [2, 55, 0.4], [2.5, 48, 0.4], [3, 53, 0.4], [3.5, 51, 0.4]] },
    steps: [
      { title: 'Four different oscillators', module: 'osc', why: 'In POLY every new key takes the next oscillator in turn, even when you play one note at a time. Set the four differently and a plain single-note line changes colour and pitch on every note.\n- MODE POLY: the rotation is what makes this sound work. In MONO every note plays all four at once.\n- Osc 1 RANGE 8’, sawtooth: the bright, buzzy note.\n- Osc 2 RANGE 4’, square: an octave up (4’ is half the organ-pipe length of 8’), hollow.\n- Osc 3 RANGE 8’, triangle, FREQUENCY +7: soft, and a fifth above what you play.\n- Osc 4 RANGE 8’, narrow pulse: thin and nasal.\n- FREQUENCY 0 on osc 2 and 4: in tune with the key.\n- Listen for: play one key over and over and watch the four OSCILLATOR lamps take turns. Every fourth note jumps up a fifth.',
        set: { 'voice.mode': 'poly', 'osc1.range': '8', 'osc1.wave': 'saw', 'osc2.range': '4', 'osc2.wave': 'sq', 'osc2.freq': 0, 'osc3.range': '8', 'osc3.wave': 'tri', 'osc3.freq': 7, 'osc4.range': '8', 'osc4.wave': 'narrow', 'osc4.freq': 0 } },
      { title: 'All four on', module: 'mixer', why: 'The mixer sets how loud each oscillator goes into the filter. In POLY a key that lands on a switched-off oscillator plays nothing, so all four must be on.\n- OSC 1–4 on: switch OSC 2 off and every note that lands on it goes silent, leaving gaps in the line.\n- VOLUME 6.5 / 5 / 7.5 / 6: balanced by ear. The square is turned down because it is loud, and the triangle up because it is quiet.\n- Listen for: repeat one key. The four notes should be about equally loud even though they sound different.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc4On': true, 'mix.osc1': 6.5, 'mix.osc2': 5, 'mix.osc3': 7.5, 'mix.osc4': 6 } },
      { title: 'Plucky filter and loudness', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. The filter and loudness contours (Moog’s word for envelopes) are both short, so each note is a separate blip.\n- CUTOFF −0.6 (about 420 Hz), EMPHASIS 3: fairly dark, with a little resonance (Moog calls it emphasis) for bite.\n- AMOUNT OF CONTOUR 4, DECAY 280 ms: with ATTACK at 1 ms and SUSTAIN 1.5, a quick bright pop at the start of each note.\n- Loudness DECAY 310 ms, SUSTAIN 2: with ATTACK at 1 ms, each note drops fast to a low level.\n- DECAY switch on: notes fade briefly on release instead of stopping dead.\n- Listen for: a line of short blips, each a different colour. Raise loudness SUSTAIN to hear them run together.',
        set: { 'filter.cutoff': -0.6, 'filter.emphasis': 3, 'filter.contour': 4, 'fenv.attack': 0, 'fenv.decay': 2.6, 'fenv.sustain': 1.5, 'aenv.attack': 0, 'aenv.decay': 2.8, 'aenv.sustain': 2, 'env.decay': true } },
      { title: 'Chorus', module: 'fx', why: 'The chorus mixes in delayed copies of the sound with the delay swept up and down, which widens it and spreads it across the two outputs.\n- Chorus ON with CHORUS I: the slow, gentle sweep, for width without blurring the individual blips.\n- Listen for: the line spreads out across the stereo field. Switch the chorus off and it sits in the middle again.', set: { 'fx.chorusOn': true, 'fx.chorus1': true } },
    ],
    context: {
      'voice.mode': 'In this sound: POLY. Each note takes the next oscillator, which is what makes the line change. In MONO every note plays all four at once.',
      'osc3.freq': 'In this sound: every fourth note is shifted up a fifth by this knob.',
      'mix.osc2On': 'In this sound: switch it off and every note that lands on Oscillator 2 goes silent, leaving gaps in the line.',
    },
    tweaks: [
      { id: 'mix.osc2On', try: 'Switch Oscillator 2 off', hear: 'Gaps: the notes that land on it play nothing.' },
      { id: 'osc4.range', try: 'Set Oscillator 4 to 16’', hear: 'Every fourth note drops an octave.' },
      { id: 'voice.mode', try: 'Switch to UNI', hear: 'All four oscillators play every note: one thick, fixed timbre.' },
    ],
  },
  {
    id: 'pd-noise-surf', name: 'Pink Noise Surf', ref: 'In the style of 70s film and TV atmospheres', artist: 'Classic technique',
    tags: ['fx', 'noise', 'ambient'], level: 1,
    blurb: 'No oscillators at all: filtered pink noise that swells like waves.',
    how: 'Noise contains every frequency at once, and a resonant filter picks out a band of it. Long attack and decay make each held note swell and break like a wave, and the chorus spreads it across the two outputs.',
    phrase: { bpm: 40, loop: true, steps: [[0, 60, 3.5], [4, 60, 3.5]] },
    steps: [
      { title: 'Noise only', module: 'mixer', why: 'No oscillators at all: the whole sound is noise, which contains every frequency at once. The filter will later pick a band out of it. Pink noise is the natural starting point for surf and wind.\n- OSC 1–4 off: none of the tone-makers reaches the filter.\n- Noise ON, NOISE VOLUME 8: plenty of noise into the filter.\n- Noise WHITE/PINK to PINK: pink has less top end than white, so it sounds deeper and more natural, like wind or surf.\n- MODE MONO: one voice for a single sound.\n- Listen for: hold a key and hear a steady hiss. Every key sounds the same, since noise has no pitch. Flip to WHITE to hear it get brighter and thinner.',
        set: { 'mix.osc1On': false, 'mix.osc2On': false, 'mix.osc3On': false, 'mix.osc4On': false, 'mix.noiseOn': true, 'mix.noise': 8, 'noise.colour': 'pink', 'voice.mode': 'mono' } },
      { title: 'Resonant filter with a slow contour', module: 'filter', why: 'The filter is a Moog-style low-pass ladder: it keeps the lows and cuts the highs. With emphasis it rings at the cutoff and gives the noise a hint of pitch. A slow contour (Moog’s word for envelope) brightens each wave as it rises.\n- CUTOFF −1.5 (about 220 Hz): dark, a low roar.\n- EMPHASIS 5: Moog’s word for resonance. Here it is how whistly the surf is: lower for rain, higher for wind.\n- AMOUNT OF CONTOUR 4: how bright each wave gets at its crest.\n- ATTACK 1.4 s, DECAY 1.6 s, SUSTAIN 3: the filter takes over a second to open, then falls back.\n- Listen for: hold a key. The roar brightens over a second or so, then settles darker. Sweep EMPHASIS to hear the whistle come in.',
        set: { 'filter.cutoff': -1.5, 'filter.emphasis': 5, 'filter.contour': 4, 'fenv.attack': 6.4, 'fenv.decay': 6.6, 'fenv.sustain': 3 } },
      { title: 'Slow swell', module: 'amp', why: 'The loudness contour shapes the volume, the job a VCA (voltage-controlled amplifier) does on other synths. Long times let each held key swell and break like a wave.\n- ATTACK 1.4 s: each wave fades in slowly.\n- DECAY 2.2 s, SUSTAIN 6: after the peak it falls back to a lower level, the wave breaking.\n- DECAY switch on: with it on, DECAY is also the fade after you let go, so each wave washes out over about two seconds.\n- Listen for: hold a key for a few seconds, then let go. Swell, break, then a long wash out.', set: { 'aenv.attack': 6.4, 'aenv.decay': 7, 'aenv.sustain': 6, 'env.decay': true } },
      { title: 'Chorus', module: 'fx', why: 'The chorus mixes in delayed copies of the sound with the delay swept up and down, which spreads it across the two outputs.\n- Chorus ON with CHORUS II: the faster, deeper sweep. On noise it adds slow swirling movement and width.\n- Listen for: on headphones, the surf moves around rather than sitting in the middle. Switch the chorus off to hear it collapse to a flat centre.', set: { 'fx.chorusOn': true, 'fx.chorus2': true } },
    ],
    context: {
      'filter.emphasis': 'In this sound: how whistly the surf is. Lower for rain, higher for wind.',
      'noise.colour': 'In this sound: pink is deeper and more natural than white.',
    },
    tweaks: [
      { id: 'filter.emphasis', try: 'Raise to 8', hear: 'The surf turns into howling wind.' },
      { id: 'noise.colour', try: 'Switch to WHITE', hear: 'Brighter, more like steam or a hiss.' },
      { id: 'mod.toFilter', try: 'Switch on, set LFO RATE to 1.5 and push the mod wheel', hear: 'The LFO rolls the cutoff up and down as well.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'poly-d', name: 'Poly D', maker: 'Behringer', year: 2019,
  heritage: 'A four-oscillator Minimoog Model D, with chords',
  summary: 'Four oscillators and noise feed a mixer, then one 24 dB ladder filter and one amplifier, then distortion and a stereo chorus. In POLY each key takes an oscillator of its own, so it plays four-note chords through the shared filter and contours.',
  view: { w: 2238, h: 540 },
  theme: { panel: PANEL, panel2: '#121314', ink: INK, font: 'din', cheeks: 'wood', cheekW: 40 },
  signalNames: { env1: 'the filter contour', env2: 'the loudness contour', osc4: 'Oscillator 4', mixer: 'the mixer output (oscillators and noise)' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
