import Link from 'next/link';

import { sharedSoundHref } from '@/components/app/synth/routes';
import { Byline } from '@/components/app/sharing/byline';
import type { PublishedSoundCard } from '@/lib/app/sounds/data';

/**
 * Published sounds as cards (`f-sharing` h2): what Explore and a profile list. Each opens the sound's page; the byline
 * links to its author's profile only when that shows anything. The sound's name is the link rather than the whole
 * card, so the byline's link is not nested inside it.
 */
export function SoundCards({
  sounds,
  showAuthor = true,
}: {
  sounds: PublishedSoundCard[];
  /** False on the author's own profile, where every card would name them. */
  showAuthor?: boolean;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sounds.map((s) => (
        <li
          key={s.slug}
          className="flex h-full flex-col gap-1 rounded-md border border-(--kys-line) bg-(--kys-surface) px-3 py-2 hover:border-(--kys-accent)"
        >
          <Link
            href={sharedSoundHref(s.synthId, s.slug)}
            className="font-semibold break-words hover:text-(--kys-accent)"
          >
            {s.name}
          </Link>
          <span className="text-[13px] text-(--kys-muted)">
            {s.synthName}
            {showAuthor && (
              <>
                {' · '}
                <Byline author={s.author} authorProfile={s.authorProfile} />
              </>
            )}
          </span>
          {(s.tags.length > 0 || s.saves > 0) && (
            <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[12px] text-(--kys-muted)">
              {s.tags.map((t) => (
                <span key={t} className="rounded border border-(--kys-line) px-1.5">
                  {t}
                </span>
              ))}
              {s.saves > 0 && <span>{s.saves === 1 ? '1 save' : `${s.saves} saves`}</span>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
