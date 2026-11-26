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
 * - **Never deletes.** A family or member the data no longer has stays, so an empty source cannot empty a table.
 * - **A synth already in another member stays there.** An admin may have moved a synth to another family; the seed
 *   leaves that member's synth unset rather than take the synth back, and reports it.
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

  const report: FamilySeedReport = { families: counts(), members: counts(), synthTaken: [] };
  for (const family of families) {
    await writeFamily(prisma, family, report.families);
    for (const member of family.members) await writeMember(prisma, family.id, member, report);
  }
  return report;
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
  report: FamilySeedReport
): Promise<void> {
  const tally = report.members;
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
      report.synthTaken.push(`${familyId}/${member.slug}`);
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
  )
    tally.unchanged++;
  else {
    await prisma.synthFamilyMember.update({ where: key, data });
    tally.updated++;
  }
}
