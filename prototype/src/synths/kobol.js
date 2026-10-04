// Behringer Kobol Expander — SynthDef. Positions are pixels on the 2000×705 product image (ref/Behringer_KOBOL-EXPANDER.png),
// used directly as view units; the faceplate ends at y 625, below it is the photo's reflection. The data model is
// ref/behringer-kobol-expander.synth.json (Quick Start Guide, 66 numbered controls), which follows the RSF Kobol Expander:
// two VCOs whose single WAVEFORM knob morphs from triangle to pulse, a VCA per VCO in place of a mixer, a 24 dB low-pass
// filter, two ADS envelopes, an LFO, noise and a two-input voltage processor, with a CV input for almost every knob.
//
// The morphing waveform and the CV inputs to each VCO's waveform and level are the engine's `osc.morph` and the `wave1`,
// `wave2`, `lvl1`, `lvl2` destinations (see CONTRACT.md). One control voltage unit here is 5 V: the voltage processor's
// +10 V normal is 2 units.
import { annotate, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/kobol.js';
import unusual from '@/synths/unusual/kobol.js';
import moreSounds from '@/synths/sounds/kobol.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The envelope knobs print a time ring as well as 1–10: 10 ms at nine o'clock, .1 (s) at twelve, 1 (s) at three. That is
// one decade per 2.7 knob units, which gives about 2 ms at 1 and 4.6 s at 10. The guide itself gives no times.
const envTime = (v) => 0.1 * Math.pow(10, (v - 5.5) / 2.7);
const lfoHz = (v) => 0.01 * Math.pow(10, v * 0.4); // 0.01 Hz to 100 Hz, as printed
const vcfHz = (v) => expMap(v / 10, 16, 16000); // 16 Hz to 16 kHz, as printed
/** VCO FREQUENCY: 440 Hz at the centre, 10 Hz to 10 kHz across the knob, so one knob unit is about an octave. */
const vcoSemi = (v) => (v - 5) * 12;
const oscLevel = (v) => Math.pow(v / 10, 1.5) * 0.75;
const pwmDepth = 0.25;
/** Where WAVEFORM is on its morph, in words (the knob is continuous; the panel prints seven glyphs round it). */
const waveName = (v) => (v < 0.8 ? 'triangle' : v < 4.2 ? 'ramp' : v < 5.8 ? 'sawtooth' : v < 6.4 ? 'saw/square' : v < 7 ? 'square' : v < 9.5 ? 'pulse' : 'pulse + PWM');

const controls = [];
const decor = [];
const jacks = [];
const INK = '#efeee8';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x, y, t, size = 14, rest = {}) => decor.push({ t: 'text', x, y: y + size * 0.35, text: t, size, anchor: 'middle', weight: 700, ...rest });
const path = (d, w = 1.8) => decor.push({ t: 'path', d, w });
const head = (x, y, dir) => {
  const s = 5;
  const pts = { r: `M${x} ${y} L${x - s * 1.6} ${y - s} L${x - s * 1.6} ${y + s} Z`, l: `M${x} ${y} L${x + s * 1.6} ${y - s} L${x + s * 1.6} ${y + s} Z`,
    u: `M${x} ${y} L${x - s} ${y + s * 1.6} L${x + s} ${y + s * 1.6} Z`, d: `M${x} ${y} L${x - s} ${y - s * 1.6} L${x + s} ${y - s * 1.6} Z` }[dir];
  decor.push({ t: 'path', d: pts, w: 0, fill: INK });
};
/** A block of the printed signal-flow diagram: a box with its name and a two-line description. */
const box = (x, y, w, h, title, sub, tsize = 17) => {
  decor.push({ t: 'rect', x, y, w, h, r: 0, stroke: INK, sw: 2 });
  text(x + w / 2, y + 15, title, tsize);
  sub.split('\n').forEach((line, i) => text(x + w / 2, y + 31 + i * 12, line, 10, { weight: 600 }));
};
const knob = (id, x, y, rest) => controls.push({ id, type: 'knob', x, y, r: 33, style: 'kobol', kind: 'cont', min: 0, max: 10, def: 5, labelPos: 'none', ...rest });
const slide = (id, x, y, rest) => controls.push({ id, type: 'slide', x, y, w: 52, h: 20, orient: 'h', labelPos: 'none', ...rest });
const S10 = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 0, size: 13, numR: 1.62 };
const BIPOLAR = { labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({ at, text: String(Math.abs(at)) })), ticks: 0, size: 13, numR: 1.62 };
const ENV_SCALE = {
  ticks: 0, size: 13, numR: 1.62,
  labels: [{ at: 1, text: '1' }, { at: 2.8, text: '10' }, { at: 5.5, text: '.1' }, { at: 8.2, text: '1' }, { at: 10, text: '10' }],
};
const polar = (cx, cy, r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[[78, 22], [557, 22], [1442, 20], [1920, 20], [78, 600], [557, 600], [1442, 598], [1920, 596]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 10 }));
decor.push({ t: 'logo', x: 1155, y: 139, size: 22, text: 'behringer', style: 'behringer' });
text(1857, 168, 'kobol', 64, { weight: 700 });
text(1857, 205, 'EXPANDER', 18);
decor.push({ t: 'led', x: 1857, y: 235, r: 7, color: 'green', litWhen: 'power' });
decor.push({ t: 'din', x: 1857, y: 95, r: 37 });
text(1857, 39, 'MIDI IN');

// the blocks of the printed diagram
box(178, 250, 85, 51, 'LFO', 'Low frequency\noscillator');
box(178, 324, 85, 52, 'VOLTAGE', '', 12);
text(220.5, 358, 'PROCESSOR', 12);
box(334, 324, 85, 52, 'NOISE', '', 12);
text(376.5, 358, 'GENERATOR', 12);
box(638, 250, 100, 51, 'VCO 1', 'Voltage controlled\noscillator');
box(638, 324, 100, 52, 'VCO 2', 'Voltage controlled\noscillator');
box(872, 250, 100, 51, 'VCA', 'Voltage controlled\namplifier');
box(872, 324, 100, 52, 'VCA', 'Voltage controlled\namplifier');
box(1089, 287, 133, 52, 'VCF', 'Voltage controlled filter\n24 dB/oct');
box(1350, 250, 80, 51, 'ADS 1', 'Envelope\ngenerator');
box(1350, 324, 80, 52, 'ADS 2', 'Envelope\ngenerator');
box(1573, 286, 101, 53, 'VCA', 'Voltage controlled\namplifier');

// the signal-flow lines between them
path('M263 267 H325 L376 216 V102'); // LFO → OUT 2
path('M298 267 V252'); head(298, 250, 'u'); // LFO → VOLUME
path('M298 112 V104 H436'); head(440, 104, 'r'); // VOLUME → OUT 1 and VCO MOD IN
path('M468 96 L532 150 V260'); head(532, 262, 'd'); // mod bus → VCO 1 MOD switch
path('M567 275 H632'); head(636, 275, 'r');
path('M532 290 V332 H632'); head(636, 332, 'r');
path('M567 350 H600 V358 H632'); head(636, 358, 'r'); // sync
path('M738 275 H866'); head(870, 275, 'r');
path('M738 350 H866'); head(870, 350, 'r');
path('M788 313 H760 L744 294'); // PWM source → the VCOs
path('M972 275 H1010 L1045 300 H1083'); head(1087, 300, 'r');
path('M972 350 H1010 L1045 318 H1083'); head(1087, 318, 'r');
path('M988 102 V275'); // VCO 1 OUT taps VCO 1
path('M988 350 V522'); // VCO 2 OUT
path('M1039 522 V372 L1060 330 H1083'); // VCF AUDIO IN
path('M1116 522 L1080 492 V478'); // CV IN → keyboard tracking
path('M1092 368 L1112 341'); path('M1212 368 L1192 341'); // KEYB CTRL and ADS CONTROL → VCF
path('M1234 470 V505 H1311'); // ADS 2 → ADS CONTROL
path('M1222 313 H1567'); head(1571, 313, 'r');
path('M1311 102 V244 L1346 262'); path('M1311 244 V300 L1346 338'); // GATE IN → both envelopes
path('M1350 350 H1311 V518'); head(1311, 522, 'd'); // ADS 2 → ADS 2 OUT
path('M1430 267 H1742 L1779 230 V104'); path('M1624 267 V280'); head(1624, 284, 'd'); // ADS 1 → ADS 1 OUT, VCA
path('M1674 313 H1812'); head(1816, 313, 'r');
path('M1898 313 H1935 V408 L1888 436'); path('M1935 408 V505 L1888 532'); // VOLUME → PHONES, AUDIO OUT
path('M142 400 V344 H174'); head(176, 344, 'r'); // IN 1 GAIN → voltage processor
path('M162 546 H206 V449 L182 412 V360 H174');
path('M263 350 H276 L375 408 V496 L352 530'); path('M360 546 H393'); // → OUT and REV OUT
path('M419 350 H430 L492 392 V522'); // noise → NOISE OUT
text(92, 524, '+10V', 13, { anchor: 'middle' });
path('M110 524 L122 534', 1.6);

// ── LFO ───────────────────────────────────────────────────────────────────
knob('lfo.rate', 142, 172, {
  def: 5, name: 'LFO rate', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  scale: { ticks: 0, size: 13, numR: 1.72, labels: [{ at: 0, text: '0.01' }, { at: 2.5, text: '0.1' }, { at: 5, text: '1' }, { at: 7.5, text: '10' }, { at: 10, text: '100Hz' }] },
  help: 'Speed of the LFO, from one cycle every 100 seconds to 100 Hz. The red lamp beside it flashes at this rate.',
});
text(142, 243, 'RATE', 15);
decor.push({ t: 'led', x: 220, y: 225, r: 7, color: 'red', litWhen: 'lfo' });
knob('lfo.volume', 298, 176, {
  def: 0, name: 'LFO volume', module: 'lfo', scale: S10, fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How much LFO reaches the oscillators’ pitch, and the level of LFO OUT 1. It also sets the depth of LFO pulse-width modulation. At 0 the LFO still runs, and LFO OUT 2 still carries it at full level.',
});
text(298, 243, 'VOLUME', 15);
text(352, 297, 'White', 12);
text(403, 297, 'Pink', 12);
controls.push({
  id: 'lfo.shape', type: 'slide', x: 455, y: 313, w: 20, h: 52, orient: 'v', kind: 'enum', labelPos: 'none',
  options: [{ v: 'sq', label: 'Square' }, { v: 'tri', label: 'Triangle' }], def: 'tri', name: 'LFO waveform', module: 'lfo',
  help: 'The LFO’s shape. Triangle rises and falls smoothly, for vibrato and sweeps; square jumps between two values, for trills.',
});
decor.push({ t: 'wave', x: 455, y: 276, size: 11, shape: 'sq' }, { t: 'wave', x: 455, y: 352, size: 11, shape: 'tri' });
text(488, 313, 'LFO', 14);

// ── Noise and voltage processor ───────────────────────────────────────────
slide('noise.colour', 376, 275, {
  kind: 'enum', options: [{ v: 'white', label: 'White' }, { v: 'pink', label: 'Pink' }], def: 'white', name: 'Noise colour', module: 'osc',
  help: 'White noise is bright and hissy; pink has less top end and sounds deeper, like wind or surf. The noise only reaches the sound through a cable from NOISE OUT.',
});
knob('vp.in1', 142, 449, {
  min: 0, max: 2, def: 1, name: 'IN 1 gain', module: 'util', fmt: (v) => `× ${v.toFixed(2)}`,
  scale: { ticks: 0, size: 13, numR: 1.62, labels: [{ at: 0, text: '0' }, { at: 0.5, text: '0.5' }, { at: 1, text: '1' }, { at: 2, text: '2' }] },
  help: 'Scales the voltage processor’s input 1. With nothing plugged into IN 1 that input is a steady +10 V, so this knob sets a fixed voltage: a manual control you can patch anywhere.',
});
text(142, 519, 'IN 1 GAIN', 15);
knob('vp.out', 298, 449, {
  min: 0, max: 2, def: 1, name: 'OUT gain', module: 'util', fmt: (v) => `× ${v.toFixed(2)}`,
  scale: { ticks: 0, size: 13, numR: 1.62, labels: [{ at: 0, text: '0' }, { at: 0.5, text: '0.5' }, { at: 1, text: '1' }, { at: 2, text: '2' }] },
  help: 'Scales the voltage processor’s output: the sum of input 1 (through IN 1 GAIN) and twice input 2. OUT carries it as it is and REV OUT upside down.',
});
text(298, 519, 'OUT GAIN', 15);

// ── Pitch and modulation routing ──────────────────────────────────────────
knob('pitch.tune', 455, 176, {
  min: -5, max: 5, def: 0, name: 'Master tune', module: 'osc', scale: BIPOLAR, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  help: 'Tunes both oscillators together, up to half a semitone either way.',
});
text(455, 243, 'TUNE', 15);
slide('mod.vco1Off', 532, 275, {
  kind: 'bool', def: false, onAt: 'bottom', name: 'VCO 1 MOD OFF', module: 'mod',
  help: 'Left: the LFO (or whatever is in VCO MOD IN) moves the pitch of both VCOs. Right: VCO 1 is left out, so only VCO 2 wobbles.',
});
text(532, 297, 'Vco 1 Mod   Off', 12);
slide('vco2.sync', 532, 350, {
  kind: 'bool', def: false, onAt: 'bottom', name: 'Synchro / VCO 1', module: 'osc',
  help: 'Hard sync: VCO 2 restarts each time VCO 1 does. VCO 2’s FREQUENCY then changes its tone rather than its note, from a hollow buzz to a tearing snarl.',
});
text(532, 372, 'Synchro/Vco 1', 12);
slide('mod.pwm', 814, 313, {
  kind: 'enum', options: [{ v: 'lfo', label: 'LFO' }, { v: 'both', label: 'Both' }, { v: 'ads', label: 'ADS' }], def: 'lfo', name: 'PWM source', module: 'mod',
  help: 'What moves the pulse width of both VCOs when their WAVEFORM knobs are at the pulse end: the LFO (at LFO VOLUME’s level), ADS 2 (the filter envelope), or both.',
});
text(814, 291, 'Both', 12);
text(787, 335, 'LFO', 12);
text(841, 335, 'ADS', 12);

// ── VCO 1 and VCO 2, each with its VCA ────────────────────────────────────
const WAVE_GLYPHS = [['tri', -150], ['tri', -100], ['shark', -52], ['saw', 0], ['sq', 52], ['pulse', 100], ['npulse', 150]];
[1, 2].forEach((n) => {
  const y = n === 1 ? 174 : 449;
  const ly = n === 1 ? 234 : 510;
  knob(`vco${n}.freq`, 610, y, {
    def: 5, name: `VCO ${n} frequency`, module: 'osc', fmt: (v) => fmtSemi(vcoSemi(v)),
    scale: { ticks: 11, size: 13, numR: 1.72, labels: [{ at: 0, text: '10Hz' }, { at: 5, text: '440Hz' }, { at: 10, text: '10kHz' }] },
    help: `Tunes VCO ${n}. The knob is continuous and very wide: each step on the scale is about an octave, with 440 Hz (the note played) at the centre. Set octaves and fifths by ear, or against the other VCO.`,
  });
  text(610, ly + 9, 'FREQUENCY', 15);
  knob(`vco${n}.wave`, 766, y, {
    def: 5, name: `VCO ${n} waveform`, module: 'osc', fmt: waveName, scale: { ticks: 7, size: 13 },
    help: `VCO ${n}’s shape, turned smoothly from one to the next: triangle (soft), a lopsided ramp, sawtooth (bright and buzzy), square (hollow), then a pulse that narrows. At the far right the pulse width is moved by the PWM source switch.`,
  });
  WAVE_GLYPHS.forEach(([shape, a]) => {
    const [gx, gy] = polar(766, y, 56, a);
    decor.push({ t: 'wave', x: gx, y: gy, size: 10, shape });
  });
  text(766, ly + 9, 'WAVEFORM', 15);
  knob(`vca${n}.level`, 921, y, {
    def: n === 1 ? 8 : 0, name: `VCO ${n} volume`, module: 'mixer', scale: S10,
    help: `Level of VCO ${n} into the filter, set by its own VCA. There is no mixer: these two VOLUME knobs are the mix. Each has a CV input, so the mix can be moved by an envelope or the LFO.`,
  });
  text(921, ly + 9, 'VOLUME', 15);
});
knob('vco2.beat', 455, 449, {
  min: -5, max: 5, def: 0, name: 'VCO 2 beat', module: 'osc', scale: BIPOLAR, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  help: 'Fine tuning of VCO 2 against VCO 1, up to half a semitone either way. A small offset makes the two beat slowly, which thickens the sound.',
});
text(455, 519, 'VCO 2 BEAT', 15);

// ── VCF ───────────────────────────────────────────────────────────────────
knob('vcf.freq', 1077, 208, {
  def: 7, name: 'VCF frequency', module: 'filter', fmt: (v) => fmtHz(vcfHz(v)),
  scale: { ticks: 11, size: 13, numR: 1.7, labels: [{ at: 0, text: '16Hz' }, { at: 10, text: '16kHz' }] },
  help: 'Cutoff of the 24 dB low-pass filter. Turn it left and the sound gets darker until only a dull thud is left; turn it right and the full buzz of the oscillators comes through.',
});
text(1077, 278, 'VCF FREQ', 15);
knob('vcf.res', 1234, 206, {
  def: 0, name: 'Resonance', module: 'filter',
  scale: { ticks: 0, size: 13, numR: 1.62, labels: [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((at) => ({ at, text: String(at) })), { at: 10, text: '10 OSC' }] },
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near 10 (marked OSC) the filter whistles on its own as a sine wave.',
});
text(1234, 278, 'RESONANCE', 15);
decor.push({ t: 'led', x: 1294, y: 295, r: 7, color: 'red', litWhen: 'gate' });
text(1282, 295, 'Gate', 12, { anchor: 'end' });
knob('vcf.kbd', 1077, 418, {
  min: 0, max: 2, def: 1, name: 'Keyboard control', module: 'filter', fmt: (v) => `${Math.round(v * 100)} %`,
  scale: { ticks: 0, size: 13, numR: 1.62, labels: [{ at: 0, text: '0' }, { at: 1, text: '1' }, { at: 2, text: '2V/OC' }] },
  help: 'How far the cutoff follows the notes played. At 1 it follows them exactly, so every note has the same brightness; at 0 high notes sound duller; at 2 it moves twice as far.',
});
text(1077, 484, 'KEYB CTRL', 15);
knob('vcf.env', 1234, 407, {
  min: -5, max: 5, def: 0, name: 'ADS control', module: 'filter', scale: BIPOLAR,
  fmt: (v) => (Math.abs(v) < 0.05 ? 'off' : `${v > 0 ? '+' : '−'}${(Math.abs(v) * 1.4).toFixed(1)} oct`),
  help: 'How far ADS 2 sweeps the cutoff on each note. Right of centre it opens the filter; left of centre it closes it. At the centre the envelope does nothing to the filter.',
});
text(1234, 484, 'ADS CONTROL', 15);

// ── ADS 1 (loudness) and ADS 2 (filter) ───────────────────────────────────
const envKnobs = (n, y, ly) => {
  const who = n === 1 ? 'the loudness' : 'the filter';
  knob(`ads${n}.attack`, 1390, y, {
    min: 1, max: 10, def: 1, name: `ADS ${n} attack`, module: n === 1 ? 'amp' : 'env', scale: ENV_SCALE, fmt: (v) => fmtTime(envTime(v)),
    help: `How long ${who} envelope takes to rise when a note starts. Short for plucks and basses, long for swells.`,
  });
  text(1390, ly + 9, 'ATTACK', 15);
  knob(`ads${n}.decay`, 1545, y, {
    min: 1, max: 10, def: 5, name: `ADS ${n} decay`, module: n === 1 ? 'amp' : 'env', scale: ENV_SCALE, fmt: (v) => fmtTime(envTime(v)),
    help: `How long ${who} envelope takes to fall to the sustain level, and to die away after the key is released: there is no separate release knob.`,
  });
  text(1545, ly + 9, 'DECAY', 15);
  knob(`ads${n}.sustain`, 1701, y, {
    def: n === 1 ? 10 : 5, name: `ADS ${n} sustain`, module: n === 1 ? 'amp' : 'env', scale: S10,
    help: n === 1 ? 'Volume while a key is held. At 10 the note holds at full level; at 0 it dies away even if you keep holding.'
      : 'Where the filter settles while a key is held, as a share of the ADS CONTROL sweep.',
  });
  text(1701, ly + 9, 'SUSTAIN', 15);
};
envKnobs(1, 174, 234);
envKnobs(2, 449, 510);
slide('ads1.decayOff', 1624, 366, {
  kind: 'bool', def: false, onAt: 'bottom', name: 'Decay off', module: 'amp',
  help: 'Sets ADS 1’s decay and release to zero, so notes stop dead on release like an organ. With SUSTAIN low they become short clicks.',
});
text(1624, 388, 'Decay Off', 12);

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1857, 315, {
  def: 7, name: 'Volume', module: 'out', scale: S10,
  help: 'Overall output level, to AUDIO OUT and the headphones.',
});
text(1857, 378, 'VOLUME', 15);

// ── Jacks ─────────────────────────────────────────────────────────────────
// Top row inputs print ▼ under the name, outputs ▲; the bottom row prints them above.
const jack = (id, x, y, label, dir, rest) => {
  const top = y < 300;
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir, ...rest });
  label.split('\n').forEach((line, i) => text(x, (top ? 39 : 587) + i * 15, line, 14));
  decor.push({ t: 'arrow', x, y: top ? 53 : 573, dir: dir === 'in' ? 'down' : 'up', size: 4 });
};
const lvlAmt = 0.75;
jack('j.lfoRate', 142, 78, 'LFO RATE', 'in', { dest: 'lfoRate', amt: 4, add: true, help: 'Voltage control of the LFO’s speed, added to the RATE knob. Patch an envelope here and the wobble speeds up at the start of each note.' });
jack('j.lfoOut1', 298, 78, 'LFO OUT 1', 'out', { name: 'LFO OUT 1 (scaled)', signal: 'att1', help: 'The LFO at the level set by its VOLUME knob. This is the same signal that moves the VCOs.' });
jack('j.lfoOut2', 376, 78, 'LFO OUT 2', 'out', { name: 'LFO OUT 2 (full level)', signal: 'lfo', help: 'The LFO at full level, whatever VOLUME is set to.' });
jack('j.vcoModIn', 454, 78, 'VCO\nMOD IN', 'in', {
  dest: 'multIn', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the LFO’s place as the pitch modulation of ${v['mod.vco1Off'] ? 'VCO 2 only (VCO 1 MOD OFF is on)' : 'both VCOs'}, up to an octave either way at full strength. The LFO no longer moves the pitch, but it still drives LFO OUT 1, LFO OUT 2 and pulse-width modulation.`,
  help: 'Replaces the LFO as the pitch modulation of both VCOs (or VCO 2 alone, with VCO 1 MOD OFF). Plugging anything in here stops the LFO’s vibrato.',
});
jack('j.vco1Freq', 610, 78, 'VCO 1 FREQ', 'in', { dest: 'pitch1', amt: 12, add: true, help: 'Voltage control of VCO 1’s pitch, added to its FREQUENCY knob.' });
jack('j.vco1Wave', 766, 78, 'VCO 1 WAVEFORM', 'in', { dest: 'wave1', amt: 0.5, add: true, help: 'Voltage control of VCO 1’s WAVEFORM: the shape moves along the knob’s path from triangle to pulse. An LFO here gives a sweeping, filter-like movement to one oscillator only.' });
jack('j.vco1Vol', 883, 78, 'VOLUME', 'in', {
  name: 'VCO 1 VOLUME', dest: 'lvl1', amt: lvlAmt, add: true,
  help: 'Voltage control of VCO 1’s VCA, added to its VOLUME knob. Patch an envelope here with VOLUME at 0 and VCO 1 has its own loudness shape.',
});
jack('j.vco1Out', 961, 78, 'VCO 1 OUT', 'out', { signal: 'osc1', help: 'VCO 1 on its own, before its VCA. Taking it out here does not stop it reaching the filter.' });
jack('j.vcfFreq', 1077, 78, 'VCF FREQUENCY', 'in', { dest: 'cutoff', amt: 5, add: true, help: 'Voltage control of the filter cutoff, added to the VCF FREQ knob.' });
jack('j.res', 1233, 78, 'RESONANCE', 'in', { dest: 'res', amt: 1, add: true, help: 'Voltage control of resonance, added to the RESONANCE knob.' });
jack('j.gateIn', 1311, 78, 'GATE IN', 'in', { dest: 'gateIn', amt: 1, help: 'An outside gate for both envelopes, in place of the notes played. Patch LFO OUT 2 with the square LFO here and the envelopes fire on their own, in time with the LFO.' });
jack('j.ads1Attack', 1390, 78, 'ATTACK', 'in', { name: 'ADS 1 ATTACK', signal: null, dest: null, help: 'Voltage control of ADS 1’s attack time. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads1Decay', 1545, 78, 'DECAY', 'in', { name: 'ADS 1 DECAY', signal: null, dest: null, help: 'Voltage control of ADS 1’s decay and release time. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads1Sustain', 1701, 78, 'SUSTAIN', 'in', { name: 'ADS 1 SUSTAIN', signal: null, dest: null, help: 'Voltage control of ADS 1’s sustain level. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads1Out', 1779, 78, 'ADS 1 OUT', 'out', { signal: 'env1', help: 'ADS 1, the loudness envelope, as a voltage.' });

jack('j.vpIn1', 142, 546, 'IN 1', 'in', {
  dest: 'sum1A', amt: (v) => v['vp.in1'] * v['vp.out'],
  help: 'Voltage processor input 1, scaled by IN 1 GAIN. With nothing plugged in it carries a steady +10 V; a cable replaces that.',
});
jack('j.vpIn2', 259, 546, 'IN 2', 'in', { dest: 'sum1B', amt: (v) => 2 * v['vp.out'], help: 'Voltage processor input 2, at a fixed gain of 2, added to input 1.' });
jack('j.vpOut', 338, 546, 'OUT', 'out', { name: 'Voltage processor OUT', signal: 'sum1', help: 'The voltage processor’s output: input 1 plus input 2, scaled by OUT GAIN. With nothing patched in, a steady positive voltage.' });
jack('j.vpRev', 415, 546, 'REV OUT', 'out', { signal: 'invert', help: 'The voltage processor’s output upside down. With nothing patched in, a steady negative voltage.' });
jack('j.noise', 492, 546, 'NOISE OUT', 'out', { signal: 'noise', help: 'The noise generator. It is not wired into the sound: patch it to VCF AUDIO IN for hiss and breath, or to a CV input for random movement.' });
jack('j.vco2Freq', 610, 546, 'VCO 2 FREQ', 'in', { dest: 'pitch2', amt: 12, add: true, help: 'Voltage control of VCO 2’s pitch, added to its FREQUENCY knob.' });
jack('j.vco2Wave', 766, 546, 'VCO 2 WAVEFORM', 'in', { dest: 'wave2', amt: 0.5, add: true, help: 'Voltage control of VCO 2’s WAVEFORM: the shape moves along the knob’s path from triangle to pulse.' });
jack('j.vco2Vol', 883, 546, 'VOLUME', 'in', {
  name: 'VCO 2 VOLUME', dest: 'lvl2', amt: lvlAmt, add: true,
  help: 'Voltage control of VCO 2’s VCA, added to its VOLUME knob. Patch an envelope here with VOLUME at 0 and VCO 2 has its own loudness shape.',
});
jack('j.vco2Out', 961, 546, 'VCO 2 OUT', 'out', { signal: 'osc2', help: 'VCO 2 on its own. Unlike VCO 1 OUT, a cable here takes VCO 2 out of the filter’s input, so it only goes where you patch it.' });
jack('j.vcfIn', 1039, 546, 'VCF\nAUDIO IN', 'in', {
  dest: 'extIn', amt: 1, add: true,
  help: 'Audio into the filter, alongside the two VCOs. Patch VCO 2 OUT here to take VCO 2 round its VCA, or NOISE OUT for breath.',
});
jack('j.cvIn', 1116, 546, 'CV IN\n1V/OCT', 'in', { dest: 'pitchAll', amt: 60, add: true, help: 'Pitch control voltage for both VCOs and the filter tracking, 1 V per octave, added to the notes played.' });
jack('j.adsCtrl', 1233, 546, 'ADS CTRL', 'in', { signal: null, dest: null, help: 'Voltage control of the ADS CONTROL depth. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads2Out', 1311, 546, 'ADS 2 OUT', 'out', { signal: 'env2', help: 'ADS 2, the filter envelope, as a voltage. Patch it to a VCO’s WAVEFORM or VOLUME input and that oscillator follows the filter’s shape.' });
jack('j.ads2Attack', 1390, 546, 'ATTACK', 'in', { name: 'ADS 2 ATTACK', signal: null, dest: null, help: 'Voltage control of ADS 2’s attack time. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads2Decay', 1545, 546, 'DECAY', 'in', { name: 'ADS 2 DECAY', signal: null, dest: null, help: 'Voltage control of ADS 2’s decay and release time. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.ads2Sustain', 1701, 546, 'SUSTAIN', 'in', { name: 'ADS 2 SUSTAIN', signal: null, dest: null, help: 'Voltage control of ADS 2’s sustain level. Not modelled in this app: a cable can be drawn but does nothing.' });
jack('j.audioOut', 1857, 546, 'AUDIO OUT', 'out', { signal: 'out', help: 'The main audio output.' });
jacks.push({ id: 'j.phones', x: 1857, y: 450, r: 17, label: 'PHONES', labelPos: 'none', dir: 'out', signal: 'out', help: 'Headphone output.' });
text(1857, 482, 'PHONES', 14);

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const areas = [
  { id: 'lfo', label: 'LFO', module: 'lfo', keywords: 'vibrato wobble trill rate',
    rects: [R(38, 0, 420, 250), R(420, 280, 505, 370)],
    help: 'One LFO, triangle or square, from 0.01 to 100 Hz. VOLUME sets how much of it reaches the pitch of the VCOs and LFO OUT 1; LFO OUT 2 is always at full level. It also drives pulse-width modulation when the PWM switch is on LFO or Both.' },
  { id: 'noise', label: 'Noise generator', module: 'osc', keywords: 'white pink hiss breath',
    rects: [R(320, 250, 420, 392), R(462, 500, 522, 625)],
    help: 'White or pink noise. It has no level knob and is not wired into the sound: patch NOISE OUT to VCF AUDIO IN to hear it, or to a CV input for random movement.' },
  { id: 'vp', label: 'Voltage processor', module: 'util', keywords: 'offset attenuator inverter mixer cv utility +10v',
    rects: [R(38, 250, 320, 392), R(38, 392, 420, 625)],
    help: 'Adds two control voltages and scales the result. IN 1 carries +10 V until something is plugged in, so with no cables OUT is a fixed positive voltage set by IN 1 GAIN and OUT GAIN, and REV OUT the same voltage negative: a manual control for any CV input.' },
  { id: 'modbus', label: 'Tune and VCO modulation', module: 'mod', keywords: 'tune pitch vibrato mod bus',
    rects: [R(420, 0, 580, 280)],
    help: 'TUNE moves both VCOs together. The LFO, at the level set by its VOLUME knob, is wired to the pitch of both VCOs; VCO MOD IN replaces it with whatever you patch in, and VCO 1 MOD OFF leaves VCO 1 out so only VCO 2 moves.' },
  { id: 'vco1', label: 'VCO 1', module: 'osc', keywords: 'oscillator pitch waveform morph triangle sawtooth square pulse',
    rects: [R(580, 0, 840, 295)],
    help: 'The first oscillator. FREQUENCY tunes it over the whole audio range, about an octave per step, and WAVEFORM turns its shape smoothly from triangle through ramp and sawtooth to square and a narrowing pulse. Both have CV inputs above them.' },
  { id: 'pwm', label: 'PWM source', module: 'mod', keywords: 'pulse width modulation pwm',
    rects: [R(760, 295, 840, 340)],
    help: 'Chooses what moves the pulse width of both VCOs: the LFO, ADS 2, or both. It is only heard with a WAVEFORM knob at the pulse end of its travel.' },
  { id: 'vco2', label: 'VCO 2', module: 'osc', keywords: 'oscillator pitch waveform morph sync beat detune',
    rects: [R(580, 340, 840, 625), R(580, 295, 760, 340), R(505, 295, 580, 370), R(420, 370, 580, 500)],
    help: 'The second oscillator, the same as VCO 1, plus VCO 2 BEAT to detune it finely against VCO 1 and SYNCHRO to hard-sync it to VCO 1.' },
  { id: 'vcas', label: 'VCO levels (VCAs)', module: 'mixer', keywords: 'mixer volume level balance vca crossfade',
    rects: [R(840, 0, 1010, 625)],
    help: 'In place of a mixer each VCO has its own VCA. The VOLUME knobs set each VCO’s level into the filter, and the VOLUME inputs let a voltage move them, so an envelope or the LFO can crossfade the two. VCO 1 OUT and VCO 2 OUT carry each oscillator on its own.' },
  { id: 'vcf', label: 'VCF (filter)', module: 'filter', keywords: 'cutoff resonance brightness low-pass tracking envelope amount self-oscillation',
    rects: [R(1010, 0, 1275, 625)],
    help: 'A 24 dB low-pass filter. VCF FREQ sets the cutoff and RESONANCE the peak at it, up to self-oscillation. KEYB CTRL sets how far the cutoff follows the notes, and ADS CONTROL how far ADS 2 sweeps it, opening or closing. VCF AUDIO IN adds any other audio to the filter’s input.' },
  { id: 'ads1', label: 'ADS 1 and the output VCA', module: 'amp', keywords: 'loudness envelope attack decay sustain release gate organ',
    rects: [R(1275, 0, 1820, 312), R(1575, 312, 1820, 392)],
    help: 'The loudness envelope. ATTACK is the fade-in and DECAY the fall to the SUSTAIN level; DECAY is also the release time, as there is no release knob. DECAY OFF makes notes stop dead. GATE IN fires both envelopes from outside.' },
  { id: 'ads2', label: 'ADS 2 (filter envelope)', module: 'env', keywords: 'filter envelope contour attack decay sustain',
    rects: [R(1275, 392, 1820, 625), R(1275, 312, 1575, 392)],
    help: 'The filter envelope, with the same ATTACK, DECAY and SUSTAIN as ADS 1. ADS CONTROL sets how far it moves the cutoff, and the PWM switch can send it to the pulse width too. ADS 2 OUT carries it to any other input.' },
  { id: 'output', label: 'Output and MIDI', module: 'out', keywords: 'volume headphones phones midi',
    rects: [R(1820, 0, 1962, 625)],
    help: 'MIDI IN is how the hardware is played; here the on-screen keyboard plays it. VOLUME sets the level at AUDIO OUT and the headphone socket.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v, ctx) {
  const patched = ctx.patched || {};
  const osc = [1, 2].map((n) => ({
    level: n === 2 && patched['j.vco2Out'] ? 0 : v[`vca${n}.level`] > 0 ? oscLevel(v[`vca${n}.level`]) : 0,
    morph: v[`vco${n}.wave`] / 10,
    pw: 0.5,
    semi: vcoSemi(v[`vco${n}.freq`]) + (n === 2 ? v['vco2.beat'] * 0.1 : 0),
    kbd: true, fixedNote: 60, syncTo: n === 2 && v['vco2.sync'] ? 0 : -1,
  }));
  const lfoGain = Math.pow(v['lfo.volume'] / 10, 2);
  const routes = [];
  // the mod bus (the scaled LFO, or VCO MOD IN) to pitch: one unit of signal is an octave
  if (!v['mod.vco1Off']) routes.push({ src: 'mult', dst: 'pitch1', amt: 12 });
  routes.push({ src: 'mult', dst: 'pitch2', amt: 12 });
  const pwm = v['mod.pwm'];
  if (pwm !== 'ads' && lfoGain > 0) ['pw1', 'pw2'].forEach((dst) => routes.push({ src: 'att1', dst, amt: pwmDepth }));
  if (pwm !== 'lfo') ['pw1', 'pw2'].forEach((dst) => routes.push({ src: 'env2', dst, amt: pwmDepth }));
  const d1 = v['ads1.decayOff'] ? 0.003 : envTime(v['ads1.decay']);
  const d2 = envTime(v['ads2.decay']);
  const vpOut = v['vp.out'];
  return {
    osc,
    noise: { level: 0, color: v['noise.colour'] },
    ext: { level: 1 },
    filter: {
      type: 'ladder', mode: 'lp', cutoff: vcfHz(v['vcf.freq']), res: (v['vcf.res'] / 10) * 1.1,
      envAmt: v['vcf.env'] * 1.4, envSrc: 'env2', kbd: v['vcf.kbd'],
    },
    env1: { a: envTime(v['ads1.attack']), d: d1, s: v['ads1.sustain'] / 10, r: d1 },
    env2: { a: envTime(v['ads2.attack']), d: d2, s: v['ads2.sustain'] / 10, r: d2 },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 }, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: { att1In: 'lfo', multIn: 'att1', gateIn: 'gate', sum1A: ['one', 2 * v['vp.in1'] * vpOut], invertIn: 'sum1' },
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [lfoGain, 1],
    tune: v['pitch.tune'] * 0.1,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'kobol-brass', name: 'Morphing Brass', ref: 'In the style of late-70s French synth pop', artist: 'Classic technique',
    tags: ['brass', 'lead', '70s'], level: 1,
    blurb: 'A warm brass lead that blooms open at the start of each note.',
    how: 'Two oscillators set between sawtooth and ramp give the buzzy harmonics brass needs, with VCO 2 beating slightly against VCO 1. The filter sits fairly low and ADS 2 opens it with a slowish attack, which copies the way a brass player’s tone brightens as they blow harder.',
    phrase: { bpm: 84, loop: true, steps: [[0, 60, 1.5], [1.5, 67, 0.5], [2, 65, 1], [3, 63, 0.9], [4, 60, 2.8]] },
    steps: [
      { title: 'Two buzzy oscillators', module: 'osc', why: 'The two VCOs (voltage-controlled oscillators, the parts that make the raw tone) are set up like two brass players. On the Kobol one WAVEFORM knob per oscillator turns the shape smoothly from triangle to pulse, in place of a switch.\n- WAVEFORM 4.6 on both: just short of the sawtooth point at 5, still on the ramp side. Plenty of buzzy harmonics for brass, a little softer than a full saw. Turn towards 0 for a softer horn.\n- VOLUME 7 and 6.5: there is no mixer. Each VCO has its own VCA (voltage-controlled amplifier), and these knobs set how much of each reaches the filter.\n- VCO 2 BEAT 1.2 (+12 cents): fine-tunes VCO 2 against VCO 1, so the two drift in and out of phase.\n- Listen for: a slow beating on a held note, like two players not quite together. Set BEAT back to 0 and it becomes one flat, static tone.',
        set: { 'vco1.wave': 4.6, 'vco2.wave': 4.6, 'vca1.level': 7, 'vca2.level': 6.5, 'vco2.beat': 1.2 } },
      { title: 'A darker filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a 24 dB low-pass: it keeps the lows and cuts the highs steeply. Setting it low gives a mellow resting tone for the envelope to open in the next step.\n- VCF FREQ 4.3 (312 Hz): the cutoff, well down from the starting 2 kHz. Most of the buzz is gone and the note sounds muffled and round. Left is darker, right brighter.\n- RESONANCE 2: a small boost at the cutoff point. It adds a slight nasal edge; much higher and it turns vocal and squelchy.\n- KEYB CTRL 1 (100 %): keyboard control, how far the cutoff follows the notes. At 1 it follows exactly, so high and low notes have the same brightness.\n- Listen for: a dull, closed tone. Sweep VCF FREQ up to 7 and back to hear how much brass is waiting behind it.',
        set: { 'vcf.freq': 4.3, 'vcf.res': 2, 'vcf.kbd': 1 } },
      { title: 'Let ADS 2 open it', module: 'env', why: 'ADS 2 is the filter envelope: an ADS (attack, decay, sustain) shape that runs each time you play. Here it opens the filter at the start of each note, the way a brass player’s tone brightens as they blow harder.\n- ADS CONTROL 2.4 (+3.4 oct): how far ADS 2 sweeps the cutoff. On the Kobol it is off at the centre; right of centre opens the filter, left closes it. Here the peak is over three octaves above 312 Hz.\n- ATTACK 4.6 (46 ms): a slowish rise, so the tone swells open just after the note starts. At 1 it becomes a stab.\n- DECAY 6.2 (180 ms): how quickly it falls back from the peak.\n- SUSTAIN 5: it settles half way, so held notes stay partly bright.\n- Listen for: the “bwah” bloom at the start of each note. Sweep ATTACK from 1 to 7 to go from a bright stab to a slow swell.',
        set: { 'vcf.env': 2.4, 'ads2.attack': 4.6, 'ads2.decay': 6.2, 'ads2.sustain': 5 } },
      { title: 'Soft start, long ring', module: 'amp', why: 'ADS 1 is the loudness envelope, which drives the output VCA (voltage-controlled amplifier). It shapes how each note starts and ends.\n- ATTACK 3.2 (14 ms): a short fade-in that takes the click off the front without making the note late.\n- DECAY 6 (150 ms): with SUSTAIN at full it does nothing while the key is held. The Kobol has no release knob, so DECAY is also the release: notes fade over about 150 ms after you let go.\n- SUSTAIN 10: held notes stay at full level and keep singing.\n- Listen for: a soft edge at the start of each note and a short tail at the end, so phrases join up rather than chopping off.',
        set: { 'ads1.attack': 3.2, 'ads1.decay': 6, 'ads1.sustain': 10 } },
    ],
    context: {
      'ads2.attack': 'In this sound: this is the bloom. At 1 the sound becomes a stab; turned up, each note swells more slowly.',
      'vcf.env': 'In this sound: how bright the peak of each note gets.',
      'vco2.beat': 'In this sound: the slow beating between the two oscillators that makes it sound like a section.',
      'vco1.wave': 'In this sound: just short of sawtooth. Turn it towards the triangle end for a softer horn.',
      'vcf.freq': 'In this sound: the darkest the note gets between swells.',
    },
    tweaks: [
      { id: 'ads2.attack', try: 'Sweep from 1 to 7', hear: 'From a bright stab to a slow swell.' },
      { id: 'vco2.wave', try: 'Turn to 6.7', hear: 'VCO 2 becomes a square, and the brass turns hollow and reedy.' },
      { id: 'vcf.res', try: 'Raise to 5', hear: 'A nasal, muted-trumpet edge on each swell.' },
    ],
  },
  {
    id: 'kobol-pwm-strings', name: 'PWM Ensemble', ref: 'In the style of late-70s French space music', artist: 'Classic technique',
    tags: ['strings', 'pad', '70s'], level: 2,
    blurb: 'A slow, shimmering string sound made from two pulse waves.',
    how: 'At the far end of the WAVEFORM knob the pulse width is moved by the PWM source. With the switch on LFO, a slow LFO makes the two pulse waves thin and thicken, which sounds like several instruments drifting against each other. VCO 1 MOD OFF keeps VCO 1 steady so the LFO’s vibrato only reaches VCO 2.',
    phrase: { bpm: 60, loop: true, steps: [[0, 57, 3.8], [4, 60, 3.8]] },
    steps: [
      { title: 'Two pulse waves', module: 'osc', why: 'Both oscillators go to the far end of their WAVEFORM knobs, where the tone is a narrow pulse. That is the only place the pulse width can be moved, and moving it is what makes this string sound.\n- WAVEFORM 10 on VCO 1 and 2: the Kobol’s VCOs (voltage-controlled oscillators) turn smoothly from triangle to pulse. At 10 the pulse width is handed to the PWM source switch.\n- VOLUME 7 and 7: each VCO has its own VCA (voltage-controlled amplifier) in place of a mixer. Equal levels, so neither leads.\n- VCO 2 BEAT 0.6 (+6 cents): tunes VCO 2 very slightly sharp, so the two drift against each other.\n- Listen for: a thin, nasal, buzzy tone with slow beating. Nothing moves the pulse width yet.',
        set: { 'vco1.wave': 10, 'vco2.wave': 10, 'vca1.level': 7, 'vca2.level': 7, 'vco2.beat': 0.6 } },
      { title: 'A slow LFO on the pulse width', module: 'mod', why: 'PWM (pulse-width modulation) means changing how wide the pulse is while it plays. A slowly changing width makes the tone thin and thicken, which sounds like several players drifting against each other.\n- PWM source LFO: the switch picks what moves the pulse width. On LFO it is the LFO (low-frequency oscillator, a slow wave that moves other controls).\n- LFO WAVEFORM triangle: a smooth rise and fall, so the width sweeps rather than jumps.\n- LFO RATE 4.2 (0.48 Hz): about one sweep every two seconds. Slower drifts more gently.\n- LFO VOLUME 5 (50 %): the depth of the shimmer. It also sets the LFO’s vibrato on the VCOs’ pitch, so keep it modest.\n- Listen for: a held chord swirling and thickening, with a pitch waver on top. Push VOLUME much past 5 and it starts to sound seasick.',
        set: { 'mod.pwm': 'lfo', 'lfo.shape': 'tri', 'lfo.rate': 4.2, 'lfo.volume': 5 } },
      { title: 'Only VCO 2 wobbles in pitch', module: 'mod', why: 'The Kobol wires the LFO to the pitch of both VCOs. This switch takes VCO 1 out of that, so one voice stays in tune while the other wavers around it.\n- VCO 1 MOD OFF on: VCO 1 ignores the pitch modulation and only VCO 2 moves. The pulse-width shimmer on both is unaffected.\n- Listen for: the chord steadying. The pitch waver now sits against an in-tune VCO 1, so it reads as ensemble drift rather than vibrato. Flick the switch back and forth on a held chord to compare.',
        set: { 'mod.vco1Off': true } },
      { title: 'Soft filter, slow swell', module: 'filter', why: 'The VCF (voltage-controlled filter) trims the fizz off the top, and ADS 1, the loudness envelope, gives each chord a bowed swell. ADS stands for attack, decay, sustain; there is no release knob.\n- VCF FREQ 5.8 (879 Hz) and RESONANCE 1: the cutoff comes down from 2 kHz, taking the scratchy top off the pulses, with a touch of edge from the resonance.\n- ADS CONTROL 0 (off): the filter envelope does nothing, so all the movement comes from the PWM.\n- ATTACK 6.5 (230 ms): a slow bow into each chord.\n- DECAY 7.6 (600 ms) and SUSTAIN 9: held chords stay near full level. DECAY is also the release, so chords fade over about half a second when you let go.\n- Listen for: chords that swell in and fade out rather than start and stop. Turn ATTACK to 1 to hear the bow disappear.',
        set: { 'vcf.freq': 5.8, 'vcf.res': 1, 'vcf.env': 0, 'ads1.attack': 6.5, 'ads1.decay': 7.6, 'ads1.sustain': 9 } },
    ],
    context: {
      'lfo.volume': 'In this sound: the depth of the shimmer. It also moves VCO 2’s pitch, so too much sounds seasick.',
      'lfo.rate': 'In this sound: how fast the ensemble drifts. Slower is lusher.',
      'mod.vco1Off': 'In this sound: keeps VCO 1 steady, so there is always an in-tune voice under the movement.',
      'vco1.wave': 'In this sound: fully clockwise, where the pulse width follows the PWM switch.',
      'ads1.attack': 'In this sound: the slow bow into each note.',
    },
    tweaks: [
      { id: 'mod.pwm', try: 'Switch to Both', hear: 'ADS 2 adds a sweep of pulse width at the start of each note as well.' },
      { id: 'vco1.wave', try: 'Back off to 8', hear: 'The PWM fades out and the tone becomes a plain, reedy pulse.' },
      { id: 'mod.vco1Off', try: 'Switch back to Vco 1 Mod', hear: 'Both oscillators wobble together: a vibrato rather than a chorus.' },
    ],
  },
  {
    id: 'kobol-sync-lead', name: 'Sync Sweep Lead', ref: 'In the style of The Cars — “Let’s Go”', artist: 'Greg Hawkes',
    tags: ['lead', 'new wave', '80s'], level: 2,
    blurb: 'A tearing, vocal lead whose tone sweeps down on every note.',
    how: 'With SYNCHRO on, VCO 2 restarts each time VCO 1 does, so its pitch changes the tone rather than the note. ADS 2 OUT patched to VCO 2 FREQ sweeps that pitch on each note, and VCO 1 VOLUME at 0 means you only hear the synced oscillator.',
    phrase: { bpm: 120, loop: true, steps: [[0, 64, 0.9], [1, 67, 0.4], [1.5, 69, 0.9], [2.5, 67, 0.4], [3, 64, 0.9]] },
    steps: [
      { title: 'Sync VCO 2 to VCO 1', module: 'osc', why: 'Hard sync ties VCO 2 to VCO 1, so VCO 2’s tuning changes its tone rather than its note. The VCOs (voltage-controlled oscillators) are the parts that make the raw tone.\n- SYNCHRO on: VCO 2 restarts its wave every time VCO 1 starts a cycle, so the note you hear is VCO 1’s pitch.\n- VCO 2 FREQUENCY 6.4 (+16.8 st): an octave and a bit above VCO 1. Synced, that gives a hollow, vocal buzz; higher is thinner.\n- WAVEFORM 5 on both: sawtooth, bright and buzzy.\n- VCO 1 VOLUME 0, VCO 2 VOLUME 8: each VCO has its own VCA (voltage-controlled amplifier). Only the synced VCO 2 reaches the filter; VCO 1 still runs as the timekeeper.\n- Listen for: sweep VCO 2 FREQUENCY slowly on a held note. The pitch stays put while the tone tears and changes vowel.',
        set: { 'vco2.sync': true, 'vco1.wave': 5, 'vco2.wave': 5, 'vco2.freq': 6.4, 'vca1.level': 0, 'vca2.level': 8 } },
      { title: 'Sweep VCO 2 with ADS 2', module: 'env', why: 'ADS 2 is an ADS (attack, decay, sustain) envelope, normally used on the filter. A cable sends it to VCO 2’s pitch instead, so every note starts with the sync pushed hard and then settles.\n- Cable ADS 2 OUT → VCO 2 FREQ: carries the envelope voltage into VCO 2’s pitch input. Because of the sync you hear a sweep in tone, not a pitch bend.\n- ATTACK 1 (2 ms): the push is there at once.\n- DECAY 5.8 (130 ms): how long the tearing sweep takes to settle.\n- SUSTAIN 1.5: settles a little above the knob setting, so held notes keep some extra bite.\n- Listen for: a “yeow” on every note, tearing at the front, then settling. Turn SYNCHRO off and the same cable just bends VCO 2’s pitch.',
        set: { 'ads2.attack': 1, 'ads2.decay': 5.8, 'ads2.sustain': 1.5 }, cables: [['j.ads2Out', 'j.vco2Freq']] },
      { title: 'Open filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is left mostly open. The sync sweep already moves the tone, so the filter only has to stay out of the way.\n- VCF FREQ 8.2 (4.6 kHz): high, so the tearing top end of the sync comes through. Lower it and the lead loses its snarl.\n- RESONANCE 1: a hint of peak, barely audible this open.\n- ADS CONTROL 0 (off): the Kobol’s filter envelope amount is off at the centre, so ADS 2 only works on VCO 2 here.\n- Listen for: a brighter, harder lead than before. Pull VCF FREQ down to 5 to hear how much of the sweep lives in the top end.',
        set: { 'vcf.freq': 8.2, 'vcf.res': 1, 'vcf.env': 0 } },
      { title: 'Organ-style loudness', module: 'amp', why: 'ADS 1 is the loudness envelope, feeding the output VCA. An organ-style shape keeps a lead crisp.\n- ATTACK 1 (2 ms): full level at once, so the sync sweep lands on the start of the note.\n- DECAY 4 (28 ms): with SUSTAIN at full it only matters on release, because on the Kobol DECAY is also the release. Notes stop about 30 ms after you let go.\n- SUSTAIN 10: held notes stay at full level.\n- Listen for: notes that start and stop cleanly, so fast phrases stay separate.',
        set: { 'ads1.attack': 1, 'ads1.decay': 4, 'ads1.sustain': 10 } },
    ],
    context: {
      'vco2.freq': 'In this sound: sets the resting tone of the sync. Higher gives a thinner, more vocal buzz.',
      'ads2.decay': 'In this sound: how long the tearing sweep takes to settle.',
      'vco2.sync': 'In this sound: without sync the envelope would bend VCO 2’s pitch instead of its tone.',
      'vca1.level': 'In this sound: at 0 so only the synced VCO 2 is heard. Bring it up for a steadier fundamental underneath.',
    },
    tweaks: [
      { id: 'vco2.freq', try: 'Move between 5.5 and 8', hear: 'The resting tone changes from a hollow buzz to a thin whine.' },
      { id: 'vca1.level', try: 'Raise to 5', hear: 'VCO 1 adds a solid note under the sweep.' },
      { id: 'vco2.wave', try: 'Turn to 6.7 (square)', hear: 'A hollower, rounder sync sound.' },
    ],
  },
  {
    id: 'kobol-bass', name: 'Round Filter Bass', ref: 'In the style of 80s synth-pop bass', artist: 'Classic technique',
    tags: ['bass', 'synth-pop', '80s'], level: 1,
    blurb: 'A punchy, rounded bass with a quick filter snap on each note.',
    how: 'Two sawtooths an octave apart feed a low filter. ADS 2 flicks the cutoff open and shut on every note and a little resonance makes the flick more vocal. Short envelopes keep the notes tight.',
    phrase: { bpm: 112, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.2], [1, 43, 0.4], [1.5, 36, 0.2], [2, 39, 0.4], [2.5, 41, 0.2], [3, 43, 0.4], [3.5, 34, 0.4]] },
    steps: [
      { title: 'Sawtooths an octave apart', module: 'osc', why: 'Two VCOs (voltage-controlled oscillators) are stacked an octave apart. The lower one gives weight, the upper one definition.\n- VCO 1 FREQUENCY 4 (−12 st): the Kobol has no octave switch; each step of this knob is about an octave, so 4 is an octave below the note played.\n- VCO 2 FREQUENCY 5 (0 st): at the note played.\n- WAVEFORM 5 on both: sawtooth, full of harmonics for the filter to shape.\n- VOLUME 8 and 6: each VCO has its own VCA (voltage-controlled amplifier) in place of a mixer. The low one leads.\n- VCO 2 BEAT 0.8 (+8 cents): tunes VCO 2 slightly sharp for slow movement.\n- Listen for: a thick, buzzy low note with gentle beating. Turn VCO 1 VOLUME to 0 to hear how much weight it adds.',
        set: { 'vco1.freq': 4, 'vco2.freq': 5, 'vco1.wave': 5, 'vco2.wave': 5, 'vca1.level': 8, 'vca2.level': 6, 'vco2.beat': 0.8 } },
      { title: 'Close the filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a 24 dB low-pass, cutting the highs steeply. Closing it right down leaves only the body of the bass between notes.\n- VCF FREQ 3.2 (146 Hz): a dull thump with almost no buzz left. The next step flicks it open on each note.\n- RESONANCE 4: a boost at the cutoff that gives the flick a vocal edge. Past 6 the bass starts to thin out.\n- KEYB CTRL 1 (100 %): keyboard control. The cutoff follows the notes exactly, so the tone stays even up and down the line.\n- Listen for: a round, muffled bass with a slight hollow ring. Sweep VCF FREQ up to hear the saws come back.',
        set: { 'vcf.freq': 3.2, 'vcf.res': 4, 'vcf.kbd': 1 } },
      { title: 'A quick flick from ADS 2', module: 'env', why: 'ADS 2, the filter envelope (attack, decay, sustain), opens the cutoff for a moment on each note. This is the snap at the front of the bass.\n- ADS CONTROL 3.4 (+4.8 oct): well right of centre, so the envelope throws the cutoff nearly five octaves up. Lower gives a smoother bass, higher a quack.\n- ATTACK 1 (2 ms): the flick opens instantly, on the beat.\n- DECAY 4.4 (39 ms): very short, so it snaps shut again. It also sets how long the filter takes to close after each note.\n- SUSTAIN 1.5: settles just above the resting cutoff, so held notes go back to dark.\n- Listen for: a quick “bow” at the start of each note. Sweep DECAY while the line plays to hear the snap tighten and loosen.',
        set: { 'vcf.env': 3.4, 'ads2.attack': 1, 'ads2.decay': 4.4, 'ads2.sustain': 1.5 } },
      { title: 'Tight loudness', module: 'amp', why: 'ADS 1, the loudness envelope, drives the output VCA (voltage-controlled amplifier). For bass, notes should hit at once and stay separate.\n- ATTACK 1 (2 ms): full level straight away, lined up with the filter flick.\n- DECAY 4.6 (46 ms) and SUSTAIN 8: a quick dip from the peak to a slightly lower held level, which adds a little punch. DECAY is also the release, so notes stop about 50 ms after you let go.\n- Listen for: clean gaps between notes. Turn DECAY up to 7 and the notes smear into each other.',
        set: { 'ads1.attack': 1, 'ads1.decay': 4.6, 'ads1.sustain': 8 } },
    ],
    context: {
      'vcf.freq': 'In this sound: how dark the bass is between flicks.',
      'vcf.env': 'In this sound: the size of the flick. Lower for a smoother bass, higher for a quack.',
      'ads2.decay': 'In this sound: the length of the flick. It also sets how long the filter takes to close after each note.',
      'vcf.res': 'In this sound: the vocal edge. Past 6 the bass thins out.',
    },
    tweaks: [
      { id: 'ads2.decay', try: 'Move between 3.5 and 6', hear: 'From a tight click to a slow, lazy sweep.' },
      { id: 'vcf.env', try: 'Turn left to −3', hear: 'The envelope now closes the filter: each note starts dull and brightens as it fades.' },
      { id: 'vco1.wave', try: 'Turn to 6.7', hear: 'A hollow square under the saw, rounder and woodier.' },
    ],
  },
  {
    id: 'kobol-wave-sweep', name: 'Waveform Sweep', ref: 'The Kobol’s own trick: a filter-like sweep with the filter wide open', artist: 'Classic technique',
    tags: ['pad', 'ambient', 'modular'], level: 2,
    blurb: 'A slowly moving tone that changes shape by itself, with no filter sweep.',
    how: 'LFO OUT 2 patched into VCO 1 WAVEFORM moves VCO 1’s shape back and forth, from soft triangle to bright pulse. The filter is left open, so the movement you hear is the waveform itself. VCO 2 sits steady underneath.',
    phrase: { bpm: 60, loop: true, steps: [[0, 48, 3.8], [4, 55, 3.8]] },
    steps: [
      { title: 'VCO 1 in the middle of its travel', module: 'osc', why: 'The Kobol’s WAVEFORM knob turns each VCO (voltage-controlled oscillator) smoothly from triangle to pulse. Parking VCO 1 in the middle leaves room for a cable to sweep it both ways.\n- VCO 1 WAVEFORM 5: sawtooth, the centre of the sweep. Move it later and the sweep leans towards triangle or pulse.\n- VCO 2 WAVEFORM 1: just past triangle into the ramp, soft and steady underneath.\n- VCO 2 FREQUENCY 4 (−12 st): an octave below, for body.\n- VOLUME 7 and 5: each VCO has its own VCA (voltage-controlled amplifier). VCO 1 leads, since it is the one that will move.\n- VCO 2 BEAT 0.3 (+3 cents): a very slow beat between the two.\n- Listen for: a plain saw over a soft low tone. Nothing moves yet.',
        set: { 'vco1.wave': 5, 'vco2.wave': 1, 'vca1.level': 7, 'vca2.level': 5, 'vco2.freq': 4, 'vco2.beat': 0.3 } },
      { title: 'Patch the LFO to its waveform', module: 'lfo', why: 'The LFO (low-frequency oscillator) is a slow wave used to move other controls. A cable sends it to VCO 1’s WAVEFORM input, so the shape itself sweeps back and forth.\n- Cable LFO OUT 2 → VCO 1 WAVEFORM: OUT 2 is the LFO at full level, enough to swing VCO 1 from soft triangle to bright pulse and back.\n- LFO RATE 3.6 (0.28 Hz): about one sweep every three and a half seconds.\n- LFO WAVEFORM triangle: a smooth, even sweep with no jumps.\n- LFO VOLUME 0: this knob sets the vibrato on the VCOs. At 0 there is none, and LFO OUT 2 does not depend on it.\n- Listen for: a held note going from soft and hollow to bright and nasal and back, like a slow filter sweep with no filter moving.',
        set: { 'lfo.rate': 3.6, 'lfo.shape': 'tri', 'lfo.volume': 0 }, cables: [['j.lfoOut2', 'j.vco1Wave']] },
      { title: 'Open filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is opened wide so the waveform movement is heard as it is, not smoothed over.\n- VCF FREQ 8.5 (5.7 kHz): high, so the bright pulse end of the sweep comes through in full.\n- RESONANCE 0: no peak; a resonant filter would add a colour of its own.\n- ADS CONTROL 0 (off): no filter envelope.\n- Listen for: a brighter peak to each sweep. Lower VCF FREQ to 5 and the movement gets subtler, because the filter cuts the very harmonics that are changing.',
        set: { 'vcf.freq': 8.5, 'vcf.res': 0, 'vcf.env': 0 } },
      { title: 'Slow swell', module: 'amp', why: 'ADS 1 is the loudness envelope (attack, decay, sustain) that drives the output VCA. A gentle attack and full sustain turn the moving tone into a pad.\n- ATTACK 5.5 (100 ms): a soft fade-in with no click.\n- DECAY 7 (360 ms): also the release on the Kobol, so notes fade out over about a third of a second.\n- SUSTAIN 10: full level while held, so the sweep can run for as long as the key is down.\n- Listen for: hold a chord for several seconds and let the sweep cycle through.',
        set: { 'ads1.attack': 5.5, 'ads1.decay': 7, 'ads1.sustain': 10 } },
    ],
    context: {
      'lfo.rate': 'In this sound: how fast the shape sweeps.',
      'vco1.wave': 'In this sound: the centre of the sweep. Move it and the sweep leans towards triangle or pulse.',
      'lfo.volume': 'In this sound: left at 0 so there is no vibrato; LFO OUT 2 does not depend on it.',
      'vca2.level': 'In this sound: the steady triangle underneath, an octave down.',
    },
    tweaks: [
      { id: 'lfo.shape', try: 'Switch to square', hear: 'The tone jumps between two shapes instead of sweeping.' },
      { id: 'vco1.wave', try: 'Turn to 7.5', hear: 'The sweep spends more time in the pulse range and gets thinner and brighter.' },
      { id: 'vcf.freq', try: 'Lower to 5', hear: 'The filter tames the bright end of the sweep.' },
    ],
  },
  {
    id: 'kobol-crossfade', name: 'Crossfade Pluck', ref: 'Using the VCO VCAs to shape each oscillator separately', artist: 'Classic technique',
    tags: ['pluck', 'modular', 'keys'], level: 3,
    blurb: 'Each note starts as a bright buzz and fades into a soft, round tone.',
    how: 'VCO 1’s VOLUME is at 0 and ADS 2 OUT is patched to its VOLUME input, so VCO 1 only sounds at the start of each note. VCO 2 is a steady triangle. The mix moves from one to the other on every note: something a single mixer knob cannot do.',
    phrase: { bpm: 96, loop: true, steps: [[0, 60, 0.9], [1, 64, 0.9], [2, 67, 0.9], [3, 72, 0.9]] },
    steps: [
      { title: 'Bright VCO 1, soft VCO 2', module: 'osc', why: 'Two very different VCOs (voltage-controlled oscillators): a bright one that will only be heard at the start of each note, and a soft one that carries the body.\n- VCO 1 WAVEFORM 8.5: a pulse, bright and nasal.\n- VCO 2 WAVEFORM 0: a triangle, soft and round.\n- VCO 2 FREQUENCY 6 (+12 st): an octave up.\n- VCO 1 VOLUME 0, VCO 2 VOLUME 7: each VCO has its own VCA (voltage-controlled amplifier) instead of a mixer. VCO 1’s is shut; the next step opens it with a cable.\n- Listen for: only a soft, flute-like triangle. VCO 1 is running but silent.',
        set: { 'vco1.wave': 8.5, 'vco2.wave': 0, 'vco2.freq': 6, 'vca1.level': 0, 'vca2.level': 7 } },
      { title: 'ADS 2 opens VCO 1’s VCA', module: 'env', why: 'ADS 2, an ADS (attack, decay, sustain) envelope, is patched to VCO 1’s VCA, so VCO 1 gets a short loudness shape of its own. The mix moves from bright to soft on every note, which a mixer knob cannot do.\n- Cable ADS 2 OUT → VCO 1 VOLUME: the envelope voltage opens VCO 1’s VCA on top of its VOLUME knob at 0.\n- ATTACK 1 (2 ms): VCO 1 is in at once.\n- DECAY 5.2 (77 ms): how long the bright buzz lasts before the triangle takes over.\n- SUSTAIN 0: VCO 1 goes fully quiet while the key is held.\n- ADS CONTROL 0 (off): ADS 2 leaves the filter alone.\n- Listen for: a bright tick on each note that melts into the soft triangle. Turn DECAY up and the buzz lingers.',
        set: { 'ads2.attack': 1, 'ads2.decay': 5.2, 'ads2.sustain': 0, 'vcf.env': 0 }, cables: [['j.ads2Out', 'j.vco1Vol']] },
      { title: 'Filter fairly open', module: 'filter', why: 'The VCF (voltage-controlled filter) only softens the very top, since the crossfade already does the shaping.\n- VCF FREQ 7 (2.0 kHz): fairly open, the same as where it started. Most of the pulse’s buzz gets through.\n- RESONANCE 1: a slight edge at the cutoff.\n- Listen for: little change from the last step. Lower VCF FREQ to 5 and the bright attack goes duller; raise it and it gets glassier.',
        set: { 'vcf.freq': 7, 'vcf.res': 1 } },
      { title: 'A plucked loudness shape', module: 'amp', why: 'ADS 1, the loudness envelope for the output VCA, turns the note into a pluck.\n- ATTACK 1 (2 ms): instant, so the bright buzz hits right on the note start.\n- DECAY 6.2 (180 ms): the level falls quickly from its peak. DECAY is also the release, so notes fade over about 180 ms once you let go.\n- SUSTAIN 4: held notes keep some level, carried by the soft triangle.\n- Listen for: a plucked start that settles into a quieter, round tone. Play fast and every note is a bright pluck; hold one and the triangle rings on.',
        set: { 'ads1.attack': 1, 'ads1.decay': 6.2, 'ads1.sustain': 4 } },
    ],
    context: {
      'vca1.level': 'In this sound: at 0, so VCO 1 is only heard while ADS 2 opens its VCA.',
      'ads2.decay': 'In this sound: how long the bright buzz lasts before the triangle takes over.',
      'vco1.wave': 'In this sound: the bright attack. Towards 5 it becomes a sawtooth chiff.',
      'vco2.wave': 'In this sound: the soft body of the note.',
    },
    tweaks: [
      { id: 'ads2.decay', try: 'Raise to 7', hear: 'The bright start lasts longer and turns into a slow crossfade.' },
      { id: 'vca1.level', try: 'Raise to 3', hear: 'Some of VCO 1 stays under the whole note.' },
      { id: 'vco2.freq', try: 'Turn to 6.58', hear: 'VCO 2 a fifth above: a bell-like, organ-stop colour.' },
    ],
  },
  {
    id: 'kobol-self-osc', name: 'Singing Filter', ref: 'The self-oscillating filter played as an oscillator', artist: 'Classic technique',
    tags: ['lead', 'fx', 'modular'], level: 2,
    blurb: 'A pure whistling tone from the filter alone, with no oscillators.',
    how: 'With RESONANCE at 10 the filter rings on its own as a sine wave. Both VCO VOLUMEs are at 0, so the filter is the only sound source. KEYB CTRL at 1 makes its pitch follow the keyboard, and the LFO’s vibrato is added through VCF FREQUENCY.',
    phrase: { bpm: 72, loop: true, steps: [[0, 72, 1.8], [2, 76, 0.9], [3, 79, 0.9], [4, 77, 1.8], [6, 74, 1.8]] },
    steps: [
      { title: 'Silence the VCOs', module: 'mixer', why: 'This sound uses no oscillators at all. Both VCO (voltage-controlled oscillator) levels go to 0, so the filter will become the only sound source.\n- VCO 1 VOLUME 0 and VCO 2 VOLUME 0: each VCO has its own VCA (voltage-controlled amplifier) in place of a mixer. At 0 nothing reaches the filter.\n- Listen for: silence. That is expected; the next step makes the filter sing.',
        set: { 'vca1.level': 0, 'vca2.level': 0 } },
      { title: 'Resonance to OSC', module: 'filter', why: 'With resonance at maximum the VCF (voltage-controlled filter) rings on its own as a sine wave, and you can play it from the keyboard.\n- RESONANCE 10: the OSC mark. The peak at the cutoff grows until the filter whistles by itself. Below about 9.5 it stops ringing and there is silence.\n- VCF FREQ 5.8 (879 Hz): sets the pitch, and so the octave, of the whistle.\n- KEYB CTRL 1 (100 %): keyboard control. At 1 the cutoff follows the keys exactly, so the whistle plays in tune; other settings stretch or squash the scale.\n- ADS CONTROL 0 (off): no filter envelope, so the pitch does not swoop.\n- Listen for: a pure, whistling sine tone. Play a scale to hear it track.',
        set: { 'vcf.res': 10, 'vcf.kbd': 1, 'vcf.freq': 5.8, 'vcf.env': 0 } },
      { title: 'Vibrato on the filter', module: 'lfo', why: 'The LFO (low-frequency oscillator) adds vibrato. Its built-in route only reaches the VCOs, which are silent, so a cable takes it to the filter’s cutoff instead.\n- Cable LFO OUT 1 → VCF FREQUENCY: OUT 1 is the scaled LFO, so LFO VOLUME sets the vibrato depth.\n- LFO RATE 6.9 (5.75 Hz): a natural vibrato speed.\n- LFO VOLUME 1.2 (12 %): a small depth. Much higher and it turns into a siren.\n- LFO WAVEFORM triangle: a smooth wobble.\n- VCO 1 MOD OFF off: left as it is; with the VCOs silent it makes no difference.\n- Listen for: a singing, slightly wavering whistle. Pull the cable out and it goes still.',
        set: { 'lfo.rate': 6.9, 'lfo.volume': 1.2, 'lfo.shape': 'tri', 'mod.vco1Off': false }, cables: [['j.lfoOut1', 'j.vcfFreq']] },
      { title: 'Smooth loudness', module: 'amp', why: 'ADS 1, the loudness envelope (attack, decay, sustain) for the output VCA, shapes the whistle into a sung line.\n- ATTACK 2.8 (10 ms): a slight fade-in that takes the click off.\n- DECAY 6.5 (230 ms): also the release, so each note tails off over about a quarter of a second.\n- SUSTAIN 10: full level while held.\n- Listen for: smooth note starts and short tails that join a slow melody together.',
        set: { 'ads1.attack': 2.8, 'ads1.decay': 6.5, 'ads1.sustain': 10 } },
    ],
    context: {
      'vcf.res': 'In this sound: at 10 the filter is the oscillator. Below about 9.5 it stops ringing and there is silence.',
      'vcf.freq': 'In this sound: sets which octave the whistle plays in.',
      'vcf.kbd': 'In this sound: at 1 the whistle follows the keyboard in tune. Other settings stretch or squash the scale.',
      'lfo.volume': 'In this sound: the vibrato depth through LFO OUT 1.',
    },
    tweaks: [
      { id: 'vcf.kbd', try: 'Set to 2', hear: 'Every key now moves the whistle two semitones: the scale is stretched to double width.' },
      { id: 'vca1.level', try: 'Raise to 2 with VCO 1 as a triangle', hear: 'A little oscillator under the whistle, which the filter colours.' },
      { id: 'vcf.freq', try: 'Move to 7', hear: 'The whistle jumps into a higher register.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'kobol', name: 'Kobol Expander', maker: 'Behringer', year: 2023,
  heritage: 'Modelled on the 1979 RSF Kobol Expander, from France',
  summary: 'Two VCOs whose WAVEFORM knobs morph from triangle to pulse, each with its own VCA, into a 24 dB low-pass filter and an output VCA. Two ADS envelopes, an LFO, noise, a voltage processor and a CV input for almost every knob.',
  view: { w: 2000, h: 625 },
  theme: { panel: '#1e1f21', panel2: '#141516', ink: INK, font: 'din', weight: 600, cheeks: 'wood', cheekW: 38, jack: 'black' },
  signalNames: {
    osc1: 'VCO 1', osc2: 'VCO 2', env1: 'ADS 1 (the loudness envelope)', env2: 'ADS 2 (the filter envelope)', lfo: 'the LFO',
    att1: 'the LFO at LFO VOLUME’s level', mult: 'the VCO modulation bus', sum1: 'the voltage processor output', invert: 'REV OUT',
    noise: 'the noise generator',
  },
  destNames: { multIn: 'the pitch of the VCOs' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
