// Signal routing: which parts of a synth the current patch actually uses, read from its routing (`SynthRouting`).
// Structural, not heard: an edge is live while its switches are set, its levels are above zero and no cable has broken
// it, and a block is live while some live path runs from it to the output. The sound map (`soundmap.ts`) answers the
// other question, whether a control changes what is heard, by probing the real voice; the two can disagree (a filter
// closed to nothing is still on the path), and the view says which it shows.
//
// Pure, like `toEngine()`: same definition, routing, values and cables in, same answer out.
import { controlMap, jackMap } from '@/lib/app/synths/lib/patch';
import type {
  ControlValues,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthDef,
  SynthRouting,
} from '@/lib/app/synths/contract';

/** The mod wheel, in a `RoutingLevel` (the sound map's `WHEEL` uses the same name). */
export const ROUTING_WHEEL = '@wheel';

/** A cable as the panel holds it: output jack to input jack. */
export interface RoutingCable {
  from: string;
  to: string;
}

/** A cable between two blocks, and whether it is on a live path. */
export interface RoutingCableState {
  from: string;
  to: string;
  fromBlock: string;
  toBlock: string;
  live: boolean;
}

export interface RoutingState {
  /** Every block, true while it is on a live path to the output. */
  blocks: Record<string, boolean>;
  /** Every edge, true while it carries signal to a live block. */
  edges: Record<string, boolean>;
  /** Every cable between two of the routing's jacks, in patch order. */
  cables: RoutingCableState[];
}

export interface RoutingInput {
  values: ControlValues;
  cables: RoutingCable[];
  /** Mod wheel position, 0..1. */
  wheel?: number;
}

function holds(when: RoutingWhen, values: ControlValues): boolean {
  if ('all' in when) return when.all.every((w) => holds(w, values));
  if ('any' in when) return when.any.some((w) => holds(w, values));
  if ('in' in when) return when.in.includes(values[when.id]);
  return values[when.id] === when.eq;
}

function aboveZero(def: SynthDef, level: RoutingLevel, input: RoutingInput): boolean {
  if (typeof level !== 'string') {
    if ('sum' in level) return level.sum.some((l) => aboveZero(def, l, input));
    return input.values[level.id] !== level.off;
  }
  if (level === ROUTING_WHEEL) return (input.wheel ?? 0) > 0;
  const c = controlMap(def)[level];
  const v = input.values[level];
  return c?.kind === 'cont' && typeof v === 'number' ? v > c.min : false;
}

const enabled = (def: SynthDef, edge: RoutingEdge, input: RoutingInput): boolean =>
  (!edge.when || holds(edge.when, input.values)) &&
  (edge.levels ?? []).every((l) => aboveZero(def, l, input));

/**
 * Which blocks, edges and cables of `routing` the patch uses. A cable into a jack that breaks a normal takes the
 * normal's place, and is heard only under the normal's switches and levels.
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
  const cables = input.cables.flatMap((c) => {
    const fromBlock = routing.jacks[c.from];
    const toBlock = routing.jacks[c.to];
    if (!fromBlock || !toBlock) return [];
    const normal = normalAt.get(c.to);
    return [{ ...c, fromBlock, toBlock, on: !normal || enabled(def, normal, input) }];
  });

  // Walk back from the output over everything that carries signal.
  const into = new Map<string, string[]>();
  const link = (from: string, to: string) => into.set(to, [...(into.get(to) ?? []), from]);
  for (const e of routing.edges) if (edgeOn.get(e.id)) link(e.from, e.to);
  for (const c of cables) if (c.on) link(c.fromBlock, c.toBlock);
  const live = new Set([routing.out]);
  const queue = [routing.out];
  for (let b = queue.pop(); b !== undefined; b = queue.pop())
    for (const from of into.get(b) ?? [])
      if (!live.has(from)) {
        live.add(from);
        queue.push(from);
      }

  return {
    blocks: Object.fromEntries(routing.blocks.map((b) => [b.id, live.has(b.id)])),
    edges: Object.fromEntries(
      routing.edges.map((e) => [e.id, !!edgeOn.get(e.id) && live.has(e.to)])
    ),
    cables: cables.map(({ on, ...c }) => ({ ...c, live: on && live.has(c.toBlock) })),
  };
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
    if (typeof l !== 'string') {
      if ('sum' in l) return l.sum.forEach((x) => checkLevel(where, x));
      return checkWhen(where, { id: l.id, eq: l.off });
    }
    if (l === ROUTING_WHEEL) return;
    const c = controls[l];
    if (!c) problems.push(`${where}: no control ${l}`);
    else if (c.kind !== 'cont')
      problems.push(`${where}: ${l} is not continuous; give it an off value`);
  };

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

  // Every block has a way to the output, with every switch and cable allowed.
  const into = new Map<string, string[]>();
  for (const e of routing.edges) into.set(e.to, [...(into.get(e.to) ?? []), e.from]);
  const reach = new Set([routing.out]);
  const queue = [routing.out];
  for (let b = queue.pop(); b !== undefined; b = queue.pop())
    for (const from of into.get(b) ?? [])
      if (!reach.has(from)) {
        reach.add(from);
        queue.push(from);
      }
  for (const b of routing.blocks)
    if (!reach.has(b.id)) problems.push(`block ${b.id} has no way to ${routing.out}`);

  return problems;
}
