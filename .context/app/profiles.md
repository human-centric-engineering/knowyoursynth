# Profiles

`f-profiles`. A signed-in user's synth profile: the username their public page goes under, where
their music is, and who may see it. r1 is the profile itself, on the settings page; r2 adds the
synths they own and want; r3 is the public page at `/u/[username]`. Nothing in r1 is shown to
anyone else yet.

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

Tested in `tests/unit/app/api/v1/me/profile/route.test.ts` and `tests/unit/lib/app/profile/`.
`npm run smoke:profile` proves what no unit test can: the real unique index and hold, the export,
and the erasure cascade.

## The settings section

`components/app/account/synth-profile-section.tsx`, registered in `lib/app/account-sections.ts`
on **settings only**: `/profile` is Sunrise's account card, whose name field is the private
account name the username exists to keep apart. The seam-defaults test is re-pinned to it.
