import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArtistPage, InstrumentPage, MakerPage, SongPage } from '@/components/app/bank/bank-detail';
import { isBankTab } from '@/components/app/bank/routes';
import { readBank, readNames } from '@/components/app/bank/load';
import { detailFrom } from '@/lib/app/bank/read';
import { summarisePublicLinks, type LinkSummary } from '@/lib/app/links/read';
import type { Bank } from '@/lib/app/bank/data';

/**
 * One artist, innovator, record or instrument. A tab the databank does not have, or a row it does not hold, is a 404.
 */

type Props = { params: Promise<{ tab: string; id: string }> };

/** The page's title and description: the row's name, and what is said about it first. */
function about(
  bank: Bank,
  tab: string,
  id: string
): { title: string; description: string } | undefined {
  if (!isBankTab(tab)) return undefined;
  switch (tab) {
    case 'artists': {
      const a = bank.artists.find((x) => x.id === id);
      return a && { title: a.name, description: a.summary };
    }
    case 'makers': {
      const m = bank.makers.find((x) => x.id === id);
      return m && { title: m.name, description: m.summary };
    }
    case 'instruments': {
      const i = bank.instruments.find((x) => x.id === id);
      return i && { title: i.name, description: i.text };
    }
    case 'songs': {
      const s = bank.songs.find((x) => x.id === id);
      return s && { title: s.title, description: s.parts[0].text };
    }
  }
}

/** The videos and links a tab's page shows, counted; null for a maker's, which has none. */
function linksOf(tab: string, id: string): Promise<LinkSummary> | null {
  switch (tab) {
    case 'instruments':
      return summarisePublicLinks({ target: 'instrument', id });
    case 'songs':
      return summarisePublicLinks({ target: 'song', id });
    case 'artists':
      return summarisePublicLinks({ target: 'artist', id });
    default:
      return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab, id } = await params;
  const found = about(await readBank(), tab, id);
  return found ? { ...found, title: `${found.title} · Databank` } : { title: 'Databank' };
}

export default async function BankRowRoute({ params }: Props) {
  // Ids are slugs (`BankIdSchema`), so the segment is the id as it is.
  const { tab, id } = await params;
  if (!isBankTab(tab)) notFound();
  // An instrument's, record's or artist's link count is read alongside the bank rather than after it.
  const [bank, names, links] = await Promise.all([readBank(), readNames(), linksOf(tab, id)]);

  switch (tab) {
    case 'artists': {
      const d = detailFrom(bank, 'artists', id);
      if (!d || !links) notFound();
      return <ArtistPage d={d} names={names} links={links} />;
    }
    case 'makers': {
      const d = detailFrom(bank, 'makers', id);
      if (!d) notFound();
      return <MakerPage d={d} bank={bank} names={names} />;
    }
    case 'songs': {
      const d = detailFrom(bank, 'songs', id);
      if (!d || !links) notFound();
      return <SongPage d={d} names={names} links={links} />;
    }
    case 'instruments': {
      const d = detailFrom(bank, 'instruments', id);
      if (!d || !links) notFound();
      return <InstrumentPage d={d} names={names} links={links} />;
    }
  }
}
