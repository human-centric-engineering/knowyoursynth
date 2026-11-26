/**
 * Family map check tests (t-319): the check `check:synths` runs over every family's map. It passes the shipped maps,
 * and fails a map that names a control a member lacks, a family with no map, a map that loses a value on the way
 * back, and a reason given for nothing.
 *
 * @see lib/app/synths/families/check.ts
 */
import { describe, expect, it } from 'vitest';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import { checkFamilyMaps } from '@/lib/app/synths/families/check';
import { FAMILY_MAPS } from '@/lib/app/synths/families/maps';
import { TB_303_FAMILY } from '@/lib/app/synths/families/tb-303';
import type { FamilyMap } from '@/lib/app/synths/families/translate';
import type { FamilyFile } from '@/lib/app/families/data';
import { loadFamilyData } from '@/prisma/seeds/app-knowyoursynth/family-data';

const FAMILIES = loadFamilyData();
const TB_FAMILY: FamilyFile[] = FAMILIES.filter((f) => f.id === 'tb-303');

/** The TB-303 family's map with its TD-3 → TB-303 link changed. */
const withTdLink = (change: Partial<FamilyMap['links'][number]>): FamilyMap[] => [
  {
    family: 'tb-303',
    links: TB_303_FAMILY.links.map((l) => (l.from === 'td-3' ? { ...l, ...change } : l)),
  },
];

describe('checkFamilyMaps', () => {
  it('passes the shipped maps against the seeded families', () => {
    expect(checkFamilyMaps(FAMILY_MAPS, SYNTH_DEFS, FAMILIES)).toEqual([]);
  });

  it('fails a map that names a control a member lacks', () => {
    const maps = withTdLink({ controls: { 'osc.tune': { to: 'osc.detune' } } });

    expect(checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → tb-303: carries osc.tune to osc.detune, which the TB-303 lacks',
    ]);
  });

  it('fails a map that names a control or jack on the side it comes from that is not there', () => {
    const maps = withTdLink({
      controls: { 'osc.tune': { to: 'osc.tuning' }, 'dist.mix': {} },
      jacks: { 'j.cvOut': 'j.cv', 'j.clockIn': 'j.sync' },
    });

    expect(checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → tb-303: names control dist.mix, which the TD-3 lacks',
      'td-3 → tb-303: names jack j.clockIn, which the TD-3 lacks',
    ]);
  });

  it('fails an option rename to an option the other member lacks', () => {
    const families = FAMILIES.filter((f) => f.id === 'grandmother');
    const maps: FamilyMap[] = FAMILY_MAPS.filter((m) => m.family === 'grandmother').map((m) => ({
      ...m,
      links: m.links.map((l) =>
        l.from === 'grandmother'
          ? { ...l, controls: { ...l.controls, 'arp.dir': { options: { fb: 'fwd' } } } }
          : l
      ),
    }));

    expect(checkFamilyMaps(maps, SYNTH_DEFS, families)).toEqual([
      'grandmother → model-15: arp.dir has no option fwd on the Model 15',
    ]);
  });

  it('fails a reason given for something that carries', () => {
    const maps = withTdLink({ lacks: { 'dist.*': 'x', 'filter.*': 'The TB-303 has no filter' } });

    expect(checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → tb-303: gives a reason for filter.*, which names nothing the TD-3 has and the TB-303 lacks',
    ]);
  });

  it('fails a family with no map between two of its modelled members', () => {
    const maps: FamilyMap[] = [
      { family: 'tb-303', links: TB_303_FAMILY.links.filter((l) => l.from === 'td-3') },
    ];

    const problems = checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY);

    expect(problems).toContain('family tb-303: no map from tb-303 to td-3');
    // and the way back, with no map, loses the renamed TUNE
    expect(problems.filter((p) => p.startsWith('family '))).toHaveLength(1);
  });

  it('fails a map whose way back loses a value that went across', () => {
    // TUNE carries to TUNING, but nothing carries TUNING back to TUNE
    const maps: FamilyMap[] = [
      {
        family: 'tb-303',
        links: TB_303_FAMILY.links.map((l) =>
          l.from === 'tb-303' ? { ...l, controls: {}, lacks: {} } : l
        ),
      },
    ];
    const problems = checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY);

    expect(problems).toContain(
      'td-3 → tb-303 → td-3, init: osc.tune went across as 0 and came back as undefined'
    );
    expect(problems.every((p) => /osc\.tun/.test(p))).toBe(true);
  });

  it('fails a rename that lands on an id the member it comes from carries as itself', () => {
    // the TD-3's own j.phones already carries as j.phones
    const maps = withTdLink({ jacks: { 'j.cvOut': 'j.phones', 'j.gateOut': 'j.gate' } });

    expect(checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → tb-303: j.cvOut and j.phones both carry to jack j.phones',
    ]);
  });

  it('fails a drop condition on an option the control lacks', () => {
    const families = FAMILIES.filter((f) => f.id === 'grandmother');
    const maps: FamilyMap[] = FAMILY_MAPS.filter((m) => m.family === 'grandmother').map((m) => ({
      ...m,
      links: m.links.map((l) =>
        l.from === 'model-15'
          ? {
              ...l,
              controls: {
                ...l.controls,
                'mix.3': {
                  to: 'mix.noise',
                  dropWhen: { when: { id: 'osc2.wave', in: ['saw+subb'] }, reason: 'x' },
                },
              },
            }
          : l
      ),
    }));

    expect(checkFamilyMaps(maps, SYNTH_DEFS, families)).toEqual([
      'model-15 → grandmother: mix.3 drops on osc2.wave saw+subb, which is no setting of it',
    ]);
  });

  it('fails a jack rename the way back does not undo, though no sound patches it', () => {
    const maps = withTdLink({ jacks: { 'j.cvOut': 'j.cv', 'j.gateOut': 'j.cv' } });
    const problems = checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY);

    expect(problems).toContain('td-3 → tb-303: j.cvOut and j.gateOut both carry to jack j.cv');
    const swapped: FamilyMap[] = [
      {
        family: 'tb-303',
        links: TB_303_FAMILY.links.map((l) =>
          l.from === 'tb-303' ? { ...l, jacks: { 'j.cv': 'j.gateOut', 'j.gate': 'j.cvOut' } } : l
        ),
      },
    ];

    expect(checkFamilyMaps(swapped, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → tb-303 → td-3: jack j.cvOut goes across as j.cv and comes back as j.gateOut',
      'td-3 → tb-303 → td-3: jack j.gateOut goes across as j.gate and comes back as j.cvOut',
      'tb-303 → td-3 → tb-303: jack j.cv goes across as j.gateOut and comes back as j.gate',
      'tb-303 → td-3 → tb-303: jack j.gate goes across as j.cvOut and comes back as j.cv',
    ]);
  });

  it('fails a seeded member with no definition', () => {
    const defs = SYNTH_DEFS.filter((d) => d.id !== 'tb-303');

    expect(checkFamilyMaps([], defs, TB_FAMILY)).toEqual([
      'family tb-303: no map from td-3 to tb-303',
      'family tb-303: no map from tb-303 to td-3',
    ]);
    expect(
      checkFamilyMaps(
        FAMILY_MAPS.filter((m) => m.family === 'tb-303'),
        defs,
        TB_FAMILY
      )
    ).toEqual([
      'td-3 → tb-303: no definition for tb-303',
      'tb-303 → td-3: no definition for tb-303',
    ]);
  });

  it('fails a map for a family the seed data does not hold, or a link outside its family', () => {
    const maps: FamilyMap[] = [
      { family: 'tb-303', links: [{ from: 'td-3', to: 'model-15' }] },
      { family: 'mc-202', links: [] },
    ];

    expect(checkFamilyMaps(maps, SYNTH_DEFS, TB_FAMILY)).toEqual([
      'td-3 → model-15: not two members of tb-303',
      'map mc-202: no family has that id',
    ]);
  });
});
