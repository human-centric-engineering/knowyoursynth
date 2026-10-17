/**
 * Unit Tests: listing published sounds (`f-sharing` h2).
 *
 * `GET /api/v1/public/sounds` (what `/explore` reads), `publishedSoundsOf` (a profile's sounds) and
 * `publishedSoundAddresses` (the sitemap's). The user sounds table is a small stateful fake that honours the filters,
 * orderings and paging the code relies on (`in`, `not`, `has`, a `copies` count), so a query that dropped the
 * visibility or the synth would reach the wrong rows here too. Pins:
 *
 * - only published sounds are listed, never a link share or a private one, and only on a synth the catalogue serves;
 * - never one an admin unlisted (h4), in any of the three lists;
 * - a card carries the byline and save count, never the row's id or its owner's;
 * - synth and tag filter; a filter that does not parse, or names nothing served, is dropped, not refused;
 * - "most saved" orders by copies, then newest; paging is stable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLog = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

// Two synths served; `jupiter-8` has sounds but is not (unlisted, or its definition is missing).
vi.mock('@/lib/app/catalogue/read', () => ({
  listSynths: vi.fn(async () => [
    { id: 'model-d', name: 'Model D' },
    { id: 'pro-1', name: 'Pro-One' },
  ]),
}));

import { GET as list } from '@/app/api/v1/public/sounds/route';
import { EXPLORE_PAGE_SIZE } from '@/lib/app/sounds/data';
import {
  exploreTags,
  publishedSoundAddresses,
  publishedSoundsOf,
} from '@/lib/app/sounds/public';

type Row = {
  id: string;
  userId: string;
  synthId: string;
  name: string;
  slug: string | null;
  visibility: 'private' | 'link' | 'published';
  publishedAt: Date | null;
  tags: string[];
  sourceUserSoundId: string | null;
  unlistedAt: Date | null;
};
type Where = Record<string, unknown>;
type Order = Record<string, unknown>;

let rows: Row[];
let n = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 12, minute));

function add(over: Partial<Row>): Row {
  n++;
  const row: Row = {
    id: `snd${n}`,
    userId: 'user-1',
    synthId: 'model-d',
    name: `Sound ${n}`,
    slug: `slug${String(n).padStart(6, '0')}`,
    visibility: 'published',
    publishedAt: at(n),
    tags: [],
    sourceUserSoundId: null,
    unlistedAt: null,
    ...over,
  };
  rows.push(row);
  return row;
}
/** `count` copies of `source`, saved by someone else. */
function copiesOf(source: Row, count: number) {
  for (let i = 0; i < count; i++)
    add({ userId: 'user-9', visibility: 'private', slug: null, publishedAt: null, sourceUserSoundId: source.id });
}

const copies = (r: Row) => rows.filter((x) => x.sourceUserSoundId === r.id).length;

function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as { in?: unknown[]; not?: unknown; has?: unknown };
    if (c.in && !c.in.includes(value)) return false;
    if ('not' in c && value === c.not) return false;
    if ('has' in c && !(Array.isArray(value) && value.includes(c.has))) return false;
    return true;
  }
  return value === cond;
}
const matches = (row: Row, where: Where = {}) =>
  Object.entries(where).every(([k, v]) => fieldMatches(row[k as keyof Row], v));

/** Compare by each of Prisma's `orderBy` entries in turn: a column, or `{ copies: { _count } }`. */
function compare(a: Row, b: Row, orderBy: Order[]): number {
  for (const o of orderBy) {
    const [key, dir] = Object.entries(o)[0];
    const sign = (key === 'copies' ? (dir as { _count: string })._count : dir) === 'desc' ? -1 : 1;
    const va = key === 'copies' ? copies(a) : a[key as keyof Row];
    const vb = key === 'copies' ? copies(b) : b[key as keyof Row];
    const x = va instanceof Date && vb instanceof Date ? va.getTime() - vb.getTime() : va === vb ? 0 : String(va) < String(vb) ? -1 : 1;
    if (x !== 0) return sign * x;
  }
  return 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  n = 0;
  mockPrisma.userSound = {
    findMany: vi.fn(
      async ({
        where,
        orderBy = [],
        skip = 0,
        take,
        select,
      }: {
        where?: Where;
        orderBy?: Order[];
        skip?: number;
        take?: number;
        select?: Record<string, unknown>;
      }) => {
        const hit = rows.filter((r) => matches(r, where)).sort((a, b) => compare(a, b, orderBy));
        return hit.slice(skip, take === undefined ? undefined : skip + take).map((r) => {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(select ?? r)) out[k] = r[k as keyof Row];
          if (select?._count) out._count = { copies: copies(r) };
          return out;
        });
      }
    ),
    count: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length),
  };
  mockPrisma.synthProfile = {
    findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
      [
        { userId: 'user-1', username: 'moog-fan', public: false },
        { userId: 'user-2', username: 'patchwork', public: true },
      ].filter((p) => where.userId.in.includes(p.userId))
    ),
  };
  mockPrisma.synthSound = {
    findMany: vi.fn(async ({ where }: { where: { synthId: { in: string[] } } }) =>
      [
        { synthId: 'model-d', tags: ['bass', 'lead'] },
        { synthId: 'model-d', tags: ['bass'] },
        { synthId: 'pro-1', tags: ['pad'] },
      ]
        .filter((s) => where.synthId.in.includes(s.synthId))
        .map((s) => ({ tags: s.tags }))
    ),
  };
});

function request(url: string) {
  const req = new Request(`http://localhost${url}`);
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}
async function explore(query = '') {
  const res = await list(request(`/api/v1/public/sounds${query}`));
  expect(res.status).toBe(200);
  return JSON.parse(await res.text()) as {
    data: Record<string, unknown>[];
    meta: { page: number; total: number; totalPages: number; applied: Record<string, unknown> };
  };
}
const names = (data: Record<string, unknown>[]) => data.map((d) => d.name);

describe('GET /api/v1/public/sounds', () => {
  it('lists published sounds only, newest first, and only on a synth the catalogue serves', async () => {
    add({ name: 'Old published' });
    add({ name: 'Link share', visibility: 'link' });
    add({ name: 'Private', visibility: 'private' });
    add({ name: 'Unserved synth', synthId: 'jupiter-8' });
    add({ name: 'Unlisted by an admin', unlistedAt: at(30) });
    add({ name: 'New published', synthId: 'pro-1', userId: 'user-2' });

    const { data, meta } = await explore();
    expect(names(data)).toEqual(['New published', 'Old published']);
    expect(meta.total).toBe(2);
  });

  it("gives each card its byline, synth name and save count, never the row's or the owner's id", async () => {
    const s = add({ name: 'Night bass', userId: 'user-2', tags: ['bass'] });
    copiesOf(s, 2);

    const [card] = (await explore()).data;
    expect(card).toEqual({
      slug: s.slug,
      synthId: 'model-d',
      synthName: 'Model D',
      name: 'Night bass',
      tags: ['bass'],
      publishedAt: s.publishedAt!.toISOString(),
      author: 'patchwork',
      authorProfile: true,
      saves: 2,
    });
    expect(JSON.stringify(card)).not.toContain('user-2');
    expect(JSON.stringify(card)).not.toContain(s.id);
  });

  it('filters by synth and by tag, and says what it applied', async () => {
    add({ name: 'D bass', tags: ['bass'] });
    add({ name: 'D lead', tags: ['lead'] });
    add({ name: 'Pro bass', synthId: 'pro-1', tags: ['bass'] });

    expect(names((await explore('?synth=model-d')).data)).toEqual(['D lead', 'D bass']);
    const both = await explore('?synth=model-d&tag=bass');
    expect(names(both.data)).toEqual(['D bass']);
    expect(both.meta.applied).toMatchObject({ synth: 'model-d', tag: 'bass' });
  });

  it('drops a filter that does not parse, or names a synth or tag nothing serves, rather than refusing', async () => {
    add({ name: 'D bass', tags: ['bass'] });
    add({ name: 'Pro pad', synthId: 'pro-1', tags: ['pad'] });

    for (const q of ['?synth=NOT%20A%20SYNTH', '?synth=jupiter-8', '?tag=%21%21', '?tag=choir', '?sort=loudest&page=-3']) {
      const { data, meta } = await explore(q);
      expect(names(data), q).toEqual(['Pro pad', 'D bass']);
      expect(meta.applied, q).toEqual({ sort: 'newest', page: 1 });
    }
    // a tag the chosen synth's library does not use is dropped, though another synth uses it
    const { meta } = await explore('?synth=model-d&tag=pad');
    expect(meta.applied).toEqual({ synth: 'model-d', sort: 'newest', page: 1 });
  });

  it('sorts by saves, most first, then newest', async () => {
    const few = add({ name: 'One save' });
    const many = add({ name: 'Three saves' });
    add({ name: 'No saves, newest' });
    const tie = add({ name: 'One save, newer' });
    copiesOf(few, 1);
    copiesOf(many, 3);
    copiesOf(tie, 1);

    const { data } = await explore('?sort=saves');
    expect(names(data)).toEqual(['Three saves', 'One save, newer', 'One save', 'No saves, newest']);
    expect(data.map((d) => d.saves)).toEqual([3, 1, 1, 0]);
  });

  it('pages through them, a page at a time', async () => {
    for (let i = 0; i < EXPLORE_PAGE_SIZE + 3; i++) add({});
    const first = await explore();
    const second = await explore('?page=2');
    expect(first.data).toHaveLength(EXPLORE_PAGE_SIZE);
    expect(second.data).toHaveLength(3);
    expect(second.meta).toMatchObject({ page: 2, total: EXPLORE_PAGE_SIZE + 3, totalPages: 2 });
    // no sound on both pages
    const slugs = new Set(first.data.map((d) => d.slug));
    expect(second.data.some((d) => slugs.has(d.slug))).toBe(false);
  });
});

describe('publishedSoundsOf', () => {
  it("lists one user's published sounds, never their link shares or private ones, nor anyone else's", async () => {
    add({ name: 'Mine, published' });
    add({ name: 'Mine, link', visibility: 'link' });
    add({ name: 'Mine, private', visibility: 'private' });
    add({ name: 'Mine, unlisted by an admin', unlistedAt: at(30) });
    add({ name: 'Theirs, published', userId: 'user-2' });

    const sounds = await publishedSoundsOf('user-1');
    expect(sounds.map((s) => s.name)).toEqual(['Mine, published']);
  });
});

describe('publishedSoundAddresses', () => {
  it('gives every published sound, and no link share or unlisted one', async () => {
    const pub = add({});
    add({ visibility: 'link' });
    add({ unlistedAt: at(30) });
    add({ visibility: 'private' });
    add({ synthId: 'jupiter-8' });

    expect(await publishedSoundAddresses()).toEqual([{ synthId: 'model-d', slug: pub.slug }]);
  });
});

describe('exploreTags', () => {
  it("is every tag the served synths' library sounds use, or one synth's", async () => {
    expect(await exploreTags()).toEqual(['bass', 'lead', 'pad']);
    expect(await exploreTags('pro-1')).toEqual(['pad']);
  });
});
