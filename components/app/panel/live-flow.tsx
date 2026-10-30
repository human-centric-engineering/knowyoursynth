'use client';

/**
 * The live flow on the panel's face (`f-live-panel` t-153, Signal ▾ Live + flow): a faint line from each lit part to
 * the part it feeds, drawn only while the patch routes signal along it, in the routing view's style (audio heavy,
 * control light, gate dotted) and its source's colour. Where the lines go is `liveFlows()`; how brightly each glows,
 * and the dashes running along it in the direction of flow, are written by the live glow's frame loop (`LiveLayer`):
 * `--a` on each line, from `routingActivity()`'s edges and cables, and `--run` on the group, which stays put for a
 * visitor who asks for less motion.
 */

import { moduleOf } from '@/lib/app/synths/lib/modules';
import type { FlowLine } from '@/lib/app/synths/lib/live-flow';
import type { SynthRouting } from '@/lib/app/synths/contract';

/** How far the dashes run along a line, in panel units a second. */
export const RUN_PER_S = 40;

export function LiveFlow({ lines, routing }: { lines: FlowLine[]; routing: SynthRouting }) {
  const moduleOfBlock = new Map(routing.blocks.map((b) => [b.id, b.module]));
  return (
    <g className="kys-flow" data-testid="live-flow">
      {lines.map((l) => (
        <g
          key={l.id}
          data-flow={l.id}
          className={`kys-flow-line is-${l.signal}`}
          style={{ color: moduleOf(moduleOfBlock.get(l.from)).color }}
        >
          <path d={l.d} className="kys-flow-path" />
          <path d={l.d} className="kys-flow-run" />
          <path d={l.head} className="kys-flow-head" />
        </g>
      ))}
    </g>
  );
}
