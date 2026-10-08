# The synth page

`/synths/[id]`: play a synth, patch it and read about it. Plan §4 "The synth page". It keeps the
prototype's layout, split from `prototype/src/App.jsx` (D3).

## Where things are

| File                                    | What it is                                                                |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `app/(panel)/synths/[id]/page.tsx`      | The route: 404s an id the registry lacks, reads the API, renders the page |
| `app/(panel)/synths/page.tsx`           | `/synths`: reopens the last synth opened, or the first listed             |
| `app/(panel)/synths/loading.tsx`        | A skeleton while a synth is read, including when the picker moves         |
| `components/app/synth/synth-page.tsx`   | Holds the page state (`App.jsx`'s) and lays out the regions               |
| `components/app/synth/synth.css`        | The instrument's classes: `kys-label`, `kys-stage`, `kys-pulse`, …        |
| `components/app/synth/engine.ts`        | One audio engine for the visit                                            |
| `components/app/synth/storage.ts`       | What a signed-out visitor's browser keeps                                 |
| `components/app/synth/routes.ts`        | `?view=` and the prototype's hash links                                   |
| `components/app/synth/with-notes.ts`    | Puts the API's "Unusual on…" notes back on the definition                 |
| `components/app/synth/*.tsx` (the rest) | Picker, search, inspector and info cards, keyboard, effects rack, bar     |

## Rules that are not obvious from the code

- **Content comes from the catalogue tables, the instrument from the registry.** The route calls
  `getSynthDetail()` and `listSynths()` from `lib/app/catalogue/read.ts`, the functions the
  API routes serve, so the page and every API client see the same data (a parity test pins it).
  Not `serverFetch`: a server render calling its own API forwards no visitor IP, so every
  signed-out visitor would share one rate-limit bucket. The definition holds functions, so it
  cannot cross from the server page: the page component looks it up by id.
- **The page component is keyed by synth.** Another synth starts afresh rather than inheriting
  the last one's panel. The engine is the exception: it lives in `engine.ts`, outside React,
  so the sound stays on across synths. Leaving a page sends `panic`.
- **Colours are the `--kys-*` roles**, written `bg-(--kys-surface)`, `text-(--kys-muted)`.
  Sunrise's `muted` and `accent` utilities are different colours. Do not add the prototype's
  `bg-surface`-style names to a Tailwind theme: that means editing `globals.css`, which Sunrise
  owns.
- **Unusual notes are rows** (D13). `withNotes` attaches them to the definition, because the
  inspector, the search index and the tour read `unusual` from controls, jacks and areas.
- **The panel draws the neutral design** (D11). A per-synth choice is `f-panel-designs`.

## The URL

- `?view=outline`, `?view=long` or `?view=long,outline`. The last choice is kept in browser
  storage and applied when the URL has no `view`. Changing it rewrites the URL in place.
- `/synths` reopens the synth in `kys.synth`, or the first listed one. This stands in until a
  catalogue is planned (journal, `f-model-d`).
- The prototype's hash links (`#model-d`, `#model-d/outline`, `#model-d/long`) redirect from
  `/synths` and from any synth page. `#bank/…` links are the bank pages' to redirect.

## Browser storage (signed out)

Keys are the prototype's. Every value is checked when read; a bad one falls back to its default.

| Key                    | Holds                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `kys.synth`            | The last synth opened                                                                                                                           |
| `kys.view`             | The last panel view                                                                                                                             |
| `kys.session.<id>`     | That synth's panel: sound, lesson step, values, cables. Written 400 ms after the panel goes still, and checked against the definition when read |
| `kys.tips`             | Info cards on                                                                                                                                   |
| `kys.fx`, `kys.fxOpen` | The effects rack and whether it is unfolded                                                                                                     |
| `kys.midi`             | Reconnect MIDI on the next visit                                                                                                                |

Signed-in storage is `f-my-sounds` (`SynthPreference`, `UserPreference`).

## Not here yet

Each arrives with the surface it opens, so no button opens nothing (`B31`): the library, the
lesson, the tour, lineage and "What is not modelled" (t-14); the sound map, harmonics and scope
(t-15); the tutor (`f-tutor`); the databank (`f-databank`).
