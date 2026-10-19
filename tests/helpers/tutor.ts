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
  /** Whether the agent is the platform's row (the tutor is); false for an org's own agent under the same slug. */
  agentIsSystem?: boolean;
  role: 'user' | 'assistant' | 'tool';
  createdAt: Date;
  /** A tool row's tool, and whether its result was a success (`metadata.result.success`). */
  capabilitySlug?: string;
  succeeded?: boolean;
}

type RoleWhere = {
  role: string;
  capabilitySlug?: string;
  metadata?: { path: string[]; equals: unknown };
};

interface MessageCountWhere {
  OR: RoleWhere[];
  createdAt: { gte: Date };
  conversation: { userId: string; agent: { slug: string; isSystem?: boolean } };
}

function matchesRole(m: MessageRow, w: RoleWhere): boolean {
  if (m.role !== w.role) return false;
  if (w.capabilitySlug !== undefined && m.capabilitySlug !== w.capabilitySlug) return false;
  if (w.metadata) {
    // The only metadata path the allowance reads.
    if (w.metadata.path.join('.') !== 'result.success') return false;
    if ((m.succeeded ?? false) !== w.metadata.equals) return false;
  }
  return true;
}

/**
 * An in-memory `prisma.aiMessage.count` that applies the allowance's filters the way the database would (owner, agent,
 * the agent's `isSystem` when asked, role or tool and its outcome, and day), so a test that another person's turns, another agent's or
 * yesterday's are not counted fails if the filter goes.
 *
 * @see lib/app/tutor/allowance.ts
 */
export function fakeMessageTable(rows: MessageRow[]) {
  return {
    rows,
    count: async ({ where }: { where: MessageCountWhere }) =>
      rows.filter(
        (m) =>
          where.OR.some((w) => matchesRole(m, w)) &&
          m.createdAt >= where.createdAt.gte &&
          m.userId === where.conversation.userId &&
          m.agentSlug === where.conversation.agent.slug &&
          (where.conversation.agent.isSystem === undefined ||
            (m.agentIsSystem ?? true) === where.conversation.agent.isSystem)
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

/** `n` web searches the tutor ran for `userId`, as the tool rows `streamChat` saves; `succeeded: false` for refusals. */
export function tutorSearches(
  userId: string,
  n: number,
  from: Date,
  { succeeded = true, slug = 'web_search' }: { succeeded?: boolean; slug?: string } = {}
): MessageRow[] {
  return Array.from({ length: n }, (_, i) => ({
    userId,
    agentSlug: 'synth-tutor',
    role: 'tool' as const,
    capabilitySlug: slug,
    succeeded,
    createdAt: new Date(from.getTime() + i * 60_000),
  }));
}

/**
 * The arguments the model might send `design_sound` for "a dark, round bass" on Model D: three steps, a context line,
 * a tweak and a riff, every id and value legal. For the tutor panel's tests, which take the tool's real result.
 */
export function darkBassDesign() {
  return {
    name: 'Dark round bass',
    blurb: 'A low, rounded bass with a soft pluck.',
    level: 1,
    category: 'bass',
    how: 'Two oscillators an octave apart into a mostly closed filter, with a short contour for the pluck.',
    steps: [
      {
        title: 'Two oscillators an octave apart',
        module: 'osc',
        why: 'Stacking an octave gives the bass weight.\n- Osc 2 range 16: an octave below osc 1.',
        set: { 'osc2.range': '16', 'mix.osc2On': true, 'mix.osc2': 7 },
      },
      {
        title: 'Close the filter',
        module: 'filter',
        why: 'A low cutoff takes the edge off.\n- CUTOFF -2: dark and round.',
        set: { 'filter.cutoff': -2, 'filter.contour': 4 },
      },
      {
        title: 'Pluck the loudness',
        module: 'env',
        why: 'A short decay makes each note pluck.\n- DECAY 3: a short tail.',
        set: { 'aenv.decay': 3, 'aenv.sustain': 6 },
      },
    ],
    context: { 'filter.cutoff': 'Keeps the bass dark; turn it up to brighten it.' },
    tweaks: [
      { id: 'filter.emphasis', try: 'Turn EMPHASIS to 5', hear: 'A vocal peak on each note' },
    ],
    phrase: {
      bpm: 96,
      steps: [
        [0, 36, 0.5],
        [1, 36, 0.5],
        [2, 43, 0.5],
        [3, 41, 1],
      ],
    },
  };
}
