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
  ControlValue,
  ControlValues,
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  StageControl,
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

/** A stage's knob and the condition it lights under (`RoutingBlock.stages`), whichever way it is written. */
export function stageControl(light: StageControl): { id: string; when?: RoutingWhen } {
  return typeof light === 'string' ? { id: light } : light;
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
      if (!light) continue;
      const where = `block ${b.id} stage ${stage}`;
      const { id, when } = stageControl(light);
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

// ─── The mod wheel's reach ───────────────────────────────────────────────────

/** Whether `level` reads the mod wheel, alone or as one part of a sum. */
export function readsWheel(level: RoutingLevel): boolean {
  if (typeof level === 'string') return level === WHEEL;
  if ('sum' in level) return level.sum.some(readsWheel);
  return level.id === WHEEL;
}

/** The wheel's own signal: an edge with the wheel as a level by itself, not as part of a sum it scales. */
const ownWheel = (e: RoutingEdge) =>
  (e.levels ?? []).some(
    (l) => l === WHEEL || (typeof l !== 'string' && 'id' in l && l.id === WHEEL)
  );

/** Where the mod wheel's modulation goes, read from the routing (`wheelReach`). */
export interface WheelReach {
  /** The blocks whose signal it scales on their way in (Model D: the mod bus's sources MOD MIX lets through). */
  sources: string[];
  /** The blocks the modulation lands on, in routing order. Empty: pushing the wheel changes nothing. */
  blocks: string[];
  /** The edges it travels, from its own and its sources' to where it lands. */
  edges: string[];
  /** The switches it passes on its way to where it lands: the controls of those edges' conditions, each set as it is. */
  switches: string[];
  /** Where it lands nowhere: the switches, any one of them set as given, that would send it somewhere. */
  doors: { id: string; v: ControlValue }[];
  /**
   * The knobs the wheel adds to (Model D: MOD DEPTH), each with where it would have to be to give, on its own, the
   * depth it and the wheel give now. Read at the wheel's own position, where the rest is read with it all the way up.
   */
  depth: { id: string; value: number }[];
}

/** Every leaf condition of `when`: the switch settings it asks for. */
function conditions(
  when: RoutingWhen
): Exclude<RoutingWhen, { all: unknown } | { any: unknown }>[] {
  if ('all' in when) return when.all.flatMap(conditions);
  if ('any' in when) return when.any.flatMap(conditions);
  return [when];
}

/** Where the wheel's modulation lands at `values`, the wheel all the way up: its landing blocks and how it gets there. */
function wheelPath(def: SynthDef, routing: SynthRouting, input: RoutingInput) {
  const state = routingState(def, routing, { ...input, wheel: 1 });
  const passes = new Set(routing.blocks.filter((b) => b.passes).map((b) => b.id));
  const edges = new Set<string>();
  const sources = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const e of routing.edges) {
    if (!state.edges[e.id] || !(e.levels ?? []).some(readsWheel)) continue;
    edges.add(e.id);
    if (!ownWheel(e) && passes.has(e.to)) sources.add(e.from);
    if (!seen.has(e.to)) {
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  // On through each block that only passes signal on, over what it sends live, to the blocks it lands on.
  const landed = new Set<string>();
  for (let b = queue.shift(); b !== undefined; b = queue.shift()) {
    if (!passes.has(b)) {
      landed.add(b);
      continue;
    }
    for (const e of routing.edges)
      if (e.from === b && state.edges[e.id]) {
        edges.add(e.id);
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
  }
  const into = routing.edges.filter((e) => edges.has(e.id) && landed.has(e.to));
  const switches = into.flatMap((e) =>
    (e.when ? conditions(e.when) : []).filter((w) => holds(w, input.values)).map((w) => w.id)
  );
  return {
    sources: routing.blocks.filter((b) => sources.has(b.id)).map((b) => b.id),
    blocks: routing.blocks.filter((b) => landed.has(b.id)).map((b) => b.id),
    edges: routing.edges.filter((e) => edges.has(e.id)).map((e) => e.id),
    switches: [...new Set(switches)],
  };
}

/**
 * Where pushing the mod wheel sends modulation, from the synth's routing, so no synth writes it by hand: the edges
 * whose levels read the wheel, live with the wheel all the way up, followed on through any block that only passes
 * signal on (`passes`) over the edges it sends live (`routingState`), to the blocks the modulation lands on. Cables
 * count as they do there, where they break a normal; the walk on goes over edges only. `null` for a routing that
 * never reads the wheel, which says nothing about where it goes.
 */
export function wheelReach(
  def: SynthDef,
  routing: SynthRouting,
  input: RoutingInput
): WheelReach | null {
  const wheelEdges = routing.edges.filter((e) => (e.levels ?? []).some(readsWheel));
  if (!wheelEdges.length) return null;
  const path = wheelPath(def, routing, input);

  // Nowhere: the switches on the way that, set, would send it somewhere. On the way: past the wheel's edges and on
  // through what only passes signal on, every edge counted whatever its switches.
  const doors: WheelReach['doors'] = [];
  if (!path.blocks.length) {
    const passes = new Set(routing.blocks.filter((b) => b.passes).map((b) => b.id));
    const way = new Set(wheelEdges.map((e) => e.id));
    const from = [...new Set(wheelEdges.map((e) => e.to))].filter((b) => passes.has(b));
    for (let i = 0; i < from.length; i++)
      for (const e of routing.edges)
        if (e.from === from[i]) {
          way.add(e.id);
          if (passes.has(e.to) && !from.includes(e.to)) from.push(e.to);
        }
    for (const e of routing.edges) {
      if (!way.has(e.id) || !e.when) continue;
      for (const w of conditions(e.when)) {
        if (holds(w, input.values) || doors.some((d) => d.id === w.id)) continue;
        const v = 'in' in w ? w.in[0] : w.eq;
        if (
          wheelPath(def, routing, { ...input, values: { ...input.values, [w.id]: v } }).blocks
            .length
        )
          doors.push({ id: w.id, v });
      }
    }
  }

  // The knobs summed with the wheel on its way, each where it would have to be to give that sum on its own.
  const depth: WheelReach['depth'] = [];
  const controls = controlMap(def);
  const wheel = Math.min(1, Math.max(0, input.wheel ?? 0));
  for (const e of routing.edges) {
    if (!path.edges.includes(e.id)) continue;
    for (const l of e.levels ?? []) {
      if (typeof l === 'string' || !('sum' in l) || !l.sum.some(readsWheel)) continue;
      const knobs = l.sum.filter((x) => !readsWheel(x));
      if (knobs.length !== 1) continue;
      const k = knobs[0];
      if (typeof k !== 'string' && 'sum' in k) continue;
      const { id, pow = 1 } = typeof k === 'string' ? { id: k } : k;
      const c = controls[id];
      if (!c || c.kind !== 'cont' || depth.some((d) => d.id === id)) continue;
      const total = amount(def, k, input) + wheel;
      const at = Math.min(1, Math.pow(total, 1 / pow));
      depth.push({ id, value: c.min + at * (c.max - c.min) });
    }
  }
  return { ...path, doors, depth };
}
