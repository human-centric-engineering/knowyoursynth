'use client';

/**
 * The synth picker's Advanced search (`f-synth-picker` t-329): how the list is grouped and ordered, which kinds it
 * lists, and whether rows show a thumbnail of the panel. Each change applies at once and is kept as the visitor's own
 * (`PickerPrefs`); Reset goes back to the site's settings. Shown only while the site lets visitors change them.
 *
 * See `.context/app/synth-picker.md`.
 */

import {
  PICKER_GROUPS,
  PICKER_KINDS,
  PICKER_ORDERS,
  type PickerChoices,
  type PickerGroupBy,
  type PickerOrder,
} from '@/lib/app/picker/settings';

const GROUP_LABELS: Record<PickerGroupBy, string> = {
  name: 'Name A–Z',
  maker: 'Maker',
  lineage: 'Lineage',
};

const ORDER_LABELS: Record<PickerOrder, string> = {
  name: 'A–Z',
  new: 'Newest',
  old: 'Oldest',
};

export interface PickerAdvancedProps {
  id: string;
  choices: PickerChoices;
  /** How many choices differ from the site's: 0 is "the site's settings", and Reset has nothing to do. */
  changed: number;
  onChange: <K extends keyof PickerChoices>(key: K, value: PickerChoices[K]) => void;
  onReset: () => void;
}

/** One row of buttons, one pressed. */
function Segments<V extends string>({
  label,
  options,
  labels,
  value,
  onPick,
}: {
  label: string;
  options: readonly V[];
  labels: Record<V, string>;
  value: V;
  onPick: (v: V) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="kys-label text-(--kys-faint)">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(o)}
            className={`kys-label rounded-md border px-2 py-1 text-[11px] ${value === o ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) text-(--kys-muted) hover:border-(--kys-muted)'}`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PickerAdvanced({ id, choices, changed, onChange, onReset }: PickerAdvancedProps) {
  const toggleKind = (k: (typeof PICKER_KINDS)[number]) =>
    onChange(
      'kinds',
      choices.kinds.includes(k) ? choices.kinds.filter((x) => x !== k) : [...choices.kinds, k]
    );
  return (
    <section
      id={id}
      aria-label="Advanced search"
      className="flex flex-col gap-3 rounded-lg border border-(--kys-line) bg-(--kys-surface) p-3"
    >
      <Segments
        label="Group by"
        options={PICKER_GROUPS}
        labels={GROUP_LABELS}
        value={choices.group}
        onPick={(v) => onChange('group', v)}
      />
      <Segments
        label="Order"
        options={PICKER_ORDERS}
        labels={ORDER_LABELS}
        value={choices.order}
        onPick={(v) => onChange('order', v)}
      />
      <div className="flex flex-col gap-1.5">
        <span className="kys-label text-(--kys-faint)">Kind</span>
        <div role="group" aria-label="Kind" className="flex flex-wrap gap-1">
          {PICKER_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={choices.kinds.includes(k)}
              onClick={() => toggleKind(k)}
              className={`kys-label rounded-full border px-2 py-0.5 text-[11px] ${choices.kinds.includes(k) ? 'border-(--kys-text) bg-(--kys-text) text-(--kys-raised)' : 'border-(--kys-line) text-(--kys-muted) hover:border-(--kys-muted)'}`}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-(--kys-faint)">None chosen lists every kind.</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={choices.thumbs}
          onChange={(e) => onChange('thumbs', e.target.checked)}
          className="accent-(--kys-accent)"
        />
        Panel thumbnails
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--kys-line) pt-2">
        <span className="text-[12px] text-(--kys-faint)">
          {changed ? 'Kept as your settings' : 'Using the site’s settings'}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!changed}
          className="kys-label text-[11px] text-(--kys-accent) disabled:text-(--kys-faint)"
        >
          Reset to the site’s settings
        </button>
      </div>
    </section>
  );
}
