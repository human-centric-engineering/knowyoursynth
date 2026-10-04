// Where the Pro-1 names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the Pro-1". See CONTRACT.md → Unusual notes for the writing rules.
const ROUTE = 'WHEEL and DIRECT are two shared buses, not settings that belong to this source alone. Everything sent to WHEEL is scaled together by the mod wheel, so one push of the wheel can bring in several kinds of modulation at once.';
const DEST = 'Destination switches choose a bus, not a source. If two sources are on the same bus, this destination gets both of them mixed together.';
const WAVE_SWITCH = 'Each waveform has its own on/off switch, where most synths have a selector that allows one at a time. Switch two on and they are added together, which gives tones a selector cannot. With all of them off the oscillator is silent.';
const LFO_SWITCH = 'As on the oscillators, the LFO shapes are separate switches and can be combined. Triangle and pulse together, for example, give a wobble that also steps up and down.';
const OCTAVE = 'Octaves are numbered 0 to 3, where Moog-style panels use organ feet. One step here is the same as going from 16’ to 8’ there.';

export default {
  'mod.envAmt': 'There is no separate modulation envelope. The filter envelope does both jobs, so a pitch sweep or sync sweep always has the same shape as the filter movement.',
  'mod.oscBAmt': 'Using an audio oscillator as a modulation source is what Sequential called Poly-Mod on the Prophet-5. At audio rate it is frequency modulation, the same principle as a Yamaha DX7, done with analogue parts.',
  'mod.envRoute': ROUTE,
  'mod.oscBRoute': ROUTE,
  'mod.lfoRoute': ROUTE,
  'mod.toAFreq': DEST,
  'mod.toAPw': DEST,
  'mod.toBFreq': DEST,
  'mod.toBPw': DEST,
  'mod.toFilter': DEST,
  'oscA.octave': OCTAVE,
  'oscB.octave': OCTAVE,
  'oscA.saw': WAVE_SWITCH,
  'oscA.pulse': WAVE_SWITCH,
  'oscB.saw': WAVE_SWITCH,
  'oscB.tri': WAVE_SWITCH,
  'oscB.pulse': WAVE_SWITCH,
  'oscA.sync': 'The direction is the reverse of most synths, where oscillator 2 is synced to oscillator 1. Here A, the first oscillator, is the one that gets reset, and B is in charge. So for a sync sweep you move A, and B sets the note.',
  'oscB.lo': 'Together with the KEYBOARD switch this turns a whole audio oscillator into a second LFO, with three shapes and a pulse-width knob, which is more than the real LFO has. The cost is that the sound is left with one oscillator.',
  'oscB.kbd': 'Most synths only have keyboard tracking on the filter. Here it is on an oscillator: switched off, Oscillator B ignores the keys and stays where FREQUENCY and OCTAVE put it, as a drone or a modulator.',
  'glide.mode': 'AUTO is what other synths call legato or fingered portamento.',
  'lfo.rate': 'The section is marked LFO/CLOCK because the same oscillator also sets the tempo of the sequencer, the arpeggiator and REPEAT. Vibrato speed and tempo therefore cannot be set separately.',
  'lfo.saw': LFO_SWITCH,
  'lfo.tri': LFO_SWITCH,
  'lfo.pulse': LFO_SWITCH,
  'mode.retrig': 'Other synths call these single trigger (NORMAL) and multiple trigger (RETRIG), or have a legato switch.',
  'mode.repeat': 'In effect the LFO becomes a gate generator. The ARP Odyssey does the same with its LFO REPEAT switch; on most other synths you would need an arpeggiator on one held note to get it.',
  'mode.drone': 'Other synths have a HOLD switch or a VCA level knob for this. This one works by holding the gate open, so the two SUSTAIN knobs set how loud and how bright the drone is.',
  'filter.kbd': 'A continuous knob, where Minimoog-style panels have two switches worth a third and two thirds. Settings part of the way up are useful: basses stay round at the bottom while the top of the keyboard stays bright.',
  'j.resoCv': 'Voltage-controlled resonance is rare on synths of this kind, where resonance is almost always a knob and nothing more.',
  modulation: 'Most synths wire the mod wheel to LFO vibrato and nothing else. Here any of three sources can be put on the wheel and any of five destinations can listen to it, so the wheel can bring in a sync sweep, a filter growl or pulse-width movement. It is a small modulation matrix, merged from the Prophet-5’s separate Poly-Mod and Wheel-Mod sections.',
  lfo: 'The section is marked LFO/CLOCK because the same oscillator also sets the tempo of the sequencer, the arpeggiator and REPEAT.',
  filter: 'A 24 dB per octave low-pass, like a Moog’s, but built round a Curtis filter chip and not a transistor ladder. It is the same filter design as the later Prophet-5s, which is a large part of why the two sound related.',
};
