# Videos and links

Demos, reviews, recordings and lessons on YouTube, Vimeo, Spotify, Bandcamp and SoundCloud, plus plain web links,
attached to the things they are about. Admin-managed. Hub feature `f-videos-and-links` (§40). Suggestions from
users and links on users' own sounds are `f-link-suggestions` (§41), not here.

| Piece                       | Where                                        | Task  |
| --------------------------- | -------------------------------------------- | ----- |
| Table                       | `ExternalLink` in `prisma/schema/app.prisma` | t-179 |
| Parsing, embeds, thumbnails | `lib/app/links/providers.ts`                 | t-179 |
| Order                       | `lib/app/links/order.ts`                     | t-179 |
| Owners                      | `lib/app/links/owner.ts`                     | t-179 |
| Admin writes                | `lib/app/links/admin.ts`, `admin-route.ts`   | t-179 |
| Public read                 | `lib/app/links/read.ts`                      | t-179 |
| Titles, thumbnails, views   | `details.ts`, `stats.ts`, `fetch.ts`         | t-180 |
| Admin pages                 | `components/app/admin/links/`                | t-181 |
| Under the panel, `/bank`    | `components/app/links/`, `lib/app/csp.ts`    | t-182 |
| Patches and History         | `links-toggle.tsx`, `summariseSoundLinks`    | t-183 |

## Don't

- **Don't load an iframe from a stored URL.** Build it with `embedUrl(provider, providerId)`. That function only ever
  returns an address on one of `EMBED_ORIGINS`, built from an id that matched its provider's shape. The stored `url`
  is what the "open" link points at, never an embed source.
- **Don't take the provider or its id from a caller.** Both come from `parseLinkUrl` on every write.
- **Don't cache a public list.** Every read is a fresh draw (see Order), so the route says `no-store` and has no ETag.
- **Don't add a second owner column without the CHECK.** `external_link_one_owner` requires exactly one of
  `instrumentId`, `soundId`, `songId`, `artistId`. Prisma can't model it, so it is hand-written in the migration and
  pinned by a drift probe (`lib/app/db-drift.ts`). A new owner kind means a new column, a new CHECK, a new unique
  index on it plus `url`, and a case in `owner.ts`.
- **Don't seed links.** No seed writes this table, so a reseed can never overwrite or drop an admin's links.

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
`owner { kind, id, name }, providerId, order, rating, likes, statsAt, createdAt, updatedAt`.

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
  preview.

Not in the catalogue's JSON upload or download, which is content-only (owner ruling on `f-catalogue-admin`).
Database backups cover links.
