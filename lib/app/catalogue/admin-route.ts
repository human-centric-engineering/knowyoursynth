/**
 * What every catalogue admin route shares (`f-catalogue-admin`): its ownership decision and how it audits a change.
 *
 * The catalogue is product configuration every org reads (GLOBAL_CONFIG_MODELS), so a write is `writesSharedSettings`:
 * at `multi`, only the install org's admins make it.
 */
import type { NextRequest } from 'next/server';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';

export const CATALOGUE_READ = {
  // Ownership: no ownership decision — catalogue configuration every org shares, admin only. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'The catalogue is product configuration shared by every org (GLOBAL_CONFIG_MODELS); no row belongs to a user, and the guard already limits this to admins.',
  },
} as const;

export const CATALOGUE_WRITE = { ...CATALOGUE_READ, writesSharedSettings: true } as const;

export type CatalogueEntity = 'synth' | 'synth_sound' | 'synth_lineage' | 'synth_note';

/**
 * Write one admin-audit entry for a catalogue change. Logs nothing when before and after are the same, and returns
 * whether it logged.
 */
export function auditCatalogue(
  request: NextRequest,
  userId: string,
  entry: {
    action: string;
    entityType: CatalogueEntity;
    entityId: string;
    entityName: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  }
): boolean {
  // `editedAt` is bookkeeping the change itself causes, not part of what changed.
  const changes = computeChanges(entry.before ?? {}, entry.after, { ignoreKeys: ['editedAt'] });
  if (!changes) return false;
  logAdminAction({
    userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    changes,
    clientIp: getClientIP(request),
  });
  return true;
}
