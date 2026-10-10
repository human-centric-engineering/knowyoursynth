# The synth page

`/synths/[id]`: play a synth, patch it and read about it. Plan §4 "The synth page". It keeps the
prototype's layout, split from `prototype/src/App.jsx` (D3).

## Where things are

| File                                    | What it is                                                                |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `app/(panel)/synths/[id]/page.tsx`      | The route: 404s an id the registry lacks, reads the API, renders the page |
| `app/(panel)/synths/page.tsx`           | `/synths`: reopens the last synth opened, or the first listed             |
| `components/app/synth/synth-page.tsx`   | Holds the page state (`App.jsx`'s) and lays out the regions               |
| `components/app/synth/synth.css`        | The instrument's classes: `kys-label`, `kys-stage`, `kys-pulse`, …        |
| `components/app/synth/engine.ts`        | One audio engine for the visit                                            |
| `components/app/synth/storage.ts`       | What a signed-out visitor's browser keeps                                 |
| `components/app/synth/routes.ts`        | `?view=` and the prototype's hash links                                   |
| `components/app/synth/with-notes.ts`    | Puts the API's "Unusual on…" notes back on the definition                 |
| `components/app/synth/library.tsx`      | The sound library: search, categories, the loaded sound                   |
| `components/app/synth/lesson.tsx`       | The lesson: how it works, build it step by step, make it yours            |
| `components/app/synth/tour.tsx`         | The orientation tour, docked under the panel                              |
| `components/app/synth/lineage.tsx`      | The lineage dialog (History)                                              |
| `components/app/synth/limits.tsx`       | The "What is not modelled" dialog                                         |
| `components/app/synth/use-dialog.ts`    | Opens and closes a native `<dialog>` from an `open` prop                  |
| `components/app/synth/scope.tsx`        | The scope strip, the harmonics strip and the big scope view               |
| `components/app/synth/sound-map.tsx`    | The sound map's legend, its "why is it dark?" line and its card note      |
| `components/app/synth/*.tsx` (the rest) | Picker, search, inspector and info cards, keyboard, effects rack, bar     |

## Rules that are not obvious from the code

- **Content comes from the catalogue tables, the instrument from the registry.** The route calls
  `getSynthDetail()` and `listSynths()` from `lib/app/catalogue/read.ts`, the functions the
  API routes serve, so the page and every API client see the same data (a parity test pins it).
  Not `serverFetch`: a server render calling its own API forwards no visitor IP, so every
  signed-out visitor would share one rate-limit bucket. The definition holds functions, so it
  cannot cross from the server page: the page component loads it by id with `loadSynthDef()`
  (`defs/load.ts`), which fetches that one definition's chunk, and suspends until it arrives.
  The page must not import `defs/index.ts`, which carries every definition
  (`load-chunks.test.ts`).
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
- **A lesson step is a panel state.** Choosing step _k_ sets the panel to the sound's steps up to
  _k_ (`presetState(def, sound, k)`); Finish sets it back to the whole sound. Picking another
  sound leaves the walkthrough. The step is kept with the session.
- **The sound map works from the definition, not the drawn layout**, so it answers the same
  whichever view is showing. It runs in the probe workers (`/worklets/kys-probe.js`) and falls
  back to the main thread where a host blocks workers. A new map starts 300 ms after the panel
  goes still; until then the old one stays up, marked "Updating…". An analysis that throws is
  logged and the map goes off rather than staying on "Working out…"; the next change to the
  sound tries again. The panel's dim, glow and ring layers read it from `mapStore`.
- **The scope reads the synth's own output**, before the effects rack. The harmonics strip shows
  the live sound while a key is down or the riff plays, and otherwise a note rendered offline
  through the model (`predict`). The big view's "What is making this shape" is `waveStory`, run
  only while the view is open.
- **The big view's keys play.** Other dialogs leave the panel inert, so the page ignores computer
  keys inside a `<dialog>`, except one marked `data-plays`.
- **The lesson, the tour and the search only point.** They light controls through
  `highlightStore` and `findStore` and open them in the inspector through `focusStore`. Nothing
  but the page changes the panel.

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
| `kys.dim`, `kys.heat`  | The sound map's "Dim unused parts" and "Show sensitive controls"                                                                                |
| `kys.harm`             | The harmonics strip under the panel                                                                                                             |

Signed-in storage is `f-my-sounds` (`SynthPreference`, `UserPreference`).

## Not here yet

Each arrives with the surface it opens, so no button opens nothing (`B31`):

- the tutor (`f-tutor`), and with it the library's "ask the tutor" hint;
- the databank (`f-databank`): the lineage's "Heard on" records and their artist links. Until
  then that tab shows only for a lineage that names its players.
