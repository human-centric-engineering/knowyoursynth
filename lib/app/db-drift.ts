/**
 * App database drift-probe registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `scripts/db/check-drift.ts` (run by `npm run db:drift-check`, in
 * CI, and by `/pre-pr`) calls this once, then probes everything you register
 * here alongside Sunrise's own A-series objects.
 *
 * Register the Prisma-*unmodelled* objects your app adds — most commonly the
 * hand-written FK constraint behind a satellite `User` table (see
 * CUSTOMIZATION.md §5). Prisma can't see those, so without a probe a future
 * `migrate dev` can silently drop one and CI won't notice.
 *
 * Example (the satellite-FK recipe from CUSTOMIZATION.md §5):
 *
 *   import {
 *     registerAppDriftProbe,
 *     constraintExists,
 *   } from '@/lib/db/drift-probes';
 *
 *   export function registerAppDriftProbes(): void {
 *     registerAppDriftProbe({
 *       name: 'AppUserProfile_userId_fkey (hand-written FK → User)',
 *       kind: 'FK constraint',
 *       table: 'AppUserProfile',
 *       // 2nd arg asserts the constraint definition text — pin the ON DELETE
 *       // action so a fork can't quietly drop the GDPR cascade.
 *       probe: constraintExists('AppUserProfile_userId_fkey', 'ON DELETE CASCADE'),
 *     });
 *   }
 *
 * Available probe factories from `@/lib/db/drift-probes`: `indexExists`,
 * `constraintExists` (optional definition-substring assertion), `columnExists`,
 * `generatedColumnExists`, plus `rlsEnabled` (asserts ENABLE and, by default,
 * FORCE) and `policyExists`. You do NOT need the last two for a model that
 * carries `orgId`: `db:drift-check` already derives them for every
 * tenant-owned table (`tenancyDriftProbes`, §107 — `policyExists` in both
 * modes, `rlsEnabled` at TENANCY_MODE=multi), yours included. They are
 * for RLS you hand-roll on a table OUTSIDE that set — and then register BOTH
 * per table: a policy can exist while RLS is disabled, and vice versa. For a
 * `GENERATED ALWAYS` column use `generatedColumnExists` —
 * `columnExists` passes on a plain column of the same name, which is never
 * populated, so the check goes green while the feature is silently broken.
 *
 * Full guide: CUSTOMIZATION.md §5 · .context/database/prisma-unmodelled-objects.md
 *
 * Know Your Synth registers two hand-written FKs to the user: a synth suggestion's (`f-databank` t-37), pinned to
 * `ON DELETE SET NULL` so an erasure keeps working and the suggestion outlives its author, and a user sound's
 * (`f-my-sounds` s1), pinned to `ON DELETE CASCADE` so an erasure takes the user's sounds with them.
 */
import { constraintExists, registerAppDriftProbe } from '@/lib/db/drift-probes';

export function registerAppDriftProbes(): void {
  registerAppDriftProbe({
    name: 'synth_suggestion_userId_fkey (hand-written FK → User)',
    kind: 'FK constraint',
    table: 'synth_suggestion',
    probe: constraintExists('synth_suggestion_userId_fkey', 'ON DELETE SET NULL'),
  });
  registerAppDriftProbe({
    name: 'user_sound_userId_fkey (hand-written FK → User)',
    kind: 'FK constraint',
    table: 'user_sound',
    probe: constraintExists('user_sound_userId_fkey', 'ON DELETE CASCADE'),
  });
}
