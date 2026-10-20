# The synth page

`/synths/[id]`: play a synth, patch it and read about it. Plan §4 "The synth page". It keeps the
prototype's layout, split from `prototype/src/App.jsx` (D3).

## Where things are

| File                                     | What it is                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `app/(panel)/synths/[id]/page.tsx`       | The route: 404s an id the registry lacks, reads the API, renders the page |
| `app/(panel)/synths/page.tsx`            | `/synths`: reopens the last synth opened, or the first listed             |
| `components/app/synth/synth-page.tsx`    | Holds the page state (`App.jsx`'s) and lays out the regions               |
| `components/app/synth/synth.css`         | The instrument's classes: `kys-label`, `kys-stage`, `kys-pulse`, …        |
| `components/app/synth/engine.ts`         | One audio engine for the visit                                            |
| `components/app/synth/storage.ts`        | What a signed-out visitor's browser keeps                                 |
| `components/app/synth/routes.ts`         | `?view=`, `?sound=` and the prototype's hash links                        |
| `components/app/synth/my-sounds.tsx`     | My sounds, and Save / Save as / Rename / Delete / Save a copy             |
| `components/app/synth/with-notes.ts`     | Puts the API's "Unusual on…" notes back on the definition                 |
| `components/app/synth/library.tsx`       | The sound library: search, categories, the loaded sound                   |
| `components/app/tutor/tutor-panel.tsx`   | The tutor, under the Inspector ([`tutor.md`](./tutor.md#the-panel))       |
| `components/app/synth/lesson.tsx`        | The lesson: how it works, build it step by step, make it yours            |
| `components/app/synth/tour.tsx`          | The orientation tour, docked under the panel                              |
| `components/app/synth/lineage.tsx`       | The lineage dialog (History)                                              |
| `components/app/synth/limits.tsx`        | The "What is not modelled" dialog                                         |
| `components/app/synth/use-dialog.ts`     | Opens and closes a native `<dialog>` from an `open` prop                  |
| `components/app/synth/scope.tsx`         | The scope strip, the harmonics strip and the big scope view               |
| `components/app/synth/sound-map.tsx`     | The sound map's legend, its "why is it dark?" line and its card note      |
| `components/app/synth/panel-zoom.tsx`    | The panel's size: Fit, and zoom in its scroller                           |
| `components/app/synth/rotate-prompt.tsx` | The note on a small screen that the panel wants a bigger one              |
| `components/app/synth/*.tsx` (the rest)  | Picker, search, inspector and info cards, keyboard, effects rack, bar     |

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
- **The panel draws the synth's design** (D11), `Synth.design`, which an admin sets
  (`PATCH /api/v1/admin/synths/[id]/design`). Neutral, the default, is the panel in its own
  colours and lettering without the maker's marks; faithful adds them and needs a recorded
  approval. See `lib/app/catalogue/designs.ts`.
- **A lesson step is a panel state.** Choosing step _k_ sets the panel to the sound's steps up to
  _k_ (`presetState(def, sound, k)`); Finish sets it back to the whole sound. Picking another
  sound leaves the walkthrough. The step is kept with the session. The lesson is the library
  sound's, or the open sound's own when it was saved with one
  ([`sounds.md`](./sounds.md#a-sounds-lesson-t-55)), which keeps that sound open while it steps.
- **The sound map works from the definition, not the drawn layout**, so it answers the same
  whichever view is showing. It runs in the probe workers (`/worklets/kys-probe.js`) and falls
  back to the main thread where a host blocks workers. A new map starts 300 ms after the panel
  goes still; until then the old one stays up, marked "Updating…". An analysis that throws is
  logged and the map goes to `failed`: the legend says it could not be worked out, the layers
  draw nothing (as for off), and the next change to the sound tries again. A "why is it dark?"
  search that throws is filed as `'failed'`, not `[]` (which means no one or two controls bring
  it in), and is asked again once the control is pointed at after something else. The panel's dim,
  glow and ring layers read it from `mapStore`.
- **The scope reads the synth's own output**, before the effects rack. The harmonics strip shows
  the live sound while a key is down or the riff plays, and otherwise a note rendered offline
  through the model (`predict`). The big view's "What is making this shape" is `waveStory`, run
  only while the view is open.
- **The big view's keys play.** Other dialogs leave the panel inert, so the page ignores computer
  keys inside a `<dialog>`, except one marked `data-plays`.
- **The lesson, the tour and the search only point.** They light controls through
  `highlightStore` and `findStore` and open them in the inspector through `focusStore`. Nothing
  but the page changes the panel.
- **The tutor changes it through the page too.** It hands the page a change the learner applies,
  or a sound it designed, and the page puts it on the panel and hands back what undoes it. A
  designed sound is `designed` in the page: its lesson shows as an open sound's does, until
  something else opens or it is saved as one of the user's. It is not kept in browser storage
  ([`tutor.md`](./tutor.md#the-panel)).
- **A search the library has nothing for** offers the tutor, which puts the request in its
  composer.

## On phones and tablets

D10: playing the full panel needs a landscape tablet or a computer. Everything else works on a
phone. `f-phone-and-tablet` t-65 made the panel and keyboard work on touch:

- **The panel fits the page by default, at every width.** There is no minimum width any more. The
  zoom group (−, Fit, +) lays the panel out at 1.5×, 2× or 3× the fitted width inside its
  horizontal scroller, and keeps the middle of the view in the middle. The panel is drawn bigger,
  not magnified, so every control still works, and a drag on bare panel scrolls the page. Only the
  controls themselves are `touch-action: none`. The magnifier lens is a separate control and is
  kept. A synth with its own layout is still capped at a width that fits 82% of the screen's
  height.
- **Under 1024 px a note sits above the panel.** It tells a tablet held upright (portrait, at
  least 600 px wide) to turn sideways. Anything else under 1024 px is told the panel is made for a
  landscape tablet or a bigger screen. It is a notice, not a block. OK hides it for good in that
  browser (`kys.rotateSeen`).
- **Each finger on the keyboard holds its own note**, so chords play on the polys. A mono synth
  gets last-note priority from the engine. Under `lg`, the keys are 44 px wide, and the octave
  buttons, Hold and the wheel are 44 px. The keys scroll sideways, and a sideways swipe on them
  scrolls rather than sliding from key to key. A tap still plays.
- **The two rows of buttons over the panel scroll sideways on one line** under `sm`, with the
  zoom group first, instead of wrapping into a wall.
- The knobs, sliders, switches, jacks and cables needed no change for touch. They were already
  pointer events, and patching by tapping one jack and then another already worked.

## The URL

- `?view=outline`, `?view=long` or `?view=long,outline`. The last choice is kept in browser
  storage and applied when the URL has no `view`. Changing it rewrites the URL in place.
- `/synths` reopens the synth in `kys.synth`, or the first listed one. This stands in until a
  catalogue is planned (journal, `f-model-d`).
- `?sound=<id>` opens the synth with that library sound loaded, over whatever the browser had
  stored, then drops out of the URL so a reload keeps what was done since. A sound the library
  does not have is ignored. A databank record's "Load a sound in this style" links here.
- `?mine=<id>` opens one of the signed-in user's own sounds the same way, once the session is
  known; the dashboard links here. Signed out, or when a hash link is sending the visitor
  elsewhere, it opens nothing. See [`sounds.md`](./sounds.md).
- Signed in, the library and the lesson show how far the user got through each lesson, and stars
  beside the chooser, the library and My sounds add favourites (`f-my-sounds` s4, in
  [`sounds.md`](./sounds.md)).
- The prototype's hash links (`#model-d`, `#model-d/outline`, `#model-d/long`) redirect from
  `/synths` and from any synth page. `#bank/<tab>/<id>` links redirect from the same places, and
  from `/bank`, to the databank's page (`components/app/bank/routes.ts`).

## Browser storage

Keys are the prototype's. Every value is checked when read; a bad one falls back to its default.
Signed in, `kys.session.<id>`, `kys.tips`, `kys.fx`, `kys.dim`, `kys.heat` and `kys.harm` are kept
in the account as well. The newer copy wins ([`sounds.md`](./sounds.md)).

| Key                    | Holds                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kys.synth`            | The last synth opened                                                                                                                                                                                                                                              |
| `kys.view`             | The last panel view                                                                                                                                                                                                                                                |
| `kys.session.<id>`     | That synth's panel: sound, lesson step, values, cables, the user's own sound open on it (`soundId`), when it was changed (`savedAt`) and who was signed in then (`owner`). Written 400 ms after the panel goes still, and checked against the definition when read |
| `kys.tips`             | Info cards on                                                                                                                                                                                                                                                      |
| `kys.fx`, `kys.fxOpen` | The effects rack and whether it is unfolded                                                                                                                                                                                                                        |
| `kys.midi`             | Reconnect MIDI on the next visit                                                                                                                                                                                                                                   |
| `kys.dim`, `kys.heat`  | The sound map's "Dim unused parts" and "Show sensitive controls"                                                                                                                                                                                                   |
| `kys.harm`             | The harmonics strip under the panel                                                                                                                                                                                                                                |
| `kys.rotateSeen`       | The small-screen note above the panel has been put away                                                                                                                                                                                                            |
| `kys.settingsBy`       | Who was signed in when the settings were last changed (`null` for no one), so another user's are not filled into an account                                                                                                                                        |
| `kys.settingsAt`       | When the settings were last changed (ms), weighed against the account's copy                                                                                                                                                                                       |
