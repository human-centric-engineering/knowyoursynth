/**
 * Behringer 2600: the definition (D1). Coordinates: the 3200×3200 product photo, cropped to the
 * faceplate and scaled to 2000 wide (panel x = photoX × 0.625, y = (photoY − 300) × 0.625).
 *
 * Transliterated from the prototype file `src/synths/b2600.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand`
 * (the Behringer logo and the printed "2600"), and panel values read through `num()`. The ADSR
 * slider names drop every line break of their printed label, not just the first.
 */
import type {
  Area,
  Control,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvTrigSource,
  FaderControl,
  FaderLed,
  InputJack,
  Jack,
  JackHearContext,
  OutputJack,
  SlideControl,
  SynthDef,
  SynthModule,
  TextDecor,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type FaderRest = Omit<
  FaderControl,
  'id' | 'type' | 'orient' | 'x' | 'y' | 'len' | 'led' | 'kind' | 'min' | 'max' | 'def'
> &
  Partial<Pick<FaderControl, 'len' | 'min' | 'max' | 'def'>>;
type SlideRest = OmitEach<SlideControl, 'id' | 'type' | 'orient' | 'x' | 'y' | 'w' | 'h'>;
type JinRest = Partial<Pick<InputJack, 'name' | 'check' | 'hear' | 'add'>>;
type JoutRest = Partial<Pick<OutputJack, 'name' | 'check'>>;
type Hear = (v: ControlValues, x: JackHearContext) => string;

// ── Scales ────────────────────────────────────────────────────────────────
// The frequency sliders are marked in decades (10 · 100 · 1k · 10k), 2.7 slider units apart.
// In LF the same marks read .03 · .3 · 3 · 30 Hz, so LF is the audio frequency ÷ 333.
const oscHz = (v: number): number => Math.pow(10, 1 + (v - 0.74) / 2.7);
const vcfHz = (v: number): number => Math.pow(10, 1 + (v - 0.87) / 2.7);
const noteOf = (hz: number): number => 69 + (12 * Math.log(hz / 440)) / Math.LN2;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (hz: number): string => {
  const n = Math.round(noteOf(hz));
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
};
const envA = (v: number): number => expMap(v / 10, 0.0015, 8);
const envDR = (v: number): number => expMap(v / 10, 0.006, 12);
const lfoHz = (v: number): number => expMap(v / 10, 0.25, 25);
const shHz = (v: number): number => expMap(v / 10, 0.25, 30);
const lagS = (v: number): number => expMap(v / 10, 0.001, 2);
const portaS = (v: number): number => Math.pow(v / 10, 2) * 3;
const g10 = (v: number): number => v / 10;
/** Pre-wired FM attenuators: square law, so the bottom of the slider gives musical amounts and the top goes wild. */
const fm = (v: number, range: number): number => range * g10(v) * g10(v);
const TIME: Record<string, number> = { 2: 2, 1: 1, 0.5: 0.5 };
const PRE_RANGE: Record<string, number> = { x10: 1, x100: 10, x1000: 100 };
const pct = (v: number): string => `${Math.round(v * 10)}%`;
const fmtOsc = (v: number): string => {
  const hz = oscHz(v);
  return `${fmtHz(hz)} (${noteName(hz)}) · LF ${fmtHz(hz / 333.3)}`;
};

// ── Colours of the print ──────────────────────────────────────────────────
const ORANGE = '#f26b3a';

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const text = (
  x: number,
  y: number,
  t: string,
  size = 13,
  rest: Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'brand'>> = {}
): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
};
/** Vertical fader: (x, y) is the middle of its travel. */
// Every vertical slider on the panel is the same part: 186 of travel between the end marks, in a slot that runs 22 past each.
const vf = (id: string, x: number, y: number, led: FaderLed, rest: FaderRest, len = 186): void => {
  controls.push({
    id,
    type: 'fader',
    orient: 'v',
    x,
    y,
    len,
    pad: 22,
    led,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
/** A fader in the bottom row. */
const vfb = (id: string, x: number, led: FaderLed, rest: FaderRest): void =>
  vf(id, x, 1277, led, rest);
const hf = (id: string, x: number, y: number, led: FaderLed, rest: FaderRest, len = 200): void => {
  controls.push({
    id,
    type: 'fader',
    orient: 'h',
    x,
    y,
    len,
    led,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ticks: 0,
    ...rest,
  });
};
const slide = (id: string, x: number, y: number, rest: SlideRest, h = 44): void => {
  controls.push({ id, type: 'slide', orient: 'v', x, y, w: 18, h, labelPos: 'none', ...rest });
};
const jin = (
  id: string,
  x: number,
  y: number,
  label: string,
  dest: string,
  amt: InputJack['amt'],
  help: string,
  rest: JinRest = {}
): void => {
  jacks.push({
    id,
    x,
    y,
    r: 15,
    label,
    labelPos: 'none',
    labelSize: 12,
    dir: 'in',
    dest,
    amt,
    help,
    ...rest,
  });
};
const jout = (
  id: string,
  x: number,
  y: number,
  label: string,
  signal: string,
  help: string,
  rest: JoutRest = {}
): void => {
  jacks.push({
    id,
    x,
    y,
    r: 15,
    label,
    labelPos: 'none',
    labelSize: 12,
    dir: 'out',
    signal,
    help,
    ...rest,
  });
};
/** Orange label box: a module name, or the name of the signal pre-wired to the jack above it. */
const box = (x: number, y: number, w: number, h: number, t: string, size = 13): void => {
  const lines = t.split('\n').length;
  decor.push({ t: 'rect', x: x - w / 2, y: y - h / 2, w, h, r: 2, fill: ORANGE });
  text(x, y + size * 0.36 - (lines - 1) * size * 0.54, t, size, { fill: '#fff', weight: 600 });
};
const wire = (d: string, w = 2): void => {
  decor.push({ t: 'path', d, stroke: ORANGE, w });
};
/** Arrowhead at the end of a printed wire: its tip at (x, y), pointing along `deg` (0 = right, 90 = down). */
const head = (x: number, y: number, deg: number, s = 5): void => {
  const a = (deg * Math.PI) / 180;
  const p = (along: number, across: number): string =>
    `${(x + Math.cos(a) * along - Math.sin(a) * across).toFixed(1)} ${(y + Math.sin(a) * along + Math.cos(a) * across).toFixed(1)}`;
  decor.push({
    t: 'path',
    d: `M${p(0, 0)} L${p(-s * 1.9, s * 0.8)} L${p(-s * 1.9, -s * 0.8)} Z`,
    stroke: ORANGE,
    fill: ORANGE,
    w: 1,
  });
};
const UP = -90,
  DOWN = 90,
  LEFT = 180,
  RIGHT = 0;
/** A wire that ends in an arrowhead. The last segment of `d` must stop 6 short of the tip, which is at (x, y). */
const arrow = (d: string, x: number, y: number, deg: number, w = 2): void => {
  wire(d, w);
  head(x, y, deg);
};
const dot = (x: number, y: number): void => {
  decor.push({ t: 'circle', x, y, r: 3.2, fill: ORANGE, stroke: ORANGE, sw: 1 });
};
/**
 * The name of a pre-wired source. Every one is the same size, as printed; a source with a one-line name also shows its
 * waveform (an envelope's shape sits above the name, an oscillator's wave below it).
 */
/** The bottom row prints its sources on a wide, short box, with the wave under the name. */
const srcBoxWide = (x: number, y: number, t: string, glyph: WaveShape): void => {
  decor.push({ t: 'rect', x: x - 23, y: y - 13, w: 46, h: 26, r: 2, fill: ORANGE });
  text(x, y - 2, t, 10, { fill: '#fff', weight: 600 });
  decor.push({ t: 'wave', x, y: y + 7, size: 6, shape: glyph, stroke: '#fff', w: 1.5 });
};
const hole = (x: number, y: number): void => {
  decor.push({ t: 'circle', hw: true, x, y, r: 11, fill: '#141517', stroke: '#0c0c0d', sw: 1 });
};
const srcBox = (x: number, y: number, t: string, glyph?: WaveShape): void => {
  decor.push({ t: 'rect', x: x - 20, y: y - 17, w: 40, h: 34, r: 2, fill: ORANGE });
  if (!glyph) {
    text(x, y + 4 - (t.split('\n').length - 1) * 6, t, 11, { fill: '#fff', weight: 600 });
    return;
  }
  const above = glyph === 'adsr' || glyph === 'ar';
  text(x, above ? y + 12 : y - 3, t, 11, { fill: '#fff', weight: 600 });
  decor.push({
    t: 'wave',
    x,
    y: above ? y - 6 : y + 8,
    size: 8,
    shape: glyph,
    stroke: '#fff',
    w: 1.6,
  });
};
/** The little attenuator symbol printed between a pre-wired jack and its source box. */
const attSym = (x: number, y: number): void => {
  decor.push(
    { t: 'circle', hw: true, x, y, r: 9, stroke: ORANGE, sw: 1.8 },
    {
      t: 'path',
      hw: true,
      d: `M${x - 5} ${y + 4} L${x + 5} ${y - 4} M${x + 1} ${y - 4} H${x + 5} V${y}`,
      stroke: ORANGE,
      w: 1.6,
    }
  );
};
/** An input with an attenuator slider above and its pre-wired source named in a box below, as the whole top half does. */
const prewired = (x: number, source: string, glyph?: WaveShape): void => {
  wire(`M${x} 930 V969`, 1.6);
  attSym(x, 950);
  srcBox(x, 987, source, glyph);
};
// ── Faceplate ─────────────────────────────────────────────────────────────
[
  [16, 150],
  [16, 572],
  [16, 890],
  [16, 1302],
  [1938, 150],
  [1938, 572],
  [1938, 890],
  [1938, 1302],
].forEach(([x, y]) =>
  decor.push({
    t: 'rect',
    hw: true,
    x,
    y,
    w: 46,
    h: 30,
    r: 15,
    fill: '#0b0c0e',
    stroke: '#3a3b3f',
    sw: 1.5,
  })
);
[105, 545, 1000, 1440, 1905].forEach((x) => decor.push({ t: 'screw', x, y: 34, r: 9 }));
[117, 559, 999, 1441, 1884].forEach((x) => decor.push({ t: 'screw', x, y: 1452, r: 9 }));
text(350, 72, '2600', 46, { fill: ORANGE, weight: 700, brand: true });
decor.push({
  t: 'logo',
  x: 195,
  y: 386,
  size: 17,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
// section dividers, printed in orange
[362, 636, 910, 1330, 1540].forEach((x) => wire(`M${x} 95 V1005`, 2.5));
wire('M1628 95 V494', 2.5);
wire('M1772 606 V1005', 2.5);
[456, 668, 878, 1080, 1523, 1823].forEach((x) => wire(`M${x} 1070 V1462`, 2.5));
// between the two envelopes, broken where the gate wiring passes through it
wire('M1330 590 H1374 M1388 590 H1402 M1416 590 H1540', 2);

// ── Oscillators ───────────────────────────────────────────────────────────
type Wave = 'saw' | 'pulse' | 'tri' | 'sine';
interface VcoLayout {
  x: number;
  led: FaderLed;
  outs: [w: Wave, x: number, y: number][];
  fmX: number[];
  lf: [number, number];
  sync: [number, number] | null;
  title: number;
}
const VCO: Record<number, VcoLayout> = {
  1: {
    x: 230,
    led: 'blue',
    outs: [
      ['saw', 305, 428],
      ['pulse', 305, 497],
    ],
    fmX: [152, 203, 257, 310],
    lf: [148, 805],
    sync: null,
    title: 188,
  },
  2: {
    x: 505,
    led: 'green',
    outs: [
      ['tri', 555, 428],
      ['saw', 608, 428],
      ['sine', 555, 497],
      ['pulse', 608, 497],
    ],
    fmX: [400, 450, 505, 557, 610],
    lf: [400, 805],
    sync: [400, 378],
    title: 437,
  },
  3: {
    x: 775,
    led: 'blue',
    outs: [
      ['tri', 825, 428],
      ['saw', 878, 428],
      ['sine', 825, 497],
      ['pulse', 878, 497],
    ],
    fmX: [672, 725, 778, 830, 883],
    lf: [670, 805],
    sync: [665, 378],
    title: 710,
  },
};
const WAVE_GLYPH: Record<Wave, WaveShape> = { saw: 'saw', pulse: 'sq', tri: 'tri', sine: 'sine' };
const WAVE_WORD: Record<Wave, string> = {
  saw: 'sawtooth',
  pulse: 'pulse',
  tri: 'triangle',
  sine: 'sine',
};
const WAVE_HELP: Record<Wave, string> = {
  saw: 'Bright and buzzy, with every harmonic.',
  pulse: 'Hollow at 50% width, thinner and more nasal towards 10% or 90%. PULSE WIDTH sets it.',
  tri: 'Soft and flute-like: only a few odd harmonics.',
  sine: 'A pure tone with no harmonics. As a modulation source it gives the smoothest vibrato and sweeps.',
};

[1, 2, 3].forEach((n) => {
  const o = VCO[n];
  const name = `VCO ${n}`;
  hf(`vco${n}.freq`, o.x, 143, o.led, {
    def: 4.57,
    label: 'INITIAL OSCILLATOR FREQUENCY',
    module: 'osc',
    fmt: fmtOsc,
    help: `Coarse pitch of ${name}. The marks are decades: 10 Hz, 100 Hz, 1 kHz, 10 kHz. With the keyboard on, this sets the pitch you hear on middle C and the keys play up and down from there. In LF the same slider runs from about 0.03 Hz to 30 Hz.`,
  });
  hf(`vco${n}.fine`, o.x, 217, o.led, {
    min: -5,
    max: 5,
    def: 0,
    label: 'FINE TUNE',
    module: 'osc',
    fmt: (v) => fmtSemi((v / 5) * 2),
    help: `Fine pitch of ${name}, about two semitones either way from the centre. Use it to tune one oscillator against another or to add a slow beating detune.`,
  });
  hf(`vco${n}.pw`, o.x, 291, o.led, {
    min: 10,
    max: 90,
    def: 50,
    label: 'PULSE WIDTH',
    module: 'osc',
    fmt: (v) => `${Math.round(v)}% duty`,
    help: `Width of ${name}’s pulse wave. 50% is a hollow square; towards 10% or 90% it gets thinner and more nasal. It changes only the PULSE output.`,
  });
  text(o.x, 104, 'INITIAL OSCILLATOR FREQUENCY', 12.5);
  (
    [
      ['10', '.03', -98],
      ['100', '0.3', -35],
      ['1kHz', '3.0', 27],
      ['10kHz', '30.', 88],
    ] as [string, string, number][]
  ).forEach(([a, b, dx]) => {
    text(o.x + dx, 119, a, 10.5);
    decor.push({ t: 'line', x1: o.x + dx - 12, y1: 123, x2: o.x + dx + 12, y2: 123, w: 1.2 });
    text(o.x + dx, 133, b, 10.5);
  });
  text(o.x, 186, 'FINE TUNE', 12.5);
  decor.push({ t: 'line', x1: o.x, y1: 191, x2: o.x, y2: 201, w: 1.6 });
  text(o.x, 258, 'PULSE WIDTH', 12.5);
  (
    [
      ['10%', -95],
      ['50%', 0],
      ['90%', 92],
    ] as [string, number][]
  ).forEach(([t, dx]) => text(o.x + dx, 274, t, 10.5));

  slide(`vco${n}.range`, o.lf[0], o.lf[1], {
    kind: 'enum',
    def: 'audio',
    label: 'AUDIO / LF',
    module: 'osc',
    options: [
      { v: 'audio', label: 'AUDIO (KYBD ON)' },
      { v: 'lf', label: 'LF (KYBD OFF)' },
    ],
    help: `AUDIO: ${name} plays notes and follows the keyboard. LF: it drops to sub-audio speeds, stops following the keys and becomes a slow modulation source with all of its waveforms.`,
  });
  text(o.lf[0], o.lf[1] - 51, 'AUDIO', 13);
  text(o.lf[0], o.lf[1] - 36, 'KYBD ON', 10.5);
  text(o.lf[0], o.lf[1] + 39, 'KYBD OFF', 10.5);
  text(o.lf[0], o.lf[1] + 54, 'LF', 13);
  if (o.sync) {
    slide(`vco${n}.sync`, o.sync[0], o.sync[1], {
      kind: 'bool',
      def: false,
      label: 'SYNC',
      module: 'osc',
      help: `Hard sync: ${name} restarts its wave every time VCO 1 starts a cycle. It then plays at VCO 1’s pitch, and its own frequency slider changes the tone instead, giving the tearing sync sound.`,
    });
    text(o.sync[0], o.sync[1] - 50, 'SYNC', 13);
    text(o.sync[0], o.sync[1] - 36, 'ON', 10.5);
    text(o.sync[0], o.sync[1] + 44, 'OFF', 10.5);
  }

  box(o.title, 465, 124, 58, `VOLTAGE\nCONTROLLED\nOSCILLATOR ${n}`, 14);
  o.outs.forEach(([w, x, y]) => {
    jout(
      `j.vco${n}${w}`,
      x,
      y,
      w.toUpperCase(),
      `o${n}${w}`,
      `${name}’s ${WAVE_WORD[w]} output. ${WAVE_HELP[w]} In LF it carries a slow ${WAVE_WORD[w]} for modulation.`,
      { name: `${name} ${w.toUpperCase()}` }
    );
    const top = y < 460;
    text(x, top ? y - 40 : y + 32, w.toUpperCase(), 12.5);
    decor.push({ t: 'wave', x, y: top ? y - 25 : y + 44, size: 9, shape: WAVE_GLYPH[w] });
  });
  text(n === 1 ? 305 : o.outs[1][1] - 26, 466, 'OUTPUTS', 11.5);
  // Printed wiring. Each FM slider runs straight up out of its slot, then across to its own arrow under the module name; the
  // keyboard input has no slider, so its wire starts above the blanked holes. Nothing passes over a slider's level marks.
  const left = o.title - 62;
  arrow(`M${o.fmX[0]} ${n === 1 ? 657 : 604} V502`, o.fmX[0], 496, UP);
  o.fmX
    .slice(1, 4)
    .forEach((x, i) =>
      arrow(
        `M${x} 623 V576 L${(left + 51 + i * 24.4).toFixed(1)} 523 V502`,
        +(left + 51 + i * 24.4).toFixed(1),
        496,
        UP
      )
    );
  if (o.fmX[4]) arrow(`M${o.fmX[4]} 623 V560`, o.fmX[4], 554, UP);
  // … and from the module name out to each waveform jack
  const right = o.title + 62;
  o.outs.forEach(([, x, y]) => {
    const top = y < 460;
    const far = x > right + 80;
    const from = top ? (far ? 453.5 : 443) : far ? 474.5 : 485;
    const tipX = x - 14,
      tipY = top ? y + 10 : y - 10;
    const deg = (Math.atan2(tipY - from, tipX - (x - 27)) * 180) / Math.PI;
    const back = (k: number): string =>
      [tipX - Math.cos((deg * Math.PI) / 180) * k, tipY - Math.sin((deg * Math.PI) / 180) * k]
        .map((q) => q.toFixed(1))
        .join(' ');
    arrow(`M${right} ${from} H${x - 27} L${back(6)}`, tipX, tipY, deg);
  });
});

// FM / PWM attenuators and their inputs
type FmSrc = 'sh' | 'adsr' | 'lfo' | 'vco1' | 'vco2' | 'noise';
const FM_LED: Record<FmSrc, FaderLed> = {
  sh: 'yellow',
  adsr: 'red',
  lfo: 'yellow',
  vco1: 'blue',
  vco2: 'green',
  noise: 'green',
};
const fmFader = (id: string, x: number, src: FmSrc, label: string, help: string): void => {
  vf(id, x, 739, FM_LED[src], { label, module: src === 'adsr' ? 'env' : 'mod', fmt: pct, help });
};
fmFader(
  'vco1.fmSh',
  203,
  'sh',
  'S/H OUT (FM)',
  'How far the sample-and-hold moves VCO 1’s pitch. Its random steps make the classic burbling "computer" melody. Low settings wander by a few semitones; high ones leap over octaves.'
);
fmFader(
  'vco1.fmAdsr',
  257,
  'adsr',
  'ADSR (FM)',
  'How far the ADSR envelope bends VCO 1’s pitch on each note: up as the envelope rises, back as it falls. A little gives a blip at the start of a note; a lot gives laser and drum sweeps.'
);
fmFader(
  'vco1.fmLfo',
  310,
  'lfo',
  'LFO (FM)',
  'Vibrato depth: how far the LFO’s sine wave swings VCO 1’s pitch. 2 to 3 is a musical vibrato; higher becomes a siren. The mod wheel beside the keyboard pushes this slider further up, so vibrato can be brought in while a note sounds. Only VCO 1 has an LFO slider; the other two need a cable.'
);
fmFader(
  'vco2.fmSh',
  450,
  'sh',
  'S/H OUT (FM)',
  'How far the sample-and-hold moves VCO 2’s pitch, giving random stepped notes.'
);
fmFader(
  'vco2.fmAdsr',
  505,
  'adsr',
  'ADSR (FM)',
  'How far the ADSR bends VCO 2’s pitch on each note. With SYNC on, this sweeps the tone instead of the pitch.'
);
fmFader(
  'vco2.fmVco1',
  557,
  'vco1',
  'VCO 1 (FM)',
  'How much VCO 1’s pulse wave shakes VCO 2’s pitch. With VCO 1 in LF it is a trill or wobble; at audio rate it is frequency modulation, which adds clangy, metallic overtones.'
);
vf('vco2.pwm', 610, 739, 'green', {
  label: 'NOISE GEN (PWM)',
  module: 'mod',
  fmt: pct,
  help: 'How much the noise generator jitters VCO 2’s pulse width. It roughens the pulse wave into a gritty, breathy tone. Patch another source into the PWM jack for ordinary pulse-width modulation.',
});
fmFader(
  'vco3.fmNoise',
  725,
  'noise',
  'NOISE GEN (FM)',
  'How much noise shakes VCO 3’s pitch. A little gives a rough, unstable tone; a lot turns VCO 3 into pitched noise.'
);
fmFader(
  'vco3.fmAdsr',
  778,
  'adsr',
  'ADSR (FM)',
  'How far the ADSR bends VCO 3’s pitch on each note.'
);
fmFader(
  'vco3.fmVco2',
  830,
  'vco2',
  'VCO 2 (FM)',
  'How much VCO 2’s sine wave moves VCO 3’s pitch. With VCO 2 in LF it is a smooth vibrato; at audio rate it is FM, for bells and clangs.'
);
vf('vco3.pwm', 883, 739, 'red', {
  label: 'ADSR (PWM)',
  module: 'mod',
  fmt: pct,
  help: 'How far the ADSR sweeps VCO 3’s pulse width on each note, so the tone thins or fattens as the envelope moves. It changes only VCO 3’s PULSE output.',
});

const FM_AMT: Record<FmSrc, number> = { sh: 24, adsr: 48, lfo: 12, vco1: 36, vco2: 36, noise: 24 };
const kbdHear =
  (n: number): Hear =>
  (_v, x) =>
    x.root === 'kbd'
      ? `VCO ${n} follows the keyboard through the cable, just as it does through the internal wiring, so nothing changes.`
      : x.root === 'kbd2'
        ? `VCO ${n} now plays the upper of the two held notes (UPPER VOICE), while the other oscillators play the lower one. With VOICE MODE on DUO you can play two-note chords and lines.`
        : `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} now sets the pitch of VCO ${n} (${x.depth}). The keyboard no longer reaches it, so it holds the pitch of its frequency slider plus whatever this cable sends.`;
const fmIn = (
  n: number,
  x: number,
  suffix: string,
  src: FmSrc,
  slider: string,
  label: string,
  pre: string
): void =>
  jin(
    `j.vco${n}${suffix}`,
    x,
    915,
    label,
    `pitch${n}`,
    (v) => fm(num(v, slider), FM_AMT[src]),
    `Pitch control for VCO ${n}, pre-wired from ${pre}. The slider above sets the depth, and a cable here replaces ${pre} with whatever you patch in.`,
    {
      name: `VCO ${n} FM (${label})`,
      check: (v) =>
        num(v, slider) <= 0
          ? `The slider above this jack is at 0, and it sets the depth of whatever arrives here. Raise it to hear this cable.`
          : null,
    }
  );
[1, 2, 3].forEach((n) =>
  jin(
    `j.vco${n}Kbd`,
    VCO[n].fmX[0],
    915,
    'KYBD CV',
    `pitch${n}`,
    12,
    `Keyboard input of VCO ${n}. It is pre-wired to the keyboard CV (after portamento); a cable here disconnects the keyboard, so VCO ${n} follows the cable instead. Patch UPPER VOICE here for the second voice of the duophonic keyboard.`,
    { name: `VCO ${n} KYBD CV`, hear: kbdHear(n) }
  )
);
fmIn(1, 203, 'Sh', 'sh', 'vco1.fmSh', 'S/H OUT', 'the sample-and-hold');
fmIn(1, 257, 'Adsr', 'adsr', 'vco1.fmAdsr', 'ADSR', 'the ADSR envelope');
fmIn(1, 310, 'Lfo', 'lfo', 'vco1.fmLfo', 'LFO', 'the LFO sine');
fmIn(2, 450, 'Sh', 'sh', 'vco2.fmSh', 'S/H OUT', 'the sample-and-hold');
fmIn(2, 505, 'Adsr', 'adsr', 'vco2.fmAdsr', 'ADSR', 'the ADSR envelope');
fmIn(2, 557, 'Vco1', 'vco1', 'vco2.fmVco1', 'VCO 1', 'VCO 1’s pulse wave');
fmIn(3, 725, 'Noise', 'noise', 'vco3.fmNoise', 'NOISE GEN', 'the noise generator');
fmIn(3, 778, 'Adsr', 'adsr', 'vco3.fmAdsr', 'ADSR', 'the ADSR envelope');
fmIn(3, 830, 'Vco2', 'vco2', 'vco3.fmVco2', 'VCO 2', 'VCO 2’s sine wave');
jin(
  'j.vco2Pwm',
  610,
  915,
  'PWM',
  'pw2',
  (v) => g10(num(v, 'vco2.pwm')) * 0.45,
  'Pulse-width modulation input of VCO 2, pre-wired from the noise generator. A cable here replaces the noise; the slider above sets the depth.',
  {
    name: 'VCO 2 PWM',
    check: (v) =>
      num(v, 'vco2.pwm') <= 0
        ? 'The PWM slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vco3Pwm',
  883,
  915,
  'PWM',
  'pw3',
  (v) => g10(num(v, 'vco3.pwm')) * 0.45,
  'Pulse-width modulation input of VCO 3, pre-wired from the ADSR. A cable here replaces the ADSR; the slider above sets the depth.',
  {
    name: 'VCO 3 PWM',
    check: (v) =>
      num(v, 'vco3.pwm') <= 0
        ? 'The PWM slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
(
  [
    [152, 'KYBD\nCV'],
    [203, 'S/H\nOUT'],
    [257, 'ADSR', 'adsr'],
    [310, 'LFO', 'sine'],
    [400, 'KYBD\nCV'],
    [450, 'S/H\nOUT'],
    [505, 'ADSR', 'adsr'],
    [557, 'VCO 1', 'sq'],
    [610, 'NOISE\nGEN'],
    [672, 'KYBD\nCV'],
    [725, 'NOISE\nGEN'],
    [778, 'ADSR', 'adsr'],
    [830, 'VCO 2', 'sine'],
    [883, 'ADSR', 'adsr'],
  ] as [number, string, WaveShape?][]
).forEach(([x, t, g]) => prewired(x, t, g));
text(230, 894, 'FM CONTROL', 12.5);
decor.push({ t: 'path', d: 'M160 889 H185 M275 889 H302 M160 889 V897 M302 889 V897', w: 1.4 });
text(478, 894, 'FM CONTROL', 12.5);
text(610, 894, 'PWM', 12.5);
text(752, 894, 'FM CONTROL', 12.5);
text(883, 894, 'PWM', 12.5);
[
  [152, 672],
  [152, 723],
  [398, 620],
  [398, 672],
  [398, 724],
  [673, 620],
  [673, 672],
  [673, 724],
  [478, 586],
  [530, 586],
  [583, 586],
  [751, 586],
  [804, 586],
  [856, 586],
  [1060, 585],
  [1115, 585],
  [1170, 585],
  [1225, 585],
].forEach(([x, y]) =>
  decor.push({ t: 'circle', hw: true, x, y, r: 11, fill: '#141517', stroke: '#0c0c0d', sw: 1 })
);

// ── Filter ────────────────────────────────────────────────────────────────
hf('vcf.freq', 1120, 143, 'white', {
  def: 7.4,
  label: 'INITIAL FILTER FREQUENCY',
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the low-pass filter, marked in decades from 10 Hz to 10 kHz. Lower it and the sound gets darker; raise it and more of the oscillators’ buzz comes through. The control inputs below add to this setting.',
});
hf('vcf.fine', 1120, 217, 'white', {
  min: -5,
  max: 5,
  def: 0,
  label: 'FINE TUNE',
  module: 'filter',
  fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs((v / 5) * 0.5).toFixed(2)} oct`,
  help: 'Fine adjustment of the cutoff, about half an octave either way. Useful for tuning a ringing, self-oscillating filter to a note.',
});
hf('vcf.res', 1120, 291, 'white', {
  label: 'RESONANCE',
  module: 'filter',
  fmt: pct,
  help: 'Boosts the sound right at the cutoff, so filter sweeps become vocal and squelchy. Near MAX the filter rings on its own as a sine wave, which you can play from the keyboard.',
});
text(1120, 104, 'INITIAL FILTER FREQUENCY', 12.5);
(
  [
    ['10', -98],
    ['100', -35],
    ['1kHz', 27],
    ['10kHz', 88],
  ] as [string, number][]
).forEach(([t, dx]) => text(1120 + dx, 126, t, 10.5));
text(1120, 186, 'FINE TUNE', 12.5);
decor.push({ t: 'line', x1: 1120, y1: 191, x2: 1120, y2: 201, w: 1.6 });
text(1120, 258, 'RESONANCE', 12.5);
text(1025, 274, 'MIN', 10.5);
text(1212, 274, 'MAX', 10.5);
slide('vcf.mode', 950, 378, {
  kind: 'enum',
  def: '4012',
  label: 'MODE',
  module: 'filter',
  options: [
    { v: '4012', label: '4012' },
    { v: '4072', label: '4072' },
  ],
  help: 'Chooses between the two filter circuits ARP used in the 2600: the early 4012 and the later 4072. Both are 24 dB low-pass filters. In this app the 4072 is driven a little harder, so it sounds slightly thicker and grittier.',
});
text(950, 330, 'MODE', 13);
text(950, 344, '4012', 10.5);
text(950, 414, '4072', 10.5);
[
  [1067, 375],
  [1119, 375],
  [1172, 375],
  [1225, 375],
  [960, 180],
  [960, 253],
].forEach(([x, y]) =>
  decor.push({ t: 'circle', hw: true, x, y, r: 11, fill: '#141517', stroke: '#0c0c0d', sw: 1 })
);
box(1145, 460, 180, 72, 'VOLTAGE\nCONTROLLED\nFILTER / RESONATOR\nVCF', 15);
jout(
  'j.vcfOut',
  1300,
  462,
  'OUTPUT',
  'vcf1',
  'The filter output. It is already pre-wired to the VCA and to the mixer; use this jack to send the filtered sound anywhere else.',
  { name: 'VCF OUTPUT' }
);
text(1300, 497, 'OUTPUT', 11.5);
arrow('M1235 462 H1277', 1283, 462, RIGHT);
// the five audio sliders enter the module name from the left, the three control sliders from below
(
  [
    ['M935 623 V573 L968 436', 436],
    ['M988 623 V450', 450],
    ['M1040 623 V574 L1006 509 V464', 464],
    ['M1093 623 V576 L1025 507 V478', 478],
    ['M1145 623 V576 L1043 508 V492', 492],
  ] as [string, number][]
).forEach(([d, y]) => arrow(`${d} H1048`, 1054, y, RIGHT));
[
  [1197, 1097],
  [1250, 1140],
  [1303, 1182],
].forEach(([x, to]) => arrow(`M${x} 623 V577 L${to} 521 V503`, to, 497, UP));

const vcfAudio: [k: string, x: number, led: FaderLed, label: string, src: string, help: string][] =
  [
    [
      'ring',
      935,
      'green',
      'RING MOD',
      'the ring modulator',
      'Level of the ring modulator into the filter. Ring modulation gives clangy, bell-like tones that do not follow a simple pitch.',
    ],
    [
      'vco1',
      988,
      'blue',
      'VCO 1',
      'VCO 1’s pulse wave',
      'Level of VCO 1’s pulse wave into the filter.',
    ],
    [
      'vco2',
      1040,
      'green',
      'VCO 2',
      'VCO 2’s pulse wave',
      'Level of VCO 2’s pulse wave into the filter.',
    ],
    [
      'vco3',
      1093,
      'blue',
      'VCO 3',
      'VCO 3’s sawtooth',
      'Level of VCO 3’s sawtooth into the filter.',
    ],
    [
      'noise',
      1145,
      'green',
      'NOISE GEN',
      'the noise generator',
      'Level of the noise generator into the filter: breath and grit at low settings, wind, surf and snares on its own.',
    ],
  ];
vcfAudio.forEach(([k, x, led, label, src, help]) => {
  vf(`vcf.${k}`, x, 739, led, {
    def: k === 'vco1' ? 8 : 0,
    label: `${label} (VCF AUDIO)`,
    module: 'mixer',
    fmt: pct,
    help: `${help} High levels push the filter’s input into a thicker, slightly driven tone.`,
  });
  const id = `j.vcf${k.charAt(0).toUpperCase()}${k.slice(1)}`;
  jin(
    id,
    x,
    915,
    label,
    'vcfIn',
    (v) => level10(num(v, `vcf.${k}`), 0.9),
    `Audio input to the filter, pre-wired from ${src}. A cable here replaces ${src} with the patched signal, at the level set by the slider above.`,
    {
      add: true,
      name: `VCF AUDIO (${label})`,
      check: (v) =>
        num(v, `vcf.${k}`) <= 0
          ? 'The slider above this jack is at 0, and it sets the level of whatever arrives here. Raise it to hear this cable.'
          : null,
      hear: (_v, x) =>
        x.kind === 'audio' || x.kind === 'noise' || x.kind === 'fast'
          ? `The filter now hears ${x.src} in place of ${src}, at the level set by the slider above. The other filter inputs carry on as before.`
          : `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} is a slow control signal, not a sound. Fed into the filter in place of ${src} it gives clicks and thumps at most.`,
    }
  );
});
(
  [
    [935, 'RING\nMOD'],
    [988, 'VCO 1', 'sq'],
    [1040, 'VCO 2', 'sq'],
    [1093, 'VCO 3', 'saw'],
    [1145, 'NOISE\nGEN'],
    [1197, 'KYBD\nCV'],
    [1250, 'ADSR', 'adsr'],
    [1303, 'VCO 2', 'sine'],
  ] as [number, string, WaveShape?][]
).forEach(([x, t, g]) => prewired(x, t, g));
text(1040, 894, 'AUDIO', 12.5);
text(1250, 894, 'CONTROL', 12.5);
decor.push({
  t: 'path',
  d: 'M943 889 H1010 M1070 889 H1137 M943 889 V897 M1137 889 V897 M1205 889 H1215 M1285 889 H1295 M1205 889 V897 M1295 889 V897',
  w: 1.4,
});
vf('vcf.kbd', 1197, 739, 'white', {
  def: 5,
  label: 'KYBD CV (VCF CONTROL)',
  module: 'filter',
  fmt: pct,
  help: 'Key tracking: how far the cutoff follows the notes you play. At 10 the filter moves exactly with the keyboard, so high notes stay as bright as low ones and a ringing filter plays in tune.',
});
vf('vcf.adsr', 1250, 739, 'red', {
  label: 'ADSR (VCF CONTROL)',
  module: 'filter',
  fmt: pct,
  help: 'How far the ADSR envelope opens the filter on each note. This is the filter "sweep": a short decay gives a pluck, a slow attack a brassy swell.',
});
vf('vcf.vco2cv', 1303, 739, 'green', {
  label: 'VCO 2 (VCF CONTROL)',
  module: 'mod',
  fmt: pct,
  help: 'How much VCO 2’s sine wave moves the cutoff. With VCO 2 in LF this is a filter wobble; at audio rate it adds a rasping growl.',
});
jin(
  'j.vcfKbd',
  1197,
  915,
  'KYBD CV',
  'cutoff',
  (v) => g10(num(v, 'vcf.kbd')),
  'Cutoff control input, pre-wired from the keyboard CV. A cable here replaces the keyboard tracking with the patched signal; the slider above sets the depth.',
  {
    name: 'VCF CONTROL (KYBD CV)',
    check: (v) =>
      num(v, 'vcf.kbd') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vcfAdsr',
  1250,
  915,
  'ADSR',
  'cutoff',
  (v) => g10(num(v, 'vcf.adsr')) * 8,
  'Cutoff control input, pre-wired from the ADSR. A cable here replaces the ADSR; the slider above sets the depth.',
  {
    name: 'VCF CONTROL (ADSR)',
    check: (v) =>
      num(v, 'vcf.adsr') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vcfVco2Cv',
  1303,
  915,
  'VCO 2',
  'cutoff',
  (v) => g10(num(v, 'vcf.vco2cv')) * 3,
  'Cutoff control input, pre-wired from VCO 2’s sine wave. A cable here replaces it; the slider above sets the depth.',
  {
    name: 'VCF CONTROL (VCO 2)',
    check: (v) =>
      num(v, 'vcf.vco2cv') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);

// ── ADSR ──────────────────────────────────────────────────────────────────
const TF_OPTS = [
  { v: '2', label: 'x2' },
  { v: '1', label: 'x1' },
  { v: '0.5', label: 'x0.5' },
];
(
  [
    [
      'a',
      1355,
      'ATTACK\nTIME',
      0,
      'Attack: how long the ADSR takes to rise after a key is pressed. Short for plucks and basses, long for swells.',
      envA,
    ],
    [
      'd',
      1408,
      'DECAY\nTIME',
      5,
      'Decay: how long the ADSR takes to fall from its peak to the sustain level.',
      envDR,
    ],
    [
      's',
      1460,
      'SUS\nLEVEL',
      7,
      'Sustain: the level the ADSR holds while the key stays down.',
      null,
    ],
    [
      'r',
      1512,
      'REL\nTIME',
      3,
      'Release: how long the ADSR takes to fall to zero after the key is let go.',
      envDR,
    ],
  ] as [string, number, string, number, string, ((v: number) => number) | null][]
).forEach(([k, x, label, def, help, map]) => {
  vf(`adsr.${k}`, x, 235, 'red', {
    def,
    label: `${label.replace(/\n/g, ' ')} (ADSR)`,
    module: 'env',
    fmt: map ? (v) => fmtTime(map(v)) : pct,
    help: `${help} The ADSR is pre-wired to the filter, the VCA (exponential input), all three oscillators’ FM and VCO 3’s pulse width, each through its own slider. TIME FACTOR scales its times.`,
  });
  text(x, 92, label, 12.5);
  decor.push({ t: 'wave', x, y: 362, size: 9, shape: 'adsr' });
});
slide(
  'adsr.time',
  1357,
  465,
  {
    kind: 'enum',
    def: '1',
    label: 'TIME FACTOR (ADSR)',
    module: 'env',
    options: TF_OPTS,
    help: 'Multiplies all of the ADSR’s times: x0.5 halves them for snappier notes, x2 doubles them for slow swells.',
  },
  48
);
text(1357, 436, 'x2', 10.5);
text(1373, 469, 'x1', 10.5, { anchor: 'start' });
text(1357, 501, 'x0.5', 10.5);
text(1357, 512, 'TIME\nFACTOR', 9.5);
box(1434, 394, 190, 42, 'ADSR\nENVELOPE GENERATOR', 13.5);
arrow('M1407 447 V423', 1407, 417, UP);
// the keyboard gate reaches GATE IN from the AR section below; MANUAL fires the ADSR too
arrow('M1381 585 V549 H1407 V510', 1407, 504, UP);
wire('M1376 592 L1381 585 L1386 592');
arrow('M1409 598 V579 Q1409 571 1417 571 H1453 Q1461 571 1461 563 V423', 1461, 417, UP);
arrow('M1512 417 V439', 1512, 445, DOWN);
jin(
  'j.adsrGate',
  1407,
  462,
  'GATE IN',
  'gateIn',
  1,
  'Gate input for the envelopes. With nothing patched it carries the keyboard gate. A cable here fires the envelopes from something else, as long as the routing switch in the AR section is on GATE IN.',
  {
    name: 'GATE IN (ADSR)',
    check: (v) =>
      v['env.src'] !== 'gate'
        ? 'The envelope routing switch (in the AR section) is not on GATE IN, so the envelopes are not listening to this jack. Set it to GATE IN.'
        : null,
  }
);
text(1407, 497, 'GATE IN', 11.5);
jout(
  'j.adsrOut',
  1512,
  462,
  'OUTPUT',
  'env1',
  'The ADSR envelope as a control voltage, rising from 0 to full and back. Patch it anywhere the pre-wiring does not reach.',
  { name: 'ADSR OUTPUT' }
);
text(1512, 497, 'OUTPUT', 11.5);

// ── AR envelope ───────────────────────────────────────────────────────────
vf('ar.a', 1357, 739, 'red', {
  def: 0,
  tickSide: 'left',
  label: 'ATTACK TIME (AR)',
  module: 'env',
  fmt: (v) => fmtTime(envA(v)),
  help: 'Attack of the AR envelope: how long it takes to rise when fired. The AR is pre-wired to the VCA’s linear control input.',
});
vf('ar.r', 1512, 739, 'red', {
  def: 3,
  label: 'REL TIME (AR)',
  module: 'env',
  fmt: (v) => fmtTime(envDR(v)),
  help: 'Release of the AR envelope: how long it takes to fall after the gate ends. It has no decay or sustain: it rises, holds at full while the gate is on, then falls.',
});
text(1357, 604, 'ATTACK\nTIME', 12.5);
text(1512, 604, 'REL\nTIME', 12.5);
controls.push({
  id: 'env.manual',
  type: 'button',
  x: 1407,
  y: 640,
  w: 26,
  h: 26,
  labelPos: 'none',
  kind: 'bool',
  def: false,
  label: 'MANUAL',
  module: 'env',
  help: 'Fires both envelopes by hand, without a key. In this app the button latches: click it to hold the envelopes open, click again to let go.',
});
decor.push(
  { t: 'circle', hw: true, x: 1407, y: 640, r: 18, fill: '#b01e1a', stroke: '#000', sw: 1.5 },
  {
    t: 'led',
    x: 1407,
    y: 640,
    r: 5,
    color: 'red',
    litWhen: { id: 'env.manual', eq: true },
  }
);
text(1407, 610, 'MANUAL', 11.5);
jout(
  'j.arOut',
  1460,
  640,
  'OUTPUT',
  'env2',
  'The AR envelope as a control voltage. Use it where the pre-wiring does not reach, for a second, simpler envelope.',
  { name: 'AR OUTPUT' }
);
text(1460, 610, 'OUTPUT', 11.5);
box(1435, 728, 90, 42, 'AR\nENV GEN', 14);
arrow('M1407 660 V700', 1407, 706, DOWN);
arrow('M1460 706 V663', 1460, 657, UP);
arrow('M1381 829 V779 H1409 V757', 1409, 751, UP);
arrow('M1381 779 V770', 1381, 764, UP);
dot(1381, 779);
wire('M1381 829 H1397');
arrow('M1460 895 V788 H1409 V800', 1409, 806, DOWN);
arrow('M1512 895 V885 H1472', 1466, 885, LEFT);
arrow('M1407 895 V872', 1407, 866, UP);
slide(
  'env.src',
  1407,
  835,
  {
    kind: 'enum',
    def: 'gate',
    label: 'ENVELOPE ROUTING',
    module: 'mode',
    options: [
      { v: 'sh', label: 'S/H CLOCK' },
      { v: 'gate', label: 'GATE IN' },
      { v: 'trig', label: 'TRIG IN' },
    ],
    help: 'What fires both envelopes. GATE IN: the keyboard (or the GATE IN jacks). TRIG IN: each key press fires a quick burst that rises and falls however long you hold the key. S/H CLOCK: the sample-and-hold clock fires them over and over, keys or no keys.',
  },
  54
);
slide(
  'ar.time',
  1357,
  915,
  {
    kind: 'enum',
    def: '1',
    label: 'TIME FACTOR (AR)',
    module: 'env',
    options: TF_OPTS,
    help: 'Multiplies the AR envelope’s times by 0.5, 1 or 2.',
  },
  48
);
text(1357, 886, 'x2', 10.5);
text(1373, 919, 'x1', 10.5, { anchor: 'start' });
text(1357, 951, 'x0.5', 10.5);
text(1357, 966, 'TIME\nFACTOR', 10.5);
decor.push(
  { t: 'wave', x: 1357, y: 866, size: 8, shape: 'ar' },
  { t: 'wave', x: 1512, y: 866, size: 8, shape: 'ar' }
);
const srcCheck =
  (want: string, name: string) =>
  (v: ControlValues): string | null =>
    v['env.src'] !== want
      ? `The envelope routing switch is not on ${name}, so the envelopes are not listening to this jack. Set it to ${name}.`
      : null;
jin(
  'j.shClock',
  1407,
  910,
  'S/H CLOCK',
  'envClk',
  1,
  'Clock input for the envelope routing. With nothing patched it carries the sample-and-hold clock. With the routing switch on S/H CLOCK, a cable here fires the envelopes from something else, such as a slow VCO’s pulse.',
  { name: 'S/H CLOCK (envelope routing)', check: srcCheck('sh', 'S/H CLOCK') }
);
jin(
  'j.arGate',
  1460,
  910,
  'GATE IN',
  'gateIn',
  1,
  'Gate input for the envelopes, wired in parallel with the GATE IN jack in the ADSR section. With nothing patched it carries the keyboard gate.',
  { name: 'GATE IN (AR)', check: srcCheck('gate', 'GATE IN') }
);
jin(
  'j.trigIn',
  1512,
  910,
  'TRIG IN',
  'trigIn',
  1,
  'Trigger input for the envelopes. With nothing patched it follows the keyboard. Each time the signal here rises, the envelopes fire once, rising to the top and falling straight away.',
  { name: 'TRIG IN', check: srcCheck('trig', 'TRIG IN') }
);
prewired(1407, 'S/H\nCLOCK');
text(1460, 972, 'GATE IN', 11);
decor.push({ t: 'wave', x: 1460, y: 988, size: 9, shape: 'sq' });
text(1512, 972, 'TRIG IN', 11);
decor.push({ t: 'path', d: 'M1503 994 H1512 V980 H1515 V994 H1522', w: 1.6 });

// ── VCA ───────────────────────────────────────────────────────────────────
vf('vca.gain', 1567, 235, 'white', {
  label: 'INITIAL GAIN',
  module: 'amp',
  fmt: pct,
  help: 'Holds the VCA open by a fixed amount, before any envelope. At 0 the envelopes do all the work; turn it up and the VCA passes sound with no key held, for drones.',
});
text(1567, 92, 'INITIAL\nGAIN', 12.5);
jout(
  'j.vcaOut',
  1567,
  462,
  'OUTPUT',
  'vca',
  'The VCA output. It is already pre-wired to the mixer; use this jack to send the shaped sound anywhere else.',
  { name: 'VCA OUTPUT' }
);
text(1567, 497, 'OUTPUT', 11.5);
box(1624, 538, 120, 62, 'VOLTAGE\nCONTROLLED\nAMPLIFIER', 14);
arrow('M1608 506 V462 H1590', 1584, 462, LEFT);
// audio sliders into the side of the module name, control sliders into the bottom of it
arrow('M1567 623 V613 L1546 610 V525 H1557', 1563, 525, RIGHT);
arrow('M1620 623 V613 L1551 603 V546 H1557', 1563, 546, RIGHT);
arrow('M1672 623 V613 L1597 603 V576', 1597, 570, UP);
arrow('M1725 623 V613 L1649 603 V576', 1649, 570, UP);
(
  [
    [
      1567,
      'white',
      'vcf',
      'VCF',
      10,
      'Level of the filter output into the VCA. This is the normal path for a note: oscillators, filter, then VCA.',
    ],
    [
      1620,
      'green',
      'ring',
      'RING MOD',
      0,
      'Level of the ring modulator straight into the VCA, skipping the filter.',
    ],
    [
      1672,
      'red',
      'ar',
      'AR (LIN)',
      0,
      'How far the AR envelope opens the VCA, through its linear control input. Linear gives an even fade.',
    ],
    [
      1725,
      'red',
      'adsr',
      'ADSR (EXP’L)',
      10,
      'How far the ADSR opens the VCA, through its exponential control input. Exponential makes decays and releases die away naturally, like a struck string.',
    ],
  ] as [number, FaderLed, string, string, number, string][]
).forEach(([x, led, k, label, def, help]) =>
  vf(`vca.${k}`, x, 739, led, { def, label: `${label} (VCA)`, module: 'amp', fmt: pct, help })
);
jin(
  'j.vcaVcf',
  1567,
  915,
  'VCF',
  'vcaIn',
  (v) => level10(num(v, 'vca.vcf'), 1),
  'Audio input of the VCA, pre-wired from the filter output. A cable here replaces the filter with the patched signal, at the level set by the slider above.',
  {
    name: 'VCA AUDIO (VCF)',
    check: (v) =>
      num(v, 'vca.vcf') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vcaRing',
  1620,
  915,
  'RING MOD',
  'vcaIn',
  (v) => level10(num(v, 'vca.ring'), 1),
  'Second audio input of the VCA, pre-wired from the ring modulator. A cable here replaces the ring modulator; the slider above sets the level.',
  {
    add: true,
    name: 'VCA AUDIO (RING MOD)',
    check: (v) =>
      num(v, 'vca.ring') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vcaLin',
  1672,
  915,
  'LIN',
  'amp',
  (v) => g10(num(v, 'vca.ar')),
  'Linear gain control of the VCA, pre-wired from the AR envelope. A cable here replaces the AR; the slider above sets how far it opens the VCA.',
  {
    name: 'VCA CNTRL (LIN)',
    check: (v) =>
      num(v, 'vca.ar') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
jin(
  'j.vcaExp',
  1725,
  915,
  'EXP’L',
  'ampExp',
  (v) => g10(num(v, 'vca.adsr')),
  'Exponential gain control of the VCA, pre-wired from the ADSR. A cable here replaces the ADSR. Small voltages barely open it; the top of the range opens it quickly.',
  {
    name: 'VCA CNTRL (EXP’L)',
    check: (v) =>
      num(v, 'vca.adsr') <= 0
        ? 'The slider above this jack is at 0. Raise it to hear this cable.'
        : null,
  }
);
(
  [
    [1567, 'VCF'],
    [1620, 'RING\nMOD'],
    [1672, 'AR', 'ar'],
    [1725, 'ADSR', 'adsr'],
  ] as [number, string, WaveShape?][]
).forEach(([x, t, g]) => prewired(x, t, g));
text(1594, 894, 'AUDIO', 12.5);
text(1698, 894, 'CNTRL', 12.5);
text(1664, 880, 'LIN', 9.5);
text(1736, 880, 'EXP’L', 9.5);
[1567, 1620, 1672].forEach((x) =>
  decor.push({
    t: 'circle',
    hw: true,
    x,
    y: 587,
    r: 11,
    fill: '#141517',
    stroke: '#0c0c0d',
    sw: 1,
  })
);

// ── Mixer, reverb, pan and outputs ────────────────────────────────────────
vf('mix.vcf', 1818, 739, 'white', {
  label: 'VCF (MIXER)',
  module: 'mixer',
  fmt: pct,
  help: 'Level of the filter output straight into the final mix, bypassing the VCA. It does not stop between notes, so with this up the sound drones unless something else shapes it.',
});
vf('mix.vca', 1870, 739, 'white', {
  def: 8,
  ticks: 0,
  label: 'VCA (MIXER)',
  module: 'mixer',
  fmt: pct,
  help: 'Level of the VCA output into the final mix. This is the normal output level of a played note.',
});
box(1845, 475, 74, 26, 'MIXER', 14);
jout(
  'j.mixVcfPost',
  1818,
  565,
  'VCF POST',
  'att1',
  'The mixer’s VCF channel after its slider. The slider becomes a level control for anything patched into the mixer’s VCF input, audio or control voltage.',
  {
    name: 'MIXER VCF (post-slider)',
    check: (v) =>
      num(v, 'mix.vcf') <= 0
        ? 'The mixer VCF slider is at 0, so nothing comes out of this jack. Raise it.'
        : null,
  }
);
jout('j.mixVcaPost', 1870, 565, 'VCA POST', 'att2', 'The mixer’s VCA channel after its slider.', {
  name: 'MIXER VCA (post-slider)',
  check: (v) =>
    num(v, 'mix.vca') <= 0
      ? 'The mixer VCA slider is at 0, so nothing comes out of this jack. Raise it.'
      : null,
});
[1818, 1870].forEach((x) => {
  wire(`M${x} 488 V550`, 1.6);
  attSym(x, 522);
  arrow(`M${x} 623 V588`, x, 582, UP);
});
jin(
  'j.mixVcf',
  1818,
  915,
  'VCF',
  'att1In',
  1,
  'Mixer input, pre-wired from the filter output. A cable here replaces the filter with the patched signal, at the level set by the slider above.',
  { name: 'MIXER AUDIO (VCF)' }
);
jin(
  'j.mixVca',
  1870,
  915,
  'VCA',
  'att2In',
  1,
  'Mixer input, pre-wired from the VCA output. A cable here replaces the VCA with the patched signal.',
  { name: 'MIXER AUDIO (VCA)' }
);
(
  [
    [1818, 'VCF'],
    [1870, 'VCA'],
  ] as [number, string][]
).forEach(([x, t]) => prewired(x, t));
text(1845, 894, 'AUDIO', 12.5);

vf('rev.left', 1715, 367, 'green', {
  label: 'REVERB LEFT',
  module: 'fx',
  fmt: pct,
  help: 'Level of the left channel of the spring reverb. The reverb hears the mixer output, so it adds space to whatever you are playing. This app plays in mono, so the two reverb sliders add together.',
});
vf('rev.right', 1765, 367, 'green', {
  label: 'REVERB RIGHT',
  module: 'fx',
  fmt: pct,
  ticks: 0,
  help: 'Level of the right channel of the spring reverb. This app plays in mono, so the two reverb sliders add together.',
});
box(1740, 510, 82, 26, 'REVERB', 14);
jout(
  'j.mixOut',
  1715,
  552,
  'MIXER OUT',
  'out',
  'The mixer output: VCF and VCA channels together, before pan and reverb.',
  { name: 'MIXER OUT' }
);
text(1715, 584, 'MIXER\nOUT', 10.5);
jout(
  'j.revOut',
  1765,
  552,
  'REVERB OUT',
  'rev',
  'The reverb on its own (wet only), for patching back into the synth.',
  { name: 'REVERB OUT' }
);
text(1765, 584, 'REVERB\nOUT', 10.5);
// the mixer feeds the reverb tank; each reverb slider feeds its own output
arrow('M1715 537 V531', 1715, 525, UP);
[1715, 1765].forEach((x) => arrow(`M${x} 497 V490`, x, 484, UP));
arrow('M1715 258 V236 H1685', 1679, 236, LEFT);
arrow('M1765 258 V236 H1845', 1851, 236, RIGHT);
arrow('M1800 236 V552 H1792', 1786, 552, LEFT);
dot(1800, 236);
jin(
  'j.postMix',
  1845,
  367,
  'POST-MIXER',
  'dryIn',
  1,
  'Input to the PAN slider, pre-wired from the mixer. A cable here replaces the mixer’s dry sound at the outputs with the patched signal. The reverb still hears the mixer, so the reverb carries on.',
  { name: 'POST-MIXER (to PAN)' }
);
arrow('M1845 462 V390', 1845, 384, UP, 1.6);
attSym(1845, 420);
jin(
  'j.revInL',
  1658,
  235,
  'LEFT INPUT',
  'dryIn',
  0.5,
  'Adds a signal to the left output, after the reverb. In this app, which plays in mono, left and right inputs both go to the output at half level.',
  { add: true, name: 'LEFT INPUT' }
);
jin(
  'j.revInR',
  1872,
  235,
  'RIGHT INPUT',
  'dryIn',
  0.5,
  'Adds a signal to the right output, after the reverb. In this app, which plays in mono, left and right inputs both go to the output at half level.',
  { add: true, name: 'RIGHT INPUT' }
);
text(1658, 270, 'LEFT\nINPUT', 11);
text(1872, 270, 'RIGHT\nINPUT', 11);
jout(
  'j.outL',
  1658,
  105,
  'L OUTPUT',
  'master',
  'The final left output, after pan and reverb, on a small jack so you can patch the finished sound back into the synth.',
  { name: 'L OUTPUT' }
);
jout('j.outR', 1872, 105, 'R OUTPUT', 'master', 'The final right output, after pan and reverb.', {
  name: 'R OUTPUT',
});
[1730, 1808].forEach((x) =>
  decor.push(
    { t: 'circle', x, y: 105, r: 28, fill: 'url(#kysNut)', stroke: '#55565a', sw: 1.5 },
    { t: 'circle', x, y: 105, r: 17, fill: '#070708', stroke: '#2a2b2e', sw: 2 },
    { t: 'circle', x, y: 105, r: 8, fill: '#000', stroke: '#3a3b3f', sw: 1 }
  )
);
text(1705, 150, 'L OUTPUT', 12);
text(1832, 150, 'R OUTPUT', 12);
// output amplifiers: PAN and the LEFT / RIGHT INPUT jacks meet under each triangle
wire(
  'M1675 105 H1701 M1837 105 H1855 M1658 121 V132 M1872 121 V132 M1647 154 L1658 132 L1669 154 Z M1861 154 L1872 132 L1883 154 Z M1658 154 V219 M1872 154 V194 M1872 206 V219',
  1.8
);
dot(1658, 178);
dot(1872, 178);
arrow('M1686 178 H1670', 1664, 178, LEFT);
arrow('M1844 178 H1860', 1866, 178, RIGHT);
hf(
  'mix.pan',
  1765,
  178,
  'red',
  {
    min: -5,
    max: 5,
    def: 0,
    label: 'PAN',
    module: 'out',
    fmt: (v) =>
      Math.abs(v) < 0.1 ? 'centre' : `${Math.round(Math.abs(v) * 20)}% ${v < 0 ? 'left' : 'right'}`,
    help: 'Places the mixer’s sound between the left and right outputs. This app plays in mono, so PAN has no audible effect here.',
  },
  130
);
text(1765, 160, '← PAN →', 11);
wire('M1765 194 V200 H1901 V367 H1862', 1.8);

// ── Keyboard, portamento ─────────────────────────────────────────────────
// The bottom row is laid out from the photo: jacks at 1057 and 1125, slider marks from 1184 to 1370, inputs at 1382.
jout(
  'j.trigOut',
  150,
  1057,
  'TRIG OUT',
  'gate',
  'The keyboard trigger. In this app it carries the key gate (on while a key is held).',
  { name: 'TRIG OUT' }
);
jout(
  'j.upper',
  205,
  1057,
  'UPPER VOICE',
  'kbd2',
  'Pitch CV of the higher of two held keys. With VOICE MODE on DUO, patch it to one oscillator’s KYBD CV input to play two notes at once.',
  { name: 'UPPER VOICE' }
);
jout('j.gateOut', 150, 1125, 'GATE OUT', 'gate', 'The keyboard gate: on while a key is held.', {
  name: 'GATE OUT',
});
jout(
  'j.kbdOut',
  205,
  1125,
  'KYBD CV',
  'kbd',
  'The keyboard pitch as a control voltage, one step per octave, after portamento.',
  { name: 'KYBD CV OUT' }
);
text(150, 1019, 'TRIG OUT', 11.5);
decor.push({ t: 'path', d: 'M141 1034 H149 V1025 H152 V1034 H160', w: 1.4 });
text(205, 1018, 'UPPER\nVOICE', 11.5);
text(150, 1088, 'GATE OUT', 11.5);
decor.push({ t: 'wave', x: 150, y: 1099, size: 7, shape: 'sq' });
text(205, 1088, 'KYBD\nCV', 11.5);
slide('kbd.voice', 262, 1090, {
  kind: 'enum',
  def: 'mono',
  label: 'VOICE MODE',
  module: 'mode',
  options: [
    { v: 'mono', label: 'MONO' },
    { v: 'duo', label: 'DUO' },
  ],
  help: 'MONO: one note at a time. DUO: with two keys held, the lower one plays through the keyboard CV and the higher one appears at UPPER VOICE, so a cable from UPPER VOICE to an oscillator gives you two-note playing.',
});
text(262, 1034, 'VOICE\nMODE', 13);
text(262, 1062, 'MONO', 10.5);
text(262, 1125, 'DUO', 10.5);
slide(
  'kbd.repeat',
  262,
  1211,
  {
    kind: 'enum',
    def: 'off',
    label: 'REPEAT',
    module: 'mode',
    options: [
      { v: 'kybd', label: 'KYBD' },
      { v: 'off', label: 'OFF' },
      { v: 'auto', label: 'AUTO' },
    ],
    help: 'KYBD: a held key re-fires the envelopes at the LFO SPEED. OFF: one envelope per key press. AUTO: the envelopes fire at the LFO SPEED with no key held at all.',
  },
  54
);
text(262, 1164, 'REPEAT', 13);
text(262, 1178, 'KYBD', 10.5);
text(286, 1215, 'OFF', 10.5, { anchor: 'start' });
text(262, 1250, 'AUTO', 10.5);
slide('kbd.trig', 262, 1350, {
  kind: 'enum',
  def: 'single',
  label: 'TRIG MODE',
  module: 'mode',
  options: [
    { v: 'single', label: 'SINGLE' },
    { v: 'mult', label: 'MULT' },
  ],
  help: 'SINGLE: the envelopes only restart when you play a key with no other key held, so overlapping (legato) notes glide on one envelope. MULT: every new key restarts them.',
});
text(262, 1290, 'TRIG\nMODE', 13);
text(262, 1319, 'SINGLE', 10.5);
text(262, 1385, 'MULT', 10.5);
slide('porta.on', 147, 1282, {
  kind: 'bool',
  def: false,
  label: 'PORTAMENTO ON / OFF',
  module: 'glide',
  help: 'Switches portamento on: the pitch slides from one note to the next instead of jumping.',
});
text(147, 1251, 'ON', 11);
text(147, 1317, 'OFF', 11);
controls.push({
  id: 'porta.momen',
  type: 'button',
  x: 147,
  y: 1362,
  w: 24,
  h: 24,
  labelPos: 'none',
  kind: 'bool',
  def: false,
  label: 'MOMEN',
  module: 'glide',
  help: 'Momentary portamento: on the hardware the glide works only while the button is held. In this app it latches: click to turn it on, again to turn it off.',
});
decor.push(
  { t: 'circle', hw: true, x: 147, y: 1362, r: 16, fill: '#b01e1a', stroke: '#000', sw: 1.5 },
  {
    t: 'led',
    x: 147,
    y: 1362,
    r: 4,
    color: 'red',
    litWhen: { id: 'porta.momen', eq: true },
  }
);
text(147, 1340, 'MOMEN', 11);
vfb('porta.amount', 205, 'white', {
  tickSide: 'left',
  tickEnds: false,
  def: 3,
  label: 'PORTAMENTO',
  module: 'glide',
  fmt: (v) => fmtTime(portaS(v)),
  help: 'Glide time. MAX is the slowest slide. It does nothing unless the ON switch or the MOMEN button is on.',
});
// MAX and MIN take the place of the end marks
text(192, 1188, 'MAX', 11, { anchor: 'end' });
text(192, 1374, 'MIN', 11, { anchor: 'end' });
box(176, 1410, 106, 25, 'PORTAMENTO', 13);

// ── LFO ───────────────────────────────────────────────────────────────────
vfb('lfo.speed', 320, 'yellow', {
  def: 5,
  label: 'LFO SPEED',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every four seconds to 25 per second. The LFO sine is pre-wired to VCO 1’s FM input, and the same speed sets the rate of REPEAT.',
});
vfb('lfo.vibDelay', 372, 'yellow', {
  label: 'VIB DELAY',
  module: 'lfo',
  fmt: (v) => fmtTime(g10(v) * 3),
  help: 'How long the delayed vibrato takes to fade in after each new note, up to three seconds. It affects only the LFO SINE DELAYED output.',
});
vfb('lfo.vibDepth', 426, 'yellow', {
  def: 5,
  label: 'VIB DEPTH',
  module: 'lfo',
  fmt: pct,
  help: 'Strength of the delayed vibrato at the LFO SINE DELAYED output. Patch that output into an FM input to use it.',
});
text(320, 1405, 'LFO\nSPEED', 12.5);
text(372, 1405, 'VIB\nDELAY', 12.5);
text(426, 1405, 'VIB\nDEPTH', 12.5);
jout(
  'j.lfoSaw',
  318,
  1057,
  'LFO SAW',
  'lfoSaw',
  'The LFO as a rising ramp that drops back: a repeating sweep.',
  { name: 'LFO SAW' }
);
jout(
  'j.lfoSq',
  318,
  1125,
  'LFO SQUARE',
  'lfoSq',
  'The LFO as a square wave, jumping between two levels: trills, and a clock for rhythmic patches.',
  { name: 'LFO SQUARE' }
);
jin(
  'j.extVib',
  372,
  1057,
  'EXT VIB IN',
  'vibIn',
  1,
  'Adds an outside signal to the delayed vibrato output.',
  { add: true, name: 'EXT VIB IN' }
);
jout(
  'j.lfoDelayed',
  372,
  1125,
  'LFO SINE DELAYED',
  'vib',
  'The LFO sine, faded in after each new note by VIB DELAY and scaled by VIB DEPTH. Patch it into any FM input for a vibrato that arrives late, as a singer’s does.',
  {
    name: 'LFO SINE DELAYED',
    check: (v) =>
      num(v, 'lfo.vibDepth') <= 0
        ? 'VIB DEPTH is at 0, so nothing comes out of this jack. Raise VIB DEPTH.'
        : null,
  }
);
text(318, 1019, 'LFO', 11.5);
decor.push({ t: 'wave', x: 318, y: 1031, size: 8, shape: 'saw' });
text(318, 1088, 'LFO', 11.5);
decor.push({ t: 'wave', x: 318, y: 1099, size: 7, shape: 'sq' });
text(372, 1018, 'EXT VIB\nIN', 11.5);
text(362, 1088, 'LFO', 11.5);
decor.push({ t: 'wave', x: 391, y: 1084, size: 7, shape: 'sine' });
text(372, 1100, 'DELAYED', 10);
// EXT VIB IN joins the delayed vibrato on its way to VIB DEPTH
arrow('M388 1057 H418 Q426 1057 426 1065 V1150', 426, 1156, DOWN, 1.8);
arrow('M361 1114 L343 1104 V1070 L350 1065.3', 355, 1062, -34, 1.8);

// ── Preamp and envelope follower ─────────────────────────────────────────
vfb('pre.gain', 479, 'white', {
  tickEnds: false,
  def: 5,
  label: 'GAIN (PREAMP)',
  module: 'util',
  fmt: pct,
  help: 'How much the preamp amplifies its input, within the range set by the RANGE switch.',
});
text(493, 1188, 'MAX', 10.5, { anchor: 'start' });
text(493, 1374, 'MIN', 10.5, { anchor: 'start' });
slide(
  'pre.range',
  531,
  1279,
  {
    kind: 'enum',
    def: 'x10',
    label: 'RANGE',
    module: 'util',
    options: [
      { v: 'x1000', label: 'x1000' },
      { v: 'x100', label: 'x100' },
      { v: 'x10', label: 'x10' },
    ],
    help: 'The preamp’s gain range: x10, x100 or x1000. It is built to bring a quiet outside signal, such as a microphone or guitar, up to synth level.',
  },
  54
);
text(531, 1233, 'RANGE', 13);
text(531, 1246, 'x1000', 10);
text(546, 1282, 'x100', 9, { anchor: 'start' });
text(531, 1319, 'x10', 10);
text(479, 1157, 'GAIN', 12.5);
box(484, 1084, 46, 24, 'PREAMP', 10.5);
arrow('M479 1143 V1104', 479, 1098, UP, 1.8);
arrow('M507 1084 H531 V1102', 531, 1108, DOWN, 1.8);
jout(
  'j.preOut',
  531,
  1125,
  'OUTPUT',
  'preamp',
  'The preamp output. It is pre-wired to the envelope follower.',
  { name: 'PREAMP OUTPUT' }
);
text(531, 1156, 'OUTPUT', 11);
jin(
  'j.preIn',
  531,
  1382,
  'INPUT',
  'preampIn',
  1,
  'Preamp input, for an outside signal. In this app you can patch any of the synth’s own outputs here instead.',
  { name: 'PREAMP INPUT' }
);
text(531, 1358, 'INPUT', 11.5);
vfb('envf.sens', 583, 'red', {
  def: 5,
  label: 'ENV FOLLOWER',
  module: 'util',
  fmt: pct,
  help: 'Sensitivity of the envelope follower: how strongly the loudness of its input turns into a control voltage.',
});
box(584, 1084, 64, 26, 'ENV\nFOLLOWER', 10);
arrow('M583 1155 V1104', 583, 1098, UP, 1.8);
arrow('M616 1084 H636 V1102', 636, 1108, DOWN, 1.8);
jout(
  'j.envfOut',
  636,
  1125,
  'OUTPUT',
  'envf',
  'The envelope follower output: a voltage that rises and falls with the loudness of its input. Nothing is pre-wired to it; patch it to the filter or the VCA.',
  { name: 'ENV FOLLOWER OUTPUT' }
);
text(636, 1156, 'OUTPUT', 11);
jin(
  'j.envfIn',
  636,
  1382,
  'PREAMP',
  'envfIn',
  1,
  'Envelope follower input, pre-wired from the preamp. A cable here adds to the preamp signal rather than replacing it.',
  { add: true, name: 'ENV FOLLOWER INPUT' }
);
box(637, 1334, 48, 24, 'PREAMP', 10);
arrow('M637 1346 V1360', 637, 1366, DOWN, 1.8);
// each input is looped round to the bottom of its slider
[
  [479, 531],
  [583, 636],
].forEach(([f, j]) => {
  arrow(`M${j} 1418 H${f} V1406`, f, 1400, UP, 1.8);
  arrow(`M${f} 1418 H${j} V1404`, j, 1398, UP, 1.8);
});

// ── Ring modulator ───────────────────────────────────────────────────────
vfb('ring.a', 688, 'green', {
  def: 10,
  label: 'RING MOD VCO 1',
  module: 'mixer',
  fmt: pct,
  help: 'Level of the ring modulator’s first input: VCO 1’s sawtooth, plus anything patched into its VCO 1 jack.',
});
vfb('ring.b', 794, 'green', {
  def: 10,
  label: 'RING MOD VCO 2',
  module: 'mixer',
  fmt: pct,
  help: 'Level of the ring modulator’s second input: VCO 2’s sine, plus anything patched into its VCO 2 jack.',
});
slide('ring.mode', 741, 1278, {
  kind: 'enum',
  def: 'audio',
  label: 'AUDIO / DC',
  module: 'mixer',
  options: [
    { v: 'audio', label: 'AUDIO' },
    { v: 'dc', label: 'DC' },
  ],
  help: 'AUDIO blocks very slow signals on the VCO 1 input, for normal ring-mod tones. DC lets them through, so a slow voltage there can act as a volume control on the other input.',
});
text(741, 1248, 'AUDIO', 11);
text(741, 1314, 'DC', 11);
[1122, 1165, 1207].forEach((y) => hole(741, y));
box(742, 1084, 121, 25, 'RING MOD', 14);
[688, 794].forEach((x) => arrow(`M${x} 1155 V1103`, x, 1097, UP, 1.8));
arrow('M803 1084 H846 V1102', 846, 1108, DOWN, 1.8);
jin(
  'j.ringA',
  742,
  1382,
  'VCO 1',
  'ringA',
  (v) => g10(num(v, 'ring.a')),
  'Ring modulator input, pre-wired from VCO 1’s sawtooth. A cable here adds to VCO 1 rather than replacing it.',
  { add: true, name: 'RING MOD IN (VCO 1)' }
);
jin(
  'j.ringB',
  847,
  1382,
  'VCO 2',
  'ringB',
  (v) => g10(num(v, 'ring.b')),
  'Ring modulator input, pre-wired from VCO 2’s sine. A cable here adds to VCO 2 rather than replacing it.',
  { add: true, name: 'RING MOD IN (VCO 2)' }
);
srcBoxWide(742, 1334, 'VCO 1', 'saw');
srcBoxWide(847, 1334, 'VCO 2', 'sine');
[742, 847].forEach((x) => arrow(`M${x} 1347 V1360`, x, 1366, DOWN, 1.8));
jout(
  'j.ringOut',
  846,
  1125,
  'OUTPUT',
  'ring',
  'The ring modulator output: its two inputs multiplied together. It is pre-wired to the filter and the VCA.',
  { name: 'RING MOD OUTPUT' }
);
text(846, 1156, 'OUTPUT', 11);
[
  [688, 742],
  [794, 847],
].forEach(([f, j]) => {
  arrow(`M${j} 1418 H${f} V1406`, f, 1400, UP, 1.8);
  arrow(`M${f} 1418 H${j} V1404`, j, 1398, UP, 1.8);
});

// ── Noise ─────────────────────────────────────────────────────────────────
vfb('noise.color', 930, 'green', {
  def: 10,
  label: 'COLOR',
  module: 'mixer',
  fmt: (v) =>
    v >= 9.5
      ? 'white'
      : v > 5.5
        ? 'pink → white'
        : v >= 4.5
          ? 'pink'
          : v > 0.5
            ? 'low → pink'
            : 'low frequency',
  help: 'Noise colour. WHITE (top) is a bright hiss, PINK (middle) a softer rush like surf, LOW FREQ (bottom) a slow rumble that is also useful as a random wandering voltage.',
});
vfb('noise.level', 983, 'green', {
  tickEnds: false,
  def: 10,
  label: 'LEVEL',
  module: 'mixer',
  fmt: pct,
  help: 'Output level of the noise generator. It scales the noise everywhere it goes: the filter, the sample-and-hold, VCO 2’s pulse width, VCO 3’s pitch and the NOISE jack.',
});
text(930, 1157, 'COLOR', 12.5);
text(983, 1157, 'LEVEL', 12.5);
text(915, 1188, 'WHITE', 10, { anchor: 'end' });
text(915, 1281, 'PINK', 10, { anchor: 'end' });
text(915, 1367, 'LOW\nFREQ', 10, { anchor: 'end' });
text(997, 1188, 'MAX', 10.5, { anchor: 'start' });
text(997, 1374, 'MIN', 10.5, { anchor: 'start' });
hole(957, 1121);
box(958, 1084, 147, 25, 'NOISE GENERATOR', 14);
jout(
  'j.noiseOut',
  1052,
  1125,
  'OUTPUT',
  'noise',
  'The noise generator output, in the colour and at the level set by its sliders.',
  { name: 'NOISE OUTPUT' }
);
text(1052, 1156, 'OUTPUT', 11);
arrow('M1032 1084 H1052 V1102', 1052, 1108, DOWN, 1.8);

// ── Mult ──────────────────────────────────────────────────────────────────
text(1178, 1044, 'MULT', 13);
jin(
  'j.mult1',
  1222,
  1040,
  'MULT',
  'multIn',
  1,
  'One of the four mult jacks. Plug a signal in here and take copies from the other mult jacks.',
  { add: true, name: 'MULT 1 (in)' }
);
jin(
  'j.mult2',
  1275,
  1040,
  'MULT',
  'multIn',
  1,
  'One of the four mult jacks. Signals plugged into both input jacks are added together.',
  { add: true, name: 'MULT 2 (in)' }
);
jout(
  'j.mult3',
  1328,
  1040,
  'MULT',
  'mult',
  'A copy of whatever is plugged into the other mult jacks.',
  { name: 'MULT 3 (out)' }
);
jout(
  'j.mult4',
  1380,
  1040,
  'MULT',
  'mult',
  'A copy of whatever is plugged into the other mult jacks.',
  { name: 'MULT 4 (out)' }
);
wire('M1237 1040 H1260 M1290 1040 H1313 M1343 1040 H1365', 1.8);

// ── Voltage processor ────────────────────────────────────────────────────
box(1301, 1084, 180, 26, 'VOLTAGE PROCESSOR', 14);
hf('vp.minus10', 1270, 1160, 'white', {
  len: 186,
  pad: 22,
  label: '−10 V (INVERTER 1)',
  module: 'util',
  fmt: pct,
  help: 'Level of input 2 of Inverter 1. With nothing patched, that input is a fixed −10 V, so this slider sets a steady offset voltage at the inverter output.',
});
hf('vp.kbd', 1270, 1234, 'white', {
  len: 186,
  pad: 22,
  label: 'KYBD CV (INVERTER 1)',
  module: 'util',
  fmt: pct,
  help: 'Level of input 4 of Inverter 1. With nothing patched, that input is the keyboard CV, so the inverter output is the keyboard turned upside down: play up, the voltage goes down.',
});
hf('vp.plus10', 1270, 1308, 'white', {
  len: 186,
  pad: 22,
  label: '+10 V (INVERTER 2)',
  module: 'util',
  fmt: pct,
  help: 'Level of input 6 of Inverter 2. With nothing patched, that input is a fixed +10 V, so this slider sets a steady offset voltage at Inverter 2’s output.',
});
hf('vp.lag', 1270, 1382, 'white', {
  len: 186,
  pad: 22,
  def: 3,
  label: 'LAG TIME',
  module: 'util',
  fmt: (v) => fmtTime(lagS(v)),
  help: 'How slowly the lag processor follows its input. Jumps in a control voltage become slides; on audio it acts as a gentle low-pass filter.',
});
(
  [
    ['2', 1160, '−10 V'],
    ['4', 1234, 'KYBD CV'],
    ['6', 1308, '+10 V'],
    ['7', 1382, 'ENV FOLL'],
  ] as [string, number, string][]
).forEach(([n, y, t]) => {
  text(1091, y + 4, n, 12, { anchor: 'end' });
  text(1110, y - 25, t, 10.5);
  arrow(`M1128 ${y} H1144`, 1150, y, RIGHT, 1.8);
});
jin(
  'j.vp2',
  1112,
  1160,
  '−10 V',
  'inv1A',
  (v) => g10(num(v, 'vp.minus10')),
  'Input 2 of Inverter 1, normalled to −10 V. A cable here replaces the −10 V; the slider sets its level.',
  { name: 'VOLTAGE PROCESSOR 2 (−10 V)' }
);
jin(
  'j.vp4',
  1112,
  1234,
  'KYBD CV',
  'inv1B',
  (v) => g10(num(v, 'vp.kbd')),
  'Input 4 of Inverter 1, normalled to the keyboard CV. A cable here replaces it; the slider sets its level.',
  { name: 'VOLTAGE PROCESSOR 4 (KYBD CV)' }
);
jin(
  'j.vp6',
  1112,
  1308,
  '+10 V',
  'inv2A',
  (v) => g10(num(v, 'vp.plus10')),
  'Input 6 of Inverter 2, normalled to +10 V. A cable here replaces the +10 V; the slider sets its level.',
  { name: 'VOLTAGE PROCESSOR 6 (+10 V)' }
);
jin(
  'j.vp7',
  1112,
  1382,
  'ENV FOLL',
  'slewIn',
  1,
  'Input of the lag processor, normalled to the envelope follower. Patch any control voltage here to slow it down, or audio to soften it.',
  { name: 'LAG IN (7)' }
);
jin(
  'j.vp1',
  1428,
  1124,
  '1',
  'inv1In',
  1,
  'Input 1 of Inverter 1, at full level. Everything reaching Inverter 1 is added up and turned upside down.',
  { add: true, name: 'VOLTAGE PROCESSOR 1' }
);
jin('j.vp3', 1428, 1197, '3', 'inv1In', 1, 'Input 3 of Inverter 1, at full level.', {
  add: true,
  name: 'VOLTAGE PROCESSOR 3',
});
jin(
  'j.vp5',
  1428,
  1270,
  '5',
  'inv2In',
  1,
  'Input 5 of Inverter 2, at full level. Inverter 2 adds inputs 5 and 6 and turns the total upside down.',
  { add: true, name: 'VOLTAGE PROCESSOR 5' }
);
(
  [
    ['1', 1124],
    ['3', 1197],
    ['5', 1270],
  ] as [string, number][]
).forEach(([t, y]) => text(1406, y + 4, t, 12, { anchor: 'end' }));
jout(
  'j.inv1',
  1497,
  1160,
  'INVERTER',
  'inv1',
  'Inverter 1 output: inputs 1 to 4 added together and turned upside down.',
  {
    name: 'INVERTER 1 OUT',
    check: (v) =>
      num(v, 'vp.minus10') <= 0 && num(v, 'vp.kbd') <= 0
        ? 'The −10 V and KYBD CV sliders are both at 0, so unless something is patched into inputs 1 to 4, Inverter 1 puts out nothing. Raise the −10 V slider for a steady voltage.'
        : null,
  }
);
jout(
  'j.inv2',
  1497,
  1308,
  'INVERTER',
  'inv2',
  'Inverter 2 output: inputs 5 and 6 added together and turned upside down.',
  {
    name: 'INVERTER 2 OUT',
    check: (v) =>
      num(v, 'vp.plus10') <= 0
        ? 'The +10 V slider is at 0, so unless something is patched into input 5 or 6, Inverter 2 puts out nothing. Raise the +10 V slider for a steady voltage.'
        : null,
  }
);
jout(
  'j.lagOut',
  1497,
  1382,
  'LAG',
  'slew',
  'Lag processor output: its input, slowed down by the LAG TIME slider.',
  { name: 'LAG OUT' }
);
text(1470, 1248, 'INVERTER', 10.5);
text(1470, 1340, 'INVERTER', 10.5);
// Inverter 1: inputs 1 and 3 and the two sliders meet on one bus, which runs up through the inverter to its output jack
wire(
  'M1385 1160 H1462 M1462 1160 V1234 M1385 1234 H1496 V1216 M1484 1216 L1496 1189 L1508 1216 Z M1496 1189 V1176',
  1.8
);
arrow('M1443 1124 H1462 V1148', 1462, 1154, DOWN, 1.8);
arrow('M1443 1197 H1450', 1456, 1197, RIGHT, 1.8);
[
  [1462, 1160],
  [1462, 1197],
  [1462, 1234],
  [1428, 1308],
].forEach(([x, y]) => dot(x, y));
// Inverter 2: input 5 joins slider 6
arrow('M1428 1285 V1296', 1428, 1302, DOWN, 1.8);
wire('M1385 1308 H1446 M1446 1296 L1469 1308 L1446 1320 Z M1469 1308 H1481', 1.8);
// lag
wire('M1385 1382 H1411', 1.8);
decor.push({ t: 'rect', x: 1411, y: 1372, w: 34, h: 20, r: 1, stroke: ORANGE, sw: 1.8 });
text(1428, 1386, 'LAG', 10.5, { weight: 600 });
decor.push({ t: 'wave', x: 1428, y: 1404, size: 8, shape: 'ar' });
arrow('M1445 1382 H1474', 1480, 1382, RIGHT, 1.8);
text(1270, 1407, 'INCREASE LAG TIME', 10.5);
arrow('M1186 1403 H1203', 1209, 1403, RIGHT, 1.6);
arrow('M1331 1403 H1348', 1354, 1403, RIGHT, 1.6);

// ── Sample & hold, electronic switch ─────────────────────────────────────
box(1650, 1083, 142, 26, 'SAMPLE & HOLD', 14);
wire('M1579 1083 H1557 V1107', 1.8);
jin(
  'j.shIn',
  1557,
  1122,
  'NOISE GEN',
  'shIn',
  (v) => g10(num(v, 'sh.level')),
  'The signal the sample-and-hold takes readings of, pre-wired from the noise generator. A cable here replaces the noise; the LEVEL slider scales it.',
  {
    name: 'S&H INPUT',
    check: (v) =>
      num(v, 'sh.level') <= 0
        ? 'The S&H LEVEL slider is at 0, so the sample-and-hold reads nothing. Raise LEVEL.'
        : null,
  }
);
wire('M1557 1137 V1177', 1.6);
attSym(1557, 1158);
srcBox(1557, 1194, 'NOISE\nGEN');
jout(
  'j.shClkOut',
  1557,
  1234,
  'INT CLK OUT',
  'shClk',
  'The sample-and-hold’s internal clock, a square wave at the RATE setting. Useful as a steady trigger for envelopes or anything else.',
  { name: 'INT CLK OUT' }
);
jout(
  'j.shOut',
  1557,
  1308,
  'S/H OUT',
  'sh',
  'The sample-and-hold output: a voltage that jumps to a new level on each clock tick and holds it. Pre-wired to VCO 1 and VCO 2 FM.',
  { name: 'S/H OUT' }
);
jin(
  'j.shExtClk',
  1557,
  1382,
  'EXT CLK IN',
  'shClock',
  1,
  'External clock for the sample-and-hold. A cable here stops the internal clock (and the RATE slider); a new reading is taken each time the patched signal rises.',
  { name: 'EXT CLK IN' }
);
text(1580, 1221, 'INT\nCLK\nOUT', 10.5, { anchor: 'start' });
decor.push({ t: 'wave', x: 1590, y: 1257, size: 6, shape: 'sq' });
text(1580, 1306, 'S/H\nOUT', 10.5, { anchor: 'start' });
text(1580, 1368, 'EXT\nCLK\nIN', 10.5, { anchor: 'start' });
// an outside clock replaces the internal one, which also reaches INT CLK OUT and the electronic switch
wire('M1557 1397 V1440 H1781 V1378', 1.8);
attSym(1557, 1419);
head(1660, 1440, LEFT);
wire('M1757 1378 V1418 H1617 V1234 H1606', 1.8);
head(1617, 1312, UP);
vfb('sh.level', 1644, 'yellow', {
  def: 5,
  label: 'S&H LEVEL',
  module: 'util',
  fmt: pct,
  help: 'Level of the input before it is sampled, and so the size of the random steps.',
});
vfb('sh.rate', 1696, 'yellow', {
  def: 5,
  label: 'S&H RATE',
  module: 'util',
  fmt: (v) => fmtHz(shHz(v)),
  help: 'Speed of the internal clock: how many new readings per second. The same clock drives the electronic switch, and the envelopes when the routing switch is on S/H CLOCK.',
});
text(1644, 1157, 'LEVEL', 12.5);
text(1696, 1157, 'RATE', 12.5);
hole(1644, 1122);
decor.push({ t: 'wave', x: 1727, y: 1383, size: 5, shape: 'sq' });
text(1770, 1088, 'ELEC\nSWITCH', 11.5);
jin(
  'j.eswA',
  1744,
  1122,
  'A',
  'eswA',
  1,
  'Electronic switch terminal A. The switch passes A to C for one half of each sample-and-hold clock cycle, and B for the other. (On the hardware A, B and C also work the other way round; this app models A and B in, C out.)',
  { name: 'ELEC SWITCH A' }
);
jin(
  'j.eswB',
  1796,
  1122,
  'B',
  'eswB',
  1,
  'Electronic switch terminal B. It reaches C while the sample-and-hold clock is low.',
  { name: 'ELEC SWITCH B' }
);
jout(
  'j.eswC',
  1770,
  1308,
  'C',
  'esw',
  'Electronic switch terminal C: A and B in turn, swapping at the sample-and-hold RATE.',
  { name: 'ELEC SWITCH C' }
);
text(1744, 1157, 'A', 12);
text(1796, 1157, 'B', 12);
text(1770, 1341, 'C', 12);
decor.push(
  { t: 'led', x: 1744, y: 1188, r: 5, color: 'amber', litWhen: 'lfo' },
  { t: 'led', x: 1796, y: 1188, r: 5, color: 'amber' }
);
box(1770, 1362, 48, 32, 'INT\nCLOCK', 11);
decor.push({ t: 'circle', x: 1770, y: 1258, r: 16, stroke: ORANGE, sw: 1.8 });
wire(
  'M1744 1162 V1180 M1744 1196 V1252 H1765 M1796 1162 V1180 M1796 1196 V1252 H1775 M1770 1262 V1292 M1746 1360 H1737 V1290 L1758 1270',
  1.8
);
dot(1770, 1262);

// ── Phones, power ─────────────────────────────────────────────────────────
text(1872, 1100, 'PHONES', 13);
decor.push(
  { t: 'circle', x: 1872, y: 1122, r: 15, fill: 'url(#kysBlack)', stroke: '#000', sw: 1.2 },
  { t: 'circle', x: 1872, y: 1122, r: 7, fill: '#050505', stroke: '#444', sw: 1 }
);
wire('M1872 1139 V1164', 1.8);
controls.push({
  id: 'out.phones',
  type: 'knob',
  x: 1872,
  y: 1205,
  r: 20,
  style: 'd-silver',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'PHONES',
  labelPos: 'none',
  module: 'out',
  scale: { nums: [0, 2, 4, 6, 8, 10], ticks: 11, numR: 1.95, size: 11 },
  help: 'Headphone level. In this app it sets how loud you hear the synth.',
});
decor.push({ t: 'led', x: 1872, y: 1275, r: 6, color: 'amber', litWhen: 'power' });
text(1872, 1303, 'POWER', 15, { weight: 700 });
text(1872, 1324, 'ON', 10.5);
decor.push(
  {
    t: 'rect',
    hw: true,
    x: 1854,
    y: 1335,
    w: 37,
    h: 62,
    r: 4,
    fill: '#0b0b0c',
    stroke: '#444',
    sw: 1.5,
  },
  { t: 'rect', hw: true, x: 1859, y: 1339, w: 27, h: 27, r: 2, fill: '#2b2c2f' }
);

// ── Areas ─────────────────────────────────────────────────────────────────
const area = (
  id: string,
  label: string,
  module: SynthModule,
  keywords: string,
  rects: Area['rects'],
  help: string
): Area => ({ id, label, module, keywords, rects, help });
const areas: Area[] = [
  area(
    'vco1',
    'VCO 1',
    'osc',
    'oscillator pitch tune vibrato lfo range sawtooth pulse fm',
    [{ x: 5, y: 60, w: 357, h: 950 }],
    'The first oscillator, with sawtooth and pulse outputs. The three sliders at the top set its pitch, fine tuning and pulse width. The sliders below set how much the sample-and-hold, the ADSR and the LFO move its pitch; the jacks under them let you replace each of those with a cable.'
  ),
  area(
    'vco2',
    'VCO 2',
    'osc',
    'oscillator pitch triangle sine sync fm pwm',
    [{ x: 362, y: 60, w: 274, h: 950 }],
    'The second oscillator, with triangle, sawtooth, sine and pulse outputs all at once. SYNC locks it to VCO 1. Its sliders set how much the sample-and-hold, the ADSR and VCO 1 move its pitch, and how much noise shakes its pulse width.'
  ),
  area(
    'vco3',
    'VCO 3',
    'osc',
    'oscillator pitch triangle sine sync fm pwm',
    [{ x: 636, y: 60, w: 274, h: 950 }],
    'The third oscillator, the same as VCO 2. Its pre-wired modulation is noise, the ADSR and VCO 2’s sine for pitch, and the ADSR for pulse width.'
  ),
  area(
    'vcf',
    'Filter (VCF)',
    'filter',
    'cutoff resonance low-pass 4012 4072 brightness mixer inputs key tracking',
    [{ x: 910, y: 60, w: 420, h: 950 }],
    'A 24 dB low-pass filter with its own five-input mixer. The top sliders set cutoff, fine tune and RESONANCE. The five AUDIO sliders below set how much of the ring modulator, the three oscillators and noise go in; the three CONTROL sliders set how far the keyboard, the ADSR and VCO 2 move the cutoff.'
  ),
  area(
    'adsr',
    'ADSR envelope',
    'env',
    'attack decay sustain release contour',
    [{ x: 1330, y: 60, w: 210, h: 530 }],
    'The four-stage envelope. It is pre-wired to the filter, the VCA and the oscillators, and each destination has its own slider for how much. TIME FACTOR halves or doubles all its times.'
  ),
  area(
    'ar',
    'AR envelope and routing',
    'env',
    'attack release trigger gate manual s&h clock repeat',
    [{ x: 1330, y: 590, w: 210, h: 420 }],
    'A simpler envelope with only attack and release, pre-wired to the VCA’s linear input. The routing switch chooses what fires both envelopes: the keyboard gate, a trigger on each key, or the sample-and-hold clock. MANUAL fires them by hand.'
  ),
  area(
    'vca',
    'VCA',
    'amp',
    'amplifier loudness volume initial gain drone linear exponential',
    [
      { x: 1540, y: 60, w: 88, h: 515 },
      { x: 1628, y: 520, w: 62, h: 55 },
      { x: 1540, y: 575, w: 232, h: 435 },
    ],
    'The amplifier. INITIAL GAIN holds it open; the AR and ADSR open it further through a linear and an exponential input. It hears the filter and the ring modulator, each through its own slider.'
  ),
  area(
    'mixer',
    'Mixer',
    'mixer',
    'output level balance vcf vca post attenuator',
    [
      { x: 1795, y: 520, w: 200, h: 55 },
      { x: 1772, y: 575, w: 223, h: 435 },
    ],
    'The final mix: the VCA output and the filter output side by side. Unusually the filter can go straight to the output, bypassing the VCA. The two jacks above the sliders give each channel after its slider, so the sliders double as spare level controls.'
  ),
  area(
    'reverb',
    'Reverb',
    'fx',
    'spring echo space ambience post-mixer',
    [
      { x: 1628, y: 210, w: 367, h: 310 },
      { x: 1690, y: 520, w: 105, h: 55 },
    ],
    'A spring reverb fed from the mixer, with a level slider for each side. The POST-MIXER jack replaces the dry sound at the outputs, and the LEFT and RIGHT INPUT jacks add a signal after the reverb. MIXER OUT and REVERB OUT let you patch the mixer and the reverb elsewhere.'
  ),
  area(
    'output',
    'Pan and outputs',
    'out',
    'stereo left right pan outputs',
    [{ x: 1628, y: 60, w: 367, h: 150 }],
    'PAN places the mix between the left and right outputs, which are on both large and small jacks. The small ones can be patched back into the synth. This app plays in mono.'
  ),
  area(
    'kbd',
    'Keyboard control',
    'mode',
    'midi gate trigger duophonic duo mono repeat legato retrigger',
    [
      { x: 5, y: 1010, w: 285, h: 140 },
      { x: 235, y: 1150, w: 55, h: 330 },
    ],
    'There is no keyboard on this 2600; this section turns MIDI notes into voltages. The jacks give the keyboard’s gate, trigger and pitch, plus UPPER VOICE for two-note playing. VOICE MODE, REPEAT and TRIG MODE decide how notes fire the envelopes.'
  ),
  area(
    'porta',
    'Portamento',
    'glide',
    'glide slide legato',
    [{ x: 5, y: 1150, w: 230, h: 330 }],
    'Makes the pitch slide from note to note. ON switches it on, MOMEN turns it on while pressed, and the slider sets how slow the slide is.'
  ),
  area(
    'lfo',
    'LFO and delayed vibrato',
    'lfo',
    'low frequency oscillator vibrato delay wobble modulation',
    [{ x: 290, y: 1010, w: 166, h: 470 }],
    'A dedicated slow oscillator. Its sine is pre-wired to VCO 1’s FM input; its sawtooth and square have their own jacks. VIB DELAY and VIB DEPTH shape a second copy of the sine that fades in after each note, at the LFO SINE DELAYED jack.'
  ),
  area(
    'preamp',
    'Preamp',
    'util',
    'microphone guitar external input gain',
    [{ x: 456, y: 1010, w: 99, h: 470 }],
    'Amplifies a quiet outside signal, such as a microphone or guitar, to synth level, so it can be filtered or used to drive the envelope follower.'
  ),
  area(
    'envf',
    'Envelope follower',
    'util',
    'envelope follower loudness tracker',
    [{ x: 555, y: 1010, w: 113, h: 470 }],
    'Turns the loudness of its input into a control voltage. Pre-wired from the preamp; patch its output to the filter or VCA so one sound shapes another.'
  ),
  area(
    'ring',
    'Ring modulator',
    'mixer',
    'ring mod bell metallic multiplier',
    [{ x: 668, y: 1010, w: 210, h: 470 }],
    'Multiplies two signals, pre-wired from VCO 1’s sawtooth and VCO 2’s sine. The result is the sum and difference of the two, which sounds clangy and bell-like. It is pre-wired into the filter and the VCA.'
  ),
  area(
    'noise',
    'Noise generator',
    'mixer',
    'white pink noise hiss wind surf random',
    [{ x: 878, y: 1010, w: 202, h: 470 }],
    'A noise source whose COLOR slider runs from a low rumble through pink to white. It is pre-wired to the filter, the sample-and-hold, VCO 2’s pulse width and VCO 3’s pitch.'
  ),
  area(
    'mult',
    'Mult',
    'patch',
    'multiple split copy',
    [{ x: 1150, y: 1010, w: 280, h: 60 }],
    'Four jacks joined together, for sending one signal to several places. In this app the first two are inputs and the last two are outputs.'
  ),
  area(
    'vp',
    'Voltage processor',
    'util',
    'inverter lag slew mixer offset voltage',
    [{ x: 1080, y: 1070, w: 443, h: 410 }],
    'Two inverters and a lag processor. The inverters add their inputs together and turn the result upside down; two of their inputs are normalled to fixed −10 V and +10 V, so their sliders also make steady offset voltages. The lag slows down whatever passes through it.'
  ),
  area(
    'sh',
    'Sample and hold',
    'util',
    's&h random stepped clock computer',
    [{ x: 1523, y: 1010, w: 197, h: 470 }],
    'Takes a reading of its input (noise, unless you patch something else) on each tick of its clock and holds it. With noise in, that is a random stepped voltage, pre-wired to VCO 1 and VCO 2. RATE sets the clock speed, LEVEL the size of the steps.'
  ),
  area(
    'esw',
    'Electronic switch',
    'util',
    'switch alternate clock toggle',
    [{ x: 1720, y: 1010, w: 103, h: 470 }],
    'A switch flipped by the sample-and-hold clock. C carries A for half of each clock cycle and B for the other half, so two voltages or two sounds alternate in time.'
  ),
  area(
    'power',
    'Phones and power',
    'out',
    'headphones volume power',
    [{ x: 1823, y: 1010, w: 172, h: 470 }],
    'The headphone socket and its level knob, and the power switch. In this app the PHONES knob sets how loud you hear the synth.'
  ),
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const P = ctx.patched;
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const osc = [1, 2, 3].map((n) => {
    const lf = v[`vco${n}.range`] === 'lf';
    const hz = oscHz(num(v, `vco${n}.freq`)) / (lf ? 333.3 : 1);
    const fine = (num(v, `vco${n}.fine`) / 5) * 2;
    const kbd = !lf && !P[`j.vco${n}Kbd`];
    const pre = `j.vcfVco${n}`;
    return {
      level: P[pre] ? 0 : level10(num(v, `vcf.vco${n}`), 0.9),
      mix: n === 3 ? { saw: 1 } : { pulse: 1 },
      pw: clamp(num(v, `vco${n}.pw`) / 100, 0.03, 0.97),
      semi: kbd ? noteOf(hz) - 60 + fine : fine,
      kbd,
      fixedNote: kbd ? 60 : noteOf(hz),
      syncTo: n > 1 && v[`vco${n}.sync`] ? 0 : -1,
    };
  });
  const routes: EngineRoute[] = [];
  const pre = (src: string, dst: string, amt: number, jack: string): void => {
    if (!P[jack] && Math.abs(amt) > 0.0001) routes.push({ src, dst, amt });
  };
  pre('sh', 'pitch1', fm(num(v, 'vco1.fmSh'), FM_AMT.sh), 'j.vco1Sh');
  pre('env1', 'pitch1', fm(num(v, 'vco1.fmAdsr'), FM_AMT.adsr), 'j.vco1Adsr');
  // The mod wheel pushes VCO 1's LFO (FM) slider further up. The 3620 keyboard has no wheel; its
  // proportional pitch pads do this job on the hardware. Only VCO 1 has an LFO slider, so only VCO 1
  // gets the vibrato — the others need a cable, exactly as on the panel.
  pre(
    'lfoSine',
    'pitch1',
    fm(clamp(num(v, 'vco1.fmLfo') + wheel * 10, 0, 10), FM_AMT.lfo),
    'j.vco1Lfo'
  );
  pre('sh', 'pitch2', fm(num(v, 'vco2.fmSh'), FM_AMT.sh), 'j.vco2Sh');
  pre('env1', 'pitch2', fm(num(v, 'vco2.fmAdsr'), FM_AMT.adsr), 'j.vco2Adsr');
  pre('o1pulse', 'pitch2', fm(num(v, 'vco2.fmVco1'), FM_AMT.vco1), 'j.vco2Vco1');
  pre('noise', 'pw2', g10(num(v, 'vco2.pwm')) * 0.45, 'j.vco2Pwm');
  pre('noise', 'pitch3', fm(num(v, 'vco3.fmNoise'), FM_AMT.noise), 'j.vco3Noise');
  pre('env1', 'pitch3', fm(num(v, 'vco3.fmAdsr'), FM_AMT.adsr), 'j.vco3Adsr');
  pre('o2sine', 'pitch3', fm(num(v, 'vco3.fmVco2'), FM_AMT.vco2), 'j.vco3Vco2');
  pre('env1', 'pw3', g10(num(v, 'vco3.pwm')) * 0.45, 'j.vco3Pwm');
  pre('ring', 'vcfIn', level10(num(v, 'vcf.ring'), 0.9), 'j.vcfRing');
  pre('o2sine', 'cutoff', g10(num(v, 'vcf.vco2cv')) * 3, 'j.vcfVco2Cv');
  pre('ring', 'vcaIn', level10(num(v, 'vca.ring'), 1), 'j.vcaRing');
  routes.push({ src: 'att2', dst: 'delayIn', amt: 1 }); // the mixer: VCF channel (normalled) + VCA channel
  const src: EnvTrigSource =
    v['env.src'] === 'sh' ? 'sh' : v['env.src'] === 'trig' ? 'trig' : 'gate';
  const tfAdsr = TIME[String(v['adsr.time'])];
  const tfAr = TIME[String(v['ar.time'])];
  return {
    osc,
    oscOuts: true,
    pwSplit: true,
    noise: {
      level: P['j.vcfNoise'] ? 0 : level10(num(v, 'vcf.noise'), 0.9),
      color: 'white',
      tone: num(v, 'noise.color') / 10,
      gain: level10(num(v, 'noise.level'), 1),
    },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: clamp(
        vcfHz(num(v, 'vcf.freq')) * Math.pow(2, (num(v, 'vcf.fine') / 5) * 0.5),
        10,
        20000
      ),
      res: g10(num(v, 'vcf.res')) * 1.1,
      envAmt: P['j.vcfAdsr'] ? 0 : g10(num(v, 'vcf.adsr')) * 8,
      envSrc: 'env1',
      kbd: P['j.vcfKbd'] ? 0 : g10(num(v, 'vcf.kbd')),
      drive: v['vcf.mode'] === '4072' ? 1.15 : 0.8,
    },
    env1: {
      a: envA(num(v, 'adsr.a')) * tfAdsr,
      d: envDR(num(v, 'adsr.d')) * tfAdsr,
      s: g10(num(v, 'adsr.s')),
      r: envDR(num(v, 'adsr.r')) * tfAdsr,
    },
    env2: { a: envA(num(v, 'ar.a')) * tfAr, d: 0.05, s: 1, r: envDR(num(v, 'ar.r')) * tfAr },
    vca: { envSrc: 'none', bias: level10(num(v, 'vca.gain'), 1) },
    lfo: {
      rate: lfoHz(num(v, 'lfo.speed')),
      mix: { sine: 1 },
      keySync: false,
      vibDelay: g10(num(v, 'lfo.vibDelay')) * 3,
      vibDepth: g10(num(v, 'lfo.vibDepth')),
    },
    glide: {
      time: v['porta.on'] || v['porta.momen'] ? portaS(num(v, 'porta.amount')) : 0,
      legato: false,
    },
    trig: {
      retrig: v['kbd.trig'] === 'mult',
      drone: !!v['env.manual'],
      repeat: v['kbd.repeat'] === 'kybd',
      auto: v['kbd.repeat'] === 'auto',
      src: [src, src],
    },
    paraphonic: false,
    duo: v['kbd.voice'] === 'duo',
    routes,
    normals: {
      vcaIn: ['vcf1', level10(num(v, 'vca.vcf'), 1)],
      amp: ['env2', g10(num(v, 'vca.ar'))],
      ampExp: ['env1', g10(num(v, 'vca.adsr'))],
      att1In: 'vcf1',
      att2In: 'vca',
      delayIn: 'att1',
      revIn: 'out',
      shIn: ['noise', g10(num(v, 'sh.level'))],
      ringA: ['o1saw', g10(num(v, 'ring.a'))],
      ringB: ['o2sine', g10(num(v, 'ring.b'))],
      envfIn: 'preamp',
      slewIn: 'envf',
      inv1A: ['one', -g10(num(v, 'vp.minus10'))],
      inv1B: ['kbd', g10(num(v, 'vp.kbd'))],
      inv2A: ['one', g10(num(v, 'vp.plus10'))],
      gateIn: 'gate',
      trigIn: 'gate',
      envClk: 'shClk',
    },
    ring: { ac: v['ring.mode'] === 'audio' },
    preamp: { gain: g10(num(v, 'pre.gain')) * PRE_RANGE[String(v['pre.range'])] },
    envf: { sens: g10(num(v, 'envf.sens')) * 2 },
    rev: {
      on: true,
      mix: ((g10(num(v, 'rev.left')) + g10(num(v, 'rev.right'))) / 2) * 0.9,
      decay: 0.84,
      damp: 0.35,
    },
    od: { on: false },
    delay: { on: false },
    sh: { rate: shHz(num(v, 'sh.rate')), glide: 0 },
    slew: { time: lagS(num(v, 'vp.lag')) },
    att: [level10(num(v, 'mix.vcf'), 1), level10(num(v, 'mix.vca'), 1)],
    tune: 0,
    volume: level10(num(v, 'out.phones'), 1.8), // make-up gain: the mixer and VCA sliders sit below unity by default
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const b2600: SynthDef & { version: number } = {
  id: 'b2600',
  version: 1,
  name: '2600',
  maker: 'Behringer',
  year: 2020,
  heritage: 'A copy of the 1971 ARP 2600 semi-modular',
  summary:
    'Three VCOs, noise and a ring modulator feed a 24 dB filter through their own sliders; the filter and VCA run side by side into a mixer and spring reverb. Everything is pre-wired, and 60-odd jacks let you break any connection.',
  view: { w: 2000, h: 1480 },
  theme: {
    panel: '#28292c',
    panel2: '#1d1e20',
    ink: '#ecebe6',
    font: 'din',
    weight: 600,
    cheeks: 'none',
    jack: 'black',
  },
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    osc3: 'VCO 3',
    o1saw: 'the VCO 1 sawtooth',
    o1pulse: 'the VCO 1 pulse',
    o1tri: 'the VCO 1 triangle',
    o1sine: 'the VCO 1 sine',
    o2saw: 'the VCO 2 sawtooth',
    o2pulse: 'the VCO 2 pulse',
    o2tri: 'the VCO 2 triangle',
    o2sine: 'the VCO 2 sine',
    o3saw: 'the VCO 3 sawtooth',
    o3pulse: 'the VCO 3 pulse',
    o3tri: 'the VCO 3 triangle',
    o3sine: 'the VCO 3 sine',
    env1: 'the ADSR',
    env2: 'the AR envelope',
    vcf1: 'the filter (VCF) output',
    vca: 'the VCA output',
    mixer: 'the filter’s input mix',
    att1: 'the mixer’s VCF channel',
    att2: 'the mixer’s VCA channel',
    out: 'the mixer output',
    master: 'the final output',
    rev: 'the reverb',
    gate: 'the keyboard gate',
    kbd: 'the keyboard CV',
    kbd2: 'the UPPER VOICE pitch',
    slew: 'the lag processor',
    sh: 'the sample-and-hold',
    lfoSine: 'the LFO sine',
    lfoSaw: 'the LFO sawtooth',
    lfoSq: 'the LFO square',
    vib: 'the delayed vibrato',
    noise: 'the noise generator',
    mult: 'the mult',
    inv1: 'Inverter 1',
    inv2: 'Inverter 2',
    esw: 'the electronic switch',
    envf: 'the envelope follower',
  },
  destNames: {
    delayIn: 'the mixer',
    vcfIn: 'the filter’s audio inputs',
    vcaIn: 'the VCA’s audio inputs',
    cutoff: 'the filter cutoff',
    pitch1: 'VCO 1 pitch',
    pitch2: 'VCO 2 pitch',
    pitch3: 'VCO 3 pitch',
    pw2: 'VCO 2 pulse width',
    pw3: 'VCO 3 pulse width',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default b2600;
