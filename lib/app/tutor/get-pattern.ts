import { z } from 'zod';
import { readOpenPattern } from '@/lib/app/tutor/panel';
import { summarisePattern, type PatternSummary } from '@/lib/app/tutor/pattern-edit';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

const schema = z.object({}).strict();

type Args = z.infer<typeof schema>;

/**
 * `get_pattern` (t-84): the pattern open in the sequencer, as the stream route passed it, summarised
 * (`summarisePattern`) rather than sent as JSON. Reads, never writes.
 */
export class GetPatternCapability extends BaseCapability<Args, PatternSummary> {
  readonly slug = 'get_pattern';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_pattern',
    description:
      'Read the pattern open in the sequencer: its settings, and each step that holds notes as one line, "step: MIDI note, g gate in steps, v velocity, n nudge" with "+" between the notes of a chord, then acc (accent), slide, r ratchet, p chance, if a condition, off (muted). A step not listed is a rest. Call it before editing the pattern. Read-only.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  };

  execute(_args: Args, context: CapabilityContext): Promise<CapabilityResult<PatternSummary>> {
    const read = readOpenPattern(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    if (!read.pattern)
      return Promise.resolve(
        this.error(
          'No pattern is open in the sequencer. propose_pattern with start "blank" writes a new one.',
          'no_pattern'
        )
      );
    return Promise.resolve(this.success(summarisePattern(read.pattern)));
  }
}
