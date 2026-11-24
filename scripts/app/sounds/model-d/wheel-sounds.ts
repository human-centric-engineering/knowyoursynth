/**
 * The Model D's sounds played on the mod wheel (`f-performance-wheels` t-312): ten lane sounds, each a different
 * musical use of the wheel, written as the lane sounds are (`lane-sounds.ts`) and to the library by
 * `write-lane-sounds.ts`. Each has a mod wheel lane (`@wheel`); some add one knob for the other hand. One hand on the
 * wheel is advised, not enforced: a player may ride the wheel and a knob (owner ruling, t-312). The notes are a line
 * one hand could play.
 *
 * The Model D adds the wheel to the depth MOD DEPTH gives, (d / 10)², and sends it where the panel's MOD MIX and
 * modulation switches send MOD DEPTH. So every lesson here leaves MOD DEPTH at 0, says the wheel brings it in, and
 * sets up the switches and sources the wheel's modulation will go through. A wheel position is the share of its
 * travel: at 1, the wheel adds what MOD DEPTH 10 gives.
 *
 * Credits follow the library's rule: no sound here is a person's, so `artist` names the genre or tradition.
 */
import type { LaneSoundSpec } from '@/scripts/app/sounds/lane-kit';
import { holds, laneTweak, moves, ramp } from '@/scripts/app/sounds/lane-kit';
import { lfoAt, lfoSync } from '@/scripts/app/sounds/model-d/lane-sounds';

const key = (slug: string) => `researched:model-d-wheel/${slug}`;

export const WHEEL_SOUNDS: LaneSoundSpec[] = [
  // ── 1 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-delayed-vibrato',
    name: 'Delayed Vibrato Lead',
    ref: 'A warm, singing 70s lead whose vibrato comes in on the mod wheel only once each long note has settled',
    artist: '70s progressive rock',
    tags: ['lead', 'prog', '70s'],
    level: 1,
    blurb: 'A warm, wide lead that sings: each long note starts still, then blooms into vibrato.',
    how: 'Two sawtooths a hair apart make a warm, wide lead. The LFO is on the oscillators at a singer’s vibrato speed, but MOD DEPTH is left at 0: the vibrato is on the mod wheel, and the lane pushes the wheel up only once a long note has settled, then takes it back down before the next. That delay is what makes a synth lead sing. Open the sequencer: the mod wheel lane is under the steps, and the wheel beside the keys moves with it.',
    steps: [
      {
        title: 'Two sawtooths, a hair apart',
        module: 'osc',
        why: 'Two sawtooths at the same pitch, the second tuned a hair sharp, beat slowly against each other: the lead is wide and never quite still. A little glide joins the notes.',
        set: {
          'osc1.wave': 'saw',
          'osc2.wave': 'saw',
          'osc2.freq': 0.12,
          'mix.osc1': 7,
          'mix.osc2On': true,
          'mix.osc2': 6,
          'ctl.glide': 1,
        },
        listen: 'a bright, wide tone with a slow shimmer.',
      },
      {
        title: 'A filter that blooms',
        module: 'filter',
        why: 'The filter is half open, and its envelope opens it a little more as each note starts and settles back to a held brightness.',
        set: {
          'filter.cutoff': 1,
          'filter.emphasis': 3,
          'filter.contour': 4,
          'fenv.attack': 1,
          'fenv.decay': 4,
          'fenv.sustain': 5,
          'aenv.attack': 0.3,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'each note opens a touch as it starts, then holds.',
      },
      {
        title: 'Vibrato on the wheel',
        module: 'mod',
        why: 'The LFO goes to the oscillators at a singer’s vibrato speed. MOD DEPTH stays at 0: the wheel brings it in, so the player decides on each note how much, and when.',
        set: {
          'mod.toOsc': true,
          'lfo.rate': lfoAt(5.5),
          'lfo.shape': 'tri',
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen:
          'a still lead: push the mod wheel up a little on a held note and it starts to sing.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane brings vibrato in two steps into each long note and takes it out before the next.',
      'lfo.rate':
        'The vibrato’s speed. A singer’s is about 5.5 Hz; slower is lazy, faster nervous.',
      'osc2.freq': 'Oscillator 2 a hair sharp, so the lead is wide and moves.',
      'filter.contour': 'How much each note brightens as it starts.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'redraw the mod wheel lane up from the first step of each long note.',
        'Vibrato from the attack: more an organ’s than a singer’s.'
      ),
      { id: 'lfo.rate', try: 'Turn down to 5', hear: 'A slower, lazier vibrato.' },
      { id: 'osc2.freq', try: 'Set to 0', hear: 'The width goes: a plainer, stiller lead.' },
    ],
    pattern: {
      key: key('delayed-vibrato-lead'),
      name: 'Delayed Vibrato Lead',
      role: 'lead_line',
      genre: '70s progressive rock',
      bpm: 96,
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'D4:2 . F4 . | A4:6 . . . | . . G4 . | F4 . E4 . | D4:2 . C4 . | D4:8 . . . | . . . . | . . A3 C4',
          lanes: {
            // Two steps into each long note (A4 from step 5, D4 from step 21) the wheel comes up, and down for the next.
            '@wheel': moves({ 0: 0, 6: 0, 9: 0.025, 10: 0, 22: 0, 27: 0.035, 28: 0 }),
          },
        },
        {
          notes:
            'A4:2 . C5 . | D5:6 . . . | . . C5 . | A4 . G4 . | F4:2 . E4 . | D4:8 . . . | . . . . | . . . .',
          lanes: {
            '@wheel': moves({ 0: 0, 6: 0, 9: 0.035, 10: 0, 22: 0, 27: 0.05, 29: 0 }),
          },
        },
      ],
      notes:
        'D dorian at 96. A climbs D–F to a long A, steps down G–F–E to D and C, and lands on a long D. B answers a fourth higher: A–C to a long D, down through C, A and G to F and E, and home to the long D. One hand on the mod wheel: it stays down on the short notes and comes up two steps into each long one, a little more each time, most on B’s last D, and is down again before the next note.',
    },
  },

  // ── 2 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-square-trill',
    name: 'Square-Wave Trill',
    ref: 'A bright, harpsichord-like line whose held notes break into a trill when the mod wheel brings in a square LFO',
    artist: 'Baroque ornament',
    tags: ['lead', 'baroque', 'classical'],
    level: 2,
    blurb: 'A bright, plucked line whose long notes shiver into a trill at a push of the wheel.',
    how: 'A narrow pulse with a quick decay is a bright, harpsichord-like pluck. A square-wave LFO on the pitch jumps between two values instead of sweeping, so on the mod wheel it is a trill: the note flips up and down by the same amount, fast. How far the wheel goes is the trill’s width, about a semitone either side of the key. The lane brings it in on each phrase’s long note, as a player adds an ornament, and the wheel is down for everything else. Because the Model D’s LFO swings both ways from the key, the trilled notes are written between the two notes the trill plays.',
    steps: [
      {
        title: 'A bright pluck',
        module: 'osc',
        why: 'A narrow pulse is thin and bright, and a quiet sawtooth an octave down gives it a body.',
        set: {
          'osc1.wave': 'narrow',
          'mix.osc1': 8,
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc2': 3,
        },
        listen: 'a thin, nasal tone.',
      },
      {
        title: 'Plucked, and held',
        module: 'filter',
        why: 'The filter opens sharply on each note and falls back, and the loudness falls to a held level, so a long note keeps sounding for the trill.',
        set: {
          'filter.cutoff': 0.5,
          'filter.emphasis': 2,
          'filter.contour': 5,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 3,
          'aenv.attack': 0,
          'aenv.decay': 3,
          'aenv.sustain': 7,
        },
        listen: 'a plucked front, then a quieter held tone.',
      },
      {
        title: 'A square LFO, on the wheel',
        module: 'mod',
        why: 'A square LFO flips between two values, so on the pitch it is a trill, not a vibrato. Seven flips a second is a quick ornament. MOD DEPTH stays at 0: the wheel brings it in, and how far it goes is how wide the trill is.',
        set: {
          'mod.toOsc': true,
          'lfo.shape': 'sq',
          'lfo.rate': lfoAt(7),
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'nothing until the mod wheel comes up: then the note flips up and down.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane brings the trill in on each phrase’s long note. At about 7% it flips a semitone either side of the key: a whole-tone trill.',
      'lfo.shape':
        'Square, so the pitch jumps rather than sweeps. On triangle the trill turns into a vibrato.',
      'lfo.rate':
        'How fast the trill goes. Faster is a shiver; slower a pair of alternating notes.',
      'aenv.sustain': 'Keeps the long notes sounding long enough to trill.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'push the mod wheel lane up to 14% on the long notes.',
        'A trill a whole tone either side: wild, more a siren than an ornament.'
      ),
      {
        id: 'lfo.shape',
        try: 'Switch to triangle',
        hear: 'The trill becomes a wide, wavering vibrato.',
      },
      { id: 'lfo.rate', try: 'Turn down to 4.5', hear: 'A slow, deliberate trill you can count.' },
    ],
    pattern: {
      key: key('square-wave-trill'),
      name: 'Square-Wave Trill',
      role: 'lead_line',
      genre: 'Baroque ornament',
      bpm: 100,
      root: 7,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          // F4 and C#5 are each written between the trill's two notes: E and F♯, C and D.
          notes:
            'G4 B4 D5 B4 | C5 A4 F#4 A4 | G4 . B4 . | F4:4 . . . | E4 G4 B4 G4 | A4 F#4 D4 F#4 | G4 . A4 . | C#5:4 . . .',
          lanes: {
            '@wheel': holds({ 0: 0, 12: 0.071, 16: 0, 28: 0.071 }),
          },
        },
        {
          notes:
            'D5 C5 B4 A4 | B4 A4 G4 F#4 | E4 . F#4 . | G#4:4 . . . | C5 B4 A4 G4 | F#4 G4 A4 F#4 | G4 . E4 . | F#4:4 . . .',
          lanes: {
            '@wheel': holds({ 0: 0, 12: 0.071, 16: 0, 28: 0.071 }),
          },
        },
      ],
      notes:
        'G major at 100. A runs up and down the G and D chords and lands on a long note trilled between E and F♯, then does the same over E minor and D and lands on a trill between C and D, a half cadence. B steps down the scale to a trill between G and A, then turns round A to a trill between F and G, back to the top. One hand on the mod wheel: it goes to the same place on each phrase’s long note and back down for the next phrase, so every trill is the same whole tone. Each trilled note is written between its two notes, because the LFO swings the same distance either side of the key.',
    },
  },

  // ── 3 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-wah-bass',
    name: 'Wheel Wah Bass',
    ref: 'A rubbery funk bass whose filter wah-wahs in time when the mod wheel brings a tempo-synced LFO in',
    artist: '70s funk',
    tags: ['bass', 'funk', '70s'],
    level: 2,
    blurb: 'A rubbery funk bass that starts to wah in time as the wheel goes up.',
    how: 'Two oscillators an octave down make a fat bass, through a resonant filter. The LFO is set to the song’s quarter notes and sent to the filter, so it opens and shuts on the beat: a wah pedal rocked in time. MOD DEPTH is left at 0 and the mod wheel brings the wah in. The lane plays it as a bassist would ride a pedal: dry for the first bar, then the wheel goes up through the groove and down again for the turnaround, deepest in part B.',
    steps: [
      {
        title: 'A fat bass',
        module: 'osc',
        why: 'A sawtooth and a square, both an octave down, make a thick bass with a hollow middle.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'saw',
          'osc2.range': '16',
          'osc2.wave': 'sq',
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 5,
        },
        listen: 'a buzzy, thick bass.',
      },
      {
        title: 'A dark, vocal filter',
        module: 'filter',
        why: 'The filter sits low with plenty of emphasis, so when something opens it there is a vowel in it. A short envelope pops each note.',
        set: {
          'filter.cutoff': -1.5,
          'filter.emphasis': 6,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2,
          'fenv.sustain': 1,
          'aenv.attack': 0,
          'aenv.decay': 2,
          'aenv.sustain': 8,
        },
        listen: 'a muffled, slightly honky bass with a pop on each note.',
      },
      {
        title: 'A wah on the wheel',
        module: 'mod',
        why: 'FILTER MODULATION sends the LFO to the cutoff, one sweep a beat at the song’s tempo. MOD DEPTH stays at 0: the wheel brings it in, as a foot brings a wah pedal in.',
        set: {
          'mod.toFilter': true,
          'lfo.shape': 'tri',
          'lfo.rate': lfoSync(104, 1),
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'no wah yet: push the mod wheel up and the bass starts to say “wow” on every beat.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane brings the wah in after the first bar and takes it out for the turnaround, deepest in part B.',
      'lfo.rate':
        'Set to one sweep a beat at 104 bpm. Twice as fast is a sixteenth-note wah; half is lazier.',
      'filter.emphasis': 'The vowel in the wah. Higher is more vocal; low is a plain swell.',
      'filter.cutoff': 'Where the wah starts from. Lower is darker and deeper.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'redraw the mod wheel lane high from the first step.',
        'The wah never stops: a pedal left rocking.'
      ),
      {
        id: 'lfo.rate',
        try: `Turn to ${lfoSync(104, 2)}`,
        hear: 'Two wahs a beat: busier, more like a clavinet.',
      },
      { id: 'filter.emphasis', try: 'Push up to 8', hear: 'A screaming, talking wah.' },
    ],
    pattern: {
      key: key('wheel-wah-bass'),
      name: 'Wheel Wah Bass',
      role: 'bass_line',
      genre: '70s funk',
      bpm: 104,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 0],
      parts: [
        {
          notes:
            'E2:2 . . E2 | . G2 . A2 | E2:2 . D3 . | B2 . A2 G2 | E2:2 . . E2 | . G2 . A2 | B2:2 . A2 . | G2 . F#2:2 .',
          lanes: {
            '@wheel': moves({ 0: 0, 15: 0, 19: 0.16, 26: 0.16, 31: 0 }),
          },
        },
        {
          notes:
            'A2:2 . . A2 | . C3 . D3 | A2:2 . G3 . | E3 . D3 C3 | B2:2 . . B2 | . D3 . E3 | F#2:2 . G2 . | A2 . B2:2 .',
          lanes: {
            '@wheel': moves({ 0: 0, 3: 0.2, 26: 0.25, 31: 0 }),
          },
        },
      ],
      notes:
        'E minor at 104. A is a two-bar groove on E: the root, an off-beat G and A, an octave D and a run down B–A–G, then a second bar ending on F♯ under the turnaround. B moves the groove to A and then B. One hand on the mod wheel, the way a bassist rides a wah pedal: down for A’s first bar, up through its second and down for the turnaround; in B up from the start and deeper, and down again before A comes back.',
    },
  },

  // ── 4 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-noise-growl',
    name: 'Noise Growl Bass',
    ref: 'A dark, grinding industrial bass that growls when the mod wheel lets noise shake its filter',
    artist: 'Industrial',
    tags: ['bass', 'industrial', 'dark'],
    level: 3,
    blurb: 'A dark, grinding bass that snarls as the wheel lets noise into its filter.',
    how: 'A sawtooth and a square, an octave down, through a resonant filter, make a hard bass. Mod source B is set to noise and MOD MIX fully right, so the modulation is random: sent to the filter, it shakes the cutoff many times a second, and the bass growls like a throat. MOD DEPTH stays at 0, and the mod wheel brings the growl in on the held notes. A second lane turns the cutoff slowly up through part A and down through part B, so one hand rides the wheel and the other the filter.',
    steps: [
      {
        title: 'A hard bass',
        module: 'osc',
        why: 'A sawtooth and a square an octave down, the square a hair flat, make a hard, slightly beating bass.',
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
        listen: 'a thick, buzzing bass that beats slowly.',
      },
      {
        title: 'A tight, resonant filter',
        module: 'filter',
        why: 'The filter is low and resonant, so a shake of the cutoff is heard as a snarl. The envelope gives each note a short bark.',
        set: {
          'filter.cutoff': -1,
          'filter.emphasis': 5,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 2,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 9,
        },
        listen: 'a dark, barking bass.',
      },
      {
        title: 'Noise on the filter, on the wheel',
        module: 'mod',
        why: 'Mod source B is noise, and MOD MIX fully right takes only it. FILTER MODULATION sends it to the cutoff. MOD DEPTH stays at 0: the wheel brings it in.',
        set: { 'mod.srcB': 'noise', 'mod.mix': 10, 'mod.toFilter': true, 'mod.depth': 0 },
        listen: 'still clean: push the mod wheel up and the bass starts to growl and grind.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane brings the growl in on the held notes, a little more each time.',
      'filter.cutoff':
        'The other lane: up slowly through part A, down through part B, so the growl gets brighter and then sinks.',
      'mod.srcB':
        'Noise, so the filter shakes at random: a growl. On the LFO it would be a regular wobble.',
      'filter.emphasis': 'The edge of the growl. Higher is a snarl; lower a rumble.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'draw the mod wheel lane high on every note.',
        'The whole line grinds, a machine instead of a voice.'
      ),
      laneTweak(
        'filter.cutoff',
        'flatten the cutoff lane at -2.',
        'A darker growl, more felt than heard.'
      ),
      { id: 'mod.srcB', try: 'Switch to the LFO', hear: 'The growl turns into a steady wobble.' },
    ],
    pattern: {
      key: key('noise-growl-bass'),
      name: 'Noise Growl Bass',
      role: 'bass_line',
      genre: 'Industrial',
      bpm: 118,
      root: 4,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'E1 E1 . E1 | G1:4 . . . | E1 E1 . E1 | Bb1:4 . . . | E1 E1 . E1 | G1:2 . A1 . | Bb1:2 . A1 . | G1:4 . . .',
          lanes: {
            '@wheel': moves({
              0: 0,
              3: 0,
              6: 0.2,
              8: 0,
              11: 0,
              14: 0.25,
              16: 0,
              27: 0,
              30: 0.3,
              31: 0.15,
            }),
            'filter.cutoff': ramp(-1.5, -0.5),
          },
        },
        {
          notes:
            'D1 D1 . D1 | F1:4 . . . | D1 D1 . D1 | Ab1:4 . . . | C1 C1 . C1 | Eb1:2 . F1 . | G1:2 . F1 . | E1:4 . . .',
          lanes: {
            '@wheel': moves({
              0: 0,
              3: 0,
              6: 0.3,
              8: 0,
              11: 0,
              14: 0.35,
              16: 0,
              27: 0,
              30: 0.4,
              31: 0,
            }),
            'filter.cutoff': ramp(-0.5, -1.5),
          },
        },
      ],
      notes:
        'E phrygian at 118, in octave-low pulses: three hits on the root, then a held note, G and then the flat fifth B♭, and a bar that walks G–A–B♭–A–G. B moves the same shape down to D and then C, landing on E. One hand on the mod wheel, pushed up into each held note and dropped for the hits, harder in B; the other turns the cutoff slowly up through A and back through B.',
    },
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-contour-zap',
    name: 'Contour Pitch Zap',
    ref: 'An electro bass whose notes fire like lasers when the mod wheel sends the filter contour to the pitch',
    artist: '80s electro',
    tags: ['bass', 'electro', 'fx'],
    level: 3,
    blurb: 'A punchy electro bass that turns into laser zaps as the wheel goes up.',
    how: 'On the Model D, mod source A can be the filter contour as well as Oscillator 3. With MOD MIX fully left and OSCILLATOR MODULATION on, the contour moves the pitch: every note starts high and drops to its key as the contour decays, a zap. MOD DEPTH stays at 0, so the mod wheel sets how far each note falls. The lane leaves the bass plain at first, then pushes the wheel up through each part, so the line turns from a bass into lasers; a second lane shortens the filter decay as it goes, so the zaps get tighter.',
    steps: [
      {
        title: 'A square bass',
        module: 'osc',
        why: 'A square and a sawtooth an octave down make a round but punchy bass.',
        set: {
          'osc1.range': '16',
          'osc1.wave': 'sq',
          'osc2.range': '16',
          'osc2.wave': 'saw',
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 4,
        },
        listen: 'a hollow, punchy bass.',
      },
      {
        title: 'A short contour',
        module: 'filter',
        why: 'The filter contour is quick: it jumps open on each note and falls away. That same contour is what will move the pitch.',
        set: {
          'filter.cutoff': -0.5,
          'filter.emphasis': 3,
          'filter.contour': 5,
          'fenv.attack': 0,
          'fenv.decay': 2.2,
          'fenv.sustain': 0,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 6,
        },
        listen: 'a blip of brightness on each note.',
      },
      {
        title: 'The contour on the pitch, on the wheel',
        module: 'mod',
        why: 'Mod source A set to FILTER EG picks the contour, MOD MIX fully left takes only it, and OSCILLATOR MODULATION sends it to the pitch. MOD DEPTH stays at 0: the wheel brings it in, and sets how far each note falls.',
        set: { 'mod.srcA': 'eg', 'mod.mix': 0, 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'plain notes: push the mod wheel up and each one fires down from above, “pew”.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane sets how far each note drops, rising through each part from plain to lasers.',
      'fenv.decay':
        'The other lane: how long each zap takes to fall. Shorter is a click; longer a slow swoop.',
      'mod.srcA': 'The filter contour, so every note’s pitch falls with its brightness.',
      'filter.contour': 'How bright each zap is; the pitch drop is the wheel’s.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'push the mod wheel lane to 60% all the way through.',
        'Every note a laser, from the first.'
      ),
      laneTweak(
        'fenv.decay',
        'flatten the decay lane at 4.',
        'Slow, swooping falls: a bomb drop on every note.'
      ),
      {
        id: 'mod.srcA',
        try: 'Switch to Oscillator 3',
        hear: 'The zap turns into a metallic clang.',
      },
    ],
    pattern: {
      key: key('contour-pitch-zap'),
      name: 'Contour Pitch Zap',
      role: 'bass_line',
      genre: '80s electro',
      bpm: 120,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'A1 . . A1 | . . A2 . | A1 . C2 . | . D2 . E2 | A1 . . A1 | . . A2 . | G1 . . G1 | . E2 . G2',
          lanes: {
            '@wheel': ramp(0, 0.3),
            'fenv.decay': ramp(2.4, 1.8),
          },
        },
        {
          notes:
            'F1 . . F1 | . . F2 . | F1 . A1 . | . C2 . D2 | G1 . . G1 | . . G2 . | E2 . D2 . | C2 . B1 E2',
          lanes: {
            '@wheel': moves({ 0: 0.3, 24: 0.55, 31: 0 }),
            'fenv.decay': moves({ 0: 1.8, 24: 1.5, 31: 2.4 }),
          },
        },
      ],
      notes:
        'A minor at 120, a syncopated electro line: root, off-beat root, octave, then C–D–E; the second bar turns to G. B moves to F and G and climbs C–D, then falls E–D–C–B. One hand on the mod wheel, up slowly through A so the plain bass turns into zaps, on up through B to its widest, and back down for A; the other shortens the filter decay as the wheel rises, so the zaps tighten, and lets it out again at the end.',
    },
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-fm-build',
    name: 'FM Clang Build',
    ref: 'A techno riff that grows from a plain bass into a metallic clang as the mod wheel turns up audio-rate FM',
    artist: 'Industrial techno',
    tags: ['bass', 'techno', 'build'],
    level: 3,
    blurb:
      'A driving techno riff that grows harsher and more metallic all the way through the song.',
    how: 'Oscillator 3 is taken out of the mixer and used at audio rate, following the keyboard, as a modulator: mod source A, MOD MIX fully left, OSCILLATOR MODULATION on. That is frequency modulation, and the more of it, the more the plain sawtooth turns into metal. MOD DEPTH stays at 0, so the mod wheel is the amount: the lane pushes it slowly up through the whole song, the long build of a techno track, and drops it for the loop. The other hand turns Oscillator 3 a fifth up half way through part B, which changes the colour of the metal.',
    steps: [
      {
        title: 'One sawtooth',
        module: 'osc',
        why: 'A single sawtooth an octave down is the plain riff that the FM will turn to metal.',
        set: { 'osc1.range': '16', 'osc1.wave': 'saw', 'mix.osc1': 8 },
        listen: 'a plain, buzzy bass.',
      },
      {
        title: 'Oscillator 3, out of the mix',
        module: 'osc',
        why: 'Oscillator 3 stays out of the mixer but keeps following the keyboard, an octave up: heard only through what it does to the others.',
        set: { 'osc3.range': '8', 'osc3.wave': 'tri', 'osc3.kbd': true, 'osc3.freq': 0 },
        listen: 'no change: Oscillator 3 is silent.',
      },
      {
        title: 'A tight filter',
        module: 'filter',
        why: 'A punchy envelope and some emphasis keep the riff tight however harsh the FM makes it.',
        set: {
          'filter.cutoff': 0.5,
          'filter.emphasis': 3,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 2,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 7,
        },
        listen: 'a tight, punchy bass.',
      },
      {
        title: 'FM, on the wheel',
        module: 'mod',
        why: 'MOD MIX fully left picks source A, Oscillator 3, and OSCILLATOR MODULATION sends it to the pitch at audio rate. MOD DEPTH stays at 0: the wheel brings it in, and is the amount of FM.',
        set: { 'mod.srcA': 'osc3', 'mod.mix': 0, 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'push the mod wheel up slowly: the bass turns gritty, then clangs like metal.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane is the amount of FM, rising through the whole song.',
      'osc3.freq':
        'The other lane: Oscillator 3’s tuning, the FM ratio. 0 is harmonic and hard; a fifth up is sweeter; off the semitones it goes bell-like.',
      'osc3.range': 'Oscillator 3 an octave above the riff. Lower is a growl; higher a whine.',
      'filter.emphasis': 'Bite on top of the metal.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'redraw the mod wheel lane as one steep climb in the last part.',
        'A sudden build: the riff stays plain and then tears.'
      ),
      laneTweak(
        'osc3.freq',
        'set the frequency lane to 0.5 all the way through.',
        'An inharmonic ratio: the metal turns to bells.'
      ),
      { id: 'osc3.range', try: 'Switch to 16', hear: 'A deeper, growling FM.' },
    ],
    pattern: {
      key: key('fm-clang-build'),
      name: 'FM Clang Build',
      role: 'bass_line',
      genre: 'Industrial techno',
      bpm: 128,
      root: 2,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'D2 . D2 D3 | . D2 F2 . | D2 . D2 D3 | . C3 A2 . | D2 . D2 D3 | . D2 F2 . | G2 . F2 . | Eb2 . D2:2 .',
          lanes: {
            // Up a little through each pass of A (it plays twice), so the second A starts where the first ends.
            '@wheel': (c) => (c.i / 31) * 0.1,
            'osc3.freq': holds({ 0: 0 }),
          },
        },
        {
          notes:
            'G2 . G2 G3 | . G2 Bb2 . | G2 . G2 G3 | . F3 D3 . | A2 . A2 A3 | . A2 C3 . | Bb2 . A2 . | G2 . A2:2 .',
          lanes: {
            '@wheel': moves({ 0: 0.12, 28: 0.4, 31: 0 }),
            // Turned a fifth up over the gap into B's second half, and back down over its last two steps, each pass.
            'osc3.freq': moves({ 0: 0, 15: 0, 17: 7, 29: 7, 31: 0 }),
          },
        },
      ],
      notes:
        'D minor at 128, a pumping riff: root, octave and the minor third, then C–A; the second bar ends on the flat second E♭ falling to D. B moves it to G and A. AABB. One hand on the mod wheel, up through the whole song, slowly through A’s two passes and steeply through B, and back down as the loop comes round; the other turns Oscillator 3 a fifth up half way through each pass of B, so the metal changes colour at the top of the build, and back down as that pass ends. Each A starts with the wheel where the hand has it: the lane’s A rises 0 to 10% and plays twice, so the second pass jumps back, a small move the hand makes on the downbeat.',
    },
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-bell-strike',
    name: 'Wheel Bell Strike',
    ref: 'A slow, ringing bell melody whose strikes turn metallic when the mod wheel adds inharmonic FM',
    artist: 'Ambient electronica',
    tags: ['keys', 'bell', 'ambient'],
    level: 2,
    blurb: 'A soft, ringing melody whose strongest notes ring out like struck metal bells.',
    how: 'A triangle rings and dies away like a struck bar. Oscillator 3, out of the mixer and a little more than an octave up, frequency-modulates it: that ratio is off the harmonic series, so the tone it adds is a bell’s clang rather than a buzz. MOD DEPTH is left at 0 and the mod wheel brings the clang in. The lane pushes it up for each phrase’s first, strongest strike and lets it down for the soft notes after, the way a player leans on a phrase’s first bell; part B leans harder.',
    steps: [
      {
        title: 'A ringing triangle',
        module: 'osc',
        why: 'A triangle is nearly a pure tone. On its own, with a long decay, it is a soft glockenspiel or a vibraphone bar.',
        set: { 'osc1.range': '4', 'osc1.wave': 'tri', 'mix.osc1': 8 },
        listen: 'a soft, pure tone.',
      },
      {
        title: 'Oscillator 3, off the harmonics',
        module: 'osc',
        why: 'Oscillator 3 follows the keyboard, out of the mixer, an octave up and a semitone and a bit more: a ratio no harmonic has, which is what makes a bell.',
        set: { 'osc3.range': '2', 'osc3.wave': 'tri', 'osc3.kbd': true, 'osc3.freq': 1.4 },
        listen: 'no change: Oscillator 3 is silent.',
      },
      {
        title: 'Struck, and ringing away',
        module: 'env',
        why: 'No sustain and a long decay, with LOUD DECAY on so the ring carries on after the key is let go: a strike and a ring, as a bell’s.',
        set: {
          'filter.cutoff': 2.5,
          'filter.emphasis': 0,
          'filter.contour': 2,
          'fenv.attack': 0,
          'fenv.decay': 5,
          'fenv.sustain': 0,
          'aenv.attack': 0,
          'aenv.decay': 6,
          'aenv.sustain': 0,
          'env.loudDecay': true,
        },
        listen: 'each note strikes and rings away.',
      },
      {
        title: 'The clang, on the wheel',
        module: 'mod',
        why: 'MOD MIX fully left picks Oscillator 3 and OSCILLATOR MODULATION sends it to the pitch. MOD DEPTH stays at 0: the wheel brings it in, and how far is how metallic the bell is.',
        set: { 'mod.srcA': 'osc3', 'mod.mix': 0, 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'push the mod wheel up a little and strike a note: it clangs like a bell.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane leans on each phrase’s first strike and eases off for the soft notes after.',
      'osc3.freq':
        'The bell’s ratio. Near a whole semitone it turns harmonic and buzzy; between, it is a bell.',
      'aenv.decay': 'How long each bell rings.',
      'osc1.range': 'Two octaves up for a small bell; lower is a gong.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'push the mod wheel lane up to 30% on every note.',
        'Every note a heavy, clanging church bell.'
      ),
      {
        id: 'osc3.freq',
        try: 'Move between 1 and 2',
        hear: 'The bell changes metal: brass, steel, glass.',
      },
      { id: 'aenv.decay', try: 'Turn up to 8', hear: 'The bells ring into each other, a wash.' },
    ],
    pattern: {
      key: key('wheel-bell-strike'),
      name: 'Wheel Bell Strike',
      role: 'lead_line',
      genre: 'Ambient electronica',
      bpm: 84,
      stepSize: '1/8',
      root: 0,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1],
      parts: [
        {
          notes:
            'G4:2 . E4 . | C4 . D4 . | E4:4 . . . | . . . . | A4:2 . G4 . | E4 . D4 . | C4:4 . . . | . . D4 E4',
          lanes: {
            // The phrase's first strike gets the wheel, which eases off over its first bar.
            '@wheel': moves({ 0: 0.16, 6: 0, 15: 0, 16: 0.16, 22: 0, 31: 0.08 }),
          },
        },
        {
          notes:
            'C5:2 . B4 . | G4 . A4 . | E4:4 . . . | . . . . | F4:2 . E4 . | D4 . E4 . | C4:6 . . . | . . . .',
          lanes: {
            '@wheel': moves({ 0: 0.22, 6: 0, 15: 0, 16: 0.22, 22: 0, 31: 0.16 }),
          },
        },
      ],
      notes:
        'C major at 84, in eighth notes. A strikes G and falls to E, C and D, rings on E, then strikes A and comes down to C. B starts higher on C and B, rings on E, and comes home through F–E–D–E to a long C. One hand on the mod wheel: up for each phrase’s first strike, so it clangs, easing down over its first bar so the soft notes after ring pure, and coming back up into the next phrase; part B leans harder.',
    },
  },

  // ── 8 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-seasick-breakdown',
    name: 'Seasick Breakdown',
    ref: 'A house lead that turns woozy and seasick in the breakdown as the mod wheel brings in a slow, deep pitch sway',
    artist: 'Progressive house',
    tags: ['lead', 'house', 'fx'],
    level: 1,
    blurb:
      'A bright house lead that lurches and sways out of tune in the breakdown, then snaps back.',
    how: 'Two sawtooths make a bright house lead. The LFO is slow, under one sway a second, and sent to the oscillators, so on the mod wheel the whole lead drifts sharp and flat like a ship: seasick. MOD DEPTH stays at 0. Part A plays it straight, wheel down. Part B is the breakdown: the lane pushes the wheel up through it, so the lead slowly loses its footing, and pulls it back down as the drop comes round.',
    steps: [
      {
        title: 'A bright house lead',
        module: 'osc',
        why: 'Two sawtooths, one an octave up, make a bright, full lead.',
        set: {
          'osc1.wave': 'saw',
          'osc2.range': '4',
          'osc2.wave': 'saw',
          'osc2.freq': 0.08,
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 5,
        },
        listen: 'a bright, full lead.',
      },
      {
        title: 'Open and plucky',
        module: 'filter',
        why: 'A fairly open filter and a quick envelope give each note a pluck, and the loudness holds the long notes.',
        set: {
          'filter.cutoff': 1.5,
          'filter.emphasis': 2,
          'filter.contour': 4,
          'fenv.attack': 0,
          'fenv.decay': 2.5,
          'fenv.sustain': 4,
          'aenv.attack': 0,
          'aenv.decay': 3,
          'aenv.sustain': 8,
        },
        listen: 'a plucked, bright lead.',
      },
      {
        title: 'A slow sway, on the wheel',
        module: 'mod',
        why: 'The LFO is slow, under one cycle a second, and goes to the oscillators. MOD DEPTH stays at 0: the wheel brings it in, and the further it goes, the wider the sway.',
        set: {
          'mod.toOsc': true,
          'lfo.shape': 'tri',
          'lfo.rate': lfoAt(0.7),
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'in tune: push the mod wheel up and the lead drifts sharp and flat.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane is down for part A and rises through the breakdown, part B, then drops for the return.',
      'lfo.rate': 'The sway’s speed. Slower is a ship; faster a warped record.',
      'osc2.range': 'Oscillator 2 an octave up, for the brightness.',
      'filter.contour': 'The pluck on each note.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'push the mod wheel lane to 10% in part A too.',
        'Seasick from the start: the whole song lurches.'
      ),
      { id: 'lfo.rate', try: 'Turn up to 4', hear: 'A faster wobble, like tape gone wrong.' },
      {
        id: 'lfo.shape',
        try: 'Switch to square',
        hear: 'The pitch jumps between two places: a dizzy lurch.',
      },
    ],
    pattern: {
      key: key('seasick-breakdown'),
      name: 'Seasick Breakdown',
      role: 'lead_line',
      genre: 'Progressive house',
      bpm: 122,
      root: 5,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 1, 1],
      parts: [
        {
          notes:
            'F4 . A4 . | C5 . A4 . | G4 . A4 . | F4:2 . . . | F4 . A4 . | C5 . D5 . | C5 . A4 . | G4:4 . . .',
          lanes: {
            '@wheel': holds({ 0: 0 }),
          },
        },
        {
          notes:
            'D5:4 . . . | C5:4 . . . | A4:6 . . . | . . G4:2 . | Bb4:4 . . . | A4:4 . . . | G4:8 . . . | . . . .',
          lanes: {
            '@wheel': moves({ 0: 0, 31: 0.1 }),
          },
        },
      ],
      notes:
        'F major at 122. A is a bouncy off-beat hook: F–A–C up and back, a G to F, then on to D and down to G, played twice with the wheel down. B is the breakdown, long notes falling D–C–A–G, then B♭–A–G held, played twice. One hand on the mod wheel: still through A, then up slowly through each pass of B, so the lead loses its footing, and down at once for A, as a drop snaps back in. The second B pass starts where the first did, a quick move back down for the hand.',
    },
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-siren-riser',
    name: 'Siren Riser',
    ref: 'A jungle stab line that rises into a wailing siren when the mod wheel sends a slow Oscillator 3 to the pitch',
    artist: 'Jungle',
    tags: ['lead', 'jungle', 'fx'],
    level: 3,
    blurb: 'A rave stab line that wails into a siren as the wheel goes up into the drop.',
    how: 'Oscillator 3 is taken off the keyboard and set very low, so it is no longer a tone: it is a slow wave, about one cycle a second, a second LFO. Mod source A picks it, MOD MIX fully left, and OSCILLATOR MODULATION sends it to the pitch, so with the mod wheel up the notes swoop up and down: a siren. MOD DEPTH stays at 0. Part A is the stabs, wheel down; part B holds long notes while the wheel goes up, so they rise into a wailing siren before the stabs come back.',
    steps: [
      {
        title: 'A rave stab',
        module: 'osc',
        why: 'Two sawtooths a fifth apart, so each key is a hard, open chord.',
        set: {
          'osc1.wave': 'saw',
          'osc2.wave': 'saw',
          'osc2.freq': 7,
          'mix.osc2On': true,
          'mix.osc1': 8,
          'mix.osc2': 6,
        },
        listen: 'a hard, open chord on every key.',
      },
      {
        title: 'Oscillator 3 as a slow wave',
        module: 'osc',
        why: 'OSC 3 CONTROL off takes Oscillator 3 off the keyboard, and the lowest range with FREQUENCY turned down makes it about one cycle a second. It stays out of the mixer.',
        set: { 'osc3.kbd': false, 'osc3.range': 'lo', 'osc3.wave': 'tri', 'osc3.freq': -6 },
        listen: 'no change: Oscillator 3 is silent and slow.',
      },
      {
        title: 'Bright and punchy',
        module: 'filter',
        why: 'An open, resonant filter with a quick envelope, and loudness that holds for the long siren notes.',
        set: {
          'filter.cutoff': 2,
          'filter.emphasis': 4,
          'filter.contour': 3,
          'fenv.attack': 0,
          'fenv.decay': 2,
          'fenv.sustain': 4,
          'aenv.attack': 0,
          'aenv.decay': 2.5,
          'aenv.sustain': 9,
        },
        listen: 'a bright stab with a ringing edge.',
      },
      {
        title: 'The siren, on the wheel',
        module: 'mod',
        why: 'MOD MIX fully left picks source A, Oscillator 3, and OSCILLATOR MODULATION sends it to the pitch. MOD DEPTH stays at 0: the wheel brings it in, and how far it goes is how wide the siren swoops.',
        set: { 'mod.srcA': 'osc3', 'mod.mix': 0, 'mod.toOsc': true, 'mod.depth': 0 },
        listen: 'hold a note and push the mod wheel up: it swoops up and down, a siren.',
      },
    ],
    context: {
      'mod.depth':
        'Stays at 0: the mod wheel lane is down for the stabs and rises through the long notes of part B into a full siren.',
      'osc3.freq':
        'The siren’s speed: Oscillator 3 is the slow wave. Turn it up for a faster wail.',
      'osc3.wave':
        'A triangle swoops evenly up and down. Sawtooth is a siren that rises and drops.',
      'osc2.freq': 'Oscillator 2 a fifth up, so the stab is a chord.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'redraw the mod wheel lane at 25% through part A as well.',
        'The stabs wail too: the whole track is an alarm.'
      ),
      {
        id: 'osc3.wave',
        try: 'Switch to sawtooth',
        hear: 'A siren that rises slowly and drops at once.',
      },
      { id: 'osc3.freq', try: 'Turn up to -3', hear: 'A faster, more frantic wail.' },
    ],
    pattern: {
      key: key('siren-riser'),
      name: 'Siren Riser',
      role: 'lead_line',
      genre: 'Jungle',
      bpm: 160,
      root: 9,
      scale: 'chromatic',
      len: 32,
      chain: [0, 0, 0, 1],
      parts: [
        {
          notes:
            'A3 . . A3 | . . C4 . | . A3 . . | G3 . A3 . | A3 . . A3 | . . E4 . | . D4 . . | C4 . A3:2 .',
          lanes: {
            '@wheel': holds({ 0: 0 }),
          },
        },
        {
          notes:
            'A3:8 . . . | . . . . | C4:8 . . . | . . . . | D4:8 . . . | . . . . | E4:8 . . . | . . . .',
          lanes: {
            '@wheel': moves({ 0: 0, 29: 0.3, 31: 0 }),
          },
        },
      ],
      notes:
        'A minor at 160, jungle tempo. A is a syncopated stab riff on A, C, G and E, played three times with the wheel down. B is the riser: four long notes climbing A–C–D–E, and one hand on the mod wheel pushes it up through all four, so they swoop wider and wider into a siren, and drops it just before the stabs come back.',
    },
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────
  {
    id: 'wheel-filter-vibrato-funk',
    name: 'Filter-Vibrato Funk',
    ref: 'A slinky funk lead whose held notes shimmer in tone, not pitch, when the mod wheel sends a fast LFO to the filter',
    artist: '70s funk',
    tags: ['lead', 'funk', '70s'],
    level: 2,
    blurb: 'A slinky funk lead whose long notes shimmer and throb in tone, held still in pitch.',
    how: 'A square and a sawtooth through a resonant filter make a vocal funk lead. The LFO is at a vibrato’s speed, but sent to the filter instead of the pitch: so with the mod wheel up the note stays in tune and its tone throbs, a shimmer like a voice through a talk box. MOD DEPTH stays at 0, and the lane pushes the wheel up on the held notes only. The other hand turns EMPHASIS up through part B, so the shimmer gets more vocal.',
    steps: [
      {
        title: 'A vocal lead',
        module: 'osc',
        why: 'A square and a sawtooth together are hollow and bright at once, a good start for a vocal tone.',
        set: {
          'osc1.wave': 'sq',
          'osc2.wave': 'saw',
          'osc2.freq': 0.1,
          'mix.osc2On': true,
          'mix.osc1': 7,
          'mix.osc2': 5,
          'ctl.glide': 1.5,
        },
        listen: 'a hollow, bright tone.',
      },
      {
        title: 'A resonant filter',
        module: 'filter',
        why: 'The filter sits in the middle with emphasis, so moving the cutoff a little changes the vowel. Keyboard control keeps the vowel with the line.',
        set: {
          'filter.cutoff': 0,
          'filter.emphasis': 5,
          'filter.kbd1': true,
          'filter.contour': 3,
          'fenv.attack': 0.5,
          'fenv.decay': 3,
          'fenv.sustain': 4,
          'aenv.attack': 0,
          'aenv.decay': 3,
          'aenv.sustain': 9,
        },
        listen: 'a nasal, “aah” tone.',
      },
      {
        title: 'Vibrato on the filter, on the wheel',
        module: 'mod',
        why: 'FILTER MODULATION sends the LFO to the cutoff at a vibrato’s speed. MOD DEPTH stays at 0: the wheel brings it in. On the filter, not the pitch, the note shimmers in tone and stays in tune.',
        set: {
          'mod.toFilter': true,
          'lfo.shape': 'tri',
          'lfo.rate': lfoAt(6),
          'mod.mix': 10,
          'mod.depth': 0,
        },
        listen: 'a still tone: push the mod wheel up on a held note and it throbs “wah-wah-wah”.',
      },
    ],
    context: {
      'mod.depth': 'Stays at 0: the mod wheel lane brings the shimmer in on the held notes only.',
      'filter.emphasis':
        'The other lane: up through part B, so the shimmer turns from a throb into a voice.',
      'lfo.rate': 'The shimmer’s speed. A vibrato’s is about 6 Hz.',
      'mod.toFilter': 'The LFO goes to the filter, not the pitch: the note stays in tune.',
    },
    tweaks: [
      laneTweak(
        'mod.depth',
        'draw the mod wheel lane high on the short notes too.',
        'The whole line throbs, like a rotary speaker.'
      ),
      laneTweak(
        'filter.emphasis',
        'flatten the emphasis lane at 8.',
        'A whistling, squealing shimmer on every held note.'
      ),
      {
        id: 'mod.toOsc',
        try: 'Switch on as well',
        hear: 'Pitch and tone shimmer together: a singer’s vibrato.',
      },
    ],
    pattern: {
      key: key('filter-vibrato-funk'),
      name: 'Filter-Vibrato Funk',
      role: 'lead_line',
      genre: '70s funk',
      bpm: 98,
      root: 7,
      scale: 'chromatic',
      len: 32,
      chain: [0, 1, 0, 1],
      parts: [
        {
          notes:
            'G4 . Bb4 . | C5 . D5:4 . | . . . F5 | D5 . C5 . | Bb4 . C5 . | G4:6 . . . | . . . . | F4 . G4 .',
          lanes: {
            '@wheel': moves({ 0: 0, 7: 0, 9: 0.12, 10: 0, 21: 0, 25: 0.15, 26: 0 }),
            'filter.emphasis': holds({ 0: 5 }),
          },
        },
        {
          notes:
            'D5 . F5 . | G5:4 . . . | F5 . D5 . | C5:4 . . . | Bb4 . C5 . | D5:6 . . . | . . . . | C5 . Bb4 .',
          lanes: {
            '@wheel': moves({
              0: 0,
              4: 0,
              7: 0.15,
              8: 0,
              12: 0,
              15: 0.12,
              16: 0,
              21: 0,
              25: 0.18,
              26: 0,
            }),
            'filter.emphasis': moves({ 0: 5, 24: 7.5, 31: 5 }),
          },
        },
      ],
      notes:
        'G minor pentatonic at 98, a slinky line: G–B♭–C up to a held D, a flick to F and down D–C–B♭–C to a long G. B answers higher, up to a held G, down to a held C, then B♭–C to a long D. One hand on the mod wheel, up on each held note once it has sounded and down for the quick notes, most on each part’s last long note; the other turns EMPHASIS up through B and back for A.',
    },
  },
];
