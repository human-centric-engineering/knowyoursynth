import { z } from 'zod';
import { readPanel, refusal } from '@/lib/app/tutor/panel';
import { CablePairSchema, validatePreset } from '@/lib/app/synths/validate';
import { PRESET_CATEGORIES, SYNTH_MODULES, type Preset } from '@/lib/app/synths/contract';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

/**
 * The sound's limits: the ones `sanitizePreset` (`lib/app/synths/lib/patch.ts`) clamps the prototype's designs to.
 * There they repair; here going past one refuses, naming the field, as `validatePreset` refuses a bad id or value.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const PhraseNoteSchema = z.tuple([
  z.number().min(0).max(16),
  z.number().int().min(24).max(96),
  z.number().min(0.05).max(16),
]);

const schema = z
  .object({
    name: text(60),
    blurb: text(200),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    category: z.enum(PRESET_CATEGORIES),
    how: text(900),
    steps: z
      .array(
        z
          .object({
            title: text(90),
            module: z.enum(SYNTH_MODULES),
            why: text(1500),
            set: z.record(z.string().min(1).max(160), z.unknown()).optional(),
            cables: z.array(CablePairSchema).max(16).optional(),
          })
          .strict()
          .refine((s) => Object.keys(s.set ?? {}).length > 0 || (s.cables ?? []).length > 0, {
            message: 'A step must set a control or plug in a cable',
          })
      )
      .min(1)
      .max(9),
    context: z.record(z.string().min(1).max(160), text(400)).optional(),
    tweaks: z
      .array(z.object({ id: z.string().min(1).max(160), try: text(200), hear: text(300) }).strict())
      .max(5)
      .optional(),
    phrase: z
      .object({ bpm: z.number().min(40).max(180), steps: z.array(PhraseNoteSchema).min(1).max(32) })
      .strict(),
  })
  .strict();

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
      "Design a whole new sound on this synth from the learner's description, with its lesson. The steps are applied in order on top of the synth's init patch. Use only control ids, jack ids and legal values that describe_synth showed you. The sound is checked against the synth; if anything is wrong the whole sound is refused with the reason, so fix what it names and call again.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 60, description: "The sound's name." },
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
          description: 'Two to four sentences on the idea behind the sound.',
        },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 9,
          description:
            'Three to six steps in the order a person would build the sound: oscillators, mixer, filter, envelopes, modulation, cables, effects. Each sets at least one control or plugs in a cable.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 90 },
              module: { type: 'string', enum: [...SYNTH_MODULES] },
              why: { type: 'string', maxLength: 1500, description: STEP_LINE },
              set: {
                type: 'object',
                description: 'Control id → value.',
                additionalProperties: { type: ['number', 'string', 'boolean'] },
              },
              cables: {
                type: 'array',
                description: 'Cables to plug in, each [output jack id, input jack id].',
                items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
              },
            },
            required: ['title', 'module', 'why'],
          },
        },
        context: {
          type: 'object',
          description:
            'Control id → what that control is doing in this sound, and what happens if the learner moves it (up to 400 characters).',
          additionalProperties: { type: 'string', maxLength: 400 },
        },
        tweaks: {
          type: 'array',
          maxItems: 5,
          description: 'Things to try: a control, an action, and what the learner will hear.',
          items: {
            type: 'object',
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
          description:
            'A short original riff of 4 to 8 beats that suits the sound, not a copy of any song. Each note is [beat 0–16, MIDI note 24–96, length in beats 0.05–16].',
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
      id: `tutor-${Date.now().toString(36)}`,
      name: args.name,
      ref: 'Designed by the tutor from your description',
      artist: 'AI tutor',
      tags: [args.category, 'ai'],
      level: args.level,
      blurb: args.blurb,
      how: args.how,
      phrase: { bpm: args.phrase.bpm, loop: true, steps: args.phrase.steps },
      steps: args.steps,
      context: args.context ?? {},
      tweaks: args.tweaks ?? [],
      ai: true,
    });
    if (!checked.ok)
      return Promise.resolve(
        this.error(
          refusal('Sound refused, nothing was designed:', checked.problems),
          'invalid_design'
        )
      );
    return Promise.resolve(
      this.success({ synthId: def.id, version: def.version, sound: checked.value })
    );
  }
}
