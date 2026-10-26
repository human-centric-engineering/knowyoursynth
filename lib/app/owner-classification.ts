/**
 * App owner classification seam — which of your models are private to one
 * person inside an org.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's `initAppOwnerClassification` export, not its body).
 * Treat it like the other `lib/app/*` seams.
 *
 * Core classifies its own models in `lib/db/owner-classification.ts`, and the
 * owner layer (`lib/db/owner-extension.ts`) refuses a narrowed caller's read of
 * another member's rows on the ones marked `enforced`. It cannot see your
 * models. Classify them here and they are read exactly as core's are — by the
 * owner layer, and by the coverage guard
 * (`tests/unit/lib/db/owner-classification.test.ts`), which fails naming any
 * model in your schema file that links to a user, or to a personal model, and
 * that no tier has classified.
 *
 * Auto-wired: `lib/db/owner-classification.ts` runs this once, lazily, before
 * its first read — in whichever runtime builds the Prisma client — so there is
 * no registration step to remember.
 *
 * Full guide: .context/auth/authorization.md "Owner classification"
 */

import { registerAppOwnerClassification } from '@/lib/db/owner-classification';

/**
 * Classify your tier's user-linked models.
 *
 * ```ts
 * import { registerAppOwnerClassification } from '@/lib/db/owner-classification';
 *
 * export function initAppOwnerClassification(): void {
 *   registerAppOwnerClassification({
 *     tier: 'app',
 *     models: {
 *       // A row is its owner's, and the data layer checks it.
 *       AppJournalEntry: { kind: 'personal', owner: { column: 'userId' }, enforced: true },
 *       // Private through its parent; the parent must be enforced first.
 *       AppJournalAttachment: {
 *         kind: 'personal',
 *         owner: { through: { field: 'entry', parent: 'AppJournalEntry' } },
 *         enforced: true,
 *       },
 *       // The user link records who did something, not whose the row is.
 *       AppInvoice: { kind: 'not-personal', because: 'Org billing record; userId is who raised it.' },
 *     },
 *   });
 * }
 * ```
 *
 * A framework tier registers with `tier: 'framework'`, from a function the
 * leaf's `initAppOwnerClassification()` calls — not from `initFramework()` at
 * boot, which runs in a different runtime from the one that reads this.
 *
 * Do not import the Prisma client (`@/lib/db`) from here: this runs while that
 * client is being built.
 *
 * Know Your Synth's user-linked models (t-77, taking Sunrise 0.15.0).
 *
 * Each personal model is its user's, and the fork's routes scope its private reads by `userId`. Four are also read
 * across owners on purpose: a published sound or pattern by everyone on `/explore`, a profile and its owned synths by
 * anyone at `/u/`. They are still personal, not `not-personal` — an unpublished sound is its owner's alone, and
 * `alsoVisible` (core's way to say "and these rows too") is for core models only. So none is `enforced` yet: the owner
 * layer would refuse the public reads until those call sites go through `runAcrossOwners()`. Until then the routes
 * guard them, as before, and a `'policy'` route that reads one is not excused by the data layer.
 */
export function initAppOwnerClassification(): void {
  const own = { kind: 'personal', owner: { column: 'userId' } } as const;
  registerAppOwnerClassification({
    tier: 'app',
    models: {
      UserSound: own,
      UserPattern: own,
      SynthProfile: own,
      OwnedInstrument: own,
      SynthPreference: own,
      UserPreference: own,
      LessonProgress: own,
      Favourite: own,
      SynthSuggestion: {
        kind: 'not-personal',
        because:
          'An inbound suggestion for the shared databank, decided from one admin queue; userId is who suggested it.',
      },
      SoundReport: {
        kind: 'not-personal',
        because:
          'A report about a shared sound, decided from one admin queue; reporterId and resolvedById record who acted.',
      },
      PatternReport: {
        kind: 'not-personal',
        because:
          'A report about a shared pattern, decided from one admin queue; reporterId and resolvedById record who acted.',
      },
    },
  });
}
