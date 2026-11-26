/**
 * Carrying a panel between the members of a synth family (`f-synth-families` t-319): the knobs set on the TD-3 come
 * with you to the TB-303, and what the TB-303 lacks is named rather than silently lost.
 *
 * Translation lives here and not in a `SynthDef`, which holds the instrument only (`registry.test.ts`). A family's
 * map (`FamilyMap`) is a set of one-way links between its members. A link is identity plus what it says: a control
 * or jack renamed, an option renamed, a control dropped while the panel is set a certain way, and why a control or
 * jack the other member lacks does not carry. Everything a link does not name carries under the same id, if the
 * member it goes to has that id and the value is legal there. No definition's ids change to make two members match.
 *
 * `translate()` is pure: it reads only its arguments and the maps, and returns new objects.
 * See `.context/app/synth-families.md`.
 */
import type {
  CablePair,
  Control,
  ControlValue,
  ControlValues,
  OptionValue,
  ShowCondition,
  SynthDef,
} from '@/lib/app/synths/contract';
import { patternTest } from '@/lib/app/synths/lib/checklist';
import { controlMap, displayName, jackMap } from '@/lib/app/synths/lib/patch';
import { checkCables, checkSettings } from '@/lib/app/synths/validate';
import { FAMILY_MAPS } from '@/lib/app/synths/families/maps';

// ─── Maps ────────────────────────────────────────────────────────────────────

/** An option carried as another, losing part of what it was (the Model 15's `saw+sub` on a Grandmother is `saw`). */
export interface LossyOption {
  to: OptionValue;
  /** What does not come across, to someone switching. */
  lost: string;
}

/** What a link does with one control of the member it comes from. */
export interface ControlRule {
  /** The control's id on the member it goes to. Absent, the same id. */
  to?: string;
  /** Options renamed on the way, from → to. An option not named here carries as itself. */
  options?: Record<string, OptionValue | LossyOption>;
  /** Drop the control, rather than carry it, while the panel it comes from is set so (the Model 15's MIX 3 on SUB). */
  dropWhen?: { when: ShowCondition; reason: string };
}

/** One way between two members: from `from`'s panel onto `to`'s. */
export interface FamilyLink {
  /** Synth ids. */
  from: string;
  to: string;
  /** Rules by the control's id on `from`. */
  controls?: Record<string, ControlRule>;
  /** Jack renames, by the jack's id on `from`. */
  jacks?: Record<string, string>;
  /**
   * Why a control or jack of `from` that `to` lacks does not carry, by id or by a `*` pattern (`dist.*`). Every
   * pattern names something `from` has and `to` does not. Anything without one gets `lacksFallback`, then
   * "The TB-303 has no DISTORTION".
   */
  lacks?: Record<string, string>;
  /** A reason worked out from the id, for a family too large to list (the System 55's modules a System 15 lacks). */
  lacksFallback?: (id: string, from: SynthDef, to: SynthDef) => string | undefined;
}

/** A family's map: its id, as the family's seed file names it, and its links. */
export interface FamilyMap {
  family: string;
  links: FamilyLink[];
}

// ─── Results ─────────────────────────────────────────────────────────────────

/** Something on the panel that did not come across, and why. */
export type Dropped =
  | { kind: 'control'; id: string; value: ControlValue; reason: string }
  | { kind: 'cable'; cable: CablePair; reason: string };

/** A value that came across, but not as it was: clamped to a shorter range, or an option that lost part of itself. */
export interface Changed {
  /** The control's id on the member it came from, and its value there. */
  id: string;
  value: ControlValue;
  /** Its id and value on the member it went to. */
  to: { id: string; value: ControlValue };
  reason: string;
}

export interface Translation {
  /** The values that carried, by the id on the member they went to. Only those given: the caller sets the rest. */
  values: ControlValues;
  cables: CablePair[];
  /** In the order given: controls, then cables. A `ui` control (a panel mode, never the sound) is never listed. */
  dropped: Dropped[];
  changed: Changed[];
}

// ─── Translation ─────────────────────────────────────────────────────────────

/** The link from one member to another in `maps`, or `null` when no map joins them. */
export function findLink(
  from: string,
  to: string,
  maps: readonly FamilyMap[] = FAMILY_MAPS
): FamilyLink | null {
  for (const m of maps) {
    const link = m.links.find((l) => l.from === from && l.to === to);
    if (link) return link;
  }
  return null;
}

const holds = (cond: ShowCondition, values: ControlValues): boolean =>
  'eq' in cond ? values[cond.id] === cond.eq : cond.in.includes(values[cond.id]);

const cleanName = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

/** Why `id` (a control or jack of `from`) does not carry: the link's reason, its fallback, or "has no NAME". */
function lacksReason(link: FamilyLink, from: SynthDef, to: SynthDef, id: string): string {
  for (const [pattern, reason] of Object.entries(link.lacks ?? {}))
    if (patternTest(pattern)(id)) return reason;
  const worked = link.lacksFallback?.(id, from, to);
  if (worked) return worked;
  const c = controlMap(from)[id];
  if (c) return `The ${to.name} has no ${displayName(from, c)}`;
  const j = jackMap(from)[id];
  return `The ${to.name} has no ${j ? cleanName(j.name ?? j.label) : id} jack`;
}

function optionLabel(c: Control, v: ControlValue): string {
  if (c.kind !== 'enum') return String(v);
  const o = c.options.find((x) => x.v === v);
  return o?.label ? cleanName(o.label) : String(v);
}

/**
 * Carry a panel's values and cables from one member of a family to another. `values` may be the whole panel or only
 * some of it (a sound's settings); only what is given is translated. With no map joining the two members, everything
 * carries under its own id where `to` has it and the value is legal there, and the rest is dropped.
 */
export function translate(
  values: ControlValues,
  cables: readonly CablePair[],
  from: SynthDef,
  to: SynthDef,
  maps: readonly FamilyMap[] = FAMILY_MAPS
): Translation {
  const out: Translation = { values: {}, cables: [], dropped: [], changed: [] };
  if (from.id === to.id) {
    out.values = { ...values };
    out.cables = cables.map(([a, b]): CablePair => [a, b]);
    return out;
  }
  const link: FamilyLink = findLink(from.id, to.id, maps) ?? { from: from.id, to: to.id };
  const fromControls = controlMap(from);
  const toControls = controlMap(to);
  // A `dropWhen` reads the panel as it stands: what was given, over the member's own init.
  const panel: ControlValues = { ...from.init, ...values };

  for (const [id, value] of Object.entries(values)) {
    const source = fromControls[id];
    const rule = link.controls?.[id];
    const toId = rule?.to ?? id;
    const target = toControls[toId];
    const drop = (reason: string): void => {
      if (!source?.ui) out.dropped.push({ kind: 'control', id, value, reason });
    };
    if (!target) {
      drop(lacksReason(link, from, to, id));
      continue;
    }
    if (rule?.dropWhen && holds(rule.dropWhen.when, panel)) {
      drop(rule.dropWhen.reason);
      continue;
    }
    let carried: ControlValue = value;
    let lost: string | null = null;
    const mapped = rule?.options?.[String(value)];
    if (mapped !== undefined) {
      if (typeof mapped === 'object') {
        carried = mapped.to;
        lost = mapped.lost;
      } else carried = mapped;
    }
    if (target.kind === 'cont' && typeof carried === 'number' && Number.isFinite(carried)) {
      const clamped = Math.min(target.max, Math.max(target.min, carried));
      if (clamped !== carried) {
        lost = `The ${to.name}'s ${displayName(to, target)} goes from ${target.min} to ${target.max}; ${carried} became ${clamped}`;
        carried = clamped;
      }
    }
    const check = checkSettings(to, { [toId]: carried });
    if (check.problems.length) {
      drop(
        target.kind === 'enum'
          ? `The ${to.name}'s ${displayName(to, target)} has no ${optionLabel(source ?? target, value)} setting`
          : `The ${to.name}'s ${displayName(to, target)} cannot be set to ${String(value)}`
      );
      continue;
    }
    out.values[toId] = check.values[toId];
    if (lost) out.changed.push({ id, value, to: { id: toId, value: carried }, reason: lost });
  }

  const toJacks = jackMap(to);
  for (const [a, b] of cables) {
    const ends = [a, b].map((j) => link.jacks?.[j] ?? j);
    const missing = [a, b].find((_, i) => !toJacks[ends[i]]);
    if (missing) {
      out.dropped.push({
        kind: 'cable',
        cable: [a, b],
        reason: lacksReason(link, from, to, missing),
      });
      continue;
    }
    const cable: CablePair = [ends[0], ends[1]];
    const problems = checkCables(to, [cable]);
    if (problems.length) {
      out.dropped.push({ kind: 'cable', cable: [a, b], reason: problems[0].message });
      continue;
    }
    if (!out.cables.some(([x, y]) => x === cable[0] && y === cable[1])) out.cables.push(cable);
  }
  return out;
}
