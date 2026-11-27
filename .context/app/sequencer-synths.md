# Sequencer synths: when the synth's own sequencer plays

`f-own-sequencer`. Some synths carry a sequencer of their own in their engine: the Subharmonicon's two 4-step
sequencers and four rhythm generators first, and in time the 960 on the modulars, the Easel's sequential voltage
source and any other a definition models. A sound on one of them is mostly that sequencer playing. Treating such a
synth as a keyboard with a riff on top gives weak sounds: the riff fights the sequencer, the sequence free-runs at a
tempo nothing else knows, and Stop does not stop it.

This page is the paradigm: how the app plays such a synth, and how to design its sounds. The app's own pattern
sequencer is [`sequencer.md`](./sequencer.md); the sound format is [`synths.md`](./synths.md#sounds).

## The app's transport is the master clock

On the hardware a MIDI clock overrides the Subharmonicon's TEMPO and its CLOCK input, at four clocks to a beat, and
MIDI notes transpose a running sequence (firmware 1.1.0). The app does the same, with its transport as the MIDI
clock:

- **Whatever plays the riff or a pattern sends the clock**: `{ type: 'clock', at: 'start' | 'pulse' | 'stop' }`
  (`SynthMessage`), pulses at `CLOCK_PPQ` (24) a beat counted from the run's first beat. The page's pattern player
  sends it while the synth's settings carry `follow` (`pattern-player.ts`): start on the loop's first sample, after
  the count-in, then each pulse on its own sample before the notes there, and stop when the pattern stops or is
  muted. The voice's own riff player sends it to the Subharmonicon and to a 960 that follows (`dsp-core.ts`), so
  the synth check, the goldens and a lesson's Replay hear what the page plays.
- **The core counts the pulses down to its own clock** (or locks its own rate to the beat: below): the Subharmonicon's is every sixth (`SUBHARM_PPQ` 4, a
  sixteenth each). Start brings the sequencers and rhythm generators back to step 1 and the downbeat and runs them
  if PLAY is lit; Stop stops them. Lighting PLAY inside a run starts them on the next clock.
- **`follow`**: the definition's `toEngine()` sets `EngineParams.follow`, so a lit PLAY waits for the clock rather
  than running at TEMPO. A sound loading never starts a sequence on its own; the bar's Play does, counted in, in
  time with the drums and the metronome, and Stop stops it. On the page, lighting PLAY while nothing plays presses
  Play (`SynthDef.ownSequencer.run`).
- **The tempo control is the app's tempo** (`SynthDef.tempo` with `tempoMap`, `lib/app/synths/lib/tempo.ts`). The
  Subharmonicon's TEMPO reads in its own clocks a minute and in the app's BPM, a quarter of that; a sound's riff
  sets it from its BPM, and turning it moves the bar's tempo, as the TB-303's does.

What is the app's, where the manual is silent: the riff and pattern players reset the sequencers at every start (a
MIDI Start), and while the sequencers run a key never holds the envelopes open, and fires them only with EG off.

## Two ways to follow: counting pulses, or locking to the beat

A core follows the clock in one of two ways. Choose by what the hardware's own clock control is.

|                              | Pulse counting                                                                                 | Beat locking                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Fits**                     | A clock control that is a tempo, and hardware that takes MIDI clock: the Subharmonicon's TEMPO | A free-running oscillator with no tempo on it: the 960's FREQUENCY RANGE and VERNIER, the Easel's and the Solar 42N's pulsers  |
| **How**                      | The core takes every n-th of the 24 pulses as its own clock (`SUBHARM_PPQ` 4: every sixth)     | The core keeps its own rate as a request, and each step lasts the nearest whole division of the beat, measured from the pulses |
| **The panel's rate control** | The app's tempo (`SynthDef.tempo`, `tempoMap`)                                                 | How many steps a beat; the tempo is the bar's                                                                                  |
| **Code**                     | The core's own `clock()`                                                                       | `audio/beat-lock.ts`: `createBeatLock`, `snapStep`, `snapStage`                                                                |

**Beat locking** (t-291, the System 55's 960; the Easel and Solar 42N reuse it). While the sound follows:

- **Start** puts the sequencer on stage 1 at the run's first beat; **Stop** holds it where it is, and its clock
  output goes quiet.
- **Its rate snaps** to a whole number of steps a beat (1 to 24), or below one a beat to a whole number of beats a
  step. The rate the knobs set is read again at each step, so a control voltage on the clock moves it in whole
  divisions. A near miss (3.97 steps a beat) becomes exact and never drifts against the drums.
- **A rate that changes stage by stage** (the 960's row C timing) snaps each stage to whole pulses, a 24th of a beat,
  so a gallop's long and short stages keep their ratio, tightened to the beat.
- **A STOP stage holds until the next Start**; the beat keeps counting meanwhile, so the next start, or OSC ON, finds
  it.
- **A clock faster than `LOCK_MAX_HZ` (20 Hz) is an oscillator**, not a tempo, and runs free.
- **A sound can stay free.** On the System 55 that is the app-only 960 CLOCK switch (`out.follow960`, on the
  output's blank panel, marked `appOnly`): FREE, the default, runs the 960 as the hardware does, so a hand-made
  patch behaves as it would on the real system; BEAT sets `follow`. It is the definition's `ownSequencer.run`, so a
  lesson step switching it to BEAT presses Play, as the Subharmonicon's PLAY does. `appOnly` keeps the switch out of
  the prototype parity check, the goldens grid and the hardware Default patch checklist.

**Choosing per sound.** Follow wherever the sequence is a rhythm the drums should share. Leave it free, and say why in
the switch's context line, when the speed itself moves (a control voltage that surges or accelerates the clock), or
the clock is an oscillator. Where a sound's riff is only a held note and its tempo sat far from the sequencer's
speed, set the riff's BPM so the sequencer lands on a whole division (the System 55's Berlin sequence: 83 BPM, four
steps a beat), rather than letting the snap change how fast it plays.

## The DFAM's sequencer (`audio/dfam-core.ts`)

t-327, for the Moog DFAM and the Behringer EDGE, which recreates it. EngineParams `dfam` is the DFAM's control
section: a clock VCO (TEMPO, 0.7 Hz into audio rate, its input at 1 V an octave), an 8-step sequencer with a PITCH and
a VELOCITY knob a step, the trigger and velocity buses, and the VCO, VCF and VCA decay envelopes. Unlike the
Subharmonicon's core it makes no sound itself: the fixed voice keeps its two oscillators, noise, mixer, ladder filter
and VCA, and the definition routes the core's signals into them. Its NOISE / EXT channel (`dfmNz`) goes into the
mixer's `extIn`, which sounds only with `ext.level` set, and the voice's own noise level is 0.

| Signal                             | What it is (full scale is the hardware's voltage)                        | Routed to, usually                                           |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `dfmPitch`                         | The step's PITCH, −1..1 for ±5 V                                         | `pitch1` / `pitch2` by SEQ PITCH MOD, at 60 semitones a unit |
| `dfmVel`                           | The step's VELOCITY, 0..1 for 0..5 V (a key's, until the step moves)     | the VELOCITY jack                                            |
| `dfmTrig`                          | TRIGGER OUT, a 1 ms pulse                                                | the TRIGGER jack                                             |
| `dfmEgVco`, `dfmEgVcf`, `dfmEgVca` | The three envelopes, 0..1 for 0..8 V, each peaking at the bus's velocity | both pitches, `cutoff`, `amp` (the VCA's `envSrc` is `none`) |

Its inputs are `dfmTempo`, `dfmRun`, `dfmAdv`, `dfmTrigIn`, `dfmVelIn`, the three decay CVs, `dfmExt` (EXT AUDIO, which replaces the noise once cabled) and `dfmNzLvl` (NOISE LEVEL, added to the knob). A cable in TRIGGER or
VELOCITY breaks that bus's normal. ADV / CLOCK takes over from TEMPO. A cable in RUN / STOP takes over from the panel's
RUN / STOP, which is the definition's `ownSequencer.run`. ADVANCE and TRIGGER are `press` buttons (`next`, `trigger`),
and they act only while the sequencer is stopped, as on the hardware.

- **Following the transport**, it runs only while the transport does and RUN / STOP is lit. It starts on step 1 at
  the run's first beat, and its clock is beat-locked, as the 960's is. Above 20 Hz, or with ADV / CLOCK cabled, it
  runs free inside the run.
- **On the EDGE's MIDI or USB clock** (`perBeat`, from SCALE) each step is exactly that share of the beat, whatever
  TEMPO says, and nothing runs without the transport.
- **Keys** fire the bus at their velocity while the sequencer is stopped, and transpose it while it runs. That is the
  EDGE's MIDI note input. The DFAM has no MIDI, so there it is the app's stand-in for its TRIGGER input.
- **Linear FM.** The DFAM's 1→2 FM is linear, so the fixed voice has it too (`OscParams.fmLin`, dest `fmLinAmt` for
  the 1→2 FM AMT jack). The frequency swings in hertz around the pitch rather than in semitones, so the pitch heard
  stays put while the sidebands grow.

The choices the spec leaves open are listed in the core's header: how much velocity lengthens a decay, which way a
decay CV moves it, that ADV / CLOCK steps only a running sequencer, and that a retrigger rises from where the envelope
is.

## Who plays a sound

Every sound on such a synth is one of four, and its lesson says which. The riff is always a real riff, so the
pattern library, the picker and the sequencer work as on every synth; what the riff means is what changes.

| Who plays                     | Panel                   | The riff                                       | Use it for                                 |
| ----------------------------- | ----------------------- | ---------------------------------------------- | ------------------------------------------ |
| **The synth plays itself**    | PLAY lit, EG on or held | One C4, held for the riff's length             | Polyrhythms, sequences, drones, percussion |
| **Transposed**                | PLAY lit, EG on or held | A key line: long notes, each a key change      | Berlin-school basses, chord changes        |
| **The riff plays the rhythm** | PLAY lit, EG off        | Short notes: their rhythm, the synth's pitches | Generative melodies over a fixed rhythm    |
| **Keys**                      | PLAY off                | A melody or chords, as on any synth            | Undertone chords, leads, basses, effects   |

- **A held C4 is silence from the app.** The key is the sequence's own pitch (an offset of 0), and while the
  sequencers run a key never holds the envelopes, and with EG on does not fire them either. So the app adds nothing but the clock, and a library
  pattern picked in its place transposes the sequence by its notes: that is the hardware's MIDI transpose.
- **A riff's length is a musical choice, not the sequence's.** The sequencers are not reset at the loop, so a
  polyrhythm whose cycle is longer than the riff keeps unfolding. Make the riff one bar (4 beats) or the cycle
  when that is short, so the drums and the loop agree.
- **EG off with PLAY lit** hands the envelopes to the keys: each of the riff's notes fires them, so the riff is
  the rhythm and the sequencers choose the pitches. On a sound the synth plays itself with EG off (its envelopes
  fired through the patchbay), the held C4 fires them once at the top of each loop, on a beat a clock already
  falls on. Use EG held for a drone.

## Designing sounds for a sequencer synth

The method the Subharmonicon's library is written by (t-289). Apply it to the next sequencer synth.

1. **List what only this synth does.** Not its filter or its envelopes, which every synth has, but the things a
   player buys it for. On the Subharmonicon: chords of the undertone series from one VCO and its two dividers;
   rhythms that are whole-number divisions of one clock, OR'd onto two sequencers; sequencing the divisors, so a
   melody moves through the undertone series rather than the semitones; the just and 8-note tunings; and a
   patchbay that turns the sequencers into modulation (cutoff, PWM, the rhythms' own divisors). Every sound shows
   at least one of them, and the library covers all of them several times over.
2. **Choose who plays it** (above). Most sounds on a sequencer synth are the synth playing itself; a library that
   is all keys has missed the instrument.
3. **Rhythm first.** Choose the divisors and which sequencer each drives before any pitch. Write down the cycle:
   the lowest common multiple of the divisors, in clocks (on the Subharmonicon a clock is a sixteenth). 2 against
   3 repeats every 6 clocks, 3–4–5 every 60, 7 against 16 every 112.
4. **Then pitch**: the steps, SEQ OCT and QUANTIZE, and what each step is assigned to. Prefer intervals the
   synth makes naturally (divisor moves, just ratios) over ones any synth can play.
5. **Then shape**: the mixer, the filter, the two envelopes, the EG mode. A short decay shows the rhythm; a long
   one blurs it into a texture.
6. **Then the patchbay**, for the sounds that need it: a cable that only changes a timbre should earn its place
   by changing something you can hear in every cycle. On the Subharmonicon a sequencer can be a voltage
   source: all four steps fully down at SEQ OCT ±5, assigned to nothing, put −5 V on SEQ OUT, and patched into
   VCO 2's input that drops VCO 2 to about 8 Hz at a held C4 (keys move it too), so its subs are LFOs for RHYTHM, SUB, PWM, CUTOFF, VCA, PLAY or
   RESET (`scripts/app/sounds/subharmonicon/patchbay.ts`, t-290). An audio-rate signal in a RHYTHM input is
   read once a clock, so it throws a new divisor each sixteenth: a random rhythm.
7. **The lesson builds in that order**: sources, rhythm, sequence, shape, cables, play. Its last step is where
   the sound starts playing, so each step before it can be heard with a key or with Play.

Each sound still follows the rules every sound does ([`synths.md`](./synths.md#sounds)): every value it relies on
named in a step, a `context` line for each control that matters, tweaks that change what you hear, and a riff
that passes the pattern library's rules.

## Bringing another synth onto it

1. Its core takes `clock()` (start, pulse, stop) and runs its sequencer on it: its own clocks a beat from the 24
   pulses, or, for a clock with no tempo control, a beat lock (`createBeatLock`) and its rate snapped to the beat;
   start from its first step, stop on stop.
2. Its `toEngine()` sets `follow: true`, and the core holds its run control's start until a clock starts while
   `follow` is set.
3. Its definition names `ownSequencer` (`run`, and `ppq` when it counts pulses) and, if it has a tempo control,
   `tempo` and `tempoMap`. The voice's riff player must clock the core too (`ownClock` in `dsp-core.ts`).
4. Its keys transpose a running sequence, and leave the envelopes to the steps while the steps fire them.
5. Its sounds follow the method above.
