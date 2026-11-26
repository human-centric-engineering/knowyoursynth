'use client';

/**
 * FamilyForm — one synth family (`f-synth-families` t-323), saved whole through
 * `POST /api/v1/admin/synths/families` (a new one) or `PUT /api/v1/admin/synths/families/[id]`: its name, its members
 * in toggle order, each member's label, instrument, synth and differences, and the member it opens on. Saving marks
 * the family and its members edited, so the seed no longer updates them. See `.context/app/synth-families.md`.
 *
 * A refused save shows by Save (`<SaveError>`); each problem the server tied to a field is shown under it too, and the
 * family's own problems (two members tracing back to different originals, a synth already in another family) are in
 * the summary.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { SaveError } from '@/components/forms/form-error';
import { familyAdminPath } from '@/components/app/admin/catalogue/paths';
import { MoveButtons, move, nextRowKey } from '@/components/app/admin/synths/order-controls';
import { FieldProblems } from '@/components/app/admin/synths/problems';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import type { AdminFamily } from '@/lib/app/families/edit';
import { useSaveFailure } from '@/lib/hooks/use-save-failure';

/** What a member can name: the app synths, and the databank's instruments. */
export interface FamilyFormOptions {
  synths: { id: string; name: string }[];
  instruments: { id: string; name: string; detail: string }[];
}

interface MemberRow {
  key: number;
  slug: string;
  label: string;
  instrument: string;
  /** `''` when the member is not modelled. */
  synth: string;
  differences: string;
}

interface Draft {
  id: string;
  name: string;
  defaultMember: string;
  members: MemberRow[];
}

const emptyMember = (): MemberRow => ({
  key: nextRowKey(),
  slug: '',
  label: '',
  instrument: '',
  synth: '',
  differences: '',
});

function draftOf(family: AdminFamily | null): Draft {
  if (!family)
    return { id: '', name: '', defaultMember: '', members: [emptyMember(), emptyMember()] };
  return {
    id: family.id,
    name: family.name,
    defaultMember: family.defaultMember,
    members: family.members.map((m) => ({
      key: nextRowKey(),
      slug: m.slug,
      label: m.label,
      instrument: m.instrument,
      synth: m.synth ?? '',
      differences: m.differences,
    })),
  };
}

/**
 * The draft with its default cleared once no modelled member has that slug, so the select and the state never
 * disagree: the select lists only modelled members.
 */
const withDefaultModelled = (d: Draft): Draft =>
  d.defaultMember === '' || d.members.some((m) => m.synth && m.slug.trim() === d.defaultMember)
    ? d
    : { ...d, defaultMember: '' };

const bodyOf = (d: Draft) => ({
  name: d.name,
  defaultMember: d.defaultMember,
  members: d.members.map((m) => ({
    slug: m.slug.trim(),
    label: m.label,
    instrument: m.instrument.trim(),
    ...(m.synth ? { synth: m.synth } : {}),
    differences: m.differences,
  })),
});

export interface FamilyFormProps {
  /** The stored family, or `null` for a new one. */
  family: AdminFamily | null;
  options: FamilyFormOptions;
}

export function FamilyForm({ family, options }: FamilyFormProps) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const isNew = family === null;
  const [draft, setDraft] = useState(() => draftOf(family));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const save = useSaveFailure({ fallback: 'Could not save the family. Try again.' });

  /** The server's messages for one field, by its path (`members.0.label`). */
  const at = (path: string) =>
    (save.failure?.fields ?? []).filter((f) => f.field === path).map((f) => f.message);

  const update = (change: (d: Draft) => Draft) => {
    setDraft(change);
    setSavedNote(null);
  };
  /** Moving or removing a member changes which member an index names, so an earlier refusal no longer points anywhere. */
  const restructure = (change: (d: Draft) => Draft) => {
    update(change);
    save.clear();
  };
  const setMember = (i: number, field: keyof Omit<MemberRow, 'key'>) => (value: string) =>
    update((d) => {
      const members = d.members.map((m, j) => (j === i ? { ...m, [field]: value } : m));
      // A renamed slug takes the default with it; an empty default is no member's, so it follows none.
      // A default another row still has stays with that row.
      const renamed =
        field === 'slug' &&
        d.defaultMember !== '' &&
        d.members.every((m, j) => (j === i) === (m.slug.trim() === d.defaultMember));
      return withDefaultModelled({
        ...d,
        members,
        defaultMember: renamed ? value.trim() : d.defaultMember,
      });
    });

  const onSubmit = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const id = draft.id.trim();
        await apiClient.post('/api/v1/admin/synths/families', { body: { id, ...bodyOf(draft) } });
        router.push(familyAdminPath(id));
        return;
      }
      const after = await apiClient.put<AdminFamily>(
        `/api/v1/admin/synths/families/${encodeURIComponent(draft.id)}`,
        { body: bodyOf(draft) }
      );
      setDraft(draftOf(after));
      setSavedNote('Saved.');
      router.refresh();
    } catch (err) {
      save.report(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/api/v1/admin/synths/families/${encodeURIComponent(draft.id)}`);
      router.push(familyAdminPath());
    } catch (err) {
      save.report(err, 'Could not delete the family');
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  const modelled = draft.members.filter((m) => m.slug.trim() && m.synth);

  return (
    <form
      method="post"
      noValidate
      onSubmit={save.submit((e) => {
        e?.preventDefault();
        return onSubmit();
      })}
      className="max-w-3xl space-y-5"
    >
      <datalist id="family-instruments">
        {options.instruments.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
            {i.detail ? ` · ${i.detail}` : ''}
          </option>
        ))}
      </datalist>

      {isNew ? (
        <div className="grid gap-1">
          <Label htmlFor="family-id" className="text-xs">
            Id{' '}
            <FieldHelp title="Id" ariaLabel="About the id">
              <p>
                The family&apos;s id, usually the original&apos;s: <code>tb-303</code>. Lowercase
                letters, digits and hyphens. It cannot be changed once the family is saved.
              </p>
            </FieldHelp>
          </Label>
          <Input
            id="family-id"
            name="id"
            value={draft.id}
            aria-invalid={at('id').length > 0}
            onChange={(e) => update((d) => ({ ...d, id: e.target.value }))}
          />
          <FieldProblems messages={at('id')} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Id <code>{draft.id}</code>
        </p>
      )}

      <div className="grid gap-1">
        <Label htmlFor="family-name" className="text-xs">
          Name{' '}
          <FieldHelp title="Name" ariaLabel="About the name">
            <p>
              What the synth picker calls the family when it is found by name: <code>TB-303</code>.
            </p>
          </FieldHelp>
        </Label>
        <Input
          id="family-name"
          name="name"
          value={draft.name}
          aria-invalid={at('name').length > 0}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
        />
        <FieldProblems messages={at('name')} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Members{' '}
          <FieldHelp title="Members" ariaLabel="About the members">
            <p>
              Two or more, in the order the version toggle shows them. Every member&apos;s
              instrument must trace back, through what it recreates in the databank, to the same
              original. A member with a synth plays; one without is shown as a blank panel with its
              differences.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={at('members')} />
        {draft.members.map((member, i) => {
          const prefix = `members.${i}`;
          const id = (field: string) => `family-members-${i}-${field}`;
          const field = (
            name: 'slug' | 'label' | 'instrument',
            label: string,
            help: React.ReactNode
          ) => (
            <div className="grid gap-1">
              <Label htmlFor={id(name)} className="text-xs">
                {label}{' '}
                <FieldHelp title={label} ariaLabel={`About the ${label.toLowerCase()}`}>
                  {help}
                </FieldHelp>
              </Label>
              <Input
                id={id(name)}
                name={`${prefix}.${name}`}
                value={member[name]}
                list={name === 'instrument' ? 'family-instruments' : undefined}
                aria-invalid={at(`${prefix}.${name}`).length > 0}
                onChange={(e) => setMember(i, name)(e.target.value)}
              />
              <FieldProblems messages={at(`${prefix}.${name}`)} />
            </div>
          );
          return (
            <div key={member.key} className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">Member {i + 1}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {field(
                  'slug',
                  'Slug',
                  <p>
                    The member&apos;s name in its address and the toggle&apos;s state:{' '}
                    <code>td-3</code>, <code>mk-1</code>. Lowercase letters, digits and hyphens,
                    different for each member.
                  </p>
                )}
                {field(
                  'label',
                  'Label',
                  <p>
                    What the toggle shows: <code>TD-3</code>, <code>Mk I</code>.
                  </p>
                )}
                {field(
                  'instrument',
                  'Instrument',
                  <p>
                    The databank instrument this member is, by id: <code>behringer-td-3</code>. Its
                    own instrument, not the original the databank links its synth to.
                  </p>
                )}
                <div className="grid gap-1">
                  <Label htmlFor={id('synth')} className="text-xs">
                    Synth{' '}
                    <FieldHelp title="Synth" ariaLabel="About the synth">
                      <p>
                        The app synth that models this member, or none. A synth sits in one family
                        at most, and must be linked in the databank to an instrument with the same
                        original.
                      </p>
                    </FieldHelp>
                  </Label>
                  <select
                    id={id('synth')}
                    name={`${prefix}.synth`}
                    value={member.synth}
                    aria-invalid={at(`${prefix}.synth`).length > 0}
                    onChange={(e) => setMember(i, 'synth')(e.target.value)}
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  >
                    <option value="">Not modelled</option>
                    {options.synths.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <FieldProblems messages={at(`${prefix}.synth`)} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={id('differences')} className="text-xs">
                  Differences{' '}
                  <FieldHelp title="Differences" ariaLabel="About the differences">
                    <p>
                      What this member changed from the others: the differences and advancements it
                      brought in. An unmodelled member&apos;s blank panel shows it, a paragraph to
                      each blank line.
                    </p>
                  </FieldHelp>
                </Label>
                <Textarea
                  id={id('differences')}
                  name={`${prefix}.differences`}
                  rows={3}
                  value={member.differences}
                  aria-invalid={at(`${prefix}.differences`).length > 0}
                  onChange={(e) => setMember(i, 'differences')(e.target.value)}
                />
                <FieldProblems messages={at(`${prefix}.differences`)} />
              </div>
              <div className="flex gap-2">
                <MoveButtons
                  label={`member ${i + 1}`}
                  index={i}
                  length={draft.members.length}
                  onMove={(by) => restructure((d) => ({ ...d, members: move(d.members, i, by) }))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    restructure((d) =>
                      withDefaultModelled({ ...d, members: d.members.filter((_, j) => j !== i) })
                    )
                  }
                >
                  Remove member
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => update((d) => ({ ...d, members: [...d.members, emptyMember()] }))}
        >
          Add a member
        </Button>
      </fieldset>

      <div className="grid gap-1">
        <Label htmlFor="family-default" className="text-xs">
          Opens on{' '}
          <FieldHelp title="Opens on" ariaLabel="About the member it opens on">
            <p>
              The member the family opens on when someone owns none of them: the one most people are
              likely to own, usually the clone. It must have a synth, so the family never opens on a
              blank panel.
            </p>
          </FieldHelp>
        </Label>
        <select
          id="family-default"
          name="defaultMember"
          value={draft.defaultMember}
          aria-invalid={at('defaultMember').length > 0}
          onChange={(e) => update((d) => ({ ...d, defaultMember: e.target.value }))}
          className="border-input bg-background h-9 max-w-xs rounded-md border px-3 text-sm"
        >
          <option value="">Choose a member with a synth</option>
          {modelled.map((m) => (
            <option key={m.key} value={m.slug.trim()}>
              {m.label || m.slug}
            </option>
          ))}
        </select>
        <FieldProblems messages={at('defaultMember')} />
      </div>

      <p className="text-muted-foreground text-xs">
        Saving marks the family and its members edited: the seed stops updating them from its data
        file, and does not put back a member removed here.
      </p>
      <div className="space-y-2">
        <SaveError failure={save.failure} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={readOnly || saving}>
            {saving ? 'Saving…' : isNew ? 'Create family' : 'Save family'}
          </Button>
          {savedNote && <span className="text-muted-foreground text-sm">{savedNote}</span>}
          {!isNew &&
            (confirmingDelete ? (
              <>
                <span className="text-sm">
                  Delete the family? The seed creates it again while its data file has it.
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={readOnly || saving}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly || saving}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete family
              </Button>
            ))}
        </div>
      </div>
    </form>
  );
}
