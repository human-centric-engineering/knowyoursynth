/**
 * The databank's URLs and the prototype's `#bank/…` links.
 *
 * @see components/app/bank/routes.ts
 */

import { describe, it, expect } from 'vitest';
import {
  BANK_TABS,
  DEFAULT_TAB,
  bankHashRoute,
  bankHref,
  isBankTab,
  tabLabel,
} from '@/components/app/bank/routes';
import { BANK_KINDS } from '@/lib/app/bank/read';

describe('BANK_TABS', () => {
  it('has a tab for every kind the read layer serves, and no other', () => {
    expect(BANK_TABS.map(([t]) => t).sort()).toEqual([...BANK_KINDS].sort());
  });

  it("keeps the prototype's order and labels", () => {
    expect(BANK_TABS).toEqual([
      ['artists', 'Artists'],
      ['makers', 'Innovators'],
      ['songs', 'Records'],
      ['instruments', 'Instruments'],
    ]);
    expect(tabLabel('makers')).toBe('Innovators');
  });

  it.each([
    ['artists', true],
    ['instruments', true],
    ['synths', false],
    ['', false],
    ['constructor', false],
  ])('isBankTab(%j) is %s', (tab, is) => {
    expect(isBankTab(tab)).toBe(is);
  });
});

describe('bankHref', () => {
  it('puts the default tab at /bank', () => {
    expect(DEFAULT_TAB).toBe('artists');
    expect(bankHref()).toBe('/bank');
    expect(bankHref('artists')).toBe('/bank');
  });

  it('gives every other tab its own URL', () => {
    expect(bankHref('songs')).toBe('/bank/songs');
  });

  it('gives a row its page under its tab, the default tab included', () => {
    expect(bankHref('artists', 'kraftwerk')).toBe('/bank/artists/kraftwerk');
    expect(bankHref('instruments', 'moog-minimoog')).toBe('/bank/instruments/moog-minimoog');
  });
});

describe('bankHashRoute', () => {
  it.each([
    ['#bank/artists/kraftwerk', '/bank/artists/kraftwerk'],
    ['bank/makers/robert-moog', '/bank/makers/robert-moog'],
    ['#bank/songs', '/bank/songs'],
    ['#bank/songs/', '/bank/songs'],
    ['#bank/artists', '/bank'],
    ['#bank', '/bank'],
  ])('maps %s to %s', (hash, href) => {
    expect(bankHashRoute(hash)).toBe(href);
  });

  it('opens the artists tab for a tab the prototype did not have, dropping its id', () => {
    expect(bankHashRoute('#bank/synths/model-d')).toBe('/bank');
  });

  it('drops an id that is not a slug rather than putting it in the path', () => {
    expect(bankHashRoute('#bank/artists/..%2Fadmin')).toBe('/bank');
    expect(bankHashRoute('#bank/artists/Kraftwerk')).toBe('/bank');
  });

  it.each(['', '#', '#model-d', '#model-d/outline', '#banker/artists/x'])(
    'is null for %j, which is not a databank link',
    (hash) => {
      expect(bankHashRoute(hash)).toBeNull();
    }
  );
});
