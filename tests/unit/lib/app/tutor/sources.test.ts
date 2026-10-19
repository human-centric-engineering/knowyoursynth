/**
 * What counts as a tutor answer's source (`f-tutor-knowledge` t-60): the rows `search_databank` and `web_search`
 * return, held to a databank page or an http(s) URL, and nothing from a refusal or another tool.
 *
 * The results are typed as the tools' own data, so a change to either tool's shape fails here at type-check.
 *
 * @see lib/app/tutor/sources.ts
 */
import { describe, expect, it } from 'vitest';
import type { DatabankHit, DatabankSearchData } from '@/lib/app/tutor/search-databank';
import { addSources, readSources } from '@/lib/app/tutor/sources';
import type { WebSearchData } from '@/lib/app/tutor/web-search';

const hit = (over: Partial<DatabankHit> = {}): DatabankHit => ({
  kind: 'artists',
  id: 'vangelis',
  name: 'Vangelis',
  href: '/bank/artists/vangelis',
  about: 'composer · Greece · 1970s',
  excerpt: 'Scored Blade Runner on a Yamaha CS-80.',
  related: [],
  matchedBy: ['lexical'],
  ...over,
});

const databank = (results: DatabankHit[]) => ({
  success: true,
  data: { results, search: 'lexical' } satisfies DatabankSearchData,
});
const web = (results: WebSearchData['results']) => ({
  success: true,
  data: { results } satisfies WebSearchData,
});

describe('readSources', () => {
  it('reads a databank row as its page, and a web result as its URL', () => {
    expect(readSources('search_databank', databank([hit()]))).toEqual([
      { type: 'databank', kind: 'artists', name: 'Vangelis', href: '/bank/artists/vangelis' },
    ]);
    expect(
      readSources(
        'web_search',
        web([{ title: 'CS-80', url: 'https://example.com/cs80', snippet: 'A polysynth.' }])
      )
    ).toEqual([{ type: 'web', title: 'CS-80', url: 'https://example.com/cs80' }]);
  });

  it('skips a databank row whose href is not its own /bank page', () => {
    const rows = [
      hit({ href: 'javascript:alert(1)' }),
      hit({ href: 'https://example.com/bank/artists/vangelis' }),
      hit({ href: '//example.com/bank/artists/vangelis' }),
      // another kind's page than the row says
      hit({ href: '/bank/songs/vangelis' }),
      hit({ id: 'moog', name: 'Moog', href: '/bank/makers/moog', kind: 'makers' }),
    ];
    expect(readSources('search_databank', databank(rows))).toEqual([
      { type: 'databank', kind: 'makers', name: 'Moog', href: '/bank/makers/moog' },
    ]);
  });

  it('keeps only http(s) web results', () => {
    const rows = [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com/a',
      'http://example.com/b',
    ].map((url) => ({ title: url, url, snippet: '' }));
    expect(readSources('web_search', web(rows))).toEqual([
      { type: 'web', title: 'http://example.com/b', url: 'http://example.com/b' },
    ]);
  });

  it('has no sources for a refused search, another tool, or a result that is not one', () => {
    const refused = { success: false, error: { code: 'web_search_failed', message: 'No.' } };
    expect(readSources('web_search', refused)).toEqual([]);
    expect(readSources('search_databank', refused)).toEqual([]);
    // the same rows, from a tool that is not a search
    expect(readSources('describe_synth', databank([hit()]))).toEqual([]);
    expect(readSources('search_databank', null)).toEqual([]);
    expect(readSources('search_databank', { success: true, data: {} })).toEqual([]);
    // the population was non-empty: the same result from the right tool reads
    expect(readSources('search_databank', databank([hit()]))).toHaveLength(1);
  });
});

describe('addSources', () => {
  it('adds each source once, in the order found', () => {
    const a = readSources('search_databank', databank([hit()]));
    const b = readSources(
      'web_search',
      web([{ title: 'CS-80', url: 'https://example.com/cs80', snippet: '' }])
    );
    expect(addSources(addSources(a, b), [...b, ...a])).toEqual([...a, ...b]);
  });
});
