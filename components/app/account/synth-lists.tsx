'use client';

import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState } from 'react';

import { InstrumentPicker } from '@/components/app/account/instrument-picker';
import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { APIClientError, apiClient } from '@/lib/api/client';
import {
  OWNED_KINDS,
  OwnedEntrySchema,
  OwnedListsSchema,
  type OwnedEntry,
  type OwnedKind,
  type OwnedLists,
} from '@/lib/app/profile/instruments-data';

const HEADINGS: Record<OwnedKind, string> = { owned: 'Synths I own', wishlist: 'My wishlist' };
const EMPTY: Record<OwnedKind, string> = {
  owned: 'None yet. Search above and choose “I own it”.',
  wishlist: 'None yet. Search above and choose “I want it”.',
};
const MOVE_TO: Record<OwnedKind, { kind: OwnedKind; label: string }> = {
  owned: { kind: 'wishlist', label: 'Move to wishlist' },
  wishlist: { kind: 'owned', label: 'I own it now' },
};

const without = (list: OwnedEntry[], id: string) => list.filter((e) => e.instrumentId !== id);

/**
 * The synths a user owns and the ones they want (`f-profiles` r2): a search of the databank to add one, then each list
 * in the user's order, to reorder, move between the two, or remove from.
 *
 * Every change waits for the API's answer before it shows. A list that changed elsewhere (another tab) comes back as a
 * 409 on reorder; on any refusal the lists are read again so the next try starts from what is stored.
 */
export function SynthLists({ initial }: { initial: OwnedLists }) {
  const [lists, setLists] = useState<OwnedLists>(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const listed = new Map<string, OwnedKind>(
    OWNED_KINDS.flatMap((kind) => lists[kind].map((e) => [e.instrumentId, kind] as const))
  );

  async function refresh() {
    const parsed = OwnedListsSchema.safeParse(await apiClient.get('/api/v1/me/instruments'));
    if (parsed.success) setLists(parsed.data);
  }

  /** Run one change, showing the API's refusal if it has one. */
  async function change(run: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await run();
    } catch (err) {
      setProblem(err instanceof APIClientError ? err.message : "That didn't save. Try again.");
      // Refused, the lists may have changed elsewhere (another tab, or the databank): read them again.
      if (err instanceof APIClientError) await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const add = (instrumentId: string, kind: OwnedKind) =>
    change(async () => {
      const entry = OwnedEntrySchema.parse(
        await apiClient.post('/api/v1/me/instruments', { body: { instrumentId, kind } })
      );
      setLists((prev) => ({
        ...prev,
        [kind]: [...without(prev[kind], entry.instrumentId), entry],
      }));
      // An instrument added in another tab comes back as the entry already stored, wherever it is in the list; read
      // the lists so the order shown is the stored one.
      await refresh().catch(() => undefined);
    });

  const move = (entry: OwnedEntry, kind: OwnedKind) =>
    change(async () => {
      const moved = OwnedEntrySchema.parse(
        await apiClient.patch(`/api/v1/me/instruments/${encodeURIComponent(entry.instrumentId)}`, {
          body: { kind },
        })
      );
      setLists((prev) => ({
        ...prev,
        [entry.kind]: without(prev[entry.kind], entry.instrumentId),
        [kind]: [...without(prev[kind], entry.instrumentId), moved],
      }));
    });

  const remove = (entry: OwnedEntry) =>
    change(async () => {
      await apiClient.delete(`/api/v1/me/instruments/${encodeURIComponent(entry.instrumentId)}`);
      setLists((prev) => ({
        ...prev,
        [entry.kind]: without(prev[entry.kind], entry.instrumentId),
      }));
    });

  const shift = (kind: OwnedKind, index: number, by: -1 | 1) =>
    change(async () => {
      const ids = lists[kind].map((e) => e.instrumentId);
      [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
      setLists(
        OwnedListsSchema.parse(
          await apiClient.put('/api/v1/me/instruments/order', {
            body: { kind, instrumentIds: ids },
          })
        )
      );
    });

  return (
    <div className="space-y-6">
      <InstrumentPicker listed={listed} onAdd={add} disabled={busy} />

      {problem ? <FormError message={problem} /> : null}

      {OWNED_KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`synth-list-${kind}`} className="space-y-2">
          <h3 id={`synth-list-${kind}`} className="text-sm font-medium">
            {HEADINGS[kind]}
          </h3>
          {lists[kind].length === 0 ? (
            <p className="text-muted-foreground text-sm">{EMPTY[kind]}</p>
          ) : (
            <ol className="divide-border divide-y rounded-md border">
              {lists[kind].map((entry, index) => (
                <li
                  key={entry.instrumentId}
                  className="flex flex-wrap items-center justify-between gap-2 p-2"
                >
                  <span className="text-sm">
                    {entry.name}{' '}
                    <span className="text-muted-foreground">
                      · {entry.maker} · {entry.year}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy || index === 0}
                      aria-label={`Move ${entry.name} up`}
                      onClick={() => void shift(kind, index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy || index === lists[kind].length - 1}
                      aria-label={`Move ${entry.name} down`}
                      onClick={() => void shift(kind, index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`${MOVE_TO[kind].label}: ${entry.name}`}
                      onClick={() => void move(entry, MOVE_TO[kind].kind)}
                    >
                      {MOVE_TO[kind].label}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => void remove(entry)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
