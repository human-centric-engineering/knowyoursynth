# My sounds

`f-my-sounds`. A signed-in user's own sounds: a panel they left on a synth, named and kept under
their account. s1 is the store and the API; s2 puts them on the synth page and the dashboard. s3
keeps their settings and the last panel on each synth in the account as well, so both follow them
to another device. A browser that is not signed in keeps them in browser storage only
([`synth-page.md`](./synth-page.md)).

## The table

`UserSound` (`prisma/schema/app.prisma`): the synth, the definition version the panel was saved
on, a name and notes, the panel's control values and cables, and, for a copy, the library sound
it was copied from.

- **The credit is a link and a snapshot.** `sourceSoundId` points at the `SynthSound` row,
  `ON DELETE SET NULL`. `sourceSlug`, `sourceName` and `sourceRef` keep what that sound read when
  it was copied, so the credit survives it being renamed or removed. The link holds across seeds:
  the catalogue seed and the admin create a library sound once and then update it by synth and
  slug, and nothing deletes one.
- **The user's foreign key is written by hand.** `userId` is a plain string, since a Prisma
  relation would need a field on the platform's `User`. The migration adds
  `user_sound_userId_fkey`, `ON DELETE CASCADE`, so `eraseUser()` erases a user's sounds with
  them. A drift probe in `lib/app/db-drift.ts` pins it.
- **It is declared for export.** `lib/app/data-export.ts` returns a user's sounds, panels
  included, under `app.sounds` in their subject-access export.
- **It is on `SYSTEM_MODELS`, with no `orgId`.** A user's sounds are theirs whichever org they act
  in (owner ruling, 2026-10-15). Ledger row in [`divergences.md`](./divergences.md).
- **The synth is `Restrict`.** Nothing deletes a `Synth` row; if something ever does, it has to
  decide what happens to the sounds made on it first.

## The API

Signed in, owner-scoped, under the proxy's `/api/v1` section cap. Another user's sound is a 404,
the same as one that does not exist, never a 403.

- `GET /api/v1/sounds[?synthId=]`: the caller's sounds, most recently changed first, without
  their panels. Each says whether it is `playable`.
- `POST /api/v1/sounds`: `{ synthId, name, notes?, panel: { values, cables } }`. A copy names the
  library sound, `{ synthId, source: { slug }, name?, notes?, panel? }`: with no panel it is the
  library sound as it ends, every step applied, and with no name it takes the library sound's.
  201 with the sound.
- `GET /api/v1/sounds/:id`: the sound with its panel. One that is not `playable` has no `panel`,
  but carries `fitted`: as much of it as fits the synth now, which the page opens.
- `PATCH /api/v1/sounds/:id`: `{ name?, notes?, panel? }`. `notes: null` clears them.
- `DELETE /api/v1/sounds/:id`

The rules live in `lib/app/sounds/store.ts`, the shapes in `lib/app/sounds/data.ts`, each tested
in `tests/unit/app/api/v1/sounds/route.test.ts`:

- **A panel is checked on write** with `validateSound` (`lib/app/synths/validate.ts`) against the
  synth's current definition, and refused with every problem named. It is never repaired. A new
  panel is saved on the current definition version.
- **And on read.** A sound saved on another definition version needs the mapping D1 requires
  (plan §5). No definition has one yet, so such a sound is listed and kept, `playable: false`,
  with no panel and the reason in `problems`, and `fitted` holds what of it still fits (controls
  the synth no longer has and cables to missing jacks dropped, values clamped, missing controls at
  their `init`). Saving a new panel over it brings it up to date.
  When the first rename ships a mapping, it is applied in `panelOf`.
- **Only a listed synth takes a new sound**, as only a listed synth has a page.

`npm run smoke:sounds` proves against the dev database what the unit tests cannot: the cascade
through `eraseUser()`, and the export.

## On the synth page and the dashboard (s2)

`components/app/synth/my-sounds.tsx`, wired into `synth-page.tsx`; tested in
`tests/unit/components/app/synth/synth-page-mine.test.tsx`.

- **My sounds sits above the library**: this synth's sounds, from one `GET ?synthId=`, kept in step
  with what each save returns rather than re-read.
- **Which buttons show depends on what is on the panel.** One of the user's sounds: Save (`PATCH`
  the panel), Save as… (a new sound), Rename… (name and notes, panel untouched) and Delete… (asks
  first; the panel stays). A library sound: Save a copy…, which `POST`s the panel as it is now with
  `source`, so the copy keeps its credit. Save as of a copy keeps the credit while the library still
  has the sound.
- **The open sound is `soundId` in the stored session.** Choosing a library sound or a lesson step
  clears it, since either replaces the panel. It counts as open only when the user's list has it,
  so a sound deleted elsewhere, or a session left by someone else on the same browser, opens
  nothing; until the list has loaded no Save buttons show, so Save cannot make a new sound in
  place of saving the open one. "Controls moved" and Restore count from the sound as last saved,
  which a reload fetches again.
- **Opening one sets the lesson to the library sound it was copied from**, or to none when it is
  not a copy, so nothing credits a library sound that happened to be on the panel before. One
  saved on another synth does not open, and when two are clicked quickly the last one clicked
  wins.
- **A sound the synth has moved on from opens with `fitted`**, and the page says what did not fit.
  Saving it then stores it on the current definition.
- **Signed out, the buttons lead to sign-in** with `callbackUrl` set to this synth and view. The
  panel is already in `kys.session.<id>` and is written when the page unmounts, so it is there when
  the user comes back.
- **The name form is inline, not a modal `<dialog>`**: its ⓘ help opens in a popover outside the
  dialog, which a modal dialog would leave inert behind it.
- **`/dashboard` lists every one of the user's sounds**
  (`components/app/dashboard/my-sounds-card.tsx`, in-process reads, as the synth route makes
  them), each linking to `/synths/<id>?mine=<sound>`. A
  sound on a synth no longer listed has no link. The card is a platform-file edit, ledgered in
  [`divergences.md`](./divergences.md).

## Settings and the last panel, in the account (s3)

What the page keeps in browser storage as `kys.tips`, `dim`, `heat`, `harm`, `fx` and
`kys.session.<id>` is kept under a signed-in user's account too. The screen-only keys
(`kys.synth`, `view`, `fxOpen`, `midi`) stay in the browser (D4). There is no stored scope setting,
so the plan's "scope" has no row.

- **Two tables**, beside `UserSound` on `SYSTEM_MODELS` with no `orgId`, each with a hand-written
  `ON DELETE CASCADE` user FK pinned by a drift probe, and each declared for export
  (`app.synthPanels`, `app.synthSettings`). `SynthPreference` is keyed on user and synth, and holds
  the `kys.session` shape with the definition version. `UserPreference` is one row per user: a
  null column is a setting the account has no value for yet.
- **The API** (`app/api/v1/me/`; rules in `lib/app/sounds/preferences.ts`, shapes in
  `preference-data.ts`, tested in `tests/unit/app/api/v1/me/route.test.ts`):
  - `GET`/`PATCH /api/v1/me/settings`. `PATCH` takes the settings that changed. It is not
    `/api/v1/users/me/preferences`, which is the platform's.
  - `GET`/`PUT /api/v1/me/panels/:synthId`. `GET` is `null` when there is none. `PUT` is checked
    with `validateSound` and refused when anything is wrong, as a saved sound is; only a listed
    synth takes one. `GET` fits the stored panel to the synth as it is now (values clamped, what it
    no longer has dropped), as the page fits its own copy: it is only where the user left off.
- **On the page** (`components/app/synth/account-storage.ts` and `settings.ts`, wired through
  `useStoredSession` and `useSettings`; tested in `synth-page-account.test.tsx`):
  - Browser storage is still written on every change, as before.
  - Once signed in, the account's last panel replaces the browser's, and its settings beat the
    browser's. Where the account has no value yet, the browser's fills it, once. A change made
    before the account answered beats both. If the account cannot be read, nothing is sent to it
    that visit, so an older panel never overwrites a newer one.
  - **The account is written less often than the browser.** The browser is written 400 ms after the
    panel goes still, which sent to the server would pass the section's 100 a minute during play.
    The account copy goes 5 s after changes stop, and at least every 30 s while they keep coming:
    at most 12 a minute from each writer. Leaving the page, or moving to another synth, sends what
    is waiting with `keepalive`.
- Signed out, none of this runs.

`npm run smoke:sounds` also proves the two tables' cascades through `eraseUser()` and their export
sections.
