/**
 * Family translation tests (t-319): a panel carried between members of a family keeps what both have, renames what
 * they name differently, and lists what the other member lacks, with why.
 *
 * @see lib/app/synths/families/translate.ts
 */
import { describe, expect, it } from 'vitest';
import { getSynthDef } from '@/lib/app/synths/defs';
import {
  departures,
  translate,
  findLink,
  type FamilyMap,
} from '@/lib/app/synths/families/translate';
import type { SynthDef } from '@/lib/app/synths/contract';

const def = (id: string): SynthDef => {
  const d = getSynthDef(id);
  if (!d) throw new Error(`no definition ${id}`);
  return d;
};
const td3 = def('td-3');
const tb303 = def('tb-303');
const gm = def('grandmother');
const m15 = def('model-15');
const s15 = def('system-15');
const s55 = def('system-55');

describe('translate', () => {
  it('carries a TD-3 panel with distortion on to the TB-303, reporting the distortion dropped', () => {
    const values = { ...td3.init, 'dist.on': true, 'dist.drive': 8, 'filter.cutoff': 7.5 };
    const t = translate(values, [], td3, tb303);

    expect(t.values['filter.cutoff']).toBe(7.5);
    expect(t.values).not.toHaveProperty('dist.on');
    expect(t.dropped).toContainEqual({
      kind: 'control',
      id: 'dist.on',
      value: true,
      reason: 'The TB-303 has no distortion',
    });
    expect(t.dropped).toContainEqual({
      kind: 'control',
      id: 'dist.drive',
      value: 8,
      reason: 'The TB-303 has no distortion',
    });
    // every value the TB-303 holds is legal there
    expect(Object.keys(t.values).every((id) => tb303.controls.some((c) => c.id === id))).toBe(true);
  });

  it('renames TUNE to TUNING, and clamps it to the shorter range, saying so', () => {
    const t = translate({ 'osc.tune': 9 }, [], td3, tb303);

    expect(t.values).toEqual({ 'osc.tuning': 5 });
    expect(t.changed).toEqual([
      {
        id: 'osc.tune',
        value: 9,
        to: { id: 'osc.tuning', value: 5 },
        reason: expect.stringContaining('9 became 5'),
      },
    ]);
    expect(t.dropped).toEqual([]);
  });

  it('keeps every shared value through TD-3 → TB-303 → TD-3', () => {
    const values = {
      ...td3.init,
      'filter.cutoff': 2.5,
      'filter.res': 9,
      'env.decay': 1,
      'osc.wave': 'sq',
      'osc.tune': -3,
    };
    const there = translate(values, [], td3, tb303);
    const back = translate(there.values, there.cables, tb303, td3);
    const lost = new Set(there.dropped.map((d) => (d.kind === 'control' ? d.id : '')));

    for (const [id, v] of Object.entries(values))
      if (!lost.has(id)) expect(back.values[id], id).toBe(v);
    expect([...lost].sort()).toEqual(['dist.drive', 'dist.level', 'dist.on', 'dist.tone']);
  });

  it('is pure: the same input gives the same output, and the input is left alone', () => {
    const values = { ...m15.init, 'osc2.wave': 'saw+sub', 'mix.3': 6 };
    const cables: [string, string][] = [['j.note_cv', 'j.osc1_cv']];
    const before = JSON.stringify({ values, cables });

    const a = translate(values, cables, m15, gm);
    const b = translate(values, cables, m15, gm);

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(JSON.stringify({ values, cables })).toBe(before);
  });

  it('renames a Grandmother jack and option for the Model 15', () => {
    const t = translate(
      { 'arp.dir': 'fb', 'vca.mode': 'drone', 'mix.osc1': 4 },
      [['j.kb_out', 'j.osc1_pitch']],
      gm,
      m15
    );

    expect(t.values).toEqual({ 'arp.dir': 'bf', 'vca.mode': 'on', 'mix.1': 4 });
    expect(t.cables).toEqual([['j.note_cv', 'j.osc1_cv']]);
    expect(t.dropped).toEqual([]);
  });

  it("drops the Model 15's sub level and keeps its wave without the sub on a Grandmother", () => {
    const t = translate({ 'osc2.wave': 'saw+sub', 'mix.3': 6 }, [], m15, gm);

    // on SUB the Model 15 has no noise, so the Grandmother's NOISE goes to 0 rather than keeping its own
    expect(t.values).toEqual({ 'osc2.wave': 'saw', 'mix.noise': 0 });
    expect(t.changed).toEqual([
      {
        id: 'osc2.wave',
        value: 'saw+sub',
        to: { id: 'osc2.wave', value: 'saw' },
        reason: 'The Grandmother has no sub-oscillator',
      },
      {
        id: 'mix.3',
        value: 6,
        to: { id: 'mix.noise', value: 0 },
        reason: "The Grandmother has no sub-oscillator: MIX 3 was the sub's level",
        // what dropped it: how the rest of the panel is set (t-326)
        cause: { id: 'osc2.wave', in: expect.arrayContaining(['saw+sub']) as unknown },
      },
    ]);
    expect(t.dropped).toEqual([
      {
        kind: 'control',
        id: 'mix.3',
        value: 6,
        reason: "The Grandmother has no sub-oscillator: MIX 3 was the sub's level",
        cause: { id: 'osc2.wave', in: expect.arrayContaining(['saw+sub']) as unknown },
      },
    ]);
  });

  it("carries the Model 15's MIX 3 as the Grandmother's noise while it is noise", () => {
    const t = translate({ 'osc2.wave': 'tri', 'mix.3': 6 }, [], m15, gm);

    expect(t.values).toEqual({ 'osc2.wave': 'tri', 'mix.noise': 6 });
    expect(t.dropped).toEqual([]);
  });

  it('drops a module one System size lacks, with its cables, naming the module', () => {
    const t = translate(
      { 'm921b_5.frequency': 3, 'm921b_1.frequency': 2 },
      [['j.m921b_5.sawtooth', 'j.m902_1.sig_in_pos']],
      s55,
      s15
    );

    expect(t.values).toEqual({ 'm921b_1.frequency': 2 });
    expect(t.dropped).toHaveLength(2);
    expect(t.dropped[0]).toMatchObject({ kind: 'control', id: 'm921b_5.frequency' });
    expect(t.dropped[0].reason).toBe('The System 15 has no 921B Oscillator (5)');
    expect(t.dropped[1]).toMatchObject({ kind: 'cable', reason: t.dropped[0].reason });
  });

  it('lists no panel-mode control as dropped', () => {
    const bs = def('behringer-syncussion');
    const t = translate({ 'ch1.trig': true }, [], bs, def('pearl-syncussion'));

    expect(t.values).toEqual({});
    expect(t.dropped).toEqual([]);
  });

  it('drops a value the other member cannot hold, saying why', () => {
    const maps: FamilyMap[] = [{ family: 'x', links: [{ from: 'grandmother', to: 'model-15' }] }];
    // without the map's option rename, FWD/BKWD is no setting the Model 15 has
    const t = translate({ 'arp.dir': 'fb' }, [], gm, m15, maps);

    expect(t.values).toEqual({});
    expect(t.dropped).toEqual([
      {
        kind: 'control',
        id: 'arp.dir',
        value: 'fb',
        reason: expect.stringContaining('has no FWD/BKWD setting'),
      },
    ]);
  });

  it('names an id neither member has plainly, not as a jack', () => {
    const t = translate({ 'osc.old': 3 }, [], td3, tb303);

    expect(t.dropped).toEqual([
      { kind: 'control', id: 'osc.old', value: 3, reason: 'The TD-3 has no osc.old' },
    ]);
  });

  it('names a cable the other member cannot patch in words, not jack ids', () => {
    const t = translate({}, [['j.cvOut', 'j.phones']], td3, tb303);

    expect(t.cables).toEqual([]);
    expect(t.dropped).toEqual([
      {
        kind: 'cable',
        cable: ['j.cvOut', 'j.phones'],
        reason: 'On the TB-303, CV (pitch) cannot be patched into HEADPHONE',
      },
    ]);
  });

  it('reads only a map entry of its own, never an inherited key', () => {
    const t = translate({ 'arp.dir': 'constructor' }, [['toString', 'j.mix1']], m15, gm);

    expect(t.values).toEqual({});
    expect(t.dropped.map((d) => d.kind)).toEqual(['control', 'cable']);
    expect(t.dropped[1].reason).toBe('The Model 15 has no toString');
  });

  it('returns a copy when the two members are the same synth', () => {
    const values = { 'filter.cutoff': 3 };
    const t = translate(values, [['j.cv', 'j.mixIn']], tb303, tb303);

    expect(t).toEqual({
      values,
      cables: [['j.cv', 'j.mixIn']],
      dropped: [],
      changed: [],
    });
    expect(t.values).not.toBe(values);
  });

  it('finds a link only where a map joins the two members', () => {
    expect(findLink('td-3', 'tb-303')?.to).toBe('tb-303');
    expect(findLink('td-3', 'model-15')).toBeNull();
  });
});

describe('departures (t-326)', () => {
  // The TD-3 with a Default patch cable, so a dropped cable can be one the Default patch puts in.
  const withCable: SynthDef = {
    ...td3,
    defaultPatch: { values: td3.defaultPatch?.values ?? {}, cables: [['gate.out', 'cv.in']] },
  };
  const base = { ...td3.init, ...td3.defaultPatch?.values };

  it("keeps only what the panel moved from the member's Default patch", () => {
    const t = {
      dropped: [
        {
          kind: 'control' as const,
          id: 'dist.on',
          value: base['dist.on'],
          reason: 'left at default',
        },
        { kind: 'control' as const, id: 'dist.drive', value: 9, reason: 'moved' },
        {
          kind: 'cable' as const,
          cable: ['gate.out', 'cv.in'] as [string, string],
          reason: 'default cable',
        },
        {
          kind: 'cable' as const,
          cable: ['cv.out', 'ext.in'] as [string, string],
          reason: 'patched',
        },
      ],
      changed: [
        {
          id: 'osc.tune',
          value: base['osc.tune'],
          to: { id: 'osc.tuning', value: 0 },
          reason: 'left',
        },
        { id: 'osc.tune', value: 10, to: { id: 'osc.tuning', value: 5 }, reason: 'clamped' },
      ],
    };

    const out = departures(withCable, t);

    expect(out.dropped.map((d) => d.reason)).toEqual(['moved', 'patched']);
    expect(out.changed.map((c) => c.reason)).toEqual(['clamped']);
  });

  it('keeps a dropWhen loss the rest of the panel caused, with the dropped control at its default', () => {
    // the Model 15 on SUB, with MIX 3 left as its Default patch has it: MIX 3 was the sub's level, and is dropped
    const base15 = { ...m15.init, ...m15.defaultPatch?.values };
    const t = translate({ ...base15, 'osc2.wave': 'saw+sub' }, [], m15, gm);
    const kept = departures(m15, t);

    expect(kept.dropped.map((d) => (d.kind === 'control' ? d.id : null))).toContain('mix.3');
    expect(kept.changed.map((c) => c.id)).toContain('mix.3');
    // off SUB, nothing drops it
    expect(departures(m15, translate(base15, [], m15, gm)).dropped).toEqual([]);
  });

  it('narrows a real translation: a TD-3 panel with its distortion left off loses nothing of it', () => {
    const t = translate({ ...base, 'filter.res': 7 }, [], td3, tb303);
    expect(t.dropped.some((d) => d.reason === 'The TB-303 has no distortion')).toBe(true);
    expect(departures(td3, t).dropped).toEqual([]);
  });
});
