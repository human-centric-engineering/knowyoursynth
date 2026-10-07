/**
 * The synth page's URLs and the prototype's hash routes.
 *
 * @see components/app/synth/routes.ts
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEW,
  hashRoute,
  parseView,
  synthHref,
  viewQuery,
} from '@/components/app/synth/routes';

describe('parseView', () => {
  it.each([null, undefined, ''])('is null when there is no view: %s', (param) => {
    expect(parseView(param)).toBeNull();
  });

  it.each([
    ['outline', { outline: true, long: false }],
    ['long', { outline: false, long: true }],
    ['long,outline', { outline: true, long: true }],
    ['outline,long', { outline: true, long: true }],
    ['sideways', { outline: false, long: false }],
    ['outline,sideways', { outline: true, long: false }],
  ])('reads %s', (param, view) => {
    expect(parseView(param)).toEqual(view);
  });
});

describe('viewQuery', () => {
  it.each([
    [{ outline: false, long: false }, null],
    [{ outline: true, long: false }, 'outline'],
    [{ outline: false, long: true }, 'long'],
    [{ outline: true, long: true }, 'long,outline'],
  ])('writes %j as %s', (view, query) => {
    expect(viewQuery(view)).toBe(query);
  });

  it('round-trips through parseView for every view', () => {
    for (const outline of [false, true])
      for (const long of [false, true]) {
        const q = viewQuery({ outline, long });
        expect(parseView(q)).toEqual(q === null ? null : { outline, long });
      }
  });
});

describe('synthHref', () => {
  it('has no query for the default view', () => {
    expect(synthHref('model-d')).toBe('/synths/model-d');
    expect(synthHref('model-d', DEFAULT_VIEW)).toBe('/synths/model-d');
  });

  it('puts a non-default view in the query', () => {
    expect(synthHref('model-d', { outline: true, long: true })).toBe(
      '/synths/model-d?view=long,outline'
    );
  });

  it('encodes the id so it cannot break out of the path', () => {
    expect(synthHref('a/b?c')).toBe('/synths/a%2Fb%3Fc');
  });
});

describe('hashRoute', () => {
  const isSynth = (id: string) => id === 'model-d' || id === 'minimoog';

  it.each([
    ['#model-d', '/synths/model-d'],
    ['model-d', '/synths/model-d'],
    ['#model-d/outline', '/synths/model-d?view=outline'],
    ['#model-d/long', '/synths/model-d?view=long'],
    ['#model-d/long/outline', '/synths/model-d?view=long,outline'],
    ['#model-d/outline/long', '/synths/model-d?view=long,outline'],
    ['#minimoog/nonsense', '/synths/minimoog'],
  ])('sends %s to %s', (hash, href) => {
    expect(hashRoute(hash, isSynth)).toBe(href);
  });

  it.each(['', '#', '#bank', '#bank/model-d', '#unknown', '#unknown/long', '#/long'])(
    'leaves %j alone',
    (hash) => {
      expect(hashRoute(hash, isSynth)).toBeNull();
    }
  );

  it('asks the caller which ids are real, with the bare id', () => {
    const seen: string[] = [];
    hashRoute('#model-d/long', (id) => (seen.push(id), true));
    expect(seen).toEqual(['model-d']);
  });

  it('does not consult isSynth for the bank', () => {
    const seen: string[] = [];
    hashRoute('#bank/x', (id) => (seen.push(id), true));
    expect(seen).toEqual([]);
  });
});
