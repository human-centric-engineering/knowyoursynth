'use client';

/**
 * SynthDesignsTable — every synth's panel design, and the switch between them (D11, `f-panel-designs`).
 *
 * Renders `GET /api/v1/admin/synths` and changes a design through `PATCH /api/v1/admin/synths/[id]/design`. Switching
 * to faithful asks for the maker's approval (who, when, a note) in the same step, prefilled from any approval already
 * recorded; switching to neutral keeps it. Whatever the API refuses is shown as it said it.
 *
 * A synth's design is a shared setting, so where the admin is acting for an org other than the install org the
 * buttons are disabled and the page says why (`components/admin/shared-settings-access.tsx`).
 */

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { AdminSynthDesign, SynthDesignInput } from '@/lib/app/catalogue/designs';

export interface SynthDesignsTableProps {
  synths: AdminSynthDesign[];
}

const designPath = (id: string) => `/api/v1/admin/synths/${encodeURIComponent(id)}/design`;

/** A 400's detail, in either shape the route sends: the schema's issue list, or the approval rule's field map. */
const issueListSchema = z.object({ errors: z.array(z.object({ message: z.string() })).min(1) });
const fieldMapSchema = z.record(z.string(), z.array(z.string()).min(1));

/** What a refused change says: the field messages when there are any, as they name what to fix. */
function describeError(err: unknown): string {
  if (!(err instanceof APIClientError)) return 'Could not change the design. Try again.';
  const issues = issueListSchema.safeParse(err.details);
  const fields = fieldMapSchema.safeParse(err.details);
  const messages = issues.success
    ? issues.data.errors.map((issue) => issue.message)
    : fields.success
      ? Object.values(fields.data).flat()
      : [];
  return messages.length > 0 ? [...new Set(messages)].join(' ') : err.message;
}

/** Today in the admin's own calendar, `YYYY-MM-DD`: the latest day an approval can carry. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function SynthDesignsTable({ synths: initial }: SynthDesignsTableProps) {
  const readOnly = useSharedSettingsReadOnly();
  const [synths, setSynths] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [approving, setApproving] = useState<AdminSynthDesign | null>(null);

  const replace = (updated: AdminSynthDesign) =>
    setSynths((current) => current.map((s) => (s.id === updated.id ? updated : s)));

  /** Sends one change. Returns the refusal's message, or null once it is saved. */
  const send = async (id: string, input: SynthDesignInput): Promise<string | null> => {
    setBusyId(id);
    try {
      replace(await apiClient.patch<AdminSynthDesign>(designPath(id), { body: input }));
      return null;
    } catch (err) {
      return describeError(err);
    } finally {
      setBusyId(null);
    }
  };

  const switchToNeutral = async (synth: AdminSynthDesign) => {
    setRowError(null);
    const message = await send(synth.id, { design: 'neutral' });
    if (message) setRowError({ id: synth.id, message });
  };

  if (synths.length === 0) {
    return <p className="text-muted-foreground text-sm">The catalogue has no synths yet.</p>;
  }

  return (
    <div className="space-y-3">
      <SharedSettingsSaveHint />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Synth</TableHead>
              <TableHead>Catalogue</TableHead>
              <TableHead>Design</TableHead>
              <TableHead>Maker&apos;s approval</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {synths.map((synth) => {
              const label = `${synth.maker} ${synth.name}`;
              const busy = busyId === synth.id;
              return (
                <TableRow key={synth.id} data-testid={`synth-row-${synth.id}`}>
                  <TableCell>
                    {synth.listed && synth.playable ? (
                      <Link href={`/synths/${synth.id}`} className="font-medium hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <span className="font-medium">{label}</span>
                    )}
                    <div className="text-muted-foreground font-mono text-xs">{synth.id}</div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={synth.listed ? 'outline' : 'secondary'}>
                      {synth.listed ? 'Listed' : 'Unlisted'}
                    </Badge>
                    {!synth.playable && <Badge variant="secondary">Not built</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={synth.design === 'faithful' ? 'default' : 'outline'}>
                      {synth.design === 'faithful' ? 'Faithful' : 'Neutral'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {synth.approval ? (
                      <>
                        <div>
                          {synth.approval.approvedBy} · {synth.approval.approvedAt}
                        </div>
                        {synth.approval.note && (
                          <div className="text-muted-foreground max-w-xs truncate text-xs">
                            {synth.approval.note}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">None recorded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {synth.design === 'faithful' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={readOnly || busy}
                        aria-label={`Switch ${label} to neutral`}
                        onClick={() => void switchToNeutral(synth)}
                      >
                        {busy ? 'Saving…' : 'Switch to neutral'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={readOnly || busy}
                        aria-label={`Switch ${label} to faithful`}
                        onClick={() => {
                          setRowError(null);
                          setApproving(synth);
                        }}
                      >
                        Switch to faithful…
                      </Button>
                    )}
                    {rowError?.id === synth.id && (
                      <p role="alert" className="text-destructive mt-1 text-xs">
                        {rowError.message}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {approving && (
        <ApprovalDialog
          synth={approving}
          onClose={() => setApproving(null)}
          onSubmit={async (approval) => {
            const message = await send(approving.id, { design: 'faithful', approval });
            if (!message) setApproving(null);
            return message;
          }}
        />
      )}
    </div>
  );
}

type Approval = NonNullable<SynthDesignInput['approval']>;

interface ApprovalDialogProps {
  synth: AdminSynthDesign;
  onClose: () => void;
  /** Resolves to the refusal's message, or null once saved. */
  onSubmit: (approval: Approval) => Promise<string | null>;
}

/** Records the maker's approval and switches to faithful in one step. */
function ApprovalDialog({ synth, onClose, onSubmit }: ApprovalDialogProps) {
  const [approvedBy, setApprovedBy] = useState(synth.approval?.approvedBy ?? '');
  const [approvedAt, setApprovedAt] = useState(synth.approval?.approvedAt ?? '');
  const [note, setNote] = useState(synth.approval?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = approvedBy.trim() !== '' && approvedAt !== '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    setSaving(true);
    setError(null);
    const message = await onSubmit({
      approvedBy: approvedBy.trim(),
      approvedAt,
      note: note.trim() || null,
    });
    // On success the dialog is closed by its owner; only a refusal comes back here.
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              Show {synth.maker}&apos;s marks on the {synth.name}
            </DialogTitle>
            <DialogDescription>
              The faithful design draws the maker&apos;s logos and wordmarks. Record their approval
              to switch it on.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="approved-by">
              Approved by{' '}
              <FieldHelp title="Who approved it">
                <p>
                  The person on {synth.maker}&apos;s side who agreed to their marks being shown, as
                  you would name them if asked: for example <code>Jane Doe, Head of Brand</code>.
                </p>
                <p className="mt-2">
                  They are not a user of this app. You are recorded separately, in the audit log, as
                  the admin who made the change.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id="approved-by"
              value={approvedBy}
              maxLength={200}
              required
              onChange={(e) => setApprovedBy(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="approved-at">
              Date approved{' '}
              <FieldHelp title="When it was given">
                <p>
                  The day the maker gave their approval, not today&apos;s date unless that is when
                  it came. It cannot be in the future.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id="approved-at"
              type="date"
              value={approvedAt}
              max={today()}
              required
              onChange={(e) => setApprovedAt(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="approval-note">
              Note{' '}
              <FieldHelp title="What to note">
                <p>
                  Optional. Where the approval is kept and anything it was conditional on: for
                  example <code>Email of 3 Oct, in the vendors folder; marks only, no photos</code>.
                </p>
              </FieldHelp>
            </Label>
            <Textarea
              id="approval-note"
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!complete || saving}>
              {saving ? 'Saving…' : 'Switch to faithful'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
