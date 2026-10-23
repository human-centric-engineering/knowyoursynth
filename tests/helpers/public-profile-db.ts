/**
 * A small stateful fake of the tables a public profile reads (`f-profiles` r3): users, synth profiles, the synths on
 * their lists and the databank's instruments, and their sounds with the catalogue's synths (`f-sharing` h2), and their
 * patterns (`f-step-sequencer` t-83).
 *
 * It honours `select` the way Prisma does, including a join to the user's own row, so a read that asked for the
 * account would carry its name and email into the answer and the tests' absence checks would see them.
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;

export interface PublicProfileDb {
  users: Row[];
  profiles: Row[];
  owned: Row[];
  instruments: Row[];
  /** Users' sounds: `u1` has one published, one link share and one private. */
  sounds: Row[];
  /** The catalogue's synths. */
  synths: Row[];
  /** Users' patterns: `u1` has one published, one link share and one published but unlisted. */
  patterns: Row[];
}

/** The account's private name and email, seeded so a test can assert they never appear. */
export const ACCOUNT_NAME = 'Avery Quillfeather';
export const ACCOUNT_EMAIL = 'avery.quillfeather@private.example';

export function seedPublicProfileDb(): PublicProfileDb {
  return {
    users: [
      { id: 'u1', name: ACCOUNT_NAME, email: ACCOUNT_EMAIL },
      { id: 'u2', name: 'Other Person', email: 'other@private.example' },
    ],
    profiles: [
      {
        userId: 'u1',
        username: 'moog_fan',
        usernameChangedAt: null,
        youtube: 'https://www.youtube.com/@moogfan',
        spotify: null,
        instagram: 'https://www.instagram.com/moogfan',
        bandcamp: 'https://moogfan.bandcamp.com',
        public: true,
        showOwned: true,
        showWishlist: true,
      },
      {
        userId: 'u2',
        username: 'quiet_one',
        usernameChangedAt: null,
        youtube: 'https://www.youtube.com/@quietone',
        spotify: null,
        instagram: null,
        bandcamp: null,
        public: false,
        showOwned: true,
        showWishlist: true,
      },
    ],
    owned: [
      { userId: 'u1', instrumentId: 'juno-60', kind: 'owned', position: 1, createdAt: new Date(2) },
      {
        userId: 'u1',
        instrumentId: 'minimoog-model-d',
        kind: 'owned',
        position: 0,
        createdAt: new Date(1),
      },
      {
        userId: 'u1',
        instrumentId: 'cs-80',
        kind: 'wishlist',
        position: 0,
        createdAt: new Date(3),
      },
      { userId: 'u2', instrumentId: 'tb-303', kind: 'owned', position: 0, createdAt: new Date(4) },
    ],
    instruments: [
      { id: 'juno-60', name: 'Juno-60', maker: 'Roland', year: '1982' },
      { id: 'minimoog-model-d', name: 'Minimoog Model D', maker: 'Moog', year: '1970' },
      { id: 'cs-80', name: 'CS-80', maker: 'Yamaha', year: '1977' },
      { id: 'tb-303', name: 'TB-303', maker: 'Roland', year: '1981' },
    ],
    sounds: [
      sound('s1', 'u1', 'published', 'Night bass'),
      sound('s2', 'u1', 'link', 'Link-only lead'),
      sound('s3', 'u1', 'private', 'Unshared pad'),
      sound('s4', 'u2', 'published', 'Quiet drone'),
    ],
    patterns: [
      pattern('p1', 'u1', 'published', 'Acid walk'),
      pattern('p2', 'u1', 'link', 'Link-only riff'),
      { ...pattern('p3', 'u1', 'published', 'Unlisted riff'), unlistedAt: new Date(5) },
    ],
    synths: [
      {
        id: 'model-d',
        name: 'Model D',
        maker: 'Behringer',
        year: 2018,
        heritage: 'Modelled on the Minimoog',
        summary: 'Three oscillators.',
        design: 'NEUTRAL',
        listed: true,
      },
    ],
  };
}

function sound(id: string, userId: string, visibility: string, name: string): Row {
  return {
    id,
    userId,
    synthId: 'model-d',
    name,
    visibility,
    slug: visibility === 'private' ? null : `${id}${'x'.repeat(10 - id.length)}`,
    publishedAt: visibility === 'published' ? new Date(Date.UTC(2026, 9, 16)) : null,
    tags: [],
  };
}

function pattern(id: string, userId: string, visibility: string, name: string): Row {
  return {
    id,
    userId,
    synthId: 'model-d',
    name,
    visibility,
    slug: `${id}${'y'.repeat(10 - id.length)}`,
    publishedAt: visibility === 'published' ? new Date(Date.UTC(2026, 9, 22)) : null,
    unlistedAt: null,
    version: 1,
    pattern: { not: 'read by the card' },
  };
}

function project(row: Row, select: Row | undefined, join: (key: string, sub: Row) => unknown) {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, want] of Object.entries(select)) {
    if (want === true) out[key] = row[key];
    else if (want && typeof want === 'object') {
      const sub = (want as { select?: Row }).select ?? {};
      out[key] = join(key, sub);
    }
  }
  return out;
}

/** The delegates the public read uses, over `db`. Assign onto the mocked `prisma`. */
export function publicProfileDelegates(db: PublicProfileDb) {
  const userOf = (id: unknown) => db.users.find((u) => u.id === id);
  return {
    synth: {
      findMany: vi.fn(async (args: { where: { listed: boolean } }) =>
        db.synths
          .filter((r) => r.listed === args.where.listed)
          .map((r) => ({ ...r, _count: { sounds: 0 } }))
      ),
    },
    userSound: {
      findMany: vi.fn(
        async (args: {
          where: { userId: string; visibility: string; synthId: { in: string[] } };
          select?: Row;
        }) =>
          db.sounds
            .filter(
              (r) =>
                r.userId === args.where.userId &&
                r.visibility === args.where.visibility &&
                r.slug !== null &&
                args.where.synthId.in.includes(String(r.synthId))
            )
            .map((r) => {
              const out = project(r, args.select, () => null);
              return { ...out, _count: { copies: 0 } };
            })
      ),
    },
    userPattern: {
      findMany: vi.fn(
        async (args: {
          where: { userId: string; visibility: string; unlistedAt: null };
          select?: Row;
        }) =>
          db.patterns
            .filter(
              (r) =>
                r.userId === args.where.userId &&
                r.visibility === args.where.visibility &&
                r.slug !== null &&
                (args.where.unlistedAt !== null || r.unlistedAt === null)
            )
            .map((r) => ({ ...project(r, args.select, () => null), _count: { copies: 0 } }))
      ),
    },
    synthProfile: {
      findMany: vi.fn(async (args: { where: { userId: { in: string[] } }; select?: Row }) =>
        db.profiles
          .filter((p) => args.where.userId.in.includes(String(p.userId)))
          .map((p) => project(p, args.select, () => null))
      ),
      findUnique: vi.fn(async (args: { where: Row; select?: Row }) => {
        const row = db.profiles.find((p) =>
          Object.entries(args.where).every(([k, v]) => p[k] === v)
        );
        if (!row) return null;
        return project(row, args.select, (key, sub) =>
          key === 'user' ? project(userOf(row.userId) ?? {}, sub, () => null) : null
        );
      }),
    },
    ownedInstrument: {
      findMany: vi.fn(
        async (args: {
          where: { userId: string; kind?: { in: string[] } };
          orderBy?: Record<string, 'asc' | 'desc'>[];
          select?: Row;
        }) => {
          // sorted as asked, not as the read is expected to ask, so an order test proves the order sent
          const keys = (args.orderBy ?? []).flatMap((o) => Object.entries(o));
          const rows = db.owned
            .filter((r) => r.userId === args.where.userId)
            .filter((r) => !args.where.kind || args.where.kind.in.includes(String(r.kind)))
            .sort((a, b) => {
              for (const [key, dir] of keys) {
                const x = a[key] as number | string | Date;
                const y = b[key] as number | string | Date;
                if (x < y) return dir === 'asc' ? -1 : 1;
                if (x > y) return dir === 'asc' ? 1 : -1;
              }
              return 0;
            });
          return rows.map((r) =>
            project(r, args.select, (key, sub) => {
              if (key === 'instrument')
                return project(
                  db.instruments.find((i) => i.id === r.instrumentId) ?? {},
                  sub,
                  () => null
                );
              if (key === 'user') return project(userOf(r.userId) ?? {}, sub, () => null);
              return null;
            })
          );
        }
      ),
    },
  };
}
