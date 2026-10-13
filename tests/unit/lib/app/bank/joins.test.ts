/**
 * The ported joins over the committed seed data give every synth the "Heard on" list the prototype gave it.
 *
 * `tests/fixtures/bank/heard-on.json` is the prototype's own `heardFor()` for each of the 25 synths, recorded by
 * `scripts/record-heard-on.ts` and never re-recorded to make a port pass (D3).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { HeardEntry } from '@/lib/app/synths/contract';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import {
  creditOf,
  decadeOf,
  erasOf,
  groupsOf,
  heardFor,
  membersOf,
  yearOf,
} from '@/lib/app/bank/joins';
import type { Bank, BankArtist, BankSong } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/bank/heard-on.json'), 'utf8')
) as Record<string, HeardEntry[]>;
const bank = loadBankData();

describe('the seed data', () => {
  it('holds the prototype databank whole', () => {
    expect(bank.artists).toHaveLength(184);
    expect(bank.songs).toHaveLength(248);
    expect(bank.instruments).toHaveLength(86);
    expect(bank.makers).toHaveLength(50);
  });
});

describe('heardFor over the seed data', () => {
  it('has a recorded list for every registered synth, and the lists are not empty', () => {
    // Without this floor an empty golden or an empty bank would match every synth.
    expect(Object.keys(golden).sort()).toEqual(SYNTH_DEFS.map((d) => d.id).sort());
    for (const list of Object.values(golden)) expect(list.length).toBeGreaterThan(0);
  });

  it.each(SYNTH_DEFS.map((d) => d.id))('%s: equals the prototype', (id) => {
    expect(heardFor(bank, id)).toEqual(golden[id]);
  });
});

const song = (over: Partial<BankSong>): BankSong => ({
  id: 's',
  title: 'T',
  kind: 'song',
  artists: ['a'],
  parts: [{ instruments: ['i'], on: 'I', text: 'x' }],
  ...over,
});
const artist = (over: Partial<BankArtist>): BankArtist => ({
  id: 'a',
  name: 'A',
  kind: 'person',
  country: 'UK',
  active: '1980–',
  eras: [],
  genres: [],
  roles: [],
  summary: 's',
  story: 's',
  innovations: [],
  ...over,
});
const tiny = (over: Partial<Bank>): Bank => ({
  makers: [],
  instruments: [],
  artists: [],
  songs: [],
  ...over,
});

describe('the helpers', () => {
  it('read the first year of a range, and put undated last', () => {
    expect(yearOf('1970s–80s')).toBe(1970);
    expect(yearOf(undefined)).toBe(9999);
    expect(decadeOf('1983')).toBe('1980s');
    expect(decadeOf('Around then')).toBeNull();
  });

  it('print a credit when there is one, and the names otherwise', () => {
    const b = tiny({
      artists: [artist({ id: 'a', name: 'Ann' }), artist({ id: 'b', name: 'Bo' })],
    });
    expect(creditOf(b, song({ artists: ['a', 'b'] }))).toBe('Ann and Bo');
    expect(creditOf(b, song({ artists: ['a', 'zz'] }))).toBe('Ann and zz');
    expect(creditOf(b, song({ credit: 'Ann with Bo' }))).toBe('Ann with Bo');
  });

  it('file an artist with no eras under the decades of their records', () => {
    const a = artist({ id: 'a', eras: [] });
    const b = tiny({ songs: [song({ year: '1979' }), song({ id: 't', year: '1983' })] });
    expect(erasOf(b, a)).toEqual(['1970s', '1980s']);
    expect(erasOf(b, artist({ eras: ['1990s'] }))).toEqual(['1990s']);
  });

  it('read a membership recorded on either side, each pair once', () => {
    const b = tiny({
      artists: [
        artist({ id: 'band', kind: 'group', members: ['x'] }),
        artist({ id: 'x', memberOf: ['band'] }),
        artist({ id: 'y', memberOf: ['band'] }),
      ],
    });
    expect(membersOf(b, 'band')).toEqual(['x', 'y']);
    expect(groupsOf(b, 'y')).toEqual(['band']);
    expect(groupsOf(b, 'x')).toEqual(['band']);
  });
});
