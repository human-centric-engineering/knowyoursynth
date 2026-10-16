# My sounds

`f-my-sounds`. A signed-in user's own sounds: a panel they left on a synth, named and kept under
their account. s1 is the store and the API; s2 puts them on the synth page and the dashboard. A browser that is
not signed in still keeps its one panel per synth in `kys.session.<id>`
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
- **The open sound is `soundId` in the stored session.** Choosing a library sound clears it. It
  counts as open only when the user's list has it, so a sound deleted elsewhere, or a session left
  by someone else on the same browser, opens nothing. "Controls moved" and Restore count from the
  sound as last saved, which a reload fetches again.
- **A sound the synth has moved on from opens with `fitted`**, and the page says what did not fit.
  Saving it then stores it on the current definition.
- **Signed out, the buttons lead to sign-in** with `callbackUrl` set to this synth and view. The
  panel is already in `kys.session.<id>` and is written when the page unmounts, so it is there when
  the user comes back.
- **The name form is inline, not a modal `<dialog>`**: its ⓘ help opens in a popover outside the
  dialog, which a modal dialog would leave inert behind it.
- **`/dashboard` lists every one of the user's sounds** (`components/app/dashboard/my-sounds-card.tsx`,
  in-process reads, as the synth route makes them), each linking to `/synths/<id>?mine=<sound>`. A
  sound on a synth no longer listed has no link. The card is a platform-file edit, ledgered in
  [`divergences.md`](./divergences.md).
