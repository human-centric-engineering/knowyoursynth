/**
 * SOLAR 42N signal routing, projected from its spec (`.context/app/synth-data/solar-42n/solar-42n.synth.json`,
 * 0.12.0), which describes the original SOLAR 42: block and edge ids are the spec's module and connection ids;
 * switches, levels and jacks are the definition's (`defs/solar-42n.ts`, on the engine's SOLAR path,
 * `audio/solar-core.ts`). The 42N renumbers the voices, so the spec's `v1`, `v2`, `v6`, `v7` are the classic drones 1,
 * 2, 4 and 5, its `v3` and `v8` the Papa Srapa drones 3 and 6, and its `v4` and `v5` VCO A and VCO B. The LFOs, the
 * sequencer and the joystick reach the voices only through cables, so they have no edges.
 *
 * Where the definition says more than the spec, it decides. A drone's VCA opens only while its push-button is down or
 * its HOLD is on, so its way into the mixer holds on either (`c12`–`c14`, `c17`–`c19`), and a classic drone with all
 * five generators off is silent too; a cable into its GATE also opens it, which a switch cannot say, so a drone gated
 * only by a cable reads dark. The mixer's VOL is square law (`vol()`), as the levels read it. VCO A's oscillator is
 * normalled into VCO B's CV input, its FM, scaled by VCO B's CV AMT and broken by a cable there (`c11`). The preamp hears only EXT. SOURCE (the contact microphone is
 * not modelled), so its block passes on only what is patched there, and GAIN at its minimum mutes it (`c20`). The
 * distortion after the filters is inside the filter block. No block carries a meter: the SOLAR path drives none of
 * the engine's gate, envelope, LFO or oscillator meters.
 *
 * The dry outputs (`c27`, `c28`) are VCO A's and B's own OUT sockets, drawn on their blocks, so they are left out.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';

/** A drone's VCA: open while its push-button is down or HOLD is on. */
const open = (d: string): RoutingWhen => ({
  any: [
    { id: `gate.${d}`, eq: true },
    { id: `${d}.hold`, eq: true },
  ],
});

/** A classic drone (`d1`, `d2`, `d4`, `d5`) as the spec's voice `id`, with its push-button and mixer connections. */
function classic(
  id: string,
  n: number,
  gateEdge: string,
  mixEdge: string
): { block: RoutingBlock; edges: RoutingEdge[] } {
  const d = `d${n}`;
  const gens = [1, 2, 3, 4, 5];
  return {
    block: {
      id,
      name: `Drone ${n}`,
      module: 'osc',
      controls: [
        ...gens.flatMap((k) => [`${d}.on${k}`, `${d}.tune${k}`, `${d}.mod${k}`]),
        `${d}.volt`,
        `${d}.light`,
        `${d}.cv`,
        `${d}.att`,
        `${d}.rls`,
        `${d}.hold`,
      ],
      description:
        'Five sawtooth generators, each with its own TUNE and on/off key. VOLT lowers them together, then makes them frequency-modulate each other; the light on its photosensor raises the generators whose MOD is on. An attack and release envelope opens its VCA.',
      specs: [
        { label: 'Generators', value: '5 sawtooth' },
        {
          label: 'Ranges',
          value: '1st C0–G2, 2nd B1–G3, 3rd D3–B4, 4th E4–C6, 5th G5–D7',
        },
      ],
    },
    edges: [
      {
        id: gateEdge,
        from: 'keys',
        to: id,
        signal: 'gate',
        label: 'push-button',
        when: { id: `gate.${d}`, eq: true },
      },
      {
        id: mixEdge,
        from: id,
        to: 'mixer',
        signal: 'audio',
        when: { all: [open(d), { any: gens.map((k) => ({ id: `${d}.on${k}`, eq: true })) }] },
        levels: [{ id: `mix.${d}.vol`, pow: 2 }],
      },
    ],
  };
}

/** A Papa Srapa drone (`d3`, `d6`) as the spec's voice `id`. */
function srapa(
  id: string,
  n: number,
  gateEdge: string,
  mixEdge: string
): { block: RoutingBlock; edges: RoutingEdge[] } {
  const d = `d${n}`;
  return {
    block: {
      id,
      name: `Drone ${n} (Papa Srapa)`,
      module: 'osc',
      controls: [
        `${d}.pitch`,
        `${d}.hi`,
        `${d}.rate`,
        `${d}.x10`,
        `${d}.fm`,
        `${d}.am`,
        `${d}.mod`,
        `${d}.div`,
        `${d}.noise`,
        `${d}.att`,
        `${d}.rls`,
        `${d}.hold`,
      ],
      description:
        'A square tone under a low-frequency square modulator, which moves its pitch (FM), chops it (AM) or both, with white noise blended in and a sample and hold. An attack and release envelope opens its VCA.',
      specs: [{ label: 'Tone', value: 'C0 to E7' }],
    },
    edges: [
      {
        id: gateEdge,
        from: 'keys',
        to: id,
        signal: 'gate',
        label: 'push-button',
        when: { id: `gate.${d}`, eq: true },
      },
      {
        id: mixEdge,
        from: id,
        to: 'mixer',
        signal: 'audio',
        when: open(d),
        levels: [{ id: `mix.${d}.vol`, pow: 2 }],
      },
    ],
  };
}

/** VCO A or B (`a`, `b`) as the spec's voice `id`, with its envelope. */
function vco(s: 'a' | 'b', id: string): RoutingBlock {
  const v = `v${s}`;
  const e = `e${s}`;
  return {
    id,
    name: `VCO ${s.toUpperCase()}`,
    module: 'osc',
    controls: [
      `${v}.wave`,
      `${v}.pw`,
      `${v}.pwm`,
      `${v}.oct`,
      `${v}.tune`,
      `${v}.sub`,
      `${v}.cvamt`,
      `${e}.a`,
      `${e}.d`,
      `${e}.s`,
      `${e}.r`,
      `${e}.loop`,
      `${e}.hold`,
    ],
    description:
      s === 'a'
        ? 'A triangle-core VCO with six waves (two of them morphs set by SHAPE) and a sub-oscillator, played from the touch keyboard (its left half in SPLIT), with an ADSR into its VCA. Takes SYNC.'
        : 'A triangle-core VCO with six waves (two of them morphs set by SHAPE) and a sub-oscillator, played from the touch keyboard (its right half in SPLIT), with an ADSR into its VCA. VCO A is normalled into its CV input.',
    specs: [
      { label: 'Chip', value: 'AS3340' },
      { label: 'Waveforms', value: '6' },
    ],
  };
}

const D1 = classic('v1', 1, 'c01', 'c12');
const D2 = classic('v2', 2, 'c02', 'c13');
const D3 = srapa('v3', 3, 'c03', 'c14');
const D4 = classic('v6', 4, 'c04', 'c17');
const D5 = classic('v7', 5, 'c05', 'c18');
const D6 = srapa('v8', 6, 'c06', 'c19');
const DRONES = [D1, D2, D3, D4, D5, D6];

export const routing: SynthRouting = {
  synth: 'solar-42n',
  out: 'out',
  blocks: [
    {
      id: 'keys',
      name: 'Touch keyboard and drone buttons',
      module: 'util',
      symbol: 'midi',
      controls: [
        'keys.mode',
        'keys.down',
        'keys.up',
        'kb.glide',
        'gate.d1',
        'gate.d2',
        'gate.d3',
        'gate.d4',
        'gate.d5',
        'gate.d6',
      ],
      description:
        'The plates play VCO A and B, both together or split into halves, with portamento. The six push-buttons gate the drone voices.',
      specs: [{ label: 'Plates', value: '12' }],
    },
    ...DRONES.map((x) => x.block),
    vco('a', 'v4'),
    vco('b', 'v5'),
    {
      id: 'lfo',
      name: 'LFO A and B',
      module: 'lfo',
      controls: ['lfoa.wave', 'lfoa.rate', 'lfoa.speed', 'lfob.wave', 'lfob.rate', 'lfob.speed'],
      description:
        'Two LFOs, A slow and B fast, each blending square and triangle. Positive only, so they can light the drones’ photosensors; patched, not wired.',
      specs: [{ label: 'Output', value: '0 to 10 V' }],
    },
    {
      id: 'seq',
      name: 'Sequencer and pulser',
      module: 'mod',
      controls: [
        'seq.pulser',
        'seq.stages',
        'seq.s1',
        'seq.g1',
        'seq.s2',
        'seq.g2',
        'seq.s3',
        'seq.g3',
        'seq.s4',
        'seq.g4',
        'seq.s5',
        'seq.g5',
      ],
      description:
        'A five-step sequential voltage source with a gate per step, run by its PULSER or a clock at its input; patched, not wired.',
      specs: [
        { label: 'Steps', value: '5 (3, 4 or 5 stages)' },
        { label: 'Step level', value: '0 to 5 V' },
      ],
    },
    {
      id: 'joy',
      name: 'Joystick',
      module: 'mod',
      controls: ['joy.x', 'joy.y', 'joy.ox', 'joy.oy'],
      description: 'Two axes of control voltage, each with an offset; patched, not wired.',
    },
    {
      id: 'preamp',
      name: 'Preamp and envelope follower',
      module: 'mixer',
      symbol: 'input',
      passes: true,
      controls: ['pre.gain'],
      description:
        'Raises a source at EXT. SOURCE into the mixer, and follows its level. GAIN at its minimum mutes it.',
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: [
        'mix.d1.vol',
        'mix.d1.pan',
        'mix.d2.vol',
        'mix.d2.pan',
        'mix.d3.vol',
        'mix.d3.pan',
        'mix.ext.vol',
        'mix.ext.pan',
        'mix.va.vol',
        'mix.va.pan',
        'mix.vb.vol',
        'mix.vb.pan',
        'mix.pre.vol',
        'mix.pre.pan',
        'mix.d4.vol',
        'mix.d4.pan',
        'mix.d5.vol',
        'mix.d5.pan',
        'mix.d6.vol',
        'mix.d6.pan',
      ],
      description:
        'Volume and pan for the eight voices, EXT. AUDIO and the preamp, to a stereo pair: left into the left filter, right into the right.',
      specs: [{ label: 'Channels', value: '10' }],
    },
    {
      id: 'vcf',
      name: 'Dual Polivoks filter',
      module: 'filter',
      controls: [
        'vcf.lfreq',
        'vcf.lres',
        'vcf.lmode',
        'vcf.lmod',
        'vcf.rfreq',
        'vcf.rres',
        'vcf.rmode',
        'vcf.rmod',
        'vcf.link',
        'vcf.dist',
        'vcf.gain',
      ],
      description:
        'Two low-pass or band-pass filters, left and right, with CV on each cutoff (CV L normalled to CV R) and LINK, then a distortion blended in by DIST.',
      specs: [
        { label: 'Slope', value: '12 dB per octave' },
        { label: 'Chip', value: 'Polivoks' },
      ],
    },
    {
      id: 'fx',
      name: 'Dual cartridge effector',
      module: 'fx',
      passes: true,
      controls: [
        'fx.cartL',
        'fx.progL',
        'fx.cartR',
        'fx.progR',
        'fx.x',
        'fx.y',
        'fx.z',
        'fx.blend',
      ],
      description:
        'A cartridge effect on each side, blended with the dry side by BLEND; X, Y and Z set its parameters. With no cartridge it passes the sound on.',
      specs: [{ label: 'X, Y, Z CV', value: '−10 to +10 V' }],
    },
    {
      id: 'out',
      name: 'Outputs',
      module: 'out',
      passes: true,
      controls: ['fx.master'],
      description: 'MASTER VOLUME to the left and right outputs and the headphones.',
    },
  ],
  edges: [
    ...DRONES.flatMap((x) => x.edges),
    { id: 'c07', from: 'keys', to: 'v4', signal: 'cv', label: 'pitch' },
    { id: 'c08', from: 'keys', to: 'v5', signal: 'cv', label: 'pitch' },
    { id: 'c09', from: 'keys', to: 'v4', signal: 'gate' },
    { id: 'c10', from: 'keys', to: 'v5', signal: 'gate' },
    {
      id: 'c11',
      from: 'v4',
      to: 'v5',
      signal: 'audio',
      label: 'FM',
      levels: ['vb.cvamt'],
      breaks: 'vb.cv',
    },
    {
      id: 'c15',
      from: 'v4',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'mix.va.vol', pow: 2 }],
    },
    {
      id: 'c16',
      from: 'v5',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'mix.vb.vol', pow: 2 }],
    },
    {
      id: 'c20',
      from: 'preamp',
      to: 'mixer',
      signal: 'audio',
      levels: ['pre.gain', { id: 'mix.pre.vol', pow: 2 }],
    },
    { id: 'c21', from: 'mixer', to: 'vcf', signal: 'audio', label: 'left' },
    { id: 'c22', from: 'mixer', to: 'vcf', signal: 'audio', label: 'right' },
    { id: 'c23', from: 'vcf', to: 'fx', signal: 'audio', label: 'left' },
    { id: 'c24', from: 'vcf', to: 'fx', signal: 'audio', label: 'right' },
    { id: 'c25', from: 'fx', to: 'out', signal: 'audio', label: 'left', levels: ['fx.master'] },
    { id: 'c26', from: 'fx', to: 'out', signal: 'audio', label: 'right', levels: ['fx.master'] },
  ],
  jacks: {
    'd1.gate': 'v1',
    'd1.env': 'v1',
    'd1.cvin': 'v1',
    'd2.gate': 'v2',
    'd2.env': 'v2',
    'd2.cvin': 'v2',
    'd4.gate': 'v6',
    'd4.env': 'v6',
    'd4.cvin': 'v6',
    'd5.gate': 'v7',
    'd5.env': 'v7',
    'd5.cvin': 'v7',
    'd3.modout': 'v3',
    'd3.cvin': 'v3',
    'd3.gate': 'v3',
    'd3.env': 'v3',
    'd3.shin': 'v3',
    'd3.shclk': 'v3',
    'd3.shout': 'v3',
    'd6.modout': 'v8',
    'd6.cvin': 'v8',
    'd6.gate': 'v8',
    'd6.env': 'v8',
    'd6.shin': 'v8',
    'd6.shclk': 'v8',
    'd6.shout': 'v8',
    'va.voct': 'v4',
    'va.cv': 'v4',
    'va.pwmin': 'v4',
    'va.sync': 'v4',
    'ea.gate': 'v4',
    'ea.env': 'v4',
    'ea.vca': 'v4',
    'va.out': 'v4',
    'vb.voct': 'v5',
    'vb.cv': 'v5',
    'vb.pwmin': 'v5',
    'vb.osc': 'v5',
    'eb.gate': 'v5',
    'eb.env': 'v5',
    'eb.vca': 'v5',
    'vb.out': 'v5',
    'fx.cvx': 'fx',
    'fx.cvy': 'fx',
    'fx.cvz': 'fx',
    'vcf.cvl': 'vcf',
    'vcf.cvr': 'vcf',
    'lfoa.out': 'lfo',
    'lfob.out': 'lfo',
    'joy.outx': 'joy',
    'joy.outy': 'joy',
    'seq.pulse': 'seq',
    'seq.clk': 'seq',
    'seq.cv': 'seq',
    'seq.gate': 'seq',
    'pre.ext': 'preamp',
    'ef.env': 'preamp',
    'ef.gate': 'preamp',
    'kb.clock': 'keys',
    'kb.reset': 'keys',
    'kb.gatel': 'keys',
    'kb.gater': 'keys',
    'kb.press': 'keys',
    'kb.voct': 'keys',
    'ext.in': 'mixer',
    'out.r': 'out',
    'out.l': 'out',
  },
  omitted: {
    c27: 'VCO A’s dry output: its own OUT socket (`va.out`), drawn on its block and heard only through a cable.',
    c28: 'VCO B’s dry output: its own OUT socket (`vb.out`), drawn on its block and heard only through a cable.',
  },
};
