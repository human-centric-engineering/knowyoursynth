/**
 * Where a link points, and how it plays (`f-videos-and-links` t-179). Pure. Spec: `.context/app/links.md`.
 *
 * The rules, each tested:
 *
 * - **https only**, no credentials, no port, a real host name. `sanitizeUrl` runs first, so control characters and
 *   script schemes are gone before anything is parsed.
 * - **A provider is named by its host, matched exactly or as a sub-domain** (`m.youtube.com`), never by a substring:
 *   `youtube.com.example.test` is `other`, and so is `notyoutube.com`.
 * - **A named provider's link must have its id**: a YouTube URL with no video id is refused, not stored as `other`,
 *   because an admin who pasted it meant a video.
 * - **The stored URL is canonical**, rebuilt from the provider and its id, so the same video pasted two ways is one
 *   link (the table is unique on owner + URL). An `other` link keeps its URL as given, less any fragment.
 * - **An embed address is only ever built from the provider and its id** (`embedUrl`), never taken from the stored
 *   URL. Bandcamp's id is not in its URL; until t-180 reads it from the page, a Bandcamp link opens in a new tab.
 */
import { sanitizeUrl } from '@/lib/security/sanitize';

export const LINK_PROVIDERS = [
  'youtube',
  'vimeo',
  'spotify',
  'bandcamp',
  'soundcloud',
  'other',
] as const;
export type LinkProvider = (typeof LINK_PROVIDERS)[number];

export const LINK_KINDS = ['demo', 'review', 'performance', 'lesson', 'original'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** A URL an admin gave, understood. */
export interface ParsedLink {
  provider: LinkProvider;
  /** The provider's id, from which the embed is built. Null for `other`, and for Bandcamp until t-180. */
  providerId: string | null;
  /** The URL to store and to link to. */
  url: string;
}

export type ParseResult = { ok: true; link: ParsedLink } | { ok: false; problem: string };

/**
 * The origins an embed can be loaded from: `frame-src` for the synth page (t-182 puts them in `lib/app/csp.ts`).
 * Every address `embedUrl` builds is on one of these.
 */
export const EMBED_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
  'https://bandcamp.com',
  'https://w.soundcloud.com',
] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
/** An unlisted Vimeo video's privacy hash: without it the video will not play. */
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;
/** A Vimeo `providerId`: the video, and for an unlisted one `:<hash>`. */
const VIMEO_PROVIDER_ID = /^(\d{1,12})(?::([0-9a-f]{6,20}))?$/;
const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'episode', 'show', 'artist'] as const;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_PROVIDER_ID = /^(track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{22}$/;
const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
const SOUNDCLOUD_RESERVED = new Set([
  'discover',
  'stream',
  'search',
  'upload',
  'you',
  'charts',
  'pages',
  'settings',
  'messages',
  'notifications',
  'terms-of-use',
  'imprint',
]);
/** A user's own pages, which sit where a track's slug would: never a track. */
const SOUNDCLOUD_USER_PAGES = new Set([
  'likes',
  'tracks',
  'albums',
  'sets',
  'reposts',
  'popular-tracks',
  'followers',
  'following',
  'comments',
  'spotlight',
]);
/** A private SoundCloud track's or set's share token: case matters, and the embed fails without it. */
const SOUNDCLOUD_TOKEN = /^s-[A-Za-z0-9]{3,40}$/;
const BANDCAMP_PROVIDER_ID = /^(album|track)=\d{1,15}$/;
const MAX_URL_LENGTH = 2000;

/** True when `host` is `domain` or a sub-domain of it. */
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** The path's non-empty segments. */
function segments(url: URL): string[] {
  return url.pathname.split('/').filter((s) => s.length > 0);
}

function youtubeId(url: URL, host: string): string | null {
  const parts = segments(url);
  if (host === 'youtu.be') return parts[0] ?? null;
  if (parts[0] === 'watch') return url.searchParams.get('v');
  if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') return parts[1] ?? null;
  return null;
}

function parseYouTube(url: URL, host: string): ParseResult {
  const id = youtubeId(url, host);
  if (!id || !YOUTUBE_ID.test(id))
    return { ok: false, problem: 'A YouTube link needs a video in it.' };
  return {
    ok: true,
    link: { provider: 'youtube', providerId: id, url: `https://www.youtube.com/watch?v=${id}` },
  };
}

/**
 * The video and its privacy hash, from the shapes a video's own address takes. A showcase, album or user page is
 * not a video, even when it ends in a number, so anything else is null.
 */
function vimeoVideo(url: URL, host: string): { id: string; hash: string | null } | null {
  const parts = segments(url);
  const queryHash = url.searchParams.get('h');
  let id: string | undefined;
  let hash: string | null | undefined = queryHash;
  if (host === 'player.vimeo.com') {
    if (parts[0] !== 'video' || parts.length !== 2) return null;
    id = parts[1];
  } else if (parts.length === 1 || (parts.length === 2 && VIMEO_ID.test(parts[0]))) {
    // vimeo.com/<id>, or an unlisted vimeo.com/<id>/<hash>.
    id = parts[0];
    if (parts.length === 2) hash = parts[1];
  } else if (parts[0] === 'channels' && parts.length === 3) {
    id = parts[2];
  } else if (parts[0] === 'groups' && parts[2] === 'videos' && parts.length === 4) {
    id = parts[3];
  } else return null;
  if (!id || !VIMEO_ID.test(id)) return null;
  if (hash && !VIMEO_HASH.test(hash)) return null;
  return { id, hash: hash ?? null };
}

function parseVimeo(url: URL, host: string): ParseResult {
  const video = vimeoVideo(url, host);
  if (!video) return { ok: false, problem: 'A Vimeo link needs a video in it.' };
  const { id, hash } = video;
  return {
    ok: true,
    link: {
      provider: 'vimeo',
      providerId: hash ? `${id}:${hash}` : id,
      url: hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`,
    },
  };
}

function parseSpotify(url: URL): ParseResult {
  const parts = segments(url);
  // A localised link has an `intl-xx` segment first; an embed link has `embed`.
  const rest = parts[0]?.startsWith('intl-') || parts[0] === 'embed' ? parts.slice(1) : parts;
  const [type, id] = rest;
  if (
    !type ||
    !id ||
    !(SPOTIFY_TYPES as readonly string[]).includes(type) ||
    !SPOTIFY_ID.test(id) ||
    rest.length !== 2
  )
    return {
      ok: false,
      problem: 'A Spotify link needs a track, album, playlist, episode, show or artist in it.',
    };
  return {
    ok: true,
    link: {
      provider: 'spotify',
      providerId: `${type}/${id}`,
      url: `https://open.spotify.com/${type}/${id}`,
    },
  };
}

/** `<user>/<track>[/<token>]` or `<user>/sets/<set>[/<token>]`: the path lower-cased, the share token as given. */
function soundCloudPath(parts: string[]): string | null {
  const [user, second, third, fourth] = parts;
  if (!user || !second || !SLUG.test(user) || SOUNDCLOUD_RESERVED.has(user.toLowerCase()))
    return null;
  const isSet = second.toLowerCase() === 'sets';
  const name = isSet ? third : second;
  const token = isSet ? fourth : third;
  const length = (isSet ? 3 : 2) + (token ? 1 : 0);
  if (!name || !SLUG.test(name) || parts.length !== length) return null;
  if (!isSet && SOUNDCLOUD_USER_PAGES.has(name.toLowerCase())) return null;
  if (token && !SOUNDCLOUD_TOKEN.test(token)) return null;
  const path = [user, ...(isSet ? ['sets'] : []), name].join('/').toLowerCase();
  return token ? `${path}/${token}` : path;
}

function parseSoundCloud(url: URL): ParseResult {
  const id = soundCloudPath(segments(url));
  if (!id) return { ok: false, problem: 'A SoundCloud link needs a track or a set in it.' };
  return {
    ok: true,
    link: { provider: 'soundcloud', providerId: id, url: `https://soundcloud.com/${id}` },
  };
}

function parseBandcamp(url: URL, host: string): ParseResult {
  const artist = host.slice(0, -'.bandcamp.com'.length);
  const [type, slug] = segments(url);
  if (
    !SLUG.test(artist) ||
    artist === 'www' ||
    (type !== 'track' && type !== 'album') ||
    !slug ||
    !SLUG.test(slug)
  )
    return { ok: false, problem: 'A Bandcamp link needs a track or an album in it.' };
  return {
    ok: true,
    link: {
      provider: 'bandcamp',
      providerId: null,
      url: `https://${artist.toLowerCase()}.bandcamp.com/${type}/${slug.toLowerCase()}`,
    },
  };
}

/** Read a URL an admin gave: its provider, the provider's id, and the URL to store. */
export function parseLinkUrl(input: string): ParseResult {
  const cleaned = sanitizeUrl(input.trim());
  if (!cleaned) return { ok: false, problem: 'That is not a web address.' };
  if (cleaned.length > MAX_URL_LENGTH) return { ok: false, problem: 'That address is too long.' };

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return { ok: false, problem: 'That is not a web address.' };
  }
  if (url.protocol !== 'https:')
    return { ok: false, problem: 'Only https addresses can be linked.' };
  if (url.username || url.password)
    return { ok: false, problem: 'An address with a login in it cannot be linked.' };
  if (url.port) return { ok: false, problem: 'An address with a port in it cannot be linked.' };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('['))
    return { ok: false, problem: 'That address has no proper site name.' };

  if (
    host === 'youtu.be' ||
    onDomain(host, 'youtube.com') ||
    onDomain(host, 'youtube-nocookie.com')
  )
    return parseYouTube(url, host);
  if (onDomain(host, 'vimeo.com')) return parseVimeo(url, host);
  if (host === 'open.spotify.com') return parseSpotify(url);
  if (host === 'soundcloud.com' || host === 'www.soundcloud.com' || host === 'm.soundcloud.com')
    return parseSoundCloud(url);
  if (host.endsWith('.bandcamp.com')) return parseBandcamp(url, host);

  url.hash = '';
  return { ok: true, link: { provider: 'other', providerId: null, url: url.toString() } };
}

/**
 * The address to load in an iframe for a link, built from its provider and id only. Null when it does not embed: an
 * `other` link, a Bandcamp link whose id has not been read yet, or an id that does not have its provider's shape.
 */
export function embedUrl(provider: LinkProvider, providerId: string | null): string | null {
  if (!providerId) return null;
  switch (provider) {
    case 'youtube':
      return YOUTUBE_ID.test(providerId)
        ? `https://www.youtube-nocookie.com/embed/${providerId}`
        : null;
    case 'vimeo': {
      const match = VIMEO_PROVIDER_ID.exec(providerId);
      if (!match) return null;
      const [, id, hash] = match;
      return hash
        ? `https://player.vimeo.com/video/${id}?h=${hash}&dnt=1`
        : `https://player.vimeo.com/video/${id}?dnt=1`;
    }
    case 'spotify':
      return SPOTIFY_PROVIDER_ID.test(providerId)
        ? `https://open.spotify.com/embed/${providerId}`
        : null;
    case 'soundcloud': {
      // Re-read through the parser's own rule, so only a path it would have produced is embedded.
      return soundCloudPath(providerId.split('/')) === providerId
        ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${providerId}`)}`
        : null;
    }
    case 'bandcamp':
      return BANDCAMP_PROVIDER_ID.test(providerId)
        ? `https://bandcamp.com/EmbeddedPlayer/${providerId}/size=large/tracklist=false/transparent=true/`
        : null;
    case 'other':
      return null;
  }
}

/** A link's picture: the one read from its provider, else (YouTube only) the one its id names, else none. */
export function thumbnailFor(
  provider: LinkProvider,
  providerId: string | null,
  stored: string | null
): string | null {
  if (stored) return stored;
  if (provider === 'youtube' && providerId && YOUTUBE_ID.test(providerId))
    return `https://i.ytimg.com/vi/${providerId}/hqdefault.jpg`;
  return null;
}
