/**
 * The synth families' seed (`f-synth-families`, `fp4`): checked first against the tables, idempotent, never writes an
 * admin's edit, sets a member's place once, never deletes, and leaves a synth another member has where it is.
 *
 * Over a small stateful fake of the two family tables and the two it reads (B9): the seed's properties are about what
 * it writes across runs, which a fake that keeps rows shows and a per-call mock does not.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FamilyDataError, seedFamilies } from '@/lib/app/families/seed';
import { FamilyFileSchema, type FamilyFile } from '@/lib/app/families/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';

type Row = Record<string, unknown>;

/** The two family tables, keyed as the seed looks them up, and the databank and catalogue rows it checks against. */
function fakeDb() {
  const families: Row[] = [];
  const members: Row[] = [];
  let next = 0;
  const memberBy = (where: Row) =>
    'synthId' in where
      ? members.find((m) => m.synthId === where.synthId)
      : members.find(
          (m) =>
            m.familyId === (where.familyId_slug as Row).familyId &&
            m.slug === (where.familyId_slug as Row).slug
        );
  const db = {
    families,
    members,
    bankInstrument: {
      findMany: vi.fn(async () => [
        {
          id: 'roland-tb-303',
          recreationOfId: null,
          synths: [{ synthId: 'tb-303' }, { synthId: 'td-3' }],
        },
        { id: 'behringer-td-3', recreationOfId: 'roland-tb-303', synths: [] },
        { id: 'roland-tb-03', recreationOfId: 'roland-tb-303', synths: [] },
        { id: 'korg-ms-20', recreationOfId: null, synths: [{ synthId: 'k2' }] },
      ]),
    },
    synth: { findMany: vi.fn(async () => [{ id: 'tb-303' }, { id: 'td-3' }, { id: 'k2' }]) },
    synthFamily: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const r = families.find((f) => f.id === where.id);
        return r ? { ...r } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        families.push({ editedAt: null, ...data });
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        Object.assign(families.find((f) => f.id === where.id) ?? {}, data);
      }),
    },
    synthFamilyMember: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const r = memberBy(where);
        return r ? { ...r } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        members
          .filter((m) =>
            where.editedAt === null ? m.editedAt === null && m.synthId !== null : m.editedAt != null
          )
          .map((m) => ({ ...m }))
      ),
      delete: vi.fn(async ({ where }: { where: Row }) => {
        members.splice(members.indexOf(memberBy(where) ?? {}), 1);
      }),
      aggregate: vi.fn(async ({ where }: { where: Row }) => {
        const orders = members
          .filter((m) => m.familyId === where.familyId)
          .map((m) => m.order as number);
        return { _max: { order: orders.length ? Math.max(...orders) : null } };
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        members.push({ id: `m${++next}`, editedAt: null, ...data });
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        Object.assign(memberBy(where) ?? {}, data);
      }),
    },
  };
  return db;
}

let db: ReturnType<typeof fakeDb>;
const client = () => db as unknown as TenancyClient;
const writes = () =>
  [
    db.synthFamily.create,
    db.synthFamily.update,
    db.synthFamilyMember.create,
    db.synthFamilyMember.update,
    db.synthFamilyMember.delete,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

const family = (): FamilyFile =>
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

beforeEach(() => {
  db = fakeDb();
});

describe('seedFamilies', () => {
  it('creates the family and its members in file order', async () => {
    const report = await seedFamilies(client(), [family()]);

    expect(report.families).toEqual({ created: 1, updated: 0, unchanged: 0, edited: 0 });
    expect(report.members).toEqual({ created: 2, updated: 0, unchanged: 0, edited: 0 });
    expect(db.families).toEqual([
      { id: 'tb-303', name: 'TB-303', defaultMember: 'td-3', editedAt: null },
    ]);
    expect(db.members.map((m) => [m.slug, m.synthId, m.instrumentId, m.order])).toEqual([
      ['td-3', 'td-3', 'behringer-td-3', 0],
      ['tb-303', 'tb-303', 'roland-tb-303', 1],
    ]);
  });

  it('writes nothing on a second run over the same data', async () => {
    await seedFamilies(client(), [family()]);
    const before = writes();
    expect(before).toBe(3);

    const report = await seedFamilies(client(), [family()]);

    expect(writes()).toBe(before);
    expect(report.families.unchanged).toBe(1);
    expect(report.members.unchanged).toBe(2);
  });

  it('updates a changed row, but never one an admin has edited', async () => {
    await seedFamilies(client(), [family()]);
    db.members[0].editedAt = new Date('2026-11-20');
    db.members[0].differences = "An admin's words.";

    const changed = family();
    changed.name = 'Roland TB-303';
    changed.members[0].differences = 'New seed words.';
    changed.members[1].differences = 'New seed words.';
    const report = await seedFamilies(client(), [changed]);

    expect(report.families.updated).toBe(1);
    expect(report.members).toMatchObject({ updated: 1, edited: 1 });
    expect(db.members[0].differences).toBe("An admin's words.");
    expect(db.members[1].differences).toBe('New seed words.');
    expect(db.families[0].name).toBe('Roland TB-303');
  });

  it("keeps an admin's reorder, and puts a new member after the last", async () => {
    await seedFamilies(client(), [family()]);
    db.members[0].order = 5;
    const more = family();
    more.members.unshift({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: 'Reissue.',
    });

    await seedFamilies(client(), [more]);

    expect(db.members.map((m) => [m.slug, m.order])).toEqual([
      ['td-3', 5],
      ['tb-303', 1],
      ['tb-03', 6],
    ]);
  });

  it('never deletes a member the data no longer has', async () => {
    await seedFamilies(client(), [family()]);
    const fewer = family();
    fewer.members = [fewer.members[0], { ...fewer.members[1], slug: 'roland', synth: undefined }];

    await seedFamilies(client(), [fewer]);

    expect(db.members.map((m) => m.slug)).toEqual(['td-3', 'tb-303', 'roland']);
  });

  it('leaves a synth another member already has where it is, and reports it', async () => {
    db.members.push({
      id: 'x',
      familyId: 'elsewhere',
      slug: 'moved',
      synthId: 'tb-303',
      editedAt: new Date(),
    });

    const report = await seedFamilies(client(), [family()]);

    expect(report.synthTaken).toEqual(['tb-303/tb-303']);
    const written = db.members.find((m) => m.familyId === 'tb-303' && m.slug === 'tb-303');
    expect(written?.synthId).toBeNull();
    expect(db.members.find((m) => m.id === 'x')?.synthId).toBe('tb-303');
  });

  it('moves a synth the data swaps between members, whichever member comes first', async () => {
    await seedFamilies(client(), [family()]);
    const swapped = family();
    swapped.defaultMember = 'tb-303';
    swapped.members = [
      { ...swapped.members[1], synth: 'td-3' },
      { ...swapped.members[0], synth: 'tb-303' },
    ];

    const report = await seedFamilies(client(), [swapped]);

    expect(report.synthTaken).toEqual([]);
    expect(report.members).toMatchObject({ updated: 2, unchanged: 0 });
    expect(db.members.map((m) => [m.slug, m.synthId])).toEqual([
      ['td-3', 'tb-303'],
      ['tb-303', 'td-3'],
    ]);
  });

  it('frees a synth the data takes from one member and gives to one listed before it', async () => {
    await seedFamilies(client(), [family()]);
    const moved = family();
    moved.defaultMember = 'tb-303';
    moved.members = [
      { ...moved.members[1], synth: 'td-3' },
      { ...moved.members[0], synth: undefined },
    ];

    const report = await seedFamilies(client(), [moved]);

    expect(report.synthTaken).toEqual([]);
    expect(report.members).toMatchObject({ updated: 2, unchanged: 0 });
    expect(db.members.map((m) => [m.slug, m.synthId])).toEqual([
      ['td-3', null],
      ['tb-303', 'td-3'],
    ]);
    expect(report.defaultWithoutSynth).toEqual([]);
  });

  it('replaces a member the data re-slugged: the synth moves and the old row goes', async () => {
    await seedFamilies(client(), [family()]);
    const renamed = family();
    renamed.members[0] = { ...renamed.members[0], slug: 'td3' };
    renamed.defaultMember = 'td3';

    const report = await seedFamilies(client(), [renamed]);

    expect(report.synthTaken).toEqual([]);
    expect(report.replaced).toEqual(['tb-303/td-3']);
    expect(db.members.map((m) => [m.slug, m.synthId])).toEqual([
      ['tb-303', 'tb-303'],
      ['td3', 'td-3'],
    ]);
  });

  it('never frees a synth for a member an admin edited, which the seed does not write', async () => {
    await seedFamilies(client(), [family()]);
    db.members.push({
      id: 'e',
      familyId: 'tb-303',
      slug: 'td3',
      synthId: null,
      editedAt: new Date(),
    });
    const moved = family();
    moved.members[0] = { ...moved.members[0], slug: 'td3' };
    moved.defaultMember = 'td3';

    const report = await seedFamilies(client(), [moved]);

    expect(report.replaced).toEqual([]);
    expect(db.members.find((m) => m.slug === 'td-3')?.synthId).toBe('td-3');
  });

  it('leaves the synth on a member the data dropped when the data gives it to no one', async () => {
    await seedFamilies(client(), [family()]);
    const fewer = family();
    fewer.members = [fewer.members[1], { ...fewer.members[0], slug: 'td3', synth: undefined }];
    fewer.defaultMember = 'tb-303';

    await seedFamilies(client(), [fewer]);

    expect(db.members.find((m) => m.slug === 'td-3')?.synthId).toBe('td-3');
  });

  it('reports a family whose default member is left without its synth', async () => {
    db.members.push({
      id: 'x',
      familyId: 'elsewhere',
      slug: 'moved',
      synthId: 'td-3',
      editedAt: new Date(),
    });

    const report = await seedFamilies(client(), [family()]);

    expect(report.synthTaken).toEqual(['tb-303/td-3']);
    expect(report.defaultWithoutSynth).toEqual(['tb-303']);
  });

  it('throws with every problem and writes nothing when a family does not fit the tables', async () => {
    const wrong = family();
    wrong.members.push({
      slug: 'k-2',
      label: 'K-2',
      instrument: 'korg-ms-20',
      synth: 'k2',
      differences: 'x',
    });

    const run = seedFamilies(client(), [wrong]);

    await expect(run).rejects.toBeInstanceOf(FamilyDataError);
    await expect(run).rejects.toMatchObject({
      problems: [
        'family tb-303: its members trace back to different originals (korg-ms-20, roland-tb-303)',
      ],
    });
    expect(writes()).toBe(0);
  });

  it('writes nothing and deletes nothing for an empty source', async () => {
    await seedFamilies(client(), [family()]);
    const report = await seedFamilies(client(), []);
    expect(report.families).toEqual({ created: 0, updated: 0, unchanged: 0, edited: 0 });
    expect(db.families).toHaveLength(1);
    expect(db.members).toHaveLength(2);
  });
});
