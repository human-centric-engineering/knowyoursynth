# Profiles

`f-profiles`. A signed-in user's synth profile: the username their public page goes under, where
their music is, and who may see it. r1 is the profile itself, on the settings page; r2 adds the
synths they own and want; r3 is the public page at `/u/[username]`, the only place any of it is
shown to anyone else.

## The tables

`SynthProfile` (`prisma/schema/app.prisma`), one row per user, keyed on `userId`:

- **A username**, stored lower-case and unique, so `Moog_Fan` and `moog_fan` are one name. It is
  the only name of a user's that is ever public. The account name and email never are.
- **One link each for YouTube, Spotify, Instagram and Bandcamp**, a column per platform, stored as
  the URL rebuilt from the handle or id, never the string typed. Null for none.
- **Visibility:** `public`, and `showOwned` and `showWishlist` for r2's lists. **A profile is
  born private, with both lists hidden.** Nothing about a person goes public until they switch it
  on.
- **The user's foreign key is written by hand**, `synth_profile_userId_fkey`, `ON DELETE CASCADE`,
  as every user table here has it ([`sounds.md`](./sounds.md)), with a drift probe in
  `lib/app/db-drift.ts`. `lib/app/data-export.ts` returns the profile under `app.synthProfile`.
- **It is on `SYSTEM_MODELS`, with no `orgId`**, under the ruling that covers users' own rows.
  Ledger row in [`divergences.md`](./divergences.md).

`OwnedInstrument`: one databank instrument on one of a user's two lists, `owned` or `wishlist`,
with its `position` in that list.

- **Keyed on the user and the instrument**, so a synth is on one list or the other, never both.
  Moving it between them is an update, not a second row.
- **The instrument is a real relation, `Cascade`**, as a favourite's is: an entry on an instrument
  the databank removed means nothing, and `Restrict` would let one user's list stop an admin
  removing a duplicate.
- **The user's foreign key is written by hand**, `owned_instrument_userId_fkey`, `ON DELETE
CASCADE`, with a drift probe; exported under `app.ownedSynths`, each entry named by the
  instrument's databank id and name; on `SYSTEM_MODELS` with no `orgId`, as `SynthProfile` is.

`HeldUsername`: a name someone gave up by changing it, and when the hold ends. It has no user
foreign key and records no person, so it is excluded from the export with that reason. **A name
freed by erasing the account is not held**: holding it would keep a row about someone who asked
to be forgotten. A lapsed hold is pruned by the `app:prune-held-usernames` job in
`lib/app/jobs.ts` (every six hours, system scope), so a name nobody claims again does not outlive
its hold.

## The rules

Each is written once, pure, and run by both the settings form and the API, so the two refuse the
same things.

- **Usernames** (`lib/app/profile/username.ts`): 3–24 letters, digits, `-` or `_`, starting with a
  letter or digit. Refused as unavailable, with one message for all three so the refusal does not
  teach the list: a reserved name (this app's own addresses and words, such as `bank`, `synths`,
  `explore`, `tutor` and `kys`), a look-alike of a role once the usual disguises are undone
  (`4dm1n`, `know-your-synth-official`), and a blocked word (`lib/app/profile/words.ts`). The
  precedent is BeatBreaker's: its shape carries over, and the reserved list is this app's.
- **Links** (`lib/app/profile/links.ts`): https only, on that platform's exact hosts, with no
  userinfo and no port. The field decides the platform, so an Instagram address in the YouTube
  field is refused rather than moved. Accepted: `youtube.com/@handle` or `/channel/UC…`;
  `open.spotify.com/artist/<id>`, with or without an `intl-xx/` prefix; `instagram.com/<handle>`,
  except Instagram's own pages; `<name>.bandcamp.com`, or its `/music`. A stored link is re-parsed
  on read, and one that no longer passes reads as no link.
- **Changing a username** (`lib/app/profile/profile.ts`): choosing the first one is not a change.
  After that, once in 30 days, and the old name is held for 30 days so nobody can take it while
  links to the old address still circulate. A held name reads as taken, which says nothing about
  whose it was. Two people claiming one free name at once meet the unique index, and the second
  is told it is taken.

## The API

`/api/v1/me/profile`, signed in, keyed on the session's user, under the proxy's `/api/v1` cap.

- `GET`: `{ username, nextChangeAt, links, public, showOwned, showWishlist }`, or `null` before a
  username is chosen.
- `PUT`: the whole profile, `{ username, links: { youtube, spotify, instagram, bandcamp }, public,
showOwned, showWishlist }`, a link blank or null for none. A username or link that breaks the
  rules is a 400 naming the field. A name that is taken or held, or a change inside 30 days of
  the last, is a 409 with the words to show.

`/api/v1/me/instruments`, the same way (`lib/app/profile/instruments.ts`):

- `GET`: `{ owned, wishlist }`, each in the user's order, each entry
  `{ instrumentId, kind, name, maker, year, addedAt }`.
- `POST`: `{ instrumentId, kind }`, at the end of that list. 201, or 200 with the entry it had
  when it is already on that list. An instrument the databank does not have is a 400. One already
  on the **other** list is a 409 that says to move it; so is a full list (200 synths per list).
- `PATCH /:instrumentId`: `{ kind }`, moving it to the end of that list. `DELETE /:instrumentId`
  takes it off. Another user's entry is a 404, the same as one on neither list.
- `PUT /order`: `{ kind, instrumentIds }`, the whole list in its new order. A list that has
  changed since the caller read it is a 409, and the remedy is to read the lists again, which the
  settings section does.

`/api/v1/profiles/:username`, public, no session, under the same cap
(`lib/app/profile/public.ts`):

- `GET`: `{ username, links: [{ platform, url, display }], owned?, wishlist?, sounds }`, each list
  `[{ instrumentId, name, maker, year }]` in the user's order. **Only what the profile switched
  on**: a hidden list is absent, not empty, and a stored link that no longer passes is left out.
  `sounds` is their published sounds, newest first, as Explore's cards (`publishedSoundsOf`,
  [`sharing.md`](./sharing.md)); never a link share. Carries an ETag.
- **A private profile, an unknown name and a held one are the same 404.** A held name is not
  followed to the new one: that would publish the link between the two. A name no one could hold
  is a 404 without a query.
- **Never the account.** The read selects from `synth_profile` and the lists alone, never the
  user's own row, so the account name and email cannot reach the answer.

Tested in `tests/unit/app/api/v1/me/profile/route.test.ts`, `tests/unit/app/api/v1/profiles/`,
`tests/unit/app/api/v1/me/instruments/route.test.ts` and `tests/unit/lib/app/profile/`.
`npm run smoke:profile` proves what no unit test can: the real unique index and hold, the
instrument key and its cascade from the databank, the export, and the erasure cascades.

## The settings section

`components/app/account/synth-profile-section.tsx`, registered in `lib/app/account-sections.ts`
on **settings only**: `/profile` is Sunrise's account card, whose name field is the private
account name the username exists to keep apart. The seam-defaults test is re-pinned to it.

The card is `#synth-profile`. Publishing a sound with no username sends the user there with
`?back=<the sound on its synth page>`, and once a username is saved the form offers **Back to your
sound**. Only that shape of address is taken ([`sharing.md`](./sharing.md), "On the synth page").

Below it, **Your synths** (`components/app/account/synth-lists-section.tsx`, order 20): a search
of the databank, then the two lists to reorder, move between and remove from. The search reads
`GET /api/v1/bank/instruments` once, the first time it is used, and filters it in the browser:
about 940 instruments, some 126 KB of JSON before compression, too small for a search parameter on
the route to buy anything. Revisit if the databank grows by an order of magnitude. **Suggest a
synth** (`components/app/bank/suggest-form.tsx`) sits beside the search for one that is missing.

## The public page

`/u/[username]` (`app/(public)/u/[username]/page.tsx`), readable signed out, on the consumer
surface with nothing added to `classifySurface`. It reads the same `getPublicProfile()` the API
serves, in-process, as the databank's pages read theirs, once per request for the page and its
metadata. `components/app/profile/public-profile.tsx` shows the username, the links (opened in a
new tab, `nofollow`), their published sounds, and owned and wishlist where shown, each synth opening its databank page.
A shown list that is empty says so. The title is the username, and the description says which
lists it carries. Tested in `tests/unit/app/public/profile-page.test.tsx`, over the same fake
tables as the route (`tests/helpers/public-profile-db.ts`), which can join the user's row so a
read that asked for it would be caught.

Published sounds on the profile are `f-sharing`'s, not this feature's.
