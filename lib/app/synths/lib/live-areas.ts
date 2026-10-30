// Where the live glow on the panel's face (`f-live-panel`) lights each part of the routing: the patches of panel that
// belong to the part's controls (`RoutingBlock.controls`) and to its jacks with a cable in them (`SynthRouting.jacks`),
// as `panelCells()` splits the faceplate for "Dim unused", so a glowing section and a dimmed one meet along the same
// lines. The jacks matter on a modular or a pin matrix, whose modules have few controls: a live one would otherwise
// read as a thin sliver. A part with nothing on the panel (the VCA, the mod bus on a synth that has no switch for it)
// has nothing to light.
import { inArea, panelCells } from '@/lib/app/synths/lib/cells';
import { holds } from '@/lib/app/synths/lib/routing';
import type {
  ControlValues,
  LitStage,
  SynthDef,
  SynthModule,
  SynthRouting,
} from '@/lib/app/synths/contract';

/** One patch of the panel that glows: the union of its controls' and patched jacks' cells, as one path. */
export interface LiveArea {
  /**
   * Its blocks' ids, space-separated (block ids have no spaces): one block's id, but for a control two blocks share.
   * The layer reads its blocks back from it, off the path's `data-live`.
   */
  id: string;
  /**
   * The routing blocks it glows for, at the brightest of them. One, but for a control that sets two parts (one
   * pulse-width knob for both oscillators), which lights with either rather than glowing twice over itself.
   */
  blocks: string[];
  /** Picks the glow's colour, as on the routing view's lamp: its first block's. */
  module: SynthModule;
  d: string;
}

/**
 * Every patch of the drawn panel `def` that glows for a part of `routing`, in the routing's order: one per block, and
 * one per set of blocks that share a control. No two overlap. `patched` = ids of the jacks with a cable in them, and
 * `values` the panel's, as `panelCells()` takes them: a control a panel mode hides has no cell while it is hidden, and
 * an empty jack lights only in a section of jacks that are all one block's.
 */
export function liveAreas(
  def: SynthDef,
  routing: SynthRouting,
  patched: string[],
  values: ControlValues
): LiveArea[] {
  const { cells } = panelCells(def, patched, values);
  // Each control and patched jack, and the blocks it glows for.
  const owners = new Map<string, string[]>();
  for (const b of routing.blocks)
    for (const id of b.controls ?? []) owners.set(id, [...(owners.get(id) ?? []), b.id]);
  const blockOf = (jack: string) =>
    Object.hasOwn(routing.jacks, jack) ? routing.jacks[jack] : undefined;
  for (const id of patched) {
    const block = blockOf(id);
    if (block) owners.set(id, [block]);
  }
  // A section of jacks alone that are all one block's (a modular's output module) is that block's: one cable in it
  // lights the whole of it, where a patch bay shared by many blocks lights jack by jack.
  for (const area of def.areas ?? []) {
    const within = (p: { x: number; y: number }) => inArea(def, area, p);
    if (def.controls.some((c) => cells[c.id] && within(c))) continue;
    const jacks = def.jacks.filter(within).map((j) => j.id);
    const blocks = new Set(jacks.map(blockOf));
    const [block] = blocks;
    if (blocks.size !== 1 || !block || !jacks.some((j) => patched.includes(j))) continue;
    for (const j of jacks) owners.set(j, [block]);
  }
  const order = new Map(routing.blocks.map((b, i) => [b.id, i]));
  const first = (a: LiveArea) => order.get(a.blocks[0]) ?? 0;
  const areas = new Map<string, LiveArea>();
  for (const [id, blocks] of owners) {
    if (!cells[id]) continue;
    const key = blocks.join(' ');
    const area = areas.get(key);
    if (area) area.d += cells[id];
    else {
      const { module } = routing.blocks[order.get(blocks[0]) ?? 0];
      areas.set(key, { id: key, blocks, module, d: cells[id] });
    }
  }
  return [...areas.values()].sort(
    (a, b) => first(a) - first(b) || a.blocks.length - b.blocks.length
  );
}

/** One contour's knob for one stage: lit while the envelope the contour follows is in that stage. */
export interface StageLight {
  /** `block:stage`. */
  id: string;
  /** The envelope whose stage it follows (the block's `meter`). */
  env: 'env1' | 'env2';
  stage: LitStage;
  /** Picks its colour: its block's. */
  module: SynthModule;
  /** The knob's cell, as `liveAreas()` draws it. */
  d: string;
}

const LIT_STAGES: readonly LitStage[] = ['delay', 'attack', 'hold', 'decay', 'sustain', 'release'];

/**
 * Every stage knob of `routing`'s contours (`RoutingBlock.stages`) on the drawn panel `def`, with `patched` and
 * `values` as `liveAreas()` takes them. A stage whose `when` does not hold for `values` lights nothing: the Model D's
 * release, with its DECAY switch off.
 */
export function liveStages(
  def: SynthDef,
  routing: SynthRouting,
  patched: string[],
  values: ControlValues
): StageLight[] {
  const { cells } = panelCells(def, patched, values);
  return routing.blocks.flatMap((b) => {
    const { stages, meter } = b;
    if (!stages || (meter !== 'env1' && meter !== 'env2')) return [];
    return LIT_STAGES.flatMap((stage) => {
      const light = stages[stage];
      if (!light) return [];
      const { id, when } = typeof light === 'string' ? { id: light, when: undefined } : light;
      const d = cells[id];
      if (!d || (when && !holds(when, values))) return [];
      return [{ id: `${b.id}:${stage}`, env: meter, stage, module: b.module, d }];
    });
  });
}
