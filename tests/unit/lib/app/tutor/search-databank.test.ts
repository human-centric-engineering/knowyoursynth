/**
 * `search_databank`, the tutor's way into the databank (`lib/app/tutor/search-databank.ts`, `f-tutor-knowledge` t-57,
 * t-58).
 *
 * Over the seed's own rows (`tests/helpers/bank-db.ts`). The lexical ranking is `tests/unit/lib/app/bank/search.test.ts`'s
 * and the meaning search `knowledge.test.ts`'s, mocked here; this holds the tool to its arguments, its result size, what
 * it says when nothing matches, and how it merges the two layers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeaningSearch } from '@/lib/app/bank/knowledge';
import { documentsOf, searchBankIn } from '@/lib/app/bank/search';
import { fuseDatabankResults, SearchDatabankCapability } from '@/lib/app/tutor/search-databank';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { panelContext, synth } from '@/tests/helpers/tutor';

vi.mock('@/lib/db/client', async () => {
  const { bankDb } = await import('@/tests/helpers/bank-db');
  return { prisma: bankDb() };
});

const meaning = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/bank/knowledge', () => ({ searchBankByMeaning: meaning }));

const unavailable: MeaningSearch = {
  status: 'unavailable',
  reason: 'the databank is not projected',
};
beforeEach(() => {
  meaning.mockReset();
  meaning.mockResolvedValue(unavailable);
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

  it('merges in a row only the meaning-based layer found, labelled as such', async () => {
    meaning.mockResolvedValue({
      status: 'ok',
      hits: [{ ref: { kind: 'makers', id: 'robert-moog' }, similarity: 0.8 }],
    } satisfies MeaningSearch);
    const result = await run({ query: 'xqzvy wublat' });
    expect(meaning).toHaveBeenCalledWith('xqzvy wublat', { kind: undefined, limit: 12 });
    expect(result.data).toMatchObject({
      search: 'lexical+meaning',
      results: [
        {
          kind: 'makers',
          id: 'robert-moog',
          href: '/bank/makers/robert-moog',
          matchedBy: ['meaning'],
        },
      ],
    });
    expect(result.data?.note).toBeUndefined();
  });

  it('falls back to the lexical layer alone, and says so, when the meaning-based layer is unavailable', async () => {
    const result = await run({ query: 'Vangelis' });
    expect(result.data?.search).toBe('lexical');
    expect(result.data?.results[0]).toMatchObject({ id: 'vangelis', matchedBy: ['lexical'] });
    expect(result.data?.results.every((r) => r.matchedBy.join() === 'lexical')).toBe(true);
  });
});

describe('fuseDatabankResults', () => {
  const bank = loadBankData();
  const docs = documentsOf(bank);
  const lexical = searchBankIn(bank, 'Vangelis', { limit: 12 });
  const ref = (i: number) => ({ kind: lexical[i].kind, id: lexical[i].id });

  it('ranks a row both layers found above rows only one found, and lists it once', () => {
    expect(lexical.length).toBeGreaterThan(3);
    const both = ref(3);
    const fused = fuseDatabankResults(
      docs,
      'Vangelis',
      lexical,
      {
        status: 'ok',
        hits: [
          { ref: { kind: 'makers', id: 'robert-moog' }, similarity: 0.9 },
          { ref: both, similarity: 0.8 },
        ],
      },
      6
    );
    expect(fused.search).toBe('lexical+meaning');
    expect(fused.results[0]).toMatchObject({ ...both, matchedBy: ['lexical', 'meaning'] });
    expect(fused.results.filter((r) => r.id === both.id)).toHaveLength(1);
    expect(fused.results.map((r) => r.id)).toContain('robert-moog');
    expect(fused.results).toHaveLength(6);
    expect(fused.results[0]).not.toHaveProperty('score');
  });

  it('keeps the lexical order at a tie, and drops a meaning hit the bank no longer has', () => {
    const fused = fuseDatabankResults(
      docs,
      'Vangelis',
      lexical.slice(0, 1),
      {
        status: 'ok',
        hits: [
          { ref: { kind: 'artists', id: 'deleted-row' }, similarity: 0.9 },
          { ref: { kind: 'makers', id: 'robert-moog' }, similarity: 0.8 },
        ],
      },
      6
    );
    expect(fused.results.map((r) => r.id)).toEqual([lexical[0].id, 'robert-moog']);
  });

  it('is the lexical ranking, unchanged, when the meaning-based layer is unavailable', () => {
    const fused = fuseDatabankResults(docs, 'Vangelis', lexical, unavailable, 6);
    expect(fused).toEqual({
      search: 'lexical',
      results: lexical
        .slice(0, 6)
        .map(({ score: _score, ...hit }) => ({ ...hit, matchedBy: ['lexical'] })),
    });
  });
});
