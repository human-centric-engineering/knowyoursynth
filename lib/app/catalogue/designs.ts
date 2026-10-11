/**
 * Which design each synth's panel draws, and the maker's approval behind a faithful one (D11, `f-panel-designs`).
 *
 * The two designs differ only in the maker's marks: `faithful` draws the logos, wordmarks and badges, and `neutral`
 * (the default) leaves them out. Showing them needs a recorded approval: who gave it on the maker's side, when, and a
 * note. The approval is kept when a synth goes back to neutral; the admin audit log holds the history.
 *
 * These columns are not the descriptive content the seed reconciles, so writing them never sets `editedAt`: setting
 * it would stop the seed updating that synth's name, summary and the rest (`lib/app/catalogue/seed.ts`).
 */
import { z } from 'zod';
import type { PanelDesign as DbPanelDesign, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { getSynthDef } from '@/lib/app/synths/defs';

export const SYNTH_DESIGNS = ['neutral', 'faithful'] as const;
export type SynthDesign = (typeof SYNTH_DESIGNS)[number];

const TO_DB: Record<SynthDesign, DbPanelDesign> = { neutral: 'NEUTRAL', faithful: 'FAITHFUL' };
export const designFromDb = (design: DbPanelDesign): SynthDesign =>
  design === 'FAITHFUL' ? 'faithful' : 'neutral';

/** The maker's approval to show their marks. */
export interface DesignApproval {
  /** The person on the maker's side who gave it. */
  approvedBy: string;
  /** The day it was given, `YYYY-MM-DD`. */
  approvedAt: string;
  note: string | null;
}

/** One synth's design, as the admin sees it. Unlisted synths and ones the registry lacks are included. */
export interface AdminSynthDesign {
  id: string;
  name: string;
  maker: string;
  listed: boolean;
  order: number;
  /** Whether the registry has its definition, so a page can draw it. */
  playable: boolean;
  design: SynthDesign;
  approval: DesignApproval | null;
}

export const SynthDesignInputSchema = z
  .object({
    design: z.enum(SYNTH_DESIGNS),
    /** Recorded with the change. Required for `faithful` unless the synth already has one. */
    approval: z
      .object({
        approvedBy: z.string().trim().min(1).max(200),
        // Compared with the latest calendar day anywhere (UTC+14), so an admin east of UTC can date it today.
        approvedAt: z.iso
          .date()
          .refine(
            (day) => day <= new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10),
            {
              message: 'An approval cannot be dated in the future',
            }
          ),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SynthDesignInput = z.infer<typeof SynthDesignInputSchema>;

const columns = {
  id: true,
  name: true,
  maker: true,
  listed: true,
  order: true,
  design: true,
  designApprovedBy: true,
  designApprovedAt: true,
  designApprovalNote: true,
} satisfies Prisma.SynthSelect;

type Row = Prisma.SynthGetPayload<{ select: typeof columns }>;

function toAdmin(row: Row): AdminSynthDesign {
  const approval =
    row.designApprovedBy && row.designApprovedAt
      ? {
          approvedBy: row.designApprovedBy,
          approvedAt: row.designApprovedAt.toISOString().slice(0, 10),
          note: row.designApprovalNote,
        }
      : null;
  return {
    id: row.id,
    name: row.name,
    maker: row.maker,
    listed: row.listed,
    order: row.order,
    playable: getSynthDef(row.id) !== null,
    design: designFromDb(row.design),
    approval,
  };
}

/** Every synth in the catalogue, listed or not, in catalogue order. */
export async function listSynthDesigns(): Promise<AdminSynthDesign[]> {
  const rows = await prisma.synth.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: columns,
  });
  return rows.map(toAdmin);
}

/**
 * Set a synth's design, recording an approval if one is given. `null` when no synth has the id.
 *
 * Refuses `faithful` when the synth has no approval and none is given: the marks are the maker's, and showing them
 * without a record of their say-so is what D11 rules out.
 */
export async function setSynthDesign(
  id: string,
  input: SynthDesignInput
): Promise<{ before: AdminSynthDesign; after: AdminSynthDesign } | null> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.synth.findUnique({ where: { id }, select: columns });
    if (!row) return null;
    const before = toAdmin(row);

    const approval = input.approval
      ? {
          designApprovedBy: input.approval.approvedBy,
          designApprovedAt: new Date(`${input.approval.approvedAt}T00:00:00.000Z`),
          designApprovalNote: input.approval.note || null,
        }
      : {};
    if (input.design === 'faithful' && !input.approval && !before.approval) {
      throw new ValidationError("Showing the maker's marks needs a recorded approval", {
        approval: ['Record who approved it and when before choosing the faithful design'],
      });
    }

    const updated = await tx.synth.update({
      where: { id },
      data: { design: TO_DB[input.design], ...approval },
      select: columns,
    });
    return { before, after: toAdmin(updated) };
  });
}
