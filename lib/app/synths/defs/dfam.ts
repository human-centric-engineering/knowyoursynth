/**
 * Moog DFAM (Drummer From Another Mother, 2017): the definition. Positions are measured on the owner's photo of the
 * panel straight on, `.context/app/synth-data/dfam/raw/moog_dfam.jpg` (1200 × 1200, local only), and turned into view
 * units by P() / Q(): view x = (x − 66) × 2 + the cheek, view y = (y − 368) × 2. The view is the faceplate between the
 * wooden cheeks. The owner's spec is `.context/app/synth-data/dfam/dfam.synth.json` (0.13.0): 15 modules, 42
 * parameters, 26 ports.
 *
 * Written straight into the app (`f-next-synths`, t-269). The voice, the controls' ranges and help, the jacks and the
 * Default patch are `defs/dfam-kit.ts`, shared with the Behringer EDGE (`defs/edge.ts`), which recreates it; this file
 * places them on the DFAM's panel and draws its faceplate. The sound is the fixed voice with the engine's DFAM core
 * (t-327, `audio/dfam-core.ts`): the clock, the 8-step sequencer, the trigger and velocity buses and the three decay
 * envelopes.
 *
 * The DFAM has no MIDI and no keyboard. Here the app's keys stand in for its TRIGGER input and a VCO CV: with the
 * sequencer stopped a key strikes the current step's envelopes at the key's velocity, and its pitch, from C4, moves
 * both VCOs; while it runs a key only transposes it. RUN / STOP is the sequencer's run control on the app's clock
 * (`ownSequencer`): lit, it plays with Play on the bar.
 */
import type {
  Area,
  ButtonControl,
  ControlValues,
  Decor,
  EngineParams,
  Jack,
  KnobControl,
  SynthDef,
  TextDecor,
  ToggleControl,
  ViewRect,
  Control,
} from '@/lib/app/synths/contract';
import {
  dfamDefaultPatch,
  dfamEngine,
  dfamJacks,
  dfamSpecs,
  place,
} from '@/lib/app/synths/defs/dfam-kit';

// ── Geometry (photo pixels in, view units out) ─────────────────────────────
const OX = 66,
  OY = 368,
  K = 2,
  CHEEK = 46,
  RIGHT = 1143,
  BOTTOM = 832;
const P = (x: number): number => (x - OX) * K + CHEEK;
const Q = (y: number): number => (y - OY) * K;
const INK = '#e6e6e2';
const PANEL = '#1b1b1d';

const specs = dfamSpecs('dfam');
const jackSpecs = dfamJacks('dfam');
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];

type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'spacing' | 'brand'>>;
const text = (x: number, y: number, t: string, size = 12, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: P(x),
    y: Q(y) + size * 0.36 * K,
    text: t,
    size: size * K,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const knob = (
  id: string,
  x: number,
  y: number,
  r: number,
  style: KnobControl['style'] = 'd-silver'
) => {
  controls.push(place<KnobControl>(specs, id, { type: 'knob', x: P(x), y: Q(y), r: r * K, style }));
};
const toggle = (id: string, x: number, y: number) => {
  controls.push(place<ToggleControl>(specs, id, { type: 'toggle', x: P(x), y: Q(y), w: 13 * K }));
};
const button = (id: string, x: number, y: number, w: number, rest: Partial<ButtonControl> = {}) => {
  controls.push(
    place<ButtonControl>(specs, id, {
      type: 'button',
      x: P(x),
      y: Q(y),
      w: w * K,
      h: w * K,
      ...rest,
    })
  );
};

// ── Faceplate ──────────────────────────────────────────────────────────────
for (const [x, y] of [
  [103, 378],
  [460, 378],
  [738, 378],
  [1100, 378],
  [103, 822],
  [460, 812],
  [738, 812],
  [1100, 822],
])
  decor.push({ t: 'screw', x: P(x), y: Q(y), r: 9, hw: true });

// ── Row 1 ──────────────────────────────────────────────────────────────────
text(126, 404, 'VCO DECAY', 11);
knob('vco_eg.decay', 115, 452, 24);
text(205, 421, 'SEQ PITCH MOD', 8);
text(205, 434, 'VCO 1&2', 7);
text(232, 452, 'OFF', 7);
text(205, 474, 'VCO 2', 7);
toggle('seq.pitch_mod', 199, 451);
text(280, 404, 'VCO 1 EG AMOUNT', 11);
knob('vco1.eg_amt', 268, 452, 24);
text(243, 487, '(−)', 7);
text(295, 487, '(+)', 7);
text(382, 404, 'VCO 1 FREQUENCY', 11);
knob('vco1.freq', 378, 447, 28);
text(459, 419, 'VCO 1 WAVE', 8);
decor.push(
  { t: 'wave', x: P(453), y: Q(434), size: 9 * K, shape: 'sq', w: 2 },
  { t: 'wave', x: P(453), y: Q(472), size: 9 * K, shape: 'tri', w: 2 }
);
toggle('vco1.wave', 452, 452);
text(527, 404, 'VCO 1 LEVEL', 8);
knob('mix.vco1', 520, 432, 11, 'obxa');
text(597, 420, 'VCF', 8);
text(597, 432, 'HP', 7);
text(597, 491, 'LP', 7);
toggle('vcf.mode', 597, 463);
text(677, 404, 'CUTOFF', 11);
text(628, 425, '200Hz', 7);
text(724, 425, '2kHz', 7);
text(640, 497, '20Hz', 7);
text(712, 497, '20kHz', 7);
knob('vcf.cutoff', 678, 452, 24);
text(779, 404, 'RESONANCE', 11);
knob('vcf.resonance', 778, 452, 24);
text(860, 420, 'VCA EG', 8);
text(860, 432, 'FAST', 7);
text(860, 494, 'SLOW', 7);
toggle('vca_eg.attack', 860, 463);
text(938, 404, 'VOLUME', 11);
knob('out.volume', 938, 452, 26);

// ── The mixer's other two levels ───────────────────────────────────────────
text(527, 482, 'NOISE / EXT LEVEL', 8);
knob('mix.noise', 520, 512, 11, 'obxa');
text(527, 560, 'VCO 2 LEVEL', 8);
knob('mix.vco2', 520, 590, 11, 'obxa');

// ── Row 2 ──────────────────────────────────────────────────────────────────
text(126, 519, '1→2 FM AMOUNT', 11);
knob('vco2.fm_amt', 116, 568, 24);
text(205, 537, 'HARD SYNC', 8);
text(205, 549, 'ON', 7);
text(205, 593, 'OFF', 7);
toggle('vco2.sync', 199, 570);
text(280, 519, 'VCO 2 EG AMOUNT', 11);
knob('vco2.eg_amt', 268, 567, 24);
text(243, 602, '(−)', 7);
text(295, 602, '(+)', 7);
text(382, 519, 'VCO 2 FREQUENCY', 11);
knob('vco2.freq', 378, 567, 28);
text(459, 533, 'VCO 2 WAVE', 8);
decor.push(
  { t: 'wave', x: P(453), y: Q(549), size: 9 * K, shape: 'sq', w: 2 },
  { t: 'wave', x: P(453), y: Q(589), size: 9 * K, shape: 'tri', w: 2 }
);
toggle('vco2.wave', 452, 570);
text(617, 519, 'VCF DECAY', 11);
knob('vcf_eg.decay', 617, 567, 24);
text(724, 519, 'VCF EG AMOUNT', 11);
knob('vcf_eg.amt', 718, 567, 24);
text(693, 602, '(−)', 7);
text(745, 602, '(+)', 7);
text(830, 519, 'NOISE / VCF MOD', 11);
knob('vcfmod.amt', 828, 567, 24);
text(938, 519, 'VCA DECAY', 11);
knob('vca_eg.decay', 940, 567, 24);

// ── The sequencer ──────────────────────────────────────────────────────────
text(128, 655, 'TRIGGER', 8);
button('seq.trigger', 128, 683, 24, { capColor: '#8d8d8d' });
text(226, 630, 'TEMPO', 11);
knob('clock.tempo', 213, 680, 24);
text(190, 727, 'RUN / STOP', 8);
button('seq.run', 178, 750, 24, { capColor: '#d8312b', lamp: 'red' });
text(262, 727, 'ADVANCE', 8);
button('seq.advance', 262, 750, 24, { capColor: '#1c1c1c' });
const STEP_X = [343, 429, 514, 599, 685, 770, 855, 940];
text(312, 668, 'PITCH', 8);
text(305, 752, 'VELOCITY', 8);
STEP_X.forEach((x, i) => {
  text(x, 637, String(i + 1), 11);
  knob(`seq.pitch${i + 1}`, x, 668, 12, 'obxa');
  decor.push({ t: 'led', x: P(x), y: Q(711), r: 4 * K, color: 'red', litWhen: { seq: i } });
  knob(`seq.vel${i + 1}`, x, 752, 12, 'obxa');
});

// ── Patchbay ───────────────────────────────────────────────────────────────
text(1058, 390, 'IN / OUT', 9);
const COL = [1016, 1058, 1103];
const LROW = [405, 452, 498, 545, 591, 637, 690, 739];
const JROW = LROW.map((y) => y + 21);
const PATCH: [string, number, number][] = [
  ['j.trigger_in', 0, 0],
  ['j.vca_cv', 1, 0],
  ['j.vca_out', 2, 0],
  ['j.velocity_in', 0, 1],
  ['j.vca_decay', 1, 1],
  ['j.vca_eg_out', 2, 1],
  ['j.ext_audio', 0, 2],
  ['j.vcf_decay', 1, 2],
  ['j.vcf_eg_out', 2, 2],
  ['j.noise_level', 0, 3],
  ['j.vco_decay', 1, 3],
  ['j.vco_eg_out', 2, 3],
  ['j.vcf_mod', 0, 4],
  ['j.vco1_cv', 1, 4],
  ['j.vco1_out', 2, 4],
  ['j.fm_amt', 0, 5],
  ['j.vco2_cv', 1, 5],
  ['j.vco2_out', 2, 5],
  ['j.tempo', 0, 6],
  ['j.run_stop', 1, 6],
  ['j.adv_clock', 2, 6],
  ['j.trigger_out', 0, 7],
  ['j.velocity_out', 1, 7],
  ['j.pitch_out', 2, 7],
];
for (const [id, c, r] of PATCH) {
  const sp = jackSpecs[id];
  const out = sp.dir === 'out';
  // outputs' names are printed reversed, light on a dark plate's ink
  if (out)
    decor.push({
      t: 'rect',
      x: P(COL[c] - 19),
      y: Q(LROW[r] - 6),
      w: 38 * K,
      h: 12 * K,
      r: 1,
      fill: INK,
      hw: true,
    });
  text(COL[c], LROW[r], sp.label, 6, out ? { fill: PANEL } : {});
  jacks.push({ id, x: P(COL[c]), y: Q(JROW[r]), r: 11 * K, labelPos: 'none', ...sp });
}

// ── Maker's marks ──────────────────────────────────────────────────────────
text(165, 800, 'DFAM', 20, { brand: true, weight: 800 });
text(246, 794, 'DRUMMER FROM', 8, { brand: true });
text(246, 806, 'ANOTHER MOTHER', 8, { brand: true });
text(375, 794, 'SEMI-MODULAR ANALOG', 8, { brand: true });
text(375, 806, 'PERCUSSION SYNTHESIZER', 8, { brand: true });
decor.push(
  { t: 'line', x1: P(205), y1: Q(788), x2: P(205), y2: Q(812), w: 1.5 },
  { t: 'line', x1: P(290), y1: Q(788), x2: P(290), y2: Q(812), w: 1.5 }
);
text(602, 800, 'moog', 34, { brand: true, weight: 400, spacing: '0.02em' });

// ── Areas (photo pixels, converted) ────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: P(x0),
  y: Q(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'pitch-eg',
    label: 'Pitch envelope, sync and FM',
    module: 'osc',
    keywords: 'vco decay pitch envelope eg seq pitch mod hard sync fm 1-2 fm amount',
    rects: [R(66, 380, 232, 610)],
    help: 'The VCO EG’s decay, which both EG AMOUNT knobs send to the oscillators; SEQ PITCH MOD, which chooses the oscillators the sequencer’s PITCH knobs move; and how VCO 1 acts on VCO 2: HARD SYNC and linear 1→2 FM.',
  },
  {
    id: 'vco1',
    label: 'VCO 1',
    module: 'osc',
    keywords: 'vco 1 oscillator frequency pitch wave triangle square eg amount',
    rects: [R(232, 380, 490, 505)],
    help: 'The first oscillator, over ten octaves, triangle or square, and how far the pitch envelope bends it.',
  },
  {
    id: 'vco2',
    label: 'VCO 2',
    module: 'osc',
    keywords: 'vco 2 oscillator frequency pitch wave triangle square eg amount',
    rects: [R(232, 505, 490, 610)],
    help: 'The second oscillator, as the first, which VCO 1 can sync and frequency-modulate.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level noise ext external audio white noise',
    rects: [R(490, 380, 560, 610)],
    help: 'Three levels into the filter: VCO 1, the white noise (or EXT AUDIO) and VCO 2. Together near the top they clip pleasantly.',
  },
  {
    id: 'vcf',
    label: 'Filter',
    module: 'filter',
    keywords:
      'vcf filter ladder low-pass high-pass lp hp cutoff resonance eg decay amount noise vcf mod',
    rects: [R(560, 380, 830, 505), R(560, 505, 880, 610)],
    help: 'A 4-pole Moog ladder, low-pass or high-pass, 20 Hz to 20 kHz. The VCF EG opens or closes it on each hit, and the noise (or the VCF MOD input) shakes it.',
  },
  {
    id: 'vca',
    label: 'VCA and volume',
    module: 'amp',
    keywords: 'vca eg fast slow attack decay volume output amplifier',
    rects: [R(830, 380, 990, 505), R(880, 505, 990, 610)],
    help: 'The VCA EG shapes each hit’s loudness: an attack of 1 ms or 100 ms, then its DECAY. VOLUME sets the output.',
  },
  {
    id: 'clock',
    label: 'Tempo and transport',
    module: 'mod',
    keywords: 'tempo clock run stop advance trigger sequencer transport',
    rects: [R(66, 610, 295, 832)],
    help: 'TEMPO sets the sequencer’s clock; RUN / STOP starts and stops it on the step it is on; with it stopped, ADVANCE steps without playing and TRIGGER plays the step without moving.',
  },
  {
    id: 'steps',
    label: 'Sequencer',
    module: 'mod',
    keywords: 'sequencer steps 8-step pitch velocity step lamps pattern rhythm',
    rects: [R(295, 610, 990, 775)],
    help: 'Eight steps, each with a PITCH and a VELOCITY knob and a lamp. The velocity row is the rhythm and the dynamics: a step at zero is silent. The pitch row moves the oscillators SEQ PITCH MOD chooses, and is at the PITCH output whatever it says.',
  },
  {
    id: 'patchbay',
    label: 'Patchbay',
    module: 'patch',
    keywords: 'patchbay patch jacks in out cv trigger velocity clock eg',
    rects: [R(990, 380, RIGHT, BOTTOM)],
    help: 'Twenty-four jacks, fifteen inputs and nine outputs (the outputs’ names are reversed). Everything is wired inside already, so a cable only changes the sound, never makes it work.',
  },
];

// ── Engine mapping ─────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  return dfamEngine(v, 'dfam');
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const dfam: SynthDef & { version: number } = {
  id: 'dfam',
  version: 1,
  name: 'DFAM',
  maker: 'Moog Music',
  year: 2017,
  heritage: 'An original Moog design, of the Mother-32 family',
  summary:
    'A semi-modular analogue percussion synth: two VCOs (triangle or square, with hard sync and linear FM) and white noise into a Moog ladder filter, low- or high-pass, and a VCA, each moved by its own decay envelope. An 8-step sequencer sets each step’s pitch and velocity, clocked from 10 to 10,000 BPM, with a 24-jack patchbay.',
  view: { w: (RIGHT - OX) * K + 2 * CHEEK, h: (BOTTOM - OY) * K },
  theme: {
    panel: PANEL,
    panel2: '#141416',
    ink: INK,
    font: 'din',
    weight: 700,
    cheeks: 'wood',
    cheekW: CHEEK,
    knobRing: true,
    jack: 'black',
  },
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    noise: 'the noise',
    dfmPitch: 'the step’s PITCH',
    dfmVel: 'the step’s VELOCITY',
    dfmTrig: 'TRIGGER OUT',
    dfmEgVco: 'the VCO EG',
    dfmEgVcf: 'the VCF EG',
    dfmEgVca: 'the VCA EG',
    vca: 'the VCA',
  },
  destNames: {
    dfmTrigIn: 'the envelopes’ TRIGGER',
    dfmVelIn: 'the envelopes’ VELOCITY',
    dfmDecVco: 'the VCO EG’s decay',
    dfmDecVcf: 'the VCF EG’s decay',
    dfmDecVca: 'the VCA EG’s decay',
    dfmExt: 'the mixer’s NOISE / EXT channel',
    dfmNzLvl: 'NOISE / EXT LEVEL',
    dfmTempo: 'the clock’s TEMPO',
    dfmRun: 'RUN / STOP',
    dfmAdv: 'the sequencer’s ADV / CLOCK',
    att2In: 'the cutoff, by NOISE / VCF MOD',
    pitch1: 'VCO 1’s pitch',
    pitch2: 'VCO 2’s pitch',
    fmLinAmt: '1→2 FM AMOUNT',
    amp: 'the VCA',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  ownSequencer: { run: 'seq.run' },
  defaultPatch: dfamDefaultPatch('dfam'),
  toEngine,
};

export default dfam;
