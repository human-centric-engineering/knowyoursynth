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
  sortKinds,
  StoredPickerPrefsSchema,
  StoredSitePickerSettingsSchema,
  toggleKind,
  withChoice,
  type SitePickerSettings,
} from '@/lib/app/picker/settings';

const SITE: SitePickerSettings = { ...FACTORY_PICKER, order: 'new', kinds: ['poly'] };

describe('the defaults', () => {
  it('list the synths that play, by maker, A to Z, every kind, with thumbnails, and let visitors change them', () => {
    expect(FACTORY_PICKER).toEqual({
      scope: 'play',
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
      scope: 'play',
      group: 'maker',
      order: 'new',
      kinds: ['poly'],
      thumbs: true,
    });
  });

  it('takes the visitor’s changes over the site’s, and the site’s for the rest', () => {
    expect(pickerChoices(SITE, { group: 'lineage', thumbs: false })).toEqual({
      scope: 'play',
      group: 'lineage',
      order: 'new',
      kinds: ['poly'],
      thumbs: false,
    });
  });

  it('lists every synth ever made only while the site offers it', () => {
    expect(pickerChoices(SITE, { scope: 'all' }).scope).toBe('all');
    expect(pickerChoices({ ...SITE, offerAll: false }, { scope: 'all' }).scope).toBe('play');
    expect(pickerChoices({ ...SITE, scope: 'all', offerAll: false }, {}).scope).toBe('play');
  });

  it('ignores the visitor’s changes while the site does not allow them', () => {
    const locked = { ...SITE, visitorsMayChange: false };
    expect(pickerChoices(locked, { group: 'lineage' })).toEqual(pickerChoices(locked, {}));
  });
});

describe('changedChoices', () => {
  it('counts the choices the visitor keeps as their own', () => {
    expect(changedChoices(SITE, {})).toBe(0);
    expect(changedChoices(SITE, { group: 'name', kinds: [] })).toBe(2);
  });

  it('counts a kept choice that now matches the site’s, since it still holds when the site’s changes', () => {
    expect(changedChoices(SITE, { order: 'new' })).toBe(1);
  });

  it('counts none while the site does not allow them', () => {
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

describe('kinds', () => {
  it('are kept in the databank’s order, each once', () => {
    expect(sortKinds(['sequencer', 'mono', 'poly'])).toEqual(['mono', 'poly', 'sequencer']);
    expect(toggleKind(['poly'], 'mono')).toEqual(['mono', 'poly']);
    expect(toggleKind(['mono', 'poly'], 'mono')).toEqual(['poly']);
  });

  it('compare as a set, so choosing the site’s kinds in another order keeps nothing', () => {
    const site: SitePickerSettings = { ...SITE, kinds: ['mono', 'poly'] };
    expect(withChoice(site, {}, 'kinds', ['poly', 'mono'])).toEqual({});
  });
});

describe('stored settings', () => {
  it('drop a kind the databank no longer lists, keeping the rest', () => {
    expect(StoredPickerPrefsSchema.parse({ group: 'name', kinds: ['mono', 'theremin'] })).toEqual({
      group: 'name',
      kinds: ['mono'],
    });
    expect(
      StoredSitePickerSettingsSchema.parse({
        ...FACTORY_PICKER,
        kinds: ['eurorack', 'poly', 'poly'],
      })
    ).toEqual({ ...FACTORY_PICKER, kinds: ['poly'] });
  });

  it('still refuse a choice that is not one', () => {
    expect(StoredPickerPrefsSchema.safeParse({ group: 'year' }).success).toBe(false);
  });
});
