/**
 * Link suggestions (`f-link-suggestions` t-185): a signed-in user says a video or link belongs on an instrument, a
 * library sound, a song or an artist, and an admin accepts or declines it. Spec: `.context/app/links.md`
 * (Suggestions).
 *
 * The rules, each tested:
 *
 * - **A suggestion's URL is parsed, never fetched** (`parseLinkUrl`): only an admin's accept reads its provider.
 * - **Its target must exist**, or it is a 404, and **a URL the target already links is refused** with a 409.
 * - **A decision is made once.** Each one moves the row out of `PENDING` with a conditional update, so two admins
 *   deciding the same suggestion cannot both win: the second gets a 409.
 * - **An accept makes the link through `createLink`**, so it is parsed, read from its provider, refused as a
 *   duplicate and audited like any other. It claims the row first and hands it back to `PENDING` if the create is
 *   refused, so a refused accept leaves the suggestion where it was. A target removed since the suggestion is a 404
 *   before anything is claimed: it can only be declined.
 */
import type { LinkSuggestion } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { createLink, type AdminLink } from '@/lib/app/links/admin';
import { parseLinkUrl } from '@/lib/app/links/providers';
import { resolveOwner, splitSoundKey, type OwnerKind, type OwnerRef } from '@/lib/app/links/owner';
import type {
  AdminLinkSuggestion,
  LinkSuggestionDecision,
  LinkSuggestionInput,
  LinkSuggestionStatus,
} from '@/lib/app/links/suggestion-data';

/**
 * The per-user sub-cap on suggesting (the proxy's `/api/v1` section cap still applies first): the synth suggestions'
 * ten an hour, on its own key, so suggesting synths and suggesting links do not share an allowance.
 */
export const linkSuggestionLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 10,
});

/** The limiter's key for a user. */
export const linkSuggestionLimitKey = (userId: string): string => `link-suggest:${userId}`;

const targetOf = (row: LinkSuggestion): OwnerRef => ({ kind: row.targetKind, id: row.targetId });

/** Record a user's suggestion, pending an admin. */
export async function createLinkSuggestion(
  userId: string,
  input: LinkSuggestionInput
): Promise<LinkSuggestion> {
  const parsed = parseLinkUrl(input.url);
  if (!parsed.ok) throw new ValidationError(parsed.problem, { url: parsed.problem });
  const owner = await resolveOwner(input.target);
  if (!owner) throw new NotFoundError('There is nothing with that id to suggest a link for');
  const listed = await prisma.externalLink.findFirst({
    where: { ...owner, url: parsed.link.url },
    select: { id: true },
  });
  if (listed) throw new ConflictError('That link is already listed here');
  return prisma.linkSuggestion.create({
    data: {
      userId,
      targetKind: input.target.kind,
      targetId: input.target.id,
      url: parsed.link.url,
      kind: input.kind,
      title: input.title ?? null,
      note: input.note ?? null,
    },
  });
}

const nameKey = (kind: OwnerKind, id: string) => `${kind}:${id}`;

/** The names of the suggestions' targets, by kind and id. A target that has since been removed has none. */
async function targetNames(rows: LinkSuggestion[]): Promise<Map<string, string>> {
  const ids = (kind: OwnerKind) => [
    ...new Set(rows.filter((r) => r.targetKind === kind).map((r) => r.targetId)),
  ];
  const instruments = ids('instrument');
  const songs = ids('song');
  const artists = ids('artist');
  const sounds = ids('sound').flatMap((key) => {
    const split = splitSoundKey(key);
    return split ? [split] : [];
  });
  const [instrumentRows, songRows, artistRows, soundRows] = await Promise.all([
    instruments.length
      ? prisma.bankInstrument.findMany({
          where: { id: { in: instruments } },
          select: { id: true, name: true },
        })
      : [],
    songs.length
      ? prisma.bankSong.findMany({
          where: { id: { in: songs } },
          select: { id: true, title: true },
        })
      : [],
    artists.length
      ? prisma.bankArtist.findMany({
          where: { id: { in: artists } },
          select: { id: true, name: true },
        })
      : [],
    sounds.length
      ? prisma.synthSound.findMany({
          where: { OR: sounds },
          select: { synthId: true, slug: true, name: true },
        })
      : [],
  ]);
  return new Map([
    ...instrumentRows.map((r) => [nameKey('instrument', r.id), r.name] as const),
    ...songRows.map((r) => [nameKey('song', r.id), r.title] as const),
    ...artistRows.map((r) => [nameKey('artist', r.id), r.name] as const),
    ...soundRows.map((r) => [nameKey('sound', `${r.synthId}/${r.slug}`), r.name] as const),
  ]);
}

/** The queue, newest first: one status, or every suggestion. The suggester is named by their account's name. */
export async function listLinkSuggestions(
  status?: LinkSuggestionStatus
): Promise<AdminLinkSuggestion[]> {
  const rows = await prisma.linkSuggestion.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  const userIds = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
  const [users, targets] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [],
    targetNames(rows),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    target: {
      kind: r.targetKind,
      id: r.targetId,
      name: targets.get(nameKey(r.targetKind, r.targetId)) ?? null,
    },
    url: r.url,
    kind: r.kind,
    title: r.title,
    note: r.note,
    status: r.status,
    linkId: r.linkId,
    reason: r.reason,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    suggestedBy: r.userId ? (names.get(r.userId) ?? null) : null,
  }));
}

export interface LinkDecisionResult {
  before: LinkSuggestion;
  after: LinkSuggestion;
  /** The link an accept made, as the links admin saved it. */
  created?: AdminLink;
}

/**
 * Decide a pending suggestion. Throws {@link NotFoundError} for an unknown id or, on accept, a target that has since
 * been removed; {@link ConflictError} when it is no longer pending; and whatever `createLink` throws when the link is
 * refused (already linked, no title to be had).
 */
export async function decideLinkSuggestion(
  id: string,
  decision: LinkSuggestionDecision
): Promise<LinkDecisionResult> {
  const before = await prisma.linkSuggestion.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('Suggestion not found');
  if (before.status !== 'PENDING') throw alreadyDecided(before);

  switch (decision.action) {
    case 'accept': {
      const target = targetOf(before);
      if (!(await resolveOwner(target)))
        throw new NotFoundError(
          'What this link was suggested for is no longer here, so it can only be declined'
        );
      const claimed = await claim(before, { status: 'ACCEPTED', reason: null });
      let created: AdminLink;
      try {
        created = await createLink({
          owner: target,
          url: before.url,
          kind: decision.kind ?? before.kind,
          title: decision.title ?? before.title ?? undefined,
          ours: false,
          rating: null,
        });
      } catch (err) {
        // The refusal is what the admin needs to see. A failed hand-back must not replace it.
        await prisma.linkSuggestion
          .update({ where: { id }, data: { status: 'PENDING', decidedAt: null } })
          .catch((rollbackErr: unknown) =>
            logger.error('Could not hand a refused link suggestion back to pending', rollbackErr, {
              suggestionId: id,
            })
          );
        throw err;
      }
      // The link is made either way; a failure here loses only the record of which link it became.
      await prisma.linkSuggestion
        .update({ where: { id }, data: { linkId: created.id } })
        .catch((recordErr: unknown) =>
          logger.error('Could not record the link an accepted suggestion became', recordErr, {
            suggestionId: id,
            linkId: created.id,
          })
        );
      return { before, after: { ...claimed, linkId: created.id }, created };
    }
    case 'decline': {
      const after = await claim(before, { status: 'DECLINED', reason: decision.reason });
      return { before, after };
    }
  }
}

/** Move a suggestion out of `PENDING`, only if it is still there. */
async function claim(
  before: LinkSuggestion,
  data: { status: LinkSuggestionStatus; reason: string | null }
): Promise<LinkSuggestion> {
  const decidedAt = new Date();
  const { count } = await prisma.linkSuggestion.updateMany({
    where: { id: before.id, status: 'PENDING' },
    data: { ...data, decidedAt },
  });
  if (count === 0) {
    const now = await prisma.linkSuggestion.findUnique({ where: { id: before.id } });
    if (!now) throw new NotFoundError('Suggestion not found');
    throw alreadyDecided(now);
  }
  return { ...before, ...data, decidedAt, updatedAt: decidedAt };
}

function alreadyDecided(row: LinkSuggestion): ConflictError {
  return new ConflictError(
    `This suggestion has already been decided (${row.status.toLowerCase()})`
  );
}
