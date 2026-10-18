/**
 * Builders for the tutor's tests: a `CapabilityContext` carrying a panel as the stream route passes it, for the tools;
 * and a transcript the daily allowance counts, for the allowance and the routes.
 *
 * @see lib/app/tutor/panel.ts · lib/app/tutor/allowance.ts
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

/** One message in a fake transcript: who sent it, to which agent, in which role, when. */
export interface MessageRow {
  userId: string;
  agentSlug: string;
  role: 'user' | 'assistant' | 'tool';
  createdAt: Date;
}

interface MessageCountWhere {
  role: string;
  createdAt: { gte: Date };
  conversation: { userId: string; agent: { slug: string } };
}

/**
 * An in-memory `prisma.aiMessage.count` that applies the allowance's filters the way the database would (owner, agent,
 * role and day), so a test that another person's turns, another agent's or yesterday's are not counted fails if the
 * filter goes.
 *
 * @see lib/app/tutor/allowance.ts
 */
export function fakeMessageTable(rows: MessageRow[]) {
  return {
    rows,
    count: async ({ where }: { where: MessageCountWhere }) =>
      rows.filter(
        (m) =>
          m.role === where.role &&
          m.createdAt >= where.createdAt.gte &&
          m.userId === where.conversation.userId &&
          m.agentSlug === where.conversation.agent.slug
      ).length,
  };
}

/** `n` turns `userId` sent to an agent (the tutor unless named), a minute apart, starting at `from`. */
export function tutorTurns(
  userId: string,
  n: number,
  from: Date,
  agentSlug = 'synth-tutor'
): MessageRow[] {
  return Array.from({ length: n }, (_, i) => ({
    userId,
    agentSlug,
    role: 'user' as const,
    createdAt: new Date(from.getTime() + i * 60_000),
  }));
}
