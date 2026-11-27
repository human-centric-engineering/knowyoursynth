/**
 * Behringer EDGE (2021): the definition. Positions are measured on the owner's photo of the panel straight on,
 * `.context/app/synth-data/edge/raw/Behrenger Edge.jpg` (3000 × 1602, local only), read at 2000 × 1068 (divide a file
 * pixel by 1.5), and turned into view units by P() / Q(): view x = x − 40, view y = y − 40. The view is the case
 * between its end cheeks. The owner's spec is `.context/app/synth-data/edge/edge.synth.json` (0.13.0): 16 modules,
 * 50 parameters, 29 ports.
 *
 * Written straight into the app (`f-next-synths`, t-270) on the Moog DFAM's definition, which it recreates: the voice,
 * the controls' ranges and help, the jacks and the Default patch are `defs/dfam-kit.ts`, with the EDGE's own names
 * (OSC for VCO, PLAY/STOP, VEL). The control and jack ids are the DFAM's, so a panel carries across the family as it
 * is. What is the EDGE's own is here: NOISE COLOR (white or pink), the CLOCK switch and SCALE, PHONES, the MIDI
 * sockets, and its faceplate, its maker's marks tagged `brand` (the behringer logo and wordmark, and the EDGE badge).
 *
 * MIDI notes play the voice (Behringer's product page; owner reports for the details, which the spec marks inferred):
 * here the app's keys are those notes. With the sequencer stopped a key strikes the envelopes at its velocity and its
 * pitch moves both oscillators; while the sequencer runs a key transposes it. CLOCK on MIDI or USB takes the app's
 * clock divided by SCALE; INT/EXT runs on TEMPO, locked to the bar's beat as the DFAM's is. The poly chain, the MIDI
 * channel and the rear OUT/THRU switch are not modelled.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlValues,
  Decor,
  EngineParams,
  Jack,
  KnobControl,
  SynthDef,
  TextDecor,
  ToggleControl,
  ViewRect,
} from '@/lib/app/synths/contract';
import {
  dfamDefaultPatch,
  dfamEngine,
  dfamJacks,
  dfamSpecs,
  place,
  SCALE_PER_BEAT,
} from '@/lib/app/synths/defs/dfam-kit';

// ── Geometry (photo pixels at 2000 × 1068 in, view units out) ───────────────
const OX = 40,
  OY = 40,
  RIGHT = 1955,
  BOTTOM = 1030;
const P = (x: number): number => x - OX;
const Q = (y: number): number => y - OY;
const INK = '#f2f2f0';
const BLACK = '#161617';
const MAGENTA = '#b4239c';

const specs = dfamSpecs('edge');
const jackSpecs = dfamJacks('edge');
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];

type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'spacing' | 'brand'>>;
const text = (x: number, y: number, t: string, size = 17, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: P(x),
    y: Q(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const rect = (x0: number, y0: number, x1: number, y1: number, fill: string, hw = false): void => {
  decor.push({
    t: 'rect',
    x: P(x0),
    y: Q(y0),
    w: x1 - x0,
    h: y1 - y0,
    r: 0,
    fill,
    ...(hw ? { hw } : {}),
  });
};
const knob = (id: string, x: number, y: number, r: number, rest: Partial<KnobControl> = {}) => {
  controls.push(
    place<KnobControl>(specs, id, { type: 'knob', x: P(x), y: Q(y), r, style: 'obxa', ...rest })
  );
};
const toggle = (id: string, x: number, y: number) => {
  controls.push(place<ToggleControl>(specs, id, { type: 'toggle', x: P(x), y: Q(y), w: 26 }));
};
const button = (id: string, x: number, y: number, rest: Partial<ButtonControl> = {}) => {
  controls.push(
    place<ButtonControl>(specs, id, {
      type: 'button',
      x: P(x),
      y: Q(y),
      w: 72,
      h: 68,
      cap: 'black',
      ...rest,
    })
  );
};

// ── The case: magenta, with the black control panel let into it ──────────────
rect(OX, OY, RIGHT, BOTTOM, MAGENTA);
rect(68, 288, 1930, 992, BLACK);
const header = (x0: number, x1: number, y: number, t: string): void => {
  rect(x0, y - 14, x1, y + 14, '#5a5a5c');
  text(x0 + 12, y, t, 21, { anchor: 'start', spacing: '0.04em' });
};
header(75, 818, 302, 'OSCILLATOR (VCO 1)');
header(823, 995, 302, 'EG (VCO 1&2)');
header(1000, 1262, 302, 'NOISE');
header(1268, 1476, 302, '');
header(1481, 1925, 302, 'OUTPUT (VCA)');
header(75, 995, 478, 'OSCILLATOR (VCO 2)');
header(1000, 1925, 478, 'FILTER (VCF)');
header(75, 1925, 661, 'SEQUENCER');

// ── Oscillator 1 ───────────────────────────────────────────────────────────
for (const [n, y] of [
  [1, 405],
  [2, 580],
] as const) {
  const ly = y - 73;
  text(177, ly, 'FREQUENCY', 19);
  knob(`vco${n}.freq`, 165, y, 46);
  text(318, ly + 15, 'SHAPE', 19);
  decor.push(
    { t: 'wave', x: P(318), y: Q(y - 37), size: 11, shape: 'sq', w: 2 },
    { t: 'wave', x: P(318), y: Q(y + 37), size: 11, shape: 'tri', w: 2 }
  );
  toggle(`vco${n}.wave`, 317, y);
  text(457, ly, 'ENVELOPE', 19);
  knob(`vco${n}.eg_amt`, 447, y, 40);
  text(417, y + 51, '−', 17);
  text(495, y + 51, '+', 17);
  text(735, ly, 'LEVEL', 19);
  knob(`mix.vco${n}`, 727, y, 40);
}
text(597, 347, 'SEQ PITCH MOD', 19);
text(597, 369, 'OSC 1 & 2', 14);
text(638, 404, 'OFF', 14);
text(596, 440, 'OSC 2', 14);
toggle('seq.pitch_mod', 593, 405);
text(908, 333, 'DECAY', 19);
knob('vco_eg.decay', 903, 405, 40);

// ── Noise, the badge, the output ───────────────────────────────────────────
text(1067, 347, 'COLOR', 19);
text(1067, 369, 'PINK', 14);
text(1067, 440, 'WHITE', 14);
toggle('noise.color', 1057, 405);
text(1185, 333, 'NOISE/EXT', 19);
knob('mix.noise', 1183, 405, 40);
decor.push({ t: 'led', x: P(1372), y: Q(346), r: 9, color: 'amber' });
text(1370, 403, 'EDGE', 62, { brand: true, weight: 400, fill: MAGENTA, spacing: '0.06em' });
text(1542, 347, 'VCA MODE', 19);
text(1542, 368, 'FAST', 14);
text(1542, 438, 'SLOW', 14);
toggle('vca_eg.attack', 1540, 405);
text(1661, 332, 'DECAY', 19);
knob('vca_eg.decay', 1663, 405, 40);
text(1822, 332, 'VOLUME', 19);
knob('out.volume', 1822, 405, 40);

// ── Oscillator 2's own and the filter ──────────────────────────────────────
text(595, 522, 'HARD SYNC', 19);
text(595, 543, 'ON', 14);
text(595, 615, 'OFF', 14);
toggle('vco2.sync', 593, 580);
text(907, 508, '1-2 FM AMT', 19);
knob('vco2.fm_amt', 903, 580, 40);
text(1065, 522, 'VCF', 19);
text(1065, 543, 'HP', 14);
text(1065, 613, 'LP', 14);
toggle('vcf.mode', 1060, 580);
text(1184, 508, 'CUTOFF', 19);
text(1127, 540, '200Hz', 13);
text(1250, 540, '2kHz', 13);
text(1132, 630, '20Hz', 13);
text(1237, 630, '20kHz', 13);
knob('vcf.cutoff', 1183, 580, 40);
text(1342, 508, 'RESONANCE', 19);
knob('vcf.resonance', 1342, 580, 40);
text(1500, 508, 'DECAY', 19);
knob('vcf_eg.decay', 1500, 580, 40);
text(1660, 508, 'ENVELOPE', 19);
knob('vcf_eg.amt', 1660, 580, 40);
text(1620, 630, '−', 17);
text(1700, 630, '+', 17);
text(1822, 508, 'NOISE/VCF MOD', 19);
knob('vcfmod.amt', 1822, 580, 40);

// ── The sequencer ──────────────────────────────────────────────────────────
text(178, 703, 'TEMPO', 19);
knob('clock.tempo', 175, 765, 46);
text(317, 717, 'CLOCK', 19);
text(317, 738, 'MIDI', 14);
text(360, 773, 'USB', 14);
text(316, 808, 'INT/EXT', 14);
toggle('clock.source', 315, 775);
text(456, 692, 'SCALE', 19);
// the printed positions, read round the knob from the photo
const SCALE_AT: Record<string, [number, number, number]> = {
  '1/4': [-101, 391, 787],
  '1/8': [-66, 391, 758],
  '1/16': [-40, 400, 734],
  '1/32': [-9, 427, 713],
  '1/4T': [35, 483, 713],
  '1/8T': [59, 512, 733],
  '1/16T': [77, 527, 758],
  '1/32T': [96, 528, 787],
};
for (const [k, [, x, y]] of Object.entries(SCALE_AT)) text(x, y, k, 13);
// the knob's options carry the angles the positions are printed at
const scaleSpecs = {
  ...specs,
  'clock.scale': {
    ...specs['clock.scale'],
    options: Object.keys(SCALE_PER_BEAT).map((k) => ({ v: k, label: '', a: SCALE_AT[k][0] })),
  },
};
controls.push(
  place<KnobControl>(scaleSpecs, 'clock.scale', {
    type: 'knob',
    x: P(437),
    y: Q(778),
    r: 36,
    style: 'obxa',
  })
);
decor.push(
  { t: 'line', x1: P(178), y1: Q(830), x2: P(455), y2: Q(830), w: 2 },
  { t: 'line', x1: P(178), y1: Q(818), x2: P(178), y2: Q(830), w: 2 },
  { t: 'line', x1: P(455), y1: Q(818), x2: P(455), y2: Q(830), w: 2 }
);
text(367, 878, 'TRIGGER', 19);
button('seq.trigger', 366, 933);
text(453, 858, 'PLAY/', 19);
text(453, 878, 'STOP', 19);
button('seq.run', 455, 933, { lamp: 'red' });
text(541, 878, 'ADVANCE', 19);
button('seq.advance', 541, 933);
const STEP_X = [703, 862, 1021, 1180, 1340, 1499, 1659, 1820];
text(620, 743, 'PITCH', 19);
text(627, 916, 'VEL', 19);
STEP_X.forEach((x, i) => {
  text(x + 5, 661, String(i + 1), 21);
  knob(`seq.pitch${i + 1}`, x, 745, 40);
  decor.push({ t: 'led', x: P(x), y: Q(829), r: 8, color: 'red', litWhen: { seq: i } });
  knob(`seq.vel${i + 1}`, x, 918, 40);
});

// ── Maker's marks ──────────────────────────────────────────────────────────
decor.push({
  t: 'logo',
  x: P(176),
  y: Q(946),
  size: 22,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
decor.push({
  t: 'path',
  d: `M ${P(176)} ${Q(862)} L ${P(222)} ${Q(928)} L ${P(130)} ${Q(928)} Z`,
  fill: 'none',
  stroke: INK,
  w: 3,
  brand: true,
});

// ── The patchbay along the top ─────────────────────────────────────────────
const COL = [455, 569, 684, 799, 913, 1028, 1143, 1258, 1372, 1487, 1602, 1717, 1834];
const ROW1: string[] = [
  'j.vco1_cv',
  'j.vco2_cv',
  'j.vco_decay',
  'j.adv_clock',
  'j.trigger_in',
  'j.velocity_in',
  'j.noise_level',
  'j.vco1_out',
  'j.vco2_out',
  'j.vco_eg_out',
  'j.trigger_out',
  'j.velocity_out',
];
const ROW2: string[] = [
  'j.fm_amt',
  'j.ext_audio',
  'j.tempo',
  'j.run_stop',
  'j.vcf_mod',
  'j.vcf_decay',
  'j.vca_cv',
  'j.vca_decay',
  'j.pitch_out',
  'j.vcf_eg_out',
  'j.vca_out',
  'j.vca_eg_out',
];
const jackAt = (id: string, x: number, ly: number, jy: number): void => {
  const sp = jackSpecs[id];
  const out = sp.dir === 'out';
  // inputs' names are outlined, outputs' are on black plates
  decor.push({
    t: 'rect',
    x: P(x - 52),
    y: Q(ly - 10),
    w: 104,
    h: 20,
    r: 2,
    fill: out ? BLACK : 'none',
    ...(out ? {} : { stroke: INK, sw: 1.5 }),
  });
  text(x, ly, sp.label, 13);
  jacks.push({ id, x: P(x), y: Q(jy), r: 22, labelPos: 'none', ...sp });
};
ROW1.forEach((id, i) => jackAt(id, COL[i], 116, 158));
ROW2.forEach((id, i) => jackAt(id, COL[i], 202, 243));
// PHONES, and the case's IN / OUT key
decor.push({ t: 'rect', x: P(1782), y: Q(106), w: 104, h: 20, r: 2, fill: BLACK });
text(1834, 116, 'PHONES', 13);
jacks.push({
  id: 'j.phones',
  x: P(1834),
  y: Q(158),
  r: 22,
  dir: 'out',
  label: 'PHONES',
  labelPos: 'none',
  signal: 'out',
  help: 'Headphones, 3.5 mm stereo, after VOLUME. A cable from it here carries the whole sound before VOLUME, as the VCA output does.',
});
decor.push({
  t: 'rect',
  x: P(1812),
  y: Q(190),
  w: 44,
  h: 22,
  r: 2,
  fill: 'none',
  stroke: INK,
  sw: 1.5,
});
text(1834, 201, 'IN', 15);
decor.push({ t: 'rect', x: P(1812), y: Q(213), w: 44, h: 22, r: 2, fill: BLACK });
text(1834, 224, 'OUT', 15);
// the MIDI sockets: drawn, not patched (the keys are the notes, the app's clock the clock)
text(177, 116, 'MIDI IN', 14);
text(317, 116, 'MIDI OUT/THRU', 14);
decor.push({ t: 'din', x: P(177), y: Q(203), r: 50 }, { t: 'din', x: P(317), y: Q(203), r: 50 });
jacks.push(
  {
    id: 'j.midi_in',
    x: P(177),
    y: Q(203),
    r: 30,
    dir: 'in',
    label: 'MIDI IN',
    labelPos: 'none',
    dest: null,
    help: 'MIDI notes play the voice, and MIDI clock runs the sequencer with CLOCK on MIDI. Here the app’s keys and your MIDI controller are those notes and Play on the bar is that clock, so nothing is patched here.',
  },
  {
    id: 'j.midi_out',
    x: P(317),
    y: Q(203),
    r: 30,
    dir: 'out',
    label: 'MIDI OUT/THRU',
    labelPos: 'none',
    signal: null,
    help: 'MIDI out, or a copy of MIDI IN with the rear switch on THRU, to chain EDGEs as one instrument of up to 16 voices (the poly chain). Not modelled here.',
  }
);

// ── Areas (photo pixels, converted) ────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: P(x0),
  y: Q(y0),
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'patchbay',
    label: 'Patchbay and MIDI',
    module: 'patch',
    keywords: 'patchbay patch jacks in out cv trigger velocity clock eg midi phones',
    rects: [R(OX, OY, RIGHT, 285)],
    help: 'Twenty-four jacks, the DFAM’s set: inputs outlined, outputs on black. Everything is wired inside already, so a cable only changes the sound, never makes it work. Then PHONES, and MIDI in and out on DIN.',
  },
  {
    id: 'vco1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords:
      'osc 1 vco 1 oscillator frequency pitch shape triangle square envelope level seq pitch mod',
    rects: [R(75, 316, 818, 465)],
    help: 'The first oscillator, over ten octaves, triangle or square; how far the pitch envelope bends it; its level into the filter; and SEQ PITCH MOD, which chooses the oscillators the sequencer moves.',
  },
  {
    id: 'pitch-eg',
    label: 'Pitch envelope',
    module: 'env',
    keywords: 'eg vco 1&2 decay pitch envelope',
    rects: [R(823, 316, 995, 465)],
    help: 'The decay of the envelope both ENVELOPE knobs send to the oscillators’ pitch.',
  },
  {
    id: 'noise',
    label: 'Noise',
    module: 'mixer',
    keywords: 'noise color pink white ext external audio level',
    rects: [R(1000, 316, 1262, 465)],
    help: 'The noise, white or pink, and its level into the filter (or EXT AUDIO’s, once that is patched).',
  },
  {
    id: 'vca',
    label: 'Output (VCA)',
    module: 'amp',
    keywords: 'vca mode fast slow attack decay volume output amplifier',
    rects: [R(1481, 316, 1925, 465)],
    help: 'The VCA envelope’s attack, 1 ms or 100 ms, and its DECAY, which shape each hit’s loudness; VOLUME sets the output.',
  },
  {
    id: 'vco2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'osc 2 vco 2 oscillator frequency pitch shape envelope level hard sync 1-2 fm',
    rects: [R(75, 492, 995, 640)],
    help: 'The second oscillator, as the first, with how oscillator 1 acts on it: HARD SYNC and linear 1-2 FM.',
  },
  {
    id: 'vcf',
    label: 'Filter (VCF)',
    module: 'filter',
    keywords: 'vcf filter ladder hp lp cutoff resonance decay envelope noise vcf mod',
    rects: [R(1000, 492, 1925, 640)],
    help: 'A 4-pole ladder, low-pass or high-pass, 20 Hz to 20 kHz. Its envelope opens or closes it on each hit, and the noise (or the VCF MOD input) shakes it.',
  },
  {
    id: 'clock',
    label: 'Tempo and transport',
    module: 'mod',
    keywords: 'tempo clock midi usb int ext scale trigger play stop advance transport',
    rects: [R(75, 675, 595, 990)],
    help: 'TEMPO, or MIDI or USB clock divided by SCALE, runs the sequencer; PLAY/STOP starts and stops it on its step; stopped, TRIGGER plays the step and ADVANCE moves on.',
  },
  {
    id: 'steps',
    label: 'Sequencer',
    module: 'mod',
    keywords: 'sequencer steps 8-step pitch vel velocity step lamps pattern rhythm',
    rects: [R(595, 675, 1925, 990)],
    help: 'Eight steps, each with a PITCH and a VEL knob and a lamp. The velocity row is the rhythm and the dynamics: a step at zero is silent.',
  },
];

// ── Engine mapping ─────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  return dfamEngine(v, 'edge');
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const edge: SynthDef & { version: number } = {
  id: 'edge',
  version: 1,
  name: 'EDGE',
  maker: 'Behringer',
  year: 2021,
  heritage: 'Based on the 2017 Moog DFAM',
  summary:
    'A semi-modular analogue percussion synth on the DFAM’s design: two oscillators (triangle or square, with hard sync and linear FM) and white or pink noise into a ladder filter, low- or high-pass, and a VCA, each moved by its own decay envelope. An 8-step sequencer sets each step’s pitch and velocity, on its own clock or MIDI and USB clock, with a 24-jack patchbay and MIDI.',
  view: { w: RIGHT - OX, h: BOTTOM - OY },
  theme: {
    panel: MAGENTA,
    panel2: BLACK,
    ink: INK,
    font: 'din',
    weight: 700,
    cheeks: 'metal',
    cheekW: 34,
    knobRing: true,
    jack: 'black',
    button: 'black',
  },
  signalNames: {
    osc1: 'OSC 1',
    osc2: 'OSC 2',
    noise: 'the noise',
    dfmPitch: 'the step’s PITCH',
    dfmVel: 'the step’s VELOCITY',
    dfmTrig: 'TRIGGER OUT',
    dfmEgVco: 'the OSC EG',
    dfmEgVcf: 'the VCF EG',
    dfmEgVca: 'the VCA EG',
    vca: 'the VCA',
    out: 'the output',
  },
  destNames: {
    dfmTrigIn: 'the envelopes’ TRIGGER',
    dfmVelIn: 'the envelopes’ VELOCITY',
    dfmDecVco: 'the OSC EG’s decay',
    dfmDecVcf: 'the VCF EG’s decay',
    dfmDecVca: 'the VCA EG’s decay',
    dfmExt: 'the mixer’s NOISE/EXT channel',
    dfmNzLvl: 'NOISE/EXT',
    dfmTempo: 'the clock’s TEMPO',
    dfmRun: 'PLAY/STOP',
    dfmAdv: 'the sequencer’s ADV/CLOCK',
    att2In: 'the cutoff, by NOISE/VCF MOD',
    pitch1: 'OSC 1’s pitch',
    pitch2: 'OSC 2’s pitch',
    fmLinAmt: '1-2 FM AMT',
    amp: 'the VCA',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  ownSequencer: { run: 'seq.run' },
  defaultPatch: dfamDefaultPatch('edge'),
  toEngine,
};

export default edge;
