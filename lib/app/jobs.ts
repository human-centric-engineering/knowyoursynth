import { prisma } from '@/lib/db/client';
import { reconcileBankKnowledge } from '@/lib/app/bank/knowledge';
import { registerAppJob } from '@/lib/orchestration/maintenance/app-jobs';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { requireOrgId } from '@/lib/tenancy/context';

/**
 * App recurring-job registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the other
 * `lib/app/*` seams.
 *
 * Auto-wired: the maintenance tick calls this once before it first runs app jobs
 * (server runtime). Add `registerAppJob({ name, intervalMs, run })` calls to run
 * your own periodic work on the existing tick instead of standing up a second
 * scheduler:
 *
 *   import { registerAppJob } from '@/lib/orchestration/maintenance/app-jobs';
 *
 *   export function initAppJobs(): void {
 *     registerAppJob({
 *       name: 'app:prune-draft-invoices',
 *       intervalMs: 6 * 60 * 60 * 1000, // 6 hours
 *       run: async () => {
 *         const { count } = await prisma.appInvoice.deleteMany({ ... });
 *         return { pruned: count };   // folded into the tick's log line
 *       },
 *     });
 *   }
 *
 * `intervalMs` is a **minimum** gap, not a guarantee, and last-run times live in
 * process memory — so a multi-instance deployment runs each job about once per
 * instance per interval, and a restart re-arms everything. Write jobs to be
 * idempotent. If a job must run exactly once cluster-wide it needs its own lease;
 * see `execution-reaper` for that pattern.
 *
 * Empty registry = today's behaviour, byte-for-byte.
 *
 * Full guide: CUSTOMIZATION.md §4 · .context/orchestration/scheduling.md
 */
export function initAppJobs(): void {
  /* FORK (Know Your Synth): a held username (`f-profiles` r1) is only cleared when someone claims that name again, so
     without this a name given up and never re-claimed would be kept for good, after its hold and after its owner's
     erasure. Ledger: .context/app/divergences.md. */
  registerAppJob({
    name: 'app:prune-held-usernames',
    intervalMs: 6 * 60 * 60 * 1000,
    scope: { system: 'held_username has no orgId: a name is held across the whole install' },
    run: async () => {
      const { count } = await prisma.heldUsername.deleteMany({
        where: { heldUntil: { lte: new Date() } },
      });
      return { pruned: count };
    },
  });

  /* The databank's rows as knowledge documents, for search_databank's meaning-based layer (`f-tutor-knowledge` t-58).
     Here rather than on an admin's save, which would then wait on an embedding call per row. Idempotent, and a no-op
     with no embedding provider. The install org's only: the databank is the install's, and so is the tutor. */
  registerAppJob({
    name: 'app:project-databank',
    intervalMs: 15 * 60 * 1000,
    run: async () =>
      requireOrgId() === INSTALL_ORG_ID
        ? reconcileBankKnowledge()
        : { status: 'skipped', reason: 'not the install org' },
  });
}
