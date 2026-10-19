/**
 * `web_search`: the tutor's web search through Brave (`f-tutor-knowledge` t-59). What matters is what reaches the model
 * and what reaches Brave: five trimmed results and nothing else of Brave's reply; and no request at all with no key, no
 * turns left or a host not allowed. Every failure is a refusal the model can act on, not a throw.
 *
 * The real outbound HTTP module runs, with its allowlist; only `fetch` is stubbed. The allowance's message table is in
 * memory and applies its filters (`tests/helpers/tutor.ts`).
 *
 * @see lib/app/tutor/web-search.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakeMessageTable,
  panelContext,
  synth,
  tutorSearches,
  tutorTurns,
  type MessageRow,
} from '@/tests/helpers/tutor';

const appEnv = vi.hoisted(() => ({
  TUTOR_DAILY_TURNS: 30,
  BRAVE_SEARCH_API_KEY: 'brave-key',
}));
vi.mock('@/lib/env', () => ({ env: appEnv }));

const table = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeMessageTable> | null }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    get aiMessage() {
      return table.current;
    },
  },
}));

import { trimBraveResults, WebSearchCapability } from '@/lib/app/tutor/web-search';
import { resetAllowlistCache } from '@/lib/orchestration/http';

const tool = new WebSearchCapability();
const context = panelContext(synth('model-d'));
const mockFetch = vi.fn<typeof fetch>();

function braveRow(i: number, extra: Record<string, unknown> = {}) {
  return {
    title: `Result ${i}`,
    url: `https://example.com/${i}`,
    description: `Snippet ${i}`,
    age: '2 days ago',
    profile: { name: 'Example' },
    meta_url: { hostname: 'example.com' },
    ...extra,
  };
}

function braveReply(rows: unknown[]) {
  return new Response(
    JSON.stringify({ type: 'search', query: { original: 'q' }, web: { results: rows } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function withMessages(rows: MessageRow[]) {
  table.current = fakeMessageTable(rows);
}

const search = (query = 'Vangelis Blade Runner') => tool.execute(tool.validate({ query }), context);

beforeEach(() => {
  appEnv.BRAVE_SEARCH_API_KEY = 'brave-key';
  appEnv.TUTOR_DAILY_TURNS = 30;
  withMessages([]);
  vi.stubEnv('ORCHESTRATION_ALLOWED_HOSTS', 'api.search.brave.com');
  resetAllowlistCache();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAllowlistCache();
});

describe('a search', () => {
  it("asks Brave for five results, with the key in Brave's header and the query in the URL", async () => {
    mockFetch.mockResolvedValue(braveReply([braveRow(1)]));

    await search('Vangelis Blade Runner');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    const sent = new URL(url instanceof Request ? url.url : url);
    expect(sent.origin + sent.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
    expect(sent.searchParams.get('q')).toBe('Vangelis Blade Runner');
    expect(sent.searchParams.get('count')).toBe('5');
    expect(new Headers(init?.headers).get('x-subscription-token')).toBe('brave-key');
  });

  it('returns at most five results, each its title, URL and snippet and nothing else of Brave’s', async () => {
    mockFetch.mockResolvedValue(braveReply(Array.from({ length: 8 }, (_, i) => braveRow(i + 1))));

    const result = await search();

    expect(result).toEqual({
      success: true,
      data: {
        results: [1, 2, 3, 4, 5].map((i) => ({
          title: `Result ${i}`,
          url: `https://example.com/${i}`,
          snippet: `Snippet ${i}`,
        })),
      },
    });
  });

  it('says so when the web has nothing, rather than returning an empty list alone', async () => {
    mockFetch.mockResolvedValue(braveReply([]));

    const result = await search();

    expect(result.success).toBe(true);
    expect(result.data?.results).toEqual([]);
    expect(result.data?.note).toMatch(/nothing on the web matched/i);
  });
});

describe('trimBraveResults', () => {
  it('strips markup and entities, and cuts a long snippet', () => {
    const [row] =
      trimBraveResults({
        web: {
          results: [
            braveRow(1, {
              title: '<strong>Blade Runner</strong> &amp; Vangelis',
              description: `It&#x27;s the <b>CS-80</b>. ${'x'.repeat(400)}`,
            }),
          ],
        },
      }) ?? [];

    expect(row.title).toBe('Blade Runner & Vangelis');
    expect(row.snippet.startsWith("It's the CS-80. x")).toBe(true);
    expect(row.snippet.length).toBe(300);
    expect(row.snippet.endsWith('…')).toBe(true);
  });

  it('skips a result whose URL is not a web page, or that has no title, and fills from the rest', () => {
    const rows = trimBraveResults({
      web: {
        results: [
          braveRow(1, { url: 'javascript:alert(1)' }),
          braveRow(2, { title: '<b></b>' }),
          braveRow(3, { url: 42 }),
          ...[4, 5, 6, 7, 8, 9].map((i) => braveRow(i)),
        ],
      },
    });

    expect(rows?.map((r) => r.url)).toEqual([4, 5, 6, 7, 8].map((i) => `https://example.com/${i}`));
  });

  it('reads a reply with no web section as no results, and one of another shape as unreadable', () => {
    expect(trimBraveResults({ type: 'search' })).toEqual([]);
    expect(trimBraveResults('not json')).toBeNull();
    expect(trimBraveResults({ web: { results: 'nope' } })).toBeNull();
  });
});

describe('refusals', () => {
  it('refuses with its reason and sends nothing when there is no Brave key', async () => {
    appEnv.BRAVE_SEARCH_API_KEY = undefined;

    const result = await search();

    expect(result).toEqual({
      success: false,
      error: { code: 'web_search_not_configured', message: expect.stringMatching(/isn't set up/) },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses, sending nothing, when Brave’s host is not in the allowlist', async () => {
    vi.stubEnv('ORCHESTRATION_ALLOWED_HOSTS', 'api.example.com');
    resetAllowlistCache();

    const result = await search();

    expect(result).toMatchObject({ success: false, error: { code: 'web_search_not_configured' } });
    expect(result.error?.message).toMatch(/not allowed/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('turns a Brave error into a refusal, without passing on what Brave said', async () => {
    mockFetch.mockResolvedValue(
      new Response('{"error":"SUBSCRIPTION_TOKEN_INVALID"}', { status: 401 })
    );

    const result = await search();

    expect(result).toMatchObject({ success: false, error: { code: 'web_search_failed' } });
    expect(result.error?.message).not.toMatch(/SUBSCRIPTION|401/);
  });

  it('turns a Brave that never answers into a refusal once the timeout passes', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        })
    );

    const pending = search();
    await vi.advanceTimersByTimeAsync(8_000);

    expect(await pending).toMatchObject({ success: false, error: { code: 'web_search_failed' } });
  });

  it('turns a reply it cannot read into a refusal', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ web: { results: 'nope' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(await search()).toMatchObject({ success: false, error: { code: 'web_search_failed' } });
  });

  it('refuses a search with no signed-in learner to count it against', async () => {
    const result = await tool.execute(tool.validate({ query: 'Moog' }), {
      ...context,
      userId: null,
    });

    expect(result).toMatchObject({ success: false, error: { code: 'web_search_no_user' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('the daily allowance', () => {
  it('refuses a search, sending nothing, once the turns and searches today use the allowance up', async () => {
    appEnv.TUTOR_DAILY_TURNS = 5;
    withMessages([
      ...tutorTurns('user-1', 3, new Date()),
      ...tutorSearches('user-1', 2, new Date()),
    ]);

    const result = await search();

    expect(result).toMatchObject({ success: false, error: { code: 'web_search_allowance_spent' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('goes ahead with one turn left, and counts the allowance of the caller, not another learner', async () => {
    appEnv.TUTOR_DAILY_TURNS = 5;
    withMessages([...tutorTurns('user-1', 4, new Date()), ...tutorTurns('user-2', 5, new Date())]);
    mockFetch.mockResolvedValue(braveReply([braveRow(1)]));

    expect((await search()).success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
