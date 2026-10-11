/**
 * Behringer 2-XM: the definition (D1). Positions are pixels on the 2000×626 product image, used directly as view
 * units. The data model is the 2-XM synth.json (Quick Start Guide, 108 numbered controls), which follows the Oberheim
 * Two Voice: two complete SEM voices side by side, a master section and a 16-jack patchbay per module.
 *
 * The two modules are two different voices, so toEngine() returns EngineParams `dual`: XM1 at the top level, XM2 in
 * `dual.b`. Every control and jack of XM2 is the same as XM1's, 707 units to the right, so one builder draws both.
 * XM2's jacks carry `part: 1`, which sends their cables to XM2's voice.
 *
 * Transliterated from the prototype file `src/synths/2-xm.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's mark tagged `brand` (the printed "2-XM" badge), and panel
 * values read through `num()`.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvParams,
  EnvSignal,
  InputJack,
  Jack,
  JackHearContext,
  KnobControl,
  OscParams,
  OutputJack,
  SlideControl,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Partial<Omit<ContinuousValue, 'kind'>> &
  Partial<Pick<KnobControl, 'r'>>;
type SlideRest = OmitEach<
  SlideControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'orient' | 'labelPos'
> &
  Partial<Pick<SlideControl, 'w' | 'h'>>;
type JackIn = OmitEach<
  InputJack,
  'id' | 'x' | 'y' | 'r' | 'label' | 'name' | 'labelPos' | 'dir' | 'part'
>;
type JackOut = OmitEach<
  OutputJack,
  'id' | 'x' | 'y' | 'r' | 'label' | 'name' | 'labelPos' | 'dir' | 'part'
>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'spacing' | 'fill' | 'brand'>>;
/** One module's voice: a full voice without the volume, which is the top-level one. */
type Voice = Omit<EngineParams, 'volume' | 'dual'>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the envelope times and the LFO range. The tapers, the cutoff range, the resonance law, the pitch
// ranges of FINE and MODULATION and the crossfade law are this app's estimates (see the "What is not modelled" notes).
const attackTime = (v: number): number => expMap(v / 10, 0.003, 6);
const decayTime = (v: number): number => expMap(v / 10, 0.014, 18);
const releaseTime = (v: number): number => expMap(v / 10, 0.01, 15);
const lfoHz = (v: number): number => expMap(v / 10, 0.1, 55);
const vcfHz = (v: number): number => expMap(v / 10, 20, 18000);
const portaTime = (v: number): number => 3 * Math.pow(v / 10, 2);
/** VCO MODULATION turned counter-clockwise: frequency modulation depth in semitones. */
const fmDepth = (x: number): number => 24 * Math.pow(Math.abs(x) / 5, 2);
/** VCF MODULATION: bipolar cutoff depth in octaves. */
const vcfOct = (x: number): number => Math.sign(x) * 7 * Math.pow(Math.abs(x) / 5, 1.5);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const DX = 707; // XM2 sits this far to the right of XM1

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#23221f';
const PANEL = '#f7f1dc';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x, y: y + size * 0.35, text: t, size, anchor: 'middle', ...rest });
};
const small = (x: number, y: number, t: string): void => text(x, y, t, 11);
const frame = (x: number, y: number, w: number, h: number): void => {
  decor.push({ t: 'frame', x, y, w, h, r: 10, sw: 2, dash: '8 5', labelAt: 'none' });
};
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.sin((a * Math.PI) / 180),
  cy - r * Math.cos((a * Math.PI) / 180),
];
/** The two curved arrows printed round a small knob, pointing down at each end of its travel. */
const arrows = (x: number, y: number, r = 25): void => {
  decor.push({ t: 'arc', x, y, r, a0: -148, a1: -32, w: 1.8 });
  decor.push({ t: 'arc', x, y, r, a0: 32, a1: 148, w: 1.8 });
  (
    [
      [-148, -1],
      [148, 1],
    ] as const
  ).forEach(([a, dir]) => {
    const tip = polar(x, y, r, a + dir * 9);
    const b1 = polar(x, y, r + 4.5, a - dir * 3);
    const b2 = polar(x, y, r - 4.5, a - dir * 3);
    decor.push({
      t: 'path',
      d: `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${b1[0].toFixed(1)} ${b1[1].toFixed(1)} L${b2[0].toFixed(1)} ${b2[1].toFixed(1)} Z`,
      w: 0,
      fill: INK,
    });
  });
};
const big = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 42,
    style: 'obxa',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    labelPos: 'none',
    ...rest,
  });
};
const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 15,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    labelPos: 'none',
    ...rest,
  });
};
const slide = (id: string, x: number, y: number, rest: SlideRest): void => {
  controls.push({ id, type: 'slide', x, y, w: 54, h: 21, orient: 'h', labelPos: 'none', ...rest });
};
/** Printed 3.5 mm socket that is not part of the patching (STEREO OUT). */
const socket = (x: number, y: number, r = 18): void => {
  decor.push({ t: 'circle', x, y, r: r * 1.02, fill: 'url(#kysBlack)', stroke: '#000', sw: 1.2 });
  decor.push({ t: 'circle', x, y, r: r * 0.68, fill: 'url(#kysNut)', stroke: '#2a2b2e', sw: 1 });
  decor.push({ t: 'circle', x, y, r: r * 0.46, fill: '#050505', stroke: 'none', sw: 0 });
};
const crossfade = (x: number): string =>
  x === 0 ? 'off' : `${x < 0 ? 'saw' : 'pulse'} ${Math.round((Math.abs(x) / 5) * 100)} %`;
const bipolarFmt = (x: number, neg: string, pos: string): string =>
  Math.abs(x) < 0.05 ? 'off' : `${x < 0 ? neg : pos} ${Math.round((Math.abs(x) / 5) * 100)} %`;

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[
  [78.7, 25],
  [79, 603],
  [796, 25],
  [796, 603],
  [1203, 25],
  [1203, 603],
  [1920, 25],
  [1920, 603],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 11 }));
[754, 1461.5, 1688.5, 1820.5].forEach((x) =>
  decor.push({ t: 'line', x1: x, y1: 20, x2: x, y2: 606, w: 2 })
);
text(401, 28, 'SYNTHESIZER EXPANDER MODULE 1', 20);
text(1187, 28, 'SYNTHESIZER EXPANDER', 20, { anchor: 'end' });
text(1219, 28, 'MODULE 2', 20, { anchor: 'start' });

// ── One module (XM1 or XM2) ───────────────────────────────────────────────
const MOD_SRC = (n: number): ControlOption[] => [
  { v: `env${n}`, label: `ENV ${n}` },
  { v: `env${n}_vel`, label: 'E+V' },
  { v: 'lfo', label: 'LFO' },
];
const areas: Area[] = [];
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});

function buildModule(k: 0 | 1): void {
  const ox = k * DX;
  const X = (x: number): number => x + ox;
  const m = `xm${k + 1}`;
  const M = `XM${k + 1}`;
  const id = (s: string): string => `${m}_${s}`;

  frame(X(60), 45, 131, 400);
  frame(X(251), 45, 132, 400);
  frame(X(419), 45, 323, 400);
  frame(X(83), 457, 276, 126);
  frame(X(442), 457, 276, 126);

  // VCO 1 and VCO 2: the same column twice, 192 units apart
  [1, 2].forEach((n) => {
    const cx = X(125 + 192 * (n - 1));
    const vco = `VCO ${n}`;
    text(cx, 59, vco, 19);
    text(cx, 78, 'FREQUENCY');
    big(id(`vco${n}.coarse`), cx, 134.5, {
      name: `${M} VCO ${n} frequency`,
      module: 'osc',
      fmt: (v) => fmtSemi((v - 5) * 6),
      help: `Tunes ${M}’s ${vco} over five octaves. The knob is continuous, so intervals are set by ear: each step of the scale is six semitones, so 7 is an octave up and 3 an octave down.`,
    });
    knob(id(`vco${n}.fine`), cx + 66, 81, {
      min: -5,
      max: 5,
      def: 0,
      name: `${M} VCO ${n} fine tune`,
      module: 'osc',
      fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 20)} cents`,
      help: `Fine tuning for ${M}’s ${vco}, here up to a semitone either way. Set it a little off the other oscillator and the two beat slowly, which thickens the sound.`,
    });
    text(cx, 201, 'MODULATION');
    knob(id(`vco${n}.modulation`), cx + 1, 237, {
      min: -5,
      max: 5,
      def: 0,
      name: `${M} VCO ${n} modulation`,
      module: 'mod',
      fmt: (v) =>
        Math.abs(v) < 0.05
          ? 'off'
          : v < 0
            ? `FM ${fmtSemi(fmDepth(v))}`
            : `PWM ${Math.round((v / 5) * 80)} %`,
      help: `One knob, two jobs. Turned left of centre it moves ${vco}’s pitch (FREQ); turned right it moves its pulse width (PW). The switch below picks what does the moving. At the centre it does nothing.`,
    });
    arrows(cx + 1, 237);
    small(cx - 26, 267.5, 'FREQ');
    small(cx + 24, 267.5, 'PW');
    small(cx - 39, 296, 'ENV');
    small(cx + 1, 296, 'E+V');
    small(cx + 38, 296, 'LFO');
    small(cx - 33, 309, String(n));
    slide(id(`vco${n}.mod_source`), cx + 4, 316.5, {
      w: 53,
      h: 20,
      kind: 'enum',
      options: MOD_SRC(n),
      def: `env${n}`,
      name: `${M} VCO ${n} modulation source`,
      module: 'mod',
      help: `What the MODULATION knob above uses to move ${vco}: ENV ${n} (a sweep on every note), E+V (the same envelope, deeper the harder you play) or the LFO (a steady wobble).`,
    });
    text(cx, 357, 'PULSE WIDTH');
    knob(id(`vco${n}.pulse_width`), cx + 1, 393.5, {
      min: 10,
      max: 90,
      def: 50,
      name: `${M} VCO ${n} pulse width`,
      module: 'osc',
      fmt: (v) => `${Math.round(v)} %`,
      help: `Width of ${vco}’s pulse wave. At 50 % it is a square, hollow like a clarinet; towards either end it thins to a nasal, reedy pulse. Only heard when the VCO ${n} knob in the VCF is turned towards PUL.`,
    });
    arrows(cx + 1, 393.5);
    small(cx - 24, 424, '10%');
    small(cx + 26, 424, '90%');
  });
  text(X(221), 158, 'SYNC');
  small(X(262), 179.5, 'ON');
  slide(id('vco2.sync'), X(223), 178.5, {
    kind: 'bool',
    def: false,
    onAt: 'bottom',
    name: `${M} VCO 2 sync`,
    module: 'osc',
    help: `Hard sync: VCO 2 restarts every time VCO 1 does. VCO 2’s FREQUENCY then changes its tone rather than its note, from a hollow buzz to a tearing snarl.`,
  });

  // VCF
  text(X(581), 59, 'VCF', 19);
  text(X(484), 78, 'FREQUENCY');
  big(id('vcf.frequency'), X(484), 134.6, {
    def: 8,
    name: `${M} VCF frequency`,
    module: 'filter',
    fmt: (v) => fmtHz(vcfHz(v)),
    help: `The filter’s cutoff. What it does depends on the NOTCH knob: in low-pass, lower is darker; in high-pass, higher is thinner; in the middle it moves a notch through the sound.`,
  });
  text(X(676), 78, 'RESONANCE');
  big(id('vcf.resonance'), X(676), 134.3, {
    def: 0,
    name: `${M} VCF resonance`,
    module: 'filter',
    fmt: pct,
    help: `A boost at the cutoff that makes the filter sound vocal. This 2-pole filter stays smooth and round even when turned well up.`,
  });
  text(X(485), 201, 'MODULATION');
  knob(id('vcf.modulation'), X(486), 237.5, {
    min: -5,
    max: 5,
    def: 0,
    name: `${M} VCF modulation`,
    module: 'filter',
    fmt: (v) =>
      Math.abs(v) < 0.05 ? 'off' : `${v > 0 ? '+' : '−'}${Math.abs(vcfOct(v)).toFixed(1)} oct`,
    help: `How far the source on the switch below moves the cutoff. Right of centre pushes it up, left of centre pulls it down, so the envelope can close the filter as well as open it.`,
  });
  arrows(X(486), 237.5);
  small(X(470), 267.5, '−');
  small(X(501), 267.5, '+');
  text(X(676), 201, 'NOTCH');
  knob(id('vcf.notch'), X(676), 237.5, {
    min: -5,
    max: 5,
    def: -5,
    name: `${M} VCF notch`,
    module: 'filter',
    fmt: (v) => {
      const t = (v + 5) / 10;
      return t < 0.04
        ? 'low-pass'
        : t > 0.96
          ? 'high-pass'
          : Math.abs(t - 0.5) < 0.04
            ? 'notch'
            : `${Math.round((1 - t) * 100)} % LP · ${Math.round(t * 100)} % HP`;
    },
    help: `Sweeps the filter type. Fully left is low-pass, fully right high-pass, and in the middle the two meet in a notch that takes a slice out of the sound. With RESPONSE at BP this knob does nothing.`,
  });
  arrows(X(676), 237.5);
  small(X(658), 267.5, 'LP');
  small(X(697), 267.5, 'HP');
  small(X(446), 296, 'ENV');
  small(X(483), 296, 'EXT');
  small(X(521), 296, 'LFO');
  small(X(446), 309, '2');
  slide(id('vcf.mod_source'), X(487), 316.4, {
    kind: 'enum',
    options: [
      { v: 'env2', label: 'ENV 2' },
      { v: 'ext', label: 'EXT' },
      { v: 'lfo', label: 'LFO' },
    ],
    def: 'env2',
    name: `${M} VCF modulation source`,
    module: 'filter',
    help: `What MODULATION uses to move the cutoff: ENV 2, the LFO, or EXT. EXT is a cable in ${M}’s VCF CV jack; with no cable there, it is ENV 2 scaled by how hard you play.`,
  });
  small(X(649), 296, 'LP-HP');
  small(X(715), 296, 'BP');
  slide(id('vcf.response'), X(679), 316.5, {
    w: 53,
    h: 20,
    kind: 'enum',
    options: [
      { v: 'lp_hp', label: 'LP-HP' },
      { v: 'bp', label: 'BP' },
    ],
    def: 'lp_hp',
    name: `${M} VCF response`,
    module: 'filter',
    help: `LP-HP lets the NOTCH knob sweep from low-pass through notch to high-pass. BP switches to band-pass: only a band around the cutoff gets through, thin and nasal.`,
  });
  (
    [
      [485, 'VCO 1', 'SAW', 'PUL', 469, 508],
      [580, 'VCO 2', 'SAW', 'PUL', 564, 604],
      [676.5, 'EXT', 'IN', 'NOISE', 657, 706],
    ] as const
  ).forEach(([x, top, l, r, lx, rx]) => {
    text(X(x - 1), 357, top);
    small(X(lx), 424, l);
    small(X(rx), 424, r);
    arrows(X(x), 393);
  });
  knob(id('vcf.mix_vco1'), X(485), 393, {
    min: -5,
    max: 5,
    def: -3,
    name: `${M} VCO 1 into the filter`,
    module: 'mixer',
    fmt: crossfade,
    help: `How VCO 1 reaches the filter. Left of centre it sends the sawtooth, right of centre the pulse, getting louder the further you turn. At the centre VCO 1 is silent.`,
  });
  knob(id('vcf.mix_vco2'), X(580), 393, {
    min: -5,
    max: 5,
    def: 0,
    name: `${M} VCO 2 into the filter`,
    module: 'mixer',
    fmt: crossfade,
    help: `How VCO 2 reaches the filter: sawtooth to the left, pulse to the right, silent at the centre.`,
  });
  knob(id('vcf.mix_ext'), X(676.5), 393, {
    min: -5,
    max: 5,
    def: 0,
    name: `${M} external input or noise`,
    module: 'mixer',
    fmt: (v) => bipolarFmt(v, 'in', 'noise'),
    help: `Left of centre brings in ${M}’s EXT input, at the level set by ${M} EXT LVL; with no cable there that is a 440 Hz tuning tone. Right of centre brings in white noise. At the centre, neither.`,
  });

  // ENV 1 (VCA), LFO and VCA switch, ENV 2
  text(X(200), 473, 'ENV 1', 19);
  text(X(252), 474, '(VCA)', 14);
  text(X(581), 473, 'ENV 2', 19);
  const ENV_DEF: Record<number, number[]> = { 1: [0, 3, 10], 2: [0, 4, 4] };
  [1, 2].forEach((n) => {
    const ex = n === 1 ? [126, 221.5, 317.5] : [485, 580, 676.3];
    const what =
      n === 1
        ? 'the loudness of each note and VCO 1’s modulation'
        : 'the filter and VCO 2’s modulation';
    const HELP: Record<string, string> = {
      attack: `ENV ${n}: how long it takes to rise to full after a key goes down, from 3 ms to 6 s. It shapes ${what}.`,
      decay: `ENV ${n}: how long it takes to fall to the sustain level, and also how long it takes to die away after the key is let go. There is no separate release knob.`,
      sustain: `ENV ${n}: the level held while the key is down. At 0 every note dies away by itself; at 10 the envelope stays at full until you let go.`,
    };
    [
      ['attack', 'ATTACK'],
      ['decay', 'DECAY'],
      ['sustain', 'SUSTAIN'],
    ].forEach(([st, label], i) => {
      text(X(ex[i]), 494, label);
      knob(id(`env${n}.${st}`), X(ex[i]), 530.5, {
        def: ENV_DEF[n][i],
        name: `${M} ENV ${n} ${st}`,
        module: 'env',
        fmt:
          st === 'attack'
            ? (v) => fmtTime(attackTime(v))
            : st === 'decay'
              ? (v) => `${fmtTime(decayTime(v))} · release ${fmtTime(releaseTime(v))}`
              : pct,
        help: HELP[st],
      });
    });
  });
  text(X(400), 440.5, 'LFO');
  knob(id('lfo.rate'), X(401), 477, {
    def: 5,
    name: `${M} LFO rate`,
    module: 'lfo',
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `Speed of ${M}’s LFO, from one cycle every 10 seconds to 55 Hz. It reaches the sound only through the LFO position of a modulation switch.`,
  });
  text(X(401), 526, 'VCA');
  small(X(357), 548, 'ENV');
  small(X(401), 569, 'E+V');
  small(X(449), 541, 'ON/');
  small(X(449), 553, 'EXT');
  slide(id('vca.mode'), X(402), 546.7, {
    kind: 'enum',
    options: [
      { v: 'env', label: 'ENV' },
      { v: 'env_vel', label: 'E+V' },
      { v: 'on_ext', label: 'ON/EXT' },
    ],
    def: 'env',
    name: `${M} VCA mode`,
    module: 'amp',
    help: `What opens ${M}’s amplifier. ENV: ENV 1 shapes each note. E+V: the same, louder the harder you play. ON/EXT: held open, so the module drones without a key, unless a cable in VCA CV takes over.`,
  });

  // Master section: this module's column
  const mx = k === 0 ? 1520.5 : 1627.2;
  frame(mx - 47.5, 244, 96, 339);
  text(mx, 258, k === 0 ? 'XM-1' : 'XM-2', 19);
  text(mx, 275, 'LEVEL');
  knob(`${m}.level`, mx, 308, {
    def: k === 0 ? 7 : 0,
    name: `${M} level`,
    module: 'out',
    fmt: pct,
    help: `How loud ${M} is in the output. At 0 ${M} is not heard at all, whatever its own panel is doing.`,
  });
  arrows(mx, 308);
  text(mx, 347, 'PAN');
  knob(`${m}.pan`, mx, 384, {
    min: -5,
    max: 5,
    def: 0,
    name: `${M} pan`,
    module: 'out',
    fmt: (v) =>
      Math.abs(v) < 0.1
        ? 'centre'
        : `${v < 0 ? 'left' : 'right'} ${Math.round((Math.abs(v) / 5) * 100)} %`,
    help: `Where ${M} sits between the left and right speakers. Pan the two modules apart and each keeps its own side, which makes two lines easy to follow.`,
  });
  arrows(mx, 384);
  text(mx, 422, 'EXT LVL');
  knob(`${m}.ext_level`, mx, 459, {
    def: 5,
    name: `${M} EXT level`,
    module: 'mixer',
    fmt: pct,
    help: `Level of whatever is in ${M}’s EXT jack, or of the 440 Hz tuning tone when nothing is. It is only heard with the EXT knob in ${M}’s VCF turned towards IN.`,
  });
  arrows(mx, 459);
  text(mx, 488, 'PORTA-');
  text(mx, 501, 'MENTO');
  knob(`${m}_pitch.portamento`, mx, 530, {
    def: 0,
    name: `${M} portamento`,
    module: 'glide',
    fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
    help: `How long ${M}’s pitch takes to slide from one note to the next, up to 3 seconds. Only works while the portamento ON switch is up.`,
  });

  // Patchbay: inputs on the left, outputs on the right
  const px = k === 0 ? [1721.5, 1787.5] : [1853.5, 1919.5];
  const ROWS = [89, 152, 215, 277.5, 340.5, 403.5, 466, 529];
  const heard = (v: ControlValues): string | null =>
    num(v, `${m}.level`) <= 0
      ? `${M} LEVEL is at 0 in the master section, so nothing ${M} does is heard. Turn ${M} LEVEL up.`
      : null;
  const first =
    (...fs: ((v: ControlValues) => string | null)[]) =>
    (v: ControlValues): string | null => {
      for (const f of fs) {
        const w = f(v);
        if (w) return w;
      }
      return null;
    };
  const plate = (x: number, y: number, label: string, out: boolean): void => {
    decor.push({
      t: 'rect',
      x: x - 28,
      y: y - 31.5 - 6.5,
      w: 56,
      h: 13,
      r: 2.5,
      fill: out ? INK : PANEL,
      stroke: INK,
      sw: 1.3,
    });
    text(x, y - 31.5, label, 10, out ? { fill: PANEL, weight: 700 } : { weight: 600 });
  };
  const jackIn = (key: string, col: number, row: number, label: string, rest: JackIn): void => {
    const x = px[col],
      y = ROWS[row];
    plate(x, y, label, false);
    jacks.push({
      id: `j.${m}.${key}`,
      x,
      y,
      r: 18,
      label,
      name: `${M} ${label}`,
      labelPos: 'none',
      dir: 'in',
      part: k,
      ...rest,
    });
  };
  const jackOut = (key: string, col: number, row: number, label: string, rest: JackOut): void => {
    const x = px[col],
      y = ROWS[row];
    plate(x, y, label, true);
    jacks.push({
      id: `j.${m}.${key}`,
      x,
      y,
      r: 18,
      label,
      name: `${M} ${label}`,
      labelPos: 'none',
      dir: 'out',
      part: k,
      ...rest,
    });
  };
  const pitchHear =
    (who: string) =>
    (_v: ControlValues, x: JackHearContext): string =>
      x.kind === 'kbd'
        ? `${who} now plays the notes carried by ${x.src} instead of ${M}’s own. From the other module’s CV output, both modules play the same notes whatever ASSIGN says.`
        : `${who} no longer follows the keys: ${x.kind === 'lfo' ? `its pitch rises and falls with ${x.src}` : x.kind === 'env' ? `its pitch follows the shape of ${x.src}` : `its pitch is set by ${x.src}`}, one octave for each full step of the signal, and every key plays the same note.`;
  jackIn('ext', 0, 0, 'EXT', {
    dest: 'extIn',
    amt: 1,
    check: first(heard, (v) =>
      num(v, id('vcf.mix_ext')) >= 0
        ? `The EXT knob in ${M}’s VCF is not turned towards IN, so this input is not heard. Turn it left of centre.`
        : num(v, `${m}.ext_level`) <= 0
          ? `${M} EXT LVL is at 0. Turn it up.`
          : null
    ),
    help: `External audio into ${M}’s filter, through the EXT knob (turned towards IN) at the level of ${M} EXT LVL. With nothing plugged in, a 440 Hz tuning tone takes its place.`,
  });
  jackIn('vcf_cv', 0, 1, 'VCF CV', {
    dest: 'cutoff',
    amt: (v) => (v[id('vcf.mod_source')] === 'ext' ? vcfOct(num(v, id('vcf.modulation'))) : 0),
    check: first(heard, (v) =>
      v[id('vcf.mod_source')] !== 'ext'
        ? `${M}’s VCF modulation switch is not at EXT, so this input is ignored. Move the switch to EXT.`
        : Math.abs(num(v, id('vcf.modulation'))) < 0.05
          ? `${M}’s VCF MODULATION is at the centre. Turn it either way to set the depth.`
          : null
    ),
    help: `Moves ${M}’s cutoff from outside, when the VCF modulation switch is at EXT. The MODULATION knob sets how far and which way. A cable here replaces the velocity-scaled ENV 2 that EXT otherwise uses.`,
  });
  jackIn('vca_cv', 0, 2, 'VCA CV', {
    dest: 'amp',
    amt: (v) => (v[id('vca.mode')] === 'on_ext' ? 1 : 0),
    check: first(heard, (v) =>
      v[id('vca.mode')] !== 'on_ext'
        ? `${M}’s VCA switch is not at ON/EXT, so this input is ignored. Move it to ON/EXT.`
        : null
    ),
    help: `Controls ${M}’s amplifier from outside, when the VCA switch is at ON/EXT. The signal patched here then decides how loud ${M} is, in place of ENV 1.`,
  });
  jackIn('vco1_cv', 0, 3, 'VCO 1 CV', {
    dest: 'multIn',
    amt: 1,
    check: heard,
    hear: pitchHear(`VCO 1 (and VCO 2 as well, unless VCO 2 CV has its own cable)`),
    help: `Pitch control for VCO 1, one octave per volt, in place of ${M}’s MIDI pitch. VCO 2 follows it too, unless VCO 2 CV has a cable of its own.`,
  });
  jackIn('vco2_cv', 0, 4, 'VCO 2 CV', {
    dest: 'pitch2',
    amt: 12,
    check: heard,
    hear: pitchHear('VCO 2'),
    help: `Pitch control for VCO 2 alone, one octave per volt, in place of ${M}’s MIDI pitch. Use it to play the two oscillators from different sources.`,
  });
  jackIn('lfo_trig', 0, 5, 'LFO TRIG', {
    dest: 'lfoTrig',
    amt: 1,
    check: heard,
    help: `Restarts ${M}’s LFO from the beginning of its cycle each time a trigger arrives, so the wobble lines up with something else.`,
  });
  jackIn('env_gate', 0, 6, 'ENV GATE', {
    dest: 'gateIn',
    amt: 1,
    check: heard,
    help: `Fires both of ${M}’s envelopes from outside, in place of the MIDI gate. The keys still set the pitch; the envelopes follow whatever is patched here.`,
  });
  jackOut('cv_out', 0, 7, k === 0 ? 'CV 1' : 'CV 2', {
    signal: 'kbd',
    help: `The pitch ${M} is being played at, as a control voltage. Printed in the input column; the guide lists it as an output. Patch it into the other module’s VCO CV to make both play ${M}’s notes.`,
  });
  jackOut('vca', 1, 0, 'VCA', {
    signal: 'vca',
    help: `${M}’s finished sound: the VCA output, before LEVEL and PAN.`,
  });
  jackOut('vcf', 1, 1, 'VCF', {
    signal: 'vcf1',
    help: `${M}’s filter output, before the amplifier. It is not shaped by ENV 1.`,
  });
  jackOut('vco1', 1, 2, 'VCO 1', {
    signal: 'o1saw',
    help: `VCO 1 on its own, before the filter. The guide does not say which wave comes out here; this app gives the sawtooth.`,
  });
  jackOut('vco2', 1, 3, 'VCO 2', {
    signal: 'o2saw',
    help: `VCO 2 on its own, before the filter. The guide does not say which wave comes out here; this app gives the sawtooth.`,
  });
  jackOut('env1', 1, 4, 'ENV 1', {
    signal: 'env1',
    help: `${M}’s ENV 1 as a control voltage, rising and falling with every note.`,
  });
  jackOut('env2', 1, 5, 'ENV 2', { signal: 'env2', help: `${M}’s ENV 2 as a control voltage.` });
  jackOut('lfo', 1, 6, 'LFO', {
    signal: 'lfo',
    help: `${M}’s LFO as a control voltage. Its shape is not stated in the guide; this app uses a triangle.`,
  });
  jackOut('gate', 1, 7, k === 0 ? 'GATE 1' : 'GATE 2', {
    signal: 'gate',
    help: `High while ${M} is playing a note, low otherwise.`,
  });
  // IN / OUT legend under the jacks
  const lx = (px[0] + px[1]) / 2;
  decor.push({
    t: 'rect',
    x: lx - 32,
    y: 570.5,
    w: 32,
    h: 13,
    r: 2.5,
    fill: PANEL,
    stroke: INK,
    sw: 1.3,
  });
  decor.push({ t: 'rect', x: lx, y: 570.5, w: 32, h: 13, r: 2.5, fill: INK, stroke: INK, sw: 1.3 });
  text(lx - 16, 577, 'IN', 10, { weight: 600 });
  text(lx + 16, 577, 'OUT', 10, { fill: PANEL, weight: 700 });
  text(lx, 28, k === 0 ? 'XM-1' : 'XM-2', 20);

  // Areas
  const x0 = k === 0 ? 41 : 755;
  const x1 = k === 0 ? 753 : 1461;
  areas.push(
    {
      id: `${m}-vco1`,
      label: `${M} VCO 1`,
      module: 'osc',
      keywords: 'oscillator tune pitch pwm frequency modulation fm',
      rects: [R(x0, 40, X(200), 450)],
      help: `${M}’s first oscillator. The big FREQUENCY knob tunes it over five octaves and the small one fine-tunes it. MODULATION moves its pitch (turned left) or its pulse width (turned right), using ENV 1, ENV 1 with velocity, or the LFO. PULSE WIDTH sets the width of its pulse wave.`,
    },
    {
      id: `${m}-vco2`,
      label: `${M} VCO 2`,
      module: 'osc',
      keywords: 'oscillator tune pitch sync hard sync pwm',
      rects: [R(X(200), 40, X(400), 450)],
      help: `${M}’s second oscillator, the same as VCO 1 except that its MODULATION uses ENV 2, and SYNC can lock it to VCO 1 so that its FREQUENCY changes the tone rather than the note.`,
    },
    {
      id: `${m}-vcf`,
      label: `${M} VCF`,
      module: 'filter',
      keywords: 'filter cutoff resonance notch low-pass high-pass band-pass state variable sem',
      rects: [R(X(400), 40, x1, 340)],
      help: `${M}’s 12 dB filter. FREQUENCY sets the cutoff and RESONANCE the emphasis. NOTCH sweeps the filter type from low-pass through a notch to high-pass; RESPONSE at BP makes it band-pass instead. MODULATION moves the cutoff up or down from ENV 2, an outside CV (EXT) or the LFO.`,
    },
    {
      id: `${m}-mix`,
      label: `${M} filter inputs`,
      module: 'mixer',
      keywords: 'mixer level saw pulse noise external crossfade',
      rects: [R(X(400), 340, x1, 450)],
      help: `What goes into ${M}’s filter. There are no ordinary level knobs: each knob is off at the centre and fades in one sound to the left and another to the right. VCO 1 and VCO 2 each give sawtooth or pulse; EXT gives the external input (or a tuning tone) or white noise.`,
    },
    {
      id: `${m}-env1`,
      label: `${M} ENV 1 (VCA)`,
      module: 'amp',
      keywords: 'envelope loudness amplifier ads attack decay sustain release',
      rects: [R(x0, 450, X(372), 612)],
      help: `The envelope that shapes the loudness of ${M}’s notes: ATTACK, DECAY and SUSTAIN. DECAY also sets how long a note takes to die away after you let go. It can move VCO 1 too, through VCO 1’s MODULATION knob.`,
    },
    {
      id: `${m}-lfo`,
      label: `${M} LFO`,
      module: 'lfo',
      keywords: 'lfo vibrato wobble rate speed modulation',
      rects: [R(X(372), 450, X(432), 512)],
      help: `${M}’s low-frequency oscillator, with one knob for its speed. It does nothing until a modulation switch is set to LFO: on VCO 1, VCO 2 or the VCF.`,
    },
    {
      id: `${m}-vca`,
      label: `${M} VCA`,
      module: 'amp',
      keywords: 'amplifier drone velocity gate',
      rects: [R(X(372), 512, X(432), 612)],
      help: `What opens ${M}’s amplifier: ENV 1, ENV 1 scaled by velocity (E+V), or ON/EXT, which holds it open for a drone or hands it to a cable in VCA CV.`,
    },
    {
      id: `${m}-env2`,
      label: `${M} ENV 2`,
      module: 'env',
      keywords: 'envelope filter ads attack decay sustain contour',
      rects: [R(X(432), 450, x1, 612)],
      help: `${M}’s second envelope, for the filter (through the VCF MODULATION knob) and for VCO 2 (through its MODULATION knob). ATTACK, DECAY and SUSTAIN; DECAY sets the release as well.`,
    },
    {
      id: `${m}-out`,
      label: `${M} output`,
      module: 'out',
      keywords: 'level volume pan stereo external level portamento glide',
      rects: [R(k === 0 ? 1462 : 1580, 238, k === 0 ? 1569.5 : 1688, 612)],
      help: `${M}’s strip in the master section: LEVEL and PAN place it in the stereo mix, EXT LVL sets the level of its external input, and PORTAMENTO sets how slowly it glides between notes.`,
    },
    {
      id: `${m}-patch`,
      label: `${M} patchbay`,
      module: 'util',
      keywords: 'patch cable jack cv gate input output modular',
      rects: [R(k === 0 ? 1689 : 1821, 40, k === 0 ? 1820 : 1961, 612)],
      help: `Sixteen jacks for ${M}: inputs in the left column (outlined labels) and outputs in the right (solid labels). Cables can run between the two modules, so one module can modulate or process the other.`,
    }
  );
}
buildModule(0);
buildModule(1);

// ── Master section: shared controls ───────────────────────────────────────
text(1575, 35, '2-XM', 36, { weight: 700, spacing: '0.02em', brand: true });
text(1521, 78, 'STEREO');
text(1521, 93, 'OUT');
socket(1521, 133.5);
decor.push({ t: 'led', x: 1575, y: 78, r: 6, color: 'red' });
text(1629, 78, 'MIDI IN');
decor.push({ t: 'din', x: 1629, y: 133.5, r: 42 });
text(1521, 183, 'MASTER');
knob('output.master', 1521, 216, {
  def: 7,
  name: 'MASTER',
  module: 'out',
  fmt: pct,
  help: 'The overall output level, after both modules’ LEVEL and PAN.',
});
arrows(1521, 216);
text(1629, 183, 'ASSIGN');
small(1597, 198, 'UNI');
small(1631, 198, 'SPLIT');
small(1668, 198, 'DUO');
slide('alloc.assign', 1631, 217.5, {
  kind: 'enum',
  options: [
    { v: 'unison', label: 'UNI' },
    { v: 'split', label: 'SPLIT' },
    { v: 'duo', label: 'DUO' },
  ],
  def: 'unison',
  name: 'ASSIGN',
  module: 'mode',
  help: 'How notes are shared between the two modules. UNI: both play every note, and a second held key goes to XM2. SPLIT: keys below middle C play XM1, the rest XM2. DUO: each new key goes to whichever module is free, so two-note chords and overlapping lines play on separate modules.',
});
text(1575, 450, 'ON', 12);
controls.push({
  id: 'alloc.portamento_on',
  type: 'slide',
  x: 1574.3,
  y: 488.8,
  w: 20,
  h: 54,
  orient: 'v',
  labelPos: 'none',
  kind: 'bool',
  def: false,
  name: 'Portamento ON',
  module: 'glide',
  help: 'Switches portamento on for both modules. Each module’s PORTAMENTO knob then sets its own glide time.',
});
areas.push(
  {
    id: 'master',
    label: 'Master and output',
    module: 'out',
    keywords: 'volume master stereo output midi power',
    rects: [R(1462, 40, 1575, 238)],
    help: 'The overall output level (MASTER) and the stereo output socket. Each module’s LEVEL and PAN below it decide how the two share the stereo picture.',
  },
  {
    id: 'assign',
    label: 'Voice assignment',
    module: 'mode',
    keywords: 'unison split duo duophonic keyboard mode midi voice priority',
    rects: [R(1575, 40, 1688, 238)],
    help: 'MIDI IN and the ASSIGN switch, which decides how incoming notes reach the two modules: both on every note (UNI), low keys to XM1 and high keys to XM2 (SPLIT), or one note per module as you play (DUO).',
  },
  {
    id: 'porta',
    label: 'Portamento switch',
    module: 'glide',
    keywords: 'glide portamento slide legato',
    rects: [R(1569.5, 238, 1580, 612)],
    help: 'Turns portamento on for both modules at once. How long the glide takes is set separately for each module with its PORTAMENTO knob.',
  }
);

// ── Engine mapping ────────────────────────────────────────────────────────
const MOD_SIG: Record<string, string> = {
  env1: 'env1',
  env1_vel: 'env1v',
  env2: 'env2',
  env2_vel: 'env2v',
  lfo: 'lfo',
};

/** One module's voice. `k` = 0 for XM1, 1 for XM2. */
function voiceOf(v: ControlValues, k: 0 | 1, patched: Record<string, boolean>): Voice {
  const m = `xm${k + 1}`;
  const g = (s: string): ControlValues[string] => v[`${m}_${s}`];
  const gn = (s: string): number => num(v, `${m}_${s}`);
  const pj = (s: string): boolean => !!patched[`j.${m}.${s}`];
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src, dst, amt });
  };

  // MODULATION: left of centre moves the pitch, right of centre the pulse width
  [1, 2].forEach((n) => {
    const x = gn(`vco${n}.modulation`);
    const src = MOD_SIG[String(g(`vco${n}.mod_source`))];
    if (x < 0) route(src, `pitch${n}`, fmDepth(x));
    else if (x > 0) route(src, `pw${n}`, 0.4 * (x / 5));
  });
  // VCO 1 CV replaces the MIDI pitch of both VCOs, VCO 2 CV that of VCO 2 alone. VCO 1 CV arrives through the
  // multiple.
  const cv1 = pj('vco1_cv'),
    cv2 = pj('vco2_cv');
  if (cv1) {
    route('mult', 'pitch1', 12);
    if (!cv2) route('mult', 'pitch2', 12);
  }

  const xf = (x: number): { saw: number; pulse: number } => ({
    saw: Math.max(0, -x) / 5,
    pulse: Math.max(0, x) / 5,
  });
  const vcoOf = (n: number): OscParams => {
    const x = gn(`vcf.mix_vco${n}`);
    return {
      level: x === 0 ? 0 : 0.42,
      mix: xf(x),
      pw: gn(`vco${n}.pulse_width`) / 100,
      semi: (gn(`vco${n}.coarse`) - 5) * 6 + gn(`vco${n}.fine`) * 0.2,
      kbd: n === 1 ? !cv1 : !(cv1 || cv2),
      fixedNote: 60,
      syncTo: n === 2 && g('vco2.sync') ? 0 : -1,
    };
  };
  // EXT: the external input, or the A440 tuning tone (a third, fixed oscillator) when nothing is plugged in
  const ex = gn('vcf.mix_ext');
  const inAmt = Math.max(0, -ex) / 5,
    nzAmt = Math.max(0, ex) / 5;
  const extLvl = level10(num(v, `${m}.ext_level`));
  const extIn = pj('ext');
  const tone: OscParams = {
    level: extIn ? 0 : 0.35 * inAmt * extLvl,
    mix: { sine: 1 },
    pw: 0.5,
    semi: 0,
    kbd: false,
    fixedNote: 69,
    syncTo: -1,
  };

  const fm = gn('vcf.modulation');
  const oct = vcfOct(fm);
  const fsrc = g('vcf.mod_source');
  let envAmt = 0;
  let envSrc: EnvSignal = 'env2';
  if (fsrc === 'env2') envAmt = oct;
  else if (fsrc === 'ext' && !pj('vcf_cv')) {
    envAmt = oct;
    envSrc = 'env2v';
  } else if (fsrc === 'lfo') route('lfo', 'cutoff', oct * 0.5);
  const bp = g('vcf.response') === 'bp';

  const vm = g('vca.mode');
  const envOf = (n: number): EnvParams => ({
    a: attackTime(gn(`env${n}.attack`)),
    d: decayTime(gn(`env${n}.decay`)),
    s: gn(`env${n}.sustain`) / 10,
    r: releaseTime(gn(`env${n}.decay`)),
  });
  return {
    osc: [vcoOf(1), vcoOf(2), tone],
    oscOuts: true,
    noise: { level: 0.4 * nzAmt, color: 'white' },
    ext: { level: extIn ? inAmt * extLvl : 0 },
    filter: {
      type: 'svf',
      mode: bp ? 'bp' : 'morph',
      ...(bp ? {} : { morph: (gn('vcf.notch') + 5) / 10 }),
      cutoff: vcfHz(gn('vcf.frequency')),
      res: (gn('vcf.resonance') / 10) * 0.96,
      envAmt,
      envSrc,
      kbd: 0,
    },
    env1: envOf(1),
    env2: envOf(2),
    // band-pass passes only a slice of the sound, so it is given make-up gain to sit level with the other responses
    vca: {
      ...(vm === 'on_ext'
        ? { envSrc: 'none' as const, bias: pj('vca_cv') ? 0 : 1 }
        : { envSrc: vm === 'env_vel' ? ('env1v' as const) : ('env1' as const), bias: 0 }),
      gain: bp ? 2.2 : 1,
    },
    lfo: { rate: lfoHz(gn('lfo.rate')), mix: { tri: 1 }, keySync: false },
    glide: {
      time: v['alloc.portamento_on'] ? portaTime(num(v, `${m}_pitch.portamento`)) : 0,
      legato: false,
    },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: { gateIn: 'gate' },
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
  };
}

const ASSIGNS = ['unison', 'split', 'duo'] as const;
const assignOf = (x: ControlValues[string]): (typeof ASSIGNS)[number] =>
  ASSIGNS.find((a) => a === x) ?? 'unison';

function toEngine(v: ControlValues, ctx?: Partial<EngineContext>): EngineParams {
  const patched = ctx?.patched || {};
  return {
    ...voiceOf(v, 0, patched),
    volume: level10(num(v, 'output.master'), 1),
    dual: {
      b: voiceOf(v, 1, patched),
      assign: assignOf(v['alloc.assign']),
      split: 60,
      level: [level10(num(v, 'xm1.level'), 2.2), level10(num(v, 'xm2.level'), 2.2)],
      pan: [num(v, 'xm1.pan') / 5, num(v, 'xm2.pan') / 5],
    },
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const xm2: SynthDef & { version: number } = {
  id: '2-xm',
  version: 1,
  name: '2-XM',
  maker: 'Behringer',
  year: 2025,
  heritage: 'Based on the 1975 Oberheim Two Voice',
  summary:
    'Two complete SEM voices side by side. Each has two VCOs crossfaded into a 12 dB filter that sweeps from low-pass through notch to high-pass (or band-pass), two ADS envelopes, an LFO and a VCA, with its own 16-jack patchbay. The master section sets each module’s level and pan and plays them in unison, split or duo.',
  view: { w: 2000, h: 626 },
  theme: {
    panel: PANEL,
    panel2: '#ede6cd',
    ink: INK,
    font: 'din',
    weight: 500,
    cheeks: 'wood',
    cheekW: 38,
    jack: 'black',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    osc3: 'the 440 Hz tuning tone',
    o1saw: 'the VCO 1 output',
    o2saw: 'the VCO 2 output',
    env1: 'ENV 1',
    env2: 'ENV 2',
    env1v: 'ENV 1 scaled by velocity',
    env2v: 'ENV 2 scaled by velocity',
    lfo: 'the LFO',
    vcf1: 'the VCF output',
    vca: 'the VCA output',
    kbd: 'the module’s MIDI pitch (its CV output)',
    gate: 'the module’s MIDI gate',
    mult: 'the VCO 1 CV input',
    mixer: 'the filter inputs',
  },
  destNames: {
    pitch1: 'VCO 1 pitch',
    pitch2: 'VCO 2 pitch',
    pw1: 'VCO 1 pulse width',
    pw2: 'VCO 2 pulse width',
    cutoff: 'the VCF cutoff',
    amp: 'the VCA',
  },
};

export default xm2;
