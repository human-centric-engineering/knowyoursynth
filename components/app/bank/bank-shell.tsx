'use client';

/**
 * The databank's frame: its tabs, the search, and the list beside whichever page is open.
 *
 * Transliterated from the prototype file `src/ui/Bank.jsx` (D3), where the databank was a dialog over the synth with
 * its route in state. Here each row is a page (`/bank/[tab]/[id]`) and this is the layout around them, so the search
 * and the era picked stay put while the visitor moves from page to page, and the browser's Back walks the trail as
 * the dialog's did. The rows arrive worked out (`components/app/bank/lists.ts`); the page beside them is `children`.
 *
 * Below the `lg` breakpoint the list and the page take turns, as in the prototype: the list on a tab, the page (with
 * "‹ Back") on a row.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSelectedLayoutSegments } from 'next/navigation';
import type { BankKind } from '@/lib/app/bank/read';
import {
  BANK_TABS,
  DEFAULT_TAB,
  bankHashRoute,
  bankHref,
  isBankTab,
  tabLabel,
} from '@/components/app/bank/routes';
import { fold, type BrowseLists, type BrowseRow } from '@/components/app/bank/lists';

export interface BankShellProps {
  lists: BrowseLists;
  children: React.ReactNode;
}

export function BankShell({ lists, children }: BankShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tabSegment, idSegment] = useSelectedLayoutSegments();
  const tab: BankKind = tabSegment && isBankTab(tabSegment) ? tabSegment : DEFAULT_TAB;
  const id = idSegment ?? null;

  const [q, setQ] = useState('');
  const [era, setEra] = useState<string | null>(null);

  // A prototype link that landed on `/bank` itself (`/bank#bank/artists/kraftwerk`).
  useEffect(() => {
    const target = bankHashRoute(window.location.hash);
    if (target) router.replace(target);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  // The pages visited inside the databank, so "‹ Back" knows whether there is one of its own to go back to.
  const trail = useRef<string[]>([]);
  useEffect(() => {
    const t = trail.current;
    if (t[t.length - 2] === pathname) t.pop();
    else if (t[t.length - 1] !== pathname) t.push(pathname);
  }, [pathname]);
  const back = () => {
    if (trail.current.length > 1) router.back();
    else router.push(bankHref(tab));
  };

  const fq = fold(q.trim());
  const matches = useMemo(
    () =>
      Object.fromEntries(
        BANK_TABS.map(([t]) => [t, lists[t].filter((r) => !fq || r.words.includes(fq))])
      ) as Record<BankKind, BrowseRow[]>,
    [lists, fq]
  );
  const eras = useMemo(
    () => [...new Set(lists.artists.flatMap((a) => a.eras ?? []))].sort(),
    [lists.artists]
  );

  // Artists are filed under the first decade they worked in (or the one picked), A–Z inside it.
  const groupOf = (r: BrowseRow) => (tab === 'artists' && era ? era : r.group);
  const list =
    tab !== 'artists'
      ? matches[tab]
      : era
        ? matches.artists.filter((a) => a.eras?.includes(era))
        : [...matches.artists].sort(
            (a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.title.localeCompare(b.title)
          );
  const groups: [string | null, BrowseRow[]][] = [];
  for (const r of list) {
    const g = groupOf(r);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(r);
    else groups.push([g, [r]]);
  }

  return (
    <div className="kys-bank mx-auto flex w-full max-w-[1280px] flex-col px-4 text-(--kys-text) sm:px-6">
      <header className="border-b border-(--kys-line) pt-6">
        <p className="kys-label text-(--kys-accent)">Databank</p>
        <h1 className="kys-display mt-1 text-[19px] leading-tight text-balance">
          Synth artists, their records, and the people who built the instruments
        </h1>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <nav
            aria-label="Databank"
            className="-mb-px flex max-w-full min-w-0 gap-1 overflow-x-auto"
          >
            {BANK_TABS.map(([t, label]) => (
              <Link
                key={t}
                href={bankHref(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`flex shrink-0 items-baseline gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? 'border-(--kys-accent) text-(--kys-text)' : 'border-transparent text-(--kys-muted) hover:text-(--kys-text)'}`}
              >
                {label}
                <span className="font-mono text-xs text-(--kys-faint)">{matches[t].length}</span>
              </Link>
            ))}
          </nav>
          <label className="mb-2 flex min-w-0 flex-1 basis-[220px] items-center gap-2 rounded-md border border-(--kys-line) bg-(--kys-ground) px-2.5 py-1.5 text-sm sm:max-w-[320px]">
            <span className="kys-label text-(--kys-faint)">Find</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="name, song, synth, genre…"
              className="min-w-0 flex-1 bg-transparent text-(--kys-text) outline-none placeholder:text-(--kys-faint)"
            />
          </label>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <nav
          aria-label={`${tabLabel(tab)} list`}
          className={`kys-scroll border-(--kys-line) px-2 py-3 lg:sticky lg:top-0 lg:block lg:max-h-screen lg:overflow-y-auto lg:border-r ${id ? 'hidden' : ''}`}
        >
          {tab === 'artists' && (
            <div className="mb-2 flex flex-wrap gap-1 px-2" role="group" aria-label="Era">
              {[null, ...eras].map((e) => (
                <button
                  key={e ?? 'all'}
                  type="button"
                  aria-pressed={era === e}
                  onClick={() => setEra(e)}
                  className={`rounded px-2 py-0.5 font-mono text-xs ${era === e ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
                >
                  {e ?? 'All'}
                </button>
              ))}
            </div>
          )}
          {!list.length && (
            <p className="px-2 text-sm text-(--kys-faint)">Nothing matches “{q}”.</p>
          )}
          {groups.map(([g, rows]) => (
            <div key={g ?? 'all'} className="mb-2">
              {g && <p className="kys-label px-2 pt-2 pb-1 text-(--kys-faint)">{g}</p>}
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={bankHref(tab, r.id)}
                      aria-current={id === r.id ? 'page' : undefined}
                      className={`block w-full rounded-lg px-2.5 py-1.5 text-left ${id === r.id ? 'bg-(--kys-accent)/12' : 'hover:bg-(--kys-ground)'}`}
                    >
                      <span className="block text-[14px] leading-snug font-semibold">
                        {r.title}
                      </span>
                      <span className="block truncate text-[12.5px] text-(--kys-muted)">
                        {r.sub}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`px-0 py-5 lg:px-6 ${id ? '' : 'hidden lg:block'}`}>
          {id && (
            <button
              type="button"
              onClick={back}
              className="kys-label mb-3 text-(--kys-accent) hover:underline"
            >
              ‹ Back
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
