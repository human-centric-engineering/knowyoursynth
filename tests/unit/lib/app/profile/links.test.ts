/**
 * Unit Tests: a profile's links (`f-profiles` r1), `lib/app/profile/links.ts`.
 *
 * Each link ends up in an `href` on a public page, so the pins are about what is refused as much as what is kept:
 * per platform, a real page is accepted and stored as the URL rebuilt from its handle or id (no query, no tracking),
 * while look-alike hosts, a userinfo trick, a port, plain http, another platform's address and a platform's own pages
 * are refused.
 */
import { describe, it, expect } from 'vitest';

import {
  LINK_PLATFORMS,
  parseProfileLink,
  readStoredLink,
  type LinkPlatform,
} from '@/lib/app/profile/links';

/** A real page on each platform, and what it is stored and shown as. */
const GOOD: Record<LinkPlatform, Array<[string, string, string]>> = {
  youtube: [
    ['https://www.youtube.com/@TapeLoops', 'https://www.youtube.com/@TapeLoops', '@TapeLoops'],
    [
      'https://youtube.com/@tape.loops?si=abc',
      'https://www.youtube.com/@tape.loops',
      '@tape.loops',
    ],
    ['https://m.youtube.com/@tapeloops/', 'https://www.youtube.com/@tapeloops', '@tapeloops'],
    [
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'YouTube channel',
    ],
  ],
  spotify: [
    [
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi?si=xyz',
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
      'Spotify',
    ],
    [
      'https://open.spotify.com/intl-de/artist/4tZwfgrHOc3mvqYlEYSvVi',
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
      'Spotify',
    ],
  ],
  instagram: [
    ['https://www.instagram.com/tape.loops', 'https://www.instagram.com/tape.loops', '@tape.loops'],
    [
      'https://instagram.com/tape_loops/?hl=en',
      'https://www.instagram.com/tape_loops',
      '@tape_loops',
    ],
  ],
  bandcamp: [
    ['https://tapeloops.bandcamp.com', 'https://tapeloops.bandcamp.com', 'tapeloops.bandcamp.com'],
    [
      'https://TapeLoops.bandcamp.com/music',
      'https://tapeloops.bandcamp.com',
      'tapeloops.bandcamp.com',
    ],
  ],
};

/** Addresses each platform's field must refuse: look-alikes, tricks, and its own non-person pages. */
const BAD: Record<LinkPlatform, string[]> = {
  youtube: [
    'https://youtube.com.evil.example/@tapeloops',
    'https://evil-youtube.com/@tapeloops',
    'https://www.youtube.com@evil.example/@tapeloops',
    'https://user:pass@www.youtube.com/@tapeloops',
    'https://www.youtube.com:8443/@tapeloops',
    'http://www.youtube.com/@tapeloops',
    'https://music.youtube.com/@tapeloops',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/@ab',
    'https://www.youtube.com/channel/notachannelid',
    'https://youtu.be/dQw4w9WgXcQ',
  ],
  spotify: [
    'https://open.spotify.com.evil.example/artist/4tZwfgrHOc3mvqYlEYSvVi',
    'https://spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
    'https://open.spotify.com/track/4tZwfgrHOc3mvqYlEYSvVi',
    'https://open.spotify.com/artist/short',
    'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi/discography',
    'https://open.spotify.com/evil/artist/4tZwfgrHOc3mvqYlEYSvVi',
    'http://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
    'https://open.spotify.com:444/artist/4tZwfgrHOc3mvqYlEYSvVi',
  ],
  instagram: [
    'https://instagram.com.evil.example/tapeloops',
    'https://www.instagram.com@evil.example/tapeloops',
    'https://www.instagram.com/p/C0d3x',
    'https://www.instagram.com/explore',
    'https://www.instagram.com/tape/loops',
    'https://www.instagram.com/',
    'http://www.instagram.com/tapeloops',
  ],
  bandcamp: [
    'https://bandcamp.com',
    'https://www.bandcamp.com',
    'https://evil.tapeloops.bandcamp.com',
    'https://tapeloops.bandcamp.com.evil.example',
    'https://tapeloops-bandcamp.com',
    'https://tapeloops.bandcamp.com/album/first',
    'https://-tape.bandcamp.com',
    'http://tapeloops.bandcamp.com',
  ],
};

describe('parseProfileLink', () => {
  for (const platform of LINK_PLATFORMS) {
    describe(platform, () => {
      it.each(GOOD[platform])('accepts %s, stored as %s', (typed, url, display) => {
        expect(parseProfileLink(platform, typed)).toEqual({ url, display });
      });

      it.each(BAD[platform])('refuses %s', (typed) => {
        expect(parseProfileLink(platform, typed)).toBeNull();
      });
    });
  }

  it("refuses one platform's page in another's field", () => {
    const youtube = GOOD.youtube[0][0];
    const instagram = GOOD.instagram[0][0];
    expect(parseProfileLink('instagram', youtube)).toBeNull();
    expect(parseProfileLink('youtube', instagram)).toBeNull();
    expect(parseProfileLink('spotify', GOOD.bandcamp[0][0])).toBeNull();
    expect(parseProfileLink('bandcamp', GOOD.spotify[0][0])).toBeNull();
  });

  it.each(['', 'not a url', 'javascript:alert(1)', `https://www.youtube.com/@${'a'.repeat(300)}`])(
    'refuses %s',
    (typed) => {
      expect(parseProfileLink('youtube', typed)).toBeNull();
    }
  );
});

describe('readStoredLink', () => {
  it('reads a stored link back as it was rebuilt', () => {
    expect(readStoredLink('bandcamp', 'https://tapeloops.bandcamp.com')).toEqual({
      url: 'https://tapeloops.bandcamp.com',
      display: 'tapeloops.bandcamp.com',
    });
  });

  it('reads a row that no longer passes as no link, rather than failing', () => {
    expect(readStoredLink('youtube', 'https://evil.example/@x')).toBeNull();
    expect(readStoredLink('youtube', null)).toBeNull();
  });
});
