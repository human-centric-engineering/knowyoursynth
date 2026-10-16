import { z } from 'zod';

import { LINK_RULES, parseProfileLink, type LinkPlatform } from '@/lib/app/profile/links';
import { usernameSchema } from '@/lib/app/profile/username';

/**
 * The shapes `/api/v1/me/profile` reads and answers (`f-profiles` r1). Client-safe: the settings form checks a draft
 * with the same schema the route does.
 */

/**
 * One platform's field: blank (or null) for no link, otherwise a link that platform's parser accepts, carried on as
 * the URL rebuilt from it.
 */
function linkField(platform: LinkPlatform) {
  return z
    .string()
    .nullable()
    .transform((raw, ctx) => {
      const typed = raw?.trim() ?? '';
      if (typed === '') return null;
      const parsed = parseProfileLink(platform, typed);
      if (!parsed) {
        ctx.addIssue({ code: 'custom', message: LINK_RULES[platform] });
        return z.NEVER;
      }
      return parsed.url;
    });
}

export const ProfileLinksSchema = z.object({
  youtube: linkField('youtube'),
  spotify: linkField('spotify'),
  instagram: linkField('instagram'),
  bandcamp: linkField('bandcamp'),
});

/** `PUT /api/v1/me/profile`: the whole profile, as the form holds it. */
export const ProfileInputSchema = z.object({
  username: usernameSchema,
  links: ProfileLinksSchema,
  public: z.boolean(),
  showOwned: z.boolean(),
  showWishlist: z.boolean(),
});
export type ProfileInput = z.output<typeof ProfileInputSchema>;

export type ProfileLinks = Record<LinkPlatform, string | null>;

/** What the route answers: the profile, or `null` before a username is chosen. */
export interface ProfileView {
  username: string;
  /** When the username may next change (ISO); null if it may change now. */
  nextChangeAt: string | null;
  /** Each link as stored, rebuilt; null for none. */
  links: ProfileLinks;
  public: boolean;
  showOwned: boolean;
  showWishlist: boolean;
}

/** The answer, checked on the client rather than cast. */
export const ProfileViewSchema = z.object({
  username: z.string(),
  nextChangeAt: z.string().nullable(),
  links: z.object({
    youtube: z.string().nullable(),
    spotify: z.string().nullable(),
    instagram: z.string().nullable(),
    bandcamp: z.string().nullable(),
  }),
  public: z.boolean(),
  showOwned: z.boolean(),
  showWishlist: z.boolean(),
});
