/**
 * A profile's links (`f-profiles` r1): one each for YouTube, Spotify, Instagram and Bandcamp, where someone's music
 * is.
 *
 * Each link is typed by a person and ends up in an `href` on a public page (`/u/<username>`, r3), so it is checked the
 * way BeatBreaker checks a channel link (`lib/app/breaks/community/channels.ts` there), field by field:
 *
 * - **https only, and only that platform's exact hosts.** A look-alike host (`youtube.com.evil.example`), a userinfo
 *   trick (`https://youtube.com@evil.example`), a non-default port and plain http are refused. The one subdomain rule
 *   is Bandcamp's, whose artist pages are `name.bandcamp.com`: exactly one label, held to Bandcamp's own name shape.
 * - **The handle or id is extracted** and checked against the platform's shape; nothing else from the typed string
 *   survives.
 * - **What is stored is the URL rebuilt from it**, never the string typed, so tracking parameters (Spotify's `?si=`)
 *   and anything else in the query or path are gone.
 *
 * The field decides the platform, and a link must be that field's platform: an Instagram address in the YouTube field
 * is refused, not moved. Links never embed, so nothing here touches the CSP.
 *
 * Pure and synchronous: it runs in the settings form and in the API schema, which must refuse the same things.
 */

export const LINK_PLATFORMS = ['youtube', 'spotify', 'instagram', 'bandcamp'] as const;
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export const LINK_LABELS: Record<LinkPlatform, string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  instagram: 'Instagram',
  bandcamp: 'Bandcamp',
};

/** What each field accepts, said wherever a link is refused, so the refusal names what would work. */
export const LINK_RULES: Record<LinkPlatform, string> = {
  youtube: 'Use the https link to your channel, youtube.com/@handle.',
  spotify: 'Use the https link to your artist page, open.spotify.com/artist/….',
  instagram: 'Use the https link to your profile, instagram.com/handle.',
  bandcamp: 'Use the https link to your Bandcamp page, name.bandcamp.com.',
};

export interface ProfileLink {
  /** The link as stored and as opened. */
  url: string;
  /** What a page shows for it: `@handle`, `name.bandcamp.com`, or the platform's name. */
  display: string;
}

/** Longer than any real profile address; bounds what the parser looks at. */
const MAX_URL = 300;

/* Paths on Instagram that are pages of the platform, not a person's. */
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'accounts',
  'stories',
  'tv',
  'direct',
]);

const YT_HANDLE = /^[A-Za-z0-9._-]{3,30}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
/** Spotify's localised paths: `open.spotify.com/intl-de/artist/…`. */
const SPOTIFY_LOCALE = /^intl-[a-z]{2}$/i;
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const BANDCAMP_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'];

function youtube(host: string, segments: string[]): ProfileLink | null {
  if (!YOUTUBE_HOSTS.includes(host)) return null;
  const [first, second] = segments;
  if (segments.length === 1 && first.startsWith('@')) {
    const handle = first.slice(1);
    if (!YT_HANDLE.test(handle)) return null;
    return { url: `https://www.youtube.com/@${handle}`, display: `@${handle}` };
  }
  if (segments.length === 2 && first === 'channel' && YT_CHANNEL_ID.test(second)) {
    return { url: `https://www.youtube.com/channel/${second}`, display: 'YouTube channel' };
  }
  return null;
}

function spotify(host: string, segments: string[]): ProfileLink | null {
  if (host !== 'open.spotify.com') return null;
  const path =
    segments.length === 3 && SPOTIFY_LOCALE.test(segments[0]) ? segments.slice(1) : segments;
  if (path.length !== 2 || path[0] !== 'artist' || !SPOTIFY_ID.test(path[1])) return null;
  return { url: `https://open.spotify.com/artist/${path[1]}`, display: 'Spotify' };
}

function instagram(host: string, segments: string[]): ProfileLink | null {
  if (!INSTAGRAM_HOSTS.includes(host) || segments.length !== 1) return null;
  const handle = segments[0];
  if (INSTAGRAM_RESERVED.has(handle.toLowerCase()) || !INSTAGRAM_HANDLE.test(handle)) return null;
  return { url: `https://www.instagram.com/${handle}`, display: `@${handle}` };
}

function bandcamp(host: string, segments: string[]): ProfileLink | null {
  const labels = host.split('.');
  // exactly `name.bandcamp.com`: not bandcamp.com itself, not a deeper subdomain, and only the root or /music
  if (labels.length !== 3 || labels[1] !== 'bandcamp' || labels[2] !== 'com') return null;
  const name = labels[0];
  if (name === 'www' || !BANDCAMP_NAME.test(name)) return null;
  if (segments.length > 1 || (segments.length === 1 && segments[0] !== 'music')) return null;
  return { url: `https://${name}.bandcamp.com`, display: `${name}.bandcamp.com` };
}

const PARSERS: Record<LinkPlatform, (host: string, segments: string[]) => ProfileLink | null> = {
  youtube,
  spotify,
  instagram,
  bandcamp,
};

/**
 * Read a link someone typed into one platform's field. `null` for anything that is not https, not on that platform's
 * hosts, or not a person's page there; the caller says that field's {@link LINK_RULES}.
 */
export function parseProfileLink(platform: LinkPlatform, input: string): ProfileLink | null {
  const raw = input.trim();
  if (raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  return PARSERS[platform](url.hostname.toLowerCase(), segments);
}

/**
 * A stored link read back. A row is external data, so it is re-parsed, and one that no longer passes (a rule
 * tightened, a hand-edited row) reads as no link rather than failing the read.
 */
export function readStoredLink(platform: LinkPlatform, stored: string | null): ProfileLink | null {
  return stored ? parseProfileLink(platform, stored) : null;
}
