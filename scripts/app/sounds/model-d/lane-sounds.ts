/**
 * The Model D's sounds played by their mod lanes (`f-lane-sounds` t-301). Each is a lesson, as every library sound
 * is, and a song: a chained A/B pattern whose one or two mod lanes play controls the lesson's last section suggests
 * turning. Written to the library by `write-lane-sounds.ts`.
 *
 * Credits follow the library's rule: no sound here is a person's, so `artist` names the genre or tradition, and the
 * `ref` says what the sound is like.
 */
import type { LaneSoundSpec, Readouts } from '@/scripts/app/sounds/lane-kit';
import type { Lane } from '@/scripts/app/sounds/lane-kit';
import { holds, laneTweak, moves, ramp, up, wave } from '@/scripts/app/sounds/lane-kit';

/** The LFO RATE knob position for `hz` (`lfoHz` in the definition: 0.05 Hz to 200 Hz, exponential). */
export const lfoAt = (hz: number): number =>
  Math.round(((10 * Math.log(hz / 0.05)) / Math.log(4000)) * 100) / 100;

/**
 * A lane written as MOD DEPTH positions, played on the mod wheel instead (t-312). The Model D adds the wheel to the
 * depth MOD DEPTH gives, (d / 10)², so with the knob at 0 the wheel at (d / 10)² is the knob at d.
 */
export const onWheel =
  (depth: Lane): Lane =>
  (c) => {
    const d = depth(c);
    return typeof d === 'number' ? (d / 10) ** 2 : d;
  };

/** The LFO rate for `perBeat` cycles a beat at `bpm`. */
const lfoSync = (bpm: number, perBeat: number) => lfoAt((bpm / 60) * perBeat);

/** The Model D's controls as its lessons name them: the panel prints VOLUME on all three mixer knobs. */
export const READOUTS: Readouts = {
  names: {
    'osc1.range': 'Osc 1 RANGE',
    'osc2.range': 'Osc 2 RANGE',
    'osc3.range': 'Osc 3 RANGE',
    'osc1.wave': 'Osc 1 WAVEFORM',
    'osc2.wave': 'Osc 2 WAVEFORM',
    'osc3.wave': 'Osc 3 WAVEFORM',
    'osc2.freq': 'Osc 2 FREQUENCY',
    'osc3.freq': 'Osc 3 FREQUENCY',
    'mix.osc1': 'Osc 1 VOLUME',
    'mix.osc2': 'Osc 2 VOLUME',
    'mix.osc3': 'Osc 3 VOLUME',
    'mix.osc1On': 'Osc 1 switch',
    'mix.osc2On': 'Osc 2 switch',
    'mix.osc3On': 'Osc 3 switch',
    'mix.noiseOn': 'Noise switch',
    'mix.extOn': 'External input switch',
    'mix.noise': 'NOISE VOLUME',
    'mix.ext': 'EXT IN VOLUME',
    'noise.colour': 'Noise colour',
    'filter.cutoff': 'CUTOFF',
    'filter.emphasis': 'EMPHASIS',
    'filter.contour': 'AMOUNT OF CONTOUR',
    'filter.kbd1': 'KEYBOARD CONTROL 1',
    'filter.kbd2': 'KEYBOARD CONTROL 2',
    'filter.mode': 'FILTER MODE',
    'fenv.attack': 'Filter ATTACK',
    'fenv.decay': 'Filter DECAY',
    'fenv.sustain': 'Filter SUSTAIN',
    'aenv.attack': 'Loudness ATTACK',
    'aenv.decay': 'Loudness DECAY',
    'aenv.sustain': 'Loudness SUSTAIN',
    'env.loudDecay': 'LOUD DECAY switch',
    'env.filterDecay': 'FILTER DECAY switch',
    'ctl.glide': 'GLIDE',
    'mod.mix': 'MOD MIX',
    'mod.depth': 'MOD DEPTH',
    'mod.srcA': 'Mod source A',
    'mod.srcB': 'Mod source B',
    'mod.toOsc': 'OSCILLATOR MODULATION',
    'mod.toFilter': 'FILTER MODULATION',
    'osc3.kbd': 'OSC 3 CONTROL',
    'lfo.rate': 'LFO RATE',
    'lfo.shape': 'LFO shape',
    'out.volume': 'Main VOLUME',
  },
  options: {
    tri: 'triangle',
    shark: 'shark tooth',
    rsaw: 'reverse sawtooth',
    saw: 'sawtooth',
    sq: 'square',
    wide: 'wide pulse',
    narrow: 'narrow pulse',
  },
};

const key = (slug: string) => `researched:model-d-lanes/${slug}`;

export const LANE_SOUNDS: LaneSoundSpec[] = [
  // ── 1 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-acid-walk',
    name: 'Acid Cutoff Walk',
    ref: 'A squelching one-oscillator acid line whose filter is ridden through the whole song by its mod lanes',
    artist: '90s acid techno',
    tags: ['bass', 'acid', '90s'],
    level: 2,
    blurb: 'A rubbery, squelching acid bass whose filter climbs and twists as the song plays.',
    how: 'One sawtooth an octave down goes into a resonant, nearly closed filter, and a short filter envelope gives every note its squelch. The playing is in the sequencer: one mod lane walks the cutoff up through part A and swings it in a wave through part B, and the other pushes the emphasis up on the slides and towards a scream at the end. Open the sequencer: the lanes are under the steps, and the cutoff and emphasis rows show both moving.',
    steps: [
      {
        title: 'One sawtooth, an octave down',
        module: 'osc',
        why: 'Acid lines are one oscillator and nothing else: the filter does all the talking. A sawtooth has every harmonic, so the resonance always has something to bite on.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'mix.osc1': 7 },
        listen: 'a plain, buzzy bass tone, the same brightness on every note.',
      },
      {
        title: 'A dark, resonant filter',
        module: 'filter',
        why: 'The cutoff starts low, so the bass is muffled, and the emphasis is high, so the filter rings at its cutoff. Keyboard control 1 opens it a little for higher notes.',
        set: { 'filter.cutoff': -2, 'filter.emphasis': 6.5, 'filter.kbd1': true },
        listen: 'a hollow, ringing tone with a whistle riding on it.',
      },
      {
        title: 'A quick squelch on every note',
        module: 'filter',
        why: 'The filter envelope flicks the cutoff open on each note and lets it fall straight back, with nothing held.',
        set: { 'filter.contour': 5, 'fenv.attack': 0, 'fenv.decay': 1.8, 'fenv.sustain': 0 },
        listen: 'a "yow" on the front of every note.',
      },
      {
        title: 'Tight notes, and a hint of glide',
        module: 'env',
        why: 'A short loudness decay and a held level keep the notes punchy, and a touch of glide lets the slides in the pattern bend from note to note.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2, 'aenv.sustain': 8, 'ctl.glide': 1.2 },
        listen: 'play two notes legato: the second bends in from the first.',
      },
    ],
    context: {
      'filter.cutoff':
        'The lane plays this one. Its walk up through part A is the line getting brighter, bar by bar.',
      'filter.emphasis':
        'The other lane. It leaps on the slides, where the squelch should sing, and climbs through part B.',
      'filter.contour':
        'The size of the squelch on each note, on top of where the lane puts the cutoff.',
      'fenv.decay':
        'How long each squelch lasts. Short is tight and percussive; long goes rubbery.',
      'ctl.glide': 'Sets how far the slid notes bend.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'redraw the cutoff lane as a steep climb in the last bar.',
        'The line opens up like a riser before the loop comes round.'
      ),
      laneTweak(
        'filter.emphasis',
        'flatten the emphasis lane to 9 everywhere.',
        'Every note screams; the slides no longer stand out.'
      ),
      {
        id: 'fenv.decay',
        try: 'Move between 1 and 3.5',
        hear: 'From tight blips to long rubbery sweeps.',
      },
      {
        id: 'filter.contour',
        try: 'Push up to 8',
        hear: 'A bigger, more aggressive squelch on every note.',
      },
    ],
    pattern: {
      key: key('acid-cutoff-walk'),
      name: 'Acid Cutoff Walk',
      role: 'bass_line',
      genre: '90s acid techno',
      bpm: 126,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'A2! . A2 C3 | . A2 G2^ A2 | . . E3 A2 | . D3^ C3 A2 | A2! . A2 C3 | . E3 . A2 | G2^ A2 . C3 | . A2 E2:2 .',
          lanes: {
            'filter.cutoff': (c) => -3 + (3 * c.i) / 31 + (c.accent ? 1.2 : 0),
            'filter.emphasis': (c) => (c.slide || c.slidIn ? 8.5 : 6),
          },
        },
        {
          notes:
            'D3! . D3 F3 | . D3 C3^ D3 | . . A3 D3 | . G3^ F3 D3 | C3! . C3 E3 | . G3 . C3 | E3^ G3 A3^ G3 | E3 . A2:2 .',
          lanes: {
            'filter.cutoff': wave(-1.5, 2, 16),
            'filter.emphasis': (c) => Math.min(9.5, 6.5 + (2.5 * c.i) / 31 + (c.slidIn ? 1 : 0)),
          },
        },
      ],
      notes:
        'A on A, twice: a sixteenth-note line answering itself, the cutoff lane climbing three units across the two bars with a kick on each accent, the emphasis lane leaping on the slides. B goes up a fourth to D and back down through C to A, the cutoff swinging in two waves a bar and the emphasis climbing towards self-oscillation, then A again to land.',
    },
  },

  // ── 2 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-berlin-sweep',
    name: 'Berlin Sweep Sequence',
    ref: 'A driving sixteenth-note sequencer ostinato whose filter breathes in one long sweep across the song',
    artist: 'Berlin-school sequencing',
    tags: ['seq', 'kosmische', '70s'],
    level: 2,
    blurb: 'A hypnotic, pulsing sequence that slowly brightens and darkens like breathing.',
    how: 'Two sawtooths, a hair apart, play a steady sixteenth-note pattern through a moderately resonant filter. One mod lane sweeps the cutoff in one slow wave spread over parts A and B, so the sequence opens and closes over four bars; the other stretches the filter decay as it goes, from a tight tick at the start of A to a long, rubbery pluck where B begins, and back. Both are slow turns of one knob each, as a player would ride them.',
    steps: [
      {
        title: 'Two sawtooths, slightly apart',
        module: 'osc',
        why: 'Two saws, with Oscillator 2 nudged a hair sharp, beat slowly against each other: the slow shimmer of a big modular sequence.',
        set: {
          'osc2.wave': 'saw',
          'osc2.freq': 0.08,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
        },
        listen: 'a slow beating in a held note.',
      },
      {
        title: 'A filter with some ring',
        module: 'filter',
        why: 'A middling cutoff and some emphasis: the lanes will move the cutoff, so this is just its centre.',
        set: { 'filter.cutoff': -1, 'filter.emphasis': 4 },
        listen: 'a rounded tone with a little whistle in it.',
      },
      {
        title: 'Plucked notes',
        module: 'env',
        why: 'The filter envelope gives each note a short pluck, and the loudness falls to a low level, so sixteenth notes stay separate.',
        set: {
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.6,
          'fenv.sustain': 1,
          'aenv.decay': 2.2,
          'aenv.sustain': 2,
        },
        listen: 'each note plucked and gone before the next.',
      },
    ],
    context: {
      'filter.cutoff':
        'Moved by a lane in one slow wave across the whole song: the four-bar breath of the sequence.',
      'fenv.decay':
        'The other lane: tight at the start of A, long where B begins, tight again by B’s end. The pluck grows and shrinks with the sweep.',
      'osc2.freq': 'The tiny detune is the shimmer. Past 0.3 it goes sour.',
      'filter.emphasis': 'More makes the sweep sing; less keeps it warm.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'draw the cutoff lane as one straight climb across both parts.',
        'A four-bar build that drops back as the loop starts again.'
      ),
      laneTweak(
        'fenv.decay',
        'set every step of the decay lane to the same value.',
        'The pluck stays one length: only the cutoff breathes.'
      ),
      { id: 'filter.emphasis', try: 'Push up to 7', hear: 'The sweep turns vocal and glassy.' },
      {
        id: 'osc2.freq',
        try: 'Set it to 7 (a fifth)',
        hear: 'The sequence plays in fifths, darker and bigger.',
      },
    ],
    pattern: {
      key: key('berlin-sweep-sequence'),
      name: 'Berlin Sweep Sequence',
      role: 'arp',
      genre: 'Berlin-school sequencing',
      bpm: 120,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'E2! E3 B2 E3 | G2 E3 B2 E3 | E2 E3 B2 D3 | F#2 D3 B2 D3 | C2! C3 G2 C3 | E2 C3 G2 C3 | D2 D3 A2 D3 | F#2 D3 A2 B2',
          lanes: {
            'filter.cutoff': wave(-2.5, 1.5, 64),
            'fenv.decay': ramp(1.2, 2.8),
          },
        },
        {
          notes:
            'A1! A2 E2 A2 | C2 A2 E2 A2 | B1 B2 F#2 B2 | D2 B2 F#2 A2 | G1! G2 D2 G2 | B1 G2 D2 G2 | B1 B2 F#2 B2 | D#2 B2 F#2 B2',
          lanes: {
            'filter.cutoff': wave(-2.5, 1.5, 64, 32),
            'fenv.decay': ramp(2.8, 1.2),
          },
        },
      ],
      notes:
        'A plays E minor to C and D, a root-octave-fifth sixteenth figure; B moves to A minor and B major, the dominant, pulling back to E. Chained ABAB, so the cutoff lane’s 64-step wave runs across A into B: dark at the start of A, brightest where A hands over to B, dark again at B’s end. The decay lane stretches the pluck across A and draws it back in across B, one slow turn each way.',
    },
  },

  // ── 3 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-glide-funk',
    name: 'Glide-Lane Funk Bass',
    ref: 'A syncopated funk bass that slides only into the notes its glide lane picks, with pops on the accents',
    artist: '70s funk',
    tags: ['bass', 'funk', '70s'],
    level: 2,
    blurb: 'A bouncy, syncopated funk bass with slides on just the notes that need them.',
    how: 'A hollow square and a sawtooth an octave down make a woody bass, plucked by the filter envelope. On a real Model D the glide knob is on or off for every note, so a player rides it by hand to slide into one note and not the next. Here a mod lane does that: glide is up only on the steps the line slides into. A second lane jabs the contour amount up on the first note of each phrase, so it pops brighter than the rest.',
    steps: [
      {
        title: 'Square and saw, an octave down',
        module: 'osc',
        why: 'A square is hollow and woody, the sawtooth adds bite on top, and both sit at 16’ for weight.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'sq',
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 5,
        },
        listen: 'a round, slightly nasal bass.',
      },
      {
        title: 'Pluck it with the filter',
        module: 'filter',
        why: 'A closed filter and a short envelope give every note a fast attack and a quick fall, like a thumbed string.',
        set: {
          'filter.cutoff': -1.5,
          'filter.emphasis': 3,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.8,
          'fenv.sustain': 1.5,
        },
        listen: 'a quick "dow" on every note.',
      },
      {
        title: 'Short, bouncy notes',
        module: 'env',
        why: 'The loudness falls quickly to a held level, which keeps the line bouncing rather than droning.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2.5, 'aenv.sustain': 7 },
        listen: 'notes that stay separate at speed.',
      },
    ],
    context: {
      'ctl.glide':
        'Moved by a lane: up only on the steps the line slides into, which is how a player rides the knob.',
      'filter.contour': 'The other lane: jabbed up on each phrase’s first note, so it pops.',
      'fenv.decay': 'The length of each pluck.',
      'mix.osc2': 'The sawtooth’s bite. Take it down for a rounder, more dub-like bass.',
    },
    tweaks: [
      laneTweak(
        'ctl.glide',
        'raise the glide lane on every step.',
        'Every note slides into the next: the line goes lazy and loses its snap.'
      ),
      laneTweak(
        'filter.contour',
        'draw the contour lane up on the second bar’s first note instead of the first.',
        'The pop moves to the answer, and the phrase leans the other way.'
      ),
      {
        id: 'fenv.decay',
        try: 'Move between 1 and 3',
        hear: 'From slap-tight to a long, singing pluck.',
      },
      {
        id: 'osc1.wave',
        try: 'Switch Oscillator 1 to narrow pulse',
        hear: 'A thinner, more nasal bass.',
      },
    ],
    pattern: {
      key: key('glide-lane-funk-bass'),
      name: 'Glide-Lane Funk Bass',
      role: 'bass_line',
      genre: '70s funk',
      bpm: 98,
      swing: 56,
      root: 7,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes: up(
            1,
            'G1! . . G2 | . G1 Bb1 . | C2^ D2 . F2 | . G2 F2 D2 | G1! . . G2 | . G1 . Bb1 | . C2 . Db2^ | D2 . F1 G1'
          ),
          lanes: {
            'ctl.glide': (c) => (c.slidIn ? 3 : 0),
            'filter.contour': (c) => (c.accent ? 7 : 4),
          },
        },
        {
          notes: up(
            1,
            'C2! . . C3 | . C2 Eb2 . | F2^ G2 . Bb2 | . C3 Bb2 G2 | F1! . . F2 | . F1 . A1^ | Bb1 . B1^ C2 | D2 . F1 G1'
          ),
          lanes: {
            // The climb A–B♭–B–C is one raise of the knob, held through its three slides.
            'ctl.glide': (c) => (c.slidIn || (c.i >= 23 && c.i <= 27) ? 3.5 : 0),
            'filter.contour': (c) => (c.accent ? 7.5 : 3.5),
          },
        },
      ],
      notes:
        'A sits on G with the minor third and a slide from C up to D, then a chromatic slide from D♭ into D at the end of the second bar. B goes to C, then F, climbing A–B♭–B to C with two slides, the glide held up through the whole climb. Elsewhere the glide lane is up only on the notes a slide lands on, a quick flick of the knob, and the contour lane jabs up on the bar’s accented first note.',
    },
  },
  // ── 4 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-dub-pressure',
    name: 'Dub Pressure Bass',
    ref: 'A deep, round sound-system bass whose held notes darken and start to waver the longer they ring',
    artist: 'Sound-system dub',
    tags: ['bass', 'dub', 'reggae'],
    level: 2,
    blurb: 'A huge, round dub bass that sinks darker and wobbles as each note is held.',
    how: 'A triangle and a quiet square, both an octave down, make a soft but solid bass. The playing is in two mod lanes. The cutoff is ridden slowly, the way a dub engineer rides the bass EQ: it sinks through each bar and opens again for the next, while the filter envelope gives every note its own soft bloom. The other hand is on the mod wheel, pushing it up on the long notes only, so they start to waver with vibrato while the short ones stay still.',
    steps: [
      {
        title: 'A round tone, an octave down',
        module: 'osc',
        why: 'A triangle is almost a pure tone, which is what makes a sound-system bass feel like pressure rather than buzz. A little square underneath gives it a body you can still hear on small speakers.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'tri',
          'osc2.range': '16',
          'osc2.wave': 'sq',
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 3,
        },
        listen: 'a soft, deep tone with a faint edge.',
      },
      {
        title: 'Keep the top end down',
        module: 'filter',
        why: 'The filter sits low with almost no emphasis, and a gentle envelope gives each note a soft thump that blooms and settles.',
        set: {
          'filter.cutoff': -1.5,
          'filter.emphasis': 1,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 3,
          'fenv.sustain': 3,
        },
        listen: 'a warm, muffled bass with a soft front.',
      },
      {
        title: 'Long notes, and vibrato ready',
        module: 'mod',
        why: 'The loudness holds for as long as the note does. The LFO is routed to the oscillators at a slow vibrato rate, with MOD DEPTH left at 0: the wheel brings it in, and the lane pushes it up only on the long notes.',
        set: {
          'aenv.attack': 0,
          'aenv.decay': 4,
          'aenv.sustain': 10,
          'mod.toOsc': true,
          'lfo.rate': lfoAt(5.5),
          'lfo.shape': 'tri',
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'nothing yet: push the mod wheel up and the held note wavers.',
      },
    ],
    context: {
      'filter.cutoff':
        'A lane rides it slowly: it sinks through each bar and opens again for the next, the dark pull of a dub bass.',
      'mod.depth':
        'Stays at 0: the mod wheel lane brings the vibrato in, only on notes held for more than a step or two.',
      'lfo.rate': 'The speed of the waver. Slower is woozier.',
      'mix.osc2': 'The square’s edge. Take it out for pure sub pressure.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'draw the mod wheel lane high on the short notes too.',
        'The whole line wobbles, seasick, instead of only the held notes.'
      ),
      laneTweak(
        'filter.cutoff',
        'draw the cutoff lane rising through each bar instead of sinking.',
        'The line swells brighter as it goes and pushes forward.'
      ),
      {
        id: 'lfo.rate',
        try: 'Turn down to about 4',
        hear: 'A slower, deeper sway on the held notes.',
      },
      { id: 'mix.osc2', try: 'Turn to 0', hear: 'Pure, round sub: felt more than heard.' },
    ],
    pattern: {
      key: key('dub-pressure-bass'),
      name: 'Dub Pressure Bass',
      role: 'bass_line',
      genre: 'Sound-system dub',
      bpm: 74,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes: up(
            1,
            'E1:3 . . . | . . E2 . | G1:2 . . A1 | . B1:2 . . | E1:3 . . . | . . D2 . | B1:4 . . . | . G1 A1:2 .'
          ),
          lanes: {
            // Opened at each bar's start, sinking to its darkest half way, and back: a slow ride of the EQ.
            'filter.cutoff': wave(-2.6, -0.6, 16, 8),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 ? Math.min(2.2, 0.7 * (c.since - 1)) : 0
            ),
          },
        },
        {
          notes: up(
            1,
            'C2:3 . . . | . . C3 . | B1:2 . . A1 | . G1:2 . . | A1:3 . . . | . . B1 . | E1:6 . . . | . . E2 G1'
          ),
          lanes: {
            'filter.cutoff': wave(-2.6, -0.4, 16, 8),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 ? Math.min(2.2, 0.5 * (c.since - 1)) : 0
            ),
          },
        },
      ],
      notes:
        'A one-drop line in E minor: a held root, an octave jump on the and, walking G–A–B and back. B moves to C and down through B and A to G, then a long E that rises to its octave. The cutoff lane is ridden slowly, opening at each bar’s start and sinking half way through, a little brighter in B; the mod wheel lane waits two steps before any vibrato, so only the held notes waver, most in B’s long E.',
    },
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-interval-stabs',
    name: 'Interval Stab Riff',
    ref: 'Offbeat two-note house stabs on a mono synth, the second oscillator’s interval moved for every chord by a mod lane',
    artist: 'Early 90s house',
    tags: ['keys', 'house', '90s'],
    level: 3,
    blurb: 'Bright, punchy two-note chord stabs bouncing on the offbeat.',
    how: 'A Model D plays one note at a time, but its second oscillator can be tuned up to a fifth away, so each note is a two-note chord. On the hardware you would set that interval and leave it. Here a mod lane retunes Oscillator 2 for every chord, so the progression is minor, then major, then suspended, from one key at a time: one hand on the FREQUENCY knob, set in the gap before each new chord. A second hand opens the cutoff slowly across part A and closes it across part B, so the riff brightens and settles every two bars.',
    steps: [
      {
        title: 'Two equal sawtooths',
        module: 'osc',
        why: 'Both sawtooths at the same level, so the second note of each chord is as loud as the first. Oscillator 2 starts in unison; the lane tunes it.',
        set: {
          'osc1.wave': 'saw',
          'osc2.wave': 'saw',
          'osc2.range': '8',
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 7,
        },
        listen: 'a full, buzzy unison.',
      },
      {
        title: 'Try an interval by hand',
        module: 'osc',
        why: 'Seven semitones up is a fifth: play a note and you hear a bare power chord. Three is a minor third, four a major third, five a fourth.',
        set: { 'osc2.freq': 7 },
        listen: 'one key playing two notes, a fifth apart.',
      },
      {
        title: 'Short, plucked stabs',
        module: 'filter',
        why: 'The filter snaps open and shut, and the loudness dies away fast with nothing held: the clipped stab of an early house record.',
        set: {
          'filter.cutoff': -0.5,
          'filter.emphasis': 2,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.5,
          'fenv.sustain': 0,
          'aenv.attack': 0,
          'aenv.decay': 2.2,
          'aenv.sustain': 0,
        },
        listen: 'a bright chord that is gone almost at once.',
      },
    ],
    context: {
      'osc2.freq':
        'Played by a lane: the interval of each chord. 3 is minor, 4 major, 5 a fourth, 7 a fifth.',
      'filter.cutoff':
        'The other lane: opening slowly across part A and closing across part B, so the riff builds and settles.',
      'aenv.decay': 'The length of each stab. Longer turns them into chords that ring together.',
      'filter.emphasis': 'More gives the stabs a hollow, vocal edge.',
    },
    tweaks: [
      laneTweak(
        'osc2.freq',
        'set the Osc 2 frequency lane to 7 everywhere.',
        'Every chord becomes a bare fifth: darker, more like a techno stab.'
      ),
      laneTweak(
        'filter.cutoff',
        'draw the cutoff lane as one climb across both parts.',
        'A four-bar build that drops back as the loop comes round.'
      ),
      {
        id: 'aenv.decay',
        try: 'Move between 1.5 and 4',
        hear: 'From dry clicks to ringing organ-like chords.',
      },
      { id: 'filter.emphasis', try: 'Push up to 5', hear: 'A nasal, hollow stab.' },
    ],
    pattern: {
      key: key('interval-stab-riff'),
      name: 'Interval Stab Riff',
      role: 'chord_stabs',
      genre: 'Early 90s house',
      bpm: 122,
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            '. . C3! . | . . C3 . | . C3 . . | C3:2 . . . | . . F3! . | . . F3 . | . F3 . . | Ab3 . G3:2 .',
          lanes: {
            'osc2.freq': holds({ 0: 7, 16: 3, 28: 4, 30: 5 }),
            'filter.cutoff': ramp(0.2, 2.4),
          },
        },
        {
          notes:
            '. . Eb3! . | . . Eb3 . | . Eb3 . . | Eb3:2 . . . | . . Bb2! . | . . Bb2 . | . C3 . . | D3 . G3:2 .',
          lanes: {
            'osc2.freq': holds({ 0: 4, 16: 4, 25: 3, 28: 5, 30: 4 }),
            'filter.cutoff': ramp(2.4, 0.2),
          },
        },
      ],
      notes:
        'Offbeat stabs, the house push on the and of each beat and a syncopated third stab. A: C with a fifth, F minor (F and A♭), A♭ major, then a G suspended fourth. B: E♭ major, B♭ major, C minor, D with a fourth, and G major to lead back to C. The interval lane is the harmony; the cutoff lane opens across A and closes across B, two slow turns of the knob.',
    },
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-wave-switch',
    name: 'Wave-Switch Lead',
    ref: 'A singing synth-pop lead whose waveform is switched inside each long note, brassy at the front and hollow as it holds',
    artist: '80s synth-pop',
    tags: ['lead', 'synth-pop', '80s'],
    level: 3,
    blurb:
      'A bright pop lead whose long notes start brassy and turn hollow, with a vibrato that blooms.',
    how: 'Oscillator 1 is the lead and a quiet triangle two octaves up adds sparkle. A mod lane turns Oscillator 1’s waveform switch two steps into each long note, the last of every phrase: sawtooth to square, so the note starts brassy and goes hollow and woody as it holds, and back for the next. In part B the switch goes from narrow to wide pulse instead. A second lane swells vibrato in on those long notes with the mod wheel, as a singer would. One hand on the switch, one on the wheel.',
    steps: [
      {
        title: 'A lead with a little sparkle',
        module: 'osc',
        why: 'Oscillator 1 is the voice. A triangle two octaves up, kept quiet, adds a bell-like shine on top without thickening the tone.',
        set: {
          'osc1.wave': 'saw',
          'mix.osc1': 8,
          'osc2.range': '2',
          'osc2.wave': 'tri',
          'mix.osc2On': true,
          'mix.osc2': 3,
          'ctl.glide': 1,
        },
        listen: 'a bright tone with a faint whistle above it.',
      },
      {
        title: 'Open filter, soft swell',
        module: 'filter',
        why: 'The filter is fairly open, with a slow little rise from its envelope so each note blooms.',
        set: {
          'filter.cutoff': 1.5,
          'filter.emphasis': 2,
          'filter.contour': 3,
          'fenv.attack': 0.5,
          'fenv.decay': 3,
          'fenv.sustain': 5,
          'aenv.attack': 0.5,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'notes that open slightly as they start.',
      },
      {
        title: 'Vibrato, waiting',
        module: 'mod',
        why: 'The LFO goes to the oscillators at a singer’s vibrato rate. MOD DEPTH stays at 0: the wheel brings it in, and its lane pushes it up on held notes.',
        set: {
          'mod.toOsc': true,
          'lfo.rate': lfoAt(5.5),
          'lfo.shape': 'tri',
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'nothing until the mod wheel comes up.',
      },
    ],
    context: {
      'osc1.wave':
        'Played by a lane, inside each phrase’s long note: sawtooth at the front, square as it holds (narrow and wide pulses in part B).',
      'mod.depth': 'Stays at 0: the mod wheel lane swells vibrato in on the long notes only.',
      'mix.osc2': 'The sparkle on top. More makes it bell-like; none makes it plainer.',
      'filter.cutoff': 'How bright the lead is overall.',
    },
    tweaks: [
      laneTweak(
        'osc1.wave',
        'set the waveform lane to triangle on the held steps.',
        'Each long note starts brassy and fades into a soft flute.'
      ),
      laneTweak(
        'mod.depth',
        'start the mod wheel lane’s swell on the first step of each long note.',
        'Vibrato from the start: more like a violin than a singer.'
      ),
      { id: 'mix.osc2', try: 'Raise to 6', hear: 'A glassier, organ-like lead.' },
      { id: 'filter.cutoff', try: 'Drop to 0', hear: 'A darker, more distant lead.' },
    ],
    pattern: {
      key: key('wave-switch-lead'),
      name: 'Wave-Switch Lead',
      role: 'lead_line',
      genre: '80s synth-pop',
      bpm: 108,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'E4:2 . C#4 . | E4:3 . . F#4 | E4:2 . C#4 . | B3:4 . . . | A3:2 . B3 . | C#4:2 . E4 . | F#4:3 . . E4 | C#4:4 . . .',
          lanes: {
            // Two steps into each phrase's long note (B3 and C♯4, four steps each), and back for the next phrase.
            'osc1.wave': (c) => ([14, 15, 30, 31].includes(c.i) ? 'sq' : 'saw'),
            '@wheel': onWheel(moves({ 0: 0, 12: 0, 15: 1.8, 17: 0, 28: 0, 31: 1.8 })),
          },
        },
        {
          notes:
            'A4:2 . G#4 . | F#4:2 . E4 . | F#4:3 . . G#4 | A4:4 . . . | B4:2 . A4 . | G#4:2 . E4 . | F#4:2 . G#4 . | A4:4 . . .',
          lanes: {
            'osc1.wave': (c) => ([14, 15, 30, 31].includes(c.i) ? 'wide' : 'narrow'),
            '@wheel': onWheel(moves({ 0: 0, 12: 0, 15: 2, 17: 0, 28: 0, 31: 2 })),
          },
        },
      ],
      notes:
        'A verse in A major circling E and C♯, falling to B, then climbing A–B–C♯–E–F♯ and landing on C♯. B is the chorus an octave up the register: A down to E, F♯ up to A, B down to E and up to the high A. The waveform lane turns the switch two steps into each phrase’s four-step note and back for the next phrase: sawtooth to square in A, narrow to wide pulse in B, so the chorus is thinner and fills out as it holds. The mod wheel lane swells vibrato in on those notes only.',
    },
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-breath-flute',
    name: 'Breath-Lane Flute',
    ref: 'A breathy synth flute whose breath swells with each phrase, and vibrato that blooms on the long notes',
    artist: 'Folk melody',
    tags: ['wind', 'folk', 'melodic'],
    level: 2,
    blurb: 'A soft, airy flute whose breath rises and falls with the tune.',
    how: 'A triangle through a soft filter makes the flute’s pure tone, and noise is mixed in for breath. The playing is in two mod lanes: the noise swells as each phrase climbs to its long note and eases off as it falls, the way a player blows harder at the top of a phrase. The other pushes the mod wheel up for vibrato on the held notes only. A quick little filter rise on every note does the tonguing.',
    steps: [
      {
        title: 'A pure, soft tone',
        module: 'osc',
        why: 'A triangle has very few harmonics, which is why it sounds like a flute or an ocarina.',
        set: { 'osc1.wave': 'tri', 'mix.osc1': 7 },
        listen: 'a plain, hollow tone.',
      },
      {
        title: 'Add breath',
        module: 'mixer',
        why: 'White noise in the mixer, kept low, is the air around the note.',
        set: { 'mix.noiseOn': true, 'mix.noise': 1.5, 'noise.colour': 'white' },
        listen: 'a faint hiss with the note.',
      },
      {
        title: 'Soften it and let it track',
        module: 'filter',
        why: 'Both keyboard controls on make the filter follow the melody, so high notes stay as bright as low ones. A quick filter rise that settles back gives each note a soft, tongued start.',
        set: {
          'filter.cutoff': 0.5,
          'filter.kbd1': true,
          'filter.kbd2': true,
          'filter.emphasis': 1,
          'filter.contour': 3,
          'fenv.attack': 0.4,
          'fenv.decay': 2.2,
          'fenv.sustain': 5,
          'aenv.attack': 1.2,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'notes that breathe in rather than click.',
      },
      {
        title: 'Vibrato, waiting',
        module: 'mod',
        why: 'The LFO goes to the oscillators at a flute player’s vibrato rate, MOD DEPTH at 0: the wheel brings it in, and its lane raises it.',
        set: { 'mod.toOsc': true, 'lfo.rate': lfoAt(5), 'mod.mix': 10, 'mod.depth': 0 },
        listen: 'a still note until the mod wheel comes up.',
      },
    ],
    context: {
      'mix.noise':
        'Played by a lane: the breath, swelling as each phrase climbs to its long note and easing as it falls.',
      'mod.depth': 'Stays at 0: the mod wheel lane brings vibrato in on the held notes.',
      'aenv.attack': 'How softly each note starts. Longer is more like a recorder blown gently.',
      'filter.cutoff': 'How airy or dark the flute is.',
    },
    tweaks: [
      laneTweak(
        'mix.noise',
        'raise the noise lane on every step to about 5.',
        'A breathy, Japanese shakuhachi-like flute.'
      ),
      laneTweak(
        'mod.depth',
        'flatten the mod wheel lane to 0.',
        'A straight tone, like a recorder or a pipe organ.'
      ),
      {
        id: 'aenv.attack',
        try: 'Move between 0.5 and 3',
        hear: 'From tongued to slowly blown notes.',
      },
      { id: 'osc1.range', try: "Set RANGE to 4'", hear: 'A piccolo an octave up.' },
    ],
    pattern: {
      key: key('breath-lane-flute'),
      name: 'Breath-Lane Flute',
      role: 'lead_line',
      genre: 'Folk melody',
      bpm: 84,
      root: 2,
      scale: 'dorian',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'D4:2 . E4 . | F4:3 . . G4 | A4:4 . . . | G4 F4 E4:2 . | D4:2 . C4 . | D4:3 . . E4 | F4:2 . E4 . | D4:4 . . .',
          lanes: {
            // Blown harder up to each phrase's long note (A4, then D4 at the end), easing off after it.
            'mix.noise': moves({ 0: 1, 8: 3.5, 12: 3, 16: 1.5, 28: 3, 31: 1.2 }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 ? Math.min(1.2, 0.4 * (c.since - 1)) : 0
            ),
          },
        },
        {
          notes:
            'A4:2 . C5 . | B4:2 . A4 . | G4:3 . . A4 | B4:4 . . . | C5 B4 A4:2 . | G4:2 . E4 . | F4:2 . E4 . | D4:4 . . .',
          lanes: {
            'mix.noise': moves({ 0: 1.2, 12: 4, 16: 2, 24: 1.5, 28: 2.5, 31: 1 }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 ? Math.min(1.4, 0.45 * (c.since - 1)) : 0
            ),
          },
        },
      ],
      notes:
        'A tune in D dorian. A rises D–E–F–G to a held A, steps down and comes home through C to D. B is the answering phrase higher up: A to C, B down to A and G, a held B (the dorian sixth), then down through C–B–A–G–E–F–E to D. The noise lane is the breath, rising to each phrase’s long note and easing after, highest on B’s held B; the mod wheel lane adds vibrato from the third step of a held note.',
    },
  },

  // ── 8 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-talking-bass',
    name: 'Talking Emphasis Bass',
    ref: 'An electro-funk bass that says “wow” on every note in part A and “yow” in part B, the filter envelope reset between them by hand',
    artist: 'Electro-funk',
    tags: ['bass', 'electro', '80s'],
    level: 3,
    blurb: 'A talking, vowel-shaped bass that seems to speak each note.',
    how: 'Two oscillators an octave down make a thick bass, and a resonant filter makes it vocal. The filter envelope shapes the vowel inside each note, and two mod lanes change it between parts, as a player would with a hand free. In part A the filter ATTACK is turned up, so each note opens slowly and says “wow”; for part B it is turned right down, so each note snaps open and falls, “yow”. The other hand rides the emphasis in slow waves, so the voice gets more and less nasal as the line goes.',
    steps: [
      {
        title: 'A thick bass',
        module: 'osc',
        why: 'A sawtooth and a square, both at 16’, with the square a hair flat: thick, and with something for the resonance to grip.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'saw',
          'osc2.range': '16',
          'osc2.wave': 'sq',
          'osc2.freq': -0.1,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 5,
        },
        listen: 'a fat, slightly moving bass.',
      },
      {
        title: 'A vocal filter',
        module: 'filter',
        why: 'High emphasis is what makes a filter sound like a mouth, and a big contour lets the filter envelope say the vowel. The attack and emphasis here are only resting points for the lanes.',
        set: {
          'filter.cutoff': -1.5,
          'filter.emphasis': 6,
          'filter.contour': 5,
          'fenv.attack': 2,
          'fenv.decay': 2,
          'fenv.sustain': 3,
        },
        listen: 'a nasal tone that opens slowly on each note: “wow”.',
      },
      {
        title: 'Notes that hold',
        module: 'env',
        why: 'The loudness holds high, so the lanes have time to shape each note.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2, 'aenv.sustain': 8 },
        listen: 'notes that hold as long as they are played.',
      },
    ],
    context: {
      'fenv.attack':
        'Played by a lane: up for part A, so each note opens slowly (“wow”), right down for part B, so it snaps (“yow”).',
      'filter.emphasis': 'The other lane, ridden in slow waves: how nasal the voice is.',
      'osc2.freq': 'The square’s detune. A little more makes the bass growl.',
      'filter.contour': 'How wide the vowel opens on each note.',
    },
    tweaks: [
      laneTweak(
        'filter.emphasis',
        'raise the emphasis lane’s peaks to 9.',
        'The voice squeals at the top of every wave.'
      ),
      laneTweak(
        'fenv.attack',
        'copy part B’s attack lane into part A.',
        'The whole song says “yow”: punchier and more aggressive.'
      ),
      { id: 'osc2.freq', try: 'Move to -0.3', hear: 'A rougher, growlier bass.' },
      { id: 'filter.contour', try: 'Raise to 5', hear: 'A sharper attack on every note.' },
    ],
    pattern: {
      key: key('talking-emphasis-bass'),
      name: 'Talking Emphasis Bass',
      role: 'bass_line',
      genre: 'Electro-funk',
      bpm: 112,
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'D2:3 . . D2 | . F2:2 . D2 | . . A1:2 . | C2:2 . D2 . | D2:3 . . D3 | . C3:2 . A2 | . G2 . F2 | E2:2 . C2:2 .',
          lanes: {
            'fenv.attack': () => 2.2,
            'filter.emphasis': wave(5, 7.5, 16),
          },
        },
        {
          notes:
            'G1:3 . . G1 | . Bb1:2 . G1 | . . D2:2 . | F2:2 . G2 . | A1:3 . . A1 | . C2:2 . E2 | . G2 . A2 | Bb2:2 . A2:2 .',
          lanes: {
            'fenv.attack': () => 0,
            'filter.emphasis': wave(5.5, 8.5, 16),
          },
        },
      ],
      notes:
        'A in D minor: a held D answered by F, a drop to A, and in its second bar a jump to the octave that walks down C–A–G–F–E–C. B moves to G minor, then A, climbing through C, E, G and A to B♭ and back. Chained AABB, so each vowel plays twice. The attack lane is the vowel: up through A, so the filter envelope opens each note slowly (“wow”), and down through B, so it snaps open and falls (“yow”), one turn of the knob at each change of part. The emphasis lane rises and falls twice a part, higher in B.',
    },
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────
  {
    id: 'lane-trance-gate',
    name: 'Gated Trance Pulse',
    ref: 'A sixteenth-note power-chord pulse gated into a rhythm by its note lengths, with a two-handed filter build',
    artist: '90s trance',
    tags: ['seq', 'trance', '90s'],
    level: 2,
    blurb: 'A pulsing, chopped trance riff that builds up brighter every time round.',
    how: 'Two sawtooths a fifth apart make a power chord from one key. Every sixteenth is played, and the sequencer gates them into a rhythm: long notes ring, clipped ones are just a tick, the effect a trance gate gives a held pad. The hands do the build: one lane lifts the cutoff and the other the emphasis, gently through part A and hard through part B, and both drop back as the loop comes round.',
    steps: [
      {
        title: 'A power chord from one key',
        module: 'osc',
        why: 'Oscillator 2 tuned seven semitones up plays the fifth of every note, so one key is a bare chord.',
        set: {
          'osc1.wave': 'saw',
          'osc2.wave': 'saw',
          'osc2.freq': 7,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
        },
        listen: 'a hard, open chord.',
      },
      {
        title: 'A filter to build with',
        module: 'filter',
        why: 'The cutoff starts darkish, with a little emphasis and a small pluck from the envelope.',
        set: {
          'filter.cutoff': -1,
          'filter.emphasis': 3,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 1.5,
          'fenv.sustain': 2,
        },
        listen: 'a rounded, slightly ringing chord.',
      },
      {
        title: 'Held: the note length is the gate',
        module: 'env',
        why: 'With LOUDNESS SUSTAIN high and the LOUD DECAY switch off, a note sounds for exactly as long as its key is down and stops dead. So the sequencer’s note lengths are the gate: a full sixteenth rings, a clipped one is a tick.',
        set: { 'aenv.attack': 0, 'aenv.decay': 1.5, 'aenv.sustain': 7, 'env.loudDecay': false },
        listen: 'a held key keeps sounding until it is let go.',
      },
    ],
    context: {
      'filter.cutoff': 'Played by a lane: the build, slow through A and steep through B.',
      'filter.emphasis':
        'The other lane, rising with the cutoff: the build squeals more as it climbs.',
      'osc2.freq': 'The interval of the chord: 7 is a fifth, 5 a fourth.',
      'aenv.decay': 'How fast each note settles to its held level. Longer blurs the gate.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'make part B’s cutoff lane fall instead of rise.',
        'A breakdown instead of a build.'
      ),
      laneTweak(
        'filter.emphasis',
        'raise the end of part B’s emphasis lane to 7.',
        'The build ends on a squeal.'
      ),
      { id: 'osc2.freq', try: 'Set to 5', hear: 'Fourths: a darker, more modal riff.' },
      {
        id: 'aenv.decay',
        try: 'Move between 1 and 4',
        hear: 'From a hard gate to a softer, pumping one.',
      },
    ],
    pattern: {
      key: key('gated-trance-pulse'),
      name: 'Gated Trance Pulse',
      role: 'arp',
      genre: '90s trance',
      bpm: 138,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 0, 1],
      parts: [
        {
          notes:
            'A2 A2:0.3 A2 A2:0.3 | A2:0.3 A2 A2:0.3 A2:0.3 | F2 F2:0.3 F2 F2:0.3 | F2:0.3 F2:0.3 F2 F2:0.3 | C3 C3:0.3 C3 C3:0.3 | C3:0.3 C3 C3:0.3 C3:0.3 | G2 G2:0.3 G2 G2:0.3 | G2:0.3 G2:0.3 G2 G2:0.3',
          lanes: {
            'filter.cutoff': ramp(-1, 0.3),
            'filter.emphasis': ramp(2.5, 3.5),
          },
        },
        {
          notes:
            'A2 A3:0.3 A2:0.3 E3 | A2:0.3 A3:0.3 A2 E3:0.3 | F2 F3:0.3 F2:0.3 C3 | F2:0.3 F3 F2:0.3 C3 | C3 C4:0.3 C3:0.3 G3 | C3:0.3 C4:0.3 C3 G3:0.3 | G2 G3:0.3 G2:0.3 D3 | G2:0.3 G3 B2:0.3 D3',
          lanes: {
            'filter.cutoff': ramp(0.3, 2.2),
            'filter.emphasis': ramp(3.5, 5.5),
          },
        },
      ],
      notes:
        'A minor, F, C, G: half a bar each, every sixteenth played. The gate is in the notes, a sixteen-step pattern of full and clipped sixteenths; A plays it three times while the cutoff and emphasis lanes rise slowly, then B jumps the line into octaves, changes the gate to a dotted pattern and lifts both steeply, and both hands pull them back as the loop returns.',
    },
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-rate-wobble',
    name: 'Rate-Step Wobble Bass',
    ref: 'A half-time wobble bass whose LFO changes speed every beat, quarter notes to sixteenths, played by a rate lane',
    artist: '2010s bass music',
    tags: ['bass', 'dubstep', '2010s'],
    level: 3,
    blurb: 'A heavy, wobbling bass whose wobble speeds up and slows down with the beat.',
    how: 'Two oscillators an octave down go through a dark filter that the LFO swings open and shut: the wobble. A mod lane changes the LFO RATE on every beat, set to the song’s tempo: quarter notes, eighths, triplets, sixteenths. That rhythmic rate-switching is the whole performance. The other hand is on the mod wheel, setting how deep the wobble goes, deeper in part B.',
    steps: [
      {
        title: 'A heavy bass',
        module: 'osc',
        why: 'A sawtooth and a slightly flat square, both an octave down, are thick and buzzy: plenty for the filter to carve.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'saw',
          'osc2.range': '16',
          'osc2.wave': 'sq',
          'osc2.freq': -0.1,
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 6,
        },
        listen: 'a big, raw bass.',
      },
      {
        title: 'Close the filter',
        module: 'filter',
        why: 'The filter sits nearly shut with some emphasis, so when the LFO opens it there is a vocal “wub”.',
        set: { 'filter.cutoff': -2.5, 'filter.emphasis': 4, 'filter.contour': 0 },
        listen: 'a dark, muffled bass.',
      },
      {
        title: 'The LFO on the filter',
        module: 'mod',
        why: 'FILTER MODULATION on sends the LFO to the cutoff, and the mod wheel sets how far it swings: MOD DEPTH stays at 0, and the wheel brings it in. The LFO RATE is what the other lane plays.',
        set: {
          'mod.toFilter': true,
          'lfo.shape': 'tri',
          'mod.mix': 10,
          'mod.depth': 0,
          'lfo.rate': lfoSync(140, 2),
        },
        listen:
          'a dark, still bass: push the mod wheel up and it opens and closes in eighth notes.',
      },
      {
        title: 'Hold the notes',
        module: 'env',
        why: 'Full sustain, so a held note keeps wobbling as long as it is held.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2, 'aenv.sustain': 10 },
        listen: 'long notes that keep moving.',
      },
    ],
    context: {
      'lfo.rate':
        'Played by a lane, one value a beat, each a division of the song’s 140 bpm: quarter notes, eighths, triplets, sixteenths.',
      'mod.depth': 'Stays at 0: the mod wheel lane sets how far the wobble opens the filter.',
      'filter.emphasis': 'The vowel of the wobble: more is more “yoi”, less is more “wub”.',
      'filter.cutoff': 'Where the wobble starts from.',
    },
    tweaks: [
      laneTweak(
        'lfo.rate',
        'pick the same rate for every step.',
        'A steady wobble: the rhythm of the rate changes is gone.'
      ),
      laneTweak(
        'mod.depth',
        'drop the mod wheel lane to 0 on the first step of each bar.',
        'A clean hit of bass before each wobble starts.'
      ),
      { id: 'filter.emphasis', try: 'Push up to 7', hear: 'A screaming, vocal wobble.' },
      { id: 'lfo.shape', try: 'Switch the LFO to square', hear: 'A choppy, on-off wobble.' },
    ],
    pattern: {
      key: key('rate-step-wobble-bass'),
      name: 'Rate-Step Wobble Bass',
      role: 'bass_line',
      genre: '2010s bass music',
      bpm: 140,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes: up(
            1,
            'E1:6 . . . | . . E1:2 . | G1:4 . . . | E1:4 . . . | E1:6 . . . | . . Bb1:2 . | A1:3 . . G1:2 | . E1:3 . .'
          ),
          lanes: {
            'lfo.rate': (c) => lfoSync(140, [2, 2, 1, 4, 2, 3, 2, 4][Math.floor(c.i / 4)]),
            '@wheel': onWheel((c) => (c.sounding === null ? 0 : 5)),
          },
        },
        {
          notes: up(
            1,
            'C2:4 . . . | C2:2 . C2:2 . | B1:4 . . . | B1:2 . G1:2 . | A1:6 . . . | . . A1:2 . | G1:4 . . . | F#1:2 . E1:2 .'
          ),
          lanes: {
            'lfo.rate': (c) => lfoSync(140, [4, 4, 2, 2, 3, 3, 1, 8][Math.floor(c.i / 4)]),
            '@wheel': onWheel((c) => (c.sounding === null ? 0 : 7)),
          },
        },
      ],
      notes:
        'Half-time at 140: A holds E, flicks to G and back, with a B♭ (the flat fifth) and A–G–E to close. B climbs to C and falls through B, A and G to F♯ and E. The rate lane changes the wobble every beat, from quarter notes up to sixteenths, and to thirty-seconds on B’s last beat; the mod wheel lane opens it wider in B.',
    },
  },
  // ── 11 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-fm-growl',
    name: 'FM Growl Riff',
    ref: 'A clanging, growling industrial bass: Oscillator 3 frequency-modulates the others, its depth and ratio played by lanes',
    artist: 'Industrial body music',
    tags: ['bass', 'industrial', '80s'],
    level: 3,
    blurb:
      'A metallic, snarling bass whose growl swells through each bar and whose clang changes between sections.',
    how: 'Oscillator 3 is taken out of the mixer and used as a modulator at audio rate, following the keyboard: that is frequency modulation, and it turns a plain sawtooth into a clang. One mod lane rides the mod wheel, swelling the snarl through each bar and easing it back for the next. The other retunes Oscillator 3, which changes the ratio between modulator and carrier and so the colour of the clang: plain in the first half of part A, a fifth in the second, and four different colours through part B, a turn of the knob every half bar.',
    steps: [
      {
        title: 'A sawtooth bass',
        module: 'osc',
        why: 'The carrier: one sawtooth an octave down.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'mix.osc1': 8 },
        listen: 'a plain, buzzy bass.',
      },
      {
        title: 'Oscillator 3 as a modulator',
        module: 'osc',
        why: 'Oscillator 3 is left out of the mixer and set to a triangle an octave above the carrier, still following the keyboard, so its modulation stays in tune with every note.',
        set: {
          'mix.osc3On': false,
          'osc3.range': '8',
          'osc3.wave': 'tri',
          'osc3.kbd': true,
          'osc3.freq': 0,
        },
        listen: 'no change yet: Oscillator 3 is silent on its own.',
      },
      {
        title: 'Route it to pitch',
        module: 'mod',
        why: 'MOD MIX fully left picks source A, Oscillator 3, and OSCILLATOR MODULATION sends it to the pitch of all the oscillators. MOD DEPTH is left at 0: the wheel brings it in, and is the amount.',
        set: { 'mod.srcA': 'osc3', 'mod.mix': 0, 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'push the mod wheel up: the bass clangs and growls.',
      },
      {
        title: 'Shape it',
        module: 'filter',
        why: 'A half-open filter with a small pluck, and notes that hold.',
        set: {
          'filter.cutoff': 0,
          'filter.emphasis': 2,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2,
          'fenv.sustain': 4,
          'aenv.attack': 0,
          'aenv.decay': 2,
          'aenv.sustain': 9,
        },
        listen: 'a firm bass with a little bite on each note.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane sets how hard Oscillator 3 growls, swelling through each bar and eased back for the next.',
      'osc3.freq':
        'The other lane: Oscillator 3’s tuning, which is the FM ratio. 0 is harmonic; 7 a fifth up is still sweet; 5 or −5 go metallic.',
      'osc3.wave': 'The modulator’s shape. A square makes a harsher, buzzier growl.',
      'filter.cutoff': 'How much of the clang gets through.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'draw the mod wheel lane up through each held note.',
        'The growl swells as the notes hold.'
      ),
      laneTweak(
        'osc3.freq',
        'try 3.5 in the frequency lane.',
        'An inharmonic ratio: bell-like and out of key, very industrial.'
      ),
      {
        id: 'osc3.wave',
        try: 'Switch Oscillator 3 to square',
        hear: 'A rougher, more distorted growl.',
      },
      { id: 'filter.cutoff', try: 'Open to 2', hear: 'More of the metallic top end.' },
    ],
    pattern: {
      key: key('fm-growl-riff'),
      name: 'FM Growl Riff',
      role: 'bass_line',
      genre: 'Industrial body music',
      bpm: 100,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'E2! E2 . E2 | F2 . E2 . | E2! E2 . G2 | . E2 F2 . | E2! E2 . E2 | Bb2 . A2 . | G2! . F2 . | E2 . F2:2 .',
          lanes: {
            '@wheel': onWheel(moves({ 0: 1.5, 12: 5, 16: 1.5, 28: 6, 31: 3 })),
            'osc3.freq': holds({ 0: 0, 16: 7 }),
          },
        },
        {
          notes:
            'A2! A2 . A2 | Bb2 . A2 . | A2! A2 . C3 | . A2 Bb2 . | G2! G2 . G2 | F2 . E2 . | F2! . G2 . | Bb2 . A2:2 .',
          lanes: {
            '@wheel': onWheel(moves({ 0: 3, 12: 7, 16: 3, 28: 8, 31: 4 })),
            'osc3.freq': holds({ 0: 5, 8: 0, 16: -5, 24: -2 }),
          },
        },
      ],
      notes:
        'An E phrygian riff: the flat second F leaning on E, a lift to G, and a tritone B♭ falling through A, G and F. B goes up a fourth to A with its own flat second, then down through G, F and E. The mod wheel lane swells the snarl through each bar, harder in B; the frequency lane changes the clang every half bar in B, so the same notes keep changing metal.',
    },
  },

  // ── 12 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-overdrive-riff',
    name: 'Overdrive-Lane Rock Riff',
    ref: 'A three-oscillator prog-rock riff that is nearly clean in the verse and driven hard in the chorus, by the feedback trick',
    artist: '70s progressive rock',
    tags: ['lead', 'prog', '70s'],
    level: 3,
    blurb:
      'A heavy synth riff that snarls into overdrive for the chorus and pushes harder on the accents.',
    how: 'Three oscillators make a big rock tone. With nothing plugged into EXT, switching on the external input feeds the synth’s own output back into its mixer: the Minimoog’s overdrive trick. A mod lane rides that EXT IN VOLUME, low through the verse (part A) with a push on the accents, turned up over the chorus’s (part B’s) first beat and eased back over its last. A second lane opens the cutoff on the accents and further in the chorus.',
    steps: [
      {
        title: 'Three oscillators',
        module: 'osc',
        why: 'Two sawtooths a hair apart and a square an octave down: the classic big three-oscillator lead.',
        set: {
          'osc2.wave': 'saw',
          'osc2.freq': 0.12,
          'mix.osc2On': true,
          'osc3.range': '16',
          'osc3.wave': 'sq',
          'mix.osc3On': true,
          'mix.osc1': 8,
          'mix.osc2': 7,
          'mix.osc3': 4,
        },
        listen: 'a wide, heavy tone.',
      },
      {
        title: 'The feedback loop',
        module: 'mixer',
        why: 'With no cable in EXT, the external input carries the synth’s own output. A little of it thickens the tone; a lot distorts it. The lane rides this knob.',
        set: { 'mix.extOn': true, 'mix.ext': 2 },
        listen: 'a slightly thicker, grittier tone.',
      },
      {
        title: 'Shape the riff',
        module: 'filter',
        why: 'A half-open filter, a modest pluck, and notes that hold.',
        set: {
          'filter.cutoff': 1,
          'filter.emphasis': 2,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 5,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 8,
        },
        listen: 'a firm, driven riff.',
      },
    ],
    context: {
      'mix.ext':
        'Played by a lane: the overdrive. Low in the verse, turned up into the chorus and back out of it, pushed on accents.',
      'filter.cutoff': 'The other lane: brighter on the accents and through the chorus.',
      'out.volume': 'Also sets how hard the feedback loop is driven.',
      'osc2.freq': 'The detune that makes the riff wide.',
    },
    tweaks: [
      laneTweak(
        'mix.ext',
        'copy part B’s EXT IN lane into part A.',
        'The whole song in overdrive: no verse, all chorus.'
      ),
      laneTweak(
        'filter.cutoff',
        'raise the cutoff lane to 3 on the last bar of B.',
        'The end of the chorus screams before the verse comes back.'
      ),
      {
        id: 'out.volume',
        try: 'Move between 5 and 9',
        hear: 'Less or more drive from the same lane.',
      },
      { id: 'mix.osc3', try: 'Raise to 7', hear: 'A heavier, chunkier low end.' },
    ],
    pattern: {
      key: key('overdrive-lane-rock-riff'),
      name: 'Overdrive-Lane Rock Riff',
      role: 'lead_line',
      genre: '70s progressive rock',
      bpm: 128,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'E2! . E2 G2 | E2 . A2 . | E2 . B2 A2 | G2 . E2 D2 | E2! . E2 G2 | E2 . A2 . | B2! . D3 B2 | A2 . G2 E2',
          lanes: {
            'mix.ext': (c) => (c.accent ? 3.5 : 1),
            'filter.cutoff': (c) => (c.accent ? 1.8 : 0.5),
          },
        },
        {
          notes:
            'G2! . G2 B2 | G2 . C3 . | A2! . A2 C3 | A2 . D3 . | B2! . B2 D3 | E3 . D3 B2 | A2! . G2 . | F#2 . D#2 B1',
          lanes: {
            // Turned up over the chorus's first beat and back down over its last, so the verse is never a leap away.
            'mix.ext': (c) =>
              (moves({ 0: 3, 4: 6, 28: 6, 31: 3 })(c) as number) + (c.accent && c.i > 0 ? 2.5 : 0),
            'filter.cutoff': (c) => (c.accent ? 2.8 : 2),
          },
        },
      ],
      notes:
        'A is the verse riff in E minor: E answered by G and A, a lift to B and down through A–G–E–D. B is the chorus: G, A and B, each with its third above, climbing to E and falling to F♯, D♯ and B, the dominant that pulls back to E. AABB. The EXT IN lane is the drive, lightly in A and hard in B, turned up over B’s first beat and back over its last, with every accent pushed further.',
    },
  },

  // ── 13 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-glass-arp',
    name: 'Glass Arpeggio',
    ref: 'A shimmering Lydian sixteenth-note arpeggio whose brightness repeats in threes against the beat’s fours',
    artist: 'Synthwave',
    tags: ['keys', 'synthwave', '2010s'],
    level: 2,
    blurb: 'A glassy, sparkling arpeggio with an accent that seems to roll across the beat.',
    how: 'A triangle and a square two octaves up make a bell-like tone that dies away on every note. The LFO sweeps the filter once every three sixteenths while the arpeggio repeats every four, so the bright note lands somewhere new each time: the rolling accent. Two mod lanes ride it by hand: one brings the roll in and out with the mod wheel, the other lets the notes ring longer through part A and draws them back in through part B.',
    steps: [
      {
        title: 'A bell-like tone',
        module: 'osc',
        why: 'A triangle for the body and a quiet square two octaves up for the glassy overtone.',
        set: {
          'osc1.wave': 'tri',
          'mix.osc1': 6,
          'osc2.range': '2',
          'osc2.wave': 'sq',
          'mix.osc2On': true,
          'mix.osc2': 3,
        },
        listen: 'a soft tone with a bright ping above it.',
      },
      {
        title: 'A filter that follows the notes',
        module: 'filter',
        why: 'Keyboard control 1 keeps the high notes bright. A small pluck from the envelope makes each note ping.',
        set: {
          'filter.cutoff': 1,
          'filter.kbd1': true,
          'filter.emphasis': 3,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 1.8,
          'fenv.sustain': 2,
        },
        listen: 'a ping on every note.',
      },
      {
        title: 'Notes that die away',
        module: 'env',
        why: 'With LOUDNESS SUSTAIN at 0, the decay alone sets how long each note rings, which is what the lane plays.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2.2, 'aenv.sustain': 0 },
        listen: 'every note fading out like a struck bell.',
      },
      {
        title: 'Roll the filter with the LFO',
        module: 'mod',
        why: 'MOD MIX fully right picks the LFO, and FILTER MODULATION sends it to the cutoff. Its rate is one cycle every three sixteenths at the song’s 96 bpm, against the arpeggio’s fours. MOD DEPTH is left at 0: the wheel brings it in.',
        set: {
          'mod.mix': 10,
          'mod.toFilter': true,
          'lfo.shape': 'tri',
          'lfo.rate': lfoSync(96, 4 / 3),
          'mod.depth': 0,
        },
        listen: 'push the mod wheel up: the brightness rolls across the notes.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane sets how much of the LFO’s three-step roll reaches the filter, swelling through each half of the song.',
      'aenv.decay':
        'The other lane: the notes ring longer through A and are drawn back in through B.',
      'lfo.rate': 'Set to three sixteenths a cycle against the arpeggio’s four: the roll.',
      'mix.osc2': 'The glass on top. More is more like a celesta.',
      'filter.emphasis': 'A ring at the cutoff. More makes the bright notes sing.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'flatten the mod wheel lane to 0.',
        'The roll stops: every note as bright as the last.'
      ),
      laneTweak(
        'aenv.decay',
        'raise the decay lane to 4 everywhere.',
        'The notes ring into each other: a wash rather than a pattern.'
      ),
      {
        id: 'lfo.rate',
        try: 'Slow it to about 4',
        hear: 'A slow tide of brightness instead of a roll.',
      },
      { id: 'mix.osc2', try: 'Raise to 6', hear: 'A brighter, more metallic arpeggio.' },
      {
        id: 'filter.emphasis',
        try: 'Push up to 6',
        hear: 'A ringing, synthetic shimmer on every note.',
      },
    ],
    pattern: {
      key: key('glass-arpeggio'),
      name: 'Glass Arpeggio',
      role: 'arp',
      genre: 'Synthwave',
      bpm: 96,
      root: 5,
      scale: 'lydian',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'F3 A3 C4 E4 | B4 E4 C4 A3 | F3 A3 C4 E4 | B4 E4 C4 A3 | D3 F3 A3 C4 | E4 C4 A3 F3 | G3 B3 D4 F#4 | A4 F#4 D4 B3',
          lanes: {
            '@wheel': onWheel(moves({ 0: 2, 16: 5, 31: 3 })),
            'aenv.decay': ramp(1.8, 3),
          },
        },
        {
          notes:
            'C3 E3 G3 B3 | F#4 B3 G3 E3 | A2 C3 E3 G3 | B3 G3 E3 C3 | Bb2 D3 F3 A3 | C4 A3 F3 D3 | C3 E3 G3 B3 | D4 B3 G3 E3',
          lanes: {
            '@wheel': onWheel(moves({ 0: 3, 16: 6, 31: 2 })),
            'aenv.decay': ramp(3, 1.8),
          },
        },
      ],
      notes:
        'An F major seventh arpeggio with the Lydian B on top, then D minor and G major (the Lydian II). B: C major seventh with an F♯, A minor seventh, a B♭ major seventh for colour, and C again. The LFO sweeps the filter every three steps against the four-note shapes, so the accent rolls round the beat; the mod wheel lane brings that roll in through each part, most in the middle of B, and the decay lane lets the notes ring longer through A and draws them in through B.',
    },
  },

  // ── 14 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-garage-sub',
    name: 'Two-Step Garage Bass',
    ref: 'A swung, skippy UK garage sub bass with slides picked by a glide lane and a pluck on the accents',
    artist: 'UK garage',
    tags: ['bass', 'garage', '90s'],
    level: 2,
    blurb: 'A bouncing, swung sub bass that slides between some notes and skips over others.',
    how: 'A square and a triangle an octave down make a round sub with a little edge, through a mostly closed filter. The rhythm is two-step: swung sixteenths with gaps. One mod lane raises GLIDE only on the notes a slide lands on, so the line slips into those and jumps to the rest. The other jabs the contour amount up on the two accented notes of each part, so they pluck brighter than the rest.',
    steps: [
      {
        title: 'A rounded sub',
        module: 'osc',
        why: 'A square for presence and a triangle under it for the round, felt low end, both an octave down.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'sq',
          'osc2.range': '16',
          'osc2.wave': 'tri',
          'mix.osc2On': true,
          'mix.osc1': 6,
          'mix.osc2': 7,
        },
        listen: 'a round, deep bass with a hollow edge.',
      },
      {
        title: 'Mostly closed, with a pluck',
        module: 'filter',
        why: 'A dark filter and a quick envelope: the lane raises the contour on accents.',
        set: {
          'filter.cutoff': -1.8,
          'filter.emphasis': 2,
          'filter.contour': 3.5,
          'fenv.attack': 0,
          'fenv.decay': 1.8,
          'fenv.sustain': 1,
          'aenv.attack': 0,
          'aenv.decay': 2.4,
          'aenv.sustain': 8,
        },
        listen: 'a muted, bouncy sub.',
      },
    ],
    context: {
      'ctl.glide': 'Played by a lane: up only on the notes a slide lands on.',
      'filter.contour': 'The other lane: a brighter pluck on the accents.',
      'filter.cutoff': 'How dark the sub sits between plucks.',
      'mix.osc1': 'The square’s edge. Less makes the bass more of a pure sub.',
    },
    tweaks: [
      laneTweak(
        'ctl.glide',
        'add glide on the first note of each bar.',
        'Every bar swoops in from the last note of the one before.'
      ),
      laneTweak(
        'filter.contour',
        'raise the contour lane to 7 on every note.',
        'A punchier, more insistent bass that loses its light and shade.'
      ),
      { id: 'filter.cutoff', try: 'Close to -3', hear: 'Almost pure sub: a felt pulse.' },
      { id: 'aenv.decay', try: 'Lower to 1.5', hear: 'Shorter, skippier notes.' },
    ],
    pattern: {
      key: key('two-step-garage-bass'),
      name: 'Two-Step Garage Bass',
      role: 'bass_line',
      genre: 'UK garage',
      bpm: 132,
      swing: 62,
      root: 7,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'G2! . . . | . . G2 . | Bb2^ C3 . . | G2 . . F2 | . . G2! . | . . D3 . | . C3 Bb2^ A2 | . F2 G2 .',
          lanes: {
            'ctl.glide': (c) => (c.slidIn ? 2.5 : 0),
            // A jab of the knob on the two accents, otherwise left where the panel has it. Small enough to make in the
            // shortened gap a swung step leaves.
            'filter.contour': (c) => (c.accent ? 6 : 3.5),
          },
        },
        {
          notes:
            'Eb2! . . . | . . Eb3 . | D3^ C3 . . | Bb2 . . G2 | . . F2! . | . . F3 . | . Eb3 D3^ C3 | . A2 D3 .',
          lanes: {
            'ctl.glide': (c) => (c.slidIn ? 2.5 : 0),
            'filter.contour': (c) => (c.accent ? 6 : 3.5),
          },
        },
      ],
      notes:
        'Two-step in G minor at 132 with heavy swing: the root on one, a skip on the and of two, a slide from B♭ up to C, and a pushed G on the and of the second bar’s one. B moves to E♭, slides down from D to C, then F, and a last slide D to C over A to D, the dominant. The glide lane is up only where a slide lands.',
    },
  },

  // ── 15 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-italo-octaves',
    name: 'Italo Octave Bass',
    ref: 'A bouncing eighth-note octave bass in the disco tradition, its filter opening over four bars and its ring rising and falling',
    artist: 'Italo disco',
    tags: ['bass', 'disco', '80s'],
    level: 2,
    blurb: 'A bouncing, driving octave bass that slowly opens up over the song.',
    how: 'Two sawtooths an octave down bounce between each note and its octave. One mod lane sweeps the cutoff in one slow wave that runs across both parts, four bars from dark to bright and back. Keyboard control opens the filter a little for the high octave of each pair, so the upper notes are brighter and the bounce feels bigger. The other lane turns the emphasis up through part A and back down through part B, so the bass rings more as it opens.',
    steps: [
      {
        title: 'Two sawtooths an octave down',
        module: 'osc',
        why: 'Two saws, Oscillator 2 a fraction sharp, for a wide disco bass.',
        set: {
          'osc1.range': '16',
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'osc2.freq': 0.06,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
        },
        listen: 'a thick, slowly beating bass.',
      },
      {
        title: 'A bouncy filter',
        module: 'filter',
        why: 'A quick pluck on each note from the envelope, over a cutoff the lane will sweep. Keyboard control 1 opens the filter a little for higher notes, so the top of each octave is brighter.',
        set: {
          'filter.cutoff': -1,
          'filter.kbd1': true,
          'filter.emphasis': 3,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.6,
          'fenv.sustain': 1,
          'aenv.attack': 0,
          'aenv.decay': 2,
          'aenv.sustain': 6,
        },
        listen: 'a punchy, plucked bass.',
      },
    ],
    context: {
      'filter.cutoff': 'Played by a lane in one four-bar wave across parts A and B.',
      'filter.emphasis':
        'The other lane: turned up through A and back down through B, so the bass rings as it opens.',
      'osc2.freq': 'The detune that makes the bass wide.',
      'filter.contour': 'The pluck on each note.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'draw the cutoff lane low and flat through part A, then open in B.',
        'A verse that holds back and a chorus that opens.'
      ),
      laneTweak(
        'filter.emphasis',
        'raise the top of the emphasis lane to 7.',
        'The bass squelches at its brightest: closer to an acid bass.'
      ),
      { id: 'filter.contour', try: 'Raise to 6', hear: 'A harder, clickier pluck.' },
      { id: 'osc2.freq', try: 'Set to 0', hear: 'A narrower, punchier bass.' },
    ],
    pattern: {
      key: key('italo-octave-bass'),
      name: 'Italo Octave Bass',
      role: 'bass_line',
      genre: 'Italo disco',
      bpm: 118,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'A2 . A3 . | A2 . A3 . | A2 . A3 . | A2 . A3 A3 | F2 . F3 . | F2 . F3 . | G2 . G3 . | G2 . G3 .',
          lanes: {
            'filter.cutoff': wave(-2.2, 1.5, 64),
            'filter.emphasis': ramp(3, 5.5),
          },
        },
        {
          notes:
            'C3 . C4 . | C3 . C4 C4 | G2 . G3 . | G2 . G3 . | D3 . D4 . | D3 . D4 D4 | E2 . E3 . | E2 . E3 E3',
          lanes: {
            'filter.cutoff': wave(-2.2, 1.5, 64, 32),
            'filter.emphasis': ramp(5.5, 3),
          },
        },
      ],
      notes:
        'Eighth-note octaves, with a sixteenth pickup on the high note to make it gallop. A: A minor for a bar, then F and G. B: C, G, D and an E that turns the progression back to A minor. The cutoff lane is one 64-step wave spread over A and B; the emphasis lane climbs through A and falls back through B, and keyboard control brightens the upper note of each octave pair.',
    },
  },

  // ── 16 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-motorik-drift',
    name: 'Motorik Drift',
    ref: 'A steady eighth-note motorik pulse whose second oscillator drifts slowly in and out of tune with the first',
    artist: 'Motorik krautrock',
    tags: ['seq', 'krautrock', '70s'],
    level: 2,
    blurb: 'A hypnotic, steady pulse that shimmers and swims as its two oscillators drift apart.',
    how: 'Two sawtooths play a straight, unchanging eighth-note line, the motorik beat. The movement is all in the mod lanes. One detunes Oscillator 2 in a slow wave, a little flat, then in tune, then a little sharp, so the beating between the two speeds up, stops and starts again. The other opens and closes the filter once every two bars.',
    steps: [
      {
        title: 'Two sawtooths',
        module: 'osc',
        why: 'Two equal saws. The lane will move Oscillator 2’s tuning by a fraction of a semitone, which is what makes them beat.',
        set: {
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 7,
        },
        listen: 'a full saw tone; the two are in unison for now.',
      },
      {
        title: 'Pulse it',
        module: 'filter',
        why: 'A pluck on each eighth note, with a short loudness envelope so they stay separate.',
        set: {
          'filter.cutoff': 0,
          'filter.emphasis': 2,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2,
          'fenv.sustain': 3,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 5,
        },
        listen: 'a steady, plucked pulse.',
      },
    ],
    context: {
      'osc2.freq':
        'Played by a lane in a slow wave of a third of a semitone either way: the drift.',
      'filter.cutoff': 'The other lane: one swell every two bars.',
      'filter.contour': 'The pluck on each note.',
      'aenv.decay': 'Longer lets the eighths ring together into a drone.',
    },
    tweaks: [
      laneTweak(
        'osc2.freq',
        'set the frequency lane to 7 on every step.',
        'The pulse in fifths: bigger and more like an organ.'
      ),
      laneTweak(
        'filter.cutoff',
        'draw a sixteenth-note zig-zag into the cutoff lane.',
        'The pulse ticks bright and dark: busier, more electronic.'
      ),
      { id: 'aenv.decay', try: 'Raise to 4', hear: 'The pulse blurs into a drone.' },
      { id: 'filter.emphasis', try: 'Push to 5', hear: 'A ringing, glassier pulse.' },
    ],
    pattern: {
      key: key('motorik-drift'),
      name: 'Motorik Drift',
      role: 'bass_line',
      genre: 'Motorik krautrock',
      bpm: 132,
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'D2 . D2 . | D2 . D3 . | D2 . D2 . | F2 . D2 . | D2 . D2 . | D2 . D3 . | C2 . C2 . | A1 . C2 .',
          lanes: {
            'osc2.freq': wave(-0.35, 0.35, 64),
            'filter.cutoff': wave(-1, 1.5, 32),
          },
        },
        {
          notes:
            'G1 . G1 . | G1 . G2 . | G1 . G1 . | Bb1 . G1 . | A1 . A1 . | A1 . A2 . | C2 . C2 . | A1 . C2 .',
          lanes: {
            'osc2.freq': wave(-0.35, 0.35, 64, 32),
            'filter.cutoff': wave(-0.5, 2, 32),
          },
        },
      ],
      notes:
        'Straight eighths on D, an octave jump in each bar, a lean up to F and down through C and A. B is the same motion on G, then A, then back to C and A. The frequency lane is a 64-step wave, so over the two plays of A the beating between the oscillators slows, stops, and speeds up again; the cutoff swells once every two bars, a little brighter in B.',
    },
  },

  // ── 17 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-pulse-shuffle',
    name: 'Pulse-Width Shuffle',
    ref: 'A wiry new-wave riff whose oscillator is flicked between square, wide and narrow pulses on every beat',
    artist: 'Post-punk new wave',
    tags: ['lead', 'new-wave', '80s'],
    level: 3,
    blurb: 'A twitchy, wiry riff whose tone flickers from beat to beat.',
    how: 'The Model D has no pulse-width knob, but its waveform switch has three pulses: square, wide and narrow. A mod lane flicks Oscillator 1’s switch to its neighbour on every beat, square to wide to narrow and back, which gives the riff a nervous, phasing flicker like pulse-width modulation, but in rhythm. A second lane lifts the cutoff through each bar.',
    steps: [
      {
        title: 'A pulse lead',
        module: 'osc',
        why: 'Oscillator 1 on a square, with a quiet sawtooth an octave down for body.',
        set: {
          'osc1.wave': 'sq',
          'mix.osc1': 8,
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc2': 3,
        },
        listen: 'a hollow, wiry tone.',
      },
      {
        title: 'A tight filter',
        module: 'filter',
        why: 'A short pluck and a short loudness envelope for a choppy, guitar-like riff.',
        set: {
          'filter.cutoff': 0.5,
          'filter.emphasis': 3,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 1.8,
          'fenv.sustain': 3,
          'aenv.attack': 0,
          'aenv.decay': 2.2,
          'aenv.sustain': 6,
        },
        listen: 'a choppy, nervous riff.',
      },
    ],
    context: {
      'osc1.wave': 'Played by a lane: square, wide and narrow pulses, flicked on every beat.',
      'filter.cutoff': 'The other lane: a rise through each bar.',
      'mix.osc2': 'The body underneath. Up for a fatter riff.',
      'filter.emphasis': 'A ring on the flicker.',
    },
    tweaks: [
      laneTweak(
        'osc1.wave',
        'set the waveform lane to narrow on every step.',
        'A thin, nasal, steady riff: the flicker is gone.'
      ),
      laneTweak(
        'filter.cutoff',
        'flatten the cutoff lane at 2.',
        'A brighter riff with no rise in it.'
      ),
      { id: 'mix.osc2', try: 'Raise to 6', hear: 'A fatter, darker riff.' },
      { id: 'filter.emphasis', try: 'Push to 6', hear: 'A ringing, bubbling flicker.' },
    ],
    pattern: {
      key: key('pulse-width-shuffle'),
      name: 'Pulse-Width Shuffle',
      role: 'lead_line',
      genre: 'Post-punk new wave',
      bpm: 132,
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'C3! . C3 Eb3 | . C3 G3 . | Bb2 . C3 . | Eb3 . F3 G3 | C3! . C3 Eb3 | . C3 G3 . | Bb2 . G2 . | Ab2 . Bb2 .',
          lanes: {
            // A beat each, one click of the switch at a time.
            'osc1.wave': (c) => ['sq', 'wide', 'narrow', 'wide'][Math.floor(c.i / 4) % 4],
            'filter.cutoff': (c) => -0.5 + 0.18 * (c.i % 16),
          },
        },
        {
          notes:
            'Ab2! . Ab2 C3 | . Ab2 Eb3 . | G2 . Ab2 . | C3 . Eb3 F3 | G2! . G2 B2 | . G2 D3 . | F3 . Eb3 . | D3 . B2 .',
          lanes: {
            'osc1.wave': (c) => ['narrow', 'wide', 'sq', 'wide'][Math.floor(c.i / 4) % 4],
            'filter.cutoff': (c) => 0 + 0.2 * (c.i % 16),
          },
        },
      ],
      notes:
        'A in C minor, root and minor third, a reach to G, and a B♭–C–E♭–F–G run; its second bar turns down through B♭, G and A♭. B goes to A♭ major, then G major with its B natural, and falls F–E♭–D–B to lead home. The waveform lane flicks the pulse on every beat, one click at a time, starting from the other end in B; the cutoff lane rises through every bar.',
    },
  },

  // ── 18 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-contour-marimba',
    name: 'Contour Marimba Cells',
    ref: 'Interlocking marimba-like pulse cells in the minimalist tradition, with accents in threes phasing over the fours',
    artist: 'American minimalism',
    tags: ['keys', 'minimal', '70s'],
    level: 3,
    blurb: 'Bright, wooden pulse patterns whose accents drift and phase over the beat.',
    how: 'A triangle with a quiet square two octaves up, dying away fast, makes a wooden, marimba-like strike. The notes are four-note cells, and the LFO brightens the filter once every three steps, which never lines up with the four, so the accents seem to walk through the pattern: the phasing effect of minimalist pulse music. Two mod lanes ride it slowly: the mod wheel brings the phasing in and lets it fade, and the filter decay rounds the strike off through part A and tightens it again through part B.',
    steps: [
      {
        title: 'A wooden strike',
        module: 'osc',
        why: 'A triangle for the bar’s tone and a quiet square two octaves up for its knock.',
        set: {
          'osc1.wave': 'tri',
          'mix.osc1': 7,
          'osc2.range': '2',
          'osc2.wave': 'sq',
          'mix.osc2On': true,
          'mix.osc2': 2,
        },
        listen: 'a soft tone with a faint click above it.',
      },
      {
        title: 'A struck, tracking filter',
        module: 'filter',
        why: 'Both keyboard controls on so every note is equally bright, and a fast filter envelope for the strike.',
        set: {
          'filter.cutoff': -0.5,
          'filter.kbd1': true,
          'filter.kbd2': true,
          'filter.emphasis': 1,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.4,
          'fenv.sustain': 0,
        },
        listen: 'a wooden knock on every note.',
      },
      {
        title: 'A fast fade',
        module: 'env',
        why: 'Nothing held: the note dies away like a struck bar.',
        set: { 'aenv.attack': 0, 'aenv.decay': 2.6, 'aenv.sustain': 0 },
        listen: 'a short, ringing strike.',
      },
      {
        title: 'Accents in threes, from the LFO',
        module: 'mod',
        why: 'MOD MIX fully right picks the LFO and FILTER MODULATION sends it to the cutoff, at one cycle every three sixteenths of the song’s 112 bpm. MOD DEPTH stays at 0: the wheel brings it in.',
        set: {
          'mod.mix': 10,
          'mod.toFilter': true,
          'lfo.shape': 'tri',
          'lfo.rate': lfoSync(112, 4 / 3),
          'mod.depth': 0,
        },
        listen: 'push the mod wheel up: the bright strike walks through the cell.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane sets how strongly the LFO’s threes accent the strikes, phasing in and fading out.',
      'fenv.decay': 'The other lane: the strike rounds off through A and tightens again through B.',
      'filter.contour': 'How bright each strike is before the LFO adds its accent.',
      'aenv.decay': 'How long each bar rings.',
      'mix.osc2': 'The knock on top. More is more like a xylophone.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'hold the mod wheel lane at its highest all the way through.',
        'The phasing never fades: a hard, insistent walk.'
      ),
      laneTweak(
        'fenv.decay',
        'flatten the decay lane at 1.2.',
        'Every strike stays tight and dry: a woodblock more than a marimba.'
      ),
      {
        id: 'lfo.rate',
        try: 'Nudge it a little either way',
        hear: 'The accents drift against the cells instead of walking in step.',
      },
      {
        id: 'aenv.decay',
        try: 'Raise to 4',
        hear: 'The strikes ring into a wash, like a vibraphone.',
      },
      { id: 'mix.osc2', try: 'Raise to 5', hear: 'A harder, xylophone-like knock.' },
    ],
    pattern: {
      key: key('contour-marimba-cells'),
      name: 'Contour Marimba Cells',
      role: 'arp',
      genre: 'American minimalism',
      bpm: 112,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'E3 B3 F#3 . | E3 B3 F#3 A3 | . B3 F#3 A3 | E3 . F#3 A3 | E3 B3 . A3 | E3 B3 F#3 . | E3 B3 F#3 A3 | . B3 F#3 A3',
          lanes: {
            '@wheel': onWheel(moves({ 0: 1, 24: 4.5, 31: 4 })),
            'fenv.decay': ramp(1.2, 2.2),
          },
        },
        {
          notes:
            'D3 A3 E3 . | D3 A3 E3 G3 | . A3 E3 G3 | D3 . E3 G3 | C#3 A3 . G3 | C#3 A3 E3 . | C#3 A3 E3 G3 | . A3 E3 G3',
          lanes: {
            '@wheel': onWheel(moves({ 0: 4, 8: 4.5, 31: 1 })),
            'fenv.decay': ramp(2.2, 1.2),
          },
        },
      ],
      notes:
        'One four-note cell, E–B–F♯–A, played with a different note left out each time, so the pattern’s gaps move. B shifts the cell down a step to D–A–E–G and then to C♯ under the same top notes: a slow harmonic change in the minimalist way. AABB. The LFO accents every third step, out of step with the four-note cell; the mod wheel lane phases that in through A and lets it fade through B, and the decay lane rounds the strike off through A and tightens it through B.',
    },
  },

  // ── 19 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-glitch-ratchet',
    name: 'Glitch Ratchet Line',
    ref: 'A stuttering glitch-electronica line of ratcheted notes, the stutters tightened and the tone scattered by lanes',
    artist: 'Glitch electronica',
    tags: ['seq', 'idm', '2000s'],
    level: 3,
    blurb: 'A stuttering, glitchy line that rolls and crackles through its notes.',
    how: 'Some steps of this line are ratcheted, hit two, three or four times inside one sixteenth. Two mod lanes play it. The loudness decay is tightened through part A, so the rolls get crisper, and let out again through part B, so they smear into buzzes. The cutoff is jerked to a new place every three steps, seven places that come round every twenty-one steps, never in step with the bar, which scatters the tone like a glitch.',
    steps: [
      {
        title: 'A hollow, bright tone',
        module: 'osc',
        why: 'A square for the body and a sawtooth an octave up for the crackle.',
        set: {
          'osc1.wave': 'sq',
          'mix.osc1': 7,
          'osc2.range': '4',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc2': 3,
        },
        listen: 'a buzzy, hollow tone.',
      },
      {
        title: 'A tight filter',
        module: 'filter',
        why: 'A ringing filter with a fast flick on every hit.',
        set: {
          'filter.cutoff': 0,
          'filter.emphasis': 4,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.2,
          'fenv.sustain': 0,
        },
        listen: 'a click on every note.',
      },
      {
        title: 'Nothing held',
        module: 'env',
        why: 'With no sustain the decay is the note length, short enough for a ratchet to be heard as separate hits.',
        set: { 'aenv.attack': 0, 'aenv.decay': 1.8, 'aenv.sustain': 0 },
        listen: 'short, dry notes.',
      },
    ],
    context: {
      'aenv.decay':
        'Played by a lane: tightened through A so the rolls crisp up, let out through B.',
      'filter.cutoff':
        'The other lane: jerked to a new place every three steps, seven places that never line up with the bar.',
      'filter.emphasis': 'More gives the scatter a ringing, zappy edge.',
      'mix.osc2': 'The crackle on top.',
    },
    tweaks: [
      laneTweak(
        'aenv.decay',
        'raise the decay lane to 2.5 everywhere.',
        'The rolls smear into buzzes.'
      ),
      laneTweak(
        'filter.cutoff',
        'move the cutoff every four steps instead of three.',
        'The scatter locks to the beat: more groove, less glitch.'
      ),
      { id: 'filter.emphasis', try: 'Push to 7', hear: 'Zappy, resonant glitches.' },
      { id: 'mix.osc2', try: 'Raise to 6', hear: 'A harsher, crackling line.' },
    ],
    pattern: {
      key: key('glitch-ratchet-line'),
      name: 'Glitch Ratchet Line',
      role: 'lead_line',
      genre: 'Glitch electronica',
      bpm: 100,
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'C3! . C3*3 . | Eb3 . . G2*2 | C3 . Bb2 . | C3*4 . G2 . | C3! . C3*3 . | Eb3 . F3*2 . | G3 . F3 Eb3*3 | . C3 G2*2 .',
          lanes: {
            'aenv.decay': ramp(2, 0.7),
            // A new place every three steps, alternately up and down, so the hand turns once a move.
            'filter.cutoff': (c) => [1.5, -1, 0.5, 2.5, -0.5, 1, -1.5][Math.floor(c.i / 3) % 7],
          },
        },
        {
          notes:
            'Ab2! . Ab2*3 . | C3 . . Eb2*2 | Ab2 . G2 . | Ab2*4 . Eb2 . | Bb2! . Bb2*3 . | D3 . Eb3*2 . | F3 . Eb3 D3*3 | . Bb2 G2*4 .',
          lanes: {
            'aenv.decay': ramp(0.7, 2),
            'filter.cutoff': (c) => [2, -0.5, 1, -1.5, 2.5, 0, -1][Math.floor(c.i / 3) % 7],
          },
        },
      ],
      notes:
        'C minor: C with a triple roll, E♭, a double roll on G below, a four-hit roll on C, then up through F to G and back down with a triple on E♭. B moves to A♭ and B♭ major with the same shapes and ends on a four-hit G. The decay lane tightens through A and lets out through B; the cutoff lane jerks to a new place every three steps, seven places round, across the bar.',
    },
  },

  // ── 20 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-theremin-glide',
    name: 'Theremin Glide Melody',
    ref: 'An eerie, swooping 1950s science-fiction melody with portamento ridden note by note and vibrato on the held notes',
    artist: '1950s science-fiction film',
    tags: ['lead', 'sci-fi', '50s'],
    level: 2,
    blurb: 'A spooky, wavering melody that swoops between its notes, wider on the big leaps.',
    how: 'A soft triangle with a slow attack is close to the pure, voice-like tone of a theremin, which has no keys and slides between every note. Here a mod lane rides GLIDE for every note: short for steps, long for the wide leaps, so the big intervals swoop. A second lane pushes the mod wheel up for a wide vibrato as each note holds.',
    steps: [
      {
        title: 'A pure, singing tone',
        module: 'osc',
        why: 'A triangle is nearly a sine, which is the tone of a theremin.',
        set: { 'osc1.wave': 'tri', 'mix.osc1': 8 },
        listen: 'a soft, hollow tone.',
      },
      {
        title: 'Open and soft',
        module: 'filter',
        why: 'An open, tracking filter and a slow attack, so notes swell in rather than strike.',
        set: {
          'filter.cutoff': 2,
          'filter.kbd1': true,
          'filter.kbd2': true,
          'filter.emphasis': 0,
          'filter.contour': 0,
          'aenv.attack': 2,
          'aenv.decay': 4,
          'aenv.sustain': 10,
        },
        listen: 'notes that fade in like a voice.',
      },
      {
        title: 'Vibrato and glide, ready',
        module: 'mod',
        why: 'A fast LFO to the pitch for a theremin’s wide vibrato, MOD DEPTH at 0 for the wheel to bring it in, and GLIDE up a little for the lane to ride.',
        set: {
          'mod.toOsc': true,
          'lfo.rate': lfoAt(6),
          'lfo.shape': 'tri',
          'mod.mix': 10,
          'mod.depth': 0,
          'ctl.glide': 2,
        },
        listen: 'notes that slide into each other.',
      },
    ],
    context: {
      'ctl.glide': 'Played by a lane, set on each note: longest for the wide leaps, so they swoop.',
      'mod.depth':
        'Stays at 0: the mod wheel lane brings in vibrato that widens as each note holds.',
      'aenv.attack': 'How slowly each note fades in.',
      'lfo.rate': 'The speed of the vibrato. A theremin player’s hand shakes fast.',
    },
    tweaks: [
      laneTweak(
        'ctl.glide',
        'set the glide lane to 6 on every note.',
        'Every note is a long swoop: more like a siren than a melody.'
      ),
      laneTweak(
        'mod.depth',
        'start the mod wheel lane high on every note.',
        'A nervous, shaky vibrato from the start.'
      ),
      { id: 'aenv.attack', try: 'Raise to 4', hear: 'A ghostly, slow-swelling melody.' },
      { id: 'lfo.rate', try: 'Turn down to 4.5', hear: 'A slow, seasick waver.' },
    ],
    pattern: {
      key: key('theremin-glide-melody'),
      name: 'Theremin Glide Melody',
      role: 'lead_line',
      genre: '1950s science-fiction film',
      bpm: 66,
      stepSize: '1/8',
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1],
      parts: [
        {
          notes:
            'G4:4 . . . | Ab4:2 . G4:2 . | D5:6 . . . | . . C5:2 . | B4:4 . . . | G4:2 . Eb4:2 . | F#4:6 . . . | . . G4:2 .',
          lanes: {
            'ctl.glide': holds({
              0: 2,
              4: 1.5,
              6: 2,
              8: 5,
              14: 2,
              16: 2,
              20: 3,
              22: 2.5,
              24: 3.5,
              30: 2,
            }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 1 ? Math.min(2.5, 0.6 * c.since) : 0
            ),
          },
        },
        {
          notes:
            'C5:4 . . . | Eb5:2 . D5:2 . | Ab4:6 . . . | . . G4:2 . | F4:4 . . . | Eb4:2 . D4:2 . | G4:8 . . . | . . . .',
          lanes: {
            'ctl.glide': holds({
              0: 4,
              4: 2.5,
              6: 1.5,
              8: 4.5,
              14: 1.5,
              16: 2.5,
              20: 2,
              22: 1.5,
              24: 5,
            }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 1 ? Math.min(2.8, 0.55 * c.since) : 0
            ),
          },
        },
      ],
      notes:
        'Eighth-note steps at 66. A in C minor: G, a semitone sigh to A♭ and back, a leap of a fifth to D, falling to C and B, down to E♭, then the tritone F♯ resolving to G. B answers from C: up to E♭, D, a drop of a tritone to A♭, then a slow descent F–E♭–D and a long G that swoops up from below. The glide lane is longest on the leaps; the mod wheel lane widens the vibrato as notes hold.',
    },
  },
  // ── 21 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-blues-bend',
    name: 'Bending Blues Lead',
    ref: 'A swung blues-rock synth lead whose held notes are bent up a tone or a semitone by a tuning lane, guitar-style',
    artist: 'Blues-rock',
    tags: ['lead', 'blues', '70s'],
    level: 3,
    blurb: 'A crying, swung lead that bends its long notes up like a guitar string.',
    how: 'Players bend Model D notes with the pitch wheel. Here a mod lane does it with the master TUNE knob, which moves every oscillator about two semitones either way: on chosen held notes it climbs over two or three steps, so the D bends up to E and the C up to C♯, the blues third. The other lane pushes the mod wheel up for vibrato on the held notes that are not bending, the way a guitarist shakes a note after landing it.',
    steps: [
      {
        title: 'A reedy lead',
        module: 'osc',
        why: 'A sawtooth and a square a hair apart: bright, a little nasal, closer to an overdriven guitar or a harmonica than a pure tone.',
        set: {
          'osc2.wave': 'sq',
          'osc2.freq': 0.1,
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 5,
          'ctl.glide': 0.8,
        },
        listen: 'a bright, buzzy lead.',
      },
      {
        title: 'A singing filter',
        module: 'filter',
        why: 'A fairly open filter that eases open on each note, and notes that hold.',
        set: {
          'filter.cutoff': 1,
          'filter.emphasis': 3,
          'filter.contour': 3,
          'fenv.attack': 0.2,
          'fenv.decay': 3,
          'fenv.sustain': 6,
          'aenv.attack': 0.3,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'a lead that sings on held notes.',
      },
      {
        title: 'Vibrato, ready',
        module: 'mod',
        why: 'The LFO to pitch at a guitarist’s shake, MOD DEPTH left at 0: the wheel brings it in.',
        set: { 'mod.toOsc': true, 'lfo.rate': lfoAt(5.5), 'mod.mix': 10, 'mod.depth': 0 },
        listen: 'a still note until the lane pushes the mod wheel up.',
      },
    ],
    context: {
      'ctl.tune': 'Played by a lane: the bends. 2 is a whole tone up, 1 a semitone.',
      'mod.depth':
        'Stays at 0: the mod wheel lane brings vibrato in on held notes that are not bending.',
      'ctl.glide': 'A little slur between notes.',
      'filter.emphasis': 'More makes the lead cry.',
    },
    tweaks: [
      laneTweak(
        'ctl.tune',
        'draw a bend down from 2 to 0 at the start of a long note.',
        'A pre-bend: the note starts high and is let down, a classic guitar move.'
      ),
      laneTweak(
        'mod.depth',
        'raise the mod wheel lane on the bent notes too.',
        'A shaking bend, more like a slide guitar.'
      ),
      { id: 'ctl.glide', try: 'Raise to 2.5', hear: 'A lazier, more slurred lead.' },
      { id: 'filter.emphasis', try: 'Push to 6', hear: 'A wailing, vocal lead.' },
    ],
    pattern: {
      key: key('bending-blues-lead'),
      name: 'Bending Blues Lead',
      role: 'lead_line',
      genre: 'Blues-rock',
      bpm: 84,
      swing: 64,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'A4:2 . C5 . | D5:4 . . . | C5 A4 . G4 | A4:4 . . . | E5:2 . D5 . | C5:2 . A4 . | C5:4 . . . | A4:4 . . .',
          lanes: {
            'ctl.tune': holds({ 0: 0, 5: 1, 6: 2, 8: 0, 24: 0, 25: 0.5, 26: 1, 28: 0 }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 && ![4, 24].includes(c.i - c.since)
                ? Math.min(1.8, 0.6 * (c.since - 1))
                : 0
            ),
          },
        },
        {
          notes:
            'E5:2 . G5 . | A5:4 . . . | G5 E5 . D5 | E5:4 . . . | D5:2 . C5 . | A4:2 . G4 . | A4:6 . . . | . . E4:2 .',
          lanes: {
            'ctl.tune': holds({ 0: 0, 12: 0, 13: 0.5, 14: 1, 15: 2, 16: 0 }),
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 2 && c.i - c.since !== 12
                ? Math.min(2, 0.6 * (c.since - 1))
                : 0
            ),
          },
        },
      ],
      notes:
        'Swung sixteenths at 84, A minor pentatonic with the blue notes. A: A–C, a D bent up a whole tone to E, back down C–A–G to a shaken A, then E–D–C–A and a C bent a semitone to C♯, the major third, before landing on A. B climbs higher: E–G–A, G–E–D, an E bent up to F♯, and down through D, C, A and G to a long A with vibrato and E as a pickup.',
    },
  },

  // ── 22 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-octave-leap',
    name: 'Octave-Leap Electro',
    ref: 'A robotic electro-funk riff that leaps between octaves every step, its two oscillators’ RANGE switches set against each other by lanes',
    artist: 'Electro-funk',
    tags: ['seq', 'electro', '80s'],
    level: 3,
    blurb:
      'A jumpy, robotic riff that leaps between octaves, its two oscillators landing in new combinations.',
    how: 'The riff leaps an octave down, back, an octave up and back on every four steps, so the same few notes jump across three octaves. The RANGE switches set each oscillator’s octave, and two mod lanes turn them, one hand each: Oscillator 2’s switch moves every half bar, so the two oscillators keep landing in new combinations, unison, an octave apart, two octaves apart; Oscillator 1’s moves only for a phrase, lifting the whole riff.',
    steps: [
      {
        title: 'Two oscillators, two tones',
        module: 'osc',
        why: 'A sawtooth and a narrow pulse, so you can hear which is where as the lanes move them.',
        set: {
          'osc1.wave': 'saw',
          'osc2.wave': 'narrow',
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
        },
        listen: 'a bright, buzzy tone.',
      },
      {
        title: 'A plucked, robotic filter',
        module: 'filter',
        why: 'Full keyboard tracking keeps every octave equally bright, and a quick pluck keeps the notes short and mechanical.',
        set: {
          'filter.cutoff': -0.5,
          'filter.kbd1': true,
          'filter.kbd2': true,
          'filter.emphasis': 3,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 1.6,
          'fenv.sustain': 1,
          'aenv.attack': 0,
          'aenv.decay': 2,
          'aenv.sustain': 5,
        },
        listen: 'a tight, clipped riff.',
      },
    ],
    context: {
      'osc1.range':
        'Played by a lane: Oscillator 1’s octave, lifted for the last phrase of A and held there through the first half of B.',
      'osc2.range':
        'The other lane, turned every half bar, so the two oscillators land in new combinations.',
      'osc2.wave':
        'The second oscillator’s tone. A sawtooth blends it in; the narrow pulse keeps it apart.',
      'filter.emphasis': 'A robotic ring on every note.',
    },
    tweaks: [
      laneTweak(
        'osc1.range',
        'set Oscillator 1’s lane to 8’ everywhere.',
        'The riff stays in one register: only the second oscillator moves against it.'
      ),
      laneTweak(
        'osc2.range',
        'make Oscillator 2’s lane copy Oscillator 1’s.',
        'The two move together: the octave leaps, but no combinations.'
      ),
      {
        id: 'osc2.wave',
        try: 'Switch Oscillator 2 to sawtooth',
        hear: 'A fuller, less robotic riff.',
      },
      { id: 'filter.emphasis', try: 'Push to 6', hear: 'A ringing, laser-like riff.' },
    ],
    pattern: {
      key: key('octave-leap-electro'),
      name: 'Octave-Leap Electro',
      role: 'arp',
      genre: 'Electro-funk',
      bpm: 116,
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'C2! . C4 C3 | . C3 . Eb3 | . Eb3 C4 . | C2 . G3 Bb2 | C2! . C4 C3 | . C3 . Eb3 | . F3 Eb4 . | C2 . Bb3 C3',
          lanes: {
            'osc1.range': holds({ 0: '8', 24: '4' }),
            'osc2.range': (c) => ['8', '4', '2', '4'][Math.floor(c.i / 8)],
          },
        },
        {
          notes:
            'Ab2! . Ab1 Ab3 | . Ab3 . C4 | . C4 Ab1 . | Bb2 . G1 Bb3 | G2! . G1 G3 | . G3 . B3 | . D4 B1 . | G2 . F1 G3',
          lanes: {
            'osc1.range': holds({ 0: '4', 16: '8' }),
            'osc2.range': (c) => ['4', '16', '8', '2'][Math.floor(c.i / 8)],
          },
        },
      ],
      notes:
        'A C minor riff that hardly moves: C repeated, E♭, a turn down to G and B♭. B is the same shape on A♭ and then G with its B natural. The octave leaps are written into the notes: down, back, up, back on every four steps (in B back, up, down, up). The RANGE lanes set the two oscillators against each other: Oscillator 2’s switch turns every half bar, Oscillator 1’s lifts the last phrase of A and holds it up through the first half of B, so they keep landing a different number of octaves apart.',
    },
  },

  // ── 23 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-noise-kit',
    name: 'One-Voice Drum Kit',
    ref: 'A breakbeat drum pattern played on one mono voice: kick, snare and hats made by the notes through a key-tracking filter',
    artist: 'Breakbeat',
    tags: ['perc', 'breakbeat', '90s'],
    level: 3,
    blurb: 'A whole drum kit, kick, snare and hats, from a single voice.',
    how: 'One voice can only make one sound at a time, but with both keyboard controls on, the filter follows the key, so each drum is just a note. The kick is a low note: the filter is nearly shut, so the noise is only a little grit on a deep thump. The snare is a middle note, the filter half open on body and noise. The hat is a high note with the filter wide open, almost all hiss. Two mod lanes ride the kit by hand: the noise climbs through the loop and most in the fill, and the cutoff opens the whole kit up into the fill.',
    steps: [
      {
        title: 'A triangle for the drum bodies',
        module: 'osc',
        why: 'A triangle is the pitched body of each drum: deep on the kick, a knock on the snare.',
        set: { 'osc1.wave': 'tri', 'mix.osc1': 8 },
        listen: 'a soft, pure tone.',
      },
      {
        title: 'Noise for the snare and hats',
        module: 'mixer',
        why: 'White noise in the mixer, half up. The filter decides how much of it each drum gets: hardly any on the low kick, nearly all on the high hats.',
        set: { 'mix.noiseOn': true, 'mix.noise': 4.5, 'noise.colour': 'white' },
        listen: 'a hiss with every note.',
      },
      {
        title: 'A thump on every hit, darker low down',
        module: 'filter',
        why: 'Both keyboard controls on make the filter follow the key, dark for low notes and open for high ones: that is what turns one voice into a kick, a snare and a hat. A big, fast filter envelope gives every hit its crack, and with nothing held the loudness dies away like a drum.',
        set: {
          'filter.cutoff': -2,
          'filter.kbd1': true,
          'filter.kbd2': true,
          'filter.emphasis': 1,
          'filter.contour': 6,
          'fenv.attack': 0,
          'fenv.decay': 1,
          'fenv.sustain': 0,
          'aenv.attack': 0,
          'aenv.decay': 1.4,
          'aenv.sustain': 0,
        },
        listen: 'a deep thump low on the keyboard, a hissing tick high up.',
      },
    ],
    context: {
      'mix.noise':
        'Played by a lane: the kit’s grit, climbing through the loop and most in the fill.',
      'filter.cutoff':
        'The other lane: the whole kit opening up into the fill. The keyboard tracking keeps the kick dark and the hats open on top of it.',
      'aenv.decay': 'The length of every hit. Longer for an open, roomy kit.',
      'filter.contour': 'The crack on each hit.',
    },
    tweaks: [
      laneTweak(
        'mix.noise',
        'raise the noise lane to 8 everywhere.',
        'A dirtier, trashier kit, like a sampled break.'
      ),
      laneTweak(
        'filter.cutoff',
        'lower the cutoff lane by 1 everywhere.',
        'A duller kit: shaker-like hats and a deeper kick.'
      ),
      { id: 'aenv.decay', try: 'Raise to 2.5', hear: 'A boomier, roomier kit.' },
      { id: 'noise.colour', try: 'Switch to pink', hear: 'Softer, darker snares and hats.' },
    ],
    pattern: {
      key: key('one-voice-drum-kit'),
      name: 'One-Voice Drum Kit',
      role: 'percussive',
      genre: 'Breakbeat',
      bpm: 96,
      swing: 54,
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 0, 1],
      parts: [
        {
          notes:
            'C2! . C5 . | G2 . C5 C2 | . C2 C5 . | G2 . C5 . | C2! . C5 C2 | G2 . C5 . | . C2 C5 . | G2 . C5 C5',
          lanes: {
            'mix.noise': ramp(4, 5.5),
            'filter.cutoff': ramp(-2.2, -1.6),
          },
        },
        {
          notes:
            'C2! . C5 C2 | G2 . C5 . | C2 . C5 C2 | G2 . G2 C5 | C2! C5 C5 C2 | G2 . C5 . | C2 . G2*2 . | G2*3 . G2*4 C5',
          lanes: {
            'mix.noise': ramp(5.5, 7),
            'filter.cutoff': ramp(-1.6, -0.6),
          },
        },
      ],
      notes:
        'A two-bar break at 96 with light swing: kick (C2) on one, a pushed kick before three and after the second backbeat, snare (G2) on two and four, hats (C5) on the offbeats. B is the fill: kicks doubled, an extra snare, and snare rolls of two, three and four hits into the turnaround. The drums are in the notes: the key-tracking filter makes each one, wherever it falls. The lanes ride the whole kit, the noise climbing a little through each A and more through the fill, the cutoff opening into the fill, and both pulled back for the next A.',
    },
  },

  // ── 24 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-bowed-cello',
    name: 'Bowed Cello Line',
    ref: 'A singing baroque-style bass line with soft bow changes on the long notes and crisp ones on the quick, played by an attack lane',
    artist: 'Baroque string writing',
    tags: ['strings', 'baroque', 'classical'],
    level: 2,
    blurb: 'A warm, singing cello line whose long notes are bowed slowly and short ones crisply.',
    how: 'Two sawtooths a hair apart, through a soft filter, make a bowed-string tone. A real cellist bows a long note slowly and a quick one with a short, firm stroke. One mod lane does that with LOUDNESS ATTACK: it sets each note’s attack by its length, slow for the long notes and quick for the short ones. The other pushes the mod wheel up for vibrato only once a note is held, as a string player does.',
    steps: [
      {
        title: 'A bowed tone',
        module: 'osc',
        why: 'Two sawtooths slightly apart: a sawtooth is close to the shape a bowed string vibrates in, and the second gives it the width of a real instrument.',
        set: {
          'osc2.wave': 'saw',
          'osc2.freq': 0.07,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 5,
        },
        listen: 'a rich, slowly beating tone.',
      },
      {
        title: 'Soften the top',
        module: 'filter',
        why: 'A lower cutoff that tracks the notes takes the buzz off, and a slow little filter rise is the bow catching the string.',
        set: {
          'filter.cutoff': 0.5,
          'filter.kbd1': true,
          'filter.emphasis': 1,
          'filter.contour': 2,
          'fenv.attack': 1.5,
          'fenv.decay': 3,
          'fenv.sustain': 6,
          'aenv.attack': 1.5,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'a warm, string-like tone that leans in.',
      },
      {
        title: 'Vibrato, ready',
        module: 'mod',
        why: 'The LFO to pitch at a string player’s vibrato rate, MOD DEPTH at 0: the wheel brings it in.',
        set: { 'mod.toOsc': true, 'lfo.rate': lfoAt(5.2), 'mod.mix': 10, 'mod.depth': 0 },
        listen: 'a still note.',
      },
    ],
    context: {
      'aenv.attack':
        'Played by a lane, one value a note: slow for the long notes, quick for the short ones.',
      'mod.depth': 'Stays at 0: the mod wheel lane brings in vibrato that grows as a note holds.',
      'osc2.freq': 'The width of the tone. Less is a single cello; more is a section.',
      'filter.cutoff': 'Brighter is nearer the bridge; darker is softer, nearer the fingerboard.',
    },
    tweaks: [
      laneTweak(
        'aenv.attack',
        'set the attack lane to 0.3 on every note.',
        'Every note is a firm stroke: a plucked, harpsichord-like line.'
      ),
      laneTweak(
        'mod.depth',
        'start the mod wheel lane on every note’s first step.',
        'A more romantic, intense vibrato.'
      ),
      { id: 'osc2.freq', try: 'Raise to 0.25', hear: 'A wider, ensemble sound.' },
      {
        id: 'osc1.range',
        try: "Set both RANGE knobs to 16'",
        hear: 'A double bass an octave down.',
      },
    ],
    pattern: {
      key: key('bowed-cello-line'),
      name: 'Bowed Cello Line',
      role: 'bass_line',
      genre: 'Baroque string writing',
      bpm: 72,
      stepSize: '1/8',
      root: 0,
      scale: 'major',
      len: 32,
      chain: [0, 1],
      parts: [
        {
          notes:
            'C3:2 . G2 . | E3:2 . D3 . | C3 B2 C3 D3 | E3:4 . . . | F3:2 . D3 . | B2:2 . G2 . | A2 B2 C3 D3 | G2:4 . . .',
          lanes: {
            'aenv.attack': (c) =>
              c.since !== 0 ? null : c.gate >= 4 ? 2.6 : c.gate >= 2 ? 1.6 : 0.6,
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 1 ? Math.min(1.5, 0.5 * c.since) : 0
            ),
          },
        },
        {
          notes:
            'A2:2 . E3 . | C3:2 . A2 . | F2 G2 A2 B2 | C3:4 . . . | D3:2 . B2 . | G2:2 . E3 . | D3 C3 B2 A2 | G2:2 . C3:2 .',
          lanes: {
            'aenv.attack': (c) =>
              c.since !== 0 ? null : c.gate >= 4 ? 2.6 : c.gate >= 2 ? 1.6 : 0.6,
            '@wheel': onWheel((c) =>
              c.sounding !== null && c.since >= 1 ? Math.min(1.6, 0.5 * c.since) : 0
            ),
          },
        },
      ],
      notes:
        'Eighth notes at 72, four bars a part. A in C major: leaps outlining C, a turn round C to a held E, then F–D–B–G and a scale up from A to a held G, a half cadence. B: A minor with its fifth, a scale from F to a held C, then G major and a descent D–C–B–A back to C. The attack lane gives each note a bow stroke by its length; the mod wheel lane adds vibrato from the second step.',
    },
  },

  // ── 25 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-shifting-drone',
    name: 'Shifting Drone',
    ref: 'A slow ambient drone whose second oscillator moves through intervals, beating, a fourth, a fifth, a minor third, by lane',
    artist: 'Ambient drone',
    tags: ['drone', 'ambient', '2000s'],
    level: 2,
    blurb: 'A slow, breathing drone whose harmony keeps shifting under a held note.',
    how: 'Three oscillators make a big, slow drone on two held notes a part. The harmony moves in a mod lane on Oscillator 2: a hair out of tune so it beats, then a fourth above, then a fifth, then a minor third, two bars each. So one held note becomes a slow sequence of chords. A second lane opens and closes the filter once a part.',
    steps: [
      {
        title: 'Three oscillators',
        module: 'osc',
        why: 'Two sawtooths and a triangle an octave down. Oscillator 2 is the one the lane retunes.',
        set: {
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'osc3.range': '16',
          'osc3.wave': 'tri',
          'mix.osc3On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
          'mix.osc3': 4,
        },
        listen: 'a full, deep tone.',
      },
      {
        title: 'A soft filter',
        module: 'filter',
        why: 'A lower cutoff with a little emphasis, nothing from the envelope: the lane moves it.',
        set: { 'filter.cutoff': -0.5, 'filter.emphasis': 3, 'filter.contour': 0 },
        listen: 'a warm, slightly ringing tone.',
      },
      {
        title: 'Slow in, slow out',
        module: 'env',
        why: 'About a second to fade in and a long release, so each held note swells and lingers.',
        set: { 'aenv.attack': 6, 'aenv.decay': 6, 'aenv.sustain': 10 },
        listen: 'notes that swell in slowly.',
      },
    ],
    context: {
      'osc2.freq':
        'Played by a lane: the interval above the held note, two bars at a time. 0.15 beats, 5 is a fourth, 7 a fifth, 3 a minor third.',
      'filter.cutoff': 'The other lane: one slow swell a part.',
      'aenv.attack': 'How slowly each note swells in.',
      'mix.osc3': 'The deep floor under the drone.',
    },
    tweaks: [
      laneTweak(
        'osc2.freq',
        'draw a slow ramp from 0 to 7 across part A.',
        'The interval glides open instead of stepping: an eerie, rising drone.'
      ),
      laneTweak(
        'filter.cutoff',
        'raise the cutoff lane by 2 everywhere.',
        'A brighter, buzzier drone.'
      ),
      { id: 'filter.emphasis', try: 'Push to 6', hear: 'A singing, whistling drone.' },
      { id: 'mix.osc3', try: 'Raise to 8', hear: 'A heavier, darker floor.' },
    ],
    pattern: {
      key: key('shifting-drone'),
      name: 'Shifting Drone',
      role: 'ambient',
      genre: 'Ambient drone',
      bpm: 60,
      stepSize: '1/8',
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1],
      parts: [
        {
          notes:
            'D2:16 . . . | . . . . | . . . . | . . . . | A1:16 . . . | . . . . | . . . . | . . . .',
          lanes: {
            'osc2.freq': (c) => [0.15, 0.15, 5, 5, 7, 7, 3, 3][Math.floor(c.i / 4)],
            'filter.cutoff': wave(-1.5, 1, 32),
          },
        },
        {
          notes:
            'G1:16 . . . | . . . . | . . . . | . . . . | Bb1:16 . . . | . . . . | . . . . | . . . .',
          lanes: {
            'osc2.freq': (c) => [7, 7, 4, 4, 0.12, 0.12, 5, 5][Math.floor(c.i / 4)],
            'filter.cutoff': wave(-1.2, 1.4, 32),
          },
        },
      ],
      notes:
        'Eighth-note steps at 60, so a part is 32 seconds. A holds D, then A below it; B holds G, then B♭. The frequency lane moves Oscillator 2 every two bars: beating, a fourth, a fifth, a minor third under D and A; a fifth, a major third, beating and a fourth under G and B♭. So the held notes become D, Dsus4, A5 and A minor, then G5, G major and B♭ sus4. The cutoff swells once a part.',
    },
  },

  // ── 26 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-boom-bap',
    name: 'Boom-Bap Moog Bass',
    ref: 'A swung, laid-back 90s hip-hop bass with full roots on the beat, muffled ghost notes between, and the odd slide',
    artist: '90s boom-bap hip-hop',
    tags: ['bass', 'hip-hop', '90s'],
    level: 2,
    blurb: 'A warm, laid-back hip-hop bass with dark ghost notes and the odd slide.',
    how: 'A triangle and a quiet sawtooth an octave down make a round, warm bass. One mod lane plays the cutoff like a bassist’s right hand: open on the notes that fall on the beat, nearly closed on the ghost notes between, so those sound muted. The other raises GLIDE only on the notes a slide lands on.',
    steps: [
      {
        title: 'A warm, round bass',
        module: 'osc',
        why: 'A triangle for warmth and a little sawtooth for definition, both an octave down.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'tri',
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 3,
        },
        listen: 'a soft, deep bass.',
      },
      {
        title: 'A soft pluck',
        module: 'filter',
        why: 'A gentle filter envelope and a long-ish loudness decay: a played bass rather than a synth stab.',
        set: {
          'filter.cutoff': -1,
          'filter.emphasis': 1.5,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2.4,
          'fenv.sustain': 3,
          'aenv.attack': 0,
          'aenv.decay': 3,
          'aenv.sustain': 8,
        },
        listen: 'a round bass with a soft front.',
      },
    ],
    context: {
      'filter.cutoff':
        'Played by a lane: open on the beat, nearly closed on the ghost notes between.',
      'ctl.glide': 'The other lane: up only on the notes a slide lands on.',
      'mix.osc2': 'The bit of edge that lets the bass speak on small speakers.',
      'aenv.decay': 'How long each note rings.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'raise the cutoff on the ghost notes to match the beat notes.',
        'Every note is full: busier and less laid-back.'
      ),
      laneTweak(
        'ctl.glide',
        'add glide to the last note of each bar.',
        'Each bar slurs into the next.'
      ),
      { id: 'mix.osc2', try: 'Turn to 0', hear: 'A pure, deep, almost sub bass.' },
      { id: 'fenv.decay', try: 'Lower to 1.5', hear: 'A tighter, punchier pluck.' },
    ],
    pattern: {
      key: key('boom-bap-moog-bass'),
      name: 'Boom-Bap Moog Bass',
      role: 'bass_line',
      genre: '90s boom-bap hip-hop',
      bpm: 90,
      swing: 60,
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'D3:3 . . . | . . . D3 | F3:2 . . A2 | . . C3 . | D3:3 . . . | . . F3 . | G3:2 . F3^ D3 | . . C3:2 .',
          lanes: {
            // Open for as long as a note that started on a beat sounds, nearly shut otherwise: a turn up and back per beat note.
            'filter.cutoff': (c) => (c.sounding !== null && (c.i - c.since) % 4 === 0 ? 0.5 : -1.8),
            'ctl.glide': (c) => (c.slidIn ? 2.5 : 0),
          },
        },
        {
          notes:
            'Bb2:3 . . . | . . . Bb2 | D3:2 . . F2 | . . A2 . | G2:3 . . . | . . Bb2 . | A2:2 . C3^ D3 | . . A2:2 .',
          lanes: {
            'filter.cutoff': (c) => (c.sounding !== null && (c.i - c.since) % 4 === 0 ? 0.6 : -1.8),
            'ctl.glide': (c) => (c.slidIn ? 3 : 0),
          },
        },
      ],
      notes:
        'Swung at 90: a held D on one, a ghost D before two, F on two answered by low A, C as a pickup; then D, F, G and a slide down from F to D, and C into the next bar. B: B♭ with the same shape, D, F and A, G, then A and a slide up from C to D, landing on A. The cutoff lane is open only on notes that land on a beat.',
    },
  },

  // ── 27 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-electro-zap',
    name: 'Electro Zap Bass',
    ref: 'An early-80s electro bass that fires a laser-like zap on the first note of each phrase and stays round on the rest',
    artist: 'Early 80s electro',
    tags: ['bass', 'electro', '80s'],
    level: 2,
    blurb: 'A bouncing electro bass that zaps like a laser at the top of each phrase.',
    how: 'A sawtooth and a square an octave down go into a resonant filter. Two mod lanes, a hand each, make the first note of each phrase zap: the contour amount is jabbed up and the filter decay down, so the resonant filter flicks down from high in a fraction of a second, the “pew” of an electro bass. Then both go back to a gentle, round setting for the rest. Keyboard control brightens the octave jumps a little on their own.',
    steps: [
      {
        title: 'A punchy bass',
        module: 'osc',
        why: 'A sawtooth and a square at 16’, the square a little flat for movement.',
        set: {
          'osc1.range': '16',
          'osc2.range': '16',
          'osc2.wave': 'sq',
          'osc2.freq': -0.08,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
        },
        listen: 'a fat, buzzy bass.',
      },
      {
        title: 'A resonant, closed filter',
        module: 'filter',
        why: 'High emphasis is what makes a fast filter sweep sound like a laser. The cutoff sits low, keyboard control 1 opens it a little for the high notes, and the lanes set how far and how fast the zaps sweep.',
        set: {
          'filter.cutoff': -2,
          'filter.kbd1': true,
          'filter.emphasis': 6,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2.2,
          'fenv.sustain': 0,
          'aenv.attack': 0,
          'aenv.decay': 2.2,
          'aenv.sustain': 7,
        },
        listen: 'a round, ringing bass.',
      },
    ],
    context: {
      'filter.contour':
        'Played by a lane: jabbed up on each phrase’s first note, the zap, gentle on the rest.',
      'fenv.decay': 'The other lane: jabbed short on the zaps, so the sweep is a flick.',
      'filter.emphasis': 'The laser’s ring. Less is a softer zap.',
      'osc2.freq': 'The square’s detune.',
    },
    tweaks: [
      laneTweak(
        'fenv.decay',
        'lengthen the decay lane on the zaps to 2.',
        'The zaps turn into slower, wah-like sweeps.'
      ),
      laneTweak(
        'filter.contour',
        'put the zap value on every step.',
        'A laser on every note: hectic and video-game-like.'
      ),
      { id: 'filter.emphasis', try: 'Push to 8', hear: 'Sharper, whistling zaps.' },
      {
        id: 'osc2.freq',
        try: 'Set to 7',
        hear: 'The bass plays in fifths: heavier, more menacing.',
      },
    ],
    pattern: {
      key: key('electro-zap-bass'),
      name: 'Electro Zap Bass',
      role: 'bass_line',
      genre: 'Early 80s electro',
      bpm: 120,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'A2! . . A2 | . . A3 . | . A2 . . | G2 . C3 . | A2! . . A2 | . . A3 . | . E3 . D3 | . C3 G2 .',
          lanes: {
            'filter.contour': (c) => (c.accent ? 7 : 3),
            'fenv.decay': (c) => (c.accent ? 0.9 : 2.2),
          },
        },
        {
          notes:
            'F2! . . F2 | . . F3 . | . F2 . . | E2 . G2 . | D2! . . D2 | . . D3 . | . A2 . C3 | . D3 E3 .',
          lanes: {
            'filter.contour': (c) => (c.accent ? 7 : 3),
            'fenv.decay': (c) => (c.accent ? 0.9 : 2.2),
          },
        },
      ],
      notes:
        'A minor at 120: A on one, a pushed A, the octave on the and of two, G and C; then E, D, C and G. B moves to F and D minor with their octaves, ending on E to turn back to A. Both lanes jab on the accent that starts each phrase, so that note zaps; the rest stay round, with the octave jumps a little brighter from the keyboard control.',
    },
  },

  // ── 28 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-night-drive',
    name: 'Night Drive Lead',
    ref: 'A wide, cinematic synthwave lead whose held notes swell brighter and then start to shimmer with late vibrato',
    artist: 'Synthwave',
    tags: ['lead', 'synthwave', '2010s'],
    level: 2,
    blurb: 'A wide, nostalgic lead whose long notes bloom open and shimmer.',
    how: 'Two sawtooths a little apart make a wide, warm lead with a touch of glide. A slow filter envelope opens every note as it rings, so each one blooms brighter. The hands do the rest: one mod lane brightens the whole lead through part A and draws it back through part B, and the other swells vibrato in late on the long notes with the mod wheel, which gives them a shimmer at their ends.',
    steps: [
      {
        title: 'A wide lead',
        module: 'osc',
        why: 'Two sawtooths, Oscillator 2 a fraction sharp, and a little glide between notes.',
        set: {
          'osc2.wave': 'saw',
          'osc2.freq': 0.1,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 6,
          'ctl.glide': 1.5,
        },
        listen: 'a wide, gliding lead.',
      },
      {
        title: 'A soft, swelling start',
        module: 'filter',
        why: 'A slow filter attack with the sustain right up, so the filter keeps opening as a note holds: the bloom. The loudness eases in a little too.',
        set: {
          'filter.cutoff': -0.5,
          'filter.emphasis': 2,
          'filter.contour': 3,
          'fenv.attack': 4,
          'fenv.decay': 3,
          'fenv.sustain': 10,
          'aenv.attack': 0.4,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'a held note that eases in and keeps getting brighter.',
      },
      {
        title: 'Vibrato, ready',
        module: 'mod',
        why: 'The LFO to pitch, MOD DEPTH at 0: the wheel brings it in, late in the long notes.',
        set: { 'mod.toOsc': true, 'lfo.rate': lfoAt(5.5), 'mod.mix': 10, 'mod.depth': 0 },
        listen: 'a still note.',
      },
    ],
    context: {
      'filter.cutoff': 'Played by a lane: the lead brightening through A and drawn back through B.',
      'mod.depth': 'Stays at 0: the mod wheel lane swells vibrato in late on the long notes.',
      'fenv.attack': 'How slowly each note blooms. Shorter opens it at once.',
      'ctl.glide': 'The slur between notes.',
      'osc2.freq': 'The width.',
    },
    tweaks: [
      laneTweak(
        'filter.cutoff',
        'draw the cutoff lane closing through A instead.',
        'The verse fades darker: moodier, more distant.'
      ),
      laneTweak(
        'mod.depth',
        'start each of the mod wheel lane’s swells two steps earlier.',
        'An earlier, more emotional vibrato.'
      ),
      { id: 'ctl.glide', try: 'Raise to 3', hear: 'A dreamy, sliding lead.' },
      { id: 'osc2.freq', try: 'Raise to 0.25', hear: 'A wider, more detuned lead.' },
      { id: 'fenv.attack', try: 'Lower to 1', hear: 'Notes open at once: punchier, less dreamy.' },
    ],
    pattern: {
      key: key('night-drive-lead'),
      name: 'Night Drive Lead',
      role: 'lead_line',
      genre: 'Synthwave',
      bpm: 100,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'B4:4 . . . | A4:2 . G4 . | F#4:3 . . E4 | F#4:6 . . . | . . G4 . | A4:2 . B4 . | D5:4 . . . | B4:4 . . .',
          lanes: {
            'filter.cutoff': ramp(-0.8, 1.2),
            // Swelling in late on the long notes: B, F♯, then one swell across D and B.
            '@wheel': onWheel(
              moves({ 0: 0, 2: 0, 3: 1, 5: 0, 14: 0, 17: 1.6, 19: 0, 25: 0, 31: 1.6 })
            ),
          },
        },
        {
          notes:
            'E5:4 . . . | D5:2 . B4 . | C5:3 . . B4 | A4:6 . . . | . . G4 . | F#4:2 . G4 . | A4:4 . . . | F#4:4 . . .',
          lanes: {
            'filter.cutoff': ramp(1.2, -0.8),
            '@wheel': onWheel(
              moves({ 0: 0, 2: 0, 3: 1, 5: 0, 14: 0, 17: 1.8, 19: 0, 25: 0, 31: 1.8 })
            ),
          },
        },
      ],
      notes:
        'E minor at 100. A: a held B falling A–G–F♯–E to a long F♯, then rising G–A–B to a high D and back to B. B starts higher on E, falls D–B–C–B to a long A, then G–F♯–G–A and ends on F♯, the second, so it hangs. The filter envelope blooms each note open; the cutoff lane brightens the lead through A and draws it back through B, and the mod wheel lane swells vibrato in late on the long notes.',
    },
  },

  // ── 29 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-arcade-trill',
    name: 'Arcade Trill Lead',
    ref: 'A bright, narrow-pulse video-game melody whose held notes break into a fast square-wave warble, switched on by a lane',
    artist: 'Chiptune',
    tags: ['lead', 'chiptune', '80s'],
    level: 2,
    blurb: 'A cheerful, bleepy game melody that warbles on its long notes.',
    how: 'A narrow pulse is the thin, bright tone of an old game console. A square-wave LFO on the pitch flips each note back and forth by about a tone, many times a second: the warble that game music uses in place of vibrato. One mod lane turns it on for the long notes that end each phrase, a push of the mod wheel up and back; the other sets its speed, faster in part B.',
    steps: [
      {
        title: 'A narrow pulse',
        module: 'osc',
        why: 'A thin pulse is the classic sound of a game console’s tone channel.',
        set: { 'osc1.wave': 'narrow', 'mix.osc1': 8 },
        listen: 'a bright, thin, bleepy tone.',
      },
      {
        title: 'Open and clean',
        module: 'filter',
        why: 'An open filter and simple, organ-like envelopes: nothing softens the tone.',
        set: {
          'filter.cutoff': 3,
          'filter.emphasis': 0,
          'filter.contour': 0,
          'aenv.attack': 0,
          'aenv.decay': 2,
          'aenv.sustain': 8,
        },
        listen: 'a plain, bright beep.',
      },
      {
        title: 'A square-wave warble',
        module: 'mod',
        why: 'A square LFO jumps between two values instead of sweeping, so on the pitch it is a warble rather than a vibrato. MOD DEPTH stays at 0: the wheel brings it in.',
        set: {
          'mod.toOsc': true,
          'lfo.shape': 'sq',
          'lfo.rate': lfoAt(12),
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'push the mod wheel up: the note flips back and forth.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane brings the warble in, on the long note ending each phrase. How far it is pushed is the interval.',
      'lfo.rate': 'The other lane: the warble’s speed, faster in part B.',
      'osc1.wave': 'The tone channel’s pulse. Square is rounder; narrow is the classic bleep.',
      'aenv.decay': 'Shorter makes the notes blip.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'raise the mod wheel lane to 12% on the long notes.',
        'A wider warble that sounds like a two-note arpeggio.'
      ),
      laneTweak(
        'lfo.rate',
        'set the rate lane to 6 in part B.',
        'A slower, wobblier warble in the second half.'
      ),
      { id: 'osc1.wave', try: 'Switch to square', hear: 'A rounder, softer chip tone.' },
      {
        id: 'aenv.sustain',
        try: 'Lower to 3',
        hear: 'Notes that fade, like a plucked game sound.',
      },
    ],
    pattern: {
      key: key('arcade-trill-lead'),
      name: 'Arcade Trill Lead',
      role: 'lead_line',
      genre: 'Chiptune',
      bpm: 150,
      root: 0,
      scale: 'major',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'C5 . E5 . | G5:2 . E5 . | C5 . D5 . | E5:4 . . . | F5 . E5 . | D5:2 . B4 . | C5:2 . D5 . | E5:4 . . .',
          lanes: {
            // From the second step of each phrase's four-step note.
            '@wheel': onWheel((c) => ([13, 14, 15, 29, 30, 31].includes(c.i) ? 2.7 : 0)),
            'lfo.rate': (c) => lfoAt(c.i < 16 ? 12 : 14),
          },
        },
        {
          notes:
            'A4 . C5 . | F5:2 . E5 . | D5 . C5 . | B4:4 . . . | C5 . E5 . | G5:2 . A5 . | G5:2 . D5 . | C5:4 . . .',
          lanes: {
            '@wheel': onWheel((c) => ([13, 14, 15, 29, 30, 31].includes(c.i) ? 2.7 : 0)),
            'lfo.rate': (c) => lfoAt(c.i < 16 ? 16 : 18),
          },
        },
      ],
      notes:
        'A bright C major tune at 150. A: an arpeggio up to G, down to a held E, then F–E–D–B and C–D to a held E. B: A–C to F and E, a scale down to a held B, then up C–E–G–A and back through G and D to C. The mod wheel lane turns the warble on from the second step of each phrase’s long note; the rate lane speeds it up through each part, fastest in B.',
    },
  },

  // ── 30 ─────────────────────────────────────────────────────────────────────
  {
    id: 'lane-fusion-unison',
    name: 'Fusion Unison Line',
    ref: 'A fast, twisting jazz-fusion synth line in D dorian whose long notes spread wider as Oscillator 2 detunes, its bite rising with each phrase',
    artist: 'Jazz fusion',
    tags: ['lead', 'fusion', '70s'],
    level: 3,
    blurb: 'A fast, twisting fusion line whose long notes open out into a wide chorus.',
    how: 'Two sawtooths and a quiet square an octave down make a bright, cutting lead for fast lines. One mod lane detunes Oscillator 2 inside each held note: in tune at the start, then spreading wider step by step, so fast runs stay tight and long notes open out like a chorus. The other hand rides EMPHASIS, rising through each phrase and easing off for the next, so the run bites harder as it climbs.',
    steps: [
      {
        title: 'A cutting lead',
        module: 'osc',
        why: 'Two sawtooths for the line and a quiet square an octave down for weight.',
        set: {
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'osc3.range': '16',
          'osc3.wave': 'sq',
          'mix.osc3On': true,
          'mix.osc1': 7,
          'mix.osc2': 7,
          'mix.osc3': 3,
          'ctl.glide': 0.6,
        },
        listen: 'a bright, full lead.',
      },
      {
        title: 'Bright and tracking',
        module: 'filter',
        why: 'An open filter that tracks the line, so fast high runs stay as bright as the low ones.',
        set: {
          'filter.cutoff': 1.5,
          'filter.kbd1': true,
          'filter.emphasis': 3,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 5,
          'aenv.attack': 0,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'every note of a fast run speaking clearly.',
      },
    ],
    context: {
      'osc2.freq': 'Played by a lane: in tune as each note starts, spreading wider as it holds.',
      'filter.emphasis':
        'The other lane: the bite, rising through each phrase and easing off for the next.',
      'mix.osc3': 'The weight under the line.',
      'ctl.glide': 'A touch of slur on fast runs.',
    },
    tweaks: [
      laneTweak(
        'osc2.freq',
        'set the frequency lane to 0.3 everywhere.',
        'A permanently wide, chorused line: lusher but less articulate.'
      ),
      laneTweak(
        'filter.emphasis',
        'raise the top of the emphasis lane to 7.',
        'A sharper, wah-like peak to every phrase.'
      ),
      { id: 'ctl.glide', try: 'Raise to 1.5', hear: 'A slippery, legato run.' },
      { id: 'mix.osc3', try: 'Raise to 6', hear: 'A heavier, darker line.' },
    ],
    pattern: {
      key: key('fusion-unison-line'),
      name: 'Fusion Unison Line',
      role: 'lead_line',
      genre: 'Jazz fusion',
      bpm: 120,
      root: 2,
      scale: 'dorian',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'D4 E4 F4 A4 | C5 A4 G4 F4 | E4 G4 Bb4 D5 | C5:2 . A4 . | D5 C5 A4 G4 | F4 E4 D4 C4 | D4 F4 A4 C5 | E5:4 . . .',
          lanes: {
            'osc2.freq': (c) =>
              c.sounding === null || c.since === 0 ? 0.05 : Math.min(0.35, 0.05 + 0.1 * c.since),
            'filter.emphasis': wave(3, 5.5, 16),
          },
        },
        {
          notes:
            'G4 A4 Bb4 D5 | F5 D5 C5 Bb4 | A4 C5 E5 G5 | F5:2 . D5 . | E5 D5 C5 Bb4 | A4 G4 F4 E4 | F4 A4 C5 E5 | D5:4 . . .',
          lanes: {
            'osc2.freq': (c) =>
              c.sounding === null || c.since === 0 ? 0.05 : Math.min(0.35, 0.05 + 0.1 * c.since),
            'filter.emphasis': wave(3, 6, 16),
          },
        },
      ],
      notes:
        'Unbroken sixteenths at 120 in D dorian. A runs up a D minor ninth shape, down through G and F, up an E half-diminished shape to a held C, a scale down from D to C, and up to a held high E. B starts on G minor, outlines F major and A minor, holds F, runs down E to E and up F–A–C–E to D. The frequency lane spreads Oscillator 2 only on held notes; the emphasis lane rises and falls with each bar, a little higher in B.',
    },
  },
];
