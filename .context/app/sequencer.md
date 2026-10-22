# The pattern sequencer

One sequencer works on every synth. You edit a riff step by step, starting from any riff in the library, and play it
on whichever synth is open (`f-step-sequencer`, §21). This page covers the pattern model under it:
`lib/app/sequencer/`, from t-78, and the engine's pattern player, from t-79. The module on the page, saving and sharing come in later tasks of §21, and each adds
its section here.

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
| Step    | `on`, `notes` (0–6: none is a rest, several a chord), `accent`, `slide`, `ratchet` 1–4, `probability` 0–1, `condition`                                           |
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

## Not yet

Coming in later tasks of §21:

- Mod lanes, per-step values for panel controls (t-82). They add an optional field to the pattern.
- Saving (t-81) and sharing (t-83).
