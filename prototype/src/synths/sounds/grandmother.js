// More Moog Grandmother sounds. Shape: see CONTRACT.md → Preset.
export default [
  {
    id: 'gm-cable-vibrato', name: 'Patched Vibrato Lead', ref: 'Vibrato through the attenuator and the mult, with no hand on the wheel', artist: 'Classic technique',
    tags: ['lead', 'vibrato', 'patched'], level: 2,
    blurb: 'A warm, singing lead that slides between notes, with a vibrato that is always there.',
    how: 'On the Grandmother the MOD wheel brings in the LFO, so a vibrato normally needs a hand on it. Here the LFO is patched instead: WAVE OUT goes through the ATTENUATOR, which turns it right down, into the MULT, and from the MULT to both oscillators’ PITCH IN jacks. Two sawtooths a hair apart and GLIDE do the rest.',
    phrase: { bpm: 96, loop: true, steps: [[0, 67, 0.9], [1, 70, 0.4], [1.5, 72, 1.4], [3, 75, 0.4], [3.5, 72, 0.4], [4, 70, 1.8], [6, 67, 1.8]] },
    steps: [
      { title: 'Two sawtooths, slightly apart', module: 'osc', why: 'Two sawtooths at the same octave, a little out of tune with each other, beat slowly. That gives the lead its width and movement.\n- Oscillator 1 and 2 sawtooth, both OCTAVE 8’.\n- FREQUENCY +0.12: Oscillator 2 a fraction sharp. Too little to sound out of tune, enough to beat.\n- Mixer OSCILLATOR 1 and 2 at 6.\n- CUTOFF 5.5 (about 890 Hz), RESONANCE 2.5, ENVELOPE AMT +2.5, KBD TRACK 1:2: a half-open filter with a small push at the start of each note.\n- DECAY 5.5, SUSTAIN 6, RELEASE 4: the push settles to a held tone.\n- Listen for: a full, gently swirling tone.',
        set: { 'osc1.wave': 'saw', 'osc1.oct': '8', 'osc2.wave': 'saw', 'osc2.oct': '8', 'osc2.freq': 0.12, 'mix.osc1': 6, 'mix.osc2': 6, 'vcf.cutoff': 5.5, 'vcf.res': 2.5, 'vcf.env': 2.5, 'vcf.kbd': 'half', 'env.attack': 0, 'env.decay': 5.5, 'env.sustain': 6, 'env.release': 4 } },
      { title: 'LFO through the attenuator', module: 'util', why: 'The LFO’s WAVE OUT is at full depth, far too much for a vibrato. The ATTENUATOR turns it down.\n- Cable WAVE OUT (Modulation) → ATTENUATOR INPUT.\n- ATTENUATOR +0.15: just clockwise of 0, so only a few per cent of the LFO gets through. Anticlockwise would turn it upside down, which a vibrato does not mind.\n- LFO RATE 4.4 (about 5 Hz), WAVEFORM sine: a natural vibrato speed and shape.\n- Listen for: nothing yet. The attenuated LFO has nowhere to go.',
        set: { 'att.amount': 0.15, 'lfo.rate': 4.4, 'lfo.wave': 'sine' }, cables: [['j.lfo_out', 'j.att_in']] },
      { title: 'Split it to both oscillators', module: 'util', why: 'The MULT copies one signal to three jacks, so the turned-down LFO can reach both oscillators.\n- Cable ATTENUATOR OUTPUT → MULT (top left).\n- Cables MULT → OSC 1 PITCH IN and MULT → OSC 2 PITCH IN: both pitches move together, so the two stay in tune with each other.\n- GLIDE 4 (about 100 ms): each note slides from the last.\n- Reverb MIX 3: a short spring tail.\n- Listen for: a slight waver on the long notes, and notes sliding into each other. Turn the ATTENUATOR further and the vibrato widens.',
        set: { glide: 4, 'rev.mix': 3 }, cables: [['j.att_out', 'j.m1'], ['j.m2', 'j.osc1_pitch'], ['j.m3', 'j.osc2_pitch']] },
    ],
    context: {
      'att.amount': 'In this sound: the depth of the vibrato. At 0 the lead goes still.',
      glide: 'In this sound: how long each note takes to slide into the next.',
      'osc2.freq': 'In this sound: the slow beating between the oscillators.',
    },
    tweaks: [
      { id: 'att.amount', try: 'Raise to 0.5', hear: 'A wide, theatrical vibrato.' },
      { id: 'lfo.rate', try: 'Lower to 3.5', hear: 'A slow, lazy waver.' },
      { id: 'glide', try: 'Raise to 6', hear: 'Long, swooping slides.' },
    ],
  },
  {
    id: 'gm-filter-whistle', name: 'Filter Whistle', ref: 'The self-oscillating ladder filter played as an oscillator', artist: 'Classic technique',
    tags: ['lead', 'filter', 'sine'], level: 2,
    blurb: 'A pure, whistling tone with no oscillators at all: the filter ringing on its own.',
    how: 'With RESONANCE at full, the ladder filter rings at its cutoff even with nothing coming in, so it makes a near-sine tone of its own. KBD TRACK 1:1 moves the cutoff with the keys so it plays in tune, and GLIDE makes it slide like a theremin.',
    phrase: { bpm: 70, loop: true, steps: [[0, 72, 1.8], [2, 76, 0.9], [3, 79, 0.9], [4, 77, 1.8], [6, 74, 1.8]] },
    steps: [
      { title: 'Silence the mixer', module: 'mixer', why: 'All three mixer channels down, so nothing reaches the filter. The sound will come from the filter itself.\n- Mixer OSCILLATOR 1, OSCILLATOR 2 and NOISE at 0.\n- Listen for: nothing yet.',
        set: { 'mix.osc1': 0, 'mix.osc2': 0, 'mix.noise': 0 } },
      { title: 'Make the filter ring', module: 'filter', why: 'At full resonance the ladder filter feeds back on itself and rings at its cutoff: a pure, whistling tone.\n- RESONANCE 10: full. The filter now makes a sound with no input.\n- KBD TRACK 1:1: the cutoff moves with the keys, one octave per octave, so the whistle plays the notes.\n- CUTOFF 3.7 (about 260 Hz, near middle C): sets where the whistle sits, close to in tune with the keys.\n- ENVELOPE AMT 0: the envelope leaves the pitch alone.\n- Listen for: a clean, flute-like tone following the keys.',
        set: { 'vcf.res': 10, 'vcf.kbd': 'full', 'vcf.cutoff': 3.7, 'vcf.env': 0 } },
      { title: 'A soft start and a slide', module: 'glide', why: 'A soft start, a slide and a spring tail make the whistle sing.\n- ATTACK 3 (about 25 ms), SUSTAIN 10, RELEASE 5 (about 140 ms): a soft start and a short tail.\n- GLIDE 3: the whistle slides between notes, because the cutoff is following the keys through the glide.\n- Reverb MIX 4.\n- Listen for: a theremin-like line. Push the MOD wheel up with CUTOFF AMT at 1 for a vibrato through the filter.',
        set: { 'env.attack': 3, 'env.sustain': 10, 'env.release': 5, glide: 3, 'rev.mix': 4 } },
    ],
    context: {
      'vcf.res': 'In this sound: at full, which is what makes the filter whistle. Below about 9 it goes quiet.',
      'vcf.cutoff': 'In this sound: the tuning of the whistle.',
      'vcf.kbd': 'In this sound: 1:1, so the whistle plays the keys in tune.',
    },
    tweaks: [
      { id: 'vcf.kbd', try: 'Set to 1:2', hear: 'The whistle moves half as far: a squashed scale.' },
      { id: 'mix.osc1', try: 'Raise to 2', hear: 'Oscillator 1 under the whistle, coloured by the ringing filter.' },
      { id: 'vcf.cutoff', try: 'Turn slowly', hear: 'The whole line moves up or down in pitch.' },
    ],
  },
  {
    id: 'gm-fm-bell', name: 'Cross-Mod Bell', ref: 'Oscillator 1 patched into LIN FM IN', artist: 'Classic technique',
    tags: ['keys', 'fm', 'patched'], level: 3,
    blurb: 'A metallic, bell-like tone that rings and fades.',
    how: 'A cable from Oscillator 1’s WAVE OUT to Oscillator 2’s LIN FM IN makes Oscillator 1 bend Oscillator 2’s pitch hundreds of times a second. The ear hears that as new, clashing overtones rather than a wobble: a bell or gong. A plucked envelope with no sustain lets each note ring out.',
    phrase: { bpm: 80, loop: true, steps: [[0, 72, 0.5], [1, 79, 0.5], [2, 76, 0.5], [3, 84, 1.5]] },
    steps: [
      { title: 'Oscillator 2 alone', module: 'osc', why: 'Only Oscillator 2 is heard; Oscillator 1 will be the modulator, out of the mix.\n- Mixer OSCILLATOR 1 at 0, OSCILLATOR 2 at 8.\n- Oscillator 2 WAVEFORM triangle, OCTAVE 8’: a soft tone for the modulation to roughen.\n- Oscillator 1 WAVEFORM triangle, OCTAVE 4’: still running, an octave up, though not in the mix.\n- Listen for: a soft, plain tone.',
        set: { 'mix.osc1': 0, 'mix.osc2': 8, 'osc2.wave': 'tri', 'osc2.oct': '8', 'osc1.wave': 'tri', 'osc1.oct': '4' } },
      { title: 'Patch Oscillator 1 into LIN FM IN', module: 'mod', why: 'Oscillator 1 now moves Oscillator 2’s pitch at audio speed, which creates new overtones.\n- Cable OSC 1 WAVE OUT → OSC 2 LIN FM IN.\n- FREQUENCY +3: Oscillator 2 is no longer a simple ratio of Oscillator 1, so the new overtones clash like a bell rather than blending like an organ.\n- Listen for: a metallic, clangy tone. Move FREQUENCY and it changes from bell to gong to glass.',
        set: { 'osc2.freq': 3 }, cables: [['j.osc1_out', 'j.osc2_fm']] },
      { title: 'Let it ring', module: 'env', why: 'A bell has a hard strike and a long fade with no sustain.\n- ATTACK 0, DECAY 6.5 (about half a second), SUSTAIN 0, RELEASE 6.5.\n- CUTOFF 7.5 (about 3.6 kHz), ENVELOPE AMT +1.5: the filter mostly open, a little brighter at the strike.\n- Reverb MIX 4: the spring gives the bell a room.\n- Listen for: each note struck and fading away, metallic in the tail.',
        set: { 'env.attack': 0, 'env.decay': 6.5, 'env.sustain': 0, 'env.release': 6.5, 'vcf.cutoff': 7.5, 'vcf.env': 1.5, 'rev.mix': 4 } },
    ],
    context: {
      'osc2.freq': 'In this sound: the ratio between the oscillators, which decides how clangy the bell is.',
      'osc1.oct': 'In this sound: the modulator’s range. Lower is rougher, higher is glassier.',
      'env.decay': 'In this sound: how long each strike rings.',
    },
    tweaks: [
      { id: 'osc2.freq', try: 'Try 0, +3 and +5.5', hear: 'At 0 an organ-like tone; off the simple ratios, bells and gongs.' },
      { id: 'osc1.wave', try: 'Switch to sawtooth', hear: 'A harsher, noisier clang.' },
      { id: 'osc1.oct', try: 'Set to 16’', hear: 'A growling, rough modulation instead of a bell.' },
    ],
  },
];
