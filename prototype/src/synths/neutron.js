// Behringer Neutron — SynthDef. Coordinates: faceplate crop of the 1200×1200 product photo, ×2
// (panel x = (photoX − 75) × 2, y = (photoY − 445) × 2).
import { annotate, clamp, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/neutron.js';
import lineage from '@/synths/lineage/neutron.js';
import unusual from '@/synths/unusual/neutron.js';

const OSC_SHAPES = ['tmod', 'pulse', 'saw', 'tri', 'sine'];
const OSC_SHAPE_NAMES = ['tone mod', 'pulse', 'saw', 'triangle', 'sine'];
const LFO_SHAPES = ['sine', 'tri', 'saw', 'sq', 'rsaw'];
const LFO_SHAPE_NAMES = ['sine', 'triangle', 'saw', 'square', 'reverse saw'];

/** Position 0..4 → gains for the two neighbouring shapes (linear crossfade). */
function morph(p, names) {
  const i = Math.min(Math.floor(clamp(p, 0, 4)), names.length - 2);
  const f = clamp(p, 0, 4) - i;
  const mix = {};
  if (1 - f > 0.001) mix[names[i]] = 1 - f;
  if (f > 0.001) mix[names[i + 1]] = f;
  return mix;
}
const morphFmt = (names) => (v) => {
  const n = Math.round(v);
  if (Math.abs(v - n) < 0.06) return names[n];
  const lo = Math.floor(v);
  return `${names[lo]} → ${names[lo + 1]} ${Math.round((v - lo) * 100)}%`;
};

const cutoffHz = (v) => expMap(v / 10, 10, 15000);
const lfoHz = (v) => expMap(v / 10, 0.02, 2000);
const attackS = (v) => expMap(v / 10, 0.0003, 5);
const decayS = (v) => expMap(v / 10, 0.0024, 10);
const releaseS = (v) => expMap(v / 10, 0.0015, 6);
const delayS = (v) => expMap(v / 10, 0.025, 0.64);
const shHz = (v) => expMap(v / 10, 0.26, 28);
const shGlideS = (v) => (v <= 0 ? 0 : expMap(v / 10, 0.0005, 1));
const slewS = (v) => expMap(v / 10, 0.001, 3);
const portaS = (v) => Math.pow(v / 10, 2) * 10;
const pct = (v) => `${Math.round(v * 10)}%`;
const RANGE_SEMI = { 32: -24, 16: -12, 8: 0, wide: 0 };
const MODE2 = { hp: 'bp', bp: 'lp', lp: 'hp' };

const controls = [];
const decor = [];
const jacks = [];
const knob = (id, x, y, rest, r = 26, style = 'neutron') =>
  controls.push({ id, type: 'knob', x, y, r, style, kind: 'cont', min: 0, max: 10, labelPos: 'bottom', labelSize: 13, ...rest });
const button = (id, x, y, rest) =>
  controls.push({ id, type: 'button', x, y, w: 26, h: 26, labelPos: 'bottom', labelSize: 11, ...rest });
const text = (x, y, t, size = 12, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
const led = (x, y, color, litWhen, r = 5) => decor.push({ t: 'led', x, y, r, color, ...(litWhen ? { litWhen } : {}) });

// ── Faceplate artwork (hardware view only) ────────────────────────────────
// Each section is printed the way the real panel is: a band of grey pattern across the top, then a brighter red plate
// that starts on the knobs' centre line. These go down first so the frames, lamps and lettering sit on top.
const PLATE = { fill: '#e02a25', stroke: 'rgba(255,255,255,0.55)', sw: 1.5 };
const section = (x, y, w, h, splitY, pat) => decor.push(
  { t: 'rect', hw: true, x: x + 5, y: y + 5, w: w - 10, h: splitY - y + 4, r: 7, fill: `url(#${pat})` },
  { t: 'rect', hw: true, x: x + 5, y: splitY, w: w - 10, h: y + h - 5 - splitY, r: 7, ...PLATE },
);
// Oscillators: mesh behind the TUNE knobs, cut away on a chamfer around the logo.
decor.push(
  { t: 'path', hw: true, d: 'M41 92 H400 L461 31 H505 V246 H41 Z', fill: 'url(#kysPatMesh)', stroke: 'none', w: 0 },
  { t: 'path', hw: true, d: 'M41 92 H400 L461 31', w: 1.5, opacity: 0.7 },
  { t: 'rect', hw: true, x: 41, y: 236, w: 464, h: 365, r: 7, ...PLATE },
);
section(518, 26, 166, 580, 94, 'kysPatMesh');
section(692, 26, 230, 310, 94, 'kysPatStripes');
section(692, 346, 94, 124, 400, 'kysPatMesh');
section(692, 476, 94, 130, 534, 'kysPatMesh');
section(932, 26, 356, 150, 90, 'kysPatDots');
section(932, 186, 356, 150, 250, 'kysPatWaves');
section(794, 346, 494, 124, 392, 'kysPatScales');
section(794, 482, 494, 124, 528, 'kysPatScales');
section(1298, 26, 250, 150, 90, 'kysPatFine');
section(1298, 186, 250, 150, 250, 'kysPatStripes');
section(1298, 346, 250, 124, 392, 'kysPatStripes');
section(1298, 482, 250, 124, 528, 'kysPatStripes');

// ── Frames ────────────────────────────────────────────────────────────────
decor.push(
  { t: 'frame', x: 36, y: 26, w: 474, h: 580, r: 10, labelAt: 'none' },
  { t: 'frame', x: 518, y: 26, w: 166, h: 580, r: 10, label: 'VCF', labelAt: 'bottom', labelSize: 14, gapW: 60 },
  { t: 'frame', x: 692, y: 26, w: 230, h: 310, r: 10, label: 'LFO', labelAt: 'bottom', labelSize: 14, gapW: 60 },
  { t: 'frame', x: 692, y: 346, w: 94, h: 260, r: 10, labelAt: 'none' },
  { t: 'frame', x: 932, y: 26, w: 356, h: 150, r: 10, label: 'DELAY', labelAt: 'bottom', labelSize: 14, gapW: 86 },
  { t: 'frame', x: 932, y: 186, w: 356, h: 150, r: 10, label: 'OVERDRIVE', labelAt: 'bottom', labelSize: 14, gapW: 126 },
  { t: 'frame', x: 794, y: 346, w: 494, h: 124, r: 10, label: 'ENVELOPE 1', labelAt: 'bottom', labelSize: 14, gapW: 130 },
  { t: 'frame', x: 794, y: 482, w: 494, h: 124, r: 10, label: 'ENVELOPE 2', labelAt: 'bottom', labelSize: 14, gapW: 130 },
  { t: 'frame', x: 1298, y: 26, w: 250, h: 150, r: 10, label: 'OUTPUT', labelAt: 'bottom', labelSize: 14, gapW: 96 },
  { t: 'frame', x: 1298, y: 186, w: 250, h: 150, r: 10, label: 'SAMPLE & HOLD', labelAt: 'bottom', labelSize: 14, gapW: 160 },
  { t: 'frame', x: 1298, y: 346, w: 250, h: 124, r: 10, label: 'SLEW RATE LIMITER', labelAt: 'bottom', labelSize: 14, gapW: 190 },
  { t: 'frame', x: 1298, y: 482, w: 250, h: 124, r: 10, label: 'ATTENUATORS', labelAt: 'bottom', labelSize: 14, gapW: 144 },
  { t: 'frame', x: 1558, y: 26, w: 512, h: 580, r: 10, labelAt: 'none' },
  { t: 'rect', x: 1840, y: 34, w: 222, h: 564, r: 8, fill: 'rgba(214,205,203,0.42)', stroke: 'none' },
  { t: 'rect', hw: true, x: 1563, y: 31, w: 502, h: 570, r: 7, fill: 'url(#kysPatBay)' },
);
[[46, 12], [700, 12], [1290, 12], [2054, 12], [46, 610], [700, 610], [1290, 610], [2054, 610]].forEach(([x, y]) =>
  decor.push({ t: 'screw', x, y, r: 7 }));
decor.push(
  { t: 'logo', x: 96, y: 58, size: 14, text: 'behringer', style: 'behringer' },
  { t: 'logo', x: 262, y: 60, size: 30, text: 'NEUTRON', sub: 'ANALOG SYNTHESIZER', style: 'neutron' },
);

// ── Oscillators ───────────────────────────────────────────────────────────
const OSC_X = { 1: 166, 2: 394 };
[1, 2].forEach((n) => {
  const x = OSC_X[n];
  knob(`osc${n}.tune`, x, 216, {
    min: -5, max: 5, def: 0, label: 'TUNE', module: 'osc',
    fmt: (v) => fmtSemi((v / 5) * 12),
    help: `Tunes Oscillator ${n} up or down by about an octave. With RANGE set to the wide (±10 octave) mode it sweeps the whole range, from clicks to above hearing.`,
  }, 50, 'neutron-big');
  knob(`osc${n}.shape`, x, 390, {
    min: 0, max: 4, def: 2, label: 'SHAPE', module: 'osc', fmt: morphFmt(OSC_SHAPE_NAMES),
    help: 'Morphs smoothly through five waveforms: tone mod, pulse, sawtooth, triangle, sine. Positions in between blend the two neighbours, so you can dial in tones no fixed waveform gives. The lamps show the blend: one bright lamp on a pure waveform, two dimmer lamps in between.',
  });
  knob(`osc${n}.width`, x, 534, {
    def: 5, label: 'WIDTH', module: 'osc', fmt: (v) => `${Math.round(5 + v * 9)}% duty`,
    help: 'Pulse width. It only changes the tone mod and pulse shapes: the centre is a hollow square, and either side gets thinner and more nasal.',
  });
  button(`osc${n}.range`, n === 1 ? 246 : 314, 410, {
    kind: 'enum', def: '8', label: 'RANGE', module: 'osc',
    options: [{ v: '32', label: "32'" }, { v: '16', label: "16'" }, { v: '8', label: "8'" }, { v: 'wide', label: '±10 OCT' }],
    help: 'Octave of the oscillator: 32’ is lowest, 8’ highest. The fourth setting (all three lamps lit) puts the TUNE knob into a very wide mode for LFO-slow or ultrasonic pitches.',
  });
  // octave lamps either side of the 8 / 16 / 32 legend, stepped down to the RANGE button that sets them
  const m = (px) => (n === 1 ? px : 560 - px); // oscillator 2 is the mirror image
  decor.push({ t: 'path', hw: true, w: 2, d: `M${m(250)} 290 H${m(236)} V322 H${m(226)} V354 H${m(216)} V378 H${m(246)} V397 M${m(250)} 322 H${m(236)} M${m(250)} 354 H${m(226)}` });
  ['8', '16', '32'].forEach((oct, i) =>
    led(n === 1 ? 250 : 310, 290 + i * 32, 'amber', { id: `osc${n}.range`, eq: oct, in: [oct, 'wide'] }));
  // shape lamps + glyphs, joined by the printed bus line
  decor.push({ t: 'line', hw: true, x1: m(112), y1: 316, x2: m(112), y2: 440, w: 2 });
  OSC_SHAPES.forEach((shape, i) => {
    const y = 316 + i * 31;
    decor.push({ t: 'line', hw: true, x1: m(91), y1: y, x2: m(112), y2: y, w: 2 });
    led(n === 1 ? 112 : 448, y, 'amber', { id: `osc${n}.shape`, morph: i }, 4);
    decor.push({ t: 'circle', hw: true, x: m(78), y, r: 13, sw: 1.6 });
    decor.push({ t: 'wave', x: n === 1 ? 78 : 482, y, size: 8, shape });
  });
  // the pulse-width "ripples" either side of WIDTH
  [[50, 5, 0.85], [61, 4, 0.55], [72, 3, 0.3]].forEach(([r, w, opacity]) => decor.push(
    { t: 'arc', hw: true, x, y: 534, r, a0: 58, a1: 122, w, opacity },
    { t: 'arc', hw: true, x, y: 534, r, a0: 238, a1: 302, w, opacity },
  ));
  decor.push({ t: 'tab', x, y: 463, text: '3340 VCO', size: 9, line: true, gap: false });
  decor.push({ t: 'tab', x, y: 606, text: `OSC ${n}`, size: 14 });
});
decor.push({ t: 'tab', x: 280, y: 236, text: 'OCTAVE', size: 12, gap: false });
['8', '16', '32'].forEach((oct, i) => text(280, 294 + i * 32, oct, 12));
knob('osc.mix', 280, 140, {
  min: -5, max: 5, def: -5, label: 'OSC MIX', module: 'mixer',
  fmt: (v) => `OSC 1 ${Math.round((5 - v) * 10)}% · OSC 2 ${Math.round((v + 5) * 10)}%`,
  help: 'Crossfades the two oscillators. Fully left is Oscillator 1 only, fully right is Oscillator 2 only, and the centre is an equal blend.',
});
button('osc.sync', 280, 486, {
  kind: 'bool', def: false, label: 'OSC SYNC', module: 'osc',
  help: 'Hard sync: Oscillator 1 forces Oscillator 2 to restart its wave on every cycle. Oscillator 2 then always plays Oscillator 1’s pitch, and its own TUNE knob changes the tone instead — a tearing, vocal sweep.',
});
button('osc.para', 280, 546, {
  kind: 'bool', def: false, label: 'PARAPHONIC', module: 'mode',
  help: 'Lets you play two notes at once: with two keys held, each oscillator takes its own note. They still share one filter and one amplifier.',
});
led(312, 486, 'amber', { id: 'osc.sync', eq: true }, 4);
led(312, 546, 'amber', { id: 'osc.para', eq: true }, 4);

// ── VCF ───────────────────────────────────────────────────────────────────
button('vcf.mode', 548, 96, {
  kind: 'enum', def: 'lp', label: 'MODE', module: 'filter',
  options: [{ v: 'hp', label: 'High-pass' }, { v: 'bp', label: 'Band-pass' }, { v: 'lp', label: 'Low-pass' }],
  help: 'Filter type. Low-pass removes brightness above the cutoff, high-pass removes bass below it, and band-pass keeps only a band around it. The VCF 2 jack always carries a different type at the same time.',
});
decor.push({ t: 'line', hw: true, x1: 564, y1: 158, x2: 564, y2: 210, w: 2 });
[['hp', 'HP'], ['bp', 'BP'], ['lp', 'LP']].forEach(([m, t], i) => {
  led(564, 158 + i * 26, 'amber', { id: 'vcf.mode', eq: m }, 4);
  text(540, 162 + i * 26, t, 10);
});
knob('vcf.freq', 624, 94, {
  def: 8.5, label: 'FREQ', module: 'filter', fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Filter cutoff, from 10 Hz to 15 kHz. In low-pass mode, turning left makes the sound darker; turning right lets the full buzz of the oscillators through.',
});
knob('vcf.reso', 624, 246, {
  def: 0, label: 'RESO', module: 'filter',
  help: 'Resonance: boosts a narrow band right at the cutoff, so filter movement sounds vocal and squelchy. Near maximum the filter rings on its own as a sine wave.',
});
button('vcf.keyTrk', 624, 324, {
  kind: 'bool', def: false, label: 'KEY\nTRK', labelPos: 'right', module: 'filter',
  help: 'Key tracking: the cutoff follows the notes you play, so high notes stay as bright as low ones. It also lets you play a self-oscillating filter in tune.',
});
led(594, 324, 'amber', { id: 'vcf.keyTrk', eq: true }, 4);
knob('vcf.modDepth', 624, 400, {
  def: 0, label: 'MOD DEPTH', module: 'mod', fmt: pct,
  help: 'How much the FREQ MOD input moves the cutoff. With nothing patched, that input is the LFO, so this is LFO-to-filter depth. Patch something else into FREQ MOD and this knob scales that instead. The mod wheel beside the keyboard turns this knob further, so you can bring the LFO in while a note sounds; a cable into FREQ MOD ignores the wheel.',
});
knob('vcf.envDepth', 624, 534, {
  def: 0, label: 'ENV DEPTH', module: 'filter', fmt: pct,
  help: 'How far Envelope 2 pushes the cutoff upwards on each note. It only goes up; for a downward sweep, patch INVERT into FREQ MOD.',
});

// ── Noise / VCA bias ──────────────────────────────────────────────────────
knob('mix.noise', 739, 400, {
  def: 0, label: 'NOISE', module: 'mixer', fmt: pct,
  help: 'Amount of white noise added into the filter. A little gives breath and grit; on its own it is the raw material for wind, hats and snares.',
});
knob('vca.bias', 739, 534, {
  def: 0, label: 'VCA BIAS', module: 'amp', fmt: pct,
  help: 'Holds the amplifier open by a fixed amount, whatever the envelope is doing. Turn it up for drones that sound without a key held.',
});

// ── LFO ───────────────────────────────────────────────────────────────────
button('lfo.keySync', 742, 94, {
  kind: 'bool', def: false, label: 'KEY SYNC', module: 'lfo',
  help: 'Restarts the LFO every time you play a note, so the wobble begins at the same point on each note instead of running free.',
});
led(773, 94, 'amber', { id: 'lfo.keySync', eq: true }, 4);
knob('lfo.rate', 860, 94, {
  def: 5, label: 'RATE', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'LFO speed. It runs from one cycle every 50 seconds right up into the audio range, where it stops sounding like a wobble and starts adding harsh new overtones.',
});
led(806, 60, 'blue', 'lfo', 5);
knob('lfo.shape', 806, 228, {
  min: 0, max: 4, def: 0, label: 'SHAPE', labelPos: 'none', ring: false, module: 'lfo', fmt: morphFmt(LFO_SHAPE_NAMES),
  help: 'Morphs the LFO through sine, triangle, sawtooth, square and reverse sawtooth. Smooth shapes give vibrato and sweeps, square gives trills, and the saws give repeating ramps. Between two shapes the LFO is a blend of both, and their two lamps share the light.',
}, 38);
LFO_SHAPES.forEach((shape, i) => {
  // the heavy printed arc that runs from lamp to lamp around the knob
  if (i < 4) decor.push({ t: 'arc', hw: true, x: 806, y: 228, r: 53, a0: -150 + i * 75 + 9, a1: -75 + i * 75 - 9, w: 9, cap: 'butt' });
  const a = ((-150 + i * 75) * Math.PI) / 180;
  decor.push({ t: 'circle', hw: true, x: 806 + Math.sin(a) * 78, y: 228 - Math.cos(a) * 76, r: 13, sw: 1.6 });
  led(806 + Math.sin(a) * 53, 228 - Math.cos(a) * 53, 'amber', { id: 'lfo.shape', morph: i }, 4);
  decor.push({ t: 'wave', x: 806 + Math.sin(a) * 78, y: 228 - Math.cos(a) * 76, size: 8, shape });
});
text(806, 318, 'SHAPE', 13);

// ── Delay / Overdrive ─────────────────────────────────────────────────────
knob('delay.time', 980, 90, {
  def: 5, label: 'TIME', module: 'fx', fmt: (v) => fmtTime(delayS(v)),
  help: 'Delay time, 25 to 640 ms. Short times thicken the sound; long times give distinct echoes. Moving it while sound is in the delay bends the pitch of the echoes, as on a tape machine.',
});
knob('delay.repeats', 1110, 90, {
  def: 3, label: 'REPEATS', module: 'fx', fmt: pct,
  help: 'How much of the echo is fed back in to echo again. Low gives one or two repeats; near maximum the echoes build instead of dying away.',
});
knob('delay.mix', 1240, 90, {
  def: 0, label: 'MIX', module: 'fx', fmt: pct,
  help: 'Balance between the dry synth and the echoes. Fully left is no delay at all.',
});
led(1045, 216, 'red', 'overload', 4);
knob('od.drive', 980, 250, {
  def: 1, label: 'DRIVE', module: 'fx',
  help: 'Overdrive amount, from gentle warmth to heavy distortion. It sits after the filter and before the amplifier, so the grit stays the same as a note fades.',
});
knob('od.tone', 1110, 250, {
  def: 5, label: 'TONE', module: 'fx',
  help: 'Tilts the overdrive’s tone. Left rolls off the top for a rounder sound; right thins the bass and adds bite.',
});
knob('od.level', 1240, 250, {
  def: 8, label: 'LEVEL', module: 'fx',
  help: 'Output level of the overdrive stage. Everything passes through here, so fully down silences the synth. It also sets how hard the delay is driven.',
});

// ── Envelopes ─────────────────────────────────────────────────────────────
const ENV_X = [860, 986, 1112, 1238];
[[1, 392, 'Envelope 1 shapes loudness (it is wired to the amplifier).'], [2, 528, 'Envelope 2 shapes the filter, through ENV DEPTH.']].forEach(([n, y, role]) => {
  const d = n === 1 ? { a: 0, d: 5, s: 10, r: 4 } : { a: 0, d: 5, s: 5, r: 4 };
  knob(`env${n}.a`, ENV_X[0], y, { def: d.a, label: 'A', module: 'env', fmt: (v) => fmtTime(attackS(v)),
    help: `Attack: how long the envelope takes to rise after a key is pressed. ${role}` });
  knob(`env${n}.d`, ENV_X[1], y, { def: d.d, label: 'D', module: 'env', fmt: (v) => fmtTime(decayS(v)),
    help: `Decay: how long the envelope takes to fall from its peak to the sustain level. ${role}` });
  knob(`env${n}.s`, ENV_X[2], y, { def: d.s, label: 'S', module: 'env', fmt: pct,
    help: `Sustain: the level the envelope holds at while the key stays down. ${role}` });
  knob(`env${n}.r`, ENV_X[3], y, { def: d.r, label: 'R', module: 'env', fmt: (v) => fmtTime(releaseS(v)),
    help: `Release: how long the envelope takes to fall to zero after the key is let go. ${role}` });
});

// ── Output / S&H / Slew / Attenuators ─────────────────────────────────────
knob('out.volume', 1362, 90, { def: 7, label: 'VOLUME', module: 'out', help: 'Main output level.' });
decor.push({ t: 'din', x: 1484, y: 92, r: 34 });
text(1484, 146, 'MIDI IN', 12);
led(1423, 56, 'amber', 'gate', 4);
led(1423, 214, 'blue', null, 4);
knob('sh.rate', 1362, 250, {
  def: 5, label: 'RATE', module: 'util', fmt: (v) => fmtHz(shHz(v)),
  help: 'How often the sample-and-hold takes a new reading of its input. With noise as the input (the default), each reading is a new random voltage.',
});
knob('sh.glide', 1486, 250, {
  def: 0, label: 'GLIDE', module: 'util', fmt: (v) => (v <= 0 ? 'off' : fmtTime(shGlideS(v))),
  help: 'Smooths the steps of the sample-and-hold output, so it slides from one random value to the next instead of jumping.',
});
knob('slew.time', 1362, 392, {
  def: 3, label: 'SLEW', module: 'util', fmt: (v) => fmtTime(slewS(v)),
  help: 'Slew limiter: slows down whatever is patched into SLEW IN, so sudden jumps become slides. Nothing is routed to it until you patch it.',
});
knob('porta.time', 1486, 392, {
  def: 0, label: 'PORTA TIME', module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaS(v))),
  help: 'Portamento: at zero the pitch jumps between notes; turn it up and the pitch slides from each note to the next.',
});
knob('att.1', 1362, 528, {
  def: 5, label: '1', module: 'util',
  help: 'Attenuator 1: a level control for whatever is patched into ATT1 IN. It is voltage controlled, so it can also act as a spare amplifier.',
});
knob('att.2', 1486, 528, {
  def: 0, label: '2', module: 'mod',
  help: 'Attenuator 2. With nothing patched, it carries the LFO and feeds both oscillators’ pulse-width inputs, so this knob is pulse-width modulation depth. Patch its jacks and it becomes a general-purpose level control.',
});

// ── Patch bay ─────────────────────────────────────────────────────────────
const IN_X = [1600, 1667, 1734, 1801];
const OUT_X = [1876, 1943, 2010];
const ROW_Y = [100, 162, 224, 286, 348, 410, 472, 534];
decor.push({ t: 'tab', x: 1700, y: 54, text: 'IN', size: 14, line: true, gap: false });
decor.push({ t: 'tab', x: 1943, y: 54, text: 'OUT', size: 14, gap: false });
const jin = (id, col, row, label, dest, amt, help, add = false, rest = {}) =>
  jacks.push({ id, x: IN_X[col], y: ROW_Y[row], r: 15, label, labelPos: 'bottom', labelSize: 10, dir: 'in', dest, amt, ...(add ? { add: true } : {}), help, ...rest });
const jout = (id, col, row, label, signal, help, rest = {}) =>
  jacks.push({ id, x: OUT_X[col], y: ROW_Y[row], r: 15, label, labelPos: 'bottom', labelSize: 10, dir: 'out', signal, help, ...rest });
// MOD DEPTH in octaves. The mod wheel turns the knob on top of where you left it, so the LFO can be
// ridden into the filter while a note sounds. The jack's own `amt` takes no wheel — a cable carries
// its own depth — so only the normalled LFO follows the wheel.
const freqModAmt = (v, wheel = 0) => (clamp(v['vcf.modDepth'] + wheel * 10, 0, 10) / 10) * 5;

jin('j.osc1In', 0, 0, 'OSC 1', 'pitch1', 24, 'Pitch control for Oscillator 1 only, added to the keyboard pitch.', true);
jin('j.osc2In', 1, 0, 'OSC 2', 'pitch2', 24, 'Pitch control for Oscillator 2 only. With OSC SYNC on, anything patched here changes the tone rather than the pitch.', true);
jin('j.osc12In', 2, 0, 'OSC 1+2', 'pitchAll', 24, 'Pitch control for both oscillators together. A full-strength signal moves the pitch a long way, so send it through an attenuator first.', true);
jin('j.invertIn', 3, 0, 'INVERT IN', 'invertIn', 1, 'Input of the inverter. With nothing patched it carries Envelope 2.');
jin('j.shape1', 0, 1, 'SHAPE 1', null, 0, 'Voltage control of Oscillator 1’s SHAPE. Not modelled in this app: a cable here has no audible effect.');
jin('j.shape2', 1, 1, 'SHAPE 2', null, 0, 'Voltage control of Oscillator 2’s SHAPE. Not modelled in this app: a cable here has no audible effect.');
jin('j.pw1', 2, 1, 'PW 1', 'pw1', 0.45, 'Pulse-width control for Oscillator 1. Normally fed by Attenuator 2 (the LFO); a cable here replaces that.');
jin('j.pw2', 3, 1, 'PW 2', 'pw2', 0.45, 'Pulse-width control for Oscillator 2. Normally fed by Attenuator 2 (the LFO); a cable here replaces that.');
jin('j.vcfIn', 0, 2, 'VCF IN', 'vcfIn', 1, 'Audio input of the filter. Normally the oscillator mix and noise; a cable here replaces them.');
jin('j.freqMod', 1, 2, 'FREQ MOD', 'cutoff', freqModAmt, 'Cutoff modulation input, scaled by the MOD DEPTH knob. Normally the LFO; a cable here replaces it.', false,
  { check: (v) => (v['vcf.modDepth'] <= 0 ? 'MOD DEPTH is at 0, and that knob scales everything arriving at FREQ MOD. Turn MOD DEPTH up to hear this cable.' : null) });
jin('j.res', 2, 2, 'RES', 'res', 0.6, 'Voltage control of resonance, added to the RESO knob.', true);
jin('j.odIn', 3, 2, 'OD IN', 'odIn', 1, 'Audio input of the overdrive. Normally the filter’s main output.');
jin('j.vcaIn', 0, 3, 'VCA IN', 'vcaIn', 1, 'Audio input of the amplifier. Normally the overdrive output.');
jin('j.vcaCv', 1, 3, 'VCA CV', 'amp', 1, 'Loudness control. Normally Envelope 1; patch the LFO here instead for tremolo, or Envelope 2 to free Envelope 1 for other jobs.');
jin('j.delayIn', 2, 3, 'DELAY IN', 'delayIn', 1, 'Audio input of the delay. Normally the amplifier output.');
jin('j.delayTime', 3, 3, 'DELAY TIME', 'delayTime', 1.5, 'Voltage control of delay time, added to the TIME knob. Slow, shallow movement gives chorus and tape wobble.', true);
jin('j.gate1', 0, 4, 'E.GATE 1', 'gate1', 1, 'Trigger input for Envelope 1. Normally the keyboard gate. Patch the square LFO here to re-trigger notes rhythmically.');
jin('j.gate2', 1, 4, 'E.GATE 2', 'gate2', 1, 'Trigger input for Envelope 2. Normally follows Envelope 1’s gate.');
jin('j.shIn', 2, 4, 'S&H IN', 'shIn', 1, 'The signal the sample-and-hold takes readings of. Normally white noise, which gives random steps.');
jin('j.shClock', 3, 4, 'S&H CLOCK', 'shClock', 1, 'External clock for the sample-and-hold, replacing its RATE knob. Patch MIDI GATE here for one new random value per note.');
jin('j.lfoRate', 0, 5, 'LFO RATE', 'lfoRate', 4, 'Voltage control of LFO speed, added to the RATE knob.', true);
jin('j.lfoShape', 1, 5, 'LFO SHAPE', null, 0, 'Voltage control of the LFO SHAPE morph. Not modelled in this app: a cable here has no audible effect.');
jin('j.lfoTrig', 2, 5, 'LFO TRIG', 'lfoTrig', 1, 'Restarts the LFO cycle each time the input goes high.');
jin('j.multIn', 3, 5, 'MULT', 'multIn', 1, 'Input of the multiple, which copies one signal to the MULT 1 and MULT 2 outputs. Normally carries the LFO.');
jin('j.att1In', 0, 6, 'ATT1 IN', 'att1In', 1, 'Input of Attenuator 1. Normally fed from Attenuator 2’s output.');
jin('j.att1Cv', 1, 6, 'ATT1 CV', 'att1CV', 1, 'Voltage control of Attenuator 1’s level. Normally fed from the ASSIGN output.');
jin('j.att2In', 2, 6, 'ATT2 IN', 'att2In', 1, 'Input of Attenuator 2. Normally the LFO. Patch an envelope here and the ATT 2 knob sets how much of it you send on.');
jin('j.slewIn', 3, 6, 'SLEW IN', 'slewIn', 1, 'Input of the slew limiter. Nothing is connected until you patch it.');
jin('j.sum1A', 0, 7, 'SUM 1(A)', 'sum1A', 1, 'First input of summer 1. The SUM 1 output is A plus B.');
jin('j.sum1B', 1, 7, 'SUM 1(B)', 'sum1B', 1, 'Second input of summer 1.');
jin('j.sum2A', 2, 7, 'SUM 2(A)', 'sum2A', 1, 'First input of summer 2. The SUM 2 output is A plus B.');
jin('j.sum2B', 3, 7, 'SUM 2(B)', 'sum2B', 1, 'Second input of summer 2.');

jout('j.osc1', 0, 0, 'OSC 1', 'osc1', 'Oscillator 1 on its own, before the mix. At audio rate it makes a strong modulation source.');
jout('j.osc2', 1, 0, 'OSC 2', 'osc2', 'Oscillator 2 on its own. Set OSC MIX fully left and you can use Oscillator 2 purely as a modulator.');
jout('j.oscMix', 2, 0, 'OSC MIX', 'oscMix', 'The oscillator crossfade, before noise is added and before the filter.');
jout('j.vcf1', 0, 1, 'VCF 1', 'vcf1', 'The filter’s main output, in the type chosen by MODE.');
jout('j.vcf2', 1, 1, 'VCF 2', 'vcf2', 'The filter’s second output, always a different type from VCF 1: band-pass when MODE is high-pass, low-pass when band-pass, high-pass when low-pass.');
jout('j.od', 2, 1, 'OVERDRIVE', 'od', 'Output of the overdrive stage.');
jout('j.vca', 0, 2, 'VCA', 'vca', 'Output of the amplifier, before the delay.');
jout('j.out', 1, 2, 'OUTPUT', 'out', 'The main output, after the delay.');
jout('j.noise', 2, 2, 'NOISE', 'noise', 'White noise. Useful as a random modulation source as well as a sound.');
jout('j.env1', 0, 3, 'ENV 1', 'env1', 'Envelope 1 as a voltage.');
jout('j.env2', 1, 3, 'ENV 2', 'env2', 'Envelope 2 as a voltage. Patch it to pitch for drum sweeps and sync leads.');
jout('j.invert', 2, 3, 'INVERT', 'invert', 'The inverter’s output: Envelope 2 turned upside down unless something else is patched into INVERT IN.');
jout('j.lfo', 0, 4, 'LFO', 'lfo', 'The LFO, swinging both above and below zero.');
jout('j.lfoUni', 1, 4, 'LFO UNI', 'lfoUni', 'The LFO shifted so it only goes upwards from zero. Use it where a control should be pushed one way only.');
jout('j.sh', 2, 4, 'S&H', 'sh', 'Sample-and-hold output: a stepped random voltage by default. It goes nowhere until you patch it.');
jout('j.mult1', 0, 5, 'MULT 1', 'mult', 'First copy of whatever is at the MULT input (the LFO by default).');
jout('j.mult2', 1, 5, 'MULT 2', 'mult', 'Second copy of whatever is at the MULT input.');
jout('j.midiGate', 2, 5, 'MIDI GATE', 'gate', 'High while a key is held.');
jout('j.att1', 0, 6, 'ATT 1', 'att1', 'Output of Attenuator 1.',
  { check: (v) => (v['att.1'] <= 0 ? 'The ATT 1 knob is at 0, so nothing comes out of this jack. Turn ATT 1 up.' : null) });
jout('j.att2', 1, 6, 'ATT 2', 'att2', 'Output of Attenuator 2: the LFO at the level set by the ATT 2 knob, unless you patch something else into ATT2 IN.',
  { check: (v) => (v['att.2'] <= 0 ? 'The ATT 2 knob is at 0, so nothing comes out of this jack. Turn ATT 2 up.' : null) });
jout('j.slew', 2, 6, 'SLEW', 'slew', 'Output of the slew limiter.');
jout('j.sum1', 0, 7, 'SUM 1', 'sum1', 'Sum of the two SUM 1 inputs.');
jout('j.sum2', 1, 7, 'SUM 2', 'sum2', 'Sum of the two SUM 2 inputs.');
jout('j.assign', 2, 7, 'ASSIGN', 'kbd', 'An assignable MIDI-to-voltage output. In this app it carries the keyboard pitch.');

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas = [
  { id: 'osc1', label: 'Oscillator 1', module: 'osc', keywords: 'vco pitch waveform tone source',
    rects: [{ x: 41, y: 138, w: 200, h: 100 }, { x: 41, y: 238, w: 222, h: 226 }, { x: 41, y: 464, w: 195, h: 137 }],
    help: 'The first of two sound sources. TUNE sets its pitch, RANGE picks the octave, SHAPE morphs between five waveforms and WIDTH thins the pulse shapes. The lamps show which waveform and octave are selected.' },
  { id: 'osc2', label: 'Oscillator 2', module: 'osc', keywords: 'vco pitch waveform detune',
    rects: [{ x: 319, y: 138, w: 186, h: 100 }, { x: 297, y: 238, w: 208, h: 226 }, { x: 324, y: 464, w: 181, h: 137 }],
    help: 'The second sound source, with the same controls as Oscillator 1. Detune it slightly against Oscillator 1 for a thicker sound, or turn on OSC SYNC and use its TUNE knob to change the tone instead of the pitch.' },
  { id: 'oscmix', label: 'Oscillator mix', module: 'mixer', keywords: 'balance crossfade blend',
    rects: [{ x: 241, y: 96, w: 78, h: 102 }],
    help: 'Sets the balance between the two oscillators before they reach the filter. Fully left is Oscillator 1 only, fully right is Oscillator 2 only.' },
  { id: 'sync', label: 'Sync and paraphonic', module: 'mode', keywords: 'hard sync duophonic two notes',
    rects: [{ x: 238, y: 466, w: 84, h: 122 }],
    help: 'OSC SYNC locks Oscillator 2 to Oscillator 1’s pitch, for the hard, tearing sync sound. PARAPHONIC lets you play two notes at once, one on each oscillator.' },
  { id: 'vcf', label: 'Filter (VCF)', module: 'filter', keywords: 'cutoff resonance low-pass high-pass band-pass brightness tone',
    rects: [{ x: 518, y: 26, w: 166, h: 580 }],
    help: 'Removes part of the sound to shape its tone. MODE picks low-pass, band-pass or high-pass, FREQ sets where the filter cuts, and RESO emphasises the sound at that point. MOD DEPTH and ENV DEPTH set how far the LFO and Envelope 2 move the cutoff.' },
  { id: 'lfo', label: 'LFO', module: 'lfo', keywords: 'low frequency oscillator vibrato wobble tremolo modulation',
    rects: [{ x: 692, y: 26, w: 230, h: 310 }],
    help: 'A slow repeating wave that moves other settings; you do not hear it directly. RATE sets its speed and SHAPE morphs its waveform. With nothing patched it reaches the filter through MOD DEPTH, and pulse width through Attenuator 2.' },
  { id: 'noise', label: 'Noise', module: 'mixer', keywords: 'white noise hiss wind snare hat',
    rects: [{ x: 692, y: 346, w: 94, h: 124 }],
    help: 'Adds white noise to the oscillators before the filter. Use a little for breath and grit, or use it alone for wind, hi-hats and snares.' },
  { id: 'vcabias', label: 'VCA bias', module: 'amp', keywords: 'amplifier drone hold open',
    rects: [{ x: 692, y: 476, w: 94, h: 130 }],
    help: 'Holds the amplifier open without a key pressed. Turn it up for drones, or to hear the synth while you set up a patch.' },
  { id: 'delay', label: 'Delay', module: 'fx', keywords: 'echo repeats feedback bbd',
    rects: [{ x: 932, y: 26, w: 356, h: 150 }],
    help: 'An analogue-style echo at the end of the signal path. TIME sets the gap between echoes, REPEATS how many you hear, and MIX how loud they are against the dry sound.' },
  { id: 'overdrive', label: 'Overdrive', module: 'fx', keywords: 'distortion drive grit fuzz',
    rects: [{ x: 932, y: 186, w: 356, h: 150 }],
    help: 'Distortion placed after the filter. DRIVE sets how hard it clips, TONE makes it darker or brighter, and LEVEL sets the volume coming out. Everything passes through LEVEL, so at zero the synth is silent.' },
  { id: 'env1', label: 'Envelope 1 (loudness)', module: 'env', keywords: 'adsr attack decay sustain release amplifier volume',
    rects: [{ x: 794, y: 346, w: 494, h: 124 }],
    help: 'Shapes the loudness of each note: it is wired to the amplifier. A is the fade-in time, D the fall to the held level, S the level held while the key is down, and R the fade-out after you let go.' },
  { id: 'env2', label: 'Envelope 2 (filter)', module: 'env', keywords: 'adsr attack decay sustain release filter sweep',
    rects: [{ x: 794, y: 482, w: 494, h: 124 }],
    help: 'Shapes the filter over each note, by the amount set with ENV DEPTH. It has the same four stages as Envelope 1. Its signal is also at the ENV 2 jack, for patching to other things such as pitch.' },
  { id: 'output', label: 'Output', module: 'out', keywords: 'volume midi level',
    rects: [{ x: 1298, y: 26, w: 250, h: 150 }],
    help: 'VOLUME sets the main output level, and the lamp lights while a note is held. MIDI IN is where a keyboard or sequencer connects on the hardware.' },
  { id: 'sh', label: 'Sample and hold', module: 'util', keywords: 's&h random stepped',
    rects: [{ x: 1298, y: 186, w: 250, h: 150 }],
    help: 'Takes a reading of its input at the speed set by RATE and holds it until the next one. The input is noise unless you patch something else, so the result is a stepped random voltage. GLIDE smooths the steps. It does nothing until you patch the S&H output somewhere.' },
  { id: 'slew', label: 'Slew and portamento', module: 'glide', keywords: 'glide slide lag smooth',
    rects: [{ x: 1298, y: 346, w: 250, h: 124 }],
    help: 'SLEW smooths whatever is patched into SLEW IN, turning jumps into slides. PORTA TIME is separate: it makes the pitch slide from one played note to the next.' },
  { id: 'atten', label: 'Attenuators', module: 'util', keywords: 'level pwm pulse width modulation amount',
    rects: [{ x: 1298, y: 482, w: 250, h: 124 }],
    help: 'Two level controls for patch signals. Attenuator 2 carries the LFO to both oscillators’ pulse width unless you patch its jacks, so its knob sets pulse-width modulation depth. Attenuator 1 is free for anything you patch into ATT1 IN.' },
  { id: 'bayIn', label: 'Patch bay inputs', module: 'patch', keywords: 'jacks sockets cv in semi-modular',
    rects: [{ x: 1558, y: 26, w: 280, h: 580 }],
    help: '32 sockets that accept a signal. Patching into one replaces, or adds to, that section’s normal internal connection: a cable into FREQ MOD takes over from the LFO, for example. Hover over a jack with Explain sections off to see what it controls.' },
  { id: 'bayOut', label: 'Patch bay outputs', module: 'patch', keywords: 'jacks sockets cv out semi-modular',
    rects: [{ x: 1838, y: 26, w: 232, h: 580 }],
    help: '24 sockets that send a signal out, marked on the hardware by solid white labels. A cable always runs from an output to an input. To feed one output to two inputs, go through MULT.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v, ctx) {
  const wheel = clamp((ctx && ctx.wheel) || 0, 0, 1);
  const mix = (v['osc.mix'] + 5) / 10;
  const osc = [1, 2].map((n) => {
    const range = v[`osc${n}.range`];
    return {
      level: (n === 1 ? 1 - mix : mix) * 0.95,
      mix: morph(v[`osc${n}.shape`], OSC_SHAPES),
      pw: clamp(0.05 + (v[`osc${n}.width`] / 10) * 0.9, 0.03, 0.97),
      semi: RANGE_SEMI[range] + (v[`osc${n}.tune`] / 5) * (range === 'wide' ? 60 : 12),
      kbd: true, fixedNote: 60, syncTo: n === 2 && v['osc.sync'] ? 0 : -1,
    };
  });
  const mode = v['vcf.mode'];
  return {
    osc,
    noise: { level: level10(v['mix.noise'], 0.8), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'svf', mode, mode2: MODE2[mode], cutoff: cutoffHz(v['vcf.freq']), res: (v['vcf.reso'] / 10) * 1.08,
      envAmt: (v['vcf.envDepth'] / 10) * 8, envSrc: 'env2', kbd: v['vcf.keyTrk'] ? 1 : 0,
    },
    env1: { a: attackS(v['env1.a']), d: decayS(v['env1.d']), s: v['env1.s'] / 10, r: releaseS(v['env1.r']) },
    env2: { a: attackS(v['env2.a']), d: decayS(v['env2.d']), s: v['env2.s'] / 10, r: releaseS(v['env2.r']) },
    vca: { envSrc: 'none', bias: v['vca.bias'] / 10 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: morph(v['lfo.shape'], LFO_SHAPES), keySync: !!v['lfo.keySync'] },
    glide: { time: portaS(v['porta.time']), legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: !!v['osc.para'],
    routes: [],
    normals: {
      cutoff: ['lfo', freqModAmt(v, wheel)], amp: 'env1', pw1: ['att2', 0.45], pw2: ['att2', 0.45],
      att2In: 'lfo', att1In: 'att2', att1CV: 'kbd', multIn: 'lfo', invertIn: 'env2', shIn: 'noise',
    },
    od: { on: true, drive: v['od.drive'] / 10, tone: v['od.tone'] / 10, level: level10(v['od.level'], 1) },
    delay: { on: true, time: delayS(v['delay.time']), fb: (v['delay.repeats'] / 10) * 0.97, mix: v['delay.mix'] / 10 },
    sh: { rate: shHz(v['sh.rate']), glide: shGlideS(v['sh.glide']) },
    slew: { time: slewS(v['slew.time']) },
    att: [level10(v['att.1'], 1.58), level10(v['att.2'], 1)],
    tune: 0,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'acid-squelch', name: 'Acid Squelch', ref: 'In the style of Phuture — "Acid Tracks"', artist: 'Acid house',
    tags: ['bass', 'acid', 'techno'], level: 1,
    blurb: 'Squelchy, sliding bass line where the filter does all the talking.',
    how: 'One sawtooth goes into a low-pass filter with a lot of resonance. Envelope 2 snaps the filter open and shut on every note, and the resonance turns that snap into the "squelch". Overdrive after the filter roughens it up, and a little portamento makes the notes slide into each other.',
    phrase: { bpm: 126, loop: true, steps: [[0, 36, 0.2], [0.5, 36, 0.2], [0.75, 48, 0.3], [1.25, 36, 0.2], [1.5, 39, 0.45], [2, 36, 0.2], [2.5, 46, 0.3], [2.75, 36, 0.2], [3.25, 43, 0.3], [3.5, 41, 0.45]] },
    steps: [
      { title: 'One sawtooth, an octave down', module: 'osc', why: 'Start with one bright, buzzy oscillator pitched low. Acid bass is a single plain wave, with all the character added later by the filter.\n- OSC MIX −5 (OSC 1 only): OSC is short for oscillator, the part that makes the raw tone. The Neutron crossfades its two oscillators instead of giving each a level knob; fully left means only Oscillator 1 is heard.\n- SHAPE 2 (saw): the middle of the morph is a sawtooth, which carries every harmonic and gives the filter plenty to chew on. Left of 2 gets hollower (pulse), right gets softer (triangle, sine).\n- RANGE 16’: footage comes from organ pipes; 16’ is an octave below 8’, which puts the line in bass territory.\n- TUNE 0: centred, so the oscillator plays in tune with the keys. This knob covers about an octave each way, so it is easy to knock.\n- Listen for: a raw, bright buzz. The filter is still wide open at 5 kHz, so nothing squelches yet.',
        set: { 'osc.mix': -5, 'osc1.shape': 2, 'osc1.range': '16', 'osc1.tune': 0 } },
      { title: 'Low-pass, nearly shut, lots of resonance', module: 'filter', why: 'Now the filter shuts most of that buzz away. The VCF (voltage-controlled filter) removes part of the sound; here it rests almost closed, waiting for an envelope to open it.\n- MODE low-pass: keeps what is below the cutoff and removes the brightness above it. It is a 12 dB per octave filter, gentler than a Moog’s, so a little buzz still leaks through.\n- FREQ 3.8 (161 Hz): the cutoff, and where the filter rests between notes. This low, the note is a dull thud. Turn right to let the buzz back in; this is the knob to ride by hand once the pattern plays.\n- RESO 7.8: resonance, a boost in a narrow band right at the cutoff. This is the squelch. Lower it for a plain plucky bass; near maximum the filter starts to whistle.\n- KEY TRK off: key tracking would make the cutoff follow the notes. Off, every note gets the same filter.\n- Listen for: not much yet. The resonance only shows once the cutoff moves; sweep FREQ slowly and you will hear it sing.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 3.8, 'vcf.reso': 7.8, 'vcf.keyTrk': false } },
      { title: 'Let Envelope 2 snap the filter open', module: 'env', why: 'This is where the squelch appears. An envelope is a shape that runs once per note; Envelope 2 is wired inside to the filter, so it kicks the cutoff up at the start of every note and lets it fall back.\n- ENV DEPTH 6 (60%): ENV is short for envelope. This sets how far Envelope 2 lifts the cutoff above 161 Hz, which is the size of the “wow” on each note. It only pushes upwards.\n- A 0 ms (env 2): attack. The filter jumps open the instant a key goes down, so the bite lands on the beat.\n- D 110 ms: decay, how fast it closes again. Short is a tight blip; long is a lazy sweep.\n- S 0%: sustain. At zero the filter always closes fully, so every note gets the same “wow” however long it is held.\n- R 18 ms: release after you let go. Short, so there is no filter tail.\n- Listen for: a vocal “wow” on each note as the resonant peak sweeps down. Turn ENV DEPTH and D while repeating one note to hear the size and length change.',
        set: { 'vcf.envDepth': 6, 'env2.a': 0, 'env2.d': 4.6, 'env2.s': 0, 'env2.r': 3 } },
      { title: 'Tight loudness', module: 'amp', why: 'Envelope 1 shapes the volume of each note. It is wired inside to the VCA (voltage-controlled amplifier), the stage that opens and closes the sound, so other synths would call this the amp envelope.\n- A 0 ms (env 1): instant attack, so the note speaks straight away and lines up with the filter snap.\n- D 360 ms, S 70%: after the peak the level eases down over about a third of a second to 70% and holds there. Held notes lose a little weight rather than droning on at full level.\n- R 18 ms: a very short release. Notes stop almost as soon as the key comes up, so the gaps in the pattern stay clean.\n- Listen for: crisp gaps between notes. Raise R to 6 or so and the notes smear together and the pattern loses its bounce; set it back to 3.',
        set: { 'env1.a': 0, 'env1.d': 6, 'env1.s': 7, 'env1.r': 3 } },
      { title: 'Overdrive and slide', module: 'fx', why: 'The last step adds the rasp and the slide that acid lines are known for.\n- DRIVE 5.5: the overdrive sits after the filter, so it distorts the resonant peak itself and exaggerates it. That is a large part of the acid rasp. Turn it back to 1 to hear the cleaner line underneath.\n- TONE 5.5: just right of centre. Left rolls off the top for a rounder sound; right thins the bass and adds bite.\n- LEVEL 7: the overdrive’s output. Everything passes through here, so it works as a volume control; at zero the synth is silent.\n- PORTA TIME 1.2 (140 ms): portamento, a pitch slide from each note to the next. Here it applies to every note.\n- Listen for: each note bending into the next, with a gritty edge on the squelch. Flip DRIVE between 1 and 5.5 for a quick A/B.',
        set: { 'od.drive': 5.5, 'od.tone': 5.5, 'od.level': 7, 'porta.time': 1.2 } },
    ],
    context: {
      'vcf.freq': 'In this sound the cutoff is where the filter rests between notes. This is the knob to ride by hand while the pattern plays.',
      'vcf.reso': 'This is the squelch. Lower it and the line turns into a plain plucky bass; near maximum the filter starts to whistle.',
      'vcf.envDepth': 'The size of the "wow" on each note.',
      'env2.d': 'The length of the "wow". Short is a tight blip; long is a lazy sweep.',
      'od.drive': 'Distortion after the filter exaggerates the resonant peak, which is a large part of the acid rasp.',
      'porta.time': 'The slide between notes. Here it applies to every note.',
    },
    tweaks: [
      { id: 'vcf.freq', try: 'Sweep slowly between 2.5 and 6 while the pattern plays', hear: 'The classic acid build: from muffled blips to a bright, screaming line.' },
      { id: 'env2.d', try: 'Move between 3 and 6.5', hear: 'Short decays sound percussive; long ones let each note open out.' },
      { id: 'osc1.shape', try: 'Turn SHAPE left to 1 (pulse)', hear: 'A hollower, more rubbery tone — the other classic acid waveform. Stop halfway for a blend of the two.' },
      { id: 'od.drive', try: 'Push to 8', hear: 'Much dirtier, with the resonant peak squashed into a snarl.' },
    ],
  },
  {
    id: 'random-steps', name: 'Random Filter Steps', ref: 'In the style of 70s sci-fi "computer" sounds', artist: 'Classic technique',
    tags: ['fx', 'seq', '70s'], level: 1,
    blurb: 'Hold one note and the filter jumps to a new random setting several times a second.',
    how: 'The sample-and-hold takes a reading of white noise at a steady rate and holds it until the next reading, giving a stepped random voltage. On the Neutron that voltage goes nowhere until you patch it. One cable from S&H to FREQ MOD sends it to the filter cutoff, and high resonance makes each step sound like a different pitch.',
    phrase: { bpm: 60, loop: true, steps: [[0, 48, 3.8], [4, 43, 3.8]] },
    steps: [
      { title: 'A pulse wave to filter', module: 'osc', why: 'A plain, hollow tone to start, so the filter steps later on are easy to pick out.\n- OSC MIX −5 (OSC 1 only): OSC is short for oscillator, the part that makes the raw tone. Fully left on the crossfade means only Oscillator 1 is heard.\n- SHAPE 1 (pulse): one step left of the sawtooth on the morph. A pulse sounds hollower and reedier than a saw, and its gaps between harmonics make filter changes stand out.\n- WIDTH 5 (50% duty): pulse width. At the centre the pulse is a square, the hollowest setting; either side it gets thinner and more nasal.\n- RANGE 16’: an octave below 8’, low enough that there are plenty of harmonics above the note for the filter to pick out.\n- Listen for: a hollow, woody buzz. Turn WIDTH either side of 5 to hear it thin out, then return it to 5.',
        set: { 'osc.mix': -5, 'osc1.shape': 1, 'osc1.width': 5, 'osc1.range': '16' } },
      { title: 'Resonant low-pass, part closed', module: 'filter', why: 'The VCF (voltage-controlled filter) takes away brightness. Its cutoff here is the centre point the random steps will jump around.\n- MODE low-pass: keeps what is below the cutoff and removes what is above.\n- FREQ 5 (387 Hz): the centre of the random steps. Higher and the steps sit in a brighter, squeakier range; lower and they sound deeper.\n- RESO 7: resonance, a boost in a narrow band at the cutoff. This high, it picks out one harmonic at each position, so every jump will sound like a new pitch.\n- ENV DEPTH 0: ENV is short for envelope. At zero, Envelope 2 does not move the cutoff, so only the random voltage will.\n- Listen for: a darker tone with a slight ring around 387 Hz. Sweep FREQ by hand to preview the kind of movement the random steps will make.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 5, 'vcf.reso': 7, 'vcf.envDepth': 0 } },
      { title: 'Patch S&H to FREQ MOD', module: 'patch', why: 'One cable brings the random voltage to the filter. S&H stands for sample and hold: it reads white noise at a steady rate and holds each reading until the next, giving a random staircase of voltages. On the Neutron it goes nowhere until you patch it.\n- S&H → FREQ MOD: FREQ MOD is the filter’s cutoff modulation input. It is normally fed by the LFO (low-frequency oscillator); this cable replaces the LFO, so the stepped random voltage is now what moves the cutoff.\n- Listen for: nothing new yet. MOD DEPTH, which sets how much of the FREQ MOD input reaches the cutoff, is still at 0. The next step turns it up.',
        set: {}, cables: [['j.sh', 'j.freqMod']] },
      { title: 'Set how far and how fast', module: 'mod', why: 'Now the filter starts jumping. These three knobs set how far, how often and how smoothly.\n- MOD DEPTH 5.5 (55%): scales whatever arrives at FREQ MOD, which is now the S&H. This is the size of the random jumps. Low keeps them close to 387 Hz; high throws the cutoff from dark to squeaky.\n- RATE (S&H) 6.2 (4.73 Hz): how often a new random value is picked, just under five times a second. The S&H has its own clock, separate from the LFO.\n- GLIDE 0: the steps jump cleanly. Turn it up and the cutoff slides between values, more like a drunken LFO than a computer.\n- Listen for: hold one note. The tone lands on a new random resonant pitch several times a second, the classic 70s computer burble. Turn GLIDE up briefly to hear the steps melt into slides.',
        set: { 'vcf.modDepth': 5.5, 'sh.rate': 6.2, 'sh.glide': 0 } },
      { title: 'Hold the note, add echo', module: 'fx', why: 'The note is held for the whole effect, and a short echo fills the spaces between steps.\n- A 0 / S 100% / R 95 ms (env 1): Envelope 1 shapes loudness. Instant attack, full sustain so a held note stays at full level while the filter steps, and a short release so the note does not stop with a click.\n- MIX 3 (30%): the balance of echo against the dry sound. At 0 there is no delay at all.\n- TIME 6 (170 ms): short echoes. Each one lands before the next random step arrives, about 210 ms later.\n- REPEATS 4.5 (45%): how much echo is fed back, giving two or three audible repeats before it fades. The delay is analogue, so each repeat is a little darker.\n- Listen for: each random step followed by fainter copies, which makes the pattern sound busier. Pull MIX to 0 for a dry comparison.',
        set: { 'env1.a': 0, 'env1.s': 10, 'env1.r': 5, 'delay.mix': 3, 'delay.time': 6, 'delay.repeats': 4.5 } },
    ],
    context: {
      'sh.rate': 'How many random steps per second.',
      'sh.glide': 'At zero the filter jumps. Turn it up and it slides between values, more like a drunken LFO than a computer.',
      'vcf.modDepth': 'The size of the random jumps. It scales the FREQ MOD input, which is now the S&H.',
      'vcf.reso': 'High resonance makes each step ring at its own pitch.',
      'vcf.freq': 'The centre the random steps move around.',
    },
    tweaks: [
      { id: 'sh.glide', try: 'Raise to 5', hear: 'The hard steps turn into smooth random wandering.' },
      { id: 'sh.rate', try: 'Turn fully up', hear: 'The steps blur into a bubbling texture.' },
      { id: 'vcf.mode', try: 'Press MODE for band-pass', hear: 'Thinner and more vocal, like a talking robot.' },
      { id: 'vcf.reso', try: 'Push to 10 and turn OSC 1 down with noise at 0', hear: 'The filter sings random sine-wave notes on its own.' },
    ],
  },
  {
    id: 'snarl-bass', name: 'Audio-Rate Snarl Bass', ref: 'In the style of industrial techno — Surgeon, Blawan', artist: 'Industrial techno',
    tags: ['bass', 'industrial', 'techno'], level: 2,
    blurb: 'Aggressive, rasping bass made by wobbling the filter faster than the ear can follow.',
    how: 'The Neutron’s LFO goes far into the audio range. It is already wired to the filter through MOD DEPTH, so no cable is needed. Once the LFO passes about 30 Hz you stop hearing a wobble and start hearing extra, rough overtones — the filter is being modulated as fast as a note. Overdrive then glues it together.',
    phrase: { bpm: 132, loop: true, steps: [[0, 33, 0.7], [1, 33, 0.2], [1.5, 33, 0.2], [2, 36, 0.7], [3, 31, 0.45], [3.5, 32, 0.45]] },
    steps: [
      { title: 'Saw and pulse together', module: 'osc', why: 'Two oscillators blend into a thick, low base for the snarl to work on.\n- OSC MIX 0: OSC is short for oscillator, the part that makes the raw tone. The centre of the crossfade gives both an equal share.\n- SHAPE 2, RANGE 16’ (osc 1): a sawtooth, bright and full of harmonics, an octave below 8’.\n- SHAPE 1, RANGE 32’ (osc 2): a pulse a further octave down, adding sub weight under the saw.\n- WIDTH 4 (41%), osc 2: just off square, a touch thinner and more nasal than a pure square.\n- TUNE 0 (osc 2): exactly in tune, so the two lock together an octave apart instead of beating.\n- Listen for: a heavy, buzzy low note. Turn OSC MIX fully left and fully right to hear each layer on its own, then return it to 0.',
        set: { 'osc.mix': 0, 'osc1.shape': 2, 'osc1.range': '16', 'osc2.shape': 1, 'osc2.range': '32', 'osc2.width': 4, 'osc2.tune': 0 } },
      { title: 'Filter part closed', module: 'filter', why: 'The VCF (voltage-controlled filter) takes the top off, leaving room for modulation to push the cutoff around.\n- MODE low-pass, FREQ 4.6 (289 Hz): the cutoff sits medium-low, so most of the saw’s buzz is gone. Higher lets more rasp through later.\n- RESO 4: resonance, a moderate peak at the cutoff. It gives the modulation something to grab without whistling.\n- ENV DEPTH 4 (40%): ENV is short for envelope, a shape that runs once per note. This sets how far Envelope 2 lifts the cutoff at the start of each note.\n- A 0 / D 240 ms / S 30% / R 41 ms (env 2): opens instantly, falls over about a quarter of a second to a low hold, and closes quickly after release.\n- Listen for: a short bright bite at the front of each note, settling into a rounder, darker hold.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 4.6, 'vcf.reso': 4, 'vcf.envDepth': 4, 'env2.a': 0, 'env2.d': 5.5, 'env2.s': 3, 'env2.r': 4 } },
      { title: 'Bring in the LFO, slowly at first', module: 'mod', why: 'Before the snarl, hear the plain version of the same connection: a slow filter wobble. The LFO (low-frequency oscillator) is a repeating wave you do not hear directly; it moves other settings.\n- MOD DEPTH 4.5 (45%): with nothing patched into FREQ MOD, the LFO is wired to the cutoff already, and this knob sets how far it moves it. No cable needed.\n- SHAPE (LFO) 0 (sine): the smoothest shape, a steady swing up and down.\n- RATE (LFO) 4 (2.00 Hz): two wobbles a second.\n- Listen for: hold a note and the tone swings bright and dark twice a second. That is the connection the next step speeds up.',
        set: { 'vcf.modDepth': 4.5, 'lfo.shape': 0, 'lfo.rate': 4 } },
      { title: 'Speed the LFO into audio rate', module: 'lfo', why: 'Turning the LFO up into the audio range changes the wobble into a rasp. The Neutron’s LFO keeps going well past where most stop, so it can shake the filter as fast as a note.\n- RATE (LFO) 7.4 (100 Hz): at this speed you no longer hear a wobble, you hear extra rough overtones. The rate sets the pitch of the roughness, and because the LFO does not follow the keyboard, each note snarls a little differently.\n- KEY SYNC on: restarts the LFO each time a note is played, so every attack begins at the same point and the front of each note stays consistent.\n- Listen for: sweep RATE slowly from 4 to 7.4 on a held note. Somewhere around 30 Hz the wobble blurs into a growl. Then try LFO SHAPE towards square for the harshest rasp.',
        set: { 'lfo.rate': 7.4, 'lfo.keySync': true } },
      { title: 'Overdrive', module: 'fx', why: 'Overdrive glues the snarl together, and Envelope 1 gives it a tight bass shape.\n- DRIVE 6: distortion after the filter. It thickens the rasp and squashes the level so the snarl stays even.\n- TONE 4.5: just left of centre, rolling a little off the top so the distortion is heavy rather than fizzy. Right of centre thins the bass and adds bite.\n- LEVEL 7: the overdrive’s output, which everything passes through, so it doubles as a volume control.\n- A 0 / S 90% / R 27 ms (env 1): Envelope 1 sets loudness through the VCA (voltage-controlled amplifier). Instant start, near-full hold, and a very short release so notes stop tight.\n- Listen for: compare DRIVE at 1 and at 6. The driven version is denser and louder, with the snarl pushed to the front.', set: { 'od.drive': 6, 'od.tone': 4.5, 'od.level': 7, 'env1.a': 0, 'env1.s': 9, 'env1.r': 3.5 } },
    ],
    context: {
      'lfo.rate': 'Here the LFO runs at about 100 Hz. Its speed sets the pitch of the roughness. It does not follow the keyboard, so each note snarls differently.',
      'vcf.modDepth': 'How hard the LFO shakes the filter. This is the "amount of snarl".',
      'lfo.shape': 'Sine is the smoothest rasp. Square is the harshest.',
      'lfo.keySync': 'Restarts the LFO on each note so the attack is consistent.',
      'od.drive': 'Thickens and compresses the result.',
    },
    tweaks: [
      { id: 'lfo.rate', try: 'Sweep from 4 up to 9', hear: 'A wobble, then a growl, then a metallic ring as the LFO climbs through the audio range.' },
      { id: 'lfo.shape', try: 'Turn to 3 (square)', hear: 'A harder, buzzier edge.' },
      { id: 'vcf.modDepth', try: 'Back off to 2', hear: 'The snarl becomes a subtle roughness on an otherwise normal bass.' },
    ],
  },
  {
    id: 'para-keys', name: 'Wobbly Two-Note Keys', ref: 'In the style of Boards of Canada — "Roygbiv"', artist: 'Boards of Canada',
    tags: ['keys', 'idm', 'lo-fi'], level: 2,
    blurb: 'Soft, slightly seasick keys that can play two notes at once.',
    how: 'PARAPHONIC gives each oscillator its own note when you hold two keys. The SHAPE knobs sit either side of triangle for a mellow tone. The worn-tape wobble comes from the LFO, turned right down by Attenuator 2 and patched to both oscillators’ pitch. Delay smears it all together.',
    phrase: { bpm: 84, loop: true, steps: [[0, 57, 1.8], [0, 64, 1.8], [2, 55, 1.8], [2, 62, 1.8], [4, 53, 1.8], [4, 60, 1.8], [6, 55, 1.8], [6, 64, 1.8]] },
    steps: [
      { title: 'Two mellow oscillators', module: 'osc', why: 'Two soft oscillators make a mellow base, closer to a worn electric piano than a buzzy synth.\n- OSC MIX 0: OSC is short for oscillator, the part that makes the raw tone. The centre of the crossfade gives both an equal share.\n- SHAPE 2.6 (osc 1): between saw and triangle, 60% of the way to triangle. Softer than a saw, fuller than a triangle; the morphing SHAPE knob is what makes in-between tones like this possible.\n- SHAPE 3.2 (osc 2): mostly triangle with a little sine, a rounder, flute-like tone.\n- RANGE 8’ on both: the same octave, in the normal keys range.\n- TUNE +0.1 st (osc 2): a tenth of a semitone sharp. When both play the same note they beat slowly, which gives gentle movement.\n- Listen for: a slow waver on a held note from the detune. Turn SHAPE 1 towards 2 to hear it brighten, then back.',
        set: { 'osc.mix': 0, 'osc1.shape': 2.6, 'osc2.shape': 3.2, 'osc1.range': '8', 'osc2.range': '8', 'osc2.tune': 0.04 } },
      { title: 'Switch on PARAPHONIC', module: 'mode', why: 'This switch lets the synth play two notes at once, one on each oscillator.\n- PARAPHONIC on: hold two keys and each oscillator takes one; hold one key and both play it. Paraphonic sits between mono and poly: the two notes still share one filter and one amplifier, so a second note added while the first is held does not get its own attack.\n- Listen for: hold a key, then add a second. The new note just appears inside the sound already playing. Press both together for a clean two-note chord.', set: { 'osc.para': true } },
      { title: 'Gentle filter with key tracking', module: 'filter', why: 'The VCF (voltage-controlled filter) softens the keys and gives each chord a gentle pluck.\n- MODE low-pass, FREQ 6.2 (931 Hz): a medium cutoff that takes the edge off the top. Lower is muffled; higher is brighter and more present.\n- RESO 2: resonance, just a little, enough to round the pluck without a whistle.\n- KEY TRK on: key tracking makes the cutoff follow the notes, so high notes stay as bright as low ones.\n- ENV DEPTH 3 (30%): ENV is short for envelope. Envelope 2 lifts the cutoff this much at the start of each chord.\n- A 0 / D 540 ms / S 30% / R 330 ms (env 2): opens instantly, closes over about half a second to a low hold, and eases down after release.\n- Listen for: a soft brightening at the start of each chord that settles over half a second. Both notes share it, so they pluck together.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 6.2, 'vcf.reso': 2, 'vcf.keyTrk': true, 'vcf.envDepth': 3, 'env2.a': 0, 'env2.d': 6.5, 'env2.s': 3, 'env2.r': 6.5 } },
      { title: 'Soft, ringing loudness', module: 'amp', why: 'Envelope 1 shapes loudness through the VCA (voltage-controlled amplifier). Here it gives the keys a soft start and a ringing tail, like an electric piano with the pedal half down.\n- A 3.5 (9 ms), env 1: a slightly soft attack that takes the click off without sounding slow.\n- D 7 (820 ms), S 60%: the level falls gently over most of a second to 60% and holds, so chords bloom and then settle.\n- R 7 (500 ms): half a second of fade after you let go, so one chord rings into the next.\n- Listen for: the tail after releasing a chord. Shorten R to hear the keys go dry and choppy, then set it back.',
        set: { 'env1.a': 3.5, 'env1.d': 7, 'env1.s': 6, 'env1.r': 7 } },
      { title: 'Tape wobble: ATT 2 to OSC 1+2', module: 'patch', why: 'This adds the worn-tape wobble in pitch. The LFO (low-frequency oscillator), a slow wave you do not hear directly, is sent to pitch.\n- ATT 2 → OSC 1+2: Attenuator 2 already carries the LFO inside. Patching its output to OSC 1+2, the pitch input for both oscillators, sends that LFO to pitch.\n- 2 (ATT 2) at 1: the attenuator sets how much gets through. At 1 it is about half a semitone each way. Keep it low: a full-strength LFO would swing the pitch by octaves. It also feeds pulse width, which only matters on pulse shapes.\n- RATE (LFO) 3.3 (0.89 Hz): just under one wobble a second. Below 1 Hz sounds like warped tape.\n- SHAPE (LFO) 0 (sine): a smooth swing with no jumps.\n- Listen for: a slow, seasick drift in pitch on held chords. Turn ATT 2 to 0 and back up to 1 for an A/B.',
        set: { 'att.2': 1, 'lfo.rate': 3.3, 'lfo.shape': 0 }, cables: [['j.att2', 'j.osc12In']] },
      { title: 'Delay', module: 'fx', why: 'An analogue echo sits under the keys and fills the space between chords.\n- TIME 6.5 (210 ms): about a fifth of a second between echoes, so they trail close behind each chord. It is a bucket-brigade delay, so each echo is a little darker than the last.\n- REPEATS 4 (40%): how much echo is fed back. You hear a few repeats before they die away.\n- MIX 2.5 (25%): echoes well behind the dry keys. At 0 there is no delay at all.\n- Listen for: short chords leaving a soft trail. The pitch wobble carries into the echoes, which adds to the old-tape feel.', set: { 'delay.time': 6.5, 'delay.repeats': 4, 'delay.mix': 2.5 } },
    ],
    context: {
      'osc.para': 'Gives each oscillator its own note. There is still one filter and one amplifier, so both notes share the same pluck.',
      'att.2': 'Pitch wobble depth. At 1 it is about half a semitone each way. It also feeds pulse width, but that only matters on pulse shapes.',
      'lfo.rate': 'The speed of the wobble. Under 1 Hz sounds like a warped tape.',
      'osc1.shape': 'Between saw and triangle. Turn towards saw for brighter keys, towards sine for something closer to a music box.',
      'osc.mix': 'In paraphonic mode this balances the two notes against each other.',
    },
    tweaks: [
      { id: 'att.2', try: 'Raise to 2', hear: 'The pitch drifts far enough to sound properly out of tune — old, damaged tape.' },
      { id: 'osc2.shape', try: 'Turn to 1 (pulse) with WIDTH at 3', hear: 'The second note becomes reedy, and the LFO now also sweeps its pulse width.' },
      { id: 'osc2.tune', try: 'Set to about 2.9 (a fifth up) and switch PARAPHONIC off', hear: 'One key now plays a two-note chord.' },
      { id: 'delay.mix', try: 'Raise to 5 with REPEATS at 6', hear: 'The keys wash into a hazy bed.' },
    ],
  },
  {
    id: 'dub-stab', name: 'Dub Chord Stab', ref: 'In the style of Basic Channel — dub techno', artist: 'Dub techno',
    tags: ['pluck', 'dub techno', '90s'], level: 2,
    blurb: 'Short, hollow chord stab that trails off into wavering echoes.',
    how: 'Oscillator 2 is tuned a fifth above Oscillator 1, so one key gives a two-note chord. The band-pass filter strips out both the bass and the top, which is the hollow, distant tone of dub techno. The analogue delay does the rest: long-ish repeats timed to the beat, with the LFO gently moving the delay time so the echoes drift in pitch.',
    phrase: { bpm: 120, loop: true, steps: [[0.5, 60, 0.3], [4.5, 60, 0.3], [6, 58, 0.3]] },
    steps: [
      { title: 'A fifth apart', module: 'osc', why: 'Tuning the two oscillators a fifth apart means one key plays a two-note chord, the base of a dub techno stab.\n- OSC MIX 0: OSC is short for oscillator, the part that makes the raw tone. The centre of the crossfade gives an equal blend.\n- SHAPE 2 on both: sawtooths, bright and full of harmonics for the filter to hollow out.\n- RANGE 8’ on both: the same octave.\n- TUNE 2.9 (+7 st), osc 2: seven semitones up is a fifth. The knob covers about an octave each way, so watch the readout and stop at +7.\n- Listen for: an open, organ-like chord from a single key. Nudge Oscillator 2’s TUNE slightly off +7 and hear it start to beat and sour.',
        set: { 'osc.mix': 0, 'osc1.shape': 2, 'osc2.shape': 2, 'osc1.range': '8', 'osc2.range': '8', 'osc2.tune': 2.92 } },
      { title: 'Band-pass filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is switched to band-pass, which strips out the bass and the top together. That is the hollow, heard-through-a-wall tone of dub techno.\n- MODE band-pass: press MODE until the middle lamp lights. Only a band around the cutoff gets through.\n- FREQ 6 (805 Hz): the centre of that band, in the mids. This is the main performance control in this style: lower is muffled, higher is thinner and more nasal.\n- RESO 4.5: resonance narrows and sharpens the band, making the stab more hollow and focused.\n- ENV DEPTH 3.5 (35%): ENV is short for envelope. Envelope 2 lifts the band on each stab.\n- A 0 / D 150 ms / S 0% / R 95 ms (env 2): a quick lift that falls away fast, giving each stab a small flick at the front.\n- Listen for: the chord losing its low end and its fizz. Switch MODE back to low-pass for a moment to hear the difference.',
        set: { 'vcf.mode': 'bp', 'vcf.freq': 6, 'vcf.reso': 4.5, 'vcf.envDepth': 3.5, 'env2.a': 0, 'env2.d': 5, 'env2.s': 0, 'env2.r': 5 } },
      { title: 'Short stab', module: 'amp', why: 'Envelope 1 shapes loudness through the VCA (voltage-controlled amplifier). With no sustain, every note is a short burst however long the key is held.\n- A 0 ms (env 1): instant start for a sharp, rhythmic hit.\n- D 5.2 (180 ms): the stab dies away in under a fifth of a second.\n- S 0%: nothing is held, so long and short presses sound the same.\n- R 5 (95 ms): a short tail if you let go early.\n- Listen for: hold a key and the chord still stops quickly. A short, dry stab leaves room for the echoes that come next.', set: { 'env1.a': 0, 'env1.d': 5.2, 'env1.s': 0, 'env1.r': 5 } },
      { title: 'Delay timed to the beat', module: 'fx', why: 'The delay is where the dub sound lives. Its echoes are timed so they fall between the beats.\n- TIME 8.4 (370 ms): about a dotted eighth note at 120 bpm, so echoes land off the beat. It is an analogue bucket-brigade delay, so each repeat comes back darker. At a different tempo, set it by ear.\n- REPEATS 6.8 (68%): plenty of feedback for a long echo tail. Near maximum it builds instead of fading.\n- MIX 4.5 (45%): nearly as much echo as dry sound.\n- Listen for: play a stab on each beat and hear the repeats fill the gaps and slowly darken. Raise REPEATS briefly towards 9 to hear the tail start to build on itself.',
        set: { 'delay.time': 8.35, 'delay.repeats': 6.8, 'delay.mix': 4.5 } },
      { title: 'Make the echoes drift', module: 'patch', why: 'A slow, shallow movement of the delay time makes the echoes drift in pitch, like a tape echo with a worn motor. The LFO (low-frequency oscillator) provides that movement.\n- ATT 2 → DELAY TIME: Attenuator 2 carries the LFO inside. This cable sends it to the delay time input, where it adds to the TIME knob.\n- 2 (ATT 2) at 1.5: how far the LFO moves the delay time. Small amounts give drift; large amounts give seasick warble.\n- RATE (LFO) 2.5 (0.36 Hz): one slow cycle roughly every three seconds.\n- SHAPE (LFO) 0 (sine): a smooth swing with no jumps.\n- Listen for: the echo tail bending slightly flat and sharp as it fades. Turn ATT 2 up to 5 to hear it exaggerated, then bring it back.',
        set: { 'att.2': 1.5, 'lfo.rate': 2.5, 'lfo.shape': 0 }, cables: [['j.att2', 'j.delayTime']] },
    ],
    context: {
      'osc2.tune': 'Tuned a fifth up (+7 semitones) so one key plays a chord.',
      'vcf.mode': 'Band-pass removes lows and highs together. That is the "heard through a wall" tone.',
      'vcf.freq': 'Moves the band up and down. This is the main performance control for this style.',
      'delay.repeats': 'How long the echo tail lasts. Near maximum it builds instead of fading.',
      'delay.time': 'Set to a dotted eighth at 120 bpm. Moving it while echoes are sounding bends their pitch.',
      'att.2': 'How far the LFO moves the delay time. Small amounts give drift; large amounts give seasick warble.',
    },
    tweaks: [
      { id: 'vcf.freq', try: 'Sweep slowly between 4.5 and 7.5 as the stabs repeat', hear: 'The chord moves from murky to thin and bright, and the echoes keep the older tone as they fade.' },
      { id: 'delay.repeats', try: 'Push to 9 for a bar, then pull back', hear: 'The echoes pile up into a wash, then settle again.' },
      { id: 'od.drive', try: 'Raise to 5', hear: 'The stab gets a gritty, saturated edge and drives the delay harder.' },
      { id: 'osc2.tune', try: 'Set to about 1.25 (a minor third up)', hear: 'A darker, minor-sounding stab.' },
    ],
  },
  {
    id: 'sync-lead', name: 'Sync Sweep Lead', ref: 'In the style of The Cars — "Let’s Go"', artist: 'New wave',
    tags: ['lead', 'new wave', '80s'], level: 2,
    blurb: 'Tearing, vocal lead where every note sweeps through its harmonics.',
    how: 'With OSC SYNC on, Oscillator 1 forces Oscillator 2 to restart its wave each cycle. Oscillator 2 can no longer change pitch, so raising its tuning changes its tone instead, adding sharp harmonics. Patching Envelope 2 to Oscillator 2’s pitch does that raising automatically on each note, which is the classic sync sweep.',
    phrase: { bpm: 112, loop: true, steps: [[0, 64, 0.9], [1, 67, 0.4], [1.5, 69, 1.4], [3, 71, 0.4], [3.5, 69, 0.4], [4, 67, 1.4], [5.5, 64, 0.4], [6, 62, 1.8]] },
    steps: [
      { title: 'Listen to Oscillator 2 only', module: 'osc', why: 'The sound in this patch comes from Oscillator 2, so the mix is set to hear it alone.\n- OSC MIX 5 (OSC 2 only): OSC is short for oscillator, the part that makes the raw tone. Fully right on the crossfade means only Oscillator 2 is heard. Oscillator 1 still runs silently and will control it once sync is on.\n- SHAPE 2 (osc 2): a sawtooth, bright with every harmonic, which is the best raw material for sync.\n- RANGE 8’ on both: the same octave, so Oscillator 1 sets the pitch the synced oscillator will lock to.\n- TUNE 0 (osc 1): centred, so the pitch follows the keys.\n- Listen for: a plain, bright saw. Nothing tears yet.',
        set: { 'osc.mix': 5, 'osc2.shape': 2, 'osc2.range': '8', 'osc1.range': '8', 'osc1.tune': 0 } },
      { title: 'Switch on OSC SYNC and raise TUNE', module: 'osc', why: 'Hard sync makes Oscillator 1 restart Oscillator 2’s wave on every cycle. Oscillator 2 can no longer change pitch, so its TUNE knob changes the tone instead.\n- OSC SYNC on: Oscillator 2 now always plays Oscillator 1’s pitch.\n- TUNE +4.8 st (osc 2): raising it adds sharp, nasal harmonics without changing the note. Higher gives more and harder harmonics; at 0 the sync is barely heard.\n- Listen for: turn Oscillator 2’s TUNE slowly up and down on a held note. The pitch stays put while the tone tears and shifts, almost like a voice.',
        set: { 'osc.sync': true, 'osc2.tune': 2 } },
      { title: 'Patch ENV 2 to OSC 2', module: 'patch', why: 'Patching Envelope 2 to Oscillator 2’s pitch does that tuning sweep automatically on every note. This is the classic sync lead.\n- ENV 2 → OSC 2: ENV 2 is Envelope 2 as a voltage; an envelope is a shape that runs once per note. OSC 2 is Oscillator 2’s own pitch input, which changes tone rather than pitch while sync is on. The envelope pushes the tuning up at the start of each note and lets it fall back.\n- A 0 ms (env 2): the sweep starts at its sharpest instantly.\n- D 6.8 (690 ms): about two-thirds of a second to fall. This is the length of the sweep.\n- S 20%: where the sweep comes to rest while a key is held.\n- R 5 (95 ms): a quick return after release.\n- Listen for: each note starts bright and tearing and slides to mellow. Shorten D for a quick zap, lengthen it for a slow “yeow”.',
        set: { 'env2.a': 0, 'env2.d': 6.8, 'env2.s': 2, 'env2.r': 5 }, cables: [['j.env2', 'j.osc2In']] },
      { title: 'Open filter', module: 'filter', why: 'The sweep is the sound, so the VCF (voltage-controlled filter) is left mostly open and does not move.\n- MODE low-pass, FREQ 8 (3.5 kHz): trims only the harshest fizz from the top. Lower would dull the sync harmonics you just built.\n- RESO 1.5: resonance, just a touch, with no whistle.\n- ENV DEPTH 0: ENV is short for envelope. Envelope 2 is busy on the pitch cable; at zero it does not move the cutoff as well.\n- KEY TRK on: key tracking makes the cutoff follow the notes, so high notes stay as bright as low ones.\n- Listen for: very little change, only slightly less fizz on top. Pull FREQ down to 5 to hear how much of the sweep the filter could hide, then return it to 8.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 8, 'vcf.reso': 1.5, 'vcf.envDepth': 0, 'vcf.keyTrk': true } },
      { title: 'Lead playing feel', module: 'amp', why: 'The last touches give it a lead-playing feel: a solid note, a slight slide, a little grit and a short echo.\n- A 0 / D 150 ms / S 90% / R 95 ms (env 1): Envelope 1 sets loudness through the VCA (voltage-controlled amplifier). Instant start, near-full hold, short tail.\n- PORTA TIME 1 (100 ms): portamento, a quick pitch slide from each note to the next.\n- DRIVE 3: light overdrive after the filter, adding grit that helps a lead cut through a mix.\n- MIX 2 · TIME 240 ms · REPEATS 3.5: a quiet echo about a quarter of a second behind, with a few repeats.\n- Listen for: legato phrases gliding between notes with a short echo behind. Blend OSC MIX back towards the centre to add a solid fundamental under the sweep.',
        set: { 'env1.a': 0, 'env1.d': 5, 'env1.s': 9, 'env1.r': 5, 'porta.time': 1, 'od.drive': 3, 'delay.mix': 2, 'delay.time': 7, 'delay.repeats': 3.5 } },
    ],
    context: {
      'osc.sync': 'Locks Oscillator 2 to Oscillator 1’s pitch. Without it, this patch is just an oscillator whose pitch swoops wildly.',
      'osc2.tune': 'With sync on this is a tone control. Higher means more, sharper harmonics.',
      'env2.d': 'The length of the sweep on each note.',
      'env2.s': 'Where the sweep comes to rest while a key is held.',
      'osc.mix': 'Fully right so only the synced oscillator is heard. Blend Oscillator 1 back in for a solid fundamental underneath.',
    },
    tweaks: [
      { id: 'env2.d', try: 'Move between 4 and 8', hear: 'Short gives a spitting "pew" at the front of each note; long gives a slow, vocal sweep.' },
      { id: 'osc2.tune', try: 'Sweep by hand from 0 to 5', hear: 'The same tone change the envelope makes, under your control.' },
      { id: 'osc.mix', try: 'Bring back to 1.5', hear: 'Oscillator 1 adds body under the sweep.' },
      { id: 'osc.sync', try: 'Switch off', hear: 'The lock is gone: Oscillator 2’s pitch now dives on every note. That is what sync was hiding.' },
    ],
  },
  {
    id: 'zap-kick', name: 'Zap Kick Drum', ref: 'In the style of Kraftwerk — "Numbers"', artist: 'Electro',
    tags: ['perc', 'electro', 'drums'], level: 3,
    blurb: 'Synthesised kick: a sine wave whose pitch dives in a few milliseconds.',
    how: 'An analogue kick is a sine wave that starts high and drops very quickly to a low note, with a short loudness envelope. The Neutron has no knob for "envelope to pitch", so you build it from the patch bay: Envelope 2 goes into Attenuator 2, and Attenuator 2 goes to the pitch of both oscillators. The ATT 2 knob then sets how far the pitch dives.',
    phrase: { bpm: 118, loop: true, steps: [[0, 43, 0.3], [1, 43, 0.3], [2, 43, 0.3], [2.75, 43, 0.2], [3, 43, 0.3]] },
    steps: [
      { title: 'A sine wave', module: 'osc', why: 'The body of an analogue kick is a pure, low tone, so start with a sine wave and nothing else.\n- OSC MIX −5 (OSC 1 only): OSC is short for oscillator, the part that makes the raw tone. Fully left on the crossfade means only Oscillator 1 is heard.\n- SHAPE 4 (sine): fully right on the morph. A sine has no harmonics at all, just the fundamental, which is the round thump of a kick. A little towards triangle adds some knock.\n- RANGE 16’: an octave below 8’, down where a kick’s weight sits.\n- TUNE 0: the final pitch of the kick. Later you can tune it to the key of the track.\n- Listen for: a smooth, hooting tone that holds as long as the key is down. It needs a short envelope before it sounds like a drum.',
        set: { 'osc.mix': -5, 'osc1.shape': 4, 'osc1.range': '16', 'osc1.tune': 0 } },
      { title: 'Short loudness envelope', module: 'amp', why: 'Envelope 1 shapes loudness through the VCA (voltage-controlled amplifier). A drum has no held part, so the note dies away on its own.\n- A 0 ms (env 1): full level instantly, for a hard hit.\n- D 5.6 (260 ms): the length of the kick’s body, about a quarter of a second. Shorter is a tight, clicky kick; longer is boomier.\n- S 0%: nothing is held, so the sound fades out even with the key down.\n- R 5.4 (130 ms): the release is set close to the decay, so short and long key presses sound the same.\n- Listen for: a short, round “boop” on each key. It still has no punch: the pitch does not move yet.',
        set: { 'env1.a': 0, 'env1.d': 5.6, 'env1.s': 0, 'env1.r': 5.4 } },
      { title: 'A very fast Envelope 2', module: 'env', why: 'Envelope 2 is set up very fast, ready to drive the pitch in the next step. An envelope is a shape that runs once per note.\n- A 0 ms (env 2): the envelope starts at full straight away, so the pitch will begin high on the first instant.\n- D 3.6 (48 ms): about 50 ms of fall. Long enough to hear as a thump, too short to hear as a falling note. This is the most sensitive control in the patch.\n- S 0% · R 30 ms: the envelope always falls to nothing and resets quickly, so repeated hits sound the same.\n- Listen for: no change yet. Envelope 2 is only wired to the filter, through ENV DEPTH, which is still at 0.',
        set: { 'env2.a': 0, 'env2.d': 3.6, 'env2.s': 0, 'env2.r': 3.6 } },
      { title: 'Patch ENV 2 → ATT2 IN, ATT 2 → OSC 1+2', module: 'patch', why: 'Two cables build the envelope-to-pitch route the Neutron has no knob for.\n- ENV 2 → ATT2 IN: Attenuator 2 normally carries the LFO (low-frequency oscillator). This cable replaces the LFO with Envelope 2.\n- ATT 2 → OSC 1+2: sends the attenuated envelope to the pitch of both oscillators. OSC 1+2 is the shared pitch input.\n- 2 (ATT 2) at 7.5: the attenuator is now your pitch-dive depth. Low is a soft thud; high is a laser zap. Full strength moves pitch a long way, which is why it goes through the attenuator.\n- Listen for: each hit now starts with a fast downward swoop into the low sine, the classic synth kick. Sweep ATT 2 from 3 to 9 while playing and hear it go from thud to zap.',
        set: { 'att.2': 7.5 }, cables: [['j.env2', 'j.att2In'], ['j.att2', 'j.osc12In']] },
      { title: 'Click and weight', module: 'filter', why: 'The filter adds a click to the front and the overdrive adds weight.\n- MODE low-pass, FREQ 6.5 (1.2 kHz): the VCF (voltage-controlled filter) rests fairly open, trimming the top.\n- RESO 0: no resonance, so the filter does not ring or add a pitch of its own.\n- ENV DEPTH 3 (30%): ENV is short for envelope. Envelope 2 also lifts the cutoff for its brief 48 ms, adding a click at the attack.\n- DRIVE 4.5: overdrive squares off the sine, making the kick harder and louder without making it longer, because it sits before the amplifier.\n- TONE 4 · LEVEL 8: TONE slightly left rounds the grit; LEVEL is the overdrive’s output and so the synth’s volume.\n- Listen for: a firmer, punchier kick with a tick at the front. Compare DRIVE at 1 and 4.5 to hear how much weight it adds.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 6.5, 'vcf.reso': 0, 'vcf.envDepth': 3, 'od.drive': 4.5, 'od.tone': 4, 'od.level': 8 } },
    ],
    context: {
      'att.2': 'How far the pitch dives at the start of each hit. Low is a soft thud; high is a laser zap.',
      'env2.d': 'How long the pitch dive takes. This is the most sensitive control in the patch.',
      'env1.d': 'The length of the kick’s body.',
      'osc1.shape': 'Sine for a clean kick. Towards triangle adds a little knock.',
      'od.drive': 'Squares off the sine for a harder, louder kick.',
      'osc1.tune': 'The final pitch of the kick. Tune it to the track.',
    },
    tweaks: [
      { id: 'env2.d', try: 'Lengthen to 5.5', hear: 'The dive becomes audible as a falling "pew" — an electro tom or laser.' },
      { id: 'att.2', try: 'Sweep from 4 to 10', hear: 'From a soft, round thud to a sharp zap.' },
      { id: 'mix.noise', try: 'Raise to 5, set MODE to band-pass and ENV DEPTH to 6', hear: 'Noise plus a tuned thump: the start of a snare.' },
      { id: 'od.drive', try: 'Push to 8', hear: 'A distorted, hard techno kick.' },
    ],
  },
  {
    id: 'sighing-pad', name: 'Sighing PWM Pad', ref: 'In the style of Brian Eno — ambient pads', artist: 'Ambient',
    tags: ['pad', 'ambient', 'drone'], level: 3,
    blurb: 'Slow, shimmering pad that starts bright, darkens as you hold it and opens again as it fades.',
    how: 'Two pulse waves have their width swept by the LFO through Attenuator 2, which gives a slow, chorus-like shimmer with no cable needed. The unusual part is the filter: ENV DEPTH only pushes upwards, so to make the filter close during a note you patch the inverter (which carries Envelope 2 upside down) into FREQ MOD. The delay adds space.',
    phrase: { bpm: 50, loop: true, steps: [[0, 50, 3.4], [0.5, 57, 2.9], [4, 48, 3.4], [4.5, 55, 2.9]] },
    steps: [
      { title: 'Two pulse waves, slightly detuned', module: 'osc', why: 'Two pulse waves an octave apart make the raw material for a shimmering pad.\n- OSC MIX 0: OSC is short for oscillator, the part that makes the raw tone. The centre of the crossfade gives both an equal share.\n- SHAPE 1 on both (pulse): hollow, reedy waves whose width can be moved, which is where the shimmer will come from.\n- RANGE 8’ (osc 1) and 16’ (osc 2): an octave apart, so Oscillator 2 adds a lower layer.\n- TUNE +0.1 st (osc 2): a hair of detune, adding a slow beat.\n- WIDTH 5 (50%) and 4 (41%): a square on 1, a slightly thinner pulse on 2, so the layers differ in colour.\n- PARAPHONIC on: hold two keys and each oscillator plays one, so you can play two-note chords.\n- Listen for: a hollow, organ-like tone. Hold two keys to hear each oscillator take a note.',
        set: { 'osc.mix': 0, 'osc1.shape': 1, 'osc2.shape': 1, 'osc1.range': '8', 'osc2.range': '16', 'osc2.tune': 0.03, 'osc1.width': 5, 'osc2.width': 4, 'osc.para': true } },
      { title: 'Pulse-width modulation with ATT 2', module: 'mod', why: 'PWM (pulse-width modulation) makes the pulse waves slowly thin and fatten, which sounds like a gentle chorus. The Neutron has no knob marked PWM: ATT 2 is it.\n- 2 (ATT 2) at 5.5: Attenuator 2 carries the LFO (low-frequency oscillator) to both oscillators’ pulse width with no cable needed. This knob sets how far the width swings. Too high and the pulses thin out to nothing at the extremes.\n- RATE (LFO) 3 (0.63 Hz): the speed of the shimmer, a little more than one sweep every two seconds.\n- SHAPE (LFO) 1 (triangle): an even, steady swing, which gives the smoothest shimmer.\n- Listen for: a slow swirling on held notes. Turn ATT 2 to 0 and back up to hear the static pulse come alive.',
        set: { 'att.2': 5.5, 'lfo.rate': 3, 'lfo.shape': 1 } },
      { title: 'Slow loudness', module: 'amp', why: 'Envelope 1 shapes loudness through the VCA (voltage-controlled amplifier). Here it makes notes fade in and overlap.\n- A 7 (270 ms), env 1: a slow attack, so notes swell in rather than start with a hit.\n- D 6 (360 ms), S 90%: after the peak the level barely dips, holding at 90% for as long as the key is down.\n- R 8 (1.1 s): more than a second of fade after you let go, so one chord overlaps the next.\n- Listen for: notes blooming in and trailing on after release. Play slow chord changes and hear them blend into one another.', set: { 'env1.a': 7, 'env1.d': 6, 'env1.s': 9, 'env1.r': 8 } },
      { title: 'Bright resting filter', module: 'filter', why: 'The VCF (voltage-controlled filter) starts well open. The next step makes it close during each note, so this sets the brightest point.\n- MODE low-pass, FREQ 7.6 (2.6 kHz): fairly bright. This is the tone heard at the very start and end of each note.\n- RESO 2.5: resonance, a light peak that gives the filter movement a little voice.\n- ENV DEPTH 0: ENV is short for envelope. ENV DEPTH only pushes the cutoff upwards, so it stays off here; the downward move is patched next.\n- KEY TRK on: key tracking makes the cutoff follow the notes, so the two paraphonic notes stay evenly bright.\n- Listen for: a clear, bright pad. Lower FREQ briefly to preview the darker sound it will sink to.',
        set: { 'vcf.mode': 'lp', 'vcf.freq': 7.6, 'vcf.reso': 2.5, 'vcf.envDepth': 0, 'vcf.keyTrk': true } },
      { title: 'Patch INVERT to FREQ MOD', module: 'patch', why: 'This cable is what makes the pad sigh. ENV DEPTH can only push the cutoff up, so the inverter provides a downward push.\n- INVERT → FREQ MOD: the inverter carries Envelope 2 upside down. FREQ MOD is the cutoff modulation input; this cable also removes the LFO that normally feeds it, so the LFO now only moves pulse width.\n- MOD DEPTH 5 (50%): scales the inverted envelope, so it sets how far the filter closes while a note is held.\n- A 8.6 (1.3 s), env 2: how slowly the pad darkens after a key is pressed.\n- D 150 ms · S 100%: the envelope reaches full and stays there, so the pad stays dark while held.\n- R 7.5 (750 ms): how slowly it brightens again after release.\n- Listen for: each chord starts bright, dulls over a second or so, then opens up again as it fades.',
        set: { 'vcf.modDepth': 5, 'env2.a': 8.6, 'env2.d': 5, 'env2.s': 10, 'env2.r': 7.5 }, cables: [['j.invert', 'j.freqMod']] },
      { title: 'Space', module: 'fx', why: 'A long analogue delay adds space and stands in for reverb.\n- TIME 7.5 (280 ms): echoes a little over a quarter of a second apart. It is a bucket-brigade delay, so each repeat comes back darker and blurs into the pad.\n- REPEATS 5.5 (55%): moderate feedback, a tail of several echoes.\n- MIX 3.5 (35%): echoes clearly present but behind the dry pad.\n- Listen for: the space around the pad, especially as notes fade. Pull MIX to 0 and the pad sounds close and dry.', set: { 'delay.time': 7.5, 'delay.repeats': 5.5, 'delay.mix': 3.5 } },
    ],
    context: {
      'att.2': 'Pulse-width modulation depth. Too high and the pulses thin out to nothing at the extremes.',
      'lfo.rate': 'The speed of the shimmer. The cable into FREQ MOD has removed the LFO from the filter, so here it only moves pulse width.',
      'vcf.modDepth': 'Scales the inverted envelope, so it sets how far the filter closes while you hold a note.',
      'env2.a': 'How slowly the pad darkens after a key is pressed.',
      'env2.r': 'How slowly it brightens again after release.',
      'vcf.freq': 'The brightest point of the pad, heard at the very start and the very end of each note.',
    },
    tweaks: [
      { id: 'vcf.modDepth', try: 'Raise to 8', hear: 'Held notes sink almost to silence, then bloom when you let go.' },
      { id: 'vcf.mode', try: 'Press MODE for high-pass', hear: 'Now the inverted envelope lets the bass in as you hold: the pad gains weight instead of losing brightness.' },
      { id: 'lfo.shape', try: 'Turn to 0 (sine) and RATE to 2', hear: 'A slower, gentler shimmer.' },
      { id: 'vca.bias', try: 'Raise to 4', hear: 'The pad never fully stops: a drone you can play over.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'neutron', name: 'Neutron', maker: 'Behringer', year: 2018,
  heritage: 'An original Behringer design built around two 3340 oscillator chips',
  summary: 'Two shape-morphing oscillators and noise feed a 12 dB multimode filter, then overdrive, amplifier and an analogue delay. A 56-point patch bay lets you rewire almost all of it.',
  view: { w: 2100, h: 620 },
  theme: {
    panel: '#d8231f', panel2: '#c41d19', ink: '#ffffff', font: 'din', weight: 600, cheeks: 'metal', cheekW: 24,
    tabs: true, knobRing: true, outPlates: true, bezel: true, jack: 'black',
  },
  signalNames: { mixer: 'the mix of oscillators and noise', vcf1: 'the filter’s main output (VCF 1)', vcf2: 'the filter’s second output (VCF 2)', gate: 'the MIDI gate' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
