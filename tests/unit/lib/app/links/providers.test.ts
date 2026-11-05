/**
 * Unit Tests: reading a link's URL, and building its embed and thumbnail (`f-videos-and-links` t-179).
 *
 * Pins: each provider's accepted shapes and canonical URL; refusals (scheme, login, port, IP, a named provider with no
 * id); look-alike hosts read as `other`, never as the provider; embeds built only from an id of the provider's shape
 * and always on one of `EMBED_ORIGINS`.
 */
import { describe, expect, it } from 'vitest';
import {
  EMBED_ORIGINS,
  embedUrl,
  LINK_PROVIDERS,
  parseLinkUrl,
  thumbnailFor,
  type ParsedLink,
} from '@/lib/app/links/providers';

const VIDEO = 'dQw4w9WgXcQ';
const SPOTIFY = '4uLU6hMCjMI75M1A2tKUQC';

function ok(input: string): ParsedLink {
  const result = parseLinkUrl(input);
  if (!result.ok) throw new Error(`expected ${input} to parse, got: ${result.problem}`);
  return result.link;
}
function problem(input: string): string {
  const result = parseLinkUrl(input);
  if (result.ok)
    throw new Error(`expected ${input} to be refused, got ${JSON.stringify(result.link)}`);
  return result.problem;
}

describe('parseLinkUrl: YouTube', () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO}`,
    `https://youtube.com/watch?v=${VIDEO}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${VIDEO}`,
    `https://music.youtube.com/watch?v=${VIDEO}`,
    `https://youtu.be/${VIDEO}?si=abc`,
    `https://www.youtube.com/shorts/${VIDEO}`,
    `https://www.youtube.com/live/${VIDEO}`,
    `https://www.youtube.com/embed/${VIDEO}`,
    `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    `  https://WWW.YouTube.com/watch?v=${VIDEO}  `,
  ])('reads %s as the one canonical video', (input) => {
    expect(ok(input)).toEqual({
      provider: 'youtube',
      providerId: VIDEO,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
    });
  });

  it.each([
    'https://www.youtube.com/@moogmusic',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=PL123',
    'https://youtu.be/',
  ])('refuses %s, a YouTube page that is not a video, rather than storing it as other', (input) => {
    expect(problem(input)).toMatch(/YouTube link needs a video/);
  });
});

describe('parseLinkUrl: the other providers', () => {
  it('reads Vimeo videos, channel videos and player links as one canonical video', () => {
    for (const input of [
      'https://vimeo.com/76979871',
      'https://vimeo.com/channels/staffpicks/76979871',
      'https://player.vimeo.com/video/76979871?h=abc',
    ])
      expect(ok(input)).toEqual({
        provider: 'vimeo',
        providerId: '76979871',
        url: 'https://vimeo.com/76979871',
      });
    expect(problem('https://vimeo.com/moogmusic')).toMatch(/Vimeo/);
  });

  it('reads Spotify tracks, albums and the rest, localised and embed links included', () => {
    for (const input of [
      `https://open.spotify.com/track/${SPOTIFY}?si=xyz`,
      `https://open.spotify.com/intl-de/track/${SPOTIFY}`,
      `https://open.spotify.com/embed/track/${SPOTIFY}`,
    ])
      expect(ok(input)).toEqual({
        provider: 'spotify',
        providerId: `track/${SPOTIFY}`,
        url: `https://open.spotify.com/track/${SPOTIFY}`,
      });
    expect(ok(`https://open.spotify.com/album/${SPOTIFY}`).providerId).toBe(`album/${SPOTIFY}`);
    expect(problem(`https://open.spotify.com/user/${SPOTIFY}`)).toMatch(/Spotify/);
    expect(problem('https://open.spotify.com/track/tooshort')).toMatch(/Spotify/);
    expect(problem(`https://open.spotify.com/track/${SPOTIFY}/extra`)).toMatch(/Spotify/);
  });

  it('reads SoundCloud tracks and sets, lower-cased, and refuses its own pages', () => {
    expect(ok('https://soundcloud.com/Aphex-Twin/Xtal?in=foo')).toEqual({
      provider: 'soundcloud',
      providerId: 'aphex-twin/xtal',
      url: 'https://soundcloud.com/aphex-twin/xtal',
    });
    expect(ok('https://m.soundcloud.com/warp/sets/selected').providerId).toBe('warp/sets/selected');
    expect(problem('https://soundcloud.com/aphex-twin')).toMatch(/SoundCloud/);
    expect(problem('https://soundcloud.com/discover/sets')).toMatch(/SoundCloud/);
  });

  it('reads Bandcamp tracks and albums with no embed id yet, and refuses anything else there', () => {
    expect(ok('https://Boards.bandcamp.com/album/Geogaddi#about')).toEqual({
      provider: 'bandcamp',
      providerId: null,
      url: 'https://boards.bandcamp.com/album/geogaddi',
    });
    expect(problem('https://boards.bandcamp.com/merch')).toMatch(/Bandcamp/);
    expect(problem('https://www.bandcamp.com/album/x')).toMatch(/Bandcamp/);
  });

  it('keeps any other https address as given, less its fragment', () => {
    expect(ok('https://www.soundonsound.com/reviews/moog-model-d?x=1#comments')).toEqual({
      provider: 'other',
      providerId: null,
      url: 'https://www.soundonsound.com/reviews/moog-model-d?x=1',
    });
  });
});

describe('parseLinkUrl: look-alikes and refusals', () => {
  it.each([
    `https://youtube.com.evil.test/watch?v=${VIDEO}`,
    `https://notyoutube.com/watch?v=${VIDEO}`,
    `https://evil-youtu.be.example/${VIDEO}`,
    'https://soundcloud.com.example/aphex-twin/xtal',
    `https://open.spotify.com.example/track/${SPOTIFY}`,
    'https://notvimeo.com/76979871',
  ])('reads %s as other, never as the provider it imitates', (input) => {
    const link = ok(input);
    expect(link.provider).toBe('other');
    expect(embedUrl(link.provider, link.providerId)).toBeNull();
  });

  it('refuses script, data and plain-http schemes, logins, ports, IPs and non-addresses', () => {
    expect(problem('javascript:alert(1)')).toMatch(/not a web address/);
    expect(problem('data:text/html,<b>x</b>')).toMatch(/not a web address/);
    expect(problem(`http://www.youtube.com/watch?v=${VIDEO}`)).toMatch(/Only https/);
    expect(problem('ftp://example.com/x')).toMatch(/Only https|not a web address/);
    expect(problem('https://user:pass@example.com/')).toMatch(/login/);
    expect(problem('https://example.com:8443/')).toMatch(/port/);
    expect(problem('https://127.0.0.1/')).toMatch(/site name/);
    expect(problem('https://localhost/')).toMatch(/site name/);
    expect(problem('https://[::1]/')).toMatch(/site name/);
    expect(problem('not a url')).toMatch(/not a web address/);
    expect(problem(`https://example.com/${'a'.repeat(2001)}`)).toMatch(/too long/);
  });
});

describe('embedUrl', () => {
  it('builds each provider’s player from its id, on one of the embed origins', () => {
    const built = [
      embedUrl('youtube', VIDEO),
      embedUrl('vimeo', '76979871'),
      embedUrl('spotify', `track/${SPOTIFY}`),
      embedUrl('soundcloud', 'aphex-twin/xtal'),
      embedUrl('soundcloud', 'warp/sets/selected'),
      embedUrl('bandcamp', 'album=1234567'),
    ];
    expect(built).toEqual([
      `https://www.youtube-nocookie.com/embed/${VIDEO}`,
      'https://player.vimeo.com/video/76979871?dnt=1',
      `https://open.spotify.com/embed/track/${SPOTIFY}`,
      'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Faphex-twin%2Fxtal',
      'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fwarp%2Fsets%2Fselected',
      'https://bandcamp.com/EmbeddedPlayer/album=1234567/size=large/tracklist=false/transparent=true/',
    ]);
    for (const url of built) expect(EMBED_ORIGINS).toContain(new URL(url ?? '').origin);
  });

  it('builds nothing for other, for no id, or for an id not of its provider’s shape', () => {
    for (const provider of LINK_PROVIDERS) expect(embedUrl(provider, null)).toBeNull();
    expect(embedUrl('other', 'anything')).toBeNull();
    expect(embedUrl('youtube', `${VIDEO}"><script>`)).toBeNull();
    expect(embedUrl('vimeo', '12/../x')).toBeNull();
    expect(embedUrl('spotify', 'track/../../evil')).toBeNull();
    expect(embedUrl('soundcloud', 'a/b/c')).toBeNull();
    expect(embedUrl('soundcloud', 'a/sets/b?x')).toBeNull();
    expect(embedUrl('bandcamp', 'album=12/../../x')).toBeNull();
  });
});

describe('thumbnailFor', () => {
  it('prefers the stored picture, else derives YouTube’s from its id, else has none', () => {
    expect(thumbnailFor('vimeo', '1', 'https://i.vimeocdn.com/x.jpg')).toBe(
      'https://i.vimeocdn.com/x.jpg'
    );
    expect(thumbnailFor('youtube', VIDEO, null)).toBe(
      `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`
    );
    expect(thumbnailFor('youtube', 'bad', null)).toBeNull();
    expect(thumbnailFor('spotify', `track/${SPOTIFY}`, null)).toBeNull();
  });
});
