// Behringer Pro-1 — SynthDef. Coordinates: faceplate crop of the 1200×1200 photo, ×2
// (x = (photoX − 62) × 2, y = (photoY − 470) × 2). Wood cheeks sit inside view.w.
import { annotate, clamp, expMap, level10, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/pro1.js';
import lineage from '@/synths/lineage/pro1.js';
import unusual from '@/synths/unusual/pro1.js';

const S10 = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, size: 11 };
// FREQUENCY and MASTER TUNE are printed 5 … 0 … 5
const BIP = { ticks: 11, size: 11, labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({ at, text: String(Math.abs(at)) })) };

const OCT_SEMI = { 0: -24, 1: -12, 2: 0, 3: 12 };
const OCTAVES = [{ v: '0', label: '0', a: -60 }, { v: '1', label: '1', a: -20 }, { v: '2', label: '2', a: 20 }, { v: '3', label: '3', a: 60 }];
const cutoffHz = (v) => expMap(v / 10, 20, 20000);
const lfoHz = (v) => expMap(v / 10, 0.08, 30);
const attackT = (v) => expMap(v / 10, 0.002, 6.5);
const decayT = (v) => expMap(v / 10, 0.002, 15);
const releaseT = (v) => expMap(v / 10, 0.002, 25);
const pwOf = (v) => 0.03 + 0.94 * clamp(v / 10, 0, 1);
const fmtPw = (v) => `${Math.round(pwOf(v) * 100)} %`;

const controls = [];
const decor = [];
const jacks = [];
const text = (x, y, t, size = 12, rest = {}) => decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', weight: 700, ...rest });
const knob = (id, x, y, rest) =>
  controls.push({ id, type: 'knob', x, y, r: 28, style: 'pro1', labelPos: 'bottom', labelSize: 13, scale: S10, ...rest });
const slide = (id, x, y, rest) =>
  controls.push({ id, type: 'slide', orient: 'v', x, y, w: 22, h: 44, labelPos: 'none', ...rest });
/** Labels above / below a vertical slide switch. */
const ends = (x, y, top, bottom) => {
  if (top) text(x, y - (top.includes('\n') ? 46 : 32), top, 11);
  if (bottom) text(x, y + 38, bottom, 11);
};
const frame = (x, y, w, h, label, gapW) =>
  decor.push({ t: 'frame', x, y, w, h, r: 12, label, labelAt: 'top', labelSize: 15, gapW });

// ── Frames ────────────────────────────────────────────────────────────────
frame(70, 16, 322, 586, 'MODULATION', 140);
frame(406, 86, 580, 170, 'OSCILLATOR A', 160);
frame(1000, 86, 406, 170, 'MIXER', 84);
frame(406, 266, 720, 160, 'OSCILLATOR B', 160);
frame(1140, 266, 266, 160, 'GLIDE', 80);
frame(406, 440, 350, 156, 'LFO/CLOCK', 130);
frame(772, 440, 180, 156, 'SEQUENCER', 126);
frame(966, 440, 104, 156, 'ARP', 56);
frame(1082, 440, 324, 156, 'MODE', 76);
frame(1420, 86, 556, 340, 'FILTER', 90);
frame(1420, 440, 556, 156, 'AMPLIFIER', 124);
[[76, 12], [760, 12], [1412, 12], [2080, 12], [76, 638], [760, 638], [1412, 638], [2080, 638]].forEach(([x, y]) =>
  decor.push({ t: 'screw', x, y, r: 7 }));
decor.push({ t: 'logo', x: 486, y: 52, size: 34, text: 'PRO-1', style: 'plate' });

// ── Modulation matrix ─────────────────────────────────────────────────────
text(142, 50, 'FROM', 13);
text(340, 50, 'TO', 13);
decor.push({ t: 'line', x1: 296, y1: 40, x2: 296, y2: 590, w: 2 });
const SOURCES = [
  { key: 'env', y: 140, name: 'FIL ENV', long: 'the filter envelope', use: 'Use it for pitch sweeps at the start of a note, or to sweep a synced oscillator.' },
  { key: 'oscB', y: 316, name: 'OSC B', long: 'Oscillator B', use: 'In LO FREQ it is a second LFO; at audio rate it adds growl and metallic FM tones.' },
  { key: 'lfo', y: 496, name: 'LFO', long: 'the LFO', use: 'Use it for vibrato, pulse-width movement or filter wobble.' },
];
SOURCES.forEach(({ key, y, name, long, use }) => {
  knob(`mod.${key}Amt`, 142, y, {
    kind: 'cont', min: 0, max: 10, def: 0, label: `AMOUNT\n${name}`, module: 'mod',
    help: `How much of ${long} is sent into the modulation bus chosen by its ROUTE switch. ${use}`,
  });
  slide(`mod.${key}Route`, 260, y - 6, {
    kind: 'enum', options: [{ v: 'wheel', label: 'WHEEL' }, { v: 'direct', label: 'DIRECT' }], def: 'direct', module: 'mod',
    label: `${name} route`,
    help: `Sends ${long} to the WHEEL bus (you only hear it as you push the mod wheel) or the DIRECT bus (always on at the AMOUNT you set).`,
  });
  ends(260, y - 6, 'WHEEL', 'DIRECT');
  text(260, y + 50, 'ROUTE', 11);
});
const DESTS = [
  { id: 'mod.toAFreq', y: 100, name: 'OSC A FREQ', help: 'Lets a modulation bus move the pitch of Oscillator A: vibrato, pitch sweeps, or (with SYNC on) the classic tearing sync sweep.' },
  { id: 'mod.toAPw', y: 214, name: 'OSC A PW', help: 'Lets a modulation bus move the pulse width of Oscillator A. With the LFO this gives the shifting, chorus-like tone called PWM.' },
  { id: 'mod.toBFreq', y: 324, name: 'OSC B FREQ', help: 'Lets a modulation bus move the pitch of Oscillator B.' },
  { id: 'mod.toBPw', y: 434, name: 'OSC B PW', help: 'Lets a modulation bus move the pulse width of Oscillator B.' },
  { id: 'mod.toFilter', y: 540, name: 'FILTER', help: 'Lets a modulation bus move the filter cutoff: wobble from the LFO, or a rasping growl when Oscillator B modulates it at audio rate.' },
];
DESTS.forEach(({ id, y, name, help }) => {
  slide(id, 346, y, {
    kind: 'enum', module: 'mod', label: `To ${name}`,
    options: [{ v: 'wheel', label: 'WH' }, { v: 'off', label: 'OFF' }, { v: 'direct', label: 'DIR' }], def: 'off',
    help: `${help} Up takes the WHEEL bus, down takes the DIRECT bus, middle is off.`,
  });
  text(316, y - 11, 'WH', 9, { anchor: 'end' });
  text(316, y + 3, 'OFF', 9, { anchor: 'end' });
  text(316, y + 17, 'DIR', 9, { anchor: 'end' });
  text(340, y + 40, name, 10);
});

// ── Oscillator A ──────────────────────────────────────────────────────────
knob('oscA.freq', 466, 176, {
  kind: 'cont', min: -5, max: 5, def: 0, label: 'FREQUENCY', module: 'osc', scale: BIP, fmt: (v) => fmtSemi((v / 5) * 7),
  help: 'Fine tuning of Oscillator A, about a fifth either way. With SYNC on it stops changing the pitch and changes the tone instead.',
});
knob('oscA.octave', 606, 176, {
  kind: 'enum', options: OCTAVES, def: '2', label: 'OCTAVE', module: 'osc', scale: undefined,
  help: 'Moves Oscillator A up or down in whole octaves. 0 is the lowest, 3 the highest.',
});
slide('oscA.saw', 700, 162, { kind: 'bool', def: true, module: 'osc', label: 'Osc A sawtooth', help: 'Switches on the sawtooth: bright and buzzy, with every harmonic. It can be on together with the pulse.' });
slide('oscA.pulse', 756, 162, { kind: 'bool', def: false, module: 'osc', label: 'Osc A pulse', help: 'Switches on the pulse wave: hollow at half width, thinner and more nasal as PULSE WIDTH moves away from the middle.' });
decor.push({ t: 'wave', x: 700, y: 122, size: 10, shape: 'saw' }, { t: 'wave', x: 756, y: 122, size: 10, shape: 'pulse' });
text(728, 214, 'SHAPE', 11);
knob('oscA.pw', 850, 176, {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'PULSE WIDTH', module: 'osc', fmt: fmtPw,
  help: 'Width of the pulse wave. 5 is a square wave (hollow); towards either end it gets thin and reedy, and at the extremes it nearly disappears.',
});
slide('oscA.sync', 940, 166, { kind: 'bool', def: false, module: 'osc', label: 'Sync', help: 'Hard sync: Oscillator A is forced to restart every time Oscillator B completes a cycle. B now sets the pitch, and changing A’s frequency changes the tone instead.' });
ends(940, 166, 'SYNC', 'OFF');

// ── Mixer ─────────────────────────────────────────────────────────────────
knob('mix.oscA', 1076, 176, { kind: 'cont', min: 0, max: 10, def: 8, label: 'OSC A', module: 'mixer', help: 'Level of Oscillator A going into the filter. There is no on/off switch: 0 is off.' });
knob('mix.oscB', 1196, 176, { kind: 'cont', min: 0, max: 10, def: 0, label: 'OSC B', module: 'mixer', help: 'Level of Oscillator B going into the filter. Turn it to 0 when B is only being used as a modulator.' });
knob('mix.noise', 1320, 176, { kind: 'cont', min: 0, max: 10, def: 0, label: 'NOISE/EXT', module: 'mixer', help: 'Level of white noise into the filter. With a cable in the EXT jack it becomes the level of that external signal instead.' });

// ── Oscillator B ──────────────────────────────────────────────────────────
knob('oscB.freq', 466, 356, {
  kind: 'cont', min: -5, max: 5, def: 0, label: 'FREQUENCY', module: 'osc', scale: BIP, fmt: (v) => fmtSemi((v / 5) * 7),
  help: 'Fine tuning of Oscillator B. A tiny offset against Oscillator A makes the pair beat and sound fatter. In LO FREQ it becomes a wide-ranging speed control.',
});
knob('oscB.octave', 606, 356, { kind: 'enum', options: OCTAVES, def: '2', label: 'OCTAVE', module: 'osc', scale: undefined, help: 'Moves Oscillator B up or down in whole octaves.' });
slide('oscB.saw', 700, 342, { kind: 'bool', def: true, module: 'osc', label: 'Osc B sawtooth', help: 'Switches on Oscillator B’s sawtooth. As a modulator it gives a ramp that rises and drops.' });
slide('oscB.tri', 756, 342, { kind: 'bool', def: false, module: 'osc', label: 'Osc B triangle', help: 'Switches on the triangle: soft in the mix, and the smoothest shape when Oscillator B is used as a modulator.' });
slide('oscB.pulse', 812, 342, { kind: 'bool', def: false, module: 'osc', label: 'Osc B pulse', help: 'Switches on Oscillator B’s pulse wave. As a modulator it jumps between two values.' });
decor.push({ t: 'wave', x: 700, y: 302, size: 10, shape: 'saw' }, { t: 'wave', x: 756, y: 302, size: 10, shape: 'tri' }, { t: 'wave', x: 812, y: 302, size: 10, shape: 'pulse' });
text(756, 394, 'SHAPE', 11);
knob('oscB.pw', 926, 356, { kind: 'cont', min: 0, max: 10, def: 5, label: 'PULSE WIDTH', module: 'osc', fmt: fmtPw, help: 'Width of Oscillator B’s pulse wave. 5 is square.' });
slide('oscB.lo', 1002, 342, {
  kind: 'enum', options: [{ v: 'lo', label: 'LO FREQ' }, { v: 'normal', label: 'NORMAL' }], def: 'normal', module: 'osc', label: 'Osc B low frequency',
  help: 'LO FREQ drops Oscillator B far below hearing so it works as a second LFO. FREQUENCY and OCTAVE then set its speed.',
});
ends(1002, 342, 'LO FREQ', 'NORMAL');
slide('oscB.kbd', 1072, 342, { kind: 'bool', def: true, module: 'osc', label: 'Osc B keyboard', help: 'On: Oscillator B follows the keys. Off: it stays at one fixed pitch whatever you play, which is what you usually want from a modulator.' });
ends(1072, 342, 'KYBD', 'OFF');

// ── Glide ─────────────────────────────────────────────────────────────────
knob('glide.rate', 1236, 356, {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'RATE', module: 'glide', fmt: (v) => (v === 0 ? 'off' : fmtTime(Math.pow(v / 10, 2) * 3)),
  help: 'Portamento. At 0 the pitch jumps between notes; higher settings make it slide.',
});
slide('glide.mode', 1346, 342, {
  kind: 'enum', options: [{ v: 'auto', label: 'AUTO' }, { v: 'normal', label: 'NORMAL' }], def: 'normal', module: 'glide', label: 'Glide mode',
  help: 'NORMAL slides between every pair of notes. AUTO only slides when you press a new key while still holding the last one, so you choose which notes slur.',
});
ends(1346, 342, 'AUTO', 'NORMAL');

// ── LFO / Clock ───────────────────────────────────────────────────────────
knob('lfo.rate', 470, 524, {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'FREQUENCY', module: 'lfo', fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 12 seconds up to 30 Hz. It is also the clock for REPEAT.',
});
slide('lfo.saw', 576, 510, { kind: 'bool', def: false, module: 'lfo', label: 'LFO sawtooth', help: 'Adds a rising ramp to the LFO output: a repeating upward sweep that drops back.' });
slide('lfo.tri', 646, 510, { kind: 'bool', def: true, module: 'lfo', label: 'LFO triangle', help: 'Adds the triangle to the LFO output: a smooth up-and-down movement, right for vibrato and PWM.' });
slide('lfo.pulse', 712, 510, { kind: 'bool', def: false, module: 'lfo', label: 'LFO pulse', help: 'Adds a square to the LFO output: it jumps between two values, for trills and on/off effects.' });
decor.push({ t: 'wave', x: 576, y: 470, size: 10, shape: 'saw' }, { t: 'wave', x: 646, y: 470, size: 10, shape: 'tri' }, { t: 'wave', x: 712, y: 470, size: 10, shape: 'sq' });
text(646, 562, 'SHAPE', 11);

// ── Sequencer / Arp (on the panel, not modelled) ─────────────────────────
slide('seq.select', 832, 514, {
  kind: 'enum', options: [{ v: 'seq1', label: 'SEQ 1' }, { v: 'off', label: 'OFF' }, { v: 'seq2', label: 'SEQ 2' }], def: 'off', module: 'mode', label: 'Sequencer select',
  help: 'On the hardware this picks one of two 64-note sequences. It is not modelled here: use the riff player under the keyboard instead.',
});
ends(832, 514, 'SEQ 1', 'SEQ 2');
text(802, 518, 'OFF', 9, { anchor: 'end' });
slide('seq.transport', 906, 514, {
  kind: 'enum', options: [{ v: 'record', label: 'RECORD' }, { v: 'play', label: 'PLAY' }], def: 'play', module: 'mode', label: 'Sequencer record / play',
  help: 'On the hardware this records or plays the selected sequence. It is not modelled here.',
});
ends(906, 514, 'RECORD', 'PLAY');
slide('arp.mode', 1018, 514, {
  kind: 'enum', options: [{ v: 'up', label: 'UP' }, { v: 'off', label: 'OFF' }, { v: 'updown', label: 'UP/DOWN' }], def: 'off', module: 'mode', label: 'Arpeggiator',
  help: 'On the hardware this steps through held notes at the LFO rate. It is not modelled here.',
});
ends(1018, 514, 'UP', 'UP/DOWN');
text(1036, 518, 'OFF', 9, { anchor: 'start' });

// ── Mode ──────────────────────────────────────────────────────────────────
slide('mode.poly', 1136, 514, { kind: 'bool', def: false, module: 'mode', label: 'Poly / mono', help: 'Used when several Pro-1 units are chained to play chords. It has no effect on a single unit, or in this app.' });
ends(1136, 514, 'POLY', 'MONO');
slide('mode.retrig', 1200, 514, { kind: 'bool', def: false, module: 'mode', label: 'Retrigger', help: 'NORMAL: playing a new note while holding another changes pitch but does not restart the envelopes (legato). RETRIG: every key press restarts them, so each note gets its full attack.' });
ends(1200, 514, 'RETRIG', 'NORMAL');
slide('mode.repeat', 1260, 514, { kind: 'bool', def: false, module: 'mode', label: 'Repeat', help: 'While you hold a key, the LFO re-fires both envelopes over and over at its own rate. Short envelopes turn one held note into a stream of pulses.' });
ends(1260, 514, 'REPEAT\n/EXT', 'NORMAL');
slide('mode.drone', 1326, 514, { kind: 'bool', def: false, module: 'mode', label: 'Drone', help: 'Holds the gate open for ever: the envelopes run to their sustain level and stay there, so the synth sounds without a key held.' });
ends(1326, 514, 'DRONE', 'OFF');
text(1378, 482, 'GATE', 10);
decor.push({ t: 'led', x: 1378, y: 504, r: 5, color: 'red', litWhen: 'gate' });

// ── Filter ────────────────────────────────────────────────────────────────
knob('filter.cutoff', 1492, 166, {
  kind: 'cont', min: 0, max: 10, def: 7, label: 'CUTOFF', module: 'filter', fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the low-pass filter starts cutting. Low settings leave a dull thump; high settings let all the buzz of the oscillators through.',
});
knob('filter.res', 1616, 166, {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'RESONANCE', module: 'filter',
  help: 'Boosts a narrow band right at the cutoff, so filter movement sounds vocal and squelchy. Near maximum the filter whistles on its own.',
});
knob('filter.env', 1750, 166, {
  kind: 'cont', min: 0, max: 10, def: 0, label: 'ENVELOPE\nAMOUNT', module: 'filter',
  help: 'How far the filter envelope pushes the cutoff above its resting position each time a note starts.',
});
knob('filter.kbd', 1876, 166, {
  kind: 'cont', min: 0, max: 10, def: 5, label: 'KEYBOARD\nAMOUNT', module: 'filter',
  help: 'How much the cutoff follows the keyboard. At 0 high notes sound duller than low ones; at 10 the cutoff follows the notes exactly.',
});
const adsr = (prefix, y, module, what) => {
  knob(`${prefix}.attack`, 1492, y, { kind: 'cont', min: 0, max: 10, def: 0, label: 'ATTACK', module, fmt: (v) => fmtTime(attackT(v)), help: `How long ${what} takes to rise to its peak after a key is pressed.` });
  knob(`${prefix}.decay`, 1616, y, { kind: 'cont', min: 0, max: 10, def: 5, label: 'DECAY', module, fmt: (v) => fmtTime(decayT(v)), help: `How long ${what} takes to fall from its peak to the sustain level.` });
  knob(`${prefix}.sustain`, 1750, y, { kind: 'cont', min: 0, max: 10, def: prefix === 'aenv' ? 10 : 5, label: 'SUSTAIN', module, help: `Where ${what} settles while the key stays down. At 0 it falls away completely even if you keep holding.` });
  knob(`${prefix}.release`, 1876, y, { kind: 'cont', min: 0, max: 10, def: 3.5, label: 'RELEASE', module, fmt: (v) => fmtTime(releaseT(v)), help: `How long ${what} takes to die away after you let go of the key.` });
};
adsr('fenv', 350, 'env', 'the filter envelope');

// ── Amplifier ─────────────────────────────────────────────────────────────
adsr('aenv', 524, 'amp', 'the volume');

// ── Right-hand column ─────────────────────────────────────────────────────
decor.push({ t: 'logo', x: 2036, y: 56, size: 15, text: 'behringer', style: 'behringer' });
decor.push({ t: 'din', x: 2036, y: 170, r: 34 });
text(2036, 232, 'MIDI IN', 12);
knob('out.tune', 2036, 340, {
  kind: 'cont', min: -5, max: 5, def: 0, label: 'MASTER TUNE', module: 'osc', scale: BIP, fmt: (v) => fmtSemi(v / 5),
  help: 'Overall tuning of both oscillators, roughly a semitone either way.',
});
text(2022, 448, 'POWER', 10);
decor.push({ t: 'led', x: 2070, y: 444, r: 5, color: 'red', litWhen: 'power' });
knob('out.volume', 2036, 530, { kind: 'cont', min: 0, max: 10, def: 7, label: 'VOLUME', module: 'out', help: 'Master output level.' });

// ── Jacks (one row along the top) ─────────────────────────────────────────
const jack = (id, x, label, dir, rest) => {
  jacks.push({ id, x, y: 58, r: 15, label, labelPos: 'top', dir, ...rest });
  decor.push({ t: 'arrow', x: x + 25, y: 58, dir: dir === 'in' ? 'down' : 'up', size: 6 });
};
jack('j.modWh', 642, 'MOD WH CV', 'in', { dest: null, help: 'Voltage control of the WHEEL bus depth. Not modelled here: the mod wheel beside the keyboard does this job.' });
jack('j.oscCv', 736, 'OSC CV', 'in', { dest: 'pitchAll', amt: 24, add: true, help: 'Pitch control voltage for both oscillators, added to the keyboard pitch.' });
jack('j.gateClk', 826, 'GATE/CLK', 'in', { dest: 'gate1', amt: 1, add: true, help: 'External gate or clock. In this app a signal patched here re-triggers the filter envelope.' });
jack('j.lfoCv', 916, 'LFO CV', 'in', { dest: 'lfoRate', amt: 3, add: true, help: 'Voltage control of LFO speed, added to the FREQUENCY knob. Patch an envelope in and the wobble changes speed during each note.' });
jack('j.lfoOut', 1010, 'LFO OUT', 'out', { signal: 'lfo', help: 'The LFO, with whichever shapes are switched on.' });
jack('j.kybdCv', 1100, 'KYBD CV', 'out', { signal: 'kbd', help: 'The keyboard pitch as a voltage: higher notes give a higher voltage.' });
jack('j.gate', 1192, 'GATE', 'out', { signal: 'gate', help: 'High while a note is held, low otherwise.' });
jack('j.ext', 1282, 'EXT', 'in', { dest: 'extIn', amt: 1, check: (v) => (v['mix.noise'] <= 0 ? 'NOISE/EXT is at 0. With a cable in EXT that knob is the level of this input, so turn it up.' : null), help: 'External audio into the mixer. A cable here switches the noise generator out, and NOISE/EXT becomes the level for this input.' });
jack('j.mixer', 1372, 'MIXER', 'out', { signal: 'mixer', help: 'The mixer output before the filter: raw oscillators and noise.' });
jack('j.cutoffCv', 1466, 'CUTOFF CV', 'in', { dest: 'cutoff', amt: 5, add: true, help: 'Voltage control of filter cutoff, added to the knob.' });
jack('j.resoCv', 1556, 'RESO CV', 'in', { dest: 'res', amt: 1, add: true, help: 'Voltage control of resonance, added to the knob.' });
jack('j.filterEnv', 1646, 'FILTER ENV', 'out', { signal: 'env1', help: 'The filter envelope as a voltage, 0 to 5 V.' });
jack('j.ampEnv', 1736, 'AMP ENV', 'out', { signal: 'env2', help: 'The amplifier envelope as a voltage, 0 to 5 V.' });
jack('j.phones', 1830, 'PHONES', 'out', { signal: 'out', help: 'Headphone output.' });
jack('j.audioOut', 1920, 'AUDIO OUT', 'out', { signal: 'out', help: 'Main audio output.' });

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas = [
  { id: 'modulation', label: 'Modulation', module: 'mod', keywords: 'matrix wheel direct route vibrato pwm amount',
    rects: [{ x: 70, y: 16, w: 322, h: 586 }],
    help: 'Three sources on the left (filter envelope, Oscillator B and the LFO) and five destinations on the right. Each source has an AMOUNT, and a ROUTE switch that sends it DIRECT (always on) or to the WHEEL (only as you push the mod wheel). Each destination switch picks which of those two it listens to, or neither.' },
  { id: 'patch', label: 'Patch points', module: 'patch', keywords: 'jacks sockets cv gate',
    rects: [{ x: 606, y: 14, w: 1354, h: 66 }],
    help: 'The sockets along the top. Inputs accept a control voltage, gate or audio; outputs send the LFO, keyboard pitch, gate, mixer and both envelopes. Hover over a jack with Explain sections off to see what it does.' },
  { id: 'oscA', label: 'Oscillator A', module: 'osc', keywords: 'vco pitch sawtooth pulse width sync',
    rects: [{ x: 406, y: 86, w: 580, h: 170 }],
    help: 'The main sound source. FREQUENCY and OCTAVE set its pitch, the sawtooth and pulse switches turn its two waveforms on (both can be on at once), and PULSE WIDTH thins the pulse. SYNC locks it to Oscillator B for the classic sync sweep.' },
  { id: 'mixer', label: 'Mixer', module: 'mixer', keywords: 'level volume noise external',
    rects: [{ x: 1000, y: 86, w: 406, h: 170 }],
    help: 'Sets the level of Oscillator A, Oscillator B and noise (or the external input) going into the filter.' },
  { id: 'oscB', label: 'Oscillator B', module: 'osc', keywords: 'vco pitch triangle lo freq detune modulator',
    rects: [{ x: 406, y: 266, w: 720, h: 160 }],
    help: 'A second oscillator, with a triangle wave as well as sawtooth and pulse. Detune it against Oscillator A for thickness. The low-frequency switch turns it into a second LFO, and the keyboard switch stops it following the keys so it holds one pitch as a modulation source.' },
  { id: 'glide', label: 'Glide', module: 'glide', keywords: 'portamento slide',
    rects: [{ x: 1140, y: 266, w: 266, h: 160 }],
    help: 'Makes the pitch slide between notes. RATE sets how long the slide takes. NORMAL slides every note; AUTO slides only when you press a new key while still holding the last one.' },
  { id: 'lfo', label: 'LFO / clock', module: 'lfo', keywords: 'low frequency oscillator vibrato wobble tempo',
    rects: [{ x: 406, y: 440, w: 350, h: 156 }],
    help: 'A slow wave for vibrato, filter wobble and pulse-width movement. FREQUENCY sets its speed and the three switches turn its sawtooth, triangle and pulse shapes on. You hear nothing from it until you give it an AMOUNT in the modulation section.' },
  { id: 'seq', label: 'Sequencer', module: 'mode', keywords: 'sequence record play',
    rects: [{ x: 772, y: 440, w: 180, h: 156 }],
    help: 'On the hardware this records and plays two 64-note sequences at the LFO rate. It is not modelled in this app: use the riff player under the keyboard instead.' },
  { id: 'arp', label: 'Arpeggiator', module: 'mode', keywords: 'arpeggio up down',
    rects: [{ x: 966, y: 440, w: 104, h: 156 }],
    help: 'On the hardware this steps through the keys you hold, at the LFO rate. It is not modelled in this app.' },
  { id: 'mode', label: 'Mode', module: 'mode', keywords: 'retrigger legato repeat drone poly',
    rects: [{ x: 1082, y: 440, w: 324, h: 156 }],
    help: 'How key presses fire the envelopes. RETRIG restarts them on every key press, REPEAT re-fires them at the LFO rate while a key is held, and DRONE holds the note on with no key pressed.' },
  { id: 'filter', label: 'Filter', module: 'filter', keywords: 'cutoff resonance low-pass keyboard tracking envelope amount brightness',
    rects: [{ x: 1420, y: 86, w: 556, h: 174 }],
    help: 'A low-pass filter. CUTOFF sets brightness and RESONANCE emphasises the cutoff point. ENVELOPE AMOUNT sets how far the filter envelope sweeps the cutoff on each note, and KEYBOARD AMOUNT makes higher notes brighter.' },
  { id: 'fenv', label: 'Filter envelope', module: 'env', keywords: 'adsr attack decay sustain release sweep',
    rects: [{ x: 1420, y: 260, w: 556, h: 166 }],
    help: 'ATTACK, DECAY, SUSTAIN and RELEASE for the filter sweep on each note, by the amount set with ENVELOPE AMOUNT above. It can also be sent to pitch or pulse width from the modulation section.' },
  { id: 'amp', label: 'Amplifier envelope', module: 'amp', keywords: 'adsr attack decay sustain release volume loudness',
    rects: [{ x: 1420, y: 440, w: 556, h: 156 }],
    help: 'Shapes the loudness of each note: the fade-in, the fall to the held level, the level held while the key is down, and the fade-out after you let go.' },
  { id: 'master', label: 'Tune and volume', module: 'out', keywords: 'master tune midi output level',
    rects: [{ x: 1984, y: 110, w: 112, h: 486 }],
    help: 'MASTER TUNE shifts the whole synth’s pitch to match other instruments, and VOLUME is the main output level. MIDI IN is where a keyboard connects on the hardware.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
const DEST_MAP = [
  ['mod.toAFreq', 'pitch1', 24], ['mod.toAPw', 'pw1', 0.45], ['mod.toBFreq', 'pitch2', 24],
  ['mod.toBPw', 'pw2', 0.45], ['mod.toFilter', 'cutoff', 5],
];
const SRC_MAP = [['env', 'env1'], ['oscB', 'osc2'], ['lfo', 'lfo']];

function shapeMix(pairs) {
  const on = pairs.filter(([, flag]) => flag);
  const g = on.length > 1 ? 0.75 : 1;
  const mix = {};
  on.forEach(([name]) => { mix[name] = g; });
  return mix;
}

function toEngine(v, ctx) {
  const tune = v['out.tune'] / 5;
  const lo = v['oscB.lo'] === 'lo';
  const kbdB = !!v['oscB.kbd'];
  const osc = [
    {
      level: level10(v['mix.oscA'], 0.9),
      mix: shapeMix([['saw', v['oscA.saw']], ['pulse', v['oscA.pulse']]]),
      pw: pwOf(v['oscA.pw']),
      semi: OCT_SEMI[v['oscA.octave']] + (v['oscA.freq'] / 5) * 7 + tune,
      kbd: true, fixedNote: 60, syncTo: v['oscA.sync'] ? 1 : -1,
    },
    {
      level: level10(v['mix.oscB'], 0.9),
      mix: shapeMix([['saw', v['oscB.saw']], ['tri', v['oscB.tri']], ['pulse', v['oscB.pulse']]]),
      pw: pwOf(v['oscB.pw']),
      semi: OCT_SEMI[v['oscB.octave']] + (lo ? -60 + (v['oscB.freq'] / 5) * 36 : (v['oscB.freq'] / 5) * 7) + (kbdB ? tune : 0),
      kbd: kbdB, fixedNote: 60, syncTo: -1,
    },
  ];
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const routes = [];
  DEST_MAP.forEach(([id, dst, max]) => {
    const bus = v[id];
    if (bus === 'off') return;
    SRC_MAP.forEach(([key, src]) => {
      if (v[`mod.${key}Route`] !== bus) return;
      const amt = Math.pow(v[`mod.${key}Amt`] / 10, 2) * max * (bus === 'wheel' ? wheel : 1);
      if (Math.abs(amt) > 0.0005) routes.push({ src, dst, amt });
    });
  });
  const extPatched = !!ctx.patched['j.ext'];
  const noiseExt = level10(v['mix.noise'], extPatched ? 1 : 0.8);
  return {
    osc,
    noise: { level: extPatched ? 0 : noiseExt, color: 'white' },
    ext: { level: extPatched ? noiseExt : 0 },
    filter: {
      type: 'ladder', mode: 'lp', cutoff: cutoffHz(v['filter.cutoff']), res: (v['filter.res'] / 10) * 1.06,
      envAmt: (v['filter.env'] / 10) * 8, envSrc: 'env1', kbd: v['filter.kbd'] / 10,
    },
    env1: { a: attackT(v['fenv.attack']), d: decayT(v['fenv.decay']), s: v['fenv.sustain'] / 10, r: releaseT(v['fenv.release']) },
    env2: { a: attackT(v['aenv.attack']), d: decayT(v['aenv.decay']), s: v['aenv.sustain'] / 10, r: releaseT(v['aenv.release']) },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(v['lfo.rate']), mix: shapeMix([['saw', v['lfo.saw']], ['tri', v['lfo.tri']], ['sq', v['lfo.pulse']]]), keySync: false },
    glide: { time: Math.pow(v['glide.rate'] / 10, 2) * 3, legato: v['glide.mode'] === 'auto' },
    trig: { retrig: !!v['mode.retrig'], drone: !!v['mode.drone'], repeat: !!v['mode.repeat'] },
    paraphonic: false,
    routes,
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
    id: 'pop-riff', name: 'Bright Pop Riff', ref: 'In the style of Yazoo — "Don’t Go"', artist: 'Vince Clarke',
    tags: ['lead', 'synth-pop', '80s'], level: 1,
    blurb: 'Punchy, bright riff sound with a hard front edge on every note.',
    how: 'Sawtooth and pulse are switched on together on Oscillator A, which is something most synths cannot do, and Oscillator B adds a second, slightly detuned saw. The filter starts half closed and a fast envelope snaps it open at the start of each note. RETRIG makes sure every key press gets that snap, even in a fast run.',
    phrase: { bpm: 122, loop: true, steps: [[0, 57, 0.4], [0.5, 57, 0.2], [0.75, 60, 0.2], [1, 64, 0.4], [1.5, 62, 0.2], [1.75, 60, 0.2], [2, 57, 0.4], [2.5, 55, 0.2], [2.75, 57, 0.2], [3, 52, 0.4], [3.5, 55, 0.4]] },
    steps: [
      { title: 'Saw and pulse together', module: 'osc', why: 'Oscillator A gets two waveforms at once, which most synths cannot do, and Oscillator B is set up as a second saw to widen it. Together they give a bright, full riff tone with plenty of harmonics for the filter to work on.\n- Osc A sawtooth and pulse on: the saw is the buzz, the pulse adds a hollow body underneath. Each wave has its own switch, so both play and are added together.\n- PULSE WIDTH 5 (50 %): a square wave, the roundest and most hollow the pulse gets. Moving it towards 0 or 10 would make it thinner and more nasal.\n- OCTAVE 2 on both: the middle of the four octave settings (0 lowest, 3 highest), a normal riff register.\n- Osc B sawtooth only, FREQUENCY +0.1 st: a plain saw tuned a hair sharp, so the two beat gently. B stays silent until the next step turns it up in the mixer.\n- Listen for: switch Osc A pulse off and on while holding a note; the tone goes thinner and buzzier without it.',
        set: { 'oscA.saw': true, 'oscA.pulse': true, 'oscA.pw': 5, 'oscA.octave': '2', 'oscA.sync': false, 'oscB.saw': true, 'oscB.tri': false, 'oscB.pulse': false, 'oscB.octave': '2', 'oscB.freq': 0.1 } },
      { title: 'Both oscillators in the mixer', module: 'mixer', why: 'The mixer sets how loud each source is going into the filter. Here Oscillator B comes in under A, and the slight detune from the last step becomes audible.\n- OSC A 8: Oscillator A leads and sets the character.\n- OSC B 7: just under A, so the detuned saw widens the sound without taking over. Lower it and the riff gets narrower and more focused; raise it and the beating gets stronger.\n- NOISE/EXT 0: no noise, the riff should be clean.\n- Listen for: hold a note and you hear a slow, gentle beating as the two oscillators drift in and out of phase. Turn OSC B to 0 and back to hear the width come and go.', set: { 'mix.oscA': 8, 'mix.oscB': 7, 'mix.noise': 0 } },
      { title: 'Half-close the filter', module: 'filter', why: 'The filter is a 24 dB per octave low-pass: it keeps the lows and cuts the highs. This step sets the tone each note falls back to once the envelope snap (next step) has passed.\n- CUTOFF 4.2 (about 364 Hz): half closed, so most of the buzz is gone and the note is warm and round. Higher is brighter but gives the snap less distance to travel, so it punches less.\n- RESONANCE 3: a small boost at the cutoff point. It gives the opening snap a slightly nasal edge that helps it cut through a mix. Turn it up and the snap turns squelchy.\n- KEYBOARD AMOUNT 6: the cutoff follows the keys a little more than half way. High notes of the riff open up to match the low ones rather than going dull.\n- Listen for: the riff is now duller than before. That is the resting tone; the next step adds the bite back on each note.',
        set: { 'filter.cutoff': 4.2, 'filter.res': 3, 'filter.kbd': 6 } },
      { title: 'Snap it open with the envelope', module: 'env', why: 'The filter envelope is an ADSR (attack, decay, sustain, release): it pushes the cutoff up each time you play and lets it fall back. This is the snap at the front of every note.\n- ENVELOPE AMOUNT 6: how far the envelope lifts the cutoff above 364 Hz. More gives a brighter, harder hit; less and the front edge softens.\n- ATTACK 0 (2 ms): the filter opens instantly, so the brightness lands exactly on the beat.\n- DECAY 4.6 (120 ms): how fast it closes again, about a tenth of a second. Shorter is more percussive; longer turns the snap into a “wow”.\n- SUSTAIN 2.5, RELEASE 3.5 (54 ms): held notes settle back to a fairly dark tone, and the brightness dies quickly after you let go.\n- Listen for: a bright “dat” at the start of each note, then the tone rounding off. Sweep DECAY while the riff plays to hear the punch tighten and loosen.',
        set: { 'filter.env': 6, 'fenv.attack': 0, 'fenv.decay': 4.6, 'fenv.sustain': 2.5, 'fenv.release': 3.5 } },
      { title: 'Tight volume shape', module: 'amp', why: 'The loudness envelope, also an ADSR, shapes the volume of each note. For a riff you want an instant start and a clean stop.\n- ATTACK 0 (2 ms): full level at once, so the volume hit lines up with the filter snap.\n- DECAY 5 (170 ms) to SUSTAIN 7: after the first hit the level drops a little, which adds a touch more punch to the front of each note.\n- RELEASE 3.5 (54 ms): notes stop about a twentieth of a second after you let go, so fast notes do not smear into each other.\n- Listen for: the gaps between notes in a quick run should be clean. Raise RELEASE to 6 and the notes start to blur together.', set: { 'aenv.attack': 0, 'aenv.decay': 5, 'aenv.sustain': 7, 'aenv.release': 3.5 } },
      { title: 'Retrigger every note', module: 'mode', why: 'The MODE section decides how key presses fire the envelopes. In NORMAL, a note played while another is still held changes pitch but does not restart the envelopes, so legato notes lose their snap.\n- Retrigger on (RETRIG): every key press restarts both envelopes, so each note in a fast, overlapping run gets its own attack and filter snap.\n- Listen for: play a run where each key goes down before the last one comes up. With RETRIG on every note snaps; switch it off and only the first note of the run does, the rest just change pitch.', set: { 'mode.retrig': true } },
    ],
    context: {
      'oscA.pulse': 'On together with the saw. Switch it off and the riff gets thinner and buzzier.',
      'oscB.freq': 'A tiny detune against Oscillator A. This is where the width comes from.',
      'filter.cutoff': 'The resting tone between snaps. Raise it and the riff gets brighter but less punchy, because the envelope has less distance to travel.',
      'filter.env': 'The size of the snap at the front of each note.',
      'fenv.decay': 'The length of the snap. Shorter is more percussive; longer turns it into a "wow".',
      'mode.retrig': 'Makes sure every note in a fast run gets its own attack.',
    },
    tweaks: [
      { id: 'fenv.decay', try: 'Move between 3.5 and 6', hear: 'From a tight click to a slower "wow" on each note.' },
      { id: 'oscA.pw', try: 'Turn down to 2', hear: 'The pulse narrows and the riff takes on a nasal, reedy edge.' },
      { id: 'oscB.octave', try: 'Drop Oscillator B to octave 1', hear: 'An octave underneath makes the riff sound bigger and more like a bass-and-lead in one.' },
      { id: 'filter.res', try: 'Raise to 6', hear: 'The snap becomes a squelch.' },
    ],
  },
  {
    id: 'pulse-bass', name: 'Bouncy Pulse Bass', ref: 'In the style of early Depeche Mode and Yazoo bass lines', artist: 'Early-80s synth-pop',
    tags: ['bass', 'synth-pop', '80s'], level: 1,
    blurb: 'Short, rubbery bass that bounces along under a pop song.',
    how: 'A narrow-ish pulse wave gives a woody, slightly nasal bass tone, and a saw an octave below adds weight. The filter envelope has no sustain, so every note opens and then closes completely: that is the bounce. The volume envelope is kept a little longer than the filter so the note has a soft tail.',
    phrase: { bpm: 128, loop: true, steps: [[0, 48, 0.22], [0.5, 48, 0.22], [1, 60, 0.22], [1.5, 48, 0.22], [2, 51, 0.22], [2.5, 51, 0.22], [3, 55, 0.22], [3.5, 58, 0.22]] },
    steps: [
      { title: 'Pulse on top, saw underneath', module: 'osc', why: 'Two oscillators split the job: a pulse wave gives the bass its character and a saw an octave lower gives it weight. Oscillator B is silent until the mixer step brings it in.\n- Osc A pulse on, sawtooth off: a pulse wave on its own sounds woody and hollow rather than buzzy.\n- PULSE WIDTH 3.6 (37 %): a bit narrower than a square (5). That thins the pulse slightly and adds a nasal edge; towards 2 it gets thin and buzzy, at 5 it is round and hollow.\n- OCTAVE osc A 1: one below the default, a bass register. Octaves run 0 (lowest) to 3.\n- Osc B sawtooth, OCTAVE 0, FREQUENCY 0: a saw a further octave down, in tune, for the low weight under the pulse.\n- Listen for: sweep PULSE WIDTH slowly on a held note to hear the tone go from hollow to nasal.',
        set: { 'oscA.saw': false, 'oscA.pulse': true, 'oscA.pw': 3.6, 'oscA.octave': '1', 'oscA.sync': false, 'oscB.saw': true, 'oscB.tri': false, 'oscB.pulse': false, 'oscB.octave': '0', 'oscB.freq': 0 } },
      { title: 'Mix', module: 'mixer', why: 'The mixer sets how loud each oscillator is going into the filter. The pulse leads and the low saw sits underneath as support.\n- OSC A 8: the pulse carries the character of the bass.\n- OSC B 6: the octave-down saw adds weight without muddying it. Turn it down for a lighter, more plucked bass; up for more low end.\n- NOISE/EXT 0: no noise.\n- Listen for: turn OSC B down to 0 and back on a low note. The note loses its bottom octave and sounds thin without it.', set: { 'mix.oscA': 8, 'mix.oscB': 6, 'mix.noise': 0 } },
      { title: 'Filter nearly shut', module: 'filter', why: 'The filter is a 24 dB per octave low-pass, keeping lows and cutting highs. It starts nearly shut, so each note will open from a dark, thumping tone.\n- CUTOFF 2.8 (about 138 Hz): very dark. Most of the pulse’s edge is gone until the envelope opens it.\n- RESONANCE 1.5: only a small boost at the cutoff. More resonance would thin the low end, so it is kept low to leave the bass full.\n- KEYBOARD AMOUNT 5: the cutoff follows the keys half way, so higher notes of the line are not much duller than low ones.\n- Listen for: held notes now sound muffled and round. That is the closed state the bounce will start from.', set: { 'filter.cutoff': 2.8, 'filter.res': 1.5, 'filter.kbd': 5 } },
      { title: 'Open and shut on every note', module: 'env', why: 'The filter envelope is an ADSR (attack, decay, sustain, release) that lifts the cutoff on each note. With no sustain, the filter opens and then closes fully every time: that is the bounce.\n- ENVELOPE AMOUNT 5.5: how bright the top of each bounce gets. More is a brighter, harder pop; less is softer and darker.\n- ATTACK 0 (2 ms): the filter opens instantly on the beat.\n- DECAY 4.2 (85 ms): the length of the bounce. Shorter is clickier, longer gives a slower “wow”.\n- SUSTAIN 0: the filter always closes back to 138 Hz, however long you hold the key.\n- RELEASE 3 (34 ms): short, so nothing lingers after you let go.\n- Listen for: a rubbery “boing” at the start of each note. Sweep DECAY while the line plays to hear the bounce stretch and shrink.',
        set: { 'filter.env': 5.5, 'fenv.attack': 0, 'fenv.decay': 4.2, 'fenv.sustain': 0, 'fenv.release': 3 } },
      { title: 'Volume a little longer than the filter', module: 'amp', why: 'The loudness envelope, also an ADSR, shapes volume. It is set a little longer than the filter so the note carries on quietly after the filter has closed.\n- ATTACK 0 (2 ms): the note starts at once, lined up with the filter pop.\n- DECAY 5.5 (270 ms) to SUSTAIN 4: the level falls to under half over about a quarter of a second, longer than the 85 ms filter decay. That gives a rounded tail instead of a dead stop.\n- RELEASE 3 (34 ms): notes end almost as soon as you let go, keeping the line tight.\n- Listen for: hold a note and hear the dark tail after the bounce. Set SUSTAIN to 10 and the tail stays loud, which makes the bass heavier but less bouncy.', set: { 'aenv.attack': 0, 'aenv.decay': 5.5, 'aenv.sustain': 4, 'aenv.release': 3 } },
    ],
    context: {
      'oscA.pw': 'Sets how woody or nasal the bass is. 5 is hollow and round; towards 2 it gets thin and buzzy.',
      'fenv.decay': 'The length of the bounce.',
      'fenv.sustain': 'At zero so the filter always closes fully.',
      'filter.env': 'How bright the top of each bounce gets.',
      'mix.oscB': 'The low saw. Turn it down for a lighter, more "plucked" bass.',
    },
    tweaks: [
      { id: 'oscA.pw', try: 'Sweep slowly from 5 down to 1.5', hear: 'Hollow, to woody, to thin and nasal. Every position is a usable bass.' },
      { id: 'fenv.decay', try: 'Try 3, then 6', hear: 'Very short is a tight tick; longer gives a lazier, dubby bounce.' },
      { id: 'mod.lfoAmt', try: 'Set to 5 and flip OSC A PW to DIR', hear: 'The LFO moves the pulse width, so the tone shifts slightly from note to note.' },
    ],
  },
  {
    id: 'sync-lead', name: 'Tearing Sync Lead', ref: 'In the style of The Prodigy — early-90s rave sync leads', artist: 'Hard sync',
    tags: ['lead', 'rave', '90s'], level: 2,
    blurb: 'Aggressive lead whose tone rips downwards through each note.',
    how: 'With SYNC on, Oscillator A is forced to restart every time Oscillator B finishes a cycle. B now fixes the pitch you hear. Pushing A’s frequency up no longer changes the note; it crams more of A’s wave into each of B’s cycles, which adds harsh, vocal overtones. Sending the filter envelope to A’s frequency through the modulation matrix sweeps those overtones on every note.',
    phrase: { bpm: 138, loop: true, steps: [[0, 57, 0.7], [0.75, 57, 0.2], [1, 60, 0.45], [1.5, 64, 0.45], [2, 62, 0.95], [3, 55, 0.45], [3.5, 60, 0.45]] },
    steps: [
      { title: 'Listen to Oscillator A only', module: 'mixer', why: 'The mixer sets what reaches the filter. For a sync lead the sound you hear is Oscillator A alone; Oscillator B will do its work silently as the sync master.\n- OSC A 8: the synced oscillator is the sound.\n- OSC B 0: kept out of the mixer. Mixed in, it would add a plain steady tone that softens the tearing effect.\n- Osc A sawtooth on, pulse off: a saw has every harmonic, which gives sync the most to work with.\n- Listen for: at this point it is a plain bright saw. The next step makes it tear.', set: { 'mix.oscA': 8, 'mix.oscB': 0, 'oscA.saw': true, 'oscA.pulse': false } },
      { title: 'Sync A to B', module: 'osc', why: 'Hard sync forces Oscillator A to restart every time Oscillator B finishes a cycle. On the Pro-1 A is the one that gets reset, the reverse of most synths, so B sets the pitch and A’s tuning changes the tone.\n- Sync on: A is locked to B. The note you hear now comes from B.\n- OCTAVE osc A 3, FREQUENCY +2.1 st: A is tuned well above B, so it crams more of its wave into each of B’s cycles. That gives harsh, vocal overtones.\n- Osc B OCTAVE 2, FREQUENCY 0, sawtooth on: B sets the note at the normal octave.\n- Osc B keyboard on, low frequency NORMAL: B follows the keys at audio rate, so the lead plays in tune.\n- Listen for: turn osc A FREQUENCY by hand on a held note. The pitch stays put and only the tone shifts, with a nasal, ripping character.',
        set: { 'oscA.sync': true, 'oscA.octave': '3', 'oscA.freq': 1.5, 'oscB.octave': '2', 'oscB.saw': true, 'oscB.freq': 0, 'oscB.kbd': true, 'oscB.lo': 'normal' } },
      { title: 'Route the filter envelope to A’s pitch', module: 'mod', why: 'The modulation section routes three sources to five destinations. Each source has an AMOUNT and a ROUTE switch to the DIRECT bus (always on) or the WHEEL bus (only as you push the mod wheel).\n- AMOUNT FIL ENV 7.5: sends a large amount of the filter envelope into the modulation. More gives a wider, more dramatic rip.\n- FIL ENV route DIRECT: always on, no mod wheel needed.\n- To OSC A FREQ DIR: A’s pitch listens to the DIRECT bus. With sync on, the envelope now sweeps A’s tone, not the note.\n- Listen for: each note starts with A pushed high and falls back, tearing down through the overtones. Switch Sync off to hear it as a plain pitch drop instead.',
        set: { 'mod.envAmt': 7.5, 'mod.envRoute': 'direct', 'mod.toAFreq': 'direct' } },
      { title: 'Shape the sweep', module: 'env', why: 'The filter envelope is an ADSR (attack, decay, sustain, release). There is no separate modulation envelope on the Pro-1, so this one is shaping the sync sweep. The filter itself is opened up so it does not hide the effect.\n- ATTACK 0, DECAY 6.2 (510 ms): the sweep starts instantly and falls over half a second. DECAY is the speed of the rip.\n- SUSTAIN 3, RELEASE 4 (87 ms): held notes settle with some brightness left in the sync tone.\n- CUTOFF 7.5 (3.6 kHz), RESONANCE 1: the low-pass filter is wide open, so all the sync overtones come through.\n- ENVELOPE AMOUNT 1.5, KEYBOARD AMOUNT 5: only a slight filter movement on each note, and the cutoff follows the keys half way.\n- Listen for: sweep DECAY while playing. Short is a quick “zap”; long is a slow scream.',
        set: { 'fenv.attack': 0, 'fenv.decay': 6.2, 'fenv.sustain': 3, 'fenv.release': 4, 'filter.cutoff': 7.5, 'filter.res': 1, 'filter.env': 1.5, 'filter.kbd': 5 } },
      { title: 'Lead-style volume and glide', module: 'amp', why: 'The loudness envelope shapes volume, and glide makes the pitch slide between notes. Together they set how the lead phrases.\n- ATTACK 0, DECAY 5 (170 ms), SUSTAIN 8: an instant start and a nearly full held level, so long notes keep singing.\n- RELEASE 4 (87 ms): a short tail after you let go.\n- RATE 2.5 (190 ms): how long a slide takes. Higher settings make slower, more obvious swoops.\n- Glide mode AUTO: only slides when you press a new key while still holding the last one (legato). Detached notes jump straight to pitch.\n- Listen for: play two notes overlapping and hear the slide; lift between them and there is none.', set: { 'aenv.attack': 0, 'aenv.decay': 5, 'aenv.sustain': 8, 'aenv.release': 4, 'glide.rate': 2.5, 'glide.mode': 'auto' } },
    ],
    context: {
      'oscA.sync': 'The heart of the sound. Switch it off and you just hear an oscillator falling in pitch.',
      'oscA.freq': 'With sync on this is a tone control. Turn it by hand to hear the overtones shift.',
      'mod.envAmt': 'How far the envelope pushes Oscillator A. More means a wider, more dramatic rip.',
      'fenv.decay': 'The speed of the rip.',
      'mix.oscB': 'Kept at zero: Oscillator B is only the sync master here.',
      'mod.toAFreq': 'Connects the DIRECT bus (carrying the filter envelope) to Oscillator A’s pitch.',
    },
    tweaks: [
      { id: 'oscA.freq', try: 'Sweep by hand from −5 to 5 while holding a note', hear: 'The same rip, played manually. This is how the effect was performed live.' },
      { id: 'mod.envRoute', try: 'Flip to WHEEL and set OSC A FREQ to WH', hear: 'The sweep only happens as you push the mod wheel, so you can bring it in on chosen notes.' },
      { id: 'fenv.decay', try: 'Shorten to 4', hear: 'A fast "pyew" at the start of each note instead of a long tear.' },
      { id: 'mix.oscB', try: 'Bring up to 5', hear: 'The plain saw underneath adds body and steadies the pitch.' },
    ],
  },
  {
    id: 'pwm-strings', name: 'PWM Solo Strings', ref: 'In the style of Howard Jones — early-80s synth-pop string lines', artist: 'Pulse-width modulation',
    tags: ['strings', 'synth-pop', '80s'], level: 1,
    blurb: 'Smooth, shimmering line that sounds like more than two oscillators.',
    how: 'When the width of a pulse wave is moved slowly back and forth, its harmonics shift all the time, and the ear hears that as several detuned oscillators playing together. Here the LFO moves the pulse width of both oscillators through the modulation matrix. Slow attacks on both envelopes take away the hard front edge, which is what makes it read as strings.',
    phrase: { bpm: 76, loop: true, steps: [[0, 64, 1.9], [2, 67, 0.9], [3, 69, 0.9], [4, 71, 2.8], [7, 67, 0.9]] },
    steps: [
      { title: 'Two pulse waves', module: 'osc', why: 'Two pulse waves are the raw material for PWM (pulse-width modulation), which the next step adds. Starting both at square width leaves room for the width to swing either way.\n- Pulse on for both, other waves off: pulse waves only, hollow and reedy.\n- PULSE WIDTH 5 (50 %) on both: square waves, the centre of the swing. Starting off-centre would let the pulse collapse to almost nothing at one end.\n- OCTAVE 2 on both: the same, normal register.\n- FREQUENCY osc B +0.2 st: a slight detune against A, for gentle beating.\n- OSC A 7, OSC B 7: equal levels in the mixer, so both pulses count.\n- Listen for: a hollow, slightly beating organ-like tone. It is still static; the movement comes next.',
        set: { 'oscA.saw': false, 'oscA.pulse': true, 'oscA.pw': 5, 'oscA.octave': '2', 'oscA.sync': false, 'oscB.saw': false, 'oscB.tri': false, 'oscB.pulse': true, 'oscB.pw': 5, 'oscB.octave': '2', 'oscB.freq': 0.12, 'mix.oscA': 7, 'mix.oscB': 7 } },
      { title: 'Let the LFO move both pulse widths', module: 'mod', why: 'The LFO (low-frequency oscillator) is a slow wave used to move other settings. Here it moves the pulse width of both oscillators through the modulation section, which the ear hears as several detuned oscillators.\n- LFO triangle only: a smooth up-and-down, right for PWM.\n- FREQUENCY lfo 4.2 (0.96 Hz): a little under one cycle a second. Slower sounds like an ensemble; faster starts to sound like vibrato.\n- AMOUNT LFO 6, route DIRECT: how far the width swings, always on. Too much and the pulse gets so thin at each end that the sound seems to drop out.\n- To OSC A PW and To OSC B PW both DIR: both pulse widths listen to the DIRECT bus.\n- Listen for: the tone starts to shimmer and swirl straight away. Set AMOUNT LFO to 0 and back to hear it go flat.',
        set: { 'lfo.tri': true, 'lfo.saw': false, 'lfo.pulse': false, 'lfo.rate': 4.2, 'mod.lfoAmt': 6, 'mod.lfoRoute': 'direct', 'mod.toAPw': 'direct', 'mod.toBPw': 'direct' } },
      { title: 'Mellow filter, gentle movement', module: 'filter', why: 'The filter is a 24 dB per octave low-pass. Here it takes the fizz off the top, and a small, slow envelope makes each note brighten slightly after it starts, like a bow digging in.\n- CUTOFF 6 (1.3 kHz), RESONANCE 1: mellow and smooth, with no peak.\n- KEYBOARD AMOUNT 6: higher notes open the filter a little more, so the top of the line stays clear.\n- ENVELOPE AMOUNT 2: only a small lift from the envelope.\n- ATTACK 5 (110 ms), DECAY 6 (420 ms): the brightening swells in over a tenth of a second rather than snapping.\n- SUSTAIN 7, RELEASE 5 (220 ms): held notes keep most of that brightness.\n- Listen for: less edge than before, and a slight swell of brightness just after each note starts.',
        set: { 'filter.cutoff': 6, 'filter.res': 1, 'filter.env': 2, 'filter.kbd': 6, 'fenv.attack': 5, 'fenv.decay': 6, 'fenv.sustain': 7, 'fenv.release': 5 } },
      { title: 'Fade in, fade out', module: 'amp', why: 'The loudness envelope shapes volume. Slow attacks take away the hard front edge, which is what makes the line read as strings rather than an organ.\n- ATTACK 5.5 (170 ms): each note fades in, removing the click.\n- DECAY 6 (420 ms) to SUSTAIN 9: held notes stay almost at full level.\n- RELEASE 5.2 (270 ms): about a quarter of a second of tail, so notes overlap a little.\n- Listen for: play a slow line and hear each note swell in and hang briefly into the next. Set ATTACK to 0 and it turns into an organ.', set: { 'aenv.attack': 5.5, 'aenv.decay': 6, 'aenv.sustain': 9, 'aenv.release': 5.2 } },
    ],
    context: {
      'mod.lfoAmt': 'How far the pulse width swings. Too much and the pulse gets so thin at each end of the swing that the sound seems to drop out.',
      'lfo.rate': 'The speed of the shimmer. Under 1 Hz sounds like an ensemble; faster sounds like vibrato.',
      'oscA.pw': 'The centre of the swing. Keep it near 5 so the pulse never collapses at either end.',
      'aenv.attack': 'The slow fade-in is what makes this strings rather than an organ.',
      'mod.toAPw': 'Connects the DIRECT bus (carrying the LFO) to Oscillator A’s pulse width.',
    },
    tweaks: [
      { id: 'mod.lfoAmt', try: 'Compare 0 with 6', hear: 'At 0 the sound is a static, organ-like square. At 6 it comes alive.' },
      { id: 'lfo.rate', try: 'Raise to 6.5', hear: 'The shimmer becomes a nervous warble.' },
      { id: 'oscB.octave', try: 'Set Oscillator B to octave 3', hear: 'An octave on top adds a violin-like sheen.' },
      { id: 'aenv.attack', try: 'Drop to 0', hear: 'With no fade-in it turns into a synth organ.' },
    ],
  },
  {
    id: 'wheel-growl', name: 'Mod-Wheel Growl Bass', ref: 'In the style of 80s electro-funk bass', artist: 'Audio-rate filter modulation',
    tags: ['bass', 'electro', '80s'], level: 3,
    blurb: 'Solid resonant bass that snarls when you push the mod wheel.',
    how: 'Oscillator B is wired to the filter cutoff through the WHEEL bus. Because B is running at audio rate, it shakes the filter fifty or more times a second. You do not hear that as wobble but as a rough, growling set of extra overtones. With the mod wheel down the patch is a clean bass; push the wheel and the growl comes in as far as you like.',
    phrase: { bpm: 108, loop: true, steps: [[0, 48, 0.7], [1, 48, 0.2], [1.5, 51, 0.4], [2, 46, 0.9], [3, 43, 0.4], [3.5, 46, 0.4]] },
    steps: [
      { title: 'Two saws, low', module: 'osc', why: 'Two saws in the bass register give a solid starting tone. Oscillator B is also heard here, but its main job later is to shake the filter at audio rate.\n- Sawtooth on for both, other waves off: two bright saws.\n- OCTAVE 1 on both, FREQUENCY osc B 0: both a bass octave down, in tune.\n- Osc B keyboard on, low frequency NORMAL: B follows the keys at audio rate, so the growl it adds later keeps the same character on every note.\n- Sync off: the oscillators run freely.\n- OSC A 8, OSC B 4: A leads and B adds a little thickness.\n- Listen for: a plain, bright saw bass. The filter step darkens it.',
        set: { 'oscA.saw': true, 'oscA.pulse': false, 'oscA.octave': '1', 'oscA.sync': false, 'oscB.saw': true, 'oscB.tri': false, 'oscB.pulse': false, 'oscB.octave': '1', 'oscB.freq': 0, 'oscB.kbd': true, 'oscB.lo': 'normal', 'mix.oscA': 8, 'mix.oscB': 4 } },
      { title: 'Resonant bass filter', module: 'filter', why: 'The filter is a 24 dB per octave low-pass. Low cutoff with a good amount of resonance gives a solid bass, and the resonant peak is what Oscillator B will shake.\n- CUTOFF 3.4 (209 Hz): dark, bass-weight tone.\n- RESONANCE 5.5: a clear peak at the cutoff. The growl comes from this peak being moved; at 0 the effect is much milder.\n- ENVELOPE AMOUNT 4.5: the filter envelope, an ADSR (attack, decay, sustain, release), opens the cutoff on each note.\n- DECAY 5.2 (210 ms), SUSTAIN 3: after an instant attack (ATTACK 0) it falls back over about 200 ms, for a resonant pluck.\n- RELEASE 3.5 (54 ms), KEYBOARD AMOUNT 5: short tail; cutoff follows the keys half way.\n- Listen for: a round bass with a squelchy “bow” at the start of each note.',
        set: { 'filter.cutoff': 3.4, 'filter.res': 5.5, 'filter.env': 4.5, 'filter.kbd': 5, 'fenv.attack': 0, 'fenv.decay': 5.2, 'fenv.sustain': 3, 'fenv.release': 3.5 } },
      { title: 'Put Oscillator B on the wheel bus', module: 'mod', why: 'The modulation section sends sources to destinations over two buses: DIRECT (always on) and WHEEL (only as you push the mod wheel). Here Oscillator B goes to the filter cutoff on the WHEEL bus.\n- AMOUNT OSC B 7.5: the most growl the wheel can bring in. B runs at audio rate, so it moves the cutoff fifty or more times a second. That is heard as rough extra overtones, not as a wobble.\n- OSC B route WHEEL: B only reaches its destinations as the wheel comes up.\n- To FILTER WH: the cutoff listens to the WHEEL bus. Down (DIR) would listen to the DIRECT bus, which is empty here.\n- Listen for: nothing changes yet, because the mod wheel is down.',
        set: { 'mod.oscBAmt': 7.5, 'mod.oscBRoute': 'wheel', 'mod.toFilter': 'wheel' } },
      { title: 'Volume', module: 'amp', why: 'The loudness envelope gives a plain bass shape. With it set, the patch is ready: play, and push the mod wheel beside the keyboard.\n- ATTACK 0, DECAY 5 (170 ms), SUSTAIN 8: an instant start, then a nearly full held level so long notes keep their weight.\n- RELEASE 3 (34 ms): notes stop cleanly.\n- Listen for: with the wheel down, a clean resonant bass. Push the wheel slowly and a snarl comes in as far as you take it. Try OCTAVE osc B at 0 or 2 for different kinds of roughness.', set: { 'aenv.attack': 0, 'aenv.decay': 5, 'aenv.sustain': 8, 'aenv.release': 3 } },
    ],
    context: {
      'mod.oscBAmt': 'The most growl the wheel can bring in.',
      'mod.oscBRoute': 'WHEEL means Oscillator B only reaches the filter as you push the mod wheel.',
      'mod.toFilter': 'Up (WH) listens to the WHEEL bus. Down (DIR) would listen to the DIRECT bus, which is empty in this patch.',
      'filter.res': 'The growl is the resonant peak being shaken. With resonance at 0 the effect is much milder.',
      'oscB.kbd': 'On, so the modulator moves with the note and the growl has the same character across the keyboard.',
      'oscB.octave': 'The pitch of the modulator relative to the note. Each octave gives a different kind of roughness.',
    },
    tweaks: [
      { id: 'oscB.octave', try: 'Try 0, then 2', hear: 'Lower gives a slower, purring roughness; higher gives a brighter, metallic rasp.' },
      { id: 'oscB.freq', try: 'Move away from 0', hear: 'The modulator is no longer in tune with the note, so the growl turns clangy and bell-like.' },
      { id: 'mod.oscBRoute', try: 'Flip to DIRECT, and FILTER to DIR', hear: 'The growl is on all the time at full amount, with no wheel needed.' },
      { id: 'oscB.tri', try: 'Switch saw off and triangle on', hear: 'A smoother modulator gives a rounder, less fizzy growl.' },
    ],
  },
  {
    id: 'slowing-wobble', name: 'Slowing Wobble', ref: 'In the style of 80s sci-fi soundtracks and arcade effects', artist: 'Patch-cable trick',
    tags: ['fx', 'bass', 'patch'], level: 2,
    blurb: 'A filter wobble that starts fast on each note and winds down.',
    how: 'The LFO sweeps the filter to make a wobble. One patch cable then sends the filter envelope into the LFO CV jack, so the envelope controls the LFO’s speed. At the start of a note the envelope is high and the wobble is fast; as the envelope decays the wobble slows down. An envelope controlling the speed of another modulator is a basic modular-synth idea.',
    phrase: { bpm: 60, loop: true, steps: [[0, 45, 3.6], [4, 41, 3.6]] },
    steps: [
      { title: 'A bright, low oscillator', module: 'osc', why: 'A bright, low oscillator gives the filter plenty to chew on, so the wobble later is easy to hear.\n- Osc A sawtooth and pulse on: both waves added together, full of harmonics.\n- PULSE WIDTH 5 (50 %): the pulse is a square, hollow under the saw.\n- OCTAVE osc A 1: one octave down from the default, in the low register.\n- Sync off: A runs freely.\n- OSC A 8, OSC B 0: only Oscillator A is heard.\n- Listen for: a thick, buzzy tone. It is static for now.',
        set: { 'oscA.saw': true, 'oscA.pulse': true, 'oscA.pw': 5, 'oscA.octave': '1', 'oscA.sync': false, 'mix.oscA': 8, 'mix.oscB': 0 } },
      { title: 'LFO sweeps the filter', module: 'mod', why: 'The LFO (low-frequency oscillator) is a slow wave. Sent through the modulation section to the filter cutoff, it sweeps the brightness up and down to make a wobble.\n- LFO triangle only, FREQUENCY 5 (1.55 Hz): a smooth sweep about one and a half times a second. This is the speed the wobble ends up at later.\n- AMOUNT LFO 6.5, To FILTER DIR: how deep the wobble is, sent on the DIRECT bus (always on) to the cutoff.\n- CUTOFF 4.5 (448 Hz): the centre the LFO swings around, fairly dark.\n- RESONANCE 5: a peak at the cutoff, so it sounds like “wow-wow” rather than a volume change.\n- ENVELOPE AMOUNT 1, KEYBOARD AMOUNT 5: the filter envelope barely touches the cutoff; the cutoff follows the keys half way.\n- Listen for: a steady, even wobble on a held note.',
        set: { 'lfo.tri': true, 'lfo.saw': false, 'lfo.pulse': false, 'lfo.rate': 5, 'mod.lfoAmt': 6.5, 'mod.lfoRoute': 'direct', 'mod.toFilter': 'direct', 'filter.cutoff': 4.5, 'filter.res': 5, 'filter.env': 1, 'filter.kbd': 5 } },
      { title: 'Patch FILTER ENV into LFO CV', module: 'patch', why: 'One patch cable sends the filter envelope into the LFO CV jack (control voltage for LFO speed). The envelope now controls how fast the LFO runs: an envelope controlling another modulator, a basic modular-synth idea.\n- Cable FILTER ENV → LFO CV: the envelope voltage is added to the FREQUENCY knob. High envelope means a fast wobble.\n- Filter ATTACK 0 (2 ms): the envelope jumps to its peak at once, so every note starts with the LFO running about eight times faster.\n- DECAY 7.5 (1.6 s), SUSTAIN 0: the envelope falls slowly to nothing, so the wobble winds down over about a second and a half to the knob speed.\n- RELEASE 5 (220 ms): a short fall after you let go.\n- Listen for: each note starts with a fast flutter that slows down. Change DECAY to make the slow-down quicker or longer.',
        set: { 'fenv.attack': 0, 'fenv.decay': 7.5, 'fenv.sustain': 0, 'fenv.release': 5 }, cables: [['j.filterEnv', 'j.lfoCv']] },
      { title: 'Hold the volume', module: 'amp', why: 'The loudness envelope holds the volume up so you can hear the whole slow-down.\n- ATTACK 0 (2 ms): the note starts at once.\n- DECAY 6 (420 ms) to SUSTAIN 9: held notes stay almost at full level for as long as you hold them, well past the 1.6 s wind-down.\n- RELEASE 5 (220 ms): a brief tail after you let go.\n- Listen for: hold a key for two seconds. The wobble starts fast and settles to a steady 1.5 Hz. Set SUSTAIN to 0 and the note fades before the slow-down finishes.', set: { 'aenv.attack': 0, 'aenv.decay': 6, 'aenv.sustain': 9, 'aenv.release': 5 } },
    ],
    context: {
      'lfo.rate': 'The speed the wobble ends up at once the envelope has died away.',
      'fenv.decay': 'How long the slow-down takes.',
      'mod.lfoAmt': 'How deep the wobble is.',
      'filter.env': 'Kept low. The envelope’s main job here is to control the LFO through the cable, not to open the filter.',
      'filter.res': 'Makes the wobble sound more like "wow-wow" than a volume change.',
    },
    tweaks: [
      { id: 'fenv.decay', try: 'Shorten to 5', hear: 'A quick flutter at the start of the note that settles almost at once.' },
      { id: 'fenv.attack', try: 'Raise to 6 and sustain to 8', hear: 'The reverse effect: the wobble speeds up as you hold the note.' },
      { id: 'lfo.pulse', try: 'Switch triangle off and pulse on', hear: 'The filter jumps between two positions, like a stuttering gate.' },
    ],
  },
  {
    id: 'repeat-pulse', name: 'Repeat Pulse Line', ref: 'In the style of Italo disco and early electro pulse lines', artist: 'REPEAT mode',
    tags: ['seq', 'electro', '80s'], level: 2,
    blurb: 'Hold one key and get a stream of sixteenth-note blips.',
    how: 'REPEAT makes the LFO re-fire both envelopes again and again for as long as a key is held. With short envelopes and no sustain, each firing is a separate blip, so one finger produces a driving pulse line. The LFO frequency is the tempo. Change the held note and the pulses follow.',
    phrase: { bpm: 120, loop: true, steps: [[0, 45, 1.9], [2, 45, 0.9], [3, 48, 0.9], [4, 43, 1.9], [6, 50, 1.9]] },
    steps: [
      { title: 'Narrow pulse plus saw', module: 'osc', why: 'A thin pulse gives the line its bite and a detuned saw at the same octave thickens it, so each blip later has both edge and body.\n- Osc A pulse on, sawtooth off: pulse only.\n- PULSE WIDTH 2.5 (27 %): well narrower than a square (5), so the pulse is thin and nasal. Towards 5 it gets rounder and hollower.\n- OCTAVE osc A 1, Sync off: a low register, running freely.\n- Osc B saw, OCTAVE 1, FREQ +0.1 st: a saw at the same octave, a hair sharp, so the pair beat gently.\n- OSC A 7.5, OSC B 6: the mixer levels. The pulse leads; the saw fills in underneath.\n- Listen for: a buzzy, slightly nasal tone with a slow swirl from the detune.',
        set: { 'oscA.saw': false, 'oscA.pulse': true, 'oscA.pw': 2.5, 'oscA.octave': '1', 'oscA.sync': false, 'oscB.saw': true, 'oscB.tri': false, 'oscB.pulse': false, 'oscB.octave': '1', 'oscB.freq': 0.1, 'mix.oscA': 7.5, 'mix.oscB': 6 } },
      { title: 'Blip envelopes', module: 'env', why: 'Both envelopes are ADSRs (attack, decay, sustain, release). Here both get an instant attack, a short decay and no sustain, so each firing will be one short blip.\n- CUTOFF 3.2 (182 Hz), RESONANCE 3.5: a dark low-pass filter with a slight peak, so the opening has some bite.\n- ENVELOPE AMOUNT 5.5, KEYBOARD AMOUNT 5: each blip opens the filter well up; the cutoff follows the keys half way.\n- Filter DECAY 3.8 (59 ms), SUSTAIN 0: after an instant attack, a bright flash lasting about 60 ms, then fully closed. RELEASE is a short 34 ms.\n- Loudness DECAY 4.4 (100 ms), SUSTAIN 0: after an instant attack, each blip lasts about a tenth of a second, then silence even with the key held. RELEASE is 34 ms.\n- Listen for: one short “bip” per key press, closing down as it fades because the filter decay is shorter than the volume decay.',
        set: { 'filter.cutoff': 3.2, 'filter.res': 3.5, 'filter.env': 5.5, 'filter.kbd': 5, 'fenv.attack': 0, 'fenv.decay': 3.8, 'fenv.sustain': 0, 'fenv.release': 3, 'aenv.attack': 0, 'aenv.decay': 4.4, 'aenv.sustain': 0, 'aenv.release': 3 } },
      { title: 'Switch REPEAT on', module: 'mode', why: 'REPEAT makes the LFO (low-frequency oscillator, also the Pro-1’s clock) re-fire both envelopes for as long as a key is held. With the short envelopes from the last step, one held key becomes a stream of blips.\n- Repeat on: the LFO acts as a gate generator.\n- Drone off: the gate follows your key, so the stream stops when you let go.\n- FREQUENCY lfo 7.8 (8.14 Hz): the tempo. About eight pulses a second is sixteenth notes at around 120 bpm. Turn it up for faster, down for slower.\n- Listen for: hold one key and hear a driving pulse line. Change the held note and the pulses follow. If you lengthen loudness DECAY past the gap between pulses, they run together.',
        set: { 'mode.repeat': true, 'mode.drone': false, 'lfo.rate': 7.8 } },
    ],
    context: {
      'mode.repeat': 'The LFO re-fires the envelopes while a key is held.',
      'lfo.rate': 'This is the tempo of the pulses.',
      'aenv.decay': 'Length of each blip. Keep it shorter than the gap between pulses or they run together.',
      'fenv.decay': 'How long the bright part of each blip lasts.',
      'aenv.sustain': 'At zero, so the sound is silent between pulses.',
    },
    tweaks: [
      { id: 'lfo.rate', try: 'Move between 6.5 and 8.5', hear: 'The pulse rate changes from eighth notes up to a fast trill.' },
      { id: 'fenv.decay', try: 'Open slowly from 2 to 5', hear: 'The pulses go from muted ticks to bright stabs: the classic build.' },
      { id: 'mod.lfoAmt', try: 'Set to 5 and flip OSC A PW to DIR', hear: 'The same LFO that fires the notes also moves the pulse width, so the tone changes within each blip.' },
      { id: 'aenv.sustain', try: 'Raise to 5', hear: 'The note now sounds all the time, with the pulses riding on top of it.' },
    ],
  },
  {
    id: 'radiophonic-drone', name: 'Radiophonic Drone', ref: 'In the style of BBC Radiophonic Workshop atmospheres', artist: 'DRONE and a second LFO',
    tags: ['drone', 'fx', 'patch'], level: 3,
    blurb: 'A self-playing siren that rises, falls and shifts in tone without a key held.',
    how: 'DRONE holds the gate open, so the synth sounds on its own. Oscillator B is dropped into LO FREQ and taken off the keyboard, which turns it into a very slow second LFO. Both B and the main LFO feed the DIRECT bus, and that one bus goes to Oscillator A’s pitch and to the filter, so pitch and tone drift together in a pattern that takes a long time to repeat. A cable from KYBD CV to LFO CV makes higher notes wobble faster.',
    phrase: { bpm: 40, loop: true, steps: [[0, 45, 7.5], [8, 40, 7.5]] },
    steps: [
      { title: 'Hold the gate open', module: 'mode', why: 'DRONE holds the gate open, so the synth sounds with no key held. The envelopes rise to their sustain levels and stay there, which makes the SUSTAIN knobs the level and brightness of the drone.\n- Drone on, Repeat off: a steady, held gate. Keys now only choose the pitch.\n- Loudness ATTACK 6 (260 ms): the drone fades in over about a quarter of a second rather than clicking on.\n- Loudness SUSTAIN 8: how loud the drone is held.\n- Filter SUSTAIN 5: where the filter envelope sits while the gate is held (the filter envelope amount is still 0 here).\n- Listen for: the default saw starts sounding on its own. Switch Drone off to stop it.',
        set: { 'mode.drone': true, 'mode.repeat': false, 'aenv.attack': 6, 'aenv.sustain': 8, 'fenv.sustain': 5 } },
      { title: 'One low saw', module: 'osc', why: 'One low saw is the sound. Oscillator B is about to become a modulator, so it is kept out of the mixer.\n- Osc A sawtooth on, pulse off: bright and buzzy, full of harmonics for the resonant filter to pick out later.\n- OCTAVE osc A 1: one below the default, a low drone register (octaves run 0 to 3).\n- Sync off: A runs freely.\n- OSC A 8, OSC B 0: only Oscillator A is heard.\n- Listen for: the drone drops an octave and stays steady. It will not move until the next steps add modulation.',
        set: { 'oscA.saw': true, 'oscA.pulse': false, 'oscA.octave': '1', 'oscA.sync': false, 'mix.oscA': 8, 'mix.oscB': 0 } },
      { title: 'Turn Oscillator B into a slow LFO', module: 'osc', why: 'LO FREQ drops Oscillator B far below hearing, turning it into a second LFO (low-frequency oscillator) with three shapes. The Pro-1 lets you do this, at the cost of losing B as a sound.\n- Osc B low frequency LO FREQ: B now moves slowly instead of making a tone.\n- Osc B keyboard off: B ignores the keys, so the slow sweep does not change speed with the note.\n- Triangle only: a smooth rise and fall.\n- OCTAVE osc B 0, FREQUENCY −4: in LO FREQ these set speed. Low octave and FREQUENCY well to the left gives two to three seconds per cycle.\n- Listen for: nothing yet. B is silent in the mixer and not routed anywhere.',
        set: { 'oscB.lo': 'lo', 'oscB.kbd': false, 'oscB.saw': false, 'oscB.tri': true, 'oscB.pulse': false, 'oscB.octave': '0', 'oscB.freq': -4 } },
      { title: 'Feed both modulators into the DIRECT bus', module: 'mod', why: 'The modulation section sends three sources over two buses: DIRECT (always on) and WHEEL (only as you push the mod wheel). Both slow sources go on the DIRECT bus, and pitch and filter both listen to it.\n- AMOUNT OSC B 5, route DIRECT: the slow sweep, bending pitch and moving the filter by a good amount.\n- AMOUNT LFO 4, LFO FREQUENCY 2 (0.26 Hz): the triangle LFO, also routed DIRECT, adds a smaller movement on top, about one cycle every four seconds.\n- To OSC A FREQ DIR and To FILTER DIR: both destinations get the same mix of the two sources.\n- Listen for: the drone starts rising and falling like a siren, in a pattern that takes a long time to repeat because the two speeds do not line up.',
        set: { 'mod.oscBAmt': 5, 'mod.oscBRoute': 'direct', 'mod.lfoAmt': 4, 'mod.lfoRoute': 'direct', 'lfo.tri': true, 'lfo.saw': false, 'lfo.pulse': false, 'lfo.rate': 2, 'mod.toAFreq': 'direct', 'mod.toFilter': 'direct' } },
      { title: 'Resonant filter', module: 'filter', why: 'The filter is a 24 dB per octave low-pass. With resonance up it picks out a moving band of the saw, and because the cutoff is on the DIRECT bus that band drifts on its own.\n- CUTOFF 5 (632 Hz): the centre the modulation moves around, mid-dark.\n- RESONANCE 6: a strong peak at the cutoff. The drifting peak sounds like a second, vocal voice over the drone. Lower it and the drift is heard only as brightness.\n- ENVELOPE AMOUNT 0: the filter envelope does nothing here; the modulation bus moves the cutoff.\n- KEYBOARD AMOUNT 3: higher notes open the filter a little.\n- Listen for: a whistling, vowel-like band sweeping through the tone along with the pitch.', set: { 'filter.cutoff': 5, 'filter.res': 6, 'filter.env': 0, 'filter.kbd': 3 } },
      { title: 'Patch KYBD CV into LFO CV', module: 'patch', why: 'A patch cable sends the keyboard pitch voltage into the LFO’s speed input. CV means control voltage: a voltage that sets another control.\n- Cable KYBD CV → LFO CV: the keyboard voltage is added to the LFO FREQUENCY knob. Higher notes send a higher voltage, so the LFO runs faster; lower notes slow it down. Only the main LFO is affected: Oscillator B’s slow sweep has its keyboard switch off and keeps its own speed.\n- Listen for: play keys an octave or two apart. On high notes the smaller movement quickens; on low ones it lazes.', cables: [['j.kybdCv', 'j.lfoCv']] },
    ],
    context: {
      'mode.drone': 'Keeps the sound going with no key held. Switch it off to stop the drone.',
      'oscB.lo': 'Drops Oscillator B below hearing so it works as an LFO.',
      'oscB.freq': 'In LO FREQ this is Oscillator B’s speed. Further left is slower.',
      'oscB.kbd': 'Off, so the slow sweep does not change speed with the note.',
      'mod.oscBAmt': 'How far the slow sweep bends the pitch and moves the filter.',
      'mod.lfoAmt': 'The smaller movement layered on the slow sweep.',
      'mod.toFilter': 'Listens to the same DIRECT bus as OSC A FREQ, so tone and pitch move together.',
    },
    tweaks: [
      { id: 'oscB.freq', try: 'Turn slowly up to 0', hear: 'The slow siren speeds up until it becomes a flutter.' },
      { id: 'oscB.saw', try: 'Switch triangle off and saw on', hear: 'The pitch now ramps up and drops: an alarm rather than a siren.' },
      { id: 'oscA.sync', try: 'Switch SYNC on and bring OSC B back to NORMAL with KYBD on', hear: 'A different lesson, but worth hearing: the bus now sweeps a synced oscillator and the drone turns vocal.' },
      { id: 'filter.res', try: 'Raise to 9', hear: 'The filter starts to whistle on its own and the drone gains a second, sliding pitch.' },
    ],
  },
];

const init = {};
controls.forEach((c) => { init[c.id] = c.def; });

export default {
  id: 'pro-1', name: 'Pro-1', maker: 'Behringer', year: 2019,
  heritage: 'Modelled on the 1981 Sequential Circuits Pro-One',
  summary: 'Two oscillators and noise feed a mixer, a 24 dB low-pass filter and the amplifier, each with its own ADSR. A switch-based modulation matrix sends the filter envelope, Oscillator B and the LFO to pitch, pulse width and cutoff, directly or under the mod wheel.',
  view: { w: 2156, h: 650 },
  theme: { panel: '#1a1a1b', panel2: '#101011', ink: '#f2f2ee', font: 'helv', cheeks: 'wood', cheekW: 56 },
  signalNames: { osc1: 'Oscillator A', osc2: 'Oscillator B', env1: 'the filter envelope', env2: 'the amplifier envelope', mixer: 'the mixer output (oscillators and noise)' },
  lineage,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds],
};
