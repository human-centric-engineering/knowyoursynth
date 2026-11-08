'use client';

/**
 * LinksPanel — one owner's videos and links, on its admin edit page (`f-videos-and-links` t-181): a databank
 * instrument, record or artist, or a library patch.
 *
 * Reads `GET /api/v1/admin/links?<kind>=<id>` once when it mounts, and again after each change. Ours are listed first,
 * in the order the public pages show them, with buttons to move each (`PUT /api/v1/admin/links/order`, sent with the
 * whole new order). The rest follow, newest edit first: the public order is a weighted draw on each visit, so there is
 * no order of theirs to set here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import {
  formatCount,
  LINKS_ADMIN_PATH,
  LINKS_API,
  ownerQuery,
  PROVIDER_LABEL,
  readLinks,
  type AdminLinkView,
} from '@/components/app/admin/links/data';
import { LinkDialog, RemoveLinkButton } from '@/components/app/admin/links/link-dialogs';
import { MoveButtons, move } from '@/components/app/admin/synths/order-controls';
import { SaveError } from '@/components/forms/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import type { OwnerRef } from '@/lib/app/links/owner';
import { useSaveFailure } from '@/lib/hooks/use-save-failure';

/** Ours first by their order (oldest first on a tie), then the rest by newest edit. */
function arrange(links: AdminLinkView[]): { ours: AdminLinkView[]; others: AdminLinkView[] } {
  return {
    ours: links
      .filter((l) => l.ours)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    others: links.filter((l) => !l.ours),
  };
}

/** The API's largest page. */
const PAGE_SIZE = 100;

export interface LinksPanelProps {
  owner: OwnerRef;
}

export function LinksPanel({ owner: given }: LinksPanelProps) {
  const { kind, id } = given;
  const readOnly = useSharedSettingsReadOnly();
  const [links, setLinks] = useState<AdminLinkView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const save = useSaveFailure({ fallback: 'The new order could not be saved.' });
  const [moving, setMoving] = useState(false);

  const owner = useMemo<OwnerRef>(() => ({ kind, id }), [kind, id]);
  /** Which load is newest: an older one that answers late is dropped rather than shown. */
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latestLoad.current;
    try {
      // Every page: a reorder must name each of ours, so the panel needs all of them, not the newest hundred.
      const all: AdminLinkView[] = [];
      for (let page = 1; ; page++) {
        const data = await apiClient.get<unknown>(LINKS_API, {
          params: { ...ownerQuery(owner), page, limit: PAGE_SIZE },
        });
        all.push(...readLinks(data));
        if (!Array.isArray(data) || data.length < PAGE_SIZE) break;
      }
      if (mine !== latestLoad.current) return;
      // Only this owner's: the query asks for no other, and a row about anything else is not shown here.
      setLinks(all.filter((l) => l.owner.kind === kind && l.owner.id === id));
      setLoadFailed(false);
    } catch {
      if (mine === latestLoad.current) setLoadFailed(true);
    }
  }, [owner, kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => {
    save.clear();
    void load();
  };

  const reorder = async (ids: string[], next: AdminLinkView[]) => {
    const previous = links;
    setMoving(true);
    save.clear();
    setLinks(next);
    try {
      await apiClient.put(`${LINKS_API}/order`, { body: { owner, ids } });
    } catch (error) {
      setLinks(previous);
      save.show(
        error instanceof APIClientError ? error.message : 'The new order could not be saved.'
      );
      void load();
    } finally {
      setMoving(false);
    }
  };

  const { ours, others } = arrange(links ?? []);

  const moveOurs = (index: number, by: -1 | 1) => {
    const moved = move(ours, index, by).map((l, i) => ({ ...l, order: i }));
    void reorder(
      moved.map((l) => l.id),
      [...moved, ...others]
    );
  };

  const row = (link: AdminLinkView, index: number | null) => (
    <li key={link.id} className="flex flex-wrap items-center gap-2 py-2">
      {index !== null && (
        <MoveButtons
          label={link.title}
          index={index}
          length={ours.length}
          disabled={readOnly || moving}
          onMove={(by) => moveOurs(index, by)}
        />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
        >
          {link.title}
        </a>
        <p className="text-muted-foreground text-xs">
          {PROVIDER_LABEL[link.provider]} · {link.kind}
          {link.views !== null && ` · ${formatCount(link.views)} views`}
          {link.rating !== null && ` · rated ${link.rating}`}
        </p>
      </div>
      {link.ours && <Badge variant="secondary">Ours</Badge>}
      <LinkDialog
        link={link}
        onSaved={changed}
        trigger={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly}
            aria-label={`Edit ${link.title}`}
          >
            Edit
          </Button>
        }
      />
      <RemoveLinkButton link={link} disabled={readOnly} onRemoved={changed} onError={save.show} />
    </li>
  );

  return (
    <section aria-labelledby="links-panel-title" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="links-panel-title" className="flex items-center gap-1 text-lg font-semibold">
          Videos and links
          <FieldHelp title="Videos and links">
            <p>
              Demos, reviews, lessons and records about this, shown on its public pages. Ours come
              first, in the order set here; the rest follow in a random order that favours the most
              viewed.
            </p>
            <p className="mt-2">
              Every link is on the <a href={LINKS_ADMIN_PATH}>links page</a>. Every change is in the
              audit log.
            </p>
          </FieldHelp>
        </h2>
        <LinkDialog
          link={null}
          owner={owner}
          onSaved={changed}
          trigger={
            <Button type="button" size="sm" disabled={readOnly}>
              Add link
            </Button>
          }
        />
      </div>

      <SaveError failure={save.failure} />

      {loadFailed ? (
        <p role="alert" className="text-destructive text-sm">
          Its links could not be loaded. Reload the page to try again.
        </p>
      ) : links === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground text-sm">No links yet.</p>
      ) : (
        <>
          {ours.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Ours, in order</h3>
              <ul aria-label="Our links" className="divide-y">
                {ours.map((l, i) => row(l, i))}
              </ul>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Others</h3>
              <ul aria-label="Other links" className="divide-y">
                {others.map((l) => row(l, null))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
