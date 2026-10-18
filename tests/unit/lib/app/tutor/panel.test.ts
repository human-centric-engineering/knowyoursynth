/**
 * The panel every tutor tool reads: parsed from `entityContext`, found in the registry, held to the current
 * definition version, and validated, before any tool uses it.
 *
 * @see lib/app/tutor/panel.ts
 */
import { describe, expect, it } from 'vitest';
import { changedFromInit, readPanel, refusal } from '@/lib/app/tutor/panel';
import { panelContext, synth } from '@/tests/helpers/tutor';

const modelD = synth('model-d');

describe('readPanel', () => {
  it('merges the panel over the init and keeps its cables', () => {
    const read = readPanel(
      panelContext(modelD, {
        values: { 'filter.cutoff': -2 },
        cables: [['j.lfoTri', 'j.cutCv']],
      })
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.panel.def).toBe(modelD);
    expect(read.panel.values['filter.cutoff']).toBe(-2);
    expect(read.panel.values['fenv.decay']).toBe(modelD.init['fenv.decay']);
    expect(Object.keys(read.panel.values)).toHaveLength(modelD.controls.length);
    expect(read.panel.cables).toEqual([['j.lfoTri', 'j.cutCv']]);
  });

  it('refuses a conversation with no panel', () => {
    expect(readPanel({ userId: 'u', agentId: 'a' })).toMatchObject({ ok: false, code: 'no_panel' });
  });

  it('refuses a panel that came but is not the right shape, naming what is missing', () => {
    const read = readPanel(panelContext(modelD, {}, { entityContext: { synthId: 'model-d' } }));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe('invalid_panel');
    expect(read.message).toContain('version');
    expect(read.message).toContain('panel');
  });

  it('refuses a synth the registry does not have', () => {
    const ctx = panelContext(
      modelD,
      {},
      {
        entityContext: { synthId: 'no-such-synth', version: 1, panel: { values: {}, cables: [] } },
      }
    );
    expect(readPanel(ctx)).toMatchObject({ ok: false, code: 'unknown_synth' });
  });

  it('refuses a panel made on another definition version', () => {
    const ctx = panelContext(
      modelD,
      {},
      {
        entityContext: {
          synthId: 'model-d',
          version: modelD.version + 1,
          panel: { values: {}, cables: [] },
        },
      }
    );
    const read = readPanel(ctx);
    expect(read).toMatchObject({ ok: false, code: 'stale_panel' });
  });

  it('refuses a panel the synth cannot hold, naming what is wrong', () => {
    const read = readPanel(
      panelContext(modelD, { values: { 'filter.cutoff': 99, 'osc9.wave': 'saw' } })
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe('invalid_panel');
    expect(read.message).toContain('filter.cutoff=99');
    expect(read.message).toContain('osc9.wave');
  });
});

describe('changedFromInit', () => {
  it('lists only the values that differ from the init', () => {
    const values = { ...modelD.init, 'filter.cutoff': -2, 'mix.osc2On': true };
    expect(changedFromInit(modelD, values)).toEqual({ 'mix.osc2On': true, 'filter.cutoff': -2 });
    expect(changedFromInit(modelD, { ...modelD.init })).toEqual({});
  });
});

describe('refusal', () => {
  it('lists each problem with its path, and counts the ones past the first twelve', () => {
    const problems = Array.from({ length: 14 }, (_, i) => ({
      path: `set.c${i}`,
      message: `bad ${i}`,
    }));
    const text = refusal('Refused:', problems);
    expect(text).toContain('set.c0: bad 0');
    expect(text).toContain('set.c11: bad 11');
    expect(text).not.toContain('bad 12');
    expect(text).toMatch(/and 2 more\.$/);
  });
});
