# The pattern sequencer

One sequencer works on every synth. You edit a riff step by step, starting from any riff in the library, and play it
on whichever synth is open (`f-step-sequencer`, §21). This page covers the pattern model under it
(`lib/app/sequencer/`, t-78), the engine's pattern player (t-79) and the module on the synth page
(`components/app/sequencer/`, t-80). Saving (t-81), mod lanes (t-82), sharing (t-83), playing into it (t-86) and the sequencer synths' own buttons (t-85)
each have their section here.
The tutor reading and writing patterns (t-84) is in [`tutor.md`](./tutor.md#patterns).

## Riffs and patterns

A library riff is a `Phrase` (`lib/app/synths/contract.ts`): a tempo, whether it loops, and a list of notes
`[beat, midiNote, lengthBeats, velocity?]`. The engine plays it as written. Its loop length is the last note's end,
rounded up to a whole beat (`phraseBeats`).

A `Pattern` (`pattern.ts`) is the same music on a grid of steps, plus what a modular sequencer adds. It is versioned
(`PATTERN_VERSION`). A change that an older pattern can't be read as ships a mapping, as sounds do (D1).

| Level   | Fields                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern | `bpm` 20–300, `stepSize` (`1/8`, `1/8t`, `1/16`, `1/16t`, `1/32`), `loop`, `direction`, `swing` 50–75, `transpose` ±48, `root`, `scale`, `parts` (A, B), `chain` |
| Part    | `steps`: 1–128, and every part has the same number                                                                                                               |
| Step    | `on`, `notes` (0–6: none is a rest, several a chord), `accent`, `slide`, `ratchet` 1–4, `probability` 0–1, `condition`, `mod` (mod lanes' values)                |
| Note    | `note` 0–127, `gate` in steps up to 256 (past 1 it ties over), `velocity` 0–1, `nudge` 0 to just under 1 step                                                    |

Gate, velocity and nudge belong to the note, not the step. The library's chords aren't always struck or let go
together, and a pattern has to hold them exactly.

`PatternSchema` is strict. An unknown field, a part of another length, a chain naming a missing part, or any value out
of range is refused, never clamped. A pattern that passes it always compiles.

## Importing a riff

`importPhrase` (`import.ts`) changes no note. Here is what the library holds, measured at t-78:

- 1,071 riffs, 214 with chords of 2 to 5 notes
- 2 to 32 beats long
- about 100 notes off the sixteenth grid: triplets at x.67, flams and pushes at x.1 or x.9
- lengths of any size

The import:

1. Picks the step size that puts the fewest starts off the grid and still fits in 128 steps. A tie goes to `1/16`,
   then `1/8t`, `1/16t`, `1/8`, `1/32`. A start within a millionth of a step of a boundary counts as on it. Riffs are
   decimals, so 0.67 beats is not exactly 2/3.
2. Makes the pattern `phraseBeats × steps per beat` long, so it loops where the engine looped the riff.
3. Puts each note on the step it starts in, with the remainder as its `nudge`, its length as `gate` in steps, and its
   velocity only if the riff gave one.

The result is one part, forward, straight, chromatic, at the riff's tempo. Two kinds of riff are refused
(`RangeError`) rather than changed:

- one too long for any step size
- one transposed by part of a semitone or by more than 48

None in the library are either, and no library sound sets a transpose at all. A note can be held for up to 256 steps,
so a note that runs past the riff's last beat still imports.

`tests/unit/lib/app/sequencer/import.test.ts` holds it to that. Every seeded riff, imported and compiled for loop 0,
gives back the riff's own notes (starts and lengths to a millionth of a beat) and its loop length.

## Compiling a loop

`compileLoop(pattern, { loop, rng, fill?, from? })` (`compile.ts`) returns one pass through the pattern:

- `notes`: as `PhraseNote`s in beats from the loop's start
- `beats`: every step's length, played or not
- `to`: where a Brownian walk stopped

A pattern with probability, conditions or a random direction differs from loop to loop. So the page compiles each loop
before it plays, and the engine swaps it in at the boundary (t-79). The page passes `Math.random` as `rng`; tests pass
`seededRng(seed)`, which repeats.

The rules, in the order they apply, for each slot of the loop:

1. **Part.** `chain[loop % chain.length]`, so `[0, 0, 0, 1]` plays AAAB.
2. **Direction picks the step for the slot.**
   - `forward`, and `reverse`.
   - `pendulum`: forward on even loops, back on odd ones. Each end plays twice in a row, once per pass.
   - `random`: any step, drawn per slot.
   - `brownian`: from the step before, half the time on, a quarter staying, a quarter back, wrapping round. It starts on
     step 1 and carries on from `from` the next loop.
3. **Whether it plays.** A step plays when it is on, has notes, and its `condition` holds. Loops count from 1 here:
   - `ab` plays on loop A of every B.
   - `first`, `notFirst`.
   - `fill` and `notFill` read `fill`.

   Then `probability`, which draws from `rng` only when it is below 1. A pattern with no probability below 1, and a
   direction other than `random` or `brownian`, never touches `rng`.

4. **Each note:**
   1. Transpose, then snap to the nearest note of `scale` from `root` (a tie goes down). A note past either end of
      MIDI takes the scale's last note inside it, not a clamped one that may be off the scale (`placeNote`).
   2. Ratchet: _r_ even hits inside the step, each `min(gate, 1) / r` long.
   3. Nudge, as a share of each hit.
   4. Swing moves odd slots later by `(swing / 50 − 1)` steps: half a step at 75.
   5. A slide holds the last hit until 0.05 steps past the start of the next slot, swung or not, so a mono voice
      glides.
   6. An accent sets the velocity to 1. Otherwise the note keeps its own velocity or none, and the engine's default
      0.85 applies.

Notes come out sorted by start, then by pitch.

## Tools

`tools.ts` holds the tools. Each takes steps (or a pattern) and returns new ones without changing its input, so the
page's Undo is a stack of what they return.

- `euclid` and `euclidFill`: Bjorklund's algorithm, starting on a hit. `euclidFill` turns steps on and off without
  dropping their notes.
  - Most rhythms come out as Toussaint's tables write them: 3 in 8 is `x..x..x.`.
  - A few come out as another rotation of the same rhythm: 4 in 7 is `x.x.x.x` where the tables write `x.xx.x.`.
    `rotate` reaches the tables' form.
- `rotateSteps` and `reverseSteps`.
- `shiftOctave` keeps a note pushed past either end of MIDI an octave inside it, so it stays on the scale.
  `shiftDegree` and `moveByDegree` put a note on the scale first, then move along it, and keep it in MIDI the same
  way.
- `randomise` makes a fresh line on the scale, in a range, at a density, with optional accents and slides.
- `mutate` moves each note one degree with chance _amount_, and mutes or unmutes each step with chance _amount_ / 2.
- `copySteps`, `pasteSteps` (cut off at the end), `clearSteps`.
- `resizePattern` changes every part's length, between 1 and 128.

## Playing a pattern

The engine plays a pattern with its pattern player (`lib/app/synths/audio/pattern-player.ts`, t-79). The player sits
around the synth `createSynth` makes, so a mono, poly or dual synth plays a pattern the same way: the player sends it
notes, and splits each block it renders at the samples where a note falls. With no pattern playing it passes everything
straight through, so riffs (`phrase`), the sound map and the goldens are unchanged.

The page sends it compiled loops:

| Message               | What the player does                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `pattern` (loop, bpm) | Stops any riff or pattern and starts this loop from beat 0                                             |
| `patternNext` (loop)  | Queues the loop after this one, swapped in on the boundary sample. `loop: null` ends the pattern there |
| `patternEdit` (loop)  | Replaces what is still to play of this loop, from the playhead on, and drops any queued loop           |
| `tempo`               | Moves the playhead and the notes to come, as it moves a riff                                           |
| `stopPattern`         | Lets go of every note it holds. A `phrase` or `panic` stops it too, and a `panic` reports `patternEnd` |

- **Nothing queued, the loop plays again.** A page that is late never leaves a gap.
- **A note held past the loop's end** (a slide, a tie) is let go at that point in the next loop. A note ending exactly
  on the boundary is let go on the boundary sample. A riff never lets go of such a note.
- **Two notes of one pitch that overlap** (a slide or a tie into the same note, here or over the boundary) hold the key
  until the later one ends: it is let go once, when the last note holding it ends.
- **An edit keeps the let-go of a note sounding now**, so a note the edit removed doesn't stay held. The edit's own notes
  come in only if they start at the playhead or after.
- **An edit drops the loop queued after this one.** That loop was compiled before the edit and would undo it. With
  nothing queued the edited loop plays again, so the page queues a fresh loop after each edit. A pattern told to end
  still ends.
- **A loop it can't play is ignored**: every note needs a start at or after beat 0, a key, a length above 0 and, if it
  has one, a numeric velocity.
- **A synth changing between mono, poly and dual** gets the pattern's notes let go first, and the next note plays on the
  new one.

The player reports `loop` events: when a loop starts (`start: true`, the page's cue to compile and queue the next) and
when the tempo or an edit moves the playhead. Each carries the loop's `index`, the `beat` and `bpm` from then on, and
the `frame` of the audio context's clock it applies from. The worklet moves its own count onto the context's clock
with `currentFrame`, and the ScriptProcessor fallback with each buffer's `playbackTime`, both worked out again for every
block so a skipped block doesn't shift the playhead.

An event is posted when its audio is rendered, which is before it is heard, so the newest event is not yet the one in
effect. The page pushes each `loop` event into a `createPlayhead()` and reads `at(engine.frame, sampleRate)`, which
uses each event only from its frame on. `engine.frame` is the frame being heard now: the context's time less its own
latency (`baseLatency`) and the output device's (`outputLatency`). `beatAt` reads the beat from one event.
`patternEnd` says the pattern stopped without the page stopping it: it was told to end and has played out, or a
`panic` (which the engine sends on suspend) stopped it.

## The module

The sequencer module sits under the panel on every synth page. The **Sequencer** button on the player bar opens it,
and closes it again: an open toggle on the bar shows a ×.
From `lg` up it is in the dock, between the bar and the piano, and takes the place of the Learn sound design strip
while it is open. Below `lg` it is a docked bottom sheet at half height,
with the panel live above it.

The page owns the pattern through `useSequencer` (`use-sequencer.ts`), so closing the module keeps every edit. The
hook is handed the riff of the sound on the panel and imports it whenever that riff's content changes. Choosing another sound replaces the pattern. If the pattern had been edited, one Undo brings it back. A sound read again with the same riff (a rename, a save)
keeps the edits. A panel tempo control (`SynthDef.tempo`, the TB-303's TEMPO) sets the pattern's tempo as it sets a
riff's. Undo does not count it, and what Undo goes back to takes the knob's tempo too.

**One transport.** With the sequencer open, the bar's Play plays the pattern. In the bottom sheet, which can cover the
bar, the module has a Play button of its own, the same
transport. A pattern starting stops a riff, a riff starting stops the pattern, and Stop stops both. Opening the
sequencer while the riff plays hands over to the pattern. Closing it while the pattern plays leaves it playing, and the bar's Stop stays to stop it.

**Playing.** Play compiles loop 0 and sends `pattern`. Each `loop` event with `start` set compiles the loop after it and
queues it (`patternNext`). A pattern with Loop off queues its end instead. Every loop is compiled from its own seed,
which buys two things:

- The step order the playhead is drawn with is the order the loop was compiled with, random and Brownian included.
- An edit recompiles the loop playing now with the same draws, so a step with a chance doesn't change its mind because
  a different step was edited.

After a start, the hook ignores the engine's events until the new run's loop 0 reports, so a `loop` or
`patternEnd` already on its way from the run before (Stop then Play, or a new sound restarting it) is not taken as this
run's. `compileLoop` hands back the step order it played (`order`), which the playhead is drawn from.

An edit while playing sends `patternEdit` for the loop playing, then queues a fresh next loop. A tempo change sends
`tempo` too. An edit that `PatternSchema` refuses is not made.

**The playhead.** The module reads `position()` once a frame while playing. That pushes the hook's `loop` events
through `createPlayhead` at `engine.frame`, and maps the beat to a slot and the slot to a step through the loop's
order. The keys redraw only when the step changes.

**What is on it:**

- **The readout** (the head). It is one strip of amber cells, as a hardware sequencer's display. First Fill and Loop
  (and Play/Stop in the sheet). Then tempo, swing, length and transpose (sliders), and step size, direction, root and
  scale (selects). Then the parts: **+ B** adds B as a copy of A and chains it `A B`, and once there is a B a select
  picks the chain.
- **Step keys**, sixteen to a page, with a page button for each sixteen past the first. A key's LED is lit when the
  step plays and outlined when it is muted with notes. The key the playhead is on is lit.
- **Following the playhead (t-87).** While the part on show plays, the keys and the mod lanes show the page the
  playhead is on. Only the page on show turns: the chosen step stays where it is, so notes played in (piano, computer
  keyboard, MIDI) and the step tools still land on the step the player picked, even while it is off the page. With it
  off the page, the key in its place is the Tab stop. A page chosen by hand (choosing a step, a page button, the
  arrows) holds until the playhead turns from one page to the next while the part is on show, not until Stop: holding
  to Stop would leave the keys on a page nothing is playing for the rest of a long pattern. Coming onto the part in a
  chain, or Play, is not a turn, so a page chosen before either holds too. A stroke on a mod lane holds the page until
  it ends, so it never runs on into the next page's steps. The keys are keyed by their place on the page, so a key with
  focus keeps it as the page turns. Stopped, the keys go back to the held page, else the chosen step's.
- **Choosing and toggling.** A press chooses a step, and a press on the chosen step turns it on or off. A rest turned on takes the
  note before it.
- **The keys from the keyboard.** The keys are one Tab stop. Left and Right move along the steps and across pages,
  Home and End go to either end, Up and Down move the step's notes a semitone, Enter or Space turns it on or off, and
  Delete makes it a rest.
- **The tool row.** Euclid (with a Hits encoder), rotate left and right, reverse, octave and scale-degree shifts,
  Randomise (on the scale, in the range the part already uses), Mutate, and Undo. Copy step, Copy page, Paste and
  Clear are behind **Edit**, a menu that opens upward and closes on a choice, Escape or a press outside it. Each tool
  works on the part being edited.
- **The step inspector.** On, accent and slide, then ratchet, chance and condition, then a chip per note of the
  chord and the chosen note's pitch, gate, velocity and nudge. It is the same height for every step. A velocity the note does not set shows the default, dimmed.
  **Add note** / **Add to chord** adds up to six notes.
- **Encoders** (`encoder.tsx`) are cells of the readout: a name, the value in amber and a meter along the foot. They
  are sliders. A double press, Enter, or a digit typed makes one a text box: Enter (or leaving it) sets the value
  typed, kept on the cell's step and in its range, and Escape leaves it. A number is read from the text; the Note
  cell reads a name and octave too (`parseNote`: "C#3", "Db3", "E♭4").
- **Selects** (`select.tsx`) open a list drawn in the readout's amber, not the browser's menu. Each is a combobox
  with an active descendant. The list opens upward, or downward where there is no room above.
- **Notes played** on the piano, the computer keyboard or MIDI go on the chosen step while the sequencer is open (in
  **Edit step**, the Keys row's first mode: see [Playing into it](#playing-into-it)). A rest gets the note, and a
  step's first note becomes it. The page hands `noteOn` to `seq.noteIn`, and the module edits the step chosen. Arrows move a step, Page Up and Page Down a big step (an octave for a
  note), and Home and End go to either end. A vertical drag turns one, with a mouse or a finger. One encoder's turn
  is one Undo: edits in one group within 1.2 s are one entry. Undo holds 100.
- **Help.** Every control has the player's tooltip (name and what it does) on hover and focus. The **?** lists them all,
  in two columns, and the list scrolls inside the dialog on a short screen.
- **Layout.** From 900px of module it is one row of two columns, to keep the dock low over the panel. The head, the keys
  and the tools are on the left. The step inspector is on the right at their height, and ? and × are in a rail beside
  it. Up to 1300px the head's controls wrap one by one, so a landscape tablet's head takes two rows, not three.
  Narrower than 900px (the bottom sheet), everything stacks. The keys go eight to a row when the module is narrower
  than 620px. Coarse pointers get 44px targets.

## Playing into it

The **Keys** row under the tool row says what notes played on the piano, the computer keyboard or MIDI do while the
sequencer is open (t-86). The page hands every note to `seq.noteIn` (with a MIDI key's velocity) and every key let go
to `seq.noteOut`. A key let go reaches the sequencer even after it has closed, so an arp key held as it closes is let
go there.

| Keys            | What a note does                                                       | Its controls              |
| --------------- | ---------------------------------------------------------------------- | ------------------------- |
| **Edit step**   | Goes on the chosen step, as above. The default.                        |                           |
| **Step record** | Goes on the chosen step; the step after is chosen once every key is up | Rest, Tie                 |
| **Live record** | While the pattern plays, goes on the step it was played on             | Quantise, Overdub/Replace |
| **Arp**         | Plays through the pattern's steps, and is not sounded by the page      | Order, Octaves, Hold      |

**Velocity.** Step and live record write a MIDI key's velocity (`playedVelocity`, to three places). A note at the
default, 0.85 (the computer keyboard and the piano), is written with none, so it plays as a step does.

### Step record

`record.ts`. The keys down together are the step's chord (`writeChord`: up to six, one of each pitch). It replaces the
step's notes and keeps its other values (accent, slide, ratchet, lanes). It is written as each key goes down, so it
is heard while held, and one step's chord is one Undo. The step after is chosen when the last key comes up, round
from the last step to the first.

- **Rest** makes the chosen step a rest (its lanes kept, as Delete does) and moves on.
- **Tie** holds the notes of the nearest step before it with notes on to the end of the chosen step, and makes that
  step a rest, then moves on. Two ties hold them over two steps. A tie with only rests before it is a rest.

### Live record

The hook does this, because it knows where the playhead is (`createPlayhead` at `engine.frame`, as the playhead is
drawn). A key going down notes the loop, the steps from its start, and the loop's step order and part. Its key coming
up writes the note, with its length (`edit`, so a loop playing is sent again and the note is heard from the next time
round). The page still sounds the key as it is played.

- **Quantise on** (the default): the start goes on the nearest step, by `placeHit`. Past the middle of the last
  step, that is the first step of the part the next loop plays. The length is whole steps, at least one (`liveGate`).
- **Quantise off**: the start goes on the step it falls in, and how late it was is its `nudge` (kept below a whole
  step). The length is as played, at least 0.1 steps.
- Swing is read: a swung step starts late, so a note just before it falls in the step before.
- The step is the one the loop played in that slot (its direction's order), of the part playing.
- **Overdub** (the default) adds the note to the step's notes. A pitch played again takes its own place. A step
  playing six keeps them.
- **Replace** puts the note in place of the step's notes. Notes on the same step in the same loop are a chord, in
  either mode.
- Nothing is recorded while stopped, or for a key still down at Stop. A new run's loops count from 0 again, so a
  step struck in the run before is not part of this run's chord.
- Notes recorded within 1.2 s of each other are one Undo, as an encoder's turn is.

### Arp

`arp.ts`. The keys held play through the pattern's steps, one note a step. Every step that would play (on, with
notes, its condition and chance passing) plays the arp's next note in place of its own, with its first note's gate,
velocity and nudge, and its accent, slide and ratchet: a sequenced arp. A rest is a rest. `compileLoop` takes `arp`
(the notes in order, and where the loop before left off) and returns `arpTo`, so the arp carries on from loop to loop.
It goes through the pattern player like any loop, so nothing is added to the engine, whose own arpeggiator is
poly-only.

- **Order** (`arpSequence`): up, down, up-down (neither end twice in a row: C E G E, round to C), as played (the order
  the keys went down), or random (drawn from the up notes per step, from a stream of its own seeded from the loop's,
  so it moves no step's chance). **Octaves**, 1–4, repeat the notes an octave up each time, leaving out any past the
  top of MIDI.
- The notes go through the pattern's transpose and scale, as a step's do.
- A change to the keys held, the order or the octaves sends the loop playing again (`patternEdit`) from the same
  draws.
- **Starting and stopping.** A key pressed with the pattern stopped starts it, even with Hold keeping keys from before
  a Stop, and the last key let go stops what the press started. Let go before the sound is ready, the run is stopped
  as soon as it starts. A pattern started with Play keeps running, silent, with no keys held.
- **Hold** is the page's Hold, the same one as the keyboard's (`ArpKeys`). With it on, keys let go keep playing. A
  press with every key up starts a fresh set, and one while others are down joins it. Hold turned off keeps only the
  keys still down.
- **The page doesn't sound a key the arp takes.** `noteIn` says so, and the page sends the key no `noteOn`, and no
  `noteOff` when it comes up. The page counts presses per note, so a note held on two inputs (MIDI and the computer
  keyboard) stays in the arp until the last of them lets go.
- **Not saved.** The order and octaves are a way of playing the pattern, not part of it, so `PatternSchema` is
  unchanged. A saved pattern can't hold the keys, so an arp saved in one would play nothing when opened.
- Choosing another mode lets go of the arp's keys, and the steps play their own notes again.

### Tests

`tests/unit/lib/app/sequencer/record.test.ts` (chords, rests, ties, placing a note quantised and not, with swing, the
length, the velocity, overdub and replace); `arp.test.ts` (each order over 1 and 2 octaves, Hold on and off, a loop
compiled with the arp); `tests/unit/components/app/sequencer/play-in.test.tsx` (step record through the module, live
record against the engine's clock, the arp starting, stopping and holding); and the page test that an arp key isn't
sounded by the page.

## My patterns

A pattern is saved to the user's own library, **My patterns**, not to a synth (owner ruling, 2026-10-21). One made on
the TB-303 opens on the Model D as it was. The synth it was made on is kept beside it for the list, and limits nothing.

**Stored** in `user_pattern` (`prisma/schema/app.prisma`): the owner (a hand-written `ON DELETE CASCADE` FK to the user,
pinned by a drift probe), a name, the pattern JSON, its shape version (`PATTERN_VERSION`, beside the JSON so a mapping
can find the rows it owes), and the synth it was made on (not a foreign key). It is on `SYSTEM_MODELS` with no `orgId`,
as a user's sounds are, and is exported as its own section, `patterns`.

**The API** (`app/api/v1/patterns`, `lib/app/patterns/store.ts`) lists, creates, reads, renames or saves over, and
deletes. Every query is keyed on the caller, so another user's pattern is a 404. A pattern is checked with
`PatternSchema` on write and on read. A stored pattern of another shape version, or one that no longer passes, is listed
and kept but has no steps to open (`pattern: null`, with `problems`). No mapping exists yet; the first version change
ships one (D1).

**A sound's default pattern.** `user_sound.patternId` points one of the user's sounds at one of their patterns
(`ON DELETE SET NULL`, so deleting the pattern leaves the sound playing its riff). It is set and cleared with
`PATCH /api/v1/sounds/:id { patternId }`. Another user's pattern is refused (400 on `patternId`) exactly as one that does
not exist. A copy of a sound never carries it. When the sound opens, the page reads the pattern and loads it into the
sequencer after the sound's riff is imported, so it replaces the riff. A pattern the sequencer already holds is not read
again, so pointing the open sound at it keeps the edits.

**In the module**, the patterns strip (`pattern-library.tsx`) sits above the readout:

- The name of what the sequencer holds: the sound's riff, one of My patterns, or a library riff with its synth.
  **edited** marks a change since it was loaded or saved. `useSequencer` tracks it against the pattern as loaded
  (`load`, `markSaved`, `relabel`). The panel's tempo knob does not count as an edit, as it does not count for Undo.
  Undo past an opened pattern names what it brings back as it was named and saved, so Save never writes it over the
  opened one. A save, rename or delete that comes back after another pattern was opened names nothing: `held` says
  which pattern a request was sent for.
- **Save** saves over the pattern held when it is one of theirs. Otherwise it asks for a name and saves a new one.
  **Save as** always saves a new one. **Rename** and **Delete** act on the pattern held when they were pressed. Deleting keeps it in the
  sequencer, saved nowhere, until something else opens. Signed out, the strip has a link to sign in in their place.
- **My patterns** lists the user's patterns, read when it is first opened. One opens in place of what is held, and Undo
  brings that back.
- **Library** lists any synth's library riffs, one synth at a time. It starts on the synth on the panel and reads the
  catalogue's `GET /api/v1/synths/:id`. A riff is imported as `importPhrase` imports the sound's own (no note changes), as
  a starting point saved nowhere.
- **With sound** (with one of the user's sounds open, and a saved pattern held) points the sound at the pattern, or back
  at its riff.

## Mod lanes

A mod lane moves one panel control step by step, as a CV row of a modular sequencer does (Elektron calls them
parameter locks). t-82.

**In the pattern.** `lanes` lists the controls, by id, up to `MAX_LANES` (8). Each step keeps its own values in `mod`
(control id → value), so rotate, reverse, copy and paste carry them with their steps. Randomise, Clear and Delete on
a step make notes or rests, not lanes, and keep them (`keepMods`). A paste drops a clip's values for lanes the pattern
hasn't got (`onlyLanes`), which a clip copied before a lane was removed can carry. `PatternSchema` refuses a step value for a control with no lane, and a control with two lanes. Both
fields are optional, so a pattern saved before lanes reads as it was and `PATTERN_VERSION` stays 1. The pattern knows
no synth, so the schema checks only that a value is a number, a string or a boolean.

**Against the synth** (`lanes.ts`). Only the synth playing a lane knows what its control takes:

- A lane for a control the synth doesn't have is kept, and silent. So is one for its tempo knob, which is the
  pattern's own tempo. The module says so on the lane.
- A value the control can't take (a number for a switch, an option it doesn't have) is ignored on that step.
- A number past either end of the travel is kept inside it.

The pattern is never changed, so a pattern moved between synths loses nothing.

**Compiling.** `compileLoop` also returns `mods`: `[beat, set]` wherever the values change, `set` being the controls
the lanes set from then on, or `null` for none. The first slot always has one, which puts back what the loop before
left set. A lane moves on every slot, whether the step plays or not, and draws nothing from `rng`, so a pattern's
draws are the same with lanes or without. Each change falls on its slot's start, swung, in the step order the loop
plays.

**Playing.** The page turns each set into the voice's settings: `toEngine` of the panel's values with the set in their
place, and the cables, as a knob turned to that value would be (`LaneTarget.paramsFor`, from the same `engineParams` the
panel's own settings come from). A lane can't move the voice between mono, poly and dual (`voiceMode`), which would
let go of every held note on each step it did: a step that would plays the panel's settings. The loop carries them as
`params`, and the pattern player sends each to the synth on its sample, before a note on the same sample. No new DSP
is involved: it is the `params` message a knob turn sends.

- The page's own `params` are the panel's. The player keeps the last as the rest it goes back to: on a slot no lane
  sets, at Stop, when the pattern ends or a `panic` stops it, when an edit takes the lanes away, and at a loop's
  start when its lanes set nothing there (a part of the chain without lanes). A lane plays only once the page has sent
  the panel's settings, which it goes back to.
- A knob turned while a lane holds the synth is kept as the rest and not sent, so it doesn't undo the lane mid-step.
  The page sends the loop playing again (`patternEdit`) whenever the panel moves, so what the lanes leave alone
  follows the knob from the next change on. Only while a lane plays on this synth (or the engine still has a lane's
  settings to take back), and at most once every `LANE_RESEND_MS` (50 ms), since a knob dragged or the mod wheel
  ridden moves the panel every frame. The loop queued after it is compiled from the same seed, so a step with a
  chance doesn't change its mind because the wheel moved.
- An edit applies the settings the edited loop has at the playhead at once.
- No lane the synth can play: no `params`, and the loop plays exactly as one with no lanes.

**On the panel.** While the pattern plays, `seq.modShown` is what the lanes set on the step being heard (read from
the audio clock, as the playhead is). The panel draws those controls at the lanes' values (`SynthPanel`'s `moved`).
Nothing else reads them: which controls show, and what a turn starts from, are the panel's own values. A turn of a
control drawn at a lane's value changes the panel's by as much as it moved, a switch pressed flips the panel's, and a
choice picked is picked (`rebase`). The panel is drawn from its own values again at Stop.

**In the module** (`mod-lanes.tsx`). **Mod** on the tool row shows the lanes under the step keys, on the same grid,
for the page of keys on show. A pattern opened with lanes shows them. One lane shows at a time: a **Lanes** cell of
tabs (as the Part cell's keys) picks it, in one row with **Add lane**, **View all**, the lane's readout and **Clear
all** (every value off the lane in the part being edited). The tab opens by place, so removing the last lane opens
the one before. The open tab carries the lane's remove (×), and a second press on it lists the controls, to move the
lane to another: its values go to the same height on the new control's lane (`carryLaneValue`, through
`retargetLane`'s `carry`), so the shape drawn stays; a lane for a control this synth has not got loses them. **Add
lane** picks a control of the synth on the panel and opens its tab. **View all** (with more than one lane) opens every
lane in a dialog, each drawn as in the module, with its own select (which moves it the same way) and remove. A dashed line marks the panel's value, which a cell
with nothing set plays. In the light theme the module is a light unit with pale windows (the `--lcd-*`, `--key-*`,
`--lane-*` and `--cap` tokens on `.kys-seq`, and on `.kys-seq-skin` for the dialog).

- A press or a drag across the cells sets each to the height it is at, on the control's travel (a log knob by
  ratio, a choice by its drawn options). A stroke is one Undo. A double press clears a cell: its presses and the
  clear are one stroke, so one Undo puts back what the cell held.
- From the keyboard a lane is one Tab stop. Left and Right move along it, Up and Down change the value from the
  panel's (Page Up and Page Down by more; a switch or a choice by one option a press), Home and End go to either end, and Delete clears.
- Hovering or focusing a cell shows its value at the head of the lane.

## Sharing and publishing patterns

A pattern can be private, shared by a link, or published, as a sound can (t-83, owner ruling: patterns too). The rules
are sounds' ([`sharing.md`](./sharing.md)), re-derived for a pattern in `lib/app/patterns/sharing.ts`, `public.ts`,
`reports.ts` and `moderation.ts`. Where a sound's reason didn't carry over, the rule changed, and this section says why.

### Anti-patterns first

- **Don't write `visibility: 'published'` outside `publishUserPattern`.** The PATCH takes `private` and `link` only.
- **Don't keep a copy's credit.** It is read through `sourceUserPatternId` on every read (`sharedPatternSourcesOf`),
  never stored, so it cannot outlive the erasure of the user it names.
- **Don't read a shared pattern for anyone else without `unlistedAt: null`.** An unlisted pattern keeps its
  visibility. Every public read, the credit, the copy source and the report route filter on it.
- **Don't put the owner's id, the row's id or the source's id in a public read.** `getSharedPattern` is the only one.
- **Don't save a shared pattern through the sequencer's own Save.** It would keep no credit. While the page's shared
  pattern is held and it isn't the visitor's own, Save and Save as give way to the strip's Save a copy (`sharedHeld`).
  Its owner keeps Save. A sound of the visitor's that plays a pattern by default doesn't replace it either.

### What carried over, and what didn't

| Rule                           | For a pattern                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| The slug                       | The same: ten characters, minted the first time it leaves private, kept after (`visibilityData`, `withFreshSlug`).                            |
| The owner's lock               | The same lock as their sounds (`lockOwnersSounds`, their user row), around every change and publish.                                          |
| Publishing needs a username    | The same, `USERNAME_REQUIRED` (409): a published pattern is listed under it.                                                                  |
| The byline                     | The same: always on a published pattern, on a link share only when the owner's profile is public.                                             |
| The word check                 | The name only. A pattern has no notes and no lesson. At publish, and on a rename of a published pattern.                                      |
| "Plays the same" (`DUPLICATE`) | The pattern itself, key by key (`patternKey`), against the shared pattern it was copied from. Exact, because a pattern is discrete.           |
| Tags                           | None. A sound's tags are its synth's library's, and a pattern has no synth.                                                                   |
| The daily cap                  | Ten first publications a day, counted in a list of its own (`SynthProfile.recentPatternPublishes`), so patterns don't spend the day's sounds. |
| `NOT_PLAYABLE`                 | A pattern saved as a shape version the sequencer no longer reads, or one that no longer passes `PatternSchema`.                               |
| Reports and unlisting          | The same queue, reasons, statuses and actions, in a table of their own (`PatternReport`), on `/admin/synths/reports?kind=patterns`.           |

**Not caught:** a library riff opened in the sequencer and published unchanged. A pattern doesn't record the riff it was
opened from (t-81), and the riff is the app's own, credited to nobody here. If that changes, the riff needs recording
on the pattern first.

### Copies

`POST /api/v1/patterns` with `source: { shared: <slug> }`: a new private pattern for the caller, from any link or
published pattern. With no name or steps sent, it takes the shared pattern's. A source that is private, unlisted or
unknown is a 400 on `source.shared`. A copy of your own records no source. `basedOn` on the owner's reads and the
public read is `{ name, username, slug }` while the source is published, not unlisted, and its owner has a username.

### The public pattern page

A pattern belongs to no synth, so its page is the synth page of whichever synth the visitor plays it on:

- **`/patterns/<slug>`** is the address its owner copies. It sends the visitor to the pattern on the synth it was made
  on, or the catalogue's first synth when that one isn't served (`patternHomeSynth`).
- **`/synths/<id>/p/<slug>`** is the synth page with the pattern in the sequencer, which opens with it. It renders
  signed out, and Play plays it. The strip above the panel (`shared-pattern-strip.tsx`) has the name, byline and
  credit, **Play it on** (another synth's page for the same pattern), and Save a copy, Sign in to save a copy, Report,
  or Open it to edit, by who is looking. Who it belongs to comes from the visitor's own patterns list, as for a sound.
- **The sequencer is there for the pattern.** On this page the sound's riff isn't loaded into it (`riff: null`), so
  choosing a sound changes the panel and leaves the pattern. Load it again puts it back after anything else is opened.
- **Metadata:** a link share is `noindex`. A published pattern is canonical at its home synth's page, from every synth's
  page for it. The sitemap lists that address.
- No social card of its own yet: the site's default card is used.

### Explore, profiles and the sitemap

`/explore/patterns` (`GET /api/v1/public/patterns?sort=&page=`) lists published patterns, newest or most saved, 24 a
page. It has no synth filter: a pattern plays on any synth. Explore's two pages have tabs between them. A profile lists
the user's published patterns under its sounds. The sitemap adds `/explore/patterns` and every published pattern.

### In the module

**Share** in the patterns strip (`pattern-sharing.tsx`) acts on the saved pattern held, as last saved: Share with a
link, Copy link, Publish… (who it appears as, and the "I made this" tick), Unpublish and Stop sharing. With no username
the one step is Choose a username. An unlisted pattern says so and offers only Stop sharing. My patterns says each shared
pattern's state.

### Erasure and export

Erasing a user deletes their patterns and the reports about them. Other people's copies stay, with no credit. Reports
they filed or resolved stay, with the id nulled. The export's `patterns` section carries `visibility`, `slug`,
`publishedAt` and `unlistedAt`, never `sourceUserPatternId`. `patternReportsFiled` is the reports they filed, each
pattern named by its address. The profile section carries `recentPatternPublishes`.

### Tests

`tests/unit/app/api/v1/patterns/sharing.test.ts` (visibility and the slug, each publish refusal, copies and the live
credit, the public read, reports, unlist and restore across every public read);
`tests/unit/app/panel/shared-pattern-page.test.tsx` (both pages, their 404s and metadata);
`tests/unit/components/app/sequencer/synth-page-shared-pattern.test.tsx` (the page opens and plays the pattern signed
out, keeps it when a sound is chosen, Play it on, Save a copy and the owner's view); the sitemap, export and profile
tests.

## The tutor's patterns

The tutor reads the pattern the module holds and proposes a new one or an edit to it (t-84,
[`tutor.md`](./tutor.md#patterns)). The page sends the pattern with each turn. An edit the learner applies goes
through `edit`, as any edit in the module does, so the module's Undo takes it back and Save saves it as the pattern it
was loaded as. A new pattern goes through `load` as a library riff does, unsaved and named "Tutor’s pattern", at the
tempo knob's tempo. `edit` and `load` return the pattern now held (null when refused or, for `edit`, unchanged), and
the tutor's Undo is the module's `undo`. From `lg` up applying it opens the module.

## The sequencer synths' own buttons

On the TB-303, TD-3 and Donner B1 the panel's sequencer buttons drive this sequencer (t-85). A definition maps its
buttons with `SynthDef.seqButtons` (control id → what it does, `SeqButton` in `contract.ts`). The page routes a press
(`seqButtonFor`, `components/app/sequencer/panel-buttons.ts`) and draws the panel with `seqLamps` over its values.

| Does               | TB-303 / TD-3                         | Donner B1                         |
| ------------------ | ------------------------------------- | --------------------------------- |
| Start and stop     | RUN/STOP (START/STOP)                 | PLAY/STOP                         |
| Choose a step      | BACK, WRITE/NEXT                      | ▼, ▲, a white key                 |
| Turn a step on/off | TIME MODE                             | a white key, again                |
| A note on a step   | the 13 keys (then the next step)      |                                   |
| Octave of a step   | TRANSPOSE DOWN, UP                    |                                   |
| Mark a step        | ACCENT, SLIDE                         | ACCENT, SLIDE, RATCHET            |
| Rest, clear        | PATTERN CLEAR (CLEAR) clears the part | CLEAR/REST: a rest, then the next |
| How keys play in   |                                       | ARP, REC/EDIT (step record), HOLD |

- **A press the sequencer takes leaves the button's own value alone.** Its lamp shows what it drives: RUN while the
  pattern or the riff plays, ARP, REC and HOLD while they are on, and with the module open the chosen step's marks, the
  303 key of its note and each B1 step key while its step plays. A C lights both of the 303's C keys: the step holds
  only the note, the top of one octave of keys as much as the bottom of the next. The page keeps the panel's values
  while no lamp changes, so editing the pattern does not redraw the panel.
- **RUN/STOP is the bar's Play and Stop**: it stops whatever is playing, riff or pattern, and otherwise runs the
  pattern, without opening the module. HOLD is the page's Hold. ARP and REC/EDIT set the key mode, and turned off hand
  back the mode each was turned on from. Every other button works in the module: pressed while it is closed, it only
  opens it (handing over from a riff playing, as opening it does), and edits no step the player cannot see.
- **The step buttons are the module's** (`seq.panelIn`). The module registers a handler once (`onPanelIn`) and tells
  the page its chosen step and page (`showChosen`) for the lamps. Presses land where notes do (`recAt`), which each
  move moves on at once, so two presses before a redraw go on two steps. A key held on a panel button is one press:
  its repeats are ignored. A 303 key past the top of MIDI folds down an octave, as TRANSPOSE does. The B1's step keys
  are the keys of the page on show.
- **A button that changes the sound is the sequencer's only while it is open.** The 303's and B1's ACCENT and SLIDE
  are not `ui`: with the module closed they accent or slide every note played, as before; open, they mark the chosen
  step. A live accent left lit stays in the sound while the module is open.
- **Not mapped**, with help that says so: MODE, TRACK, PITCH MODE and FUNCTION on the 303 and TD-3; TEMPO TAP, OCT,
  PATTERN, SAVE and GATE LENGTH on the B1, and its black keys.
- `scripts/check-synths.ts` leaves `help` and `seqButtons` out of its comparison with the prototype. The app rewrites
  what a control's help says about the app, and neither changes the sound. The goldens still hold each synth to the
  prototype's sound.

Tests: `tests/unit/components/app/sequencer/panel-buttons.test.ts` (the maps name real buttons, which presses are
taken, the lamps), and `synth-page-panel-buttons.test.tsx` (each synth's buttons through the page).
