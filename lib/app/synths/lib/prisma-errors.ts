/**
 * Prisma's error codes, read structurally: lib/app may not import Prisma's runtime (its error classes included).
 */

/** Whether `err` is a Prisma error with this code: `P2002` a unique clash, `P2003` a missing foreign key, and so on. */
export const hasPrismaCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === code;
