/**
 * The panel a tutor turn is about: what the stream route passes as `entityContext`, read back and checked by every
 * tutor tool.
 *
 * The route validates the panel the page sends before the model is called, and passes it on as
 * `{ synthId, version, panel }` ({@link TutorEntityContext}). The tools read it again rather than trust it:
 * `entityContext` is a free-form record as far as the dispatcher knows, so each read parses it, finds the definition,
 * refuses another definition version, and validates the panel with `validateSound`, the check a stored sound gets.
 *
 * The tools only propose. Nothing here or in them writes, so two proposals in one model step are both worked out
 * against the panel that was sent, and the page decides how to apply them. There is no user in any of it: a panel is
 * the same whoever sent it, so no tool reads `CapabilityContext.userId` or takes a user from its arguments.
 */
import { z } from 'zod';
import { PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { PanelInputSchema, SynthIdSchema } from '@/lib/app/sounds/data';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validateSound } from '@/lib/app/synths/validate';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';

/**
 * What the stream route passes as `entityContext`: the synth, the definition version, the panel, and the pattern open
 * in the sequencer (t-84), which a page that has none leaves out.
 */
export const TutorEntityContextSchema = z.object({
  synthId: SynthIdSchema,
  version: z.number().int().positive(),
  panel: PanelInputSchema,
  pattern: PatternSchema.optional(),
});
export type TutorEntityContext = z.input<typeof TutorEntityContextSchema>;

/** A panel that has passed: its synth, every control's value, and the cables in. */
export interface TutorPanel {
  def: AppSynthDef;
  /** Every control's value: the synth's init with the panel's values over it. */
  values: ControlValues;
  cables: CablePair[];
}

/** One thing wrong with what the model sent, where it is, in words the model can act on. */
export interface Problem {
  path: string;
  message: string;
}

export type PanelRead =
  | { ok: true; panel: TutorPanel }
  | {
      ok: false;
      code: 'no_panel' | 'unknown_synth' | 'stale_panel' | 'invalid_panel';
      message: string;
    };

/** How many problems a refusal lists before it says how many more there are. */
const MAX_LISTED = 12;

/** A refusal's text: what was refused, then each problem with its path, the bad id or value named in the message. */
export function refusal(lead: string, problems: readonly Problem[]): string {
  const listed = problems
    .slice(0, MAX_LISTED)
    .map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  const more = problems.length - listed.length;
  return `${lead} ${listed.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`;
}

/** The panel this turn is about, checked; or why there is none a tool can use. */
export function readPanel(context: CapabilityContext): PanelRead {
  if (context.entityContext === undefined)
    return {
      ok: false,
      code: 'no_panel',
      message: 'No synth panel came with this conversation, so there is nothing to read or change.',
    };
  const parsed = TutorEntityContextSchema.safeParse(context.entityContext);
  if (!parsed.success)
    return {
      ok: false,
      code: 'invalid_panel',
      message: refusal(
        'The panel that came with this conversation is not one a synth can hold:',
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        }))
      ),
    };
  const { synthId, version, panel } = parsed.data;
  const def = getSynthDef(synthId);
  if (!def) return { ok: false, code: 'unknown_synth', message: `There is no synth ${synthId}.` };
  if (version !== def.version)
    return {
      ok: false,
      code: 'stale_panel',
      message: `The panel was made on version ${version} of ${synthId}, which is now at version ${def.version}. Ask the learner to reload the page.`,
    };
  const checked = validateSound(def, panel);
  if (!checked.ok)
    return {
      ok: false,
      code: 'invalid_panel',
      message: refusal('The panel is not one this synth can hold:', checked.problems),
    };
  return {
    ok: true,
    panel: { def, values: { ...def.init, ...checked.value.values }, cables: checked.value.cables },
  };
}

export type PatternRead =
  { ok: true; pattern: Pattern | null } | { ok: false; code: 'invalid_pattern'; message: string };

/**
 * The pattern open in the sequencer this turn, checked as `readPanel` checks the panel; `null` when none came with it.
 * No synth is read: a pattern is not tied to one, so a turn with no panel at all (an eval run) can still write a new
 * pattern.
 */
export function readOpenPattern(context: CapabilityContext): PatternRead {
  if (context.entityContext === undefined) return { ok: true, pattern: null };
  const parsed = z.object({ pattern: PatternSchema.optional() }).safeParse(context.entityContext);
  if (!parsed.success)
    return {
      ok: false,
      code: 'invalid_pattern',
      message: refusal(
        'The pattern that came with this conversation is not one the sequencer can hold:',
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        }))
      ),
    };
  return { ok: true, pattern: parsed.data.pattern ?? null };
}

/** The values that differ from the synth's init, in the definition's control order. */
export function changedFromInit(def: AppSynthDef, values: ControlValues): ControlValues {
  const changed: ControlValues = {};
  for (const c of def.controls) {
    const v = values[c.id];
    if (v !== undefined && v !== def.init[c.id]) changed[c.id] = v;
  }
  return changed;
}

/** Whether the panel has this cable in, written `[output, input]`. */
export const hasCable = (cables: readonly CablePair[], [from, to]: CablePair): boolean =>
  cables.some(([a, b]) => a === from && b === to);
