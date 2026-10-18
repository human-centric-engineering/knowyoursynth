/**
 * `describe_synth`: a lookup for every synth. Whole when the synth is small, its sections when not; a section or a
 * prefix narrows it, and anything still too big comes back as the next prefixes down. Run against the real Model D
 * (small, 48 controls) and DeepMind 12 (1,568 controls, 1,514 of them in one section).
 *
 * @see lib/app/tutor/describe-synth.ts
 */
import { describe, expect, it } from 'vitest';
import { DescribeSynthCapability } from '@/lib/app/tutor/describe-synth';
import { DESCRIBE_MAX_CHARS } from '@/lib/app/tutor/sections';
import { describeSynth } from '@/lib/app/synths/lib/patch';
import { panelContext, synth } from '@/tests/helpers/tutor';

const tool = new DescribeSynthCapability();
const modelD = synth('model-d');
const deepmind = synth('deepmind-12d');

const run = (args: { section?: string; prefix?: string }, ctx = panelContext(modelD)) =>
  tool.execute(tool.validate(args), ctx);

describe('describe_synth on a small synth', () => {
  it("returns the whole synth with no arguments, with the panel's current values", async () => {
    const ctx = panelContext(modelD, {
      values: { 'filter.cutoff': -2 },
      cables: [['j.lfoTri', 'j.cutCv']],
    });
    const result = await run({}, ctx);
    expect(result.data?.scope).toBe('whole');
    const text = result.data?.text ?? '';
    expect(text).toBe(
      describeSynth(modelD, { ...modelD.init, 'filter.cutoff': -2 }, [
        { from: 'j.lfoTri', to: 'j.cutCv' },
      ])
    );
    expect(text).toContain('filter.cutoff | CUTOFF FREQUENCY | filter | number -5..5 | now -2');
    expect(text).toContain('CABLES NOW: j.lfoTri -> j.cutCv');
  });

  it('returns one section', async () => {
    const result = await run({ section: 'filter' });
    expect(result.data?.scope).toBe('section');
    expect(result.data?.text).toContain('filter.cutoff |');
    expect(result.data?.text).not.toContain('osc1.wave |');
  });

  it('returns the controls under a prefix', async () => {
    const result = await run({ prefix: 'fenv' });
    expect(result.data?.scope).toBe('prefix');
    const ids = (result.data?.text ?? '')
      .split('\n')
      .filter((l) => / \| /.test(l))
      .map((l) => l.split(' | ')[0]);
    expect(ids.filter((id) => id.includes('.'))).toEqual([
      'fenv.attack',
      'fenv.decay',
      'fenv.sustain',
    ]);
  });

  it('refuses a section the synth does not have, listing the ones it has', async () => {
    const result = await run({ section: 'reverb' });
    expect(result).toMatchObject({ success: false, error: { code: 'unknown_section' } });
    expect(result.error?.message).toContain('"reverb"');
    expect(result.error?.message).toContain('oscbank');
  });

  it('does not take an inherited name for a section', async () => {
    const result = await run({ section: 'constructor' });
    expect(result).toMatchObject({ success: false, error: { code: 'unknown_section' } });
  });

  it('refuses a prefix that matches nothing', async () => {
    const result = await run({ prefix: 'fen' });
    expect(result).toMatchObject({ success: false, error: { code: 'unknown_prefix' } });
    expect(result.error?.message).toContain('"fen"');
  });
});

describe('describe_synth and the jacks it does not list', () => {
  it('refuses a prefix that matches only a jack the sound engine does not model', async () => {
    // Pro-1's mod wheel jack has no destination, so describeSynth leaves it out; a success would describe nothing.
    const pro1 = synth('pro-1');
    expect(pro1.jacks.find((j) => j.id === 'j.modWh')).toBeDefined();
    const result = await run({ prefix: 'j.modWh' }, panelContext(pro1));
    expect(result).toMatchObject({ success: false, error: { code: 'unknown_prefix' } });
  });
});

describe('describe_synth on the DeepMind', () => {
  const ctx = panelContext(deepmind);

  it('returns the section list with no arguments, not 1,568 controls', async () => {
    const result = await run({}, ctx);
    expect(result.data?.scope).toBe('index');
    expect(result.data?.text).toContain('SECTIONS (id | name | controls)');
    expect(result.data?.text).toContain('display | Display and menus | 1514');
    expect((result.data?.text ?? '').length).toBeLessThan(DESCRIBE_MAX_CHARS);
  });

  it('returns a small section whole', async () => {
    const result = await run({ section: 'env' }, ctx);
    expect(result.data?.scope).toBe('section');
  });

  it('indexes a section too big to list, by the first part of each id', async () => {
    const result = await run({ section: 'display' }, ctx);
    expect(result.data?.scope).toBe('index');
    const text = result.data?.text ?? '';
    expect(text).toMatch(/^fx1 \| 373 \| /m);
    expect(text).toMatch(/^fx4 \| 373 \| /m);
    expect(text).toContain('and section display');
    expect(text.length).toBeLessThan(DESCRIBE_MAX_CHARS);
  });

  it('indexes a prefix too big to list one level down, describing its single controls in full', async () => {
    const result = await run({ section: 'display', prefix: 'fx1' }, ctx);
    expect(result.data?.scope).toBe('index');
    const text = result.data?.text ?? '';
    // The effect a slot holds is one control, so it is described, with its options.
    expect(text).toMatch(/^fx1\.type \| .* \| one of /m);
    // Each effect's parameters are a group to narrow to.
    expect(text).toMatch(/^fx1\.tc-deepvrb \| \d+ \| /m);
    expect(text.length).toBeLessThan(DESCRIBE_MAX_CHARS);
  });

  it("returns one effect's parameters in full", async () => {
    const result = await run({ prefix: 'fx1.tc-deepvrb' }, ctx);
    expect(result.data?.scope).toBe('prefix');
    const lines = (result.data?.text ?? '')
      .split('\n')
      .filter((l) => l.startsWith('fx1.tc-deepvrb.'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => / \| now /.test(l))).toBe(true);
  });
});

describe('describe_synth arguments', () => {
  it('takes only a section and a prefix', () => {
    expect(() => tool.validate({ section: 'filter', synthId: 'model-d' })).toThrow();
    expect(tool.validate({ section: 'filter', prefix: 'vcf' })).toEqual({
      section: 'filter',
      prefix: 'vcf',
    });
  });

  it('refuses when no panel came with the conversation', async () => {
    const result = await tool.execute({}, { userId: 'user-1', agentId: 'agent-tutor' });
    expect(result).toMatchObject({ success: false, error: { code: 'no_panel' } });
  });
});
