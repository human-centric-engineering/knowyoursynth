/**
 * `app-knowyoursynth/003-tutor-tools`: one capability row per tutor tool, written from the tool's class, then the
 * install org reconciled so the tutor is bound on the same seed.
 *
 * Runs the seed against a recording client and checks the write itself, not the source text: the row each upsert
 * writes, in both branches, matches the class it came from.
 *
 * @see prisma/seeds/app-knowyoursynth/003-tutor-tools.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReconcile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/agents/reconcile-platform-agents', () => ({
  reconcilePlatformAgents: mockReconcile,
}));

import seed, { TUTOR_TOOL_ROWS } from '@/prisma/seeds/app-knowyoursynth/003-tutor-tools';
import { TUTOR_TOOLS } from '@/lib/app/tutor/tools';
import type { SeedContext } from '@/prisma/runner';

interface UpsertArgs {
  where: { slug: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
}

function seedContext() {
  const order: string[] = [];
  const upsert = vi.fn((args: UpsertArgs) => {
    order.push(`upsert:${args.where.slug}`);
    return Promise.resolve({ id: `cap-${args.where.slug}` });
  });
  mockReconcile.mockImplementation((orgId: string) => {
    order.push(`reconcile:${orgId}`);
    return Promise.resolve({
      created: [],
      updated: [],
      missing: { capabilities: [], knowledgeTags: [] },
    });
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const prisma = { aiCapability: { upsert } };
  const ctx = { prisma, logger } as unknown as SeedContext;
  return { ctx, upsert, logger, order, prisma };
}

beforeEach(() => mockReconcile.mockReset());

describe('003-tutor-tools', () => {
  it('writes one row per tutor tool', async () => {
    const { ctx, upsert } = seedContext();
    await seed.run(ctx);
    expect(upsert.mock.calls.map(([a]) => a.where.slug)).toEqual(TUTOR_TOOLS.map((t) => t.slug));
  });

  it.each(TUTOR_TOOLS.map((t) => [t.slug, t] as const))(
    "seeds %s from its class: the row's function definition and handler are the class's",
    async (slug, tool) => {
      const { ctx, upsert } = seedContext();
      await seed.run(ctx);
      const args = upsert.mock.calls.map(([a]) => a).find((a) => a.where.slug === slug);
      for (const branch of [args?.update, args?.create]) {
        expect(branch?.functionDefinition).toEqual(tool.functionDefinition);
        expect(branch?.executionHandler).toBe(tool.constructor.name);
        expect(branch?.executionType).toBe('internal');
        expect(branch?.isSystem).toBe(true);
      }
      expect(TUTOR_TOOL_ROWS[slug]?.executionHandler).toBe(tool.constructor.name);
    }
  );

  it('sets no per-tool rate limit: the dispatcher counts it per agent, and one tutor serves everyone', async () => {
    const { ctx, upsert } = seedContext();
    await seed.run(ctx);
    for (const [{ create }] of upsert.mock.calls) expect(create).not.toHaveProperty('rateLimit');
  });

  it("re-applies only the code-owned fields on update, leaving the admin's alone", async () => {
    const { ctx, upsert } = seedContext();
    await seed.run(ctx);
    for (const [{ update }] of upsert.mock.calls)
      expect(Object.keys(update).sort()).toEqual(
        ['executionHandler', 'executionType', 'functionDefinition', 'isSystem'].sort()
      );
  });

  it("reconciles the install org after the rows exist, through the seed's own client", async () => {
    const { ctx, order, prisma } = seedContext();
    await seed.run(ctx);
    expect(order).toEqual([...TUTOR_TOOLS.map((t) => `upsert:${t.slug}`), 'reconcile:install']);
    expect(mockReconcile).toHaveBeenCalledWith('install', expect.objectContaining({ db: prisma }));
  });

  it('logs a failed reconcile and finishes, for the maintenance job to retry', async () => {
    const { ctx, logger } = seedContext();
    mockReconcile.mockRejectedValueOnce(new Error('database went away'));
    await expect(seed.run(ctx)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('not reconciled'),
      expect.objectContaining({ error: 'database went away' })
    );
  });

  it('logs a reconcile that fails with something other than an Error', async () => {
    const { ctx, logger } = seedContext();
    mockReconcile.mockRejectedValueOnce('connection reset');
    await seed.run(ctx);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('not reconciled'),
      expect.objectContaining({ error: 'connection reset' })
    );
  });

  it('stops on a tool with no admin row, before writing it', async () => {
    const { ctx, upsert } = seedContext();
    const row = TUTOR_TOOL_ROWS.design_sound;
    delete TUTOR_TOOL_ROWS.design_sound;
    try {
      await expect(seed.run(ctx)).rejects.toThrow('no row for the tutor tool design_sound');
      expect(upsert.mock.calls.map(([a]) => a.where.slug)).not.toContain('design_sound');
      expect(mockReconcile).not.toHaveBeenCalled();
    } finally {
      TUTOR_TOOL_ROWS.design_sound = row;
    }
  });

  it('re-runs when the tutor folder changes', () => {
    expect(seed.hashInputs).toEqual(
      expect.arrayContaining([
        '../../../lib/app/tutor/agent.ts',
        '../../../lib/app/tutor/tools.ts',
        '../../../lib/app/tutor/propose-panel-change.ts',
        // design_sound's definition carries the contract's category and module lists.
        '../../../lib/app/synths/contract.ts',
      ])
    );
  });
});
