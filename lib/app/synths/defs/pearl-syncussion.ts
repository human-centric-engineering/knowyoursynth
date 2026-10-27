/**
 * Pearl Syncussion SY-1 (1979): the definition (D1). The owner's spec is
 * `.context/app/synth-data/pearl-syncussion/pearl-syncussion.synth.json`. Its photo
 * (`raw/Syncussion SY-1 Original.jpg`, 474×355, local only) is a small three-quarter view, so the two channels are
 * drawn from the channel geometry of the Behringer's panel drawing, which copies the original's columns one for one,
 * and stacked as the photo shows them: channel 1 above channel 2, the orange SYNCUSSION SY-1 at the top right, the
 * POWER switch under channel 2's OUTPUT.
 *
 * A synth written straight into the app (`adding-a-synth.md`): no content (sounds, lineage, unusual notes), a
 * `version`, and the maker's marks tagged `brand` (the printed SYNCUSSION and SY-1). The voice, the channel panel and
 * the reasons for both are in `defs/syncussion-kit.ts`, shared with the Behringer recreation.
 *
 * The original is played from drum pads or microphones on its rear INPUT sockets; here the keys strike the pads,
 * channel 1 below middle C and channel 2 from it up, and the key's velocity is how hard the pad was hit. The rear
 * panel (the two INPUTs, the OUTPUT, the TUNE and MUTE pedal sockets and the SENSITIVITY knobs) is not on the top
 * panel, so it is not drawn.
 */
import type { ControlValues, EngineParams, SynthDef } from '@/lib/app/synths/contract';
import {
  type Channel,
  type PanelParts,
  drawChannel,
  outputArea,
  syncussionEngine,
} from '@/lib/app/synths/defs/syncussion-kit';

const INK = '#e8e8e2';
const ORANGE = '#d9582e';
const DX = -27;
/** Channel 1 above, channel 2 below. */
const DY: Record<Channel, number> = { 1: -37, 2: 428 };

const p: PanelParts = { controls: [], decor: [], areas: [] };

// ── Faceplate print ───────────────────────────────────────────────────────
p.decor.push(
  {
    t: 'text',
    x: 730,
    y: 62,
    text: 'SYNCUSSION',
    size: 54,
    anchor: 'middle',
    weight: 800,
    fill: ORANGE,
    brand: true,
  },
  {
    t: 'text',
    x: 918,
    y: 62,
    text: 'SY-1',
    size: 24,
    anchor: 'middle',
    weight: 800,
    fill: ORANGE,
    brand: true,
  }
);
for (const [x, y] of [
  [22, 22],
  [487, 22],
  [953, 22],
  [22, 548],
  [487, 548],
  [953, 548],
  [22, 1014],
  [487, 1014],
  [953, 1014],
])
  p.decor.push({ t: 'screw', x, y, r: 9 });

// ── The two channels ──────────────────────────────────────────────────────
for (const ch of [1, 2] as const) {
  const dy = DY[ch];
  drawChannel(p, ch, DX, dy, 'pearl', INK);
  // the trigger lamp: it lights while the channel sounds
  p.decor.push(
    { t: 'led', x: 105 + DX, y: 527 + dy, r: 7, color: 'red', litWhen: { voice: ch - 1 } },
    {
      t: 'text',
      x: 122 + DX,
      y: 532 + dy,
      text: `CH.${ch} TRIG.IND.`,
      size: 13,
      anchor: 'start',
    }
  );
  p.areas.push(
    outputArea(
      ch,
      DX,
      dy,
      'The channel’s level. Both channels are mixed to the one OUTPUT socket on the back.',
      ch === 2 ? 500 : 575
    )
  );
}

// ── POWER, under channel 2's OUTPUT ───────────────────────────────────────
const PX = 878 + DX;
const PY = 538 + DY[2];
p.controls.push({
  id: 'sys.power',
  type: 'toggle',
  x: PX,
  y: PY,
  w: 24,
  kind: 'bool',
  def: true,
  module: 'out',
  labelPos: 'none',
  label: 'POWER',
  help: 'Switches the Syncussion on and off; the lamp beside it lights while it is on. Off, it is silent.',
});
p.decor.push(
  { t: 'text', x: PX, y: PY - 20, text: 'ON', size: 13, anchor: 'middle' },
  { t: 'rect', x: PX + 18, y: PY - 9, w: 58, h: 18, r: 2, fill: INK },
  { t: 'text', x: PX + 47, y: PY + 5, text: 'POWER', size: 13, anchor: 'middle', fill: '#2c2d2f' },
  { t: 'led', x: PX + 47, y: PY - 20, r: 5, color: 'red', litWhen: { id: 'sys.power', eq: true } }
);
p.areas.push({
  id: 'power',
  label: 'Power',
  module: 'out',
  keywords: 'on off switch mains',
  rects: [{ x: 856 + DX, y: 500 + DY[2], w: 106, h: 75 }],
  help: 'The POWER switch and its lamp.',
});

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  return syncussionEngine(v, v['sys.power'] ? 0.8 : 0);
}

const init: ControlValues = Object.fromEntries(p.controls.map((c) => [c.id, c.def]));

const pearlSyncussion: SynthDef & { version: number } = {
  id: 'pearl-syncussion',
  version: 1,
  name: 'Syncussion SY-1',
  maker: 'Pearl',
  year: 1979,
  heritage: 'A two-channel drum synthesizer played from drum pads',
  summary:
    'Two identical channels, each two oscillators (alone, mixed, frequency-modulated or with noise) → a pitch sweep, an LFO and a sample and hold on pitch → a low-pass filter swept by the decay → a VCA, struck by a pad and louder and brighter the harder it is hit.',
  view: { w: 975, h: 1036 },
  theme: {
    panel: '#3b3c3e',
    panel2: '#2c2d2f',
    ink: INK,
    font: 'helv',
    weight: 600,
    cheeks: 'none',
    cheekW: 0,
    knobRing: false,
  },
  signalNames: {
    osc1: 'oscillator 1',
    osc2: 'oscillator 2',
    env1: 'the decay',
    env1v: 'the decay, scaled by how hard the pad is hit',
    env2: 'the sweep',
    lfo: 'the LFO',
    sh: 'the sample and hold',
    gate: 'the strike',
    out: 'the output',
  },
  destNames: {
    pitch1: 'oscillator 1 pitch',
    pitch2: 'oscillator 2 pitch',
    cutoff: 'the filter cutoff',
  },
  decor: p.decor,
  areas: p.areas,
  controls: p.controls,
  jacks: [],
  init,
  toEngine,
};

export default pearlSyncussion;
