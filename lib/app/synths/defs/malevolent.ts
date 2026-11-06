/**
 * PWM Malevolent: the definition. Positions are pixels on the owner's product photo,
 * `.context/app/synth-data/malevolent/raw/pwm-malevolent.jpg` (2000 × 2000, the synth seen square-on from above), turned
 * into view units by X() / Y() (full scale, offset to the faceplate's top-left corner). The view is the faceplate and
 * the left-hand controller beside the keys, with the tops of the keys for reference. The data model is the owner's spec,
 * `.context/app/synth-data/malevolent/malevolent.synth.json` (0.13.0): controls, patch points, the printed normals.
 *
 * Engine notes: a two-VCO voice run as a one-voice `poly` synth so the engine's arpeggiator can play it. Each VCO's
 * three wave buttons add its saw, triangle and pulse to its OUT and to the mixer (`mix`); the separate wave jacks are
 * the engine's `oscOuts`. Every normal printed under an input is a panel route that `toEngine()` drops while a cable is
 * in that jack, so a cable replaces it at the same depth knob. The filter is the engine's SVF with its band-pass and
 * high-pass inputs (`vcfBpIn`, `vcfHpIn`) beside the low-pass one, all into one output. DRIVE is the overdrive in front
 * of the VCA, so VCA INPUT is patched in ahead of it. The joystick bends (X), glides or with VIBRATO adds a 5 Hz vibrato
 * from the second LFO (Y up), and holds (Y down).
 *
 * The guide documents no voltage ranges, envelope or LFO times or knob laws (`not_in_source`), so every range here is
 * this app's choice; they are noted where they are set.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  OutputJack,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y' | 'labelPos'> &
  Partial<Pick<KnobControl, 'r'>> & {
    def?: number;
    fmt?: (v: number) => string;
  };
type InRest = Omit<InputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label' | 'labelPos'>;
type OutRest = Omit<OutputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label' | 'labelPos'>;

// ── Ranges and tapers (all this app's choice: the guide gives none) ────────
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 100);
const attTime = (v: number): number => expMap(v / 10, 0.001, 10);
const decTime = (v: number): number => expMap(v / 10, 0.003, 10);
const relTime = (v: number): number => expMap(v / 10, 0.003, 10);
const arpBpm = (v: number): number => expMap(v / 10, 30, 300);
/** COARSE: ±4 octaves round its centre. */
const coarseSemi = (v: number): number => (v - 5) * 9.6;
/** FINE: ±1 semitone round its centre. */
const fineSemi = (v: number): number => (v - 5) / 5;
/** SHAPE: the pulse width, from a thin pulse through square (centre) to a thin pulse the other way. */
const pulseWidth = (v: number): number => 0.5 + ((v - 5) / 5) * 0.45;
/** A VCO's FM depth, in semitones for a full-scale source: up to 4 octaves, squared so the first turns are fine. */
const fmSemi = (v: number): number => Math.pow(clamp(v, 0, 10) / 10, 2) * 48;
/** SHAPE MOD: how far a full-scale source moves the pulse width. */
const shapeAmt = (v: number): number => (clamp(v, 0, 10) / 10) * 0.45;
/** A VCF FM depth, in octaves for a full-scale source. */
const vcfFmOct = (v: number): number => (clamp(v, 0, 10) / 10) * 8;
/** An AM depth: the VCA's gain for a full-scale source. */
const amGain = (v: number): number => clamp(v, 0, 10) / 10;
/** Joystick up without VIBRATO: glide from quick to slow (up to 2 s). */
const glideTime = (y: number): number => (y <= 0.02 ? 0 : expMap(y, 0.01, 2));
const VIB_HZ = 5;
/** Joystick up with VIBRATO: vibrato depth, up to a semitone either way. */
const VIB_SEMI = 1;
/** Joystick left–right: pitch bend, ±2 semitones (the bend range's setting is not documented). */
const BEND_SEMI = 2;

const OX = 165,
  OY = 555; // image pixel of the view's top-left corner (full scale)
const X = (x: number): number => x - OX;
const Y = (y: number): number => y - OY;
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#e6e7e4';
const GREEN = '#46c4a3';
const PANEL = '#2a2b2e';

// ── Drawing helpers (image coordinates in, view units out) ────────────────
const text = (
  x: number,
  y: number,
  t: string,
  size = 11,
  rest: Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'hw' | 'brand'>> = {}
): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const frame = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'frame',
    x: X(x0),
    y: Y(y0),
    w: x1 - x0,
    h: y1 - y0,
    r: 4,
    sw: 1.6,
    labelAt: 'none',
  });
};
const line = (x1: number, y1: number, x2: number, y2: number): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w: 1.6 });
};
/** A section name, printed in green on the frame's top line. */
const title = (x: number, y: number, t: string): void => {
  decor.push({
    t: 'rect',
    x: X(x) - t.length * 5 - 8,
    y: Y(y) - 9,
    w: t.length * 10 + 16,
    h: 18,
    fill: PANEL,
  });
  text(x, y, t, 15, { fill: GREEN, weight: 700 });
};
/** The source an input is normalled to, printed in green under it. */
const normal = (x: number, y: number, t: string): void =>
  text(x, y + 23, t, 9.5, { fill: GREEN, weight: 500 });
const led = (x: number, y: number, litWhen?: 'gate' | 'lfo' | 'env1' | 'power'): void => {
  decor.push({
    t: 'led',
    x: X(x),
    y: Y(y),
    r: 3.5,
    color: 'green',
    ...(litWhen ? { litWhen } : {}),
  });
};
const glyph = (x: number, y: number, shape: WaveShape): void => {
  decor.push({ t: 'wave', x: X(x), y: Y(y), size: 7, shape, w: 1.6 });
};

const knob = (id: string, x: number, y: number, label: string, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: 19,
    style: 'neutron',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label,
    labelPos: 'top',
    labelSize: 10.5,
    labelGap: 14,
    ...rest,
  });
};
const button = (
  id: string,
  x: number,
  y: number,
  rest: Omit<ControlCommon, 'id' | 'x' | 'y'> & { def?: boolean; w?: number }
): void => {
  const { def = false, w = 19, ...common } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w,
    h: w,
    lamp: 'blue',
    kind: 'bool',
    def,
    labelPos: 'none',
    ...common,
  });
};
const jackIn = (id: string, x: number, y: number, label: string, rest: InRest): void => {
  jacks.push({
    id,
    x: X(x),
    y: Y(y),
    r: 12,
    dir: 'in',
    label,
    labelPos: 'top',
    labelSize: 10.5,
    ...rest,
  });
};
const jackOut = (id: string, x: number, y: number, label: string, rest: OutRest): void => {
  jacks.push({
    id,
    x: X(x),
    y: Y(y),
    r: 12,
    dir: 'out',
    label,
    labelPos: 'top',
    labelSize: 10.5,
    ...rest,
  });
};

// ── Faceplate ─────────────────────────────────────────────────────────────
// The maker's marks: the PWM monogram, the MALEVOLENT wordmark and its strapline, and Future Sound Systems', whose
// analogue circuits these are.
text(229, 612, 'PWM', 22, { weight: 800, hw: true, brand: true });
text(256, 611, 'Malevolent', 30, { weight: 600, anchor: 'start', hw: true, brand: true });
text(256, 631, 'MODULAR SYNTHESISER', 9.5, {
  weight: 500,
  anchor: 'start',
  fill: GREEN,
  hw: true,
  brand: true,
});
for (let i = 0; i < 5; i++)
  decor.push({
    t: 'line',
    hw: true,
    x1: X(410),
    y1: Y(604 + i * 6),
    x2: X(1728),
    y2: Y(604 + i * 6),
    w: 2.4,
    stroke: GREEN,
  });
text(1757, 597, 'FUTURE', 12, { weight: 800, hw: true, brand: true });
text(1757, 610, 'SOUND', 12, { weight: 800, hw: true, brand: true });
text(1757, 623, 'SYSTEMS', 12, { weight: 800, hw: true, brand: true });

frame(210, 650, 290, 1060);
title(250, 650, 'KEYS');
frame(297, 650, 380, 1060);
title(338, 650, 'LFO');
frame(387, 650, 732, 993);
title(560, 650, 'VCO 1');
frame(387, 997, 732, 1060);
title(560, 997, 'ENV 1');
frame(738, 650, 1080, 993);
title(909, 650, 'VCO 2');
frame(738, 997, 1080, 1060);
title(909, 997, 'ENV 2');
frame(1085, 650, 1700, 1060);
line(1252, 650, 1252, 735);
line(1252, 735, 1167, 735);
line(1167, 735, 1167, 1060);
line(1520, 650, 1520, 735);
line(1520, 735, 1430, 735);
line(1430, 735, 1430, 1060);
line(1430, 822, 1700, 822);
line(1430, 995, 1700, 995);
title(1168, 650, 'MIXER');
title(1384, 650, 'VCF');
title(1610, 650, 'ENVS');
frame(1705, 650, 1785, 1060);
title(1745, 650, 'OUT');

// ── KEYS ──────────────────────────────────────────────────────────────────
jackOut('j.pitch', 250, 690, 'PITCH', {
  name: 'KEYS PITCH',
  signal: 'kbd',
  help: 'The pitch of the key played, from the keys or MIDI, at one volt per octave. Both VCOs already follow it inside.',
});
jackOut('j.vel', 250, 780, 'VELOCITY', {
  name: 'KEYS VELOCITY',
  signal: 'vel',
  help: 'How hard each key was played, as a voltage. Nothing inside uses it: patch it to a VCF FM input so harder notes are brighter.',
});
jackOut('j.gate', 250, 867, 'GATE', {
  name: 'KEYS GATE',
  signal: 'gate',
  help: 'High while a key is held (or while the arpeggiator plays a note). Both envelopes already take it inside.',
});
knob('keys.arpRate', 240, 955, 'ARP\nRATE / SYNC', {
  module: 'mode',
  def: 5,
  labelSize: 9.5,
  fmt: (v) => `${Math.round(arpBpm(v))} BPM`,
  help: 'The arpeggiator’s speed, one note per sixteenth. On the hardware, with a clock at CLOCK IN, MIDI or USB it picks a division of that clock instead.',
});
text(250, 1035, 'Keyboard', 9.5);
led(255, 1047, 'gate');

// ── LFO ───────────────────────────────────────────────────────────────────
jackOut('j.lfo_tri', 340, 690, 'TRIANGLE', {
  name: 'LFO TRIANGLE',
  signal: 'lfoTri',
  help: 'The LFO’s triangle wave. Inside it is already wired to both VCOs’ SHAPE and FM 2, the VCF’s FM 2 and the VCA’s AM 2, each at its own depth knob.',
});
jackOut('j.lfo_sq', 340, 780, 'SQUARE', {
  name: 'LFO SQUARE',
  signal: 'lfoSq',
  help: 'The LFO’s square wave, wired to nothing inside. Patched to a VCO’s 1V/OCT it jumps between two pitches; to a GATE it fires an envelope over and over.',
});
knob('lfo.rate', 332, 955, 'RATE', {
  module: 'lfo',
  def: 5,
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'The LFO’s speed, from a slow sweep to a buzz (here 0.05 Hz to 100 Hz). Clockwise is faster.',
});
text(338, 1035, 'LFO', 9.5);
led(338, 1047, 'lfo');

// ── VCO 1 and VCO 2 ───────────────────────────────────────────────────────
for (const n of [1, 2]) {
  const dx = n === 1 ? 0 : 349;
  const v = `vco${n}`;
  const x = (px: number): number => px + dx;
  jackOut(`j.${v}_saw`, x(428), 695, 'SAW', {
    name: `VCO ${n} SAW`,
    signal: `o${n}saw`,
    help: `VCO ${n}’s sawtooth on its own, whatever its wave buttons say.`,
  });
  jackOut(`j.${v}_tri`, x(517), 695, 'TRIANGLE', {
    name: `VCO ${n} TRIANGLE`,
    signal: `o${n}tri`,
    help: `VCO ${n}’s triangle on its own, whatever its wave buttons say.`,
  });
  jackOut(`j.${v}_pulse`, x(605), 695, 'PULSE', {
    name: `VCO ${n} PULSE`,
    signal: `o${n}pulse`,
    help: `VCO ${n}’s pulse on its own, at the width SHAPE sets, whatever its wave buttons say.`,
  });
  jackOut(`j.${v}_out`, x(692), 695, 'OUT', {
    name: `VCO ${n} OUT`,
    signal: `osc${n}`,
    help: `The waves VCO ${n}’s buttons have lit, mixed: the same sound it sends the mixer, before LEVEL. Silent with no button lit.`,
  });
  jackIn(`j.${v}_voct`, x(430), 782, '1V/OCT', {
    name: `VCO ${n} 1V/OCT`,
    dest: `pitch${n}`,
    amt: 12,
    help: `VCO ${n}’s pitch, at one volt per octave. It is normalled from KEY PITCH, so a cable here takes the keys away from VCO ${n}: patch KEYS PITCH back in with something else through a mult to add to it.`,
  });
  normal(x(430), 782, 'Key Pitch');
  jackIn(`j.${v}_shape`, x(517), 782, 'SHAPE', {
    name: `VCO ${n} SHAPE`,
    dest: `pw${n}`,
    amt: (vals) => shapeAmt(num(vals, `${v}.shapeMod`)),
    check: (vals) =>
      num(vals, `${v}.shapeMod`) <= 0
        ? `VCO ${n}’s SHAPE MOD is at 0, so nothing here moves the shape. Turn it up.`
        : null,
    help: `Moves VCO ${n}’s pulse width, as far as SHAPE MOD lets it. Normalled from the LFO triangle, for pulse-width modulation with no cable; a cable here replaces it.`,
  });
  normal(x(517), 782, 'LFO Triangle');
  jackIn(`j.${v}_fm1`, x(605), 782, 'FM 1', {
    name: `VCO ${n} FM 1`,
    dest: `pitch${n}`,
    amt: (vals) => fmSemi(num(vals, `${v}.fm1`)),
    check: (vals) =>
      num(vals, `${v}.fm1`) <= 0
        ? `VCO ${n}’s FM 1 knob is at 0, so nothing here moves its pitch. Turn it up.`
        : null,
    help: `Moves VCO ${n}’s pitch by as much as its FM 1 knob lets it. Normalled from Envelope 1, for a pitch sweep on every note; a cable here replaces it. An audio-rate source, such as the other VCO, gives clangy FM tones.`,
  });
  normal(x(605), 782, 'Env 1');
  jackIn(`j.${v}_fm2`, x(692), 782, 'FM 2', {
    name: `VCO ${n} FM 2`,
    dest: `pitch${n}`,
    amt: (vals) => fmSemi(num(vals, `${v}.fm2`)),
    check: (vals) =>
      num(vals, `${v}.fm2`) <= 0
        ? `VCO ${n}’s FM 2 knob is at 0, so nothing here moves its pitch. Turn it up.`
        : null,
    help: `Moves VCO ${n}’s pitch by as much as its FM 2 knob lets it. Normalled from the LFO triangle, for vibrato with no cable; a cable here replaces it.`,
  });
  normal(x(692), 782, 'LFO Triangle');
  knob(`${v}.coarse`, x(422), 868, 'COARSE', {
    module: 'osc',
    def: 5,
    name: `VCO ${n} COARSE`,
    fmt: (val) => fmtSemi(coarseSemi(val)),
    help: `VCO ${n}’s tuning, over four octaves either side of the centre (this app’s range).`,
  });
  knob(`${v}.shapeMod`, x(510), 868, 'SHAPE MOD', {
    module: 'osc',
    name: `VCO ${n} SHAPE MOD`,
    help: `How far the SHAPE input (the LFO triangle unless patched) moves VCO ${n}’s pulse width.`,
  });
  knob(`${v}.fm1`, x(598), 868, 'FM 1', {
    module: 'osc',
    name: `VCO ${n} FM 1 depth`,
    help: `How far the FM 1 input (Envelope 1 unless patched) moves VCO ${n}’s pitch, up to four octaves.`,
  });
  knob(`${v}.fm2`, x(685), 868, 'FM 2', {
    module: 'osc',
    name: `VCO ${n} FM 2 depth`,
    help: `How far the FM 2 input (the LFO triangle unless patched) moves VCO ${n}’s pitch, up to four octaves. A little is vibrato.`,
  });
  knob(`${v}.fine`, x(422), 952, 'FINE', {
    module: 'osc',
    def: 5,
    name: `VCO ${n} FINE`,
    fmt: (val) => fmtSemi(fineSemi(val)),
    help: `Fine tuning, a semitone either side of the centre: set the two VCOs slightly apart for a slow beating.`,
  });
  knob(`${v}.shape`, x(510), 952, 'SHAPE', {
    module: 'osc',
    def: 5,
    name: `VCO ${n} SHAPE`,
    fmt: (val) => `${Math.round(pulseWidth(val) * 100)}%`,
    help: `The pulse’s width: a square at the centre, thinner and more nasal either way. It changes only the pulse.`,
  });
  knob(`${v}.level`, x(685), 952, 'LEVEL', {
    module: 'osc',
    def: n === 1 ? 8 : 0,
    name: `VCO ${n} LEVEL`,
    help: `How much of VCO ${n} goes to the mixer. Only the waves its buttons have lit are heard.`,
  });
  const waves: [id: string, shape: WaveShape, bx: number, by: number, word: string][] = [
    ['saw', 'saw', 570, 935, 'sawtooth'],
    ['tri', 'tri', 600, 955, 'triangle'],
    ['pulse', 'pulse', 637, 973, 'pulse'],
  ];
  for (const [w, shape, bx, by, word] of waves) {
    glyph(x(bx), by - 21, shape);
    button(`${v}.${w}`, x(bx), by, {
      module: 'osc',
      def: n === 1 && w === 'saw',
      name: `VCO ${n} ${word} button`,
      help: `Adds VCO ${n}’s ${word} to its OUT and to the mixer; its light shows it is in. Any mix of the three can be lit; with none lit VCO ${n} is silent there, though its separate wave jacks still work.`,
    });
  }
  // ENV 1 / ENV 2
  const e = `env${n}`;
  const stages: [id: string, label: string, ex: number, rest: KnobRest][] = [
    [
      'attack',
      'ATTACK',
      422,
      {
        module: 'env',
        fmt: (val) => fmtTime(attTime(val)),
        help: `How long Envelope ${n} takes to rise when a key is pressed (here 1 ms to 10 s).`,
      },
    ],
    [
      'decay',
      'DECAY',
      510,
      {
        module: 'env',
        def: 5,
        fmt: (val) => fmtTime(decTime(val)),
        help: `How long Envelope ${n} takes to fall from its peak to the sustain level.`,
      },
    ],
    [
      'sustain',
      'SUSTAIN',
      598,
      {
        module: 'env',
        def: 7,
        help: `The level Envelope ${n} holds at while the key stays down.`,
      },
    ],
    [
      'release',
      'RELEASE',
      685,
      {
        module: 'env',
        def: 2,
        fmt: (val) => fmtTime(relTime(val)),
        help: `How long Envelope ${n} takes to fall away after the key is let go.`,
      },
    ],
  ];
  for (const [id, label, ex, rest] of stages)
    knob(`${e}.${id}`, x(ex), 1042, label, {
      name: `ENV ${n} ${label}`,
      r: 16,
      labelGap: 5,
      labelSize: 9.5,
      ...rest,
    });
}
// the small round caps by each 1V/OCT jack
for (const cx of [405, 754])
  decor.push({ t: 'circle', x: X(cx), y: Y(742), r: 10, fill: '#55575b', hw: true });

// ── MIXER ─────────────────────────────────────────────────────────────────
jackOut('j.noise', 1125, 695, 'NOISE', {
  signal: 'noise',
  help: 'White noise on its own, before NOISE LEVEL.',
});
jackOut('j.mix_out', 1210, 695, 'MIX OUT', {
  signal: 'mixer',
  help: 'The mixer’s output: both VCOs, the noise and AUX at their levels. Inside it already feeds the VCF’s LOW PASS input.',
});
jackIn('j.aux', 1125, 782, 'AUX', {
  dest: 'extIn',
  amt: (v) => level10(num(v, 'mix.aux'), 1),
  check: (v) =>
    num(v, 'mix.aux') <= 0
      ? 'AUX LEVEL is at 0, so nothing patched here is heard. Turn it up.'
      : null,
  help: 'A fourth mixer channel for anything patched in, from outside or from the synth itself, at AUX LEVEL.',
});
knob('mix.aux', 1125, 868, 'AUX LEVEL', {
  module: 'mixer',
  help: 'The level of whatever is patched into AUX.',
});
knob('mix.noise', 1125, 952, 'NOISE LEVEL', {
  module: 'mixer',
  help: 'How much white noise goes to the mixer.',
});

// ── VCF ───────────────────────────────────────────────────────────────────
jackOut('j.vcf_out', 1475, 693, 'VCF OUT', {
  signal: 'vcf1',
  help: 'The filter’s output. Inside it already feeds the VCA’s INPUT.',
});
jackIn('j.vcf_lp', 1210, 782, 'LOW PASS', {
  dest: 'vcfIn',
  amt: 1,
  help: 'Into the filter as a low-pass, which keeps the lows and takes off the highs above CUT OFF. Normalled from MIX OUT; a cable here replaces it.',
});
normal(1210, 782, 'Mix Out');
jackIn('j.vcf_bp', 1298, 782, 'BAND PASS', {
  dest: 'vcfBpIn',
  amt: 1,
  help: 'Into the filter as a band-pass, which keeps only a band round CUT OFF. Nothing is wired here inside; what is patched in adds to the low-pass at the one output, so two sources can be filtered two ways at once.',
});
jackIn('j.vcf_hp', 1385, 782, 'HIGH PASS', {
  dest: 'vcfHpIn',
  amt: 1,
  help: 'Into the filter as a high-pass, which takes off the lows below CUT OFF. Nothing is wired here inside; what is patched in adds to the low-pass at the one output.',
});
jackIn('j.vcf_fm1', 1298, 868, 'FM 1', {
  name: 'VCF FM 1',
  dest: 'cutoff',
  amt: (v) => vcfFmOct(num(v, 'vcf.fm1')),
  check: (v) =>
    num(v, 'vcf.fm1') <= 0
      ? 'The VCF’s FM 1 knob is at 0, so nothing here moves the cutoff. Turn it up.'
      : null,
  help: 'Moves the cutoff by as much as the VCF’s FM 1 knob lets it. Normalled from Envelope 1, for a filter sweep on every note; a cable here replaces it.',
});
normal(1298, 868, 'Env 1');
jackIn('j.vcf_fm2', 1385, 868, 'FM 2', {
  name: 'VCF FM 2',
  dest: 'cutoff',
  amt: (v) => vcfFmOct(num(v, 'vcf.fm2')),
  check: (v) =>
    num(v, 'vcf.fm2') <= 0
      ? 'The VCF’s FM 2 knob is at 0, so nothing here moves the cutoff. Turn it up.'
      : null,
  help: 'Moves the cutoff by as much as the VCF’s FM 2 knob lets it. Normalled from the LFO triangle, for a wah; a cable here replaces it. KEYS VELOCITY here makes harder notes brighter.',
});
normal(1385, 868, 'LFO Triangle');
knob('vcf.fm1', 1298, 952, 'FM 1', {
  module: 'filter',
  name: 'VCF FM 1 depth',
  help: 'How far the FM 1 input (Envelope 1 unless patched) opens the filter, up to eight octaves. This is the filter envelope amount.',
});
knob('vcf.fm2', 1385, 952, 'FM 2', {
  module: 'filter',
  name: 'VCF FM 2 depth',
  help: 'How far the FM 2 input (the LFO triangle unless patched) moves the cutoff, up to eight octaves.',
});
knob('vcf.cutoff', 1298, 1040, 'CUT OFF', {
  module: 'filter',
  def: 7,
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter acts: lower is darker for the low-pass, a lower band for the band-pass, more lows let through for the high-pass.',
});
knob('vcf.res', 1385, 1040, 'RESONANCE', {
  module: 'filter',
  help: 'Rings the filter at the cutoff. It starts to whistle on its own early, from about 8, so the filter can be played as a sine.',
});
text(1210, 1035, 'Filter', 9.5);
led(1210, 1047);

// ── ENVS and the VCA ──────────────────────────────────────────────────────
jackOut('j.env1_out', 1563, 693, 'ENV 1 OUT', {
  signal: 'env1',
  help: 'Envelope 1. Inside it already reaches both VCOs’ FM 1 and the VCF’s FM 1, each at its own knob.',
});
jackOut('j.env2_out', 1653, 693, 'ENV 2 OUT', {
  signal: 'env2',
  help: 'Envelope 2. Inside it already sets the loudness, through the VCA’s AM 1.',
});
jackIn('j.vca_in', 1475, 782, 'INPUT', {
  name: 'VCA INPUT',
  dest: 'odIn',
  amt: 1,
  help: 'Audio into the VCA, through DRIVE. Normalled from VCF OUT; a cable here replaces it, so the filter is skipped.',
});
normal(1475, 782, 'VCF Out');
jackIn('j.env1_gate', 1563, 782, 'GATE', {
  name: 'ENV 1 GATE',
  dest: 'gate1',
  amt: 1,
  help: 'Fires Envelope 1 while it is high. Normalled from the key gate; a cable here replaces it, so a square LFO fires the envelope over and over by itself.',
});
normal(1563, 782, 'Key Gate');
jackIn('j.env2_gate', 1653, 782, 'GATE', {
  name: 'ENV 2 GATE',
  dest: 'gate2',
  amt: 1,
  help: 'Fires Envelope 2, and so the loudness, while it is high. Normalled from the key gate; a cable here replaces it.',
});
normal(1653, 782, 'Key Gate');
controls.push({
  id: 'vca.mode',
  type: 'toggle',
  x: X(1475),
  y: Y(864),
  w: 16,
  kind: 'enum',
  options: [
    { v: 'drone', label: 'DRONE' },
    { v: 'gated', label: 'GATED' },
  ],
  def: 'gated',
  module: 'amp',
  name: 'DRONE / GATED',
  tip: '#b23a2e',
  labelPos: 'none',
  help: 'GATED: the VCA opens only as far as its AM inputs say (Envelope 2 with nothing patched), so notes start and stop. DRONE: the VCA stays open and the sound never stops.',
});
text(1475, 838, 'Drone', 9.5);
text(1475, 889, 'Gated', 9.5);
jackIn('j.vca_am1', 1563, 868, 'AM 1', {
  dest: 'amp',
  amt: (v) => amGain(num(v, 'vca.am1')),
  check: (v) =>
    num(v, 'vca.am1') <= 0
      ? 'The VCA’s AM 1 knob is at 0, so nothing here opens the VCA. Turn it up.'
      : null,
  help: 'Opens the VCA by as much as its AM 1 knob lets it. Normalled from Envelope 2, which is how the notes get their loudness shape; a cable here replaces it.',
});
normal(1563, 868, 'Env 2');
jackIn('j.vca_am2', 1653, 868, 'AM 2', {
  dest: 'amp',
  amt: (v) => amGain(num(v, 'vca.am2')),
  check: (v) =>
    num(v, 'vca.am2') <= 0
      ? 'The VCA’s AM 2 knob is at 0, so nothing here opens the VCA. Turn it up.'
      : null,
  help: 'Opens the VCA by as much as its AM 2 knob lets it. Normalled from the LFO triangle, for tremolo; a cable here replaces it.',
});
normal(1653, 868, 'LFO Triangle');
knob('vca.drive', 1475, 952, 'DRIVE', {
  module: 'amp',
  help: 'Overdrives the VCA’s input, from a little warmth to a hard, buzzy distortion.',
});
knob('vca.am1', 1563, 952, 'AM 1', {
  module: 'amp',
  def: 10,
  name: 'VCA AM 1 depth',
  help: 'How far the AM 1 input (Envelope 2 unless patched) opens the VCA. Fully up the notes reach full loudness.',
});
knob('vca.am2', 1653, 952, 'AM 2', {
  module: 'amp',
  name: 'VCA AM 2 depth',
  help: 'How far the AM 2 input (the LFO triangle unless patched) opens the VCA: tremolo on top of AM 1.',
});
text(1563, 1035, 'Env 1', 9.5);
led(1563, 1047, 'env1');
text(1650, 1035, 'Env 2', 9.5);
led(1650, 1047);

// ── OUT ───────────────────────────────────────────────────────────────────
jackOut('j.out', 1745, 693, 'OUT', {
  signal: 'vca',
  help: 'The VCA’s output at full level for other modular gear: MASTER VOL does not touch it.',
});
knob('out.master', 1745, 952, 'MASTER VOL', {
  module: 'out',
  def: 7,
  help: 'The level at the line output and headphones on the back. The OUT jack on top is not affected.',
});
text(1745, 1035, 'Out', 9.5);
led(1745, 1047, 'power');

// ── Left-hand controller and the keys ─────────────────────────────────────
decor.push({ t: 'rect', x: X(175), y: Y(1095), w: 320, h: 310, r: 4, fill: '#232427', hw: true });
button('keys.arp', 293, 1162, {
  module: 'mode',
  w: 34,
  name: 'ARP',
  help: 'Starts and stops the arpeggiator: held keys play one after another at ARP RATE. On the hardware, holding ARP and circling the joystick picks one of six orders, and ARP with OCTAVE sets its range; here it plays upwards over one octave.',
});
text(293, 1194, 'Arp', 9.5);
led(295, 1128);
button('keys.vibrato', 383, 1162, {
  module: 'mod',
  w: 34,
  name: 'VIBRATO',
  help: 'With it lit, pushing the joystick up adds vibrato from its own 5 Hz LFO instead of glide. On the hardware, holding it while playing a key starts the tuning routine.',
});
text(383, 1194, 'Vibrato', 9.5);
led(385, 1128);
button('keys.octDown', 290, 1240, {
  module: 'mode',
  w: 34,
  name: 'OCTAVE −',
  help: 'Moves the keyboard down an octave, as far as four. The on-screen keyboard has its own octave buttons here.',
});
button('keys.octUp', 380, 1240, {
  module: 'mode',
  w: 34,
  name: 'OCTAVE +',
  help: 'Moves the keyboard up an octave, as far as four. The on-screen keyboard has its own octave buttons here.',
});
text(335, 1240, 'Octave', 9.5);
text(290, 1272, '−', 12);
text(380, 1272, '+', 12);
for (const lx of [270, 315, 360, 402]) led(lx, 1203);
const joyFmt = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: X(325),
    y: Y(1318),
    r: 46,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: joyFmt,
    help: 'The joystick. Left and right bend the pitch. Up glides between notes, slower the further it goes, or with VIBRATO lit adds vibrato. Down holds the notes. Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: X(325),
    y: Y(1319),
    r: 46,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: joyFmt,
    help: 'The joystick’s up-down movement: up glides (or with VIBRATO lit, adds vibrato), down holds the notes.',
  }
);
button('keys.hold', 328, 1385, {
  module: 'mode',
  w: 16,
  name: 'HOLD (joystick click)',
  help: 'Latches the held notes, so an arpeggio keeps playing after the keys are let go. On the hardware this is a click of the joystick, and its light shows it is on.',
});
text(328, 1400, 'Hold', 9.5);
// the tops of the keys: 32 keys from F, 19 white
{
  const x0 = 502,
    x1 = 1752,
    top = 1128,
    bottom = 1400,
    kw = (x1 - x0) / 19;
  for (let i = 0; i < 19; i++)
    decor.push({
      t: 'rect',
      hw: true,
      x: X(x0 + i * kw + 2),
      y: Y(top),
      w: kw - 4,
      h: bottom - top,
      r: 2,
      fill: '#f4f4f0',
    });
  const after = [0, 1, 2, 4, 5]; // black keys after F, G, A, C and D
  for (let i = 0; i < 18; i++)
    if (after.includes(i % 7))
      decor.push({
        t: 'rect',
        hw: true,
        x: X(x0 + (i + 1) * kw - 19),
        y: Y(top),
        w: 38,
        h: 175,
        r: 3,
        fill: '#111113',
      });
}

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'keys',
    label: 'Keys',
    module: 'mode',
    keywords: 'keyboard cv gate pitch velocity arpeggiator arp tempo',
    rects: [R(205, 640, 293, 1065)],
    help: 'The keyboard as voltages: PITCH, VELOCITY and GATE, which the voice already follows inside, ready to patch anywhere else. ARP RATE sets the arpeggiator’s speed.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'lfo vibrato wobble tremolo pwm rate triangle square',
    rects: [R(293, 640, 384, 1065)],
    help: 'One LFO with triangle and square outputs. The triangle is already wired to the VCOs’ SHAPE and FM 2, the VCF’s FM 2 and the VCA’s AM 2, so turning one of those knobs up is enough to hear it; the square goes only where it is patched.',
  },
  ...[1, 2].flatMap((n): Area[] => {
    const x0 = n === 1 ? 384 : 735,
      x1 = n === 1 ? 735 : 1082;
    return [
      {
        id: `vco${n}`,
        label: `VCO ${n}`,
        module: 'osc',
        keywords: 'oscillator vco sawtooth triangle pulse width pwm shape fm tune coarse fine',
        rects: [R(x0, 640, x1, 995)],
        help: `VCO ${n}: three buttons pick which of its saw, triangle and pulse it sends to its OUT and to the mixer, in any mix, and LEVEL sets how much. SHAPE is the pulse width. FM 1 and FM 2 move its pitch, from Envelope 1 and the LFO unless patched. Each wave also has its own jack.`,
      },
      {
        id: `env${n}`,
        label: `Envelope ${n}`,
        module: 'env',
        keywords: 'adsr attack decay sustain release contour',
        rects: [R(x0, 995, x1, 1065)],
        help:
          n === 1
            ? 'Envelope 1, an ADSR fired by the key gate unless its GATE is patched. Inside it reaches the VCOs’ FM 1 and the VCF’s FM 1, so it is the filter (and pitch) envelope.'
            : 'Envelope 2, an ADSR fired by the key gate unless its GATE is patched. Inside it reaches the VCA’s AM 1, so it is the loudness envelope.',
      },
    ];
  }),
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer noise aux level input',
    rects: [R(1082, 640, 1255, 737), R(1082, 737, 1167, 1065)],
    help: 'Adds the noise and the AUX input to the two VCOs, whose levels are in their own sections. MIX OUT goes to the filter’s LOW PASS input inside.',
  },
  {
    id: 'vcf',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf filter low-pass band-pass high-pass multimode cutoff resonance fm sallen-key',
    rects: [R(1255, 640, 1520, 737), R(1167, 737, 1430, 1065)],
    help: 'A 2-pole multimode filter with three inputs, LOW PASS, BAND PASS and HIGH PASS, into one output: patch different sources into each and each is filtered its own way. CUT OFF and RESONANCE set it for all three; FM 1 and FM 2 move the cutoff, from Envelope 1 and the LFO unless patched.',
  },
  {
    id: 'envs',
    label: 'Envelope jacks',
    module: 'env',
    keywords: 'envelope outputs gates vca input',
    rects: [R(1520, 640, 1702, 737), R(1430, 737, 1702, 824)],
    help: 'Each envelope’s output and its own GATE input, normalled to the key gate, and the VCA’s INPUT, normalled to the filter.',
  },
  {
    id: 'vca',
    label: 'VCA',
    module: 'amp',
    keywords: 'vca amplifier drive overdrive distortion drone tremolo am',
    rects: [R(1430, 824, 1702, 1065)],
    help: 'The VCA: DRIVE overdrives its input, AM 1 and AM 2 open it (from Envelope 2 and the LFO unless patched), and DRONE holds it open so the sound never stops.',
  },
  {
    id: 'out',
    label: 'Output',
    module: 'out',
    keywords: 'output volume master headphones line',
    rects: [R(1702, 640, 1790, 1065)],
    help: 'OUT is the VCA at full level for other modular gear; MASTER VOL sets the line and headphone outputs on the back.',
  },
  {
    id: 'perf',
    label: 'Arp, vibrato, octave and joystick',
    module: 'mod',
    keywords: 'joystick bend glide portamento vibrato hold latch octave arpeggiator',
    rects: [R(170, 1090, 500, 1410)],
    help: 'Beside the keys: ARP starts the arpeggiator, OCTAVE moves the keys, and the joystick bends the pitch (left and right), glides or with VIBRATO adds vibrato (up), and holds the notes (down, or click to latch).',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const patched = ctx.patched;
  const routes: EngineRoute[] = [];
  /** A normal printed under an input: wired inside at its depth, until a cable goes into that jack. */
  const norm = (jack: string, src: string, dst: string, amt: number): void => {
    if (!patched[jack] && amt) routes.push({ src, dst, amt });
  };
  const osc = [1, 2].map((n) => {
    const p = `vco${n}`;
    norm(`j.${p}_shape`, 'lfoTri', `pw${n}`, shapeAmt(num(v, `${p}.shapeMod`)));
    norm(`j.${p}_fm1`, 'env1', `pitch${n}`, fmSemi(num(v, `${p}.fm1`)));
    norm(`j.${p}_fm2`, 'lfoTri', `pitch${n}`, fmSemi(num(v, `${p}.fm2`)));
    const g = 0.8;
    return {
      level: level10(num(v, `${p}.level`), 1),
      mix: {
        ...(v[`${p}.saw`] ? { saw: g } : {}),
        ...(v[`${p}.tri`] ? { tri: g } : {}),
        ...(v[`${p}.pulse`] ? { pulse: g } : {}),
      },
      pw: pulseWidth(num(v, `${p}.shape`)),
      semi: coarseSemi(num(v, `${p}.coarse`)) + fineSemi(num(v, `${p}.fine`)),
      // a cable in 1V/OCT takes the keys away from this VCO: its pitch is then the cable's, from middle C
      kbd: !patched[`j.${p}_voct`],
      fixedNote: 60,
      syncTo: -1,
    };
  });
  norm('j.vcf_fm1', 'env1', 'cutoff', vcfFmOct(num(v, 'vcf.fm1')));
  norm('j.vcf_fm2', 'lfoTri', 'cutoff', vcfFmOct(num(v, 'vcf.fm2')));
  norm('j.vca_am1', 'env2', 'amp', amGain(num(v, 'vca.am1')));
  // the VCA's gain must not go below closed, so the triangle reaches AM 2 as 0..1
  norm('j.vca_am2', 'lfoUni', 'amp', amGain(num(v, 'vca.am2')));
  const jx = clamp(num(v, 'joy.x'), -1, 1),
    jy = clamp(num(v, 'joy.y'), -1, 1);
  const vib = !!v['keys.vibrato'];
  if (jx) routes.push({ src: 'joyX', dst: 'pitchAll', amt: BEND_SEMI });
  if (vib && jy > 0) routes.push({ src: 'lfo2', dst: 'pitchAll', amt: jy * VIB_SEMI });
  const drive = num(v, 'vca.drive') / 10;
  return {
    osc,
    noise: { level: level10(num(v, 'mix.noise'), 1) * 0.7, color: 'white' },
    ext: { level: 1 },
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      // self-oscillates from about 8
      res: (num(v, 'vcf.res') / 10) * 1.15,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: {
      a: attTime(num(v, 'env1.attack')),
      d: decTime(num(v, 'env1.decay')),
      s: num(v, 'env1.sustain') / 10,
      r: relTime(num(v, 'env1.release')),
    },
    env2: {
      a: attTime(num(v, 'env2.attack')),
      d: decTime(num(v, 'env2.decay')),
      s: num(v, 'env2.sustain') / 10,
      r: relTime(num(v, 'env2.release')),
    },
    // the loudness is AM 1 and AM 2 (routes and cables into `amp`); DRONE holds the VCA open as well
    vca: { envSrc: 'none', bias: v['vca.mode'] === 'drone' ? 1 : 0 },
    lfo: { rate: lfoHz(num(v, 'lfo.rate')), mix: { tri: 1 }, keySync: false },
    lfo2: { rate: VIB_HZ, mix: { sine: 1 } },
    glide: { time: vib ? 0 : glideTime(jy), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    routes,
    od: drive > 0 ? { on: true, drive, tone: 0.5, level: 1 } : { on: false },
    delay: { on: false },
    oscOuts: true,
    joy: [jx, jy],
    poly: { voices: 1, stack: 1, mono: true },
    arp: {
      on: !!v['keys.arp'],
      bpm: arpBpm(num(v, 'keys.arpRate')),
      gate: 0.5,
      mode: 'up',
      octaves: 1,
      // the joystick held down is a momentary hold; its click latches
      hold: !!v['keys.hold'] || jy < -0.5,
    },
    tune: 0,
    volume: level10(num(v, 'out.master'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const malevolent: SynthDef & { version: number } = {
  id: 'malevolent',
  version: 1,
  name: 'Malevolent',
  maker: 'PWM',
  year: 2022,
  heritage: 'An original British design, its analogue circuits by Future Sound Systems',
  summary:
    'A semi-modular analogue mono synth with 32 mini keys: two VCOs whose saw, triangle and pulse can be mixed by three buttons each, noise and an aux input, a 2-pole multimode filter with separate low-pass, band-pass and high-pass inputs, two ADSRs, a VCA with drive and a drone switch, an LFO, an arpeggiator and a joystick, and 38 patch points normalled so it plays with no cables.',
  view: { w: 1800 - OX, h: 1410 - OY },
  theme: {
    panel: PANEL,
    panel2: '#222326',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    knobRing: true,
  },
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    env1: 'Envelope 1',
    env2: 'Envelope 2',
    lfoTri: 'the LFO triangle',
    lfoSq: 'the LFO square',
    lfoUni: 'the LFO triangle',
    lfo2: 'the vibrato LFO',
    vcf1: 'the filter',
    mixer: 'the mixer',
    vca: 'the VCA',
    kbd: 'KEYS PITCH',
    vel: 'KEYS VELOCITY',
    gate: 'KEYS GATE',
    joyX: 'the joystick (left-right)',
  },
  destNames: { extIn: 'the mixer’s AUX', odIn: 'the VCA input' },
  decor,
  areas,
  controls,
  jacks,
  init,
  // Init is VCO 1's saw into the filter, part-closed, with the envelopes half-way. The Default patch opens the filter
  // with no envelope or LFO on it, and makes Envelope 2 (the loudness, through AM 1 at full) an organ gate with a short
  // release.
  defaultPatch: {
    values: {
      'vcf.cutoff': 10,
      'vcf.res': 0,
      'env2.attack': 0,
      'env2.sustain': 10,
      'env2.release': 2,
    },
  },
  toEngine,
};

export default malevolent;
