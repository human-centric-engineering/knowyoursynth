/**
 * Unit Tests: the public links' shape and words (`components/app/links/data.ts`, `f-videos-and-links` t-182).
 *
 * Pins: a response row that does not parse is left out; a picture or embed that fails its check is dropped without
 * losing the link; the teaser and view count read as the section prints them.
 */
import { describe, expect, it } from 'vitest';
import { readPublicLinks, teaser, viewsLabel } from '@/components/app/links/data';

const row = {
  id: 'l1',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  provider: 'youtube',
  kind: 'demo',
  title: 'A demo',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ours: false,
  views: 10,
};

describe('readPublicLinks', () => {
  it('reads nothing from a body that is not a list', () => {
    expect(readPublicLinks({ data: [row] })).toEqual([]);
    expect(readPublicLinks(null)).toEqual([]);
  });

  it('keeps the rows that parse, in order, and leaves out the rest', () => {
    const links = readPublicLinks([
      row,
      { ...row, id: 'l2', url: 'javascript:alert(1)' },
      { ...row, id: 'l3', url: 'not a url' },
      { ...row, id: 'l4', kind: 'gossip' },
      { ...row, id: 'l5' },
    ]);
    expect(links.map((l) => l.id)).toEqual(['l1', 'l5']);
  });

  it('drops a picture or an embed that fails its check, and keeps the link', () => {
    const [link] = readPublicLinks([
      {
        ...row,
        thumbnailUrl: 'http://i.ytimg.com/x.jpg',
        embedUrl: 'https://www.youtube.com/embed/x',
      },
    ]);
    expect(link).toMatchObject({ id: 'l1', thumbnailUrl: null, embedUrl: null });
  });
});

describe('teaser', () => {
  it('names the kinds after the count', () => {
    expect(teaser({ count: 12, kinds: ['demo', 'review', 'lesson'] })).toBe(
      '12 · demos, reviews and lessons'
    );
    expect(teaser({ count: 2, kinds: ['performance', 'original'] })).toBe(
      '2 · recordings and originals'
    );
    expect(teaser({ count: 1, kinds: ['demo'] })).toBe('1 · demos');
  });

  it('is the count alone with no kinds', () => {
    expect(teaser({ count: 3, kinds: [] })).toBe('3');
  });
});

describe('viewsLabel', () => {
  it('counts compactly, one view singular, none without a count', () => {
    expect(viewsLabel(1_250_000)).toBe('1.3M views');
    expect(viewsLabel(1)).toBe('1 view');
    expect(viewsLabel(0)).toBe('0 views');
    expect(viewsLabel(null)).toBeNull();
  });
});
