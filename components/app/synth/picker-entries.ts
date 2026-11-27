/**
 * What the synth picker lists (`f-synth-picker` t-328): every synth that plays, and every member of a synth family
 * nobody has modelled, each a row of its own, grouped under its maker's brand. Pure: the picker and its tests share it.
 *
 * - **Name and maker lead.** A row is the synth's name and maker, then its year, kind, whether it plays and its
 *   description, so a synth is found by its own name: the EDGE as the EDGE, not inside a "DFAM" entry.
 * - **Grouped by brand**, brands A to Z and rows A to Z within each (`makerGroup`, which joins the spellings of one
 *   brand, such as Moog and Moog Music).
 * - **A family member nobody has modelled** is listed too, and opens as its family's blank panel (`familyOpens`).
 *
 * See `.context/app/synth-picker.md`.
 */
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import { makerGroup, nameWithoutMaker } from '@/lib/app/catalogue/makers';
import type { FamilyMember, SynthFamily } from '@/lib/app/families/read';

export type PickerSynth = Pick<CatalogueSynth, 'id' | 'name' | 'maker' | 'year' | 'heritage'> & {
  kind?: string | null;
};

/** A family a row belongs to, and its member slug: what search matches, and what an unmodelled row opens. */
export interface RowFamily {
  family: SynthFamily;
  member: FamilyMember;
}

export interface PickerRow {
  /** Unique in the list: the synth id, or `member:<family>/<slug>` for an unmodelled member. */
  key: string;
  name: string;
  maker: string;
  year: string;
  kind: string | null;
  /** The one-line description: a synth's heritage, an unmodelled member's differences. */
  text: string;
  /** The synth it plays as; null for a family member nobody has modelled. */
  synthId: string | null;
  family: RowFamily | null;
}

export interface PickerGroup {
  /** The brand, as `makerGroup` names it. */
  label: string;
  rows: PickerRow[];
}

const byName = (a: PickerRow, b: PickerRow) =>
  a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) ||
  a.maker.localeCompare(b.maker, 'en', { sensitivity: 'base' }) ||
  a.key.localeCompare(b.key);

/** Every row the picker can list: each synth offered, then each unmodelled member of a served family. */
export function pickerRows(
  synths: readonly PickerSynth[],
  families: readonly SynthFamily[]
): PickerRow[] {
  const familyOf = new Map<string, RowFamily>();
  for (const family of families)
    for (const member of family.members)
      if (member.synthId) familyOf.set(member.synthId, { family, member });

  const rows: PickerRow[] = synths.map((s) => ({
    key: s.id,
    name: s.name,
    maker: s.maker,
    year: String(s.year),
    kind: s.kind ?? null,
    text: s.heritage,
    synthId: s.id,
    family: familyOf.get(s.id) ?? null,
  }));
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
      });
    }
  }
  return rows;
}

/** Whether a row matches the box: by its name, maker, brand or family. */
function matches(row: PickerRow, q: string): boolean {
  return [row.name, row.maker, makerGroup(row.maker), row.family?.family.name ?? ''].some((s) =>
    s.toLowerCase().includes(q)
  );
}

/** The picker's list: the rows matching `query`, grouped by brand, brands and rows A to Z. */
export function pickerGroups(
  synths: readonly PickerSynth[],
  families: readonly SynthFamily[],
  query = ''
): PickerGroup[] {
  const q = query.trim().toLowerCase();
  const groups = new Map<string, PickerRow[]>();
  for (const row of pickerRows(synths, families)) {
    if (q && !matches(row, q)) continue;
    const label = makerGroup(row.maker);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(([label, rows]) => ({ label, rows: rows.sort(byName) }));
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
