/**
 * Tutor smoke script (`lib/app/tutor`, `f-tutor` t-53)
 *
 * Runs real tutor turns through `streamChat()` against the dev database and the provider configured there. Unlike the
 * other smoke scripts it does not stub the LLM, on purpose: what it proves is that the tutor, its tools and its synth
 * context work with a real model, and that each turn logs a cost above zero. That last check is also the one for
 * Sunrise 0.14's fix to #813 (the agent resolver loads the model registry, so a turn is priced without BeatBuddy's
 * `hydrateFromDb()` workaround).
 *
 * Needs: `npm run db:seed` (the tool rows, and the tutor bound to them), an active provider whose API key is in
 * `.env.local`, and a default chat model or a model set on the tutor (the setup wizard does both).
 *
 * Flow:
 *   1. Find the tutor in the install org with its four tools bound, and a user to run as.
 *   2. Delete any conversations a previous run left behind (tagged `smoke-test-tutor`).
 *   3. Turn 1: "Make this sound darker" on Model D, from a bright panel. Turn 2: one change on the DeepMind.
 *   4. Each turn must end with a successful `propose_panel_change` whose change, applied to the panel it was made
 *      against, passes `validateSound`, and its conversation must have logged a cost above zero.
 *   5. Delete the conversations it made. Their cost rows stay: they are real spend.
 *
 * Safety: writes two conversations and their messages, deleted at the end, and the cost rows. Spends real money: two
 * turns, a few cents.
 *
 * Run with: npm run smoke:tutor
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { TUTOR_AGENT_SLUG, TUTOR_TOOL_SLUGS } from '@/lib/app/tutor/agent';
import { TUTOR_CONTEXT_TYPE } from '@/lib/app/tutor/context';
import type { TutorEntityContext } from '@/lib/app/tutor/panel';
import { getSynthDef } from '@/lib/app/synths/defs';
import { CablePairSchema, validateSound } from '@/lib/app/synths/validate';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import { streamChat } from '@/lib/orchestration/chat';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import type { ChatEvent } from '@/types/orchestration';

const SMOKE_TAG = 'smoke-test-tutor';

/** A successful proposal, as the tool returns it inside a `capability_result` event. */
const ProposalResultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    set: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
    addCables: z.array(CablePairSchema),
    removeCables: z.array(CablePairSchema),
  }),
});

interface Turn {
  label: string;
  synthId: string;
  message: string;
  values: ControlValues;
  cables: CablePair[];
}

const TURNS: Turn[] = [
  {
    label: 'Model D: make this sound darker',
    synthId: 'model-d',
    message: 'Make this sound darker',
    // A bright start: the filter open, some emphasis, a second oscillator in.
    values: { 'filter.cutoff': 3.5, 'filter.emphasis': 3, 'mix.osc2On': true, 'mix.osc2': 6 },
    cables: [],
  },
  {
    label: 'DeepMind 12: one change',
    synthId: 'deepmind-12d',
    message: 'Make this sound brighter',
    values: {},
    cables: [],
  },
];

/** Stops the run with a reason. Thrown, not `process.exit`, so the conversations made so far are still removed. */
function fail(reason: string): never {
  throw new Error(reason);
}

/** The tool calls in a turn's events, flattening the batched form. */
function toolResults(events: ChatEvent[]): { slug: string; result: unknown }[] {
  return events.flatMap((e) =>
    e.type === 'capability_result'
      ? [{ slug: e.capabilitySlug, result: e.result }]
      : e.type === 'capability_results'
        ? e.results.map((r) => ({ slug: r.capabilitySlug, result: r.result }))
        : []
  );
}

/** One turn. Its conversation goes into `made` as soon as it exists, so a turn that fails is still cleaned up. */
async function runTurn(turn: Turn, userId: string, made: string[]): Promise<{ costUsd: number }> {
  console.log(`\n════ ${turn.label} ════`);
  const def = getSynthDef(turn.synthId) ?? fail(`no synth ${turn.synthId}`);
  const entityContext: TutorEntityContext = {
    synthId: def.id,
    version: def.version,
    panel: { values: turn.values, cables: turn.cables },
  };

  const events: ChatEvent[] = [];
  let conversationId: string | null = null;
  let reply = '';
  for await (const event of streamChat({
    message: turn.message,
    agentSlug: TUTOR_AGENT_SLUG,
    userId,
    contextType: TUTOR_CONTEXT_TYPE,
    contextId: def.id,
    entityContext,
  })) {
    events.push(event);
    if (event.type === 'start') {
      conversationId = event.conversationId;
      made.push(conversationId);
    }
    if (event.type === 'content') reply += event.delta;
    if (event.type === 'error') console.log('  • error', JSON.stringify(event));
  }
  if (!conversationId) fail('the turn ended before it started a conversation');
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { tags: [SMOKE_TAG] },
  });

  const calls = toolResults(events);
  console.log(
    `  tools: ${calls.map((c) => `${c.slug}${isOk(c.result) ? '' : ' (refused)'}`).join(' → ') || 'none'}`
  );
  console.log(`  reply: ${reply.trim().replace(/\s+/g, ' ').slice(0, 400)}`);

  const proposals = calls
    .filter((c) => c.slug === 'propose_panel_change')
    .map((c) => ProposalResultSchema.safeParse(c.result))
    .flatMap((p) => (p.success ? [p.data.data] : []));
  const proposal = proposals.at(-1) ?? fail(`${turn.label}: no successful propose_panel_change`);
  console.log(`  proposal: ${JSON.stringify(proposal)}`);

  // Applied to the panel it was made against, the change must leave a panel the synth can hold.
  const removed = (c: CablePair) =>
    proposal.removeCables.some(([a, b]) => a === c[0] && b === c[1]);
  const after = {
    values: { ...def.init, ...turn.values, ...proposal.set },
    cables: [...turn.cables.filter((c) => !removed(c)), ...proposal.addCables],
  };
  const checked = validateSound(def, after);
  if (!checked.ok)
    fail(
      `${turn.label}: the applied proposal fails validation: ${JSON.stringify(checked.problems)}`
    );
  console.log('  ✓ the proposal passes validateSound on the panel it was made against');

  const done = events.find((e) => e.type === 'done');
  const logged = await settledCosts(conversationId);
  const costUsd = logged._sum.totalCostUsd ?? 0;
  const binding = done?.type === 'done' ? `${done.provider ?? '?'} / ${done.model ?? '?'}` : '?';
  console.log(`  model: ${binding}; ${logged._count} cost rows, logged $${costUsd.toFixed(6)}`);
  if (!(costUsd > 0)) fail(`${turn.label}: the turn logged no cost`);
  console.log('  ✓ the turn logged a cost above zero');
  return { costUsd };
}

/**
 * The conversation's cost rows, once they have stopped arriving. `streamChat` writes them without waiting
 * (`void logCost(...)`), so read until two reads 250ms apart agree and at least one row is there, for up to five
 * seconds: before the total is checked, and before the conversation they point at is deleted.
 */
async function settledCosts(conversationId: string) {
  const read = () =>
    prisma.aiCostLog.aggregate({
      where: { conversationId },
      _sum: { totalCostUsd: true },
      _count: true,
    });
  let last = await read();
  for (const deadline = Date.now() + 5000; Date.now() < deadline;) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await read();
    if (next._count > 0 && next._count === last._count) return next;
    last = next;
  }
  return last;
}

function isOk(result: unknown): boolean {
  return (
    typeof result === 'object' && result !== null && 'success' in result && result.success === true
  );
}

async function main(): Promise<void> {
  const tutor = await prisma.aiAgent.findFirst({
    where: { slug: TUTOR_AGENT_SLUG, isSystem: true },
    select: {
      id: true,
      provider: true,
      model: true,
      capabilities: {
        where: { isEnabled: true },
        select: { capability: { select: { slug: true } } },
      },
    },
  });
  if (!tutor) fail(`no ${TUTOR_AGENT_SLUG} agent in the install org: run npm run db:seed`);
  const bound = tutor.capabilities.map((c) => c.capability.slug).sort();
  if (JSON.stringify(bound) !== JSON.stringify([...TUTOR_TOOL_SLUGS].sort()))
    fail(`the tutor is bound to [${bound.join(', ')}], not its four tools: run npm run db:seed`);
  console.log(
    `[1] tutor ${tutor.id}, provider "${tutor.provider}", model "${tutor.model}", tools bound`
  );

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!user) fail('no user rows in the dev database');

  const stale = await prisma.aiConversation.findMany({
    where: { tags: { has: SMOKE_TAG } },
    select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map((c) => c.id);
    await prisma.aiMessage.deleteMany({ where: { conversationId: { in: ids } } });
    await prisma.aiConversation.deleteMany({ where: { id: { in: ids } } });
    console.log(`[2] removed ${ids.length} conversations left by a previous run`);
  }

  const made: string[] = [];
  try {
    for (const turn of TURNS) await runTurn(turn, user.id, made);
  } finally {
    if (made.length) {
      await prisma.aiMessage.deleteMany({ where: { conversationId: { in: made } } });
      await prisma.aiConversation.deleteMany({ where: { id: { in: made } } });
      console.log(
        `\n[5] removed the ${made.length} conversations this run made; their cost rows stay`
      );
    }
  }
  console.log('\n✓ tutor smoke passed');
}

runAsOrg(INSTALL_ORG_ID, main)
  .catch((err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
