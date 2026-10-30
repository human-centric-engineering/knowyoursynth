/**
 * Grandmother signal routing, projected from its spec (`.context/app/synth-data/grandmother/grandmother.synth.json`,
 * 0.10.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/grandmother.ts`).
 *
 * Where the definition says more than the spec, it decides. The dry sound is crossfaded against the spring by MIX
 * (`toEngine()` gives it 1 − MIX), so the dry path (`c17`) goes dark at MIX fully up, which the spec draws fixed. The
 * LFO's routes are its AMOUNT knobs times the mod wheel, PITCH AMT squared, as `toEngine()` builds them. The
 * keyboard's pitch and bend (`c01`–`c04`) are drawn fixed: the definition has no LOCAL or bend-range setting. The
 * mixer levels and ENVELOPE AMT are curved as `toEngine()` curves them. The arpeggiator and glide sit on the keyboard
 * block, where the spec files them.
 *
 * Normals: MIX 1–3, FILTER IN, VCA IN, REVERB IN, TRIGGER IN and the attenuator's INPUT each replace what is wired
 * behind them. The rear INSTRUMENT IN is left out (the definition has no jack for it). The high-pass filter and the
 * mult carry only what is patched into them.
 */
import type { RoutingEdge, RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const PITCH_MOD: RoutingLevel[] = [{ id: 'lfo.pitch', pow: 2 }, WHEEL];
const PW_MOD: RoutingLevel[] = ['lfo.pw', WHEEL];
const OSC_WAVES = { label: 'Waveforms', value: 'Triangle, saw, square, narrow pulse (25%)' };
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
  synth: 'grandmother',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and left-hand controller',
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
        'The keys, MIDI, the wheels, GLIDE and the arpeggiator and sequencer, giving the pitch, gate and velocity the patch plays from.',
      specs: [
        { label: 'Keys', value: '32, velocity sensing' },
        { label: 'Sequences', value: '3' },
        { label: 'Sequence steps', value: '256' },
        { label: 'Tempo', value: '20 to 280 BPM' },
      ],
    },
    {
      id: 'lfo',
      name: 'Modulation',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.wave', 'lfo.pitch', 'lfo.cutoff', 'lfo.pw'],
      description:
        'An LFO that reaches audio rates, sent to the oscillators’ pitch and pulse width and to the cutoff by its AMOUNT knobs and the mod wheel.',
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
        'Samples the noise at each zero crossing of the LFO. It is wired to nothing inside: patch S/H OUT.',
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.oct', 'osc1.wave'],
      description: 'The first oscillator, and the one Oscillator 2 syncs to.',
      specs: [{ label: 'Octaves', value: "32', 16', 8', 4'" }, OSC_WAVES],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      controls: ['osc2.oct', 'osc2.freq', 'osc2.wave', 'osc2.sync'],
      description:
        'A second oscillator with a FREQUENCY knob to detune it, hard sync to Oscillator 1 and a linear FM input.',
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
      description: 'White noise, into the mixer and the sample and hold.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: ['mix.osc1', 'mix.osc2', 'mix.noise'],
      passes: true,
      description:
        'Three channels into the filter, each with an input jack that replaces what is wired to it. Above 1 o’clock they overdrive gently, higher settings harder.',
      specs: [{ label: 'Channels', value: 'Oscillator 1, Oscillator 2, noise' }],
    },
    {
      id: 'vcf',
      name: 'Low pass filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.env', 'vcf.kbd'],
      description:
        'A Moog ladder filter that self-oscillates, with an envelope amount either way and keyboard tracking.',
      specs: [
        { label: 'Slope', value: '24 dB per octave' },
        { label: 'Cutoff', value: '10 Hz to 20 kHz' },
        { label: 'Key tracking', value: 'Off, 1:2 or 1:1 (1 V per octave)' },
      ],
    },
    {
      id: 'hpf',
      name: 'High pass filter',
      module: 'filter',
      controls: ['hpf.cutoff'],
      passes: true,
      description: 'A fixed high-pass filter, in the path only when something is patched into it.',
      specs: [{ label: 'Slope', value: '6 dB per octave (1 pole)' }],
    },
    {
      id: 'env',
      name: 'Envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env.attack', 'env.decay', 'env.sustain', 'env.release'],
      stages: {
        attack: 'env.attack',
        decay: 'env.decay',
        sustain: 'env.sustain',
        release: 'env.release',
      },
      description:
        'An ADSR envelope for the cutoff and the amplifier, with an upside-down output. It fires from the keys unless TRIGGER IN is patched.',
      specs: [{ label: 'Retriggers', value: 'Above 1.2 V' }],
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      controls: ['vca.mode'],
      description:
        'ENV follows the envelope, KB RLS opens fully while a key is held and closes with the release, DRONE stays open.',
    },
    {
      id: 'reverb',
      name: 'Spring reverb',
      module: 'fx',
      controls: ['rev.mix'],
      description:
        'A real spring tank, fed from the amplifier unless REVERB IN is patched. MIX sets how much of it is heard against the dry sound.',
      specs: [{ label: 'Tank', value: '6-inch spring' }],
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
      specs: [{ label: 'Range', value: 'Unity inverted to unity, off at centre; ±8 V unpatched' }],
    },
    {
      id: 'mult',
      name: 'Mult',
      module: 'patch',
      passes: true,
      description: 'Four joined jacks that copy one signal to three places.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'The dry sound and the reverb, blended by MIX, at the VOLUME setting.',
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'kbd', to: 'osc2', signal: 'cv', label: 'pitch' },
    { id: 'c03', from: 'kbd', to: 'osc1', signal: 'cv', label: 'pitch bend' },
    { id: 'c04', from: 'kbd', to: 'osc2', signal: 'cv', label: 'pitch bend' },
    {
      id: 'c05',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      when: { id: 'vcf.kbd', in: ['half', 'full'] },
    },
    { id: 'c06', from: 'kbd', to: 'env', signal: 'gate', breaks: 'j.trig_in' },
    {
      id: 'c07',
      from: 'osc1',
      to: 'osc2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: true },
    },
    channel('c08', 'osc1', 'mix.osc1', 'j.mix1'),
    channel('c09', 'osc2', 'mix.osc2', 'j.mix2'),
    channel('c10', 'noise', 'mix.noise', 'j.mix3'),
    { id: 'c12', from: 'mixer', to: 'vcf', signal: 'audio', breaks: 'j.filter_in' },
    { id: 'c13', from: 'vcf', to: 'vca', signal: 'audio', breaks: 'j.vca_in' },
    {
      id: 'c14',
      from: 'env',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.env', off: 0, pow: 1.4 }],
    },
    {
      id: 'c15',
      from: 'env',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'vca.mode', in: ['env', 'kbrls'] },
    },
    { id: 'c16', from: 'vca', to: 'reverb', signal: 'audio', breaks: 'j.rev_in' },
    {
      id: 'c17',
      from: 'vca',
      to: 'out',
      signal: 'audio',
      label: 'dry',
      levels: [{ id: 'rev.mix', off: 10 }],
    },
    { id: 'c18', from: 'reverb', to: 'out', signal: 'audio', label: 'wet', levels: ['rev.mix'] },
    { id: 'c19', from: 'lfo', to: 'osc1', signal: 'cv', label: 'pitch', levels: PITCH_MOD },
    { id: 'c20', from: 'lfo', to: 'osc2', signal: 'cv', label: 'pitch', levels: PITCH_MOD },
    { id: 'c21', from: 'lfo', to: 'osc1', signal: 'cv', label: 'pulse width', levels: PW_MOD },
    { id: 'c22', from: 'lfo', to: 'osc2', signal: 'cv', label: 'pulse width', levels: PW_MOD },
    {
      id: 'c23',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['lfo.cutoff', WHEEL],
    },
    { id: 'c24', from: 'noise', to: 'snh', signal: 'cv', label: 'sampled' },
    { id: 'c25', from: 'lfo', to: 'snh', signal: 'gate', label: 'clock' },
    { id: 'c26', from: 'ref', to: 'att', signal: 'cv', breaks: 'j.att_in' },
  ],
  jacks: {
    'j.gate_out': 'kbd',
    'j.kb_out': 'kbd',
    'j.vel_out': 'kbd',
    'j.rate_in': 'lfo',
    'j.lfo_out': 'lfo',
    'j.sync_in': 'lfo',
    'j.sh_out': 'snh',
    'j.osc1_out': 'osc1',
    'j.osc1_pitch': 'osc1',
    'j.osc1_pwm': 'osc1',
    'j.osc2_out': 'osc2',
    'j.osc2_pitch': 'osc2',
    'j.osc2_fm': 'osc2',
    'j.mix1': 'mixer',
    'j.mix2': 'mixer',
    'j.mix3': 'mixer',
    'j.mixer_out': 'mixer',
    'j.m1': 'mult',
    'j.m2': 'mult',
    'j.m3': 'mult',
    'j.m4': 'mult',
    'j.hp_in': 'hpf',
    'j.hp_out': 'hpf',
    'j.att_in': 'att',
    'j.att_out': 'att',
    'j.filter_in': 'vcf',
    'j.filter_out': 'vcf',
    'j.env_amt': 'vcf',
    'j.cutoff': 'vcf',
    'j.trig_in': 'env',
    'j.env_pos': 'env',
    'j.env_neg': 'env',
    'j.vca_cv': 'vca',
    'j.vca_in': 'vca',
    'j.rev_in': 'reverb',
  },
  omitted: {
    instr: 'The rear INSTRUMENT IN: the definition has no jack for it.',
    c11: 'INSTRUMENT IN into the mixer: the definition has no jack for it.',
  },
};
