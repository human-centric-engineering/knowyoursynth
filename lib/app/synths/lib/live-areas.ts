// Where the live glow on the panel's face (`f-live-panel`) lights each part of the routing: the patches of panel that
// belong to the part's controls (`RoutingBlock.controls`), as `panelCells()` splits the faceplate for "Dim unused", so
// a glowing section and a dimmed one meet along the same lines. A part with no control on the panel (the VCA, the
// mod bus on a synth that has no switch for it) has nothing to light.
import { panelCells } from '@/lib/app/synths/lib/cells';
import type { ControlValues, SynthDef, SynthModule, SynthRouting } from '@/lib/app/synths/contract';

/** One part's patch of the panel: the union of its controls' cells, as one path. */
export interface LiveArea {
  /** The routing block's id. */
  id: string;
  /** Picks the glow's colour, as on the routing view's lamp. */
  module: SynthModule;
  d: string;
}

/**
 * Every part of `routing` that has a patch of the drawn panel `def`, in the routing's order. `patched` = ids of the
 * jacks with a cable in them, and `values` the panel's, as `panelCells()` takes them: a control a panel mode hides has
 * no cell while it is hidden.
 */
export function liveAreas(
  def: SynthDef,
  routing: SynthRouting,
  patched: string[],
  values: ControlValues
): LiveArea[] {
  const { cells } = panelCells(def, patched, values);
  return routing.blocks.flatMap((b) => {
    const d = (b.controls ?? []).map((id) => cells[id] ?? '').join('');
    return d ? [{ id: b.id, module: b.module, d }] : [];
  });
}
