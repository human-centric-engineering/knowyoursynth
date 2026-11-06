'use client';

/**
 * LinksSection — a synth's or databank instrument's videos and links, under its panel and on its `/bank` page
 * (`f-videos-and-links` t-182).
 *
 * Its head says how many there are and of which kinds, from the page's own data (`LinkSummary`). Under it, closed, the
 * top of the first row of videos shows through, fading out; the pointer over it shows a little more, and a click
 * (on the head, or on what shows through) opens the whole list. While closed, the cards are `inert`: what shows
 * through is a preview to open, not something to play. The list is read from `GET /api/v1/links` once, when the
 * section is drawn: the order is a fresh draw on each read, so closing and opening again keeps it. Ours come first, as
 * the API orders them; each card says its kind.
 *
 * Under the list, **Suggest a link** (`f-link-suggestions` t-186) for whatever `suggest` names. A target with no links
 * shows only that, so the first one can be suggested; with nothing to suggest for either, nothing is shown.
 */

import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { LinkCard } from '@/components/app/links/link-card';
import { SuggestLink, type SuggestTarget } from '@/components/app/links/suggest-link';
import {
  LINKS_API,
  kindsOf,
  readPublicLinks,
  type LinksTarget,
  type PublicLinkView,
} from '@/components/app/links/data';
import { apiClient } from '@/lib/api/client';
import type { LinkSummary } from '@/lib/app/links/read';

export interface LinksSectionProps {
  target: LinksTarget;
  id: string;
  summary: LinkSummary;
  /** What a link suggested here is about: the target itself, or a synth's databank instruments. */
  suggest?: readonly SuggestTarget[];
  className?: string;
}

type Load = { state: 'loading' | 'failed' } | { state: 'ready'; links: PublicLinkView[] };

export function LinksSection({
  target,
  id,
  summary,
  suggest = [],
  className = '',
}: LinksSectionProps) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const bodyId = useId();
  const none = summary.count === 0;

  const read = async () => {
    setLoad({ state: 'loading' });
    try {
      const data = await apiClient.get<unknown>(LINKS_API, { params: { [target]: id } });
      setLoad({ state: 'ready', links: readPublicLinks(data) });
    } catch {
      setLoad({ state: 'failed' });
    }
  };

  useEffect(() => {
    if (!none) void read();
    // Read once per target: the order is a fresh draw on each read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, id, none]);

  if (none)
    return suggest.length ? (
      <section aria-label="Videos and links" className={className}>
        <SuggestLink targets={suggest} />
      </section>
    ) : null;

  const kinds = kindsOf(summary);

  return (
    <section aria-label="Videos and links" className={`kys-links ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="kys-links-bar"
      >
        <span className={`kys-led shrink-0 ${open ? 'is-lit' : ''}`} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <span className="kys-links-name">Videos and links</span>
          {kinds && <span className="kys-links-kinds min-w-0 truncate">{kinds}</span>}
        </span>
        <span className="kys-links-readout">{summary.count}</span>
        <span className="kys-links-chev" aria-hidden="true">
          <ChevronDown size={16} />
        </span>
      </button>
      {/* Closed, a click on what shows through opens it, as the head does (the head is the way in from the keys). */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
      <div
        className={`kys-links-peek ${open ? 'is-open' : ''}`}
        onClick={open ? undefined : () => setOpen(true)}
      >
        <div id={bodyId} inert={!open} className="kys-links-body">
          {load.state === 'loading' && (
            <div role="status" className="kys-links-grid">
              <span className="sr-only">Loading…</span>
              {Array.from({ length: Math.min(summary.count, 3) }, (_, i) => (
                <div key={i} className="kys-link-ghost" aria-hidden="true" />
              ))}
            </div>
          )}
          {load.state === 'failed' && (
            <p role="alert" className="text-sm text-(--kys-warn)">
              The videos could not be loaded.{' '}
              <button
                type="button"
                onClick={() => void read()}
                className="font-semibold underline hover:text-(--kys-accent)"
              >
                Try again
              </button>
            </p>
          )}
          {load.state === 'ready' &&
            (load.links.length ? (
              <ul className="kys-links-grid">
                {load.links.map((link, i) => (
                  <LinkCard key={link.id} link={link} index={i} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-(--kys-muted)">There are none to show now.</p>
            ))}
          <SuggestLink targets={suggest} className="mt-4" />
        </div>
      </div>
      {!open && (
        <span className="kys-links-more" aria-hidden="true">
          Show all {summary.count}
          <ChevronDown size={13} />
        </span>
      )}
    </section>
  );
}
