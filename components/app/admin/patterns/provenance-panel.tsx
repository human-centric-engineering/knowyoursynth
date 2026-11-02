'use client';

/**
 * ProvenancePanel — everything about where a library pattern came from, in one place (`f-pattern-library` t-156,
 * `pattern-library.md`, The provenance panel): its origin and who made it, Inspired by, fidelity, sources, a research
 * batch's record (who researched it, when the owner listened), its rights risk and status with their reasons, the
 * admins' comments, and its audit history.
 *
 * Rights risk and status change here through `PatternControlForm`; a comment is added with
 * `POST /api/v1/admin/library-patterns/[id]/comments`. Both refresh the page, which re-reads the pattern, its comments
 * and its history. Comments and history come from the page; either is `null` when it could not be read.
 */

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { PatternControlForm } from '@/components/app/admin/patterns/pattern-control-form';
import { SOURCE_LABELS } from '@/components/app/admin/patterns/pattern-form';
import { ORIGIN_LABELS, RIGHTS_LABELS, STATUS_LABELS } from '@/components/app/admin/patterns/paths';
import { refusalOf, RefusalSummary, type Refusal } from '@/components/app/admin/synths/problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import { FIDELITY_LABELS } from '@/lib/app/patterns/library-labels';
// Types only: this module holds the database client.
import type {
  AdminLibraryPattern,
  PatternComment,
  PatternHistoryEntry,
} from '@/lib/app/patterns/library-edit';

export interface ProvenancePanelProps {
  pattern: AdminLibraryPattern;
  comments: PatternComment[] | null;
  history: PatternHistoryEntry[] | null;
}

/** A date as an admin reads it: day, month and year, in UTC so server and browser agree. */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const moment = (iso: string) =>
  `${day(iso)}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;

/** What an audit action reads as. */
const ACTIONS: Record<string, string> = {
  'library_pattern.create': 'Added',
  'library_pattern.update': 'Edited',
  'library_pattern.control': 'Rights risk or status',
  'library_pattern.comment': 'Commented',
};

/** A research record's fields this panel shows, read loosely: it is the seed's JSON. */
function researchOf(research: Record<string, unknown> | null) {
  if (!research) return null;
  const text = (k: string) => (typeof research[k] === 'string' ? research[k] : null);
  return {
    task: text('task'),
    work: text('work'),
    part: text('part'),
    notes: text('notes'),
    listenedAt: text('listenedAt'),
  };
}

/** A changed value, short enough for a line. */
function shown(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export function ProvenancePanel({ pattern, comments, history }: ProvenancePanelProps) {
  const research = researchOf(pattern.research);
  const maker = pattern.madeByUser?.name ?? pattern.madeBy;

  return (
    <section aria-labelledby="provenance" className="space-y-5 rounded-md border p-4">
      <h2 id="provenance" className="flex items-center gap-2 text-lg font-semibold">
        Provenance{' '}
        <FieldHelp title="Provenance" ariaLabel="About provenance">
          <p>
            Where this pattern came from and whether players may see it. Origin, Inspired by,
            fidelity and sources are edited in the form below; rights risk and status here, each
            with a reason. Nothing here is shown to players.
          </p>
        </FieldHelp>
        {pattern.status === 'disabled' && <Badge variant="outline">Disabled</Badge>}
      </h2>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
        <Item label="Origin">
          {ORIGIN_LABELS[pattern.origin]}
          {maker && <> · made by {maker}</>}
          {pattern.madeAt && <> · {day(pattern.madeAt)}</>}
        </Item>
        <Item label="Inspired by">
          {pattern.inspiredBy.label} · {FIDELITY_LABELS[pattern.fidelity].label}
        </Item>
        <Item label="Sources">
          {pattern.sources.length === 0 ? (
            <span className="text-muted-foreground">None listed</span>
          ) : (
            <ul className="space-y-1">
              {pattern.sources.map((s, i) => (
                <li key={i}>
                  {SOURCE_LABELS[s.type]}: {s.citation}
                  {s.url && (
                    <>
                      {' '}
                      <a href={s.url} className="underline" rel="noreferrer" target="_blank">
                        link
                      </a>
                    </>
                  )}{' '}
                  <span className="text-muted-foreground">(checked {day(s.checkedAt)})</span>
                </li>
              ))}
            </ul>
          )}
        </Item>
        <Item label="Research">
          {research ? (
            <div className="space-y-1">
              <p>
                {research.task ? `${research.task}` : 'A research batch'}
                {research.work && <> · {research.work}</>}
                {research.part && <> · {research.part}</>}
              </p>
              {research.notes && <p className="text-muted-foreground">{research.notes}</p>}
            </div>
          ) : (
            <span className="text-muted-foreground">Not from a research batch</span>
          )}
        </Item>
        <Item label="Owner listened">
          {research?.listenedAt ? (
            day(research.listenedAt)
          ) : (
            <span className="text-muted-foreground">Not yet</span>
          )}
        </Item>
        <Item label="Rights risk">
          {RIGHTS_LABELS[pattern.rightsRisk].label}
          <span className="text-muted-foreground">
            {' '}
            · {pattern.rightsReason ?? 'the default for its fidelity, until an admin sets one'}
          </span>
        </Item>
        <Item label="Status">
          {STATUS_LABELS[pattern.status]}
          {pattern.statusReason && (
            <span className="text-muted-foreground"> · {pattern.statusReason}</span>
          )}
        </Item>
      </dl>

      <PatternControlForm idPrefix="pattern-control" ids={() => [pattern.id]} />

      <Comments id={pattern.id} comments={comments} />
      <History history={history} />
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Comments({ id, comments }: { id: string; comments: PatternComment[] | null }) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || readOnly) return;
    setSaving(true);
    setRefusal(null);
    try {
      await apiClient.post(`/api/v1/admin/library-patterns/${encodeURIComponent(id)}/comments`, {
        body: { body: body.trim() },
      });
      setBody('');
      router.refresh();
    } catch (err) {
      setRefusal(refusalOf(err, 'The comment could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Comments</h3>
      {comments === null ? (
        <p role="alert" className="text-destructive text-xs">
          The comments could not be loaded. Reload the page to try again.
        </p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-xs">No comments yet.</p>
      ) : (
        <ol className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-sm">
              <p className="text-muted-foreground text-xs">
                {c.author?.name ?? 'A deleted account'} · {moment(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={(e) => void submit(e)} aria-label="Add a comment" className="space-y-2">
        <Label htmlFor="pattern-comment" className="text-xs">
          Add a comment{' '}
          <FieldHelp title="Comments" ariaLabel="About comments">
            <p>
              A note for other admins: why a status changed, what a reviewer heard, what still needs
              checking. Dated, with your name, and shown only in admin.
            </p>
          </FieldHelp>
        </Label>
        <Textarea
          id="pattern-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={2}
        />
        <Button type="submit" size="sm" disabled={readOnly || saving || !body.trim()}>
          {saving ? 'Saving…' : 'Comment'}
        </Button>
        <SharedSettingsSaveHint />
        <RefusalSummary refusal={refusal} unplaced={refusal?.problems ?? []} />
      </form>
    </div>
  );
}

function History({ history }: { history: PatternHistoryEntry[] | null }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">History</h3>
      {history === null ? (
        <p role="alert" className="text-destructive text-xs">
          The history could not be loaded. Reload the page to try again.
        </p>
      ) : history.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No admin has changed it. A pattern the seed wrote has no history until one does.
        </p>
      ) : (
        <ol className="space-y-1.5 text-xs">
          {history.map((h) => (
            <li key={h.id}>
              <span className="font-medium">{ACTIONS[h.action] ?? h.action}</span>{' '}
              <span className="text-muted-foreground">
                by {h.by ?? 'a deleted account'} · {moment(h.at)}
              </span>
              {h.changes && (
                <ul className="text-muted-foreground pl-4">
                  {Object.entries(h.changes).map(([field, { from, to }]) => (
                    <li key={field}>
                      {field}: {shown(from)} → {shown(to)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
