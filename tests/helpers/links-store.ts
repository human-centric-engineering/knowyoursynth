/**
 * A stateful in-memory fake of the `external_link` table and the owners it points at (`f-videos-and-links` t-179),
 * shaped as `lib/app/links/*` calls Prisma. It keeps the table's own rules so tests prove the code's handling of them:
 * one link per URL per owner (a P2002), and exactly one owner (an error, as the CHECK would raise).
 *
 * Only the calls the links code makes are implemented; anything else is absent, so a new call fails loudly.
 *
 * A sound's library patterns (t-183) are seeded with it, default first: each a real riff pattern (or `riff: false`, one
 * that cannot be a default), its status and what it is inspired by. The code under test picks the default from them
 * (`headOf`), so a disabled head or one that is not a riff passes it to the next, as on the real tables.
 */
import { importPhrase } from '@/lib/app/sequencer/import';
import { RIFF } from '@/tests/helpers/admin-library-pattern';

type Row = Record<string, unknown>;

export interface SeedPattern {
  status?: 'enabled' | 'disabled';
  /** False for one that cannot be a riff, so cannot be a default. */
  riff?: boolean;
  song?: { id: string; title: string };
  artist?: { id: string; name: string };
}

export interface LinksStoreSeed {
  instruments?: { id: string; name: string }[];
  songs?: { id: string; title: string }[];
  artists?: { id: string; name: string }[];
  synths?: { id: string; listed: boolean; instrumentIds: string[] }[];
  sounds?: {
    id: string;
    synthId: string;
    slug: string;
    name: string;
    /** Its library patterns, default first. */
    patterns?: SeedPattern[];
  }[];
}

const OWNER_COLUMNS = ['instrumentId', 'soundId', 'songId', 'artistId'] as const;

function prismaError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, want]) => {
    if (want === undefined) return true;
    if (key === 'OR') return (want as Row[]).some((w) => matches(row, w));
    if (want && typeof want === 'object' && 'in' in (want as Row))
      return ((want as { in: unknown[] }).in ?? []).includes(row[key]);
    if (want && typeof want === 'object' && 'not' in (want as Row))
      return row[key] !== (want as { not: unknown }).not;
    return row[key] === want;
  });
}

export function linksStore(seed: LinksStoreSeed = {}) {
  const links: Row[] = [];
  const writes: string[] = [];
  const instruments = seed.instruments ?? [];
  const songs = seed.songs ?? [];
  const artists = seed.artists ?? [];
  const synths = seed.synths ?? [];
  const sounds = seed.sounds ?? [];
  let seq = 0;
  let clock = Date.parse('2026-11-05T10:00:00Z');
  const now = () => new Date((clock += 1000));

  const withOwner = (row: Row): Row => {
    const sound = sounds.find((s) => s.id === row.soundId);
    return {
      ...row,
      instrument: instruments.find((i) => i.id === row.instrumentId) ?? null,
      sound: sound ? { slug: sound.slug, name: sound.name, synthId: sound.synthId } : null,
      song: songs.find((s) => s.id === row.songId) ?? null,
      artist: artists.find((a) => a.id === row.artistId) ?? null,
    };
  };

  const project = (
    row: Row,
    args: { include?: unknown; select?: Record<string, boolean> }
  ): Row => {
    if (args.select) return Object.fromEntries(Object.keys(args.select).map((k) => [k, row[k]]));
    return args.include ? withOwner(row) : { ...row };
  };

  const checkRow = (row: Row) => {
    const owners = OWNER_COLUMNS.filter((c) => row[c] !== null && row[c] !== undefined);
    if (owners.length !== 1) throw new Error('violates check constraint "external_link_one_owner"');
    const col = owners[0];
    if (links.some((l) => l.id !== row.id && l[col] === row[col] && l.url === row.url))
      throw prismaError('P2002', 'Unique constraint failed');
  };

  const externalLink = {
    findMany: async (args: {
      where?: Row;
      include?: unknown;
      select?: Record<string, boolean>;
      orderBy?: Record<string, 'asc' | 'desc'>[];
      skip?: number;
      take?: number;
    }) => {
      let rows = links.filter((l) => matches(l, args.where));
      for (const order of [...(args.orderBy ?? [])].reverse()) {
        const [key, dir] = Object.entries(order)[0];
        rows = [...rows].sort((a, b) => {
          const av = a[key] as number | string | Date;
          const bv = b[key] as number | string | Date;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      rows = rows.slice(
        args.skip ?? 0,
        args.take === undefined ? undefined : (args.skip ?? 0) + args.take
      );
      return rows.map((r) => project(r, args));
    },
    findUnique: async (args: { where: { id: string }; include?: unknown }) => {
      const row = links.find((l) => l.id === args.where.id);
      return row ? project(row, args) : null;
    },
    findFirst: async (args: { where?: Row; select?: Record<string, boolean> }) => {
      const row = links.find((l) => matches(l, args.where));
      return row ? project(row, args) : null;
    },
    count: async (args: { where?: Row }) => links.filter((l) => matches(l, args.where)).length,
    aggregate: async (args: { where?: Row; _max: { order: true } }) => {
      const orders = links.filter((l) => matches(l, args.where)).map((l) => l.order as number);
      return { _max: { order: orders.length ? Math.max(...orders) : null } };
    },
    create: async (args: { data: Row; include?: unknown }) => {
      const at = now();
      const row: Row = {
        id: `clink${String(++seq).padStart(8, '0')}`,
        instrumentId: null,
        soundId: null,
        songId: null,
        artistId: null,
        providerId: null,
        thumbnailUrl: null,
        ours: false,
        order: 0,
        rating: null,
        views: null,
        likes: null,
        statsAt: null,
        createdAt: at,
        updatedAt: at,
        ...args.data,
      };
      checkRow(row);
      links.push(row);
      writes.push(`create ${String(row.id)}`);
      return project(row, args);
    },
    update: async (args: { where: { id: string } & Row; data: Row; include?: unknown }) => {
      // Every key of `where` must hold, as Prisma's update with extra filters on a unique where.
      const index = links.findIndex((l) => matches(l, args.where));
      if (index < 0) throw prismaError('P2025', 'Record to update not found');
      // `@updatedAt` is stamped unless the write names it, as Prisma does.
      const row = { ...links[index], ...args.data, updatedAt: args.data.updatedAt ?? now() };
      checkRow(row);
      links[index] = row;
      writes.push(`update ${args.where.id}`);
      return project(row, args);
    },
    delete: async (args: { where: { id: string }; include?: unknown }) => {
      const index = links.findIndex((l) => l.id === args.where.id);
      if (index < 0) throw prismaError('P2025', 'Record to delete does not exist');
      const [row] = links.splice(index, 1);
      writes.push(`delete ${args.where.id}`);
      return project(row, args);
    },
  };

  const byId =
    <T extends { id: string }>(rows: T[]) =>
    async (args: { where: { id: string } }) => {
      const row = rows.find((r) => r.id === args.where.id);
      return row ? { id: row.id } : null;
    };

  /** Several rows by id, as the suggestion queue names its targets (t-185). */
  const manyById =
    <T extends { id: string }>(rows: T[]) =>
    async (args: { where: { id: { in: string[] } } }) =>
      rows.filter((r) => args.where.id.in.includes(r.id)).map((r) => ({ ...r }));

  const client = {
    externalLink,
    bankInstrument: { findUnique: byId(instruments), findMany: manyById(instruments) },
    bankSong: { findUnique: byId(songs), findMany: manyById(songs) },
    bankArtist: { findUnique: byId(artists), findMany: manyById(artists) },
    synthSound: {
      findUnique: async (args: { where: { synthId_slug: { synthId: string; slug: string } } }) => {
        const { synthId, slug } = args.where.synthId_slug;
        const row = sounds.find((s) => s.synthId === synthId && s.slug === slug);
        return row ? { id: row.id } : null;
      },
      /** A synth's sounds, or one, with each one's patterns as `headOf` reads them (`soundSources`). */
      findMany: async (args: {
        where:
          | { synthId: string; slug?: string; synth?: { listed: boolean } }
          | { OR: { synthId: string; slug: string }[] };
      }) => {
        // Several sounds by key, as the suggestion queue names its targets (t-185).
        if ('OR' in args.where) {
          const keys = args.where.OR;
          return sounds
            .filter((s) => keys.some((k) => k.synthId === s.synthId && k.slug === s.slug))
            .map((s) => ({ synthId: s.synthId, slug: s.slug, name: s.name }));
        }
        const { synthId, slug, synth: on } = args.where;
        const synth = synths.find((s) => s.id === synthId);
        if (on?.listed && !synth?.listed) return [];
        return sounds
          .filter((s) => s.synthId === synthId && (slug === undefined || s.slug === slug))
          .map((s) => ({
            id: s.id,
            slug: s.slug,
            patterns: (s.patterns ?? []).map((p) => ({
              pattern: {
                status: p.status ?? 'enabled',
                pattern: p.riff === false ? { not: 'a pattern' } : importPhrase(RIFF),
                inspiredSong: p.song ?? null,
                inspiredArtist: p.artist ?? null,
              },
            })),
          }));
      },
    },
    synth: {
      findFirst: async (args: { where: { id: string; listed?: boolean } }) => {
        const synth = synths.find(
          (s) =>
            s.id === args.where.id &&
            (args.where.listed === undefined || s.listed === args.where.listed)
        );
        return synth
          ? { bankInstruments: synth.instrumentIds.map((instrumentId) => ({ instrumentId })) }
          : null;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  /** Put a row straight in, as another writer would. */
  const insert = (row: Row) => {
    const at = now();
    const full: Row = {
      id: `clink${String(++seq).padStart(8, '0')}`,
      instrumentId: null,
      soundId: null,
      songId: null,
      artistId: null,
      providerId: null,
      thumbnailUrl: null,
      ours: false,
      order: 0,
      rating: null,
      views: null,
      likes: null,
      statsAt: null,
      kind: 'demo',
      createdAt: at,
      updatedAt: at,
      ...row,
    };
    checkRow(full);
    links.push(full);
    return full;
  };

  return { client, links, writes, insert };
}

export type LinksStore = ReturnType<typeof linksStore>;
