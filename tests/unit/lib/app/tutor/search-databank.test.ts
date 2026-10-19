/**
 * `search_databank`, the tutor's way into the databank (`lib/app/tutor/search-databank.ts`, `f-tutor-knowledge` t-57).
 *
 * Over the seed's own rows (`tests/helpers/bank-db.ts`). The ranking itself is `tests/unit/lib/app/bank/search.test.ts`'s;
 * this holds the tool to its arguments, its result size and what it says when nothing matches.
 */
import { describe, expect, it, vi } from 'vitest';
import { SearchDatabankCapability } from '@/lib/app/tutor/search-databank';
import { panelContext, synth } from '@/tests/helpers/tutor';

vi.mock('@/lib/db/client', async () => {
  const { bankDb } = await import('@/tests/helpers/bank-db');
  return { prisma: bankDb() };
});

const tool = new SearchDatabankCapability();
const context = panelContext(synth('model-d'), { values: {} });
const run = (args: unknown) => tool.execute(tool.validate(args), context);

describe('search_databank', () => {
  it('finds a person by name, first, with their page', async () => {
    const result = await run({ query: 'Vangelis' });
    expect(result.success).toBe(true);
    expect(result.data?.results[0]).toMatchObject({
      id: 'vangelis',
      href: '/bank/artists/vangelis',
    });
    expect(result.data?.note).toBeUndefined();
  });

  it('returns at most six rows, so a search stays small in the tool loop', async () => {
    const result = await run({ query: 'Roland' });
    expect(result.data?.results).toHaveLength(6);
  });

  it('narrows to a kind', async () => {
    const result = await run({ query: 'Vangelis', kind: 'songs' });
    expect(result.data?.results.length).toBeGreaterThan(0);
    expect(result.data?.results.every((r) => r.kind === 'songs')).toBe(true);
  });

  it('says plainly when the databank has nothing, rather than an empty answer to guess around', async () => {
    const result = await run({ query: 'xqzvy wublat' });
    expect(result.success).toBe(true);
    expect(result.data?.results).toEqual([]);
    expect(result.data?.note).toMatch(/Nothing in the databank matches/);
  });

  it.each([
    ['no query', {}],
    ['an empty query', { query: '  ' }],
    ['an over-long query', { query: 'a'.repeat(201) }],
    ['an unknown kind', { query: 'Moog', kind: 'people' }],
  ])('refuses %s', (_label, args) => {
    expect(() => tool.validate(args)).toThrow();
  });

  it('agrees with its advertised definition on the kinds and the query length', () => {
    const { properties } = tool.functionDefinition.parameters as {
      properties: { query: { maxLength: number }; kind: { enum: string[] } };
    };
    expect(properties.query.maxLength).toBe(200);
    expect(properties.kind.enum).toEqual(['artists', 'makers', 'instruments', 'songs']);
  });
});
