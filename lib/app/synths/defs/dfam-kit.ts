/**
 * The DFAM's voice, controls and patchbay, shared by the Moog original (`defs/dfam.ts`) and the Behringer recreation
 * (`defs/edge.ts`). The two specs (`.context/app/synth-data/dfam/dfam.synth.json`, `edge/edge.synth.json`, 0.13.0)
 * describe the same module graph with the same parameter and port ids. The EDGE adds NOISE COLOR, a CLOCK switch with
 * SCALE, MIDI and USB, PHONES and a poly chain. The panels are laid out differently, so each definition places the
 * controls and jacks this kit describes, and draws its own faceplate.
 *
 * The sound is the engine's fixed voice with the DFAM core beside it (`audio/dfam-core.ts`, EngineParams `dfam`):
 * - VCO 1 and VCO 2 (triangle or square) are oscillators 1 and 2 on the keys from C4, so a key transposes them.
 * - Hard sync is `syncTo`, and 1→2 FM is linear (`fmLin`).
 * - The mixer's NOISE / EXT channel is the core's `dfmNz`, into `extIn`.
 * - The ladder filter is LP or HP. Its VCF EG and NOISE / VCF MOD are routes into `cutoff`; VCF MOD is attenuator 2,
 *   normalled to the noise.
 * - The VCA opens only from the core's VCA EG, a route into `amp`.
 * - The core's step pitch goes to the VCOs by SEQ PITCH MOD, and the VCO EG to each VCO at its own depth.
 *
 * The specs leave some things out, and the choices made here are the app's, not the hardware's:
 * - the VCOs' centre (C3), the pitch EG's depth and taper, and the 1→2 FM depth at full;
 * - the VCO and VCA decay ranges (the VCF's 10 ms to 10 s is stated; the others are given the same);
 * - the VCF EG's depth at full, and the noise's depth on the cutoff;
 * - the resonance's scale (self-oscillation from about 3:00, as stated for LP; the HP mode's different scaling is not
 *   modelled).
 * The notes say so.
 *
 * Panel values are the spec's: unipolar knobs 0–10 (7:00 to 5:00), bipolar ones −5 to +5.
 */
import type {
  CablePair,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  DefaultPatch,
  DefaultPatchStep,
  DfamEnv,
  DfamParams,
  EngineParams,
  EngineRoute,
  InputJack,
  OutputJack,
} from '@/lib/app/synths/contract';
import { DFAM_STEPS } from '@/lib/app/synths/audio/dfam-core';
import { num } from '@/lib/app/synths/lib/def-kit';
import {
  clamp,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  noteName,
} from '@/lib/app/synths/lib/maps';

/** Which panel a control or jack is described for: the names differ (VCO / OSC, RUN / STOP / PLAY/STOP …). */
export type Variant = 'dfam' | 'edge';

// ── Ranges and tapers (the app's where the spec is silent; see the docblock) ───
/** The VCOs' FREQUENCY at its centre, the PITCH knobs' centre too: C3. */
export const CENTRE_NOTE = 48;
/** FREQUENCY 0–10: ten octaves, ±5 either side of the centre. */
export const freqNote = (v: number): number => CENTRE_NOTE + (clamp(v, 0, 10) - 5) * 12;
/** A step's PITCH, −5..+5 (±5 V), in semitones at 1 V an octave. */
export const STEP_SEMI = 60;
/**
 * VCO EG AMOUNT at full either way, semitones: the EG's 8 V at the VCO's 1 V an octave. The knob's taper is square, so
 * the punch of a kick sits across the right half of its turn rather than in its last few degrees.
 */
export const EG_SEMI = 96;
export const egSemi = (a: number): number => {
  const x = clamp(a, -5, 5) / 5;
  return Math.sign(x) * x * x * EG_SEMI;
};
/** 1→2 FM AMOUNT at full: oscillator 2's frequency swings from nothing to three times itself. */
export const FM_FULL = 2;
export const fmDepth = (v: number): number => (clamp(v, 0, 10) / 10) * FM_FULL;
/** CUTOFF: 20 Hz to 20 kHz (the spec), exponential. */
export const cutoffHz = (v: number): number => expMap(clamp(v, 0, 10) / 10, 20, 20000);
/** RESONANCE: the ladder self-oscillates from about 3:00 (8 on the knob), as the manual says of LP. */
export const resonance = (v: number): number => Math.min(1.1, clamp(v, 0, 10) / 8);
/** VCF EG AMOUNT at full either way, octaves: the EG's 8 V at an octave a volt. */
export const VCF_EG_OCT = 8;
export const vcfEgOct = (a: number): number => (clamp(a, -5, 5) / 5) * VCF_EG_OCT;
/**
 * NOISE / VCF MOD at full, octaves of cutoff for a full-scale source: 5 V at VCF MOD, so a volt an octave at full (the
 * manual: turn it fully up for complete CV control of the cutoff), and the noise's full swing.
 */
export const VCF_MOD_OCT = 5;
export const vcfModOct = (v: number): number => (clamp(v, 0, 10) / 10) * VCF_MOD_OCT;
/** The three decays: 10 ms to 10 s (the VCF's, stated; the VCO's and VCA's are given the same). */
export const DECAY_MIN = 0.01;
export const DECAY_MAX = 10;
export const decayS = (v: number): number => expMap(clamp(v, 0, 10) / 10, DECAY_MIN, DECAY_MAX);
/** TEMPO: 0.7 to 700 Hz (the spec), exponential. */
export const tempoHz = (v: number): number => expMap(clamp(v, 0, 10) / 10, 0.7, 700);
/** A mixer level, 0..1. */
export const mixLevel = (v: number): number => clamp(v, 0, 10) / 10;
/** The EDGE's SCALE against MIDI or USB clock: steps a beat. */
export const SCALE_PER_BEAT: Record<string, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
  '1/32': 8,
  '1/4T': 1.5,
  '1/8T': 3,
  '1/16T': 6,
  '1/32T': 12,
};

const STEPS = Array.from({ length: DFAM_STEPS }, (_, i) => i + 1);

// ── Engine mapping ─────────────────────────────────────────────────────────

/** The panel's settings as the engine takes them. The EDGE reads its NOISE COLOR and CLOCK too. */
export function dfamEngine(v: ControlValues, variant: Variant): EngineParams {
  const wave = (n: 1 | 2) =>
    v[`vco${n}.wave`] === 'square' ? { mix: { pulse: 1 }, pw: 0.5 } : { mix: { tri: 1 } };
  // keys from C4: at C4 a VCO sounds its FREQUENCY
  const semi = (n: 1 | 2): number => freqNote(num(v, `vco${n}.freq`)) - 60;
  const mod = v['seq.pitch_mod'];
  const routes: EngineRoute[] = [
    { src: 'dfmNz', dst: 'extIn', amt: 1 },
    { src: 'dfmEgVco', dst: 'pitch1', amt: egSemi(num(v, 'vco1.eg_amt')) },
    { src: 'dfmEgVco', dst: 'pitch2', amt: egSemi(num(v, 'vco2.eg_amt')) },
    { src: 'dfmEgVcf', dst: 'cutoff', amt: vcfEgOct(num(v, 'vcf_eg.amt')) },
    { src: 'att2', dst: 'cutoff', amt: vcfModOct(num(v, 'vcfmod.amt')) },
    { src: 'dfmEgVca', dst: 'amp', amt: 1 },
  ];
  if (mod === 'vco12') routes.push({ src: 'dfmPitch', dst: 'pitch1', amt: STEP_SEMI });
  if (mod === 'vco12' || mod === 'vco2')
    routes.push({ src: 'dfmPitch', dst: 'pitch2', amt: STEP_SEMI });
  const env = (id: string, attack = 0.001): DfamEnv => ({
    decay: clamp(num(v, `${id}.decay`), 0, 10) / 10,
    min: DECAY_MIN,
    max: DECAY_MAX,
    attack,
  });
  const src = v['clock.source'];
  const perBeat =
    variant === 'edge' && (src === 'midi' || src === 'usb')
      ? SCALE_PER_BEAT[String(v['clock.scale'])] || 4
      : undefined;
  const dfam: DfamParams = {
    tempo: tempoHz(num(v, 'clock.tempo')),
    pitch: STEPS.map((i) => clamp(num(v, `seq.pitch${i}`), -5, 5) / 5),
    vel: STEPS.map((i) => clamp(num(v, `seq.vel${i}`), 0, 10) / 10),
    run: !!v['seq.run'],
    noise: mixLevel(num(v, 'mix.noise')),
    eg: [env('vco_eg'), env('vcf_eg'), env('vca_eg', v['vca_eg.attack'] === 'slow' ? 0.1 : 0.001)],
    ...(perBeat ? { perBeat } : {}),
  };
  const quiet = { a: 0.001, d: 0.1, s: 0, r: 0.1 };
  return {
    osc: [
      { level: mixLevel(num(v, 'mix.vco1')), ...wave(1), semi: semi(1) },
      {
        level: mixLevel(num(v, 'mix.vco2')),
        ...wave(2),
        semi: semi(2),
        syncTo: v['vco2.sync'] === 'on' ? 0 : -1,
        fmLin: { from: 0, depth: fmDepth(num(v, 'vco2.fm_amt')) },
      },
    ],
    // the voice's own noise only feeds the NOISE / EXT channel and VCF MOD; the core sets its level
    noise: {
      level: 0,
      color: variant === 'edge' && v['noise.color'] === 'pink' ? 'pink' : 'white',
    },
    ext: { level: 1 },
    filter: {
      type: 'ladder',
      mode: v['vcf.mode'] === 'hp' ? 'hp' : 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      res: resonance(num(v, 'vcf.resonance')),
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    // the voice's own envelopes do nothing: the core's three make the sound
    env1: quiet,
    env2: quiet,
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    // every key is a strike, legato or not
    trig: { retrig: true, drone: false, repeat: false },
    normals: { att2In: 'noise' },
    att: [1, 1],
    routes,
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
    dfam,
    // the sequencer runs on the app's clock (`f-own-sequencer`): a lit RUN / STOP waits for Play on the bar
    follow: true,
  };
}

// ── Controls ───────────────────────────────────────────────────────────────

type Spec = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  (
    | {
        kind: 'cont';
        min: number;
        max: number;
        def: number;
        fmt?: (v: number, values?: ControlValues) => string;
      }
    | { kind: 'enum'; def: string; options: ControlOption[] }
    | { kind: 'bool'; def: boolean }
  );

const osc = (variant: Variant, n: 1 | 2): string => (variant === 'dfam' ? `VCO ${n}` : `OSC ${n}`);
const both = (variant: Variant): string => (variant === 'dfam' ? 'VCO 1&2' : 'OSC 1&2');
const run = (variant: Variant): string => (variant === 'dfam' ? 'RUN / STOP' : 'PLAY/STOP');

/**
 * The Default patch, which `init` already is (every control's `def`): VCO 1 alone on its triangle at C3, every
 * envelope amount at the centre and the filter fully open, the VCA EG fast with a short decay, the sequencer stopped
 * with every PITCH at the centre and every VELOCITY at full. A key then strikes one plain, round hit at the pitch played.
 */
export function dfamSpecs(variant: Variant): Record<string, Spec> {
  const o1 = osc(variant, 1),
    o2 = osc(variant, 2);
  const s: Record<string, Spec> = {};
  for (const n of [1, 2] as const) {
    const o = osc(variant, n);
    s[`vco${n}.freq`] = {
      module: 'osc',
      kind: 'cont',
      min: 0,
      max: 10,
      def: 5,
      label: variant === 'dfam' ? `${o} FREQUENCY` : 'FREQUENCY',
      name: `${o} FREQUENCY`,
      fmt: (x) => {
        const hz = 440 * Math.pow(2, (freqNote(x) - 69) / 12);
        return `${noteName(hz)} · ${fmtHz(hz)}`;
      },
      help: `${o}’s starting pitch over ten octaves. At the centre it matches the PITCH knobs’ centre; here that is C3. The sequencer’s PITCH, the ${variant === 'dfam' ? 'VCO' : 'OSC'} EG and the keys all add to it (a key plays from C4), so if the drum goes silent it has probably left the range you can hear: centre this knob first.`,
    };
    s[`vco${n}.wave`] = {
      module: 'osc',
      kind: 'enum',
      def: 'triangle',
      options: [
        { v: 'square', label: 'Square' },
        { v: 'triangle', label: 'Triangle' },
      ],
      label: variant === 'dfam' ? `${o} WAVE` : 'SHAPE',
      name: `${o} ${variant === 'dfam' ? 'WAVE' : 'SHAPE'}`,
      help: `${o}’s waveform. Triangle is smooth and round, nearly all fundamental: toms, marimbas and the classic analogue drums. Square is fuller and harder, for deep bass hits and, with FM, metallic tones.`,
    };
    s[`vco${n}.eg_amt`] = {
      module: 'osc',
      kind: 'cont',
      min: -5,
      max: 5,
      def: 0,
      label: variant === 'dfam' ? `${o} EG AMOUNT` : 'ENVELOPE',
      name: `${o} EG AMOUNT`,
      fmt: (x) => `${fmtSemi(egSemi(x))} at full velocity`,
      help: `How far the ${variant === 'dfam' ? 'VCO' : 'OSC'} EG bends ${o}’s pitch on each hit. Right of centre the pitch jumps up and falls back (the punch of a kick); left of centre it dips and rises back (a boingy, video-game drop). At the centre it does nothing. The decay knob sets how fast it returns.`,
    };
    s[`mix.vco${n}`] = {
      module: 'mixer',
      kind: 'cont',
      min: 0,
      max: 10,
      def: n === 1 ? 7 : 0,
      label: variant === 'dfam' ? `${o} LEVEL` : 'LEVEL',
      name: `${o} LEVEL`,
      help: `${o}’s level into the filter. High levels together drive the mixer into a pleasant clip; lower ones leave more headroom and dynamics. A square sounds louder than a triangle at the same level.`,
    };
  }
  s['vco_eg.decay'] = {
    module: 'env',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 2,
    label: variant === 'dfam' ? 'VCO DECAY' : 'DECAY',
    name: `${variant === 'dfam' ? 'VCO' : 'EG (OSC 1&2)'} DECAY`,
    fmt: (x) => fmtTime(decayS(x)),
    help: `How quickly the pitch envelope falls away: almost at once fully left (a sharp click of pitch), the punch of a drumhead around 9 to 10 o’clock, slow booms and space sounds from 12 o’clock up. It moves the pitch only through the two EG AMOUNT knobs, so with both at the centre it seems to do nothing.${variant === 'edge' ? ' The EDGE’s guide calls it a depth; it is the decay time, as on the DFAM.' : ''}`,
  };
  s['seq.pitch_mod'] = {
    module: 'mod',
    kind: 'enum',
    def: 'off',
    options: [
      { v: 'vco12', label: both(variant) },
      { v: 'off', label: 'Off' },
      { v: 'vco2', label: o2 },
    ],
    label: 'SEQ PITCH MOD',
    help: `Which oscillators the sequencer’s PITCH knobs move. ${both(variant)}: both, for sequenced bass and lead lines. ${o2}: only ${o2}, adding motion to an FM or synced sound while ${o1} holds the drum’s pitch. OFF: neither, leaving the PITCH knobs for the PITCH output (into VCA DECAY for hi-hats that vary step by step).`,
  };
  s['vco2.sync'] = {
    module: 'osc',
    kind: 'enum',
    def: 'off',
    options: [
      { v: 'on', label: 'On' },
      { v: 'off', label: 'Off' },
    ],
    label: 'HARD SYNC',
    help: `Locks ${o2}’s cycle to ${o1}’s, so ${o2} keeps ${o1}’s pitch while its own FREQUENCY changes its tone: sharp, metallic and flanged sounds. Set ${o2} below ${o1} and it has little or no output, a square especially.`,
  };
  s['vco2.fm_amt'] = {
    module: 'osc',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: variant === 'dfam' ? '1→2 FM AMOUNT' : '1-2 FM AMT',
    name: '1→2 FM AMOUNT',
    help: `How much ${o1} frequency-modulates ${o2}: a fast wobble of its pitch that adds new sidebands, springy, bell-like or harsh depending on the two pitches. It is linear FM, so ${o2}’s pitch holds while its tone grows. Clearest with HARD SYNC off.`,
  };
  if (variant === 'edge')
    s['noise.color'] = {
      module: 'mixer',
      kind: 'enum',
      def: 'white',
      options: [
        { v: 'pink', label: 'Pink' },
        { v: 'white', label: 'White' },
      ],
      label: 'COLOR',
      name: 'NOISE COLOR',
      help: 'White noise is bright, for hats and the snap of a snare; pink is darker, for brushes, toms and wind. It colours the noise into the mixer and the noise moving the filter alike.',
    };
  s['mix.noise'] = {
    module: 'mixer',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: variant === 'dfam' ? 'NOISE / EXT LEVEL' : 'NOISE/EXT',
    name: 'NOISE / EXT LEVEL',
    help: 'The noise’s level into the filter: snares and hi-hats, and a more natural attack under a pitched drum. A cable in EXT AUDIO replaces the noise with that signal, at this level. The NOISE LEVEL input adds to it.',
  };
  s['vcf.mode'] = {
    module: 'filter',
    kind: 'enum',
    def: 'lp',
    options: [
      { v: 'hp', label: 'HP' },
      { v: 'lp', label: 'LP' },
    ],
    label: 'VCF',
    name: variant === 'dfam' ? 'VCF (LP / HP)' : 'VCF SELECT',
    help: 'The ladder filter’s mode. LP keeps the lows and takes away the highs above CUTOFF: thick, dark and natural. HP takes away the lows below CUTOFF: bright, thin and snappy.',
  };
  s['vcf.cutoff'] = {
    module: 'filter',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 10,
    label: 'CUTOFF',
    fmt: (x) => fmtHz(cutoffHz(x)),
    help: 'Where the filter starts to cut, 20 Hz to 20 kHz, 24 dB an octave. In LP, right is brighter; in HP, right is thinner. If the drum seems silent, centre CUTOFF and VCF EG AMOUNT and put the filter on LP.',
  };
  s['vcf.resonance'] = {
    module: 'filter',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: 'RESONANCE',
    help: 'A peak at the cutoff that exaggerates everything moving it, a squawk on each hit; it thins the low end as it rises. From about 3 o’clock in LP the filter sings on its own as a sine, another source you can play with the cutoff.',
  };
  s['vcf_eg.decay'] = {
    module: 'env',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 3,
    label: variant === 'dfam' ? 'VCF DECAY' : 'DECAY',
    name: variant === 'dfam' ? 'VCF DECAY' : 'DECAY (FILTER)',
    fmt: (x) => fmtTime(decayS(x)),
    help: 'How quickly the filter envelope falls away, 10 ms to 10 s: a tap or click fully left, a sharp slap around 10 o’clock, a natural sweep at 12, long and aggressive tails beyond. Heard only through VCF EG AMOUNT.',
  };
  s['vcf_eg.amt'] = {
    module: 'filter',
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    label: variant === 'dfam' ? 'VCF EG AMOUNT' : 'ENVELOPE',
    name: variant === 'dfam' ? 'VCF EG AMOUNT' : 'ENVELOPE (FILTER)',
    fmt: (x) =>
      `${vcfEgOct(x) >= 0 ? '+' : '−'}${Math.abs(vcfEgOct(x)).toFixed(1)} oct at full velocity`,
    help: 'How far the VCF EG moves the cutoff on each hit. Right of centre it opens it and lets it fall back (articulate, dynamic); left of centre it closes it and lets it bloom back. Either way in LP or HP. At the centre it does nothing.',
  };
  s['vcfmod.amt'] = {
    module: 'filter',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: variant === 'dfam' ? 'NOISE / VCF MOD' : 'NOISE/VCF MOD',
    name: 'NOISE / VCF MOD',
    help: 'How much the noise shakes the cutoff: dirt, sizzle on a cymbal, a lo-fi edge. A cable in VCF MOD replaces the noise as the source, so this becomes that signal’s depth; turn it fully up for the whole of it. It is the only direct way to move the cutoff from a cable.',
  };
  s['vca_eg.attack'] = {
    module: 'amp',
    kind: 'enum',
    def: 'fast',
    options: [
      { v: 'fast', label: 'Fast (1 ms)' },
      { v: 'slow', label: 'Slow (100 ms)' },
    ],
    label: variant === 'dfam' ? 'VCA EG' : 'VCA MODE',
    help: 'The VCA envelope’s attack. FAST, 1 ms as the other two envelopes have: snap and punch. SLOW, 100 ms: soft mallets, brushes and gongs, and a glide-like smoothing on a sequenced bass. With a short VCA DECAY, SLOW softens the most.',
  };
  s['vca_eg.decay'] = {
    module: 'amp',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 3,
    label: variant === 'dfam' ? 'VCA DECAY' : 'DECAY',
    name: variant === 'dfam' ? 'VCA DECAY' : 'DECAY (VCA)',
    fmt: (x) => fmtTime(decayS(x)),
    help: 'How long each hit sounds. Fully left almost nothing comes through (tight hats); 9 o’clock a blip or clap; 10 to 11 a short thump or a tuned drum that starts to ring; 12 and beyond the hits ring out and wash together.',
  };
  s['out.volume'] = {
    module: 'out',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    label: 'VOLUME',
    help: 'The output level.',
  };
  s['clock.tempo'] = {
    module: 'mod',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    label: 'TEMPO',
    fmt: (x) => `${fmtHz(tempoHz(x))} · ${Math.round(tempoHz(x) * 15)} BPM in 16ths`,
    help: `The sequencer’s clock, 0.7 to 700 steps a second: about 10 to 10,000 BPM if a step is a sixteenth. It is an oscillator, and its input takes it into audio rate. In this app it follows the bar’s tempo: each step lasts the nearest whole division of the beat to the rate this sets, so turning it chooses how many steps a beat (from about 20 steps a second it runs free, as an oscillator). A cable in ADV / CLOCK takes over from it.${variant === 'edge' ? ' With CLOCK on MIDI or USB it does nothing: SCALE sets the steps.' : ''}`,
  };
  if (variant === 'edge') {
    s['clock.source'] = {
      module: 'mod',
      kind: 'enum',
      def: 'int_ext',
      options: [
        { v: 'midi', label: 'MIDI' },
        { v: 'usb', label: 'USB' },
        { v: 'int_ext', label: 'INT/EXT' },
      ],
      label: 'CLOCK',
      help: 'Where the sequencer’s clock comes from. INT/EXT: TEMPO, or a clock in ADV / CLOCK. MIDI or USB: the incoming MIDI clock, divided by SCALE. Here both MIDI and USB are the app’s own clock, Play on the bar.',
    };
    s['clock.scale'] = {
      module: 'mod',
      kind: 'enum',
      def: '1/16',
      options: Object.keys(SCALE_PER_BEAT).map((k) => ({ v: k, label: k })),
      label: 'SCALE',
      help: 'How long a step is against MIDI or USB clock: a quarter, eighth, sixteenth or thirty-second note, straight or as a triplet (T). Only with CLOCK on MIDI or USB.',
    };
  }
  for (const i of STEPS) {
    s[`seq.pitch${i}`] = {
      module: 'mod',
      kind: 'cont',
      min: -5,
      max: 5,
      def: 0,
      label: `PITCH ${i}`,
      fmt: (x) => `${fmtSemi((clamp(x, -5, 5) / 5) * STEP_SEMI)} (${clamp(x, -5, 5).toFixed(1)} V)`,
      help: `Step ${i}’s pitch, ±5 V: right of centre raises the oscillators SEQ PITCH MOD chooses for this step only, left lowers them. Its range is about ten octaves, so small turns matter. The voltage is also at the PITCH output.`,
    };
    s[`seq.vel${i}`] = {
      module: 'mod',
      kind: 'cont',
      min: 0,
      max: 10,
      def: 10,
      label: `${variant === 'dfam' ? 'VELOCITY' : 'VEL'} ${i}`,
      fmt: (x) => `${((clamp(x, 0, 10) / 10) * 5).toFixed(1)} V`,
      help: `Step ${i}’s velocity, 0 to 5 V: the peak of all three envelopes, so how loud and how punchy the hit is, and a little longer decays. Fully left the step is silent, so the velocity row is also the rhythm. The voltage is also at the VELOCITY output.`,
    };
  }
  s['seq.run'] = {
    module: 'mod',
    kind: 'bool',
    def: false,
    label: run(variant),
    help: `Starts the sequencer from the step it is on, at the tempo, and stops it there. Lit while it runs. A cable in the ${run(variant)} input takes over from it. In this app the sequencer runs on the app’s clock: lit, it plays while Play on the bar runs, from step 1 on its downbeat, and stops with Stop. Lighting it while nothing plays presses Play for you.`,
  };
  s['seq.advance'] = {
    module: 'mod',
    kind: 'bool',
    def: false,
    ui: true,
    label: 'ADVANCE',
    help: 'With the sequencer stopped, moves it on a step without playing it, to tune the pattern a step at a time. Each click is one press; it holds no setting, so loading a sound never presses it.',
  };
  s['seq.trigger'] = {
    module: 'mod',
    kind: 'bool',
    def: false,
    ui: true,
    label: 'TRIGGER',
    help: 'With the sequencer stopped, plays the step it is on without moving on, to adjust that step while hearing it. Each click is one press; it holds no setting, so loading a sound never presses it. A key does the same at its own velocity.',
  };
  return s;
}

/** A control from its spec, placed: the definition gives the type and its drawing. */
export function place<T extends Control>(
  specs: Record<string, Spec>,
  id: string,
  at: Omit<T, keyof ControlCommon | 'kind' | 'def' | 'min' | 'max' | 'options' | 'fmt'> &
    Pick<ControlCommon, 'x' | 'y'> &
    Partial<ControlCommon>
): Control {
  const sp = specs[id];
  if (!sp) throw new Error(`dfam-kit: no control ${id}`);
  const press =
    id === 'seq.advance'
      ? { press: 'next' as const }
      : id === 'seq.trigger'
        ? { press: 'trigger' as const }
        : {};
  return { id, labelPos: 'none', ...sp, ...press, ...at } as unknown as Control;
}

// ── Jacks ──────────────────────────────────────────────────────────────────

type JackSpec =
  | (Omit<InputJack, 'id' | 'x' | 'y' | 'r'> & { dir: 'in' })
  | (Omit<OutputJack, 'id' | 'x' | 'y' | 'r'> & { dir: 'out' });

/** Volts, as the hardware's: a cable from one of these jacks into another carries what it does there. */
export function dfamJacks(variant: Variant): Record<string, JackSpec> {
  const o1 = osc(variant, 1),
    o2 = osc(variant, 2);
  const V = 0.2; // a core input's full scale is 5 V
  return {
    'j.trigger_in': {
      dir: 'in',
      label: 'TRIGGER',
      name: 'TRIGGER input',
      dest: 'dfmTrigIn',
      amt: V,
      help: 'A rising edge fires all three envelopes at the current step’s velocity, without moving the sequencer: play the DFAM from another sequencer. It is wired to the sequencer’s clock until a cable goes in.',
    },
    'j.vca_cv': {
      dir: 'in',
      label: 'VCA CV',
      name: 'VCA CV input',
      dest: 'amp',
      amt: 1 / 8,
      help: 'Opens the VCA, 0 to +8 V, added to the VCA EG; together they can clip.',
    },
    'j.vca_out': {
      dir: 'out',
      label: 'VCA',
      name: 'VCA OUT',
      signal: 'vca',
      gain: 5,
      help: 'The whole sound, at modular level (±5 V). On the hardware it is after VOLUME; a cable from it here takes the sound before VOLUME.',
    },
    'j.velocity_in': {
      dir: 'in',
      label: 'VELOCITY',
      name: 'VELOCITY input',
      dest: 'dfmVelIn',
      amt: V,
      help: 'Sets the envelopes’ peak, 0 to 5 V, in place of the step’s VELOCITY knob.',
    },
    'j.vca_decay': {
      dir: 'in',
      label: 'VCA DECAY',
      name: 'VCA DECAY input',
      dest: 'dfmDecVca',
      amt: V,
      help: 'Moves the VCA EG’s decay, ±5 V across the knob’s whole turn, added to it: centre the knob for the widest range. The PITCH output here gives each step its own length, as in Quick Hats.',
    },
    'j.vca_eg_out': {
      dir: 'out',
      label: 'VCA EG',
      name: 'VCA EG OUT',
      signal: 'dfmEgVca',
      gain: 8,
      help: 'The VCA envelope, 0 to +8 V.',
    },
    'j.ext_audio': {
      dir: 'in',
      label: 'EXT AUDIO',
      name: 'EXT AUDIO input',
      dest: 'dfmExt',
      amt: V,
      help: 'Audio here replaces the noise in the mixer, at NOISE / EXT LEVEL (unity gain at 10 V peak to peak). The noise still moves the filter through NOISE / VCF MOD.',
    },
    'j.vcf_decay': {
      dir: 'in',
      label: 'VCF DECAY',
      name: 'VCF DECAY input',
      dest: 'dfmDecVcf',
      amt: V,
      help: 'Moves the VCF EG’s decay, ±5 V across the knob’s whole turn, added to it.',
    },
    'j.vcf_eg_out': {
      dir: 'out',
      label: 'VCF EG',
      name: 'VCF EG OUT',
      signal: 'dfmEgVcf',
      gain: 8,
      help: 'The VCF envelope, 0 to +8 V.',
    },
    'j.noise_level': {
      dir: 'in',
      label: 'NOISE LEVEL',
      name: 'NOISE LEVEL input',
      dest: 'dfmNzLvl',
      amt: 1 / 8,
      help: 'Adds to NOISE / EXT LEVEL, 0 to +8 V, for the noise or for EXT AUDIO; it can clip. The PITCH output here sets a snare’s level step by step.',
    },
    'j.vco_decay': {
      dir: 'in',
      label: variant === 'dfam' ? 'VCO DECAY' : 'OSC DECAY',
      name: `${variant === 'dfam' ? 'VCO' : 'OSC'} DECAY input`,
      dest: 'dfmDecVco',
      amt: V,
      help: 'Moves the pitch envelope’s decay, ±5 V across the knob’s whole turn, added to it.',
    },
    'j.vco_eg_out': {
      dir: 'out',
      label: variant === 'dfam' ? 'VCO EG' : 'OSC EG',
      name: `${variant === 'dfam' ? 'VCO' : 'OSC'} EG OUT`,
      signal: 'dfmEgVco',
      gain: 8,
      help: 'The pitch envelope, 0 to +8 V.',
    },
    'j.vcf_mod': {
      dir: 'in',
      label: 'VCF MOD',
      name: 'VCF MOD input',
      dest: 'att2In',
      amt: V,
      help: 'Moves the cutoff, ±5 V, in place of the noise, at NOISE / VCF MOD’s depth (fully up for all of it). The only direct way into the cutoff. An oscillator here gives FM Toys and the Talking Drum.',
    },
    'j.vco1_cv': {
      dir: 'in',
      label: `${o1} CV`,
      name: `${o1} CV input`,
      dest: 'pitch1',
      amt: 12,
      help: `${o1}’s pitch, 1 V an octave, ±5 V, added to its FREQUENCY, its EG and the sequencer. For clean 1 V an octave centre FREQUENCY and EG AMOUNT and set SEQ PITCH MOD to OFF or ${o2}.`,
    },
    'j.vco1_out': {
      dir: 'out',
      label: o1,
      name: `${o1} OUT`,
      signal: 'osc1',
      gain: 5,
      help: `${o1} on its own, ±5 V: a sound source or a modulator. Into ADV / CLOCK it clocks the sequencer at audio rate.`,
    },
    'j.fm_amt': {
      dir: 'in',
      label: variant === 'dfam' ? '1→2 FM AMT' : '1-2 FM AMT',
      name: '1→2 FM AMT input',
      dest: 'fmLinAmt',
      amt: FM_FULL / 8,
      help: 'Adds to 1→2 FM AMOUNT, 0 to +8 V across its whole range. The VELOCITY output here varies the FM step by step.',
    },
    'j.vco2_cv': {
      dir: 'in',
      label: `${o2} CV`,
      name: `${o2} CV input`,
      dest: 'pitch2',
      amt: 12,
      help: `${o2}’s pitch, 1 V an octave, ±5 V, added to its FREQUENCY, its EG and the sequencer. ${o1} here is exponential FM, the guide’s first patch idea.`,
    },
    'j.vco2_out': {
      dir: 'out',
      label: o2,
      name: `${o2} OUT`,
      signal: 'osc2',
      gain: 5,
      help: `${o2} on its own, ±5 V. Into VCF MOD it plays the filter; into TRIGGER it adds triggers of its own.`,
    },
    'j.tempo': {
      dir: 'in',
      label: 'TEMPO',
      name: 'TEMPO input',
      dest: 'dfmTempo',
      amt: V,
      help: 'Moves the clock 1 V an octave, ±5 V, added to TEMPO, into audio rate. The PITCH output here gives each step its own length, as in Swing Time.',
    },
    'j.run_stop': {
      dir: 'in',
      label: run(variant),
      name: `${run(variant)} input`,
      dest: 'dfmRun',
      amt: V,
      help: `A gate here runs the sequencer while it is high and stops it where it is when it falls, taking over from the ${run(variant)} button.`,
    },
    'j.adv_clock': {
      dir: 'in',
      label: 'ADV / CLOCK',
      name: 'ADV / CLOCK input',
      dest: 'dfmAdv',
      amt: V,
      help: 'Each rising edge moves the running sequencer a step, in place of TEMPO: clock it from another DFAM’s TRIGGER OUT, or from an oscillator for a sequence at audio rate. Here it moves only a running sequencer, as the manual has the follower started first.',
    },
    'j.trigger_out': {
      dir: 'out',
      label: 'TRIGGER',
      name: 'TRIGGER OUT',
      signal: 'dfmTrig',
      gain: 5,
      help: 'A 1 ms, +5 V pulse each time the envelopes fire: into another DFAM’s ADV / CLOCK to chain them.',
    },
    'j.velocity_out': {
      dir: 'out',
      label: 'VELOCITY',
      name: 'VELOCITY OUT',
      signal: 'dfmVel',
      gain: 5,
      help: 'The current step’s VELOCITY, 0 to 5 V, as a second row of voltages to patch.',
    },
    'j.pitch_out': {
      dir: 'out',
      label: 'PITCH',
      name: 'PITCH OUT',
      signal: 'dfmPitch',
      gain: 5,
      help: 'The current step’s PITCH, ±5 V, whatever SEQ PITCH MOD says: into VCA DECAY, NOISE LEVEL, TEMPO or the filter to sequence them.',
    },
  };
}

// ── The Default patch ──────────────────────────────────────────────────────

/** The checklist that sets the Default patch on the hardware; `init` is already the patch. */
export function dfamDefaultPatch(variant: Variant): DefaultPatch {
  const o1 = osc(variant, 1);
  const checklist: DefaultPatchStep[] = [
    {
      title: 'Pull every cable out, and stop the sequencer',
      module: 'mod',
      why: `The ${variant === 'dfam' ? 'DFAM' : 'EDGE'} plays through its own internal wiring with nothing patched, so take out any cable first. ${run(variant)} unlit stops the sequencer, so each hit comes from a key (or the TRIGGER button). Set TEMPO at the centre${variant === 'edge' ? ', CLOCK on INT/EXT and SCALE on 1/16' : ''}, ready for later patches.`,
      controls: ['seq.run', 'clock.*'],
    },
    {
      title: `Set ${o1} alone, on its triangle`,
      module: 'osc',
      why: `The triangle is the DFAM’s plainest wave, round and nearly all fundamental. Both FREQUENCY knobs at the centre, both EG AMOUNT knobs at the centre so the pitch holds still, HARD SYNC off and no FM.`,
      controls: ['vco1.*', 'vco2.*'],
    },
    {
      title: 'Mix in the first oscillator only',
      module: 'mixer',
      why: `${o1} LEVEL at 7; the other oscillator and the noise fully down.${variant === 'edge' ? ' NOISE COLOR on WHITE.' : ''}`,
      controls: ['mix.*', ...(variant === 'edge' ? ['noise.*'] : [])],
    },
    {
      title: 'Open the filter all the way',
      module: 'filter',
      why: 'The filter on LP with CUTOFF fully up and no RESONANCE lets the triangle through. VCF EG AMOUNT at the centre and NOISE / VCF MOD down mean nothing moves the cutoff; set VCF DECAY as shown.',
      controls: ['vcf.*', 'vcf_eg.*', 'vcfmod.*'],
    },
    {
      title: 'Set the sequencer’s steps flat and loud',
      module: 'mod',
      why: 'Every PITCH at the centre and every VELOCITY fully up, so each step hits at full strength (a key hits at its own velocity). SEQ PITCH MOD OFF keeps the steps off the pitch, and the pitch envelope’s decay short.',
      controls: ['seq.pitch*', 'seq.vel*', 'vco_eg.*'],
    },
    {
      title: 'Make each hit short and clean',
      module: 'amp',
      why: 'The VCA EG on FAST opens the sound at once, and its DECAY a little below a third of the way up lets each hit ring briefly and stop. VOLUME at 7 is the level every patch here assumes.',
      controls: ['vca_eg.*', 'out.*'],
      listen:
        'play a few notes: a short, round, plain tone at the pitch of each key, dying away on its own.',
    },
  ];
  return {
    values: {},
    category: 'perc',
    listen:
      'Play a few notes and listen for a short, round, plain hit at the pitch of each key, dying away on its own after a moment.',
    notSaw: `The ${variant === 'dfam' ? 'DFAM' : 'EDGE'} is a percussion synth: its oscillators are triangle or square, with no sawtooth, and every sound is a hit that dies away. Its plainest is one oscillator on its triangle, the filter open and nothing moving the pitch, and that is where every patch here starts.`,
    checklist,
  };
}

/** Cables a sound may plug that the Default patch does not: none, it has none. */
export const NO_CABLES: CablePair[] = [];
