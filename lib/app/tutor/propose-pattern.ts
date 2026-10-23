import { readOpenPattern, refusal } from '@/lib/app/tutor/panel';
import {
  BLANK_LENGTH,
  MAX_WRITTEN,
  PatternEditSchema,
  applyPatternEdit,
  hasNotes,
  patternEditKeys,
  samePattern,
  type PatternEdit,
} from '@/lib/app/tutor/pattern-edit';
import {
  DIRECTIONS,
  MAX_BPM,
  MAX_CHORD,
  MAX_GATE,
  MAX_RATCHET,
  MAX_STEPS,
  MAX_TRANSPOSE,
  MIN_BPM,
  SCALE_NAMES,
  STEP_SIZE_NAMES,
  patternLength,
} from '@/lib/app/sequencer/pattern';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

export interface PatternProposalData {
  /** The edit as checked, every default filled in: what the tutor panel makes the pattern from again. */
  edit: PatternEdit;
  /** How many steps the proposed pattern has, and how many the edit wrote. */
  length: number;
  written: number;
}

/**
 * `propose_pattern` (t-84): a pattern for the sequencer, or an edit to the open one, that the learner may apply.
 *
 * Made with `applyPatternEdit`, the code the tutor panel applies it with, against the pattern the turn sent, and held
 * to `PatternSchema`. Any problem refuses the whole proposal, naming the step or setting, so the model can correct it
 * and try again. Changes nothing itself: the page loads what the learner accepts.
 */
export class ProposePatternCapability extends BaseCapability<PatternEdit, PatternProposalData> {
  readonly slug = 'propose_pattern';
  protected readonly schema = PatternEditSchema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'propose_pattern',
    description:
      'Propose a pattern for the sequencer for the learner to apply: start from the open pattern (read it with get_pattern first) or from a blank one, change any setting, and write the steps you list. A listed step is replaced whole; a step you do not list is kept (or, on a blank pattern, a rest). Everything is checked; if anything is wrong the whole proposal is refused with the reason, so fix what it names and call again. Nothing changes until the learner applies it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: {
          type: 'string',
          enum: ['open', 'blank'],
          description: `"open" edits the pattern open in the sequencer; "blank" starts from ${BLANK_LENGTH} steps of rests.`,
        },
        length: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_STEPS,
          description: 'How many steps the pattern has. Steps added at the end are rests.',
        },
        stepSize: {
          type: 'string',
          enum: [...STEP_SIZE_NAMES],
          description: 'How long one step is. "1/16" is four steps to a beat.',
        },
        bpm: { type: 'number', minimum: MIN_BPM, maximum: MAX_BPM },
        loop: { type: 'boolean', description: 'Whether it plays again from the top.' },
        direction: { type: 'string', enum: [...DIRECTIONS] },
        swing: {
          type: 'number',
          minimum: 50,
          maximum: 75,
          description: '50 is straight; 75 delays every second step by half a step.',
        },
        transpose: { type: 'integer', minimum: -MAX_TRANSPOSE, maximum: MAX_TRANSPOSE },
        root: { type: 'integer', minimum: 0, maximum: 11, description: 'C = 0.' },
        scale: {
          type: 'string',
          enum: [...SCALE_NAMES],
          description: 'Every note is moved to the nearest note of this scale from the root.',
        },
        steps: {
          type: 'array',
          maxItems: MAX_WRITTEN,
          description: 'The steps to write.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              step: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_STEPS,
                description: 'Which step, counted from 1.',
              },
              part: {
                type: 'string',
                enum: ['A', 'B'],
                description: 'A unless the pattern has a part B.',
              },
              on: { type: 'boolean', description: 'false mutes the step and keeps its notes.' },
              notes: {
                type: 'array',
                maxItems: MAX_CHORD,
                description: 'Empty for a rest, several for a chord.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    note: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 127,
                      description: 'MIDI note: 60 is middle C.',
                    },
                    gate: {
                      type: 'number',
                      exclusiveMinimum: 0,
                      maximum: MAX_GATE,
                      description: 'How long it is held, in steps; past 1 it ties over.',
                    },
                    velocity: { type: 'number', minimum: 0, maximum: 1 },
                    nudge: {
                      type: 'number',
                      minimum: 0,
                      exclusiveMaximum: 1,
                      description: 'How late it starts, as a share of a step.',
                    },
                  },
                  required: ['note', 'gate'],
                },
              },
              accent: { type: 'boolean' },
              slide: { type: 'boolean', description: 'Glides into the next step.' },
              ratchet: { type: 'integer', minimum: 1, maximum: MAX_RATCHET },
              probability: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'The chance it plays on any pass.',
              },
            },
            required: ['step', 'notes'],
          },
        },
      },
      required: ['start'],
    },
  };

  execute(
    edit: PatternEdit,
    context: CapabilityContext
  ): Promise<CapabilityResult<PatternProposalData>> {
    return Promise.resolve(this.propose(edit, context));
  }

  private propose(
    edit: PatternEdit,
    context: CapabilityContext
  ): CapabilityResult<PatternProposalData> {
    const read = readOpenPattern(context);
    if (!read.ok) return this.error(read.message, read.code);
    // Every field but `start` may be left out, so an edit can arrive with nothing in it. It is also what a call cut off
    // at the token cap arrives as, so it gets its own reason rather than "changes nothing".
    if (edit.start === 'open' && patternEditKeys(edit).length === 0)
      return this.error(
        'Pattern refused: it was empty. Name a step to write or a setting to change; if you did, the call may have been cut off, so send fewer steps.',
        'empty_proposal'
      );
    const made = applyPatternEdit(read.pattern, edit);
    if (!made.ok)
      return this.error(
        refusal('Pattern refused, nothing was proposed:', made.problems),
        made.code === 'no_pattern' ? 'no_pattern' : 'invalid_proposal'
      );
    if (read.pattern && edit.start === 'open' && samePattern(made.pattern, read.pattern))
      return this.error(
        'Pattern refused: it changes nothing. Every step and setting it writes is already that way in the open pattern.',
        'no_change'
      );
    if (!hasNotes(made.pattern))
      return this.error(
        'Pattern refused: it plays nothing. Give at least one step that is on a note to play.',
        'empty_pattern'
      );
    return this.success({
      edit,
      length: patternLength(made.pattern),
      written: edit.steps.length,
    });
  }
}
