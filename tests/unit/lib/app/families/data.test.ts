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
import { readFileSync } from 'fs';
import { join } from 'path';
import { BankReferenceFileSchema } from '@/lib/app/bank/data';
import { BANK_DATA_DIR, loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { loadFamilyData } from '@/prisma/seeds/app-knowyoursynth/family-data';

const bank = loadBankData();
/** The reference list (b4), where every entry says where its facts were checked. */
const bankReference = BankReferenceFileSchema.parse(
  JSON.parse(readFileSync(join(BANK_DATA_DIR, 'reference.json'), 'utf8'))
).instruments;
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

describe('checkFamilies: a family that lists its originals (t-324)', () => {
  /** Behringer's System 55, after the Moog modular, beside Moog's own System 55, an original of its own. */
  const systems = (originals?: string[]): FamilyFile =>
    FamilyFileSchema.parse({
      id: 'moog-modular-systems',
      name: 'System 55',
      defaultMember: 'system-55',
      ...(originals ? { originals } : {}),
      members: [
        {
          slug: 'system-55',
          label: 'System 55',
          instrument: 'behringer-system-55',
          synth: 'system-55',
          differences: 'A copy.',
        },
        {
          slug: 'moog-system-55',
          label: 'Moog System 55',
          instrument: 'moog-system-55',
          differences: 'The original.',
        },
      ],
    });

  it('refuses members of two originals when the family lists none', () => {
    expect(checkFamilies([systems()], ctx)).toEqual([
      'family moog-modular-systems: its members trace back to different originals (moog-modular, moog-system-55)',
    ]);
  });

  it('passes them when it lists both', () => {
    expect(checkFamilies([systems(['moog-modular', 'moog-system-55'])], ctx)).toEqual([]);
  });

  it('refuses a member whose original it does not list', () => {
    expect(checkFamilies([systems(['moog-modular'])], ctx)).toEqual([
      "family moog-modular-systems: members trace back to moog-system-55, which the family's originals do not list",
    ]);
  });

  it("refuses an original that is missing, a recreation, no member's, or listed twice", () => {
    const problems = checkFamilies(
      [
        systems([
          'moog-modular',
          'moog-system-55',
          'moog-system-55',
          'no-such-synth',
          'behringer-td-3',
          'roland-tb-303',
        ]),
      ],
      ctx
    );
    expect(problems).toEqual([
      'family moog-modular-systems: an original is listed twice',
      'family moog-modular-systems: the databank has no instrument no-such-synth for an original',
      'family moog-modular-systems: original behringer-td-3 is a recreation of roland-tb-303, not an original',
      "family moog-modular-systems: original roland-tb-303 is no member's original",
    ]);
  });

  it('names a member whose instrument is missing once, not again as an original no member has', () => {
    const family = systems(['moog-modular', 'moog-system-55']);
    family.members[1].instrument = 'moog-system-56';
    expect(checkFamilies([family], ctx)).toEqual([
      'family moog-modular-systems, member moog-system-55: the databank has no instrument moog-system-56',
    ]);
  });

  it('still checks a modelled member against its own original', () => {
    // the System 55 synth is linked to the Moog modular, not to Moog's own System 55
    const family = systems(['moog-modular', 'moog-system-55']);
    family.members[1].synth = 'system-55';
    family.members[0].synth = undefined;
    family.defaultMember = 'moog-system-55';
    expect(checkFamilies([family], ctx)).toEqual([
      'family moog-modular-systems, member moog-system-55: synth system-55 is not linked in the databank to anything that traces back to moog-system-55',
    ]);
  });
});

describe('the committed family seed data', () => {
  const families = loadFamilyData();

  it('holds the three in-app pairs, the System 15 / 35 / 55 sizes and every researched family (t-324)', () => {
    expect(
      Object.fromEntries(families.map((f) => [f.id, f.members.map((m) => m.synth ?? null)]))
    ).toEqual({
      'arp-2600': ['b2600', null, null],
      cat: ['cat', null],
      'cs-80': ['cs-80', null, 'deckards-dream'],
      dfam: ['edge', 'dfam'],
      grandmother: ['model-15', 'grandmother'],
      'jupiter-8': ['jupiter-8', null],
      kobol: ['kobol', null],
      minimoog: ['model-d', null, null],
      'moog-modular-systems': ['system-15', 'system-35', 'system-55', null, null, null],
      'ms-20': ['k2', null],
      'music-easel': ['buchla-easel', null],
      'ob-xa': ['ub-xa-d', null],
      odyssey: ['behringer-odyssey', null, null, null],
      polivoks: ['polivoks', null],
      'pro-one': ['pro-1', null],
      'prophet-600': ['pro-800', null],
      'syncussion-sy-1': ['behringer-syncussion', 'pearl-syncussion'],
      'tb-303': ['td-3', 'tb-303', null],
      'two-voice': ['2-xm', null],
      wasp: ['wasp-deluxe', null],
    });
  });

  it('lists its originals only where the members do not share one: the CS-80 and the Deckard’s Dream, the Moog systems and the Odyssey revisions (t-324, t-338)', () => {
    expect(families.filter((f) => f.originals).map((f) => [f.id, f.originals])).toEqual([
      ['cs-80', ['yamaha-cs-80', 'black-corporation-deckards-dream']],
      [
        'moog-modular-systems',
        ['moog-modular', 'moog-model-15', 'moog-system-35', 'moog-system-55'],
      ],
      ['odyssey', ['arp-odyssey', 'arp-odyssey-mk-ii', 'arp-odyssey-mk-iii']],
    ]);
  });

  it('gives every member a differences text, and a source for every reference-list instrument a member is (t-324)', () => {
    const reference = new Set(bankReference.map((i) => i.id));
    for (const family of families)
      for (const member of family.members) {
        expect(member.differences.length, `${family.id}/${member.slug}`).toBeGreaterThan(40);
        if (reference.has(member.instrument))
          expect(
            bankReference.find((i) => i.id === member.instrument)?.source,
            `${family.id}/${member.slug}`
          ).toMatch(/^https:\/\//);
      }
  });

  it('labels an announced member as announced, in its label and its differences (t-324)', () => {
    const announced = families.flatMap((f) =>
      f.members.filter((m) => /announced/i.test(m.label)).map((m) => `${f.id}/${m.slug}`)
    );
    expect(announced).toEqual(['cs-80/ds-80', 'polivoks/behringer-polivoks']);
    for (const family of families)
      for (const m of family.members)
        if (/announced/i.test(m.label))
          expect(m.differences).toMatch(/^Announced, not yet on sale\./);
  });

  it('passes the check against the committed databank and the definition registry', () => {
    expect(families.length).toBeGreaterThan(0);
    expect(checkFamilies(families, ctx)).toEqual([]);
  });

  it('opens each family on the member most people are likely to own: the clone where it is modelled', () => {
    expect(Object.fromEntries(families.map((f) => [f.id, f.defaultMember]))).toEqual({
      'arp-2600': 'b2600',
      cat: 'cat',
      // the only modelled member: a family never opens on a blank panel
      'cs-80': 'cs-80',
      dfam: 'edge',
      grandmother: 'model-15',
      'jupiter-8': 'jupiter-8',
      kobol: 'kobol',
      minimoog: 'model-d',
      'moog-modular-systems': 'system-15',
      'ms-20': 'k2',
      'music-easel': 'buchla-easel',
      'ob-xa': 'ub-xa-d',
      odyssey: 'behringer-odyssey',
      polivoks: 'polivoks',
      'pro-one': 'pro-1',
      'prophet-600': 'pro-800',
      'syncussion-sy-1': 'behringer',
      'tb-303': 'td-3',
      'two-voice': '2-xm',
      wasp: 'wasp-deluxe',
    });
  });
});
