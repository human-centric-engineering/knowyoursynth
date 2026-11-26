/**
 * Write the synth families' seed data into their tables (`f-synth-families`, `fp4`).
 *
 * Called by the seed unit `prisma/seeds/app-knowyoursynth/007-families.ts`, after the catalogue and the databank,
 * whose synths and instruments a member names. The catalogue seed's properties, each tested:
 *
 * - **Checked before anything is written**, against the tables as they stand (`checkFamilies`): one problem anywhere
 *   and the seed throws with the whole list, having written nothing.
 * - **Idempotent.** A row whose columns already match is not written, so a re-run touches nothing.
 * - **Operator-owned once edited.** A family or member with `editedAt` set has been changed by an admin and is never
 *   written again.
 * - **Placement is set once.** A member's `order` is written when the row is created, after the family's last member,
 *   and never after: an admin's reorder stands.
 * - **Never deletes, but for a replaced member.** A family or member the data no longer has stays, so an empty source
 *   cannot empty a table. The one exception is an unedited member the data has dropped while giving its synth to
 *   another member (a re-slug, or a synth moved), which is deleted rather than left as a blank copy (`replaced`).
 * - **A synth moves with the data.** Before any member is written, every unedited member the data no longer gives
 *   its synth lets go of it, so a synth the data moves, swaps or re-slugs lands on its new member whatever their
 *   order. A synth is never freed for a member an admin has edited, which the seed will not write.
 * - **A synth already in another member stays there.** An admin may have moved a synth to another family; the seed
 *   leaves that member's synth unset rather than take the synth back, and reports it, and reports a family whose
 *   stored default member is left without a synth (the read then opens on another).
 *
 * Without a transaction, as the catalogue seed: each row is matched on its natural key (`id`, `familyId` + `slug`),
 * so a run that fails part way is completed by the next.
 */
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { checkFamilies, type FamilyFile, type FamilyInstrument } from '@/lib/app/families/data';

/** The data does not fit the tables. Nothing was written. */
export class FamilyDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`The family seed data has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'FamilyDataError';
  }
}

export interface FamilySeedCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Rows an admin has edited, left alone. */
  edited: number;
}

export interface FamilySeedReport {
  families: FamilySeedCounts;
  members: FamilySeedCounts;
  /** Members whose synth another member already has (`<family>/<slug>`), written without it. */
  synthTaken: string[];
  /** Families whose stored default member has no synth after the run. */
  defaultWithoutSynth: string[];
  /** Unedited members the data dropped and gave their synth to another member (`<family>/<slug>`), deleted. */
  replaced: string[];
}

const counts = (): FamilySeedCounts => ({ created: 0, updated: 0, unchanged: 0, edited: 0 });

/** Check the families against the tables as they stand, then write them. Throws `FamilyDataError` on any problem. */
export async function seedFamilies(
  prisma: TenancyClient,
  families: readonly FamilyFile[]
): Promise<FamilySeedReport> {
  const [instrumentRows, synthRows] = await Promise.all([
    prisma.bankInstrument.findMany({
      select: { id: true, recreationOfId: true, synths: { select: { synthId: true } } },
    }),
    prisma.synth.findMany({ select: { id: true } }),
  ]);
  const instruments = new Map<string, FamilyInstrument>(
    instrumentRows.map((i) => [
      i.id,
      { recreationOf: i.recreationOfId, synths: i.synths.map((s) => s.synthId) },
    ])
  );
  const problems = checkFamilies(families, {
    instruments,
    synths: new Set(synthRows.map((s) => s.id)),
  });
  if (problems.length) throw new FamilyDataError(problems);

  const report: FamilySeedReport = {
    families: counts(),
    members: counts(),
    synthTaken: [],
    defaultWithoutSynth: [],
    replaced: [],
  };
  const released = await releaseSynths(prisma, families, report);
  for (const family of families) {
    await writeFamily(prisma, family, report.families);
    for (const member of family.members)
      await writeMember(prisma, family.id, member, report, released);
    const stored = await prisma.synthFamily.findUnique({ where: { id: family.id } });
    const opens =
      stored &&
      (await prisma.synthFamilyMember.findUnique({
        where: { familyId_slug: { familyId: family.id, slug: stored.defaultMember } },
      }));
    if (!opens?.synthId) report.defaultWithoutSynth.push(family.id);
  }
  return report;
}

const memberKey = (familyId: string, slug: string) => `${familyId}/${slug}`;

/**
 * Free each synth the data gives a member, before any member is written, so it lands there whatever the order.
 *
 * - A stored, unedited member the data lists with another synth, or none, has its synth cleared.
 * - A stored, unedited member the data no longer lists, whose synth the data gives to a member that will be written
 *   (one not edited), has been replaced (re-slugged, or its synth moved), so it is deleted rather than left behind
 *   as a blank copy in the toggle. This is the one delete: it takes a row only when the data names its successor,
 *   so an empty or partial source still deletes nothing.
 *
 * Each cleared member is counted as updated here; returns their keys, so the write that follows does not count them
 * again.
 */
async function releaseSynths(
  prisma: TenancyClient,
  families: readonly FamilyFile[],
  report: FamilySeedReport
): Promise<Set<string>> {
  const edited = new Set(
    (
      await prisma.synthFamilyMember.findMany({
        where: { editedAt: { not: null } },
        select: { familyId: true, slug: true },
      })
    ).map((m) => memberKey(m.familyId, m.slug))
  );
  const listed = new Map<string, string | null>();
  const given = new Set<string>();
  for (const family of families)
    for (const member of family.members) {
      const at = memberKey(family.id, member.slug);
      listed.set(at, member.synth ?? null);
      if (member.synth && !edited.has(at)) given.add(member.synth);
    }

  const holders = await prisma.synthFamilyMember.findMany({
    where: { editedAt: null, synthId: { not: null } },
    select: { familyId: true, slug: true, synthId: true },
  });
  const released = new Set<string>();
  for (const row of holders) {
    const at = memberKey(row.familyId, row.slug);
    const where = { familyId_slug: { familyId: row.familyId, slug: row.slug } };
    const wanted = listed.get(at);
    if (wanted === undefined) {
      if (!row.synthId || !given.has(row.synthId)) continue;
      await prisma.synthFamilyMember.delete({ where });
      report.replaced.push(at);
    } else if (wanted !== row.synthId) {
      await prisma.synthFamilyMember.update({ where, data: { synthId: null } });
      released.add(at);
      report.members.updated++;
    }
  }
  return released;
}

async function writeFamily(
  prisma: TenancyClient,
  family: FamilyFile,
  tally: FamilySeedCounts
): Promise<void> {
  const data = { name: family.name, defaultMember: family.defaultMember };
  const row = await prisma.synthFamily.findUnique({ where: { id: family.id } });
  if (!row) {
    await prisma.synthFamily.create({ data: { id: family.id, ...data } });
    tally.created++;
  } else if (row.editedAt) tally.edited++;
  else if (row.name === data.name && row.defaultMember === data.defaultMember) tally.unchanged++;
  else {
    await prisma.synthFamily.update({ where: { id: family.id }, data });
    tally.updated++;
  }
}

async function writeMember(
  prisma: TenancyClient,
  familyId: string,
  member: FamilyFile['members'][number],
  report: FamilySeedReport,
  released: ReadonlySet<string>
): Promise<void> {
  const tally = report.members;
  const counted = released.has(memberKey(familyId, member.slug));
  const key = { familyId_slug: { familyId, slug: member.slug } };
  const row = await prisma.synthFamilyMember.findUnique({ where: key });
  if (row?.editedAt) {
    tally.edited++;
    return;
  }

  let synthId = member.synth ?? null;
  if (synthId) {
    const holder = await prisma.synthFamilyMember.findUnique({ where: { synthId } });
    if (holder && !(holder.familyId === familyId && holder.slug === member.slug)) {
      report.synthTaken.push(memberKey(familyId, member.slug));
      synthId = null;
    }
  }
  const data = {
    label: member.label,
    instrumentId: member.instrument,
    synthId,
    differences: member.differences,
  };

  if (!row) {
    const last = await prisma.synthFamilyMember.aggregate({
      where: { familyId },
      _max: { order: true },
    });
    await prisma.synthFamilyMember.create({
      data: { familyId, slug: member.slug, ...data, order: (last._max.order ?? -1) + 1 },
    });
    tally.created++;
  } else if (
    row.label === data.label &&
    row.instrumentId === data.instrumentId &&
    row.synthId === data.synthId &&
    row.differences === data.differences
  ) {
    if (!counted) tally.unchanged++;
  } else {
    await prisma.synthFamilyMember.update({ where: key, data });
    if (!counted) tally.updated++;
  }
}
