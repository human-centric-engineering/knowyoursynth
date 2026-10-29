// How brightly the routing view lights each part: the signal going through it now, not just whether the patch routes
// it (`routingState()`). A part the patch does not use is dark whatever is playing; one it uses glows with what the
// engine reports going through it, and fades as that does.
//
// - A block with a `meter` follows it: the keyboard its gate, a contour its envelope, the LFO its swing.
// - Any other block on the audio path follows the output's level, so a release tail fades the whole line together.
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
  /** The LFO, −1..1. */
  lfo: number;
  /** The output's level, 0..1 (`levelOfRms()`). */
  out: number;
}

export const SILENT: ActivityMeters = { gate: false, env1: 0, env2: 0, lfo: 0, out: 0 };

export interface RoutingActivity {
  /** Every block, 0 (dark) to 1 (full). */
  blocks: Record<string, number>;
  /** Every edge, as the block it leaves when it is live, else 0. */
  edges: Record<string, number>;
  /** Every cable of `state.cables`, in its order, likewise. */
  cables: number[];
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);

function reading(meter: RoutingMeter, m: ActivityMeters): number {
  if (meter === 'gate') return m.gate ? 1 : 0;
  // A free-running LFO is always working: it never goes below a glow, and swells with its swing.
  if (meter === 'lfo') return 0.35 + 0.65 * clamp(Math.abs(m.lfo));
  return clamp(m[meter]);
}

/** The level each part of `routing` should glow at, for the patch's `state` and the engine's `meters`. */
export function routingActivity(
  routing: SynthRouting,
  state: RoutingState,
  meters: ActivityMeters
): RoutingActivity {
  const audio = new Set(
    routing.edges.filter((e) => e.signal === 'audio').flatMap((e) => [e.from, e.to])
  );
  audio.add(routing.out);

  const blocks: Record<string, number> = {};
  const fedOnly: string[] = [];
  for (const b of routing.blocks) {
    if (!state.blocks[b.id]) blocks[b.id] = 0;
    else if (b.meter) blocks[b.id] = reading(b.meter, meters);
    else if (audio.has(b.id)) blocks[b.id] = clamp(meters.out);
    else {
      blocks[b.id] = 0;
      fedOnly.push(b.id);
    }
  }

  // The buses take the brightest live line into them, passed along as far as a chain of buses goes.
  const into = [
    ...routing.edges.filter((e) => state.edges[e.id]).map((e) => [e.from, e.to]),
    ...state.cables.filter((c) => c.live).map((c) => [c.fromBlock, c.toBlock]),
  ];
  for (let pass = 0, moved = true; moved && pass <= fedOnly.length; pass++) {
    moved = false;
    for (const id of fedOnly) {
      const v = Math.max(
        0,
        ...into.filter(([, to]) => to === id).map(([from]) => blocks[from] ?? 0)
      );
      if (v > blocks[id]) {
        blocks[id] = v;
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
  };
}

/** How fast a glow comes up to a louder signal, and falls away from a quieter one, in ms (time constants). */
export const RISE_MS = 40;
export const FALL_MS = 450;

/** `shown` eased towards `target` over `dt` ms: up quickly, down slowly, so a note's end fades rather than cuts. */
export function settle(shown: number, target: number, dt: number): number {
  if (!(dt > 0)) return shown;
  const tau = target > shown ? RISE_MS : FALL_MS;
  const next = target + (shown - target) * Math.exp(-dt / tau);
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** The output's RMS as a glow, 0..1, on a decibel scale: −60 dB is dark and −6 dB full. */
export function levelOfRms(rms: number): number {
  if (!(rms > 0)) return 0;
  return clamp((20 * Math.log10(rms) + 60) / 54);
}
