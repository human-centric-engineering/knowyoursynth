// Behringer Model 15 — SynthDef. Positions are pixels on the 1200×1200 product photo (ref/behringer-model-15.jpg),
// written in image space and turned into view units by X() / Y(): the view starts at the left cheek's top corner and is
// drawn at twice the photo's scale. Sizes (radii, lettering, widths) are written in view units.
// The data model is ref/behringer-model-15.synth.json (Quick Start Guide, 93 callouts, with the normals and the
// sample-and-hold wiring taken from the Moog Grandmother manual that the Model 15 copies).
//
// Engine notes: the voice runs as a one-voice `poly` synth so the engine's arpeggiator can play it. OSC 2's waveform
// switch has a second set of positions printed under a SUB bracket; there the sub-oscillator (Oscillator 2 an octave
// down, signal `sub`) takes over mixer channel 3 from the white noise. The 6 dB HI PASS FILTER is a separate utility
// (EngineParams `hp6`), only in circuit when patched. The reverb is the engine's spring in `unit` mode, so REVERB MIX is
// a true dry/wet blend. Engine features added for this synth: signals `pink`, `sub`, `hp6`, dest `hp6In`,
// oscillator `subLevel` and EngineParams `subOut` / `hp6`.
import { annotate, clamp, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/model-15.js';
import lineage from '@/synths/lineage/model-15.js';
import unusual from '@/synths/unusual/model-15.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the LFO range (0.07 Hz–1.3 kHz), the cutoff range, OSC 2's ±7 semitones, FINE TUNE's ±4 and the
// envelope times. The ARP/SEQ tempo range, the glide time and the modulation depths are this app's choice.
const lfoHz = (v) => expMap(v / 10, 0.07, 1300);
const cutoffHz = (v) => expMap(v / 10, 20, 20000);
const hpHz = (v) => expMap(v / 10, 20, 8000);
const attTime = (v) => expMap(v / 10, 0.002, 16);
const decTime = (v) => expMap(v / 10, 0.002, 40);
const relTime = (v) => expMap(v / 10, 0.002, 20);
const glideTime = (v) => (v <= 0 ? 0 : 0.01 * Math.pow(300, v / 10)); // up to 3 s
const arpBpm = (v) => expMap(v / 10, 40, 240);
const signed = (v, max, curve = 1.4) => (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v) / 5, curve) * max);
const OCT1 = { 32: -24, 16: -12, 8: 0, 4: 12 };
const OCT2 = { 16: -12, 8: 0, 4: 12, 2: 24 };

const OX = 27, OY = 397, K = 2; // image pixel of the view's top-left corner, and view units per image pixel
const X = (x) => (x - OX) * K;
const Y = (y) => (y - OY) * K;
const controls = [];
const decor = [];
const jacks = [];
const INK = '#f1f1ee';
const DARK = '#18181a';
const C = { white: '#f2f2ef', blue: '#5db7ea', yellow: '#efe35a', red: '#e9474f', green: '#c3ee8d' };

// ── Drawing helpers (image coordinates in, view units out) ────────────────
const polarXY = (x, y, r, a) => [x + r * Math.sin((a * Math.PI) / 180), y - r * Math.cos((a * Math.PI) / 180)];
/** Text centred on image point (x, y); the renderer places text by its baseline. */
const text = (x, y, t, size = 17, rest = {}) => decor.push({ t: 'text', x: X(x), y: Y(y) + size * 0.36, text: t, size, anchor: 'middle', ...rest });
const line = (x1, y1, x2, y2, w = 3, rest = {}) => decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w, ...rest });
const box = (x0, y0, x1, y1, rest = {}) => decor.push({ t: 'rect', x: X(x0), y: Y(y0), w: (x1 - x0) * K, h: (y1 - y0) * K, ...rest });
const frame = (x0, y0, x1, y1) => decor.push({ t: 'frame', x: X(x0), y: Y(y0), w: (x1 - x0) * K, h: (y1 - y0) * K, r: 7, sw: 3, labelAt: 'none' });
/** A section name on a solid plate at the top of its frame, as the panel prints it. */
const tab = (x0, x1, t, fill = C.white, y0 = 416, y1 = 430.5) => {
  box(x0, y0, x1, y1, { fill, r: 2, hw: true });
  text((x0 + x1) / 2, (y0 + y1) / 2, t, 22, { fill: DARK, weight: 700 });
};
const glyph = (x, y, shape, size = 11) => decor.push({ t: 'wave', x: X(x), y: Y(y), size, shape, w: 2.6 });
/** The printed arc with an arrow at each end, 0 at the top and − / + at the ends, round a bipolar knob. */
const bipolarArc = (x, y, r = 24) => {
  decor.push({ t: 'arc', x: X(x), y: Y(y), r: r * K, a0: -62, a1: -8, w: 2.4, cap: 'butt' }, { t: 'arc', x: X(x), y: Y(y), r: r * K, a0: 8, a1: 62, w: 2.4, cap: 'butt' });
  text(x, y - r, '0', 17, { weight: 700 });
  const [lx, ly] = polarXY(x, y, r + 3, -72);
  const [rx, ry] = polarXY(x, y, r + 3, 72);
  text(lx - 1, ly, '−', 20, { weight: 700 }); text(rx + 1, ry, '+', 20, { weight: 700 });
};
/** The coloured, segmented ring the panel prints round the LFO depth knobs. */
const segRing = (x, y, color) => {
  for (let i = 0; i < 8; i++) {
    const a0 = -135 + i * 33.75 + 3;
    decor.push({ t: 'arc', x: X(x), y: Y(y), r: 21 * K, a0, a1: a0 + 27.75, w: 7, cap: 'butt', stroke: color, hw: true });
  }
};
const TICKS = { ticks: 11, nums: [] };
const knob = (id, x, y, rest) => controls.push({
  id, type: 'knob', x: X(x), y: Y(y), r: 27, style: 'neutron', kind: 'cont', min: 0, max: 10, def: 0, scale: TICKS, labelPos: 'none', ...rest,
});
/** A rotary switch: the printed positions are drawn by hand (option labels ''). */
const rotary = (id, x, y, options, def, rest) => controls.push({
  id, type: 'knob', x: X(x), y: Y(y), r: 31, style: 'd-chicken', kind: 'enum', options, def, labelPos: 'none', ...rest,
});
const slide = (id, x, y, options, def, rest) => controls.push({
  id, type: 'slide', x: X(x), y: Y(y), w: 92, h: 28, orient: 'h', kind: 'enum', options, def, labelPos: 'none', ...rest,
});
/** A square white cap in a coloured printed ring (PLAY, HOLD, TAP, SYNC). */
const ringButton = (id, x, y, ring, rest) => {
  box(x - 15, y - 15, x + 15, y + 15, { fill: ring, r: 6, hw: true });
  box(x - 11.5, y - 11.5, x + 11.5, y + 11.5, { fill: DARK, r: 3.5, hw: true });
  controls.push({ id, type: 'button', x: X(x), y: Y(y), w: 34, h: 34, capColor: '#efefea', kind: 'bool', def: false, labelPos: 'none', ...rest });
};

// ── Faceplate ─────────────────────────────────────────────────────────────
[[67.5, 409], [482.5, 407.5], [717.5, 407.5], [1133, 409], [67.5, 740], [482.5, 740], [717.5, 741], [1133, 739]]
  .forEach(([x, y]) => decor.push({ t: 'screw', x: X(x), y: Y(y), r: 11 }));
frame(63, 412.5, 144, 739);
tab(67, 140, 'ARP / SEQ', C.blue);
frame(150, 413, 311, 667);
tab(154, 307, 'LOW FREQUENCY OSC');
frame(150, 674, 311, 739.5);
frame(317.5, 413, 469, 739.5);
box(321, 416, 466, 430.5, { fill: C.yellow, r: 2, hw: true });
text(357.5, 423.2, '1', 22, { fill: DARK, weight: 700 });
text(415, 423.2, 'OSC  2 + SUB', 22, { fill: DARK, weight: 700 });
line(393, 432, 393, 527); line(393, 562, 393, 660);
frame(475, 413, 552, 667);
tab(479, 548, 'MIXER');
frame(558, 413, 638, 585);
tab(562, 634, 'UTILITIES');
frame(558, 590, 638, 667);
frame(475, 674, 638, 739.5);
frame(644.5, 413, 735, 739.5);
tab(648, 731, 'FILTER', C.red);
frame(741, 413, 822, 739.5);
tab(745, 818, 'ENVELOPE');
frame(828, 413, 905, 641);
tab(832, 901, 'CONTROL');
frame(828, 647.5, 905, 739.5);
tab(832, 901, 'REVERB', C.green, 652, 665);

// ── ARP / SEQ ─────────────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(75.5), y: Y(441), r: 7, color: 'red', litWhen: { id: 'arp.play', eq: true } });
knob('arp.rate', 103, 469, {
  def: 5, name: 'ARP/SEQ rate', module: 'mode', fmt: (v) => `${Math.round(arpBpm(v))} BPM`,
  help: 'The speed of the arpeggiator, in steps of a sixteenth note. Clockwise is faster.',
});
text(103, 500, 'RATE', 19);
slide('arp.mode', 106, 536, [{ v: 'arp', label: 'ARP' }, { v: 'seq', label: 'SEQ' }, { v: 'rec', label: 'REC' }], 'arp', {
  name: 'ARP/SEQ mode', module: 'mode',
  help: 'ARP plays the held keys one after another; SEQ plays back a recorded sequence; REC records one. This app has no sequence memory, so SEQ and REC play the keys as they are pressed.',
});
text(75, 522, 'ARP', 15); text(103, 522, 'SEQ', 15);
box(123, 517, 139, 527, { fill: INK, r: 1.5, hw: true }); text(131, 522, 'REC', 14, { fill: DARK });
text(103, 552, 'MODE', 19);
slide('arp.dir', 106, 583, [{ v: 'ordr', label: 'ORDR' }, { v: 'bf', label: 'BACK AND FORTH' }, { v: 'rndm', label: 'RNDM' }], 'ordr', {
  name: 'ARP/SEQ direction', module: 'mode',
  help: 'The order the arpeggio takes: ORDR in the order the keys were pressed, ◀◀/▶▶ up and then back down, RNDM at random.',
});
text(75, 568, 'ORDR', 15); text(103, 568, '◀◀/▶▶', 15); text(131, 568, 'RNDM', 15);
text(103, 599, 'DIRECTION', 19);
slide('arp.oct', 106, 630, [{ v: '1', label: '1' }, { v: '2', label: '2' }, { v: '3', label: '3' }], '1', {
  name: 'ARP octaves / SEQ slot', module: 'mode',
  help: 'How many octaves the arpeggio climbs through: 1, 2 or 3. In SEQ and REC on the hardware it picks one of three stored sequences.',
});
text(82, 615, '1', 15); text(103, 615, '2', 15); text(126, 615, '3', 15);
text(103, 645, 'OCT / SEQ', 19);
knob('glide', 103, 697.5, {
  name: 'Glide', module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each note slides from the last one instead of jumping. Fully anticlockwise is off; clockwise is a slower slide.',
});
text(103, 728, 'GLIDE', 19);

ringButton('arp.play', 191, 706, C.blue, {
  name: 'Play / tie', module: 'mode',
  help: 'Starts and stops the arpeggiator: with it on, held keys play one after another at RATE. On the hardware, in REC it enters a tie.',
});
ringButton('arp.hold', 231, 706, C.blue, {
  name: 'Hold / rest', module: 'mode',
  help: 'Keeps the arpeggio playing after the keys are let go. On the hardware, in REC it enters a rest.',
});
ringButton('arp.tap', 271, 706, C.blue, {
  name: 'Tap / accent', module: 'mode',
  help: 'On the hardware, three or more taps set the tempo, and in REC it marks an accent. It does nothing to the sound here: set the speed with RATE.',
});
text(191, 683, 'PLAY', 17); text(231, 683, 'HOLD', 17); text(271, 683, 'TAP', 17);
text(191, 729, 'TIE', 15); text(231, 729, 'REST', 15); text(271, 729, 'ACCENT', 15);

// ── Low frequency osc ─────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(189), y: Y(440), r: 7, color: 'red', litWhen: 'lfo' });
knob('lfo.rate', 230, 469.5, {
  r: 38, def: 5, name: 'LFO rate', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'The speed of the LFO, from one cycle every 14 seconds to 1.3 kHz. Above about 20 Hz it is fast enough to be heard as a rough or clangy tone rather than a wobble.',
});
text(230, 507, 'RATE', 19);
segRing(187.5, 545, C.yellow);
knob('lfo.pitch', 187.5, 545, {
  ring: false, scale: undefined, name: 'LFO pitch mod', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the pitch of both oscillators: a little for vibrato, more for sirens and trills. MODULATION sets how much of this is used.',
});
text(187.5, 576, 'PITCH MOD', 19);
segRing(272.5, 545, C.yellow);
knob('lfo.pw', 272.5, 545, {
  ring: false, scale: undefined, name: 'LFO pulse width', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the pulse width of both oscillators. It is heard only on the square and narrow pulse waves, as a slow chorus-like movement. MODULATION sets how much of this is used.',
});
text(272.5, 576, 'PULSE WIDTH', 19);
segRing(187.5, 621, C.red);
knob('lfo.filter', 187.5, 621, {
  ring: false, scale: undefined, name: 'LFO filter mod', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the filter cutoff: a wah, a tremolo-like pulse or a growl, depending on its speed and shape. MODULATION sets how much of this is used.',
});
text(187.5, 652, 'FILTER MOD', 19);
const LFO_OPTS = [{ v: 'sine', a: -45 }, { v: 'saw', a: -15 }, { v: 'ramp', a: 15 }, { v: 'square', a: 45 }].map((o) => ({ ...o, label: '' }));
rotary('lfo.wave', 272, 621, LFO_OPTS, 'sine', {
  name: 'LFO waveform', module: 'lfo',
  help: 'The LFO’s shape: sine (smooth vibrato and sweeps), sawtooth (falls, then jumps back up), ramp (rises, then drops), or square (jumps between two values, a trill).',
});
[['sine', -45], ['rsaw', -15], ['saw', 15], ['sq', 45]].forEach(([s, a]) => { const [gx, gy] = polarXY(272, 621, 34, a); glyph(gx, gy, s); });
text(272, 652, 'WAVEFORM', 19);

// ── Oscillators ───────────────────────────────────────────────────────────
const footage = (x, y, list) => list.forEach((t, i) => { const [px, py] = polarXY(x, y, 33, -45 + i * 30); text(px, py, `${t}’`, 15, { weight: 700 }); });
rotary('osc1.oct', 357.5, 469, ['32', '16', '8', '4'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })), '8', {
  name: 'Oscillator 1 octave', module: 'osc',
  help: 'The octave of Oscillator 1, in organ feet: 32 is the lowest, 4 the highest, and each step is an octave. 8 plays at the pitch of the keys.',
});
footage(357.5, 469, ['32', '16', '8', '4']);
text(357.5, 500, 'OCTAVE', 19);
rotary('osc2.oct', 427.5, 469, ['16', '8', '4', '2'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })), '8', {
  name: 'Oscillator 2 octave', module: 'osc',
  help: 'The octave of Oscillator 2: 16 is the lowest, 2 the highest. Its range sits an octave above Oscillator 1’s.',
});
footage(427.5, 469, ['16', '8', '4', '2']);
text(427.5, 500, 'OCTAVE', 19);
ringButton('osc2.sync', 357.5, 544, C.yellow, {
  name: 'Sync', module: 'osc',
  help: 'Hard sync: Oscillator 2 restarts its cycle every time Oscillator 1 does, so it locks to Oscillator 1’s pitch. Then FREQUENCY changes its tone instead of its pitch, a tearing, vocal sound, best heard as it moves.',
});
text(357.5, 568, 'SYNC', 19);
line(374, 545, 401, 545);
knob('osc2.freq', 428, 545, {
  min: -7, max: 7, def: 0, name: 'Oscillator 2 frequency', module: 'osc', fmt: (v) => fmtSemi(v),
  help: 'Tunes Oscillator 2 against Oscillator 1, up to seven semitones either way. A touch off the centre makes the two beat and thicken; further round it sets an interval, such as +7 for a fifth.',
});
bipolarArc(428, 545);
text(428, 576, 'FREQUENCY', 19);
const WAVE4 = [['tri', 'tri'], ['saw', 'saw'], ['sq', 'sq'], ['narrow', 'pulse']];
rotary('osc1.wave', 357.5, 621, WAVE4.map(([v], i) => ({ v, label: '', a: -45 + i * 30 })), 'saw', {
  name: 'Oscillator 1 waveform', module: 'osc',
  help: 'Oscillator 1’s shape: triangle (soft, flute-like), sawtooth (bright and buzzy), square (hollow) or narrow pulse (thin and nasal).',
});
WAVE4.forEach(([, s], i) => { const [gx, gy] = polarXY(357.5, 621, 34, -45 + i * 30); glyph(gx, gy, s); });
text(357.5, 664, 'WAVEFORM', 19);
const WAVE8 = [...WAVE4.map(([v]) => v), ...WAVE4.map(([v]) => `${v}+sub`)];
rotary('osc2.wave', 427.5, 621, WAVE8.map((v, i) => ({ v, label: '', a: -45 + i * 30 })), 'saw', {
  name: 'Oscillator 2 / sub waveform', module: 'osc',
  help: 'Oscillator 2’s shape: triangle, sawtooth, square or narrow pulse. The four positions round the right, under the SUB bracket, give the same shapes and also put the sub-oscillator, a square an octave below Oscillator 2, on mixer channel 3 in place of the white noise.',
});
WAVE4.forEach(([, s], i) => {
  const [gx, gy] = polarXY(427.5, 621, 34, -45 + i * 30); glyph(gx, gy, s);
  const [hx, hy] = polarXY(427.5, 621, 35, 77 + i * 29); glyph(hx, hy, s, 9);
});
for (let i = 0; i < 6; i++) decor.push({ t: 'arc', x: X(427.5), y: Y(621), r: 30 * K, a0: 66 + i * 18, a1: 76 + i * 18, w: 2.4, cap: 'butt' });
text(414, 654, 'SUB', 15, { weight: 700 });
text(427.5, 664, 'WAVEFORM', 19);
knob('osc.fine', 392.5, 697.5, {
  min: -4, max: 4, def: 0, name: 'Fine tune', module: 'osc', fmt: (v) => fmtSemi(v),
  help: 'Tunes both oscillators together, up to four semitones either way, to match other instruments. Leave it at 0, the top, to play in tune.',
});
bipolarArc(392.5, 697.5);
text(392.5, 728, 'FINE TUNE', 19);

// ── Mixer ─────────────────────────────────────────────────────────────────
knob('mix.1', 513, 469.5, {
  def: 7, name: 'Mixer 1 (Oscillator 1)', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud Oscillator 1 is in the mix going into the filter. A cable in MIX 1 replaces Oscillator 1 here with whatever is patched.',
});
text(513, 500, '1', 19);
knob('mix.2', 513, 545, {
  def: 0, name: 'Mixer 2 (Oscillator 2)', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud Oscillator 2 is in the mix. A cable in MIX 2 replaces Oscillator 2 here.',
});
text(513, 576, '2', 19);
knob('mix.3', 513, 621, {
  def: 0, name: 'Mixer 3 (sub / white noise)', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The third channel: white noise, or the sub-oscillator when OSC 2’s waveform switch is under its SUB bracket. Noise gives breath, wind and snare sounds; the sub gives weight an octave under Oscillator 2.',
});
text(513, 652, '3 / W NOISE', 19);

// ── Utilities ─────────────────────────────────────────────────────────────
knob('hpf.cutoff', 599, 469.5, {
  def: 3, name: 'Hi pass filter', module: 'util', fmt: (v) => fmtHz(hpHz(v)),
  help: 'The cutoff of the separate high-pass filter. It is not in the sound until something is patched into the HI PASS input; its output is the HI PASS jack. Clockwise takes away more of the low end.',
});
text(599, 500, 'HI PASS FILTER', 19);
knob('att.amount', 599, 545, {
  min: -5, max: 5, def: 0, name: 'Attenuator', module: 'util', fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} %`,
  help: 'Scales whatever is patched into ATT INPUT: 0 at the top passes nothing, clockwise passes more of it, anticlockwise passes it upside down. With nothing patched it puts out a steady voltage you set with the knob.',
});
bipolarArc(599, 545);
text(599, 576, 'ATTENUATOR', 19);
knob('mod.amount', 599, 621, {
  def: 0, name: 'Modulation', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The master depth for the LFO: PITCH MOD, PULSE WIDTH and FILTER MOD set how far the LFO can move each destination, and MODULATION sets how much of that is used. At 0 the LFO moves nothing.',
});
text(599, 652, 'MODULATION', 19);

// ── Logo ──────────────────────────────────────────────────────────────────
decor.push({ t: 'logo', x: X(504), y: Y(717), size: 13, text: 'behringer', style: 'behringer', hw: true });
decor.push({ t: 'text', x: X(531), y: Y(710), text: 'MODEL', size: 46, anchor: 'start', weight: 800, hw: true });
decor.push({ t: 'text', x: X(605), y: Y(710), text: '15', size: 46, anchor: 'start', weight: 500, hw: true });
text(582, 720, 'SEMI-MODULAR ANALOG SYNTHESIZER', 11, { weight: 700, hw: true });

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 690, 469.5, {
  r: 38, def: 6, name: 'Cutoff', module: 'filter', fmt: (v) => fmtHz(cutoffHz(v)), scale: { ticks: 31, nums: [], tickR: 1.32 },
  help: 'The cutoff of the low-pass ladder filter. Turned down, the sound gets darker and duller; turned up, brighter. The printed scale runs from 20 Hz to 20 kHz.',
});
text(657, 442, '200', 15, { weight: 700 }); text(657, 450, 'Hz', 15, { weight: 700 });
text(725, 442, '2', 15, { weight: 700 }); text(725, 450, 'kHz', 15, { weight: 700 });
text(666, 501, '20 Hz', 15, { weight: 700 }); text(717, 501, '20 kHz', 15, { weight: 700 });
text(690, 510, 'CUTOFF', 19);
line(690, 516, 690, 525);
slide('vcf.kbd', 692, 545, [{ v: 'half', label: '1:2' }, { v: 'off', label: 'OFF' }, { v: 'full', label: '1:1' }], 'off', {
  name: 'Key tracking', module: 'filter',
  help: 'How far the cutoff follows the keys. OFF keeps it still, so high notes sound darker than low ones. 1:2 moves it half as far as the pitch; 1:1 moves it with the pitch, so every note has the same tone, and a filter that is ringing on its own plays in tune.',
});
text(665, 530.5, '1:2', 15); text(690, 530.5, 'OFF', 15); text(714, 530.5, '1:1', 15);
text(690, 561, 'KEY TRACKING', 19);
knob('vcf.res', 690, 621, {
  def: 2, name: 'Resonance', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near the top the filter rings on its own and whistles a tone of its own.',
});
text(690, 652, 'RESONANCE', 19);
knob('vcf.env', 690, 697.5, {
  min: -5, max: 5, def: 2, name: 'Envelope amount', module: 'filter', fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 7).toFixed(1)} oct`,
  help: 'How far the envelope moves the cutoff on each note. Clockwise from 0 the filter opens with the envelope and closes again, the classic pluck or swell; anticlockwise it dips darker instead.',
});
bipolarArc(690, 697.5);
text(690, 728, 'ENV AMT', 19);

// ── Envelope ──────────────────────────────────────────────────────────────
knob('env.attack', 781, 469.5, {
  def: 0, name: 'Attack', module: 'env', fmt: (v) => fmtTime(attTime(v)),
  help: 'How long the envelope takes to rise when a key goes down. Short is a hard start; long is a slow swell, up to 16 seconds.',
});
text(781, 500, 'ATTACK', 19);
knob('env.decay', 781, 545, {
  def: 5, name: 'Decay', module: 'env', fmt: (v) => fmtTime(decTime(v)),
  help: 'How long the envelope takes to fall from its peak to the sustain level while the key is held.',
});
text(781, 576, 'DECAY', 19);
knob('env.sustain', 781, 621, {
  def: 7, name: 'Sustain', module: 'env', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level the envelope holds at for as long as the key is down, after the decay.',
});
text(781, 652, 'SUSTAIN', 19);
knob('env.release', 781, 697.5, {
  def: 3, name: 'Release', module: 'env', fmt: (v) => fmtTime(relTime(v)),
  help: 'How long the envelope takes to fall back to nothing after the key is let go.',
});
text(781, 728, 'RELEASE', 19);

// ── Control ───────────────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(839.5), y: Y(441), r: 7, color: 'red', litWhen: 'gate' });
decor.push({ t: 'din', x: X(866), y: Y(469), r: 40 });
text(866, 500, 'MIDI IN', 19);
knob('out.volume', 866, 545, {
  def: 7, name: 'Volume', module: 'out', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The overall output level.',
});
text(866, 576, 'VOLUME', 19);
slide('vca.mode', 873, 612.5, [{ v: 'env', label: 'ENV' }, { v: 'release', label: 'RELEASE' }, { v: 'on', label: 'ON' }], 'env', {
  name: 'VCA mode', module: 'amp',
  help: 'What opens the VCA, the stage that sets the loudness. ENV: the envelope, so each note follows ATTACK, DECAY, SUSTAIN and RELEASE. RELEASE: full level while the key is held, fading out over RELEASE after it is let go, while the envelope still shapes the filter. ON: always open, a drone, and a cable into VCA CV sets the level.',
});
text(839, 597.5, 'ENV', 15); text(866, 597.5, 'RELEASE', 15); text(895, 597.5, 'ON', 15);
text(866, 628, 'VCA MODE', 19);

// ── Reverb ────────────────────────────────────────────────────────────────
knob('rev.mix', 866, 697.5, {
  def: 2, name: 'Reverb mix', module: 'fx', fmt: (v) => `${Math.round(v * 10)} % wet`,
  help: 'The balance between the dry sound and the spring reverb. At 0 there is no reverb; turned up, the sound gets more distant and splashy.',
});
text(866, 728, 'MIX', 19);

// ── Patch bay ─────────────────────────────────────────────────────────────
const COLS = [928.5, 966.5, 1004.5, 1042.5, 1080.5, 1118.5];
const ROWS = [475, 508.4, 542, 576, 609.6, 643, 676.6];
const jack = (id, x, y, dir, rest) => jacks.push({ id, x: X(x), y: Y(y), r: 15, labelPos: 'none', dir, ...rest });
/** One cell of the patch bay: a printed box with the jack's name on a strip under it, coloured by section. */
const cell = (x, y, label, color) => {
  box(x - 17.5, y - 13.5, x + 17.5, y + 17.5, { stroke: color === C.white ? INK : color, sw: 2.4, r: 2 });
  box(x - 17.5, y + 11, x + 17.5, y + 17.5, { fill: color, r: 1, hw: true });
  if (label) text(x, y + 14.4, label, 10.5, { fill: DARK, weight: 700 });
};
frame(911, 412.6, 1023, 739);
frame(1025, 412.6, 1137.4, 739);
tab(915, 1019, 'INPUTS', C.white, 416, 431);
tab(1029, 1133, 'OUTPUTS', C.white, 416, 431);
box(914, 433, 1020, 452, { stroke: INK, sw: 2.4, r: 2 }); text(966.5, 456, 'AUDIO', 10.5, { weight: 700 });
box(1028, 433, 1134.5, 452, { stroke: INK, sw: 2.4, r: 2 }); text(1080.5, 456, 'AUDIO', 10.5, { weight: 700 });
box(914, 697, 1020, 725, { stroke: INK, sw: 2.4, r: 2 }); text(966.5, 729.5, 'MULTI 1', 10.5, { weight: 700 });
box(1028, 697, 1134.5, 725, { stroke: INK, sw: 2.4, r: 2 }); text(1080.5, 729.5, 'MULTI 2', 10.5, { weight: 700 });
[[938, 948], [976, 986], [1052, 1062], [1090, 1100]].forEach(([a, b]) => line(a, 711, b, 711, 2.4));

/** [column, row, id, label, colour, jack fields] for every jack in the bay. */
const lvl = (id) => (v) => level10(v[id], 1);
const BAY = [
  [0, 0, 'j.mix1', 'MIX 1', C.white, { dir: 'in', dest: 'extIn', amt: lvl('mix.1'), name: 'MIX 1 input',
    check: (v) => (v['mix.1'] <= 0 ? 'Mixer knob 1 is at 0, so nothing patched here reaches the filter. Turn knob 1 up.' : null),
    help: 'Into mixer channel 1, in place of Oscillator 1. Mixer knob 1 sets its level.' }],
  [1, 0, 'j.mix2', 'MIX 2', C.white, { dir: 'in', dest: 'extIn', amt: lvl('mix.2'), name: 'MIX 2 input',
    check: (v) => (v['mix.2'] <= 0 ? 'Mixer knob 2 is at 0, so nothing patched here reaches the filter. Turn knob 2 up.' : null),
    help: 'Into mixer channel 2, in place of Oscillator 2. Mixer knob 2 sets its level.' }],
  [2, 0, 'j.mix3', 'MIX 3', C.white, { dir: 'in', dest: 'extIn', amt: lvl('mix.3'), name: 'MIX 3 input',
    check: (v) => (v['mix.3'] <= 0 ? 'Mixer knob 3 is at 0, so nothing patched here reaches the filter. Turn knob 3 up.' : null),
    help: 'Into mixer channel 3, in place of the white noise or sub-oscillator. Mixer knob 3 sets its level.' }],
  [0, 1, 'j.rev_in', 'REVERB', C.green, { dir: 'in', dest: 'revIn', amt: 1, name: 'REVERB input',
    check: (v) => (v['rev.mix'] <= 0 ? 'REVERB MIX is at 0, so only the dry signal is heard, and that is now whatever is patched here. Turn MIX up to hear the reverb.' : null),
    help: 'Straight into the reverb, in place of the VCA. The reverb feeds the output, so whatever is patched here is what you hear, dry and wet as MIX sets.' }],
  [1, 1, 'j.filter_in', 'FILTER', C.red, { dir: 'in', dest: 'vcfIn', amt: 1, name: 'FILTER input',
    help: 'Audio into the ladder filter, in place of the mixer.' }],
  [2, 1, 'j.hp_in', 'HI PASS', C.white, { dir: 'in', dest: 'hp6In', amt: 1, name: 'HI PASS input',
    help: 'Into the separate high-pass filter. Its output is the HI PASS jack on the right, and HI PASS FILTER sets the cutoff.' }],
  [0, 2, 'j.osc1_pwm', 'OSC 1 PWM', C.yellow, { dir: 'in', dest: 'pw1', amt: 0.4, add: true,
    check: (v) => (/^(sq|narrow)/.test(v['osc1.wave']) ? null : 'Oscillator 1 is not on the square or narrow pulse wave, and pulse width only changes those. Switch its WAVEFORM to one of them.'),
    help: 'Moves the pulse width of Oscillator 1’s square and narrow pulse waves, adding to the LFO’s PULSE WIDTH modulation.' }],
  [1, 2, 'j.env_amt', 'ENV AMT', C.red, { dir: 'in', dest: null, name: 'ENV AMT input',
    help: 'On the hardware, a voltage here sets how far the envelope moves the cutoff, so velocity or an LFO can change the filter sweep. This app cannot model it: a cable here changes nothing.' }],
  [2, 2, 'j.cutoff', 'CUTOFF', C.red, { dir: 'in', dest: 'cutoff', amt: 5, add: true, name: 'CUTOFF input',
    help: 'Moves the filter cutoff, adding to the CUTOFF knob, the envelope and the LFO.' }],
  [0, 3, 'j.osc2_fm', 'OSC 2 FM', C.yellow, { dir: 'in', dest: 'pitch2', amt: 12, add: true, name: 'OSC 2 FM input',
    help: 'Frequency modulation of Oscillator 2. A slow signal bends its pitch; an audio-rate one, such as Oscillator 1, gives clangy, bell-like and metallic tones.' }],
  [1, 3, 'j.osc1_cv', 'OSC 1 CV', C.yellow, { dir: 'in', dest: 'pitch1', amt: 12, add: true, name: 'OSC 1 CV input',
    help: 'Moves the pitch of Oscillator 1, added to the keys.' }],
  [2, 3, 'j.osc2_cv', 'OSC 2 CV', C.yellow, { dir: 'in', dest: 'pitch2', amt: 12, add: true, name: 'OSC 2 CV input',
    help: 'Moves the pitch of Oscillator 2, added to the keys.' }],
  [0, 4, 'j.env_trig', 'ENV TRIG', C.white, { dir: 'in', dest: 'gateIn', amt: 1, name: 'ENV TRIG input',
    help: 'Fires the envelope, in place of the keys. A square LFO here plays the envelope over and over by itself.' }],
  [1, 4, 'j.vca_in', 'VCA', C.white, { dir: 'in', dest: 'vcaIn', amt: 1, name: 'VCA input',
    help: 'Audio into the VCA, in place of the filter output.' }],
  [2, 4, 'j.vca_cv', 'VCA CV', C.white, { dir: 'in', dest: 'amp', amt: 1, add: true, name: 'VCA CV input',
    help: 'Opens the VCA. In VCA MODE ON a cable here takes over the level, so the patched signal sets the loudness; in the other modes it adds to the envelope.' }],
  [0, 5, 'j.lfo_trig', 'LFO TRIG', C.white, { dir: 'in', dest: 'lfoTrig', amt: 1, name: 'LFO TRIG input',
    help: 'Restarts the LFO’s cycle on each rising edge, for example from GATE so every note starts its vibrato or wah from the same point.' }],
  [1, 5, 'j.lfo_rate', 'LFO RATE', C.white, { dir: 'in', dest: 'lfoRate', amt: 4, add: true, name: 'LFO RATE input',
    help: 'Speeds the LFO up and slows it down, adding to the RATE knob.' }],
  [2, 5, 'j.att_in', 'ATT', C.white, { dir: 'in', dest: 'att1In', amt: 1, name: 'ATT input',
    help: 'Into the attenuator. Its output, ATT on the right, is this signal scaled, or turned upside down, by the ATTENUATOR knob. With nothing here it puts out a steady voltage instead.' }],
  [0, 6, 'j.arp_sync', 'ARP/SEQ SYN', C.blue, { dir: 'in', dest: null, name: 'ARP/SEQ SYNC input',
    help: 'On the hardware, a clock here sets the arpeggiator’s tempo. This app cannot model it: a cable here changes nothing.' }],
  [1, 6, 'j.arp_reset', 'ARP/SEQ RES', C.blue, { dir: 'in', dest: null, name: 'ARP/SEQ RESET input',
    help: 'On the hardware, a pulse here sends the arpeggio or sequence back to its first step. This app cannot model it: a cable here changes nothing.' }],
  [2, 6, 'j.arp_on', 'ARP/SEQ ON', C.blue, { dir: 'in', dest: null, name: 'ARP/SEQ ON input',
    help: 'On the hardware, a high voltage here starts the arpeggiator and a low one stops it. This app cannot model it: a cable here changes nothing.' }],
  [3, 0, 'j.vca_out', 'VCA', C.white, { dir: 'out', signal: 'vca', name: 'VCA output', help: 'The VCA’s output, before the reverb.' }],
  [4, 0, null, '', C.white, null],
  [5, 0, 'j.mixer_out', 'MIXER', C.white, { dir: 'out', signal: 'mixer', name: 'MIXER output', help: 'The mixer’s output, before the filter.' }],
  [3, 1, 'j.hp_out', 'HI PASS', C.white, { dir: 'out', signal: 'hp6', name: 'HI PASS output',
    help: 'The separate high-pass filter’s output. It is silent until something is patched into the HI PASS input.' }],
  [4, 1, 'j.filter_out', 'FILTER', C.red, { dir: 'out', signal: 'vcf1', name: 'FILTER output', help: 'The ladder filter’s output, before the VCA.' }],
  [5, 1, 'j.rev_out', 'REVERB', C.green, { dir: 'out', signal: 'rev', name: 'REVERB output', help: 'The reverb’s output: the dry and reverberated signal, blended by MIX.' }],
  [3, 2, 'j.white', 'W NOISE', C.yellow, { dir: 'out', signal: 'noise', name: 'White noise output', help: 'White noise: an even hiss across the whole range.' }],
  [4, 2, null, '', C.yellow, null],
  [5, 2, 'j.pink', 'P NOISE', C.yellow, { dir: 'out', signal: 'pink', name: 'Pink noise output', help: 'Pink noise: hiss with more weight in the low end, closer to rain or surf than white noise.' }],
  [3, 3, 'j.osc1_out', 'OSC 1', C.yellow, { dir: 'out', signal: 'osc1', name: 'OSC 1 output', help: 'Oscillator 1 on its own, before the mixer.' }],
  [4, 3, 'j.sub_out', 'SUB', C.yellow, { dir: 'out', signal: 'sub', name: 'SUB output', help: 'The sub-oscillator on its own: a square wave an octave below Oscillator 2.' }],
  [5, 3, 'j.osc2_out', 'OSC 2', C.yellow, { dir: 'out', signal: 'osc2', name: 'OSC 2 output', help: 'Oscillator 2 on its own, before the mixer.' }],
  [3, 4, 'j.env_out', 'ENV', C.white, { dir: 'out', signal: 'env1', name: 'ENV output', help: 'The envelope, rising and falling with each note.' }],
  [4, 4, 'j.sh_out', 'S&H', C.white, { dir: 'out', signal: 'sh', name: 'S&H output',
    help: 'The sample and hold: a new random level each LFO cycle, held until the next. Patched to pitch or cutoff it gives stepped, computer-like patterns.' }],
  [5, 4, 'j.env_inv', 'ENV INV', C.white, { dir: 'out', signal: 'env1', gain: -1, name: 'ENV INV output', help: 'The envelope upside down: it falls when the envelope rises.' }],
  [3, 5, 'j.att_out', 'ATT', C.white, { dir: 'out', signal: 'att1', name: 'ATT output',
    help: 'The attenuator’s output: ATT INPUT scaled or turned upside down by the ATTENUATOR knob, or with nothing patched in, a steady voltage set by the knob.' }],
  [4, 5, 'j.lfo_out', 'LFO', C.white, { dir: 'out', signal: 'lfo', name: 'LFO output', help: 'The LFO, in the shape set by its WAVEFORM switch.' }],
  [5, 5, 'j.velocity', 'VELOCITY', C.blue, { dir: 'out', signal: 'vel', name: 'VELOCITY output', help: 'How hard each key was played, as a voltage. Patch it to CUTOFF so harder notes are brighter.' }],
  [3, 6, 'j.note_cv', 'NOTE CV', C.blue, { dir: 'out', signal: 'kbd', name: 'NOTE CV output', help: 'The pitch of the key played, as a voltage.' }],
  [4, 6, 'j.gate_out', 'GATE', C.blue, { dir: 'out', signal: 'gate', name: 'GATE output', help: 'High while a key is held, low when it is let go.' }],
  [5, 6, 'j.sync_out', 'SYNC', C.blue, { dir: 'out', signal: null, name: 'SYNC output',
    help: 'On the hardware, the arpeggiator’s clock, to keep other gear in time. This app cannot model it: a cable from here carries nothing.' }],
];
for (const [c, r, id, label, color, j] of BAY) {
  cell(COLS[c], ROWS[r], label, color);
  if (id) jack(id, COLS[c], ROWS[r], j.dir, { label, ...j });
}
jack('j.audio_in', 966.5, 441.4, 'in', {
  label: 'AUDIO', name: 'AUDIO input', dest: 'extIn', amt: lvl('mix.3'),
  check: (v) => (v['mix.3'] <= 0 ? 'Mixer knob 3 is at 0, so nothing patched here reaches the filter. Turn knob 3 up.' : null),
  help: 'Outside audio into the synth. The guide does not say where it enters; here it takes mixer channel 3’s place, like MIX 3, so knob 3 sets its level and the filter shapes it.',
});
jack('j.audio_out', 1080.5, 441.4, 'out', { label: 'AUDIO', name: 'AUDIO output', signal: 'master', help: 'The main audio output, after the reverb.' });
const MULTI = 'A multiple: the three jacks are joined, so one signal can go to two places. Here the first jack of each group is the input and the other two are copies of it.';
jack('j.m1a', 928.5, 711, 'in', { label: 'MULTI 1', name: 'MULTI 1 input', dest: 'multIn', amt: 1, help: MULTI });
jack('j.m1b', 966.5, 711, 'out', { label: 'MULTI 1', name: 'MULTI 1 copy (2)', signal: 'mult', help: MULTI });
jack('j.m1c', 1004.5, 711, 'out', { label: 'MULTI 1', name: 'MULTI 1 copy (3)', signal: 'mult', help: MULTI });
jack('j.m2a', 1042.5, 711, 'in', { label: 'MULTI 2', name: 'MULTI 2 input', dest: 'sum1A', amt: 1, help: MULTI });
jack('j.m2b', 1080.5, 711, 'out', { label: 'MULTI 2', name: 'MULTI 2 copy (2)', signal: 'sum1', help: MULTI });
jack('j.m2c', 1118.5, 711, 'out', { label: 'MULTI 2', name: 'MULTI 2 copy (3)', signal: 'sum1', help: MULTI });

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: X(x0), y: Y(y0), w: (x1 - x0) * K, h: (y1 - y0) * K });
const areas = [
  { id: 'arp', label: 'Arpeggiator / sequencer', module: 'mode', keywords: 'arp arpeggio sequencer seq tempo clock hold latch play tap',
    rects: [R(60, 405, 147, 672), R(147, 670, 314, 745)],
    help: 'Hold a chord, press PLAY, and the arpeggiator plays its notes one after another at RATE. DIRECTION picks the order, OCT / SEQ how many octaves it climbs, and HOLD keeps it going after the keys are let go. On the hardware the same section records and plays three sequences of up to 256 steps.' },
  { id: 'glide', label: 'Glide', module: 'glide', keywords: 'portamento slide legato',
    rects: [R(60, 672, 147, 745)],
    help: 'GLIDE makes each note slide into the next instead of jumping. Fully anticlockwise is off.' },
  { id: 'lfo', label: 'Low frequency osc (LFO)', module: 'lfo', keywords: 'lfo vibrato wobble trill tremolo wah pwm rate shape',
    rects: [R(147, 405, 314, 670)],
    help: 'The LFO makes no sound itself; it moves other things. RATE sets its speed and WAVEFORM its shape. The three coloured knobs set how far it can move the pitch, the pulse width and the filter, and MODULATION in the utilities is the master depth for all three.' },
  { id: 'osc1', label: 'Oscillator 1', module: 'osc', keywords: 'oscillator vco octave footage waveform sawtooth square triangle pulse',
    rects: [R(314, 405, 393, 527), R(314, 575, 393, 662)],
    help: 'Oscillator 1: OCTAVE picks its range in organ feet and WAVEFORM its shape. It is the master for sync.' },
  { id: 'osc2', label: 'Oscillator 2 and sub', module: 'osc', keywords: 'oscillator vco detune interval sync sub suboscillator octave',
    rects: [R(393, 405, 472, 662), R(314, 527, 393, 575)],
    help: 'Oscillator 2: OCTAVE, FREQUENCY to tune it up to seven semitones against Oscillator 1, SYNC to lock it to Oscillator 1, and WAVEFORM. The positions under the SUB bracket also bring in the sub-oscillator, a square an octave below, on mixer channel 3.' },
  { id: 'tune', label: 'Fine tune', module: 'osc', keywords: 'tuning pitch master tune',
    rects: [R(314, 662, 472, 745)],
    help: 'FINE TUNE moves both oscillators together, up to four semitones either way.' },
  { id: 'mixer', label: 'Mixer', module: 'mixer', keywords: 'mixer level volume noise sub',
    rects: [R(472, 405, 555, 670)],
    help: 'Levels into the filter: Oscillator 1, Oscillator 2, and channel 3, which is white noise or, with OSC 2’s waveform under its SUB bracket, the sub-oscillator. Pushing the levels up drives the filter harder for a thicker, slightly overdriven tone.' },
  { id: 'hpf', label: 'Hi pass filter', module: 'util', keywords: 'high-pass highpass hpf low cut thin',
    rects: [R(555, 405, 641, 507)],
    help: 'A separate 6 dB high-pass filter in the patch bay, not in the sound until something is patched into HI PASS. The knob sets its cutoff.' },
  { id: 'att', label: 'Attenuator', module: 'util', keywords: 'attenuverter invert scale offset voltage',
    rects: [R(555, 507, 641, 587)],
    help: 'Scales or turns upside down whatever is patched into ATT INPUT; with nothing patched it is a steady voltage set by the knob, useful for offsetting a pitch or cutoff by cable.' },
  { id: 'modamt', label: 'Modulation', module: 'mod', keywords: 'mod depth amount lfo master',
    rects: [R(555, 587, 641, 670)],
    help: 'MODULATION is the master depth for the LFO. At 0 the LFO moves nothing; turned up, it applies the depths set on PITCH MOD, PULSE WIDTH and FILTER MOD.' },
  { id: 'vcf', label: 'Filter', module: 'filter', keywords: 'ladder low-pass lowpass cutoff resonance emphasis key tracking envelope amount brightness',
    rects: [R(641, 405, 738, 745)],
    help: 'A 24 dB low-pass ladder filter, the Moog design. CUTOFF sets how bright the sound is, RESONANCE how sharply it rings at the cutoff, KEY TRACKING how far the cutoff follows the keys, and ENV AMT how far the envelope sweeps it, up or down.' },
  { id: 'env', label: 'Envelope', module: 'env', keywords: 'adsr attack decay sustain release contour',
    rects: [R(738, 405, 825, 745)],
    help: 'One ADSR envelope, fired by each key. It always moves the filter, by ENV AMT, and in VCA MODE ENV it shapes the loudness too.' },
  { id: 'control', label: 'Control: volume and VCA mode', module: 'amp', keywords: 'midi volume vca drone amplifier loudness',
    rects: [R(825, 405, 908, 644)],
    help: 'MIDI IN is where the keyboard plays the synth. VOLUME is the output level. VCA MODE chooses what opens the amplifier: the envelope (ENV), the keys with the envelope’s release time (RELEASE), or nothing, left open as a drone (ON).' },
  { id: 'reverb', label: 'Reverb', module: 'fx', keywords: 'spring reverb echo room space',
    rects: [R(825, 644, 908, 745)],
    help: 'A spring reverb after the VCA. MIX blends the dry sound with the reverb.' },
  { id: 'bay-audio', label: 'Patch bay: audio path', module: 'util', keywords: 'patch jack input output audio mixer filter vca reverb high-pass',
    rects: [R(908, 405, 1140, 525)],
    help: 'Inputs on the left, outputs on the right. Each stage of the sound path can be taken out (MIXER, FILTER, VCA, REVERB) or fed from elsewhere (MIX 1–3, FILTER, VCA, REVERB). A cable into an audio input replaces what was wired there. The HI PASS pair is the separate high-pass filter.' },
  { id: 'bay-osc', label: 'Patch bay: oscillators and noise', module: 'osc', keywords: 'patch fm pwm cv pitch noise white pink sub',
    rects: [R(908, 525, 1140, 593)],
    help: 'Pitch, FM and pulse-width inputs for the oscillators, the filter’s CUTOFF and ENV AMT inputs, and outputs for each oscillator, the sub-oscillator and white and pink noise. Pitch inputs add to the keys rather than replacing them.' },
  { id: 'bay-mod', label: 'Patch bay: envelope, VCA, LFO and utilities', module: 'mod', keywords: 'patch envelope trigger lfo sample hold attenuator velocity inverted',
    rects: [R(908, 593, 1140, 660)],
    help: 'The envelope’s trigger input and its normal and upside-down outputs, the VCA’s inputs, the LFO’s reset and rate inputs and its output, the sample and hold, the attenuator, and key VELOCITY.' },
  { id: 'bay-midi', label: 'Patch bay: keyboard and arpeggiator', module: 'util', keywords: 'patch note cv gate clock sync reset',
    rects: [R(908, 660, 1140, 694)],
    help: 'NOTE CV and GATE are the keyboard as voltages, for driving other gear or the synth’s own inputs. The blue inputs clock, reset and start the arpeggiator on the hardware.' },
  { id: 'bay-multi', label: 'Multiples', module: 'util', keywords: 'mult multiple split copy',
    rects: [R(908, 694, 1140, 745)],
    help: 'Two groups of three joined jacks, for sending one signal to two places.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const WAVE_MIX = {
  tri: { mix: { tri: 1 }, pw: 0.5 }, saw: { mix: { saw: 0.8 }, pw: 0.5 },
  sq: { mix: { pulse: 0.75 }, pw: 0.5 }, narrow: { mix: { pulse: 0.75 }, pw: 0.15 },
};
const LFO_MIX = { sine: { sine: 1 }, saw: { rsaw: 1 }, ramp: { saw: 1 }, square: { sq: 1 } };
const ARP_ORDER = { ordr: 'played', bf: 'updown', rndm: 'random' };
const KBD = { half: 0.5, off: 0, full: 1 };

function toEngine(v, ctx = {}) {
  const patched = ctx.patched || {};
  const w2 = v['osc2.wave'];
  const sub = w2.endsWith('+sub');
  const wave2 = WAVE_MIX[sub ? w2.slice(0, -4) : w2];
  const wave1 = WAVE_MIX[v['osc1.wave']];
  const ch3 = patched['j.mix3'] || patched['j.audio_in'] ? 0 : level10(v['mix.3'], 1);
  const mod = v['mod.amount'] / 10;
  const routes = [];
  const add = (dst, amt) => { if (amt) routes.push({ src: 'lfo', dst, amt }); };
  add('pitchAll', Math.pow(v['lfo.pitch'] / 10, 2) * 24 * mod);
  const pwAmt = (v['lfo.pw'] / 10) * 0.4 * mod;
  add('pw1', pwAmt); add('pw2', pwAmt);
  add('cutoff', (v['lfo.filter'] / 10) * 5 * mod);
  const rate = lfoHz(v['lfo.rate']);
  const a = attTime(v['env.attack']), d = decTime(v['env.decay']), r = relTime(v['env.release']);
  const mode = v['vca.mode'];
  return {
    osc: [
      { level: patched['j.mix1'] ? 0 : level10(v['mix.1'], 1), ...wave1, semi: OCT1[v['osc1.oct']], kbd: true, syncTo: -1 },
      { level: patched['j.mix2'] ? 0 : level10(v['mix.2'], 1), ...wave2, semi: OCT2[v['osc2.oct']] + v['osc2.freq'], kbd: true,
        syncTo: v['osc2.sync'] ? 0 : -1, subLevel: sub ? ch3 * 0.8 : 0 },
    ],
    subOut: true,
    noise: { level: sub ? 0 : ch3 * 0.7, color: 'white' },
    ext: { level: 1 },
    filter: { type: 'ladder', mode: 'lp', cutoff: cutoffHz(v['vcf.cutoff']), res: (v['vcf.res'] / 10) * 1.08, envAmt: signed(v['vcf.env'], 7), envSrc: 'env1', kbd: KBD[v['vcf.kbd']] },
    env1: { a, d, s: v['env.sustain'] / 10, r },
    // VCA MODE RELEASE: the loudness is a plain gate with the envelope's release on the end
    env2: { a: 0.002, d: 0.01, s: 1, r },
    vca: mode === 'on' ? { envSrc: 'none', bias: patched['j.vca_cv'] ? 0 : 1 } : { envSrc: mode === 'release' ? 'env2' : 'env1', bias: 0 },
    lfo: { rate, mix: LFO_MIX[v['lfo.wave']], keySync: false },
    glide: { time: glideTime(v['glide']), legato: false },
    // both envelopes fire from ENV TRIG, which is normalled to the key gate
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    routes,
    normals: { gateIn: 'gate', att1In: ['one', 0.8], revIn: 'out', dryIn: 'rev' },
    hp6: { cutoff: hpHz(v['hpf.cutoff']) },
    rev: { on: true, unit: true, mix: (v['rev.mix'] / 10) * 0.85, decay: 0.8, damp: 0.45 },
    od: { on: false }, delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' }, slew: { time: 0.1 }, att: [clamp(v['att.amount'] / 5, -1, 1), 1],
    poly: { voices: 1, stack: 1, mono: true },
    arp: { on: !!v['arp.play'], bpm: arpBpm(v['arp.rate']), gate: 0.5, mode: ARP_ORDER[v['arp.dir']], octaves: Number(v['arp.oct']), hold: !!v['arp.hold'] },
    tune: v['osc.fine'],
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'm15-ladder-bass', name: 'Ladder Bass', ref: 'The Moog bass: two sawtooths through a closing ladder filter', artist: 'Classic technique',
    tags: ['bass', 'moog', 'classic'], level: 1,
    blurb: 'A round, punchy bass with a quick filter snap on every note.',
    how: 'Two sawtooths, one an octave under the other, give the bass both weight and edge. The ladder filter sits low and the envelope, through ENV AMT, opens it briefly at the start of each note. A short decay to a low sustain makes every note bite and then settle.',
    phrase: { bpm: 112, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.2], [1, 48, 0.4], [1.5, 36, 0.4], [2, 39, 0.4], [2.5, 41, 0.4], [3, 43, 0.4], [3.5, 46, 0.4]] },
    steps: [
      { title: 'Two sawtooths, an octave apart', module: 'osc', why: 'Both oscillators on sawtooth, the brightest wave, with Oscillator 2 an octave below Oscillator 1. The low one gives the bass its weight, the upper one its edge.\n- Oscillator 1 OCTAVE 8’, WAVEFORM sawtooth: 8’ plays at the pitch of the keys.\n- Oscillator 2 OCTAVE 16’, WAVEFORM sawtooth: 16’ is an octave lower.\n- FREQUENCY +0.1: a hair sharp of exact, so the two beat very slowly and the bass sounds thicker.\n- Mixer 1 at 7 and 2 at 8: the low saw a little louder so the weight leads.\n- Listen for: a bright, buzzy, full sound. The filter tames it next.',
        set: { 'osc1.oct': '8', 'osc1.wave': 'saw', 'osc2.oct': '16', 'osc2.wave': 'saw', 'osc2.freq': 0.1, 'mix.1': 7, 'mix.2': 8 } },
      { title: 'A low ladder filter', module: 'filter', why: 'The 24 dB ladder filter takes most of the brightness away, leaving a round, dark body. The next step opens it on each note.\n- CUTOFF 3.5 (about 220 Hz): low, so the buzz is gone and you hear the body.\n- RESONANCE 3 (30 %): a little ring at the cutoff, which will give the snap an edge.\n- KEY TRACKING 1:2: the cutoff follows the keys half as far as the pitch, so the high notes of the riff stay bright enough.\n- Listen for: a much darker, rounder bass.',
        set: { 'vcf.cutoff': 3.5, 'vcf.res': 3, 'vcf.kbd': 'half' } },
      { title: 'Snap it open', module: 'env', why: 'The envelope opens the filter at the start of each note and lets it close again. Short and deep, that is the classic Moog bass pluck.\n- ENV AMT +3 (+3.4 octaves): how far the envelope lifts the cutoff. Anticlockwise would make each note dip darker instead.\n- ATTACK 0 (2 ms): the snap lands right on the beat.\n- DECAY 3.5 (64 ms): how fast it closes again. Shorter is a click; longer turns it into a wah.\n- SUSTAIN 2 (20 %): held notes settle low, both in brightness and, with VCA MODE on ENV, in level.\n- RELEASE 2 (13 ms): notes stop as soon as the key comes up.\n- Listen for: a firm “dow” on every note. Sweep DECAY between 3 and 5 while the riff plays.',
        set: { 'vcf.env': 3, 'env.attack': 0, 'env.decay': 3.5, 'env.sustain': 2, 'env.release': 2 } },
      { title: 'Dry it up', module: 'fx', why: 'A bass is usually best dry: reverb smears the low end.\n- Reverb MIX 0: no reverb at all.\n- Listen for: tight, clean gaps between the notes.',
        set: { 'rev.mix': 0 } },
    ],
    context: {
      'vcf.env': 'In this sound: the size of the snap on each note.',
      'env.decay': 'In this sound: the length of the snap, from a click to a wah.',
      'vcf.cutoff': 'In this sound: how dark the bass is between snaps.',
      'osc2.oct': 'In this sound: the lower octave that gives the bass its weight.',
    },
    tweaks: [
      { id: 'env.decay', try: 'Move between 3 and 5', hear: 'From a tight click to a rubbery wah.' },
      { id: 'vcf.res', try: 'Raise to 7', hear: 'Each note squelches.' },
      { id: 'osc2.wave', try: 'Switch to sawtooth under the SUB bracket and raise mixer 3 to 5', hear: 'A square an octave below Oscillator 2 adds a deep floor.' },
    ],
  },
  {
    id: 'm15-sync-sweep', name: 'Sync Sweep', ref: 'Hard sync with the envelope patched to Oscillator 2', artist: 'Classic technique',
    tags: ['lead', 'sync', 'patched'], level: 2,
    blurb: 'A tearing, vocal lead whose tone sweeps down on every note.',
    how: 'SYNC locks Oscillator 2 to Oscillator 1, so moving Oscillator 2’s pitch changes its tone instead. A cable from ENV to OSC 2 CV sweeps it on every note, which is the sound of a classic sync lead. The filter is left open so the sweep is heard in full.',
    phrase: { bpm: 100, loop: true, steps: [[0, 60, 0.9], [1, 63, 0.4], [1.5, 67, 1.4], [3, 70, 0.4], [3.5, 67, 0.4]] },
    steps: [
      { title: 'Synced Oscillator 2 on its own', module: 'osc', why: 'With SYNC on, Oscillator 2 restarts its cycle every time Oscillator 1 does. Its pitch is now Oscillator 1’s, and tuning it higher changes its tone instead.\n- SYNC on: the yellow button.\n- Mixer 1 at 0, mixer 2 at 8: only the synced oscillator is heard. Oscillator 1 still runs, setting the pitch.\n- Oscillator 2 OCTAVE 4’, WAVEFORM sawtooth: two octaves above the master gives a bright, nasal tone.\n- FREQUENCY +4: further up still. Turn it slowly and the tone moves through vowel-like peaks while the pitch stays put.\n- Listen for: a hard, nasal lead. Move FREQUENCY and the tone shifts but the note does not.',
        set: { 'osc2.sync': true, 'mix.1': 0, 'mix.2': 8, 'osc2.oct': '4', 'osc2.wave': 'saw', 'osc2.freq': 4 } },
      { title: 'Patch the envelope to Oscillator 2', module: 'mod', why: 'A cable from ENV to OSC 2 CV adds the envelope to Oscillator 2’s pitch, so its tone sweeps on every note. Because Oscillator 2 is synced, you hear a tearing sweep, not a pitch bend.\n- Cable ENV → OSC 2 CV: the envelope output into Oscillator 2’s pitch input. It adds to the keys rather than replacing them.\n- DECAY 5.5 (about 0.5 s), SUSTAIN 3: the sweep falls over half a second and settles part way.\n- Listen for: each note starting with a bright tear that falls away. Shorter DECAY makes it a bark.',
        set: { 'env.decay': 5.5, 'env.sustain': 3 }, cables: [['j.env_out', 'j.osc2_cv']] },
      { title: 'Filter open, loudness held', module: 'amp', why: 'The filter opens wide so the sweep is heard in full, and the VCA holds the note at full level while the key is down.\n- CUTOFF 7.5 (about 3.6 kHz), ENV AMT 0: the filter stays open and does not move.\n- VCA MODE RELEASE: full level while the key is held, fading over RELEASE after. The envelope only does the sweep, not the loudness.\n- RELEASE 4 (80 ms): a short fade so notes do not click.\n- Listen for: every note at full level while the tone sweeps inside it.',
        set: { 'vcf.cutoff': 7.5, 'vcf.env': 0, 'vca.mode': 'release', 'env.release': 4 } },
      { title: 'Glide and a little room', module: 'glide', why: 'A short glide joins the notes, and a touch of reverb puts the lead in a space.\n- GLIDE 3 (55 ms): each note slides quickly into the next.\n- Reverb MIX 2.5: a short spring tail.\n- Listen for: a smooth, singing line.',
        set: { glide: 3, 'rev.mix': 2.5 } },
    ],
    context: {
      'osc2.freq': 'In this sound: the starting tone of the sweep. Higher is harsher.',
      'env.decay': 'In this sound: how long the sync sweep lasts.',
      'osc2.sync': 'In this sound: what turns the pitch sweep into a tone sweep. Switch it off to hear a plain bend.',
    },
    tweaks: [
      { id: 'osc2.sync', try: 'Switch off', hear: 'The sweep becomes a pitch dive, and the notes go out of tune.' },
      { id: 'osc2.freq', try: 'Sweep from −7 to +7 while holding a note', hear: 'The tone moves through vowel-like peaks while the pitch stays still.' },
      { id: 'mix.1', try: 'Raise to 5', hear: 'Oscillator 1 underneath gives the lead a steadier body.' },
    ],
  },
  {
    id: 'm15-arp-pluck', name: 'Spring Arpeggio', ref: 'The arpeggiator with a plucked tone and spring reverb', artist: 'Classic technique',
    tags: ['seq', 'arp', 'reverb'], level: 1,
    blurb: 'A held chord turns into a running line of plucked notes in a spring reverb.',
    how: 'PLAY starts the arpeggiator, which plays the held keys one after another at RATE. A pluck comes from the envelope: a short decay to no sustain, so every arpeggio note is a quick ping, opened by ENV AMT. The spring reverb gives the line its splashy space.',
    phrase: { bpm: 100, loop: true, steps: [[0, 48, 7.8], [0, 55, 7.8], [0, 60, 7.8], [0, 63, 7.8], [8, 44, 7.8], [8, 51, 7.8], [8, 56, 7.8], [8, 60, 7.8]] },
    steps: [
      { title: 'A pluck', module: 'env', why: 'With no sustain, every note is a quick ping that dies away by itself, which suits fast arpeggios.\n- Oscillator 1 sawtooth at 8’ and Oscillator 2 square at 8’, FREQUENCY +0.08: two shapes at the same pitch, a hair apart, for a fuller tone.\n- Mixer 1 at 6, mixer 2 at 5.\n- ATTACK 0, DECAY 4.5 (about 170 ms), SUSTAIN 0, RELEASE 4 (80 ms): a fast pluck.\n- CUTOFF 4 (about 320 Hz), ENV AMT +3.5 (+4.3 octaves), RESONANCE 4: the envelope snaps the filter open and shut with each note.\n- Listen for: short, bright pings on each key.',
        set: { 'osc1.wave': 'saw', 'osc1.oct': '8', 'osc2.wave': 'sq', 'osc2.oct': '8', 'osc2.freq': 0.08, 'mix.1': 6, 'mix.2': 5, 'env.attack': 0, 'env.decay': 4.5, 'env.sustain': 0, 'env.release': 4, 'vcf.cutoff': 4, 'vcf.env': 3.5, 'vcf.res': 4 } },
      { title: 'Start the arpeggiator', module: 'mode', why: 'The arpeggiator plays the keys you hold one after another, at RATE, as sixteenth notes.\n- MODE ARP, PLAY on: the blue PLAY button starts it.\n- RATE 5 (98 BPM): the speed of the line.\n- DIRECTION ◀◀/▶▶: up through the held notes, then back down.\n- OCT / SEQ 2: the line climbs through two octaves before it turns round.\n- Listen for: the held chord broken into a running line. Try DIRECTION RNDM for a shuffled one.',
        set: { 'arp.mode': 'arp', 'arp.play': true, 'arp.rate': 5, 'arp.dir': 'bf', 'arp.oct': '2' } },
      { title: 'Spring reverb', module: 'fx', why: 'The reverb is an emulation of a spring, with a bright, splashy tail.\n- Reverb MIX 4.5: about half wet, so each ping leaves a tail that overlaps the next.\n- Listen for: the line sitting in a metallic, roomy space. At 8 the notes drown in it.',
        set: { 'rev.mix': 4.5 } },
    ],
    context: {
      'arp.rate': 'In this sound: the speed of the line.',
      'env.decay': 'In this sound: the length of each ping.',
      'rev.mix': 'In this sound: how much the pings overlap in the reverb.',
    },
    tweaks: [
      { id: 'arp.dir', try: 'Switch to RNDM', hear: 'The notes come in a random order.' },
      { id: 'arp.oct', try: 'Set to 3', hear: 'A longer line that climbs higher.' },
      { id: 'vcf.res', try: 'Raise to 7', hear: 'Each ping rings with a squelch.' },
    ],
  },
  {
    id: 'm15-sh-bleeps', name: 'Random Bleeps', ref: 'The sample and hold patched to the filter', artist: 'Classic technique',
    tags: ['fx', 'random', 'patched'], level: 2,
    blurb: 'A held note turns into a stream of random, ringing filter steps.',
    how: 'The sample and hold reads the noise once per LFO cycle and holds that level until the next, so it puts out a new random step at the LFO’s speed. A cable from S&H to CUTOFF moves the filter to a new place on each step, and high resonance makes every step ring.',
    phrase: { bpm: 90, loop: true, steps: [[0, 48, 7.8]] },
    steps: [
      { title: 'A bright source and a ringing filter', module: 'filter', why: 'A sawtooth gives the filter plenty to work on, and high resonance makes the filter ring wherever its cutoff lands.\n- Oscillator 1 sawtooth, mixer 1 at 7.\n- CUTOFF 4.5 (about 450 Hz): the middle of the range, so random steps can go either way.\n- RESONANCE 7.5: strong, so each new cutoff whistles.\n- ENV AMT 0: the envelope leaves the filter alone; only the cable will move it.\n- Listen for: a held, resonant tone, ready to move.',
        set: { 'osc1.wave': 'saw', 'mix.1': 7, 'vcf.cutoff': 4.5, 'vcf.res': 7.5, 'vcf.env': 0 } },
      { title: 'Random steps into the cutoff', module: 'mod', why: 'The sample and hold puts out a new random level every time the LFO goes round. Patched into CUTOFF, it moves the filter to a new random place on each step.\n- Cable S&H → CUTOFF: the S&H output into the filter’s cutoff input, which adds to the CUTOFF knob.\n- LFO RATE 4.5 (about 6 Hz): how often a new step comes.\n- Listen for: a held note turning into a string of random, computer-like tones.',
        set: { 'lfo.rate': 4.5 }, cables: [['j.sh_out', 'j.cutoff']] },
      { title: 'Held loudness and a long tail', module: 'amp', why: 'The note stays at full level while held, and the spring reverb catches the steps.\n- SUSTAIN 10, RELEASE 5 (0.2 s): full level while held, a short fade after.\n- Reverb MIX 4: the steps ring on in the spring.\n- Listen for: the bleeps carrying on into the reverb after you let go.',
        set: { 'env.sustain': 10, 'env.release': 5, 'rev.mix': 4 } },
    ],
    context: {
      'lfo.rate': 'In this sound: how often a new random step comes.',
      'vcf.res': 'In this sound: makes each step whistle. Lower it for dull ticks.',
      'vcf.cutoff': 'In this sound: the centre the random steps move round.',
    },
    tweaks: [
      { id: 'lfo.rate', try: 'Lower to 3', hear: 'Slow, deliberate steps.' },
      { id: 'vcf.res', try: 'Raise to 9', hear: 'The steps become pure whistles: the filter is playing the notes.' },
      { id: 'vcf.kbd', try: 'Set to 1:1 and play up the keyboard', hear: 'The random pattern moves with the notes.' },
    ],
  },
  {
    id: 'm15-pwm-drone', name: 'Pulse Drone', ref: 'VCA MODE ON with slow pulse-width modulation', artist: 'Classic technique',
    tags: ['drone', 'pwm', 'ambient'], level: 1,
    blurb: 'A slowly churning drone that plays with no key held.',
    how: 'VCA MODE ON holds the amplifier open, so the synth sounds with nothing played. Two square waves, a fifth apart, have their pulse width moved slowly by the LFO, which gives the churning, chorus-like movement. The spring reverb spreads it out.',
    phrase: { bpm: 60, loop: true, steps: [[0, 36, 7.8], [8, 34, 7.8]] },
    steps: [
      { title: 'Two squares, a fifth apart', module: 'osc', why: 'Two square waves a fifth apart give a hollow, organ-like drone.\n- Oscillator 1 OCTAVE 16’, WAVEFORM square.\n- Oscillator 2 OCTAVE 8’, WAVEFORM square, FREQUENCY +7: seven semitones up, a fifth, an octave higher.\n- Mixer 1 and 2 at 6: an even blend.\n- Listen for: a hollow, reedy chord from one key.',
        set: { 'osc1.oct': '16', 'osc1.wave': 'sq', 'osc2.oct': '8', 'osc2.wave': 'sq', 'osc2.freq': 7, 'mix.1': 6, 'mix.2': 6 } },
      { title: 'Move the pulse width', module: 'lfo', why: 'The LFO now moves the pulse width of both squares slowly back and forth. The tone churns and thickens, which is pulse-width modulation (PWM).\n- LFO RATE 2 (about 0.5 Hz), WAVEFORM sine: a slow, smooth sweep.\n- PULSE WIDTH 7: how far the LFO can move the width.\n- MODULATION 7: the master depth. At 0 the LFO does nothing at all, whatever the coloured knobs say.\n- Listen for: a slow, swirling movement inside the drone.',
        set: { 'lfo.rate': 2, 'lfo.wave': 'sine', 'lfo.pw': 7, 'mod.amount': 7 } },
      { title: 'Open the VCA for good', module: 'amp', why: 'VCA MODE ON leaves the amplifier open, so the drone sounds without a key held. Playing a key only sets the pitch.\n- VCA MODE ON.\n- CUTOFF 5 (about 630 Hz), RESONANCE 3, ENV AMT 0: a warm, steady filter that the envelope does not move.\n- Reverb MIX 5: the spring spreads the drone out.\n- Listen for: the drone carrying on between notes. Press a key to change its pitch.',
        set: { 'vca.mode': 'on', 'vcf.cutoff': 5, 'vcf.res': 3, 'vcf.env': 0, 'rev.mix': 5 } },
    ],
    context: {
      'vca.mode': 'In this sound: ON, which is why it never stops. Set ENV and the notes start and end with the keys.',
      'lfo.pw': 'In this sound: how much the pulse width churns.',
      'mod.amount': 'In this sound: the master depth for the churning. At 0 the drone goes still.',
    },
    tweaks: [
      { id: 'lfo.filter', try: 'Raise to 3', hear: 'The brightness rises and falls with the churning.' },
      { id: 'vcf.cutoff', try: 'Sweep slowly from 3 to 7', hear: 'The drone opens up and darkens again.' },
      { id: 'osc2.freq', try: 'Set to +5', hear: 'A fourth instead of a fifth: a different, more open chord.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'model-15', name: 'Model 15', maker: 'Behringer', year: 2022,
  heritage: 'Built on Moog modular circuits, with the layout and features of the 2018 Moog Grandmother',
  summary: 'A semi-modular mono synth: two oscillators with sync and a sub-oscillator, white or pink noise, a 24 dB ladder filter, one ADSR envelope, an LFO that reaches audio rates, a spring reverb, an arpeggiator, and 48 patch points that change the internal wiring without needing any cables to play.',
  view: { w: (1173 - OX) * K, h: (745 - OY) * K },
  theme: { panel: '#1d1d1f', panel2: '#151516', ink: INK, font: 'din', weight: 600, cheeks: 'wood', cheekW: 34, jack: 'black' },
  signalNames: {
    osc1: 'Oscillator 1', osc2: 'Oscillator 2', env1: 'the envelope', env2: 'the RELEASE-mode gate', lfo: 'the LFO',
    sh: 'the sample and hold', att1: 'the attenuator', mult: 'MULTI 1', sum1: 'MULTI 2', vcf1: 'the ladder filter',
    hp6: 'the HI PASS filter', rev: 'the reverb', master: 'the main output', mixer: 'the mixer',
  },
  destNames: { extIn: 'the mixer', revIn: 'the reverb', hp6In: 'the HI PASS filter' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
