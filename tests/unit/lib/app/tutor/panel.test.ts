/**
 * The panel every tutor tool reads: parsed from `entityContext`, found in the registry, held to the current
 * definition version, and validated, before any tool uses it.
 *
 * @see lib/app/tutor/panel.ts
 */
import { describe, expect, it } from 'vitest';
import { changedFromDefault, readPanel, refusal } from '@/lib/app/tutor/panel';
import { presetState } from '@/lib/app/synths/lib/patch';
import { panelContext, synth } from '@/tests/helpers/tutor';

const modelD = synth('model-d');

describe('readPanel', () => {
  it('merges the panel over the Default patch and keeps its cables', () => {
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
    // A value the panel leaves out is the Default patch's, not init's.
    expect(modelD.init['aenv.decay']).not.toBe(modelD.defaultPatch?.values['aenv.decay']);
    expect(read.panel.values['aenv.decay']).toBe(modelD.defaultPatch?.values['aenv.decay']);
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

describe('changedFromDefault', () => {
  const vcs3 = synth('ems-vcs3');

  it('lists only the values that differ from the Default patch', () => {
    const base = presetState(modelD).values;
    const values = { ...base, 'filter.cutoff': -2, 'mix.osc2On': true };
    expect(changedFromDefault(modelD, values, [])).toEqual({
      values: { 'mix.osc2On': true, 'filter.cutoff': -2 },
      plugged: [],
      unplugged: [],
    });
    expect(changedFromDefault(modelD, base, []).values).toEqual({});
  });

  it('counts a value at init but off the Default patch as a change', () => {
    const values = { ...presetState(modelD).values, 'filter.cutoff': modelD.init['filter.cutoff'] };
    expect(changedFromDefault(modelD, values, []).values).toEqual({
      'filter.cutoff': modelD.init['filter.cutoff'],
    });
  });

  it("lists the cables plugged in beyond the Default patch's, and its cables taken out", () => {
    const base = presetState(vcs3);
    const defaults = base.cables.map((c): [string, string] => [c.from, c.to]);
    expect(defaults).toContainEqual(['r.envsig', 'c.out2']);
    const cables = [
      ...defaults.filter(([from, to]) => !(from === 'r.envsig' && to === 'c.out2')),
      ['r.osc2tri', 'c.out2'] as [string, string],
    ];
    expect(changedFromDefault(vcs3, base.values, cables)).toEqual({
      values: {},
      plugged: [['r.osc2tri', 'c.out2']],
      unplugged: [['r.envsig', 'c.out2']],
    });
    expect(changedFromDefault(vcs3, base.values, defaults)).toEqual({
      values: {},
      plugged: [],
      unplugged: [],
    });
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
