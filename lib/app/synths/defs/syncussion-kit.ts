/**
 * The Syncussion SY-1's voice and channel panel, shared by the Pearl original (`defs/pearl-syncussion.ts`) and the
 * Behringer recreation (`defs/behringer-syncussion.ts`). The two specs
 * (`.context/app/synth-data/<id>/<id>.synth.json`) describe the same two channels with the same eight faders,
 * three switches and OSC MODE knob; they differ in what surrounds them (the Behringer's FINE knobs, TRIG buttons and
 * top-panel sockets, the Pearl's trigger lamps and POWER switch), which each definition adds itself.
 *
 * The voice follows the specs' behaviours (b01–b07): two oscillators set by OSC MODE, a pitch sweep up or down, an
 * LFO and a sample and hold on pitch, a low-pass filter whose cutoff follows TUNE and which the decay envelope sweeps
 * down over the WIDTH range, and one decay envelope on the VCA. How hard a pad is hit (here, key velocity) sets the
 * envelope's level, so harder hits are louder and brighter. The two channels are two different voices, so the engine
 * runs them as EngineParams `dual` (the 2-XM's), split on the keyboard: keys below middle C play channel 1, the rest
 * channel 2. Neither channel follows the keyboard's pitch: TUNE sets it, as on the hardware.
 *
 * The specs leave some things out, and the choices made here are the app's, not the hardware's: the oscillators'
 * waveform (a triangle here), the filter's slope (12 dB here), the sweep's speeds and ranges, the depths of FM, of
 * the LFO and of mode D's sweep, and the sample and hold's source (noise, as both specs assume). The notes say so.
 *
 * Positions are in channel units: the Behringer's panel drawing (`raw/behringer-syncussion-panel.png`, its channel 1),
 * which each definition offsets to where its channel sits.
 */
import type {
  Area,
  Control,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  FaderControl,
  TextDecor,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

/** One channel's settings, as `dual` takes them. */
type Voice = Omit<EngineParams, 'volume' | 'dual'>;

export type Channel = 1 | 2;

/** What draws differently on the two panels. */
export type Variant = 'pearl' | 'behringer';

// ── The voice ─────────────────────────────────────────────────────────────

/** TUNE 0–10 → MIDI note of oscillator 1 (41 Hz to 2.6 kHz, the range of a drum from kick to bell). */
export const tuneNote = (tune: number, fine = 5): number => 28 + 7.2 * tune + (fine - 5) / 5;
/** Oscillator 2 sits 450 / 440 Hz above oscillator 1 (b07: the original's trimmer settings). */
export const OSC2_SEMI = 12 * Math.log2(450 / 440);
/** DECAY 0–10 → seconds, the specs' 6 ms to 2.5 s. */
export const decayS = (v: number): number => expMap(v / 10, 0.006, 2.5);
/** SWEEP SPEED 0–10 → seconds the sweep takes to settle, slow at 0. */
export const sweepS = (v: number): number => expMap(1 - v / 10, 0.02, 2.5);
/** SWEEP RANGE 0–10 → semitones the sweep travels, up to three octaves. */
export const sweepSemi = (v: number): number => (v / 10) * 36;
/** LFO SPEED 0–10 → Hz, the Behringer's 0.4 to 50 Hz. */
export const lfoHz = (v: number): number => expMap(v / 10, 0.4, 50);
/** LFO DEPTH 0–10 → semitones either way at full swing (square law, so small vibrato sits low on the fader). */
export const lfoSemi = (v: number): number => Math.pow(v / 10, 2) * 12;
/** WIDTH 0–10 → octaves the decay envelope opens the filter above its TUNE cutoff. */
export const widthOct = (v: number): number => (v / 10) * 6;
/** Oscillator 1's FM of oscillator 2 in modes B and E, semitones at full swing. */
export const FM_SEMI = 24;
/** Mode D: the hit-strength sweep on oscillator 1 and the decay sweep on oscillator 2, semitones. */
export const MODE_D_SEMI: [number, number] = [-24, -12];

const hz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** What OSC MODE puts in the mixer: oscillator 1, oscillator 2, noise. */
const MIX: Record<string, [number, number, number]> = {
  A: [1, 0, 0],
  B: [0, 1, 0],
  C: [0.6, 1, 0],
  D: [0.6, 1, 0],
  E: [0, 1, 0.5],
  F: [0, 0, 1],
};

/** One channel's voice from the panel. `fine` is the Behringer's FINE knob (the Pearl has none: centred). */
export function channelVoice(v: ControlValues, ch: Channel): Voice {
  const c = (id: string): number => num(v, `ch${ch}.${id}`);
  const fine = v[`ch${ch}.fine`];
  const mode = String(v[`ch${ch}.mode`]);
  const [l1, l2, ln] = MIX[mode] ?? MIX.A;
  const note = tuneNote(c('tune'), typeof fine === 'number' ? fine : 5);
  const decay = decayS(c('decay'));
  const routes: EngineRoute[] = [];
  const both = (src: string, amt: number): void => {
    if (amt) routes.push({ src, dst: 'pitch1', amt }, { src, dst: 'pitch2', amt });
  };

  // the pitch sweep: from the struck pitch towards TUNE ± RANGE, so the oscillators start offset and the envelope
  // pulls them back. Mode D replaces it with its own (b01).
  const dir = v[`ch${ch}.sweep`];
  const sign = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
  const range = mode === 'D' ? 0 : sign * sweepSemi(c('sweepRange'));
  both('env2', -range);
  if (mode === 'D') {
    routes.push(
      { src: 'env1v', dst: 'pitch1', amt: MODE_D_SEMI[0] },
      { src: 'env1', dst: 'pitch2', amt: MODE_D_SEMI[1] }
    );
  }
  if (mode === 'B' || mode === 'E') routes.push({ src: 'osc1', dst: 'pitch2', amt: FM_SEMI });

  // the LFO and the sample and hold share LFO SPEED and LFO DEPTH (b03)
  const wave = v[`ch${ch}.lfoWave`];
  const depth = lfoSemi(c('lfoDepth'));
  if (wave !== 'off') both('lfo', depth);
  if (v[`ch${ch}.sh`]) both('sh', depth);

  const cutoff = Math.min(hz(note) * 2, 18000);
  return {
    osc: [
      { level: l1, mix: { tri: 1 }, semi: range, kbd: false, fixedNote: note },
      { level: l2, mix: { tri: 1 }, semi: OSC2_SEMI + range, kbd: false, fixedNote: note },
    ],
    noise: { level: ln, color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff,
      res: 0,
      envAmt: widthOct(c('width')),
      envSrc: 'env1v',
      kbd: 0,
    },
    // one decay, no sustain: letting go of the key changes nothing
    env1: { a: 0.001, d: decay, s: 0, r: decay },
    env2: { a: 0.001, d: sweepS(c('sweepSpeed')), s: 0, r: sweepS(c('sweepSpeed')) },
    vca: { envSrc: 'env1v', bias: 0 },
    lfo: {
      rate: lfoHz(c('lfoSpeed')),
      mix: wave === 'square' ? { sq: 1 } : wave === 'triangle' ? { tri: 1 } : {},
      keySync: false,
    },
    sh: { rate: lfoHz(c('lfoSpeed')), glide: 0 },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    routes,
    tune: 0,
  };
}

/** Middle C: keys below it play channel 1, keys from it up channel 2. */
export const SPLIT = 60;

/** Both channels, mixed by their OUTPUT faders. */
export function syncussionEngine(v: ControlValues, volume: number): EngineParams {
  return {
    ...channelVoice(v, 1),
    volume,
    dual: {
      b: channelVoice(v, 2),
      assign: 'split',
      split: SPLIT,
      level: [level10(num(v, 'ch1.output'), 1.6), level10(num(v, 'ch2.output'), 1.6)],
      pan: [0, 0],
    },
  };
}

// ── The channel panel ─────────────────────────────────────────────────────

/** Fader columns, in channel units. */
export const COL = {
  mode: 161,
  tune: 261,
  decay: 337,
  width: 414,
  sweepSpeed: 490,
  sweepRange: 566,
  lfoSpeed: 642,
  lfoDepth: 719,
  sh: 813,
  output: 906,
} as const;
/** Fader centre, travel, and the row of switches under the faders. */
const FY = 344;
const FLEN = 209;
const LOW = 527;

export interface PanelParts {
  controls: Control[];
  decor: Decor[];
  areas: Area[];
}

export const MODE_MEANING: Record<string, string> = {
  A: 'one oscillator',
  B: 'FM, metallic',
  C: 'two oscillators, vibraphone-like',
  D: 'two oscillators, swept by the hit',
  E: 'FM plus noise, thin metal',
  F: 'noise only',
};

/**
 * Draw one channel at `dx`, `dy` (channel units are the Behringer drawing's channel 1). Returns nothing: it pushes
 * into `p`. The Pearl and the Behringer then add their own surrounds.
 */
export function drawChannel(
  p: PanelParts,
  ch: Channel,
  dx: number,
  dy: number,
  variant: Variant,
  ink: string
): void {
  const X = (x: number): number => x + dx;
  const Y = (y: number): number => y + dy;
  const id = (s: string): string => `ch${ch}.${s}`;
  const text = (
    x: number,
    y: number,
    t: string,
    size = 17,
    rest: Partial<TextDecor> = {}
  ): void => {
    p.decor.push({ t: 'text', x: X(x), y: Y(y), text: t, size, anchor: 'middle', ...rest });
  };
  const pearl = variant === 'pearl';
  const other = ch === 1 ? 'channel 2' : 'channel 1';
  const keys = ch === 1 ? 'the keys below middle C' : 'middle C and the keys above it';

  // the channel frame, its name, and the legend bar along its top
  p.decor.push({
    t: 'rect',
    x: X(67),
    y: Y(165),
    w: 895,
    h: 407,
    r: 2,
    fill: 'none',
    stroke: ink,
    sw: 2,
  });
  text(145, 132, pearl ? `— CH. ${ch} —` : `— CH ${ch} —`, 17);
  // the solid strips fill the gaps between the legends, which sit at their columns
  const legends: [number, string][] = [
    [145, pearl ? 'OSC. MODE' : 'OSC MODE'],
    [261, 'TUNE'],
    [337, 'DECAY'],
    [414, 'WIDTH'],
    [528, 'SWEEP'],
    [683, pearl ? 'L.F.O.' : 'LFO'],
    [813, 'S/H'],
    [905, 'OUTPUT'],
  ];
  const half = (t: string): number => t.length * 6.2 + 8;
  const strip = (x0: number, x1: number): void => {
    if (x1 - x0 > 4)
      p.decor.push({ t: 'rect', x: X(x0), y: Y(143), w: x1 - x0, h: 22, r: 0, fill: ink });
  };
  let from = 67;
  for (const [x, t] of legends) {
    strip(from, x - half(t));
    from = x + half(t);
  }
  strip(from, 962);
  for (const [x, t] of legends) text(x, 161, t, 19);
  text(490, 198, 'SPEED', 14);
  text(566, 198, 'RANGE', 14);
  text(642, 198, 'SPEED', 14);
  text(719, 198, 'DEPTH', 14);
  p.decor.push(
    { t: 'line', x1: X(520), y1: Y(193), x2: X(538), y2: Y(193), w: 1.5 },
    { t: 'line', x1: X(596), y1: Y(193), x2: X(612), y2: Y(193), w: 1.5 },
    { t: 'circle', x: X(680), y: Y(193), r: 5, fill: ink, stroke: 'none' }
  );

  // the printed scale: eleven lines behind the seven faders, and the OUTPUT fader's own
  for (let i = 0; i <= 10; i++) {
    const y = FY + FLEN / 2 - (i * FLEN) / 10;
    const w = i % 5 === 0 ? 2.5 : 1.2;
    p.decor.push(
      { t: 'line', x1: X(232), y1: Y(y), x2: X(750), y2: Y(y), w },
      { t: 'line', x1: X(880), y1: Y(y), x2: X(934), y2: Y(y), w }
    );
  }
  for (const [n, y] of [
    ['10', FY - FLEN / 2],
    ['5', FY],
    ['0', FY + FLEN / 2],
  ] as const) {
    text(214, y + 6, n, 15);
    text(860, y + 6, n, 15);
  }

  // OSC MODE: the knob, and the letters A–F with their lines to it
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const angles = [-30, -54, -78, -102, -126, -150];
  letters.forEach((l, i) => {
    const y = 278 + 26.2 * i;
    p.decor.push({
      t: 'rect',
      x: X(81),
      y: Y(y - 12),
      w: 22,
      h: 24,
      r: 0,
      fill: 'none',
      stroke: ink,
      sw: 1.5,
    });
    text(92, y + 7, l, 18);
    const a = (angles[i] * Math.PI) / 180;
    p.decor.push({
      t: 'line',
      x1: X(104),
      y1: Y(y),
      x2: X(COL.mode + Math.sin(a) * 40),
      y2: Y(FY - Math.cos(a) * 40),
      w: 1.2,
    });
  });
  p.controls.push({
    id: id('mode'),
    type: 'knob',
    x: X(COL.mode),
    y: Y(FY),
    r: pearl ? 38 : 30,
    style: 'obxa',
    labelPos: 'none',
    kind: 'enum',
    module: 'osc',
    options: letters.map((l, i) => ({ v: l, label: '', a: angles[i] })),
    def: 'A',
    fmt: (o) => `${o}: ${MODE_MEANING[String(o)] ?? ''}`,
    label: 'OSC MODE',
    name: `OSC MODE (channel ${ch})`,
    help: 'Chooses what the channel is made of. A is one oscillator, the classic drum-synth tom. B has oscillator 1 bend the pitch of oscillator 2 so fast it turns metallic (FM). C mixes the two, a little apart, for a vibraphone-like ring. D mixes them and lets how hard you hit set the sweep. E is B with noise, like struck thin metal. F is noise alone, for snares, hats and claps.',
  });

  const fader = (
    key: keyof typeof COL,
    label: string,
    module: Control['module'],
    help: string,
    rest: Partial<FaderControl> = {}
  ): void => {
    p.controls.push({
      id: id(key),
      type: 'fader',
      x: X(COL[key]),
      y: Y(FY),
      len: FLEN,
      orient: 'v',
      ticks: 0,
      pad: 14,
      face: 'block',
      cap: '#141414',
      kind: 'cont',
      min: 0,
      max: 10,
      def: 5,
      labelPos: 'none',
      label,
      name: `${label} (channel ${ch})`,
      module,
      help,
      ...rest,
    });
  };
  fader(
    'tune',
    'TUNE',
    'osc',
    'Sets the pitch of the drum: both oscillators, and the filter with them. Low for kicks and toms, high for bells and pings. The keys only strike the drum; they do not change its pitch.',
    { def: 3, fmt: (t) => fmtHz(hz(tuneNote(t))) }
  );
  fader(
    'decay',
    'DECAY',
    'env',
    'How long the drum rings after it is struck, from a 6 ms click to two and a half seconds. The same decay closes the filter, so a short one is also a dull one.',
    { def: 3, fmt: (t) => fmtTime(decayS(t)) }
  );
  fader(
    'width',
    'WIDTH',
    'filter',
    'How bright the strike is. The filter starts open by up to six octaves above TUNE and closes back as the drum decays: high WIDTH gives a bright crack that falls away, low WIDTH a soft thud that stays near the tuned pitch.',
    { def: 4, fmt: (t) => `${widthOct(t).toFixed(1)} oct` }
  );
  fader(
    'sweepSpeed',
    'SWEEP SPEED',
    'mod',
    'How fast the pitch travels from where it is struck to where the sweep ends: slow for a long laser fall, fast for the thump of a synth tom. Does nothing with SWEEP off, or in mode D.',
    { fmt: (t) => fmtTime(sweepS(t)) }
  );
  fader(
    'sweepRange',
    'SWEEP RANGE',
    'mod',
    'How far the sweep travels, up to three octaves, and so where the pitch ends up. The end follows TUNE. Does nothing with SWEEP off, or in mode D.',
    { def: 4, fmt: (t) => fmtSemi(sweepSemi(t)) }
  );
  fader(
    'lfoSpeed',
    'LFO SPEED',
    'lfo',
    'The speed of the LFO, from a slow 0.4 Hz wobble to a 50 Hz buzz, and how often the sample and hold picks a new pitch.',
    { fmt: (t) => fmtHz(lfoHz(t)) }
  );
  fader(
    'lfoDepth',
    'LFO DEPTH',
    'lfo',
    'How far the LFO and the sample and hold move the pitch, up to an octave either way. Low for vibrato, high for warbles and robot chatter.',
    { def: 0, fmt: (t) => fmtSemi(lfoSemi(t)) }
  );
  fader(
    'output',
    'OUTPUT',
    'out',
    `The channel’s level. Here channel ${ch} plays from ${keys}; turn ${other} down to hear this one alone.`,
    { def: 8 }
  );

  // the switches under the faders: SWEEP and LFO WAVE throw left, centre (off) and right
  p.controls.push({
    id: id('sweep'),
    type: 'toggle',
    orient: 'h',
    x: X(COL.sweepRange),
    y: Y(LOW),
    w: 26,
    lean: 0.6,
    kind: 'enum',
    module: 'mod',
    options: [
      { v: 'up', label: 'Up' },
      { v: 'off', label: 'Off' },
      { v: 'down', label: 'Down' },
    ],
    def: 'down',
    labelPos: 'none',
    label: 'SWEEP',
    name: `SWEEP (channel ${ch})`,
    help: 'Sweeps the pitch on every strike: DOWN falls from the struck pitch, the classic synth-tom “pew”; UP rises, for lasers and blips; OFF holds the tuned pitch. SPEED and RANGE set how fast and how far.',
  });
  text(COL.sweepRange, LOW - 26, 'OFF', 15);
  text(COL.sweepRange - 30, LOW + 32, 'UP', 15);
  text(COL.sweepRange + 32, LOW + 32, 'DOWN', 15);

  p.controls.push({
    id: id('lfoWave'),
    type: 'toggle',
    orient: 'h',
    x: X(COL.lfoDepth),
    y: Y(LOW),
    w: 26,
    lean: 0.6,
    kind: 'enum',
    module: 'lfo',
    options: [
      { v: 'square', label: 'Square' },
      { v: 'off', label: 'Off' },
      { v: 'triangle', label: 'Triangle' },
    ],
    def: 'off',
    labelPos: 'none',
    label: 'LFO WAVE',
    name: `LFO WAVE (channel ${ch})`,
    help: 'The LFO’s shape: square jumps the pitch between two notes, a trill; triangle swings it smoothly, a siren or vibrato. OFF stops the LFO, but not the sample and hold.',
  });
  text(COL.lfoDepth, LOW - 26, 'OFF', 15);
  p.decor.push(
    { t: 'wave', x: X(COL.lfoDepth - 32), y: Y(LOW + 28), size: 12, shape: 'sq' },
    { t: 'wave', x: X(COL.lfoDepth + 30), y: Y(LOW + 28), size: 12, shape: 'tri' }
  );

  // S&H: a toggle up for ON on the Behringer; left OFF, right ON on the Pearl
  p.controls.push({
    id: id('sh'),
    type: 'toggle',
    ...(pearl ? { orient: 'h' as const, onAt: 'bottom' as const } : {}),
    x: X(COL.sh),
    y: Y(pearl ? 330 : 355),
    w: 26,
    lean: 0.6,
    kind: 'bool',
    def: false,
    module: 'lfo',
    labelPos: 'none',
    label: 'S/H',
    name: `S/H (channel ${ch})`,
    help: 'Sample and hold: the pitch jumps to a new random note at the LFO SPEED rate, by up to LFO DEPTH. It works with the LFO wave switched off, and is the Syncussion’s robot-chatter and random-bleep sound.',
  });
  if (pearl) {
    text(COL.sh - 30, 312, 'OFF', 14);
    text(COL.sh + 30, 312, 'ON', 14);
  } else {
    text(COL.sh, 298, 'ON', 15);
    text(COL.sh, 402, 'OFF', 15);
  }

  // the areas: every control of the channel sits in exactly one
  const R = (x0: number, x1: number, y0 = 125, y1 = 575) => ({
    x: X(x0),
    y: Y(y0),
    w: x1 - x0,
    h: y1 - y0,
  });
  const n = `channel ${ch}`;
  p.areas.push(
    {
      id: `ch${ch}-osc`,
      label: `Oscillators, ${n}`,
      module: 'osc',
      keywords: 'osc mode fm noise vco oscillator mix metallic',
      rects: [R(67, 225)],
      help: `Each channel has two oscillators and a noise source, and OSC MODE chooses how they combine: one oscillator, FM, a mix of two, or noise. Here ${n} plays from ${keys}.`,
    },
    {
      id: `ch${ch}-tune`,
      label: `Tune, ${n}`,
      module: 'osc',
      keywords: 'pitch tuning frequency fine',
      rects: [R(225, 299)],
      help: 'TUNE sets the drum’s pitch, and the filter follows it. The keys strike the drum; they do not play notes.',
    },
    {
      id: `ch${ch}-decay`,
      label: `Decay and width, ${n}`,
      module: 'env',
      keywords: 'envelope length filter brightness cutoff dynamics velocity',
      rects: [R(299, 452)],
      help: 'One decay envelope fades the drum and closes its low-pass filter together. DECAY sets how long it rings; WIDTH how bright the strike starts before the filter falls back to the tuned pitch. Hit harder (play with more velocity) for a louder, brighter drum.',
    },
    {
      id: `ch${ch}-sweep`,
      label: `Sweep, ${n}`,
      module: 'mod',
      keywords: 'pitch envelope bend tom laser pew',
      rects: [R(452, 604)],
      help: 'The pitch sweep that makes the Syncussion’s famous falling tom: every strike starts the pitch at TUNE and slides it down (or up) by RANGE, at SPEED.',
    },
    {
      id: `ch${ch}-lfo`,
      label: `LFO, ${n}`,
      module: 'lfo',
      keywords: 'vibrato trill warble modulation square triangle',
      rects: [R(604, 762)],
      help: 'A square or triangle LFO on the pitch: SPEED sets its rate, DEPTH how far it moves the pitch, and the switch its shape or OFF.',
    },
    {
      id: `ch${ch}-sh`,
      label: `Sample and hold, ${n}`,
      module: 'lfo',
      keywords: 'random s&h sample hold robot bleeps',
      rects: [R(762, 856)],
      help: 'Random pitch steps at the LFO speed, by the LFO depth, even with the LFO switched off.',
    }
  );
}

/** The OUTPUT fader's area, which the Pearl shortens on channel 2 to fit its POWER switch. */
export function outputArea(ch: Channel, dx: number, dy: number, help: string, y1 = 575): Area {
  return {
    id: `ch${ch}-out`,
    label: `Output, channel ${ch}`,
    module: 'out',
    keywords: 'level volume',
    rects: [{ x: 856 + dx, y: 125 + dy, w: 106, h: y1 - 125 }],
    help,
  };
}
