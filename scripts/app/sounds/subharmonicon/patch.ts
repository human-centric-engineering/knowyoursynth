/**
 * The patchbay: cables that turn the sequencers, envelopes and subs into modulation of the rhythm itself, the
 * divisors, the pulse width and the transport. Every cable here changes something you hear in every cycle.
 * Volts as the hardware’s: an envelope is 0 to 8 V, a sub 10 V peak to peak, SEQ OUT one volt an octave of its step.
 */
import type { SoundSpec } from '@/scripts/app/sounds/lesson-writer';
import { play, rhythms, seq, shape, step, vco } from '@/scripts/app/sounds/subharmonicon/kit';

export const PATCH: SoundSpec[] = [
  {
    id: 'shc-bouncing-ball',
    name: 'Bouncing Ball',
    ref: 'In the style of a bouncing ball',
    artist: 'Sound effects',
    tags: ['fx', 'patch', 'rhythm'],
    level: 2,
    blurb:
      'Notes that come fast after each strike and slow down as it fades: the VCA EG patched into a rhythm.',
    how: 'A rising voltage at a RHYTHM input lowers its divisor, so the rhythm speeds up. Patch the VCA EG into RHYTHM 1 and each note pushes the rhythm faster at its peak, then lets it slow back to ÷16 as it decays: a bounce, then a roll, then a rest, over and over. Rhythm and envelope feed each other.',
    bpm: 100,
    steps: [
      {
        title: 'A ball',
        module: 'osc',
        why: 'VCO 1 square at C5 with its octave sub.',
        set: vco(1, { note: 'C5', wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
        listen: 'with a key held, a hollow tone.',
      },
      {
        title: 'Slow at rest',
        module: 'mod',
        why: 'Rhythm 1 at ÷16 on Sequencer 1.',
        set: rhythms({ 1: [16, true, false] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Each bounce speeds it up',
        module: 'env',
        why: 'VCA EG OUT into RHYTHM 1’s input, and a long VCA decay so the rhythm slows gradually.',
        set: shape({ cutoff: 5, res: 2, amt: 1.6, fd: 3.6, ad: 7 }),
        cables: [['j.vca_eg_out', 'j.rhythm1_in']],
        listen: 'nothing until it plays.',
      },
      {
        title: 'A bounce in pitch too',
        module: 'mod',
        why: 'Sequencer 1 steps VCO 1 down a little each strike, 12-ET at ±1.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [step(7), step(5), step(3), 0]) },
        listen: 'still waiting.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen:
          'notes accelerating into a roll after each strike, then slowing to a stop and starting again.',
      },
    ],
    context: {
      'rhythm1.div': 'In this sound: the slowest the ball bounces, at rest.',
      'vca_eg.decay': 'In this sound: how long the rush lasts after each strike.',
    },
    tweaks: [
      {
        id: 'vca_eg.decay',
        try: 'Turn VCA DECAY to 5',
        hear: 'Short rushes: a ball on a hard floor.',
      },
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷8',
        hear: 'It never quite comes to rest: a continuous, lurching roll.',
      },
    ],
  },
  {
    id: 'shc-rhythm-sequencer',
    name: 'Rhythm Sequencer',
    ref: 'In the style of Autechre’s shifting rhythms',
    artist: 'Autechre',
    tags: ['seq', 'patch', 'rhythm'],
    level: 3,
    blurb: 'Sequencer 2 plays Rhythm 1’s divisor: the rhythm itself changes every beat.',
    how: 'SEQ 2 OUT patched into RHYTHM 1’s input moves Rhythm 1’s divisor by Sequencer 2’s steps, so the pulse driving Sequencer 1 changes speed every time Sequencer 2 moves: sixteenths for a beat, then dotted eighths, then quarters. A melody sequencer driven by a rhythm that is itself sequenced.',
    bpm: 110,
    steps: [
      {
        title: 'One voice',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 silent.',
        set: vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
        listen: 'with a key held, a saw.',
      },
      {
        title: 'Two rhythms',
        module: 'mod',
        why: 'Rhythm 1 centred at ÷4 on Sequencer 1; Rhythm 2 at ÷4 on Sequencer 2.',
        set: rhythms({ 1: [4, true, false], 2: [4, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Sequencer 2 plays the rhythm',
        module: 'mod',
        why: 'SEQ 2 OUT into RHYTHM 1’s input. Sequencer 2, assigned to nothing at ±2, moves Rhythm 1’s divisor: by 0, −3 (to ÷1), −1 (÷3), +2 (÷6).',
        set: seq(2, [0, 5, 1.67, -3.33], {}),
        cables: [['j.seq2_out', 'j.rhythm1_in']],
        listen: 'still waiting.',
      },
      {
        title: 'A melody on top',
        module: 'mod',
        why: '12-ET at ±2: Sequencer 1 C, E♭, G, B♭.',
        set: { 'vco.quantize': '12-ET', ...seq(1, [0, step(3, 2), step(7, 2), step(10, 2)]) },
        listen: 'still waiting.',
      },
      {
        title: 'Pluck and play',
        module: 'filter',
        why: 'A plucked filter, then PLAY lit on the app’s clock.',
        set: { ...shape({ cutoff: 4.6, res: 3, amt: 2.4, fd: 3.8, ad: 4.4 }), ...play() },
        listen: 'a melody that rushes, limps and strolls in turn, beat by beat.',
      },
    ],
    context: {
      'seq2.step2': 'In this sound: the rush, Rhythm 1 at ÷1.',
      'rhythm1.div': 'In this sound: the centre Sequencer 2 moves the rhythm around.',
    },
    tweaks: [
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷3',
        hear: 'The rhythm changes off the beat: more chaotic, never the same twice in a bar.',
      },
      { id: 'seq2.step4', try: 'Turn SEQ 2 STEP 4 to −5', hear: 'The slow beat drags to ÷8.' },
    ],
  },
  {
    id: 'shc-seven-step-loop',
    name: 'Seven-Step Loop',
    ref: 'In the style of Moog’s DFAM patches',
    artist: 'Moog DFAM',
    tags: ['seq', 'patch'],
    level: 3,
    blurb:
      'SEQ 2 CLK resets both sequencers every seven sixteenths: a four-step sequencer playing a seven-step loop.',
    how: 'RESET sends both sequencers back to step 1. Patch SEQ 2 CLK into it and every step of Sequencer 2 cuts Sequencer 1 short: with Sequencer 2 on ÷7 and Sequencer 1 on sixteenths, Sequencer 1 plays steps 1–4, 1–3 and starts again, a seven-note loop in 7/16 that the four-step hardware could not otherwise play.',
    bpm: 120,
    riff: [[0, 60, 7]],
    steps: [
      {
        title: 'A bright voice',
        module: 'osc',
        why: 'VCO 1 square at C4 with its octave sub; VCO 2 square at C5.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { note: 'C5', wave: 'square', levels: [2, 0, 0] }),
        },
        listen: 'with a key held, a hollow octave.',
      },
      {
        title: 'Sixteenths and sevens',
        module: 'mod',
        why: 'Rhythm 1 at ÷1 on Sequencer 1, Rhythm 2 at ÷7 on Sequencer 2.',
        set: rhythms({ 1: [1, true, false], 2: [7, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Cut it short',
        module: 'mod',
        why: 'SEQ 2 CLK into RESET: each step of Sequencer 2 sends both back to step 1.',
        cables: [['j.seq2_clk', 'j.reset_in']],
        listen: 'nothing until it plays.',
      },
      {
        title: 'The notes',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, E♭, F, G.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [0, step(3), step(5), step(7)]) },
        listen: 'still waiting.',
      },
      {
        title: 'Pluck and play',
        module: 'filter',
        why: 'A plucked filter, then PLAY lit on the app’s clock. The riff is seven beats, four turns of the loop.',
        set: { ...shape({ cutoff: 4.8, res: 3, amt: 2.4, fd: 3.6, ad: 4.2 }), ...play() },
        listen: 'C E♭ F G C E♭ F, over and over: a loop of seven.',
      },
    ],
    context: {
      'rhythm2.div': 'In this sound: the loop’s length in sixteenths.',
      'seq1.step4': 'In this sound: the note the loop reaches only once a turn.',
    },
    tweaks: [
      { id: 'rhythm2.div', try: 'Turn RHYTHM 2 to ÷5', hear: 'A five-step loop: C E♭ F G C.' },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷11',
        hear: 'Eleven steps: the loop runs through twice and a bit before the reset.',
      },
    ],
  },
  {
    id: 'shc-hidden-sequence',
    name: 'Hidden Sequence',
    ref: 'In the style of a sample-and-hold melody',
    artist: 'Modular synthesis',
    tags: ['seq', 'patch'],
    level: 3,
    blurb: 'One sequencer changes the pitch silently; only the other one’s steps are heard.',
    how: 'With EG off, the steps fire nothing. Patch SEQ 2 CLK into TRIGGER and only Sequencer 2’s steps fire the envelopes. Sequencer 1 moves VCO 1’s pitch on its own, faster rhythm, out of earshot, so each note Sequencer 2 plays catches VCO 1 wherever Sequencer 1 has left it: a melody sampled from a hidden one.',
    bpm: 104,
    steps: [
      {
        title: 'One voice',
        module: 'osc',
        why: 'VCO 1 sawtooth at C4 with its octave sub; VCO 2 silent.',
        set: vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
        listen: 'with a key held, a saw.',
      },
      {
        title: 'Hidden and heard',
        module: 'mod',
        why: 'Rhythm 1 at ÷1 drives Sequencer 1 (the hidden melody); Rhythm 2 at ÷3 drives Sequencer 2 (what is heard).',
        set: rhythms({ 1: [1, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'The hidden melody',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 C, G, E♭, B♭ on VCO 1. Sequencer 2 is assigned to nothing.',
        set: { 'vco.quantize': '12-ET', 'seq.oct': 1, ...seq(1, [0, step(7), step(3), step(10)]) },
        listen: 'still waiting.',
      },
      {
        title: 'Only Sequencer 2 is heard',
        module: 'env',
        why: 'SEQ 2 CLK into TRIGGER; a plucked filter.',
        set: shape({ cutoff: 4.6, res: 3, amt: 2.4, fd: 3.8, ad: 4.6 }),
        cables: [['j.seq2_clk', 'j.trigger_in']],
        listen: 'nothing until it plays.',
      },
      {
        title: 'EG off, play',
        module: 'mod',
        why: 'EG off, so the steps fire nothing themselves, and PLAY lit on the app’s clock.',
        set: play('off'),
        listen:
          'notes on dotted eighths, each picking a pitch from a sixteenth-note melody you never hear whole.',
      },
    ],
    context: {
      'transport.eg': 'In this sound: off, so only the patched trigger plays notes.',
      'rhythm1.div': 'In this sound: the hidden melody’s speed.',
    },
    tweaks: [
      {
        id: 'rhythm1.div',
        try: 'Turn RHYTHM 1 to ÷2',
        hear: 'The hidden melody slows: the heard notes fall into a simpler pattern.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷5',
        hear: 'Notes every five sixteenths, catching the hidden melody in a new order.',
      },
    ],
  },
  {
    id: 'shc-crossed-sequencers',
    name: 'Crossed Sequencers',
    ref: 'In the style of a Buchla-style sequential voltage source',
    artist: 'West Coast synthesis',
    tags: ['seq', 'patch'],
    level: 3,
    blurb:
      'Each VCO follows both sequencers: four steps times four give sixteen notes from eight knobs.',
    how: 'SEQ 1 OUT patched into VCO 2 and SEQ 2 OUT into VCO 1 add each sequencer to the other VCO on top of its own. With the two on different rhythms, each VCO plays the sum of two four-step patterns, so the melody runs to sixteen distinct pairings before it repeats.',
    bpm: 100,
    steps: [
      {
        title: 'Two voices',
        module: 'osc',
        why: 'VCO 1 square at C4, VCO 2 sawtooth at G4, each with its octave sub.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [4, 2, 0] }),
          ...vco(2, { note: 'G4', subs: [2, 3], levels: [3, 2, 0] }),
        },
        listen: 'with a key held, a fifth.',
      },
      {
        title: 'Two rhythms',
        module: 'mod',
        why: 'Rhythm 1 at ÷2 on Sequencer 1, Rhythm 2 at ÷3 on Sequencer 2.',
        set: rhythms({ 1: [2, true, false], 2: [3, false, true] }),
        listen: 'nothing until it plays.',
      },
      {
        title: 'Two patterns',
        module: 'mod',
        why: '12-ET at ±1: Sequencer 1 0, +3, +7, +5; Sequencer 2 0, +2, −2, +5.',
        set: {
          'vco.quantize': '12-ET',
          'seq.oct': 1,
          ...seq(1, [0, step(3), step(7), step(5)]),
          ...seq(2, [0, step(2), step(-2), step(5)]),
        },
        listen: 'still waiting.',
      },
      {
        title: 'Cross them',
        module: 'mod',
        why: 'SEQ 1 OUT into VCO 2’s input, SEQ 2 OUT into VCO 1’s.',
        cables: [
          ['j.seq1_out', 'j.vco2_in'],
          ['j.seq2_out', 'j.vco1_in'],
        ],
        listen: 'still waiting.',
      },
      {
        title: 'Pluck and play',
        module: 'filter',
        why: 'A plucked filter, then PLAY lit on the app’s clock.',
        set: { ...shape({ cutoff: 4.6, res: 2, amt: 2.4, fd: 4, ad: 4.6 }), ...play() },
        listen: 'two voices whose melodies keep finding new notes, sixteen pairings long.',
      },
    ],
    context: {
      'seq2.step3': 'In this sound: added to both VCOs, through VCO 1’s own assign and the cable.',
    },
    tweaks: [
      {
        id: 'seq.oct',
        try: 'Set SEQ OCT to ±2',
        hear: 'Every step twice as wide: angular, leaping lines.',
      },
      {
        id: 'rhythm2.div',
        try: 'Turn RHYTHM 2 to ÷5',
        hear: 'A longer cycle: the pairings take ten sixteenths to turn over.',
      },
    ],
  },
  {
    id: 'shc-divider-chaos',
    name: 'Divider Chaos',
    ref: 'In the style of circuit-bent electronics',
    artist: 'Circuit bending',
    tags: ['fx', 'patch'],
    level: 3,
    blurb:
      'VCO 2 patched into VCO 1’s SUB input at audio rate: the divisors jump thousands of times a second.',
    how: 'The SUB input moves a VCO’s divisors with a voltage. Feed it VCO 2 itself and the divisors flip between values at VCO 2’s pitch, so the subs break into buzzing, digital-sounding chaos whose texture depends on how VCO 1 and VCO 2 relate. Sequencer 2 moves VCO 2, so each step lands on a different texture.',
    bpm: 96,
    steps: [
      {
        title: 'Subs alone',
        module: 'osc',
        why: 'VCO 1 square at C5, silent, its subs at ÷6 and ÷9 loud. VCO 2 sounds nothing.',
        set: {
          ...vco(1, { note: 'C5', wave: 'square', subs: [6, 9], levels: [0, 4, 4] }),
          ...vco(2, { note: 'E4', levels: [0, 0, 0] }),
        },
        listen: 'with a key held, a low chord.',
      },
      {
        title: 'Break the dividers',
        module: 'osc',
        why: 'VCO 2 OUT into VCO 1’s SUB input.',
        cables: [['j.vco2_out', 'j.vco1_sub_in']],
        listen: 'with a key held, a harsh, buzzing chaos.',
      },
      {
        title: 'Step the chaos',
        module: 'mod',
        why: 'Rhythm 2 at ÷3 on Sequencer 2, moving VCO 2 by uneven amounts with QUANTIZE off, at ±1.',
        set: { ...rhythms({ 2: [3, false, true] }), 'seq.oct': 1, ...seq(2, [0, 1.3, 2.9, -1.7]) },
        listen: 'nothing until it plays.',
      },
      {
        title: 'Tame it a little',
        module: 'filter',
        why: 'A resonant filter, a short ping, a medium decay.',
        set: shape({ cutoff: 5, res: 4, amt: 1.6, fd: 4, ad: 5 }),
        listen: 'with a key, a gritty, ringing burst.',
      },
      {
        title: 'Play',
        module: 'mod',
        why: 'PLAY lit, on the app’s clock.',
        set: play(),
        listen: 'bursts of shifting digital grit, a different texture on every step.',
      },
    ],
    context: {
      'vco2.freq': 'In this sound: not heard, but the speed the divisors flip at.',
      'seq2.step3': 'In this sound: the grittiest texture.',
    },
    tweaks: [
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 5',
        hear: 'Faster flipping: a thinner, whining chaos.',
      },
      {
        id: 'sub11.div',
        try: 'Turn VCO 1 SUB 1 FREQ to ÷12',
        hear: 'More room for the divisors to move: wider, wilder jumps.',
      },
    ],
  },
  {
    id: 'shc-growl-bass',
    name: 'Growl Bass',
    ref: 'In the style of a neurofunk bass',
    artist: 'Drum and bass',
    tags: ['bass', 'patch'],
    level: 3,
    blurb: 'A snarling bass: VCO 1’s own sub patched into CUTOFF shakes the filter at audio rate.',
    how: 'Filter FM: an audio-rate voltage at CUTOFF makes the filter open and close faster than the ear can follow, adding a growl of sidebands. Here VCO 1 SUB 2 OUT feeds CUTOFF, so the growl follows the note. Played from the keys with PLAY off, it is a bass; the riff shows it off.',
    bpm: 87,
    riff: [
      [0, 48, 0.7],
      [0.75, 48, 0.2],
      [1, 51, 0.7],
      [2, 46, 0.4],
      [2.5, 48, 1.4],
    ],
    steps: [
      {
        title: 'A saw bass',
        module: 'osc',
        why: 'VCO 1 sawtooth with its subs at ÷2; SUB 2 is not in the mix.',
        set: vco(1, { subs: [2, 2], levels: [4, 4, 0] }),
        listen: 'with a key, a plain saw bass.',
      },
      {
        title: 'Filter FM',
        module: 'filter',
        why: 'VCO 1 SUB 2 OUT into CUTOFF; the filter low and resonant.',
        set: shape({ cutoff: 3.6, res: 5, amt: 1.4, fd: 5, ad: 5 }),
        cables: [['j.sub12_out', 'j.cutoff_in']],
        listen: 'with a key, a snarl, the filter shaken by the sub.',
      },
      {
        title: 'Change the snarl',
        module: 'osc',
        why: 'SUB 2 at ÷3: the sub feeding the filter, not mixed in.',
        set: { 'sub12.div': 3 },
        listen: 'with a key, a gnarlier, inharmonic growl.',
      },
    ],
    context: {
      'sub12.div': 'In this sound: the growl’s rate, against the note.',
      'vcf.resonance': 'In this sound: how vocal the growl is.',
    },
    tweaks: [
      {
        id: 'sub12.div',
        try: 'Turn VCO 1 SUB 2 FREQ to ÷2',
        hear: 'The growl locks to the octave: smoother, more like a talking bass.',
      },
      { id: 'vcf.cutoff', try: 'Turn CUTOFF to 5', hear: 'A screaming, open growl.' },
    ],
  },
  {
    id: 'shc-cross-pwm',
    name: 'Cross PWM',
    ref: 'In the style of a chorus-laden 1980s pad',
    artist: 'Synth-pop',
    tags: ['pad', 'patch', 'pwm'],
    level: 2,
    blurb:
      'A swirling pad: VCO 2’s deepest sub sweeps VCO 1’s pulse width, slowly and in step with the pitch.',
    how: 'PWM is a pulse whose width moves. Patch VCO 2 SUB 2 OUT into VCO 1’s PWM input and, with VCO 2 sitting a hair above VCO 1 and divided by 16, the width sweeps at a slow, slightly drifting rate: a chorused, swirling pad from no LFO at all.',
    bpm: 70,
    riff: [
      [0, 60, 3.8],
      [4, 63, 3.8],
      [8, 58, 3.8],
      [12, 55, 3.8],
    ],
    steps: [
      {
        title: 'A pulse',
        module: 'osc',
        why: 'VCO 1 on square with its octave sub; VCO 2 silent, a hair above C4, its SUB 2 at ÷16.',
        set: {
          ...vco(1, { wave: 'square', subs: [2, 3], levels: [5, 3, 0] }),
          ...vco(2, { subs: [2, 16], levels: [0, 0, 0] }),
          'vco2.freq': 0.02,
        },
        listen: 'with a key, a hollow square.',
      },
      {
        title: 'Sweep the width',
        module: 'osc',
        why: 'VCO 2 SUB 2 OUT into VCO 1’s PWM input.',
        cables: [['j.sub22_out', 'j.vco1_pwm']],
        listen: 'with a key, the tone swirling as the width moves.',
      },
      {
        title: 'Pad envelope',
        module: 'env',
        why: 'A soft attack, a long decay and a low filter.',
        set: shape({ cutoff: 4.8, res: 1.5, aa: 5, ad: 7 }),
        listen: 'with a key, a slow, swirling pad.',
      },
    ],
    context: {
      'sub22.div': 'In this sound: ÷16, the width’s sweep, not heard itself.',
      'vco2.freq': 'In this sound: the sweep’s drift against the note.',
    },
    tweaks: [
      {
        id: 'sub22.div',
        try: 'Turn VCO 2 SUB 2 FREQ to ÷4',
        hear: 'A faster sweep: a buzzing, rasping pad.',
      },
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 0',
        hear: 'The sweep locks to the note: steady, with no drift.',
      },
    ],
  },
  {
    id: 'shc-ring-tremolo',
    name: 'Ring Tremolo',
    ref: 'In the style of a surf guitar’s tremolo',
    artist: 'Dick Dale',
    tags: ['keys', 'patch'],
    level: 2,
    blurb:
      'A pulsing tremolo locked to the note’s own subharmonic: VCO 2’s deepest sub into the VCA.',
    how: 'The VCA input adds a voltage to the VCA EG. Patch VCO 2 SUB 2 OUT there with VCO 2 at C4 divided by 16 and the amplitude pulses at 16 Hz, a fast tremolo; play lower and it slows, play higher and it speeds up, since VCO 2 follows the keys too.',
    bpm: 100,
    riff: [
      [0, 64, 0.9],
      [1, 62, 0.9],
      [2, 60, 1.9],
      [4, 55, 0.9],
      [5, 57, 0.9],
      [6, 60, 1.9],
    ],
    steps: [
      {
        title: 'A twangy voice',
        module: 'osc',
        why: 'VCO 1 sawtooth with its octave sub; VCO 2 silent with SUB 2 at ÷16.',
        set: {
          ...vco(1, { subs: [2, 3], levels: [4, 3, 0] }),
          ...vco(2, { subs: [2, 16], levels: [0, 0, 0] }),
        },
        listen: 'with a key, a bright tone.',
      },
      {
        title: 'Tremolo',
        module: 'amp',
        why: 'VCO 2 SUB 2 OUT into the VCA input.',
        cables: [['j.sub22_out', 'j.vca_in']],
        listen: 'with a key, a fast pulsing that follows the note.',
      },
      {
        title: 'Spring',
        module: 'filter',
        why: 'A mid filter with a twangy envelope and a long decay.',
        set: shape({ cutoff: 4.8, res: 3, amt: 2, fd: 4.4, ad: 6 }),
        listen: 'with a key, a twanging, trembling note.',
      },
    ],
    context: {
      'sub22.div': 'In this sound: the tremolo’s rate, a sixteenth of the note.',
    },
    tweaks: [
      {
        id: 'sub22.div',
        try: 'Turn VCO 2 SUB 2 FREQ to ÷8',
        hear: 'Twice as fast: the tremolo turns into a ring-modulated buzz.',
      },
      {
        id: 'vco2.freq',
        try: 'Turn VCO 2 FREQ to 0.3',
        hear: 'The tremolo drifts against the note.',
      },
    ],
  },
];
