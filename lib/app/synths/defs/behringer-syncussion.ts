/**
 * Behringer SYNCUSSION SY-1 (2024): the definition (D1). Positions are pixels on the panel drawing from the cover of
 * the Quick Start Guide (`.context/app/synth-data/behringer-syncussion/raw/behringer-syncussion-panel.png`, 1950×620,
 * cut from page 1 rendered at 3×; local only), used directly as view units. The owner's spec is
 * `.context/app/synth-data/behringer-syncussion/behringer-syncussion.synth.json`.
 *
 * A synth written straight into the app (`adding-a-synth.md`), built on the Pearl original's definition: the voice and
 * the channel panel are `defs/syncussion-kit.ts`, shared by both, with channel 2 drawn 922 units to the right of
 * channel 1. What is the Behringer's own is here: each channel's FINE knob and TRIG button, the row of sockets along
 * the top, MIDI IN, and the maker's marks, tagged `brand` (the behringer logo and the printed SYNCUSSION and SY-1).
 *
 * The keys play the two channels as the SY-1's MIDI mode 1 does (notes 36 and 38 strike channels 1 and 2, pitch from
 * the panel), widened to the keyboard: channel 1 below middle C, channel 2 from it up. Mode 2, where MIDI notes set
 * each channel's pitch, is not modelled.
 */
import type { ControlValues, EngineParams, Jack, SynthDef } from '@/lib/app/synths/contract';
import {
  COL,
  drawChannel,
  outputArea,
  type PanelParts,
  syncussionEngine,
} from '@/lib/app/synths/defs/syncussion-kit';
import { type OmitEach } from '@/lib/app/synths/lib/def-kit';
import { fmtSemi } from '@/lib/app/synths/lib/maps';

const INK = '#ececea';
const ORANGE = '#e0602c';
/** Channel 2 sits this far right of channel 1. */
const CH2 = 922;
const LOW = 527;
const NOT_HERE = 'Not modelled here: a cable in it does nothing.';

const p: PanelParts = { controls: [], decor: [], areas: [] };
const jacks: Jack[] = [];
const text = (x: number, y: number, t: string, size = 17, brand = false): void => {
  p.decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...(brand ? { brand } : {}) });
};

// ── Faceplate print ───────────────────────────────────────────────────────
p.decor.push({
  t: 'logo',
  x: 216,
  y: 80,
  size: 20,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
p.decor.push(
  {
    t: 'text',
    x: 522,
    y: 106,
    text: 'SYNCUSSION',
    size: 56,
    anchor: 'middle',
    weight: 800,
    fill: ORANGE,
    brand: true,
  },
  {
    t: 'text',
    x: 818,
    y: 106,
    text: 'SY-1',
    size: 34,
    anchor: 'middle',
    weight: 800,
    fill: ORANGE,
    brand: true,
  }
);
for (const x of [69, 680, 1267, 1878])
  for (const y of [26, 592]) p.decor.push({ t: 'screw', x, y, r: 10 });

// ── The two channels, side by side ────────────────────────────────────────
for (const ch of [1, 2] as const) {
  const dx = ch === 1 ? 0 : CH2;
  drawChannel(p, ch, dx, 0, 'behringer', INK);
  p.areas.push(
    outputArea(
      ch,
      dx,
      0,
      `The channel’s level, at its own OUTPUT socket. Both channels are mixed at PHONES.`
    )
  );

  // FINE: the TUNE fader's fine knob, under it
  p.controls.push({
    id: `ch${ch}.fine`,
    type: 'knob',
    x: COL.tune + dx,
    y: LOW,
    r: 12,
    style: 'obxa',
    labelPos: 'none',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'osc',
    label: 'FINE',
    name: `FINE (channel ${ch})`,
    fmt: (t) => fmtSemi((t - 5) / 5),
    help: 'Fine tuning, a semitone either way, for matching the drum to a song’s key once TUNE is close.',
  });
  text(COL.tune + dx, LOW - 30, 'FINE', 15);

  // TRIG: strikes the channel from the panel, and its lamp shows any strike
  p.controls.push({
    id: `ch${ch}.trig`,
    type: 'button',
    x: 135 + dx,
    y: LOW,
    w: 30,
    h: 30,
    cap: 'black',
    kind: 'bool',
    def: false,
    ui: true,
    module: 'mode',
    label: `CH ${ch} TRIG`,
    help: `Strikes channel ${ch} by hand, and lights on any strike. Not modelled here: play ${ch === 1 ? 'the keys below middle C' : 'middle C and the keys above it'}.`,
  });
  text(135 + dx, LOW - 30, `CH ${ch} TRIG`, 15);
  p.decor.push(
    { t: 'line', x1: 135 + dx, y1: 466, x2: 135 + dx, y2: 482, w: 2 },
    // the LFO lamp, the dot between SPEED and DEPTH: it flashes at the LFO rate on the hardware. Dark here: the app's
    // LFO lamp follows one LFO, and this panel has one per channel
    { t: 'led', x: 680 + dx, y: 193, r: 6, color: 'red' }
  );
}

// ── The sockets along the top ─────────────────────────────────────────────
const JY = 98;
const jackAt = (
  id: string,
  x: number,
  label: string,
  arrow: 'up' | 'down',
  rest: OmitEach<Jack, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos'>
): void => {
  jacks.push({ id, x, y: JY, r: 15, label, labelPos: 'none', ...rest });
  text(x, 60, label, 16);
  p.decor.push({ t: 'arrow', x, y: 72, dir: arrow, size: 4 });
};
for (const ch of [1, 2] as const) {
  const x0 = ch === 1 ? 1004 : 1321;
  const part = (ch - 1) as 0 | 1;
  jackAt(`j.ch${ch}Out`, x0, 'OUTPUT', 'up', {
    dir: 'out',
    signal: 'vca',
    part,
    name: `CH ${ch} OUTPUT`,
    help: `Channel ${ch} alone, before its OUTPUT fader, for a mixer channel of its own. The same signal is at the rear CHANNEL ${ch} OUTPUT.`,
  });
  jackAt(`j.ch${ch}Tune`, x0 + 80, 'TUNE', 'down', {
    dir: 'in',
    dest: null,
    part,
    name: `CH ${ch} TUNE`,
    help: `Retunes channel ${ch} from a pedal, the original’s TP-01 tune pedal. The socket supplies no voltage of its own. ${NOT_HERE}`,
  });
  jackAt(`j.ch${ch}Trig`, x0 + 159, 'TRIG', 'down', {
    dir: 'in',
    dest: null,
    part,
    name: `CH ${ch} TRIGGER`,
    help: `Strikes channel ${ch} from a drum pad, a drum trigger or a pulse; how hard sets how loud and bright. ${NOT_HERE}`,
  });
  p.controls.push({
    id: `ch${ch}.sense`,
    type: 'knob',
    x: x0 + 238,
    y: JY,
    r: 12,
    style: 'obxa',
    labelPos: 'none',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'util',
    label: 'SENSE',
    name: `SENSE (channel ${ch})`,
    help: `How sensitive channel ${ch}’s TRIG socket is, so a pad strikes it every time without false strikes from the other drums. Not modelled here: the keys always strike.`,
  });
  text(x0 + 238, 60, 'SENSE', 16);
}
jackAt('j.phones', 1638, 'PHONES', 'up', {
  dir: 'out',
  signal: 'out',
  name: 'PHONES',
  help: 'Headphones: both channels, after their OUTPUT faders.',
});
jackAt('j.mute', 1716, 'MUTE', 'down', {
  dir: 'in',
  dest: null,
  name: 'MUTE',
  help: `A footswitch here cuts off both channels’ decay, damping the drums. ${NOT_HERE}`,
});
text(1122, 34, '— CH 1 —', 16);
text(1440, 34, '— CH 2 —', 16);
p.decor.push(
  { t: 'line', x1: 1282, y1: 44, x2: 1282, y2: 118, w: 2 },
  { t: 'line', x1: 1600, y1: 44, x2: 1600, y2: 118, w: 2 },
  { t: 'din', x: 1832, y: JY, r: 33 }
);
text(1832, 50, 'MIDI IN', 16);
p.areas.push({
  id: 'sockets',
  label: 'Sockets and MIDI',
  module: 'util',
  keywords: 'jacks inputs outputs trigger pads pedal headphones mute midi sense',
  rects: [{ x: 960, y: 8, w: 935, h: 116 }],
  help: 'Each channel’s OUTPUT, a TUNE socket for a pedal, a TRIG socket and its SENSE knob for a drum pad, then PHONES, MUTE for a footswitch, and MIDI IN. Here the keys strike the channels in place of pads and MIDI.',
});

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  return syncussionEngine(v, 0.8);
}

const init: ControlValues = Object.fromEntries(p.controls.map((c) => [c.id, c.def]));

const behringerSyncussion: SynthDef & { version: number } = {
  id: 'behringer-syncussion',
  version: 1,
  name: 'SYNCUSSION SY-1',
  maker: 'Behringer',
  year: 2024,
  heritage: 'Based on the 1979 Pearl Syncussion SY-1',
  summary:
    'Two identical channels, each two oscillators (alone, mixed, frequency-modulated or with noise) → a pitch sweep, an LFO and a sample and hold on pitch → a low-pass filter swept by the decay → a VCA, each with its own output, struck from pads, triggers or MIDI.',
  view: { w: 1950, h: 620 },
  theme: {
    panel: '#202122',
    panel2: '#151617',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'metal',
    cheekW: 36,
    knobRing: false,
    jack: 'black',
    button: 'black',
  },
  signalNames: {
    osc1: 'oscillator 1',
    osc2: 'oscillator 2',
    env1: 'the decay',
    env1v: 'the decay, scaled by how hard the channel is struck',
    env2: 'the sweep',
    lfo: 'the LFO',
    sh: 'the sample and hold',
    vca: 'the channel’s output',
    gate: 'the strike',
    out: 'both channels',
  },
  destNames: {
    pitch1: 'oscillator 1 pitch',
    pitch2: 'oscillator 2 pitch',
    cutoff: 'the filter cutoff',
  },
  decor: p.decor,
  areas: p.areas,
  controls: p.controls,
  jacks,
  init,
  toEngine,
};

export default behringerSyncussion;
