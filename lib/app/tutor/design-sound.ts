import { z } from 'zod';
import { readPanel, refusal } from '@/lib/app/tutor/panel';
import { validatePreset } from '@/lib/app/synths/validate';
import { PRESET_CATEGORIES, SYNTH_MODULES, type Preset } from '@/lib/app/synths/contract';
import { MAX_CONTEXT, MAX_STEP_SET, SoundLessonSchema } from '@/lib/app/sounds/lesson';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/**
 * The sound's name and its lesson. The lesson's limits are the ones a saved sound's lesson is held to
 * (`lib/app/sounds/lesson.ts`), so a design the tool passes is one `POST /api/v1/sounds` takes.
 */
const schema = SoundLessonSchema.extend({ name: z.string().trim().min(1).max(60) }).strict();

type Args = z.infer<typeof schema>;

export interface DesignData {
  synthId: string;
  /** The definition version the sound was checked against, which a saved copy records. */
  version: number;
  /** The whole sound with its lesson, in the shape `sanitizePreset` produced for the prototype. */
  sound: Preset;
}

const STEP_LINE =
  'one plain sentence on what the step does to the sound, then a line starting "- " for each control it sets, saying what it does and what to listen for ("- CUTOFF 3: …")';

/**
 * `design_sound`: a whole new sound with its lesson (build steps, what each control does in it, things to try and a
 * riff), checked by `validatePreset` against the synth: every step's control ids and values, its cables, and the ids
 * its context and tweaks name. Any problem refuses the whole sound, naming it. The server adds what the model does not
 * write (the id, the credit, the `ai` mark), as `sanitizePreset` did. Changes nothing: the page offers the sound.
 */
export class DesignSoundCapability extends BaseCapability<Args, DesignData> {
  readonly slug = 'design_sound';
  protected readonly schema = schema;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'design_sound',
    description:
      "Design a whole new patch on this synth from the learner's description, with its lesson. The steps are applied in order on top of the synth's init patch. Use only control ids, jack ids and legal values that describe_synth showed you. The patch is checked against the synth; if anything is wrong the whole patch is refused with the reason, so fix what it names and call again.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', maxLength: 60, description: "The patch's name." },
        blurb: { type: 'string', maxLength: 200, description: 'One sentence.' },
        level: {
          type: 'integer',
          enum: [1, 2, 3],
          description: 'How hard it is to build: 1, 2 or 3.',
        },
        category: { type: 'string', enum: [...PRESET_CATEGORIES] },
        how: {
          type: 'string',
          maxLength: 900,
          description: 'Two to four sentences on the idea behind the patch.',
        },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 9,
          description:
            'Three to six steps in the order a person would build the patch: oscillators, mixer, filter, envelopes, modulation, cables, effects. Each sets at least one control or plugs in a cable.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 90 },
              module: { type: 'string', enum: [...SYNTH_MODULES] },
              why: { type: 'string', maxLength: 1500, description: STEP_LINE },
              set: {
                type: 'object',
                maxProperties: MAX_STEP_SET,
                description: 'Control id → value.',
                additionalProperties: { type: ['number', 'string', 'boolean'] },
              },
              cables: {
                type: 'array',
                description: 'Cables to plug in, each [output jack id, input jack id].',
                maxItems: 16,
                items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
              },
            },
            required: ['title', 'module', 'why'],
          },
        },
        context: {
          type: 'object',
          maxProperties: MAX_CONTEXT,
          description:
            'Control id → what that control is doing in this patch, and what happens if the learner moves it (up to 400 characters).',
          additionalProperties: { type: 'string', maxLength: 400 },
        },
        tweaks: {
          type: 'array',
          maxItems: 5,
          description: 'Things to try: a control, an action, and what the learner will hear.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Control id.' },
              try: { type: 'string', maxLength: 200 },
              hear: { type: 'string', maxLength: 300 },
            },
            required: ['id', 'try', 'hear'],
          },
        },
        phrase: {
          type: 'object',
          additionalProperties: false,
          description:
            'A short original riff of 4 to 8 beats that suits the patch, not a copy of any song. Each note is [beat 0–16, MIDI note 24–96, length in beats 0.05–16].',
          properties: {
            bpm: { type: 'number', minimum: 40, maximum: 180 },
            steps: {
              type: 'array',
              minItems: 1,
              maxItems: 32,
              items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
            },
          },
          required: ['bpm', 'steps'],
        },
      },
      required: ['name', 'blurb', 'level', 'category', 'how', 'steps', 'phrase'],
    },
  };

  execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<DesignData>> {
    const read = readPanel(context);
    if (!read.ok) return Promise.resolve(this.error(read.message, read.code));
    const { def } = read.panel;
    const checked = validatePreset(def, {
      // Random, not time-based: two designs in one model step must not share an id.
      id: `tutor-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: args.name,
      ref: 'Designed by the tutor from your description',
      artist: 'AI tutor',
      tags: [args.category, 'ai'],
      level: args.level,
      blurb: args.blurb,
      how: args.how,
      phrase: { bpm: args.phrase.bpm, loop: true, steps: args.phrase.steps },
      steps: args.steps,
      context: args.context,
      tweaks: args.tweaks,
      ai: true,
    });
    if (!checked.ok)
      return Promise.resolve(
        this.error(
          refusal('Patch refused, nothing was designed:', checked.problems),
          'invalid_design'
        )
      );
    return Promise.resolve(
      this.success({ synthId: def.id, version: def.version, sound: checked.value })
    );
  }
}
