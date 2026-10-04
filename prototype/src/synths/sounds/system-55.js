// Behringer System 55 — the sound library (CONTRACT.md → Preset). The guide's patches first, then the sequencer sounds.
import { KEYS, LINK2, TRIGS, VOICE } from '@/synths/moog900/cables.js';
import s35 from '@/synths/sounds/system-35.js';

/** A 960 knob for a note `s` semitones above the bottom of a row set to X1 (2 V over the knob, so 10/24 per semitone). */
const st = (s) => Math.round(s * (10 / 24) * 1000) / 1000;
/** The eight knobs of one 960 row, from semitones. */
const row = (r, semis) => Object.fromEntries(semis.map((s, i) => [`m960.row_${r}_${i + 1}`, st(s)]));
const fmtRow = (semis) => semis.map((s) => st(s)).join(', ');

const LINK3 = [['j.m921b_2.freq_link_thru', 'j.m921b_3.freq_link']];
const BANK2 = [['j.m921a_2.freq_out', 'j.m921b_4.freq_link'], ['j.m921b_4.freq_link_thru', 'j.m921b_5.freq_link'], ['j.m921b_5.freq_link_thru', 'j.m921b_6.freq_link']];
/** The 960 clock through the 961 into S-triggers, on CP35 MULTIPLE A for the 911s. */
const CLOCK_TRIGS = [['j.m960.osc_out', 'j.m961.vtrig_a_l_1'], ['j.m961.strig_out_l', 'j.cp35.mult_a']];

// Guide patches the System 55 shares with the System 35: the same cables and settings, the same module ids.
const SHARED = ['s35-expressive-2', 's35-mellow-organ', 's35-percussive-lead', 's35-space-rock'].map((id) => {
  const p = s35.find((x) => x.id === id);
  return { ...p, id: id.replace('s35-', 's55-'), ref: 'From the Behringer System 55 guide' };
});

const HARM_A = [0, 3, 7, 10, 12, 10, 7, 5];
const HARM_B = [7, 12, 15, 19, 15, 19, 12, 10];
const BERLIN = [0, 12, 3, 12, 7, 12, 10, 5];
const NRG = [0, 12, 0, 12, 3, 15, 5, 17];
const R24 = { a: [0, 3, 5, 7, 10, 7, 5, 3], b: [5, 8, 10, 12, 15, 12, 10, 8], c: [7, 10, 12, 15, 17, 15, 12, 10] };

export default [
  {
    id: 's55-harmonic-sequence', name: 'Harmonic Sequence', ref: 'From the Behringer System 55 guide', artist: 'Behringer',
    tags: ['seq', 'guide', 'berlin'], level: 3,
    blurb: 'The 960 plays two related eight-note lines on two oscillator banks, and one control voltage crossfades them through the two filters.',
    how: 'The guide’s showpiece. Row A of the 960 drives the first 921A and its three 921Bs into the 904A low-pass; row B drives the second bank into the 904B high-pass. The 960’s clock, turned into S-triggers by the 961, fires the envelopes. The 992 mixes a slow 921 sine and the third 911 and sends the result to both filters at once: as the low-pass opens the high-pass closes in the same direction of voltage, so the two lines trade places in the mix.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'Two banks under two rows', module: 'mod',
        why: 'Row A to the first 921A, row B to the second; each 921A chained to its three 921Bs. All six SAWTOOTHs into two mixers.\n- 960 row A (stage 1–8): ' + fmtRow(HARM_A) + '. Row B: ' + fmtRow(HARM_B) + '. Both ROW RANGEs X1.\n- 921A (1) and (2) FREQUENCY −1 (OCTAVE): an octave down.\n- 921B (2) +0.06, 921B (3) −0.07, 921B (5) +0.07, 921B (6) −0.06.\n- CP3A-M (1) and (2): GAIN 1–3 at 4, MASTER 8.\n- 960 FREQUENCY RANGE 5, VERNIER 7 (about 4 steps a second).',
        set: { ...row('a', HARM_A), ...row('b', HARM_B), 'm921a_1.frequency': -1, 'm921a_2.frequency': -1, 'm921b_2.frequency': 0.06, 'm921b_3.frequency': -0.07,
          'm921b_5.frequency': 0.07, 'm921b_6.frequency': -0.06, 'cp3am_1.gain1': 4, 'cp3am_1.gain2': 4, 'cp3am_1.gain3': 4, 'cp3am_1.master': 8,
          'cp3am_2.gain1': 4, 'cp3am_2.gain2': 4, 'cp3am_2.gain3': 4, 'cp3am_2.master': 8, 'm960.freq_range': 5, 'm960.vernier': 7 },
        cables: [['j.m960.row_a_out_1', 'j.m921a_1.freq_in_1'], ['j.m960.row_b_out_1', 'j.m921a_2.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ...LINK2, ...LINK3, ...BANK2,
          ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'], ['j.m921b_3.sawtooth', 'j.cp3am_1.in3'],
          ['j.m921b_4.sawtooth', 'j.cp3am_2.in1'], ['j.m921b_5.sawtooth', 'j.cp3am_2.in2'], ['j.m921b_6.sawtooth', 'j.cp3am_2.in3']] },
      { title: 'Two filters, two amplifiers, one clock', module: 'env',
        why: 'Bank 1 through the 904A and the first 902; bank 2 through the 904B and the second 902; both into the third mixer and out. The 960 clock goes through the 961 into S-triggers, and CP35 MULTIPLE A takes them to the 911s.\n- 904A FIXED CONTROL VOLTAGE −1, REGENERATION 4. 904B FIXED CONTROL VOLTAGE −1.\n- 911 (1) and (2): T1 0, T2 5, E SUS 3, T3 4.5.\n- CP3A-M (3) GAIN 1 and 2 at 7, MASTER 8.\n- Listen for: two interlocking lines, one dark and one thin.',
        set: { 'm904a.fixed_cv': -1, 'm904a.regeneration': 4, 'm904b.fixed_cv': -1, 'm911_1.t1': 0, 'm911_1.t2': 5, 'm911_1.esus': 3, 'm911_1.t3': 4.5,
          'm911_2.t1': 0, 'm911_2.t2': 5, 'm911_2.esus': 3, 'm911_2.t3': 4.5, 'cp3am_3.gain1': 7, 'cp3am_3.gain2': 7, 'cp3am_3.master': 8 },
        cables: [['j.cp3am_1.out_pos_1', 'j.m904a.sig_in'], ['j.cp3am_2.out_pos_1', 'j.m904b.sig_in'], ['j.m904a.sig_out', 'j.m902_1.sig_in_pos'], ['j.m904b.sig_out', 'j.m902_2.sig_in_pos'],
          ['j.m902_1.out_pos', 'j.cp3am_3.in1'], ['j.m902_2.out_pos', 'j.cp3am_3.in2'], ['j.cp3am_3.out_pos_1', 'j.out.l'], ...CLOCK_TRIGS,
          ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.cp35.mult_a_out_2', 'j.m911_2.strig'], ['j.m911_1.out', 'j.m902_1.cv_1'], ['j.m911_2.out', 'j.m902_2.cv_1']] },
      { title: 'The 992 crossfades the filters', module: 'filter',
        why: 'The 921 (slow sine, on AUX at level 6) into 992 CONTROL INPUT 1, and the third 911 through the 992’s attenuated EXT INPUT. The 992 sends the sum to both filters.\n- 921 COARSE RNG on SUB, FREQUENCY −3, AUX OUT WAVEFORM sine, AUX OUT LEVEL 6.\n- 911 (3): T1 6, T2 7, E SUS 5, T3 6.\n- 992 CV SWITCH 1 on, SWITCH 4 on, ATTENUATOR +4.\n- Listen for: the two lines slowly swap: as the low line brightens, the high one thins out.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': -3, 'm921.aux_wave': 'sine', 'm921.aux_level': 6, 'm911_3.t1': 6, 'm911_3.t2': 7, 'm911_3.esus': 5, 'm911_3.t3': 6,
          'm992.switch1': true, 'm992.switch4': true, 'm992.attenuator': 4 },
        cables: [['j.cp35.mult_a_out_3', 'j.m911_3.strig'], ['j.m911_3.out', 'j.m992.ext'], ['j.m921.aux_1', 'j.m992.in1'], ['j.m992.out_1', 'j.m904a.cv_1'], ['j.m992.out_2', 'j.m904b.cv_1']] },
    ],
    context: {
      'm960.vernier': 'In this sound: the tempo.',
      'm921.frequency': 'In this sound: how slowly the two lines trade places.',
      'm992.attenuator': 'In this sound: how much the third envelope adds to the filter movement on each step.',
      'cp3am_3.gain1': 'In this sound: the low-pass line’s level against the high-pass line.',
    },
    tweaks: [
      { id: 'm960.vernier', try: 'Turn the 960 VERNIER up to 9', hear: 'A faster, more urgent pattern.' },
      { id: 'm992.switch1', try: 'Flick 992 CV SWITCH 1 off', hear: 'The slow crossfade stops; only the envelope moves the filters.' },
    ],
  },
  {
    id: 's55-expressive-1', name: 'Expressive Lead #1', ref: 'From the Behringer System 55 guide', artist: 'Behringer',
    tags: ['lead', 'vibrato', 'guide'], level: 3,
    blurb: 'Three sawtooths through the ladder filter, with a vibrato that the 911A holds back for two seconds.',
    how: 'The System 35’s lead with one addition. The trigger for the vibrato envelope goes through the 911A first, which passes it on only if the key is still held after its DELAY TIME. Short notes and quick runs stay plain; a long note blooms into vibrato after two seconds.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 0.5], [0.5, 62, 0.5], [1, 64, 3.8], [5, 67, 0.5], [5.5, 64, 2.5]] },
    steps: [
      { title: 'Three oscillators and the voice', module: 'osc',
        why: 'Three linked 921Bs, mixed, through the 904A and the first 902, with the first two 911s on the amplifier and the filter.\n- 921B (2) +0.08, 921B (3) −0.1. CP3A-M (1) GAIN 1–3 at 5, MASTER 8.\n- 904A FIXED CONTROL VOLTAGE −1, REGENERATION 2.\n- 911 (1): T1 3, T2 6, E SUS 8, T3 6. 911 (2): T1 3, T2 6.5, E SUS 4, T3 6.',
        set: { 'm921b_2.frequency': 0.08, 'm921b_3.frequency': -0.1, 'cp3am_1.gain1': 5, 'cp3am_1.gain2': 5, 'cp3am_1.gain3': 5, 'cp3am_1.master': 8, 'm904a.fixed_cv': -1, 'm904a.regeneration': 2,
          'm911_1.t1': 3, 'm911_1.t2': 6, 'm911_1.esus': 8, 'm911_1.t3': 6, 'm911_2.t1': 3, 'm911_2.t2': 6.5, 'm911_2.esus': 4, 'm911_2.t3': 6 },
        cables: [...KEYS, ...LINK2, ...LINK3, ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'], ['j.m921b_3.sawtooth', 'j.cp3am_1.in3'], ...VOICE, ...TRIGS,
          ['j.m911_1.out', 'j.m902_1.cv_1'], ['j.m911_2.out', 'j.m904a.cv_1']] },
      { title: 'Vibrato through the CP3A-O', module: 'lfo',
        why: 'The 921 through the second 902 into the CP3A-O’s EXT INPUT, and the CP3A-O on to the three DC MODs. The third 911 opens the 902.\n- 921 on SUB, FREQUENCY +1, AUX sine at level 10. CP3A-O (1) ROUTING SWITCH 4 on, ATTENUATOR 1.2.\n- 911 (3): T1 4, T2 5, E SUS 10, T3 4.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': 1, 'm921.aux_wave': 'sine', 'm921.aux_level': 10, 'cp3ao_1.route4': true, 'cp3ao_1.attenuator': 1.2,
          'm911_3.t1': 4, 'm911_3.t2': 5, 'm911_3.esus': 10, 'm911_3.t3': 4 },
        cables: [['j.m921.aux_1', 'j.m902_2.sig_in_pos'], ['j.m902_2.out_pos', 'j.cp3ao_1.ext'], ['j.cp3ao_1.out_1', 'j.m921b_1.dc_mod'], ['j.cp3ao_1.out_2', 'j.m921b_2.dc_mod'],
          ['j.cp3ao_1.out_3', 'j.m921b_3.dc_mod'], ['j.m911_3.out', 'j.m902_2.cv_1']] },
      { title: 'The 911A holds the vibrato back', module: 'env',
        why: 'The third trigger goes through the 911A’s upper delay before it reaches the third 911.\n- 911A upper DELAY TIME 8 (about 2 seconds).\n- Cables: CP35 MULTIPLE A 3 to 911A S-TRIG IN (upper); 911A S-TRIG OUT (upper) to 911 (3) S-TRIG IN.\n- Listen for: the short notes stay plain; the long note gets its vibrato after two seconds.',
        set: { 'm911a.delay_1': 8 },
        cables: [['j.cp35.mult_a_out_3', 'j.m911a.strig_1'], ['j.m911a.strig_out_1', 'j.m911_3.strig']] },
    ],
    context: {
      'm911a.delay_1': 'In this sound: how long a note must be held before the vibrato starts.',
      'cp3ao_1.attenuator': 'In this sound: the vibrato depth.',
    },
    tweaks: [
      { id: 'm911a.delay_1', try: 'Turn the 911A DELAY TIME down to 6', hear: 'The vibrato arrives after about a third of a second.' },
    ],
  },
  ...SHARED,
  {
    id: 's55-berlin', name: 'Berlin Sequence', ref: 'In the style of Tangerine Dream — Phaedra', artist: 'Tangerine Dream',
    tags: ['seq', 'berlin', 'bass'], level: 2,
    blurb: 'An eight-step bass line from the 960 jumping between the root and its octave, with a resonant filter that drifts slowly open and shut.',
    how: 'The sound of the mid-1970s Berlin school: a sequence that never changes its notes, made to breathe by slow filter movement. The 960’s row A plays the pattern through one 921A and two 921Bs. The clock fires a short envelope on the 902 and another on the filter, and a slow 921, mixed in through the 992, sweeps the 904A across a minute.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'The pattern on two oscillators', module: 'mod',
        why: 'Row A to the first 921A, which drives two 921Bs a hair apart. Their SAWTOOTH and RECTANGULAR go through the mixer to the 904A and the first 902.\n- 960 row A: ' + fmtRow(BERLIN) + ', RANGE X1. FREQUENCY RANGE 5, VERNIER 8.5.\n- 921A (1) FREQUENCY −2 (OCTAVE). 921B (2) +0.07.\n- CP3A-M (1) GAIN 1 at 6, GAIN 2 at 5, MASTER 8.',
        set: { ...row('a', BERLIN), 'm960.freq_range': 5, 'm960.vernier': 8.5, 'm921a_1.frequency': -2, 'm921b_2.frequency': 0.07,
          'cp3am_1.gain1': 6, 'cp3am_1.gain2': 5, 'cp3am_1.master': 8 },
        cables: [['j.m960.row_a_out_1', 'j.m921a_1.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ...LINK2,
          ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.rectangular', 'j.cp3am_1.in2'], ...VOICE] },
      { title: 'Short notes from the clock', module: 'env',
        why: 'The 960 clock through the 961 to both 911s: one on the 902, one on the filter through the 992.\n- 911 (1): T1 0, T2 4.8, E SUS 0, T3 4. 911 (2): T1 0, T2 4.5, E SUS 0, T3 4.\n- 904A FIXED CONTROL VOLTAGE −2.5, REGENERATION 6.5. 992 CV SWITCH 1 on.\n- Cables: the clock through the 961 to MULTIPLE A; MULTIPLE A 1 and 2 to the 911s; 911 (1) to 902 (1); 911 (2) to 992 CONTROL INPUT 1; 992 OUTPUT 1 to 904A CONTROL INPUT 1.\n- Listen for: a bubbling, resonant bass line.',
        set: { 'm911_1.t1': 0, 'm911_1.t2': 4.8, 'm911_1.esus': 0, 'm911_1.t3': 4, 'm911_2.t1': 0, 'm911_2.t2': 4.5, 'm911_2.esus': 0, 'm911_2.t3': 4,
          'm904a.fixed_cv': -2.5, 'm904a.regeneration': 6.5, 'm992.switch1': true },
        cables: [...CLOCK_TRIGS, ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.cp35.mult_a_out_2', 'j.m911_2.strig'], ['j.m911_1.out', 'j.m902_1.cv_1'],
          ['j.m911_2.out', 'j.m992.in1'], ['j.m992.out_1', 'j.m904a.cv_1']] },
      { title: 'A slow sweep', module: 'lfo',
        why: 'The 921, very slow, into 992 CONTROL INPUT 2: the filter opens and closes over many bars.\n- 921 on SUB, FREQUENCY −4, AUX sine at level 7. 992 CV SWITCH 2 on.\n- Listen for: the line growing brighter and more resonant, then sinking back.',
        set: { 'm921.coarse': 'sub', 'm921.frequency': -4, 'm921.aux_wave': 'sine', 'm921.aux_level': 7, 'm992.switch2': true },
        cables: [['j.m921.aux_1', 'j.m992.in2']] },
    ],
    context: {
      'm904a.regeneration': 'In this sound: the squelch on every step.',
      'm911_2.t2': 'In this sound: how long the filter blip on each step lasts.',
      'm960.vernier': 'In this sound: the tempo.',
      'm921.aux_level': 'In this sound: how far the slow sweep moves the filter.',
    },
    tweaks: [
      { id: 'm904a.regeneration', try: 'Turn REGENERATION up to 8.5', hear: 'Each step rings like a struck pipe.' },
      { id: 'm960.mode_8', try: 'Set stage 8 to SKIP', hear: 'A seven-step loop that drifts against the beat.' },
    ],
  },
  {
    id: 's55-hi-nrg', name: 'Octave Pulse', ref: 'In the style of Giorgio Moroder — "I Feel Love"', artist: 'Giorgio Moroder',
    tags: ['seq', 'bass', 'disco'], level: 2,
    blurb: 'A fast sequence bouncing between each note and its octave, tight and punchy: the pulse that disco and techno grew from.',
    how: 'Each pair of steps is a note and the same note an octave up, so the bass bounces on every sixteenth. The 960 runs fast (range 5, near the top); a very short filter envelope gives each step a click of brightness, and the 902 on EXP keeps the notes tight.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'A fast octave pattern', module: 'mod',
        why: 'Row A, fast, into the first 921A and two 921Bs.\n- 960 row A: ' + fmtRow(NRG) + ', RANGE X1. FREQUENCY RANGE 5, VERNIER 9.5 (about 7 steps a second).\n- 921A (1) FREQUENCY −2 (OCTAVE). 921B (2) +0.05, RANGE 8’.\n- SAWTOOTH (1) and (2) into CP3A-M (1) at GAIN 6, MASTER 8.',
        set: { ...row('a', NRG), 'm960.freq_range': 5, 'm960.vernier': 9.5, 'm921a_1.frequency': -2, 'm921b_2.frequency': 0.05,
          'cp3am_1.gain1': 6, 'cp3am_1.gain2': 6, 'cp3am_1.master': 8 },
        cables: [['j.m960.row_a_out_1', 'j.m921a_1.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ...LINK2,
          ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'], ...VOICE] },
      { title: 'Tight envelopes', module: 'env',
        why: 'The clock through the 961 to both 911s, very short.\n- 902 (1) CONTROL MODE EXP. 911 (1): T1 0, T2 5, E SUS 7, T3 3.5. 911 (2): T1 0, T2 4, E SUS 1, T3 3.\n- 904A FIXED CONTROL VOLTAGE −1.5, REGENERATION 3.\n- Listen for: a driving, pulsing bass.',
        set: { 'm902_1.mode': 'exp', 'm911_1.t1': 0, 'm911_1.t2': 5, 'm911_1.esus': 7, 'm911_1.t3': 3.5, 'm911_2.t1': 0, 'm911_2.t2': 4, 'm911_2.esus': 1, 'm911_2.t3': 3,
          'm904a.fixed_cv': -1.5, 'm904a.regeneration': 3 },
        cables: [...CLOCK_TRIGS, ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.cp35.mult_a_out_2', 'j.m911_2.strig'], ['j.m911_1.out', 'j.m902_1.cv_1'], ['j.m911_2.out', 'j.m904a.cv_1']] },
    ],
    context: {
      'm960.vernier': 'In this sound: the tempo. Near 9.5 the pattern runs at about 7 steps a second.',
      'm911_2.t2': 'In this sound: the length of the click of brightness on each step.',
    },
    tweaks: [
      { id: 'm911_2.esus', try: 'Turn E SUS on the second 911 up to 5', hear: 'A brighter, buzzier pulse.' },
      { id: 'm960.row_a_5', try: 'Move stage 5 of row A to 2.9', hear: 'The pattern’s third pair now lands a fifth up.' },
    ],
  },
  {
    id: 's55-24-steps', name: 'Twenty-Four Steps', ref: 'The 960 and 962 together', artist: 'Behringer',
    tags: ['seq', 'lead'], level: 3,
    blurb: 'The 962 switches between the 960’s three rows every eight steps, so the sequence runs to twenty-four notes before it repeats.',
    how: 'The 960 has eight stages but three rows. The 962 passes one of its three inputs to its output and moves on to the next each time its SHIFT input fires. Patch the three rows into the 962, the 962 into the 921A, and stage 1’s trigger into the 962’s SHIFT: every time the 960 comes back to stage 1, the 962 moves to the next row, and the three eight-note phrases play one after another.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'One row first', module: 'mod',
        why: 'Row A straight into the first 921A; two 921Bs into the voice, fired by the clock.\n- 960 rows A, B and C: three related phrases, all RANGE X1. FREQUENCY RANGE 5, VERNIER 8.5.\n- 921A (1) FREQUENCY −1. 921B (2) +7 (a fifth up). CP3A-M (1) GAIN 1 at 6, GAIN 2 at 3, MASTER 8.\n- 904A FIXED CONTROL VOLTAGE −1, REGENERATION 3. 911 (1): T1 0, T2 5, E SUS 2, T3 4.5. 911 (2): T1 0, T2 5, E SUS 2, T3 4.5.',
        set: { ...row('a', R24.a), ...row('b', R24.b), ...row('c', R24.c), 'm960.freq_range': 5, 'm960.vernier': 8.5, 'm921a_1.frequency': -1, 'm921b_2.frequency': 7,
          'cp3am_1.gain1': 6, 'cp3am_1.gain2': 3, 'cp3am_1.master': 8, 'm904a.fixed_cv': -1, 'm904a.regeneration': 3,
          'm911_1.t1': 0, 'm911_1.t2': 5, 'm911_1.esus': 2, 'm911_1.t3': 4.5, 'm911_2.t1': 0, 'm911_2.t2': 5, 'm911_2.esus': 2, 'm911_2.t3': 4.5 },
        cables: [['j.m960.row_a_out_1', 'j.m962.sig_1'], ['j.m962.out_1', 'j.m921a_1.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ...LINK2,
          ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'], ...VOICE, ...CLOCK_TRIGS,
          ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.cp35.mult_a_out_2', 'j.m911_2.strig'], ['j.m911_1.out', 'j.m902_1.cv_1'], ['j.m911_2.out', 'j.m904a.cv_1']] },
      { title: 'The 962 joins the rows', module: 'util',
        why: 'Rows B and C into the 962’s other inputs, and stage 1’s trigger into its SHIFT.\n- Cables: 960 ROW B OUTPUT 1 to 962 SIG IN 2, ROW C OUTPUT 1 to SIG IN 3, 960 STAGE 1 OUT to 962 SHIFT.\n- Listen for: a phrase that climbs through three versions before it repeats.',
        set: {},
        cables: [['j.m960.row_b_out_1', 'j.m962.sig_2'], ['j.m960.row_c_out_1', 'j.m962.sig_3'], ['j.m960.stage_out_1', 'j.m962.shift']] },
    ],
    context: {
      'm960.vernier': 'In this sound: the tempo.',
      'm921b_2.frequency': 'In this sound: a second oscillator a fifth up, quietly, for a fuller line.',
    },
    tweaks: [{ id: 'm962.button_1', try: 'Press 962 TRIGGER BUTTON 1 at any time', hear: 'The sequence jumps back to row A’s phrase.' }],
  },
  {
    id: 's55-third-row', name: 'Third-Row Rhythm', ref: 'The 960’s timing row', artist: 'Behringer',
    tags: ['seq', 'perc'], level: 3,
    blurb: 'Row C sets how long each stage lasts, so the sequence plays a rhythm instead of even steps.',
    how: 'With 3RD ROW CONTROL OF TIMING on, row C’s voltage is added to the clock’s control voltage on each stage: a high knob speeds the clock up for that stage, so the step is short; a low one makes it long. The notes come from row A as usual. The result is a looping rhythm with its own swing, set entirely by knobs.',
    phrase: { bpm: 60, loop: true, steps: [[0, 60, 8]] },
    steps: [
      { title: 'An even sequence', module: 'mod',
        why: 'Row A through the first 921A to one 921B, plucked by the clock.\n- 960 row A: ' + fmtRow([0, 7, 12, 7, 10, 3, 5, 7]) + '. FREQUENCY RANGE 3, VERNIER 6 (slow).\n- 921A (1) FREQUENCY −1. CP3A-M (1) GAIN 1 at 7, MASTER 8.\n- 904A FIXED CONTROL VOLTAGE 0, REGENERATION 5.\n- 911 (1): T1 0, T2 5, E SUS 0, T3 4.5.',
        set: { ...row('a', [0, 7, 12, 7, 10, 3, 5, 7]), 'm960.freq_range': 3, 'm960.vernier': 6, 'm921a_1.frequency': -1, 'cp3am_1.gain1': 7, 'cp3am_1.master': 8,
          'm904a.fixed_cv': 0, 'm904a.regeneration': 5, 'm911_1.t1': 0, 'm911_1.t2': 5, 'm911_1.esus': 0, 'm911_1.t3': 4.5 },
        cables: [['j.m960.row_a_out_1', 'j.m921a_1.freq_in_1'], ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ...VOICE, ...CLOCK_TRIGS,
          ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.m911_1.out', 'j.m902_1.cv_1']] },
      { title: 'Row C sets the rhythm', module: 'mod',
        why: '3RD ROW CONTROL OF TIMING on, and row C’s knobs set high for short stages, low for long ones.\n- Row C: 10, 10, 5, 10, 10, 5, 0, 10. RANGE X2.\n- Listen for: a lopsided, looping rhythm with quick pairs and long held steps.',
        set: { 'm960.timing': true, 'm960.range_c': 'x2', 'm960.row_c_1': 10, 'm960.row_c_2': 10, 'm960.row_c_3': 5, 'm960.row_c_4': 10, 'm960.row_c_5': 10, 'm960.row_c_6': 5, 'm960.row_c_7': 0, 'm960.row_c_8': 10 },
        cables: [] },
    ],
    context: {
      'm960.timing': 'In this sound: on, so row C sets the rhythm. Off, and every step is the same length.',
      'm960.range_c': 'In this sound: how much row C changes the speed: X4 makes the short steps much shorter.',
    },
    tweaks: [
      { id: 'm960.range_c', try: 'Set ROW C RANGE to X4', hear: 'A more extreme rhythm: flurries and long pauses.' },
      { id: 'm960.row_c_7', try: 'Turn stage 7 of row C up to 10', hear: 'The long held step becomes a quick one.' },
    ],
  },
  {
    id: 's55-delayed-fifth', name: 'Delayed Fifth', ref: 'The 911A trigger delay', artist: 'Behringer',
    tags: ['pad', 'lead'], level: 3,
    blurb: 'A held note brings in a second oscillator bank a fifth up after a second, so long notes open into a chord.',
    how: 'Two banks: the first plays the note, the second, a fifth up, has its own 902 and 911. That 911 is fired through the 911A, which passes the trigger on only if the key is still held after DELAY TIME. Quick notes stay single; held ones grow into a fifth.',
    phrase: { bpm: 60, loop: true, steps: [[0, 57, 0.4], [0.5, 60, 0.4], [1, 62, 2.8], [4, 60, 0.4], [4.5, 57, 3.2]] },
    steps: [
      { title: 'The main voice', module: 'osc',
        why: 'The keyboard to both 921As through CP35 MULTIPLE B. Bank 1 (921B 1 and 2) through the 904A and the first 902 to the third mixer.\n- 921B (2) +0.08. CP3A-M (1) GAIN 1 and 2 at 6, MASTER 8. 904A FIXED CONTROL VOLTAGE 0, REGENERATION 2.\n- 911 (1): T1 2.5, T2 6, E SUS 8, T3 6. CP3A-M (3) GAIN 1 at 7, MASTER 8.',
        set: { 'm921b_2.frequency': 0.08, 'cp3am_1.gain1': 6, 'cp3am_1.gain2': 6, 'cp3am_1.master': 8, 'm904a.fixed_cv': 0, 'm904a.regeneration': 2,
          'm911_1.t1': 2.5, 'm911_1.t2': 6, 'm911_1.esus': 8, 'm911_1.t3': 6, 'cp3am_3.gain1': 7, 'cp3am_3.master': 8 },
        cables: [['j.cm1a.cv_1', 'j.cp35.mult_b'], ['j.cp35.mult_b_out_1', 'j.m921a_1.freq_in_1'], ['j.cp35.mult_b_out_2', 'j.m921a_2.freq_in_1'],
          ['j.m921a_1.freq_out', 'j.m921b_1.freq_link'], ...LINK2, ['j.m921b_1.sawtooth', 'j.cp3am_1.in1'], ['j.m921b_2.sawtooth', 'j.cp3am_1.in2'],
          ['j.cp3am_1.out_pos_1', 'j.m904a.sig_in'], ['j.m904a.sig_out', 'j.m902_1.sig_in_pos'], ['j.m902_1.out_pos', 'j.cp3am_3.in1'], ['j.cp3am_3.out_pos_1', 'j.out.l'],
          ['j.cm1a.trig_upper', 'j.cp35.mult_a'], ['j.cp35.mult_a_out_1', 'j.m911_1.strig'], ['j.m911_1.out', 'j.m902_1.cv_1']] },
      { title: 'A fifth that waits', module: 'env',
        why: 'Bank 2 a fifth up (921A (2) on SEMITONE, FREQUENCY +3.5 = 7 semitones), through the 904B (left open) and the second 902. Its 911 is fired through the 911A.\n- 921A (2) SEMITONE, FREQUENCY 3.5. 921B (5) +0.1.\n- CP3A-M (2) GAIN 1 and 2 at 5, MASTER 8. 904B FIXED CONTROL VOLTAGE −6.\n- 911A upper DELAY TIME 7.3 (about 1 second). 911 (2): T1 7, T2 7, E SUS 9, T3 6.5.\n- CP3A-M (3) GAIN 2 at 6.\n- Listen for: the long notes swell into a fifth; the short ones do not.',
        set: { 'm921a_2.scale': 'semitone', 'm921a_2.frequency': 3.5, 'm921b_5.frequency': 0.1, 'cp3am_2.gain1': 5, 'cp3am_2.gain2': 5, 'cp3am_2.master': 8, 'm904b.fixed_cv': -6,
          'm911a.delay_1': 7.3, 'm911_2.t1': 7, 'm911_2.t2': 7, 'm911_2.esus': 9, 'm911_2.t3': 6.5, 'cp3am_3.gain2': 6 },
        cables: [...BANK2, ['j.m921b_4.sawtooth', 'j.cp3am_2.in1'], ['j.m921b_5.sawtooth', 'j.cp3am_2.in2'], ['j.cp3am_2.out_pos_1', 'j.m904b.sig_in'],
          ['j.m904b.sig_out', 'j.m902_2.sig_in_pos'], ['j.m902_2.out_pos', 'j.cp3am_3.in2'], ['j.cp35.mult_a_out_2', 'j.m911a.strig_1'], ['j.m911a.strig_out_1', 'j.m911_2.strig'],
          ['j.m911_2.out', 'j.m902_2.cv_1']] },
    ],
    context: {
      'm911a.delay_1': 'In this sound: how long a note must be held before the fifth comes in.',
      'm911_2.t1': 'In this sound: how slowly the fifth swells in once it starts.',
    },
    tweaks: [
      { id: 'm911a.delay_1', try: 'Turn DELAY TIME down to 4', hear: 'Almost every note gets the fifth, just after its start.' },
      { id: 'm921a_2.frequency', try: 'Set the second 921A’s FREQUENCY to 2', hear: 'A major third instead: sweeter, more like a chord.' },
    ],
  },
];
