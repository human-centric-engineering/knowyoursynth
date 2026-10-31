/**
 * Public reads of the pattern library (`f-pattern-library` t-122): a sound's patterns, one pattern, and the library
 * filtered by role.
 *
 * A pattern is public when it is on a sound of a synth the catalogue serves: listed, and in the registry, as
 * `lib/app/catalogue/read.ts` decides it. One that only a hidden synth's sounds list is not, so hiding a synth hides
 * its riffs as well, and one on no sound yet (an admin's pattern still being written) is admin only. A row that no
 * longer parses is left out and logged (`toView`).
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { DEFAULT_FIRST, toView, type LibraryPatternView } from '@/lib/app/patterns/library';

/** Where a pattern may be read from: on a sound of a listed synth the app can play. */
const PUBLIC: Prisma.LibraryPatternWhereInput = {
  sounds: {
    some: { sound: { synth: { listed: true, id: { in: SYNTH_DEFS.map((d) => d.id) } } } },
  },
};

function served(row: Parameters<typeof toView>[0]): LibraryPatternView | null {
  const view = toView(row);
  if (!view) logger.error('library pattern: stored row does not parse, not served', { id: row.id });
  return view;
}

/** A library pattern id (a cuid). Anything else cannot be one, so it is not looked up. */
export const LibraryPatternIdSchema = z.string().regex(/^[a-z0-9]{20,32}$/);

/** One public library pattern, or `null`. */
export async function getLibraryPattern(id: string): Promise<LibraryPatternView | null> {
  const row = await prisma.libraryPattern.findFirst({ where: { AND: [{ id }, PUBLIC] } });
  return row && served(row);
}

/**
 * A listed, playable synth's sound's patterns, default first, or `null` when there is no such sound. Every one of a
 * sound's patterns is listed, whatever synth it was written for (`pattern-library.md`, The facts).
 */
export async function getSoundPatterns(
  synthId: string,
  slug: string
): Promise<LibraryPatternView[] | null> {
  if (!getSynthDef(synthId)) return null;
  const sound = await prisma.synthSound.findFirst({
    where: { synthId, slug, synth: { listed: true } },
    select: {
      patterns: {
        orderBy: DEFAULT_FIRST,
        select: { pattern: true },
      },
    },
  });
  if (!sound) return null;
  return sound.patterns.flatMap(({ pattern }) => served(pattern) ?? []);
}

export const LibraryListQuerySchema = z.object({
  role: z.enum(PATTERN_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type LibraryListQuery = z.infer<typeof LibraryListQuerySchema>;

/** A page of the public library, by name, optionally of one role. */
export async function listLibraryPatterns(
  query: LibraryListQuery
): Promise<{ patterns: LibraryPatternView[]; total: number }> {
  const where: Prisma.LibraryPatternWhereInput = {
    AND: [PUBLIC, ...(query.role ? [{ role: query.role }] : [])],
  };
  const [rows, total] = await Promise.all([
    prisma.libraryPattern.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.libraryPattern.count({ where }),
  ]);
  return { patterns: rows.flatMap((r) => served(r) ?? []), total };
}
