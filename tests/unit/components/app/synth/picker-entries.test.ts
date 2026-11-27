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

describe('pickerGroups, as the visitor chooses (t-329)', () => {
  const SYNTHS = [
    { ...FAMILY_SYNTHS[0], kind: 'mono' }, // Model D, Behringer 2018
    { ...FAMILY_SYNTHS[1], kind: 'mono' }, // TD-3, Behringer 2019
    { ...FAMILY_SYNTHS[2], kind: 'mono' }, // TB-303, Roland 1981
    { id: 'jp-8080', name: 'JP-8080', maker: 'Roland', year: 1998, heritage: '', kind: 'module' },
  ];
  const keys = (groups: ReturnType<typeof pickerGroups>) =>
    groups.map((g) => `${g.label}: ${g.rows.map((r) => r.key).join(', ')}`);

  it('lists one list with no heading by name, A to Z', () => {
    expect(keys(pickerGroups(SYNTHS, [], '', { unmodelled: true, group: 'name' }))).toEqual([
      ': jp-8080, model-d, tb-303, td-3',
    ]);
  });

  it('orders newest or oldest first, by name within a year', () => {
    const by = (order: 'new' | 'old') =>
      keys(pickerGroups(SYNTHS, [], '', { unmodelled: true, group: 'name', order }));
    expect(by('new')).toEqual([': td-3, model-d, jp-8080, tb-303']);
    expect(by('old')).toEqual([': tb-303, jp-8080, model-d, td-3']);
  });

  it('orders the rows within each maker as chosen, the makers still A to Z', () => {
    expect(keys(pickerGroups(SYNTHS, [], '', { unmodelled: true, order: 'old' }))).toEqual([
      'Behringer: model-d, td-3',
      'Roland: tb-303, jp-8080',
    ]);
  });

  it('lists only the kinds chosen, and a row with no kind only when none are', () => {
    expect(keys(pickerGroups(SYNTHS, [], '', { unmodelled: true, kinds: ['module'] }))).toEqual([
      'Roland: jp-8080',
    ]);
    const noKind = [...SYNTHS, { id: 'x', name: 'X', maker: 'Nobody', year: 1, heritage: '' }];
    expect(
      pickerGroups(noKind, [], '', { unmodelled: true, kinds: ['mono', 'module'] }).flatMap((g) =>
        g.rows.map((r) => r.key)
      )
    ).not.toContain('x');
  });

  it('by lineage, puts each family under its earliest member, the same brand a revision and another a recreation', () => {
    const [list] = pickerGroups(SYNTHS, [TB_303_FAMILY], '', {
      unmodelled: true,
      group: 'lineage',
    });
    expect(list.label).toBe('');
    expect(list.rows.map((r) => [r.key, r.depth, r.relation])).toEqual([
      ['jp-8080', 0, null],
      ['model-d', 0, null],
      ['tb-303', 0, null],
      ['member:tb-303/rebirth', 1, 'Recreation'],
      ['td-3', 1, 'Recreation'],
    ]);
  });

  it('by lineage, keeps the original over a member the box finds, though the original does not match', () => {
    const [list] = pickerGroups(SYNTHS, [TB_303_FAMILY], 'td-3', {
      unmodelled: true,
      group: 'lineage',
    });
    expect(list.rows.map((r) => [r.key, r.depth])).toEqual([
      ['tb-303', 0],
      ['td-3', 1],
    ]);
  });

  it('by lineage, calls a later member by the same brand a revision', () => {
    const roland = { ...SYNTHS[1], maker: 'Roland' };
    const [list] = pickerGroups([SYNTHS[2], roland], [TB_303_FAMILY], '', {
      unmodelled: false,
      group: 'lineage',
    });
    expect(list.rows.map((r) => [r.key, r.relation])).toEqual([
      ['tb-303', null],
      ['td-3', 'Revision'],
    ]);
  });
});

describe('pickerGroups with a row that has no year (t-329)', () => {
  const undated = { id: 'x', name: 'Undated', maker: 'Roland', year: 0, heritage: '' };
  const keys = (groups: ReturnType<typeof pickerGroups>) =>
    groups.flatMap((g) => g.rows.map((r) => r.key));

  it('reads a databank year written with more than the year', () => {
    const family = {
      ...TB_303_FAMILY,
      members: TB_303_FAMILY.members.map((m) =>
        m.synthId ? m : { ...m, instrument: { ...m.instrument, year: 'c. 1975' } }
      ),
    };
    // The unmodelled member, "c. 1975", sits between the 1981 TB-303 and nothing older: first, oldest first.
    expect(
      keys(
        pickerGroups(FAMILY_SYNTHS, [family], '', { unmodelled: true, group: 'name', order: 'old' })
      )
    ).toEqual(['member:tb-303/rebirth', 'tb-303', 'model-d', 'td-3']);
  });

  it('lists it after every dated row, newest or oldest first', () => {
    const synths = [...FAMILY_SYNTHS, undated];
    for (const order of ['new', 'old'] as const)
      expect(
        keys(pickerGroups(synths, [], '', { unmodelled: true, group: 'name', order })).at(-1)
      ).toBe('x');
  });

  it('does not make it a family’s original', () => {
    const family = {
      ...TB_303_FAMILY,
      members: TB_303_FAMILY.members.map((m) =>
        m.synthId ? m : { ...m, instrument: { ...m.instrument, year: '' } }
      ),
    };
    const [list] = pickerGroups(FAMILY_SYNTHS, [family], '', {
      unmodelled: true,
      group: 'lineage',
    });
    const first = list.rows.find((r) => r.family);
    expect(first?.key).toBe('tb-303');
    expect(list.rows.find((r) => r.key === 'member:tb-303/rebirth')?.depth).toBe(1);
  });
});

describe('pickerGroups marks an original listed only for its member (t-329)', () => {
  it('as context, and a matching one not', () => {
    const [found] = pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY], 'td-3', {
      unmodelled: true,
      group: 'lineage',
    });
    expect(found.rows.map((r) => [r.key, r.context ?? false])).toEqual([
      ['tb-303', true],
      ['td-3', false],
    ]);
    const [all] = pickerGroups(FAMILY_SYNTHS, [TB_303_FAMILY], '', {
      unmodelled: true,
      group: 'lineage',
    });
    expect(all.rows.every((r) => !r.context)).toBe(true);
  });
});

describe('every synth ever made (t-330)', () => {
  // The databank: the TB-303 (which the TB-303 synth models), the TD-3 (Behringer's copy, which the TD-3 models), the
  // Model D's original Minimoog, and two nobody has modelled: a copy of the Minimoog and an unrelated one.
  const BANK = [
    {
      id: 'roland-tb-303',
      name: 'Roland TB-303',
      maker: 'Roland',
      year: '1981',
      kind: 'mono',
      summary: 'Bass line',
      synths: ['tb-303'],
    },
    {
      id: 'behringer-td-3',
      name: 'Behringer TD-3',
      maker: 'Behringer',
      year: '2019',
      kind: 'mono',
      summary: 'A copy',
      synths: ['td-3'],
      recreationOf: 'roland-tb-303',
    },
    {
      id: 'moog-minimoog',
      name: 'Minimoog Model D',
      maker: 'Moog Music',
      year: '1970',
      kind: 'mono',
      summary: 'The original',
      synths: [],
    },
    {
      id: 'behringer-model-d',
      name: 'Behringer Model D',
      maker: 'Behringer',
      year: '2018',
      kind: 'mono',
      summary: 'The copy',
      synths: ['model-d'],
      recreationOf: 'moog-minimoog',
    },
    {
      id: 'studio-boomstar',
      name: 'Studio Electronics Boomstar',
      maker: 'Studio Electronics',
      year: '2014',
      kind: 'module',
      summary: 'A desktop mono',
      synths: [],
      recreationOf: 'moog-minimoog',
    },
    {
      id: 'unmodelled-303',
      name: 'Unmodelled',
      maker: 'Nobody',
      year: '1997',
      kind: 'mono',
      summary: 'Not modelled',
      synths: [],
    },
  ];
  const keys = (groups: ReturnType<typeof pickerGroups>) =>
    groups.flatMap((g) => g.rows.map((r) => r.key));

  it('adds each instrument nobody models as a row of its own, never one already listed', () => {
    const rows = pickerRows(FAMILY_SYNTHS, [TB_303_FAMILY], {
      unmodelled: true,
      bank: BANK,
      scope: 'all',
    });
    expect(rows.map((r) => r.key).sort()).toEqual(
      [
        'bank:moog-minimoog',
        'bank:studio-boomstar',
        'member:tb-303/rebirth',
        'model-d',
        'tb-303',
        'td-3',
      ].sort()
    );
    expect(rows.find((r) => r.key === 'bank:studio-boomstar')).toMatchObject({
      name: 'Boomstar',
      maker: 'Studio Electronics',
      kind: 'module',
      text: 'A desktop mono',
      synthId: null,
      family: null,
      instrumentId: 'studio-boomstar',
      recreationOf: 'moog-minimoog',
    });
  });

  it('puts a recreation of a synth’s second instrument under that synth, listing that instrument once', () => {
    const second = { ...BANK[5], id: 'roland-tb-303-reissue', synths: ['tb-303'] };
    const copy = { ...BANK[4], id: 'acid-box', recreationOf: 'roland-tb-303-reissue' };
    const bank = [...BANK, second, copy];
    const [list] = pickerGroups(FAMILY_SYNTHS, [], '', {
      unmodelled: true,
      bank,
      scope: 'all',
      group: 'lineage',
    });
    expect(list.rows.some((r) => r.key === 'bank:roland-tb-303-reissue')).toBe(false);
    const top = list.rows.findIndex((r) => r.key === 'tb-303');
    expect(list.rows[top].depth).toBe(0);
    expect(list.rows.find((r) => r.key === 'bank:acid-box')).toMatchObject({ depth: 1 });
    expect(list.rows.findIndex((r) => r.key === 'bank:acid-box')).toBeGreaterThan(top);
  });

  it('lists every other instrument even where no family member is listed', () => {
    const rows = pickerRows(FAMILY_SYNTHS, [TB_303_FAMILY], {
      unmodelled: false,
      bank: BANK,
      scope: 'all',
    });
    expect(rows.some((r) => r.key.startsWith('member:'))).toBe(false);
    expect(rows.map((r) => r.key)).toContain('bank:studio-boomstar');
  });

  it('lists only the synths that play without it, though the databank is read', () => {
    const rows = pickerRows(FAMILY_SYNTHS, [TB_303_FAMILY], { unmodelled: true, bank: BANK });
    expect(rows.some((r) => r.key.startsWith('bank:'))).toBe(false);
    // Each synth still learns its instrument, for lineage.
    expect(rows.find((r) => r.key === 'model-d')).toMatchObject({
      instrumentId: 'behringer-model-d',
      recreationOf: 'moog-minimoog',
    });
  });

  it('by lineage, puts what recreates an instrument under it, though no family says so', () => {
    const [list] = pickerGroups(FAMILY_SYNTHS, [], '', {
      unmodelled: true,
      bank: BANK,
      scope: 'all',
      group: 'lineage',
    });
    const at = (key: string) => list.rows.find((r) => r.key === key);
    expect(list.rows.findIndex((r) => r.key === 'bank:moog-minimoog')).toBeLessThan(
      list.rows.findIndex((r) => r.key === 'model-d')
    );
    expect(at('model-d')).toMatchObject({ depth: 1, relation: 'Recreation' });
    expect(at('bank:studio-boomstar')).toMatchObject({ depth: 1, relation: 'Recreation' });
    expect(at('td-3')).toMatchObject({ depth: 1 });
    expect(at('tb-303')).toMatchObject({ depth: 0 });
  });

  it('finds an instrument nobody models by name, maker or full databank name', () => {
    const find = (q: string) =>
      keys(pickerGroups(FAMILY_SYNTHS, [], q, { unmodelled: true, bank: BANK, scope: 'all' }));
    expect(find('boomstar')).toEqual(['bank:studio-boomstar']);
    expect(find('studio electronics')).toEqual(['bank:studio-boomstar']);
  });

  it('stops at an instrument that recreates itself in a loop rather than going round it', () => {
    const looped = [{ ...BANK[2], recreationOf: 'studio-boomstar' }, BANK[4]];
    const [list] = pickerGroups([], [], '', {
      unmodelled: true,
      bank: looped,
      scope: 'all',
      group: 'lineage',
    });
    expect(list.rows).toHaveLength(2);
  });

  it('puts a row that leads into a loop under the loop, not the loop under it', () => {
    // "aaa" recreates the Minimoog, which loops with the Boomstar: "aaa" sorts first, but is not in the loop.
    const lead = { ...BANK[5], id: 'aaa', recreationOf: 'moog-minimoog' };
    const looped = [{ ...BANK[2], recreationOf: 'studio-boomstar' }, BANK[4], lead];
    const [list] = pickerGroups([], [], '', {
      unmodelled: true,
      bank: looped,
      scope: 'all',
      group: 'lineage',
    });
    expect(list.rows.map((r) => [r.key, r.depth])).toEqual([
      ['bank:moog-minimoog', 0],
      ['bank:aaa', 1],
      ['bank:studio-boomstar', 1],
    ]);
  });
});
