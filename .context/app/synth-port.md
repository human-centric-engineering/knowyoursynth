# Porting a synth

The recipe Model D went through (`f-model-d`), for the other 24 (`f-synth-port`). A synth is
ported when its definition is code, its content is in the catalogue tables, the check matches
its baseline, and `/synths/<id>` plays it. Six steps, in order. Each names the file that changes
and the test that holds it.

Batch synths that share an engine into one PR (plan §3 "The 25 synths"): the steps repeat, and
reviewing them once per engine is the point.

## 1. Definition

Transliterate `prototype/src/synths/<id>.js` to `lib/app/synths/defs/<id>.ts`, typed `SynthDef`,
following `defs/model-d.ts` (D3: transliterate, don't rewrite). Add it to `SYNTH_DEFS` in
`defs/index.ts`.

- Give it `version: 1`. Its sounds will record that version.
- **The instrument only.** Leave out the inline presets, the lineage, the unusual notes and the
  limits: they are content, and step 3 exports them. `registry.test.ts` refuses a definition or
  any module under `defs/` that carries them.
- Read panel values through a local `num(v, id)` and narrow enums explicitly. For every value a
  valid sound holds, the engine params must be the prototype's.

Rules for the fields: [`synths.md`](./synths.md). Model D's own checks, which a port can mirror:
`tests/unit/lib/app/synths/defs/model-d.test.ts`.

## 2. Brand tags

Tag every maker's mark in `decor` with `brand: true`: logos, wordmarks, model badges. The neutral
design (D11), which is the only one the page draws today, leaves `brand` items out, so an
untagged logo shows on a panel that must not carry it.

Look at the neutral panel once the page opens (step 6). Decor that sets its own colours (a text
`fill`, a print pattern) keeps them on the neutral faceplate. That is fine on Model D and wrong on
a light faceplate with dark print; choosing colours per synth is `f-panel-designs` (journal,
`f-model-d`).

## 3. Export

```bash
node prototype/tools/export-content.mjs <id> --def-version=1
```

It writes the synth's sounds, lineage, unusual notes and "What is not modelled" entry under
`prisma/seeds/app-knowyoursynth/data/`, and adds it to `synths.json` in the prototype's picker
order. Commit the output. Run it once, in the port task. After the first seed the tables are the
source of truth (D2), so a content fix is an edit to the table, not a re-export.

The Moog 900 systems build their notes, lineage and cables from shared files, which the script
does not expand yet: that expansion is part of p4.

`tests/unit/lib/app/catalogue/seed-data.test.ts` pins what is in the data folder; extend it to
the new synth's counts.

## 4. Seed

```bash
npm run db:seed
```

The seed (`lib/app/catalogue/seed.ts`) checks every sound against the definition and every note
against the controls, jacks and areas before it writes anything, and throws with the whole list
of problems. A refusal here is a mismatch between steps 1 and 3: fix the definition, or the
export if the prototype's content was wrong. Never loosen the validator.

Its rules (re-runs write nothing, an admin's edit is never overwritten, nothing is deleted):
[`catalogue.md`](./catalogue.md).

## 5. Check

```bash
npm run check:synths -- <id> --compare
```

It plays every sound from the seed data through the ported engine and the ported definition, and
must match `.context/app/check/<id>.json` exactly, sample hash included. It also checks the
ported definition equals the prototype's as data. Where a synth needs engine work, run the whole
catalogue (`npm run check:synths -- --compare`): every earlier synth must still match.

**Never re-record a baseline to make a port pass** ([`check/README.md`](./check/README.md)).

## 6. Page

Nothing on the page is per synth. Once the definition is registered and its `Synth` row is
listed, `/synths/<id>` plays it, and the picker, library, lesson, tour, lineage and "What is not
modelled" read it from the catalogue ([`synth-page.md`](./synth-page.md)).

Open it and look:

- the panel draws in the neutral design with no maker's mark;
- every library sound loads, and a lesson steps through;
- the tour's naming stop shows the synth's unusual notes;
- History and "What is not modelled" open with the synth's own text;
- with "Dim unused parts" on, the map arrives and the dark controls are ones the sound really
  does not use; the big scope view's "What is making this shape" reads sensibly for the synth;
- a synth with a `modular` layout switches between Modular and Long. No ported synth had one
  before the Jupiters, so that switch has never been seen working (journal, `f-model-d`).

Add a render test that the synth opens on its page. The pattern for a test over the full
catalogue content is `tests/unit/components/app/synth/synth-page-content.test.tsx`, with
`tests/helpers/model-d-detail.ts` building the detail through the real read layer.
