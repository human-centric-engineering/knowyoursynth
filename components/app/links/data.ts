/**
 * Videos and links as the public pages read them (`f-videos-and-links` t-182): the shape of
 * `GET /api/v1/links`, checked on arrival, and the words the section uses for them. Spec: `.context/app/links.md`.
 */

import { z } from 'zod';
import {
  EMBED_ORIGINS,
  LINK_KINDS,
  LINK_PROVIDERS,
  type LinkKind,
} from '@/lib/app/links/providers';
import type { LinkSummary } from '@/lib/app/links/read';

export const LINKS_API = '/api/v1/links';

/** What a section lists the links of: a synth (its instruments' links together) or one databank instrument. */
export type LinksTarget = 'synth' | 'instrument';

const https = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  });

/**
 * An address the page will load in an iframe: on one of the embed origins, and nothing else, whatever the response
 * says. The server builds it with `embedUrl`; this is the same rule again where it is used.
 */
const embed = https.refine((value) =>
  EMBED_ORIGINS.some((origin) => value.startsWith(`${origin}/`))
);

export const PublicLinkSchema = z.object({
  id: z.string(),
  url: https,
  provider: z.enum(LINK_PROVIDERS),
  kind: z.enum(LINK_KINDS),
  title: z.string(),
  // A picture or an embed that fails the check is dropped, and the link still shows (as a plain link, unpictured).
  thumbnailUrl: https.nullable().catch(null),
  embedUrl: embed.nullable().catch(null),
  ours: z.boolean(),
  views: z.number().nullable(),
});
export type PublicLinkView = z.infer<typeof PublicLinkSchema>;

/** The links in a response, in its order. A row that does not parse is left out. */
export function readPublicLinks(data: unknown): PublicLinkView[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = PublicLinkSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export const KIND_LABEL: Record<LinkKind, string> = {
  demo: 'Demo',
  review: 'Review',
  performance: 'Recording',
  lesson: 'Lesson',
  original: 'Original',
};

const KIND_PLURAL: Record<LinkKind, string> = {
  demo: 'demos',
  review: 'reviews',
  performance: 'recordings',
  lesson: 'lessons',
  original: 'originals',
};

export const PROVIDER_NAME: Record<PublicLinkView['provider'], string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  spotify: 'Spotify',
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
  other: 'the web',
};

/** "demos, reviews and lessons". */
function listOf(words: string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The kinds the closed section names beside its count: "demos, reviews and lessons". */
export function kindsOf(summary: LinkSummary): string {
  return listOf(summary.kinds.map((k) => KIND_PLURAL[k]));
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** "1.2M views". Null without a count. */
export function viewsLabel(views: number | null): string | null {
  if (views === null) return null;
  return `${COMPACT.format(views)} view${views === 1 ? '' : 's'}`;
}

/** Which providers start on their own, and by what parameter; Spotify and Bandcamp take none. */
const AUTOPLAY: Partial<Record<PublicLinkView['provider'], [string, string]>> = {
  youtube: ['autoplay', '1'],
  vimeo: ['autoplay', '1'],
  soundcloud: ['auto_play', 'true'],
};

/** The player's address once Play is pressed: started where the provider allows, so it is one press, not two. */
export function playingUrl(provider: PublicLinkView['provider'], embed: string): string {
  const param = AUTOPLAY[provider];
  if (!param) return embed;
  const url = new URL(embed);
  url.searchParams.set(...param);
  return url.toString();
}
