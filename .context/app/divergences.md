# Divergence ledger

Every edit Know Your Synth carries to a file Sunrise owns. The next upstream sync would
otherwise rediscover these as conflicts, or clobber them. The rule is `sunrise.divergences` in
the Hub's `hub://process/sunrise-fork`: **an edit to a platform-owned file gets a row here in
the same PR**, and each row names what deletes it.

- **Base:** Sunrise `main` at `0e685744` (`v0.13.0-29-g0e685744`). `lib/sunrise-version.ts`
  reads `0.13.0`. The fork was cut from `main`, not from a tag, so the base is that commit. The
  next sync target is the next Sunrise tag. After a sync, move the base to the commit merged.
- **Not rows:**
  - new files (but see "New files in platform directories" below);
  - anything under the fork-owned namespaces (`lib/app/**`, `components/app/**`,
    `.context/app/**`, `prisma/schema/app*.prisma`);
  - seams that ship empty for the fork to fill.

  Those are listed under "Excluded".

- **Re-derive the list (modified and deleted files) with:**
  `git diff --diff-filter=MD --name-only 0e685744 HEAD -- . ':!lib/app' ':!components/app' ':!.context/app' ':!prisma/schema/app*.prisma' ':!prototype'`
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
    repository URLs. Adds the `predev`, `prebuild`, `build:audio-workers` and `check:synths`
    scripts, `esbuild` as a devDependency, and the five `@fontsource/*` packages as
    dependencies.
  - `package-lock.json`: carries the package rename, plus the transitive patches from
    `npm audit fix` (undici, engine.io, brace-expansion, source-map-js; #8).
  - `README.md`: rewritten as Know Your Synth's.
  - `.env.development`: `PORT=3024`.
- **Why:**
  - This is an application fork, and `APP_VERSION` comes from `package.json` (VERSIONING.md).
  - `predev` and `prebuild` bundle the AudioWorklet and the probe worker into `public/worklets/`
    (decision on f-engine t-2/t-3), and `esbuild` is the bundler they use.
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
    `scripts/build-audio-workers.ts`.
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
  - the `public/worklets/` line: when the worklet and worker stop being built into `public/`.

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
- **Change:** adds two bullets to the `lib/app/` Covered list: `lib/app/synths/` (the contract,
  the engine, the validator and the definition registry) and `lib/app/catalogue/` (seeding the
  catalogue and reading it for the API).
- **Why:** the public-surface guard treats everything under `lib/app/` as public surface and
  fails on an unlisted path. Its fork note names this as the fix (decision on f-engine
  t-2/t-3).
- **On conflict:** take theirs and re-insert our two bullets in the `lib/app/` list, in
  alphabetical order.
- **Upstream:** not raised. A guard that read the fork's own list from a fork-owned file would
  remove this row.
- **Delete when:** none while synth or catalogue code lives in `lib/app/`, or when the guard reads fork
  scaffolds from a fork-owned file.

### The catalogue tables on the global-config list

- **Files:** `lib/tenancy/classification.ts`
- **Change:** `Synth`, `SynthSound`, `SynthLineage` and `SynthNote` are appended to
  `GLOBAL_CONFIG_MODELS`, under a one-line comment.
- **Why:** `model-classification.test.ts` fails on any model that is neither tenant-owned nor on
  one of the two lists, and the lists have no fork seam. The catalogue is product content every
  org shares, so it is global config (owner ruling on `f-model-d`, 2026-10-07). The databank
  tables (`f-databank`) will join the same lines.
- **On conflict:** take theirs, and re-append our four names (and the comment) to the end of
  `GLOBAL_CONFIG_MODELS`.
- **Upstream:** sunrise#964 asks for a fork seam for classification.
- **Delete when:** sunrise#964 lands. Move the four names into the new seam's scaffold.

## New files in platform directories

These aren't rows. A new file can't conflict until Sunrise adds a file at the same path, which
is an add/add conflict, and the modified-files list above never shows one. List the fork's new
files outside the reserved namespaces with:

`git diff --diff-filter=A --name-only 0e685744 HEAD -- . ':!lib/app' ':!components/app' ':!.context/app' ':!prisma/schema/app*.prisma'`

Today they are:

- `prototype/**`, which goes at f-launch x5;
- `app/(panel)/**`, the synth page's route group;
- `scripts/build-audio-workers.ts` and `scripts/check-synths.ts`;
- `prisma/migrations/*_catalogue/` and the fork's later migrations;
- `prisma/seeds/app-knowyoursynth/**`, the fork's seed units and their data;
- `tests/fixtures/synths/**`;
- `tests/unit/prototype-boundary.test.ts`;
- the tests for fork-owned code, under `tests/unit/lib/app/synths/**`,
  `tests/unit/components/app/**` and `tests/unit/app/panel/**`.

Before a sync, intersect that list with `git diff --diff-filter=A --name-only <base> <target>`.

## Excluded: filled seams

- `lib/app/brand.ts`, `lib/app/ci.ts`, `lib/app/reserved-tiers.ts`, `lib/app/protected-nav.ts`,
  `lib/app/auth-landing.ts` (the label only) and `lib/app/data-export.ts` (the catalogue tables,
  excluded): fork-owned scaffolds, filled.
- `app/brand-theme.css`: the consumer surface's palette. It ships empty for the fork
  (`.context/ui/surface-theming.md`).
- `tests/unit/lib/app/defaults.test.ts`: the `SEAM_DEFAULTS` rows for the filled seams (`brand`,
  `ci`, `reserved-tiers`, `protected-nav`, `auth-landing`, `data-export`) are re-pinned to our values rather than deleted (`HB2`). CUSTOMIZATION
  §4 calls this the one unavoidable cost. The file is platform-owned, so expect it to conflict on
  a sync. Keep our assertions, and take upstream's new rows.
