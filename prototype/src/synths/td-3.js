// Behringer TD-3 — SynthDef. Positions are measured on the 1200×1200 product photo (ref/behringer-td-3.jpg, the yellow
// TD-3-AM) and doubled into view units: X() and Y() take photo pixels.
import { annotate, expMap, level10, fmtTime, fmtHz, fmtSemi, acidPhrase } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/td-3.js';
import lineage from '@/synths/lineage/td-3.js';
import unusual from '@/synths/unusual/td-3.js';

const K = 2;
const X = (x) => Math.round((x - 52) * K);
const Y = (y) => Math.round((y - 320) * K);
const INK = '#2b2213';
const YEL = '#f2b21c';

const controls = [];
const decor = [];
const jacks = [];
const knob = (id, x, y, r, rest) => controls.push({ id, type: 'knob', x: X(x), y: Y(y), r: Math.round(r * K), style: 'neutron', labelPos: 'none', ...rest });
const text = (x, y, t, size = 17, rest = {}) => decor.push({ t: 'text', x: X(x), y: Y(y), text: t, size, anchor: 'middle', ...rest });
const rect = (x, y, w, h, rest = {}) => decor.push({ t: 'rect', x: X(x), y: Y(y), w: Math.round(w * K), h: Math.round(h * K), r: 3, fill: INK, ...rest });
// a section name on a black bar, the panel colour knocked out of it
const header = (x0, x1, y, t, size = 22) => { rect(x0, y - 8, x1 - x0, 16); text((x0 + x1) / 2, y + 4, t, size, { fill: YEL, weight: 700 }); };
// a section name in an outlined box
const box = (x, y, w, h, t, size = 16, rest = {}) => {
  rect(x - w / 2, y - h / 2, w, h, { fill: rest.fill || 'none', stroke: INK, sw: 2 });
  text(x, y + size * 0.17, t, size, { weight: 700, ...(rest.ink ? { fill: rest.ink } : {}) });
};
const led = (x, y, litWhen) => decor.push({ t: 'led', x: X(x), y: Y(y), r: 7, color: 'red', litWhen });

// ── Faceplate print ───────────────────────────────────────────────────────
text(131, 365, 'TD-3', 58, { weight: 800, spacing: 1 });
text(285, 366, 'Computer Controlled', 32, { weight: 500 });
text(988, 366, 'Analog Bass Line Synthesizer', 32, { weight: 500 });
decor.push({ t: 'line', x1: X(57), y1: Y(630), x2: X(1135), y2: Y(630), w: 2 });
// the smiley face
decor.push(
  { t: 'arc', x: X(793), y: Y(568), r: 96, a0: 0, a1: 180, w: 4 },
  { t: 'arc', x: X(793), y: Y(568), r: 96, a0: 180, a1: 360, w: 4 },
  { t: 'path', d: `M${X(770)} ${Y(552)} v14 M${X(816)} ${Y(552)} v14`, w: 6 },
  { t: 'arc', x: X(793), y: Y(566), r: 58, a0: 112, a1: 248, w: 5 },
);
decor.push({ t: 'led', x: X(793), y: Y(494), r: 6, color: 'amber', litWhen: 'power' });

// ── Tone controls: the top knob row ───────────────────────────────────────
const TOPY = 445;
[['TUNE', 118], ['CUTOFF', 205], ['RESONANCE', 292], ['ENVELOPE', 379], ['DECAY', 465], ['ACCENT', 552],
  ['DISTORTION', 900], ['TONE', 987], ['LEVEL', 1073]].forEach(([t, x]) => text(x, 398, t, 19, { weight: 600 }));
const cutHz = (v) => expMap(v / 10, 160, 5200);
const decayS = (v) => expMap(v / 10, 0.2, 2);
knob('osc.tune', 118, TOPY, 21, {
  kind: 'cont', min: -12, max: 12, def: 0, module: 'osc', label: 'TUNE', fmt: fmtSemi,
  help: 'Tunes the whole instrument, about an octave either way from the centre, so it can match other instruments.',
});
knob('filter.cutoff', 205, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'filter', label: 'CUTOFF', fmt: (v) => fmtHz(cutHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull, round bass; high settings let the full buzz through.',
});
knob('filter.res', 292, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 3, module: 'filter', label: 'RESONANCE',
  help: 'Boosts the frequencies right at the cutoff, so filter movement turns into a squelch. Near the top the filter starts to whistle on its own. It also sets how far accented notes push the filter.',
});
knob('filter.envMod', 379, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 4, module: 'filter', label: 'ENVELOPE', name: 'ENVELOPE (env mod)',
  help: 'How far the envelope opens the filter on each note. Turned up, every note starts bright and closes down.',
});
knob('env.decay', 465, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 4, module: 'env', label: 'DECAY', fmt: (v) => fmtTime(decayS(v)),
  help: 'How long the envelope takes to close the filter after each note starts. Short gives clipped, plucky notes; long lets each note open and close slowly.',
});
knob('amp.accent', 552, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'env', label: 'ACCENT',
  help: 'How much accented notes stand out: louder, and with an extra sweep of the filter. Notes that are not accented are not affected.',
});
knob('dist.drive', 900, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'fx', label: 'DISTORTION', name: 'DISTORTION (drive)',
  help: 'How hard the distortion is driven. Low settings add grit; high settings turn the bass into a fuzzy, compressed roar.',
});
knob('dist.tone', 987, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'fx', label: 'TONE', name: 'Distortion TONE',
  help: 'Brightness of the distortion: left is darker and smoother, right is brighter and harsher.',
});
knob('dist.level', 1073, TOPY, 21, {
  kind: 'cont', min: 0, max: 10, def: 6, module: 'fx', label: 'LEVEL', name: 'Distortion LEVEL',
  help: 'Output level of the distortion, to match it to the sound with the distortion off.',
});

// ── Patch bay ─────────────────────────────────────────────────────────────
const jack = (id, x, label, dir, rest) => {
  jacks.push({ id, x: X(x), y: Y(405), r: 22, label, labelPos: 'none', dir, ...rest });
  decor.push({ t: 'arrow', x: X(x), y: Y(382), dir: dir === 'in' ? 'down' : 'up', size: 7 });
  text(x, 429, label, 14, { weight: 600 });
};
jack('j.filterIn', 622, 'FILTER\nIN', 'in', {
  dest: 'vcfIn', amt: 1, name: 'FILTER IN',
  help: 'Outside audio into the filter in place of the oscillator. Plugging in takes the oscillator out, so the TD-3 becomes a filter, envelope and distortion for another sound.',
});
jack('j.syncIn', 674, 'SYNC\nIN', 'in', {
  dest: null, name: 'SYNC IN',
  help: 'Clock and start/stop from other gear when the clock source is set to TRIG. Not modelled here: a cable in it does nothing.',
});
jack('j.cvOut', 726, 'CV\nOUT', 'out', {
  signal: 'kbd', name: 'CV OUT',
  help: 'The pitch of the note playing as a control voltage, 1 V per octave, so the sequencer can play another synth. It glides on slid notes. Accent is not sent.',
});
jack('j.gateOut', 778, 'GATE\nOUT', 'out', {
  signal: 'gate', name: 'GATE OUT',
  help: 'On while a note is held and off between notes, for triggering another synth’s envelopes. It stays on through a slide.',
});
jack('j.phones', 830, 'PHONES', 'out', {
  signal: 'out', help: 'Headphone output: the finished sound, after the distortion.',
});

// ── Second row: tempo, waveform, track, mode, distortion switch, volume ──
const tab = (x0, x1, t, rest = {}) => box((x0 + x1) / 2, 495, x1 - x0, 16, t, 19, rest);
tab(65, 178, 'TEMPO');
tab(186, 290, 'WAVEFORM');
box(321, 495, 52, 16, 'TRACK', 19, { fill: INK, ink: YEL });
tab(347, 462, 'PATTERN GROUP');
tab(470, 680, 'MODE');
tab(905, 1005, 'DISTORTION');
tab(1015, 1128, 'VOLUME');
knob('seq.tempo', 121, 568, 32, {
  kind: 'cont', min: 40, max: 300, def: 120, step: 1, module: 'mode', ui: true, label: 'TEMPO', name: 'TEMPO',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'Speed of the pattern. Here it sets the speed of the riff, and each sound starts at its own riff’s tempo.',
});
text(88, 616, 'SLOW', 14);
text(160, 616, 'FAST', 14);
decor.push({ t: 'wave', x: X(199), y: Y(568), size: 20, shape: 'saw' }, { t: 'wave', x: X(276), y: Y(568), size: 20, shape: 'sq' });
controls.push({
  id: 'osc.wave', type: 'slide', orient: 'h', x: X(238), y: Y(568), w: 66, h: 26, kind: 'enum', module: 'osc',
  options: [{ v: 'saw', label: 'Sawtooth' }, { v: 'sq', label: 'Square' }], def: 'saw', label: 'WAVEFORM', labelPos: 'none',
  help: 'Chooses the oscillator’s waveform. Sawtooth is bright and buzzy, the usual acid sound; square is hollower and rounder.',
});

const TRACK_A = [-120, -88, -52, -15, 22, 58, 92];
knob('seq.track', 378, 568, 32, {
  kind: 'enum', options: TRACK_A.map((a, i) => ({ v: `t${i + 1}`, label: '', a })), def: 't1', module: 'mode', ui: true,
  label: 'TRACK / PATTERN GROUP', name: 'TRACK / PATTERN GROUP',
  help: 'In the track modes it picks TRACK 1 to 7, a song built from a chain of patterns. In the pattern modes it picks PATTERN GROUP I to IV (positions 1–2, 3–4, 5–6 and 7). This app plays one riff per sound, so the switch does not change it.',
});
TRACK_A.forEach((a, i) => {
  const rad = (a * Math.PI) / 180;
  box(378 + Math.sin(rad) * 55, 572 - Math.cos(rad) * 55, 11, 11, String(i + 1), 14, { fill: INK, ink: YEL });
});
text(305, 556, 'I', 15, { weight: 700 });
text(298, 518, 'II', 15, { weight: 700 });
text(457, 532, 'III', 15, { weight: 700 });
text(455, 570, 'IV', 15, { weight: 700 });

const MODES = [['track_write', 50], ['track_play', 78], ['pattern_play', 104], ['pattern_write', 132]];
knob('seq.mode', 548, 568, 32, {
  kind: 'enum', options: MODES.map(([v, a]) => ({ v, label: '', a })), def: 'pattern_play', module: 'mode', ui: true, label: 'MODE', name: 'MODE',
  help: 'What the sequencer is doing: writing or playing a track, or playing or writing a pattern. Patterns are written in PATTERN WRITE and played in PATTERN PLAY. This app has no pattern memory, so the switch does not change the sound.',
});
box(606, 529, 34, 11, 'WRITE', 13, { fill: INK, ink: YEL });
box(615, 553, 26, 11, 'PLAY', 13, { fill: INK, ink: YEL });
box(662, 541, 36, 11, 'TRACK', 13, { fill: INK, ink: YEL });
text(615, 587, 'PLAY', 15, { weight: 600 });
text(605, 611, 'WRITE', 15, { weight: 600 });
text(663, 599, 'PATTERN', 15, { weight: 600 });
decor.push(
  { t: 'path', d: `M${X(623)} ${Y(529)} H${X(636)} V${Y(553)} H${X(628)} M${X(636)} ${Y(541)} H${X(644)}`, w: 2 },
  { t: 'path', d: `M${X(632)} ${Y(586)} H${X(638)} V${Y(608)} H${X(625)} M${X(638)} ${Y(599)} H${X(641)}`, w: 2 },
);

controls.push({
  id: 'dist.on', type: 'slide', orient: 'h', x: X(955), y: Y(568), w: 66, h: 26, kind: 'bool', def: false, module: 'fx',
  onAt: 'bottom', label: 'DISTORTION OFF/ON', labelPos: 'none',
  help: 'Switches the distortion in. Off, the DISTORTION, TONE and LEVEL knobs do nothing.',
});
text(919, 572, 'OFF', 16, { weight: 600 });
text(990, 572, 'ON', 16, { weight: 600 });

knob('out.volume', 1071, 568, 32, {
  kind: 'cont', min: 0, max: 10, def: 7, module: 'out', label: 'VOLUME',
  help: 'Output level at the rear output and the PHONES socket.',
});
text(1035, 616, 'MIN', 14);
text(1110, 616, 'MAX', 14);

// ── Sequencer section ─────────────────────────────────────────────────────
const btn = (id, x, y, w, h, rest) =>
  controls.push({ id, type: 'button', x: X(x), y: Y(y), w: Math.round(w * K), h: Math.round(h * K), kind: 'bool', def: false, module: 'mode', ui: true, labelPos: 'none', ...rest });
// the black blocks behind START/STOP and WRITE/NEXT
rect(64, 728, 108, 124, { r: 4 });
rect(1020, 728, 115, 124, { r: 4 });

box(83, 651, 30, 13, 'D.C.', 14);
box(135, 651, 62, 13, 'BAR RESET', 13);
text(119, 680, 'CLEAR', 16, { weight: 600 });
btn('seq.clear', 119, 705, 46, 26, {
  label: 'CLEAR', name: 'CLEAR (BAR RESET / D.C.)',
  help: 'Clears the pattern being written. In a track it goes back to the first measure (BAR RESET) and marks a track’s last measure (D.C.). It also starts the metronome for tap writing. Not modelled here.',
});
box(155, 731, 30, 11, 'RAND', 12, { fill: YEL });
led(117, 741, { id: 'seq.run', eq: true });
btn('seq.run', 117, 777, 50, 44, {
  label: 'START/STOP', name: 'START/STOP',
  help: 'Starts and stops the pattern or track. In this app, use Play riff instead.',
});
text(119, 821, 'START/STOP', 15, { fill: YEL, weight: 700 });

header(178, 300, 649, 'PITCH MODE', 18);
led(240, 668, { id: 'seq.pitch', eq: true });
btn('seq.pitch', 240, 706, 46, 26, {
  label: 'PITCH MODE', name: 'PITCH MODE',
  help: 'Enters the notes of a pattern on the 13 keys, one press per note, with TRANSPOSE DOWN and UP for octaves. Held while a pattern plays, a key press transposes the pattern.',
});
text(222, 743, 'FUNCTION', 17, { weight: 700 });
led(270, 740, { id: 'seq.pitch', eq: false });
text(274, 760, 'NORMAL\nMODE', 13);
btn('seq.function', 205, 777, 28, 44, {
  label: 'FUNCTION', name: 'FUNCTION',
  help: 'Returns the sequencer to normal mode. Held, it gives second functions: the step count of a pattern, and inserting, deleting, copying and pasting in tracks and patterns.',
});
box(205, 818, 28, 11, 'BAR', 13, { fill: INK, ink: YEL });

// the 13 keys
header(307, 775, 649, '', 18);
const KEY_X = { C: 334, 'C#': 363, D: 393, 'D#': 422, E: 452, F: 512, 'F#': 541, G: 571, 'G#': 601, A: 630, 'A#': 660, B: 690, C2: 749 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C2'];
const SPOKEN = { C: 'C', 'C#': 'C sharp', D: 'D', 'D#': 'D sharp', E: 'E', F: 'F', 'F#': 'F sharp', G: 'G', 'G#': 'G sharp', A: 'A', 'A#': 'A sharp', B: 'B', C2: 'upper C' };
// what the keys show in the sync settings (FUNCTION, then BACK and WRITE/NEXT together): clock source and clock rate
const SYNC = ['INT', 'MIDI', 'USB', 'TRIG', '1PPS', '2PPQ', '24PPQ', '48PPQ'];
const EDIT = { 'C#': 'DEL', 'D#': 'INS', 'F#': 'CH', 'G#': 'COPY', 'A#': 'PASTE' };
const EDIT_HELP = {
  'C#': 'In track writing it is DEL, which deletes a measure.', 'D#': 'In track writing it is INS, which inserts a measure.',
  'F#': 'It is also CH, used when setting the MIDI channel.', 'G#': 'It is also COPY, for copying a pattern.', 'A#': 'It is also PASTE, for pasting a copied pattern.',
};
let white = 0;
NAMES.forEach((k) => {
  const x = KEY_X[k];
  const black = k.includes('#');
  text(x, 653, k === 'C2' ? 'C' : k, 17, { fill: YEL, weight: 700 });
  const id = `seq.key${k.replace('#', 's')}`;
  if (black) {
    led(x, 668, { id, eq: true });
    btn(id, x, 706, 26, 50, { cap: 'black', label: k, name: `${k} key`, help: `Enters ${SPOKEN[k]} in PITCH MODE. ${EDIT_HELP[k]}` });
    text(x, 745, EDIT[k], 13, { weight: 700 });
  } else {
    white++;
    const n = white;
    text(x - 8, 670, SYNC[n - 1], 13, { weight: 600 });
    led(x, 741, { id, eq: true });
    btn(id, x, 778, 28, 44, {
      label: k === 'C2' ? 'C' : k, name: `${k === 'C2' ? 'Upper C' : k} key / PATTERN ${n}`,
      help: `Enters ${SPOKEN[k]} in PITCH MODE. It is also PATTERN ${n}, which picks a pattern to play or write, and selector digit ${n} for measure numbers. In the sync settings it chooses ${SYNC[n - 1]}.`,
    });
    text(x, 821, String(n), 15);
    box(x, 845, 22, 11, String(n), 14, { fill: INK, ink: YEL });
  }
});
text(275, 821, 'PATTERN', 15);
decor.push({ t: 'rect', x: X(240), y: Y(810), w: Math.round(540 * K), h: Math.round(20 * K), r: 3, fill: 'none', stroke: INK, sw: 1.5 });
text(275, 849, 'SELECTOR', 17, { weight: 700 });
[[363, 'DEL'], [423, 'INS'], [541, 'CH'], [601, 'CPY'], [660, 'PST']].forEach(([x, t]) => box(x, 835, 30, 10, t, 12, { fill: INK, ink: YEL }));

// time mode, transpose, accent, slide
header(783, 1015, 649, 'TIME MODE', 18);
led(897, 665, { id: 'seq.time', eq: true });
text(808, 692, '● ♪', 22);
text(868, 692, '○ ♪', 22);
text(920, 692, '—', 22);
decor.push({ t: 'path', d: `M${X(934)} ${Y(684)} q4 6 12 0 L${X(934)} ${Y(700)}`, w: 3 }, { t: 'circle', x: X(934), y: Y(684), r: 4 });
btn('seq.time', 987, 683, 46, 26, {
  label: 'TIME MODE', name: 'TIME MODE',
  help: 'Gives each step its timing: a note, a tie that holds the note before, or a rest. Pitches go in first in PITCH MODE; timing follows here.',
});
box(838, 716, 110, 20, '', 12);
text(838, 712, 'TRANSPOSE', 12, { weight: 600 });
text(808, 723, 'DOWN', 12, { weight: 600 });
text(868, 723, 'UP', 12, { weight: 600 });
box(930, 715, 58, 18, 'ACCENT', 15);
box(987, 715, 56, 18, 'SLIDE', 15);
led(808, 741, { id: 'seq.down', eq: true });
led(868, 741, { id: 'seq.up', eq: true });
led(928, 741, { id: 'seq.accent', eq: true });
led(987, 741, { id: 'seq.slide', eq: true });
btn('seq.down', 808, 778, 28, 44, {
  label: 'DOWN', name: 'TRANSPOSE DOWN / NOTE / STEP',
  help: 'In PITCH MODE it puts the next note an octave down. In TIME MODE it enters a note on this step. With FUNCTION held it counts the steps in a pattern.',
});
btn('seq.up', 868, 778, 28, 44, {
  label: 'UP', name: 'TRANSPOSE UP / TIE / TRIPLET',
  help: 'In PITCH MODE it puts the next note an octave up. In TIME MODE it enters a tie, so the note before is held through this step. It also sets triplet timing.',
});
btn('seq.accent', 928, 778, 28, 44, {
  ui: false, module: 'env', label: 'ACCENT', name: 'ACCENT button',
  help: 'On the TD-3 this writes an accent into the step being edited, and selects pattern section A. In this app, while it is lit every note you play is accented, so you can hear the ACCENT knob. The riffs carry their own accents.',
});
btn('seq.slide', 987, 778, 28, 44, {
  ui: false, module: 'glide', label: 'SLIDE', name: 'SLIDE button',
  help: 'On the TD-3 this writes a slide into the step being edited, and selects pattern section B. In this app, while it is lit every note glides from the one before. Without it, notes glide only when they overlap, as slid steps do in the riffs.',
});
text(808, 821, 'STEP', 15);
text(868, 821, '♪♪♪', 15);
box(958, 815, 115, 20, '', 12);
text(928, 812, 'A', 12, { weight: 700 });
text(987, 812, 'B', 12, { weight: 700 });
text(958, 824, 'PATTERN SECTION', 11, { weight: 600 });
[[808, '9'], [868, '0'], [928, '100'], [987, '200']].forEach(([x, t]) => box(x, 845, t.length > 1 ? 34 : 22, 11, t, 14, { fill: INK, ink: YEL }));

// back, write/next
box(1073, 651, 22, 14, 'S', 16);
text(1073, 680, 'BACK', 16, { weight: 600 });
btn('seq.back', 1073, 705, 46, 26, { label: 'BACK', name: 'BACK', help: 'Steps back one note while checking or editing a pattern.' });
box(1037, 731, 30, 11, 'SYNC', 12, { fill: YEL });
box(1073, 741, 30, 12, 'D.S.', 12, { fill: YEL });
btn('seq.write', 1073, 777, 50, 44, {
  label: 'WRITE/NEXT', name: 'WRITE/NEXT (TAP)',
  help: 'Moves on to the next step while writing, writes a pattern into a track, and enters timing by tapping (TAP). Pressed with BACK after FUNCTION it opens the sync settings, where the keys choose the clock source and rate.',
});
box(1076, 818, 76, 12, 'WRITE/NEXT', 13, { fill: YEL });
text(1073, 845, 'TAP', 15, { fill: YEL, weight: 700 });

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x, y, w, h) => ({ x: X(x), y: Y(y), w: Math.round(w * K), h: Math.round(h * K) });
const areas = [
  { id: 'tune', label: 'Tune', module: 'osc', keywords: 'pitch tuning octave',
    rects: [R(60, 380, 102, 100)],
    help: 'TUNE moves the whole instrument up or down by about an octave, to match other instruments. The notes themselves come from the sequencer.' },
  { id: 'filter', label: 'Filter', module: 'filter', keywords: 'cutoff resonance envelope env mod squelch brightness acid',
    rects: [R(162, 380, 260, 100)],
    help: 'The resonant low-pass filter that makes the TD-3’s sound. CUTOFF sets its resting point, RESONANCE the squelch, and ENVELOPE how far each note opens it. Turning these three while a pattern plays is how acid lines are performed.' },
  { id: 'envacc', label: 'Decay and accent', module: 'env', keywords: 'envelope decay accent wow length',
    rects: [R(422, 380, 172, 100)],
    help: 'DECAY sets how quickly the filter closes after each note. ACCENT sets how much accented steps stand out: they are louder, their filter decay is short whatever DECAY says, and they sweep the filter higher. The higher RESONANCE is, the bigger that sweep.' },
  { id: 'jacks', label: 'Patch bay', module: 'patch', keywords: 'jacks sockets cv gate filter in sync phones headphones',
    rects: [R(594, 378, 266, 70)],
    help: 'Five small sockets. FILTER IN puts outside audio through the filter in place of the oscillator. SYNC IN takes a clock. CV OUT and GATE OUT let the sequencer play another synth, and PHONES is the headphone output.' },
  { id: 'dist', label: 'Distortion', module: 'fx', keywords: 'drive overdrive fuzz tone level',
    rects: [R(862, 380, 252, 100), R(905, 485, 100, 140)],
    help: 'A distortion stage after the filter and VCA, just before VOLUME. The OFF/ON switch brings it in; DISTORTION sets how hard it is driven, TONE its brightness and LEVEL its output. The original TB-303 has no distortion: players added pedals.' },
  { id: 'tempo', label: 'Tempo', module: 'mode', keywords: 'bpm speed clock',
    rects: [R(62, 485, 118, 140)],
    help: 'TEMPO sets the speed of the sequencer. Here it sets the speed of the riff.' },
  { id: 'wave', label: 'Waveform', module: 'osc', keywords: 'oscillator vco saw square',
    rects: [R(182, 485, 110, 140)],
    help: 'The TD-3 has one oscillator, and this switch chooses its waveform: sawtooth or square. Everything else about the tone is done by the filter.' },
  { id: 'track', label: 'Track and pattern group', module: 'mode', keywords: 'song chain group bank',
    rects: [R(293, 485, 175, 140)],
    help: 'Picks one of seven tracks (songs made of patterns) or one of four groups of patterns, depending on MODE. Not modelled: this app plays one riff per sound.' },
  { id: 'modesw', label: 'Mode', module: 'mode', keywords: 'write play pattern track',
    rects: [R(470, 485, 212, 140)],
    help: 'Chooses between writing and playing, for patterns or for tracks. Not modelled: there is no pattern memory here.' },
  { id: 'volume', label: 'Volume', module: 'out', keywords: 'level output',
    rects: [R(1012, 485, 120, 140)],
    help: 'VOLUME sets the level at the rear output and the PHONES socket.' },
  { id: 'runclear', label: 'Clear and start', module: 'mode', keywords: 'start stop run clear reset',
    rects: [R(60, 638, 116, 215)],
    help: 'CLEAR empties the pattern being written, and in a track resets it to the first measure. START/STOP starts and stops the sequencer; its lamp lights while it runs.' },
  { id: 'pitchfn', label: 'Pitch mode and function', module: 'mode', keywords: 'pitch entry normal mode function',
    rects: [R(177, 638, 127, 165)],
    help: 'A pattern is written in two passes. PITCH MODE is the first: each press of a key enters the next note. FUNCTION returns to normal mode, and held it gives the second functions.' },
  { id: 'keys', label: 'Note keys and pattern selectors', module: 'mode', keywords: 'keyboard notes pattern select selector transpose midi channel clock sync',
    rects: [R(305, 638, 474, 215), R(177, 803, 128, 50)],
    help: 'Thirteen keys, one octave from C to C. In PITCH MODE they enter notes. The eight white keys double as PATTERN 1 to 8 and as digits for measure numbers, and the black keys as DEL, INS, CH, COPY and PASTE. In the sync settings the white keys choose the clock source and rate printed above them. The on-screen keyboard plays the synth here.' },
  { id: 'timemode', label: 'Time mode, accent and slide', module: 'mode', keywords: 'timing note tie rest accent slide glide transpose octave',
    rects: [R(780, 638, 237, 215)],
    help: 'TIME MODE is the second pass of writing a pattern: each step becomes a note, a tie or a rest. TRANSPOSE DOWN and UP set octaves while entering pitches. ACCENT and SLIDE mark steps: an accent makes a note louder and sharper, and a slide glides into the next note without starting it again. Here ACCENT and SLIDE also work on the notes you play.' },
  { id: 'backwrite', label: 'Back and write', module: 'mode', keywords: 'next tap write step back sync',
    rects: [R(1018, 638, 117, 215)],
    help: 'BACK and WRITE/NEXT step back and forward through a pattern while it is written or checked. WRITE/NEXT also stores a pattern into a track, and can be tapped to enter timing in time.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v) {
  const res = v['filter.res'] / 10;
  const env = v['filter.envMod'] / 10;
  const acc = v['amp.accent'] / 10;
  const decay = decayS(v['env.decay']);
  return {
    osc: [{ level: 0.8, mix: v['osc.wave'] === 'saw' ? { saw: 1 } : { pulse: 1 }, pw: 0.5, semi: v['osc.tune'], kbd: true, syncTo: -1 }],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    // ENVELOPE also pulls the filter's resting point down a little, as on the 303 circuit it copies
    filter: { type: 'ladder', mode: 'lp', cutoff: cutHz(v['filter.cutoff']) * Math.pow(2, -0.9 * env), res: res * 1.05, envAmt: 0.5 + env * 4, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.003, d: decay, s: 0, r: decay },
    env2: { a: 0.003, d: 3.5, s: 0, r: 0.012 },
    vca: { envSrc: 'env2', bias: 0 },
    acid: { thresh: 0.9, force: !!v['seq.accent'], decay: 0.2, rise: 0.012, fall: 0.06 + 0.35 * res, cut: acc * (0.6 + 2.6 * res), amp: acc * 0.9 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0.07, legato: !v['seq.slide'] },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
    // the distortion sits after the VCA: filter → VCA → distortion → output
    normals: { vcaIn: 'vcf1', odIn: 'vca', delayIn: 'od' },
    od: v['dist.on'] ? { on: true, drive: v['dist.drive'] / 10, tone: v['dist.tone'] / 10, level: level10(v['dist.level'], 1.6) } : { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'td-first-squelch', name: 'First Squelch', ref: 'In the style of Phuture — "Acid Tracks"', artist: 'Phuture',
    tags: ['bass', 'acid', 'house', '80s'], level: 1,
    blurb: 'The classic acid line: a buzzy sawtooth that squelches on every note and shrieks on the accents.',
    how: 'One sawtooth goes through a resonant low-pass filter. The envelope flicks the filter open on each note and DECAY closes it again, and RESONANCE turns that movement into a squelch. Accented steps open the filter further and play louder, and slid steps glide into the next note.',
    phrase: acidPhrase(122, 'C2 C2 C3a C2 D#2s F2 C2 C2a G1 C2 A#1s C2 C3a C2 F2s D#2'),
    steps: [
      { title: 'A sawtooth, filter half open', module: 'osc', why: 'Everything starts with one oscillator. The sawtooth carries every harmonic, so it gives the filter the most to work on.\n- WAVEFORM sawtooth: bright and buzzy.\n- CUTOFF 3.5: fairly low, so between notes the sound is dark.\n- Listen for: play the riff. It is a dull, plodding bass for now.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 3.5, 'filter.res': 2, 'filter.envMod': 3, 'env.decay': 4 } },
      { title: 'Turn up the resonance', module: 'filter', why: 'RESONANCE boosts the frequencies at the cutoff point. On a 303-style filter that is the squelch.\n- RESONANCE 8: a strong, vocal peak that follows the filter as it moves.\n- Listen for: each note now has a rubbery "yow". Turn RESONANCE back to 2 and the line goes plain again.',
        set: { 'filter.res': 8 } },
      { title: 'Let the envelope open it', module: 'filter', why: 'ENVELOPE sets how far each note opens the filter before DECAY closes it. With high resonance that sweep is the acid sound.\n- ENVELOPE 6: a big sweep on every note.\n- DECAY 3.5 (about 450 ms): each note closes fairly quickly, so the line stays tight.\n- Listen for: the squelch gets wider. Turn DECAY up and the notes smear into long "wows".',
        set: { 'filter.envMod': 6, 'env.decay': 3.5 } },
      { title: 'Accents', module: 'env', why: 'The riff has accented steps. ACCENT sets how much they stand out: louder, quicker to close, and with an extra sweep of the filter that grows with RESONANCE.\n- ACCENT 7: the accented notes jump out with a sharp shriek.\n- Listen for: the pattern of loud and quiet notes. Turn ACCENT to 0 and the line goes flat.',
        set: { 'amp.accent': 7 } },
    ],
    context: {
      'filter.res': 'The squelch. Most acid lines live between 7 and 10.',
      'filter.cutoff': 'Sweep this slowly while the riff plays. That slow sweep is how acid tracks build.',
      'filter.envMod': 'How far each note opens. Low values keep the line dark and the accents stand out more.',
      'env.decay': 'How long each note takes to close. Short is tight and plucky; long smears the notes into each other.',
      'amp.accent': 'How hard the accented steps hit.',
    },
    tweaks: [
      { id: 'filter.cutoff', try: 'Sweep slowly from 2 to 8 while the riff plays', hear: 'The line opens from a muffled thud into a screaming squelch.' },
      { id: 'dist.on', try: 'Switch the distortion on', hear: 'The same line, thicker and angrier.' },
      { id: 'osc.wave', try: 'Switch to square', hear: 'A hollower, rounder line with the same squelch.' },
    ],
  },
  {
    id: 'td-distorted-acid', name: 'Distorted Acid', ref: 'In the style of Josh Wink — "Higher State of Consciousness"', artist: 'Josh Wink',
    tags: ['bass', 'acid', 'techno', '90s'], level: 2,
    blurb: 'A screaming, overdriven acid line with the resonance near the top.',
    how: 'The usual acid voice with the resonance high and a long decay, pushed through the TD-3’s distortion. Distortion squashes the loud and quiet parts together, so the squelch stays loud as the filter closes and the resonant peak turns into a scream.',
    phrase: acidPhrase(130, 'C2 C3a C2s D#2 C2 G2a C2 C2s C3 A#2 C2a F2 C2s D#2 C3a G1'),
    steps: [
      { title: 'Saw, high resonance', module: 'filter', why: 'Start from a squelchy acid voice.\n- WAVEFORM sawtooth, CUTOFF 4, RESONANCE 9.\n- ENVELOPE 5, DECAY 5.5: a long, wet sweep on each note.\n- Listen for: a loud, singing squelch.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 4, 'filter.res': 9, 'filter.envMod': 5, 'env.decay': 5.5, 'amp.accent': 7 } },
      { title: 'Switch in the distortion', module: 'fx', why: 'The distortion sits after the VCA, so it shapes the finished line.\n- OFF/ON to ON.\n- DISTORTION 7: driven hard, so quiet parts of each note are pulled up to the same level as the peaks.\n- Listen for: the squelch now screams and the line sounds compressed and thick.',
        set: { 'dist.on': true, 'dist.drive': 7 } },
      { title: 'Tone and level', module: 'fx', why: 'TONE and LEVEL finish the distortion.\n- TONE 4: a little darker, so the scream is not painful.\n- LEVEL 5: brings the distorted sound back to a sensible level.\n- Listen for: switch the distortion off and on to compare levels; they should be close.',
        set: { 'dist.tone': 4, 'dist.level': 5 } },
    ],
    context: {
      'dist.drive': 'How hard the line is pushed. Above 8 the notes blur into one roar.',
      'dist.tone': 'Turn right for a harsher, brighter scream.',
      'filter.res': 'Near the top so the distortion has a peak to scream with.',
    },
    tweaks: [
      { id: 'filter.cutoff', try: 'Sweep from 2 to 9 slowly', hear: 'The build-up of a 90s acid track, from rumble to scream.' },
      { id: 'dist.drive', try: 'Drop to 2', hear: 'Just a little grit; the squelch comes back into focus.' },
    ],
  },
  {
    id: 'td-round-bass', name: 'Round Pop Bass', ref: 'In the style of 1980s synth pop bass lines', artist: 'Various',
    tags: ['bass', 'pop', '80s'], level: 1,
    blurb: 'A soft, rounded bass, the job the TB-303 design was first sold for.',
    how: 'The square wave and a mostly closed filter with little resonance give a round, woody bass. A modest ENVELOPE gives each note a soft thump at the front. Without heavy resonance the filter just shapes the tone.',
    phrase: acidPhrase(112, 'C2 . C2 . G1 . A#1 C2 . C2 D#2 . F2 . D#2 C2'),
    steps: [
      { title: 'Square wave', module: 'osc', why: 'The square wave has only odd harmonics, which makes it hollow and round compared with the sawtooth.\n- WAVEFORM square.\n- Listen for: play a few low notes. It sounds woody rather than buzzy.',
        set: { 'osc.wave': 'sq' } },
      { title: 'A dark, gentle filter', module: 'filter', why: 'The filter is kept low with little resonance, so it only rounds the tone.\n- CUTOFF 3, RESONANCE 1: soft and round.\n- ENVELOPE 3, DECAY 3: a small thump at the start of each note.\n- Listen for: a bass that sits under a song instead of shouting over it.',
        set: { 'filter.cutoff': 3, 'filter.res': 1, 'filter.envMod': 3, 'env.decay': 3, 'amp.accent': 3 } },
    ],
    context: {
      'filter.cutoff': 'Keeps the bass round. Above about 5 it starts to buzz.',
      'filter.res': 'Kept low so the bass does not squelch.',
      'osc.wave': 'The square is what makes it round. The sawtooth is brighter.',
    },
    tweaks: [
      { id: 'filter.res', try: 'Raise to 6', hear: 'The bass starts to talk, a step towards acid.' },
      { id: 'dist.on', try: 'Switch the distortion on with DISTORTION at 2', hear: 'A warm, slightly gritty bass that cuts through more.' },
    ],
  },
  {
    id: 'td-gate-ping', name: 'Gate Pings', ref: 'A patching trick: the gate into FILTER IN, so a ringing filter is the only sound', artist: 'Technique',
    tags: ['perc', 'acid', 'experimental'], level: 3,
    blurb: 'No oscillator at all: each note’s gate kicks the resonant filter into a short, pitched ping.',
    how: 'A cable into FILTER IN takes the oscillator out of the filter. Patching GATE OUT there sends the filter a sudden jump at the start and end of every note. With RESONANCE high, the filter rings at its cutoff each time it is kicked, like a struck bar. The envelope moves the cutoff, so each ping bends down in pitch.',
    phrase: acidPhrase(118, 'C2a . C2 C2 . C2a . C2 C2 . C2a C2 . C2 C2a .'),
    steps: [
      { title: 'A ringing filter', module: 'filter', why: 'Set the filter up to ring: high RESONANCE and a short envelope.\n- CUTOFF 5.5, RESONANCE 9.4, ENVELOPE 4, DECAY 2.\n- Listen for: a very squelchy acid voice for now.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 5.5, 'filter.res': 9.4, 'filter.envMod': 4, 'env.decay': 2, 'amp.accent': 6 } },
      { title: 'GATE OUT into FILTER IN', module: 'filter', why: 'The cable takes the oscillator out and puts the gate in its place.\n- Cable from GATE OUT to FILTER IN.\n- Listen for: the buzz is gone. Each note is now a short "tock" or "ping" whose pitch is set by CUTOFF, not by the keys.',
        set: {}, cables: [['j.gateOut', 'j.filterIn']] },
      { title: 'Grit', module: 'fx', why: 'A touch of distortion fattens the pings.\n- Distortion ON, DISTORTION 3, TONE 6, LEVEL 7.\n- Listen for: the pings get a woody, clipped edge.',
        set: { 'dist.on': true, 'dist.drive': 3, 'dist.tone': 6, 'dist.level': 7 } },
    ],
    context: {
      'filter.cutoff': 'The pitch of the ping. Sweep it to play a melody with one knob.',
      'filter.res': 'How long each ping rings. Below about 8 it becomes a dull click.',
      'filter.envMod': 'How far each ping bends in pitch as it fades.',
    },
    tweaks: [
      { id: 'filter.cutoff', try: 'Sweep slowly while it plays', hear: 'The pings change pitch like tuned drums.' },
      { id: 'filter.res', try: 'Drop to 6', hear: 'The pitch goes and only clicks are left.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'td-3', name: 'TD-3', maker: 'Behringer', year: 2019,
  heritage: 'Modelled on the 1981 Roland TB-303 Bass Line',
  summary: 'One sawtooth or square oscillator → a resonant low-pass filter → a VCA → distortion, with a single decay envelope, accent and slide, played by a 16-step sequencer.',
  view: { w: 2176, h: 1150 },
  theme: { panel: '#f2b21c', panel2: '#e3a40f', ink: INK, font: 'din', weight: 600, cheeks: 'none', cheekW: 0, knobRing: true },
  signalNames: { env1: 'the filter envelope', env2: 'the volume envelope', kbd: 'the pitch CV', gate: 'the gate', out: 'the output' },
  tempo: 'seq.tempo',
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
