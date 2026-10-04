// Behringer CAT — SynthDef. Positions are pixels on the 2000×801 product image (ref/behringer-cat.jpeg), used directly as
// view units; the faceplate ends at y 700, below it is the photo's reflection. The data model is
// ref/behringer-cat.synth.json (Quick Start Guide, 59 numbered controls, with figures from the Octave CAT SRM manual), which
// follows the Octave CAT SRM II: a duophonic synth whose two VCOs each run several waveforms at once on their own level
// sliders, one 24 dB low-pass filter, an ADSR and an AR envelope, a delayed LFO, sample and hold, and switch-selected
// modulation (a source switch and a depth knob, two per VCO and two for the filter).
//
// Duophonic playing uses the engine's `duo` keyboard with `note2Osc: 0`: VCO 1 (osc 0) takes the highest key held, VCO 2
// the lowest. Sub-octave squares are `mix.sub`, SYNC MODE A is `syncGate` and the S&H is clocked from the LFO (`sh.clock`).
import { annotate, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/cat.js';
import unusual from '@/synths/unusual/cat.js';
import moreSounds from '@/synths/sounds/cat.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The data model's figures come from the Octave CAT SRM manual; the slider laws between the end points are not documented.
const lfoHz = (v) => expMap(v / 10, 0.03, 30); // 0.03 Hz to 30 Hz, as printed
const cutHz = (v) => expMap(v / 10, 16, 20000); // the SRM gives about 5 Hz to 27 kHz; this app's filter stops at 20 kHz
const adsrA = (v) => expMap(v / 10, 0.003, 6);
const adsrDR = (v) => expMap(v / 10, 0.005, 7);
const arA = (v) => expMap(v / 10, 0.003, 7);
const arR = (v) => expMap(v / 10, 0.005, 7);
const glideTime = (v) => (v <= 0 ? 0 : 0.02 * Math.pow(75, v / 10)); // up to about 1.5 s
/** VCO 1 COARSE with the keyboard on: unison with VCO 2 at the centre, about six octaves either way. */
const coarseSemi = (v) => (v - 5) * 14.4;
/** VCO 1 COARSE with KEYBOARD CONTROL off: a free-running frequency, 0.2 Hz to 2 kHz as printed. */
const coarseHz = (v) => expMap(v / 10, 0.2, 2000);
const hzToNote = (hz) => 69 + 12 * Math.log2(hz / 440);
const vco1Fine = (v) => v * 0.2; // about a semitone either way
const vco2Semi = (v) => v * 3; // FINE TUNE: about 2.5 octaves in all
const wave = (v) => (v > 0 ? Math.pow(v / 10, 1.5) * 0.5 : 0);
const fmtOct = (st) => fmtSemi(st);

const controls = [];
const decor = [];
const jacks = [];
const INK = '#f1f0ea';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x, y, t, size = 15, rest = {}) => decor.push({ t: 'text', x, y: y + size * 0.35, text: t, size, anchor: 'middle', weight: 700, ...rest });
const lines = (x, y, t, size = 15, gap = 17, rest = {}) => t.split('\n').forEach((s, i) => text(x, y + i * gap, s, size, rest));
const line = (x1, y1, x2, y2, w = 1.8) => decor.push({ t: 'line', x1, y1, x2, y2, w });
const glyph = (x, y, shape, size = 12) => decor.push({ t: 'wave', x, y, size, shape });
const frame = (x0, y0, x1, y1) => decor.push({ t: 'frame', x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: 5, labelAt: 'none' });
/** A heading printed with a short rule either side, as the panel does for MODULATION DEPTH and AUDIO LEVEL. */
const ruled = (x, y, t, x0, x1) => { text(x, y, t, 16); line(x0, y, x0 + 18, y); line(x1 - 18, y, x1, y); };
const arrowDown = (x, y0, y1) => { line(x, y0, x, y1 - 4, 1.4); decor.push({ t: 'arrow', x, y: y1 - 2, dir: 'down', size: 4 }); };

const knob = (id, x, y, rest) => controls.push({
  id, type: 'knob', x, y, r: 38, style: 'cat', kind: 'cont', min: 0, max: 10, def: 0, labelPos: 'none',
  scale: { ticks: 11, tickR: 1.3 }, ...rest,
});
const fader = (id, x, y, cap, rest) => controls.push({
  id, type: 'fader', x, y, len: 108, orient: 'v', cap, pad: 12, ticks: 7, kind: 'cont', min: 0, max: 10, def: 0, labelPos: 'none', ...rest,
});
const slide = (id, x, y, options, def, rest) => controls.push({
  id, type: 'slide', x, y, w: 20, h: options.length === 3 ? 56 : 42, orient: 'v', kind: 'enum', options, def, labelPos: 'none', ...rest,
});
/** The two source switches of a modulation group, with their printed glyphs and the arrow down to the depth knob. */
const MOD1 = [{ v: 'sine', label: 'LFO sine' }, { v: 'square', label: 'LFO square' }, { v: 'sh', label: 'S+H' }];
const mod2Opts = (other) => [{ v: 'adsr', label: 'ADSR' }, { v: 'ar', label: 'AR' }, { v: other, label: other === 'vco1' ? 'VCO 1' : 'VCO 2' }];
const src1Glyphs = (x, y) => { glyph(x + 34, y - 27, 'sine', 11); glyph(x + 34, y - 1, 'sq', 11); text(x + 33, y + 26, 'S+H', 12); arrowDown(x, y + 34, y + 60); };
const src2Glyphs = (x, y, other) => { glyph(x + 34, y - 27, 'adsr', 12); glyph(x + 34, y - 1, 'ar', 12); text(x + 36, y + 26, other, 12); arrowDown(x, y + 34, y + 60); };

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[[88, 20], [740, 20], [1392, 20], [1910, 20], [88, 684], [740, 684], [1392, 684], [1910, 684]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 10 }));
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
decor.push({ t: 'logo', x: 245, y: 300, size: 22, text: 'behringer', style: 'behringer' });
text(300, 372, 'CAT', 86, { weight: 800, spacing: -2 });
text(247, 426, 'electronic music synthesizer', 17);

// ── Pitch, glide and LFO rate (bottom left) ───────────────────────────────
fader('pitch.bend', 100, 546, 'red', {
  min: -1, max: 1, def: 0, ticks: 0, name: 'Pitch bend', module: 'glide', fmt: (v) => fmtOct(v * 12),
  help: 'Bends the pitch of both VCOs up or down by as much as an octave. It has a click stop at the centre, which is in tune.',
});
text(125, 497, '+1', 13); text(140, 551, '0', 13); line(122, 551, 132, 551, 1.6); line(148, 551, 158, 551, 1.6); text(125, 604, '−1', 13);
lines(100, 638, 'PITCH\nBEND', 17);
slide('pitch.octave', 182, 551, [{ v: 2, label: '+2' }, { v: 0, label: '0' }, { v: -2, label: '−2' }], 0, {
  name: 'Octave shift', module: 'glide',
  help: 'Moves everything the keys play up or down two octaves. VCO 1 follows it only while KEYBOARD CONTROL is on POLY or MONO.',
});
text(183, 506, '+2', 13); text(183, 596, '−2', 13);
lines(182, 638, 'OCTAVE\nSHIFT', 17);
fader('pitch.glide', 264, 546, 'red', {
  name: 'Glide', module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each new note slides from the last one instead of jumping. Higher is a slower slide.',
});
text(233, 498, 'MAX', 13); text(236, 604, 'MIN', 13);
text(264, 638, 'GLIDE', 17);
fader('lfo.rate', 345, 546, 'red', {
  def: 5, name: 'LFO frequency', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every half minute to 30 Hz. The same fader clocks the sample and hold and the ADSR repeat. The red lamp beside it flashes at this rate.',
});
text(378, 498, '30Hz', 13); text(390, 604, '0.03Hz', 13);
lines(345, 638, 'LFO\nFREQ', 17);
decor.push({ t: 'led', x: 413, y: 551, r: 7, color: 'red', litWhen: 'lfo' });

// ── VCO 1 ─────────────────────────────────────────────────────────────────
text(583, 63, 'FREQUENCY', 17);
knob('vco1.fine', 522, 128, {
  min: -5, max: 5, def: 0, name: 'VCO 1 fine', module: 'osc', fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(vco1Fine(v) * 100)} cents`,
  help: 'Fine tuning of VCO 1, about a semitone either way. A small offset against VCO 2 makes the two beat slowly, which thickens the sound.',
});
text(484, 183, '−', 15); text(560, 183, '+', 15); text(525, 193, 'FINE', 13);
knob('vco1.coarse', 640, 128, {
  def: 5, name: 'VCO 1 coarse', module: 'osc',
  fmt: (v) => fmtSemi(coarseSemi(v)),
  help: 'Tunes VCO 1 over many octaves. At the centre it is in unison with VCO 2; each step of the knob is a little over an octave. With KEYBOARD CONTROL on OFF it sets VCO 1’s frequency on its own, from 0.2 Hz (a slow modulator) to 2 kHz.',
});
text(597, 183, '0.2Hz', 13); text(645, 193, 'COARSE', 13); text(695, 183, '2KHz', 13);
lines(768, 63, 'KEYBOARD\nCONTROL', 16);
slide('pitch.kbdCtrl', 767, 132, [{ v: 'poly', label: 'POLY' }, { v: 'off', label: 'OFF' }, { v: 'mono', label: 'MONO' }], 'poly', {
  name: 'VCO 1 keyboard control', module: 'osc',
  help: 'Which key VCO 1 follows. POLY: hold two keys and VCO 1 plays the higher while VCO 2 plays the lower. MONO: both play the lowest key. OFF: VCO 1 ignores the keys and stays where COARSE puts it.',
});
text(786, 106, 'POLY', 13, { anchor: 'start' }); text(786, 132, 'OFF', 13, { anchor: 'start' }); text(786, 158, 'MONO', 13, { anchor: 'start' });

slide('vco1.mod1Src', 522, 258, MOD1, 'sine', {
  name: 'VCO 1 mod source (LFO)', module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to VCO 1’s pitch: the LFO sine (vibrato, faded in by LFO DELAY), the LFO square (a trill between two notes) or the sample and hold (random steps).',
});
src1Glyphs(522, 258);
slide('vco1.mod2Src', 645, 258, mod2Opts('vco2'), 'adsr', {
  name: 'VCO 1 mod source (envelope)', module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to VCO 1’s pitch: the ADSR or the AR envelope (a pitch sweep on each note), or VCO 2 itself for audio-rate frequency modulation, which gives metallic and bell-like tones.',
});
src2Glyphs(645, 258, 'VCO 2');
slide('vco1.pwmSrc', 767, 258, [{ v: 'sine', label: 'LFO sine' }, { v: 'adsr', label: 'ADSR' }, { v: 'dc', label: 'DC' }], 'dc', {
  name: 'Pulse width source', module: 'mod',
  help: 'What moves VCO 1’s pulse width. DC: nothing, and PULSE WIDTH sets a fixed width. LFO sine: the width sweeps back and forth, a chorus-like shimmer. ADSR: the width follows the envelope on each note.',
});
glyph(801, 231, 'sine', 11); glyph(801, 257, 'adsr', 12); text(800, 285, 'DC', 12);
knob('vco1.mod1Depth', 522, 380, {
  name: 'VCO 1 mod depth (LFO)', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO-group source moves VCO 1’s pitch. Small amounts give vibrato; turned right, sirens and wide trills.',
});
knob('vco1.mod2Depth', 645, 380, {
  name: 'VCO 1 mod depth (envelope)', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the envelope-group source moves VCO 1’s pitch: an upward sweep on each note from ADSR or AR, or the depth of frequency modulation from VCO 2.',
});
text(768, 315, 'PULSE WIDTH', 16);
knob('vco1.pw', 767, 378, {
  name: 'Pulse width', module: 'osc', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'With the switch above on DC, sets VCO 1’s pulse from a square (fully left, hollow) to a thin pulse (fully right, nasal). With LFO or ADSR selected it sets how far they move the width instead. Only heard through the PULSE slider.',
});
glyph(724, 437, 'sq', 11); glyph(810, 437, 'npulse', 11);
arrowDown(767, 426, 470);
ruled(585, 444, 'MODULATION DEPTH', 482, 688);
ruled(645, 464, 'AUDIO LEVEL', 532, 758);
fader('vco1.sub', 522, 546, 'white', {
  name: 'VCO 1 sub octave', module: 'osc',
  help: 'A square wave an octave below VCO 1, added to its mix. It adds weight and body without changing the note.',
});
fader('vco1.saw', 605, 546, 'white', {
  def: 7, name: 'VCO 1 sawtooth', module: 'osc',
  help: 'Level of VCO 1’s sawtooth: the brightest, buzziest of its waves, full of harmonics for the filter to work on.',
});
fader('vco1.tri', 686, 546, 'white', {
  name: 'VCO 1 triangle', module: 'osc',
  help: 'Level of VCO 1’s triangle: a soft, flute-like wave with few harmonics.',
});
fader('vco1.pulse', 768, 546, 'white', {
  name: 'VCO 1 pulse', module: 'osc',
  help: 'Level of VCO 1’s pulse wave, whose width is set by PULSE WIDTH. All four waves play at once, so the sliders are a mixer: blend them to build a tone.',
});
lines(522, 638, 'SUB\nOCTAVE', 17);
glyph(604, 637, 'saw', 12); glyph(686, 637, 'tri', 12); glyph(768, 637, 'pulse', 12);
text(647, 677, 'VCO 1', 19);

// ── VCO 2 ─────────────────────────────────────────────────────────────────
knob('vco2.fine', 938, 128, {
  min: -5, max: 5, def: 0, name: 'VCO 2 fine tune', module: 'osc', fmt: (v) => fmtSemi(vco2Semi(v)),
  help: 'Tunes VCO 2, about an octave and a quarter either way; in unison with VCO 1 at the centre. VCO 2 always plays the lowest key held.',
});
text(900, 183, '−', 15); text(976, 183, '+', 15); text(938, 193, 'FINE TUNE', 13);
text(1060, 80, 'SYNC', 17);
slide('vco1.sync', 1060, 132, [{ v: 'mode_a', label: 'MODE A' }, { v: 'off', label: 'OFF' }, { v: 'mode_b', label: 'MODE B' }], 'off', {
  name: 'Sync', module: 'osc',
  help: 'Locks VCO 1 to VCO 2: VCO 1 restarts every VCO 2 cycle, so VCO 1’s tuning changes its tone rather than its note. MODE B is plain hard sync. MODE A also silences VCO 1 for half of every VCO 2 cycle, which is rougher. Tune VCO 1 above VCO 2 or it goes quiet.',
});
text(1079, 106, 'MODE A', 13, { anchor: 'start' }); text(1079, 132, 'OFF', 13, { anchor: 'start' }); text(1079, 158, 'MODE B', 13, { anchor: 'start' });
slide('vco2.mod1Src', 938, 258, MOD1, 'sine', {
  name: 'VCO 2 mod source (LFO)', module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to VCO 2’s pitch: the delayed LFO sine, the LFO square or the sample and hold.',
});
src1Glyphs(938, 258);
slide('vco2.mod2Src', 1060, 258, mod2Opts('vco1'), 'adsr', {
  name: 'VCO 2 mod source (envelope)', module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to VCO 2’s pitch: the ADSR, the AR, or VCO 1 for audio-rate frequency modulation.',
});
src2Glyphs(1060, 258, 'VCO 1');
knob('vco2.mod1Depth', 938, 380, {
  name: 'VCO 2 mod depth (LFO)', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO-group source moves VCO 2’s pitch.',
});
knob('vco2.mod2Depth', 1055, 380, {
  name: 'VCO 2 mod depth (envelope)', module: 'mod', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the envelope-group source moves VCO 2’s pitch, or how deep VCO 1 frequency-modulates it.',
});
ruled(1000, 444, 'MODULATION DEPTH', 893, 1106);
ruled(1000, 464, 'AUDIO LEVEL', 920, 1080);
fader('vco2.sub', 918, 546, 'white', {
  name: 'VCO 2 sub octave', module: 'osc',
  help: 'A square an octave below VCO 2. With VCO 2 on the lowest key, this is the deepest sound the CAT makes.',
});
fader('vco2.square', 1000, 546, 'white', {
  name: 'VCO 2 square', module: 'osc',
  help: 'Level of VCO 2’s square wave: hollow and woody. Its width is fixed.',
});
fader('vco2.saw', 1080, 546, 'white', {
  name: 'VCO 2 sawtooth', module: 'osc',
  help: 'Level of VCO 2’s sawtooth: bright and buzzy. Like VCO 1, all its waves play at once and these sliders mix them.',
});
lines(918, 638, 'SUB\nOCTAVE', 17);
glyph(1000, 637, 'sq', 12); glyph(1080, 637, 'saw', 12);
text(1000, 677, 'VCO 2', 19);

// ── VCF ───────────────────────────────────────────────────────────────────
lines(1232, 63, 'VCO 1\nAUDIO', 16);
controls.push({
  id: 'vcf.vco1Audio', type: 'slide', x: 1232, y: 132, w: 20, h: 42, orient: 'v', kind: 'bool', def: true, labelPos: 'none',
  name: 'VCO 1 audio', module: 'mixer',
  help: 'ON: VCO 1’s mix goes into the filter. OFF: VCO 1 keeps running but is not heard, so it can modulate VCO 2 or the filter on its own.',
});
text(1258, 106, 'ON', 13, { anchor: 'start' }); text(1258, 158, 'OFF', 13, { anchor: 'start' });
lines(1354, 46, 'KEYBOARD\nCONTROL', 16);
knob('vcf.kbd', 1352, 128, {
  def: 5, name: 'Filter keyboard control', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the cutoff follows the keys. At MAX it follows them exactly, so every note is equally bright and a whistling filter plays in tune; at OFF high notes sound duller.',
});
text(1310, 183, 'OFF', 13); text(1400, 183, 'MAX', 13);
slide('vcf.mod1Src', 1232, 258, MOD1, 'sine', {
  name: 'Filter mod source (LFO)', module: 'mod',
  help: 'What the left MODULATION DEPTH knob sends to the cutoff: the delayed LFO sine (a wah), the LFO square (jumping between two brightnesses) or the sample and hold (random steps).',
});
src1Glyphs(1232, 258);
slide('vcf.mod2Src', 1355, 258, mod2Opts('vco1'), 'adsr', {
  name: 'Filter mod source (envelope)', module: 'mod',
  help: 'What the right MODULATION DEPTH knob sends to the cutoff: the ADSR or AR envelope, which opens the filter on each note, or VCO 1 at audio rate for a rough, growling edge.',
});
src2Glyphs(1355, 258, 'VCO 1');
knob('vcf.mod1Depth', 1225, 380, {
  name: 'Filter mod depth (LFO)', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO-group source moves the cutoff.',
});
knob('vcf.mod2Depth', 1350, 380, {
  def: 3, name: 'Filter mod depth (envelope)', module: 'filter', fmt: (v) => `+${(v * 0.6).toFixed(1)} oct`,
  help: 'How far the envelope opens the filter on each note: the usual filter envelope amount. With VCO 1 selected, how deep VCO 1 shakes the cutoff.',
});
ruled(1292, 444, 'MODULATION DEPTH', 1182, 1403);
fader('vcf.fc', 1250, 546, 'red', {
  def: 6, name: 'Cutoff (Fc)', module: 'filter', fmt: (v) => fmtHz(cutHz(v)),
  help: 'Cutoff of the 24 dB low-pass filter. Down, the sound gets darker until only a dull thud is left; fully up, everything passes.',
});
fader('vcf.q', 1332, 546, 'red', {
  name: 'Resonance (Q)', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near the top the filter whistles on its own and drowns out the oscillators.',
});
text(1250, 640, 'Fc', 18); text(1332, 640, 'Q', 18);
text(1292, 677, 'VCF', 19);

// ── Transient generators: ADSR, AR, repeat, sample and hold, LFO delay ────
const ADSR_X = { attack: 1504, decay: 1585, sustain: 1667, release: 1748 };
fader('adsr.attack', ADSR_X.attack, 304, 'grey', {
  name: 'ADSR attack', module: 'env', fmt: (v) => fmtTime(adsrA(v)),
  help: 'How long the ADSR takes to rise when a note starts. Short for plucks and basses, long for swells.',
});
fader('adsr.decay', ADSR_X.decay, 304, 'grey', {
  def: 5, name: 'ADSR decay', module: 'env', fmt: (v) => fmtTime(adsrDR(v)),
  help: 'How long the ADSR takes to fall from its peak to the sustain level.',
});
fader('adsr.sustain', ADSR_X.sustain, 304, 'grey', {
  def: 8, name: 'ADSR sustain', module: 'env', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level the ADSR holds at while a key is held. With the VCA on ADSR, this is how loud a held note stays.',
});
fader('adsr.release', ADSR_X.release, 304, 'grey', {
  def: 3, name: 'ADSR release', module: 'env', fmt: (v) => fmtTime(adsrDR(v)),
  help: 'How long the ADSR takes to die away after the key is let go.',
});
Object.entries(ADSR_X).forEach(([k, x]) => { text(x, 217, k[0].toUpperCase(), 17); glyph(x, 392, 'adsr', 13); });
fader('ar.attack', 1504, 546, 'grey', {
  name: 'AR attack', module: 'env', fmt: (v) => fmtTime(arA(v)),
  help: 'How long the AR envelope takes to rise when a note starts. It then stays at full level until the key is let go.',
});
fader('ar.release', 1585, 546, 'grey', {
  def: 3, name: 'AR release', module: 'env', fmt: (v) => fmtTime(arR(v)),
  help: 'How long the AR envelope takes to die away after the key is let go.',
});
glyph(1504, 465, 'ar', 13); glyph(1585, 465, 'ar', 13);
text(1504, 640, 'A', 17); text(1585, 640, 'R', 17);
slide('trig.repeat', 1667, 458, [{ v: 'gated', label: 'GATED' }, { v: 'off', label: 'OFF' }, { v: 'auto', label: 'AUTO' }], 'off', {
  name: 'ADSR repeat', module: 'mod',
  help: 'Retriggers both envelopes at the LFO rate. GATED: only while a key is held, so a held note pulses. AUTO: all the time, so the CAT plays by itself. OFF: one envelope per note.',
});
text(1686, 433, 'GATED', 13, { anchor: 'start' }); text(1686, 459, 'OFF', 13, { anchor: 'start' }); text(1686, 485, 'AUTO', 13, { anchor: 'start' });
lines(1667, 504, 'ADSR\nREPEAT', 16);
slide('sh.src', 1667, 583, [{ v: 'vco1', label: 'VCO 1' }, { v: 'noise', label: 'NOISE' }], 'noise', {
  name: 'Sample and hold source', module: 'mod',
  help: 'What the sample and hold measures on each LFO cycle. NOISE gives random steps. VCO 1 samples VCO 1’s mix of waves: with VCO 1 slow, the steps repeat in a pattern, a short sequence.',
});
text(1686, 558, 'VCO 1', 13, { anchor: 'start' }); text(1686, 611, 'NOISE', 13, { anchor: 'start' });
lines(1667, 630, 'SAMPLE\n+\nHOLD', 15, 14);
fader('lfo.delay', 1748, 546, 'grey', {
  name: 'LFO delay', module: 'lfo', fmt: (v) => (v <= 0 ? 'off' : fmtTime(v / 2)),
  help: 'After each new note the LFO sine is silent and fades in over this time, up to 5 seconds: the delayed vibrato of a singer or violinist. It affects only the sine positions of the modulation switches.',
});
text(1783, 498, '5 SEC.', 13); text(1770, 604, '0', 13);
lines(1748, 640, 'LFO\nDELAY', 17);
text(1627, 677, 'TRANSIENT GENERATORS', 19);

// ── VCA and noise ─────────────────────────────────────────────────────────
slide('vca.mode', 1885, 262, [{ v: 'adsr', label: 'ADSR' }, { v: 'ar', label: 'AR' }, { v: 'bypass', label: 'BYPASS' }], 'adsr', {
  name: 'VCA source', module: 'amp',
  help: 'What shapes the loudness of each note: the ADSR, the AR envelope, or BYPASS, which holds the VCA open so the CAT sounds all the time.',
});
glyph(1918, 237, 'adsr', 12); glyph(1918, 262, 'ar', 12); text(1923, 288, 'BYPASS', 12);
text(1885, 315, 'VOLUME', 17);
knob('out.volume', 1885, 380, {
  def: 7, name: 'Volume', module: 'out', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Overall output level, to MAIN OUT and the headphones.',
});
text(1885, 437, 'VCA', 19);
fader('noise.level', 1885, 546, 'white', {
  name: 'Noise level', module: 'mixer',
  help: 'White noise into the filter, alongside the two VCOs: hiss for breath, wind, snares and surf.',
});
lines(1885, 638, 'NOISE\nLEVEL', 17);

// ── Jacks ─────────────────────────────────────────────────────────────────
const jack = (id, x, y, label, dir, rest) => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir, ...rest });
  text(x, y - 30, label, 12);
};
text(1502, 32, 'INPUT', 16);
text(1716, 32, 'OUTPUT', 16);
jack('j.vco1Cv', 1466, 87, 'VCO1 CV', 'in', { dest: 'pitchAll', amt: 12, add: true, help: 'Pitch control voltage, added to the notes played: a full-scale voltage moves both VCOs an octave. In this app it reaches the VCOs that follow the keys, so VCO 1 ignores it while KEYBOARD CONTROL is OFF.' });
jack('j.gateIn', 1537, 87, 'GATE', 'in', { name: 'GATE in', dest: 'gateIn', amt: 1, help: 'An outside gate for both envelopes, in place of the notes played, for example from a sequencer.' });
jack('j.kbCv', 1608, 87, 'KB CV', 'out', { signal: 'kbd', help: 'The keyboard’s pitch as a control voltage: the lowest key held, the one VCO 2 plays.' });
jack('j.gateOut', 1680, 87, 'GATE', 'out', { name: 'GATE out', signal: 'gate', help: 'High while a key is held.' });
jack('j.adsrOut', 1752, 87, 'ADSR', 'out', { name: 'ADSR out', signal: 'env1', help: 'The ADSR envelope as a voltage.' });
glyph(1778, 57, 'adsr', 9);
jack('j.arOut', 1823, 87, 'AR', 'out', { name: 'AR out', signal: 'env2', help: 'The AR envelope as a voltage.' });
glyph(1843, 57, 'ar', 9);
decor.push({ t: 'led', x: 1895, y: 87, r: 7, color: 'amber', litWhen: 'power' });
text(1895, 57, 'POWER', 12);
jack('j.vco2Cv', 1466, 160, 'VCO2 CV', 'in', { dest: 'pitch2', amt: 12, add: true, help: 'Pitch control voltage for VCO 2 alone, added to its note: a full-scale voltage moves it an octave.' });
jack('j.vcfFc', 1537, 160, 'VCF Fc', 'in', { dest: 'cutoff', amt: 5, add: true, help: 'Voltage control of the filter cutoff, added to the Fc slider and the modulation.' });
jack('j.vcfQ', 1608, 160, 'VCF Q', 'in', { dest: 'res', amt: 1, add: true, help: 'Voltage control of resonance, added to the Q slider.' });
jack('j.extAudio', 1680, 160, 'EXT AUDIO', 'in', { dest: 'extIn', amt: 1, add: true, help: 'Outside audio into the filter, mixed with the VCOs and noise.' });
jack('j.vcaCv', 1752, 160, 'VCA CV', 'in', {
  dest: 'amp', amt: 1, add: true,
  check: (v) => (v['vca.mode'] === 'bypass' ? 'The VCA is on BYPASS, so it is already fully open and a voltage here makes little difference. Set the VCA switch to ADSR or AR.' : null),
  help: 'Voltage control of the VCA, added to the envelope chosen by the VCA switch.',
});
jack('j.phones', 1823, 160, 'PHONES', 'out', { signal: 'out', help: 'Headphone output.' });
jack('j.mainOut', 1895, 160, 'MAIN OUT', 'out', { signal: 'out', help: 'The main audio output.' });

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const areas = [
  { id: 'midi', label: 'MIDI and USB', module: 'util', keywords: 'midi usb thru poly chain',
    rects: [R(40, 0, 445, 455)],
    help: 'The CAT has no keyboard: it is played over MIDI IN or USB, here from the on-screen keyboard. MIDI THRU passes the notes on, which is how several CATs are chained for more voices.' },
  { id: 'pitch', label: 'Pitch bend, octave and glide', module: 'glide', keywords: 'bend octave transpose portamento glide',
    rects: [R(40, 455, 305, 705)],
    help: 'PITCH BEND bends both VCOs up to an octave either way from a centre click. OCTAVE SHIFT moves the keys two octaves up or down, and GLIDE makes each note slide into the next.' },
  { id: 'lfo', label: 'LFO', module: 'lfo', keywords: 'vibrato wobble trill rate delay delayed vibrato',
    rects: [R(305, 455, 445, 705), R(1712, 410, 1820, 705)],
    help: 'One LFO with a sine and a square, from 0.03 to 30 Hz. There are no LFO depth knobs here: each VCO and the filter picks the sine or square with its own switch and sets the depth with its own knob. LFO DELAY fades the sine in after each note.' },
  { id: 'vco1', label: 'VCO 1', module: 'osc', keywords: 'oscillator pitch coarse fine sub octave sawtooth triangle pulse pwm pulse width duophonic keyboard control',
    rects: [R(445, 0, 846, 705)],
    help: 'The first oscillator, with four waves that all play at once: sub octave, sawtooth, triangle and pulse, each on its own slider. COARSE and FINE tune it, KEYBOARD CONTROL decides which key it plays, and the switches and knobs below pick and set its pitch modulation and pulse-width modulation.' },
  { id: 'vco2', label: 'VCO 2 and sync', module: 'osc', keywords: 'oscillator fine tune sub octave square sawtooth sync hard sync',
    rects: [R(846, 0, 1152, 705)],
    help: 'The second oscillator, always on the lowest key held, with a sub octave, a square and a sawtooth on sliders. FINE TUNE sets its pitch against VCO 1. SYNC locks VCO 1 to VCO 2 for tearing, vocal tones.' },
  { id: 'vcf', label: 'VCF (filter)', module: 'filter', keywords: 'cutoff resonance brightness low-pass tracking envelope amount self-oscillation wah',
    rects: [R(1152, 0, 1432, 705)],
    help: 'A 24 dB low-pass filter shared by both VCOs and the noise. Fc sets the cutoff and Q the resonance, up to self-oscillation. KEYBOARD CONTROL sets how far the cutoff follows the keys. The two switch-and-knob pairs are its modulation: LFO or sample and hold on the left, an envelope or VCO 1 on the right. VCO 1 AUDIO takes VCO 1 out of the filter.' },
  { id: 'inputs', label: 'Patch inputs', module: 'util', keywords: 'cv gate input external audio patch',
    rects: [R(1432, 0, 1575, 120), R(1432, 120, 1788, 200)],
    help: 'Control voltage inputs for the pitch of each VCO, the cutoff, the resonance and the VCA, a gate input for the envelopes, and EXT AUDIO to put another sound through the filter.' },
  { id: 'outputs', label: 'Patch outputs and audio out', module: 'out', keywords: 'cv gate output envelope out headphones main out',
    rects: [R(1575, 0, 1950, 120), R(1788, 120, 1950, 200)],
    help: 'KB CV and GATE send the notes on to other gear; ADSR and AR send the envelopes. PHONES and MAIN OUT are the audio outputs.' },
  { id: 'adsr', label: 'ADSR envelope', module: 'env', keywords: 'envelope attack decay sustain release contour loudness',
    rects: [R(1432, 200, 1820, 410)],
    help: 'The four-stage envelope. It is not wired to anything by itself: pick it on the VCA switch for loudness, and on a modulation switch to sweep a VCO or the filter.' },
  { id: 'ar', label: 'AR envelope', module: 'env', keywords: 'envelope attack release organ',
    rects: [R(1432, 410, 1625, 705)],
    help: 'A second, simpler envelope: it rises over A, stays at full level while the key is held and falls over R. Like the ADSR, it can shape the loudness or any of the modulation switches.' },
  { id: 'repeat', label: 'ADSR repeat and sample and hold', module: 'mod', keywords: 'repeat retrigger clock sample hold random steps sequence',
    rects: [R(1625, 410, 1712, 705)],
    help: 'ADSR REPEAT uses the LFO as a clock to fire both envelopes again and again, while a key is held or all the time. The sample and hold measures noise or VCO 1 once per LFO cycle and holds it, making the stepped S+H source for the modulation switches.' },
  { id: 'vca', label: 'VCA and volume', module: 'amp', keywords: 'loudness amplifier volume bypass drone',
    rects: [R(1820, 200, 1950, 455)],
    help: 'The switch picks what shapes each note’s loudness: the ADSR, the AR, or BYPASS for a sound that never stops. VOLUME sets the output level.' },
  { id: 'noise', label: 'Noise', module: 'mixer', keywords: 'white noise hiss breath wind',
    rects: [R(1820, 455, 1950, 705)],
    help: 'White noise, mixed into the filter by NOISE LEVEL. The sample and hold can also use it for random steps.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const MOD1_SIG = { sine: 'vib', square: 'lfoSq', sh: 'sh' };
const MOD2_SIG = { adsr: 'env1', ar: 'env2', vco1: 'osc1', vco2: 'osc2' };
const semiDepth = (d, max) => (d > 0 ? Math.pow(d / 10, 2) * max : 0);

function toEngine(v) {
  const kc = v['pitch.kbdCtrl'];
  const sync = v['vco1.sync'];
  const pwSrc = v['vco1.pwmSrc'];
  const routes = [];
  const add = (src, dst, amt) => { if (amt) routes.push({ src, dst, amt }); };
  // pitch modulation: the LFO group up to two octaves, the envelope group (or the other VCO) up to three
  add(MOD1_SIG[v['vco1.mod1Src']], 'pitch1', semiDepth(v['vco1.mod1Depth'], 24));
  add(MOD2_SIG[v['vco1.mod2Src']], 'pitch1', semiDepth(v['vco1.mod2Depth'], 36));
  add(MOD1_SIG[v['vco2.mod1Src']], 'pitch2', semiDepth(v['vco2.mod1Depth'], 24));
  add(MOD2_SIG[v['vco2.mod2Src']], 'pitch2', semiDepth(v['vco2.mod2Depth'], 36));
  // filter: the LFO group up to three octaves; an envelope through envAmt, VCO 1 as a route
  add(MOD1_SIG[v['vcf.mod1Src']], 'cutoff', (v['vcf.mod1Depth'] / 10) * 3);
  const fEnv = v['vcf.mod2Src'] !== 'vco1';
  if (!fEnv) add('osc1', 'cutoff', (v['vcf.mod2Depth'] / 10) * 3);
  // pulse width: a fixed width at DC, otherwise PULSE WIDTH is the depth of the sine or the ADSR
  const pwK = v['vco1.pw'] / 10;
  if (pwSrc === 'sine') add('vib', 'pw1', pwK * 0.42);
  if (pwSrc === 'adsr') add('env1', 'pw1', -pwK * 0.45);
  const kbdOff = kc === 'off';
  const osc = [
    {
      level: v['vcf.vco1Audio'] ? 1 : 0,
      mix: { sub: wave(v['vco1.sub']), saw: wave(v['vco1.saw']), tri: wave(v['vco1.tri']), pulse: wave(v['vco1.pulse']) },
      pw: pwSrc === 'dc' ? 0.5 - pwK * 0.45 : 0.5,
      semi: (kbdOff ? 0 : coarseSemi(v['vco1.coarse'])) + vco1Fine(v['vco1.fine']),
      kbd: !kbdOff, fixedNote: hzToNote(coarseHz(v['vco1.coarse'])),
      syncTo: sync === 'off' ? -1 : 1, syncGate: sync === 'mode_a',
    },
    {
      level: 1,
      mix: { sub: wave(v['vco2.sub']), pulse: wave(v['vco2.square']), saw: wave(v['vco2.saw']) },
      pw: 0.5, semi: vco2Semi(v['vco2.fine']), kbd: true, fixedNote: 60, syncTo: -1,
    },
  ];
  const vm = v['vca.mode'];
  const rep = v['trig.repeat'];
  const rate = lfoHz(v['lfo.rate']);
  return {
    osc,
    duo: true, paraphonic: kc === 'poly', note2Osc: 0,
    noise: { level: level10(v['noise.level'], 0.6), color: 'white' },
    ext: { level: 1 },
    filter: {
      type: 'ladder', mode: 'lp', cutoff: cutHz(v['vcf.fc']), res: (v['vcf.q'] / 10) * 1.1,
      envAmt: fEnv ? v['vcf.mod2Depth'] * 0.6 : 0, envSrc: v['vcf.mod2Src'] === 'ar' ? 'env2' : 'env1', kbd: v['vcf.kbd'] / 10,
    },
    env1: { a: adsrA(v['adsr.attack']), d: adsrDR(v['adsr.decay']), s: v['adsr.sustain'] / 10, r: adsrDR(v['adsr.release']) },
    env2: { a: arA(v['ar.attack']), d: 0.01, s: 1, r: arR(v['ar.release']) },
    vca: vm === 'bypass' ? { envSrc: 'none', bias: 1 } : { envSrc: vm === 'ar' ? 'env2' : 'env1', bias: 0 },
    lfo: { rate, mix: { sq: 1 }, keySync: false, vibDelay: v['lfo.delay'] / 2, vibDepth: 1 },
    glide: { time: glideTime(v['pitch.glide']), legato: false },
    trig: { retrig: false, drone: false, repeat: rep === 'gated', auto: rep === 'auto', src: ['gate', 'gate'] },
    routes,
    normals: { gateIn: 'gate', shIn: v['sh.src'] === 'vco1' ? 'osc1' : 'noise' },
    od: { on: false }, delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' }, slew: { time: 0.1 }, att: [1, 1],
    tune: v['pitch.octave'] * 12 + v['pitch.bend'] * 12,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'cat-duo-lead', name: 'Duophonic Lead', ref: 'The CAT’s own trick: two notes at once through one filter', artist: 'Classic technique',
    tags: ['lead', 'duophonic', '70s'], level: 1,
    blurb: 'A bright sawtooth lead that splits into two voices when you hold two keys.',
    how: 'KEYBOARD CONTROL on POLY sends the higher key to VCO 1 and the lower to VCO 2, so held intervals play as two lines. Both are sawtooths through the same filter and VCA, so they share one envelope: the second note joins the first rather than starting its own. The riff holds a note and plays a moving line above it.',
    phrase: { bpm: 96, loop: true, steps: [[0, 60, 4], [0, 67, 0.9], [1, 69, 0.9], [2, 71, 0.9], [3, 72, 0.9], [4, 58, 4], [4, 70, 1.9], [6, 67, 1.9]] },
    steps: [
      { title: 'Two sawtooths', module: 'osc', why: 'Two VCOs (voltage-controlled oscillators, the parts that make the raw tone) both on bright sawtooths. The CAT’s party trick is set here too: it can play two different notes at once, one on each VCO.\n- VCO 1 and VCO 2 SAWTOOTH 7: a saw has every harmonic, so it is the buzziest wave and gives the filter plenty to work on. On the CAT each wave has its own level slider, so the sliders are the mixer too.\n- VCO 1 FINE +0.4 (about +8 cents): VCO 1 a hair sharp of VCO 2. On a single key they beat slowly, which thickens the tone. Back to 0 and it goes flat and static.\n- KEYBOARD CONTROL POLY: hold two keys and VCO 1 plays the higher, VCO 2 the lower. On MONO both follow the lowest key and the upper line disappears.\n- Listen for: hold one key, then add a second above it. The unison buzz splits into an interval, and both notes share one filter and one envelope, so the second joins the first rather than starting its own attack.',
        set: { 'vco1.saw': 7, 'vco2.saw': 7, 'vco1.fine': 0.4, 'pitch.kbdCtrl': 'poly' } },
      { title: 'Filter with a little bite', module: 'filter', why: 'The VCF (voltage-controlled filter) is a 24 dB low-pass: it keeps the lows and cuts the highs. This step takes the edge off the saws and gives each note a small lift at the start.\n- Fc 5.2 (about 650 Hz): Fc is the cutoff frequency. Here it is part way up, so the saws keep some bite but lose their fizz. Down is darker, up is brighter.\n- Q 3 (30 %): Q is resonance, a boost right at the cutoff. A little adds a vocal edge to the tone; much more and it starts to squelch.\n- KEYBOARD CONTROL 6 (60 %): the cutoff follows the keys part way, so the upper line stays bright against the held note below.\n- Right switch ADSR, DEPTH 4 (+2.4 oct): the envelope opens the filter by up to 2.4 octaves when a note starts, then lets it settle.\n- Listen for: a slight brightening at the front of each new note. Turn DEPTH to 0 and every note starts at the same, flatter tone.',
        set: { 'vcf.fc': 5.2, 'vcf.q': 3, 'vcf.kbd': 6, 'vcf.mod2Src': 'adsr', 'vcf.mod2Depth': 4 } },
      { title: 'An organ-like envelope', module: 'env', why: 'The ADSR (attack, decay, sustain, release) is the four-stage envelope. With the VCA (voltage-controlled amplifier) switch on ADSR it shapes loudness, and here it is set like an organ so a held note never fades under the line.\n- ATTACK 0.5 (4 ms): almost instant, so each note speaks at once.\n- DECAY 5 (190 ms) to SUSTAIN 8 (80 %): a small dip after the start, then 80 % for as long as the key is down. The same shape also drives the filter lift.\n- RELEASE 4 (91 ms): a short tail, so gaps in the line stay clean.\n- VCA ADSR: the ADSR shapes loudness. On AR the level would hold flat while the ADSR only moved the filter.\n- Listen for: the held lower note staying loud while the top line moves. Drop SUSTAIN and the held note fades away under the melody.',
        set: { 'adsr.attack': 0.5, 'adsr.decay': 5, 'adsr.sustain': 8, 'adsr.release': 4, 'vca.mode': 'adsr' } },
      { title: 'Delayed vibrato', module: 'lfo', why: 'A vibrato that only arrives on long notes. The LFO (low-frequency oscillator, a slow wave used to move other things) wobbles the pitch, and LFO DELAY holds it back after each new note.\n- LFO FREQUENCY 6.4 (2.5 Hz): the speed of the wobble, a calm singer’s vibrato. Faster sounds nervous, slower seasick.\n- LFO DELAY 3 (1.5 s): after each new note the sine is silent and fades in over this time. It only affects the sine positions of the switches.\n- Both VCOs LFO SINE, DEPTH 2 (20 %): the same sine on both VCOs, so the interval wobbles together rather than going out of tune.\n- Listen for: quick notes stay straight; hold one and the vibrato creeps in over a second and a half. Set LFO DELAY to 0 and every note wobbles from the start.',
        set: { 'lfo.rate': 6.4, 'lfo.delay': 3, 'vco1.mod1Src': 'sine', 'vco1.mod1Depth': 2, 'vco2.mod1Src': 'sine', 'vco2.mod1Depth': 2 } },
    ],
    context: {
      'pitch.kbdCtrl': 'In this sound: POLY is what lets two keys play two notes. On MONO the upper line disappears.',
      'vco1.fine': 'In this sound: the slight beating between the two VCOs on single notes.',
      'lfo.delay': 'In this sound: short notes stay straight; long ones grow a vibrato.',
      'vcf.mod2Depth': 'In this sound: how much each new note brightens as the filter opens.',
    },
    tweaks: [
      { id: 'pitch.kbdCtrl', try: 'Switch to MONO', hear: 'Only the lower line plays, on both VCOs.' },
      { id: 'vco2.sub', try: 'Raise to 6', hear: 'The lower line gets an octave of weight underneath.' },
      { id: 'lfo.delay', try: 'Set to 0', hear: 'Vibrato from the start of every note.' },
    ],
  },
  {
    id: 'cat-sync-lead', name: 'Sync Sweep', ref: 'In the style of late-70s fusion synth solos', artist: 'Classic technique',
    tags: ['lead', 'sync', '70s'], level: 2,
    blurb: 'A tearing, vocal lead whose tone sweeps down on every note.',
    how: 'SYNC on MODE B locks VCO 1 to VCO 2, so VCO 1’s pitch changes its tone, not its note. The ADSR, through VCO 1’s right-hand modulation knob, pushes VCO 1 up at the start of each note and lets it fall back, which sweeps the tone.',
    phrase: { bpm: 112, loop: true, steps: [[0, 64, 0.9], [1, 67, 0.4], [1.5, 69, 0.9], [2.5, 71, 0.4], [3, 69, 0.9]] },
    steps: [
      { title: 'Sync VCO 1 to VCO 2', module: 'osc', why: 'Hard sync, the sound of many 70s fusion solos. VCO 1 (VCO is voltage-controlled oscillator, the part that makes the raw tone) is locked to VCO 2, so tuning VCO 1 changes its tone rather than its note.\n- SYNC MODE B: plain hard sync. VCO 1 restarts on every VCO 2 cycle, so it always plays VCO 2’s note. The switch sits in the VCO 2 section but acts on VCO 1.\n- VCO 1 COARSE 5.9 (+13 st): VCO 1 a little over an octave above VCO 2. The higher it goes, the thinner and more vocal the buzz. Below VCO 2 it goes quiet.\n- VCO 1 SAW 8, VCO 2 SAW and SQUARE 0: only VCO 1 is heard. VCO 2 is the sync master and does its job unheard.\n- KEYBOARD CONTROL MONO: both VCOs follow the lowest key, so the sync stays locked when notes overlap.\n- Listen for: a hard, nasal buzz at the note you play. Turn COARSE slowly and the tone tears and changes vowel while the pitch stays put.',
        set: { 'vco1.sync': 'mode_b', 'vco1.coarse': 5.9, 'vco1.saw': 8, 'vco2.saw': 0, 'vco2.square': 0, 'pitch.kbdCtrl': 'mono' } },
      { title: 'Sweep VCO 1 with the ADSR', module: 'mod', why: 'The ADSR (attack, decay, sustain, release envelope) is sent to VCO 1’s pitch. Because of the sync, that sweep is heard as a tearing change in tone on every note, not a pitch bend.\n- VCO 1 right switch ADSR, DEPTH 6 (60 %): each note starts with VCO 1 pushed about an octave further up, then falls back to where COARSE put it. More depth is a wider sweep.\n- ATTACK 0 (3 ms): the sweep starts at its highest point straight away.\n- DECAY 5.5 (270 ms): how long the sweep takes to settle. Shorter is a bark, longer a slow “yow”.\n- SUSTAIN 2 (20 %): the tone settles near the resting sync buzz while the key is held.\n- RELEASE 4 (91 ms): a short tail after you let go.\n- Listen for: a “yeow” at the start of each note that falls into the steady buzz. Sweep DECAY while playing to hear it tighten and stretch.',
        set: { 'vco1.mod2Src': 'adsr', 'vco1.mod2Depth': 6, 'adsr.attack': 0, 'adsr.decay': 5.5, 'adsr.sustain': 2, 'adsr.release': 4 } },
      { title: 'Filter open, loudness on AR', module: 'filter', why: 'The sync sweep already does the tone work, so the VCF (voltage-controlled filter) is left mostly open. The loudness moves to the AR envelope so the ADSR is free for the sweep.\n- Fc 8 (4.8 kHz): Fc is the cutoff. This high, the tearing top end passes through; lower it and the lead gets darker and loses its edge.\n- Q 1 (10 %): Q is resonance. Kept low so it does not fight the sync harmonics.\n- Filter DEPTH 0: no envelope on the filter, so each note’s colour comes from the sync only.\n- VCA AR, AR ATTACK 0.3, RELEASE 4: the VCA (voltage-controlled amplifier) follows the AR (attack, release) envelope, which holds full level while the key is down. On ADSR, notes would fade to 20 % with the sweep.\n- Listen for: held notes stay full and loud while the tone settles. Switch the VCA to ADSR and hear the notes drop away with the sweep.',
        set: { 'vcf.fc': 8, 'vcf.q': 1, 'vcf.mod2Depth': 0, 'vca.mode': 'ar', 'ar.attack': 0.3, 'ar.release': 4 } },
    ],
    context: {
      'vco1.coarse': 'In this sound: sets the resting tone of the sync. Higher gives a thinner, more vocal buzz.',
      'vco1.mod2Depth': 'In this sound: how far the tone sweeps on each note.',
      'adsr.decay': 'In this sound: how long the sweep takes to settle.',
      'vco1.sync': 'In this sound: without sync the ADSR would bend VCO 1’s pitch instead of its tone.',
    },
    tweaks: [
      { id: 'vco1.sync', try: 'Switch to MODE A', hear: 'The same sweep with a rougher, gappier edge.' },
      { id: 'vco1.coarse', try: 'Move between 5.3 and 7', hear: 'The resting tone changes from a hollow buzz to a thin whine.' },
      { id: 'vco2.sub', try: 'Raise to 5', hear: 'VCO 2’s sub octave adds a steady bass under the sweep.' },
    ],
  },
  {
    id: 'cat-bass', name: 'Sub Bass', ref: 'In the style of late-70s disco and funk bass lines', artist: 'Classic technique',
    tags: ['bass', 'funk', '70s'], level: 1,
    blurb: 'A round, punchy bass built on the two sub octaves.',
    how: 'Both VCOs play the same key, with their sub-octave squares adding weight an octave down. A low cutoff and a quick ADSR sweep give each note a short, bright snap. MONO keeps VCO 1 on the lowest key, so overlapping notes never split.',
    phrase: { bpm: 112, loop: true, steps: [[0, 36, 0.4], [0.5, 48, 0.2], [1, 36, 0.4], [1.5, 43, 0.4], [2, 46, 0.4], [2.5, 36, 0.2], [3, 41, 0.4], [3.5, 43, 0.4]] },
    steps: [
      { title: 'Saw, square and sub octaves', module: 'osc', why: 'Both VCOs (voltage-controlled oscillators, the parts that make the tone) play the same key, each with its sub octave underneath. Two subs give a disco or funk bass a solid floor.\n- KEYBOARD CONTROL MONO: both VCOs follow the lowest key, so overlapping notes never split into two.\n- VCO 1 SAWTOOTH 7 and SUB OCTAVE 6: the saw brings the bright edge, the sub is a square an octave below that adds weight.\n- VCO 2 SQUARE 5 and SUB OCTAVE 6: a hollow, woody square, and a second sub. VCO 2’s sub is the deepest sound the CAT makes.\n- VCO 2 FINE TUNE +0.1 (about +0.2 st): a tiny offset so the two VCOs beat slowly instead of sitting dead still.\n- Listen for: a thick, bright bass with real weight. Pull VCO 2 SUB OCTAVE down and the floor drops out.',
        set: { 'pitch.kbdCtrl': 'mono', 'vco1.saw': 7, 'vco1.sub': 6, 'vco2.square': 5, 'vco2.sub': 6, 'vco2.fine': 0.05 } },
      { title: 'A closed filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a 24 dB low-pass, which cuts the highs. Here it is shut right down, so between notes only a dull thump is left.\n- Fc 2.6 (about 100 Hz): Fc is the cutoff. This low takes nearly all the buzz off; raise it and the bass gets brighter and more present.\n- Q 3.5 (35 %): Q is resonance, a boost at the cutoff. A moderate amount gives the snap in the next step a little edge.\n- KEYBOARD CONTROL 5 (50 %): the cutoff follows the keys half way, so higher notes open a bit more.\n- Listen for: the tone going round and muffled. The default envelope still lifts it a little on each note until the next step reshapes it.',
        set: { 'vcf.fc': 2.6, 'vcf.q': 3.5, 'vcf.kbd': 5 } },
      { title: 'A quick sweep from the ADSR', module: 'env', why: 'The ADSR (attack, decay, sustain, release envelope) is used as a quick filter sweep: each note opens the filter and shuts it again fast. That is the snap at the front of every bass note.\n- Right switch ADSR, DEPTH 5 (+3.0 oct): each note lifts the cutoff by up to three octaves. More is a harder, brighter snap.\n- ATTACK 0 (3 ms): the filter opens at once, right on the beat.\n- DECAY 3.6 (68 ms): very short, so the snap is a click, not a “wow”.\n- SUSTAIN 0: the filter closes right back to the thump while the key is held.\n- RELEASE 2.5 (31 ms): a short tail.\n- Listen for: a bright bite on each note, then a dull thump. For now the VCA (voltage-controlled amplifier) still follows this ADSR, so notes are cut short. The next step fixes that.',
        set: { 'vcf.mod2Src': 'adsr', 'vcf.mod2Depth': 5, 'adsr.attack': 0, 'adsr.decay': 3.6, 'adsr.sustain': 0, 'adsr.release': 2.5 } },
      { title: 'Loudness from the AR', module: 'amp', why: 'The ADSR has no sustain, so on the VCA (voltage-controlled amplifier) it cuts notes short. The AR envelope takes over the loudness instead, so notes last as long as the keys.\n- VCA AR: the AR (attack, release) envelope rises, holds full level while a key is down, then falls. Notes now hold their full weight while the ADSR only snaps the filter.\n- AR ATTACK 0 (3 ms): full level straight away, so the punch lines up with the filter snap.\n- AR RELEASE 2.5 (31 ms): notes stop almost as soon as you let go, which keeps the gaps tight.\n- Listen for: long notes now sustain, with the bright snap only at the start. Flip the VCA back to ADSR to hear them turn into short blips.',
        set: { 'vca.mode': 'ar', 'ar.attack': 0, 'ar.release': 2.5 } },
    ],
    context: {
      'vco2.sub': 'In this sound: most of the weight. Take it down and the bass loses its floor.',
      'vcf.mod2Depth': 'In this sound: the size of the snap on each note.',
      'adsr.decay': 'In this sound: the length of the snap. The AR, not the ADSR, sets how long notes last.',
      'vca.mode': 'In this sound: AR, so notes hold at full level while the ADSR only shapes the filter.',
    },
    tweaks: [
      { id: 'adsr.decay', try: 'Move between 2.5 and 5', hear: 'From a tight click to a slower, rubbery wah.' },
      { id: 'vcf.q', try: 'Raise to 7', hear: 'The snap turns into a squelch.' },
      { id: 'vco1.pulse', try: 'Raise to 6 with PULSE WIDTH at 6', hear: 'A nasal, reedy edge on top.' },
    ],
  },
  {
    id: 'cat-pwm-strings', name: 'PWM Strings', ref: 'In the style of late-70s string-synth pads', artist: 'Classic technique',
    tags: ['strings', 'pad', '70s'], level: 2,
    blurb: 'A slow, shimmering string sound from a moving pulse wave.',
    how: 'VCO 1’s pulse width is swept by the LFO sine, which makes a single oscillator sound like several drifting against each other. VCO 2’s sawtooth, slightly detuned, adds body. A slow attack and long release give the bowed swell of a string section.',
    phrase: { bpm: 60, loop: true, steps: [[0, 57, 3.8], [0, 64, 3.8], [4, 60, 3.8], [4, 67, 3.8]] },
    steps: [
      { title: 'A pulse with a moving width', module: 'osc', why: 'PWM (pulse-width modulation) on VCO 1, the voltage-controlled oscillator: the LFO (low-frequency oscillator) keeps changing the pulse’s width, and one oscillator starts to sound like several drifting against each other.\n- VCO 1 SAWTOOTH 0, PULSE 8: the pulse only. Its width is what gets moved.\n- PULSE WIDTH source LFO SINE: the LFO sine sweeps the width back and forth. On DC the width is fixed and the tone is a plain, reedy pulse.\n- PULSE WIDTH 7 (70 %): with a moving source this knob is the depth of the sweep. Too much and the pulse thins to a buzz at the ends of each sweep.\n- LFO FREQUENCY 3.6 (0.36 Hz): about one sweep every three seconds. Slower drifts more gently; faster turns into a warble.\n- LFO DELAY 0: the sweep runs at full depth from the start of each note.\n- Listen for: a slow, chorus-like shimmer on a held note. Flip the source to DC and it stops dead.',
        set: { 'vco1.saw': 0, 'vco1.pulse': 8, 'vco1.pwmSrc': 'sine', 'vco1.pw': 7, 'lfo.rate': 3.6, 'lfo.delay': 0 } },
      { title: 'Body from VCO 2', module: 'osc', why: 'VCO 2 adds a sawtooth for body under the moving pulse, and KEYBOARD CONTROL lets the CAT play two notes of a chord.\n- VCO 2 SAWTOOTH 5: a saw at a lower level than the pulse. It fills in the harmonics the pulse lacks and gives the string sound its body.\n- VCO 2 FINE TUNE 0 (about +0.1 st): the slightest offset from VCO 1, so the two drift against each other on a single key.\n- KEYBOARD CONTROL POLY: hold two keys and VCO 1 plays the higher, VCO 2 the lower. Both go through one filter and one envelope.\n- Listen for: hold two keys a fifth or a third apart. The upper note shimmers on the moving pulse, and the lower note is the steadier saw.',
        set: { 'vco2.saw': 5, 'vco2.fine': 0.04, 'pitch.kbdCtrl': 'poly' } },
      { title: 'A soft filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a 24 dB low-pass. Here it just trims the fizz off the top so the strings sound warm, with no movement on each note.\n- Fc 5.8 (about 1 kHz): Fc is the cutoff. Enough to keep the shimmer clear without the saw sounding harsh. Lower is more muted, higher more wiry.\n- Q 1 (10 %): Q is resonance. Kept low so the filter does not add its own colour.\n- Filter DEPTH 0: no envelope opening the filter, so every note has the same even tone, as a string section should.\n- KEYBOARD CONTROL 5 (50 %): the cutoff follows the keys half way, so higher chords do not go dull.\n- Listen for: the top edge softening. Push Fc up and down to hear where the sound turns from warm to wiry.',
        set: { 'vcf.fc': 5.8, 'vcf.q': 1, 'vcf.mod2Depth': 0, 'vcf.kbd': 5 } },
      { title: 'A bowed swell', module: 'env', why: 'The ADSR (attack, decay, sustain, release envelope) shapes the VCA, the voltage-controlled amplifier that sets loudness. A slow start and long tail give the bowed swell of a string section.\n- ATTACK 6 (290 ms): the slow bow into each note. At 0 the strings start with a hard edge, like an organ.\n- DECAY 5 (190 ms) and SUSTAIN 10 (100 %): with full sustain the decay has nothing to do, so the note stays at full level while held.\n- RELEASE 6.5 (550 ms): each chord fades out after the keys come up, so chord changes overlap smoothly.\n- VCA ADSR: the ADSR sets the loudness.\n- Listen for: chords swelling in and hanging on after you let go. Play short notes and they barely reach full level.',
        set: { 'adsr.attack': 6, 'adsr.decay': 5, 'adsr.sustain': 10, 'adsr.release': 6.5, 'vca.mode': 'adsr' } },
    ],
    context: {
      'vco1.pw': 'In this sound: the depth of the shimmer. Too much and the pulse thins to a buzz at the ends of each sweep.',
      'lfo.rate': 'In this sound: how fast the ensemble drifts. Slower is lusher.',
      'vco1.pwmSrc': 'In this sound: LFO sine. On DC the shimmer stops and the tone is a plain, reedy pulse.',
      'adsr.attack': 'In this sound: the slow bow into each note.',
    },
    tweaks: [
      { id: 'vco1.pwmSrc', try: 'Switch to ADSR', hear: 'The width sweeps once per note instead of shimmering.' },
      { id: 'lfo.rate', try: 'Raise to 5', hear: 'A faster, more nervous chorus.' },
      { id: 'vco2.saw', try: 'Bring down to 0', hear: 'A thinner, glassier pad from VCO 1 alone.' },
    ],
  },
  {
    id: 'cat-sh-bleeps', name: 'Random Bleeps', ref: 'In the style of 70s film sci-fi computers', artist: 'Classic technique',
    tags: ['fx', 'sci-fi', '70s'], level: 2,
    blurb: 'A held note that turns into a stream of random, resonant blips.',
    how: 'The sample and hold measures noise once per LFO cycle, and its random steps move the filter cutoff. ADSR REPEAT on GATED fires the envelopes at the same rate while the key is held, so each step is a new plucked note.',
    phrase: { bpm: 90, loop: true, steps: [[0, 60, 7.8]] },
    steps: [
      { title: 'A bright source', module: 'osc', why: 'A bright source for the filter to pick through. VCO 1 (voltage-controlled oscillator) mixes two waves, which gives plenty of harmonics for the random resonant blips to land on.\n- VCO 1 SAWTOOTH 6: the buzzy saw, full of harmonics.\n- VCO 1 PULSE 5: a pulse on top, adding a hollower edge.\n- PULSE WIDTH 4 (40 %): with the width source on DC, this sets a fixed, slightly narrow pulse. Left is a square, right a thin nasal pulse.\n- Listen for: a bright, buzzy held note. Nothing moves yet.',
        set: { 'vco1.saw': 6, 'vco1.pulse': 5, 'vco1.pw': 4 } },
      { title: 'Random steps on the cutoff', module: 'mod', why: 'The S+H (sample and hold) measures noise once per LFO cycle and holds the value, giving random steps. Sent to the filter cutoff with high resonance, each step becomes a new whistling blip.\n- SAMPLE AND HOLD source NOISE: random values, a new one each LFO cycle.\n- Filter left switch S+H, DEPTH 6 (60 %): the random steps move the cutoff. More depth spreads the blips further apart in pitch.\n- Fc 5.4 (about 750 Hz): Fc is the cutoff, the centre the steps jump around.\n- Q 7.5 (75 %): Q is resonance. This high the filter rings at each new cutoff. Lower it and the blips become dull ticks.\n- LFO FREQUENCY 6.2 (2.2 Hz): the LFO (low-frequency oscillator) is the S+H clock, so about two steps a second. One fader sets the LFO, the S+H and the repeat.\n- Listen for: a held note jumping to a new resonant colour about twice a second.',
        set: { 'sh.src': 'noise', 'vcf.mod1Src': 'sh', 'vcf.mod1Depth': 6, 'vcf.fc': 5.4, 'vcf.q': 7.5, 'lfo.rate': 6.2 } },
      { title: 'Repeat the envelopes', module: 'env', why: 'ADSR REPEAT uses the LFO as a clock to fire the envelopes again and again while the key is held. With the ADSR (attack, decay, sustain, release) plucking the filter and the VCA, each random step becomes its own note.\n- ADSR REPEAT GATED: the envelopes restart every LFO cycle, but only while a key is held. AUTO would keep going with no key down.\n- ATTACK 0, DECAY 4.8, SUSTAIN 0: a short pluck that dies away before the next step.\n- RELEASE 4 (91 ms): a short tail on each blip.\n- Filter DEPTH 3 (+1.8 oct) and VCA ADSR: the same pluck opens the filter and shapes the loudness through the VCA (voltage-controlled amplifier).\n- Listen for: one held key becoming a stream of separate blips, each on a random pitch. Move LFO FREQUENCY to speed up the blips and the random steps together.',
        set: { 'trig.repeat': 'gated', 'adsr.attack': 0, 'adsr.decay': 4.8, 'adsr.sustain': 0, 'adsr.release': 4, 'vcf.mod2Depth': 3, 'vca.mode': 'adsr' } },
    ],
    context: {
      'lfo.rate': 'In this sound: the speed of the blips. One fader sets the LFO, the sample and hold and the repeat together.',
      'vcf.mod1Depth': 'In this sound: how far apart the random pitches of the blips are.',
      'vcf.q': 'In this sound: makes each step whistle. Lower it and the blips become dull ticks.',
      'trig.repeat': 'In this sound: turns one held key into a stream of notes.',
    },
    tweaks: [
      { id: 'trig.repeat', try: 'Switch to AUTO', hear: 'The blips keep going with no key held.' },
      { id: 'lfo.rate', try: 'Lower to 4.5', hear: 'Slow, deliberate computer thinking.' },
      { id: 'vco1.mod1Src', try: 'Set to S+H with VCO 1’s left depth at 5', hear: 'The pitch jumps randomly too.' },
    ],
  },
  {
    id: 'cat-cross-mod-bell', name: 'Cross-Mod Bell', ref: 'Audio-rate cross-modulation between the VCOs', artist: 'Classic technique',
    tags: ['keys', 'bell', 'fm'], level: 3,
    blurb: 'A metallic, bell-like tone from VCO 1 modulating VCO 2 at audio rate.',
    how: 'VCO 2’s right-hand switch set to VCO 1 feeds VCO 1’s wave into VCO 2’s pitch. At audio rate that adds new partials that are not in the harmonic series: a clangorous, bell-like tone. VCO 1 AUDIO is off, so VCO 1 is only heard through what it does to VCO 2. The ADSR with no sustain gives a struck shape.',
    phrase: { bpm: 80, loop: true, steps: [[0, 72, 1.8], [2, 79, 0.9], [3, 76, 0.9], [4, 84, 1.8], [6, 77, 1.8]] },
    steps: [
      { title: 'VCO 1 as a silent modulator', module: 'osc', why: 'VCO 1 (voltage-controlled oscillator 1) is set up as a hidden modulator. It will shape VCO 2’s tone in the next step without being heard itself.\n- KEYBOARD CONTROL MONO: both VCOs follow the same key, so the pitch ratio between them stays fixed across the keyboard.\n- VCO 1 SAWTOOTH 0, TRIANGLE 8: a triangle is a smooth wave with few harmonics, which gives a cleaner bell than a saw would.\n- VCO 1 COARSE 6.3 (+19 st): an octave and a fifth above VCO 2. That ratio sets the bell’s character: octaves and fifths ring like bells, in-between settings sound like gongs.\n- VCO 1 AUDIO off: VCO 1 keeps running but is taken out of the filter, so it is not heard.\n- Listen for: nothing yet. VCO 2’s sliders are all down, so there is no sound until the next step.',
        set: { 'pitch.kbdCtrl': 'mono', 'vco1.saw': 0, 'vco1.tri': 8, 'vco1.coarse': 6.32, 'vcf.vco1Audio': false } },
      { title: 'Feed VCO 1 into VCO 2', module: 'mod', why: 'FM (frequency modulation) at audio rate: VCO 1’s wave shakes VCO 2’s pitch hundreds of times a second. That adds new partials outside the normal harmonic series, which is what makes a tone sound metallic.\n- VCO 2 SQUARE 7: the sound you hear. On its own a hollow square.\n- VCO 2 right switch VCO 1: the right-hand switch usually picks an envelope; on VCO 1 it feeds that oscillator into VCO 2’s pitch.\n- VCO 2 DEPTH 4 (40 %): the amount of clang. At 0 it is a plain square; more gets more metallic, and past about 6 it turns to noise.\n- Listen for: a clangorous, bell-like tone on each key. Turn DEPTH from 0 up slowly to hear the square turn into metal, then try moving VCO 1 COARSE to change the ratio.',
        set: { 'vco2.square': 7, 'vco2.mod2Src': 'vco1', 'vco2.mod2Depth': 4 } },
      { title: 'Filter follows the keys', module: 'filter', why: 'The VCF (voltage-controlled filter) follows the keys exactly, so the bell sounds the same brightness across the range, and the AR envelope lifts it while a note is held.\n- Fc 6.6 (about 1.8 kHz): Fc is the cutoff. Fairly open so the metallic partials come through; lower it for a duller, woodier bell.\n- Q 0: Q is resonance. Off, so the filter adds no ringing of its own on top of the clang.\n- KEYBOARD CONTROL 10 (MAX): the cutoff follows the keys one to one, so high and low notes are equally bright.\n- Right switch AR, DEPTH 2 (+1.2 oct): the AR (attack, release) envelope raises the cutoff while the key is down.\n- AR ATTACK 0 (3 ms), RELEASE 5 (190 ms): the lift is instant and falls back over about a fifth of a second.\n- Listen for: play low and high notes and compare. Both keep the same sparkle.',
        set: { 'vcf.fc': 6.6, 'vcf.q': 0, 'vcf.kbd': 10, 'vcf.mod2Src': 'ar', 'vcf.mod2Depth': 2, 'ar.attack': 0, 'ar.release': 5 } },
      { title: 'A struck shape', module: 'amp', why: 'A struck shape on the VCA (voltage-controlled amplifier): the ADSR (attack, decay, sustain, release) hits full level at once and then dies away, like a bell or a struck bar.\n- VCA ADSR: the ADSR sets the loudness.\n- ATTACK 0 (3 ms): the strike, instant.\n- DECAY 7 (800 ms): how long the bell rings. Longer is a big bell, shorter a small chime or a xylophone bar.\n- SUSTAIN 0: the note always dies away, however long the key is held.\n- RELEASE 6.5 (550 ms): let go early and the ring still fades out gently rather than stopping.\n- Listen for: each note ringing and fading on its own. Sweep DECAY to go from chime to gong.',
        set: { 'vca.mode': 'adsr', 'adsr.attack': 0, 'adsr.decay': 7, 'adsr.sustain': 0, 'adsr.release': 6.5 } },
    ],
    context: {
      'vco2.mod2Depth': 'In this sound: the amount of clang. Past 6 it turns to noise.',
      'vco1.coarse': 'In this sound: the ratio between the VCOs. Octaves and fifths sound like bells; in-between settings sound like gongs.',
      'vcf.vco1Audio': 'In this sound: off, so VCO 1 shapes the tone without being heard itself.',
      'adsr.decay': 'In this sound: how long the bell rings.',
    },
    tweaks: [
      { id: 'vco1.coarse', try: 'Move slowly between 6 and 7', hear: 'The bell changes from sweet to gong-like and back.' },
      { id: 'vco2.mod2Depth', try: 'Turn to 7', hear: 'A harsh, clanging metal sound.' },
      { id: 'vcf.vco1Audio', try: 'Switch ON', hear: 'VCO 1’s plain triangle joins in, softening the bell.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'cat', name: 'CAT', maker: 'Behringer', year: 2021,
  heritage: 'Based on the Octave CAT SRM II, from New York in the early 1980s',
  summary: 'A duophonic synth: two VCOs, each with several waveforms on their own level sliders, into one 24 dB low-pass filter and a VCA. Hold two keys and VCO 1 plays the higher, VCO 2 the lower. An ADSR and an AR envelope, a delayed LFO, sample and hold, and switch-selected modulation for each VCO and the filter.',
  view: { w: 2000, h: 700 },
  theme: { panel: '#1f2022', panel2: '#151617', ink: INK, font: 'din', weight: 600, cheeks: 'wood', cheekW: 40, jack: 'black' },
  signalNames: {
    osc1: 'VCO 1', osc2: 'VCO 2', env1: 'the ADSR', env2: 'the AR envelope', vib: 'the LFO sine (after LFO DELAY)',
    lfoSq: 'the LFO square', sh: 'the sample and hold', kbd: 'the keyboard CV', noise: 'the noise generator',
  },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
