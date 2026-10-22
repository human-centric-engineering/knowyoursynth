import Link from 'next/link';

import { patternHref } from '@/components/app/synth/routes';
import { Byline } from '@/components/app/sharing/byline';
import type { PublishedPatternCard } from '@/lib/app/patterns/data';

/**
 * Published patterns as cards (`f-step-sequencer` t-83): what Explore's patterns and a profile list. Each opens the
 * pattern's address, which plays it on the synth it was made on. The name is the link, as on a sound's card, so the
 * byline's link is not nested inside it.
 */
export function PatternCards({
  patterns,
  showAuthor = true,
}: {
  patterns: PublishedPatternCard[];
  /** False on the author's own profile, where every card would name them. */
  showAuthor?: boolean;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {patterns.map((p) => (
        <li
          key={p.slug}
          className="flex h-full flex-col gap-1 rounded-md border border-(--kys-line) bg-(--kys-surface) px-3 py-2 hover:border-(--kys-accent)"
        >
          <Link
            href={patternHref(p.slug)}
            className="font-semibold break-words hover:text-(--kys-accent)"
          >
            {p.name}
          </Link>
          <span className="text-[13px] text-(--kys-muted)">
            {p.synthName ? `Made on the ${p.synthName}` : 'Pattern'}
            {showAuthor && (
              <>
                {' · '}
                <Byline author={p.author} authorProfile={p.authorProfile} />
              </>
            )}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[12px] text-(--kys-muted)">
            {p.steps > 0 && (
              <span>
                {p.steps} steps{p.parts > 1 ? ', A and B' : ''}
              </span>
            )}
            {p.saves > 0 && <span>{p.saves === 1 ? '1 save' : `${p.saves} saves`}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
