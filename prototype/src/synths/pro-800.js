// Behringer PRO-800 — SynthDef. Positions are in view units: 2 × the pixels of the 1200 × 1200 product photo, measured from
// the left end of the wooden cheek (x 79) and the top of the faceplate (y 413). The data model is the PRO-800 synth.json
// (Quick Start Guide, 62 numbered controls; envelope and LFO figures computed from the GliGli firmware it descends from).
//
// Eight voices, each a full copy of the voice: two oscillators with switchable waveforms, noise, a 24 dB low-pass filter,
// two ADSR envelopes and Poly-Mod. The programmer (keypad, display, menus, sequencer) is printed as artwork; of its buttons
// only ARP UP-DN and ARP ASSIGN are modelled. Menu settings keep their factory defaults (see src/lib/limits.js).
import { annotate, clamp, expMap, pwl, level10, fmtTime, fmtHz } from '@/lib/maps.js';
import lineage from '@/synths/lineage/pro-800.js';
import unusual from '@/synths/unusual/pro-800.js';
import moreSounds from '@/synths/sounds/pro-800.js';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// Envelope stage times: the GliGli firmware's fast exponential table (0.5 ms to 37.4 s). Behringer is reported to have
// made the envelopes snappier since, so these are the ancestor's figures. LFO 0.08–20 Hz is from the specifications.
// Cutoff range, resonance law, glide times and the modulation depths are this app's estimates.
const ENV_PTS = [[0, 0.0005], [2.5, 0.016], [5, 0.22], [7.5, 2.8], [10, 37.4]];
const envTime = (v) => pwl(v, ENV_PTS, true);
const lfoHz = (v) => expMap(v / 10, 0.08, 20);
const vcfHz = (v) => expMap(v / 10, 16, 20000);
const glideTime = (v) => 4 * Math.pow(v / 10, 2);
/** FREQUENCY steps in octaves by default (the menu can change that): five positions, two octaves either side of the middle. */
const octaves = (v) => Math.round((v - 5) * 0.4) || 0;
const pct = (v) => `${Math.round(v * 10)} %`;
const signed = (v) => (Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);

const controls = [];
const decor = [];
const INK = '#f1f1ee';

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x, y, t, size = 14, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
/** Text centred on y (the renderer places text by its baseline). */
const label = (x, y, t, size = 14, rest = {}) => text(x, y + size * 0.36, t, size, rest);
/** A name with a short rule either side: —— SHAPE ——. */
const rule = (cx, y, t, x0, x1, size = 14) => {
  const half = (t.length * size * 0.62) / 2 + 8;
  decor.push({ t: 'line', x1: x0, y1: y, x2: cx - half, y2: y, w: 2 });
  decor.push({ t: 'line', x1: cx + half, y1: y, x2: x1, y2: y, w: 2 });
  label(cx, y, t, size);
};

const UNI = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, numR: 1.8, tickR: 1.3, size: 11 };
const BI = {
  ticks: 11, numR: 1.8, tickR: 1.3, size: 11,
  labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({ at, text: at === -5 ? '−5' : at === 5 ? '+5' : String(Math.abs(at)) })),
};
/** A knob; `lab` is the printed name under it, `ly` the centre of that name. */
const knob = (id, x, y, lab, ly, rest) => {
  const bi = rest.min === -5;
  controls.push({ id, type: 'knob', x, y, r: 26, style: 'pro1', kind: 'cont', min: 0, max: 10, def: 0, label: lab.replace('\n', ' '), labelPos: 'none', scale: bi ? BI : UNI, ...rest });
  if (ly) label(x, ly, lab);
};
/** A vertical slide switch, on (or the first option) at the top. */
const slide = (id, x, y, rest) => controls.push({ id, type: 'slide', x, y, w: 20, h: 55, orient: 'v', kind: 'bool', def: false, labelPos: 'none', ...rest });

// ── Faceplate artwork ─────────────────────────────────────────────────────
[[70, 23], [702, 19], [1380, 19], [2009, 19], [70, 627], [702, 632], [1380, 632], [2009, 627]].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 9 }));
decor.push({ t: 'frame', x: 619, y: 41, w: 717, h: 137, r: 14, label: 'OSCILLATOR A', labelSize: 19 });
decor.push({ t: 'frame', x: 619, y: 187, w: 717, h: 133, r: 14, label: 'OSCILLATOR B', labelSize: 19 });
decor.push({ t: 'frame', x: 619, y: 330, w: 551, h: 136, r: 14, label: 'POLY-MOD', labelSize: 19, labelX: 978 });
decor.push({ t: 'frame', x: 1186, y: 330, w: 146, h: 136, r: 14, labelAt: 'none' });
decor.push({ t: 'frame', x: 619, y: 476, w: 551, h: 134, r: 14, label: 'LFO-MOD', labelSize: 19, labelX: 978 });
decor.push({ t: 'frame', x: 1186, y: 476, w: 146, h: 134, r: 14, labelAt: 'none' });
decor.push({ t: 'frame', x: 1356, y: 186, w: 530, h: 280, r: 14, label: 'FILTER', labelSize: 19, labelX: 1620 });
decor.push({ t: 'frame', x: 1356, y: 476, w: 530, h: 134, r: 14, label: 'AMPLIFIER', labelSize: 19, labelX: 1620 });
text(1354, 62, 'ANALOG  8-VOICE POLYPHONIC SYNTHESIZER', 18, { anchor: 'start', spacing: '0.035em' });
decor.push({ t: 'din', x: 1810, y: 104, r: 38 });
label(1810, 164, 'MIDI IN', 13);
decor.push({ t: 'logo', x: 1967, y: 140, size: 34, text: 'behringer', style: 'behringer' });
decor.push({ t: 'led', x: 1967, y: 393, r: 6.5, color: 'red', litWhen: 'power' });
label(1967, 414, 'POWER', 11);

// Programmer: the inset panel, display, keypad and buttons. Printed only, apart from the two ARP buttons.
decor.push({ t: 'rect', x: 84, y: 63, w: 521, h: 527, r: 12, fill: '#1f1f20', stroke: '#141415', sw: 2, hw: true });
label(203, 76, 'PROGRAM', 13);
decor.push({ t: 'rect', x: 104, y: 89, w: 197, h: 72, r: 4, fill: '#1b1516', hw: true });
text(202, 151, 'P800', 68, { fill: '#ff3a4c', weight: 500, spacing: '0.1em', hw: true });
decor.push({ t: 'line', x1: 311, y1: 86, x2: 311, y2: 564, w: 2.4 });
decor.push({ t: 'rect', x: 352, y: 86, w: 202, h: 49, r: 8, fill: '#f3f3f1', stroke: INK, sw: 1.5 });
text(453, 122, 'PRO-800', 34, { fill: '#18181a', weight: 600, spacing: '0.04em' });
[182, 254, 326].forEach((y) => decor.push({ t: 'line', x1: 328, y1: y, x2: 579, y2: y, w: 2.4 }));
const KEY = { w: 51, h: 51 };
/** A printed button: the rounded cap with its white rim, and the corner lamp when it has one. */
const capArt = (x, y, cap, size, lamp) => {
  decor.push({ t: 'rect', x: x - KEY.w / 2, y: y - KEY.h / 2, w: KEY.w, h: KEY.h, r: 8, fill: '#161618', stroke: INK, sw: 2.4 });
  if (lamp) decor.push({ t: 'led', x: x - KEY.w / 2 + 8, y: y - KEY.h / 2 + 8, r: 3.6, color: 'red' });
  const lines = cap.split('\n').length;
  text(x, y - ((lines - 1) * size * 1.08) / 2 + size * 0.36, cap, size, { weight: 700 });
};
[['1', 137, 217], ['2', 203, 217], ['3', 270, 217], ['4', 137, 290], ['5', 203, 290], ['6', 270, 290],
  ['7', 137, 362], ['8', 203, 362], ['9', 270, 362], ['0', 203, 435]].forEach(([n, x, y]) => capArt(x, y, n, 30));
label(203, 486, 'PROGRAM SELECT', 13);
[['PRESET', 354, 217], ['PERF', 421, 217], ['SETTINGS', 486, 217], ['TUNE', 552, 217], ['SYNC\nSOURCE', 354, 290],
  ['SYNC\nCLOCK', 453, 290], ['SEQ\n1', 354, 362], ['SEQ\n2', 421, 362]].forEach(([t, x, y]) => capArt(x, y, t, 10, true));
decor.push({ t: 'rect', x: 552 - KEY.w / 2, y: 290 - KEY.h / 2, w: KEY.w, h: KEY.h, r: 8, fill: '#e3252b', stroke: '#ff6b6b', sw: 2.4, hw: true });
label(552, 290, 'REC', 11, { weight: 700 });
decor.push({ t: 'circle', x: 453, y: 494, r: 34, fill: '#0b0b0c', stroke: '#2a2b2e', sw: 2, hw: true });
decor.push({ t: 'circle', x: 453, y: 494, r: 27, fill: 'url(#kysBlack)', stroke: '#3a3b3f', sw: 1.5 });
label(453, 552, 'VALUE', 13);

// Jacks along the top: little arrows show which way the signal goes.
[[1416, 'down', 'SYNC IN'], [1510, 'down', 'FILTER CV IN'], [1605, 'up', 'PHONES'], [1699, 'up', 'AUDIO OUT']].forEach(([x, dir, t]) => {
  decor.push({ t: 'arrow', x, y: 72, dir, size: 5 });
  label(x, 144, t, 11);
});

// ── Oscillator A ──────────────────────────────────────────────────────────
const OSC_FREQ = (n) => ({
  def: 5, module: 'osc', fmt: (v) => (octaves(v) === 0 ? 'played note' : `${octaves(v) > 0 ? '+' : '−'}${Math.abs(octaves(v))} oct`),
  name: `OSC ${n} frequency`,
});
knob('osc1.freq', 695, 100, 'FREQUENCY', 164, {
  ...OSC_FREQ('A'),
  help: 'Pitch of OSC A in whole octaves: two octaves down or up from the middle, which plays the key’s own note. With SYNC on it changes the tone of OSC A instead of its note.',
});
slide('osc1.sync', 822, 112, {
  label: 'SYNC', name: 'OSC A sync', module: 'osc',
  help: 'Hard sync: OSC A restarts every time OSC B starts a cycle, so OSC B sets the note and OSC A’s FREQUENCY changes only the tone. Raise OSC A above OSC B for a hard, tearing sound.',
});
label(822, 75, 'SYNC', 11);
label(822, 152, 'OFF', 11);
const WAVES = [['saw', 917, 'saw', 'sawtooth', 'Bright and buzzy, with every harmonic: the usual starting point for brass, strings and bass.'],
  ['tri', 979, 'tri', 'triangle', 'Soft and hollow, close to a sine: flutes, soft keys and bells.'],
  ['pulse', 1042, 'pulse', 'pulse', 'Hollow at 5 on PULSE WIDTH (a square wave) and thinner and more nasal as the width moves away from the middle.']];
const waveSwitches = (n, osc, y, glyphY) => WAVES.forEach(([w, x, glyph, name, what]) => {
  slide(`osc${n}.${w}`, x, y, {
    def: w === 'saw', label: `OSC ${osc} ${name}`, name: `OSC ${osc} ${name}`, module: 'osc',
    help: `Switches OSC ${osc}’s ${name} wave on. ${what} The three switches can be on together, and their waves add up.`,
  });
  decor.push({ t: 'wave', x, y: glyphY, size: 9, shape: glyph, w: 2.4 });
});
waveSwitches(1, 'A', 112, 73);
rule(979, 154, 'SHAPE', 917, 1042);
knob('osc1.pw', 1137, 100, 'PULSE WIDTH', 164, {
  def: 5, name: 'OSC A pulse width', module: 'osc', fmt: (v) => `${Math.round(3 + 9.4 * v)} %`,
  help: 'Width of OSC A’s pulse wave. At 5 it is a square, hollow like a clarinet; towards either end it narrows to a thin, reedy pulse. Only heard with the pulse switch on.',
});
knob('osc1.level', 1262, 100, 'LEVEL', 164, {
  def: 5, name: 'OSC A level', module: 'mixer', fmt: pct,
  help: 'How loud OSC A is going into the filter. Up to about 5 it is clean; above that it drives the filter harder, which adds grit and thickness.',
});

// ── Oscillator B ──────────────────────────────────────────────────────────
knob('osc2.freq', 695, 248, 'FREQUENCY', 308, {
  ...OSC_FREQ('B'),
  help: 'Pitch of OSC B in whole octaves: two octaves down or up from the middle. It is also the note OSC A follows when SYNC is on, and a modulation source for Poly-Mod.',
});
knob('osc2.fine', 822, 248, 'FINE', 308, {
  min: -5, max: 5, def: 0, name: 'OSC B fine tune', module: 'osc', fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} cents`,
  help: 'Tunes OSC B slightly flat or sharp of OSC A, up to a semitone either way. A little off the middle makes the two beat against each other, which thickens every note.',
});
waveSwitches(2, 'B', 256, 219);
rule(979, 298, 'SHAPE', 917, 1042);
knob('osc2.pw', 1137, 248, 'PULSE WIDTH', 308, {
  def: 5, name: 'OSC B pulse width', module: 'osc', fmt: (v) => `${Math.round(3 + 9.4 * v)} %`,
  help: 'Width of OSC B’s pulse wave. At 5 it is a square; towards either end it narrows to a thin, reedy pulse. Only heard with the pulse switch on.',
});
knob('osc2.level', 1262, 248, 'LEVEL', 308, {
  def: 0, name: 'OSC B level', module: 'mixer', fmt: pct,
  help: 'How loud OSC B is going into the filter. At 0 OSC B still runs, so it can still sync OSC A and feed Poly-Mod without being heard.',
});

// ── Poly-Mod ──────────────────────────────────────────────────────────────
knob('pmod.env', 695, 394, 'FIL ENV', null, {
  min: -5, max: 5, def: 0, name: 'Poly-Mod filter envelope amount', module: 'mod', fmt: signed,
  help: 'How much of the filter envelope goes to the Poly-Mod destinations. Zero is in the middle; turn right for a sweep that follows the envelope, left for one that moves the other way.',
});
knob('pmod.oscb', 822, 394, 'OSC B', null, {
  name: 'Poly-Mod OSC B amount', module: 'mod', fmt: pct,
  help: 'How much of OSC B goes to the Poly-Mod destinations. OSC B runs at audio speed, so on FREQ A it gives bell and metal tones (frequency modulation), and on FILTER a growl.',
});
rule(758, 454, 'SOURCE AMOUNT', 664, 853, 14);
slide('pmod.freqA', 978, 404, {
  label: 'FREQ A', name: 'Poly-Mod to OSC A frequency', module: 'mod',
  help: 'Sends Poly-Mod to OSC A’s pitch. With FIL ENV it bends OSC A at the start of each note (with SYNC on, a sweep of tone); with OSC B it gives metallic, bell-like frequency modulation.',
});
slide('pmod.filter', 1042, 404, {
  label: 'FILTER', name: 'Poly-Mod to the filter', module: 'mod',
  help: 'Sends Poly-Mod to the filter cutoff. FIL ENV here adds to the filter’s own envelope amount; OSC B here roughens the tone with audio-rate filter modulation.',
});
label(978, 364, 'FREQ A', 11);
label(1042, 364, 'FILTER', 11);
label(1010, 443, 'DESTINATION', 14);
slide('voice.unison', 1137, 404, {
  label: 'UNISON TRACK', module: 'mode',
  help: 'Puts all eight voices on one key, slightly detuned, so the synth plays one very thick note at a time. On the hardware, pressing it with a chord held gives chord memory instead; here it is always unison.',
});
label(1137, 352, 'UNISON', 11);
label(1137, 364, 'TRACK', 11);
label(1137, 443, 'OFF', 11);
knob('noise.level', 1262, 394, 'NOISE', 453, {
  module: 'mixer', fmt: pct,
  help: 'How much white noise goes into the filter: a little adds breath to a pad, a lot gives wind, surf and snare sounds.',
});
// the two source knobs are named after the last number of their scale: +5 FIL ENV, 10 OSC B
text(731, 443, 'FIL ENV', 11, { anchor: 'start' });
text(857, 443, 'OSC B', 11, { anchor: 'start' });

// ── LFO-Mod ───────────────────────────────────────────────────────────────
knob('lfo.rate', 695, 538, 'FREQUENCY', 598, {
  def: 5, name: 'LFO frequency', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 12 seconds up to 20 Hz. Around 7 to 7.5 is a natural vibrato speed.',
});
slide('lfo.shape', 790, 534, {
  kind: 'enum', def: 'tri', options: [{ v: 'tri', label: 'TRIANGLE' }, { v: 'pulse', label: 'PULSE' }], label: 'SHAPE', name: 'LFO shape', module: 'lfo',
  help: 'The LFO’s shape: up for a triangle, which sweeps smoothly back and forth; down for a pulse, which jumps between two values (a trill on pitch).',
});
[[773, 'tri'], [790, 'sine'], [808, 'saw']].forEach(([x, shape]) => decor.push({ t: 'wave', x, y: 498, size: 6, shape, w: 2 }));
[[773, 'sq'], [790, 'tmod'], [808, 'noise']].forEach(([x, shape]) => decor.push({ t: 'wave', x, y: 577, size: 6, shape, w: 2 }));
label(790, 598, 'SHAPE');
knob('lfo.amount', 884, 538, 'INITIAL AMOUNT', 598, {
  name: 'LFO initial amount', module: 'mod', fmt: pct,
  help: 'How strongly the LFO moves the destinations switched on beside it, without touching the mod wheel. The mod wheel adds more on top.',
});
slide('lfo.freq', 1011, 540, {
  label: 'FREQ A-B', name: 'LFO to oscillator frequency', module: 'mod',
  help: 'Lets the LFO move the pitch of both oscillators: a little is vibrato, more is a siren or, with the pulse shape, a trill.',
});
slide('lfo.pw', 1073, 540, {
  label: 'PW A-B', name: 'LFO to pulse width', module: 'mod',
  help: 'Lets the LFO sweep the pulse width of both oscillators, which makes pulse waves shimmer like a string section. Only heard on oscillators with the pulse switch on.',
});
slide('lfo.filter', 1137, 540, {
  label: 'FILTER', name: 'LFO to the filter', module: 'mod',
  help: 'Lets the LFO sweep the filter cutoff: slowly for a sound that opens and closes, quickly for a wah-wah or a growl.',
});
[[1011, 'FREQ A-B'], [1073, 'PW A-B'], [1137, 'FILTER']].forEach(([x, t]) => label(x, 500, t, 11));
label(1073, 578, '- DESTINATION -', 14);
knob('glide.time', 1262, 538, 'GLIDE', 598, {
  name: 'Glide', module: 'glide', fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Makes the pitch slide from one note to the next instead of jumping. It works on every voice, so chords smear into each other; with UNISON TRACK it is a classic lead glide.',
});

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 1432, 248, 'CUTOFF', 308, {
  def: 7, module: 'filter', fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the 24 dB low-pass filter. Down makes the sound darker and duller; up lets all the brightness through.',
});
knob('vcf.res', 1558, 248, 'RESONANCE', 308, {
  module: 'filter', fmt: pct,
  help: 'A boost right at the cutoff that makes sweeps sound vocal and squelchy. Near the top the filter whistles on its own.',
});
knob('vcf.env', 1684, 248, 'ENVELOPE\nAMOUNT', 308, {
  min: -5, max: 5, def: 0, name: 'Filter envelope amount', module: 'filter', fmt: signed,
  help: 'How far the filter envelope moves the cutoff on each note. Zero is in the middle; right opens the filter as the envelope rises, left closes it.',
});
slide('vcf.kbd', 1810, 258, {
  kind: 'enum', def: 'half', options: [{ v: 'full', label: 'FULL' }, { v: 'half', label: '1/2' }, { v: 'off', label: 'OFF' }],
  label: 'KEYBOARD', name: 'Filter keyboard tracking', module: 'filter',
  help: 'How far the cutoff follows the notes you play. OFF keeps it still, so high notes sound duller; 1/2 follows half way; FULL follows exactly, so a whistling filter plays in tune.',
});
[['FULL', 239], ['1/2', 263], ['OFF', 287]].forEach(([t, y]) => text(1827, y, t, 11, { anchor: 'start' }));
label(1810, 308, 'KEYBOARD');

// ── Envelopes ─────────────────────────────────────────────────────────────
const STAGES = [
  ['attack', 'ATTACK', 1432, 'how long it takes to rise to full after a key is pressed'],
  ['decay', 'DECAY', 1558, 'how long it takes to fall from the peak to the sustain level'],
  ['sustain', 'SUSTAIN', 1684, 'the level it holds while the key is held down'],
  ['release', 'RELEASE', 1810, 'how long it takes to fade to nothing after the key is let go'],
];
const ENV_DEF = { fenv: [0, 5, 5, 4], aenv: [0, 5, 10, 4] };
[['fenv', 394, 452, 'Filter envelope', 'the filter cutoff (by ENVELOPE AMOUNT) and Poly-Mod (by FIL ENV)'],
  ['aenv', 539, 597, 'Amplifier envelope', 'the volume of each note']].forEach(([e, y, ly, full, what]) => {
  STAGES.forEach(([stage, top, x, help], i) => {
    const isTime = stage !== 'sustain';
    knob(`${e}.${stage}`, x, y, top, ly, {
      def: ENV_DEF[e][i], name: `${full} ${stage}`, module: e === 'fenv' ? 'env' : 'amp',
      fmt: isTime ? (v) => fmtTime(envTime(v)) : pct,
      help: `${full}: ${help}. It shapes ${what}.${isTime ? ' Times run from half a millisecond to about 37 seconds.' : ''}`,
    });
  });
});

// ── Output ────────────────────────────────────────────────────────────────
knob('out.tune', 1968, 248, 'MASTER TUNE', 308, {
  min: -5, max: 5, def: 0, module: 'out', fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} cents`,
  help: 'Tunes the whole synth up or down by up to a semitone.',
});
knob('out.volume', 1967, 539, 'VOLUME', 597, {
  def: 7, module: 'out', fmt: pct,
  help: 'Master output level.',
});

// ── Programmer: the two arpeggiator buttons ───────────────────────────────
const arpButton = (id, x, cap, rest) => controls.push({
  id, type: 'button', face: 'ring', x, y: 362, ...KEY, kind: 'bool', def: false, caption: cap, captionSize: 10, labelPos: 'none', module: 'mode', ...rest,
});
arpButton('arp.updn', 486, 'ARP\nUP-DN', {
  label: 'ARP UP-DN', name: 'Arpeggiator (up and down)',
  help: 'Turns the arpeggiator on: hold a chord and its notes play one at a time, from the lowest key up to the highest and back down, at 120 BPM. Its lamp lights while it is on.',
});
arpButton('arp.assign', 552, 'ARP\nASSIGN', {
  label: 'ARP ASSIGN', name: 'Arpeggiator (played order)',
  help: 'Turns the arpeggiator on in the order you pressed the keys, rather than by pitch. If ARP UP-DN is lit as well, UP-DN wins here.',
});

// ── Jacks ─────────────────────────────────────────────────────────────────
const jacks = [
  { id: 'j.sync_in', x: 1416, y: 104, r: 15, label: 'SYNC IN', labelPos: 'none', dir: 'in', dest: null,
    help: 'A clock input for the arpeggiator and sequencer, from a drum machine or another sequencer. Not modelled here: a cable can be drawn but does nothing.' },
  { id: 'j.filter_cv', x: 1510, y: 104, r: 15, label: 'FILTER CV IN', labelPos: 'none', dir: 'in', dest: 'cutoff', amt: 5, add: true,
    help: 'A control voltage (0 to 10 V) added to the cutoff of all eight filters. On the hardware its depth is set in the global settings; here a full-scale signal moves the cutoff five octaves.' },
  { id: 'j.phones', x: 1605, y: 104, r: 15, label: 'PHONES', labelPos: 'none', dir: 'out', signal: 'out',
    help: 'Headphone output: the same sound as the main output.' },
  { id: 'j.audio_out', x: 1699, y: 104, r: 15, label: 'AUDIO OUT', labelPos: 'none', dir: 'out', signal: 'out',
    help: 'The synth’s audio output on a small jack (the rear panel has a full-size one). In a Eurorack case this is the only output.' },
];

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const areas = [
  { id: 'program', label: 'Programs', module: 'util', keywords: 'display keypad preset memory bank number',
    rects: [R(33, 0, 318, 652)],
    help: 'The display and the number keys. On the hardware they choose one of 400 stored programs and edit the settings in the menus. Printed only: this app keeps its sounds in the library instead.' },
  { id: 'programmer', label: 'Programmer', module: 'util', keywords: 'arpeggiator arp latch sequencer record tempo clock menu settings perf tune',
    rects: [R(318, 0, 612, 652)],
    help: 'The function buttons and the VALUE encoder. ARP UP-DN and ARP ASSIGN start the arpeggiator, playing held notes one at a time in pitch order or in the order you pressed them. PRESET, PERF, SETTINGS, TUNE, the sync and sequencer buttons and REC are printed but not modelled.' },
  { id: 'oscA', label: 'Oscillator A', module: 'osc', keywords: 'vco sawtooth triangle pulse square pwm sync waveform octave',
    rects: [R(612, 0, 1343, 182)],
    help: 'The first oscillator in each voice. FREQUENCY sets its octave; the three SHAPE switches turn the sawtooth, triangle and pulse on, alone or together; PULSE WIDTH shapes the pulse and LEVEL sets how loud it is. SYNC locks it to OSC B.' },
  { id: 'oscB', label: 'Oscillator B', module: 'osc', keywords: 'vco detune fine sawtooth triangle pulse waveform octave',
    rects: [R(612, 182, 1343, 325)],
    help: 'The second oscillator, laid out like OSC A with FINE in place of the sync switch, to detune it against OSC A. It is also a modulation source: it drives Poly-Mod and is the note OSC A follows when synced.' },
  { id: 'pmod', label: 'Poly-Mod', module: 'mod', keywords: 'fm frequency modulation cross modulation sync sweep bell metallic',
    rects: [R(612, 325, 1100, 471)],
    help: 'Modulation inside each voice. FIL ENV and OSC B set how much of the filter envelope and of OSC B are mixed; FREQ A and FILTER send the mix to OSC A’s pitch, the filter cutoff, or both. Because every voice has its own, chords stay in tune.' },
  { id: 'voices', label: 'Unison', module: 'mode', keywords: 'unison stack mono chord memory voices detune',
    rects: [R(1100, 325, 1178, 471)],
    help: 'UNISON TRACK stacks all eight voices on one note, detuned against each other, for a single very thick note: leads and basses.' },
  { id: 'noise', label: 'Noise', module: 'mixer', keywords: 'white noise hiss breath wind',
    rects: [R(1178, 325, 1343, 471)],
    help: 'The NOISE level into the filter, alongside the two oscillator LEVEL knobs.' },
  { id: 'lfo', label: 'LFO-Mod', module: 'lfo', keywords: 'lfo vibrato wah tremolo pwm trill mod wheel',
    rects: [R(612, 471, 1178, 652)],
    help: 'One LFO for all the voices. FREQUENCY sets its speed and SHAPE picks triangle or pulse. INITIAL AMOUNT sets how strongly it moves the destinations switched on: both oscillators’ pitch, both pulse widths and the filter. The mod wheel adds more.' },
  { id: 'glide', label: 'Glide', module: 'glide', keywords: 'portamento slide',
    rects: [R(1178, 471, 1343, 652)],
    help: 'GLIDE makes each voice slide from its last note to the next instead of jumping.' },
  { id: 'top', label: 'Connections', module: 'out', keywords: 'jacks output headphones midi clock cv',
    rects: [R(1343, 0, 2051, 182)],
    help: 'The sockets: SYNC IN for an external clock, FILTER CV IN to move all eight filters from another device, PHONES, AUDIO OUT and MIDI IN.' },
  { id: 'filter', label: 'Filter', module: 'filter', keywords: 'vcf cutoff resonance low-pass 24 db keyboard tracking brightness',
    rects: [R(1343, 182, 1893, 325)],
    help: 'A 24 dB low-pass filter in each voice. CUTOFF sets the brightness and RESONANCE the emphasis at the cutoff. ENVELOPE AMOUNT sets how far the filter envelope moves it, either way from the middle, and KEYBOARD how far it follows the notes.' },
  { id: 'fenv', label: 'Filter envelope', module: 'env', keywords: 'adsr attack decay sustain release contour eg',
    rects: [R(1343, 325, 1893, 471)],
    help: 'An ADSR envelope, one per voice, that moves the filter by ENVELOPE AMOUNT and feeds Poly-Mod through FIL ENV.' },
  { id: 'aenv', label: 'Amplifier', module: 'amp', keywords: 'adsr vca volume loudness attack decay sustain release',
    rects: [R(1343, 471, 1893, 652)],
    help: 'The ADSR envelope that shapes the volume of every note: how quickly it starts, how it falls to the level it holds, and how long it takes to die away after the key is let go.' },
  { id: 'master', label: 'Master', module: 'out', keywords: 'volume tuning power',
    rects: [R(1893, 182, 2051, 652)],
    help: 'MASTER TUNE and VOLUME for the whole synth, and the power lamp.' },
];
annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const envOf = (v, e) => ({ a: envTime(v[`${e}.attack`]), d: envTime(v[`${e}.decay`]), s: v[`${e}.sustain`] / 10, r: envTime(v[`${e}.release`]) });
const oscOf = (v, n) => ({
  level: 0.34 * (v[`osc${n}.level`] / 5),
  mix: { saw: v[`osc${n}.saw`] ? 1 : 0, tri: v[`osc${n}.tri`] ? 1 : 0, pulse: v[`osc${n}.pulse`] ? 1 : 0 },
  pw: 0.03 + 0.094 * v[`osc${n}.pw`],
});

function toEngine(v, ctx) {
  const routes = [];
  const route = (src, dst, amt) => { if (amt !== 0) routes.push({ src, dst, amt }); };
  // Poly-Mod: the filter envelope (either way) and OSC B, summed, to OSC A pitch and/or the filter, inside each voice
  const pe = v['pmod.env'] / 5;
  const pb = v['pmod.oscb'] / 10;
  if (v['pmod.freqA']) {
    route('env1', 'pitch1', Math.sign(pe) * 48 * pe * pe);
    route('osc2', 'pitch1', 24 * pb * pb);
  }
  if (v['pmod.filter']) {
    route('env1', 'cutoff', 5 * pe);
    route('osc2', 'cutoff', 4 * pb);
  }
  // LFO: INITIAL AMOUNT plus the mod wheel sets the depth
  const d = clamp(v['lfo.amount'] / 10 + (ctx.wheel || 0), 0, 1);
  if (v['lfo.freq']) {
    route('lfo', 'pitch1', 12 * d * d);
    route('lfo', 'pitch2', 12 * d * d);
  }
  if (v['lfo.pw']) {
    route('lfo', 'pw1', 0.45 * d);
    route('lfo', 'pw2', 0.45 * d);
  }
  if (v['lfo.filter']) route('lfo', 'cutoff', 4 * d);

  const unison = !!v['voice.unison'];
  const arpOn = !!(v['arp.updn'] || v['arp.assign']);
  return {
    osc: [
      { ...oscOf(v, 1), semi: 12 * octaves(v['osc1.freq']), kbd: true, syncTo: v['osc1.sync'] ? 1 : -1 },
      { ...oscOf(v, 2), semi: 12 * octaves(v['osc2.freq']) + v['osc2.fine'] / 5, kbd: true, syncTo: -1 },
    ],
    noise: { level: level10(v['noise.level'], 0.8), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'ladder', mode: 'lp', cutoff: vcfHz(v['vcf.cutoff']), res: (v['vcf.res'] / 10) * 1.08,
      envAmt: (v['vcf.env'] / 5) * 7, envSrc: 'env1', kbd: { off: 0, half: 0.5, full: 1 }[v['vcf.kbd']],
    },
    env1: envOf(v, 'fenv'), env2: envOf(v, 'aenv'),
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: v['lfo.shape'] === 'pulse' ? { sq: 1 } : { tri: 1 }, keySync: false },
    glide: { time: glideTime(v['glide.time']), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: { voices: 8, stack: unison ? 8 : 1, mono: unison, detune: unison ? 0.1 : 0 },
    arp: { on: arpOn, bpm: 120, gate: 0.5, mode: v['arp.updn'] ? 'updown' : 'played', octaves: 1, hold: false },
    routes,
    normals: {},
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: v['out.tune'] / 5,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const ENV = (e, a, dd, s, r) => ({ [`${e}.attack`]: a, [`${e}.decay`]: dd, [`${e}.sustain`]: s, [`${e}.release`]: r });
const presets = [
  {
    id: 'p8-sync-lead', name: 'Sync Sweep Lead', ref: 'In the style of The Cars — "Let’s Go"', artist: 'The Cars',
    tags: ['lead', 'new wave', '70s'], level: 2,
    blurb: 'A tearing lead whose tone sweeps down at the start of every note.',
    how: 'SYNC makes OSC A restart with every cycle of OSC B, so OSC B holds the note and OSC A’s pitch only changes the tone. Poly-Mod sends the filter envelope to OSC A’s frequency: each note starts with OSC A far above OSC B and sweeps down, which is the tearing sound. UNISON TRACK stacks the voices on the one note.',
    phrase: { bpm: 120, loop: true, steps: [[0, 64, 0.45], [0.5, 67, 0.45], [1, 69, 0.9], [2, 72, 0.45], [2.5, 71, 0.45], [3, 67, 0.9]] },
    steps: [
      { title: 'OSC A alone, synced to OSC B', module: 'osc', why: 'Hard sync is the core of this lead. OSC A is locked to OSC B, which sets the note while staying silent, so from here on OSC A’s pitch changes only its tone.\n- SYNC on: OSC A restarts its wave every time OSC B starts a cycle. On the PRO-800 it is OSC A that follows OSC B, the reverse of many synths.\n- OSC A LEVEL 6 (60 %): just past 5, where the level starts to drive the filter, so the sawtooth picks up a little grit. Back to 5 for a cleaner tone.\n- OSC B LEVEL 0: not heard, but still running and still setting the note OSC A follows.\n- Listen for: very little change yet. Both oscillators sit at the same octave, so sync has nothing to tear. Turn OSC A FREQUENCY up a step and the tone turns hard and nasal while the note stays put.',
        set: { 'osc1.sync': true, 'osc1.level': 6, 'osc2.level': 0 } },
      { title: 'Sweep OSC A with Poly-Mod', module: 'mod', why: 'Poly-Mod is the Prophet’s name for modulation inside each voice. Here it uses the filter envelope to push OSC A’s pitch up at the start of every note; because OSC A is synced, that pitch sweep is heard as a sweep of tone.\n- FIL ENV +3: how much filter envelope goes into Poly-Mod. At +3 it throws OSC A more than an octave above OSC B at the peak. Left of the middle would push it down instead.\n- FREQ A on: sends the Poly-Mod mix to OSC A’s pitch. Off, and the envelope does nothing to the oscillators.\n- Listen for: a tearing “neow” at the front of each note as OSC A falls back towards OSC B. The filter envelope still has its default 50 % sustain, so held notes stay part way up the sweep. ENVELOPE AMOUNT is still 0, so the filter itself is not moving.',
        set: { 'pmod.env': 3, 'pmod.freqA': true } },
      { title: 'Make the envelope a falling sweep', module: 'env', why: 'The filter envelope now drives the sweep, so its shape is the shape of the tear. The loudness is set to play plainly, and the filter is opened so the sweep comes through bright.\n- Filter ATTACK 0, DECAY 610 ms: the sweep starts at its peak the instant you play, then slides down over about half a second. Shorter decay gives a quick zap; longer, a slow vowel-like sweep.\n- SUSTAIN 15 %, RELEASE 130 ms: held notes settle just above OSC B’s pitch, which keeps a little edge; the release is short.\n- Amplifier 1 ms, 220 ms, 100 %, 130 ms: ADSR (attack, decay, sustain, release). Full volume at once, held at full, with a short tail.\n- CUTOFF 7.4 (3.1 kHz), RESONANCE 1.5: the 24 dB low-pass filter stays open, so the synced harmonics are heard, with a slight lift at the cutoff.\n- Listen for: the tear now lasts longer and ends almost at OSC B’s tone on long notes. Sweep filter DECAY while the riff plays.',
        set: { ...ENV('fenv', 0, 6, 1.5, 4.5), ...ENV('aenv', 0, 5, 10, 4.5), 'vcf.cutoff': 7.4, 'vcf.res': 1.5 } },
      { title: 'One fat note at a time', module: 'mode', why: 'The line becomes one very thick voice, and each note slides into the next like a guitar bend.\n- UNISON TRACK on: all eight voices play the one key, each slightly detuned. The lead gets far wider and louder in the mix; switch it off to hear how thin a single voice is.\n- GLIDE 2 (160 ms): each note slides from the last instead of jumping. Short enough to keep the riff tight; turn it up and the line starts to smear.\n- Listen for: the slide between the notes of the riff, and the tearing sweep repeating on each new note as it glides in.',
        set: { 'voice.unison': true, 'glide.time': 2 } },
    ],
    context: {
      'pmod.env': 'In this sound: the depth of the sweep. More gives a longer, more dramatic tear; left of the middle it sweeps upwards instead.',
      'fenv.decay': 'In this sound: how long the sweep takes.',
      'osc1.freq': 'In this sound: where the sweep settles. Raise it an octave and the held tone gets harder.',
      'osc1.sync': 'In this sound: what turns OSC A’s pitch sweep into a sweep of tone.',
    },
    tweaks: [
      { id: 'fenv.decay', try: 'Set between 4.5 and 7', hear: 'A snappy zap at 4.5, a slow vowel-like sweep at 7.' },
      { id: 'osc1.freq', try: 'Turn it up while holding a note', hear: 'The synced tone jumps to a harder, more nasal colour each octave.' },
    ],
  },
  {
    id: 'p8-air-pad', name: 'Night Drive Pad', ref: 'In the style of Phil Collins — "In the Air Tonight"', artist: 'Phil Collins',
    tags: ['pad', 'pop', '80s'], level: 1,
    blurb: 'Dark, hollow chords that swell in slowly and hang in the air.',
    how: 'Two oscillators a little apart, a sawtooth on OSC A and a pulse on OSC B, beat slowly against each other. The filter is kept low so the chords stay dark, and both envelopes rise and fall slowly, so each chord swells in and fades away without a hard edge.',
    phrase: { bpm: 68, loop: true, steps: [[0, 50, 3.8], [0, 53, 3.8], [0, 57, 3.8], [4, 48, 3.8], [4, 52, 3.8], [4, 55, 3.8]] },
    steps: [
      { title: 'A sawtooth and a pulse, slightly apart', module: 'osc', why: 'The pad’s raw tone: a sawtooth and a pulse a little out of tune with each other. That slow beating is what keeps a held chord from sounding static.\n- OSC B sawtooth off, pulse on: a pulse sounds hollower than a sawtooth, which gives the pad its dark, hollow middle.\n- OSC B PULSE WIDTH 3.5 (36 %): a little narrower than a square, so slightly thinner and more nasal. At 5 it is a plain square.\n- OSC B LEVEL 4.5: just under OSC A (still at 5), so the sawtooth leads and the pulse fills underneath.\n- OSC B FINE +16 cents: OSC B slightly sharp. More gives a faster, wobblier beat; less, a slower one.\n- Listen for: hold a chord and hear a slow swirl as the two drift in and out of phase. Turn OSC B LEVEL down to 0 to hear the plain sawtooth.',
        set: { 'osc2.saw': false, 'osc2.pulse': true, 'osc2.level': 4.5, 'osc2.fine': 0.8, 'osc2.pw': 3.5 } },
      { title: 'Keep the filter dark', module: 'filter', why: 'The filter takes the brightness out. The PRO-800’s is a 24 dB low-pass: it keeps the lows and cuts the highs steeply, so the pad sits behind other parts rather than in front.\n- CUTOFF 4.8 (490 Hz): low, so most of the buzz is gone and the chord sounds dark and warm. Above 6 it turns bright and brassy.\n- RESONANCE 1.5: a small boost at the cutoff, just enough to give the dark tone a bit of shape.\n- ENVELOPE AMOUNT +1.2: the filter envelope opens the filter a little on each chord. Small, so there is a gentle lift rather than a pluck.\n- KEYBOARD 1/2: the cutoff follows half of the keyboard, so upper notes are a little brighter but nothing cuts through.\n- Listen for: a muffled, round chord with a small brightening at the start (the envelope is still fast until the next step).',
        set: { 'vcf.cutoff': 4.8, 'vcf.res': 1.5, 'vcf.env': 1.2, 'vcf.kbd': 'half' } },
      { title: 'Swell in, fade out', module: 'amp', why: 'Both envelopes are slowed right down. ADSR stands for attack, decay, sustain and release: how a sound starts, falls, holds and dies away. Here every chord rises out of nothing and hangs after you let go.\n- Filter ATTACK 1.0 s, DECAY 1.7 s: the filter opens slowly and eases back, so brightness swells in with the chord.\n- Filter SUSTAIN 60 %, RELEASE 1.7 s: held chords stay a little open and close slowly after release.\n- Amplifier ATTACK 610 ms: the volume fades in over more than half a second, so there is no hard edge. Shorter for a firmer start.\n- Amplifier DECAY 610 ms, SUSTAIN 90 %: a slight dip after the swell; held chords stay nearly full.\n- Amplifier RELEASE 1.7 s: each chord hangs in the air after you let go.\n- Listen for: chords that swell in and overlap as you change between them.',
        set: { ...ENV('fenv', 6.5, 7, 6, 7), ...ENV('aenv', 6, 6, 9, 7) } },
    ],
    context: {
      'aenv.attack': 'In this sound: how slowly each chord swells in.',
      'vcf.cutoff': 'In this sound: how dark the pad is. Above 6 it turns bright and brassy.',
      'osc2.fine': 'In this sound: the slow beating between the two oscillators.',
    },
    tweaks: [
      { id: 'vcf.cutoff', try: 'Move between 4 and 6', hear: 'From a muffled hum to an open, reedy chord.' },
      { id: 'aenv.release', try: 'Raise to 8', hear: 'Chords hang over into each other.' },
    ],
  },
  {
    id: 'p8-poly-brass', name: 'Prophet Brass', ref: 'In the style of early-80s synth-pop brass stabs', artist: 'Classic technique',
    tags: ['brass', 'synth-pop', '80s'], level: 1,
    blurb: 'Bright sawtooth chords with a brassy bite at the front of every stab.',
    how: 'Two sawtooths, slightly detuned, make each note thick. The filter starts part-closed and the filter envelope flicks it open and lets it settle, which gives the brassy "blat". Eight voices mean each note of the chord has its own filter and envelopes.',
    phrase: { bpm: 126, loop: true, steps: [[0, 60, 0.4], [0, 64, 0.4], [0, 67, 0.4], [0.5, 60, 0.4], [0.5, 64, 0.4], [0.5, 67, 0.4], [1.5, 62, 0.9], [1.5, 65, 0.9], [1.5, 69, 0.9], [3, 59, 0.9], [3, 62, 0.9], [3, 67, 0.9]] },
    steps: [
      { title: 'Two sawtooths, slightly apart', module: 'osc', why: 'Two sawtooths slightly out of tune are the classic starting point for synth brass. The detune makes each note sound like more than one player.\n- OSC B LEVEL 5: brought in at the same level as OSC A, so the two sawtooths are equal partners.\n- OSC B FINE +12 cents: OSC B slightly sharp, so the two beat against each other. More detune sounds wider and more out of tune; less, cleaner and narrower.\n- Listen for: play a chord and hear it thicken and shimmer compared with OSC A alone. It is still very bright: the filter is wide open at its starting point.',
        set: { 'osc2.level': 5, 'osc2.fine': 0.6 } },
      { title: 'Close the filter part way', module: 'filter', why: 'The filter is closed part way so the chords are darker between stabs. That gives the filter envelope room to open it again, which is where the brass bite comes from.\n- CUTOFF 4.5 (396 Hz): the 24 dB low-pass filter now cuts a lot of the buzz. Lower gives a muted horn; higher, a brighter, harder one.\n- RESONANCE 1: a slight boost at the cutoff, just enough edge for the bite to be noticed.\n- ENVELOPE AMOUNT +2.5: how far the filter envelope pushes the cutoff up on each stab. Lower for a softer horn section, higher for more bite.\n- Listen for: a brief brightening at the front of each chord. Half keyboard tracking (the default) stops the top notes going dull.',
        set: { 'vcf.cutoff': 4.5, 'vcf.res': 1, 'vcf.env': 2.5 } },
      { title: 'Let the filter envelope open it', module: 'env', why: 'The filter envelope shapes the brassy “blat”: the filter opens as the stab hits and settles back down. This is what makes it read as brass rather than a plain pad.\n- ATTACK 3 (27 ms): not instant, so the brass swells open instead of clicking. At 0 it clicks; around 3 it blooms.\n- DECAY 5.5 (370 ms): how long the bite lasts before the tone settles. Longer gives a slower “waah”.\n- SUSTAIN 40 %: held chords stay fairly dark after the bite.\n- RELEASE 4.5 (130 ms): the filter closes quickly after you let go.\n- Listen for: a quick swell in brightness at the start of each chord, then a warmer held tone. Sweep DECAY while playing stabs.',
        set: ENV('fenv', 3, 5.5, 4, 4.5) },
      { title: 'Shape the loudness', module: 'amp', why: 'The amplifier envelope sets the volume shape of each stab. For brass stabs you want a firm start and a clean stop so the rhythm is clear.\n- ATTACK 1.5 (4 ms): a very slight softening of the start, like air getting into a horn, without losing punch.\n- DECAY 220 ms, SUSTAIN 90 %: a tiny dip after the start, then the chord holds almost at full.\n- RELEASE 4.5 (130 ms): short, so stabs stop soon after you let go and stay separate.\n- Listen for: the gaps between stabs in a rhythmic part. Longer RELEASE blurs them together.',
        set: ENV('aenv', 1.5, 5, 9, 4.5) },
    ],
    context: {
      'vcf.env': 'In this sound: how far each stab opens the filter. Lower for a softer horn section, higher for more bite.',
      'fenv.decay': 'In this sound: the length of the bite. Longer gives a slower "waah".',
      'fenv.attack': 'In this sound: how quickly the brass swells open. At 0 it clicks; around 3 it blooms.',
      'osc2.fine': 'In this sound: the slight detune that thickens each note.',
    },
    tweaks: [
      { id: 'vcf.env', try: 'Move between 1 and 4', hear: 'From mellow pads to snarling brass.' },
      { id: 'fenv.attack', try: 'Raise to 5', hear: 'A slow, swelling brass section instead of a stab.' },
    ],
  },
  {
    id: 'p8-carpenter-bass', name: 'Pulsing Octave Bass', ref: 'In the style of John Carpenter — "Escape from New York"', artist: 'John Carpenter',
    tags: ['bass', 'soundtrack', '80s'], level: 1,
    blurb: 'A dark, steady bass that pulses in eighth notes and jumps between octaves.',
    how: 'OSC B plays an octave below OSC A, so the bass has weight under a bright edge. The filter is almost closed and a quick filter envelope with some resonance plucks each note open, which gives the pulse its tick.',
    phrase: { bpm: 112, loop: true, steps: [[0, 40, 0.4], [0.5, 40, 0.4], [1, 52, 0.4], [1.5, 40, 0.4], [2, 40, 0.4], [2.5, 52, 0.4], [3, 43, 0.4], [3.5, 45, 0.4]] },
    steps: [
      { title: 'A sawtooth with a sub-octave', module: 'osc', why: 'An octave below the sawtooth adds weight to the bass: the bright top gives edge, the lower octave gives the low end you feel.\n- OSC B FREQUENCY 2.5 (−1 oct): the knob steps in whole octaves, not smoothly, so one step left puts OSC B an octave below OSC A.\n- OSC B LEVEL 4.5: slightly under OSC A, so the sub-octave supports rather than takes over. Turn it up for more weight; to 0 to hear OSC A alone.\n- Listen for: a fuller, heavier note. Still bright for now, because the filter is open.',
        set: { 'osc2.freq': 2.5, 'osc2.level': 4.5 } },
      { title: 'Nearly close the filter', module: 'filter', why: 'The filter is nearly closed so the bass is a dull thud at rest. The 24 dB low-pass filter cuts the highs steeply, and the filter envelope will open it on each note in the next step.\n- CUTOFF 3.6 (208 Hz): very low, so most of the sawtooth’s buzz is gone and the sub-octave dominates.\n- RESONANCE 3: a boost at the cutoff that gives each pluck a ring. More and it starts to squelch.\n- ENVELOPE AMOUNT +2.2: how far the filter envelope opens the filter on each note.\n- Listen for: a dark, thumping note with a small brightening at the start (the envelope still has its default shape).',
        set: { 'vcf.cutoff': 3.6, 'vcf.res': 3, 'vcf.env': 2.2 } },
      { title: 'Pluck each note', module: 'env', why: 'Both envelopes are set for a tight pulse. The filter envelope flicks the filter open and shut on every note, which gives the pulse its tick.\n- Filter ATTACK 0, DECAY 130 ms: opens at once and closes within about a tenth of a second. Longer DECAY turns the tick into a “wow”.\n- Filter SUSTAIN 10 %, RELEASE 77 ms: held notes go back to almost fully dark.\n- Amplifier 1 ms, 220 ms, 80 %, 46 ms: in ADSR order (attack, decay, sustain, release). Instant start, a small drop, then a very short release.\n- Listen for: play steady eighth notes and hear a clean tick at the front of each, with clear gaps in between. Sweep filter DECAY to hear the groove loosen.',
        set: { ...ENV('fenv', 0, 4.5, 1, 4), ...ENV('aenv', 0, 5, 8, 3.5) } },
    ],
    context: {
      'fenv.decay': 'In this sound: the length of the tick at the front of each note.',
      'vcf.res': 'In this sound: gives each pluck its ring.',
      'osc2.freq': 'In this sound: the octave below that gives the bass its weight.',
    },
    tweaks: [
      { id: 'vcf.cutoff', try: 'Sweep between 3 and 5.5 while it plays', hear: 'The classic slow opening of a soundtrack bass line.' },
      { id: 'fenv.decay', try: 'Set between 3.5 and 5.5', hear: 'From a dry tick to a rounder, longer note.' },
    ],
  },
  {
    id: 'p8-polymod-bell', name: 'Poly-Mod Bells', ref: 'In the style of the classic Prophet Poly-Mod bell', artist: 'Classic technique',
    tags: ['keys', 'fm', '80s'], level: 3,
    blurb: 'Clear, metallic bell chords with a slow ring.',
    how: 'OSC B is not heard at all: it runs a little over an octave above OSC A and, through Poly-Mod, wobbles OSC A’s pitch at audio speed. That frequency modulation adds clangy, out-of-tune overtones, like a bell. A triangle on OSC A keeps the base tone pure, and a long decay with no sustain lets each chord ring out.',
    phrase: { bpm: 90, loop: true, steps: [[0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 84, 1.8], [3, 72, 1.8]] },
    steps: [
      { title: 'A pure triangle on OSC A', module: 'osc', why: 'The bell starts from a pure tone. A triangle has very few overtones, so the metallic colour added later by Poly-Mod will stand out clearly.\n- OSC A sawtooth off, triangle on: soft and round, close to a sine. Each wave on the PRO-800 has its own switch, so the sawtooth must be turned off, not just swapped.\n- Listen for: a plain, flute-like tone, much softer than the default sawtooth.',
        set: { 'osc1.saw': false, 'osc1.tri': true } },
      { title: 'Set OSC B as a silent modulator', module: 'osc', why: 'OSC B is set up as a modulator, not a sound. It stays silent but runs at an odd ratio to OSC A, which is where the bell’s clang will come from.\n- OSC B FREQUENCY 7.5 (+1 oct): one step up, an octave above OSC A.\n- OSC B FINE +100 cents: a full semitone sharp on top, so OSC B is 13 semitones above OSC A. That uneven ratio gives out-of-tune, clangy overtones; moving FINE changes which ones.\n- OSC B triangle on, sawtooth off: a smooth wave gives a cleaner modulation.\n- OSC B LEVEL 0: not heard, but it keeps running and can still feed Poly-Mod.\n- Listen for: no change yet. OSC B is not heard and not routed anywhere.',
        set: { 'osc2.freq': 7.5, 'osc2.fine': 5, 'osc2.tri': true, 'osc2.saw': false, 'osc2.level': 0 } },
      { title: 'Poly-Mod OSC B into FREQ A', module: 'mod', why: 'Poly-Mod, the Prophet’s name for modulation inside each voice, now lets OSC B move OSC A’s pitch at audio speed. That is frequency modulation (FM), and it turns the plain triangle into a bell.\n- OSC B amount 5 (50 %): how much OSC B goes into Poly-Mod. Low is a soft chime, high a harsh gong.\n- FREQ A on: sends the Poly-Mod mix to OSC A’s pitch. Each voice has its own OSC B, so chords stay clean.\n- Listen for: a clangy, metallic tone replacing the flute. Turn the OSC B amount slowly from 0 to 5 while holding a note.',
        set: { 'pmod.oscb': 5, 'pmod.freqA': true } },
      { title: 'Strike and ring', module: 'amp', why: 'Both envelopes and the filter make it strike and ring like a bell: loud at once, then dying away even while you hold the key.\n- Amplifier ATTACK 0, DECAY 1.7 s: an instant start, then, with SUSTAIN at 0, a fade to silence over nearly two seconds. Longer DECAY rings longer.\n- Amplifier RELEASE 1.7 s: let go early and the note still rings out.\n- Filter 1 ms, 1.0 s, 0 %, 1.0 s: the filter envelope follows the same shape, so the tone darkens as it fades, like a real bell.\n- CUTOFF 5.5 (808 Hz), ENVELOPE AMOUNT +2: the strike opens the filter, then it closes back to this.\n- KEYBOARD FULL: the cutoff follows the notes fully, so high notes stay as bright as low ones.\n- Listen for: a bright strike that mellows as it decays.',
        set: { ...ENV('aenv', 0, 7, 0, 7), ...ENV('fenv', 0, 6.5, 0, 6.5), 'vcf.cutoff': 5.5, 'vcf.env': 2, 'vcf.kbd': 'full' } },
    ],
    context: {
      'pmod.oscb': 'In this sound: how metallic the bell is. Low is a soft chime, high a harsh gong.',
      'osc2.fine': 'In this sound: the ratio between the oscillators. Moving it changes which clangy overtones you get.',
      'aenv.decay': 'In this sound: how long each strike rings.',
    },
    tweaks: [
      { id: 'pmod.oscb', try: 'Move between 2 and 8', hear: 'From a glassy chime to a clanging gong.' },
      { id: 'osc2.fine', try: 'Set to 0', hear: 'In tune, the overtones line up and the bell turns into a hollow organ-like tone.' },
    ],
  },
  {
    id: 'p8-pwm-strings', name: 'Shimmer Strings', ref: 'In the style of early-80s string-synth pads', artist: 'Classic technique',
    tags: ['strings', 'synth-pop', '80s'], level: 1,
    blurb: 'Soft string chords that shimmer while they hold.',
    how: 'Both oscillators play pulse waves and the LFO sweeps their width, which makes them shimmer like a string section. OSC B slightly detuned adds movement. A slow attack and long release make the chords swell in and fade away.',
    phrase: { bpm: 72, loop: true, steps: [[0, 57, 3.8], [0, 60, 3.8], [0, 64, 3.8], [0, 69, 3.8], [4, 53, 3.8], [4, 57, 3.8], [4, 60, 3.8], [4, 67, 3.8]] },
    steps: [
      { title: 'Pulse waves on both oscillators', module: 'osc', why: 'String-synth pads start from pulse waves. Two slightly detuned pulses give a thinner, more hollow body than sawtooths, which is closer to an ensemble of strings.\n- OSC A and B sawtooth off, pulse on: each wave has its own switch, so the sawtooths must go off or they add to the pulses.\n- OSC A PULSE WIDTH 4 (41 %): a little off square, slightly thinner. OSC B stays square at 5.\n- LEVEL 3.5 and 3: both fairly low and clean, OSC B a touch quieter.\n- OSC B FINE +16 cents: slightly sharp, so the two beat and the chord sounds wider.\n- Listen for: a hollow, reedy chord with a slow swirl from the detune.',
        set: { 'osc1.saw': false, 'osc1.pulse': true, 'osc2.saw': false, 'osc2.pulse': true, 'osc1.level': 3.5, 'osc2.level': 3, 'osc2.fine': 0.8, 'osc1.pw': 4 } },
      { title: 'Sweep the widths', module: 'mod', why: 'The LFO (low-frequency oscillator, a slow wave that moves other controls) sweeps the width of both pulses. That changing width is pulse-width modulation, the shimmer of string machines.\n- PW A-B on: sends the LFO to both oscillators’ pulse width. Only heard on oscillators with the pulse switched on.\n- INITIAL AMOUNT 4 (40 %): how deep the width swings without touching the mod wheel. The mod wheel adds more on top.\n- LFO FREQUENCY 4.6 (1.01 Hz): about one sweep a second. Slower is a gentle drift; faster, a nervous flutter.\n- Listen for: the chord moving and shimmering while it holds. Switch PW A-B off to hear it go still.',
        set: { 'lfo.pw': true, 'lfo.amount': 4, 'lfo.rate': 4.6 } },
      { title: 'Soften the filter', module: 'filter', why: 'The filter smooths the top so the strings are soft rather than buzzy, and sit under a vocal or lead.\n- CUTOFF 6 (1.2 kHz): down from the default 2.4 kHz, taking the fizz off. Lower goes muffled; higher, brighter and more cutting.\n- Listen for: a smoother, warmer chord with the shimmer still clear.',
        set: { 'vcf.cutoff': 6 } },
      { title: 'Swell in, fade out', module: 'amp', why: 'The amplifier envelope makes every chord rise and fall like a bowed string section rather than starting and stopping like an organ.\n- ATTACK 6 (610 ms): each chord fades in over more than half a second.\n- DECAY 610 ms, SUSTAIN 100 %: the decay makes no difference with full sustain; held chords stay at full volume.\n- RELEASE 6.8 (1.4 s): chords hang after you let go and overlap into the next.\n- Listen for: slow swells and tails. Play chords in a row and hear them blend.',
        set: ENV('aenv', 6, 6, 10, 6.8) },
    ],
    context: {
      'lfo.amount': 'In this sound: how deep the shimmer is.',
      'lfo.rate': 'In this sound: how fast the strings shimmer.',
      'aenv.attack': 'In this sound: how slowly each chord swells in.',
    },
    tweaks: [
      { id: 'lfo.rate', try: 'Move between 3 and 6.5', hear: 'From a slow sway to a nervous flutter.' },
      { id: 'lfo.amount', try: 'Set to 0 and back', hear: 'Without the LFO the chord goes flat and still.' },
    ],
  },
  {
    id: 'p8-unison-bass', name: 'Eight-Voice Unison Bass', ref: 'In the style of 80s synth-pop unison bass', artist: 'Classic technique',
    tags: ['bass', 'synth-pop', '80s'], level: 1,
    blurb: 'A heavy, punchy bass made of all eight voices stacked on each note.',
    how: 'UNISON TRACK puts every voice on the one key, each a little out of tune with the others, so the bass is enormous. OSC B an octave down adds weight, and a short filter envelope gives each note a round thump.',
    phrase: { bpm: 112, loop: true, steps: [[0, 36, 0.4], [0.5, 36, 0.4], [1, 48, 0.4], [1.5, 36, 0.4], [2, 39, 0.4], [2.5, 39, 0.4], [3, 41, 0.4], [3.5, 43, 0.4]] },
    steps: [
      { title: 'Stack every voice', module: 'mode', why: 'All eight voices go onto one key. This is how a polysynth becomes a huge mono bass: each voice is slightly out of tune with the others.\n- UNISON TRACK on: every key now plays all eight voices, detuned against each other, and only one note sounds at a time.\n- Listen for: a much thicker, louder sawtooth than before. Switch it off and on to compare.',
        set: { 'voice.unison': true } },
      { title: 'A sub-octave under the sawtooth', module: 'osc', why: 'A second oscillator an octave below adds low end under the sawtooth.\n- OSC B FREQUENCY 2.5 (−1 oct): one step down on the octave knob.\n- OSC B LEVEL 5: equal to OSC A, so the sub-octave carries real weight.\n- OSC B FINE +10 cents: a touch sharp, for a little extra movement.\n- Listen for: the note dropping in weight. Turn OSC B LEVEL to 0 and back to hear what the sub-octave adds.',
        set: { 'osc2.freq': 2.5, 'osc2.level': 5, 'osc2.fine': 0.5 } },
      { title: 'A round, heavy filter', module: 'filter', why: 'The filter is set low so the bass is round and heavy, and the filter envelope opens it for a moment on each note to give a thump.\n- CUTOFF 3.2 (157 Hz): very dark. How much growl comes through between the thumps.\n- RESONANCE 2: a little boost at the cutoff for shape.\n- ENVELOPE AMOUNT +2.5: how far the filter envelope opens the filter on each note.\n- Filter ATTACK 0, DECAY 180 ms: opens at once and closes fast; the length of the thump.\n- Filter SUSTAIN 15 %, RELEASE 77 ms: held notes go back to dark.\n- Listen for: a round thump at the start of each note, then a deep hum.',
        set: { 'vcf.cutoff': 3.2, 'vcf.res': 2, 'vcf.env': 2.5, ...ENV('fenv', 0, 4.8, 1.5, 4) } },
      { title: 'Tight loudness', module: 'amp', why: 'The amplifier envelope keeps notes tight so the bass line has a clear groove.\n- ATTACK 0: full volume at once, so the thump lands on the beat.\n- DECAY 220 ms, SUSTAIN 90 %: held notes keep almost all their weight.\n- RELEASE 3.5 (46 ms): notes stop almost as soon as you let go, keeping them apart.\n- Listen for: the gaps between notes. Raise RELEASE and they start to blur.',
        set: ENV('aenv', 0, 5, 9, 3.5) },
    ],
    context: {
      'voice.unison': 'In this sound: all eight voices on one note. Switch it off and the bass is thin by comparison.',
      'vcf.cutoff': 'In this sound: how much growl comes through between the thumps.',
      'fenv.decay': 'In this sound: the length of the thump.',
    },
    tweaks: [
      { id: 'vcf.res', try: 'Raise to 6', hear: 'Each note gets a rubbery squelch.' },
      { id: 'osc1.level', try: 'Raise to 8', hear: 'The filter is driven harder and the bass turns gritty.' },
    ],
  },
  {
    id: 'p8-updown-arp', name: 'Up-Down Arpeggio', ref: 'In the style of 80s soundtrack arpeggios', artist: 'Classic technique',
    tags: ['seq', 'soundtrack', '80s'], level: 1,
    blurb: 'A held chord turned into a plucked arpeggio that slowly brightens and darkens.',
    how: 'ARP UP-DN plays the held notes one at a time, up and back down. Each note is short and the filter envelope gives it a pluck. The LFO, very slow, sweeps the filter so the pattern keeps changing colour.',
    phrase: { bpm: 100, loop: true, steps: [[0, 48, 3.9], [0, 52, 3.9], [0, 55, 3.9], [0, 59, 3.9], [4, 45, 3.9], [4, 48, 3.9], [4, 52, 3.9], [4, 55, 3.9]] },
    steps: [
      { title: 'Turn the arpeggiator on', module: 'mode', why: 'The arpeggiator turns a held chord into single notes played in turn. It is on the programmer keys, not a knob.\n- ARP UP-DN on: hold a chord and it plays the notes from the lowest up to the highest and back down, at 120 BPM. The lamp lights while it is on.\n- Listen for: a stream of bright sawtooth notes. Change the chord and the pattern follows.',
        set: { 'arp.updn': true } },
      { title: 'A square-wave pluck', module: 'osc', why: 'The tone for the pluck: a square wave on OSC A with a quieter sawtooth an octave above.\n- OSC A sawtooth off, pulse on: pulse width is at 5, so this is a square wave, hollow like a clarinet.\n- OSC B FREQUENCY 7.5 (+1 oct): one step up, an octave above OSC A.\n- OSC B LEVEL 2.5: quiet, so it adds a glassy edge on top rather than a second note.\n- Listen for: a hollow tone with a thin shine above it.',
        set: { 'osc1.saw': false, 'osc1.pulse': true, 'osc2.freq': 7.5, 'osc2.level': 2.5 } },
      { title: 'Pluck the filter', module: 'filter', why: 'A plucked filter makes each arpeggio note short and percussive. Both envelopes are set for a quick pluck that still leaves a little body.\n- CUTOFF 3.4 (181 Hz): nearly closed at rest, so the envelope has plenty to open.\n- RESONANCE 4: a clear boost at the cutoff that makes each pluck ring.\n- ENVELOPE AMOUNT +2.6: how far the filter opens on each note.\n- Filter 1 ms, 130 ms, 0 %, 130 ms: in ADSR order (attack, decay, sustain, release). Opens at once and snaps shut.\n- Amplifier 1 ms, 220 ms, 70 %, 130 ms: the notes keep some body after the pluck.\n- Listen for: a bright, ringing “tick” on every note, then a dark tail.',
        set: { 'vcf.cutoff': 3.4, 'vcf.res': 4, 'vcf.env': 2.6, ...ENV('fenv', 0, 4.5, 0, 4.5), ...ENV('aenv', 0, 5, 7, 4.5) } },
      { title: 'A slow filter sweep', module: 'mod', why: 'The LFO (low-frequency oscillator) slowly moves the filter, so the pattern brightens and darkens over several bars. It keeps a repeating arpeggio from sounding static.\n- FILTER on: sends the LFO to the cutoff.\n- LFO FREQUENCY 1.8 (0.22 Hz): one sweep about every four and a half seconds.\n- INITIAL AMOUNT 4 (40 %): how far the sweep moves the filter. The mod wheel adds more on top.\n- Listen for: the plucks getting brighter and more ringing, then duller, while you hold the same chord.',
        set: { 'lfo.filter': true, 'lfo.rate': 1.8, 'lfo.amount': 4 } },
    ],
    context: {
      'lfo.amount': 'In this sound: how far the slow sweep moves the filter.',
      'vcf.res': 'In this sound: the ring on each pluck.',
      'arp.updn': 'In this sound: turns the held chord into a stream of single notes.',
    },
    tweaks: [
      { id: 'arp.assign', try: 'Press ARP ASSIGN and switch UP-DN off', hear: 'The notes now come in the order you pressed the keys.' },
      { id: 'fenv.decay', try: 'Set between 3.5 and 6', hear: 'From a tick to a soft, round note.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

export default {
  id: 'pro-800', name: 'PRO-800', maker: 'Behringer', year: 2023,
  heritage: 'Based on the 1982 Sequential Circuits Prophet-600',
  summary: 'Eight analogue voices, each with two oscillators (sawtooth, triangle and pulse, mixable; A syncs to B) and noise → 24 dB low-pass filter → VCA, with a filter and an amplifier envelope. Poly-Mod sends the filter envelope and OSC B to OSC A’s pitch and the filter; one LFO, glide, unison and an arpeggiator.',
  view: { w: 2084, h: 652 },
  theme: { panel: '#2a2a2b', panel2: '#232324', ink: INK, font: 'din', weight: 700, cheeks: 'wood', cheekW: 33 },
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds], lineage,
  signalNames: { env1: 'the filter envelope', env2: 'the amplifier envelope', osc1: 'OSC A', osc2: 'OSC B' },
};
