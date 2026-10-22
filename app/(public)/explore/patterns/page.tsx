import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/synth/synth.css';

import type { Metadata } from 'next';
import Link from 'next/link';

import { ExploreTabs } from '@/components/app/sharing/explore-tabs';
import { PatternCards } from '@/components/app/sharing/pattern-cards';
import { EXPLORE_PAGE_SIZE, type ExploreSort } from '@/lib/app/sounds/data';
import { PatternExploreQuerySchema, type PatternExploreQuery } from '@/lib/app/patterns/data';
import { listPublishedPatterns } from '@/lib/app/patterns/public';
import { BRAND } from '@/lib/brand';

/**
 * `/explore/patterns`: the patterns people have published (`f-step-sequencer` t-83), newest or most saved first.
 *
 * In-process, from the read `GET /api/v1/public/patterns` serves. No synth filter: a pattern plays on any synth, and
 * the one it was made on says only where its page starts. The sort is a plain GET form, so the page needs no script.
 */

export const metadata: Metadata = {
  title: 'Explore patterns',
  description: `Patterns people made in ${BRAND.name}'s sequencer and published. Play any of them on any synth, and save a copy to change.`,
  alternates: { canonical: '/explore/patterns' },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORT_LABELS: Record<ExploreSort, string> = { newest: 'Newest', saves: 'Most saved' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** This page with `query`, leaving out what is the default. */
function patternsHref(query: PatternExploreQuery): string {
  const q = new URLSearchParams();
  if (query.sort !== 'newest') q.set('sort', query.sort);
  if (query.page > 1) q.set('page', String(query.page));
  const s = q.toString();
  return s ? `/explore/patterns?${s}` : '/explore/patterns';
}

export default async function ExplorePatternsRoute({ searchParams }: Props) {
  const raw = await searchParams;
  const query = PatternExploreQuerySchema.parse({ sort: one(raw.sort), page: one(raw.page) });
  const { patterns, total } = await listPublishedPatterns(query);
  const pages = Math.max(1, Math.ceil(total / EXPLORE_PAGE_SIZE));

  const select =
    'h-9 rounded-md border border-(--kys-line) bg-(--kys-surface) px-2 text-sm text-(--kys-text)';
  return (
    <article className="mx-auto w-full max-w-[960px] px-4 py-8 text-(--kys-text) sm:px-6">
      <header className="border-b border-(--kys-line) pb-5">
        <p className="kys-label text-(--kys-accent)">Explore</p>
        <h1 className="kys-display mt-1 text-[24px] leading-tight">Published patterns</h1>
        <p className="mt-2 text-[15px] text-(--kys-muted)">
          Riffs and sequences people made in the sequencer. Open one to play it on the synth it was
          made on, or any other; signed in, you can save a copy to change.
        </p>
        <ExploreTabs current="patterns" />
      </header>

      <form method="get" action="/explore/patterns" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="kys-label text-[11px] text-(--kys-muted)">Sort</span>
          <select name="sort" defaultValue={query.sort} className={select}>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-(--kys-accent) px-3 text-sm font-semibold text-(--kys-accent) hover:bg-(--kys-accent) hover:text-(--kys-surface)"
        >
          Show
        </button>
      </form>

      <section className="mt-6" aria-label="Patterns">
        {patterns.length === 0 ? (
          <p className="text-[15px] text-(--kys-muted)">
            {query.page > pages ? (
              <>
                There aren&apos;t that many pages.{' '}
                <Link
                  href={patternsHref({ ...query, page: 1 })}
                  className="underline hover:text-(--kys-accent)"
                >
                  Back to the first page
                </Link>
                .
              </>
            ) : (
              <>
                Nobody has published a pattern yet. Open a{' '}
                <Link href="/synths" className="underline hover:text-(--kys-accent)">
                  synth
                </Link>
                , open its sequencer, save a pattern to My patterns, and publish it from there.
              </>
            )}
          </p>
        ) : (
          <PatternCards patterns={patterns} />
        )}
      </section>

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pages">
          {query.page > 1 ? (
            <Link
              href={patternsHref({ ...query, page: Math.min(query.page - 1, pages) })}
              className="hover:text-(--kys-accent)"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-(--kys-muted)">
            Page {Math.min(query.page, pages)} of {pages}
          </span>
          {query.page < pages ? (
            <Link
              href={patternsHref({ ...query, page: query.page + 1 })}
              className="hover:text-(--kys-accent)"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </article>
  );
}
