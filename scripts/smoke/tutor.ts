/**
 * Tutor smoke script (`lib/app/tutor`, `f-tutor` t-53 and t-54)
 *
 * Runs real tutor turns through the app's stream route, `POST /api/v1/tutor/stream`, on a running server, against the
 * dev database and the provider configured there. Unlike the other smoke scripts it does not stub the LLM, on purpose:
 * what it proves is that the route, the tutor, its tools and its synth context work with a real model, that the SSE the
 * page will read carries a proposal that validates, and that each turn logs a cost above zero. That last check is also
 * the one for Sunrise 0.14's fix to #813 (the agent resolver loads the model registry, so a turn is priced without
 * BeatBuddy's `hydrateFromDb()` workaround).
 *
 * Over HTTP rather than in-process because the route reads the request's headers (`next/headers`), which exist only
 * inside a request.
 *
 * Needs: a server (`npm run dev`, or `SMOKE_BASE_URL` for another), `npm run db:seed` (the tool rows, and the tutor bound
 * to them), an active provider whose API key is in `.env.local`, and a default chat model or a model set on the tutor
 * (the setup wizard does both).
 *
 * Flow:
 *   1. Find the tutor in the install org with its four tools bound, and a user to run as. Mint that user a `chat` API
 *      key, which the route's `withAuth` accepts in place of a session.
 *   2. Delete any conversations a previous run left behind (tagged `smoke-test-tutor`), and its key.
 *   3. Read the allowance. Turn 1: "Make this sound darker" on Model D, from a bright panel. Turn 2: one change on the
 *      DeepMind. Each is a POST to the route, its SSE read to the end.
 *   4. Each turn must end with a successful `propose_panel_change` whose change, applied to the panel it was made
 *      against, passes `validateSound`, and its conversation must have logged a cost above zero. The allowance must
 *      then read two more turns used.
 *   5. Delete the conversations it made, which gives the turns back, and the key. Their cost rows stay: they are real
 *      spend.
 *
 * Safety: writes an API key, two conversations and their messages, all deleted at the end, and the cost rows. Spends
 * real money: two turns, a few cents.
 *
 * Run with: npm run dev (in another terminal), then npm run smoke:tutor
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { TUTOR_AGENT_SLUG, TUTOR_TOOL_SLUGS } from '@/lib/app/tutor/agent';
import { getSynthDef } from '@/lib/app/synths/defs';
import { CablePairSchema, validateSound } from '@/lib/app/synths/validate';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import { generateApiKey, hashApiKey, keyPrefix } from '@/lib/auth/api-keys';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
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

/** An SSE event as the route frames it: a `type`, and whatever else that type carries. */
const FrameSchema = z.object({ type: z.string() }).passthrough();
type Frame = z.infer<typeof FrameSchema>;

/** The event types this script reads, each checked before it is used. */
const StartSchema = z.object({ type: z.literal('start'), conversationId: z.string() });
const ContentSchema = z.object({ type: z.literal('content'), delta: z.string() });
const ToolResult = { capabilitySlug: z.string(), result: z.unknown() };
const ResultSchema = z.object({ type: z.literal('capability_result'), ...ToolResult });
const ResultsSchema = z.object({
  type: z.literal('capability_results'),
  results: z.array(z.object(ToolResult)),
});
const DoneSchema = z.object({
  type: z.literal('done'),
  provider: z.string().optional(),
  model: z.string().optional(),
});

/** The events of one type, checked against its schema. */
function pick<T>(events: Frame[], schema: z.ZodType<T>): T[] {
  return events.flatMap((e) => {
    const parsed = schema.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

const AllowanceSchema = z.object({
  success: z.literal(true),
  data: z.object({ limit: z.number(), used: z.number(), remaining: z.number() }),
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

/** Stops the run with a reason. Thrown, not `process.exit`, so what the run made is still removed. */
function fail(reason: string): never {
  throw new Error(reason);
}

/** The events in an SSE body, as `sseResponse` frames them: `event:` and `data:` lines, keepalive comments skipped. */
function parseSse(body: string): Frame[] {
  return body
    .split('\n\n')
    .map((frame) =>
      frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n')
    )
    .filter(Boolean)
    .map((data) => FrameSchema.parse(JSON.parse(data)));
}

/** The tool calls in a turn's events, flattening the batched form. */
function toolResults(events: Frame[]): { slug: string; result: unknown }[] {
  return events
    .flatMap((e) => [
      ...pick([e], ResultSchema),
      ...pick([e], ResultsSchema).flatMap((batch) => batch.results),
    ])
    .map((r) => ({ slug: r.capabilitySlug, result: r.result }));
}

async function readAllowance(key: string) {
  const res = await fetch(`${BASE_URL}/api/v1/tutor/allowance`, {
    headers: { authorization: `Bearer ${key}`, origin: BASE_URL },
  });
  if (!res.ok) fail(`GET /api/v1/tutor/allowance answered ${res.status}: ${await res.text()}`);
  return AllowanceSchema.parse(await res.json()).data;
}

/**
 * One turn. Its conversation goes into `made`, and is tagged, once the stream has been read: a turn that fails after
 * that is still cleaned up. One whose stream cannot be read at all (the server stopped mid-turn) leaves its
 * conversation behind, untagged and titled with the turn's message; remove it with
 * `DELETE /api/v1/admin/orchestration/conversations/:id`, which has no button.
 */
async function runTurn(turn: Turn, key: string, made: string[]): Promise<void> {
  console.log(`\n════ ${turn.label} ════`);
  const def = getSynthDef(turn.synthId) ?? fail(`no synth ${turn.synthId}`);

  const res = await fetch(`${BASE_URL}/api/v1/tutor/stream`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      origin: BASE_URL,
    },
    body: JSON.stringify({
      synthId: def.id,
      panel: { values: turn.values, cables: turn.cables },
      message: turn.message,
    }),
  });
  if (!res.ok) fail(`${turn.label}: the route answered ${res.status}: ${await res.text()}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('text/event-stream')) fail(`${turn.label}: the route answered ${type}`);
  const events = parseSse(await res.text());
  console.log(`  ✓ the route streamed ${events.length} SSE events`);

  // Before the start is looked for: a turn refused before it starts a conversation says why only here.
  for (const e of events) if (e.type === 'error') console.log('  • error', JSON.stringify(e));

  const start = pick(events, StartSchema)[0];
  if (!start) fail('the turn ended before it started a conversation');
  const conversationId = start.conversationId;
  made.push(conversationId);
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { tags: [SMOKE_TAG] },
  });

  const calls = toolResults(events);
  console.log(
    `  tools: ${calls.map((c) => `${c.slug}${isOk(c.result) ? '' : ' (refused)'}`).join(' → ') || 'none'}`
  );
  const reply = pick(events, ContentSchema)
    .map((e) => e.delta)
    .join('');
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

  const done = pick(events, DoneSchema)[0];
  const binding = done ? `${done.provider ?? '?'} / ${done.model ?? '?'}` : '?';
  const logged = await settledCosts(conversationId);
  const costUsd = logged._sum.totalCostUsd ?? 0;
  console.log(`  model: ${binding}; ${logged._count} cost rows, logged $${costUsd.toFixed(6)}`);
  if (!(costUsd > 0)) fail(`${turn.label}: the turn logged no cost`);
  console.log('  ✓ the turn logged a cost above zero');
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

/** Remove what a previous run left behind: its conversations and its key. `finally` cannot cover a SIGINT. */
async function sweep(): Promise<void> {
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
  await prisma.aiApiKey.deleteMany({ where: { name: SMOKE_TAG } });
}

async function main(): Promise<void> {
  const reachable = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!reachable) fail(`no server at ${BASE_URL}: start one first (npm run dev)`);

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

  await sweep();
  const key = generateApiKey();
  await prisma.aiApiKey.create({
    data: {
      userId: user.id,
      name: SMOKE_TAG,
      keyHash: hashApiKey(key),
      keyPrefix: keyPrefix(key),
      scopes: ['chat'],
    },
  });

  const made: string[] = [];
  try {
    const before = await readAllowance(key);
    console.log(`[3] allowance: ${before.used} of ${before.limit} used today`);
    if (before.remaining < TURNS.length)
      fail(`the user has ${before.remaining} turns left today, and the run needs ${TURNS.length}`);

    for (const turn of TURNS) await runTurn(turn, key, made);

    const after = await readAllowance(key);
    if (after.used !== before.used + TURNS.length)
      fail(`the allowance reads ${after.used} used, not ${before.used + TURNS.length}`);
    console.log(`\n[4] ✓ the allowance reads ${after.used} used: ${TURNS.length} more`);
  } finally {
    if (made.length) {
      await prisma.aiMessage.deleteMany({ where: { conversationId: { in: made } } });
      await prisma.aiConversation.deleteMany({ where: { id: { in: made } } });
    }
    await prisma.aiApiKey.deleteMany({ where: { name: SMOKE_TAG } });
    console.log(
      `\n[5] removed the ${made.length} conversations this run made, and its key; their cost rows stay`
    );
  }
  console.log('\n✓ tutor smoke passed');
}

runAsOrg(INSTALL_ORG_ID, main)
  .catch((err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
