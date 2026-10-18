/**
 * `design_sound`: a whole sound with its lesson, held to `validatePreset` against the synth. A design that fails never
 * leaves the server as a sound: the result is a refusal with no data, naming the bad id or value. Each refusal test
 * asserts both, so it fails if the check behind it is removed.
 *
 * @see lib/app/tutor/design-sound.ts
 */
import { describe, expect, it } from 'vitest';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { validatePreset } from '@/lib/app/synths/validate';
import { panelContext, synth } from '@/tests/helpers/tutor';

const tool = new DesignSoundCapability();
const modelD = synth('model-d');
const ctx = panelContext(modelD);

/** The arguments as the model writes them, loosely typed so a test can put a wrong one in. */
interface DesignArgs {
  name: string;
  blurb: string;
  level: number;
  category: string;
  how: string;
  steps: {
    title: string;
    module: string;
    why: string;
    set?: Record<string, unknown>;
    cables?: string[][];
  }[];
  context?: Record<string, string>;
  tweaks?: { id: string; try: string; hear: string }[];
  phrase: { bpm: number; steps: number[][] };
}

/** A sound the model might design for "a dark, round bass" on Model D. */
const design = (): DesignArgs => ({
  name: 'Dark round bass',
  blurb: 'A low, rounded bass with a soft pluck.',
  level: 1,
  category: 'bass',
  how: 'Two oscillators an octave apart into a mostly closed filter, with a short contour for the pluck.',
  steps: [
    {
      title: 'Two oscillators an octave apart',
      module: 'osc',
      why: 'Stacking an octave gives the bass weight.\n- Osc 2 range 16: an octave below osc 1.',
      set: { 'osc2.range': '16', 'mix.osc2On': true, 'mix.osc2': 7 },
    },
    {
      title: 'Close the filter',
      module: 'filter',
      why: 'A low cutoff takes the edge off.\n- CUTOFF -2: dark and round.',
      set: { 'filter.cutoff': -2, 'filter.contour': 4 },
    },
    {
      title: 'Pluck the loudness',
      module: 'env',
      why: 'A short decay makes each note pluck.\n- DECAY 3: a short tail.',
      set: { 'aenv.decay': 3, 'aenv.sustain': 6 },
    },
  ],
  context: { 'filter.cutoff': 'Keeps the bass dark; turn it up to brighten it.' },
  tweaks: [{ id: 'filter.emphasis', try: 'Turn EMPHASIS to 5', hear: 'A vocal peak on each note' }],
  phrase: {
    bpm: 96,
    steps: [
      [0, 36, 0.5],
      [1, 36, 0.5],
      [2, 43, 0.5],
      [3, 41, 1],
    ],
  },
});

const run = (args: unknown) => tool.execute(tool.validate(args), ctx);

/** A refusal that carries no sound, and whose message names `named`. */
async function expectRefused(args: unknown, ...named: string[]) {
  const result = await run(args);
  expect(result.success).toBe(false);
  expect(result.data).toBeUndefined();
  expect(result.error?.code).toBe('invalid_design');
  for (const n of named) expect(result.error?.message).toContain(n);
}

describe('design_sound: a good design', () => {
  it('returns the whole sound with its lesson, credited to the tutor and marked as AI', async () => {
    const result = await run(design());
    expect(result.success).toBe(true);
    const sound = result.data?.sound;
    expect(result.data).toMatchObject({ synthId: 'model-d', version: modelD.version });
    expect(sound).toMatchObject({
      name: 'Dark round bass',
      artist: 'AI tutor',
      ref: 'Designed by the tutor from your description',
      tags: ['bass', 'ai'],
      level: 1,
      ai: true,
      phrase: { bpm: 96, loop: true },
      context: { 'filter.cutoff': expect.any(String) },
      tweaks: [{ id: 'filter.emphasis', try: expect.any(String), hear: expect.any(String) }],
    });
    expect(sound?.id).toMatch(/^tutor-[0-9a-f]{12}$/);
    expect(sound?.steps.map((s) => s.title)).toEqual([
      'Two oscillators an octave apart',
      'Close the filter',
      'Pluck the loudness',
    ]);
    // What comes back is a sound the strict validator accepts as it is.
    expect(validatePreset(modelD, sound).ok).toBe(true);
  });
});

describe('design_sound: refused against the synth (validatePreset)', () => {
  it('refuses a step setting a control the synth does not have, naming where', async () => {
    const d = design();
    d.steps[1].set = { 'filter.cutoff': -2, 'filter.drive': 3 };
    await expectRefused(d, 'steps.1.set.filter.drive');
  });

  it('refuses a value out of range', async () => {
    const d = design();
    d.steps[1].set = { 'filter.cutoff': -9 };
    await expectRefused(d, 'filter.cutoff=-9');
  });

  it('refuses an option the control does not have', async () => {
    const d = design();
    d.steps[0].set = { 'osc2.range': '64' };
    await expectRefused(d, 'osc2.range="64"');
  });

  it('refuses a cable written input first', async () => {
    const d = design();
    d.steps.push({
      title: 'Patch',
      module: 'patch',
      why: 'Patch it.',
      cables: [['j.cutCv', 'j.lfoTri']],
    });
    await expectRefused(d, 'steps.3.cables.0', 'wrong way round');
  });

  it('refuses a tweak naming a control the synth does not have', async () => {
    const d = design();
    d.tweaks = [{ id: 'filter.drive', try: 'More drive', hear: 'Grit' }];
    await expectRefused(d, 'tweaks.0.id', 'filter.drive');
  });

  it('refuses context for a control the synth does not have', async () => {
    const d = design();
    d.context = { 'osc4.wave': 'Not here' };
    await expectRefused(d, 'context.osc4.wave');
  });
});

describe("design_sound arguments: the prototype's limits refuse instead of clamping", () => {
  it('refuses a step that changes nothing', () => {
    const d = design();
    d.steps[2] = { title: 'Nothing', module: 'env', why: 'Nothing.', set: {} };
    expect(() => tool.validate(d)).toThrow();
  });

  it('refuses a category that is not one', () => {
    expect(() => tool.validate({ ...design(), category: 'ai' })).toThrow();
  });

  it('refuses a riff note outside 24 to 96, and a tempo outside 40 to 180', () => {
    expect(() =>
      tool.validate({ ...design(), phrase: { bpm: 96, steps: [[0, 12, 1]] } })
    ).toThrow();
    expect(() =>
      tool.validate({ ...design(), phrase: { bpm: 300, steps: [[0, 48, 1]] } })
    ).toThrow();
  });

  it('refuses a step setting more than 32 controls, and context for more than 16', () => {
    const many = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, 'x']));
    const d = design();
    d.steps[0].set = many(33);
    expect(() => tool.validate(d)).toThrow();
    expect(() => tool.validate({ ...design(), context: many(17) })).toThrow();
  });

  it('refuses more than nine steps', () => {
    const step = design().steps[0];
    expect(() =>
      tool.validate({ ...design(), steps: Array.from({ length: 10 }, () => step) })
    ).toThrow();
  });

  it('refuses a field the model does not write', () => {
    expect(() => tool.validate({ ...design(), artist: 'Someone famous' })).toThrow();
    expect(() => tool.validate({ ...design(), ai: false })).toThrow();
  });
});

describe('design_sound without a panel', () => {
  it('refuses when no panel came with the conversation', async () => {
    const result = await tool.execute(tool.validate(design()), {
      userId: 'user-1',
      agentId: 'agent-tutor',
    });
    expect(result).toMatchObject({ success: false, error: { code: 'no_panel' } });
  });
});
