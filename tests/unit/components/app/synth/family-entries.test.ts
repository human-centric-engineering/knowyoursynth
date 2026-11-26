/**
 * What the picker lists with families grouped, and which member a family opens on (`f-synth-families` t-320).
 *
 * @see components/app/synth/family-entries.ts
 */
import { describe, it, expect } from 'vitest';
import { familyOpens, pickerEntries } from '@/components/app/synth/family-entries';
import { FAMILY_SYNTHS, TB_303_FAMILY } from '@/tests/helpers/synth-family';

const names = (entries: ReturnType<typeof pickerEntries>) =>
  entries.map((e) => (e.kind === 'synth' ? e.synth.id : `family:${e.family.id}`));

describe('pickerEntries', () => {
  it('lists a family once, where its first member is, with its modelled members in toggle order', () => {
    const entries = pickerEntries(FAMILY_SYNTHS, [TB_303_FAMILY]);
    expect(names(entries)).toEqual(['model-d', 'family:tb-303']);
    const family = entries[1];
    expect(family.kind === 'family' && family.synths.map((s) => s.id)).toEqual(['td-3', 'tb-303']);
  });

  it('lists every synth alone with no families', () => {
    expect(names(pickerEntries(FAMILY_SYNTHS, []))).toEqual(['model-d', 'td-3', 'tb-303']);
  });

  it('finds a member by its own name, as itself rather than as its family', () => {
    expect(names(pickerEntries(FAMILY_SYNTHS, [TB_303_FAMILY], 'td-3'))).toEqual(['td-3']);
    expect(names(pickerEntries(FAMILY_SYNTHS, [TB_303_FAMILY], 'roland'))).toEqual(['tb-303']);
  });

  it('finds a family by its name when no member matches on its own', () => {
    const renamed = { ...TB_303_FAMILY, name: 'Acid bass line' };
    expect(names(pickerEntries(FAMILY_SYNTHS, [renamed], 'acid'))).toEqual(['family:tb-303']);
  });

  it('finds nothing for a query nothing matches', () => {
    expect(pickerEntries(FAMILY_SYNTHS, [TB_303_FAMILY], 'zzz')).toEqual([]);
  });
});

describe('familyOpens', () => {
  const offered = FAMILY_SYNTHS.filter((s) => s.id !== 'model-d');

  it('opens on the member the user owns', () => {
    expect(familyOpens(TB_303_FAMILY, offered, new Set(['roland-tb-303']))).toBe('tb-303');
  });

  it('opens on the default member for a user who owns none of them', () => {
    expect(familyOpens(TB_303_FAMILY, offered, new Set(['moog-model-d']))).toBe('td-3');
    expect(familyOpens(TB_303_FAMILY, offered, new Set())).toBe('td-3');
  });

  it('ignores an owned member the picker does not offer', () => {
    const onlyTd3 = offered.filter((s) => s.id === 'td-3');
    expect(familyOpens(TB_303_FAMILY, onlyTd3, new Set(['roland-tb-303']))).toBe('td-3');
  });

  it('opens on the first offered member when the default is not offered', () => {
    const onlyTb303 = offered.filter((s) => s.id === 'tb-303');
    expect(familyOpens(TB_303_FAMILY, onlyTb303, new Set())).toBe('tb-303');
  });
});
