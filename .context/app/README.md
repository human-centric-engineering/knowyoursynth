# Know Your Synth app docs

This is the fork's own documentation tier. Sunrise never writes here, so these files merge
cleanly on every upstream sync. Platform docs live in the domain folders beside this one: start
at [`../substrate.md`](../substrate.md).

| Doc                                                | What it is                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`synths.md`](./synths.md)                         | Synth definitions: the `SynthDef` contract, `toEngine()`, the sound validator, and where the engine and shared library live.                                                                                           |
| [`catalogue.md`](./catalogue.md)                   | The catalogue: its four tables, exporting a synth's content, the seed's rules, and the public API that reads it.                                                                                                       |
| [`bank.md`](./bank.md)                             | The databank: its twelve tables, how the prototype's files differ, the seed's rules, Heard on, the public API and `/bank`.                                                                                             |
| [`frame.md`](./frame.md)                           | The app frame: the `(panel)` route group, the faces and why not `next/font`, the consumer palette, the nav seams.                                                                                                      |
| [`sounds.md`](./sounds.md)                         | My sounds: the `UserSound` table, its credit, erasure and export, the owner-scoped API under `/api/v1/sounds`, settings, lesson progress and favourites.                                                               |
| [`profiles.md`](./profiles.md)                     | Profiles: the username and its rules, the four links, visibility, the held names, the synths owned and wanted, `/api/v1/me/profile` and `/instruments`, the settings sections, and the public page at `/u/[username]`. |
| [`sharing.md`](./sharing.md)                       | Sharing sounds: private, link and published, the slug, the byline, publishing and its refusals, credited copies, the public read, the sound page, Explore and the social card.                                         |
| [`synth-page.md`](./synth-page.md)                 | The synth page: where its pieces are, the URL and hash links, what a signed-out browser keeps, and what is still to come.                                                                                              |
| [`tutor.md`](./tutor.md)                           | The tutor: a platform agent, its four panel tools and what they refuse, the synth context, the lookup decision and its numbers, seeding, and the smoke run.                                                            |
| [`synth-port.md`](./synth-port.md)                 | Porting a synth: definition, brand tags, export, seed, check, page. The recipe Model D went through, for the other 24.                                                                                                 |
| [`check/README.md`](./check/README.md)             | The synth check baseline: one fingerprint per sound, per synth (`check/<id>.json`), and how `npm run check:synths` compares.                                                                                           |
| [`divergences.md`](./divergences.md)               | The divergence ledger: every edit carried to a Sunrise-owned file, why, what to do on conflict, and what deletes it.                                                                                                   |
| [`planning/app-plan.md`](./planning/app-plan.md)   | The plan for porting the prototype into this app: decisions D1–D13, the file-by-file porting map, phases and features.                                                                                                 |
| [`planning/site-copy.md`](./planning/site-copy.md) | The site copy: house style, home, about with the not-affiliated notice, contact, the footer line and every empty state, with where each number comes from.                                                             |

Features add their own page here as they land, and a row to this table.
