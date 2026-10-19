/**
 * The seam Know Your Synth carries in Sunrise's eval worker (`f-tutor-knowledge` t-61): each tool call's `success`,
 * `errorCode` and `resultPreview` reach the graders, and the stored case metadata keeps only the slug and args it
 * always had (`.context/app/divergences.md`).
 *
 * Drives the real worker with a tutor turn whose `search_databank` trace preview is the tool's own
 * `redactProvenance` output, and grades it with the real tutor grader, so the test fails if the worker drops the
 * preview again, or if the tool and the grader stop agreeing on its shape.
 *
 * @see lib/orchestration/evaluations/run-worker.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiDatasetCase: { findMany: vi.fn() },
    aiEvaluationCaseResult: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    aiAgent: { findUnique: vi.fn() },
    aiEvaluationRun: { update: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/orchestration/evaluations/run-claim', () => ({
  claimNextRun: vi.fn(),
  markTerminal: vi.fn(),
  releaseLease: vi.fn(),
}));
vi.mock('@/lib/orchestration/evaluations/datasets/hash', () => ({ hashDatasetCases: vi.fn() }));
vi.mock('@/lib/orchestration/evaluations/run-cases/agent-case', () => ({ runAgentCase: vi.fn() }));
vi.mock('@/lib/orchestration/evaluations/run-cases/workflow-case', () => ({
  runWorkflowCase: vi.fn(),
}));
vi.mock('@/lib/orchestration/evaluations/graders', () => ({ getGrader: vi.fn() }));
vi.mock('@/lib/orchestration/llm/cost-tracker', () => ({ logCost: vi.fn() }));

const { prisma } = await import('@/lib/db/client');
const { claimNextRun, markTerminal } = await import('@/lib/orchestration/evaluations/run-claim');
const { hashDatasetCases } = await import('@/lib/orchestration/evaluations/datasets/hash');
const { runAgentCase } = await import('@/lib/orchestration/evaluations/run-cases/agent-case');
const { getGrader } = await import('@/lib/orchestration/evaluations/graders');
const { logCost } = await import('@/lib/orchestration/llm/cost-tracker');
const { processPendingEvaluationRuns } = await import('@/lib/orchestration/evaluations/run-worker');
const { TUTOR_GRADERS } = await import('@/lib/app/tutor/evals/graders');
const { SearchDatabankCapability } = await import('@/lib/app/tutor/search-databank');

const createResult = vi.mocked(prisma.aiEvaluationCaseResult.create);

const ROW = {
  kind: 'makers',
  id: 'tadao-kikumoto',
  name: 'Tadao Kikumoto',
  line: 'Japanese engineer',
  excerpt: '…',
  href: '/bank/makers/tadao-kikumoto',
  links: [],
  matchedBy: ['lexical'],
};

function databankTrace() {
  const tool = new SearchDatabankCapability();
  const args = { query: 'TB-303 designer' };
  const result = { success: true, data: { results: [ROW], search: 'lexical' } };
  const { resultPreview } = tool.redactProvenance(args, result as never);
  return { slug: 'search_databank', arguments: args, latencyMs: 3, success: true, resultPreview };
}

function runWith(toolCalls: unknown[]) {
  vi.mocked(claimNextRun).mockResolvedValueOnce({
    id: 'run-1',
    userId: 'user-1',
    name: 'Tutor',
    subjectKind: 'agent',
    agentId: 'agent-1',
    workflowId: null,
    datasetId: 'kys-tutor-evals',
    datasetContentHash: 'HASH',
    metricConfigs: [{ slug: 'tutor_databank_found', config: {} }],
    judgeProvider: null,
    judgeModel: null,
    subjectOutputSelector: null,
    progress: null,
    parentRunId: null,
    status: 'running',
    startedAt: new Date(),
  });
  vi.mocked(prisma.aiDatasetCase.findMany).mockResolvedValueOnce([
    {
      id: 'case-0',
      datasetId: 'kys-tutor-evals',
      position: 0,
      input: 'Who designed the Roland TB-303?',
      expectedOutput: JSON.stringify({ kind: 'databank', rows: ['/bank/makers/tadao-kikumoto'] }),
      referenceCitations: null,
      metadata: { category: 'databank' },
    },
  ] as never);
  vi.mocked(runAgentCase).mockResolvedValueOnce({
    assistantText: 'Tadao Kikumoto designed it.',
    citations: [],
    toolCalls,
    tokenUsage: { input: 1, output: 1 },
    costUsd: 0,
    latencyMs: 5,
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hashDatasetCases).mockReturnValue('HASH');
  vi.mocked(prisma.aiEvaluationCaseResult.count).mockResolvedValue(0);
  vi.mocked(prisma.aiEvaluationCaseResult.findMany).mockResolvedValue([]);
  vi.mocked(prisma.aiEvaluationRun.update).mockResolvedValue({} as never);
  vi.mocked(prisma.aiEvaluationRun.findUnique).mockResolvedValue({ status: 'running' } as never);
  vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({ slug: 'synth-tutor' } as never);
  vi.mocked(markTerminal).mockResolvedValue(true);
  vi.mocked(logCost).mockResolvedValue({ id: 'cost-1' } as never);
  createResult.mockResolvedValue({} as never);
  const grader = TUTOR_GRADERS.find((g) => g.slug === 'tutor_databank_found');
  vi.mocked(getGrader).mockReturnValue(grader as never);
});

describe('the eval worker hands graders what each tool call returned', () => {
  it('a databank row the search found passes the real tutor grader', async () => {
    runWith([databankTrace()]);
    await processPendingEvaluationRuns();
    const row = createResult.mock.calls[0]?.[0].data;
    expect(row?.metricScores).toMatchObject({
      tutor_databank_found: { score: 1, passed: true },
    });
  });

  it('a refused search reaches the grader as refused, with its code', async () => {
    runWith([
      {
        slug: 'search_databank',
        arguments: { query: 'x' },
        latencyMs: 1,
        success: false,
        errorCode: 'invalid_args',
        resultPreview: JSON.stringify({ success: true, links: ['/bank/makers/tadao-kikumoto'] }),
      },
    ]);
    await processPendingEvaluationRuns();
    // The preview names the row, but the call refused: only `success` tells the grader not to trust it.
    expect(createResult.mock.calls[0]?.[0].data.metricScores).toMatchObject({
      tutor_databank_found: { score: 0, passed: false },
    });
  });

  it('stores the tool calls as before: slug and args only', async () => {
    runWith([databankTrace()]);
    await processPendingEvaluationRuns();
    const metadata = createResult.mock.calls[0]?.[0].data.subjectMetadata as {
      toolCalls: unknown[];
    };
    expect(metadata.toolCalls).toEqual([
      { slug: 'search_databank', args: { query: 'TB-303 designer' } },
    ]);
  });
});
