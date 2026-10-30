// Where the live flow on the panel's face (`f-live-panel` t-153) draws its lines: one from each part to the part it
// feeds, while the patch routes signal along it (`routingState()`), between the patches of panel the live glow lights
// for them (`liveAreas()`). So the lines run between the sections people play, not between boxes on a diagram.
//
// - A line is a live edge of the routing, or a live pin of a pin matrix. A patch cable is drawn on the face already,
//   jack to jack, so a line beside it would say nothing the cable does not: a modular, whose every path is a cable,
//   draws no lines at all.
// - A part with nothing on the panel to light (the VCA, the keyboard's MIDI) is passed through: the filter's line runs
//   on through the VCA to the output, as the audio does. A line out of such a part, with nothing lit before it, has
//   nowhere to start and is not drawn.
// - Each line leaves its part's patch of panel and enters the other's, on the straight line between their middles;
//   where the two patches touch, it is a short arrow across the seam. It is bowed a little to its right, so a line
//   back the other way does not lie on it, and ends in an arrowhead, so its direction reads without the motion a
//   visitor may have asked to be spared.
import type { RoutingSignal, SynthDef, SynthRouting } from '@/lib/app/synths/contract';
import type { LiveArea } from '@/lib/app/synths/lib/live-areas';
import type { RoutingState } from '@/lib/app/synths/lib/routing';

/** One line of the flow, from one lit part of the panel to another. */
export interface FlowLine {
  /** `from>to:signal`. */
  id: string;
  /** The part it leaves, whose colour it takes and whose pulse it follows. */
  from: string;
  to: string;
  signal: RoutingSignal;
  /** What it glows with, the brightest of: the routing's edges (by id) and the patch's cables (by index in `state.cables`). */
  edges: string[];
  cables: number[];
  d: string;
  /** The arrowhead, at the end of `d`. */
  head: string;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The shortest a line is drawn, in panel units: two parts whose patches touch get this much across the seam. */
const MIN_LEN = 40;
/** The gap left between a line's ends and the patches it joins. */
const GAP = 6;
/** How far a line bows to its right, as a share of its length. */
const BOW = 0.08;
const HEAD = 16;

const n1 = (v: number) => Math.round(v * 10) / 10;

/** The bounding box of the points in a cell path (`M x yLx y…Z`, as `panelCells()` writes them). */
function boxOf(d: string): Box | null {
  const v = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (v.length < 2) return null;
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i + 1 < v.length; i += 2) {
    b.x0 = Math.min(b.x0, v[i]);
    b.x1 = Math.max(b.x1, v[i]);
    b.y0 = Math.min(b.y0, v[i + 1]);
    b.y1 = Math.max(b.y1, v[i + 1]);
  }
  return b;
}

/**
 * Each block's patch of panel, as a box: the areas it glows in alone, or failing those the ones it shares with
 * another part. A block with neither is not on the panel.
 */
export function flowAnchors(areas: LiveArea[]): Map<string, Box> {
  const out = new Map<string, Box>();
  const own = new Set<string>();
  for (const shared of [false, true])
    for (const a of areas) {
      if (a.blocks.length > 1 !== shared) continue;
      const b = boxOf(a.d);
      if (!b) continue;
      for (const id of a.blocks) {
        if (shared && own.has(id)) continue;
        if (!shared) own.add(id);
        const was = out.get(id);
        out.set(
          id,
          was
            ? {
                x0: Math.min(was.x0, b.x0),
                y0: Math.min(was.y0, b.y0),
                x1: Math.max(was.x1, b.x1),
                y1: Math.max(was.y1, b.y1),
              }
            : b
        );
      }
    }
  return out;
}

/** How far along the ray from (cx, cy) in direction (dx, dy) it leaves `b`, which holds (cx, cy). */
function exit(b: Box, cx: number, cy: number, dx: number, dy: number): number {
  const tx = dx > 0 ? (b.x1 - cx) / dx : dx < 0 ? (b.x0 - cx) / dx : Infinity;
  const ty = dy > 0 ? (b.y1 - cy) / dy : dy < 0 ? (b.y0 - cy) / dy : Infinity;
  return Math.min(tx, ty);
}

/** The line from box `a` to box `b`, and its arrowhead; null where the two have the same middle. */
function lineBetween(a: Box, b: Box): { d: string; head: string } | null {
  const ax = (a.x0 + a.x1) / 2;
  const ay = (a.y0 + a.y1) / 2;
  const bx = (b.x0 + b.x1) / 2;
  const by = (b.y0 + b.y1) / 2;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1) return null;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  let t0 = exit(a, ax, ay, ux, uy) + GAP;
  let t1 = len - exit(b, bx, by, -ux, -uy) - GAP;
  // Patches that touch or overlap: a short arrow across the seam between them, never shorter than the parts are apart.
  if (t1 - t0 < MIN_LEN) {
    const mid = Math.min(Math.max((t0 + t1) / 2, MIN_LEN / 2), len - MIN_LEN / 2);
    [t0, t1] = len < MIN_LEN ? [0, len] : [mid - MIN_LEN / 2, mid + MIN_LEN / 2];
  }
  const [x0, y0, x1, y1] = [ax + ux * t0, ay + uy * t0, ax + ux * t1, ay + uy * t1];
  // Bowed to the right of its direction (in SVG's y-down space, (−uy, ux) is to the right).
  const bow = (t1 - t0) * BOW;
  const cx = (x0 + x1) / 2 - uy * bow;
  const cy = (y0 + y1) / 2 + ux * bow;
  // The arrowhead points along the curve's tangent at its end, which is from the control point to the end.
  const tl = Math.hypot(x1 - cx, y1 - cy) || 1;
  const [hx, hy] = [(x1 - cx) / tl, (y1 - cy) / tl];
  const [bx0, by0] = [x1 - hx * HEAD, y1 - hy * HEAD];
  const w = HEAD * 0.5;
  return {
    d: `M${n1(x0)} ${n1(y0)}Q${n1(cx)} ${n1(cy)} ${n1(x1)} ${n1(y1)}`,
    head: `M${n1(x1)} ${n1(y1)}L${n1(bx0 - hy * w)} ${n1(by0 + hx * w)}L${n1(bx0 + hy * w)} ${n1(by0 - hx * w)}Z`,
  };
}

interface Segment {
  from: string;
  to: string;
  signal: RoutingSignal;
  edge?: string;
  cable?: number;
}

/**
 * Every line of the flow for the drawn panel `def`, its `routing`, what the patch routes now (`state`) and the live
 * glow's `areas`: one per pair of lit parts and signal, in the routing's order. Only what carries signal is drawn.
 */
export function liveFlows(
  def: SynthDef,
  routing: SynthRouting,
  state: RoutingState,
  areas: LiveArea[]
): FlowLine[] {
  const anchors = flowAnchors(areas);
  const pins = new Set(def.matrix ? [...def.matrix.rows, ...def.matrix.cols] : []);
  const segments: Segment[] = [
    ...routing.edges
      .filter((e) => state.edges[e.id])
      .map((e) => ({ from: e.from, to: e.to, signal: e.signal, edge: e.id })),
    ...state.cables.flatMap((c, i) =>
      c.live && pins.has(c.from) && pins.has(c.to)
        ? [{ from: c.fromBlock, to: c.toBlock, signal: c.signal, cable: i }]
        : []
    ),
  ];
  const out = new Map<string, Segment[]>();
  for (const s of segments) out.set(s.from, [...(out.get(s.from) ?? []), s]);

  // The lit parts each segment out of a lit part reaches, going on through any part that is not on the panel.
  const reach = (s: Segment, seen: Set<string>): string[] => {
    if (anchors.has(s.to)) return [s.to];
    if (seen.has(s.to)) return [];
    seen.add(s.to);
    return (out.get(s.to) ?? []).flatMap((next) => reach(next, seen));
  };
  const lines = new Map<string, FlowLine>();
  for (const s of segments) {
    const a = anchors.get(s.from);
    if (!a) continue;
    for (const to of reach(s, new Set([s.from]))) {
      if (to === s.from) continue;
      const id = `${s.from}>${to}:${s.signal}`;
      const line = lines.get(id);
      if (line) {
        if (s.edge) line.edges.push(s.edge);
        if (s.cable !== undefined) line.cables.push(s.cable);
        continue;
      }
      const b = anchors.get(to);
      const geo = b && lineBetween(a, b);
      if (!geo) continue;
      lines.set(id, {
        id,
        from: s.from,
        to,
        signal: s.signal,
        edges: s.edge ? [s.edge] : [],
        cables: s.cable !== undefined ? [s.cable] : [],
        ...geo,
      });
    }
  }
  return [...lines.values()];
}
