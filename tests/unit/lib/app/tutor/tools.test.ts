/**
 * Rules every tutor tool keeps, checked across the registered set so a new tool is held to them without anyone
 * remembering to add a test: no tool takes a user from its arguments or reads one from the context, and the set the
 * dispatcher registers is the set the agent is bound to. One exception, named below: `web_search` reads the caller's
 * daily allowance, because each search counts against it; `web-search.test.ts` holds it to that and no more.
 *
 * FORK NOTE — this reads the real `lib/app/capabilities.ts` on purpose: a mock would hold the rules to a list of its own
 * and let a new tool slip past them. Adding or removing a tutor tool in that seam fails "are the six in the plan"
 * until the expected slugs here are updated; the rules then cover the new tool without another test.
 *
 * @see lib/app/tutor/tools.ts · lib/app/capabilities.ts
 */
import { describe, expect, it, vi } from 'vitest';

const mockRegister = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/capabilities/registry', () => ({
  registerAppCapability: mockRegister,
}));
// `search_databank` reads the databank: the seed's own rows, in memory (`tests/helpers/bank-db.ts`).
vi.mock('@/lib/db/client', async () => {
  const { bankDb } = await import('@/tests/helpers/bank-db');
  return { prisma: bankDb() };
});

import { initAppCapabilities } from '@/lib/app/capabilities';
import { TUTOR_TOOL_SLUGS } from '@/lib/app/tutor/agent';
import { TUTOR_TOOLS } from '@/lib/app/tutor/tools';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { panelContext, synth } from '@/tests/helpers/tutor';

const OWNER_WORDS = /user|owner|account|author|email/i;
const modelD = synth('model-d');

/** Arguments each tool accepts, so its result can be compared across two callers. */
const GOOD_ARGS: Record<string, unknown> = {
  get_panel: {},
  describe_synth: { section: 'filter' },
  propose_panel_change: { set: { 'filter.cutoff': -1 } },
  design_sound: {
    name: 'Test',
    blurb: 'A test.',
    level: 1,
    category: 'bass',
    how: 'One oscillator.',
    steps: [{ title: 'Close it', module: 'filter', why: 'Darker.', set: { 'filter.cutoff': -2 } }],
    phrase: { bpm: 100, steps: [[0, 48, 1]] },
  },
  search_databank: { query: 'Vangelis' },
  web_search: { query: 'Vangelis Blade Runner' },
};

/** Tools whose answer depends on who is asking, each with the reason and the test that holds it there. */
const READS_THE_CALLER = new Set([
  // Counts each search against the caller's daily allowance (D12): web-search.test.ts.
  'web_search',
]);

// Widened to the base class: each tool's own argument type is checked by its own test.
const tools = TUTOR_TOOLS.map((t): readonly [string, BaseCapability] => [t.slug, t]);

describe('the tutor tools', () => {
  it('are the six in the plan, and the ones the agent is bound to', () => {
    expect(TUTOR_TOOLS.map((t) => t.slug)).toEqual([...TUTOR_TOOL_SLUGS]);
    expect([...TUTOR_TOOL_SLUGS].sort()).toEqual(
      [
        'describe_synth',
        'design_sound',
        'get_panel',
        'propose_panel_change',
        'search_databank',
        'web_search',
      ].sort()
    );
  });

  it('are what lib/app/capabilities.ts registers with the dispatcher', () => {
    mockRegister.mockClear();
    initAppCapabilities();
    expect(mockRegister.mock.calls.map(([tool]) => tool)).toEqual([...TUTOR_TOOLS]);
  });

  it.each(tools)('%s advertises no parameter that could name a user', (_slug, tool) => {
    const { properties } = tool.functionDefinition.parameters as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(properties ?? {}).filter((p) => OWNER_WORDS.test(p))).toEqual([]);
  });

  it.each(tools)(
    '%s tells the model it takes no other arguments, as its schema refuses them',
    (_slug, tool) => {
      expect(tool.functionDefinition.parameters).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
  );

  it.each(tools)('%s refuses a userId slipped into its arguments', (slug, tool) => {
    expect(() => tool.validate({ userId: 'user-2' })).toThrow();
    const args = GOOD_ARGS[slug];
    expect(() => tool.validate(args)).not.toThrow();
    expect(() => tool.validate({ ...(args as object), userId: 'user-2' })).toThrow();
  });

  it('reads the caller in only the tools named as doing so', () => {
    expect([...READS_THE_CALLER].every((slug) => tools.some(([s]) => s === slug))).toBe(true);
  });

  it.each(tools.filter(([slug]) => !READS_THE_CALLER.has(slug)))(
    '%s answers the same whoever the caller is',
    async (slug, tool) => {
      const panel = { values: { 'filter.cutoff': 2 } };
      const args = tool.validate(GOOD_ARGS[slug]);
      const asOne = await tool.execute(args, panelContext(modelD, panel, { userId: 'user-1' }));
      const asOther = await tool.execute(args, panelContext(modelD, panel, { userId: 'user-2' }));
      const asNobody = await tool.execute(args, panelContext(modelD, panel, { userId: null }));
      expect(asOne.success).toBe(true);
      // design_sound mints a random id per sound; everything else must match exactly.
      const strip = (r: typeof asOne) =>
        JSON.parse(JSON.stringify(r).replace(/"tutor-[a-z0-9]+"/g, '"tutor-id"')) as unknown;
      expect(strip(asOther)).toEqual(strip(asOne));
      expect(strip(asNobody)).toEqual(strip(asOne));
    }
  );

  it.each(tools)(
    '%s handles no PII, so its arguments may be kept on the audit row as they are',
    (_slug, tool) => {
      expect(tool.processesPii).toBe(false);
      expect(tool.writesSharedSettings).toBe(false);
    }
  );
});
