// Behringer WASP Deluxe — SynthDef. Positions are pixels on the 1540×850 product image (ref/behringer-wasp-deluxe.jpg),
// written in image space and moved by (OX, OY) at the end so the view starts at the faceplate's top-left corner (the
// photo has black background above and below the faceplate). The data model is ref/behringer-wasp-deluxe.synth.json
// (Quick Start Guide, 37 numbered controls, plus the two unnumbered FILTER CONTROL knobs and the OSC1 / OSC2 jacks read
// from the panel), which follows the EDP Wasp Deluxe: two digital oscillators into one multimode filter and a VCA, a
// control oscillator with six shapes, and two envelopes that can each repeat.
//
// Engine notes: the EXT knob with nothing in EXT AUDIO feeds the WASP's own output back into the mixer (`normals.extIn`).
// NOTCH is the state-variable filter's `morph` mode at 0.5. REPEAT on both envelopes is the envelope `loop` flag and
// HOLD is `freeze` (both added to the engine for this synth). The control oscillator's NOISE and RND shapes are the noise
// signal and the sample and hold clocked by the control oscillator.
import { annotate, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/wasp-deluxe.js';
import unusual from '@/synths/unusual/wasp-deluxe.js';
import moreSounds from '@/synths/sounds/wasp-deluxe.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the control oscillator range (0.5 to 100 Hz) and the control envelope's delay (up to 1 s). Everything
// else here is this app's choice (see src/lib/limits.js).
const lfoHz = (v) => expMap(v / 10, 0.5, 100);
const cutHz = (v) => expMap(v / 10, 25, 16000);
const envA = (v) => expMap(v / 10, 0.002, 4);
const envD = (v) => expMap(v / 10, 0.01, 8);
const glideTime = (v) => (v <= 0 ? 0 : 0.01 * Math.pow(300, v / 10)); // up to 3 s
const REP = 0.5; // below this the SUSTAIN LEVEL and DELAY knobs are in their REPEAT position
const sustainOf = (v) => (v < REP ? 0 : (v - REP) / (10 - REP));
const delayOf = (v) => (v < REP ? 0 : (v - REP) / (10 - REP));
const pitch2Semi = (v) => (v - 5) * 2.4; // an octave either way, unison at the centre
const bendSemi = (v) => v * 2.4; // an octave either way
const tuneSemi = (v) => v * 0.2; // a semitone either way
const pitchModSemi = (v) => (v > 0 ? Math.pow(v / 10, 2) * 24 : 0);
const signed = (v, max, curve = 1.4) => (v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v) / 5, curve) * max);
const FT_SEMI = { 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };

const OX = 14, OY = 108; // image pixel of the view's top-left corner
const controls = [];
const decor = [];
const jacks = [];
const INK = '#f5a91c';

// ── Drawing helpers (image coordinates) ───────────────────────────────────
const polarXY = (x, y, r, a) => [x + r * Math.sin((a * Math.PI) / 180), y - r * Math.cos((a * Math.PI) / 180)];
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x, y, t, size = 14, rest = {}) => decor.push({ t: 'text', x, y: y + size * 0.35, text: t, size, anchor: 'middle', weight: 700, ...rest });
const lines = (x, y, t, size = 14, gap = 13) => t.split('\n').forEach((s, i) => text(x, y + i * gap, s, size));
const line = (x1, y1, x2, y2, w = 3, rest = {}) => decor.push({ t: 'line', x1, y1, x2, y2, w, ...rest });
const dashed = (x1, y1, x2, y2) => { const n = Math.round(Math.hypot(x2 - x1, y2 - y1) / 12); for (let i = 0; i < n; i += 2) line(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, x1 + ((x2 - x1) * (i + 1)) / n, y1 + ((y2 - y1) * (i + 1)) / n, 3); };
const glyph = (x, y, shape, size = 9) => decor.push({ t: 'wave', x, y, size, shape, w: 2.2 });
/** The arc with an arrow at each end that the panel prints round a bipolar knob, with 0, − and +. */
const bipolarArc = (x, y) => {
  decor.push({ t: 'arc', x, y, r: 46, a0: -112, a1: -16, w: 3, cap: 'butt' }, { t: 'arc', x, y, r: 46, a0: 16, a1: 112, w: 3, cap: 'butt' });
  const [lx, ly] = polarXY(x, y, 46, -112);
  const [rx, ry] = polarXY(x, y, 46, 112);
  decor.push({ t: 'arrow', x: lx, y: ly + 4, dir: 'down', size: 6 }, { t: 'arrow', x: rx, y: ry + 4, dir: 'down', size: 6 });
  text(x, y - 46, '0', 15); text(x - 47, y + 30, '−', 18); text(x + 47, y + 30, '+', 18);
};

const knob = (id, x, y, rest) => controls.push({
  id, type: 'knob', x, y, r: 34, style: 'wasp', kind: 'cont', min: 0, max: 10, def: 0, labelPos: 'none', ...rest,
});
/** A rotary switch: printed positions are drawn by hand (labels ''), so the ticks and lettering sit where the panel has them. */
const rotary = (id, x, y, options, def, rest) => controls.push({
  id, type: 'knob', x, y, r: 29, style: 'wasp', kind: 'enum', options, def, labelPos: 'none', ...rest,
});
const at = (x, y, a, r, t, size = 13) => { const [px, py] = polarXY(x, y, r, a); text(px, py, t, size); };
const glyphAt = (x, y, a, r, shape) => { const [px, py] = polarXY(x, y, r, a); glyph(px, py, shape); };

// ── Faceplate ─────────────────────────────────────────────────────────────
[[73, 128], [542, 128], [998, 128], [1463, 128], [73, 627], [542, 627], [998, 627], [1463, 627]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 9 }));
decor.push({ t: 'frame', x: 49, y: 119, w: 1435, h: 516, r: 14, labelAt: 'none', sw: 3 });
line(322, 119, 322, 236);
line(49, 236, 1484, 236);
line(49, 262, 1484, 262);
[172, 770, 1365].forEach((x) => line(x, 236, x, 635));
line(1008, 236, 1008, 478);
line(530, 236, 530, 392);
line(530, 598, 530, 635);
dashed(770, 478, 1008, 478);
dashed(889, 478, 889, 635);
line(1008, 435, 1365, 435);
[['KEYBOARD', 111], ['OSCILLATORS', 351], ['CONTROL OSC', 650], ['FILTER', 889], ['ENVELOPE GENERATORS', 1187], ['OUTPUT', 1425]].forEach(([t, x]) => text(x, 249, t, 17));

decor.push({ t: 'usb', x: 79, y: 190, w: 44, h: 40 });
decor.push({ t: 'din', x: 172, y: 190, r: 32 }, { t: 'din', x: 259, y: 190, r: 32 });
text(172, 142, 'MIDI IN', 15); text(259, 142, 'MIDI THRU', 15);
decor.push({ t: 'text', x: 885, y: 222, text: 'WASP', size: 74, anchor: 'middle', weight: 800, spacing: 2, hw: true });
decor.push({ t: 'text', x: 1094, y: 225, text: 'DELUXE', size: 32, anchor: 'middle', weight: 800, hw: true });
decor.push({ t: 'logo', x: 1260, y: 212, size: 20, text: 'behringer', style: 'behringer' });

// ── Keyboard: bend, tune, glide ───────────────────────────────────────────
knob('pitch.bend', 112, 324, {
  min: -5, max: 5, def: 0, ring: false, name: 'Bend', module: 'glide', fmt: (v) => fmtSemi(bendSemi(v)),
  help: 'Bends the pitch of both oscillators up (clockwise) or down, up to an octave either way. Leave it at 0, the top, to play in tune.',
});
bipolarArc(112, 324);
text(112, 372, 'BEND', 16);
controls.push({
  id: 'pitch.tune', type: 'knob', x: 112, y: 434, r: 13, style: 'pro1', kind: 'cont', min: -5, max: 5, def: 0, ring: false, labelPos: 'none',
  name: 'Tune', module: 'glide', fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(tuneSemi(v) * 100)} cents`,
  help: 'Fine tuning of the whole synth, about a semitone either way, to match other instruments.',
});
text(112, 462, 'TUNE', 16);
knob('pitch.glide', 112, 543, {
  name: 'Glide', module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each new note slides from the last one instead of jumping. Clockwise is a slower slide.',
});
text(112, 590, 'GLIDE', 16);

// ── Oscillators ───────────────────────────────────────────────────────────
const FT_OPTS = [{ v: '32', label: '32', a: -66 }, { v: '16', label: '16', a: -33 }, { v: '8', label: '8', a: 0 }, { v: '4', label: '4', a: 33 }, { v: '2', label: '2', a: 66 }];
const WAVE_OPTS = [{ v: 'off', label: '', a: -54 }, { v: 'saw', label: '', a: -18 }, { v: 'square', label: '', a: 18 }, { v: 'enh', label: '', a: 54 }];
const waveLabels = (x, y) => { at(x, y, -54, 50, 'OFF', 13); glyphAt(x, y, -18, 48, 'saw'); glyphAt(x, y, 18, 48, 'sq'); at(x, y, 54, 50, 'ENH', 13); };
const ftLabels = (x, y) => FT_OPTS.forEach((o) => at(x, y, o.a, 48, o.label, 13));

rotary('osc1.ft', 231, 324, FT_OPTS.map((o) => ({ ...o, label: '' })), '8', {
  name: 'OSC 1 footage (FT)', module: 'osc',
  help: 'The octave of the upper oscillator, in organ feet: 32 is the lowest, 2 the highest, and each step is an octave.',
});
ftLabels(231, 324); text(231, 372, 'FT', 16);
knob('osc1.width', 350, 324, {
  min: 10, max: 50, def: 50, name: 'OSC 1 pulse width', module: 'osc', fmt: (v) => `${Math.round(v)} %`,
  help: 'The width of the upper oscillator’s square wave. At 50 % it is a hollow square; turned down towards 10 % it thins to a nasal, reedy pulse. It is heard with the square and ENH waveforms.',
});
text(326, 360, '10', 13); text(382, 360, '50', 13); text(350, 384, 'WIDTH %', 15);
rotary('osc1.wave', 473, 324, WAVE_OPTS, 'saw', {
  name: 'OSC 1 waveform', module: 'osc',
  help: 'The upper oscillator’s waveform: sawtooth (bright and buzzy), square (hollow), ENH (the two together, fuller and more biting), or OFF.',
});
waveLabels(473, 324);

rotary('osc2.ft', 231, 543, FT_OPTS.map((o) => ({ ...o, label: '' })), '8', {
  name: 'OSC 2 footage (FT)', module: 'osc',
  help: 'The octave of the lower oscillator: 32 is the lowest, 2 the highest.',
});
ftLabels(231, 543); text(231, 590, 'FT', 16);
knob('osc2.pitch', 350, 543, {
  def: 5, name: 'OSC 2 pitch', module: 'osc', fmt: (v) => fmtSemi(pitch2Semi(v)),
  help: 'Tunes the lower oscillator against the upper one, up to an octave either way; in unison at the centre. A little off the centre makes the two beat and thicken; further round it sets an interval such as a fifth.',
});
text(350, 590, 'PITCH', 16);
rotary('osc2.wave', 473, 543, WAVE_OPTS, 'off', {
  name: 'OSC 2 waveform', module: 'osc',
  help: 'The lower oscillator’s waveform: sawtooth, square, ENH, or OFF.',
});
waveLabels(473, 543);

// ── Mixer ─────────────────────────────────────────────────────────────────
text(228, 433, 'MIX', 16);
knob('mix.osc1', 291, 433, {
  def: 8, name: 'Mix OSC 1', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud the upper oscillator is in the mix going into the filter.',
});
text(291, 481, 'OSC 1', 16);
line(339, 433, 363, 433);
knob('mix.osc2', 411, 433, {
  name: 'Mix OSC 2', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud the lower oscillator is in the mix.',
});
text(411, 481, 'OSC 2', 16);
line(459, 433, 484, 433);
knob('mix.ext', 532, 435, {
  name: 'Mix EXT', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Level of whatever is patched into EXT AUDIO. With nothing patched, the WASP’s own output is fed back in here: a little thickens the sound, more overdrives it, and near the top it howls.',
});
text(532, 483, 'EXT', 16);
line(578, 435, 592, 435); line(592, 435, 592, 494);
knob('mix.noise', 592, 543, {
  name: 'Noise signal', module: 'mixer', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'White noise into the mix: hiss for breath, wind, surf and snare drums.',
});
lines(592, 590, 'NOISE\nSIGNAL', 15, 12);

// ── Control oscillator ────────────────────────────────────────────────────
knob('ctrl.freq', 590, 324, {
  def: 5, name: 'Control osc frequency', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the control oscillator, from one cycle every two seconds to 100 Hz. At the top it is fast enough to be heard as a growl or a rough edge rather than a wobble.',
});
text(590, 372, 'FREQ', 16);
knob('ctrl.pitchMod', 709, 324, {
  name: 'Pitch mod', module: 'mod', fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the control oscillator moves the pitch of both oscillators: a touch for vibrato, more for sirens and trills, and at high speeds a clangorous, metallic tone.',
});
lines(709, 372, 'PITCH\nMOD', 15, 12);
const CTRL_OPTS = [
  { v: 'sine', label: '', a: -90 }, { v: 'up', label: '', a: -60 }, { v: 'down', label: '', a: -30 },
  { v: 'square', label: '', a: 0 }, { v: 'noise', label: '', a: 32 }, { v: 'rnd', label: '', a: 62 },
];
rotary('ctrl.wave', 709, 543, CTRL_OPTS, 'sine', {
  name: 'Control osc waveform', module: 'lfo',
  help: 'The control oscillator’s shape: sine (smooth vibrato and sweeps), rising or falling sawtooth (ramps that repeat), square (jumps between two values, a trill), NOISE (fast random wobble, a rough edge), or RND (a new random value each cycle: stepped, computer-like patterns).',
});
glyphAt(709, 543, -90, 50, 'sine'); glyphAt(709, 543, -60, 48, 'saw'); glyphAt(709, 543, -30, 48, 'rsaw'); glyphAt(709, 543, 0, 47, 'sq');
text(732, 499, 'NOISE', 13, { anchor: 'start' }); text(746, 519, 'RND', 13, { anchor: 'start' });
line(709, 596, 709, 616); line(709, 616, 830, 616); line(830, 616, 830, 606);
decor.push({ t: 'arrow', x: 830, y: 603, dir: 'up', size: 6 });

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.freq', 830, 324, {
  def: 6, name: 'Filter frequency', module: 'filter', fmt: (v) => fmtHz(cutHz(v)),
  help: 'The filter’s cutoff (low-pass and high-pass) or centre (band-pass and notch) frequency. In low-pass, turning it down makes the sound darker and duller.',
});
text(830, 372, 'FREQ', 16);
knob('vcf.q', 949, 324, {
  def: 2, name: 'Q', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Resonance: boosts a band round the filter frequency, so sweeps sound vocal and squelchy, and in band-pass and notch makes the band narrower. Near the top the filter whistles on its own.',
});
text(949, 372, '‘Q’', 16);
const MODE_OPTS = [{ v: 'lo', label: '', a: -54 }, { v: 'band', label: '', a: -18 }, { v: 'notch', label: '', a: 18 }, { v: 'hi', label: '', a: 54 }];
rotary('vcf.mode', 889, 435, MODE_OPTS, 'lo', {
  name: 'Filter mode', module: 'filter',
  help: 'Which part of the sound the filter keeps. LO (low-pass) keeps the bass and takes away brightness; HI (high-pass) the reverse, for thin sounds. BAND keeps only a band round the frequency, a nasal, telephone-like tone; NOTCH removes a band, a hollow, phasey tone.',
});
text(848, 402, 'LO', 13); text(862, 386, 'BAND', 13); text(921, 386, 'NOTCH', 13); text(933, 402, 'HI', 13);
knob('vcf.oscAmt', 830, 543, {
  min: -5, max: 5, def: 0, ring: false, name: 'Filter control (control osc)', module: 'filter', fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 4).toFixed(1)} oct`,
  help: 'How far the control oscillator moves the filter frequency. At 0 (the top) not at all; clockwise it sweeps the filter with the oscillator, anticlockwise with the oscillator upside down. With a sine this is a wah; with a square, a jump between two tones.',
});
bipolarArc(830, 543);
knob('vcf.envAmt', 949, 543, {
  min: -5, max: 5, def: 1.5, ring: false, name: 'Filter control (control env)', module: 'filter', fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 7).toFixed(1)} oct`,
  help: 'How far the control envelope moves the filter on each note. Clockwise the filter opens and closes again with the envelope, the classic plucked or wah shape; anticlockwise it dips and comes back up instead.',
});
bipolarArc(949, 543);
text(889, 590, 'FILTER CONTROL', 16);

// ── Envelope generators ───────────────────────────────────────────────────
knob('vca.attack', 1068, 324, {
  name: 'VCA attack', module: 'amp', fmt: (v) => fmtTime(envA(v)),
  help: 'How long each note takes to reach full loudness. Fully anticlockwise it starts at once; turned up it swells in.',
});
text(1068, 372, 'ATTACK', 16);
knob('vca.decay', 1187, 324, {
  def: 4, name: 'VCA decay', module: 'amp', fmt: (v) => fmtTime(envD(v)),
  help: 'How long the loudness takes to fall from full to the sustain level while the key is held, and to fade out after the key is let go.',
});
text(1187, 372, 'DECAY', 16);
knob('vca.sustain', 1310, 324, {
  def: 8, name: 'VCA sustain level / repeat', module: 'amp', fmt: (v) => (v < REP ? 'REPEAT' : `${Math.round(sustainOf(v) * 100)} %`),
  help: 'How loud a held note stays after the decay. Turned fully anticlockwise, to REPEAT, a held note plays again and again, each time rising over ATTACK and falling over DECAY.',
});
text(1276, 380, 'REPEAT', 13); lines(1334, 369, 'SUSTAIN\nLEVEL', 13, 11);
controls.push({
  id: 'vca.hold', type: 'toggle', x: 1127, y: 403, w: 22, h: 22, kind: 'bool', def: false, labelPos: 'none',
  name: 'Hold', module: 'amp',
  help: 'Freezes the loudness where it is at the moment you flip it, however it was moving, until you flip it back. Catch a note part way through its decay and it stays there. Flipped up with nothing playing, the synth stays silent until it is flipped back.',
});
text(1127, 380, 'HOLD', 13);
text(1019, 419, 'VCA ENV', 15, { anchor: 'start' });
text(1019, 450, 'CONTROL ENV', 15, { anchor: 'start' });
knob('cenv.attack', 1068, 543, {
  name: 'Control env attack', module: 'env', fmt: (v) => fmtTime(envA(v)),
  help: 'How long the control envelope takes to rise, and so how quickly FILTER CONTROL opens the filter at the start of a note.',
});
text(1068, 590, 'ATTACK', 16);
line(1068, 596, 1068, 616); line(1068, 616, 949, 616); line(949, 616, 949, 606);
decor.push({ t: 'arrow', x: 949, y: 603, dir: 'up', size: 6 });
knob('cenv.decay', 1187, 543, {
  def: 4, name: 'Control env decay', module: 'env', fmt: (v) => fmtTime(envD(v)),
  help: 'How long the control envelope takes to fall back after its peak, and so how long the filter sweep lasts. It falls whether the key is held or not.',
});
text(1187, 590, 'DECAY', 16);
knob('cenv.delay', 1310, 543, {
  def: 0.5, name: 'Control env delay / repeat', module: 'env', fmt: (v) => (v < REP ? 'REPEAT' : v === REP ? 'no delay' : fmtTime(delayOf(v))),
  help: 'Clockwise, a wait of up to a second after the key goes down before the control envelope starts, so the filter moves late. Fully anticlockwise, at REPEAT, the envelope rises and falls again and again for as long as the key is held.',
});
text(1276, 600, 'REPEAT', 13); text(1336, 589, 'DELAY', 13);

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1427, 324, {
  def: 7, name: 'Volume', module: 'out', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The overall output level.',
});
text(1427, 372, 'VOLUME', 16);
line(1427, 458, 1427, 505);
knob('out.phones', 1427, 543, {
  def: 7, name: 'Phones level', module: 'out', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Headphone level on the hardware. It does not change the sound here: use VOLUME.',
});
text(1427, 590, 'PHONES', 16);

// ── Jacks ─────────────────────────────────────────────────────────────────
const jack = (id, x, y, dir, rest) => jacks.push({ id, x, y, r: 15, labelPos: 'none', dir, ...rest });
text(412, 152, 'OSC1', 14); decor.push({ t: 'arrow', x: 412, y: 140, dir: 'up', size: 5 });
text(471, 152, 'OSC2', 14); decor.push({ t: 'arrow', x: 471, y: 140, dir: 'up', size: 5 });
text(531, 152, 'EXT', 14); decor.push({ t: 'arrow', x: 531, y: 165, dir: 'down', size: 5 });
text(531, 218, 'AUDIO', 14);
jack('j.osc1', 412, 190, 'out', { label: 'OSC1', name: 'OSC1 out', signal: 'osc1', help: 'The upper oscillator on its own, before the mixer and filter.' });
jack('j.osc2', 471, 190, 'out', { label: 'OSC2', name: 'OSC2 out', signal: 'osc2', help: 'The lower oscillator on its own, before the mixer and filter.' });
jack('j.ext', 531, 190, 'in', {
  label: 'EXT AUDIO', dest: 'extIn', amt: 1,
  check: (v) => (v['mix.ext'] <= 0 ? 'The EXT knob in the mixer is at 0, so nothing patched here reaches the filter. Turn EXT up.' : null),
  help: 'Outside audio into the mixer, set by the EXT knob, so it can be filtered like the oscillators. A cable here replaces the feedback of the WASP’s own output that EXT carries when nothing is patched.',
});
text(1365, 152, 'MAIN', 14); decor.push({ t: 'arrow', x: 1365, y: 140, dir: 'up', size: 5 });
text(1365, 218, 'AUDIO', 14);
jack('j.main', 1365, 190, 'out', { label: 'MAIN AUDIO', signal: 'out', help: 'The main audio output.' });
text(1427, 152, 'POWER', 14);
decor.push({ t: 'led', x: 1427, y: 190, r: 6, color: 'green', litWhen: 'power' });
jack('j.phones', 1427, 435, 'out', { label: 'PHONES', signal: 'out', help: 'Headphone output.' });

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const areas = [
  { id: 'midi', label: 'MIDI and USB', module: 'util', keywords: 'midi usb thru poly chain',
    rects: [R(14, 108, 322, 236)],
    help: 'The WASP Deluxe has no keyboard: it is played over MIDI IN or USB, here from the on-screen keyboard. MIDI THRU passes the notes on, which is how several units are chained for more voices.' },
  { id: 'patch', label: 'Oscillator outputs and EXT AUDIO', module: 'util', keywords: 'patch jack input output external audio',
    rects: [R(322, 108, 1320, 236)],
    help: 'OSC1 and OSC2 send each oscillator out on its own, before the filter. EXT AUDIO brings another sound into the mixer, where the EXT knob sets its level and the filter shapes it.' },
  { id: 'keyboard', label: 'Keyboard: bend, tune, glide', module: 'glide', keywords: 'pitch bend tune portamento glide',
    rects: [R(14, 236, 172, 645)],
    help: 'BEND bends the pitch up or down from the 0 at the top. TUNE is fine tuning, and GLIDE makes each note slide into the next.' },
  { id: 'osc1', label: 'Upper oscillator (OSC 1)', module: 'osc', keywords: 'oscillator footage octave pulse width pwm waveform sawtooth square enhanced',
    rects: [R(172, 236, 530, 385)],
    help: 'The upper oscillator. FT picks the octave, the waveform switch picks sawtooth, square, ENH or OFF, and WIDTH sets how thin the square is.' },
  { id: 'mixer', label: 'Mix', module: 'mixer', keywords: 'mixer level volume noise feedback external',
    rects: [R(172, 385, 560, 490), R(530, 490, 650, 645)],
    help: 'Levels for the two oscillators, EXT and white noise, all going into the filter. With nothing patched into EXT AUDIO, EXT feeds the WASP’s own output back in: from thickening, through overdrive, to a howl.' },
  { id: 'osc2', label: 'Lower oscillator (OSC 2)', module: 'osc', keywords: 'oscillator footage octave detune interval waveform',
    rects: [R(172, 490, 530, 645)],
    help: 'The lower oscillator: FT for the octave, the waveform switch, and PITCH to tune it against the upper one for detuning or intervals.' },
  { id: 'ctrl', label: 'Control oscillator', module: 'lfo', keywords: 'lfo vibrato wobble trill random sample hold noise rate',
    rects: [R(530, 236, 770, 385), R(560, 385, 770, 490), R(650, 490, 770, 645)],
    help: 'The control oscillator is the LFO: it makes no sound itself but moves other things. FREQ sets its speed, from slow to 100 Hz, and the switch picks one of six shapes. PITCH MOD sends it to both oscillators’ pitch; the left FILTER CONTROL knob sends it to the filter.' },
  { id: 'filter', label: 'Filter', module: 'filter', keywords: 'cutoff resonance q brightness low-pass band-pass notch high-pass multimode filter control',
    rects: [R(770, 236, 1008, 645)],
    help: 'One multimode filter: LO, BAND, NOTCH or HI. FREQ sets where it acts and Q how sharply. The two FILTER CONTROL knobs below are its modulation: the control oscillator on the left, the control envelope on the right, each with 0 at the top so it can push the filter either way.' },
  { id: 'vcaenv', label: 'VCA envelope', module: 'amp', keywords: 'envelope loudness attack decay sustain release repeat hold amplifier',
    rects: [R(1008, 236, 1365, 435)],
    help: 'The envelope that shapes each note’s loudness: ATTACK, DECAY (which also sets how long the note fades after the key is let go) and SUSTAIN LEVEL. SUSTAIN LEVEL’s far end is REPEAT, and HOLD freezes the loudness where it is.' },
  { id: 'cenv', label: 'Control envelope', module: 'env', keywords: 'envelope filter envelope contour attack decay delay repeat',
    rects: [R(1008, 435, 1365, 645)],
    help: 'A second envelope for the filter, reaching it through the right-hand FILTER CONTROL knob. It rises over ATTACK and falls over DECAY on each note. Its third knob delays the start by up to a second, or at its far end, REPEAT, cycles it while the key is held.' },
  { id: 'output', label: 'Output', module: 'out', keywords: 'volume headphones main output',
    rects: [R(1320, 108, 1526, 236), R(1365, 236, 1526, 645)],
    help: 'VOLUME sets the output level, and PHONES the headphone level. MAIN AUDIO is the audio output.' },
];

// ── Move everything from image pixels to view units ───────────────────────
const shiftXY = (o) => {
  for (const k of ['x', 'x1', 'x2']) if (typeof o[k] === 'number') o[k] -= OX;
  for (const k of ['y', 'y1', 'y2']) if (typeof o[k] === 'number') o[k] -= OY;
};
[...controls, ...decor, ...jacks].forEach(shiftXY);
areas.forEach((a) => a.rects.forEach(shiftXY));

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO_MIX = { sine: { sine: 1 }, up: { saw: 1 }, down: { rsaw: 1 }, square: { sq: 1 } };
const oscOf = (wave, width, semi, lvl) => {
  const pw = width / 100;
  if (wave === 'off') return { level: 0, mix: {}, pw: 0.5, semi, kbd: true, syncTo: -1 };
  const mix = wave === 'saw' ? { saw: 0.6 } : wave === 'square' ? { pulse: 0.6 } : { saw: 0.5, pulse: 0.42 };
  return { level: lvl, mix, pw, semi, kbd: true, syncTo: -1 };
};

function toEngine(v) {
  const shape = v['ctrl.wave'];
  const src = shape === 'noise' ? 'noise' : shape === 'rnd' ? 'sh' : 'lfo';
  const routes = [];
  const add = (s, dst, amt) => { if (amt) routes.push({ src: s, dst, amt }); };
  add(src, 'pitchAll', pitchModSemi(v['ctrl.pitchMod']));
  add(src, 'cutoff', signed(v['vcf.oscAmt'], 4));
  const mode = v['vcf.mode'];
  const vRep = v['vca.sustain'] < REP;
  const cRep = v['cenv.delay'] < REP;
  const vd = envD(v['vca.decay']);
  const cd = envD(v['cenv.decay']);
  const rate = lfoHz(v['ctrl.freq']);
  return {
    osc: [
      oscOf(v['osc1.wave'], v['osc1.width'], FT_SEMI[v['osc1.ft']], level10(v['mix.osc1'], 1)),
      oscOf(v['osc2.wave'], 50, FT_SEMI[v['osc2.ft']] + pitch2Semi(v['osc2.pitch']), level10(v['mix.osc2'], 1)),
    ],
    noise: { level: level10(v['mix.noise'], 0.6), color: 'white' },
    ext: { level: level10(v['mix.ext'], 1.2) },
    filter: {
      type: 'svf', mode: mode === 'lo' ? 'lp' : mode === 'hi' ? 'hp' : mode === 'band' ? 'bp' : 'morph',
      ...(mode === 'notch' ? { morph: 0.5 } : {}),
      cutoff: cutHz(v['vcf.freq']), res: (v['vcf.q'] / 10) * 1.03,
      envAmt: signed(v['vcf.envAmt'], 7), envSrc: 'env2', kbd: 0.5,
    },
    env1: { a: envA(v['vca.attack']), d: vd, s: sustainOf(v['vca.sustain']), r: vd, loop: vRep, freeze: v['vca.hold'] },
    env2: { a: envA(v['cenv.attack']), d: cd, s: 0, r: cd, dly: cRep ? 0 : delayOf(v['cenv.delay']), loop: cRep },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate, mix: LFO_MIX[shape] || { sine: 1 }, keySync: false },
    glide: { time: glideTime(v['pitch.glide']), legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    routes,
    normals: { extIn: 'out' },
    od: { on: false }, delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' }, slew: { time: 0.1 }, att: [1, 1],
    tune: tuneSemi(v['pitch.tune']) + bendSemi(v['pitch.bend']),
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'wasp-buzz-bass', name: 'Buzz Bass', ref: 'The Wasp’s own character: digital sawtooths through a low-pass filter', artist: 'Classic technique',
    tags: ['bass', 'buzzy', 'late-70s'], level: 1,
    blurb: 'A raw, buzzy bass with a quick filter snap on every note.',
    how: 'Both oscillators on sawtooth, the lower one an octave down, so there is plenty of edge for the filter to cut. The filter sits low and the control envelope, through the right FILTER CONTROL knob, opens it briefly at the start of each note. The VCA envelope holds full level while the key is down.',
    phrase: { bpm: 116, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.2], [1, 48, 0.4], [1.5, 39, 0.4], [2, 41, 0.4], [2.5, 36, 0.2], [3, 43, 0.4], [3.5, 46, 0.4]] },
    steps: [
      { title: 'Two sawtooths, an octave apart', module: 'osc', why: 'Both oscillators go on sawtooth, one an octave under the other. The lower one gives the bass its weight and the upper one its buzz, so there is plenty of raw edge for the filter to cut later.\n- OSC 1 sawtooth, FT 8: FT is footage, the octave in organ feet. 8 plays at the pitch of the keys. The WASP’s oscillators are digital, so the saw has a hard, buzzy edge.\n- OSC 2 sawtooth, FT 16, PITCH 5: 16 is an octave lower, and PITCH at 5 (the centre) keeps it exactly in tune with OSC 1. This is the low end.\n- Mix OSC 1 7, OSC 2 8: the lower saw slightly louder so the weight leads. Turn OSC 1 down to hear how dull the bass gets without the upper buzz.\n- Listen for: a bright, raw buzz with a solid bottom. It is harsh on its own; the filter tames it next.',
        set: { 'osc1.wave': 'saw', 'osc1.ft': '8', 'osc2.wave': 'saw', 'osc2.ft': '16', 'osc2.pitch': 5, 'mix.osc1': 7, 'mix.osc2': 8 } },
      { title: 'A low filter', module: 'filter', why: 'The filter now takes most of the brightness away, so between notes the bass is a dull, round thud. The next step opens it on each note.\n- Filter mode LO: low-pass. It keeps the lows and cuts the highs, the usual choice for bass.\n- FREQ 3 (about 174 Hz): the cutoff, low enough that most of the buzz is gone and you mainly hear the body. Turn it up and the saws come back; down and the notes turn to a muffled thump.\n- Q 4 (40 %): Q is the WASP’s name for resonance, a boost right at the cutoff. A moderate amount gives the snap to come a slight edge.\n- Listen for: a much darker, woollier bass. There is still a small push on each note from the control envelope’s starting setting.',
        set: { 'vcf.mode': 'lo', 'vcf.freq': 3, 'vcf.q': 4 } },
      { title: 'Snap it open', module: 'env', why: 'The control envelope is the WASP’s filter envelope: it pushes the cutoff up on each note and lets it fall back. Set short and deep, it gives every note a quick bright snap.\n- Control env ATTACK 0 (2 ms): the filter opens at once, so the snap lands right on the beat.\n- Control env DECAY 3.2 (85 ms): how fast it closes again. Shorter is a tight click; longer turns it into a slow wah.\n- DELAY / REPEAT 0.5 (no delay): the envelope starts the moment the key goes down.\n- FILTER CONTROL (right) +3.2 (+3.7 oct): how far the envelope lifts the cutoff. 0 is at the top; anticlockwise would make each note dip darker instead.\n- Listen for: a hard “dow” on the front of every note. Sweep DECAY between 2 and 5 while the riff plays.',
        set: { 'cenv.attack': 0, 'cenv.decay': 3.2, 'cenv.delay': 0.5, 'vcf.envAmt': 3.2 } },
      { title: 'Full level while held', module: 'amp', why: 'The VCA envelope shapes loudness. VCA stands for voltage-controlled amplifier: the part that turns each note on and off. For a bass you want notes that start hard and stop cleanly.\n- VCA ATTACK 0 (2 ms): full level straight away, so the loudness lines up with the filter snap.\n- SUSTAIN LEVEL 10 (100 %): held notes stay at full weight instead of fading.\n- VCA DECAY 2.5 (53 ms): the WASP has no release knob, so DECAY also sets the fade after you let go. Short means each note stops almost as soon as the key comes up.\n- Listen for: tight gaps between the notes of the riff. Raise DECAY to 5 and the notes blur into each other.',
        set: { 'vca.attack': 0, 'vca.decay': 2.5, 'vca.sustain': 10 } },
    ],
    context: {
      'vcf.envAmt': 'In this sound: the size of the snap. Anticlockwise from 0 turns it into a dull dip.',
      'cenv.decay': 'In this sound: the length of the snap, from a click to a slow wah.',
      'vcf.q': 'In this sound: a little edge on the snap. Turn it up for a squelch.',
      'osc2.ft': 'In this sound: the lower octave that gives the bass its weight.',
    },
    tweaks: [
      { id: 'cenv.decay', try: 'Move between 2 and 5', hear: 'From a tight click to a rubbery wah.' },
      { id: 'vcf.q', try: 'Raise to 8', hear: 'Each note squelches.' },
      { id: 'osc1.wave', try: 'Switch to ENH', hear: 'A fuller, more biting top.' },
    ],
  },
  {
    id: 'wasp-feedback-lead', name: 'Feedback Lead', ref: 'The EXT knob as a feedback control', artist: 'Classic technique',
    tags: ['lead', 'feedback', 'dirty'], level: 2,
    blurb: 'A lead that growls and overdrives because the WASP is fed its own output.',
    how: 'With nothing plugged into EXT AUDIO, the EXT knob feeds the WASP’s output back into its own mixer. Turned part way up, the filter is driven harder by its own signal: the sound thickens and distorts. A high Q makes the loop ring and scream on some notes.',
    phrase: { bpm: 100, loop: true, steps: [[0, 64, 0.9], [1, 67, 0.4], [1.5, 69, 1.4], [3, 71, 0.4], [3.5, 69, 0.4]] },
    steps: [
      { title: 'A square lead', module: 'osc', why: 'A single square wave gives a hollow, reedy lead with a clear pitch. The second oscillator is switched off so there is room for the feedback that comes next.\n- OSC 1 square, WIDTH 35 %: a square at 50 % is hollow; narrowing it to 35 % makes it thinner and more nasal, a reedy edge that cuts through a mix.\n- OSC 2 off: the waveform switch has an OFF position, so the lower oscillator makes no sound whatever its mix level.\n- Mix OSC 1 7 (70 %): a little below the start of 8, leaving headroom for the fed-back signal.\n- Listen for: a plain, clean square lead. Remember how it sounds before the next step.',
        set: { 'osc1.wave': 'square', 'osc1.width': 35, 'osc2.wave': 'off', 'mix.osc1': 7 } },
      { title: 'Feed the output back', module: 'mixer', why: 'This is the WASP’s trick. With nothing plugged into EXT AUDIO (the external audio input), the EXT knob feeds the synth’s own output back into its mixer, so the filter is driven by its own signal.\n- Mix EXT 6.5 (65 %): well into overdrive. Below about 4 it only thickens; above about 7 it starts to howl.\n- Listen for: the lead going thick, gritty and slightly unstable. Hold a note and sweep EXT from 3 to 8 to hear clean, then dirty, then a scream.',
        set: { 'mix.ext': 6.5 } },
      { title: 'A resonant filter', module: 'filter', why: 'A resonant low-pass filter gives the feedback something to ring against, so the lead growls rather than just distorting.\n- Filter mode LO: low-pass, keeping the body and trimming the top.\n- FREQ 5.5 (about 870 Hz): about half open, so the square still sounds bright.\n- Q 6.5 (65 %): Q is resonance, a boost at the cutoff. The feedback excites it, which is where the growl and the ringing on some notes come from.\n- FILTER CONTROL (right) +1.5 (+1.3 oct): a gentle push from the control envelope, the filter’s own envelope, at the start of each note, fading over the control env DECAY of 5 (280 ms).\n- Listen for: some notes ringing harder than others as they line up with the resonance.',
        set: { 'vcf.mode': 'lo', 'vcf.freq': 5.5, 'vcf.q': 6.5, 'vcf.envAmt': 1.5, 'cenv.decay': 5 } },
      { title: 'Vibrato', module: 'lfo', why: 'Vibrato from the control oscillator, the WASP’s LFO (low-frequency oscillator): a slow wave that moves something else rather than making sound.\n- Control osc waveform sine: a smooth, even wobble, the natural shape for vibrato.\n- Control osc FREQ 3.9 (about 4 Hz): the speed of the vibrato. Faster sounds nervous; slower sounds like a wobble.\n- PITCH MOD 1.2 (+0.3 st): a panel knob, separate from the mod wheel. It sets how far the pitch moves, a small amount here.\n- Listen for: long notes gaining a gentle waver. Turn PITCH MOD to 0 to hear the lead go static.',
        set: { 'ctrl.wave': 'sine', 'ctrl.freq': 3.9, 'ctrl.pitchMod': 1.2 } },
    ],
    context: {
      'mix.ext': 'In this sound: the amount of feedback. Below 4 it is clean; above 7 it howls.',
      'vcf.q': 'In this sound: how much the feedback loop rings.',
      'ctrl.pitchMod': 'In this sound: the depth of the vibrato.',
    },
    tweaks: [
      { id: 'mix.ext', try: 'Sweep from 3 to 8 while holding a note', hear: 'Clean, then thick, then a screaming howl.' },
      { id: 'vcf.mode', try: 'Switch to BAND', hear: 'A nasal, honking growl.' },
      { id: 'vcf.freq', try: 'Move slowly between 4 and 7', hear: 'The feedback changes pitch and character.' },
    ],
  },
  {
    id: 'wasp-repeat-pulse', name: 'Repeat Pulse', ref: 'The VCA envelope’s REPEAT position', artist: 'Classic technique',
    tags: ['seq', 'rhythm', 'repeat'], level: 1,
    blurb: 'Hold one key and it pulses by itself, like a note played over and over.',
    how: 'SUSTAIN LEVEL turned fully anticlockwise, to REPEAT, makes the VCA envelope start again each time it finishes decaying. ATTACK and DECAY together set the speed of the pulses. The control envelope is on REPEAT too, so each pulse also has a filter pluck.',
    phrase: { bpm: 90, loop: true, steps: [[0, 48, 3.8], [4, 51, 1.8], [6, 46, 1.8]] },
    steps: [
      { title: 'A bright source', module: 'osc', why: 'Two bright waveforms a fifth apart give a full, buzzy chord from one key, strong enough for the pulsing to cut through.\n- OSC 1 ENH: ENH is the sawtooth and square together, fuller and more biting than either alone.\n- OSC 2 sawtooth, PITCH 7.9 (+7 st): PITCH tunes OSC 2 against OSC 1. Seven semitones up is a fifth, so each key plays a power chord.\n- Mix OSC 1 7, OSC 2 6: the root a little louder than the fifth, so the pitch you play stays clear.\n- Listen for: a thick, bright two-note sound. Turn PITCH back to 5 to hear it fall to a single note.',
        set: { 'osc1.wave': 'enh', 'osc2.wave': 'saw', 'osc2.pitch': 7.9, 'mix.osc1': 7, 'mix.osc2': 6 } },
      { title: 'Loudness on REPEAT', module: 'amp', why: 'SUSTAIN LEVEL has a REPEAT position at its far end. There the VCA envelope, the one shaping loudness (VCA is voltage-controlled amplifier), restarts every time it finishes, so a held key pulses by itself.\n- SUSTAIN LEVEL 0 (REPEAT): fully anticlockwise. The envelope rises over ATTACK, falls over DECAY, then starts again.\n- VCA ATTACK 0 (2 ms): each pulse starts with a hard hit.\n- VCA DECAY 3 (74 ms): short, so the pulses come quickly. ATTACK and DECAY together set the pulse rate: longer DECAY, slower pulses.\n- Listen for: hold one key and it plays itself like a fast repeated note. Move DECAY between 2 and 5 to change the speed.',
        set: { 'vca.sustain': 0, 'vca.attack': 0, 'vca.decay': 3 } },
      { title: 'A pluck on each pulse', module: 'env', why: 'The control envelope, the second envelope that moves the filter, goes on REPEAT too, so each pulse also gets a filter pluck instead of just a volume blip.\n- Control env on REPEAT, DECAY 3 (74 ms): DELAY / REPEAT fully anticlockwise and ATTACK 0, the same timing as the VCA envelope, so the pluck and the pulse line up.\n- FILTER CONTROL (right) +3 (+3.4 oct): how far each cycle lifts the cutoff. 0 is at the top of the knob.\n- FREQ 3.5 (about 240 Hz), Q 5 (50 %): a low cutoff so each pulse closes to dark, and a fair amount of resonance (Q) for a slight squelch on the pluck.\n- Listen for: each pulse going “bip” rather than just on and off. Set control env DECAY to 5 and the two envelopes drift apart into a shifting pattern.',
        set: { 'cenv.delay': 0, 'cenv.attack': 0, 'cenv.decay': 3, 'vcf.envAmt': 3, 'vcf.freq': 3.5, 'vcf.q': 5 } },
    ],
    context: {
      'vca.sustain': 'In this sound: at REPEAT. Turn it clockwise and the note just sustains.',
      'vca.decay': 'In this sound: the speed of the pulses. Longer decay, slower pulses.',
      'cenv.delay': 'In this sound: at REPEAT, so the filter plucks on every pulse.',
    },
    tweaks: [
      { id: 'vca.decay', try: 'Move between 2 and 5', hear: 'The pulses speed up and slow down.' },
      { id: 'cenv.decay', try: 'Set to 5', hear: 'The filter cycles at a different speed from the loudness, so the pattern shifts.' },
      { id: 'vca.attack', try: 'Raise to 4', hear: 'Soft swells instead of hits.' },
    ],
  },
  {
    id: 'wasp-random-bleeps', name: 'Random Bleeps', ref: 'In the style of late-70s sci-fi computer sounds', artist: 'Classic technique',
    tags: ['fx', 'sci-fi', 'random'], level: 2,
    blurb: 'A held note turns into a stream of random, resonant blips.',
    how: 'The control oscillator on RND picks a new random value each cycle, and the left FILTER CONTROL knob sends it to the filter, so the tone jumps at random. A high Q makes each step ring. The VCA envelope on REPEAT turns the held note into separate blips.',
    phrase: { bpm: 90, loop: true, steps: [[0, 60, 7.8]] },
    steps: [
      { title: 'A bright source', module: 'osc', why: 'One sawtooth is all this needs: it is full of harmonics, which gives the resonant filter plenty to pick out. The random tones in the next step come from the filter, not the oscillator.\n- OSC 1 sawtooth: the brightest, buzziest waveform. On the WASP it is digital, with a hard edge.\n- OSC 2 off: a single oscillator keeps the pitch plain so the filter jumps stand out.\n- Mix OSC 1 8 (80 %): the full starting level.',
        set: { 'osc1.wave': 'saw', 'osc2.wave': 'off', 'mix.osc1': 8 } },
      { title: 'Random steps on the filter', module: 'lfo', why: 'The control oscillator (the WASP’s LFO, low-frequency oscillator) on RND, random, picks a new level each cycle. Sent to the filter, it makes the tone jump to a new random colour each time.\n- Control osc waveform RND: a sample and hold built into the LFO. Each cycle it jumps to a new random level and stays there.\n- Control osc FREQ 4.2 (about 4.6 Hz): how often a new value is picked, here several times a second.\n- FILTER CONTROL (left) +3.5 (+2.4 oct): how far the random steps move the filter. More spreads the tones further apart.\n- FREQ 5.2 (about 720 Hz), Q 8 (80 %): the filter sits in the middle and Q (resonance) is high, so each step rings with its own whistle.\n- FILTER CONTROL (right) 0: the control envelope is taken off the filter so only the random steps move it.\n- Listen for: a held note turning into a string of random, computer-like tones. Lower Q to 3 and they become dull ticks.',
        set: { 'ctrl.wave': 'rnd', 'ctrl.freq': 4.2, 'vcf.oscAmt': 3.5, 'vcf.freq': 5.2, 'vcf.q': 8, 'vcf.envAmt': 0 } },
      { title: 'Chop it into blips', module: 'amp', why: 'SUSTAIN LEVEL on REPEAT chops the held note into separate blips, so the random tones sound like individual beeps.\n- SUSTAIN LEVEL 0 (REPEAT): the VCA envelope (VCA is voltage-controlled amplifier, the loudness stage) loops for as long as the key is held.\n- VCA ATTACK 0 (2 ms), DECAY 2.6 (57 ms): each blip starts hard and dies quickly. Longer DECAY gives slower, longer blips.\n- Listen for: the blips and the filter steps running at different speeds, so the pattern never quite repeats.',
        set: { 'vca.sustain': 0, 'vca.attack': 0, 'vca.decay': 2.6 } },
    ],
    context: {
      'vcf.oscAmt': 'In this sound: how far apart the random tones are.',
      'ctrl.freq': 'In this sound: how often a new random tone is picked.',
      'vcf.q': 'In this sound: makes each tone whistle. Lower it for dull ticks.',
    },
    tweaks: [
      { id: 'ctrl.pitchMod', try: 'Raise to 3', hear: 'The pitch jumps at random too.' },
      { id: 'ctrl.wave', try: 'Switch to NOISE', hear: 'A fast, rough gargle instead of steps.' },
      { id: 'vcf.mode', try: 'Switch to BAND', hear: 'Thinner, more electronic blips.' },
    ],
  },
  {
    id: 'wasp-notch-pad', name: 'Notch Drift', ref: 'The NOTCH filter swept slowly', artist: 'Classic technique',
    tags: ['pad', 'phaser', 'slow'], level: 2,
    blurb: 'A slow, hollow, phasing drone from a notch swept by the control oscillator.',
    how: 'NOTCH cuts a band out of the sound instead of keeping one. The control oscillator, slow and on sine, moves that notch up and down through two slightly detuned sawtooths, which gives a hollow, phaser-like movement. A slow attack and long decay make it a pad.',
    phrase: { bpm: 60, loop: true, steps: [[0, 48, 3.8], [4, 45, 3.8]] },
    steps: [
      { title: 'Two detuned sawtooths', module: 'osc', why: 'Two sawtooths at the same octave, a hair apart, beat slowly against each other. That gives the pad its width and gives the notch filter a thick sound to cut into.\n- OSC 1 and OSC 2 sawtooth, OSC 2 FT 8: both at the pitch of the keys. FT is footage, the octave in organ feet.\n- OSC 2 PITCH 5.1 (+0.1 st): just off the centre. Too small to hear as out of tune, enough to make the two slowly beat.\n- Mix OSC 1 and OSC 2 at 7: equal levels, so the beating is as deep as it can be.\n- Listen for: a slow, even swirl on a held note. Set PITCH back to 5 and it goes still.',
        set: { 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.ft': '8', 'osc2.pitch': 5.05, 'mix.osc1': 7, 'mix.osc2': 7 } },
      { title: 'A notch', module: 'filter', why: 'NOTCH mode cuts a band out of the sound and keeps everything else. It gives a hollow, phasey tone, and it is rare on a small mono synth.\n- Filter mode NOTCH: the opposite of BAND. The lows and highs pass; a slice in the middle is removed.\n- FREQ 5.5 (about 870 Hz): where the notch sits, in the middle of the sound.\n- Q 5.5 (55 %): Q is resonance. In NOTCH it sets how narrow the cut is, making it deeper and more obvious.\n- FILTER CONTROL (right) 0: no envelope on the filter, so the notch stays put on each note.\n- Listen for: the sawtooths sounding slightly hollow, with a hole in the middle. It is subtle until the notch moves.',
        set: { 'vcf.mode': 'notch', 'vcf.freq': 5.5, 'vcf.q': 5.5, 'vcf.envAmt': 0 } },
      { title: 'Sweep it slowly', module: 'lfo', why: 'The control oscillator (the WASP’s LFO, low-frequency oscillator) now moves the notch slowly up and down, which is what makes it sound like a phaser.\n- Control osc waveform sine: a smooth wave, so the notch glides rather than jumps.\n- Control osc FREQ 0.4 (about 0.6 Hz): near its slowest, roughly one sweep every couple of seconds.\n- FILTER CONTROL (left) +3.5 (+2.4 oct): how far the notch travels. More gives a wider, more dramatic sweep.\n- Listen for: a hollow “whoosh” moving up and down inside the held note. Switch the mode to LO and it becomes a plain wah.',
        set: { 'ctrl.wave': 'sine', 'ctrl.freq': 0.4, 'vcf.oscAmt': 3.5 } },
      { title: 'A slow swell', module: 'amp', why: 'A slow attack and long fade turn the drone into a pad that swells in and lingers.\n- VCA ATTACK 6 (190 ms): VCA is voltage-controlled amplifier, the loudness stage. Each note fades in instead of starting hard.\n- SUSTAIN LEVEL 10 (100 %): held notes stay at full level.\n- VCA DECAY 7 (1.1 s): with no release knob, DECAY also sets the fade after you let go, here about a second.\n- Listen for: notes blooming in and ringing on after the key comes up, with the notch still moving through the tail.',
        set: { 'vca.attack': 6, 'vca.decay': 7, 'vca.sustain': 10 } },
    ],
    context: {
      'vcf.mode': 'In this sound: NOTCH. On LO the movement becomes a plain wah.',
      'vcf.oscAmt': 'In this sound: how far the notch travels.',
      'osc2.pitch': 'In this sound: the slow beating between the oscillators.',
    },
    tweaks: [
      { id: 'vcf.q', try: 'Raise to 8', hear: 'A narrower notch with a ringing edge.' },
      { id: 'ctrl.freq', try: 'Raise to 2', hear: 'A faster, swirling phaser.' },
      { id: 'vcf.mode', try: 'Switch to BAND', hear: 'A vocal, wah-like sweep instead.' },
    ],
  },
  {
    id: 'wasp-delayed-sweep', name: 'Late Sweep', ref: 'The control envelope’s DELAY', artist: 'Classic technique',
    tags: ['lead', 'brass', 'delay'], level: 3,
    blurb: 'A brassy note whose filter opens a moment after it starts.',
    how: 'The DELAY end of the control envelope’s third knob holds the envelope back after the key goes down, so the note starts dark and then opens. With a slow attack on the control envelope the brightness swells in like a brass player leaning into a note.',
    phrase: { bpm: 72, loop: true, steps: [[0, 60, 1.8], [2, 63, 1.8], [4, 67, 3.5]] },
    steps: [
      { title: 'Two sawtooths an octave apart', module: 'osc', why: 'Two sawtooths an octave apart give a full, brassy starting sound, with a low octave for body and plenty of edge for the filter to work on.\n- OSC 1 sawtooth at 8, OSC 2 sawtooth at 16: FT (footage) is the octave in organ feet, and 16 is an octave below 8.\n- OSC 2 PITCH 5 (0 st): the centre, exactly in tune.\n- Mix OSC 1 7, OSC 2 6: the upper saw leads and the lower one adds body.\n- Listen for: a bright, buzzy stack.',
        set: { 'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.ft': '16', 'osc2.pitch': 5.02, 'mix.osc1': 7, 'mix.osc2': 6 } },
      { title: 'Start dark', module: 'filter', why: 'The filter closes down so every note starts dark. The delayed sweep in the next step needs a dark starting point to be heard.\n- Filter mode LO: low-pass, which keeps the lows and cuts the highs.\n- FREQ 3 (about 174 Hz): low, so most of the buzz is gone.\n- Q 3 (30 %): Q is resonance. A little adds some colour without squelch.\n- Listen for: a muffled, soft tone.',
        set: { 'vcf.mode': 'lo', 'vcf.freq': 3, 'vcf.q': 3 } },
      { title: 'Open late', module: 'env', why: 'The control envelope, the filter’s own envelope, is held back after the key goes down, then slowly opens the filter. The note starts dark and brightens, like a brass player leaning into it.\n- DELAY / REPEAT 5 (470 ms): the wait before the envelope starts, about half a second. The knob goes up to a second.\n- Control env ATTACK 5 (89 ms): how quickly the brightness rises once the delay is over. Longer makes the swell softer.\n- Control env DECAY 7 (1.1 s): how slowly it closes again. The envelope has no sustain, so it falls back even while the key is held.\n- FILTER CONTROL (right) +3.5 (+4.2 oct): how bright the peak gets.\n- Listen for: hold a long note. Nothing for half a second, then it opens up. Turn DELAY back to 0.5 to hear the swell arrive at once.',
        set: { 'cenv.delay': 5, 'cenv.attack': 5, 'cenv.decay': 7, 'vcf.envAmt': 3.5 } },
      { title: 'Held loudness', module: 'amp', why: 'The VCA envelope (VCA is voltage-controlled amplifier, the loudness stage) holds the note at full level so you hear the whole filter move.\n- VCA ATTACK 2 (9 ms): a small softening of the start, so notes don’t click.\n- SUSTAIN LEVEL 10 (100 %): full level for as long as the key is held.\n- VCA DECAY 4 (140 ms): also the fade after release, fairly short.\n- Listen for: short notes can end before the delay runs out and stay dark; only the longer ones open up.',
        set: { 'vca.attack': 2, 'vca.decay': 4, 'vca.sustain': 10 } },
    ],
    context: {
      'cenv.delay': 'In this sound: how long the note waits before it brightens.',
      'cenv.attack': 'In this sound: how slowly the brightness swells in.',
      'vcf.envAmt': 'In this sound: how bright it gets.',
    },
    tweaks: [
      { id: 'cenv.delay', try: 'Turn to 0.5 (no delay)', hear: 'The swell starts with the note.' },
      { id: 'vcf.envAmt', try: 'Turn anticlockwise to −3 and raise FREQ to 7', hear: 'The note starts bright and darkens late instead.' },
      { id: 'ctrl.pitchMod', try: 'Raise to 1', hear: 'A vibrato on top.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'wasp-deluxe', name: 'WASP Deluxe', maker: 'Behringer', year: 2020,
  heritage: 'Based on the EDP Wasp Deluxe, from Oxford in the late 1970s',
  summary: 'A mono synth with two digital oscillators, each sawtooth, square or ENH in five octave ranges, into one multimode filter (low-pass, band-pass, notch, high-pass) and a VCA. A control oscillator with six shapes, a VCA envelope and a control envelope for the filter that can both repeat, and an EXT input that feeds the output back in when nothing is patched.',
  view: { w: 1512, h: 537 },
  theme: { panel: '#303133', panel2: '#26272a', ink: INK, font: 'din', weight: 700, cheeks: 'wood', cheekW: 26, knobRing: 'dots', jack: 'black' },
  signalNames: {
    osc1: 'OSC 1', osc2: 'OSC 2', env1: 'the VCA envelope', env2: 'the control envelope', lfo: 'the control oscillator',
    sh: 'the control oscillator’s RND shape', noise: 'the noise generator', out: 'the WASP’s output',
  },
  destNames: { extIn: 'the mixer’s EXT channel' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
