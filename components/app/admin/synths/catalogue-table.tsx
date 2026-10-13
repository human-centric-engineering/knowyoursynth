'use client';

/**
 * CatalogueTable — the catalogue in order, as an admin keeps it (`f-catalogue-admin`).
 *
 * Renders `GET /api/v1/admin/synths`. Rows move up and down locally and the whole order is saved in one
 * `PUT /api/v1/admin/synths/order`; the listed switch saves at once through `PATCH /api/v1/admin/synths/[id]`. Neither
 * marks a synth edited (placement, not content). Each row links to the synth's editor.
 *
 * The catalogue is a shared setting, so where the admin is acting for an org other than the install org the controls
 * are disabled (`components/admin/shared-settings-access.tsx`).
 */

import { useState } from 'react';
import Link from 'next/link';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { MoveButtons, move } from '@/components/app/admin/synths/order-controls';
import { refusalOf, type Refusal } from '@/components/app/admin/synths/problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api/client';
import type { AdminSynth } from '@/lib/app/catalogue/edit';

export interface CatalogueTableProps {
  synths: AdminSynth[];
}

export const catalogueSynthPath = (id: string) =>
  `/admin/synths/catalogue/${encodeURIComponent(id)}`;

const sameOrder = (a: AdminSynth[], b: AdminSynth[]) => a.every((s, i) => s.id === b[i]?.id);

export function CatalogueTable({ synths: initial }: CatalogueTableProps) {
  const readOnly = useSharedSettingsReadOnly();
  // `saved` is the order the server has; `synths` is what the admin sees, moved rows included.
  const [saved, setSaved] = useState(initial);
  const [synths, setSynths] = useState(initial);
  const [savingOrder, setSavingOrder] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const dirty = !sameOrder(synths, saved);

  const saveOrder = async () => {
    setSavingOrder(true);
    setRefusal(null);
    try {
      const { ids } = await apiClient.put<{ ids: string[] }>('/api/v1/admin/synths/order', {
        body: { ids: synths.map((s) => s.id) },
      });
      // Reorder the rows as they are now, not as they were at the click: a listed toggle may have landed meanwhile.
      const reorder = (list: AdminSynth[]) => {
        const byId = new Map(list.map((s) => [s.id, s]));
        return ids.flatMap((id, order) => {
          const s = byId.get(id);
          return s ? [{ ...s, order }] : [];
        });
      };
      setSaved(reorder);
      setSynths(reorder);
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the order. Try again.'));
    } finally {
      setSavingOrder(false);
    }
  };

  const setListed = async (synth: AdminSynth, listed: boolean) => {
    setBusyIds((current) => new Set(current).add(synth.id));
    setRefusal(null);
    try {
      const after = await apiClient.patch<{ listed: boolean }>(
        `/api/v1/admin/synths/${encodeURIComponent(synth.id)}`,
        { body: { listed } }
      );
      const update = (list: AdminSynth[]) =>
        list.map((s) => (s.id === synth.id ? { ...s, listed: after.listed } : s));
      setSynths(update);
      setSaved(update);
    } catch (err) {
      setRefusal(refusalOf(err, `Could not change whether ${synth.name} is listed. Try again.`));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(synth.id);
        return next;
      });
    }
  };

  if (synths.length === 0) {
    return <p className="text-muted-foreground text-sm">The catalogue has no synths yet.</p>;
  }

  return (
    <div className="space-y-3">
      <SharedSettingsSaveHint />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void saveOrder()}
          disabled={readOnly || !dirty || savingOrder}
          size="sm"
        >
          {savingOrder ? 'Saving…' : 'Save order'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSynths(saved);
            setRefusal(null);
          }}
          disabled={!dirty || savingOrder}
        >
          Undo moves
        </Button>
        {dirty && (
          <span className="text-muted-foreground text-xs">The new order is not saved yet.</span>
        )}
      </div>
      {refusal && (
        <p role="alert" className="text-destructive text-sm">
          {[refusal.message, ...refusal.problems.map((p) => p.message)].join(' ')}
        </p>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">
                Order{' '}
                <FieldHelp title="Catalogue order" ariaLabel="About the catalogue order">
                  <p>
                    The order the public catalogue shows synths in, first at the top. Move rows,
                    then save the order. Hidden synths keep their place, ready for when they are
                    listed again.
                  </p>
                  <p className="mt-2">
                    Ordering does not mark a synth edited, so the seed still updates its
                    description.
                  </p>
                </FieldHelp>
              </TableHead>
              <TableHead>Synth</TableHead>
              <TableHead>
                Listed{' '}
                <FieldHelp title="Listed" ariaLabel="About listing a synth">
                  <p>
                    Off hides the synth from the public catalogue and its page; its content stays,
                    and turning it back on shows it again. It saves as soon as you switch it.
                  </p>
                  <p className="mt-2">
                    A synth that is not built yet cannot be played even when listed.
                  </p>
                </FieldHelp>
              </TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {synths.map((synth, index) => {
              const label = `${synth.maker} ${synth.name}`;
              return (
                <TableRow key={synth.id} data-testid={`catalogue-row-${synth.id}`}>
                  <TableCell>
                    <MoveButtons
                      label={label}
                      index={index}
                      length={synths.length}
                      disabled={readOnly || savingOrder}
                      onMove={(by) => setSynths((current) => move(current, index, by))}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{label}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {synth.id} · {synth.year}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={synth.listed}
                      aria-label={`List ${label}`}
                      disabled={readOnly || busyIds.has(synth.id)}
                      onCheckedChange={(checked) => void setListed(synth, checked)}
                    />
                  </TableCell>
                  <TableCell className="space-x-1 text-sm">
                    <span>
                      {synth.counts.sounds} sounds · {synth.counts.notes} notes
                      {synth.counts.lineage ? ' · lineage' : ''}
                    </span>
                    {!synth.playable && <Badge variant="secondary">Not built</Badge>}
                    {synth.editedAt && <Badge variant="outline">Edited</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={catalogueSynthPath(synth.id)} aria-label={`Edit ${label}`}>
                        Edit
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
