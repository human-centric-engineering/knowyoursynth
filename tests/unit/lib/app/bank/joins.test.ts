/**
 * The ported joins over the committed seed data give every synth the "Heard on" list the prototype gave it.
 *
 * `tests/fixtures/bank/heard-on.json` is the prototype's own `heardFor()` for each of the 25 synths, recorded by
 * `scripts/record-heard-on.ts` and never re-recorded to make a port pass (D3). A synth written straight into the app
 * (`scripts/native-synths.ts`) has no prototype list, so it is not in the file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { HeardEntry } from '@/lib/app/synths/contract';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import {
  artistsOn,
  creditOf,
  decadeOf,
  erasOf,
  groupsOf,
  heardFor,
  instrumentsOf,
  membersOf,
  yearOf,
} from '@/lib/app/bank/joins';
import type { Bank, BankArtist, BankSong } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { NATIVE_SYNTHS, isNativeSynth } from '@/scripts/native-synths';

const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/bank/heard-on.json'), 'utf8')
) as Record<string, HeardEntry[]>;
const bank = loadBankData();
const ported = SYNTH_DEFS.map((d) => d.id).filter((id) => !isNativeSynth(id));

describe('the seed data', () => {
  it('holds the prototype databank whole', () => {
    expect(bank.artists).toHaveLength(184);
    expect(bank.songs).toHaveLength(248);
    // The reference list (b4) adds the rest, each with a source; the prototype's 86 have none.
    expect(bank.instruments.filter((i) => !i.source)).toHaveLength(86);
    expect(bank.makers).toHaveLength(50);
  });
});

describe('heardFor over the seed data', () => {
  it('has a recorded list for every ported synth, and the lists are not empty', () => {
    // Without this floor an empty golden or an empty bank would match every synth.
    expect(ported.length).toBeGreaterThan(0);
    expect(Object.keys(golden).sort()).toEqual([...ported].sort());
    for (const list of Object.values(golden)) expect(list.length).toBeGreaterThan(0);
  });

  it.each(ported)('%s: equals the prototype', (id) => {
    expect(heardFor(bank, id)).toEqual(golden[id]);
  });
});

describe('heardFor for a native synth', () => {
  // No prototype list to hold these to, so each one's list is written here: the records in order, and the library
  // sound each links to. The bank has no song with a Donner B1, Take 5, Super Gemini or Syncussion part yet; the CS-80's are the
  // databank's records of the Yamaha CS-80, two of them linked to its lessons. A change to the data changes this on
  // purpose.
  const expected: Record<string, [song: string, sound?: string][]> = {
    'donner-b1': [],
    'take-5': [],
    'cs-80': [
      ['bbc-radiophonic-workshop-doctor-who-theme-1980'],
      ['kate-bush-never-for-ever'],
      ['visage-visage'],
      ['vangelis-chariots-of-fire', 'cs-fanfare'],
      ['toto-africa'],
      ['vangelis-blade-runner', 'cs-blade-brass'],
      ['hans-zimmer-blade-runner-2049'],
    ],
    'super-gemini': [],
    'pearl-syncussion': [],
    'behringer-syncussion': [],
    e7: [],
    'syntrx-ii': [],
  };
  const records = (list: HeardEntry[]): [string, string?][] =>
    list.map((e) => (e.sound === undefined ? [e.song ?? ''] : [e.song ?? '', e.sound]));

  it('has an expectation for every native synth', () => {
    expect(Object.keys(expected).sort()).toEqual([...NATIVE_SYNTHS].sort());
  });

  it.each([...NATIVE_SYNTHS])('%s: is registered and lists what is written here', (id) => {
    expect(SYNTH_DEFS.map((d) => d.id)).toContain(id);
    expect(records(heardFor(bank, id))).toEqual(expected[id]);
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

describe('artistsOn', () => {
  const bank = loadBankData();

  it.each(bank.instruments.map((i) => i.id))(
    '%s: links the artists instrumentsOf links to it, in the same order',
    (id) => {
      const expected = bank.artists.filter((a) =>
        instrumentsOf(bank, a.id).some((i) => i.id === id)
      );
      expect(artistsOn(bank, id).map((a) => a.id)).toEqual(expected.map((a) => a.id));
    }
  );

  it('links no one to an instrument the databank does not have', () => {
    expect(artistsOn(bank, 'no-such-instrument')).toEqual([]);
  });
});
