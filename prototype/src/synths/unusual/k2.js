// Where the K-2 names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the K-2". See CONTRACT.md → Unusual notes for the writing rules.
const PEAK = 'PEAK is Korg’s word for resonance. Most synths call it resonance, emphasis or Q. There are two of them here, one per filter, which is one more than almost any other monosynth gives you.';
const MG_EXT = 'The knob is marked MG/T.EXT, not "LFO amount". MG is the modulation generator — Korg’s name for the LFO — and T.EXT means the TOTAL external input takes its place the moment a cable goes into that socket. The knob controls whichever of the two is live.';
const EG_EXT = 'The EXT half of the name means the socket beside this section on the patch panel replaces the envelope as the source. The knob is a depth control for whatever is arriving, not for the envelope specifically.';
const SCALE = 'SCALE is Korg’s word for the octave switch, and it is marked in organ-pipe feet. Note that the two oscillators do not share a range: Oscillator 1 runs 32′ to 4′ and Oscillator 2 runs 16′ to 2′, an octave higher across the board.';

export default {
  'vco1.wave': 'The fourth position on this switch is not a waveform. It disconnects the oscillator and puts the noise generator in its place, so VCO1 LEVEL becomes the noise level. Most synths give noise its own mixer channel alongside the oscillators; here it costs you an oscillator.',
  'vco2.wave': 'The fourth position, RING, is not a waveform either. It replaces Oscillator 2’s output with the two oscillators multiplied together. Because Oscillator 1 is one of the two inputs, turning Oscillator 1 down in the mixer still changes the ring tone — the two controls are not independent the way they look.',
  'vco1.scale': SCALE,
  'vco2.scale': SCALE,
  'vco1.pw': 'There is no pulse-width modulation anywhere on this instrument: no PWM knob, and no socket for it on the patch panel. The width is set by hand and stays there.',
  'vco2.pitch': 'Oscillator 2 has a PITCH knob but no fine-tune. The panel is marked −5 to +5 with no unit, and Behringer’s manual never says how far it goes in semitones.',
  'hpf.peak': PEAK,
  'lpf.peak': PEAK,
  'lpf.type': 'A switch between two filter circuits, which almost no other synth offers. The manual says only "filter type 1 or 2" and never explains the difference; on the MS-20 this is the early Korg 35 design against the later discrete one, and they part company at high resonance. It governs both filters, not just the low-pass it sits next to.',
  'fmod.mg': MG_EXT,
  'hpmod.mg': MG_EXT,
  'lpmod.mg': MG_EXT,
  'fmod.eg1': EG_EXT,
  'hpmod.eg2': EG_EXT,
  'lpmod.eg2': EG_EXT,
  'mg.wave': 'One knob shapes two outputs at once, and it morphs rather than switches. Turning it takes the first output from reverse sawtooth through triangle to sawtooth while the second goes from a wide pulse through square to a narrow one. You cannot set the two independently, and both are always live on their own sockets.',
  'eg1.delay': 'A delay stage before the attack is rare on a monosynth. It exists because envelope 1 is wired to oscillator pitch, so the delay lets a pitch sweep arrive part way through a held note rather than at the start of it.',
  'eg2.hold': 'A hold stage between attack and decay is unusual. The manual contradicts itself about what HOLD acts on: the walkthrough describes it as extending the trigger, which would affect both envelopes, while the specifications list it as envelope 2’s own hold time. This app follows the specifications.',
  'trig.sw': 'Besides firing a trigger, this button is how the instrument is configured: pressed four times quickly at power-up, while the lamp is flashing, it toggles poly chain mode, where several K-2s share the notes arriving over MIDI.',
  'j.total': 'One socket that re-sources four knobs at once. Patching here replaces the modulation generator everywhere it is used — both oscillators and both filters — rather than at one destination. Most patch panels give you one input per destination.',
  'j.freq': 'Note which way round this works. The socket does not add to envelope 1; it takes envelope 1’s place at the EG1/EXT knob. Pull the cable and the envelope comes back.',
  'j.cutoffLp': 'The MS-20’s most-used socket. With a sequencer or a second envelope here instead of envelope 2, the filter moves to a pattern of its own while the amplifier still follows the keys.',
  'j.mgPulse': 'The modulation generator has two outputs at once, not one shape at a time. This one never goes below zero, which is why it works as a clock or a trigger where the other output would not.',
  'j.eg1Rev': 'The instrument gives you envelope 1 both ways up, but envelope 2 only upside down — there is no socket for envelope 2 the right way up anywhere on the panel. To use envelope 2 elsewhere you take the inverted output and invert it again.',
  'j.eg2Rev': 'The only socket for envelope 2, and it is the inverted one. Envelope 2 reaches the filters and the amplifier through the panel knobs instead.',
  'j.kbdCv': 'Korg used volts-per-Hertz scaling on the MS-20, not the volts-per-octave that the rest of the industry settled on, so MS-20 pitch voltages do not interchange with Moog or Eurorack gear without a converter. Behringer’s manual calls the response exponential but does not say which standard the K-2 follows.',
  'j.espIn': 'A whole subsection of the patch panel exists to let an outside sound play the synth: preamp, band-pass filter, pitch extraction, envelope follower and trigger. It is the reason MS-20 owners plugged guitars and microphones into a synthesizer, and very few instruments since have offered it.',
  'esp': 'Almost nothing else at this price has an external signal processor. It turns an incoming sound into a pitch voltage, an envelope and a trigger, so a guitar, a drum or a voice can play the oscillators and open the filters.',
  'hpf': 'Two resonant filters in series, each with its own cutoff and resonance, is the thing that makes this instrument sound like itself. Nearly every other monosynth has one filter with a mode switch; here you can close the two in on each other and leave a narrow, vocal band.',
  'patchsig': 'The panel prints the whole voice as a block diagram and puts a socket under each place you can interrupt it. Reading the picture tells you what every cable will do before you plug it in, which is why this instrument turns up in classrooms.',
};
