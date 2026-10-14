/**
 * What every databank admin route shares (`f-databank` t-36): its ownership decision and how it audits a change.
 *
 * The databank is reference content every org reads (GLOBAL_CONFIG_MODELS), as the catalogue is, so a write route
 * passes `{ ...BANK_ADMIN, writesSharedSettings: true }`: at `multi`, only the install org's admins make it. The flag
 * is written at each call site because `scripts/ci/shared-settings-writes.ts` reads it there.
 */
import type { NextRequest } from 'next/server';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';
import type { BankKind } from '@/lib/app/bank/read';

export const BANK_ADMIN = {
  // Ownership: no ownership decision — databank content every org shares, admin only. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'The databank is reference content shared by every org (GLOBAL_CONFIG_MODELS); no row belongs to a user, and the guard already limits this to admins.',
  },
} as const;

/** What the audit log names a row by: a song's title, any other row's name, else its id. */
export const bankRowName = (row: object | null, id: string): string =>
  row && 'title' in row && typeof row.title === 'string'
    ? row.title
    : row && 'name' in row && typeof row.name === 'string'
      ? row.name
      : id;

/** The audit log's entity type for a kind: `bank_maker`, `bank_instrument`, `bank_artist`, `bank_song`. */
export const bankEntityType = (kind: BankKind): string => `bank_${kind.slice(0, -1)}`;

/**
 * Write one admin-audit entry for a databank change: `bank_<kind>.create`, `.update` or `.delete`, with each field
 * that changed. A removal records every field going to nothing.
 */
export function auditBank(
  request: NextRequest,
  userId: string,
  entry: {
    action: 'create' | 'update' | 'delete';
    kind: BankKind;
    id: string;
    before: object | null;
    after: object | null;
  }
): void {
  const entityType = bankEntityType(entry.kind);
  logAdminAction({
    userId,
    action: `${entityType}.${entry.action}`,
    entityType,
    entityId: entry.id,
    entityName: bankRowName(entry.after ?? entry.before, entry.id),
    changes: computeChanges({ ...entry.before }, { ...entry.after }),
    clientIp: getClientIP(request),
  });
}
