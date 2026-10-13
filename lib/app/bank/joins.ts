/**
 * The databank's joins: who played what, on which instrument, made by whom.
 *
 * Transliterated from the prototype file `src/bank/index.js` (D3). There the joins read four module-level arrays;
 * here each takes the {@link Bank} it reads, so the same functions run over the seed files (in the seed and its tests)
 * and over what the read layer loads from the tables (`lib/app/bank/read.ts`). Pure.
 *
 * One change: a group's members are read from both sides. The prototype's files recorded a membership on the group
 * (`members`), on the member (`memberOf`), or on both, and nine pairs only on one side. The table holds one row per
 * pair, so `membersOf` and `groupsOf` read the union.
 */
import type { HeardEntry } from '@/lib/app/synths/contract';
import type { Bank, BankArtist, BankInstrument, BankSong } from '@/lib/app/bank/data';

/** All a credit needs of an artist. */
type NamedRow = Pick<BankArtist, 'id' | 'name'>;

const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

/** The first year in a year field ('1982', '1970s–80s', '2001–06'), for sorting; undated works go last. */
export const yearOf = (y: string | undefined | null): number => {
  const m = String(y || '').match(/\d{4}/);
  return m ? Number(m[0]) : 9999;
};

export const byYear = (a: BankSong, b: BankSong): number =>
  yearOf(a.year) - yearOf(b.year) || a.title.localeCompare(b.title);

/** The decade a year field falls in, as '1980s'. */
export const decadeOf = (y: string | undefined | null): string | null => {
  const n = yearOf(y);
  return n === 9999 ? null : `${Math.floor(n / 10) * 10}s`;
};

/** How a work's artists are printed: its own credit if it has one, otherwise the names joined. */
export const creditOf = (bank: { artists: NamedRow[] }, song: BankSong): string => {
  if (song.credit) return song.credit;
  const artists = index(bank.artists);
  return song.artists.map((id) => artists.get(id)?.name || id).join(' and ');
};

/** Instruments an app synth models (`app`). */
export const instrumentsForSynth = (
  bank: Pick<Bank, 'instruments'>,
  synthId: string
): BankInstrument[] => bank.instruments.filter((i) => i.app?.includes(synthId));

/**
 * One synth's "Heard on" list, in the shape the lineage dialog shows: every work with a part played on an instrument
 * this synth models, or listed under it by hand (`synths`). The part's per-synth note and sound win over the general
 * ones.
 */
export function heardFor(
  bank: Pick<Bank, 'instruments' | 'songs'> & { artists: NamedRow[] },
  synthId: string
): HeardEntry[] {
  const covers = new Set(instrumentsForSynth(bank, synthId).map((i) => i.id));
  const out: HeardEntry[] = [];
  for (const s of bank.songs) {
    const p =
      s.parts.find((x) => x.synths?.includes(synthId)) ||
      s.parts.find((x) => x.instruments.some((i) => covers.has(i)));
    if (!p) continue;
    const sound = p.sounds?.[synthId];
    out.push({
      who: creditOf(bank, s),
      what: s.title,
      ...(s.year !== undefined ? { year: s.year } : {}),
      on: p.on,
      text: p.notes?.[synthId] || p.text,
      ...(sound !== undefined ? { sound } : {}),
      song: s.id,
      artists: s.artists,
    });
  }
  return out.sort((a, b) => yearOf(a.year) - yearOf(b.year) || a.what.localeCompare(b.what));
}

/** Works an artist appears on: as a credited artist, or as the player of a part. */
export const songsBy = (bank: Pick<Bank, 'songs'>, artistId: string): BankSong[] =>
  bank.songs
    .filter((s) => s.artists.includes(artistId) || s.parts.some((p) => p.player === artistId))
    .sort(byYear);

/** Works with a part played on an instrument. */
export const songsOn = (bank: Pick<Bank, 'songs'>, instrumentId: string): BankSong[] =>
  bank.songs.filter((s) => s.parts.some((p) => p.instruments.includes(instrumentId))).sort(byYear);

/** Every instrument an artist is linked to: from their records, then the ones listed on the artist. */
export function instrumentsOf(bank: Bank, artistId: string): BankInstrument[] {
  const instruments = index(bank.instruments);
  const ids = new Set<string>();
  for (const s of songsBy(bank, artistId))
    for (const p of s.parts) for (const i of p.instruments) ids.add(i);
  for (const i of bank.artists.find((a) => a.id === artistId)?.instruments || []) ids.add(i);
  return [...ids].map((id) => instruments.get(id)).filter((i): i is BankInstrument => Boolean(i));
}

/**
 * Artists linked to an instrument, by record or by their own list: the artists {@link instrumentsOf} links to it, found
 * in one pass over the songs rather than once per artist. A record links every artist on it, credited or playing, to
 * every instrument on it.
 */
export function artistsOn(bank: Bank, instrumentId: string): BankArtist[] {
  if (!bank.instruments.some((i) => i.id === instrumentId)) return [];
  const linked = new Set<string>();
  for (const s of bank.songs) {
    if (!s.parts.some((p) => p.instruments.includes(instrumentId))) continue;
    for (const a of s.artists) linked.add(a);
    for (const p of s.parts) if (p.player) linked.add(p.player);
  }
  return bank.artists.filter((a) => linked.has(a.id) || a.instruments?.includes(instrumentId));
}

/** Instruments a maker had a hand in. */
export const instrumentsBy = (bank: Pick<Bank, 'instruments'>, makerId: string): BankInstrument[] =>
  bank.instruments
    .filter((i) => i.people?.includes(makerId))
    .sort((a, b) => yearOf(a.year) - yearOf(b.year));

/** Decades an artist is filed under: their own `eras`, or else the decades of their records. */
export const erasOf = (bank: Pick<Bank, 'songs'>, artist: BankArtist): string[] =>
  artist.eras.length
    ? artist.eras
    : [
        ...new Set(
          songsBy(bank, artist.id)
            .map((s) => decadeOf(s.year))
            .filter((d): d is string => Boolean(d))
        ),
      ];

/**
 * A group's members, from either side: the ids it lists, then any artist that lists it in `memberOf`. Each pair
 * once. The seed writes these as the group's `BankArtistMember` rows.
 */
export function membersOf(bank: Pick<Bank, 'artists'>, groupId: string): string[] {
  const ids = [...(bank.artists.find((a) => a.id === groupId)?.members ?? [])];
  for (const a of bank.artists)
    if (a.memberOf?.includes(groupId) && !ids.includes(a.id)) ids.push(a.id);
  return ids;
}

/** The groups an artist belongs to, from either side. */
export function groupsOf(bank: Pick<Bank, 'artists'>, artistId: string): string[] {
  const ids = [...(bank.artists.find((a) => a.id === artistId)?.memberOf ?? [])];
  for (const a of bank.artists)
    if (a.members?.includes(artistId) && !ids.includes(a.id)) ids.push(a.id);
  return ids;
}
