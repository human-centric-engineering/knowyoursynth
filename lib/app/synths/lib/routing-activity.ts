// How brightly the routing view lights each part: the signal going through it now, not just whether the patch routes
// it (`routingState()`). A part the patch does not use is dark whatever is playing; one it uses glows with what the
// engine reports going through it, and fades as that does.
//
// - A block with a `meter` follows it: the keyboard its gate, a contour its envelope.
// - The LFO, and an oscillator slow enough to see (Oscillator 3 at LO), pulse with the wave itself: dark at its
//   trough, full at its peak. The meter arrives 25 times a second, so a faster wave would alias into a false slow
//   pulse; from `SLOW_HZ` to `FAST_HZ` the pulse blends into a steady glow, as a fast lamp blurs to the eye.
// - An oscillator at audio pitch glows with the output's level times its own share of the mixer, so one turned
//   down glows less; one switched out of the mixer but feeding the mod bus glows at half the output's level, so
//   it too goes dark when the sound does.
// - Any other block on the audio path follows the output's level, so a release tail fades the whole line together.
//   The audio path is the audio edges, and the live audio cables that carry audio on from a block that makes it or
//   is already on the path: a modular's patched line (it has no edges) and a block only a pin reaches glow the way a
//   wired path does, while a mixer or mult that only passes control voltage on stays off it.
// - On a modular (every path a cable), a live module that makes its own signal and has no meter (a 911 envelope, a
//   921 modulating another) is shaping the sound, so it too follows the output's level: the engine reports nothing
//   per module, and what feeds it (the keyboard's gate) says nothing of its own release or rate.
// - Any other block (the pitch and modulation buses) glows with the brightest live line into it.
// - A live line glows with the block it leaves.
//
// Pure: the view reads the meters and the output's level once a frame and eases what it draws towards these targets
// with `settle()`.
import type { RoutingMeter, SynthRouting } from '@/lib/app/synths/contract';
import type { RoutingState } from '@/lib/app/synths/lib/routing';

/** What the engine reports, as the activity reads it. */
export interface ActivityMeters {
  gate: boolean;
  env1: number;
  env2: number;
  /** The LFO, −1..1, and its rate in Hz. */
  lfo: number;
  lfoHz: number;
  /** Each engine oscillator: its output now (−1..1), its pitch in Hz and its mixer level. */
  osc: { v: number; hz: number; lv: number }[];
  /** The output's level, 0..1 (`levelOfRms()`). */
  out: number;
}

export const SILENT: ActivityMeters = {
  gate: false,
  env1: 0,
  env2: 0,
  lfo: 0,
  lfoHz: 0,
  osc: [],
  out: 0,
};

/** Below this a wave is drawn as it moves; above `FAST_HZ` it is a steady glow; between, a blend. */
export const SLOW_HZ = 3;
export const FAST_HZ = 6;

export interface RoutingActivity {
  /** Every block, 0 (dark) to 1 (full). */
  blocks: Record<string, number>;
  /** Every edge, as the block it leaves when it is live, else 0. */
  edges: Record<string, number>;
  /** Every cable of `state.cables`, in its order, likewise. */
  cables: number[];
  /**
   * Every block, true while its glow is a moving wave rather than a level: the view eases it quickly both ways, so
   * the pulse is drawn rather than smeared by the slow fall a note's release takes. Lines from it pulse with it.
   */
  pulsing: Record<string, boolean>;
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);

const OSC_METERS: Partial<Record<RoutingMeter, number>> = { osc1: 0, osc2: 1, osc3: 2, osc4: 3 };

/** How far a wave at `hz` is drawn steady rather than as it moves: 0 at `SLOW_HZ` and below, 1 at `FAST_HZ`. */
const blur = (hz: number) => clamp((hz - SLOW_HZ) / (FAST_HZ - SLOW_HZ));

/** A wave at `v` (−1..1) and `hz`, drawn as it moves (a little glow at its trough), blurred to `steady` when fast. */
function wave(v: number, hz: number, steady: number): number {
  const w = blur(hz);
  return (0.12 + 0.88 * clamp((v + 1) / 2)) * (1 - w) + steady * w;
}

/**
 * A metered block's glow, and whether it is a moving wave; `loudest` is the highest oscillator mixer level. Null for
 * an oscillator the engine did not report.
 */
function reading(
  meter: RoutingMeter,
  m: ActivityMeters,
  loudest: number
): [number, boolean] | null {
  if (meter === 'gate') return [m.gate ? 1 : 0, false];
  if (meter === 'env1' || meter === 'env2') return [clamp(m[meter]), false];
  // A free-running LFO is always working: steady, it glows at three quarters.
  if (meter === 'lfo') return [wave(m.lfo, m.lfoHz, 0.75), blur(m.lfoHz) < 1];
  const o = m.osc[OSC_METERS[meter] ?? -1];
  if (!o) return null;
  const steady = clamp(m.out) * (o.lv > 0 && loudest > 0 ? o.lv / loudest : 0.5);
  return [wave(o.v, o.hz, steady), blur(o.hz) < 1];
}

/** The level each part of `routing` should glow at, for the patch's `state` and the engine's `meters`. */
export function routingActivity(
  routing: SynthRouting,
  state: RoutingState,
  meters: ActivityMeters
): RoutingActivity {
  const passes = new Set(routing.blocks.filter((b) => b.passes).map((b) => b.id));
  const audio = new Set(
    routing.edges.filter((e) => e.signal === 'audio').flatMap((e) => [e.from, e.to])
  );
  const live = state.cables.filter((c) => c.live);
  const audioCables = live.filter((c) => c.signal === 'audio');
  for (let moved = true; moved;) {
    moved = false;
    for (const c of audioCables) {
      const carries = !passes.has(c.fromBlock) || audio.has(c.fromBlock);
      if (carries && !(audio.has(c.fromBlock) && audio.has(c.toBlock))) {
        audio.add(c.fromBlock);
        audio.add(c.toBlock);
        moved = true;
      }
    }
  }
  audio.add(routing.out);
  const modular = routing.edges.length === 0;

  const loudest = Math.max(0, ...meters.osc.map((x) => x.lv));
  const blocks: Record<string, number> = {};
  const pulsing: Record<string, boolean> = {};
  const fedOnly: string[] = [];
  for (const b of routing.blocks) {
    const metered = state.blocks[b.id] && b.meter ? reading(b.meter, meters, loudest) : null;
    pulsing[b.id] = !!metered?.[1];
    if (!state.blocks[b.id]) blocks[b.id] = 0;
    else if (metered) blocks[b.id] = metered[0];
    else if (audio.has(b.id) || (modular && !b.passes)) blocks[b.id] = clamp(meters.out);
    else {
      blocks[b.id] = 0;
      fedOnly.push(b.id);
    }
  }

  // The buses take the brightest live line into them, passed along as far as a chain of buses goes, and pulse when
  // that line does.
  const into = [
    ...routing.edges.filter((e) => state.edges[e.id]).map((e) => [e.from, e.to]),
    ...live.map((c) => [c.fromBlock, c.toBlock]),
  ];
  for (let pass = 0, moved = true; moved && pass <= fedOnly.length; pass++) {
    moved = false;
    for (const id of fedOnly) {
      for (const [from, to] of into)
        if (to === id && (blocks[from] ?? 0) > blocks[id]) {
          blocks[id] = blocks[from];
          pulsing[id] = pulsing[from];
          moved = true;
        }
    }
  }

  return {
    blocks,
    edges: Object.fromEntries(
      routing.edges.map((e) => [e.id, state.edges[e.id] ? (blocks[e.from] ?? 0) : 0])
    ),
    cables: state.cables.map((c) => (c.live ? (blocks[c.fromBlock] ?? 0) : 0)),
    pulsing,
  };
}

/** How fast a glow comes up to a louder signal, and falls away from a quieter one, in ms (time constants). */
export const RISE_MS = 40;
export const FALL_MS = 450;

/**
 * `shown` eased towards `target` over `dt` ms: up quickly, down slowly, so a note's end fades rather than cuts. A
 * moving wave (`pulsing`) falls as quickly as it rises, so its trough is drawn.
 */
export function settle(shown: number, target: number, dt: number, pulsing = false): number {
  if (!(dt > 0)) return shown;
  const tau = target > shown || pulsing ? RISE_MS : FALL_MS;
  const next = target + (shown - target) * Math.exp(-dt / tau);
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** The output's RMS as a glow, 0..1, on a decibel scale: −60 dB is dark and −6 dB full. */
export function levelOfRms(rms: number): number {
  if (!(rms > 0)) return 0;
  return clamp((20 * Math.log10(rms) + 60) / 54);
}
