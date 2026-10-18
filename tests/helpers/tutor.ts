/**
 * Builders for the tutor's tool tests: a `CapabilityContext` carrying a panel as the stream route passes it.
 *
 * @see lib/app/tutor/panel.ts
 */
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';

/** A synth from the real registry, failing the test loudly when the id is wrong. */
export function synth(id: string): AppSynthDef {
  const def = getSynthDef(id);
  if (!def) throw new Error(`No synth ${id} in the registry`);
  return def;
}

/** A tool's context for this panel on this synth: values over the init, and the cables in. */
export function panelContext(
  def: AppSynthDef,
  panel: { values?: ControlValues; cables?: CablePair[] } = {},
  overrides: Partial<CapabilityContext> = {}
): CapabilityContext {
  return {
    userId: 'user-1',
    agentId: 'agent-tutor',
    entityContext: {
      synthId: def.id,
      version: def.version,
      panel: { values: panel.values ?? {}, cables: panel.cables ?? [] },
    },
    ...overrides,
  };
}

/** Up to `n` distinct cables a panel can hold: each from a modelled output to a modelled input. */
export function manyCables(def: AppSynthDef, n: number): CablePair[] {
  const outs = def.jacks.filter((j) => j.dir === 'out' && j.signal);
  const ins = def.jacks.filter((j) => j.dir === 'in' && j.dest);
  return outs.flatMap((o) => ins.map((i): CablePair => [o.id, i.id])).slice(0, n);
}
