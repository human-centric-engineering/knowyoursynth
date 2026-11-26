/**
 * Admin edits to the synth families (`f-synth-families` t-323): create a family, save it whole, delete it. See
 * `.context/app/synth-families.md`.
 *
 * The rules, each tested:
 *
 * - **Saved whole.** A save sends the family as its seed file holds it (`FamilyFileSchema`): its name, its default
 *   member, the originals it brings together (none: one shared original) and its members in toggle order. A member the save leaves out is removed, and the members' order is the
 *   order sent.
 * - **Checked as the seed checks.** The family goes through `checkFamilies` against the databank and the catalogue as
 *   they stand, beside every other stored family, so a member whose instrument traces back to another original, or a
 *   synth already in another family, is refused, naming the problem. Another family's own problems never block it.
 * - **An edit is the admin's.** A save stamps `editedAt` on the family and on every member it keeps, and the seed then
 *   writes none of them again, nor puts back a member the admin removed (`lib/app/families/seed.ts`).
 * - **A delete is not remembered.** Deleting a family removes it and its members. If the seed data still has the
 *   family, the next seed creates it again, as it would any row it has not got: take it out of the data as well.
 *
 * Each write returns the family before and after, for the route to audit. Every write holds the stored families'
 * rows until it ends, so two saves cannot each pass the check on a synth and both take it; a family created meanwhile
 * is caught by the tables' unique keys, as a conflict.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { sameValue } from '@/lib/app/catalogue/seed';
import {
  checkFamilies,
  FamilyFileSchema,
  FamilyMemberSchema,
  FamilySlugSchema,
  type FamilyFile,
  type FamilyInstrument,
} from '@/lib/app/families/data';

type Tx = Prisma.TransactionClient;

/** A family's id, as it sits in the URL. */
export const FamilyIdSchema = FamilySlugSchema;

/** A family as an admin saves it: the seed file's shape, its id in the URL. */
export const FamilyEditSchema = FamilyFileSchema.omit({ id: true }).extend({
  members: z.array(FamilyMemberSchema).max(24),
});
/**
 * A new family: the seed file's shape, with its id. `/admin/synths/catalogue/families/new` is the form for a new
 * family, so no family can be reached at the id `new`.
 */
export const FamilyCreateSchema = FamilyEditSchema.extend({
  id: FamilySlugSchema.refine((id) => id !== 'new', 'The id new is kept for the admin pages'),
});
export type FamilyEdit = z.infer<typeof FamilyEditSchema>;

/** A stored family as the admin sees it: the seed file's shape, and when an admin last saved it. */
export interface AdminFamily extends FamilyFile {
  /** `null` while it is still the seed's. */
  editedAt: string | null;
}

const familySelect = {
  id: true,
  name: true,
  defaultMember: true,
  originals: true,
  editedAt: true,
  members: {
    orderBy: [{ order: 'asc' as const }, { slug: 'asc' as const }],
    select: { slug: true, label: true, instrumentId: true, synthId: true, differences: true },
  },
};

type FamilyRow = Prisma.SynthFamilyGetPayload<{ select: typeof familySelect }>;

function adminFamilyOf(row: FamilyRow): AdminFamily {
  return {
    id: row.id,
    name: row.name,
    defaultMember: row.defaultMember,
    ...(row.originals.length ? { originals: row.originals } : {}),
    members: row.members.map((m) => ({
      slug: m.slug,
      label: m.label,
      instrument: m.instrumentId,
      ...(m.synthId ? { synth: m.synthId } : {}),
      differences: m.differences,
    })),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/** What a family is, without its bookkeeping: what a save compares and the audit records. */
export const familyContent = ({ editedAt: _editedAt, ...family }: AdminFamily): FamilyFile =>
  family;

/** Every stored family, by name, served or not. */
export async function listAdminFamilies(): Promise<AdminFamily[]> {
  const rows = await prisma.synthFamily.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: familySelect,
  });
  return rows.map(adminFamilyOf);
}

/** One stored family, or null. */
export async function getAdminFamily(id: string): Promise<AdminFamily | null> {
  const row = await prisma.synthFamily.findUnique({ where: { id }, select: familySelect });
  return row ? adminFamilyOf(row) : null;
}

/** A refusal in the shape `validateRequestBody` uses, so the form shows both the same way. */
function refuse(message: string, problems: string[]): never {
  throw new ValidationError(message, {
    errors: problems.map((p) => ({ path: '', message: p })),
  });
}

/** Room for a save that waits on another's row lock, then writes up to 24 members one by one. */
const FAMILY_TX = { timeout: 15_000 };

/** Hold every stored family's row until the transaction ends. */
async function lockFamilies(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT id FROM synth_family FOR UPDATE`;
}

/** The databank's instruments and the catalogue's synths, as `checkFamilies` reads them. */
async function checkContext(tx: Tx) {
  const [instrumentRows, synthRows] = await Promise.all([
    tx.bankInstrument.findMany({
      select: { id: true, recreationOfId: true, synths: { select: { synthId: true } } },
    }),
    tx.synth.findMany({ select: { id: true } }),
  ]);
  return {
    instruments: new Map<string, FamilyInstrument>(
      instrumentRows.map((i) => [
        i.id,
        { recreationOf: i.recreationOfId, synths: i.synths.map((s) => s.synthId) },
      ])
    ),
    synths: new Set(synthRows.map((s) => s.id)),
  };
}

/**
 * The problems `family` has beside every other stored family. It is checked last, so a synth another family already
 * has is reported on it rather than on that family, and each of its problems names it: the other families' own
 * problems are left out.
 */
async function problemsOf(tx: Tx, family: FamilyFile): Promise<string[]> {
  const others = (await tx.synthFamily.findMany({ select: familySelect }))
    .filter((row) => row.id !== family.id)
    .map((row) => familyContent(adminFamilyOf(row)));
  const own = [`family ${family.id}:`, `family ${family.id},`];
  return checkFamilies([...others, family], await checkContext(tx)).filter((p) =>
    own.some((prefix) => p.startsWith(prefix))
  );
}

/** A unique key the check could not see coming (a family or a synth taken meanwhile), as a conflict. */
function conflictOr(err: unknown): never {
  if (hasPrismaCode(err, 'P2002'))
    throw new ConflictError(
      'Another save took this family id or one of its synths. Reload and try again.'
    );
  throw err;
}

/**
 * Create a family (`create`), or replace a stored one whole (`update`). Refused with every problem the family would
 * have, and nothing written; 409 when creating an id that is taken, 404 when replacing one that is not stored.
 */
export async function saveFamily(
  id: string,
  input: FamilyEdit,
  mode: 'create' | 'update'
): Promise<{ before: AdminFamily | null; after: AdminFamily }> {
  // No originals sent as an empty list is the same family as none sent, so an unchanged save still writes nothing.
  const { originals, ...rest } = input;
  const family: FamilyFile = { id, ...rest, ...(originals?.length ? { originals } : {}) };
  try {
    return await prisma.$transaction(async (tx) => {
      await lockFamilies(tx);
      const row = await tx.synthFamily.findUnique({ where: { id }, select: familySelect });
      if (mode === 'create' && row) throw new ConflictError(`A family ${id} already exists`);
      if (mode === 'update' && !row) throw new NotFoundError('Family not found');
      const before = row ? adminFamilyOf(row) : null;

      const problems = await problemsOf(tx, family);
      if (problems.length)
        refuse(
          `The family has ${problems.length === 1 ? 'a problem' : `${problems.length} problems`}`,
          problems
        );
      // An unchanged save of the admin's own family writes nothing; one of the seed's is still stamped, so saving
      // it claims it from the seed as the form says.
      if (before?.editedAt && sameValue(familyContent(before), family))
        return { before, after: before };

      await writeFamily(tx, family, new Date(), mode);
      const after = await tx.synthFamily.findUniqueOrThrow({ where: { id }, select: familySelect });
      return { before, after: adminFamilyOf(after) };
    }, FAMILY_TX);
  } catch (err) {
    return conflictOr(err);
  }
}

/**
 * Write the family and its members as given, every row stamped `editedAt`. Members left out go first, and every kept
 * member lets go of its synth before any is written, so a synth moved between two members in one save never meets
 * itself on the unique key. A create inserts, never upserts: the row lock cannot hold an id not yet stored, so two
 * creates of one id meet on the primary key and the second is a 409 rather than a silent overwrite.
 */
async function writeFamily(
  tx: Tx,
  family: FamilyFile,
  editedAt: Date,
  mode: 'create' | 'update'
): Promise<void> {
  const data = {
    name: family.name,
    defaultMember: family.defaultMember,
    originals: family.originals ?? [],
    editedAt,
  };
  if (mode === 'create') await tx.synthFamily.create({ data: { id: family.id, ...data } });
  else await tx.synthFamily.update({ where: { id: family.id }, data });
  const slugs = family.members.map((m) => m.slug);
  await tx.synthFamilyMember.deleteMany({
    where: { familyId: family.id, slug: { notIn: slugs } },
  });
  await tx.synthFamilyMember.updateMany({
    where: { familyId: family.id, synthId: { not: null } },
    data: { synthId: null },
  });
  for (const [order, member] of family.members.entries()) {
    const content = {
      label: member.label,
      instrumentId: member.instrument,
      synthId: member.synth ?? null,
      differences: member.differences,
      order,
      editedAt,
    };
    await tx.synthFamilyMember.upsert({
      where: { familyId_slug: { familyId: family.id, slug: member.slug } },
      create: { familyId: family.id, slug: member.slug, ...content },
      update: content,
    });
  }
}

/** Delete a stored family and its members. 404 when it is not stored. */
export async function deleteFamily(id: string): Promise<AdminFamily> {
  return prisma.$transaction(async (tx) => {
    await lockFamilies(tx);
    const row = await tx.synthFamily.findUnique({ where: { id }, select: familySelect });
    if (!row) throw new NotFoundError('Family not found');
    await tx.synthFamily.delete({ where: { id } });
    return adminFamilyOf(row);
  }, FAMILY_TX);
}
