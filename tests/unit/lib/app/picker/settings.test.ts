/**
 * How the synth picker lists synths (`f-synth-picker` t-329): the shapes, and how the site's settings and a visitor's
 * own changes combine.
 *
 * @see lib/app/picker/settings.ts
 */
import { describe, it, expect } from 'vitest';
import {
  changedChoices,
  FACTORY_PICKER,
  pickerChoices,
  PickerPrefsSchema,
  SitePickerSettingsSchema,
  withChoice,
  type SitePickerSettings,
} from '@/lib/app/picker/settings';

const SITE: SitePickerSettings = { ...FACTORY_PICKER, order: 'new', kinds: ['poly'] };

describe('the defaults', () => {
  it('group by maker, A to Z, every kind, with thumbnails, and let visitors change them', () => {
    expect(FACTORY_PICKER).toEqual({
      group: 'maker',
      order: 'name',
      kinds: [],
      thumbs: true,
      visitorsMayChange: true,
      offerAll: true,
    });
    expect(SitePickerSettingsSchema.parse(FACTORY_PICKER)).toEqual(FACTORY_PICKER);
  });
});

describe('the schemas', () => {
  it('take a visitor’s changes, any or none', () => {
    expect(PickerPrefsSchema.parse({})).toEqual({});
    expect(PickerPrefsSchema.parse({ group: 'lineage', kinds: ['mono'] })).toEqual({
      group: 'lineage',
      kinds: ['mono'],
    });
  });

  it('refuse an unknown choice, a kind twice, an unknown kind or another key', () => {
    for (const bad of [
      { group: 'year' },
      { order: 'random' },
      { kinds: ['mono', 'mono'] },
      { kinds: ['drum machine'] },
      { visitorsMayChange: false },
    ])
      expect(PickerPrefsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it('need every one of the site’s settings', () => {
    const { offerAll: _offerAll, ...partial } = FACTORY_PICKER;
    expect(SitePickerSettingsSchema.safeParse(partial).success).toBe(false);
  });
});

describe('pickerChoices', () => {
  it('is the site’s choices for a visitor who changed none', () => {
    expect(pickerChoices(SITE, {})).toEqual({
      group: 'maker',
      order: 'new',
      kinds: ['poly'],
      thumbs: true,
    });
  });

  it('takes the visitor’s changes over the site’s, and the site’s for the rest', () => {
    expect(pickerChoices(SITE, { group: 'lineage', thumbs: false })).toEqual({
      group: 'lineage',
      order: 'new',
      kinds: ['poly'],
      thumbs: false,
    });
  });

  it('ignores the visitor’s changes while the site does not allow them', () => {
    const locked = { ...SITE, visitorsMayChange: false };
    expect(pickerChoices(locked, { group: 'lineage' })).toEqual(pickerChoices(locked, {}));
  });
});

describe('changedChoices', () => {
  it('counts the visitor’s choices that differ from the site’s', () => {
    expect(changedChoices(SITE, {})).toBe(0);
    expect(changedChoices(SITE, { group: 'name', kinds: [] })).toBe(2);
  });

  it('does not count a choice the same as the site’s, nor any while the site does not allow them', () => {
    expect(changedChoices(SITE, { order: 'new', kinds: ['poly'] })).toBe(0);
    expect(changedChoices({ ...SITE, visitorsMayChange: false }, { group: 'name' })).toBe(0);
  });
});

describe('withChoice', () => {
  it('keeps a choice that differs from the site’s, beside the others', () => {
    expect(withChoice(SITE, { thumbs: false }, 'group', 'lineage')).toEqual({
      thumbs: false,
      group: 'lineage',
    });
  });

  it('drops a choice changed back to the site’s, so the visitor follows the site’s later changes to it', () => {
    expect(withChoice(SITE, { group: 'lineage', thumbs: false }, 'group', 'maker')).toEqual({
      thumbs: false,
    });
    expect(withChoice(SITE, { kinds: [] }, 'kinds', ['poly'])).toEqual({});
  });
});
