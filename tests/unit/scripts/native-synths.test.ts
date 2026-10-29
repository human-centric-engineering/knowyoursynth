/**
 * The list of synths written straight into the app, which the check and the goldens recorder take their baselines
 * and goldens from, once, in place of the prototype's.
 *
 * @see scripts/native-synths.ts
 */
import { describe, expect, it } from 'vitest';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import {
  addSoundsRefusal,
  isNativeSynth,
  NATIVE_SYNTHS,
  nativeSynthProblems,
  writeBaselineRefusal,
} from '@/scripts/native-synths';

describe('NATIVE_SYNTHS', () => {
  it('names only registered synths', () => {
    const registered = SYNTH_DEFS.map((d) => d.id);
    expect(NATIVE_SYNTHS.length).toBeGreaterThan(0);
    expect(NATIVE_SYNTHS.filter((id) => !registered.includes(id))).toEqual([]);
  });

  it('says which synths are native', () => {
    expect(isNativeSynth('donner-b1')).toBe(true);
    expect(isNativeSynth('td-3')).toBe(false);
  });
});

describe('nativeSynthProblems', () => {
  it('finds nothing when every native synth is registered and the prototype lacks it', () => {
    expect(nativeSynthProblems([...NATIVE_SYNTHS, 'td-3'], ['td-3'])).toEqual([]);
  });

  it('refuses a native synth that is not registered', () => {
    expect(nativeSynthProblems(['td-3'], ['td-3'])).toEqual([
      'native synth donner-b1 is not registered',
      'native synth take-5 is not registered',
      'native synth cs-80 is not registered',
      'native synth super-gemini is not registered',
      'native synth pearl-syncussion is not registered',
      'native synth behringer-syncussion is not registered',
      'native synth e7 is not registered',
      'native synth syntrx-ii is not registered',
      'native synth solar-42n is not registered',
    ]);
  });

  it('refuses a native synth the prototype also has, which makes it a port', () => {
    expect(nativeSynthProblems([...NATIVE_SYNTHS], ['donner-b1'])).toEqual([
      'native synth donner-b1 has a prototype definition: it is ported, not native',
    ]);
  });
});

describe('writeBaselineRefusal', () => {
  const run = { compare: false, synth: 'donner-b1', soundFilter: undefined, baselineExists: false };

  it('lets a native synth with no baseline record its first one', () => {
    expect(writeBaselineRefusal(run)).toBeNull();
  });

  it('refuses to overwrite a baseline that is already recorded', () => {
    expect(writeBaselineRefusal({ ...run, baselineExists: true })).toMatch(
      /^donner-b1 already has a baseline/
    );
  });

  it('refuses a ported synth, whose baseline is the prototype’s', () => {
    expect(writeBaselineRefusal({ ...run, synth: 'td-3' })).toMatch(/^td-3 is ported/);
  });

  it('refuses a run over every synth, a sound filter, and --compare alongside', () => {
    expect(writeBaselineRefusal({ ...run, synth: null })).toMatch(/name it$/);
    expect(writeBaselineRefusal({ ...run, soundFilter: 'acid' })).toMatch(/drop the sound filter$/);
    expect(writeBaselineRefusal({ ...run, compare: true })).toMatch(/not both$/);
  });
});

describe('addSoundsRefusal', () => {
  const run = { write: false, synth: 'model-d', soundFilter: undefined, baselineExists: true };

  it('lets a ported synth add to its baseline', () => {
    expect(addSoundsRefusal(run)).toBeNull();
  });

  it('lets a native synth add to its baseline', () => {
    expect(addSoundsRefusal({ ...run, synth: 'donner-b1' })).toBeNull();
  });

  it('refuses a synth with no baseline to add to', () => {
    expect(addSoundsRefusal({ ...run, baselineExists: false })).toBe(
      'model-d has no baseline to add to'
    );
  });

  it('refuses a run over every synth, a sound filter, and --write-baseline alongside', () => {
    expect(addSoundsRefusal({ ...run, synth: null })).toMatch(/name it$/);
    expect(addSoundsRefusal({ ...run, soundFilter: 'acid' })).toMatch(/drop the sound filter$/);
    expect(addSoundsRefusal({ ...run, write: true })).toMatch(/not both$/);
  });
});
