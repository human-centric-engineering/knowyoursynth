# Sounds played by their mod lanes

`f-lane-sounds` (t-300, t-301), and the wheel (`f-performance-wheels` t-312). A **lane sound** is a library sound whose default pattern is a whole song: a chained
A/B pattern with one or two mod lanes that play the controls its lesson teaches. Play plays it whole (t-300,
[a default may carry both](./pattern-library.md#a-sounds-riff-is-its-default-pattern)).

This page is the template for writing a set for **any synth**: how one is designed, and the rule that a person could
play its lanes by hand. The same kit writes new songs for sounds already in the library, lanes optional
(`buildSong`, t-304: [pattern-library.md](./pattern-library.md#composed-batches-livelier-songs-for-sounds-already-in-the-library)). The Model D's thirty (`scripts/app/sounds/model-d/lane-sounds.ts`) are the worked example.
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
has at most two. A knob's travel is how far it turns, so a log-taper knob is measured by ratio. Time is the song's own: swing starts every second step late, as the compiler plays a lane's change, so a move into a late step has longer and a move out of it less. A swung sound's jabs need to be smaller than the table below says. The song is read as it
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
| An accent that rolls across the beat         | The LFO at the cross-rhythm's rate, sent to the filter; the lane rides the mod wheel  | Glass Arpeggio, Contour Marimba       |
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
  says so ("FILTER DECAY stays at 3: the lane rides it"). A wheel's lane is the same, said of the knob the wheel adds
  to ("MOD DEPTH stays at 0: the wheel brings it in"), and the lesson never sets the wheel
  ([Performance inputs](#performance-inputs-a-lane-on-the-wheel)).
- **The song** is two parts of 32 sixteenths (or 1/8 steps for slow ones), chained so both play (`AAAB`, `ABAB`,
  `AABB`). The riff the sound stores is part A's first loop, so it must pass `riffProblem`: forward or reverse, no
  chance or conditions, no rests after part A's last note.
- **One or two lanes**, each moving a control the lesson's last section suggests turning. Each lane's control is in
  `context` (what the lane does with it) and has a `laneTweak` (what to redraw, and what you hear).
- **The words match the lanes.** `how`, `context`, the tweaks and the pattern's `notes` each describe what the lanes
  do. Change a lane and change all four.
- **Credits** follow the library's rule: no person's name. `artist` is the genre or tradition, the pattern is _In the
  style of_ it, with no lead (owner ruling, 2026-11-02).

## Performance inputs: a lane on the wheel

`f-performance-wheels` t-312. A synth that declares a performance wheel (`SynthDef.performance`,
[`sequencer.md`](./sequencer.md), Performance wheels) offers it as a lane by a reserved id: `@wheel` for the mod
wheel. Where a lane rides the modulation a player brings in while playing, the wheel is the control a player would
use, and the lane goes on it.

### When it is the wheel's job

A lane that brings modulation in and out as the music goes is the wheel's: vibrato swelling on held notes, how deep
a wobble goes, how much FM, a filter's wah brought in after the first bar. A knob that is set for a section and left
(an LFO's rate, a waveform, a filter's cutoff) stays a knob. On the Model D that split is MOD DEPTH and the mod
wheel: the knob sets a depth that stays, the wheel adds to it as the player pushes.

Twelve of the Model D's thirty lane sounds, and one of its livelier songs (Tenor Sax Lead), rode MOD DEPTH for vibrato or
wobble. They now ride the wheel. Their other lane stays.

### Moving a knob's lane onto the wheel

The wheel's lane must play what the knob's did, read from how the synth's `toEngine()` combines the two. The Model D
adds the wheel to the depth MOD DEPTH gives, (d ÷ 10)², so a MOD DEPTH lane at d is the wheel at (d ÷ 10)² with the
knob at 0 (`onWheel` in `model-d/lane-sounds.ts`). The lesson then sets the knob to 0, and a lesson that had it up
(Rate-Step Wobble Bass's MOD DEPTH 5) changes its finished panel: re-record that sound's check baseline entry. A library sound whose lesson keeps the
knob up (Tenor Sax Lead's 0.8) passes that position as `onWheel(lane, 0.8)`: the wheel makes up only the rest, and a
position below the panel's rests the wheel, since it can only add. Another
synth's wheel may scale a knob's amount rather than add to it, so read its `toEngine()` before converting.

### What the kit does with it

- **The hand check** reads the wheel's lane as it reads a knob's, from the wheel at rest (down): a step the lane
  leaves alone is the wheel down. **One hand on the wheel is advised, not enforced** (owner ruling, t-312): a sound
  may ride the wheel and a knob, as a player does with one hand on the wheel and one on the panel.
- **Its values keep four decimals.** The wheel runs 0 to 1 where a knob runs 0 to 10, and on the Model D it stands
  for a squared MOD DEPTH, (d / 10)², so the small values carry most of a vibrato: at three decimals depths 0.4 to
  0.47 all land on 0.002, and a smooth swell becomes a staircase. On the Model D the wheel at full moves the pitch
  14 semitones, so a hundredth would step vibrato in 14-cent jumps.
- **The lesson never sets it.** It is no panel control, so `validatePreset` would refuse it: `writeLaneSounds`
  refuses a step that sets one, by name.
- **The words are checked** (`wheelWordsProblems`): the `how` names the mod wheel, a step says the wheel brings the
  modulation in, a tweak says to redraw the mod wheel lane, and nothing still calls it the depth lane. A tweak and
  `context` point at panel controls, so they name the knob the wheel adds to (`mod.depth`) and say the wheel in
  words. A tweak is about the wheel's lane when its `try` says to move the mod wheel (`tweakNamesLane`); the seed test
  reads it the same way.
- **Readouts and records** name it "Mod wheel" (`laneReadout`) and "the mod wheel" in a batch's research
  (`laneInWords`).
- **Riding it along** comes free (t-311): any pattern with a wheel lane the synth plays offers Ride the wheel, the
  lane shown as a ghost for the learner to follow ([`sequencer.md`](./sequencer.md), Riding the wheel). Nothing per
  synth or per sound, so a wheel song is written to be ridden: moves a hand can follow, not one-step jumps.

### The Model D's ten

`scripts/app/sounds/model-d/wheel-sounds.ts`, written by `write-lane-sounds.ts` as the batch
`t312-model-d-wheel-sounds.json` beside t-301's. Each is a different musical use of the wheel, and its notes are a
line one hand could play:

| Sound                | What the wheel brings in                                                  | Other lane      |
| -------------------- | ------------------------------------------------------------------------- | --------------- |
| Delayed Vibrato Lead | Vibrato, two steps into each long note                                    |                 |
| Square-Wave Trill    | A square LFO on the pitch: a trill, as wide as the wheel is pushed        |                 |
| Wheel Wah Bass       | A beat-synced LFO on the filter, ridden like a wah pedal                  |                 |
| Noise Growl Bass     | Noise (source B) on the filter: a growl on the held notes                 | CUTOFF          |
| Contour Pitch Zap    | The filter contour (source A) on the pitch: each note fires down          | Filter DECAY    |
| FM Clang Build       | Oscillator 3 at audio rate on the pitch, rising through the whole song    | Osc 3 FREQUENCY |
| Wheel Bell Strike    | Inharmonic FM on each phrase's first strike                               |                 |
| Seasick Breakdown    | A slow LFO on the pitch, rising through the breakdown                     |                 |
| Siren Riser          | Oscillator 3 off the keyboard as a slow wave on the pitch: a siren        |                 |
| Filter-Vibrato Funk  | A vibrato-rate LFO on the filter, not the pitch: tone throbs, pitch holds | EMPHASIS        |

**Check the wheel's facts on the synth.** The Model D's LFO swings both ways from the key, so the trill's notes are
written between the two it plays. Its wheel goes where MOD MIX and the modulation switches send MOD DEPTH, so each
lesson sets those up before the wheel comes in; `wheelReach` (`lib/app/synths/lib/routing.ts`) says where that is.

### A wheel set for another synth

1. Read its `toEngine()` for where `ctx.wheel` goes and how it meets the panel's knobs.
2. Look through its lane sounds for lanes that are the wheel's job, and move them as above.
3. Write its wheel sounds as the Model D's are, from what its wheel reaches: a wheel that only does vibrato has
   fewer uses than one that reaches the filter and the oscillators.

## A set for another synth

1. **Copy the Model D's files** into `scripts/app/sounds/<synth>/`: `lane-sounds.ts` (its `READOUTS`, the
   panel's names for its controls, and the specs), `wheel-sounds.ts` if it has a wheel, and `write-lane-sounds.ts`
   (the paths, the slug, and each set's batch and task).
2. **Read the synth's facts** against [Where the fast part goes instead](#where-the-fast-part-goes-instead): velocity,
   keyboard tracking, its LFO's routing and range, envelope shape, a sequencer of its own
   ([`sequencer-synths.md`](./sequencer-synths.md)).
3. **Write the specs** from the shapes above. Run the writer: it refuses every lane a hand could not play, and says
   where.
4. **Add the batch's task** to `composed` in `library-researched.test.ts`, so the seed test checks it, and the new
   sounds to the check baseline (`npm run check:synths -- <synth> --add-sounds`).
5. **Seed**: `npm run db:seed` applies the changed catalogue and library units.
