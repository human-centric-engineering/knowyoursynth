'use client';

/**
 * LinkSuggestionQueue — the videos and links users suggested (`f-link-suggestions` t-186), for an admin to approve or
 * decline. Spec: `.context/app/links.md` (Suggestions).
 *
 * Each row names its suggester and what it is about, with a link to that thing's editor. **Approve** opens the link
 * form filled in from the suggestion (Read previews it); saving accepts it through
 * `POST /api/v1/admin/links/suggestions/:id`, which makes the link through the links admin's own create path.
 * **Decline** asks for a reason. A decided suggestion shows its outcome and cannot be decided again.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { FormError } from '@/components/forms/form-error';
import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import {
  LINK_SUGGESTIONS_API,
  OWNER_LABEL,
  ownerAdminPath,
  type SuggestedLinkView,
} from '@/components/app/admin/links/data';
import { LinkForm } from '@/components/app/admin/links/link-form';
import { KIND_LABEL } from '@/components/app/links/data';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { APIClientError, apiClient } from '@/lib/api/client';

const STATUS_LABEL: Record<SuggestedLinkView['status'], string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
};

export function LinkSuggestionQueue({ suggestions }: { suggestions: SuggestedLinkView[] }) {
  if (suggestions.length === 0)
    return <p className="text-muted-foreground text-sm">No suggestions here.</p>;
  return (
    <ul className="space-y-4">
      {suggestions.map((s) => (
        <li key={s.id}>
          <SuggestionCard suggestion={s} />
        </li>
      ))}
    </ul>
  );
}

function SuggestionCard({ suggestion: s }: { suggestion: SuggestedLinkView }) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const label = OWNER_LABEL[s.target.kind];

  return (
    <article className="rounded-md border p-4" aria-labelledby={`link-suggestion-${s.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`link-suggestion-${s.id}`} className="font-medium">
          {s.title ?? s.url}{' '}
          <span className="text-muted-foreground font-normal">· {KIND_LABEL[s.kind]}</span>
        </h2>
        <span className="text-muted-foreground text-xs">
          {STATUS_LABEL[s.status]} · suggested by {s.suggestedBy ?? 'an erased account'} on{' '}
          {new Date(s.createdAt).toLocaleDateString()}
        </span>
      </header>
      <p className="mt-1 text-sm">
        For the {label.toLowerCase()}{' '}
        {s.target.name === null ? (
          <span>
            {s.target.id} <span className="text-muted-foreground">(since removed)</span>
          </span>
        ) : (
          <Link href={ownerAdminPath(s.target)} className="font-medium underline">
            {s.target.name}
          </Link>
        )}
      </p>
      <p className="mt-1 text-sm break-all">
        <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
          {s.url}
        </a>
      </p>
      {s.note && <p className="mt-2 text-sm whitespace-pre-line">{s.note}</p>}

      {s.status !== 'PENDING' ? (
        <p className="mt-3 text-sm">
          {s.status === 'DECLINED' ? (
            <>Declined: {s.reason}</>
          ) : s.target.name !== null ? (
            <>
              Added to{' '}
              <Link href={ownerAdminPath(s.target)} className="underline">
                {s.target.name}
              </Link>
            </>
          ) : (
            'Added'
          )}
        </p>
      ) : declining ? (
        <DeclineForm suggestion={s} onCancel={() => setDeclining(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Dialog open={approving} onOpenChange={setApproving}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={readOnly || s.target.name === null}>
                Approve…
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Approve a suggested link</DialogTitle>
                <DialogDescription>
                  Press Read to see what it is, then confirm its title and kind.
                </DialogDescription>
              </DialogHeader>
              {approving && (
                <LinkForm
                  link={null}
                  suggestion={s}
                  onCancel={() => setApproving(false)}
                  onAccepted={() => {
                    setApproving(false);
                    router.refresh();
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly}
            onClick={() => setDeclining(true)}
          >
            Decline…
          </Button>
        </div>
      )}
    </article>
  );
}

function DeclineForm({
  suggestion: s,
  onCancel,
}: {
  suggestion: SuggestedLinkView;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = `link-suggestion-${s.id}-reason`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setProblem('Say why it is declined');
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await apiClient.post(`${LINK_SUGGESTIONS_API}/${encodeURIComponent(s.id)}`, {
        body: { action: 'decline', reason: reason.trim() },
      });
      // Stays saving until the refresh replaces this form with the outcome, so it cannot be sent twice.
      router.refresh();
    } catch (err) {
      setProblem(
        err instanceof APIClientError ? err.message : 'Could not save the decision. Try again.'
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3" noValidate>
      <div className="space-y-1">
        <Label htmlFor={id}>
          Reason{' '}
          <FieldHelp title="Reason">
            <p>
              Why it is not being added, kept with the suggestion and in the audit log: not about
              this, a poor copy, already covered by a better one.
            </p>
          </FieldHelp>
        </Label>
        <Textarea
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          aria-invalid={problem ? true : undefined}
        />
        <FormError message={problem ?? undefined} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          Decline
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
