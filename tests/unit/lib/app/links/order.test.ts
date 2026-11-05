/**
 * Unit Tests: the order links are shown in (`f-videos-and-links` t-179).
 *
 * Pins: ours first in the admin's order; every link once; the draw follows the weights (a much-watched video leads
 * most of the time, not every time), measured over many seeded draws; popularity's three sources.
 */
import { describe, expect, it } from 'vitest';
import { orderLinks, popularity, weight, type OrderableLink } from '@/lib/app/links/order';

/** A seeded uniform source in [0, 1) (mulberry32), so a test's draws are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let n = 0;
function link(over: Partial<OrderableLink> & { name: string }): OrderableLink & { name: string } {
  return {
    ours: false,
    order: 0,
    rating: null,
    views: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n++)),
    ...over,
  };
}

describe('popularity', () => {
  it('reads views when there are any, else the rating, else a middling default', () => {
    expect(popularity({ views: 0, rating: 5 })).toBeCloseTo(1);
    expect(popularity({ views: 9_999_990, rating: null })).toBeCloseTo(7);
    expect(popularity({ views: null, rating: 1 })).toBe(2);
    expect(popularity({ views: null, rating: 5 })).toBe(6);
    expect(popularity({ views: null, rating: null })).toBe(3);
    expect(weight({ views: null, rating: null })).toBe(9);
  });
});

describe('orderLinks', () => {
  it('puts ours first, by their order then age, ahead of every other link however popular', () => {
    const links = [
      link({ name: 'viral', views: 50_000_000 }),
      link({ name: 'ours-b', ours: true, order: 1 }),
      link({ name: 'ours-a2', ours: true, order: 0 }),
      link({ name: 'quiet', views: 3 }),
      link({ name: 'ours-a1', ours: true, order: 0, createdAt: new Date(Date.UTC(2025, 0, 1)) }),
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const names = orderLinks(links, seeded(seed)).map((l) => l.name);
      expect(names.slice(0, 3)).toEqual(['ours-a1', 'ours-a2', 'ours-b']);
      expect(new Set(names.slice(3))).toEqual(new Set(['viral', 'quiet']));
    }
  });

  it('returns every link exactly once and leaves its input alone', () => {
    const links = Array.from({ length: 30 }, (_, i) =>
      link({ name: `l${i}`, ours: i % 7 === 0, order: i, views: i * 1000 })
    );
    const copy = [...links];
    const out = orderLinks(links, seeded(42));
    expect(out).toHaveLength(30);
    expect(new Set(out)).toEqual(new Set(links));
    expect(links).toEqual(copy);
  });

  it('leads with the much-watched video most of the time, but not every time', () => {
    const links = [link({ name: 'big', views: 10_000_000 }), link({ name: 'small', views: 1_000 })];
    const random = seeded(7);
    let bigFirst = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) if (orderLinks(links, random)[0].name === 'big') bigFirst++;
    // Weights 7.0² and 3.0²: the big one leads with probability 49/58 ≈ 0.845.
    expect(bigFirst / runs).toBeGreaterThan(0.81);
    expect(bigFirst / runs).toBeLessThan(0.88);
  });

  it('gives equal links an even chance, so the order changes between visits', () => {
    const links = [link({ name: 'a' }), link({ name: 'b' })];
    const random = seeded(99);
    let aFirst = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) if (orderLinks(links, random)[0].name === 'a') aFirst++;
    expect(aFirst / runs).toBeGreaterThan(0.46);
    expect(aFirst / runs).toBeLessThan(0.54);
  });

  it('survives a random source that returns 0', () => {
    const links = [link({ name: 'a', views: 10 }), link({ name: 'b', views: 1e6 })];
    expect(orderLinks(links, () => 0)).toHaveLength(2);
  });
});
