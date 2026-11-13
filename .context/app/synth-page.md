# The synth page

`/synths/[id]`: play a synth, patch it and read about it. Plan §4 "The synth page". It keeps the
prototype's layout, split from `prototype/src/App.jsx` (D3).

**Patch, not sound, on screen.** A saved or library panel setting is a **patch** everywhere a user reads it: My
patches, the Patch library, Save this patch, Explore's patches (owner ruling, 2026-10-23, t-93). The code, the URLs
(`?sound=`, `/s/<slug>`), the API (`/api/v1/sounds`) and the database still say `sound`, and stay so: renaming them would
break shared links for no visible gain. "Sound" on screen means what you hear ("Turn the sound on", the sound map), and
**Sound design** keeps its name.

## Where things are

| File                                      | What it is                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `app/(panel)/synths/[id]/page.tsx`        | The route: 404s an id the registry lacks, reads the API, renders the page                                 |
| `app/(panel)/synths/page.tsx`             | `/synths`: reopens the last synth opened, or the first listed                                             |
| `components/app/synth/synth-page.tsx`     | Holds the page state (`App.jsx`'s) and lays out the regions                                               |
| `components/app/synth/synth.css`          | The instrument's classes: `kys-label`, `kys-player`, `kys-pulse`, …                                       |
| `components/app/synth/player.tsx`         | The player's pieces: wordmark, the Sound Design strip, the patch picker and its drawer, play, full screen |
| `components/app/synth/face-roles.ts`      | The player's colour roles in a faceplate's colours, for the strip and the lesson card's header            |
| `components/app/synth/player-tools.tsx`   | The bar's layer toggles and the panel settings on the panel's rail                                        |
| `components/app/synth/pattern-picker.tsx` | The Play deck's pattern picker beside Play, and `use-ranked-patterns.ts`, the library ranked for it       |
| `components/app/synth/drawers.tsx`        | The tutor's drawer, sliding over the panel from `lg` up                                                   |
| `components/app/synth/lesson-card.tsx`    | The card over the panel from `lg` up: lesson, inspector or effects                                        |
| `components/app/synth/routing-view.tsx`   | The back of the panel: how the synth's parts are wired, the live path lit                                 |
| `components/app/synth/engine.ts`          | One audio engine for the visit                                                                            |
| `components/app/synth/storage.ts`         | What a signed-out visitor's browser keeps                                                                 |
| `components/app/synth/routes.ts`          | `?view=`, `?sound=` and the prototype's hash links                                                        |
| `components/app/synth/my-sounds.tsx`      | My patches, and Save / Save as / Rename / Delete / Save a copy                                            |
| `components/app/synth/with-notes.ts`      | Puts the API's "Unusual on…" notes back on the definition                                                 |
| `components/app/synth/library.tsx`        | The sound library: search, categories, the loaded sound                                                   |
| `components/app/tutor/tutor-panel.tsx`    | The tutor, in its drawer ([`tutor.md`](./tutor.md#the-panel))                                             |
| `components/app/synth/lesson.tsx`         | The lesson: how it works, build it step by step, make it yours                                            |
| `components/app/synth/tour.tsx`           | The orientation tour, docked under the panel                                                              |
| `components/app/synth/lineage.tsx`        | The lineage dialog (History)                                                                              |
| `components/app/synth/limits.tsx`         | The "What is not modelled" dialog                                                                         |
| `components/app/synth/about.tsx`          | The About dialog: the synth's summary                                                                     |
| `components/app/synth/use-dialog.ts`      | Opens and closes a native `<dialog>` from an `open` prop                                                  |
| `components/app/synth/scope.tsx`          | The scope strip, the harmonics strip and the big scope view                                               |
| `components/app/synth/sound-map.tsx`      | The sound map's legend, its "why is it dark?" line and its card note                                      |
| `components/app/synth/panel-zoom.tsx`     | The panel's size: 90% to 200%, zoomed in its scroller                                                     |
| `components/app/synth/rotate-prompt.tsx`  | The note on a small screen that the panel wants a bigger one                                              |
| `components/app/synth/reveal.ts`          | Scrolls a lesson step's controls into view above the Lesson sheet                                         |
| `components/app/ui/bottom-sheet.tsx`      | The bottom sheet the regions beside the panel open in under `lg`                                          |
| `components/app/ui/kept.tsx`              | Keeps a region mounted while its sheet is closed                                                          |
| `components/app/synth/*.tsx` (the rest)   | Picker, search, inspector and info cards, keyboard, effects rack, bar                                     |

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
- **The Default patch comes first** (`f-default-patch`). The page puts it ahead of the catalogue's sounds
  (`defaultPatchSound` in `lib/app/synths/default-patch.ts`, under the reserved id `default-patch`), so a synth with
  no session yet opens on it, and a stored sound the library no longer has falls back to it. **A synth chosen over
  another opens on it too**, whatever panel it was left with (owner ruling, 2026-11-03): on arrival the page compares
  `kys.synth`, the last synth opened, with this one (`switchedTo`), and only a refresh, which comes back to the same
  synth, restores the stored panel. The Default patch is then set as a change the visitor made, so the browser and
  the account keep it and the account's older panel does not replace it; `?sound=`, a shared sound and `?mine=` still
  open their own sound over it. The same switch turns the Signal layer and Show sensitive controls off: both are kept
  as settings, so they would otherwise carry over from the synth before. A dated history of each synth's recent
  panels, to get one back, is Hub idea #32. The library lists it
  above its sounds, outside their search, categories and count; it is no catalogue row. So nothing that reads or
  writes a library sound through the API is handed it: it records no lesson progress, takes no star, is credited by
  no saved copy, and is no start for the patterns that suit the patch. In the sequencer its one pattern is the C
  major scale, which `useSoundPatterns` offers without a read.
- **A lesson step is a panel state.** Choosing step _k_ sets the panel to the sound's steps up to
  _k_, on top of the Default patch (`presetState(def, sound, k)`, `f-default-base` t-176); Finish sets it back to the
  whole sound. Every sound builds on the Default patch, the library's finished sound included, so moving from one
  step to the next changes only what that step names and lights. Picking another
  sound leaves the walkthrough. The step is kept with the session. The lesson is the library
  sound's, or the open sound's own when it was saved with one
  ([`sounds.md`](./sounds.md#a-sounds-lesson-t-55)), which keeps that sound open while it steps.
- **Every lesson starts at step 0, the Default patch** (`f-default-patch` t-173), so someone following on their
  own synth starts where the panel does. It is no step of the lesson's data: the session holds it as `START_STEP`
  (−1, in `preference-data.ts`, which the account's last panel takes too), and `lessonState()` in
  `default-patch.ts` sets the panel to `defaultPatchState()` for it. Build it step by step, the Lesson's start and
  Back from step 1 go to it; its Next goes to step 1. It records no lesson progress, and a step restored from the
  session still wins over it on a refresh. It is compact: one line before the step cards in the Lesson ("Set your
  synth to the Default patch." and what to listen for, from the Default patch's step), a short **0 · Start** chapter
  before step 1, and a card with no numbered moves (the Default patch sets the whole panel). Its controls are lit
  and, on a phone, revealed above the Lesson sheet as a step's are. The Default patch's own lesson has none: its one
  step is that patch already.
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
│ │ DRAWN AS·MAGNIFIER·HOVER HELP · ZOOM −[FIT]+  [🔍 Find…]      │ │               │ └────┘ │
│ │ map legend · why is it dark? · engine error                   │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ LEARN SOUND DESIGN              (chapters, shown on approach)  │
│ │ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬                                │ │               │        │
│ │ ①OSCILLATORS ②FILTER ③ENVELOPES ④AMPLIFIER ✓FINISHED          │ │               │        │
│ │ step title    step title  …                 The whole sound   │ │               │        │
│ │   (‹ Previous)  ┌ Step 2 of 4 · FILTER ──────┐  (Next step ›)  │ │               │        │
│ │                 │ title · why, ≤68ch          │                 │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ [▶ PLAY] [PLAYS The patch's riff ▴] [Sequencer] [🔊 Mute]       │ │               │        │
│ │         [Piano] [Harmonics] [Effects] MIDI [?]            [⛶]   │ │               │        │
│ ├───────────────────────────────────────────────────────────────┤ │               │        │
│ │ harmonics strip · keyboard │ scope · [Harmonics] MIDI · rack  │ │               │        │
│ └───────────────────────────────────────────────────────────────┘ │               │        │
│ [<name>                ▾] [mine] 3 controls moved                │
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
- **The caption is the synth.** The wordmark's LED is lit amber while the sound is on, and yellow while a lesson is
  being walked (a step chosen, step 0 included; `Wordmark lesson`, t-204). The synth's name
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
  and it stays up until its tab or its head is pressed. Before a chapter has been chosen since it opened (`chapterChosen`), a press anywhere outside the strip and the lesson card puts it away too; once one has, the lesson is being followed, and only its tab or head does, whatever is pressed meanwhile (the panel, the keys, Play, a dialog); closed it is
  `visibility: hidden`, so Tab passes it. On touch and below `lg` there is no tab and the strip sits
  in the dock's flow. Putting it away closes the lesson card it opened; the inspector and the effects, from the bar,
  stay (`closeDesign`, t-205).
- **The strip is drawn in the faceplate's colours** (t-201), as the rails are: `faceRoles(face, face2, ink)`
  (`face-roles.ts`) redeclares the player's `--kys-*` roles from the rails' three colours (or the outline drawing's
  paper and ink), keeping text, accent and module colours at least 3:1 off the face (4.5:1 for muted text) where the
  print allows; the accent falls from amber to the day amber to the ink. With a pointer, the closed tab carries the
  lesson card's desk-tone bezel round its top and sides, and the open drawer along its top (an inset shadow, so the
  closed drawer takes no height; t-206).
- **The patch is chosen from its name under the panel** (`SoundPicker`, t-207), boxed as a select (at least 360px
  wide, the caret in its own segment): it opens the library as a drawer down the left of the screen (`SoundsDrawer`,
  rendered in the player outside its stage, so it stacks over the dock), or the Library sheet below `lg`, and puts
  focus in its search. Its "In the style of…" is its tooltip. The Default patch is first in the library; the bar has
  no button of its own for it (t-208).
- **The foot of the player is the Play deck**: the bar, the piano and scope, MIDI and the docked sequencer, where the
  synth is played from (owner ruling, 2026-11-07). **Play is its first control** (`PlayButton`, t-210), outside the
  bar's scrolling row so nothing clips it, drawn as a lit green transport key at the bar's 44px; it glows from inside
  while it runs. While a pattern plays (the patch's riff included, which plays through the sequencer, t-234), the glow is
  held steady and brightens every fourth step, from the playhead (`useStepTick`, t-225); under reduced motion it stays
  steady.
- **Beside Play, the pattern picker chooses what Play plays** (`PatternPicker`, `f-pattern-picker` t-213): a
  select-like button at Play's height naming it ("The patch's riff", or the pattern's name, "(edited)" once changed).
  From `lg` up its list opens upward over the deck, a popover in the dock that closes on a press outside it, on Escape
  (focus back to the button) or when focus leaves it; below `lg` it is a modal bottom sheet. The search is at its top
  and has focus as it opens. The list is the patch's own patterns, then the whole library by role, best suited first;
  how it is read and ordered is in [`pattern-library.md`](./pattern-library.md#the-play-decks-picker). Picking loads the
  pattern into the sequencer (`seq.load`, with Undo back to what was held) and leaves the sequencer closed; picked
  while the riff plays, the pattern takes over at once, from its top.
- **Play plays the sequencer whenever it holds a loaded pattern** (`playsPattern` in `synth-page.tsx`): while the
  sequencer is open, while it holds a pattern loaded into it (picked beside Play, picked in the sequencer's strip, or
  the pattern one of the user's sounds plays), while it holds the riff edited (named "(edited)"), and with no riff to
  play. Otherwise Play plays the sound's riff, and it too plays through the sequencer, which holds it as it came
  (`riffNow`, t-234): at the tempo knob's tempo, a riff that plays once stopping at its end. The scope's Play follows the
  same rule. Another patch puts its riff back in the sequencer (`useSequencer`, keyed on the riff), and Play with it.
- **The lesson's steps are the chapters**, one per step in its module's colour, each labelled with
  its number and the part of the synth it works on (`moduleOf(step.module).label`), and its title
  from `lg` up; under `sm`, the number alone. The first, narrower, is step 0 ("0 · Start", the Default
  patch); the last is the finished sound, labelled "How it works".
  There are no separate How it works or Make it yours buttons: the finished sound's card is the
  overview, with how the sound works, the parts it uses in order, and its ways to make it yours
  (numbered on the panel), so the lesson starts and ends on it.
  A chapter moves the panel to that step, through the same `setStep` as the Lesson region, so
  progress, the open sound's own lesson and shared sounds behave alike, and opens the lesson card
  (below). Hovered, a chapter lights its step's controls in place of whatever is lit, and leaving
  it puts back what the page had lit (`SoundDesign`'s `lit`).
- **Next step makes the step's moves one at a time** (`f-step-moves` t-178). Pressed, the session
  holds the next step at once (saved, recorded as progress and played from), but the panel shows the
  step before, and then each numbered move in its order (`stepMoves`, `stepBadges`): its control, or
  a cable's jacks, lit for `MOVE_LIGHT_MS`, then turned into place as Undo turns one
  (`HISTORY_TURN_MS`, `tweenValues`), or the cable pulled out and the new one plugged in. The engine
  follows the panel as shown, so each move is heard if a note or the riff is playing; nothing is held
  while it runs, as a load holds the synth. The move being made is `moveStore`: its ① is ringed on
  the lesson card and on the panel (`LessonBadges`), and its chip in the Lesson sheet; on a phone
  with the sheet at half height it is scrolled into view above the sheet. A move already in place is
  lit but does not turn. Only Next does this (the card's Next, the Lesson's Next step and its step
  bar's ›, from step 0 too): Previous, a chapter, a dot on the step bar, a swipe and a restored step
  set the step at once. Another press, a change on the panel, Undo, or a session landing from
  elsewhere finishes the moves at once; with reduced motion the step is set at once.
  **Replay changes** (beside "On the panel" on the card, under the chips on the Lesson's current
  step) puts the panel back to the step before and makes the step's moves again. With nothing
  playing, it plays the sound's riff while they are made and stops it once they are, unless Play
  or Stop was pressed meanwhile (`replayRiff`). The riff plays through the sequencer (t-234), so
  with a pattern picked it is that pattern that plays. There is no Replay at the first step of a lesson
  with no step 0 (the Default patch's own).
- **From `lg` up the page lights the step's controls itself** while the panel is at a step, since
  the lesson is not on the page there — but only once a step has been picked on this synth since
  the page opened (`litFor`). A step restored from `kys.session.<id>` (a refresh) leaves the panel
  unlit.
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
  Outline; Layout, on a synth with a layout of its own (below): Modular or Long, or Compact or Full; and on a panel printed in another language, its Labels in that language or
  English, `kys.english`, kept in this browser), the magnifier and Hover help (the card that pops up when you point at a
  control; `kys.tips`): each its name in the panel's lettering, which explains it on hover, then its
  choices, each a word with an LED lit for the one in use (`aria-pressed` buttons in a named group). The
  foot stays on one row (t-226): `useFootFit` measures the rail's own width into `data-fit` (not a container
  query, which would make the rail the containing block of its fixed-position tooltips), and as it narrows it
  closes up, the settings take their short names (`Setting`'s `short`: Lens, Tips; `drop` for Drawn as,
  Layout and Labels, whose choices say it, their tip then hanging from the whole setting), Zoom's name goes and the search
  narrows, each step at a wider rail when there is a Layout or Labels setting. On a phone the search keeps a line of its
  own. Zoom is not on the foot while the routing view shows, which is at no zoom.
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
  The knob or fader that sets the cutoff gets a second, live pointer at the cutoff the engine runs at
  (t-154, `LivePointers`, `components/app/panel/live-pointer.tsx`; `MeterEvent.cutoff` on `meterStore`), so an
  envelope or LFO sweep shows on it; so does one that sets the VCA's gain (`.amp`), where there is one (the
  Neutron, the ARP 2600; not the Model D). No per-synth data: `pointerControl()`
  (`lib/app/synths/lib/live-pointer.ts`) takes the control whose travel moves `filter.cutoff` / `vca.bias`
  furthest in `toEngine()`, passing over one that also tunes the oscillators, and reads its position for a
  metered value off `toEngine()` across that travel. None on the Easel, the SOLAR 42N or the 900 series, whose
  voices do not use the engine's filter and VCA. Hidden while under the control's own pointer; eased between
  meters, straight to each under reduced motion.
  **Live + flow** (t-153, `LiveFlow`, `components/app/panel/live-flow.tsx`) is Live with a line from each lit
  part to the part it feeds while the patch routes signal along it (`liveFlows()`,
  `lib/app/synths/lib/live-flow.ts`), in the routing view's style: audio heavy, control light, gate dotted, in
  the source's colour, with an arrowhead. A line runs between the boxes of the two blocks' glow areas, and is a
  short arrow across the seam where they touch; a block with nothing on the panel (the VCA, MIDI) is passed
  through, so the filter's line runs on to the output. Lines are the routing's live edges and a pin matrix's live
  pins; never a patch cable, which the face already draws, so a modular has none. `LiveLayer`'s loop writes
  each line's `--a` (the brightest of its edges' and pins' `routingActivity()` levels) and the dashes' `--run`,
  which it leaves at 0 under reduced motion: the lines show, and do not move. Kept as `kys.live` = `"flow"`.
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
  by one too (`tweenCables`). A new patch (another sound, a lesson step, the Default patch) is walked in on the
  panel: the old cables or pins out one by one, then the new in (`REPATCH_STEP_MS`), the engine
  having the new patch at once; not as the page opens, on another synth, or with reduced motion.
  A new patch from a sound opened (the library's, the user's, the tutor's, a shared one), **Default
  patch**, **Restore patch**, or the synth arriving is **loaded** (`f-default-patch` t-172): the
  panel is set to the synth's **Default patch** at once, cables and all, whatever was on it before
  (or still gliding onto it), so the controls move the same way whichever sound was last. From
  there it is **glided** onto the panel through the hook's `glide` (`glidePlan` / `glideAt` in
  `history.ts`): the Default patch's cables the new patch has not got come out first, then the
  controls turn a part at a time down the voice as the
  lessons go (`GLIDE_ORDER`: oscillators, mixer, filter, envelopes, amplifier, modulation, … effects,
  output), nothing lit around them (`GLIDE_STAGE_MS`, faster when many move, `GLIDE_KNOBS_MS`),
  and the new cables go in last. The stored session holds the new patch at once (saved, counted
  and recorded as one change); the hook hands back `sess` as the panel shows it, so the panel and
  the engine follow the glide while a save sends `stored`. A session landing meanwhile (the stored
  panel, the account's) carries the glide on to it; a change through `patch`, or Undo, finishes it.
  Not with reduced motion (`glideMotion` in `motion.ts`, which `tests/setup.ts` turns off for every
  test but the glides' own): the panel snaps to the new patch. The cables, changing one at a time,
  pass through the panel's walk-in above unchanged; lesson steps still use that walk-in alone, from
  the step before, and do not reset to the Default patch.
  **Nothing sounds while a patch loads.** The hook reports `loading` (and `isLoading()` for a note
  between renders, and `onLoad` as it begins and ends) from the moment `glide` is called until the
  glide ends, a change through `patch` or Undo finishes it, or, with reduced motion, straight away;
  a new patch that changes nothing is no load. Meanwhile the page drops notes from the keys, MIDI
  in and the scope's keyboard (dropped, not queued); lets go, as the load begins, of the keys held
  (Hold's too) and the arp's keys in the sequencer; stops a riff playing and plays the sound's
  riff again from its top once it has loaded, so nothing starts while the knobs move (`holdRiff`; a riff whose
  sound was still starting as the load began is held too). Following a MIDI clock, the riff runs on muted instead:
  the clock is not the page's to stop. It holds a Play pressed meanwhile until then (the riff of the sound on the
  panel by then, should a second load take over; Mute drops it). A start waiting on the load (`waiting`) counts as
  playing for every transport (the bar's Play, the scope's, the sequencer's, a panel's Run button), so each reads Stop
  and cancels it, and Replay does not start the riff over it; the bar's Play shows a spinner and is `aria-busy`.
  Opening the sequencer or picking a pattern meanwhile makes a waiting riff start as the pattern (`riffToPattern`). It passes `silent` to MIDI
  out, so a running pattern goes on in time but muted on the synth and on the output (see
  `sequencer.md`). The patch picker's LED pulses and its label says it is loading, so a dead key
  reads as "wait". The synth arriving is a load too, from the Default patch: it waits `ARRIVE_MS`
  on it, and the stored panel landing meanwhile carries the glide on.
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
  `--rail-face` / `--rail-print` are the panel's colours in Hardware and paper and ink in Outline). While it shows,
  that width is the whole width, not the panel's, for the view and the rails alike (t-223): the diagram is not the
  panel's shape, so a tall, narrow panel's fitted width would squeeze it. Each block is
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
  definition (`panel`) to `RoutingView`, since a modular's case or a compact panel places the parts where its
  definition does not.
- **Layout: the panel as drawn** (`layoutDef()`, `lib/app/synths/lib/layout.ts`; `f-compact-panels` t-229). A
  definition may carry a layout of its own besides the full faceplate, and opens in it: `modular` (the Jupiters) cuts
  the long panel into modules stacked in rows in a case; `compact` cuts it into pieces put down on one faceplate, with
  no case, and leaves out whatever no piece cuts: a keybed the app's keyboard under the panel replaces, a band with no
  controls. A definition has one or the other, never both (`check:synths` refuses both). Either way only positions and
  the view change: ids, values, areas (clipped to the cuts) and the sound are the definition's, so the search, the
  cards, the sound map, the tour and cables work unchanged. The Layout setting on the foot keeps the full faceplate one
  toggle away (`view.long`, `?view=long`): Modular or Long on a modular, Compact or Full on a compact one, its help
  saying what each half is. Which half was last chosen is kept per kind of layout (`kys.layouts`), not for every
  synth at once. **Every surface that draws a panel goes through `layoutDef()`**, so they all draw the
  same one: the page's `def` (the live panel, the find's spotlight, the inspector, the routing view and its block
  crops, `panelCrops()`), and `panelSvg()` (`components/app/sharing/panel-svg.ts`) for the share card and the home
  page's hero, which draw the synth's own layout. The sound map and the routing model read the definition, not the
  drawn layout. A compact spec is a list of pieces, each a `cut` on the long panel (`[x0, y0, x1, y1]`) and where its
  top-left goes (`at`, from the faceplate's top-left, inside any end cheeks); pieces may not overlap, and a control or
  jack in no piece is an error. The Grandmother is the first: no keys, and GLIDE with PLAY / HOLD / TAP beside the
  ARP/SEQ section, so the panel is the faceplate's height. The Malevolent, the Mantis and the Super Gemini followed
  (t-230): each left-hand block moves beside the faceplate (the Mantis's into the empty column under its mark), its
  joystick inline and still draggable, since none of the blocks is taller than the faceplate; the Super Gemini keeps
  its ribbon strip, which has a hover card. The CS-80, DeepMind 12D, UB-Xa D and SOLAR 42N lose their empty bands
  (t-231): the CS-80's memory cover and YAMAHA band go, its performance panel moving into the cover's place and its
  ribbon kept as a slim strip; the DeepMind's title band and blank logo cell go, its VOICES lamps moving into the
  display section's empty name bar; the UB-Xa D's title band goes; the SOLAR's logo band shrinks to the DUAL
  EFFECTOR's top, its rear sockets and power legend either side of it. The Jupiters' cases and the System 15 lose their blank
  plates (t-232): each Jupiter's modules are re-packed into three rows full enough that none is padded with a blank
  (the Jupiter-6's memory in a row of its own height), and the System 15 opens compact: the hardware's BP56 and BP28
  left out, the 921 VCO closing the top row and the rest of the bottom row closed up, two 98 HP rows in place of 140,
  with the maker's strip cut on its own so the wordmark stays centred. The modular case, like the compact pieces, is
  left out of `check:synths`'s comparison with the prototype; the long panel is still compared. The CS-80's memory cover is the one hover card a
  compact panel drops, since it covers memories the app does not model; an area every part of which is cut away is
  left out of the compact def, so the tour and the search do not offer it. A compact panel is wider for its height than the full drawing, so it is
  drawn bigger only where the screen's height limits the panel; where its width does (a narrow window, a phone, the
  share card), compact is a little smaller than Full, and the help says no more than that. A compact spec cannot
  cut the same part of the long panel twice or put a piece left of or above the faceplate's corner; marks move with
  the piece their centre is in, and a pin matrix must sit in one piece.
- **The player's buttons carry their own tooltip** (`PlayerTip`, `player-tip.tsx`): the button's
  name and a line on what it does, on hover or focus, in place of the browser's slow `title`. It
  is a Radix popup that is not portalled, so it works full screen.
- **Full screen** is the whole player, and is drawn only where the browser has element full
  screen. The info cards and the tour are rendered inside the player so they still show there.
  The stage, not the player, isolates its stacking, so they still stack over the page's bottom
  nav, and they read the player's dark roles.
- **Under the panel, on the stage,** is the title row, as under a video: the loaded sound (the patch picker, its
  name on one line in the panel's label face, `.kys-sound-title`), its marks, the save actions (Save a copy…, with a tooltip on what it keeps) and Unplug
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
  header anywhere on the screen, and once moved it floats over the dock and the tutor's drawer (t-202); its grip at the
  bottom right sizes it, by pointer or the arrow keys, down to 280×180, the size kept when ⇆ docks it again (t-203).
  ⇆ docks it on the other side (`kys.cardSide`). Turning the panel over to Signal routing closes it, whatever it shows
  (t-205). Showing the lesson, its header is a strip of the faceplate (the face roles above) and the card sits in a
  desk-tone bezel, opaque, so it lifts off a panel of its own colour (t-201). Docked, it stands
  above the dock and, with a pointer, above the Sound Design drawer while that is open: the drawer
  stands on the dock outside its height, so the page measures it into `--kys-strip-h` as it slides,
  and the card rises with it (t-174). The inspector
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
  zoom on the panel's foot rail (−, a readout reading Fit or the size, +; t-209) draws the panel at 90% of the fitted width, or up from it in tenths to
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
  `sm`, instead of wrapping into a wall.
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
in the account as well. The newer copy wins ([`sounds.md`](./sounds.md)). A synth's stored panel is restored only
when the page comes back to the synth in `kys.synth`; one chosen over another opens on its Default patch, with
`kys.dim` and `kys.heat` off.

| Key                    | Holds                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kys.synth`            | The last synth opened                                                                                                                                                                                                                                              |
| `kys.view`             | The last panel view: its Outline; its `long` is not read back                                                                                                                                                                                                      |
| `kys.layouts`          | The Layout setting's last choice for each kind of layout (`{ modular?, compact? }`), so Long on a Jupiter does not open the Grandmother Full                                                                                                                       |
| `kys.session.<id>`     | That synth's panel: sound, lesson step, values, cables, the user's own sound open on it (`soundId`), when it was changed (`savedAt`) and who was signed in then (`owner`). Written 400 ms after the panel goes still, and checked against the definition when read |
| `kys.tips`             | Info cards on                                                                                                                                                                                                                                                      |
| `kys.fx`, `kys.fxOpen` | The effects rack and whether it is unfolded                                                                                                                                                                                                                        |
| `kys.midi`             | Reconnect MIDI on the next visit                                                                                                                                                                                                                                   |
| `kys.dim`, `kys.heat`  | The Signal layer's In use (the sound map's "Dim unused parts"; on under Live too) and "Show sensitive controls"                                                                                                                                                    |
| `kys.live`             | The Signal layer is Live (`true`) or Live + flow (`"flow"`) rather than In use (`f-live-panel`). In this browser only, never kept in the account                                                                                                                   |
| `kys.harm`             | The harmonics strip under the panel                                                                                                                                                                                                                                |
| `kys.english`          | A panel printed in another language (the Polivoks) is shown in English: the foot rail's Labels. In this browser only, never kept in the account                                                                                                                    |
| `kys.rotateSeen`       | The small-screen note above the panel has been put away                                                                                                                                                                                                            |
| `kys.deck`             | The Piano button's choice: out, put away, or `null` for the screen's default                                                                                                                                                                                       |
| `kys.cardSide`         | Which side of the panel the lesson card docks on from `lg` up (`left` or `right`)                                                                                                                                                                                  |
| `kys.settingsBy`       | Who was signed in when the settings were last changed (`null` for no one), so another user's are not filled into an account                                                                                                                                        |
| `kys.settingsAt`       | When the settings were last changed (ms), weighed against the account's copy                                                                                                                                                                                       |
