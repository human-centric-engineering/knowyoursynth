/**
 * Transposed: the synth plays itself and the riff is a key line, long notes each moving the whole running sequence
 * to a new key (MIDI transpose, firmware 1.1.0). The Berlin School way of playing a sequencer: set the pattern, then
 * play the chords with one finger. Pick any library pattern instead and it transposes the sequence the same way.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import {
  keyLine,
  play,
  rhythms,
  seq,
  shape,
  step,
  vco,
} from '@/scripts/app/sounds/subharmonicon/kit';

export const TRANSPOSED: SoundSpec[] = [
  {
    id: 'shc-berlin-transposed',
    name: 'Berlin Transposed',
    ref: 'A pumping eighth-note bass sequence moved a bar at a time from the keys, as Tangerine Dream played Phaedra',
    artist: 'Tangerine Dream',
    tags: ['bass', 'sequence', 'berlin school'],
    level: 2,
    blurb:
      'A pumping eighth-note bass sequence that the riff moves through C minor, A♭ and B♭, a bar at a time.',
    how: 'Tangerine Dream set a Moog sequencer running and changed key by playing one note on the keyboard. Here Sequencer 1 plays a four-note bass figure on eighths, VCO 1’s subs underneath; the riff holds a C for two bars, then A♭, then B♭, and every held key transposes the running figure without restarting it. Pick a library bass line in the sequencer and it transposes the figure the same way.',
    bpm: 116,
    riff: keyLine(['C4', 'Ab3', 'Bb3', 'C4'], 8),
    steps: [
      {
        title: 'Bass voice',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4, its subs at ÷2 and ÷4 under it.',
        set: vco(1, { subs: [2, 4], levels: [3, 5, 4] }),
        listen: 'with a key held, a fat saw bass in octaves.',
      },
      {
        title: 'Eighths',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1.',
        set: rhythms({ 1: [2, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The figure',
        module: 'mod',
        why: '12-ET at SEQ OCT ±1: C, C, the octave, B♭.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [0, 0, step(12), step(10)]) },
        listen: 'still waiting.',
      },
      {
        title: 'Pump',
        module: 'filter',
        why: 'A low, resonant filter kicked open on every step, and short notes.',
        set: shape({ cutoff: 3.4, res: 4, amt: 2.8, fd: 4, ad: 4.6 }),
        listen: 'with a key, a pumping, resonant blip.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock. The riff’s long notes transpose the figure.',
        set: play(),
        listen: 'the figure pumping on, moving to A♭ and B♭ as the riff changes key.',
      },
    ],
    context: {
      'seq1.step3': 'In this sound: the octave leap that makes the figure pump.',
      'vcf.resonance': 'In this sound: the rubbery Moog resonance on every step.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷1',
        hear: 'Sixteenths: the figure doubles its pace, pure Phaedra.',
      },
      {
        id: 'vcf.cutoff',
        try: 'Turn CUTOFF to 5',
        hear: 'The bass opens up into a bright, buzzing sequence.',
      },
    ],
  },
  {
    id: 'shc-rubycon-pulse',
    name: 'Rubycon Pulse',
    ref: 'Tangerine Dream’s Rubycon machinery: a sixteenth-note pulse and a slower counter-line changing chord as one',
    artist: 'Tangerine Dream',
    tags: ['seq', 'sequence', 'berlin school'],
    level: 3,
    blurb:
      'A sixteenth-note pulse against a slower counter-figure, moving through E minor chords under the riff.',
    how: 'Two sequencers run at once: Sequencer 1 a sixteenth-note pulse on VCO 1, Sequencer 2 a dotted-eighth counter-line on VCO 2 an octave up. The riff’s long notes move both together through E minor, C and D, so the whole machine changes chord as one.',
    bpm: 120,
    riff: keyLine(['E4', 'C4', 'D4', 'E4'], 8),
    steps: [
      {
        title: 'Pulse and line',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at C5.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a bright octave.',
      },
      {
        title: 'Sixteenths and dotted eighths',
        module: 'mod',
        why: 'Rhythm 1 at ÷1 on Sequencer 1, Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [1, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Figures',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, G, B♭, G; Sequencer 2 C, E♭, D, G below.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(7), step(10), step(7)]),
          ...seq(2, [0, step(3), step(2), step(-5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Ticking filter',
        module: 'filter',
        why: 'A low filter with resonance and a very short envelope: each sixteenth a tick.',
        set: shape({ cutoff: 3.8, res: 4.5, amt: 2.6, fd: 3.4, ad: 4.2 }),
        listen: 'with a key, a short tick.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen:
          'a ticking sixteenth pulse with a lazy counter-line, the two changing chord with the riff.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the sixteenth-note pulse.',
      'rhythm2.div': 'In this sound: the counter-line’s dotted eighths.',
    },
    tweaks: [
      {
        id: 'vcf_eg.decay',
        try: 'Turn VCF DECAY to 5',
        hear: 'The ticks open into notes: the pulse becomes a melody.',
      },
      {
        id: 'mix.vco2',
        try: 'Turn VCO 2 LEVEL to 0',
        hear: 'Only the pulse: hear how the counter-line still re-triggers it.',
      },
    ],
  },
  {
    id: 'shc-schulze-drift',
    name: 'Schulze Drift',
    ref: 'A hypnotic minor arpeggio drifting over slow chords for bars on end, like Klaus Schulze’s Moondawn',
    artist: 'Klaus Schulze',
    tags: ['seq', 'sequence', 'berlin school'],
    level: 2,
    blurb:
      'A long, hypnotic sequence: a minor arpeggio on eighths that the riff moves through a slow progression.',
    how: 'Schulze let a sequence run for twenty minutes while the chords moved slowly beneath his hands. One arpeggio on eighths, VCO 2 a fifth up doubling it on quarters, and a riff that holds each chord for two bars: D minor, B♭, F, C.',
    bpm: 108,
    riff: keyLine(['D4', 'Bb3', 'F4', 'C4'], 8),
    steps: [
      {
        title: 'Two oscillators a fifth apart',
        module: 'osc',
        why: 'Saws: VCO 1 at C4 with its octave sub, VCO 2 at G4.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'G4', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, an open fifth.',
      },
      {
        title: 'Eighths and quarters',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Minor arpeggio',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, E♭, G, E♭; Sequencer 2 G, B♭, G, F.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(7), step(3)]),
          ...seq(2, [0, step(3), 0, step(-2)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Warm',
        module: 'filter',
        why: 'A warm filter with a gentle envelope and a medium decay.',
        set: shape({ cutoff: 4.2, res: 2.5, amt: 2, fd: 4.8, ad: 5.4 }),
        listen: 'with a key, a warm note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a hypnotic arpeggio drifting through four chords, two bars each.',
      },
    ],
    context: {
      'vco2.freq': 'In this sound: the fifth that doubles the arpeggio.',
    },
    tweaks: [
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 6.5',
        hear: 'The notes blur into a shimmering haze.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷3',
        hear: 'The fifth voice drifts against the eighths: more restless.',
      },
    ],
  },
  {
    id: 'shc-octave-bounce',
    name: 'Octave Bounce',
    ref: 'The root-and-octave sixteenth bass that Giorgio Moroder set bouncing under “I Feel Love”',
    artist: 'Giorgio Moroder',
    tags: ['bass', 'sequence', 'disco'],
    level: 1,
    blurb: 'A bouncing octave bass on sixteenths, moved through C, B♭ and F by the riff.',
    how: 'Moroder’s bass bounced between a note and its octave on every sixteenth while the chords moved above. Sequencer 1 alternates the root and the octave; the riff changes key every bar. Lock it to the app’s drums and it is ready for the floor.',
    bpm: 124,
    riff: keyLine(['C4', 'C4', 'Bb3', 'F3'], 4),
    steps: [
      {
        title: 'A tight bass',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 silent.',
        set: vco(1, { subs: [2, 3], levels: [4, 4, 0] }),
        listen: 'with a key held, a bright bass.',
      },
      {
        title: 'Sixteenths',
        module: 'mod',
        why: 'Rhythm 1 at ÷1 on Sequencer 1.',
        set: rhythms({ 1: [1, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Root, octave',
        module: 'mod',
        why: '12-ET at ±1: root, octave, root, octave.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [0, step(12), 0, step(12)]) },
        listen: 'still waiting.',
      },
      {
        title: 'Snappy',
        module: 'filter',
        why: 'A snappy filter envelope and very short notes.',
        set: shape({ cutoff: 4, res: 3, amt: 2.6, fd: 3.6, ad: 4 }),
        listen: 'with a key, a short, snappy note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock: turn the drums on and they lock to it.',
        set: play(),
        listen: 'a bouncing octave bass, changing key with the riff.',
      },
    ],
    context: {
      'seq1.step2': 'In this sound: the octave the bass bounces to.',
      'rhythm1.div': 'In this sound: every sixteenth.',
    },
    tweaks: [
      {
        id: 'seq1.step4',
        try: 'Turn SEQ 1 STEP 4 to 2.92',
        hear: 'The fourth step lands on the fifth: a busier, funkier bounce.',
      },
      { id: 'vcf.resonance', try: 'Turn RESONANCE to 6', hear: 'A squelchy, rubbery bounce.' },
    ],
  },
  {
    id: 'shc-oxygene-arp',
    name: 'Oxygène Arpeggio',
    ref: 'Soft square-wave arpeggios rippling in parallel octaves over slow minor chords, as on Jarre’s Oxygène',
    artist: 'Jean-Michel Jarre',
    tags: ['seq', 'arpeggio'],
    level: 2,
    blurb:
      'A rippling arpeggio of square waves in parallel octaves, moved through a slow minor progression.',
    how: 'Both sequencers take the same four steps on the same eighth-note rhythm, VCO 2 an octave above VCO 1, so the arpeggio ripples in octaves. A soft attack takes the edge off the squares; the riff walks the progression underneath.',
    bpm: 104,
    riff: keyLine(['C4', 'Ab3', 'Eb4', 'Bb3'], 8),
    steps: [
      {
        title: 'Octave squares',
        module: 'osc',
        why: 'Squares: VCO 1 at C4, VCO 2 at C5, VCO 1 with its octave sub.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a soft, hollow octave.',
      },
      {
        title: 'One rhythm',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 drives both sequencers.',
        set: rhythms({ 1: [2, true, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'One arpeggio',
        module: 'mod',
        why: '12-ET at ±1: the same steps on both, C, G, E♭, G.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(7), step(3), step(7)]),
          ...seq(2, [0, step(7), step(3), step(7)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Soft edges',
        module: 'env',
        why: 'A slight attack, a low filter and a medium decay.',
        set: shape({ cutoff: 4.6, res: 1.5, amt: 1.6, fd: 4.6, aa: 2.6, ad: 5.2 }),
        listen: 'with a key, a soft swell.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a rippling arpeggio in octaves walking down a minor progression.',
      },
    ],
    context: {
      'rhythm1.seq2': 'In this sound: both sequencers on one rhythm, so the octaves move together.',
    },
    tweaks: [
      {
        id: 'rhythm1.seq2',
        try: 'Turn off RHYTHM 1 SEQ 2 and light RHYTHM 2 SEQ 2',
        hear: 'VCO 2’s copy moves on a different rhythm: the octaves split into a canon.',
      },
      { id: 'vca_eg.attack', try: 'Turn VCA ATTACK to 0', hear: 'A crisp, plucked arpeggio.' },
    ],
  },
  {
    id: 'shc-night-drive',
    name: 'Night Drive',
    ref: 'Dark, resonant synthwave eighths with an octave kick, the moody drive of Kavinsky’s “Nightcall”',
    artist: 'Kavinsky',
    tags: ['bass', 'synthwave'],
    level: 1,
    blurb: 'A driving synthwave bass on eighths, through A minor, F, C and G under the riff.',
    how: 'Synthwave basses are straight eighths with an octave kick on the off-beat. Sequencer 1 plays root, root, octave, root; the riff holds each chord a bar. A dark, resonant filter keeps it moody.',
    bpm: 100,
    riff: keyLine(['A3', 'F3', 'C4', 'G3'], 4),
    steps: [
      {
        title: 'Thick saw',
        module: 'osc',
        why: 'Two saws a hair apart, VCO 1’s subs at ÷2 and ÷4.',
        set: { ...vco(1, { subs: [2, 4], levels: [4, 4, 3] }), 'vco2.freq': 0.04, 'mix.vco2': 3 },
        listen: 'with a key held, a thick, slowly beating saw.',
      },
      {
        title: 'Eighths',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1.',
        set: rhythms({ 1: [2, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Root and octave',
        module: 'mod',
        why: '12-ET at ±1: root, root, octave, root.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [0, 0, step(12), 0]) },
        listen: 'still waiting.',
      },
      {
        title: 'Moody',
        module: 'filter',
        why: 'A dark, resonant filter with a soft envelope.',
        set: shape({ cutoff: 3.4, res: 3.5, amt: 2.2, fd: 4.6, ad: 5 }),
        listen: 'with a key, a dark, round note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a driving bass through A minor, F, C and G.',
      },
    ],
    context: {
      'vco2.freq': 'In this sound: the detune that thickens the bass.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷1',
        hear: 'Sixteenths: a galloping, faster drive.',
      },
      { id: 'vcf.cutoff', try: 'Turn CUTOFF to 5', hear: 'Brighter, more aggressive.' },
    ],
  },
  {
    id: 'shc-motorik',
    name: 'Motorik',
    ref: 'A relentless eighth-note figure over a drone, rocking between two chords: the motorik groove of krautrock',
    artist: 'Krautrock',
    tags: ['seq', 'krautrock'],
    level: 2,
    blurb:
      'A relentless eighth-note figure and a droning counter-voice, moving between two chords forever.',
    how: 'Krautrock’s motorik beat never stops and barely changes. Sequencer 1 drives a figure on VCO 1 on eighths; Sequencer 2 holds VCO 2 on a drone that moves only once a bar. The riff swings between two chords, G and C, two bars each.',
    bpm: 132,
    riff: keyLine(['G3', 'C4', 'G3', 'C4'], 8),
    steps: [
      {
        title: 'Guitar and drone',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 square at G4.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'G4', wave: 'square', levels: [3, 0, 0] }),
        },
        listen: 'with a key held, a fifth.',
      },
      {
        title: 'Eighths and bars',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷16 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [16, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The figure',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, D, E, G; Sequencer 2 G, A, G, E.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(2), step(4), step(7)]),
          ...seq(2, [0, step(2), 0, step(-3)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Driving',
        module: 'filter',
        why: 'A mid filter, a firm envelope and short notes.',
        set: shape({ cutoff: 4.6, res: 2, amt: 2.2, fd: 4.2, ad: 4.8 }),
        listen: 'with a key, a short, bright note.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'an unstoppable figure, the drone stepping once a bar.',
      },
    ],
    context: {
      'rhythm2.div': 'In this sound: the drone moves only once a bar.',
    },
    tweaks: [
      { id: 'rhythm1.div', try: 'Turn RHYTHM 1 to ÷1', hear: 'Sixteenths: the figure races.' },
      {
        id: 'vco2.wave',
        try: 'Set VCO 2 WAVE to Sawtooth',
        hear: 'The drone gets louder and brighter, like a fuzz guitar.',
      },
    ],
  },
  {
    id: 'shc-trans-europe',
    name: 'Trans-Europe',
    ref: 'Kraftwerk’s “Trans-Europe Express” rattles like this: clanking squares, three against four',
    artist: 'Kraftwerk',
    tags: ['seq', 'electro'],
    level: 2,
    blurb:
      'A mechanical, clanking pattern of square waves, three against four, moving down a semitone under the riff.',
    how: 'Kraftwerk’s train rattles in a pattern that never quite matches the bar. Rhythm 1 at ÷3 and Rhythm 2 at ÷4 drive two short square figures; the riff drops the whole machine a semitone every two bars and back, like the track’s descending chords.',
    bpm: 112,
    riff: keyLine(['E4', 'Eb4', 'E4', 'Eb4'], 8),
    steps: [
      {
        title: 'Metal',
        module: 'osc',
        why: 'Squares: VCO 1 at C4, VCO 2 at C5, each with its sub at ÷3.',
        set: {
          ...vco(1, { wave: 'square', subs: [3, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', subs: [3, 3], levels: [3, 2, 0] }),
        },
        listen: 'with a key held, a hollow, metallic chord.',
      },
      {
        title: 'Three and four',
        module: 'mod',
        why: 'Rhythm 1 at ÷3 on Sequencer 1, Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [3, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Clank',
        module: 'mod',
        why: '12-ET at ±1: two short figures of fourths and octaves.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(5), 0, step(12)]),
          ...seq(2, [0, step(-7), step(-5), 0]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Short and dry',
        module: 'filter',
        why: 'A mid filter with a sharp envelope and very short notes.',
        set: shape({ cutoff: 4.8, res: 2, amt: 2.4, fd: 3.4, ad: 3.8 }),
        listen: 'with a key, a short clank.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'a clanking machine pattern dropping a semitone and back.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the three against the bar’s four.',
    },
    tweaks: [
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 5.5',
        hear: 'The clanks ring into tones: less machine, more music.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷6',
        hear: 'A slower second figure: the train slows down.',
      },
    ],
  },
];
