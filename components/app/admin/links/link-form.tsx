'use client';

/**
 * LinkForm — add or edit one video or link (`f-videos-and-links` t-181). Spec: `.context/app/links.md`.
 *
 * Paste a URL and press Read: `POST /api/v1/admin/links/resolve` gives the address as it will be stored, its provider,
 * and the title and picture its provider gives. The title is filled in when the field is empty, for the admin to
 * confirm or change. Saving is `POST /api/v1/admin/links` (new) or `PATCH /api/v1/admin/links/:id`. The server parses
 * the URL again on every save, so what Read showed is a preview, never what is trusted.
 *
 * A link's owner is set when it is added and never changes. Given an `owner`, the form links to it; given none (the
 * list page), the admin names one.
 *
 * Given a user's `suggestion` (`f-link-suggestions` t-186), it is the approve form: filled in from the suggestion, its
 * owner and address fixed (Read still previews it), and saving accepts it
 * (`POST /api/v1/admin/links/suggestions/:id`), which makes the link through the same create path. An accepted link is
 * never ours, so there is no Ours or Rating: the admin edits it afterwards. Editing a link that came from a suggestion
 * says who suggested it.
 */

import { useState, type ChangeEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormError } from '@/components/forms/form-error';
import {
  LINK_OWNER_KINDS,
  LINKS_API,
  LinkSuggestionSchema,
  OWNER_LABEL,
  PROVIDER_LABEL,
  AdminLinkSchema,
  LINK_SUGGESTIONS_API,
  type AdminLinkView,
  type LinkSuggestionView,
  type SuggestedLinkView,
} from '@/components/app/admin/links/data';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { APIClientError, apiClient } from '@/lib/api/client';
import { LINK_KINDS } from '@/lib/app/links/providers';
import type { OwnerRef } from '@/lib/app/links/owner';

const KIND_LABEL: Record<(typeof LINK_KINDS)[number], string> = {
  demo: 'Demo',
  review: 'Review',
  performance: 'Performance or record',
  lesson: 'Lesson',
  original: 'Original record',
};

const RATINGS = ['', '1', '2', '3', '4', '5'] as const;

const FormSchema = z.object({
  ownerKind: z.enum(LINK_OWNER_KINDS),
  ownerId: z.string().trim().min(1, 'Name what it is about').max(200),
  url: z.string().trim().min(1, 'Paste the address').max(2000),
  kind: z.enum(LINK_KINDS),
  title: z.string().trim().max(200, 'At most 200 characters'),
  ours: z.boolean(),
  rating: z.enum(RATINGS),
});
type FormValues = z.infer<typeof FormSchema>;

/** An existing link must keep a title; a new one may leave it to the provider. */
const EditSchema = FormSchema.refine((v) => v.title.length > 0, {
  path: ['title'],
  message: 'A link needs a title',
});

const ratingOf = (r: FormValues['rating']): number | null => (r === '' ? null : Number(r));

/**
 * What a refused save says about one field. The link service names the field (`{ url: '…' }`, `{ owner }`); body
 * validation lists each issue (`{ errors: [{ path: 'url', message }] }`).
 */
const ServerDetailsSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  owner: z.unknown().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
type ServerField = 'url' | 'title' | 'owner';

function fieldProblem(error: APIClientError): { field: ServerField; message: string } | null {
  const details = ServerDetailsSchema.safeParse(error.details ?? {});
  if (!details.success) return null;
  const d = details.data;
  for (const field of ['url', 'title'] as const)
    if (d[field] !== undefined) return { field, message: error.message };
  if (d.owner !== undefined) return { field: 'owner', message: error.message };
  for (const issue of d.errors ?? []) {
    const head = issue.path.split('.')[0];
    if (head === 'url' || head === 'title' || head === 'owner')
      return { field: head, message: issue.message };
  }
  return null;
}

export interface LinkFormProps {
  /** The link to edit; null to add one. */
  link: AdminLinkView | null;
  /** What a new link is about. Ignored when editing: a link's owner never changes. */
  owner?: OwnerRef;
  /** A new link starts marked as ours. */
  defaultOurs?: boolean;
  /** A user's suggestion to approve: the form accepts it rather than adding a link of its own. */
  suggestion?: SuggestedLinkView;
  onSaved?: (link: AdminLinkView) => void;
  /** Told when the suggestion has been accepted. */
  onAccepted?: () => void;
  onCancel?: () => void;
}

export function LinkForm({
  link,
  owner,
  defaultOurs = false,
  suggestion: suggested,
  onSaved,
  onAccepted,
  onCancel,
}: LinkFormProps) {
  const fixedOwner = link
    ? link.owner
    : suggested
      ? { kind: suggested.target.kind, id: suggested.target.id }
      : (owner ?? null);
  const ownerName = link?.owner.name ?? suggested?.target.name ?? fixedOwner?.id;
  const [suggestion, setSuggestion] = useState<LinkSuggestionView | null>(null);
  const [reading, setReading] = useState(false);
  const [readProblem, setReadProblem] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(link ? EditSchema : FormSchema),
    mode: 'onTouched',
    defaultValues: {
      ownerKind: fixedOwner?.kind ?? 'instrument',
      ownerId: fixedOwner?.id ?? '',
      url: link?.url ?? suggested?.url ?? '',
      kind: link?.kind ?? suggested?.kind ?? 'demo',
      title: link?.title ?? suggested?.title ?? '',
      ours: link?.ours ?? defaultOurs,
      rating: RATINGS.find((r) => r !== '' && Number(r) === link?.rating) ?? '',
    },
  });

  const read = async () => {
    setReadProblem(null);
    if (!(await trigger('url'))) return;
    setReading(true);
    try {
      const answer = LinkSuggestionSchema.parse(
        await apiClient.post(`${LINKS_API}/resolve`, { body: { url: getValues('url') } })
      );
      setSuggestion(answer);
      setValue('url', answer.url, { shouldDirty: true });
      if (answer.title && getValues('title').trim() === '')
        setValue('title', answer.title, { shouldDirty: true, shouldValidate: true });
      if (!answer.title)
        setReadProblem(
          answer.provider === 'other'
            ? 'A web link is never read: give it a title.'
            : 'Its provider gave no title: give it one.'
        );
    } catch (error) {
      setSuggestion(null);
      setReadProblem(
        error instanceof APIClientError ? error.message : 'It could not be read. Try again.'
      );
    } finally {
      setReading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    if (suggested) return accept(suggested, values);
    const common = {
      url: values.url,
      kind: values.kind,
      ours: values.ours,
      rating: ratingOf(values.rating),
    };
    let saved: unknown;
    try {
      saved = link
        ? await apiClient.patch(`${LINKS_API}/${encodeURIComponent(link.id)}`, {
            body: { ...common, title: values.title },
          })
        : await apiClient.post(LINKS_API, {
            body: {
              ...common,
              owner: { kind: values.ownerKind, id: values.ownerId },
              ...(values.title ? { title: values.title } : {}),
            },
          });
    } catch (error) {
      if (!(error instanceof APIClientError)) {
        setServerError("That didn't save. Try again.");
        return;
      }
      const problem = fieldProblem(error);
      if (problem?.field === 'owner' && !fixedOwner) {
        setError('ownerId', { type: 'server', message: problem.message }, { shouldFocus: true });
      } else if (problem && problem.field !== 'owner') {
        setError(
          problem.field,
          { type: 'server', message: problem.message },
          { shouldFocus: true }
        );
      } else {
        // A fixed owner has no field to mark, so its problem is said here.
        setServerError(problem?.message ?? error.message);
      }
      return;
    }
    // It saved: a reply the browser cannot read must not read as a failure, or a retry is refused as a duplicate.
    const parsed = AdminLinkSchema.safeParse(saved);
    if (parsed.success) onSaved?.(parsed.data);
    else setServerError('It saved, but the answer could not be read. Reload the page to see it.');
  };

  // A refusal of an accept names the title (none to be had) or is about the suggestion as a whole: decided by another
  // admin, its target gone, the address linked since.
  const accept = async (s: SuggestedLinkView, values: FormValues) => {
    try {
      await apiClient.post(`${LINK_SUGGESTIONS_API}/${encodeURIComponent(s.id)}`, {
        body: {
          action: 'accept',
          kind: values.kind,
          ...(values.title ? { title: values.title } : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof APIClientError)) {
        setServerError("That didn't save. Try again.");
        return;
      }
      const problem = fieldProblem(error);
      if (problem?.field === 'title')
        setError('title', { type: 'server', message: problem.message }, { shouldFocus: true });
      else setServerError(problem?.message ?? error.message);
      return;
    }
    onAccepted?.();
  };

  const id = (name: string) => `link-${link?.id ?? suggested?.id ?? 'new'}-${name}`;
  const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm';

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
      {fixedOwner ? (
        <div className="text-muted-foreground space-y-0.5 text-sm">
          <p>
            About the {OWNER_LABEL[fixedOwner.kind].toLowerCase()}{' '}
            <span className="text-foreground font-medium">{ownerName}</span>
          </p>
          {link?.suggestedBy && <p>Suggested by {link.suggestedBy.name ?? 'an erased account'}</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor={id('owner-kind')} className="flex items-center gap-1">
              About
              <FieldHelp title="What it is about">
                <p>
                  A databank instrument, record or artist, or a library patch. A synth&apos;s videos
                  belong to its databank instrument, so they show beneath every panel that models
                  it.
                </p>
                <p className="mt-2">
                  This can&apos;t change later: to move a link, remove it and add it to the other.
                </p>
              </FieldHelp>
            </Label>
            <select id={id('owner-kind')} className={selectClass} {...register('ownerKind')}>
              {LINK_OWNER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {OWNER_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('owner-id')} className="flex items-center gap-1">
              Id
              <FieldHelp title="Its id">
                <p>
                  A databank id, as in its address: <code>moog-minimoog</code>,{' '}
                  <code>kraftwerk-autobahn</code>. A patch is{' '}
                  <code>&lt;synth&gt;/&lt;patch&gt;</code>: <code>model-d/stacked-night-bass</code>.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id={id('owner-id')}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!errors.ownerId}
              {...register('ownerId')}
            />
            <FormError message={errors.ownerId?.message} />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={id('url')} className="flex items-center gap-1">
          Address
          <FieldHelp title="The address">
            <p>
              A YouTube, Vimeo, Spotify, SoundCloud or Bandcamp page for one video, track or album,
              or any other https page. Read asks its provider for the title and picture.
            </p>
            <p className="mt-2">
              It is saved in one standard form, so the same video pasted two ways is one link. A
              plain web link opens in a new tab and never plays on the page.
            </p>
          </FieldHelp>
        </Label>
        <div className="flex gap-2">
          <Input
            id={id('url')}
            type="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=…"
            // A suggestion is accepted as it was suggested; a different address is a link of the admin's own.
            readOnly={!!suggested}
            aria-invalid={!!errors.url}
            {...register('url', {
              // The preview is of the address Read was given; once it changes, the preview no longer is.
              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                if (suggestion && e.target.value !== suggestion.url) {
                  setSuggestion(null);
                  setReadProblem(null);
                }
              },
            })}
          />
          <Button type="button" variant="outline" onClick={() => void read()} disabled={reading}>
            {reading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Read
          </Button>
        </div>
        <FormError message={errors.url?.message} />
        {readProblem && <p className="text-muted-foreground text-xs">{readProblem}</p>}
        {suggestion && (
          <div className="flex items-center gap-3 rounded-md border p-2" data-testid="link-preview">
            {suggestion.thumbnailUrl && (
              // A provider's own image host only (`safeThumbnailUrl`); next/image would need each one configured.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={suggestion.thumbnailUrl}
                alt=""
                className="h-12 w-20 rounded object-cover"
              />
            )}
            <div className="min-w-0 text-sm">
              <p className="font-medium">{PROVIDER_LABEL[suggestion.provider]}</p>
              <p className="text-muted-foreground truncate text-xs">{suggestion.url}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={id('title')} className="flex items-center gap-1">
          Title
          <FieldHelp title="The title">
            <p>
              Shown on the card. Read fills it from the provider when it is empty; change it to
              whatever reads best.
            </p>
            {suggested ? (
              <p className="mt-2">
                Left empty, the suggester&apos;s own title is kept, or the provider&apos;s if they
                gave none. Empty it and press Read to use the provider&apos;s.
              </p>
            ) : (
              !link && (
                <p className="mt-2">Left empty, the provider&apos;s title is used when it saves.</p>
              )
            )}
          </FieldHelp>
        </Label>
        <Input id={id('title')} aria-invalid={!!errors.title} {...register('title')} />
        <FormError message={errors.title?.message} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('kind')} className="flex items-center gap-1">
            Kind
            <FieldHelp title="Kind">
              <p>
                <strong>Demo</strong>: it played, to show it off. <strong>Review</strong>.{' '}
                <strong>Performance or record</strong>: music made with it. <strong>Lesson</strong>:
                how to use it, or how a sound is made. <strong>Original record</strong>: the record
                a patch is inspired by.
              </p>
            </FieldHelp>
          </Label>
          <select id={id('kind')} className={selectClass} {...register('kind')}>
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {!suggested && (
          <div className="space-y-1">
            <Label htmlFor={id('rating')} className="flex items-center gap-1">
              Rating
              <FieldHelp title="Rating">
                <p>
                  How good it is, 1 to 5. Used to order it only when there is no view count
                  (anything but YouTube, or no YouTube key). Links that aren&apos;t ours are shown
                  in a random order that favours the popular ones.
                </p>
              </FieldHelp>
            </Label>
            <select id={id('rating')} className={selectClass} {...register('rating')}>
              {RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r === '' ? 'None' : r}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {suggested ? (
        <p className="text-muted-foreground text-sm">
          It is added as not ours, unrated. Edit it afterwards to change that.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id('ours')}
            defaultChecked={link?.ours ?? defaultOurs}
            onCheckedChange={(v) => setValue('ours', v === true, { shouldDirty: true })}
          />
          <Label htmlFor={id('ours')} className="flex items-center gap-1">
            Ours
            <FieldHelp title="Ours">
              <p>
                One of Know Your Synth&apos;s own. Ours come first, in the order you set; a link
                newly marked ours goes last among them.
              </p>
            </FieldHelp>
          </Label>
        </div>
      )}

      <FormError message={serverError ?? undefined} />

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {link ? 'Save' : suggested ? 'Accept and add' : 'Add link'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
