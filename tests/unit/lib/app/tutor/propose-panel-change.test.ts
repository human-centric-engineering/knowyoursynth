/**
 * `propose_panel_change`: a change set held to `validate.ts` and to the panel that was sent. A proposal that fails
 * never leaves the server as a proposal: the result is a refusal with no data, naming the bad id or value. Each
 * refusal test asserts both, so it fails if the check behind it is removed and the proposal goes through.
 *
 * @see lib/app/tutor/propose-panel-change.ts
 */
import { describe, expect, it } from 'vitest';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';
import { panelContext, synth } from '@/tests/helpers/tutor';

const tool = new ProposePanelChangeCapability();
const modelD = synth('model-d');
const panel = panelContext(modelD, {
  values: { 'filter.cutoff': 2 },
  cables: [['j.lfoTri', 'j.cutCv']],
});

const propose = (args: Record<string, unknown>, ctx: CapabilityContext = panel) =>
  tool.execute(tool.validate(args), ctx);

/** A refusal that carries no proposal, and whose message names `named`. */
async function expectRefused(args: Record<string, unknown>, code: string, ...named: string[]) {
  const result = await propose(args);
  expect(result.success).toBe(false);
  expect(result.data).toBeUndefined();
  expect(result.error?.code).toBe(code);
  for (const n of named) expect(result.error?.message).toContain(n);
}

describe('propose_panel_change: a good proposal', () => {
  it('returns the controls to set, the cables, and a row per change', async () => {
    const result = await propose({
      set: { 'filter.cutoff': -1.5, 'osc1.wave': 'sq', 'mix.osc2On': true },
      addCables: [['j.filtCont', 'j.loudCv']],
      removeCables: [['j.lfoTri', 'j.cutCv']],
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      synthId: 'model-d',
      version: modelD.version,
      set: { 'filter.cutoff': -1.5, 'osc1.wave': 'sq', 'mix.osc2On': true },
      addCables: [['j.filtCont', 'j.loudCv']],
      removeCables: [['j.lfoTri', 'j.cutCv']],
      changes: [
        expect.objectContaining({
          id: 'filter.cutoff',
          label: 'CUTOFF FREQUENCY',
          from: 2,
          to: -1.5,
        }),
        expect.objectContaining({ id: 'osc1.wave', from: 'saw', to: 'sq' }),
        expect.objectContaining({
          id: 'mix.osc2On',
          from: false,
          to: true,
          fromShown: 'Off',
          toShown: 'On',
        }),
      ],
    });
  });

  it('leaves out a control already at the proposed value', async () => {
    const result = await propose({ set: { 'filter.cutoff': 2, 'filter.emphasis': 4 } });
    expect(result.data?.set).toEqual({ 'filter.emphasis': 4 });
    expect(result.data?.changes.map((c) => c.id)).toEqual(['filter.emphasis']);
  });

  it('checks against the panel that was sent, not the init: two proposals do not see each other', async () => {
    const first = await propose({ set: { 'filter.cutoff': -1 } });
    const second = await propose({ set: { 'filter.cutoff': -1 } });
    expect(first.data?.changes[0]).toMatchObject({ from: 2, to: -1 });
    expect(second.data?.changes[0]).toMatchObject({ from: 2, to: -1 });
  });
});

describe('propose_panel_change: refused against the synth (validate.ts)', () => {
  it('refuses a control the synth does not have', () =>
    expectRefused(
      { set: { 'filter.cutoff': 1, 'filter.drive': 5 } },
      'invalid_proposal',
      'filter.drive'
    ));

  it('refuses a number out of range, naming the value and the range', () =>
    expectRefused({ set: { 'filter.cutoff': 7 } }, 'invalid_proposal', 'filter.cutoff=7', '-5..5'));

  it('refuses a number given as text', () =>
    expectRefused({ set: { 'filter.cutoff': '3' } }, 'invalid_proposal', 'filter.cutoff'));

  it('refuses an option the control does not have', () =>
    expectRefused({ set: { 'osc1.wave': 'sine' } }, 'invalid_proposal', 'osc1.wave="sine"'));

  it('refuses a switch given anything but true or false', () =>
    expectRefused({ set: { 'mix.osc2On': 'on' } }, 'invalid_proposal', 'mix.osc2On'));

  it('refuses a cable to a jack the synth does not have', () =>
    expectRefused({ addCables: [['j.lfoTri', 'j.nowhere']] }, 'invalid_proposal', 'j.nowhere'));

  it('refuses a cable written input first', () =>
    expectRefused(
      { addCables: [['j.loudCv', 'j.filtCont']] },
      'invalid_proposal',
      'wrong way round'
    ));

  it('refuses a cable joining two outputs', () =>
    expectRefused(
      { addCables: [['j.lfoTri', 'j.lfoSq']] },
      'invalid_proposal',
      'joins two outputs'
    ));

  it('refuses the whole proposal when one value is bad, proposing none of it', async () => {
    const result = await propose({ set: { 'filter.emphasis': 4, 'filter.cutoff': 99 } });
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });
});

describe('propose_panel_change: refused against the panel', () => {
  it('refuses to remove a cable that is not in', () =>
    expectRefused(
      { removeCables: [['j.filtCont', 'j.loudCv']] },
      'invalid_proposal',
      'j.filtCont > j.loudCv',
      'not in'
    ));

  it('refuses to add a cable that is already in', () =>
    expectRefused({ addCables: [['j.lfoTri', 'j.cutCv']] }, 'invalid_proposal', 'already in'));

  it('refuses a cable listed twice', () =>
    expectRefused(
      {
        addCables: [
          ['j.filtCont', 'j.loudCv'],
          ['j.filtCont', 'j.loudCv'],
        ],
      },
      'invalid_proposal',
      'listed twice'
    ));

  it('refuses a proposal that changes nothing', () =>
    expectRefused({ set: { 'filter.cutoff': 2 } }, 'no_change'));

  it('refuses when the panel itself is not valid', async () => {
    const result = await propose(
      { set: { 'filter.cutoff': 1 } },
      panelContext(modelD, { values: { 'filter.cutoff': 50 } })
    );
    expect(result).toMatchObject({ success: false, error: { code: 'invalid_panel' } });
    expect(result.data).toBeUndefined();
  });
});

describe('propose_panel_change arguments', () => {
  it('refuses more than 64 controls in one change', () => {
    const set = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`c${i}`, 1]));
    expect(() => tool.validate({ set })).toThrow();
  });

  it('refuses an argument it does not know', () => {
    expect(() => tool.validate({ set: {}, panel: {} })).toThrow();
  });
});
