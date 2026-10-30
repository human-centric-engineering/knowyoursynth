/**
 * Model 15 signal routing, projected from its spec (`.context/app/synth-data/model-15/model-15.synth.json`, 0.10.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/model-15.ts`).
 *
 * Where the definition says more than the spec, it decides. Mixer channel 3 is the sub-oscillator only on the SUB
 * positions of OSC 2's waveform switch (`c08`); elsewhere it is the white noise, a feed the spec has no connection
 * for, so it is not drawn and the noise block stays dark while it is heard there. The LFO's routes are its AMOUNT
 * knobs times MODULATION, PITCH MOD squared, as `toEngine()` builds them (there is no mod wheel). The mixer levels
 * and ENV AMT are curved as `toEngine()` curves them. In RELEASE mode the VCA follows a gate with the envelope's
 * release on the end, so the envelope still feeds it (`c12`). REVERB MIX is a dry/wet blend inside the reverb, so the
 * reverb is always on the path (`c14`). The arpeggiator, its jacks and glide sit on the MIDI block, which plays the
 * notes it makes; the spec wires nothing from it.
 *
 * Normals: MIX 1–3, FILTER, VCA, REVERB, ENV TRIG and ATT each replace what is wired behind them. AUDIO IN takes
 * mixer channel 3's place too, but only MIX 3 can break `c08`. The high-pass filter and the multiples carry only
 * what is patched into them.
 */
import type { RoutingEdge, RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';

const PITCH_MOD: RoutingLevel[] = [{ id: 'lfo.pitch', pow: 2 }, 'mod.amount'];
const PW_MOD: RoutingLevel[] = ['lfo.pw', 'mod.amount'];
const OSC_WAVES = { label: 'Waveforms', value: 'Triangle, sawtooth, square, narrow pulse' };
/** One of the mixer's three channels, broken by its input jack. */
const channel = (id: string, from: string, level: string, jack: string): RoutingEdge => ({
  id,
  from,
  to: 'mixer',
  signal: 'audio',
  levels: [{ id: level, pow: 1.7 }],
  breaks: jack,
});

export const routing: SynthRouting = {
  synth: 'model-15',
  out: 'out',
  blocks: [
    {
      id: 'midi',
      name: 'MIDI and arpeggiator',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'glide',
        'arp.play',
        'arp.hold',
        'arp.tap',
        'arp.rate',
        'arp.mode',
        'arp.dir',
        'arp.oct',
      ],
      description:
        'Turns MIDI notes into pitch, gate and velocity, through the arpeggiator or sequencer when it runs, with GLIDE between notes.',
      specs: [
        { label: 'Sequences', value: '3' },
        { label: 'Sequence steps', value: '256' },
        { label: 'Arpeggio range', value: '1 to 3 octaves' },
      ],
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.wave', 'lfo.pitch', 'lfo.pw', 'lfo.filter', 'mod.amount'],
      description:
        'An LFO that reaches audio rates, sent to the oscillators’ pitch and pulse width and to the cutoff by its AMOUNT knobs, all scaled by MODULATION.',
      specs: [
        { label: 'Rate', value: '0.07 Hz to 1.3 kHz' },
        { label: 'Shapes', value: 'Sine, sawtooth, ramp, square' },
      ],
    },
    {
      id: 'snh',
      name: 'Sample and hold',
      module: 'lfo',
      description:
        'Samples the white noise at each zero crossing of the LFO. It is wired to nothing inside: patch S&H.',
      specs: [{ label: 'Output', value: '10 Vpp' }],
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.oct', 'osc1.wave', 'osc.fine'],
      description: 'The first oscillator, and the one Oscillator 2 syncs to.',
      specs: [{ label: 'Octaves', value: "32', 16', 8', 4'" }, OSC_WAVES],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2 and sub',
      module: 'osc',
      meter: 'osc2',
      controls: ['osc2.oct', 'osc2.freq', 'osc2.wave', 'osc2.sync', 'osc.fine'],
      description:
        'A second oscillator with a FREQUENCY knob to detune it, hard sync to Oscillator 1, a linear FM input and a sub-oscillator.',
      specs: [
        { label: 'Octaves', value: "16', 8', 4', 2'" },
        { label: 'Detune', value: '±7 semitones' },
        OSC_WAVES,
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White and pink noise. The white noise feeds the sample and hold.',
      specs: [
        { label: 'Colours', value: 'White, pink' },
        { label: 'Output', value: '10 Vpp' },
      ],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: ['mix.1', 'mix.2', 'mix.3'],
      passes: true,
      description:
        'Three channels into the filter, each with an input jack that replaces what is wired to it. Channel 3 is the white noise, or the sub-oscillator on the SUB waveforms.',
      specs: [{ label: 'Channels', value: 'Oscillator 1, Oscillator 2, sub or white noise' }],
    },
    {
      id: 'hpf',
      name: 'High pass filter',
      module: 'filter',
      controls: ['hpf.cutoff'],
      passes: true,
      description:
        'A separate high-pass filter, in the path only when something is patched into it.',
      specs: [{ label: 'Slope', value: '6 dB per octave' }],
    },
    {
      id: 'vcf',
      name: 'Ladder filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.env', 'vcf.kbd'],
      description:
        'A resonant ladder low-pass with an envelope amount either way and keyboard tracking.',
      specs: [
        { label: 'Slope', value: '24 dB per octave' },
        { label: 'Cutoff', value: '20 Hz to 20 kHz' },
        { label: 'Key tracking', value: 'Off, 1:2 or 1:1' },
      ],
    },
    {
      id: 'env',
      name: 'Envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env.attack', 'env.decay', 'env.sustain', 'env.release'],
      description:
        'An ADSR envelope for the cutoff and the VCA, with an upside-down output. It fires from the keys unless ENV TRIG is patched.',
      specs: [
        { label: 'Attack', value: '2 ms to 16 s' },
        { label: 'Decay', value: '2 ms to 40 s' },
        { label: 'Sustain', value: '0 to 8 V' },
        { label: 'Release', value: '2 ms to 20 s' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.mode'],
      description:
        'ENV follows the envelope, RELEASE opens fully while a key is held and closes with the envelope’s release, ON stays open.',
    },
    {
      id: 'reverb',
      name: 'Reverb',
      module: 'fx',
      controls: ['rev.mix'],
      description:
        'A spring reverb emulation, fed from the VCA unless REVERB is patched. MIX blends it with the dry sound.',
    },
    {
      id: 'ref',
      name: 'Attenuator reference',
      module: 'patch',
      description: 'A steady positive voltage wired to the attenuator’s input.',
    },
    {
      id: 'att',
      name: 'Attenuator',
      module: 'patch',
      controls: ['att.amount'],
      passes: true,
      description:
        'Scales what is patched in, or turns it upside down; with nothing patched, a steady voltage set by the knob.',
      specs: [{ label: 'Range', value: 'Inverted to unity, off at centre' }],
    },
    {
      id: 'mult1',
      name: 'Multiple 1',
      module: 'patch',
      passes: true,
      description: 'Three joined jacks that copy one signal to two places.',
    },
    {
      id: 'mult2',
      name: 'Multiple 2',
      module: 'patch',
      passes: true,
      description: 'Three joined jacks that copy one signal to two places.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'The reverb’s blend of dry and wet sound, at the VOLUME setting.',
      specs: [
        { label: 'Main output', value: '1/4" TS, up to +5.8 dBu; 3.5 mm on the patch bay' },
        { label: 'Phones', value: '1/4" TRS, 7.5 mW into 32 Ω' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'midi', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'midi', to: 'osc2', signal: 'cv', label: 'pitch' },
    {
      id: 'c03',
      from: 'midi',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      when: { id: 'vcf.kbd', in: ['half', 'full'] },
    },
    { id: 'c04', from: 'midi', to: 'env', signal: 'gate', breaks: 'j.env_trig' },
    {
      id: 'c05',
      from: 'osc1',
      to: 'osc2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: true },
    },
    channel('c06', 'osc1', 'mix.1', 'j.mix1'),
    channel('c07', 'osc2', 'mix.2', 'j.mix2'),
    {
      ...channel('c08', 'osc2', 'mix.3', 'j.mix3'),
      label: 'sub',
      when: { id: 'osc2.wave', in: ['tri+sub', 'saw+sub', 'sq+sub', 'narrow+sub'] },
    },
    { id: 'c09', from: 'mixer', to: 'vcf', signal: 'audio', breaks: 'j.filter_in' },
    { id: 'c10', from: 'vcf', to: 'vca', signal: 'audio', breaks: 'j.vca_in' },
    {
      id: 'c11',
      from: 'env',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.env', off: 0, pow: 1.4 }],
    },
    {
      id: 'c12',
      from: 'env',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'vca.mode', in: ['env', 'release'] },
    },
    { id: 'c13', from: 'vca', to: 'reverb', signal: 'audio', breaks: 'j.rev_in' },
    { id: 'c14', from: 'reverb', to: 'out', signal: 'audio' },
    { id: 'c15', from: 'lfo', to: 'osc1', signal: 'cv', label: 'pitch', levels: PITCH_MOD },
    { id: 'c16', from: 'lfo', to: 'osc2', signal: 'cv', label: 'pitch', levels: PITCH_MOD },
    { id: 'c17', from: 'lfo', to: 'osc1', signal: 'cv', label: 'pulse width', levels: PW_MOD },
    { id: 'c18', from: 'lfo', to: 'osc2', signal: 'cv', label: 'pulse width', levels: PW_MOD },
    {
      id: 'c19',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['lfo.filter', 'mod.amount'],
    },
    { id: 'c20', from: 'ref', to: 'att', signal: 'cv', breaks: 'j.att_in' },
    { id: 'c21', from: 'noise', to: 'snh', signal: 'cv', label: 'sampled' },
    { id: 'c22', from: 'lfo', to: 'snh', signal: 'gate', label: 'clock' },
  ],
  jacks: {
    'j.velocity': 'midi',
    'j.note_cv': 'midi',
    'j.gate_out': 'midi',
    'j.sync_out': 'midi',
    'j.arp_sync': 'midi',
    'j.arp_reset': 'midi',
    'j.arp_on': 'midi',
    'j.lfo_trig': 'lfo',
    'j.lfo_rate': 'lfo',
    'j.lfo_out': 'lfo',
    'j.sh_out': 'snh',
    'j.osc1_out': 'osc1',
    'j.osc1_cv': 'osc1',
    'j.osc1_pwm': 'osc1',
    'j.osc2_out': 'osc2',
    'j.sub_out': 'osc2',
    'j.osc2_cv': 'osc2',
    'j.osc2_fm': 'osc2',
    'j.white': 'noise',
    'j.pink': 'noise',
    'j.mix1': 'mixer',
    'j.mix2': 'mixer',
    'j.mix3': 'mixer',
    'j.audio_in': 'mixer',
    'j.mixer_out': 'mixer',
    'j.hp_in': 'hpf',
    'j.hp_out': 'hpf',
    'j.filter_in': 'vcf',
    'j.filter_out': 'vcf',
    'j.env_amt': 'vcf',
    'j.cutoff': 'vcf',
    'j.env_trig': 'env',
    'j.env_out': 'env',
    'j.env_inv': 'env',
    'j.vca_in': 'vca',
    'j.vca_cv': 'vca',
    'j.vca_out': 'vca',
    'j.rev_in': 'reverb',
    'j.rev_out': 'reverb',
    'j.att_in': 'att',
    'j.att_out': 'att',
    'j.m1a': 'mult1',
    'j.m1b': 'mult1',
    'j.m1c': 'mult1',
    'j.m2a': 'mult2',
    'j.m2b': 'mult2',
    'j.m2c': 'mult2',
    'j.audio_out': 'out',
  },
  omitted: {
    arpseq:
      'Drawn as part of the MIDI block: the spec wires nothing from it, and it plays the notes the MIDI block sends on.',
  },
};
