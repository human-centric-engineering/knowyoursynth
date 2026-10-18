/**
 * The tutor panel's rules for tool results (`f-tutor` t-56): which results are changes, how one turn's combine, and
 * what applying one does. The results come from the real tools, run on a real panel, so a client check that drifted
 * from what the server sends would refuse these and fail here.
 *
 * @see components/app/tutor/apply.ts
 */
import { describe, expect, it } from 'vitest';
import {
  applyProposal,
  combine,
  proposalLabel,
  proposalRows,
  readDesign,
  readProposal,
  samePanel,
  type PanelState,
  type Proposal,
} from '@/components/app/tutor/apply';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import type { CablePair, Control } from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';
import { darkBassDesign, manyCables, panelContext, synth } from '@/tests/helpers/tutor';

const modelD = synth('model-d');
const pro1 = synth('pro-1');
const cont = modelD.controls.filter(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
);
const [knobA, knobB] = cont;
const [cableA, cableB] = manyCables(modelD, 2);

/** Model D's init panel with `knobA` at its minimum and `cableA` in. */
const basis: PanelState = {
  values: { ...modelD.init, [knobA.id]: knobA.min },
  cables: [{ from: cableA[0], to: cableA[1], color: 'red' }],
};
const asInput = (p: PanelState) => ({
  values: p.values,
  cables: p.cables.map((c): CablePair => [c.from, c.to]),
});

const propose = new ProposePanelChangeCapability();
/** What `propose_panel_change` returns for these arguments, on `basis`. */
const proposalResult = (args: unknown) =>
  propose.execute(propose.validate(args), panelContext(modelD, asInput(basis)));

const design = new DesignSoundCapability();
const designResult = (args: unknown = darkBassDesign()) =>
  design.execute(design.validate(args), panelContext(modelD));

describe('samePanel', () => {
  it('compares what is on the panel, not the objects that hold it', () => {
    const copy: PanelState = {
      values: { ...basis.values },
      cables: basis.cables.map((c) => ({ ...c, color: 'blue' })),
    };
    expect(samePanel(basis, copy)).toBe(true);
  });

  it('tells a moved control, another cable and another cable order apart', () => {
    expect(samePanel(basis, { ...basis, values: { ...basis.values, [knobA.id]: knobA.max } })).toBe(
      false
    );
    expect(samePanel(basis, { ...basis, cables: [] })).toBe(false);
    const two = [...basis.cables, { from: cableB[0], to: cableB[1], color: 'red' }];
    expect(samePanel({ ...basis, cables: two }, { ...basis, cables: [...two].reverse() })).toBe(
      false
    );
  });
});

describe('readProposal', () => {
  it("takes the tool's own result as the change it proposes", async () => {
    const result = await proposalResult({
      set: { [knobA.id]: knobA.max },
      removeCables: [cableA],
      addCables: [cableB],
    });
    expect(result.success).toBe(true);

    expect(readProposal(modelD, 'propose_panel_change', result)).toEqual({
      set: { [knobA.id]: knobA.max },
      addCables: [cableB],
      removeCables: [cableA],
    });
  });

  it('takes nothing from a refusal, another tool, or another synth or version', async () => {
    const refused = await proposalResult({ set: { 'no.such.control': 1 } });
    expect(refused.success).toBe(false);
    const ok = await proposalResult({ set: { [knobA.id]: knobA.max } });

    expect(readProposal(modelD, 'propose_panel_change', refused)).toBeNull();
    expect(readProposal(modelD, 'design_sound', ok)).toBeNull();
    expect(readProposal(pro1, 'propose_panel_change', ok)).toBeNull();
    expect(
      readProposal({ ...modelD, version: modelD.version + 1 }, 'propose_panel_change', ok)
    ).toBeNull();
  });

  it('checks the change again: an unknown control, a value out of range or a reversed cable is refused', () => {
    const result = (data: Record<string, unknown>) => ({
      success: true,
      data: {
        synthId: 'model-d',
        version: modelD.version,
        set: {},
        addCables: [],
        removeCables: [],
        ...data,
      },
    });
    // the same shape with a legal change passes, so each refusal below is the check's
    expect(
      readProposal(modelD, 'propose_panel_change', result({ set: { [knobA.id]: knobA.max } }))
    ).not.toBeNull();

    expect(
      readProposal(modelD, 'propose_panel_change', result({ set: { 'no.such.control': 1 } }))
    ).toBeNull();
    expect(
      readProposal(modelD, 'propose_panel_change', result({ set: { [knobA.id]: knobA.max + 100 } }))
    ).toBeNull();
    expect(
      readProposal(modelD, 'propose_panel_change', result({ addCables: [[cableB[1], cableB[0]]] }))
    ).toBeNull();
  });
});

describe('readDesign', () => {
  it("takes the tool's own result as a sound with its lesson, marked as the tutor's", async () => {
    const result = await designResult();
    expect(result.success).toBe(true);

    const got = readDesign(modelD, 'design_sound', result);

    expect(got).not.toBeNull();
    expect(got?.id).toMatch(/^tutor-[0-9a-f]{12}$/);
    expect(got?.name).toBe('Dark round bass');
    expect(got?.preset).toMatchObject({
      name: 'Dark round bass',
      ai: true,
      artist: 'AI tutor',
      tags: ['bass'],
    });
    expect(got?.preset.steps).toHaveLength(3);
    // the lesson Save sends: the category on its own, and the riff without `loop`
    expect(got?.lesson).toMatchObject({
      category: 'bass',
      level: 1,
      phrase: { bpm: 96, steps: darkBassDesign().phrase.steps },
    });
    expect(got?.lesson.phrase).not.toHaveProperty('loop');
    // the panel it opens with is the one the steps build
    expect(presetState(modelD, got?.preset).values['filter.cutoff']).toBe(-2);
  });

  it('takes nothing from a refusal, another synth, or a sound whose lesson Save could not keep', async () => {
    const refused = await designResult({
      ...darkBassDesign(),
      steps: [{ title: 'Nothing', module: 'osc', why: 'x', set: { 'no.such': 1 } }],
    });
    expect(refused.success).toBe(false);
    const ok = await designResult();
    if (!ok.success || !ok.data) throw new Error('the design was refused');
    const sound = ok.data.sound;
    const tamper = (s: Record<string, unknown>) => ({
      success: true,
      data: { ...ok.data, sound: { ...sound, ...s } },
    });

    expect(readDesign(modelD, 'design_sound', refused)).toBeNull();
    expect(readDesign(pro1, 'design_sound', ok)).toBeNull();
    expect(readDesign(modelD, 'propose_panel_change', ok)).toBeNull();
    // ten steps: past what a saved sound's lesson may hold
    expect(
      readDesign(modelD, 'design_sound', tamper({ steps: Array(10).fill(sound.steps[0]) }))
    ).toBeNull();
    // a step setting a control Model D does not have
    expect(
      readDesign(
        modelD,
        'design_sound',
        tamper({ steps: [{ ...sound.steps[0], set: { 'no.such': 1 } }] })
      )
    ).toBeNull();
    // the untampered result still passes, so each refusal above is the check's
    expect(readDesign(modelD, 'design_sound', tamper({}))).not.toBeNull();
  });
});

describe('combine', () => {
  const p = (over: Partial<Proposal>): Proposal => ({
    set: {},
    addCables: [],
    removeCables: [],
    ...over,
  });

  it('lets a later call win a control both set, and keeps what only one set', () => {
    expect(
      combine([p({ set: { [knobA.id]: 1, [knobB.id]: 2 } }), p({ set: { [knobA.id]: 3 } })]).set
    ).toEqual({ [knobA.id]: 3, [knobB.id]: 2 });
  });

  it('lets a later call override what an earlier one did with a cable, and lists each cable once', () => {
    expect(combine([p({ addCables: [cableB] }), p({ removeCables: [cableB] })])).toEqual(
      p({ removeCables: [cableB] })
    );
    expect(combine([p({ addCables: [cableB] }), p({ addCables: [cableB] })])).toEqual(
      p({ addCables: [cableB] })
    );
  });
});

describe('applyProposal', () => {
  it('sets the controls, takes cables out, then plugs new ones in', () => {
    const after = applyProposal(basis, {
      set: { [knobA.id]: knobA.max },
      removeCables: [cableA],
      addCables: [cableB],
    });

    expect(after.values[knobA.id]).toBe(knobA.max);
    expect(after.values[knobB.id]).toBe(basis.values[knobB.id]);
    expect(after.cables.map((c) => [c.from, c.to])).toEqual([cableB]);
    expect(after.cables[0]?.color).toEqual(expect.any(String));
    // the panel it was applied to is left as it was, for Undo
    expect(basis.values[knobA.id]).toBe(knobA.min);
    expect(basis.cables).toHaveLength(1);
  });

  it('does not plug in a cable that is already in', () => {
    expect(
      applyProposal(basis, { set: {}, addCables: [cableA], removeCables: [] }).cables
    ).toHaveLength(1);
  });
});

describe('the chip', () => {
  it('says how many controls and cables the change moves', () => {
    expect(
      proposalLabel({
        set: { a: 1, b: 2, c: 3 },
        addCables: [cableB],
        removeCables: [],
      })
    ).toBe('Apply 3 changes + 1 cable');
    expect(proposalLabel({ set: { a: 1 }, addCables: [], removeCables: [] })).toBe(
      'Apply 1 change'
    );
    expect(proposalLabel({ set: {}, addCables: [cableB], removeCables: [cableA] })).toBe(
      'Apply 2 cable changes'
    );
  });

  it('lists each change as the panel reads it, from the panel the change was made for', () => {
    const rows = proposalRows(modelD, basis, {
      set: { 'filter.cutoff': 3 },
      addCables: [],
      removeCables: [cableA],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^CUTOFF.*: .+ → .+$/i);
    expect(rows[1]).toMatch(/^Unplug .+ → .+$/);
  });
});
