// Buchla Music Easel — SynthDef. Laid out from the user's photo of an Easel Command: the Model 208C sound source on top
// and the strip of controls above the Model 218e touch keyboard below it. The case's ELECTRIC MUSIC BOX I/O module on the
// left and the touch keys themselves are left out (the app's own keyboard plays the 218e). Coordinates are written in
// pixels of the full-size photo (ref/buchla-music-easel.jpg) and moved to the faceplate by X0 / Y0.
//
// Voltages: an engine signal of 1 is 10 on the Easel's 0–10 scale. Every voltage-controlled parameter is an offset
// slider plus a processing slider that scales what is patched into the black jack below them; the jacks' `amt` is the
// processing slider. See `easel` in CONTRACT.md for the engine side.
import { annotate, clamp, pwl, fmtTime, fmtHz } from '@/lib/maps.js';
import moreSounds from '@/synths/sounds/buchla-easel.js';
import lineage from '@/synths/lineage/buchla-easel.js';
import unusual from '@/synths/unusual/buchla-easel.js';

const X0 = 675, Y0 = 100;
const INK = '#1c2230';
const PANEL = '#dedfdb';
const BLUE = '#1e2c5e'; // the 218e panel
const WHITE = '#f4f4ef';

// ── Scales, as printed ────────────────────────────────────────────────────
// Times (envelope and pulser): .002 s at 10, .025 at 8, .2 at 6, 1 at 4, 3.5 at 2, 10 s at 0
const T_PTS = [[0, 10], [2, 3.5], [4, 1], [6, 0.2], [8, 0.025], [10, 0.002]];
const timeS = (v) => pwl(v, T_PTS, true);
// Pitch, and the modulation oscillator's high range: 33 Hz at 0 to 3 kHz at 10. Its low range: 0.4 Hz to 33 Hz.
const HI_PTS = [[0, 33], [2, 88], [4, 200], [6, 440], [8, 1000], [10, 3000]];
const LO_PTS = [[0, 0.4], [2, 1], [4, 2.2], [6, 5], [8, 12], [10, 33]];
const hiHz = (v) => pwl(v, HI_PTS, true);
const loHz = (v) => pwl(v, LO_PTS, true);
const noteOf = (hz) => 69 + (12 * Math.log(hz / 440)) / Math.LN2;
const fineSemi = (v) => ((v - 5) / 5) * 3; // fine tuning: half an octave in all
const arpHz = (v) => 0.5 * Math.pow(40, v / 10);
const portaS = (v) => (v < 0.05 ? 0 : 0.01 * Math.pow(300, v / 10));
const fmtPct = (v) => `${Math.round(v * 10)}%`;

const controls = [];
const decor = [];
const jacks = [];
const px = (x) => x - X0;
const py = (y) => y - Y0;
const text = (x, y, t, size = 17, rest = {}) => decor.push({ t: 'text', x: px(x), y: py(y), text: t, size, anchor: 'middle', ...rest });
/** Lettering on the 218e's blue panel: white on the hardware, ink in the outline view. */
const btext = (x, y, t, size = 17, rest = {}) => text(x, y, t, size, { fill: WHITE, ...rest });
const line = (x1, y1, x2, y2, w = 2, rest = {}) => decor.push({ t: 'line', x1: px(x1), y1: py(y1), x2: px(x2), y2: py(y2), w, ...rest });
const path = (d, w = 2, rest = {}) => decor.push({ t: 'path', d, w, fill: 'none', ...rest });
const screw = (x, y) => decor.push({ t: 'screw', x: px(x), y: py(y), r: 9 });
const led = (x, y, color, litWhen, r = 6) => decor.push({ t: 'led', x: px(x), y: py(y), r, color, litWhen });

/** A slider: (x, travel centre 635). `cap` colours it by section, as on the panel. */
const SLIDER = { type: 'fader', orient: 'v', len: 210, pad: 22, ticks: 6, labelPos: 'none', kind: 'cont', min: 0, max: 10 };
const slider = (id, x, cap, rest) => controls.push({ id, ...SLIDER, x: px(x), y: py(635), cap, ...rest });
const CAP = { red: '#c8211e', blue: '#3c79c9', green: '#2c8a4b', yellow: '#f0c419', white: '#f2f2ee', black: '#1d1e21' };
/** A bat-handle toggle, seen from the front. Up is the first option. */
const toggle = (id, x, y, tip, rest) => controls.push({ id, type: 'toggle', w: 30, x: px(x), y: py(y), tip: CAP[tip], labelPos: 'none', ...rest });
const knob = (id, x, y, r, cap, rest) => controls.push({
  id, type: 'knob', x: px(x), y: py(y), r, style: 'vcs3', cap: CAP[cap], kind: 'cont', min: 0, max: 10, labelPos: 'none', ...rest,
});
const S10 = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, size: 13, numR: 1.5, tickR: 1.18 };
const jack = (id, x, y, rest) => jacks.push({ id, x: px(x), y: py(y), r: 18, labelPos: 'none', ...rest });
const mini = (id, x, y, rest) => jacks.push({ id, x: px(x), y: py(y), r: 15, labelPos: 'none', ...rest });

// What a processing slider at 0 does to its jack
const procCheck = (id, name) => (v) => (v[id] <= 0 ? `${name} is at 0, so nothing patched here gets through. Raise it.` : null);

// ── Faceplate: frames and section titles ──────────────────────────────────
const frame = (x, y, w, h) => decor.push({ t: 'rect', x: px(x), y: py(y), w, h, r: 0, stroke: INK, sw: 1.6 });
// top row of jacks
frame(690, 108, 755, 132); frame(1445, 108, 165, 132); frame(1610, 108, 300, 132); frame(1910, 108, 175, 132);
frame(2085, 108, 245, 132); frame(2330, 108, 245, 132); frame(2575, 108, 160, 132); frame(2735, 108, 180, 132);
// the control sections
frame(690, 240, 230, 232); frame(920, 240, 180, 232); frame(1100, 240, 225, 232); frame(1325, 240, 195, 232);
frame(1520, 240, 370, 232); frame(1890, 240, 350, 232); frame(2240, 240, 370, 232);
// slider sections
frame(690, 472, 368, 348); frame(1058, 472, 277, 348); frame(1335, 472, 170, 348); frame(1505, 472, 375, 348);
frame(1880, 472, 365, 348); frame(2245, 472, 180, 348); frame(2425, 472, 185, 348); frame(2610, 240, 305, 760);
frame(690, 820, 365, 168);
decor.push({ t: 'rect', x: px(675), y: py(100), w: 2250, h: 900, r: 0, stroke: INK, sw: 2, hw: true });

text(1030, 140, 'STORED  PROGRAM  SOUND  SOURCE', 17, { spacing: 1 });
text(1375, 140, 'MODEL 208C', 17, { spacing: 1 });
const title = (x, y, t, size = 17) => text(x, y, t, size, { spacing: 0.5 });
title(1527, 140, 'CONTROL'); title(1760, 140, 'MOD OSC IN/OUT'); title(1997, 140, 'INVERTER'); title(2207, 140, 'COMP OSC');
title(2452, 140, 'PREAMP / ENVELOPE DET'); title(2655, 140, 'CARD IN'); title(2825, 140, 'MIX OUT');
title(805, 260, 'SEQUENTIAL VOLTAGE'); title(1010, 260, 'RANDOM VOLTAGE'); title(1212, 260, 'ENVELOPE GENERATOR');
title(1422, 260, 'PULSER'); title(1705, 260, 'MODULATION OSCILLATOR'); title(2065, 260, 'COMPLEX OSCILLATOR');
title(2425, 260, 'DUAL LO PASS GATE');

// The program interface: the card slot of the original Easel
text(733, 182, 'PROGRAM', 16); text(733, 204, 'INTERFACE', 16);
decor.push({ t: 'rect', x: px(790), y: py(150), w: 640, h: 56, r: 6, fill: '#2a63b8', stroke: '#173d78', sw: 2, hw: true });
decor.push({ t: 'rect', x: px(822), y: py(168), w: 576, h: 20, r: 3, fill: '#0f1520', hw: true });
for (let k = 0; k < 40; k++) decor.push({ t: 'rect', x: px(828 + k * 14.2), y: py(171), w: 6, h: 14, r: 1, fill: '#c9a24a', hw: true });
[[805, 178], [1418, 178]].forEach(([x, y]) => screw(x, y));
decor.push({ t: 'rect', x: px(790), y: py(150), w: 640, h: 56, r: 6, stroke: INK, sw: 1.5 });

// ── Top row: CONTROL, the oscillator jacks, inverter, preamp, card and mix ──
toggle('card.control', 1522, 190, null, {
  kind: 'enum', options: [{ v: 'remote', label: 'remote' }, { v: 'both', label: 'both' }, { v: 'local', label: 'local' }], def: 'local', module: 'util',
  name: 'CONTROL',
  help: 'Chooses whether the sound is set from the front panel (local), from a program brought in over the program interface or by MIDI (remote), or both added together. This app has no programs to bring in, so it is always played from the panel.',
});
text(1570, 176, 'remote', 14, { anchor: 'start' }); text(1570, 195, 'both', 14, { anchor: 'start' }); text(1570, 214, 'local', 14, { anchor: 'start' });
led(1607, 192, 'amber', 'power', 6);

mini('j.fmIn', 1650, 188, { label: 'f.m. in', dir: 'in', dest: 'fmIn', amt: 1, add: true, module: 'osc',
  help: 'An audio input that frequency-modulates the modulation oscillator, at the depth of its f.m. in knob. In this app the only audio you can patch here comes from the Easel itself.',
  check: (v) => (v['mosc.fmIn'] <= 0 ? 'The f.m. in knob is at 0, so nothing arriving here moves the modulation oscillator. Turn it up.' : null),
  hear: (v, x) => `${x.src} shakes the modulation oscillator’s frequency at the depth of the f.m. in knob. What you hear depends on where the modulation oscillator goes: through Gate 2 it becomes clangy and inharmonic, and as a modulator it makes the complex oscillator’s sidebands move.` });
mini('j.mosc', 1720, 188, { label: 'm.osc', name: 'm.osc (audio out)', dir: 'out', signal: 'osc2',
  help: 'The modulation oscillator as an audio signal, on a miniature jack.' });
jack('j.modOut', 1795, 188, { label: 'mod out', name: 'mod out (voltage)', dir: 'out', signal: 'osc2', banana: 'green',
  help: 'A copy of the modulation oscillator’s waveform as a control voltage, so it can be patched to any black input: a slow one for vibrato or a wobble, a fast one for audio-rate modulation.' });
jack('j.fromCard', 1870, 188, { label: 'from card', dir: 'out', signal: null, banana: 'violet',
  help: 'Brings a voltage out from a program card. This app has no program card, so it carries nothing.' });
['f.m. in', 'm.osc', 'mod out', 'from card'].forEach((t, k) => text(1650 + k * 73, 232, t, 14));

jack('j.invIn', 1965, 188, { label: 'input', name: 'INVERTER input', dir: 'in', dest: 'inv10In', amt: 1, module: 'util',
  help: 'The inverter’s input. Whatever voltage arrives is turned upside down on the 0 to 10 scale and sent to the blue output beside it.',
  hear: (v, x) => `The inverter now gives 10 minus ${x.src}: where it rises, the inverter’s output falls. You hear it only where the inverter’s blue output is patched.` });
jack('j.invOut', 2035, 188, { label: 'output', name: 'INVERTER output', dir: 'out', signal: 'inv10', banana: 'blue',
  help: 'The inverted voltage: 10 minus the input, so 10 becomes 0 and 3 becomes 7. A rising envelope comes out falling. With nothing patched in, it gives a steady 10.' });
text(1965, 232, 'input', 14); text(2035, 232, 'output', 14);
path(`M${px(1987)} ${py(222)} L${px(2003)} ${py(214)} L${px(1987)} ${py(206)} Z`, 1.5);

mini('j.ws', 2140, 188, { label: 'w.s.', dir: 'out', signal: null,
  help: 'A miniature jack for the complex oscillator’s waveshaper. The panel gives only the abbreviation, and this app does not model it.' });
mini('j.cosc', 2215, 188, { label: 'c.osc', name: 'c.osc (audio out)', dir: 'out', signal: 'osc1',
  help: 'The complex oscillator as an audio signal: the same sound Gate 1 receives, with its waveshape, timbre and any AM.' });
mini('j.gate1In', 2290, 188, { label: 'gate1 in', dir: 'in', dest: 'lpg1In', amt: 1, module: 'filter',
  help: 'An audio input to Lo Pass Gate 1. A plug here takes the place of the complex oscillator, so Gate 1 shapes whatever you patch in instead.',
  hear: (v, x) => `Gate 1 now shapes ${x.src} instead of the complex oscillator.` });
text(2140, 232, 'w.s.', 14); text(2215, 232, 'c.osc', 14); text(2290, 232, 'gate1 in', 14);

mini('j.aux', 2365, 188, { label: 'aux in / nse', name: 'aux in / nse', dir: 'in', dest: 'preampIn', amt: 1, module: 'util',
  help: 'The preamp input. With nothing plugged in the preamp hears the Easel’s own noise source; a plug brings in an outside signal instead. The preamp feeds Gate 2 (when its source is set to it), the balanced modulator and the envelope detector.' });
toggle('preamp.gain', 2440, 200, 'blue', {
  w: 22, kind: 'enum', options: [{ v: 'low', label: 'low' }, { v: 'high', label: 'high' }], def: 'low', module: 'util', name: 'Preamp gain',
  help: 'Preamp gain: low for line-level signals, high for quiet ones such as a contact microphone. High also drives the noise source harder, into a rougher, louder hiss.',
});
text(2440, 162, 'gain', 13); text(2410, 180, 'low', 13); text(2472, 180, 'high', 13);
jack('j.envOut', 2525, 188, { label: 'env out', dir: 'out', signal: 'envf', banana: 'blue',
  help: 'The envelope detector: a control voltage that rises and falls with the loudness of whatever is in the preamp.' });
text(2365, 232, 'aux in / nse', 14); text(2525, 232, 'env out', 14);
decor.push({ t: 'path', d: `M${px(2392)} ${py(190)} H${px(2425)} M${px(2455)} ${py(190)} H${px(2500)}`, w: 2, dash: '2 5' });

jack('j.card1', 2615, 188, { label: 'to card1', dir: 'in', dest: null, banana: 'black',
  help: 'Sends a voltage to a program card. This app has no program card, so it does nothing.' });
jack('j.card2', 2690, 188, { label: 'to card2', dir: 'in', dest: null, banana: 'black',
  help: 'Sends a voltage to a program card. This app has no program card, so it does nothing.' });
text(2615, 232, 'to card1', 14); text(2690, 232, 'to card2', 14);
mini('j.out1', 2765, 188, { label: 'master out', name: 'master out (left)', dir: 'out', signal: 'master',
  help: 'The Easel’s output: both gates mixed, with reverberation, after MASTER VOLUME.' });
mini('j.out2', 2835, 188, { label: 'master out', name: 'master out (right)', dir: 'out', signal: 'master',
  help: 'The Easel’s output, the same signal as the other master out jack.' });
text(2800, 232, 'master out', 14);
[[690, 115], [1440, 115], [2925, 115]].forEach(([x, y]) => screw(x + (x > 2900 ? -12 : 12), y + 12));

// ── Sequential voltage source ─────────────────────────────────────────────
const tpos = (x, y, labels, size = 15, dx = 32) => labels.forEach((t, k) => text(x + dx, y - 20 + k * 20, t, size, { anchor: 'start' }));
toggle('seq.trig', 728, 310, 'blue', {
  kind: 'enum', options: [{ v: 'kbd', label: 'keybd' }, { v: 'pulser', label: 'pulser' }, { v: 'off', label: 'off' }], def: 'pulser', module: 'mod',
  name: 'Sequencer TRIGGER SOURCE',
  help: 'What moves the sequencer on to its next stage: each touch of the keyboard, or each pulse from the pulser. Off holds it on the stage it is at.',
});
tpos(728, 310, ['keybd', 'pulser', 'off']);
toggle('seq.stages', 855, 310, 'blue', {
  kind: 'enum', options: [{ v: 3, label: '3' }, { v: 4, label: '4' }, { v: 5, label: '5' }], def: 5, module: 'mod', name: 'Sequencer STAGES',
  help: 'How many stages the sequencer steps through before it starts again: three, four or five.',
});
tpos(855, 310, ['3', '4', '5'], 15, 26);
text(760, 362, 'trigger source', 15); text(870, 362, 'stages', 15);
const SEQ_X = [728, 798, 868, 940, 1008];
SEQ_X.forEach((x, k) => {
  toggle(`seq.p${k + 1}`, x, 410, 'blue', {
    kind: 'bool', def: true, module: 'mod', name: `PULSE SEQUENCE ${k + 1}`,
    help: `Up: stage ${k + 1} sends a pulse when the sequencer reaches it, to fire whatever is set to “sequencer”. Down: it stays silent, which is how rests go into a pattern.`,
  });
  text(x + 32, 398, String(k + 1), 15);
  led(x + 28, 440, 'blue', { seq: k }, 6);
});
text(795, 460, 'pulse sequence', 15);
[722, 795, 865, 937, 1010].forEach((x, k) => {
  slider(`seq.l${k + 1}`, x, 'blue', {
    def: [2, 4, 6, 4, 8][k], module: 'mod', name: `Sequencer level ${k + 1}`, fmt: (v) => `${Math.round(v * 10) / 10}`,
    help: `The voltage the sequencer puts out while it is on stage ${k + 1}. Patch a blue jack to PITCH for a tune, or to TIMBRE or a gate LEVEL for a rhythm of tone or loudness.`,
  });
});
[[10, 530], [8, 572], [6, 614], [4, 656], [2, 698], [0, 740]].forEach(([n, y]) => text(762, y + 5, String(n), 14));
text(870, 800, 'sequencer voltage levels', 16);

// ── Random voltage source ─────────────────────────────────────────────────
toggle('rvs.trig', 970, 310, 'white', {
  kind: 'enum', options: [{ v: 'kbd', label: 'keybd' }, { v: 'pulser', label: 'pulser' }, { v: 'seq', label: 'sequencer' }], def: 'kbd', module: 'mod',
  name: 'Random TRIGGER SOURCE',
  help: 'What calls up four new random voltages on the white jacks: each touch of the keyboard, each pulse from the pulser, or each pulse from the sequencer.',
});
tpos(970, 310, ['keybd', 'pulser', 'sequencer']);
text(1010, 362, 'trigger source', 15);

// ── Envelope generator ────────────────────────────────────────────────────
toggle('env.trig', 1155, 310, 'red', {
  kind: 'enum', options: [{ v: 'kbd', label: 'keyboard' }, { v: 'pulser', label: 'pulser' }, { v: 'seq', label: 'sequencer' }], def: 'kbd', module: 'env',
  name: 'Envelope TRIGGER SOURCE',
  help: 'What starts the envelope: a touch on the keyboard, the pulser reaching the end of its ramp, or a pulse from the sequencer.',
});
tpos(1155, 310, ['keyboard', 'pulser', 'sequencer']);
text(1212, 362, 'trigger source', 15);
toggle('env.mode', 1155, 410, 'red', {
  kind: 'enum', options: [{ v: 'sus', label: 'sustained' }, { v: 'trans', label: 'transient' }, { v: 'self', label: 'self' }], def: 'sus', module: 'env',
  name: 'Envelope MODE SELECT',
  help: 'Sustained: the envelope holds at the top for as long as a key is touched. Transient: it holds for the time on the sustain slider, however long the touch. Self: it starts again by itself each time it finishes, so it repeats.',
});
tpos(1155, 410, ['sustained', 'transient', 'self']);
text(1212, 460, 'mode select', 15);
led(1278, 440, 'amber', 'env1', 6);
const envSlider = (id, x, word, def, help) => slider(id, x, 'red', { def, module: 'env', name: `Envelope ${word}`, fmt: (v) => fmtTime(timeS(v)), help });
envSlider('env.attack', 1105, 'attack', 9, 'How long the envelope takes to rise, from 2 ms at the top of the slider to 10 seconds at the bottom. The slider is printed in seconds, fastest at the top.');
envSlider('env.sustain', 1197, 'sustain', 6, 'In transient and self modes, how long the envelope stays at the top: 2 ms at the top of the slider to 10 seconds at the bottom. In sustained mode a held key decides instead.');
envSlider('env.decay', 1288, 'decay', 5, 'How long the envelope takes to fall away, from 2 ms at the top of the slider to 10 seconds at the bottom.');
const timeMarks = (x) => [['.002', 530], ['.025', 572], ['.2', 614], ['1', 656], ['3.5', 698], ['10', 740]].forEach(([t, y]) => text(x, y + 5, t, 14));
timeMarks(1150); timeMarks(1421);
text(1105, 800, 'attack', 16); text(1197, 800, 'sustain', 16); text(1288, 800, 'decay', 16);

// ── Pulser ────────────────────────────────────────────────────────────────
toggle('pulser.trig', 1365, 310, 'yellow', {
  kind: 'enum', options: [{ v: 'kbd', label: 'keyboard' }, { v: 'self', label: 'self' }, { v: 'seq', label: 'sequencer' }], def: 'self', module: 'lfo',
  name: 'Pulser TRIGGER SOURCE',
  help: 'What starts the pulser’s ramp: a touch on the keyboard, a pulse from the sequencer, or (self) its own pulse at the end of each ramp, so it runs on its own like a clock.',
});
tpos(1365, 310, ['keyboard', 'self', 'sequencer']);
text(1422, 362, 'trigger source', 15);
toggle('pulser.mode', 1365, 410, 'yellow', {
  kind: 'enum', options: [{ v: 'sus', label: 'sustnd' }, { v: 'trans', label: 'trans' }, { v: 'off', label: 'off-ext' }], def: 'trans', module: 'lfo',
  name: 'Pulser mode',
  help: 'Transient: one ramp for each trigger. Sustained: with the keyboard as trigger, the pulser keeps repeating for as long as a key is touched. Off: it ignores its triggers and stops.',
});
tpos(1365, 410, ['sustnd', 'trans', 'off-ext']);
text(1385, 460, 'mode', 15);
controls.push({
  id: 'pulser.one', type: 'button', w: 30, h: 30, x: px(1470), y: py(425), kind: 'bool', def: false, module: 'lfo', labelPos: 'none', name: 'Pulser ONE',
  help: 'Fires the pulser once by hand, each time you press it. In self mode that is what starts it running again after it has been switched off.',
});
text(1470, 460, 'one', 15);
led(1468, 388, 'amber', 'pulser', 6);
slider('pulser.periodCv', 1378, 'yellow', {
  def: 0, module: 'lfo', name: 'PERIOD processing', fmt: fmtPct,
  help: 'How much a voltage patched into the black PERIOD jack below shortens the pulser’s period. At 0 the jack does nothing; at 10 a full voltage takes the slider all the way to the fastest end.',
});
slider('pulser.period', 1465, 'yellow', {
  def: 6, module: 'lfo', name: 'PERIOD', fmt: (v) => fmtTime(timeS(v)),
  help: 'The length of the pulser’s ramp, and so the time between its pulses: 2 ms at the top of the slider to 10 seconds at the bottom. In self mode this is the speed of the Easel’s clock.',
});
text(1422, 800, 'period', 16);

// ── Modulation oscillator ─────────────────────────────────────────────────
toggle('mosc.kbd', 1560, 310, 'green', {
  kind: 'bool', def: false, module: 'lfo', name: 'Modulation oscillator KEYBOARD',
  help: 'On: the modulation oscillator follows the keyboard in semitones, so it keeps the same relation to the complex oscillator as you play. Off: it stays at the frequency of its sliders.',
});
tpos(1560, 310, ['on', '', 'off'], 15, 38);
text(1560, 362, 'keyboard', 15);
toggle('mosc.range', 1560, 410, 'green', {
  kind: 'enum', options: [{ v: 'high', label: 'high' }, { v: 'low', label: 'low' }], def: 'low', module: 'lfo', name: 'Modulation oscillator range',
  help: 'Low: 0.4 to 33 Hz, a slow modulator for vibrato, tremolo and trills. High: 33 Hz to 3 kHz, an audio-rate modulator for FM and AM timbres, or a second voice through Gate 2.',
});
tpos(1560, 410, ['high', '', 'low'], 15, 38);
text(1560, 460, 'range', 15);
knob('mosc.fmIn', 1665, 300, 34, 'green', {
  def: 0, module: 'lfo', name: 'Modulation oscillator f.m. in', fmt: fmtPct,
  help: 'Depth of frequency modulation from whatever is plugged into the f.m. in jack at the top of the panel. It does nothing with that jack empty.',
});
text(1665, 362, 'f.m. in', 15);
knob('mosc.fine', 1665, 410, 34, 'green', {
  def: 5, module: 'lfo', name: 'Modulation oscillator fine tune', fmt: (v) => `${fineSemi(v) >= 0 ? '+' : ''}${fineSemi(v).toFixed(1)} st`,
  help: 'Fine tuning of the modulation oscillator, half an octave in all. Small moves change the beating between the two oscillators.',
});
text(1665, 460, 'fine tune', 15);
toggle('mosc.wave', 1765, 310, 'green', {
  kind: 'enum', options: [{ v: 'saw', label: '' }, { v: 'sq', label: '' }, { v: 'tri', label: '' }], def: 'tri', module: 'lfo', name: 'Modulation oscillator waveshape',
  help: 'The modulation oscillator’s wave: sawtooth (up), square (centre) or triangle (down). It shapes everything the oscillator does: a square gives trills, a sawtooth a siren that snaps back, a triangle a smooth sweep.',
});
[['saw', 290], ['sq', 310], ['tri', 330]].forEach(([s, y]) => decor.push({ t: 'wave', x: px(1820), y: py(y), size: 18, shape: s }));
text(1765, 362, 'waveshape', 15);
toggle('mosc.mode', 1765, 410, 'green', {
  kind: 'enum', options: [{ v: 'bal', label: 'bal. ext' }, { v: 'am', label: 'a.m. osc.' }, { v: 'fm', label: 'f.m. osc.' }], def: 'fm', module: 'lfo',
  name: 'Modulation oscillator modulation',
  help: 'What the modulation oscillator does to the sound, at the depth of the modulation sliders. f.m. osc.: shakes the complex oscillator’s pitch. a.m. osc.: shakes its loudness, ending in ring modulation at full depth. bal. ext: ring-modulates the preamp signal instead, for Gate 2.',
});
tpos(1765, 410, ['bal. ext', 'a.m. osc.', 'f.m. osc.'], 15, 32);
text(1800, 460, 'modulation', 15);
slider('mosc.freqCv', 1560, 'green', {
  def: 0, module: 'lfo', name: 'Modulation oscillator FREQUENCY processing', fmt: fmtPct,
  help: 'How much a voltage patched into the black FREQUENCY jack below moves the modulation oscillator: up to five octaves for a full voltage with this slider at 10.',
});
slider('mosc.freq', 1650, 'green', {
  def: 6, module: 'lfo', name: 'Modulation oscillator FREQUENCY',
  fmt: (v) => fmtHz(loHz(v)) + ' (low) / ' + fmtHz(hiHz(v)) + ' (high)',
  help: 'Frequency of the modulation oscillator. Read the left-hand scale in the low range (0.4 to 33 Hz) and the right-hand one in the high range (33 Hz to 3 kHz).',
});
slider('mosc.indexCv', 1742, 'green', {
  def: 0, module: 'lfo', name: 'Modulation processing', fmt: fmtPct,
  help: 'How much a voltage patched into the black modulation jack below adds to the modulation depth. An envelope here makes each note start bright and settle.',
});
slider('mosc.index', 1833, 'green', {
  def: 0, module: 'lfo', name: 'Modulation (index)', fmt: (v) => `index ${(v / 10).toFixed(2)}`,
  help: 'How deeply the modulation oscillator modulates, from 0 (none) to 1.0. In FM, .2 is about a semitone of vibrato and near 1 the pitch is lost in the sidebands; in AM, 1.0 is full ring modulation.',
});
[['33', 530], ['12', 572], ['5.0', 614], ['2.2', 656], ['1.0', 698], ['.4', 740]].forEach(([t, y]) => text(1608, y + 5, t, 14));
[['3000', 530], ['1000', 572], ['440', 614], ['200', 656], ['88', 698], ['33', 740]].forEach(([t, y]) => text(1697, y + 5, t, 14));
text(1608, 488, 'low', 14); text(1697, 488, 'high', 14);
[['10', 530], ['8', 572], ['6', 614], ['4', 656], ['2', 698], ['0', 740]].forEach(([t, y]) => { text(1792, y + 5, t, 14); text(2160, y + 5, t, 14); text(2340, y + 5, t, 14); text(2525, y + 5, t, 14); });
text(1605, 800, 'frequency', 16); text(1790, 800, 'modulation', 16);

// ── Complex oscillator ────────────────────────────────────────────────────
toggle('cosc.kbd', 1925, 310, 'red', {
  kind: 'bool', def: true, module: 'osc', name: 'Complex oscillator KEYBOARD',
  help: 'On: the complex oscillator plays the keyboard in equal-tempered semitones, from the pitch set by its sliders at the lowest key. Off: it stays where the sliders put it, and only a voltage at its PITCH jack moves it.',
});
tpos(1925, 310, ['on', '', 'off'], 15, 38);
text(1925, 362, 'keyboard', 15);
toggle('cosc.sign', 1925, 410, 'red', {
  kind: 'enum', options: [{ v: -1, label: '−' }, { v: 1, label: '+' }], def: 1, module: 'osc', name: 'Complex oscillator polarity',
  help: 'Which way a voltage at the PITCH jack moves the pitch: + raises it, − lowers it. With an envelope on PITCH, − gives a note that dips and comes back.',
});
text(1965, 393, '−', 20); text(1965, 432, '+', 20);
text(1925, 460, 'polarity', 15);
knob('cosc.fine', 2025, 410, 36, 'red', {
  def: 5, module: 'osc', name: 'Complex oscillator fine tune', fmt: (v) => `${fineSemi(v) >= 0 ? '+' : ''}${fineSemi(v).toFixed(1)} st`,
  help: 'Fine tuning of the complex oscillator, half an octave in all. Use it to bring the keyboard into tune after setting PITCH.',
});
text(2025, 460, 'fine tune', 15);
knob('cosc.shape', 2165, 300, 44, 'red', {
  def: 5, module: 'osc', name: 'Complex oscillator waveshape', fmt: (v) => `${Math.round(100 - v * 10)}% sine`,
  help: 'Mixes the sine (turned fully left) with the wave chosen on the waveshape switch below (fully right). Halfway is half of each.',
});
decor.push({ t: 'wave', x: px(2105), y: py(345), size: 14, shape: 'sine' });
toggle('cosc.wave', 2125, 410, 'red', {
  kind: 'enum', options: [{ v: 'spike', label: '' }, { v: 'sq', label: '' }, { v: 'tri', label: '' }], def: 'sq', module: 'osc',
  name: 'Complex oscillator waveshape selector',
  help: 'The wave the waveshape knob mixes with the sine: spike (up), a narrow peak with many soft harmonics; square (centre), hollow and reedy; or triangle (down), mellow, and like the sine it can be folded by TIMBRE.',
});
path(`M${px(2155)} ${py(398)} q8 -26 14 0 t14 0`, 1.8);
[['sq', 412], ['tri', 432]].forEach(([s, y]) => decor.push({ t: 'wave', x: px(2170), y: py(y), size: 15, shape: s }));
text(2165, 460, 'waveshape', 15);
slider('cosc.pitchCv', 1925, 'red', {
  def: 0, module: 'osc', name: 'PITCH processing', fmt: (v) => `${Math.round(v * 40) / 10} st full scale`,
  help: 'How far a voltage at the black PITCH jack below moves the pitch. About 3 gives an octave for the sequencer’s full range; 7 spreads it over two and a third octaves.',
});
slider('cosc.pitch', 2015, 'red', {
  def: 2.97, module: 'osc', name: 'PITCH', fmt: (v) => fmtHz(hiHz(v)),
  help: 'The complex oscillator’s pitch, 33 Hz to 3 kHz. With KEYBOARD on, this is the note of the lowest key.',
});
slider('cosc.timbreCv', 2107, 'red', {
  def: 0, module: 'osc', name: 'TIMBRE processing', fmt: fmtPct,
  help: 'How much a voltage at the black TIMBRE jack below adds to TIMBRE. An envelope here gives each note a burst of brightness.',
});
slider('cosc.timbre', 2200, 'red', {
  def: 2, module: 'osc', name: 'TIMBRE', fmt: fmtPct,
  help: 'Adds harmonics by folding the sine and triangle back on themselves: a little rounds out the tone, a lot makes it bright and buzzy. It does nothing to the spike or square.',
});
[['3000', 530], ['1000', 572], ['440', 614], ['200', 656], ['88', 698], ['33', 740]].forEach(([t, y]) => text(1970, y + 5, t, 14));
text(1970, 800, 'pitch', 16); text(2155, 800, 'timbre', 16);

// ── Dual lo pass gate ─────────────────────────────────────────────────────
toggle('lpg.src', 2460, 295, 'black', {
  kind: 'enum', options: [{ v: 'mosc', label: 'mod osc' }, { v: 'ext', label: 'preamp' }, { v: 'series', label: 'series' }], def: 'mosc', module: 'filter',
  name: 'Gate 2 source',
  help: 'What Gate 2 hears: the modulation oscillator (up), the preamp (centre: the Easel’s noise, or an outside signal), or Gate 1’s output (down), so the two gates are in series.',
});
text(2275, 286, 'from mod. oscillator', 15, { anchor: 'start' });
text(2470, 352, 'gate 2 source', 15);
decor.push({ t: 'path', d: `M${px(2250)} ${py(300)} H${px(2440)} M${px(2485)} ${py(300)} H${px(2560)}`, w: 2, dash: '2 6' });
decor.push({ t: 'path', d: `M${px(2250)} ${py(335)} H${px(2330)} M${px(2370)} ${py(335)} L${px(2455)} ${py(320)}`, w: 2, dash: '2 6' });
path(`M${px(2330)} ${py(320)} L${px(2368)} ${py(335)} L${px(2330)} ${py(350)} Z`, 1.6);
path(`M${px(2560)} ${py(285)} L${px(2598)} ${py(300)} L${px(2560)} ${py(315)} Z`, 1.6);
toggle('lpg1.mode', 2310, 410, 'black', {
  kind: 'enum', options: [{ v: 'lp', label: 'lo pass filter' }, { v: 'combo', label: 'combination' }, { v: 'vca', label: 'voltage cntrld amp' }], def: 'combo', module: 'filter',
  name: 'Gate 1 mode select',
  help: 'What Gate 1 does as its level rises: open a lowpass filter (lo pass filter), turn the volume up (voltage cntrld amp), or both at once (combination), so that quieter is also duller, like a struck string.',
});
toggle('lpg2.mode', 2545, 410, 'black', {
  kind: 'enum', options: [{ v: 'lp', label: 'lo pass filter' }, { v: 'combo', label: 'combination' }, { v: 'vca', label: 'voltage cntrld amp' }], def: 'combo', module: 'filter',
  name: 'Gate 2 mode select',
  help: 'What Gate 2 does as its level rises: open a lowpass filter, turn the volume up, or both at once (combination).',
});
text(2428, 393, 'lo pass filter', 15); text(2428, 413, 'combination', 15); text(2428, 433, 'voltage cntrld amp', 15);
text(2310, 460, 'gate 1', 15); text(2428, 460, 'mode select', 15); text(2545, 460, 'gate 2', 15);
const gateSlider = (id, x, g, cv) => slider(id, x, 'black', cv ? {
  def: 0, module: 'filter', name: `Gate ${g} LEVEL processing`, fmt: fmtPct,
  help: `How much a voltage at the black LEVEL ${g} jack below opens Gate ${g}. Patch an orange envelope jack there and set this to 10 for a note that opens and closes with the envelope.`,
} : {
  def: 0, module: 'filter', name: `Gate ${g} LEVEL`, fmt: fmtPct,
  help: `How far Gate ${g} is open with nothing patched in: closed at 0, fully open at 10. Leave it at 0 when an envelope opens the gate, or the note never quite stops.`,
});
gateSlider('lpg1.levelCv', 2290, 1, true); gateSlider('lpg1.level', 2382, 1, false);
gateSlider('lpg2.levelCv', 2473, 2, true); gateSlider('lpg2.level', 2565, 2, false);
text(2335, 800, 'level 1', 16); text(2520, 800, 'level 2', 16);

// ── Output section ────────────────────────────────────────────────────────
mini('j.gate2In', 2655, 285, { label: 'gate2 sig', dir: 'in', dest: 'lpg2In', amt: 1, module: 'filter',
  help: 'An audio input to Lo Pass Gate 2. A plug here takes the place of whatever the gate 2 source switch chooses.',
  hear: (v, x) => `Gate 2 now shapes ${x.src} instead of what its source switch chooses.${v['out.b'] <= 0 ? ' channel B is at 0, so turn it up to hear Gate 2.' : ''}` });
text(2655, 330, 'gate2 sig', 14);
knob('out.b', 2815, 305, 40, 'blue', { def: 0, module: 'out', scale: S10, name: 'channel B', help: 'How much of Gate 2 is in the mix.' });
text(2880, 378, 'channel B', 15);
knob('out.a', 2705, 420, 40, 'blue', { def: 8, module: 'out', scale: S10, name: 'channel A', help: 'How much of Gate 1 is in the mix.' });
text(2790, 478, 'channel A', 15);
decor.push({ t: 'path', d: `M${px(2680)} ${py(300)} L${px(2760)} ${py(330)} M${px(2610)} ${py(470)} C${px(2700)} ${py(470)} ${px(2780)} ${py(500)} ${px(2915)} ${py(480)}`, w: 1.6, dash: '2 6' });
knob('out.rev', 2820, 565, 40, 'blue', { def: 2, module: 'fx', scale: S10, name: 'REVERBERATION', help: 'How much spring reverberation is added to the mix.' });
text(2690, 560, 'REVER-', 15); text(2690, 580, 'BERATION', 15);
knob('out.monitor', 2700, 665, 32, 'blue', { def: 5, module: 'out', scale: { ...S10, size: 12, numR: 1.65 }, name: 'MONITOR LEVEL',
  help: 'The level at the phones jack. This app plays the master outputs, so it changes nothing here.' });
text(2700, 742, 'MONITOR  LEVEL', 15);
mini('j.phones', 2835, 690, { label: 'phones', dir: 'out', signal: null, help: 'The headphone output, at MONITOR LEVEL. Not modelled: this app plays the master outputs.' });
text(2835, 742, 'phones', 15);
knob('out.master', 2790, 870, 56, 'red', { def: 7, module: 'out', scale: { ...S10, size: 15, numR: 1.45 }, name: 'MASTER VOLUME', help: 'The level of the Easel’s output.' });
text(2790, 982, 'MASTER  VOLUME', 16);
line(2610, 765, 2915, 765, 1.6);

// ── The patch field ───────────────────────────────────────────────────────
text(830, 840, 'KEYBOARD INPUTS', 16, { anchor: 'start' });
screw(712, 834);
const BLK = { banana: 'black' };
jack('j.kPulse', 723, 880, { ...BLK, label: 'pulse', name: 'Keyboard input: pulse', dir: 'in', dest: 'ezPulse', amt: 1,
  help: 'The keyboard’s pulse, which fires everything set to “keyboard” (the envelope, pulser, sequencer and random source). Inside the case the 218e’s pulse already arrives here; a cord replaces it with another pulse.',
  hear: (v, x) => (x.root === 'kpulse' ? 'This is the connection the case already makes inside, so nothing changes.'
    : `Everything set to “keyboard” (envelope, pulser, sequencer, random source) now fires each time ${x.src} rises past half way, instead of on each touch. The keys still set the pitch.`) });
jack('j.kPress', 823, 880, { ...BLK, label: 'pressure', name: 'Keyboard input: pressure', dir: 'in', dest: 'ezPress', amt: 1,
  help: 'The keyboard’s pressure, which the violet jacks on the patch field pass on. Inside the case the 218e’s pressure already arrives here; a cord replaces it.',
  hear: (v, x) => (x.root === 'press' ? 'This is the connection the case already makes inside, so nothing changes.'
    : `The violet jacks now carry ${x.src} instead of keyboard pressure, wherever they are patched.`) });
jack('j.kPitch', 913, 880, { ...BLK, label: 'pitch', name: 'Keyboard input: pitch', dir: 'in', dest: 'ezPitch', amt: 1,
  help: 'The key voltage the oscillators’ KEYBOARD switches follow. Inside the case the 218e’s pitch already arrives here; a cord replaces it, so any voltage can play the oscillators in semitones.',
  hear: (v, x) => (x.root === 'keyv' ? 'This is the connection the case already makes inside, so nothing changes.'
    : `The oscillators whose KEYBOARD switch is on now follow ${x.src} instead of the keys, in semitones: a full voltage is 28 semitones. The keys no longer change the pitch.`) });
text(723, 930, 'pulse', 15); text(823, 930, 'pressure', 15); text(913, 930, 'pitch', 15);
jack('j.moFreq', 1013, 880, { ...BLK, label: 'm.o.freq', name: 'm.o.freq or seq s.', dir: 'in', dest: null,
  help: 'Printed “m.o.freq or seq s.”: an input for the modulation oscillator’s frequency or the sequencer’s stages. This app does not model it; use the FREQUENCY jack for the modulation oscillator.' });
text(1013, 930, 'm.o.freq', 14); text(1013, 946, 'or seq s.', 11);

const envJack = (id, x, y, word, dest) => jack(id, x, y, { ...BLK, label: word, name: `Envelope ${word} input`, dir: 'in', dest, amt: 1, add: true,
  help: `A voltage here moves the envelope’s ${word} slider up, towards the fast end: a full voltage moves it by the whole scale.`,
  does: `A voltage here adds to the ${word} slider, making the ${word} shorter: a full voltage moves it the whole length of the scale.`,
  hear: (v, x) => `${x.src} changes the envelope’s ${word} time while it plays. More voltage gives a shorter ${word}, so the shape of each note follows ${x.src}.` });
envJack('j.envA', 1103, 845, 'attack', 'envA'); envJack('j.envS', 1195, 880, 'sustain', 'envS'); envJack('j.envD', 1285, 845, 'decay', 'envD');
text(1195, 925, 'st.', 15);
const outJ = (id, x, y, col, signal, name, help) => jack(id, x, y, { banana: col, label: name, name, dir: 'out', signal, help });
const SEQ_HELP = 'The sequencer’s voltage: the level of the stage it is on. Each blue jack carries the same voltage.';
const RND_HELP = (n) => `Random voltage ${n}. A new level, between 0 and 10, each time the random source is triggered; held until the next.`;
const ENV_HELP = 'The envelope generator’s output, 0 to 10. Each orange jack carries the same voltage. Patch it to a gate’s LEVEL to shape the notes, or to TIMBRE or modulation to shape the tone.';
const PUL_HELP = 'The pulser’s ramp: it jumps to 10 at each trigger and falls steadily to 0 over the period. Each yellow jack carries the same voltage.';
const PRS_HELP = 'Keyboard pressure, passed on from the pressure input. Each violet jack carries the same voltage.';
outJ('j.seq1', 1103, 915, 'blue', 'seq', 'sequencer 1', SEQ_HELP); outJ('j.seq2', 1820, 850, 'blue', 'seq', 'sequencer 2', SEQ_HELP);
outJ('j.rnd1', 1285, 915, 'white', 'rnd1', 'random 1', RND_HELP(1)); outJ('j.rnd2', 1640, 915, 'white', 'rnd2', 'random 2', RND_HELP(2));
outJ('j.rnd3', 2015, 915, 'white', 'rnd3', 'random 3', RND_HELP(3)); outJ('j.rnd4', 2382, 915, 'white', 'rnd4', 'random 4', RND_HELP(4));
outJ('j.env1', 1450, 850, 'orange', 'env1', 'envelope 1', ENV_HELP); outJ('j.env2', 2015, 850, 'orange', 'env1', 'envelope 2', ENV_HELP);
outJ('j.env3', 2382, 850, 'orange', 'env1', 'envelope 3', ENV_HELP);
outJ('j.pul1', 1640, 850, 'yellow', 'pulser', 'pulser 1', PUL_HELP); outJ('j.pul2', 2190, 850, 'yellow', 'pulser', 'pulser 2', PUL_HELP);
outJ('j.pul3', 2565, 850, 'yellow', 'pulser', 'pulser 3', PUL_HELP);
outJ('j.prs1', 1450, 915, 'violet', 'pressV', 'pressure 1', PRS_HELP); outJ('j.prs2', 1820, 915, 'violet', 'pressV', 'pressure 2', PRS_HELP);
outJ('j.prs3', 2190, 915, 'violet', 'pressV', 'pressure 3', PRS_HELP); outJ('j.prs4', 2565, 915, 'violet', 'pressV', 'pressure 4', PRS_HELP);
text(1180, 960, '← random', 14, { anchor: 'start' }); text(1500, 960, '← pressure', 14, { anchor: 'start' }); text(1790, 830, 'seq', 14);

/** A black processing input: its `amt` is the processing slider beside its offset. */
const cvJack = (id, x, word, dest, amt, cvId, sliderName, hear) => jack(id, x, 870, {
  ...BLK, label: word, name: `${word} input`, dir: 'in', dest, amt, add: true, check: procCheck(cvId, sliderName), hear,
  help: `A control voltage for ${word}. It is scaled by the processing slider (${sliderName}) and added to the offset slider beside it.`,
});
cvJack('j.period', 1375, 'PERIOD', 'period', (v) => v['pulser.periodCv'] / 10, 'pulser.periodCv', 'PERIOD processing',
  (v, x) => `${x.src} sets the pulser’s speed as it plays: more voltage, shorter period and faster pulses. With the sequencer here, each stage sets the length of the next beat, which turns a steady clock into a rhythm.`);
cvJack('j.freq', 1560, 'FREQUENCY', 'pitch2', (v) => v['mosc.freqCv'] * 6, 'mosc.freqCv', 'FREQUENCY processing', null);
cvJack('j.index', 1742, 'modulation', 'index', (v) => v['mosc.indexCv'] / 10, 'mosc.indexCv', 'modulation processing',
  (v, x) => `${x.src} sets how deeply the modulation oscillator modulates (${{ fm: 'FM of the complex oscillator', am: 'AM of the complex oscillator', bal: 'ring modulation of the preamp' }[v['mosc.mode']]}). As it rises the tone gets richer and more clangorous; as it falls it settles back to the plain sound.`);
cvJack('j.pitch', 1925, 'PITCH', 'pitch1', (v) => v['cosc.pitchCv'] * 4, 'cosc.pitchCv', 'PITCH processing', null);
cvJack('j.timbre', 2107, 'TIMBRE', 'fold', (v) => v['cosc.timbreCv'] / 10, 'cosc.timbreCv', 'TIMBRE processing',
  (v, x) => `${x.src} adds harmonics to the complex oscillator as it rises: the tone brightens and buzzes, then softens again as it falls.${v['cosc.shape'] >= 9.5 && v['cosc.wave'] !== 'tri' ? ' The waveshape knob is fully at the spike or square, which TIMBRE does not touch, so turn it left to hear this.' : ''}`);
cvJack('j.lvl1', 2290, 'LEVEL 1', 'gate1Lvl', (v) => v['lpg1.levelCv'] / 10, 'lpg1.levelCv', 'Gate 1 LEVEL processing',
  (v, x) => `${x.src} opens and closes Gate 1. ${v['lpg1.mode'] === 'vca' ? 'The gate is set to voltage cntrld amp, so you hear the volume follow it.' : v['lpg1.mode'] === 'lp' ? 'The gate is set to lo pass filter, so the tone opens and closes while the volume stays.' : 'The gate is set to combination, so the sound gets louder and brighter together, and dies away with the slow, natural fall of the vactrol.'}`);
cvJack('j.lvl2', 2473, 'LEVEL 2', 'gate2Lvl', (v) => v['lpg2.levelCv'] / 10, 'lpg2.levelCv', 'Gate 2 LEVEL processing',
  (v, x) => `${x.src} opens and closes Gate 2.${v['out.b'] <= 0 ? ' channel B is at 0, so turn it up to hear Gate 2.' : ''}`);
// printed arrows from the black inputs up into their processing sliders
[1375, 1560, 1742, 1925, 2107, 2290, 2473].forEach((x) => line(x, 846, x, 778, 1.4));
screw(1890, 840); screw(840, 985); screw(2295, 985);

// ── 218e: touch activated voltage source ──────────────────────────────────
decor.push({ t: 'rect', x: px(675), y: py(1000), w: 2250, h: 325, r: 0, fill: BLUE, hw: true });
decor.push({ t: 'rect', x: px(675), y: py(1000), w: 2250, h: 325, r: 0, stroke: INK, sw: 2 });
btext(2270, 1020, 'BUCHLA  TOUCH  ACTIVATED  VOLTAGE  SOURCE  MODEL 218e', 14, { weight: 700, spacing: 1 });
[[700, 1020], [1520, 1020], [1880, 1020], [2900, 1020]].forEach(([x, y]) => screw(x, y));
const bjack = (id, x, y, col, rest) => jack(id, x, y, { banana: col, ...rest });
bjack('j.kPulseOut', 750, 1072, 'red', { label: 'pulse', name: '218e pulse', dir: 'out', signal: 'kpulse',
  help: 'The keyboard’s pulse: on while a key is touched, with a short break at each new touch.' });
bjack('j.kPressOut', 843, 1072, 'violet', { label: 'pressure', name: '218e pressure', dir: 'out', signal: 'press',
  help: 'Touch pressure. Here it comes from how hard a key is struck (velocity) and holds while the key is down, falling away after.' });
bjack('j.kPitchOut', 940, 1072, 'blue', { label: 'pitch', name: '218e pitch', dir: 'out', signal: 'keyv',
  help: 'The key voltage: one twenty-eighth of the scale per key, held after you let go, gliding at the portamento rate.' });
btext(750, 1125, 'pulse', 17); btext(843, 1125, 'pressure', 17); btext(940, 1125, 'pitch', 17);
bjack('j.vel', 782, 1160, 'green', { label: 'vel.', name: '218e velocity', dir: 'out', signal: 'vel',
  help: 'How hard the last key was struck, held until the next.' });
led(742, 1160, 'green', 'gate', 6);
btext(740, 1192, 'vel.', 17);
bjack('j.kRed', 885, 1160, 'red', { label: '', name: '218e unlabelled red jack', dir: 'out', signal: null,
  help: 'An unlabelled jack, joined by a printed line to its blue neighbour. Not modelled in this app.' });
bjack('j.kBlue', 985, 1160, 'blue', { label: '', name: '218e unlabelled blue jack', dir: 'out', signal: null,
  help: 'An unlabelled jack, joined by a printed line to its red neighbour. Not modelled in this app.' });
line(905, 1160, 965, 1160, 3, { stroke: WHITE, hw: true });

const bknob = (id, x, cap, rest) => {
  knob(id, x, 1093, 34, cap, rest);
  [[0, -150], [1, -120], [2, -90], [3, -60], [4, -30], [6, 30], [7, 60], [8, 90], [9, 120], [10, 150]].forEach(([n, a]) => {
    const r = 58, t = (a * Math.PI) / 180;
    btext(x + r * Math.sin(t), 1093 - r * Math.cos(t) + 6, String(n), 15);
  });
  decor.push({ t: 'path', d: `M${px(x - 5)} ${py(1034)} H${px(x + 5)} L${px(x)} ${py(1042)} Z`, w: 0, fill: WHITE, hw: true });
};
bknob('kbd.porta', 1100, 'red', {
  def: 0, module: 'glide', name: 'PORTAMENTO SLOPE', fmt: (v) => (portaS(v) === 0 ? 'off' : fmtTime(portaS(v))),
  help: 'Glide between keys: at 0 the pitch jumps, turned up it slides, taking up to 3 seconds to cross the keyboard. A voltage at the input jack beside it shortens the glide.',
});
bjack('j.portaIn', 1243, 1110, 'black', { label: 'input', name: 'PORTAMENTO input', dir: 'in', dest: 'portaIn', amt: 1, add: true,
  help: 'A voltage here shortens the portamento: the more voltage, the quicker the glide.',
  hear: (v, x) => `${x.src} sets how fast the pitch glides between keys: the more voltage, the quicker the slide.${v['kbd.porta'] <= 0.05 ? ' PORTAMENTO SLOPE is at 0, so there is no glide to shorten. Turn it up.' : ''}` });
btext(1243, 1160, 'input', 18);
btext(1100, 1203, 'PORTAMENTO  SLOPE', 19, { weight: 600 });
bknob('kbd.arpRate', 1400, 'red', {
  def: 5, module: 'mode', name: 'ARPEGGIATION RATE', fmt: (v) => `${arpHz(v).toFixed(1)} notes a second`,
  help: 'Speed of the arpeggiator, from one note every two seconds to twenty a second. It plays the keys you hold, one at a time.',
});
bjack('j.arpIn', 1525, 1072, 'orange', { label: 'in', name: 'Arpeggiator in', dir: 'in', dest: null,
  help: 'An input for the arpeggiator. Not modelled in this app.' });
bjack('j.arpB', 1525, 1145, 'black', { label: '', name: 'Arpeggiator black jack', dir: 'in', dest: null,
  help: 'An unlabelled input beside the arpeggiator. Not modelled in this app.' });
btext(1497, 1062, 'in', 14);
toggle('kbd.arp', 1615, 1110, 'red', {
  kind: 'enum', options: [{ v: 'up', label: 'ascending' }, { v: 'random', label: 'random' }, { v: 'none', label: 'none' }], def: 'none', module: 'mode',
  name: 'ARPEGGIATION PATTERN',
  help: 'Ascending plays the keys you hold in turn from the lowest up; random picks one of them each time; none switches the arpeggiator off, so the keys play normally.',
});
btext(1650, 1093, 'ascending', 18, { anchor: 'start', weight: 600 }); btext(1650, 1123, 'random', 18, { anchor: 'start', weight: 600 });
btext(1650, 1153, 'none', 18, { anchor: 'start', weight: 600 });
btext(1515, 1203, 'ARPEGGIATION  RATE / PATTERN', 19, { weight: 600 });
toggle('kbd.add', 1840, 1110, 'red', {
  kind: 'enum', options: [{ v: 'oct', label: 'octaves' }, { v: 'preset', label: 'preset' }, { v: 'none', label: 'none' }], def: 'none', module: 'mode',
  name: 'ADD TO PITCH',
  help: 'How the preset plates change the key voltage. Octaves: the four plates choose the register, an octave apart. Preset: the touched plate’s knob is added, any transposition up to a ninth. None: the plates do not touch the pitch.',
});
btext(1875, 1093, 'octaves', 18, { anchor: 'start', weight: 600 }); btext(1875, 1123, 'preset', 18, { anchor: 'start', weight: 600 });
btext(1875, 1153, 'none', 18, { anchor: 'start', weight: 600 });
decor.push({ t: 'path', d: `M${px(1790)} ${py(1110)} L${px(1815)} ${py(1095)} L${px(1810)} ${py(1106)} H${px(1822)} V${py(1114)} H${px(1810)} L${px(1815)} ${py(1125)} Z`, w: 0, fill: WHITE, hw: true });
btext(1875, 1203, 'ADD  TO  PITCH', 19, { weight: 600 });
bjack('j.presetPulse', 2015, 1072, 'red', { label: '', name: 'Preset pulse', dir: 'out', signal: null,
  help: 'A pulse from the preset plates. Not modelled in this app.' });
bjack('j.presetOut', 2015, 1145, 'blue', { label: 'output', name: 'PRESET VOLTAGE SOURCE output', dir: 'out', signal: 'preset',
  help: 'The level of the preset knob whose plate was touched last, 0 to 10. Patch it to a processing input to switch a setting between four presets at a touch.' });
led(1980, 1135, 'blue', 'power', 5);
btext(2015, 1203, 'output', 18, { weight: 600 });
const PRESET_X = [2165, 2370, 2570, 2770];
PRESET_X.forEach((x, k) => bknob(`kbd.p${k + 1}`, x, 'red', {
  def: [0, 3, 6, 9][k], module: 'mode', name: `PRESET VOLTAGE SOURCE ${k + 1}`,
  help: `The voltage given out while preset plate ${k + 1} is the last one touched, on the blue output jack. With ADD TO PITCH at preset it is also added to the key voltage.`,
}));
btext(2455, 1210, 'PRESET  VOLTAGE  SOURCE', 19, { weight: 600 });
line(2625, 1205, 2900, 1205, 2, { stroke: WHITE, hw: true });
decor.push({ t: 'rect', x: px(2450), y: py(1065), w: 30, h: 26, r: 6, fill: '#0d0d0f', hw: true });
btext(2465, 1050, 'reset', 13);
btext(2770, 1188, 'trn', 13); btext(2890, 1093, 'rem', 13); btext(2890, 1108, 'en', 13); btext(2890, 1188, 'pm', 13);
led(2885, 1165, 'amber', 'power', 5);
// the red plate strip above the keys: the arpeggio plate, the logo, and the four preset plates
decor.push({ t: 'rect', x: px(718), y: py(1218), w: 2140, h: 95, r: 2, fill: '#d1262b', hw: true });
decor.push({ t: 'rect', x: px(735), y: py(1232), w: 630, h: 58, r: 8, fill: '#f3f3ef', hw: true });
decor.push({ t: 'path', d: `M${px(750)} ${py(1236)} L${px(940)} ${py(1261)} L${px(750)} ${py(1286)} M${px(930)} ${py(1236)} L${px(1120)} ${py(1261)} L${px(930)} ${py(1286)} M${px(1110)} ${py(1236)} L${px(1300)} ${py(1261)} L${px(1110)} ${py(1286)}`, w: 2, stroke: '#c9302c', hw: true });
btext(1810, 1278, 'THE  Electric  MUSIC  BOX', 34, { fill: '#7d1518', weight: 700, hw: true });
for (let k = 1; k <= 29; k++) btext(745 + (k - 1) * 73.3, 1308, String(k), 13, { fill: '#5b1012', hw: true });
controls.push({
  id: 'kbd.plate', type: 'select', x: px(2175), y: py(1260), w: 120, h: 56, lamp: 'white', module: 'mode', kind: 'enum', def: 1, labelPos: 'none',
  name: 'Preset plates',
  options: PRESET_X.map((x, k) => ({ v: k + 1, label: String(k + 1), x: px(x + (k === 0 ? 10 : k === 3 ? -10 : 0)), y: py(1260), text: '' })),
  help: 'The four preset plates. Touch one to choose which PRESET VOLTAGE SOURCE knob is on the output and, with ADD TO PITCH set, how the keyboard is transposed.',
});

// ── Areas ─────────────────────────────────────────────────────────────────
const sq = (x, y) => ({ x: px(x - 32), y: py(y - 32), w: 64, h: 64 });
const R = (x, y, w, h) => ({ x: px(x), y: py(y), w, h });
const areas = [
  { id: 'card', label: 'Program interface', module: 'util', keywords: 'program card memory patch storage 208c', rects: [R(675, 100, 770, 140)],
    help: 'The socket for a program: on the original Easel a plug-in card of resistors that set the switches and sliders, on the 208C a digital interface. This app plays the Easel from the front panel only.' },
  { id: 'control', label: 'CONTROL switch', module: 'util', keywords: 'remote local midi program', rects: [R(1445, 100, 165, 140)],
    help: 'Chooses whether the panel, a program, or both set the sound. Here it is always the panel.' },
  { id: 'modio', label: 'Modulation oscillator in/out', module: 'lfo', keywords: 'fm input audio output', rects: [R(1610, 100, 300, 140)],
    help: 'The modulation oscillator’s jacks: an outside audio input for its FM, its audio output, and a green banana jack that carries its wave as a control voltage. The violet jack brings a voltage from a program card, which this app does not have.' },
  { id: 'inverter', label: 'Inverter', module: 'util', keywords: 'invert upside down reverse negative', rects: [R(1910, 100, 175, 140)],
    help: 'Turns a voltage upside down on the 0 to 10 scale: 10 becomes 0, 2 becomes 8. Feed it an envelope and it comes out as a dip.' },
  { id: 'compio', label: 'Complex oscillator jacks', module: 'osc', keywords: 'audio output input gate1', rects: [R(2085, 100, 245, 140)],
    help: 'The complex oscillator’s audio output (c.osc), and an audio input that takes its place in Gate 1 (gate1 in).' },
  { id: 'preamp', label: 'Preamp and envelope detector', module: 'util', keywords: 'external input noise envelope follower mic', rects: [R(2330, 100, 245, 140)],
    help: 'The preamp brings an outside signal in at the aux jack; with nothing plugged in it hears the Easel’s noise source. The envelope detector turns the preamp’s loudness into a voltage on the blue env out jack.' },
  { id: 'cardin', label: 'Card inputs', module: 'util', keywords: 'program card', rects: [R(2575, 100, 160, 140)],
    help: 'Two jacks that send voltages to a program card. Not used in this app.' },
  { id: 'mixout', label: 'Master outputs', module: 'out', keywords: 'audio output line', rects: [R(2735, 100, 190, 140)],
    help: 'The Easel’s two audio outputs, both carrying the final mix.' },
  { id: 'seq', label: 'Sequential voltage source', module: 'mod', keywords: 'sequencer step pattern melody rhythm stages', rects: [R(675, 240, 245, 232), R(675, 472, 383, 348), sq(1103, 915), sq(1820, 850)],
    help: 'A sequencer of three to five stages, each with its own slider. Each pulse from the keyboard or the pulser moves it on one stage, and its voltage appears on the blue jacks. The PULSE SEQUENCE switches choose which stages also send a pulse, to fire the envelope: switch one down for a rest.' },
  { id: 'rvs', label: 'Random voltage source', module: 'mod', keywords: 'random sample and hold chance', rects: [R(920, 240, 180, 232), sq(1285, 915), sq(1640, 915), sq(2015, 915), sq(2382, 915)],
    help: 'Four random voltages on the white jacks, all renewed together each time the source is triggered and held until the next time. Patch them to PITCH, TIMBRE or a gate LEVEL for sounds that change by chance.' },
  { id: 'env', label: 'Envelope generator', module: 'env', keywords: 'envelope adsr attack decay sustain contour', rects: [R(1100, 240, 225, 232), R(1058, 472, 277, 348), sq(1103, 845), sq(1195, 880), sq(1285, 845), sq(1450, 850), sq(2015, 850), sq(2382, 850)],
    help: 'An attack, sustain and decay envelope, fired by the keyboard, the pulser or the sequencer. Its sliders are times, fastest at the top. Its output is on the three orange jacks and goes nowhere until you patch it: usually to a gate’s LEVEL input to shape each note.' },
  { id: 'pulser', label: 'Pulser', module: 'lfo', keywords: 'clock lfo trigger ramp rhythm tempo', rects: [R(1325, 240, 195, 232), R(1335, 472, 170, 348), sq(1375, 880), sq(1640, 850), sq(2190, 850), sq(2565, 850)],
    help: 'A ramp that falls from 10 to 0 over its PERIOD and sends a pulse when it gets there. Set to self, it restarts itself and becomes the Easel’s clock, stepping the sequencer and firing the envelope. The falling ramp itself is on the yellow jacks.' },
  { id: 'kbdin', label: 'Keyboard inputs and pressure', module: 'util', keywords: 'keyboard pulse pressure pitch velocity aftertouch', rects: [R(675, 820, 380, 180), sq(1450, 915), sq(1820, 915), sq(2190, 915), sq(2565, 915)],
    help: 'Where the keyboard’s pulse, pressure and pitch come into the 208C. Inside the case they are already connected; a cord here replaces one with another voltage. The violet jacks across the patch field pass the pressure on.' },
  { id: 'mosc', label: 'Modulation oscillator', module: 'lfo', keywords: 'lfo fm am ring modulation index vibrato tremolo', rects: [R(1520, 240, 370, 232), R(1505, 472, 375, 348), sq(1560, 870), sq(1742, 870)],
    help: 'A second oscillator whose main job is to modulate the complex oscillator: its pitch (f.m.), its loudness (a.m., ending in ring modulation), or the preamp signal (bal. ext). The modulation sliders set how deeply. It can also be heard on its own through Gate 2.' },
  { id: 'cosc', label: 'Complex oscillator', module: 'osc', keywords: 'vco oscillator pitch timbre wavefolder waveshape harmonics', rects: [R(1890, 240, 350, 232), R(1880, 472, 365, 348), sq(1925, 870), sq(2107, 870)],
    help: 'The Easel’s main voice. The waveshape knob mixes a sine with a spike, square or triangle, and TIMBRE adds harmonics by folding the sine and triangle. It always feeds Gate 1. With KEYBOARD on it plays in semitones from the PITCH setting.' },
  { id: 'lpg', label: 'Dual lo pass gate', module: 'filter', keywords: 'lpg vca filter vactrol low pass gate amplifier', rects: [R(2240, 240, 370, 232), R(2245, 472, 365, 348), sq(2290, 870), sq(2473, 870)],
    help: 'Two lowpass gates, the Easel’s filter and amplifier in one. Each can be a filter, an amplifier, or both together, and both are slow to close, so a short envelope makes a natural, ringing pluck. Gate 1 takes the complex oscillator; the gate 2 source switch chooses what Gate 2 takes.' },
  { id: 'output', label: 'Output section', module: 'out', keywords: 'mix volume reverb spring channel', rects: [R(2610, 240, 315, 760)],
    help: 'Mixes Gate 1 (channel A) and Gate 2 (channel B), adds spring reverberation, and sets the MASTER VOLUME. The gate2 sig jack feeds an outside audio signal into Gate 2.' },
  { id: 'kbdout', label: '218e outputs', module: 'util', keywords: 'keyboard pulse pressure pitch velocity', rects: [R(675, 1000, 340, 215)],
    help: 'The touch keyboard’s own voltages on banana jacks: pulse, pressure, pitch and velocity. Inside the case they already reach the 208C’s keyboard inputs; these jacks let you send them anywhere else too.' },
  { id: 'porta', label: 'Portamento', module: 'glide', keywords: 'glide portamento slide', rects: [R(1015, 1000, 285, 215)],
    help: 'PORTAMENTO SLOPE makes the key voltage glide from one key to the next; a voltage at its input shortens the glide.' },
  { id: 'arp', label: 'Arpeggiator', module: 'mode', keywords: 'arpeggio arp pattern', rects: [R(1300, 1000, 460, 215)],
    help: 'Plays the keys you hold one at a time, rising or at random, at the ARPEGGIATION RATE. Set the pattern to none for normal playing.' },
  { id: 'add', label: 'Add to pitch', module: 'mode', keywords: 'transpose octave preset shift', rects: [R(1760, 1000, 325, 215)],
    help: 'Lets the preset plates transpose the keyboard, by octaves or by the level of the touched preset knob. The blue output jack gives the touched preset’s voltage.' },
  { id: 'presets', label: 'Preset voltage source', module: 'mode', keywords: 'preset plates voltage source transpose', rects: [R(2085, 1000, 840, 325)],
    help: 'Four knobs, one for each preset plate on the red strip. Touch a plate and its knob’s voltage appears on the preset output, ready to switch a setting at a touch, or to transpose the keyboard through ADD TO PITCH.' },
];

annotate(unusual, controls, jacks, areas);

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v) {
  const plate = v['kbd.plate'];
  const presetLvl = v[`kbd.p${plate}`] / 10;
  const add = v['kbd.add'] === 'oct' ? (plate - 1) * 12 : v['kbd.add'] === 'preset' ? presetLvl * 14 : 0;
  const gate = (n) => ({ mode: v[`lpg${n}.mode`], level: v[`lpg${n}.level`] / 10 });
  // Gate 2's feed: the modulation oscillator, the preamp (ring-modulated when the modulation switch is at bal. ext), or Gate 1
  const src = v['lpg.src'];
  const g2 = src === 'mosc' ? 'osc2' : src === 'series' ? 'lpg1' : v['mosc.mode'] === 'bal' ? 'ezBal' : 'preamp';
  return {
    easel: {
      cosc: {
        note: noteOf(hiHz(v['cosc.pitch'])) + fineSemi(v['cosc.fine']), kbd: !!v['cosc.kbd'], sign: v['cosc.sign'],
        shape: v['cosc.shape'] / 10, wave: v['cosc.wave'], timbre: v['cosc.timbre'] / 10,
      },
      mosc: {
        hz: (v['mosc.range'] === 'high' ? hiHz(v['mosc.freq']) : loHz(v['mosc.freq'])) * Math.pow(2, fineSemi(v['mosc.fine']) / 12),
        kbd: !!v['mosc.kbd'], wave: v['mosc.wave'], mode: v['mosc.mode'], index: v['mosc.index'] / 10, fmIn: v['mosc.fmIn'] / 10,
      },
      pulser: { v: v['pulser.period'], trig: v['pulser.trig'], mode: v['pulser.mode'], fire: v['pulser.one'] ? 1 : 0 },
      env: { a: v['env.attack'], s: v['env.sustain'], d: v['env.decay'], trig: v['env.trig'], mode: v['env.mode'] },
      seq: {
        levels: [1, 2, 3, 4, 5].map((k) => v[`seq.l${k}`] / 10), stages: v['seq.stages'],
        pulses: [1, 2, 3, 4, 5].map((k) => !!v[`seq.p${k}`]), trig: v['seq.trig'],
      },
      rvs: { trig: v['rvs.trig'] },
      gates: [gate(1), gate(2)],
      mix: [Math.pow(v['out.a'] / 10, 1.5), Math.pow(v['out.b'] / 10, 1.5)],
      porta: portaS(v['kbd.porta']), add, preset: presetLvl,
      arp: { on: v['kbd.arp'] !== 'none', mode: v['kbd.arp'] === 'random' ? 'random' : 'up', rate: arpHz(v['kbd.arpRate']) },
    },
    osc: [],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    filter: { type: 'svf', mode: 'lp', cutoff: 1000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
    normals: { ezPulse: 'kpulse', ezPress: 'press', ezPitch: 'keyv', lpg1In: 'osc1', lpg2In: g2, preampIn: 'noise', envfIn: 'preamp', dryIn: 'ezMix', revIn: 'ezMix' },
    preamp: { gain: v['preamp.gain'] === 'high' ? 5 : 1 },
    envf: { sens: 1.6 },
    rev: { on: v['out.rev'] > 0, mix: (v['out.rev'] / 10) * 1.3, decay: 0.84, damp: 0.38 },
    od: { on: false }, delay: { on: false },
    sh: { rate: 5, glide: 0 }, slew: { time: 0.1 }, att: [1, 1],
    tune: 0, volume: (v['out.master'] / 10) * 1.1,
  };
}

// ── Sounds ────────────────────────────────────────────────────────────────
// Cords are [output jack, input jack]. The usual first cord on an Easel: an orange envelope jack into LEVEL 1.
const presets = [
  {
    id: 'easel-first-note', name: 'First Note', ref: 'Classic technique: the smallest Easel patch that plays from the keys', artist: 'Classic technique',
    tags: ['keys', 'basics', 'lpg'], level: 1,
    blurb: 'The complex oscillator, played from the keys, opened and closed by the envelope through Gate 1.',
    how: 'On the Easel the envelope is not wired to anything: its output is the orange jacks, and you choose where it goes. One cord from an orange jack into LEVEL 1 makes Gate 1 open with each touch and close again, and with the gate in combination mode the note gets darker as it fades, like a struck string. The oscillator plays the keyboard because its KEYBOARD switch is on.',
    phrase: { bpm: 96, loop: true, steps: [[0, 48, 0.8], [1, 52, 0.8], [2, 55, 0.8], [3, 60, 1.6], [5, 55, 0.8], [6, 52, 1.6]] },
    steps: [
      { title: 'Envelope into Gate 1', module: 'env',
        why: 'Patch an orange envelope jack into the black LEVEL 1 jack, and raise LEVEL 1’s processing slider so the envelope gets through.\n- Cord: envelope 3 → LEVEL 1.\n- Gate 1 LEVEL processing 10, LEVEL offset 0: the gate is shut until the envelope opens it.\n- Envelope trigger source keyboard, mode sustained: it rises when you touch a key and holds while you hold it.\n- Listen for: a note on each key that stops when you let go, with a soft tail.',
        set: { 'lpg1.levelCv': 10, 'lpg1.level': 0, 'env.trig': 'kbd', 'env.mode': 'sus', 'env.attack': 9, 'env.decay': 6 }, cables: [['j.env3', 'j.lvl1']] },
      { title: 'A rounder tone', module: 'osc',
        why: 'The waveshape knob mixes the sine with the square chosen on the switch below it; TIMBRE adds a little edge.\n- waveshape 4: mostly sine, some square.\n- TIMBRE 2.\n- Listen for: a woody, slightly reedy tone instead of a buzz.',
        set: { 'cosc.shape': 4, 'cosc.wave': 'sq', 'cosc.timbre': 2 } },
      { title: 'Combination mode and a little reverb', module: 'filter',
        why: 'Gate 1 in combination mode both opens a filter and raises the volume, so as the envelope falls the note darkens and fades together.\n- Gate 1 mode select: combination.\n- REVERBERATION 3.\n- Listen for: each note dulling as it dies, with a short spring tail.',
        set: { 'lpg1.mode': 'combo', 'out.rev': 3 } },
    ],
    context: {
      'lpg1.levelCv': 'In this sound: how far the envelope opens Gate 1. Lower it and the notes get quieter and duller.',
      'lpg1.level': 'In this sound: kept at 0 so the gate shuts between notes. Raise it and a quiet tone drones under everything.',
      'env.decay': 'In this sound: the tail after you let go. Lower on the slider is longer.',
      'cosc.shape': 'In this sound: left for a pure sine, right for more of the square.',
    },
    tweaks: [
      { id: 'lpg1.mode', try: 'Switch Gate 1 to voltage cntrld amp', hear: 'The notes keep their brightness to the end: only the volume falls.' },
      { id: 'env.attack', try: 'Pull the attack slider down to 4', hear: 'Each note swells in over about a second.' },
    ],
  },
  {
    id: 'easel-bongo', name: 'Lowpass Gate Bongo', ref: 'Classic technique: the West Coast “bongo” pluck', artist: 'Classic technique',
    tags: ['perc', 'lpg', 'west coast'], level: 1,
    blurb: 'A very short envelope strikes Gate 1 in combination mode: a hollow, woody pluck.',
    how: 'The lowpass gate is slow to close, so even a two-millisecond envelope leaves a note that rings and dies naturally, brightest at the start. That is the sound of a struck object, and it is the Easel’s signature. A little TIMBRE on a sine gives the hollow, bongo-like body.',
    phrase: { bpm: 112, loop: true, steps: [[0, 48, 0.25], [0.5, 48, 0.25], [1, 55, 0.25], [1.75, 52, 0.25], [2.5, 48, 0.25], [3, 60, 0.25], [3.5, 55, 0.25]] },
    steps: [
      { title: 'A sine with a little folding', module: 'osc',
        why: 'Turn the waveshape knob fully left for the sine alone, and add some TIMBRE so the sine folds into a rounder, hollow tone.\n- waveshape 0.\n- TIMBRE 3.',
        set: { 'cosc.shape': 0, 'cosc.timbre': 3 } },
      { title: 'A strike, not a note', module: 'env',
        why: 'Envelope into LEVEL 1, set to transient with every time at the fast end: the gate gets a short kick on each touch, however long you hold the key.\n- Cord: envelope 3 → LEVEL 1, processing 10.\n- Envelope mode transient; attack 10, sustain 9, decay 8.\n- Gate 1 combination.\n- Listen for: a short, round pluck with a natural ring.',
        set: { 'env.trig': 'kbd', 'env.mode': 'trans', 'env.attack': 10, 'env.sustain': 9, 'env.decay': 8, 'lpg1.levelCv': 10, 'lpg1.level': 0, 'lpg1.mode': 'combo' },
        cables: [['j.env3', 'j.lvl1']] },
      { title: 'A touch of room', module: 'fx',
        why: 'Some spring reverberation puts the plucks in a space.\n- REVERBERATION 3.',
        set: { 'out.rev': 3 } },
    ],
    context: {
      'cosc.timbre': 'In this sound: the body of the drum. Up for a brighter, more metallic knock; down for a soft thud.',
      'env.decay': 'In this sound: the length of the strike. Lower on the slider gives a longer, more marimba-like note.',
      'lpg1.mode': 'In this sound: combination, so each pluck dulls as it fades. On lo pass filter the plucks have no front edge.',
    },
    tweaks: [
      { id: 'cosc.timbre', try: 'Push TIMBRE to 7', hear: 'The pluck turns metallic, like a struck pipe.' },
      { id: 'lpg1.mode', try: 'Set Gate 1 to voltage cntrld amp', hear: 'A click rather than a pluck: without the filter there is no ring.' },
    ],
  },
  {
    id: 'easel-timbre-surge', name: 'Timbre Surge', ref: 'From the Easel manual — Patch-chart 10, envelope on timbre', artist: 'Buchla',
    tags: ['lead', 'timbre', 'manual'], level: 2,
    blurb: 'The envelope opens the gate and adds harmonics at the same time, so each note starts with a burst of brightness.',
    how: 'One orange output feeds Gate 1’s LEVEL and another feeds TIMBRE (the Easel’s banana plugs stack, so one envelope can go to two places). As the envelope rises the sine folds over and buzzes; as it falls the tone goes back to a plain sine while the gate closes. Brightness here comes from adding harmonics, not from opening a filter.',
    phrase: { bpm: 84, loop: true, steps: [[0, 48, 1.5], [2, 55, 1], [3, 53, 1], [4, 51, 2], [6, 55, 1.5]] },
    steps: [
      { title: 'A sine through Gate 1', module: 'env',
        why: 'Envelope into LEVEL 1, sustained, with a quick attack and medium decay.\n- Cord: envelope 3 → LEVEL 1, processing 10.\n- waveshape 0 (sine), TIMBRE 0.\n- Listen for: a plain, flute-like sine.',
        set: { 'cosc.shape': 0, 'cosc.timbre': 0, 'env.trig': 'kbd', 'env.mode': 'sus', 'env.attack': 8, 'env.decay': 5, 'lpg1.levelCv': 10, 'lpg1.level': 0, 'lpg1.mode': 'vca' },
        cables: [['j.env3', 'j.lvl1']] },
      { title: 'The same envelope on TIMBRE', module: 'osc',
        why: 'A second orange jack into the black TIMBRE jack, with TIMBRE processing at 7.\n- Cord: envelope 2 → TIMBRE.\n- TIMBRE processing 7.\n- Listen for: each note starting bright and buzzy and melting back to a sine.',
        set: { 'cosc.timbreCv': 7 }, cables: [['j.env2', 'j.timbre']] },
      { title: 'A slower decay', module: 'env',
        why: 'Pull the decay slider down so the tone takes its time to soften.\n- decay 3.5.\n- REVERBERATION 3.',
        set: { 'env.decay': 3.5, 'out.rev': 3 } },
    ],
    context: {
      'cosc.timbreCv': 'In this sound: how bright the start of each note is. At 10 it snarls; at 3 it only colours the sine.',
      'cosc.timbre': 'In this sound: the brightness that is left once the envelope has gone. 0 leaves a pure sine.',
      'env.attack': 'In this sound: how quickly the brightness arrives. Lower for a swelling “wah”.',
    },
    tweaks: [
      { id: 'cosc.timbreCv', try: 'Push TIMBRE processing to 10', hear: 'A harsh, brassy attack on every note.' },
      { id: 'cosc.wave', try: 'Set the waveshape switch to triangle and the knob to 10', hear: 'The triangle folds too, with a hollower edge than the sine.' },
    ],
  },
  {
    id: 'easel-pulser-melody', name: 'Pulser and Sequencer', ref: 'Classic technique: the Easel playing itself', artist: 'Classic technique',
    tags: ['seq', 'sequencer', 'west coast'], level: 2,
    blurb: 'The self-running pulser steps a five-stage sequence on the complex oscillator’s pitch and strikes the gate on every step.',
    how: 'The pulser, set to self, is the clock. Each time its ramp ends it moves the sequencer on a stage and fires the envelope, which strikes Gate 1. A blue sequencer jack goes into PITCH, where the processing slider decides how wide the tune is. With the KEYBOARD switch on as well, the keys transpose the whole pattern.',
    phrase: { bpm: 70, loop: true, steps: [[0, 48, 3.5], [4, 53, 3.5]] },
    steps: [
      { title: 'A pluck on Gate 1', module: 'env',
        why: 'The envelope into LEVEL 1, transient and short, so each trigger is a struck note.\n- Cord: envelope 3 → LEVEL 1, processing 10.\n- Envelope transient: attack 10, sustain 9, decay 6.5.\n- waveshape 3, TIMBRE 3.',
        set: { 'env.mode': 'trans', 'env.attack': 10, 'env.sustain': 9, 'env.decay': 6.5, 'lpg1.levelCv': 10, 'lpg1.level': 0, 'lpg1.mode': 'combo', 'cosc.shape': 3, 'cosc.timbre': 3 },
        cables: [['j.env3', 'j.lvl1']] },
      { title: 'The pulser as the clock', module: 'lfo',
        why: 'Set the pulser to self so it restarts itself, and set the envelope and sequencer to follow it.\n- Pulser trigger self, mode trans, PERIOD 6.4 (about a sixth of a second).\n- Envelope trigger source pulser.\n- Sequencer trigger source pulser.\n- Listen for: a steady stream of plucks on one note.',
        set: { 'pulser.trig': 'self', 'pulser.mode': 'trans', 'pulser.period': 6.4, 'env.trig': 'pulser', 'seq.trig': 'pulser' } },
      { title: 'The sequence on PITCH', module: 'mod',
        why: 'A blue sequencer jack into PITCH. PITCH processing sets how far apart the stages land: 3.5 spreads the sequencer’s full range over about 14 semitones.\n- Cord: sequencer 1 → PITCH.\n- PITCH processing 3.5.\n- Levels 0, 5, 3, 8.6, 7.2: a five-note tune.\n- Listen for: a repeating five-note figure.',
        set: { 'cosc.pitchCv': 3.5, 'seq.l1': 0, 'seq.l2': 5, 'seq.l3': 3, 'seq.l4': 8.6, 'seq.l5': 7.2, 'seq.stages': 5 },
        cables: [['j.seq1', 'j.pitch']] },
      { title: 'Rests and reverb', module: 'mod',
        why: 'Each stage sends a pulse to the envelope only if its PULSE SEQUENCE switch is up. Set the envelope to fire from the sequencer and switch stage 4 down for a rest.\n- Envelope trigger source sequencer.\n- PULSE SEQUENCE 4 down.\n- REVERBERATION 4.\n- Listen for: a gap where the fourth note was.',
        set: { 'env.trig': 'seq', 'seq.p4': false, 'out.rev': 4 } },
    ],
    context: {
      'pulser.period': 'In this sound: the tempo. Up the slider is faster.',
      'cosc.pitchCv': 'In this sound: how wide the tune is. Lower squeezes it into a smaller range; higher stretches it.',
      'seq.stages': 'In this sound: the pattern length. Four or three stages make a different loop from the same sliders.',
      'seq.p4': 'In this sound: down, so stage 4 is a rest. Put it up and the note returns.',
    },
    tweaks: [
      { id: 'seq.stages', try: 'Set STAGES to 3', hear: 'A shorter, three-note loop.' },
      { id: 'pulser.period', try: 'Pull PERIOD down to 5', hear: 'Slower, about one note every half second.' },
    ],
  },
];

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

export default {
  id: 'buchla-easel', name: 'Music Easel', maker: 'Buchla', year: 1973,
  heritage: 'Don Buchla’s portable West Coast instrument, here as the 208C and 218e reissue',
  summary: 'A West Coast synthesizer: no conventional filter, but a complex oscillator that adds harmonics by wavefolding, a modulation oscillator for FM and AM, and two vactrol lowpass gates that shape loudness and tone together. A pulser, a five-stage sequencer, an envelope and a random source are patched in with colour-coded banana cords. The 218e touch keyboard adds portamento, an arpeggiator and four preset voltages.',
  view: { w: 2250, h: 1225 },
  theme: { panel: PANEL, panel2: '#cfd0cb', ink: INK, font: 'helv', cheeks: 'none', cheekW: 0, knobRing: false },
  silentInit: 'The Easel’s envelope reaches the lowpass gates only through a patch cord, so with no cords in, the gates stay shut.',
  signalNames: {
    osc1: 'the complex oscillator', osc2: 'the modulation oscillator', o1sine: 'the complex oscillator’s sine', env1: 'the envelope generator',
    pulser: 'the pulser’s ramp', seq: 'the sequencer', rnd1: 'random voltage 1', rnd2: 'random voltage 2', rnd3: 'random voltage 3', rnd4: 'random voltage 4',
    keyv: 'the key voltage', kpulse: 'the keyboard pulse', press: 'keyboard pressure', pressV: 'keyboard pressure', preset: 'the preset voltage',
    inv10: 'the inverter', envf: 'the envelope detector', preamp: 'the preamp', master: 'the master output', vel: 'key velocity',
    lpg1: 'Gate 1', lpg2: 'Gate 2', noise: 'the noise source',
  },
  destNames: { pitch1: 'the complex oscillator’s pitch', pitch2: 'the modulation oscillator’s frequency' },
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds], lineage,
};
