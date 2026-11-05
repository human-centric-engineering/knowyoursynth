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
| Titles, thumbnails, views   | not built yet                                | t-180 |
| Admin pages                 | not built yet                                | t-181 |
| Under the panel, `/bank`    | not built yet                                | t-182 |
| Patches and History         | not built yet                                | t-183 |

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
| `sound`      | `<synthId>/<slug>` | `model-d/stacked-night-bass` | the library patch                                        |
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
  library pattern's `inspiredSongId` / `inspiredArtistId` (t-183), so the same Spotify link is never typed onto
  several patches.

## Providers and parsing

`parseLinkUrl` checks the input with `sanitizeUrl`, then requires https, no login, no port and a real host name. The
provider is decided by the host, matched exactly or as a sub-domain, never as a substring.

| Provider     | Accepted                                                                                                       | `providerId`                             | Stored URL                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `youtube`    | `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`                                                          | 11-char video id                         | `https://www.youtube.com/watch?v=<id>`        |
| `vimeo`      | `vimeo.com/<n>[/<hash>]`, `…/channels/x/<n>`, `…/groups/x/videos/<n>`, `player.vimeo.com/video/<n>[?h=<hash>]` | `<n>`, or `<n>:<hash>` when unlisted     | `https://vimeo.com/<n>[/<hash>]`              |
| `spotify`    | `open.spotify.com/[intl-xx/\|embed/]<type>/<id>`                                                               | `<type>/<id>`                            | `https://open.spotify.com/<type>/<id>`        |
| `soundcloud` | `soundcloud.com/<user>/<track>[/s-<token>]`, `…/<user>/sets/<set>[/s-<token>]`                                 | the path lower-cased, the token as given | `https://soundcloud.com/<path>`               |
| `bandcamp`   | `<artist>.bandcamp.com/track\|album/<slug>`                                                                    | null until t-180 reads it                | `https://<artist>.bandcamp.com/<type>/<slug>` |
| `other`      | any other https address                                                                                        | null                                     | as given, without its fragment                |

- **A named provider's URL without its id is refused**, not stored as `other`: an admin who pasted a YouTube channel
  page meant a video.
- **The stored URL is canonical**, so the same video pasted two ways is one link: the table is unique on owner + URL
  (four unique indexes, one per owner column; Postgres treats NULLs as distinct).
- A YouTube start time (`&t=`) is dropped. Embeds start at the beginning.
- **An unlisted Vimeo video keeps its privacy hash** and a private SoundCloud track or set keeps its share token
  (`s-…`, case kept): without them the embed will not play. A Vimeo showcase, album or user page, and a SoundCloud
  user's own pages (`likes`, `tracks`, `albums`, `sets`, `reposts`, `popular-tracks`, `followers`, …), are refused,
  not mistaken for a video.
- **Bandcamp's embed id isn't in its URL** (`EmbeddedPlayer/album=<n>`). t-180 reads it from the page's `og:video`
  meta. Until then, and whenever that fails, a Bandcamp link opens in a new tab.

`embedUrl` builds: `www.youtube-nocookie.com/embed/<id>`, `player.vimeo.com/video/<n>?[h=<hash>&]dnt=1`,
`open.spotify.com/embed/<type>/<id>`, `w.soundcloud.com/player/?url=<encoded canonical URL>`,
`bandcamp.com/EmbeddedPlayer/<album|track>=<n>/…`. Those five origins are `EMBED_ORIGINS`, which t-182 puts in
`lib/app/csp.ts` as `frame-src`. Thumbnails need no CSP change: `img-src` already allows `https:`.

`thumbnailFor` returns the stored thumbnail (read from the provider in t-180), or for YouTube the one its id names
(`i.ytimg.com/vi/<id>/hqdefault.jpg`), or nothing.

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
`Int`, capped at its largest value by whoever writes it (t-180): the logarithm makes the cap irrelevant to the order.
Tests pass a seeded `random`.

## API

| Route                                                                                      | Who    | What                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/links?instrument=\|synth=\|sound=\|song=\|artist=`                            | anyone | exactly one target; ordered; `no-store`. A hidden synth, or a sound on one, has none. Unknown ids give an empty list. |
| `GET /api/v1/admin/links?instrument=\|sound=\|song=\|artist=&provider=&ours=&page=&limit=` | admin  | every link, newest edit first, with its owner; at most one owner filter; paginated (≤ 100)                            |
| `POST /api/v1/admin/links`                                                                 | admin  | `{ owner: { kind, id }, url, kind, title, ours?, rating? }`. 409 when that owner already has the URL                  |
| `GET\|PATCH\|DELETE /api/v1/admin/links/:id`                                               | admin  | `PATCH` any of `url`, `kind`, `title`, `ours`, `rating`; the owner never changes                                      |
| `PUT /api/v1/admin/links/order`                                                            | admin  | `{ owner, ids }`: every one of the owner's own videos, once. One unmarked or removed meanwhile: 409, nothing moves    |

A public link carries `id, url, provider, kind, title, thumbnailUrl, embedUrl, ours, views`. An admin link adds
`owner { kind, id, name }, providerId, order, rating, likes, statsAt, createdAt, updatedAt`.

Admin rules (`lib/app/links/admin.ts`, each tested):

- A new URL drops what was read from the old one (thumbnail, views, likes, `statsAt`).
- Marking a link ours puts it last among the owner's own. Unmarking keeps its `order`, unused.
- A save that changes nothing writes nothing and is not audited.
- Audited as `external_link.create|update|delete|reorder`, recording owner, URL, kind, title, ours and rating.
- Writes pass `writesSharedSettings: true`: links are `GLOBAL_CONFIG_MODELS` (divergence row in
  `.context/app/divergences.md`), so at `multi` only the install org's admins write them.

Not in the catalogue's JSON upload or download, which is content-only (owner ruling on `f-catalogue-admin`).
Database backups cover links.
