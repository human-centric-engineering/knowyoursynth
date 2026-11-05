'use client';

/**
 * LinksSection — a synth's or databank instrument's videos and links, under its panel and on its `/bank` page
 * (`f-videos-and-links` t-182).
 *
 * Closed, it says how many there are and of which kinds, from the page's own data (`LinkSummary`). The list is read
 * from `GET /api/v1/links` the first time it is opened, not before: the order is a fresh draw on each read, and a
 * visitor who never opens it costs nothing. Closing and opening again keeps that list. Ours come first, as the API
 * orders them; each card says its kind. Nothing is shown for a target with none.
 */

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { LinkCard } from '@/components/app/links/link-card';
import {
  LINKS_API,
  readPublicLinks,
  teaser,
  type LinksTarget,
  type PublicLinkView,
} from '@/components/app/links/data';
import { apiClient } from '@/lib/api/client';
import type { LinkSummary } from '@/lib/app/links/read';

export interface LinksSectionProps {
  target: LinksTarget;
  id: string;
  summary: LinkSummary;
  className?: string;
}

type Load = { state: 'idle' | 'loading' | 'failed' } | { state: 'ready'; links: PublicLinkView[] };

export function LinksSection({ target, id, summary, className = '' }: LinksSectionProps) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const bodyId = useId();

  if (summary.count === 0) return null;

  const read = async () => {
    setLoad({ state: 'loading' });
    try {
      const data = await apiClient.get<unknown>(LINKS_API, { params: { [target]: id } });
      setLoad({ state: 'ready', links: readPublicLinks(data) });
    } catch {
      setLoad({ state: 'failed' });
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && load.state === 'idle') void read();
  };

  return (
    <section aria-label="Videos and links" className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-4 py-3 text-left hover:border-(--kys-accent) focus-visible:outline-2 focus-visible:outline-(--kys-accent)"
      >
        <span className="min-w-0">
          <span className="block font-semibold">Videos and links</span>
          <span className="block text-sm text-(--kys-muted)">{teaser(summary)}</span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-(--kys-muted) transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={bodyId} hidden={!open} className="pt-4">
        {load.state === 'loading' && (
          <p role="status" className="text-sm text-(--kys-muted)">
            Loading…
          </p>
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
            <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {load.links.map((link) => (
                <LinkCard key={link.id} link={link} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-(--kys-muted)">There are none to show now.</p>
          ))}
      </div>
    </section>
  );
}
