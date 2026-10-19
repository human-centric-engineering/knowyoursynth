/**
 * Searching the databank by name and text (`lib/app/bank/search.ts`, `f-tutor-knowledge` t-57).
 *
 * Runs over the committed seed data, so the rankings asserted are the ones a visitor and the tutor get. Rows edited
 * here are edited on a copy, which is also how the index cache is shown to follow an edit.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Bank } from '@/lib/app/bank/data';
import { MAX_RESULTS, searchBank, searchBankIn, tokens } from '@/lib/app/bank/search';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

vi.mock('@/lib/db/client', async () => {
  const { bankDb } = await import('@/tests/helpers/bank-db');
  return { prisma: bankDb() };
});

const bank = loadBankData();
const copy = (): Bank => structuredClone(bank);
const ids = (hits: { kind: string; id: string }[]) => hits.map((h) => `${h.kind}/${h.id}`);

describe('tokens', () => {
  it('drops accents, case, stop words and plurals, so a query need not match the spelling', () => {
    expect(tokens('Équinoxe')).toEqual(['equinoxe']);
    expect(tokens('Who played the Synths?')).toEqual(['played', 'synth']);
    expect(tokens('melodies')).toEqual(['melody']);
    expect(tokens("Jarre's Jean-Michel")).toEqual(['jarre', 'jean', 'michel']);
    // Words ending -ss and -us are not plurals.
    expect(tokens('bass chorus')).toEqual(['bass', 'chorus']);
  });
});

describe('searchBankIn', () => {
  it('ranks the row with the exact name first, above the rows that mention it', () => {
    const hits = searchBankIn(bank, 'Vangelis');
    expect(ids(hits)[0]).toBe('artists/vangelis');
    // Their records link to the artist, so they follow.
    expect(ids(hits)).toContain('songs/vangelis-blade-runner');
    expect(searchBankIn(bank, 'Blade Runner')[0]?.id).toBe('vangelis-blade-runner');
  });

  it('lifts a row whose whole name the query holds above rows that share part of it', () => {
    // Without the lift, the Tom Oberheim SEM instrument outranks the maker, and the 2016 reissue the original.
    expect(ids(searchBankIn(bank, 'Tom Oberheim'))[0]).toBe('makers/tom-oberheim');
    expect(ids(searchBankIn(bank, 'who is Tom Oberheim'))[0]).toBe('makers/tom-oberheim');
    const hits = ids(searchBankIn(bank, 'Minimoog Model D'));
    expect(hits[0]).toBe('instruments/moog-minimoog');
    expect(hits).toContain('instruments/moog-minimoog-model-d-2016');
  });

  it('keeps a model name whole rather than reading its letter as a plural', () => {
    expect(tokens('DX7s')).toEqual(['dx7s']);
    expect(ids(searchBankIn(bank, 'Yamaha DX7'))[0]).toBe('instruments/yamaha-dx7');
  });

  it('finds a row by a word only its text holds, and finds an edit on the next search', () => {
    const before = copy();
    expect(searchBankIn(before, 'quorblex')).toEqual([]);

    const edited = copy();
    const cs80 = edited.instruments.find((i) => i.id === 'yamaha-cs-80');
    if (!cs80) throw new Error('fixture: the CS-80 is in the committed bank');
    cs80.text = `${cs80.text} Its quorblex was famous.`;
    const hits = searchBankIn(edited, 'quorblex');
    expect(ids(hits)).toEqual(['instruments/yamaha-cs-80']);
    expect(hits[0]?.excerpt).toBe('Its quorblex was famous.');
  });

  it('finds a record by the text of its parts', () => {
    const edited = copy();
    const song = edited.songs.find((s) => s.id === 'vangelis-blade-runner');
    const part = song?.parts[0];
    if (!part) throw new Error('fixture: Blade Runner has a part');
    part.text = `${part.text} A zamfrit line.`;
    expect(ids(searchBankIn(edited, 'zamfrit'))).toEqual(['songs/vangelis-blade-runner']);
  });

  it('narrows to one kind', () => {
    const hits = searchBankIn(bank, 'Vangelis', { kind: 'songs' });
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((h) => h.kind === 'songs')).toBe(true);
  });

  it('finds nothing for a query with no match, or with only stop words', () => {
    expect(searchBankIn(bank, 'xqzvy wublat')).toEqual([]);
    expect(searchBankIn(bank, 'who was the')).toEqual([]);
  });

  it('returns at most the limit, clamped to the maximum', () => {
    expect(searchBankIn(bank, 'Roland', { limit: 3 })).toHaveLength(3);
    expect(searchBankIn(bank, 'Roland', { limit: 500 })).toHaveLength(MAX_RESULTS);
    expect(searchBankIn(bank, 'Roland', { limit: 0 })).toHaveLength(1);
  });

  it('gives each result its page, a line that places it, and the rows it links to', () => {
    const [vangelis] = searchBankIn(bank, 'Vangelis');
    expect(vangelis).toMatchObject({
      kind: 'artists',
      id: 'vangelis',
      name: 'Vangelis',
      href: '/bank/artists/vangelis',
    });
    expect(vangelis?.about).toContain('Greece');
    expect(vangelis?.excerpt.length).toBeGreaterThan(0);
    expect(vangelis?.related).toContainEqual({
      kind: 'songs',
      id: 'vangelis-blade-runner',
      name: 'Blade Runner',
    });
    expect(vangelis?.related.length).toBeLessThanOrEqual(8);
  });
});

describe('searchBank', () => {
  it('searches the bank as the read layer loads it from the tables', async () => {
    const hits = await searchBank('Vangelis', { limit: 2 });
    expect(ids(hits)[0]).toBe('artists/vangelis');
    expect(hits).toHaveLength(2);
  });
});
