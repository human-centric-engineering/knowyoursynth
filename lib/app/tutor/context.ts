/**
 * The tutor's prompt context: which synth the learner has open. Registered from `lib/app/context-contributors.ts` for
 * `contextType: 'synth'`, keyed by synth id, and framed by `buildContext` as the turn's `LOCKED CONTEXT`.
 *
 * The synth's name, what it is, and its section index, and no more: the controls are `describe_synth`'s, looked up as
 * the model needs them, because the tool loop sends the system prompt again on every iteration (the numbers are in
 * `.context/app/tutor.md`). `buildContext` caches it for a minute per learner and drops it after a tool call; it is
 * cheap to rebuild (the definition is in memory).
 */
import { describesWhole, sectionIndex } from '@/lib/app/tutor/sections';
import { getSynthDef } from '@/lib/app/synths/defs';

/** The `contextType` the stream route sends with the synth id as `contextId`. */
export const TUTOR_CONTEXT_TYPE = 'synth';

export function synthContext(synthId: string): Promise<string> {
  const def = getSynthDef(synthId);
  if (!def) return Promise.resolve(`There is no synth with id '${synthId}'.`);
  return Promise.resolve(
    [
      `Synth: the ${def.maker} ${def.name} (id ${def.id}, definition version ${def.version}). ${def.heritage}.`,
      def.summary,
      `It has ${def.controls.length} controls. ${
        describesWhole(def)
          ? 'describe_synth with no arguments returns all of them.'
          : 'That is too many to look up at once: name a section when you call describe_synth.'
      }`,
      sectionIndex(def),
    ].join('\n')
  );
}
