/**
 * `get_panel`: the panel as the route passed it, as what the learner changed from the Default patch: the controls that
 * differ from it (labelled, with the value as the panel shows it), the cables plugged in and taken out, and the
 * definition version.
 *
 * @see lib/app/tutor/get-panel.ts
 */
import { describe, expect, it } from 'vitest';
import { GetPanelCapability } from '@/lib/app/tutor/get-panel';
import { presetState } from '@/lib/app/synths/lib/patch';
import { manyCables, panelContext, synth } from '@/tests/helpers/tutor';

const tool = new GetPanelCapability();
const modelD = synth('model-d');

describe('get_panel', () => {
  it('returns the changed controls, the cables and the version', async () => {
    const result = await tool.execute(
      {},
      panelContext(modelD, {
        values: { 'filter.cutoff': -2, 'osc1.wave': 'sq', 'fenv.decay': modelD.init['fenv.decay'] },
        cables: [['j.lfoTri', 'j.cutCv']],
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      synthId: 'model-d',
      version: modelD.version,
      truncated: false,
      cables: [['j.lfoTri', 'j.cutCv']],
      defaultCables: [],
      plugged: [['j.lfoTri', 'j.cutCv']],
      unplugged: [],
    });
    // A value sent at its Default patch value is not a change.
    expect(result.data?.changed.map((c) => c.id)).toEqual(['osc1.wave', 'filter.cutoff']);
    expect(result.data?.changed[1]).toMatchObject({
      id: 'filter.cutoff',
      label: 'CUTOFF FREQUENCY',
      value: -2,
    });
    expect(result.data?.changed[0].shown).toBe('Square');
  });

  it.each(['model-d', 'ems-vcs3', 'system-15'])(
    'reports no change on the Default patch of %s, which differs from init',
    async (id) => {
      const def = synth(id);
      const { values, cables } = presetState(def);
      // The Default patch moves values (and on a patch synth puts cables in) that init does not, so a comparison with
      // init would report them as the learner's changes.
      expect(def.controls.some((c) => values[c.id] !== def.init[c.id])).toBe(true);
      const result = await tool.execute(
        {},
        panelContext(def, { values, cables: cables.map((c): [string, string] => [c.from, c.to]) })
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        changed: [],
        plugged: [],
        unplugged: [],
        truncated: false,
      });
      expect(result.data?.defaultCables).toEqual(result.data?.cables);
    }
  );

  it("lists the Default patch's cables the learner took out", async () => {
    const vcs3 = synth('ems-vcs3');
    const { values, cables } = presetState(vcs3);
    expect(cables.length).toBeGreaterThan(0);
    const result = await tool.execute({}, panelContext(vcs3, { values, cables: [] }));
    expect(result.data?.changed).toEqual([]);
    expect(result.data?.plugged).toEqual([]);
    expect(result.data?.unplugged).toEqual(cables.map((c) => [c.from, c.to]));
    // What a design starts with is still listed, though none of it is in now.
    expect(result.data?.cables).toEqual([]);
    expect(result.data?.defaultCables).toEqual(cables.map((c) => [c.from, c.to]));
  });

  it('lists at most 100 changed controls, and says when there are more', async () => {
    const deepmind = synth('deepmind-12d');
    // Every continuous control moved off its init: far more than 100 on the DeepMind.
    const values = Object.fromEntries(
      deepmind.controls.flatMap((c) =>
        c.kind === 'cont' ? [[c.id, deepmind.init[c.id] === c.min ? c.max : c.min]] : []
      )
    );
    expect(Object.keys(values).length).toBeGreaterThan(100);
    const result = await tool.execute({}, panelContext(deepmind, { values }));
    expect(result.data?.changed).toHaveLength(100);
    expect(result.data?.truncated).toBe(true);
  });

  it('lists at most 100 cables, and says when there are more', async () => {
    const s15 = synth('system-15');
    const result = await tool.execute({}, panelContext(s15, { cables: manyCables(s15, 150) }));
    expect(result.data?.cables).toHaveLength(100);
    expect(result.data?.plugged).toHaveLength(100);
    expect(result.data?.truncated).toBe(true);
  });

  it('refuses when no panel came with the conversation', async () => {
    const result = await tool.execute({}, { userId: 'user-1', agentId: 'agent-tutor' });
    expect(result).toMatchObject({ success: false, error: { code: 'no_panel' } });
    expect(result.data).toBeUndefined();
  });

  it('takes no arguments', () => {
    expect(() => tool.validate({ synthId: 'model-d' })).toThrow();
    expect(tool.validate({})).toEqual({});
  });
});
