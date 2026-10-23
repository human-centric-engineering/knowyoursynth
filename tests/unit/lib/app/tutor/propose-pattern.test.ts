/**
 * `propose_pattern` and `get_pattern` (t-84): a pattern for the sequencer, new or an edit to the open one, made with
 * `applyPatternEdit` and held to `PatternSchema`; and the open pattern as the model reads it. A proposal that fails
 * never leaves the server as one: the result is a refusal with no data, naming the step or setting. Each refusal test
 * asserts both, so it fails if the check behind it is removed and the proposal goes through.
 *
 * @see lib/app/tutor/propose-pattern.ts · lib/app/tutor/get-pattern.ts · lib/app/tutor/pattern-edit.ts
 */
import { describe, expect, it } from 'vitest';
import { GetPatternCapability } from '@/lib/app/tutor/get-pattern';
import {
  applyPatternEdit,
  PatternEditSchema,
  summarisePattern,
} from '@/lib/app/tutor/pattern-edit';
import { ProposePatternCapability } from '@/lib/app/tutor/propose-pattern';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';
import { panelContext, synth, testPattern } from '@/tests/helpers/tutor';

const tool = new ProposePatternCapability();
const read = new GetPatternCapability();
const modelD = synth('model-d');
const open = testPattern();
const withPattern = (pattern?: Pattern) => panelContext(modelD, { pattern });
const ctx = withPattern(open);
const noPanel: CapabilityContext = { userId: 'user-1', agentId: 'agent-tutor' };

const propose = (args: Record<string, unknown>, c: CapabilityContext = ctx) =>
  tool.execute(tool.validate(args), c);

/** The pattern a proposal makes from `basis`, as the tutor panel makes it again from the result. */
function made(edit: unknown, basis: Pattern | null = open): Pattern {
  const r = applyPatternEdit(basis, PatternEditSchema.parse(edit));
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.pattern;
}

async function expectRefused(
  args: Record<string, unknown>,
  code: string,
  named: string[],
  c: CapabilityContext = ctx
) {
  const result = await propose(args, c);
  expect(result.success).toBe(false);
  expect(result.data).toBeUndefined();
  expect(result.error?.code).toBe(code);
  for (const n of named) expect(result.error?.message).toContain(n);
}

describe('propose_pattern: a good proposal', () => {
  it('edits the open pattern: the steps it lists are written, every other step and setting stays', async () => {
    const args = {
      start: 'open',
      swing: 60,
      steps: [
        { step: 13, notes: [{ note: 43, gate: 1 }], accent: true },
        { step: 15, notes: [{ note: 46, gate: 0.5, velocity: 0.6 }], ratchet: 2 },
      ],
    };
    const result = await propose(args);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ length: 16, written: 2, edit: { start: 'open' } });

    const p = made(result.data?.edit);
    const steps = p.parts[0].steps;
    expect(p.swing).toBe(60);
    expect(p.bpm).toBe(100);
    expect(steps[0]).toEqual(open.parts[0].steps[0]);
    expect(steps[8]).toEqual(open.parts[0].steps[8]);
    expect(steps[12]).toEqual({ on: true, notes: [{ note: 43, gate: 1 }], accent: true });
    expect(steps[14]).toEqual({
      on: true,
      notes: [{ note: 46, gate: 0.5, velocity: 0.6 }],
      ratchet: 2,
    });
  });

  it('writes a new pattern from blank, with no panel at all (an eval run sends none)', async () => {
    const result = await propose(
      {
        start: 'blank',
        length: 8,
        bpm: 128,
        steps: [1, 3, 5, 7].map((step) => ({ step, notes: [{ note: 36, gate: 1 }] })),
      },
      noPanel
    );
    expect(result.success).toBe(true);
    const p = made(result.data?.edit, null);
    expect(p.parts[0].steps).toHaveLength(8);
    expect(p.bpm).toBe(128);
    expect(p.parts[0].steps.map((s) => s.notes.length)).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
  });

  it("keeps a replaced step's condition and mod lane values, which it cannot write", async () => {
    const base: Pattern = structuredClone(open);
    base.lanes = ['cutoff'];
    base.parts[0].steps[8] = {
      ...base.parts[0].steps[8],
      condition: { t: 'ab', a: 1, b: 2 },
      mod: { cutoff: 3 },
    };
    const result = await propose(
      { start: 'open', steps: [{ step: 9, notes: [{ note: 50, gate: 1 }] }] },
      withPattern(base)
    );
    expect(result.success).toBe(true);
    expect(made(result.data?.edit, base).parts[0].steps[8]).toEqual({
      on: true,
      notes: [{ note: 50, gate: 1 }],
      condition: { t: 'ab', a: 1, b: 2 },
      mod: { cutoff: 3 },
    });
  });

  it('lengthens the open pattern with rests, and then writes past the old end', async () => {
    const result = await propose({
      start: 'open',
      length: 32,
      steps: [{ step: 25, notes: [{ note: 40, gate: 1 }] }],
    });
    expect(result.success).toBe(true);
    const p = made(result.data?.edit);
    expect(p.parts[0].steps).toHaveLength(32);
    expect(p.parts[0].steps[24].notes).toEqual([{ note: 40, gate: 1 }]);
    expect(p.parts[0].steps[20]).toEqual({ on: true, notes: [] });
  });
});

describe('propose_pattern: refusals the model can act on', () => {
  it('refuses a step past the end, naming the step and the length', () =>
    expectRefused(
      { start: 'open', steps: [{ step: 17, notes: [{ note: 40, gate: 1 }] }] },
      'invalid_proposal',
      ['Step 17 is past the end', 'has 16 steps', 'set length']
    ));

  it('refuses a part the pattern does not have', () =>
    expectRefused(
      { start: 'open', steps: [{ step: 1, part: 'B', notes: [{ note: 40, gate: 1 }] }] },
      'invalid_proposal',
      ['no part B']
    ));

  it('refuses a step listed twice', () =>
    expectRefused(
      {
        start: 'open',
        steps: [
          { step: 3, notes: [{ note: 40, gate: 1 }] },
          { step: 3, notes: [{ note: 41, gate: 1 }] },
        ],
      },
      'invalid_proposal',
      ['Step 3 of part A is listed twice']
    ));

  it('refuses an edit to the open pattern when none is open, and says to start from blank', () =>
    expectRefused(
      { start: 'open', steps: [{ step: 1, notes: [{ note: 40, gate: 1 }] }] },
      'no_pattern',
      ['No pattern is open', 'blank'],
      withPattern(undefined)
    ));

  it('refuses an edit with nothing in it, which is also what a call cut off arrives as', () =>
    expectRefused({ start: 'open' }, 'empty_proposal', ['empty', 'cut off']));

  it('refuses an edit that changes nothing', () =>
    expectRefused(
      { start: 'open', bpm: 100, steps: [{ step: 1, notes: [{ note: 36, gate: 2 }] }] },
      'no_change',
      ['changes nothing']
    ));

  it('refuses a pattern that plays nothing', () =>
    expectRefused({ start: 'blank', length: 8 }, 'empty_pattern', ['plays nothing']));

  it('refuses a note outside MIDI, a gate past the longest, and an unknown field at the schema', () => {
    // The dispatcher turns these into the refusal the model reads, before `execute`.
    expect(() =>
      tool.validate({ start: 'open', steps: [{ step: 1, notes: [{ note: 40, gate: 1000 }] }] })
    ).toThrow();
    expect(() =>
      tool.validate({ start: 'blank', steps: [{ step: 1, notes: [{ note: 200, gate: 1 }] }] })
    ).toThrow();
    expect(() => tool.validate({ start: 'blank', chain: [0, 1] })).toThrow();
  });
});

describe('get_pattern', () => {
  it('summarises the open pattern: its settings and one line per step that holds notes', async () => {
    const result = await read.execute(read.validate({}), ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      length: 16,
      stepSize: '1/16',
      bpm: 100,
      loop: true,
      direction: 'forward',
      swing: 50,
      transpose: 0,
      root: 'C',
      scale: 'chromatic',
      chain: 'A',
      lanes: [],
      parts: [{ part: 'A', steps: ['1: 36 g2', '9: 48 g1 v0.7 acc'] }],
    });
  });

  it('writes a chord, a muted step and a condition so the model can read them back', () => {
    const p = structuredClone(open);
    p.parts[0].steps[4] = {
      on: false,
      notes: [
        { note: 48, gate: 4 },
        { note: 52, gate: 4, nudge: 0.25 },
      ],
      slide: true,
      ratchet: 3,
      probability: 0.5,
      condition: { t: 'fill' },
    };
    expect(summarisePattern(p).parts[0].steps[1]).toBe(
      '5: 48 g4 + 52 g4 n0.25 slide r3 p0.5 fill off'
    );
  });

  it('says when no pattern is open, and how to write one', async () => {
    const result = await read.execute(read.validate({}), withPattern(undefined));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('no_pattern');
    expect(result.error?.message).toContain('start "blank"');
  });

  it('refuses a pattern that is not one the sequencer can hold', async () => {
    const bad = { ...open, bpm: 1000 };
    const result = await read.execute(read.validate({}), withPattern(bad));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('invalid_panel');
  });
});
