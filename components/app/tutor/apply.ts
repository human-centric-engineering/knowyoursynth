/**
 * What the tutor panel does with the tutor's tool results (`f-tutor` t-56): which are changes to the panel, how one
 * turn's combine, and what applying one does. Pure, so the rules are tested without a page.
 *
 * - **A result is untrusted until it is checked again here.** A `capability_result` frame's `result` is `unknown`. A
 *   proposal counts only if it parses, names this synth at this definition version, and passes `checkSettings` and
 *   `checkCables`; a design only if its lesson passes `SoundLessonSchema` and `checkLesson`, the rules a saved sound's
 *   lesson is held to, so a design the panel opens is one Save can keep. A refused call carries no data and is skipped.
 * - **One proposal a turn: the last step's.** Calls the model makes together in one step (one frame) were all worked
 *   out against the panel that was sent, so they combine, a later call winning a control both set. A proposal from a
 *   later step replaces the earlier one: the model made it after seeing the first, and its instructions ask for one
 *   proposal, so a second is a correction.
 * - **A proposal is for the panel it was made against** (its basis, the panel the turn sent). Applied to any other it
 *   would silently undo what the learner did since, so it applies only while the panel is still that one.
 * - **A pattern is made again here** (t-84): a `propose_pattern` result carries the edit, which `applyPatternEdit`
 *   makes into a pattern from the one the turn sent, as the tool did. The last one a turn proposes is the one it offers,
 *   and it is for the pattern it was made from, as a panel change is for its panel.
 */
import { z } from 'zod';
import {
  checkLesson,
  SoundLessonSchema,
  lessonPreset,
  type SoundLesson,
} from '@/lib/app/sounds/lesson';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import {
  cleanLabel,
  controlMap,
  displayName,
  formatValue,
  jackMap,
  type PanelState,
} from '@/lib/app/synths/lib/patch';
import { CablePairSchema, checkCables, checkSettings } from '@/lib/app/synths/validate';
import type { CablePair, ControlValues, Preset, SynthDef } from '@/lib/app/synths/contract';
import { patternLength, type Pattern } from '@/lib/app/sequencer/pattern';
import {
  PatternEditSchema,
  applyPatternEdit,
  patternEditKeys,
  rootName,
  type PatternEdit,
} from '@/lib/app/tutor/pattern-edit';

export const PROPOSE_TOOL = 'propose_panel_change';
export const DESIGN_TOOL = 'design_sound';
export const PATTERN_TOOL = 'propose_pattern';

/** A change to the panel: controls to set, cables to plug in and to take out. */
export interface Proposal {
  set: ControlValues;
  addCables: CablePair[];
  removeCables: CablePair[];
}

/** A sound the tutor designed, ready to open: the `Preset` the Lesson panel reads, and the lesson Save sends. */
export interface TutorDesign {
  id: string;
  name: string;
  preset: Preset;
  lesson: SoundLesson;
}

/** Whether two panels hold the same values and the same cables in the same order. Cable colours are left out. */
export function samePanel(a: PanelState, b: PanelState): boolean {
  if (a === b) return true;
  if (a.cables.length !== b.cables.length) return false;
  if (a.cables.some((c, i) => c.from !== b.cables[i]?.from || c.to !== b.cables[i]?.to))
    return false;
  if (a.values === b.values) return true;
  const keys = Object.keys(a.values);
  if (keys.length !== Object.keys(b.values).length) return false;
  return keys.every((k) => Object.is(a.values[k], b.values[k]));
}

/** The panel as the stream route takes it. */
export const panelInput = (p: PanelState): { values: ControlValues; cables: CablePair[] } => ({
  values: p.values,
  cables: p.cables.map((c): CablePair => [c.from, c.to]),
});

const forThisSynth = z.object({ synthId: z.string(), version: z.number() });

const ProposalResultSchema = z.object({
  success: z.literal(true),
  data: forThisSynth.extend({
    set: z.record(z.string(), z.unknown()),
    addCables: z.array(CablePairSchema),
    removeCables: z.array(CablePairSchema),
  }),
});

const DesignResultSchema = z.object({
  success: z.literal(true),
  data: forThisSynth.extend({
    sound: z.object({
      id: z.string().regex(/^tutor-[0-9a-f]{12}$/),
      name: z.string().trim().min(1).max(60),
      tags: z.array(z.string()).min(1),
      level: z.unknown(),
      blurb: z.unknown(),
      how: z.unknown(),
      steps: z.unknown(),
      context: z.unknown(),
      tweaks: z.unknown(),
      phrase: z.object({ bpm: z.unknown(), steps: z.unknown() }),
    }),
  }),
});

/**
 * A change held to the synth: every control one it has and every value legal for it, every cable it plugs in from a
 * modelled output to a modelled input. Null when anything is wrong.
 */
export function checkProposal(
  def: SynthDef,
  p: { set: Record<string, unknown>; addCables: CablePair[]; removeCables: CablePair[] }
): Proposal | null {
  const { values, problems } = checkSettings(def, p.set, 'set');
  if (problems.length || checkCables(def, p.addCables, 'addCables').length) return null;
  return { set: values, addCables: p.addCables, removeCables: p.removeCables };
}

/** A `propose_panel_change` result as a proposal for this synth, or null when it is not one this panel can take. */
export function readProposal(def: SynthDef, slug: string, result: unknown): Proposal | null {
  if (slug !== PROPOSE_TOOL) return null;
  const parsed = ProposalResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const { synthId, version, ...change } = parsed.data.data;
  if (synthId !== def.id || version !== def.version) return null;
  return checkProposal(def, change);
}

/** A `design_sound` result as a sound to open on this synth, or null when it is not one this panel can take. */
export function readDesign(def: SynthDef, slug: string, result: unknown): TutorDesign | null {
  if (slug !== DESIGN_TOOL) return null;
  const parsed = DesignResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const { synthId, version, sound } = parsed.data.data;
  if (synthId !== def.id || version !== def.version) return null;
  // The lesson as Save sends it (`tutor.md`, The tools): everything but the name, the category as the first tag.
  const lesson = SoundLessonSchema.safeParse({
    blurb: sound.blurb,
    level: sound.level,
    category: sound.tags[0],
    how: sound.how,
    steps: sound.steps,
    context: sound.context,
    tweaks: sound.tweaks,
    phrase: { bpm: sound.phrase.bpm, steps: sound.phrase.steps },
  });
  if (!lesson.success) return null;
  const checked = checkLesson(def, lesson.data);
  if (!checked.ok) return null;
  return {
    id: sound.id,
    name: sound.name,
    preset: lessonPreset(checked.value, { id: sound.id, name: sound.name, fromTutor: true }),
    lesson: checked.value,
  };
}

const sameCable = (a: CablePair, b: CablePair) => a[0] === b[0] && a[1] === b[1];
const without = (list: CablePair[], cable: CablePair) => list.filter((c) => !sameCable(c, cable));

/**
 * The proposals of one step as one, in the order the calls were made: a later call wins a control both set, and a
 * cable it adds or removes overrides what an earlier one did with that cable.
 */
export function combine(proposals: Proposal[]): Proposal {
  let set: ControlValues = {};
  let addCables: CablePair[] = [];
  let removeCables: CablePair[] = [];
  for (const p of proposals) {
    set = { ...set, ...p.set };
    for (const c of p.addCables) {
      removeCables = without(removeCables, c);
      addCables = [...without(addCables, c), c];
    }
    for (const c of p.removeCables) {
      addCables = without(addCables, c);
      removeCables = [...without(removeCables, c), c];
    }
  }
  return { set, addCables, removeCables };
}

/** The panel with the proposal applied: its controls set, its cables taken out, then its new cables plugged in. */
export function applyProposal(panel: PanelState, p: Proposal): PanelState {
  const cables = panel.cables.filter(
    (c) => !p.removeCables.some((r) => sameCable(r, [c.from, c.to]))
  );
  for (const [from, to] of p.addCables) {
    if (!cables.some((c) => c.from === from && c.to === to))
      cables.push({ from, to, color: CABLE_COLORS[cables.length % CABLE_COLORS.length] });
  }
  return { values: { ...panel.values, ...p.set }, cables };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What the chip's button says: "Apply 3 changes + 1 cable". */
export function proposalLabel(p: Proposal): string {
  const controls = Object.keys(p.set).length;
  const cables = p.addCables.length + p.removeCables.length;
  if (!controls) return `Apply ${plural(cables, 'cable change')}`;
  return `Apply ${plural(controls, 'change')}${cables ? ` + ${plural(cables, 'cable')}` : ''}`;
}

/** The proposal one line per change, against the panel it was made for, as the panel reads its controls and jacks. */
export function proposalRows(def: SynthDef, basis: PanelState, p: Proposal): string[] {
  const cm = controlMap(def);
  const jm = jackMap(def);
  const jack = (id: string) => {
    const j = jm[id];
    return j ? cleanLabel(j) : id;
  };
  const rows: string[] = [];
  for (const [id, to] of Object.entries(p.set)) {
    const c = cm[id];
    if (c)
      rows.push(
        `${displayName(def, c)}: ${formatValue(c, basis.values[id])} → ${formatValue(c, to)}`
      );
  }
  for (const [from, to] of p.removeCables) rows.push(`Unplug ${jack(from)} → ${jack(to)}`);
  for (const [from, to] of p.addCables) rows.push(`Plug ${jack(from)} → ${jack(to)}`);
  return rows;
}

/** A pattern the tutor proposed: the edit, and the pattern it makes from the one the turn sent. */
export interface PatternProposal {
  edit: PatternEdit;
  pattern: Pattern;
}

const PatternResultSchema = z.object({
  success: z.literal(true),
  data: z.object({ edit: z.unknown() }),
});

/**
 * A `propose_pattern` result as the pattern it makes from `basis` (the pattern the turn sent), or null when it is not
 * one: not that tool, refused, or an edit that does not make a pattern from this basis.
 */
export function readPatternProposal(
  slug: string,
  result: unknown,
  basis: Pattern | null
): PatternProposal | null {
  if (slug !== PATTERN_TOOL) return null;
  const parsed = PatternResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const edit = PatternEditSchema.safeParse(parsed.data.data.edit);
  if (!edit.success) return null;
  const made = applyPatternEdit(basis, edit.data);
  return made.ok ? { edit: edit.data, pattern: made.pattern } : null;
}

/** What the pattern chip's button says. */
export const patternLabel = (p: PatternProposal): string =>
  p.edit.start === 'blank' ? 'Load into the sequencer' : 'Apply to the pattern';

/** The proposal one line per thing it does, for the chip: the pattern's shape, the settings it sets, the steps it writes. */
export function patternRows(p: PatternProposal): string[] {
  const { edit, pattern } = p;
  const rows: string[] = [];
  if (edit.start === 'blank')
    rows.push(
      `New pattern: ${patternLength(pattern)} steps of ${pattern.stepSize} at ${pattern.bpm} BPM`
    );
  else if (edit.length !== undefined) rows.push(`Length: ${patternLength(pattern)} steps`);
  const keys = patternEditKeys(edit);
  if (edit.start === 'open') {
    if (keys.includes('stepSize')) rows.push(`Step size: ${pattern.stepSize}`);
    if (keys.includes('bpm')) rows.push(`Tempo: ${pattern.bpm} BPM`);
  }
  if (keys.includes('swing')) rows.push(`Swing: ${pattern.swing}`);
  if (keys.includes('direction')) rows.push(`Direction: ${pattern.direction}`);
  if (keys.includes('loop')) rows.push(pattern.loop ? 'Loops' : 'Plays once');
  if (keys.includes('transpose')) rows.push(`Transpose: ${pattern.transpose} semitones`);
  if (keys.includes('root') || keys.includes('scale'))
    rows.push(`Scale: ${rootName(pattern.root)} ${pattern.scale}`);
  if (edit.steps.length) {
    const parts = (['A', 'B'] as const).flatMap((part) => {
      const steps = edit.steps.filter((s) => s.part === part).map((s) => s.step);
      if (!steps.length) return [];
      const ranges = stepRanges(steps);
      return [pattern.parts.length > 1 ? `${part} ${ranges}` : ranges];
    });
    rows.push(`Writes ${edit.steps.length === 1 ? 'step' : 'steps'} ${parts.join('; ')}`);
  }
  return rows;
}

/** Step numbers as runs: `1–8, 10, 13–16`. */
export function stepRanges(steps: readonly number[]): string {
  const sorted = [...new Set(steps)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return runs.join(', ');
}
