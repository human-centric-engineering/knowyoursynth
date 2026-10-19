# Divergence ledger

Every edit Know Your Synth carries to a file Sunrise owns. The next upstream sync would
otherwise rediscover these as conflicts, or clobber them. The rule is `sunrise.divergences` in
the Hub's `hub://process/sunrise-fork`: **an edit to a platform-owned file gets a row here in
the same PR**, and each row names what deletes it.

- **Base:** Sunrise `v0.14.0` (`13c6d292`). `lib/sunrise-version.ts` reads `0.14.0`. The fork
  was cut from `main` at `0e685744` (`v0.13.0-29`) and took `v0.14.0` in t-16. The next sync
  target is the next Sunrise tag. After a sync, move the base to the commit merged.
- **Not rows:**
  - new files (but see "New files in platform directories" below);
  - anything under the fork-owned namespaces (`lib/app/**`, `components/app/**`,
    `.context/app/**`, `prisma/schema/app*.prisma`);
  - seams that ship empty for the fork to fill.

  Those are listed under "Excluded".

- **Re-derive the list (modified and deleted files) with:**
  `git diff --diff-filter=MD --name-only 13c6d292 HEAD -- . ':!lib/app' ':!components/app' ':!.context/app' ':!prisma/schema/app*.prisma' ':!prototype'`
- **Row fields:** files · change · why · on conflict · upstream status · **delete when**.
- **At a sync:** read the rows before you merge, not after. Read the release's changelog against
  the "Delete when" lines, and delete every row the release discharges. For each conflict in a
  file named here, "On conflict" says what to do. The default is to re-apply our change on top of
  upstream's, never to take one side wholesale.

## Code, config and root docs

### Fork identity, package manifest and repo hygiene

- **Files:** `package.json`, `package-lock.json`, `README.md`, `.env.development`
- **Change:**
  - `package.json`: renamed to `knowyoursynth@0.1.0`, with its own description, keywords and
    repository URLs. Adds the `predev`, `prebuild`, `build:audio-workers`, `build:panel-renderer`,
    `check:synths`, `smoke:sounds`, `smoke:profile`, `smoke:tutor` and `bank:reindex` scripts, `esbuild` as a devDependency, and
    the five `@fontsource/*` packages and `@resvg/resvg-js` as dependencies.
  - `package-lock.json`: carries the package rename, plus the transitive patches from
    `npm audit fix` (undici, engine.io, brace-expansion, source-map-js; #8).
  - `README.md`: rewritten as Know Your Synth's.
  - `.env.development`: `PORT=3024`.
- **Why:**
  - This is an application fork, and `APP_VERSION` comes from `package.json` (VERSIONING.md).
  - `predev` and `prebuild` bundle the AudioWorklet and the probe worker into `public/worklets/`
    (decision on f-engine t-2/t-3), and `esbuild` is the bundler they use. They also bundle the
    social card's panel renderer (t-50, `.context/app/sharing.md`), which `@resvg/resvg-js`
    rasterises.
  - The `@fontsource/*` packages self-host the prototype's faces under their real family names,
    which the ported panel names literally (`app/(panel)/layout.tsx`).
  - Port 3024 lets the app run beside the other HCE checkouts (3010–3022, listed in the file).
- **On conflict:**
  - `package.json`: keep ours for name, version, description, keywords and URLs. Take the union
    of the script blocks, `dependencies` and `devDependencies`.
  - `package-lock.json`: keep ours for the root version lines and take upstream's dependency
    changes, then run `npm install --package-lock-only` and `npm run fix:lockfile-libc`. Local
    npm strips every `libc` field.
  - README and `.env.development`: keep ours.
- **Upstream:** app-specific, never going upstream.
- **Delete when:** never. This is the fork's permanent identity. The `predev`/`prebuild` lines go
  only if the worklet and worker stop being built bundles.

### The authenticated nav test, pinned to our nav

- **Files:** `tests/unit/components/layouts/protected-nav.test.tsx`
- **Change:** the default-links case looks for **My synths** rather than **Dashboard** at
  `/dashboard`. That's one line, with a `FORK` comment.
- **Why:** `lib/app/protected-nav.ts` is filled. The case renders whatever the seam exports, and
  the test's own FORK NOTE says to pin the fork's list rather than delete the case, which also
  covers `adminOnly` and prefix matching.
- **On conflict:** take theirs, and re-apply the one-line pin to whichever case asserts the
  default dashboard link.
- **Upstream:** the FORK NOTE points at sunrise#636, the sweep that would make the file
  seam-independent.
- **Delete when:** #636 lands, or the nav goes back to `null`.

### Prototype exclusions in tool config

- **Files:** `.gitignore`, `.prettierignore`, `eslint.config.mjs`, `tsconfig.json`
- **Change:**
  - `.gitignore` ignores `public/worklets/`, the build output of
    `scripts/build-audio-workers.ts`, and `components/app/sharing/generated/panel-render.mjs`, the
    output of `scripts/build-panel-renderer.ts`.
  - `.prettierignore`, ESLint's `ignores` and `tsconfig.json`'s `exclude` each gain `prototype`.
- **Why:**
  - `prototype/` is the original single-file artefact, kept verbatim as the source to port from
    (D3). It is plain JS/JSX on its own `@/` alias. Formatting, linting or type-checking it as app
    code would fail, or would rewrite the reference.
  - The worklet bundles are build products, and their source is `lib/app/synths/audio/`.
- **On conflict:** take theirs and re-add our one line or entry in each file.
- **Upstream:** app-specific, never going upstream.
- **Delete when:**
  - the `prototype` entries: when `prototype/` is removed (f-launch x5, D13);
  - the `public/worklets/` line: when the worklet and worker stop being built into `public/`;
  - the `panel-render.mjs` line: when the social card stops drawing the panel from a bundle.

### CLAUDE.md: the Hub block

- **Files:** `CLAUDE.md`
- **Change:**
  - Replaces Sunrise's own HCE Hub bootstrap block (between the `hce-hub:bootstrap` markers)
    with Know Your Synth's, as served by `get_project_bootstrap` for `know-your-synth`.
  - Deletes the preface above the block, which told a fork to skip the section.
- **Why:** upstream's block names the Sunrise project and the `sunrise-platform` tier, so a Know
  Your Synth session would plan against the wrong board.
- **On conflict:** never take upstream's block. Replace everything between the markers with a
  fresh `get_project_bootstrap` output, and keep the preface deleted. Merge the rest of the file
  as upstream has it.
- **Upstream:** app-specific, never going upstream.
- **Delete when:** never, while the project is coordinated through the Hub.

### VERSIONING.md: the synth library in the Covered list

- **Files:** `VERSIONING.md`
- **Change:** adds six bullets to the `lib/app/` Covered list: `lib/app/synths/` (the contract,
  the engine, the validator and the definition registry), `lib/app/catalogue/` (seeding the
  catalogue and reading it for the API), `lib/app/bank/` (the same for the databank),
  `lib/app/sounds/` (users' own sounds, `f-my-sounds` s1), `lib/app/profile/` (synth profiles,
  `f-profiles` r1) and `lib/app/tutor/` (the tutor's agent, tools and context, `f-tutor` t-53).
- **Why:** the public-surface guard treats everything under `lib/app/` as public surface and
  fails on an unlisted path. Its fork note names this as the fix (decision on f-engine
  t-2/t-3).
- **On conflict:** take theirs and re-insert our six bullets in the `lib/app/` list, in
  alphabetical order.
- **Upstream:** not raised. A guard that read the fork's own list from a fork-owned file would
  remove this row.
- **Delete when:** none while synth, catalogue, databank, sounds, profile or tutor code lives in `lib/app/`, or when the guard
  reads fork scaffolds from a fork-owned file.

### The reserved-tier test, pinned to our app models

- **Files:** `tests/unit/reserved-fork-tiers.test.ts`
- **Change:** the `prisma/schema/app.prisma declares no models` case expects the catalogue's
  declarations (five models and three enums), the databank's (thirteen models), the synth
  suggestions' (one model and one enum, `f-databank` t-37), user sounds' (one model,
  `f-my-sounds` s1), reports about shared sounds (one model and two enums, `f-sharing` h4), user preferences' (two models, s3), lesson progress and favourites' (two
  models, s4), synth profiles' (two models, `f-profiles` r1) and the synths owned and wanted (one
  model and one enum, r2) instead of none, under a `FORK` comment.
- **Why:** `app.prisma` is where CUSTOMIZATION.md tells a fork to put its models, and the test's
  own header says a fork with app models pins that row rather than deleting it, so a stray extra
  declaration still fails.
- **On conflict:** take theirs, and re-apply the pin to whichever case asserts `app.prisma` is
  empty. Add each new app model to the list as it lands.
- **Upstream:** working as designed upstream; nothing to raise.
- **Delete when:** never, while the fork has app models, unless upstream makes the case read a
  fork-owned declaration.

### The catalogue and databank tables on the global-config list, and synth suggestions and users' own rows on the system list

- **Files:** `lib/tenancy/classification.ts`
- **Change:** `Synth`, `SynthSound`, `SynthLineage`, `SynthNote` and `CatalogueSeedRecord` (the
  seed's record of what it planned, `f-catalogue-admin` t-32) are appended to
  `GLOBAL_CONFIG_MODELS`, under a one-line comment. The thirteen databank tables (`BankMaker` …
  `BankRemoval`, `f-databank` t-34 and t-36) follow under a second one. `SynthSuggestion` (t-37),
  `UserSound` (`f-my-sounds` s1), `SynthPreference` and `UserPreference` (s3), `LessonProgress` and
  `Favourite` (s4), `SynthProfile` and `HeldUsername` (`f-profiles` r1), `OwnedInstrument` (r2) and `SoundReport`
  (`f-sharing` h4) are appended to `SYSTEM_MODELS` after `ContactSubmission`, under their own comment.
- **Why:** `model-classification.test.ts` fails on any model that is neither tenant-owned nor on
  one of the two lists, and the lists have no fork seam. The catalogue and the databank are
  product content every org shares, so they are global config (owner ruling on `f-model-d`,
  2026-10-07). A synth suggestion carries its user, but it feeds that shared databank and is
  decided from one queue, so scoping it to an org would hide it from the admins who act on it. It
  is not a shared setting, which is what `GLOBAL_CONFIG_MODELS` means to the shared-settings guard
  (`scripts/ci/shared-settings-writes.ts`). That guard would refuse the signed-in user's `POST`.
  So it joins `ContactSubmission`, the same shape of inbound queue, on `SYSTEM_MODELS`. A user's
  own sounds are theirs whichever org they act in, and are never a shared setting either, so
  `UserSound` joins it there with no `orgId` (owner ruling on `f-my-sounds`, 2026-10-15). Their last
  panels, settings, lesson progress, favourites, profiles and owned synths follow the same ruling, and so do the
  usernames held after a change, which record a name and no person. Reports about shared sounds are an inbound queue
  about those sounds, decided from one place, so they sit beside them.
- **On conflict:** take theirs, re-append our eighteen names (and the two comments) to the end
  of `GLOBAL_CONFIG_MODELS`, and re-add `SynthSuggestion`, `UserSound`, `SoundReport`, `SynthPreference`, `UserPreference`, `LessonProgress`, `Favourite`, `SynthProfile`, `HeldUsername` and `OwnedInstrument` (and their comment) after
  `ContactSubmission` in `SYSTEM_MODELS`.
- **Upstream:** sunrise#964 asks for a fork seam for classification.
- **Delete when:** sunrise#964 lands. Move the twenty-eight names (eighteen global, ten system) into the new seam's scaffold.

### The real-registry counts, pinned to the tutor

- **Files:** `tests/unit/lib/orchestration/agents/reconcile-platform-agents.test.ts`,
  `scripts/smoke/tenancy-isolation.ts`
- **Change:** the `materialises the real registry` case expects one more agent in the install org
  than core defines (17, the tutor `synth-tutor` among them) and the tutor in no other org, under a
  `FORK` comment (`f-tutor` t-53). The two-org smoke's step [11] check expects five install-only
  agents, the tutor among them, not four.
- **Why:** the case reads the real registry, which runs the fork's `initAppPlatformAgents()`, so
  filling `lib/app/platform-agents.ts` necessarily changes its count (`HB2`). It reaches the seam
  through the registry rather than importing it, so `fork-seam-coupling.test.ts` does not ask it
  for a fork note, and a fork meets the failure with nothing to read.
- **On conflict:** take theirs, and re-apply the pin to whichever case or check counts the real
  registry's install-org agents.
- **Upstream:** raised as
  [sunrise#1032](https://github.com/human-centric-engineering/sunrise/issues/1032): mock the seam
  in that case, or give it a fork note.
- **Delete when:** upstream stops counting the fork's agents in both places, or the fork registers
  no platform agent.

### The drift-probe scaffold test, pinned to our probe

- **Files:** `tests/unit/lib/db/drift-probes.test.ts`
- **Change:** the `shipped lib/app/db-drift.ts scaffold` case expects our probes' names (the
  hand-written `synth_suggestion_userId_fkey`, `f-databank` t-37, `user_sound_userId_fkey`,
  `f-my-sounds` s1, `synth_preference_userId_fkey` and `user_preference_userId_fkey`, s3, and
  `lesson_progress_userId_fkey` and `favourite_userId_fkey`, s4, and `synth_profile_userId_fkey`
  and `owned_instrument_userId_fkey`, `f-profiles` r1 and r2, and `sound_report_reporterId_fkey`
  and `sound_report_resolvedById_fkey`, `f-sharing` h4) instead of none, under a `FORK` comment.
- **Why:** filling `lib/app/db-drift.ts` necessarily breaks the case that asserts it ships empty
  (`HB2`). Pinning keeps a stray extra probe failing.
- **On conflict:** take theirs, and re-apply the pin to whichever case asserts the scaffold
  registers nothing.
- **Upstream:** working as designed upstream; nothing to raise.
- **Delete when:** the fork no longer registers a drift probe.

### The raw-SQL allowlist, with our row locks and the lesson's removal

- **Files:** `tests/unit/db-raw-sql-allowlist.test.ts`
- **Change:** `ALLOWLIST` admits our raw-SQL sites, each with its reason: the `FOR UPDATE` row
  locks in `lib/app/catalogue/edit.ts` (`f-catalogue-admin`), `lib/app/profile/instruments.ts`
  (`f-profiles` r2), `lib/app/sounds/reports.ts` and `lib/app/sounds/sharing.ts` (`f-sharing` h1
  and h4), and the `UPDATE` in `lib/app/sounds/store.ts` that removes a sound's lesson (`f-tutor`
  t-55, under a `FORK` comment). The first four were added without a row here; t-55 records them.
- **Why:** the guard fails on any raw-SQL call in `lib/**` or `app/**` it does not list, and the
  list has no fork seam. Each site touches only system models (`user`, `user_sound`, `synth`), keyed
  on bound parameters, so none needs the tenancy policies the guard is watching for.
- **On conflict:** take theirs, and re-add our five entries in path order (the test checks the
  order).
- **Upstream:** working as designed upstream: the guard asks a fork to admit its own sites.
- **Delete when:** a fork seam for the allowlist exists, or the fork has no raw SQL.

### The databank's pages and published sounds in the sitemap

- **Files:** `app/sitemap.ts`, `tests/unit/app/public/sitemap.test.ts`
- **Change:** the function is `async` and `force-dynamic`, and spreads two lists into its page
  list: `bankSitemapPaths()` (`components/app/bank/sitemap.ts`: `/bank`, each other tab and every
  databank row), then `sharingSitemapPaths()` (`components/app/sharing/sitemap.ts`: `/explore` and
  every published sound, never a link share). Two imports and a comment line besides. The test
  mocks both and expects their entries after the platform's.
- **Why:** the plan names `sitemap.ts` among the platform files the fork edits (plan §5), and both
  lists are in the tables, so they are read per request rather than at build. There is no fork
  seam for sitemap entries.
- **On conflict:** take theirs, then re-apply the imports, `force-dynamic`, `async` and the two
  spreads at the end of `publicPages`, in that order.
- **Upstream:** filed when `/explore` became the second surface (`f-sharing` h2): ISSUE_LINK.
- **Delete when:** Sunrise ships a seam for sitemap entries. Move both calls into it.

### My sounds, favourites and lessons on the dashboard

- **Files:** `app/(protected)/dashboard/page.tsx`, `tests/unit/app/(protected)/dashboard/page.test.tsx`
- **Change:**
  - `page.tsx`: renders `<SynthCards userId={user.id} />`
    (`components/app/dashboard/synth-cards.tsx`, which draws the my-sounds, favourites and lessons
    cards) between the stats row and Quick Actions. One import and the element, each with a `FORK`
    comment.
  - `page.test.tsx`: stubs `SynthCards` the way it already stubs `EmailStatusCard`, with a `FORK`
    comment. The cards are async server components, which the test's client render cannot draw,
    and they have their own tests.
- **Why:** `f-my-sounds` s2 (t-40) lists the user's sounds on `/dashboard`, which the app calls
  My synths, and s4 (t-42) adds their favourites and lessons. Sunrise has no seam for dashboard
  content. The cards share one fork element, so a further card is not a further edit here.
- **On conflict:** take theirs, then re-add the import and the element wherever the page's cards
  now sit, and the stub beside the test's other component stubs.
- **Upstream:** none filed. A dashboard-sections seam would remove the row.
- **Delete when:** Sunrise ships a seam for dashboard content. Move `SynthCards` into it.

### CI pulls Docker Hub images logged in

- **Files:** `.github/workflows/ci.yml`
- **Change:**
  - The `postgres` service in `smoke` and `smoke-multi` gains a `credentials:` expression built
    from `secrets.DOCKERHUB_USERNAME` / `secrets.DOCKERHUB_TOKEN`. It is an empty mapping when either is
    empty, because GitHub rejects the workflow if `username` or `password` is an empty string
    (and turns `null` into one).
  - The `docker` job gains `DOCKERHUB_USERNAME` in its job `env`, and a `docker/login-action`
    step before Buildx, gated on that variable being non-empty.
  - Each change carries a `FORK` comment.
- **Why:** GitHub's shared runners hit Docker Hub's anonymous pull limit. On 2026-10-09 #23's
  smoke jobs failed twice before running a test (t-17). With the secrets absent (forks, Dependabot),
  there are no credentials and the login step is skipped, so pulls stay anonymous as before.
- **On conflict:** take theirs, then re-add the two `credentials:` expressions, the job env line
  and the login step.
- **Upstream:** asked as sunrise#976.
- **Delete when:** sunrise#976 lands with an equivalent that reads the same secret names (or we
  rename ours to match).

### The card rasteriser as a server external

- **Files:** `next.config.js`
- **Change:** `serverExternalPackages` gains `@resvg/resvg-js`, with a comment naming this row.
- **Why:** a shared sound's social card draws the panel and rasterises it with resvg (t-50,
  `.context/app/sharing.md`). resvg loads a platform-specific `.node` binary by package name, and
  the bundler cannot resolve that ("could not resolve `@resvg/resvg-js-darwin-arm64`"). Kept
  external, it loads from `node_modules` at runtime, as `@napi-rs/canvas` does beside it. No seam
  takes app packages for this list.
- **On conflict:** take theirs and re-add the one entry, with its comment, at the end of the list.
- **Upstream:** app-specific. A seam for app server externals would remove the row; none is filed
  yet.
- **Delete when:** the card stops using resvg, or Next lists `@resvg/resvg-js` among its built-in
  server externals (`next/dist/lib/server-external-packages.jsonc`), or Sunrise gains a seam for
  app server externals.

### Eval graders see what each tool call returned

- **Files:** `lib/orchestration/evaluations/run-worker.ts`,
  `lib/orchestration/evaluations/graders/types.ts`,
  `lib/orchestration/evaluations/drain-stream-chat.ts`
- **Change:** `GraderInput.toolCalls` items gain optional `success`, `errorCode` and
  `resultPreview`, and `processOneCase` fills them from each agent subject's tool-call trace, under
  `FORK` comments (`f-tutor-knowledge` t-61). The stored `subjectMetadata.toolCalls` keeps
  `{ slug, args }` only. `drainStreamChat` also collects the traces of a `capability_results` frame
  (a turn's parallel tool calls), which it dropped, so a turn that searched the databank and the
  web at once reached the graders with no tool calls.
- **Why:** the tutor's eval graders check what its searches found (owner ruling, 2026-10-19,
  journaled on `f-tutor-knowledge`), and core passed graders only each call's name and arguments.
  Behaviour-neutral at rest: nothing stored changes, and core's graders ignore the new fields.
  `tests/unit/lib/app/tutor/evals/worker-seam.test.ts` fails if the fields are dropped.
- **On conflict:** take theirs, and re-apply the three fields where `processOneCase` maps the
  trace, the `{ slug, args }` map where it stores `subjectMetadata`, and the `capability_results`
  case in `drainStreamChat` unless upstream now handles it. Keep the field names: the
  graders read them.
- **Upstream:** raised as
  [sunrise#1044](https://github.com/human-centric-engineering/sunrise/issues/1044).
- **Delete when:** upstream passes graders each call's result (switch the graders to its field
  names if they differ), or the fork drops its tutor graders.

### The grader parity test, leaving out our graders

- **Files:** `tests/unit/lib/orchestration/evaluations/graders/registry-parity.test.ts`
- **Change:** the tutor's grader slugs are left out of the test's `extra`, under a `FORK` comment
  (`f-tutor-knowledge` t-61).
- **Why:** the test reads the registry, which runs the fork's `initAppGraders()`, so filling
  `lib/app/evaluations.ts` necessarily adds slugs `KNOWN_GRADER_SLUGS` doesn't list (`HB2`). The
  graders are pinned in `defaults.test.ts`, so a stray one still fails there.
- **On conflict:** take theirs, and re-apply the exclusion to whichever check counts the registry's
  extra slugs.
- **Upstream:** raised as
  [sunrise#1045](https://github.com/human-centric-engineering/sunrise/issues/1045), the same shape
  as sunrise#1032.
- **Delete when:** upstream stops counting the fork's graders there, or the fork registers no
  grader.

### The home, about and contact pages, as thin shims

- **Files:** `app/(public)/page.tsx`, `app/(public)/about/page.tsx`, `app/(public)/contact/page.tsx`
- **Change:** each is a one-line re-export of `components/app/marketing/{home,about,contact}-page.tsx` (default
  export and `metadata`) under an `app:shim` comment. The pages' content and copy (`.context/app/planning/site-copy.md`
  §1–3) live in those modules. Contact still renders Sunrise's `<ContactForm>`, unchanged.
- **Why:** `f-front-door` t-63. Sunrise's pages carry its own placeholder copy, and CUSTOMIZATION.md §6 documents the
  thin-shim as the way to replace it: the App Router resolves `/`, `/about` and `/contact` from these paths, so the
  route files must be touched, and a one-line shim is the smallest touch.
- **On conflict:** keep ours, the one line each. If upstream changed the pages' behaviour rather than their copy (a new
  metadata field, a change to how Contact uses the form), carry that into our module.
- **Upstream:** CUSTOMIZATION.md §6 defers a marketing content seam until more forks need one.
- **Delete when:** Sunrise ships that seam. Move the modules behind it and restore the route files.

### The footer tests, pinned to the not-affiliated notice

- **Files:** `tests/unit/components/layouts/public-footer.test.tsx`,
  `tests/unit/components/layouts/protected-footer.test.tsx`, `tests/unit/brand-fork-surfaces.test.tsx`
- **Change:**
  - `public-footer.test.tsx` and `protected-footer.test.tsx`: the default cases, which render whatever
    `lib/app/footer.ts` exports, look for the notice rather than `© {year} Sunrise`. Each pin has a `FORK` comment.
  - `brand-fork-surfaces.test.tsx`: mocks `lib/app/footer.ts` to `null`, hoisted, with a `FORK` comment. Its
    copyright cases test that the platform default names the legal entity, which the notice does not.
- **Why:** `lib/app/footer.ts` is filled with the not-affiliated notice (`f-front-door` t-63). Both footer tests'
  FORK NOTEs say to pin the fork's value rather than delete the cases (`HB2`), which keeps the `false` and
  verbatim-string cases and the Cookie Preferences guard.
- **On conflict:** take theirs, then re-apply the pins to whichever cases render the unmocked seam, and the hoisted
  mock beside the brand-fork file's other mocks.
- **Upstream:** the FORK NOTEs point at sunrise#636, the sweep that would make the files seam-independent.
- **Delete when:** #636 lands, or `footerCopyright` goes back to `null`.

## New files in platform directories

These aren't rows. A new file can't conflict until Sunrise adds a file at the same path, which
is an add/add conflict, and the modified-files list above never shows one. List the fork's new
files outside the reserved namespaces with:

`git diff --diff-filter=A --name-only 13c6d292 HEAD -- . ':!lib/app' ':!components/app' ':!.context/app' ':!prisma/schema/app*.prisma'`

Today they are:

- `prototype/**`, which goes at f-launch x5;
- `app/(panel)/**`, the synth page's route group;
- `app/(public)/bank/**`, the databank's pages;
- `app/api/v1/bank/**` and `app/api/v1/admin/bank/**`, the databank's API and its suggestions;
- `app/api/v1/tutor/**`, the tutor's stream and allowance routes;
- `app/admin/synths/**`, the Synths admin pages;
- `scripts/build-audio-workers.ts`, `scripts/build-panel-renderer.ts`, `scripts/check-synths.ts` and
  `scripts/smoke/tutor.ts`;
- `prisma/migrations/*_catalogue/` and the fork's later migrations;
- `prisma/seeds/app-knowyoursynth/**`, the fork's seed units and their data;
- `tests/fixtures/synths/**`;
- `tests/unit/prototype-boundary.test.ts`;
- the tests for fork-owned code, under `tests/unit/lib/app/synths/**`, `tests/unit/lib/app/tutor/**`
  (with `tests/helpers/tutor.ts`), `tests/unit/app/api/v1/tutor/**`, `tests/unit/components/app/**`, `tests/unit/app/panel/**` and
  `tests/unit/app/public/bank-pages.test.tsx`.

Before a sync, intersect that list with `git diff --diff-filter=A --name-only <base> <target>`.

## Excluded: filled seams

- `lib/app/brand.ts`, `lib/app/ci.ts`, `lib/app/reserved-tiers.ts`, `lib/app/protected-nav.ts`,
  `lib/app/public-nav.ts` (the header list only, with Explore),
  `lib/app/auth-landing.ts` (the label only), `lib/app/data-export.ts` (synth suggestions exported;
  the catalogue and databank tables excluded), `lib/app/db-drift.ts` (the suggestion FK's probe) and
  `lib/app/admin-nav.ts` (the "Synths" admin section) and `lib/app/account-sections.ts` (the synth
  profile and the synths owned and wanted, on settings only), `lib/app/jobs.ts` (the prune of lapsed held usernames, and the databank's projection into
  the knowledge base, `f-tutor-knowledge` t-58),
  `lib/app/eslint.config.mjs` (one ignore, for the social card's generated panel renderer, t-50), and
  `lib/app/capabilities.ts`, `lib/app/context-contributors.ts` and `lib/app/platform-agents.ts` (the tutor's
  tools, synth context and agent, `f-tutor` t-53), and `lib/app/env.ts` (the tutor's daily allowance,
  `TUTOR_DAILY_TURNS`, t-54; the tutor's web search key, `BRAVE_SEARCH_API_KEY`, t-59), and
  `lib/app/evaluations.ts` (the tutor's four eval graders, `f-tutor-knowledge` t-61), and `lib/app/footer.ts` (the
  not-affiliated notice, `f-front-door` t-63): fork-owned scaffolds,
  filled.
- `app/brand-theme.css`: the consumer surface's palette. It ships empty for the fork
  (`.context/ui/surface-theming.md`).
- `tests/unit/lib/app/defaults.test.ts`: the `SEAM_DEFAULTS` rows for the filled seams (`brand`,
  `ci`, `reserved-tiers`, `protected-nav`, `public-nav`, `auth-landing`, `data-export`, `admin-nav`,
  `account-sections`, `jobs`, `eslint.config`, `capabilities`, `context-contributors`,
  `platform-agents`, `env`, `evaluations`, `footer`) are re-pinned to our values rather than deleted (`HB2`). CUSTOMIZATION
  §4 calls this the one unavoidable cost. The file is platform-owned, so expect it to conflict on
  a sync. Keep our assertions, and take upstream's new rows.
