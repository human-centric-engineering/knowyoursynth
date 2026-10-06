/**
 * Patch helpers tests: lookups, formatting, preset state, cables to engine, the lenient sanitize* helpers, the
 * model-readable description and display names.
 *
 * @see lib/app/synths/lib/patch.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cablesToEngine,
  cleanLabel,
  controlMap,
  describeSynth,
  displayName,
  formatValue,
  isShown,
  jackGain,
  jackMap,
  presetState,
  sanitizeCables,
  sanitizePreset,
  sanitizeSet,
} from '@/lib/app/synths/lib/patch';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import type { Control, Jack, Preset, SynthDef } from '@/lib/app/synths/contract';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

const control = (def: SynthDef, id: string): Control => {
  const c = controlMap(def)[id];
  if (!c) throw new Error(`fixture has no control ${id}`);
  return c;
};

describe('lookups', () => {
  it('controlMap and jackMap index by id and are cached per definition', () => {
    const def = makeMiniD();

    expect(controlMap(def)['filter.cutoff']?.id).toBe('filter.cutoff');
    expect(jackMap(def)['lfo.tri']?.dir).toBe('out');
    expect(controlMap(def)).toBe(controlMap(def));
    expect(jackMap(def)).toBe(jackMap(def));
    expect(controlMap(makeMiniD())).not.toBe(controlMap(def));
  });

  it('cleanLabel flattens line breaks and falls back to the id', () => {
    expect(cleanLabel({ id: 'x', label: 'OSC 3\nCONTROL' })).toBe('OSC 3 CONTROL');
    expect(cleanLabel({ id: 'x.y' })).toBe('x.y');
  });
});

describe('isShown', () => {
  const base = control(makeMiniD(), 'mix.osc1');

  it('is true for a control with no show condition', () => {
    expect(isShown(base, {})).toBe(true);
  });

  it('checks eq, in, and every entry of a list', () => {
    const eq: Control = { ...base, show: { id: 'page', eq: 'a' } };
    const inList: Control = { ...base, show: { id: 'page', in: ['a', 'b'] } };
    const all: Control = {
      ...base,
      show: [
        { id: 'page', eq: 'a' },
        { id: 'mode', eq: true },
      ],
    };

    expect(isShown(eq, { page: 'a' })).toBe(true);
    expect(isShown(eq, { page: 'b' })).toBe(false);
    expect(isShown(inList, { page: 'b' })).toBe(true);
    expect(isShown(inList, { page: 'c' })).toBe(false);
    expect(isShown(all, { page: 'a', mode: true })).toBe(true);
    expect(isShown(all, { page: 'a', mode: false })).toBe(false);
  });
});

describe('formatValue', () => {
  const def = makeMiniD();

  it('shows a dash for no value', () => {
    expect(formatValue(control(def, 'mix.osc1'), undefined)).toBe('—');
  });

  it('shows On / Off for a bool', () => {
    expect(formatValue(control(def, 'mod.toOsc'), true)).toBe('On');
    expect(formatValue(control(def, 'mod.toOsc'), false)).toBe('Off');
  });

  it('shows an enum option label, else a wave name, else the raw value', () => {
    expect(formatValue(control(def, 'osc1.range'), '16')).toBe("16'");
    // osc1.wave options have empty labels: the wave name stands in
    expect(formatValue(control(def, 'osc1.wave'), 'sq')).toBe('Square');
    expect(formatValue(control(def, 'osc1.range'), 'weird')).toBe('weird');
  });

  it('shows a number to one place with a real minus sign, plus the fmt readout', () => {
    expect(formatValue(control(def, 'mix.osc1'), 4)).toBe('4');
    expect(formatValue(control(def, 'osc2.detune'), -1.26)).toBe('−1.3 · -1.3 st');
  });

  it('falls back to the number when fmt throws', () => {
    const c: Control = {
      id: 'x',
      type: 'fader',
      len: 100,
      orient: 'v',
      x: 0,
      y: 0,
      module: 'out',
      help: '',
      kind: 'cont',
      min: 0,
      max: 10,
      def: 0,
      fmt: () => {
        throw new Error('boom');
      },
    };
    expect(formatValue(c, 2.5)).toBe('2.5');
  });
});

describe('presetState', () => {
  const preset: Pick<Preset, 'phrase' | 'steps'> = {
    phrase: { bpm: 132, loop: true, steps: [] },
    steps: [
      {
        title: 'a',
        module: 'osc',
        why: '',
        set: { 'mix.osc2': 5 },
        cables: [['lfo.tri', 'cutoff.in']],
      },
      {
        title: 'b',
        module: 'filter',
        why: '',
        set: { 'filter.cutoff': -3, 'mix.osc2': 7 },
        cables: [
          ['lfo.tri', 'cutoff.in'],
          ['env1.out', 'pitch.in'],
        ],
      },
    ],
  };

  it('starts from init when there is no preset', () => {
    const def = makeMiniD();
    const s = presetState(def, null);

    expect(s.values).toEqual(def.init);
    expect(s.values).not.toBe(def.init);
    expect(s.cables).toEqual([]);
  });

  it('applies every step in order, without duplicate cables, colouring each cable in turn', () => {
    const s = presetState(makeMiniD(), preset);

    expect(s.values['mix.osc2']).toBe(7);
    expect(s.values['filter.cutoff']).toBe(-3);
    expect(s.cables).toEqual([
      { from: 'lfo.tri', to: 'cutoff.in', color: CABLE_COLORS[0] },
      { from: 'env1.out', to: 'pitch.in', color: CABLE_COLORS[1] },
    ]);
  });

  it('stops after step `upto`', () => {
    const s = presetState(makeMiniD(), preset, 0);

    expect(s.values['mix.osc2']).toBe(5);
    expect(s.values['filter.cutoff']).toBe(0);
    expect(s.cables).toHaveLength(1);
  });

  it('sets the tempo control from the riff when the synth has one', () => {
    const s = presetState(makeMiniD({ tempo: 'lfo.rate' }), preset);

    expect(s.values['lfo.rate']).toBe(132);
  });
});

describe('jackGain / cablesToEngine', () => {
  it('reads an output gain as a number, a function or the default 1', () => {
    const out = (gain?: number | ((v: Record<string, unknown>) => number)): Jack => ({
      id: 'o',
      x: 0,
      y: 0,
      r: 1,
      label: 'O',
      help: '',
      dir: 'out',
      signal: 'lfo',
      gain,
    });

    expect(jackGain(out(), {})).toBe(1);
    expect(jackGain(out(0.5), {})).toBe(0.5);
    expect(
      jackGain(
        out(() => 0.25),
        {}
      )
    ).toBe(0.25);
  });

  it('turns cables into engine routes with input amt × output gain', () => {
    const def = makeMiniD();
    const r = cablesToEngine(
      def,
      [
        { from: 'lfo.tri', to: 'cutoff.in' },
        { from: 'osc1.out', to: 'vcf.in' },
      ],
      def.init
    );

    expect(r).toEqual([
      { src: 'lfoTri', dst: 'cutoff', amt: 3, add: true },
      { src: 'osc1', dst: 'vcfIn', amt: 1, add: false },
    ]);
  });

  it('skips unknown, reversed and unmodelled cables', () => {
    const def = makeMiniD();
    const r = cablesToEngine(
      def,
      [
        { from: 'ghost', to: 'cutoff.in' },
        { from: 'cutoff.in', to: 'lfo.tri' },
        { from: 'dead.out', to: 'cutoff.in' },
        { from: 'lfo.tri', to: 'dead.in' },
      ],
      def.init
    );

    expect(r).toEqual([]);
  });

  it('applies function amt and gain, and tags the voices of a two-part synth', () => {
    const base = makeMiniD();
    const def = makeMiniD({
      jacks: [
        ...base.jacks,
        {
          id: 'b.out',
          x: 0,
          y: 0,
          r: 1,
          label: 'B',
          help: '',
          dir: 'out',
          signal: 'env1',
          part: 1,
          gain: () => 0.5,
        },
        {
          id: 'b.in',
          x: 0,
          y: 0,
          r: 1,
          label: 'B IN',
          help: '',
          dir: 'in',
          dest: 'cutoff',
          amt: (v) => Number(v['mix.osc1']),
        },
      ],
    });
    const r = cablesToEngine(def, [{ from: 'b.out', to: 'b.in' }], { 'mix.osc1': 4 });

    expect(r).toEqual([{ src: 'env1', dst: 'cutoff', amt: 2, add: false, sp: 1, dp: 0 }]);
  });
});

describe('sanitizeSet', () => {
  const def = makeMiniD();

  it('clamps and rounds numbers, coerces bools, matches options loosely, drops the rest', () => {
    const r = sanitizeSet(def, {
      'filter.cutoff': '9',
      'mix.osc1': 3.14159,
      'mix.osc2': 'loud',
      'mod.toOsc': 'on',
      'osc3.kbd': 'yes',
      'osc1.range': 16,
      'osc1.wave': 'square',
      nope: 1,
    });

    expect(r).toEqual({
      'filter.cutoff': 5,
      'mix.osc1': 3.14,
      'mod.toOsc': true,
      'osc3.kbd': false,
      'osc1.range': '16',
    });
  });

  it('returns nothing for input that is not an object', () => {
    expect(sanitizeSet(def, null)).toEqual({});
    expect(sanitizeSet(def, 'x')).toEqual({});
  });
});

describe('sanitizeCables', () => {
  const def = makeMiniD();

  it('keeps out→in, swaps in→out, drops the rest', () => {
    const r = sanitizeCables(def, [
      ['lfo.tri', 'cutoff.in'],
      ['cutoff.in', 'env1.out'],
      ['lfo.tri', 'env1.out'],
      ['ghost', 'cutoff.in'],
      ['lfo.tri'],
      'nope',
    ]);

    expect(r).toEqual([
      ['lfo.tri', 'cutoff.in'],
      ['env1.out', 'cutoff.in'],
    ]);
  });

  it('returns nothing for input that is not a list', () => {
    expect(sanitizeCables(def, { a: 1 })).toEqual([]);
  });
});

describe('sanitizePreset', () => {
  const def = makeMiniD();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds an AI sound from a messy reply, dropping empty steps and unknown ids', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const r = sanitizePreset(def, {
      name: 'Wobble',
      tags: ['bass'],
      level: 3,
      blurb: 'b',
      how: 'h',
      steps: [
        { title: 'One', module: 'filter', why: 'w', set: { 'filter.cutoff': -2 } },
        { title: 'Empty', module: 'osc', set: { nope: 1 } },
        { module: 'nonsense', cables: [['lfo.tri', 'cutoff.in']] },
        'junk',
      ],
      context: { 'filter.cutoff': 'Low.', nope: 'x', 'mix.osc1': 3 },
      tweaks: [{ id: 'filter.emphasis', try: 't', hear: 'h' }, { id: 'nope' }, null],
      phrase: {
        bpm: 500,
        steps: [
          [-1, 200, 40],
          [1, 'x', 1],
          [2, 60, 0.5],
        ],
      },
    });

    expect(r).not.toBeNull();
    expect(r?.id).toBe(`ai-${new Date('2026-10-06T00:00:00Z').getTime().toString(36)}`);
    expect(r?.name).toBe('Wobble');
    expect(r?.tags).toEqual(['bass', 'ai']);
    expect(r?.level).toBe(3);
    expect(r?.ai).toBe(true);
    expect(r?.steps).toEqual([
      { title: 'One', module: 'filter', why: 'w', set: { 'filter.cutoff': -2 }, cables: [] },
      { title: 'Step', module: 'osc', why: '', set: {}, cables: [['lfo.tri', 'cutoff.in']] },
    ]);
    expect(r?.context).toEqual({ 'filter.cutoff': 'Low.' });
    expect(r?.tweaks).toEqual([{ id: 'filter.emphasis', try: 't', hear: 'h' }]);
    expect(r?.phrase).toEqual({
      bpm: 180,
      loop: true,
      steps: [
        [0, 96, 16],
        [2, 60, 0.5],
      ],
    });
  });

  it('falls back to defaults for name, level, tags and riff', () => {
    const r = sanitizePreset(def, { steps: [{ set: { 'mix.osc1': 2 } }], level: 7 });

    expect(r?.name).toBe('AI sound');
    expect(r?.level).toBe(2);
    expect(r?.tags).toEqual(['ai', 'ai']);
    expect(r?.phrase.bpm).toBe(100);
    expect(r?.phrase.steps).toHaveLength(4);
  });

  it('returns null with no usable steps or no steps at all', () => {
    expect(sanitizePreset(def, { steps: [{ set: { nope: 1 } }] })).toBeNull();
    expect(sanitizePreset(def, { name: 'x' })).toBeNull();
    expect(sanitizePreset(def, 'x')).toBeNull();
  });
});

describe('describeSynth', () => {
  it('lists every control with its legal values and current value, the modelled jacks and the cables', () => {
    const def = makeMiniD();
    const text = describeSynth(def, def.init, [{ from: 'lfo.tri', to: 'cutoff.in' }]);

    expect(text).toContain('filter.cutoff | CUTOFF FREQUENCY | filter | number -5..5 | now 0');
    expect(text).toContain('mod.toOsc | OSC MOD | mod | true|false | now false');
    expect(text).toContain('osc1.range | RANGE | osc | one of "32", "16", "8", "4" | now "8"');
    expect(text).toContain('lfo.tri | LFO TRI | out');
    expect(text).not.toContain('dead.out');
    expect(text).toContain('CABLES NOW: lfo.tri -> cutoff.in');
  });

  it('says none when there are no cables', () => {
    const def = makeMiniD();
    expect(describeSynth(def, def.init, [])).toContain('CABLES NOW: none');
  });
});

describe('displayName', () => {
  it('uses the name when given, the label when unique, and adds a hint to shared labels', () => {
    const def = makeMiniD();

    expect(displayName(def, control(def, 'filter.cutoff'))).toBe('CUTOFF FREQUENCY');
    // three VOLUME controls: the id parts not already in the label become the hint
    expect(displayName(def, control(def, 'mix.osc1'))).toBe('VOLUME · mixer osc 1');
    expect(displayName(def, control(def, 'out.volume'))).toBe('VOLUME · out');
    // two ATTACK TIMEs
    expect(displayName(def, control(def, 'env2.attack'))).toBe('ATTACK TIME · env 2');
    expect(displayName(def, { ...control(def, 'mix.osc2'), name: 'Osc 2 level' })).toBe(
      'Osc 2 level'
    );
  });
});
