/**
 * The databank's tab lists over the committed seed data: every row, in the prototype's order, filed and searchable as
 * `Bank.jsx` filed them.
 *
 * @see components/app/bank/lists.ts
 */

import { describe, it, expect } from 'vitest';
import { browseLists, fold } from '@/components/app/bank/lists';
import { erasOf, yearOf } from '@/lib/app/bank/joins';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const bank = loadBankData();
const lists = browseLists(bank, new Set(['model-d']));

describe('fold', () => {
  it('lower-cases and takes the accents off', () => {
    expect(fold('Björk Guðmundsdóttir')).toBe('bjork guðmundsdottir');
    expect(fold('Hervé')).toBe('herve');
  });
});

describe('browseLists', () => {
  it('lists every row of every kind', () => {
    expect(lists.artists).toHaveLength(bank.artists.length);
    expect(lists.makers).toHaveLength(bank.makers.length);
    expect(lists.songs).toHaveLength(bank.songs.length);
    expect(lists.instruments).toHaveLength(bank.instruments.length);
  });

  it('sorts artists A–Z and files each under its first era', () => {
    const titles = lists.artists.map((r) => r.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    for (const r of lists.artists) {
      const a = bank.artists.find((x) => x.id === r.id);
      if (!a) throw new Error(r.id);
      expect(r.eras).toEqual(erasOf(bank, a));
      expect(r.group).toBe(erasOf(bank, a)[0] ?? 'Undated');
    }
  });

  it('sorts makers by birth year, and files them under no heading', () => {
    const years = lists.makers.map((r) => yearOf(bank.makers.find((m) => m.id === r.id)?.born));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(lists.makers.every((r) => r.group === null)).toBe(true);
  });

  it('files songs and instruments by decade, oldest first', () => {
    for (const rows of [lists.songs, lists.instruments]) {
      const decades = rows.map((r) => r.group);
      expect(decades.every((d) => d === 'Undated' || /^\d{4}s$/.test(d ?? ''))).toBe(true);
      const dated = decades.filter((d) => d !== 'Undated');
      expect(dated).toEqual([...dated].sort());
    }
  });

  it('says "in this app" only of an instrument a listed synth models', () => {
    const minimoog = lists.instruments.find((r) => r.id === 'moog-minimoog');
    const arp = lists.instruments.find((r) => r.id === 'arp-2600');
    expect(minimoog?.sub).toContain('in this app');
    // The ARP 2600 is modelled by b2600, which is not listed here.
    expect(arp?.sub).not.toContain('in this app');
  });

  it("finds an artist by a record's title and an instrument's name, folded", () => {
    const kraftwerk = lists.artists.find((r) => r.id === 'kraftwerk');
    expect(kraftwerk?.words).toContain('autobahn');
    expect(kraftwerk?.words).toBe(fold(kraftwerk?.words ?? ''));
  });
});
