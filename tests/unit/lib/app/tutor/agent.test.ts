/**
 * The tutor as a platform agent: registered through the real `lib/app/platform-agents.ts`, for the install org only,
 * `internal`, with no provider or model, and the starting spend caps in `defaults`. Then the reconcile itself: run
 * against a small in-memory stand-in for the delegates it writes, it creates the tutor in the install org with those
 * values and its four tools bound, and creates nothing in another org.
 *
 * The registry is the real one, narrowed to the tutor so the stand-in does not have to hold Sunrise's sixteen agents
 * (`reconcile-platform-agents.test.ts` covers the reconcile's own properties).
 *
 * @see lib/app/tutor/agent.ts · lib/app/platform-agents.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/orchestration/capabilities/dispatcher', () => ({
  capabilityDispatcher: { clearCache: vi.fn() },
}));
vi.mock('@/lib/orchestration/knowledge/resolveAgentDocumentAccess', () => ({
  invalidateAgentAccess: vi.fn(),
}));
vi.mock('@/lib/orchestration/agents/platform-agents', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/orchestration/agents/platform-agents')>();
  return {
    ...actual,
    // The real registry and audience rule, narrowed to the tutor.
    platformAgentsForOrg: (orgId: string) =>
      actual.platformAgentsForOrg(orgId).filter((d) => d.slug === 'synth-tutor'),
  };
});

const fake = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const state = {
    seq: 0,
    orgOf: () => 'NO-CONTEXT' as string,
    orgs: new Map<string, { id: string; settings: unknown }>(),
    agents: [] as Row[],
    bindings: [] as Row[],
    versions: [] as Row[],
    capabilities: [] as { id: string; slug: string }[],
  };
  const id = (p: string) => `${p}-${++state.seq}`;
  const db = {
    user: { findFirst: () => Promise.resolve({ id: 'service-account' }) },
    org: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(state.orgs.get(where.id) ?? null),
      update: ({ where, data }: { where: { id: string }; data: { settings: unknown } }) => {
        const org = state.orgs.get(where.id);
        if (org) org.settings = data.settings;
        return Promise.resolve(org);
      },
    },
    aiAgent: {
      findMany: ({ where }: { where: { orgId: string; slug: { in: string[] } } }) =>
        Promise.resolve(
          state.agents
            .filter((a) => a.orgId === where.orgId && where.slug.in.includes(a.slug as string))
            .map((a) => ({ ...a, capabilities: [], grantedTags: [], grantedDocuments: [] }))
        ),
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          monthlyBudgetUsd: null,
          maxCostPerTurnUsd: null,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v === Prisma.JsonNull ? null : v])
          ),
          id: id('agent'),
          orgId: state.orgOf(),
        };
        state.agents.push(row);
        return Promise.resolve(row);
      },
    },
    aiCapability: {
      findMany: ({ where }: { where: { slug: { in: string[] } } }) =>
        Promise.resolve(state.capabilities.filter((c) => where.slug.in.includes(c.slug))),
    },
    knowledgeTag: { findMany: () => Promise.resolve([]) },
    aiAgentCapability: {
      createMany: ({ data }: { data: Record<string, unknown>[] }) => {
        for (const d of data) state.bindings.push({ ...d, id: id('binding') });
        return Promise.resolve({ count: data.length });
      },
    },
    aiAgentKnowledgeTag: { createMany: () => Promise.resolve({ count: 0 }) },
    aiAgentVersion: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: id('version') };
        state.versions.push(row);
        return Promise.resolve(row);
      },
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { state, db };
});
vi.mock('@/lib/db/client', () => ({ prisma: fake.db }));

import { TUTOR_AGENT, TUTOR_AGENT_SLUG, TUTOR_TOOL_SLUGS } from '@/lib/app/tutor/agent';
import {
  PLATFORM_AGENT_BASELINE,
  __resetPlatformAgentsForTests,
  getPlatformAgent,
  listPlatformAgents,
} from '@/lib/orchestration/agents/platform-agents';
import { reconcilePlatformAgents } from '@/lib/orchestration/agents/reconcile-platform-agents';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { getTenantContext } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const ORG_B = 'cmorg00000000000000000orgb';
const db = fake.db as unknown as TenancyClient;

beforeEach(() => {
  mockEnv.TENANCY_MODE = 'single';
  __resetPlatformAgentsForTests();
  const s = fake.state;
  s.seq = 0;
  s.orgOf = () => getTenantContext()?.orgId ?? 'NO-CONTEXT';
  s.orgs = new Map([
    [INSTALL_ORG_ID, { id: INSTALL_ORG_ID, settings: null }],
    [ORG_B, { id: ORG_B, settings: null }],
  ]);
  s.agents = [];
  s.bindings = [];
  s.versions = [];
  s.capabilities = TUTOR_TOOL_SLUGS.map((slug) => ({ id: `cap-${slug}`, slug }));
});

describe('the tutor definition', () => {
  it('is registered by lib/app/platform-agents.ts, alongside the core agents', () => {
    expect(getPlatformAgent(TUTOR_AGENT_SLUG)).toBe(TUTOR_AGENT);
    expect(listPlatformAgents().filter((d) => d.slug === TUTOR_AGENT_SLUG)).toHaveLength(1);
  });

  it('is for the install org only', () => {
    expect(TUTOR_AGENT.audience).toBe('install-only');
  });

  it('leaves visibility to the baseline, which is internal', () => {
    expect(TUTOR_AGENT.agent).not.toHaveProperty('visibility');
    expect(PLATFORM_AGENT_BASELINE.visibility).toBe('internal');
  });

  it('sets no provider or model, and does not pin one', () => {
    expect(TUTOR_AGENT.defaults).not.toHaveProperty('provider');
    expect(TUTOR_AGENT.defaults).not.toHaveProperty('model');
    expect(TUTOR_AGENT.defaultBinding).toBeUndefined();
  });

  it('starts with a per-turn cap and a monthly budget', () => {
    expect(TUTOR_AGENT.defaults).toEqual({ maxCostPerTurnUsd: 0.2, monthlyBudgetUsd: 50 });
  });
});

describe('reconciling the tutor', () => {
  it('creates it in the install org: internal, no provider or model, the starting caps, its tools bound', async () => {
    const result = await reconcilePlatformAgents(INSTALL_ORG_ID, { db });

    expect(result.created).toEqual([TUTOR_AGENT_SLUG]);
    expect(result.missing.capabilities).toEqual([]);
    const row = fake.state.agents.find((a) => a.slug === TUTOR_AGENT_SLUG);
    expect(row).toMatchObject({
      orgId: INSTALL_ORG_ID,
      isSystem: true,
      name: 'Synth Tutor',
      visibility: 'internal',
      provider: '',
      model: '',
      maxCostPerTurnUsd: 0.2,
      monthlyBudgetUsd: 50,
    });
    expect(
      fake.state.bindings.filter((b) => b.agentId === row?.id).map((b) => b.capabilityId)
    ).toEqual(TUTOR_TOOL_SLUGS.map((slug) => `cap-${slug}`));
  });

  it('creates it unbound, and says which tools have no row, before their seed has run', async () => {
    fake.state.capabilities = [];
    const result = await reconcilePlatformAgents(INSTALL_ORG_ID, { db });
    expect(result.created).toEqual([TUTOR_AGENT_SLUG]);
    expect(result.missing.capabilities).toEqual([...TUTOR_TOOL_SLUGS]);
    expect(fake.state.bindings).toEqual([]);
  });

  it('does not create it in another org', async () => {
    mockEnv.TENANCY_MODE = 'multi';
    const result = await reconcilePlatformAgents(ORG_B, { db });
    expect(result.created).toEqual([]);
    expect(fake.state.agents).toEqual([]);
  });
});
