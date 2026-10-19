/**
 * Where a tutor answer came from, under the answer (`f-tutor-knowledge` t-60): the databank rows the turn's searches
 * found, each linking to its `/bank` page, and the web pages, each linking out. An answer whose turn found neither is
 * labelled as the tutor's own knowledge, which the instructions also have it say in the answer. Every source is listed:
 * a turn's searches return at most six databank rows and five web results each.
 *
 * The sources are what the searches found, not a claim about which of them the answer used: the model is told to keep
 * each claim to what its source says, and the learner can follow any of them to check.
 */

import Link from 'next/link';

import { tabLabel } from '@/components/app/bank/routes';
import type { TutorSource } from '@/lib/app/tutor/sources';

export const OWN_KNOWLEDGE = "From the tutor's own knowledge.";

/** A web page's site, as a reader picks it out: its host without `www.`. */
const siteOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export function TutorSources({ sources }: { sources: TutorSource[] }) {
  if (!sources.length)
    return <p className="mt-2 text-[12.5px] text-(--kys-faint)">{OWN_KNOWLEDGE}</p>;
  return (
    <div className="mt-2 border-t border-(--kys-line) pt-2">
      <p className="kys-label text-(--kys-faint)">Sources</p>
      <ul aria-label="Sources" className="mt-1 flex flex-col gap-1 text-[13px]">
        {sources.map((s) =>
          s.type === 'databank' ? (
            <li key={s.href}>
              <Link href={s.href} className="text-(--kys-accent) underline underline-offset-2">
                {s.name}
              </Link>{' '}
              <span className="text-(--kys-faint)">
                · databank, {tabLabel(s.kind).toLowerCase()}
              </span>
            </li>
          ) : (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-(--kys-accent) underline underline-offset-2"
              >
                {s.title}
              </a>{' '}
              <span className="text-(--kys-faint)">· {siteOf(s.url)}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
