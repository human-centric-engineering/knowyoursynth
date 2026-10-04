// Behringer K-2 — SynthDef. A 2400 × 762 faceplate laid out from the product photo: the left two thirds are the
// fixed voice (two VCOs, mixer, the high-pass/low-pass pair, two envelopes and the modulation generator), the
// right third is the patch panel, with the external signal processor along the bottom of it.
import { annotate, clamp, expMap, pwl, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/k2.js';
import lineage from '@/synths/lineage/k2.js';
import unusual from '@/synths/unusual/k2.js';

// ── Scales ────────────────────────────────────────────────────────────────
const S10 = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 12 };
const S5 = { nums: [-4, -2, 0, 2, 4], ticks: 11, size: 12 };
// Tighter ring for the crowded columns (modulation depths, the two envelopes), so labels clear the frame line.
const S10T = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, numR: 1.58, tickR: 1.28, size: 10 };
/** Panel 0–10 → Hz. The manual gives 10 Hz–20 kHz for both filters but no taper, so both are exponential. */
const hpHz = (v) => expMap(v / 10, 12, 12000);
const lpHz = (v) => expMap(v / 10, 20, 18000);
const peak = (v) => (v / 10) * 1.08;
const mgHz = (v) => expMap(v / 10, 0.1, 22); // specifications: 0.1 Hz – 22 Hz
// Envelope times straight off the specifications table.
const eg1Dly = (v) => (v <= 0 ? 0 : expMap(v / 10, 0.01, 5.5));
const eg1Att = (v) => expMap(v / 10, 0.003, 16);
const eg1Rel = (v) => expMap(v / 10, 0.03, 16);
const eg2Hold = (v) => (v <= 0 ? 0 : expMap(v / 10, 0.01, 14));
const eg2Att = (v) => expMap(v / 10, 0.0054, 9);
// The specifications give 0.5 ms to 15 s for the decay. Straight exponential over that range makes the bottom
// half of the knob unusable, so it is bent through the middle: both ends still match the spec.
const eg2Dec = (v) => pwl(v, [[0, 0.0005], [1, 0.01], [3, 0.06], [5, 0.3], [7, 1.6], [10, 15]], true);
const eg2Rel = (v) => expMap(v / 10, 0.04, 18);
const portaS = (v) => Math.pow(v / 10, 2) * 5;
/** Modulation depth knobs are square-law, so the bottom of the range gives musical amounts. */
const dep = (v, range) => Math.pow(v / 10, 2) * range;

const SCALE1 = { 32: -24, 16: -12, 8: 0, 4: 12 };
const SCALE2 = { 16: -12, 8: 0, 4: 12, 2: 24 };
const FOUR = [-105, -35, 35, 105];
// VCO1 waveform → engine mix. `noise` is not a wave: it swaps the oscillator for the noise generator.
const WAVE1 = { tri: { tri: 1 }, rsaw: { rsaw: 1 }, pulse: { pulse: 1 }, noise: {} };
// VCO2 waveform → engine mix. `ring` is not a wave either: VCO2's output becomes the ring modulation of the two.
const WAVE2 = { rsaw: { rsaw: 1 }, sq: { pulse: 1 }, npulse: { pulse: 1 }, ring: {} };
const PW2 = { rsaw: 0.5, sq: 0.5, npulse: 0.12, ring: 0.5 };
const RING_A = { tri: 'o1tri', rsaw: 'o1saw', pulse: 'o1pulse', noise: 'o1saw' };

/** MG WAVE FORM: one knob takes output 1 from reverse saw through triangle to saw. */
function mgMix(v) {
  const p = clamp(v, 0, 10) / 5; // 0 = rsaw, 1 = tri, 2 = saw
  if (p <= 1) return { rsaw: 1 - p, tri: p };
  return { tri: 2 - p, saw: p - 1 };
}
const mgWaveName = (v) => (v < 1.7 ? 'reverse saw' : v < 4.2 ? 'reverse saw → triangle' : v < 5.9 ? 'triangle' : v < 8.4 ? 'triangle → saw' : 'saw');

const controls = [];
const decor = [];
const jacks = [];
const text = (x, y, t, size = 13, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
const knob = (id, x, y, r, rest) => controls.push({ id, type: 'knob', x, y, r, style: 'pro1', ...rest });
/** A 0–10 knob: the panel prints the numbers round every one of them. */
const k10 = (id, x, y, r, label, module, def, help, rest = {}) =>
  knob(id, x, y, r, { kind: 'cont', min: 0, max: 10, def, label, labelPos: 'bottom', module, scale: r <= 24 ? S10T : S10, help, ...rest });
const jack = (id, x, y, label, dir, rest) => jacks.push({ id, x, y, r: 17, label, labelPos: 'top', labelSize: 11, dir, ...rest });
/** A block in the patch-panel signal diagram. */
const blk = (x, y, w, h, t, size = 8.5) => {
  const lines = t.split('\n').length;
  decor.push({ t: 'rect', x, y, w, h, r: 3, stroke: '#e8c34a', sw: 1.4, fill: 'none' });
  text(x + w / 2, y + h / 2 + size * 0.36 - (lines - 1) * size * 0.58, t, size);
};
const wire = (d, w = 1.5) => decor.push({ t: 'path', d, w });

// ── Faceplate furniture ───────────────────────────────────────────────────
[[70, 14], [70, 748], [1200, 14], [1200, 748], [2330, 14], [2330, 748]].forEach(([x, y]) =>
  decor.push({ t: 'screw', x, y, r: 8 }));

// ── VCO 1 ─────────────────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 46, y: 26, w: 196, h: 508, r: 10, label: 'VOLTAGE CONTROLLED\nOSCILLATOR 1', labelAt: 'top', labelSize: 15, gapW: 200 });
knob('vco1.wave', 149, 152, 42, {
  kind: 'enum', module: 'osc', label: 'WAVE FORM', labelPos: 'bottom', labelSize: 14,
  options: [{ v: 'tri', label: '', a: FOUR[0] }, { v: 'rsaw', label: '', a: FOUR[1] }, { v: 'pulse', label: '', a: FOUR[2] }, { v: 'noise', label: '', a: FOUR[3] }],
  def: 'rsaw',
  help: 'Raw tone of Oscillator 1. Triangle is soft and hollow, reverse sawtooth is bright and buzzy, pulse is thin and nasal, and the fourth position is not a wave at all — it swaps the oscillator for the noise generator.',
});
[['tri', FOUR[0]], ['rsaw', FOUR[1]], ['pulse', FOUR[2]], ['noise', FOUR[3]]].forEach(([shape, a]) => {
  const r = (a * Math.PI) / 180;
  decor.push({ t: 'wave', x: 149 + Math.sin(r) * 66, y: 152 - Math.cos(r) * 62, size: 11, shape });
});
decor.push({ t: 'path', d: 'M198 128 H214 M200 124 L196 128 L200 132 M212 124 L216 128 L212 132', w: 1.4 });
k10('vco1.pw', 149, 300, 30, 'PW', 'osc', 5,
  'Pulse width of Oscillator 1, from a hollow square at one end to a thin, nasal pulse at the other. It only does anything with the pulse waveform selected.');
knob('vco1.scale', 149, 452, 40, {
  kind: 'enum', module: 'osc', label: 'SCALE', labelPos: 'bottom', labelSize: 14,
  options: [{ v: '32', label: '32′', a: FOUR[0] }, { v: '16', label: '16′', a: FOUR[1] }, { v: '8', label: '8′', a: FOUR[2] }, { v: '4', label: '4′', a: FOUR[3] }],
  def: '8',
  help: 'Octave of Oscillator 1 in organ-pipe feet: 32′ is the lowest, 4′ the highest. Each step is an octave.',
});

// ── Portamento ────────────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 46, y: 552, w: 196, h: 178, r: 10, label: 'PORTAMENTO', labelAt: 'top', labelSize: 15, gapW: 130 });
k10('porta.time', 149, 640, 28, 'TIME', 'glide', 0,
  'Glide. At 0 the pitch jumps straight to each new note; turn it up and the pitch slides from the note before.');

// ── VCO 2 ─────────────────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 250, y: 26, w: 188, h: 508, r: 10, label: 'VOLTAGE CONTROLLED\nOSCILLATOR 2', labelAt: 'top', labelSize: 15, gapW: 200 });
knob('vco2.wave', 344, 152, 42, {
  kind: 'enum', module: 'osc', label: 'WAVE FORM', labelPos: 'bottom', labelSize: 14,
  options: [{ v: 'rsaw', label: '', a: FOUR[0] }, { v: 'sq', label: '', a: FOUR[1] }, { v: 'npulse', label: '', a: FOUR[2] }, { v: 'ring', label: 'RING', a: FOUR[3] }],
  def: 'rsaw',
  help: 'Raw tone of Oscillator 2. Reverse sawtooth is bright, square is hollow, narrow pulse is thin and reedy. RING is not a waveform: it replaces Oscillator 2 with the two oscillators multiplied together, which sounds clangy and bell-like.',
});
[['rsaw', FOUR[0]], ['sq', FOUR[1]], ['npulse', FOUR[2]]].forEach(([shape, a]) => {
  const r = (a * Math.PI) / 180;
  decor.push({ t: 'wave', x: 344 + Math.sin(r) * 66, y: 152 - Math.cos(r) * 62, size: 11, shape });
});
knob('vco2.pitch', 344, 300, 30, {
  kind: 'cont', min: -5, max: 5, def: 0, label: 'PITCH', labelPos: 'bottom', module: 'osc', scale: S5,
  fmt: (v) => fmtSemi((v / 5) * 12),
  help: 'Tunes Oscillator 2 against Oscillator 1, about an octave either way. A tiny offset makes the two beat against each other, which the ear hears as thickness.',
});
knob('vco2.scale', 344, 452, 40, {
  kind: 'enum', module: 'osc', label: 'SCALE', labelPos: 'bottom', labelSize: 14,
  options: [{ v: '16', label: '16′', a: FOUR[0] }, { v: '8', label: '8′', a: FOUR[1] }, { v: '4', label: '4′', a: FOUR[2] }, { v: '2', label: '2′', a: FOUR[3] }],
  def: '8',
  help: 'Octave of Oscillator 2. The whole range sits an octave above Oscillator 1’s, so 8′ on both means the same octave.',
});

// ── Master tune ───────────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 250, y: 552, w: 188, h: 178, r: 10, label: 'MASTER TUNE', labelAt: 'top', labelSize: 15, gapW: 140 });
knob('tune.master', 344, 640, 28, {
  kind: 'cont', min: -5, max: 5, def: 0, label: '', labelPos: 'none', module: 'osc', scale: S5,
  fmt: (v) => fmtSemi((v / 5) * 2.5),
  help: 'Tunes the whole instrument, about two and a half semitones either way. Use it to tune to another instrument.',
});

// ── VCO mixer ─────────────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 446, y: 26, w: 144, h: 432, r: 10, label: 'VCO MIXER', labelAt: 'top', labelSize: 15, gapW: 120 });
k10('mix.vco1', 518, 150, 32, 'VCO1 LEVEL', 'mixer', 7,
  'How much of Oscillator 1 goes into the filters. With the waveform switch on its noise position this is the noise level instead.');
k10('mix.vco2', 518, 330, 32, 'VCO2 LEVEL', 'mixer', 0,
  'How much of Oscillator 2 goes into the filters — or, with RING selected, how much ring modulation.');

// ── Frequency modulation ──────────────────────────────────────────────────
decor.push({ t: 'frame', x: 446, y: 470, w: 144, h: 265, r: 10, label: 'FREQUENCY\nMODULATION', labelAt: 'top', labelSize: 13, gapW: 130 });
k10('fmod.mg', 518, 545, 24, 'MG/T.EXT', 'mod', 0,
  'How far the modulation generator moves the pitch of both oscillators. Slow rates give vibrato; fast ones give a growl. The mod wheel beside the keyboard turns this knob further, so vibrato can be brought in part-way through a note.');
k10('fmod.eg1', 518, 652, 24, 'EG1/EXT', 'mod', 0,
  'How far envelope 1 moves the pitch of both oscillators on each note. Small amounts give a blip at the start of a note; large amounts give whistles and sirens.');

// ── High-pass filter ──────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 596, y: 26, w: 168, h: 432, r: 10, label: 'VOLTAGE CONTROLLED\nHIGHPASS FILTER', labelAt: 'top', labelSize: 13, gapW: 180 });
k10('hpf.cutoff', 680, 150, 32, 'CUTOFF\nFREQUENCY', 'filter', 0,
  'Removes everything below this frequency. At 0 the bass is untouched; turn it up and the sound gets thinner and more nasal as the fundamental is stripped away.',
  { fmt: (v) => fmtHz(hpHz(v)) });
k10('hpf.peak', 680, 330, 32, 'PEAK', 'filter', 0,
  'Resonance for the high-pass filter: a boost right at the cutoff. Near maximum the filter whistles on its own.');

decor.push({ t: 'frame', x: 596, y: 470, w: 168, h: 265, r: 10, label: 'CUTOFF FREQUENCY\nMODULATION', labelAt: 'top', labelSize: 12, gapW: 170 });
k10('hpmod.mg', 680, 545, 24, 'MG/T.EXT', 'mod', 0, 'How far the modulation generator sweeps the high-pass cutoff.');
k10('hpmod.eg2', 680, 652, 24, 'EG2/EXT', 'mod', 0, 'How far envelope 2 sweeps the high-pass cutoff on each note.');

// ── Low-pass filter ───────────────────────────────────────────────────────
decor.push({ t: 'frame', x: 770, y: 26, w: 210, h: 432, r: 10, label: 'VOLTAGE CONTROLLED\nLOWPASS FILTER', labelAt: 'top', labelSize: 13, gapW: 180 });
k10('lpf.cutoff', 890, 150, 32, 'CUTOFF\nFREQUENCY', 'filter', 7,
  'Removes everything above this frequency. Turn it down and the sound gets darker and duller; turn it up and the full buzz of the oscillators comes through.',
  { fmt: (v) => fmtHz(lpHz(v)) });
k10('lpf.peak', 890, 330, 32, 'PEAK', 'filter', 0,
  'Resonance for the low-pass filter. Past about 7 the filter starts to scream, which is what this instrument is known for.');
controls.push({
  id: 'lpf.type', type: 'slide', orient: 'v', x: 794, y: 300, w: 22, h: 58, kind: 'enum', module: 'filter',
  options: [{ v: '1', label: 'FILTER 1' }, { v: '2', label: 'FILTER 2' }], def: '1', label: 'Filter type', labelPos: 'none',
  help: 'Picks between two filter circuits. FILTER 2 is the more aggressive of the two: it distorts sooner and screams harder when PEAK is up. The switch governs both filters, not just the low-pass.',
});
text(794, 258, 'FILTER 1', 10);
text(794, 378, 'FILTER 2', 10);

decor.push({ t: 'frame', x: 770, y: 470, w: 210, h: 265, r: 10, label: 'CUTOFF FREQUENCY\nMODULATION', labelAt: 'top', labelSize: 12, gapW: 170 });
k10('lpmod.mg', 875, 545, 24, 'MG/T.EXT', 'mod', 0, 'How far the modulation generator sweeps the low-pass cutoff. This is the wah and the wobble.');
k10('lpmod.eg2', 875, 652, 24, 'EG2/EXT', 'mod', 0, 'How far envelope 2 sweeps the low-pass cutoff on each note. This is the usual filter pluck or swell.');

// ── MIDI and the amplifier block ──────────────────────────────────────────
text(1062, 52, 'MIDI IN', 15);
decor.push({ t: 'din', x: 1062, y: 118, r: 46 });
decor.push({ t: 'logo', x: 1232, y: 120, size: 22, text: 'behringer', style: 'behringer' });
decor.push({ t: 'frame', x: 986, y: 198, w: 338, h: 110, r: 10, label: 'VOLTAGE CONTROLLED AMPLIFIER', labelAt: 'top', labelSize: 13, gapW: 250 });
decor.push({ t: 'path', d: 'M1120 244 L1176 268 L1120 292 Z', w: 1.6 });
wire('M1040 268 H1118 M1178 268 H1270');
text(1155, 232, 'EG 2 & EXT', 11);

// ── Modulation generator ──────────────────────────────────────────────────
decor.push({ t: 'frame', x: 986, y: 320, w: 152, h: 410, r: 10, label: 'MODULATION\nGENERATOR', labelAt: 'top', labelSize: 13, gapW: 140 });
decor.push({ t: 'led', x: 1062, y: 392, r: 6, color: 'red', litWhen: 'lfo' });
knob('mg.wave', 1062, 476, 28, {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'WAVE FORM', labelPos: 'bottom', labelSize: 12, module: 'lfo', scale: S10,
  fmt: mgWaveName,
  help: 'One knob shapes both modulation generator outputs at once. Sweeping it takes the first output from reverse sawtooth through triangle to sawtooth, and the second from a wide pulse through square to a narrow one.',
});
k10('mg.freq', 1062, 636, 28, 'FREQUENCY', 'lfo', 4,
  'Speed of the modulation generator, from about one cycle every ten seconds up to 22 Hz.',
  { fmt: (v) => fmtHz(mgHz(v)), labelSize: 12 });

// ── Envelope generator 1 ──────────────────────────────────────────────────
decor.push({ t: 'frame', x: 1144, y: 320, w: 180, h: 410, r: 10, label: 'ENVELOPE\nGENERATOR 1', labelAt: 'top', labelSize: 13, gapW: 140 });
decor.push({ t: 'led', x: 1296, y: 350, r: 6, color: 'red', litWhen: 'gate' });
k10('eg1.delay', 1234, 412, 24, 'DELAY TIME', 'env', 0,
  'How long envelope 1 waits after a note is played before it starts to rise. Use it to make a pitch sweep arrive part way through a held note.',
  { fmt: (v) => (v <= 0 ? 'none' : fmtTime(eg1Dly(v))), labelSize: 11 });
k10('eg1.attack', 1234, 535, 24, 'ATTACK TIME', 'env', 0,
  'How long envelope 1 takes to reach full once it starts.',
  { fmt: (v) => fmtTime(eg1Att(v)), labelSize: 11 });
k10('eg1.release', 1234, 658, 24, 'RELEASE TIME', 'env', 3,
  'How long envelope 1 takes to fall back to zero after you let go.',
  { fmt: (v) => fmtTime(eg1Rel(v)), labelSize: 11 });

// ── Envelope generator 2 ──────────────────────────────────────────────────
decor.push({ t: 'frame', x: 1330, y: 26, w: 164, h: 704, r: 10, label: 'ENVELOPE\nGENERATOR 2', labelAt: 'top', labelSize: 13, gapW: 140 });
decor.push({ t: 'led', x: 1468, y: 56, r: 6, color: 'red', litWhen: 'gate' });
k10('eg2.hold', 1410, 105, 24, 'HOLD TIME', 'env', 0,
  'How long envelope 2 stays at full after the attack before the decay begins.',
  { fmt: (v) => (v <= 0 ? 'none' : fmtTime(eg2Hold(v))), labelSize: 11 });
k10('eg2.attack', 1410, 243, 24, 'ATTACK TIME', 'env', 0,
  'How long the note takes to reach full loudness and brightness. Near zero it starts instantly; higher values fade it in.',
  { fmt: (v) => fmtTime(eg2Att(v)), labelSize: 11 });
k10('eg2.decay', 1410, 381, 24, 'DECAY TIME', 'env', 4,
  'How long it takes to fall from the peak to the sustain level.',
  { fmt: (v) => fmtTime(eg2Dec(v)), labelSize: 11 });
k10('eg2.sustain', 1410, 519, 24, 'SUSTAIN LEVEL', 'env', 8,
  'The level held for as long as the key is down. At 0 every note dies away by itself.',
  { labelSize: 11 });
k10('eg2.release', 1410, 657, 24, 'RELEASE TIME', 'env', 3,
  'How long the note takes to fade after you let go.',
  { fmt: (v) => fmtTime(eg2Rel(v)), labelSize: 11 });

// ══ PATCH PANEL ═══════════════════════════════════════════════════════════
// Band A — the signal path, its six modulation inputs, and the output.
const CHAIN = [
  [1506, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 1'], [1610, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 2'], [1714, 'VCO\nMIXER'],
  [1818, 'VOLTAGE\nCONTROLLED\nHP FILTER'], [1922, 'VOLTAGE\nCONTROLLED\nLP FILTER'], [2026, 'VOLTAGE\nCONTROLLED\nAMPLIFIER'],
];
CHAIN.forEach(([x, t], i) => {
  blk(x, 34, 96, 58, t);
  if (i) wire(`M${x - 8} 63 H${x} M${x - 5} 60 L${x} 63 L${x - 5} 66`);
});
wire('M2122 63 H2160');
[[1554, 'TOTAL', '−5 V ~ +5 V'], [1658, 'FREQ', '−5 V ~ +5 V'], [1762, 'EXT SIGNAL IN', '3 VPP MAX'],
  [1866, 'CUTOFF FREQ', '−5 V ~ +5 V'], [1970, 'CUTOFF FREQ', '−5 V ~ +5 V'], [2074, 'INITIAL GAIN', '0 V ~ +5 V'],
].forEach(([x, , volts], i) => {
  wire(`M${x} 92 V128`);
  text(x, 182, volts, 9);
  if (i) 0;
});
decor.push({ t: 'led', x: 2160, y: 150, r: 6, color: 'amber', litWhen: 'power' });
text(2160, 176, 'ON', 10);

knob('out.volume', 2225, 100, 38, {
  kind: 'cont', min: 0, max: 10, def: 7, label: 'VOLUME', labelPos: 'top', labelSize: 15, module: 'out', scale: S10,
  help: 'Overall output level of the synthesizer.',
});

// Band B — the modulation sources, the pitch CV column and the triggers.
blk(1560, 233, 132, 46, 'MODULATION\nGENERATOR');
blk(1830, 233, 122, 46, 'ENVELOPE\nGENERATOR 1');
blk(1830, 308, 122, 46, 'ENVELOPE\nGENERATOR 2');
wire('M1530 279 V262 H1560 M1692 262 H1720 V279');
wire('M1800 279 V262 H1830 M1952 262 H1980 V279');
wire('M1952 331 H1985');
decor.push({ t: 'wave', x: 1522, y: 330, size: 9, shape: 'sq' });
text(1720, 297, '+5 V / 0 V', 9);

// Band C — sample and hold, the spare VCA, noise and the manual trigger.
blk(1560, 418, 130, 44, 'SAMPLE\n& HOLD');
blk(1830, 418, 72, 44, 'VCA');
blk(2040, 418, 128, 44, 'NOISE\nGENERATOR');
wire('M1530 462 V440 H1560 M1690 440 H1720 V462');
wire('M1800 462 V440 H1830 M1902 440 H1930 V462');
wire('M2010 462 V440 H2040 M2168 440 H2185 V462');
wire('M1866 418 V372 H1790 V348');
controls.push({
  id: 'trig.sw', type: 'button', x: 2320, y: 440, w: 36, h: 36, kind: 'bool', def: false, module: 'util',
  label: 'TRIG SW', labelPos: 'top', labelSize: 11,
  help: 'Fires a trigger by hand, which appears at TRIG SW OUT. On the hardware, pressing it four times quickly at power-up toggles poly chain mode.',
});

// Band D — external signal processor.
decor.push({ t: 'frame', x: 1500, y: 512, w: 876, h: 226, r: 10, label: 'EXTERNAL SIGNAL PROCESSOR', labelAt: 'top', labelSize: 14, gapW: 250 });
decor.push({ t: 'path', d: 'M1588 568 L1640 585 L1588 602 Z', w: 1.4 });
text(1614, 618, 'AMP', 9);
blk(1715, 565, 124, 40, 'BAND PASS\nFILTER');
blk(1910, 565, 108, 40, 'F–V\nCONVERTER');
blk(2085, 565, 124, 40, 'ENVELOPE\nFOLLOWER');
wire('M1562 585 H1588 M1640 585 H1680 M1698 585 H1715 M1839 585 H1858 M1876 585 H1910 M2018 585 H2032 M2050 602 V620 H2067 M2067 585 H2085 M2209 585 H2228 M2246 585 H2298');
wire('M1858 585 V620 H2067 V602');

// ── Jacks ─────────────────────────────────────────────────────────────────
jack('j.total', 1554, 145, 'TOTAL', 'in', {
  dest: 'multIn', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of the modulation generator in all four MG/T.EXT knobs at once — pitch, high-pass cutoff and low-pass cutoff. How much of it reaches each one is still set by that section’s own MG/T.EXT knob.`,
  check: (v) => (v['fmod.mg'] <= 0 && v['hpmod.mg'] <= 0 && v['lpmod.mg'] <= 0
    ? 'Every MG/T.EXT knob is at 0, so nothing reaches the oscillators or the filters. Turn one of them up.' : null),
  help: 'Replaces the modulation generator as the source for all four MG/T.EXT depth knobs at once. One cable here re-sources both oscillators and both filters.',
});
jack('j.freq', 1658, 145, 'FREQ', 'in', {
  dest: 'sum1A', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of envelope 1 at the EG1/EXT knob under the VCO mixer, so it moves the pitch of both oscillators. The EG1/EXT knob sets how far.`,
  check: (v) => (v['fmod.eg1'] <= 0 ? 'The EG1/EXT frequency knob is at 0. Turn it up to hear this cable.' : null),
  help: 'Replaces envelope 1 in the EG1/EXT frequency depth knob, so something else sweeps the pitch of both oscillators.',
});
jack('j.extIn', 1762, 145, 'EXT SIGNAL IN', 'in', {
  dest: 'vcfIn', amt: 1, add: true,
  help: 'Audio straight into the filter chain, joining the oscillator mix at the high-pass input. Use it to filter the noise generator, the external signal processor, or the synth’s own output.',
});
jack('j.cutoffHp', 1866, 145, 'CUTOFF FREQ', 'in', {
  name: 'CUTOFF FREQ (high-pass)', dest: 'sum2A', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of envelope 2 at the high-pass EG2/EXT knob, so it sweeps the high-pass cutoff. That knob sets how far.`,
  check: (v) => (v['hpmod.eg2'] <= 0 ? 'The high-pass EG2/EXT knob is at 0. Turn it up to hear this cable.' : null),
  help: 'Replaces envelope 2 in the high-pass EG2/EXT depth knob.',
});
jack('j.cutoffLp', 1970, 145, 'CUTOFF FREQ', 'in', {
  name: 'CUTOFF FREQ (low-pass)', dest: 'att1In', amt: 1,
  hear: (v, x) => `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of envelope 2 at the low-pass EG2/EXT knob, so it sweeps the low-pass cutoff. That knob sets how far.`,
  check: (v) => (v['lpmod.eg2'] <= 0 ? 'The low-pass EG2/EXT knob is at 0. Turn it up to hear this cable.' : null),
  help: 'Replaces envelope 2 in the low-pass EG2/EXT depth knob. This is the socket for a sequencer, a second envelope or a slow sweep on the main filter.',
});
jack('j.initialGain', 2074, 145, 'INITIAL GAIN', 'in', {
  dest: 'amp', amt: 1, add: true,
  help: 'Voltage control of loudness, added to envelope 2. Patch the modulation generator here for tremolo, or a steady voltage to hold the amplifier open as a drone.',
});
jack('j.signalOut', 2330, 55, 'SIGNAL OUT', 'out', { signal: 'out', help: 'The main output. Patch it back into EXT SIGNAL IN or the external signal processor for feedback tricks.' });
jack('j.phones', 2330, 160, 'PHONES', 'out', { signal: 'out', help: 'Headphone output, carrying the same signal as SIGNAL OUT.' });

jack('j.mgTri', 1530, 262, 'OUT', 'out', {
  name: 'MG OUT (reverse saw / triangle / saw)', signal: 'lfo',
  help: 'The modulation generator’s first output, shaped by the WAVE FORM knob. It swings both ways around zero, so it is the one to use for vibrato and filter sweeps.',
});
jack('j.mgPulse', 1720, 262, 'OUT', 'out', {
  name: 'MG OUT (pulse)', signal: 'lfoSq',
  help: 'The modulation generator’s second output, a pulse that never goes below zero. Use it as a clock for the sample and hold, or as a trigger.',
});
jack('j.eg1Out', 1800, 262, 'OUT', 'out', { name: 'EG 1 OUT', signal: 'env1', help: 'Envelope 1 as a voltage: it rises after the DELAY time, holds while the key is down and falls on release.' });
jack('j.eg1Rev', 1980, 262, 'REV OUT', 'out', {
  name: 'EG 1 REV OUT', signal: null,
  help: 'Envelope 1 upside down: it falls where the normal output rises. This app does not model the inverted output, so the cable can be drawn but does nothing.',
});
jack('j.kbdCv', 2065, 262, 'KBD CV OUT', 'out', { signal: 'kbd', help: 'The pitch voltage of the note being played, for driving other gear or patching back in.' });
jack('j.vco12Cv', 2170, 262, 'VCO 1+2 CV IN', 'in', { dest: 'pitchAll', amt: 24, add: true, help: 'Pitch control voltage for both oscillators. On the hardware it substitutes for the keyboard; here it adds to whatever note you play.' });
jack('j.vco2Cv', 2275, 262, 'VCO 2 CV IN', 'in', { dest: 'pitch2', amt: 24, add: true, help: 'Pitch control voltage for Oscillator 2 alone, which is how the second oscillator is sequenced or detuned independently.' });

jack('j.shClock', 1560, 330, 'CLOCK', 'in', { dest: 'shClock', amt: 1, help: 'Tells the sample and hold when to take a reading. With nothing patched it runs from its own internal clock.' });
jack('j.eg1Trig', 1660, 330, 'EG1 TRIG IN', 'in', {
  dest: 'gate1', amt: 1,
  help: 'Fires envelope 1 on its own, separately from the keyboard. Patch the modulation generator’s pulse output here and envelope 1 repeats in time while you hold a note.',
});
jack('j.vcaCtrl', 1790, 330, 'CONTROL INPUT', 'in', {
  dest: 'att1CV', amt: 1,
  help: 'Gain control for the spare VCA on the patch panel. Whatever reaches it decides how much of the VCA’s input gets through.',
});
jack('j.eg2Rev', 2015, 330, 'REV OUT', 'out', {
  name: 'EG 2 REV OUT', signal: null,
  help: 'Envelope 2 upside down. There is no jack for envelope 2 the right way up. This app does not model the inverted output, so the cable does nothing.',
});
jack('j.trigIn', 2170, 330, 'TRIG IN', 'in', { dest: 'gateIn', amt: 1, help: 'An external trigger, taking over from the keyboard’s own. Both envelopes follow it.' });
jack('j.trigOut', 2275, 330, 'TRIG OUT', 'out', { signal: 'gate', help: 'The trigger that fires the envelopes, tapped for other gear.' });

jack('j.shIn', 1530, 440, 'IN', 'in', { name: 'S&H IN', dest: 'shIn', amt: 1, help: 'The signal the sample and hold takes its readings from. With nothing patched it reads noise, which gives random steps.' });
jack('j.shOut', 1720, 440, 'OUT', 'out', { name: 'S&H OUT', signal: 'sh', help: 'The stepped output of the sample and hold. Patch it to pitch for a random melody, or to a cutoff jack for burbling.' });
jack('j.vcaIn', 1800, 440, 'IN', 'in', { name: 'VCA IN', dest: 'att1In', amt: 1, help: 'Input of the spare VCA on the patch panel. It takes audio or control voltages.' });
jack('j.vcaOut', 1930, 440, 'OUT', 'out', { name: 'VCA OUT', signal: 'att1', help: 'Output of the spare VCA: its input, scaled by whatever reaches CONTROL INPUT.' });
jack('j.noisePink', 2010, 440, 'PINK', 'out', { signal: 'noise', help: 'Pink noise: less hiss on top than white, closer to wind or surf.' });
jack('j.noiseWhite', 2185, 440, 'WHITE', 'out', { signal: 'noise', help: 'White noise: every frequency at once, bright and hissy. Good for cymbals, snares and wind.' });
jack('j.trigSwOut', 2255, 440, 'TRIG SW OUT', 'out', { signal: null, help: 'The output of the TRIG SW button beside it. This app fires notes from the keyboard rather than the button, so the cable does nothing.' });

jack('j.espIn', 1545, 585, 'SIGNAL IN', 'in', { dest: 'preampIn', amt: 1, help: 'External audio into the signal processor. In this app the thing to patch here is the synth’s own SIGNAL OUT, which turns the envelope follower into a second envelope that tracks what you play.' });
jack('j.espOutPre', 1689, 585, 'OUT', 'out', { name: 'ESP OUT (before the filter)', signal: 'preamp', help: 'The external signal after the preamp, before the band-pass filter.' });
jack('j.espOutPost', 1867, 585, 'OUT', 'out', {
  name: 'ESP OUT (after the filter)', signal: 'preamp',
  help: 'The external signal after the band-pass filter. This app does not model the band-pass, so it carries the same signal as the OUT before it.',
});
jack('j.espFvOut', 2041, 585, 'F∝V CV OUT', 'out', {
  signal: null,
  help: 'A pitch voltage worked out from the external signal, for playing the oscillators from a voice or an instrument. Pitch extraction is not modelled here, so the cable does nothing.',
});
jack('j.espEnvOut', 2228, 585, 'ENV OUT', 'out', {
  signal: 'envf',
  help: 'The envelope follower: a voltage that rises and falls with the loudness of whatever is at SIGNAL IN. Patch it to a cutoff jack and one sound shapes another.',
});
jack('j.espTrigOut', 2315, 585, 'TRIG OUT', 'out', {
  name: 'TRIG OUT (ESP)', signal: null,
  help: 'A trigger produced whenever the external signal crosses the THRESHOLD LEVEL. Not modelled in this app.',
});

k10('esp.level', 1560, 680, 26, 'SIGNAL LEVEL', 'util', 5,
  'Input gain for the external signal. Turn it up until the envelope follower reacts properly.', { labelSize: 11 });
k10('esp.lowCut', 1730, 680, 26, 'LOW CUT FREQ', 'util', 2,
  'The lower edge of the band-pass filter inside the signal processor. This app does not model the band-pass, so the knob is here for reference only.', { labelSize: 11 });
k10('esp.highCut', 1900, 680, 26, 'HIGH CUT FREQ', 'util', 8,
  'The upper edge of the band-pass filter. Not modelled in this app.', { labelSize: 11 });
k10('esp.cvAdjust', 2070, 680, 26, 'CV ADJUST', 'util', 5,
  'Scales the pitch voltage the frequency-to-voltage converter produces, which is how an outside instrument is made to play the oscillators in tune. Not modelled in this app.', { labelSize: 11 });
k10('esp.threshold', 2230, 680, 26, 'THRESHOLD LEVEL', 'util', 5,
  'How loud the external signal has to get before a trigger is produced. Not modelled in this app.', { labelSize: 11 });

// ── Areas ─────────────────────────────────────────────────────────────────
const areas = [
  { id: 'vco1', label: 'Oscillator 1', module: 'osc', keywords: 'vco waveform triangle pulse noise octave feet scale pw width',
    rects: [{ x: 40, y: 20, w: 206, h: 520 }],
    help: 'The first oscillator. WAVE FORM picks the raw tone, and its fourth position swaps the oscillator for noise. PW thins out the pulse wave. SCALE sets the octave in organ-pipe feet.' },
  { id: 'porta', label: 'Portamento', module: 'glide', keywords: 'glide slide legato time',
    rects: [{ x: 40, y: 545, w: 206, h: 200 }],
    help: 'Makes the pitch slide from one note to the next instead of jumping. TIME sets how slow the slide is.' },
  { id: 'vco2', label: 'Oscillator 2', module: 'osc', keywords: 'vco waveform square narrow pulse ring modulation detune octave',
    rects: [{ x: 248, y: 20, w: 190, h: 520 }],
    help: 'The second oscillator, tuned against the first with PITCH. Its waveform switch has a RING position that replaces the oscillator with the two multiplied together, for clangy, bell-like tones. Its SCALE range sits an octave above Oscillator 1’s.' },
  { id: 'tune', label: 'Master tune', module: 'osc', keywords: 'tuning pitch reference concert',
    rects: [{ x: 248, y: 545, w: 190, h: 200 }],
    help: 'Tunes the whole instrument up or down by a couple of semitones, for playing with other instruments.' },
  { id: 'mixer', label: 'VCO mixer', module: 'mixer', keywords: 'level volume balance blend',
    rects: [{ x: 444, y: 20, w: 148, h: 440 }],
    help: 'Sets how loud each oscillator is going into the filters. Push both up and the filters start to distort, which thickens the tone.' },
  { id: 'fmod', label: 'Frequency modulation', module: 'mod', keywords: 'vibrato pitch sweep fm depth mg eg1 total freq',
    rects: [{ x: 444, y: 465, w: 148, h: 280 }],
    help: 'How much the two modulation sources move the pitch of both oscillators. MG/T.EXT is the modulation generator — vibrato at slow rates, growl at fast ones. EG1/EXT is envelope 1, for blips and sweeps at the start of a note. Patching TOTAL or FREQ on the patch panel puts something else in their place.' },
  { id: 'hpf', label: 'High-pass filter', module: 'filter', keywords: 'highpass cutoff peak resonance thin nasal bass cut',
    rects: [{ x: 596, y: 20, w: 168, h: 440 }],
    help: 'Removes the bass. CUTOFF FREQUENCY sets where it starts cutting, and PEAK adds a resonant boost right at that point. Two filters in series is what makes this instrument sound like it does: the pair can be closed in on each other to leave a narrow, vocal band.' },
  { id: 'hpmod', label: 'High-pass cutoff modulation', module: 'mod', keywords: 'sweep wah depth mg eg2',
    rects: [{ x: 596, y: 465, w: 168, h: 280 }],
    help: 'How far the modulation generator and envelope 2 sweep the high-pass cutoff. Patching the high-pass CUTOFF FREQ jack puts something else in envelope 2’s place.' },
  { id: 'lpf', label: 'Low-pass filter', module: 'filter', keywords: 'lowpass cutoff peak resonance brightness scream filter 1 2 korg 35',
    rects: [{ x: 768, y: 20, w: 214, h: 440 }],
    help: 'The main tone control. CUTOFF FREQUENCY sets how bright the sound is and PEAK adds resonance; past about 7 it screams. The FILTER 1 / FILTER 2 switch picks between two circuits, the second more aggressive than the first, and it governs the high-pass filter too.' },
  { id: 'lpmod', label: 'Low-pass cutoff modulation', module: 'mod', keywords: 'sweep wah wobble depth mg eg2 pluck',
    rects: [{ x: 768, y: 465, w: 214, h: 280 }],
    help: 'How far the modulation generator and envelope 2 sweep the low-pass cutoff. EG2/EXT is the usual filter pluck or swell; MG/T.EXT is the wobble.' },
  { id: 'midi', label: 'MIDI in', module: 'out', keywords: 'din connect keyboard sequencer computer channel',
    rects: [{ x: 986, y: 20, w: 338, h: 172 }],
    help: 'Where a keyboard, sequencer or computer connects on the hardware; the channel is set by switches on the back. In this app the on-screen keyboard plays the synth instead.' },
  { id: 'vca', label: 'Amplifier', module: 'amp', keywords: 'vca loudness gain volume envelope',
    rects: [{ x: 986, y: 195, w: 338, h: 120 }],
    help: 'The amplifier that turns each note on and off. It has no controls of its own: envelope 2 opens it, and the INITIAL GAIN jack on the patch panel adds to that.' },
  { id: 'mg', label: 'Modulation generator', module: 'lfo', keywords: 'lfo low frequency oscillator vibrato wobble rate shape morph',
    rects: [{ x: 986, y: 318, w: 152, h: 427 }],
    help: 'The LFO. FREQUENCY sets the speed. WAVE FORM shapes both of its outputs at once: the first sweeps from reverse sawtooth through triangle to sawtooth, and the second from a wide pulse through square to a narrow pulse. Both are live on the patch panel at all times.' },
  { id: 'eg1', label: 'Envelope generator 1', module: 'env', keywords: 'delay attack release pitch envelope contour',
    rects: [{ x: 1144, y: 318, w: 180, h: 427 }],
    help: 'The simpler of the two envelopes: DELAY, ATTACK and RELEASE only. It is wired to oscillator pitch through the EG1/EXT knob, which is what the delay is for — a sweep that arrives part way through a held note.' },
  { id: 'eg2', label: 'Envelope generator 2', module: 'env', keywords: 'hold attack decay sustain release adsr loudness filter contour',
    rects: [{ x: 1330, y: 20, w: 166, h: 725 }],
    help: 'The main envelope. It opens the amplifier on every note, and the two EG2/EXT knobs decide how far it also sweeps each filter. HOLD keeps it at full for a while before the decay begins.' },
  { id: 'patchsig', label: 'Patch panel — signal path', module: 'patch', keywords: 'jacks sockets total freq external cutoff initial gain block diagram',
    rects: [{ x: 1496, y: 18, w: 646, h: 195 }],
    help: 'The printed diagram of the voice, with a socket under each place you can interrupt it. TOTAL and FREQ re-source the pitch modulation, the two CUTOFF FREQ jacks re-source each filter’s envelope, EXT SIGNAL IN adds audio at the filters and INITIAL GAIN adds to the amplifier.' },
  { id: 'out', label: 'Volume and outputs', module: 'out', keywords: 'volume level headphones phones signal out power',
    rects: [{ x: 2146, y: 18, w: 220, h: 195 }],
    help: 'Overall VOLUME, the main SIGNAL OUT socket and a headphone socket. The lamp beside them shows the instrument is on.' },
  { id: 'patchmod', label: 'Patch panel — modulation and triggers', module: 'patch', keywords: 'mg out envelope out kbd cv trigger pitch voltage',
    rects: [{ x: 1496, y: 215, w: 880, h: 150 }],
    help: 'Outputs for the modulation generator and the envelopes, the keyboard’s own pitch and trigger voltages, and inputs that let something else play the oscillators or fire the envelopes.' },
  { id: 'patchutil', label: 'Patch panel — utilities', module: 'util', keywords: 'sample hold random vca noise pink white manual trigger switch',
    rects: [{ x: 1496, y: 367, w: 880, h: 140 }],
    help: 'The extras: a sample and hold for random stepped voltages, a spare VCA you can put anywhere, pink and white noise, and a button that fires a trigger by hand.' },
  { id: 'esp', label: 'External signal processor', module: 'util', keywords: 'preamp band pass envelope follower frequency to voltage trigger threshold guitar microphone',
    rects: [{ x: 1496, y: 510, w: 880, h: 238 }],
    help: 'Turns an outside sound into things the synth can use: a preamp, a band-pass filter, a pitch voltage, an envelope follower and a trigger. In this app the sound to feed it is the synth’s own output, patched from SIGNAL OUT round to SIGNAL IN.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v, ctx) {
  const P = ctx.patched || {};
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  // TOTAL, FREQ and the two CUTOFF FREQ jacks substitute for the normalled source at a depth knob. Each is
  // parked on a spare utility input so the cable has somewhere to land, and read back here as its signal.
  const mgSrc = P['j.total'] ? 'mult' : 'lfo';
  const fmEg = P['j.freq'] ? 'sum1' : 'env1';
  const hpEg = P['j.cutoffHp'] ? 'sum2' : 'env2';
  const lpEg = P['j.cutoffLp'] ? 'att1' : 'env2';

  const w1 = v['vco1.wave'];
  const w2 = v['vco2.wave'];
  const tune = (v['tune.master'] / 5) * 2.5;
  const lvl1 = level10(v['mix.vco1'], 0.9);
  const lvl2 = level10(v['mix.vco2'], 0.9);
  const osc = [
    { level: w1 === 'noise' ? 0 : lvl1, mix: WAVE1[w1], pw: clamp(0.5 - (v['vco1.pw'] / 10) * 0.42, 0.06, 0.94),
      semi: SCALE1[v['vco1.scale']] + tune, kbd: true, fixedNote: 60, syncTo: -1 },
    { level: w2 === 'ring' ? 0 : lvl2, mix: WAVE2[w2], pw: PW2[w2],
      semi: SCALE2[v['vco2.scale']] + (v['vco2.pitch'] / 5) * 12 + tune, kbd: true, fixedNote: 60, syncTo: -1 },
  ];

  const routes = [];
  const add = (src, dst, amt) => { if (Math.abs(amt) > 0.0002) routes.push({ src, dst, amt }); };
  // The mod wheel turns the FREQUENCY MG/T.EXT knob on top of where you left it. The MS-20 keyboard has no
  // wheel, so this stands in for riding that knob by hand while a note sounds.
  add(mgSrc, 'pitchAll', dep(clamp(v['fmod.mg'] + wheel * 10, 0, 10), 12));
  add(fmEg, 'pitchAll', dep(v['fmod.eg1'], 24));
  add(mgSrc, 'cutoffHp', dep(v['hpmod.mg'], 6));
  add(hpEg, 'cutoffHp', dep(v['hpmod.eg2'], 7));
  add(mgSrc, 'cutoff', dep(v['lpmod.mg'], 6));
  add(lpEg, 'cutoff', dep(v['lpmod.eg2'], 8));
  if (w2 === 'ring') add('ring', 'vcfIn', lvl2);

  const f2 = v['lpf.type'] === '2';
  return {
    osc,
    oscOuts: true,
    noise: { level: w1 === 'noise' ? level10(v['mix.vco1'], 0.8) : 0, color: 'white', tone: 0.9, gain: 1 },
    ext: { level: 0 },
    hpf: { cutoff: hpHz(v['hpf.cutoff']), res: peak(v['hpf.peak']), envAmt: 0, envSrc: 'env2', kbd: 0 },
    filter: {
      type: 'ladder', mode: 'lp', cutoff: lpHz(v['lpf.cutoff']), res: peak(v['lpf.peak']),
      envAmt: 0, envSrc: 'env2', kbd: 0, drive: f2 ? 1.3 : 0.85,
    },
    // EG1 is delay–attack–release: it climbs to full and stays there until the key is let go.
    env1: { a: eg1Att(v['eg1.attack']), d: 0.01, s: 1, r: eg1Rel(v['eg1.release']), dly: eg1Dly(v['eg1.delay']) },
    env2: { a: eg2Att(v['eg2.attack']), d: eg2Dec(v['eg2.decay']), s: v['eg2.sustain'] / 10, r: eg2Rel(v['eg2.release']), hold: eg2Hold(v['eg2.hold']) },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: mgHz(v['mg.freq']), mix: mgMix(v['mg.wave']), keySync: false },
    glide: { time: portaS(v['porta.time']), legato: false },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: {
      ringA: RING_A[w1], ringB: 'o2saw',
      gateIn: 'gate', envfIn: 'preamp', att1CV: 'one',
    },
    ring: { ac: true },
    preamp: { gain: level10(v['esp.level'], 6) },
    envf: { sens: 1.6 },
    od: { on: false }, delay: { on: false },
    sh: { rate: 6, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0,
    volume: level10(v['out.volume'], 1.1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'acid-scream', name: 'Screaming Acid Bass', ref: 'In the style of Aphex Twin — early ambient-techno bass lines', artist: 'Richard D. James',
    tags: ['bass', 'techno', '90s'], level: 1,
    blurb: 'A snarling, resonant bass line that squeals as the filter closes on each note.',
    how: 'One reverse sawtooth into a low-pass filter with PEAK almost at its limit, so the filter rings at its own pitch. Envelope 2 flicks the cutoff open at the start of every note and lets it fall back. The FILTER 2 circuit is the more aggressive of the two, which is what gives the squeal its edge.',
    phrase: { bpm: 128, loop: true, steps: [[0, 36, 0.22], [0.5, 36, 0.22], [1, 48, 0.22], [1.5, 36, 0.22], [2, 43, 0.22], [2.5, 36, 0.22], [3, 46, 0.22], [3.5, 39, 0.22]] },
    steps: [
      { title: 'One reverse sawtooth, low down', module: 'osc', why: 'One reverse sawtooth, an octave down, gives the filter plenty to bite on. Oscillator 2 is kept silent so the pitch stays single and clean for the squeal later.\n- VCO1 WAVE FORM reverse saw: VCO means voltage-controlled oscillator, the part that makes the raw tone. A reverse sawtooth has every harmonic, so it is the brightest, buzziest wave on the switch. A triangle would leave the filter far less to work on.\n- SCALE 16′: Korg’s octave switch, marked in organ-pipe feet. 16′ is an octave below 8′, down in bass territory.\n- VCO1 / VCO2 LEVEL 8 / 0: the mixer. Oscillator 1 goes in fairly hot and Oscillator 2 is off. Its waveform is set back to reverse saw so nothing odd is waiting if you bring it up.\n- Listen for: a raw, buzzy saw, because the low-pass is still at its starting 2.3 kHz. Hold a low note and remember it; the next step takes most of that buzz away.',
        set: { 'vco1.wave': 'rsaw', 'vco1.scale': '16', 'mix.vco1': 8, 'mix.vco2': 0, 'vco2.wave': 'rsaw' } },
      { title: 'Close the filter and wind up PEAK', module: 'filter', why: 'The low-pass filter takes the top off the saw and PEAK makes it ring. This is where the squeal comes from, before anything moves.\n- Low-pass CUTOFF 3.2 (176 Hz): the low-pass filter keeps what is below the cutoff and removes what is above. At 176 Hz only the body of the note gets through, so on its own it is a thud. Raise it and the bass gets buzzier and less controlled.\n- Low-pass PEAK 8.6: PEAK is Korg’s word for resonance, a boost right at the cutoff. Near the top the filter rings at its own pitch. Below about 7 this turns into an ordinary filtered bass.\n- FILTER 2: the harder of the two filter circuits, and the switch covers both filters. It distorts sooner and sounds angrier; FILTER 1 gives a rounder, more polite version.\n- High-pass CUTOFF 0 (12 Hz): the high-pass filter removes bass below its cutoff. At 12 Hz it lets everything through.\n- Listen for: a dark thud with a whistle on top. Flip between FILTER 1 and 2 on a held note to hear the edge change.',
        set: { 'lpf.cutoff': 3.2, 'lpf.peak': 8.6, 'lpf.type': '2', 'hpf.cutoff': 0 } },
      { title: 'Flick it open on each note', module: 'env', why: 'Envelope 2 now kicks the cutoff up at the start of every note and lets it fall back. The sweep past the resonant peak is the “wow” of an acid line.\n- EG2/EXT (low-pass) 6.4: EG2 is envelope generator 2, which shapes each note over time. This knob sets how far it pushes the low-pass cutoff; it is the size of the sweep and the knob to ride by hand while a pattern plays.\n- ATTACK 0 (5 ms), HOLD 0: the cutoff jumps up the instant you play and starts falling straight away, so the squeal lands on the beat.\n- DECAY 4.4 (190 ms): how long the squeal lasts. Short is percussive; long turns each note into a slow sweep.\n- SUSTAIN 1.5, RELEASE 2 (140 ms): the envelope settles low while held and dies quickly after. It also drives the VCA (voltage-controlled amplifier), so held notes get quieter too.\n- Listen for: a sharp “wow” at the front of each note. Sweep DECAY while a riff plays to hear it tighten and loosen.',
        set: { 'lpmod.eg2': 6.4, 'eg2.attack': 0, 'eg2.decay': 4.4, 'eg2.sustain': 1.5, 'eg2.release': 2, 'eg2.hold': 0 } },
      { title: 'Keep the notes short', module: 'amp', why: 'The level is set and nothing is allowed to slide between notes. With the short release from the last step, notes stop before the next one starts, which keeps a fast pattern readable.\n- VOLUME 9: the overall output level. The squeal is loud at its peak, so set this by ear against the rest of the track.\n- Portamento TIME 0: no glide, so each note jumps straight to its pitch. Turning it up would make the line slide from note to note.\n- Listen for: clean gaps between notes in a fast riff. Then drop the low-pass PEAK below 7 and hear the squeal turn into a plain filtered bass.',
        set: { 'out.volume': 9, 'porta.time': 0 } },
    ],
    context: {
      'lpf.peak': 'This is the squeal. Below about 7 the sound turns into an ordinary filtered bass.',
      'lpf.cutoff': 'Where the note sits between flicks. Raise it and the bass gets buzzier and less controlled.',
      'lpmod.eg2': 'The size of the sweep. This is the knob to ride by hand while a pattern plays.',
      'eg2.decay': 'How long the squeal lasts. Short is percussive; long turns each note into a slow sweep.',
      'lpf.type': 'FILTER 2 is the harder-edged circuit. Switch to FILTER 1 for a rounder, more polite version of the same patch.',
    },
    tweaks: [
      { id: 'lpmod.eg2', try: 'Sweep between 3 and 8 while the pattern runs', hear: 'The classic acid build, from a muted thump to a full screaming sweep.' },
      { id: 'lpf.type', try: 'Switch to FILTER 1', hear: 'Same shape, less bite: the resonance is smoother and the distortion backs off.' },
      { id: 'hpf.cutoff', try: 'Raise to 3', hear: 'The bottom drops out and the squeal is left on its own — thinner, more piercing.' },
    ],
  },
  {
    id: 'ms20-lead', name: 'Two-Filter Lead', ref: 'In the style of Vangelis — Blade Runner era leads', artist: 'Vangelis',
    tags: ['lead', 'soundtrack', '80s'], level: 1,
    blurb: 'A singing lead with a hollow, vocal middle, made by squeezing both filters together.',
    how: 'This is the patch that shows what two filters in series are for. The high-pass takes the bass out from below and the low-pass takes the top off from above, leaving a narrow band in the middle. With a little PEAK on each, that band takes on a vocal quality no single filter can give you.',
    phrase: { bpm: 72, loop: true, steps: [[0, 64, 1.4], [1.5, 67, 0.7], [2.25, 69, 1.4], [3.75, 72, 2.2], [6, 69, 0.7], [6.75, 67, 1.2]] },
    steps: [
      { title: 'Two sawtooths, half a semitone apart', module: 'osc', why: 'Two sawtooths make the raw material for the lead. Both are on 8′, so they play the same octave, and the offset on Oscillator 2 keeps them from locking into one tone.\n- Reverse saw on both: VCO stands for voltage-controlled oscillator, the part that makes the raw tone. A sawtooth has every harmonic, which the two filters need to carve a band from.\n- SCALE 8′ on both: Korg’s octave switch in organ-pipe feet. 8′ is the pitch of the key you play, and on this synth the same footage means the same octave on both oscillators.\n- PITCH 0.2 (about +0.5 semitone): tunes Oscillator 2 against Oscillator 1. Half a semitone gives a fast beat that thickens the tone. Back it towards 0 for a cleaner note.\n- VCO1 / VCO2 LEVEL 7 / 6: the mixer. The second saw sits a little lower so the first defines the pitch.\n- Listen for: hold a note and bring VCO2 LEVEL down to 0 and back. The tone goes from thin and still to wide and moving.',
        set: { 'vco1.wave': 'rsaw', 'vco1.scale': '8', 'vco2.wave': 'rsaw', 'vco2.scale': '8', 'vco2.pitch': 0.2, 'mix.vco1': 7, 'mix.vco2': 6 } },
      { title: 'Cut the bass with the high-pass', module: 'filter', why: 'The high-pass filter strips the bass from under the saws. On its own that sounds weedy; it is the lower half of a squeeze the next step completes.\n- High-pass CUTOFF 3.6 (144 Hz): a high-pass filter removes everything below its cutoff. This is the bottom edge of the band. Raise it and the lead gets thinner and more nasal; at 0 it turns back into an ordinary low-pass lead.\n- High-pass PEAK 4.2: PEAK is Korg’s word for resonance, a boost right at the cutoff. A little gives the bottom edge some body; a lot makes it honk.\n- Listen for: sweep the high-pass CUTOFF between 0 and 6 while a note rings. The body drains out and the sound goes from full to reedy.',
        set: { 'hpf.cutoff': 3.6, 'hpf.peak': 4.2 } },
      { title: 'Cut the top with the low-pass', module: 'filter', why: 'Now the low-pass filter closes in from above. With 144 Hz as the floor and 788 Hz as the ceiling, what survives is a narrow band with a resonant edge at each end: the hollow, vocal middle of this lead.\n- Low-pass CUTOFF 5.4 (788 Hz): the low-pass removes everything above its cutoff. Bring it closer to the high-pass and the band narrows, more vocal and more hollow; raise it and the saw’s buzz comes back.\n- Low-pass PEAK 4.6: resonance at the top edge. The two peaks together behave like the formants of a voice.\n- FILTER 1: the smoother of the two circuits, and it applies to both filters. It keeps the peaks singing rather than tearing.\n- Listen for: move the low-pass CUTOFF slowly down towards 4 and back while holding a note. The vowel shifts from open to closed and nasal.',
        set: { 'lpf.cutoff': 5.4, 'lpf.peak': 4.6, 'lpf.type': '1' } },
      { title: 'Let it bloom', module: 'env', why: 'Envelope 2 shapes each note over time, and here it also nudges the low-pass open, so each note opens up slightly after it starts instead of arriving all at once.\n- EG2/EXT (low-pass) 3.4: EG2 is envelope generator 2. This knob sets how far it lifts the low-pass above 788 Hz, widening the band at the front of each note.\n- ATTACK 2.2 (28 ms): a slightly soft start for brightness and loudness, since envelope 2 also opens the amplifier. It takes the click off without making the lead slow.\n- DECAY 5.5 (460 ms), SUSTAIN 7: the bloom settles back over about half a second to a level that keeps held notes full.\n- RELEASE 4.5 (630 ms): notes fade out over more than half a second, so a phrase joins up.\n- Listen for: held notes open, then settle a little. Set EG2/EXT to 0 and the band goes static.',
        set: { 'lpmod.eg2': 3.4, 'eg2.attack': 2.2, 'eg2.decay': 5.5, 'eg2.sustain': 7, 'eg2.release': 4.5 } },
      { title: 'Vibrato and a little glide', module: 'mod', why: 'Vibrato and a little glide make the lead sound played rather than programmed. Both are kept small on purpose.\n- MG WAVE FORM 5 (triangle): MG is the modulation generator, Korg’s name for an LFO (low-frequency oscillator), a slow wave that moves other controls. At the centre it is a triangle, which rises and falls evenly for smooth vibrato.\n- FREQUENCY 5.4 (1.84 Hz): the vibrato speed, just under two wobbles a second.\n- Pitch MG/T.EXT 1.1: how far the MG moves the pitch of both oscillators. Keep it under about 2 or it stops sounding like a player. The mod wheel adds to this knob, so vibrato can come in part-way through a note.\n- Portamento TIME 2.4: the pitch slides from the previous note instead of jumping. At 0 notes jump; higher gives long swoops.\n- Listen for: play a slow legato phrase. Each note slides in and then wavers gently. Push the mod wheel on a long note to deepen the vibrato.',
        set: { 'mg.wave': 5, 'mg.freq': 5.4, 'fmod.mg': 1.1, 'porta.time': 2.4 } },
    ],
    context: {
      'hpf.cutoff': 'The bottom edge of the band. Raise it and the lead gets thinner and more nasal; drop it to 0 and the patch turns into an ordinary low-pass lead.',
      'lpf.cutoff': 'The top edge. Bring the two cutoffs closer together and the band narrows, which makes the tone more vocal and more hollow.',
      'hpf.peak': 'Emphasis at the bottom edge. A little gives the tone body; a lot makes it honk.',
      'lpf.peak': 'Emphasis at the top edge.',
      'fmod.mg': 'Vibrato depth. Keep it under about 2 or it stops sounding like a player.',
    },
    tweaks: [
      { id: 'hpf.cutoff', try: 'Sweep between 0 and 6 while a note rings', hear: 'The body drains out of the sound and it goes from full to reedy — a whole tonal range one filter cannot reach.' },
      { id: 'lpf.peak', try: 'Raise to 8', hear: 'The top edge starts to whistle, moving the lead towards a flute or a bottle.' },
      { id: 'vco2.pitch', try: 'Set to 2.9 (a fifth up)', hear: 'A hollow, organ-like lead. Small offsets thicken; big ones harmonise.' },
    ],
  },
  {
    id: 'ring-bell', name: 'Ring Mod Bell', ref: 'In the style of 1970s sci-fi television stings', artist: 'Classic technique',
    tags: ['perc', 'fx', '70s'], level: 2,
    blurb: 'A metallic, inharmonic bell that rings out and fades.',
    how: 'The RING position on Oscillator 2’s waveform switch multiplies the two oscillators together instead of adding them. The result is the sum and difference of their frequencies, which are not whole-number harmonics — so it sounds like metal rather than a note. Tuning the oscillators to an odd interval makes it more bell-like.',
    phrase: { bpm: 84, loop: true, steps: [[0, 72, 1.8], [2, 67, 1.8], [4, 76, 1.8], [6, 64, 1.8]] },
    steps: [
      { title: 'Turn Oscillator 2 into the ring modulator', module: 'osc', why: 'Switching Oscillator 2 to RING turns it into a ring modulator: instead of a second tone you get the two oscillators multiplied together. That is the source of the metallic clang.\n- VCO1 triangle, SCALE 8′: VCO is voltage-controlled oscillator. The triangle is soft and hollow, a simple input for the ring modulator; a pulse would give a rougher, more gong-like clang.\n- VCO2 RING, SCALE 8′: RING replaces Oscillator 2’s output with the two oscillators multiplied, which gives their sum and difference frequencies rather than the notes themselves.\n- VCO1 / VCO2 LEVEL 3.5 / 9: with RING selected, VCO2 LEVEL is the amount of ring modulation, so it leads. Oscillator 1 is still one of the two inputs, so it stays in the patch; its level sets how much plain triangle is heard beside the metal.\n- Listen for: with both on 8′ and no detune, the ring output is fairly plain and still sounds like a note. The next step makes it metal.',
        set: { 'vco1.wave': 'tri', 'vco1.scale': '8', 'vco2.wave': 'ring', 'vco2.scale': '8', 'mix.vco1': 3.5, 'mix.vco2': 9 } },
      { title: 'Tune to an awkward interval', module: 'osc', why: 'Detuning Oscillator 2 by an odd interval pushes the ring modulator’s sum and difference tones off the harmonic series. The note stops sounding like a note and starts sounding like struck metal.\n- PITCH 1.7 (about +4.1 semitones): just over a major third, not an octave or a fifth, so the new tones land between the harmonics. Every position sounds like a different piece of metal; this is the main control of the patch.\n- Listen for: hold a note and turn PITCH slowly. Near 2.9 (a fifth) and 4.9 (an octave) the tone settles and turns more musical; in between it clangs. Turn VCO1 LEVEL to 0 for only the metal, and up for a clearer pitch.',
        set: { 'vco2.pitch': 1.7 } },
      { title: 'Open the filter and take the bass out', module: 'filter', why: 'Bells live in the upper middle. The low-pass is opened to let the clang through, and the high-pass takes out the weight that would make it sound like a note rather than a strike.\n- Low-pass CUTOFF 8 (4.6 kHz), PEAK 1.5: the low-pass removes what is above the cutoff. Opened this far it keeps the bright inharmonic tones. A touch of PEAK, Korg’s word for resonance, adds a slight edge without a whistle.\n- High-pass CUTOFF 3.2 (109 Hz), PEAK 1: the high-pass removes what is below the cutoff. It takes the body out so the sound reads as metal. Drop it to 0 and a thicker, bassier tone comes back under the clang.\n- Listen for: the sound getting lighter and brighter, with less weight under it on low keys.',
        set: { 'lpf.cutoff': 8, 'lpf.peak': 1.5, 'hpf.cutoff': 3.2, 'hpf.peak': 1 } },
      { title: 'Strike and ring', module: 'env', why: 'Envelope 2 now gives the shape of anything struck: all the energy at the start, then a slow fade. It also opens the amplifier, so it sets the bell’s loudness over time.\n- ATTACK 0 (5 ms), HOLD 0: EG2, envelope generator 2, jumps to full at once with no pause at the top. That is the strike.\n- DECAY 7.4 (2.2 s): how long the bell rings as it fades. Long decay with zero sustain is what makes it a strike rather than a held note.\n- SUSTAIN 0: nothing is held, so the bell dies away on its own even with the key down.\n- RELEASE 5.5 (1.2 s): let go early and the ring still tails off over about a second instead of stopping dead.\n- Listen for: tap a key, then hold one. Both ring out and fade. Shorten DECAY and it turns from a bell into a clank.',
        set: { 'eg2.attack': 0, 'eg2.decay': 7.4, 'eg2.sustain': 0, 'eg2.release': 5.5, 'eg2.hold': 0 } },
    ],
    context: {
      'vco2.pitch': 'The interval between the two oscillators sets which inharmonic tones appear. Every position sounds like a different piece of metal — this is the main control of the patch.',
      'mix.vco1': 'How much plain Oscillator 1 is heard alongside the ring output. At 0 you get only the metal; turn it up and a recognisable pitch comes back.',
      'eg2.decay': 'How long the bell rings. Long decay with zero sustain is what makes it a strike rather than a held note.',
      'hpf.cutoff': 'Takes the body out so it reads as metal rather than as a bass note.',
    },
    tweaks: [
      { id: 'vco2.pitch', try: 'Move slowly from 0 to 5', hear: 'Every position is a different bell. Around 1.5 and 3.5 are the most metallic.' },
      { id: 'vco1.wave', try: 'Switch to pulse', hear: 'More harmonics into the ring modulator, so a rougher, more gong-like clang.' },
      { id: 'eg2.decay', try: 'Cut to 2', hear: 'A short metallic tick rather than a bell — the start of synthetic percussion.' },
    ],
  },
  {
    id: 'sh-burble', name: 'Random Step Burble', ref: 'In the style of 1960s and 70s computer sound effects', artist: 'Classic technique',
    tags: ['fx', 'ambient', '70s'], level: 2,
    blurb: 'A chattering, random melody that plays itself while you hold one key.',
    how: 'The sample and hold reads the noise generator on every tick of its clock and holds the reading until the next one. Patched to oscillator pitch, that gives a new random note on every tick. This is what the patch panel is for: nothing on the front panel can do it, and it takes two cables.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 7.8]] },
    steps: [
      { title: 'One plain oscillator', module: 'osc', why: 'A single pulse wave gives a clear, simple tone, so each random step will be easy to pick out at speed.\n- WAVE FORM pulse, PW 5: VCO means voltage-controlled oscillator. PW is pulse width: near 0 a hollow square, towards 10 a thin, nasal pulse. 5 sits between, bright but not harsh.\n- SCALE 8′: Korg’s octave switch in organ-pipe feet; 8′ is the pitch of the key you play.\n- VCO1 / VCO2 LEVEL 7 / 0: only Oscillator 1 in the mixer, so the random notes come out as single, clear pitches.\n- Listen for: an ordinary buzzy note for now, with the filter at its starting 2.3 kHz.',
        set: { 'vco1.wave': 'pulse', 'vco1.pw': 5, 'vco1.scale': '8', 'mix.vco1': 7, 'mix.vco2': 0 } },
      { title: 'Open the filter', module: 'filter', why: 'The steps are the interest here, so the filter stays fairly open. A bit of resonance gives each new step a ping as it lands.\n- Low-pass CUTOFF 6.6 (1.8 kHz): the low-pass removes what is above the cutoff. At 1.8 kHz most of the pulse gets through. This is how bright the chatter is.\n- Low-pass PEAK 4.4: PEAK is Korg’s word for resonance, a boost at the cutoff. With it up, each step pings at its own pitch, the classic “computer thinking” sound.\n- High-pass CUTOFF 1.5 (34 Hz): the high-pass trims only the lowest rumble; the body of the note stays.\n- Listen for: a slightly hollow, ringing edge on a held note. Once the steps are running, push PEAK to 9 and each step rings out.',
        set: { 'lpf.cutoff': 6.6, 'lpf.peak': 4.4, 'hpf.cutoff': 1.5 } },
      { title: 'Hold the note open', module: 'amp', why: 'Envelope 2 opens the amplifier on every note. Here it stays fully open while a key is held, so one held key keeps the sound running and the stepping is left to the sample and hold.\n- ATTACK 0 (5 ms): EG2, envelope generator 2, reaches full straight away.\n- DECAY 6 (690 ms), SUSTAIN 10: with sustain at maximum there is nothing to decay to, so the level stays at full for as long as you hold.\n- RELEASE 2 (140 ms): the sound stops quickly when you let go.\n- Listen for: a held note that does not change at all. Later, lower SUSTAIN and the pattern fades out under you.',
        set: { 'eg2.attack': 0, 'eg2.decay': 6, 'eg2.sustain': 10, 'eg2.release': 2 } },
      { title: 'Clock the sample and hold from the modulation generator', module: 'util', why: 'The modulation generator becomes the clock for the sample and hold, so its speed will be the speed of the burble. The sound does not change yet: the sample and hold is ticking, but its output goes nowhere.\n- FREQUENCY 6.4 (3.16 Hz): MG is the modulation generator, Korg’s name for an LFO (low-frequency oscillator). About three ticks a second; faster chatters, slower wanders.\n- MG WAVE FORM 5: at the centre the pulse output is a square, so the ticks are evenly spaced.\n- Cable MG OUT (pulse) → CLOCK: the pulse output only swings one way, which makes it a clean clock. CLOCK tells the S&H (sample and hold) when to take a reading, which it holds until the next tick.\n- Listen for: nothing new yet. The next cable makes the ticks audible.',
        cables: [['j.mgPulse', 'j.shClock']], set: { 'mg.freq': 6.4, 'mg.wave': 5 } },
      { title: 'Send the steps to pitch', module: 'mod', why: 'Now the random readings reach pitch. Each tick lands on a new random note, and one held key plays a chattering melody by itself.\n- Cable S&H OUT → VCO 1+2 CV IN: with nothing patched into S&H IN, the sample and hold reads noise, so every held value is random. VCO 1+2 CV IN is the pitch CV (control voltage) input for both oscillators; here it adds to the note you play.\n- Listen for: a new pitch about three times a second, each one pinging through the resonant filter. Turn FREQUENCY to speed the burble up or slow it down, and play other keys: the random steps move with the key.',
        cables: [['j.shOut', 'j.vco12Cv']] },
    ],
    context: {
      'mg.freq': 'The speed of the burble, because the modulation generator is clocking the sample and hold.',
      'lpf.peak': 'With resonance up, each step pings at its own pitch — the classic "computer thinking" sound.',
      'lpf.cutoff': 'How bright the chatter is.',
      'eg2.sustain': 'Full sustain keeps the sound running so you can hear the steps; lower it and the pattern fades under you.',
    },
    tweaks: [
      { id: 'mg.freq', try: 'Slow to 3, then push to 9', hear: 'Slow gives a lazy random melody; fast turns into a rattle where the steps blur into a texture.' },
      { id: 'porta.time', try: 'Raise to 3', hear: 'The steps slide into each other rather than jumping — a drunken siren instead of a computer.' },
      { id: 'lpf.peak', try: 'Push to 9', hear: 'Each step rings out. Try turning the oscillator level down so the filter is nearly all you hear.' },
    ],
  },
  {
    id: 'delayed-sweep', name: 'Delayed Pitch Sweep', ref: 'In the style of early electronic library music', artist: 'Classic technique',
    tags: ['fx', 'lead', '70s'], level: 2,
    blurb: 'Each note sits still, then slides upward part way through.',
    how: 'Envelope 1 has a DELAY stage before its attack, and it is wired to oscillator pitch through the EG1/EXT knob. Set a delay of a second or so and the note starts normally, waits, then climbs. Very few synths can do this without a cable; here it is two knobs.',
    phrase: { bpm: 64, loop: true, steps: [[0, 55, 3.6], [4, 60, 3.6]] },
    steps: [
      { title: 'A simple held tone', module: 'osc', why: 'A plain, steady tone is enough here, because the point is a pitch move that arrives later. Two oscillators give it a little movement so a long held note does not sound dead.\n- VCO1 reverse saw, VCO2 square, both 8′: VCO is voltage-controlled oscillator. The bright saw carries the tone and the hollow square adds body. 8′ is the pitch of the key played, the same octave on both.\n- PITCH −0.1 (about −0.4 semitone): Oscillator 2 sits a touch flat, so the two beat slowly against each other.\n- VCO1 / VCO2 LEVEL 7 / 4: the square sits well under the saw as support.\n- Listen for: a slow swirl on a held note from the detune. Nothing else moves yet.',
        set: { 'vco1.wave': 'rsaw', 'vco1.scale': '8', 'mix.vco1': 7, 'mix.vco2': 4, 'vco2.wave': 'sq', 'vco2.scale': '8', 'vco2.pitch': -0.15 } },
      { title: 'Filter it warm', module: 'filter', why: 'A medium filter setting keeps the tone warm, so when the pitch climbs later it stays pleasant rather than piercing.\n- Low-pass CUTOFF 5.6 (902 Hz), PEAK 3: the low-pass removes what is above 902 Hz, taking the fizz off the saw. PEAK, Korg’s word for resonance, adds a little colour at the cutoff.\n- High-pass CUTOFF 0.8 (21 Hz): the high-pass is almost out of the way, only trimming sub-bass rumble.\n- EG2/EXT (low-pass) 1.6: EG2 is envelope generator 2. A small amount lifts the cutoff at the start of each note for a little brightness on the front.\n- Listen for: a rounder, darker note than before, with a faint brighter start.',
        set: { 'lpf.cutoff': 5.6, 'lpf.peak': 3, 'hpf.cutoff': 0.8, 'lpmod.eg2': 1.6 } },
      { title: 'Hold the note', module: 'amp', why: 'Envelope 2 opens the amplifier, and here it keeps the note sounding for as long as the key is held, so it is still there when the delayed sweep arrives.\n- ATTACK 1.5 (16 ms): a slightly soft start that takes the click off the front.\n- DECAY 6 (690 ms), SUSTAIN 9: the level barely drops after the start, so held notes stay nearly full. The small filter lift from the last step settles over the same time.\n- RELEASE 4 (460 ms): notes fade over about half a second after you let go.\n- Listen for: an even, held note. Hold it for a couple of seconds; in the next steps something happens part way through.',
        set: { 'eg2.attack': 1.5, 'eg2.decay': 6, 'eg2.sustain': 9, 'eg2.release': 4 } },
      { title: 'Set envelope 1 to wait, then rise', module: 'env', why: 'Envelope 1 is the simpler of the two envelopes, and it is wired to oscillator pitch. This step sets its shape; nothing is heard yet, because its depth knob is still at 0.\n- DELAY TIME 7 (830 ms): EG1, envelope generator 1, waits this long after you press a key before it starts to rise. That wait is the whole trick, and a delay stage is rare on a monosynth.\n- ATTACK TIME 5 (220 ms): once the wait is over, how long the climb takes. Short is a jump; long is a slide.\n- RELEASE TIME 5 (690 ms): after you let go, how long the pitch takes to come back down.\n- Listen for: no change yet. The next step connects this envelope to pitch.',
        set: { 'eg1.delay': 7, 'eg1.attack': 5, 'eg1.release': 5 } },
      { title: 'Send envelope 1 to pitch', module: 'mod', why: 'The EG1/EXT knob in the frequency modulation section is how envelope 1 reaches the pitch of both oscillators. Turning it up makes the delayed climb audible.\n- EG1/EXT 3.4: how far envelope 1 moves the pitch. Around 3 is a few semitones, a musical lift; past 6 it leaves the keyboard behind and becomes a siren. The EXT half of the name means a cable in the FREQ socket would take the envelope’s place here.\n- Listen for: hold a note. It sits still for a little under a second, climbs over about a quarter of a second, then stays up. Let go and it falls back as it fades. Notes shorter than 830 ms never climb at all.',
        set: { 'fmod.eg1': 3.4 } },
    ],
    context: {
      'eg1.delay': 'How long the note waits before it starts to climb. This is the whole trick.',
      'eg1.attack': 'How long the climb takes. Short is a jump, long is a slide.',
      'fmod.eg1': 'How far the pitch climbs. Around 3 is a few semitones; past 6 it leaves the keyboard behind.',
      'eg1.release': 'How the pitch comes back down when you let go.',
      'eg2.sustain': 'High sustain keeps the note alive long enough for the delayed sweep to arrive.',
    },
    tweaks: [
      { id: 'fmod.eg1', try: 'Raise to 7', hear: 'A dramatic rising whistle instead of a musical interval — the classic tape-machine-speeding-up effect.' },
      { id: 'eg1.delay', try: 'Cut to 0', hear: 'The sweep happens at the front of the note instead, which is the usual synth pitch blip.' },
      { id: 'eg1.attack', try: 'Set to 0 with delay still at 7', hear: 'The pitch jumps in one step part way through the note.' },
    ],
  },
  {
    id: 'noise-wind', name: 'Wind and Weather', ref: 'In the style of 1970s radio drama atmospheres', artist: 'Classic technique',
    tags: ['fx', 'ambient', '70s'], level: 1,
    blurb: 'No oscillators at all: a resonant band of noise that rises and falls like wind.',
    how: 'The fourth position on Oscillator 1’s waveform switch replaces the oscillator with the noise generator. Noise holds every frequency at once, so the two filters can pick out a narrow band of it, and the ear hears that band as a pitch — like wind across a gap. The modulation generator moves the band slowly so the wind gusts on its own.',
    phrase: { bpm: 40, loop: true, steps: [[0, 60, 7.8]] },
    steps: [
      { title: 'Noise instead of an oscillator', module: 'osc', why: 'There are no oscillators in this sound. The fourth position on Oscillator 1’s waveform switch swaps the oscillator for the noise generator, and noise holds every frequency at once: the raw material for wind.\n- VCO1 WAVE FORM noise: VCO is voltage-controlled oscillator, but in this position there is no oscillator at all, just noise. It costs you an oscillator, where most synths give noise its own mixer channel.\n- VCO1 LEVEL 9.5: now the noise level, set high so there is plenty for the filters to pick from.\n- VCO2 LEVEL 0: Oscillator 2 is silent, so nothing pitched is heard.\n- Listen for: a steady hiss, slightly dulled by the low-pass at its starting 2.3 kHz. It is the same on every key, because noise has no pitch.',
        set: { 'vco1.wave': 'noise', 'mix.vco1': 9.5, 'mix.vco2': 0 } },
      { title: 'Squeeze a band out of it', module: 'filter', why: 'The two filters close in on the noise from both sides and leave a narrow band. With resonance on both edges the ear hears that band as a howl with a rough pitch, like wind across a gap.\n- High-pass CUTOFF 3.4 (126 Hz), PEAK 6: the high-pass removes everything below 126 Hz; PEAK is Korg’s word for resonance, a boost at the cutoff. Raising this cutoff turns weather into steam.\n- Low-pass CUTOFF 5 (600 Hz), PEAK 6.8: the low-pass removes everything above 600 Hz. Its PEAK is how whistly the wind is: lower for distant surf, higher for a howling gale.\n- FILTER 1: the smoother of the two circuits, applied to both filters, so the peaks whistle without tearing.\n- Listen for: the hiss turning into a hollow, whistling band. Move the low-pass CUTOFF by hand to hear the wind’s pitch change.',
        set: { 'hpf.cutoff': 3.4, 'hpf.peak': 6, 'lpf.cutoff': 5, 'lpf.peak': 6.8, 'lpf.type': '1' } },
      { title: 'Let it swell', module: 'amp', why: 'Envelope 2 opens the amplifier on every note. A long attack and a long release make each gust fade in and out rather than switching on.\n- ATTACK 6.4 (620 ms): EG2, envelope generator 2, takes over half a second to reach full, so a gust arrives slowly when you press a key.\n- DECAY 6 (690 ms), SUSTAIN 10: at full sustain the level simply stays up while you hold.\n- RELEASE 6.6 (2.3 s): the wind dies away over a couple of seconds after you let go.\n- VOLUME 9: the overall output. A narrow band of noise is quiet, so it needs more level here.\n- Listen for: press and release a key. The wind rises, holds, then trails away.',
        set: { 'eg2.attack': 6.4, 'eg2.decay': 6, 'eg2.sustain': 10, 'eg2.release': 6.6, 'out.volume': 9 } },
      { title: 'Move the band slowly', module: 'mod', why: 'The modulation generator now moves the band up and down by itself, so the wind gusts without you touching anything.\n- MG WAVE FORM 5 (triangle): MG is the modulation generator, Korg’s name for an LFO (low-frequency oscillator), a slow wave that moves other controls. A triangle rises and falls evenly, like a gust.\n- FREQUENCY 1.2 (0.19 Hz): about one rise and fall every five seconds. This is how often the wind swells.\n- Low-pass MG/T.EXT 4.4: how far the MG moves the top edge of the band, which is how far each gust travels.\n- High-pass MG/T.EXT 2.4: a smaller move on the bottom edge, so the whole band shifts rather than just stretching.\n- Listen for: hold a key for ten seconds. The whistle rises and falls in pitch. Set both MG/T.EXT knobs to 0 and it goes static.',
        set: { 'mg.wave': 5, 'mg.freq': 1.2, 'lpmod.mg': 4.4, 'hpmod.mg': 2.4 } },
    ],
    context: {
      'lpf.peak': 'How whistly the wind is. Lower it for distant surf; raise it for a howling gale.',
      'hpf.cutoff': 'The bottom of the band. Raising it turns weather into steam.',
      'mg.freq': 'How often the wind rises and falls.',
      'lpmod.mg': 'How far each gust travels.',
      'eg2.attack': 'How slowly a gust arrives when you press a key.',
    },
    tweaks: [
      { id: 'lpf.peak', try: 'Drop to 2 and lower the cutoff to 3', hear: 'The whistle goes and distant surf is left.' },
      { id: 'mg.freq', try: 'Push to 7', hear: 'Fast flutter instead of wind — closer to a helicopter or a flag.' },
      { id: 'eg2.decay', try: 'Attack 0, decay 2, sustain 0, cutoff 8', hear: 'A snare-like burst. Noise plus a fast envelope is how synth percussion starts.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'k2', name: 'K-2', maker: 'Behringer', year: 2019,
  heritage: 'Modelled on the 1978 Korg MS-20',
  summary: 'Two oscillators into a mixer, then a resonant high-pass and a resonant low-pass in series, then the amplifier. Two envelopes and one modulation generator are wired in already, and a 27-socket patch panel lets you take any of it apart.',
  view: { w: 2400, h: 762 },
  theme: {
    panel: '#121316', panel2: '#0a0b0d', ink: '#e8c34a', font: 'din', weight: 600,
    cheeks: 'wood', cheekW: 28, jack: 'black',
  },
  signalNames: {
    lfo: 'the modulation generator', lfoSq: 'the modulation generator’s pulse output',
    env1: 'envelope 1', env2: 'envelope 2', vcfHp: 'the high-pass filter output', vcf1: 'the low-pass filter output',
    mixer: 'the VCO mixer output', sh: 'the sample and hold', att1: 'the patch-panel VCA',
    mult: 'whatever is patched into TOTAL', sum1: 'whatever is patched into FREQ',
    sum2: 'whatever is patched into the high-pass CUTOFF FREQ jack',
    preamp: 'the external signal processor’s preamp', envf: 'the envelope follower', gate: 'the key trigger',
  },
  destNames: {
    multIn: 'the MG/T.EXT modulation bus', sum1A: 'the EG1/EXT frequency depth knob',
    sum2A: 'the high-pass EG2/EXT depth knob', att1In: 'the patch-panel VCA',
    cutoffHp: 'the high-pass cutoff', cutoff: 'the low-pass cutoff', vcfIn: 'the filter chain',
  },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
