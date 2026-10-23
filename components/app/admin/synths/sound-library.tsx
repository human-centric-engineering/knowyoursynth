'use client';

/**
 * SoundLibrary — a synth's sounds in order, as an admin keeps them (`f-catalogue-admin`).
 *
 * Rows move up and down locally and the whole order is saved in one `PUT /api/v1/admin/synths/[id]/sounds/order`,
 * which does not mark a sound edited. Each sound links to its editor. A sound the public page leaves out (its stored
 * content no longer fits the definition, or it was made on an older definition version) says why.
 */

import { useState } from 'react';
import Link from 'next/link';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { MoveButtons, move } from '@/components/app/admin/synths/order-controls';
import { refusalOf, type Refusal } from '@/components/app/admin/synths/problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { apiClient } from '@/lib/api/client';
import type { AdminSound } from '@/lib/app/catalogue/edit';

export const soundEditorPath = (synthId: string, slug: string) =>
  `/admin/synths/catalogue/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(slug)}`;
export const newSoundPath = (synthId: string) =>
  `/admin/synths/catalogue/${encodeURIComponent(synthId)}/new-sound`;

interface SoundLibraryProps {
  synthId: string;
  sounds: AdminSound[];
  /** `false` when the registry has no definition for the synth, so no sound can be added. */
  canAdd: boolean;
}

const LEVELS: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

export function SoundLibrary({ synthId, sounds: initial, canAdd }: SoundLibraryProps) {
  const readOnly = useSharedSettingsReadOnly();
  const [saved, setSaved] = useState(initial);
  const [sounds, setSounds] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const dirty = sounds.some((s, i) => s.slug !== saved[i]?.slug);

  const saveOrder = async () => {
    setSaving(true);
    setRefusal(null);
    try {
      const { ids } = await apiClient.put<{ ids: string[] }>(
        `/api/v1/admin/synths/${encodeURIComponent(synthId)}/sounds/order`,
        { body: { ids: sounds.map((s) => s.slug) } }
      );
      const bySlug = new Map(sounds.map((s) => [s.slug, s]));
      const ordered = ids.flatMap((slug, order) => {
        const s = bySlug.get(slug);
        return s ? [{ ...s, order }] : [];
      });
      setSaved(ordered);
      setSounds(ordered);
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the order. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void saveOrder()} disabled={readOnly || !dirty || saving}>
          {saving ? 'Saving…' : 'Save order'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSounds(saved);
            setRefusal(null);
          }}
          disabled={!dirty || saving}
        >
          Undo moves
        </Button>
        <FieldHelp title="Library order" ariaLabel="About the library order">
          <p>
            The order the synth&apos;s page lists its sounds in, first at the top. Move rows, then
            save the order. Ordering does not mark a patch edited, so the seed still updates any
            patch nobody has changed.
          </p>
        </FieldHelp>
        {dirty && (
          <span className="text-muted-foreground text-xs">The new order is not saved yet.</span>
        )}
        {canAdd && (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link href={newSoundPath(synthId)}>Add a patch</Link>
          </Button>
        )}
      </div>
      {refusal && (
        <p role="alert" className="text-destructive text-sm">
          {[refusal.message, ...refusal.problems.map((p) => p.message)].join(' ')}
        </p>
      )}
      {sounds.length === 0 ? (
        <p className="text-muted-foreground text-sm">This synth has no patches yet.</p>
      ) : (
        <ol className="divide-y rounded-md border">
          {sounds.map((s, index) => (
            <li
              key={s.slug}
              data-testid={`sound-row-${s.slug}`}
              className="flex flex-wrap items-start gap-3 p-3"
            >
              <MoveButtons
                label={s.sound.name}
                index={index}
                length={sounds.length}
                disabled={readOnly || saving}
                onMove={(by) => setSounds((current) => move(current, index, by))}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.sound.name}</div>
                <div className="text-muted-foreground text-xs">
                  <span className="font-mono">{s.slug}</span> ·{' '}
                  {LEVELS[s.sound.level] ?? s.sound.level} ·{' '}
                  {Array.isArray(s.sound.steps) ? s.sound.steps.length : 0} steps
                </div>
                {s.problems.length > 0 && (
                  <ul className="text-destructive mt-1 list-disc pl-5 text-xs">
                    {s.problems.map((p, i) => (
                      <li key={i}>{p.message}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2">
                {s.problems.length > 0 && <Badge variant="destructive">Not served</Badge>}
                {s.editedAt && <Badge variant="outline">Edited</Badge>}
                <Button asChild size="sm" variant="outline">
                  <Link href={soundEditorPath(synthId, s.slug)} aria-label={`Edit ${s.sound.name}`}>
                    Edit
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
