/**
 * The family maps' check (t-319), run once by `check:synths`: every id a map names exists on its side, every value
 * that carries one way comes back unchanged the other way, and every library sound translated onto another member
 * validates there. Pure: it reads only its arguments, and returns the problems as lines.
 */
import type { ControlValue, ControlValues, CablePair, SynthDef } from '@/lib/app/synths/contract';
import type { FamilyFile } from '@/lib/app/families/data';
import { patternTest } from '@/lib/app/synths/lib/checklist';
import { controlMap, jackMap, presetState } from '@/lib/app/synths/lib/patch';
import { validateSound } from '@/lib/app/synths/validate';
import { translate, type FamilyLink, type FamilyMap } from '@/lib/app/synths/families/translate';

/** A panel state to send across and back. */
interface Probe {
  name: string;
  values: ControlValues;
  cables: CablePair[];
}

/** Every value a control can be checked at: its ends and default, each option, both ways of a switch. */
function valuesOf(def: SynthDef): Probe[] {
  return def.controls.flatMap((c) => {
    const vs: ControlValue[] =
      c.kind === 'cont'
        ? [...new Set([c.min, c.def, c.max])]
        : c.kind === 'enum'
          ? c.options.map((o) => o.v)
          : [false, true];
    return vs.map((v) => ({ name: `${c.id}=${String(v)}`, values: { [c.id]: v }, cables: [] }));
  });
}

/** The member's init, its Default patch, and each library sound as built. */
function soundsOf(def: SynthDef): Probe[] {
  const asPairs = (s: ReturnType<typeof presetState>): Probe['cables'] =>
    s.cables.map((c): CablePair => [c.from, c.to]);
  const base = presetState(def);
  return [
    { name: 'init', values: { ...def.init }, cables: [] },
    { name: 'the Default patch', values: base.values, cables: asPairs(base) },
    ...(def.presets ?? []).map((p) => {
      const s = presetState(def, p);
      return { name: `sound ${p.id}`, values: s.values, cables: asPairs(s) };
    }),
  ];
}

/** The ids a link names that are not on the side it names them for. */
function namingProblems(link: FamilyLink, from: SynthDef, to: SynthDef): string[] {
  const at = `${link.from} → ${link.to}`;
  const problems: string[] = [];
  const fc = controlMap(from);
  const tc = controlMap(to);
  const fj = jackMap(from);
  const tj = jackMap(to);
  for (const [id, rule] of Object.entries(link.controls ?? {})) {
    const source = fc[id];
    if (!source) {
      problems.push(`${at}: names control ${id}, which the ${from.name} lacks`);
      continue;
    }
    const toId = rule.to ?? id;
    const target = tc[toId];
    if (!target) {
      problems.push(`${at}: carries ${id} to ${toId}, which the ${to.name} lacks`);
      continue;
    }
    for (const [v, mapped] of Object.entries(rule.options ?? {})) {
      const toV = typeof mapped === 'object' ? mapped.to : mapped;
      if (source.kind !== 'enum' || !source.options.some((o) => String(o.v) === v))
        problems.push(`${at}: ${id} has no option ${v} on the ${from.name}`);
      if (target.kind !== 'enum' || !target.options.some((o) => o.v === toV))
        problems.push(`${at}: ${toId} has no option ${String(toV)} on the ${to.name}`);
    }
    if (rule.dropWhen && !fc[rule.dropWhen.when.id])
      problems.push(`${at}: ${id} drops on ${rule.dropWhen.when.id}, which the ${from.name} lacks`);
  }
  for (const [id, toId] of Object.entries(link.jacks ?? {})) {
    if (!fj[id]) problems.push(`${at}: names jack ${id}, which the ${from.name} lacks`);
    else if (!tj[toId])
      problems.push(`${at}: carries ${id} to ${toId}, which the ${to.name} lacks`);
  }
  // A reason must be for something that does drop: an id of `from` that `to` lacks and no rule renames.
  const renamed = new Set([...Object.keys(link.controls ?? {}), ...Object.keys(link.jacks ?? {})]);
  const lacking = [
    ...from.controls.map((c) => c.id).filter((id) => !tc[id]),
    ...from.jacks.map((j) => j.id).filter((id) => !tj[id]),
  ].filter((id) => !renamed.has(id));
  for (const pattern of Object.keys(link.lacks ?? {})) {
    const test = patternTest(pattern);
    if (!lacking.some(test))
      problems.push(
        `${at}: gives a reason for ${pattern}, which names nothing the ${from.name} has and the ${to.name} lacks`
      );
  }
  return problems;
}

/** Across and back: every value that carried unchanged comes back as it was, and so does every cable. */
function roundTripProblems(
  probe: Probe,
  from: SynthDef,
  to: SynthDef,
  maps: readonly FamilyMap[]
): string[] {
  const at = `${from.id} → ${to.id} → ${from.id}, ${probe.name}`;
  const there = translate(probe.values, probe.cables, from, to, maps);
  const back = translate(there.values, there.cables, to, from, maps);
  const changed = new Set(there.changed.map((c) => c.id));
  const dropped = new Set(there.dropped.flatMap((d) => (d.kind === 'control' ? [d.id] : [])));
  // A `ui` control the other member lacks drops without being listed (`Translation.dropped`).
  const unlisted = (id: string): boolean => !!controlMap(from)[id]?.ui && !controlMap(to)[id];
  const problems: string[] = [];
  for (const [id, v] of Object.entries(probe.values)) {
    if (changed.has(id) || dropped.has(id) || unlisted(id)) continue;
    if (back.values[id] !== v)
      problems.push(
        `${at}: ${id} went across as ${String(v)} and came back as ${String(back.values[id])}`
      );
  }
  const keyOf = ([a, b]: CablePair): string => `${a} > ${b}`;
  const lost = new Set(there.dropped.flatMap((d) => (d.kind === 'cable' ? [keyOf(d.cable)] : [])));
  const home = new Set(back.cables.map(keyOf));
  for (const c of probe.cables)
    if (!lost.has(keyOf(c)) && !home.has(keyOf(c)))
      problems.push(`${at}: cable ${keyOf(c)} went across and did not come back`);
  return problems;
}

/**
 * Check the family maps against the definitions they join (`defs`, with their library sounds as `presets`) and the
 * families the seed data holds. Every family with two modelled members needs a link each way between each pair.
 */
export function checkFamilyMaps(
  maps: readonly FamilyMap[],
  defs: readonly SynthDef[],
  families: readonly FamilyFile[]
): string[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const map of maps) {
    const family = families.find((f) => f.id === map.family);
    if (!family) {
      problems.push(`map ${map.family}: no family has that id`);
      continue;
    }
    const members = new Set(family.members.flatMap((m) => (m.synth ? [m.synth] : [])));
    for (const link of map.links) {
      const key = `${link.from} → ${link.to}`;
      if (seen.has(key)) problems.push(`${key}: linked twice`);
      seen.add(key);
      if (!members.has(link.from) || !members.has(link.to) || link.from === link.to) {
        problems.push(`${key}: not two members of ${map.family}`);
        continue;
      }
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) {
        problems.push(`${key}: no definition for ${!from ? link.from : link.to}`);
        continue;
      }
      problems.push(...namingProblems(link, from, to));
    }
  }
  if (problems.length) return problems;

  for (const family of families) {
    const synths = family.members.flatMap((m) => (m.synth ? [m.synth] : []));
    for (const a of synths)
      for (const b of synths) {
        if (a === b) continue;
        if (!seen.has(`${a} → ${b}`)) {
          problems.push(`family ${family.id}: no map from ${a} to ${b}`);
          continue;
        }
        const from = byId.get(a);
        const to = byId.get(b);
        if (!from || !to) continue;
        for (const probe of [...valuesOf(from), ...soundsOf(from)])
          problems.push(...roundTripProblems(probe, from, to, maps));
        // A library sound translated onto another member must be a sound that member can hold.
        for (const probe of soundsOf(from)) {
          const t = translate(probe.values, probe.cables, from, to, maps);
          const r = validateSound(to, { values: t.values, cables: t.cables });
          for (const p of r.problems)
            problems.push(`${a} → ${b}, ${probe.name}: ${p.path} ${p.message}`);
        }
      }
  }
  return problems;
}
