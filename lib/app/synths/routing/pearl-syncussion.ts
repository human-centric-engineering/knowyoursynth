/**
 * Pearl Syncussion SY-1 signal routing, projected from its spec
 * (`.context/app/synth-data/pearl-syncussion/pearl-syncussion.synth.json`, 0.10.0): block and edge ids are the spec's
 * module and connection ids; switches and levels are the definition's (`defs/pearl-syncussion.ts`, its voice in
 * `defs/syncussion-kit.ts`). The two channels are drawn by the builder it shares with the Behringer
 * (`routing/syncussion-voice.ts`, `c02`–`c26` for channel 1, `c28`–`c52` for channel 2, as the spec numbers them),
 * with where `toEngine()` overrides the spec there (mode D's sweep).
 *
 * Where the definition says more than the spec, it decides. OUTPUT is each channel's level into the mix
 * (`level10()`, curved by 1.7), not a scale on its VCA's envelope, so it scales the channel's way into the output mix
 * (`c01`, `c27`) rather than `c26` and `c52`; and POWER, which the spec files under MUTE, silences everything, so it
 * holds both. The definition has no sockets: the keys strike the channels in place of pads, and there is no MUTE
 * pedal, so the mute and its connections are left out.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { cid, PEARL_LINKS, syncussionChannel } from '@/lib/app/synths/routing/syncussion-voice';

const channel = (ch: 1 | 2) =>
  syncussionChannel(ch, (link) => cid(PEARL_LINKS[link] + (ch - 1) * 26), 'pearl');
const CH1 = channel(1);
const CH2 = channel(2);

export const routing: SynthRouting = {
  synth: 'pearl-syncussion',
  out: 'outmix',
  blocks: [
    ...CH1.blocks,
    ...CH2.blocks,
    {
      id: 'outmix',
      name: 'Output mix',
      module: 'out',
      passes: true,
      controls: ['sys.power'],
      description: 'Sums both channels to the single OUTPUT. POWER off silences it.',
      specs: [{ label: 'Output', value: '1 Vpp, 10 kΩ' }],
    },
  ],
  edges: [
    ...CH1.edges,
    ...CH2.edges,
    ...([1, 2] as const).map((ch) => ({
      id: ch === 1 ? 'c01' : 'c27',
      from: `ch${ch}_vca`,
      to: 'outmix',
      signal: 'audio' as const,
      when: { id: 'sys.power', eq: true },
      levels: [{ id: `ch${ch}.output`, pow: 1.7 }],
    })),
  ],
  jacks: {},
  omitted: {
    ...CH1.omitted,
    ...CH2.omitted,
    mute: 'The definition has no MUTE socket or pedal.',
    c08: 'MUTE into channel 1’s decay: the definition has no MUTE pedal.',
    c34: 'MUTE into channel 2’s decay: the definition has no MUTE pedal.',
  },
};
