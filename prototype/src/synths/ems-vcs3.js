// EMS VCS3 Mk 1 — SynthDef. There is no flat photo of both panels, so the faceplate is laid out from the user's photo
// and the manual: the sloping upper panel on the left (x 40–1130), the flat lower panel with the pin matrix, joystick and
// output amplifiers on the right (x 1170–2060), with the wooden divider between them.
//
// Voltages: an engine signal of 1 is 1 V on a matrix row. Each row's numbered LEVEL knob scales its row (the row jack's
// `gain`, in volts at full level, from the manual's output figures). Each pin is a 2.7 kΩ resistor into a 10 kΩ input,
// so a column sees 0.79 of the row voltage; the column jacks' `amt` folds that in with the manual's control sensitivities.
import { annotate, clamp, expMap, pwl, fmtTime, fmtHz } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/ems-vcs3.js';
import lineage from '@/synths/lineage/ems-vcs3.js';
import unusual from '@/synths/unusual/ems-vcs3.js';

const INK = '#18191b';
const PANEL = '#d7d8d3';
const PIN = 10 / 12.7; // a 2.7 kΩ pin into a 10 kΩ input

// ── Scales ────────────────────────────────────────────────────────────────
// Oscillators 1 and 2: 1.5 octaves per division, 261.6 Hz at 6 (the manual's calibration table). Oscillator 3 is the
// same law about 20 times slower: 500 Hz at 10, 2.76 Hz at 5.
const osc12Hz = (v) => 261.6 * Math.pow(2, 1.5 * (v - 6));
const osc3Hz = (v) => 500 * Math.pow(2, 1.5 * (v - 10));
const noteOf = (hz) => 69 + (12 * Math.log(hz / 440)) / Math.LN2;
const vcfHz = (v) => expMap(v / 10, 5, 10000);
// RESPONSE: low-pass at 0, a sharp peak at about 5 to 6, oscillating a little beyond
const RES_PTS = [[0, 0], [3, 0.35], [5, 0.84], [6, 0.97], [6.6, 1.02], [10, 1.12]];
const attackS = (v) => expMap(v / 10, 0.002, 1);
const onS = (v) => 2.5 * Math.pow(v / 10, 2);
const decayS = (v) => expMap(v / 10, 0.003, 15);
const OFF_MANUAL = 6; // OFF past here: the envelope stops after each decay and waits for a key or the ATTACK button
const offS = (v) => expMap(v / OFF_MANUAL, 0.01, 5);
/** A numbered LEVEL knob: square law (the pots are log-taper), `peak` volts at 10. */
const lvl = (v, peak) => peak * Math.pow(clamp(v, 0, 10) / 10, 2);
// The ring modulator's gain: the manual's 1.5 V p-p inputs give 6 V p-p out, so 1 V times 1 V is about 5.3 V.
const RING_GAIN = 5.3;
// The engine's ladder settles into a quieter sine than the VCS3's filter/oscillator, so row 10 is lifted as RESPONSE
// takes it into oscillation (an app correction for the model, not a property of the hardware).
const filterOscBoost = (v) => 1 + 3.5 * clamp((pwl(v['vcf.response'], RES_PTS) - 0.9) / 0.2, 0, 1);
const fmtV = (x) => `${x < 0.095 ? (Math.round(x * 100) / 100) : Math.round(x * 10) / 10} V`;

// Knob caps, as on the panel
const CAP = { yellow: '#efd640', green: '#2f9a4a', white: '#f1f1ec', red: '#b4232a', blue: '#4f8fcf', black: '#202124' };
const S10 = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, size: 11, numR: 1.6, tickR: 1.24 };

const controls = [];
const decor = [];
const jacks = [];
const text = (x, y, t, size = 14, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
const knob = (id, x, y, cap, rest) => controls.push({
  id, type: 'knob', x, y, r: 27, style: 'vcs3', cap: CAP[cap], kind: 'cont', min: 0, max: 10, labelPos: 'none', scale: S10, ...rest,
});
const dial = (id, x, y, rest) => controls.push({
  id, type: 'knob', x, y, r: 48, style: 'vcs3-dial', cap: CAP.yellow, kind: 'cont', min: 0, max: 10, labelPos: 'none', ...rest,
});
/** A black square with a white letter or number: the panel's link from a knob to its matrix row or column. */
const box = (x, y, t, size = 13) => {
  const w = Math.max(18, String(t).length * size * 0.62 + 8);
  decor.push({ t: 'rect', x: x - w / 2, y: y - size * 0.75, w, h: size * 1.5, r: 2, fill: INK });
  text(x, y + size * 0.36, String(t), size, { fill: PANEL, weight: 700 });
};
const frame = (x, y, w, h) => decor.push({ t: 'rect', x, y, w, h, r: 0, stroke: INK, sw: 2.2 });
const tab = (x, y, t, size = 15) => decor.push({ t: 'tab', x, y, text: t, size, gap: false });

// ── Cabinet ───────────────────────────────────────────────────────────────
decor.push({ t: 'rect', x: 1130, y: 0, w: 40, h: 1000, r: 0, fill: 'url(#kysWood)', hw: true });
decor.push({ t: 'line', x1: 1130, y1: 0, x2: 1130, y2: 1000, w: 3 }, { t: 'line', x1: 1170, y1: 0, x2: 1170, y2: 1000, w: 3 });
[[60, 14], [1110, 14], [60, 986], [1110, 986], [1190, 14], [2040, 14], [1190, 986], [2040, 986]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 7 }));

// ── Upper panel: frames ───────────────────────────────────────────────────
frame(50, 28, 550, 217); frame(50, 245, 550, 220); frame(50, 465, 550, 220);
frame(50, 685, 280, 290); frame(330, 685, 270, 290);
frame(600, 28, 145, 217); frame(745, 28, 375, 217);
frame(600, 245, 520, 220); frame(880, 465, 240, 220);
frame(600, 465, 280, 220); frame(600, 685, 280, 290); frame(880, 685, 240, 290);

// ── Oscillators ───────────────────────────────────────────────────────────
const OSC_Y = [150, 370, 590];
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  const top = y - 105;
  tab(135, top + 4, `OSCILLATOR ${n}`);
  text(112, top + 36, 'FREQUENCY', 13);
  box(178, top + 32, 'IJK'[n - 1]);
  text(60, y - 44, n === 3 ? '.05 Hz' : '1 Hz', 11, { anchor: 'start' });
  text(198, y - 44, n === 3 ? '500 Hz' : '10 KHz', 11, { anchor: 'end' });
  dial(`osc${n}.freq`, 128, y + 8, {
    def: n === 3 ? 5 : 6, module: n === 3 ? 'lfo' : 'osc',
    fmt: (v) => fmtHz(n === 3 ? osc3Hz(v) : osc12Hz(v)), name: `Oscillator ${n} FREQUENCY`,
    help: n === 3
      ? 'Speed of Oscillator 3, from about one cycle a minute at 0 to 500 Hz at 10. Below 7 it is too slow to hear as a note, which is what it is for: it is the VCS3’s main source of slow movement, the job an LFO does on other synths.'
      : `Pitch of Oscillator ${n}, from below 1 Hz to over 16 kHz. Each division is an octave and a half; 6 is middle C. The numbers are for noting a setting down, not a frequency scale.`,
  });
  text(265, top + 36, 'SHAPE', 13);
  knob(`osc${n}.shape`, 265, y + 8, 'green', {
    def: 5, module: n === 3 ? 'lfo' : 'osc', name: `Oscillator ${n} SHAPE`,
    help: n === 1
      ? 'Changes the sine output only. At 5 it is a pure sine; either side it folds over towards a rectified shape, adding harmonics: brighter one way up, the other way down.'
      : `Changes both of Oscillator ${n}’s outputs together. At 5 they are a square and a triangle; turn either way and the square narrows into a pulse while the triangle leans into a ramp. Near the ends the pulse almost disappears.`,
  });
  text(465, top + 30, 'LEVEL', 13);
  const waves = n === 1 ? ['sine', 'saw'] : ['sq', 'tri'];
  const rowN = [2 * n - 1, 2 * n];
  [405, 525].forEach((x, k) => {
    decor.push({ t: 'wave', x, y: top + 58, size: 13, shape: waves[k] });
    const word = n === 1 ? ['sine', 'ramp'][k] : ['square', 'triangle'][k];
    knob(`osc${n}.${n === 1 ? ['sine', 'ramp'][k] : ['square', 'tri'][k]}`, x, y + 8, 'white', {
      def: 0, module: n === 3 ? 'lfo' : 'osc', name: `Oscillator ${n} ${word} LEVEL`,
      fmt: (v) => fmtV(lvl(v, n === 1 ? [1.5, 2][k] : [2, 1.5][k])),
      help: `How much of Oscillator ${n}’s ${word} reaches matrix row ${rowN[k]}. It sets the level wherever that row is pinned, so at 0 every pin in row ${rowN[k]} does nothing.`,
    });
    box(x, y + 76, rowN[k]);
  });
});

// ── Noise and input levels ────────────────────────────────────────────────
tab(150, 707, 'NOISE GENERATOR');
text(125, 762, 'COLOUR', 13);
text(125, 790, 'White', 11);
knob('noise.colour', 125, 850, 'white', {
  def: 5, module: 'osc', scale: { ticks: 11, labels: [{ at: 0, text: 'Low' }, { at: 10, text: 'High' }], size: 11, numR: 1.75, tickR: 1.24 },
  help: 'The colour of the noise. At 5 it is white noise, hissing evenly at all pitches. Turn left for darker, rumbling noise (the high end taken away); turn right for thin, hissy noise (the low end taken away).',
});
text(255, 762, 'LEVEL', 13);
knob('noise.level', 255, 850, 'white', { def: 0, module: 'osc', fmt: (v) => fmtV(lvl(v, 1.5)), name: 'Noise LEVEL', help: 'How much noise reaches matrix row 7.' });
box(255, 918, 7);

tab(465, 707, 'INPUT LEVEL');
text(400, 762, 'CHANNEL 1', 13);
text(525, 762, 'CHANNEL 2', 13);
knob('in.ch1', 400, 850, 'white', {
  def: 5, module: 'util', name: 'INPUT LEVEL CHANNEL 1',
  fmt: (v) => `${Math.round(v * 20) / 10} semitones per key`,
  help: 'Gain of input channel 1, which puts the keyboard’s pitch voltage on matrix row 8. Pin row 8 to an oscillator’s frequency column to play it from the keys. At 5 Oscillators 1 and 2 play one semitone per key; lower squeezes the notes together, higher spreads them apart.',
});
knob('in.ch2', 525, 850, 'white', {
  def: 0, module: 'util', name: 'INPUT LEVEL CHANNEL 2',
  help: 'Gain of input channel 2, onto matrix row 9. Nothing is plugged into it in this app, so it does nothing here.',
});
box(400, 918, 8); box(525, 918, 9);

// ── Ring modulator and filter ─────────────────────────────────────────────
tab(672, 50, 'RING MODULATOR', 13);
box(628, 80, 'E'); text(672, 85, 'LEVEL', 13); box(716, 80, 'F');
knob('ring.level', 672, 158, 'white', { def: 0, module: 'util', fmt: (v) => `×${Math.round(lvl(v, RING_GAIN) * 10) / 10}`, name: 'Ring modulator LEVEL', help: 'How much of the ring modulator’s output reaches matrix row 13. The ring modulator multiplies whatever is pinned into columns E and F.' });
box(672, 226, 13);

tab(890, 50, 'FILTER/OSCILLATOR');
box(1000, 50, 'H');
text(810, 85, 'FREQUENCY', 13); box(865, 81, 'N');
knob('vcf.freq', 810, 158, 'green', {
  def: 6, module: 'filter', fmt: (v) => fmtHz(vcfHz(v)), name: 'Filter FREQUENCY',
  help: 'The filter’s cut-off frequency, from 5 Hz to 10 kHz. Above it the sound is cut away, so turning left makes whatever goes through darker. With RESPONSE high it is the pitch of the filter’s own sine tone.',
});
text(935, 85, 'RESPONSE', 13);
knob('vcf.response', 935, 158, 'yellow', {
  def: 0, module: 'filter', scale: { ticks: 11, labels: [{ at: 0, text: 'Low Pass' }, { at: 10, text: 'Osc.' }], size: 11, numR: 1.85, tickR: 1.24 },
  fmt: (v) => (v >= 6.6 ? 'oscillating' : v >= 4.5 ? 'sharp peak' : 'low-pass'),
  help: 'Resonance. At 0 the filter just cuts the top off. Around 5 to 6 it rings sharply at the FREQUENCY setting; a little further and it whistles on its own, a pure sine tone that needs nothing pinned into it.',
});
text(1060, 85, 'LEVEL', 13);
knob('vcf.level', 1060, 158, 'white', { def: 0, module: 'filter', fmt: (v) => fmtV(lvl(v, 2)), name: 'Filter LEVEL', help: 'How much of the filter’s output reaches matrix row 10.' });
box(1060, 226, 10);

// ── Envelope shaper ───────────────────────────────────────────────────────
tab(705, 267, 'ENVELOPE SHAPER');
box(803, 267, 'D');
const ENV_Y = 382;
text(665, 302, 'ATTACK', 13);
decor.push({ t: 'led', x: 727, y: 300, r: 8, color: 'red', litWhen: 'env1' });
text(790, 302, 'ON', 13);
text(925, 302, 'DECAY', 13); box(966, 298, 'L');
text(1050, 302, 'OFF', 13);
const tScale = (lo, hi) => ({ ticks: 11, labels: [{ at: 0, text: lo }, { at: 10, text: hi }], size: 11, numR: 1.78, tickR: 1.24 });
knob('env.attack', 665, ENV_Y, 'red', {
  def: 0, module: 'env', scale: tScale('Fast', 'Slow'), fmt: (v) => fmtTime(attackS(v)), name: 'Envelope ATTACK',
  help: 'How long the envelope takes to rise, from 2 ms to 1 second.',
});
knob('env.on', 790, ENV_Y, 'red', {
  def: 2, module: 'env', scale: tScale('0', 'Long'), fmt: (v) => fmtTime(onS(v)), name: 'Envelope ON',
  help: 'How long the envelope stays at the top before it falls, up to 2.5 seconds. When a key or the ATTACK button starts it, it also stays up for as long as you hold on.',
});
knob('env.decay', 925, ENV_Y, 'red', {
  def: 4, module: 'env', scale: tScale('Fast', 'Slow'), fmt: (v) => fmtTime(decayS(v)), name: 'Envelope DECAY',
  help: 'How long the envelope takes to fall back, from 3 ms to 15 seconds. Pins in column L lengthen or shorten it.',
});
knob('env.off', 1050, ENV_Y, 'red', {
  def: 10, module: 'env', scale: tScale('0', 'Manual'), fmt: (v) => (v >= OFF_MANUAL ? 'manual: waits for a key' : `repeats, off ${fmtTime(offS(v))}`),
  help: 'The rest between cycles. Below about 6 the envelope runs round and round on its own, resting this long between cycles. Past 6 it stops after each decay and waits for a key or the ATTACK button.',
});
text(1000, 487, 'LEVEL', 13);
text(945, 516, 'TRAPEZOID', 12); text(1060, 516, 'SIGNAL', 12);
knob('env.trapLevel', 945, 592, 'blue', {
  def: 0, module: 'env', fmt: (v) => fmtV(lvl(v, 3)), name: 'TRAPEZOID LEVEL',
  help: 'How much of the envelope itself, the trapezoid control voltage, reaches matrix row 11. Pin it to a frequency column to sweep pitch or the filter with each envelope.',
});
knob('env.sigLevel', 1060, 592, 'white', {
  def: 0, module: 'env', fmt: (v) => fmtV(lvl(v, 2.5)), name: 'Envelope SIGNAL LEVEL',
  help: 'How much of the shaped signal reaches matrix row 12: whatever is pinned into column D, made louder and quieter by the envelope.',
});
box(945, 660, 11); box(1060, 660, 12);

// ── Reverberation ─────────────────────────────────────────────────────────
tab(700, 487, 'REVERBERATION');
box(790, 487, 'G');
text(675, 522, 'MIX', 13); box(708, 518, 'M');
knob('rev.mix', 675, 592, 'blue', {
  def: 5, module: 'fx', scale: tScale('Dry', 'Reverb'), fmt: (v) => `${Math.round(v * 9.5)}% spring`, name: 'Reverb MIX',
  help: 'The balance of the reverberation unit’s output, from the dry signal at 0 to nearly all spring at 10. Pins in column M move it.',
});
text(800, 522, 'LEVEL', 13);
knob('rev.level', 800, 592, 'white', { def: 0, module: 'fx', fmt: (v) => fmtV(lvl(v, 2)), name: 'Reverb LEVEL', help: 'How much of the reverberation unit’s output reaches matrix row 14.' });
box(800, 660, 14);

// ── Output filters and speakers ───────────────────────────────────────────
tab(740, 707, 'OUTPUT FILTER');
text(675, 742, 'CHANNEL 1', 13); text(800, 742, 'CHANNEL 2', 13);
[1, 2].forEach((ch) => {
  const x = ch === 1 ? 675 : 800;
  knob(`out${ch}.filter`, x, 822, 'white', {
    def: 5, module: 'out', scale: tScale('Low', 'High'), name: `OUTPUT FILTER CHANNEL ${ch}`,
    fmt: (v) => (Math.abs(v - 5) < 0.15 ? 'flat' : v < 5 ? 'treble cut' : 'bass cut'),
    help: `Tone of output channel ${ch}. At 5 it is flat. Turn left to cut the treble, right to cut the bass. Put it back to 5 for each new patch.`,
  });
  controls.push({
    id: `out${ch}.speaker`, type: 'toggle', w: 20, x, y: 922, kind: 'bool', def: true, module: 'out', labelPos: 'none', name: `Speaker ${ch} switch`,
    help: `Switches the internal speaker of channel ${ch} on (up) or off. This app plays the L and R signal outputs, which the switch does not affect, so it changes nothing here.`,
  });
  text(x + 22, 914, 'ON', 10, { anchor: 'start' });
  text(x + 22, 942, 'MUTE', 10, { anchor: 'start' });
});
text(738, 962, 'SPEAKERS', 11);

// ── Meter ─────────────────────────────────────────────────────────────────
decor.push(
  { t: 'rect', x: 920, y: 728, w: 150, h: 120, r: 6, fill: '#f6f5ee', stroke: '#9a9a95', sw: 3 },
  { t: 'arc', x: 995, y: 830, r: 72, a0: -50, a1: 50, w: 2 },
);
for (let k = 0; k <= 10; k++) {
  const a = (-50 + 10 * k) * (Math.PI / 180);
  decor.push({ t: 'line', x1: 995 + Math.sin(a) * 72, y1: 830 - Math.cos(a) * 72, x2: 995 + Math.sin(a) * (k % 5 ? 64 : 58), y2: 830 - Math.cos(a) * (k % 5 ? 64 : 58), w: 1.5 });
}
decor.push({ t: 'line', x1: 995, y1: 830, x2: 955, y2: 776, w: 2.5 }, { t: 'circle', x: 995, y: 832, r: 8, fill: '#2a2a2c', sw: 1 });
box(995, 872, 'A');
controls.push({
  id: 'meter.mode', type: 'toggle', w: 20, x: 1092, y: 790, kind: 'enum', ui: true, module: 'util', labelPos: 'none', name: 'METER range switch',
  options: [{ v: 'signal', label: 'SIGNAL LEVELS' }, { v: 'control', label: 'CONTROL VOLTAGES' }], def: 'signal',
  help: 'Sets the meter to read signal levels (an AC level, zero on the left) or control voltages (DC, zero in the middle). The meter reads matrix column A. It is drawn for reference: its needle does not move in this app.',
});
text(1092, 740, 'SIGNAL\nLEVELS', 10);
text(1092, 828, 'CONTROL\nVOLTS', 10);
text(1000, 958, 'METER', 12);

// ── Lower panel: the matrix ───────────────────────────────────────────────
const MX = 1400, MY = 182, MP = 30;
decor.push({ t: 'rect', x: MX - 21, y: MY - 21, w: MP * 15 + 42, h: MP * 15 + 42, r: 4, fill: '#121214', stroke: INK, sw: 2 });
decor.push(
  { t: 'line', x1: MX + MP * 7.5, y1: MY - 21, x2: MX + MP * 7.5, y2: MY + MP * 15 + 21, w: 2, opacity: 0.6 },
  { t: 'line', x1: MX - 21, y1: MY + MP * 7.5, x2: MX + MP * 15 + 21, y2: MY + MP * 7.5, w: 2, opacity: 0.6 },
);
text(MX + MP * 3.5, 30, 'SIGNAL INPUTS', 12, { weight: 700 });
text(MX + MP * 11.5, 30, 'CONTROL INPUTS', 12, { weight: 700 });
decor.push({ t: 'path', d: `M${MX - 8} 44 V38 H${MX + MP * 7 + 8} V44 M${MX + MP * 8 - 8} 44 V38 H${MX + MP * 15 + 8} V44`, w: 1.5 });
text(1290, 160, 'SOURCES', 12, { weight: 700 });

const rowIds = [];
const colIds = [];
/** A matrix row: an output jack drawn as its legend, `gain` = its numbered LEVEL knob in volts. */
const row = (n, id, label, signal, gain, help, rest = {}) => {
  const y = MY + (n - 1) * MP;
  rowIds.push(id);
  jacks.push({ id, x: 1285, y, r: 12, label, name: `${label} (row ${n})`, labelPos: 'none', dir: 'out', signal, gain, help, ...rest });
  text(1372, y + 5, String(n), 13, { anchor: 'end', weight: 700 });
  text(1186, y + 5, label, 13, { anchor: 'start' });
};
/** A matrix column: an input jack drawn as its letter and its name standing above it. Pins add, so every column sums. */
const col = (k, id, letter, label, dest, amt, help, rest = {}) => {
  const x = MX + k * MP;
  colIds.push(id);
  jacks.push({ id, x, y: 104, r: 12, label, name: `${label} (column ${letter})`, labelPos: 'none', dir: 'in', dest, amt, add: true, help, ...rest });
  text(x, MY - 26, letter, 13, { weight: 700 });
  text(x + 4, 138, label, 11, { anchor: 'start', rotate: -90 });
};
const levelCheck = (id, knobName, n) => (v) => (v[id] <= 0 ? `${knobName} is at 0, so nothing leaves row ${n}. Turn it up.` : null);

row(1, 'r.osc1sine', 'Osc 1 sine', 'o1sine', (v) => lvl(v['osc1.sine'], 1.5), 'Oscillator 1’s sine wave, at the level of its sine LEVEL knob (marked 1). The SHAPE knob bends it.', { check: levelCheck('osc1.sine', 'Oscillator 1 sine LEVEL', 1) });
row(2, 'r.osc1ramp', 'Osc 1 ramp', 'o1saw', (v) => lvl(v['osc1.ramp'], 2), 'Oscillator 1’s ramp (a sawtooth), at the level of its ramp LEVEL knob (marked 2).', { check: levelCheck('osc1.ramp', 'Oscillator 1 ramp LEVEL', 2) });
row(3, 'r.osc2sq', 'Osc 2 square', 'o2pulse', (v) => lvl(v['osc2.square'], 2), 'Oscillator 2’s square, a pulse when SHAPE is off centre, at the level of the knob marked 3.', { check: levelCheck('osc2.square', 'Oscillator 2 square LEVEL', 3) });
row(4, 'r.osc2tri', 'Osc 2 triangle', 'o2tri', (v) => lvl(v['osc2.tri'], 1.5), 'Oscillator 2’s triangle, a ramp when SHAPE is off centre, at the level of the knob marked 4.', { check: levelCheck('osc2.tri', 'Oscillator 2 triangle LEVEL', 4) });
row(5, 'r.osc3sq', 'Osc 3 square', 'o3pulse', (v) => lvl(v['osc3.square'], 2), 'Oscillator 3’s square or pulse, at the level of the knob marked 5. At low settings of its FREQUENCY it is a slow on-off switch.', { check: levelCheck('osc3.square', 'Oscillator 3 square LEVEL', 5) });
row(6, 'r.osc3tri', 'Osc 3 triangle', 'o3tri', (v) => lvl(v['osc3.tri'], 1.5), 'Oscillator 3’s triangle or ramp, at the level of the knob marked 6. Slow, it is the VCS3’s usual sweep and vibrato source.', { check: levelCheck('osc3.tri', 'Oscillator 3 triangle LEVEL', 6) });
row(7, 'r.noise', 'Noise', 'noise', (v) => lvl(v['noise.level'], 1.5), 'The noise generator, coloured by COLOUR, at the level of the knob marked 7.', { check: levelCheck('noise.level', 'Noise LEVEL', 7) });
row(8, 'r.in1', 'Input ch 1 (keyboard)', 'kbd', (v) => -0.081 * v['in.ch1'], 'Input channel 1. In this app the keyboard is plugged into it, as an EMS DK1 keyboard would be, so this row carries the pitch of the last key played. The input amplifier turns the voltage upside down; the oscillators rise in pitch as their voltage falls, so the two cancel and higher keys play higher notes.', { check: levelCheck('in.ch1', 'INPUT LEVEL CHANNEL 1', 8) });
row(9, 'r.in2', 'Input ch 2', null, 0, 'Input channel 2. Nothing is plugged into it in this app, so this row is always silent.');
row(10, 'r.vcf', 'Filter', 'vcf1', (v) => lvl(v['vcf.level'], 2) * filterOscBoost(v), 'The filter’s output, at the level of the filter LEVEL knob (marked 10).', { check: levelCheck('vcf.level', 'Filter LEVEL', 10) });
row(11, 'r.trap', 'Trapezoid', 'trap', (v) => lvl(v['env.trapLevel'], 3), 'The envelope shaper’s control voltage, the trapezoid, at the level of the knob marked 11. It goes negative while the envelope is up and positive while it rests.', { check: levelCheck('env.trapLevel', 'TRAPEZOID LEVEL', 11) });
row(12, 'r.envsig', 'Envelope signal', 'vca', (v) => lvl(v['env.sigLevel'], 2.5), 'Whatever is pinned into column D, shaped by the envelope, at the level of the SIGNAL knob (marked 12).', { check: levelCheck('env.sigLevel', 'Envelope SIGNAL LEVEL', 12) });
row(13, 'r.ring', 'Ring modulator', 'ring', (v) => lvl(v['ring.level'], RING_GAIN), 'The ring modulator’s output: columns E and F multiplied, at the level of the knob marked 13.', { check: levelCheck('ring.level', 'Ring modulator LEVEL', 13) });
row(14, 'r.rev', 'Reverberation', 'rev', (v) => lvl(v['rev.level'], 2), 'The reverberation unit’s output, already mixed dry and wet by MIX, at the level of the knob marked 14.', { check: levelCheck('rev.level', 'Reverb LEVEL', 14) });
row(15, 'r.joyx', 'Stick (horizontal)', 'joyX', (v) => (2 * v['joy.rangeX']) / 10, 'The joystick’s left-right position: 0 V in the middle, up to 2 V either way, scaled by the RANGE knob marked 15.', { check: levelCheck('joy.rangeX', 'The horizontal RANGE', 15) });
row(16, 'r.joyy', 'Stick (vertical)', 'joyY', (v) => (2 * v['joy.rangeY']) / 10, 'The joystick’s up-down position: 0 V in the middle, up to 2 V either way, scaled by the RANGE knob marked 16.', { check: levelCheck('joy.rangeY', 'The vertical RANGE', 16) });

// What the explainer says for columns whose effect the generic text cannot know. `x` = the source as the explainer sees it.
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const slow = (x) => !['audio', 'noise', 'fast'].includes(x.kind);
const panWord = (p) => (p <= 1.5 ? 'left' : p >= 8.5 ? 'right' : p > 3.5 && p < 6.5 ? 'centre' : p < 5 ? 'left of centre' : 'right of centre');
const outHear = (ch, lvlCol) => (v, x) => (slow(x)
  ? `${cap(x.src)} is a control voltage, not a sound, so at output channel ${ch} it gives clicks at most. On the hardware this is how a voltage leaves the VCS3: the CONTROL OUTPUT ${ch} socket on the back carries column ${ch === 1 ? 'B' : 'C'}.`
  : `${cap(x.src)} goes to output channel ${ch}: through its amplifier, set by OUTPUT LEVEL and anything pinned into column ${lvlCol}, then its OUTPUT FILTER, then to the ${panWord(v[`out${ch}.pan`])} of the stereo output.`);
const outCheck = (ch, lvlCol) => (v) => (!v['power'] ? 'The mains switch is off.'
  : v[`out${ch}.level`] <= 5 ? `OUTPUT LEVEL ${ch} is at ${Math.round(v[`out${ch}.level`] * 10) / 10}. Its amplifier only opens past 5 (unless a voltage is pinned into column ${lvlCol}), so turn it up past 5.` : null);
const lvlHear = (ch) => (v, x) => {
  const what = `the loudness of output channel ${ch}`;
  if (x.kind === 'env') return `${cap(x.src)} now moves ${what}. It swings negative while the envelope is up, so the channel gets quieter as each envelope rises and comes back as it falls: an upside-down envelope. Its resting voltage also opens the channel, so turn OUTPUT LEVEL down to compensate.`;
  if (x.kind === 'lfo') return `Tremolo: ${what} rises and falls with ${x.live}. Pin a slow oscillator here and another to the other channel, a little out of step, and the sound swings between the speakers.`;
  if (x.kind === 'audio' || x.kind === 'noise') return `${cap(x.src)} shakes ${what} at audio rate: amplitude modulation, which adds ring-modulator-like overtones.`;
  return `${cap(x.src)} now adds to OUTPUT LEVEL ${ch}: a higher voltage opens the channel further, a lower one closes it.`;
};

col(0, 'c.meter', 'A', 'Meter', null, 1, 'The meter, and the SCOPE socket on the back. Pins here are measured, not heard. The meter is drawn for reference: its needle does not move in this app.');
col(1, 'c.out1', 'B', 'Output ch 1', 'out1In', PIN, 'Output channel 1. Anything pinned here goes through its amplifier and OUTPUT FILTER to the outputs. Every patch has to end in column B or C to be heard.', { hear: outHear(1, 'O'), check: outCheck(1, 'O') });
col(2, 'c.out2', 'C', 'Output ch 2', 'out2In', PIN, 'Output channel 2. Anything pinned here goes through its amplifier and OUTPUT FILTER to the outputs.', { hear: outHear(2, 'P'), check: outCheck(2, 'P') });
col(3, 'c.env', 'D', 'Envelope in', 'vcaIn', PIN, 'The envelope shaper’s signal input. What is pinned here comes out on row 12, made louder and quieter by the envelope.', {
  hear: (v, x) => (slow(x) ? `${cap(x.src)} is a control voltage, not a sound; the envelope shaper would only make it rise and fall in steps.`
    : `${cap(x.src)} now goes through the envelope shaper’s amplifier: it rises and falls with each envelope. It comes out on row 12 at the SIGNAL LEVEL knob, so pin row 12 to an output to hear it.`),
});
col(4, 'c.ringA', 'E', 'Ring mod A', 'ringA', PIN, 'Ring modulator input A. The output, on row 13, is input A times input B: neither pitch survives, only their sum and difference.');
col(5, 'c.ringB', 'F', 'Ring mod B', 'ringB', PIN, 'Ring modulator input B. Both inputs block steady voltages, so a slow signal only gets through while it is changing.');
col(6, 'c.rev', 'G', 'Reverb in', 'revIn', PIN, 'The reverberation unit’s input. Its output, already mixed dry and wet by MIX, is on row 14.', {
  hear: (v, x) => `${cap(x.src)} now feeds the spring reverberation unit. It comes out on row 14 at the reverb LEVEL knob, mixed ${v['rev.mix'] < 1 ? 'almost all dry' : v['rev.mix'] > 8 ? 'almost all spring' : 'dry and spring'} by MIX. Pin row 14 to an output to hear it.`,
});
col(7, 'c.vcf', 'H', 'Filter in', 'vcfIn', PIN, 'The filter’s signal input. The filtered sound comes out on row 10.', {
  hear: (v, x) => (slow(x) ? `${cap(x.src)} is a control voltage, not a sound. Fed into the filter it gives clicks at most${v['vcf.response'] >= 5 ? ', though with RESPONSE this high each click makes the filter ring' : ''}.`
    : `The filter now takes ${x.src}. Turn FREQUENCY down to darken it and RESPONSE up to make it ring. The result is on row 10 at the filter LEVEL knob, so pin row 10 to an output (or to column D first, to give it an envelope).`),
});
const pitchHear = (n) => (v, x) => {
  if (x.kind !== 'kbd') return null;
  const per = x.amount / 12;
  return `Oscillator ${n} now follows the keyboard: ${Math.round(per * 100) / 100} semitones per key${Math.abs(per - 1) < 0.04 ? ', in tune' : per < 1 ? ', so scales come out squeezed' : ', so scales come out stretched'}. FREQUENCY still sets where the keyboard starts.${n === 3 ? ' Oscillator 3 is more sensitive than the other two, so the same INPUT LEVEL spreads its notes wider.' : ''}`;
};
col(8, 'c.osc1', 'I', 'Osc 1 frequency', 'pitch1', (-12 * PIN) / 0.32, 'Oscillator 1’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the pitch.', { hear: pitchHear(1) });
col(9, 'c.osc2', 'J', 'Osc 2 frequency', 'pitch2', (-12 * PIN) / 0.32, 'Oscillator 2’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the pitch.', { hear: pitchHear(2) });
col(10, 'c.osc3', 'K', 'Osc 3 frequency', 'pitch3', (-12 * PIN) / 0.26, 'Oscillator 3’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the speed.', { hear: pitchHear(3) });
col(11, 'c.decay', 'L', 'Envelope decay', 'decayCv', PIN / 0.4, 'The envelope’s decay time. A rising voltage lengthens DECAY, doubling it for every 0.4 V, and so also slows the repeats.', {
  hear: (v, x) => (x.kind === 'lfo' || x.kind === 'env'
    ? `${cap(x.live)} now lengthens and shortens each DECAY as it moves, so the envelopes ring for different lengths and, while the envelope repeats, come at an uneven pace.`
    : x.kind === 'kbd' ? 'Each note’s DECAY now depends on the key: higher keys give shorter notes.'
      : `${cap(x.src)} now moves the DECAY time quickly, so each envelope falls in a ragged, uneven way.`),
});
col(12, 'c.revMix', 'M', 'Reverb mix', 'revMix', PIN / 4, 'The reverberation unit’s MIX. A rising voltage makes it wetter: −2 V is dry and +2 V full.', {
  hear: (v, x) => (x.kind === 'lfo' || x.kind === 'env' ? `The reverb comes and goes with ${x.live}: wetter as the voltage rises, drier as it falls.`
    : `${cap(x.src)} now moves the reverb MIX, so the amount of spring changes with it.`),
});
col(13, 'c.cutoff', 'N', 'Filter frequency', 'cutoff', -PIN / 0.2, 'The filter’s frequency control. Pins here add to the FREQUENCY knob. A voltage that goes down raises the frequency.');
col(14, 'c.lvl1', 'O', 'Output ch 1 level', 'out1Lvl', PIN * 0.5, 'Output channel 1’s level control. A voltage here adds to the OUTPUT LEVEL knob, which is itself a control voltage.', { hear: lvlHear(1) });
col(15, 'c.lvl2', 'P', 'Output ch 2 level', 'out2Lvl', PIN * 0.5, 'Output channel 2’s level control. A voltage here adds to the OUTPUT LEVEL knob, which is itself a control voltage.', { hear: lvlHear(2) });

// ── Lower panel: ATTACK button, power, output amplifiers, joystick ────────
text(1968, 196, 'ATTACK', 13, { weight: 700 });
controls.push({
  id: 'env.button', type: 'button', w: 46, h: 46, x: 1968, y: 245, kind: 'bool', def: false, module: 'env', labelPos: 'none', name: 'ATTACK button',
  face: 'ring', faceColor: 'red', caption: '',
  help: 'Starts the envelope by hand, like a key. Click to hold it down (lit) and click again to let go: the envelope stays at the top for as long as it is held, then decays.',
});
text(1968, 62, 'MAINS', 13, { weight: 700 });
controls.push({
  id: 'power', type: 'toggle', w: 22, x: 1940, y: 102, kind: 'bool', def: true, module: 'out', labelPos: 'none', name: 'MAINS switch',
  help: 'Power. Off silences everything.',
});
decor.push({ t: 'led', x: 2000, y: 102, r: 8, color: 'red', litWhen: { id: 'power', eq: true } });

tab(1300, 700, 'OUTPUT CH 1');
box(1378, 700, 'B'); box(1400, 700, 'O');
tab(1555, 700, 'OUTPUT CH 2');
box(1633, 700, 'C'); box(1655, 700, 'P');
const outLevelScale = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 12, numR: 1.55, tickR: 1.22 };
[1, 2].forEach((ch) => {
  const lx = ch === 1 ? 1255 : 1610, px = ch === 1 ? 1365 : 1500;
  text(lx, 760, 'LEVEL', 13); text(px, 760, 'PAN (EXT)', 13);
  controls.push({
    id: `out${ch}.level`, type: 'knob', x: lx, y: 850, r: 36, style: 'vcs3', cap: CAP.white, kind: 'cont', min: 0, max: 10, def: 8,
    module: 'out', labelPos: 'none', scale: outLevelScale, name: `OUTPUT LEVEL CHANNEL ${ch}`,
    fmt: (v) => (v <= 5 ? 'shut (opens past 5)' : `${Math.round((v - 5) * 20)}% open`),
    help: `Level of output channel ${ch}. The knob is a control voltage for the channel’s amplifier, not a plain volume: with nothing pinned into column ${ch === 1 ? 'O' : 'P'} the sound only comes in past half way, and a voltage pinned there adds to it.`,
  });
  controls.push({
    id: `out${ch}.pan`, type: 'knob', x: px, y: 850, r: 29, style: 'vcs3', cap: CAP.green, kind: 'cont', min: 0, max: 10, def: ch === 1 ? 0 : 10,
    module: 'out', labelPos: 'none', scale: { ticks: 11, labels: [{ at: 0, text: 'Left' }, { at: 10, text: 'Right' }], size: 11, numR: 1.75, tickR: 1.24 },
    name: `PAN CHANNEL ${ch}`, fmt: (v) => panWord(v),
    help: `Where output channel ${ch} sits between the left and right outputs. The internal speakers do not pan; this app plays the panned L and R outputs.`,
  });
});
text(1438, 960, 'Every patch ends at column B or C: pin a row there, and turn LEVEL past 5', 11, { hw: true });

tab(1880, 700, 'JOYSTICK');
const rangeKnob = (id, y, n, axis) => {
  text(1748, y - 46, 'RANGE', 12);
  controls.push({
    id, type: 'knob', x: 1748, y, r: 24, style: 'vcs3', cap: CAP.blue, kind: 'cont', min: 0, max: 10, def: 5, module: 'mod', labelPos: 'none',
    scale: { ticks: 11, size: 10, numR: 1.6, tickR: 1.24 }, name: `RANGE (${axis})`, fmt: (v) => `±${Math.round(v * 2) / 10} V`,
    help: `How far the joystick’s ${axis} movement reaches: nothing at 0, up to 2 V either way at 10. It scales matrix row ${n}.`,
  });
  box(1748, y + 42, n);
};
rangeKnob('joy.rangeX', 790, 15, 'horizontal');
rangeKnob('joy.rangeY', 925, 16, 'vertical');
controls.push({
  id: 'joy.x', type: 'joystick', pair: 'joy.y', x: 1915, y: 850, r: 82, kind: 'cont', min: -1, max: 1, def: 0, module: 'mod', labelPos: 'none',
  name: 'Joystick (left-right)', fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
  help: 'The joystick. Its left-right position is a voltage on matrix row 15, scaled by the RANGE knob marked 15. Drag the stick; double-click to centre it.',
}, {
  id: 'joy.y', type: 'joystick', pairOf: 'joy.x', x: 1915, y: 851, r: 82, kind: 'cont', min: -1, max: 1, def: 0, module: 'mod', labelPos: 'none',
  name: 'Joystick (up-down)', fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
  help: 'The joystick’s up-down position, a voltage on matrix row 16 scaled by the RANGE knob marked 16. Drawn as part of the joystick.',
});

// ── Areas ─────────────────────────────────────────────────────────────────
const oscHelp = (n) => n === 3
  ? 'Oscillator 3 is built slow: from about a cycle a minute up to 500 Hz, so it is the VCS3’s source of sweeps, wobbles and trills, the job an LFO does elsewhere. Like Oscillator 2 it has a square (row 5) and a triangle (row 6), both changed by SHAPE. It is only audible near the top of its range.'
  : n === 1
    ? 'Oscillator 1 makes a sine (row 1) and a ramp (row 2), each with its own LEVEL knob. SHAPE bends the sine only. The large dial sets the pitch over the whole range, 1.5 octaves per division. Nothing is heard until a row is pinned to an output.'
    : 'Oscillator 2 makes a square (row 3) and a triangle (row 4). One SHAPE knob changes both: off centre the square becomes a pulse and the triangle a ramp. The large dial sets the pitch.';
const areas = [
  { id: 'osc1', label: 'Oscillator 1', module: 'osc', keywords: 'vco sine ramp sawtooth pitch frequency dial', rects: [{ x: 50, y: 28, w: 550, h: 217 }], help: oscHelp(1) },
  { id: 'osc2', label: 'Oscillator 2', module: 'osc', keywords: 'vco square pulse triangle pitch frequency dial pulse width', rects: [{ x: 50, y: 245, w: 550, h: 220 }], help: oscHelp(2) },
  { id: 'osc3', label: 'Oscillator 3', module: 'lfo', keywords: 'lfo vibrato wobble sweep slow modulation', rects: [{ x: 50, y: 465, w: 550, h: 220 }], help: oscHelp(3) },
  { id: 'noise', label: 'Noise generator', module: 'osc', keywords: 'white noise pink wind hiss colour', rects: [{ x: 50, y: 685, w: 280, h: 290 }],
    help: 'Noise for wind, surf, breath and percussion. COLOUR tilts it from a dark rumble through white noise to a thin hiss; LEVEL sets how much reaches row 7.' },
  { id: 'input', label: 'Input level', module: 'util', keywords: 'keyboard dk1 input amplifier external tracking', rects: [{ x: 330, y: 685, w: 270, h: 290 }],
    help: 'The two input amplifiers bring outside signals onto rows 8 and 9. In this app the keyboard is plugged into channel 1, as an EMS DK1 keyboard would be: pin row 8 to an oscillator’s frequency column to play it, and set CHANNEL 1 to about 5 for one semitone per key.' },
  { id: 'ring', label: 'Ring modulator', module: 'util', keywords: 'ring mod bell metallic multiply', rects: [{ x: 600, y: 28, w: 145, h: 217 }],
    help: 'Multiplies the two signals pinned into columns E and F. Neither input survives, only their sum and difference frequencies: bells, clangs and robot voices. Its LEVEL knob sets row 13.' },
  { id: 'filter', label: 'Filter/oscillator', module: 'filter', keywords: 'vcf cutoff resonance response sine oscillator', rects: [{ x: 745, y: 28, w: 375, h: 217 }],
    help: 'A low-pass filter for whatever is pinned into column H. FREQUENCY sets where it cuts and RESPONSE adds resonance; turn RESPONSE past about 6 and the filter becomes a pure sine oscillator. Its output is row 10. Column N moves FREQUENCY.' },
  { id: 'env', label: 'Envelope shaper', module: 'env', keywords: 'envelope trapezoid attack decay hold repeat loop vca amplifier', rects: [{ x: 600, y: 245, w: 520, h: 220 }, { x: 880, y: 465, w: 240, h: 220 }],
    help: 'An envelope with its own amplifier. ATTACK, ON (hold), DECAY and OFF (rest) make a cycle that repeats on its own until OFF is past about 6; then it waits for a key or the ATTACK button. Whatever is pinned into column D comes out on row 12 shaped by it, and the envelope itself, the trapezoid, is on row 11. The lamp is bright while the envelope is up.' },
  { id: 'reverb', label: 'Reverberation', module: 'fx', keywords: 'reverb spring echo space', rects: [{ x: 600, y: 465, w: 280, h: 220 }],
    help: 'A spring reverb for whatever is pinned into column G. MIX sets the balance of dry and spring in its output, row 14, and column M moves MIX.' },
  { id: 'outfilter', label: 'Output filters and speakers', module: 'out', keywords: 'tone treble bass mute speaker', rects: [{ x: 600, y: 685, w: 280, h: 290 }],
    help: 'A tone control for each output channel: flat at 5, left cuts treble, right cuts bass. The switches mute the internal speakers, which this app does not play.' },
  { id: 'meter', label: 'Meter', module: 'util', keywords: 'meter scope voltmeter level', rects: [{ x: 880, y: 685, w: 240, h: 290 }],
    help: 'A meter on matrix column A, for checking signal levels and control voltages. It is drawn for reference and does not move in this app.' },
  { id: 'sources', label: 'Matrix rows (sources)', module: 'patch', keywords: 'pins matrix rows outputs patch', rects: [{ x: 1176, y: 150, w: 202, h: 498 }],
    help: 'Every output in the VCS3 has a row of the matrix, numbered like the LEVEL knob that sets it. A row can be pinned to any number of columns at once.' },
  { id: 'dests', label: 'Matrix columns (destinations)', module: 'patch', keywords: 'pins matrix columns inputs patch', rects: [{ x: 1380, y: 20, w: 490, h: 140 }],
    help: 'Every input has a column, lettered like the knob it adds to. A to H are signal inputs (the meter, the two outputs, the envelope shaper, the ring modulator, the reverb and the filter); I to P are control inputs, which add to the knob with the same letter.' },
  { id: 'matrix', label: 'Pin matrix', module: 'patch', keywords: 'pin board patch bay routing connection', rects: [{ x: 1380, y: 162, w: 490, h: 486 }],
    help: 'Nothing on the VCS3 is connected until a pin goes in. A pin joins a row (an output) to a column (an input); pins in one column add together, and one row can feed many columns. Click a hole to put a pin in or take it out, and point at one to read what it does.' },
  { id: 'start', label: 'ATTACK button and mains', module: 'env', keywords: 'trigger gate power button', rects: [{ x: 1878, y: 20, w: 178, h: 300 }],
    help: 'The ATTACK button starts the envelope shaper by hand, like a key. The MAINS switch is the power, with its neon beside it.' },
  { id: 'outputs', label: 'Output amplifiers', module: 'out', keywords: 'volume level pan stereo vca amplifier output', rects: [{ x: 1176, y: 668, w: 520, h: 318 }],
    help: 'Two output channels, fed by columns B and C. Each LEVEL knob is a control voltage for its amplifier, so the sound only comes in past half way; columns O and P add to it. PAN places each channel between left and right.' },
  { id: 'joystick', label: 'Joystick', module: 'mod', keywords: 'joystick controller xy performance', rects: [{ x: 1698, y: 668, w: 358, h: 318 }],
    help: 'Two voltages from one stick: left-right on row 15 and up-down on row 16, each scaled by its RANGE knob. Pin them to frequency columns to bend pitch, or to the output levels to pan and fade by hand.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v) {
  const skew = (s) => clamp(0.5 + (s - 5) / 10, 0.005, 0.995);
  const osc = [1, 2, 3].map((n) => {
    const hz = n === 3 ? osc3Hz(v[`osc${n}.freq`]) : osc12Hz(v[`osc${n}.freq`]);
    // The oscillators feed only the matrix (oscOuts); `level` keeps them counted as running, `mix` is empty, so the
    // engine's built-in mixer stays silent.
    const o = { level: 1, mix: {}, semi: 0, kbd: false, fixedNote: noteOf(hz), syncTo: -1 };
    if (n === 1) o.sineShape = (v['osc1.shape'] - 5) / 5;
    else { o.skew = skew(v[`osc${n}.shape`]); o.pw = clamp(o.skew, 0.03, 0.97); }
    return o;
  });
  const off = v['env.off'];
  return {
    osc, oscOuts: true, pwSplit: true,
    noise: { level: 0, color: 'white', tilt: (v['noise.colour'] - 5) / 5 },
    ext: { level: 0 },
    filter: { type: 'ladder', mode: 'lp', cutoff: vcfHz(v['vcf.freq']), res: pwl(v['vcf.response'], RES_PTS), envAmt: 0, envSrc: 'env2', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 0, r: 0.1 },
    env2: { a: 0.001, d: 0.1, s: 1, r: 0.01 },
    trap: { a: attackS(v['env.attack']), on: onS(v['env.on']), d: decayS(v['env.decay']), off: off < OFF_MANUAL ? offS(off) : 0, auto: off < OFF_MANUAL, hold: !!v['env.button'] },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
    // Nothing is wired inside a VCS3: the filter and the envelope shaper hear only what is pinned to them.
    normals: { vcfIn: null, vcaIn: null },
    ring: { ac: true, acB: true },
    rev: { on: true, unit: true, mix: (v['rev.mix'] / 10) * 0.95, decay: 0.86, damp: 0.32 },
    joy: [v['joy.x'], v['joy.y']],
    outAmps: [1, 2].map((ch) => ({ level: (v[`out${ch}.level`] - 5) / 5, tone: (v[`out${ch}.filter`] - 5) / 5, pan: v[`out${ch}.pan`] / 10 })),
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0, volume: v.power ? 1.1 : 0,
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
// The pins are written [row, column]. A pin's name in the manual is its column letter and row number: B12 = row 12 to column B.
const presets = [
  {
    id: 'vcs3-first-note', name: 'First Note', ref: 'Classic technique: the smallest patch that plays from the keys', artist: 'Classic technique',
    tags: ['lead', 'basics', 'pins'], level: 1,
    blurb: 'One oscillator, played from the keyboard and given a simple envelope: the VCS3’s “hello world”.',
    how: 'On the VCS3 nothing is connected until you place a pin. This patch uses four: Oscillator 1’s ramp into the envelope shaper, the shaped signal to both outputs, and the keyboard’s voltage to Oscillator 1’s frequency. The envelope starts out repeating on its own, as a VCS3 envelope does; turning OFF past 6 makes it wait for a key, so each note starts and stops like a normal synth.',
    phrase: { bpm: 100, loop: true, steps: [[0, 60, 0.8], [1, 64, 0.8], [2, 67, 0.8], [3, 72, 1.6], [5, 67, 0.8], [6, 64, 1.6]] },
    steps: [
      { title: 'Oscillator 1 through the envelope', module: 'osc',
        why: 'The first pins: Oscillator 1’s ramp (row 2) into the envelope shaper (column D), and the shaped signal (row 12) into columns B and C, the two output channels.\n- Pins D2, B12 and C12.\n- Oscillator 1 FREQUENCY 6 (middle C), ramp LEVEL 5: the knob marked 2 sets how much reaches row 2, wherever it is pinned.\n- SIGNAL LEVEL 6: the knob marked 12.\n- ATTACK 0.5, ON 0, DECAY 3.5, OFF 3: the envelope runs round on its own, so you hear repeated notes without touching a key.\n- OUTPUT LEVEL 8 on both: the amplifiers only open past 5.\n- Listen for: a bright, buzzy note repeating about five times a second.',
        set: { 'osc1.ramp': 5, 'osc1.freq': 6, 'env.sigLevel': 6, 'env.attack': 0.5, 'env.on': 0, 'env.decay': 3.5, 'env.off': 3, 'out1.level': 8, 'out2.level': 8 },
        cables: [['r.osc1ramp', 'c.env'], ['r.envsig', 'c.out1'], ['r.envsig', 'c.out2']] },
      { title: 'Play it from the keys', module: 'util',
        why: 'The keyboard is plugged into input channel 1, so its pitch is on row 8. Pin row 8 into column I and Oscillator 1 follows the keys.\n- Pin I8: row 8 to Oscillator 1 frequency.\n- INPUT LEVEL CHANNEL 1 at 5: one semitone per key. Lower squeezes the notes together; higher spreads them apart.\n- Listen for: the repeating note changes pitch with each key, but still never stops.',
        set: { 'in.ch1': 5 }, cables: [['r.in1', 'c.osc1']] },
      { title: 'Make the envelope wait for a key', module: 'env',
        why: 'Turn OFF past 6 and the envelope stops after each fall and waits. Now each key starts one note, which holds while the key is down and fades when you let go.\n- OFF 10: manual.\n- Listen for: separate notes, each with a short tail, and silence between them.',
        set: { 'env.off': 10 } },
    ],
    context: {
      'osc1.ramp': 'In this sound: how loud the oscillator is going into the envelope shaper. Very high levels can make the shaper’s amplifier rough.',
      'in.ch1': 'In this sound: at 5 each key is one semitone. Try 2.5 for quarter tones or 10 for whole tones.',
      'env.decay': 'In this sound: how long each note rings after you let go. Turn up for a long fade.',
      'env.off': 'In this sound: past 6 the envelope waits for a key. Turn it below 6 and the notes repeat on their own.',
      'out1.level': 'In this sound: the amplifier for channel 1. Below 5 it shuts completely.',
    },
    tweaks: [
      { id: 'env.off', try: 'Turn OFF back down to 3 and hold a key', hear: 'The note repeats on its own again, several times a second.' },
      { id: 'osc1.freq', try: 'Turn the FREQUENCY dial to 5', hear: 'Everything an octave and a half lower: the keyboard starts lower.' },
    ],
  },
  {
    id: 'vcs3-swept-noise', name: 'Swept Coloured Noise', ref: 'From the EMS manual — Specimen Patch 1', artist: 'EMS',
    tags: ['fx', 'noise', 'manual'], level: 2,
    blurb: 'Noise through the filter and the repeating envelope, with three oscillators moving the decay and the filter: the manual’s first patch.',
    how: 'This is the patch the VCS3 manual walks through first, pin by pin: H7, D10, B12, C12, L2, L4, N6, O16 and P15. Noise goes through the filter and the envelope shaper to both outputs. Oscillators 1 and 2, slow and nearly in tune, beat against each other on the envelope’s decay, Oscillator 3 sweeps the filter, and the joystick rides both output levels. The knob settings are this app’s: the manual draws them as dials.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 4]] },
    steps: [
      { title: 'Noise through the filter', module: 'filter',
        why: 'Noise (row 7) into the filter (column H), and the filter (row 10) into the envelope shaper (column D).\n- Pin H7: noise into the filter.\n- Pin D10: the filter into the envelope shaper.\n- Noise LEVEL 7, COLOUR 5: white noise, fairly hot.\n- Filter FREQUENCY 7.2 (1.2 kHz) and RESPONSE 4.5: a softened, slightly peaky hiss.\n- Filter LEVEL 9: the knob marked 10.\n- Nothing is heard yet: the shaper’s output has not been pinned anywhere.',
        set: { 'noise.level': 7, 'noise.colour': 5, 'vcf.freq': 7.2, 'vcf.response': 4.5, 'vcf.level': 9 }, cables: [['r.noise', 'c.vcf'], ['r.vcf', 'c.env']] },
      { title: 'A repeating envelope to both outputs', module: 'env',
        why: 'The shaped signal (row 12) goes to both outputs, B and C. With OFF below 6 the envelope cycles on its own, so the noise comes in bursts without any key.\n- Pins B12 and C12.\n- SIGNAL LEVEL 9: the knob marked 12.\n- ATTACK 3, ON 2, DECAY 5, OFF 3.5: a soft rise, a short hold, a falling tail and a short rest, round and round.\n- Listen for: breathing bursts of filtered noise.',
        set: { 'env.sigLevel': 9, 'env.attack': 3, 'env.on': 2, 'env.decay': 5, 'env.off': 3.5 }, cables: [['r.envsig', 'c.out1'], ['r.envsig', 'c.out2']] },
      { title: 'Two slow oscillators on the decay', module: 'osc',
        why: 'Oscillator 1’s ramp (row 2) and Oscillator 2’s triangle (row 4) both go into column L, the decay time. They are slow and slightly out of tune, so they drift in and out of step and each burst has a different length.\n- Pins L2 and L4.\n- Oscillator 1 FREQUENCY 2 (4.4 Hz), ramp LEVEL 4; Oscillator 2 FREQUENCY 2.1, triangle LEVEL 4.\n- Listen for: the bursts getting longer and shorter in a slow, uneven pattern.',
        set: { 'osc1.freq': 2, 'osc1.ramp': 4, 'osc2.freq': 2.1, 'osc2.tri': 4 }, cables: [['r.osc1ramp', 'c.decay'], ['r.osc2tri', 'c.decay']] },
      { title: 'Oscillator 3 sweeps the filter', module: 'lfo',
        why: 'Oscillator 3’s triangle (row 6) into column N, the filter frequency. At this speed it is a slow sweep, the job an LFO does on other synths.\n- Pin N6.\n- Oscillator 3 FREQUENCY 3.5 (0.6 Hz), triangle LEVEL 5.\n- Listen for: the noise rising and falling in brightness, like surf.',
        set: { 'osc3.freq': 3.5, 'osc3.tri': 5 }, cables: [['r.osc3tri', 'c.cutoff']] },
      { title: 'The joystick on the output levels', module: 'mod',
        why: 'The joystick’s vertical (row 16) goes to output channel 1’s level (column O) and its horizontal (row 15) to channel 2’s (column P). Move the stick and you fade and pan the sound by hand.\n- Pins O16 and P15.\n- RANGE 4 on both.\n- OUTPUT LEVEL 7.5 on both, so the channels are open with the stick in the middle.\n- Try: drag the stick right to bring up the right side, down to fade the left.',
        set: { 'joy.rangeX': 4, 'joy.rangeY': 4, 'out1.level': 7.5, 'out2.level': 7.5 }, cables: [['r.joyy', 'c.lvl1'], ['r.joyx', 'c.lvl2']] },
    ],
    context: {
      'vcf.freq': 'In this sound: the centre of the sweep. Lower is a darker rumble; higher, a brighter hiss.',
      'osc3.tri': 'In this sound: how wide the filter sweep is. Turn down for a gentle movement.',
      'env.off': 'In this sound: the rest between bursts. Past 6 the bursts stop until you press a key.',
      'osc2.freq': 'In this sound: tuned close to Oscillator 1 so the two beat. The further apart, the faster the pattern changes.',
      'noise.colour': 'In this sound: the colour of the noise before the filter. Left is darker, right thinner.',
    },
    tweaks: [
      { id: 'joy.x', try: 'Drag the joystick around while it plays', hear: 'The bursts move between the speakers and fade up and down.' },
      { id: 'vcf.response', try: 'Raise RESPONSE to 6', hear: 'The noise starts to whistle at the filter frequency, like wind.' },
    ],
  },
  {
    id: 'vcs3-ring-octave', name: 'Ring Modulator Octave', ref: 'From the EMS manual — the ring modulator', artist: 'EMS',
    tags: ['drone', 'ring mod', 'manual'], level: 2,
    blurb: 'Two sine waves at the same pitch multiplied: the result is one note an octave up.',
    how: 'The manual’s first ring-modulator example: Oscillator 1’s sine and the filter, oscillating on its own as a second sine, both tuned to about middle C, go into the ring modulator’s two inputs (E1 and F10). A ring modulator gives the sum and the difference of its inputs: the difference of two equal pitches is nothing, so only the sum is left, an octave above. Because the two are never exactly in tune, the octave slowly swells and fades.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 4]] },
    steps: [
      { title: 'Two sine sources', module: 'osc',
        why: 'Oscillator 1 at middle C, and the filter turned into an oscillator by turning RESPONSE past 6. Nothing is pinned yet.\n- Oscillator 1 FREQUENCY 6 (261.6 Hz), sine LEVEL 6.\n- Filter FREQUENCY 5.2 (262 Hz), RESPONSE 7, LEVEL 6: the filter whistles its own sine at about the same pitch.',
        set: { 'osc1.freq': 6, 'osc1.sine': 6, 'vcf.freq': 5.2, 'vcf.response': 7, 'vcf.level': 6 } },
      { title: 'Into the ring modulator', module: 'util',
        why: 'Pin E1 (Oscillator 1’s sine into input A) and F10 (the filter into input B), then the ring modulator’s output (row 13) to both outputs.\n- Pins E1, F10, B13 and C13.\n- Ring modulator LEVEL 7: the knob marked 13.\n- Listen for: a single tone an octave above middle C, slowly swelling and fading as the two sources drift.',
        set: { 'ring.level': 7 }, cables: [['r.osc1sine', 'c.ringA'], ['r.vcf', 'c.ringB'], ['r.ring', 'c.out1'], ['r.ring', 'c.out2']] },
      { title: 'Retune and listen', module: 'osc',
        why: 'Move Oscillator 1 away from the filter’s pitch and two notes appear, the sum and the difference, moving in opposite directions. Back in tune they merge again.\n- Oscillator 1 FREQUENCY 5.9: a little flat, so the sum and difference split apart and beat.\n- Listen for: a lower tone sliding down and the octave sliding a little, and a slow beat between them.',
        set: { 'osc1.freq': 5.9 } },
    ],
    context: {
      'osc1.freq': 'In this sound: tuned near the filter. The further away, the further apart the two ring-modulated notes.',
      'vcf.response': 'In this sound: past 6, so the filter makes its own sine. Below 6 it stops and the ring modulator has nothing on input B.',
      'vcf.freq': 'In this sound: the pitch of the filter’s own tone, matched to Oscillator 1.',
      'ring.level': 'In this sound: the volume of the result.',
    },
    tweaks: [
      { id: 'osc1.freq', try: 'Turn the dial slowly from 5.5 to 6.5', hear: 'Two notes that cross over, merge into one octave at unison, then split again.' },
      { id: 'osc1.shape', try: 'Turn SHAPE to 8', hear: 'The sine gets harmonics, so the result turns bell-like and clangy.' },
    ],
  },
  {
    id: 'vcs3-bells', name: 'Bell Tones', ref: 'From the EMS manual — the ring modulator', artist: 'EMS',
    tags: ['perc', 'bells', 'manual'], level: 3,
    blurb: 'Ring-modulated oscillators, filtered, struck by the repeating envelope and sent into the spring reverb.',
    how: 'The manual’s bell patch, with its own pins and settings: E1 F3 F4 I16 J15 H13 D10 G10 C12 B14. Oscillator 1’s sine is multiplied with both of Oscillator 2’s waves, which gives a cluster of unrelated overtones, the mark of a bell. The filter softens it, the envelope strikes it with an instant attack and a long decay, and the reverb gives it a room. The joystick retunes both oscillators. Two changes from the manual: Oscillator 2 sits a little above Oscillator 1, because two dials at the same number here give exactly the same pitch (on the hardware they never quite match), and the filter is opened a little further.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 4]] },
    steps: [
      { title: 'A clangy ring modulation', module: 'util',
        why: 'Oscillator 1’s sine into input A, and Oscillator 2’s square and triangle together into input B.\n- Pins E1, F3 and F4.\n- Oscillator 1 FREQUENCY 7.5 (1.2 kHz); Oscillator 2 FREQUENCY 7.85, a little higher.\n- Oscillator 1 sine LEVEL 6; Oscillator 2 square LEVEL 5 and triangle LEVEL 6.\n- Ring modulator LEVEL 7.\n- Not heard yet: the ring modulator’s output is not pinned to an output.',
        set: { 'osc1.freq': 7.5, 'osc2.freq': 7.85, 'osc1.sine': 6, 'osc2.square': 5, 'osc2.tri': 6, 'ring.level': 7 },
        cables: [['r.osc1sine', 'c.ringA'], ['r.osc2sq', 'c.ringB'], ['r.osc2tri', 'c.ringB']] },
      { title: 'Filter and strike it', module: 'env',
        why: 'The ring modulator goes through the filter (H13), the filter into the envelope shaper (D10), and the struck sound to output channel 2 (C12).\n- Pins H13, D10 and C12.\n- Filter FREQUENCY 8 (2.2 kHz), RESPONSE 0, LEVEL 10: a gentle top cut.\n- ATTACK 0, ON 0, DECAY 6, OFF 3: an instant strike, a long ring, starting again after a short rest.\n- SIGNAL LEVEL 9.\n- Listen for: a bell struck again and again on the right.',
        set: { 'vcf.freq': 8, 'vcf.response': 0, 'vcf.level': 10, 'env.attack': 0, 'env.on': 0, 'env.decay': 6, 'env.off': 3, 'env.sigLevel': 9 },
        cables: [['r.ring', 'c.vcf'], ['r.vcf', 'c.env'], ['r.envsig', 'c.out2']] },
      { title: 'Reverb on the other side', module: 'fx',
        why: 'The filter also feeds the reverb (G10), and the reverb comes out of channel 1 (B14). Dry bell on the right, spring room on the left.\n- Pins G10 and B14.\n- Reverb MIX 5, LEVEL 10.\n- Listen for: the bell ringing on into a spring echo on the left.',
        set: { 'rev.mix': 5, 'rev.level': 10 }, cables: [['r.vcf', 'c.rev'], ['r.rev', 'c.out1']] },
      { title: 'The joystick tunes the bell', module: 'mod',
        why: 'The joystick’s vertical goes to Oscillator 1 (I16), its horizontal to Oscillator 2 (J15), so moving the stick retunes the cluster.\n- Pins I16 and J15.\n- RANGE 4 on both.\n- Try: move the stick slowly while it plays. Each position is a different bell.',
        set: { 'joy.rangeX': 4, 'joy.rangeY': 4 }, cables: [['r.joyy', 'c.osc1'], ['r.joyx', 'c.osc2']] },
    ],
    context: {
      'env.decay': 'In this sound: how long each strike rings.',
      'env.off': 'In this sound: the rest between strikes. Past 6 it only strikes when you press a key.',
      'osc2.freq': 'In this sound: tuned against Oscillator 1. Small changes give completely different bells.',
      'vcf.freq': 'In this sound: how bright the bell is.',
      'rev.mix': 'In this sound: how much spring is in the left channel.',
    },
    tweaks: [
      { id: 'env.off', try: 'Turn OFF to 10 and play keys', hear: 'One strike per key instead of a steady repeat.' },
      { id: 'osc2.freq', try: 'Move Oscillator 2 between 7 and 8', hear: 'The bell changes from a gong to a small chime.' },
    ],
  },
  {
    id: 'vcs3-harmonics', name: 'Filter Picks Out Harmonics', ref: 'From the EMS manual — the filter', artist: 'EMS',
    tags: ['drone', 'filter', 'manual'], level: 2,
    blurb: 'A low ramp wave through a sharp filter that Oscillator 3 sweeps up and down, so the harmonics ring out one by one.',
    how: 'The manual’s filter demonstration: H2, B10 and N6. A ramp wave is made of a fundamental plus every harmonic above it. A sharp filter, swept slowly, lets each harmonic through in turn, so you hear a rising and falling scale of the harmonic series over the drone. Here row 10 also goes to channel 2 (C10), so it plays on both sides.',
    phrase: { bpm: 60, loop: true, steps: [[0, 48, 4]] },
    steps: [
      { title: 'A low ramp through a sharp filter', module: 'filter',
        why: 'Oscillator 1’s ramp into the filter, and the filter to both outputs.\n- Pins H2, B10 and C10.\n- Oscillator 1 FREQUENCY 4.5 (55 Hz), ramp LEVEL 5.\n- Filter FREQUENCY 5.5, RESPONSE 5.8: just short of oscillating, so it rings sharply.\n- Filter LEVEL 7.\n- Listen for: a low buzz with one harmonic ringing loudly over it.',
        set: { 'osc1.freq': 4.5, 'osc1.ramp': 5, 'vcf.freq': 5.5, 'vcf.response': 5.8, 'vcf.level': 7 },
        cables: [['r.osc1ramp', 'c.vcf'], ['r.vcf', 'c.out1'], ['r.vcf', 'c.out2']] },
      { title: 'Oscillator 3 sweeps the filter', module: 'lfo',
        why: 'Oscillator 3, as a slow ramp, moves the filter frequency (N6). Each harmonic rings out as the filter passes it.\n- Pin N6.\n- Oscillator 3 FREQUENCY 2 (0.12 Hz, about eight seconds a sweep), triangle LEVEL 7.\n- Oscillator 3 SHAPE 0: the triangle becomes a falling ramp. The filter rises as the voltage falls, so the sweep climbs slowly and drops back at once.\n- Listen for: a slow scale of harmonics climbing over the drone, then starting again.',
        set: { 'osc3.freq': 2, 'osc3.tri': 7, 'osc3.shape': 0 }, cables: [['r.osc3tri', 'c.cutoff']] },
    ],
    context: {
      'vcf.response': 'In this sound: how sharp the filter is. Higher picks out single harmonics more clearly; past 6.6 the filter whistles on its own.',
      'osc3.freq': 'In this sound: how long each sweep takes.',
      'osc3.tri': 'In this sound: how far the filter sweeps, and so how many harmonics you hear.',
      'osc1.freq': 'In this sound: the drone. Lower notes have harmonics closer together, so the scale has more steps.',
    },
    tweaks: [
      { id: 'osc3.shape', try: 'Turn Oscillator 3 SHAPE to 5', hear: 'The sweep goes up and down smoothly instead of climbing and dropping.' },
      { id: 'osc1.freq', try: 'Lower the dial to 3.8', hear: 'A deeper drone with more harmonics in each sweep.' },
    ],
  },
  {
    id: 'vcs3-stereo-swing', name: 'Stereo Swing', ref: 'From the EMS manual — the output amplifiers', artist: 'EMS',
    tags: ['keys', 'stereo', 'manual'], level: 2,
    blurb: 'One oscillator on both channels, with two slow oscillators opening and closing each side in turn.',
    how: 'The manual’s output amplifier example: B1 B2 C1 C2 O4 P6. Oscillator 1 goes to both channels. Oscillator 2 and Oscillator 3, both slow and slightly out of step, move the two channels’ levels through columns O and P, so the sound swings between left and right. Here the keyboard is also pinned to Oscillator 1 (I8) so you can play it.',
    phrase: { bpm: 80, loop: true, steps: [[0, 57, 2], [2, 60, 2], [4, 64, 2], [6, 62, 2]] },
    steps: [
      { title: 'Oscillator 1 on both sides, from the keys', module: 'osc',
        why: 'Sine and ramp mixed by pinning both rows to both outputs, and the keyboard on Oscillator 1.\n- Pins B1, B2, C1, C2 and I8.\n- Oscillator 1 sine LEVEL 6, ramp LEVEL 3: mostly sine, a little edge.\n- INPUT LEVEL CHANNEL 1 at 5.\n- Listen for: a plain tone in both speakers, following the keys.',
        set: { 'osc1.sine': 6, 'osc1.ramp': 3, 'osc1.freq': 6, 'in.ch1': 5 },
        cables: [['r.osc1sine', 'c.out1'], ['r.osc1ramp', 'c.out1'], ['r.osc1sine', 'c.out2'], ['r.osc1ramp', 'c.out2'], ['r.in1', 'c.osc1']] },
      { title: 'Two slow oscillators on the levels', module: 'out',
        why: 'Oscillator 2’s triangle moves channel 1’s level (O4) and Oscillator 3’s triangle moves channel 2’s (P6). They run at slightly different speeds, so the swing keeps changing.\n- Pins O4 and P6.\n- Oscillator 2 FREQUENCY 1.5 (2.4 Hz), triangle LEVEL 7.\n- Oscillator 3 FREQUENCY 5.3 (3.4 Hz), triangle LEVEL 7.\n- OUTPUT LEVEL 6.5 on both: the middle of the swing, so each channel opens and closes.\n- Listen for: the tone throbbing and moving from side to side.',
        set: { 'osc2.freq': 1.5, 'osc2.tri': 7, 'osc3.freq': 5.3, 'osc3.tri': 7, 'out1.level': 6.5, 'out2.level': 6.5 },
        cables: [['r.osc2tri', 'c.lvl1'], ['r.osc3tri', 'c.lvl2']] },
    ],
    context: {
      'out1.level': 'In this sound: the centre of channel 1’s swing. Higher and it never fully closes; lower and it is silent half the time.',
      'osc2.freq': 'In this sound: the speed of channel 1’s throb.',
      'osc3.freq': 'In this sound: the speed of channel 2’s throb, a little faster than channel 1.',
      'osc1.ramp': 'In this sound: adds brightness to the sine.',
    },
    tweaks: [
      { id: 'osc3.freq', try: 'Set Oscillator 3 to 5.15', hear: 'The two sides now throb at nearly the same speed, so the pattern repeats slowly.' },
      { id: 'out2.level', try: 'Lower OUTPUT LEVEL 2 to 5', hear: 'The right side cuts out for half of each throb: a chopping effect.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

export default {
  id: 'ems-vcs3', name: 'VCS3 Mk 1', maker: 'EMS', year: 1969,
  heritage: 'The original “Putney”, designed by David Cockerell for EMS in London',
  summary: 'A small studio rather than a keyboard synth: three free-running oscillators, noise, a ring modulator, a filter that doubles as a sine oscillator, a repeating trapezoid envelope with its own amplifier and a spring reverb, all connected by pins in a 16 × 16 matrix and heard through two output amplifiers. A joystick gives two voltages; here the keyboard plays through input channel 1, as an EMS DK1 would.',
  view: { w: 2100, h: 1000 },
  theme: { panel: PANEL, panel2: '#c8c9c3', ink: INK, font: 'helv', cheeks: 'wood', cheekW: 40, tabs: true },
  matrix: { x: MX, y: MY, pitch: MP, rows: rowIds, cols: colIds, legend: { row: [200, MP - 2], col: [MP - 2, 140] } },
  silentInit: 'Nothing on the VCS3 is connected until a pin is placed, so with no pins it is silent.',
  signalNames: {
    o1sine: 'Oscillator 1’s sine', o1saw: 'Oscillator 1’s ramp', o2pulse: 'Oscillator 2’s square', o2tri: 'Oscillator 2’s triangle',
    o3pulse: 'Oscillator 3’s square', o3tri: 'Oscillator 3’s triangle', vcf1: 'the filter', vca: 'the envelope shaper’s output',
    kbd: 'the keyboard voltage on input channel 1', ring: 'the ring modulator', rev: 'the reverberation unit', noise: 'the noise generator',
  },
  destNames: { pitch1: 'Oscillator 1 frequency', pitch2: 'Oscillator 2 frequency', pitch3: 'Oscillator 3 frequency', cutoff: 'the filter frequency' },
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds], lineage,
};
