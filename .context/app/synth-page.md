# The synth page

`/synths/[id]`: play a synth, patch it and read about it. Plan §4 "The synth page". It keeps the
prototype's layout, split from `prototype/src/App.jsx` (D3).

**Patch, not sound, on screen.** A saved or library panel setting is a **patch** everywhere a user reads it: My
patches, the Patch library, Save this patch, Explore's patches (owner ruling, 2026-10-23, t-93). The code, the URLs
(`?sound=`, `/s/<slug>`), the API (`/api/v1/sounds`) and the database still say `sound`, and stay so: renaming them would
break shared links for no visible gain. "Sound" on screen means what you hear ("Turn the sound on", the sound map), and
**Sound design** keeps its name.

## Where things are

| File                                     | What it is                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `app/(panel)/synths/[id]/page.tsx`       | The route: 404s an id the registry lacks, reads the API, renders the page |
| `app/(panel)/synths/page.tsx`            | `/synths`: reopens the last synth opened, or the first listed             |
| `components/app/synth/synth-page.tsx`    | Holds the page state (`App.jsx`'s) and lays out the regions               |
| `components/app/synth/synth.css`         | The instrument's classes: `kys-label`, `kys-player`, `kys-pulse`, …       |
| `components/app/synth/player.tsx`        | The player's pieces: wordmark, the Sound Design strip, play, full screen  |
| `components/app/synth/player-tools.tsx`  | The bar's layer toggles and the panel settings on the panel's rail        |
| `components/app/synth/drawers.tsx`       | The tutor's drawer, sliding over the panel from `lg` up                   |
| `components/app/synth/lesson-card.tsx`   | The card over the panel from `lg` up: lesson, inspector or effects        |
| `components/app/synth/routing-view.tsx`  | The back of the panel: how the synth's parts are wired, the live path lit |
| `components/app/synth/engine.ts`         | One audio engine for the visit                                            |
| `components/app/synth/storage.ts`        | What a signed-out visitor's browser keeps                                 |
| `components/app/synth/routes.ts`         | `?view=`, `?sound=` and the prototype's hash links                        |
| `components/app/synth/my-sounds.tsx`     | My patches, and Save / Save as / Rename / Delete / Save a copy            |
| `components/app/synth/with-notes.ts`     | Puts the API's "Unusual on…" notes back on the definition                 |
| `components/app/synth/library.tsx`       | The sound library: search, categories, the loaded sound                   |
| `components/app/tutor/tutor-panel.tsx`   | The tutor, in its drawer ([`tutor.md`](./tutor.md#the-panel))             |
| `components/app/synth/lesson.tsx`        | The lesson: how it works, build it step by step, make it yours            |
| `components/app/synth/tour.tsx`          | The orientation tour, docked under the panel                              |
| `components/app/synth/lineage.tsx`       | The lineage dialog (History)                                              |
| `components/app/synth/limits.tsx`        | The "What is not modelled" dialog                                         |
| `components/app/synth/about.tsx`         | The About dialog: the synth's summary                                     |
| `components/app/synth/use-dialog.ts`     | Opens and closes a native `<dialog>` from an `open` prop                  |
| `components/app/synth/scope.tsx`         | The scope strip, the harmonics strip and the big scope view               |
| `components/app/synth/sound-map.tsx`     | The sound map's legend, its "why is it dark?" line and its card note      |
| `components/app/synth/panel-zoom.tsx`    | The panel's size: 90% to 200%, zoomed in its scroller                     |
| `components/app/synth/rotate-prompt.tsx` | The note on a small screen that the panel wants a bigger one              |
| `components/app/synth/reveal.ts`         | Scrolls a lesson step's controls into view above the Lesson sheet         |
| `components/app/ui/bottom-sheet.tsx`     | The bottom sheet the regions beside the panel open in under `lg`          |
| `components/app/ui/kept.tsx`             | Keeps a region mounted while its sheet is closed                          |
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

## The player

`f-player` (owner's ask, 2026-10-20): the panel is the thing you came to watch and play, so
playing, choosing and learning are gathered round it as a video player gathers its controls.
BeatBreaker's drummer player is the precedent (`components/app/studio/player/` there).

```
┌ the page from `lg` up ─────────────────────────────────────────────────────────────────────┐
│ ┌ the player (`section`, "<synth> panel") ─────────────────────┐ ┌ drawer ───────┐ ┌rail┐ │
│ │ ● KNOW YOUR SYNTH                 [Find a control…][Tour][?]  │ │ SOUNDS      ✕ │ │Snds│ │
│ │ BEHRINGER · Model D ▾ ☆ · heritage · ABOUT › · HISTORY › · …  │ │ My patches    │ │Lssn│ │
│ │               ┌──────────── the panel ────────────┐           │ │ Patch library │ │Insp│ │
│ │               └───────────────────────────────────┘           │ │  …            │ │Tutr│ │
│ │ ● KNOW YOUR SYNTH  DRAWN AS·MAGNIFIER·HOVER HELP [🔍 Find…]    │ │               │ └────┘ │
│ │ map legend · why is it dark? · engine error                   │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ LEARN SOUND DESIGN              (chapters, shown on approach)  │
│ │ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬                                │ │               │        │
│ │ ①OSCILLATORS ②FILTER ③ENVELOPES ④AMPLIFIER ✓FINISHED          │ │               │        │
│ │ step title    step title  …                 The whole sound   │ │               │        │
│ │   (‹ Previous)  ┌ Step 2 of 4 · FILTER ──────┐  (Next step ›)  │ │               │        │
│ │                 │ title · why, ≤68ch          │                 │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ [SOUND <name> ▾] (▶ Play)      [🔊 Mute] [Restore] [Blank]     │ │               │        │
│ │         [Piano] [Harmonics] [Effects] MIDI [?] [−Zoom+] [⛶]   │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ harmonics strip · keyboard │ scope · [Harmonics] MIDI · rack  │ │               │        │
│ └───────────────────────────────────────────────────────────────┘ │               │        │
│ <name> [mine] 3 controls moved                                    │
│ IN THE STYLE OF… · blurb                                          │               │        │
│ Save / Save as / Rename / Share …                                 └───────────────┘        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **The stage is dark in both themes.** `.kys-player` redeclares the `--kys-*` roles to the dark
  palette's values for its subtree, so everything inside (switches, keyboard, scope, the picker's
  list) reads them as anywhere else. Change a value in `app/brand-theme.css`'s dark block and the
  same value here. Nothing that holds the panel may carry `transform`, `filter` (other than the
  faceplate's own shadow) or `backdrop-filter`: the info cards, the magnifier and the
  tooltips are `fixed`.
- **The caption is the synth.** The wordmark's LED is lit while the sound is on. The synth's name
  is the picker (`SynthPicker variant="caption"`). The page's `h1` is visually hidden, since the
  picker shows the name, on one line. Beside it the description (up to two lines from `lg`), with
  About (the synth's summary, in a dialog), History and What is not modelled under it. On the right of the header are the layers (Sections,
  Signal, Sensitive) and Inspect, icons with their words from `xl`, then Tour, the one
  switch that starts something. At the header's far right, from `lg` up, is **Ask AI** (the tutor):
  always named (`keepShort`), filled on hover (`hoverFill`), and not faded with the tools when the
  pointer rests. Under the panel, on the stage, is the sound on it (see below), then the panel
  settings and the search (its matches open upward). The wordmark is at the far right of the Sound
  Design strip's heading.
- **With the pointer at rest the secondary controls fade** (`.kys-autohide`, under
  `.kys-synth[data-idle]`), as a video player's do; focus inside one, or hovering it or the dock, brings
  it back.
- **The Sound Design strip teaches the sound** (t-71), over the bar, where a video's chapters are
  (`SoundDesign` in `player.tsx`). From `lg` up with a pointer it is a drawer over the foot of the
  panel: its "Learn sound design" tab always shows at the right of the dock's top and lifts a little while the
  pointer is within `STRIP_REACH` px of the dock (`stripNear`, `data-near` on the dock, set without a
  render), but not while the panel is being worked (a drag, or a press or wheel on it in the last
  `PANEL_QUIET_MS`). A press on the tab slides the strip up (`data-open`, the page's `designOpen`), the tab settling into the strip's head (the wordmark at its left) with an × that closes it,
  and it stays up, whatever the pointer does, until its tab or its head is pressed, or a press lands outside the strip, the lesson card and the panel; a press on the panel puts it away too unless a chapter has been chosen since it opened (`chapterChosen`), when the panel is where the lesson is followed; closed it is
  `visibility: hidden`, so Tab passes it. On touch and below `lg` there is no tab and the strip sits
  in the dock's flow.
- **The patch picker opens the bar** (`SoundPicker`), next to Play, with Restore patch and
  Blank patch: the sound's name opens the library as a drawer down the left of the screen (or the Library sheet below `lg`)
  and puts focus in its search. Its "In the style of…" is its tooltip.
- **The lesson's steps are the chapters**, one per step in its module's colour, each labelled with
  its number and the part of the synth it works on (`moduleOf(step.module).label`), and its title
  from `lg` up; under `sm`, the number alone. The last is the finished sound, labelled "How it works".
  There are no separate How it works or Make it yours buttons: the finished sound's card is the
  overview, with how the sound works, the parts it uses in order, and its ways to make it yours
  (numbered on the panel), so the lesson starts and ends on it.
  A chapter moves the panel to that step, through the same `setStep` as the Lesson region, so
  progress, the open sound's own lesson and shared sounds behave alike, and opens the lesson card
  (below). Hovered, a chapter lights its step's controls in place of whatever is lit, and leaving
  it puts back what the page had lit (`SoundDesign`'s `lit`).
- **From `lg` up the page lights the step's controls itself** while the panel is at a step, since
  the lesson is not on the page there — but only once a step has been picked on this synth since
  the page opened (`litFor`). A step restored from `kys.session.<id>` (a refresh, or coming back to
  a synth) leaves the panel unlit.
- **The step card** is the step the panel is at, in a column no wider than 68ch in the middle of
  the strip, between Previous and Next. With the finished sound on, it is the overview above and
  its button is "Build it step by step"; from the last step Next finishes. Their names ("Previous
  lesson step", "Next lesson step", "Finish the lesson", "Lesson step 1: …") differ from the Lesson
  region's own arrows so both can be on the page.
- **The layers and the panel settings** (t-72, `player-tools.tsx`) are on **the panel's rails**
  (`.kys-rail`): strips of the faceplate along its head and foot, the width of the panel as it fits
  the screen, as a hardware panel's lip carries its smaller switches. They take the synth's own
  faceplate colour and print in its silkscreen ink (`theme.panel`, `panel2` and `ink`, passed as
  `--rail-face`, `--rail-face2` and `--rail-print`), or the outline drawing's paper and ink. The
  head (`.is-top`) carries Sections, Signal and Sensitive, the inspector, Signal routing, then the
  tour and its help at the right; each layer is its icon (with its word from `xl` up and below `lg`) and an LED
  lit while it is over the panel. The foot (`.is-foot`) carries how the panel is drawn (Hardware or
  Outline, Modular or Long), the magnifier and Hover help (the card that pops up when you point at a
  control; `kys.tips`): each its name in the panel's lettering, which explains it on hover, then its
  choices, each a word with an LED lit for the one in use (`aria-pressed` buttons in a named group).
- **Signal** (`f-live-panel` t-150, `SignalMenu` in `player-tools.tsx`) is the head's layer for the patch's
  signal, a button with a menu of its modes (a popover inside the player, not portalled, as the tips are):
  **Off**; **In use**, the sound map's dimming of what the patch does not use (it was the Dim unused toggle, and
  is still `kys.dim`, kept in the account); and **Live**, In use with each part the patch uses lit over its
  controls as signal goes through it. Live is offered wherever the synth has a routing (`getSynthRouting()`) and
  is kept in this browser (`kys.live`). Its glow (`LiveLayer`, `components/app/panel/live-layer.tsx`) is the
  routing view's activity (`routingActivity()`) drawn over each block's cells (`liveAreas()`, the same
  `panelCells()` the dimming uses): its controls', and its jacks' with a cable in them, which is what carries
  a modular's or a pin matrix's module (a section of jacks that are all one block's lights whole once one is
  patched). A control two blocks list gets an area of its own, lit with the brighter, so no two glows overlap.
  In the block's module colour, with `--a` written once a frame. Steady under reduced motion.
  Over a contour, the knob for the stage its envelope is in lights brighter (t-152, `liveStages()`): the
  engine reports the stage (`env1Stage`, `env2Stage` on `meterStore`) and the block's `stages` names the knob.
  Under reduced motion the stage lights still step with the note: they follow it, they do not pulse.
  The foot's LEDs light in a sweep when the page loads (not with reduced motion). The search is at
  the foot's right as an amber readout, and `/` outside a field puts the cursor in it. Under the
  foot's right end, while cables are plugged, a key in the same faceplate colours and print
  (`.kys-panel-key`) floats as a part of the synth: **Unplug all cables**, or **Remove all pins** on
  a pin matrix (`synthDef.matrix`). At the head's right, before the tour, **Undo** and **Redo**
  take back and put back the last 20 changes to the panel's controls and cables (`usePanelHistory`
  over `lib/app/synths/lib/history.ts`): every change goes through the page's `patch`, which the
  hook wraps, so a restore from storage is not one; moves within `HISTORY_GROUP_MS` are one change
  (a knob's turn); a different patch or lesson step on the panel starts it afresh; ⌘Z / ⇧⌘Z
  (Ctrl+Z / Ctrl+Y) work outside fields, dialogs and the sequencer. An undo or redo is shown being
  done: its button's LED lights, what it changes is lit (`HISTORY_LIGHT_MS`), then the controls turn
  there as a hand would (`HISTORY_TURN_MS`, `tweenValues`: a stepped knob through its steps, then
  snapped home), the engine hearing the turn; another press or a change finishes it at once. A cable swings as its ends move
  and settles (`swingStep`, `useSwing` in `parts.tsx`): its belly a damped pendulum as long as the
  cable, so a long one swings slower and further; one just plugged in carries on the swing of the
  one it replaces (the held cable, or the end moved), jolted a little as it seats. A cable unplugged on its own drops away
  from the jack still holding it (`FallingCable`). **Unplug all cables** takes them out one by one,
  in the order they were plugged (`UNPLUG_GAP_MS`), as one undo step; Undo and Redo walk cables one
  by one too (`tweenCables`). A new patch (another sound, a lesson step, Blank) is walked in on the
  panel: the old cables or pins out one by one, then the new in (`REPATCH_STEP_MS`), the engine
  having the new patch at once; not as the page opens, on another synth, or with reduced motion.
  A new patch from a sound opened (the library's, the user's, the tutor's, a shared one), **Blank
  patch**, **Restore patch**, or the synth arriving (from its blank patch) is **glided** onto the
  panel through the hook's `glide` (`glidePlan` / `glideAt` in `history.ts`): the cables the new
  patch has not got come out first, then the controls turn a part at a time down the voice as the
  lessons go (`GLIDE_ORDER`: oscillators, mixer, filter, envelopes, amplifier, modulation, … effects,
  output), nothing lit around them (`GLIDE_STAGE_MS`, faster when many move, `GLIDE_KNOBS_MS`),
  and the new cables go in last. The stored session holds the new patch at once (saved, counted
  and recorded as one change); the hook hands back `sess` as the panel shows it, so the panel and
  the engine follow the glide while a save sends `stored`. A session landing meanwhile (the stored
  panel, the account's) carries the glide on to it; a change through `patch`, or Undo, finishes it.
  Not with reduced motion (`glideMotion` in `motion.ts`, which `tests/setup.ts` turns off for every
  test but the glides' own). The cables, changing one at a time, pass through the panel's walk-in
  above unchanged; lesson steps still use that walk-in alone.
  Choosing another synth turns the instrument on a turntable (`ViewTransition`, transition type
  `synth-change`, `.kys-panel-turn`): the old turns away edge-on, the new turns in. The rails'
  shadows are `box-shadow`s, not filters, and they set their own `--rail-*` variables rather than
  the player's, because their tooltips are inside them. The foot's height (`RAIL_H`) is counted in
  the room the panel is fitted to; the head is above the scroller, so it is counted already. The
  tutor stays in the row over the panel. Harmonics is in the deck, beside the scope it extends.
- **Signal routing turns the panel over** (`f-routing-view` t-142, `routing-view.tsx`): a toggle on the
  head rail, at every width, for a synth with a routing (`getSynthRouting`, see
  [`synths.md`](./synths.md#signal-routing)); a synth without one has no toggle. Its back is a diagram of the
  synth's blocks, laid out by `layoutRouting()`
  (`lib/app/synths/lib/routing-layout.ts`): left to right, the audio band (sources, mixer, filter, amplifier,
  output) on a straight line, and pitch, modulation and contours in the band beneath, each a column left of what
  it feeds. A link that skips a column runs along the channel between the bands, so it never passes behind a
  block; a link against the flow (the output fed back, Oscillator 3 into the mod bus) goes round the top or the
  bottom. Hand-rolled rather than a layout library: a routing is a dozen or two blocks in a known shape, and a
  pure layout is the same every time and testable. **Drawn as a manual's flow diagram** (t-146): on the
  faceplate in its silkscreen ink, between the rails and at their width (the page wraps it in `railStyle`, so
  `--rail-face` / `--rail-print` are the panel's colours in Hardware and paper and ink in Outline). Each block is
  a square box with its schematic symbol and designator (VCO, VCF, EG) in a cell at the left, picked by module or
  by the block's own `symbol`; the module's colour is kept to the lamp in its corner. The synth's routes are ink
  lines with arrowheads, audio heavier, CV light, gate dotted; the player's cables are drawn over them cased, in
  their colours, with a jack at each end, and the key names all four. Two layers of "in use": what
  `routingState()` says the patch routes is solid and the rest faint, its boxes dashed (structural: a filter closed
  right down is still solid, which the key says). Over that, what is going through it now
  (`routingActivity()`, `lib/app/synths/lib/routing-activity.ts`) lights the lamps, tints the boxes and runs in
  the source's colour along the lines, and fades as the sound does. A block follows its `meter`: the gate, a
  contour's envelope, or a wave. The LFO and an oscillator slow enough to see (Oscillator 3 at LO) pulse with the
  wave itself, dark at its trough and full at its peak, eased quickly both ways so the trough is drawn; the meter
  comes 25 times a second, so from 3 to 6 Hz the pulse blends into a steady glow rather than alias into a false
  slow one. An oscillator at audio pitch glows with the output's level times its share of the mixer (as the mix
  hears it, CV into its level included), and at half the output's level when it is switched out of the mixer but
  feeds the mod bus. A glow is a soft ring whose opacity follows `--a`, not an animated filter. The rest of the audio path follows the output's level (read off the engine's analyser, as the scope
  does), and the buses the brightest line into them. The audio path is the audio edges and the live audio cables
  that carry audio on from a module that makes it, so a modular's patched line glows though it has no edges, and a
  mixer passing only control stays off it. On a modular the CM1A's meter is the key held, and each 921, 911 and 902
  reads its own engine slot (`MoogMeters` in `moog-core.ts`, the meter's `moog`): a 921 its wave (pulsing at LO,
  the output's level at audio pitch), a 911 its envelope, a 902 on the audio line its gain, no brighter than the output. So
  two oscillators at different rates, or two envelopes on different contours, glow apart. Until the engine reports,
  a live module that makes signal follows the output's level (see `moog900.ts`). The view eases each part towards that once a frame
  (`settle()`: up in ~40 ms, down over ~450 ms) and writes it to `--a` on the element, never to React state; with
  reduced motion the lines glow without moving, and the LFO and slow oscillators glow steady rather than pulse
  (`steadyMeters()`). The meters are read through `createMeterReader()` (`live-meters.ts`), which the panel's live
  glow shares. It is drawn from `sess` (the panel as shown, glides and undos included) and the mod wheel, so it
  follows the panel while it shows. The panel stays laid out underneath (`.is-away`, `inert`), so its fit and
  scroll are kept for the flip back. Whatever works on the panel itself turns it face up again as it comes
  on: a find (a new one too), a lesson step, the tour, Explain sections or the Inspector (its card, or its sheet
  under `lg`). Turning one off does not, nor does Undo, which the view follows, nor Signal or Sensitive, which
  point at nothing and come from stored settings that can land after the view is open. The flip is a view transition (transition type `routing-flip`,
  `.kys-panel-flip`, nested in the instrument's): only the snapshots turn, so nothing that holds the panel takes
  a transform; with reduced motion, or no view transitions, it swaps. Under `lg` the diagram keeps a readable
  size (`min-width: 900px`) and scrolls sideways in its own scroller.
  Each block is a button for its card (`routing-card.tsx`, t-143): what it is (its designator and name), whether
  the patch uses it now, its description and specs, and the controls and jacks that set it. Hover or keyboard
  focus shows it while the pointer or focus stays (crossing into the card keeps it); a click, a tap, Enter or
  Space keeps it open and moves focus into it, and a kept card stays while the pointer passes other blocks
  (keyboard focus moving to another block takes it there). A second press of its block, or Escape, puts it away
  and returns focus to the block; a press elsewhere closes it. Choosing a control or jack finds it on the panel
  (`findStore`) and turns the panel face up, through the page's flip rather than the find (the page marks the find
  seen, so its check does not turn the view off first), so a control already found turns it over too; focus
  goes to the Signal routing switch. A Radix popover, not portalled, so it comes into full screen with the panel.
  Above the list, a picture of where the block sits (t-147): the faceplate under the view reused through
  `<use href="#kysPanelAll">` (`PANEL_ALL_ID`), so it is the panel at its current values, cables and design with
  no second render, cropped by `panelCrops()` (`lib/routing.ts`) and lit in the module's colour, the rest of the
  crop dimmed. The crop is padded round each control's and jack's reach (`controlReach`, `jackReach`, which the
  find's spotlight uses too). A block spread past 840 × 660 units is drawn as one crop per cluster, in a row at
  one scale; past three crops, or with nothing on the panel, there is no picture. The page passes the panel's
  definition (`panel`) to `RoutingView`, since a modular's case places the parts where its definition does not.
- **The player's buttons carry their own tooltip** (`PlayerTip`, `player-tip.tsx`): the button's
  name and a line on what it does, on hover or focus, in place of the browser's slow `title`. It
  is a Radix popup that is not portalled, so it works full screen.
- **Full screen** is the whole player, and is drawn only where the browser has element full
  screen. The info cards and the tour are rendered inside the player so they still show there.
  The stage, not the player, isolates its stacking, so they still stack over the page's bottom
  nav, and they read the player's dark roles.
- **Under the panel, on the stage,** is the title row, as under a video: the loaded sound (on one
  line in the panel's label face, `.kys-sound-title`, truncated with its full name as the
  `title`), its marks, the save actions (Save a copy…, with a tooltip on what it keeps) and Unplug
  all. The sound's "In
  the style of…" and blurb run the whole width under both, as a video's description is under its
  title.
- **The piano is out by default on a tall screen** (`min-height: 900px`) and put away on a short
  one, until the Piano button says otherwise (stored as `kys.deck`). Harmonics show in the deck
  with the piano put away. **In the light theme the stage is light** (the player's tokens follow
  the theme; the faceplate keeps its own colours). **MIDI** is one button in the bar, opening a
  dialog with the status, Connect / Try again / Stop, and how to connect a keyboard.
- **On a phone** the bar's buttons wrap rather than scroll, with their words, at 44px on a touch
  screen; the head rail's layers wrap as the rail narrows; below `md` the foot rail's search takes a line of its
  own under the settings; the wordmark hides below `md`. The strip over the keys scrolls them by a drag the page handles, so a
  mouse drags it too. **Full screen** lifts the panel's 1560px cap (`--kys-fit-max`), so it takes
  the screen's width. The step the panel is at is not repeated here: the
  chapters and the card show it. The description is of the sound on
  the panel. It does not show a library sound's words under one of the user's own sounds, or a
  shared sound, that has no lesson of its own.
- **From `lg` up the dock is pinned to the screen** (t-74): the Sound Design strip, the bar and
  the piano sit at the bottom, and the panel is fitted to the height left above them. Nothing
  opens beside the player any more, so the panel never refits while you use it. (t-70's tab strip
  and pushing drawer, and its `kys.side`, are gone.)
- **The lesson card floats over the panel** (`lesson-card.tsx`), opened from a chapter: one
  section of the lesson, its moves numbered ①②③ on the card and on the panel (`badgeStore`). It
  does not block the panel, since it tells you to turn the knobs under it. It can be dragged by its
  header anywhere on the screen; ⇆ docks it on the other side (`kys.cardSide`). The inspector
  (Inspect) and the effects rack (Effects, in the bar) open in the same card, so there is one card
  at a time; below `lg` the rack stays under the keyboard.
- **The tutor slides in over the panel** (`TutorDrawer`, `drawers.tsx`) rather than pushing the
  player narrower. It is rendered all the time, the drawer `hidden` while closed, so an answer
  streams on and a closed one is out of the accessibility tree. Ask AI, the drawer's ✕ and Escape
  inside it close it; the last two hand focus back to Ask AI. Asking the tutor from the library
  opens it. Below `lg` none of this is drawn and the bottom sheets (below) are used instead.

## On phones and tablets

D10: playing the full panel needs a landscape tablet or a computer. Everything else works on a
phone. `f-phone-and-tablet` t-65 made the panel and keyboard work on touch:

- **The panel fits the page by default, at every width.** There is no minimum width any more. The
  zoom group (−, Zoom, +) draws the panel at 90% of the fitted width, or up from it in tenths to
  200%, inside its
  horizontal scroller, and keeps the middle of the view in the middle. The panel is drawn bigger,
  not magnified, so every control still works, and a drag on bare panel scrolls the page. Only the
  controls themselves are `touch-action: none`. The magnifier lens is a separate control and is
  kept. A synth with its own layout is capped at a width that fits the height left between the
  header and the dock, but never below 1100 px (or the page's width): a tall panel such as the
  2600 is drawn at a working size and the page scrolls, rather than shrinking it to fit. From
  `lg` up the header over the panel is one row that never wraps.
- **Under 1024 px a note sits above the panel.** It tells a tablet held upright (portrait, at
  least 600 px wide, with a touch screen) to turn sideways. Anything else under 1024 px is told the panel is made for a
  landscape tablet or a bigger screen. It is a notice, not a block. OK hides it for good in that
  browser (`kys.rotateSeen`).
- **Each finger on the keyboard holds its own note**, so chords play on the polys. A mono synth
  gets last-note priority from the engine. Under `lg`, the keys are 44 px wide, and the octave
  buttons, Hold and the wheel are 44 px. The keys scroll sideways by a strip above them ("Drag here
  to scroll the keys", `touch-action: pan-x`). A swipe on the keys themselves plays rather than
  scrolls (`touch-action: none`): a browser pan would cancel the pointer and cut a held note or a
  chord. A finger the keyboard will not hear let go (the window loses focus, or the keyboard is
  closed) has its note let go at once. Under `sm`, the octave buttons and Hold go under the keys,
  so more keys show.
- **The lens switches over the panel and the player's bar scroll sideways on one line** under
  `sm`, with the zoom group first in the bar, instead of wrapping into a wall.
- **Nothing may make the page wider than the screen.** A grid item grows to its content's width
  unless it has `min-w-0` or a `minmax(0, …)` track, so the keyboard (whose keys scroll) and the
  regions under the panel carry one. Anything new that scrolls sideways inside a grid needs the
  same.
- **Under `lg`, the regions beside the panel open as bottom sheets** (t-66). A bar of four
  buttons under the page opens the Library, Lesson, Inspector and Tutor; at `lg` and up they are
  the drawer beside the player instead (above). The Library and Tutor are modal: the page dims, focus stays inside, and a press
  outside closes them. The Lesson and Inspector are docked at half height with the panel still
  live above them, so a press outside does not close them and focus is not held in them. Either
  can be dragged to full height. Closing a sheet hands focus back to the bar button that opened
  it, which Radix does only for its own trigger.
- **Each region stays mounted while its sheet is closed** (`kept.tsx`). It renders once into a node
  of its own, and the open sheet holds that node. Unmounting would cut off a tutor answer
  mid-stream and drop the lesson's highlight. Crossing `lg` (turning a tablet) still remounts the
  four regions: the tutor's conversation comes back from the server, an unsent draft does not.
- **A new lesson step drops a full Lesson sheet back to half** and scrolls the step's controls
  into the band above it, and into the panel's own scroller when it is zoomed (`reveal.ts`). The
  band comes from the half height (`HALF_HEIGHT`), not a measurement, since the sheet is still
  shrinking. At full height the panel is covered, so nothing scrolls.
- **On a small touch screen a tap on the panel opens the Inspector** on what was tapped, in place
  of the floating card. A tap on bare panel, a drag, a finger of a two-finger gesture, the first
  tap of a cable being patched, or an open Lesson sheet does not. In a sheet, the tutor's conversation fills it and its composer cannot be resized.
- The knobs, sliders, switches, jacks and cables needed no change for touch. They were already
  pointer events, and patching by tapping one jack and then another already worked.

## The URL

- `?view=outline`, `?view=long` or `?view=long,outline`. The last choice is kept in browser
  storage and applied when the URL has no `view`. Changing it rewrites the URL in place.
- `/synths` reopens the synth in `kys.synth`, or the first listed one. This stands in until a
  catalogue is planned (journal, `f-model-d`).
- `?sound=<id>` opens the synth with that library sound loaded, over whatever the browser had
  stored, then drops out of the URL so a reload keeps what was done since. A sound the library
  does not have is ignored. A databank record's "Load a patch in this style" links here.
- `?mine=<id>` opens one of the signed-in user's own sounds the same way, once the session is
  known; the dashboard links here. Signed out, or when a hash link is sending the visitor
  elsewhere, it opens nothing. See [`sounds.md`](./sounds.md).
- Signed in, the library and the lesson show how far the user got through each lesson, and stars
  beside the chooser, the library and My patches add favourites (`f-my-sounds` s4, in
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
| `kys.dim`, `kys.heat`  | The Signal layer's In use (the sound map's "Dim unused parts"; on under Live too) and "Show sensitive controls"                                                                                                                                                    |
| `kys.live`             | The Signal layer is Live rather than In use (`f-live-panel`). In this browser only, never kept in the account                                                                                                                                                      |
| `kys.harm`             | The harmonics strip under the panel                                                                                                                                                                                                                                |
| `kys.rotateSeen`       | The small-screen note above the panel has been put away                                                                                                                                                                                                            |
| `kys.deck`             | The Piano button's choice: out, put away, or `null` for the screen's default                                                                                                                                                                                       |
| `kys.cardSide`         | Which side of the panel the lesson card docks on from `lg` up (`left` or `right`)                                                                                                                                                                                  |
| `kys.settingsBy`       | Who was signed in when the settings were last changed (`null` for no one), so another user's are not filled into an account                                                                                                                                        |
| `kys.settingsAt`       | When the settings were last changed (ms), weighed against the account's copy                                                                                                                                                                                       |
