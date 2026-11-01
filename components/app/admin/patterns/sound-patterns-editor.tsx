'use client';

/**
 * SoundPatternsEditor — one patch's patterns in order, the first its default (`f-pattern-library` t-126).
 *
 * Move a pattern up or down, or make one the default, then Save sends the whole order to
 * `PUT /api/v1/admin/synths/[id]/sounds/[slug]/patterns`. Nothing is taken off: a riff stops being the default by
 * another pattern going first, and stays on the patch (`pattern-library.md`, Reviewing the current riffs). A new default
 * becomes the patch's riff, and the server refuses one that could not be (a riff plays the same every loop).
 */

import { useState } from 'react';
import Link from 'next/link';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { patternAdminPath } from '@/components/app/admin/patterns/paths';
import { MoveButtons, move } from '@/components/app/admin/synths/order-controls';
import { refusalOf, RefusalSummary, type Refusal } from '@/components/app/admin/synths/problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { apiClient } from '@/lib/api/client';
import { FIDELITY_LABELS, ROLE_LABELS } from '@/lib/app/patterns/library-labels';
// Types only: the read layer holds the database client.
import type { AdminSoundPatterns } from '@/lib/app/patterns/library-edit';

export interface SoundPatternsEditorProps {
  sound: AdminSoundPatterns;
}

export function SoundPatternsEditor({ sound }: SoundPatternsEditorProps) {
  const readOnly = useSharedSettingsReadOnly();
  const byId = new Map(sound.patterns.map((p) => [p.id, p]));
  const [saved, setSaved] = useState(() => sound.patterns.map((p) => p.id));
  const [order, setOrder] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const changed = order.join() !== saved.join();
  const newDefault = order[0] !== saved[0];
  const change = (next: string[]) => {
    setOrder(next);
    setRefusal(null);
    setStatus(null);
  };

  async function save() {
    setSaving(true);
    setRefusal(null);
    setStatus(null);
    try {
      const res = await apiClient.put<{ patternIds: string[] }>(
        `/api/v1/admin/synths/${encodeURIComponent(sound.synthId)}/sounds/${encodeURIComponent(sound.slug)}/patterns`,
        { body: { patternIds: order } }
      );
      setSaved(res.patternIds);
      setOrder(res.patternIds);
      setStatus(newDefault ? 'Saved. The patch’s riff is now its new default.' : 'Saved.');
    } catch (err) {
      setRefusal(refusalOf(err, 'The order could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">
        Patterns, default first{' '}
        <FieldHelp title="A patch’s patterns" ariaLabel="About a patch’s patterns">
          <p>
            Players are offered every pattern listed here, in this order. The first is the
            patch&apos;s default: its riff, what it plays when it opens.
          </p>
          <p className="mt-2">
            To demote a riff, make another pattern the default. Nothing is taken off a patch. A
            default must play the same every loop, so a pattern with two parts, chance, conditions,
            mod lanes or rests after its last note cannot be one.
          </p>
        </FieldHelp>
      </h2>

      {order.length === 0 ? (
        <p className="text-muted-foreground text-sm">This patch lists no patterns.</p>
      ) : (
        <ol className="divide-y rounded-md border" aria-label="Patterns in order">
          {order.map((id, i) => {
            const p = byId.get(id);
            const name = p?.name ?? id;
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 p-3">
                <MoveButtons
                  label={name}
                  index={i}
                  length={order.length}
                  disabled={saving || readOnly}
                  onMove={(by) => change(move(order, i, by))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={patternAdminPath(id)} className="font-medium hover:underline">
                      {name}
                    </Link>
                    {i === 0 && <Badge>Default</Badge>}
                    {id === saved[0] && i !== 0 && <Badge variant="outline">Was the default</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {!p
                      ? ''
                      : 'problem' in p
                        ? p.problem
                        : `${ROLE_LABELS[p.role]} · ${FIDELITY_LABELS[p.fidelity].label} · ${p.inspiredBy.label}`}
                  </p>
                </div>
                {i !== 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving || readOnly}
                    onClick={() => change([id, ...order.filter((x) => x !== id)])}
                  >
                    Make default
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <RefusalSummary refusal={refusal} unplaced={refusal?.problems ?? []} />
      <SharedSettingsSaveHint />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!changed || saving || readOnly} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save order'}
        </Button>
        {changed && (
          <Button type="button" variant="ghost" disabled={saving} onClick={() => change(saved)}>
            Undo changes
          </Button>
        )}
        {changed && newDefault && (
          <p className="text-muted-foreground text-sm">
            Saving makes {byId.get(order[0])?.name ?? order[0]} the default: the patch&apos;s riff
            becomes its notes.
          </p>
        )}
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
