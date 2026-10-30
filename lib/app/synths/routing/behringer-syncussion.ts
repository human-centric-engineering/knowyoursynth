/**
 * Behringer SYNCUSSION SY-1 signal routing, projected from its spec
 * (`.context/app/synth-data/behringer-syncussion/behringer-syncussion.synth.json`, 0.10.0): block and edge ids are the
 * spec's module and connection ids; switches, levels and jacks are the definition's (`defs/behringer-syncussion.ts`,
 * its voice in `defs/syncussion-kit.ts`). The two channels are drawn by the builder it shares with the Pearl
 * (`routing/syncussion-voice.ts`, `c03`–`c28` for channel 1, `c31`–`c56` for channel 2, as the spec numbers them),
 * with where `toEngine()` overrides the spec there (mode D's sweep).
 *
 * The spec ends each channel at its own OUTPUT sockets and draws no mix, though PHONES carries both. The routing needs
 * one block to end at, so it adds one the spec does not have, `phones`, with an edge from each VCA (`ch1_phones`,
 * `ch2_phones`). OUTPUT scales those edges, as `toEngine()` mixes the channels by it (`level10()`, curved by 1.7); the
 * channel's own OUTPUT socket is before the fader.
 *
 * Where it says less, it decides. The keys strike the channels (below middle C channel 1, the rest channel 2) and never
 * set their pitch, so MIDI mode 2's pitch and the decay CCs are left out. Its TUNE, TRIG and MUTE sockets are drawn
 * where the spec puts them, though a cable in them does nothing here.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { cid, PEARL_LINKS, syncussionChannel } from '@/lib/app/synths/routing/syncussion-voice';

/** The Pearl's numbering, one higher up to its `c07` and two higher after (MIDI's decay CC comes between). */
const channel = (ch: 1 | 2) =>
  syncussionChannel(
    ch,
    (link) => {
      const n = PEARL_LINKS[link];
      return cid(n + (n <= 7 ? 1 : 2) + (ch - 1) * 28);
    },
    'behringer'
  );
const CH1 = channel(1);
const CH2 = channel(2);

export const routing: SynthRouting = {
  synth: 'behringer-syncussion',
  out: 'phones',
  blocks: [
    {
      id: 'midi',
      name: 'Keys / MIDI',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Strikes the channels: keys below middle C channel 1, middle C and up channel 2, harder for a higher velocity.',
      specs: [{ label: 'MIDI', value: '5-pin DIN in and thru, USB, 16 channels' }],
    },
    {
      id: 'mute',
      name: 'Mute',
      module: 'util',
      passes: true,
      description: 'A footswitch at MUTE cuts off both channels’ decay, damping the drums.',
    },
    ...CH1.blocks,
    ...CH2.blocks,
    {
      id: 'phones',
      name: 'PHONES',
      module: 'out',
      passes: true,
      description: 'Both channels after their OUTPUT faders, at the headphone socket.',
      specs: [{ label: 'Phones', value: '3.5 mm TRS stereo, 5 mW into 32 Ω' }],
    },
  ],
  edges: [
    { id: 'c01', from: 'midi', to: 'ch1_trig', signal: 'gate' },
    { id: 'c29', from: 'midi', to: 'ch2_trig', signal: 'gate' },
    { id: 'c10', from: 'mute', to: 'ch1_env', signal: 'gate', label: 'mute' },
    { id: 'c38', from: 'mute', to: 'ch2_env', signal: 'gate', label: 'mute' },
    ...CH1.edges,
    ...CH2.edges,
    ...([1, 2] as const).map((ch) => ({
      id: `ch${ch}_phones`,
      from: `ch${ch}_vca`,
      to: 'phones',
      signal: 'audio' as const,
      levels: [{ id: `ch${ch}.output`, pow: 1.7 }],
    })),
  ],
  jacks: {
    'j.ch1Out': 'ch1_vca',
    'j.ch1Tune': 'ch1_tune',
    'j.ch1Trig': 'ch1_trig',
    'j.ch2Out': 'ch2_vca',
    'j.ch2Tune': 'ch2_tune',
    'j.ch2Trig': 'ch2_trig',
    'j.phones': 'phones',
    'j.mute': 'mute',
  },
  omitted: {
    ...CH1.omitted,
    ...CH2.omitted,
    c02: 'MIDI mode 2’s pitch into channel 1: the keys strike the channels but never set their pitch here.',
    c30: 'MIDI mode 2’s pitch into channel 2: the keys strike the channels but never set their pitch here.',
    c09: 'MIDI CC 80 into channel 1’s decay: the definition reads no CCs.',
    c37: 'MIDI CC 81 into channel 2’s decay: the definition reads no CCs.',
  },
};
