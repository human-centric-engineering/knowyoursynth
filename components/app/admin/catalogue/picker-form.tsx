'use client';

/**
 * The site's synth picker settings, for admins (`f-synth-picker` t-329): how the picker lists synths for every visitor
 * who has not changed it, whether visitors may change it, and whether "All synths ever made" is offered. Saved whole
 * with `PUT /api/v1/admin/synths/picker`, which audits the change. A refused save shows by Save (`<SaveError>`).
 *
 * See `.context/app/synth-picker.md`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { SaveError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api/client';
import {
  FACTORY_PICKER,
  PICKER_GROUPS,
  PICKER_KINDS,
  PICKER_ORDERS,
  toggleKind,
  type PickerGroupBy,
  type PickerKind,
  type PickerOrder,
  type SitePickerSettings,
} from '@/lib/app/picker/settings';
import { useSaveFailure } from '@/lib/hooks/use-save-failure';

const GROUP_LABELS: Record<PickerGroupBy, string> = {
  name: 'Name A–Z',
  maker: 'Maker',
  lineage: 'Lineage',
};
const ORDER_LABELS: Record<PickerOrder, string> = {
  name: 'A–Z',
  new: 'Newest first',
  old: 'Oldest first',
};

function Choice<V extends string>({
  id,
  options,
  labels,
  value,
  disabled,
  onPick,
}: {
  id: string;
  options: readonly V[];
  labels: Record<V, string>;
  value: V;
  disabled: boolean;
  onPick: (v: V) => void;
}) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button
          key={o}
          type="button"
          aria-pressed={value === o}
          size="sm"
          variant={value === o ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => onPick(o)}
        >
          {labels[o]}
        </Button>
      ))}
    </div>
  );
}

export function PickerSettingsForm({ initial }: { initial: SitePickerSettings }) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const [draft, setDraft] = useState<SitePickerSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const save = useSaveFailure({ fallback: 'Could not save the picker settings. Try again.' });

  // A change makes the last save's note, or its failure, about a draft that is gone.
  const set = <K extends keyof SitePickerSettings>(key: K, value: SitePickerSettings[K]) => {
    setSavedNote(null);
    save.clear();
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const flipKind = (k: PickerKind) => set('kinds', toggleKind(draft.kinds, k));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const after = await apiClient.put<SitePickerSettings>('/api/v1/admin/synths/picker', {
        body: draft,
      });
      setDraft(after);
      save.clear();
      setSavedNote('Saved. Visitors who have not changed theirs see this now.');
      router.refresh();
    } catch (err) {
      save.report(err);
    } finally {
      setSaving(false);
    }
  };

  const disabled = readOnly || saving;
  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      className="max-w-2xl space-y-6"
    >
      <div className="space-y-2">
        <Label id="picker-group">
          Group by{' '}
          <FieldHelp title="Group by">
            <p>
              <strong>Maker</strong> lists synths under each maker, with Moog and Moog Music as one.{' '}
              <strong>Name A–Z</strong> is one list. <strong>Lineage</strong> puts each original
              with its revisions and the instruments that copy it under it.
            </p>
          </FieldHelp>
        </Label>
        <Choice
          id="picker-group"
          options={PICKER_GROUPS}
          labels={GROUP_LABELS}
          value={draft.group}
          disabled={disabled}
          onPick={(v) => set('group', v)}
        />
      </div>

      <div className="space-y-2">
        <Label id="picker-order">
          Order{' '}
          <FieldHelp title="Order">
            <p>
              The order of the synths in each group. In a lineage, a family&apos;s own members are
              always oldest first under their original.
            </p>
          </FieldHelp>
        </Label>
        <Choice
          id="picker-order"
          options={PICKER_ORDERS}
          labels={ORDER_LABELS}
          value={draft.order}
          disabled={disabled}
          onPick={(v) => set('order', v)}
        />
      </div>

      <div className="space-y-2">
        <Label id="picker-kinds">
          Kinds listed{' '}
          <FieldHelp title="Kinds listed">
            <p>
              Only synths of these kinds, as the databank records them. Choose none to list every
              kind. A synth the databank has no kind for is listed only then.
            </p>
          </FieldHelp>
        </Label>
        <div role="group" aria-labelledby="picker-kinds" className="flex flex-wrap gap-2">
          {PICKER_KINDS.map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              aria-pressed={draft.kinds.includes(k)}
              variant={draft.kinds.includes(k) ? 'default' : 'outline'}
              disabled={disabled}
              onClick={() => flipKind(k)}
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">Switches</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="picker-thumbs"
            type="checkbox"
            checked={draft.thumbs}
            disabled={disabled}
            onChange={(e) => set('thumbs', e.target.checked)}
          />
          Show panel thumbnails
          <FieldHelp title="Panel thumbnails">
            <p>A small picture of each playable synth&apos;s panel beside its name.</p>
          </FieldHelp>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="picker-visitors"
            type="checkbox"
            checked={draft.visitorsMayChange}
            disabled={disabled}
            onChange={(e) => set('visitorsMayChange', e.target.checked)}
          />
          Let visitors change these in Advanced search
          <FieldHelp title="Visitors' own settings">
            <p>
              Off, the picker has no Advanced search and every visitor sees exactly these settings.
              Their own settings are kept, unused, for when it is turned back on.
            </p>
          </FieldHelp>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="picker-all"
            type="checkbox"
            checked={draft.offerAll}
            disabled={disabled}
            onChange={(e) => set('offerAll', e.target.checked)}
          />
          Offer &ldquo;All synths ever made&rdquo;
          <FieldHelp title="All synths ever made">
            <p>
              Whether visitors may browse every instrument in the databank, not only the synths that
              play. It arrives with the next part of the picker; until then this has no effect.
            </p>
          </FieldHelp>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SaveError failure={save.failure} />
        <Button type="submit" disabled={disabled}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            save.clear();
            setDraft(FACTORY_PICKER);
            setSavedNote('The form shows the original settings. Press Save to use them.');
          }}
        >
          Reset the form to the original settings
        </Button>
        {savedNote && (
          <p role="status" className="text-muted-foreground text-sm">
            {savedNote}
          </p>
        )}
      </div>
    </form>
  );
}
