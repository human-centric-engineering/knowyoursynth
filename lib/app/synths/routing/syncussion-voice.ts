/**
 * The channel the Pearl Syncussion SY-1 and the Behringer SYNCUSSION SY-1 share: their specs give each channel the
 * same twelve modules (`ch1_trig` … `ch1_vca`) and the same connections, numbered differently (the Behringer's carry
 * MIDI and CC connections the Pearl's lack), and their definitions the same `channelVoice()` (`defs/syncussion-kit.ts`).
 * Each synth's routing (`routing/pearl-syncussion.ts`, `routing/behringer-syncussion.ts`) passes its own connection
 * numbers and adds what is its own: what strikes the channels, MUTE, and the way out.
 *
 * Read from `channelVoice()`: mode D replaces the sweep rather than scaling it by the strike. The sweep's range is 0
 * there, so the sweep moves neither oscillator, and oscillator 1 is moved instead by the decay scaled by the strike
 * (`env1v`). So the sweep's edges hold off mode D, the spec's strike-into-sweep connection is left out, and the decay
 * into oscillator 1 in mode D is drawn with an id of its own (`ch1_env_osc1`, `ch2_env_osc1`), which the spec does not
 * have. The LFO and the sample and hold move the pitch by LFO DEPTH squared, as `lfoSemi()` does. The meters follow
 * the engine's first voice, channel 1 (channel 2 is its `dual` voice), so only channel 1's blocks carry one.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
} from '@/lib/app/synths/contract';

/** The channel's connections, by what they join. */
export type ChannelLink =
  | 'tuneOsc1'
  | 'tuneOsc2'
  | 'tuneVcf'
  | 'envVcf'
  | 'strengthEnv'
  | 'envOsc2'
  | 'trigEnv'
  | 'trigSweep'
  | 'strengthSweep'
  | 'sweepOsc1'
  | 'sweepOsc2'
  | 'lfoOsc1'
  | 'snhOsc1'
  | 'lfoOsc2'
  | 'snhOsc2'
  | 'clock'
  | 'noiseSnh'
  | 'fm'
  | 'osc1Mix'
  | 'osc2Mix'
  | 'noiseMix'
  | 'mixVcf'
  | 'vcfVca'
  | 'envVca';

/** Channel 1's connection numbers in the Pearl's spec; the Behringer's run one or two higher (`routing/behringer-syncussion.ts`). */
export const PEARL_LINKS: Record<ChannelLink, number> = {
  tuneOsc1: 2,
  tuneOsc2: 3,
  tuneVcf: 4,
  envVcf: 5,
  strengthEnv: 6,
  envOsc2: 7,
  trigEnv: 9,
  trigSweep: 10,
  strengthSweep: 11,
  sweepOsc1: 12,
  sweepOsc2: 13,
  lfoOsc1: 14,
  snhOsc1: 15,
  lfoOsc2: 16,
  snhOsc2: 17,
  clock: 18,
  noiseSnh: 19,
  fm: 20,
  osc1Mix: 21,
  osc2Mix: 22,
  noiseMix: 23,
  mixVcf: 24,
  vcfVca: 25,
  envVca: 26,
};

/** A spec connection id from its number: 7 → `c07`. */
export const cid = (n: number): string => `c${String(n).padStart(2, '0')}`;

/**
 * One channel's blocks, edges and what it leaves out. `id` gives a link's spec connection id for this channel;
 * the Behringer's channel also lists its FINE and SENSE knobs.
 */
export function syncussionChannel(
  ch: 1 | 2,
  id: (link: ChannelLink) => string,
  variant: 'pearl' | 'behringer'
): { blocks: RoutingBlock[]; edges: RoutingEdge[]; omitted: Record<string, string> } {
  const b = (s: string): string => `ch${ch}_${s}`;
  const k = (s: string): string => `ch${ch}.${s}`;
  const lead = ch === 1;
  const behringer = variant === 'behringer';
  const keys = lead ? 'the keys below middle C' : 'middle C and the keys above it';
  const mode = (...m: string[]): RoutingWhen => ({ id: k('mode'), in: m });
  const sweepOn: RoutingWhen = {
    all: [{ id: k('sweep'), in: ['up', 'down'] }, mode('A', 'B', 'C', 'E', 'F')],
  };
  const lfoOn: RoutingWhen = { id: k('lfoWave'), in: ['square', 'triangle'] };
  const shOn: RoutingWhen = { id: k('sh'), eq: true };
  const depth: RoutingLevel[] = [{ id: k('lfoDepth'), pow: 2 }];
  const range: RoutingLevel[] = [k('sweepRange')];

  const blocks: RoutingBlock[] = [
    {
      id: b('trig'),
      name: `Channel ${ch} trigger`,
      module: 'util',
      symbol: 'midi',
      ...(lead ? { meter: 'gate' as const } : {}),
      ...(behringer ? { controls: [k('sense')] } : {}),
      description: `Strikes the channel and measures how hard: here ${keys}, harder for a higher velocity. Starts the decay and the sweep, and sets the decay’s level.`,
    },
    {
      id: b('noise'),
      name: `Channel ${ch} noise`,
      module: 'mixer',
      symbol: 'noise',
      description:
        'White noise: heard in modes E and F, and the source the sample and hold picks its random steps from.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: b('tune'),
      name: `Channel ${ch} tune`,
      module: 'osc',
      symbol: 'pitch',
      controls: behringer ? [k('tune'), k('fine')] : [k('tune')],
      description:
        'Sets the drum’s pitch: both oscillators, and the filter’s cutoff with them. The keys strike the drum but do not change its pitch.',
    },
    {
      id: b('osc1'),
      name: `Channel ${ch} oscillator 1`,
      module: 'osc',
      ...(lead ? { meter: 'osc1' as const } : {}),
      description:
        'Heard alone in mode A and mixed in C and D; in B and E it frequency-modulates oscillator 2 instead.',
      specs: [{ label: 'Calibration', value: '440 Hz' }],
    },
    {
      id: b('osc2'),
      name: `Channel ${ch} oscillator 2`,
      module: 'osc',
      ...(lead ? { meter: 'osc2' as const } : {}),
      description:
        'A fixed interval above oscillator 1, set inside: frequency-modulated by oscillator 1 in modes B and E, mixed with it in C and D.',
      specs: [
        { label: 'Calibration', value: '450 Hz' },
        { label: 'Interval', value: 'Fixed by an internal trimmer' },
      ],
    },
    {
      id: b('mix'),
      name: `Channel ${ch} source mix`,
      module: 'mixer',
      passes: true,
      controls: [k('mode')],
      description:
        'OSC MODE picks what goes on to the filter: oscillator 1, oscillator 2, the two mixed, or noise.',
      specs: [{ label: 'Modes', value: 'A to F' }],
    },
    {
      id: b('sweep'),
      name: `Channel ${ch} sweep`,
      module: 'env',
      ...(lead ? { meter: 'env2' as const } : {}),
      controls: [k('sweep'), k('sweepSpeed'), k('sweepRange')],
      description:
        'Slides both oscillators’ pitch on every strike, up or down, at SWEEP SPEED over SWEEP RANGE. Mode D replaces it with its own sweep.',
    },
    {
      id: b('lfo'),
      name: `Channel ${ch} LFO`,
      module: 'lfo',
      ...(lead ? { meter: 'lfo' as const } : {}),
      controls: [k('lfoWave'), k('lfoSpeed'), k('lfoDepth')],
      description:
        'A square or triangle LFO on both oscillators’ pitch, or off. It clocks the sample and hold even when off.',
      specs: [
        { label: 'Rate', value: '0.4 to 50 Hz' },
        { label: 'Waves', value: 'Square, triangle, off' },
      ],
    },
    {
      id: b('snh'),
      name: `Channel ${ch} sample and hold`,
      module: 'lfo',
      controls: [k('sh'), k('lfoDepth')],
      description:
        'Random steps on both oscillators’ pitch at the LFO rate, by LFO DEPTH, even with the LFO wave switched off.',
    },
    {
      id: b('vcf'),
      name: `Channel ${ch} filter`,
      module: 'filter',
      controls: [k('width')],
      description:
        'A low-pass filter whose cutoff follows TUNE. The decay opens it on the strike and closes it back, over the range WIDTH sets.',
      specs: [{ label: 'Type', value: 'Low-pass' }],
    },
    {
      id: b('env'),
      name: `Channel ${ch} decay`,
      module: 'env',
      ...(lead ? { meter: 'env1' as const } : {}),
      controls: [k('decay')],
      description:
        'One decay on each strike, its level set by how hard: it shapes the VCA and the filter, and in mode D sweeps the oscillators.',
      specs: [{ label: 'Decay', value: '6 ms to 2.5 s' }],
    },
    {
      id: b('vca'),
      name: `Channel ${ch} VCA`,
      module: 'amp',
      controls: [k('output')],
      description: 'Shapes the channel with its decay; OUTPUT sets its level in the mix.',
    },
  ];

  const edges: RoutingEdge[] = [
    { id: id('trigEnv'), from: b('trig'), to: b('env'), signal: 'gate' },
    { id: id('strengthEnv'), from: b('trig'), to: b('env'), signal: 'cv', label: 'strength' },
    { id: id('trigSweep'), from: b('trig'), to: b('sweep'), signal: 'gate' },
    { id: id('tuneOsc1'), from: b('tune'), to: b('osc1'), signal: 'cv', label: 'pitch' },
    { id: id('tuneOsc2'), from: b('tune'), to: b('osc2'), signal: 'cv', label: 'pitch' },
    { id: id('tuneVcf'), from: b('tune'), to: b('vcf'), signal: 'cv', label: 'cutoff' },
    {
      id: id('sweepOsc1'),
      from: b('sweep'),
      to: b('osc1'),
      signal: 'cv',
      label: 'pitch',
      when: sweepOn,
      levels: range,
    },
    {
      id: id('sweepOsc2'),
      from: b('sweep'),
      to: b('osc2'),
      signal: 'cv',
      label: 'pitch',
      when: sweepOn,
      levels: range,
    },
    {
      id: b('env_osc1'),
      from: b('env'),
      to: b('osc1'),
      signal: 'cv',
      label: 'pitch, by the strike',
      when: mode('D'),
    },
    {
      id: id('envOsc2'),
      from: b('env'),
      to: b('osc2'),
      signal: 'cv',
      label: 'pitch',
      when: mode('D'),
    },
    {
      id: id('lfoOsc1'),
      from: b('lfo'),
      to: b('osc1'),
      signal: 'cv',
      label: 'pitch',
      when: lfoOn,
      levels: depth,
    },
    {
      id: id('lfoOsc2'),
      from: b('lfo'),
      to: b('osc2'),
      signal: 'cv',
      label: 'pitch',
      when: lfoOn,
      levels: depth,
    },
    { id: id('clock'), from: b('lfo'), to: b('snh'), signal: 'gate', label: 'clock' },
    { id: id('noiseSnh'), from: b('noise'), to: b('snh'), signal: 'cv', label: 'source' },
    {
      id: id('snhOsc1'),
      from: b('snh'),
      to: b('osc1'),
      signal: 'cv',
      label: 'pitch',
      when: shOn,
      levels: depth,
    },
    {
      id: id('snhOsc2'),
      from: b('snh'),
      to: b('osc2'),
      signal: 'cv',
      label: 'pitch',
      when: shOn,
      levels: depth,
    },
    {
      id: id('fm'),
      from: b('osc1'),
      to: b('osc2'),
      signal: 'audio',
      label: 'FM',
      when: mode('B', 'E'),
    },
    {
      id: id('osc1Mix'),
      from: b('osc1'),
      to: b('mix'),
      signal: 'audio',
      when: mode('A', 'C', 'D'),
    },
    {
      id: id('osc2Mix'),
      from: b('osc2'),
      to: b('mix'),
      signal: 'audio',
      when: mode('B', 'C', 'D', 'E'),
    },
    {
      id: id('noiseMix'),
      from: b('noise'),
      to: b('mix'),
      signal: 'audio',
      when: mode('E', 'F'),
    },
    { id: id('mixVcf'), from: b('mix'), to: b('vcf'), signal: 'audio' },
    {
      id: id('envVcf'),
      from: b('env'),
      to: b('vcf'),
      signal: 'cv',
      label: 'cutoff',
      levels: [k('width')],
    },
    { id: id('vcfVca'), from: b('vcf'), to: b('vca'), signal: 'audio' },
    { id: id('envVca'), from: b('env'), to: b('vca'), signal: 'cv', label: 'loudness' },
  ];

  return {
    blocks,
    edges,
    omitted: {
      [id('strengthSweep')]:
        `The strike into channel ${ch}’s sweep in mode D: the definition replaces the sweep there with the decay scaled by the strike, drawn as ${b('env_osc1')}.`,
    },
  };
}
