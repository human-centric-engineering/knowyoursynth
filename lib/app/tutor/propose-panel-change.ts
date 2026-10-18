import { z } from 'zod';
import { hasCable, readPanel, refusal, type Problem, type TutorPanel } from '@/lib/app/tutor/panel';
import { controlMap, displayName, formatValue } from '@/lib/app/synths/lib/patch';
import { CablePairSchema, checkCables, checkSettings } from '@/lib/app/synths/validate';
import type { CablePair, ControlValue, ControlValues } from '@/lib/app/synths/contract';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/** The most one proposal changes. A whole new sound is `design_sound`'s, so a change set this big is a mistake. */
const MAX_SET = 64;
const MAX_CABLES = 16;

const schema = z
  .object({
    // Values are `unknown` here so that a bad one reaches `checkSettings`, which names the control and its legal range.
    set: z
      .record(z.string().min(1).max(160), z.unknown())
      .refine(
        (set) => Object.keys(set).length <= MAX_SET,
        `At most ${MAX_SET} controls in one change`
      )
      .default({}),
    addCables: z.array(CablePairSchema).max(MAX_CABLES).default([]),
    removeCables: z.array(CablePairSchema).max(MAX_CABLES).default([]),
  })
  .strict();

type Args = z.infer<typeof schema>;

export interface ProposedControl {
  id: string;
  /** The control's panel label, made unambiguous. */
  label: string;
  from: ControlValue;
  to: ControlValue;
  /** Both values as the panel reads them. */
  fromShown: string;
  toShown: string;
}

export interface ProposalData {
  synthId: string;
  /** The definition version the proposal was checked against. */
  version: number;
  /** The controls to set: only those whose value changes. */
  set: ControlValues;
  addCables: CablePair[];
  removeCables: CablePair[];
  /** The same change, one row per control, for the model's explanation and the page's chips. */
  changes: ProposedControl[];
}

const cableName = ([from, to]: CablePair) => `${from} > ${to}`;

/**
 * `propose_panel_change`: a change set the learner may apply, checked against the synth and the panel that was sent.
 *
 * Held to `validate.ts`: every control id must be the synth's and every value legal for it (`checkSettings`), every
 * added cable must run from a modelled output to a modelled input (`checkCables`). Then against the panel: a cable to
 * remove must be in, a cable to add must not be (nor be listed twice, nor also be removed), and something must change. Any problem refuses the whole proposal,
 * naming the id or value, so nothing half-right reaches the page and the model can correct it and try again. Changes
 * nothing itself: the page applies what the learner accepts.
 */
export class ProposePanelChangeCapability extends BaseCapability<Args, ProposalData> {
  readonly slug = 'propose_panel_change';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'propose_panel_change',
    description:
      'Propose a change to the panel for the learner to apply: controls to set, and cables to add or remove. Use only control ids, jack ids and legal values that describe_synth showed you. Every id and value is checked against the synth and the current panel; if anything is wrong the whole proposal is refused with the reason, so fix what it names and call again. Nothing changes until the learner applies it.',
    parameters: {
      type: 'object',
      properties: {
        set: {
          type: 'object',
          description:
            'Control id → new value. A number within the control\'s range, one of its options, or true/false for a switch. Example: {"filter.cutoff": 3.5, "osc1.wave": "saw"}.',
          additionalProperties: { type: ['number', 'string', 'boolean'] },
        },
        addCables: {
          type: 'array',
          description: 'Cables to plug in, each [output jack id, input jack id].',
          items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        },
        removeCables: {
          type: 'array',
          description:
            'Cables to take out, each [output jack id, input jack id], as get_panel lists them.',
          items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        },
      },
    },
  };

  execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<ProposalData>> {
    const read = readPanel(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    return Promise.resolve(this.propose(read.panel, args));
  }

  private propose(panel: TutorPanel, args: Args): CapabilityResult<ProposalData> {
    const { def, values, cables } = panel;
    const { values: checked, problems: setProblems } = checkSettings(def, args.set, 'set');
    // A cable to remove needs only to be in: the panel's cables passed `checkCables` when it was read.
    const problems: Problem[] = [...setProblems, ...checkCables(def, args.addCables, 'addCables')];
    args.addCables.forEach((cable, i) => {
      if (hasCable(cables, cable))
        problems.push({
          path: `addCables.${i}`,
          message: `Cable ${cableName(cable)} is already in`,
        });
      else if (hasCable(args.addCables.slice(0, i), cable))
        problems.push({
          path: `addCables.${i}`,
          message: `Cable ${cableName(cable)} is listed twice`,
        });
      if (hasCable(args.removeCables, cable))
        problems.push({
          path: `addCables.${i}`,
          message: `Cable ${cableName(cable)} is both added and removed`,
        });
    });
    args.removeCables.forEach((cable, i) => {
      if (hasCable(args.removeCables.slice(0, i), cable))
        problems.push({
          path: `removeCables.${i}`,
          message: `Cable ${cableName(cable)} is listed twice`,
        });
      else if (!hasCable(cables, cable))
        problems.push({
          path: `removeCables.${i}`,
          message: `Cable ${cableName(cable)} is not in`,
        });
    });
    if (problems.length)
      return this.error(
        refusal('Proposal refused, nothing was proposed:', problems),
        'invalid_proposal'
      );

    const cm = controlMap(def);
    const set: ControlValues = {};
    const changes: ProposedControl[] = [];
    for (const [id, to] of Object.entries(checked)) {
      const c = cm[id];
      const from = values[id];
      if (!c || from === to) continue;
      set[id] = to;
      changes.push({
        id,
        label: displayName(def, c),
        from,
        to,
        fromShown: formatValue(c, from),
        toShown: formatValue(c, to),
      });
    }
    if (!changes.length && !args.addCables.length && !args.removeCables.length)
      return this.error(
        'Proposal refused: it changes nothing. Every control it sets is already at that value on the panel.',
        'no_change'
      );

    return this.success({
      synthId: def.id,
      version: def.version,
      set,
      addCables: args.addCables,
      removeCables: args.removeCables,
      changes,
    });
  }
}
