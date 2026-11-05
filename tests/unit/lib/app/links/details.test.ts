/**
 * Unit Tests: reading a link's title, picture and Bandcamp id from its provider (`f-videos-and-links` t-180).
 *
 * `fetch` is stubbed; everything else is real (`details.ts`, `fetch.ts`, `providers.ts`). Pins:
 *
 * - each oEmbed provider is asked at its own fixed endpoint about the canonical URL, and its title and picture read;
 * - a picture off the provider's image hosts is dropped;
 * - Bandcamp's id is read from `og:video` only in the shape the embed is built from;
 * - a plain link is never fetched; a host not allowed, a redirect, a timeout, an error status, an oversized or
 *   non-JSON reply all come back null without throwing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// The pinned dispatcher is the platform's (and tested there); here it is the fetch as it always was.
vi.mock('@/lib/security/safe-dispatcher', () => ({
  withOutboundDispatcher: <T>(init: T) => init,
}));

import {
  bandcampIdFromEmbed,
  cleanTitle,
  metaTags,
  resolveLinkDetails,
} from '@/lib/app/links/details';
import { readText } from '@/lib/app/links/fetch';
import { embedUrl, parseLinkUrl, type ParsedLink } from '@/lib/app/links/providers';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function parsed(url: string): ParsedLink {
  const result = parseLinkUrl(url);
  if (!result.ok) throw new Error(result.problem);
  return result.link;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** A body streamed in chunks, with no content-length, so only the running count can catch its size. */
function streamed(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(fetchMock.mock.calls[0][0]);
}

describe('oEmbed providers', () => {
  const cases = [
    {
      provider: 'youtube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      canonical: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      endpoint: 'https://www.youtube.com/oembed',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    },
    {
      provider: 'vimeo',
      url: 'https://vimeo.com/76979871',
      canonical: 'https://vimeo.com/76979871',
      endpoint: 'https://vimeo.com/api/oembed.json',
      thumbnail: 'https://i.vimeocdn.com/video/452001751-640.jpg',
    },
    {
      provider: 'spotify',
      url: 'https://open.spotify.com/intl-de/album/4uLU6hMCjMI75M1A2tKUQC?si=x',
      canonical: 'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC',
      endpoint: 'https://open.spotify.com/oembed',
      thumbnail: 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02',
    },
    {
      provider: 'soundcloud',
      url: 'https://soundcloud.com/Artist/Track',
      canonical: 'https://soundcloud.com/artist/track',
      endpoint: 'https://soundcloud.com/oembed',
      thumbnail: 'https://i1.sndcdn.com/artworks-000-t500x500.jpg',
    },
  ] as const;

  it.each(cases)(
    '$provider: asks its endpoint about the canonical URL and reads title and picture',
    async (c) => {
      fetchMock.mockResolvedValue(json({ title: '  A  &amp; B ', thumbnail_url: c.thumbnail }));
      const details = await resolveLinkDetails(parsed(c.url));

      const asked = requested();
      expect(`${asked.origin}${asked.pathname}`).toBe(c.endpoint);
      expect(asked.searchParams.get('url')).toBe(c.canonical);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(details).toEqual({ title: 'A & B', thumbnailUrl: c.thumbnail, providerId: null });
    }
  );

  it('drops a picture that is not on the provider’s own image hosts, keeping the title', async () => {
    for (const thumbnail of [
      'https://evil.example/x.jpg',
      'http://i.ytimg.com/vi/x/hqdefault.jpg',
      'https://i.vimeocdn.com/x.jpg', // another provider's host
      'https://user:pw@i.ytimg.com/x.jpg',
      'javascript:alert(1)',
    ]) {
      fetchMock.mockResolvedValueOnce(json({ title: 'T', thumbnail_url: thumbnail }));
      const details = await resolveLinkDetails(parsed('https://youtu.be/dQw4w9WgXcQ'));
      expect(details).toEqual({ title: 'T', thumbnailUrl: null, providerId: null });
    }
  });

  it('is null when the reply has neither, or is not the shape oEmbed gives', async () => {
    fetchMock.mockResolvedValueOnce(json({ html: '<iframe>' }));
    expect(await resolveLinkDetails(parsed('https://vimeo.com/1'))).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ title: 42 }));
    expect(await resolveLinkDetails(parsed('https://vimeo.com/1'))).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('<html>not json</html>', { status: 200 }));
    expect(await resolveLinkDetails(parsed('https://vimeo.com/1'))).toBeNull();
  });

  it('never reads a plain link', async () => {
    expect(await resolveLinkDetails(parsed('https://example.com/review'))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Bandcamp', () => {
  const PAGE = (video: string) => `<!doctype html><html><head>
    <meta property="og:title" content="Selected Works, by Some Artist">
    <meta content="https://f4.bcbits.com/img/a1234567890_5.jpg" property="og:image">
    <meta property="og:video" content="${video}">
    </head><body>${'x'.repeat(100)}</body></html>`;

  it('reads the album id from og:video, with the title and picture, from the artist’s own page', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        PAGE('https://bandcamp.com/EmbeddedPlayer/v=2/album=2557870435/size=large/tall=100/'),
        { status: 200 }
      )
    );
    const link = parsed('https://someartist.bandcamp.com/album/selected-works');
    const details = await resolveLinkDetails(link);

    expect(requested().toString()).toBe('https://someartist.bandcamp.com/album/selected-works');
    expect(details).toEqual({
      title: 'Selected Works, by Some Artist',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1234567890_5.jpg',
      providerId: 'album=2557870435',
    });
    // The id read is one the embed is built from.
    expect(embedUrl('bandcamp', details?.providerId ?? null)).toMatch(
      /^https:\/\/bandcamp\.com\/EmbeddedPlayer\/album=2557870435\//
    );
  });

  it('reads a track id', () => {
    expect(bandcampIdFromEmbed('https://bandcamp.com/EmbeddedPlayer/v=2/track=12/')).toBe(
      'track=12'
    );
  });

  it('keeps no id that is not exactly album=<n> or track=<n> on bandcamp.com’s player', () => {
    for (const video of [
      undefined,
      'not a url',
      'http://bandcamp.com/EmbeddedPlayer/album=1/',
      'https://evil.example/EmbeddedPlayer/album=1/',
      'https://bandcamp.com.evil.example/EmbeddedPlayer/album=1/',
      'https://bandcamp.com/other/album=1/',
      'https://bandcamp.com/EmbeddedPlayer/album=1x/',
      'https://bandcamp.com/EmbeddedPlayer/album=/',
      'https://bandcamp.com/EmbeddedPlayer/album=1/track=2/',
      'https://bandcamp.com/EmbeddedPlayer/album=1234567890123456/',
      'https://bandcamp.com/EmbeddedPlayer/playlist=1/',
    ])
      expect(bandcampIdFromEmbed(video)).toBeNull();
  });

  it('still gives the title and picture when the page has no usable og:video', async () => {
    fetchMock.mockResolvedValue(
      new Response(PAGE('https://evil.example/EmbeddedPlayer/album=1/'), { status: 200 })
    );
    const details = await resolveLinkDetails(parsed('https://a.bandcamp.com/track/b'));
    expect(details?.providerId).toBeNull();
    expect(details?.title).toBe('Selected Works, by Some Artist');
  });

  it('reads meta tags whichever order their attributes are in, the first of each winning', () => {
    const meta = metaTags(
      `<meta name="og:title" content='One'><meta property="og:title" content="Two"><meta charset="utf-8">`
    );
    expect(meta.get('og:title')).toBe('One');
    expect(meta.size).toBe(1);
  });
});

describe('reading from another site', () => {
  const opts = {
    hosts: new Set(['www.youtube.com']),
    maxBytes: 100,
    timeoutMs: 1000,
    accept: 'application/json',
    purpose: 'test',
  };

  it('refuses a host not allowed, plain http, a login or a port, without sending anything', async () => {
    for (const url of [
      'https://evil.example/oembed',
      'https://www.youtube.com.evil.example/',
      'http://www.youtube.com/oembed',
      'https://u:p@www.youtube.com/oembed',
      'https://www.youtube.com:8443/oembed',
      'not a url',
    ])
      expect(await readText(url, opts)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is null on a timeout, a refused redirect or a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect(await readText('https://www.youtube.com/a', opts)).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed', { cause: 'redirect' }));
    expect(await readText('https://www.youtube.com/a', opts)).toBeNull();
  });

  it('is null on an error status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    expect(await readText('https://www.youtube.com/a', opts)).toBeNull();
  });

  it('is null when the body is over the cap, declared or streamed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-length': '5000' } })
    );
    expect(await readText('https://www.youtube.com/a', opts)).toBeNull();
    fetchMock.mockResolvedValueOnce(streamed(['x'.repeat(60), 'y'.repeat(60)]));
    expect(await readText('https://www.youtube.com/a', opts)).toBeNull();
    fetchMock.mockResolvedValueOnce(streamed(['x'.repeat(60), 'y'.repeat(30)]));
    expect(await readText('https://www.youtube.com/a', opts)).toBe(
      `${'x'.repeat(60)}${'y'.repeat(30)}`
    );
  });

  it('stops an HTML read at stopAt, so a long body past the head is never counted', async () => {
    fetchMock.mockResolvedValueOnce(
      streamed(['<head><meta></head>', 'z'.repeat(500), 'z'.repeat(500)])
    );
    expect(await readText('https://www.youtube.com/a', { ...opts, stopAt: '</head>' })).toBe(
      '<head><meta></head>'
    );
  });
});

describe('cleanTitle', () => {
  it('decodes entities once, drops markup, collapses whitespace and cuts long titles', () => {
    expect(cleanTitle('Caf&eacute;  <b>live</b>\n&amp;lt;')).toBe('Café live &lt;');
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle(undefined)).toBeNull();
    const long = cleanTitle('a'.repeat(300));
    expect(Array.from(long ?? '')).toHaveLength(200);
    expect(long?.endsWith('…')).toBe(true);
  });
});
