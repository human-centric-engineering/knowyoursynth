/**
 * Sound validator tests
 *
 * The validator refuses (never repairs) a sound that does not fit its synth. Each refusal code gets a test that
 * builds the smallest input that should trip it and checks the path and code that come back.
 *
 * @see lib/app/synths/validate.ts
 */
import { describe, expect, it } from 'vitest';
import {
  checkCables,
  checkSettings,
  validatePreset,
  validateSound,
} from '@/lib/app/synths/validate';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

const def = makeMiniD();

/** A well-formed library sound for Mini D. */
const goodPreset = () => ({
  id: 'fat-bass',
  name: 'Fat bass',
  ref: 'In the style of nobody in particular',
  artist: 'Test',
  tags: ['bass', 'mono'],
  level: 1,
  blurb: 'A round bass.',
  how: 'Two oscillators an octave apart into a half-closed filter.',
  phrase: {
    bpm: 110,
    loop: true,
    steps: [
      [0, 36, 0.5],
      [1, 43, 0.5, 1],
    ],
  },
  steps: [
    {
      title: 'Two oscillators',
      module: 'osc',
      why: 'Thickens the tone.',
      set: { 'mix.osc2': 8, 'osc1.range': '16', 'mod.toOsc': true },
    },
    { title: 'Patch the LFO', module: 'patch', why: 'Wobble.', cables: [['lfo.tri', 'cutoff.in']] },
  ],
  context: { 'filter.cutoff': 'Half closed.' },
  tweaks: [{ id: 'filter.emphasis', try: 'Turn it up.', hear: 'It squelches.' }],
});

describe('validateSound', () => {
  it('accepts a legal panel state and returns it typed', () => {
    const r = validateSound(def, {
      values: { 'filter.cutoff': -2.5, 'osc1.wave': 'sq', 'mod.toOsc': true },
      cables: [['env1.out', 'pitch.in']],
    });

    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.value).toEqual({
      values: { 'filter.cutoff': -2.5, 'osc1.wave': 'sq', 'mod.toOsc': true },
      cables: [['env1.out', 'pitch.in']],
    });
  });

  it('refuses ids that name inherited object members instead of throwing', () => {
    // A plain-object lookup would find Object.prototype.constructor for these and crash on its missing kind.
    const r = validateSound(def, {
      values: { constructor: 1, toString: 'x' },
      cables: [['constructor', 'hasOwnProperty']],
    });

    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.code)).toEqual(
      expect.arrayContaining(['unknown-control', 'unknown-jack'])
    );
    expect(r.problems.filter((p) => p.code === 'unknown-control')).toHaveLength(2);
  });

  it('defaults missing cables to none', () => {
    const r = validateSound(def, { values: {} });

    expect(r.ok).toBe(true);
    expect(r.value?.cables).toEqual([]);
  });

  it('refuses input that is not the shape of a sound (invalid-shape)', () => {
    const r = validateSound(def, { values: 'loud', cables: [['lfo.tri']] });

    expect(r.ok).toBe(false);
    expect(r.value).toBeNull();
    expect(r.problems.map((p) => p.code)).toEqual(['invalid-shape', 'invalid-shape']);
    expect(r.problems.map((p) => p.path).sort()).toEqual(['cables.0', 'values']);
  });

  it('refuses null outright', () => {
    const r = validateSound(def, null);

    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatchObject({ path: '', code: 'invalid-shape' });
  });

  it('refuses a control id the synth does not have (unknown-control)', () => {
    const r = validateSound(def, { values: { 'filter.drive': 3 } });

    expect(r.problems).toEqual([
      {
        path: 'values.filter.drive',
        code: 'unknown-control',
        message: 'mini-d has no control filter.drive',
      },
    ]);
  });

  it('refuses a value above or below a continuous range (out-of-range)', () => {
    const r = validateSound(def, { values: { 'filter.cutoff': 5.01, 'mix.osc1': -1 } });

    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatchObject({ path: 'values.filter.cutoff', code: 'out-of-range' });
    expect(r.problems[0].message).toBe('filter.cutoff=5.01 is out of range -5..5');
    expect(r.problems[1]).toMatchObject({ path: 'values.mix.osc1', code: 'out-of-range' });
  });

  it('accepts the exact ends of a range', () => {
    const r = validateSound(def, { values: { 'filter.cutoff': -5, 'mix.osc1': 10 } });

    expect(r.ok).toBe(true);
  });

  it('refuses a continuous value that is a numeric string or not finite (not-a-number)', () => {
    const r = validateSound(def, { values: { 'filter.cutoff': '2', 'mix.osc1': Number.NaN } });

    expect(r.problems.map((p) => [p.path, p.code])).toEqual([
      ['values.filter.cutoff', 'not-a-number'],
      ['values.mix.osc1', 'not-a-number'],
    ]);
  });

  it('refuses an enum value that is none of the options, including a number for a string option (bad-option)', () => {
    const r = validateSound(def, { values: { 'osc1.wave': 'square', 'osc1.range': 8 } });

    expect(r.problems.map((p) => [p.path, p.code])).toEqual([
      ['values.osc1.wave', 'bad-option'],
      ['values.osc1.range', 'bad-option'],
    ]);
    expect(r.problems[0].message).toBe('osc1.wave="square" is not one of "tri" "saw" "sq"');
  });

  it('refuses a bool control given anything but true or false (not-boolean)', () => {
    const r = validateSound(def, { values: { 'mod.toOsc': 'on', 'osc3.kbd': 1 } });

    expect(r.problems.map((p) => [p.path, p.code])).toEqual([
      ['values.mod.toOsc', 'not-boolean'],
      ['values.osc3.kbd', 'not-boolean'],
    ]);
  });

  it('refuses a cable to a jack the synth does not have (unknown-jack)', () => {
    const r = validateSound(def, {
      values: {},
      cables: [
        ['lfo.tri', 'nowhere.in'],
        ['ghost', 'spook'],
      ],
    });

    expect(r.problems).toEqual([
      { path: 'cables.0', code: 'unknown-jack', message: 'mini-d has no jack nowhere.in' },
      { path: 'cables.1', code: 'unknown-jack', message: 'mini-d has no jack ghost or spook' },
    ]);
  });

  it('refuses a cable written input first (reversed-cable)', () => {
    const r = validateSound(def, { values: {}, cables: [['cutoff.in', 'lfo.tri']] });

    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ path: 'cables.0', code: 'reversed-cable' });
    expect(r.problems[0].message).toContain('[lfo.tri, cutoff.in]');
  });

  it('refuses a cable between two outputs (output-to-output)', () => {
    const r = validateSound(def, { values: {}, cables: [['lfo.tri', 'env1.out']] });

    expect(r.problems).toEqual([
      {
        path: 'cables.0',
        code: 'output-to-output',
        message: 'Cable lfo.tri > env1.out joins two outputs',
      },
    ]);
  });

  it('refuses a cable between two inputs (input-to-input)', () => {
    const r = validateSound(def, { values: {}, cables: [['pitch.in', 'cutoff.in']] });

    expect(r.problems).toEqual([
      {
        path: 'cables.0',
        code: 'input-to-input',
        message: 'Cable pitch.in > cutoff.in joins two inputs',
      },
    ]);
  });

  it('refuses a cable to or from a jack the engine does not model (unmodelled-jack)', () => {
    const r = validateSound(def, {
      values: {},
      cables: [
        ['dead.out', 'cutoff.in'],
        ['lfo.tri', 'dead.in'],
      ],
    });

    expect(r.problems.map((p) => [p.path, p.code])).toEqual([
      ['cables.0', 'unmodelled-jack'],
      ['cables.1', 'unmodelled-jack'],
    ]);
    expect(r.problems[0].message).toContain('(dead.out)');
    expect(r.problems[1].message).toContain('(dead.in)');
  });

  it('lists every problem at once, values and cables together', () => {
    const r = validateSound(def, {
      values: { nope: 1, 'mix.osc1': 11 },
      cables: [['pitch.in', 'cutoff.in']],
    });

    expect(r.problems.map((p) => p.code)).toEqual([
      'unknown-control',
      'out-of-range',
      'input-to-input',
    ]);
  });
});

describe('checkSettings / checkCables', () => {
  it('returns the typed values that passed alongside the problems', () => {
    const r = checkSettings(def, { 'mix.osc1': 4, bogus: true }, 'set');

    expect(r.values).toEqual({ 'mix.osc1': 4 });
    expect(r.problems).toEqual([
      { path: 'set.bogus', code: 'unknown-control', message: 'mini-d has no control bogus' },
    ]);
  });

  it('returns no problems for a good cable list', () => {
    expect(checkCables(def, [['osc1.out', 'vcf.in']])).toEqual([]);
  });
});

describe('validatePreset', () => {
  it('accepts a well-formed sound and keeps its steps', () => {
    const r = validatePreset(def, goodPreset());

    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.value?.steps[0].set).toEqual({ 'mix.osc2': 8, 'osc1.range': '16', 'mod.toOsc': true });
    expect(r.value?.steps[1]).toEqual({
      title: 'Patch the LFO',
      module: 'patch',
      why: 'Wobble.',
      cables: [['lfo.tri', 'cutoff.in']],
    });
  });

  it('refuses a missing field, an unknown category and a bad level (invalid-shape)', () => {
    const { name: _name, ...noName } = goodPreset();
    const r = validatePreset(def, { ...noName, tags: ['wobble'], level: 4 });

    expect(r.ok).toBe(false);
    expect(r.problems.every((p) => p.code === 'invalid-shape')).toBe(true);
    expect(r.problems.map((p) => p.path).sort()).toEqual(['level', 'name', 'tags']);
    expect(r.problems.find((p) => p.path === 'tags')?.message).toContain(
      'first tag must be a category'
    );
  });

  it('refuses a sound with no steps or no riff', () => {
    const r = validatePreset(def, {
      ...goodPreset(),
      steps: [],
      phrase: { bpm: 100, loop: true, steps: [] },
    });

    expect(r.problems.map((p) => p.path).sort()).toEqual(['phrase.steps', 'steps']);
  });

  it('refuses a step module that is not a synth module', () => {
    const p = goodPreset();
    const r = validatePreset(def, { ...p, steps: [{ ...p.steps[0], module: 'wobble' }] });

    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ path: 'steps.0.module', code: 'invalid-shape' });
  });

  it('points each value and cable problem at its step', () => {
    const p = goodPreset();
    const r = validatePreset(def, {
      ...p,
      steps: [
        { ...p.steps[0], set: { 'mix.osc2': 12 } },
        { ...p.steps[1], cables: [['cutoff.in', 'lfo.tri']] },
      ],
    });

    expect(r.problems.map((x) => [x.path, x.code])).toEqual([
      ['steps.0.set.mix.osc2', 'out-of-range'],
      ['steps.1.cables.0', 'reversed-cable'],
    ]);
  });

  it('refuses tweaks and context lines that name unknown controls', () => {
    const r = validatePreset(def, {
      ...goodPreset(),
      tweaks: [{ id: 'filter.drive', try: 'x', hear: 'y' }],
      context: { 'osc9.level': 'Nope.' },
    });

    expect(r.problems).toEqual([
      {
        path: 'tweaks.0.id',
        code: 'unknown-control',
        message: 'Tweak names filter.drive, which mini-d does not have',
      },
      {
        path: 'context.osc9.level',
        code: 'unknown-control',
        message: 'Context names osc9.level, which mini-d does not have',
      },
    ]);
  });
});
