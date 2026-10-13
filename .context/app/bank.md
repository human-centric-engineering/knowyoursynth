# The databank

The artists, records, instruments and the people who built them, joined by id: every synth's
"Heard on" list and the `/bank` pages are read from it. It is content (D1, D9). The prototype kept
it in four JavaScript files (`prototype/src/bank/`); here it is tables, and the live app reads it
only from them (D13).

## Where it lives

| Table                  | Holds                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `BankMaker`            | A designer, engineer or founder: the "Innovators". The file calls them makers.          |
| `BankInstrument`       | A real instrument. `maker` is the company, as text. `recreationOfId` names an original. |
| `BankInstrumentPerson` | The makers behind an instrument, in order.                                              |
| `BankInstrumentSynth`  | An app synth that models the instrument (`app`).                                        |
| `BankArtist`           | A player, band, producer, composer or sound designer.                                   |
| `BankArtistMember`     | A member of a group: one row per pair, under the group.                                 |
| `BankArtistInstrument` | An instrument an artist is known to have used beyond their records.                     |
| `BankSong`             | A song, album, score, performance or body of work.                                      |
| `BankSongArtist`       | A work's credited artists, in credit order.                                             |
| `BankSongPart`         | What a synth plays on a work: `on`, `text`, the player.                                 |
| `BankPartInstrument`   | The instruments a part is played on, in order.                                          |
| `BankPartSynth`        | What a part says about one app synth: listed under it, a sound in its style, a note.    |

The schema is in `prisma/schema/app.prisma`. Like the catalogue, the tables are on
`GLOBAL_CONFIG_MODELS` (a divergence, sunrise#964) and hold nothing about a person.

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

## How content gets in

1. **Export, once.** `node prototype/tools/export-content.mjs --bank` writes the four files, as
   they are, to `prisma/seeds/app-knowyoursynth/data/bank/`. Committed. Nothing else runs it.
2. **Seed.** `npm run db:seed` runs `002-bank.ts` after the catalogue's unit, since the databank
   points at synths and their sounds. It hands the data to `seedBank()` (`lib/app/bank/seed.ts`).
3. **Admins edit the tables** after that (`f-databank` b3).

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

`npm run check:synths` joins each synth's "Heard on" from the same seed data and runs `planBank`
against every synth's library, so a record that names a missing sound fails the check.

## The prototype is the spec

`tests/fixtures/bank/heard-on.json` is the prototype's own `heardFor()` for all 25 synths,
recorded by `npx tsx scripts/record-heard-on.ts`. Never re-record it to make a port pass (D3).

- `tests/unit/lib/app/bank/joins.test.ts`: the ported joins over the seed data equal it.
- `tests/unit/lib/app/bank/read.test.ts`: the read layer over the seed's own rows equals it, and
  reads every row back as the seed data.
- `npm run smoke:bank`, after `npm run db:seed`: the same against the dev database, with the
  counts (50 makers, 86 instruments, 184 artists, 248 songs) and a second seed writing nothing.

## How it is read

`lib/app/bank/read.ts` hands rows back in the files' shapes, so the joins in
`lib/app/bank/joins.ts` (a transliteration of `src/bank/index.js`) read one form whatever the
source.

- **"Heard on"** is inside a synth's lineage, as the contract shapes it: `getSynthDetail` calls
  `getHeardOn`, which reads only the songs the synth lists. The lineage dialog shows it, with
  "Load a sound in this style".
- `GET /api/v1/bank/:kind` (`artists`, `makers`, `instruments`, `songs`): every row, sorted as the
  prototype's databank sorted them.
- `GET /api/v1/bank/:kind/:id`: one row with what it joins to. An artist's records, members,
  groups and instruments; a maker's instruments; an instrument's people, synths, original,
  recreations, records and artists; a song's artists, players and instruments.

Public, the section rate limit, ETags. These two read the whole databank once per request and
join in memory, as the prototype did. When the compiled list (b4) or more records make that slow,
give the slow join its own query, as `getHeardOn` has.

## Don't

- **Don't read the seed data from app code.** The seed folder, `scripts/check-synths.ts` and
  `scripts/smoke/bank.ts` may (`seed-data-boundary.test.ts`).
- **Don't run `prisma migrate dev` without `--create-only`** on these tables: the generated
  migration drops the unmodelled search and vector indexes (`B13`).
- **Don't fix content in the data files once seeded.** Edit the table.
