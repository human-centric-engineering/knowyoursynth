import { logger } from '@/lib/logging';

/**
 * App boot seam — one-time server startup work.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's `initApp` export, not its body). Treat it like the
 * landing page: a starting point you're expected to modify.
 *
 * Auto-wired: `instrumentation.ts`'s `register()` calls `initApp()` once per
 * server process, right after the `NEXT_RUNTIME === 'nodejs'` check and
 * **before** the dev-only maintenance-ticker guards — so it runs in production
 * too. The call is isolated in a try/catch there: a boot failure here is logged
 * but never crashes instrumentation or stops the dev ticker arming.
 *
 * Keep core out of it: `instrumentation.ts` imports only this file. If your
 * fork boots a framework tier, import its entry point **dynamically** from here
 * (`await import('@/lib/framework')`) — a *static* framework specifier is
 * resolved at `next build` time and breaks the build in vanilla Sunrise (and in
 * any fork without that folder). A framework-tier fork typically boots its own
 * tier here and then delegates to a fresh reserved leaf hook (e.g.
 * `lib/app/leaf-bootstrap.ts`) so a leaf-on-framework fork can still hook boot
 * without colliding on this file.
 *
 * **This is the only `lib/app/` hook that may be async.** Do not copy its
 * `async` onto the `initApp*` registration seams (`initAppJobs`,
 * `initAppAuthorizationPolicy`, …): those must be synchronous, and one that
 * returns a promise is refused and disabled at its first read. See
 * `.context/architecture/fork-init-seams.md` — "A seam must be synchronous".
 *
 * Full guide: CUSTOMIZATION.md §4 · the reserved `/framework` fork tier.
 */
// Not `async`: nothing here is awaited (`require-await`), so it returns its promise itself; the seam's contract is still
// a promise, and `instrumentation.ts` contains a throw either way.
export function initApp(): Promise<void> {
  // The public pattern library, read into its kept copy so the first picker open after a start does not wait on it
  // (`f-pattern-prefetch` t-262). Not awaited: start-up never waits on the database, and a failed read is logged and
  // read again by the first ranking. Imported here, not at the top, so the database client stays out of whatever
  // imports this file (the logger has no such dependency, so it is imported statically).
  void import('@/lib/app/patterns/suggest-read')
    .then((m) => m.warmPublicLibrary())
    .catch((err: unknown) => {
      logger.warn('app boot: the public pattern library could not be read ahead', {
        err: String(err),
      });
    });
  return Promise.resolve();
}
