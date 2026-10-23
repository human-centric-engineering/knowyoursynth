import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/synth/synth.css';

import type { Metadata } from 'next';
import Link from 'next/link';

import { ExploreTabs } from '@/components/app/sharing/explore-tabs';
import { SoundCards } from '@/components/app/sharing/sound-cards';
import { listSynths } from '@/lib/app/catalogue/read';
import {
  EXPLORE_PAGE_SIZE,
  ExploreQuerySchema,
  type ExploreQuery,
  type ExploreSort,
} from '@/lib/app/sounds/data';
import { exploreTags, listPublishedSounds } from '@/lib/app/sounds/public';
import { BRAND } from '@/lib/brand';

/**
 * `/explore`: the sounds people have published (`f-sharing` h2), filtered by synth and tag, newest or most saved first.
 *
 * In-process, from the read `GET /api/v1/public/sounds` serves, as the profile page reads its own. The filters are a
 * plain GET form, so the page works before (or without) any script, and every view of it is a link. A filter that does
 * not parse, or names a synth or tag nothing uses, is dropped: the page shows what it did use.
 */

export const metadata: Metadata = {
  title: 'Explore patches',
  description: `Patches people made on ${BRAND.name}'s synths and published. Play any of them, and save a copy to change.`,
  alternates: { canonical: '/explore' },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORT_LABELS: Record<ExploreSort, string> = { newest: 'Newest', saves: 'Most saved' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** This page with `query`, leaving out what is the default so a plain `/explore` stays plain. */
function exploreHref(query: ExploreQuery): string {
  const q = new URLSearchParams();
  if (query.synth) q.set('synth', query.synth);
  if (query.tag) q.set('tag', query.tag);
  if (query.sort !== 'newest') q.set('sort', query.sort);
  if (query.page > 1) q.set('page', String(query.page));
  const s = q.toString();
  return s ? `/explore?${s}` : '/explore';
}

export default async function ExploreRoute({ searchParams }: Props) {
  const raw = await searchParams;
  const query = ExploreQuerySchema.parse({
    synth: one(raw.synth),
    tag: one(raw.tag),
    sort: one(raw.sort),
    page: one(raw.page),
  });
  const [{ sounds, total, applied }, synths] = await Promise.all([
    listPublishedSounds(query),
    listSynths(),
  ]);
  const tags = await exploreTags(applied.synth);
  const pages = Math.max(1, Math.ceil(total / EXPLORE_PAGE_SIZE));
  const filtered = applied.synth !== undefined || applied.tag !== undefined;

  const select =
    'h-9 rounded-md border border-(--kys-line) bg-(--kys-surface) px-2 text-sm text-(--kys-text)';
  return (
    <article className="mx-auto w-full max-w-[960px] px-4 py-8 text-(--kys-text) sm:px-6">
      <header className="border-b border-(--kys-line) pb-5">
        <p className="kys-label text-(--kys-accent)">Explore</p>
        <h1 className="kys-display mt-1 text-[24px] leading-tight">Published patches</h1>
        <p className="mt-2 text-[15px] text-(--kys-muted)">
          Patches people made on these synths. Open one to play it; signed in, you can save a copy
          to change.
        </p>
        <ExploreTabs current="sounds" />
      </header>

      <form method="get" action="/explore" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="kys-label text-[11px] text-(--kys-muted)">Synth</span>
          <select name="synth" defaultValue={applied.synth ?? ''} className={select}>
            <option value="">Every synth</option>
            {synths.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="kys-label text-[11px] text-(--kys-muted)">Tag</span>
          <select name="tag" defaultValue={applied.tag ?? ''} className={select}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="kys-label text-[11px] text-(--kys-muted)">Sort</span>
          <select name="sort" defaultValue={applied.sort} className={select}>
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
        {filtered && (
          <Link
            href={exploreHref({ ...applied, synth: undefined, tag: undefined, page: 1 })}
            className="self-center text-sm text-(--kys-muted) underline hover:text-(--kys-accent)"
          >
            Clear filters
          </Link>
        )}
      </form>

      <section className="mt-6" aria-label="Patches">
        {sounds.length === 0 ? (
          <p className="text-[15px] text-(--kys-muted)">
            {applied.page > pages ? (
              <>
                There aren&apos;t that many pages.{' '}
                <Link
                  href={exploreHref({ ...applied, page: 1 })}
                  className="underline hover:text-(--kys-accent)"
                >
                  Back to the first page
                </Link>
                .
              </>
            ) : filtered ? (
              'No published patch matches these filters. Take one away, or try another synth.'
            ) : (
              <>
                Nobody has published a patch yet. Open a{' '}
                <Link href="/synths" className="underline hover:text-(--kys-accent)">
                  synth
                </Link>
                , make something you like, save it, and publish it from its sharing options.
              </>
            )}
          </p>
        ) : (
          <SoundCards sounds={sounds} />
        )}
      </section>

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pages">
          {applied.page > 1 ? (
            <Link
              href={exploreHref({ ...applied, page: Math.min(applied.page - 1, pages) })}
              className="hover:text-(--kys-accent)"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-(--kys-muted)">
            Page {Math.min(applied.page, pages)} of {pages}
          </span>
          {applied.page < pages ? (
            <Link
              href={exploreHref({ ...applied, page: applied.page + 1 })}
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
