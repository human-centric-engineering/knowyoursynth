# My sounds

`f-my-sounds`. A signed-in user's own sounds: a panel they left on a synth, named and kept under
their account. s1 is the store and the API; s2 puts them on the synth page and the dashboard. s3
keeps their settings and the last panel on each synth in the account as well, so both follow them
to another device. s4 keeps how far they got through each lesson, and what they starred. A browser that is not signed in keeps them in browser storage only
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
  - `GET`/`PATCH /api/v1/me/settings`. `PATCH` takes the settings that changed; its `fx` must be
    exactly what `normalizeFx` returns (every field, in range, nothing more), checked against
    `normalizeFx` itself, so a field added to the rack needs no schema change. It is not
    `/api/v1/users/me/preferences`, which is the platform's.
  - `GET`/`PUT /api/v1/me/panels/:synthId`. `GET` is `{ panel, now }`, `panel` being `null` when
    there is none. Both `GET`s carry `now`, the server's time as it answered. `PUT` is checked
    with `validateSound` and refused when anything is wrong, as a saved sound is; only a listed
    synth takes one. A `soundId` that is not the caller's own is kept as `null`. `GET` fits the stored panel to the synth as it is now (values clamped, what it
    no longer has dropped), as the page fits its own copy: it is only where the user left off.
- **On the page** (`components/app/synth/account-storage.ts` and `settings.ts`, wired through
  `useStoredSession` and `useSettings`; tested in `synth-page-account.test.tsx`):
  - Browser storage is still written on every change, as before.
  - **The newer panel wins.** The browser's panel records when it was last changed and who was
    signed in then. The account's last panel replaces it when the account's is as new or newer,
    and it is written back to the browser. When the browser's is newer (work done signed out, or a
    last request that did not land), it is sent to the account. A panel saved while **another**
    user was signed in is never sent. Panels stored before this change have no time, so the
    account's wins.
  - Settings work the same way, as one set: `kys.settingsAt` is when they were last changed and
    `kys.settingsBy` who was signed in then. The browser's fill what the account has no value for,
    and replace what it has when they are newer; the account's are written back to the browser.
    Settings last changed while another user was signed in are never sent, and where the account
    has no value the browser goes back to the default rather than showing theirs. `GET
/api/v1/me/settings` returns `updatedAt` for the comparison.
  - **One clock.** Each answer carries the server's time (`now`), and the page turns the account's
    `updatedAt` into its own clock's time (`skewOf`) before comparing, and stores it that way. So a
    device whose clock is off still weighs the two copies correctly.
  - **Another user.** When one user signs out, or another signs in without a reload, what is
    waiting to be sent is dropped, not sent to whoever is signed in next, and the next user's panel
    and settings are read. A panel moved by the user who left is stored as theirs.
  - The page reads both answers through Zod schemas (`AccountSettingsSchema`,
    `PanelPrefReadSchema`), and treats one that does not fit as an account it could not read.
  - A stored panel is held to what `PUT` takes: a `presetId` that is not a library slug, or a step
    past `MAX_STEP`, is dropped on reading, so the panel itself can always be kept.
  - A change made before the account answered beats both, including one made before the session
    said who is signed in. If the account cannot be read, nothing is sent to it that visit, so an
    older panel never overwrites a newer one.
  - The times compared measure different moments: the browser's is when the change was made, the
    account's when its request landed (5–30 s later). So when two devices change the same thing
    within seconds of each other, the wrong copy can win.
  - **The account is written less often than the browser.** The browser is written 400 ms after the
    panel goes still, which sent to the server would pass the section's 100 a minute during play.
    The account copy goes 5 s after changes stop, and at least every 30 s while they keep coming:
    at most 12 a minute from each writer. Leaving the page, or moving to another synth, sends what
    is waiting with `keepalive`; signing out drops it.
- Signed out, none of this runs.

`npm run smoke:sounds` also proves the two tables' cascades through `eraseUser()` and their export
sections.

## Lesson progress and favourites (s4)

What the prototype did not have: how far a signed-in user got through each library sound's lesson,
and a star on a synth, a library sound or one of their own sounds. Signed out, neither shows.

- **Two tables**, beside the others on `SYSTEM_MODELS` with no `orgId`, each with a hand-written
  `ON DELETE CASCADE` user FK pinned by a drift probe, and each declared for export
  (`app.lessonProgress`, `app.favourites`, which name the library sound by synth and slug, not by
  row id). What a row points at is a real `Cascade` relation: progress on a library sound, or a
  star on something, that has gone means nothing.
  - `LessonProgress` is keyed on user and library sound: the furthest step reached (from 0) and
    when the lesson was first finished.
  - `Favourite` stars exactly one of `synthId`, `synthSoundId` and `userSoundId`, which the store
    keeps to one; there is no check constraint, which the migration generator would drop (B13).
    Each target has a unique key with the user, and Postgres treats nulls as distinct, so each
    binds only the column that is set.
- **The API** (`app/api/v1/me/`; rules in `lib/app/sounds/progress.ts` and `favourites.ts`, shapes
  in `progress-data.ts` and `favourite-data.ts`, tested in
  `tests/unit/app/api/v1/me/progress-favourites.test.ts`):
  - `GET /api/v1/me/progress[?synthId=]`: the lessons the caller has started, most recently moved
    first, with each one's step count and whether its synth is available (listed, with a definition).
  - `PUT /api/v1/me/progress/:synthId/:slug`: `{ step, completed? }`. **Forward only**: a step
    behind the furthest changes nothing and a finish is kept, each a conditional update so a
    request that lands late cannot move it back; a step behind leaves `updatedAt` alone too. A
    synth that is not listed, a library sound it does not have, a step its lesson does not have, or
    a finish from any step but the last is a 400.
  - `GET`/`POST /api/v1/me/favourites`, `DELETE /api/v1/me/favourites/:id`. `POST` takes
    `{ kind: 'synth', synthId }`, `{ kind: 'sound', synthId, slug }` or `{ kind: 'mine', soundId }`;
    201 with a new star, 200 with the one already there. **A sound the caller cannot see is
    refused**: a synth or library sound on an unlisted synth is a 400, another user's sound a 404,
    as the sounds API says each.
- **On the page** (`components/app/synth/progress.ts`, `favourites.tsx`; tested in
  `synth-page-marks.test.tsx`):
  - Every lesson move goes through the page's `setStep`. A step further than the user had got is
    sent; stepping back, or to a step already reached, sends nothing. **Finish from the last step
    finishes the lesson**; nothing else does. Scrolling the step bar moves the step, so it counts.
    A step the account did not keep is forgotten, so the next one that far sends it again.
  - The library shows "Reached step k of n" or "✓ Finished" on each lesson started, and the lesson
    says the same with **Continue from step k**.
  - Stars sit beside each library sound and each of the user's own sounds, and **beside the synth
    chooser** for the synth on show: the chooser's entries are listbox options, which cannot hold a
    button, so its list only marks the starred ones. A star changes at once and is put back if the
    request fails; while one is on its way, pressing it again does nothing.
- **On `/dashboard`**, Favourites and Lessons sit under My sounds
  (`components/app/dashboard/favourites-card.tsx`, `lessons-card.tsx`, drawn with My sounds by
  `synth-cards.tsx`, the one fork element in the platform's page). A favourite opens its synth with
  the sound on the panel (`?sound=`, `?mine=`); a lesson opens its library sound, where the lesson
  offers to continue. One on a synth no longer listed shows without a link.

`npm run smoke:sounds` also proves both tables' cascades through `eraseUser()` and their export
sections.
