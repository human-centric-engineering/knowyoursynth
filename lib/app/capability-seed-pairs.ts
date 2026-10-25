/**
 * Which capability class goes with which slug, for this fork's capability seeds.
 *
 * **Fork-owned scaffold** — Sunrise ships an empty array and does NOT change
 * this file after release, so your edits here merge cleanly on upgrade (the
 * stable contract is this file's exports, not their values).
 *
 * Auto-wired: `tests/unit/prisma/seeds/capability-class-seed-parity.test.ts`
 * spreads {@link APP_CAPABILITY_PAIRS} into its own `PAIRS`. Nothing at runtime
 * reads it.
 *
 * ## Why this exists
 *
 * That test runs every seed under `prisma/seeds/` — yours included,
 * since the runner discovers seeds recursively — against a strict mock Prisma
 * client (what it refuses is listed in that test's FORK NOTE),
 * captures each capability the seeds write, and requires the written
 * `functionDefinition` to equal the one its class declares (#545). A captured
 * capability with no pair fails it, so every capability you seed needs one.
 * The only other place to put it is `PAIRS` itself — a Sunrise-owned test
 * file, where every row you add is a merge conflict on the next upgrade (#646).
 *
 * Declare your pairs here instead. A pair names the slug and the class; the
 * test supplies what the seed wrote, so nothing here imports a seed file.
 *
 * Full guide: CUSTOMIZATION.md §4 · .context/database/seeding.md
 */

import { DescribeSynthCapability } from '@/lib/app/tutor/describe-synth';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { GetPanelCapability } from '@/lib/app/tutor/get-panel';
import { GetPatternCapability } from '@/lib/app/tutor/get-pattern';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import { ProposePatternCapability } from '@/lib/app/tutor/propose-pattern';
import { SearchDatabankCapability } from '@/lib/app/tutor/search-databank';
import { WebSearchCapability } from '@/lib/app/tutor/web-search';

/** One capability slug and the class whose definition its seed must write. */
export interface AppCapabilityPair {
  /** The capability slug; also its `functionDefinition.name`. */
  slug: string;
  /** A fresh instance of the class the dispatcher runs for that slug. */
  instance: { functionDefinition: unknown };
}

/**
 * Capability pairs this fork adds to Sunrise's own.
 *
 * Sunrise core ships `[]`.
 *
 * @example
 * ```ts
 * import { WithdrawTaskCapability } from '@/lib/tasks/capabilities/withdraw-task';
 *
 * export const APP_CAPABILITY_PAIRS: readonly AppCapabilityPair[] = [
 *   { slug: 'withdraw_task', instance: new WithdrawTaskCapability() },
 * ];
 * ```
 */
export const APP_CAPABILITY_PAIRS: readonly AppCapabilityPair[] = [
  // The tutor's tools, as `app-knowyoursynth/003-tutor-tools.ts` seeds them (t-77).
  { slug: 'get_panel', instance: new GetPanelCapability() },
  { slug: 'describe_synth', instance: new DescribeSynthCapability() },
  { slug: 'propose_panel_change', instance: new ProposePanelChangeCapability() },
  { slug: 'design_sound', instance: new DesignSoundCapability() },
  { slug: 'get_pattern', instance: new GetPatternCapability() },
  { slug: 'propose_pattern', instance: new ProposePatternCapability() },
  { slug: 'search_databank', instance: new SearchDatabankCapability() },
  { slug: 'web_search', instance: new WebSearchCapability() },
];

/**
 * Seeds of this fork's that the parity test cannot run under its strict mock
 * client — they use the app's own client, raw SQL (`$executeRaw`) or another
 * call the mock does not model — keyed by path relative to `prisma/seeds/`,
 * each with the reason it writes no capability.
 *
 * The test then lets such a seed throw, use the app client or call what the
 * mock refuses. Whatever it writes past that point goes unchecked, so a seed
 * that writes a capability does not belong here: make it write through the
 * `prisma` it is handed instead. Sunrise core ships `{}`.
 *
 * @example
 * ```ts
 * export const APP_UNCHECKED_SEEDS: Readonly<Record<string, string>> = {
 *   'app/001-vector-index.ts': 'creates a pgvector index with $executeRaw; writes no capability',
 * };
 * ```
 */
export const APP_UNCHECKED_SEEDS: Readonly<Record<string, string>> = {
  'app-knowyoursynth/001-catalogue.ts':
    'places new synths after the highest `order` with synth.aggregate, which the mock does not model; writes the catalogue, no capability',
  'app-knowyoursynth/002-bank.ts':
    'validates the databank against the catalogue it reads, which the mock leaves empty, so it throws; writes the databank, no capability',
};
