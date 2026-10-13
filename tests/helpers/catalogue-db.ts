/**
 * A small stateful fake of the catalogue tables, for tests that run the real seed, the real admin routes and the real
 * read code over them (`f-catalogue-admin`).
 *
 * Rows are copied in and out, as a database would. The synth table answers the relations and counts the admin list
 * and detail read (`lineage`, `_count`, and on `findUnique` its `sounds`, `lineage` and `notes`), worked out from the
 * other tables. `seedRecordTable` is the seed's own record (`CatalogueSeedRecord`), which the seed reads whole,
 * creates in bulk, updates by `table_key` and removes by an `OR` of keys.
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Does a row satisfy a Prisma `where`: equality, `{ in }`, `OR` and the sound's compound key. */
export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Where[]).some((w) => matches(row, w));
    if (k === 'synthId_slug') return matches(row, v as Where);
    if (v !== null && typeof v === 'object' && 'in' in v)
      return (v as { in: unknown[] }).in.includes(row[k]);
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

/** The four catalogue tables, with the synth table's relations worked out from the others. */
export function catalogueTables() {
  const db = { synth: table(), synthSound: table(), synthLineage: table(), synthNote: table() };
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
