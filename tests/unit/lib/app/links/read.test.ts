/**
 * Unit Tests: what the closed videos section says (`summarisePublicLinks`, `f-videos-and-links` t-182).
 *
 * Over the stateful fake (`tests/helpers/links-store.ts`). Pins: the count is the list's (one per URL across a synth's
 * instruments); the kinds are the ones present, in `LINK_KINDS` order; a hidden synth has none. The list itself is
 * the route's (`tests/unit/app/api/v1/links/route.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

import { listPublicLinks, summarisePublicLinks } from '@/lib/app/links/read';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

let store: LinksStore;

beforeEach(() => {
  store = linksStore({
    instruments: [
      { id: 'moog-minimoog', name: 'Minimoog' },
      { id: 'moog-minimoog-reissue', name: 'Minimoog reissue' },
      { id: 'arp-odyssey', name: 'Odyssey' },
    ],
    synths: [
      { id: 'model-d', listed: true, instrumentIds: ['moog-minimoog', 'moog-minimoog-reissue'] },
      { id: 'hidden-synth', listed: false, instrumentIds: ['arp-odyssey'] },
    ],
  });
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client);
});

describe('summarisePublicLinks', () => {
  it("counts a synth's links as its list has them, one per URL, with the kinds in order", async () => {
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/a', kind: 'lesson' });
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/b', kind: 'demo' });
    // The same URL on the synth's other instrument is one link, not two.
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: 'https://example.com/a',
      kind: 'lesson',
    });
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: 'https://example.com/c',
      kind: 'review',
    });
    // Another synth's.
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'original' });

    const summary = await summarisePublicLinks({ target: 'synth', id: 'model-d' });

    expect(summary).toEqual({ count: 3, kinds: ['demo', 'review', 'lesson'] });
    expect(summary.count).toBe(
      (await listPublicLinks({ target: 'synth', id: 'model-d' }, () => 0.5)).length
    );
  });

  it("counts one instrument's own", async () => {
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'original' });
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/a', kind: 'demo' });

    expect(await summarisePublicLinks({ target: 'instrument', id: 'arp-odyssey' })).toEqual({
      count: 1,
      kinds: ['original'],
    });
  });

  it('has none for a hidden synth, though its instrument has links', async () => {
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'demo' });

    expect(await summarisePublicLinks({ target: 'synth', id: 'hidden-synth' })).toEqual({
      count: 0,
      kinds: [],
    });
  });

  it('has none, of no kind, for a synth without links', async () => {
    expect(await summarisePublicLinks({ target: 'synth', id: 'model-d' })).toEqual({
      count: 0,
      kinds: [],
    });
  });
});
