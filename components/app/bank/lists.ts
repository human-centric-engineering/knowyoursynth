/**
 * What each databank tab lists, its words for the search, and how a row is labelled.
 *
 * Transliterated from `ROWS` in the prototype file `src/ui/Bank.jsx` (D3). There the dialog worked these out in the
 * browser from the whole databank; here the page works them out on the server, once, and sends the browser only the
 * rows, so the search and the era filter run without a request. Pure.
 */

import type { Bank, BankArtist } from '@/lib/app/bank/data';
import {
  byYear,
  creditOf,
  decadeOf,
  erasOf,
  instrumentsBy,
  instrumentsOf,
  songsBy,
  yearOf,
} from '@/lib/app/bank/joins';
import type { BankKind } from '@/lib/app/bank/read';

/** One row of a tab's list. */
export interface BrowseRow {
  id: string;
  title: string;
  sub: string;
  /** The heading it is filed under; `null` for a tab with none. */
  group: string | null;
  /** The decades an artist is filed under, for the era filter. Artists only. */
  eras?: string[];
  /** Everything the search looks in, folded (see {@link fold}). */
  words: string;
}

export type BrowseLists = Record<BankKind, BrowseRow[]>;

/** Lower case, accents off: "Björk" is found by "bjork". */
export const fold = (t: string): string => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const join = (parts: (string | null | undefined | false)[], sep: string) =>
  parts.filter(Boolean).join(sep);

/** Each tab's rows, in the prototype's order: artists A–Z, makers by birth, songs and instruments by year. */
export function browseLists(bank: Bank, appSynths: ReadonlySet<string>): BrowseLists {
  const makers = new Map(bank.makers.map((m) => [m.id, m.name]));
  const artistRow = (a: BankArtist): BrowseRow => {
    const eras = erasOf(bank, a);
    return {
      id: a.id,
      title: a.name,
      sub: join([a.country, eras.join(', '), a.genres[0]], ' · '),
      group: eras[0] ?? 'Undated',
      eras,
      words: fold(
        [
          a.name,
          a.summary,
          a.country,
          ...a.genres,
          ...a.roles,
          ...eras,
          ...songsBy(bank, a.id).map((s) => s.title),
          ...instrumentsOf(bank, a.id).map((i) => i.name),
        ].join(' ')
      ),
    };
  };

  return {
    artists: [...bank.artists].sort((a, b) => a.name.localeCompare(b.name)).map(artistRow),
    makers: [...bank.makers]
      .sort((a, b) => yearOf(a.born) - yearOf(b.born) || a.name.localeCompare(b.name))
      .map((m) => ({
        id: m.id,
        title: m.name,
        sub: join([m.companies.join(', '), m.born && `${m.born}–${m.died ?? ''}`], ' · '),
        group: null,
        words: fold(
          [
            m.name,
            m.summary,
            m.country,
            ...m.companies,
            ...instrumentsBy(bank, m.id).map((i) => i.name),
          ].join(' ')
        ),
      })),
    songs: [...bank.songs].sort(byYear).map((s) => {
      const credit = creditOf(bank, s);
      return {
        id: s.id,
        title: s.title,
        sub: join([credit, s.year], ' · '),
        group: decadeOf(s.year) ?? 'Undated',
        words: fold(
          [s.title, s.album, credit, s.year, ...s.parts.flatMap((p) => [p.on, p.text])].join(' ')
        ),
      };
    }),
    instruments: [...bank.instruments]
      .sort((a, b) => yearOf(a.year) - yearOf(b.year) || a.name.localeCompare(b.name))
      .map((i) => ({
        id: i.id,
        title: i.name,
        sub: join(
          [i.maker, i.year, i.app?.some((id) => appSynths.has(id)) && 'in this app'],
          ' · '
        ),
        group: decadeOf(i.year) ?? 'Undated',
        words: fold(
          [i.name, i.maker, i.kind, i.text, ...(i.people ?? []).map((p) => makers.get(p))].join(' ')
        ),
      })),
  };
}
