/**
 * Drones: the envelopes held open (EG held) or swelling slowly, so the sound never stops and the sequencers change
 * it from inside: a voice, a filter, a chord. The subs make a drone deep without a second note.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const DRONE: SoundSpec[] = [
  {
    id: 'shc-throat-singing',
    name: 'Throat Singing',
    ref: 'In the style of Tuvan khoomei',
    artist: 'Tuvan throat singing',
    tags: ['drone', 'patch', 'overtones'],
    level: 3,
    blurb:
      'A low drone with a whistling overtone melody on top, picked out by a resonant filter that a sequencer plays.',
    how: 'A khoomei singer holds one low note and shapes the mouth to make single overtones sing above it. Here a saw drone goes through a very resonant filter, and SEQ 1 OUT is patched into CUTOFF, so Sequencer 1 moves the filter’s peak from harmonic to harmonic: a melody made of the drone’s own overtones. EG held keeps the drone going.',
    bpm: 66,
    steps: [
      {
        title: 'A low drone',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4, quiet; its subs at ÷2 and ÷4 loud.',
        set: vco(1, { subs: [2, 4], levels: [2, 5, 5] }),
        listen: 'with a key held, a low, rich drone.',
      },
      {
        title: 'The mouth',
        module: 'filter',
        why: 'CUTOFF low and RESONANCE high: a whistling peak over the drone.',
        set: shape({ cutoff: 4.4, res: 8 }),
        listen: 'with a key, a single whistle singing above the drone.',
      },
      {
        title: 'A sequencer plays the filter',
        module: 'mod',
        why: 'SEQ 1 OUT into CUTOFF; Rhythm 1 at ÷4 drives Sequencer 1, assigned to nothing, at SEQ OCT ±2, with QUANTIZE off.',
        set: { ...rhythms({ 1: [4, true, false] }), ...seq(1, [0, 1.25, 2.1, 0.6], {}) },
        cables: [['j.seq1_out', 'j.cutoff_in']],
        listen: 'nothing until it plays.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'the drone unbroken, its whistle stepping between overtones once a beat.',
      },
    ],
    context: {
      'vcf.resonance': 'In this sound: the whistle, the singer’s overtone.',
      'seq1.step3': 'In this sound: how high up the overtones the whistle reaches.',
    },
    tweaks: [
      {
        id: 'vcf.resonance',
        try: 'Turn RESONANCE to 5',
        hear: 'The whistle softens into a vowel: a choir instead of a singer.',
      },
      { id: 'rhythm1.div', try: 'Turn RHYTHM 1 to ÷2', hear: 'The overtone melody twice as fast.' },
    ],
  },
  {
    id: 'shc-pipes-and-drones',
    name: 'Pipes and Drones',
    ref: 'In the style of the Highland bagpipe',
    artist: 'Highland bagpipe',
    tags: ['drone', 'lead'],
    level: 2,
    blurb: 'A reedy chanter tune over two drones an octave and a twelfth below.',
    how: 'The Highland pipes sound their chanter over a bass and two tenor drones. VCO 2’s subs at ÷2 and ÷3 are the drones; VCO 1, on the buzzy pulse wave, is the chanter, which Sequencer 1 plays in C major on eighths. With EG held the bag never runs out of air.',
    bpm: 92,
    steps: [
      {
        title: 'Drones',
        module: 'osc',
        why: 'VCO 2 at C4, silent, its subs at ÷2 and ÷3 sounding the drones.',
        set: vco(2, { wave: 'saw', subs: [2, 3], levels: [0, 4, 3] }),
        listen: 'with a key held, a low drone on C and F.',
      },
      {
        title: 'Chanter',
        module: 'osc',
        why: 'VCO 1 on the pulse wave (PWM) at C5; its subs set the pulse width, silent.',
        set: vco(1, { note: 'C5', wave: 'pwm', subs: [2, 3], levels: [4, 0, 0] }),
        listen: 'a nasal reed above the drones.',
      },
      {
        title: 'The tune',
        module: 'mod',
        why: 'Rhythms 1 (÷2) and 2 (÷3) on Sequencer 1, in C major (8-ET) at ±1: G, A, C, E.',
        set: {
          ...rhythms({ 1: [2, true, false], 2: [3, true, false] }),
          'vco.quantize': '8-ET',
          'seq.oct': 1,
          ...seq(1, [step(-5), step(-3), 0, step(4)]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Reed',
        module: 'filter',
        why: 'The filter fairly open with a little resonance.',
        set: shape({ cutoff: 6, res: 2 }),
        listen: 'with a key, a buzzing reed.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'a chanter tune skipping over steady drones.',
      },
    ],
    context: {
      'mix.sub21': 'In this sound: the bass drone.',
      'vco1.wave': 'In this sound: the chanter’s reed.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 8-JI',
        hear: 'The chanter tunes to the drones in just intonation, as pipers do.',
      },
      { id: 'rhythm2.seq1', try: 'Turn off RHYTHM 2 SEQ 1', hear: 'Straight eighths: a march.' },
    ],
  },
  {
    id: 'shc-shruti-breath',
    name: 'Shruti Breath',
    ref: 'In the style of a shruti box',
    artist: 'Indian classical music',
    tags: ['drone', 'pad'],
    level: 1,
    blurb:
      'A reed drone on Sa and Pa that breathes in and out once a bar, as a shruti box’s bellows do.',
    how: 'A shruti box sounds a held chord of reeds, swelling with each push of the bellows. Rhythm 1 at ÷16 fires the envelopes once a bar, with slow attacks and long decays, so the chord swells and fades with every bar. No sequencer moves a pitch: only the breath.',
    bpm: 72,
    steps: [
      {
        title: 'Reeds',
        module: 'osc',
        why: 'Pulse waves: VCO 1 at C4, VCO 2 at G4, each with its octave sub; QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { wave: 'pwm', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'G4', wave: 'pwm', subs: [2, 3], levels: [3, 2, 0] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, a reedy fifth.',
      },
      {
        title: 'Once a bar',
        module: 'mod',
        why: 'Rhythm 1 at ÷16 on Sequencer 1.',
        set: rhythms({ 1: [16, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Bellows',
        module: 'env',
        why: 'Slow attacks and long decays on both envelopes; the filter low.',
        set: shape({ cutoff: 4.2, res: 1.5, amt: 1.6, fa: 7.4, fd: 8, aa: 7.4, ad: 8 }),
        listen: 'with a key, a slow swell.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'the chord breathing in and out once a bar.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the bellows, once a bar.',
      'vca_eg.attack': 'In this sound: the push of the bellows.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷8',
        hear: 'Two breaths a bar: a faster, more urgent pump.',
      },
      {
        id: 'transport.eg',
        try: 'Set EG to held',
        hear: 'The breathing stops: a steady harmonium drone.',
      },
    ],
  },
  {
    id: 'shc-beating-unison',
    name: 'Beating Unison',
    ref: 'In the style of Éliane Radigue’s slow drones',
    artist: 'Éliane Radigue',
    tags: ['drone', 'ambient'],
    level: 2,
    blurb:
      'Two nearly equal VCOs whose slow beating is divided again by their subs into slower and slower waves.',
    how: 'Two VCOs a fraction apart beat at the difference of their pitches. Their subs divide that difference too: the ÷2 subs beat at half the rate, the ÷4 subs at a quarter, so one held drone has waves rolling through it at several slow speeds at once. Radigue built hour-long pieces from beatings like these. EG held; nothing steps.',
    bpm: 60,
    steps: [
      {
        title: 'Almost unison',
        module: 'osc',
        why: 'Both VCOs sawtooth near C4, VCO 2 a hair sharp; each with subs at ÷2 and ÷4. QUANTIZE off.',
        set: {
          ...vco(1, { subs: [2, 4], levels: [3, 3, 3] }),
          ...vco(2, { subs: [2, 4], levels: [3, 3, 3] }),
          'vco2.freq': 0.05,
        },
        listen: 'with a key held, a drone with slow waves moving through it.',
      },
      {
        title: 'Dark room',
        module: 'filter',
        why: 'The filter low with a touch of resonance.',
        set: shape({ cutoff: 4, res: 2.5 }),
        listen: 'with a key, the waves surfacing in the low end.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held and PLAY lit, on the app’s clock. No rhythm drives anything: the drone is the piece.',
        set: play('held'),
        listen: 'a still drone with several slow pulsations at once.',
      },
    ],
    context: {
      'vco2.freq': 'In this sound: the beating’s speed.',
      'mix.sub12': 'In this sound: the slowest wave, a quarter of the beat.',
    },
    tweaks: [
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 0.02',
        hear: 'Slower beats: waves that take seconds to pass.',
      },
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 0.15',
        hear: 'Fast beating: a rough, chorused drone.',
      },
    ],
  },
  {
    id: 'shc-deep-space-hum',
    name: 'Deep Space Hum',
    ref: 'In the style of Louis and Bebe Barron’s Forbidden Planet',
    artist: 'Louis and Bebe Barron',
    tags: ['drone', 'fx'],
    level: 2,
    blurb:
      'A huge sub-bass hum from the deepest divisors, fluttering where two nearly equal VCOs’ subs meet.',
    how: 'At ÷12 to ÷16 the subs fall into the bottom of hearing. Two VCOs a little apart, each with its subs that deep, flutter against each other like machinery far away; a resonant filter low down gives the hum a ringing body.',
    bpm: 60,
    steps: [
      {
        title: 'The deepest divisors',
        module: 'osc',
        why: 'Squares; VCO 1 at C4 over ÷12 and ÷16, VCO 2 a little higher over ÷13 and ÷15; the VCOs silent.',
        set: {
          ...vco(1, { wave: 'square', subs: [12, 16], levels: [0, 5, 5] }),
          ...vco(2, { wave: 'square', subs: [13, 15], levels: [0, 4, 4] }),
          'vco2.freq': 0.08,
        },
        listen: 'with a key held, a deep, fluttering rumble.',
      },
      {
        title: 'Ringing body',
        module: 'filter',
        why: 'The filter low and resonant.',
        set: shape({ cutoff: 3.4, res: 6 }),
        listen: 'the rumble gains a ringing tone.',
      },
      {
        title: 'Slowly shifting',
        module: 'mod',
        why: 'Rhythm 1 at ÷16 drives Sequencer 2, assigned to VCO 2’s subs, nudging their divisors once a bar.',
        set: {
          ...rhythms({ 1: [16, false, true] }),
          'seq.oct': 5,
          ...seq(2, [0, 0.72, -0.72, 1.38], { sub1: true, sub2: true }),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'a vast hum whose flutter changes once a bar.',
      },
    ],
    context: {
      'sub12.div': 'In this sound: ÷16, the floor of the hum.',
      'vcf.resonance': 'In this sound: the hum’s ringing body.',
    },
    tweaks: [
      {
        id: 'vcf.cutoff',
        try: 'Turn CUTOFF to 5.5',
        hear: 'The squares’ edges come through: a grinding engine room.',
      },
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 0.3',
        hear: 'Faster flutter: the machinery speeds up.',
      },
    ],
  },
  {
    id: 'shc-filter-steps-drone',
    name: 'Filter Steps',
    ref: 'In the style of minimalist drone music',
    artist: 'Drone music',
    tags: ['drone', 'patch'],
    level: 2,
    blurb: 'A held undertone chord whose colour steps on dotted eighths: SEQ 2 plays the filter.',
    how: 'EG held keeps a chord sounding; SEQ 2 OUT patched into CUTOFF moves the filter on Rhythm 2’s dotted eighths, so the chord’s colour changes in rhythm while its notes never move. A little resonance makes each filter step a vowel.',
    bpm: 96,
    steps: [
      {
        title: 'An undertone chord',
        module: 'osc',
        why: 'VCO 1 saw at C5 over ÷4 and ÷5; VCO 2 saw at G4 over ÷3 and ÷4.',
        set: {
          ...vco(1, { note: 'C5', subs: [4, 5], levels: [3, 4, 3] }),
          ...vco(2, { note: 'G4', subs: [3, 4], levels: [3, 3, 3] }),
        },
        listen: 'with a key held, a rich chord.',
      },
      {
        title: 'Filter and voice',
        module: 'filter',
        why: 'The filter low with some resonance.',
        set: shape({ cutoff: 3.8, res: 4.5 }),
        listen: 'with a key, a dark, vowel-like chord.',
      },
      {
        title: 'Sequencer 2 plays the filter',
        module: 'mod',
        why: 'SEQ 2 OUT into CUTOFF; Rhythm 2 at ÷3 drives Sequencer 2, assigned to nothing, at ±2.',
        set: { ...rhythms({ 2: [3, false, true] }), ...seq(2, [0, 1.6, 0.6, 2.4], {}) },
        cables: [['j.seq2_out', 'j.cutoff_in']],
        listen: 'nothing until it plays.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'one chord, its colour stepping open and closed on dotted eighths.',
      },
    ],
    context: {
      'seq2.step4': 'In this sound: the brightest filter step.',
      'vcf.resonance': 'In this sound: the vowel on each step.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷1',
        hear: 'The filter steps on sixteenths: a talking, gated chord.',
      },
      {
        id: 'vcf.resonance',
        try: 'Turn RESONANCE to 7',
        hear: 'Each step whistles: the filter sings its own line.',
      },
    ],
  },
  {
    id: 'shc-pedal-point',
    name: 'Pedal Point',
    ref: 'In the style of a cathedral organ’s pedal point',
    artist: 'Cathedral organ',
    tags: ['drone', 'organ'],
    level: 2,
    blurb:
      'A low C held for ever from VCO 1’s subs, while VCO 2 moves through slow chords above it.',
    how: 'A pedal point holds the bass while the harmony moves over it. VCO 1’s subs at ÷4 and ÷8 hold the pedal; VCO 2, with its own subs, steps once every half bar through a progression. EG held keeps the organ sounding; the clashes and resolutions over the pedal are the point.',
    bpm: 72,
    riff: [[0, 60, 8]],
    steps: [
      {
        title: 'The pedal',
        module: 'osc',
        why: 'Squares; VCO 1 at C4, silent, its subs at ÷4 and ÷8.',
        set: vco(1, { wave: 'square', subs: [4, 8], levels: [0, 4, 4] }),
        listen: 'with a key held, a deep organ pedal.',
      },
      {
        title: 'The manuals',
        module: 'osc',
        why: 'VCO 2 square at C5 with subs at ÷2 and ÷3.',
        set: vco(2, { note: 'C5', wave: 'square', subs: [2, 3], levels: [3, 3, 2] }),
        listen: 'a chord over the pedal.',
      },
      {
        title: 'Moving harmony',
        module: 'mod',
        why: 'Rhythm 1 at ÷8 drives Sequencer 2 on VCO 2, 12-ET at ±1: C, D♭, B♭, B.',
        set: {
          ...rhythms({ 1: [8, false, true] }),
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(2, [0, step(1), step(-2), step(-1)]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Organ voicing',
        module: 'filter',
        why: 'The filter fairly open.',
        set: shape({ cutoff: 6.2 }),
        listen: 'with a key, a full organ.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'chords above clashing with and resolving over a pedal that never moves.',
      },
    ],
    context: {
      'mix.sub12': 'In this sound: the pedal’s low octave.',
      'seq2.step2': 'In this sound: the D♭ that clashes hardest with the pedal.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷16',
        hear: 'One chord a bar: slower, more solemn.',
      },
      {
        id: 'sub12.div',
        try: 'Turn VCO 1 SUB 2 FREQ to ÷16',
        hear: 'The pedal drops another octave, to a 16 Hz rumble.',
      },
    ],
  },
];
