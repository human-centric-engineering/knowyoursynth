/**
 * PWM Mantis: the definition. Positions are pixels on the owner's product photo,
 * `.context/app/synth-data/mantis/raw/pwm-mantis.jpg` (3000 × 3000, the synth seen square-on from above), turned into
 * view units by X() / Y() (offset to the faceplate's top-left corner, then scaled by K so the panel is about as wide as
 * the other synths'). The view is the faceplate and the left-hand controller beside the keys, with the tops of the keys
 * for reference. The data model is the owner's spec, `.context/app/synth-data/mantis/mantis.synth.json` (0.13.0).
 *
 * Engine notes: a four-voice `poly` synth (Mono, Duophonic or Quad). Each voice has four oscillators: Oscillator 1,
 * Oscillator 2, the density oscillator (a detuned copy of Oscillator 2) and the sub (a copy of Oscillator 1 an octave
 * down). The three balance knobs set their levels, the noise's and the ring modulator's (Oscillator 1 × Oscillator 2,
 * routed into the filter). The dual filter's eight modes are built from the engine's SVF, its ladder and the resonant
 * high-pass in front of it; Wide Notch is the SVF's notch, which WIDTH cannot widen. The six mod routes are panel routes,
 * SOURCE × SCALE (a route's `by`) at the depth of their MOD knob. Chorus and reverb are the effects engine on the voice
 * sum (its stereo chorus and chamber reverb), in a row.
 *
 * The getting started guide documents no envelope or LFO times, knob laws or bend range (`not_in_source`), so every
 * range here is this app's choice; they are noted where they are set.
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
  FxParams,
  KnobControl,
  OscParams,
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
    min?: number;
    max?: number;
    step?: number;
    fmt?: (v: number) => string;
  };

// ── Ranges and tapers (all this app's choice: the guide gives none) ────────
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 50);
const attTime = (v: number): number => expMap(v / 10, 0.001, 10);
const decTime = (v: number): number => expMap(v / 10, 0.003, 10);
const relTime = (v: number): number => expMap(v / 10, 0.003, 10);
const glideTime = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.005, 3));
const bpmOf = (v: number): number => expMap(v / 10, 40, 240);
/** WIDTH: the gap between the two filters, up to four octaves. */
const widthOct = (v: number): number => (clamp(v, 0, 10) / 10) * 4;
/** A bipolar MOD knob, −5..5, as −1..1 of its control's full depth. */
const bip = (v: number): number => clamp(v, -5, 5) / 5;
/** Pitch MOD at full: two octaves, squared so a little is vibrato. */
const pitchModSemi = (v: number): number => Math.sign(v) * bip(v) * bip(v) * 24;
/** Cut-off MOD at full: six octaves. */
const cutModOct = (v: number): number => bip(v) * 6;
/** Width MOD at full: four octaves of spread. */
const widthModOct = (v: number): number => bip(v) * 4;
/** Shape MOD at full: how far a full-scale route moves the pulse width, or the wavetable through its whole sweep. */
const pwModAmt = (v: number): number => bip(v) * 0.45;
const morphModAmt = (v: number): number => bip(v) * 0.5;
/** SHAPE on the pulse: a square at the centre, thinner either way. */
const pulseWidth = (v: number): number => 0.5 + ((clamp(v, 0, 10) - 5) / 5) * 0.45;
/** DENSITY RATE: how far the density oscillator is detuned from Oscillator 2, up to half a semitone. */
const densitySemi = (v: number): number => Math.pow(clamp(v, 0, 10) / 10, 2) * 0.5;
/** OSC DRIFT: the slow random pitch, up to a third of a semitone. */
const driftSemi = (v: number): number => (clamp(v, 0, 10) / 10) * 0.33;
/** LFO FADE: seconds for the LFO to fade in. */
const fadeTime = (v: number): number => (v >= 0 ? 0 : expMap(-v / 5, 0.05, 8));
/** MASTER TUNE: a semitone either way. */
const tuneSemi = (v: number): number => clamp(v, -5, 5) / 5;
/** Joystick left–right: pitch bend, ±2 semitones (the bend range is a setting the guide does not give). */
const BEND_SEMI = 2;
/** Joystick up: vibrato, up to half a semitone either way, from its own 5.5 Hz LFO. */
const VIB_HZ = 5.5;
const VIB_SEMI = 0.5;
/** The arpeggiator's SYNC knob: one note per 2nd, 4th, 8th, 16th or 32nd of a bar at BPM. */
const ARP_DIVS = [2, 4, 8, 16, 32];
const arpDiv = (v: number): number =>
  ARP_DIVS[Math.round((clamp(v, 0, 10) / 10) * (ARP_DIVS.length - 1))];
/** An LFO's RATE while SYNC is lit: a cycle per 4 bars to a cycle per 32nd. */
const LFO_DIVS: [label: string, beats: number][] = [
  ['4 bars', 16],
  ['2 bars', 8],
  ['1 bar', 4],
  ['1/2', 2],
  ['1/4', 1],
  ['1/8', 0.5],
  ['1/16', 0.25],
  ['1/32', 0.125],
];
const lfoDiv = (v: number): [string, number] =>
  LFO_DIVS[Math.round((clamp(v, 0, 10) / 10) * (LFO_DIVS.length - 1))];

const K = 0.6;
const OX = 120,
  OY = 735; // image pixel of the view's top-left corner
const X = (x: number): number => (x - OX) * K;
const Y = (y: number): number => (y - OY) * K;
const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#e9eae6';
const GREEN = '#2fc49d';
const PANEL = '#2b2c2f';

// ── Drawing helpers (image coordinates in, view units out) ────────────────
const text = (
  x: number,
  y: number,
  t: string,
  size = 7.5,
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
    w: (x1 - x0) * K,
    h: (y1 - y0) * K,
    r: 3,
    sw: 1.2,
    labelAt: 'none',
  });
};
const line = (x1: number, y1: number, x2: number, y2: number): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w: 1.2 });
};
/** A section name, printed in green on the frame's top line. */
const title = (x: number, y: number, t: string): void => {
  decor.push({
    t: 'rect',
    x: X(x) - t.length * 3.6 - 5,
    y: Y(y) - 6,
    w: t.length * 7.2 + 10,
    h: 12,
    fill: PANEL,
  });
  text(x, y, t, 9.5, { fill: GREEN, weight: 700 });
};
const led = (
  x: number,
  y: number,
  litWhen?: 'gate' | 'lfo' | 'power' | { id: string; eq: string | boolean } | { voice: number }
): void => {
  decor.push({
    t: 'led',
    x: X(x),
    y: Y(y),
    r: 3,
    color: 'red',
    ...(litWhen ? { litWhen } : {}),
  });
};
const glyph = (x: number, y: number, shape: WaveShape): void => {
  decor.push({ t: 'wave', x: X(x), y: Y(y), size: 4.5, shape, w: 1.2 });
};

const knob = (id: string, x: number, y: number, label: string, rest: KnobRest): void => {
  const { min = 0, max = 10, def = 0, ...common } = rest;
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: 13,
    style: 'neutron',
    kind: 'cont',
    min,
    max,
    def,
    label,
    labelPos: 'bottom',
    labelSize: 7.5,
    labelGap: 6,
    ...common,
  });
};
const button = (
  id: string,
  x: number,
  y: number,
  rest: Omit<ControlCommon, 'id' | 'x' | 'y'> & { def?: boolean; lamp?: boolean }
): void => {
  const { def = false, lamp = true, ...common } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 22,
    h: 13,
    ...(lamp ? { lamp: 'red' as const } : {}),
    kind: 'bool',
    def,
    labelPos: 'none',
    ...common,
  });
};

// ── Faceplate ─────────────────────────────────────────────────────────────
// The maker's marks: the PWM monogram, the MANTIS wordmark and its strapline.
text(186, 806, 'PWM', 15, { weight: 800, hw: true, brand: true });
text(312, 804, 'MANTIS', 27, { weight: 800, hw: true, brand: true });
text(540, 822, 'HYBRID-ANALOGUE SYNTHESISER', 6.5, {
  weight: 500,
  fill: GREEN,
  hw: true,
  brand: true,
});
for (let i = 0; i < 5; i++)
  decor.push({
    t: 'line',
    hw: true,
    x1: X(425),
    y1: Y(782 + i * 7),
    x2: X(2830),
    y2: Y(782 + i * 7),
    w: 1.8,
    stroke: GREEN,
  });

frame(427, 840, 527, 1002);
title(477, 843, 'VOLUME');
frame(427, 1010, 527, 1170);
decor.push({ t: 'rect', x: X(445), y: Y(1004), w: 38, h: 22, fill: PANEL });
text(477, 1015, 'MASTER', 9.5, { fill: GREEN, weight: 700 });
text(477, 1032, 'TUNE', 9.5, { fill: GREEN, weight: 700 });
frame(430, 1177, 527, 1342);
title(477, 1180, 'GLIDE');
frame(535, 840, 725, 1478);
title(630, 843, 'PATCH');
frame(730, 840, 1262, 990);
title(995, 843, 'OSCILLATOR 1');
// Oscillator 2's frame steps round OSC 1 SUB
line(730, 997, 1262, 997);
line(1262, 997, 1262, 1315);
line(838, 1315, 1262, 1315);
line(838, 1160, 838, 1315);
line(730, 1160, 838, 1160);
line(730, 997, 730, 1160);
title(995, 1000, 'OSCILLATOR 2');
frame(730, 1170, 832, 1315);
title(780, 1180, 'OSC 1 SUB');
frame(730, 1322, 832, 1478);
title(780, 1332, 'OSC DRIFT');
frame(842, 1328, 940, 1400);
frame(842, 1408, 940, 1472);
frame(950, 1328, 1918, 1478);
frame(1062, 1338, 1300, 1472);
title(1180, 1342, 'CONTROL');
frame(1372, 1338, 1594, 1472);
title(1482, 1342, 'SOURCE');
frame(1676, 1338, 1910, 1472);
title(1792, 1342, 'SCALE');
for (const ax of [1330, 1635])
  decor.push({
    t: 'path',
    d: `M ${X(ax + 9)} ${Y(1394)} L ${X(ax - 9)} ${Y(1406)} L ${X(ax + 9)} ${Y(1418)} Z`,
    w: 0,
    fill: GREEN,
  });
text(1010, 1392, 'MOD', 10, { fill: GREEN, weight: 700 });
text(1010, 1416, 'ROUTES', 10, { fill: GREEN, weight: 700 });
frame(1270, 840, 1372, 1315);
title(1320, 843, 'MIX');
frame(1380, 840, 1482, 1318);
title(1430, 843, 'LFO 1');
frame(1490, 840, 1592, 1318);
title(1540, 843, 'LFO 2');
frame(1600, 840, 1915, 1318);
title(1757, 843, 'FILTER');
frame(1925, 840, 2568, 997);
title(2245, 843, 'ENVELOPE 1');
frame(1925, 840, 2006, 858);
text(1965, 849, 'AMPLITUDE', 6, { fill: GREEN, weight: 700 });
frame(1925, 1005, 2568, 1150);
title(2245, 1005, 'ENVELOPE 2');
frame(2577, 840, 2675, 1145);
title(2625, 843, 'REVERB');
frame(1925, 1157, 2460, 1318);
title(2190, 1160, 'ARP');
frame(2468, 1157, 2568, 1318);
title(2518, 1160, 'TEMPO');
frame(2577, 1157, 2675, 1478);
title(2625, 1160, 'CHORUS');
frame(1925, 1325, 2275, 1478);
title(2100, 1330, 'TRIGGERING');
frame(2283, 1325, 2565, 1478);
title(2425, 1330, 'VOICING');

// ── VOLUME, MASTER TUNE and GLIDE ─────────────────────────────────────────
knob('out.volume', 477, 922, '', {
  module: 'out',
  def: 7,
  name: 'VOLUME',
  help: 'The level at the outputs and headphones.',
});
knob('out.tune', 477, 1082, '', {
  module: 'out',
  min: -5,
  max: 5,
  name: 'MASTER TUNE',
  fmt: (v) => fmtSemi(tuneSemi(v)),
  help: 'Tunes the whole synth, here up to a semitone either way. On the hardware it is a global setting, kept with no patch.',
});
text(450, 1118, '−', 8);
text(503, 1118, '+', 8);
knob('kbd.glide', 477, 1247, '', {
  module: 'glide',
  name: 'GLIDE',
  fmt: (v) => (glideTime(v) ? fmtTime(glideTime(v)) : 'off'),
  help: 'Slides each note’s pitch from the one before, slower the further it is turned (here up to 3 s). At 0 notes jump straight to pitch.',
});
button('kbd.glideAuto', 477, 1307, {
  module: 'glide',
  name: 'GLIDE AUTO',
  help: 'Glides only between notes that overlap, so a phrase played legato slides and detached notes start clean.',
});
text(477, 1332, 'Auto', 7);

// ── PATCH ─────────────────────────────────────────────────────────────────
// The two columns of ten pick the tens and ones of a patch location: memory the app keeps as your sounds instead, so
// they are drawn but hold nothing.
for (let i = 0; i < 10; i++) {
  const y = 887 + i * 39.3;
  for (const bx of [590, 665])
    decor.push({
      t: 'rect',
      hw: true,
      x: X(bx) - 11,
      y: Y(y) - 6.5,
      w: 22,
      h: 13,
      r: 2,
      fill: '#141416',
    });
  text(628, y, String(i), 6.5);
}
const patchButton = (id: string, x: number, y: number, name: string, help: string): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 22,
    h: 13,
    kind: 'bool',
    def: false,
    ui: true,
    module: 'patch',
    labelPos: 'none',
    name,
    help,
  });
};
const PATCHES_HERE =
  'Here the patch memory is the app’s: load and save sounds from the sound list, and use the panel’s own reset to start again.';
patchButton(
  'ui.bankA',
  590,
  1307,
  'BANK A',
  `Picks bank A, the hundred factory patches (A00–A99), for the patch buttons above. With SHIFT it locks or unlocks the bank. ${PATCHES_HERE}`
);
patchButton(
  'ui.bankB',
  665,
  1307,
  'BANK B',
  `Picks bank B, the hundred user patches. ${PATCHES_HERE}`
);
text(590, 1332, 'A', 7);
text(628, 1332, 'Bank', 7);
text(665, 1332, 'B', 7);
patchButton(
  'ui.save',
  590,
  1372,
  'SAVE',
  `Stores the sound: SAVE, then the bank and the two digits, then SAVE again. ${PATCHES_HERE}`
);
text(590, 1396, 'Save', 7);
patchButton(
  'ui.init',
  665,
  1372,
  'INIT',
  `Starts again from the initial patch, a single sawtooth. With SHIFT it sets parameters (SET PARAMS). ${PATCHES_HERE}`
);
text(665, 1350, '[ Set Params ]', 6, { fill: GREEN });
text(665, 1396, 'Init', 7);
patchButton(
  'ui.shift',
  590,
  1434,
  'SHIFT / CANCEL',
  'Held for the second functions printed in green, or pressed to cancel a save. Nothing here needs it.'
);
text(590, 1412, '[ SHIFT ]', 6.5, { fill: GREEN });
text(590, 1458, 'Cancel', 6.5, { fill: GREEN });
patchButton(
  'ui.compare',
  665,
  1434,
  'COMPARE',
  `Swaps between the stored patch and your edit of it. With SHIFT it sets every parameter at random (RANDOM). ${PATCHES_HERE}`
);
text(665, 1412, '[ Random ]', 6, { fill: GREEN });
text(665, 1458, 'Compare', 7);

// ── OSCILLATOR 1 and 2 ────────────────────────────────────────────────────
const WAVES = [
  { v: 'sine', label: '', a: -125, shape: 'sine' as const, word: 'sine' },
  { v: 'triangle', label: '', a: -80, shape: 'tri' as const, word: 'triangle' },
  { v: 'saw', label: '', a: -35, shape: 'saw' as const, word: 'sawtooth' },
  { v: 'pulse', label: '', a: 10, shape: 'pulse' as const, word: 'pulse' },
  { v: 'organ', label: '', a: 55, shape: null, word: 'organ' },
  { v: 'wavetable', label: 'WT', a: 100, shape: null, word: 'wavetable' },
];
const OCTAVES = ['-3', '-2', '-1', '0', '+1', '+2'];
for (const n of [1, 2]) {
  const y = n === 1 ? 920 : 1083;
  const o = `osc${n}`;
  controls.push({
    id: `${o}.wave`,
    type: 'knob',
    x: X(778),
    y: Y(y),
    r: 13,
    style: 'neutron',
    kind: 'enum',
    options: WAVES.map(({ v, label, a }) => ({ v, label, a })),
    def: 'saw',
    fmt: (v) => WAVES.find((w) => w.v === v)?.word ?? String(v),
    module: 'osc',
    label: 'OSC Wave',
    labelPos: 'bottom',
    labelSize: 7.5,
    labelGap: 6,
    name: `OSC ${n} WAVE`,
    help: `Oscillator ${n}’s wave: sine, triangle, sawtooth, pulse, organ or a wavetable (WT). SHAPE then changes it.`,
  });
  for (const w of WAVES) {
    const rad = ((w.a - 90) * Math.PI) / 180;
    const gx = 778 + Math.cos(rad) * 40,
      gy = y + Math.sin(rad) * 40;
    if (w.shape) glyph(gx, gy, w.shape);
    else if (w.v === 'organ') text(gx, gy, 'ılı', 7);
  }
  knob(`${o}.shape`, 888, y, 'Shape', {
    module: 'osc',
    def: 5,
    name: `OSC ${n} SHAPE`,
    help: `Changes Oscillator ${n}’s wave. On the pulse it is the width, a square at the centre and thinner either way; on the triangle it leans it into a ramp; on the sine and organ it adds harmonics; on WT it sweeps through the table. On the sawtooth the guide does not say what it does, and here it does nothing.`,
  });
  knob(`${o}.shapeMod`, 990, y, 'Shape\nMod', {
    module: 'mod',
    min: -5,
    max: 5,
    name: `OSC ${n} SHAPE MOD`,
    help: `How far, and which way, the Osc${n} Shape mod route moves SHAPE: its SOURCE times its SCALE, chosen with the MOD ROUTES buttons. At the centre the route does nothing. It reaches the pulse’s width, the triangle’s lean and the wavetable.`,
  });
  knob(`${o}.pitchMod`, 1100, y, 'Pitch\nMod', {
    module: 'mod',
    min: -5,
    max: 5,
    name: `OSC ${n} PITCH MOD`,
    fmt: (v) => fmtSemi(pitchModSemi(v)),
    help: `How far, and which way, the Osc${n} Pitch mod route moves Oscillator ${n}’s pitch, up to two octaves (this app’s range). A little from an LFO is vibrato; from an envelope it is a pitch sweep on every note.`,
  });
  controls.push({
    id: `${o}.octave`,
    type: 'knob',
    x: X(1210),
    y: Y(y),
    r: 13,
    style: 'neutron',
    kind: 'enum',
    options: OCTAVES.map((v, i) => ({ v, label: v.replace('-', '−'), a: -120 + i * 48 })),
    def: '0',
    module: 'osc',
    label: 'Octave',
    labelPos: 'bottom',
    labelSize: 7.5,
    labelGap: 6,
    name: `OSC ${n} OCTAVE`,
    help: `Oscillator ${n}’s octave, from three below to two above.`,
  });
}
// OSC 1 SUB, and Oscillator 2's density and tuning
knob('sub.level', 780, 1242, 'Level', {
  module: 'osc',
  name: 'OSC 1 SUB LEVEL',
  help: 'Adds Oscillator 1’s wave an octave lower, for weight under the note. It goes with Oscillator 1 into OSC BALANCE.',
});
knob('osc2.density', 884, 1238, 'Density', {
  module: 'osc',
  name: 'DENSITY',
  help: 'Adds a second copy of Oscillator 2, slightly detuned against it, so the note thickens and beats like two oscillators.',
});
knob('osc2.densityRate', 992, 1238, 'Density\nRate', {
  module: 'osc',
  def: 3,
  name: 'DENSITY RATE',
  fmt: (v) => `${Math.round(densitySemi(v) * 100)} cents`,
  help: 'How far the density copy is detuned from Oscillator 2, and so how fast the two beat: slow and chorus-like low, sour and wide high (here up to half a semitone).',
});
knob('osc2.semitone', 1105, 1238, 'Semitone', {
  module: 'osc',
  min: -12,
  max: 12,
  step: 1,
  name: 'SEMITONE',
  fmt: (v) => fmtSemi(Math.round(v)),
  help: 'Tunes Oscillator 2 in semitones, an octave either way: 7 above is a fifth, 5 above a fourth.',
});
knob('osc2.cent', 1212, 1238, 'Cent', {
  module: 'osc',
  min: -5,
  max: 5,
  name: 'CENT',
  fmt: (v) => `${Math.round(v * 10)} cents`,
  help: 'Fine-tunes Oscillator 2 against Oscillator 1, here half a semitone either way: a few cents apart and the two beat slowly.',
});
knob('drift.amount', 780, 1400, 'Amount', {
  module: 'osc',
  name: 'OSC DRIFT AMOUNT',
  help: 'Lets the pitch wander a little at random, like an old analogue synth warming up. Here the whole voice drifts, rather than each oscillator on its own.',
});
text(890, 1340, 'Voice', 7);
led(862, 1362, { voice: 0 });
led(918, 1362, { voice: 1 });
text(862, 1383, '1', 7);
text(918, 1383, '2', 7);
led(891, 1430, 'gate');
text(891, 1458, 'Keyboard', 7);

// ── MIX ───────────────────────────────────────────────────────────────────
knob('mix.osc', 1320, 920, 'Osc\nBalance', {
  module: 'mixer',
  min: -5,
  max: 5,
  def: -5,
  name: 'OSC BALANCE (1 − 2)',
  help: 'Oscillator 1 (with its sub) against Oscillator 2 (with its density copy): fully left only 1, fully right only 2, both at the centre.',
});
text(1290, 967, '1', 7, { fill: GREEN });
text(1350, 967, '2', 7, { fill: GREEN });
knob('mix.noise', 1320, 1083, 'Noise\nBalance', {
  module: 'mixer',
  name: 'NOISE BALANCE (O − N)',
  help: 'The oscillators against white noise: at 0 the oscillators alone, at 10 noise alone.',
});
text(1290, 1130, 'O', 7, { fill: GREEN });
text(1350, 1130, 'N', 7, { fill: GREEN });
knob('mix.ring', 1320, 1238, 'RM\nBalance', {
  module: 'mixer',
  name: 'RM BALANCE (O+N − RM)',
  help: 'The oscillators and noise against the ring modulator (Oscillator 1 times Oscillator 2): at 0 no ring modulation, at 10 only it. Ring modulation gives bell and metal tones, clangier the further apart the two are tuned.',
});
text(1287, 1285, 'O+N', 6.5, { fill: GREEN });
text(1352, 1285, 'RM', 6.5, { fill: GREEN });

// ── LFO 1 and LFO 2 ───────────────────────────────────────────────────────
const LFO_WAVES = [
  { v: 'sine', a: -110, word: 'sine' },
  { v: 'triangle', a: -65, word: 'triangle' },
  { v: 'saw_down', a: -20, word: 'falling sawtooth' },
  { v: 'saw_up', a: 25, word: 'rising sawtooth' },
  { v: 'square', a: 70, word: 'square' },
  { v: 'sample_hold', a: 115, word: 'sample and hold' },
];
const LFO_GLYPH: Record<string, WaveShape> = {
  sine: 'sine',
  triangle: 'tri',
  saw_down: 'rsaw',
  saw_up: 'saw',
  square: 'sq',
  sample_hold: 'noise',
};
const LFO_SYNC = [
  { v: 'free', label: 'free' },
  { v: 'sync', label: 'sync' },
  { v: 'one_shot', label: 'one shot' },
];
for (const n of [1, 2]) {
  const cx = n === 1 ? 1430 : 1540;
  const l = `lfo${n}`;
  knob(`${l}.fade`, cx, 920, 'Fade', {
    module: 'lfo',
    min: -5,
    max: 5,
    name: `LFO ${n} FADE`,
    fmt: (v) => (v < 0 ? `in ${fmtTime(fadeTime(v))}` : v > 0 ? 'out' : 'none'),
    help: `Fades LFO ${n} in after each note (turned towards IN), or out (towards OUT); at the centre it is at full depth all the time. Here it fades in over up to 8 s; fading out is not modelled.`,
  });
  text(cx - 32, 967, 'In', 7, { fill: GREEN });
  text(cx + 32, 967, 'Out', 7, { fill: GREEN });
  controls.push({
    id: `${l}.wave`,
    type: 'knob',
    x: X(cx),
    y: Y(1083),
    r: 13,
    style: 'neutron',
    kind: 'enum',
    options: LFO_WAVES.map(({ v, a }) => ({ v, label: '', a })),
    def: 'triangle',
    fmt: (v) => LFO_WAVES.find((w) => w.v === v)?.word ?? String(v),
    module: 'lfo',
    label: 'LFO Wave',
    labelPos: 'bottom',
    labelSize: 7.5,
    labelGap: 6,
    name: `LFO ${n} WAVE`,
    help: `LFO ${n}’s shape: sine, triangle, falling or rising sawtooth, square, or sample and hold (a new random level each cycle).`,
  });
  for (const w of LFO_WAVES) {
    const rad = ((w.a - 90) * Math.PI) / 180;
    glyph(cx + Math.cos(rad) * 38, 1083 + Math.sin(rad) * 38, LFO_GLYPH[w.v]);
  }
  controls.push({
    id: `${l}.sync`,
    type: 'button',
    x: X(cx),
    y: Y(1163),
    w: 22,
    h: 13,
    lamp: 'red',
    kind: 'enum',
    options: LFO_SYNC,
    def: 'free',
    module: 'lfo',
    labelPos: 'none',
    name: `LFO ${n} SYNC`,
    help: `Steps LFO ${n} through free running, synced to the tempo (RATE then picks a division of BPM), and one shot. One shot is not modelled here: the LFO keeps running.`,
  });
  text(cx, 1190, 'Sync', 7);
  knob(`${l}.rate`, cx, 1238, 'Rate', {
    module: 'lfo',
    def: 5,
    name: `LFO ${n} RATE`,
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `LFO ${n}’s speed, from a slow sweep to a buzz (here 0.05 Hz to 50 Hz). With SYNC lit it picks a division of the tempo instead, from four bars to a 32nd.`,
  });
  led(cx, 1303, n === 1 ? 'lfo' : undefined);
}

// ── FILTER ────────────────────────────────────────────────────────────────
knob('vcf.keytrack', 1650, 920, 'Key Track', {
  module: 'filter',
  name: 'KEY TRACK',
  help: 'How far the cutoff follows the keyboard: at 10 it moves an octave for every octave played, so high notes stay as bright as low ones.',
});
knob('vcf.cutoffMod', 1760, 920, 'Freq\nMod', {
  module: 'mod',
  min: -5,
  max: 5,
  name: 'CUT OFF MOD',
  fmt: (v) => `${cutModOct(v) >= 0 ? '+' : '−'}${Math.abs(cutModOct(v)).toFixed(1)} oct`,
  help: 'How far, and which way, the Filter Freq mod route moves the cutoff, up to six octaves: Envelope 1 here is the classic filter sweep on every note.',
});
knob('vcf.widthMod', 1870, 920, 'Width\nMod', {
  module: 'mod',
  min: -5,
  max: 5,
  name: 'WIDTH MOD',
  help: 'How far, and which way, the Filter Width mod route moves WIDTH, up to four octaves. It changes the sound only in Wide Band (and Wide Notch on the hardware).',
});
const FILTER_MODES = [
  { v: 'LP12', label: 'LP12' },
  { v: 'BP12', label: 'BP12' },
  { v: 'HP12', label: 'HP12' },
  { v: 'LP24', label: 'LP24' },
  { v: 'BP24', label: 'BP24' },
  { v: 'HP24', label: 'HP24' },
  { v: 'wide_band', label: 'Wide Band' },
  { v: 'wide_notch', label: 'Wide Notch' },
];
FILTER_MODES.forEach((m, i) => {
  const y = 1027 + i * 20;
  led(1633, y, { id: 'vcf.mode', eq: m.v });
  text(1645, y, m.label, 6.5, { anchor: 'start' });
});
line(1690, 1027, 1697, 1027);
line(1697, 1027, 1697, 1067);
line(1690, 1067, 1697, 1067);
text(1700, 1047, 'Duophonic', 6.5, { anchor: 'start' });
controls.push({
  id: 'vcf.mode',
  type: 'button',
  x: X(1648),
  y: Y(1243),
  w: 22,
  h: 13,
  lit: 'always',
  lamp: 'red',
  kind: 'enum',
  options: FILTER_MODES,
  def: 'LP12',
  module: 'filter',
  labelPos: 'none',
  name: 'FILTER MODE',
  help: 'Steps through the filter’s eight types, shown by the lights: low-pass, band-pass and high-pass at 12 dB (gentle) or 24 dB (steep), then Wide Band and Wide Notch, where two filters are set apart by WIDTH.',
});
text(1648, 1268, 'Mode', 7);
knob('vcf.drive', 1762, 1078, 'Drive', {
  module: 'filter',
  name: 'DRIVE',
  help: 'Drives the filter’s input harder, from a little warmth to a thick, saturated sound.',
});
knob('vcf.width', 1870, 1078, 'Width', {
  module: 'filter',
  def: 3,
  name: 'WIDTH',
  fmt: (v) => `${widthOct(v).toFixed(1)} oct`,
  help: 'How far apart the two filters are set. In Wide Band it is how wide the band is: narrow and vocal at 0, wide open at 10. In the other types it does nothing here.',
});
knob('vcf.res', 1758, 1238, 'Resonance', {
  module: 'filter',
  name: 'RESONANCE',
  help: 'Rings the filter at the cutoff, a sharper, more whistling peak the higher it goes. In the 12 dB types it whistles on its own near the top.',
});
knob('vcf.cutoff', 1870, 1238, 'Frequency', {
  module: 'filter',
  def: 10,
  name: 'CUT OFF',
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter acts: the cutoff of the low-pass and high-pass, the centre of the band-pass, or the middle of Wide Band and Wide Notch.',
});

// ── MOD ROUTES ────────────────────────────────────────────────────────────
// CONTROL picks the route the panel is showing; SOURCE and SCALE show that route's choices. Every route keeps its
// own, whichever is on show.
const ROUTES = [
  { v: 'osc1Shape', label: 'Osc1 Shape', x: 1105, y: 1372, knob: 'osc1.shapeMod' },
  { v: 'osc1Pitch', label: 'Osc1 Pitch', x: 1182, y: 1372, knob: 'osc1.pitchMod' },
  { v: 'cutoff', label: 'Filter Freq', x: 1260, y: 1372, knob: 'vcf.cutoffMod' },
  { v: 'osc2Shape', label: 'Osc2 Shape', x: 1105, y: 1435, knob: 'osc2.shapeMod' },
  { v: 'osc2Pitch', label: 'Osc2 Pitch', x: 1182, y: 1435, knob: 'osc2.pitchMod' },
  { v: 'width', label: 'Filter Width', x: 1260, y: 1435, knob: 'vcf.widthMod' },
];
const SOURCES = [
  { v: 'env1', label: 'Env 1', x: 1408, y: 1372 },
  { v: 'lfo1', label: 'LFO 1', x: 1480, y: 1372 },
  { v: 'note', label: 'Note', x: 1557, y: 1372 },
  { v: 'env2', label: 'Env 2', x: 1408, y: 1435 },
  { v: 'lfo2', label: 'LFO 2', x: 1480, y: 1435 },
  { v: 'full_on', label: 'Full On', x: 1557, y: 1435 },
];
const SCALES = [
  { v: 'joy_x', label: 'Joystick X', x: 1713, y: 1372 },
  { v: 'joy_y', label: 'Joystick Y', x: 1790, y: 1372 },
  { v: 'aftertouch', label: 'Aftertouch', x: 1868, y: 1372 },
  { v: 'velocity', label: 'Velocity', x: 1713, y: 1435 },
  { v: 'pedal', label: 'Pedal', x: 1790, y: 1435 },
  { v: 'full_on', label: 'Full On', x: 1868, y: 1435 },
];
/** Each route's source before anyone changes it (the guide does not give the initial patch's: this app's choice). */
const ROUTE_SOURCE: Record<string, string> = {
  osc1Shape: 'lfo1',
  osc1Pitch: 'lfo1',
  cutoff: 'env2',
  osc2Shape: 'lfo2',
  osc2Pitch: 'lfo1',
  width: 'lfo2',
};
for (const b of [...ROUTES, ...SOURCES, ...SCALES]) text(b.x, b.y + 26, b.label, 6.5);
controls.push({
  id: 'route.edit',
  type: 'select',
  x: X(ROUTES[0].x),
  y: Y(ROUTES[0].y),
  w: 22,
  h: 13,
  lamp: 'red',
  kind: 'enum',
  options: ROUTES.map((r) => ({ v: r.v, label: r.label, x: X(r.x), y: Y(r.y) })),
  def: 'cutoff',
  ui: true,
  module: 'mod',
  labelPos: 'none',
  name: 'MOD ROUTES CONTROL',
  help: 'Picks which of the six mod routes the SOURCE and SCALE buttons show and set. Each control (an oscillator’s shape or pitch, the filter’s frequency or width) has one route; its depth is that control’s MOD knob.',
});
const routeLabel = (v: string): string => ROUTES.find((r) => r.v === v)?.label ?? v;
for (const r of ROUTES) {
  const show = { id: 'route.edit', eq: r.v };
  controls.push({
    id: `route.${r.v}.source`,
    type: 'select',
    x: X(SOURCES[0].x),
    y: Y(SOURCES[0].y),
    w: 22,
    h: 13,
    lamp: 'red',
    kind: 'enum',
    options: SOURCES.map((s) => ({ v: s.v, label: s.label, x: X(s.x), y: Y(s.y) })),
    def: ROUTE_SOURCE[r.v],
    module: 'mod',
    labelPos: 'none',
    name: `${r.label} SOURCE`,
    show,
    help: `What moves ${routeLabel(r.v)}, at the depth of its MOD knob: Envelope 1 or 2, LFO 1 or 2, the note played (higher notes move it further), or Full On, a fixed offset.`,
  });
  controls.push({
    id: `route.${r.v}.scale`,
    type: 'select',
    x: X(SCALES[0].x),
    y: Y(SCALES[0].y),
    w: 22,
    h: 13,
    lamp: 'red',
    kind: 'enum',
    options: SCALES.map((s) => ({ v: s.v, label: s.label, x: X(s.x), y: Y(s.y) })),
    def: 'full_on',
    module: 'mod',
    labelPos: 'none',
    name: `${r.label} SCALE`,
    show,
    help: `What the ${routeLabel(r.v)} source is multiplied by: the joystick left-right or up-down, aftertouch, velocity, the pedal, or Full On (the source as it is). Here the app’s mod wheel stands in for aftertouch and the pedal.`,
  });
}

// ── ENVELOPE 1 and 2 ──────────────────────────────────────────────────────
for (const n of [1, 2]) {
  const e = `env${n}`;
  const y = n === 1 ? 920 : 1080;
  button(`${e}.repeat`, 2248, n === 1 ? 865 : 1025, {
    module: 'env',
    name: `ENV ${n} REPEAT`,
    help: `Loops Envelope ${n} while a key is held: it rises over ATTACK, falls away over DECAY, and starts again, so ${n === 1 ? 'the loudness pulses' : 'whatever it moves throbs'} at a speed the two set. SUSTAIN is then not used.`,
  });
  text(2248, n === 1 ? 887 : 1047, 'Repeat', 7);
  knob(`${e}.velocity`, 1966, y, 'Velocity', {
    module: 'env',
    min: -5,
    max: 5,
    name: `ENV ${n} VELOCITY`,
    help:
      n === 1
        ? 'How far key velocity sets the envelope’s height, and so the loudness: turned right, harder notes are louder; left, harder notes are quieter; at the centre every note is the same.'
        : 'How far key velocity sets Envelope 2’s height, and so how far it moves what it modulates: right, harder notes move it further; left, less far.',
  });
  text(1934, y + 47, '−', 7, { fill: GREEN });
  text(1998, y + 47, '+', 7, { fill: GREEN });
  knob(`${e}.sustFall`, 2077, y, 'Sust Fall', {
    module: 'env',
    name: `ENV ${n} SUST FALL`,
    help: `On the hardware, makes Envelope ${n}’s sustain sink while the key is held, like a piano note dying away, faster the further it is turned. Not modelled here: the sustain holds.`,
  });
  knob(`${e}.attack`, 2188, y, 'Attack', {
    module: 'env',
    fmt: (v) => fmtTime(attTime(v)),
    name: `ENV ${n} ATTACK`,
    help: `How long Envelope ${n} takes to rise when a key is pressed (here 1 ms to 10 s).`,
  });
  knob(`${e}.decay`, 2299, y, 'Decay', {
    module: 'env',
    def: 5,
    fmt: (v) => fmtTime(decTime(v)),
    name: `ENV ${n} DECAY`,
    help: `How long Envelope ${n} takes to fall from its peak to the sustain level.`,
  });
  knob(`${e}.sustain`, 2410, y, 'Sustain', {
    module: 'env',
    def: n === 1 ? 10 : 5,
    name: `ENV ${n} SUSTAIN`,
    help: `The level Envelope ${n} holds while the key stays down.`,
  });
  knob(`${e}.release`, 2521, y, 'Release', {
    module: 'env',
    def: 2,
    fmt: (v) => fmtTime(relTime(v)),
    name: `ENV ${n} RELEASE`,
    help: `How long Envelope ${n} takes to fall away after the key is let go.`,
  });
}

// ── REVERB and CHORUS ─────────────────────────────────────────────────────
knob('fx.reverbLevel', 2627, 920, 'Level', {
  module: 'fx',
  name: 'REVERB LEVEL',
  help: 'How much reverb is added, from none to a deep wash.',
});
button('fx.reverbLpf', 2600, 1005, {
  module: 'fx',
  name: 'REVERB LPF',
  help: 'Darkens the reverb by filtering the treble out of it, so it sits behind the sound.',
});
button('fx.reverbHpf', 2653, 1005, {
  module: 'fx',
  name: 'REVERB HPF',
  help: 'Takes the bass out of the reverb, so low notes stay clear.',
});
text(2600, 1028, 'LPF', 7);
text(2653, 1028, 'HPF', 7);
knob('fx.reverbTime', 2627, 1078, 'Time', {
  module: 'fx',
  def: 5,
  name: 'REVERB TIME',
  fmt: (v) => fmtTime(reverbTime(v)),
  help: 'How long the reverb takes to die away (here 0.3 s to 12 s).',
});
knob('fx.chorusLevel', 2628, 1238, 'Level', {
  module: 'fx',
  name: 'CHORUS LEVEL',
  help: 'How much chorus is mixed in: a slow, wide shimmer that thickens the sound and spreads it across the two outputs.',
});
const CHORUS_TYPES = ['1', '2', '3', '4'];
CHORUS_TYPES.forEach((t, i) => {
  const y = 1303 + i * 24;
  led(2627, y, { id: 'fx.chorusType', eq: t });
  text(2642, y, t, 6.5, { anchor: 'start' });
});
controls.push({
  id: 'fx.chorusType',
  type: 'button',
  x: X(2627),
  y: Y(1433),
  w: 22,
  h: 13,
  lit: 'always',
  lamp: 'red',
  kind: 'enum',
  options: CHORUS_TYPES.map((v) => ({ v, label: v })),
  def: '1',
  module: 'fx',
  labelPos: 'none',
  name: 'CHORUS MODE',
  help: 'Steps through the four chorus types, shown by the lights. The guide does not describe them; here they run from a slow, gentle chorus (1) to a fast, deep one (4).',
});
text(2627, 1458, 'Mode', 7);

// ── ARP and TEMPO ─────────────────────────────────────────────────────────
controls.push({
  id: 'arp.tap',
  type: 'button',
  x: X(1975),
  y: Y(1242),
  w: 22,
  h: 13,
  kind: 'bool',
  def: false,
  ui: true,
  module: 'mode',
  labelPos: 'none',
  name: 'TAP TEMPO',
  help: 'On the hardware, tapped in time to set the tempo. Here set it with BPM.',
});
text(1975, 1270, 'Tap', 7);
text(1975, 1284, 'Tempo', 7);
// the positions are printed round the knob as on the panel, not by the knob itself
const ARP_MODES = [
  { v: 'up', label: '', a: -135, word: 'Up', tx: 2045, ty: 1258 },
  { v: 'down', label: '', a: -90, word: 'Down', tx: 2035, ty: 1230 },
  { v: 'updown1', label: '', a: -40, word: 'UpDown1', tx: 2053, ty: 1205 },
  { v: 'updown2', label: '', a: 40, word: 'UpDown2', tx: 2133, ty: 1205 },
  { v: 'play', label: '', a: 90, word: 'Play', tx: 2143, ty: 1230 },
  { v: 'random', label: '', a: 135, word: 'Rndm', tx: 2135, ty: 1258 },
];
for (const m of ARP_MODES) text(m.tx, m.ty, m.word, 6.5);
controls.push({
  id: 'arp.mode',
  type: 'knob',
  x: X(2090),
  y: Y(1242),
  r: 13,
  style: 'neutron',
  kind: 'enum',
  options: ARP_MODES.map(({ v, label, a }) => ({ v, label, a })),
  def: 'up',
  fmt: (v) => ARP_MODES.find((m) => m.v === v)?.word ?? String(v),
  module: 'mode',
  label: 'Arp Mode',
  labelPos: 'bottom',
  labelSize: 7.5,
  labelGap: 6,
  name: 'ARP MODE',
  help: 'The order the arpeggiator plays the held notes: up, down, up and down (two ways), in the order they were played, or at random. The guide does not say how UpDown 2 differs from UpDown 1; here both go up and then down.',
});
controls.push({
  id: 'arp.octaves',
  type: 'knob',
  x: X(2194),
  y: Y(1242),
  r: 13,
  style: 'neutron',
  kind: 'enum',
  options: ['1', '2', '3', '4', '5', '6'].map((v, i) => ({ v, label: v, a: -135 + i * 54 })),
  def: '1',
  module: 'mode',
  label: 'Octave',
  labelPos: 'bottom',
  labelSize: 7.5,
  labelGap: 6,
  name: 'ARP OCTAVES',
  help: 'How many octaves the arpeggio climbs through before it starts again, from one to six.',
});
knob('arp.swing', 2308, 1238, 'Swing', {
  module: 'mode',
  min: -5,
  max: 5,
  name: 'ARP SWING',
  help: 'On the hardware, swings the arpeggio, delaying every other note (or hurrying it, turned left). Not modelled here: the notes stay even.',
});
text(2276, 1285, '−', 7, { fill: GREEN });
text(2340, 1285, '+', 7, { fill: GREEN });
knob('arp.sync', 2415, 1238, 'Sync', {
  module: 'mode',
  def: 7.5,
  name: 'ARP SYNC',
  fmt: (v) => `1/${arpDiv(v)}`,
  help: 'How long each arpeggio note is, as a division of the bar at BPM: a half note (2nd) to a 32nd.',
});
text(2378, 1285, '2nd', 6.5, { fill: GREEN });
text(2452, 1285, '32nd', 6.5, { fill: GREEN });
knob('arp.bpm', 2520, 1238, 'BPM', {
  module: 'mode',
  def: 5,
  name: 'TEMPO (BPM)',
  fmt: (v) => `${Math.round(bpmOf(v))} BPM`,
  help: 'The tempo for the arpeggiator and for the LFOs when they are synced (here 40 to 240 BPM). On the hardware it follows MIDI or USB clock when one is playing.',
});
led(2518, 1303, 'lfo');

// ── TRIGGERING ────────────────────────────────────────────────────────────
const TRIG: [id: string, x: number, l1: string, l2: string, help: string][] = [
  [
    'env1.legato',
    1975,
    'Env 1',
    'Legato',
    'Envelope 1 starts again only on a note played after the keys have been let go: notes played legato carry on from where it is, so a phrase is one swell.',
  ],
  [
    'env2.legato',
    2052,
    'Env 2',
    'Legato',
    'Envelope 2 starts again only on a note played after the keys have been let go. Here it follows ENV 1 LEGATO: the engine fires both envelopes together.',
  ],
  [
    'lfo1.keytrig',
    2142,
    'LFO 1',
    'Keytrig',
    'Starts LFO 1 from the beginning of its cycle on every note, so each note gets the same wobble.',
  ],
  [
    'lfo2.keytrig',
    2222,
    'LFO 2',
    'Keytrig',
    'Starts LFO 2 from the beginning of its cycle on every note.',
  ],
];
for (const [id, x, l1, l2, help] of TRIG) {
  button(id, x, 1405, {
    module: id.startsWith('env') ? 'env' : 'lfo',
    name: `${l1} ${l2}`.toUpperCase(),
    help,
  });
  text(x, 1430, l1, 7);
  text(x, 1444, l2, 7);
}

// ── VOICING ───────────────────────────────────────────────────────────────
controls.push({
  id: 'kbd.voicing',
  type: 'select',
  x: X(2342),
  y: Y(1403),
  w: 22,
  h: 13,
  lamp: 'red',
  kind: 'enum',
  options: [
    { v: 'mono', label: 'Mono', hide: true },
    { v: 'duo', label: 'Duo', x: X(2342), y: Y(1403) },
    { v: 'quad', label: 'Quad', x: X(2425), y: Y(1403) },
  ],
  offValue: 'mono',
  def: 'quad',
  module: 'mode',
  labelPos: 'none',
  name: 'VOICING',
  help: 'How many notes play at once: Mono (both off), Duophonic (MONO / DUO lit: two notes, one on each of the two analogue paths) or Quad (four). Pressing the lit one again goes back to Mono.',
});
text(2342, 1376, 'POLYPHONIC', 6, { weight: 700 });
text(2425, 1376, 'PARAPHONIC', 6, { weight: 700 });
text(2342, 1430, 'Mono / Duo', 7);
text(2425, 1430, 'Quad', 7);
knob('kbd.voicePan', 2520, 1403, 'Voice Pan', {
  module: 'mode',
  name: 'VOICE SPREAD',
  help: 'On the hardware, spreads the voices across the stereo outputs, wider the further it is turned. Not modelled here: the voices are in the middle (the chorus and reverb are still stereo).',
});

// ── Left-hand controller and the keys ─────────────────────────────────────
decor.push({
  t: 'rect',
  x: X(130),
  y: Y(1585),
  w: 300 * K,
  h: 565 * K,
  r: 3,
  fill: '#3a3b3e',
  hw: true,
});
const padButton = (
  id: string,
  x: number,
  y: number,
  rest: Omit<ControlCommon, 'id' | 'x' | 'y'> & { def?: boolean; ui?: boolean }
): void => {
  const { def = false, ...common } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 34,
    h: 34,
    kind: 'bool',
    def,
    labelPos: 'none',
    ...common,
  });
};
padButton('arp.on', 220, 1810, {
  module: 'mode',
  name: 'ARP',
  help: 'Starts and stops the arpeggiator: held keys play one after another at the tempo and SYNC division. On the hardware, with SHIFT it switches Duophonic on (DUO).',
});
led(220, 1765, { id: 'arp.on', eq: true });
text(220, 1750, '[ Duo ]', 6, { fill: GREEN });
text(220, 1852, 'Arp', 7);
padButton('arp.set', 337, 1810, {
  module: 'mode',
  ui: true,
  name: 'MODE / SET ARP',
  help: 'On the hardware, sets the arpeggiator from the keys. Here the ARP section’s knobs set it.',
});
led(337, 1765);
text(337, 1852, 'Mode / Set Arp', 7);
padButton('kbd.octDown', 220, 1915, {
  module: 'mode',
  ui: true,
  name: 'OCTAVE −',
  help: 'Moves the keyboard down an octave. The on-screen keyboard has its own octave buttons here.',
});
padButton('kbd.octUp', 337, 1915, {
  module: 'mode',
  ui: true,
  name: 'OCTAVE +',
  help: 'Moves the keyboard up an octave. The on-screen keyboard has its own octave buttons here.',
});
text(278, 1915, 'Octave', 7);
text(220, 1958, '−', 9);
text(337, 1958, '+', 9);
for (const lx of [205, 248, 332, 362]) led(lx, 1868);
const joyFmt = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: X(270),
    y: Y(2025),
    r: 30,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: joyFmt,
    help: 'The joystick. Left and right bend the pitch; up adds vibrato. Both directions are also SCALE choices for the mod routes (Joystick X and Y). Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: X(270),
    y: Y(2025) + 1,
    r: 30,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: joyFmt,
    help: 'The joystick’s up-down movement: up adds vibrato, and it is Joystick Y for the mod routes.',
  }
);
button('kbd.hold', 275, 2105, {
  module: 'mode',
  name: 'HOLD (joystick click)',
  help: 'Latches the held notes, so an arpeggio keeps playing after the keys are let go. On the hardware this is a click of the joystick, and its light shows it is on.',
});
text(278, 2127, 'Hold', 7);
// the tops of the keys: 37 keys from C, 22 white
{
  const x0 = 440,
    x1 = 2870,
    top = 1585,
    bottom = 2150,
    kw = (x1 - x0) / 22;
  for (let i = 0; i < 22; i++)
    decor.push({
      t: 'rect',
      hw: true,
      x: X(x0 + i * kw + 3),
      y: Y(top),
      w: (kw - 6) * K,
      h: (bottom - top) * K,
      r: 2,
      fill: '#f4f4f0',
    });
  const after = [0, 1, 3, 4, 5]; // black keys after C, D, F, G and A
  for (let i = 0; i < 21; i++)
    if (after.includes(i % 7))
      decor.push({
        t: 'rect',
        hw: true,
        x: X(x0 + (i + 1) * kw - 32),
        y: Y(top),
        w: 64 * K,
        h: 430 * K,
        r: 2,
        fill: '#111113',
      });
}

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'out',
    label: 'Volume, tune and glide',
    module: 'out',
    keywords: 'volume master tune tuning glide portamento auto legato',
    rects: [R(422, 835, 532, 1347)],
    help: 'VOLUME sets the outputs, MASTER TUNE tunes the whole synth, and GLIDE slides between notes (AUTO: only between overlapping ones).',
  },
  {
    id: 'patch',
    label: 'Patches',
    module: 'patch',
    keywords: 'patch memory bank save init compare random shift',
    rects: [R(532, 835, 728, 1483)],
    help: 'Two hundred patches, in two banks of a hundred: pick the bank, then the tens and the ones. INIT starts from a single sawtooth, and SHIFT with COMPARE sets everything at random. Here the patch memory is the app’s sound list.',
  },
  {
    id: 'osc1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'oscillator wave sine triangle saw pulse organ wavetable shape octave sub',
    rects: [R(728, 835, 1265, 993), R(728, 1165, 835, 1318)],
    help: 'Oscillator 1: WAVE picks sine, triangle, sawtooth, pulse, organ or a wavetable, SHAPE changes it, and OCTAVE sets its range. SHAPE MOD and PITCH MOD set the depth of its two mod routes. OSC 1 SUB adds its wave an octave lower.',
  },
  {
    id: 'osc2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'oscillator wave shape octave density detune semitone cent tune',
    rects: [R(728, 993, 1265, 1165), R(835, 1165, 1265, 1318)],
    help: 'Oscillator 2, with the same controls as Oscillator 1, plus SEMITONE and CENT to tune it against Oscillator 1 and DENSITY, a detuned copy of it that thickens the note (DENSITY RATE sets how far apart they are).',
  },
  {
    id: 'drift',
    label: 'Drift and voice lights',
    module: 'osc',
    keywords: 'drift random pitch voice keyboard lights',
    rects: [R(728, 1318, 945, 1483)],
    help: 'OSC DRIFT lets the pitch wander a little at random. The lights show which of the two voice paths is playing, and when a key is down.',
  },
  {
    id: 'mix',
    label: 'Mix',
    module: 'mixer',
    keywords: 'mixer balance noise ring modulator rm',
    rects: [R(1265, 835, 1376, 1320)],
    help: 'Three balances in a row: Oscillator 1 against 2, the oscillators against noise, then all that against the ring modulator (Oscillator 1 times 2).',
  },
  ...[1, 2].map((n): Area => ({
    id: `lfo${n}`,
    label: `LFO ${n}`,
    module: 'lfo',
    keywords: 'lfo wave rate fade sync tempo vibrato wobble',
    rects: [n === 1 ? R(1376, 835, 1486, 1320) : R(1486, 835, 1596, 1320)],
    help: `LFO ${n}: WAVE picks its shape, RATE its speed (or with SYNC a division of the tempo), and FADE brings it in after each note. It moves nothing until it is the SOURCE of a mod route.`,
  })),
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords:
      'filter low-pass band-pass high-pass notch wide band width resonance drive cutoff key track oscar',
    rects: [R(1596, 835, 1920, 1320)],
    help: 'The dual filter: MODE steps through low-pass, band-pass and high-pass at 12 or 24 dB, Wide Band and Wide Notch. FREQUENCY and RESONANCE set it, WIDTH sets the gap between its two filters, DRIVE saturates it and KEY TRACK makes it follow the keys. FREQ MOD and WIDTH MOD are the depths of their mod routes.',
  },
  {
    id: 'routes',
    label: 'Mod routes',
    module: 'mod',
    keywords:
      'mod routes modulation matrix source scale joystick aftertouch velocity pedal envelope lfo',
    rects: [R(945, 1323, 1920, 1483)],
    help: 'Six mod routes, one per control: pick the CONTROL, then its SOURCE, then a SCALE to multiply it by (Full On for none). Its depth is the control’s own MOD knob.',
  },
  ...[1, 2].map((n): Area => ({
    id: `env${n}`,
    label: `Envelope ${n}`,
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release velocity repeat loop',
    rects: [n === 1 ? R(1920, 835, 2572, 1000) : R(1920, 1000, 2572, 1153)],
    help:
      n === 1
        ? 'Envelope 1 is the loudness (AMPLITUDE): an ADSR with VELOCITY, SUST FALL and REPEAT. It is also a mod route SOURCE.'
        : 'Envelope 2: an ADSR with VELOCITY, SUST FALL and REPEAT. It moves nothing until it is the SOURCE of a mod route.',
  })),
  {
    id: 'reverb',
    label: 'Reverb',
    module: 'fx',
    keywords: 'reverb level time lpf hpf effects space',
    rects: [R(2572, 835, 2680, 1150)],
    help: 'A digital reverb on the whole sound: LEVEL, TIME and two filters on it, LPF and HPF.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator and tempo',
    module: 'mode',
    keywords: 'arpeggiator arp mode octave swing sync tempo bpm tap',
    rects: [R(1920, 1153, 2572, 1320)],
    help: 'The arpeggiator’s order, range, swing and note length (SYNC), and the tempo it and the synced LFOs follow.',
  },
  {
    id: 'chorus',
    label: 'Chorus',
    module: 'fx',
    keywords: 'chorus level mode stereo effects',
    rects: [R(2572, 1153, 2680, 1483)],
    help: 'A stereo chorus on the whole sound: LEVEL and four types.',
  },
  {
    id: 'triggering',
    label: 'Triggering',
    module: 'env',
    keywords: 'triggering legato keytrig retrigger',
    rects: [R(1920, 1320, 2279, 1483)],
    help: 'Whether the envelopes start again on legato notes, and whether the LFOs restart on each note.',
  },
  {
    id: 'voicing',
    label: 'Voicing',
    module: 'mode',
    keywords: 'voicing mono duophonic quad polyphonic voices spread pan',
    rects: [R(2279, 1320, 2572, 1483)],
    help: 'Mono, Duophonic (two notes, each with its own path) or Quad (four), and VOICE SPREAD across the stereo outputs.',
  },
  {
    id: 'perf',
    label: 'Arp, octave and joystick',
    module: 'mod',
    keywords: 'joystick bend vibrato hold latch octave arpeggiator',
    rects: [R(125, 1580, 435, 2155)],
    help: 'Beside the keys: ARP starts the arpeggiator, OCTAVE moves the keys, and the joystick bends the pitch (left and right) and adds vibrato (up). A click holds the notes.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const SOURCE_SIG: Record<string, string> = {
  env1: 'env1',
  lfo1: 'lfo',
  note: 'kbd',
  env2: 'env2',
  lfo2: 'lfo2',
  full_on: 'one',
};
/** The engine has no aftertouch or pedal: the app's mod wheel stands in for both. */
const SCALE_SIG: Record<string, string | null> = {
  joy_x: 'joyX',
  joy_y: 'joyY',
  aftertouch: 'wheel',
  velocity: 'vel',
  pedal: 'wheel',
  full_on: null,
};
const LFO_MIX: Record<string, EngineParams['lfo']['mix']> = {
  sine: { sine: 1 },
  triangle: { tri: 1 },
  saw_down: { rsaw: 1 },
  saw_up: { saw: 1 },
  square: { sq: 1 },
  sample_hold: { sh: 1 },
};
const reverbTime = (v: number): number => expMap(v / 10, 0.3, 12);
/** Chorus types 1–4 (undocumented): speed in Hz and depth in %. */
const CHORUS: Record<string, [spd: number, width: number]> = {
  '1': [0.3, 25],
  '2': [0.6, 40],
  '3': [1.2, 55],
  '4': [3, 70],
};

/** One oscillator's wave and shape, in the engine's terms. */
function oscWave(v: ControlValues, n: number): Omit<OscParams, 'level' | 'semi'> {
  const s = clamp(num(v, `osc${n}.shape`), 0, 10) / 10;
  switch (v[`osc${n}.wave`]) {
    case 'sine':
      return { mix: { sine: 1 }, sineShape: s * 0.8 };
    case 'organ':
      return { mix: { sine: 1 }, sineShape: 0.35 + s * 0.65 };
    case 'triangle':
      // the triangle's lean is the morph from triangle (0) towards the sawtooth (0.5), so SHAPE MOD can move it
      return { morph: s * 0.5 };
    case 'pulse':
      return { mix: { pulse: 1 }, pw: pulseWidth(s * 10) };
    case 'wavetable':
      return { morph: s };
    default:
      return { mix: { saw: 1 } };
  }
}

function toEngine(v: ControlValues, _ctx: EngineContext): EngineParams {
  const routes: EngineRoute[] = [];
  /** An envelope as a source, with its VELOCITY knob: −1..1 of the way to following the key velocity. */
  const envParts = (n: number): [string, number][] => {
    const vel = bip(num(v, `env${n}.velocity`));
    if (vel >= 1) return [[`env${n}v`, 1]];
    if (vel > 0)
      return [
        [`env${n}`, 1 - vel],
        [`env${n}v`, vel],
      ];
    if (vel < 0)
      return [
        [`env${n}`, 1],
        [`env${n}v`, vel],
      ];
    return [[`env${n}`, 1]];
  };
  /** One mod route: its SOURCE (times its SCALE) into each destination at its amount. */
  const modRoute = (r: string, dsts: [dst: string, amt: number][]): void => {
    const src = String(v[`route.${r}.source`]);
    const by = SCALE_SIG[String(v[`route.${r}.scale`])] ?? undefined;
    const parts: [string, number][] =
      src === 'env1' ? envParts(1) : src === 'env2' ? envParts(2) : [[SOURCE_SIG[src], 1]];
    for (const [dst, amt] of dsts)
      for (const [sig, k] of parts)
        if (amt * k) routes.push({ src: sig, dst, amt: amt * k, ...(by ? { by } : {}) });
  };
  // SHAPE MOD reaches the pulse width or the morph, whichever the wave uses
  for (const n of [1, 2]) {
    const wave = v[`osc${n}.wave`];
    const d = num(v, `osc${n}.shapeMod`);
    if (wave === 'pulse') modRoute(`osc${n}Shape`, [[`pw${n}`, pwModAmt(d)]]);
    else if (wave === 'triangle') modRoute(`osc${n}Shape`, [[`wave${n}`, morphModAmt(d) / 2]]);
    else if (wave === 'wavetable') modRoute(`osc${n}Shape`, [[`wave${n}`, morphModAmt(d)]]);
  }
  // pitch routes reach each oscillator's copy too: the sub follows Oscillator 1, the density copy Oscillator 2
  const p1 = pitchModSemi(num(v, 'osc1.pitchMod')),
    p2 = pitchModSemi(num(v, 'osc2.pitchMod'));
  modRoute('osc1Pitch', [
    ['pitch1', p1],
    ['pitch4', p1],
  ]);
  modRoute('osc2Pitch', [
    ['pitch2', p2],
    ['pitch3', p2],
  ]);

  // ── the dual filter ──
  const mode = String(v['vcf.mode']);
  const f = cutoffHz(num(v, 'vcf.cutoff'));
  const res10 = clamp(num(v, 'vcf.res'), 0, 10) / 10;
  const kbd = clamp(num(v, 'vcf.keytrack'), 0, 10) / 10;
  const drive = 0.8 + (clamp(num(v, 'vcf.drive'), 0, 10) / 10) * 3.2;
  const w = widthOct(num(v, 'vcf.width'));
  const cutAmt = cutModOct(num(v, 'vcf.cutoffMod'));
  const widthAmt = widthModOct(num(v, 'vcf.widthMod'));
  const svf = (m: 'lp' | 'bp' | 'hp' | 'morph', cutoff: number): EngineParams['filter'] => ({
    type: 'svf',
    mode: m,
    cutoff,
    // whistles on its own near the top (the engine's SVF rings from 1)
    res: res10 * 1.05,
    envAmt: 0,
    envSrc: 'env1',
    kbd,
    drive,
    ...(m === 'morph' ? { morph: 0.5 } : {}),
  });
  const OPEN = 20000;
  let filter: EngineParams['filter'];
  let hpf: EngineParams['hpf'];
  /** The high-pass in front: dest `cutoffHp` moves it, as `cutoff` moves the main filter. */
  const highPass = (cutoff: number, res: number): EngineParams['hpf'] => ({
    cutoff,
    res,
    envAmt: 0,
    envSrc: 'env1',
    kbd,
  });
  switch (mode) {
    case 'BP12':
      filter = svf('bp', f);
      break;
    case 'HP12':
      filter = svf('hp', f);
      break;
    case 'LP24':
      filter = { ...svf('lp', f), type: 'ladder', res: res10 * 1.1 };
      break;
    case 'BP24':
      // two filters in a row at the same frequency: the high-pass in front, the low-pass after
      filter = { ...svf('lp', f), type: 'ladder', res: res10 * 0.9 };
      hpf = highPass(f, res10 * 0.5);
      break;
    case 'HP24':
      filter = { ...svf('lp', OPEN), res: 0, kbd: 0 };
      hpf = highPass(f, res10 * 1.05);
      break;
    case 'wide_band':
      // a low-pass above FREQUENCY and a high-pass below it, WIDTH apart
      filter = svf('lp', f * Math.pow(2, w / 2));
      hpf = highPass(f / Math.pow(2, w / 2), res10 * 0.9);
      break;
    case 'wide_notch':
      // the engine runs no two filters side by side: the SVF's own notch, centred on FREQUENCY
      filter = svf('morph', f);
      break;
    default:
      filter = svf('lp', f);
  }
  const cutDsts: [string, number][] = [['cutoff', cutAmt]];
  if (hpf && mode !== 'HP24') cutDsts.push(['cutoffHp', cutAmt]);
  if (mode === 'HP24') cutDsts[0] = ['cutoffHp', cutAmt];
  modRoute('cutoff', cutDsts);
  if (mode === 'wide_band')
    modRoute('width', [
      ['cutoff', widthAmt / 2],
      ['cutoffHp', -widthAmt / 2],
    ]);

  // ── the mixer: Oscillator 1 (+ sub) against 2 (+ density), against noise, against the ring modulator ──
  const ob = (clamp(num(v, 'mix.osc'), -5, 5) + 5) / 10;
  const nb = clamp(num(v, 'mix.noise'), 0, 10) / 10;
  const rb = clamp(num(v, 'mix.ring'), 0, 10) / 10;
  const G = 0.55;
  // equal-power balances, exactly 0 at their ends
  const cos = (t: number): number => (t >= 1 ? 0 : Math.cos((t * Math.PI) / 2));
  const sin = (t: number): number => (t <= 0 ? 0 : Math.sin((t * Math.PI) / 2));
  const oscG = G * cos(nb) * cos(rb);
  const g1 = oscG * cos(ob),
    g2 = oscG * sin(ob);
  const ringG = G * sin(rb);
  if (ringG > 0) {
    routes.push({ src: 'osc1', dst: 'ringA', amt: 1 });
    routes.push({ src: 'osc2', dst: 'ringB', amt: 1 });
    routes.push({ src: 'ring', dst: 'vcfIn', amt: ringG * 1.6 });
  }
  const oct = (n: number): number => Number(v[`osc${n}.octave`]) * 12;
  const semi2 = oct(2) + Math.round(num(v, 'osc2.semitone')) + num(v, 'osc2.cent') / 10;
  const w1 = oscWave(v, 1),
    w2 = oscWave(v, 2);
  const density = level10(num(v, 'osc2.density'), 1);
  const osc: OscParams[] = [
    { level: g1, semi: oct(1), ...w1 },
    { level: g2, semi: semi2, ...w2 },
    { level: g2 * density, semi: semi2 + densitySemi(num(v, 'osc2.densityRate')), ...w2 },
    { level: g1 * level10(num(v, 'sub.level'), 1), semi: oct(1) - 12, ...w1 },
  ];

  // ── the loudness: Envelope 1, its height set by VELOCITY ──
  for (const [sig, k] of envParts(1)) routes.push({ src: sig, dst: 'amp', amt: k });

  // ── the joystick: X bends, Y up adds vibrato ──
  const jx = clamp(num(v, 'joy.x'), -1, 1),
    jy = clamp(num(v, 'joy.y'), -1, 1);
  // always routed, so the pitch eases back with the stick rather than snapping when it reaches the centre
  routes.push({ src: 'joyX', dst: 'pitchAll', amt: BEND_SEMI });
  if (jy > 0) routes.push({ src: 'lfo3', dst: 'pitchAll', amt: jy * VIB_SEMI });

  // ── tempo, LFOs and the arpeggiator ──
  const bpm = bpmOf(num(v, 'arp.bpm'));
  const lfoRate = (n: number): number =>
    v[`lfo${n}.sync`] === 'sync'
      ? bpm / 60 / lfoDiv(num(v, `lfo${n}.rate`))[1]
      : lfoHz(num(v, `lfo${n}.rate`));
  const voicing = String(v['kbd.voicing']);
  const legato = !!v['env1.legato'];

  // ── effects: the chorus, then the reverb ──
  const chorusMix = clamp(num(v, 'fx.chorusLevel'), 0, 10) * 10;
  const revMix = clamp(num(v, 'fx.reverbLevel'), 0, 10) * 6;
  const [spd, width] = CHORUS[String(v['fx.chorusType'])] ?? CHORUS['1'];
  const fx: FxParams =
    chorusMix > 0 || revMix > 0
      ? {
          mode: 'insert',
          routing: 1,
          slots: [
            chorusMix > 0
              ? {
                  alg: 'chorus',
                  level: 1,
                  p: {
                    SPD: spd,
                    WDL: width,
                    WDR: width,
                    DLL: 9,
                    DLR: 14,
                    MIX: chorusMix * 0.6,
                    LC: 80,
                    HC: 12000,
                    PHS: 90,
                    WAV: 100,
                    SPR: 30,
                  },
                }
              : { alg: null },
            revMix > 0
              ? {
                  alg: 'chamberrev',
                  level: 1,
                  p: {
                    PRE: 15,
                    DCY: reverbTime(num(v, 'fx.reverbTime')),
                    SIZ: 40,
                    DMP: v['fx.reverbLpf'] ? 3000 : 9000,
                    DIF: 70,
                    MIX: revMix,
                    LC: v['fx.reverbHpf'] ? 400 : 40,
                    HC: v['fx.reverbLpf'] ? 3500 : 16000,
                    LFX: 1,
                    SPR: 25,
                    SHP: 80,
                    SPI: 20,
                  },
                }
              : { alg: null },
            { alg: null },
            { alg: null },
          ],
        }
      : { mode: 'bypass' };

  return {
    osc,
    noise: { level: G * sin(nb) * cos(rb), color: 'white' },
    ext: { level: 0 },
    filter,
    ...(hpf ? { hpf } : {}),
    env1: {
      a: attTime(num(v, 'env1.attack')),
      d: decTime(num(v, 'env1.decay')),
      s: num(v, 'env1.sustain') / 10,
      r: relTime(num(v, 'env1.release')),
      ...(v['env1.repeat'] ? { loop: true } : {}),
    },
    env2: {
      a: attTime(num(v, 'env2.attack')),
      d: decTime(num(v, 'env2.decay')),
      s: num(v, 'env2.sustain') / 10,
      r: relTime(num(v, 'env2.release')),
      ...(v['env2.repeat'] ? { loop: true } : {}),
    },
    // the loudness is Envelope 1 through routes into `amp`, so VELOCITY can set its height either way
    vca: { envSrc: 'none', bias: 0 },
    lfo: {
      rate: lfoRate(1),
      mix: LFO_MIX[String(v['lfo1.wave'])] ?? { tri: 1 },
      keySync: !!v['lfo1.keytrig'],
      ...(fadeTime(num(v, 'lfo1.fade')) ? { delay: fadeTime(num(v, 'lfo1.fade')) } : {}),
    },
    lfo2: {
      rate: lfoRate(2),
      mix: LFO_MIX[String(v['lfo2.wave'])] ?? { tri: 1 },
      keySync: !!v['lfo2.keytrig'],
      ...(fadeTime(num(v, 'lfo2.fade')) ? { delay: fadeTime(num(v, 'lfo2.fade')) } : {}),
    },
    lfo3: { rate: VIB_HZ, mix: { sine: 1 } },
    glide: { time: glideTime(num(v, 'kbd.glide')), legato: !!v['kbd.glideAuto'] },
    trig: { retrig: !legato, drone: false, repeat: false },
    routes,
    drift: { depth: driftSemi(num(v, 'drift.amount')), rate: 0.7 },
    joy: [jx, jy],
    poly:
      voicing === 'quad'
        ? { voices: 4, stack: 1, mono: false }
        : voicing === 'duo'
          ? { voices: 2, stack: 1, mono: false }
          : { voices: 1, stack: 1, mono: true },
    arp: {
      on: !!v['arp.on'],
      // the engine steps in sixteenths: a SYNC division plays at the tempo that makes its notes that long
      bpm: (bpm * arpDiv(num(v, 'arp.sync'))) / 16,
      gate: 0.5,
      mode:
        (
          {
            up: 'up',
            down: 'down',
            updown1: 'updown',
            updown2: 'updown',
            play: 'played',
            random: 'random',
          } as const
        )[String(v['arp.mode']) as 'up'] ?? 'up',
      octaves: Number(v['arp.octaves']) || 1,
      hold: !!v['kbd.hold'],
    },
    fx,
    tune: tuneSemi(num(v, 'out.tune')),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const mantis: SynthDef & { version: number } = {
  id: 'mantis',
  version: 1,
  name: 'Mantis',
  maker: 'PWM',
  year: 2023,
  heritage:
    'Chris Huggett’s last design, finished by Paul Whittington: a Wasp-style engine with an OSCar-style dual filter',
  summary:
    'A four-voice hybrid synth with 37 keys: two mathematically generated oscillators per voice (sine, triangle, saw, pulse, organ or wavetable) with a sub and a detuned density copy, noise and ring modulation through three balance knobs, a dual filter with eight types including Wide Band and Wide Notch, two envelopes, two LFOs, six mod routes, an arpeggiator, a joystick, and chorus and reverb.',
  view: { w: (2880 - OX) * K, h: (2150 - OY) * K },
  theme: {
    panel: PANEL,
    panel2: '#232427',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    knobRing: true,
  },
  signalNames: {
    osc1: 'Oscillator 1',
    osc2: 'Oscillator 2',
    osc3: 'the density oscillator',
    osc4: 'the sub',
    env1: 'Envelope 1',
    env2: 'Envelope 2',
    env1v: 'Envelope 1 (by velocity)',
    env2v: 'Envelope 2 (by velocity)',
    lfo: 'LFO 1',
    lfo2: 'LFO 2',
    lfo3: 'the joystick’s vibrato',
    ring: 'the ring modulator',
    kbd: 'the note',
    vel: 'velocity',
    one: 'Full On',
    joyX: 'the joystick (left-right)',
    joyY: 'the joystick (up-down)',
    wheel: 'the mod wheel',
    vcf1: 'the filter',
    mixer: 'the mixer',
  },
  destNames: {
    cutoffHp: 'the second filter',
    wave1: 'Oscillator 1’s shape',
    wave2: 'Oscillator 2’s shape',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // Init is the Mantis's own INIT, a single sawtooth: Oscillator 1 alone, the filter open, Envelope 1 an organ gate.
  // That is the Default patch already, so it has none of its own.
  toEngine,
};

export default mantis;
