# The pattern library

Today every library sound carries exactly one riff (`SynthSound.phrase`). A sound "in the style of" an artist plays a
riff that makes no attempt at what that artist played, and once a patch has been changed a lot, nothing offers a riff
that suits what it has become. The pattern library (`f-pattern-library`, §26) separates patterns from sounds. Each
pattern has a role, may carry an "Inspired by" tag with an honest fidelity label, and can be suggested for whatever is on
the panel.

This page is the design, written before the build (t-121). It covers:

- the roles a pattern plays and the facts it carries for matching
- what "Inspired by" links to, and the fidelity levels
- the research method the batches follow (t-127, t-128, t-129)
- the rights rule
- how the current riffs are reviewed

Each later task updates its section as it lands. The table, the migration and the seed are t-122. The picker on the synth
page is t-123, the sound detector t-124, suggestions t-125 and the admin editor t-126.

**Awaiting the owner's sign-off on the PR:** the role vocabulary, the fidelity labels and the rights rule. Each is marked
_Proposed_ below until it is signed off.

## What the library holds today

Measured on `main` on 2026-10-31, from the seed data under `prisma/seeds/app-knowyoursynth/data/sounds/`:

- **2,293 sounds, each with one riff.** The library has more than doubled since §26 was planned (1,071). `importPhrase`
  still takes every one into a `Pattern` without changing a note (`import.test.ts`, [`sequencer.md`](./sequencer.md#importing-a-riff)).
- **733 refs name a specific work** (a quoted title in `ref`). Only 44 of those works are a `BankSong` in the databank.
- **577 sounds name an artist that is a `BankArtist`.** The rest name a genre ("Berlin school", "Ambient"), a synth or
  maker ("Oberheim SEM", "Behringer"), "Various", or "Classic technique" (393).
- **None of the riffs was researched.** Each one was written to show the sound off. That makes every one of them _in
  the style of_ (see [Fidelity](#fidelity)), whatever its `ref` names.

## Roles

A sound's category (its first tag, `PRESET_CATEGORIES`) says what the patch sounds like: its timbre. A pattern's
**role** says what part the notes play. These are different things, and the map between them is what matching uses.

The data shows how far apart they are. Of the 149 `seq` sounds, 79 hold one note or chord and leave the synth's own
sequencer or arpeggiator to move. Of the 273 `fx` sounds, 198 do the same. So the role is read from the notes, never
copied from the category.

### The vocabulary

_Proposed._ There are eight roles, derived from the 2,293 riffs rather than invented. The counts come from the rule
under the table, run on every riff.

| Role               | What the part does                                                               | Riffs today |
| ------------------ | -------------------------------------------------------------------------------- | ----------: |
| **Lead line**      | A melody or riff of single notes, about a note a beat or faster                  |         591 |
| **Held**           | One held note or chord. The patch does the moving: drones, fx, a synth's own seq |         546 |
| **Bass line**      | A low line of single notes                                                       |         362 |
| **Slow melody**    | Single notes held for a beat and a half or more                                  |         222 |
| **Arp / sequence** | A fast repeating figure of single notes: an arpeggio or an ostinato              |         161 |
| **Percussive**     | One or two pitches, short: hits and rhythms                                      |         160 |
| **Chord changes**  | Chords that are held and move: pad and string parts                              |         155 |
| **Chord stabs**    | Short chords on the beat or off it                                               |          96 |

Some names the owner suggested in 2026-10 are folded into other roles:

- **Drone** is _Held_. A drone's riff is a held note (78 of the 121 drone sounds), and the drone itself is in the patch.
  "Drone" stays a sound category.
- **Sequence/ostinato and arp** share one role. They can't be told apart from the notes alone, and they suit the same
  sounds.
- **Fx** is not a role. An fx sound's riff is a trigger: a held note, or a few hits.

The **default role rule** proposes a role for a pattern and for each current riff. A person can always override it.
Where the rule says _beats_, it means the pattern's loop length (`phraseBeats`). An _onset_ is a distinct start time, so a
chord is one onset.

1. At most 2 onsets, with notes lasting at least 40% of the loop → **Held**.
2. At most 2 distinct pitches, with an average note of half a beat or less → **Percussive**.
3. Half the onsets or more are chords, with an average note of a beat or less → **Chord stabs**.
4. Half the onsets or more are chords → **Chord changes**.
5. The median pitch is below C3 (MIDI 48) → **Bass line**.
6. At least 2 onsets a beat, with an average note of half a beat or less → **Arp / sequence**.
7. An average note of 1.5 beats or more → **Slow melody**.
8. Anything else → **Lead line**.

### Category to role

This shows which roles suit which kind of sound. It comes from the cross-tab of the current riffs' categories and roles.
t-125 uses it as the starting weights for suggestions, and the owner's review can move them.

| Sound category | Roles that suit it, most common first  |
| -------------- | -------------------------------------- |
| bass           | Bass line                              |
| lead           | Lead line, Slow melody, Arp / sequence |
| keys           | Lead line, Chord stabs, Chord changes  |
| pad            | Held, Chord changes, Slow melody       |
| pluck          | Lead line, Arp / sequence, Chord stabs |
| perc           | Percussive, Lead line, Arp / sequence  |
| seq            | Held, Arp / sequence, Bass line        |
| drone          | Held, Slow melody                      |
| fx             | Held, Lead line, Percussive            |
| strings        | Held, Slow melody, Chord changes       |
| brass          | Chord stabs, Lead line, Chord changes  |
| wind           | Lead line, Slow melody                 |

### The facts a pattern carries for matching

Every fact except the role and the tempo range is computed from the pattern itself. None is typed in, so none can
drift from the notes.

| Fact        | What it is                                                    | Why matching wants it                                   |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Role        | One of the eight above. Proposed by the rule, set by a person | The main match against the kind of sound                |
| Register    | Lowest, highest and median note                               | A sub bass shouldn't be offered a line round C5         |
| Density     | Onsets per beat                                               | A slow-attack pad smears a fast line                    |
| Note length | Average gate in beats                                         | Long notes need a sustain to be heard; short ones don't |
| Voices      | The most notes sounding at once (1 = mono)                    | A mono synth can't play chords. Never offered them      |
| Tempo range | The bpm it is written at, and the range it still works in     | A Held pattern works at any tempo; a bass line doesn't  |
| Length      | Bars, at the pattern's step size                              | Shown in the picker                                     |
| Slides      | Whether it uses `slide`                                       | It wants a synth with glide                             |

Voices is a hard filter: a pattern is never offered to a synth with fewer voices than it needs. Every other fact is a
weight.

## Provenance

### Inspired by

Every library pattern names what it is inspired by. "Classic technique" is not an answer: a new pattern names a
player, a band or a genre, as new sounds do.

A pattern's inspiration is exactly one of these, linked where the databank has it:

| Kind   | Links to                                    | Example                                             |
| ------ | ------------------------------------------- | --------------------------------------------------- |
| Work   | a `BankSong`, and the `BankSongPart` if any | Kraftwerk, "The Model", the synth bass in the verse |
| Artist | a `BankArtist`                              | Tangerine Dream                                     |
| Synth  | a catalogue synth                           | the Roland TB-303's own sequencer                   |
| Genre  | free text                                   | Berlin school                                       |

_Proposed:_ a pattern that recreates a specific part (_transcribed_ or _reconstructed_) must link to a `BankSong`.
Today only 44 of the 733 named works are in the bank. So a research batch adds the song to the bank (title, year,
artists, the part and the synth it was played on) before it adds the pattern. The work is then written once, credited
properly, and shown on the bank's song page, not left as a string in a pattern.

### Fidelity

_Proposed._ The picker shows one of three labels beside "Inspired by":

| Label               | Means                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Transcribed**     | The notes come from an authoritative source for this part: a published score, official stems or MIDI, or an isolated part. Then checked by ear against the record. |
| **Reconstructed**   | Worked out by ear, with the artist's own account or a reputable transcription to support it. It aims at the actual part.                                           |
| **In the style of** | No specific part. Written to sound like the artist or genre.                                                                                                       |

The rules that keep the labels honest:

- **The weakest link sets the label.** A part taken from an official score but then simplified to fit the sequencer is
  _Reconstructed_, not _Transcribed_, unless the only change is what [Reducing a part to a loop](#reducing-a-part-to-a-loop)
  allows.
- **A pattern is never labelled higher than its sources support.** If two sources disagree and nothing settles it, the
  pattern goes down a level.
- **Every current riff starts as _In the style of_.** None was researched.

Copying a library pattern into My patterns keeps its Inspired by and its fidelity, so a shared copy says what it is.
If the user then edits the notes, the copy drops to _In the style of_.

### Sources

Every _Transcribed_ or _Reconstructed_ pattern lists its sources. A source has:

- its **type**: score, stems or MIDI, isolated part, interview, gear write-up, video of the performance, published
  transcription, or by ear
- a **citation** a reader could find again: author, title, publisher or site, and date
- a **URL**, where there is one
- the **date it was checked**

The citation is committed. The source itself never is. Scores, MIDI files, stems and saved articles stay local-only, as
manuals do ([`synth-data/README.md`](./synth-data/README.md)). The repo is public, and committing them would publish
someone else's work.

## Research method

Every batch follows one method, so patterns researched in different sessions can be compared.

### Order of trust

From most trusted to least:

1. **Official sources for the part**: a published score or songbook from the rights holder, official stems or
   multitracks, or MIDI the artist released.
2. **The artist's own account**: interviews, gear write-ups, liner notes, and video of them playing the part.
3. **Reputable transcriptions**: published transcription books, or a transcriber whose work is checked and cited by
   others.
4. **By ear**, against the original recording.

A fan-made MIDI file or a tab site is not a source. It can be a starting point, and its notes then have to be checked
by ear like anything else. _Transcribed_ needs a tier-1 source. _Reconstructed_ needs two sources that agree (by ear
counts as one), or one tier-1 or tier-2 source checked by ear.

### Choosing the part

- **Pick one part**: the line the synth plays, not the vocal melody. Prefer a part the databank already says was played
  on a synth (`BankSongPart`) and, where possible, the synth in our catalogue that played it.
- **Pick the passage**: the bars that repeat and make the part recognisable, within the [rights rule](#rights).
- **Write down** the work, the part, which bars (for example "the four-bar synth bass under the verse") and the
  original key and tempo.

### Reducing a part to a loop

The sequencer's model is in [`sequencer.md`](./sequencer.md#riffs-and-patterns). A performance is carried like this:

| In the performance                            | In the pattern                                         |
| --------------------------------------------- | ------------------------------------------------------ |
| Swing and shuffle                             | `swing`                                                |
| A note pushed or laid back                    | the note's `nudge`                                     |
| Accents                                       | `accent`, or `velocity` where the dynamics are graded  |
| Glide between notes (a 303 line, a mono lead) | `slide`                                                |
| Fast repeated notes                           | `ratchet`                                              |
| A variation every Nth bar (a turnaround)      | parts A and B with a `chain`, such as `[0, 0, 0, 1]`   |
| A knob moving as part of the part             | a mod lane, only where the part depends on it          |
| Chords                                        | the voicing as played, up to the sequencer's six notes |

Some changes are allowed without lowering the fidelity: transposing by whole octaves to suit a synth's register,
dropping notes beyond six in a chord, and rounding a timing smaller than the nudge can hold. Anything else lowers it
to _Reconstructed_, and the change is written down: a simplified ornament, a note changed to fit, or two parts merged
into one.

What the pattern does **not** carry:

- **Echoes made by a delay.** Echoes on the record come from the patch, not from notes.
- **Probability and conditions** in a _Transcribed_ or _Reconstructed_ pattern. They make it differ from the record on
  every loop. They are fine in _In the style of_.

### Checking

- The pattern passes `PatternSchema`, and compiles to the intended notes (a test per batch, like `import.test.ts`).
- The pattern is played on the sound it is for, at the original key and tempo, against the record. Then a second time
  at the sound's own tempo.
- The owner listens to each batch. This is batched with the end checks, and the pilot batch (t-127) is the first.
  The owner's listen is what moves a pattern into a sound's defaults.

### The record kept per pattern

What the user sees: name, role, Inspired by, fidelity, original key and tempo.

What is kept with it (committed, in the seed beside the pattern):

- the work, the part and the bars
- the sources, as above
- what was changed in reducing it, and why
- who researched it and when
- whether the owner has listened to it, and when

## Rights

_Proposed. The owner's call; goes to the `f-launch` legal review._

A recreated part is still a reproduction of a melody, however short, so the library limits how much it takes and says
what it is:

- **One part of a work**, never two parts of the same work together, and never the vocal melody.
- **At most 8 bars**, and no longer than the passage that repeats on the record.
- **Never the whole of a part** that is itself short enough to fit in 8 bars and is the work's main hook. In that case
  take the passage under it instead, or write it _In the style of_. _(Open for the owner: whether the hook rule goes too
  far for learning use.)_
- **Labelled every time**: "Inspired by" with the work and artist, the fidelity, and, on the pattern's detail, the line
  _"A short recreation for learning. Not the original recording; the work belongs to its rights holders."_
- **No downloadable copy**: a library pattern plays in the app, and can be copied into My patterns. It is not offered
  as a MIDI file.
- **No samples, ever.** Patterns are notes played through our synths.

The pattern library is named in `f-launch`'s legal-review scope on the Hub (added by t-121).

## Reviewing the current riffs

No riff is deleted. When t-122 moves the library into its own table, every current riff becomes a library pattern with:

- the role the [default role rule](#the-vocabulary) gives it
- fidelity _In the style of_
- Inspired by: the sound's artist where it is a `BankArtist`, otherwise its genre text. "Classic technique" riffs carry
  the synth they were written for, until a housekeeping pass names a player or genre for them
- a place as its sound's first, and default, pattern

The owner reviews riffs per sound, in the admin editor (t-126), and marks each one:

- **Keep**: it stays the default.
- **Demote**: another of the sound's patterns becomes the default. The demoted riff stays in the sound's list and in the
  library, and can still be chosen and suggested.

Demoting is the only way a riff stops being a default. A researched pattern becomes a sound's default only after the
owner has listened to it, and the riff it replaces is demoted, never removed.
