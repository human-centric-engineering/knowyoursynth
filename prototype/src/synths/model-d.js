// Behringer Model D — SynthDef. Coordinates are in the pixel space of the 2000×780 panel photo.
import { annotate, clamp, expMap, pwl, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/model-d.js';
import lineage from '@/synths/lineage/model-d.js';
import unusual from '@/synths/unusual/model-d.js';

// Contour time scale as printed on the panel: 10 M-SEC · 200 · 600 · 1 SEC · 5 · 10
const ENV_PTS = [[0, 0.003], [2, 0.2], [4, 0.6], [6, 1], [8, 5], [10, 10]];
const envTime = (v) => pwl(v, ENV_PTS, true);
const ENV_SCALE = {
  ticks: 11,
  labels: [
    { at: 0, text: '10' }, { at: 2, text: '200' }, { at: 4, text: '600' },
    { at: 6, text: '1' }, { at: 8, text: '5' }, { at: 10, text: '10' },
  ],
};
const S10 = { nums: [0, 2, 4, 6, 8, 10], ticks: 11 };
const cutoffHz = (v) => expMap((v + 5) / 10, 20, 20000);
const lfoHz = (v) => expMap(v / 10, 0.05, 200);

const RANGES = [
  { v: 'lo', label: 'LO', a: -100 }, { v: '32', label: "32'", a: -60 }, { v: '16', label: "16'", a: -20 },
  { v: '8', label: "8'", a: 20 }, { v: '4', label: "4'", a: 60 }, { v: '2', label: "2'", a: 100 },
];
const RANGE_SEMI = { lo: -72, 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };
const wavePositions = (third) =>
  ['tri', third, 'saw', 'sq', 'wide', 'narrow'].map((v, i) => ({ v, label: '', a: -100 + i * 40 }));
const WAVE_MIX = {
  tri: { mix: { tri: 1 }, pw: 0.5 }, shark: { mix: { shark: 1 }, pw: 0.5 }, rsaw: { mix: { rsaw: 1 }, pw: 0.5 },
  saw: { mix: { saw: 1 }, pw: 0.5 }, sq: { mix: { pulse: 1 }, pw: 0.5 },
  wide: { mix: { pulse: 1 }, pw: 0.3 }, narrow: { mix: { pulse: 1 }, pw: 0.14 },
};

const OSC_Y = [215, 378, 541];
const controls = [];
const decor = [];
const jacks = [];
const knob = (id, x, y, r, style, rest) => controls.push({ id, type: 'knob', x, y, r, style, ...rest });
const text = (x, y, t, size = 17, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });

// ── Frames ────────────────────────────────────────────────────────────────
decor.push(
  { t: 'frame', x: 55, y: 22, w: 325, h: 133, r: 12, labelAt: 'none' },
  { t: 'frame', x: 55, y: 167, w: 325, h: 523, r: 12, label: 'CONTROLLERS', labelAt: 'inside-bottom', labelSize: 25 },
  { t: 'frame', x: 390, y: 22, w: 460, h: 668, r: 12, label: 'OSCILLATOR BANK', labelAt: 'inside-bottom', labelSize: 25 },
  { t: 'frame', x: 860, y: 22, w: 388, h: 668, r: 12, label: 'MIXER', labelAt: 'inside-bottom', labelSize: 25 },
  { t: 'frame', x: 1350, y: 22, w: 365, h: 668, r: 12, label: 'MODIFIERS', labelAt: 'inside-bottom', labelSize: 25 },
  { t: 'frame', x: 1722, y: 22, w: 223, h: 668, r: 12, label: 'OUTPUT', labelAt: 'inside-bottom', labelSize: 25 },
  { t: 'path', d: 'M1350 444 H1715', w: 2 },
);
[[70, 12], [640, 12], [1230, 12], [1930, 12], [70, 702], [740, 702], [1230, 702], [1930, 702]].forEach(([x, y]) =>
  decor.push({ t: 'screw', x, y, r: 8 }));

// ── MIDI ──────────────────────────────────────────────────────────────────
decor.push({ t: 'usb', x: 105, y: 108, w: 62, h: 52 }, { t: 'din', x: 215, y: 105, r: 42 }, { t: 'din', x: 330, y: 105, r: 42 });
text(215, 52, 'MIDI IN', 17);
text(330, 52, 'MIDI THRU', 17);

// ── Controllers ───────────────────────────────────────────────────────────
knob('ctl.tune', 215, 250, 40, 'd-silver', {
  kind: 'cont', min: -2.5, max: 2.5, def: 0, label: 'TUNE', labelPos: 'top', labelGap: -14, module: 'osc',
  scale: { nums: [-2, -1, 1, 2], ticks: 11 }, fmt: fmtSemi,
  help: 'Master tuning for all three oscillators, roughly two semitones either way.',
});
knob('ctl.glide', 132, 378, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'GLIDE', labelPos: 'top', module: 'glide', scale: S10,
  fmt: (v) => (v === 0 ? 'off' : fmtTime(Math.pow(v / 10, 2) * 2)),
  help: 'Portamento. At 0 the pitch jumps between notes; turn it up and the pitch slides from one note to the next.',
});
knob('mod.mix', 298, 378, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 10, label: 'MOD MIX', labelPos: 'top', module: 'mod', scale: S10,
  help: 'Crossfades the two modulation sources. Fully left is the left switch’s source (OSC 3 or filter EG); fully right is the right switch’s source (noise or LFO).',
});
text(250, 434, 'OSC 3/\nFILTER EG', 11);
text(348, 434, 'NOISE/\nLFO', 11);
controls.push({
  id: 'mod.srcA', type: 'slide', orient: 'h', x: 132, y: 468, w: 82, h: 40, kind: 'enum', module: 'mod',
  options: [{ v: 'osc3', label: 'OSC 3' }, { v: 'eg', label: 'FILTER EG' }], def: 'osc3', label: 'Mod source A', labelPos: 'none',
  help: 'First modulation source: Oscillator 3 (use it as a second LFO, or at audio rate for clangy FM) or the filter envelope.',
}, {
  id: 'mod.srcB', type: 'slide', orient: 'h', x: 298, y: 468, w: 82, h: 40, kind: 'enum', module: 'mod',
  options: [{ v: 'noise', label: 'NOISE' }, { v: 'lfo', label: 'LFO' }], def: 'lfo', label: 'Mod source B', labelPos: 'none',
  help: 'Second modulation source: noise (random wobble, or whatever is patched into MOD SOURCE) or the dedicated LFO.',
});
text(96, 505, 'OSC 3', 12);
text(172, 505, 'FILTER EG', 12);
text(262, 505, 'NOISE (MOD SRC)', 12);
text(340, 505, 'LFO', 12);
knob('mod.depth', 132, 588, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'MOD DEPTH', labelPos: 'top', module: 'mod', scale: S10,
  help: 'How much of the mixed modulation signal reaches the oscillators and filter. The mod wheel adds to this.',
});
knob('lfo.rate', 298, 588, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 4.5, label: 'LFO RATE', labelPos: 'top', module: 'lfo', scale: S10,
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 20 seconds up to 200 Hz (well into audio rate).',
});
controls.push({
  id: 'lfo.shape', type: 'slide', orient: 'v', x: 215, y: 588, w: 40, h: 80, kind: 'enum', module: 'lfo',
  options: [{ v: 'sq', label: 'Square' }, { v: 'tri', label: 'Triangle' }], def: 'tri', label: 'LFO wave shape', labelPos: 'none',
  help: 'LFO shape sent to the mod bus. Triangle gives a smooth wobble (vibrato); square jumps between two values (trills).',
});
decor.push({ t: 'wave', x: 215, y: 537, size: 13, shape: 'sq' }, { t: 'wave', x: 215, y: 640, size: 13, shape: 'tri' });
controls.push({
  id: 'mod.toOsc', type: 'rocker', color: 'blue', x: 385, y: 255, w: 80, h: 42, kind: 'bool', def: false, module: 'mod',
  label: 'OSCILLATOR\nMODULATION', labelPos: 'top', labelSize: 12,
  help: 'Sends the mod bus to oscillator pitch: vibrato from the LFO, pitch sweeps from the filter EG, or growl from OSC 3.',
}, {
  id: 'osc3.kbd', type: 'rocker', color: 'blue', orient: 'v', x: 418, y: 545, w: 42, h: 80, kind: 'bool', def: true, module: 'osc',
  label: 'OSC 3\nCONTROL', labelPos: 'top', labelSize: 12,
  help: 'On: Oscillator 3 follows the keyboard like the others. Off: it runs at a fixed pitch, which is what you want when using it as a modulator.',
});
text(423, 290, 'ON', 12);

// ── Oscillator bank ───────────────────────────────────────────────────────
text(513, 138, 'RANGE', 17);
text(647, 138, 'OSCILLATOR-1\nFREQUENCY', 17);
text(780, 138, 'WAVEFORM', 17);
text(647, 300, 'OSCILLATOR-2', 17);
text(647, 463, 'OSCILLATOR-3', 17);
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  knob(`osc${n}.range`, 513, y, 38, 'd-chicken', {
    kind: 'enum', options: RANGES, def: n === 1 ? '8' : n === 2 ? '8' : '16', label: `Osc ${n} range`, labelPos: 'none', module: 'osc',
    help: 'Octave of the oscillator in organ-pipe feet: 32’ is lowest, 2’ highest. LO drops it below hearing so it clicks or acts as an LFO.',
  });
  knob(`osc${n}.wave`, 780, y, 38, 'd-chicken', {
    kind: 'enum', options: wavePositions(n === 3 ? 'rsaw' : 'shark'), def: 'saw', label: `Osc ${n} waveform`, labelPos: 'none', module: 'osc',
    help: 'Raw tone of the oscillator. Triangle is soft and flute-like, sawtooth is bright and brassy, square is hollow, and the pulses get thinner and more nasal as they narrow.',
  });
  ['tri', n === 3 ? 'rsaw' : 'shark', 'saw', 'sq', 'pulse', 'npulse'].forEach((shape, i) => {
    const a = ((-100 + i * 40) * Math.PI) / 180;
    decor.push({ t: 'wave', x: 780 + Math.sin(a) * 66, y: y - Math.cos(a) * 62, size: 11, shape });
  });
  if (n > 1) {
    knob(`osc${n}.freq`, 647, y, 40, 'd-silver', {
      kind: 'cont', min: -7.5, max: 7.5, def: 0, label: `Osc ${n} frequency`, labelPos: 'none', module: 'osc',
      scale: { nums: [-7, -5, -3, -1, 1, 3, 5, 7], ticks: 15 }, fmt: fmtSemi,
      help: n === 2
        ? 'Detunes Oscillator 2 against Oscillator 1, up to a fifth either way. A tiny offset makes the two beat against each other and sound fatter.'
        : 'Detunes Oscillator 3. With OSC 3 CONTROL off this becomes the rate control for Oscillator 3 as a modulator.',
    });
  }
});

// ── Mixer ─────────────────────────────────────────────────────────────────
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  knob(`mix.osc${n}`, 915, y, 30, 'd-silver', {
    kind: 'cont', min: 0, max: 10, def: n === 1 ? 8 : 0, label: 'VOLUME', labelPos: 'top', module: 'mixer', scale: S10,
    help: `Level of Oscillator ${n} going into the filter. Past about 7 the mixer starts to overdrive the filter, which is a big part of the fat Model D tone.`,
  });
  controls.push({
    id: `mix.osc${n}On`, type: 'rocker', color: 'red', x: 1022, y, w: 80, h: 42, kind: 'bool', def: n === 1, module: 'mixer',
    label: `Osc ${n} on`, labelPos: 'none', help: `Connects Oscillator ${n} to the mixer. Switch it off when the oscillator is only being used as a modulator.`,
  });
  text(1056, y + 38, 'ON', 12);
});
controls.push({
  id: 'mix.extOn', type: 'rocker', color: 'red', x: 1022, y: 297, w: 80, h: 42, kind: 'bool', def: false, module: 'mixer',
  label: 'External input on', labelPos: 'none',
  help: 'Connects the external input. With nothing plugged into EXT, this channel carries the synth’s own output fed back into the mixer — a built-in overdrive.',
}, {
  id: 'mix.noiseOn', type: 'rocker', color: 'red', x: 1022, y: 460, w: 80, h: 42, kind: 'bool', def: false, module: 'mixer',
  label: 'Noise on', labelPos: 'none', help: 'Connects the noise generator to the mixer.',
});
text(1056, 335, 'ON', 12);
text(1056, 498, 'ON', 12);
knob('mix.ext', 1132, 297, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'EXT IN\nVOLUME', labelPos: 'top', module: 'mixer', scale: S10,
  help: 'Level of the external input. With no cable in EXT it sets how much of the output is fed back into the mixer: a little thickens the sound, a lot distorts it.',
});
knob('mix.noise', 1132, 460, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'NOISE\nVOLUME', labelPos: 'top', module: 'mixer', scale: S10,
  help: 'Level of noise into the filter. Use a little for breath and grit, or on its own for wind, surf and percussion.',
});
controls.push({
  id: 'noise.colour', type: 'rocker', color: 'red', orient: 'v', x: 1215, y: 460, w: 42, h: 80, kind: 'enum', module: 'mixer',
  options: [{ v: 'white', label: 'WHITE' }, { v: 'pink', label: 'PINK' }], def: 'white', label: 'Noise colour', labelPos: 'none',
  help: 'White noise is bright and hissy. Pink noise has less top end and sounds deeper, more like wind or surf.',
});
text(1215, 412, 'WHITE', 12);
text(1215, 516, 'PINK', 12);
text(1215, 282, 'OVERLOAD', 12);
decor.push({ t: 'led', x: 1215, y: 298, r: 6, color: 'red', litWhen: 'overload' });
decor.push({ t: 'logo', x: 1052, y: 92, size: 74, style: 'outline-d' });
text(1172, 126, 'AUDIO', 12);
decor.push({ t: 'path', d: 'M1137 118 V178 M1131 170 L1137 180 L1143 170', w: 1.5 });

// ── Switch column between mixer and modifiers ────────────────────────────
const colSwitch = (id, y, color, kind, rest) =>
  controls.push({ id, type: 'rocker', color, x: 1299, y, w: 80, h: 42, kind, module: 'filter', labelPos: 'none', ...rest });
colSwitch('filter.mode', 133, 'blue', 'enum', {
  options: [{ v: 'lp', label: 'LO' }, { v: 'hp', label: 'HI' }], def: 'lp', label: 'Filter mode',
  help: 'LO is the classic low-pass: it removes brightness above the cutoff. HI is high-pass: it removes bass below the cutoff, for thin, reedy tones.',
});
colSwitch('mod.toFilter', 215, 'blue', 'bool', {
  def: false, module: 'mod', label: 'Filter modulation',
  help: 'Sends the mod bus to the filter cutoff: wah-style sweeps from the LFO, or a rasp when OSC 3 modulates at audio rate.',
});
colSwitch('filter.kbd1', 297, 'blue', 'bool', {
  def: false, label: 'Keyboard control 1',
  help: 'Adds one third keyboard tracking: higher notes open the filter a little so they do not sound duller than low notes.',
});
colSwitch('filter.kbd2', 378, 'blue', 'bool', {
  def: false, label: 'Keyboard control 2',
  help: 'Adds two thirds keyboard tracking. Switch both on for full tracking, where the cutoff follows the notes exactly.',
});
colSwitch('env.filterDecay', 460, 'white', 'bool', {
  def: true, module: 'env', label: 'Filter decay',
  help: 'On: after you release a key the filter closes over the DECAY time. Off: it snaps shut at once.',
});
colSwitch('env.loudDecay', 541, 'white', 'bool', {
  def: true, module: 'env', label: 'Loudness decay',
  help: 'On: after you release a key the note fades over the DECAY time. Off: the note stops dead.',
});
text(1299, 102, 'FILTER MODE', 11);
text(1270, 170, 'LO', 11);
text(1330, 170, 'HI', 11);
text(1299, 186, 'FILTER MODULATION', 10.5);
text(1333, 251, 'ON', 11);
text(1299, 342, 'KEYBOARD CONTROL', 10.5);
text(1262, 270, '1', 11);
text(1262, 415, '2', 11);
text(1333, 415, 'ON', 11);
text(1299, 432, 'FILTER DECAY', 11);
text(1333, 496, 'ON', 11);
text(1299, 513, 'LOUD DECAY', 11);
text(1333, 578, 'ON', 11);

// ── Modifiers ─────────────────────────────────────────────────────────────
text(1532, 128, 'FILTER', 21);
knob('filter.cutoff', 1410, 215, 30, 'd-silver', {
  kind: 'cont', min: -5, max: 5, def: 1, label: 'CUTOFF\nFREQUENCY', labelPos: 'top', module: 'filter',
  scale: { nums: [-4, -2, 0, 2, 4], ticks: 11 }, fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter starts cutting. Turn left and the low-pass removes more brightness until only a dull thud is left; turn right and the full buzz of the oscillators comes through.',
});
knob('filter.emphasis', 1532, 215, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'EMPHASIS', labelPos: 'top', module: 'filter', scale: S10,
  help: 'Resonance: boosts a narrow band right at the cutoff so sweeps sound vocal and squelchy. Near maximum the filter whistles on its own.',
});
knob('filter.contour', 1655, 215, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'AMOUNT\nOF CONTOUR', labelPos: 'top', module: 'filter', scale: S10,
  help: 'How far the filter envelope pushes the cutoff above its resting position each time you play a note.',
});
const envKnob = (id, x, y, label, isTime, help, def) =>
  knob(id, x, y, 30, 'd-silver', {
    kind: 'cont', min: 0, max: 10, def, label, labelPos: 'top', module: 'env',
    scale: isTime ? ENV_SCALE : S10, fmt: isTime ? (v) => fmtTime(envTime(v)) : undefined, help,
  });
envKnob('fenv.attack', 1410, 378, 'ATTACK', true, 'How long the filter takes to open after a key is pressed. Short for plucks and basses, long for slow brassy swells.', 0);
envKnob('fenv.decay', 1532, 378, 'DECAY', true, 'How long the filter takes to fall back from its peak to the sustain level. This sets the length of the "wow" at the start of each note.', 4);
envKnob('fenv.sustain', 1655, 378, 'SUSTAIN', false, 'Where the filter settles while the key is held, as a share of the contour amount.', 4);
text(1532, 466, 'LOUDNESS CONTOUR', 19);
envKnob('aenv.attack', 1410, 541, 'ATTACK', true, 'How quickly the note reaches full volume. Near zero it clicks in instantly; higher values fade the note in.', 0);
envKnob('aenv.decay', 1532, 541, 'DECAY', true, 'How long the volume takes to fall to the sustain level, and (with LOUD DECAY on) how long the note rings after release.', 3.5);
envKnob('aenv.sustain', 1655, 541, 'SUSTAIN', false, 'Volume while a key is held. At 10 the note holds at full level; at 0 it dies away even if you keep holding.', 10);
[[1410, 378], [1532, 378], [1410, 541], [1532, 541]].forEach(([x, y]) => {
  text(x - 36, y + 58, 'M-SEC', 10);
  text(x + 34, y + 58, 'SEC', 10);
});

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1778, 215, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 7, label: 'VOLUME', labelPos: 'top', module: 'out', scale: S10,
  help: 'Main output level. It also sets how hard the feedback path is driven when EXT IN is switched on with no cable.',
});
controls.push({
  id: 'out.mainOn', type: 'rocker', color: 'red', x: 1887, y: 215, w: 80, h: 42, kind: 'bool', def: true, module: 'out',
  label: 'MAIN OUT', labelPos: 'top', labelSize: 17, help: 'Switches the main output on or off.',
}, {
  id: 'out.a440', type: 'rocker', color: 'red', x: 1778, y: 378, w: 80, h: 42, kind: 'bool', def: false, module: 'out',
  label: 'A-440', labelPos: 'top', labelSize: 13, help: 'Sounds a steady 440 Hz reference tone so you can tune the oscillators by ear.',
});
text(1920, 251, 'ON', 12);
text(1812, 414, 'ON', 12);
text(1778, 282, 'POWER', 12);
decor.push({ t: 'led', x: 1778, y: 298, r: 6, color: 'red', litWhen: 'power' });
decor.push({ t: 'logo', x: 1887, y: 372, size: 17, text: 'behringer', style: 'behringer' });
knob('out.phones', 1778, 541, 30, 'd-silver', {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'VOLUME', labelPos: 'top', module: 'out', scale: S10,
  help: 'Headphone level on the hardware. It has no effect in this app.',
});

// ── Jacks ─────────────────────────────────────────────────────────────────
const jack = (id, x, y, label, dir, rest) => jacks.push({ id, x, y, r: 17, label, labelPos: 'top', dir, ...rest });
jack('j.modSrc', 513, 92, 'MOD SOURCE', 'in', {
  dest: 'multIn', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of noise as the right-hand source of the mod bus. From there MOD MIX, MOD DEPTH (plus the mod wheel) and the OSCILLATOR and FILTER MODULATION switches decide how much of it reaches the pitch and the cutoff, exactly as they do for noise.`,
  check: (v) => (v['mod.srcB'] !== 'noise' ? 'Set the NOISE / LFO switch to NOISE. This jack takes the place of noise, so with the switch on LFO the cable is ignored.'
    : v['mod.mix'] <= 0 ? 'MOD MIX is fully left, which selects only the left-hand source. Turn it to the right to hear this cable.'
      : !v['mod.toOsc'] && !v['mod.toFilter'] ? 'Switch on OSCILLATOR MODULATION or FILTER MODULATION so the mod bus goes somewhere.'
        : v['mod.depth'] <= 0 ? 'MOD DEPTH is at 0. Turn it up, or push the mod wheel.' : null),
  help: 'Replaces noise as the second mod source. Patch anything in: an envelope, the square LFO, even audio.' });
jack('j.oscCv', 647, 92, 'OSC 1V/OCT', 'in', { dest: 'pitchAll', amt: 24, add: true, help: 'Pitch control voltage for the oscillators, added to the keyboard pitch.' });
jack('j.lfoCv', 780, 92, 'LFO CV', 'in', { dest: 'lfoRate', amt: 3, add: true, help: 'Voltage control of LFO rate. Patch an envelope in and the wobble speeds up over each note.' });
jack('j.lfoTri', 893, 92, 'LFO', 'out', { name: 'LFO (triangle)', signal: 'lfoTri', help: 'Triangle LFO, always available whatever the wave shape switch says.' });
jack('j.lfoSq', 965, 92, 'LFO', 'out', { name: 'LFO (square)', signal: 'lfoSq', help: 'Square LFO, always available whatever the wave shape switch says.' });
decor.push({ t: 'wave', x: 925, y: 50, size: 8, shape: 'tri' }, { t: 'wave', x: 997, y: 50, size: 8, shape: 'sq' });
jack('j.ext', 1137, 92, 'EXT', 'in', {
  dest: 'extIn', amt: 1,
  check: (v) => (!v['mix.extOn'] ? 'The external input is switched off in the mixer. Switch its rocker ON to hear this cable.' : v['mix.ext'] <= 0 ? 'EXT IN VOLUME is at 0. Turn it up to let this cable into the mixer.' : null),
  help: 'External audio into the mixer. Plugging in here breaks the internal output-to-mixer feedback loop.' });
jack('j.mix', 1208, 92, 'MIX', 'out', { signal: 'mixer', help: 'The mixer output before the filter: raw oscillators and noise.' });
jack('j.cutCv', 1388, 92, 'CUT CV', 'in', { dest: 'cutoff', amt: 5, add: true, help: 'Voltage control of filter cutoff, added to the knob.' });
jack('j.fcGate', 1460, 92, 'FC GATE', 'in', { dest: 'gate1', amt: 1, add: true, help: 'External gate for the filter contour. Patch the square LFO here and the filter re-triggers rhythmically while you hold a note.' });
jack('j.filtCont', 1532, 92, 'FILT CONT', 'out', { signal: 'env1', help: 'The filter contour (envelope) as a voltage, 0 to 4 V.' });
jack('j.lcGate', 1604, 92, 'LC GATE', 'in', { dest: 'gate2', amt: 1, add: true, help: 'External gate for the loudness contour.' });
jack('j.loudCont', 1676, 92, 'LOUD CONT', 'out', { signal: 'env2', help: 'The loudness contour (envelope) as a voltage.' });
jack('j.loudCv', 1778, 92, 'LOUD CV', 'in', { dest: 'amp', amt: 1, add: true, help: 'Voltage control of loudness. Patch the triangle LFO here for tremolo.' });
jack('j.main', 1887, 92, 'MAIN', 'out', { signal: 'out', help: 'Main audio output. Patch it back to EXT for the classic feedback trick with a cable.' });
text(1887, 128, 'AUDIO', 12);
jacks.push({ id: 'j.phones', x: 1887, y: 541, r: 17, label: 'PHONES', labelPos: 'top', dir: 'out', signal: 'out', help: 'Headphone output.' });

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas = [
  { id: 'midi', label: 'MIDI and USB', module: 'out', keywords: 'connect keyboard computer',
    rects: [{ x: 55, y: 22, w: 325, h: 133 }],
    help: 'Where a keyboard, sequencer or computer connects on the hardware. In this app the on-screen keyboard plays the synth instead.' },
  { id: 'controllers', label: 'Controllers', module: 'mod', keywords: 'tune glide portamento lfo vibrato modulation mod mix',
    rects: [{ x: 55, y: 167, w: 332, h: 523 }],
    help: 'Tuning, glide and the modulation setup. TUNE moves all three oscillators together and GLIDE makes the pitch slide between notes. MOD MIX blends two modulation sources, chosen by the switches under it, and the LFO’s rate and shape are set here. The OSCILLATOR MODULATION switch sends that modulation to pitch.' },
  { id: 'patch', label: 'Patch points', module: 'patch', keywords: 'jacks sockets cv gate semi-modular',
    rects: [{ x: 390, y: 30, w: 1555, h: 82 }],
    help: 'The sockets along the top. Inputs accept a control voltage or audio, from other gear or from this synth’s own outputs. Outputs send the LFO, the mixer and the two contours. Hover over a jack with Explain sections off to see what it does.' },
  { id: 'oscbank', label: 'Oscillator bank', module: 'osc', keywords: 'vco range waveform detune pitch',
    rects: [{ x: 388, y: 120, w: 462, h: 570 }],
    help: 'Three oscillators make the raw sound. RANGE sets each one’s octave and WAVEFORM its shape. Oscillators 2 and 3 have a FREQUENCY knob to detune them against Oscillator 1. With OSC 3 CONTROL off, Oscillator 3 stops following the keyboard so it can be used as a modulation source.' },
  { id: 'mixer', label: 'Mixer', module: 'mixer', keywords: 'volume level noise external input overload',
    rects: [{ x: 860, y: 120, w: 388, h: 570 }],
    help: 'Sets how loud each source is going into the filter: the three oscillators, the external input and noise. Each has its own on/off switch. High levels push the filter into a thicker, slightly overdriven tone.' },
  { id: 'switches', label: 'Filter and contour switches', module: 'filter', keywords: 'keyboard control tracking decay release filter mode high-pass',
    rects: [{ x: 1250, y: 112, w: 98, h: 478 }],
    help: 'The column of rocker switches between the mixer and the filter. From the top: filter mode (low-pass or high-pass), modulation to the filter, two keyboard-tracking switches that make higher notes brighter, and a decay switch for each contour that decides whether notes fade out or stop dead when you let go.' },
  { id: 'filter', label: 'Filter and filter contour', module: 'filter', keywords: 'cutoff emphasis resonance contour envelope ladder brightness',
    rects: [{ x: 1350, y: 120, w: 365, h: 324 }],
    help: 'CUTOFF FREQUENCY sets how bright the sound is and EMPHASIS adds resonance at the cutoff. AMOUNT OF CONTOUR sets how far the ATTACK, DECAY and SUSTAIN knobs below it sweep the cutoff on each note.' },
  { id: 'loudness', label: 'Loudness contour', module: 'env', keywords: 'envelope attack decay sustain volume amplifier',
    rects: [{ x: 1350, y: 444, w: 365, h: 246 }],
    help: 'Shapes the volume of each note. ATTACK is the fade-in and DECAY is the fall to the SUSTAIN level, which holds while the key is down. With the loudness decay switch on, DECAY is also the fade-out time after you let go.' },
  { id: 'output', label: 'Output', module: 'out', keywords: 'volume headphones phones tuning a440',
    rects: [{ x: 1722, y: 120, w: 223, h: 570 }],
    help: 'Main VOLUME and the MAIN OUT on/off switch, a separate headphone volume and socket, and A-440, a steady reference tone for tuning the oscillators by ear.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v, ctx) {
  const osc = [1, 2, 3].map((n) => {
    const kbd = n === 3 ? v['osc3.kbd'] : true;
    const det = n === 1 ? 0 : v[`osc${n}.freq`];
    return {
      level: v[`mix.osc${n}On`] ? level10(v[`mix.osc${n}`], 0.9) : 0,
      ...WAVE_MIX[v[`osc${n}.wave`]],
      semi: RANGE_SEMI[v[`osc${n}.range`]] + (kbd ? det : det * (36 / 7)) + (kbd ? v['ctl.tune'] : 0),
      kbd, fixedNote: 60, syncTo: -1,
    };
  });
  const m = v['mod.mix'] / 10;
  const depth = clamp(Math.pow(v['mod.depth'] / 10, 2) + (ctx.wheel || 0), 0, 1.2);
  const srcA = v['mod.srcA'] === 'osc3' ? 'osc3' : 'env1';
  const srcB = v['mod.srcB'] === 'lfo' ? 'lfo' : ctx.patched['j.modSrc'] ? 'mult' : 'noise';
  const routes = [];
  const bus = (dst, max) => {
    if ((1 - m) * depth > 0.0005) routes.push({ src: srcA, dst, amt: (1 - m) * depth * max });
    if (m * depth > 0.0005) routes.push({ src: srcB, dst, amt: m * depth * max });
  };
  if (v['mod.toOsc']) bus('pitchAll', 14);
  if (v['mod.toFilter']) bus('cutoff', 4.5);
  const fDecay = envTime(v['fenv.decay']);
  const aDecay = envTime(v['aenv.decay']);
  return {
    osc,
    noise: { level: v['mix.noiseOn'] ? level10(v['mix.noise'], 0.8) : 0, color: v['noise.colour'] },
    ext: { level: v['mix.extOn'] ? level10(v['mix.ext'], 1.6) * (0.4 + v['out.volume'] / 10) : 0 },
    filter: {
      type: 'ladder', mode: v['filter.mode'], cutoff: cutoffHz(v['filter.cutoff']), res: (v['filter.emphasis'] / 10) * 1.06,
      envAmt: (v['filter.contour'] / 10) * 8.5, envSrc: 'env1', kbd: (v['filter.kbd1'] ? 1 / 3 : 0) + (v['filter.kbd2'] ? 2 / 3 : 0),
    },
    env1: { a: envTime(v['fenv.attack']), d: fDecay, s: v['fenv.sustain'] / 10, r: v['env.filterDecay'] ? fDecay : 0.012 },
    env2: { a: envTime(v['aenv.attack']), d: aDecay, s: v['aenv.sustain'] / 10, r: v['env.loudDecay'] ? aDecay : 0.012 },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 }, keySync: false },
    glide: { time: Math.pow(v['ctl.glide'] / 10, 2) * 2, legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: false,
    routes,
    normals: { extIn: 'out' },
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0, a440: !!v['out.a440'],
    volume: v['out.mainOn'] ? level10(v['out.volume'], 1) : 0,
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'funk-bass', name: 'Rubber Funk Bass', ref: 'In the style of Parliament — "Flash Light"', artist: 'Bernie Worrell',
    tags: ['bass', 'funk', '70s'], level: 1,
    blurb: 'Fat, round synth bass with a quick "wow" on the front of every note.',
    how: 'Three sawtooth oscillators, two of them slightly detuned and one an octave down, make a thick raw tone. The filter starts almost closed, and a fast envelope flicks it open and shut on each note — that flick is the rubbery "bow" sound. A little resonance makes the flick more vocal.',
    phrase: { bpm: 104, loop: true, steps: [[0, 36, 0.4], [0.75, 36, 0.2], [1.5, 39, 0.4], [2, 41, 0.45], [2.75, 36, 0.2], [3.25, 43, 0.2], [3.5, 41, 0.4]] },
    steps: [
      { title: 'Stack three sawtooths', module: 'osc', why: 'The three VCOs (voltage-controlled oscillators, the parts that make the raw tone) are set up as a thick bass stack: two at the same octave and one an octave below for weight. Only Oscillator 1 is in the mixer so far, so it is the only one you hear.\n- RANGE 16’ on osc 1 and 2: footage comes from organ pipes, and 16’ is an octave below the 8’ you start on. That puts the note in bass territory.\n- RANGE 32’ on osc 3: another octave down, the sub layer. Once it is mixed in it adds weight you feel as much as hear.\n- WAVEFORM sawtooth on all three: a saw carries every harmonic, so it is the buzziest raw material and gives the filter plenty to sweep through later.\n- Listen for: play a low note and step Osc 1 RANGE between 8’ and 16’ to hear how much weight one octave adds.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'osc2.range': '16', 'osc2.wave': 'saw', 'osc3.range': '32', 'osc3.wave': 'saw' } },
      { title: 'Bring them up in the mixer and detune', module: 'mixer', why: 'The mixer sets how loud each oscillator is going into the filter. All three go in now, and Oscillator 2 is nudged sharp so the two 16’ saws drift against each other.\n- OSC 1–3 on, VOLUME 8 / 7.5 / 6.5: the two 16’ saws lead and the 32’ saw sits a little lower as the sub weight. Past about 7 the mixer starts to push the filter into a fatter, slightly driven tone.\n- Osc 2 FREQUENCY +0.1: a tenth of a semitone sharp. Too small to hear as out of tune, but the two saws drift in and out of phase, which the ear hears as width and movement. Past about 0.3 it starts to sound sour.\n- Listen for: hold a low note and hear the slow beating. Switch Osc 3 off and on to hear the sub drop out from under the note and come back.',
        set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc1': 8, 'mix.osc2': 7.5, 'mix.osc3': 6.5, 'osc2.freq': 0.12 } },
      { title: 'Close the filter', module: 'filter', why: 'The VCF (voltage-controlled filter) removes brightness. The Model D’s is a low-pass ladder: lows pass, highs are cut. Here it is pulled nearly shut, which sets the resting tone between notes.\n- CUTOFF −2.6 (about 105 Hz): very low, so the buzz is gone and only a dull, round thump remains. Turn it right and the bass gets buzzier and less round.\n- EMPHASIS 3.2: Moog’s name for resonance, a boost right at the cutoff point. It gives the coming sweep a nasal, vocal edge. Past about 6 the ladder filter starts to thin the low end.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so higher notes open the filter slightly and do not go duller than the low ones.\n- Listen for: the sound is muffled for now. That is expected; the next step opens the filter on every note.',
        set: { 'filter.cutoff': -2.6, 'filter.emphasis': 3.2, 'filter.kbd1': true, 'filter.kbd2': false } },
      { title: 'Let the envelope flick it open', module: 'env', why: 'The filter contour is an envelope (Moog calls envelopes contours): each note pushes the cutoff up and lets it fall back. That quick flick open and shut is the rubbery “bow” on the front of the note.\n- AMOUNT OF CONTOUR 5.6: how far above −2.6 the envelope lifts the cutoff. Lower it for a smoother, dub-style bass; raise it for a harder quack.\n- ATTACK 0 (3 ms): the filter opens straight away, so the flick lands on the beat.\n- DECAY 250 ms: how fast it closes again. Around 200 ms is funky; longer turns it into a slow sweep.\n- SUSTAIN 1.5: where the filter settles while you hold the key. Low, so held notes go back to round.\n- Listen for: a “bow” at the start of each note. Play a syncopated riff and sweep DECAY to move from tight to rubbery.',
        set: { 'filter.contour': 5.6, 'fenv.attack': 0, 'fenv.decay': 2.4, 'fenv.sustain': 1.5 } },
      { title: 'Tight loudness shape', module: 'amp', why: 'The loudness contour shapes volume over time, the job a VCA (voltage-controlled amplifier) envelope does on other synths. For funk bass, notes need to start on the beat and stop cleanly.\n- ATTACK 0 (3 ms): full level at once, so the punch lines up with the filter flick.\n- SUSTAIN 8: held notes keep most of their weight, so long notes still fill the low end.\n- DECAY 220 ms with LOUDNESS DECAY on: there is no release knob, so this switch re-uses DECAY as the fade after you let go. Short, so notes end quickly.\n- FILTER DECAY on: the filter also closes over its own DECAY time on release instead of snapping shut.\n- Listen for: the gaps in the riff. Short, clean gaps keep the groove tight; lengthen loudness DECAY and the notes start to smear into each other.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2.2, 'aenv.sustain': 8, 'env.loudDecay': true, 'env.filterDecay': true } },
    ],
    context: {
      'filter.cutoff': 'In this sound the cutoff sets how dark the bass is between flicks. Raise it and the bass gets buzzier and less round.',
      'filter.contour': 'This is the size of the "wow". Lower it for a smoother, dub-style bass; raise it for a more aggressive quack.',
      'fenv.decay': 'The length of the "wow". Around 200 ms is funky; longer turns it into a slow sweep.',
      'filter.emphasis': 'Adds the nasal, vocal quality to the sweep. Past 6 the bass loses low end, because resonance on a ladder filter thins the bass.',
      'osc2.freq': 'A hair of detune makes the beating you hear as thickness. More than about 0.3 starts to sound out of tune.',
      'mix.osc3': 'The 32’ oscillator is the sub weight under the note.',
    },
    tweaks: [
      { id: 'fenv.decay', try: 'Move between 1.5 and 5', hear: 'Short gives a percussive pluck; long gives a slow, lazy sweep.' },
      { id: 'filter.emphasis', try: 'Push up to 6 or 7', hear: 'The sweep turns squelchy and acid-like, but the low end thins out.' },
      { id: 'ctl.glide', try: 'Turn up to about 2', hear: 'Notes slide into each other, the classic P-Funk slur.' },
      { id: 'osc3.wave', try: 'Switch Oscillator 3 to square', hear: 'A hollower, more "woody" sub layer.' },
    ],
  },
  {
    id: 'lucky-lead', name: 'Gliding Square Lead', ref: 'In the style of Emerson, Lake & Palmer — "Lucky Man"', artist: 'Keith Emerson',
    tags: ['lead', 'prog', '70s'], level: 1,
    blurb: 'Hollow, singing lead that swoops between notes.',
    how: 'A square wave has only odd harmonics, which gives the hollow, clarinet-like tone. Two squares an octave apart thicken it. Glide makes the pitch slide between notes, and the filter is left fairly open with only a gentle envelope so the tone stays pure.',
    phrase: { bpm: 84, loop: true, steps: [[0, 62, 1.4], [1.5, 69, 0.5], [2, 67, 1], [3, 74, 1.9], [5, 72, 0.5], [5.5, 69, 0.5], [6, 62, 1.8]] },
    steps: [
      { title: 'Two square waves', module: 'osc', why: 'The VCOs (voltage-controlled oscillators, the parts that make the raw tone) are set to two square waves an octave apart, the hollow, clarinet-like core of this lead. Only Oscillator 1 is heard for now; Oscillator 2 joins in the mixer next.\n- Osc 1 RANGE 8’, WAVEFORM square: 8’ is the normal playing octave. A square has only odd harmonics, which is why it sounds hollow and woody rather than buzzy.\n- Osc 2 RANGE 16’, WAVEFORM square: the same shape an octave lower (footage comes from organ pipes; a longer pipe is lower). It adds body under the lead without changing its character.\n- Osc 2 FREQUENCY +0.1: a tenth of a semitone sharp, so the pair drift gently against each other instead of locking.\n- Listen for: with Osc 1 alone, switch its WAVEFORM to sawtooth and back. The saw is brassy; the square is the hollow one.',
        set: { 'osc1.range': '8', 'osc1.wave': 'sq', 'osc2.range': '16', 'osc2.wave': 'sq', 'osc2.freq': 0.06 } },
      { title: 'Mix', module: 'mixer', why: 'The mixer sets how loud each oscillator is going into the filter. Oscillator 1 carries the melody and Oscillator 2 sits underneath as support.\n- OSC 1 on, VOLUME 7.5: the lead voice, strong without pushing the filter into grit.\n- OSC 2 on, VOLUME 5.5: the 16’ square, lower so it thickens the note rather than competing with it. Raise it and the lead gets heavier and more organ-like.\n- OSC 3 off: not needed, so it stays out of the mix.\n- Listen for: hold a note and flick Osc 2 off and on. Without it the lead is thinner; with it the note has a floor under it and a slow drift from the detune.', set: { 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': false, 'mix.osc1': 7.5, 'mix.osc2': 5.5 } },
      { title: 'Add glide', module: 'glide', why: 'GLIDE (portamento) makes the pitch slide from one note to the next instead of jumping. On this lead it is the signature move.\n- GLIDE 4.2 (about 350 ms): long enough that every change of note is an audible swoop, short enough that the melody still lands in time. At 0 the pitch jumps; turn it up and the slides get slower and more dramatic.\n- Listen for: play two notes an octave or more apart, then two neighbouring notes. The wide jump gives a big swoop; the small step barely bends. Play wide intervals to hear it work.', set: { 'ctl.glide': 4.2 } },
      { title: 'Open, gentle filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass that cuts highs. It is left fairly open so the square keeps its hollow character, and only a gentle filter contour (Moog’s name for the filter envelope) moves it.\n- CUTOFF 1.2 (about 1.4 kHz), EMPHASIS 1.5: open, with a hint of resonance (Moog calls it emphasis). Close the cutoff and the lead goes muffled; open it and it gets edgier.\n- KEYBOARD CONTROL 1 and 2 on: full key tracking, so the cutoff follows the notes and high notes stay as bright as low ones.\n- AMOUNT OF CONTOUR 2.5: a small lift above the cutoff on each note.\n- ATTACK 24 ms, DECAY 770 ms, SUSTAIN 6: a soft rise, a slow settle and a fairly high hold, so the brightness change is gentle rather than a pluck.\n- Listen for: a slight bloom at the front of each note, not a snap.',
        set: { 'filter.cutoff': 1.2, 'filter.emphasis': 1.5, 'filter.contour': 2.5, 'filter.kbd1': true, 'filter.kbd2': true, 'fenv.attack': 1, 'fenv.decay': 5, 'fenv.sustain': 6 } },
      { title: 'Sustain and ring out', module: 'amp', why: 'The loudness contour is Moog’s name for the volume envelope, the job a VCA (voltage-controlled amplifier) envelope does elsewhere. A singing lead wants full level while held and a short ring after release.\n- ATTACK 0.4 (7 ms): almost instant, just soft enough to take the click off the start of the square.\n- SUSTAIN 10: held notes stay at full level, so long notes sing without fading.\n- DECAY 630 ms with LOUDNESS DECAY on: with sustain at full, DECAY only matters after release. The switch re-uses it as the release, so notes fade over about half a second instead of stopping dead.\n- Listen for: the tail after you let go. Switch LOUDNESS DECAY off and each note cuts off abruptly.', set: { 'aenv.attack': 0.4, 'aenv.decay': 4.2, 'aenv.sustain': 10, 'env.loudDecay': true } },
      { title: 'Vibrato on the wheel', module: 'mod', why: 'Vibrato is a pitch wobble from the LFO (low-frequency oscillator, a slow wave used to move other controls). The mod section routes it to the oscillators.\n- Mod source B LFO, MOD MIX 10: the mix knob fully right takes only the right-hand source, the LFO, and nothing from Oscillator 3.\n- LFO shape triangle, RATE 7.87 Hz: a triangle rises and falls smoothly, which gives vibrato rather than a trill. This is a quick wobble; around 5–6 Hz sounds more like a singer or violinist.\n- OSCILLATOR MODULATION on: sends the mod signal to pitch.\n- MOD DEPTH 0.8: kept small. The mod wheel adds to it, so you can bring in more on long notes as a player would.\n- Listen for: hold a long note and raise MOD DEPTH slowly until the wobble is obvious, then bring it back to 0.8.',
        set: { 'mod.srcB': 'lfo', 'mod.mix': 10, 'lfo.shape': 'tri', 'lfo.rate': 6.1, 'mod.toOsc': true, 'mod.depth': 0.8 } },
    ],
    context: {
      'ctl.glide': 'The swoop between notes. Try playing wide intervals to hear it work.',
      'osc1.wave': 'Square gives the hollow tone. Switch to sawtooth and the same patch turns brassy.',
      'mod.depth': 'Vibrato depth. Keep it small; the mod wheel next to the keyboard adds more.',
      'lfo.rate': 'Vibrato speed, a quick 7.9 Hz here. Around 5–6 Hz sounds more like a singer or violinist.',
      'filter.cutoff': 'Left fairly open so the square wave keeps its hollow character.',
    },
    tweaks: [
      { id: 'ctl.glide', try: 'Try 2, then 7', hear: 'Low values just smear note starts; high values turn every interval into a long siren-like slide.' },
      { id: 'osc2.range', try: 'Set to 8’ and detune by 0.1', hear: 'Two squares at the same pitch beat slowly, a chorus-like shimmer.' },
      { id: 'filter.contour', try: 'Raise to 6 with emphasis at 4', hear: 'Each note gets a "wah" at the front — moving toward a brass lead.' },
    ],
  },
  {
    id: 'shine-lead', name: 'Brassy Horn Lead', ref: 'In the style of Pink Floyd — "Shine On You Crazy Diamond"', artist: 'Richard Wright',
    tags: ['brass', 'lead', 'prog', '70s'], level: 2,
    blurb: 'Warm, horn-like lead that blooms as each note opens.',
    how: 'Brass instruments get brighter as the player blows harder at the start of a note. The filter envelope copies that: a slow-ish attack opens the filter after the note begins, then it settles at a mellower level. Sawtooths supply the brassy harmonics.',
    phrase: { bpm: 66, loop: true, steps: [[0, 58, 1.8], [2, 65, 0.9], [3, 67, 0.9], [4, 62, 2.6], [7, 60, 0.9]] },
    steps: [
      { title: 'Sawtooth pair', module: 'osc', why: 'Two VCOs (voltage-controlled oscillators, the parts that make the raw tone) at the same pitch form the horn tone. A sawtooth has the full harmonic series, as a brass instrument does.\n- RANGE 8’, WAVEFORM saw on osc 1 and 2: 8’ is the normal playing octave (footage comes from organ pipes). The saw is bright and brassy, raw material for the filter to shape.\n- Osc 2 FREQUENCY +0.1: a tenth of a semitone sharp. The two saws drift slowly, like the natural wavering of a real player.\n- OSC 1 and 2 on, VOLUME 7 / 6.5: both into the mixer at similar levels, Oscillator 2 slightly under.\n- Listen for: a bright, buzzy tone with slow beating on held notes. Switch Osc 2 off to hear how static one saw sounds on its own.',
        set: { 'osc1.range': '8', 'osc1.wave': 'saw', 'osc2.range': '8', 'osc2.wave': 'saw', 'osc2.freq': 0.09, 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc1': 7, 'mix.osc2': 6.5 } },
      { title: 'Dark resting filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass ladder: it keeps the lows and cuts the highs. Here it rests dark, so each note starts mellow and the next step can make it bloom.\n- CUTOFF −1.6 (about 210 Hz): low enough that most of the brass is hidden. Lower it for a French-horn mellowness; raise it and the resting tone gets brighter.\n- EMPHASIS 2: Moog’s word for resonance, a boost at the cutoff. A little adds a slight vocal peak.\n- KEYBOARD CONTROL 2 on, 1 off: two thirds key tracking, so the cutoff rises with the notes and the tone stays even across the range.\n- Listen for: a muffled tone for now. Play high and low notes; they should sound about equally bright.',
        set: { 'filter.cutoff': -1.6, 'filter.emphasis': 2, 'filter.kbd1': false, 'filter.kbd2': true } },
      { title: 'Slow bloom', module: 'env', why: 'The filter contour (Moog’s name for the filter envelope) lifts the cutoff on each note. Brass gets brighter as the player blows harder at the start of a note, and a slow-ish attack copies that.\n- AMOUNT OF CONTOUR 5: how bright the peak of the bloom gets above the dark resting cutoff.\n- ATTACK 110 ms: the filter takes about a tenth of a second to open, so every note “blows” open after it starts. At 0 the patch becomes a pluck; much longer and notes never get bright before you move on.\n- DECAY 770 ms: a slow fall from the peak, so the bloom eases off rather than snapping.\n- SUSTAIN 5.5: held notes stay part way open, brighter than the resting tone but mellower than the peak.\n- Listen for: the “waa” as each note opens. Set ATTACK to 0 and compare: the same note turns into a bright pluck.',
        set: { 'filter.contour': 5, 'fenv.attack': 1.7, 'fenv.decay': 5, 'fenv.sustain': 5.5 } },
      { title: 'Soft loudness attack', module: 'amp', why: 'The loudness contour is Moog’s name for the volume envelope, what other synths call the VCA (voltage-controlled amplifier) envelope. Here it softens the start and lets notes ring.\n- ATTACK 24 ms: a touch of fade-in removes the click, so notes start like a breath rather than a hit.\n- DECAY 770 ms: the fall from full to sustain is slow and slight. With the loudness decay switch on (as it is by default) DECAY is also the release, so notes ring on for most of a second after you let go.\n- SUSTAIN 9: held notes stay almost at full level.\n- Listen for: the tail after each note. In a slow melody the tails overlap the next note slightly, which helps the line sound connected.',
        set: { 'aenv.attack': 1, 'aenv.decay': 5, 'aenv.sustain': 9 } },
      { title: 'A little glide and wheel vibrato', module: 'mod', why: 'A little glide and vibrato make the line feel played rather than programmed. Vibrato comes from the LFO (low-frequency oscillator, a slow wave that moves other controls).\n- GLIDE 2 (about 80 ms): a short slide between notes, just enough to join them. At 0 the pitch jumps.\n- Mod source B LFO, MOD MIX 10: the mix knob fully right takes only the LFO.\n- LFO RATE 6.14 Hz: the shape is still the default triangle, a smooth rise and fall. Around 6 Hz sounds like a singer’s vibrato.\n- OSCILLATOR MODULATION on, MOD DEPTH 1: sends the LFO to pitch at a gentle depth. The mod wheel adds more for late vibrato on long notes.\n- Listen for: a slight pitch wobble on held notes and small scoops between notes. Set GLIDE to 0 and the line sounds stiffer.',
        set: { 'ctl.glide': 2, 'mod.toOsc': true, 'mod.srcB': 'lfo', 'mod.mix': 10, 'lfo.rate': 5.8, 'mod.depth': 1 } },
    ],
    context: {
      'fenv.attack': 'This creates the horn-like bloom. At 0 the patch becomes a pluck; too long and notes never get bright before you move on.',
      'filter.contour': 'How bright the peak of the bloom is.',
      'fenv.sustain': 'How bright a held note stays after the bloom.',
      'filter.cutoff': 'The darkest the note gets. Lower it for a French-horn mellowness.',
    },
    tweaks: [
      { id: 'fenv.attack', try: 'Sweep from 0 to 4', hear: 'At 0 it is a bright stab; by 4 each note swells slowly like a section crescendo.' },
      { id: 'filter.emphasis', try: 'Raise to 4', hear: 'A more nasal, trumpet-with-mute tone.' },
      { id: 'osc3.range', try: 'Switch Oscillator 3 on at 16’, volume 5', hear: 'An octave-down layer turns the solo horn into a bigger section.' },
    ],
  },
  {
    id: 'gfunk-whistle', name: 'West Coast Whistle', ref: 'In the style of Dr. Dre — "Nuthin’ but a ‘G’ Thang"', artist: 'G-funk',
    tags: ['lead', 'hip-hop', '90s'], level: 1,
    blurb: 'High, pure, sliding lead line that floats over the beat.',
    how: 'The tone is nearly a sine wave. A triangle oscillator has very few harmonics, and the filter trims off what is left. All of the expression comes from glide and steady vibrato, not from the timbre.',
    phrase: { bpm: 94, loop: true, steps: [[0, 84, 1.4], [1.5, 86, 0.45], [2, 88, 1.9], [4, 91, 0.9], [5, 88, 0.9], [6, 84, 1.9]] },
    steps: [
      { title: 'One triangle, high up', module: 'osc', why: 'One VCO (voltage-controlled oscillator, the part that makes the raw tone) is enough. The triangle is the purest wave on the Model D, close to a sine, which is the whistle quality this line needs.\n- Osc 1 RANGE 4’: footage comes from organ pipes; 4’ is an octave above the usual 8’, putting the keyboard in the whistle register.\n- Osc 1 WAVEFORM triangle: very few harmonics, soft and flute-like.\n- OSC 1 on, VOLUME 7: into the mixer at a moderate level, below the point where the filter starts to overdrive.\n- OSC 2 and 3 off: only one pure tone.\n- Listen for: switch WAVEFORM to sawtooth for a moment. The line turns buzzy and the whistle is gone.',
        set: { 'osc1.range': '4', 'osc1.wave': 'tri', 'mix.osc1On': true, 'mix.osc1': 7, 'mix.osc2On': false, 'mix.osc3On': false } },
      { title: 'Round it off', module: 'filter', why: 'The VCF (voltage-controlled filter) trims the few harmonics the triangle has. It is a low-pass: it passes the lows and cuts the highs.\n- CUTOFF 0.6 (about 960 Hz): just above the note, so the tone is softened without going muffled. Lower and the lead dulls; higher and it gains a slight edge.\n- EMPHASIS 1.2: Moog’s word for resonance. A little adds a faint peak and some presence.\n- AMOUNT OF CONTOUR 0: no filter envelope (Moog calls envelopes contours), so the tone does not change during a note. The expression comes from pitch, not timbre.\n- KEYBOARD CONTROL 1 and 2 on: full tracking, so the cutoff follows the notes and higher notes keep the same softness.\n- Listen for: an even, round tone from the bottom of the line to the top.',
        set: { 'filter.cutoff': 0.6, 'filter.emphasis': 1.2, 'filter.contour': 0, 'filter.kbd1': true, 'filter.kbd2': true } },
      { title: 'Glide', module: 'glide', why: 'GLIDE (portamento) slides the pitch between notes instead of jumping. The lazy slide is the hook of this sound.\n- GLIDE 3.6 (about 260 ms): long enough to hear every slide, short enough to land on the note in time. At 0 the pitch jumps; turn it up and the slides get slower and lazier.\n- Listen for: play a melody with steps of a third or a fifth. Each note swoops up or down into place. Try 2 and 5 on GLIDE to find where it stops sounding lazy and starts sounding late.', set: { 'ctl.glide': 3.6 } },
      { title: 'Smooth loudness', module: 'amp', why: 'The loudness contour is Moog’s name for the volume envelope, what other synths call the VCA (voltage-controlled amplifier) envelope. A pure tone shows every click, so both ends of the note are softened.\n- ATTACK 0.8 (16 ms): a short fade-in that takes the click off the front of each note.\n- SUSTAIN 10: held notes stay at full level.\n- DECAY 390 ms with LOUDNESS DECAY on: with sustain at full, DECAY only acts after release. The switch re-uses it as the release, so notes fade gently over about 0.4 s.\n- Listen for: soft note starts and a short tail. Set ATTACK to 0 and you may hear a faint tick at the start of each note.', set: { 'aenv.attack': 0.8, 'aenv.decay': 3.2, 'aenv.sustain': 10, 'env.loudDecay': true } },
      { title: 'Steady vibrato', module: 'mod', why: 'A steady vibrato from the LFO (low-frequency oscillator, a slow wave used to move other controls) gives the whistle its wavering, human quality.\n- Mod source B LFO, MOD MIX 10: the mix knob fully right takes only the LFO as the mod source.\n- LFO shape triangle, RATE 5.2 Hz: a smooth rise and fall, just over five wobbles a second. Slower sounds dreamier; faster sounds nervous.\n- OSCILLATOR MODULATION on: sends the mod signal to pitch.\n- MOD DEPTH 1.6: always on, but subtle. Much more and it turns into a siren.\n- Listen for: a gentle pitch wobble on every held note, on top of the glide into it.', set: { 'mod.toOsc': true, 'mod.srcB': 'lfo', 'mod.mix': 10, 'lfo.shape': 'tri', 'lfo.rate': 5.6, 'mod.depth': 1.6 } },
    ],
    context: {
      'osc1.wave': 'Triangle keeps it pure. Any brighter wave and it stops sounding like a whistle.',
      'ctl.glide': 'The slide time. Long enough to hear, short enough to land on the note in time.',
      'mod.depth': 'Vibrato depth. This sound wants it always on, but subtle.',
      'filter.cutoff': 'Just above the note. Lower and the lead goes muffled; higher and it gains a slight edge.',
    },
    tweaks: [
      { id: 'osc1.wave', try: 'Step to the triangle-saw position', hear: 'A touch more edge so it cuts through a busy mix.' },
      { id: 'filter.emphasis', try: 'Raise to 9.5 and switch Oscillator 1 off', hear: 'The filter whistles on its own: a pure sine you can play from the keys.' },
      { id: 'lfo.rate', try: 'Slow to 4.5', hear: 'A lazier, more laid-back wobble.' },
    ],
  },
  {
    id: 'seq-pulse', name: 'Sequencer Pulse Bass', ref: 'In the style of Donna Summer — "I Feel Love"', artist: 'Giorgio Moroder',
    tags: ['seq', 'bass', 'disco', '70s'], level: 2,
    blurb: 'Tight, clicky bass made for fast repeating patterns.',
    how: 'Machine-like sequences need notes that start and stop quickly. Both envelopes have instant attack and a short decay with no sustain, so every note is a short blip. The filter envelope and loudness envelope move together, which keeps the pattern even and hypnotic.',
    phrase: { bpm: 126, loop: true, steps: [[0, 36, 0.2], [0.25, 36, 0.2], [0.5, 48, 0.2], [0.75, 36, 0.2], [1, 43, 0.2], [1.25, 36, 0.2], [1.5, 46, 0.2], [1.75, 48, 0.2], [2, 36, 0.2], [2.25, 36, 0.2], [2.5, 48, 0.2], [2.75, 36, 0.2], [3, 43, 0.2], [3.25, 46, 0.2], [3.5, 43, 0.2], [3.75, 41, 0.2]] },
    steps: [
      { title: 'Saw plus square', module: 'osc', why: 'Two VCOs (voltage-controlled oscillators, the parts that make the raw tone) combine bite and weight for a sequenced bass line.\n- Osc 1 RANGE 16’, WAVEFORM saw: an octave below the usual 8’ (footage comes from organ pipes). The saw carries every harmonic, which gives the bite the filter will pick out.\n- Osc 2 RANGE 32’, WAVEFORM square: an octave lower again, a solid fundamental under the saw.\n- Osc 2 FREQUENCY 0: in tune, so it locks to Oscillator 1 with no beating. A sequence stays tight and even.\n- OSC 1 and 2 on, VOLUME 7.5 / 6.5; OSC 3 off: the saw leads and the square supports.\n- Listen for: switch Osc 2 off and on while playing a low note. The square adds a floor to the note without making it wider.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'osc2.range': '32', 'osc2.wave': 'sq', 'osc2.freq': 0, 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': false, 'mix.osc1': 7.5, 'mix.osc2': 6.5 } },
      { title: 'Filter low with some bite', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass: it keeps the lows and removes the highs. Here it sits low, with enough resonance to put a click on each note.\n- CUTOFF −2.2 (about 140 Hz): most of the saw’s buzz is removed, leaving a dark body. The envelope opens it on each note in the next step.\n- EMPHASIS 4.2: Moog’s name for resonance, a boost at the cutoff point. At this level it gives each note a defined “tick” as the filter snaps shut.\n- KEYBOARD CONTROL 1 on: a third of key tracking, so higher notes in the pattern open slightly and do not go dull.\n- Listen for: a dark, slightly nasal tone. Turn EMPHASIS between 0 and 6 to hear the peak come and go.',
        set: { 'filter.cutoff': -2.2, 'filter.emphasis': 4.2, 'filter.kbd1': true } },
      { title: 'Blip envelopes', module: 'env', why: 'Both contours (Moog’s word for envelopes) turn every note into a short blip. The filter contour and the loudness contour (the VCA, or voltage-controlled amplifier, envelope on other synths) move together, which keeps a fast pattern even and hypnotic.\n- AMOUNT OF CONTOUR 5.2: how far each note opens the filter above −2.2. This is the bright tick.\n- Filter ATTACK 0, DECAY 210 ms, SUSTAIN 0: opens at once and closes fully in about a fifth of a second.\n- Loudness ATTACK 0, DECAY 280 ms, SUSTAIN 0: each note dies away within about 0.3 s, however long the key is held.\n- FILTER and LOUDNESS DECAY off: notes cut dead on release, so sixteenths stay separate.\n- Listen for: a tight, clicky pulse. Play fast repeated notes and ride filter DECAY by hand, as producers do during a track.',
        set: { 'filter.contour': 5.2, 'fenv.attack': 0, 'fenv.decay': 2.1, 'fenv.sustain': 0, 'aenv.attack': 0, 'aenv.decay': 2.6, 'aenv.sustain': 0, 'env.filterDecay': false, 'env.loudDecay': false } },
    ],
    context: {
      'fenv.decay': 'Length of the bright part of each blip. This is the control producers ride by hand during a track.',
      'aenv.decay': 'Length of each note. It needs to be shorter than the gap between notes, or the pattern blurs.',
      'aenv.sustain': 'Zero sustain makes every note the same length however long the key is held.',
      'filter.emphasis': 'Adds the clicky tick at the front of the note.',
    },
    tweaks: [
      { id: 'fenv.decay', try: 'Slowly turn from 1 to 5 while the pattern plays', hear: 'The classic build: the pattern opens up from muted ticks to a bright, driving line.' },
      { id: 'filter.cutoff', try: 'Sweep between −4 and 0', hear: 'Same build, but from the floor of the sound rather than the envelope.' },
      { id: 'mix.extOn', try: 'Switch EXT on with EXT IN VOLUME at 4', hear: 'Feedback overdrive: the bass gets denser and slightly gritty.' },
    ],
  },
  {
    id: 'feedback-growl', name: 'Overdriven Growl Bass', ref: 'In the style of Nine Inch Nails — industrial Moog bass', artist: 'Industrial',
    tags: ['bass', 'industrial', '90s'], level: 2,
    blurb: 'Dense, distorted bass using the Model D feedback trick.',
    how: 'With nothing plugged into EXT, the Model D quietly routes its own output back into the mixer. Turn that channel up and the signal goes round the loop, overdriving the mixer and filter. The result is compression and grit that no plain oscillator setting gives you.',
    phrase: { bpm: 92, loop: true, steps: [[0, 33, 0.9], [1, 33, 0.4], [1.5, 36, 0.4], [2, 31, 1.4], [3.5, 32, 0.4]] },
    steps: [
      { title: 'Three hot oscillators', module: 'osc', why: 'Three VCOs (voltage-controlled oscillators, the parts that make the raw tone) go into the mixer loud. On the Model D, levels past about 7 overdrive the filter input, so grit is part of the sound before any feedback is added.\n- RANGE 16’, saws on osc 1 and 2: an octave below the usual 8’, bright and buzzy.\n- Osc 2 FREQUENCY −0.1: a tenth of a semitone flat, so the two saws beat and thicken.\n- Osc 3 RANGE 32’, WAVEFORM square: an octave lower again, a hollow sub underneath.\n- OSC 1–3 on, VOLUME 9 / 9 / 8: all hot into the filter.\n- Listen for: a dense, slightly squashed tone. Pull all three to 5 to hear how much cleaner it gets, then put them back.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'osc2.range': '16', 'osc2.wave': 'saw', 'osc2.freq': -0.15, 'osc3.range': '32', 'osc3.wave': 'sq', 'mix.osc1On': true, 'mix.osc2On': true, 'mix.osc3On': true, 'mix.osc1': 9, 'mix.osc2': 9, 'mix.osc3': 8 } },
      { title: 'Switch in the feedback loop', module: 'mixer', why: 'This is the Model D feedback trick. With nothing plugged into EXT, the synth routes its own output back into the mixer, so turning that channel up sends the sound round a loop and overdrives it.\n- EXTERNAL INPUT on, EXT IN VOLUME 6.2: how much output is fed back. Below about 4 it just thickens; above 7 it breaks up into distortion.\n- VOLUME (out) 7: main volume sits inside the feedback loop, so it changes the amount of drive as well as the level. Turn it up and the growl gets dirtier.\n- Listen for: the tone thickening and the OVERLOAD lamp lighting as you bring EXT IN VOLUME up. Switch EXTERNAL INPUT off and on to compare with and without the loop.',
        set: { 'mix.extOn': true, 'mix.ext': 6.2, 'out.volume': 7 } },
      { title: 'Filter part open, slow-ish envelope', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass: it keeps the lows and removes the highs. It is left part open so the grit comes through, and the filter contour (Moog’s word for the filter envelope) gives each note a snarl at the front.\n- CUTOFF −1.2 (about 280 Hz): dark enough to keep the low end heavy, open enough to hear the distortion.\n- EMPHASIS 2.5: Moog’s name for resonance. A little adds bite to the snarl.\n- AMOUNT OF CONTOUR 4.2: how far each note lifts the cutoff.\n- ATTACK 0, DECAY 600 ms, SUSTAIN 3.5: instant opening, then a medium fall to a fairly low level. Shorter decay gives a tighter snarl; longer, a slower growl.\n- Listen for: a bright, dirty bark on each note that settles into a darker grind while held.',
        set: { 'filter.cutoff': -1.2, 'filter.emphasis': 2.5, 'filter.contour': 4.2, 'fenv.attack': 0, 'fenv.decay': 4, 'fenv.sustain': 3.5 } },
      { title: 'Full sustain', module: 'amp', why: 'The loudness contour is Moog’s name for the volume envelope, the job a VCA (voltage-controlled amplifier) envelope does elsewhere. Here it holds everything at full so the distortion stays consistent.\n- ATTACK 0: full level at once, so the bark lands on the beat.\n- SUSTAIN 10: held notes stay at full level for as long as the key is down.\n- DECAY 350 ms: with sustain at full it only acts on release, where the loudness decay switch (on by default) uses it as a short fade.\n- Listen for: held notes keeping the same grit from start to end. Drop SUSTAIN to 5 and held notes lose level and weight after the first hit.', set: { 'aenv.attack': 0, 'aenv.decay': 3, 'aenv.sustain': 10 } },
    ],
    context: {
      'mix.ext': 'The feedback amount. Below 4 it just thickens; above 7 it breaks up.',
      'out.volume': 'On this synth main volume is inside the feedback loop, so it changes the distortion as well as the level.',
      'mix.osc1': 'High mixer levels overdrive the filter input. Try pulling all three down to 5 to hear how much cleaner it gets.',
    },
    tweaks: [
      { id: 'mix.ext', try: 'Sweep 0 to 9', hear: 'Clean, to thick, to properly distorted.' },
      { id: 'filter.emphasis', try: 'Raise to 6', hear: 'Resonance inside a feedback loop gets unstable and howls — useful, in small doses.' },
      { id: 'filter.mode', try: 'Flip to HI', hear: 'The bass disappears and only the snarling top is left.' },
    ],
  },
  {
    id: 'clang-bell', name: 'Clangorous Bell', ref: 'In the style of 70s sci-fi and library music', artist: 'Classic technique',
    tags: ['fx', 'keys', 'advanced'], level: 3,
    blurb: 'Metallic, bell-like tone made by modulating pitch at audio rate.',
    how: 'When an oscillator modulates another oscillator’s pitch fast enough, you stop hearing wobble and start hearing new, non-harmonic overtones — the same idea as FM synthesis. Oscillator 3 is freed from the keyboard and used purely as the modulator, so the overtones shift against the note and sound like struck metal.',
    phrase: { bpm: 72, loop: true, steps: [[0, 72, 1], [1, 79, 1], [2, 76, 1], [3, 84, 2.5]] },
    steps: [
      { title: 'A plain triangle carrier', module: 'osc', why: 'Start with one pure VCO (voltage-controlled oscillator, the part that makes the raw tone) so you can hear exactly what the modulation adds later.\n- Osc 1 RANGE 8’, WAVEFORM triangle: the normal playing octave and the softest shape, with very few harmonics. This is the carrier, the oscillator you actually hear.\n- OSC 1 on, VOLUME 7.5: into the mixer below the overdrive point, so the tone stays clean.\n- OSC 2 and 3 off in the mixer: Oscillator 3 will be used as a modulator only, never heard directly.\n- Listen for: a plain, flute-like tone. Remember it; the next two steps turn it into metal.',
        set: { 'osc1.range': '8', 'osc1.wave': 'tri', 'mix.osc1On': true, 'mix.osc1': 7.5, 'mix.osc2On': false, 'mix.osc3On': false } },
      { title: 'Turn Oscillator 3 into the modulator', module: 'mod', why: 'Oscillator 3 is freed from the keyboard and set up as the modulator. When one oscillator moves another’s pitch at audio rate, you hear new, non-harmonic overtones instead of a wobble: the same idea as FM (frequency modulation) synthesis.\n- OSC 3 CONTROL off: Oscillator 3 stops following the keys and runs at a fixed pitch.\n- Osc 3 RANGE 4’, WAVEFORM triangle: high enough to run at audio rate, not as a slow wobble.\n- Osc 3 FREQUENCY +2.2: the modulator’s pitch. Every position gives a different set of clangy overtones.\n- Mod source A OSC 3, MOD MIX 0: the mix knob fully left selects Oscillator 3 as the only mod source.\n- Listen for: no change yet. Its mixer switch stays off, so you never hear it directly, and nothing is routed to pitch.',
        set: { 'osc3.kbd': false, 'osc3.range': '4', 'osc3.wave': 'tri', 'osc3.freq': 2.2, 'mod.srcA': 'osc3', 'mod.mix': 0 } },
      { title: 'Send it to pitch', module: 'mod', why: 'Now the mod signal reaches Oscillator 1’s pitch. A pitch shaken hundreds of times a second is no longer heard as vibrato; it becomes extra tones that clash with the note, like struck metal.\n- OSCILLATOR MODULATION on: routes the mod bus (Oscillator 3) to oscillator pitch.\n- MOD DEPTH 6.4: how strongly Oscillator 3 bends Oscillator 1. Low values add a slight edge; high values go fully metallic.\n- Listen for: bring MOD DEPTH up from 0 and hear the triangle turn glassy, then clangorous. Play up the keyboard: because the modulator stays at one pitch while the note moves, each key has its own timbre.', set: { 'mod.toOsc': true, 'mod.depth': 6.4 } },
      { title: 'Bell-shaped envelopes', module: 'env', why: 'Bells are struck, then ring and fade. The loudness contour (Moog’s name for the volume envelope) and the filter contour are both shaped that way, and the VCF (voltage-controlled filter, a low-pass) gives a bright strike that dulls as the note rings.\n- Loudness ATTACK 0, DECAY 1.4 s, SUSTAIN 0: an instant hit, then a long fade to silence even while held. LOUDNESS DECAY on keeps the same fade after release.\n- CUTOFF 2.5 (about 3.6 kHz): open, so the metallic overtones come through.\n- KEYBOARD CONTROL 1 and 2 on: full tracking, so high bells stay as bright as low ones.\n- AMOUNT OF CONTOUR 3, DECAY 880 ms, SUSTAIN 0: a lift on the strike that falls away in under a second.\n- Listen for: a clang at the start that mellows as it rings out over more than a second.',
        set: { 'aenv.attack': 0, 'aenv.decay': 6.4, 'aenv.sustain': 0, 'env.loudDecay': true, 'filter.cutoff': 2.5, 'filter.contour': 3, 'fenv.decay': 5.5, 'fenv.sustain': 0, 'filter.kbd1': true, 'filter.kbd2': true } },
    ],
    context: {
      'osc3.freq': 'With keyboard control off this is the modulator’s pitch. Every position gives a different set of clangy overtones.',
      'mod.depth': 'How strongly Oscillator 3 bends Oscillator 1. Low values add a slight edge; high values go fully metallic.',
      'osc3.kbd': 'Off, so the modulator stays put while the note moves. That is why each key has a different timbre.',
      'mod.mix': 'Fully left selects Oscillator 3 as the only mod source.',
    },
    tweaks: [
      { id: 'osc3.freq', try: 'Turn slowly through its range', hear: 'The overtones slide around against the note: gongs, bells, ring-modulator robot tones.' },
      { id: 'osc3.kbd', try: 'Switch back on', hear: 'The modulator now tracks the keys, so the timbre is the same on every note — closer to a DX-style electric piano.' },
      { id: 'mod.toFilter', try: 'Switch on as well', hear: 'The filter is modulated at audio rate too, adding a rasp.' },
    ],
  },
  {
    id: 'wind-surf', name: 'Wind and Surf', ref: 'In the style of 70s film and TV atmospheres', artist: 'Classic technique',
    tags: ['fx', 'noise', 'ambient'], level: 1,
    blurb: 'No oscillators at all: filtered noise that howls like wind.',
    how: 'Noise contains every frequency at once. A resonant filter picks out a band of it, and the ear hears that band as a pitch, like wind across a gap. Moving the cutoff slowly makes the wind rise and fall. Hold a note (or use Hold) and sweep the cutoff by hand.',
    phrase: { bpm: 40, loop: true, steps: [[0, 60, 7.8]] },
    steps: [
      { title: 'Noise only', module: 'mixer', why: 'No oscillators at all. Noise contains every frequency at once, and it is the raw material for wind, surf and steam.\n- OSC 1–3 off: Oscillator 1 is on by default, so switching it off leaves nothing pitched in the mixer.\n- NOISE on, NOISE VOLUME 8: noise into the filter at a strong level.\n- Noise colour PINK: pink has less top end than white, so it sounds deeper and more like weather. White sounds like steam or a hi-hat.\n- Listen for: hold a key and hear a steady rush. Flip the colour to WHITE and back to hear the hiss rise and fall.',
        set: { 'mix.osc1On': false, 'mix.osc2On': false, 'mix.osc3On': false, 'mix.noiseOn': true, 'mix.noise': 8, 'noise.colour': 'pink' } },
      { title: 'Resonant filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass: it lets through what is below the cutoff. With high resonance it picks out a narrow band of the noise, and the ear hears that band as a pitch, like wind across a gap.\n- CUTOFF −0.5 (about 450 Hz): the pitch of the wind. Sweep it by hand for gusts: left is a low moan, right a thinner whistle.\n- EMPHASIS 7.6: Moog’s name for resonance. High, so the noise takes on a whistling pitch. Lower it for surf and rain; raise it for a howling gale.\n- AMOUNT OF CONTOUR 0: the filter envelope (Moog calls envelopes contours) does nothing, so only your hand, and later the LFO, move the cutoff.\n- Listen for: hold a note and turn CUTOFF slowly both ways. The whistle rises and falls with it.',
        set: { 'filter.cutoff': -0.5, 'filter.emphasis': 7.6, 'filter.contour': 0 } },
      { title: 'Slow swell', module: 'amp', why: 'The loudness contour is Moog’s name for the volume envelope, what other synths call the VCA (voltage-controlled amplifier) envelope. Long times let each gust fade in and out.\n- ATTACK 1.4 s: the wind swells up over more than a second instead of starting abruptly.\n- SUSTAIN 10: while the key is held the wind keeps blowing at full level.\n- DECAY 1.6 s with LOUDNESS DECAY on: with sustain at full, DECAY acts as the release, so the wind dies away slowly after you let go.\n- Listen for: hold a key and the gust builds; let go and it fades out over a second or more.', set: { 'aenv.attack': 6.4, 'aenv.decay': 6.6, 'aenv.sustain': 10, 'env.loudDecay': true } },
      { title: 'Let the LFO move the cutoff', module: 'mod', why: 'The LFO (low-frequency oscillator, a slow wave used to move other controls) takes over the cutoff sweep, so the wind rises and falls on its own.\n- Mod source B LFO, MOD MIX 10: the mix knob fully right takes only the LFO.\n- LFO shape triangle, RATE 0.16 Hz: a smooth rise and fall about once every six seconds. Faster sounds like gusts; slower like a long swell.\n- FILTER MODULATION on: sends the mod signal to the cutoff rather than pitch.\n- MOD DEPTH 5: how far the LFO moves the cutoff. More gives a wider sweep from moan to whistle.\n- Listen for: hold a key (or use Hold) and hear the pitch of the wind drift up and down by itself.',
        set: { 'mod.toFilter': true, 'mod.srcB': 'lfo', 'mod.mix': 10, 'lfo.shape': 'tri', 'lfo.rate': 1.4, 'mod.depth': 5 } },
    ],
    context: {
      'filter.cutoff': 'The pitch of the wind. Sweep it by hand for gusts.',
      'filter.emphasis': 'How whistly the wind is. Lower it for surf and rain; raise it for a howling gale.',
      'noise.colour': 'Pink sounds like weather. White sounds like steam or a hi-hat.',
      'lfo.rate': 'How often the wind rises and falls.',
    },
    tweaks: [
      { id: 'filter.emphasis', try: 'Drop to 2 and lower cutoff to −2', hear: 'The whistle goes and you are left with distant surf.' },
      { id: 'mod.srcB', try: 'Switch to NOISE', hear: 'Noise modulating the filter makes a rough, crackling texture.' },
      { id: 'aenv.decay', try: 'Set attack 0, decay 2, sustain 0, white noise', hear: 'A snare-like burst — the start of synth percussion.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'model-d', name: 'Model D', maker: 'Behringer', year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'Three oscillators and noise feed a mixer, then the 24 dB ladder filter and the amplifier. Two envelopes shape filter and loudness; one mod bus adds vibrato, sweeps and FM.',
  view: { w: 2000, h: 716 },
  theme: { panel: '#1b1c1e', panel2: '#121314', ink: '#ecebe6', font: 'din', cheeks: 'wood', cheekW: 40 },
  signalNames: { env1: 'the filter contour', env2: 'the loudness contour', mixer: 'the mixer output (oscillators and noise)' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
