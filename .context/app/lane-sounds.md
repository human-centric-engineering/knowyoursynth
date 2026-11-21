# Sounds played by their mod lanes

`f-lane-sounds` (t-300, t-301). A **lane sound** is a library sound whose default pattern is a whole song: a chained
A/B pattern with one or two mod lanes that play the controls its lesson teaches. Play plays it whole (t-300,
[a default may carry both](./pattern-library.md#a-sounds-riff-is-its-default-pattern)).

This page is the template for writing a set for **any synth**: how one is designed, and the rule that a person could
play its lanes by hand. The Model D's thirty (`scripts/app/sounds/model-d/lane-sounds.ts`) are the worked example.
How the batch reaches the seed, and what the seed checks, is in
[`pattern-library.md`](./pattern-library.md#composed-batches-sounds-played-by-their-lanes).

## Anti-patterns first

These are the mistakes the Model D's first draft made, 23 of 30 sounds. Each now fails the build.

- **A lane that sets a value on every note, or every step.** That is what a sequencer's per-step settings do, and no
  hand can. A cutoff jabbed open on each note, an emphasis up on every high octave, a decay flicked long and short
  on every sixteenth, a waveform switched inside every note: all were in the draft, and none is playable.
- **A lane that jumps back to the panel between notes.** A step the lane leaves alone (`null`) plays at the panel's
  value, so a lane set "on the notes only" turns the knob back and forth on every rest. Set the rests too.
- **A cross-rhythm drawn into a lane**: a cutoff in threes against the arpeggio's fours. The rolling accent is real
  synth practice, but it comes from an LFO, not a hand (below).
- **The loop's seam left out.** The song loops. Its last step back to its first, and B back into A, are moves too: a
  build that ends bright and starts dark again is a jump the hand has to make in one step.

## The hand limits

Owner ruling, 2026-11-21 ("loose": a quick, practised player). In `HAND_LIMITS`, `lib/app/sequencer/hands.ts`:

| Limit                        | Value                 | In practice                                                      |
| ---------------------------- | --------------------- | ---------------------------------------------------------------- |
| A knob's fastest full sweep  | 0.3 s (`sweepS`)      | One step to the next covers at most `step ÷ 0.3 s` of its travel |
| A knob's turns back          | 3 a second            | A back-and-forth no faster than 1.5 times a second               |
| A switch or selector's flips | 0.2 s apart (`flipS`) | At least two sixteenths apart at 120 bpm                         |
| A wobble that is no turn     | 3% of travel          | A steady hand's unsteadiness                                     |

The model is **one hand per lane, with the sequencer playing the notes**: two lanes are two hands, so a lane sound
has at most two. A knob's travel is how far it turns, so a log-taper knob is measured by ratio. The song is read as it
loops: the chain, then back to its start.

The numbers to keep in your head, a sixteenth at the tempo:

| bpm | A step | Most of the travel in one step | Shortest wave, full travel | Shortest wave, any size |
| --- | ------ | ------------------------------ | -------------------------- | ----------------------- |
| 90  | 0.17 s | 56%                            | 6 steps                    | 4 steps                 |
| 120 | 0.13 s | 42%                            | 8 steps                    | 6 steps                 |
| 140 | 0.11 s | 36%                            | 9 steps                    | 7 steps                 |

A wave turns twice a cycle, so three turns a second means a period of at least two thirds of a second. A full-travel
sine also moves fastest at its middle, about `π ÷ period` of its travel a step, which sets the longer of the two.

### Where it is enforced

- **The writer refuses it.** `checkHands` (`scripts/app/sounds/lane-kit.ts`) reads each finished sound's lanes against
  the panel its lesson sets, and a synth's writer throws with every problem, named by part and step (`filter.cutoff:
turns back 6 times in the second from A1`). Nothing is written until all pass.
- **The seed data is tested.** `library-researched.test.ts` runs `handProblems` over every composed batch, so a
  hand-edited batch, or another synth's, is held to the same rule.

## What a hand can play

The shapes in `lane-kit.ts` that make playable lanes, each a function of the step:

- **`ramp(a, b)`**: one turn across a part. Two of them, A up and B down, make a song-long build and release with no
  jump at the seam.
- **`wave(lo, hi, period, phase)`**: a slow sweep. Keep the period above the table's minimum.
- **`moves({ step: value, … })`**: a hand moving between positions in straight lines. The usual shape for a swell on
  the long notes (`{ 12: 0, 15: 1.8, 17: 0 }`), or a rise into a section.
- **`holds({ step: value })`**: a knob or switch set at a step and left. Right for a change of section, an interval
  retuned in the gap before the next chord, or a waveform for the chorus.
- **A jab on a phrase's first note**: up for one step and back, at most a couple of times a bar, and no further than
  one step's worth of travel (`c.accent ? 7 : 3.5`).
- **A switch a beat at a time**: one click to its neighbour on each beat, never inside a sixteenth's reach of the
  last.

## Where the fast part goes instead

When a sound's idea is a per-step change, keep the sound and move the change to where a real player would put it.
The lanes then ride it slowly. Each of these is one of the Model D's thirty:

| The idea                                     | Where it goes                                                                         | Model D example                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| A brighter or squelchier note on the accents | The envelope, on every note; the lane rides its size slowly                           | Dub Pressure, Night Drive             |
| A note brighter because it is higher         | Keyboard control (filter tracking)                                                    | Italo Octaves, Electro Zap            |
| An accent that rolls across the beat         | The LFO at the cross-rhythm's rate, sent to the filter; the lane rides MOD DEPTH      | Glass Arpeggio, Contour Marimba       |
| A gate rhythm (long and short sixteenths)    | The notes' gate lengths, with sustain up and the release off                          | Gated Trance Pulse                    |
| Octave leaps                                 | The notes; the RANGE switches move per half bar                                       | Octave-Leap Electro                   |
| A drum kit on one voice                      | The notes, through a key-tracking filter: low notes dark (kick), high open (hats)     | One-Voice Drum Kit                    |
| A vowel shaped inside every note             | The filter envelope; the lane changes its ATTACK between parts                        | Talking Emphasis Bass                 |
| A puff of breath on every note               | A quick filter-envelope rise does the tonguing; the noise lane is the phrase's breath | Breath-Lane Flute                     |
| A waveform switched in every note            | Switched in each phrase's long note only                                              | Wave-Switch Lead, Pulse-Width Shuffle |

**Check the synth's own facts first.** The Model D has no velocity, so an accent changes nothing on it: a sequencer's
accent cannot carry what a lane did. A synth with velocity, an envelope with a different shape, or a sequencer of its
own changes which of these routes exist.

## The design of one

Each sound is a lesson, as every library sound is (`lesson-writer.ts`), and a song:

- **The lesson** builds the patch a step at a time. A control a lane plays is left at a resting value, and the step
  says so ("MOD DEPTH stays at 0: the lane raises it").
- **The song** is two parts of 32 sixteenths (or 1/8 steps for slow ones), chained so both play (`AAAB`, `ABAB`,
  `AABB`). The riff the sound stores is part A's first loop, so it must pass `riffProblem`: forward or reverse, no
  chance or conditions, no rests after part A's last note.
- **One or two lanes**, each moving a control the lesson's last section suggests turning. Each lane's control is in
  `context` (what the lane does with it) and has a `laneTweak` (what to redraw, and what you hear).
- **The words match the lanes.** `how`, `context`, the tweaks and the pattern's `notes` each describe what the lanes
  do. Change a lane and change all four.
- **Credits** follow the library's rule: no person's name. `artist` is the genre or tradition, the pattern is _In the
  style of_ it, with no lead (owner ruling, 2026-11-02).

## A set for another synth

1. **Copy the Model D's two files** into `scripts/app/sounds/<synth>/`: `lane-sounds.ts` (its `READOUTS`, the
   panel's names for its controls, and the specs) and `write-lane-sounds.ts` (the paths, the slug and the batch's
   task).
2. **Read the synth's facts** against [Where the fast part goes instead](#where-the-fast-part-goes-instead): velocity,
   keyboard tracking, its LFO's routing and range, envelope shape, a sequencer of its own
   ([`sequencer-synths.md`](./sequencer-synths.md)).
3. **Write the specs** from the shapes above. Run the writer: it refuses every lane a hand could not play, and says
   where.
4. **Add the batch's task** to `composed` in `library-researched.test.ts`, so the seed test checks it, and the new
   sounds to the check baseline (`npm run check:synths -- <synth> --add-sounds`).
5. **Seed**: `npm run db:seed` applies the changed catalogue and library units.
