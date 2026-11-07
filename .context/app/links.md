# Videos and links

Demos, reviews, recordings and lessons on YouTube, Vimeo, Spotify, Bandcamp and SoundCloud, plus plain web links,
attached to the things they are about. Admin-managed. Hub feature `f-videos-and-links` (§40). Suggestions from
users and links on users' own sounds are `f-link-suggestions` (§41): both are below (Suggestions, Links on your own
sounds).

| Piece                       | Where                                                   | Task  |
| --------------------------- | ------------------------------------------------------- | ----- |
| Table                       | `ExternalLink` in `prisma/schema/app.prisma`            | t-179 |
| Parsing, embeds, thumbnails | `lib/app/links/providers.ts`                            | t-179 |
| Order                       | `lib/app/links/order.ts`                                | t-179 |
| Owners                      | `lib/app/links/owner.ts`, `owner-ref.ts`                | t-179 |
| Admin writes                | `lib/app/links/admin.ts`, `admin-route.ts`              | t-179 |
| Public read                 | `lib/app/links/read.ts`                                 | t-179 |
| Titles, thumbnails, views   | `details.ts`, `stats.ts`, `fetch.ts`                    | t-180 |
| Admin pages                 | `components/app/admin/links/`                           | t-181 |
| Under the panel, `/bank`    | `components/app/links/`, `lib/app/csp.ts`               | t-182 |
| Patches and History         | `links-toggle.tsx`, `summariseSoundLinks`               | t-183 |
| Suggestions                 | `LinkSuggestion`, `lib/app/links/suggestions.ts`        | t-185 |
| Suggest a link, the queue   | `suggest-link.tsx`, `admin/links/suggestion-queue.tsx`  | t-186 |
| Links on your own sounds    | `UserSound.links`, `lib/app/sounds/links.ts`            | t-187 |
| Seed data and its export    | `006-links.ts`, `lib/app/links/seed.ts`, `links:export` | t-199 |
| Applied once per database   | `LinkSeedRecord`, `seedLinks`                           | t-200 |

## Don't

- **Don't load an iframe from a stored URL.** Build it with `embedUrl(provider, providerId)`. That function only ever
  returns an address on one of `EMBED_ORIGINS`, built from an id that matched its provider's shape. The stored `url`
  is what the "open" link points at, never an embed source.
- **Don't take the provider or its id from a caller.** Both come from `parseLinkUrl` on every write.
- **Don't cache a public list.** Every read is a fresh draw (see Order), so the route says `no-store` and has no ETag.
- **Don't add a second owner column without the CHECK.** `external_link_one_owner` requires exactly one of
  `instrumentId`, `soundId`, `songId`, `artistId`. Prisma can't model it, so it is hand-written in the migration and
  pinned by a drift probe (`lib/app/db-drift.ts`). A new owner kind means a new column, a new CHECK, a new unique
  index on it plus `url`, a case in `owner.ts`, an entry in `OWNER_COLUMN` (`owner-ref.ts`), a lookup in the
  seed's `ownerRows` (`seed.ts`), and a value in `LinkTargetKind`, which `LinkSeedRecord.ownerKind` and the suggestions
  share.
- **Don't expect a reseed to change a link.** The seed only creates links this database has never had from it (Seeded links). To
  change a seeded link anywhere it already exists, edit it there; to change the data, edit it in dev and re-export. A
  changed URL reaches a database that had the old one as an extra link (Seeded links, Accepted costs).
- **Don't add a link to the seed data by hand.** Add it in dev through the admin pages, so it is parsed and titled the
  way every link is, then run `npm run links:export`.

## What a link is about

Exactly one of these, named in every API by its natural key:

| Kind         | Key                | Example                      | Shown (when built)                                       |
| ------------ | ------------------ | ---------------------------- | -------------------------------------------------------- |
| `instrument` | databank id        | `moog-minimoog`              | beneath the panel of every synth that models it; `/bank` |
| `sound`      | `<synthId>/<slug>` | `model-d/stacked-night-bass` | the library patch's lesson                               |
| `song`       | databank id        | `kraftwerk-autobahn`         | History → Heard on; `/bank`; patches inspired by it      |
| `artist`     | databank id        | `aphex-twin`                 | `/bank`; patches inspired by them                        |

- **Synth videos belong to the databank instrument**, not the playable synth (owner ruling). So `/bank` shows them
  for synths with no panel, and a Behringer recreation keeps its own. A synth's list is all its instruments' links
  together, one per URL (our copy when there is one, otherwise the oldest). Every synth has at least one instrument
  today; the join allows several.
- **A sound's id survives a reseed.** The table holds `SynthSound.id`. The catalogue seed matches a sound on
  `synthId + slug` and updates it in place (`lib/app/catalogue/seed.ts`), and nothing re-creates one.
- **Links go with their owner** (`onDelete: Cascade`). A databank removal (`removeBankRow`) takes them along with the
  row's own joins, and its refusal list doesn't count them: a link about a removed song has nothing left to describe.
- **History links belong to the song or artist** (owner ruling). A patch reaches its inspiration through its default
  library pattern's `inspiredSongId` / `inspiredArtistId`, so the same Spotify link is never typed onto several
  patches. See A patch's list.

## A patch's list

`?sound=` serves a library patch's own links and then its **inspiration's** (`lib/app/links/read.ts`):

- **Its inspiration is its default pattern's**: the pattern its riff plays, `headOf` (the first enabled pattern on its
  list that can be a riff; `pattern-library.md`). Its `inspiredSongId` and `inspiredArtistId`, both when both are set.
  A pattern inspired by a genre or a synth gives nothing, so a genre-only patch has only its own. Nothing is stored on
  the patch: change the default pattern, or its inspiration, and the list follows.
- **Own first**, ordered as any list is (`orderLinks`); **then the inspiration's**, ordered again on their own, ours
  of the song before ours of the artist. A popular original never jumps the patch's own walk-through.
- **One per URL**: a URL the patch has too is the patch's, not repeated. Within the inspiration's, ours or the oldest.
- **Marked**: an inherited link carries `via: { kind: 'song' | 'artist', id, name }`; the card says "From <name>". Own
  links have `via: null`.
- **Counted the same**: `summariseSoundLinks(synthId)` counts every patch on the synth in two reads (sounds with their
  patterns, then every link they could show), by slug, only those with any. `getSynthDetail` serves it as
  `soundLinks`; `summarisePublicLinks({ target: 'sound' })` counts one patch the same way.

## Providers and parsing

`parseLinkUrl` checks the input with `sanitizeUrl`, then requires https, no login, no port and a real host name. The
provider is decided by the host, matched exactly or as a sub-domain, never as a substring.

| Provider     | Accepted                                                                                                       | `providerId`                             | Stored URL                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `youtube`    | `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`                                                          | 11-char video id                         | `https://www.youtube.com/watch?v=<id>`                                              |
| `vimeo`      | `vimeo.com/<n>[/<hash>]`, `…/channels/x/<n>`, `…/groups/x/videos/<n>`, `player.vimeo.com/video/<n>[?h=<hash>]` | `<n>`, or `<n>:<hash>` when unlisted     | `https://vimeo.com/<n>[/<hash>]`                                                    |
| `spotify`    | `open.spotify.com/[intl-xx/\|embed/]<type>/<id>`                                                               | `<type>/<id>`                            | `https://open.spotify.com/<type>/<id>`                                              |
| `soundcloud` | `soundcloud.com/<user>/<track>[/s-<token>]`, `…/<user>/sets/<set>[/s-<token>]`                                 | the path lower-cased, the token as given | `https://soundcloud.com/<path>`                                                     |
| `bandcamp`   | `<artist>.bandcamp.com/track\|album/<slug>`                                                                    | read from its page; null until then      | `https://<artist>.bandcamp.com/<type>/<slug>`                                       |
| `other`      | any other https address                                                                                        | null                                     | as given, less its fragment and tracking parameters (`utm_*`, `fbclid`, `gclid`, …) |

- **A named provider's URL without its id is refused**, not stored as `other`: an admin who pasted a YouTube channel
  page meant a video.
- **The stored URL is canonical**, so the same video pasted two ways is one link: the table is unique on owner + URL
  (four unique indexes, one per owner column; Postgres treats NULLs as distinct).
- A YouTube start time (`&t=`) is dropped. Embeds start at the beginning.
- **An unlisted Vimeo video keeps its privacy hash** and a private SoundCloud track or set keeps its share token
  (`s-…`, case kept): without them the embed will not play. A Vimeo showcase, album or user page, and a SoundCloud
  user's own pages (`likes`, `tracks`, `albums`, `sets`, `reposts`, `popular-tracks`, `followers`, …), are refused,
  not mistaken for a video.
- **Bandcamp's embed id isn't in its URL** (`EmbeddedPlayer/album=<n>`). It is read from the page's `og:video` meta
  when the link is saved (see Reading from providers). Whenever that fails, a Bandcamp link opens in a new tab.

`embedUrl` builds: `www.youtube-nocookie.com/embed/<id>`, `player.vimeo.com/video/<n>?[h=<hash>&]dnt=1`,
`open.spotify.com/embed/<type>/<id>`, `w.soundcloud.com/player/?url=<encoded canonical URL>`,
`bandcamp.com/EmbeddedPlayer/<album|track>=<n>/…`. Those five origins are `EMBED_ORIGINS`, which t-182 puts in
`lib/app/csp.ts` as `frame-src`. Thumbnails need no CSP change: `img-src` already allows `https:`.

`thumbnailFor` returns the stored thumbnail (read from the provider) when `safeThumbnailUrl` still accepts it, or for
YouTube the one its id names (`i.ytimg.com/vi/<id>/hqdefault.jpg`), or nothing.

## Reading from providers

`resolveLinkDetails` (`lib/app/links/details.ts`) asks a link's provider for its title, its picture and, for Bandcamp,
its embed id. Server-side only; the browser never calls a provider (CSP `connect-src 'self'`).

| Provider                            | Asked                                                                                                                     | Reads                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| YouTube, Vimeo, Spotify, SoundCloud | oEmbed, no key: `www.youtube.com/oembed`, `vimeo.com/api/oembed.json`, `open.spotify.com/oembed`, `soundcloud.com/oembed` | `title`, `thumbnail_url`                                     |
| Bandcamp                            | the artist's own page, read only as far as `</head>`                                                                      | `og:title`, `og:image`, `og:video` → `album=<n>`/`track=<n>` |
| `other`                             | never                                                                                                                     | —                                                            |

- **Don't fetch anything else from here.** Every read goes through `readText`/`readJson` (`lib/app/links/fetch.ts`):
  https only, each caller's hosts matched exactly, no redirects (a redirect's target is a host nobody checked), a
  timeout and a size cap. The outbound dispatcher refuses a name resolving to a private address only where it pins (a
  customer org); these reads run as the install org, where the exact host list is the guard. The
  address asked about is the canonical URL `parseLinkUrl` built, so a pasted URL can't steer the server (SSRF). Hosts
  are fixed in code, not `ORCHESTRATION_ALLOWED_HOSTS`, which is for integrations an operator configures.
- **A picture is kept only on its provider's image hosts** (`safeThumbnailUrl`): `i.ytimg.com`; `i.vimeocdn.com`;
  `i.scdn.co`, `mosaic.scdn.co`, `image-cdn-ak|fa.spotifycdn.com`; `i<n>.sndcdn.com`; `f<n>.bcbits.com`. https, no
  login, no port. It is checked when read and again in `thumbnailFor`, because it goes into an `img src` on public
  pages.
- **A Bandcamp id is kept only as `album=<n>` or `track=<n>`**, from an `og:video` on `https://bandcamp.com/EmbeddedPlayer/`;
  `embedUrl` checks the shape again on read.
- **Titles are plain text**, whitespace collapsed, at most 200 characters (UTF-16 units, as an admin's title is
  counted). oEmbed's `title` already is text and is kept as sent; Bandcamp's `og:title` is an HTML attribute, so its
  entities are decoded once and any markup dropped.
- **On any failure the answer is null** and nothing fails: a create with a title saves without the picture; a create
  without one is refused ("give it one").
- **When:** on create, and on a `PATCH` that changes the URL. The provider's title is used only when the admin gave
  none; a new URL keeps the admin's title. `POST /api/v1/admin/links/resolve` asks without saving, for the form.

## View counts

YouTube's view and like counts, through the Data API's `videos.list` (`lib/app/links/stats.ts`), are the popularity
the order weighs. They need **`YOUTUBE_API_KEY`** (optional, `lib/app/env.ts`): a Google Cloud API key with the YouTube
Data API v3 enabled. Without one, no count is read, the order falls back to an admin's rating, and the job reports
`skipped`.

- **Read on create** for a YouTube link (one call), and **refreshed daily** by the app job `app:refresh-link-stats`
  (`lib/app/jobs.ts`), run by the install org only: links are shared content, so one run covers everyone.
- **Batched**: at most 50 ids a call, each video once however many owners link it. A day's refresh of a few hundred
  videos is a handful of quota units out of the default 10,000.
- **Idempotent**: a link whose counts didn't change isn't written. One that changed keeps its `updatedAt`, so a
  refresh doesn't float every link to the top of the admin list. `statsAt` is when its counts last changed.
- **Contained**: a batch the API refuses (quota, a bad key) or a row that won't write is counted as `failed` and the
  rest still run. A video YouTube no longer returns (removed, private) keeps the counts it had (`missing`).
- **Capped at the largest Int** (2,147,483,647), the column's type. The order takes a logarithm, so the cap never
  changes it. A hidden like count is null.
- **Only YouTube rows**, and only while the row is as the run read it: an admin's URL change during a run isn't
  given the old video's counts, and any other edit keeps its own `updatedAt` (that row is written on the next run).
- The key travels in the request's query, so no log line carries the URL.

## Kinds

`demo` (the thing played, to show it off) · `review` · `performance` (a record or a performance made with it) ·
`lesson` (how to use it, or how a sound is made) · `original` (the record a sound or pattern is inspired by).

## Order

`orderLinks(links, random)` (owner ruling):

1. **Ours first** (`ours = true`, Know Your Synth's own), by `order`, then oldest first.
2. **Then the rest, as a weighted draw without replacement** (Efraimidis–Spirakis: sort by `u^(1/w)` with `u` in
   (0, 1]). Popular links usually lead, but the order is different on each visit.

Weight is popularity squared. Popularity:

| Has               | Popularity          | Range                      |
| ----------------- | ------------------- | -------------------------- |
| a view count      | `log10(views + 10)` | 1 (none) … 7 (ten million) |
| else a 1–5 rating | `1 + rating`        | 2 … 6                      |
| else              | 3                   | about a thousand views     |

So a video with ten million views comes ahead of one with a thousand about five times out of six. `views` is an
`Int`, capped at its largest value when it is read (see View counts): the logarithm makes the cap irrelevant to the order.
Tests pass a seeded `random`.

## API

| Route                                                                                             | Who    | What                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/links?instrument=\|synth=\|sound=\|song=\|artist=`                                   | anyone | exactly one target; ordered; `no-store`. A sound's are its own then its inspiration's (A patch's list). A hidden synth, or a sound on one, has none; its databank instrument's links stay public, as the databank does. Unknown ids give an empty list. |
| `GET /api/v1/admin/links?owner=&instrument=\|sound=\|song=\|artist=&provider=&ours=&page=&limit=` | admin  | every link, newest edit first, with its owner; `owner` is a kind; at most one owner filter, of that kind; paginated (≤ 100)                                                                                                                             |
| `POST /api/v1/admin/links`                                                                        | admin  | `{ owner: { kind, id }, url, kind, title?, ours?, rating? }`. No title: the provider's, else 400. 409 when that owner already has the URL                                                                                                               |
| `POST /api/v1/admin/links/resolve`                                                                | admin  | `{ url }` → `{ url, provider, title, thumbnailUrl, embedUrl }`: what the link would be saved as, and what its provider says. Writes nothing                                                                                                             |
| `GET\|PATCH\|DELETE /api/v1/admin/links/:id`                                                      | admin  | `PATCH` any of `url`, `kind`, `title`, `ours`, `rating`; the owner never changes                                                                                                                                                                        |
| `PUT /api/v1/admin/links/order`                                                                   | admin  | `{ owner, ids }`: every one of the owner's own videos, once. One unmarked or removed meanwhile: 409, nothing moves                                                                                                                                      |

A public link carries `id, url, provider, kind, title, thumbnailUrl, embedUrl, ours, views, via` (`via` is null except
on a patch's inherited links). An admin link adds
`owner { kind, id, name }, providerId, order, rating, likes, statsAt, createdAt, updatedAt, suggestedBy`.
`suggestedBy` is `{ name }` for a link an accepted suggestion made (`name` null once that account is erased), else null
(`withSuggesters`, t-186). The list, one link and a `PATCH` read it; a create, a delete and a reorder answer null.

Admin rules (`lib/app/links/admin.ts`, each tested):

- A new URL drops what was read from the old one (thumbnail, views, likes, `statsAt`) and reads its provider again.
- Marking a link ours puts it last among the owner's own. Unmarking keeps its `order`, unused.
- A save that changes nothing writes nothing and is not audited.
- A reorder leaves each link at its index, writing only those not already stored there (a link left in place but
  stored with a gap or a tie is written).
- Audited as `external_link.create|update|delete|reorder`, recording owner, URL, kind, title, ours and rating.
- Writes pass `writesSharedSettings: true`: links are `GLOBAL_CONFIG_MODELS` (divergence row in
  `.context/app/divergences.md`), so at `multi` only the install org's admins write them.

## On the public pages

- **Under the panel** of every synth page, and on a databank instrument's `/bank` page (including one with no panel):
  a closed **Videos and links** section (`links-section.tsx`). Closed, it says how many there are and of which kinds
  (`summarisePublicLinks`, joined into `getSynthDetail` as `links` and read by the `/bank` route): the same links the
  list has, one per URL. It reads `GET /api/v1/links?synth=|instrument=` once, when it is drawn, so the draw is per
  visit: closed, the top of the first row shows through in grey (`inert`, so a click opens the section rather than
  playing), and the pointer over it brings up the colour and a little more. That read means the thumbnails load with
  the page, from the providers' image hosts, before anything is pressed. No links, no section.
- **Pressing Play starts it** where the provider takes a parameter for that (`playingUrl`: YouTube, Vimeo,
  SoundCloud), so it is one press, not two; focus moves to the player that replaces the button.
- **Click to embed** (`link-card.tsx`): until pressed, a card is its picture, title, kind and (YouTube) views. The
  picture comes from the provider's image host with no referrer; no player, script or cookie loads. Pressed, the card
  loads an iframe from the link's `embedUrl`, which the page checks again is on `EMBED_ORIGINS` (one off them is shown
  as a plain link). A link with no embed opens in a new tab, `rel="noopener noreferrer"`.
- **CSP:** `lib/app/csp.ts` exports `EMBED_ORIGINS` as `appFrameSrc`, pinned in `tests/unit/lib/app/defaults.test.ts`
  (`HB2`) and checked in the production header by `tests/unit/lib/app/csp.test.ts`. A new provider's origin goes in
  `EMBED_ORIGINS`, nowhere else.
- **A library patch's lesson** (t-183): on its overview, in the lesson card from `lg` up and on the Lesson sheet's How it
  works tab below it, a **Videos and links** button (`links-toggle.tsx`) with the count and kinds from `soundLinks`.
  Pressed, it reads `?sound=` once and opens the cards under it. A sound of the user's own, a shared one or the Default
  patch has none. The lesson, not the library row: the row is a list to scan, and the lesson is where a walk-through
  and the original are read beside the panel.
- **History → Heard on** (t-183): a record with links has a **Watch and listen** button in its row; pressed, it reads
  `?song=` and its row takes the dialog's full width for the cards. The counts come with the lineage
  (`HeardEntry.links`, `summariseSongLinks` in `getSynthDetail`), one read for the whole list; no row reads anything
  until pressed.
- **`/bank` record and artist pages** (t-183): the same section as an instrument's, from `?song=` / `?artist=`, counted
  by the `/bank` route.
- **Privacy:** `/privacy` → "Videos and recordings" names the five players and says nothing of theirs loads before
  play.

## Admin pages

- **`/admin/synths/links`** (Synths → Videos and links): every link, newest edit first, filtered by what it is about
  (`owner`), provider and ours, in the address. Each row links to its owner's editor and shows YouTube's counts with
  when they last changed. Add (naming the owner) and edit open the same form in a dialog.
- **A Videos and links panel** on the databank instrument, record and artist editors and the library patch editor:
  that owner's links, ours first with up/down buttons (each move sends the whole order), then the rest. It reads
  `?<kind>=<id>` once and again after each change.
- **The form** (`link-form.tsx`): paste an address and press Read (`/resolve`). The address becomes its stored form,
  and an empty title is filled with the provider's, for the admin to confirm. A new link may leave the title empty
  (the server asks the provider again); an edit may not. The server parses the URL again on save, so Read is only a
  preview. Editing a link that came from a suggestion says "Suggested by <name>".
- **`/admin/synths/links/suggestions`** (t-186), linked from the Videos and links page, which keeps its sidebar item
  lit: the suggestion queue. See Suggestions.

Not in the catalogue's JSON upload or download, which is content-only (owner ruling on `f-catalogue-admin`).
Database backups cover links, and so does the seed data (Seeded links).

## Seeded links

Every link we have curated is seed data, so a new or deployed database gets them on `npm run db:seed` (owner ruling,
2026-11-07, t-199; it replaced "links aren't seeded"). One JSON file per owner under
`prisma/seeds/app-knowyoursynth/data/links/`, at `<kind>/<id>.json`; a sound's is `sound/<synthId>/<slug>.json`.

```json
{
  "kind": "instrument",
  "id": "pwm-mantis",
  "links": [
    {
      "url": "https://www.youtube.com/watch?v=FCqoMIKfv04",
      "kind": "review",
      "title": "Review: PWM Mantis"
    }
  ]
}
```

**A file names its owner inside it as well as in its path**, and the loader refuses one where they differ. The runner
hashes a unit's inputs by their contents only, so a file moved to another owner (a renamed databank id) would
otherwise leave the hash alone and the unit wouldn't re-run.

A link may also carry `ours`, `order` and `rating` (left out at their defaults), Bandcamp's `providerId` and another
provider's `thumbnailUrl`: only what the URL can't give back (`SeedLinkSchema`). Views and likes are never seeded;
the daily stats job fills them.

**The seed** (`006-links`, after the catalogue and the databank, which write the owners; rules in
`lib/app/links/seed.ts`, each tested):

- **Checked before anything is written.** Every URL must parse to itself, once per owner, with a kind and a title. A
  problem anywhere throws with the whole list and writes nothing.
- **Once per database** (owner ruling, t-200). Each link it applies, created or found already there, gets a
  `LinkSeedRecord` (owner kind, owner's natural key, URL), and a link with a record is never applied again. So a seeded
  link an admin deletes, or moves to another URL, stays gone through every reseed, however often the unit re-runs; links
  new to the data still arrive. The links and their records commit in one transaction, so neither is ever written
  without the other. The record has no foreign key, so it outlives its link and its owner.
- **Create only.** A link its owner already has (owner + URL, the unique index, so `createMany` skips it) is left as
  it is: an admin's title, kind, ours, order and rating, and YouTube's counts, survive every reseed.
- **Never deletes.** A link an admin added that isn't in the data stays.
- **Reads no provider.** It runs offline. A YouTube picture is derived from the id when shown (`thumbnailFor`).
- **An owner the database doesn't have is skipped and logged**, so a removed databank row stops nothing. The data
  test fails on an owner the seed data itself doesn't write, so on a fresh database nothing is skipped.

**Adding links:** add them in dev through the admin pages, run `npm run links:export`, and commit the files. The
export (logic in `exportLinkData`):

- **Keeps each owner's committed order**, with links new to the data after it, oldest first. A reseed gives every row
  the same `createdAt`, so ordering by it alone would re-sort every file.
- **Refuses to drop a committed link** the table doesn't have, naming each, and writes nothing. So exporting from the
  wrong database (an empty one, or one missing a databank row) can't wipe or shrink the data. To drop links on
  purpose (you deleted them in dev), run `npm run links:export -- --prune`.
- **Refuses data the seed would refuse**, and changes nothing when run twice.
- **Writes every file before it removes any**, and removes only the `.json` files no owner has any more; anything else
  in the folder stays.

**Changing how `parseLinkUrl` writes a URL is a data migration.** Seed and export both require every URL to be in
its stored form, so the committed data test, the seed and the export all fail until the stored rows and the data are
rewritten to the new form, together. That refusal is deliberate: accepting the new form quietly would create it beside
the old one on every database that already has the link. The same migration must rewrite `link_seed_record`'s URLs too: otherwise a seeded
link an admin had deleted comes back under its new form, and the old-form records are left behind.

**When the unit re-runs:** whenever any of its `hashInputs` changes: the data, the loader, the links code it runs
(`seed.ts`, `providers.ts`, `owner-ref.ts`), and what decides a URL's stored form and an owner's shape
(`lib/security/sanitize.ts`, an upstream file; `lib/app/bank/data.ts`; `lib/app/sounds/data.ts`). A re-run applies only
links it has no record of, so an unrelated edit to one of those files re-runs it harmlessly.

**Accepted costs** (journal, 2026-11-07):

- **A URL changed in the data is a new link to a database that had the old one.** The data says nothing of what B
  replaced, so the old link stays and the new one is added beside it; an admin there deletes the old one.
- **A link removed from the data and added back later isn't applied again** on a database that had it: its record
  remains. Add it there through the admin pages.
- **An owner removed and later re-created doesn't get its seeded links again.** Its links went with it (cascade),
  and their records stay, keyed by the owner's natural key. Add them there through the admin pages.
- **The records start when this lands.** A database whose links were seeded before `LinkSeedRecord` existed has
  none, so its first run after the migration treats every link as new: it re-creates any seeded link an admin had
  deleted in between, then records them all. No database but dev had run the links seed by then, and dev was
  recorded on the day, so t-199 and t-200 deploy together.
- **An owner missing when the unit runs gets its links only on its next run.** Its links get no record, so they apply
  then; but the runner has no way to force a run, and restoring the owner doesn't change the unit's hash.
- **Seeded `ours` links keep their `order`**, so on a database whose admin already has their own `ours` links on that
  owner, two can share a position (the tie falls to `createdAt`) until one reorder. No seeded link is `ours` today.

**Removing a link everywhere:** deleting it in dev and re-exporting with `--prune` keeps it out of databases that
haven't seeded it yet. One that already has it keeps it until an admin there deletes it, and then it stays deleted.

## Suggestions

A signed-in user says a video or link belongs on an instrument, a library patch, a song or an artist; an admin
accepts or declines it (`f-link-suggestions` t-185). The shape is the synth suggestions' (`lib/app/bank/suggestions.ts`),
its reasoning re-derived:

- **`LinkSuggestion` is on `SYSTEM_MODELS`, not `GLOBAL_CONFIG_MODELS`.** It is an inbound queue decided in one place,
  not a shared setting, and the shared-settings guard would refuse a user's `POST` to a global-config table.
  `not-personal` in `lib/app/owner-classification.ts`; exported to its suggester as `linkSuggestions`.
- **What it is about is a kind and the natural key** (`targetKind`, `targetId`, as `owner-ref.ts` names owners), not a
  foreign key. A removed target leaves the suggestion as history; accepting it is a 404, so the admin declines it.
- **`userId` is a plain string** with a hand-written FK, `ON DELETE SET NULL`, pinned by a drift probe: an erased
  user's suggestions stay, with nobody attached.
- **`linkId` records which link an accept made**, as a synth suggestion's `instrumentId` does, without an FK.

| Route                                      | Who       | What                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/links/suggestions`           | signed in | `{ target: { kind, id }, url, kind, title?, note? }`. 400 for a URL the parser refuses, 404 for a target not there (or a sound on an unlisted synth), 409 for a URL it already links or that is already waiting for it. 10 an hour per user, then 429 |
| `GET /api/v1/admin/links/suggestions`      | admin     | `?status=PENDING\|ACCEPTED\|DECLINED`, newest first, each with `target { kind, id, name }` (`name` null once removed) and `suggestedBy` (null once erased)                                                                                            |
| `POST /api/v1/admin/links/suggestions/:id` | admin     | `{ action: 'accept', kind?, title? }` or `{ action: 'decline', reason }`. 409 once decided                                                                                                                                                            |

Rules (`lib/app/links/suggestions.ts`, each tested):

- **A suggestion's URL is parsed, never fetched.** It is stored in its canonical form, so it compares with the links
  the target has. Only the accept reads the provider, through `createLink`.
- **A sound on an unlisted synth is a 404**, as the public links reads treat it: otherwise the 404 / 409 / 201 answers
  would say which hidden patches exist and what they link.
- **One pending suggestion per target and URL.** A second, from anyone, is a 409 until the first is decided, so the
  admin does not decline duplicates one by one. Checked, not a unique index: a decided one can be suggested again.
- **A decision is made once**: a conditional update out of `PENDING`, so of two admins at once the second gets a 409.
- **Accept goes through `createLink`**: parsed again, read from the provider, 409 on a URL linked since, audited as
  `external_link.create`. `kind` and `title` from the admin replace the user's. With no title from either, the
  provider's, else 400. A refused create hands the row back to `PENDING`. An accepted link is never ours; the admin
  can mark it afterwards. The suggester is not credited publicly.
- Audited as `link_suggestion.accept|decline`, recording status, `linkId` and reason. The decide route passes
  `writesSharedSettings: true`, because an accept writes a link.

### Where users suggest, and where admins decide (t-186)

- **Suggest a link** (`components/app/links/suggest-link.tsx`): under the list in the section under the panel and on
  `/bank` instrument, record and artist pages (`LinksSection`), and under the cards of a library patch's lesson and
  of each History → Heard on row (`LinksToggle`). **Where there are none yet it is shown on its own**, so the first
  link can be suggested; a sound of the user's own, a shared one or the Default patch has none to suggest for.
- **Under a panel it is about the databank instrument**, since a synth's videos are its instruments'
  (`SynthDetail.instruments`, from the synth's `bankInstruments`). A synth modelling several asks which.
- Signed out, it offers **sign-in back to this page, its query included** (`window.location`, read after hydration:
  the server renders plain `/login`). Checked in the browser with `LinkSuggestionInputSchema` first. A 409 and a 400
  are shown on the address in the server's words; a 429 says to wait; a 404 says it is no longer there.
- **The queue** (`/admin/synths/links/suggestions`, `suggestion-queue.tsx`): tabs per status (`?status=`, pending by
  default). Each row names its suggester (or "an erased account") and its target, linked to the target's editor
  (`ownerAdminPath`). **Approve** opens `LinkForm` with the suggestion: owner and address fixed (Read still previews
  it), kind and title from the user, no Ours or Rating (an accepted link is never ours); saving is the decide route's
  `accept`. A target since removed cannot be approved, only declined. **Decline** asks for a reason.

## Links on your own sounds

An owner puts their own demo of a patch, or a recording made with it, on the sound (`f-link-suggestions` t-187). Edited
from My patches (**Links…** under the open sound, `components/app/synth/sound-links-form.tsx`), shown on the sound's
shared page under its notes as `LinkCard`s (`shared-sound-strip.tsx`), and listed by title and provider in the
moderation queue beside a report.

- **Not `ExternalLink` rows.** That table is shared settings (`GLOBAL_CONFIG_MODELS`) with a one-owner CHECK over
  catalogue owners: a user's row there would break the classification and the shared-settings guard. So they are a
  `links` JSON column on `UserSound`, as `lesson` is: they cascade with the sound, are exported with it (`app.sounds`),
  and are moderated with it (report, unlist). No new export source: `export-sources.test.ts` reads `User` FKs, not
  columns.
- **At most five, in the owner's order.** No draw, no `ours`, no view counts: they are not ranked and do not feed the
  YouTube stats job. Each card says Demo.
- **Only the five named providers.** A plain web address is a 400: on a public page, a user's link to anywhere is a
  spam or phishing surface no admin has looked at. (A suggestion may be a plain link, because an admin decides it.)
- **Parsed and read on save** (`resolveSoundLinks`): the canonical address, the provider's id (Bandcamp's from its
  page), its picture and a title, the owner's or else the provider's (none from either is a 400 on that row). An
  address the sound already had is not read again, unless its title was cleared (the provider's comes back) or it
  is a Bandcamp link still without its id. The same address twice is a 400. Providers are read before the
  write's transaction, so none is waited on under the owner's lock. **Checked again on read** (`storedSoundLinks`): an
  entry that no longer parses to its provider and address is not served.
- **Served with `embedUrl` built from the provider and id**, and `thumbnailFor` checked again, as every link is. The
  card list goes through `readPublicLinks` on the page too (`soundLinkViews`), so an embed off `EMBED_ORIGINS` is dropped
  where it is used.
- **The word check covers the titles** at publish and on a PATCH that changes a published sound's links
  ([`sharing.md`](./sharing.md#publishing)).
- **A copy never carries them.** Someone's demo of their sound isn't the copier's.
- **Sub-cap:** a PATCH that sends `links` is 20 an hour per user (`soundLinksLimiter`, on top of the proxy's section
  cap), since each may read five providers. A PATCH without them does not spend it.

Tests: `tests/unit/app/api/v1/sounds/links.test.ts`, the queue in `reports.test.ts`,
`tests/unit/components/app/sharing/shared-sound-links.test.tsx`, `tests/unit/components/app/synth/sound-links-form.test.tsx`;
the real column and the export in `npm run smoke:sounds`.
