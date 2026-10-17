import type { Prisma } from '@prisma/client';

import { LINK_PLATFORMS, readStoredLink, type LinkPlatform } from '@/lib/app/profile/links';
import { listInstruments } from '@/lib/app/profile/instruments';
import type { OwnedEntry } from '@/lib/app/profile/instruments-data';
import { usernameProblem } from '@/lib/app/profile/username';
import { prisma } from '@/lib/db/client';

/**
 * A synth profile as anyone may see it (`f-profiles` r3): what `/u/[username]` shows and
 * `GET /api/v1/profiles/:username` answers.
 *
 * **Only what the user switched on.** A private profile, an unknown name and a held one (given up by a change) all
 * read as null, the same answer, so a 404 says nothing about which. A held name is not followed to the new one:
 * that would publish the link between the two. Owned and wishlist are absent unless shown, not empty.
 *
 * **Never the account.** The username is the only name read. Nothing here selects from the user's own row, so the
 * account name and email cannot reach the answer however it is rendered.
 */

export interface PublicSynth {
  instrumentId: string;
  name: string;
  maker: string;
  year: string;
}

export interface PublicLink {
  platform: LinkPlatform;
  url: string;
  /** `@handle`, `name.bandcamp.com`, or the platform's name. */
  display: string;
}

export interface PublicProfile {
  username: string;
  /** The links the user has, in the settings form's order. */
  links: PublicLink[];
  /** Each present only when the user shows it, in their order. */
  owned?: PublicSynth[];
  wishlist?: PublicSynth[];
}

const PROFILE_SELECT = {
  userId: true,
  username: true,
  youtube: true,
  spotify: true,
  instagram: true,
  bandcamp: true,
  public: true,
  showOwned: true,
  showWishlist: true,
} as const satisfies Prisma.SynthProfileSelect;

/** The public profile under `username`, or null if there is none to show. */
export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const name = username.trim().toLowerCase();
  // a name no one could hold is not looked up
  if (usernameProblem(name) === 'shape') return null;

  const row = await prisma.synthProfile.findUnique({
    where: { username: name },
    select: PROFILE_SELECT,
  });
  if (!row || !row.public) return null;

  const links = LINK_PLATFORMS.flatMap((platform): PublicLink[] => {
    const link = readStoredLink(platform, row[platform]);
    return link ? [{ platform, ...link }] : [];
  });
  const profile: PublicProfile = { username: row.username, links };

  if (!row.showOwned && !row.showWishlist) return profile;

  // the owner's own read, so the two cannot drift; only the public fields leave it
  const lists = await listInstruments(row.userId);
  const toSynth = (e: OwnedEntry): PublicSynth => ({
    instrumentId: e.instrumentId,
    name: e.name,
    maker: e.maker,
    year: e.year,
  });
  if (row.showOwned) profile.owned = lists.owned.map(toSynth);
  if (row.showWishlist) profile.wishlist = lists.wishlist.map(toSynth);
  return profile;
}
