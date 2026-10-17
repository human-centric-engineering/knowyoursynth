import Link from 'next/link';

import { bankHref } from '@/components/app/bank/routes';
import { LINK_LABELS } from '@/lib/app/profile/links';
import type { PublicProfile, PublicSynth } from '@/lib/app/profile/public';

/**
 * A user's public profile (`/u/[username]`, `f-profiles` r3): their username, where their music is, and the synths they
 * own and want where they show them. Each synth opens its databank page.
 *
 * Only the {@link PublicProfile} reaches it, so it has nothing private to show. Styled as the databank's pages are,
 * on the consumer surface's `--kys-*` roles.
 */
export function PublicProfileView({ profile }: { profile: PublicProfile }) {
  const { username, links, owned, wishlist } = profile;
  const empty = links.length === 0 && !owned && !wishlist;
  return (
    <article className="mx-auto w-full max-w-[960px] px-4 py-8 text-(--kys-text) sm:px-6">
      <header className="border-b border-(--kys-line) pb-5">
        <p className="kys-label text-(--kys-accent)">Synth profile</p>
        <h1 className="kys-display mt-1 text-[24px] leading-tight break-words">{username}</h1>
        {links.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Where their music is">
            {links.map((l) => (
              <li key={l.platform}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-baseline gap-1.5 rounded-md border border-(--kys-line) px-2.5 py-1 text-sm hover:border-(--kys-accent) hover:text-(--kys-accent)"
                >
                  <span className="kys-label text-[11px] text-(--kys-muted)">
                    {LINK_LABELS[l.platform]}
                  </span>
                  <span className="break-all">{l.display}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>
      {owned && <SynthList title="Synths they own" synths={owned} />}
      {wishlist && <SynthList title="On their wishlist" synths={wishlist} />}
      {empty && <p className="mt-6 text-[15px] text-(--kys-muted)">Nothing else here yet.</p>}
    </article>
  );
}

function SynthList({ title, synths }: { title: string; synths: PublicSynth[] }) {
  return (
    <section className="mt-6">
      <h2 className="kys-label mb-2 text-(--kys-muted)">
        {title} {synths.length > 0 && `(${synths.length})`}
      </h2>
      {synths.length === 0 ? (
        <p className="text-[15px] text-(--kys-muted)">None listed yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {synths.map((s) => (
            <li key={s.instrumentId}>
              <Link
                href={bankHref('instruments', s.instrumentId)}
                className="block h-full rounded-md border border-(--kys-line) bg-(--kys-surface) px-3 py-2 hover:border-(--kys-accent)"
              >
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-[13px] text-(--kys-muted)">
                  {[s.maker, s.year].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
