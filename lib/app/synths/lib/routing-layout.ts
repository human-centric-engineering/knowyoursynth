// Where the routing view draws each block and edge (`SynthRouting`), left to right in the signal's direction.
//
// A small layered layout, hand-rolled rather than a layout library: a routing is a dozen or two blocks in a known
// shape (sources → mixer → filter → amp → out, modulation beneath), and two rules place them. Pure, so the same
// routing always draws the same and a test can hold it.
//
// - **Bands.** A block on an audio edge is in the audio band; the rest (pitch, modulation, contours) are in the band
//   beneath. Each column's audio blocks are centred on the tallest column's, so the main line runs straight.
// - **Columns, audio first.** The audio band is laid out from its own edges alone, "as late as possible": the
//   output is the last column and every other block one column left of the earliest block it feeds. Then each
//   block beneath goes one column left of the earliest block it feeds, so a contour sits just before the filter it
//   opens. A block beneath that feeds nothing goes one column right of what feeds it, or in the first column.
// - **Back links.** An edge out of the output (Model D's output fed back into its external input), an edge that
//   would close a loop, and any link that ends up running leftward (Oscillator 3 into the mod bus that bends its
//   own pitch) are drawn back against the flow: over the top between two audio blocks, under the bottom otherwise.
// - **Long links.** A link that skips a column would run behind the blocks between, and read as joined to them, so
//   it turns into the channel between the bands, runs along it in a lane of its own, and turns out to its target.
// - **Ports.** A block's links leave from its right side and arrive on its left, spread down the side in the order
//   of the far end's height, so two edges between the same blocks are drawn apart and fewer cross.
import type { RoutingSignal, SynthRouting } from '@/lib/app/synths/contract';

export const BLOCK_W = 150;
export const BLOCK_H = 46;
const COL_GAP = 48;
const ROW_GAP = 16;
/** The space between the audio band and the band beneath it: the channel long links run along. */
const BAND_GAP = 44;
/** The space between two links side by side in the channel. */
const LANE_GAP = 4;
/** Room round the drawing, which back links run through. */
const MARGIN = 28;

export interface PlacedBlock {
  id: string;
  x: number;
  y: number;
  col: number;
  band: 'audio' | 'control';
}

export interface PlacedLink {
  /** The edge's or cable's id. */
  id: string;
  from: string;
  to: string;
  /** An SVG path from the source's right side to the target's left. */
  d: string;
  /** Where it leaves the source and arrives at the target: a cable's jacks are drawn there. */
  start: [number, number];
  end: [number, number];
  /** Drawn back against the flow, round the top or the bottom. */
  back: boolean;
}

export interface RoutingLayout {
  width: number;
  height: number;
  blocks: Record<string, PlacedBlock>;
  /** The routing's edges, in its order. */
  edges: PlacedLink[];
  /** The cables passed in whose ends are both blocks, in their order. */
  cables: PlacedLink[];
}

/** A link to lay out: an edge, or a cable between the blocks of its jacks. */
export interface LinkInput {
  id: string;
  from: string;
  to: string;
  signal?: RoutingSignal;
}

type Link = { id: string; from: string; to: string };

/** `links` grouped by source. */
function outOf(links: Link[]): Map<string, Link[]> {
  const m = new Map<string, Link[]>();
  for (const l of links) {
    const list = m.get(l.from);
    if (list) list.push(l);
    else m.set(l.from, [l]);
  }
  return m;
}

/**
 * Steps from the end over `links` for each of `ids`: 0 for a block that feeds none of them, else one more than the
 * most of what it feeds. A link that would close a loop is skipped, and added to `back`.
 */
function stepsToEnd(ids: string[], links: Link[], back: Set<string>): Map<string, number> {
  const out = outOf(links);
  const steps = new Map<string, number>();
  const open = new Set<string>();
  const visit = (b: string): number => {
    const known = steps.get(b);
    if (known !== undefined) return known;
    open.add(b);
    let s = 0;
    for (const l of out.get(b) ?? []) {
      if (open.has(l.to)) back.add(l.id);
      else s = Math.max(s, visit(l.to) + 1);
    }
    open.delete(b);
    steps.set(b, s);
    return s;
  };
  ids.forEach(visit);
  return steps;
}

/** Lays `routing` out, with `cables` (between blocks) drawn over it. */
export function layoutRouting(routing: SynthRouting, cables: LinkInput[] = []): RoutingLayout {
  const audio = new Set(
    routing.edges.filter((e) => e.signal === 'audio').flatMap((e) => [e.from, e.to])
  );
  audio.add(routing.out);
  const ids = routing.blocks.map((b) => b.id);
  const audioIds = ids.filter((id) => audio.has(id));
  const controlIds = ids.filter((id) => !audio.has(id));

  // Columns, relative to the output at 0: the audio band from its own edges, then the band beneath.
  const back = new Set(routing.edges.filter((e) => e.from === routing.out).map((e) => e.id));
  const audioSteps = stepsToEnd(
    audioIds,
    routing.edges.filter((e) => audio.has(e.from) && audio.has(e.to) && !back.has(e.id)),
    back
  );
  const at = new Map<string, number>(audioIds.map((id) => [id, -(audioSteps.get(id) ?? 0)]));
  const fromControl = outOf(routing.edges.filter((e) => !audio.has(e.from) && !back.has(e.id)));
  const open = new Set<string>();
  const place = (b: string): number | undefined => {
    const known = at.get(b);
    if (known !== undefined) return known;
    open.add(b);
    let c: number | undefined;
    for (const l of fromControl.get(b) ?? []) {
      if (open.has(l.to)) {
        back.add(l.id);
        continue;
      }
      const t = place(l.to);
      if (t !== undefined) c = Math.min(c ?? Infinity, t - 1);
    }
    open.delete(b);
    if (c !== undefined) at.set(b, c);
    return c;
  };
  controlIds.forEach(place);
  // A block beneath that feeds nothing (a sink, or one whose only way out is a cable) goes one column right of the
  // latest block that feeds it, so that edge runs forward; with nothing feeding it either, the first column.
  // Settled together, since a sink can feed another: each pass moves a sink right of every feeder placed so far, and
  // a loop between sinks stops after as many passes as there are sinks.
  const sinks = controlIds.filter((id) => !at.has(id));
  for (let pass = 0, moved = true; moved && pass <= sinks.length; pass++) {
    moved = false;
    for (const id of sinks) {
      const after = routing.edges
        .filter((e) => e.to === id && e.from !== id && !back.has(e.id) && at.has(e.from))
        .map((e) => (at.get(e.from) ?? 0) + 1);
      if (after.length && Math.max(...after) !== at.get(id)) {
        at.set(id, Math.max(...after));
        moved = true;
      }
    }
  }
  const first = Math.min(0, ...at.values());
  const col = new Map(ids.map((id) => [id, (at.get(id) ?? first) - first]));
  const ncols = Math.max(0, ...col.values()) + 1;

  // Each column's blocks, per band, in the routing's order.
  const stack = (band: string[]) =>
    Array.from({ length: ncols }, (_, c) => band.filter((id) => col.get(id) === c));
  const audioCols = stack(audioIds);
  const controlCols = stack(controlIds);
  const audioRows = Math.max(0, ...audioCols.map((c) => c.length));
  const controlRows = Math.max(0, ...controlCols.map((c) => c.length));
  const rowH = BLOCK_H + ROW_GAP;
  const controlTop = MARGIN + audioRows * rowH + (audioRows && controlRows ? BAND_GAP : 0);
  const height =
    (controlRows ? controlTop + controlRows * rowH : MARGIN + audioRows * rowH) - ROW_GAP + MARGIN;
  const xOf = (c: number) => MARGIN + c * (BLOCK_W + COL_GAP);

  const blocks: Record<string, PlacedBlock> = {};
  audioCols.forEach((list, c) => {
    const offset = ((audioRows - list.length) * rowH) / 2;
    list.forEach((id, r) => {
      blocks[id] = { id, col: c, band: 'audio', x: xOf(c), y: MARGIN + offset + r * rowH };
    });
  });
  controlCols.forEach((list, c) =>
    list.forEach((id, r) => {
      blocks[id] = { id, col: c, band: 'control', x: xOf(c), y: controlTop + r * rowH };
    })
  );

  // The routing's edges first, then the cables whose ends are both blocks.
  const links = [...routing.edges, ...cables.filter((c) => blocks[c.from] && blocks[c.to])].map(
    (l) => {
      const isBack = back.has(l.id) || blocks[l.to].col <= blocks[l.from].col;
      const over = blocks[l.from].band === 'audio' && blocks[l.to].band === 'audio';
      return {
        id: l.id,
        from: l.from,
        to: l.to,
        back: isBack ? (over ? ('top' as const) : ('bottom' as const)) : null,
      };
    }
  );

  // Ports: each block's outgoing links spread down its right side, incoming down its left, ordered by the far end.
  // A link drawn round the top takes the topmost port, one round the bottom the bottommost.
  const centre = (id: string) => blocks[id].y + BLOCK_H / 2;
  const port = new Map<string, number>(); // `${link index}:out|in` → y
  for (const side of ['out', 'in'] as const) {
    const by = new Map<string, number[]>();
    links.forEach((l, i) => {
      const b = side === 'out' ? l.from : l.to;
      const list = by.get(b);
      if (list) list.push(i);
      else by.set(b, [i]);
    });
    for (const [b, list] of by) {
      const far = (i: number) => {
        const l = links[i];
        if (l.back === 'top') return -Infinity;
        if (l.back === 'bottom') return Infinity;
        return centre(side === 'out' ? l.to : l.from);
      };
      const sorted = [...list].sort((p, q) => far(p) - far(q) || p - q);
      sorted.forEach((i, k) =>
        port.set(`${i}:${side}`, blocks[b].y + (BLOCK_H * (k + 1)) / (sorted.length + 1))
      );
    }
  }

  // A lane in the channel for each forward link that skips a column, spread from its middle outward.
  const channel = audioRows && controlRows ? controlTop - BAND_GAP / 2 : null;
  const long = links.flatMap((l, i) =>
    channel !== null && !l.back && blocks[l.to].col - blocks[l.from].col > 1 ? [i] : []
  );
  const step = Math.min(LANE_GAP, (BAND_GAP - 8) / Math.max(1, long.length - 1));
  const lane = new Map(
    long.map((i, k) => [i, (channel ?? 0) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step])
  );

  // Back links round the same side each take a lane of their own, outward from the margin's middle and kept inside it.
  const backMid = (side: 'top' | 'bottom') => (side === 'top' ? MARGIN / 2 : height - MARGIN / 2);
  const backLane = new Map<number, number>();
  for (const side of ['top', 'bottom'] as const) {
    const on = links.flatMap((l, i) => (l.back === side ? [i] : []));
    const gap = Math.min(LANE_GAP, (MARGIN / 2 - 2) / Math.max(1, Math.ceil((on.length - 1) / 2)));
    on.forEach((i, k) =>
      backLane.set(i, backMid(side) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap)
    );
  }

  const r = COL_GAP / 2;
  const endsOf = (l: (typeof links)[number], i: number) => ({
    sx: blocks[l.from].x + BLOCK_W,
    sy: port.get(`${i}:out`) ?? centre(l.from),
    tx: blocks[l.to].x,
    ty: port.get(`${i}:in`) ?? centre(l.to),
  });
  const pathOf = (
    l: (typeof links)[number],
    i: number,
    { sx, sy, tx, ty }: ReturnType<typeof endsOf>
  ): string => {
    if (l.back) {
      // Out to the right, round the top or the bottom, back along and into the target's left.
      const y = backLane.get(i) ?? backMid(l.back);
      return `M${sx},${sy} C${sx + r},${sy} ${sx + r},${y} ${sx},${y} L${tx},${y} C${tx - r},${y} ${tx - r},${ty} ${tx},${ty}`;
    }
    const y = lane.get(i);
    if (y !== undefined)
      // Down or up into the channel in the gap after the source's column, along it, and out before the target's.
      return `M${sx},${sy} C${sx + r},${sy} ${sx + r},${y} ${sx + COL_GAP},${y} L${tx - COL_GAP},${y} C${tx - r},${y} ${tx - r},${ty} ${tx},${ty}`;
    const dx = Math.max((tx - sx) / 2, r);
    return `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
  };

  const placed = links.map((l, i): PlacedLink => {
    const ends = endsOf(l, i);
    return {
      id: l.id,
      from: l.from,
      to: l.to,
      d: pathOf(l, i, ends),
      start: [ends.sx, ends.sy],
      end: [ends.tx, ends.ty],
      back: !!l.back,
    };
  });
  return {
    width: xOf(ncols) - COL_GAP + MARGIN,
    height,
    blocks,
    edges: placed.slice(0, routing.edges.length),
    cables: placed.slice(routing.edges.length),
  };
}
