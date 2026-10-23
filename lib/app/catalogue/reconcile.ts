/**
 * Which catalogue rows still match the seed, and which an admin has made their own (`f-catalogue-admin`, t-32).
 *
 * Compares every row in the four catalogue tables with what the seed last planned for it (`CatalogueSeedRecord`,
 * written by `seedCatalogue` on every run). It never reads the seed files: the record is the seed's own account of
 * what it planned, so D13's boundary holds (`tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`). Values are
 * compared with the seed's own `sameValue`, so a row this page calls matching is one the seed would leave alone.
 *
 * Placement (`listed`, `order`) is not content and is never compared: an admin reordering or hiding a synth leaves it
 * matching.
 */
import type { CatalogueTable } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { catalogueKey, sameValue } from '@/lib/app/catalogue/seed';

/**
 * - `matches`: no admin edit, and the content is what the seed planned.
 * - `differs`: no admin edit, but the content is not what the seed planned. The seed brings it in on its next run, so
 *   this lasts only while a run is pending or one failed part way.
 * - `edited`: an admin changed it, and it is not what the seed now has. The seed will not overwrite it.
 * - `edited-matches`: an admin changed it, and it is what the seed has anyway.
 * - `not-in-seed`: no record; an admin added it, or the seed data has dropped it.
 * - `not-in-tables`: the seed planned it and the table does not have it yet.
 */
export const ROW_STATUSES = [
  'matches',
  'differs',
  'edited',
  'edited-matches',
  'not-in-seed',
  'not-in-tables',
] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

/** A column whose value is not what the seed planned. */
export interface FieldDifference {
  field: string;
  seed: unknown;
  current: unknown;
}

export interface ReconciledRow {
  table: CatalogueTable;
  /** The row's natural key, as the seed matches it. */
  key: string;
  /** What an admin would call the row. */
  label: string;
  status: RowStatus;
  editedAt: string | null;
  /** The columns that differ: empty unless the status is `differs` or `edited`. */
  differences: FieldDifference[];
}

export interface ReconciledGroup {
  /** The synth id, or `null` for the limits shared by every panel. */
  synthId: string | null;
  name: string;
  counts: Record<RowStatus, number>;
  rows: ReconciledRow[];
}

export interface CatalogueReconciliation {
  /** Whether the seed has recorded anything. `false` until the first run after the record table was added. */
  recorded: boolean;
  /** When the seed last recorded different values for any row. */
  lastRecordedAt: string | null;
  /** Every synth in catalogue order, then the shared limits. */
  groups: ReconciledGroup[];
}

type Values = Record<string, unknown>;
interface Current {
  table: CatalogueTable;
  key: string;
  synthId: string | null;
  label: string;
  /** Sort position within the group. */
  rank: number;
  editedAt: Date | null;
  row: Values;
}

const TABLE_RANK: Record<CatalogueTable, number> = { SYNTH: 0, LINEAGE: 1, SOUND: 2, NOTE: 3 };
const NOTE_RANK = { LIMIT_INTRO: 0, LIMIT: 1, UNUSUAL: 2 } as const;
const NOTE_LABEL = { LIMIT_INTRO: 'Limits: intro', LIMIT: 'Limit', UNUSUAL: 'Unusual on' } as const;

const id = (r: { table: CatalogueTable; key: string }) => `${r.table}:${r.key}`;

/** Every catalogue row and every seed record, compared. Five queries, whatever the size of the catalogue. */
export async function getCatalogueReconciliation(): Promise<CatalogueReconciliation> {
  const [synths, sounds, lineage, notes, records] = await Promise.all([
    prisma.synth.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    prisma.synthSound.findMany({ orderBy: [{ order: 'asc' }, { slug: 'asc' }] }),
    prisma.synthLineage.findMany(),
    prisma.synthNote.findMany({ orderBy: [{ order: 'asc' }, { key: 'asc' }] }),
    prisma.catalogueSeedRecord.findMany(),
  ]);

  const current: Current[] = [
    ...synths.map((r) => ({
      table: 'SYNTH' as const,
      key: catalogueKey.SYNTH(r),
      synthId: r.id,
      label: 'Details',
      rank: 0,
      editedAt: r.editedAt,
      row: r,
    })),
    ...lineage.map((r) => ({
      table: 'LINEAGE' as const,
      key: catalogueKey.LINEAGE(r),
      synthId: r.synthId,
      label: 'History',
      rank: 0,
      editedAt: r.editedAt,
      row: r,
    })),
    ...sounds.map((r, i) => ({
      table: 'SOUND' as const,
      key: catalogueKey.SOUND(r),
      synthId: r.synthId,
      label: `Patch: ${r.name}`,
      rank: i,
      editedAt: r.editedAt,
      row: r,
    })),
    ...notes.map((r, i) => ({
      table: 'NOTE' as const,
      key: catalogueKey.NOTE(r),
      synthId: r.synthId,
      label: `${NOTE_LABEL[r.kind]}: ${r.target ?? r.title ?? r.text.slice(0, 60)}`,
      rank: NOTE_RANK[r.kind] * 100_000 + i,
      editedAt: r.editedAt,
      row: r,
    })),
  ];

  const recordById = new Map(records.map((r) => [id(r), r]));
  const rows: (ReconciledRow & { synthId: string | null; rank: number })[] = current.map((c) => {
    const record = recordById.get(id(c));
    recordById.delete(id(c));
    const base = {
      table: c.table,
      key: c.key,
      synthId: c.synthId,
      label: c.label,
      rank: c.rank,
      editedAt: c.editedAt?.toISOString() ?? null,
    };
    if (!record) return { ...base, status: 'not-in-seed', differences: [] };
    const differences = compare(record.values, c.row);
    const status: RowStatus = c.editedAt
      ? differences.length
        ? 'edited'
        : 'edited-matches'
      : differences.length
        ? 'differs'
        : 'matches';
    return { ...base, status, differences };
  });
  // What the seed planned and the tables lack.
  for (const record of recordById.values())
    rows.push({
      table: record.table,
      key: record.key,
      synthId: record.synthId,
      label: missingLabel(record.table, record.key, record.values),
      rank: Number.MAX_SAFE_INTEGER,
      status: 'not-in-tables',
      editedAt: null,
      differences: [],
    });

  const names = new Map(synths.map((s) => [s.id, s.name]));
  const groupIds: (string | null)[] = [
    ...synths.map((s) => s.id),
    // A record for a synth the table does not have yet.
    ...new Set(
      rows.flatMap((r) => (r.synthId !== null && !names.has(r.synthId) ? [r.synthId] : []))
    ),
    null,
  ];
  const groups = groupIds.map((synthId) => {
    const own = rows
      .filter((r) => r.synthId === synthId)
      .sort((a, b) => TABLE_RANK[a.table] - TABLE_RANK[b.table] || a.rank - b.rank);
    const counts = Object.fromEntries(ROW_STATUSES.map((s) => [s, 0])) as Record<RowStatus, number>;
    for (const r of own) counts[r.status]++;
    return {
      synthId,
      name: synthId === null ? 'Every panel' : (names.get(synthId) ?? synthId),
      counts,
      rows: own.map(({ synthId: _s, rank: _r, ...row }) => row),
    };
  });

  const last = records.reduce<Date | null>(
    (latest, r) => (latest && latest > r.updatedAt ? latest : r.updatedAt),
    null
  );
  return {
    recorded: records.length > 0,
    lastRecordedAt: last?.toISOString() ?? null,
    groups: groups.filter((g) => g.rows.length > 0),
  };
}

/** The columns the seed planned that the row does not hold. */
function compare(planned: unknown, row: Values): FieldDifference[] {
  if (planned === null || typeof planned !== 'object' || Array.isArray(planned)) return [];
  return Object.entries(planned as Record<string, unknown>).flatMap(([field, seed]) =>
    sameValue(row[field], seed) ? [] : [{ field, seed, current: row[field] ?? null }]
  );
}

/** A label for a row the tables lack, from what the seed planned for it. */
function missingLabel(table: CatalogueTable, key: string, values: unknown): string {
  const name =
    values !== null && typeof values === 'object' && 'name' in values ? String(values.name) : key;
  if (table === 'SOUND') return `Patch: ${name}`;
  if (table === 'SYNTH') return 'Details';
  if (table === 'LINEAGE') return 'History';
  return `Note: ${key}`;
}
