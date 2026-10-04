# Know Your Synth — planning brief

The starting point for planning the app. It records what we are building, what the
prototype in this folder already does, and the questions the plan has to answer.
It does not answer them; the plan goes in `.context/app/planning/app-plan.md`
once it is written, the way BeatBreaker's did.

Written 2026-10-04, when this repo was created.

## 1. Where this came from

- **The repo** is a leaf fork of [Sunrise](https://github.com/human-centric-engineering/sunrise),
  cloned from Sunrise `main` at `0e685744` (just after v0.13.0). Sunrise is the
  `upstream` remote.
- **The prototype** is the single-page Claude artefact published at
  <https://claude.ai/artifact/1WDm81uf8vcBwM9YuNAXsT>. Its source is copied here
  unchanged, apart from `build.mjs` and `check.mjs` now finding esbuild, React and
  Tailwind in this repo's `node_modules` rather than a separate Sunrise checkout.
  The working copy it came from is `~/code/knowyoursynth-prototype` (not a git repo).
- **The companion app** is BeatBreaker
  ([repo](https://github.com/human-centric-engineering/beatbreaker)), the same kind
  of fork: a single-file artefact turned into a Sunrise app. Its plan,
  `.context/app/planning/app-plan.md` in that repo, is the model for this one:
  phases with done-when tests, data model changes in one place, decisions
  numbered and dated.

## 2. The brief

In the owner's words, turn the artefact into "a working app with all the models
saved into a proper database with full user interactivity", built on Sunrise, as
a companion to BeatBreaker.

Broken down:

1. **A working web app**: the prototype's panels, sound engine, patching, lessons,
   tour, scope and databank, running inside Sunrise's frame.
2. **Every synth model in the database**: synths, their panels, controls, jacks,
   areas, sound libraries, and the databank of artists, songs and instruments are
   rows, not JavaScript constants.
3. **Full user interactivity**: accounts, saving your own patches and sounds,
   progress through lessons, and (to be decided) sharing.
4. **A companion to BeatBreaker**: how the two apps relate is an open question (§8).

## 3. What the prototype does

From [`README.md`](./README.md), which describes each module:

- **Panels**: an SVG faceplate for each synth, drawn from data. There is a hardware
  view and an outline view, and the long keyboards (the Jupiters) can be cut into
  modular rows.
- **Sound**: a custom DSP voice in an AudioWorklet (`src/audio/dsp-core.js`) with
  polyphonic and two-voice wrappers. There is a separate Moog 900-series modular
  core, the DeepMind's own effects engine, and an outboard effects rack.
- **Patching**: cables between jacks, each explained in plain English from the jack
  data and the live engine state (`src/lib/explain.js`, `explain-moog.js`).
- **Learning**: sound libraries with step-by-step lessons (`Lesson.jsx`). There is
  an Orientation tour built from each synth's areas, hover help, "Unusual on the
  <synth>" notes, and a lineage view.
- **Analysis**: an oscilloscope and spectrum, and the sound map, which renders the
  sound offline with each control moved to find which controls matter right now.
- **Search** across controls, jacks and areas.
- **Databank**: artists, songs, instruments and makers, joined by id. Each synth's
  "Heard on" list is read from it (`src/bank/`, `Bank.jsx`).
- **MIDI in**: notes, velocity and mod wheel (`src/lib/midi.js`).
- **AI tutor**: questions answered, and sounds designed from a description. It only
  works inside Claude (§6).

## 4. The numbers

Measured from `src/synths/index.js` on 2026-10-04:

| Synth                    | Year | Controls | Jacks | Areas | Sounds |
| ------------------------ | ---: | -------: | ----: | ----: | -----: |
| Behringer Model D        | 2018 |       48 |    15 |     9 |     99 |
| Behringer Neutron        | 2018 |       43 |    56 |    18 |    103 |
| Behringer Pro-1          | 2019 |       55 |    15 |    14 |     98 |
| Behringer K-2            | 2019 |       38 |    34 |    20 |     93 |
| Behringer 2600           | 2020 |       81 |    92 |    22 |     93 |
| Behringer DeepMind 12D   | 2017 |    1,568 |     0 |    11 |    122 |
| Behringer UB-Xa D        | 2024 |       51 |     0 |    14 |     56 |
| Behringer 2-XM           | 2025 |       67 |    32 |    23 |     38 |
| Behringer Kobol Expander | 2023 |       29 |    33 |    12 |     40 |
| Behringer CAT            | 2021 |       46 |    13 |    13 |     25 |
| Behringer WASP Deluxe    | 2020 |       30 |     5 |    11 |     30 |
| Behringer Poly D         | 2019 |       64 |     1 |    12 |     37 |
| Behringer PRO-800        | 2023 |       43 |     4 |    14 |     27 |
| EMS VCS3 Mk 1            | 1969 |       43 |    32 |    17 |     29 |
| Buchla Music Easel       | 1973 |       65 |    58 |    22 |     21 |
| Roland TB-303            | 1981 |       35 |     6 |    14 |     20 |
| Behringer TD-3           | 2019 |       39 |     5 |    15 |     20 |
| Roland Jupiter-4         | 1978 |       46 |     0 |    15 |     19 |
| Roland Jupiter-6         | 1983 |       70 |     0 |    19 |     18 |
| Roland Jupiter-8         | 1981 |       61 |     0 |    18 |     20 |
| Behringer System 15      | 2022 |       63 |   158 |    17 |     13 |
| Behringer System 35      | 2022 |       98 |   232 |    26 |      9 |
| Behringer System 55      | 2022 |      183 |   352 |    39 |     11 |
| Behringer Model 15       | 2022 |       37 |    48 |    19 |     12 |
| Moog Grandmother         | 2018 |       35 |    35 |    14 |      8 |
| **25 synths**            |      | **2,938** | **1,226** |  | **1,061** |

The DeepMind's 1,568 controls include its menu parameters, not just the knobs on
its panel.

- **Panel artwork**: 8,931 decor items (silkscreen, frames, screws, LEDs) across
  the 25 synths.
- **Databank**: 184 artists, 248 songs, 86 instruments, 50 makers.
- **Code**: about 15,400 lines of app, engine and library code, and about 46,800
  lines of synth data (`src/synths/**`). The built page is 6.6 MB.
- **A sound** (`presets[]`) has `id, name, ref, artist, tags, level, blurb, how,
  phrase, steps, context, tweaks`: a panel state plus the lesson that teaches it.

## 5. What makes "a synth in the database" hard

A SynthDef ([`CONTRACT.md`](./CONTRACT.md)) is mostly plain data, but not all of it.

- **Every synth has code in it.** `toEngine(v, ctx)` maps panel values to engine
  parameters, and it is different for each synth. Jacks carry `check`, `hear` and
  `amt` functions, and controls carry `fmt`. Counted as function-valued fields:
  from 5 (TB-303) to 134 (2600) per synth, and 1,362 on the DeepMind (one `fmt`
  per menu parameter).
- **It is big.** Serialised without functions, one synth is 80 KB (Grandmother) to
  1.3 MB (DeepMind). Most of it is panel geometry.
- **The engine is code, not data.** `dsp-core.js`, `moog-core.js` and `dm-fx.js`
  define what a synth can do. A new synth sometimes needed engine work as well
  (the 2600 added `oscOuts`, `pwSplit`, `duo` and more; see the CONTRACT addenda).
- **`check.mjs` is the test suite today.** It renders every sound through the DSP
  and fails on silence, NaN, unknown controls or bad cables. It takes several
  minutes for all 25 synths. Its output varies a little between runs (random
  oscillator phase and noise), so it cannot be compared byte for byte against a
  baseline.

BeatBreaker faced a smaller version of this. Its styles, libraries and kits moved
from TypeScript constants into tables in its Phase 2, "The catalogue" (decisions
D13, D14). Its `catalogue.md` records how that was done.

## 6. State and services the prototype depends on

**Browser storage.** Everything is in `localStorage`, per browser:

| Key                                                                    | What                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `kys.synth`                                                            | Last synth opened                                      |
| `kys.ai`                                                               | Sounds the AI tutor designed, the last 12 per synth    |
| `kys.outline`, `kys.long`, `kys.theme`                                 | View choices                                           |
| `kys.dim`, `kys.heat`, `kys.harm`, `kys.tips`, `kys.fx`, `kys.fxOpen` | Sound map, scope, hover help and effects rack settings |
| `kys.midi`                                                             | MIDI input choice                                      |

There are no accounts. A user cannot save a sound of their own; only the tutor's
sounds are kept. Panel state is lost on reload. Deep links are hash routes:
`#<synth-id>`, `#<synth-id>/outline`, `#<synth-id>/long`, `#bank/<tab>/<id>`.

**Claude.** The tutor (`src/ui/Tutor.jsx`) calls `window.claude.use('sample')`, the
artefact host's model capability. Outside Claude it reports itself unavailable.
In the app it would go through Sunrise's orchestration layer (agents, providers,
cost tracking), as BeatBreaker's BeatBuddy does.

**Fonts** are loaded from Google Fonts (`src/head.html`).

## 7. Reference material

- `ref/*.synth.json`: structured extracts from the manufacturer manuals (schema
  `0.10.0`: device, sources with page references, controls, jacks), for the nine
  synths added most recently: 2-XM, CAT, Kobol Expander, Model 15, Poly D,
  PRO-800, WASP Deluxe, Music Easel and Grandmother. The other sixteen were built
  without one.
- **Panel photos are not committed.** They are mostly manufacturer product shots,
  and this repo is public. `.gitignore` here keeps `ref/*.jpg|png|webp` local; the
  originals are in `~/code/knowyoursynth-prototype/ref/`.
- `tools/rectify.mjs` straightens an angled photo with a homography. It was used
  once, for the Grandmother owner photo, and its corner points are that photo's.

## 8. Questions the plan has to answer

These were not settled when the repo was created.

1. **Data or code?** Which parts of a SynthDef become rows, and which stay as code?
   For example: panel geometry, controls and jacks as data, with `toEngine` and the
   jack functions kept as per-synth TypeScript modules. Or all of it as data, with
   `toEngine` expressed declaratively.
2. **Who adds synths?** Is adding a synth always a developer task (data plus engine
   work, checked by `check.mjs`), or do admins or users edit synths in the app?
3. **What does a user own?** Saved patches, their own sounds, lesson progress,
   favourites, their tutor history?
4. **Sharing.** Public patches, a community sound library, credit and copies?
   BeatBreaker's Phase 6 and 7A cover the same ground.
5. **The companion link to BeatBreaker.** One account across both apps, or separate
   accounts? Links between them: the TB-303 and TD-3 sequencers alongside a break,
   shared tempo and MIDI clock, a sound from here as a BeatBreaker kit voice?
   One domain or two?
6. **The tutor.** Which provider and model, what it may change on the panel, and
   what it costs per user. BeatBreaker §6 (BeatBuddy) is the model.
7. **The databank.** Does it stay part of this app, or is it shared with
   BeatBreaker (both are about music history and the people in it)?
8. **Porting order.** BeatBreaker transliterated its prototype into typed modules
   rather than rewriting it, because the code was proven. The same probably holds
   for the DSP. Does it hold for the 46,800 lines of synth data?
9. **Mobile.** The panels are wide; the prototype assumes a desktop screen.
10. **Rights.** Synth and maker names, panel likenesses, and text drawn from
    manuals, in a public app.

## 9. Working with the prototype here

From this repo's root, after `npm install`:

```bash
node prototype/build.mjs prototype/dist   # one self-contained index.html
node prototype/check.mjs model-d          # validate and render one synth's sounds
node prototype/check.mjs                  # all 25 (several minutes)
python3 -m http.server 8790 --directory prototype/dist   # then open /index.html#neutron
```

`prototype/` is outside Sunrise's lint, format and type-check (`eslint.config.mjs`,
`.prettierignore`, `tsconfig.json`), so `npm run validate` does not judge it. It is
the reference to port from, not app code.
