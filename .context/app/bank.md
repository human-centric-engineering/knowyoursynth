# The databank

The artists, records, instruments and the people who built them, joined by id: every synth's
"Heard on" list and the `/bank` pages are read from it. It is content (D1, D9). The prototype kept
it in four JavaScript files (`prototype/src/bank/`); here it is tables, and the live app reads it
only from them (D13).

## Where it lives

| Table                  | Holds                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `BankMaker`            | A designer, engineer or founder: the "Innovators". The file calls them makers.                                                    |
| `BankInstrument`       | A real instrument. `maker` is the company, as text. `recreationOfId` names an original. `source` is where its facts were checked. |
| `BankInstrumentPerson` | The makers behind an instrument, in order.                                                                                        |
| `BankInstrumentSynth`  | An app synth that models the instrument (`app`).                                                                                  |
| `BankArtist`           | A player, band, producer, composer or sound designer.                                                                             |
| `BankArtistMember`     | A member of a group: one row per pair, under the group.                                                                           |
| `BankArtistInstrument` | An instrument an artist is known to have used beyond their records.                                                               |
| `BankSong`             | A song, album, score, performance or body of work.                                                                                |
| `BankSongArtist`       | A work's credited artists, in credit order.                                                                                       |
| `BankSongPart`         | What a synth plays on a work: `on`, `text`, the player.                                                                           |
| `BankPartInstrument`   | The instruments a part is played on, in order.                                                                                    |
| `BankPartSynth`        | What a part says about one app synth: listed under it, a sound in its style, a note.                                              |
| `BankRemoval`          | A row an admin removed (kind and id), so the seed does not re-create it.                                                          |

The schema is in `prisma/schema/app.prisma`. Like the catalogue, the tables are on
`GLOBAL_CONFIG_MODELS` (a divergence, sunrise#964) and hold nothing about a person. Users'
suggestions are a separate table, `SynthSuggestion` ([below](#suggestions)).

Things the files did that the tables do differently:

- **Two words for one thing.** `makers.js` holds people. The company that sold an instrument is
  the instrument's `maker` text. "Every maker in the databank" means the companies.
- **Membership is one row per pair.** The files recorded it on the group (`members`), the member
  (`memberOf`) or both, and nine pairs on one side only. The seed writes the union, under the
  group, and the joins read it from either side (`membersOf`, `groupsOf`).
- **A part's per-synth fields are one row per synth.** `synths`, `sounds` and `notes` were three
  maps keyed by synth id; `BankPartSynth` holds all three, with `listed` for `synths`.
- **Kinds are text,** checked by the shapes in `lib/app/bank/data.ts`, so a new one (a Eurorack
  kind is expected after the first release) is a code change, not a migration.
- **A recreation is its own instrument** (owner ruling, 2026-10-13): a Behringer Model D is a
  row whose `recreationOfId` is the Minimoog. "Heard on" still follows `app` on the original.

## The reference list

`f-databank` t-38 (b4). Owned and wishlist (D4) need every synth that exists, not only the ones
named on records, so `data/bank/reference.json` lists the rest: hardware synths sold commercially,
from any maker and era. It was compiled for this app from facts (D9), each entry checked against a
page that states it, and that page is the entry's `source`. Its entries are instruments like the
others; the loader adds them after the 86.

- **In:** keyboards, desktop and rack modules, semi-modulars, and modular systems sold as systems.
  Sampling keyboards, sample-playback synths, string machines and workstations count. **Out:**
  drum machines, single Eurorack modules (for the first release only, owner ruling 2026-10-13),
  software, samplers and grooveboxes, home keyboards, organs and pianos, theremins.
- **A recreation is its own entry**, linked to its original by `recreationOf`, and lists no app
  synths. "Heard on" stays on the original, so a synth's list is the same with or without the
  reference list (`heard-on.json` still matches).
- **Every reference entry has a `source`**, a web address checked when it was compiled: the maker's
  page or manual, a dated press release or review, or an encyclopedia article, never another
  site's synth database. The 86 have none yet. An admin can add one from the instrument's form;
  accepting a suggestion starts it from the suggestion's link. The instrument's page links it.
- **`maker` is the company as it was named when the instrument came out**: `Sequential Circuits`,
  `Dave Smith Instruments` and `Sequential` are one line of instruments under three names.
- **`kind`**: `modular` for modules sold in a system; `semi-modular` where a patch bay re-routes the
  main signal path over wiring that works without cables; `sequencer` for a synth played from its
  own step sequencer with no keyboard (TB-303); `module` for any other unit without a keyboard;
  otherwise `mono` (duophonic included), `paraphonic` or `poly`.

`tests/unit/lib/app/bank/reference.test.ts` holds it to that: every company named on the 86 has
the rest of its range here (or is listed as having none), the recreations behind the app's
panels link to their originals, nothing repeats one of the 86, and the whole databank passes
`checkBank`.

## How content gets in

1. **Export, once.** `node prototype/tools/export-content.mjs --bank` writes the four files, as
   they are, to `prisma/seeds/app-knowyoursynth/data/bank/`. Committed. Nothing else runs it.
   `reference.json` beside them is the [reference list](#the-reference-list), compiled here.
2. **Seed.** `npm run db:seed` runs `002-bank.ts` after the catalogue's unit, since the databank
   points at synths and their sounds. It hands the data to `seedBank()` (`lib/app/bank/seed.ts`).
3. **Admins edit the tables** after that, at `/admin/synths/bank` ([below](#admin-editing)).

The seed's rules, each tested in `tests/unit/lib/app/bank/seed.test.ts`, are the catalogue's:

- **It checks every reference before it writes anything**: the prototype's `checkBank`, as
  `planBank`. Ids unique (artists and makers share one namespace), every maker, instrument,
  artist, player and app synth known, every sound a part names in that synth's library, and a
  recreation chain that ends at an original. One problem and it throws the whole list.
- **A re-run writes nothing**, joins included.
- **A row with `editedAt` set is an admin's**, and the seed writes neither it nor its joins again.
- **A join belongs to the row that lists it** (an instrument's people and synths, an artist's
  instruments, a group's members, a song's artists and parts). While the row is the seed's, the
  seed replaces its joins in one transaction when they differ. A seeded part's id is
  `<songId>#<position>`.
- **It never deletes a row**, so an empty source writes nothing. A reference between rows is
  `Restrict`: a row something points at cannot be removed until the reference goes.
- **It leaves out a row an admin removed** (`BankRemoval`), and that row's joins. Data that has
  come to point at a removed row is a problem like any other, found before anything is written,
  unless the row pointing at it is an admin's (the seed does not write that).

`npm run check:synths` joins each synth's "Heard on" from the same seed data and runs `planBank`
against every synth's library, so a record that names a missing sound fails the check.

## The prototype is the spec

`tests/fixtures/bank/heard-on.json` is the prototype's own `heardFor()` for all 25 synths,
recorded by `npx tsx scripts/record-heard-on.ts`. Never re-record it to make a port pass (D3).

- `tests/unit/lib/app/bank/joins.test.ts`: the ported joins over the seed data equal it.
- `tests/unit/lib/app/bank/read.test.ts`: the read layer over the seed's own rows equals it, and
  reads every row back as the seed data.
- `npm run smoke:bank`, after `npm run db:seed`: the same against the dev database, with the
  counts (50 makers, 184 artists, 248 songs, and the 86 instruments plus the reference list) and a second seed writing nothing.

## How it is read

`lib/app/bank/read.ts` hands rows back in the files' shapes, so the joins in
`lib/app/bank/joins.ts` (a transliteration of `src/bank/index.js`) read one form whatever the
source.

- **"Heard on"** is inside a synth's lineage, as the contract shapes it: `getSynthDetail` calls
  `getHeardOn`, which reads only the songs the synth lists, and the names of the artists those
  credit (`heardArtists`). The lineage dialog shows it, with "Load a sound in this style" and an
  "About <artist>" link to each artist's page.
- `GET /api/v1/bank/:kind` (`artists`, `makers`, `instruments`, `songs`): every row, sorted as the
  prototype's databank sorted them.
- `GET /api/v1/bank/:kind/:id`: one row with what it joins to. An artist's records, members,
  groups and instruments; a maker's instruments; an instrument's people, synths, original,
  recreations, records and artists; a song's artists, players and instruments.

Public, the section rate limit, ETags. These two read the whole databank once per request and
join in memory, as the prototype did. When the compiled list (b4) or more records make that slow,
give the slow join its own query, as `getHeardOn` has.

## Searching

`lib/app/bank/search.ts` (`f-tutor-knowledge` t-57) finds rows by name and text, and calls no AI
provider. `GET /api/v1/bank/search?q=&kind=&limit=` serves it publicly (`q` 1–200 characters,
`limit` 1–20, default 10), and the tutor's `search_databank` tool uses it
([`tutor.md`](./tutor.md#the-tools)).

- **BM25 over three fields of each row**, weighted 3 : 1 : 0.5: its name; its own text (an
  artist's or maker's summary, story, innovations; an instrument's text and maker; a record's
  parts, album and credit); and the names of the rows it links to. The last is what lets "who
  played a Minimoog" reach artists whose rows only link to it, without outranking the instrument.
- **A query that holds a row's whole name, as at least half its words, lifts that row** above
  rows that mention it or add to its name: "Tom Oberheim" finds the maker before the Tom Oberheim
  SEM, and "Minimoog Model D" the original before its 2016 reissue. The half keeps a one-word name
  (the artists Europe and Air, the record "Blue") from topping a question that only uses the word.
  The match keeps stop words, so "The Who" is found by its name.
- **Words are compared loosely**: case and accents off, stop words out, plain plurals folded
  ("synths" → "synth"). A word with a digit is kept whole, so "DX7s" is not a plural of "DX7".
- **Each result** carries its kind, id, name, page (`bankHref`), a line that places it ("Moog Music
  · 1970 · mono"), the sentence of its text that best matches, and up to eight rows it links to.
- **In memory, cached by content.** Building the documents (each row's joins) takes some 150 ms;
  the index is kept while the bank's content hashes the same, so a search costs the read layer's
  four queries, the hash and a few milliseconds, and an admin's edit shows on the next search.
  It was planned as Postgres `ts_rank_cd`. Scoring here gives true BM25, needs no raw SQL (which
  `lib/app` may only use from the allowlist), and is tested over the committed data.
- **What it misses**: a question that names nothing in the databank ("who pioneered modular
  synthesis?"). That is the meaning-based layer's job (t-58), which the tutor's tool merges in; the
  public route stays lexical, so it costs nothing per query.

## The pages

`/bank` and `/bank/[tab]/[id]`, in `(public)`, transliterated from the prototype's `Bank.jsx`
dialog (D3). The tabs are its four, in its order and with its labels: Artists, Innovators,
Records, Instruments. A tab's URL segment is the API's kind, so the prototype's
`#bank/<tab>/<id>` links map straight across (`components/app/bank/routes.ts`).

- **`/bank` is the artists tab.** `/bank/artists` redirects there. `/bank/[tab]` is a tab's
  welcome, `/bank/[tab]/[id]` a row. An unknown tab or row is a 404.
- **The layout holds the list** (`components/app/bank/bank-shell.tsx`): the tabs with their
  counts, "Find", the era filter and the grouped rows. It persists between pages, so the search
  survives a click. Its rows are worked out on the server (`lists.ts`); the search runs in the
  browser over them. Below `lg`, the list and the page take turns, as in the prototype.
- **The pages are server components** (`bank-detail.tsx`) over `detailFrom`. Every link is a
  URL: another databank page, a synth's panel (`/synths/<id>`), or a synth with a sound loaded
  (`/synths/<id>?sound=<soundId>`). A panel or sound link shows only for a listed synth, and a
  sound only when that synth's library has it (`listSoundNames`).
- **An instrument says what it recreates and lists its recreations.** The prototype had no
  recreations; this is the one addition to its pages.
- **Read in-process, once per request**: `components/app/bank/load.ts` wraps the reads in React
  `cache`, so the layout and the page share one `loadBank`.
- **In the sitemap**: `/bank`, each tab, and every row (`components/app/bank/sitemap.ts`). If the
  databank cannot be read, the sitemap still serves the tabs and the site's other pages.

## Admin editing

`f-databank` t-36. Pages under the Synths admin section, beside Designs and Catalogue:
`/admin/synths/bank?kind=<kind>` lists one kind, `/admin/synths/bank/<kind>/<id>` edits a row and
`/admin/synths/bank/<kind>/new` adds one (so `new` cannot be an id). They are thin shells over:

- `GET /api/v1/admin/bank/:kind`: id, name, a detail line and `editedAt`, by name.
- `POST /api/v1/admin/bank/:kind`: create, the row in the files' shape with its id.
- `GET|PUT|DELETE /api/v1/admin/bank/:kind/:id`: read, replace whole, or remove.

All `withAdminAuth`, `writesSharedSettings` on writes, each change in `AiAdminAuditLog` as
`bank_<kind>.create|update|delete` with what changed. The rules live in `lib/app/bank/admin.ts`,
each tested in `tests/unit/app/api/v1/admin/bank/route.test.ts`:

- **A row is edited whole, with its joins**: an instrument's people and synths, an artist's other
  instruments and (for a group) members, a song's artists and parts. An artist's groups are shown
  but set on the group, since membership is the group's row.
- **Checked as the seed checks.** The change is put into the databank as it stands and `checkBank`
  run over it; any problem it adds refuses the save, naming each. A problem already there does not
  block an unrelated save.
- **A removal is refused while anything points at the row**, naming what does. Only the row's own
  joins go with it. It is recorded in `BankRemoval`; creating the id again clears that.
- **Saving marks the row edited** (`editedAt`), so the seed leaves it and its joins alone. A save
  that changes nothing writes and audits nothing.

## Suggestions

`f-databank` t-37. A signed-in user whose synth is missing says so from the Instruments tab
(`components/app/bank/suggest-form.tsx`); a visitor without a session is offered sign-in back to
it. Admins decide each one at `/admin/synths/suggestions`, with a tab per status.

- `POST /api/v1/bank/suggestions`: `{ name, maker, link?, note? }`, stored as `PENDING` under the
  caller's id. A link must be http or https. Capped at ten an hour per user
  (`suggestionLimiter`, on top of the proxy's section cap), a 429 past that.
- `GET /api/v1/admin/bank/suggestions?status=`: newest first, each naming its suggester.
- `POST /api/v1/admin/bank/suggestions/:id`: `accept` with the instrument in the files' shape,
  `merge` with an `instrumentId`, or `decline` with a `reason`. Audited as
  `synth_suggestion.<action>`; an accept is audited as `bank_instrument.create` too.

The rules live in `lib/app/bank/suggestions.ts`, each tested in
`tests/unit/app/api/v1/bank/suggestions/route.test.ts`:

- **Accept goes through the databank's own create path** (`saveBankRow`), so the instrument is
  checked, marked edited and refused exactly as a new row from the Databank page would be.
- **A suggestion is decided once.** A decision moves it out of `PENDING` with a conditional
  update, so of two admins deciding at once, one gets a 409. An accept claims the row first and
  hands it back to `PENDING` if the databank refuses the instrument.
- **`instrumentId` records the outcome, not a reference.** It is not a foreign key, so it does not
  block removing that instrument.

`SynthSuggestion` is about a person, unlike the tables above. Its `userId` is a plain string,
since a Prisma relation would need a field on the platform's `User`. The foreign key is written by
hand in the migration, `ON DELETE SET NULL`, so an erased user's suggestions stay as history with
nobody attached. A drift probe in `lib/app/db-drift.ts` pins it. The table is declared in
`lib/app/data-export.ts`, so a subject-access export includes the user's own suggestions. It is
on `SYSTEM_MODELS`, beside `ContactSubmission`: like a contact message it is an inbound
submission decided from one queue, so scoping it to an org would hide it from the admins who act
on it. It is not on `GLOBAL_CONFIG_MODELS` because a suggestion is not a shared setting. That list
is what the shared-settings guard reads, and it would refuse the signed-in user's `POST`.

## Don't

- **Don't read the seed data from app code.** The seed folder, `scripts/check-synths.ts` and
  `scripts/smoke/bank.ts` may (`seed-data-boundary.test.ts`).
- **Don't run `prisma migrate dev` without `--create-only`** on these tables: the generated
  migration drops the unmodelled search and vector indexes (`B13`).
- **Don't fix content in the data files once seeded.** Edit the row at `/admin/synths/bank`.
- **Don't delete a row with SQL.** Without a `BankRemoval` record the seed brings it back on its
  next run.
