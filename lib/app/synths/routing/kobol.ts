/**
 * Kobol Expander signal routing, projected from its spec (`.context/app/synth-data/kobol/kobol.synth.json`, 0.7.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/kobol.ts`).
 *
 * Where the definition says more than the spec, it decides. The LFO reaches the mod bus and both pulse widths at LFO
 * VOLUME squared, as `toEngine()` scales it, so the LFO goes dark at VOLUME 0 (its default) unless a cable takes it
 * elsewhere. CV IN adds to the MIDI pitch, and every CV input adds to its knob. The VCO 2 OUT insert, which takes
 * VCO 2 out of its VCA in `toEngine()`, is an output jack, so it cannot break `c21`, which is drawn fixed. The noise
 * generator and the voltage processor reach the sound only by cable, as the spec says; the voltage processor makes
 * its own signal (the +10 V on IN 1 with nothing patched).
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';

const LFO_LEVEL: RoutingLevel[] = [{ id: 'lfo.volume', pow: 2 }];
const OSC_SPECS = [
  { label: 'Frequency', value: '10 Hz to 10 kHz, 440 Hz at the centre' },
  { label: 'Waveform', value: 'Triangle, ramp, sawtooth, square, pulse, continuously' },
];
const ENV_SPECS = [{ label: 'Stages', value: 'Attack, decay (also release), sustain' }];

export const routing: SynthRouting = {
  synth: 'kobol',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI / USB',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Turns incoming MIDI notes into pitch and the gate. There is no keyboard; notes arrive over MIDI or USB.',
    },
    {
      id: 'pitch_bus',
      name: 'Pitch and tune',
      module: 'glide',
      controls: ['pitch.tune'],
      description:
        'Adds up the MIDI pitch, CV IN and TUNE, and sets the pitch of both oscillators and the filter’s keyboard tracking.',
      specs: [{ label: 'CV IN', value: '1 V per octave' }],
    },
    {
      id: 'gate_bus',
      name: 'Gate',
      module: 'util',
      passes: true,
      description:
        'Carries the gate that fires both envelopes: the MIDI note’s, unless GATE IN is patched.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      controls: ['lfo.rate', 'lfo.shape', 'lfo.volume'],
      meter: 'lfo',
      description:
        'Triangle or square. LFO VOLUME scales the output wired to the oscillators’ pitch and pulse width; LFO OUT 2 is always at full level.',
      specs: [
        { label: 'Rate', value: '0.01 to 100 Hz' },
        { label: 'Shapes', value: 'Triangle, square' },
      ],
    },
    {
      id: 'mod_bus',
      name: 'VCO modulation',
      module: 'mod',
      controls: ['mod.vco1Off', 'mod.pwm'],
      passes: true,
      description:
        'Sends the pitch modulation (the scaled LFO, unless VCO MOD IN is patched) to both oscillators; VCO 1 MOD OFF leaves VCO 1 out. Also holds the PWM source switch.',
    },
    {
      id: 'vco1',
      name: 'VCO 1',
      module: 'osc',
      controls: ['vco1.freq', 'vco1.wave'],
      meter: 'osc1',
      description:
        'An analogue oscillator whose one WAVEFORM knob morphs from triangle to pulse. At the pulse end the PWM source moves its width.',
      specs: OSC_SPECS,
    },
    {
      id: 'vca1',
      name: 'VCO 1 VCA',
      module: 'amp',
      controls: ['vca1.level'],
      description:
        'VCO 1’s level into the filter, from its VOLUME knob and CV input. The two VCAs are the mix.',
    },
    {
      id: 'vco2',
      name: 'VCO 2',
      module: 'osc',
      controls: ['vco2.freq', 'vco2.beat', 'vco2.wave', 'vco2.sync'],
      meter: 'osc2',
      description:
        'A second morphing oscillator, with BEAT to fine-tune it against VCO 1 and a switch to hard-sync it to VCO 1.',
      specs: OSC_SPECS,
    },
    {
      id: 'vca2',
      name: 'VCO 2 VCA',
      module: 'amp',
      controls: ['vca2.level'],
      description: 'VCO 2’s level into the filter, from its VOLUME knob and CV input.',
    },
    {
      id: 'vcf',
      name: 'Low-pass filter',
      module: 'filter',
      controls: ['vcf.freq', 'vcf.res', 'vcf.kbd', 'vcf.env'],
      description:
        'A low-pass filter that self-oscillates at the top of RESONANCE, with keyboard tracking and an ADS 2 depth. VCF AUDIO IN joins the two VCAs here.',
      specs: [
        { label: 'Slope', value: '24 dB per octave' },
        { label: 'Cutoff', value: '16 Hz to 16 kHz' },
        { label: 'Keyboard tracking', value: '0 to 200 %' },
      ],
    },
    {
      id: 'ads1',
      name: 'ADS 1',
      module: 'env',
      controls: ['ads1.attack', 'ads1.decay', 'ads1.sustain', 'ads1.decayOff'],
      meter: 'env1',
      // DECAY sets the release too, unless DECAY OFF makes both near-instant: then neither follows the knob.
      stages: {
        attack: 'ads1.attack',
        decay: { id: 'ads1.decay', when: { id: 'ads1.decayOff', eq: false } },
        sustain: 'ads1.sustain',
        release: { id: 'ads1.decay', when: { id: 'ads1.decayOff', eq: false } },
      },
      description:
        'The loudness envelope. DECAY sets the release too, and DECAY OFF sets both to zero.',
      specs: ENV_SPECS,
    },
    {
      id: 'ads2',
      name: 'ADS 2',
      module: 'env',
      controls: ['ads2.attack', 'ads2.decay', 'ads2.sustain'],
      meter: 'env2',
      // DECAY sets the release too.
      stages: {
        attack: 'ads2.attack',
        decay: 'ads2.decay',
        sustain: 'ads2.sustain',
        release: 'ads2.decay',
      },
      description: 'The filter envelope, and a pulse-width source. DECAY sets the release too.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'Output VCA',
      module: 'amp',
      description: 'The amplifier after the filter, opened by ADS 1.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      controls: ['noise.colour'],
      symbol: 'noise',
      description: 'White or pink noise, reached only by a cable from NOISE OUT.',
      specs: [{ label: 'Colours', value: 'White, pink' }],
    },
    {
      id: 'volt_proc',
      name: 'Voltage processor',
      module: 'util',
      controls: ['vp.in1', 'vp.out'],
      description:
        'Adds input 1 (+10 V unless patched, through IN 1 GAIN) to twice input 2, scaled by OUT GAIN, the right way up and inverted. Unpatched, a manual voltage source.',
      specs: [
        { label: 'IN 1', value: '+10 V with nothing patched' },
        { label: 'IN 2 gain', value: '×2' },
      ],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume to the audio outputs and the headphones.',
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'pitch_bus', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'pitch_bus', to: 'vco1', signal: 'cv', label: 'pitch' },
    { id: 'c03', from: 'pitch_bus', to: 'vco2', signal: 'cv', label: 'pitch' },
    {
      id: 'c04',
      from: 'pitch_bus',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      levels: ['vcf.kbd'],
    },
    { id: 'c05', from: 'kbd', to: 'gate_bus', signal: 'gate', breaks: 'j.gateIn' },
    { id: 'c06', from: 'gate_bus', to: 'ads1', signal: 'gate' },
    { id: 'c07', from: 'gate_bus', to: 'ads2', signal: 'gate' },
    {
      id: 'c10',
      from: 'lfo',
      to: 'mod_bus',
      signal: 'cv',
      levels: LFO_LEVEL,
      breaks: 'j.vcoModIn',
    },
    {
      id: 'c11',
      from: 'mod_bus',
      to: 'vco1',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mod.vco1Off', eq: false },
    },
    { id: 'c12', from: 'mod_bus', to: 'vco2', signal: 'cv', label: 'pitch' },
    {
      id: 'c13',
      from: 'lfo',
      to: 'vco1',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mod.pwm', in: ['lfo', 'both'] },
      levels: LFO_LEVEL,
    },
    {
      id: 'c14',
      from: 'ads2',
      to: 'vco1',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mod.pwm', in: ['ads', 'both'] },
    },
    {
      id: 'c15',
      from: 'lfo',
      to: 'vco2',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mod.pwm', in: ['lfo', 'both'] },
      levels: LFO_LEVEL,
    },
    {
      id: 'c16',
      from: 'ads2',
      to: 'vco2',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mod.pwm', in: ['ads', 'both'] },
    },
    {
      id: 'c17',
      from: 'vco1',
      to: 'vco2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'vco2.sync', eq: true },
    },
    { id: 'c20', from: 'vco1', to: 'vca1', signal: 'audio' },
    { id: 'c21', from: 'vco2', to: 'vca2', signal: 'audio' },
    { id: 'c22', from: 'vca1', to: 'vcf', signal: 'audio', levels: ['vca1.level'] },
    { id: 'c23', from: 'vca2', to: 'vcf', signal: 'audio', levels: ['vca2.level'] },
    {
      id: 'c24',
      from: 'ads2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.env', off: 0 }],
    },
    { id: 'c25', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c26', from: 'ads1', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c27', from: 'vca', to: 'output', signal: 'audio' },
  ],
  jacks: {
    'j.lfoRate': 'lfo',
    'j.lfoOut1': 'lfo',
    'j.lfoOut2': 'lfo',
    'j.vcoModIn': 'mod_bus',
    'j.vco1Freq': 'vco1',
    'j.vco1Wave': 'vco1',
    'j.vco1Vol': 'vca1',
    'j.vco1Out': 'vco1',
    'j.vcfFreq': 'vcf',
    'j.res': 'vcf',
    'j.gateIn': 'gate_bus',
    'j.ads1Attack': 'ads1',
    'j.ads1Decay': 'ads1',
    'j.ads1Sustain': 'ads1',
    'j.ads1Out': 'ads1',
    'j.vpIn1': 'volt_proc',
    'j.vpIn2': 'volt_proc',
    'j.vpOut': 'volt_proc',
    'j.vpRev': 'volt_proc',
    'j.noise': 'noise',
    'j.vco2Freq': 'vco2',
    'j.vco2Wave': 'vco2',
    'j.vco2Vol': 'vca2',
    'j.vco2Out': 'vco2',
    'j.vcfIn': 'vcf',
    'j.cvIn': 'pitch_bus',
    'j.adsCtrl': 'vcf',
    'j.ads2Out': 'ads2',
    'j.ads2Attack': 'ads2',
    'j.ads2Decay': 'ads2',
    'j.ads2Sustain': 'ads2',
    'j.audioOut': 'output',
    'j.phones': 'output',
  },
};
