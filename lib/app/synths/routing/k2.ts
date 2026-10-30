/**
 * K-2 signal routing, projected from its spec (`.context/app/synth-data/k2/k2.synth.json`, 0.5.0): block and edge
 * ids are the spec's module and connection ids; switches, levels and jacks are the definition's (`defs/k2.ts`).
 *
 * Where the definition says more than the spec, it decides. INITIAL GAIN and VCO 1+2 CV IN add to their normals in
 * `toEngine()` rather than replace them, so envelope 2 into the amplifier (`c37`) and the keyboard pitch (`c02`) are
 * drawn fixed. EG1 TRIG IN takes over envelope 1's trigger when cabled, so it breaks `c41`, which the spec draws
 * fixed. The sample and hold reads noise on its own internal clock with nothing patched, so it makes signal rather
 * than waiting for a cable as the spec says. The mod wheel turns the FREQUENCY MG/T.EXT knob further, and each depth
 * knob is squared, as `toEngine()` reads them. Each source into the mod bus carries the knobs it reaches, so the
 * modulation generator goes dark when every MG/T.EXT knob (and the wheel) is at 0. The FILTER 1/2 switch changes
 * only the low-pass filter's drive in the engine, so it sits on the low-pass block.
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const PITCH_MG: RoutingLevel[] = [{ sum: [{ id: 'fmod.mg', pow: 2 }, WHEEL] }];
const PITCH_EG1: RoutingLevel[] = [{ id: 'fmod.eg1', pow: 2 }];
const HP_MG: RoutingLevel[] = [{ id: 'hpmod.mg', pow: 2 }];
const HP_EG2: RoutingLevel[] = [{ id: 'hpmod.eg2', pow: 2 }];
const LP_MG: RoutingLevel[] = [{ id: 'lpmod.mg', pow: 2 }];
const LP_EG2: RoutingLevel[] = [{ id: 'lpmod.eg2', pow: 2 }];
const FILTER_SPECS = [
  { label: 'Slope', value: '24 dB per octave' },
  { label: 'Cutoff', value: '10 Hz to 20 kHz' },
];

export const routing: SynthRouting = {
  synth: 'k2',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI / USB',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Turns incoming MIDI into the keyboard pitch voltage and a trigger. There is no keyboard; notes arrive over MIDI or USB.',
      specs: [{ label: 'Pitch CV', value: '0 to +8 V, Hz per volt' }],
    },
    {
      id: 'portamento',
      name: 'Portamento',
      module: 'glide',
      controls: ['porta.time', 'tune.master'],
      description:
        'Glides between successive notes, and holds the master tune for the whole instrument.',
    },
    {
      id: 'pitch_bus',
      name: 'Oscillator pitch',
      module: 'glide',
      description:
        'Where the keyboard pitch meets the two pitch inputs: VCO 1+2 CV IN moves both oscillators, VCO 2 CV IN only the second.',
      specs: [{ label: 'CV inputs', value: '0 to +8 V' }],
    },
    {
      id: 'vco1',
      name: 'Oscillator 1',
      module: 'osc',
      controls: ['vco1.wave', 'vco1.pw', 'vco1.scale'],
      meter: 'osc1',
      description:
        'The first oscillator, one waveform at a time. Its fourth position swaps the oscillator for noise.',
      specs: [
        { label: 'Frequency', value: "16 Hz to 1.5 kHz at 8'" },
        { label: 'Scales', value: "32', 16', 8', 4'" },
        { label: 'Waveforms', value: 'Triangle, reverse sawtooth, pulse, noise' },
      ],
    },
    {
      id: 'vco2',
      name: 'Oscillator 2',
      module: 'osc',
      controls: ['vco2.wave', 'vco2.pitch', 'vco2.scale'],
      meter: 'osc2',
      description:
        'The second oscillator, an octave up in scale range and tunable against the first. RING replaces it with the two oscillators ring-modulated.',
      specs: [
        { label: 'Scales', value: "16', 8', 4', 2'" },
        { label: 'Waveforms', value: 'Reverse sawtooth, square, narrow pulse, ring modulation' },
      ],
    },
    {
      id: 'mixer',
      name: 'VCO mixer',
      module: 'mixer',
      controls: ['mix.vco1', 'mix.vco2'],
      passes: true,
      description: 'A level for each oscillator, summed into the filters.',
      specs: [{ label: 'Channels', value: 'Oscillator 1, oscillator 2' }],
    },
    {
      id: 'mod_bus',
      name: 'Modulation depths',
      module: 'mod',
      controls: ['fmod.mg', 'fmod.eg1', 'hpmod.mg', 'hpmod.eg2', 'lpmod.mg', 'lpmod.eg2'],
      passes: true,
      description:
        'Six depth knobs, each with a fixed source and a jack that takes its place: TOTAL for the modulation generator in all four MG/T.EXT knobs, FREQ for envelope 1, and each CUTOFF FREQ for envelope 2 at its filter.',
      specs: [
        { label: 'TOTAL input', value: '−5 to +5 V' },
        { label: 'FREQ input', value: '−3 to +3 V' },
        { label: 'CUTOFF FREQ inputs', value: '−5 to +5 V' },
      ],
    },
    {
      id: 'vcf_hp',
      name: 'High-pass filter',
      module: 'filter',
      controls: ['hpf.cutoff', 'hpf.peak'],
      description:
        'The first filter in the chain, with PEAK (resonance): it thins out the fundamental and the low harmonics. EXT SIGNAL IN joins the mix here.',
      specs: [...FILTER_SPECS, { label: 'EXT SIGNAL IN', value: '3 V peak to peak at most' }],
    },
    {
      id: 'vcf_lp',
      name: 'Low-pass filter',
      module: 'filter',
      controls: ['lpf.cutoff', 'lpf.peak', 'lpf.type'],
      description:
        'The second filter, with PEAK (resonance). FILTER 1/2 picks between two filter circuits.',
      specs: [...FILTER_SPECS, { label: 'Circuits', value: 'Filter 1, filter 2' }],
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      description:
        'Sets the loudness at the end of the chain, from envelope 2 and the INITIAL GAIN input.',
      specs: [{ label: 'INITIAL GAIN input', value: '0 to +5 V' }],
    },
    {
      id: 'vca_patch',
      name: 'Patch panel VCA',
      module: 'amp',
      passes: true,
      description:
        'A spare amplifier reached only from the patch panel: its input, scaled by its control input.',
      specs: [
        { label: 'Input', value: '−5 to +5 V' },
        { label: 'Control input', value: '0 to +5 V' },
      ],
    },
    {
      id: 'mg',
      name: 'Modulation generator',
      module: 'lfo',
      controls: ['mg.wave', 'mg.freq'],
      meter: 'lfo',
      description:
        'The LFO. One WAVE FORM knob shapes both outputs at once; the first is the one wired to the MG/T.EXT knobs.',
      specs: [
        { label: 'Rate', value: '0.1 to 22 Hz' },
        { label: 'Output 1', value: 'Reverse sawtooth to triangle to sawtooth, ±2.5 V' },
        { label: 'Output 2', value: 'Wide pulse to square to narrow pulse, 0 to +5 V' },
      ],
    },
    {
      id: 'eg1',
      name: 'Envelope generator 1',
      module: 'env',
      controls: ['eg1.delay', 'eg1.attack', 'eg1.release'],
      meter: 'env1',
      description:
        'Delay, attack and release, wired to oscillator pitch. EG1 TRIG IN fires it on its own.',
      specs: [
        { label: 'Delay', value: '0 to 5.5 s' },
        { label: 'Attack', value: '3 ms to 16 s' },
        { label: 'Release', value: '30 ms to 16 s' },
        { label: 'Output', value: '0 to 5 V' },
      ],
    },
    {
      id: 'eg2',
      name: 'Envelope generator 2',
      module: 'env',
      controls: ['eg2.hold', 'eg2.attack', 'eg2.decay', 'eg2.sustain', 'eg2.release'],
      meter: 'env2',
      description:
        'Hold, attack, decay, sustain and release, wired to both filter cutoffs and the amplifier. Only its reversed output has a jack.',
      specs: [
        { label: 'Hold', value: '0 to 14 s' },
        { label: 'Attack', value: '5.4 ms to 9 s' },
        { label: 'Decay', value: '0.5 ms to 15 s' },
        { label: 'Release', value: '40 ms to 18 s' },
        { label: 'Output', value: '−2.5 to +2.5 V' },
      ],
    },
    {
      id: 'trigger_bus',
      name: 'Trigger',
      module: 'util',
      controls: ['trig.sw'],
      passes: true,
      description:
        'Carries the trigger that fires both envelopes: the keyboard’s, unless TRIG IN is patched. TRIG SW fires one by hand at its own jack.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description:
        'Pink and white noise on their own jacks. White noise is also the fourth position of Oscillator 1’s waveform switch.',
      specs: [
        { label: 'Colours', value: 'Pink, white' },
        { label: 'Output', value: '5 V peak to peak' },
      ],
    },
    {
      id: 'sample_hold',
      name: 'Sample & hold',
      module: 'mod',
      description:
        'Takes a reading of its input on each clock and holds it, for stepped random voltages.',
      specs: [{ label: 'Output', value: '5 V peak to peak' }],
    },
    {
      id: 'esp_preamp',
      name: 'Signal processor preamp',
      module: 'util',
      controls: ['esp.level'],
      passes: true,
      description:
        'Brings an outside signal up to synth level for the rest of the external signal processor.',
    },
    {
      id: 'esp_bpf',
      name: 'Signal processor band-pass',
      module: 'filter',
      controls: ['esp.lowCut', 'esp.highCut'],
      passes: true,
      description:
        'A low cut and a high cut that isolate the part of the outside signal the extractors should follow.',
    },
    {
      id: 'esp_fv',
      name: 'Frequency to voltage',
      module: 'util',
      controls: ['esp.cvAdjust'],
      passes: true,
      description:
        'Follows the pitch of the outside signal and turns it into a pitch voltage, so another instrument can play the oscillators.',
      specs: [{ label: 'Output', value: '0 to 8 V' }],
    },
    {
      id: 'esp_env',
      name: 'Envelope follower',
      module: 'env',
      passes: true,
      description: 'A voltage that rises and falls with the loudness of the outside signal.',
      specs: [{ label: 'Output', value: '0 to 5 V' }],
    },
    {
      id: 'esp_trig',
      name: 'Trigger extractor',
      module: 'util',
      controls: ['esp.threshold'],
      passes: true,
      description: 'Fires a trigger whenever the outside signal crosses THRESHOLD LEVEL.',
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume into SIGNAL OUT and the headphones.',
      specs: [{ label: 'Line outputs', value: 'Unbalanced, 0 dBu at most' }],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'portamento', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'portamento', to: 'pitch_bus', signal: 'cv', label: 'pitch' },
    { id: 'c03', from: 'pitch_bus', to: 'vco1', signal: 'cv', label: 'pitch' },
    { id: 'c04', from: 'pitch_bus', to: 'vco2', signal: 'cv', label: 'pitch' },
    {
      id: 'c10',
      from: 'mg',
      to: 'mod_bus',
      signal: 'cv',
      label: 'MG/T.EXT',
      levels: [{ sum: [...PITCH_MG, ...HP_MG, ...LP_MG] }],
      breaks: 'j.total',
    },
    {
      id: 'c11',
      from: 'eg1',
      to: 'mod_bus',
      signal: 'cv',
      label: 'EG1/EXT',
      levels: PITCH_EG1,
      breaks: 'j.freq',
    },
    {
      id: 'c12',
      from: 'eg2',
      to: 'mod_bus',
      signal: 'cv',
      label: 'high-pass EG2/EXT',
      levels: HP_EG2,
      breaks: 'j.cutoffHp',
    },
    {
      id: 'c13',
      from: 'eg2',
      to: 'mod_bus',
      signal: 'cv',
      label: 'low-pass EG2/EXT',
      levels: LP_EG2,
      breaks: 'j.cutoffLp',
    },
    { id: 'c20', from: 'mod_bus', to: 'vco1', signal: 'cv', label: 'pitch', levels: PITCH_MG },
    { id: 'c21', from: 'mod_bus', to: 'vco2', signal: 'cv', label: 'pitch', levels: PITCH_MG },
    { id: 'c22', from: 'mod_bus', to: 'vcf_hp', signal: 'cv', label: 'cutoff', levels: HP_MG },
    { id: 'c23', from: 'mod_bus', to: 'vcf_lp', signal: 'cv', label: 'cutoff', levels: LP_MG },
    { id: 'c24', from: 'mod_bus', to: 'vco1', signal: 'cv', label: 'pitch', levels: PITCH_EG1 },
    { id: 'c25', from: 'mod_bus', to: 'vco2', signal: 'cv', label: 'pitch', levels: PITCH_EG1 },
    { id: 'c26', from: 'mod_bus', to: 'vcf_hp', signal: 'cv', label: 'cutoff', levels: HP_EG2 },
    { id: 'c27', from: 'mod_bus', to: 'vcf_lp', signal: 'cv', label: 'cutoff', levels: LP_EG2 },
    { id: 'c30', from: 'vco1', to: 'mixer', signal: 'audio', levels: ['mix.vco1'] },
    { id: 'c31', from: 'vco2', to: 'mixer', signal: 'audio', levels: ['mix.vco2'] },
    {
      id: 'c32',
      from: 'vco1',
      to: 'vco2',
      signal: 'audio',
      label: 'ring',
      when: { id: 'vco2.wave', eq: 'ring' },
    },
    {
      id: 'c33',
      from: 'noise',
      to: 'vco1',
      signal: 'audio',
      label: 'noise',
      when: { id: 'vco1.wave', eq: 'noise' },
    },
    { id: 'c34', from: 'mixer', to: 'vcf_hp', signal: 'audio' },
    { id: 'c35', from: 'vcf_hp', to: 'vcf_lp', signal: 'audio' },
    { id: 'c36', from: 'vcf_lp', to: 'vca', signal: 'audio' },
    { id: 'c37', from: 'eg2', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c38', from: 'vca', to: 'output', signal: 'audio' },
    { id: 'c40', from: 'kbd', to: 'trigger_bus', signal: 'gate', breaks: 'j.trigIn' },
    { id: 'c41', from: 'trigger_bus', to: 'eg1', signal: 'gate', breaks: 'j.eg1Trig' },
    { id: 'c42', from: 'trigger_bus', to: 'eg2', signal: 'gate' },
    { id: 'c50', from: 'esp_preamp', to: 'esp_bpf', signal: 'audio', levels: ['esp.level'] },
    { id: 'c51', from: 'esp_bpf', to: 'esp_fv', signal: 'audio' },
    { id: 'c52', from: 'esp_bpf', to: 'esp_env', signal: 'audio' },
    { id: 'c53', from: 'esp_bpf', to: 'esp_trig', signal: 'audio' },
  ],
  jacks: {
    'j.total': 'mod_bus',
    'j.freq': 'mod_bus',
    'j.extIn': 'vcf_hp',
    'j.cutoffHp': 'mod_bus',
    'j.cutoffLp': 'mod_bus',
    'j.initialGain': 'vca',
    'j.signalOut': 'output',
    'j.phones': 'output',
    'j.mgTri': 'mg',
    'j.mgPulse': 'mg',
    'j.eg1Out': 'eg1',
    'j.eg1Rev': 'eg1',
    'j.kbdCv': 'kbd',
    'j.vco12Cv': 'pitch_bus',
    'j.vco2Cv': 'pitch_bus',
    'j.shClock': 'sample_hold',
    'j.eg1Trig': 'eg1',
    'j.vcaCtrl': 'vca_patch',
    'j.eg2Rev': 'eg2',
    'j.trigIn': 'trigger_bus',
    'j.trigOut': 'trigger_bus',
    'j.shIn': 'sample_hold',
    'j.shOut': 'sample_hold',
    'j.vcaIn': 'vca_patch',
    'j.vcaOut': 'vca_patch',
    'j.noisePink': 'noise',
    'j.noiseWhite': 'noise',
    'j.trigSwOut': 'trigger_bus',
    'j.espIn': 'esp_preamp',
    'j.espOutPre': 'esp_preamp',
    'j.espOutPost': 'esp_bpf',
    'j.espFvOut': 'esp_fv',
    'j.espEnvOut': 'esp_env',
    'j.espTrigOut': 'esp_trig',
  },
};
