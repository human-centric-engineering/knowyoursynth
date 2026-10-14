// @vitest-environment happy-dom

/**
 * The databank's pages, over the committed seed data joined as the read layer joins it (`detailFrom`).
 *
 * @see components/app/bank/bank-detail.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ArtistPage,
  InstrumentPage,
  MakerPage,
  SongPage,
  Welcome,
  namesFrom,
} from '@/components/app/bank/bank-detail';
import { detailFrom } from '@/lib/app/bank/read';
import { songsOn } from '@/lib/app/bank/joins';
import type { Bank } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const bank = loadBankData();
const SYNTHS = [
  { id: 'model-d', maker: 'Behringer', name: 'Model D' },
  { id: 'system-15', maker: 'Moog', name: 'System 15' },
];
const SOUNDS = {
  'model-d': { 'baroque-line-voice': 'Baroque Line Voice' },
  'system-15': { 's15-brass': 'S15 Brass' },
};
const names = namesFrom(bank, SYNTHS, SOUNDS);

function must<T>(v: T | null): T {
  if (!v) throw new Error('fixture: row not in the seed data');
  return v;
}

const href = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href');
/** Every link of that name points at one place. */
const hrefsOf = (name: string | RegExp) => [
  ...new Set(screen.getAllByRole('link', { name }).map((l) => l.getAttribute('href'))),
];

describe('ArtistPage', () => {
  const d = must(detailFrom(bank, 'artists', 'wendy-carlos'));

  it('heads the page with the name, and lists every record', () => {
    render(<ArtistPage d={d} names={names} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Wendy Carlos' })).toBeTruthy();
    expect(d.songs.length).toBeGreaterThan(1);
    const records = screen.getByRole('heading', { name: `Records (${d.songs.length})` });
    const cards = within(records.parentElement as HTMLElement).getAllByRole('listitem');
    expect(cards).toHaveLength(d.songs.length);
    d.songs.forEach((s, i) =>
      expect(within(cards[i]).getByRole('link', { name: s.title }).getAttribute('href')).toBe(
        `/bank/songs/${s.id}`
      )
    );
  });

  it('links a sound in the style of a record to its synth, opening with that sound', () => {
    render(<ArtistPage d={d} names={names} />);
    expect(hrefsOf('Load a sound in this style on the Model D: Baroque Line Voice')).toEqual([
      '/synths/model-d?sound=baroque-line-voice',
    ]);
    expect(hrefsOf('Load a sound in this style on the System 15: S15 Brass')).toEqual([
      '/synths/system-15?sound=s15-brass',
    ]);
  });

  it('offers no sound on a synth that is not listed, or that the library does not have', () => {
    const fewer = namesFrom(bank, [SYNTHS[0]], { 'model-d': {} });
    render(<ArtistPage d={d} names={fewer} />);
    expect(screen.queryAllByRole('link', { name: /^Load a sound/ })).toEqual([]);
  });

  it('links each instrument they used to its page', () => {
    render(<ArtistPage d={d} names={names} />);
    const section = screen.getByRole('heading', { name: 'Synths' }).parentElement as HTMLElement;
    expect(
      within(section)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href'))
    ).toEqual(d.instruments.map((i) => `/bank/instruments/${i.id}`));
  });
});

describe('ArtistPage credits and groups', () => {
  it('credits a record they only played a part on to whoever made it, and not their own', () => {
    const d = must(detailFrom(bank, 'artists', 'christopher-franke'));
    const record = d.songs.find((s) => s.id === 'tangerine-dream-phaedra');
    expect(record?.artists).toEqual(['tangerine-dream']);
    render(<ArtistPage d={d} names={names} />);
    const card = screen.getByRole('link', { name: record?.title ?? '' }).closest('li');
    expect(within(card as HTMLElement).getByRole('link', { name: 'Tangerine Dream' })).toBeTruthy();
  });

  it('gives members and groups a heading each', () => {
    const d = must(detailFrom(bank, 'artists', 'george-michael'));
    const both = {
      ...d,
      members: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
    };
    render(<ArtistPage d={both} names={names} />);
    const members = screen.getByRole('heading', { name: 'Members in the databank' })
      .parentElement as HTMLElement;
    const groups = screen.getByRole('heading', { name: 'Member of' }).parentElement as HTMLElement;
    expect(
      within(members)
        .getAllByRole('link')
        .map((l) => l.textContent)
    ).toEqual(['Kraftwerk']);
    expect(
      within(groups)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href'))
    ).toEqual(['/bank/artists/wham']);
  });
});

describe('InstrumentPage', () => {
  const d = must(detailFrom(bank, 'instruments', 'moog-minimoog'));

  it('opens the panels that model it, the people behind it, and the records it is heard on', () => {
    render(<InstrumentPage d={d} names={names} />);
    expect(screen.getByRole('heading', { level: 2, name: d.instrument.name })).toBeTruthy();
    expect(href('Open the Behringer Model D panel')).toBe('/synths/model-d');
    expect(d.people.length).toBeGreaterThan(0);
    for (const p of d.people) expect(hrefsOf(p.name)).toEqual([`/bank/makers/${p.id}`]);
    expect(
      screen.getByRole('heading', { name: `Heard on (${songsOn(bank, 'moog-minimoog').length})` })
    ).toBeTruthy();
    expect(d.artists.length).toBeGreaterThan(0);
  });

  it('opens no panel for a synth that is not listed', () => {
    render(<InstrumentPage d={d} names={namesFrom(bank, [], {})} />);
    expect(screen.queryAllByRole('link', { name: /^Open the/ })).toEqual([]);
  });

  it('links a recreation to its original, and the original to its recreations', () => {
    const recreated: Bank = {
      ...bank,
      instruments: [
        ...bank.instruments,
        {
          id: 'behringer-model-d',
          name: 'Model D',
          maker: 'Behringer',
          year: '2017',
          kind: 'mono',
          recreationOf: 'moog-minimoog',
          text: 'A copy of the original, smaller.',
        },
      ],
    };
    const copy = must(detailFrom(recreated, 'instruments', 'behringer-model-d'));
    const { unmount } = render(<InstrumentPage d={copy} names={names} />);
    expect(copy.recreationOf?.id).toBe('moog-minimoog');
    expect(href(copy.recreationOf?.name ?? '')).toBe('/bank/instruments/moog-minimoog');
    expect(screen.getByText(/A recreation of the/)).toBeTruthy();
    unmount();

    const original = must(detailFrom(recreated, 'instruments', 'moog-minimoog'));
    render(<InstrumentPage d={original} names={names} />);
    const section = screen.getByRole('heading', { name: 'Recreations' })
      .parentElement as HTMLElement;
    expect(within(section).getByRole('link').getAttribute('href')).toBe(
      '/bank/instruments/behringer-model-d'
    );
  });

  it('has no recreation lines when there are none', () => {
    render(<InstrumentPage d={d} names={names} />);
    expect(screen.queryByText(/A recreation of the/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Recreations' })).toBeNull();
  });
});

describe('MakerPage', () => {
  it('lists what they had a hand in, each with what is said about it', () => {
    const d = must(detailFrom(bank, 'makers', 'robert-moog'));
    render(<MakerPage d={d} bank={bank} names={names} />);
    expect(screen.getByRole('heading', { level: 2, name: d.maker.name })).toBeTruthy();
    const cards = within(
      screen.getByRole('heading', { name: 'Instruments' }).parentElement as HTMLElement
    ).getAllByRole('listitem');
    expect(cards).toHaveLength(d.instruments.length);
    const first = must(bank.instruments.find((i) => i.id === d.instruments[0].id) ?? null);
    expect(cards[0].textContent).toContain(first.text);
    expect(screen.getAllByRole('link', { name: 'Open the Behringer Model D panel' })).toHaveLength(
      1
    );
  });
});

describe('SongPage', () => {
  it("names the work's kind and year, links its artists, and every instrument its parts name", () => {
    const d = must(detailFrom(bank, 'songs', 'donna-summer-i-feel-love'));
    render(<SongPage d={d} names={names} />);
    expect(screen.getByRole('heading', { level: 2, name: d.song.title })).toBeTruthy();
    expect(d.artists.length).toBeGreaterThan(0);
    for (const a of d.artists) expect(hrefsOf(a.name)).toEqual([`/bank/artists/${a.id}`]);
    expect(d.instruments.length).toBeGreaterThan(0);
    for (const i of d.instruments) expect(hrefsOf(i.name)).toEqual([`/bank/instruments/${i.id}`]);
  });
});

describe('Welcome', () => {
  it("says what the tab holds and starts with the prototype's picks", () => {
    render(<Welcome tab="artists" names={names} />);
    expect(screen.getByText(/The players, bands, producers/)).toBeTruthy();
    expect(href('Kraftwerk')).toBe('/bank/artists/kraftwerk');
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('starts with nothing on the records tab', () => {
    render(<Welcome tab="songs" names={names} />);
    expect(screen.queryByText('Start with')).toBeNull();
  });

  it('leaves out a pick the databank does not have', () => {
    const without = namesFrom(
      { ...bank, artists: bank.artists.filter((a) => a.id !== 'kraftwerk') },
      [],
      {}
    );
    render(<Welcome tab="artists" names={without} />);
    expect(screen.queryByRole('link', { name: 'Kraftwerk' })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
