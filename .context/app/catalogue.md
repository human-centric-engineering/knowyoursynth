# The catalogue

The synths the app lists and everything said about them: each synth's library of sounds, its
lineage, its "Unusual on…" notes and its "What is not modelled" list. It is content, not
instrument (D1). The definitions in `lib/app/synths/defs/` are code; the catalogue is four
tables, and the live app reads it only from them (D13).

## Where it lives

| Table          | Holds                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Synth`        | One row per synth: name, maker, year, heritage, summary (from the definition), listed, order.                                                                                   |
| `SynthSound`   | A library sound, built step by step (`Preset`), and the definition version it was made on.                                                                                      |
| `SynthLineage` | A synth's history section, without "Heard on" (that comes from the databank, `f-databank`).                                                                                     |
| `SynthNote`    | `UNUSUAL` notes on a control, jack or area, and the `LIMIT_INTRO` and `LIMIT` entries of a synth's "What is not modelled" list. A `LIMIT` with no synth is true of every panel. |

The schema is in `prisma/schema/app.prisma`. The tables are product content every org shares, so
they are on `GLOBAL_CONFIG_MODELS` (a divergence, sunrise#964), and they hold nothing about a
person, so `lib/app/data-export.ts` declares them excluded.

## How content gets in

1. **Export, once per synth.** `node prototype/tools/export-content.mjs <id> --def-version=N`
   writes the synth's content from the prototype to `prisma/seeds/app-knowyoursynth/data/`, and
   the output is committed. Run it in the synth's port task; nothing else runs it.
2. **Seed.** `npm run db:seed` runs `prisma/seeds/app-knowyoursynth/001-catalogue.ts`, which hands
   the data to `seedCatalogue()` (`lib/app/catalogue/seed.ts`).
3. **Admins edit the tables** after that (D2). The data files are a starting point, not the
   source of truth.

The seed's rules, each tested in `tests/unit/lib/app/catalogue/seed.test.ts`:

- **It checks everything before it writes anything.** Every sound must pass `validatePreset` on
  the definition version it was made on, and every unusual note must name a control, jack or area
  the synth has. One problem anywhere and it throws with the whole list.
- **A re-run writes nothing.** JSON columns are compared by value, because `jsonb` does not keep
  key order.
- **A row with `editedAt` set is an admin's**, and the seed never writes it again. The admin API
  sets it (below). **An edit made by hand (Prisma Studio, SQL) must set `editedAt` too**, or the
  next seed run that finds the row different will put it back.
- **Placement is set once.** A synth's `listed` and `order`, and a sound's `order`, are written
  when the seed creates the row and never after, so an admin's order and hiding survive a re-seed
  without marking the row edited. Reordering a synths file once its synths are seeded does nothing,
  and a synth or sound added to a list that already has rows goes at its end, not at its place in
  the file (which might be one an admin's order has taken).
- **It never deletes.** Retiring a sound is an admin's act.

The seed re-runs when its hash changes, and the hash takes in the data files, the loader, the
seed logic, the definitions and the validator. **After pulling a change to any of them, run
`npm run db:seed`** on every database you develop against.

`npm run check:synths <id>` plays a ported synth's sounds from the same seed data, so the
baseline check covers exactly what the seed writes.

## How admins edit it

The admin API (`f-catalogue-admin`) is thin routes over `lib/app/catalogue/edit.ts`. All are
admin only, and every write is `writesSharedSettings` (at `multi`, install-org admins only).

| Route                                         | Does                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/admin/synths`                    | Every synth, hidden ones included: design, content columns, counts.     |
| `PUT /api/v1/admin/synths/order`              | The whole catalogue order, every synth once.                            |
| `GET /api/v1/admin/synths/:id`                | One synth with every stored sound (and what stops it being served).     |
| `PATCH /api/v1/admin/synths/:id`              | Name, maker, year, heritage, summary, `listed`.                         |
| `POST /api/v1/admin/synths/:id/sounds`        | A new sound, at the end of the library, on the current definition.      |
| `PUT /api/v1/admin/synths/:id/sounds/order`   | The library order, every sound once.                                    |
| `PATCH /api/v1/admin/synths/:id/sounds/:slug` | Any field of a sound but its id, the lesson steps included.             |
| `PUT /api/v1/admin/synths/:id/lineage`        | The whole lineage (the seed file's shape, less `synth`).                |
| `POST /api/v1/admin/synths/:id/notes`         | An "Unusual on…" note on one of the synth's controls, jacks or areas.   |
| `PATCH /api/v1/admin/synth-notes/:noteId`     | A note's text, or a limit's title. Shared limits too, so not per synth. |

The rules, each tested in `tests/unit/app/api/v1/admin/synths/catalogue-edit.test.ts`:

- **Checked as the seed checks.** A sound edit is merged into the stored sound and the whole goes
  through `validatePreset`; a refusal is a 400 whose `details.errors` names each control or jack
  at fault, in the same shape as any other invalid body. A note's target is checked with
  `noteTargets`. A sound on an older definition version cannot be edited until a mapping exists.
- **Content writes set `editedAt`; placement does not.** Reordering and `listed` leave it alone.
  An edit that changes nothing writes nothing, so the row stays the seed's.
- **Every change is audited** in the admin audit log, entity types `synth`, `synth_sound`,
  `synth_lineage` and `synth_note`, with before and after. The audit page's type filter is a
  fixed list in a platform file, so these show under "All types".
- **A sound's id never changes**, and neither does what a note is about. Removing a sound is not
  possible yet: the seed recreates a missing row, so it needs a retired flag first.

## How it is read

- `GET /api/v1/synths`: the listed synths, in order, each with its definition's version and a
  sound count.
- `GET /api/v1/synths/:id`: one synth with its sounds, lineage and notes. A 404 for an id that is
  not a listed synth the registry can play.

Both are public, inherit the section rate limit, and carry an ETag.

**One read layer, two doors.** The routes are thin wrappers over `lib/app/catalogue/read.ts`.
The app's own server pages call the same functions in-process; everything else (the browser,
a native app, any other client) uses the routes. Parity tests in the route tests pin each
response to exactly what the read function returns, so the two cannot drift. Do not add
`serverFetch` to these routes from a server page: it forwards no visitor IP, so every signed-out
visitor would share one rate-limit bucket.

The read layer, `lib/app/catalogue/read.ts`, which validates every sound again on the way out: a row an edit
broke, or one made on a definition version the registry no longer has, is logged and left out.
An unusual note on a control, jack or area the synth no longer has is left out the same way. The
list's `soundCount` counts stored rows, so it can be higher than what the detail serves while
such an error stands.

## Don't

- **Don't read the seed data from app code.** Only the seed folder and `scripts/check-synths.ts`
  may. `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts` fails on any other reader.
- **Don't fix content by editing the data files once a synth is seeded.** The seed never
  overwrites an edited row, but it will overwrite an unedited one, and the edit belongs in the
  table, where the next admin will see it.
- **Don't bump a definition's version without a mapping for its sounds.** The seed and the read
  both refuse a sound whose version the registry does not have, and no mapping exists yet; the
  first rename ships one (plan §5).
