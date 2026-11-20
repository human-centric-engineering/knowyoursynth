/**
 * The riff plays the rhythm: PLAY lit with EG off, so the sequencers move the pitches on their own rhythms and only
 * the riff’s notes fire the envelopes. You choose when a note sounds; the Subharmonicon chooses which. Pick another
 * library pattern and its rhythm plays the same running sequence.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import {
  notes,
  play,
  rhythms,
  seq,
  shape,
  step,
  vco,
} from '@/scripts/app/sounds/subharmonicon/kit';

/** A riff of C4s at these beats, each `len` long: the rhythm the envelopes follow. */
const hits = (beats: number[], len = 0.2): [number, number, number][] =>
  beats.map((b) => [b, 60, len]);

export const RHYTHM_KEYS: SoundSpec[] = [
  {
    id: 'shc-your-rhythm-its-notes',
    name: 'Your Rhythm, Its Notes',
    ref: 'A syncopated sixteenth-note riff whose pitches the hidden sequencers choose, like a funk guitar part',
    artist: 'Funk',
    tags: ['seq', 'generative'],
    level: 2,
    blurb:
      'A syncopated riff fires each note; the sequencers, running underneath, decide what each note is.',
    how: 'With EG off, the steps fire nothing, so the sequencers only move pitch, silently. The riff’s syncopated notes fire the envelopes, each one catching VCO 1 and VCO 2 wherever their sequencers have got to. Because the sequencers run on other divisions, the same riff picks different notes every bar: a funk line that composes itself.',
    bpm: 100,
    riff: hits([0, 0.75, 1.5, 2, 2.75, 3.25, 3.5]),
    steps: [
      {
        title: 'Two voices',
        module: 'osc',
        why: 'VCO 1 square at C4 with its octave sub; VCO 2 sawtooth at G4.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'G4', levels: [3, 0, 0] }),
        },
        listen: 'with a key, a fifth.',
      },
      {
        title: 'Silent sequencers',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, Rhythm 2 at ÷5 on Sequencer 2, in C minor pentatonic steps (12-ET, ±1).',
        set: {
          ...rhythms({ 1: [3, true, false], 2: [5, false, true] }),
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(7), step(10)]),
          ...seq(2, [0, step(3), step(-2), step(5)]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Funky pluck',
        module: 'filter',
        why: 'A snappy filter and short notes.',
        set: shape({ cutoff: 4.6, res: 3, amt: 2.6, fd: 3.6, ad: 4.4 }),
        listen: 'with a key, a short, funky pluck.',
      },
      {
        title: 'EG off, play',
        module: 'mod',
        why: 'EG off: only the riff’s notes fire the envelopes. PLAY lit, on the app’s clock.',
        set: play('off'),
        listen:
          'the riff’s rhythm, its notes chosen by the running sequencers, different every bar.',
      },
    ],
    context: {
      'transport.eg': 'In this sound: off, so the riff alone decides when notes sound.',
      'rhythm2.div': 'In this sound: one of the hidden rhythms that picks the notes.',
    },
    tweaks: [
      {
        id: 'transport.eg',
        try: 'Set EG to on',
        hear: 'The sequencers play their own rhythms too: busier, the riff buried inside.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷1',
        hear: 'The notes change every sixteenth: a more random line.',
      },
    ],
  },
  {
    id: 'shc-offbeat-skank',
    name: 'Offbeat Skank',
    ref: 'Chords chopped on every offbeat while the sequencers change them below, a reggae organ skank',
    artist: 'Reggae',
    tags: ['keys', 'reggae', 'generative'],
    level: 2,
    blurb:
      'Chords on every offbeat from the riff; the sequencers move the chord underneath once a bar.',
    how: 'A reggae skank hits the chord on the offbeat. The riff does that; the sequencers, on a bar-long rhythm, change the chord between the hits: VCO 1 and VCO 2 with their subs make the voicing, and EG off lets the riff alone articulate it.',
    bpm: 76,
    riff: hits([0.5, 1.5, 2.5, 3.5], 0.18),
    steps: [
      {
        title: 'An organ chord',
        module: 'osc',
        why: 'Squares: VCO 1 at C5 over ÷2 and ÷3, VCO 2 at E5 over ÷2.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [3, 3, 2] }),
          ...vco(2, { note: 'E5', wave: 'square', subs: [2, 3], levels: [3, 2, 0] }),
        },
        listen: 'with a key, a bright organ chord.',
      },
      {
        title: 'A chord a bar',
        module: 'mod',
        why: 'Rhythm 1 at ÷16 drives both sequencers: C, F, G, F in 12-ET at ±1.',
        set: {
          ...rhythms({ 1: [16, true, true] }),
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(5), step(7), step(5)]),
          ...seq(2, [0, step(5), step(3), step(5)]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Skank',
        module: 'env',
        why: 'The VCA quick and short, the filter fairly open.',
        set: shape({ cutoff: 5.8, res: 1, ad: 3.8 }),
        listen: 'with a key, a short chop.',
      },
      {
        title: 'EG off, play',
        module: 'mod',
        why: 'EG off and PLAY lit, on the app’s clock: the riff chops, the sequencers change chord.',
        set: play('off'),
        listen: 'chopped offbeat chords, a new one each bar.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: one chord change a bar.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷8',
        hear: 'Two chords a bar: a busier progression.',
      },
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 5',
        hear: 'Longer chords: more of a bubble than a chop.',
      },
    ],
  },
  {
    id: 'shc-clave-melody',
    name: 'Clave Melody',
    ref: 'The five strokes of the 3–2 son clave turned into a melody by a sequence running beneath',
    artist: 'Cuban son',
    tags: ['seq', 'generative', 'latin'],
    level: 2,
    blurb: 'The son clave fires the notes; a dotted-eighth sequence picks them.',
    how: 'The son clave (3–2) is five strokes over two bars. The riff plays them; Sequencer 1 runs on dotted eighths underneath with EG off, so the five strokes catch a different note each time round, and the clave becomes a melody.',
    bpm: 104,
    riff: hits([0, 1.5, 3, 5, 6], 0.25),
    steps: [
      {
        title: 'Bright tone',
        module: 'osc',
        why: 'VCO 1 square at C5 with its ÷2; VCO 2 square at G5.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'G5', wave: 'square', levels: [2, 0, 0] }),
        },
        listen: 'with a key, a bright fifth.',
      },
      {
        title: 'A hidden line',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on both sequencers, in C major (8-ET) at ±1.',
        set: {
          ...rhythms({ 1: [3, true, true] }),
          'vco.quantize': '8-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(4), step(2), step(7)]),
          ...seq(2, [0, step(-3), step(2), step(-5)]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Struck',
        module: 'filter',
        why: 'A resonant ping and a medium decay.',
        set: shape({ cutoff: 5.2, res: 3, amt: 1.8, fd: 4, ad: 5 }),
        listen: 'with a key, a ringing note.',
      },
      {
        title: 'EG off, play',
        module: 'mod',
        why: 'EG off, PLAY lit, on the app’s clock.',
        set: play('off'),
        listen: 'the clave rhythm, singing a tune that changes every time round.',
      },
    ],
    context: {
      'transport.eg': 'In this sound: off, so the clave decides when.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷5',
        hear: 'The hidden line changes more slowly: the clave repeats its notes.',
      },
      {
        id: 'transport.eg',
        try: 'Set EG to on',
        hear: 'The hidden line becomes heard, the clave riding over it.',
      },
    ],
  },
  {
    id: 'shc-bassline-generator',
    name: 'Bassline Generator',
    ref: 'A Chicago house bass rhythm that grows new octaves and fifths every time round',
    artist: 'Chicago house',
    tags: ['bass', 'generative'],
    level: 2,
    blurb:
      'A house bass rhythm from the riff; the octaves and fifths come from a sequencer on threes.',
    how: 'The riff holds a house bass rhythm and its roots; Sequencer 1, on dotted eighths with EG off, adds octaves and fifths on top of whatever root the riff is on, so the same two-bar riff grows a new line each time.',
    bpm: 122,
    riff: notes([
      [0, 'C4', 0.4],
      [0.75, 'C4', 0.2],
      [1.5, 'C4', 0.4],
      [2.5, 'C4', 0.2],
      [3, 'C4', 0.4],
      [4, 'Ab3', 0.4],
      [4.75, 'Ab3', 0.2],
      [5.5, 'Ab3', 0.4],
      [6.5, 'Bb3', 0.2],
      [7, 'Bb3', 0.4],
    ]),
    steps: [
      {
        title: 'Bass',
        module: 'osc',
        why: 'VCO 1 sawtooth with its subs at ÷2 and ÷4.',
        set: vco(1, { subs: [2, 4], levels: [3, 5, 4] }),
        listen: 'with a key, a fat bass.',
      },
      {
        title: 'Octaves and fifths',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, 12-ET at ±1: root, octave, fifth, root.',
        set: {
          ...rhythms({ 1: [3, true, false] }),
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(12), step(7), 0]),
        },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Pluck',
        module: 'filter',
        why: 'A resonant, plucked filter and short notes.',
        set: shape({ cutoff: 3.6, res: 4, amt: 2.6, fd: 3.8, ad: 4.4 }),
        listen: 'with a key, a rubbery pluck.',
      },
      {
        title: 'EG off, play',
        module: 'mod',
        why: 'EG off, PLAY lit, on the app’s clock: the riff’s notes play and transpose, the sequencer leaps.',
        set: play('off'),
        listen: 'a house bass whose octave leaps fall in new places every bar.',
      },
    ],
    context: {
      'seq1.step2': 'In this sound: the octave leap.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷2',
        hear: 'The leaps fall on eighths: a steadier, more predictable line.',
      },
      { id: 'vcf.resonance', try: 'Turn RESONANCE to 7', hear: 'Acid house.' },
    ],
  },
];
