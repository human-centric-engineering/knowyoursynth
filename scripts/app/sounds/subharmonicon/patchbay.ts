/**
 * Thirty sounds built on the patchbay (`f-own-sequencer` t-290): each one's character is a cable, into the inputs the
 * first library left alone (RHYTHM, SUB, PWM, PLAY, RESET, VCA) or from the outputs it left alone (CLOCK OUT, VCA OUT,
 * the envelopes, VCO 2 slowed into an LFO). Each names the sound it follows, so `families.ts` places them through the
 * library rather than at its end.
 *
 * Volts as the hardware's, and as `subharm-core.ts` reads them: a VCO or sub OUT is ±5 V, an envelope 0 to +8 V, CLOCK
 * OUT 0 to +10 V, SEQ OUT a volt an octave of its step; a volt at a SUB or RHYTHM input moves the divisor by 1.5.
 */
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import {
  div,
  keyLine,
  notes,
  play,
  rhythms,
  seq,
  shape,
  step,
  vco,
} from '@/scripts/app/sounds/subharmonicon/kit';

/** A sound and the library sound it follows. */
export interface Insert {
  after: string;
  sound: SoundSpec;
}

/**
 * VCO 2 slowed into an LFO: Sequencer 2, assigned to nothing, all four steps fully down at SEQ OCT ±5, puts −5 V on SEQ
 * 2 OUT; patched into VCO 2's input it drops VCO 2 five octaves, to about 8 Hz at FREQ 0, and its subs to between 4 Hz and half a hertz.
 */
const LFO_SET: ControlValues = { 'seq.oct': 5, ...seq(2, [-5, -5, -5, -5], {}) };
const LFO_CABLE: CablePair = ['j.seq2_out', 'j.vco2_in'];
const LFO_WHY =
  'SEQ OCT ±5 and Sequencer 2’s steps fully down, assigned to nothing: SEQ 2 OUT is a steady −5 V. Patched into VCO 2’s input it drops VCO 2 five octaves, to about 8 Hz at the held C4 (a key transposes it, so another key moves the rate too), and its subs from about 4 Hz down to half a hertz, by their divisor. VCO 2 is not in the mix: it is a slow wave now, not a voice.';

export const PATCHBAY: Insert[] = [
  // ── polyrhythm ──
  {
    after: 'shc-two-against-three',
    sound: {
      id: 'shc-coin-toss-rhythm',
      name: 'Coin-Toss Rhythm',
      ref: 'In the style of a Buchla random-voltage rhythm',
      artist: 'West Coast synthesis',
      tags: ['seq', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'A rhythm thrown like a coin: VCO 2 at audio rate in RHYTHM 1, so each clock lands on a different divisor.',
      how: 'A RHYTHM input is read at each clock. Feed it VCO 2 at audio rate and it reads wherever VCO 2’s wave happens to be: a different divisor on every sixteenth, from ÷1 to about ÷10. Whether Rhythm 1 fires is a coin toss, a little better than even, so the melody plays a rhythm that keeps changing and almost never repeats. VCO 2’s FREQ is the coin: it sits between notes, with QUANTIZE off, so its cycles never line up with the clock; move it and the rhythm changes.',
      bpm: 112,
      steps: [
        {
          title: 'One voice',
          module: 'osc',
          why: 'VCO 1 square at C4 with its octave sub; VCO 2 silent, just under G4.',
          set: {
            ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
            ...vco(2, { levels: [0, 0, 0] }),
            'vco2.freq': 1.45,
          },
          listen: 'with a key held, a hollow square.',
        },
        {
          title: 'A rhythm to throw',
          module: 'mod',
          why: 'Rhythm 1 at ÷3 on Sequencer 1.',
          set: rhythms({ 1: [3, true, false] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'The coin',
          module: 'mod',
          why: 'VCO 2 OUT into RHYTHM 1’s input: ±5 V moves the divisor up to seven either way of ÷3, a new one each clock.',
          cables: [['j.vco2_out', 'j.rhythm1_in']],
          listen: 'still waiting.',
        },
        {
          title: 'The notes',
          module: 'mod',
          why: 'QUANTIZE off, so VCO 2 stays between notes; at ±1 Sequencer 1 C, E♭, G, B♭, each set to within a cent.',
          set: {
            'seq.oct': 1,
            ...seq(1, [0, step(3), step(7), step(10)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.6, res: 3, amt: 2.4, fd: 3.6, ad: 4.2 }), ...play() },
          listen: 'a four-note melody stuttering in bursts and gaps, never the same bar twice.',
        },
      ],
      context: {
        'vco2.freq':
          'In this sound: not heard; where its wave is at each clock decides whether a note plays.',
        'rhythm1.div': 'In this sound: the centre the coin throws around: lower is busier.',
      },
      tweaks: [
        {
          id: 'vco2.freq',
          try: 'Turn VCO 2 FREQ to 2.95',
          hear: 'A new throw of the coin: another rhythm, just as restless.',
        },
        {
          id: 'rhythm1.div',
          try: 'Turn RHYTHM 1 to ÷9',
          hear: 'The coin falls on no more often: sparse notes with long gaps.',
        },
      ],
    },
  },
  {
    after: 'shc-five-against-seven',
    sound: {
      id: 'shc-accelerando',
      name: 'Accelerando',
      ref: 'In the style of Conlon Nancarrow’s tempo canons',
      artist: 'Conlon Nancarrow',
      tags: ['seq', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'A melody that speeds up through every bar over a steady beat: a slow wave patched into RHYTHM 1.',
      how: 'Nancarrow wrote player-piano canons whose voices run at tempos that speed up against each other. Here VCO 2, slowed into an LFO by Sequencer 2’s steady −5 V, sends its deepest sub’s rising sawtooth into RHYTHM 1: the divisor falls from ÷16 to ÷1 over about two seconds, so Sequencer 1’s notes accelerate from a bar apart to sixteenths, then snap back. Rhythm 4 keeps the beat on Sequencer 2, which is held, so it fires the envelopes without moving anything.',
      bpm: 120,
      steps: [
        {
          title: 'One voice',
          module: 'osc',
          why: 'VCO 1 square at C5 with its octave sub.',
          set: vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          listen: 'with a key held, a bright, hollow tone.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 2 at ÷16 rises once about every two seconds, a bar at this tempo.`,
          set: { ...LFO_SET, 'sub22.div': 16 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'The rhythm speeds up',
          module: 'mod',
          why: 'Rhythm 1 centred at ÷8 on Sequencer 1, and VCO 2 SUB 2 OUT into RHYTHM 1’s input; Rhythm 4 at ÷4 on Sequencer 2 keeps the beat.',
          set: rhythms({ 1: [8, true, false], 4: [4, false, true] }),
          cables: [['j.sub22_out', 'j.rhythm1_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'The notes',
          module: 'mod',
          why: '12-ET; at SEQ OCT ±5 a small turn is a step: Sequencer 1 C, D, E, G.',
          set: {
            'vco.quantize': '12-ET',
            ...seq(1, [0, step(2, 5), step(4, 5), step(7, 5)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.8, res: 3, amt: 2.4, fd: 3.4, ad: 4 }), ...play() },
          listen:
            'a beat on every crotchet, and over it a melody that rushes faster and faster, then starts slow again.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: how often the melody speeds up; ÷16 is about a bar.',
        'rhythm1.div': 'In this sound: the middle of the rush.',
        'vco2.freq': 'In this sound: the slow wave’s rate, drifting against the beat.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷8',
          hear: 'Two rushes a bar: a breathless, lurching melody.',
        },
        {
          id: 'vco2.wave',
          try: 'Set VCO 2 WAVE to square',
          hear: 'No rush between: the melody jumps from dead slow to sixteenths and back.',
        },
      ],
    },
  },
  {
    after: 'shc-never-twice',
    sound: {
      id: 'shc-feedback-rhythms',
      name: 'Feedback Rhythms',
      ref: 'In the style of generative music',
      artist: 'Generative music',
      tags: ['seq', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'Each sequencer’s notes set the other one’s rhythm: two melodies that drive each other’s pace.',
      how: 'SEQ 1 OUT patched into RHYTHM 3, which drives Sequencer 2, and SEQ 2 OUT into RHYTHM 1, which drives Sequencer 1. A high note on one sequencer speeds the other up, a low one slows it, and the second’s new note changes the first’s pace in turn. Nothing is random, yet the loop takes a long time to come round.',
      bpm: 96,
      steps: [
        {
          title: 'Two voices',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at G4 with SUB 2 at ÷4.',
          set: {
            ...vco(1, { subs: [2, 3], levels: [4, 2, 0] }),
            ...vco(2, { note: 'G4', wave: 'square', subs: [2, 4], levels: [3, 0, 2] }),
          },
          listen: 'with a key held, a fifth over a low root.',
        },
        {
          title: 'Two rhythms',
          module: 'mod',
          why: 'Rhythm 1 at ÷4 on Sequencer 1, Rhythm 3 at ÷6 on Sequencer 2.',
          set: rhythms({ 1: [4, true, false], 3: [6, false, true] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'Two melodies',
          module: 'mod',
          why: '8-ET at SEQ OCT ±2: Sequencer 1 C, G, E an octave up, D below; Sequencer 2 on VCO 2, G, G an octave up, D an octave and a fifth up, G below.',
          set: {
            'vco.quantize': '8-ET',
            ...seq(1, [0, step(7, 2), step(16, 2), step(-10, 2)]),
            ...seq(2, [0, step(12, 2), step(19, 2), step(-12, 2)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Cross the rhythms',
          module: 'mod',
          why: 'SEQ 1 OUT into RHYTHM 3’s input, SEQ 2 OUT into RHYTHM 1’s: each note moves the other sequencer’s divisor, up to two either way.',
          cables: [
            ['j.seq1_out', 'j.rhythm3_in'],
            ['j.seq2_out', 'j.rhythm1_in'],
          ],
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.6, res: 2.5, amt: 2.4, fd: 3.8, ad: 4.6 }), ...play() },
          listen:
            'two lines pushing and holding each other back, the tempo of each changing with every note.',
        },
      ],
      context: {
        'seq2.step3':
          'In this sound: the highest note on Sequencer 2, and Sequencer 1’s fastest pace.',
        'rhythm1.div': 'In this sound: Sequencer 1’s pace, before Sequencer 2 moves it.',
        'rhythm3.div': 'In this sound: Sequencer 2’s pace, before Sequencer 1 moves it.',
      },
      tweaks: [
        {
          id: 'seq2.step4',
          try: 'Turn SEQ 2 STEP 4 to 0',
          hear: 'Sequencer 1 loses its slowest beat: a busier, tighter loop.',
        },
        {
          id: 'rhythm3.div',
          try: 'Turn RHYTHM 3 to ÷3',
          hear: 'Sequencer 2 runs fast, so Sequencer 1’s pace changes almost every sixteenth.',
        },
      ],
    },
  },

  // ── the undertone series ──
  {
    after: 'shc-falling-divisors',
    sound: {
      id: 'shc-undertone-staircase',
      name: 'Undertone Staircase',
      ref: 'In the style of Harry Partch’s undertone scales',
      artist: 'Harry Partch',
      tags: ['seq', 'patch', 'undertones'],
      level: 3,
      blurb:
        'The subs climb the undertone series step by step, again and again: a slow wave in VCO 1 SUB.',
      how: 'Partch built his scales from the undertone series as well as the overtones. A sub plays it one divisor at a time; patch a slow rising wave into VCO 1’s SUB input and both subs climb it continuously, from ÷16 up towards the VCO’s own pitch, then fall back and climb again: a staircase of undertones, each tread a just interval. Sequencer 1 moves VCO 1 once a bar, so the staircase starts from a new root.',
      bpm: 80,
      steps: [
        {
          title: 'Subs centred',
          module: 'osc',
          why: 'VCO 1 sawtooth at C5, quiet, with its subs centred at ÷8 and ÷12 and loud.',
          set: vco(1, { note: 'C5', subs: [8, 12], levels: [2, 5, 4] }),
          listen: 'with a key held, a low chord under a quiet C5.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 2 at ÷16 rises once every two seconds or so.`,
          set: { ...LFO_SET, 'sub22.div': 16 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'Climb',
          module: 'osc',
          why: 'VCO 2 SUB 2 OUT into VCO 1’s SUB input: −5 to +5 V moves both divisors seven either way, high to low, so the pitch climbs.',
          cables: [['j.sub22_out', 'j.vco1_sub_in']],
          listen: 'with a key held, the subs climbing a staircase and starting again.',
        },
        {
          title: 'A root a bar',
          module: 'mod',
          why: '12-ET; Rhythm 4 at ÷16 on Sequencer 1, which moves VCO 1 to C, A♭, F, G below.',
          set: {
            'vco.quantize': '12-ET',
            ...rhythms({ 4: [16, true, false] }),
            ...seq(1, [0, step(-4, 5), step(-7, 5), step(-5, 5)]),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'filter',
          why: 'A warm filter, EG held so the staircase never stops, and PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 6, res: 2 }), ...play('held') },
          listen: 'endless climbing undertones, from a new root each bar.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: how fast the staircase climbs.',
        'sub11.div': 'In this sound: the middle of SUB 1’s climb.',
        'sub12.div': 'In this sound: the middle of SUB 2’s climb, deeper, so it reaches less high.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷8',
          hear: 'Twice as fast: a quick undertone run.',
        },
        {
          id: 'vco2.wave',
          try: 'Set VCO 2 WAVE to square',
          hear: 'No staircase: the subs jump between the top and the bottom.',
        },
      ],
    },
  },
  {
    after: 'shc-divisor-bells',
    sound: {
      id: 'shc-undertone-zap',
      name: 'Undertone Zap',
      ref: 'In the style of a chiptune arpeggio',
      artist: 'Chiptune',
      tags: ['pluck', 'patch', 'undertones'],
      level: 2,
      blurb:
        'Every note tumbles down the undertone series as it fades: the VCA EG patched into VCO 1 SUB.',
      how: 'An envelope at a SUB input lowers the divisors while it is high. Patch the VCA EG there with the subs at ÷16 and ÷13: each note starts at ÷4 and ÷1, as high as the envelope can push them, and steps down the undertones as it decays, a quick falling run inside every note. Sequencer 1 plays a two-against-three melody on VCO 1.',
      bpm: 128,
      steps: [
        {
          title: 'Subs only',
          module: 'osc',
          why: 'VCO 1 square at C6, silent; SUB 1 at ÷16 loud, SUB 2 at ÷13 quieter.',
          set: vco(1, { note: 'C6', wave: 'square', subs: [16, 13], levels: [0, 5, 3] }),
          listen: 'with a key held, a low square.',
        },
        {
          title: 'Each note falls',
          module: 'env',
          why: 'VCA EG OUT into VCO 1’s SUB input: its 8 V lowers the divisors by twelve, so each note starts high and steps down as it fades.',
          set: shape({ cutoff: 7, ad: 5 }),
          cables: [['j.vca_eg_out', 'j.vco1_sub_in']],
          listen: 'with a key tapped, a note that tumbles down the undertones.',
        },
        {
          title: 'Two against three',
          module: 'mod',
          why: 'Rhythm 2 at ÷2 and Rhythm 3 at ÷3, both on Sequencer 1.',
          set: rhythms({ 2: [2, true, false], 3: [3, true, false] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'The notes',
          module: 'mod',
          why: '12-ET at ±5: Sequencer 1 C, G, E♭, B♭ below.',
          set: {
            'seq.oct': 5,
            'vco.quantize': '12-ET',
            ...seq(1, [0, step(7, 5), step(3, 5), step(-2, 5)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Play',
          module: 'mod',
          why: 'PLAY lit, on the app’s clock.',
          set: play(),
          listen: 'a skittering melody, each note a little falling arpeggio.',
        },
      ],
      context: {
        'vca_eg.decay': 'In this sound: how long each fall takes.',
        'sub11.div': 'In this sound: where SUB 1’s fall ends, two octaves under its first note.',
      },
      tweaks: [
        {
          id: 'vca_eg.decay',
          try: 'Turn VCA DECAY to 7',
          hear: 'Long, slow tumbles that run into the next note.',
        },
        {
          id: 'sub11.div',
          try: 'Turn VCO 1 SUB 1 FREQ to ÷10',
          hear: 'A shorter fall: the run starts at the top and ends sooner.',
        },
      ],
    },
  },
  {
    after: 'shc-undertone-chorale',
    sound: {
      id: 'shc-four-divisor-chords',
      name: 'Four-Divisor Chords',
      ref: 'In the style of ambient chord changes',
      artist: 'Ambient music',
      tags: ['pad', 'patch', 'undertones'],
      level: 3,
      blurb:
        'One sequencer changes all four subs at once: a chord progression from a single cable.',
      how: 'Sequencer 2 assigned to VCO 2’s subs moves two divisors. Patch SEQ 2 OUT into VCO 1’s SUB input and it moves VCO 1’s two as well: four notes of undertone harmony changing together, once a bar. Sequencer 1, assigned to nothing, pulses the chords in quavers.',
      bpm: 84,
      steps: [
        {
          title: 'Four subs',
          module: 'osc',
          why: 'VCO 1 sawtooth at C5 with subs at ÷4 and ÷5; VCO 2 sawtooth at G4 with subs at ÷3 and ÷4. Only the subs sound.',
          set: {
            ...vco(1, { note: 'C5', subs: [4, 5], levels: [0, 4, 3] }),
            ...vco(2, { note: 'G4', subs: [3, 4], levels: [0, 4, 3] }),
          },
          listen: 'with a key held, a four-note chord.',
        },
        {
          title: 'The changes',
          module: 'mod',
          why: 'SEQ OCT ±5 with Sequencer 2 on VCO 2’s subs: divisors as they are, two higher, one lower, one higher.',
          set: {
            'seq.oct': 5,
            ...seq(2, [0, div(-2), div(1), div(-1)], { sub1: true, sub2: true }),
          },
          listen: 'still the first chord.',
        },
        {
          title: 'VCO 1’s subs follow',
          module: 'osc',
          why: 'SEQ 2 OUT into VCO 1’s SUB input: VCO 1’s divisors move with VCO 2’s.',
          cables: [['j.seq2_out', 'j.vco1_sub_in']],
          listen: 'still the first chord.',
        },
        {
          title: 'A chord a bar, pulsing',
          module: 'mod',
          why: 'Rhythm 4 at ÷16 on Sequencer 2, a chord a bar; Rhythm 2 at ÷2 on Sequencer 1, assigned to nothing, fires the envelopes in quavers.',
          set: {
            ...rhythms({ 2: [2, true, false], 4: [16, false, true] }),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Soften and play',
          module: 'env',
          why: 'A gentle attack and decay under a low filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.6, res: 1.5, aa: 2, ad: 5 }), ...play() },
          listen: 'pulsing undertone chords, all four voices moving to a new one each bar.',
        },
      ],
      context: {
        'seq2.step2': 'In this sound: the darkest chord, every divisor two higher.',
        'rhythm4.div': 'In this sound: how long each chord lasts.',
      },
      tweaks: [
        {
          id: 'rhythm4.div',
          try: 'Turn RHYTHM 4 to ÷8',
          hear: 'A chord every half bar: a quicker progression.',
        },
        {
          id: 'seq2.step3',
          try: 'Turn SEQ 2 STEP 3 to 2.05',
          hear: 'The third chord lifts: every divisor three lower, so every sub higher.',
        },
      ],
    },
  },

  // ── keys ──
  {
    after: 'shc-trautonium-lead',
    sound: {
      id: 'shc-audio-pwm-lead',
      name: 'Audio-Rate PWM Lead',
      ref: 'In the style of a 1970s progressive-rock synth lead',
      artist: 'Progressive rock',
      tags: ['lead', 'patch', 'pwm'],
      level: 2,
      blurb:
        'A vocal, buzzing lead: silent VCO 1 a fifth up, patched into VCO 2’s PWM at audio rate.',
      how: 'A pulse width swept at audio rate adds sidebands, as FM does. VCO 1 OUT into VCO 2’s PWM, with VCO 1 a fifth above and silent: VCO 2’s width moves three times for every two of its cycles, giving a nasal, vowel-like tone that stays the same up and down the keys, since both VCOs follow them. Detune VCO 1 and the tone starts to move.',
      bpm: 104,
      riff: notes([
        [0, 'C4', 0.5],
        [0.5, 'Eb4', 0.5],
        [1, 'G4', 1],
        [2, 'F4', 0.5],
        [2.5, 'Eb4', 0.5],
        [3, 'C4', 0.9],
      ]),
      steps: [
        {
          title: 'The voice',
          module: 'osc',
          why: 'VCO 2 square at C4, loud; VCO 1 out of the mix, at G4.',
          set: {
            ...vco(1, { note: 'G4', levels: [0, 0, 0] }),
            ...vco(2, { wave: 'square', levels: [6, 0, 0] }),
          },
          listen: 'with a key, a plain square.',
        },
        {
          title: 'Width at audio rate',
          module: 'osc',
          why: 'VCO 1 OUT into VCO 2’s PWM input.',
          cables: [['j.vco1_out', 'j.vco2_pwm']],
          listen: 'with a key, a buzzing, nasal tone.',
        },
        {
          title: 'Lead shape',
          module: 'filter',
          why: 'The filter a little closed with some bite from the VCF EG, and a long VCA decay held by the key.',
          set: shape({ cutoff: 6, res: 2, amt: 1.5, fd: 4, ad: 6 }),
          listen: 'with a key, a singing, reedy lead.',
        },
      ],
      context: {
        'vco1.freq': 'In this sound: not heard; its interval to VCO 2 sets the tone.',
      },
      tweaks: [
        {
          id: 'vco1.freq',
          try: 'Turn VCO 1 FREQ to 1.6',
          hear: 'VCO 1 just off the fifth: the tone churns and phases.',
        },
        {
          id: 'vco1.freq',
          try: 'Turn VCO 1 FREQ to 2.5',
          hear: 'An octave up: a thinner, cleaner tone.',
        },
      ],
    },
  },
  {
    after: 'shc-sub-stack-bass',
    sound: {
      id: 'shc-feedback-snarl',
      name: 'Feedback Snarl',
      ref: 'In the style of a distorted industrial bass',
      artist: 'Industrial music',
      tags: ['bass', 'patch'],
      level: 2,
      blurb: 'A bass that bites itself: VCA OUT patched back into CUTOFF.',
      how: 'Patch the synth’s own output into CUTOFF and the filter opens on every peak of the sound passing through it: feedback filter FM, a growl that follows the note and grows with the level. VOLUME now sets how hard it snarls as well as how loud it is.',
      bpm: 92,
      riff: notes([
        [0, 'C3', 0.4],
        [0.5, 'C3', 0.2],
        [0.75, 'C3', 0.2],
        [1, 'Eb3', 0.4],
        [2, 'C3', 0.4],
        [2.5, 'Bb2', 0.4],
        [3, 'G2', 0.8],
      ]),
      steps: [
        {
          title: 'A saw bass',
          module: 'osc',
          why: 'VCO 1 sawtooth with its octave sub.',
          set: vco(1, { subs: [2, 3], levels: [4, 4, 0] }),
          listen: 'with a key, a plain saw bass.',
        },
        {
          title: 'A closed filter',
          module: 'filter',
          why: 'The filter low with an envelope and a little resonance.',
          set: shape({ cutoff: 3.5, res: 3, amt: 2, fd: 4, ad: 5 }),
          listen: 'with a key, a dark, plucked bass.',
        },
        {
          title: 'Feed it back',
          module: 'filter',
          why: 'VCA OUT into the CUTOFF input.',
          cables: [['j.vca_out', 'j.cutoff_in']],
          listen: 'with a key, a snarling, gritty bass.',
        },
      ],
      context: {
        'vca.volume': 'In this sound: the snarl’s depth as well as the level.',
        'vcf.cutoff': 'In this sound: where the snarl starts from.',
      },
      tweaks: [
        {
          id: 'vca.volume',
          try: 'Turn VOLUME to 4',
          hear: 'Quieter and cleaner: the feedback eases off.',
        },
        {
          id: 'vcf.resonance',
          try: 'Turn RESONANCE to 6',
          hear: 'The snarl screams: a squealing, unstable growl.',
        },
      ],
    },
  },
  {
    after: 'shc-bowed-undertones',
    sound: {
      id: 'shc-undertone-bloom',
      name: 'Undertone Bloom',
      ref: 'In the style of Gérard Grisey’s spectral music',
      artist: 'Gérard Grisey',
      tags: ['pad', 'patch', 'undertones'],
      level: 2,
      blurb:
        'A pad whose upper chord climbs the undertone series as it swells: the VCA EG into VCO 2 SUB.',
      how: 'Grisey’s spectral music builds harmony from the series of a single note. Here VCO 2’s subs, centred deep at ÷12 and ÷16, are pushed up the undertone series by the VCA EG on a slow attack: as each note swells the chord above it climbs, step by just step, and as the note is let go it sinks back. VCO 1 holds the root steady underneath.',
      bpm: 60,
      riff: notes([
        [0, 'C4', 3.8],
        [4, 'Ab3', 3.8],
      ]),
      steps: [
        {
          title: 'A root',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with subs at ÷2 and ÷3.',
          set: vco(1, { subs: [2, 3], levels: [3, 2, 2] }),
          listen: 'with a key, a steady chord.',
        },
        {
          title: 'A deep upper chord',
          module: 'osc',
          why: 'VCO 2 square at C5, silent, its subs at ÷12 and ÷16 in the mix.',
          set: vco(2, { note: 'C5', wave: 'square', subs: [12, 16], levels: [0, 3, 3] }),
          listen: 'with a key, a low rumble added.',
        },
        {
          title: 'A slow swell',
          module: 'env',
          why: 'A slow VCA attack and a long decay under a soft filter.',
          set: shape({ cutoff: 5, res: 1.5, aa: 6, ad: 7 }),
          listen: 'with a key held, a slow swell.',
        },
        {
          title: 'Bloom',
          module: 'osc',
          why: 'VCA EG OUT into VCO 2’s SUB input: as the envelope rises, VCO 2’s divisors fall and its subs climb.',
          cables: [['j.vca_eg_out', 'j.vco2_sub_in']],
          listen:
            'with a key held, the upper chord climbing as it swells, and sinking as you let go.',
        },
      ],
      context: {
        'vca_eg.attack': 'In this sound: how slowly the chord climbs.',
        'sub22.div': 'In this sound: the deepest the bloom starts from.',
      },
      tweaks: [
        {
          id: 'vca_eg.attack',
          try: 'Turn VCA ATTACK to 3',
          hear: 'A quick bloom: the chord races up as the note starts.',
        },
        {
          id: 'sub21.div',
          try: 'Turn VCO 2 SUB 1 FREQ to ÷16',
          hear: 'Both subs start deep: a longer, darker climb.',
        },
      ],
    },
  },
  {
    after: 'shc-glass-divisions',
    sound: {
      id: 'shc-filter-fm-piano',
      name: 'Filter-FM Piano',
      ref: 'In the style of a 1980s metallic electric piano',
      artist: '1980s pop',
      tags: ['keys', 'patch'],
      level: 2,
      blurb:
        'A bright, clanging electric piano: silent VCO 2 a ninth up, shaking the filter at audio rate.',
      how: 'VCO 2 OUT into CUTOFF opens and closes the filter at VCO 2’s pitch. At a ninth above VCO 1, a ratio that is not a whole number, that adds sidebands that clash a little with the note: the metallic tine of an electric piano. Both VCOs follow the keys, so the clang stays the same up and down.',
      bpm: 92,
      riff: notes([
        [0, 'E4', 0.9],
        [1, 'G4', 0.4],
        [1.5, 'C5', 1.4],
        [3, 'B4', 0.4],
        [3.5, 'G4', 0.4],
      ]),
      steps: [
        {
          title: 'A soft tone',
          module: 'osc',
          why: 'VCO 1 square at C4 with its octave sub; VCO 2 silent at D5.',
          set: {
            ...vco(1, { wave: 'square', subs: [2, 3], levels: [5, 2, 0] }),
            ...vco(2, { note: 'D5', levels: [0, 0, 0] }),
          },
          listen: 'with a key, a hollow tone.',
        },
        {
          title: 'A struck shape',
          module: 'filter',
          why: 'A low filter opened by the VCF EG, and a long VCA decay.',
          set: shape({ cutoff: 4.4, res: 1, amt: 2, fd: 4, ad: 6 }),
          listen: 'with a key, a soft, plucked note.',
        },
        {
          title: 'The tine',
          module: 'filter',
          why: 'VCO 2 OUT into the CUTOFF input.',
          cables: [['j.vco2_out', 'j.cutoff_in']],
          listen: 'with a key, a bright, metallic clang that softens as it fades.',
        },
      ],
      context: {
        'vco2.freq': 'In this sound: not heard; its interval to VCO 1 sets the clang.',
        'vcf.cutoff': 'In this sound: how much of the clang comes through.',
      },
      tweaks: [
        {
          id: 'vco2.freq',
          try: 'Turn VCO 2 FREQ to 2.5',
          hear: 'An octave up, a whole-number ratio: a smoother, organ-like tone.',
        },
        {
          id: 'vcf.cutoff',
          try: 'Turn CUTOFF to 6',
          hear: 'A harsher, ringing bell.',
        },
      ],
    },
  },
  {
    after: 'shc-pulse-choir',
    sound: {
      id: 'shc-nasal-clav',
      name: 'Nasal Clav',
      ref: 'In the style of a funk clavinet',
      artist: 'Funk',
      tags: ['keys', 'patch', 'pwm'],
      level: 2,
      blurb:
        'A pluck that starts thin and nasal and opens out: the VCA EG patched into VCO 1’s pulse width.',
      how: 'A clavinet’s strike is thin and buzzy before it settles. VCA EG OUT into VCO 1 PWM pushes the width towards its thinnest at the peak of each note and lets it widen back to a square as it fades, so every note has a nasal bite that rounds off, faster on a short note than a long one.',
      bpm: 100,
      riff: notes([
        [0, 'C4', 0.2],
        [0.5, 'C4', 0.2],
        [0.75, 'Eb4', 0.2],
        [1, 'F4', 0.4],
        [1.75, 'C4', 0.2],
        [2, 'Bb3', 0.2],
        [2.5, 'C4', 0.4],
        [3.25, 'G3', 0.2],
        [3.5, 'Bb3', 0.4],
      ]),
      steps: [
        {
          title: 'A pulse',
          module: 'osc',
          why: 'VCO 1 square at C4 with its octave sub on square too.',
          set: vco(1, { wave: 'square', subs: [2, 3], levels: [5, 2, 0] }),
          listen: 'with a key, a hollow square.',
        },
        {
          title: 'A short pluck',
          module: 'env',
          why: 'A fairly open filter with a little VCF EG, and a short VCA decay.',
          set: shape({ cutoff: 6.4, res: 2, amt: 1.2, fd: 3, ad: 4 }),
          listen: 'with a key, a short square pluck.',
        },
        {
          title: 'Thin at the strike',
          module: 'osc',
          why: 'VCA EG OUT into VCO 1’s PWM input: the width is thinnest at each note’s peak and widens as it fades.',
          cables: [['j.vca_eg_out', 'j.vco1_pwm']],
          listen: 'with a key, a nasal, buzzing strike that rounds off.',
        },
      ],
      context: {
        'vca_eg.decay': 'In this sound: how quickly the bite rounds off.',
      },
      tweaks: [
        {
          id: 'vca_eg.decay',
          try: 'Turn VCA DECAY to 6',
          hear: 'The nasal edge lingers: a slower, wah-like opening.',
        },
        {
          id: 'vco1.wave',
          try: 'Set VCO 1 WAVE to saw',
          hear: 'The cable has nothing to thin: a plain saw pluck.',
        },
      ],
    },
  },

  // ── transposed ──
  {
    after: 'shc-rubycon-pulse',
    sound: {
      id: 'shc-trance-gate',
      name: 'Trance Gate',
      ref: 'In the style of a 1990s trance gate',
      artist: 'Trance',
      tags: ['pad', 'patch', 'transposed'],
      level: 2,
      blurb:
        'A chord chopped into sixteenths: CLOCK OUT patched into the VCA, while the keys change the chord.',
      how: 'CLOCK OUT is high for the first half of every clock, a sixteenth here. Patch it into the VCA input with EG off and it opens the VCA for half of every sixteenth: the gated pad of 1990s trance, locked to the app’s clock. The key line changes the chord, and each change fires the envelopes, giving it a brighter edge.',
      bpm: 136,
      riff: keyLine(['C4', 'Ab3', 'F3', 'G3'], 4),
      steps: [
        {
          title: 'A wide chord',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with subs at ÷2 and ÷3; VCO 2 sawtooth at E4 with its octave sub.',
          set: {
            ...vco(1, { subs: [2, 3], levels: [3, 3, 3] }),
            ...vco(2, { note: 'E4', subs: [2, 3], levels: [3, 2, 0] }),
          },
          listen: 'with a key, a major chord.',
        },
        {
          title: 'The gate',
          module: 'amp',
          why: 'CLOCK OUT into the VCA input: the VCA opens on the first half of every clock while the synth plays.',
          cables: [['j.clock_out', 'j.vca_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'A brighter edge',
          module: 'filter',
          why: 'The filter a little closed, with an envelope each chord change opens, and a short VCA EG.',
          set: shape({ cutoff: 5.6, res: 2, amt: 1.6, fd: 5, ad: 1 }),
          listen: 'with a key, a short chord.',
        },
        {
          title: 'EG off, play',
          module: 'mod',
          why: 'EG off, so only the keys fire the envelopes, and PLAY lit on the app’s clock.',
          set: play('off'),
          listen: 'a chord chopped into sixteenths, moving to a new one each bar.',
        },
      ],
      context: {
        'transport.eg':
          'In this sound: off, so the steps fire nothing and the gate is the clock alone.',
        'vcf.cutoff': 'In this sound: how bright the gated chord is.',
      },
      tweaks: [
        {
          id: 'vcf_eg.decay',
          try: 'Turn VCF DECAY to 8',
          hear: 'Each chord change opens a long, bright sweep over the gate.',
        },
        {
          id: 'transport.eg',
          try: 'Set EG to held',
          hear: 'The VCA is held open under the gate: the chop shrinks to a slight pulse.',
        },
      ],
    },
  },
  {
    after: 'shc-octave-bounce',
    sound: {
      id: 'shc-counter-bass',
      name: 'Counter-Bass',
      ref: 'In the style of a Berlin-school sequence',
      artist: 'Berlin school',
      tags: ['seq', 'patch', 'transposed'],
      level: 3,
      blurb:
        'A melody whose bass moves by its own intervals: SEQ 1 OUT patched back into VCO 1 SUB.',
      how: 'Sequencer 1 moves VCO 1, and its subs follow, so the bass usually moves with the melody. Patch SEQ 1 OUT into VCO 1’s SUB input too and each step also lowers the divisors: as the melody climbs by fourths, SUB 1 takes a different path below it, from C2 up to an A♭ two octaves and a fifth under the top note. The key line moves the whole figure.',
      bpm: 112,
      riff: keyLine(['C4', 'Bb3', 'Ab3', 'Bb3'], 4),
      steps: [
        {
          title: 'Melody and subs',
          module: 'osc',
          why: 'VCO 1 sawtooth at C5 with subs at ÷8 and ÷4.',
          set: vco(1, { note: 'C5', subs: [8, 4], levels: [3, 5, 2] }),
          listen: 'with a key, a high note over a deep sub.',
        },
        {
          title: 'Climbing fourths',
          module: 'mod',
          why: '12-ET at ±2; Rhythm 2 at ÷2 on Sequencer 1, moving VCO 1 by 0, 5, 10 and 15 semitones.',
          set: {
            'vco.quantize': '12-ET',
            ...rhythms({ 2: [2, true, false] }),
            ...seq(1, [0, step(5, 2), step(10, 2), step(15, 2)]),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'The bass moves on its own',
          module: 'osc',
          why: 'SEQ 1 OUT into VCO 1’s SUB input: each step lowers SUB 1’s divisor by up to two, to ÷8, ÷7, ÷7, ÷6.',
          cables: [['j.seq1_out', 'j.vco1_sub_in']],
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.4, res: 3, amt: 2.6, fd: 3.6, ad: 4.4 }), ...play() },
          listen:
            'a climbing quaver figure whose bass takes its own path, moving with each bar’s key.',
        },
      ],
      context: {
        'sub11.div': 'In this sound: the bass’s starting divisor; the cable lowers it from here.',
        'seq1.step4': 'In this sound: the top of the figure and the sub’s highest note.',
      },
      tweaks: [
        {
          id: 'sub11.div',
          try: 'Turn VCO 1 SUB 1 FREQ to ÷12',
          hear: 'The bass sinks lower and its path shifts.',
        },
        {
          id: 'seq.oct',
          try: 'Set SEQ OCT to ±5',
          hear: 'Huge leaps, and the bass jumps through the undertones with them.',
        },
      ],
    },
  },
  {
    after: 'shc-motorik',
    sound: {
      id: 'shc-clock-pump',
      name: 'Clock Pump',
      ref: 'In the style of a French house filter',
      artist: 'French house',
      tags: ['bass', 'patch', 'transposed'],
      level: 2,
      blurb: 'A bass whose filter flaps open on every sixteenth: CLOCK OUT patched into CUTOFF.',
      how: 'CLOCK OUT is +10 V for the first half of each clock. In the CUTOFF input that throws the filter wide open, then shuts it, every sixteenth: a pumping, filtered bass in time with the app’s clock. EG held keeps the note sounding; the key line changes it each bar.',
      bpm: 124,
      riff: keyLine(['C4', 'C4', 'Eb4', 'F4'], 4),
      steps: [
        {
          title: 'A thick bass',
          module: 'osc',
          why: 'VCO 1 sawtooth with subs at ÷2 and ÷4; VCO 2 sawtooth a hair above.',
          set: {
            ...vco(1, { subs: [2, 4], levels: [3, 4, 3] }),
            ...vco(2, { levels: [3, 0, 0] }),
            'vco2.freq': 0.03,
          },
          listen: 'with a key, a thick, beating bass.',
        },
        {
          title: 'A shut filter',
          module: 'filter',
          why: 'The filter nearly shut, with resonance.',
          set: shape({ cutoff: 2, res: 4 }),
          listen: 'with a key, a muffled bass.',
        },
        {
          title: 'The pump',
          module: 'filter',
          why: 'CLOCK OUT into the CUTOFF input: the filter opens on the first half of every clock while the synth plays.',
          cables: [['j.clock_out', 'j.cutoff_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'mod',
          why: 'EG held, PLAY lit, on the app’s clock.',
          set: play('held'),
          listen: 'a bass pumping bright and dark every sixteenth, a new note each bar.',
        },
      ],
      context: {
        'vcf.cutoff': 'In this sound: the closed half of each sixteenth.',
        'vcf.resonance': 'In this sound: the squelch as the filter snaps shut.',
      },
      tweaks: [
        {
          id: 'vcf.cutoff',
          try: 'Turn CUTOFF to 0',
          hear: 'Silence between: a staccato, chopped bass.',
        },
        {
          id: 'vcf.resonance',
          try: 'Turn RESONANCE to 7',
          hear: 'Each snap rings: an acid, chirping pump.',
        },
      ],
    },
  },

  // ── just intonation ──
  {
    after: 'shc-just-thirds-pulse',
    sound: {
      id: 'shc-width-sequencer',
      name: 'Width Sequencer',
      ref: 'In the style of La Monte Young’s just-tuned drones',
      artist: 'La Monte Young',
      tags: ['drone', 'patch', 'just intonation', 'pwm'],
      level: 3,
      blurb:
        'A just fifth whose upper voice changes vowel on every step: SEQ 2 OUT patched into VCO 2 PWM.',
      how: 'Young’s drones hold just intervals and let the timbre move. Sequencer 2, assigned to nothing, sends its steps from SEQ 2 OUT into VCO 2’s PWM: at SEQ OCT ±5 a step is its own volts, so the four steps are four pulse widths, from thin to hollow to thin the other way. The fifth never moves; its colour changes like a voice saying four vowels.',
      bpm: 72,
      steps: [
        {
          title: 'A just fifth',
          module: 'osc',
          why: '12-JI: VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at G4, snapped to a pure 3:2.',
          set: {
            'vco.quantize': '12-JI',
            ...vco(1, { subs: [2, 3], levels: [3, 3, 0] }),
            ...vco(2, { note: 'G4', wave: 'square', levels: [5, 0, 0] }),
          },
          listen: 'with a key held, a pure, still fifth.',
        },
        {
          title: 'Four widths',
          module: 'mod',
          why: 'SEQ OCT ±5; Sequencer 2, assigned to nothing, at −4, 0, +3 and −2.',
          set: { 'seq.oct': 5, ...seq(2, [-4, 0, 3, -2], {}) },
          listen: 'still the same fifth.',
        },
        {
          title: 'Into the width',
          module: 'osc',
          why: 'SEQ 2 OUT into VCO 2’s PWM input: −4 V is a thin pulse, 0 a square, +3 a pulse the other way.',
          cables: [['j.seq2_out', 'j.vco2_pwm']],
          listen: 'with a key held, the upper voice turning thin and reedy.',
        },
        {
          title: 'A step each beat',
          module: 'mod',
          why: 'Rhythm 4 at ÷4 on Sequencer 2.',
          set: rhythms({ 4: [4, false, true] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'filter',
          why: 'A warm filter, EG held, and PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 6, res: 2 }), ...play('held') },
          listen: 'a pure fifth whose top voice changes colour on every beat.',
        },
      ],
      context: {
        'seq2.step1': 'In this sound: the thinnest, reediest width.',
        'vco.quantize': 'In this sound: 12-JI, so the fifth is pure and beatless.',
      },
      tweaks: [
        {
          id: 'rhythm4.div',
          try: 'Turn RHYTHM 4 to ÷1',
          hear: 'A vowel each sixteenth: a chattering, talking drone.',
        },
        {
          id: 'seq2.step3',
          try: 'Turn SEQ 2 STEP 3 to 4.8',
          hear: 'The third vowel thins almost to nothing: a quiet, buzzing beat in the pattern.',
        },
      ],
    },
  },
  {
    after: 'shc-just-organum',
    sound: {
      id: 'shc-leslie-chorale',
      name: 'Leslie Chorale',
      ref: 'In the style of a gospel organ through a rotating speaker',
      artist: 'Gospel organ',
      tags: ['keys', 'patch', 'just intonation'],
      level: 3,
      blurb:
        'Just-tuned organ chords with a throbbing tremolo: a slowed VCO 2 patched into the VCA.',
      how: 'A rotating speaker throbs the level and the tone. Here VCO 2, slowed by Sequencer 2’s steady −5 V, sends SUB 1 at about 4 Hz into the VCA input, a tremolo over a held organ: VCO 2 SUB 1 FREQ is the speed switch, ÷16 a slow chorale, ÷1 a fast tremolo. Sequencer 1 changes VCO 1’s two subs once a bar in 12-JI, so the chords are pure.',
      bpm: 76,
      steps: [
        {
          title: 'An organ',
          module: 'osc',
          why: '12-JI: VCO 1 sawtooth at C5, its subs at ÷2 and ÷3, all three in the mix.',
          set: {
            'vco.quantize': '12-JI',
            ...vco(1, { note: 'C5', subs: [2, 3], levels: [3, 4, 4] }),
          },
          listen: 'with a key held, an open organ chord.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 1 at ÷2 runs at about 4 Hz.`,
          set: LFO_SET,
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'The speaker',
          module: 'amp',
          why: 'VCO 2 SUB 1 OUT into the VCA input.',
          cables: [['j.sub21_out', 'j.vca_in']],
          listen: 'with a key held, the organ throbbing.',
        },
        {
          title: 'A chord a bar',
          module: 'mod',
          why: 'Rhythm 4 at ÷16 on Sequencer 1, assigned to VCO 1’s subs: divisors as they are, one up, one down, two up.',
          set: {
            ...rhythms({ 4: [16, true, false] }),
            ...seq(1, [0, div(-1), div(1), div(-2)], { sub1: true, sub2: true }),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'filter',
          why: 'A warm filter, EG held so the organ sustains, and PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 6.4, res: 1 }), ...play('held') },
          listen: 'a throbbing organ, a new pure chord each bar.',
        },
      ],
      context: {
        'sub21.div': 'In this sound: the tremolo’s speed, like a rotating speaker’s switch.',
        'vco2.freq': 'In this sound: a finer speed control for the tremolo.',
      },
      tweaks: [
        {
          id: 'sub21.div',
          try: 'Turn VCO 2 SUB 1 FREQ to ÷16',
          hear: 'The slow chorale: a gentle swell every two seconds.',
        },
        {
          id: 'sub21.div',
          try: 'Turn VCO 2 SUB 1 FREQ to ÷1',
          hear: 'The fast tremolo: a quick, fluttering organ.',
        },
      ],
    },
  },

  // ── minimal ──
  {
    after: 'shc-in-c-cells',
    sound: {
      id: 'shc-hold-and-release',
      name: 'Hold and Release',
      ref: 'In the style of minimalist pulse music',
      artist: 'Minimalism',
      tags: ['seq', 'patch'],
      level: 3,
      blurb:
        'A melody that stalls on one repeated note, then runs: a slow square wave holding RESET.',
      how: 'A gate held at RESET keeps both sequencers on step 1 while the envelopes go on firing. Patch a slowed VCO 2’s square sub there and for half of each cycle the melody stalls on its first note, repeating it, then is let go to run through its four steps. The wave is free-running, so the stall falls in a different place in each bar.',
      bpm: 120,
      steps: [
        {
          title: 'A chord',
          module: 'osc',
          why: 'VCO 1 square at C5 with subs at ÷2 and ÷3.',
          set: vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 2, 2] }),
          listen: 'with a key held, a bright chord.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} On square, its SUB 2 at ÷16 is high for a second and low for a second.`,
          set: { ...LFO_SET, 'vco2.wave': 'square', 'sub22.div': 16 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'Hold the melody',
          module: 'mod',
          why: 'VCO 2 SUB 2 OUT into RESET: while it is high the sequencers stay on step 1.',
          cables: [['j.sub22_out', 'j.reset_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'The melody',
          module: 'mod',
          why: '12-ET; Rhythm 2 at ÷2 on Sequencer 1: C, E♭, F, B♭.',
          set: {
            'vco.quantize': '12-ET',
            ...rhythms({ 2: [2, true, false] }),
            ...seq(1, [0, step(3, 5), step(5, 5), step(10, 5)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.8, res: 2.5, amt: 2.2, fd: 3.4, ad: 4 }), ...play() },
          listen: 'repeated Cs in quavers, then the melody let loose, then Cs again.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: how long the melody is held and let go.',
        'seq1.step1': 'In this sound: the note it stalls on.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷8',
          hear: 'Quicker stalls: the melody reaches its second note, then is held again.',
        },
        {
          id: 'seq1.step1',
          try: 'Turn SEQ 1 STEP 1 to 0.58',
          hear: 'It stalls on a G: the repeated note sits a fifth up.',
        },
      ],
    },
  },
  {
    after: 'shc-kotekan',
    sound: {
      id: 'shc-stop-start',
      name: 'Stop-Start',
      ref: 'In the style of a stop-time break',
      artist: 'Jazz',
      tags: ['seq', 'patch'],
      level: 3,
      blurb:
        'A sequence that stops dead on a held note and picks up where it left off: a slow square wave in PLAY.',
      how: 'A gate in the PLAY input runs the sequencers while it is high and stops them while it is low. Patch a slowed VCO 2’s square sub there and the melody runs for half a second, then halts on whatever note it reached, held by the key, then carries on from there. The stops fall freely against the beat, as a band’s stop-time break would if no one counted.',
      bpm: 116,
      steps: [
        {
          title: 'A voice',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with its octave sub.',
          set: vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          listen: 'with a key held, a saw.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} On square, its SUB 2 at ÷8 is high for half a second, low for half a second.`,
          set: { ...LFO_SET, 'vco2.wave': 'square', 'sub22.div': 8 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'The run',
          module: 'mod',
          why: '12-ET; Rhythm 1 at ÷1 on Sequencer 1: C, G, B♭, E♭ up an octave.',
          set: {
            'vco.quantize': '12-ET',
            ...rhythms({ 1: [1, true, false] }),
            ...seq(1, [0, step(7, 5), step(10, 5), step(15, 5)]),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Stop and start',
          module: 'mod',
          why: 'VCO 2 SUB 2 OUT into the PLAY input: it starts the sequencers as it rises and stops them as it falls.',
          cables: [['j.sub22_out', 'j.play_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit, so the app’s clock runs; the cable decides when the sequencers move.',
          set: { ...shape({ cutoff: 4.6, res: 3, amt: 2.4, fd: 3.4, ad: 4 }), ...play() },
          listen: 'a run of sixteenths that halts on a held note, then picks up again.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: how long each run and each stop lasts.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷16',
          hear: 'Longer runs and longer stops: a phrase, then a held note.',
        },
        {
          id: 'vco2.wave',
          try: 'Set VCO 2 WAVE to saw',
          hear: 'A sawtooth sub at the PLAY input: still a run and a stop, but with the stop drifting.',
        },
      ],
    },
  },

  // ── the riff plays the rhythm ──
  {
    after: 'shc-offbeat-skank',
    sound: {
      id: 'shc-ornamented-reel',
      name: 'Ornamented Reel',
      ref: 'In the style of the ornaments of Irish traditional music',
      artist: 'Irish traditional music',
      tags: ['lead', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'Each note you play flicks through a quick run of grace notes: the VCF EG patched into RHYTHM 1.',
      how: 'A fiddler or piper decorates a note with cuts and rolls, a flick of other notes around it. With EG off the riff fires the envelopes and Sequencer 1 picks the pitches. Patch VCF EG OUT into RHYTHM 1: at rest Rhythm 1 is slow, ÷13, but each note’s envelope drops it to ÷1, so Sequencer 1 races through its steps for a moment, a grace-note flurry, then slows as the envelope decays.',
      bpm: 112,
      riff: [
        [0, 60, 0.25],
        [0.5, 60, 0.25],
        [0.75, 60, 0.25],
        [1, 60, 0.4],
        [1.5, 60, 0.25],
        [2, 60, 0.25],
        [2.5, 60, 0.25],
        [2.75, 60, 0.25],
        [3, 60, 0.8],
      ],
      steps: [
        {
          title: 'A reedy voice',
          module: 'osc',
          why: 'VCO 1 square at D5 with its octave sub.',
          set: vco(1, { note: 'D5', wave: 'square', subs: [2, 3], levels: [5, 2, 0] }),
          listen: 'with a key, a reedy tone.',
        },
        {
          title: 'A slow rhythm',
          module: 'mod',
          why: 'Rhythm 1 at ÷13 on Sequencer 1.',
          set: rhythms({ 1: [13, true, false] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'The notes around it',
          module: 'mod',
          why: '8-ET at ±1: Sequencer 1 D, E, G, D an octave below.',
          set: {
            'vco.quantize': '8-ET',
            'seq.oct': 1,
            ...seq(1, [0, step(2), step(5), step(-12)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'The flick',
          module: 'env',
          why: 'VCF EG OUT into RHYTHM 1’s input: a short VCF EG drops the divisor by up to twelve on every note.',
          set: shape({ cutoff: 6.4, res: 1.5, amt: 1, fd: 2.4, ad: 4.4 }),
          cables: [['j.vcf_eg_out', 'j.rhythm1_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'EG off, play',
          module: 'mod',
          why: 'EG off, so the riff fires the envelopes, and PLAY lit on the app’s clock.',
          set: play('off'),
          listen: 'a jigging rhythm, each note flicking through a run of grace notes.',
        },
      ],
      context: {
        'vcf_eg.decay': 'In this sound: how long each flurry lasts.',
        'rhythm1.div': 'In this sound: how still the sequence stays between notes.',
      },
      tweaks: [
        {
          id: 'vcf_eg.decay',
          try: 'Turn VCF DECAY to 5',
          hear: 'Long flurries: every note becomes a run.',
        },
        {
          id: 'rhythm1.div',
          try: 'Turn RHYTHM 1 to ÷16',
          hear: 'Shorter, sparer ornaments: a flick on the strike only.',
        },
      ],
    },
  },

  // ── percussion ──
  {
    after: 'shc-zap-kick',
    sound: {
      id: 'shc-fm-snare',
      name: 'FM Snare',
      ref: 'In the style of a 1980s drum-machine snare',
      artist: 'Electro',
      tags: ['perc', 'patch'],
      level: 2,
      blurb:
        'A snare from a synth with no noise: VCO 1 at audio rate in VCO 2’s pitch input breaks it into hiss.',
      how: 'The Subharmonicon has no noise source, but a high VCO at a 1 V/octave input swings the other VCO five octaves up and down thousands of times a second, smearing it into a noise-like spray. VCO 1 OUT into VCO 2’s input, VCO 1 silent and high, VCO 2 heard with a short envelope: a crack of noisy tone, played on the backbeat by the keys.',
      bpm: 100,
      riff: [
        [1, 60, 0.15],
        [2.75, 60, 0.1],
        [3, 60, 0.15],
      ],
      steps: [
        {
          title: 'Two tones',
          module: 'osc',
          why: 'VCO 1 square at C7, silent; VCO 2 square at C5 with SUB 1 at ÷3.',
          set: {
            ...vco(1, { note: 'C7', wave: 'square', levels: [0, 0, 0] }),
            ...vco(2, { note: 'C5', wave: 'square', subs: [3, 3], levels: [4, 3, 0] }),
          },
          listen: 'with a key, a square chord.',
        },
        {
          title: 'Smear it',
          module: 'osc',
          why: 'VCO 1 OUT into VCO 2’s input.',
          cables: [['j.vco1_out', 'j.vco2_in']],
          listen: 'with a key, a harsh, hissing tone.',
        },
        {
          title: 'A crack',
          module: 'env',
          why: 'An open filter snapped by the VCF EG, and a short VCA decay.',
          set: shape({ cutoff: 7, res: 1, amt: 2, fd: 2, ad: 2.6 }),
          listen: 'with a key tapped, a snare-like crack.',
        },
      ],
      context: {
        'vco1.freq': 'In this sound: not heard; how fine the hiss is.',
        'vca_eg.decay': 'In this sound: the snare’s length.',
      },
      tweaks: [
        {
          id: 'vco1.freq',
          try: 'Turn VCO 1 FREQ to 2.5',
          hear: 'A slower swing: a ringing, metallic clank rather than a hiss.',
        },
        {
          id: 'vca_eg.decay',
          try: 'Turn VCA DECAY to 4.5',
          hear: 'A long, washy crash.',
        },
      ],
    },
  },
  {
    after: 'shc-metal-hats',
    sound: {
      id: 'shc-build-up-roll',
      name: 'Build-Up Roll',
      ref: 'In the style of a dance-music build-up',
      artist: 'Electronic dance music',
      tags: ['perc', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'A tom roll that speeds up through every bar into a blur: a slow ramp patched into RHYTHM 1.',
      how: 'A build-up rolls faster and faster into the drop. VCO 2, slowed by Sequencer 2’s steady −5 V, sends its deepest sub’s rising ramp into RHYTHM 1: about once a bar the divisor falls from ÷16 to ÷1, so the toms speed up from one a bar to sixteenths, then start again. The VCF EG into VCO 1’s input gives each hit a falling pitch.',
      bpm: 126,
      steps: [
        {
          title: 'A tom',
          module: 'osc',
          why: 'VCO 1 square at C4, quiet, with its subs at ÷2 and ÷4 loud.',
          set: vco(1, { wave: 'square', subs: [2, 4], levels: [1, 5, 4] }),
          listen: 'with a key, a deep square.',
        },
        {
          title: 'A falling pitch',
          module: 'env',
          why: 'VCF EG OUT into VCO 1’s input, with a short VCF decay, and a short VCA decay.',
          set: shape({ fd: 1.6, ad: 3.4 }),
          cables: [['j.vcf_eg_out', 'j.vco1_in']],
          listen: 'with a key tapped, a zapping tom.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 2 at ÷16 ramps up about once a bar at this tempo.`,
          set: { ...LFO_SET, 'sub22.div': 16 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'Roll',
          module: 'mod',
          why: 'Rhythm 1 centred at ÷8 on Sequencer 1, and VCO 2 SUB 2 OUT into RHYTHM 1’s input; 12-ET, Sequencer 1 climbs C, D, E, G.',
          set: {
            ...rhythms({ 1: [8, true, false] }),
            'vco.quantize': '12-ET',
            ...seq(1, [0, step(2, 5), step(4, 5), step(7, 5)]),
          },
          cables: [['j.sub22_out', 'j.rhythm1_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'Play',
          module: 'mod',
          why: 'PLAY lit, on the app’s clock.',
          set: play(),
          listen: 'toms rolling faster and faster into a blur, then dropping back to slow.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: how long each build-up takes.',
        'vcf_eg.decay': 'In this sound: the length of each tom’s pitch fall.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷8',
          hear: 'Two build-ups a bar: frantic, short rolls.',
        },
        {
          id: 'rhythm1.div',
          try: 'Turn RHYTHM 1 to ÷12',
          hear: 'The roll never gets faster than one hit every five sixteenths: a slow, lumbering build.',
        },
      ],
    },
  },
  {
    after: 'shc-drum-circle',
    sound: {
      id: 'shc-accent-pattern',
      name: 'Accent Pattern',
      ref: 'In the style of West African drumming',
      artist: 'West African drumming',
      tags: ['perc', 'patch', 'rhythm'],
      level: 3,
      blurb:
        'Two drums from one voice, told apart by their attack: SEQ 2 CLK patched into CUTOFF for a slap.',
      how: 'Both sequencers fire the same envelopes, so their notes would sound alike. Patch SEQ 2 CLK into CUTOFF and every note Sequencer 2 plays gets a 10 ms burst of open filter at its start, a slap, while Sequencer 1’s notes stay dull: two drums, quavers against dotted quavers, from one voice. A drummer gets the same two sounds from one drum with an open tone and a slap.',
      bpm: 108,
      steps: [
        {
          title: 'A drum',
          module: 'osc',
          why: 'VCO 1 square at C4, quiet, with its subs at ÷2 and ÷4 loud; VCO 2 square at G4.',
          set: {
            ...vco(1, { wave: 'square', subs: [2, 4], levels: [1, 5, 3] }),
            ...vco(2, { note: 'G4', wave: 'square', levels: [2, 0, 0] }),
          },
          listen: 'with a key, a deep, hollow fifth.',
        },
        {
          title: 'A dull strike',
          module: 'env',
          why: 'A half-closed filter, VCF EG into VCO 1’s input (and VCO 2’s, through the normal) for a zapping pitch drop, and a short VCA decay.',
          set: shape({ cutoff: 5, res: 1, fd: 1.2, ad: 3.2 }),
          cables: [['j.vcf_eg_out', 'j.vco1_in']],
          listen: 'with a key tapped, a muffled, zapping drum.',
        },
        {
          title: 'Two rhythms',
          module: 'mod',
          why: 'Rhythm 2 at ÷2 on Sequencer 1, Rhythm 3 at ÷3 on Sequencer 2.',
          set: rhythms({ 2: [2, true, false], 3: [3, false, true] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'The slap',
          module: 'filter',
          why: 'SEQ 2 CLK into the CUTOFF input: a short pulse opens the filter at the start of every Sequencer 2 note.',
          cables: [['j.seq2_clk', 'j.cutoff_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'Play',
          module: 'mod',
          why: 'PLAY lit, on the app’s clock.',
          set: play(),
          listen: 'dull quavers with slapped notes every three sixteenths across them.',
        },
      ],
      context: {
        'rhythm3.div': 'In this sound: where the slaps fall.',
        'vcf.cutoff':
          'In this sound: how dull the open tones are, and so how much the slaps stand out.',
      },
      tweaks: [
        {
          id: 'rhythm3.div',
          try: 'Turn RHYTHM 3 to ÷5',
          hear: 'Slaps every five sixteenths: a longer, lopsided cycle.',
        },
        {
          id: 'vcf.cutoff',
          try: 'Turn CUTOFF to 7',
          hear: 'Every note bright: the slaps no longer stand out.',
        },
      ],
    },
  },

  // ── drones ──
  {
    after: 'shc-throat-singing',
    sound: {
      id: 'shc-didgeridoo',
      name: 'Didgeridoo',
      ref: 'In the style of a didgeridoo drone',
      artist: 'Yolŋu music',
      tags: ['drone', 'patch'],
      level: 2,
      blurb: 'A low, buzzing drone whose resonance wah-wahs: a slowed VCO 2 patched into CUTOFF.',
      how: 'A didgeridoo player holds one low note and moves the mouth to sweep its formants. Here VCO 2, slowed by Sequencer 2’s steady −5 V, sends its SUB 2 at about 2 Hz into CUTOFF: the resonant filter sweeps up and down over a low drone of VCO 1’s subs, a rhythmic, vocal wah.',
      bpm: 90,
      steps: [
        {
          title: 'A low drone',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4, quiet; its subs at ÷4 and ÷2 loud.',
          set: vco(1, { subs: [4, 2], levels: [1, 6, 2] }),
          listen: 'with a key held, a low, buzzing drone.',
        },
        {
          title: 'A vocal filter',
          module: 'filter',
          why: 'The filter low with plenty of resonance.',
          set: shape({ cutoff: 3, res: 6 }),
          listen: 'with a key held, a muffled, ringing drone.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 2 at ÷4 runs at about 2 Hz.`,
          set: { ...LFO_SET, 'sub22.div': 4 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'The mouth',
          module: 'filter',
          why: 'VCO 2 SUB 2 OUT into the CUTOFF input.',
          cables: [['j.sub22_out', 'j.cutoff_in']],
          listen: 'with a key held, the drone wah-wahing.',
        },
        {
          title: 'Hold',
          module: 'mod',
          why: 'EG held, so the drone sounds without a key; PLAY lit on the app’s clock.',
          set: play('held'),
          listen: 'a low drone with a pulsing, vocal wah.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: the speed of the wah.',
        'vcf.resonance': 'In this sound: how vocal the sweep is.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷12',
          hear: 'A slow, breathing sweep.',
        },
        {
          id: 'vcf.cutoff',
          try: 'Turn CUTOFF to 1.5',
          hear: 'The sweep spends longer closed: a darker drone that only opens at the top.',
        },
      ],
    },
  },
  {
    after: 'shc-beating-unison',
    sound: {
      id: 'shc-timbre-sequence',
      name: 'Timbre Sequence',
      ref: 'In the style of Morton Subotnick’s timbral sequences',
      artist: 'Morton Subotnick',
      tags: ['drone', 'patch'],
      level: 3,
      blurb:
        'One held note whose tone changes on every step: Sequencer 2 plays silent VCO 2, and VCO 2 plays the filter.',
      how: 'Subotnick sequenced timbre as readily as pitch. Here VCO 1 holds a single drone while Sequencer 2 steps silent VCO 2 through four pitches; VCO 2 OUT into CUTOFF shakes the filter at whichever pitch it is on, so each step is a new tone, hollow, clanging, growling, bell-like, on the same note.',
      bpm: 88,
      steps: [
        {
          title: 'A drone',
          module: 'osc',
          why: 'VCO 1 square at C4 with its octave sub; VCO 2 silent.',
          set: {
            ...vco(1, { wave: 'square', subs: [2, 3], levels: [5, 3, 0] }),
            ...vco(2, { levels: [0, 0, 0] }),
          },
          listen: 'with a key held, a hollow drone.',
        },
        {
          title: 'VCO 2 plays the filter',
          module: 'filter',
          why: 'VCO 2 OUT into the CUTOFF input, the filter low and resonant.',
          set: shape({ cutoff: 4, res: 3 }),
          cables: [['j.vco2_out', 'j.cutoff_in']],
          listen: 'with a key held, a growling, buzzing drone.',
        },
        {
          title: 'Four tones',
          module: 'mod',
          why: 'QUANTIZE off at SEQ OCT ±2: Sequencer 2 moves VCO 2 to the unison, a little over a fifth, an octave and a third, and an uneven step below.',
          set: seq(2, [0, 1.5, 3.4, -1.3]),
          listen: 'still the first tone.',
        },
        {
          title: 'A step each beat',
          module: 'mod',
          why: 'Rhythm 4 at ÷4 on Sequencer 2.',
          set: rhythms({ 4: [4, false, true] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'mod',
          why: 'EG held, PLAY lit, on the app’s clock.',
          set: play('held'),
          listen: 'one note whose tone changes on every beat.',
        },
      ],
      context: {
        'seq2.step3': 'In this sound: the brightest, most clanging tone.',
        'vcf.cutoff': 'In this sound: how much the tones growl.',
      },
      tweaks: [
        {
          id: 'rhythm4.div',
          try: 'Turn RHYTHM 4 to ÷1',
          hear: 'A new tone every sixteenth: a chattering, talking drone.',
        },
        {
          id: 'vco.quantize',
          try: 'Set QUANTIZE to 12-ET',
          hear: 'VCO 2 lands on notes: smoother, more harmonic tones.',
        },
      ],
    },
  },
  {
    after: 'shc-pedal-point',
    sound: {
      id: 'shc-feedback-pwm-drone',
      name: 'Feedback PWM Drone',
      ref: 'In the style of Éliane Radigue’s feedback drones',
      artist: 'Éliane Radigue',
      tags: ['drone', 'patch', 'pwm'],
      level: 2,
      blurb: 'A drone that modulates itself: VCA OUT patched into VCO 1’s pulse width.',
      how: 'Radigue built long drones from feedback. Patch the synth’s own output into VCO 1 PWM and the sound sets its own pulse width: the wave folds back on itself, and as VCO 2 beats slowly against VCO 1 the feedback churns, never quite settling. VOLUME is the depth of the feedback, so turning it down calms the drone as well as quietening it.',
      bpm: 60,
      steps: [
        {
          title: 'A pulse and a saw',
          module: 'osc',
          why: 'VCO 1 square at C4 with its octave sub; VCO 2 sawtooth just above.',
          set: {
            ...vco(1, { wave: 'square', subs: [2, 3], levels: [5, 3, 0] }),
            ...vco(2, { levels: [3, 0, 0] }),
            'vco2.freq': 0.02,
          },
          listen: 'with a key held, a slowly beating tone.',
        },
        {
          title: 'Feed it back',
          module: 'osc',
          why: 'VCA OUT into VCO 1’s PWM input.',
          cables: [['j.vca_out', 'j.vco1_pwm']],
          listen: 'with a key held, a churning, folded tone.',
        },
        {
          title: 'Soften',
          module: 'filter',
          why: 'A warm filter with a little resonance.',
          set: shape({ cutoff: 5.6, res: 2 }),
          listen: 'with a key held, a darker churn.',
        },
        {
          title: 'Hold',
          module: 'mod',
          why: 'EG held, so the drone sounds without a key; PLAY lit on the app’s clock.',
          set: play('held'),
          listen: 'a drone slowly churning through its own feedback.',
        },
      ],
      context: {
        'vca.volume': 'In this sound: the feedback’s depth as well as the level.',
        'vco2.freq': 'In this sound: how fast the churn moves.',
      },
      tweaks: [
        {
          id: 'vca.volume',
          try: 'Turn VOLUME to 4',
          hear: 'Less feedback: a calmer, steadier tone.',
        },
        {
          id: 'vco2.freq',
          try: 'Turn VCO 2 FREQ to 0.1',
          hear: 'A faster beat: the churn turns to a rapid flutter.',
        },
      ],
    },
  },

  // ── the patchbay ──
  {
    after: 'shc-hidden-sequence',
    sound: {
      id: 'shc-self-listening-rhythm',
      name: 'Self-Listening Rhythm',
      ref: 'In the style of a self-patched modular',
      artist: 'Modular synthesis',
      tags: ['seq', 'patch', 'rhythm'],
      level: 3,
      blurb: 'A rhythm that listens to its own output: VCA OUT patched into RHYTHM 2.',
      how: 'Between notes the output is silent and Rhythm 2 sits at its centre; while a note sounds, its wave lands somewhere different at each clock and throws Rhythm 2’s divisor about. So the notes set the next rhythm, and that rhythm the next notes: a pattern that grows out of the sound itself, busier when the notes ring long.',
      bpm: 104,
      steps: [
        {
          title: 'Two voices',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at E♭4.',
          set: {
            ...vco(1, { subs: [2, 3], levels: [4, 2, 0] }),
            ...vco(2, { note: 'Eb4', wave: 'square', levels: [3, 0, 0] }),
          },
          listen: 'with a key held, a minor third.',
        },
        {
          title: 'A rhythm at rest',
          module: 'mod',
          why: 'Rhythm 2 centred at ÷6 on both sequencers, and Rhythm 4 at ÷4 on Sequencer 1.',
          set: rhythms({ 2: [6, true, true], 4: [4, true, false] }),
          listen: 'nothing until it plays.',
        },
        {
          title: 'Listen to itself',
          module: 'mod',
          why: 'VCA OUT into RHYTHM 2’s input.',
          cables: [['j.vca_out', 'j.rhythm2_in']],
          listen: 'still waiting.',
        },
        {
          title: 'The notes',
          module: 'mod',
          why: '12-ET at ±1: Sequencer 1 C, G, F, B♭ below; Sequencer 2 E♭, F, B♭, G on VCO 2.',
          set: {
            'vco.quantize': '12-ET',
            'seq.oct': 1,
            ...seq(1, [0, step(7), step(5), step(-2)]),
            ...seq(2, [0, step(2), step(7), step(4)]),
          },
          listen: 'still waiting.',
        },
        {
          title: 'Pluck and play',
          module: 'filter',
          why: 'A plucked filter, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.8, res: 2.5, amt: 2.2, fd: 3.6, ad: 4.6 }), ...play() },
          listen: 'a steady beat with bursts of extra notes that come and go with the sound.',
        },
      ],
      context: {
        'vca_eg.decay': 'In this sound: how long each note keeps throwing the rhythm about.',
        'vca.volume': 'In this sound: how far the output moves the rhythm.',
      },
      tweaks: [
        {
          id: 'vca_eg.decay',
          try: 'Turn VCA DECAY to 6',
          hear: 'Notes ring longer, so the rhythm runs wild more of the time.',
        },
        {
          id: 'vca.volume',
          try: 'Turn VOLUME to 3',
          hear: 'Quieter, and calmer: the output barely moves the rhythm.',
        },
      ],
    },
  },
  {
    after: 'shc-growl-bass',
    sound: {
      id: 'shc-octave-flutter',
      name: 'Octave Flutter',
      ref: 'In the style of an Italo-disco octave bass',
      artist: 'Italo disco',
      tags: ['bass', 'patch'],
      level: 2,
      blurb:
        'A bass that flips between its sub and its own pitch on every clock: CLOCK OUT patched into VCO 1 SUB.',
      how: 'Italo disco basses bounce between octaves in sixteenths. CLOCK OUT into VCO 1’s SUB input does it twice as fast: its +10 V lowers both divisors to ÷1 for the first half of every clock, so the subs play VCO 1’s own pitch, then drop back to ÷2 and ÷4 for the second half. Sequencer 1 moves the bass line a beat at a time.',
      bpm: 118,
      steps: [
        {
          title: 'Subs only',
          module: 'osc',
          why: 'VCO 1 square at C4, silent, its subs at ÷2 and ÷4 in the mix.',
          set: vco(1, { wave: 'square', subs: [2, 4], levels: [0, 5, 3] }),
          listen: 'with a key held, a deep, octave-doubled bass.',
        },
        {
          title: 'Flip on the clock',
          module: 'osc',
          why: 'CLOCK OUT into VCO 1’s SUB input: while the synth plays, the subs jump to VCO 1’s pitch for half of every clock.',
          cables: [['j.clock_out', 'j.vco1_sub_in']],
          listen: 'nothing until it plays.',
        },
        {
          title: 'A bass line',
          module: 'mod',
          why: '12-ET at ±1; Rhythm 4 at ÷4 on Sequencer 1: C, C, E♭, F.',
          set: {
            'vco.quantize': '12-ET',
            'seq.oct': 1,
            ...rhythms({ 4: [4, true, false] }),
            ...seq(1, [0, 0, step(3), step(5)]),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'filter',
          why: 'A low, slightly resonant filter, EG held, and PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 4.6, res: 2.5 }), ...play('held') },
          listen: 'a fluttering octave bass, a new note on each beat.',
        },
      ],
      context: {
        'sub11.div': 'In this sound: the low half of each flutter.',
        'vcf.cutoff': 'In this sound: how much of the top octave comes through.',
      },
      tweaks: [
        {
          id: 'sub11.div',
          try: 'Turn VCO 1 SUB 1 FREQ to ÷3',
          hear: 'The flutter jumps a twelfth: a wider, more electronic bounce.',
        },
        {
          id: 'transport.eg',
          try: 'Set EG to on',
          hear: 'Each beat is a plucked note, the flutter fading inside it.',
        },
      ],
    },
  },
  {
    after: 'shc-cross-pwm',
    sound: {
      id: 'shc-slow-pwm-strings',
      name: 'Slow PWM Strings',
      ref: 'In the style of a 1970s string machine',
      artist: 'String synthesizers',
      tags: ['strings', 'patch', 'pwm'],
      level: 3,
      blurb:
        'Lush, slowly moving strings: a slowed VCO 2 sweeping the pulse width of VCO 1 and both its subs.',
      how: 'String machines got their shimmer from slow modulation. Here VCO 2, slowed by Sequencer 2’s steady −5 V, sends SUB 2 at about half a hertz into VCO 1 PWM: on square, VCO 1 and both its subs widen and narrow together, the whole chord shimmering. Sequencer 1 changes the chord’s divisors once a bar, and EG held sustains it.',
      bpm: 72,
      steps: [
        {
          title: 'A chord of pulses',
          module: 'osc',
          why: 'VCO 1 square at C5 with subs at ÷2 and ÷3, all three in the mix.',
          set: vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [3, 4, 4] }),
          listen: 'with a key held, a hollow chord.',
        },
        {
          title: 'VCO 2 as a slow wave',
          module: 'osc',
          why: `${LFO_WHY} Its SUB 2 at ÷16 runs at about half a hertz.`,
          set: { ...LFO_SET, 'sub22.div': 16 },
          cables: [LFO_CABLE],
          listen: 'nothing new: VCO 2 is not heard.',
        },
        {
          title: 'Shimmer',
          module: 'osc',
          why: 'VCO 2 SUB 2 OUT into VCO 1’s PWM input: the width of VCO 1 and its subs sweeps slowly.',
          cables: [['j.sub22_out', 'j.vco1_pwm']],
          listen: 'with a key held, the chord slowly shimmering.',
        },
        {
          title: 'A chord a bar',
          module: 'mod',
          why: 'Rhythm 4 at ÷16 on Sequencer 1, assigned to VCO 1’s subs: divisors as they are, one up, one down, two up.',
          set: {
            ...rhythms({ 4: [16, true, false] }),
            ...seq(1, [0, div(-1), div(1), div(-2)], { sub1: true, sub2: true }),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Hold and play',
          module: 'filter',
          why: 'A soft filter, EG held so the strings sustain, then PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 5.4, res: 1 }), ...play('held') },
          listen: 'shimmering string chords, a new one each bar.',
        },
      ],
      context: {
        'sub22.div': 'In this sound: the shimmer’s speed.',
        'rhythm4.div': 'In this sound: how long each chord lasts.',
      },
      tweaks: [
        {
          id: 'sub22.div',
          try: 'Turn VCO 2 SUB 2 FREQ to ÷4',
          hear: 'A faster shimmer: closer to an ensemble chorus.',
        },
        {
          id: 'vco1.wave',
          try: 'Set VCO 1 WAVE to saw',
          hear: 'Saws have no width to move: plain, still strings.',
        },
      ],
    },
  },

  // ── effects ──
  {
    after: 'shc-sonar',
    sound: {
      id: 'shc-cicadas',
      name: 'Cicadas',
      ref: 'In the style of cicadas on a summer night',
      artist: 'Sound effects',
      tags: ['fx', 'patch'],
      level: 2,
      blurb:
        'A buzzing, chirping swarm: VCO 1’s deepest sub sweeps VCO 2’s divisors sixteen times a second.',
      how: 'VCO 1 SUB 2 OUT, VCO 1 at C4 divided by 16, is a sawtooth at 16 Hz. Patched into VCO 2’s SUB input it sweeps VCO 2’s divisors through the whole undertone series sixteen times a second, a blur of chirps. Sequencer 1 moves VCO 1, so each step changes the chirp rate, like insects answering one another.',
      bpm: 96,
      steps: [
        {
          title: 'High and silent',
          module: 'osc',
          why: 'VCO 2 square at C7, its subs centred at ÷8 and ÷12 in the mix; VCO 1 silent, its SUB 2 at ÷16.',
          set: {
            ...vco(1, { subs: [2, 16], levels: [0, 0, 0] }),
            ...vco(2, { note: 'C7', wave: 'square', subs: [8, 12], levels: [0, 3, 3] }),
          },
          listen: 'with a key held, a high chord.',
        },
        {
          title: 'The swarm',
          module: 'osc',
          why: 'VCO 1 SUB 2 OUT into VCO 2’s SUB input.',
          cables: [['j.sub12_out', 'j.vco2_sub_in']],
          listen: 'with a key held, a buzzing, chirping blur.',
        },
        {
          title: 'Changing rates',
          module: 'mod',
          why: 'Rhythm 3 at ÷3 on Sequencer 1, moving VCO 1, and so the chirp rate, by uneven amounts at ±1.',
          set: {
            'seq.oct': 1,
            ...rhythms({ 3: [3, true, false] }),
            ...seq(1, [0, 2.4, -1.8, 4.1]),
          },
          listen: 'nothing until it plays.',
        },
        {
          title: 'Thin it out',
          module: 'filter',
          why: 'A thin, resonant filter, EG held, and PLAY lit on the app’s clock.',
          set: { ...shape({ cutoff: 7.6, res: 4 }), ...play('held') },
          listen: 'a swarm of chirps, its rate changing every three sixteenths.',
        },
      ],
      context: {
        'sub12.div': 'In this sound: not heard; the chirp rate, a sixteenth of VCO 1.',
        'sub21.div': 'In this sound: the middle of the swarm’s sweep.',
      },
      tweaks: [
        {
          id: 'sub12.div',
          try: 'Turn VCO 1 SUB 2 FREQ to ÷4',
          hear: 'Four times faster: the chirps melt into a buzzing whine.',
        },
        {
          id: 'vco1.wave',
          try: 'Set VCO 1 WAVE to square',
          hear: 'A square sweeps only two divisors: a fast two-note trill, like an alarm.',
        },
      ],
    },
  },
  {
    after: 'shc-geiger',
    sound: {
      id: 'shc-feedback-howl',
      name: 'Feedback Howl',
      ref: 'In the style of Louis and Bebe Barron’s self-destructing circuits',
      artist: 'Louis and Bebe Barron',
      tags: ['fx', 'patch'],
      level: 3,
      blurb: 'Squeals and howls: the synth’s own output patched into its pitch.',
      how: 'The Barrons built circuits for Forbidden Planet that howled and squealed as they overloaded. Patch VCA OUT into VCO 1’s input and the sound sets its own pitch: it shrieks upward, collapses, and starts again, never twice the same. VOLUME is the amount of feedback, so it decides how wild it gets.',
      bpm: 80,
      steps: [
        {
          title: 'One voice',
          module: 'osc',
          why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 silent, so only VCO 1’s howl is heard, though the cable moves both.',
          set: vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          listen: 'with a key held, a saw.',
        },
        {
          title: 'Feed it back',
          module: 'osc',
          why: 'VCA OUT into VCO 1’s input.',
          cables: [['j.vca_out', 'j.vco1_in']],
          listen: 'with a key held, a squealing, unstable howl.',
        },
        {
          title: 'Bursts',
          module: 'env',
          why: 'A resonant filter, a slow attack and a medium decay; Rhythm 4 at ÷4 on Sequencer 1, so a burst each beat.',
          set: {
            ...shape({ cutoff: 6, res: 4, aa: 3, ad: 5.6, vol: 5 }),
            ...rhythms({ 4: [4, true, false] }),
          },
          listen: 'with a key, a howl that swells and dies.',
        },
        {
          title: 'Play',
          module: 'mod',
          why: 'PLAY lit, on the app’s clock.',
          set: play(),
          listen: 'a burst of feedback on every beat, each one a different shriek.',
        },
      ],
      context: {
        'vca.volume': 'In this sound: the feedback’s depth: how wild it howls.',
        'vca_eg.attack': 'In this sound: how each howl swells in.',
      },
      tweaks: [
        {
          id: 'vca.volume',
          try: 'Turn VOLUME to 7',
          hear: 'More feedback: harsher, screaming, more chaotic.',
        },
        {
          id: 'vca.volume',
          try: 'Turn VOLUME to 2',
          hear: 'Little feedback: a quiet note that only wavers.',
        },
      ],
    },
  },
];
