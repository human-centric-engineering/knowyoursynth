// Roland Jupiter-6 — SynthDef. Positions are measured on a 1600×1200 photo of the instrument lying on a rug
// (ref/jupiter-6.jpg), written in photo pixels and moved into the view by X()/Y() (the main panel) and LX()/LY() (the
// BEND / LFO-2 plate to the left of the keys). The photo leans by about 0.4°, so Y() takes the lean out first. The data
// model is the Jupiter-6 synth.json (Owner's Manual, read by OCR, plus reviews for the MIDI).
//
// The view is the main panel with the small plate from the left of the keyboard stood beside it, as on the Poly D: the
// bender and the performance LFO live there and the instrument is not complete without them.
//
// The Jupiter-6 holds two patches (lower and upper) and splits them across the keyboard. This app has one voice pool, so
// it models one patch on all six voices (KEY MODE at WHOLE): KEY MODE, PANEL MODE, BALANCE and BENDER are printed but do
// not change the sound (see src/lib/limits.js). The memory, bank, number, tape and tune buttons are printed as artwork.
import { annotate, clamp, expMap, pwl, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/jupiter-6.js';
import unusual from '@/synths/unusual/jupiter-6.js';
import moreSounds from '@/synths/sounds/jupiter-6.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// From the manual's specifications: LFO-1 0.04–100 Hz, delay up to 2.5 s; envelopes up to 18 s attack and 20 s decay and
// release; VCF 5 Hz–30 kHz (the engine stops at 10 Hz–20 kHz); arpeggio 1–25 Hz; glide up to 1.6 s per octave; LFO-2
// 1–10 Hz with a 0.05–1 s rise; VCO-2 LOW 1.5–50 Hz. The shape of each taper between its ends is this app's estimate.
const ATT_PTS = [[0, 0.002], [2, 0.02], [4, 0.12], [6, 0.6], [8, 3], [10, 18]];
const DR_PTS = [[0, 0.004], [2, 0.03], [4, 0.15], [6, 0.7], [8, 3.4], [10, 20]];
const attTime = (v) => pwl(v, ATT_PTS, true);
const drTime = (v) => pwl(v, DR_PTS, true);
const lfoHz = (v) => expMap(v / 10, 0.04, 100);
const lfoDelay = (v) => 2.5 * Math.pow(v / 10, 2);
const vcfHz = (v) => expMap(v / 10, 10, 20000);
const arpHz = (v) => expMap(v / 10, 1, 25);
const glideTime = (v) => 1.6 * Math.pow(v / 10, 2);
const lfo2Hz = (v) => expMap(v / 10, 1, 10);
const riseTime = (v) => expMap(v / 10, 0.05, 1);
const pct = (v) => `${Math.round(v * 10)} %`;
const kfPct = (v) => `${Math.round(v * 12)} %`;
const cents = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`;
/** VCO-1 RANGE: 49 half steps from 32' (0) to 2' (48); 8' is 24. */
const FEET = ["32'", "16'", "8'", "4'", "2'"];
const v1Name = (v) => (v % 12 === 0 ? FEET[v / 12] : fmtSemi(v - 24));
/** VCO-2 RANGE: 0–11 LOW (1.5–50 Hz, no keyboard), 12–60 half steps 32' to 2', 61–72 HIGH (2' up to 1/2' in whole tones). */
const v2Semi = (v) => (v <= 60 ? v - 36 : 24 + (v - 60) * 2);
const v2LowHz = (v) => 1.5 * Math.pow(50 / 1.5, v / 11);
const v2Name = (v) => (v < 12 ? `LOW ${fmtHz(v2LowHz(v))}` : v <= 60 && v % 12 === 0 ? FEET[v / 12 - 1] : `${v > 60 ? 'HIGH ' : ''}${fmtSemi(v2Semi(v))}`);
const LFO_MIX = { tri: { tri: 1 }, saw: { saw: 1 }, sq: { sq: 1 }, rnd: { sh: 1 } };
// LFO-1 DELAY TIME does not reach the pulse width or the VCA, so those routes take the plain shape, not the delayed `lfo`.
const LFO_RAW = { tri: 'lfoTri', saw: 'lfoSaw', sq: 'lfoSq', rnd: 'lfo' };

// ── Photo → view ──────────────────────────────────────────────────────────
// Main panel: photo x 42…1525, y 232…580 (× 2.4), after a 0.62 % lean. Left of it the BEND / LFO-2 plate, photo x 68…322,
// y 612…805, bottom-aligned with the panel.
const K = 2.4;
const r1 = (n) => Math.round(n * 10) / 10;
const X = (px) => r1((px - 42) * K + 680);
const Y = (py) => r1((py - 232) * K);
const LX = (px) => r1((px - 68) * K + 42);
const LY = (py) => r1((py - 612) * K + 355);
const VIEW_H = 838;

const controls = [];
const decor = [];
const INK = '#ecebe6';
const PANEL = '#1b1c1f';
const BLUE = '#2f6ed6';
const ORANGE = '#e5561d';
const LILAC = '#a596dc';
const PERI = '#93a3e4';
const ROYAL = '#3a64d2';
const CREAM = '#e8e2cd';
const RUST = '#c4472b';

// Silkscreen text centred on a point (the renderer's y is the baseline).
const text = (x, y, t, size = 13, rest = {}) => decor.push({ t: 'text', x, y: r1(y + size * 0.35), text: t, size, anchor: 'middle', ...rest });
const T = (px, py, t, size, rest) => text(X(px), Y(py), t, size, rest);
const LT = (px, py, t, size, rest) => text(LX(px), LY(py), t, size, rest);
const line = (x1, y1, x2, y2, w = 2.4, rest = {}) => decor.push({ t: 'line', x1, y1, x2, y2, w, ...rest });
const L = (px1, py1, px2, py2, w, rest) => line(X(px1), Y(py1), X(px2), Y(py2), w, rest);

// ── Rows (photo y, lean removed) ──────────────────────────────────────────
const HL1 = 332, HL2 = 342; // the double rule the top-row section names sit between
const LBL = 361; // top-row control names
const FC = 401.5, FLEN = 103; // fader travel centre (photo) and length (view)
const KN = 398; // top-row knobs
const WB = [380, 394, 408, 422]; // the columns of small waveform buttons
const PB = [394, 409]; // the pairs of small selector buttons
const FR1 = 455, FR2 = 549; // the frame round the lower row
const BAR = 468; // the coloured name bars
const LB2 = 487; // lower-row control names
const BY = 514; // lower-row buttons and knobs

// ── Faceplate artwork ─────────────────────────────────────────────────────
// Ventilation slots along the top, the Roland logo, the name, and the plate's background.
for (let px = 86; px <= 1498; px += 4.2) decor.push({ t: 'rect', x: X(px), y: Y(254), w: 3.4, h: 40, r: 1, fill: '#0b0b0c', hw: true });
decor.push({ t: 'rect', x: 20, y: 0, w: 652, h: VIEW_H, fill: '#121315', hw: true });
decor.push({ t: 'rect', x: 26, y: LY(608), w: 640, h: VIEW_H - LY(608) - 8, r: 6, fill: PANEL, stroke: '#2a2b2e', sw: 2, hw: true });
decor.push({ t: 'rect', x: 664, y: 0, w: 12, h: VIEW_H, fill: '#0a0a0b', hw: true });
text(X(215), Y(321), 'Roland', 44, { weight: 700, spacing: '-0.01em' });
decor.push({ t: 'rect', x: X(170), y: Y(315), w: 34, h: 30, r: 7, fill: 'none', stroke: INK, sw: 3.4 });
text(X(176), Y(321.5), 'R', 26, { weight: 700 });
text(X(1362), Y(314), 'JUPITER-6', 80, { weight: 700, spacing: '0.02em', fill: '#e2e3e8' });
text(LX(130), LY(588), 'LEFT OF THE KEYBOARD', 15, { fill: '#8d8e90', weight: 500, hw: true });

// The top row: a double rule with each section's name between the lines, and a divider down from it.
L(84, HL1, 1494, HL1, 2.6);
L(84, HL2, 1494, HL2, 2.6);
const TOP = [[153, 277, 'LFO-1'], [277, 373, 'VCO MOD'], [373, 466, 'PWM'], [466, 642, 'VCO-1'], [642, 811, 'VCO-2'],
  [811, 889, 'MIXER'], [889, 1107, 'VCF'], [1107, 1188, 'VCA'], [1188, 1349, 'ENV-1'], [1349, 1494, 'ENV-2']];
TOP.forEach(([a, b, name]) => T((a + b) / 2, (HL1 + HL2) / 2, name, 16, { weight: 700 }));
// Only the main sections have a divider all the way down; within them the name boxes are split on the rule alone.
[153, 277, 811, 889, 1107, 1188].forEach((px) => L(px, HL1, px, 448, 2.6));
[373, 466, 642, 1349].forEach((px) => L(px, HL1, px, HL2, 2.6));

// The lower row: a frame, the coloured bars with the section names, hatched blocks where there is no name.
decor.push({ t: 'rect', x: X(85), y: Y(FR1), w: X(1494) - X(85), h: Y(FR2) - Y(FR1), r: 3, fill: 'none', stroke: INK, sw: 2.6 });
[194, 663, 812, 1330, 1383].forEach((px) => L(px, FR1, px, FR2, 2.6));
const bar = (a, b, name, fill) => {
  decor.push({ t: 'rect', x: X(a), y: Y(BAR - 5), w: X(b) - X(a), h: 24, r: 1, fill });
  if (name) T((a + b) / 2, BAR, name, 15.5, { weight: 700, fill: '#ffffff' });
};
bar(197, 308, 'GLIDE', BLUE);
bar(310, 466, 'ARPEGGIO', BLUE);
bar(468, 618, 'ASSIGN', BLUE);
bar(666, 745, 'KEY MODE', ORANGE);
bar(748, 810, 'PANEL MODE', ORANGE);
bar(873, 1016, 'BANK', BLUE);
bar(1019, 1202, 'NUMBER', BLUE);
const hatch = (a, b) => { for (let px = a + 1.5; px < b; px += 3.4) decor.push({ t: 'rect', x: X(px), y: Y(BAR - 5), w: 3.6, h: 24, fill: INK, hw: true }); };
hatch(87, 192);
hatch(620, 661);
hatch(814, 870);
hatch(1204, 1327);
T(1452, 449, 'JP-6', 15, { weight: 700 });

// ── Control helpers ───────────────────────────────────────────────────────
const S10 = { ticks: 11, labels: [{ at: 0, text: '0' }, { at: 10, text: '10' }], size: 11, numR: 1.55, tickR: 1.22 };
const knob = (id, x, y, rest) => controls.push({
  id, type: 'knob', x, y, r: 26, style: 'vcs3', cap: '#d3d0c4', kind: 'cont', min: 0, max: 10, def: 0, labelPos: 'none', scale: S10, ...rest,
});
const fader = (id, px, rest) => controls.push({
  id, type: 'fader', x: X(px), y: Y(FC), len: FLEN, orient: 'v', ticks: 11, pad: 10, cap: 'grey', kind: 'cont', min: 0, max: 10, def: 0,
  labelPos: 'none', ...rest,
});
/** The 10 · 5 · 0 printed beside a group of faders, on the left (side −1) or right (+1). */
const faderNums = (px, side) => [[10, 0], [5, 0.5], [0, 1]].forEach(([n, f]) => text(X(px) + side * 34, Y(FC) - FLEN / 2 + f * FLEN, String(n), 11));
/** A small backlit button: the cap glows red when it is on (the waveform and selector buttons). */
const lampBtn = (id, px, py, rest) => controls.push({ id, type: 'button', x: X(px), y: Y(py), w: 36, h: 20, lamp: 'red', kind: 'bool', def: false, labelPos: 'none', ...rest });
/** Two or more small backlit buttons that choose one of their options. */
const lampSelect = (id, opts, rest) => controls.push({
  id, type: 'select', x: opts[0][1], y: opts[0][2], w: 36, h: 20, lamp: 'red', kind: 'enum', labelPos: 'none',
  options: opts.map(([v, x, y, label]) => ({ v, x, y, label })), ...rest,
});
// The coloured square buttons, each with a lamp window at the top of its cap (`capLamp`).
const BW = 46, BH = 44;
const capTop = (x, y, color, lit, w = BW, h = BH) => {
  decor.push({ t: 'rect', x: x - w / 2 + 2, y: y - h / 2 + 3, w, h, r: 3, fill: '#000', hw: true });
  decor.push({ t: 'rect', x: x - w / 2, y: y - h / 2, w, h, r: 3, fill: color, stroke: '#0008', sw: 1.2 });
  decor.push({ t: 'led', x, y: y - h / 2 + 6, r: 3.2, color: 'red', ...(lit ? { litWhen: lit } : {}) });
};
const capBtn = (id, x, y, color, rest, w = BW, h = BH) => {
  controls.push({ id, type: 'button', x, y, w, h, capColor: color, capLamp: true, kind: 'bool', def: false, labelPos: 'none', ...rest });
};
/** A coloured button that is printed but not modelled: cap and lamp as artwork. `on` lights its lamp for good. */
const deadBtn = (x, y, color, on, w = BW, h = BH) => capTop(x, y, color, on ? 'power' : null, w, h);
/** A knob printed but not modelled. */
const deadKnob = (x, y) => {
  decor.push({ t: 'circle', x: x + 3, y: y + 5, r: 27, fill: '#000', stroke: 'none', sw: 0 });
  decor.push({ t: 'circle', x, y, r: 27.5, fill: '#121214', stroke: '#000', sw: 1.5 });
  decor.push({ t: 'circle', x, y, r: 15, fill: '#d3d0c4', stroke: '#0008', sw: 1 });
  line(x, y - 18, x, y - 27, 2.6, { stroke: '#f4f4ef' });
};
const ticks = (x, y, labels = ['0', '10']) => {
  for (let i = 0; i <= 10; i++) {
    const a = ((-150 + 30 * i) * Math.PI) / 180;
    line(r1(x + Math.sin(a) * 33), r1(y - Math.cos(a) * 33), r1(x + Math.sin(a) * 40), r1(y - Math.cos(a) * 40), 2);
  }
  if (labels) {
    text(r1(x + Math.sin((-150 * Math.PI) / 180) * 50), r1(y - Math.cos((-150 * Math.PI) / 180) * 50), labels[0], 11);
    text(r1(x + Math.sin((150 * Math.PI) / 180) * 50), r1(y - Math.cos((150 * Math.PI) / 180) * 50), labels[1], 11);
  }
};

// ══ Top row ═══════════════════════════════════════════════════════════════
// VOLUME
T(120, LBL, 'VOLUME', 13.5);
knob('out.volume', X(113), Y(KN), {
  def: 7, module: 'out', fmt: pct,
  help: 'Master output level. It is not stored with a patch.',
});

// LFO-1
decor.push({ t: 'led', x: X(179), y: Y(347), r: 4, color: 'red', litWhen: 'lfo' });
T(179, LBL, 'RATE', 13);
T(203, LBL, 'DELAY', 13);
faderNums(179, -1);
faderNums(203, 1);
fader('lfo.rate', 179, {
  def: 5, label: 'RATE', name: 'LFO-1 rate', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of LFO-1, from one cycle every 25 seconds up to 100 Hz. The lamp above it flashes at the rate. Around 5 to 6 is a natural vibrato.',
});
fader('lfo.delay', 203, {
  def: 0, label: 'DELAY', name: 'LFO-1 delay time', module: 'lfo', fmt: (v) => (v <= 0 ? 'none' : fmtTime(lfoDelay(v))),
  help: 'How long LFO-1 waits after each new note before its vibrato or wah fades in, up to about 2.5 seconds. It does not delay the pulse-width or VCA modulation.',
});
T(238, LBL, 'WAVEFORM', 13);
lampSelect('lfo.wave', [['tri', X(238), Y(WB[0]), 'Triangle'], ['saw', X(238), Y(WB[1]), 'Sawtooth'], ['sq', X(238), Y(WB[2]), 'Square'], ['rnd', X(238), Y(WB[3]), 'Random']], {
  def: 'tri', label: 'LFO-1 waveform', name: 'LFO-1 waveform', module: 'lfo',
  help: 'LFO-1’s shape. Triangle is a smooth wobble, sawtooth rises and drops back, square jumps between two values (a trill), and RANDOM steps to a new random value each cycle.',
});
decor.push({ t: 'wave', x: X(252), y: Y(WB[0]), size: 11, shape: 'tri' }, { t: 'wave', x: X(252), y: Y(WB[1]), size: 11, shape: 'saw' },
  { t: 'wave', x: X(252), y: Y(WB[2]), size: 11, shape: 'sq' });
text(X(250) + 6, Y(WB[3]), 'RANDOM', 9.5, { anchor: 'start' });

// VCO MOD
T(303, LBL, 'LFO', 13);
T(325, LBL, 'ENV-1', 13);
faderNums(303, -1);
faderNums(325, 1);
fader('vcomod.lfo', 303, {
  label: 'VCO MOD LFO', name: 'VCO MOD LFO (vibrato depth)', module: 'mod', fmt: (v) => (v <= 0 ? 'off' : fmtSemi(120 * Math.pow(v / 10, 2.5))),
  help: 'How far LFO-1 moves the pitch of the VCOs lit beside it: a little is vibrato, turned up it becomes a siren. The manual gives up to 10 octaves at full.',
});
fader('vcomod.env', 325, {
  label: 'VCO MOD ENV-1', name: 'VCO MOD ENV-1 (pitch envelope depth)', module: 'mod', fmt: (v) => (v <= 0 ? 'off' : fmtSemi(60 * Math.pow(v / 10, 2))),
  help: 'How far ENV-1 moves the pitch of the VCOs lit beside it, so each note can swoop up or down as it starts. Up to 5 octaves.',
});
lampBtn('vcomod.vco1', 355, PB[0], {
  def: true, label: 'VCO-1', name: 'VCO MOD to VCO-1', module: 'mod',
  help: 'Lets the VCO MOD faders move VCO-1’s pitch. With both buttons lit, both VCOs move together.',
});
lampBtn('vcomod.vco2', 355, PB[1], {
  def: true, label: 'VCO-2', name: 'VCO MOD to VCO-2', module: 'mod',
  help: 'Lets the VCO MOD faders move VCO-2’s pitch. With only one VCO moving, the two drift out of tune with each other.',
});
T(355, PB[0] - 9, 'VCO-1', 9.5);
T(355, PB[1] + 9, 'VCO-2', 9.5);

// PWM
T(397, LBL, 'PW', 13);
T(419, LBL, 'PWM', 13);
faderNums(397, -1);
faderNums(419, 1);
L(428, LBL, 448, LBL, 2);
L(448, LBL, 448, PB[0] - 14, 2);
fader('pwm.pw', 397, {
  label: 'PW', name: 'Pulse width', module: 'osc', fmt: (v) => `${Math.round(50 - 4.8 * v)} %`,
  help: 'Width of the pulse wave on both VCOs. At 0 it is a square (50 %), hollow like a clarinet; turned up it narrows to a thin, nasal buzz, and at 10 it all but disappears.',
});
fader('pwm.depth', 419, {
  label: 'PWM', name: 'PWM depth', module: 'mod', fmt: pct,
  help: 'How far the pulse width is swept by the source lit beside it, LFO-1 or ENV-1. Only heard on a pulse wave.',
});
lampSelect('pwm.src', [['env1', X(448), Y(PB[0]), 'ENV-1'], ['lfo', X(448), Y(PB[1]), 'LFO']], {
  def: 'lfo', label: 'PWM source', name: 'PWM source', module: 'mod',
  help: 'What sweeps the pulse width: LFO-1 for a steady shimmer, or ENV-1 for a width that changes over each note.',
});
T(448, PB[0] - 9, 'ENV-1', 9.5);
T(448, PB[1] + 9, 'LFO', 9.5);

// VCO-1
T(502, 350.5, 'CROSS MOD', 11);
L(491, 355, 491, 353, 2);
L(491, 353, 513, 353, 2);
L(513, 353, 513, 355, 2);
T(491, LBL, 'MANUAL', 11.5);
T(513, LBL, 'ENV-1', 11.5);
faderNums(491, -1);
faderNums(513, 1);
fader('vco1.xmod', 491, {
  label: 'CROSS MOD MANUAL', name: 'Cross mod (manual)', module: 'osc', fmt: pct,
  help: 'How hard VCO-2 shakes VCO-1’s pitch. At audio rates this is frequency modulation: bells, clangs and metallic tones. With VCO-2 at LOW it is a vibrato from VCO-2 instead.',
});
fader('vco1.xmodEnv', 513, {
  label: 'CROSS MOD ENV-1', name: 'Cross mod (ENV-1)', module: 'osc', fmt: pct,
  help: 'How far ENV-1 adds to the cross mod over each note, so the metallic edge can flare at the start and die away.',
});
T(557, LBL, 'RANGE', 13);
knob('vco1.range', X(557), Y(KN), {
  max: 48, def: 24, step: 1, name: 'VCO-1 range', module: 'osc', fmt: v1Name,
  scale: { ticks: 0, labels: FEET.map((t, i) => ({ at: i * 12, text: t })), size: 11, numR: 1.62 },
  help: 'Pitch of VCO-1 in half steps, from 32’ (two octaves down) to 2’ (two octaves up). 8’ plays at the pitch of the key.',
});
T(592, LBL, 'WAVEFORM', 13);
const V1W = [['tri', 'Triangle', 'tri'], ['saw', 'Sawtooth', 'saw'], ['pulse', 'Pulse', 'npulse'], ['square', 'Square', 'sq']];
V1W.forEach(([w, name, glyph], i) => {
  lampBtn(`vco1.${w}`, 592, WB[i], {
    def: w === 'saw', label: name.toUpperCase(), name: `VCO-1 ${name.toLowerCase()}`, module: 'osc',
    help: w === 'square'
      ? 'Adds VCO-1’s square wave, always 50 %, whatever PW says. PULSE and SQUARE cannot play together: with both lit, PULSE wins.'
      : w === 'pulse'
        ? 'Adds VCO-1’s pulse wave, its width set by PW and swept by PWM. PULSE and SQUARE cannot play together: with both lit, PULSE wins.'
        : `Adds VCO-1’s ${name.toLowerCase()} wave. The waveform buttons can be combined: two lit play both waves at once.`,
  });
  decor.push({ t: 'wave', x: X(606), y: Y(WB[i]), size: 11, shape: glyph });
});

// SYNC (between VCO-1 and VCO-2)
T(640, 365, 'SYNC', 13);
lampBtn('vco.sync12', 640, PB[0], {
  label: 'SYNC 1→2', name: 'Sync VCO-2 to VCO-1', module: 'osc',
  help: 'Hard sync: VCO-2 restarts every time VCO-1 does, so VCO-2’s RANGE changes its tone, not its note. If both sync buttons are lit, this one wins.',
});
lampBtn('vco.sync21', 640, PB[1], {
  label: 'SYNC 2→1', name: 'Sync VCO-1 to VCO-2', module: 'osc',
  help: 'Hard sync the other way round: VCO-1 restarts every time VCO-2 does, so VCO-2 sets the note and VCO-1’s RANGE and the cross mod change the tone.',
});
text(X(640) + 22, Y(PB[0]), '1→2', 9, { anchor: 'start' });
text(X(640) + 22, Y(PB[1]), '2→1', 9, { anchor: 'start' });

// VCO-2
T(692, LBL, 'RANGE', 13);
knob('vco2.range', X(692), Y(KN), {
  max: 72, def: 36, step: 1, name: 'VCO-2 range', module: 'osc', fmt: v2Name,
  scale: { ticks: 0, labels: [{ at: 0, text: 'LOW' }, ...FEET.map((t, i) => ({ at: 12 + i * 12, text: t })), { at: 72, text: 'HIGH' }], size: 10.5, numR: 1.66 },
  help: 'Pitch of VCO-2. In the middle it steps in half steps from 32’ to 2’. Turned fully left into LOW it stops following the keys and runs at 1.5 to 50 Hz, as a modulator for the cross mod. Right of 2’, HIGH carries on up to 1/2’ (four octaves up) for cross-mod and sync tones.',
});
T(740, LBL, 'TUNE', 13);
knob('vco2.tune', X(740), Y(KN), {
  min: -5, max: 5, def: 0, name: 'VCO-2 tune', module: 'osc', fmt: cents,
  scale: { ticks: 11, labels: [{ at: -5, text: '−' }, { at: 0, text: '0' }, { at: 5, text: '+' }], size: 12, numR: 1.55, tickR: 1.22 },
  help: 'Fine tuning of VCO-2 between the half steps, up to 50 cents either way. A few cents off VCO-1 makes the two beat and thickens the sound.',
});
T(776, LBL, 'WAVEFORM', 13);
const V2W = [['tri', 'Triangle', 'tri'], ['saw', 'Sawtooth', 'saw'], ['pulse', 'Pulse', 'npulse'], ['noise', 'Noise', null]];
V2W.forEach(([w, name, glyph], i) => {
  lampBtn(`vco2.${w}`, 776, WB[i], {
    def: false, label: name.toUpperCase(), name: `VCO-2 ${name.toLowerCase()}`, module: 'osc',
    help: w === 'noise'
      ? 'Adds white noise in VCO-2’s place in the mixer, for breath, wind and percussion. It can play together with VCO-2’s other waves.'
      : `Adds VCO-2’s ${name.toLowerCase()} wave. The waveform buttons can be combined.${w === 'pulse' ? ' Its width follows PW and PWM.' : ''}`,
  });
  if (glyph) decor.push({ t: 'wave', x: X(790), y: Y(WB[i]), size: 11, shape: glyph });
  else text(X(788), Y(WB[i]), 'NOISE', 9.5, { anchor: 'start' });
});

// MIXER
T(850, 377, 'MIX', 11);
text(X(832) - 6, Y(419), 'VCO-1', 10.5, { anchor: 'end' });
text(X(869) + 6, Y(419), 'VCO-2', 10.5, { anchor: 'start' });
knob('mix.balance', X(850), Y(KN), {
  def: 2.5, name: 'Mix (VCO-1 / VCO-2)', module: 'mixer', scale: { ticks: 11 },
  fmt: (v) => (Math.abs(v - 5) < 0.2 ? 'equal' : v < 5 ? `VCO-1 + ${Math.round(v * 20)} % VCO-2` : `VCO-2 + ${Math.round((10 - v) * 20)} % VCO-1`),
  help: 'The balance of the two VCOs into the filter. Fully left is VCO-1 alone, fully right VCO-2 alone, and the middle both at full level.',
});

// VCF
T(915, LBL, 'MODE', 13);
lampBtn('vcf.hpf', 917, PB[0], {
  label: 'HPF', name: 'VCF high-pass', module: 'filter',
  help: 'Switches the filter to high-pass: it cuts the lows and keeps the highs, for thin, bright sounds. Lit together with LPF it is band-pass.',
});
lampBtn('vcf.lpf', 917, PB[1], {
  def: true, label: 'LPF', name: 'VCF low-pass', module: 'filter',
  help: 'Switches the filter to low-pass, the usual setting: it keeps the lows and cuts the highs. Lit together with HPF it is band-pass. With neither lit the filter stays low-pass.',
});
T(917, PB[0] - 9, 'HPF', 9.5);
T(917, PB[1] + 9, 'LPF', 9.5);
L(906, PB[0], 902, PB[0], 2);
L(902, PB[0], 902, PB[1], 2);
L(906, PB[1], 902, PB[1], 2);
text(X(902) - 6, Y((PB[0] + PB[1]) / 2), 'BPF', 9.5, { anchor: 'end' });
T(955, LBL, 'FREQ', 13);
T(978, LBL, 'RES', 13);
faderNums(955, -1);
faderNums(978, 1);
fader('vcf.freq', 955, {
  def: 10, label: 'FREQ', name: 'VCF cutoff frequency', module: 'filter', fmt: (v) => fmtHz(vcfHz(v)),
  help: 'The filter’s cutoff. In low-pass, down is darker and duller; in high-pass, up is thinner. The envelope and LFO move it from here.',
});
fader('vcf.res', 978, {
  label: 'RES', name: 'VCF resonance', module: 'filter', fmt: pct,
  help: 'A boost right at the cutoff that makes sweeps sound vocal and squelchy. Near the top the filter whistles on its own.',
});
lampSelect('vcf.envSel', [['env1', X(1010), Y(PB[0]), 'ENV-1'], ['env2', X(1010), Y(PB[1]), 'ENV-2']], {
  def: 'env1', label: 'VCF ENV select', name: 'Filter envelope (ENV-1 or ENV-2)', module: 'filter',
  help: 'Which envelope the ENV fader sends to the filter: ENV-1 (which can be turned upside down) or ENV-2, the one that also shapes the volume.',
});
T(1010, PB[0] - 9, 'ENV-1', 9.5);
T(1010, PB[1] + 9, 'ENV-2', 9.5);
T(1038, LBL, 'ENV', 13);
T(1059, LBL, 'LFO', 13);
T(1081, LBL, 'KYBD', 13);
faderNums(1038, -1);
faderNums(1081, 1);
fader('vcf.env', 1038, {
  label: 'ENV', name: 'VCF envelope depth', module: 'filter', fmt: pct,
  help: 'How far the chosen envelope opens the filter on each note, up to about 9 octaves here (the manual says 10 or more).',
});
fader('vcf.lfo', 1059, {
  label: 'LFO', name: 'VCF LFO depth', module: 'filter', fmt: pct,
  help: 'How far LFO-1 sweeps the cutoff: a slow wah, or a growl at faster rates.',
});
fader('vcf.kybd', 1081, {
  label: 'KYBD', name: 'VCF keyboard follow', module: 'filter', fmt: kfPct,
  help: 'How much the cutoff follows the keys, up to 120 %. Up keeps high notes as bright as low ones; at about 8 a self-oscillating filter plays in tune.',
});

// VCA
T(1135, 357, 'ENV-2', 11.5);
T(1135, 366, 'LEVEL', 11.5);
T(1162, LBL, 'LFO', 13);
faderNums(1135, -1);
faderNums(1162, 1);
fader('vca.level', 1135, {
  def: 8, label: 'ENV-2 LEVEL', name: 'VCA level', module: 'amp', fmt: pct,
  help: 'The level of the patch: how far ENV-2 opens the VCA. Use it to balance one sound against another.',
});
fader('vca.lfo', 1162, {
  label: 'VCA LFO', name: 'VCA LFO depth (tremolo)', module: 'amp', fmt: pct,
  help: 'How far LFO-1 moves the volume up and down: tremolo. LFO-1’s DELAY does not apply here.',
});

// ENV-1 and ENV-2
T(1220, LBL, 'POLARITY', 11.5);
lampSelect('env1.polarity', [['normal', X(1220), Y(PB[0]), 'Normal'], ['inverted', X(1220), Y(PB[1]), 'Inverted']], {
  def: 'normal', label: 'ENV-1 POLARITY', name: 'ENV-1 polarity', module: 'env',
  help: 'Turns ENV-1 upside down. Inverted, everything ENV-1 drives moves the other way: the filter closes instead of opening, the pitch swoops down instead of up.',
});
decor.push({ t: 'wave', x: X(1220), y: Y(PB[0] - 10), size: 10, shape: 'adsr' });
decor.push({ t: 'path', d: `M${X(1220) - 10} ${Y(PB[1] + 6)} L${X(1220) - 5} ${Y(PB[1] + 11)} L${X(1220) + 2} ${Y(PB[1] + 9)} L${X(1220) + 10} ${Y(PB[1] + 6)}`, w: 2 });
const STAGES = [['attack', 'A'], ['decay', 'D'], ['sustain', 'S'], ['release', 'R']];
const ENVS = [
  ['env1', 'ENV-1', [1243, 1263, 1283, 1303], 1331, [0, 5, 4, 4],
    'ENV-1 drives VCO MOD, PWM, the cross mod and, if chosen, the filter.'],
  ['env2', 'ENV-2', [1371, 1391, 1411, 1430], 1460, [0, 5, 10, 4],
    'ENV-2 always shapes the volume, and can drive the filter as well.'],
];
ENVS.forEach(([e, name, xs, kx, defs, role]) => {
  if (e === 'env2') faderNums(xs[0], -1); // ENV-1's POLARITY buttons sit where its numbers would be
  faderNums(kx, 1);
  STAGES.forEach(([stage, letter], i) => {
    T(xs[i], LBL, letter, 13);
    const isTime = stage !== 'sustain';
    const tf = stage === 'attack' ? attTime : drTime;
    fader(`${e}.${stage}`, xs[i], {
      def: defs[i], label: `${name} ${letter}`, name: `${name} ${stage}`, module: 'env',
      fmt: isTime ? (v) => fmtTime(tf(v)) : pct,
      help: `${name} ${stage}: ${{
        attack: 'how long it takes to rise to full after a key is pressed, up to 18 seconds.',
        decay: 'how long it takes to fall from the peak to the sustain level, up to 20 seconds.',
        sustain: 'the level it holds while the key is held down.',
        release: 'how long it takes to fade to nothing after the key is let go, up to 20 seconds.',
      }[stage]} ${role}`,
    });
  });
  T(kx, 355, 'KEY', 11.5);
  T(kx, 364, 'FOLLOW', 11.5);
  fader(`${e}.kf`, kx, {
    label: `${name} KEY FOLLOW`, name: `${name} key follow`, module: 'env', fmt: kfPct,
    help: `Makes ${name} faster on higher notes and slower on lower ones, as on a piano, where high notes die away sooner. At 0 every note has the same times.`,
  });
});

// ══ Lower row ═════════════════════════════════════════════════════════════
// BALANCE and BENDER: printed, not modelled (one patch here).
T(119, LB2, 'BALANCE', 12);
deadKnob(X(115), Y(BY));
ticks(X(115), Y(BY), null);
text(X(115) - 44, Y(BY) + 42, 'LOWER', 9.5);
text(X(115) + 44, Y(BY) + 42, 'UPPER', 9.5);
T(173, LB2, 'BENDER', 12);
deadBtn(X(173), Y(BY), CREAM, false);

// GLIDE
T(218, LB2, 'TIME', 12);
knob('glide.time', X(218), Y(BY), {
  def: 3, name: 'Glide time', module: 'glide', fmt: (v) => (v <= 0 ? 'instant' : `${fmtTime(glideTime(v))}/oct`),
  help: 'How long the pitch takes to slide from one note to the next, up to 1.6 seconds an octave. Heard only with PORTAMENTO or GLISSANDO lit.',
});
T(268, LB2 - 5, 'PORTA-', 10.5);
T(268, LB2 + 1, 'MENTO', 10.5);
T(290, LB2 - 5, 'GLIS-', 10.5);
T(290, LB2 + 1, 'SANDO', 10.5);
capBtn('glide.porta', X(268), Y(BY), LILAC, {
  label: 'PORTAMENTO', module: 'glide',
  help: 'Turns on a smooth slide between notes, at the speed set by TIME. Every voice slides from the last note it played.',
});
capBtn('glide.gliss', X(290), Y(BY), LILAC, {
  label: 'GLISSANDO', module: 'glide',
  help: 'On the hardware the pitch steps through the half steps between notes instead of sliding smoothly. Here it slides smoothly, like PORTAMENTO.',
});

// ARPEGGIO
T(330, LB2, 'RATE', 12);
knob('arp.rate', X(330), Y(BY), {
  def: 4, name: 'Arpeggio rate', module: 'mode', fmt: (v) => `${fmtHz(arpHz(v))} (${Math.round(arpHz(v) * 15)} BPM)`,
  help: 'Speed of the arpeggio, from 1 to 25 notes a second.',
});
T(377, LB2, 'RANGE', 12);
L(388, LB2, 398, LB2, 2);
L(398, LB2, 398, 499, 2);
capBtn('arp.range', X(377), Y(BY), LILAC, {
  kind: 'enum', def: 1, name: 'Arpeggio range',
  options: [1, 2, 3, 4].map((n) => ({ v: n, label: `${n} OCT` })), label: 'RANGE', module: 'mode',
  help: 'Steps the arpeggio range through 1, 2, 3 and 4 octaves; the lamps beside it show which. The held notes are played once in each octave.',
});
[4, 3, 2, 1].forEach((n, i) => {
  decor.push({ t: 'led', x: X(394), y: Y(504 + i * 8.7), r: 3.4, color: 'red', litWhen: { id: 'arp.range', eq: n } });
  text(X(400), Y(504 + i * 8.7), String(n), 10, { anchor: 'start' });
});
T(427, LB2, 'UP', 12);
T(448, LB2, 'DOWN', 12);
capBtn('arp.up', X(427), Y(BY), LILAC, {
  label: 'UP', name: 'Arpeggio up', module: 'mode',
  help: 'Starts the arpeggio: hold a chord and its notes play one at a time from the bottom up. With DOWN lit as well it plays up and down.',
});
capBtn('arp.down', X(448), Y(BY), LILAC, {
  label: 'DOWN', name: 'Arpeggio down', module: 'mode',
  help: 'Starts the arpeggio from the top down. With UP lit as well it plays up and down.',
});
decor.push({ t: 'path', d: `M${X(427)} ${Y(530)} V${Y(536)} H${X(448)} V${Y(530)}`, w: 2, stroke: RUST });

// ASSIGN
T(487, LB2 - 5, 'UNISON', 10.5);
T(487, LB2 + 1, 'DETUNE', 10.5);
knob('voice.detune', X(487), Y(BY), {
  def: 3, name: 'Unison detune', module: 'mode', fmt: (v) => `±${Math.round(v * 5)} cents`,
  help: 'How far apart the stacked voices are tuned in UNISON and SOLO UNISON, up to 50 cents. More is wider and more chorused; at 0 they lock together.',
});
T(535, LB2, 'SOLO', 12);
capBtn('voice.solo', X(535), Y(BY), LILAC, {
  label: 'SOLO', module: 'mode',
  help: 'Plays one note at a time, like a mono synth: the last key wins. With UNISON lit as well it is SOLO UNISON, all six voices stacked on the one note.',
});
[[557, 'UNISON'], [578, 'POLY-1'], [600, 'POLY-2']].forEach(([px, t]) => T(px, LB2, t, 11.5));
controls.push({
  id: 'voice.assign', type: 'select', x: X(557), y: Y(BY), w: BW, h: BH, capColor: LILAC, kind: 'enum', labelPos: 'none',
  options: [['unison', 557, 'UNISON'], ['poly1', 578, 'POLY-1'], ['poly2', 600, 'POLY-2']].map(([v, px, label]) => ({ v, x: X(px), y: Y(BY), label })),
  def: 'poly1', label: 'ASSIGN', name: 'Assign mode', module: 'mode',
  help: 'How keys are given to the six voices. POLY-1 and POLY-2 play a voice per key. UNISON doubles the voices up on each key, detuned by UNISON DETUNE. Lit together with SOLO, UNISON stacks all six on one note.',
});
decor.push({ t: 'path', d: `M${X(535)} ${Y(530)} V${Y(536)} H${X(557)} V${Y(530)}`, w: 2, stroke: RUST });
T(642, LB2, 'HOLD', 12);
capBtn('arp.hold', X(642), Y(BY), LILAC, {
  label: 'HOLD', name: 'Hold', module: 'mode',
  help: 'Latches the arpeggio, so it keeps playing after you let go; a new chord replaces the held one. On the hardware HOLD also sustains notes without the arpeggio, which is not modelled here.',
});

// KEY MODE and PANEL MODE: printed, not modelled (WHOLE is what this app plays).
T(685, LB2 - 5, 'SPLIT-1', 10.5);
T(685, LB2 + 1, '4-2', 10.5);
T(707, LB2 - 5, 'SPLIT-2', 10.5);
T(707, LB2 + 1, '2-4', 10.5);
T(728, LB2, 'WHOLE', 11.5);
deadBtn(X(685), Y(BY), PERI, false);
deadBtn(X(707), Y(BY), PERI, false);
deadBtn(X(728), Y(BY), PERI, true);
T(770, LB2, 'LOWER', 11.5);
T(791, LB2, 'UPPER', 11.5);
deadBtn(X(770), Y(BY), PERI, false);
deadBtn(X(791), Y(BY), PERI, true);

// Memory: PATCH PRESET, BANK A–F, NUMBER 1–8, MANUAL, PROTECT, WRITE, TAPE MEMORY. Printed only.
T(852, LB2, 'PATCH PRESET', 11);
deadBtn(X(852), Y(BY), CREAM, false);
['A', 'B', 'C', 'D', 'E', 'F'].forEach((t, i) => {
  const px = [893, 914, 935, 957, 977, 998][i];
  T(px, LB2, t, 12);
  deadBtn(X(px), Y(BY), ROYAL, false);
});
[1038, 1059, 1080, 1101, 1122, 1142, 1162, 1183].forEach((px, i) => {
  T(px, LB2, String(i + 1), 12);
  deadBtn(X(px), Y(BY), CREAM, false);
});
decor.push({ t: 'path', d: `M${X(852)} ${Y(530)} V${Y(536)} H${X(998)} V${Y(530)}`, w: 2, stroke: RUST });
[893, 914, 935, 957, 977].forEach((px) => L(px, 530, px, 536, 2, { stroke: RUST }));
decor.push({ t: 'rect', x: X(902), y: Y(539), w: X(968) - X(902), h: 17, r: 2, fill: 'none', stroke: RUST, sw: 1.6 });
text(X(935), Y(543.5), 'PATCH PRESET BANK', 9, { fill: RUST, weight: 700 });
[[1142, 'SAVE'], [1162, 'VERIFY'], [1183, 'LOAD']].forEach(([px, t]) => {
  decor.push({ t: 'rect', x: X(px) - 23, y: Y(539), w: 46, h: 17, r: 2, fill: 'none', stroke: RUST, sw: 1.6 });
  text(X(px), Y(543.5), t, 8.5, { fill: RUST, weight: 700 });
  L(px, 530, px, 539, 2, { stroke: RUST });
});
decor.push({ t: 'path', d: `M${X(1142)} ${Y(534)} H${X(1358)} V${Y(527)}`, w: 2, stroke: RUST });
T(1223, LB2, 'MANUAL', 11.5);
deadBtn(X(1223), Y(BY), CREAM, true);
T(1276, LB2, 'PROTECT', 11);
T(1298, LB2, 'WRITE', 11.5);
decor.push({ t: 'rect', x: X(1276) - 9, y: Y(BY) - 4, w: 18, h: 8, r: 1, fill: '#3a1a14' });
deadBtn(X(1298), Y(BY), ROYAL, false);
T(1358, LB2, 'TAPE MEMORY', 11);
deadBtn(X(1358), Y(BY), ROYAL, false);

// TUNE (the auto-tune button) and MASTER TUNE
T(1410, LB2, 'TUNE', 12);
deadBtn(X(1410), Y(BY), CREAM, false);
T(1463, LB2 - 5, 'MASTER', 10.5);
T(1463, LB2 + 1, 'TUNE', 10.5);
knob('out.tune', X(1463), Y(BY), {
  min: -5, max: 5, def: 0, name: 'Master tune', module: 'out', fmt: cents,
  scale: { ticks: 11, labels: [{ at: -5, text: '−' }, { at: 0, text: '0' }, { at: 5, text: '+' }], size: 12, numR: 1.55, tickR: 1.22 },
  help: 'Tunes the whole synth up or down, up to 50 cents either way.',
});

// ══ The plate left of the keys: BEND and LFO-2 ════════════════════════════
const PH1 = 617, PH2 = 629;
line(LX(73), LY(PH1), LX(318), LY(PH1), 2.6);
line(LX(73), LY(PH2), LX(318), LY(PH2), 2.6);
line(LX(161), LY(PH1), LX(161), LY(PH2), 2.6);
LT(117, 623, 'BEND', 16, { weight: 700 });
LT(240, 623, 'LFO-2', 16, { weight: 700 });
LT(105, 639, 'VCO', 12);
LT(135, 639, 'VCF', 12);
const plateFader = (id, px, rest) => controls.push({
  id, type: 'fader', x: LX(px), y: LY(671), len: 100, orient: 'v', ticks: 11, pad: 10, cap: 'grey', kind: 'cont', min: 0, max: 10, def: 0, labelPos: 'none', ...rest,
});
plateFader('bend.vco', 105, {
  def: 2, label: 'BEND VCO', name: 'Bend depth (VCOs)', module: 'util', fmt: (v) => fmtSemi(12 * (v / 10)),
  help: 'How far the bender moves the pitch of the VCOs lit below, up to an octave. In this app the mod wheel beside the keyboard stands in for the bender pushed to the right.',
});
plateFader('bend.vcf', 135, {
  label: 'BEND VCF', name: 'Bend depth (filter)', module: 'util', fmt: (v) => `${(5 * v / 10).toFixed(1)} oct`,
  help: 'How far the bender moves the filter cutoff, up to five octaves. In this app the mod wheel beside the keyboard stands in for the bender pushed to the right.',
});
[['bend.vco1', 98, 'VCO-1', true, 'Lets the bender move VCO-1’s pitch.'],
  ['bend.vco2', 122, 'VCO-2', true, 'Lets the bender move VCO-2’s pitch. With only one VCO bent, the bend detunes the two against each other.'],
  ['bend.wide', 144, 'WIDE', false, 'Widens the pitch bend to three octaves either way on the VCOs lit, ignoring BEND VCO. Its lamp turns orange on the hardware.'],
].forEach(([id, px, t, def, help]) => {
  capBtn(id, LX(px), LY(727), CREAM, { def, label: `BEND ${t}`, name: `Bend ${t}`, module: 'util', help: `${help} The mod wheel stands in for the bender here.` }, 50, 46);
  LT(px, 745, t, 11.5);
});
decor.push({ t: 'path', d: `M${LX(98)} ${LY(708)} V${LY(702)} H${LX(122)} V${LY(708)}`, w: 2 });
const lfo2Knob = (id, px, t, rest) => {
  LT(px, 639, t, 12);
  knob(id, LX(px), LY(656), rest);
};
lfo2Knob('lfo2.vco', 178, 'VCO', {
  def: 3, name: 'LFO-2 depth (VCOs)', module: 'mod', fmt: (v) => `±${Math.round(120 * Math.pow(v / 10, 2))} cents`,
  help: 'How far LFO-2 moves the pitch of both VCOs while LFO MOD is held on: performance vibrato, up to about a semitone.',
});
lfo2Knob('lfo2.vcf', 213, 'VCF', {
  def: 0, name: 'LFO-2 depth (filter)', module: 'mod', fmt: (v) => `±${(4 * v / 10).toFixed(1)} oct`,
  help: 'How far LFO-2 sweeps the filter while LFO MOD is on, up to four octaves: a growl or wah you bring in by hand.',
});
lfo2Knob('lfo2.rate', 248, 'RATE', {
  def: 5.5, name: 'LFO-2 rate', module: 'lfo', fmt: (v) => fmtHz(lfo2Hz(v)),
  help: 'Speed of LFO-2, a sine wave of 1 to 10 Hz kept for playing vibrato by hand.',
});
lfo2Knob('lfo2.rise', 283, 'RISE', {
  def: 3, name: 'LFO-2 rise time', module: 'lfo', fmt: (v) => fmtTime(riseTime(v)),
  help: 'How long LFO-2 takes to come in after LFO MOD is switched on and a note starts, from 0.05 to 1 second.',
});
decor.push({ t: 'path', d: `M${LX(178)} ${LY(672)} V${LY(678)} H${LX(213)} V${LY(672)}`, w: 2 });
line(LX(198), LY(678), LX(198), LY(688), 2);
capBtn('lfo2.on', LX(198), LY(701), CREAM, {
  label: 'LFO MOD', name: 'LFO MOD (LFO-2 on)', module: 'mod',
  help: 'Brings in LFO-2: vibrato on the VCOs and a sweep on the filter, at the depths set above. On the hardware it works while held; here it stays on until clicked again.',
}, 130, 60);
// The bender lever, for reference: the mod wheel beside the app's keyboard stands in for it.
decor.push({ t: 'rect', x: LX(245) - 92, y: LY(765) - 22, w: 184, h: 44, r: 4, fill: '#050506', stroke: '#2c2d31', sw: 2, hw: true });
decor.push({ t: 'rect', x: LX(245) - 70, y: LY(765) - 6, w: 140, h: 12, r: 6, fill: '#2a2b2e', hw: true });
decor.push({ t: 'circle', x: LX(225), y: LY(752), r: 5, fill: '#888', hw: true });
decor.push({ t: 'circle', x: LX(266), y: LY(752), r: 5, fill: '#888', hw: true });
LT(245, 782, 'BENDER', 11, { fill: '#8d8e90' });

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (px0, py0, px1, py1) => ({ x: X(px0), y: Y(py0), w: r1(X(px1) - X(px0)), h: r1(Y(py1) - Y(py0)) });
const LR = (px0, py0, px1, py1) => ({ x: LX(px0), y: LY(py0), w: r1(LX(px1) - LX(px0)), h: r1(LY(py1) - LY(py0)) });
const TY0 = 326, TY1 = 452, BY1 = 578;
const areas = [
  { id: 'out', label: 'Volume and tuning', module: 'out', keywords: 'master volume level tune pitch auto tune',
    rects: [R(84, TY0, 153, TY1), R(1383, TY1, 1494, BY1)],
    help: 'VOLUME sets the overall level and MASTER TUNE the overall pitch; neither is stored in a patch. The TUNE button beside MASTER TUNE starts the automatic tuning of all twelve VCOs on the hardware; it is printed only here.' },
  { id: 'lfo1', label: 'LFO-1', module: 'lfo', keywords: 'lfo vibrato wobble delay random sample and hold',
    rects: [R(153, TY0, 277, TY1)],
    help: 'The main LFO, a slow wave that moves other parts of the sound. RATE sets its speed, DELAY lets each note start plain and the wobble fade in, and the four WAVEFORM buttons choose triangle, sawtooth, square or random steps. Where it goes is set in VCO MOD, PWM, VCF and VCA.' },
  { id: 'vcomod', label: 'VCO MOD', module: 'mod', keywords: 'vibrato pitch envelope swoop',
    rects: [R(277, TY0, 373, TY1)],
    help: 'Pitch modulation for the VCOs. The LFO fader adds vibrato from LFO-1 and the ENV-1 fader a pitch swoop from ENV-1. The two buttons choose which VCOs it reaches: VCO-1, VCO-2 or both.' },
  { id: 'pwm', label: 'PWM', module: 'osc', keywords: 'pulse width modulation pwm shimmer',
    rects: [R(373, TY0, 466, TY1)],
    help: 'Pulse width for both VCOs’ pulse waves. PW sets the width, from square at 0 to a thin buzz near 10. PWM sweeps it, from LFO-1 (a steady shimmer) or ENV-1 (a width that changes over the note), chosen by the two buttons.' },
  { id: 'vco1', label: 'VCO-1', module: 'osc', keywords: 'oscillator cross modulation fm frequency modulation range waveform',
    rects: [R(466, TY0, 628, TY1)],
    help: 'The first oscillator. RANGE steps in half steps over four octaves and the WAVEFORM buttons add triangle, sawtooth, pulse or square, more than one at a time if you like. The CROSS MOD faders let VCO-2 shake VCO-1’s pitch, by hand and from ENV-1: metallic, bell-like tones.' },
  { id: 'vco2', label: 'VCO-2 and sync', module: 'osc', keywords: 'oscillator sync hard sync low frequency detune noise',
    rects: [R(628, TY0, 811, TY1)],
    help: 'The second oscillator. RANGE steps in half steps, with LOW (a slow modulator that ignores the keys) at one end and HIGH at the other; TUNE detunes it finely. Its WAVEFORM buttons can be combined and include noise. The SYNC buttons lock one VCO to the other, either way round.' },
  { id: 'mixer', label: 'Mixer', module: 'mixer', keywords: 'balance level mix',
    rects: [R(811, TY0, 889, TY1)],
    help: 'One knob balances the two VCOs into the filter: VCO-1 alone fully left, VCO-2 alone fully right, both at full level in the middle.' },
  { id: 'vcf', label: 'VCF', module: 'filter', keywords: 'filter cutoff resonance low-pass high-pass band-pass multimode key follow',
    rects: [R(889, TY0, 1107, TY1)],
    help: 'A filter that can be low-pass, high-pass or band-pass (both MODE buttons lit). FREQ sets the cutoff and RES the emphasis there. ENV opens it on each note from ENV-1 or ENV-2, LFO sweeps it from LFO-1, and KYBD makes it follow the keys.' },
  { id: 'vca', label: 'VCA', module: 'amp', keywords: 'amplifier volume level tremolo',
    rects: [R(1107, TY0, 1188, TY1)],
    help: 'The amplifier. ENV-2 LEVEL sets how loud the patch is under ENV-2, and LFO adds tremolo from LFO-1.' },
  { id: 'env1', label: 'ENV-1', module: 'env', keywords: 'envelope adsr polarity invert key follow contour',
    rects: [R(1188, TY0, 1349, TY1)],
    help: 'The modulation envelope: A, D, S and R shape a curve that runs on every note. It drives the pitch (VCO MOD), the pulse width, the cross mod and, if chosen, the filter. POLARITY turns it upside down, and KEY FOLLOW makes it faster on high notes.' },
  { id: 'env2', label: 'ENV-2', module: 'env', keywords: 'envelope adsr loudness volume key follow',
    rects: [R(1349, TY0, 1494, TY1)],
    help: 'The loudness envelope: A, D, S and R shape the volume of every note, and it can drive the filter as well. KEY FOLLOW makes it faster on high notes, so they die away sooner.' },
  { id: 'balance', label: 'Balance and bender switch', module: 'util', keywords: 'balance lower upper split bender enable',
    rects: [R(84, TY1, 194, BY1)],
    help: 'BALANCE sets the level of the lower patch against the upper one in a split, and BENDER lets one half of a split respond to the bender. This app plays one patch on the whole keyboard, so both are printed only.' },
  { id: 'glide', label: 'Glide', module: 'glide', keywords: 'portamento glissando slide',
    rects: [R(194, TY1, 309, BY1)],
    help: 'Makes the pitch slide from note to note. TIME sets how long the slide takes; PORTAMENTO slides smoothly and GLISSANDO steps through the half steps on the hardware (here it slides like PORTAMENTO).' },
  { id: 'arp', label: 'Arpeggio', module: 'mode', keywords: 'arpeggiator arp up down range rate',
    rects: [R(309, TY1, 466, BY1)],
    help: 'Plays held notes one at a time. UP and DOWN start it (both lit play up and down), RATE sets the speed and RANGE how many octaves it climbs.' },
  { id: 'assign', label: 'Assign', module: 'mode', keywords: 'unison solo poly mono voice detune hold',
    rects: [R(466, TY1, 663, BY1)],
    help: 'How the six voices are shared out. POLY-1 and POLY-2 give each key its own voice; UNISON doubles voices up on each key; SOLO plays one note at a time, and with UNISON as well stacks all six on that note. UNISON DETUNE spreads the stacked voices. HOLD latches the arpeggio.' },
  { id: 'keymode', label: 'Key mode and panel mode', module: 'mode', keywords: 'split whole lower upper layer',
    rects: [R(663, TY1, 812, BY1)],
    help: 'KEY MODE splits the keyboard into a lower and an upper patch (SPLIT-1 gives four voices to the lower half, SPLIT-2 two) or plays one patch on the whole keyboard; PANEL MODE chooses which half the panel edits. This app plays one patch on all six voices, as at WHOLE, so these are printed only.' },
  { id: 'memory', label: 'Patch memory', module: 'util', keywords: 'preset bank number manual write protect tape save load',
    rects: [R(812, TY1, 1383, BY1)],
    help: 'The patch memory: 48 patches in banks A to F and 32 patch presets that also store the key mode and performance settings, MANUAL to play the panel as set, WRITE, and the tape save and load. Printed only: this app keeps its sounds in the library.' },
  { id: 'bend', label: 'Bend', module: 'util', keywords: 'pitch bend bender lever wheel wide',
    rects: [LR(68, 612, 161, 805)],
    help: 'How the bender lever moves the sound: BEND VCO and BEND VCF set the depth on pitch and cutoff, the VCO-1 and VCO-2 buttons choose which oscillators bend, and WIDE gives three octaves. The lever is drawn for reference; the mod wheel beside the app’s keyboard stands in for it pushed to the right.' },
  { id: 'lfo2', label: 'LFO-2', module: 'lfo', keywords: 'performance vibrato modulation lever lfo mod',
    rects: [LR(161, 612, 322, 805)],
    help: 'A second LFO, a sine, kept for playing vibrato and growl by hand. LFO MOD brings it in; VCO and VCF set how far it moves the pitch and the filter, RATE its speed and RISE how long it takes to come in.' },
];
annotate(unusual, controls, [], areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const envOf = (v, e) => ({
  a: attTime(v[`${e}.attack`]), d: drTime(v[`${e}.decay`]), s: v[`${e}.sustain`] / 10, r: drTime(v[`${e}.release`]), kf: (v[`${e}.kf`] / 10) * 1.2,
});

function toEngine(v, ctx) {
  const routes = [];
  const route = (src, dst, amt, by) => { if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt }); };
  const pol = v['env1.polarity'] === 'inverted' ? -1 : 1;
  const wave = v['lfo.wave'];
  const raw = LFO_RAW[wave];

  // VCO MOD: LFO-1 (delayed) and ENV-1 to the pitch of the VCOs lit
  const vl = 120 * Math.pow(v['vcomod.lfo'] / 10, 2.5);
  const ve = 60 * Math.pow(v['vcomod.env'] / 10, 2) * pol;
  [['vcomod.vco1', 'pitch1'], ['vcomod.vco2', 'pitch2']].forEach(([id, dst]) => {
    if (!v[id]) return;
    route('lfo', dst, vl);
    route('env1', dst, ve);
  });

  // Waveforms. VCO-1's PULSE and SQUARE cannot play together; PULSE wins.
  const sq1 = v['vco1.square'] && !v['vco1.pulse'];
  const w1 = { tri: v['vco1.tri'] ? 1 : 0, saw: v['vco1.saw'] ? 1 : 0, pulse: v['vco1.pulse'] || sq1 ? 1 : 0 };
  const w2 = { tri: v['vco2.tri'] ? 1 : 0, saw: v['vco2.saw'] ? 1 : 0, pulse: v['vco2.pulse'] ? 1 : 0 };
  const norm = (w) => {
    const n = w.tri + w.saw + w.pulse;
    const g = n > 1 ? 1 / Math.sqrt(n) : 1;
    return { tri: w.tri * g, saw: w.saw * g, pulse: w.pulse * g };
  };

  // PWM: both VCOs' pulse waves (not VCO-1's fixed square)
  const pw = 0.5 - 0.048 * v['pwm.pw'];
  const pd = v['pwm.depth'] / 10;
  const pwmTo = (dst) => {
    if (v['pwm.src'] === 'lfo') route(raw, dst, 0.45 * pd);
    else route('env1', dst, -0.45 * pd * pol);
  };
  if (v['vco1.pulse']) pwmTo('pw1');
  if (v['vco2.pulse']) pwmTo('pw2');

  // CROSS MOD: VCO-2 into VCO-1's frequency, by hand and opened by ENV-1
  route('osc2', 'pitch1', 36 * Math.pow(v['vco1.xmod'] / 10, 2));
  route('osc2', 'pitch1', 36 * Math.pow(v['vco1.xmodEnv'] / 10, 2) * pol, 'env1');

  // VCF
  const envSel = v['vcf.envSel'];
  route('lfo', 'cutoff', 8 * Math.pow(v['vcf.lfo'] / 10, 1.6));
  // VCA tremolo, not delayed
  route(raw, 'amp', 0.5 * (v['vca.lfo'] / 10));

  // LFO-2 (LFO MOD) and the bender, which the mod wheel stands in for
  if (v['lfo2.on']) {
    const lv = 1.2 * Math.pow(v['lfo2.vco'] / 10, 2);
    route('lfo2', 'pitch1', lv);
    route('lfo2', 'pitch2', lv);
    route('lfo2', 'cutoff', 4 * (v['lfo2.vcf'] / 10));
  }
  const w = clamp((ctx && ctx.wheel) || 0, 0, 1);
  const bend = (v['bend.wide'] ? 36 : 12 * (v['bend.vco'] / 10)) * w;
  if (v['bend.vco1']) route('one', 'pitch1', bend);
  if (v['bend.vco2']) route('one', 'pitch2', bend);
  route('one', 'cutoff', 5 * (v['bend.vcf'] / 10) * w);

  // VCO-2 range: LOW stops following the keys
  const r2 = v['vco2.range'];
  const low = r2 < 12;
  const fixedNote = low ? 69 + 12 * Math.log2(v2LowHz(r2) / 440) : 60;

  // Filter mode: LPF and HPF are 24 dB; both lit is a 12 dB band-pass
  const hp = !!v['vcf.hpf'], lp = !!v['vcf.lpf'];
  const mode = hp && lp ? 'bp' : hp ? 'hp' : 'lp';

  // Mixer: fully left VCO-1 alone, fully right VCO-2 alone, both full in the middle
  const m = v['mix.balance'];
  const l1 = 0.38 * Math.min(1, (10 - m) / 5);
  const l2 = 0.38 * Math.min(1, m / 5);
  const any1 = w1.tri || w1.saw || w1.pulse;
  const any2 = w2.tri || w2.saw || w2.pulse;

  // Assign: SOLO (with UNISON = SOLO UNISON), UNISON, POLY-1, POLY-2
  const det = 0.5 * (v['voice.detune'] / 10);
  const assign = v['voice.assign'];
  const poly = v['voice.solo']
    ? (assign === 'unison' ? { voices: 6, stack: 6, mono: true, detune: det } : { voices: 6, stack: 1, mono: true, detune: 0 })
    : assign === 'unison' ? { voices: 6, stack: 2, mono: false, detune: det } : { voices: 6, stack: 1, mono: false, detune: 0 };

  const up = !!v['arp.up'], down = !!v['arp.down'];
  return {
    osc: [
      { level: any1 ? l1 : 0, mix: norm(w1), pw: sq1 ? 0.5 : pw, semi: v['vco1.range'] - 24, kbd: true, syncTo: v['vco.sync21'] && !v['vco.sync12'] ? 1 : -1 },
      { level: any2 ? l2 : 0, mix: norm(w2), pw, semi: low ? 0 : v2Semi(r2) + v['vco2.tune'] / 10, kbd: !low, fixedNote, syncTo: v['vco.sync12'] ? 0 : -1 },
    ],
    noise: { level: v['vco2.noise'] ? (l2 / 0.38) * 0.3 : 0, color: 'white' },
    ext: { level: 0 },
    filter: {
      type: mode === 'bp' ? 'svf' : 'ladder', mode, cutoff: vcfHz(v['vcf.freq']), res: (v['vcf.res'] / 10) * 1.08,
      envAmt: (v['vcf.env'] / 10) * 9 * (envSel === 'env1' ? pol : 1), envSrc: envSel, kbd: (v['vcf.kybd'] / 10) * 1.2,
    },
    env1: envOf(v, 'env1'), env2: envOf(v, 'env2'),
    vca: { envSrc: 'env2', bias: 0, gain: 1.15 * Math.pow(v['vca.level'] / 10, 1.3) },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: LFO_MIX[wave], keySync: false, delay: lfoDelay(v['lfo.delay']) },
    lfo2: { rate: lfo2Hz(v['lfo2.rate']), mix: { sine: 1 }, keySync: false, delay: riseTime(v['lfo2.rise']) },
    glide: { time: v['glide.porta'] || v['glide.gliss'] ? glideTime(v['glide.time']) : 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly,
    arp: { on: up || down, bpm: arpHz(v['arp.rate']) * 15, gate: 0.5, mode: up && down ? 'updown' : down ? 'down' : 'up', octaves: v['arp.range'], hold: !!v['arp.hold'] },
    routes,
    normals: {},
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: v['out.tune'] / 10,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const ENV = (e, a, d, s, r) => ({ [`${e}.attack`]: a, [`${e}.decay`]: d, [`${e}.sustain`]: s, [`${e}.release`]: r });
const presets = [
  {
    id: 'jp6-brass', name: 'Poly Brass', ref: 'In the style of early-80s synth-pop brass stabs', artist: 'Classic technique',
    tags: ['brass', 'synth-pop', '80s'], level: 1,
    blurb: 'Bright, thick chord stabs with a brassy push at the front of every note.',
    how: 'Two sawtooth VCOs, one tuned a few cents sharp, make every note of the chord thick before the filter does anything. The 24 dB low-pass filter rests part closed and ENV-1 flicks it open and back on each chord, which gives the brassy push. ENV-2 keeps the chord at full level while the keys are down.',
    phrase: { bpm: 116, loop: true, steps: [[0, 60, 0.45], [0, 64, 0.45], [0, 67, 0.45], [0.5, 60, 0.4], [0.5, 64, 0.4], [0.5, 67, 0.4], [1.5, 62, 0.45], [1.5, 65, 0.45], [1.5, 69, 0.45], [2, 62, 1.6], [2, 65, 1.6], [2, 69, 1.6]] },
    steps: [
      { title: 'Two sawtooths, a little apart', module: 'osc', why: 'Brass starts with sawtooth waves, the brightest and buzziest shape, on both VCOs (the oscillators, the parts that make the raw tone).\n- VCO-2 SAWTOOTH lit: VCO-2 now plays a sawtooth too. VCO-1’s sawtooth is already lit.\n- MIX 5: the middle of the mixer knob, where both VCOs go into the filter at full level.\n- VCO-2 TUNE +0.8 (+8 cents): VCO-2 a little sharp, so each pair of oscillators beats slowly and every note sounds wider.\n- VOLUME 6: a chord of sawtooths is loud, so the master level comes down a little.\n- Listen for: hold a chord and hear a slow swirl. Turn TUNE back to 0 and the chord goes still and thinner.',
        set: { 'vco2.saw': true, 'mix.balance': 5, 'vco2.tune': 0.8, 'out.volume': 6 } },
      { title: 'Close the filter part way', module: 'filter', why: 'The VCF (the filter) rests darker than the raw sawtooths, so the envelope in the next step has somewhere to open to.\n- FREQ 4.5 (306 Hz): the cutoff of the low-pass filter, which keeps the lows and cuts the highs. Lower is more muffled, higher brighter.\n- RES 1.5 (15 %): a slight lift at the cutoff for edge, nowhere near a whistle.\n- KYBD 5 (60 %): the cutoff follows the keys part of the way, so the top notes of a chord do not go dull.\n- Listen for: a warm, muted chord. LPF is lit, so this is the 24 dB low-pass mode.',
        set: { 'vcf.freq': 4.5, 'vcf.res': 1.5, 'vcf.kybd': 5 } },
      { title: 'ENV-1 pushes the filter open', module: 'env', why: 'ENV-1 is an ADSR envelope (attack, decay, sustain, release): a shape that runs on every note. Sent to the filter it lifts the cutoff at the start of each chord and lets it settle, which is the brassy push.\n- VCF ENV 5 (50 %): how far the envelope opens the filter. The ENV-1 button beside it is lit, so ENV-1 is the one used.\n- ENV-1 A 2 (20 ms): quick but not instant, so the brightness pushes in like a breath.\n- ENV-1 D 5 (324 ms), S 3.5 (35 %): the push lasts about a third of a second, then the chord settles a little brighter than the resting filter.\n- ENV-1 R 4 (150 ms): the filter closes quickly when you let go.\n- Listen for: a “baah” on every stab. Pull VCF ENV to 0 and the chords lose their bite.',
        set: { 'vcf.env': 5, ...ENV('env1', 2, 5, 3.5, 4) } },
      { title: 'Shape the loudness', module: 'amp', why: 'ENV-2 shapes the volume of every note. Stabs want full level while the keys are down and a clean stop when they come up.\n- ENV-2 A 1.5 (11 ms): near-instant, so the chord lands on the beat.\n- ENV-2 S 9 (90 %): held chords stay almost at full level.\n- ENV-2 R 4 (150 ms): a short tail, so the stabs stay apart.\n- Listen for: the gaps between stabs. Raise ENV-2 R to 6 and the stabs smear together.',
        set: ENV('env2', 1.5, 5, 9, 4) },
    ],
    context: {
      'vcf.env': 'In this sound: how much bite each stab has. Lower for a softer horn section, higher for a snarl.',
      'env1.decay': 'In this sound: how long the brassy push lasts.',
      'vco2.tune': 'In this sound: the slight detune that thickens each note.',
      'vcf.freq': 'In this sound: how dark the chord is between pushes.',
    },
    tweaks: [
      { id: 'vcf.env', try: 'Move between 2 and 8 while the riff plays', hear: 'From a mellow horn pad to a snarling stab.' },
      { id: 'env1.attack', try: 'Raise to 4', hear: 'The push swells in more slowly, like a breathy horn.' },
    ],
  },
  {
    id: 'jp6-strings', name: 'PWM Strings', ref: 'In the style of early-80s string-machine pads', artist: 'Classic technique',
    tags: ['strings', 'synth-pop', '80s'], level: 1,
    blurb: 'Soft string chords that shimmer while they hold and swell in slowly.',
    how: 'Both VCOs play pulse waves whose width LFO-1 sweeps back and forth: pulse-width modulation, the shimmer of string machines. A slow ENV-2 attack and a long release make each chord swell in and fade out.',
    phrase: { bpm: 72, loop: true, steps: [[0, 57, 3.8], [0, 60, 3.8], [0, 64, 3.8], [0, 69, 3.8], [4, 53, 3.8], [4, 57, 3.8], [4, 60, 3.8], [4, 65, 3.8]] },
    steps: [
      { title: 'Pulse waves on both VCOs', module: 'osc', why: 'Pulse waves are hollower and softer than sawtooths, a better start for strings.\n- VCO-1 SAWTOOTH off, PULSE lit: VCO-1 now plays only its pulse wave.\n- VCO-2 PULSE lit, MIX 5: VCO-2 plays a pulse too, and both go into the filter at full level.\n- VCO-2 TUNE −1 (−10 cents): VCO-2 a little flat, so chords beat gently.\n- PW 2 (40 %): just off square. One fader sets the width of both VCOs’ pulse waves.\n- VOLUME 6: a chord of pulses is loud.\n- Listen for: a reedy, hollow chord, still static.',
        set: { 'vco1.saw': false, 'vco1.pulse': true, 'vco2.pulse': true, 'mix.balance': 5, 'vco2.tune': -1, 'pwm.pw': 2, 'out.volume': 6 } },
      { title: 'Sweep the widths with LFO-1', module: 'mod', why: 'PWM (pulse-width modulation) is the shimmer. LFO-1 (a slow wave that moves other controls) sweeps both pulse widths, which sounds like many players slightly out of step.\n- PWM 5 (50 %): how far the width is swept. The LFO button beside it is lit, so LFO-1 does the sweeping.\n- LFO-1 RATE 4 (0.91 Hz): a little under one sweep a second. Slower drifts; faster warbles.\n- Listen for: the chord now moves and shimmers. Pull PWM to 0 to hear it go still.',
        set: { 'pwm.depth': 5, 'lfo.rate': 4 } },
      { title: 'Soften the top', module: 'filter', why: 'The filter takes the fizz off the pulses so the chord sounds warm.\n- FREQ 6.5 (1.4 kHz): the cutoff of the low-pass filter. Lower is more muffled, higher brighter and thinner.\n- KYBD 6 (72 %): the cutoff follows the keys, so high voicings keep their air.\n- Listen for: a smoother, darker chord with the shimmer still there.',
        set: { 'vcf.freq': 6.5, 'vcf.kybd': 6 } },
      { title: 'Swell in, fade out', module: 'amp', why: 'ENV-2 (the loudness envelope, an ADSR) makes each chord swell in and fade like a string section.\n- ENV-2 A 6.5 (900 ms): each chord takes nearly a second to reach full level.\n- ENV-2 S 10 (100 %): held chords stay at full level.\n- ENV-2 R 6.5 (1.0 s): chords fade over about a second after you let go, so one chord overlaps the next.\n- Listen for: smooth changes between chords. Set ENV-2 A to 0 and the chords start like an organ.',
        set: ENV('env2', 6.5, 5, 10, 6.5) },
    ],
    context: {
      'pwm.depth': 'In this sound: how deep the shimmer is.',
      'lfo.rate': 'In this sound: how fast the shimmer moves.',
      'env2.attack': 'In this sound: how slowly each chord swells in.',
    },
    tweaks: [
      { id: 'lfo.rate', try: 'Move between 3 and 5.5', hear: 'From a slow sway to a nervous flutter.' },
      { id: 'pwm.pw', try: 'Raise to 5', hear: 'Thinner, more nasal strings, with a deeper-sounding sweep.' },
    ],
  },
  {
    id: 'jp6-xmod-bell', name: 'Cross-Mod Bell', ref: 'In the style of 80s digital-sounding bells, made on an analogue synth', artist: 'Classic technique',
    tags: ['keys', 'synth-pop', '80s'], level: 2,
    blurb: 'A glassy, metallic bell that rings out and fades, with a clang at the start of each note.',
    how: 'VCO-2 is tuned to an odd interval above VCO-1 and used only to shake VCO-1’s pitch at audio rate: cross modulation, the same idea as FM. That adds harmonics that do not fit a normal note, which the ear hears as a bell. ENV-1 opens the cross mod wider at the start of each note, so the attack clangs and the tail is purer.',
    phrase: { bpm: 90, loop: true, steps: [[0, 72, 0.9], [1, 76, 0.9], [2, 79, 0.9], [3, 84, 1.8], [5, 79, 0.9], [6, 76, 1.8]] },
    steps: [
      { title: 'A pure tone to modulate', module: 'osc', why: 'A triangle wave on VCO-1 is the carrier: plain and soft, so every extra harmonic you hear later comes from the cross mod.\n- VCO-1 SAWTOOTH off, TRIANGLE lit: VCO-1 plays a triangle, close to a pure tone.\n- MIX 0: fully left, so only VCO-1 goes into the filter. VCO-2 is still running; it just is not heard directly.\n- VCO-2 TRIANGLE lit: VCO-2 needs a wave to modulate with, even though it is not in the mix.\n- Listen for: a soft, flute-like note, nothing like a bell yet.',
        set: { 'vco1.saw': false, 'vco1.tri': true, 'mix.balance': 0, 'vco2.tri': true } },
      { title: 'Tune VCO-2 to an odd interval', module: 'osc', why: 'For a bell, VCO-2 sits at an interval that is not a simple octave or fifth, so the new harmonics clash a little, as a real bell’s do.\n- VCO-2 RANGE +22 st: nearly two octaves up (it steps in half steps). Whole octaves give a hollow, organ-like tone; odd steps give bells and gongs.\n- CROSS MOD MANUAL 4 (40 %): how hard VCO-2 shakes VCO-1’s pitch all the time. This alone gives a dull metallic edge.\n- Listen for: the triangle turns hard and clangy. Step VCO-2 RANGE up and down one notch at a time and hear the bell change colour.',
        set: { 'vco2.range': 58, 'vco1.xmod': 4 } },
      { title: 'ENV-1 opens the cross mod', module: 'env', why: 'CROSS MOD ENV-1 lets ENV-1 add more cross mod over each note. With a quick decay the clang is strongest as the note is struck and fades as it rings, as a struck bell does.\n- CROSS MOD ENV-1 5 (50 %): how much ENV-1 adds on top of the manual amount.\n- ENV-1 A 0, D 6 (700 ms), S 0: full at once, then gone in under a second.\n- ENV-1 R 5 (320 ms): any of it left fades quickly after you let go.\n- Listen for: a bright strike that mellows. Pull CROSS MOD ENV-1 to 0 and every moment of the note sounds the same.',
        set: { 'vco1.xmodEnv': 5, ...ENV('env1', 0, 6, 0, 5) } },
      { title: 'A ringing loudness', module: 'amp', why: 'A bell is struck once and dies away on its own, so ENV-2 (the loudness envelope) has no sustain and a long decay.\n- ENV-2 A 0 (2 ms): struck at once.\n- ENV-2 D 7.5 (2.3 s), S 0: the note rings for a couple of seconds whether or not you hold the key.\n- ENV-2 R 6.5 (1.0 s): letting go early still leaves a short ring.\n- FREQ 7.5 (3 kHz): the filter takes the harshest top off the clang.\n- KEY FOLLOW 5 (60 %) on ENV-2: higher notes ring shorter, as small bells do.\n- Listen for: notes that ring and overlap like chimes.',
        set: { ...ENV('env2', 0, 7.5, 0, 6.5), 'vcf.freq': 7.5, 'env2.kf': 5 } },
    ],
    context: {
      'vco2.range': 'In this sound: the interval of the modulator, which sets the colour of the bell. Odd steps are bell-like; octaves are hollow.',
      'vco1.xmod': 'In this sound: the metallic edge that stays all through the note.',
      'vco1.xmodEnv': 'In this sound: the extra clang at the strike.',
      'env2.decay': 'In this sound: how long the bell rings.',
    },
    tweaks: [
      { id: 'vco2.range', try: 'Step it between +19 and +24', hear: 'Each step is a different bell: gong, chime, glass.' },
      { id: 'vco1.xmod', try: 'Raise to 7', hear: 'Harsher and more clangy, like struck metal.' },
    ],
  },
  {
    id: 'jp6-sync-lead', name: 'Sync Lead', ref: 'In the style of new-wave sync leads', artist: 'Classic technique',
    tags: ['lead', 'new wave', '80s'], level: 2,
    blurb: 'A tearing mono lead whose tone sweeps down at the start of every note.',
    how: 'SYNC 1→2 makes VCO-2 restart with every cycle of VCO-1, so VCO-2’s pitch changes its tone rather than its note. VCO MOD sends ENV-1 to VCO-2’s pitch alone, so each note starts with VCO-2 high and sweeps down: the tearing sound. SOLO and portamento make it a sliding mono lead.',
    phrase: { bpm: 120, loop: true, steps: [[0, 64, 0.45], [0.5, 67, 0.45], [1, 69, 0.9], [2, 72, 0.45], [2.5, 71, 0.45], [3, 67, 0.9]] },
    steps: [
      { title: 'VCO-2 alone, synced', module: 'osc', why: 'Only VCO-2 is heard, locked to VCO-1. VCO-1 still runs and sets the note, but it is not in the mix.\n- SYNC 1→2 lit: VCO-2 restarts whenever VCO-1 starts a cycle.\n- MIX 10: fully right, VCO-2 alone.\n- VCO-2 SAWTOOTH lit, RANGE +7 st: with sync on, RANGE is a tone control. Higher snarls more.\n- Listen for: a hard, nasal saw. Turn VCO-2 RANGE slowly and the tone changes while the note stays put.',
        set: { 'vco.sync12': true, 'mix.balance': 10, 'vco2.saw': true, 'vco2.range': 43 } },
      { title: 'Sweep VCO-2 with ENV-1', module: 'mod', why: 'VCO MOD sends ENV-1 to the pitch of the VCOs lit beside it. Only VCO-2 is lit here, so only the synced oscillator moves, and its sweep is heard as a sweep of tone.\n- VCO MOD VCO-1 off, VCO-2 lit: VCO-1 keeps the note steady.\n- VCO MOD ENV-1 4 (+9.6 st at the peak): how far ENV-1 throws VCO-2 up.\n- ENV-1 A 0, D 6 (700 ms), S 1.5 (15 %), R 4: the sweep starts at its top the instant you play and falls over about two thirds of a second.\n- Listen for: a tearing “neow” at the front of every note.',
        set: { 'vcomod.vco1': false, 'vcomod.env': 4, ...ENV('env1', 0, 6, 1.5, 4) } },
      { title: 'Take the fizz off', module: 'filter', why: 'Synced sawtooths are very bright. The filter tames them a little.\n- FREQ 7.5 (3 kHz): the cutoff, brought down from fully open.\n- RES 1.5 (15 %): a slight edge at the cutoff.\n- KYBD 6 (72 %): high notes keep their brightness.\n- Listen for: the same tear, smoother on top.',
        set: { 'vcf.freq': 7.5, 'vcf.res': 1.5, 'vcf.kybd': 6 } },
      { title: 'One note at a time, sliding', module: 'mode', why: 'A lead plays one line, and a slide between notes sounds like a bent guitar string.\n- SOLO lit: one note at a time; the last key wins.\n- PORTAMENTO lit, TIME 2.5 (0.10 s an octave): each note slides from the last.\n- Listen for: overlapping notes slide into each other and the sweep starts again on each.',
        set: { 'voice.solo': true, 'glide.porta': true, 'glide.time': 2.5 } },
    ],
    context: {
      'vco2.range': 'In this sound: where the sweep settles. Up for a harder tone.',
      'vcomod.env': 'In this sound: the depth of the sweep.',
      'env1.decay': 'In this sound: how long the sweep takes.',
      'vco.sync12': 'In this sound: what turns VCO-2’s pitch sweep into a sweep of tone.',
    },
    tweaks: [
      { id: 'env1.decay', try: 'Set between 4 and 7', hear: 'A snappy zap at 4, a slow vowel-like dive at 7.' },
      { id: 'vco2.range', try: 'Turn it slowly while holding a note', hear: 'The classic sync sweep by hand.' },
    ],
  },
  {
    id: 'jp6-unison-bass', name: 'Solo Unison Bass', ref: 'In the style of 80s synth-pop bass lines', artist: 'Classic technique',
    tags: ['bass', 'synth-pop', '80s'], level: 1,
    blurb: 'A huge, punchy bass with all six voices stacked on each note.',
    how: 'SOLO together with UNISON stacks all six voices on one key, each detuned a little by UNISON DETUNE, so every note is a wall of oscillators. A sawtooth and a square an octave down give it weight, and a short filter envelope gives each note a round thump.',
    phrase: { bpm: 112, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.4], [1, 48, 0.4], [1.5, 36, 0.4], [2, 39, 0.4], [2.5, 39, 0.4], [3, 41, 0.4], [3.5, 43, 0.4]] },
    steps: [
      { title: 'Stack all six voices', module: 'mode', why: 'SOLO plays one note at a time; with UNISON lit as well (SOLO UNISON) all six voices play that one note.\n- SOLO lit, UNISON lit: the two buttons together.\n- UNISON DETUNE 2.5 (±13 cents): how far apart the stacked voices are tuned. More is wider and more chorused; at 0 they lock together.\n- VOLUME 6: six voices on one note are loud.\n- Listen for: a thick, churning saw on every note. Switch SOLO off and the stack shrinks to two voices a key.',
        set: { 'voice.solo': true, 'voice.assign': 'unison', 'voice.detune': 2.5, 'out.volume': 6 } },
      { title: 'A sawtooth over a square, low down', module: 'osc', why: 'Each voice gets a sawtooth for bite and a square for body, an octave down.\n- VCO-1 RANGE 16’: an octave down.\n- VCO-2 PULSE lit, RANGE 16’: VCO-2 plays a square (PW is at 0) at the same octave.\n- MIX 5: both at full level.\n- Listen for: a heavier, woodier low end under the saw.',
        set: { 'vco1.range': 12, 'vco2.pulse': true, 'vco2.range': 24, 'mix.balance': 5 } },
      { title: 'A round thump from the filter', module: 'filter', why: 'The filter rests dark and ENV-1 opens it briefly at the start of each note.\n- FREQ 3.5 (143 Hz), RES 3 (30 %): dark at rest, with a little honk at the cutoff.\n- VCF ENV 5.5: how far ENV-1 opens it on each note.\n- ENV-1 A 0, D 4 (150 ms), S 1, R 3.5: open at once, shut again in about a seventh of a second.\n- Listen for: a “dum” on every note.',
        set: { 'vcf.freq': 3.5, 'vcf.res': 3, 'vcf.env': 5.5, ...ENV('env1', 0, 4, 1, 3.5) } },
      { title: 'Tight loudness', module: 'amp', why: 'A driving bass wants notes that hit at once and stop clean.\n- ENV-2 A 0, D 5, S 9 (90 %): full at once, holding nearly full.\n- ENV-2 R 3 (67 ms): notes stop almost as you let go.\n- Listen for: clean gaps in the eighth-note line.',
        set: ENV('env2', 0, 5, 9, 3) },
    ],
    context: {
      'voice.detune': 'In this sound: how wide the stack is. More is fatter but wobblier.',
      'vcf.freq': 'In this sound: how much growl comes through between thumps.',
      'env1.decay': 'In this sound: the length of the thump.',
    },
    tweaks: [
      { id: 'voice.detune', try: 'Move between 1 and 6', hear: 'From a tight, solid bass to a wide, seasick one.' },
      { id: 'vcf.res', try: 'Raise to 6', hear: 'Each note gets a rubbery squelch.' },
    ],
  },
  {
    id: 'jp6-arp', name: 'Arpeggio Pluck', ref: 'In the style of 80s synth-pop arpeggios', artist: 'Classic technique',
    tags: ['seq', 'synth-pop', '80s'], level: 1,
    blurb: 'A held chord turned into a running pattern of short, plucked notes over two octaves.',
    how: 'The arpeggio plays the held chord one note at a time, upwards over two octaves. Each note is short, and ENV-1 snaps the resonant filter open on every one, which gives the pluck.',
    phrase: { bpm: 100, loop: true, steps: [[0, 57, 3.9], [0, 60, 3.9], [0, 64, 3.9], [4, 53, 3.9], [4, 57, 3.9], [4, 60, 3.9]] },
    steps: [
      { title: 'Start the arpeggio', module: 'mode', why: 'UP starts the arpeggio: hold a chord and its notes play one at a time from the bottom up.\n- UP lit.\n- RATE 5.5 (5.9 notes a second): a quick, even run.\n- RANGE 2: press until the 2 lamp lights, so the pattern climbs two octaves before it starts again.\n- Listen for: the pattern is there, but still a plain saw.',
        set: { 'arp.up': true, 'arp.rate': 5.5, 'arp.range': 2 } },
      { title: 'A hollow pulse', module: 'osc', why: 'A pulse wave gives a hollow, woody tone that suits plucks.\n- VCO-1 SAWTOOTH off, PULSE lit, PW 2 (40 %): just off square.\n- Listen for: a softer, rounder pattern.',
        set: { 'vco1.saw': false, 'vco1.pulse': true, 'pwm.pw': 2 } },
      { title: 'Pluck the filter', module: 'filter', why: 'The filter rests dark and resonant, and ENV-1 snaps it open on every note.\n- FREQ 3.5 (143 Hz), RES 4 (40 %): dark, with a ring at the cutoff.\n- VCF ENV 5.5: how far ENV-1 opens it.\n- ENV-1 A 0, D 4 (150 ms), S 0, R 4: a snap that closes again within a sixth of a second.\n- ENV-2 S 6 (60 %): the notes hold a little lower than full.\n- Listen for: a “pew” on every note. More RES makes it squelchier.',
        set: { 'vcf.freq': 3.5, 'vcf.res': 4, 'vcf.env': 5.5, ...ENV('env1', 0, 4, 0, 4), 'env2.sustain': 6 } },
    ],
    context: {
      'arp.rate': 'In this sound: the speed of the run.',
      'arp.range': 'In this sound: how many octaves the pattern climbs.',
      'vcf.res': 'In this sound: the ring on each pluck.',
    },
    tweaks: [
      { id: 'arp.range', try: 'Step it to 4', hear: 'The pattern climbs four octaves before starting again.' },
      { id: 'arp.down', try: 'Light DOWN as well', hear: 'The pattern goes up and then back down.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

// The modular layout: each printed section cut out as a module (cuts are [x0, y0, x1, y1] on the long panel), four rows.
// The panel left of the keyboard (BEND, LFO-2) joins the memory row.
const modular = {
  brand: 'JUPITER-6',
  rows: [
    [[781, 236, 946, 528], [946, 236, 1244, 528], [1244, 236, 1474, 528], [1474, 236, 1698, 528], [1698, 236, 2086, 528], [2086, 236, 2526, 528]],
    [[2526, 236, 2713, 528], [2713, 236, 3236, 528], [3236, 236, 3430, 528], [3430, 236, 3817, 528], [3817, 236, 4165, 528]],
    [[781, 528, 1045, 830], [1045, 528, 1321, 830], [1321, 528, 1698, 830], [1698, 528, 2170, 830], [2170, 528, 2528, 830], [3898, 528, 4165, 830]],
    [[26, 345, 265, 830], [265, 345, 666, 830], [2528, 528, 3898, 830]],
  ].map((row) => row.map((cut) => ({ cut }))),
};

export default {
  id: 'jupiter-6', name: 'Jupiter-6', maker: 'Roland', year: 1983,
  heritage: 'Roland’s 1983 six-voice successor to the Jupiter-8, and one of the first synths with MIDI',
  summary: 'Six analogue voices, each with two VCOs (combinable waveforms, cross mod, sync either way) → a low-pass, high-pass or band-pass VCF → VCA, with two ADSRs that follow the keys. LFO-1 with delay, a performance LFO-2, unison with detune, glide and an arpeggiator.',
  view: { w: 4265, h: VIEW_H },
  theme: { panel: PANEL, panel2: '#151618', ink: INK, font: 'helv', weight: 600, cheeks: 'metal', cheekW: 20 },
  decor, areas, controls, jacks: [], init, toEngine, presets: [...presets, ...moreSounds], lineage, modular,
  signalNames: { env1: 'ENV-1', env2: 'ENV-2', lfo: 'LFO-1', lfo2: 'LFO-2', osc1: 'VCO-1', osc2: 'VCO-2' },
};
