/**
 * What the synth picker lists, with each synth family as one entry (`f-synth-families` t-320), and which member a
 * family opens on. Pure: the picker and its tests share it.
 *
 * See `.context/app/synth-families.md`.
 */
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import type { SynthFamily } from '@/lib/app/families/read';

export type PickerSynth = Pick<CatalogueSynth, 'id' | 'name' | 'maker' | 'year' | 'heritage'>;

export type PickerEntry =
  | { kind: 'synth'; synth: PickerSynth }
  /** `synths`: the family's modelled members the picker offers, in toggle order. */
  | { kind: 'family'; family: SynthFamily; synths: PickerSynth[] };

/**
 * The picker's entries: each synth in the catalogue's order, but a family's members as one entry where its first
 * member is. A family with none of its members in `synths` is left out. With a `query`, the entries that match it:
 * a synth by its name or maker, so a member is found by its own name and opens as itself, and a family by its name
 * when none of its members match on their own.
 */
export function pickerEntries(
  synths: readonly PickerSynth[],
  families: readonly SynthFamily[],
  query = ''
): PickerEntry[] {
  const q = query.trim().toLowerCase();
  const familyOf = new Map<string, SynthFamily>();
  for (const f of families) for (const m of f.members) if (m.synthId) familyOf.set(m.synthId, f);
  const byId = new Map(synths.map((s) => [s.id, s]));
  const matches = (s: PickerSynth) =>
    s.name.toLowerCase().includes(q) || s.maker.toLowerCase().includes(q);

  const out: PickerEntry[] = [];
  const seen = new Set<string>();
  for (const s of synths) {
    const family = familyOf.get(s.id);
    if (q) {
      if (matches(s)) out.push({ kind: 'synth', synth: s });
      else if (family && !seen.has(family.id) && family.name.toLowerCase().includes(q)) {
        const members = familySynths(family, byId);
        if (!members.some(matches)) out.push({ kind: 'family', family, synths: members });
        seen.add(family.id);
      }
      continue;
    }
    if (!family) out.push({ kind: 'synth', synth: s });
    else if (!seen.has(family.id)) {
      seen.add(family.id);
      out.push({ kind: 'family', family, synths: familySynths(family, byId) });
    }
  }
  return out;
}

function familySynths(family: SynthFamily, byId: Map<string, PickerSynth>): PickerSynth[] {
  return family.members.flatMap((m) => (m.synthId && byId.get(m.synthId)) || []);
}

/**
 * The synth a family opens on: the first member, in toggle order, that the user owns (a databank instrument on their
 * owned list) and the picker offers, else the family's default member (the one most people are likely to own).
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
