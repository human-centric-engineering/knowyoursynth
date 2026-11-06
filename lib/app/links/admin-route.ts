/**
 * What every links admin route shares (`f-videos-and-links` t-179): its ownership decision and how it audits a change.
 *
 * Links are content every org reads (GLOBAL_CONFIG_MODELS), as the databank is, so a write route passes
 * `{ ...LINKS_ADMIN, writesSharedSettings: true }`: at `multi`, only the install org's admins make it. The flag is
 * written at each call site because `scripts/ci/shared-settings-writes.ts` reads it there.
 */
import type { NextRequest } from 'next/server';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';
import { auditFields, type AdminLink } from '@/lib/app/links/admin';
import type { OwnerRef } from '@/lib/app/links/owner';

export const LINKS_ADMIN = {
  // Ownership: no ownership decision — videos and links every org shares, admin only. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'Videos and links are reference content shared by every org (GLOBAL_CONFIG_MODELS); no row belongs to a user, and the guard already limits this to admins.',
  },
} as const;

export const LINK_ENTITY = 'external_link';

/** One admin-audit entry for a link created, changed or removed, with each field that changed. */
export function auditLink(
  request: NextRequest,
  userId: string,
  entry: {
    action: 'create' | 'update' | 'delete';
    before: AdminLink | null;
    after: AdminLink | null;
  }
): void {
  const link = entry.after ?? entry.before;
  if (!link) return;
  logAdminAction({
    userId,
    action: `${LINK_ENTITY}.${entry.action}`,
    entityType: LINK_ENTITY,
    entityId: link.id,
    entityName: link.title,
    changes: computeChanges(
      entry.before ? auditFields(entry.before) : {},
      entry.after ? auditFields(entry.after) : {}
    ),
    clientIp: getClientIP(request),
  });
}

/** One admin-audit entry for an owner's own videos put in a new order. */
export function auditReorder(
  request: NextRequest,
  userId: string,
  entry: { owner: OwnerRef; before: string[]; after: string[] }
): void {
  logAdminAction({
    userId,
    action: `${LINK_ENTITY}.reorder`,
    entityType: LINK_ENTITY,
    entityId: `${entry.owner.kind}:${entry.owner.id}`,
    entityName: `${entry.owner.kind}:${entry.owner.id}`,
    changes: { order: { from: entry.before, to: entry.after } },
    clientIp: getClientIP(request),
  });
}

/**
 * The link suggestion queue's ownership decision (`f-link-suggestions` t-185). Its rows carry who suggested each, but
 * the queue is every user's suggestions by design: it is where admins act on them. The decide route also writes a
 * link, so it adds `writesSharedSettings: true` at its call site.
 */
export const LINK_SUGGESTION_ADMIN = {
  // Ownership: no ownership decision — the admin queue of every user's link suggestions. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      "The link suggestion queue is every user's suggestions by design, for admins to decide; the guard already limits this to admins.",
  },
} as const;

export const LINK_SUGGESTION_ENTITY = 'link_suggestion';
