// Where the Neutron names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the Neutron". See CONTRACT.md → Unusual notes for the writing rules.
const SHAPE = 'Most analogue synths have a switch between fixed waveforms. Here SHAPE is a continuous knob that blends each wave into the next, and it can be moved by a voltage at the SHAPE jack, which is closer to a wavetable synth than a classic analogue. "Tone mod" at the far left is the Neutron’s own wave: a pulse-based shape whose tone changes with WIDTH.';
const WIDTH = 'There is no knob marked PWM anywhere on the panel. Pulse-width modulation is there, but hidden: the LFO reaches both WIDTH inputs through Attenuator 2, so the ATT 2 knob is the PWM depth. Because SHAPE blends waves, WIDTH also colours the positions between tone mod and sawtooth, not only the pulse.';
const RANGE = 'One button steps through the settings and the lamps show which is active, where older synths use a rotary switch marked in feet. The ±10 octave setting is rare: it lets an audio oscillator fall to LFO speeds, so either oscillator can work as a second LFO.';
const TUNE = 'About an octave each way is far wider than the fine-tune knob on most synths. It is easy to knock out of tune, and just as easy to set an interval such as a fifth against the other oscillator.';
const ENV1 = 'The envelopes are numbered, not named. Envelope 1 is what other synths call the amp or VCA envelope, but only by default: a cable into VCA CV replaces it, and then Envelope 1 is free for any other job.';
const ENV2 = 'The envelopes are numbered, not named. Envelope 2 is what other synths call the filter envelope, but it is also the default signal at the inverter, and its jack can send it to pitch, pulse width or anywhere else.';
const EGATE = 'E. GATE is short for envelope gate; other gear marks this GATE IN or TRIG IN. Each envelope has its own, so the two can be fired by different things: the keys for one and the LFO for the other, for example.';

export default {
  'osc1.shape': SHAPE,
  'osc2.shape': SHAPE,
  'osc1.width': WIDTH,
  'osc2.width': WIDTH,
  'osc1.range': RANGE,
  'osc2.range': RANGE,
  'osc1.tune': TUNE,
  'osc2.tune': TUNE,
  'osc.mix': 'A crossfader, where most synths have a level knob for each oscillator. You cannot have both at full level, but the mix never gets louder as you blend, and one turn of the knob lets you hear either oscillator alone.',
  'osc.para': 'Paraphonic sits between monophonic and polyphonic. A polyphonic synth gives every note its own filter and envelopes. Here two notes share one of each, so a second note played while the first is held does not get its own attack. The ARP Odyssey’s two-note mode and the string machines of the 1970s worked the same way.',
  'vcf.mode': 'This is a 12 dB per octave filter, gentler than the 24 dB per octave filter on Moog-style synths. It leaves more brightness above the cutoff, so it sounds buzzier and less rounded. Having a second filter type available at the same time, at the VCF 2 jack, is unusual on a synth of this size.',
  'vcf.keyTrk': 'A switch, where most synths have a knob: tracking is either off or full.',
  'vcf.modDepth': 'On most synths this knob would be marked LFO amount. It is named after the FREQ MOD jack instead, because the LFO is only what is connected to it by default.',
  'vca.bias': 'Other makers call this VCA initial level or VCA gain, or fit a HOLD or DRONE switch in its place. Because it is a knob, not a switch, a small amount can also be used to stop notes ever fading to complete silence.',
  'lfo.keySync': 'Usually called LFO retrigger, key trigger or LFO reset.',
  'lfo.rate': 'Most LFOs stop somewhere around 20 to 50 Hz. This one carries on well into the audio range, so it can be used as a third oscillator for FM-style tones.',
  'lfo.shape': 'A morphing knob, like the oscillators’ SHAPE, where most synths have a waveform switch. In-between positions give shapes that have no name, such as a triangle that leans towards a sawtooth.',
  'delay.time': 'This is an analogue bucket-brigade delay, the kind found in guitar pedals, not a digital one. That is why the echoes get darker with each repeat and why turning TIME bends their pitch. It is unusual to find one built into a synth.',
  'od.level': 'In effect a guitar overdrive pedal wired permanently into the signal path, between the filter and the amplifier. It cannot be bypassed: with DRIVE at minimum it is close to clean, and LEVEL then works as a second volume control.',
  'env1.a': ENV1, 'env1.d': ENV1, 'env1.s': ENV1, 'env1.r': ENV1,
  'env2.a': ENV2, 'env2.d': ENV2, 'env2.s': ENV2, 'env2.r': ENV2,
  'sh.rate': 'On most synths sample-and-hold is just one of the LFO’s wave shapes and runs at the LFO’s speed. Here it is a separate module with its own clock, input and output, so it can take readings of any signal, not only noise, at a speed of its own.',
  'sh.glide': 'Elsewhere this is called lag or slew. Turned up, it changes the stepped random voltage into a smoothly wandering one, which many synths offer as a separate "smooth random" LFO shape.',
  'slew.time': 'Also known as a lag processor. It is the circuit inside every portamento control, offered here by itself so that it can smooth any signal: it will round off a square LFO, for example.',
  'porta.time': 'Portamento and glide are two names for the same thing. It sits in the slew section because it is the same circuit, wired permanently to the keyboard pitch.',
  'att.1': 'An attenuator whose level can be set by a voltage is a VCA, so this is a spare amplifier for control signals. Patch an envelope into ATT1 CV and whatever passes through fades in and out with that envelope.',
  'att.2': 'This is the Neutron’s hidden PWM depth control. Most synths put a knob marked PWM beside each oscillator; here the LFO reaches both pulse-width inputs through this attenuator.',
  'j.assign': 'On the hardware this output can be set, from Behringer’s control app, to carry note pitch, velocity, mod wheel, aftertouch and other MIDI values. It stands in for the extra outputs of a MIDI-to-CV converter.',
  'j.lfoUni': 'Most LFO outputs swing above and below zero (bipolar). This second copy only goes upwards from zero (unipolar), which suits inputs that should be pushed one way only, such as VCA CV.',
  'j.gate1': EGATE,
  'j.gate2': EGATE,
  env1: 'The envelopes are numbered, not named. This one is what other synths call the amp or VCA envelope, but only because of how it is wired inside; the patch bay can change that.',
  env2: 'The envelopes are numbered, not named. This one is what other synths call the filter envelope, but only because of how it is wired inside; the patch bay can change that.',
  sh: 'On most synths sample-and-hold is one of the LFO’s shapes. Here it is a module of its own, with its own clock, which is how it was done on large modular systems and the ARP 2600.',
  atten: 'There is no knob marked PWM on the Neutron. Attenuator 2 is that knob: it sets how much LFO reaches both oscillators’ pulse-width inputs.',
  bayIn: 'Semi-modular means the synth is already wired inside and plays with no cables at all. Each socket only overrides or adds to one of those built-in connections. On a full modular nothing sounds until you patch it.',
};
