/**
 * Unit Tests: the synth family admin API (`f-synth-families` t-323).
 *
 * Real routes, real `withAdminAuth`, the real `lib/app/families/edit.ts` and the real `checkFamilies`, over a small
 * stateful fake of the two family tables and the databank and catalogue rows the check reads. Pins:
 *
 * - every route is admin only;
 * - input is validated, and a member whose instrument traces back to another original is refused, naming it, with
 *   nothing written;
 * - a create, a whole-family save (adding, reordering and removing members, moving the default) and a delete each
 *   write what they say, stamp `editedAt` on every row they write, and are audited; an unchanged save of a seed
 *   family claims it from the seed, audited, and one of an edited family writes and audits nothing;
 * - two creates of one id meet on the primary key, and the second is a 409.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

type Row = Record<string, unknown>;

/** The family tables as rows, and the databank's TB-303 line and the MS-20 beside it. */
const tables = vi.hoisted(() => ({
  families: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
}));

const mockPrisma = vi.hoisted(() => {
  const { families, members } = tables;
  const membersOf = (familyId: unknown) =>
    members
      .filter((m) => m.familyId === familyId)
      .sort((a, b) => (a.order as number) - (b.order as number))
      .map((m) => ({ ...m }));
  const withMembers = (f: Record<string, unknown>) => ({ ...f, members: membersOf(f.id) });
  const memberAt = (where: Record<string, Record<string, unknown>>) =>
    members.find(
      (m) => m.familyId === where.familyId_slug.familyId && m.slug === where.familyId_slug.slug
    );
  const client = {
    $queryRaw: vi.fn(async () => []),
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
      findMany: vi.fn(async () => families.map(withMembers)),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const f = families.find((r) => r.id === where.id);
        return f ? withMembers(f) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const f = families.find((r) => r.id === where.id);
        if (!f) throw new Error('not found');
        return withMembers(f);
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (families.some((r) => r.id === data.id))
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        families.push({ ...data });
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const f = families.find((r) => r.id === where.id);
          if (!f) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
          Object.assign(f, data);
        }
      ),
      delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        families.splice(
          families.findIndex((r) => r.id === where.id),
          1
        );
        for (let i = members.length - 1; i >= 0; i--)
          if (members[i].familyId === where.id) members.splice(i, 1);
      }),
    },
    synthFamilyMember: {
      deleteMany: vi.fn(
        async ({ where }: { where: { familyId: string; slug: { notIn: string[] } } }) => {
          for (let i = members.length - 1; i >= 0; i--)
            if (
              members[i].familyId === where.familyId &&
              !where.slug.notIn.includes(members[i].slug as string)
            )
              members.splice(i, 1);
        }
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { familyId: string }; data: Record<string, unknown> }) => {
          for (const m of members) if (m.familyId === where.familyId) Object.assign(m, data);
        }
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: Record<string, Record<string, unknown>>;
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const m = memberAt(where);
          if (m) Object.assign(m, update);
          else members.push({ ...create });
        }
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
  };
  return client;
});
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLogAdminAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/audit/admin-audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/audit/admin-audit-logger')>()),
  logAdminAction: mockLogAdminAction,
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET as getList, POST as postFamily } from '@/app/api/v1/admin/synths/families/route';
import {
  DELETE as deleteFamily,
  GET as getFamily,
  PUT as putFamily,
} from '@/app/api/v1/admin/synths/families/[id]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost/api/v1/admin/synths/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row & { members?: Row[] };
    error?: { code: string; message: string; details?: { errors?: Row[] } };
  };
}

/** Writes to the family tables since the last reset. */
const writes = () =>
  [
    mockPrisma.synthFamily.create,
    mockPrisma.synthFamily.update,
    mockPrisma.synthFamily.delete,
    mockPrisma.synthFamilyMember.deleteMany,
    mockPrisma.synthFamilyMember.updateMany,
    mockPrisma.synthFamilyMember.upsert,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

interface Member {
  slug: string;
  label: string;
  instrument: string;
  synth?: string;
  differences: string;
}

const tb303 = (): { name: string; defaultMember: string; members: Member[] } => ({
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

/** A family as the seed leaves it: no `editedAt`. */
function seeded() {
  const f = tb303();
  tables.families.push({
    id: 'tb-303',
    name: f.name,
    defaultMember: f.defaultMember,
    // the column's default: a family that shares one original lists none
    originals: [],
    editedAt: null,
  });
  f.members.forEach((m, order) =>
    tables.members.push({
      familyId: 'tb-303',
      slug: m.slug,
      label: m.label,
      instrumentId: m.instrument,
      synthId: m.synth,
      differences: m.differences,
      order,
      editedAt: null,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tables.families.length = 0;
  tables.members.length = 0;
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on reads and writes, and writes nothing', async () => {
    seeded();
    mockGetSession.mockResolvedValue(session('USER'));

    const responses = [
      await getList(request('GET', 'families')),
      await postFamily(request('POST', 'families', { id: 'x', ...tb303() })),
      await getFamily(request('GET', 'families/tb-303'), ctx('tb-303')),
      await putFamily(request('PUT', 'families/tb-303', tb303()), ctx('tb-303')),
      await deleteFamily(request('DELETE', 'families/tb-303'), ctx('tb-303')),
    ];

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('POST /families', () => {
  it('creates the family with every row edited, and audits it', async () => {
    const res = await postFamily(request('POST', 'families', { id: 'tb-303', ...tb303() }));

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data?.members?.map((m) => m.slug)).toEqual(['td-3', 'tb-303']);
    expect(tables.families[0].editedAt).toBeInstanceOf(Date);
    expect(tables.members.map((m) => [m.slug, m.order, m.editedAt instanceof Date])).toEqual([
      ['td-3', 0, true],
      ['tb-303', 1, true],
    ]);
    expect(mockLogAdminAction).toHaveBeenCalledOnce();
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth_family.create',
      entityType: 'synth_family',
      entityId: 'tb-303',
      changes: { name: { from: undefined, to: 'TB-303' } },
    });
  });

  it('refuses a member whose instrument traces back to another original, naming it, and writes nothing', async () => {
    const family = tb303();
    family.members.push({
      slug: 'ms-20',
      label: 'MS-20',
      instrument: 'korg-ms-20',
      synth: 'k2',
      differences: 'Not a TB-303.',
    });

    const res = await postFamily(request('POST', 'families', { id: 'tb-303', ...family }));

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors?.map((e) => e.message)).toEqual([
      'family tb-303: its members trace back to different originals (korg-ms-20, roland-tb-303)',
    ]);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('saves a family whose members trace back to the originals it lists, and stores the list (t-324)', async () => {
    const family = tb303();
    family.members.push({
      slug: 'ms-20',
      label: 'MS-20',
      instrument: 'korg-ms-20',
      synth: 'k2',
      differences: 'Another original, brought in by name.',
    });

    const res = await postFamily(
      request('POST', 'families', {
        id: 'tb-303',
        ...family,
        originals: ['roland-tb-303', 'korg-ms-20'],
      })
    );

    expect(res.status).toBe(201);
    expect(tables.families[0].originals).toEqual(['roland-tb-303', 'korg-ms-20']);
    const body = await json(res);
    expect(body.data).toMatchObject({ originals: ['roland-tb-303', 'korg-ms-20'] });
  });

  it('refuses a listed original no member traces back to, naming it, and writes nothing (t-324)', async () => {
    const res = await postFamily(
      request('POST', 'families', {
        id: 'tb-303',
        ...tb303(),
        originals: ['roland-tb-303', 'korg-ms-20'],
      })
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors?.map((e) => e.message)).toEqual([
      "family tb-303: original korg-ms-20 is no member's original",
    ]);
    expect(writes()).toBe(0);
  });

  it('refuses input that fails the schema, naming the field', async () => {
    const family = tb303();
    family.members[0].slug = 'Not A Slug';

    const res = await postFamily(request('POST', 'families', { id: 'tb-303', ...family }));

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors?.map((e) => e.path)).toEqual(['members.0.slug']);
    expect(writes()).toBe(0);
  });

  it('refuses the id new, which the create page has', async () => {
    const res = await postFamily(request('POST', 'families', { id: 'new', ...tb303() }));

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors).toEqual([
      expect.objectContaining({ path: 'id', message: 'The id new is kept for the admin pages' }),
    ]);
    expect(writes()).toBe(0);
  });

  it('refuses an id that is taken with 409', async () => {
    seeded();
    const res = await postFamily(request('POST', 'families', { id: 'tb-303', ...tb303() }));
    expect(res.status).toBe(409);
    expect(writes()).toBe(0);
  });

  it('answers 409, overwriting nothing, when another create takes the id first', async () => {
    seeded();
    // The other create commits after this one looked: the lookup misses it, the insert meets its key.
    mockPrisma.synthFamily.findUnique.mockResolvedValueOnce(null);
    const family = tb303();
    family.name = 'Mine';

    const res = await postFamily(request('POST', 'families', { id: 'tb-303', ...family }));

    expect(res.status).toBe(409);
    expect(tables.families[0].name).toBe('TB-303');
    expect(mockPrisma.synthFamilyMember.deleteMany).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a synth another family already has', async () => {
    seeded();
    const res = await postFamily(
      request('POST', 'families', {
        id: 'tb-03',
        name: 'TB-03',
        defaultMember: 'td-3',
        members: [
          { slug: 'tb-03', label: 'TB-03', instrument: 'roland-tb-03', differences: 'Reissue.' },
          {
            slug: 'td-3',
            label: 'TD-3',
            instrument: 'behringer-td-3',
            synth: 'td-3',
            differences: 'A copy.',
          },
        ],
      })
    );

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors?.map((e) => e.message)).toEqual([
      'family tb-03, member td-3: synth td-3 is already a member (tb-303/td-3)',
    ]);
    expect(writes()).toBe(0);
  });
});

describe('PUT /families/:id', () => {
  it('adds an unmodelled member, reorders, moves the default, and stamps every row', async () => {
    seeded();
    const family = tb303();
    family.members.reverse();
    family.members.push({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: 'Reissue with delay.',
    });
    family.defaultMember = 'tb-303';

    const res = await putFamily(request('PUT', 'families/tb-303', family), ctx('tb-303'));

    expect(res.status).toBe(200);
    expect(tables.families[0]).toMatchObject({ defaultMember: 'tb-303' });
    expect(tables.families[0].editedAt).toBeInstanceOf(Date);
    expect(
      tables.members
        .sort((a, b) => (a.order as number) - (b.order as number))
        .map((m) => [m.slug, m.order, m.synthId, m.editedAt instanceof Date])
    ).toEqual([
      ['tb-303', 0, 'tb-303', true],
      ['td-3', 1, 'td-3', true],
      ['tb-03', 2, null, true],
    ]);
    expect(mockLogAdminAction).toHaveBeenCalledOnce();
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth_family.update',
      entityId: 'tb-303',
      changes: { defaultMember: { from: 'td-3', to: 'tb-303' } },
    });
  });

  it('removes a member the save leaves out', async () => {
    seeded();
    const family = tb303();
    family.members.push({
      slug: 'tb-03',
      label: 'TB-03',
      instrument: 'roland-tb-03',
      differences: 'Reissue.',
    });
    await putFamily(request('PUT', 'families/tb-303', family), ctx('tb-303'));

    const res = await putFamily(request('PUT', 'families/tb-303', tb303()), ctx('tb-303'));

    expect(res.status).toBe(200);
    expect(tables.members.map((m) => m.slug).sort()).toEqual(['tb-303', 'td-3']);
  });

  it('claims an unchanged seed family from the seed, and audits the claim', async () => {
    seeded();
    const res = await putFamily(request('PUT', 'families/tb-303', tb303()), ctx('tb-303'));

    expect(res.status).toBe(200);
    expect(tables.families[0].editedAt).toBeInstanceOf(Date);
    expect(tables.members.every((m) => m.editedAt instanceof Date)).toBe(true);
    expect(mockLogAdminAction).toHaveBeenCalledOnce();
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth_family.update',
      changes: { seedWrites: { from: true, to: false } },
    });
  });

  it('writes and audits nothing when an edited family is saved unchanged', async () => {
    seeded();
    await putFamily(request('PUT', 'families/tb-303', tb303()), ctx('tb-303'));
    vi.clearAllMocks();

    const res = await putFamily(request('PUT', 'families/tb-303', tb303()), ctx('tb-303'));

    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a default member that is not modelled', async () => {
    seeded();
    const family = tb303();
    delete family.members[0].synth;
    const res = await putFamily(request('PUT', 'families/tb-303', family), ctx('tb-303'));

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.details?.errors?.map((e) => e.message)).toEqual([
      'family tb-303: the default member td-3 is not modelled',
    ]);
    expect(writes()).toBe(0);
  });

  it('is 404 for a family that is not stored', async () => {
    const res = await putFamily(request('PUT', 'families/nope', tb303()), ctx('nope'));
    expect(res.status).toBe(404);
    expect(writes()).toBe(0);
  });
});

describe('DELETE /families/:id', () => {
  it('removes the family and its members, and audits it', async () => {
    seeded();

    const res = await deleteFamily(request('DELETE', 'families/tb-303'), ctx('tb-303'));

    expect(res.status).toBe(200);
    expect(tables.families).toEqual([]);
    expect(tables.members).toEqual([]);
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth_family.delete',
      entityId: 'tb-303',
      changes: { name: { from: 'TB-303', to: undefined } },
    });
  });

  it('is 404 for a family that is not stored', async () => {
    const res = await deleteFamily(request('DELETE', 'families/nope'), ctx('nope'));
    expect(res.status).toBe(404);
  });
});

describe('GET', () => {
  it('lists the stored families in the seed file shape, and reads one', async () => {
    seeded();

    const list = await json(await getList(request('GET', 'families')));
    const one = await json(await getFamily(request('GET', 'families/tb-303'), ctx('tb-303')));

    expect(list.data).toEqual([{ id: 'tb-303', ...tb303(), editedAt: null }]);
    expect(one.data).toEqual({ id: 'tb-303', ...tb303(), editedAt: null });
  });

  it('is 404 for a family that is not stored', async () => {
    const res = await getFamily(request('GET', 'families/nope'), ctx('nope'));
    expect(res.status).toBe(404);
  });
});
