/**
 * Polyrhythm: the synth plays itself (PLAY lit, a held C4 from the app), its four rhythm generators dividing one
 * clock (a sixteenth) by whole numbers, Henry Cowell’s Rhythmicon idea. Each sound’s cycle is the lowest common
 * multiple of its divisors.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { div, play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const POLY: SoundSpec[] = [
  {
    id: 'shc-two-against-three',
    name: 'Two Against Three',
    ref: 'Two tunes woven on twos and threes, the cross-rhythm at the heart of West African drumming',
    artist: 'West African drumming',
    tags: ['seq', 'polyrhythm'],
    level: 1,
    blurb:
      'The first polyrhythm: one tune on every second sixteenth, another on every third, meeting every six.',
    how: 'Rhythm 1 divides the clock by 2 and steps Sequencer 1; Rhythm 2 divides it by 3 and steps Sequencer 2. Each step of either fires the envelopes, so you hear the two pulses woven together, with VCO 1’s four notes moving on one and VCO 2’s on the other. They meet on the downbeat every six sixteenths, and each tune comes round at its own length, so the pairing of notes keeps changing.',
    bpm: 92,
    steps: [
      {
        title: 'Two voices',
        module: 'osc',
        why: 'Both VCOs on square, VCO 2 a fifth up at G4, each with its octave sub.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'G4', wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
        },
        listen: 'with a key held, an open fifth in octaves.',
      },
      {
        title: 'Two pulses',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 drives Sequencer 1; Rhythm 2 at ÷3 drives Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, false, true] }),
        listen: 'nothing yet: the rhythms wait for PLAY and the clock.',
      },
      {
        title: 'Two tunes',
        module: 'mod',
        why: 'C major (8-ET), SEQ OCT ±1. Sequencer 1 climbs a triad on VCO 1; Sequencer 2 wanders round G on VCO 2.',
        set: {
          'vco.quantize': '8-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(4), step(7), step(4)]),
          ...seq(2, [0, step(2), step(-2), step(5)]),
        },
        listen: 'still nothing until it plays.',
      },
      {
        title: 'Short notes',
        module: 'filter',
        why: 'A plucked filter and a short VCA decay, so each step is a distinct note.',
        set: shape({ cutoff: 4.8, res: 2, amt: 2.4, fd: 4, ad: 4.6 }),
        listen: 'with a key, a short pluck.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit. The app’s Play clocks it: a sixteenth a clock, in time with the bar.',
        set: play(),
        listen:
          'two interlocking tunes, eighth notes against dotted eighths, meeting every six sixteenths.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the two of two against three.',
      'rhythm2.div': 'In this sound: the three.',
      'vco.quantize': 'In this sound: keeps both tunes in C major.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷5',
        hear: 'Two against five: the lines meet only every ten sixteenths.',
      },
      {
        id: 'rhythm1.seq2',
        try: 'Light RHYTHM 1 SEQ 2 too',
        hear: 'Sequencer 2 now moves on both rhythms: its tune hurries and tangles with the first.',
      },
    ],
  },
  {
    id: 'shc-three-against-four',
    name: 'Three Against Four',
    ref: 'A bright minor arpeggio against a falling line, three against four, slowly phasing against the bar',
    artist: 'Minimalism',
    tags: ['seq', 'polyrhythm', 'minimal'],
    level: 2,
    blurb:
      'A minor arpeggio on dotted eighths against a falling line on quarters, coming round every three beats.',
    how: 'Rhythm 1 at ÷3 and Rhythm 2 at ÷4 meet every twelve sixteenths, three beats, so against the bar of four the pattern slides a beat each time round: a quiet phase shift built into the arithmetic. Sawtooth plucks in C minor keep it bright and percussive.',
    bpm: 104,
    steps: [
      {
        title: 'Two saws',
        module: 'osc',
        why: 'VCO 1 at C4 and VCO 2 an octave up, both sawtooth, VCO 1 with its octave sub.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a bright octave.',
      },
      {
        title: 'Three against four',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1; Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Arpeggio and line',
        module: 'mod',
        why: 'The twelve notes (12-ET) at SEQ OCT ±1: Sequencer 1 spells C minor up from C4, Sequencer 2 falls from C5.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(7), step(10)]),
          ...seq(2, [0, step(-2), step(-4), step(-5)]),
        },
        listen: 'still waiting for PLAY.',
      },
      {
        title: 'Pluck',
        module: 'filter',
        why: 'A bright, short pluck: filter envelope up, short decays.',
        set: shape({ cutoff: 4.6, res: 2.5, amt: 2.8, fd: 3.8, ad: 4.4 }),
        listen: 'with a key, a short, bright note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'the arpeggio and the falling line catching each other a beat later every bar.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the dotted-eighth arpeggio.',
      'rhythm2.div': 'In this sound: the quarter-note line.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷8',
        hear: 'The line slows to half notes and the arpeggio dominates.',
      },
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 6.5',
        hear: 'Notes overlap into a shimmering wash.',
      },
    ],
  },
  {
    id: 'shc-four-against-five',
    name: 'Four Against Five',
    ref: 'Ringing just-tuned bell tones, five against four, interlocking like gamelan metallophones',
    artist: 'Gamelan',
    tags: ['seq', 'polyrhythm', 'bell'],
    level: 2,
    blurb:
      'Bell tones in just C major: quarters against groups of five sixteenths, round every five beats.',
    how: 'Five against four takes twenty sixteenths to come back together, longer than a bar, so it never settles where you expect. Squares through a resonant filter ring like small gongs, and the just C major scale (8-JI) keeps every pair of notes pure.',
    bpm: 88,
    riff: [[0, 60, 5]],
    steps: [
      {
        title: 'Two bells',
        module: 'osc',
        why: 'Squares: VCO 1 at C5 over ÷3, VCO 2 at E5 over ÷3.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [3, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'E5', wave: 'square', subs: [3, 3], levels: [3, 2, 0] }),
        },
        listen: 'with a key held, a hollow major third with a deep shadow.',
      },
      {
        title: 'Five against four',
        module: 'mod',
        why: 'Rhythm 1 at ÷4 on Sequencer 1, Rhythm 2 at ÷5 on Sequencer 2.',
        set: rhythms({ 1: [4, true, false], 2: [5, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'A pentatonic of bells',
        module: 'mod',
        why: 'Just C major (8-JI), SEQ OCT ±1: Sequencer 1 C D G A, Sequencer 2 E C G D.',
        set: {
          'vco.quantize': '8-JI',
          'seq.oct': 1,
          ...seq(1, [0, step(2), step(7), step(9)]),
          ...seq(2, [0, step(-4), step(3), step(-2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Ring',
        module: 'filter',
        why: 'Resonance, a ping from the VCF EG and a long ring.',
        set: shape({ cutoff: 5.6, res: 4, amt: 1.6, fd: 4.2, ad: 6.2 }),
        listen: 'with a key, a ringing strike.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is five beats, one whole cycle.',
        set: play(),
        listen: 'two bell parts interlocking, round again every five beats.',
      },
    ],
    context: {
      'vco.quantize': 'In this sound: just C major, so the bells never beat.',
      'rhythm2.div': 'In this sound: the five that crosses the bar.',
    },
    tweaks: [
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 8-ET',
        hear: 'Equal temperament: the thirds shimmer and beat slightly.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷3',
        hear: 'Three against five: fifteen sixteenths a cycle, more restless.',
      },
    ],
  },
  {
    id: 'shc-five-against-seven',
    name: 'Five Against Seven',
    ref: 'Woody marimba lines in five against seven, a cycle far too long for the ear to count',
    artist: 'Player-piano canons',
    tags: ['seq', 'polyrhythm'],
    level: 3,
    blurb:
      'Woody marimba notes, five against seven: a cycle of thirty-five sixteenths that no ear can count.',
    how: 'Nancarrow punched player-piano rolls with tempo ratios no pianist could play. Five against seven comes round only after thirty-five sixteenths, almost nine beats, so the two lines seem free of each other and of the bar, while the arithmetic keeps every note in place. Short, filtered squares sound like a marimba.',
    bpm: 132,
    steps: [
      {
        title: 'Marimba',
        module: 'osc',
        why: 'Squares, VCO 2 a fourth up, and both subs an octave down.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'F4', wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
        },
        listen: 'with a key held, a hollow fourth.',
      },
      {
        title: 'Five and seven',
        module: 'mod',
        why: 'Rhythm 1 at ÷5 on Sequencer 1; Rhythm 2 at ÷7 on Sequencer 2.',
        set: rhythms({ 1: [5, true, false], 2: [7, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Two modal lines',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 a Dorian figure on C, Sequencer 2 a falling one from F.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(5), step(10)]),
          ...seq(2, [0, step(-1), step(-3), step(2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Mallets',
        module: 'filter',
        why: 'A low filter with a quick envelope pluck and a short, woody decay.',
        set: shape({ cutoff: 4.2, res: 1.5, amt: 2.8, fd: 3.6, ad: 4.2 }),
        listen: 'with a key, a soft, woody knock.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'two lines that never seem to agree, yet never collide.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the five.',
      'rhythm2.div': 'In this sound: the seven; with the five, thirty-five sixteenths to a cycle.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷10',
        hear: 'Five against ten: the lines lock together, the mystery gone.',
      },
      {
        id: 'rhythm3.seq1',
        try: 'Light RHYTHM 3 SEQ 1 (÷3)',
        hear: 'A third pulse joins Sequencer 1: busier, and the cycle grows to 105 sixteenths.',
      },
    ],
  },
  {
    id: 'shc-rhythmicon-ratios',
    name: 'Rhythmicon Ratios',
    ref: 'The overtone series played as rhythm, 2:3:4:5, as Henry Cowell’s electronic Rhythmicon did',
    artist: 'Henry Cowell',
    tags: ['seq', 'polyrhythm', 'rhythmicon'],
    level: 3,
    blurb: 'Four rhythms in the ratios 2:3:4:5, each picking an undertone from its own sequencer.',
    how: 'Cowell and Theremin’s Rhythmicon (1931) played the overtone series as rhythm: a pitch twice as high pulsed twice as fast. Here all four rhythm generators run, ÷2 and ÷3 on Sequencer 1, ÷4 and ÷5 on Sequencer 2, and the sequencers move the subs’ divisors rather than the VCOs, so every hit lands on a different note of the undertone series. Rhythm and harmony come from the same whole numbers.',
    bpm: 76,
    steps: [
      {
        title: 'Two undertone stacks',
        module: 'osc',
        why: 'VCO 1 at C6 and VCO 2 at G5 on square, quiet; their subs loud, starting at ÷4 and ÷6.',
        set: {
          ...vco(1, { note: 'C6', wave: 'square', subs: [4, 6], levels: [2, 4, 3] }),
          ...vco(2, { note: 'G5', wave: 'square', subs: [4, 6], levels: [2, 4, 3] }),
        },
        listen: 'with a key held, a hollow chord under two high tones.',
      },
      {
        title: 'All four rhythms',
        module: 'mod',
        why: 'Rhythms 1 to 4 at ÷2, ÷3, ÷4, ÷5: the first two on Sequencer 1, the last two on Sequencer 2.',
        set: rhythms({
          1: [2, true, false],
          2: [3, true, false],
          3: [4, false, true],
          4: [5, false, true],
        }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Steps move the divisors',
        module: 'mod',
        why: 'SEQ OCT ±5, and each sequencer assigned to both its subs: the steps lower the divisors by 0, 1, 2 and 3.',
        set: {
          'seq.oct': 5,
          ...seq(1, [0, div(1), div(2), div(3)], { sub1: true, sub2: true }),
          ...seq(2, [0, div(1), div(2), div(3)], { sub1: true, sub2: true }),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Clear strikes',
        module: 'filter',
        why: 'An open filter with a little ping and short decays.',
        set: shape({ cutoff: 5.6, res: 2, amt: 1.6, fd: 3.8, ad: 4.6 }),
        listen: 'with a key, a short, clear chord.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen:
          'a dense, ticking web of rhythm whose chords climb the undertone series and fall back.',
      },
    ],
    context: {
      'rhythm4.div': 'In this sound: the five of 2:3:4:5.',
      'seq1.assign_sub1': 'In this sound: Sequencer 1 picks undertones, not pitches.',
    },
    tweaks: [
      {
        id: 'rhythm2.seq1',
        try: 'Turn off RHYTHM 2 SEQ 1',
        hear: 'Sequencer 1 slows to plain eighths: the web thins out.',
      },
      {
        id: 'seq.oct',
        try: 'Set SEQ OCT to ±2',
        hear: 'The steps move the divisors less: the chords cluster near the top of the series.',
      },
    ],
  },
  {
    id: 'shc-hemiola-bass',
    name: 'Hemiola Bass',
    ref: 'A low bass on threes arguing with a high answer on twos, the hemiola of Afro-Cuban bembé',
    artist: 'Afro-Cuban music',
    tags: ['bass', 'polyrhythm'],
    level: 2,
    blurb:
      'A low bass on dotted quarters against a high answer on quarters: three against two in the bass.',
    how: 'A hemiola sets three beats against two. Rhythm 1 at ÷6 (dotted quarters) moves a bass built from VCO 1’s subs; Rhythm 2 at ÷4 (quarters) moves VCO 2 two octaves up. Every hit sounds both, so the bass is re-struck under the answers and the two meters argue in the low end.',
    bpm: 98,
    riff: [[0, 60, 3]],
    steps: [
      {
        title: 'Bass and answer',
        module: 'osc',
        why: 'VCO 1 silent with its subs at ÷2 and ÷4 for the bass; VCO 2 square at C5 for the answer.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 4], levels: [0, 4, 5] }),
          ...vco(2, { note: 'C5', wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a deep bass with a thin tone far above.',
      },
      {
        title: 'Three against two',
        module: 'mod',
        why: 'Rhythm 1 at ÷6 on Sequencer 1, Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [6, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Bass line and answers',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 walks the bass C, F, G, E♭; Sequencer 2 answers C, E♭, B♭, G.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(5), step(7), step(3)]),
          ...seq(2, [0, step(3), step(-2), step(-5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Punch',
        module: 'filter',
        why: 'The filter low with a firm envelope and a medium decay.',
        set: shape({ cutoff: 3.8, res: 2, amt: 2.6, fd: 4.4, ad: 5 }),
        listen: 'with a key, a punchy low note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is three beats, the hemiola’s cycle.',
        set: play(),
        listen:
          'the bass on every dotted quarter, the answers on every beat, together every three beats.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the bass’s dotted quarters.',
      'rhythm2.div': 'In this sound: the answering quarters.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷8',
        hear: 'The bass on half notes: the hemiola becomes a plain two-to-one.',
      },
      {
        id: 'mix.vco2',
        try: 'Turn VCO 2 LEVEL to 0',
        hear: 'Only the bass: hear how the answers still re-strike it on every beat.',
      },
    ],
  },
  {
    id: 'shc-never-twice',
    name: 'Never Twice',
    ref: 'Soft chimes on four prime-ish rhythms that never line up twice in a listening: generative ambient',
    artist: 'Generative ambient',
    tags: ['seq', 'ambient', 'polyrhythm'],
    level: 2,
    blurb:
      'Soft chimes on rhythms of 7, 9, 11 and 13: a cycle of thousands of sixteenths that never repeats in a listening.',
    how: 'Eno made Music for Airports from tape loops of unrelated lengths. Four rhythm generators at prime-ish divisors do the same: 7 and 9 on one sequencer, 11 and 13 on the other, coming back together only after 9,009 sixteenths, over half an hour at this tempo. Just C major and soft, long envelopes keep every collision gentle.',
    bpm: 72,
    steps: [
      {
        title: 'Soft chimes',
        module: 'osc',
        why: 'VCO 1 at C5 and VCO 2 at G5, square, with quiet subs at ÷2.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 4], levels: [3, 2, 0] }),
          ...vco(2, { note: 'G5', wave: 'square', subs: [2, 4], levels: [3, 2, 0] }),
        },
        listen: 'with a key held, a soft open fifth.',
      },
      {
        title: 'Unrelated loops',
        module: 'mod',
        why: 'Rhythms at ÷7 and ÷9 on Sequencer 1, ÷11 and ÷13 on Sequencer 2.',
        set: rhythms({
          1: [7, true, false],
          2: [9, true, false],
          3: [11, false, true],
          4: [13, false, true],
        }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'A pentatonic',
        module: 'mod',
        why: 'Just C major (8-JI) at ±1, both sequencers on pentatonic notes.',
        set: {
          'vco.quantize': '8-JI',
          'seq.oct': 1,
          ...seq(1, [0, step(2), step(4), step(9)]),
          ...seq(2, [0, step(-3), step(2), step(5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Slow fades',
        module: 'env',
        why: 'A soft attack and a long decay, the filter low.',
        set: shape({ cutoff: 4.6, res: 1.5, amt: 1.2, fd: 6, aa: 3.5, ad: 7.6 }),
        listen: 'with a key, a chime that swells and fades over a second.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'chimes falling at unpredictable moments, each meeting new.',
      },
    ],
    context: {
      'rhythm3.div': 'In this sound: one of four loops of unrelated length.',
      'vca_eg.decay': 'In this sound: how much the chimes overlap.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷8',
        hear: 'One loop falls into step with the bar: the music gains a faint pulse.',
      },
      {
        id: 'vco.quantize',
        try: 'Set QUANTIZE to 12-JI',
        hear: 'Chromatic notes join: darker, less pastoral.',
      },
    ],
  },
  {
    id: 'shc-downbeat-boom',
    name: 'Downbeat Boom',
    ref: 'Dub chords on dotted eighths over a sub that moves once a bar, Basic Channel’s dub techno in outline',
    artist: 'Basic Channel',
    tags: ['seq', 'polyrhythm', 'techno'],
    level: 2,
    blurb: 'Dub chords on dotted eighths over a sub boom that falls on the first of every bar.',
    how: 'Rhythm 1 at ÷16 fires once a bar and drives Sequencer 1, which drops VCO 1’s sub bass to a new root; Rhythm 2 at ÷3 drives the chord stabs of VCO 2. Every stab re-sounds the bass too, but only the bar’s first step moves it, so the low end walks slowly under a skittering top. A resonant, decaying filter gives the dub chord.',
    bpm: 120,
    riff: [[0, 60, 16]],
    steps: [
      {
        title: 'Chord over boom',
        module: 'osc',
        why: 'VCO 1 silent with subs at ÷4 and ÷8; VCO 2 sawtooth at E♭5 with subs at ÷2 and ÷3 for the chord.',
        set: {
          ...vco(1, { wave: 'square', subs: [4, 8], levels: [0, 4, 5] }),
          ...vco(2, { note: 'Eb5', subs: [2, 3], levels: [3, 3, 3] }),
        },
        listen: 'with a key held, a minor-ish chord over a very low boom.',
      },
      {
        title: 'Bar and stabs',
        module: 'mod',
        why: 'Rhythm 1 at ÷16 on Sequencer 1; Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [16, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Roots and voicings',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 moves the root C, A♭, F, G bar by bar; Sequencer 2 shifts the chord a little.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(-4), step(5), step(7)]),
          ...seq(2, [0, 0, step(-2), step(2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Dub filter',
        module: 'filter',
        why: 'A low, resonant filter that the envelope flicks open, and a short VCA decay.',
        set: shape({ cutoff: 3.6, res: 5, amt: 2.4, fd: 4.4, ad: 4.8 }),
        listen: 'with a key, a short, wet chord stab.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is four bars, one turn of the bass.',
        set: play(),
        listen: 'stabs on dotted eighths, the bass moving once a bar under them.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: once a bar, the bass’s move.',
      'vcf.resonance': 'In this sound: the dub chord’s wet ring.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷2',
        hear: 'Straight eighths: more house than dub.',
      },
      {
        id: 'vcf_eg.decay',
        try: 'Turn VCF DECAY to 6',
        hear: 'The stabs stay open longer, brighter and bigger.',
      },
    ],
  },
  {
    id: 'shc-twelve-over-sixteen',
    name: 'Twelve Over Sixteen',
    ref: 'Aphex Twin’s slippery acid lines: a resonant four-note figure starting a beat earlier every bar',
    artist: 'Aphex Twin',
    tags: ['seq', 'polyrhythm', 'acid'],
    level: 2,
    blurb:
      'A four-note acid figure on dotted eighths: twelve sixteenths long against a bar of sixteen.',
    how: 'Four steps at ÷3 last twelve sixteenths, so the figure starts a beat earlier each bar and only lines up with the bar again after three. Sequencer 2 on plain sixteenths moves the filter’s companion, VCO 2, an octave up. A resonant ladder with a snappy envelope gives the acid squelch.',
    bpm: 128,
    riff: [[0, 60, 12]],
    steps: [
      {
        title: 'One saw and its shadow',
        module: 'osc',
        why: 'VCO 1 saw at C4 with its octave sub; VCO 2 saw an octave up, quieter.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [5, 3, 0] }),
          ...vco(2, { note: 'C5', levels: [2, 0, 0] }),
        },
        listen: 'with a key held, a bright saw in octaves.',
      },
      {
        title: 'Three and one',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, Rhythm 2 at ÷1 on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [1, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The figure',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, C, E♭, G♭; Sequencer 2 twitches VCO 2 between octaves and sevenths.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, 0, step(3), step(6)]),
          ...seq(2, [0, step(-2), 0, step(-12)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Squelch',
        module: 'filter',
        why: 'The filter low and resonant, a strong envelope that falls fast, and short notes.',
        set: shape({ cutoff: 3.2, res: 6.5, amt: 3, fd: 3.8, ad: 4.6 }),
        listen: 'with a key, a rubbery squelch.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is three bars, the figure’s way back to the downbeat.',
        set: play(),
        listen: 'a squelching line on every sixteenth whose accent pattern slides across the bar.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the figure’s dotted eighths, twelve sixteenths a turn.',
      'vcf.resonance': 'In this sound: the acid squelch.',
    },
    tweaks: [
      {
        id: 'vcf.resonance',
        try: 'Turn RESONANCE to 8',
        hear: 'The filter screams on every note.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷5',
        hear: 'Twenty sixteenths a turn: the figure drifts across the bar more slowly.',
      },
    ],
  },
];
