/**
 * What a link's provider says about it: its title, its picture, and for Bandcamp the id its embed needs
 * (`f-videos-and-links` t-180). Server-side only. Spec: `.context/app/links.md` → "Reading from providers".
 *
 * - **YouTube, Vimeo, Spotify and SoundCloud through oEmbed**, which needs no key. The address asked about is the
 *   canonical one `parseLinkUrl` built, so the request is always to one of four fixed endpoints.
 * - **Bandcamp from its page**: it has no oEmbed, and its embed id is not in its URL. The page's `og:video` names the
 *   embed (`…/EmbeddedPlayer/v=2/album=<n>/…`); the id is kept only when it has the shape `embedUrl` builds from.
 *   The page is only ever the artist's own `<artist>.bandcamp.com` page the parser accepted.
 * - **A plain link is never read**: it could point anywhere.
 * - **A picture is kept only on its provider's image hosts** (`safeThumbnailUrl`).
 * - **On any failure the answer is null**, and the admin's own title stands.
 */
import { z } from 'zod';
import { readJson, readText } from '@/lib/app/links/fetch';
import {
  isBandcampId,
  safeThumbnailUrl,
  type LinkProvider,
  type ParsedLink,
} from '@/lib/app/links/providers';
import { cleanInline, extractTextFromHtml } from '@/lib/orchestration/knowledge/parsers/dom-text';

/** What a provider said about a link. Each part may be missing. */
export interface LinkDetails {
  title: string | null;
  thumbnailUrl: string | null;
  /** Bandcamp only: `album=<n>` or `track=<n>`, read from the page. */
  providerId: string | null;
}

const TIMEOUT_MS = 5_000;
/** An oEmbed reply is a few hundred bytes of JSON (Spotify's and SoundCloud's carry an iframe snippet). */
const MAX_OEMBED_BYTES = 64 * 1024;
/** A Bandcamp page's head, where its `og:` tags are; the read stops at `</head>`. */
const MAX_PAGE_BYTES = 512 * 1024;
/** As an admin's title (`TitleSchema`). */
const MAX_TITLE_LENGTH = 200;

/** Each oEmbed endpoint, and the one host it is on. */
const OEMBED: Record<Exclude<LinkProvider, 'bandcamp' | 'other'>, string> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  vimeo: 'https://vimeo.com/api/oembed.json?url=',
  spotify: 'https://open.spotify.com/oembed?url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
};

const oEmbedSchema = z.object({
  title: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

/** A title as plain text: markup and entities decoded once, whitespace collapsed, cut by characters. Null if empty. */
export function cleanTitle(raw: string | undefined): string | null {
  if (!raw) return null;
  const chars = Array.from(cleanInline(extractTextFromHtml(raw)));
  if (chars.length === 0) return null;
  return chars.length > MAX_TITLE_LENGTH
    ? `${chars
        .slice(0, MAX_TITLE_LENGTH - 1)
        .join('')
        .trimEnd()}…`
    : chars.join('');
}

async function fromOEmbed(
  provider: Exclude<LinkProvider, 'bandcamp' | 'other'>,
  url: string
): Promise<LinkDetails | null> {
  const endpoint = OEMBED[provider];
  const body = await readJson(`${endpoint}${encodeURIComponent(url)}`, {
    hosts: new Set([new URL(endpoint).hostname]),
    maxBytes: MAX_OEMBED_BYTES,
    timeoutMs: TIMEOUT_MS,
    purpose: `oembed:${provider}`,
  });
  const parsed = oEmbedSchema.safeParse(body);
  if (!parsed.success) return null;
  const details: LinkDetails = {
    title: cleanTitle(parsed.data.title),
    thumbnailUrl: safeThumbnailUrl(provider, parsed.data.thumbnail_url ?? null),
    providerId: null,
  };
  return details.title || details.thumbnailUrl ? details : null;
}

/** Each `<meta property|name="…" content="…">` in an HTML head, by its property. The first of each wins. */
export function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? '');
    const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase();
    const content = attrs.get('content');
    if (key && content !== undefined && !out.has(key)) out.set(key, content);
  }
  return out;
}

/**
 * The embed id in a Bandcamp `og:video` address, when it is on bandcamp.com's player and has exactly one
 * `album=<n>` or `track=<n>` segment; else null.
 */
export function bandcampIdFromEmbed(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    // An attribute's `&amp;` is the only entity a URL here would carry.
    url = new URL(raw.replace(/&amp;/g, '&'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'bandcamp.com') return null;
  const parts = url.pathname.split('/').filter((s) => s.length > 0);
  if (parts[0] !== 'EmbeddedPlayer') return null;
  const ids = parts.filter((s) => /^(album|track)=/.test(s));
  return ids.length === 1 && isBandcampId(ids[0]) ? ids[0] : null;
}

async function fromBandcampPage(url: string): Promise<LinkDetails | null> {
  // The parser only names an artist's own `<artist>.bandcamp.com` page as Bandcamp, and the read reaches that host only.
  const host = new URL(url).hostname.toLowerCase();
  if (!host.endsWith('.bandcamp.com')) return null;
  const html = await readText(url, {
    hosts: new Set([host]),
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: TIMEOUT_MS,
    accept: 'text/html',
    stopAt: '</head>',
    purpose: 'page:bandcamp',
  });
  if (html === null) return null;
  const meta = metaTags(html);
  const details: LinkDetails = {
    title: cleanTitle(meta.get('og:title')),
    thumbnailUrl: safeThumbnailUrl('bandcamp', meta.get('og:image') ?? null),
    providerId: bandcampIdFromEmbed(meta.get('og:video') ?? meta.get('og:video:secure_url')),
  };
  return details.title || details.thumbnailUrl || details.providerId ? details : null;
}

/** What the link's provider says about it, or null when it said nothing usable (or it is a plain link). */
export async function resolveLinkDetails(link: ParsedLink): Promise<LinkDetails | null> {
  switch (link.provider) {
    case 'youtube':
    case 'vimeo':
    case 'spotify':
    case 'soundcloud':
      return fromOEmbed(link.provider, link.url);
    case 'bandcamp':
      return fromBandcampPage(link.url);
    case 'other':
      return null;
  }
}
