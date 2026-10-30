// Where the live glow on the panel's face (`f-live-panel`) lights each part of the routing: the patches of panel that
// belong to the part's controls (`RoutingBlock.controls`) and to its jacks with a cable in them (`SynthRouting.jacks`),
// as `panelCells()` splits the faceplate for "Dim unused", so a glowing section and a dimmed one meet along the same
// lines. The jacks matter on a modular or a pin matrix, whose modules have few controls: a live one would otherwise
// read as a thin sliver. A part with nothing on the panel (the VCA, the mod bus on a synth that has no switch for it)
// has nothing to light.
import { panelCells } from '@/lib/app/synths/lib/cells';
import type { ControlValues, SynthDef, SynthModule, SynthRouting } from '@/lib/app/synths/contract';

/** One patch of the panel that glows: the union of its controls' and patched jacks' cells, as one path. */
export interface LiveArea {
  /** Its blocks' ids, space-separated: one block's id, but for a control two blocks share. */
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
 * an empty jack none of its own.
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
  for (const id of patched) {
    const block = Object.hasOwn(routing.jacks, id) ? routing.jacks[id] : undefined;
    if (block) owners.set(id, [block]);
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
