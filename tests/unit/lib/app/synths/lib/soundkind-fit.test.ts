/**
 * Fitting the sound detector's model, and measuring it: on made-up features whose categories are plain from one
 * input, so what the fit should learn is known in advance.
 *
 * @see lib/app/synths/lib/soundkind-fit.ts
 */

import { describe, it, expect } from 'vitest';

import type { PatternRole } from '@prisma/client';
import type { PresetCategory } from '@/lib/app/synths/contract';
import { kindOf, type SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import {
  agreement,
  confusionMarkdown,
  crossValidate,
  fitKindModel,
  type KindRow,
} from '@/lib/app/synths/lib/soundkind-fit';

const QUIET: SoundFeatures = {
  silent: false,
  attack: 0.01,
  decay: 0.2,
  sustain: 0.5,
  release: 0.1,
  pulses: 0,
  wobble: 0.2,
  brightness: 1,
  brightMove: 0,
  noise: 0.05,
  clarity: 0.95,
  pitch: 0,
  tracking: 1,
  drift: 0.05,
  levels: { low: 0, mid: 0, high: 0 },
  voices: 1,
};

/** A pad swells in, a perc hit stops at once, a bass sounds an octave down; a little spread so no two are the same. */
function rows(n: number): KindRow[] {
  const out: KindRow[] = [];
  for (let i = 0; i < n; i++) {
    const wiggle = (i % 7) / 70;
    const make = (
      category: PresetCategory,
      role: PatternRole,
      over: Partial<SoundFeatures>
    ): KindRow => ({
      synth: 'test',
      id: `${category}-${i}`,
      category,
      role,
      features: { ...QUIET, ...over },
    });
    out.push(make('pad', i % 4 ? 'held' : 'chord_changes', { attack: 0.4 + wiggle, sustain: 0.9 }));
    out.push(make('perc', 'percussive', { decay: 0.03 + wiggle / 10, sustain: 0 }));
    out.push(make('bass', 'bass_line', { pitch: -1 - wiggle }));
  }
  return out;
}

describe('fitKindModel', () => {
  const data = rows(20);
  const model = fitKindModel(data);

  it('learns categories that one input tells apart', () => {
    const a = agreement(data, model);
    expect(a.total).toBe(60);
    expect(a.agree).toBe(60);
    expect(kindOf({ ...QUIET, attack: 0.5, sustain: 0.95 }, model)?.category).toBe('pad');
    expect(kindOf({ ...QUIET, pitch: -1.5 }, model)?.category).toBe('bass');
  });

  it('gives each category the share of its rows carrying each role, and none to a category with no rows', () => {
    expect(model.roles.pad.held).toBe(0.75);
    expect(model.roles.pad.chord_changes).toBe(0.25);
    expect(model.roles.perc.percussive).toBe(1);
    expect(Object.values(model.roles.lead).every((v) => v === 0)).toBe(true);
  });

  it('fits the same rows to the same model every time', () => {
    expect(fitKindModel(rows(20))).toEqual(model);
  });

  it('standardises over the sounds it can hear, and refuses to fit to none', () => {
    const withSilence = [
      ...data,
      { ...data[0], id: 'hush', features: { ...QUIET, silent: true, attack: 99 } },
    ];
    expect(fitKindModel(withSilence).mean).toEqual(model.mean);
    expect(() => fitKindModel([])).toThrow(/no sound/);
  });
});

describe('agreement', () => {
  it('counts a silent sound as read as silent, which never agrees', () => {
    const data = rows(5);
    const model = fitKindModel(data);
    const a = agreement(
      [...data, { ...data[0], id: 'hush', features: { ...QUIET, silent: true } }],
      model
    );
    expect(a.total).toBe(16);
    expect(a.agree).toBe(15);
    expect(a.table.pad.silent).toBe(1);
    expect(a.table.pad.pad).toBe(5);
  });
});

describe('crossValidate', () => {
  it('measures every row once, on a model not fitted to it', () => {
    const data = rows(20);
    const cv = crossValidate(data, 5);
    expect(cv.total).toBe(60);
    expect(cv.agree).toBe(60);
  });
});

describe('confusionMarkdown', () => {
  it('writes one row per category, with the columns that were read and each row’s agreement', () => {
    const data = rows(5);
    const md = confusionMarkdown(agreement(data, fitKindModel(data))).split('\n');
    expect(md[0]).toBe('| Label | bass | pad | perc | Agree |');
    expect(md).toContain('| pad | · | **5** | · | 100% |');
    expect(md).toContain('| lead | · | · | · | 0% |'); // no lead sounds: nothing read, and no column for it
    expect(md).toHaveLength(2 + 12);
  });
});
