'use client';

/**
 * PatternBulkBar — set the rights risk or status of several library patterns at once, with one reason
 * (`f-pattern-library` t-156). The list stays server-rendered: each row has a plain checkbox named
 * {@link PATTERN_PICK}, and this reads the ticked ones when Apply is pressed, so choosing rows costs no client state.
 */

import { useEffect, useState } from 'react';

import { PatternControlForm } from '@/components/app/admin/patterns/pattern-control-form';
import { FieldHelp } from '@/components/ui/field-help';

/** The name of each row's checkbox in the list. */
export const PATTERN_PICK = 'pattern-pick';

const boxes = () => [
  ...document.querySelectorAll<HTMLInputElement>(`input[name="${PATTERN_PICK}"]`),
];

export function PatternBulkBar() {
  const [all, setAll] = useState(false);
  // The list remounts the bar for each page and filter: the rows start unticked with it, even one still listed.
  useEffect(() => {
    for (const box of boxes()) box.checked = false;
  }, []);
  return (
    <section aria-label="Change several" className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium">
          Change the ticked patterns{' '}
          <FieldHelp title="Changing several at once" ariaLabel="About changing several">
            <p>
              Tick patterns in the list below, then set a rights risk, a status or both, with one
              reason for all of them. Each pattern&apos;s change is audited on its own. A rights
              risk you set is recorded with this reason even where the pattern already had it; a
              status it already has is left alone.
            </p>
          </FieldHelp>
        </h2>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              for (const box of boxes()) box.checked = e.target.checked;
            }}
          />
          All on this page
        </label>
      </div>
      <PatternControlForm
        idPrefix="bulk"
        ids={() => boxes().flatMap((b) => (b.checked ? [b.value] : []))}
        noneHint="Tick at least one pattern in the list."
      />
    </section>
  );
}
