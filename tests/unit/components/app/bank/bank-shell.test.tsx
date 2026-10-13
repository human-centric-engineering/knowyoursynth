// @vitest-environment happy-dom

/**
 * The databank's frame: tabs, search, era filter, the list beside the page, and "‹ Back".
 *
 * @see components/app/bank/bank-shell.tsx
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BankShell } from '@/components/app/bank/bank-shell';
import { browseLists } from '@/components/app/bank/lists';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const nav = vi.hoisted(() => ({
  segments: [] as string[],
  pathname: '/bank',
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => nav.pathname,
  useSelectedLayoutSegments: () => nav.segments,
}));

const bank = loadBankData();
const lists = browseLists(bank, new Set());

function at(path: string) {
  nav.pathname = path;
  nav.segments = path.split('/').slice(2).filter(Boolean);
}

function setup(path = '/bank') {
  at(path);
  const utils = render(
    <BankShell lists={lists}>
      <p>the page</p>
    </BankShell>
  );
  return {
    ...utils,
    goTo: (next: string) => {
      at(next);
      utils.rerender(
        <BankShell lists={lists}>
          <p>the page</p>
        </BankShell>
      );
    },
  };
}

const tabLink = (name: RegExp) =>
  within(screen.getByRole('navigation', { name: 'Databank' })).getByRole('link', { name });
const listNav = () => screen.getByRole('navigation', { name: / list$/ });
const find = () => screen.getByRole('searchbox');

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('BankShell', () => {
  it('opens on the artists tab, every artist listed and the tabs counting their rows', () => {
    setup();
    expect(tabLink(/^Artists/).getAttribute('aria-current')).toBe('page');
    expect(tabLink(/^Artists/).textContent).toBe(`Artists${bank.artists.length}`);
    expect(tabLink(/^Records/).textContent).toBe(`Records${bank.songs.length}`);
    expect(tabLink(/^Innovators/).getAttribute('href')).toBe('/bank/makers');
    expect(within(listNav()).getAllByRole('link')).toHaveLength(bank.artists.length);
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it("lists the open tab's rows, each linking to its page", () => {
    setup('/bank/instruments');
    expect(listNav().getAttribute('aria-label')).toBe('Instruments list');
    const links = within(listNav()).getAllByRole('link');
    expect(links).toHaveLength(bank.instruments.length);
    expect(links[0].getAttribute('href')).toBe(`/bank/instruments/${lists.instruments[0].id}`);
  });

  it('searches every tab at once, and the counts follow', () => {
    setup();
    fireEvent.change(find(), { target: { value: 'KRAFTWERK' } });
    const rows = within(listNav()).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toContain('/bank/artists/kraftwerk');
    const expected = lists.songs.filter((r) => r.words.includes('kraftwerk')).length;
    expect(expected).toBeGreaterThan(0);
    expect(tabLink(/^Records/).textContent).toBe(`Records${expected}`);
  });

  it('says so when nothing matches', () => {
    setup();
    fireEvent.change(find(), { target: { value: 'zzqqxx' } });
    expect(screen.getByText('Nothing matches “zzqqxx”.')).toBeTruthy();
    expect(tabLink(/^Artists/).textContent).toBe('Artists0');
  });

  it('keeps the search when moving to another page', () => {
    const { goTo } = setup();
    fireEvent.change(find(), { target: { value: 'moog' } });
    goTo('/bank/makers');
    expect((find() as HTMLInputElement).value).toBe('moog');
  });

  it('narrows the artists to one era, filed under it', () => {
    setup();
    const eras = within(screen.getByRole('group', { name: 'Era' })).getAllByRole('button');
    expect(eras[0].textContent).toBe('All');
    expect(eras[0].getAttribute('aria-pressed')).toBe('true');
    const era = eras[1].textContent ?? '';
    fireEvent.click(eras[1]);
    expect(eras[1].getAttribute('aria-pressed')).toBe('true');
    const expected = lists.artists.filter((a) => a.eras?.includes(era));
    expect(within(listNav()).getAllByRole('link')).toHaveLength(expected.length);
    expect(within(listNav()).getAllByText(era)).toHaveLength(2); // the button and the one heading
  });

  it('marks the open row, and hides the list below the wide layout', () => {
    setup('/bank/artists/kraftwerk');
    const row = within(listNav()).getByRole('link', { name: /^Kraftwerk/ });
    expect(row.getAttribute('aria-current')).toBe('page');
    expect(listNav().className).toContain('hidden');
  });

  it('goes back through the databank pages visited, else to the tab', () => {
    const { goTo } = setup('/bank/artists/kraftwerk');
    fireEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(nav.push).toHaveBeenCalledWith('/bank');
    expect(nav.back).not.toHaveBeenCalled();

    goTo('/bank/songs/donna-summer-i-feel-love');
    fireEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(nav.back).toHaveBeenCalledTimes(1);
  });

  it('has no Back on a tab', () => {
    setup('/bank/songs');
    expect(screen.queryByRole('button', { name: '‹ Back' })).toBeNull();
  });

  it('follows a prototype link that landed on /bank', () => {
    window.location.hash = '#bank/makers/robert-moog';
    setup();
    expect(nav.replace).toHaveBeenCalledWith('/bank/makers/robert-moog');
  });
});
