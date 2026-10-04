// What the Buchla Music Easel names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  lpg: 'There is no separate filter and VCA: a lowpass gate is both, controlled by one LEVEL. Its light-dependent resistor (a vactrol) is quick to open and slow to close, which is what gives Easel notes their natural, plucked fall.',
  'lpg1.mode': 'Combination is the classic lowpass-gate setting: quieter is also duller, as with a plucked string. Most synths need a filter envelope and an amplifier envelope to do this.',
  'cosc.timbre': 'TIMBRE adds harmonics by folding the wave back on itself, the opposite of a filter, which takes them away. It is the Easel’s brightness control.',
  'lpg1.levelCv': 'Every voltage-controlled setting has two sliders: the offset (the setting with nothing patched) and this processing slider, which scales whatever is patched into the black jack below. Most synths call the second one a CV amount or attenuator.',
  'cosc.pitchCv': 'This processing slider is the scaling of the PITCH input. There is no fixed volt-per-octave: you set the interval yourself, so the same sequence can play semitones, octaves or microtones.',
  'env.sustain': 'Not a sustain level: on the Easel the middle slider is a time, how long the envelope holds at the top in transient mode. The envelope always rises to full.',
  'env.attack': 'The time sliders are printed in seconds and run upside down: the top is the fastest (2 ms) and the bottom the slowest (10 seconds).',
  pulser: 'The pulser does the job of an LFO and a clock, but it is a one-shot ramp: each trigger starts a falling ramp, and its end sends a pulse. Set to self, it restarts itself.',
  mosc: 'The modulation oscillator is a second oscillator rather than an LFO: in its high range it does audio-rate FM, AM and ring modulation, and it can be heard on its own through Gate 2.',
  'mosc.index': 'Modulation depth is called the index, as in FM theory: .2 is a gentle vibrato, 1.0 full modulation.',
  'cosc.kbd': 'The oscillators only follow the keyboard through these switches. The lowest key plays the PITCH slider’s note, and keys count up from there.',
  'cosc.sign': 'Polarity flips the PITCH input, so a rising voltage can lower the pitch. Most synths would need an inverter for this.',
  'j.env1': 'Jacks are coded by colour: orange envelope, yellow pulser, blue sequencer, white random, violet pressure, black for inputs. Banana plugs stack, so one output can feed several inputs at once.',
  kbdin: 'Controls travel on banana jacks and audio on mini jacks, and the two are kept apart: a control voltage cannot be patched into an audio input by mistake.',
  presets: 'The touch keyboard has no moving parts. Its preset plates are a second, small keyboard of four voltages you set yourself, often used to switch a setting or transpose at a touch.',
  'lpg.src': 'At series, Gate 1 feeds Gate 2 and both are heard. The gates turn their signals upside down, so mixing both channels partly cancels: an Easel trick for thin, phased sounds.',
};
