# Know Your Synth app docs

This is the fork's own documentation tier. Sunrise never writes here, so these files merge
cleanly on every upstream sync. Platform docs live in the domain folders beside this one: start
at [`../substrate.md`](../substrate.md).

| Doc                                              | What it is                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| [`synths.md`](./synths.md)                       | Synth definitions: the `SynthDef` contract, `toEngine()`, the sound validator, and where the engine and shared library live. |
| [`frame.md`](./frame.md)                         | The app frame: the `(panel)` route group, the faces and why not `next/font`, the consumer palette, the nav seams.            |
| [`check/README.md`](./check/README.md)           | The synth check baseline: one fingerprint per sound, per synth (`check/<id>.json`), and how `npm run check:synths` compares. |
| [`divergences.md`](./divergences.md)             | The divergence ledger: every edit carried to a Sunrise-owned file, why, what to do on conflict, and what deletes it.         |
| [`planning/app-plan.md`](./planning/app-plan.md) | The plan for porting the prototype into this app: decisions D1–D13, the file-by-file porting map, phases and features.       |

Features add their own page here as they land, and a row to this table.
