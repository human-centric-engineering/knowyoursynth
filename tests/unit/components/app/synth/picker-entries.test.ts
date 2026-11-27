/**
 * What the synth picker lists (`f-synth-picker` t-328): every synth and every unmodelled family member as a row of its
 * own, grouped by brand, found by name, maker, brand or family; and which member a family opens on.
 *
 * @see components/app/synth/picker-entries.ts
 */
import { describe, it, expect } from 'vitest';
import { familyOpens, pickerGroups, pickerRows } from '@/components/app/synth/picker-entries';
import { FAMILY_SYNTHS, TB_303_FAMILY } from '@/tests/helpers/synth-family';

/** Each group as `brand: row keys`, in the order listed. */
const listed = (groups: ReturnType<typeof pickerGroups>) =>
  groups.map((g) => `${g.label}: ${g.rows.map((r) => r.key).join(', ')}`);

describe('pickerGroups', () => {
  it('groups rows under their maker, makers A to Z and rows A to Z within each', () => {
    expect(listed(pickerGroups(FAMILY_SYNTHS, []))).toEqual([
      'Behringer: model-d, td-3',
      'Roland: tb-303',
    ]);
  });

  it('lists each family member as a row of its own, the unmodelled one under its own maker', () => {
    expect(listed(pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY]))).toEqual([
      'Behringer: model-d, td-3',
      'Nobody: member:tb-303/rebirth',
      'Roland: tb-303',
    ]);
  });

  it('joins the spellings of one brand under one group, each row keeping its own maker', () => {
    const synths = [
      { id: 'model-d', name: 'Model D', maker: 'Moog Music', year: 2016, heritage: '' },
      { id: 'grandmother', name: 'Grandmother', maker: 'Moog', year: 2018, heritage: '' },
      { id: 'pro-800', name: 'Pro-800', maker: 'Behringer', year: 2023, heritage: '' },
    ];
    const groups = pickerGroups(synths, []);
    expect(listed(groups)).toEqual(['Behringer: pro-800', 'Moog: grandmother, model-d']);
    expect(groups[1].rows.map((r) => r.maker)).toEqual(['Moog', 'Moog Music']);
  });

  it('finds a synth by its name, its maker or its brand', () => {
    expect(listed(pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY], 'td-3'))).toEqual([
      'Behringer: td-3',
    ]);
    expect(listed(pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY], 'roland'))).toEqual([
      'Roland: tb-303',
    ]);
    const moog = [{ id: 'm', name: 'Model 15', maker: 'Moog Music', year: 2015, heritage: '' }];
    expect(listed(pickerGroups(moog, [], 'moog'))).toEqual(['Moog: m']);
  });

  it('finds a row by its maker and name together, and by its full databank name', () => {
    const family = {
      ...TB_303_FAMILY,
      members: TB_303_FAMILY.members.map((m) =>
        m.synthId
          ? m
          : {
              ...m,
              instrument: {
                id: 'arp-odyssey',
                name: 'ARP Odyssey Mk II',
                maker: 'ARP Instruments',
                year: '1975',
                kind: 'mono',
              },
            }
      ),
    };
    const keys = (q: string) =>
      pickerGroups(FAMILY_SYNTHS, [family], q).flatMap((g) => g.rows.map((r) => r.key));
    // The row is "Odyssey Mk II" by ARP Instruments: neither field holds "arp odyssey" alone.
    expect(keys('arp odyssey')).toEqual(['member:tb-303/rebirth']);
    expect(keys('arp instruments odyssey')).toEqual(['member:tb-303/rebirth']);
    expect(keys('behringer td-3')).toEqual(['td-3']);
  });

  it('finds every member of a family by the family name', () => {
    const renamed = { ...TB_303_FAMILY, name: 'Acid bass line' };
    expect(listed(pickerGroups(FAMILY_SYNTHS, [renamed], 'acid'))).toEqual([
      'Behringer: td-3',
      'Nobody: member:tb-303/rebirth',
      'Roland: tb-303',
    ]);
  });

  it('finds nothing for a query nothing matches', () => {
    expect(pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY], 'zzz')).toEqual([]);
  });
});

describe('pickerRows', () => {
  it('gives a synth its name, maker, year, kind and heritage, and the family it belongs to', () => {
    const synths = [{ ...FAMILY_SYNTHS[1], kind: 'mono' }];
    const [td3] = pickerRows(synths, [TB_303_FAMILY]);
    expect(td3).toMatchObject({
      key: 'td-3',
      name: 'TD-3',
      maker: 'Behringer',
      year: '2019',
      kind: 'mono',
      text: 'A TB-303 copy',
      synthId: 'td-3',
    });
    expect(td3.family?.family.id).toBe('tb-303');
    expect(td3.family?.member.slug).toBe('td-3');
  });

  it("gives an unmodelled member its instrument's name without the maker, and its differences", () => {
    const family = {
      ...TB_303_FAMILY,
      members: TB_303_FAMILY.members.map((m) =>
        m.synthId
          ? m
          : {
              ...m,
              instrument: {
                id: 'arp-odyssey',
                name: 'ARP Odyssey Mk II',
                maker: 'ARP Instruments',
                year: '1975',
                kind: 'mono',
              },
            }
      ),
    };
    const row = pickerRows(FAMILY_SYNTHS, [family]).find((r) => !r.synthId);
    expect(row).toMatchObject({
      key: 'member:tb-303/rebirth',
      name: 'Odyssey Mk II',
      maker: 'ARP Instruments',
      year: '1975',
      kind: 'mono',
      text: 'Not modelled.',
      synthId: null,
    });
  });

  it("leaves out every unmodelled member when asked to, still knowing each synth's family", () => {
    const rows = pickerRows(FAMILY_SYNTHS, [TB_303_FAMILY], { unmodelled: false });
    expect(rows.map((r) => r.key)).toEqual(['model-d', 'td-3', 'tb-303']);
    expect(rows.find((r) => r.key === 'td-3')?.family?.family.id).toBe('tb-303');
  });

  it('leaves out the unmodelled members of a family whose modelled members the picker does not offer', () => {
    const onlyModelD = FAMILY_SYNTHS.filter((s) => s.id === 'model-d');
    expect(pickerRows(onlyModelD, [TB_303_FAMILY]).map((r) => r.key)).toEqual(['model-d']);
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
