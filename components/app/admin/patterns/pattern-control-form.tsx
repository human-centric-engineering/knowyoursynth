'use client';

/**
 * PatternControlForm — set the rights risk or status of one library pattern or several, with a reason
 * (`f-pattern-library` t-156, `pattern-library.md`, Admin control). The provenance panel gives it one pattern; the
 * list's bulk bar gives it whichever rows are ticked, read when Apply is pressed.
 *
 * Either select may be left as it is. A blocked pattern is always disabled, which the server enforces and the help
 * says. A disable that would leave a patch with no enabled pattern asks first: the patches it names, then Disable
 * anyway or Cancel.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PatternRightsRisk, PatternStatus } from '@prisma/client';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { RIGHTS_LABELS, STATUS_LABELS } from '@/components/app/admin/patterns/paths';
import { usePatternControl } from '@/components/app/admin/patterns/use-pattern-control';
import { RefusalSummary } from '@/components/app/admin/synths/problems';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const isRisk = (v: string): v is PatternRightsRisk => Object.hasOwn(RIGHTS_LABELS, v);
const isStatus = (v: string): v is PatternStatus => Object.hasOwn(STATUS_LABELS, v);

const SELECT = 'border-input bg-background h-9 rounded-md border px-3 text-sm';

export interface PatternControlFormProps {
  /** The patterns to change, read when Apply is pressed. */
  ids: () => string[];
  /** Prefixes the fields' ids, so two forms on a page do not share them. */
  idPrefix: string;
  /** Said when Apply is pressed with no pattern to change. */
  noneHint?: string;
}

export function PatternControlForm({ ids, idPrefix, noneHint }: PatternControlFormProps) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const control = usePatternControl(() => router.refresh());
  const [rightsRisk, setRightsRisk] = useState<PatternRightsRisk | ''>('');
  const [status, setStatus] = useState<PatternStatus | ''>('');
  const [reason, setReason] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const chosen = rightsRisk !== '' || status !== '';
  const blockedEnable = rightsRisk === 'blocked' && status === 'enabled';

  function submit(e: FormEvent) {
    e.preventDefault();
    const targets = ids();
    setHint(null);
    if (!targets.length) {
      setHint(noneHint ?? 'Choose a pattern first.');
      return;
    }
    void control.send(targets, {
      ...(rightsRisk && { rightsRisk }),
      ...(status && { status }),
      reason: reason.trim(),
    });
  }

  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <form onSubmit={submit} aria-label="Rights risk and status" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor={id('rights')} className="text-xs">
            Rights risk{' '}
            <FieldHelp title="Rights risk" ariaLabel="About rights risk">
              <p>Whether the pattern could raise a rights problem. Always set with a reason.</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {Object.values(RIGHTS_LABELS).map((r) => (
                  <li key={r.label}>
                    <strong>{r.label}</strong>: {r.means}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Until an admin sets one, a Transcribed or Reconstructed pattern is Needs review and
                one In the style of is None. The launch&apos;s legal review works from this.
              </p>
            </FieldHelp>
          </Label>
          <select
            id={id('rights')}
            value={rightsRisk}
            onChange={(e) => setRightsRisk(isRisk(e.target.value) ? e.target.value : '')}
            className={SELECT}
          >
            <option value="">Leave as it is</option>
            {Object.entries(RIGHTS_LABELS).map(([k, { label }]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id('status')} className="text-xs">
            Status{' '}
            <FieldHelp title="Status" ariaLabel="About status">
              <p>
                A disabled pattern is hidden from players: the synth page&apos;s Patterns,
                suggestions and the public reads. It is never deleted, stays here, and can be
                enabled again.
              </p>
              <p className="mt-2">
                A patch whose default is disabled plays its next enabled pattern instead, its riff
                rewritten. If none is left, you are asked first, and the patch keeps the riff it
                has.
              </p>
            </FieldHelp>
          </Label>
          <select
            id={id('status')}
            value={status}
            onChange={(e) => setStatus(isStatus(e.target.value) ? e.target.value : '')}
            className={SELECT}
          >
            <option value="">Leave as it is</option>
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-64 flex-1 gap-1">
          <Label htmlFor={id('reason')} className="text-xs">
            Reason{' '}
            <FieldHelp title="Reason" ariaLabel="About the reason">
              <p>
                Why, in a sentence: what was checked, or what a reviewer heard. It is kept with the
                rights risk or status it changed, and in the pattern&apos;s history. One reason
                covers every pattern changed together.
              </p>
            </FieldHelp>
          </Label>
          <Input
            id={id('reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            placeholder="Why"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={readOnly || control.busy || !chosen || !reason.trim() || blockedEnable}
        >
          {control.busy ? 'Saving…' : 'Apply'}
        </Button>
      </div>
      {blockedEnable && (
        <p className="text-destructive text-xs">A blocked pattern is always disabled.</p>
      )}
      <SharedSettingsSaveHint />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      {control.warning && (
        <div role="alert" className="rounded-md border border-amber-500/60 p-3 text-sm">
          <p className="font-medium">
            This leaves {control.warning.problems.length === 1 ? 'a patch' : 'patches'} with no
            enabled pattern to play. Each keeps the riff it has.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {control.warning.problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={control.busy}
              onClick={() => void control.confirm()}
            >
              Disable anyway
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={control.cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <RefusalSummary refusal={control.refusal} unplaced={control.refusal?.problems ?? []} />
      {control.status && (
        <p role="status" className="text-muted-foreground text-xs">
          {control.status}
        </p>
      )}
    </form>
  );
}
