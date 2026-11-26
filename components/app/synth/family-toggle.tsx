'use client';

/**
 * The version toggle by the player's caption (`f-synth-families` t-320): one segment per modelled member of the open
 * synth's family, the TD-3 and the TB-303 side by side. Choosing one asks the page to switch to it, which carries the
 * panel across (`family-carry.ts`). Once there, `CarriedNote` says what did not carry, and what carried but not as it was.
 *
 * Shown only on a synth with a family. Members nobody has modelled are left out until they have a blank panel of their
 * own (t-321). See `.context/app/synth-families.md`.
 */

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { SynthFamily } from '@/lib/app/families/read';
import { OwnedListsSchema } from '@/lib/app/profile/instruments-data';
import type { Changed, Dropped } from '@/lib/app/synths/families/translate';

const NONE: ReadonlySet<string> = new Set();

/**
 * The databank instruments the signed-in user owns, by id (`GET /api/v1/me/instruments`): what a family in the picker
 * opens on. None while signed out, still loading, or if the read fails: the family's default is then the answer.
 */
export function useOwnedInstruments(userId: string | null): ReadonlySet<string> {
  const [owned, setOwned] = useState<{ userId: string; ids: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    apiClient
      .get<unknown>('/api/v1/me/instruments')
      .then((raw) => {
        const lists = OwnedListsSchema.safeParse(raw);
        if (live && lists.success)
          setOwned({ userId, ids: new Set(lists.data.owned.map((e) => e.instrumentId)) });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);
  return owned && owned.userId === userId ? owned.ids : NONE;
}

/** What the page carried in from another member, for the note. */
export interface CarryNote {
  fromName: string;
  dropped: readonly Dropped[];
  changed: readonly Changed[];
}

/** Past this many, the reasons fold away under a count. */
const OPEN_REASONS = 3;

export interface FamilyToggleProps {
  family: SynthFamily;
  synthId: string;
  /** The synth ids the catalogue serves: a member whose synth it does not is left out. */
  offered: ReadonlySet<string>;
  onSwitch: (synthId: string) => void;
}

export function FamilyToggle({ family, synthId, offered, onSwitch }: FamilyToggleProps) {
  const members = family.members.filter((m) => m.synthId && offered.has(m.synthId));
  if (members.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={`${family.name} versions`}
      className="inline-flex w-fit rounded-lg border border-(--kys-line) bg-(--kys-surface) p-0.5"
    >
      {members.map((m) => {
        const on = m.synthId === synthId;
        return (
          <button
            key={m.slug}
            type="button"
            aria-pressed={on}
            title={`${m.instrument.maker} ${m.instrument.name}, ${m.instrument.year}`}
            onClick={() => {
              if (!on && m.synthId) onSwitch(m.synthId);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${on ? 'bg-(--kys-accent) text-(--kys-accent-ink)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** What came across from the member switched from: said once, under the patch's name, until it is dismissed. */
export function CarriedNote({ note, onDismiss }: { note: CarryNote; onDismiss?: () => void }) {
  const reasons = [
    ...note.dropped.map((d) => d.reason),
    ...note.changed.map((c) => c.reason),
  ].filter((r, i, all) => all.indexOf(r) === i);
  const list = (
    <ul className="mt-0.5 list-disc pl-4">
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
  return (
    <div role="status" className="max-w-[60ch] text-[13px] leading-snug text-(--kys-muted)">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span>
          Panel carried over from the {note.fromName}
          {reasons.length ? '. What did not come across as it was:' : ', all of it.'}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-(--kys-faint) underline underline-offset-2 hover:text-(--kys-text)"
          >
            Dismiss
          </button>
        )}
      </p>
      {reasons.length > OPEN_REASONS ? (
        <details>
          <summary className="cursor-pointer">{reasons.length} settings</summary>
          {list}
        </details>
      ) : (
        reasons.length > 0 && list
      )}
    </div>
  );
}
