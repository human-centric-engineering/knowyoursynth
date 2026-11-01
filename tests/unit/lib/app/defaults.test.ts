/**
 * Tests: lib/app/ seams ship as no-op defaults
 *
 * Every `lib/app/*` file is a fork-owned scaffold that Sunrise ships EMPTY. This
 * file exercises the REAL defaults to lock in that contract — a stray default
 * registration would silently apply to every install (a lint rule every fork
 * inherits, an auth email swapped out, a restricted agent's document access
 * widened).
 *
 * ---------------------------------------------------------------------------
 * FORK NOTE — filling a seam is EXPECTED to fail a row here
 * ---------------------------------------------------------------------------
 * This test asserts a property every fork is expected to violate: the seams
 * exist precisely so you fill them. When you fill one, **pin the new value**
 * rather than deleting the row:
 *
 *     // BEFORE (Sunrise default)
 *     assert: () => expect(appEslintConfig).toEqual([]),
 *     // AFTER  (fork spreads its own tier config)
 *     assert: () => expect(appEslintConfig).toEqual(frameworkEslintConfig),
 *
 * Pinning keeps the protection for the seams you have NOT filled; deleting the
 * row loses it silently. The table below is the whole surface — one row per
 * seam — so a fork's diff here is a line, not a rewrite. See CUSTOMIZATION.md §4.
 *
 * @see lib/app/ · CUSTOMIZATION.md §4
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { scaffoldsOnDisk } from '@/tests/helpers/app-scaffolds';

// FORK (Know Your Synth): the data-export collector reads the synth suggestions table (`f-databank` t-37).
vi.mock('@/lib/db/client', () => ({
  prisma: {
    synthSuggestion: { findMany: vi.fn() },
    userSound: { findMany: vi.fn() },
    soundReport: { findMany: vi.fn() },
    synthPreference: { findMany: vi.fn() },
    userPreference: { findMany: vi.fn() },
    lessonProgress: { findMany: vi.fn() },
    favourite: { findMany: vi.fn() },
    synthProfile: { findMany: vi.fn() },
    ownedInstrument: { findMany: vi.fn() },
    userPattern: { findMany: vi.fn() },
    patternReport: { findMany: vi.fn() },
    libraryPattern: { findMany: vi.fn() },
    libraryPatternComment: { findMany: vi.fn() },
  },
}));
import { registerAppRateLimits } from '@/lib/app/rate-limit';
import { registerAppTenantResolver } from '@/lib/app/tenant-resolver';
import { hasTenantResolver } from '@/lib/tenancy/resolver';
import { initAppCapabilities } from '@/lib/app/capabilities';
import {
  hasProviderCredentialResolver,
  resetProviderCredentialResolver,
  resolveProviderCredential,
} from '@/lib/orchestration/llm/provider-credentials';
import { initAppContextContributors } from '@/lib/app/context-contributors';
import { initAppNav } from '@/lib/app/admin-nav';
import { publicNavItems, footerNavItems, footerLegalItems } from '@/lib/app/public-nav';
import { protectedNavItems } from '@/lib/app/protected-nav';
import { appAuthLandingRoute, appAuthLandingLabel } from '@/lib/app/auth-landing';
import { initApp } from '@/lib/app/bootstrap';
import { initAppKnowledgeAccessContributors } from '@/lib/app/knowledge-access-contributors';
import { initAppGuardFloorContributors } from '@/lib/app/guard-floor-contributors';
import { initAppGuardEventContributors } from '@/lib/app/guard-event-contributors';
import { appAgentFields } from '@/lib/app/agent-fields';
import { appProtectedRoutes } from '@/lib/app/protected-routes';
import { appEnvSchema } from '@/lib/app/env';
import { footerCopyright } from '@/lib/app/footer';
import { APP_API_KEY_SCOPES } from '@/lib/app/api-key-scopes';
import { listValidApiKeyScopes, CORE_API_KEY_SCOPES } from '@/lib/auth/api-key-scopes';
import appEslintConfig from '@/lib/app/eslint.config.mjs';
import { appFrameSrc } from '@/lib/app/csp';
import {
  appCoverageExclusions,
  appAlwaysRunTests,
  appOwnerlessSurfaceExceptions,
} from '@/lib/app/ci';
import { occupiedTiers } from '@/lib/app/reserved-tiers';
import { APP_CAPABILITY_PAIRS, APP_UNCHECKED_SEEDS } from '@/lib/app/capability-seed-pairs';
import { initAppUserCreatedHooks } from '@/lib/app/user-created';
import { collectAppSubjectData } from '@/lib/app/data-export';
import { prisma } from '@/lib/db/client';
import {
  getAppSubjectSources,
  getAppExcludedSubjectSources,
  __resetAppSubjectSourceRegistryForTests,
} from '@/lib/privacy/subject-source-registry';
import {
  getAppOrgSources,
  getAppExcludedOrgSources,
  appOrgDeclarationsFailed,
  __resetAppOrgSourceRegistryForTests,
} from '@/lib/privacy/org-source-registry';
import { getAppJobs, __resetAppJobsForTests } from '@/lib/orchestration/maintenance/app-jobs';
import {
  getErasureCleanupHooks,
  __resetErasureCleanupHooksForTests,
} from '@/lib/privacy/erasure-hooks';
import { getEffectiveRateLimitPolicy, RATE_LIMIT_POLICY } from '@/lib/security/rate-limit-policy';
import {
  hasProviderEligibilityResolver,
  resolveEligibleProviders,
} from '@/lib/orchestration/llm/provider-eligibility';
import { getRegisteredNavSections, __resetNavRegistryForTests } from '@/lib/admin-nav/registry';
import {
  listAppMcpResourceTypes,
  listAllowedMcpResourceUriSchemes,
  __resetAppMcpResourcesForTests,
} from '@/lib/orchestration/mcp/resource-registry';
import {
  listGraders,
  __resetGraderRegistryForTests,
} from '@/lib/orchestration/evaluations/graders/registry';
import {
  CORE_PLATFORM_AGENTS,
  listPlatformAgents,
  __resetPlatformAgentsForTests,
} from '@/lib/orchestration/agents/platform-agents';
// FORK (Know Your Synth): the tutor fills the capability, context-contributor and platform-agent seams (`f-tutor` t-53).
import { TUTOR_AGENT } from '@/lib/app/tutor/agent';
// FORK (Know Your Synth): the tutor's graders fill the evaluations seam (`f-tutor-knowledge` t-61).
import { TUTOR_GRADERS } from '@/lib/app/tutor/evals/graders';
import { TUTOR_CONTEXT_TYPE, synthContext } from '@/lib/app/tutor/context';
import { TUTOR_TOOLS } from '@/lib/app/tutor/tools';
import {
  registerAppCapabilities,
  __resetRegistrationForTests,
} from '@/lib/orchestration/capabilities/registry';
import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { __resetContextContributorsForTests } from '@/lib/orchestration/chat/context-builder';
import {
  ACCOUNT_SURFACES,
  getRegisteredAccountSections,
  __resetAccountSectionRegistryForTests,
} from '@/lib/account-sections/registry';
import { initAppAuthorizationPolicy } from '@/lib/app/authorization';
import { ORG_TIER_ADMIN_PAGES, adminPageTier } from '@/lib/auth/admin-tier';
import {
  getAppOrgTierAdminPages,
  orgTierAdminPages,
  __resetAppOrgTierAdminPagesForTests,
} from '@/lib/auth/org-tier-admin-pages';
import {
  appOwnerClassifications,
  __resetAppOwnerClassificationForTests,
} from '@/lib/db/owner-classification';
import {
  DEFAULT_AUTHORIZATION_POLICY,
  getAuthorizationPolicy,
  hasAppAuthorizationPolicy,
  __resetAuthorizationPolicyForTests,
} from '@/lib/auth/authorization';

/**
 * One row per `lib/app/*` seam.
 *
 * - `seam` — the file a fork edits, and the test name.
 * - `risk` — what a stray default here would do to every install. This is the
 *   reason the row exists; keep it accurate if you pin a fork value.
 * - `assert` — runs the REAL default and asserts it registers/overrides nothing.
 *   May be async.
 */
interface SeamDefault {
  seam: string;
  risk: string;
  assert: () => void | Promise<void>;
}

/**
 * Seam files deliberately absent from the table below, with the reason. The
 * drift guard at the bottom of this file allows exactly these two.
 */
/** This file's own repo-relative path — the one place importActual is allowed. */
const THIS_FILE = path.join('tests', 'unit', 'lib', 'app', 'defaults.test.ts');

const UNASSERTED_SEAMS = new Set([
  // Asserted behaviourally instead — see tests/unit/lib/db/drift-probes.test.ts.
  'lib/app/db-drift.ts',
  // The one seam that ships real logic (a classifier) rather than an empty
  // value, so "registers nothing" is not the contract. Covered by its own tests.
  'lib/app/surface.ts',
  // FORK (Know Your Synth): the app's own code, not seams that ship empty, so there is no default to assert (t-77,
  // taking Sunrise 0.15.0, whose scaffold classifier counts a lib/app/ directory as one). Ledger:
  // .context/app/divergences.md.
  'lib/app/bank/',
  'lib/app/catalogue/',
  'lib/app/patterns/',
  'lib/app/profile/',
  'lib/app/sequencer/',
  'lib/app/sounds/',
  'lib/app/synths/',
  'lib/app/tutor/',
]);

const SEAM_DEFAULTS: SeamDefault[] = [
  {
    seam: 'lib/app/authorization.ts',
    risk: 'a stray policy would replace the authorization decision at every guarded request and every admin page — the one seam whose default registration would change who can reach what, on every install',
    assert: () => {
      initAppAuthorizationPolicy();
      expect(hasAppAuthorizationPolicy()).toBe(false);
      // BY IDENTITY: what runs must be Sunrise's own object, not something
      // equivalent-looking. `getAuthorizationPolicy()` also runs the fork gate,
      // so this covers the wiring as well as the value.
      expect(getAuthorizationPolicy()).toBe(DEFAULT_AUTHORIZATION_POLICY);
    },
  },
  {
    seam: 'lib/app/llm-providers.ts',
    risk: 'a stray eligibility rule would silently drop provider fallbacks on every install',
    assert: async () => {
      // `importActual`, NOT a plain import: tests/setup.ts pins this seam for
      // every other file, and asserting the pin would prove nothing about what
      // Sunrise actually ships. This is the file that must see the real one.
      const seam =
        await vi.importActual<typeof import('@/lib/app/llm-providers')>('@/lib/app/llm-providers');
      await seam.registerAppProviderEligibility();
      expect(hasProviderEligibilityResolver()).toBe(false);
      // BY IDENTITY, not by deep equality: the default has to be the input
      // array itself, which is what makes "byte-identical at single" a fact
      // rather than a claim about equivalent-looking output.
      const candidates = ['anthropic', 'openai'];
      await expect(
        resolveEligibleProviders(candidates, {
          task: 'chat',
          source: 'system',
          primarySlug: 'anthropic',
        })
      ).resolves.toBe(candidates);
    },
  },
  {
    seam: 'lib/app/rate-limit.ts',
    risk: 'a stray tier or rule would re-cap every install',
    assert: () => {
      registerAppRateLimits();
      // No app rules → the effective policy is the base policy BY IDENTITY.
      expect(getEffectiveRateLimitPolicy()).toBe(RATE_LIMIT_POLICY);
    },
  },
  {
    seam: 'lib/app/tenant-resolver.ts',
    risk: 'a stray resolver would pick an org for every request on every install',
    assert: () => {
      registerAppTenantResolver();
      // No resolver → the proxy strips the org header on every request.
      expect(hasTenantResolver()).toBe(false);
    },
  },
  {
    seam: 'lib/app/capabilities.ts',
    risk: 'a stray capability would be dispatchable on every install',
    // Behavioural reach into the dispatcher is covered by bootstrap-wiring.test.ts.
    // Know Your Synth fills this seam: pinned to the tutor's four tools, the same instances in the same order, so a
    // stray registration still fails.
    assert: () => {
      __resetRegistrationForTests();
      const register = vi
        .spyOn(capabilityDispatcher, 'register')
        .mockImplementation(() => undefined);
      try {
        initAppCapabilities();
        registerAppCapabilities();
        expect(register.mock.calls.map(([capability]) => capability)).toEqual([...TUTOR_TOOLS]);
        register.mock.calls.forEach(([capability], i) => expect(capability).toBe(TUTOR_TOOLS[i]));
      } finally {
        register.mockRestore();
        __resetRegistrationForTests();
      }
    },
  },
  {
    seam: 'lib/app/context-contributors.ts',
    risk: 'a stray contributor would inject prompt context into every chat turn',
    // Behavioural reach into buildContext is covered by context-builder.test.ts.
    // Know Your Synth fills this seam: pinned to its one type, the tutor's synth context. Read from the store
    // `registerContextContributor` writes, which `context-builder.ts` keeps on `globalThis`.
    assert: () => {
      __resetContextContributorsForTests();
      try {
        initAppContextContributors();
        const store = (globalThis as { sunriseChatContextContributors?: Map<string, unknown> })
          .sunriseChatContextContributors;
        expect([...(store ?? new Map<string, unknown>())]).toEqual([
          [TUTOR_CONTEXT_TYPE, synthContext],
        ]);
      } finally {
        __resetContextContributorsForTests();
      }
    },
  },
  {
    seam: 'lib/app/admin-nav.ts',
    risk: 'a stray section would appear in every install’s admin sidebar',
    // Know Your Synth fills this seam: pinned to its one "Synths" section and its two pages, so a stray addition still fails.
    assert: () => {
      __resetNavRegistryForTests();
      initAppNav();
      expect(
        getRegisteredNavSections().map(({ title, items }) => ({
          title,
          items: items?.map(({ href, label }) => ({ href, label })),
        }))
      ).toEqual([
        {
          title: 'Synths',
          items: [
            { href: '/admin/synths', label: 'Designs' },
            { href: '/admin/synths/catalogue', label: 'Catalogue' },
            { href: '/admin/synths/patterns', label: 'Patterns' },
            { href: '/admin/synths/bank', label: 'Databank' },
            { href: '/admin/synths/suggestions', label: 'Suggestions' },
            { href: '/admin/synths/reports', label: 'Reported patches' },
            { href: '/admin/synths/data', label: 'Data' },
          ],
        },
      ]);
    },
  },
  {
    seam: 'lib/app/public-nav.ts',
    risk: 'a stray non-null list would silently REPLACE the marketing nav',
    // Know Your Synth fills the header list: pinned to its four links, so a stray change still fails. The footers
    // stay null.
    assert: () => {
      expect(publicNavItems?.map(({ href, label }) => ({ href, label }))).toEqual([
        { href: '/', label: 'Home' },
        { href: '/explore', label: 'Explore' },
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
      ]);
      expect(footerNavItems).toBeNull();
      expect(footerLegalItems).toBeNull();
    },
  },
  {
    seam: 'lib/app/protected-nav.ts',
    risk: 'a stray non-null list would silently REPLACE the authenticated nav',
    // Know Your Synth fills this seam: pinned to its five links, so a stray change still fails.
    assert: () =>
      expect(
        protectedNavItems?.map(({ href, label, adminOnly }) => ({ href, label, adminOnly }))
      ).toEqual([
        { href: '/dashboard', label: 'My synths', adminOnly: undefined },
        { href: '/explore', label: 'Explore', adminOnly: undefined },
        { href: '/profile', label: 'Profile', adminOnly: undefined },
        { href: '/settings', label: 'Settings', adminOnly: undefined },
        { href: '/admin', label: 'Admin', adminOnly: true },
      ]),
  },
  {
    seam: 'lib/app/auth-landing.ts',
    risk: 'a stray value would send every install somewhere else after login',
    assert: () => {
      expect(appAuthLandingRoute).toBeNull();
      // Know Your Synth fills the label only: the landing stays /dashboard, called My synths.
      expect(appAuthLandingLabel).toBe('My synths');
    },
  },
  {
    seam: 'lib/app/footer.ts',
    risk: 'a stray value would rewrite — or silently remove — the attribution line on every install, on both the public and authenticated footers',
    // Know Your Synth fills this seam: pinned to the not-affiliated notice (`f-front-door` t-63).
    assert: () =>
      expect(footerCopyright).toBe(
        'Independent. Not affiliated with any synth maker. Product names are trademarks of their owners.'
      ),
  },
  {
    seam: 'lib/app/emails.ts',
    risk: 'a stray override would swap an auth email for every install',
    assert: async () => {
      // `importActual`, NOT a plain import: tests/setup.ts pins this seam to
      // `{}` for every other file (#895), so a plain import would assert the pin.
      const seam = await vi.importActual<typeof import('@/lib/app/emails')>('@/lib/app/emails');
      expect(seam.emailOverrides).toEqual({});
    },
  },
  {
    seam: 'lib/app/data-export.ts',
    risk: 'a stray collector would leak app rows into every install’s subject-access export, and a stray declaration would pre-account for a table nobody decided about',
    assert: async () => {
      // Know Your Synth collects eleven sections, a user's synth suggestions (`f-databank` t-37), their sounds
      // (`f-my-sounds` s1), the reports they filed about shared sounds (`f-sharing` h4), their last panels and
      // settings (s3), their lesson progress and favourites (s4), their synth profile (`f-profiles` r1), the synths
      // they own and want (r2), their patterns (`f-step-sequencer` t-81) and the reports they filed about shared
      // patterns (t-83), the library patterns they made and the comments they wrote on them (`f-pattern-library`
      // t-156), and asks only for theirs.
      vi.mocked(prisma.synthSuggestion.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userSound.findMany).mockResolvedValue([]);
      vi.mocked(prisma.soundReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.synthPreference.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userPreference.findMany).mockResolvedValue([]);
      vi.mocked(prisma.lessonProgress.findMany).mockResolvedValue([]);
      vi.mocked(prisma.favourite.findMany).mockResolvedValue([]);
      vi.mocked(prisma.synthProfile.findMany).mockResolvedValue([]);
      vi.mocked(prisma.ownedInstrument.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userPattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.patternReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.libraryPattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.libraryPatternComment.findMany).mockResolvedValue([]);
      expect(await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' })).toEqual({
        synthSuggestions: [],
        sounds: [],
        soundReportsFiled: [],
        synthPanels: [],
        synthSettings: [],
        lessonProgress: [],
        favourites: [],
        synthProfile: [],
        ownedSynths: [],
        patterns: [],
        patternReportsFiled: [],
        libraryPatternsMade: [],
        libraryPatternComments: [],
      });
      expect(prisma.synthSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.userSound.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.soundReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reporterId: 'user-1' } })
      );
      expect(prisma.synthPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.userPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.lessonProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.favourite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.synthProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.ownedInstrument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.userPattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      expect(prisma.patternReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reporterId: 'user-1' } })
      );
      expect(prisma.libraryPattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { madeByUserId: 'user-1' } })
      );
      expect(prisma.libraryPatternComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { authorId: 'user-1' } })
      );
      // The declaration half (#533). The reads trigger the lazy init, so this
      // exercises the REAL seam. A stray source here would also silence the
      // fork-accounting rule in export-sources.test.ts for that model.
      __resetAppSubjectSourceRegistryForTests();
      // Know Your Synth exports a user's synth suggestions, sounds, reports filed, last panels, settings, lesson progress, favourites, profile, owned and wanted synths and patterns, and declares its catalogue (pattern library included) and databank tables
      // and its held usernames as excluded: no row of theirs is about a user.
      expect(getAppSubjectSources().map((s) => [s.model, s.section, s.disposition])).toEqual([
        ['SynthSuggestion', 'synthSuggestions', 'export'],
        ['UserSound', 'sounds', 'export'],
        ['UserPattern', 'patterns', 'export'],
        ['PatternReport', 'patternReportsFiled', 'export'],
        ['SoundReport', 'soundReportsFiled', 'export'],
        ['SynthPreference', 'synthPanels', 'export'],
        ['UserPreference', 'synthSettings', 'export'],
        ['LessonProgress', 'lessonProgress', 'export'],
        ['Favourite', 'favourites', 'export'],
        ['SynthProfile', 'synthProfile', 'export'],
        ['LibraryPattern', 'libraryPatternsMade', 'attribution'],
        ['LibraryPatternComment', 'libraryPatternComments', 'export'],
        ['OwnedInstrument', 'ownedSynths', 'export'],
      ]);
      expect(getAppExcludedSubjectSources().map((e) => e.model)).toEqual([
        'Synth',
        'SynthSound',
        'SynthLineage',
        'SynthNote',
        'CatalogueSeedRecord',
        'SynthSoundPattern',
        'BankMaker',
        'BankInstrument',
        'BankInstrumentPerson',
        'BankInstrumentSynth',
        'BankArtist',
        'BankArtistMember',
        'BankArtistInstrument',
        'BankSong',
        'BankSongArtist',
        'BankSongPart',
        'BankPartInstrument',
        'BankPartSynth',
        'BankRemoval',
        'HeldUsername',
      ]);
    },
  },
  {
    seam: 'lib/app/org-export.ts',
    risk: 'a stray source would read a table into every install\u2019s org export \u2014 and pre-account for an orgId model nobody decided about, silencing the org-manifest coverage rule for it',
    assert: () => {
      __resetAppOrgSourceRegistryForTests();
      // The reads trigger the lazy init, so this exercises the REAL file.
      expect(getAppOrgSources()).toEqual([]);
      expect(getAppExcludedOrgSources()).toEqual([]);
      expect(appOrgDeclarationsFailed()).toBe(false);
    },
  },
  {
    seam: 'lib/app/owner-classification.ts',
    risk: 'a stray classification would switch the data layer’s owner check on for a model nobody decided was private — refusing reads the product means to allow — or pre-classify a fork model nobody looked at, silencing the coverage guard for it',
    assert: () => {
      __resetAppOwnerClassificationForTests();
      // The read triggers the lazy init, so this exercises the REAL file.
      // FORK (Know Your Synth): pinned to our user-linked models (t-77), none enforced, rather than deleted, so a
      // stray extra or changed classification still fails. Ledger: .context/app/divergences.md.
      const own = { kind: 'personal', owner: { column: 'userId' } };
      expect(appOwnerClassifications()).toEqual({
        UserSound: own,
        UserPattern: own,
        SynthProfile: own,
        OwnedInstrument: own,
        SynthPreference: own,
        UserPreference: own,
        LessonProgress: own,
        Favourite: own,
        SynthSuggestion: { kind: 'not-personal', because: expect.any(String) },
        SoundReport: { kind: 'not-personal', because: expect.any(String) },
        PatternReport: { kind: 'not-personal', because: expect.any(String) },
      });
    },
  },
  {
    seam: 'lib/app/bootstrap.ts',
    risk: 'a stray default would run one-time work on every install boot',
    // That instrumentation calls this in all envs, try/catch-isolated, is
    // covered by tests/unit/instrumentation.test.ts.
    assert: async () => {
      await expect(initApp()).resolves.toBeUndefined();
    },
  },
  {
    seam: 'lib/app/knowledge-access-contributors.ts',
    risk: 'a stray contributor would widen every restricted agent’s document access',
    // Behavioural reach into the resolver is covered by resolveAgentDocumentAccess.test.ts.
    assert: () => expect(initAppKnowledgeAccessContributors()).toBeUndefined(),
  },
  {
    seam: 'lib/app/guard-floor-contributors.ts',
    risk: 'a stray contributor would raise the guard floor on every install',
    assert: () => expect(initAppGuardFloorContributors()).toBeUndefined(),
  },
  {
    seam: 'lib/app/guard-event-contributors.ts',
    risk: 'a stray observer would receive every install’s inline-chat guard events',
    assert: () => expect(initAppGuardEventContributors()).toBeUndefined(),
  },
  {
    seam: 'lib/app/agent-fields.ts',
    risk: 'a stray descriptor would add a field to every install’s agent form',
    assert: () => expect(appAgentFields).toEqual([]),
  },
  {
    seam: 'lib/app/protected-routes.ts',
    risk: 'a stray path would put a public route behind auth on every install',
    assert: () => expect(appProtectedRoutes).toEqual([]),
  },
  {
    seam: 'lib/app/env.ts',
    risk: 'a stray key would make an unset env var fail boot on every install',
    // An empty z.object() accepts (and strips) anything → parses {} to {}.
    // FORK (Know Your Synth): pinned to the tutor's daily allowance (`f-tutor` t-54), which has a default, rather than
    // deleted, so a stray key that fails boot when unset still fails here. Ledger: .context/app/divergences.md.
    assert: () => expect(appEnvSchema.parse({})).toEqual({ TUTOR_DAILY_TURNS: 30 }),
  },
  {
    seam: 'lib/app/eslint.config.mjs',
    risk: 'a stray flat-config block would apply lint rules to every fork',
    // The root eslint.config.mjs spreads this array last; that spread itself is
    // exercised by every `npm run lint` run.
    // FORK (Know Your Synth): pinned to the one ignore for the social card's generated panel renderer (t-50) rather
    // than deleted, so a stray rule block still fails. Ledger: .context/app/divergences.md.
    assert: () =>
      expect(appEslintConfig).toEqual([
        { ignores: ['components/app/sharing/generated/panel-render.mjs'] },
      ]),
  },
  {
    seam: 'lib/app/jobs.ts',
    risk: 'a stray job would run on every install\u2019s maintenance tick',
    assert: () => {
      __resetAppJobsForTests();
      // getAppJobs() triggers the lazy init, so this exercises the REAL seam.
      // FORK (Know Your Synth): pinned to the held-username prune (`f-profiles` r1) and the databank's projection
      // (`f-tutor-knowledge` t-58) rather than deleted, so a stray third job still fails. Ledger:
      // .context/app/divergences.md.
      expect(getAppJobs().map((j) => j.name)).toEqual([
        'app:prune-held-usernames',
        'app:project-databank',
      ]);
    },
  },
  {
    seam: 'lib/app/erasure.ts',
    risk: 'a stray hook would run inside every account erasure on every install \u2014 deleting external data, or scrubbing rows, that the install never asked it to touch',
    assert: () => {
      __resetErasureCleanupHooksForTests();
      // getErasureCleanupHooks() triggers the lazy init, so this exercises the REAL seam.
      expect(getErasureCleanupHooks()).toEqual([]);
    },
  },
  {
    seam: 'lib/app/user-created.ts',
    risk: 'a stray hook would run on every signup on every install',
    assert: () => expect(initAppUserCreatedHooks()).toBeUndefined(),
  },
  {
    seam: 'lib/app/mcp-resources.ts',
    risk: 'a stray handler would expose app data over MCP to every install\u2019s connected clients',
    assert: () => {
      __resetAppMcpResourcesForTests();
      // Both readers trigger the lazy init, so this exercises the REAL seam.
      expect(listAppMcpResourceTypes()).toEqual([]);
      // Core's own scheme, and nothing else.
      expect(listAllowedMcpResourceUriSchemes()).toEqual(['sunrise']);
    },
  },
  {
    seam: 'lib/app/platform-agents.ts',
    risk: 'a stray definition would be materialised as an agent in every org on every install \u2014 and, on a slug core already uses, would replace the prompt of an agent every org runs',
    assert: () => {
      __resetPlatformAgentsForTests();
      // The read triggers the lazy init, so this exercises the REAL file:
      // exactly core's definitions, the same objects, in the same order.
      // Know Your Synth fills this seam: pinned to core's definitions and then the tutor, so a stray one still fails.
      const expected = [...CORE_PLATFORM_AGENTS, TUTOR_AGENT];
      expect(listPlatformAgents()).toEqual(expected);
      listPlatformAgents().forEach((definition, i) => expect(definition).toBe(expected[i]));
    },
  },
  {
    seam: 'lib/app/provider-credentials.ts',
    risk: 'a stray credential resolver would send every install\u2019s provider calls out on a key that is not the one its rows name',
    assert: async () => {
      resetProviderCredentialResolver();
      // The read triggers the lazy init, so this exercises the REAL file.
      expect(hasProviderCredentialResolver()).toBe(false);
      // And the default is exactly the env var, on the shared identity.
      process.env.SHIPS_EMPTY_TEST_KEY = 'from-env';
      await expect(
        resolveProviderCredential({
          id: 'p1',
          slug: 'p1',
          name: 'P1',
          providerType: 'anthropic',
          apiKeyEnvVar: 'SHIPS_EMPTY_TEST_KEY',
          isLocal: false,
        })
      ).resolves.toEqual({ apiKey: 'from-env', identity: '' });
      delete process.env.SHIPS_EMPTY_TEST_KEY;
    },
  },
  {
    seam: 'lib/app/evaluations.ts',
    risk: 'a stray grader would appear in every install\u2019s metric picker \u2014 and, on a slug core already uses, would silently rescore every run',
    assert: () => {
      // The registry module is driven directly, so core's barrel has not
      // side-effect-registered anything: whatever listGraders() returns here
      // came from the seam. The read triggers the lazy init, so this exercises
      // the REAL file.
      __resetGraderRegistryForTests();
      // FORK (Know Your Synth): pinned to the tutor's four graders (`f-tutor-knowledge` t-61), the same entries in the
      // same order, so a stray one still fails.
      expect(listGraders()).toEqual([...TUTOR_GRADERS]);
      listGraders().forEach((grader, i) => expect(grader).toBe(TUTOR_GRADERS[i]));
    },
  },
  {
    seam: 'lib/app/account-sections.ts',
    risk: 'a stray section would appear on every install\u2019s /profile and /settings',
    assert: () => {
      __resetAccountSectionRegistryForTests();
      // The read triggers the lazy init, so this exercises the REAL seam.
      // FORK (Know Your Synth): pinned to the synth profile (`f-profiles` r1) and the synths owned and wanted (r2), on
      // settings only, rather than deleted, so a stray extra section still fails. Ledger: .context/app/divergences.md.
      for (const surface of ACCOUNT_SURFACES) {
        expect(getRegisteredAccountSections(surface).map((s) => s.id)).toEqual(
          surface === 'settings' ? ['synth-profile', 'synth-lists'] : []
        );
      }
    },
  },
  {
    seam: 'lib/app/admin-tier.ts',
    risk: 'a stray pattern would open that admin page to every org OWNER/ADMIN on every install — the page only, since its API routes declare their own tier, but a page core meant for platform admins alone',
    assert: () => {
      __resetAppOrgTierAdminPagesForTests();
      // The read triggers the lazy init, so this exercises the REAL seam.
      expect(getAppOrgTierAdminPages()).toEqual([]);
      // …and the roster the layout reads and hands the gate is exactly core's.
      expect(orgTierAdminPages()).toEqual(ORG_TIER_ADMIN_PAGES);
      expect(adminPageTier('/admin/users', orgTierAdminPages())).toBeNull();
    },
  },
  {
    seam: 'lib/app/api-key-scopes.ts',
    risk: 'a stray scope would be mintable on every install \u2014 and a name colliding with a core scope would change what an existing key satisfies',
    assert: () => {
      expect(APP_API_KEY_SCOPES).toEqual([]);
      // …and the union it feeds is exactly core, by value not just by length.
      expect(listValidApiKeyScopes()).toEqual([...CORE_API_KEY_SCOPES]);
    },
  },
  {
    seam: 'lib/app/reserved-tiers.ts',
    risk: 'a stray entry would switch OFF the guard that keeps a reserved tier empty — and it is upstream, where core is the only thing that could put a file there, that the guard is the promise rather than a formality',
    // Know Your Synth fills this seam: pinned to its two tiers, so a stray third still fails.
    assert: () => expect(occupiedTiers).toEqual(['.context/app', 'components/app']),
  },
  {
    seam: 'lib/app/capability-seed-pairs.ts',
    risk: 'a stray pair fails the capability parity test on every install (for a slug no seed writes it is a pair nothing wrote, for a slug core already pairs a duplicate), and a stray unchecked seed switches the parity checks off for that seed',
    assert: () => {
      // FORK (Know Your Synth): pinned to the tutor's eight tools and our two content seeds (t-77) rather than
      // deleted, so a stray pair or unchecked seed still fails. Ledger: .context/app/divergences.md.
      expect(APP_CAPABILITY_PAIRS.map((p) => p.slug)).toEqual([
        'get_panel',
        'describe_synth',
        'propose_panel_change',
        'design_sound',
        'get_pattern',
        'propose_pattern',
        'search_databank',
        'web_search',
      ]);
      expect(Object.keys(APP_UNCHECKED_SEEDS)).toEqual([
        'app-knowyoursynth/001-catalogue.ts',
        'app-knowyoursynth/002-bank.ts',
      ]);
    },
  },
  {
    seam: 'lib/app/brand.ts',
    risk: 'a stray value would rebrand every install — page titles, both footers’ copyright line, the root meta description and every transactional email — and the legal-entity field is a legal-attribution surface, not a cosmetic one',
    // `importActual`, NOT a plain import: tests/setup.ts pins this seam to null
    // for the whole suite so that no core test reads a fork's brand. Importing
    // it normally here would therefore assert the MOCK ships null, which is true
    // by construction and would keep passing in a fork that had filled the real
    // file — turning the one row that tells a fork to pin its value into a row
    // that can never fail.
    // FORK (Know Your Synth): upstream asserts these ship null, which is Sunrise's
    // promise to a fork rather than a fork's promise to itself. Filling the seam
    // is the point of forking, so the row is re-pointed at OUR values instead of
    // deleted — it still fails if the brand changes by accident, which is what
    // the guard was for. Expect this row to conflict on a Sunrise sync; keep
    // ours.
    assert: async () => {
      const seam = await vi.importActual<typeof import('@/lib/app/brand')>('@/lib/app/brand');
      expect(seam.appBrandName).toBe('Know Your Synth');
      expect(seam.appBrandLegalName).toBe('Human-Centric Engineering');
      expect(seam.appBrandDescription).toBe(
        'Learn sound design on hardware synths: explore each panel, patch it, and hear what every control does.'
      );
    },
  },
  {
    seam: 'lib/app/csp.ts',
    risk: 'a stray origin would widen the iframe policy on every install',
    // These values are spliced straight into a response header, so an
    // accidental default here is a security change, not a cosmetic one.
    assert: () => expect(appFrameSrc).toEqual([]),
  },
  {
    seam: 'lib/app/ci.ts',
    risk: 'a stray coverage exclusion would switch the per-file 80% floor OFF for that path on every install, a stray always-run entry would make every scoped run load a test whose file the install may not even have, and a stray ownerless-surface exception would let a route read rows nobody owns without the policy being asked — the first silences a gate, the second breaks the gate that replaced it, the third exempts a file from the authorization seam',
    assert: () => {
      // Know Your Synth fills this seam: pinned to its exclusions, so a stray extra one still fails.
      expect(appCoverageExclusions.map((e) => e.pattern)).toEqual([
        'prototype/**',
        'scripts/check-synths.ts',
        'scripts/build-audio-workers.ts',
        'scripts/record-synth-goldens.ts',
        'scripts/fit-soundkind.ts',
        'scripts/soundkind-sweep-worker.ts',
        'scripts/prototype-synths.ts',
      ]);
      // Know Your Synth fills this seam: pinned to its entries, so a stray extra one still fails.
      expect(appAlwaysRunTests.map((t) => t.path)).toEqual([
        'tests/unit/prototype-boundary.test.ts',
        'tests/unit/lib/app/catalogue/seed-data-boundary.test.ts',
        'tests/unit/lib/app/synths/defs/load-chunks.test.ts',
        'tests/unit/lib/app/synths/defs/goldens.test.ts',
      ]);
      // Know Your Synth fills this seam: pinned to its entries (`f-tutor` t-54, t-56), so a stray extra one still fails.
      expect(appOwnerlessSurfaceExceptions.map((e) => e.path)).toEqual([
        'lib/app/tutor/allowance.ts',
        'app/api/v1/tutor/stream/route.ts',
        'lib/app/tutor/conversation.ts',
      ]);
    },
  },
];

afterEach(() => {
  __resetNavRegistryForTests();
  __resetAccountSectionRegistryForTests();
  __resetAppOrgTierAdminPagesForTests();
  __resetAuthorizationPolicyForTests();
});

describe('lib/app/ seams ship empty', () => {
  it.each(SEAM_DEFAULTS)('$seam registers nothing by default', async ({ assert }) => {
    await assert();
  });

  it.each([
    ['brand', 'brand'],
    ['emails', 'email-override'],
  ])('nothing but this file escapes the suite-wide %s-seam pin', (seam, label) => {
    // tests/setup.ts mocks `@/lib/app/brand` to null for EVERY test file, so
    // that no core test can read a fork's brand and fail for a reason the fork
    // cannot fix (#660/#661). That guarantee holds across all ~1095 test files
    // by construction, but only while nothing escapes the mock.
    //
    // `vi.importActual` is legitimate here and nowhere else: it is what makes
    // the brand row above assert the REAL scaffold rather than the mock, which
    // is what keeps "seams ship empty" able to fail in a fork.
    //
    // `vi.doUnmock` is never right. It REMOVES the pin instead of restoring it,
    // so every later case in that file sees the real seam. That is not
    // hypothetical: it shipped twice during this change — once in this suite's
    // own brand tests (13 cases failed against a filled seam) and once in
    // layout-metadata, where it was invisible only because every remaining case
    // happened to re-stub first. To go back to the null default mid-file,
    // re-`doMock` it; do not unmock it.
    //
    // Matched by REGEX over vitest's whole unmocking surface, not by two string
    // literals. The literal version missed `vi.unmock` — a third escape route —
    // and was also defeated by double quotes or a line-wrapped call. That is the
    // enumerating-guard failure mode this repo keeps meeting: it fails one
    // instance per round. vitest exposes exactly `unmock` and `doUnmock` for
    // removing a mock, so anchoring on `(?:do)?unmock` is exhaustive over the API
    // rather than over the spellings someone happened to think of.
    // The emails pin (#895) is the same shape and the same hazard, so both
    // seams share the guard.
    const seamPath = String.raw`['"\`]@/lib/app/` + seam + String.raw`['"\`]`;
    const unmockRe = new RegExp(String.raw`\bvi\s*\.\s*(?:do)?[Uu]nmock\s*\(\s*` + seamPath);
    const actualRe = new RegExp(String.raw`importActual[\s\S]{0,80}?` + seamPath);

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = readFileSync(full, 'utf8');
        const rel = path.relative(process.cwd(), full);
        if (unmockRe.test(src)) {
          offenders.push(`${rel}: unmocks the pin instead of restoring it`);
        }
        if (actualRe.test(src) && rel !== THIS_FILE) {
          offenders.push(`${rel}: reads the real seam past the pin`);
        }
      }
    };
    walk(path.join(process.cwd(), 'tests'));

    expect(
      offenders,
      `These test files escape the ${label}-seam pin in tests/setup.ts. A fork that ` +
        `fills lib/app/${seam}.ts would see its own values here and fail a core test ` +
        'it cannot fix — the exact class #660 is about. Re-doMock the pinned values ' +
        'instead of unmocking, and leave importActual to this file.'
    ).toEqual([]);
  });

  it('has a row for every seam file in lib/app/', () => {
    // Drift guard: adding a `lib/app/*` seam without adding a row above would
    // leave it silently unprotected. Reads the directory rather than trusting
    // the table to be complete, through the classifier the VERSIONING.md guard
    // uses (#734): a nested `lib/app/<name>/` seam is owed a row keyed
    // `lib/app/<name>/`, and a file of any extension is owed one too.
    const onDisk = scaffoldsOnDisk();

    const covered = new Set(SEAM_DEFAULTS.map((s) => s.seam));
    const missing = onDisk.filter((f) => !covered.has(f) && !UNASSERTED_SEAMS.has(f));
    const stale = [...covered].filter((f) => !onDisk.includes(f));

    expect(missing, 'lib/app/ seam with no row in SEAM_DEFAULTS').toEqual([]);
    expect(stale, 'SEAM_DEFAULTS row for a file that no longer exists').toEqual([]);
  });
});
