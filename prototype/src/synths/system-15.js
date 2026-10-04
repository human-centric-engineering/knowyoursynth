// Behringer System 15 — SynthDef. A recreation of the 1973 Moog System 15 in Eurorack: sixteen 900-series modules in two
// rows, nothing wired between them. Coordinates follow Behringer's front photo (14 units per HP), shifted up 50 units.
import { annotate } from '@/lib/maps.js';
import { createRack, rackEngine, blank, appOut, HP, m914, m923, m904b, m904a, m902, m911, m921a, m921b, m921, cp3am, cp35, m961, cm1a } from '@/synths/moog900/modules.js';
import { KEYS, LINK2, TRIGS, VOICE } from '@/synths/moog900/cables.js';
import moreSounds from '@/synths/sounds/system-15.js';
import lineage from '@/synths/lineage/system-15.js';
import unusual from '@/synths/unusual/system-15.js';
import { forRack } from '@/synths/moog900/unusual.js';

const X = (hp) => 20 + hp * HP;
const TOP = 22, BOT = 386;
const rack = createRack();

// ── Top row: 914 · 923 · 904B · 904A · 902 · 902 · 911 · 911 · BP56 ──
m914(rack, X(0), TOP);
m923(rack, X(28), TOP);
m904b(rack, X(36), TOP);
m904a(rack, X(44), TOP);
m902(rack, X(52), TOP, 1);
m902(rack, X(60), TOP, 2);
m911(rack, X(68), TOP, 1);
m911(rack, X(76), TOP, 2);
blank(rack, X(84), TOP, 56, 'BP56');
// ── Bottom row: 921A · 921B · 921B · 921 · CP3A-M · CP35 · 961 · BP28 · BP12 (the app's output) · CM1A ──
m921a(rack, X(0), BOT, 1);
m921b(rack, X(8), BOT, 1);
m921b(rack, X(16), BOT, 2);
m921(rack, X(24), BOT);
cp3am(rack, X(38), BOT, 1);
cp35(rack, X(52), BOT);
m961(rack, X(73), BOT);
blank(rack, X(94), BOT, 28, 'BP28');
appOut(rack, X(122), BOT, 12, 'BP12');
cm1a(rack, X(134), BOT);

const { controls, jacks, decor, areas } = rack;
// the case: a rail between the rows and the maker's strip under them
decor.unshift(
  { t: 'rect', x: 0, y: 0, w: 2000, h: 800, r: 10, fill: '#0b0b0c', hw: true },
  { t: 'rect', x: 12, y: 376, w: 1976, h: 9, r: 2, fill: '#050505', hw: true },
  { t: 'rect', x: 12, y: 742, w: 1976, h: 54, r: 6, fill: '#121213', hw: true },
);
decor.push({ t: 'text', x: 1000, y: 782, text: 'behringer', size: 30, anchor: 'middle', weight: 500, hw: true });
annotate(forRack(rack, unusual), controls, jacks, areas);

const init = Object.fromEntries(controls.map((c) => [c.id, c.def]));

function toEngine(v) {
  return {
    moog: rackEngine(rack, v),
    osc: [],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    filter: { type: 'ladder', mode: 'lp', cutoff: 1000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    volume: 0.8,
  };
}

// ── Sounds ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const presets = [
  {
    id: 's15-first-patch', name: 'Your First Patch', ref: 'The basic Moog voice, cable by cable', artist: 'Behringer',
    tags: ['lead', 'basics'], level: 1,
    blurb: 'One oscillator, the ladder filter and an amplifier, patched up one cable at a time until the keyboard plays notes.',
    how: 'A modular makes no sound until it is patched. This builds the standard voice: an oscillator into the 904A filter, the filter into a 902 amplifier, and the amplifier to the output. Then the CM1A gives the keyboard’s pitch to the 921A, which tunes the 921B, and its trigger fires two 911 envelopes: one opens the amplifier for each note, the other sweeps the filter.',
    phrase: { bpm: 100, loop: true, steps: [[0, 48, 0.9], [1, 55, 0.9], [2, 60, 0.9], [3, 63, 0.9], [4, 60, 1.8], [6, 55, 1.8]] },
    steps: [
      { title: 'An oscillator through the filter to the output', module: 'osc',
        why: 'The 921B’s sawtooth goes into the 904A filter, the filter into a 902 amplifier, and the amplifier to the output.\n- Cables: 921B (1) SAWTOOTH to 904A SIG IN, 904A SIG OUT to 902 (1) SIG IN +, 902 (1) SIG OUT + to OUTPUT.\n- 904A FIXED CONTROL VOLTAGE 4: the filter wide open.\n- 902 (1) FIXED CONTROL VOLTAGE 6: the amplifier fully open.\n- Listen for: a steady buzz at middle C. The keys do nothing yet.',
        set: { 'm904a.fixed_cv': 4, 'm902_1.fixed_cv': 6 },
        cables: [['j.m921b_1.sawtooth', 'j.m904a.sig_in'], ['j.m904a.sig_out', 'j.m902_1.sig_in_pos'], ['j.m902_1.out_pos', 'j.out.l']] },
      { title: 'The keyboard sets the pitch', module: 'mod',
        why: 'The CM1A turns each key into a voltage. It goes to the 921A Oscillator Driver, and the driver’s output to the 921B’s link input.\n- Cables: CM1A CV 1 to 921A FREQUENCY IN 1, 921A FREQUENCY TO 921B to 921B (1) LINK FREQ.\n- Listen for: the buzz now changes pitch with the keys, but it never stops.',
        set: {}, cables: KEYS },
      { title: 'An envelope makes notes', module: 'env',
        why: 'The amplifier is shut, and a 911 envelope opens it for each key. The CM1A’s TRIG goes through a multiple so it can fire both envelopes later.\n- 902 (1) FIXED CONTROL VOLTAGE 0: shut.\n- Cables: CM1A TRIG (upper) to CP35 MULTIPLE A, MULTIPLE A 1 to 911 (1) S-TRIG IN, 911 (1) OUT to 902 (1) CONTROL INPUT 1.\n- 911 (1): T1 2, T2 6, E SUS 7, T3 5.\n- CM1A TRIG MODE stays on S-TRIG, the kind of trigger the 911 needs.\n- Listen for: separate notes that start quickly and fade after you let go.',
        set: { 'm902_1.fixed_cv': 0, 'm911_1.t1': 2, 'm911_1.t2': 6, 'm911_1.esus': 7, 'm911_1.t3': 5 },
        cables: [['j.cm1a.trig_upper', 'j.cp35.mult_a'], ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.m911_1.out', 'j.m902_1.cv_1']] },
      { title: 'A second envelope sweeps the filter', module: 'filter',
        why: 'The filter is closed down, and the second 911 opens it at the start of each note.\n- 904A FIXED CONTROL VOLTAGE −2, REGENERATION 4.\n- Cables: MULTIPLE A 2 to 911 (2) S-TRIG IN, 911 (2) OUT to 904A CONTROL INPUT 1.\n- 911 (2): T1 2, T2 5.5, E SUS 3, T3 5.\n- Listen for: each note opens bright and settles darker: the classic Moog “wow”.',
        set: { 'm904a.fixed_cv': -2, 'm904a.regeneration': 4, 'm911_2.t1': 2, 'm911_2.t2': 5.5, 'm911_2.esus': 3, 'm911_2.t3': 5 },
        cables: [['j.cp35.mult_a_out_2', 'j.m911_2.strig'], ['j.m911_2.out', 'j.m904a.cv_1']] },
    ],
    context: {
      'm904a.fixed_cv': 'In this sound: where the filter sits between notes. The envelope adds to it, so higher makes every note brighter.',
      'm904a.regeneration': 'In this sound: a little resonance at the cutoff, which gives the sweep its squelch.',
      'm911_1.t3': 'In this sound: how long each note rings after you let go.',
      'm911_2.t2': 'In this sound: how fast the brightness falls away after the start of each note.',
      'm911_2.esus': 'In this sound: how bright the note stays while you hold it.',
      'm902_1.fixed_cv': 'In this sound: 0, so only the envelope opens the amplifier. Turn it up and the note never stops.',
    },
    tweaks: [
      { id: 'm911_2.t2', try: 'Turn T2 on the second 911 down to 4', hear: 'A short, plucky blip of brightness at the start of each note.' },
      { id: 'm904a.regeneration', try: 'Turn REGENERATION up to 8', hear: 'A whistling peak that sweeps down with each note.' },
    ],
  },
  {
    id: 's15-expressive-1', name: 'Expressive Lead #1', ref: 'From the Behringer System 15 guide', artist: 'Behringer',
    tags: ['lead', 'vibrato', 'guide'], level: 2,
    blurb: 'Two sawtooth oscillators through the ladder filter, with a vibrato that fades in only on held notes.',
    how: 'The guide’s first lead. Two linked 921Bs are mixed into the 904A and a 902 under the first 911. The vibrato is the clever part: the 921, running slowly, goes through the second 902, and the second 911 opens that amplifier with a long T1. So each held note starts steady and the vibrato fades in; play legato and the second envelope never restarts.',
    phrase: { bpm: 72, loop: true, steps: [[0, 60, 1], [1, 62, 1], [2, 64, 3.5], [6, 67, 1], [7, 64, 4.5]] },
    steps: [
      { title: 'Two linked oscillators from the keyboard', module: 'osc',
        why: 'The keyboard drives the 921A, the 921A drives the first 921B, and the second 921B is chained from the first.\n- Cables: CM1A CV 1 to 921A FREQUENCY IN 1, 921A FREQUENCY TO 921B to 921B (1) LINK FREQ, 921B (1) LINK FREQ (to next) to 921B (2) LINK FREQ.\n- 921B (2) FREQUENCY +0.1: a hair sharp, so the two beat slowly.',
        set: { 'm921b_2.frequency': 0.1 }, cables: [...KEYS, ...LINK2] },
      { title: 'Mixer, filter, amplifier', module: 'mixer',
        why: 'Both sawtooths into the CP3A-M, the mix into the 904A, the 904A into the first 902, and that to the output.\n- Cables: both SAWTOOTH outputs to CP3A-M INPUT 1 and 2, then CP3A-M OUTPUT + to 904A SIG IN, 904A SIG OUT to 902 (1), 902 (1) to OUTPUT.\n- CP3A-M GAIN 1 and 2 at 6, MASTER 8.\n- 904A FIXED CONTROL VOLTAGE 1.5, REGENERATION 2.\n- Not heard yet: the 902 is shut until an envelope opens it.',
        set: { 'cp3am_1.gain1': 6, 'cp3am_1.gain2': 6, 'cp3am_1.master': 8, 'm904a.fixed_cv': 1.5, 'm904a.regeneration': 2 },
        cables: [['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'], ...VOICE] },
      { title: 'Triggers and the loudness envelope', module: 'env',
        why: 'The CM1A’s TRIG goes into a CP35 multiple so it can fire both 911s. The first opens the first 902.\n- Cables: CM1A TRIG to CP35 MULTIPLE A, then MULTIPLE A 1 and 2 to the two 911 S-TRIG INs, 911 (1) OUT to 902 (1) CONTROL INPUT 1.\n- 911 (1): T1 3, T2 6, E SUS 8, T3 6.\n- Listen for: a warm, steady lead.',
        set: { 'm911_1.t1': 3, 'm911_1.t2': 6, 'm911_1.esus': 8, 'm911_1.t3': 6 },
        cables: [...TRIGS, ['j.m911_1.out', 'j.m902_1.cv_1']] },
      { title: 'A vibrato that waits', module: 'lfo',
        why: 'The 921 runs as an LFO. Its AUX output goes through the second 902, which the second 911 opens slowly, and the result goes to both oscillators’ DC MOD through CP35 MULTIPLE B.\n- 921 COARSE RNG on SUB, FREQUENCY +1 (about 5 Hz), AUX OUT WAVEFORM sine, AUX OUT LEVEL 2.2.\n- 911 (2): T1 8 (about 2 seconds), E SUS 10, T3 4.\n- Cables: 921 AUX OUT 1 to 902 (2) SIG IN +, 902 (2) SIG OUT + to CP35 MULTIPLE B, MULTIPLE B 1 and 2 to the two DC MODs, 911 (2) OUT to 902 (2) CONTROL INPUT 1.\n- Listen for: hold a note and the vibrato swells in after a second or so.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': 1, 'm921.aux_wave': 'sine', 'm921.aux_level': 2.2, 'm911_2.t1': 8, 'm911_2.t2': 5, 'm911_2.esus': 10, 'm911_2.t3': 4 },
        cables: [['j.m921.aux_1', 'j.m902_2.sig_in_pos'], ['j.m902_2.out_pos', 'j.cp35.mult_b'], ['j.cp35.mult_b_out_1', 'j.m921b_1.dc_mod'], ['j.cp35.mult_b_out_2', 'j.m921b_2.dc_mod'], ['j.m911_2.out', 'j.m902_2.cv_1']] },
    ],
    context: {
      'm921.aux_level': 'In this sound: the vibrato depth. Small moves make a big difference, because every volt is an octave.',
      'm921.frequency': 'In this sound: the vibrato speed.',
      'm911_2.t1': 'In this sound: how long the vibrato takes to fade in.',
      'm921b_2.frequency': 'In this sound: the detune between the two oscillators, which gives the slow beating.',
      'm904a.fixed_cv': 'In this sound: the brightness of the lead.',
    },
    tweaks: [
      { id: 'm911_2.t1', try: 'Turn T1 on the second 911 down to 3', hear: 'The vibrato is there from the start of every note.' },
      { id: 'm921b_2.frequency', try: 'Set the second 921B’s FREQUENCY to 7', hear: 'The two oscillators now play a fifth apart.' },
    ],
  },
  {
    id: 's15-expressive-2', name: 'Expressive Lead #2', ref: 'From the Behringer System 15 guide', artist: 'Behringer',
    tags: ['lead', 'pwm', 'guide'], level: 2,
    blurb: 'Two rectangular waves with slowly moving pulse width, one detuned, through the filter with its own envelope.',
    how: 'The guide’s second lead uses pulse-width modulation. The 921, as a slow LFO, moves the 921A’s WIDTH input, and the 921A passes that on to both linked 921Bs. As each rectangular wave gets thinner and wider its tone changes, and with the second oscillator a little detuned the two shimmer like a chorus. The second 911 sweeps the 904A on each note.',
    phrase: { bpm: 80, loop: true, steps: [[0, 57, 1.5], [1.5, 60, 0.5], [2, 64, 2], [4, 62, 1.5], [5.5, 60, 0.5], [6, 57, 2]] },
    steps: [
      { title: 'Two linked oscillators, pitch and width', module: 'osc',
        why: 'Pitch and width both come from the 921A, and both chain on to the second 921B.\n- Cables: CM1A CV 1 to 921A FREQUENCY IN 1; 921A FREQUENCY and WIDTH TO 921B to 921B (1) LINK FREQ and LINK WIDTH; then both link jacks on to 921B (2).\n- 921B (2) FREQUENCY +0.12.\n- 921A WIDTH 5 (50 %).',
        set: { 'm921b_2.frequency': 0.12, 'm921a_1.width': 5 },
        cables: [...KEYS, ...LINK2, ['j.m921a_1.width_out', 'j.m921b_1.width_link'], ['j.m921b_1.width_link_thru', 'j.m921b_2.width_link']] },
      { title: 'Rectangular waves into the voice', module: 'mixer',
        why: 'Both RECTANGULAR outputs into the mixer, then the filter and amplifier as usual, with both envelopes.\n- CP3A-M GAIN 1 and 2 at 6, MASTER 8.\n- 904A FIXED CONTROL VOLTAGE −1, REGENERATION 2.\n- 911 (1): T1 2, T2 6, E SUS 8, T3 5.5. 911 (2): T1 4, T2 6, E SUS 4, T3 5.5.\n- Listen for: a hollow, reedy lead with a soft filter sweep.',
        set: { 'cp3am_1.gain1': 6, 'cp3am_1.gain2': 6, 'cp3am_1.master': 8, 'm904a.fixed_cv': -1, 'm904a.regeneration': 2,
          'm911_1.t1': 2, 'm911_1.t2': 6, 'm911_1.esus': 8, 'm911_1.t3': 5.5, 'm911_2.t1': 4, 'm911_2.t2': 6, 'm911_2.esus': 4, 'm911_2.t3': 5.5 },
        cables: [['j.m921b_1.rectangular', 'j.cp3am_1.in1'], ['j.m921b_2.rectangular', 'j.cp3am_1.in2'], ...VOICE, ...TRIGS,
          ['j.m911_1.out', 'j.m902_1.cv_1'], ['j.m911_2.out', 'j.m904a.cv_1']] },
      { title: 'The 921 moves the width', module: 'lfo',
        why: 'The 921, as a slow LFO, goes through CP35 attenuator 1 into the 921A’s WIDTH input, so both pulse widths swing together.\n- 921 COARSE RNG on SUB, FREQUENCY −0.5 (under 2 Hz).\n- CP35 ATTENUATOR 1 at 2.5: about ±20 % of width.\n- Cables: 921 SINE to CP35 IN 1, CP35 OUT 1 to 921A WIDTH IN 1.\n- Listen for: a slow, chorus-like movement in the tone.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': -0.5, 'cp35.att1': 2.5 },
        cables: [['j.m921.sine', 'j.cp35.att_in1'], ['j.cp35.att_out1', 'j.m921a_1.width_in_1']] },
    ],
    context: {
      'cp35.att1': 'In this sound: the depth of the width sweep. Past about 3.5 the width goes beyond the ends and the wave drops out for part of each sweep.',
      'm921.frequency': 'In this sound: the speed of the shimmer.',
      'm921a_1.width': 'In this sound: the centre of the width sweep.',
      'm921b_2.frequency': 'In this sound: the detune of the second oscillator.',
    },
    tweaks: [
      { id: 'cp35.att1', try: 'Turn ATTENUATOR 1 down to 0', hear: 'The shimmer stops: a plain, static square wave.' },
      { id: 'm921.frequency', try: 'Turn the 921 FREQUENCY up to 1.5', hear: 'A faster, more nervous wobble.' },
    ],
  },
  {
    id: 's15-space-rock', name: 'Space Rock', ref: 'From the Behringer System 15 guide', artist: 'Behringer',
    tags: ['fx', 'drone', 'guide'], level: 2,
    blurb: 'A whistling self-oscillating filter swept by two slow oscillators, over wind made from pink noise.',
    how: 'Two classic space-rock sounds at once, and neither uses the keyboard. The 904A with REGENERATION near the top rings on its own as a sine wave, and the slow 921 and the first 921B (in its LO range) move its pitch. Pink noise through the 904B high-pass, swept by the second 921B, makes the wind. Both go through the mixer to the output.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'The filter sings on its own', module: 'filter',
        why: 'With REGENERATION at 9.5 the 904A oscillates with nothing at its input. The mixer takes it to the output.\n- 904A REGENERATION 9.5, FIXED CONTROL VOLTAGE −2, so the sweeps swing round a low whistle.\n- Cables: 904A SIG OUT to CP3A-M INPUT 1, CP3A-M OUTPUT + to OUTPUT.\n- CP3A-M GAIN 1 at 5, MASTER 8.\n- Listen for: a pure, steady whistle.',
        set: { 'm904a.regeneration': 9.5, 'm904a.fixed_cv': -2, 'cp3am_1.gain1': 5, 'cp3am_1.master': 8 },
        cables: [['j.m904a.sig_out', 'j.cp3am_1.in1'], ['j.cp3am_1.out_pos_1', 'j.out.l']] },
      { title: 'Two slow sweeps', module: 'lfo',
        why: 'The 921 (on SUB) and the first 921B (on LO) both move the filter’s pitch, at different speeds, so the whistle wanders.\n- 921 COARSE RNG on SUB, FREQUENCY −2.\n- 921B (1) RANGE LO. The 921A sets its speed: FREQUENCY −6 on OCTAVE.\n- Cables: 921 SINE to 904A CONTROL INPUT 1, 921A FREQUENCY TO 921B to 921B (1) LINK FREQ, 921B (1) SINE to 904A CONTROL INPUT 2.\n- Listen for: a swooping, warbling whistle.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': -2, 'm921b_1.range': 'LO', 'm921a_1.scale': 'octave', 'm921a_1.frequency': -6 },
        cables: [['j.m921.sine', 'j.m904a.cv_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ['j.m921b_1.sine', 'j.m904a.cv_2']] },
      { title: 'Wind', module: 'filter',
        why: 'Pink noise through the 904B high-pass, swept by the second 921B (also on LO, chained from the first).\n- Cables: 923 PINK NOISE 1 to 904B SIG IN, 904B SIG OUT to CP3A-M INPUT 2, 921B (1) LINK FREQ (to next) to 921B (2) LINK FREQ, 921B (2) SINE to 904B CONTROL INPUT 1.\n- 921B (2) RANGE LO, FREQUENCY +5 (a different speed).\n- 904B FIXED CONTROL VOLTAGE 1. CP3A-M GAIN 2 at 6.\n- Listen for: rushing wind behind the whistle.',
        set: { 'm921b_2.range': 'LO', 'm921b_2.frequency': 5, 'm904b.fixed_cv': 1, 'cp3am_1.gain2': 6 },
        cables: [['j.m923.pink_1', 'j.m904b.sig_in'], ['j.m904b.sig_out', 'j.cp3am_1.in2'], ['j.m921b_1.freq_link_thru', 'j.m921b_2.freq_link'], ['j.m921b_2.sine', 'j.m904b.cv_1']] },
    ],
    context: {
      'm904a.regeneration': 'In this sound: at 9.5 the filter is the sound source. Below about 9 it falls silent, because nothing is going into it.',
      'm921.frequency': 'In this sound: the speed of one of the two sweeps.',
      'm904b.fixed_cv': 'In this sound: how thin the wind is.',
      'cp3am_1.gain2': 'In this sound: the level of the wind against the whistle.',
    },
    tweaks: [
      { id: 'm904a.fixed_cv', try: 'Turn the 904A FIXED CONTROL VOLTAGE up to 3', hear: 'The whistle moves up into a shrill, piercing range.' },
      { id: 'm921b_2.frequency', try: 'Set the second 921B’s FREQUENCY to −6', hear: 'The wind gusts much more slowly.' },
    ],
  },
];

export default {
  id: 'system-15', name: 'System 15', maker: 'Behringer', year: 2022,
  heritage: 'Based on the 1973 Moog System 15 modular',
  summary: 'Sixteen 900-series modules with nothing wired between them: two 921B oscillators under a 921A driver, a 921 LFO, the 904A ladder and 904B high-pass, the 914 fixed filter bank, two 902 amplifiers and two 911 envelopes. Every sound starts with a cable.',
  view: { w: 2000, h: 800 },
  theme: { panel: '#0e0e0f', panel2: '#070708', ink: '#dcdcd8', font: 'din', cheeks: 'none', cheekW: 0, weight: 600 },
  silentInit: 'Nothing on a modular is connected until you patch it, so with no cables the System 15 is silent.',
  signalNames: rack.signalNames, destNames: rack.destNames,
  decor, areas, controls, jacks, init, toEngine, presets: [...presets, ...moreSounds], lineage,
};
