/**
 * A small stateful fake of the catalogue tables, for tests that run the real seed, the real admin routes and the real
 * read code over them (`f-catalogue-admin`).
 *
 * Rows are copied in and out, as a database would. The synth table answers the relations and counts the admin list
 * and detail read (`lineage`, `_count`, and on `findUnique` its `sounds`, `lineage` and `notes`), worked out from the
 * other tables. `seedRecordTable` is the seed's own record (`CatalogueSeedRecord`), which the seed reads whole,
 * creates in bulk, updates by `table_key` and removes by an `OR` of keys.
 */
import { vi, type Mock } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Does a row satisfy a Prisma `where`: equality, `{ in }`, `{ not }`, `OR` and the compound keys. */
export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Where[]).some((w) => matches(row, w));
    if (k === 'synthId_slug' || k === 'soundId_patternId') return matches(row, v as Where);
    if (v !== null && typeof v === 'object' && 'in' in v)
      return (v as { in: unknown[] }).in.includes(row[k]);
    if (v !== null && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
    return row[k] === v;
  });
}

export function sortRows(rows: Row[], orderBy: Record<string, 'asc'>[] = []): Row[] {
  return [...rows].sort((a, b) => {
    for (const o of orderBy) {
      const [k] = Object.keys(o);
      const x = a[k] as string | number;
      const y = b[k] as string | number;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });
}

/** One table. Rows are copied in and out, as a database would. Nothing deletes. */
export function table() {
  const rows: Row[] = [];
  let next = 0;
  const find = (where: Where) => rows.find((r) => matches(r, where));
  return {
    rows,
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const r = find(where);
      return r ? structuredClone(r) : null;
    }),
    findMany: vi.fn(async (args: { where?: Where; orderBy?: Record<string, 'asc'>[] } = {}) =>
      sortRows(
        rows.filter((r) => matches(r, args.where)),
        args.orderBy
      ).map((r) => structuredClone(r))
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `row${++next}`, editedAt: null, ...structuredClone(data) };
      rows.push(row);
      return structuredClone(row);
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const r = find(where);
      if (!r) throw new Error(`fake: no row for ${JSON.stringify(where)}`);
      Object.assign(r, structuredClone(data));
      return structuredClone(r);
    }),
    /** Writes every matching row, as Prisma's does; the `where` may include `editedAt: null`. */
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, structuredClone(data));
      return { count: hit.length };
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Where; create: Row; update: Row }) => {
      const r = find(where);
      if (r) return Object.assign(r, structuredClone(update)) && structuredClone(r);
      const row = { editedAt: null, ...structuredClone(create) };
      rows.push(row);
      return structuredClone(row);
    }),
    aggregate: vi.fn(async ({ where }: { where: Where }) => {
      const orders = rows.filter((r) => matches(r, where)).map((r) => r.order as number);
      return { _max: { order: orders.length ? Math.max(...orders) : null } };
    }),
  };
}

/**
 * The four catalogue tables and the pattern library's (`f-pattern-library`), with the relations the code reads worked
 * out from the others: a synth's, a sound's list of patterns (`patterns`, default first, each with its `pattern`), and
 * a pattern's sounds. A sound's `where` may also ask for `patterns: { some: { patternId } }`. The databank tables a
 * pattern's Inspired by reads start empty.
 */
export function catalogueTables() {
  const db = {
    synth: table(),
    synthSound: {
      ...table(),
      findFirst: vi.fn(async (_args: { where: Where }): Promise<Row | null> => null),
      findUniqueOrThrow: vi.fn(async (_args: { where: Where }): Promise<Row> => ({})),
    },
    synthLineage: table(),
    synthNote: table(),
    libraryPattern: {
      ...table(),
      findFirst: vi.fn(async (_args: { where: Where }): Promise<Row | null> => null),
      count: vi.fn(async (_args: { where?: Where }) => 0),
    },
    synthSoundPattern: table(),
    bankArtist: table(),
    bankMaker: table(),
    bankSong: table(),
  };
  withLibraryRelations(db);
  const synthFindMany = db.synth.findMany.getMockImplementation();
  db.synth.findMany.mockImplementation(async (args) =>
    (await synthFindMany!(args)).map((r) => ({
      ...r,
      lineage: db.synthLineage.rows.find((l) => l.synthId === r.id) ?? null,
      _count: {
        sounds: db.synthSound.rows.filter((s) => s.synthId === r.id).length,
        notes: db.synthNote.rows.filter((n) => n.synthId === r.id).length,
      },
    }))
  );
  const synthFindUnique = db.synth.findUnique.getMockImplementation();
  db.synth.findUnique.mockImplementation(async (args) => {
    const r = await synthFindUnique!(args);
    return (
      r && {
        ...r,
        sounds: sortRows(
          db.synthSound.rows.filter((s) => s.synthId === r.id),
          [{ order: 'asc' }]
        ).map((s) => structuredClone(s)),
        lineage: structuredClone(db.synthLineage.rows.find((l) => l.synthId === r.id) ?? null),
        notes: sortRows(
          db.synthNote.rows.filter((n) => n.synthId === r.id),
          [{ order: 'asc' }, { key: 'asc' }]
        ).map((n) => structuredClone(n)),
      }
    );
  });
  return db;
}
export type CatalogueTables = ReturnType<typeof catalogueTables>;

/** The relations between sounds and library patterns, over the fake's rows. */
type FakeTable = { rows: Row[] } & Record<'findMany' | 'findUnique' | 'create', Mock>;
function withLibraryRelations(db: {
  synth: { rows: Row[] };
  synthSound: FakeTable & { findUniqueOrThrow: Mock; findFirst: Mock };
  libraryPattern: FakeTable & { count: Mock; findFirst: Mock };
  synthSoundPattern: { rows: Row[] };
}) {
  const linksOf = (soundId: unknown) =>
    sortRows(
      db.synthSoundPattern.rows.filter((l) => l.soundId === soundId),
      [{ order: 'asc' }, { patternId: 'asc' }]
    );
  const soundWhere = (row: Row, where: Where = {}): boolean => {
    const { patterns, synth, ...rest } = where as {
      patterns?: { some: { patternId: unknown } };
      synth?: { listed: boolean };
    };
    if (synth && db.synth.rows.find((s) => s.id === row.synthId)?.listed !== synth.listed)
      return false;
    if (patterns) {
      const id = patterns.some.patternId;
      const ids = id !== null && typeof id === 'object' ? (id as { in: unknown[] }).in : [id];
      if (!linksOf(row.id).some((l) => ids.includes(l.patternId))) return false;
    }
    return matches(row, rest);
  };
  const soundOut = (row: Row) => ({
    ...structuredClone(row),
    patterns: linksOf(row.id).map((l) => ({
      ...structuredClone(l),
      pattern: structuredClone(db.libraryPattern.rows.find((p) => p.id === l.patternId)),
    })),
  });
  db.synthSound.findMany.mockImplementation(
    async (args: { where?: Where; orderBy?: Record<string, 'asc'>[] } = {}) =>
      sortRows(
        db.synthSound.rows.filter((r) => soundWhere(r, args.where)),
        args.orderBy
      ).map(soundOut)
  );
  db.synthSound.findUnique.mockImplementation(async ({ where }: { where: Where }) => {
    const r = db.synthSound.rows.find((s) => matches(s, where));
    return r ? soundOut(r) : null;
  });
  db.synthSound.findFirst.mockImplementation(async ({ where }: { where: Where }) => {
    const r = db.synthSound.rows.find((s) => soundWhere(s, where));
    return r ? soundOut(r) : null;
  });
  db.synthSound.findUniqueOrThrow.mockImplementation(async ({ where }: { where: Where }) => {
    const r = db.synthSound.rows.find((s) => matches(s, where));
    if (!r) throw new Error(`fake: no sound for ${JSON.stringify(where)}`);
    return soundOut(r);
  });

  const patternOut = (row: Row) => ({
    ...structuredClone(row),
    sounds: db.synthSoundPattern.rows
      .filter((l) => l.patternId === row.id)
      .map((l) => {
        const sound = db.synthSound.rows.find((s) => s.id === l.soundId) ?? {};
        return {
          order: l.order,
          sound: {
            synthId: sound.synthId,
            slug: sound.slug,
            name: sound.name,
            patterns: linksOf(sound.id).slice(0, 1),
          },
        };
      }),
  });
  /** A pattern's `where`: its columns, `AND`, `OR`, and `sounds: { none: {} }` or `{ some: on a listed synth }`. */
  const patternWhere = (row: Row, where: Where = {}): boolean => {
    const { AND, OR, sounds, ...rest } = where as {
      AND?: Where[];
      OR?: Where[];
      sounds?: { none?: object; some?: { sound: { synth: { listed: boolean } } } };
    };
    if (AND && !AND.every((w) => patternWhere(row, w))) return false;
    if (OR && !OR.some((w) => patternWhere(row, w))) return false;
    if (sounds) {
      const on = db.synthSoundPattern.rows
        .filter((l) => l.patternId === row.id)
        .map((l) => db.synthSound.rows.find((s) => s.id === l.soundId));
      if (sounds.none && on.length) return false;
      if (sounds.some && !on.some((s) => soundWhere(s ?? {}, { synth: sounds.some!.sound.synth })))
        return false;
    }
    return matches(row, rest);
  };
  let made = 0;
  const plainCreate = db.libraryPattern.create.getMockImplementation()!;
  db.libraryPattern.create.mockImplementation(async ({ data }: { data: Row }) => {
    const { sounds, ...columns } = data as Row & { sounds?: { create: Row } };
    // A cuid's shape, as the id schema the routes check wants; the database's column defaults.
    const row = await plainCreate({
      data: {
        id: `cpat${String(++made).padStart(21, '0')}`,
        sources: [],
        bpmMin: null,
        bpmMax: null,
        inspiredSongId: null,
        inspiredPartId: null,
        inspiredArtistId: null,
        inspiredSynthId: null,
        updatedAt: new Date(),
        ...columns,
      },
    });
    if (sounds) db.synthSoundPattern.rows.push({ ...sounds.create, patternId: row.id });
    return patternOut(row);
  });
  db.libraryPattern.findMany.mockImplementation(
    async (
      args: { where?: Where; orderBy?: Record<string, 'asc'>[]; skip?: number; take?: number } = {}
    ) =>
      sortRows(
        db.libraryPattern.rows.filter((p) => patternWhere(p, args.where)),
        args.orderBy
      )
        .slice(args.skip ?? 0, args.take === undefined ? undefined : (args.skip ?? 0) + args.take)
        .map(patternOut)
  );
  const findPattern = async ({ where }: { where: Where }) => {
    const r = db.libraryPattern.rows.find((p) => patternWhere(p, where));
    return r ? patternOut(r) : null;
  };
  db.libraryPattern.findUnique.mockImplementation(findPattern);
  db.libraryPattern.findFirst.mockImplementation(findPattern);
  db.libraryPattern.count.mockImplementation(
    async ({ where }: { where?: Where } = {}) =>
      db.libraryPattern.rows.filter((p) => patternWhere(p, where)).length
  );
}

/** The seed's record of what it planned, keyed by table and natural key. */
export function seedRecordTable() {
  const rows = new Map<string, Row>();
  const id = (r: Row) => `${String(r.table)}:${String(r.key)}`;
  return {
    rows,
    findMany: vi.fn(async () => [...rows.values()].map((r) => structuredClone(r))),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const r of data) rows.set(id(r), { ...structuredClone(r), updatedAt: new Date() });
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { table_key: Row }; data: Row }) => {
      const key = id(where.table_key);
      rows.set(key, { ...rows.get(key), ...structuredClone(data), updatedAt: new Date() });
    }),
    deleteMany: vi.fn(async ({ where }: { where: { OR: Row[] } }) => {
      for (const w of where.OR) rows.delete(id(w));
      return { count: where.OR.length };
    }),
  };
}
