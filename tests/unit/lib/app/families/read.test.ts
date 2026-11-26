/**
 * The synth families' read (`f-synth-families`): what `GET /api/v1/synths/families` and a synth's detail serve.
 *
 * The database is mocked (B9) with rows shaped as the read selects them; the definition registry is the real one, so
 * "served" means what it means on the synth page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFamilyOf, listFamilies } from '@/lib/app/families/read';
import { logger } from '@/lib/logging';

vi.mock('@/lib/db/client', () => ({
  prisma: { synthFamily: { findMany: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { prisma } = await import('@/lib/db/client');

const instrument = (id: string, maker: string, year: string) => ({ id, name: id, maker, year });
const member = (slug: string, synthId: string | null, listed = true) => ({
  slug,
  label: slug.toUpperCase(),
  synthId,
  differences: `What ${slug} changed.`,
  instrument: instrument(`i-${slug}`, 'Maker', '1981'),
  synth: synthId ? { listed } : null,
});
const tb303 = (
  members = [member('td-3', 'td-3'), member('tb-303', 'tb-303')],
  defaultMember = 'td-3'
) => ({
  id: 'tb-303',
  name: 'TB-303',
  defaultMember,
  members,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listFamilies', () => {
  it('serves each family with its members in the order the table gives them', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([tb303()] as never);

    expect(await listFamilies()).toEqual([
      {
        id: 'tb-303',
        name: 'TB-303',
        defaultMember: 'td-3',
        members: [
          {
            slug: 'td-3',
            label: 'TD-3',
            synthId: 'td-3',
            differences: 'What td-3 changed.',
            instrument: instrument('i-td-3', 'Maker', '1981'),
          },
          {
            slug: 'tb-303',
            label: 'TB-303',
            synthId: 'tb-303',
            differences: 'What tb-303 changed.',
            instrument: instrument('i-tb-303', 'Maker', '1981'),
          },
        ],
      },
    ]);
    expect(vi.mocked(prisma.synthFamily.findMany).mock.calls[0][0]).toMatchObject({
      select: { members: { orderBy: [{ order: 'asc' }, { slug: 'asc' }] } },
    });
  });

  it('serves an unmodelled member, with no synth', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([
      tb303([member('td-3', 'td-3'), member('tb-03', null)]),
    ] as never);

    const [family] = await listFamilies();

    expect(family.members.map((m) => [m.slug, m.synthId])).toEqual([
      ['td-3', 'td-3'],
      ['tb-03', null],
    ]);
  });

  it('leaves out a member whose synth is hidden or has no definition, as the catalogue does', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([
      tb303([
        member('td-3', 'td-3'),
        member('tb-303', 'tb-303', false),
        member('ghost', 'not-in-the-registry'),
        member('tb-03', null),
      ]),
    ] as never);

    const [family] = await listFamilies();

    expect(family.members.map((m) => m.slug)).toEqual(['td-3', 'tb-03']);
  });

  it('opens on the first modelled member served when the default is not served, and says so', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([
      tb303([member('td-3', 'td-3', false), member('tb-03', null), member('tb-303', 'tb-303')]),
    ] as never);

    const [family] = await listFamilies();

    expect(family.defaultMember).toBe('tb-303');
    expect(logger.debug).toHaveBeenCalledWith(
      'families: default member not served, opening on the first modelled member',
      { familyId: 'tb-303', defaultMember: 'td-3', opens: 'tb-303' }
    );
  });

  it('serves no family left with no modelled member, or with one member alone', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([
      tb303([member('td-3', 'td-3', false), member('tb-03', null), member('tb-01', null)]),
      { ...tb303([member('td-3', 'td-3'), member('tb-303', 'tb-303', false)]), id: 'alone' },
      { ...tb303(), id: 'whole' },
    ] as never);

    expect((await listFamilies()).map((f) => f.id)).toEqual(['whole']);
  });
});

describe('getFamilyOf', () => {
  it("serves the family a synth is a member of, looked up by the member's synth", async () => {
    vi.mocked(prisma.synthFamily.findFirst).mockResolvedValue(tb303() as never);

    const family = await getFamilyOf('tb-303');

    expect(family?.id).toBe('tb-303');
    expect(vi.mocked(prisma.synthFamily.findFirst).mock.calls[0][0]).toMatchObject({
      where: { members: { some: { synthId: 'tb-303' } } },
    });
  });

  it('is null for a synth in no family', async () => {
    vi.mocked(prisma.synthFamily.findFirst).mockResolvedValue(null);
    expect(await getFamilyOf('model-d')).toBeNull();
  });
});
