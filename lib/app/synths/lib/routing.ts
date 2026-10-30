// Signal routing: which parts of a synth the current patch actually uses, read from its routing (`SynthRouting`).
// Structural, not heard: an edge is live while its switches are set, its levels multiply to more than the engine's
// floor and no cable has broken it, a cable (or a matrix pin) while the jack it comes from sends something, and a
// block is live while some live path runs from it to the output (and, for a block that only passes signal on, while
// a live edge or cable feeds it). The sound map (`soundmap.ts`) answers the
// other question, whether a control changes what is heard, by probing the real voice; the two can disagree (a filter
// closed to nothing is still on the path), and the view says which it shows.
//
// Pure, like `toEngine()`: same definition, routing, values and cables in, same answer out.
import {
  conditionHolds,
  controlMap,
  controlReach,
  faceView,
  isShown,
  jackGain,
  jackMap,
  jackReach,
  WHEEL,
  type CableLike,
} from '@/lib/app/synths/lib/patch';
import type {
  Control,
  ControlValues,
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthDef,
  SynthRouting,
} from '@/lib/app/synths/contract';

/**
 * An edge whose levels multiply to no more than this carries nothing: the floor below which `toEngine()` drops a
 * modulation route (Model D's mod bus). A mixer knob under 1/2000 of its travel therefore counts as zero too.
 */
export const ROUTING_FLOOR = 0.0005;

/** A cable between two blocks, and whether it is on a live path. */
export interface RoutingCableState {
  from: string;
  to: string;
  fromBlock: string;
  toBlock: string;
  /** `audio` when both its jacks are in the routing's `audioJacks`. */
  signal: 'audio' | 'cv';
  live: boolean;
}

export interface RoutingState {
  /** Every block, true while it has signal (made, or fed to a `passes` block) on a live path to the output. */
  blocks: Record<string, boolean>;
  /** Every edge, true while it carries signal to a live block. */
  edges: Record<string, boolean>;
  /** Every cable between two of the routing's jacks, in patch order. */
  cables: RoutingCableState[];
}

export interface RoutingInput {
  values: ControlValues;
  cables: CableLike[];
  /** Mod wheel position, 0..1. */
  wheel?: number;
}

/** Whether `when` holds for the panel's `values`. */
export function holds(when: RoutingWhen, values: ControlValues): boolean {
  if ('all' in when) return when.all.every((w) => holds(w, values));
  if ('any' in when) return when.any.some((w) => holds(w, values));
  return conditionHolds(when, values);
}

/** A level's amount, 0..1 per control (a `sum` can pass 1). A missing value is 0, as `toEngine()` hears it. */
function amount(def: SynthDef, level: RoutingLevel, input: RoutingInput): number {
  if (typeof level !== 'string' && 'sum' in level)
    return level.sum.reduce((t, l) => t + amount(def, l, input), 0);
  const { id, off, pow = 1 } = typeof level === 'string' ? { id: level } : level;
  if (id === WHEEL) return Math.max(input.wheel ?? 0, 0);
  const c = controlMap(def)[id];
  const v = input.values[id];
  if (v === undefined) return 0;
  if (c?.kind !== 'cont') return v === off ? 0 : 1;
  if (typeof v !== 'number') return 0;
  const zero = typeof off === 'number' ? off : c.min;
  return Math.pow(Math.abs(v - zero) / (c.max - c.min), pow);
}

const enabled = (def: SynthDef, edge: RoutingEdge, input: RoutingInput): boolean =>
  (!edge.when || holds(edge.when, input.values)) &&
  (edge.levels ?? []).reduce((p, l) => p * amount(def, l, input), 1) > ROUTING_FLOOR;

/** Every block with a path to `out` over `links` (from, to), `out` included. */
export function reachBack(out: string, links: Iterable<[string, string]>): Set<string> {
  const into = new Map<string, string[]>();
  for (const [from, to] of links) {
    const list = into.get(to);
    if (list) list.push(from);
    else into.set(to, [from]);
  }
  const reach = new Set([out]);
  const queue = [out];
  for (let b = queue.pop(); b !== undefined; b = queue.pop())
    for (const from of into.get(b) ?? [])
      if (!reach.has(from)) {
        reach.add(from);
        queue.push(from);
      }
  return reach;
}

/** Every block with signal over `links`: a block that makes its own, and a `passes` block one of them feeds. */
function fedBlocks(routing: SynthRouting, links: Iterable<[string, string]>): Set<string> {
  const outOf = new Map<string, string[]>();
  for (const [from, to] of links) {
    const list = outOf.get(from);
    if (list) list.push(to);
    else outOf.set(from, [to]);
  }
  const fed = new Set(routing.blocks.filter((b) => !b.passes).map((b) => b.id));
  const queue = [...fed];
  for (let b = queue.pop(); b !== undefined; b = queue.pop())
    for (const to of outOf.get(b) ?? [])
      if (!fed.has(to)) {
        fed.add(to);
        queue.push(to);
      }
  return fed;
}

/** `routing.jacks` with a null prototype: cable jack ids come from untrusted sounds (see `byId` in `patch.ts`). */
function jackBlocks(routing: SynthRouting): Record<string, string | undefined> {
  const m = Object.create(null) as Record<string, string | undefined>;
  for (const [jack, block] of Object.entries(routing.jacks)) m[jack] = block;
  return m;
}

/**
 * Whether output jack `id` sends anything: false while its `gain` is at zero (a VCS3 row whose LEVEL knob is down
 * carries nothing, wherever it is pinned). A jack without a gain always sends.
 */
function sends(def: SynthDef, id: string, values: ControlValues): boolean {
  const j = jackMap(def)[id];
  if (!j) return true;
  // A gain that cannot be read (NaN, from a level the values lack) is not known to be zero, so the cable is drawn.
  return !(Math.abs(jackGain(j, values)) <= ROUTING_FLOOR);
}

/**
 * Which blocks, edges and cables of `routing` the patch uses. A cable into a jack that breaks a normal takes the
 * normal's place, and is heard only under the normal's switches and levels. A cable from a jack whose gain is at
 * zero carries nothing.
 */
export function routingState(
  def: SynthDef,
  routing: SynthRouting,
  input: RoutingInput
): RoutingState {
  const patched = new Set(input.cables.flatMap((c) => [c.from, c.to]));
  const normalAt = new Map(routing.edges.filter((e) => e.breaks).map((e) => [e.breaks, e]));

  const edgeOn = new Map(
    routing.edges.map((e) => [e.id, enabled(def, e, input) && !(e.breaks && patched.has(e.breaks))])
  );
  const jackBlock = jackBlocks(routing);
  const audio = new Set(routing.audioJacks);
  const cables = input.cables.flatMap((c) => {
    const fromBlock = jackBlock[c.from];
    const toBlock = jackBlock[c.to];
    if (!fromBlock || !toBlock) return [];
    const normal = normalAt.get(c.to);
    const signal: RoutingCableState['signal'] =
      audio.has(c.from) && audio.has(c.to) ? 'audio' : 'cv';
    const on = sends(def, c.from, input.values) && (!normal || enabled(def, normal, input));
    return [{ from: c.from, to: c.to, fromBlock, toBlock, signal, on }];
  });

  // Walk forward from the blocks that make signal, then back from the output over what carries it.
  const links = [
    ...routing.edges.filter((e) => edgeOn.get(e.id)).map((e): [string, string] => [e.from, e.to]),
    ...cables.filter((c) => c.on).map((c): [string, string] => [c.fromBlock, c.toBlock]),
  ];
  const fed = fedBlocks(routing, links);
  const reach = reachBack(
    routing.out,
    links.filter(([from]) => fed.has(from))
  );
  const live = (b: string) => fed.has(b) && reach.has(b);

  return {
    blocks: Object.fromEntries(routing.blocks.map((b) => [b.id, live(b.id)])),
    edges: Object.fromEntries(
      routing.edges.map((e) => [e.id, !!edgeOn.get(e.id) && fed.has(e.from) && live(e.to)])
    ),
    cables: cables.map(({ on, ...c }) => ({
      ...c,
      live: on && fed.has(c.fromBlock) && live(c.toBlock),
    })),
  };
}

// ─── The panel's crop ────────────────────────────────────────────────────────

/**
 * A control or jack a block's card lights on its crop of the panel: its centre, how far it reaches (legends included,
 * for the crop's box), and the box lit around the part itself, which the card draws with its short side rounded: a
 * circle round a knob or a jack, a pill round a switch or a fader.
 */
export interface PanelSpot {
  kind: 'control' | 'jack';
  id: string;
  x: number;
  y: number;
  r: number;
  lit: { w: number; h: number };
}

/** A round part's lit circle, as a share of its reach: the reach takes in the legends, and rings that wide overlap. */
const LIT_ROUND = 0.7;
/** Panel units round a square part's own box. */
const LIT_PAD = 10;

const round = (r: number) => ({ w: r * 2 * LIT_ROUND, h: r * 2 * LIT_ROUND });

/** The box lit round a control: its own rectangle where it has one, otherwise a circle a share of its reach. */
function controlLit(c: Control): PanelSpot['lit'] {
  if (c.type === 'slide' || c.type === 'rocker' || c.type === 'button' || c.type === 'menu')
    return { w: c.w + LIT_PAD * 2, h: c.h + LIT_PAD * 2 };
  if (c.type === 'fader') {
    // The slot (`Fader` in parts.tsx) runs `pad` past each end of the travel; the cap is about 40 across.
    const long = (c.len || 200) + (c.pad ?? 12) * 2 + LIT_PAD * 2;
    const short = 40 + LIT_PAD * 2;
    return c.orient === 'h' ? { w: long, h: short } : { w: short, h: long };
  }
  if (c.type === 'select') {
    // A row of buttons, each `w` × `h` at its option's x, y: the box round the row, not a circle as wide as it.
    const dx = Math.max(...c.options.map((o) => Math.abs((o.x ?? c.x) - c.x)));
    const dy = Math.max(...c.options.map((o) => Math.abs((o.y ?? c.y) - c.y)));
    return { w: dx * 2 + c.w + LIT_PAD * 2, h: dy * 2 + c.h + LIT_PAD * 2 };
  }
  return round(controlReach(c));
}

/** A box of the panel, in panel units, and the spots inside it. */
export interface PanelCrop {
  x: number;
  y: number;
  w: number;
  h: number;
  spots: PanelSpot[];
}

/** Panel units around the outermost spots of a crop. */
export const CROP_PAD = 16;
/** Spots closer than this, edge to edge, are one cluster: they are drawn in the same crop, never split. */
export const CROP_GAP = 60;
/**
 * The largest crop that still reads in the card's picture, about 280 × 220 px: either side at its limit draws at a
 * third of a pixel a unit, a Model D knob about 19 px across. A block whose spots spread wider is drawn as one crop
 * per cluster. A cluster is never cut, so a dense one can pass the cap and draw smaller.
 */
export const CROP_MAX_W = 840;
export const CROP_MAX_H = 660;
/** Past this many crops a block's spots are scattered over the panel, and its card shows no picture. */
export const CROP_MAX = 3;

const spotsBox = (spots: PanelSpot[]) => {
  const x = Math.min(...spots.map((s) => s.x - s.r));
  const y = Math.min(...spots.map((s) => s.y - s.r));
  return {
    x,
    y,
    w: Math.max(...spots.map((s) => s.x + s.r)) - x,
    h: Math.max(...spots.map((s) => s.y + s.r)) - y,
  };
};

const fits = (spots: PanelSpot[]) => {
  const b = spotsBox(spots);
  return b.w + CROP_PAD * 2 <= CROP_MAX_W && b.h + CROP_PAD * 2 <= CROP_MAX_H;
};

/**
 * Where a block sits on the panel: the boxes of `panel` (the definition as the panel draws it, so a modular's case)
 * that hold the controls the block lists and the jacks the routing gives it, each spot by its reach (`controlReach`,
 * `jackReach`), padded and kept on the faceplate. One box when they fit `CROP_MAX_W` × `CROP_MAX_H`; otherwise the
 * clusters, joined while a join still fits, left to right. Empty for a block with nothing on the panel, and for one
 * spread over more than `CROP_MAX` boxes. With `values`, a control the panel does not draw at them (`isShown`) is
 * left out, as it is from the faceplate.
 */
export function panelCrops(
  panel: SynthDef,
  routing: SynthRouting,
  block: RoutingBlock,
  values?: ControlValues
): PanelCrop[] {
  const controls = controlMap(panel);
  const jacks = jackMap(panel);
  const spots: PanelSpot[] = [
    ...(block.controls ?? []).flatMap((id) => {
      const c = controls[id];
      return c && (!values || isShown(c, values))
        ? [{ kind: 'control' as const, id, x: c.x, y: c.y, r: controlReach(c), lit: controlLit(c) }]
        : [];
    }),
    ...Object.entries(routing.jacks).flatMap(([id, b]) => {
      const j = b === block.id ? jacks[id] : undefined;
      if (!j) return [];
      const r = jackReach(j);
      return [{ kind: 'jack' as const, id, x: j.x, y: j.y, r, lit: round(r) }];
    }),
  ];
  if (!spots.length) return [];

  let groups: PanelSpot[][];
  if (fits(spots)) groups = [spots];
  else {
    // Clusters: a spot joins every cluster it comes within CROP_GAP of, which merges them.
    groups = [];
    for (const s of spots) {
      const near = (g: PanelSpot[]) =>
        g.some(
          (t) =>
            Math.abs(s.x - t.x) - s.r - t.r <= CROP_GAP &&
            Math.abs(s.y - t.y) - s.r - t.r <= CROP_GAP
        );
      const joined = [s, ...groups.filter(near).flat()];
      groups = [...groups.filter((g) => !near(g)), joined];
    }
    // Then join the pair of clusters whose box is smallest, while it fits.
    for (;;) {
      let best: { i: number; j: number; area: number } | null = null;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const both = [...groups[i], ...groups[j]];
          if (!fits(both)) continue;
          const b = spotsBox(both);
          if (!best || b.w * b.h < best.area) best = { i, j, area: b.w * b.h };
        }
      if (!best) break;
      const { i, j } = best;
      groups = [...groups.filter((_, k) => k !== i && k !== j), [...groups[i], ...groups[j]]];
    }
    if (groups.length > CROP_MAX) return [];
  }

  const face = faceView(panel);
  return groups
    .map((g) => {
      const b = spotsBox(g);
      const x = Math.max(face.x, b.x - CROP_PAD);
      const y = Math.max(0, b.y - CROP_PAD);
      return {
        x,
        y,
        w: Math.min(face.x + face.w, b.x + b.w + CROP_PAD) - x,
        h: Math.min(face.h, b.y + b.h + CROP_PAD) - y,
        spots: g,
      };
    })
    .sort((a, b) => a.x - b.x);
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Everything wrong with a routing against its definition, as plain sentences; empty when it is sound. */
export function routingProblems(def: SynthDef, routing: SynthRouting): string[] {
  const problems: string[] = [];
  const controls = controlMap(def);
  const jacks = jackMap(def);
  const blocks = new Set(routing.blocks.map((b) => b.id));
  const seen = new Set<string>();
  const once = (kind: string, id: string) => {
    if (seen.has(`${kind}:${id}`)) problems.push(`${kind} ${id} is listed twice`);
    seen.add(`${kind}:${id}`);
  };
  const block = (where: string, id: string) => {
    if (!blocks.has(id)) problems.push(`${where}: no block ${id}`);
  };

  const checkWhen = (where: string, w: RoutingWhen): void => {
    if ('all' in w) return w.all.forEach((x) => checkWhen(where, x));
    if ('any' in w) return w.any.forEach((x) => checkWhen(where, x));
    const c = controls[w.id];
    if (!c) return void problems.push(`${where}: no control ${w.id}`);
    const legal =
      c.kind === 'enum'
        ? (x: unknown) => c.options.some((o) => o.v === x)
        : c.kind === 'bool'
          ? (x: unknown) => typeof x === 'boolean'
          : (x: unknown) => typeof x === 'number' && x >= c.min && x <= c.max;
    for (const x of 'in' in w ? w.in : [w.eq])
      if (!legal(x)) problems.push(`${where}: ${JSON.stringify(x)} is not a value of ${w.id}`);
  };
  const checkLevel = (where: string, l: RoutingLevel): void => {
    if (typeof l !== 'string' && 'sum' in l) return l.sum.forEach((x) => checkLevel(where, x));
    const { id, off, pow } = typeof l === 'string' ? { id: l } : l;
    if (id === WHEEL) return;
    const c = controls[id];
    if (!c) return void problems.push(`${where}: no control ${id}`);
    if (off !== undefined) checkWhen(where, { id, eq: off });
    else if (c.kind !== 'cont')
      problems.push(`${where}: ${id} is not continuous; give it an off value`);
    if (pow !== undefined && (c.kind !== 'cont' || !(pow > 0)))
      problems.push(`${where}: ${id} cannot take pow ${pow}`);
  };

  const breaker = new Map<string, string>();

  if (routing.synth !== def.id) problems.push(`routing is for ${routing.synth}, not ${def.id}`);
  routing.blocks.forEach((b) => once('block', b.id));
  block('out', routing.out);
  for (const e of routing.edges) {
    const where = `edge ${e.id}`;
    once('edge', e.id);
    block(where, e.from);
    block(where, e.to);
    if (e.when) checkWhen(where, e.when);
    e.levels?.forEach((l) => checkLevel(where, l));
    if (e.breaks) {
      const other = breaker.get(e.breaks);
      if (other) problems.push(`${where}: ${e.breaks} already breaks edge ${other}`);
      breaker.set(e.breaks, e.id);
      const j = jacks[e.breaks];
      if (!j) problems.push(`${where}: no jack ${e.breaks}`);
      else if (j.dir !== 'in') problems.push(`${where}: ${e.breaks} is not an input`);
      else if (j.add)
        problems.push(`${where}: ${e.breaks} sums with its normal, so cannot break it`);
      else if (routing.jacks[e.breaks] !== e.to)
        problems.push(`${where}: ${e.breaks} does not feed ${e.to}`);
    }
  }
  for (const [id, b] of Object.entries(routing.jacks)) {
    if (!jacks[id]) problems.push(`jacks: no jack ${id}`);
    block(`jack ${id}`, b);
  }
  for (const j of def.jacks)
    if (!(j.id in routing.jacks)) problems.push(`jack ${j.id} belongs to no block`);
  for (const id of routing.audioJacks ?? []) {
    once('audio jack', id);
    if (!(id in routing.jacks)) problems.push(`audioJacks: ${id} belongs to no block`);
  }
  // Every control the sound hears sets some block, so a block's card can name what drives it.
  const listed = new Set<string>();
  for (const b of routing.blocks) {
    const own = new Set<string>();
    for (const id of b.controls ?? []) {
      if (!controls[id]) problems.push(`block ${b.id}: no control ${id}`);
      else if (controls[id].ui) problems.push(`block ${b.id}: ${id} is a panel mode, not heard`);
      if (own.has(id)) problems.push(`block ${b.id}: ${id} is listed twice`);
      own.add(id);
      listed.add(id);
    }
  }
  for (const c of def.controls)
    if (!c.ui && !listed.has(c.id)) problems.push(`control ${c.id} sets no block`);
  // A stage map names the block's own knobs, on a block that follows an envelope the engine reports a stage for.
  for (const b of routing.blocks) {
    if (!b.stages) continue;
    if (b.meter !== 'env1' && b.meter !== 'env2')
      problems.push(`block ${b.id}: stages need an env1 or env2 meter`);
    for (const [stage, light] of Object.entries(b.stages)) {
      const where = `block ${b.id} stage ${stage}`;
      const { id, when } = typeof light === 'string' ? { id: light, when: undefined } : light;
      if (!(b.controls ?? []).includes(id))
        problems.push(`${where}: ${id} is not one of its controls`);
      if (when) checkWhen(where, when);
    }
  }

  // Every block has a way to the output, with every switch allowed and a cable from any output jack to any input.
  const blockOf = (dir: 'in' | 'out') =>
    def.jacks.filter((j) => j.dir === dir).flatMap((j) => routing.jacks[j.id] ?? []);
  const outs = blockOf('out');
  const reach = reachBack(routing.out, [
    ...routing.edges.map((e): [string, string] => [e.from, e.to]),
    ...blockOf('in').flatMap((to) => outs.map((from): [string, string] => [from, to])),
  ]);
  // A block that only measures (the VCS3's meter: no edges, and only inputs the engine does not hear) needs no way out.
  const measures = (id: string) =>
    !routing.edges.some((e) => e.from === id || e.to === id) &&
    def.jacks.some((j) => routing.jacks[j.id] === id) &&
    def.jacks.every((j) => routing.jacks[j.id] !== id || (j.dir === 'in' && j.dest === null));
  for (const b of routing.blocks)
    if (!reach.has(b.id) && !measures(b.id))
      problems.push(`block ${b.id} has no way to ${routing.out}`);
  // And every block that only passes signal on has something that could feed it.
  const inBlocks = new Set(blockOf('in'));
  for (const b of routing.blocks)
    if (b.passes && !inBlocks.has(b.id) && !routing.edges.some((e) => e.to === b.id))
      problems.push(`block ${b.id} passes signal on, but nothing feeds it`);

  return problems;
}
