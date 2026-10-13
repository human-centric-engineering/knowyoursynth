/**
 * The databank's routes: `/bank`, `/bank/[tab]` and `/bank/[tab]/[id]`, read through the bank page loader.
 *
 * @see app/(public)/bank/page.tsx
 * @see app/(public)/bank/[tab]/page.tsx
 * @see app/(public)/bank/[tab]/[id]/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';

import BankRoute, { metadata as bankMetadata } from '@/app/(public)/bank/page';
import BankTabRoute, { generateMetadata as tabMetadata } from '@/app/(public)/bank/[tab]/page';
import BankRowRoute, { generateMetadata as rowMetadata } from '@/app/(public)/bank/[tab]/[id]/page';
import {
  ArtistPage,
  InstrumentPage,
  MakerPage,
  SongPage,
  Welcome,
  namesFrom,
} from '@/components/app/bank/bank-detail';
import { readBank, readNames } from '@/components/app/bank/load';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock('@/components/app/bank/load', () => ({ readBank: vi.fn(), readNames: vi.fn() }));

const bank = loadBankData();
const names = namesFrom(bank, [], {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readBank).mockResolvedValue(bank);
  vi.mocked(readNames).mockResolvedValue(names);
});

const element = async (p: Promise<unknown>): Promise<ReactElement<Record<string, unknown>>> => {
  const el = await p;
  if (!isValidElement<Record<string, unknown>>(el)) throw new Error('expected an element');
  return el;
};
const tab = (t: string) => ({ params: Promise.resolve({ tab: t }) });
const row = (t: string, id: string) => ({ params: Promise.resolve({ tab: t, id }) });

describe('/bank', () => {
  it('welcomes the visitor to the artists tab', async () => {
    const el = await element(BankRoute());
    expect(el.type).toBe(Welcome);
    expect(el.props).toEqual({ tab: 'artists', names });
    expect(bankMetadata.title).toBe('Databank');
  });
});

describe('/bank/[tab]', () => {
  it.each(['makers', 'songs', 'instruments'])('welcomes the visitor to %s', async (t) => {
    const el = await element(BankTabRoute(tab(t)));
    expect(el.type).toBe(Welcome);
    expect(el.props).toMatchObject({ tab: t });
  });

  it('sends the artists tab to /bank, its one URL', async () => {
    await expect(BankTabRoute(tab('artists'))).rejects.toThrow('NEXT_REDIRECT /bank');
    expect(permanentRedirect).toHaveBeenCalledWith('/bank');
  });

  it('404s a tab the databank does not have', async () => {
    await expect(BankTabRoute(tab('synths'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('titles the tab, and an unknown one plainly', async () => {
    expect((await tabMetadata(tab('makers'))).title).toBe('Innovators · Databank');
    expect((await tabMetadata(tab('<b>x</b>'))).title).toBe('Databank');
  });
});

describe('/bank/[tab]/[id]', () => {
  it.each([
    ['artists', 'kraftwerk', ArtistPage],
    ['makers', 'robert-moog', MakerPage],
    ['songs', 'donna-summer-i-feel-love', SongPage],
    ['instruments', 'moog-minimoog', InstrumentPage],
  ])('renders %s/%s with its page', async (t, id, Page) => {
    const el = await element(BankRowRoute(row(t, id)));
    expect(el.type).toBe(Page);
    expect(el.props.names).toBe(names);
  });

  it.each([
    ['artists', 'no-such-artist'],
    ['instruments', 'kraftwerk'],
    ['synths', 'model-d'],
  ])('404s %s/%s', async (t, id) => {
    await expect(BankRowRoute(row(t, id))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('titles and describes a row from what the databank says about it', async () => {
    const kraftwerk = bank.artists.find((a) => a.id === 'kraftwerk');
    expect(await rowMetadata(row('artists', 'kraftwerk'))).toEqual({
      title: 'Kraftwerk · Databank',
      description: kraftwerk?.summary,
    });
  });

  it('titles a row it does not have plainly, and does not echo the id', async () => {
    expect(await rowMetadata(row('artists', '<b>x</b>'))).toEqual({ title: 'Databank' });
    expect(await rowMetadata(row('nope', 'kraftwerk'))).toEqual({ title: 'Databank' });
  });
});
