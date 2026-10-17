# Sharing sounds

`f-sharing`. A user's sound can be shared by a link, or published under their username; anyone can
open a shared one signed out, and a signed-in user can save a copy that credits it (D5). h1 is the
data and the API, described here. The sound page and Explore (h2), the buttons on the synth page
(h3) and reports and moderation (h4) add their sections as they land.

The model is BeatBreaker's (`~/code/beatbreaker/.context/app/sharing.md`) without variations,
sessions or fixed published sounds. Where it differs, the reason is below.

## Anti-patterns first

- **Don't put `userId`, the row's `id`, an account name or an email in anything a non-owner
  reads.** A shared sound is addressed by its slug and attributed to a username, and to nothing
  else. `getSharedSound` (`lib/app/sounds/public.ts`) is the only public read; a new one goes
  through it.
- **Don't write `visibility: 'published'` outside `publishUserSound`** (`lib/app/sounds/publish.ts`).
  The PATCH schema takes `private` and `link` only, so nothing can skip the username, word,
  unchanged-copy, tag and daily-cap checks.
- **Don't mint a slug outside the write that stores it.** `visibilityData` mints only when a row
  leaves private without one, and it runs inside `withFreshSlug`'s closure, so a retry after a
  clash mints another. Minted once outside the closure, every retry reuses the clashing slug (a
  test pins this).
- **Don't keep a copy's credit to a shared sound.** It is read through `sourceUserSoundId` on every
  read (`sharedSourcesOf`), never stored: a stored username would outlive its owner's erasure. The
  library credit is a snapshot because it names an artist, not a user of this app.
- **Don't credit a link share.** The credit links to the source, and a copy shared onward would
  hand a link-only address to strangers.

## Who can open a sound

`UserSound.visibility` (`SoundVisibility`):

| Value       | Who can open it                                                         | Listed?                 |
| ----------- | ----------------------------------------------------------------------- | ----------------------- |
| `private`   | Its owner.                                                              | No                      |
| `link`      | Anyone with `/synths/<id>/s/<slug>`, signed in or not (the page is h2). | No                      |
| `published` | As `link`, and listed under the owner's username.                       | Yes, in `/explore` (h2) |

- **The slug** is ten characters of lower-case Crockford base32 (`mintSlug` in
  `lib/app/sounds/sharing.ts`, 50 bits, not enumerable; `SharedSlugSchema` in `data.ts` is its
  shape). Minted the first time a sound leaves private and kept after, so a link that stopped
  working when its sound went private works again when it is shared again.
- **`publishedAt`** is the first publication, kept through unpublishing and republishing.
- **`tags`**: up to three, chosen at publish from the tags that synth's library sounds use
  (owner ruling, journaled on `f-sharing`). Users' sounds have no other tags.
- **Notes go public with the sound.** Notes written while sounds could only be private are shown
  once the sound is shared; the publish and share UI (h3) says so.

## The byline

`PublicSound.author` is the owner's username:

- on a **published** sound, always: publishing needs a username, and is choosing to be named;
- on a **link** share, only when the owner's profile is public (`SynthProfile.public`). A profile
  can be private here, which BeatBreaker's could not; sharing a link is not choosing to be named.

`authorProfile` says whether `/u/<author>` shows anything, so the byline links there only then.

## Publishing

`POST /api/v1/sounds/:id/publish`: `{ confirm: true, tags? }`. In order:

| Refusal             | Status | When                                                                                                     |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `NOT_FOUND`         | 404    | Not yours, as every write.                                                                               |
| `USERNAME_REQUIRED` | 409    | No synth profile (`f-profiles`).                                                                         |
| (validation)        | 400    | The synth is not listed.                                                                                 |
| `NOT_PLAYABLE`      | 409    | Saved on a definition version the synth has moved on from, or its panel no longer passes. Save it again. |
| `NOT_ALLOWED`       | 422    | A blocked word in the name or notes (`textIsBlocked`, `lib/app/profile/words.ts`): word by word.         |
| `DUPLICATE`         | 409    | It plays the same as the library sound or the shared sound it was copied from (`assertChanged`).         |
| (validation)        | 400    | A tag that synth's library does not use, or the same tag twice.                                          |
| `PUBLISH_LIMIT`     | 429    | More than 10 (`PUBLISH_DAILY_CAP`) first publications in 24 hours. A republish does not count.           |

- **"Plays the same"** is `panelKey`: every control at its value or its `init`, and the cables
  sorted, so two panels stored differently but sounding alike compare equal. A source that has
  gone, or that the synth can no longer play, has nothing to compare with.
- **A published sound stays held to it.** A PATCH that changes its name or notes runs the word
  check; one that changes its panel runs `assertChanged`. A rename never runs `assertChanged`: the
  source can change after the copy was published, and that must not lock the copy out of its own
  name. An edit that also unpublishes (`visibility` in the same PATCH) runs neither.
- **Unpublishing** is `PATCH /api/v1/sounds/:id` with `visibility: 'link'` (the link still works)
  or `'private'` (stop sharing).

Left out of BeatBreaker's, on purpose (planning rulings on `f-sharing`): the publishing kill-switch
flag; the duplicate check against everyone's published work (a panel is continuous values, so a
copy made other than through the copy route all but never matches); and fixing a published sound
so it never changes, which is variations, and D5 drops variations.

## Copies

`POST /api/v1/sounds` with `source: { shared: <slug> }`. A new, private sound for the caller,
from any link or published sound on that synth. Private, unknown and on another synth are one 400. With no panel, name or notes sent, it takes the shared sound's; a shared sound the synth can
no longer play needs the panel sent.

- **`sourceUserSoundId`** records the source, a self-relation `ON DELETE SET NULL`: deleting the
  source, or erasing its owner, leaves the copy with its new owner and no credit.
- **A copy of your own** shared sound records no source, as any other copy of your own would not.
- **The library credit carries across.** A shared sound that was itself a copy of a library sound
  passes its `sourceSoundId` and snapshot on, so the copy still credits the library sound.
- **`basedOn`** on the owner's reads (`GET /api/v1/sounds`, `/:id`) and the public read is
  `{ name, username, synthId, slug }` while the source is published and its owner has a username,
  and null otherwise. A list reads every credit in two queries.

## The public read

`GET /api/v1/public/sounds/:slug`. No session (the section rate cap applies). A link or published
sound: slug, synth, visibility, name, notes, tags, `publishedAt` (published only), `author`,
`authorProfile`, the library `source` (without its row id), `basedOn`, and the panel exactly as
the owner's read checks and fits it (`playable`, `panel`, `problems`, `fitted`). Private, unknown
and malformed are one 404. ETag and `304`; the platform's `private, no-cache`, so a sound made
private stops being served on the next request.

## Erasure and export

- Erasing a user deletes their sounds, shared and published ones included (the
  `user_sound_userId_fkey` cascade). Other people's copies stay, with `sourceUserSoundId` null
  and no credit.
- The export (`app.sounds`) carries `visibility`, `slug`, `publishedAt` and `tags`. Not
  `sourceUserSoundId`: that is the row id of a sound someone else shared, about them.
- Both are checked against the dev database by `npm run smoke:sounds`.

## Tests

`tests/unit/app/api/v1/sounds/sharing.test.ts` (visibility, the slug and its retry, each publish
refusal, the checks on a published sound, the public read and its 404, the byline, copies and
their credit); `npm run smoke:sounds` (the `SetNull` FK and the export, against a real database).
