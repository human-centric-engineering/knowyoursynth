/**
 * Synth families (`f-synth-families`): the check every family passes before it is written, and the committed seed
 * data against the committed databank and the definition registry.
 *
 * The check is pure, so it runs over the real databank files: a family that only passes against a hand-made fixture
 * proves nothing about the data the seed will meet.
 */
import { describe, it, expect } from 'vitest';
import {
  checkFamilies,
  FamilyFileSchema,
  rootOf,
  type FamilyCheckContext,
  type FamilyFile,
  type FamilyInstrument,
} from '@/lib/app/families/data';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { loadFamilyData } from '@/prisma/seeds/app-knowyoursynth/family-data';

const bank = loadBankData();
const ctx: FamilyCheckContext = {
  instruments: new Map<string, FamilyInstrument>(
    bank.instruments.map((i) => [
      i.id,
      { recreationOf: i.recreationOf ?? null, synths: i.app ?? [] },
    ])
  ),
  synths: new Set(SYNTH_DEFS.map((d) => d.id)),
};

/** The TB-303 family as the seed data has it, to vary one thing at a time. */
const tb303 = (): FamilyFile =>
  FamilyFileSchema.parse({
    id: 'tb-303',
    name: 'TB-303',
    defaultMember: 'td-3',
    members: [
      {
        slug: 'td-3',
        label: 'TD-3',
        instrument: 'behringer-td-3',
        synth: 'td-3',
        differences: 'A copy.',
      },
      {
        slug: 'tb-303',
        label: 'TB-303',
        instrument: 'roland-tb-303',
        synth: 'tb-303',
        differences: 'The original.',
      },
    ],
  });

describe('rootOf', () => {
  it('follows the recreation chain to the original', () => {
    expect(rootOf('behringer-td-3', ctx.instruments)).toBe('roland-tb-303');
    expect(rootOf('roland-tb-303', ctx.instruments)).toBe('roland-tb-303');
  });

  it('is null for a chain that goes round in a circle or names a missing instrument', () => {
    const circle = new Map<string, FamilyInstrument>([
      ['a', { recreationOf: 'b', synths: [] }],
      ['b', { recreationOf: 'a', synths: [] }],
      ['c', { recreationOf: 'gone', synths: [] }],
    ]);
    expect(rootOf('a', circle)).toBeNull();
    expect(rootOf('c', circle)).toBeNull();
  });
});

describe('checkFamilies', () => {
  it('passes a family whose members trace back to one original', () => {
    expect(checkFamilies([tb303()], ctx)).toEqual([]);
  });

  it('passes an unmodelled member: an instrument with no synth', () => {
    const family = tb303();
    family.members.push({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: "Roland's own reissue.",
    });
    expect(checkFamilies([family], ctx)).toEqual([]);
  });

  it('refuses a member whose instrument traces back to a different original', () => {
    const family = tb303();
    family.members.push({
      slug: 'k-2',
      label: 'K-2',
      instrument: 'behringer-k-2',
      differences: 'Not a 303.',
    });
    expect(checkFamilies([family], ctx)).toEqual([
      'family tb-303: its members trace back to different originals (korg-ms-20, roland-tb-303)',
    ]);
  });

  it('refuses a modelled member whose synth the databank links to a different original', () => {
    const family = tb303();
    family.members[0].synth = 'k2';
    expect(checkFamilies([family], ctx)).toEqual([
      'family tb-303, member td-3: synth k2 is not linked in the databank to anything that traces back to roland-tb-303',
    ]);
  });

  it('refuses a default member that is not modelled, or not a member', () => {
    const unmodelled = tb303();
    unmodelled.members.push({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: 'x',
    });
    unmodelled.defaultMember = 'tb-03';
    const missing = { ...tb303(), defaultMember: 'nope' };
    expect(checkFamilies([unmodelled], ctx)).toEqual([
      'family tb-303: the default member tb-03 is not modelled',
    ]);
    expect(checkFamilies([missing], ctx)).toEqual([
      'family tb-303: the default member nope is not one of its members',
    ]);
  });

  it('refuses one member alone, a slug twice, an unknown instrument and an unknown synth', () => {
    const family = tb303();
    const [td3, tb] = family.members;
    expect(checkFamilies([{ ...family, members: [td3] }], ctx)).toEqual([
      'family tb-303: needs two members or more',
    ]);
    expect(checkFamilies([{ ...family, members: [td3, { ...tb, slug: 'td-3' }] }], ctx)).toContain(
      'family tb-303, member td-3: the slug is used twice in the family'
    );
    expect(
      checkFamilies([{ ...family, members: [td3, { ...tb, instrument: 'nothing-here' }] }], ctx)
    ).toEqual(['family tb-303, member tb-303: the databank has no instrument nothing-here']);
    expect(
      checkFamilies([{ ...family, members: [td3, { ...tb, synth: 'not-a-synth' }] }], ctx)
    ).toEqual(['family tb-303, member tb-303: there is no app synth not-a-synth']);
  });

  it('refuses a synth in two members, and a family id used twice', () => {
    const second = { ...tb303(), id: 'again' };
    expect(checkFamilies([tb303(), second], ctx)).toEqual([
      'family again, member td-3: synth td-3 is already a member (tb-303/td-3)',
      'family again, member tb-303: synth tb-303 is already a member (tb-303/tb-303)',
    ]);
    expect(checkFamilies([tb303(), tb303()], ctx)).toContain(
      'family tb-303: the id is used by another family'
    );
  });
});

describe('the committed family seed data', () => {
  const families = loadFamilyData();

  it('holds the three in-app pairs and the System 15 / 35 / 55 sizes', () => {
    expect(Object.fromEntries(families.map((f) => [f.id, f.members.map((m) => m.synth)]))).toEqual({
      grandmother: ['model-15', 'grandmother'],
      'moog-modular-systems': ['system-15', 'system-35', 'system-55'],
      'syncussion-sy-1': ['behringer-syncussion', 'pearl-syncussion'],
      'tb-303': ['td-3', 'tb-303'],
    });
  });

  it('passes the check against the committed databank and the definition registry', () => {
    expect(families.length).toBeGreaterThan(0);
    expect(checkFamilies(families, ctx)).toEqual([]);
  });

  it('opens each family on the clone, the member most people are likely to own', () => {
    expect(Object.fromEntries(families.map((f) => [f.id, f.defaultMember]))).toEqual({
      grandmother: 'model-15',
      'moog-modular-systems': 'system-15',
      'syncussion-sy-1': 'behringer',
      'tb-303': 'td-3',
    });
  });
});
