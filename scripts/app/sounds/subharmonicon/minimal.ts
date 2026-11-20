/**
 * Minimalism: repetition, phase and interlock, which the rhythm generators make from arithmetic alone. Each sound
 * keeps one idea running and lets the divisions turn it over.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const MINIMAL: SoundSpec[] = [
  {
    id: 'shc-clapping-ratios',
    name: 'Clapping Ratios',
    ref: 'In the style of Steve Reich’s Clapping Music',
    artist: 'Steve Reich',
    tags: ['perc', 'minimal', 'polyrhythm'],
    level: 2,
    blurb:
      'Two dry, clap-like voices on interlocking pulses of three and four plus two: a twelve-beat pattern.',
    how: 'Clapping Music plays one twelve-beat pattern against itself. Here Sequencer 1 moves on Rhythm 1 (÷3) and Sequencer 2 on Rhythms 2 and 3 (÷4 and ÷2), so the two voices interlock in a twelve-sixteenth pattern. Very short, bright envelopes on detuned squares give a dry, clap-like snap.',
    bpm: 112,
    riff: [[0, 60, 3]],
    steps: [
      {
        title: 'Snaps',
        module: 'osc',
        why: 'Squares at C6 and D6, a whole tone apart, with subs at ÷7 and ÷9 for noise-like grit.',
        set: {
          ...vco(1, { note: 'C6', wave: 'square', subs: [7, 9], levels: [3, 4, 4] }),
          ...vco(2, { note: 'D6', wave: 'square', subs: [7, 9], levels: [3, 4, 4] }),
        },
        listen: 'with a key held, a harsh, clustered buzz.',
      },
      {
        title: 'Two interlocking parts',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1; Rhythms 2 (÷4) and 3 (÷2) on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [4, false, true], 3: [2, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'A little colour',
        module: 'mod',
        why: 'SEQ OCT ±1 with no QUANTIZE: each sequencer nudges its VCO a little, so the claps vary in pitch.',
        set: { 'seq.oct': 1, ...seq(1, [0, 0.8, -0.6, 0.3]), ...seq(2, [0, -0.7, 0.5, -0.3]) },
        listen: 'still waiting.',
      },
      {
        title: 'Snap',
        module: 'filter',
        why: 'The filter high with resonance, a tiny envelope ping, and a 15 ms decay.',
        set: shape({ cutoff: 7, res: 3, amt: 1, fd: 2, ad: 2.3 }),
        listen: 'with a key, a snap.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is three beats, the pattern’s length.',
        set: play(),
        listen: 'a dry, interlocking clap pattern, round every twelve sixteenths.',
      },
    ],
    context: {
      'vca_eg.decay': 'In this sound: short enough to make a tone a snap.',
      'rhythm3.seq2': 'In this sound: the eighths that fill the second part.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷5',
        hear: 'The first part slips against the second: a phase you can follow.',
      },
      { id: 'vca_eg.decay', try: 'Turn VCA DECAY to 4', hear: 'The claps become tuned knocks.' },
    ],
  },
  {
    id: 'shc-glass-arpeggios',
    name: 'Glass Arpeggios',
    ref: 'In the style of Philip Glass’s organ arpeggios',
    artist: 'Philip Glass',
    tags: ['seq', 'minimal', 'arpeggio'],
    level: 2,
    blurb:
      'Rolling organ arpeggios, three notes against two, changing chord every two bars under the riff.',
    how: 'Glass’s keyboard writing stacks triplets against duplets on one chord for bars at a time. Sequencer 1 on Rhythm 1 rolls a triad figure, Sequencer 2 rolls another on a different division; the riff changes the chord every two bars: A minor, F, C, G.',
    bpm: 132,
    riff: [
      [0, 57, 8],
      [8, 53, 8],
      [16, 60, 8],
      [24, 55, 8],
    ],
    steps: [
      {
        title: 'Organ',
        module: 'osc',
        why: 'Squares: VCO 1 at C4, VCO 2 at C5, each with its octave sub.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', subs: [2, 3], levels: [3, 2, 0] }),
        },
        listen: 'with a key held, an organ in octaves.',
      },
      {
        title: 'Three and two',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Triad figures',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, E, G, E; Sequencer 2 G, E, C, E an octave up.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(4), step(7), step(4)]),
          ...seq(2, [step(7), step(4), 0, step(4)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Organ envelope',
        module: 'env',
        why: 'The filter fairly open and the VCA quick, with a short decay.',
        set: shape({ cutoff: 5.6, res: 0.5, ad: 4.6 }),
        listen: 'with a key, a short organ note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'rolling arpeggios, two against three, moving through A minor, F, C and G.',
      },
    ],
    context: {
      'rhythm2.div': 'In this sound: the triplet-like three against the eighths’ two.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷1',
        hear: 'Sixteenths against dotted eighths: a denser, Einstein-on-the-Beach rush.',
      },
      { id: 'vcf.cutoff', try: 'Turn CUTOFF to 7.5', hear: 'A brighter, piercing organ.' },
    ],
  },
  {
    id: 'shc-in-c-cells',
    name: 'In C Cells',
    ref: 'In the style of Terry Riley’s In C',
    artist: 'Terry Riley',
    tags: ['seq', 'minimal'],
    level: 2,
    blurb: 'A bright eighth-note pulse on high C and a short melodic cell drifting against it.',
    how: 'In C is played over a pulse of high Cs on eighths. Sequencer 2 here never moves: its job is the pulse, VCO 2 on C6. Sequencer 1 plays a small cell of the piece’s notes on Rhythm 1 at ÷3, so the cell slides against the pulse as the ensemble’s cells do.',
    bpm: 120,
    steps: [
      {
        title: 'Pulse and voice',
        module: 'osc',
        why: 'VCO 1 square at C5 with its octave sub; VCO 2 square at C6 for the pulse.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'C6', wave: 'square', levels: [2, 0, 0] }),
        },
        listen: 'with a key held, two Cs, two octaves apart.',
      },
      {
        title: 'Pulse and cell',
        module: 'mod',
        why: 'Rhythm 2 at ÷2 on Sequencer 2 (the pulse); Rhythm 1 at ÷3 on Sequencer 1 (the cell).',
        set: rhythms({ 1: [3, true, false], 2: [2, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The cell',
        module: 'mod',
        why: 'C major (8-ET) at ±1: Sequencer 1 E, F, E, C. Sequencer 2 stays put.',
        set: { 'vco.quantize': '8-ET', 'seq.oct': 1, ...seq(1, [step(4), step(5), step(4), 0]) },
        listen: 'still waiting.',
      },
      {
        title: 'Mallets',
        module: 'filter',
        why: 'A pluck and a short decay.',
        set: shape({ cutoff: 5.4, res: 2, amt: 1.8, fd: 3.8, ad: 4.4 }),
        listen: 'with a key, a mallet note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'the high C pulse in eighths and a little cell sliding across it.',
      },
    ],
    context: {
      'rhythm2.div': 'In this sound: the pulse.',
      'seq1.step2': 'In this sound: the F that makes the cell.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷5',
        hear: 'A slower cell, landing in new places against the pulse.',
      },
      {
        id: 'seq1.step2',
        try: 'Turn SEQ 1 STEP 2 to 2.92',
        hear: 'The cell reaches up to G: a later figure from the piece.',
      },
    ],
  },
  {
    id: 'shc-additive-process',
    name: 'Additive Process',
    ref: 'In the style of Frederic Rzewski’s Les Moutons de Panurge',
    artist: 'Frederic Rzewski',
    tags: ['seq', 'minimal'],
    level: 3,
    blurb:
      'One melody, read at two speeds at once by the same notes: a process you can hear unfold.',
    how: 'Process music lets a rule write the piece. Both sequencers hold the same four notes; Sequencer 1 moves on Rhythms 1 and 2 together (÷2 or ÷3), Sequencer 2 on ÷4 alone, so one voice runs through the melody in an uneven gait while the other walks it steadily, and their pairings rotate as the process goes on.',
    bpm: 104,
    steps: [
      {
        title: 'Two voices',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub, VCO 2 square at G4.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'G4', wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a fifth.',
      },
      {
        title: 'Uneven and even',
        module: 'mod',
        why: 'Rhythms 1 (÷2) and 2 (÷3) on Sequencer 1; Rhythm 3 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, true, false], 3: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'One melody',
        module: 'mod',
        why: 'C major (8-ET) at ±1: the same four steps on both, a falling figure.',
        set: {
          'vco.quantize': '8-ET',
          'seq.oct': 1,
          ...seq(1, [step(7), step(5), step(4), step(2)]),
          ...seq(2, [step(7), step(5), step(4), step(2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Plucked',
        module: 'filter',
        why: 'A pluck and a short decay.',
        set: shape({ cutoff: 4.8, res: 1.5, amt: 2.2, fd: 4, ad: 4.6 }),
        listen: 'with a key, a pluck.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'one melody heard in a limp against itself in a walk.',
      },
    ],
    context: {
      'rhythm2.seq1': 'In this sound: the ÷3 that gives the first voice its uneven gait.',
    },
    tweaks: [
      {
        id: 'rhythm2.seq1',
        try: 'Turn off RHYTHM 2 SEQ 1',
        hear: 'The first voice walks evenly at twice the second’s speed: the process stops.',
      },
      {
        id: 'rhythm3.div',
        try: 'Turn RHYTHM 3 to ÷5',
        hear: 'A slower second voice that lands on new pairings.',
      },
    ],
  },
  {
    id: 'shc-kotekan',
    name: 'Kotekan',
    ref: 'In the style of Balinese gamelan gong kebyar',
    artist: 'Gamelan gong kebyar',
    tags: ['seq', 'bell', 'interlock'],
    level: 3,
    blurb:
      'Two bright metallophone parts that interlock into one fast line, as Balinese kotekan does.',
    how: 'In kotekan two players each play half of a fast figure, their notes falling between each other’s. Sequencer 1 moves on even sixteenths (÷2), Sequencer 2 on Rhythm 2 at ÷4 and Rhythm 3 at ÷3, so the two parts mesh into a rapid, glittering line. The pelog-like notes come from 12-ET steps.',
    bpm: 132,
    steps: [
      {
        title: 'Metallophones',
        module: 'osc',
        why: 'Squares at C5 and E♭5, each with a ÷3 sub, a little detuned between them.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [3, 2], levels: [4, 2, 0] }),
          ...vco(2, { note: 'Eb5', wave: 'square', subs: [3, 2], levels: [4, 2, 0] }),
        },
        listen: 'with a key held, a bright, ringing interval.',
      },
      {
        title: 'Two halves',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1; Rhythms 2 (÷4) and 3 (÷3) on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [4, false, true], 3: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Pelog-like notes',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, D♭, E♭, G; Sequencer 2 E♭, G, A♭, D♭.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(1), step(3), step(7)]),
          ...seq(2, [0, step(4), step(5), step(-2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Ring',
        module: 'filter',
        why: 'Resonance, a ping and a ringing decay.',
        set: shape({ cutoff: 6, res: 3.5, amt: 1.4, fd: 3.6, ad: 5.4 }),
        listen: 'with a key, a ringing bar.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'two parts meshing into one glittering, rapid line.',
      },
    ],
    context: {
      'rhythm3.seq2': 'In this sound: fills the gaps the first part leaves.',
    },
    tweaks: [
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 7',
        hear: 'The bars ring on under each other: the shimmering wash of a full gamelan.',
      },
      {
        id: 'rhythm2.seq2',
        try: 'Turn off RHYTHM 2 SEQ 2',
        hear: 'The second part thins out to dotted eighths.',
      },
    ],
  },
  {
    id: 'shc-gong-cycle',
    name: 'Gong Cycle',
    ref: 'In the style of Javanese gamelan’s colotomic structure',
    artist: 'Javanese gamelan',
    tags: ['perc', 'bell', 'gamelan'],
    level: 3,
    blurb:
      'A great gong once a bar, smaller gongs on the half and quarter: time marked in nested divisions.',
    how: 'Javanese gamelan marks its cycles with gongs of different sizes: the largest at the end of the cycle, smaller ones dividing it. Rhythm 1 at ÷16, Rhythm 2 at ÷8 and Rhythm 3 at ÷4 are exactly that, nested divisions of one clock. Each drives a sequencer step that drops the gong lower when the larger divisions fall together.',
    bpm: 90,
    riff: [[0, 60, 8]],
    steps: [
      {
        title: 'Gongs',
        module: 'osc',
        why: 'Squares: VCO 1 at C5 over ÷5 and ÷7, VCO 2 at F#5 over ÷5 and ÷7.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [5, 7], levels: [2, 4, 3] }),
          ...vco(2, { note: 'F#5', wave: 'square', subs: [5, 7], levels: [2, 3, 3] }),
        },
        listen: 'with a key held, a dark, clangorous chord.',
      },
      {
        title: 'Nested divisions',
        module: 'mod',
        why: 'Rhythms at ÷16, ÷8 and ÷4, all on Sequencer 1.',
        set: rhythms({ 1: [16, true, false], 2: [8, true, false], 3: [4, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Big and small',
        module: 'mod',
        why: 'SEQ OCT ±1, Sequencer 1 on VCO 1: the bar’s first step an octave low, the others higher.',
        set: {
          'seq.oct': 1,
          'vco.quantize': '12-ET',
          ...seq(1, [step(-12), step(-5), 0, step(-5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Bloom',
        module: 'env',
        why: 'A resonant filter and long decays.',
        set: shape({ cutoff: 4.6, res: 3, amt: 1.8, fd: 5.2, ad: 7.4 }),
        listen: 'with a key, a gong blooming and fading.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is two bars.',
        set: play(),
        listen: 'a deep gong once a bar, smaller strokes dividing it in halves and quarters.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the great gong, once a bar.',
      'vca_eg.decay': 'In this sound: how long each gong rings.',
    },
    tweaks: [
      {
        id: 'rhythm3.div',
        try: 'Turn RHYTHM 3 to ÷3',
        hear: 'The smallest gongs fall off the grid: the cycle turns irregular.',
      },
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 3.54',
        hear: 'VCO 2 a fourth over VCO 1 instead of a tritone: warmer, more pitched gongs.',
      },
    ],
  },
];
