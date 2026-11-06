'use client';

/**
 * LinksToggle — a library patch's or a record's videos and links, behind one button (`f-videos-and-links` t-183).
 *
 * The section under the panel is a frame of its own; this sits inside something else: the lesson's overview, a row of
 * History → Heard on. The button says how many there are, from the page's own data (`LinkSummary`). Pressed, the list
 * is read from `GET /api/v1/links`, once (the order is a fresh draw on each read, so closing and opening again keeps
 * it), and the cards open under it: `LinkCard`'s, click to embed. It reads on the press rather than when drawn, so a
 * Heard on list of many records makes no request until one is asked for.
 *
 * Under the cards, **Suggest a link** (`f-link-suggestions` t-186) for whatever `suggest` names. A target with no links
 * shows only that, so the first one can be suggested; with nothing to suggest for either, nothing is shown.
 */

import { useId, useState } from 'react';
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

export interface LinksToggleProps {
  target: LinksTarget;
  id: string;
  /** Its links, counted; absent or none, only the suggestion is drawn, if there is one. */
  summary: LinkSummary | undefined;
  /** What a link suggested here is about: the target itself. */
  suggest?: readonly SuggestTarget[];
  /** What the button says before the count: "Watch and listen". */
  label: string;
  /** Told when it opens and closes, for a container that makes room for the cards. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

type Load = { state: 'idle' | 'loading' | 'failed' } | { state: 'ready'; links: PublicLinkView[] };

export function LinksToggle({
  target,
  id,
  summary,
  label,
  suggest = [],
  onOpenChange,
  className = '',
}: LinksToggleProps) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const bodyId = useId();

  if (!summary?.count)
    return <SuggestLink targets={suggest} onOpenChange={onOpenChange} className={className} />;

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
    onOpenChange?.(next);
    if (next && load.state === 'idle') void read();
  };

  const kinds = kindsOf(summary);

  return (
    <div className={`kys-links-toggle ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className="kys-links-toggle-btn"
      >
        <span className={`kys-led shrink-0 ${open ? 'is-lit' : ''}`} aria-hidden="true" />
        <span className="min-w-0">
          {label}
          {kinds && <span className="kys-links-toggle-kinds"> · {kinds}</span>}
        </span>
        <span className="kys-links-toggle-count">{summary.count}</span>
        <ChevronDown size={14} aria-hidden="true" className="kys-links-toggle-chev" />
      </button>
      <div id={bodyId} hidden={!open} className="mt-3">
        {load.state === 'loading' && (
          <div role="status" className="kys-links-grid">
            <span className="sr-only">Loading…</span>
            {Array.from({ length: Math.min(summary.count, 2) }, (_, i) => (
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
        <SuggestLink targets={suggest} className="mt-3" />
      </div>
    </div>
  );
}
