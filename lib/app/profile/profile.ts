import { ConflictError } from '@/lib/api/errors';
import { readStoredLink, type LinkPlatform } from '@/lib/app/profile/links';
import type { ProfileInput, ProfileLinks, ProfileView } from '@/lib/app/profile/profile-data';
import {
  USERNAME_CHANGE_DAYS,
  USERNAME_HOLD_DAYS,
  USERNAME_MESSAGES,
  usernameProblem,
} from '@/lib/app/profile/username';
import { prisma } from '@/lib/db/client';

/**
 * A user's synth profile (`f-profiles` r1): the username their public page goes under, their links, and who may see
 * it.
 *
 * **Server-side only.** The rules are `username.ts` and `links.ts`; this is where they meet the database: whether a
 * name is taken or held, and the once-a-month limit on changing it. Owner-scoped by construction: every query is keyed
 * on the caller's own user id.
 *
 * A username given up by a change is held for {@link USERNAME_HOLD_DAYS} days. One freed by erasing the account is
 * not: holding it would keep a row about someone who asked to be forgotten.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface ProfileRow {
  username: string;
  usernameChangedAt: Date | null;
  youtube: string | null;
  spotify: string | null;
  instagram: string | null;
  bandcamp: string | null;
  public: boolean;
  showOwned: boolean;
  showWishlist: boolean;
}

function nextChange(changedAt: Date | null, now: Date): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + USERNAME_CHANGE_DAYS * DAY_MS);
  return next > now ? next : null;
}

function view(row: ProfileRow, now: Date): ProfileView {
  const stored = (platform: LinkPlatform) => readStoredLink(platform, row[platform])?.url ?? null;
  const links: ProfileLinks = {
    youtube: stored('youtube'),
    spotify: stored('spotify'),
    instagram: stored('instagram'),
    bandcamp: stored('bandcamp'),
  };
  return {
    username: row.username,
    nextChangeAt: nextChange(row.usernameChangedAt, now)?.toISOString() ?? null,
    links,
    public: row.public,
    showOwned: row.showOwned,
    showWishlist: row.showWishlist,
  };
}

/** The caller's profile, or null before they have chosen a username. */
export async function getProfile(userId: string, now = new Date()): Promise<ProfileView | null> {
  const row = await prisma.synthProfile.findUnique({ where: { userId } });
  return row ? view(row, now) : null;
}

/**
 * Whether `username` could be the caller's: refused for its shape or as unavailable, or taken by someone else, or
 * held after someone's change. The caller's own current name is available to them.
 */
async function availability(
  username: string,
  userId: string,
  now: Date
): Promise<'shape' | 'unavailable' | 'taken' | null> {
  const problem = usernameProblem(username);
  if (problem) return problem;
  const [holder, held] = await Promise.all([
    prisma.synthProfile.findUnique({ where: { username }, select: { userId: true } }),
    prisma.heldUsername.findUnique({ where: { username }, select: { heldUntil: true } }),
  ]);
  if (holder) return holder.userId === userId ? null : 'taken';
  /* A held name reads as taken, not as unavailable: it is someone's, for now, and saying so does not say whose. */
  if (held && held.heldUntil > now) return 'taken';
  return null;
}

const isUniqueClash = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';

/**
 * Choose a username, change it, or change the links and who sees the profile.
 *
 * - Choosing the first username is not a change, and is not limited.
 * - Changing it is allowed once per {@link USERNAME_CHANGE_DAYS} days, and the old name is held for
 *   {@link USERNAME_HOLD_DAYS} days so nobody can take it while links to the old address still circulate.
 * - A name that is taken, held or not allowed is a 409 with the words to show. Two people claiming the same free name
 *   at once meet the unique index, and the second is told it is taken.
 */
export async function saveProfile(
  userId: string,
  input: ProfileInput,
  now = new Date()
): Promise<ProfileView> {
  const { username } = input;
  const current = await prisma.synthProfile.findUnique({ where: { userId } });
  const changing = current !== null && current.username !== username;

  if (changing) {
    const next = nextChange(current.usernameChangedAt, now);
    if (next) {
      throw new ConflictError(
        `You can change your username once every ${USERNAME_CHANGE_DAYS} days. The next change can be made on ${next.toISOString().slice(0, 10)}.`,
        { username: ['too soon'] }
      );
    }
  }
  if (!current || changing) {
    const refused = await availability(username, userId, now);
    if (refused) throw new ConflictError(USERNAME_MESSAGES[refused], { username: [refused] });
  }

  const settings = {
    ...input.links,
    public: input.public,
    showOwned: input.showOwned,
    showWishlist: input.showWishlist,
  };

  try {
    const row = await prisma.$transaction(async (tx) => {
      if (!current || changing) {
        // a lapsed hold is cleared as the name is claimed, so its key is free
        await tx.heldUsername.deleteMany({ where: { username, heldUntil: { lte: now } } });
      }
      let saved: ProfileRow;
      if (!current) {
        saved = await tx.synthProfile.create({ data: { userId, username, ...settings } });
      } else if (changing) {
        /* Keyed on the name we read as well as the user: a second change racing this one finds the row already moved
           on, and is refused rather than spending two changes and dropping the first new name with no hold. */
        const moved = await tx.synthProfile.updateMany({
          where: { userId, username: current.username },
          data: { username, usernameChangedAt: now, ...settings },
        });
        if (moved.count === 0)
          throw new ConflictError(USERNAME_MESSAGES.changed, { username: ['changed'] });
        const heldUntil = new Date(now.getTime() + USERNAME_HOLD_DAYS * DAY_MS);
        await tx.heldUsername.upsert({
          where: { username: current.username },
          create: { username: current.username, heldUntil },
          update: { heldUntil },
        });
        saved = await tx.synthProfile.findUniqueOrThrow({ where: { userId } });
      } else {
        saved = await tx.synthProfile.update({ where: { userId }, data: settings });
      }
      if (!current || changing) {
        /* Checked again after the write: the write waits on anyone giving this name up at the same moment, so a hold
           they commit is visible here, and the name is not claimed out from under it. */
        const held = await tx.heldUsername.findUnique({
          where: { username },
          select: { heldUntil: true },
        });
        if (held && held.heldUntil > now)
          throw new ConflictError(USERNAME_MESSAGES.taken, { username: ['taken'] });
      }
      return saved;
    });
    return view(row, now);
  } catch (error) {
    if (!isUniqueClash(error)) throw error;
    /* The same user's first save sent twice meets the primary key, not someone else's name: answer with what landed. */
    const landed = await prisma.synthProfile.findUnique({ where: { userId } });
    if (landed && landed.username === username) return view(landed, now);
    throw new ConflictError(USERNAME_MESSAGES.taken, { username: ['taken'] });
  }
}
