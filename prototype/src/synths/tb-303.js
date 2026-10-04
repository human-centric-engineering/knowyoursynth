// Roland TB-303 Bass Line — SynthDef. Positions are measured on the 1000×562 product photo (ref/roland-tb-303.jpg) and
// scaled by K into view units: X() and Y() take photo pixels.
import { annotate, expMap, level10, fmtTime, fmtHz, acidPhrase } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/tb-303.js';
import lineage from '@/synths/lineage/tb-303.js';
import unusual from '@/synths/unusual/tb-303.js';

const K = 2.8;
const X = (x) => Math.round((x - 122) * K);
const Y = (y) => Math.round((y - 108) * K);
const RED = '#c4322b';

const controls = [];
const decor = [];
const jacks = [];
const knob = (id, x, y, r, rest) => controls.push({ id, type: 'knob', x: X(x), y: Y(y), r: Math.round(r * K), style: 'd-silver', labelPos: 'none', ...rest });
const text = (x, y, t, size = 15, rest = {}) => decor.push({ t: 'text', x: X(x), y: Y(y), text: t, size, anchor: 'middle', ...rest });
const plate = (x, y, w, h, t, size = 13, rest = {}) => {
  decor.push({ t: 'rect', x: X(x - w / 2), y: Y(y - h / 2), w: Math.round(w * K), h: Math.round(h * K), r: 3, fill: rest.fill || '#2a2a2a' });
  text(x, y + 1.6, t, size, { fill: rest.ink || '#e9e9e4', weight: 700 });
};
const box = (x, y, w, h, t, size = 13) => {
  decor.push({ t: 'rect', x: X(x - w / 2), y: Y(y - h / 2), w: Math.round(w * K), h: Math.round(h * K), r: 2, fill: 'none', stroke: '#2a2a2a', sw: 1.6 });
  text(x, y + 1.6, t, size, { weight: 700 });
};
const led = (x, y, litWhen) => decor.push({ t: 'led', x: X(x), y: Y(y), r: 6, color: 'red', litWhen });

// ── Faceplate print ───────────────────────────────────────────────────────
decor.push(
  { t: 'line', x1: X(308), y1: Y(110), x2: X(308), y2: Y(170), w: 2 },
  { t: 'line', x1: X(655), y1: Y(110), x2: X(655), y2: Y(170), w: 2 },
);
// the Roland mark: the stylised R in a rounded square, then the name
decor.push({ t: 'rect', x: X(172), y: Y(148), w: 44, h: 44, r: 8, fill: 'none', stroke: '#262626', sw: 4 });
text(180, 160, 'R', 34, { weight: 700 });
text(222, 162, 'Roland', 54, { weight: 700 });
text(766, 162, 'Bass Line', 52, { weight: 500 });
text(642, 232, 'TB-303', 46, { weight: 500, spacing: 2 });
decor.push({ t: 'line', x1: X(571), y1: Y(238), x2: X(712), y2: Y(238), w: 2 });
text(642, 254, 'Computer Controlled', 30);

// ── Rear edge: connections and the waveform switch ────────────────────────
const rearJack = (id, ax, label, tx, rest) => {
  jacks.push({ id, x: X(ax), y: Y(118), r: 15, label, labelPos: 'none', ...rest });
  text(tx, 120, label, 14, { anchor: 'start' });
};
rearJack('j.mixIn', 147, 'MIX IN', 155, {
  dir: 'in', dest: 'dryIn', amt: 1, add: true,
  help: 'Mixes another sound, such as a drum machine, in with the bass at equal level, just before the outputs. Its level is set at the source.',
});
rearJack('j.sync', 258, 'SYNC IN', 266, {
  dir: 'in', dest: null,
  help: 'A five-pin DIN socket that takes tempo, start and stop from a Roland rhythm machine such as the TR-606 or TR-808. Not modelled here: a cable in it does nothing.',
});
rearJack('j.cv', 664, 'CV', 672, {
  dir: 'out', signal: 'kbd', name: 'CV (pitch)',
  help: 'The pitch of the note playing as a control voltage, 1 V per octave, so the sequencer can play another synth. It glides on slid notes. Accent is not sent.',
});
rearJack('j.gate', 693, 'GATE', 701, {
  dir: 'out', signal: 'gate',
  help: 'On while a note is held and off between notes, for triggering another synth’s envelopes. It stays on through a slide.',
});
rearJack('j.phones', 733, 'HEADPHONE', 741, { dir: 'out', signal: 'out', help: 'Headphone output: the same sound as OUTPUT.' });
rearJack('j.output', 797, 'OUTPUT', 805, { dir: 'out', signal: 'out', help: 'Main audio output, after VOLUME and anything coming in at MIX IN.' });
text(843, 120, '▲ DC 9V', 14, { anchor: 'start' });

decor.push({ t: 'wave', x: X(214), y: Y(115), size: 13, shape: 'saw' }, { t: 'wave', x: X(232), y: Y(115), size: 13, shape: 'sq' });
text(223, 126, 'WAVEFORM', 14);
controls.push({
  id: 'osc.wave', type: 'slide', orient: 'h', x: X(223), y: Y(136), w: 52, h: 22, kind: 'enum', module: 'osc',
  options: [{ v: 'saw', label: 'Sawtooth' }, { v: 'sq', label: 'Square' }], def: 'saw', label: 'WAVEFORM', labelPos: 'none',
  help: 'Chooses the oscillator’s waveform. Sawtooth is bright and buzzy, the usual acid sound; square is hollower and rounder.',
});

// ── Tone control: the knob row ────────────────────────────────────────────
const TOP = [
  ['osc.tuning', 343, 'TUNING'], ['filter.cutoff', 400, 'CUT OFF FREQ'], ['filter.res', 456, 'RESONANCE'],
  ['filter.envMod', 513, 'ENV MOD'], ['env.decay', 569, 'DECAY'], ['amp.accent', 623, 'ACCENT'],
];
TOP.forEach(([, x, label]) => text(x, 120, label, 14));
const cutHz = (v) => expMap(v / 10, 160, 5200);
const decayS = (v) => expMap(v / 10, 0.2, 2);
knob('osc.tuning', 343, 148, 13, {
  kind: 'cont', min: -5, max: 5, def: 0, module: 'osc', label: 'TUNING',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} cents`,
  help: 'Tunes the whole instrument up or down by up to about five semitones, so it can match other instruments.',
});
knob('filter.cutoff', 400, 148, 13, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'filter', label: 'CUT OFF FREQ', fmt: (v) => fmtHz(cutHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull, round bass; high settings let the full buzz through.',
});
knob('filter.res', 456, 148, 13, {
  kind: 'cont', min: 0, max: 10, def: 3, module: 'filter', label: 'RESONANCE',
  help: 'Boosts the frequencies right at the cutoff, so filter movement turns into a squelch. It also sets how far accented notes push the filter.',
});
knob('filter.envMod', 513, 148, 13, {
  kind: 'cont', min: 0, max: 10, def: 4, module: 'filter', label: 'ENV MOD',
  help: 'How far the envelope opens the filter on each note. Turned up, every note starts bright and closes down.',
});
knob('env.decay', 569, 148, 13, {
  kind: 'cont', min: 0, max: 10, def: 4, module: 'env', label: 'DECAY', fmt: (v) => fmtTime(decayS(v)),
  help: 'How long the envelope takes to close the filter after each note starts. Short gives clipped, plucky notes; long lets each note open and close slowly.',
});
knob('amp.accent', 623, 148, 13, {
  kind: 'cont', min: 0, max: 10, def: 5, module: 'env', label: 'ACCENT',
  help: 'How much accented notes stand out: louder, and with an extra sweep of the filter. Notes that are not accented are not affected.',
});

// ── Tempo, track, mode, volume ────────────────────────────────────────────
text(227, 192, 'TEMPO', 17);
knob('seq.tempo', 227, 234, 19, {
  kind: 'cont', min: 40, max: 300, def: 120, step: 1, module: 'mode', ui: true, label: 'TEMPO', name: 'TEMPO',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'Speed of the pattern, from 40 to 300 beats a minute. Here it sets the speed of the riff, and each sound starts at its own riff’s tempo.',
});
text(196, 270, 'SLOW', 12);
text(258, 270, 'FAST', 12);

plate(318, 191, 30, 9, 'TRACK', 13);
text(360, 192, 'PATT.GROUP', 15);
const TRACK_A = [-125, -92, -55, -18, 18, 55, 92];
knob('seq.track', 338, 242, 19, {
  kind: 'enum', options: TRACK_A.map((a, i) => ({ v: `t${i + 1}`, label: '', a })), def: 't1', module: 'mode', ui: true,
  label: 'TRACK / PATT.GROUP', name: 'TRACK / PATT. GROUP',
  help: 'In the track modes it picks TRACK 1 to 7, a song built from a chain of patterns. In the pattern modes it picks PATTERN GROUP I to IV (positions 1–2, 3–4, 5–6 and 7). This app plays one riff per sound, so the switch does not change it.',
});
TRACK_A.forEach((a, i) => {
  const rad = (a * Math.PI) / 180;
  text(338 + Math.sin(rad) * 33, 245 - Math.cos(rad) * 33, String(i + 1), 13);
});
text(306, 236, 'I', 13);
text(318, 208, 'II', 13);
text(358, 208, 'III', 13);
text(377, 276, 'IV', 13);

text(453, 192, 'MODE', 17);
const MODES = [['track_write', 52], ['track_play', 76], ['pattern_play', 104], ['pattern_write', 128]];
knob('seq.mode', 447, 242, 19, {
  kind: 'enum', options: MODES.map(([v, a]) => ({ v, label: '', a })), def: 'pattern_play', module: 'mode', ui: true, label: 'MODE', name: 'MODE',
  help: 'What the sequencer is doing: writing or playing a track, or playing or writing a pattern. Patterns are written in PATTERN WRITE and played in PATTERN PLAY. This app has no pattern memory, so the switch does not change the sound.',
});
text(489, 216, '· WRITE', 12, { anchor: 'start' });
text(489, 230, '· PLAY', 12, { anchor: 'start' });
plate(533, 223, 26, 8, 'TRACK', 11);
text(489, 251, '· PLAY', 12, { anchor: 'start' });
text(489, 265, '· WRITE', 12, { anchor: 'start' });
text(538, 259, 'PATTERN', 12);
decor.push({ t: 'path', d: `M${X(515)} ${Y(216)} H${X(519)} V${Y(230)} H${X(515)}`, w: 1.4 }, { t: 'path', d: `M${X(515)} ${Y(251)} H${X(522)} V${Y(265)} H${X(515)}`, w: 1.4 });

text(777, 192, 'VOLUME', 17);
knob('out.volume', 777, 242, 19, {
  kind: 'cont', min: 0, max: 10, def: 7, module: 'out', label: 'VOLUME',
  help: 'Output level. On the TB-303 the first click of this knob also switches the power on.',
});
text(745, 274, 'POWER SW OFF', 11);
text(810, 274, 'MAX', 11);

// ── Sequencer section ─────────────────────────────────────────────────────
decor.push(
  { t: 'rect', x: X(128), y: Y(290), w: Math.round(740 * K), h: Math.round(157 * K), r: 4, fill: 'none', stroke: '#2a2a2a', sw: 2 },
  { t: 'line', x1: X(213), y1: Y(290), x2: X(213), y2: Y(426), w: 1.6 },
  { t: 'line', x1: X(783), y1: Y(290), x2: X(783), y2: Y(426), w: 1.6 },
  { t: 'line', x1: X(128), y1: Y(368), x2: X(213), y2: Y(368), w: 1.6 },
  { t: 'line', x1: X(783), y1: Y(368), x2: X(868), y2: Y(368), w: 1.6 },
  { t: 'line', x1: X(128), y1: Y(426), x2: X(868), y2: Y(426), w: 1.6 },
);
const btn = (id, x, y, w, h, rest) =>
  controls.push({ id, type: 'button', x: X(x), y: Y(y), w: Math.round(w * K), h: Math.round(h * K), kind: 'bool', def: false, module: 'mode', ui: true, labelPos: 'none', ...rest });

box(150, 303, 18, 9, 'D.C.', 12);
box(189, 303, 40, 9, 'BAR RESET', 11);
text(171, 324, 'PATTERN CLEAR', 12);
btn('seq.clear', 171, 344, 26, 14, {
  label: 'PATTERN CLEAR', name: 'PATTERN CLEAR (BAR RESET / D.C.)',
  help: 'Clears the pattern being written. In a track it goes back to the first measure (BAR RESET) and marks a track’s last measure (D.C.). Not modelled here.',
});
text(153, 380, 'RUN', 11);
led(171, 378, { id: 'seq.run', eq: true });
text(195, 380, 'BATTERY', 11);
btn('seq.run', 171, 396, 34, 18, {
  label: 'RUN/STOP', name: 'RUN/STOP',
  help: 'Starts and stops the pattern or track. In this app, use Play riff instead.',
});
text(171, 418, 'RUN/STOP', 12);

plate(250, 302, 64, 9, 'PITCH MODE', 12);
led(250, 317, { id: 'seq.pitch', eq: true });
btn('seq.pitch', 250, 336, 26, 15, {
  cap: 'black', label: 'PITCH MODE', name: 'PITCH MODE',
  help: 'Enters the notes of a pattern on the 13 keys, one press per note, with TRANSPOSE DOWN and UP for octaves. Held while a pattern plays, a key press transposes the pattern.',
});
text(238, 364, 'FUNCTION', 12);
led(267, 362, { id: 'seq.pitch', eq: false });
text(270, 375, 'NORMAL\nMODE', 10);
btn('seq.function', 233, 391, 20, 15, {
  label: 'FUNCTION', name: 'FUNCTION',
  help: 'Returns the sequencer to normal mode. Held, it gives second functions: the step count of a pattern, and inserting or deleting measures in a track.',
});
box(233, 413, 18, 8, 'BAR', 11);

// the 13 keys
const KEY_X = { C: 307, 'C#': 328, D: 348, 'D#': 369, E: 388, F: 430, 'F#': 450, G: 470, 'G#': 490, A: 511, 'A#': 531, B: 551, C2: 593 };
decor.push({ t: 'rect', x: X(285), y: Y(296), w: Math.round(330 * K), h: Math.round(109 * K), r: 2, fill: '#f3f3ef', stroke: '#2a2a2a', sw: 1.4 });
[327, 368, 409, 450, 490, 531, 572].forEach((x) => decor.push({ t: 'line', x1: X(x), y1: Y(310), x2: X(x), y2: Y(405), w: 1.2 }));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C2'];
const SPOKEN = { C: 'C', 'C#': 'C sharp', D: 'D', 'D#': 'D sharp', E: 'E', F: 'F', 'F#': 'F sharp', G: 'G', 'G#': 'G sharp', A: 'A', 'A#': 'A sharp', B: 'B', C2: 'upper C' };
let white = 0;
NAMES.forEach((k) => {
  const x = KEY_X[k];
  const black = k.includes('#');
  text(x, 304, k === 'C2' ? 'C' : k, 13);
  const id = `seq.key${k.replace('#', 's')}`;
  if (black) {
    decor.push({ t: 'rect', x: X(x - 12), y: Y(309), w: Math.round(24 * K), h: Math.round(60 * K), r: 2, fill: '#3b3b3d' });
    led(x, 318, { id, eq: true });
    const role = k === 'C#' ? ' In track writing it is DEL, which deletes a measure.' : k === 'D#' ? ' In track writing it is INS, which inserts a measure.' : '';
    btn(id, x, 341, 16, 15, { label: k, name: `${k} key`, help: `Enters ${SPOKEN[k]} in PITCH MODE.${role}` });
    if (k === 'C#') plate(x, 358, 18, 8, 'DEL', 11, { fill: RED });
    if (k === 'D#') plate(x, 358, 18, 8, 'INS', 11, { fill: RED });
  } else {
    white++;
    const n = white;
    led(x, 363, { id, eq: true });
    btn(id, x, 388, 22, 15, {
      label: k === 'C2' ? 'C' : k, name: `${k === 'C2' ? 'Upper C' : k} key / PATTERN ${n}`,
      help: `Enters ${SPOKEN[k]} in PITCH MODE. It is also PATTERN ${n}, which picks a pattern to play or write, and selector digit ${n} for measure numbers.`,
    });
    text(x, 415, String(n), 14, { fill: RED, weight: 700 });
    box(x, 436, 13, 9, String(n), 12);
  }
});
text(268, 415, 'PATTERN', 12, { fill: RED, weight: 700 });
text(242, 437, 'SELECTOR', 13);
box(328, 436, 16, 9, 'DEL', 10);
box(369, 436, 16, 9, 'INS', 10);

// time mode, transpose, accent, slide
text(668, 304, 'TIME MODE', 15);
text(640, 329, '● ♪', 20);
text(678, 329, '○ ♪', 20);
text(713, 329, '—', 20);
decor.push({ t: 'path', d: `M${X(722)} ${Y(323)} q4 6 12 0 L${X(722)} ${Y(334)}`, w: 2.5 });
btn('seq.time', 757, 327, 26, 14, {
  label: 'TIME MODE', name: 'TIME MODE',
  help: 'Gives each step its timing: a note, a tie that holds the note before, or a rest. Pitches go in first in PITCH MODE; timing follows here.',
});
text(657, 341, 'TRANSPOSE', 10);
plate(636, 351, 34, 8, 'DOWN', 11);
plate(678, 351, 34, 8, 'UP', 11);
plate(717, 351, 34, 8, 'ACCENT', 11);
plate(757, 351, 34, 8, 'SLIDE', 11);
led(636, 363, { id: 'seq.down', eq: true });
led(678, 363, { id: 'seq.up', eq: true });
led(717, 363, { id: 'seq.accent', eq: true });
led(757, 363, { id: 'seq.slide', eq: true });
btn('seq.down', 636, 388, 22, 15, {
  label: 'DOWN', name: 'TRANSPOSE DOWN / NOTE / STEP',
  help: 'In PITCH MODE it puts the next note an octave down. In TIME MODE it enters a note on this step. With FUNCTION held it counts the steps in a pattern.',
});
btn('seq.up', 678, 388, 22, 15, {
  label: 'UP', name: 'TRANSPOSE UP / TIE / TRIPLET',
  help: 'In PITCH MODE it puts the next note an octave up. In TIME MODE it enters a tie, so the note before is held through this step. It also sets triplet timing.',
});
btn('seq.accent', 717, 388, 22, 15, {
  ui: false, module: 'env', label: 'ACCENT', name: 'ACCENT button',
  help: 'On the TB-303 this writes an accent into the step being edited, and selects pattern section A. In this app, while it is lit every note you play is accented, so you can hear the ACCENT knob. The riffs carry their own accents.',
});
btn('seq.slide', 757, 388, 22, 15, {
  ui: false, module: 'glide', label: 'SLIDE', name: 'SLIDE button',
  help: 'On the TB-303 this writes a slide into the step being edited, and selects pattern section B. In this app, while it is lit every note glides from the one before. Without it, notes glide only when they overlap, as slid steps do in the riffs.',
});
text(636, 414, 'STEP', 12);
text(678, 414, '♪♪♪', 12);
text(717, 414, 'A', 12, { fill: RED, weight: 700 });
text(757, 414, 'B', 12, { fill: RED, weight: 700 });
text(737, 421, 'PATT. SECTION', 9, { fill: RED });
[[636, '9'], [678, '0'], [717, '100'], [757, '200']].forEach(([x, t]) => box(x, 436, t.length > 1 ? 20 : 13, 9, t, 12));

// back, write/next
box(820, 302, 14, 9, 'S', 13);
text(820, 318, 'BACK', 12);
btn('seq.back', 820, 338, 26, 14, {
  label: 'BACK', name: 'BACK', help: 'Steps back one note while checking or editing a pattern.',
});
box(820, 376, 18, 9, 'D.S.', 11);
btn('seq.write', 820, 396, 34, 18, {
  label: 'WRITE/NEXT', name: 'WRITE/NEXT (TAP)',
  help: 'Moves on to the next step while writing, writes a pattern into a track, and enters timing by tapping (TAP), held longer for a longer note.',
});
text(820, 418, 'WRITE/NEXT', 12);
text(820, 437, 'TAP', 12);

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x, y, w, h) => ({ x: X(x), y: Y(y), w: Math.round(w * K), h: Math.round(h * K) });
const areas = [
  { id: 'rear', label: 'Rear connections', module: 'patch', keywords: 'jacks sockets cv gate din sync headphones output mix in drum machine',
    rects: [R(124, 108, 80, 20), R(250, 108, 58, 30), R(655, 108, 216, 22)],
    help: 'The sockets along the back edge. CV and GATE let the sequencer play another synth; SYNC IN takes tempo from a Roland drum machine; MIX IN mixes another sound in before the outputs.' },
  { id: 'wave', label: 'Waveform', module: 'osc', keywords: 'oscillator vco saw square',
    rects: [R(204, 108, 46, 36)],
    help: 'The TB-303 has one oscillator, and this switch on the back edge chooses its waveform: sawtooth or square. Everything else about the tone is done by the filter.' },
  { id: 'tuning', label: 'Tuning', module: 'osc', keywords: 'pitch tune cents',
    rects: [R(308, 110, 63, 60)],
    help: 'TUNING moves the whole instrument up or down by up to about five semitones, to match other instruments. The notes themselves come from the sequencer.' },
  { id: 'filter', label: 'Filter', module: 'filter', keywords: 'cutoff resonance squelch env mod brightness acid',
    rects: [R(371, 110, 170, 60)],
    help: 'The resonant low-pass filter that makes the TB-303’s sound. CUT OFF FREQ sets its resting point, RESONANCE the squelch, and ENV MOD how far each note opens it. Turning these three while a pattern plays is how acid lines are performed.' },
  { id: 'envacc', label: 'Decay and accent', module: 'env', keywords: 'envelope decay accent wow length',
    rects: [R(541, 110, 114, 60)],
    help: 'DECAY sets how quickly the filter closes after each note. ACCENT sets how much accented steps stand out: they are louder, their filter decay is short whatever DECAY says, and they sweep the filter higher. The higher RESONANCE is, the bigger that sweep.' },
  { id: 'tempo', label: 'Tempo', module: 'mode', keywords: 'bpm speed clock',
    rects: [R(180, 178, 95, 100)],
    help: 'TEMPO sets the speed of the sequencer. Here it sets the speed of the riff.' },
  { id: 'track', label: 'Track and pattern group', module: 'mode', keywords: 'song chain group bank',
    rects: [R(290, 178, 105, 100)],
    help: 'Picks one of seven tracks (songs made of patterns) or one of four groups of patterns, depending on MODE. Not modelled: this app plays one riff per sound.' },
  { id: 'modesw', label: 'Mode', module: 'mode', keywords: 'write play pattern track',
    rects: [R(415, 178, 140, 100)],
    help: 'Chooses between writing and playing, for patterns or for tracks. Not modelled: there is no pattern memory here.' },
  { id: 'volume', label: 'Volume', module: 'out', keywords: 'level power',
    rects: [R(735, 178, 90, 100)],
    help: 'VOLUME sets the output level; it is also the power switch.' },
  { id: 'runclear', label: 'Clear and run', module: 'mode', keywords: 'start stop run clear reset',
    rects: [R(129, 291, 83, 134)],
    help: 'PATTERN CLEAR empties the pattern being written, and in a track resets it to the first measure. RUN/STOP starts and stops the sequencer; its lamp lights while it runs.' },
  { id: 'pitchfn', label: 'Pitch mode and function', module: 'mode', keywords: 'pitch entry normal mode function',
    rects: [R(214, 291, 70, 134)],
    help: 'A pattern is written in two passes. PITCH MODE is the first: each press of a key enters the next note. FUNCTION returns to normal mode, and held it gives the second functions.' },
  { id: 'keys', label: 'Note keys and pattern selectors', module: 'mode', keywords: 'keyboard notes pattern select selector transpose',
    rects: [R(285, 291, 330, 134)],
    help: 'Thirteen keys, one octave from C to C. In PITCH MODE they enter notes. The eight white keys double as PATTERN 1 to 8 and as digits for measure numbers, and C sharp and D sharp as DEL and INS for editing tracks. The on-screen keyboard plays the synth here.' },
  { id: 'timemode', label: 'Time mode, accent and slide', module: 'mode', keywords: 'timing note tie rest accent slide glide transpose octave',
    rects: [R(616, 291, 166, 134)],
    help: 'TIME MODE is the second pass of writing a pattern: each step becomes a note, a tie or a rest. TRANSPOSE DOWN and UP set octaves while entering pitches. ACCENT and SLIDE mark steps: an accent makes a note louder and sharper, and a slide glides into the next note without starting it again. Here ACCENT and SLIDE also work on the notes you play.' },
  { id: 'backwrite', label: 'Back and write', module: 'mode', keywords: 'next tap write step back',
    rects: [R(784, 291, 83, 134)],
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
    osc: [{ level: 0.8, mix: v['osc.wave'] === 'saw' ? { saw: 1 } : { pulse: 1 }, pw: 0.5, semi: v['osc.tuning'], kbd: true, syncTo: -1 }],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    // ENV MOD also pulls the filter's resting point down a little, as on the hardware
    filter: { type: 'ladder', mode: 'lp', cutoff: cutHz(v['filter.cutoff']) * Math.pow(2, -0.9 * env), res: res * 0.97, envAmt: 0.5 + env * 4, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.003, d: decay, s: 0, r: decay },
    env2: { a: 0.003, d: 3.5, s: 0, r: 0.012 },
    vca: { envSrc: 'env2', bias: 0 },
    acid: { thresh: 0.9, force: !!v['seq.accent'], decay: 0.2, rise: 0.012, fall: 0.06 + 0.35 * res, cut: acc * (0.6 + 2.6 * res), amp: acc * 0.9 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0.07, legato: !v['seq.slide'] },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
    normals: {},
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const presets = [
  {
    id: 'tb-first-squelch', name: 'First Squelch', ref: 'In the style of Phuture — "Acid Tracks"', artist: 'Phuture',
    tags: ['bass', 'acid', 'house', '80s'], level: 1,
    blurb: 'The classic acid line: a buzzy sawtooth that squelches on every note and shrieks on the accents.',
    how: 'One sawtooth goes through a resonant low-pass filter. The envelope flicks the filter open on each note and DECAY closes it again, and RESONANCE turns that movement into a squelch. Accented steps open the filter further and play louder, and slid steps glide into the next note.',
    phrase: acidPhrase(122, 'C2 C2 C3a C2 D#2s F2 C2 C2a G1 C2 A#1s C2 C3a C2 F2s D#2'),
    steps: [
      { title: 'A sawtooth, filter half open', module: 'osc', why: 'Everything starts with one oscillator. The sawtooth carries every harmonic, so it gives the filter the most to work on.\n- WAVEFORM sawtooth: bright and buzzy.\n- CUT OFF FREQ 3.5: fairly low, so between notes the sound is dark.\n- Listen for: play the riff. It is a dull, plodding bass for now.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 3.5, 'filter.res': 2, 'filter.envMod': 3, 'env.decay': 4 } },
      { title: 'Turn up the resonance', module: 'filter', why: 'RESONANCE boosts the frequencies at the cutoff point. On the TB-303 that is the squelch.\n- RESONANCE 8: a strong, vocal peak that follows the filter as it moves.\n- Listen for: each note now has a rubbery "yow". Turn RESONANCE back to 2 and the line goes plain again.',
        set: { 'filter.res': 8 } },
      { title: 'Let the envelope open it', module: 'filter', why: 'ENV MOD sets how far each note opens the filter before DECAY closes it. With high resonance that sweep is the acid sound.\n- ENV MOD 6: a big sweep on every note.\n- DECAY 3.5 (about 450 ms): each note closes fairly quickly, so the line stays tight.\n- Listen for: the squelch gets wider. Turn DECAY up and the notes smear into long "wows".',
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
      { id: 'env.decay', try: 'Turn up to 8', hear: 'Each note becomes a long, wet "wow".' },
      { id: 'osc.wave', try: 'Switch to square', hear: 'A hollower, rounder line with the same squelch.' },
    ],
  },
  {
    id: 'tb-round-bass', name: 'Round Pop Bass', ref: 'In the style of 1980s synth pop bass lines', artist: 'Various',
    tags: ['bass', 'pop', '80s'], level: 1,
    blurb: 'A soft, rounded bass, the job the TB-303 was sold for.',
    how: 'The square wave and a mostly closed filter with little resonance give a round, woody bass. A modest ENV MOD gives each note a soft thump at the front. Without heavy resonance the filter just shapes the tone.',
    phrase: acidPhrase(112, 'C2 . C2 . G1 . A#1 C2 . C2 D#2 . F2 . D#2 C2'),
    steps: [
      { title: 'Square wave', module: 'osc', why: 'The square wave has only odd harmonics, which makes it hollow and round compared with the sawtooth.\n- WAVEFORM square.\n- Listen for: play a few low notes. It sounds woody rather than buzzy.',
        set: { 'osc.wave': 'sq' } },
      { title: 'A dark, gentle filter', module: 'filter', why: 'The filter is kept low with little resonance, so it only rounds the tone.\n- CUT OFF FREQ 3, RESONANCE 1: soft and round.\n- ENV MOD 3, DECAY 3: a small thump at the start of each note.\n- Listen for: a bass that sits under a song instead of shouting over it.',
        set: { 'filter.cutoff': 3, 'filter.res': 1, 'filter.envMod': 3, 'env.decay': 3 } },
      { title: 'Light accents', module: 'env', why: 'This riff has no accented steps, so ACCENT only matters if you play with the ACCENT button lit.\n- ACCENT 3: a little extra punch when accents are used.',
        set: { 'amp.accent': 3 } },
    ],
    context: {
      'filter.cutoff': 'Keeps the bass round. Above about 5 it starts to buzz.',
      'filter.res': 'Kept low so the bass does not squelch.',
      'osc.wave': 'The square is what makes it round. The sawtooth is brighter.',
    },
    tweaks: [
      { id: 'filter.res', try: 'Raise to 6', hear: 'The bass starts to talk, a step towards acid.' },
      { id: 'filter.envMod', try: 'Turn to 0', hear: 'The thump goes and the notes are flat and smooth.' },
    ],
  },
  {
    id: 'tb-slide-acid', name: 'Sliding Acid Line', ref: 'In the style of Hardfloor — "Acperience 1"', artist: 'Hardfloor',
    tags: ['bass', 'acid', 'techno', '90s'], level: 2,
    blurb: 'A fast, winding line full of slides, with a long decay and high resonance.',
    how: 'Slides glide the pitch into the next step and do not start the envelope again, so a run of slid notes is one long squelch that bends through the pitches. A longer DECAY and high RESONANCE make that squelch wet and vocal, and accents punctuate it.',
    phrase: acidPhrase(136, 'C2s D#2 C2 C3as A#2s G2 C2 F2s G2 C2a C2 A#1s C2 D#2a C2s G2'),
    steps: [
      { title: 'Sawtooth and a low filter', module: 'osc', why: 'The usual acid start: a sawtooth through a filter that is mostly closed.\n- WAVEFORM sawtooth, CUT OFF FREQ 3.\n- Listen for: the riff is dull for now.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 3 } },
      { title: 'High resonance, long decay', module: 'filter', why: 'High resonance makes the filter sing, and a long DECAY lets that song carry through the slides.\n- RESONANCE 9, ENV MOD 5.\n- DECAY 6 (about 800 ms): the filter is still closing when the next note slides in.\n- Listen for: the slid notes run together into one bending wail.',
        set: { 'filter.res': 9, 'filter.envMod': 5, 'env.decay': 6 } },
      { title: 'Strong accents', module: 'env', why: 'Accents cut through the long notes with a short, loud, bright hit.\n- ACCENT 8.\n- Listen for: the accented notes snap even though the rest are smeared.',
        set: { 'amp.accent': 8 } },
    ],
    context: {
      'env.decay': 'Long here, so slides carry the squelch from one pitch to the next.',
      'filter.res': 'Near the top, so the line sings.',
      'amp.accent': 'The accents cut through the long notes.',
    },
    tweaks: [
      { id: 'seq.slide', try: 'Light SLIDE and play the keyboard', hear: 'Every note you play now glides from the last.' },
      { id: 'env.decay', try: 'Drop to 2', hear: 'The line becomes tight and stabbing, and the slides stand out more.' },
    ],
  },
  {
    id: 'tb-dark-rumble', name: 'Dark Rumble', ref: 'In the style of minimal acid techno', artist: 'Various',
    tags: ['bass', 'techno', 'acid'], level: 2,
    blurb: 'A low, nearly closed line where only the accents open up.',
    how: 'With the cutoff and ENV MOD low, ordinary notes stay dark and muffled. ACCENT is turned right up with high resonance, so only the accented steps break out with a bright yelp. The contrast is the groove.',
    phrase: acidPhrase(128, 'C2 C2 C2a C2 C2 C2 D#2a C2 C2 C2 C2a C2 F1 C2 G1a C2'),
    steps: [
      { title: 'Closed filter', module: 'filter', why: 'The filter starts almost shut, so ordinary notes are just a low thud.\n- CUT OFF FREQ 2, ENV MOD 1.5, DECAY 3.\n- Listen for: a dark, muted pulse.',
        set: { 'osc.wave': 'saw', 'filter.cutoff': 2, 'filter.envMod': 1.5, 'env.decay': 3 } },
      { title: 'Resonance for the accents', module: 'filter', why: 'RESONANCE also sets how far an accent pushes the filter. Raising it makes the accented notes jump much more than the rest.\n- RESONANCE 8.\n- Listen for: the accented steps start to poke out.',
        set: { 'filter.res': 8 } },
      { title: 'Accent right up', module: 'env', why: 'ACCENT at full makes the accented steps much louder and brighter.\n- ACCENT 10.\n- Listen for: a dark line punctuated by sharp yelps.',
        set: { 'amp.accent': 10 } },
    ],
    context: {
      'amp.accent': 'Does most of the work here. Turn it down and the line goes flat.',
      'filter.res': 'Sets how far each accent opens the filter.',
      'filter.cutoff': 'Kept low so only the accents are bright.',
    },
    tweaks: [
      { id: 'filter.res', try: 'Drop to 3', hear: 'The accents get louder but no longer yelp.' },
      { id: 'filter.envMod', try: 'Raise to 6', hear: 'Every note opens and the accents stop standing out.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'tb-303', name: 'TB-303', maker: 'Roland', year: 1981,
  heritage: 'The original Computer Controlled Bass Line, 1981–84',
  summary: 'One sawtooth or square oscillator → a resonant low-pass filter → a VCA, with a single decay envelope, accent and slide, played by a 16-step sequencer.',
  view: { w: 2103, h: 1000 },
  theme: { panel: '#d3d3cf', panel2: '#bdbdb9', ink: '#262626', font: 'helv', cheeks: 'none', cheekW: 0, knobRing: true },
  signalNames: { env1: 'the filter envelope', env2: 'the volume envelope', kbd: 'the pitch CV', gate: 'the gate', out: 'the output' },
  tempo: 'seq.tempo',
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
