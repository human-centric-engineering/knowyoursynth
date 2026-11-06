/**
 * The videos and recordings an owner puts on their own sound (`f-link-suggestions` t-187). Server-side only. Spec:
 * `.context/app/links.md` → "Links on your own sounds".
 *
 * Not `ExternalLink` rows: that table is shared settings, owned by the catalogue. A sound's links are a JSON column on
 * the sound (`UserSound.links`), so they go with it: erased with it, exported with it, and moderated with it. The rules,
 * each tested:
 *
 * - **At most five** (`MAX_SOUND_LINKS`), in the owner's order, with no draw: they are not ranked or counted.
 * - **Only the five named providers.** A plain web address is refused: on a public page, a user's link to anywhere is a
 *   spam or phishing surface no admin has looked at. Suggestions may be plain links, because an admin decides those.
 * - **Each is parsed by `parseLinkUrl` and read from its provider on save**, so what is stored is the canonical address,
 *   the provider's id and picture, and a title (the owner's, else the provider's). An address the sound already had is
 *   not read again: saving the list with one more link reads that one. The same address twice is refused.
 * - **Checked again on read**: a stored entry whose address no longer parses to its provider is not served.
 * - **A copy drops them** (`createUserSound` never carries them): someone's demo of their sound is not the copier's.
 * - Saving them reads providers, so the PATCH that sends them has its own sub-cap (`soundLinksLimiter`).
 */
import { z } from 'zod';
import { ValidationError } from '@/lib/api/errors';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { resolveLinkDetails } from '@/lib/app/links/details';
import {
  embedUrl,
  LINK_PROVIDERS,
  parseLinkUrl,
  thumbnailFor,
  type ParsedLink,
} from '@/lib/app/links/providers';
import type { SoundLink, SoundLinkInput } from '@/lib/app/sounds/data';

/**
 * The per-user sub-cap on saving a sound's links (the proxy's `/api/v1` section cap still applies first): each save may
 * read up to five providers.
 */
export const soundLinksLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 20,
});

/** The limiter's key for a user. */
export const soundLinksLimitKey = (userId: string): string => `sound-links:${userId}`;

const SOUND_LINK_PROVIDERS = LINK_PROVIDERS.filter(
  (p): p is SoundLink['provider'] => p !== 'other'
);

/** One entry of `UserSound.links` as it is stored. */
const StoredSoundLinkSchema = z.object({
  url: z.string(),
  provider: z.enum(SOUND_LINK_PROVIDERS),
  providerId: z.string().nullable(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
});
export type StoredSoundLink = z.infer<typeof StoredSoundLinkSchema>;

/** The stored links that still read as they were written, in order. An entry that does not is left out. */
export function storedSoundLinks(raw: unknown): StoredSoundLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = StoredSoundLinkSchema.safeParse(entry);
    if (!parsed.success) return [];
    const again = parseLinkUrl(parsed.data.url);
    return again.ok &&
      again.link.provider === parsed.data.provider &&
      again.link.url === parsed.data.url
      ? [parsed.data]
      : [];
  });
}

/** The stored links as the owner and the public page are served them: the embed and picture built here, not stored. */
export function servedSoundLinks(raw: unknown): SoundLink[] {
  return storedSoundLinks(raw).map((l) => ({
    url: l.url,
    provider: l.provider,
    title: l.title,
    thumbnailUrl: thumbnailFor(l.provider, l.providerId, l.thumbnailUrl),
    embedUrl: embedUrl(l.provider, l.providerId),
  }));
}

type Problem = { path: string; message: string };

function refuse(problems: Problem[]): never {
  throw new ValidationError(problems[0].message, { errors: problems });
}

/**
 * The links an owner sent, parsed and read from their providers, as they are stored: or a 400 naming every problem.
 * `current` is what the sound has now, whose addresses are not read again.
 */
export async function resolveSoundLinks(
  input: SoundLinkInput[],
  current: StoredSoundLink[]
): Promise<StoredSoundLink[]> {
  const problems: Problem[] = [];
  const parsed: (ParsedLink & { provider: SoundLink['provider'] })[] = [];
  const seen = new Set<string>();
  input.forEach((entry, i) => {
    const result = parseLinkUrl(entry.url);
    if (!result.ok) return problems.push({ path: `links.${i}.url`, message: result.problem });
    const { link } = result;
    if (link.provider === 'other')
      return problems.push({
        path: `links.${i}.url`,
        message: 'Only YouTube, Vimeo, Spotify, Bandcamp and SoundCloud links can go on a patch.',
      });
    if (seen.has(link.url))
      return problems.push({ path: `links.${i}.url`, message: 'That link is listed twice.' });
    seen.add(link.url);
    parsed.push({ ...link, provider: link.provider });
  });
  if (problems.length > 0) refuse(problems);

  const had = new Map(current.map((l) => [l.url, l]));
  const resolved = await Promise.all(
    parsed.map(async (link, i): Promise<StoredSoundLink | Problem> => {
      const given = input[i].title || null;
      const kept = had.get(link.url);
      if (kept)
        return {
          url: link.url,
          provider: kept.provider,
          providerId: kept.providerId,
          title: given ?? kept.title,
          thumbnailUrl: kept.thumbnailUrl,
        };
      // never throws: a provider that does not answer leaves the picture empty, and the owner's title must stand
      const details = await resolveLinkDetails(link);
      const title = given ?? details?.title ?? null;
      if (!title)
        return {
          path: `links.${i}.title`,
          message: 'Its title could not be read from the link: give it one.',
        };
      return {
        url: link.url,
        provider: link.provider,
        // Bandcamp's id is only on its page; every other provider's came from the URL
        providerId: link.provider === 'bandcamp' ? (details?.providerId ?? null) : link.providerId,
        title,
        thumbnailUrl: details?.thumbnailUrl ?? null,
      };
    })
  );
  const failed = resolved.filter((r): r is Problem => 'path' in r);
  if (failed.length > 0) refuse(failed);
  return resolved.filter((r): r is StoredSoundLink => !('path' in r));
}
