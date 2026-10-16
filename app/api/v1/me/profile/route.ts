/**
 * The signed-in user's synth profile (`f-profiles` r1).
 *
 * GET /api/v1/me/profile — `{ username, nextChangeAt, links, public, showOwned, showWishlist }`, or `null` before a
 *     username is chosen.
 * PUT /api/v1/me/profile — the whole profile: `{ username, links: { youtube, spotify, instagram, bandcamp }, public,
 *     showOwned, showWishlist }`, a link blank or null for none. 200 with the profile. A username that breaks the
 *     rules, or a link that is not that platform's, is a 400 naming the field; a username that is taken, held after
 *     someone's change, or a change inside 30 days of the last is a 409 with the words to show.
 *
 * The username is the only name of the user's that is ever public; the account name and email never are. Scoped to
 * the caller by construction: `userId` comes from the session, never the body. The section rate limit applies
 * (`proxy.ts`); changing the username is held to once in 30 days by `lib/app/profile/profile.ts`, which is the limit
 * that matters.
 */
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { withAuth } from '@/lib/auth/guards';
import { getProfile, saveProfile } from '@/lib/app/profile/profile';
import { ProfileInputSchema } from '@/lib/app/profile/profile-data';

const OWNERSHIP = {
  decidedBy: 'self',
  because: "It reads and writes only the row keyed on the caller's own user id.",
} as const;

export const GET = withAuth(
  async (_request, session) => successResponse(await getProfile(session.user.id)),
  { ownership: OWNERSHIP }
);

export const PUT = withAuth(
  async (request, session) => {
    const input = await validateRequestBody(request, ProfileInputSchema);
    const profile = await saveProfile(session.user.id, input);
    const log = await getRouteLogger(request);
    log.info('Synth profile saved', { public: profile.public });
    return successResponse(profile);
  },
  { ownership: OWNERSHIP }
);
