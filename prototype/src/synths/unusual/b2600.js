// Where the 2600 names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the 2600". See CONTRACT.md → Unusual notes for the writing rules.
const FREQ = 'There is no octave switch. One slider covers the whole range, marked in decades rather than notes, so tuning is done by ear or with a tuner. With the keyboard on, it sets the pitch of middle C and the keys play relative to that.';
const LF = 'Any of the three oscillators can become an LFO: this switch drops it to sub-audio speed and disconnects the keyboard. That gives the 2600 up to four LFOs, each with several waveforms at once, where most synths have one.';
const FM = 'ARP calls every pitch input "FM CONTROL". Each has its own slider and is pre-wired to a source; what most synths offer as a fixed "LFO to pitch" or "envelope to pitch" knob is here one slider among four.';
const KBD = 'The keyboard reaches each oscillator through a jack. Patching into it disconnects the keyboard from that oscillator only, which is how the 2600 plays a fixed drone oscillator against keyboard-controlled ones.';
const SYNC = 'Only VCO 2 and VCO 3 can be synced, and always to VCO 1. The synced oscillator follows VCO 1’s pitch and its own frequency slider becomes a tone control.';
const AUDIO_IN = 'The filter has its own five-channel mixer built in, one slider per source. Most synths put a separate mixer before the filter; here the sliders are part of the filter module.';
const ENV_TF = 'TIME FACTOR is rare: a switch that halves or doubles every stage of the envelope at once. It is quicker than moving four sliders when a sound needs to be snappier or slower.';

export default {
  'vco1.freq': FREQ,
  'vco2.freq': FREQ,
  'vco3.freq': FREQ,
  'vco1.range': LF,
  'vco2.range': LF,
  'vco3.range': LF,
  'vco1.fmLfo': FM,
  'vco2.fmVco1': 'The 2600 pre-wires one oscillator into the pitch of the next, VCO 1 into VCO 2, so audio-rate FM is one slider move away. Most subtractive synths need a cable or a mod matrix for that.',
  'vco3.fmVco2': 'VCO 2’s sine is pre-wired into VCO 3’s pitch. With VCO 2 in LF this is a second vibrato; at audio rate it is FM, all without a cable.',
  'vco2.sync': SYNC,
  'vco3.sync': SYNC,
  'vco2.pwm': 'The pulse-width modulation is pre-wired from noise, not an LFO. That gives a rough, breathy tone rather than the usual slow shimmer; patch an LFO into the PWM jack for the shimmer.',
  'j.vco1Kbd': KBD,
  'j.vco2Kbd': KBD,
  'j.vco3Kbd': KBD,
  'vcf.vco1': AUDIO_IN,
  'vcf.vco2': 'VCO 2 reaches the filter as its pulse wave only. For its sawtooth, triangle or sine, patch that output into this slider’s jack.',
  'vcf.vco3': 'VCO 3 reaches the filter as a sawtooth, where VCO 1 and VCO 2 arrive as pulses. To hear a different waveform, patch it into this jack.',
  'vcf.res': 'ARP printed RESONANCE where Moog printed EMPHASIS. The 2600’s filter self-oscillates cleanly at the top of the slider, and with KYBD CV at 10 it plays in tune as a fourth oscillator.',
  'vcf.mode': 'The two positions are two real filter circuits from the ARP’s history, not two filter types. The original 4012 was close enough to Moog’s ladder filter that ARP replaced it with the 4072 in the mid-1970s; the Behringer has both.',
  'vcf.kbd': 'Key tracking is a slider here, not a switch. At 10 it is exactly one octave of cutoff per octave played, which is what lets a self-oscillating filter play in tune.',
  'vca.gain': 'INITIAL GAIN is the 2600’s name for what other synths call VCA bias or drone: a standing level the envelopes add to. Leave it at 0 for normal playing.',
  'vca.ar': 'The VCA has two control inputs, one linear and one exponential, fed by the two envelopes. Most synths give the amplifier a single envelope; here you blend two.',
  'vca.adsr': 'An exponential VCA input makes an envelope’s fall sound natural (quick at first, then a long tail), where a linear input sounds more even. The 2600 lets you pick either by which slider you use.',
  'mix.vcf': 'The filter and the VCA sit side by side, not one after the other: the mixer can take the filter output directly. This is how the 2600 makes a filter drone under an enveloped note, or a note with no VCA at all.',
  'j.mixVcfPost': 'Taking a mixer channel out after its slider turns the mixer into two spare attenuators. On the 2600 that is the usual way to turn down a control voltage that has no slider of its own.',
  'env.src': 'Most synths fire their envelopes only from the keyboard. Here a three-way switch picks the keyboard gate, a short trigger, or the sample-and-hold clock, which turns the envelopes into a rhythm generator.',
  'env.manual': 'A button that fires the envelopes by hand is common on modulars and rare on keyboard synths. It lets you hear a patch without playing a note.',
  'adsr.time': ENV_TF,
  'ar.time': ENV_TF,
  'kbd.trig': 'SINGLE and MULT are ARP’s names for what most synths call legato and retrigger. SINGLE only restarts the envelopes on a key played with no other held.',
  'kbd.repeat': 'Keyboard repeat re-fires the envelopes at the LFO speed while you hold a key. Other synths hide this in an arpeggiator or a "repeat" mode; AUTO even runs it with no key held.',
  'kbd.voice': 'DUO gives the 2600 two voices from one keyboard, but it does not route the second voice anywhere by itself: you patch UPPER VOICE to an oscillator. Most duophonic synths do that routing for you.',
  'j.upper': 'The second voice exists only as a jack. Patching it into one oscillator’s KYBD CV input is what makes the 2600 duophonic.',
  'lfo.vibDelay': 'Delayed vibrato is common on string machines and organs but unusual on a monosynth. It only reaches the LFO SINE DELAYED jack; the pre-wired LFO to VCO 1 has no delay.',
  'j.lfoDelayed': 'The delayed vibrato is not pre-wired to anything. Patch this jack into an FM input to use it.',
  'ring.mode': 'A DC setting on a ring modulator is unusual. It lets a slow voltage pass, so the ring modulator can work as a simple extra VCA.',
  'j.ringA': 'Most jacks on this panel break the pre-wired connection. The two ring-mod inputs do not: a patched signal is added to the oscillator already there.',
  'noise.color': 'A continuous colour slider instead of a white/pink switch. The LOW FREQ end gives a slowly wandering rumble that is also useful as a random modulation voltage.',
  'sh.rate': 'The sample-and-hold’s clock does three jobs: it clocks the S&H, flips the electronic switch, and (with the routing switch on S/H CLOCK) fires the envelopes.',
  vp: 'Voltage processor is ARP’s name for a utility block: here two inverting mixers and a slew limiter, which ARP calls a lag processor. The −10 V and +10 V inputs are normalled to fixed voltages, so the sliders double as offset controls.',
  'vp.lag': 'LAG is ARP’s word for a slew limiter: other synths call this glide, slew or portamento when it is on pitch.',
  esw: 'An electronic switch is rare on a synth this size. Clocked by the sample-and-hold, it alternates two signals, such as two pitches for a trill or two sounds for a stereo-style ping-pong.',
  'j.postMix': 'The label says POST-MIXER OUTPUT but the jack is an input: it breaks the connection from the mixer to PAN. The reverb is fed separately, so it still hears the mixer.',
  kbd: 'This 2600 has no keyboard of its own. The section takes MIDI and gives the same control voltages ARP’s 3620 keyboard did, including a second voice for duophonic playing.',
};
