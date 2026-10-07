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
- **A row with `editedAt` set is an admin's**, and the seed never writes it again.
- **It never deletes.** Retiring a sound is an admin's act.

The seed re-runs when its hash changes, and the hash takes in the data files, the loader, the
seed logic, the definitions and the validator. **After pulling a change to any of them, run
`npm run db:seed`** on every database you develop against.

`npm run check:synths <id>` plays a ported synth's sounds from the same seed data, so the
baseline check covers exactly what the seed writes.

## How it is read

- `GET /api/v1/synths`: the listed synths, in order, each with its definition's version and a
  sound count.
- `GET /api/v1/synths/:id`: one synth with its sounds, lineage and notes. A 404 for an id that is
  not a listed synth the registry can play.

Both are public, inherit the section rate limit, and carry an ETag. They read through
`lib/app/catalogue/read.ts`, which validates every sound again on the way out: a row an edit
broke, or one made on a definition version the registry no longer has, is logged and left out.

## Don't

- **Don't read the seed data from app code.** Only the seed folder and `scripts/check-synths.ts`
  may. `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts` fails on any other reader.
- **Don't fix content by editing the data files once a synth is seeded.** The seed never
  overwrites an edited row, but it will overwrite an unedited one, and the edit belongs in the
  table, where the next admin will see it.
- **Don't bump a definition's version without a mapping for its sounds.** The seed and the read
  both refuse a sound whose version the registry does not have, and no mapping exists yet; the
  first rename ships one (plan §5).
