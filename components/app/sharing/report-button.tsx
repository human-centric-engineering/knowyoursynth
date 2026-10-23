'use client';

/**
 * **Report** on a shared sound's page (`f-sharing` h4), for a signed-in visitor whose sound it is not: a dialog with
 * the reason and an optional note, sent as `POST /api/v1/public/sounds/:slug/report`. A second report from the same
 * person updates their first, so sending again is safe. The owner is never told who reported it.
 *
 * A shared pattern's page has the same button (`kind="pattern"`, `f-step-sequencer` t-83), sent to
 * `POST /api/v1/public/patterns/:slug/report`.
 */

import { useId, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import {
  REPORT_NOTE_MAX,
  SOUND_REPORT_REASON_LABELS,
  SOUND_REPORT_REASONS,
  type SoundReportReason,
} from '@/lib/app/sounds/report-data';

/** What is reported: a shared sound, or a shared pattern. */
export type ReportKind = 'sound' | 'pattern';

/** What a user reads for each kind: a sound is a patch on screen (t-93). */
const NOUN: Record<ReportKind, string> = { sound: 'patch', pattern: 'pattern' };

const reasonLabel = (r: SoundReportReason, kind: ReportKind): string =>
  kind === 'pattern' && r === 'not_theirs'
    ? "It's someone else's pattern"
    : SOUND_REPORT_REASON_LABELS[r];

function failureOf(err: unknown, kind: ReportKind): string {
  if (err instanceof APIClientError) {
    if (err.status === 401) return 'Your session has ended. Sign in again to report it.';
    if (err.status === 404) return `This ${NOUN[kind]} is not shared any more.`;
    if (err.status === 429) return "That's as many reports as you can send today. Try tomorrow.";
    return err.message;
  }
  return 'Could not send the report. Check your connection and try again.';
}

export function ReportButton({
  slug,
  soundName,
  buttonClass,
  kind = 'sound',
}: {
  slug: string;
  /** The sound's name, or the pattern's. */
  soundName: string;
  buttonClass: string;
  kind?: ReportKind;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SoundReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const noteId = useId();

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setFailure(null);
    try {
      await apiClient.post(`/api/v1/public/${kind}s/${encodeURIComponent(slug)}/report`, {
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setSent(true);
      setOpen(false);
    } catch (err) {
      setFailure(failureOf(err, kind));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
        className={buttonClass}
      >
        Report
      </button>
      {sent && (
        <span role="status" className="text-(--kys-muted)">
          Reported. Thanks, an admin will look at it.
        </span>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="w-[min(480px,calc(100vw-32px))] rounded-xl border-(--kys-line) bg-(--kys-raised) p-5 text-(--kys-text)">
            <DialogTitle className="text-base font-semibold">Report {soundName}</DialogTitle>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="space-y-4"
            >
              <DialogDescription className="text-sm text-(--kys-muted)">
                An admin will look at it, and can take it off the site. Whoever shared it is not
                told who reported it.
                {sent && ' You have reported it already; sending again replaces that report.'}
              </DialogDescription>
              <fieldset className="space-y-1.5">
                <legend className="flex items-center gap-1 text-sm">
                  What is wrong with it?
                  <FieldHelp title="Reasons">
                    <p>
                      <strong>Someone else&apos;s {NOUN[kind]}</strong>: it is put up as theirs but
                      was made by somebody else, and not credited.
                    </p>
                    <p className="mt-2">
                      <strong>Offensive or hateful</strong>:{' '}
                      {kind === 'pattern' ? 'the name.' : 'the name or notes.'}
                    </p>
                  </FieldHelp>
                </legend>
                {SOUND_REPORT_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                    />
                    {reasonLabel(r, kind)}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-1">
                  <label htmlFor={noteId}>
                    Anything to add <span className="text-(--kys-muted)">(optional)</span>
                  </label>
                  <FieldHelp title="Note">
                    <p>
                      Only admins read it. For someone else&apos;s {NOUN[kind]}, say whose it is, if
                      you know.
                    </p>
                  </FieldHelp>
                </div>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={REPORT_NOTE_MAX}
                  rows={3}
                  className="w-full rounded-md border border-(--kys-line) bg-(--kys-surface) px-2 py-1.5"
                />
              </div>
              {failure && (
                <p role="alert" className="text-sm text-(--kys-warn)">
                  {failure}
                </p>
              )}
              <DialogFooter>
                <button type="button" onClick={() => setOpen(false)} className={buttonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={!reason || busy} className={buttonClass}>
                  {busy ? 'Sending…' : 'Send report'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
