/**
 * Just intonation: QUANTIZE’s 12-JI and 8-JI snap both VCOs and every step to pure ratios, so chords lock still
 * instead of beating, and they sit naturally beside the subs, which are pure ratios by nature.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const JUST: SoundSpec[] = [
  {
    id: 'shc-just-fifths-drone',
    name: 'Just Fifths Drone',
    ref: 'In the style of a tanpura drone',
    artist: 'Hindustani classical music',
    tags: ['drone', 'just intonation'],
    level: 1,
    blurb:
      'A still, glowing drone on a pure fifth, its upper string moving once a bar between Pa and Ma.',
    how: 'A tanpura plays the tonic and the fifth (Sa and Pa) over and over. With QUANTIZE on 12-JI the fifth is exactly 3 : 2, so it never beats against C, and the subs, already whole-number ratios, sit inside it perfectly. EG held keeps it sounding; Sequencer 2 moves VCO 2 once a bar, from the fifth to the fourth and back, as a tanpura player retunes a string.',
    bpm: 60,
    riff: [[0, 60, 16]],
    steps: [
      {
        title: 'Sa and Pa',
        module: 'osc',
        why: 'VCO 1 at C4, VCO 2 at G4, sawtooth, each with subs at ÷2 and ÷3, QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 2] }),
          ...vco(2, { note: 'G4', subs: [2, 3], levels: [3, 3, 2] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, a fifth so pure it sounds like one note.',
      },
      {
        title: 'One move a bar',
        module: 'mod',
        why: 'Rhythm 4 at ÷16 drives Sequencer 2, assigned to VCO 2, at ±1: G, G, F, G.',
        set: { ...rhythms({ 4: [16, false, true] }), 'seq.oct': 1, ...seq(2, [0, 0, step(-2), 0]) },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Jawari',
        module: 'filter',
        why: 'The filter half open with resonance: the buzz a tanpura’s bridge gives.',
        set: shape({ cutoff: 5.2, res: 3.5 }),
        listen: 'with a key, a buzzing, singing tone.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen:
          'an unbroken drone whose upper string drops to the fourth in the third bar of four.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: 12-JI, so the fifth is a pure 3 : 2.',
      'transport.eg': 'In this sound: held, the drone never stops.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 12-ET',
        hear: 'The fifth beats slowly: equal temperament’s tiny flatness, made audible.',
      },
      {
        id: 'sub22.div',
        try: 'Turn VCO 2 SUB 2 FREQ to ÷5',
        hear: 'A deep, pure major third enters under the drone.',
      },
    ],
  },
  {
    id: 'shc-pure-major-chimes',
    name: 'Pure Major Chimes',
    ref: 'In the style of Terry Riley’s just-intonation keyboard music',
    artist: 'Terry Riley',
    tags: ['seq', 'just intonation', 'bell'],
    level: 2,
    blurb: 'Chiming major-seventh arpeggios in just C major, eighths against dotted eighths.',
    how: 'In just C major (8-JI) the major third is 5 : 4 and the seventh 15 : 8, the sweetest versions of both. Two sequencers arpeggiate a C major seventh chord at once, on two rhythms, so the notes keep landing in new pairs, and every pair is pure.',
    bpm: 100,
    steps: [
      {
        title: 'Two chimes',
        module: 'osc',
        why: 'Squares: VCO 1 at C5, VCO 2 at E5, each with a quiet ÷2, QUANTIZE on 8-JI.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'E5', wave: 'square', subs: [2, 3], levels: [3, 2, 0] }),
          'vco.quantize': '8-JI',
        },
        listen: 'with a key held, a sweet, still major third.',
      },
      {
        title: 'Eighths and dotted eighths',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Cmaj7 two ways',
        module: 'mod',
        why: 'SEQ OCT ±1: Sequencer 1 C E G B up from C5, Sequencer 2 E G B C from E5.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(4), step(7), step(11)]),
          ...seq(2, [0, step(3), step(7), step(8)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Chime',
        module: 'filter',
        why: 'A little resonance, a ping and a ringing decay.',
        set: shape({ cutoff: 5.8, res: 3, amt: 1.4, fd: 4, ad: 5.8 }),
        listen: 'with a key, a clear chime.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a shimmering web of one chord, every interval pure.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: just C major, so the thirds and sevenths are pure.',
      'vca_eg.decay': 'In this sound: how much the chimes overlap.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 8-ET',
        hear: 'Equal temperament: the same chord, with a faint restless shimmer.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷5',
        hear: 'Five against two: the pairs take longer to repeat.',
      },
    ],
  },
  {
    id: 'shc-just-thirds-pulse',
    name: 'Just Thirds Pulse',
    ref: 'In the style of La Monte Young’s tuned sustained tones',
    artist: 'Drone music',
    tags: ['seq', 'just intonation'],
    level: 2,
    blurb:
      'Two saws a pure major third apart, pulsing on eighths while the third steps through a mode.',
    how: 'A pure 5 : 4 third has no beating at all, so the pulse you hear is only the envelope, nothing in the tuning. Both sequencers take the same rhythm and step the two VCOs in parallel thirds, each locked to 12-JI.',
    bpm: 88,
    steps: [
      {
        title: 'A pure third',
        module: 'osc',
        why: 'Saws: VCO 1 at C4 and VCO 2 at E4, octave subs under both, QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'E4', subs: [2, 3], levels: [4, 3, 0] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, a major third that sounds perfectly still.',
      },
      {
        title: 'One rhythm, both sequencers',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 drives both sequencers.',
        set: rhythms({ 1: [2, true, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Parallel thirds',
        module: 'mod',
        why: 'SEQ OCT ±1: both sequencers step through 0, 2, 5 and 7 semitones, so the third moves as a pair.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(2), step(5), step(7)]),
          ...seq(2, [0, step(1), step(5), step(7)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'A soft pulse',
        module: 'filter',
        why: 'A low filter, a soft attack and a medium decay.',
        set: shape({ cutoff: 4.4, res: 1.5, amt: 1.4, fd: 4.6, aa: 2.5, ad: 5 }),
        listen: 'with a key, a soft swell.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'thirds pulsing in eighths, major then minor, all of them calm.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: 12-JI, every third a pure ratio.',
      'rhythm1.seq2': 'In this sound: both sequencers on one rhythm, so the thirds move together.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 12-ET',
        hear: 'The thirds start to beat quickly: the roughness equal temperament adds.',
      },
      {
        id: 'rhythm1.seq2',
        try: 'Turn off RHYTHM 1 SEQ 2',
        hear: 'VCO 2 stays on E while VCO 1 moves: the third opens and closes into other pure intervals.',
      },
    ],
  },
  {
    id: 'shc-augmentation-canon',
    name: 'Augmentation Canon',
    ref: 'In the style of a Bach augmentation canon',
    artist: 'Johann Sebastian Bach',
    tags: ['seq', 'just intonation', 'counterpoint'],
    level: 3,
    blurb:
      'One four-note theme on both sequencers, one twice as slow as the other: a canon by augmentation.',
    how: 'In an augmentation canon the second voice plays the theme at half speed. Both sequencers hold the same four steps; Sequencer 1 moves on eighths and Sequencer 2 on quarters, an octave lower, so the slow voice plays the theme once while the fast one plays it twice. 12-JI keeps the harmonies pure where they meet.',
    bpm: 84,
    riff: [[0, 60, 8]],
    steps: [
      {
        title: 'Two voices',
        module: 'osc',
        why: 'VCO 1 sawtooth at C5; VCO 2 on square at C4 with its octave sub. QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { note: 'C5', levels: [4, 0, 0] }),
          ...vco(2, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, a bright C over a hollow low one.',
      },
      {
        title: 'Eighths and quarters',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'One theme twice',
        module: 'mod',
        why: 'SEQ OCT ±1, the same four steps on both: C, E♭, G, F.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(7), step(5)]),
          ...seq(2, [0, step(3), step(7), step(5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Clean voices',
        module: 'filter',
        why: 'A light pluck and a medium decay.',
        set: shape({ cutoff: 5, res: 1.5, amt: 2, fd: 4.4, ad: 5.2 }),
        listen: 'with a key, a clear note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen:
          'the theme above in eighths, the same theme below in quarters, meeting again every two bars.',
      },
    ],
    context: {
      'rhythm2.div': 'In this sound: the slow voice, the theme augmented.',
      'seq2.step2': 'In this sound: the same as Sequencer 1’s step 2: one theme, two speeds.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷6',
        hear: 'Augmentation by three: the voices meet only every three bars.',
      },
      {
        id: 'seq2.step3',
        try: 'Turn SEQ 2 STEP 3 to −2.92',
        hear: 'The slow voice inverts its leap: a canon by inversion as well.',
      },
    ],
  },
  {
    id: 'shc-just-organum',
    name: 'Just Organum',
    ref: 'In the style of Pérotin’s organum',
    artist: 'Pérotin',
    tags: ['seq', 'just intonation', 'drone'],
    level: 2,
    blurb: 'A melody in pure parallel fifths over a held drone, as at Notre-Dame around 1200.',
    how: 'Medieval organum sang a chant in parallel fifths over a long held note. VCO 2’s subs hold the drone, VCO 1 and VCO 2 sing the chant a pure fifth apart (12-JI), both sequencers taking the same steps on the same rhythm. EG held keeps the drone unbroken.',
    bpm: 72,
    steps: [
      {
        title: 'Two voices and a drone',
        module: 'osc',
        why: 'Saws: VCO 1 at C4, VCO 2 at G4; VCO 2’s subs at ÷3 and ÷6 hold C3 and C2. QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 0, 0] }),
          ...vco(2, { note: 'G4', subs: [3, 6], levels: [3, 3, 3] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, an open, pure fifth over a low C.',
      },
      {
        title: 'The chant’s pace',
        module: 'mod',
        why: 'Rhythm 1 at ÷4 drives both sequencers.',
        set: rhythms({ 1: [4, true, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The chant in fifths',
        module: 'mod',
        why: 'SEQ OCT ±1, the same steps on both sequencers: up a tone, a minor third, and back.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(2), step(3), step(2)]),
          ...seq(2, [0, step(2), step(3), step(2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'A stone room',
        module: 'filter',
        why: 'The filter low and soft.',
        set: shape({ cutoff: 4.6, res: 1.5 }),
        listen: 'with a key, a dark, choral tone.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock.',
        set: play('held'),
        listen: 'two voices stepping in fifths over a drone that never moves.',
      },
    ],
    context: {
      'vco2.freq': 'In this sound: the fifth above the chant, and the drone’s source.',
      'sub22.div': 'In this sound: the low drone, VCO 2 divided by six.',
    },
    tweaks: [
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 1.04',
        hear: 'Parallel fourths, the other organum: darker and older.',
      },
      {
        id: 'transport.eg',
        try: 'Set EG to on',
        hear: 'The voices are sung note by note and the drone breathes with them.',
      },
    ],
  },
  {
    id: 'shc-just-minor-cycle',
    name: 'Just Minor Cycle',
    ref: 'In the style of Ben Johnston’s just-intonation quartets',
    artist: 'Ben Johnston',
    tags: ['seq', 'just intonation'],
    level: 3,
    blurb:
      'A minor-key figure in 5-limit just tuning, three against two, with its own pure, dark colour.',
    how: 'The 12-JI scale’s minor third is 6 : 5 and its minor sixth 8 : 5: purer and darker than the piano’s. Two sequencers play a C minor figure on two rhythms, so the just intervals collide in ever-new pairs.',
    bpm: 96,
    steps: [
      {
        title: 'Saw and square',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at C5. QUANTIZE on 12-JI.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', levels: [3, 0, 0] }),
          'vco.quantize': '12-JI',
        },
        listen: 'with a key held, a bright octave.',
      },
      {
        title: 'Three against two',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, Rhythm 2 at ÷2 on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [2, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'C minor, pure',
        module: 'mod',
        why: 'SEQ OCT ±1: Sequencer 1 C, E♭, A♭, G; Sequencer 2 C, B♭, A♭, E♭.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(8), step(7)]),
          ...seq(2, [0, step(-2), step(-4), step(-9)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Plucked',
        module: 'filter',
        why: 'A light pluck and a medium decay.',
        set: shape({ cutoff: 4.8, res: 2, amt: 2.2, fd: 4.2, ad: 5 }),
        listen: 'with a key, a pluck.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a dark, glassy minor figure whose intervals never beat.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: 12-JI, a pure 6 : 5 minor third.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 12-ET',
        hear: 'The familiar tempered minor: brighter, a little rougher.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷5',
        hear: 'Five against two: the figure stretches over the bar.',
      },
    ],
  },
  {
    id: 'shc-beatless-pad',
    name: 'Beatless Pad',
    ref: 'In the style of Stars of the Lid',
    artist: 'Stars of the Lid',
    tags: ['pad', 'just intonation'],
    level: 2,
    blurb: 'A slow, held pad whose chords change twice a bar, every one of them perfectly still.',
    how: 'With EG held the pad never stops; with 8-JI every chord is tuned to pure ratios, so there is none of the slow beating that makes a tempered pad shimmer. The two VCOs move in parallel thirds and sixths once every half bar, their subs filling in below.',
    bpm: 56,
    riff: [[0, 60, 8]],
    steps: [
      {
        title: 'A still chord',
        module: 'osc',
        why: 'Saws: VCO 1 at C4 and VCO 2 at E4, subs at ÷2 and ÷3 on both; QUANTIZE on 8-JI.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [3, 3, 3] }),
          ...vco(2, { note: 'E4', subs: [2, 3], levels: [3, 3, 2] }),
          'vco.quantize': '8-JI',
        },
        listen: 'with a key held, a warm chord that does not move at all.',
      },
      {
        title: 'Half-bar changes',
        module: 'mod',
        why: 'Rhythm 1 at ÷8 drives both sequencers.',
        set: rhythms({ 1: [8, true, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Parallel motion',
        module: 'mod',
        why: 'SEQ OCT ±1; both VCOs move together: down to A, to F, to G.',
        set: {
          'seq.oct': 1,
          ...seq(1, [0, step(-3), step(-7), step(-5)]),
          ...seq(2, [0, step(-4), step(-7), step(-5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Soft and dark',
        module: 'filter',
        why: 'The filter low.',
        set: shape({ cutoff: 4.2, res: 1 }),
        listen: 'with a key, a soft, dark chord.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, PLAY lit, on the app’s clock. The riff is two bars.',
        set: play('held'),
        listen: 'chords sliding into each other every half bar, each one completely still.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: 8-JI, every chord pure.',
      'rhythm1.div': 'In this sound: a change every half bar.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 8-ET',
        hear: 'The chords begin to shimmer and beat: equal temperament.',
      },
      {
        id: 'vcf.cutoff',
        try: 'Turn CUTOFF to 6',
        hear: 'The saws come forward: a brighter, more present pad.',
      },
    ],
  },
];
