// Behringer DeepMind 12D — SynthDef. Positions are measured in pixels on the 1200×1200 product photo and mapped into
// view units by X() / Y() (the faceplate crop, doubled). The data model is the DeepMind 12D synth.json (manual v1.0).
//
// The DeepMind is programmed as much from its display as from its faders, and one row of four faders serves three
// envelopes. Both are modelled with panel modes (see CONTRACT.md → Panel modes): `ui.page` is the EDIT button that is
// lit, and picks which menu rows the display shows; `env.select` and `env.curves` pick which of the twelve envelope
// controls the A D S R faders are. Panel modes are not part of any sound.
import { annotate, expMap, pwl, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import lineage from '@/synths/lineage/deepmind-12d.js';
import unusual from '@/synths/unusual/deepmind-12d.js';
import moreSounds from '@/synths/sounds/deepmind-12d.js';
import { FX_ALGOS, FX_ROUTINGS, FX_MODES } from '@/synths/fx/deepmind-12d.js';

const X = (px) => Math.round((px - 93) * 2);
const Y = (py) => Math.round((py - 351) * 2);

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The manual gives the end points of most faders but not the curve between them, and no envelope times at all.
// Frequencies and times use exponential curves; the envelope times are this app's estimate.
const ENV_PTS = [[0, 0.0005], [2, 0.03], [4, 0.18], [6, 0.8], [8, 3.5], [10, 15]];
const envTime = (v) => pwl(v, ENV_PTS, true);
const lfoHz = (v) => expMap(v / 10, 0.041, 65.4);
const lfoDelay = (v) => 6.59 * Math.pow(v / 10, 2);
const vcfHz = (v) => expMap(v / 10, 50, 20000);
const hpfHz = (v) => expMap(v / 10, 20, 2000);
const bpm = (v) => 20 + 25.5 * v;
const portaTime = (v) => 10 * Math.pow(v / 10, 2);
const pitchModSemi = (v) => 36 * Math.pow(v / 10, 2);
/** OSC 2 LEVEL and NOISE LEVEL: off at the bottom, then −48 dB to 0 dB. */
const dbLevel = (v) => (v <= 0 ? 0 : Math.pow(10, (-48 + 4.8 * v) / 20));
const fmtDb = (v) => (v <= 0 ? 'off' : `${(-48 + 4.8 * v).toFixed(1)} dB`);
const vcaDb = (v) => -3 + 1.8 * v; // printed −5 … +5, manual −12 dB … +6 dB

const RANGE = [{ v: '16', label: "16'" }, { v: '8', label: "8'" }, { v: '4', label: "4'" }];
const RANGE_SEMI = { 16: -12, 8: 0, 4: 12 };
const MOD_SRC = [
  { v: 'lfo1', label: 'LFO 1' }, { v: 'lfo2', label: 'LFO 2' }, { v: 'vcaEnv', label: 'VCA ENV' }, { v: 'vcfEnv', label: 'VCF ENV' },
  { v: 'modEnv', label: 'MOD ENV' }, { v: 'lfo1uni', label: 'LFO 1 UNI' }, { v: 'lfo2uni', label: 'LFO 2 UNI' },
];
const MANUAL_SRC = [{ v: 'manual', label: 'MANUAL' }, ...MOD_SRC.slice(0, 5)];
/** Matrix source → engine signal. VCF envelope = env1, VCA envelope = env2, MOD envelope = env3. */
const SIG = { lfo1: 'lfo', lfo2: 'lfo2', vcaEnv: 'env2', vcfEnv: 'env1', modEnv: 'env3', lfo1uni: 'lfoUni', lfo2uni: 'lfo2Uni' };
const BIPOLAR = { lfo1: true, lfo2: true };
const SHAPES = [
  { v: 'sine', label: 'SINE' }, { v: 'tri', label: 'TRIANGLE' }, { v: 'sq', label: 'SQUARE' }, { v: 'up', label: 'RAMP UP' },
  { v: 'down', label: 'RAMP DOWN' }, { v: 'sh', label: 'S&H' }, { v: 'sg', label: 'S&GLIDE' },
];
const SHAPE_MIX = { sine: { sine: 1 }, tri: { tri: 1 }, sq: { sq: 1 }, up: { saw: 1 }, down: { rsaw: 1 }, sh: { sh: 1 }, sg: { shg: 1 } };
const OFF_ON = [{ v: 'off', label: 'OFF' }, { v: 'on', label: 'ON' }];
const POLY_MODES = [
  { v: 'poly', label: 'POLY' }, { v: 'uni2', label: 'UNISON-2' }, { v: 'uni3', label: 'UNISON-3' }, { v: 'uni4', label: 'UNISON-4' },
  { v: 'uni6', label: 'UNISON-6' }, { v: 'uni12', label: 'UNISON-12' }, { v: 'mono', label: 'MONO' }, { v: 'mono2', label: 'MONO-2' },
  { v: 'mono3', label: 'MONO-3' }, { v: 'mono4', label: 'MONO-4' }, { v: 'mono6', label: 'MONO-6' }, { v: 'poly6', label: 'POLY-6' },
  { v: 'poly8', label: 'POLY-8' },
];
const POLY_SHAPE = {
  poly: [12, 1, false], uni2: [12, 2, false], uni3: [12, 3, false], uni4: [12, 4, false], uni6: [12, 6, false], uni12: [12, 12, false],
  mono: [12, 1, true], mono2: [12, 2, true], mono3: [12, 3, true], mono4: [12, 4, true], mono6: [12, 6, true], poly6: [6, 1, false], poly8: [8, 1, false],
};

const controls = [];
const decor = [];
const text = (px, py, t, size = 26, rest = {}) => decor.push({ t: 'text', x: X(px), y: Y(py), text: t, size, anchor: 'middle', ...rest });

// ── Faceplate artwork ─────────────────────────────────────────────────────
const TOP = [418, 612];
const BOT = [618, 836];
// Each section sits on a slightly lighter plate with its name on a bar across the top.
const section = (x0, x1, row, name) => {
  const [y0, y1] = row;
  decor.push({ t: 'rect', x: X(x0), y: Y(y0 + 4), w: X(x1) - X(x0), h: Y(y1) - Y(y0 + 4), r: 5, fill: '#2c2d30', hw: true });
  decor.push({ t: 'rect', x: X(x0), y: Y(y0 + 4), w: X(x1) - X(x0), h: 40, r: 4, fill: '#35363a', hw: true });
  if (name) text((x0 + x1) / 2, y0 + 20, name, 30, { weight: 600 });
};
section(147, 207, TOP, '');
section(210, 342, TOP, 'ARP / SEQ');
section(346, 571, TOP, 'LFO 1&2');
section(575, 995, TOP, '');
section(999, 1050, TOP, 'POLY');
section(212, 509, BOT, 'OSC 1&2');
section(513, 731, BOT, 'VCF');
section(735, 784, BOT, 'VCA');
section(788, 840, BOT, 'HPF');
section(845, 1050, BOT, 'ENVELOPES');

text(253, 406, 'DeepMind 12', 62, { weight: 700, fill: '#c9cacc', spacing: '0.01em' });
text(374, 409, 'ANALOG 12-VOICE POLYPHONIC SYNTHESIZER', 19, { anchor: 'start', weight: 600 });
decor.push({ t: 'logo', x: X(172.5), y: Y(527), size: 15, text: 'behringer', style: 'behringer' });
text(752, 408, 'VOICES', 15, { anchor: 'end' });
for (let i = 0; i < 12; i++) {
  const x = 777.5 + i * 22.6;
  text(x, 396, String(i + 1), 15);
  decor.push({ t: 'led', x: X(x), y: Y(404), r: 5, color: 'amber', litWhen: { voice: i } });
}

// Fader scales: lines printed right across each group of faders, numbered at both ends.
const scale = (x0, x1, row, labels = ['10', '5', '0']) => {
  const [yTop, yBot] = row === 'top' ? [486, 552.5] : [687.5, 755];
  for (let i = 0; i <= 10; i++) {
    const y = yTop + ((yBot - yTop) * i) / 10;
    decor.push({ t: 'line', x1: X(x0 - 12), y1: Y(y), x2: X(x1 + 12), y2: Y(y), w: i % 5 === 0 ? 2.4 : 1.6, opacity: i % 5 === 0 ? 0.8 : 0.45 });
  }
  [0, 5, 10].forEach((i, k) => {
    const y = Y(yTop + ((yBot - yTop) * i) / 10) + 6;
    decor.push({ t: 'text', x: X(x0 - 15), y, text: labels[k], size: 15, anchor: 'end' });
    decor.push({ t: 'text', x: X(x1 + 15), y, text: labels[k], size: 15, anchor: 'start' });
  });
};
scale(277, 317.5, 'top');
scale(371.5, 411.5, 'top');
scale(503.5, 544, 'top');
scale(971, 971, 'top');
scale(1026.5, 1026.5, 'top');
scale(237.5, 277.5, 'bot');
scale(325, 483.5, 'bot');
scale(538.5, 578, 'bot');
scale(626, 705.5, 'bot');
scale(760, 760, 'bot', ['+5', '0', '−5']);
scale(815, 815, 'bot');
scale(870, 988.5, 'bot');

// ── Controls ──────────────────────────────────────────────────────────────
const TOP_Y = Y(519.25);
const BOT_Y = Y(721.25);
const fader = (id, px, row, rest) => controls.push({
  id, type: 'fader', x: X(px), y: row === 'top' ? TOP_Y : BOT_Y, len: row === 'top' ? 133 : 135, orient: 'v', ticks: 0, pad: 16,
  kind: 'cont', min: 0, max: 10, labelPos: 'top', labelSize: 17, ...rest,
});
const BTN = { w: 44, h: 34 };
const button = (id, px, py, lamp, rest) => controls.push({ id, type: 'button', x: X(px), y: Y(py), ...BTN, lamp, kind: 'bool', labelPos: 'top', labelSize: 15, ...rest });
/** Hardware buttons and faders that this app does not model, printed as artwork. */
const deadButton = (px, py, lamp, label) => {
  const fill = lamp === 'blue' ? '#2f4d53' : lamp === 'amber' ? '#5a4526' : '#4b4e50'; // unlit, like a real button that is off
  decor.push({ t: 'rect', x: X(px) - 22, y: Y(py) - 17, w: 44, h: 34, r: 6, fill, stroke: '#000', sw: 1.5 });
  if (label) text(px, py - 17 - (label.split('\n').length - 1) * 8, label, 15);
};

// ARP / SEQ
deadButton(238.5, 486, 'blue', 'CHORD');
deadButton(238.5, 539, 'blue', 'POLY\nCHORD');
fader('arp.rate', 277, 'top', {
  def: 3.9, label: 'RATE', module: 'mode', fmt: (v) => `${Math.round(bpm(v))} BPM`,
  help: 'Speed of the arpeggiator, as the master tempo in beats per minute. The arpeggiator plays four notes to the beat.',
});
fader('arp.gate', 317.5, 'top', {
  def: 7.5, label: 'GATE\nTIME', module: 'mode', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How long each arpeggiated note lasts, as a share of the step. Short gives staccato plucks, full length makes the notes join up.',
});
button('arp.on', 238.5, 588.5, 'white', {
  def: false, label: 'ON/OFF', module: 'mode',
  help: 'Turns the arpeggiator on. Hold a chord and it plays the notes one at a time, in the order set in the ARP EDIT menu.',
});
button('arp.hold', 277, 588.5, 'blue', {
  def: false, label: 'TAP/HOLD', module: 'mode',
  help: 'Latches the arpeggio, so it keeps playing after you let go. Playing a new chord replaces the held one.',
});

// LFO 1 & 2
[[1, 371.5, 411.5], [2, 503.5, 544]].forEach(([n, xr, xd]) => {
  fader(`lfo${n}.rate`, xr, 'top', {
    def: 4, label: 'RATE', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
    help: `Speed of LFO ${n}, from one cycle every 24 seconds up to 65 Hz, which is fast enough to hear as a tone of its own.`,
  });
  fader(`lfo${n}.delay`, xd, 'top', {
    def: 0, label: 'DELAY\nTIME', module: 'lfo', fmt: (v) => (v <= 0 ? 'off' : fmtTime(lfoDelay(v))),
    help: `Holds LFO ${n} back at the start of each note and then fades it in, so a note starts steady and the wobble grows. The first 40% of the time is silence, the rest a fade-in.`,
  });
});
const SHAPE_ROWS = [475.5, 490, 504, 518, 532, 546, 560];
const SHAPE_GLYPH = ['sine', 'tri', 'sq', 'saw', 'rsaw'];
SHAPES.forEach((s, i) => {
  const y = SHAPE_ROWS[i];
  if (i < 5) decor.push({ t: 'wave', x: X(457.5), y: Y(y), size: 9, shape: SHAPE_GLYPH[i], w: 2.2 });
  else text(457.5, y + 3.5, i === 5 ? 'S&H' : 'S&G', 12);
  decor.push({ t: 'led', x: X(444), y: Y(y), r: 5, color: 'amber', litWhen: { id: 'lfo1.shape', eq: s.v } });
  decor.push({ t: 'led', x: X(471), y: Y(y), r: 5, color: 'amber', litWhen: { id: 'lfo2.shape', eq: s.v } });
});

// Display, its buttons and the data entry controls
decor.push({ t: 'lcd', x: X(588), y: Y(449), w: X(764) - X(588), h: Y(560) - Y(449), page: 'ui.page',
  titles: {
    prog: 'PROGRAM', arp: 'ARP EDIT', lfo1: 'LFO 1 EDIT', lfo2: 'LFO 2 EDIT', poly: 'POLY EDIT', osc: 'OSC EDIT',
    vcf: 'VCF EDIT', vca: 'VCA EDIT', fx: 'FX', global: 'GLOBAL', compare: 'COMPARE', write: 'WRITE',
  },
  notes: {
    prog: 'Press an EDIT button to\nopen that section\'s menu\nhere. Click a value to\nchange it.',
    vca: 'Velocity, pan spread and\nVCA mode are not\nmodelled here.',
    global: 'Global settings are not\nmodelled here.',
    compare: 'Not modelled: sounds are\nkept in this app\'s\nlibrary instead.',
    write: 'Not modelled: sounds are\nkept in this app\'s\nlibrary instead.',
  } });
const PAGE_BTN = [
  ['arp', 316.5, 'EDIT'], ['lfo1', 391.5, 'EDIT'], ['lfo2', 524, 'EDIT'], ['prog', 596.5, 'PROG'], ['fx', 637.5, 'FX'],
  ['global', 676, 'GLOBAL'], ['compare', 715, 'COMPARE'], ['write', 755, 'WRITE'], ['poly', 1026, 'EDIT'],
];
const PAGE_BTN_LOW = [['osc', 384, 'EDIT'], ['vcf', 578, 'EDIT'], ['vca', 760, 'EDIT']];
controls.push({
  id: 'ui.page', type: 'select', ui: true, x: X(676), y: Y(504.5), ...BTN, lamp: 'amber', kind: 'enum', def: 'prog',
  label: 'Display page', labelPos: 'none', module: 'mode',
  options: [
    ...PAGE_BTN.map(([v, px, t]) => ({ v, label: `${t === 'EDIT' ? `${v.toUpperCase()} ` : ''}${t}`, text: t, x: X(px), y: Y(588.5) })),
    ...PAGE_BTN_LOW.map(([v, px, t]) => ({ v, label: `${v.toUpperCase()} ${t}`, text: t, x: X(px), y: Y(791) })),
  ].map((o) => ({ ...o, label: o.label.replace('LFO1', 'LFO 1').replace('LFO2', 'LFO 2') })),
  help: 'The amber EDIT buttons open each section\'s menu on the display, and PROG goes back to the program screen. Only one is lit at a time. This changes what you see, not the sound.',
});
[[858, 468.5, 'BANK/UP', -1], [808.5, 514, '−/NO', 0], [906.5, 514, '+/YES', 0], [858, 560, 'BANK/DOWN', 1]].forEach(([px, py, t, pos]) => {
  deadButton(px, py, 'white', pos < 0 ? t : '');
  if (pos === 0) text(px, py - 17, t, 15);
  if (pos > 0) text(px, py + 30, t, 15);
});
decor.push({ t: 'circle', x: X(858), y: Y(514), r: 50, fill: '#08090a', stroke: '#3c3d41', sw: 3 });
decor.push({ t: 'circle', x: X(858), y: Y(514), r: 34, fill: '#1c1d20', stroke: '#9c9ea3', sw: 4 });
text(971, 462, 'DATA\nENTRY', 17);
decor.push({ t: 'rect', x: X(971) - 7, y: Y(486) - 16, w: 14, h: 133 + 32, r: 7, fill: '#040405', stroke: '#2c2d31', sw: 1.5 });
decor.push({ t: 'rect', x: X(971) - 13, y: Y(496) - 10, w: 26, h: 20, r: 4, fill: '#1d1e21', stroke: '#3d3e43', sw: 1.2 });
deadButton(971, 588.5, 'blue', 'MOD');

// POLY
fader('voice.detune', 1026.5, 'top', {
  def: 0, label: 'UNISON\nDETUNE', module: 'osc', fmt: (v) => `±${(v * 5).toFixed(1)} cents`,
  help: 'How far apart the stacked voices are tuned when the POLY EDIT menu stacks several voices on each note (UNISON or MONO-2 and up). Up to 50 cents either side.',
});

// Volume and portamento
const KNOB_SCALE = { ticks: 11, labels: [{ at: 0, text: '0' }, { at: 10, text: '10' }], size: 15 };
controls.push({
  id: 'out.volume', type: 'knob', x: X(172.5), y: Y(652.5), r: 26, style: 'd-silver', kind: 'cont', min: 0, max: 10, def: 7,
  label: 'VOLUME', labelPos: 'bottom', labelSize: 17, labelGap: 8, module: 'out', scale: KNOB_SCALE,
  help: 'Master output level.',
}, {
  id: 'glide.time', type: 'knob', x: X(172.5), y: Y(734), r: 26, style: 'd-silver', kind: 'cont', min: 0, max: 10, def: 0,
  label: 'PORTAMENTO', labelPos: 'bottom', labelSize: 17, labelGap: 8, module: 'glide', scale: KNOB_SCALE,
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  help: 'Glide time between notes, up to 10 seconds. In POLY each voice glides from the last note it played, so chords smear into each other.',
});

// OSC 1 & 2
fader('osc1.pitchMod', 237.5, 'bot', {
  def: 0, label: 'PITCH\nMOD', module: 'osc', fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the chosen modulation source (LFO 1 unless the OSC EDIT menu says otherwise) bends the pitch. A little gives vibrato; a lot, up to three octaves, gives sirens and swoops.',
});
fader('osc1.pwm', 277.5, 'bot', {
  def: 0, label: 'PWM', module: 'osc', fmt: (v) => `${Math.round(50 + 4.9 * v)} %`,
  help: 'Pulse width of OSC 1’s square wave, from 50% (hollow) to a narrow, nasal pulse. With a modulation source chosen in the OSC EDIT menu it sets how far that source sweeps the width instead.',
});
fader('osc2.pitchMod', 325, 'bot', {
  def: 0, label: 'PITCH\nMOD', module: 'osc', fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the chosen modulation source bends OSC 2’s pitch on its own, so the two oscillators can move against each other.',
});
fader('osc2.toneMod', 364.5, 'bot', {
  def: 0, label: 'TONE\nMOD', module: 'osc', fmt: (v) => `${Math.round(50 + v * 5)} %`,
  help: 'Cuts a gap into each half of OSC 2’s square wave. At 0 it is a plain square; as it rises the tone gets thinner and more buzzy. With a source chosen in the OSC EDIT menu it sets how far that source moves the gap.',
});
fader('osc2.pitch', 404, 'bot', {
  min: -12, max: 12, def: 0, label: 'PITCH', module: 'osc', fmt: fmtSemi,
  help: 'Tunes OSC 2 up to an octave above or below OSC 1. Small offsets make the two beat against each other; +7 or +12 stack a fifth or an octave.',
});
fader('osc2.level', 443.5, 'bot', {
  def: 0, label: 'LEVEL', module: 'mixer', fmt: fmtDb,
  help: 'How much of OSC 2 goes into the filter. At the bottom OSC 2 is off.',
});
fader('noise.level', 483.5, 'bot', {
  def: 0, label: 'NOISE\nLEVEL', module: 'mixer', fmt: fmtDb,
  help: 'How much white noise goes into the filter: a little adds breath, a lot turns the sound into wind or surf.',
});
button('osc1.saw', 238.5, 791, 'white', { def: true, label: 'Sawtooth', labelPos: 'none', module: 'osc', help: 'Switches OSC 1’s sawtooth on or off. It can sound together with the square.' });
button('osc1.pulse', 277, 791, 'white', { def: false, label: 'Square', labelPos: 'none', module: 'osc', help: 'Switches OSC 1’s square (pulse) wave on or off. Its width is set by the PWM fader.' });
decor.push({ t: 'wave', x: X(238.5), y: Y(772), size: 11, shape: 'saw', w: 2.4 }, { t: 'wave', x: X(277), y: Y(772), size: 11, shape: 'pulse', w: 2.4 });
button('osc2.sync', 325, 791, 'white', { def: false, label: 'SYNC', module: 'osc', help: 'Hard sync: OSC 2 restarts every time OSC 1 does. Move OSC 2’s PITCH and the tone tears and sweeps instead of detuning.' });

// VCF
fader('vcf.freq', 538.5, 'bot', {
  def: 10, label: 'FREQ', module: 'filter', fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the low-pass filter, 50 Hz to 20 kHz. Down makes the sound darker and duller; up lets all the brightness through.',
});
fader('vcf.res', 578, 'bot', {
  def: 0, label: 'RES', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Resonance: a boost right at the cutoff that makes filter sweeps sound vocal and squelchy.',
});
fader('vcf.env', 626, 'bot', {
  def: 0, label: 'ENV', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the VCF envelope opens the filter on each note. Use INVERT to make it close the filter instead.',
});
fader('vcf.lfo', 666, 'bot', {
  def: 0, label: 'LFO', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far an LFO sweeps the cutoff: a wah-wah or a slow swell. It uses LFO 2 unless the VCF EDIT menu picks LFO 1.',
});
fader('vcf.kybd', 705.5, 'bot', {
  def: 0, label: 'KYBD', module: 'filter', fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Keyboard tracking: higher notes open the filter further, so they stay as bright as low ones. At 10 the cutoff follows the notes exactly.',
});
button('vcf.twoPole', 538.5, 791, 'white', {
  def: false, label: '2 POLE', module: 'filter',
  help: 'Switches the filter from 4-pole (24 dB per octave, round and heavy) to 2-pole (12 dB per octave, brighter and thinner, more buzz left in).',
});
button('vcf.invert', 626, 791, 'white', { def: false, label: 'INVERT', module: 'filter', help: 'Turns the VCF envelope upside down: each note pulls the cutoff down, then lets it rise back.' });

// VCA and HPF
fader('vca.level', 760, 'bot', {
  min: -5, max: 5, def: 0, label: 'LEVEL', module: 'amp', fmt: (v) => `${vcaDb(v) > 0 ? '+' : ''}${vcaDb(v).toFixed(1)} dB`,
  help: 'Level of every voice after the filter, from −12 dB to +6 dB.',
});
fader('hpf.freq', 815, 'bot', {
  def: 0, label: 'FREQ', module: 'filter', fmt: (v) => fmtHz(hpfHz(v)),
  help: 'High-pass filter on the mixed sound of all the voices: it takes off bass below the cutoff, 20 Hz to 2 kHz. Use it to thin out pads so they sit above the bass.',
});
button('hpf.boost', 815, 791, 'white', {
  def: false, label: 'BOOST', module: 'filter',
  help: 'Adds 12 dB of bass boost after the voices are mixed. The manual does not give the frequency; here it is a shelf below about 110 Hz.',
});

// Envelopes: four faders, three envelopes, times or curves
const ENVS = [['vca', 'VCA', 'VCA envelope'], ['vcf', 'VCF', 'VCF envelope'], ['mod', 'MOD', 'MOD envelope']];
const STAGES = [
  ['attack', 'A', 870, 'How long the envelope takes to rise to full after a key is pressed.'],
  ['decay', 'D', 910, 'How long it takes to fall from the peak to the sustain level.'],
  ['sustain', 'S', 949, 'The level it holds while the key is held down.'],
  ['release', 'R', 988.5, 'How long it takes to fade to nothing after the key is let go.'],
];
const ENV_DEF = { vca: [0, 5, 10, 3], vcf: [0, 5, 5, 3], mod: [0, 5, 5, 3] };
const WHAT = { vca: 'the volume of each note', vcf: 'the filter cutoff (with the VCF ENV fader)', mod: 'whatever the OSC EDIT menu sends it to' };
ENVS.forEach(([e, name, full]) => {
  STAGES.forEach(([stage, label, px, help], i) => {
    const isTime = stage !== 'sustain';
    fader(`${e}Env.${stage}`, px, 'bot', {
      def: ENV_DEF[e][i], label, module: 'env', show: [{ id: 'env.select', eq: e }, { id: 'env.curves', eq: false }],
      fmt: isTime ? (v) => fmtTime(envTime(v)) : (v) => `${Math.round(v * 10)} %`,
      help: `${full}: ${help.charAt(0).toLowerCase()}${help.slice(1)} This envelope shapes ${WHAT[e]}.${isTime ? ' The manual gives no times; the readout is this app’s estimate.' : ''}`,
    });
    if (!isTime) return;
    fader(`${e}Env.${stage}Curve`, px, 'bot', {
      def: 3, label, module: 'env', show: [{ id: 'env.select', eq: e }, { id: 'env.curves', eq: true }],
      fmt: (v) => (Math.abs(v - 5) < 0.3 ? 'straight' : v < 5 ? 'fast start' : 'slow start'),
      help: `${full}: the shape of the ${stage} stage. At 5 it is a straight line; below 5 it moves fast at first and slows down (the usual analogue shape); above 5 it starts slowly and speeds up.`,
    });
  });
});
controls.push({
  id: 'env.select', type: 'select', ui: true, x: X(929), y: Y(791), ...BTN, lamp: 'white', kind: 'enum', def: 'vca', label: 'Envelope select', labelPos: 'none',
  module: 'env', options: ENVS.map(([v, t, full]) => ({ v, label: full, text: t, x: X({ vca: 889, vcf: 929, mod: 968.5 }[v]), y: Y(791) })),
  help: 'Chooses which of the three envelopes the A, D, S and R faders show and move: VCA (loudness), VCF (filter) or MOD (modulation). The others keep their settings.',
});
button('env.curves', 1025, 791, 'blue', {
  ui: true, def: false, label: 'CURVES', module: 'env',
  help: 'Switches the A, D, S and R faders from stage times to stage shapes for the envelope that is selected. S has no curve here.',
});
[[687.5, 'M-8 6 Q-8 -8 0 -8 Q8 -8 8 6'], [721.5, 'M-9 6 L0 -7 L9 6'], [754, 'M-8 7 Q-6 -8 0 -8 Q4 -8 8 7']].forEach(([py, d]) => {
  decor.push({ t: 'path', d: d.replace(/(-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g, (m, a, _, b) => `${X(1025) + Number(a) * 1.3} ${Y(py) + Number(b) * 1.3}`), w: 2.2 });
});

// ── Display menu rows ─────────────────────────────────────────────────────
const LCD = { x: (X(588) + X(764)) / 2, w: X(764) - X(588) - 16, top: Y(449) + 52 };
const rows = { };
const menu = (page, id, label, rest) => {
  const i = (rows[page] = (rows[page] || 0) + 1) - 1;
  controls.push({ id, type: 'menu', x: LCD.x, y: LCD.top + i * 25, w: LCD.w, h: 24, size: 14.5, vw: 124, show: { id: 'ui.page', eq: page }, label, ...rest });
};
menu('arp', 'arp.mode', 'MODE', {
  kind: 'enum', def: 'up', module: 'mode',
  options: [{ v: 'up', label: 'UP' }, { v: 'down', label: 'DOWN' }, { v: 'updown', label: 'UP-DOWN' }, { v: 'random', label: 'RANDOM' }, { v: 'played', label: 'AS PLAYED' }],
  help: 'The order the arpeggiator plays the held notes in.',
});
menu('arp', 'arp.octaves', 'OCTAVES', {
  kind: 'enum', def: 1, module: 'mode', options: [1, 2, 3, 4].map((v) => ({ v, label: String(v) })),
  help: 'How many octaves the arpeggio climbs through before starting again.',
});
[1, 2].forEach((n) => {
  menu(`lfo${n}`, `lfo${n}.shape`, 'SHAPE', {
    kind: 'enum', def: 'tri', module: 'lfo', options: SHAPES,
    help: `Waveform of LFO ${n}. Sine and triangle wobble smoothly, square jumps between two values, the ramps rise or fall and then snap back, S&H jumps to a random value each cycle and S&GLIDE slides between random values.`,
  });
  menu(`lfo${n}`, `lfo${n}.keySync`, 'KEY SYNC', {
    kind: 'enum', def: 'off', module: 'lfo', options: OFF_ON,
    help: `ON restarts LFO ${n} from the beginning of its cycle on every new note, so each note wobbles the same way. OFF lets it run freely.`,
  });
});
menu('poly', 'voice.mode', 'POLYPHONY', {
  kind: 'enum', def: 'poly', module: 'osc', options: POLY_MODES,
  help: 'How the twelve voices are shared out. POLY plays up to twelve notes. UNISON-n stacks n voices on every note, detuned by UNISON DETUNE. MONO plays one note at a time (MONO-n with n voices stacked). POLY-6 and POLY-8 limit the number of notes.',
});
menu('poly', 'voice.drift', 'OSC DRIFT', {
  kind: 'cont', min: 0, max: 10, def: 0, module: 'osc', fmt: (v) => (v <= 0 ? 'OFF' : String(Math.round(v * 25.5))),
  help: 'Slow random pitch wander on each voice, separately, like an old analogue synth that is not quite in tune with itself.',
});
menu('osc', 'osc1.range', 'OSC1 RANGE', { kind: 'enum', def: '8', module: 'osc', options: RANGE, help: 'Octave of OSC 1, in organ-pipe feet: 16’ is lowest, 4’ highest.' });
menu('osc', 'osc2.range', 'OSC2 RANGE', { kind: 'enum', def: '8', module: 'osc', options: RANGE, help: 'Octave of OSC 2, in organ-pipe feet: 16’ is lowest, 4’ highest.' });
menu('osc', 'osc1.pmSrc', 'OSC1 PMOD SRC', { kind: 'enum', def: 'lfo1', module: 'mod', options: MOD_SRC, help: 'What OSC 1’s PITCH MOD fader bends the pitch with: an LFO, one of the envelopes, or an LFO kept above zero (UNI).' });
menu('osc', 'osc1.pmMode', 'PMOD MODE', {
  kind: 'enum', def: 'both', module: 'mod', options: [{ v: 'both', label: 'OSC1+2' }, { v: 'osc1', label: 'OSC1' }],
  help: 'Whether OSC 1’s PITCH MOD moves both oscillators together (OSC1+2) or only OSC 1.',
});
menu('osc', 'osc1.pwmSrc', 'PWM SRC', { kind: 'enum', def: 'manual', module: 'mod', options: MANUAL_SRC, help: 'MANUAL: the PWM fader sets the pulse width. Any other choice: that source sweeps the width and the fader sets how far.' });
menu('osc', 'osc2.pmSrc', 'OSC2 PMOD SRC', { kind: 'enum', def: 'lfo1', module: 'mod', options: MOD_SRC, help: 'What OSC 2’s PITCH MOD fader bends its pitch with.' });
menu('osc', 'osc2.tmSrc', 'TMOD SRC', { kind: 'enum', def: 'manual', module: 'mod', options: MANUAL_SRC, help: 'MANUAL: the TONE MOD fader sets the tone directly. Any other choice: that source moves it and the fader sets how far.' });
menu('vcf', 'vcf.lfoSel', 'LFO SELECT', {
  kind: 'enum', def: 'lfo2', module: 'filter', options: [{ v: 'lfo1', label: 'LFO 1' }, { v: 'lfo2', label: 'LFO 2' }],
  help: 'Which LFO the VCF’s LFO fader uses. LFO 2 by default, so LFO 1 is free for vibrato.',
});
menu('vcf', 'vcf.mwLfo', 'MW>LFO DEPTH', {
  kind: 'cont', min: 0, max: 10, def: 0, module: 'mod', fmt: (v) => String(Math.round(v * 25.5)),
  help: 'How much the mod wheel adds to the filter’s LFO depth. Turn it up, then push the wheel to bring in a filter wobble while you play.',
});

// ── FX pages ──────────────────────────────────────────────────────────────
// Four slots, each loaded with one of 35 algorithms of up to 12 parameters. The FX page has nine short rows: EDIT picks
// the routing page or a slot, PAGE picks the slot's first seven parameters or the rest. Every parameter of every
// algorithm in every slot is a control of its own (fx<slot>.<algorithm>.<ref>), shown only while its slot has that
// algorithm loaded, so a slot keeps each algorithm's settings when you switch between them, as the hardware does.
const FX_ROW = { h: 19, size: 12.5, step: 20, y0: Y(449) + 50 };
const fxRow = (id, row, half, show, rest) => {
  const w = half ? LCD.w / 2 - 4 : LCD.w;
  const x = half === 'left' ? LCD.x - LCD.w / 4 - 2 : half === 'right' ? LCD.x + LCD.w / 4 + 2 : LCD.x;
  controls.push({ id, type: 'menu', x, y: FX_ROW.y0 + row * FX_ROW.step, w, h: FX_ROW.h, size: FX_ROW.size, vw: 124, show, module: 'fx', ...rest });
};
const ON_FX = { id: 'ui.page', eq: 'fx' };
const SLOTS = [1, 2, 3, 4];
/** Slot LEVEL: off at 0, unity at 8, +4 dB at 10. The manual does not print the range. */
const fxLevel = (v) => (v <= 0 ? 0 : Math.pow(v / 8, 2));
const fmtFxLevel = (v) => (v <= 0 ? 'off' : `${v >= 8 ? '+' : ''}${(40 * Math.log10(v / 8)).toFixed(1)} dB`);
const fmtUnit = {
  ms: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`),
  s: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} s`,
  Hz: (v) => fmtHz(v),
  '%': (v) => `${Math.round(v)} %`,
  dB: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  deg: (v) => `${Math.round(v)}°`,
  x: (v) => `${v.toFixed(2)}×`,
  st: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`,
  ct: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`,
  m: (v) => `${Math.round(v)} m`,
  bit: (v) => `${Math.round(v)} bit`,
  '': (v) => (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))),
};

fxRow('ui.fxSlot', 0, 'left', ON_FX, {
  ui: true, kind: 'enum', def: 'route', label: 'EDIT', vw: 92, name: 'FX edit page',
  options: [{ v: 'route', label: 'ROUTING' }, ...SLOTS.map((s) => ({ v: String(s), label: `SLOT ${s}` }))],
  help: 'Chooses what the FX page shows: the routing and the four slot levels, or the effect loaded into one slot and its settings. This changes what you see, not the sound.',
});
fxRow('ui.fxPart', 0, 'right', [ON_FX, { id: 'ui.fxSlot', in: SLOTS.map(String) }], {
  ui: true, kind: 'enum', def: 'a', label: 'PAGE', vw: 70, name: 'FX parameter page',
  options: [{ v: 'a', label: '1-7' }, { v: 'b', label: '8-12' }],
  help: 'An effect has up to twelve settings and the screen shows seven at a time. This picks the first seven or the rest. It changes what you see, not the sound.',
});
const ON_ROUTE = [ON_FX, { id: 'ui.fxSlot', eq: 'route' }];
fxRow('fx.mode', 1, null, ON_ROUTE, {
  kind: 'enum', def: 'insert', label: 'MODE', name: 'FX mode', options: FX_MODES.map(({ v, label }) => ({ v, label })),
  help: `How the effects join the sound. ${FX_MODES.map((m) => `${m.label}: ${m.help.charAt(0).toLowerCase()}${m.help.slice(1)}`).join(' ')}`,
});
fxRow('fx.routing', 2, null, ON_ROUTE, {
  kind: 'enum', def: 1, label: 'ROUTING', vw: 190, name: 'FX routing', options: FX_ROUTINGS.map(({ v, label }) => ({ v, label })),
  help: 'How the four slots are connected: in a row (>), side by side (+), or with one slot’s output fed back through others (FB). A slot with nothing loaded is skipped.',
});
SLOTS.forEach((s) => {
  fxRow(`fx${s}.level`, 2 + s, null, ON_ROUTE, {
    kind: 'cont', min: 0, max: 10, def: 8, label: `SLOT ${s} LEVEL`, name: `FX slot ${s} level`, fmt: fmtFxLevel,
    help: `Output level of slot ${s}. At 0 the slot is silent, which also silences everything after it in a row. 8 leaves the level as it is.`,
  });
  const onSlot = [ON_FX, { id: 'ui.fxSlot', eq: String(s) }];
  fxRow(`fx${s}.type`, 1, null, onSlot, {
    kind: 'enum', def: 'none', label: 'TYPE', vw: 150, name: `FX slot ${s} type`,
    options: [{ v: 'none', label: 'NONE' }, ...FX_ALGOS.map((a) => ({ v: a.id, label: a.short }))],
    help: `Which effect is loaded into slot ${s}: one of 35, from reverbs and delays to a compressor, an amp, a pitch shifter and a rotary speaker. NONE leaves the slot empty.`,
  });
  FX_ALGOS.forEach((a) => a.params.forEach((q, k) => {
    const show = [...onSlot, { id: 'ui.fxPart', eq: k < 7 ? 'a' : 'b' }, { id: `fx${s}.type`, eq: a.id }];
    const common = { label: q.label, name: `FX ${s} ${a.name}: ${q.name}`, help: q.help, deep: true, find: s === 1 };
    if (q.options) {
      fxRow(`fx${s}.${a.id}.${q.ref.toLowerCase()}`, 2 + (k % 7), null, show, { ...common, kind: 'enum', def: q.def, options: q.options.map((o) => ({ v: o, label: o })) });
    } else {
      fxRow(`fx${s}.${a.id}.${q.ref.toLowerCase()}`, 2 + (k % 7), null, show, {
        ...common, kind: 'cont', min: q.min, max: q.max, def: q.def, fmt: fmtUnit[q.unit || ''], ...(q.log ? { taper: 'log' } : {}), ...(q.step ? { step: q.step } : {}),
      });
    }
  }));
});
const FX_BY_ID = Object.fromEntries(FX_ALGOS.map((a) => [a.id, a]));

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0, y0, x1, y1) => ({ x: X(x0), y: Y(y0), w: X(x1) - X(x0), h: Y(y1) - Y(y0) });
const areas = [
  { id: 'voices', label: 'Voice lamps', module: 'mode', keywords: 'polyphony leds allocation',
    rects: [R(740, 382, 1040, 416)],
    help: 'One lamp for each of the twelve voices. A lamp lights while its voice is sounding, so you can watch notes being handed out to voices as you play, and see several lamps come on for one note in UNISON.' },
  { id: 'arp', label: 'Arpeggiator', module: 'mode', keywords: 'arp arpeggio sequencer tempo bpm hold latch chord',
    rects: [R(209, 418, 344, 612)],
    help: 'Plays held notes one after another at the tempo set by RATE. GATE TIME sets how long each note lasts, TAP/HOLD keeps it going after you let go, and ARP EDIT sets the order and range. CHORD and POLY CHORD are not modelled here.' },
  { id: 'lfos', label: 'LFO 1 and LFO 2', module: 'lfo', keywords: 'vibrato wobble tremolo modulation shape delay fade',
    rects: [R(345, 418, 573, 612)],
    help: 'Two low-frequency oscillators, each with its own RATE and DELAY TIME. The column of lamps shows each one’s shape, chosen in its EDIT menu. LFO 1 normally makes vibrato and PWM; LFO 2 normally moves the filter.' },
  { id: 'display', label: 'Display and menus', module: 'mode', keywords: 'screen menu edit program settings encoder data entry effects fx reverb delay chorus',
    rects: [R(574, 418, 997, 612)],
    help: 'The screen shows the menu of whichever EDIT button is lit. Most of what has no fader of its own is set here: oscillator ranges, modulation sources, LFO shapes, polyphony, arpeggio mode, and the whole effects engine behind the FX button. Click a value on the screen to change it. The navigation buttons, encoder and DATA ENTRY fader are not modelled; the screen is clicked directly instead.' },
  { id: 'poly', label: 'Poly', module: 'mode', keywords: 'unison detune voices stack mono polyphony',
    rects: [R(998, 418, 1052, 612)],
    help: 'UNISON DETUNE spreads the tuning of voices that are stacked on one note. Whether they are stacked at all is set in POLY EDIT on the display.' },
  { id: 'performance', label: 'Volume and portamento', module: 'out', keywords: 'master volume glide portamento',
    rects: [R(122, 618, 210, 836)],
    help: 'Master VOLUME, and PORTAMENTO, which makes the pitch glide from one note to the next.' },
  { id: 'osc', label: 'Oscillators and noise', module: 'osc', keywords: 'vco dco sawtooth square pwm sync detune tone mod noise mixer',
    rects: [R(211, 618, 511, 836)],
    help: 'Two oscillators and a noise source. OSC 1 has a sawtooth and a square that switch on separately, with pulse-width modulation. OSC 2 is a square with TONE MOD, its own PITCH and LEVEL, and SYNC to OSC 1. NOISE LEVEL mixes in white noise. OSC 1 has no level fader: it is always in.' },
  { id: 'vcf', label: 'Filter (VCF)', module: 'filter', keywords: 'cutoff resonance brightness low-pass envelope keyboard tracking',
    rects: [R(512, 618, 733, 836)],
    help: 'The low-pass filter in each voice. FREQ sets the brightness and RES the resonance. ENV, LFO and KYBD set how far the VCF envelope, an LFO and the keyboard move the cutoff. 2 POLE makes it gentler and INVERT flips the envelope.' },
  { id: 'vca', label: 'Amplifier (VCA)', module: 'amp', keywords: 'volume level loudness',
    rects: [R(734, 618, 786, 836)],
    help: 'The level of every voice after the filter. Its loudness over time comes from the VCA envelope in the ENVELOPES section.' },
  { id: 'hpf', label: 'High-pass filter', module: 'filter', keywords: 'hpf bass cut low cut boost',
    rects: [R(787, 618, 842, 836)],
    help: 'A gentle high-pass filter on the mix of all the voices, with a bass BOOST. It shapes the whole sound at once, after the voices are added together.' },
  { id: 'env', label: 'Envelopes', module: 'env', keywords: 'adsr attack decay sustain release curves contour eg',
    rects: [R(843, 618, 1052, 836)],
    help: 'Three envelopes share one set of A, D, S and R faders. The VCA, VCF and MOD buttons choose which one the faders move; CURVES switches the faders to the shape of each stage instead of its time.' },
];
annotate(unusual, controls, [], areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const envOf = (v, e) => ({
  a: envTime(v[`${e}Env.attack`]), d: envTime(v[`${e}Env.decay`]), s: v[`${e}Env.sustain`] / 10, r: envTime(v[`${e}Env.release`]),
  curve: { a: v[`${e}Env.attackCurve`] / 10, d: v[`${e}Env.decayCurve`] / 10, r: v[`${e}Env.releaseCurve`] / 10 },
});
const lfoOf = (v, n) => ({
  rate: lfoHz(v[`lfo${n}.rate`]), mix: SHAPE_MIX[v[`lfo${n}.shape`]], keySync: v[`lfo${n}.keySync`] === 'on', delay: lfoDelay(v[`lfo${n}.delay`]),
});

/** The effects engine: nothing at all while bypassed or empty, so its settings count as unused then. */
function fxOf(v) {
  const slots = SLOTS.map((s) => {
    const a = FX_BY_ID[v[`fx${s}.type`]];
    if (!a) return { alg: null };
    return { alg: a.id, level: fxLevel(v[`fx${s}.level`]), p: Object.fromEntries(a.params.map((q) => [q.ref, v[`fx${s}.${a.id}.${q.ref.toLowerCase()}`]])) };
  });
  if (v['fx.mode'] === 'bypass' || !slots.some((x) => x.alg)) return { mode: 'bypass' };
  return { mode: v['fx.mode'], routing: v['fx.routing'], slots };
}

function toEngine(v, ctx) {
  const routes = [];
  const route = (src, dst, amt) => { if (amt !== 0) routes.push({ src: SIG[src], dst, amt }); };
  // OSC 1: pulse width, set by hand or swept by a source (then the fader is the depth)
  const pwm = v['osc1.pwm'] / 10;
  let pw1 = 0.5 + 0.49 * pwm;
  if (v['osc1.pwmSrc'] !== 'manual') {
    const bi = BIPOLAR[v['osc1.pwmSrc']];
    pw1 = 0.5 + (bi ? 0.235 * pwm : 0);
    route(v['osc1.pwmSrc'], 'pw1', (bi ? 0.235 : 0.47) * pwm);
  }
  // OSC 2: the TONE MOD gap, the same way
  const tm = v['osc2.toneMod'] / 10;
  let gap = 0.6 * tm;
  if (v['osc2.tmSrc'] !== 'manual') {
    const bi = BIPOLAR[v['osc2.tmSrc']];
    gap = bi ? 0.3 * tm : 0;
    route(v['osc2.tmSrc'], 'pw2', (bi ? 0.3 : 0.6) * tm);
  }
  route(v['osc1.pmSrc'], v['osc1.pmMode'] === 'both' ? 'pitchAll' : 'pitch1', pitchModSemi(v['osc1.pitchMod']));
  route(v['osc2.pmSrc'], 'pitch2', pitchModSemi(v['osc2.pitchMod']));
  const lfoDepth = Math.pow(v['vcf.lfo'] / 10, 2) + (v['vcf.mwLfo'] / 10) * (ctx.wheel || 0);
  route(v['vcf.lfoSel'], 'cutoff', 5 * lfoDepth);
  const [voices, stack, mono] = POLY_SHAPE[v['voice.mode']];
  const drift = v['voice.drift'] / 10;
  return {
    osc: [
      { level: 0.5, mix: { saw: v['osc1.saw'] ? 1 : 0, pulse: v['osc1.pulse'] ? 1 : 0 }, pw: pw1, semi: RANGE_SEMI[v['osc1.range']], kbd: true, syncTo: -1 },
      { level: 0.5 * dbLevel(v['osc2.level']), mix: { notch: 1 }, pw: gap, semi: RANGE_SEMI[v['osc2.range']] + v['osc2.pitch'], kbd: true, syncTo: v['osc2.sync'] ? 0 : -1 },
    ],
    noise: { level: 0.35 * dbLevel(v['noise.level']), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: v['vcf.twoPole'] ? 'svf' : 'ladder', mode: 'lp', cutoff: vcfHz(v['vcf.freq']), res: (v['vcf.res'] / 10) * 1.05,
      envAmt: (v['vcf.env'] / 10) * 8 * (v['vcf.invert'] ? -1 : 1), envSrc: 'env1', kbd: v['vcf.kybd'] / 10,
    },
    env1: envOf(v, 'vcf'), env2: envOf(v, 'vca'), env3: envOf(v, 'mod'),
    vca: { envSrc: 'env2', bias: 0, gain: Math.pow(10, vcaDb(v['vca.level']) / 20) },
    lfo: lfoOf(v, 1), lfo2: lfoOf(v, 2),
    glide: { time: portaTime(v['glide.time']), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: { voices, stack, mono, detune: (v['voice.detune'] / 10) * 0.5 },
    drift: { depth: drift > 0 ? 0.3 * drift * drift : 0, rate: 1.2 },
    arp: { on: !!v['arp.on'], bpm: bpm(v['arp.rate']), gate: v['arp.gate'] / 10, mode: v['arp.mode'], octaves: v['arp.octaves'], hold: !!v['arp.hold'] },
    post: { hpf: hpfHz(v['hpf.freq']), boost: !!v['hpf.boost'] },
    fx: fxOf(v),
    routes,
    normals: {},
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0,
    volume: level10(v['out.volume'], 1),
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
const ENV = (e, a, d, s, r) => ({ 'env.select': e, 'env.curves': false, [`${e}Env.attack`]: a, [`${e}Env.decay`]: d, [`${e}Env.sustain`]: s, [`${e}Env.release`]: r });
const presets = [
  {
    id: 'jump-brass', name: 'Bright Poly Brass', ref: 'In the style of Van Halen — "Jump"', artist: 'Van Halen',
    tags: ['brass', 'rock', '80s'], level: 1,
    blurb: 'Big, bright chords with a quick bite at the front of every stab.',
    how: 'Every voice plays OSC 1’s sawtooth with OSC 2 detuned slightly against it, so each note of the chord is already thick. The filter starts part-closed and the VCF envelope flicks it open and back down on each chord, which gives the brassy "blat". Twelve voices mean every note of the chord gets its own filter and envelope.',
    phrase: { bpm: 132, loop: true, steps: [[0, 59, 0.4], [0, 62, 0.4], [0, 67, 0.4], [0.5, 59, 0.4], [0.5, 62, 0.4], [0.5, 67, 0.4], [1.5, 60, 0.45], [1.5, 64, 0.45], [1.5, 67, 0.45], [2, 60, 0.9], [2, 64, 0.9], [2, 67, 0.9], [3, 62, 0.9], [3, 65, 0.9], [3, 69, 0.9]] },
    steps: [
      { title: 'A sawtooth and a square, slightly apart', module: 'osc', why: 'OSC 1 and OSC 2 (the two oscillators, which make the raw tone) are set up so every note of a chord is already two slightly different waves. That doubling is what makes poly brass sound thick rather than thin.\n- Sawtooth On, Square Off: OSC 1’s sawtooth carries every harmonic, the bright, buzzy raw material brass needs. OSC 1 has no level fader; it is always in.\n- LEVEL · osc 2 8 (−9.6 dB): brings OSC 2’s square in a little under OSC 1. At 0 it is silent; higher makes it an equal partner.\n- PITCH +0.1 st: tunes OSC 2 a tenth of a semitone sharp. Too small to hear as out of tune, but the two waves drift in and out of phase.\n- TONE MOD 2 (60 %): cuts a small gap into OSC 2’s square, making it a little thinner and buzzier so it blends with the saw.\n- Listen for: a slow beating on a held chord. Set PITCH back to 0 and the chord goes still and narrower.',
        set: { 'osc1.saw': true, 'osc1.pulse': false, 'osc2.level': 8, 'osc2.pitch': 0.12, 'osc2.toneMod': 2 } },
      { title: 'Close the filter part way', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass filter in each voice: it keeps the lows and cuts the highs. Pulling it down from fully open takes the fizz off, so the envelope in the next step has room to add bite.\n- FREQ · VCF 4.2 (619 Hz): the cutoff. Between stabs the chords now sound darker and rounder; up brightens, down muffles.\n- RES 1.5 (15 %): resonance, a small boost at the cutoff. Just enough edge to sound brassy rather than woolly; much more and it starts to whistle.\n- KYBD 5 (50 %): keyboard tracking. Higher notes open the filter further, so the top of a chord does not go dull next to the bottom.\n- Listen for: play a chord and move FREQ between 3 and 6. Low is a muted horn, high is closer to the bright stab.',
        set: { 'vcf.freq': 4.2, 'vcf.res': 1.5, 'vcf.kybd': 5 } },
      { title: 'Let the VCF envelope open it on each stab', module: 'env', why: 'An envelope is a shape that runs each time you play. The DeepMind has three sharing one set of A, D, S and R faders (attack, decay, sustain, release); pressing VCF points them at the filter envelope. This is the brassy “blat” on each stab.\n- Envelope select VCF, CURVES Off: the faders now move the filter envelope, and set stage times rather than stage shapes.\n- A 1.2 (6 ms): a very quick rise, so the brightness arrives almost at once, with the slight swell of a horn.\n- D 4.2 (210 ms), S 4 (40 %): the cutoff falls back over about a fifth of a second and holds at 40 % while the chord is held. Longer decay gives a slower “waah”.\n- R 3.2 (88 ms): how quickly the filter closes after you let go.\n- ENV 5.5 (55 %): how far the envelope lifts the cutoff above 619 Hz. Lower for a softer horn section, higher for more bite.\n- Listen for: a bright bite at the front of each stab, then the tone settling. Set ENV to 0 and the chords go flat and dull.',
        set: { ...ENV('vcf', 1.2, 4.2, 4, 3.2), 'vcf.env': 5.5 } },
      { title: 'Shape the loudness', module: 'env', why: 'The VCA (voltage-controlled amplifier) sets each voice’s loudness, and its envelope shapes that level over time. Stabs want an instant start, a full body while held and a clean stop.\n- Envelope select VCA, CURVES Off: the faders now move the loudness envelope; the filter envelope keeps its settings.\n- A 0.6 (2 ms): full level almost at once, so the punch lines up with the filter bite.\n- D 5 (380 ms), S 9 (90 %): the level dips only a little after the start, so held chords stay loud.\n- R 3 (73 ms): short, so each stab stops quickly rather than smearing into the next.\n- Listen for: play short stabs in a rhythm. Raise R to 6 and the gaps fill in; bring it back and the stabs are tight again.',
        set: ENV('vca', 0.6, 5, 9, 3) },
    ],
    context: {
      'vcf.env': 'In this sound: how far each stab opens the filter. Lower it for a softer horn section, raise it for more bite.',
      'vcfEnv.decay': 'In this sound: the length of the bite. Longer gives a slower "waah".',
      'osc2.pitch': 'In this sound: the slight detune that thickens each note.',
    },
    tweaks: [
      { id: 'vcf.env', try: 'Move between 3 and 8 while the chords play', hear: 'From mellow pads to snarling brass.' },
      { id: 'vcf.twoPole', try: 'Switch 2 POLE on', hear: 'Thinner and brighter, closer to a Roland than an Oberheim.' },
    ],
  },
  {
    id: 'sync-lead', name: 'Tearing Sync Lead', ref: 'In the style of The Cars — "Let’s Go"', artist: 'The Cars',
    tags: ['lead', 'new wave', '80s'], level: 2,
    blurb: 'A hard, tearing lead whose tone sweeps down at the start of each note.',
    how: 'SYNC makes OSC 2 restart with every cycle of OSC 1, so OSC 2’s own pitch changes its tone rather than its note. The MOD envelope is sent to OSC 2’s pitch: each note starts with OSC 2 far above OSC 1 and sweeps down, which is the tearing sound. MONO mode with portamento makes it a lead line.',
    phrase: { bpm: 120, loop: true, steps: [[0, 64, 0.45], [0.5, 67, 0.45], [1, 69, 0.9], [2, 72, 0.45], [2.5, 71, 0.45], [3, 67, 0.9]] },
    steps: [
      { title: 'One note at a time', module: 'mode', why: 'A lead line wants one note at a time, with the pitch sliding from one to the next. On the DeepMind that is a POLYPHONY setting in a display menu, not a switch on the panel.\n- Display page POLY EDIT: the amber EDIT button opens the POLY menu on the screen. It changes what you see, not the sound.\n- POLYPHONY MONO: one note at a time; a new key takes over from the last, as on a mono synth.\n- PORTAMENTO 1.2 (140 ms): the glide time between notes. Short, so runs slur just a little; higher gives a slower swoop.\n- Listen for: play a run of notes. The pitch slides quickly between them instead of jumping.',
        set: { 'ui.page': 'poly', 'voice.mode': 'mono', 'glide.time': 1.2 } },
      { title: 'Sync OSC 2 and bring it in', module: 'osc', why: 'Hard sync is the source of the tearing tone. OSC 2 (the second oscillator) is forced to restart every time OSC 1 does, so it follows OSC 1’s pitch, and its own PITCH changes the tone rather than the note.\n- SYNC On: locks OSC 2 to OSC 1’s cycle.\n- Sawtooth Off, Square Off: OSC 1 has no level fader, so switching both its waves off is how you take it out of the sound. It still drives the sync.\n- LEVEL · osc 2 10 (0.0 dB): OSC 2 at full level, now the only thing you hear.\n- PITCH +5 st: pushes OSC 2 up a fourth. Because of sync the note stays put and the wave gets a harsher, more nasal edge. Higher is more tearing.\n- Listen for: hold a note and slowly move PITCH up from 0. The pitch stays the same while the tone sweeps and snarls.',
        set: { 'osc2.sync': true, 'osc1.saw': false, 'osc1.pulse': false, 'osc2.level': 10, 'osc2.pitch': 5 } },
      { title: 'Sweep it with the MOD envelope', module: 'mod', why: 'Now an envelope moves OSC 2’s pitch, so the sync sweep happens by itself on every note. OSC EDIT is where the DeepMind chooses what bends each oscillator’s pitch.\n- Display page OSC EDIT: opens the oscillator menu on the screen.\n- OSC2 PMOD SRC MOD ENV: OSC 2’s pitch modulation (PMOD) now comes from the MOD envelope, the third of the three envelopes, instead of LFO 1.\n- PITCH MOD · osc 2 5.5 (+10.9 st): how far the envelope pushes OSC 2 up at its peak, nearly an octave above where it rests. More gives a longer, more dramatic tear.\n- Listen for: each note now starts much harsher and slides part of the way back over about 0.4 s, then holds. The MOD envelope still has its starting sustain of 50 %; the next step lets it fall all the way.',
        set: { 'ui.page': 'osc', 'osc2.pmSrc': 'modEnv', 'osc2.pitchMod': 5.5 } },
      { title: 'Make the MOD envelope a falling sweep', module: 'env', why: 'Press MOD so the A, D, S and R faders (attack, decay, sustain, release) move the MOD envelope. Shaped as a quick fall to nothing, it makes the tearing swoop at the start of every note.\n- Envelope select MOD, CURVES Off: the faders now move the MOD envelope and set times, not curve shapes.\n- A 0 (1 ms): the envelope jumps straight to its peak, so each note starts at the top of the sweep.\n- D 5.2 (440 ms), S 0 (0 %): OSC 2 slides down over nearly half a second and lands on its resting PITCH. Shorter decay is a quick zap; longer is a slow dive.\n- R 3 (73 ms): matters little here, as the envelope has already fallen to zero.\n- Listen for: a “neeow” on every note as the tone tears down and settles. Sweep D while playing to hear it tighten and stretch.',
        set: ENV('mod', 0, 5.2, 0, 3) },
      { title: 'Open the filter', module: 'filter', why: 'Sync puts strong upper harmonics into the sound, and they are the tear, so the VCF (voltage-controlled filter, a low-pass that cuts the highs) stays mostly open. This step trims the very top and adds a little edge.\n- FREQ · VCF 8.2 (6.8 kHz): high enough to keep the bite, but the harshest fizz is gone. Pull it down and the lead gets thicker and darker.\n- RES 2 (20 %): resonance, a small boost at the cutoff. Sharpens the sweep slightly; much more and it starts to whistle.\n- Listen for: compare FREQ at 10 and at 8.2. The sweep keeps its tear but sits less harshly in a mix.',
        set: { 'vcf.freq': 8.2, 'vcf.res': 2 } },
    ],
    context: {
      'osc2.pitchMod': 'In this sound: the depth of the sweep. More gives a longer, more dramatic tear.',
      'osc2.pitch': 'In this sound: where the sweep settles. Move it and the held tone changes colour.',
    },
    tweaks: [
      { id: 'modEnv.decay', try: 'Set between 3 and 7', hear: 'A snappy zap at 3, a slow vowel-like sweep at 7.' },
      { id: 'osc2.pitch', try: 'Slide it from 0 to 12 while holding a note', hear: 'The classic sync sweep, done by hand.' },
    ],
  },
  {
    id: 'arp-pulse', name: 'Pulsing Arpeggio', ref: 'In the style of Tangerine Dream — "Love on a Real Train"', artist: 'Tangerine Dream',
    tags: ['seq', 'ambient', '80s'], level: 1,
    blurb: 'A held chord turned into a steady, plucked sixteenth-note pattern.',
    how: 'The arpeggiator turns a held chord into a stream of single notes at the tempo of the RATE fader. Each note is short, and the VCF envelope gives it a pluck. LFO 2, set to a slow triangle, sweeps the filter over several bars so the pattern keeps changing colour.',
    phrase: { bpm: 100, loop: true, steps: [[0, 57, 3.9], [0, 60, 3.9], [0, 64, 3.9], [4, 55, 3.9], [4, 59, 3.9], [4, 62, 3.9]] },
    steps: [
      { title: 'Turn the arpeggiator on', module: 'mode', why: 'The arpeggiator plays held notes one after another, so a single held chord becomes a moving pattern. Here it runs sixteenth notes up and down over two octaves.\n- ON/OFF On: starts the arpeggiator. Hold a chord and it plays the notes in turn.\n- RATE · arp 3.1 (99 BPM): the tempo. The arpeggiator plays four notes to the beat, so this is a steady sixteenth-note stream. Up is faster.\n- GATE TIME 4 (40 %): each note lasts less than half its step, so the notes are separate plucks. Up makes the pattern legato, down makes it tick; at 0 it plays nothing.\n- ARP EDIT MODE UP-DOWN, OCTAVES 2: in the arpeggiator menu, the notes climb then fall, through the chord and the same notes an octave up.\n- Listen for: hold a three-note chord and hear it climb through two octaves and back. It is still the plain, bright starting sawtooth.',
        set: { 'arp.on': true, 'arp.rate': 3.1, 'arp.gate': 4, 'ui.page': 'arp', 'arp.mode': 'updown', 'arp.octaves': 2 } },
      { title: 'A square-wave pluck', module: 'osc', why: 'OSC 1 (oscillator 1) switches from sawtooth to square. A square has only odd harmonics, which sounds hollower and more woody, good for a pluck.\n- Sawtooth Off, Square On: swaps the buzzy saw for the hollow square. OSC 1 has no level fader, so its wave buttons are its only on/off.\n- PWM 3 (65 %): PWM is pulse-width modulation. With PWM SRC on MANUAL this fader simply sets the width. Moving away from 50 % narrows the pulse, which sounds thinner and a little nasal; at 0 it is a plain square.\n- Listen for: the pattern loses its buzz and turns rounder. Sweep PWM from 0 to 6 while it runs to hear it go from hollow to reedy.',
        set: { 'osc1.saw': false, 'osc1.pulse': true, 'osc1.pwm': 3 } },
      { title: 'Pluck the filter', module: 'env', why: 'The VCF (voltage-controlled filter, a low-pass that keeps the lows) is closed down and its envelope flicks it open on every arpeggiated note. That flick is the pluck.\n- Envelope select VCF, CURVES Off: the A, D, S and R faders (attack, decay, sustain, release) now set the filter envelope’s times.\n- A 0, D 3.4 (110 ms), S 0, R 3: the envelope jumps up at once and falls to nothing in about a tenth of a second, so each note is bright only at its start.\n- FREQ · VCF 3 (302 Hz): dark between plucks, so the envelope has somewhere to open from.\n- RES 4 (40 %): resonance, a boost at the cutoff. Gives the pluck a slightly wet, ringing edge.\n- ENV 5 (50 %): how far the envelope opens the filter. Higher is a brighter, sharper flick; lower is a dull thud.\n- Listen for: each note ticks bright and falls away. Sweep D while it runs: short is a tight blip, longer turns into a “wow”.',
        set: { ...ENV('vcf', 0, 3.4, 0, 3), 'vcf.freq': 3, 'vcf.res': 4, 'vcf.env': 5 } },
      { title: 'Slow filter sweep from LFO 2', module: 'lfo', why: 'An LFO (low-frequency oscillator) is a slow wave that moves another control. Here LFO 2 sweeps the cutoff so the pattern changes colour over several bars instead of staying fixed.\n- RATE · LFO 2 1.2 (0.10 Hz): one cycle about every ten seconds. LFO 2 is still on its starting triangle, so the sweep rises and falls smoothly.\n- LFO 5 (50 %): the VCF’s LFO fader, which uses LFO 2 unless the VCF EDIT menu says otherwise. It sets how far the sweep moves the cutoff; more gives a wider swing between muffled and bright.\n- Listen for: hold the chord for twenty seconds. The plucks slowly open up and brighten, then close again. Raise RATE to hear the sweep turn into a wobble.',
        set: { 'lfo2.rate': 1.2, 'vcf.lfo': 5 } },
    ],
    context: {
      'arp.gate': 'In this sound: the length of each note. Up makes the pattern legato, down makes it tick.',
      'vcf.lfo': 'In this sound: how far the slow sweep moves the filter.',
    },
    tweaks: [
      { id: 'arp.rate', try: 'Move between 2 and 6', hear: 'The same pattern from a slow pulse to a racing sequence.' },
      { id: 'vcf.res', try: 'Raise to 7', hear: 'Each pluck rings with a vocal squelch.' },
    ],
  },
  {
    id: 'unison-lead', name: 'Twelve-Voice Unison Lead', ref: 'In the style of trance leads — Paul van Dyk "For an Angel"', artist: 'Paul van Dyk',
    tags: ['lead', 'trance', '90s'], level: 2,
    blurb: 'A huge, shimmering lead made of every voice stacked on one note.',
    how: 'UNISON-12 puts all twelve voices on each note, and UNISON DETUNE spreads their tuning. Twelve slightly different sawtooths beat against each other and sound like a wall. The HPF takes out the low end so the lead does not muddy the bass.',
    phrase: { bpm: 136, loop: true, steps: [[0, 69, 0.45], [0.5, 72, 0.45], [1, 76, 0.45], [1.5, 74, 0.45], [2, 72, 0.9], [3, 71, 0.45], [3.5, 67, 0.45]] },
    steps: [
      { title: 'Stack every voice', module: 'mode', why: 'Unison stacks several voices on one note, the usual way to turn a polysynth into one huge lead. On the DeepMind it is a POLYPHONY choice in the POLY EDIT menu, with a choice of how many voices to stack.\n- Display page POLY EDIT: opens the POLY menu on the screen. It changes the view, not the sound.\n- POLYPHONY UNISON-12: all twelve voices play every note, so only one note sounds at a time.\n- Listen for: the voice lamps across the top all light on each key. It sounds louder but not yet wider: with UNISON DETUNE at 0 the twelve saws are in tune and add up to one big saw.',
        set: { 'ui.page': 'poly', 'voice.mode': 'uni12' } },
      { title: 'Spread their tuning', module: 'osc', why: 'Detuning the stacked voices against each other is where the trance shimmer comes from. Adding OSC 2 (the second oscillator) an octave up makes each of the twelve voices two oscillators thick.\n- UNISON DETUNE 4 (±20.0 cents): spreads the twelve voices up to a fifth of a semitone either side. Too much and it goes out of tune; too little and it collapses back to one voice.\n- Sawtooth On: OSC 1’s saw stays in as the bright core of the lead.\n- LEVEL · osc 2 6 (−19.2 dB): OSC 2 comes in well under OSC 1, as colour rather than a second lead.\n- PITCH +12 st: OSC 2 an octave above, which adds sparkle and helps the lead cut through.\n- Listen for: hold one note and move UNISON DETUNE from 0 to 4. The sound widens into a moving wall with chorus-like beating.',
        set: { 'voice.detune': 4, 'osc1.saw': true, 'osc2.level': 6, 'osc2.pitch': 12 } },
      { title: 'A bright filter with a small bite', module: 'filter', why: 'The VCF (voltage-controlled filter, a low-pass) trims the top of the stack, and its envelope adds a small bite at the start of each note so the lead speaks clearly.\n- FREQ · VCF 7 (3.3 kHz): fairly open, taking off only the harshest fizz of twenty-four oscillators.\n- Envelope select VCF, CURVES Off: the A, D, S and R faders (attack, decay, sustain, release) now set the filter envelope’s times.\n- A 0, D 3.5 (120 ms), S 3 (30 %), R 3: an instant rise and a quick fall to a low hold, so the extra brightness is only a flick at the front.\n- ENV 2.5 (25 %): how far that envelope opens the filter. More gives a sharper attack; at 0 notes start flat.\n- Listen for: a slight bite on each new note, then the tone settling. Compare ENV at 0 and 2.5.',
        set: { 'vcf.freq': 7, 'vcf.env': 2.5, ...ENV('vcf', 0, 3.5, 3, 3) } },
      { title: 'Clean up the bass', module: 'filter', why: 'The HPF (high-pass filter) acts on the mix of all the voices and takes out bass below its cutoff. A stacked lead carries a lot of low energy it does not need.\n- FREQ · HPF 3.5 (100 Hz): cuts below about 100 Hz. The lead keeps its body in the mids but no longer fights the bass and kick. Higher thins it further; at 0 (20 Hz) nothing is cut.\n- Listen for: play low notes and switch FREQ between 0 and 3.5. The low rumble goes and the lead sounds lighter and more focused.',
        set: { 'hpf.freq': 3.5 } },
    ],
    context: {
      'voice.detune': 'In this sound: how wide the stack is. Too much and it goes out of tune; too little and it collapses to one voice.',
      'hpf.freq': 'In this sound: takes the weight out so it sits above a bass line.',
    },
    tweaks: [{ id: 'voice.detune', try: 'Sweep from 0 to 10 while a note holds', hear: 'From one plain tone to a detuned wall.' }],
  },
  {
    id: 'pwm-pad', name: 'Slow PWM Strings', ref: 'In the style of Rush — "Subdivisions"', artist: 'Rush',
    tags: ['pad', 'prog', '80s'], level: 1,
    blurb: 'Soft string chords that swell in and move gently while they hold.',
    how: 'OSC 1’s square has its width swept by LFO 1, which makes it shimmer like an ensemble of strings. Each voice’s LFO runs free, so every note of a chord moves at a slightly different point. A slow VCA attack and long release make the chords swell in and fade away.',
    phrase: { bpm: 72, loop: true, steps: [[0, 57, 3.8], [0, 60, 3.8], [0, 64, 3.8], [0, 69, 3.8], [4, 53, 3.8], [4, 57, 3.8], [4, 60, 3.8], [4, 67, 3.8]] },
    steps: [
      { title: 'A square with its width swept', module: 'osc', why: 'PWM (pulse-width modulation) means sweeping the width of a pulse wave. As the width moves, the tone shifts all the time, which sounds like several players slightly out of step, the basis of this string pad.\n- Sawtooth Off, Square On: OSC 1 (oscillator 1) plays its square alone; the saw would cover the movement.\n- Display page OSC EDIT, PWM SRC LFO 1: in the oscillator menu, the width is now moved by LFO 1 (low-frequency oscillator 1) instead of being set by hand.\n- PWM 6.5 (82 %): with a source chosen, this fader sets how far LFO 1 sweeps the width. More gives a deeper shimmer; less is steadier.\n- Listen for: a held note that swirls. LFO 1 is still on its starting speed of 0.78 Hz, so the movement is fairly quick for now.',
        set: { 'osc1.saw': false, 'osc1.pulse': true, 'ui.page': 'osc', 'osc1.pwmSrc': 'lfo1', 'osc1.pwm': 6.5 } },
      { title: 'A slow LFO 1', module: 'lfo', why: 'Slowing LFO 1 turns the swirl into a gentle drift, closer to a string section. Each voice has its own LFO running free, so every note of a chord moves at a slightly different point.\n- RATE · LFO 1 3.2 (0.43 Hz): about one sweep every two seconds, on the starting triangle shape. Faster gets warbly; slower is almost still.\n- Listen for: hold a chord. The notes shimmer against each other rather than moving together.',
        set: { 'lfo1.rate': 3.2 } },
      { title: 'Soften the filter', module: 'filter', why: 'The VCF (voltage-controlled filter) is a low-pass: it keeps the lows and cuts the highs. A string pad sits better in a mix with its top softened.\n- FREQ · VCF 6.2 (2.1 kHz): takes the brittle edge off the pulse without making it muffled. Lower sounds more distant; higher is brighter and more synthetic.\n- KYBD 6 (60 %): keyboard tracking. High notes open the filter further, so the top line of a chord stays clear.\n- Listen for: play a chord spread over two octaves. The top notes keep their shine while the bottom sounds warm.',
        set: { 'vcf.freq': 6.2, 'vcf.kybd': 6 } },
      { title: 'Swell in, fade out', module: 'env', why: 'The VCA (voltage-controlled amplifier) envelope shapes each voice’s loudness over time. A slow rise and a long tail make chords swell in and fade away like bowed strings.\n- Envelope select VCA, CURVES Off: the A, D, S and R faders (attack, decay, sustain, release) set the loudness envelope’s times.\n- A 5.2 (440 ms): each chord takes nearly half a second to reach full level. Longer is a slower swell; shorter sounds more like an organ.\n- D 5 (380 ms), S 10 (100 %): full sustain, so the decay has nothing to do and held chords stay at full level.\n- R 6.3 (1000 ms): a one-second fade after you let go, so chord changes overlap.\n- Listen for: play slow chord changes. Each chord swells in while the last one fades out under it.',
        set: ENV('vca', 5.2, 5, 10, 6.3) },
    ],
    context: {
      'osc1.pwm': 'In this sound: how deep the shimmer is.',
      'vcaEnv.attack': 'In this sound: how slowly each chord swells in.',
    },
    tweaks: [
      { id: 'lfo1.rate', try: 'Move between 2 and 6', hear: 'From a slow sway to a nervous flutter.' },
      { id: 'vcaEnv.release', try: 'Raise to 8', hear: 'Chords hang over into each other.' },
    ],
  },
  {
    id: 'mono-bass', name: 'Stacked Mono Bass', ref: 'In the style of Depeche Mode — "Just Can’t Get Enough"', artist: 'Depeche Mode',
    tags: ['bass', 'synth-pop', '80s'], level: 1,
    blurb: 'A punchy, round bass with a quick filter snap.',
    how: 'MONO-2 plays one note at a time with two voices on it, slightly detuned, for weight. OSC 2 an octave below OSC 1 adds depth. A short VCF envelope snaps the filter open on each note, and BOOST fills out the bottom after the voices are mixed.',
    phrase: { bpm: 124, loop: true, steps: [[0, 40, 0.4], [0.5, 40, 0.4], [1, 43, 0.4], [1.5, 45, 0.4], [2, 40, 0.4], [2.5, 47, 0.4], [3, 45, 0.4], [3.5, 43, 0.4]] },
    steps: [
      { title: 'Two voices on one note', module: 'mode', why: 'MONO-2 plays one note at a time, as a bass line should, but puts two voices on it. Two slightly detuned copies give weight that a single voice cannot.\n- Display page POLY EDIT: opens the POLY menu on the screen.\n- POLYPHONY MONO-2: one note at a time with two voices stacked on it.\n- UNISON DETUNE 1.5 (±7.5 cents): tunes the two voices a few cents apart. Small, so the bass stays solid; more makes it thicker and then sour.\n- Listen for: a held note has a slow beating that one voice does not. Set UNISON DETUNE to 0 and it goes still.',
        set: { 'ui.page': 'poly', 'voice.mode': 'mono2', 'voice.detune': 1.5 } },
      { title: 'Saw plus a sub-octave square', module: 'osc', why: 'OSC 2 (the second oscillator) goes an octave below OSC 1 to add the low fundamental under the saw. The saw gives the bite, the square underneath gives the weight.\n- Sawtooth On: OSC 1’s saw stays in as the bright, buzzy top of the bass. OSC 1 has no level fader.\n- LEVEL · osc 2 9 (−4.8 dB): OSC 2 nearly as loud as OSC 1, so the sub-octave is strong.\n- PITCH −12 st: a full octave down. At 0 it would just double the saw.\n- Listen for: bring LEVEL up from 0 to 9 on a low note. The bass fills out underneath and gets rounder, felt more than heard on small speakers.',
        set: { 'osc1.saw': true, 'osc2.level': 9, 'osc2.pitch': -12 } },
      { title: 'Snap the filter', module: 'env', why: 'The VCF (voltage-controlled filter, a low-pass) sits low and its envelope snaps it open on each note, which gives the bass its punchy front.\n- Envelope select VCF, CURVES Off: the A, D, S and R faders (attack, decay, sustain, release) set the filter envelope’s times.\n- A 0, D 3.2 (88 ms), S 1.5 (15 %), R 2.5: an instant rise and a quick fall to a low hold. Short decay is tight; longer turns the snap into a “wow”.\n- FREQ · VCF 2.6 (237 Hz): dark and round between hits.\n- RES 3 (30 %): resonance, a boost at the cutoff. Adds a slightly rubbery edge to the snap.\n- ENV 6 (60 %): how far the envelope opens the filter. More gives more snap on each note.\n- Listen for: a sharp “dow” on each note, then a dark body. Sweep ENV while the line plays.',
        set: { ...ENV('vcf', 0, 3.2, 1.5, 2.5), 'vcf.freq': 2.6, 'vcf.res': 3, 'vcf.env': 6 } },
      { title: 'Tight loudness and a bass boost', module: 'amp', why: 'The VCA (voltage-controlled amplifier) envelope sets each note’s loudness over time, and BOOST adds bass to the mixed sound at the very end.\n- Envelope select VCA, CURVES Off: the faders now move the loudness envelope.\n- A 0, D 5 (380 ms), S 9 (90 %): full level at once, dipping only slightly, so notes hit hard and keep their weight.\n- R 2 (30 ms): very short, so notes stop cleanly and the gaps in the line stay tight.\n- BOOST On: 12 dB of bass shelf below about 110 Hz, added after the voices are mixed. The low end gets heavier.\n- Listen for: the gaps between notes, and the weight. Switch BOOST off and on during a phrase to hear how much bottom it adds.',
        set: { ...ENV('vca', 0, 5, 9, 2), 'hpf.boost': true } },
    ],
    context: {
      'vcf.env': 'In this sound: how much snap each note has.',
      'hpf.boost': 'In this sound: the extra weight in the low end.',
    },
    tweaks: [{ id: 'vcfEnv.decay', try: 'Set between 2 and 5', hear: 'Clicky at 2, a rubbery "bow" at 5.' }],
  },
  // ── Sounds that use the effects engine ──
  {
    id: 'dub-chord', name: 'Dub Techno Chord', ref: 'In the style of Basic Channel — dub techno chords', artist: 'Basic Channel',
    tags: ['keys', 'dub techno', '90s'], level: 2,
    blurb: 'A short, muffled chord stab that echoes from side to side into a dark room.',
    how: 'The synth itself only plays a short, filtered chord. The sound comes from the effects: a ping-pong delay in slot 1 bounces each stab between the speakers, darker on every repeat, and a chamber reverb in slot 2 puts the echoes in a room. The slots run in a row (routing M-1), so the reverb also catches every echo.',
    phrase: { bpm: 120, loop: true, steps: [[0.5, 55, 0.2], [0.5, 58, 0.2], [0.5, 62, 0.2], [0.5, 65, 0.2], [2.5, 55, 0.2], [2.5, 58, 0.2], [2.5, 62, 0.2], [2.5, 65, 0.2], [3.25, 55, 0.2], [3.25, 58, 0.2], [3.25, 62, 0.2], [3.25, 65, 0.2]] },
    steps: [
      { title: 'A short, dark chord', module: 'filter', why: 'The synth part of this sound is only a short, muffled chord; the echoes come later from the effects. Two detuned oscillators, a low filter and a quick filter envelope give a soft thud with a flick of brightness.\n- Sawtooth On, osc 2 LEVEL 7, PITCH +0.1: OSC 1’s saw plus OSC 2 (the second oscillator) at −14.4 dB, a tenth of a semitone sharp, so each note is slightly thick.\n- FREQ · VCF 5 (1.0 kHz), RES 3 (30 %): the VCF (voltage-controlled filter, a low-pass) cuts most of the top; the resonance adds a slight hollow edge.\n- VCF env A 0, D 3.4, S 0, R 3: A, D, S and R (attack, decay, sustain, release) now set the filter envelope: an instant flick that falls back in about 110 ms.\n- ENV 3.5 (35 %): how far that envelope opens the cutoff. Kept low for a dub chord.\n- Listen for: a dark chord with a small click of brightness at the start. Raise ENV and the stab gets harder.',
        set: { 'osc1.saw': true, 'osc2.level': 7, 'osc2.pitch': 0.1, 'vcf.freq': 5, 'vcf.res': 3, 'vcf.env': 3.5, ...ENV('vcf', 0, 3.4, 0, 3) } },
      { title: 'Make it a stab', module: 'env', why: 'The VCA (voltage-controlled amplifier) envelope shapes loudness. Here it keeps the chord short however long you hold the keys, so the effects can supply the tail.\n- Envelope select VCA, CURVES Off: the A, D, S and R faders now move the loudness envelope.\n- A 0 (1 ms): the stab starts at once.\n- D 4.4 (240 ms), S 0 (0 %): the level falls to nothing in about a quarter of a second, even with the key held.\n- R 3.4 (110 ms): a short fade if you let go before the decay has finished.\n- Listen for: a dry, clipped chord. Hold the keys and it still dies away. A longer D gives a fuller stab.',
        set: ENV('vca', 0, 4.4, 0, 3.4) },
      { title: 'Thin out the bass', module: 'filter', why: 'The HPF (high-pass filter) works on the mix of all the voices and takes out bass below its cutoff. Echoes and reverb pile up, and without this the low end turns to mud.\n- FREQ · HPF 3 (80 Hz): cuts under about 80 Hz. The chord loses a little weight but stays clear once the repeats build. Higher thins it further.\n- Listen for: little change on the dry chord. The difference shows once the delay and reverb are in; come back then and try 0.',
        set: { 'hpf.freq': 3 } },
      { title: 'A ping-pong delay in slot 1', module: 'fx', why: 'The DeepMind has four effects slots behind the FX button. Slot 1 gets a stereo delay in ping-pong mode, so each stab bounces between the speakers.\n- Display page FX, SLOT 1, page 1-7: opens the effects engine and shows slot 1’s first seven settings. These change the view, not the sound.\n- FX slot 1 type Delay: loads the stereo delay.\n- Time 375 ms: a dotted eighth at 120 BPM, the classic dub echo spacing. Shorter is tighter; longer spaces the echoes wider.\n- Mode P-P: ping-pong, so the echoes bounce from left to right. ST would keep each side to itself.\n- Mix 40 %: the echo against the dry chord. Higher pushes the stab back into its echoes.\n- Listen for: each stab repeating a few times, alternating sides. Play on the beat and hear the echoes land off it.',
        set: { 'ui.page': 'fx', 'ui.fxSlot': '1', 'ui.fxPart': 'a', 'fx1.type': 'delay', 'fx1.delay.tim': 375, 'fx1.delay.mod': 'P-P', 'fx1.delay.mix': 40 } },
      { title: 'Darker, longer repeats', module: 'fx', why: 'More feedback gives more echoes, and cutting treble from each repeat makes them sink back as they fade, like an old tape echo.\n- FX parameter page 8-12: shows the delay’s remaining settings, where the feedback controls are.\n- FeedL 55 %: how much of each echo is fed back to make the next. More gives a longer trail; past 70 % they build into a wash. In P-P, FEED R does nothing.\n- FeedHC 2.2 kHz: takes treble out of each repeat, so every echo is duller than the last. Lower sinks them further back.\n- Listen for: a longer, darker trail behind each stab. Raise FeedHC to 10 kHz and the echoes stay bright and crowd the chord.',
        set: { 'ui.fxPart': 'b', 'fx1.delay.fbl': 55, 'fx1.delay.fhc': 2200 } },
      { title: 'A chamber reverb after it', module: 'fx', why: 'A reverb in slot 2 puts the stab and its echoes in a room. With the routing on M-1 the slots run in a row, so the reverb catches the chord and every echo.\n- FX edit page SLOT 2, page 1-7: shows slot 2’s first settings.\n- FX slot 2 type ChamberRev: loads the chamber reverb.\n- Decay 2.6 s: how long the room rings on. Longer blurs the stabs together.\n- Mix 30 %: how much room there is round the chords and echoes.\n- Damping 4.0 kHz: the treble dies away quickly inside the tail, like a room with soft furnishings, so the space stays dark.\n- Listen for: the echoes now fade into a dark space rather than stopping dry. Set Mix to 0 and back to compare.',
        set: { 'ui.fxSlot': '2', 'ui.fxPart': 'a', 'fx2.type': 'chamberrev', 'fx2.chamberrev.dcy': 2.6, 'fx2.chamberrev.mix': 30, 'fx2.chamberrev.dmp': 4000 } },
    ],
    context: {
      'fx1.delay.fbl': 'In this sound: how many echoes follow each stab. Past 70 % they build into a wash.',
      'fx1.delay.fhc': 'In this sound: how quickly the echoes go dark. Lower sinks them further back.',
      'fx1.delay.mod': 'In this sound: P-P bounces the echoes between left and right. ST keeps each side to itself.',
      'fx2.chamberrev.mix': 'In this sound: how much room there is round the chords and echoes.',
      'hpf.freq': 'In this sound: keeps the piled-up echoes out of the bass.',
    },
    tweaks: [
      { id: 'fx1.delay.fbl', try: 'Raise from 55 to 80 while it plays', hear: 'The echoes stop fading and start to layer into a drone.' },
      { id: 'vcf.freq', try: 'Move between 3 and 6', hear: 'From a muffled thud to a bright stab, with every echo following.' },
    ],
  },
  {
    id: 'rotary-organ', name: 'Rotary Organ', ref: 'In the style of a Hammond through a Leslie — Booker T. & the M.G.’s "Green Onions"', artist: 'Booker T. & the M.G.’s',
    tags: ['keys', 'soul', '60s'], level: 1,
    blurb: 'A plain organ tone brought to life by a spinning speaker, switching from slow to fast.',
    how: 'Two squares an octave apart give a simple organ tone with an instant attack and full sustain. The ROTARYSPKR effect imitates a Leslie cabinet: a treble horn and a bass drum spinning at different speeds, heard by two microphones, which makes the pitch and level swirl. Switching SPEED from SLOW to FAST makes the rotors wind up, the sound of the Leslie.',
    phrase: { bpm: 110, loop: true, steps: [[0, 53, 0.4], [0, 57, 0.4], [0, 60, 0.4], [0.5, 53, 0.4], [0.5, 57, 0.4], [0.5, 60, 0.4], [1, 56, 1.4], [1, 60, 1.4], [1, 63, 1.4], [3, 55, 0.9], [3, 58, 0.9], [3, 62, 0.9]] },
    steps: [
      { title: 'Two squares, an octave apart', module: 'osc', why: 'Organ pipes are mostly a fundamental and its octaves. Two squares an octave apart get close, and the filter softens the top so it sounds more like an organ than a synth.\n- Sawtooth Off, Square On: OSC 1 (oscillator 1) plays a square, hollow and woody.\n- LEVEL · osc 2 8, PITCH +12 st: OSC 2’s square an octave above, at −9.6 dB, a little under OSC 1.\n- FREQ · VCF 6.8 (2.9 kHz): the VCF (voltage-controlled filter, a low-pass) takes the buzz off the top. Lower is mellower.\n- KYBD 6 (60 %): keyboard tracking. Higher notes open the filter further, so the right hand stays as bright as the left.\n- Listen for: a plain, steady organ tone. Pull OSC 2’s LEVEL down and it goes hollower and thinner.',
        set: { 'osc1.saw': false, 'osc1.pulse': true, 'osc2.level': 8, 'osc2.pitch': 12, 'vcf.freq': 6.8, 'vcf.kybd': 6 } },
      { title: 'Organ keys: on and off, nothing else', module: 'env', why: 'The VCA (voltage-controlled amplifier) envelope shapes loudness. An organ note is simply on or off: full level when the key goes down, gone when it comes up.\n- Envelope select VCA, CURVES Off: the A, D, S and R faders (attack, decay, sustain, release) set the loudness envelope’s times.\n- A 0 (1 ms): full level at once.\n- D 5 (380 ms), S 10 (100 %): full sustain, so there is no dip and the decay has nothing to do.\n- R 1.4 (9 ms): the note stops almost the instant you let go.\n- Listen for: fast repeated chords stay separate and crisp. Raise R and they start to smear like a pad.',
        set: ENV('vca', 0, 5, 10, 1.4) },
      { title: 'Load the rotary speaker', module: 'fx', why: 'The ROTARYSPKR effect imitates a Leslie cabinet: a treble horn and a bass drum spinning at different speeds, heard by two microphones. The spinning makes the pitch and level swirl.\n- Display page FX, SLOT 1, page 1-7: opens the effects engine and shows slot 1. These change the view, not the sound.\n- FX slot 1 type RotarySpkr: loads the rotary speaker. It starts on SLOW, so the rotors turn gently.\n- Listen for: hold a chord. The tone swirls and shimmers. Set slot 1’s type back to NONE to hear how static the organ was without it.',
        set: { 'ui.page': 'fx', 'ui.fxSlot': '1', 'ui.fxPart': 'a', 'fx1.type': 'rotaryspkr' } },
      { title: 'Switch to fast', module: 'fx', why: 'Switching a Leslie from slow to fast is the organist’s big move. The rotors do not jump to the new speed; they wind up, and that change is the sound.\n- FX parameter page 8-12: shows the rest of the effect’s settings, where SPEED is.\n- Speed FAST: the rotors spin up to a throbbing tremolo. ACCEL on page 1-7 decides how long they take to get there; low settings give the slow wind-up organists use.\n- Listen for: hold a chord and switch SPEED between SLOW and FAST. The swirl speeds up into a fast throb, then slows back down when you switch back.',
        set: { 'ui.fxPart': 'b', 'fx1.rotaryspkr.spd': 'FAST' } },
    ],
    context: {
      'fx1.rotaryspkr.spd': 'In this sound: SLOW is a gentle swirl, FAST a throbbing tremolo. Switch it while a chord holds to hear the rotors change speed.',
      'fx1.rotaryspkr.acc': 'In this sound: how long the rotors take to change speed. Low settings give the slow wind-up organists use.',
      'fx1.rotaryspkr.dis': 'In this sound: further away is smoother, closer throbs more.',
    },
    tweaks: [
      { id: 'fx1.rotaryspkr.spd', try: 'Switch between SLOW and FAST while a chord holds', hear: 'The speaker winding up and slowing down.' },
      { id: 'fx1.rotaryspkr.bal', try: 'Move to −100 and then +100', hear: 'Only the slow bass rotor, then only the fast treble horn.' },
    ],
  },
  {
    id: 'shimmer-pad', name: 'Shimmer Pad', ref: 'In the style of Brian Eno and Daniel Lanois — "shimmer" reverb', artist: 'Brian Eno',
    tags: ['pad', 'ambient', '80s'], level: 3,
    blurb: 'A slow pad whose reverb tail keeps rising an octave at a time into a halo.',
    how: 'Routing M-9 feeds the output of slots 3 and 4 back to their input through slots 1 and 2. A hall reverb sits in slot 3 and a pitch shifter set an octave up in slot 1, so the reverb tail is shifted up an octave and fed back into the hall, again and again. Slot 1’s LEVEL is the amount of feedback: how much of the tail climbs.',
    phrase: { bpm: 60, loop: true, steps: [[0, 57, 3.6], [0, 64, 3.6], [0, 69, 3.6], [4, 53, 3.6], [4, 60, 3.6], [4, 65, 3.6]] },
    steps: [
      { title: 'A soft, slow pad', module: 'env', why: 'The dry pad is kept plain and slow so the effects have space to work. A saw and a detuned square, a part-closed filter and slow loudness make the chords swell in and fade out.\n- Sawtooth On, osc 2 LEVEL 7, PITCH +0.1: OSC 1’s saw plus OSC 2 (the second oscillator) at −14.4 dB, a tenth of a semitone sharp, so notes beat slowly.\n- FREQ · VCF 5.2 (1.1 kHz), KYBD 5: the VCF (voltage-controlled filter, a low-pass) softens the top; keyboard tracking keeps high notes clear.\n- VCA env A 5.5 (550 ms): with Envelope select on VCA and CURVES off, the VCA (voltage-controlled amplifier) envelope rises slowly, so each chord swells in over half a second.\n- D 5, S 10 (100 %), R 6.5 (1.2 s): full level while held, then a fade of over a second.\n- Listen for: soft chords that fade in and out. The halo comes in the next steps.',
        set: { 'osc1.saw': true, 'osc2.level': 7, 'osc2.pitch': 0.12, 'vcf.freq': 5.2, 'vcf.kybd': 5, ...ENV('vca', 5.5, 5, 10, 6.5) } },
      { title: 'A long hall in slot 3', module: 'fx', why: 'A long hall reverb in slot 3 is the space the shimmer will grow in. It goes in slot 3 because the feedback routing chosen next loops slots 3 and 4 back through 1 and 2.\n- Display page FX, SLOT 3, page 1-7: opens the effects engine at slot 3.\n- FX slot 3 type HallRev: loads the hall reverb.\n- Decay 4.9 s: the longest this hall goes, so the tail hangs in the air.\n- Size 160: a big imaginary space; its echoes spread further apart and build up more slowly.\n- Mix 45 %: nearly half reverb, so the pad sits well back in the room.\n- Listen for: long, smooth tails after each chord. No shimmer yet: the routing still runs the slots in a row and slots 1, 2 and 4 are empty.',
        set: { 'ui.page': 'fx', 'ui.fxSlot': '3', 'ui.fxPart': 'a', 'fx3.type': 'hallrev', 'fx3.hallrev.dcy': 4.9, 'fx3.hallrev.siz': 160, 'fx3.hallrev.mix': 45 } },
      { title: 'Route it through a feedback loop', module: 'fx', why: 'The DeepMind’s four slots can be wired ten ways. M-9 feeds the output of slots 3 and 4 back to the start through slots 1 and 2, which makes a loop.\n- FX edit page ROUTING: shows the routing and the slot levels.\n- FX routing M-9 3>4 FB:1>2: slot 3 then slot 4 in a row, with their output fed back through slot 1 then slot 2. With any other routing, slot 1 would process the dry pad instead.\n- Listen for: this step only builds the loop. The change is heard once slot 1 has something in it.',
        set: { 'ui.fxSlot': 'route', 'fx.routing': 9 } },
      { title: 'An octave up in the loop', module: 'fx', why: 'A pitch shifter in slot 1, inside the loop, lifts the reverb tail an octave and sends it back into the hall. Every pass round the loop lifts it another octave, which is the shimmer.\n- FX edit page SLOT 1, type DualPitch: loads the dual pitch shifter, which makes two shifted copies.\n- Semi1 and Semi2 +12 st: both copies an octave up.\n- Cent1 −4, Cent2 +4: each copy a few cents off, so they beat slightly and the halo sounds wide rather than thin.\n- Delay1 60 ms, Delay2 90 ms: the copies come in a little late and at different times, so they do not land on top of each other.\n- Listen for: after a chord, the tail rises into a high ring above the pad. Play a chord, let go, and hear it climb.',
        set: { 'ui.fxSlot': '1', 'fx1.type': 'dual-pitch', 'fx1.dual-pitch.sm1': 12, 'fx1.dual-pitch.cn1': -4, 'fx1.dual-pitch.sm2': 12, 'fx1.dual-pitch.cn2': 4, 'fx1.dual-pitch.dl1': 60, 'fx1.dual-pitch.dl2': 90 } },
      { title: 'Set how much climbs', module: 'fx', why: 'In M-9, slot 1’s LEVEL sets how much of the shifted tail goes back round the loop. That is the amount of feedback, and so how far the halo climbs before it fades.\n- FX edit page ROUTING: back to the routing page, where the slot levels are.\n- FX slot 1 level 6 (−5.0 dB): enough for the halo to rise and then fade. Above 7 it keeps growing; at 0 there is no feedback.\n- Listen for: play a chord, let go, and hear the upper octaves build and then die away. Nudge the level to 7 and the ring swells instead of fading; bring it back before it runs away.',
        set: { 'ui.fxSlot': 'route', 'fx1.level': 6 } },
    ],
    context: {
      'fx1.level': 'In this sound: the amount of feedback round the loop, and so how much of the tail climbs an octave. Above 7 it keeps growing.',
      'fx3.hallrev.dcy': 'In this sound: how long the halo hangs in the air.',
      'fx.routing': 'In this sound: M-9 is what makes the loop. Any other routing and slot 1 shifts the dry pad instead.',
    },
    tweaks: [
      { id: 'fx1.level', try: 'Move between 4 and 7 while a chord fades', hear: 'From a faint glow to a halo that keeps building.' },
      { id: 'fx1.dual-pitch.sm1', try: 'Set voice 1 to +7', hear: 'The tail climbs in fifths instead of octaves.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

export default {
  id: 'deepmind-12d', name: 'DeepMind 12D', maker: 'Behringer', year: 2017,
  heritage: 'A twelve-voice analogue poly in the Roland Juno tradition, with a modulation matrix and effects',
  summary: 'Twelve analogue voices, each with two oscillators and noise → 2- or 4-pole low-pass filter → VCA, then a common high-pass filter on the mix and a four-slot digital effects engine. Three envelopes, two LFOs per voice, unison and an arpeggiator.',
  view: { w: X(1107), h: Y(847) },
  theme: { panel: '#232427', panel2: '#1b1c1e', ink: '#e4e4e0', font: 'din', weight: 600, cheeks: 'wood', cheekW: X(119) },
  decor, areas, controls, jacks: [], init, toEngine, presets: [...presets, ...moreSounds], lineage,
};
