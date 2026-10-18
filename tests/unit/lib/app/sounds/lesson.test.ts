/**
 * A user sound's lesson (`f-tutor` t-55), `lib/app/sounds/lesson.ts`: the shape both writers are held to, the check
 * against the synth, the read of a stored lesson, the `Preset` the Lesson panel reads, and the text the publish word
 * check covers. The API's use of them is in `tests/unit/app/api/v1/sounds/`.
 */
import { describe, it, expect } from 'vitest';
import { getSynthDef } from '@/lib/app/synths/defs';
import {
  SoundLessonSchema,
  checkLesson,
  lessonPreset,
  lessonText,
  storedLesson,
  type SoundLessonInput,
} from '@/lib/app/sounds/lesson';
import type { Control } from '@/lib/app/synths/contract';

const modelD = getSynthDef('model-d')!;
const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;

const lesson: SoundLessonInput = {
  blurb: 'The blurb.',
  level: 2,
  category: 'lead',
  how: 'The how.',
  steps: [
    { title: 'Step title', module: cont.module, why: 'Step why.', set: { [cont.id]: cont.max } },
    { title: 'Cable title', module: 'patch', why: 'Cable why.', cables: [[outJack.id, inJack.id]] },
  ],
  context: { [cont.id]: 'Context text.' },
  tweaks: [{ id: cont.id, try: 'Tweak try.', hear: 'Tweak hear.' }],
  phrase: { bpm: 120, steps: [[0, 60, 0.5]] },
};

describe('SoundLessonSchema', () => {
  it('takes a lesson inside every limit, and fills missing context and tweaks with none', () => {
    const { context: _c, tweaks: _t, ...bare } = lesson;
    expect(SoundLessonSchema.parse(bare)).toEqual({ ...bare, context: {}, tweaks: [] });
  });

  it('refuses rather than clamps: a field past its limit, an extra key, a step that changes nothing', () => {
    const result = SoundLessonSchema.safeParse({
      ...lesson,
      how: 'x'.repeat(901),
      steps: [{ title: 'Empty', module: 'osc', why: 'Nothing.' }],
      name: 'Not a lesson field',
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['how', 'steps.0', '']));
  });
});

describe('checkLesson', () => {
  it('passes a lesson that fits the synth, its steps typed as the validator types them', () => {
    const result = checkLesson(modelD, lesson);
    expect(result.ok).toBe(true);
    expect(result.value?.steps).toEqual(lesson.steps);
  });

  it('names every control and jack the synth does not have, in the steps, the context and the tweaks', () => {
    const result = checkLesson(modelD, {
      ...lesson,
      steps: [{ ...lesson.steps[0], set: { 'no-such-control': 1 } }, lesson.steps[1]],
      context: { 'no-such-context': 'Nothing.' },
      tweaks: [{ id: 'no-such-tweak', try: 'Turn it.', hear: 'Nothing.' }],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.path).sort()).toEqual([
      'context.no-such-context',
      'steps.0.set.no-such-control',
      'tweaks.0.id',
    ]);
  });

  it('refuses a value its control cannot take', () => {
    const result = checkLesson(modelD, {
      ...lesson,
      steps: [{ ...lesson.steps[0], set: { [cont.id]: cont.max + 1 } }],
    });
    expect(result.problems).toEqual([
      expect.objectContaining({ path: `steps.0.set.${cont.id}`, code: 'out-of-range' }),
    ]);
  });
});

describe('storedLesson', () => {
  it('reads a stored lesson back, and nothing from an empty column or one that is not a lesson', () => {
    expect(storedLesson(JSON.parse(JSON.stringify(lesson)))).toEqual(lesson);
    expect(storedLesson(null)).toBeNull();
    expect(storedLesson(undefined)).toBeNull();
    expect(storedLesson({ steps: 'none' })).toBeNull();
  });
});

describe('lessonPreset', () => {
  const checked = checkLesson(modelD, lesson).value!;

  it("is the user sound's own sound, with the tutor's credit and mark when the tutor designed it", () => {
    const preset = lessonPreset(checked, { id: 'mine:snd1', name: 'My lead', fromTutor: true });
    expect(preset).toEqual({
      id: 'mine:snd1',
      name: 'My lead',
      ref: 'Designed by the AI tutor',
      artist: 'AI tutor',
      tags: ['lead'],
      level: 2,
      blurb: 'The blurb.',
      how: 'The how.',
      phrase: { bpm: 120, loop: true, steps: [[0, 60, 0.5]] },
      steps: checked.steps,
      context: lesson.context,
      tweaks: lesson.tweaks,
      ai: true,
    });
  });

  it('carries no mark, and says the lesson is the sound’s own, when the tutor did not design it', () => {
    const preset = lessonPreset(checked, { id: 'mine:snd1', name: 'My lead', fromTutor: false });
    expect(preset).not.toHaveProperty('ai');
    expect(preset.ref).toBe('A lesson saved with this sound');
  });
});

describe('lessonText', () => {
  it('is every piece of text the lesson shows, and nothing else', () => {
    expect(lessonText(lesson).sort()).toEqual(
      [
        'The blurb.',
        'The how.',
        'Step title',
        'Step why.',
        'Cable title',
        'Cable why.',
        'Context text.',
        'Tweak try.',
        'Tweak hear.',
      ].sort()
    );
  });
});
