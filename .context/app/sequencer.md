# The pattern sequencer

One sequencer works on every synth. You edit a riff step by step, starting from any riff in the library, and play it
on whichever synth is open (`f-step-sequencer`, §21). This page covers the pattern model under it:
`lib/app/sequencer/`, from t-78. The module on the page, saving and sharing come in later tasks of §21, and each adds
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
| Note    | `note` 0–127, `gate` in steps (past 1 it ties over), `velocity` 0–1, `nudge` 0 to just under 1 step                                                              |

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

The result is one part, forward, straight, chromatic, at the riff's tempo. A riff too long for any step size is refused
(`RangeError`), not cut. None in the library are.

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

   Then `probability`, which draws from `rng` only when it is below 1. A pattern with no probability or random
   direction never touches `rng`.

4. **Each note:**
   1. Transpose, then snap to the nearest note of `scale` from `root` (a tie goes down), then clamp to MIDI.
   2. Ratchet: _r_ even hits inside the step, each `min(gate, 1) / r` long.
   3. Nudge, as a share of each hit.
   4. Swing moves odd slots later by `(swing / 50 − 1)` steps: half a step at 75.
   5. A slide holds the last hit until 0.05 steps past the start of the next step, so a mono voice glides.
   6. An accent sets the velocity to 1. Otherwise the note keeps its own velocity or none, and the engine's default
      0.85 applies.

Notes come out sorted by start, then by pitch.

## Tools

`tools.ts` holds the tools. Each takes steps (or a pattern) and returns new ones without changing its input, so the
page's Undo is a stack of what they return.

- `euclid` and `euclidFill`: Bjorklund's algorithm, in the form Toussaint's tables write. 3 in 8 is `x..x..x.`, and
  `euclidFill` turns steps on and off without dropping their notes.
- `rotateSteps` and `reverseSteps`.
- `shiftOctave` clamps at the ends of MIDI. `shiftDegree` and `moveByDegree` put a note on the scale first, then move
  along it.
- `randomise` makes a fresh line on the scale, in a range, at a density, with optional accents and slides.
- `mutate` moves each note one degree with chance _amount_, and mutes or unmutes each step with chance _amount_ / 2.
- `copySteps`, `pasteSteps` (cut off at the end), `clearSteps`.
- `resizePattern` changes every part's length, between 1 and 128.

## Not yet

Coming in later tasks of §21:

- Mod lanes, per-step values for panel controls (t-82). They add an optional field to the pattern.
- Playing a loop in the engine (t-79).
- Saving (t-81) and sharing (t-83).
