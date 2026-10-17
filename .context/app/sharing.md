# Sharing sounds

`f-sharing`. A user's sound can be shared by a link, or published under their username; anyone can
open a shared one signed out, and a signed-in user can save a copy that credits it (D5). h1 is the
data and the API; h2 the sound page, Explore, published sounds on a profile, the social card and
the sitemap; h3 the buttons on the synth page; h4 reports and the moderation queue.

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
- **Don't list a link share anywhere.** Explore, a profile and the sitemap read through
  `listPublishedSounds`, `publishedSoundsOf` and `publishedSoundAddresses`, each filtered to
  `published`; a new list goes through one of them.
- **Don't read a shared sound for anyone else without `unlistedAt: null`.** An unlisted sound keeps
  its visibility, so a filter on visibility alone serves it. Every public read, the credit
  (`sharedSourcesOf`) and the copy source (`sharedCopySource`) filter on it.
- **Don't name a reporter to anyone.** The queue reads a report's reason, note, status and date,
  and maps them field by field; `reporterId` and `resolvedById` never leave `moderation.ts`.
- **Don't decide "is this the visitor's own?" on the server from the public read.** It carries no
  owner, on purpose. The sound page asks the visitor's own sounds list (`sharedViewerOf`), which
  has each sound's slug.
- **Don't colour a card or page by hand.** A synth's colours are its definition's `theme`
  (`panel`, `panel2`, `ink`); `Synth.design` is only whether the maker's marks are drawn.

## Who can open a sound

`UserSound.visibility` (`SoundVisibility`):

| Value       | Who can open it                                                   | Listed?                    |
| ----------- | ----------------------------------------------------------------- | -------------------------- |
| `private`   | Its owner.                                                        | No                         |
| `link`      | Anyone with `/synths/<id>/s/<slug>`, signed in or not. `noindex`. | No                         |
| `published` | As `link`, and listed under the owner's username.                 | `/explore`, `/u/`, sitemap |

- **The slug** is ten characters of lower-case Crockford base32 (`mintSlug` in
  `lib/app/sounds/sharing.ts`, 50 bits, not enumerable; `SharedSlugSchema` in `data.ts` is its
  shape). Minted the first time a sound leaves private and kept after, so a link that stopped
  working when its sound went private works again when it is shared again.
- **`publishedAt`** is the first publication, kept through unpublishing and republishing.
- **`tags`**: up to three, chosen at publish from the tags that synth's library sounds use
  (owner ruling, journaled on `f-sharing`). Users' sounds have no other tags. Kept when the sound
  is unpublished, but shown only while it is published; a republish with `tags` left out keeps
  them, less any the library no longer uses. `tags: []` clears them.
- **Notes go public with the sound.** Notes written while sounds could only be private are shown
  once the sound is shared; the sharing controls, the publish dialog and the Notes ⓘ say so.

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
| `UNLISTED`          | 409    | Moderators unlisted it ([below](#reports-and-moderation)). A PATCH to `link` is refused the same way.    |
| `USERNAME_REQUIRED` | 409    | No synth profile (`f-profiles`).                                                                         |
| (validation)        | 400    | The synth is not listed.                                                                                 |
| `NOT_PLAYABLE`      | 409    | Saved on a definition version the synth has moved on from, or its panel no longer passes. Save it again. |
| `NOT_ALLOWED`       | 422    | A blocked word in the name or notes (`textIsBlocked`, `lib/app/profile/words.ts`): see below.            |
| `DUPLICATE`         | 409    | It plays the same as the library sound or the shared sound it was copied from (`assertChanged`).         |
| (validation)        | 400    | A tag that synth's library does not use, or the same tag twice.                                          |
| `PUBLISH_LIMIT`     | 429    | More than 10 (`PUBLISH_DAILY_CAP`) first publications in 24 hours. A republish does not count.           |

`NOT_PLAYABLE` says which of its two cases it is: a sound on an older definition, or settings that
no longer fit.

- **The word check** goes word by word, so "Scunthorpe bass" is fine. A blocked word counts with a
  usual ending only ("fucking", "shitty"; `ENDINGS`), so "shitake" and "retardant" are fine. A word
  spelled out with separators ("f.u.c.k") is read whole, each part of a joined one ("bass.shit")
  on its own, and a run of single letters ("f u c k") as one word.
- **The daily cap is kept on the profile** (`SynthProfile.recentPublishes`, pruned to the last
  24 hours at each publish), not counted from the sounds, so deleting a published sound does not
  give its place back.
- **One at a time per owner.** A publish and every PATCH run in a transaction that first takes
  the owner's lock (`lockOwnersSounds`: their `user` row, `FOR UPDATE`) and then reads the sound.
  So publishes sent together are counted one after another, two link shares never mint two slugs,
  and an edit sent alongside a publish is checked as the published sound it becomes. A delete does
  not take the lock; the write after it is keyed on the owner, so it finds nothing and is a 404.

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
and malformed are one 404. A panel that no longer passes is served unplayable and not logged, so
anyone holding the address cannot fill the error log. ETag and `304`; the platform's `private, no-cache`, so a sound made
private stops being served on the next request.

## The sound page

`/synths/<id>/s/<slug>` (`app/(panel)/synths/[id]/s/[slug]/page.tsx`): the synth page with the
shared sound loaded, signed out or in, reading the same `getSharedSound` as the public API,
in-process. Private, unknown, malformed, on another synth, and on a synth the catalogue does not
serve are all the segment's `not-found.tsx`: "This sound isn't shared any more".

- **It is the synth page** (`SynthPage` with `shared`), so the panel draws the synth's
  `Synth.design` and everything else on the page works. The sound loads over the panel stored for
  that synth, as `?sound=` does, and counts as the visitor's change, so the account's last panel
  arriving later does not replace it. Changing the view keeps the shared address
  (`sharedSoundHref` with the view).
- **The strip** (`components/app/sharing/shared-sound-strip.tsx`) above the panel: name, byline,
  the `basedOn` and library credits, notes and tags. Signed out: **Sign in to save a copy**, back to
  this address. Signed in on someone else's: **Save a copy**, which sends the panel as it is with
  `source: { shared }`, so what they changed first is kept, and then opens the copy as theirs. On
  their own: **Open it to edit**. Until the session and their list are known, nothing.
- **While the shared sound is on the panel**, the panel's own Save buttons are hidden: saving it is
  Save a copy, which credits it. "Controls moved" and Restore count from the shared panel. Opening
  any other sound leaves it; **Load it again** puts it back.
- **Metadata:** a link share is `noindex`, and its description names no author unless the byline
  rule gives one. A published sound is canonical at its address.
- **The social card** (`opengraph-image.tsx`, `components/app/sharing/social-card.tsx`): text only
  (owner ruling): the maker and synth, the sound's name and `@author` as the byline rule allows, on
  a `panel` to `panel2` gradient in `ink`, from that synth's `theme`. A picture of the panel is h5
  (t-50).

## On the synth page

`components/app/sharing/sound-sharing.tsx`, under the open sound's own buttons (`SoundActions` in
`components/app/synth/my-sounds.tsx`). Only one of the user's own sounds, open on the panel, has
them: what is shared is the sound **as last saved**, so the panel's unsaved moves are not.

| State       | Says                                                | Buttons                              |
| ----------- | --------------------------------------------------- | ------------------------------------ |
| `private`   | Only you can open it.                               | Share with a link · Publish…         |
| `link`      | Anyone with _the link_ can open it, notes included. | Copy link · Publish… · Stop sharing  |
| `published` | Listed on Explore and your profile, at _its page_.  | Copy link · Unpublish · Stop sharing |

Share with a link and Unpublish are `PATCH` with `visibility: 'link'`; Stop sharing is `'private'`.
Copy link copies the full address; where the browser blocks it, it says to copy it from the page.

- **Publish…** opens a dialog (`PublishDialog`): who it appears as (`by @username`), that the
  notes go with it, the tags (up to three of the synth's library tags, as `libraryTags` in
  `publish.ts` reads them; it starts from the sound's own, less any the library dropped), and the
  "I made this, or the sound it came from is credited on it" tick. Nothing is sent until it is
  ticked. A refusal stays in the dialog in the server's words.
- **No username yet.** The dialog reads `GET /api/v1/me/profile` when it opens. Only an answer of
  `null` means none: its one step is **Choose a username**, to `/settings?back=…#synth-profile`
  (`chooseUsernameHref`), and the profile form then offers **Back to your sound**: the synth page
  itself (`/synths/<id>`), as sign-in's way back is. The panel, with the sound open and anything
  moved since it was saved, comes back from browser storage; `?mine=` would load the saved sound
  over it.
  A read that failed says so and offers Try again, so nobody with a username is sent to choose
  another. `USERNAME_REQUIRED` from the server turns the dialog to the same step.
- **`back` takes one shape only** (`backToSound` in `components/app/synth/routes.ts`): one of the
  synth page, default view. Anything else, another site included, offers no link.
- **My sounds** says each sound's state under its name, and a shared one has ↗ to its page. The
  dashboard's card says the same, the state linking to the page (`VISIBILITY_LABELS`,
  `components/app/sharing/visibility.ts`, a plain module so the server card can read it).

### Save a copy when the original has gone

The strip's Save a copy (h2) sends `source: { shared }`. If the sound stopped being shared after
the page opened (made private, unlisted, deleted, or its owner erased), the copy route refuses on
`source.shared` (`sharedSourceGone`), and the page saves the same panel as a **plain new sound**
with the shared sound's name and notes and no credit, and says so. Any other refusal is just
reported: nothing else falls back.

## Explore

`/explore` (`app/(public)/explore/page.tsx`) and `GET /api/v1/public/sounds?synth=&tag=&sort=&page=`
read `listPublishedSounds`: published sounds on synths the catalogue serves, 24 a page
(`EXPLORE_PAGE_SIZE`).

- **Filters:** a synth, and a tag from that synth's library tags (or every served synth's)
  (`exploreTags`). `ExploreQuerySchema` drops what does not parse, and the read drops a synth it
  does not serve and a tag no library sound there uses; `meta.applied` says what was used. A link
  with a stale filter still opens.
- **Sort:** `newest` by `publishedAt` (the first publication), or `saves`: the count of copies
  (`sourceUserSoundId`), then newest. The row id breaks ties, so pages do not overlap.
- **A card** (`PublishedSoundCard`): slug, synth and its name, name, tags, `publishedAt`, `author`,
  `authorProfile` and `saves`. Never the row's id or the owner's.
- The filters are a plain GET form, so the page needs no script.

A profile (`/u/<username>`, `GET /api/v1/profiles/:username`) lists the user's published sounds
the same way (`publishedSoundsOf`), never their link shares ([`profiles.md`](./profiles.md)).

## Navigation and the sitemap

Explore is in the public header (`lib/app/public-nav.ts`, which this fills) and the signed-in one
(`lib/app/protected-nav.ts`). The sitemap adds `/explore` and every published sound
(`components/app/sharing/sitemap.ts`), never a link share, through the platform edit the
divergence ledger records.

## Reports and moderation

`SoundReport` (h4): `soundId` (a relation, `Cascade`), `reporterId` and `resolvedById`
(hand-written FKs to `user`, `SET NULL`, probed in `lib/app/db-drift.ts`), `reason`
(`offensive` · `not_theirs` · `spam` · `other`; BeatBreaker's `bad-link` is left out, as a sound
carries no links), `note`, `status` (`open` · `dismissed` · `actioned`), `resolvedAt`. A report
outlives the person who filed it and the admin who resolved it: it is the record about the sound.

| Route                                     | Does                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/public/sounds/:slug/report` | Signed in. `{ reason, note? }`. One open report per person per sound: a second updates it (200; new is 201). Your own is a 400 (`OWN_SOUND`); one nobody else can open is the public read's 404. 20 a day per user. |
| `GET /api/v1/admin/sounds?view=`          | Admin. `reported`: sounds with open reports, the longest-waiting first. `unlisted`: unlisted sounds, the most recent first. The owner's username, never a reporter.                                                 |
| `POST /api/v1/admin/sounds/:id`           | Admin. `{ action: unlist \| restore \| dismiss }`. Audited as `user_sound.<action>`. Nothing to change is a 409.                                                                                                    |

- **Unlist** sets `UserSound.unlistedAt` and actions the open reports. The sound leaves its page,
  Explore, its owner's profile, the sitemap, the credit on copies, and the copy route, on the next
  request. Its owner can still make it private, but not share or publish it (`UNLISTED`).
- **Restore** clears `unlistedAt`. **The visibility was never changed**, so the sound comes back
  as its owner last left it, which is why this differs from BeatBreaker's take-down (which made the
  pattern private, so its "restore" was the owner's to do).
- **Dismiss** closes the open reports and changes nothing else.
- **One open report per person** is checked and written under a lock on the sound's row
  (`SELECT … FOR UPDATE` on `user_sound`), so two sent together are one.
- **Each action is a conditional write**, so two admins at once cannot both win: the second is a
  409, as a decided suggestion is.
- **The owner is told in the app, not by email** (planning ruling): My sounds and the dashboard say
  _Unlisted by moderators_ and drop the ↗ link; the sharing controls say why and offer only Stop
  sharing.
- **Report** on the sound page (`components/app/sharing/report-button.tsx`) is shown to a
  signed-in visitor whose sound it is not (`viewer === 'other'`), never signed out or on their own.
- **The queue** is `/admin/synths/reports`, _Reported sounds_ under Synths in the admin nav.

Not built: emailing admins about a new report (BeatBreaker added it later). The queue has no
count badge in the nav either.

## Erasure and export

- Erasing a user deletes their sounds, shared and published ones included (the
  `user_sound_userId_fkey` cascade), and the reports about them with them. Other people's copies
  stay, with `sourceUserSoundId` null and no credit. Reports they filed or resolved stay, with
  `reporterId` or `resolvedById` null.
- The export (`app.sounds`) carries `visibility`, `slug`, `publishedAt`, `tags` and `unlistedAt`.
  Not `sourceUserSoundId`: that is the row id of a sound someone else shared, about them. The
  profile section (`app.synthProfile`) carries `recentPublishes`. `app.soundReportsFiled` is the
  reports the user filed, the sound named by its synth and address; never who resolved one.
- Both are checked against the dev database by `npm run smoke:sounds`.

## Tests

`tests/unit/app/api/v1/sounds/sharing.test.ts` (visibility, the slug and its retry, each publish
refusal, the cap kept through deletes, the owner's lock, kept tags, the checks on a published
sound, the public read and its 404, the byline, copies and their credit);
`tests/unit/lib/app/profile/words.test.ts` (the word check); `npm run smoke:sounds` (the `SetNull` FK and the export, against a real database).

h2: `tests/unit/app/api/v1/public/published-sounds.test.ts` (Explore's read: published only,
the filters and what is dropped, sort by saves, paging; a profile's and the sitemap's lists);
`tests/unit/app/panel/shared-sound-page.test.tsx` (the page, its 404s, the metadata, the card in
each synth's theme); `tests/unit/components/app/synth/synth-page-shared.test.tsx` (the sound on the
panel, Save a copy only for a signed-in non-owner, Load it again, the address kept);
`tests/unit/app/public/explore-page.test.tsx`; `tests/unit/components/app/sharing/sitemap.test.ts`;
the profile's in `tests/unit/app/public/profile-page.test.tsx`.

h4: `tests/unit/app/api/v1/sounds/reports.test.ts` (the report route: own sound, the 404s, one
open report per person under the lock, the 429; the queue and its actions: admin only, never the
reporter, each action's effect, audit entry and 409); the unlisted cases in `sharing.test.ts` and
`published-sounds.test.ts` (every public read, the credit, the copy, the owner's 409s);
`report-button.test.tsx`, `report-queue.test.tsx`, `reports-page.test.tsx`; the unlisted state in
`sound-sharing.test.tsx`, `synth-page-mine.test.tsx` and `my-sounds-card.test.tsx`;
`npm run smoke:sounds` (the lock, unlist and restore, the export and the FKs against a real
database).

h3: `tests/unit/components/app/sharing/sound-sharing.test.tsx` (each state's buttons and requests,
Copy link, the dialog: the tick, the three-tag cap, no username, an unreadable profile, each refusal
kept in the dialog); `synth-page-mine.test.tsx` (the states in My sounds, sharing the open sound);
`synth-page-shared.test.tsx` (the copy falling back to a plain sound, and only on that refusal);
`my-sounds-card.test.tsx`; `routes.test.ts` (`backToSound`); `synth-profile-form.test.tsx` (Back
to your sound).
