/**
 * Undertone melodies: sequencers assigned to the subs, so a step changes a divisor rather than a pitch, and the tune
 * walks the undertone series (÷1, ÷2, ÷3 …) instead of the keyboard’s semitones. What only a Subharmonicon does.
 * Divisor moves are set at SEQ OCT ±5, where `div(n)` lowers a divisor by `n`.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { div, play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const UNDERTONE: SoundSpec[] = [
  {
    id: 'shc-undertone-arpeggio',
    name: 'Undertone Arpeggio',
    ref: 'In the style of Oskar Sala’s Mixtur-Trautonium studies',
    artist: 'Oskar Sala',
    tags: ['seq', 'undertones', 'arpeggio'],
    level: 2,
    blurb: 'Two arpeggios that climb the undertone series: the divisors step, the VCOs never move.',
    how: 'Both sequencers are assigned to a sub rather than to a VCO. Sequencer 1 takes VCO 1’s SUB 1 through ÷5, ÷4, ÷3, ÷2: up the series from A♭3 to C5. Sequencer 2 takes VCO 2’s SUB 1 through ÷6, ÷8, ÷4, ÷3 under G5. The intervals are the series’ own (a major third, a fourth, a fifth, shrinking as they climb), not the keyboard’s.',
    bpm: 96,
    steps: [
      {
        title: 'High VCOs, low subs',
        module: 'osc',
        why: 'VCO 1 at C6 and VCO 2 at G5, sawtooth and quiet; SUB 1 of each loud, at ÷5 and ÷6.',
        set: {
          ...vco(1, { note: 'C6', subs: [5, 3], levels: [1, 5, 0] }),
          ...vco(2, { note: 'G5', subs: [6, 3], levels: [1, 4, 0] }),
        },
        listen: 'with a key held, two low notes a fourth apart under a faint high pair.',
      },
      {
        title: 'Two pulses',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Steps move divisors',
        module: 'mod',
        why: 'SEQ OCT ±5; each sequencer assigned to its VCO’s SUB 1 only. Sequencer 1 lowers the divisor by 0, 1, 2, 3; Sequencer 2 by 0, −2, 2, 3.',
        set: {
          'seq.oct': 5,
          ...seq(1, [0, div(1), div(2), div(3)], { sub1: true }),
          ...seq(2, [0, div(-2), div(2), div(3)], { sub1: true }),
        },
        listen: 'still waiting; the STEP readouts show each step’s move in divisors.',
      },
      {
        title: 'Plucked',
        module: 'filter',
        why: 'A bright pluck and a short decay.',
        set: shape({ cutoff: 5, res: 2.5, amt: 2.4, fd: 4, ad: 4.8 }),
        listen: 'with a key, a short note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'two arpeggios climbing in the series’ own uneven steps, three against two.',
      },
    ],
    context: {
      'seq1.assign_sub1': 'In this sound: Sequencer 1 moves SUB 1’s divisor, not VCO 1.',
      'seq.oct': 'In this sound: at ±5, a step’s full turn moves a divisor by seven.',
      'sub11.div': 'In this sound: where Sequencer 1’s arpeggio starts, ÷5.',
    },
    tweaks: [
      {
        id: 'sub11.div',
        try: 'Turn VCO 1 SUB 1 FREQ to ÷9',
        hear: 'The arpeggio starts lower in the series, where the steps are closer: a crooked, chromatic climb.',
      },
      {
        id: 'seq1.assign_osc',
        try: 'Light SEQ 1 ASSIGN OSC 1 as well',
        hear: 'The step moves VCO 1 by octaves too: the arpeggio leaps wildly.',
      },
    ],
  },
  {
    id: 'shc-falling-divisors',
    name: 'Falling Divisors',
    ref: 'In the style of Harry Partch’s just intonation',
    artist: 'Harry Partch',
    tags: ['seq', 'undertones'],
    level: 3,
    blurb: 'Dyads sliding down the undertone series together, over a slow bass on VCO 2.',
    how: 'Sequencer 1 moves both of VCO 1’s subs at once, so each step drops both divisors by one: ÷2 and ÷3, then ÷3 and ÷4, ÷4 and ÷5, ÷5 and ÷6. Each pair is a neighbouring interval of the series, shrinking as it falls: a fifth, a fourth, a major third, a minor third. Harry Partch built whole instruments on these ratios. VCO 2 holds a slow bass that moves once a bar.',
    bpm: 100,
    steps: [
      {
        title: 'A dyad of subs',
        module: 'osc',
        why: 'VCO 1 at C5, quiet, with SUB 1 at ÷2 and SUB 2 at ÷3; VCO 2 on square, its subs silent, as a bass.',
        set: {
          ...vco(1, { note: 'C5', subs: [2, 3], levels: [1, 4, 4] }),
          ...vco(2, { wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a fifth (C4 and F3) under a high C.',
      },
      {
        title: 'Eighths and bars',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷16 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [16, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Down the series',
        module: 'mod',
        why: 'SEQ OCT ±5; Sequencer 1 on both of VCO 1’s subs, each step raising both divisors by one more. Sequencer 2 moves VCO 2 down through a bass line.',
        set: {
          'seq.oct': 5,
          'vco.quantize': '12-ET',
          ...seq(1, [0, div(-1), div(-2), div(-3)], { sub1: true, sub2: true }),
          ...seq(2, [step(-12, 5), step(-17, 5), step(-20, 5), step(-19, 5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Clear plucks',
        module: 'filter',
        why: 'A clean pluck with a medium decay.',
        set: shape({ cutoff: 5.2, res: 1.5, amt: 2, fd: 4.2, ad: 5 }),
        listen: 'with a key, a clean, short chord.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen:
          'pairs of notes stepping down, each pair a narrower interval, over a bass that changes once a bar.',
      },
    ],
    context: {
      'seq1.assign_sub2':
        'In this sound: Sequencer 1 moves both subs together, so they fall as a pair.',
      'rhythm2.div': 'In this sound: once a bar, the bass moves.',
    },
    tweaks: [
      {
        id: 'sub12.div',
        try: 'Turn VCO 1 SUB 2 FREQ to ÷4',
        hear: 'The pairs start an octave apart: wider, emptier intervals as they fall.',
      },
      { id: 'rhythm1.div', try: 'Turn RHYTHM 1 to ÷1', hear: 'The dyads race down on sixteenths.' },
    ],
  },
  {
    id: 'shc-undertone-drone-melody',
    name: 'Undertone Drone Melody',
    ref: 'In the style of a hurdy-gurdy',
    artist: 'Hurdy-gurdy',
    tags: ['drone', 'undertones'],
    level: 2,
    blurb: 'A continuous drone whose middle voice sings a slow tune in the undertone series.',
    how: 'EG held keeps both envelopes open, so the sound never stops, like a hurdy-gurdy’s drone strings. VCO 1 and VCO 2 drone a fifth apart; Sequencer 1 moves only VCO 1’s SUB 1, whose divisor wanders through ÷6, ÷5, ÷3 and ÷4: a melody that rises and falls in the series’ own intervals inside the drone.',
    bpm: 60,
    steps: [
      {
        title: 'Drone strings',
        module: 'osc',
        why: 'VCO 1 at C5 and VCO 2 at G4, sawtooth, both steady; VCO 1’s SUB 1 at ÷6 loudest, its SUB 2 at ÷4.',
        set: {
          ...vco(1, { note: 'C5', subs: [6, 4], levels: [2, 5, 3] }),
          ...vco(2, { note: 'G4', subs: [2, 3], levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a rich drone with a low F singing inside it.',
      },
      {
        title: 'A slow step',
        module: 'mod',
        why: 'Rhythm 1 at ÷4 drives Sequencer 1: one step a beat.',
        set: rhythms({ 1: [4, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The tune in the drone',
        module: 'mod',
        why: 'SEQ OCT ±5, Sequencer 1 on VCO 1’s SUB 1: from ÷6 to ÷5, ÷3 and ÷4.',
        set: { 'seq.oct': 5, ...seq(1, [0, div(1), div(3), div(2)], { sub1: true }) },
        listen: 'still waiting.',
      },
      {
        title: 'Buzz',
        module: 'filter',
        why: 'The filter half closed with a little resonance, for the buzz of the strings.',
        set: shape({ cutoff: 5, res: 2.5 }),
        listen: 'with a key, the drone gains a reedy buzz.',
      },
      {
        title: 'Hold and play',
        module: 'mod',
        why: 'EG held, so the envelopes never close, and PLAY lit on the app’s clock.',
        set: play('held'),
        listen: 'an unbroken drone with a voice inside it stepping once a beat.',
      },
    ],
    context: {
      'transport.eg': 'In this sound: held, so the drone never stops.',
      'seq1.assign_sub1': 'In this sound: only the melody string moves.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷2',
        hear: 'The tune doubles its pace, a dance on the drone.',
      },
      {
        id: 'sub11.div',
        try: 'Turn VCO 1 SUB 1 FREQ to ÷8',
        hear: 'The tune starts lower, where the series packs its steps closer.',
      },
    ],
  },
  {
    id: 'shc-two-undertone-lines',
    name: 'Two Undertone Lines',
    ref: 'In the style of a two-part invention',
    artist: 'Johann Sebastian Bach',
    tags: ['seq', 'undertones', 'counterpoint'],
    level: 3,
    blurb:
      'Counterpoint in the undertone series: each VCO’s SUB 2 sings its own line, on its own rhythm.',
    how: 'A two-part invention sets two independent lines against each other. Here each sequencer moves one VCO’s SUB 2 only: the line under C5 on dotted eighths, the line under G4 on quarters. The VCOs themselves are quiet, so you hear two voices moving through the series in contrary motion.',
    bpm: 84,
    steps: [
      {
        title: 'Two quiet VCOs, two loud subs',
        module: 'osc',
        why: 'Square waves; VCO 1 at C5 with SUB 2 at ÷4, VCO 2 at G4 with SUB 2 at ÷2.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [2, 4], levels: [1, 0, 5] }),
          ...vco(2, { note: 'G4', wave: 'square', subs: [2, 2], levels: [1, 0, 5] }),
        },
        listen: 'with a key held, a C and a G an octave and a half apart.',
      },
      {
        title: 'Three against four',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Contrary motion',
        module: 'mod',
        why: 'SEQ OCT ±5, each sequencer on its VCO’s SUB 2. Sequencer 1 rises through ÷4, ÷3, ÷2, ÷3; Sequencer 2 falls through ÷2, ÷3, ÷4, ÷5.',
        set: {
          'seq.oct': 5,
          ...seq(1, [0, div(1), div(2), div(1)], { sub2: true }),
          ...seq(2, [0, div(-1), div(-2), div(-3)], { sub2: true }),
        },
        listen: 'still waiting.',
      },
      {
        title: 'A harpsichord pluck',
        module: 'filter',
        why: 'A bright, quick pluck and a medium decay.',
        set: shape({ cutoff: 5.4, res: 2, amt: 2.4, fd: 3.8, ad: 5 }),
        listen: 'with a key, a plucked string.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'one line climbing while the other falls, three against four.',
      },
    ],
    context: {
      'seq1.assign_sub2': 'In this sound: the upper line.',
      'seq2.assign_sub2': 'In this sound: the lower line.',
    },
    tweaks: [
      {
        id: 'mix.vco1',
        try: 'Turn VCO 1 LEVEL to 4',
        hear: 'The VCO’s steady C rings over the lines like a pedal point above.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷2',
        hear: 'The lower line runs in eighths, twice as busy as the upper.',
      },
    ],
  },
  {
    id: 'shc-divisor-bells',
    name: 'Divisor Bells',
    ref: 'In the style of English change ringing',
    artist: 'Change ringing',
    tags: ['seq', 'bell', 'undertones'],
    level: 2,
    blurb: 'A peal of bells on running sixteenths: the subs ring the changes through the series.',
    how: 'Change ringers ring a set of bells in ever-changing orders. Sequencer 1 on sixteenths and Sequencer 2 on eighths each move both subs of their VCO, so every stroke rings a new pair of undertones under two high squares. A resonant filter and a ringing decay give the bronze.',
    bpm: 112,
    steps: [
      {
        title: 'Bronze',
        module: 'osc',
        why: 'Squares: VCO 1 at C6, VCO 2 at A5, each with subs at ÷3 and ÷4.',
        set: {
          ...vco(1, { note: 'C6', wave: 'square', subs: [3, 4], levels: [2, 3, 3] }),
          ...vco(2, { note: 'A5', wave: 'square', subs: [3, 4], levels: [2, 3, 3] }),
        },
        listen: 'with a key held, a bright, crowded chord.',
      },
      {
        title: 'Running strokes',
        module: 'mod',
        why: 'Rhythm 1 at ÷1 on Sequencer 1; Rhythm 2 at ÷2 on Sequencer 2.',
        set: rhythms({ 1: [1, true, false], 2: [2, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Changes',
        module: 'mod',
        why: 'SEQ OCT ±5; each sequencer moves both subs of its VCO by 0, 1, −1 and 2.',
        set: {
          'seq.oct': 5,
          ...seq(1, [0, div(1), div(-1), div(2)], { sub1: true, sub2: true }),
          ...seq(2, [0, div(2), div(1), div(-1)], { sub1: true, sub2: true }),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Ring',
        module: 'filter',
        why: 'Resonance on the filter, a ping and a long ring.',
        set: shape({ cutoff: 6, res: 4, amt: 1.4, fd: 3.6, ad: 6, vol: 6 }),
        listen: 'with a key, a ringing strike.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a cascading peal, its order turning over every few beats.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the running sixteenths of the peal.',
      'vcf.resonance': 'In this sound: the bronze ring.',
    },
    tweaks: [
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 8',
        hear: 'Each stroke rings under the next: a tower’s wash of sound.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷3',
        hear: 'Slower, uneven strokes, as if one ringer were tired.',
      },
    ],
  },
  {
    id: 'shc-undertone-bass-walk',
    name: 'Undertone Bass Walk',
    ref: 'In the style of a dub bass line',
    artist: 'King Tubby',
    tags: ['bass', 'undertones'],
    level: 2,
    blurb: 'A deep bass that walks through the undertones of C: ÷4, ÷5, ÷6, ÷3.',
    how: 'The bass is one sub of VCO 1, its divisor moved by Sequencer 1 on Rhythm 1’s quarters and Rhythm 2’s dotted eighths together. Its notes are C, a flat A♭, F and the F above: the undertones of C, a minor-sounding set. A low filter and a round decay keep it dub-heavy.',
    bpm: 76,
    steps: [
      {
        title: 'A sub alone',
        module: 'osc',
        why: 'Square; VCO 1 silent, its SUB 1 at ÷4 loud and SUB 2 at ÷2 quiet.',
        set: vco(1, { wave: 'square', subs: [4, 2], levels: [0, 6, 2] }),
        listen: 'with a key held, a deep C two octaves down.',
      },
      {
        title: 'Quarters and dotted eighths',
        module: 'mod',
        why: 'Rhythms 1 (÷4) and 2 (÷3) both drive Sequencer 1.',
        set: rhythms({ 1: [4, true, false], 2: [3, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The walk',
        module: 'mod',
        why: 'SEQ OCT ±5, Sequencer 1 on SUB 1 only: ÷4, ÷5, ÷6, ÷3.',
        set: { 'seq.oct': 5, ...seq(1, [0, div(-1), div(-2), div(1)], { sub1: true }) },
        listen: 'still waiting.',
      },
      {
        title: 'Dub weight',
        module: 'filter',
        why: 'The filter low, a soft envelope and a round decay.',
        set: shape({ cutoff: 3.2, res: 2, amt: 1.6, fd: 4.6, ad: 5.4 }),
        listen: 'with a key, a round, low thud.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a heavy, syncopated bass walking down and up the undertones.',
      },
    ],
    context: {
      'seq1.assign_sub1':
        'In this sound: the bass is the sub, and the sequencer moves its divisor.',
      'sub11.div': 'In this sound: the walk’s home note, C two octaves down.',
    },
    tweaks: [
      {
        id: 'sub11.div',
        try: 'Turn VCO 1 SUB 1 FREQ to ÷8',
        hear: 'The walk drops an octave and its steps close up: a sub-bass rumble.',
      },
      {
        id: 'rhythm2.seq1',
        try: 'Turn off RHYTHM 2 SEQ 1',
        hear: 'Plain quarter notes: a steadier, plainer bass.',
      },
    ],
  },
  {
    id: 'shc-undertone-chorale',
    name: 'Undertone Chorale',
    ref: 'In the style of a Lutheran chorale',
    artist: 'Chorale',
    tags: ['pad', 'undertones'],
    level: 2,
    blurb:
      'Slow chords that change by moving every sub together: a chorale in the undertone series.',
    how: 'All four subs move: Sequencer 1 shifts both of VCO 1’s, Sequencer 2 both of VCO 2’s, each on a slow rhythm. Each change is a new chord built only from undertones of C and G, voice-led by whole divisors. Long attacks and decays make it breathe like a choir.',
    bpm: 66,
    riff: [[0, 60, 8]],
    steps: [
      {
        title: 'Four voices',
        module: 'osc',
        why: 'Saws; VCO 1 at C5 over ÷3 and ÷4, VCO 2 at G5 over ÷4 and ÷6; the VCOs quiet.',
        set: {
          ...vco(1, { note: 'C5', subs: [3, 4], levels: [1, 4, 4] }),
          ...vco(2, { note: 'G5', subs: [4, 6], levels: [1, 4, 4] }),
        },
        listen: 'with a key held, a warm, full chord.',
      },
      {
        title: 'Slow changes',
        module: 'mod',
        why: 'Rhythm 1 at ÷8 on Sequencer 1, Rhythm 2 at ÷16 on Sequencer 2.',
        set: rhythms({ 1: [8, true, false], 2: [16, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Voice leading',
        module: 'mod',
        why: 'SEQ OCT ±5, each sequencer on both subs of its VCO, moving them by small whole divisors.',
        set: {
          'seq.oct': 5,
          ...seq(1, [0, div(-1), div(1), div(-2)], { sub1: true, sub2: true }),
          ...seq(2, [0, div(1), div(-1), div(2)], { sub1: true, sub2: true }),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Breathe',
        module: 'env',
        why: 'Slow attacks, long decays, and a low filter.',
        set: shape({ cutoff: 4.4, res: 1, amt: 1, fa: 6.5, fd: 7.8, aa: 6.3, ad: 7.8 }),
        listen: 'with a key, a chord swelling in slowly.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff is two bars.',
        set: play(),
        listen:
          'chords swelling every half bar, the lower voices changing more slowly than the upper.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: a new chord on the upper pair every half bar.',
      'vca_eg.attack': 'In this sound: the choir’s breath.',
    },
    tweaks: [
      {
        id: 'transport.eg',
        try: 'Set EG to held',
        hear: 'The chords join into one unbroken organ-like progression.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷12',
        hear: 'The lower pair changes off the bar line: the harmony gets restless.',
      },
    ],
  },
  {
    id: 'shc-mixtur-fanfare',
    name: 'Mixtur Fanfare',
    ref: 'In the style of Oskar Sala’s fanfares',
    artist: 'Oskar Sala',
    tags: ['brass', 'undertones', 'seq'],
    level: 3,
    blurb: 'A brassy fanfare: VCO 1’s tune and its two subs moving in parallel undertone chords.',
    how: 'Sequencer 1 moves VCO 1’s pitch, so the subs follow and every note carries its own ÷2 and ÷3 chord, the Mixtur sound. Sequencer 2 moves the same subs’ divisors on a different rhythm, re-voicing the chord under the tune. Saws through a swelling filter make the brass.',
    bpm: 108,
    steps: [
      {
        title: 'A note and its chord',
        module: 'osc',
        why: 'VCO 1 sawtooth at G4 over ÷2 and ÷3, all loud; VCO 2 silent.',
        set: vco(1, { note: 'G4', subs: [2, 3], levels: [5, 4, 4] }),
        listen: 'with a key held, a big G with its octave and fifth below.',
      },
      {
        title: 'Two rhythms on one sequencer, one on the other',
        module: 'mod',
        why: 'Rhythms 1 (÷2) and 2 (÷3) on Sequencer 1; Rhythm 3 at ÷8 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, true, false], 3: [8, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Tune and voicing',
        module: 'mod',
        why: 'SEQ OCT ±1 on 12-ET. Sequencer 1 plays a fanfare on VCO 1; Sequencer 2 is assigned to VCO 1’s subs: at ±1 a step of eight semitones moves a divisor by one, so it re-voices them a divisor either way.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(5), step(7), step(12)]),
          ...seq(2, [0, step(-8), step(8), 0], { sub1: true, sub2: true }),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Brass',
        module: 'filter',
        why: 'A closed filter swelling open on each note; quick VCA attack, medium decay.',
        set: shape({ cutoff: 3.6, res: 1.5, amt: 2.8, fa: 3.5, fd: 5, aa: 1.5, ad: 5 }),
        listen: 'with a key, a brassy blat.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a fanfare in parallel chords whose bass voices shift every half bar.',
      },
    ],
    context: {
      'seq2.assign_sub1': 'In this sound: Sequencer 2 re-voices the chord VCO 1 carries.',
      'vcf_eg.attack': 'In this sound: the brass swell.',
    },
    tweaks: [
      {
        id: 'seq.oct',
        try: 'Set SEQ OCT to ±2',
        hear: 'The fanfare leaps twice as far, and the re-voicing moves further down the series.',
      },
      { id: 'rhythm2.seq1', try: 'Turn off RHYTHM 2 SEQ 1', hear: 'A plain eighth-note fanfare.' },
    ],
  },
];
