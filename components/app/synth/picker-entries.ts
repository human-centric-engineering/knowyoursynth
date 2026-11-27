/**
 * What the synth picker lists (`f-synth-picker` t-328): every synth that plays, and every member of a synth family
 * nobody has modelled, each a row of its own, grouped under its maker's brand. Pure: the picker and its tests share it.
 *
 * - **Name and maker lead.** A row is the synth's name and maker, then its year, kind, whether it plays and its
 *   description, so a synth is found by its own name: the EDGE as the EDGE, not inside a "DFAM" entry.
 * - **Grouped and ordered as the visitor chooses** (t-329, `PickerChoices`): under each maker's brand, brands A to Z
 *   (`makerGroup`, which joins the spellings of one brand, such as Moog and Moog Music); one list by name; or by
 *   lineage, each family's original with its revisions and recreations under it. Rows A to Z, newest or oldest first.
 *   Only the kinds chosen, when any are.
 * - **A family member nobody has modelled** is listed too, and opens as its family's blank panel (`familyOpens`).
 *
 * See `.context/app/synth-picker.md`.
 */
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import { makerGroup, nameWithoutMaker } from '@/lib/app/catalogue/makers';
import type { FamilyMember, SynthFamily } from '@/lib/app/families/read';
import { z } from 'zod';
import type {
  PickerGroupBy,
  PickerKind,
  PickerOrder,
  PickerScope,
} from '@/lib/app/picker/settings';

export type PickerSynth = Pick<CatalogueSynth, 'id' | 'name' | 'maker' | 'year' | 'heritage'> & {
  kind?: string | null;
};

/** A family a row belongs to, and its member slug: what search matches, and what an unmodelled row opens. */
export interface RowFamily {
  family: SynthFamily;
  member: FamilyMember;
}

/** A databank instrument as the picker reads it from `GET /api/v1/bank/instruments` (t-330): outside data, so checked. */
export const PickerInstrumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  maker: z.string(),
  year: z.string(),
  kind: z.string(),
  text: z.string(),
  /** App synths that model it. */
  synths: z.array(z.string()),
  /** The instrument this one recreates. */
  recreationOf: z.string().optional(),
});
export type PickerInstrument = z.infer<typeof PickerInstrumentSchema>;

export interface PickerRow {
  /**
   * Unique in the list: the synth id, `member:<family>/<slug>` for an unmodelled family member, or `bank:<id>` for any
   * other databank instrument (with every synth ever made).
   */
  key: string;
  name: string;
  maker: string;
  year: string;
  kind: string | null;
  /** The one-line description: a synth's heritage, an unmodelled member's differences. */
  text: string;
  /** The synth it plays as; null for an instrument nobody has modelled. */
  synthId: string | null;
  family: RowFamily | null;
  /** The databank instrument it is, when the picker knows it: what lineage follows, and what an unmodelled row opens. */
  instrumentId: string | null;
  /** The databank instrument it recreates, when the picker knows it. */
  recreationOf: string | null;
}

/** A row as listed: in a lineage, how far in it sits under its original, and what it is to it. */
export interface PickerListRow extends PickerRow {
  /** 0 for a row at the top level; 1 for one under its family's original (lineage only). */
  depth: 0 | 1;
  /** What it is to the original it sits under: a `Revision` by the same brand, or a `Recreation` by another. */
  relation: 'Revision' | 'Recreation' | null;
  /**
   * Listed only to show where a match sits: a lineage's original that the box or a kind did not find itself. Enter in
   * the box passes over it to the first row that did match.
   */
  context?: true;
}

export interface PickerGroup {
  /** The brand, as `makerGroup` names it; empty for a list with no headings (by name, or by lineage). */
  label: string;
  rows: PickerListRow[];
}

const byName = (a: PickerRow, b: PickerRow) =>
  a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) ||
  a.maker.localeCompare(b.maker, 'en', { sensitivity: 'base' }) ||
  a.key.localeCompare(b.key);

/** Which rows the picker lists, and how. */
export interface PickerOptions {
  /** Whether a family member nobody has modelled is listed: only where the page can show its blank panel. */
  unmodelled: boolean;
  /**
   * The databank's instruments, once read (t-330): every synth and member learns its instrument and what it recreates,
   * for lineage, and with `scope` `all` each other instrument is a row of its own.
   */
  bank?: readonly PickerInstrument[];
  /** The synths that play, or every synth ever made (with `bank`); the first when not said. */
  scope?: PickerScope;
  /** How rows are grouped; by maker when not said. */
  group?: PickerGroupBy;
  /** How rows are ordered; A to Z when not said. */
  order?: PickerOrder;
  /** Only these kinds; every kind when empty or not said. A row with no kind is listed only then. */
  kinds?: readonly PickerKind[];
}

/**
 * Every row the picker can list: each synth offered, then (with `unmodelled`) each unmodelled member of a served
 * family. Families are read either way, so a synth is found by its family's name.
 */
export function pickerRows(
  synths: readonly PickerSynth[],
  families: readonly SynthFamily[],
  { unmodelled, bank = [], scope = 'play' }: PickerOptions = { unmodelled: true }
): PickerRow[] {
  const familyOf = new Map<string, RowFamily>();
  for (const family of families)
    for (const member of family.members)
      if (member.synthId) familyOf.set(member.synthId, { family, member });
  const instrumentById = new Map(bank.map((i) => [i.id, i]));
  // The first instrument (by the list's order) that a synth models: what its row stands for in a lineage.
  const instrumentOfSynth = new Map<string, PickerInstrument>();
  for (const i of bank)
    for (const id of i.synths) if (!instrumentOfSynth.has(id)) instrumentOfSynth.set(id, i);

  const rows: PickerRow[] = synths.map((s) => {
    const instrument = instrumentOfSynth.get(s.id);
    return {
      key: s.id,
      name: s.name,
      maker: s.maker,
      year: String(s.year),
      kind: s.kind ?? null,
      text: s.heritage,
      synthId: s.id,
      family: familyOf.get(s.id) ?? null,
      instrumentId: instrument?.id ?? null,
      recreationOf: instrument?.recreationOf ?? null,
    };
  });
  if (!unmodelled) return rows;
  const offered = new Set(synths.map((s) => s.id));
  for (const family of families) {
    // A family none of whose members the picker offers has nothing to open its blank panels over.
    if (!family.members.some((m) => m.synthId && offered.has(m.synthId))) continue;
    for (const member of family.members) {
      if (member.synthId) continue;
      const { instrument } = member;
      rows.push({
        key: `member:${family.id}/${member.slug}`,
        name: nameWithoutMaker(instrument.name, instrument.maker),
        maker: instrument.maker,
        year: instrument.year,
        kind: instrument.kind,
        text: member.differences,
        synthId: null,
        family: { family, member },
        instrumentId: instrument.id,
        recreationOf: instrumentById.get(instrument.id)?.recreationOf ?? null,
      });
    }
  }
  if (scope !== 'all') return rows;

  // Every other instrument in the databank: one a listed synth models, or a family member already listed, is not
  // listed twice.
  const listed = new Set(rows.flatMap((r) => (r.instrumentId ? [r.instrumentId] : [])));
  for (const i of bank) {
    if (listed.has(i.id) || i.synths.some((id) => offered.has(id))) continue;
    rows.push({
      key: `bank:${i.id}`,
      name: nameWithoutMaker(i.name, i.maker),
      maker: i.maker,
      year: i.year,
      kind: i.kind,
      text: i.text,
      synthId: null,
      family: null,
      instrumentId: i.id,
      recreationOf: i.recreationOf ?? null,
    });
  }
  return rows;
}

/**
 * Whether a row matches the box: by its name, maker, brand or family, or by its maker or brand and name together, or
 * its full databank name, so "arp 2600" finds the ARP 2600 the row calls "2600" under ARP Instruments.
 */
function matches(row: PickerRow, q: string): boolean {
  const brand = makerGroup(row.maker);
  return [
    row.name,
    row.maker,
    brand,
    row.family?.family.name ?? '',
    `${row.maker} ${row.name}`,
    `${brand} ${row.name}`,
    row.family?.member.instrument.name ?? '',
  ].some((s) => s.toLowerCase().includes(q));
}

/** A row's year, or null when the databank gives none ("", or no four-digit year in it). */
const year = (row: PickerRow): number | null => {
  // The first four digits, so "c. 1975" and "1975–78" read as 1975.
  const m = /\d{4}/.exec(row.year);
  return m ? Number(m[0]) : null;
};

/** By year, oldest first (`dir` 1) or newest (-1); a row with no year after every dated one, either way. */
const byYear =
  (dir: 1 | -1) =>
  (a: PickerRow, b: PickerRow): number => {
    const [x, y] = [year(a), year(b)];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return dir * (x - y);
  };
const oldestFirst = byYear(1);
const newestFirst = byYear(-1);

/** The order rows are listed in: by name, or by year (newest or oldest first) and then by name. */
function sorter(order: PickerOrder): (a: PickerRow, b: PickerRow) => number {
  if (order === 'new') return (a, b) => newestFirst(a, b) || byName(a, b);
  if (order === 'old') return (a, b) => oldestFirst(a, b) || byName(a, b);
  return byName;
}

const listed = (row: PickerRow): PickerListRow => ({ ...row, depth: 0, relation: null });

/**
 * Each family's original among `rows`: its earliest dated member, then by name; a member with no year is the original
 * only when none has one. Read from every row the picker could list, so a member found by the box still shows under
 * its original.
 */
function originals(rows: readonly PickerRow[]): Map<string, PickerRow> {
  const out = new Map<string, PickerRow>();
  for (const row of rows) {
    const id = row.family?.family.id;
    if (!id) continue;
    const held = out.get(id);
    if (!held || (oldestFirst(row, held) || byName(row, held)) < 0) out.set(id, row);
  }
  return out;
}

/**
 * Each original in `kept`, in the order chosen, with what descends from it under it, oldest first. A row's original is
 * found by following what it recreates (the databank's `recreationOf`, once read) and then its family's original, up to
 * the first row with neither, so the EDGE sits under the DFAM and the K-2 under the MS-20 whether or not a family says
 * so. A row whose original the box or a kind did not find keeps it over it, as context.
 */
function lineage(
  all: readonly PickerRow[],
  kept: readonly PickerRow[],
  sort: (a: PickerRow, b: PickerRow) => number
): PickerListRow[] {
  const firsts = originals(all);
  const byInstrument = new Map<string, PickerRow>();
  for (const row of all)
    if (row.instrumentId && !byInstrument.has(row.instrumentId))
      byInstrument.set(row.instrumentId, row);
  const above = (row: PickerRow): PickerRow | undefined => {
    const copied = row.recreationOf ? byInstrument.get(row.recreationOf) : undefined;
    if (copied) return copied;
    const first = row.family ? firsts.get(row.family.family.id) : undefined;
    return first && first.key !== row.key ? first : undefined;
  };
  const rootOf = (row: PickerRow): PickerRow => {
    const path = [row];
    const seen = new Set([row.key]);
    let at = row;
    for (let next = above(at); next; next = above(at)) {
      // Data that recreates itself in a loop: every row in it takes the same one (the least key) as its original,
      // so none is listed twice.
      if (seen.has(next.key)) return path.reduce((a, b) => (b.key < a.key ? b : a));
      seen.add(next.key);
      path.push(next);
      at = next;
    }
    return at;
  };

  const keptKeys = new Set(kept.map((r) => r.key));
  const tops = new Map<string, PickerRow>();
  const under = new Map<string, PickerRow[]>();
  for (const row of kept) {
    const root = rootOf(row);
    tops.set(root.key, root);
    if (root.key !== row.key) under.set(root.key, [...(under.get(root.key) ?? []), row]);
  }
  const out: PickerListRow[] = [];
  for (const top of [...tops.values()].sort(sort)) {
    out.push(keptKeys.has(top.key) ? listed(top) : { ...listed(top), context: true });
    const brand = makerGroup(top.maker);
    // Under its original, what descends from it is always oldest first, whatever order the originals are in.
    const rows = [...(under.get(top.key) ?? [])].sort((a, b) => oldestFirst(a, b) || byName(a, b));
    for (const row of rows)
      out.push({
        ...row,
        depth: 1,
        relation: makerGroup(row.maker) === brand ? 'Revision' : 'Recreation',
      });
  }
  return out;
}

/**
 * The picker's list: the rows matching `query` and the kinds chosen, grouped and ordered as chosen. By maker, brands
 * A to Z with a heading each; by name or by lineage, one list with no heading.
 */
export function pickerGroups(
  synths: readonly PickerSynth[],
  families: readonly SynthFamily[],
  query = '',
  options: PickerOptions = { unmodelled: true }
): PickerGroup[] {
  const { group = 'maker', order = 'name', kinds = [] } = options;
  const q = query.trim().toLowerCase();
  const all = pickerRows(synths, families, options);
  const kept = all.filter(
    (row) =>
      (!q || matches(row, q)) &&
      (kinds.length === 0 || (row.kind !== null && (kinds as readonly string[]).includes(row.kind)))
  );
  const sort = sorter(order);
  if (group === 'lineage') {
    const rows = lineage(all, kept, sort);
    return rows.length ? [{ label: '', rows }] : [];
  }
  if (group === 'name')
    return kept.length ? [{ label: '', rows: [...kept].sort(sort).map(listed) }] : [];

  const groups = new Map<string, PickerRow[]>();
  for (const row of kept) {
    const label = makerGroup(row.maker);
    const held = groups.get(label);
    if (held) held.push(row);
    else groups.set(label, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(([label, rows]) => ({ label, rows: rows.sort(sort).map(listed) }));
}

/**
 * The synth a family opens on: the first member, in toggle order, that the user owns (a databank instrument on their
 * owned list) and the picker offers, else the family's default member (the one most people are likely to own).
 * `offered` is the family's modelled members the picker offers, in toggle order. An unmodelled member's blank panel is
 * shown over this synth's page.
 */
export function familyOpens(
  family: SynthFamily,
  offered: readonly PickerSynth[],
  owned: ReadonlySet<string>
): string | null {
  const ids = new Set(offered.map((s) => s.id));
  const mine = family.members.find(
    (m) => m.synthId && ids.has(m.synthId) && owned.has(m.instrument.id)
  );
  if (mine?.synthId) return mine.synthId;
  const fallback = family.members.find((m) => m.slug === family.defaultMember)?.synthId;
  return fallback && ids.has(fallback) ? fallback : (offered[0]?.id ?? null);
}
