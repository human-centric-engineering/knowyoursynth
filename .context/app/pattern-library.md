# The pattern library

Today every library sound carries exactly one riff (`SynthSound.phrase`). A sound "in the style of" an artist plays a
riff that makes no attempt at what that artist played, and once a patch has been changed a lot, nothing offers a riff
that suits what it has become. The pattern library (`f-pattern-library`, §26) separates patterns from sounds. Each
pattern has a role, may carry an "Inspired by" tag with an honest fidelity label, and can be suggested for whatever is on
the panel.

This page is the design, written before the build (t-121). It covers:

- the roles a pattern plays and the facts it carries for matching
- what "Inspired by" links to, and the fidelity levels
- the research method the batches follow (t-127, t-128, t-129, t-160, t-161, t-162, t-163, t-164, t-165,
  t-166, t-167, t-168)
- the rights rule
- how admins see and control each pattern's origin, rights risk and status
- how the current riffs are reviewed

Each later task updates its section as it lands. The table, the migration, the seed and the API are t-122 and are
described as built in [The library as built](#the-library-as-built). The picker on the synth page is t-123, the sound
detector t-124, suggestions t-125, the admin editor t-126 and admin control t-156. The research batches and their seed are
t-127 on ([Researched patterns](#researched-patterns), [The method as practised](#the-method-as-practised)).

**Awaiting the owner's sign-off on the PR:** the fidelity labels and the rights rule. Each is marked _Proposed_ below
until it is signed off. The role vocabulary was signed off in t-211 ([The review](#the-review)).

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

The data shows how far apart they are. By the rule below, 73 of the 149 `seq` sounds hold one note or chord and leave
the synth's own sequencer or arpeggiator to move. So do 187 of the 273 `fx` sounds. So the role is read from the notes, never
copied from the category. The one exception is Ambient, which the notes alone can't tell from a slow chorale: there
the sounds a slow line is on decide ([Ambient](#ambient)).

### The vocabulary

Signed off by the owner on 2026-11-08 (t-211), with the changes in [The review](#the-review) below; t-215 then put
Ambient in Slow melody's place. There are eight roles. The counts are the library's enabled patterns, measured on
2026-11-08 after t-215: 4,471 in all.

| Role               | What the part does                                                                   | Patterns |
| ------------------ | ------------------------------------------------------------------------------------ | -------: |
| **Lead line**      | A melody or riff of single notes, slow ones included where the sounds aren't ambient |    1,337 |
| **Bass line**      | A low line of single notes                                                           |      893 |
| **Drone**          | One held note or chord. The patch does the moving: drones, fx, a synth's own seq     |      784 |
| **Arp / sequence** | A fast repeating figure of single notes: an arpeggio or an ostinato                  |      457 |
| **Chord changes**  | Chords that are held and move: pad and string parts                                  |      343 |
| **Percussive**     | One or two pitches, short: hits and rhythms                                          |      261 |
| **Ambient**        | A slow line of single notes, held a beat and a half or more, on ambient-type sounds  |      206 |
| **Chord stabs**    | Short chords on the beat or off it                                                   |      190 |

Of the names suggested in 2026-10:

- **Drone** names what the rule calls `held`. Of its 784 patterns, 469 hold one note and 315 hold a chord. Either way
  the drone itself is in the patch. "Drone" is also a sound category, and the category leads with the role.
- **Sequence/ostinato and arp** share one role. They can't be told apart from the notes alone, and they suit the same
  sounds.
- **Fx** is not a role. An fx sound's riff is a trigger: a held note, or a few hits.

The **default role rule** proposes a role for a pattern and for each current riff. A person can always override it.
The terms are exact, so t-122 could implement the rule from them:

- The **loop** is `phraseBeats`: the last note's end, rounded up to a whole beat.
- An **onset** is a distinct start time, so a chord is one onset. A **chord** is an onset with two or more notes.
- The **average note** is the mean length, in beats, of every note.
- The **median pitch** is the median over every note.

The rules are checked in order, and the first that fits wins:

1. At most 2 onsets, and every note lasts at least 40% of the loop → **Drone**.
2. At most 2 distinct pitches, with an average note of half a beat or less → **Percussive**.
3. Half the onsets or more are chords, with an average note of a beat or less → **Chord stabs**.
4. Half the onsets or more are chords → **Chord changes**.
5. The median pitch is below C3 (MIDI 48) → **Bass line**.
6. At least 2 onsets per beat of the loop, with an average note of half a beat or less → **Arp / sequence**.
7. An average note of 1.5 beats or more, on sounds at least half of which are ambient-type → **Ambient**
   ([below](#ambient)).
8. Anything else → **Lead line**.

### The review

The Play deck's pattern picker (`f-pattern-picker`) heads its library sections with the roles, so a role is what a
player browses by: _what part do I want under this patch?_ The owner reviewed the eight in t-211 and set the test for
each heading: **it is a word players actually use, for the part as they hear it.** The spec's own terms don't count.
The ruling:

| Role           | Ruling                  | Why                                                                                             |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| Held           | **Renamed Drone**       | "Held" isn't a word players use; "Drone" is. Applied in `ROLE_LABELS`, the enum is `held`       |
| Slow melody    | **Replaced by Ambient** | "Slow melody" doesn't mean much to a player; "Ambient" does. Done in t-215: [Ambient](#ambient) |
| Percussive     | Kept                    | A word people relate to. "Hits & rhythms" was proposed and rejected                             |
| Lead line      | Kept                    | The biggest section (24%), but see below                                                        |
| Bass line      | Kept                    |                                                                                                 |
| Arp / sequence | Kept                    |                                                                                                 |
| Chord changes  | Kept                    | Held chords that move, distinct from stabs                                                      |
| Chord stabs    | Kept                    |                                                                                                 |

**Ambient is a style, not a shape of notes.** On the 423 sounds tagged `ambient`, the patterns are 195 Drone, 156 Slow
melody, 58 Chord changes, 56 Lead line, 42 Arp / sequence, 22 Bass line, 11 Percussive and 3 Chord stabs. Slow
melody's inspirations lead with Brian Eno (31), Daniel Lanois (20), Blade Runner, Vangelis, Tangerine Dream, Harold
Budd, William Basinski and Stars of the Lid. But only 156 of its 454 patterns are on ambient-tagged sounds; by
category they are on lead (168), pad (98), keys (63), strings (34), fx (30), drone (22), wind (21) and brass (18)
sounds, and 21 more on the other four categories. The rest include "Wachet auf: the chorale", "Rise: trumpet melody" and "Symphonic Prog Lead".

So the notes alone can't tell an ambient line from a chorale. Ambient's rule reads something besides the notes, which
reverses [Roles](#roles)' "never copied from the category" for this one role. t-215 designed it: [Ambient](#ambient).

Considered and not done:

- **Renaming Slow melody to Ambient.** A label alone, but it would head the chorale, trumpet and prog-lead melodies
  Ambient, which fails the owner's test.
- **"Held note or chord"** for Held. Accurate, but nobody says it.
- **Splitting Lead line.** It is the rule's catch-all and 24% of the library, but the notes can't split a riff from a
  melody, and the picker shows each section's best few with "Show all".
- **Splitting Drone into a held note and a held chord.** The patch does the moving either way, and the voices filter
  already marks a chord a mono synth can't play.

### Ambient

t-215 replaced Slow melody with Ambient (the `PatternRole` value `slow_melody` is now `ambient`). Slow melody's 454
patterns split by the sounds they are on: 206 became Ambient and 248 joined Lead line.

**The rule.** A slow line (rule 7's average note of 1.5 beats or more) is Ambient when at least half the sounds it is
on are **ambient-type**: tagged `ambient`, or in the pad or drone category (`isAmbientSound` and `ambientPlacement` in
`lib/app/patterns/library-facts.ts`). Otherwise it is a Lead line. A riff is on its own sound. A research batch
pattern is on the sounds its batch names, and a `-low` or `-high` copy takes its pattern's role, since it plays the same
part on another sound.

**The hypothesis, and the check.** The hypothesis is that an ambient line is told by where it is played: on a sound
tagged ambient, or on a pad or a drone, a slow line is a texture; on a lead, brass, wind, strings or keys sound it is a
tune. It was checked by reading every one of the 454 by name and credit under each candidate rule:

- **Pads and drones count without the tag.** Tagged sounds alone give 156 and miss Tears in Rain, Max Richter's Sleep
  and Boards of Canada's Hazy Nostalgia, all on untagged pads.
- **Fx sounds count only when tagged.** With fx in, dub sirens, laser zaps, cartoon bloops and a bomb drop became
  Ambient.
- **Keys count only when tagged.** Eno's, Harold Budd's and Hiroshi Yoshimura's piano and bell lines are on tagged
  keys sounds and are Ambient. Bach on a church organ, Mozart on a glass harmonica and the jazz vibraphones are Lead
  lines.
- **What it gets wrong.** A few ambient lines are on untagged sounds and are Lead lines: Basinski's Disintegrating Loop
  and Underwater on keys, and Bowed Lead on a lead. Reading an "ambient" credit as well would catch only Underwater and
  Bowed Lead, so the credit is not read. A slow trance lead on a pad (For an Angel's low copy) would be Ambient, but the
  copy rule keeps it its pattern's Lead line.

Over the library now, Ambient's 206 are on pad (93), lead (45), keys (30), drone (22), strings (9), fx (6), wind (5),
brass (4) and pluck (3) sounds, 154 of them on ambient-tagged ones. The test that holds it: a batch pattern called
Ambient is always on ambient-type sounds (`library-researched.test.ts`).

**What did not move.** On the 423 ambient-tagged sounds the other parts stay as their shapes say: 195 Drone, 58 Chord
changes, 58 Lead line, 42 Arp / sequence and the rest. A held chord on an ambient pad is still what "Drone" names, and
the picker ranks the Drone and Chord changes sections high for an ambient patch anyway. Moving them would make Ambient a
style section of every shape, and take a quarter of the Drone section with it.

**A role a person set.** The migration renames the value and then splits its rows by the same placement rule, so a
role an admin set to Slow melody becomes Ambient or Lead line by the sounds it is on. It said "a slow line", which is
still true under either name. It reads "the sounds it is on" as the seed does: a riff pattern by its own sound, a -low
or -high copy by the pattern it copies, any other pattern by its placements. A research pattern's role is its batch's,
which the migration can't read; the seed sets it on every unedited one. The dev database had none (every Slow melody
row was the seed's).

### Category to role

This shows which roles suit which kind of sound. It comes from the cross-tab of the library's categories and roles:
each pattern counted once for each category of sound it is placed on, measured on 2026-11-08, listing the roles with
5% or more of a category's patterns, at most three; remeasured after t-215. Suggestions (t-125) use the same pairing, measured rather than read
off this table: the detector's role shares are how often library sounds of each category carry each role (see
[The scores](#the-scores)). A change to the patterns' roles moves them at the next refit.

| Sound category | Roles that suit it, most common first  |
| -------------- | -------------------------------------- |
| bass           | Bass line                              |
| lead           | Lead line, Arp / sequence, Ambient     |
| keys           | Lead line, Chord stabs, Chord changes  |
| pad            | Drone, Chord changes, Ambient          |
| pluck          | Lead line, Arp / sequence, Chord stabs |
| perc           | Percussive, Lead line, Arp / sequence  |
| seq            | Drone, Arp / sequence, Bass line       |
| drone          | Drone, Ambient                         |
| fx             | Drone, Lead line, Percussive           |
| strings        | Lead line, Chord changes, Drone        |
| brass          | Lead line, Chord stabs, Chord changes  |
| wind           | Lead line, Arp / sequence              |

### The facts a pattern carries for matching

Every fact except the role and the tempo range is computed from the pattern itself. None is typed in, so none can
drift from the notes.

| Fact        | What it is                                                    | Why matching wants it                                   |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Role        | One of the eight above. Proposed by the rule, set by a person | The main match against the kind of sound                |
| Register    | Lowest, highest and median note                               | A sub bass shouldn't be offered a line round C5         |
| Density     | Onsets per beat                                               | A slow-attack pad smears a fast line                    |
| Note length | Average gate in beats                                         | Long notes need a sustain to be heard; short ones don't |
| Voices      | The most notes that start together (1 = no chords)            | A mono synth can't play chords. Never offered them      |
| Tempo range | The bpm it is written at, and the range it still works in     | A Drone pattern works at any tempo; a bass line doesn't |
| Length      | Bars, at the pattern's step size                              | Shown in the picker                                     |
| Slides      | Whether it uses `slide`                                       | It wants a synth with glide                             |

Voices counts notes that start together, not notes that overlap. A mono line written legato, with each note running
into the next, is still 1.

Voices is a hard filter on suggestions: a pattern is never suggested to a synth with fewer voices than it needs. Every
other fact is a weight. The filter doesn't apply to a sound's own patterns. Those were written for its synth, and some
use what a mono synth can do with chords: the Neutron's and the K-2's oscillators tuned apart, or the CAT's duophonic
keyboard. A sound always lists its own patterns.

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

| Label               | Means                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transcribed**     | The notes come from a tier-1 source for this part (see [Order of trust](#order-of-trust)): a published score, or official stems, multitracks or MIDI. Then checked by ear against the record. |
| **Reconstructed**   | Worked out by ear, with the artist's own account or a reputable transcription to support it. It aims at the actual part.                                                                      |
| **In the style of** | No specific part. Written to sound like the artist or genre.                                                                                                                                  |

The rules that keep the labels honest:

- **The weakest link sets the label.** A part taken from an official score but then simplified to fit the sequencer is
  _Reconstructed_, not _Transcribed_, unless the only change is what [Reducing a part to a loop](#reducing-a-part-to-a-loop)
  allows.
- **A pattern is never labelled higher than its sources support.** If two sources disagree and nothing settles it, the
  pattern goes down a level.
- **Every current riff starts as _In the style of_.** None was researched.

Copying a library pattern into My patterns keeps its Inspired by and its fidelity, so a shared copy says what it is.
If the user then changes a note's pitch, timing or length, or adds or removes a note, the copy drops to _In the style
of_. Moving every note by whole octaves doesn't count, for the same reason it doesn't when reducing a part. Neither
does changing the tempo, the swing, `transpose` or the sound.

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
   multitracks (which include an isolated part taken from them), or MIDI the artist released.
2. **The artist's own account**: interviews, gear write-ups, liner notes, and video of them playing the part.
3. **Reputable transcriptions**: published transcription books, or a transcriber whose work is checked and cited by
   others.
4. **By ear**, against the original recording.

A fan-made MIDI file, a tab site, or a part split out of the mix by software (stem separation, an "isolated" upload)
is not a source. It can be a starting point, and its notes then have to be checked
by ear like anything else. _Transcribed_ needs a tier-1 source. _Reconstructed_ needs two sources that agree (by ear
counts as one), or one tier-1 or tier-2 source checked by ear.

### Free leads, and a best guess where there are none

_Owner ruling, 2026-11-02._ A batch reads free leads only: Songsterr, BitMIDI and others like them. It never buys sheet
music or uses any other paid source.

- **Where a free lead has the part**, the pattern is taken from it, as above.
- **Where no free lead has the part**, the batch writes a best-guess _In the style of_ pattern for it: notes written to
  the artist's style and taken from no record. Its research record has no leads, and its notes say it is a best guess.
- **A reason instead of a pattern only where there is no part to write**: an effect, a recorded sound (a sample, a
  turntable scratch), or a part that is only the vocal.

So every sound by a batch's artists gets a pattern unless there is nothing to play. A lead that has the work but not the
sound's part (the guitar, not the synth) can still give the sound a part a lead can carry, and its notes say which.

### Choosing the part

- **Pick one part of the work**: the line the synth plays, not the vocal melody. Prefer a part the databank already says was played
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
to _Reconstructed_, and the change is written down: a simplified ornament, or a note changed to fit. Merging two parts
of the work into one is not a reduction. The [rights rule](#rights) forbids it.

Parts A and B with a `chain` carry one part of the work: the part as it plays, then its variation. They never carry
two parts of the work.

What the pattern does **not** carry:

- **Echoes made by a delay.** Echoes on the record come from the patch, not from notes.
- **Probability and conditions** in a _Transcribed_ or _Reconstructed_ pattern. They make it differ from the record on
  every loop. They are fine in _In the style of_.

### Checking

- The pattern passes `PatternSchema`, and compiles to the intended notes (a test per batch, like `import.test.ts`).
- The pattern is played on the sound it is for, at the original key and tempo, against the record. Then a second time
  at the sound's own tempo. An agent researching a batch cannot listen, so this is the owner's (_owner ruling,
  2026-11-01_): see [The method as practised](#the-method-as-practised).
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
- its origin ([Admin control](#admin-control)). Rights risk, status and comments are admin edits, kept in the database
  and never overwritten by a reseed

The seed stores this record with the pattern (`research`, with the batch's task), so the admin page can show it
without reading the seed files.

### The method as practised

The pilot (t-127) researched the 42 Kraftwerk and Depeche Mode sounds. The library had grown since the plan, which
counted 31. 26 sounds got one of 17 patterns, and 16 got a recorded reason why not. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t127-kraftwerk-depeche-mode.json`. What it taught the next batches
(t-128, t-129):

**An agent can't make the by-ear check, and the free web has almost no sources.** _Owner ruling, 2026-11-01:_ a batch
writes from what it can read, with fan transcriptions as starting points (`research.leads`, never `sources`). Each
pattern goes on its sounds behind the riff, and the owner's listen is the by-ear step. So every pilot pattern is _In
the style of_. Two leads that agree are still not two sources. The Just Can't Get Enough bass is the strongest case:
two independent leads agree note for note. That is the one the owner's listen could most easily raise to
_Reconstructed_.

**Where readable notes were, and weren't:**

| Tried                                                                    | Result                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Songsterr                                                                | **Worked.** Its public API (`/api/songs?pattern=`, `/api/meta/:id`) and its CDN serve every track of a transcription as JSON: pitches from string and fret, durations, bars, section markers and tempo. Most of the batch came from here. It had 16 of the 25 works searched.                    |
| BitMIDI                                                                  | **Worked.** A search API and direct `.mid` downloads, read with a small parser. Fan MIDI, often with echoes or played-in timing written as notes.                                                                                                                                                |
| Ultimate Guitar                                                          | Tabs are drawn by JavaScript; a fetch gets the title only.                                                                                                                                                                                                                                       |
| MusicRadar, Computer Music (Readly), MusicTech                           | How-to articles behind sign-ups or paywalls.                                                                                                                                                                                                                                                     |
| Publisher sheet music (Musicnotes, Sheet Music Direct)                   | Paid. These would be real sources (tier 3 or better) if bought.                                                                                                                                                                                                                                  |
| Audio analysers (SongBPM, AcousticBrainz)                                | Key and tempo guesses that disagree, by up to 40 bpm on Autobahn. Not used.                                                                                                                                                                                                                      |
| Gear write-ups (Mixdown's Gear Rundown, Syntorial's patch recipes, etc.) | Name the synth and describe the part, but give no notes.                                                                                                                                                                                                                                         |
| Hooktheory (TheoryTab)                                                   | Tried by t-169. A page gives the key, metre, tempo, the chords as numerals and the melody's range in plain text; the notes load from behind a sign-in. Two of the works t-169 looked for were there ("La Petite Fille de la Mer", "Love on a Real Train"), and their patterns cite it as a lead. |
| MuseScore                                                                | Tried by t-169. Its search refuses a fetch (403), and its scores need a sign-in to read.                                                                                                                                                                                                         |
| Noteflight                                                               | Tried by t-169. Its search isn't reachable without a sign-in (404).                                                                                                                                                                                                                              |
| Synth tutorial videos                                                    | Not tried by t-169: an agent can't watch a video, so notes shown on screen can't be read.                                                                                                                                                                                                        |

The readers were scratch scripts, not committed: they fetch someone else's work, which the repo never holds.

**What the rights rule decided.** The hook rule ruled out the part a lead sound was written for on seven works: The
Model, Computer Love, Home Computer, Pocket Calculator, Just Can't Get Enough, Everything Counts and Enjoy the Silence.
Four of those works gave their sounds another part instead: a counter-line, a sequence or the bass under the hook. The other three gave none.
The one-part rule also cost the Numbers snare its kick, so that pattern is plainer than the beat the record is known
for. The pilot showed the hook rule bites on most famous songs; the owner dropped it on 2026-11-01, and t-159 revisits
these works.

**What the sequencer couldn't express:**

- **A bar of 5/4.** Spacelab's rise ends in one, so the top note is held through a fourth bar of 4/4 instead.
- **Echoes written as notes.** Fan MIDI often writes the tape echo as notes (Autobahn's octave pulse). A pattern
  shouldn't carry those, and only a listen can pick them out.
- **Chords on a mono sound.** Only 3 of the 42 sounds' own riffs play chords. So a part made of dyads or four-note
  stabs (Pocket Calculator, The Model's pulsing fifths) can't go on most of them, and the batch test holds every other
  sound to single lines.
- **Long parts in eight bars.** Tour de France holds each chord for four bars; the pattern changes chord every bar so
  the 8-bar limit still shows the movement.

**Time.** Roughly an hour and a half for the batch, by the session's clock. The first hour went on finding sources that could be
read at all. Once the two readers existed, a work took a few minutes: list its tracks, pick the part and the bars,
write it down. Writing why a sound has no pattern took as long as writing one.

**For the next batches:**

- Start from Songsterr and BitMIDI. Where neither has the part, write a best guess rather than searching further, or
  a reason only where there is no part to write (owner ruling, 2026-11-02; see
  [Free leads, and a best guess where there are none](#free-leads-and-a-best-guess-where-there-are-none)).
- Read the record kept per pattern before listening: it says which bars were taken, which lead they came from, and
  what was changed.
- If the owner wants _Reconstructed_ or _Transcribed_ patterns, a source has to come from outside the free web. A batch
  never buys one (owner ruling, 2026-11-02), so that means the owner's own ear on the leads.

**The second batch (t-128): Daft Punk, Jean-Michel Jarre and Tangerine Dream.** The plan counted 55 sounds; there
were 75, 25 for each artist. 33 got one of 20 patterns, and 42 got a recorded reason why not. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t128-daft-punk-jarre-tangerine-dream.json`. It used the pilot's
method and readers, and found:

- **The free web covers the three artists very unevenly.** Songsterr had 19 of the works the sounds name (Daft Punk 15,
  Jarre 3, Tangerine Dream 1), and BitMIDI had files for Daft Punk and Jarre but none for Tangerine Dream. Nothing was
  found for Phaedra, Rubycon, Zeit, Tangram, "White Eagle" or "Mysterious Semblance at the Strand of Nightmares",
  which 16 of the Tangerine Dream sounds name. So Tangerine Dream got three patterns, two of them from "Stratosfear"
  (a work no sound names) for the sounds that name no work.
- **Ten Jarre sounds are effects**: wind, surf, waves and zaps made by the patch from noise. They have no part to
  transcribe, and are recorded as such rather than searched for.
- **The hook rule bit again**, on Da Funk, Around the World, Harder Better Faster Stronger, Derezzed, Robot Rock,
  Technologic, Oxygène IV, Second Rendez-Vous and Love on a Real Train. Most of those works still gave their sounds a
  part: the break figure, the bass under the hook, the arpeggio or the pad. Five Da Funk sounds now play one break
  figure, at the two octaves the record has it. (The hook rule was dropped on 2026-11-01; t-159 revisits these works.)
- **A mono sound took the lower note** where the only usable part doubles at the octave (Around the World's pluck
  line). Where a part is two- or more-note chords and nothing else is usable, the sound gets no pattern, as in the
  pilot.
- **A Songsterr beat's duration already includes its triplet.** A triplet eighth is `[1, 12]` and also carries a
  `tuplet` flag; scaling by the flag as well, as the pilot's scratch reader did, counts the triplet twice. So a reader
  should scale by `tuplet` only when the duration's denominator is a power of two. No pilot pattern used a triplet;
  Oxygène IV's arpeggio is the first on the `1/8t` grid.
- **Tempos the leads disagree on are left unset**, as the pilot did: Oxygène IV (123 and 125) and Équinoxe 5 (157 in
  its only lead, which seems fast).

**The hooks (t-159).** Once the owner dropped the hook rule, t-159 went back to the 16 works it had ruled out, using the
same leads, and to Stratosfear, whose theme t-128 had set aside as a hook in a sound's reason rather than in the list
above. 13 works gave 15 hook patterns (Da Funk's riff at two octaves, and Derezzed's riff and its bass), on 26 places. 19 of the places are on sounds that already had another part of the
work, and those sounds now carry both, the hook behind the part they had. Seven sounds that had none got one: the
Home Computer bleep arp, the Enjoy the Silence lead, two Derezzed sounds, the Robot Rock lead, the Oxygène whistle
and the soaring Tangerine Dream lead (the Stratosfear theme). Four works still give no hook pattern:

- **The vocal melody is still never taken.** Pocket Calculator's only single-note line is the vocal, and Harder,
  Better, Faster, Stronger's talking riff is the vocoded vocal. (The Model's verse synth doubles the voice too, but
  its intro riff is a synth part, and that is what its sounds got.)
- **Chords on a mono sound.** Technologic's only transcription is a guitar riff in two-note shapes.
- **No usable notes.** The Second Rendez-Vous transcription has only a few scattered guitar bars, which can't be placed
  as the laser harp's melody without a listen.

One hook was set aside in a pattern's notes rather than a reason, and t-159 did not revisit it: Digital Love's intro
melody. Its sound already plays the solo, and the intro is in the same lead's "Lead Synths" track. t-129 added it (see
below).

Two things for the next batches:

- **A hook can be on a track the batch didn't read.** The Everything Counts hook is on Songsterr's "Synth IV"; the pilot
  took its held line from "Synth III". Oxygène IV's melody is on the "Wind" track in triplet swing, and its held notes
  are lengthened from the "Synth" track, which doubles it straight.
- **A Songsterr beat's duration already includes its dots**, as it does its triplet, and a grace note takes no time of
  its own. The rewritten reader got both wrong at first, which showed up as bars of 4½ beats.

**The third batch (t-129): Brian Eno, Daniel Lanois, Vangelis and Boards of Canada.** The plan counted 53 sounds; there
were 77 (Eno 35, Vangelis 19, Lanois 13, Boards of Canada 10). 31 got one of 16 patterns, and 46 got a recorded reason
why not. The batch is `prisma/seeds/app-knowyoursynth/data/patterns/t129-eno-lanois-vangelis-boards-of-canada.json`.
It used the same method and readers, and found:

- **Ambient works are almost never transcribed.** Songsterr and BitMIDI had nothing from Music for Airports (12
  sounds name it), On Land, Thursday Afternoon, Neroli, Discreet Music or the Apollo steel parts, or 11 of the 13
  Lanois works. What they had of Eno is mostly the song albums, in guitar and bass. Only one Eno pattern is a melody
  ("An Ending (Ascent)"); the others are three bass parts.
- **Film scores and Boards of Canada were well covered.** The Blade Runner End Titles has a transcription and a MIDI
  file that agree note for note, which gave four patterns: the theme, the chords, and the sequence at two octaves. The
  Chariots of Fire MIDI file is in the record's key, D♭, with the brass melody and the strings on their own tracks. Both
  works the Boards of Canada sounds name, "Olson" and "Roygbiv", gave a melody and their chords.
- **Held parts carry as written.** The drones and pads took held chords and bass notes without any change the method
  doesn't allow. What is lost is what the patch does: the swell, the drift, the tape wow.
- **A wordless choir is still the vocal melody.** Conquest of Paradise's tune is sung, so its choir sound got the string
  line under it.
- **In older transcriptions a tied note has no pitch of its own.** Its fret reads 0, so read naively it is a new
  open-string note. The reader now lengthens whatever the tie's string last played. A tie onto a note struck before the
  bars taken is struck again where they begin. The tracks t-159 read were checked, and none of their ties is affected.
- **Five sounds name no work** (Vangelis's Swelling Film Brass and four Boards of Canada sounds), and got the work by
  their artist whose notes suit them, as t-128 did for Tangerine Dream. Each pattern's notes say so.
- **Digital Love's intro**, which t-159 left in the solo's notes, is now a pattern on the same sound, in t-128's file:
  bars 9–16 of the "Lead Synths" track. Bars 4–5 have one more phrase, but bars 6–8 are silent.

**The fourth batch (t-160): funk, soul and R&B.** The first batch under the 2026-11-02 ruling, and the first not grouped
by artist: every sound by 31 artists the gap audit found, from Bernie Worrell (19 sounds) and Herbie Hancock (11) to one
each by Anita Ward and Whitney Houston. The task counted about 81 sounds; there were 92 (G-funk has 6, the 80s ballads
5). 88 got one of 59 patterns, and only 4 got a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t160-funk-soul-and-rnb.json`. It found:

- **Funk and soul are well covered on Songsterr.** 40 patterns came from 34 transcriptions, 24 by fans and 10 by
  Songsterr's machine (below), among them the bass of "Flash Light" (on five sounds), "Chameleon", "Boogie On Reggae
  Woman", "Thriller" and "More Bounce to the Ounce", the "1999" stabs, the "Superstition" clavinet and Moog bass, and
  the "Nuthin' but a 'G' Thang" lead, which went on the six G-funk sounds and Dr. Dre's G-funk whine. One more, the "Sexual Healing" clap, came from a BitMIDI file's drum channel: the Songsterr
  transcription gives the drum machine to toms.
- **Many leads have the work but not the synth.** P-Funk songs are transcribed for guitar, bass and horns, and Worrell's
  synth is rarely a track. Where a sound named such a work ("Dr. Funkenstein", "Give Up the Funk", "Bop Gun",
  "Reach for It", "Kalimba Story"), it got the horn or guitar line instead, and the notes say so. Several bass and
  keyboard parts were played on synths on the record and are transcribed for bass guitar or guitar.
- **Ten transcriptions were made by Songsterr's machine**, not a fan, and give 11 patterns: "(Not Just) Knee Deep"
  (two), "One Nation Under a Groove", "Aquaboogie", "Bop Gun", "Boogie On Reggae Woman", "More Bounce to the Ounce",
  "Atomic Dog", "Reach for It", "Kalimba Story" and "You're the One". They were the leads found for those parts, so they
  were used, and each research record names its lead as machine-made: a weaker starting point than a fan's, and
  the first to check by ear.
- **18 patterns are best guesses**, on 21 sounds: four Parliament leads whose works have no transcription with a synth in it, the Hancock
  Rhodes sounds (the Chameleon comping, Mwandishi, "Butterfly", "Hang Up Your Hang Ups"), the Ring My Bell syndrum, the
  80s-ballad sounds, Donny Hathaway, D'Angelo, Hall & Oates, J Dilla, Jimmy Smith and George Duke's jazz-funk Rhodes.
  Most are keyboard sounds whose part is comping, which free transcriptions skip. A best guess on a chord sound is
  chords; on a mono sound it is a single line.
- **Four sounds have no part to write**: the two "Rockit" scratch sounds (turntable scratches), the "Rebel Without a
  Pause" siren (a sampled horn squeal) and Zapp's talk-box lead (the vocal through the synth).
- **Chords on a mono sound still take one line.** The "1999" stabs gave a second pattern, their top note, for the
  Pro-One stab and the Neutron's two-note stab. The "Once in a Lifetime" synth's dyads gave their top line.
- **A Songsterr pickup bar can hold more than its time signature says.** "Aquaboogie" opens with a bar of 1/4 holding two
  beats of notes, which a reader placing notes by position spills into the next bar. The reader now takes each note
  from its own bar only.
- **Octaves, not parts, were changed to suit a sound.** Where one part went on sounds an octave or more apart, it went
  twice, as Da Funk's did: the Chameleon bass and the Superstition clavinet.

**The fifth batch (t-161): British synth-pop and post-punk.** Every sound by 29 artists, from Gary Numan (11 sounds)
and Vince Clarke (9) to one each by Björk, SOPHIE and The Cure. The task counted about 71; there were 73. All 73 got one of 60 patterns, and none needed a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t161-synth-pop-and-post-punk.json`. It found:

- **This ground is the best covered yet.** 51 patterns came from 37 Songsterr transcriptions, among them "Cars" (four
  parts), "Are 'Friends' Electric?", "Blue Monday", "Vienna", "Enola Gay", "Don't You Want Me", "Don't Go", "Only
  You", "Rydeen" and "The Mother We Share". Unlike the funk batch, most have the synth parts as tracks of their own.
- **Nine transcriptions were made by Songsterr's machine**, one pattern each: "We Are Glass", "This Wreckage", "Say
  Hello, Wave Goodbye", "Being Boiled", "Quiet Life", "Technopolis", "Strict Machine", "Seventeen" and "Jóga". As in
  t-160, each research record says so.
- **Nine patterns are best guesses**, one sound each: Japan's "Ghosts", Goldfrapp's "Pilots", "The Dignity of Labour",
  SOPHIE's "Vroom Vroom", Metronomy's "Holiday", John Foxx's Metamatic, the Life Aquatic score and the two noise
  hi-hats. The free web has nothing of those works, or nothing with that part: the one "Warm Leatherette" transcription
  has the kick and snare and no hats.
- **Some synth parts are transcribed for guitar.** "We Are Glass", "This Wreckage", "Say Hello, Wave Goodbye", "Only
  You" and "Courtship Dating" have no synth track, so their sounds got the line the guitar plays, and the notes say so.
- **A sound naming only an artist or a genre got that artist's work.** The two plain CHVRCHES plucks got "The Mother
  We Share"; the early synth-pop pluck and the OMD lead got "Enola Gay"'s pre-theme line; the Erasure-era Clarke lead
  got "New Life", because no Erasure transcription has a lead synth line.
- **A theme mixing sixteenths with triplets doesn't fit one step size.** "Rydeen"'s second theme has both in its first
  four bars, so the pattern takes its last three, which have neither.
- **Octaves went twice here too.** The review found three parts on sounds an octave or more from them, so each went
  again in the sounds' octave: the Vienna strings for the two Vienna pads, the Cars string line for the Cars Vox
  Humana and the Only You arpeggio for the bright sequencer arp. The Blue Monday bass stays one pattern: its low
  notes sit where all four sounds' do, and only its octave jumps raise its middle.

**The sixth batch (t-162): 80s pop and arena synth hits.** Every sound by 30 artists, from Duran Duran (9 sounds) and
Talking Heads (8) to one each by Alphaville, Billie Eilish and Yello. The task counted about 81; there were 83. All 83
got one of 54 patterns, and none needed a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t162-80s-pop-and-arena.json`. It found:

- **The hits are covered as well as synth-pop was.** 50 patterns came from 36 Songsterr transcriptions, most with the
  synth parts as tracks named by player and instrument: "Take On Me", "Jump", "The Final Countdown", "Sweet Dreams",
  "Rio", "Hungry Like the Wolf", "Save a Prayer", "Everybody Wants to Rule the World", "Separate Ways" and "West End
  Girls" among them.
- **Two transcriptions were made by Songsterr's machine**: the Cars' "Let's Go" and Howard Jones's "What Is Love?". Haddaway's "What Is Love" comes from a fan's (LtLemonade's). The "She Blinded Me with
  Science" transcription names a fan but marks every track "retranscribed", and both its patterns say so.
- **Four patterns are best guesses**: three Howard Jones sounds and the two Spandau Ballet toms. The one transcription of Howard Jones's
  "What Is Love?" has bass, drums and vocal; nothing for "New Song" was found; neither "True" transcription has
  toms.
- **Brass stabs in chords went on the chord sounds whole.** The "Jump" riff's triads went on all five of its brass
  sounds, each of whose own riffs plays chords. "The Final Countdown" riff is a single line in its transcription, so
  all three Europe sounds got it, and the two poly ones got the chords under it as well. Where a mono sound's part was chords, it took
  the top line ("This Must Be the Place", the "Born Under Punches" comp, "Relax") or, for the low "In the Air Tonight"
  pad, the bottom one.
- **A drum track's notes are drum numbers, not pitches.** The "In the Air Tonight" snare sound got the snare hits from
  the kit's track, at the sound's own pitch. Songsterr's drum tracks carry no tuning, and that one gives the snare a
  number above the General MIDI range (91). The Simmons part of "Hungry Like the Wolf" is on a pitched track, so the
  new-wave tom took its lower pad.
- **A 12/8 transcription is a triplet pattern.** "Everybody Wants to Rule the World" is transcribed in 12/8 at 165;
  each eighth is one step on the `1/8t` grid at 110.
- **An odd-metre phrase loops whole.** The "I Got You" break is a bar of 6/4 then one of 4/4, so its pattern is ten
  beats long rather than cut to a 4/4 bar.
- **Played-in timing doesn't fit a step grid.** "The Chauffeur"'s recorder melody is transcribed off the beat by
  fractions no step size holds, so its flute sound got the intro figure.
- **A sound naming only an album or an era got a work from it**, as in t-161: the two Remain in Light sounds got "Born
  Under Punches", the early-albums Cars lead got "Just What I Needed", and the new-wave tom got the "Hungry Like the
  Wolf" Simmons fill. The Talking Heads works t-160 also read gave different parts here, on new keys.
- **Octaves went twice** for "Take On Me", "Sweet Dreams" and "West End Girls", whose sounds sit an octave apart.

**The seventh batch (t-163): film, TV, game and synthwave.** Every sound by 30 artists (31 names: one duo is spelled two ways), from John Carpenter (10
sounds) and Jan Hammer (6) to one each by Angelo Badalamenti, Koji Kondo and Yann Tiersen. The task counted about 67;
there were 78. 68 got one of 44 patterns, and 10 got a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t163-film-tv-game-and-synthwave.json`. It found:

- **Film and TV themes are well covered; modern scores and synthwave are not.** 32 patterns came from 22 Songsterr
  transcriptions, among them "Halloween", "Escape from New York", "Axel F", "Miami Vice Theme", "Crockett's Theme",
  "Nightcall", the "Stranger Things" theme, "Midnight City", "Blinding Lights", "Suspiria", "The Good, the Bad and the
  Ugly" and "Song of Storms". Nothing was found for Assault on Precinct 13, Drive, Solaris, It Follows, Under the Skin
  or "Flight from the City". The "Tech Noir", "Brokendate" and "Tick of the Clock" transcriptions have no synth part
  but the bass, and the one "Silk Road" is a machine-made guitar arrangement with no line that reads as
  the melody.
- **Many of these transcriptions are General MIDI arrangements**, with tracks named "Utwór 6" or "Stopa 9", or, in
  one "Miami Vice Theme", every track a nylon guitar. The part was chosen by its notes, and each research record names
  the track it came from.
- **Two of the transcriptions patterns came from were made by Songsterr's machine**: "Future Club" and "Paris,
  Texas". Three more were, and gave nothing a pattern could use: "Brokendate", "Tick of the Clock" and "Silk Road". The "Laura Palmer's
  Theme" transcription names a fan but marks every track "retranscribed", and its pattern says so.
- **12 patterns are best guesses**, on 14 sounds: the Precinct 13 riff, the Suspiria drone, the two Gunship sounds,
  the two Com Truise leads, Chromatics, the two Cliff Martinez sounds, Disasterpeace, Mica Levi, the two Jóhann
  Jóhannsson sounds and Kitaro.
- **Ten sounds have no part to write.** Eight are effects: Ben Burtt's droids and blaster, the "Pac-Man Fever" zap,
  Walter Murch's helicopter, the Das Boot sonar, the Fog foghorn and the Inception braam, one hit played once. The Chernobyl hum is a field recording. The
  Close Encounters sound is a sample-and-hold burble, and the one Close Encounters transcription has no tuning, so its
  notes can't be read as pitches.
- **A sound that arpeggiates a held chord gets the chord.** Three Stranger Things sounds run their own arpeggiator,
  so a played arpeggio would come out as repeated notes. They got the arpeggio's four notes held as one chord, for the
  patch to play; the four sounds that play the arpeggio as notes got the line. The Perturbator bass arpeggiates one
  held note, so it got the roots the "Future Club" bass pulses on, held.
- **The vocal melody is still never taken.** The Ecstasy of Gold soprano sound got the top of the strings under the
  soprano, as t-129's choir sound did.
- **A whole odd-metre phrase loops.** Six bars of Halloween's 5/4 piano figure are 30 beats, inside the 8-bar limit.
  The Escape from New York ostinato runs in dotted sixteenths and comes back to the bar line every third bar, so its
  pattern is three bars on the `1/32` grid.
- **Mixed tuplets still don't fit one step size.** The opening of "Gabriel's Oboe" mixes sixteenths with sixteenth
  triplets, so its pattern takes the next four bars. The Suspiria celesta is off the beat by fractions no step size
  holds, so its sounds got the same theme from the transcription's synth track.
- **One duo has two spellings.** "Kyle Dixon & Michael Stein" and "Kyle Dixon and Michael Stein" are the same artists,
  and the test's roster lists both; the rename is housekeeping's. The Stranger Things haunting lead also names S U R V
  I V E, their band, in its reference while its artist is the duo.
- **Octaves went twice** for the Escape from New York ostinato and the Suspiria theme.

**The eighth batch (t-164): prog, psychedelic and rock.** Every sound by 41 artists (42 names: one band is spelled two
ways), from Pink Floyd (12 sounds) and Rush (6) to one each by ? and the Mysterians, Thin Lizzy and U2. The task counted
about 80; there were 83. 77 got one of 64 patterns, and 6 got a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t164-prog-psychedelic-and-rock.json`. It found:

- **Rock is the best-covered ground yet.** 61 patterns came from 49 Songsterr transcriptions. Pink Floyd's and Rush's
  name every keyboard track by player and instrument ("Roger Waters - EMS Synthi AKS - Bassline", "Geddy Lee | Oberheim
  OB-X"), so "On the Run", "Welcome to the Machine", "Money", "Shine On You Crazy Diamond", "Tom Sawyer",
  "Subdivisions" and "Time Stand Still" all gave their synth parts directly. So did "Everything In Its Right Place", the
  "Lucky Man" and "Tarkus" Moogs, Wakeman's Minimoog on "Close to the Edge" and "Catherine of Aragon", the "Here Comes
  the Sun" Moog and the "Good Vibrations" Electro-Theremin.
- **Two transcriptions were made by Songsterr's machine**: "Svefn-g-englar" and "The Host of Seraphim". "Itchycoo Park"
  names a fan but marks every track "regenerated", and its two patterns say so in their lead.
- **Many sounds stand in for a guitar, an organ or a flute**, and got that part: the "Iron Man" riff (the roots of its
  power chords, as the transcription gives them), "Misirlou", the "Locomotive Breath" flute, Fripp's "Heroes" line,
  the "Discipline" figure, The Edge's "Where the Streets Have No Name" introduction, the "Boys Are Back in Town"
  interlude, the "I'm Only Sleeping" backwards guitar, the "96 Tears" organ and the "Won't Get Fooled Again" organ. The
  "Riders on the Storm" bass is a bass guitar on the record; both sounds are Manzarek's piano bass.
- **Where the patch makes the rhythm, the pattern holds the notes.** The "Welcome to the Machine" throb is one held note
  the VCS3 pulses, which the transcription writes as eighths on one track and as held notes on another; both sounds
  pulse it themselves, so they got the held notes. The Misirlou tremolo, The Edge's dotted-eighth echo and the "Machine
  Gun" stutter are likewise the patches', and the transcriptions write them separately or not at all.
- **Three patterns are best guesses**, one sound each: "Dream Weaver" (its transcription has the Minimoog bass and
  effects, no lead), the Gong space-rock pad (the one Gong transcription has no keyboards) and AMOK (machine-made,
  guitar, bass and drums only).
- **Six sounds have no part to write.** Five are effects: the four Hawkwind sweeps and swoops ("Silver Machine" has
  guitar, bass and drums only) and the "Larks' Tongues in Aspic" bowed cymbal. The "Time" clocks are a recording.
- **Some transcriptions mark a swing the reader ignores.** Songsterr sets `tripletFeel` on a bar, and it holds until
  another bar changes it. Six of the tracks taken are marked "8th". On an eighth-note grid the pattern's `swing` (67)
  carries it ("Money", "Itchycoo Park", "Good Vibrations"); on the triplet grid the off-beat eighths move to the last
  third of the beat ("The Boys Are Back in Town"). The "I'm Only Sleeping" bars mix sixteenths into the swung eighths,
  so they play straight and the record says so. The "Speak to Me" heartbeat is written as muted, unpitched hits in
  that feel, which the reader skips, so it was placed by hand on the `1/8t` grid at the sounds' own pitch.
- **Two-note sounds took two notes where the part has chords.** The paraphonic Neutron sounds whose riffs play dyads
  got the top two or bottom two notes of a part's chords ("Everything In Its Right Place", "Won't Get Fooled Again",
  "The Host of Seraphim"). Two of them got a single line, because that is all the transcription has: the "Iron Man"
  riff is written as the roots of its power chords, and the "Boys Are Back in Town" harmony is a second guitar (below).
  The mono sounds took one line, as before.
- **A second part is still never merged in.** The "Boys Are Back in Town" twin-guitar sound got Scott Gorham's line, not the
  harmony a third below it, and the "Discipline" pluck got Fripp's figure without Belew's.
- **Odd metres loop whole**: two bars of 7/4 ("Money"), four of 7/8 ("Tom Sawyer"), one of 5/4 ("Discipline"), 4/4
  with 6/4 ("Everything In Its Right Place"), 6/8 with 7/8 ("Golden Brown"), and three bars of 4/4 with one of 2/4
  (the "Strawberry Fields Forever" flutes). The "Tubular Bells" figure is 15/8 on the record but 7/4 in its
  transcription, which the pattern follows; it is the first one to check by ear.
- **One band has two names.** "Small Faces" and "The Small Faces" are the same band, and the test's roster lists both;
  the rename is housekeeping's, as t-163's duo was.
- **Octaves went twice** for the "On the Run" sequence, the "Shine On" Solina chords and the "Won't Get Fooled Again"
  organ's top line.

**The ninth batch (t-165): disco, acid, house, techno and industrial.** Every sound by 33 artists (34 names: Mr. Oizo is
also spelled without the point), from Giorgio Moroder (8 sounds), "Acid house" (9) and "Electro" (9) to one each by LFO,
Plastikman and Robin S. The task counted about 60; there were 77. 76 got one of 50 patterns, and one got a reason. The
batch is `prisma/seeds/app-knowyoursynth/data/patterns/t165-disco-acid-house-techno-and-industrial.json`. It found:

- **Club tracks are the worst-covered ground yet.** 24 patterns, on 33 sounds, came from 12 Songsterr transcriptions
  and one BitMIDI file: "I Feel Love", "Chase", "Popcorn", "Genesis", "Numbers", "Pacific 707", "Der Mussolini",
  "Headhunter", "Assimilate", "Show Me Love", "Closer", "Head Like a Hole" and, from BitMIDI, "Strings of Life". A
  BitMIDI "I Feel Love" agrees with the Songsterr bass's shape (root, root, fifth, seventh) in another key, and is a
  second lead on that pattern. Nothing was found for any of the acid records the sounds name ("Acid Tracks", "Higher
  State of Consciousness", "Acperience 1", "Land of Confusion", "Acid Phase", "Everybody Needs a 303", Ten Ragas to a
  Disco Beat), nor for "Planet Rock", "Mystery of Love", "Can You Feel It", "Just Want Another Chance", "The Bells",
  "Mentasm", "LFO", "Flat Beat", "Spastik", "You Don't Know Me" or "Bubble Metropolis".
- **26 patterns are best guesses**, on 43 sounds, the most of any batch. Most are 303 lines, written
  with the slides and accents the sequencer carries. Sounds naming one record share its guess: six "Acid Tracks" sounds
  (the five Phuture ones and the acid squelch named for it), the three Josh Wink and two Hardfloor sounds, and both
  Mentasm hoovers (Joey Beltram's and Second Phase's, the same record). The six "Acid house" basses share one line, and
  the two acid leads take it two octaves up.
- **Three transcriptions were made by Songsterr's machine**: "Pacific 707", "Der Mussolini" and "Show Me Love". The
  "Chase" transcription names a fan but marks every track "retranscribed"; a machine-made one agrees with its bass.
- **Electro sounds went to "Numbers"** where they could. Its transcription's drum track gave the two zap kicks their
  kick (each at its sound's pitch) and the 808 rimshot the snare; its bar-36 bass, which t-127 used, went on the three
  sync basses. "Planet Rock" has no free lead, so its five sounds (bass, kick, snare and two cowbells) and the zap
  percussion are best guesses.
- **Patches that sequence a held note got held notes.** Four Moroder sounds make the octave-bouncing "I Feel Love" bass
  themselves from one key (a sequencer or an arpeggiator in the patch), so they got the chord change's roots, a bar
  each; the System 55 one two octaves up, where its sequence is tuned. The "Chase" arpeggio got the clavinet's chord of
  each bar, held. As in t-163, a played sequence would come out doubled.
- **Drum parts went on percussion sounds at their own pitch**: the "Closer" snare on the industrial clang and the NIN
  metal hit, the "Assimilate" snare on the Skinny Puppy hit, and the "Numbers" kick and snare as above.
- **One sound has no part to write**: the rising siren named for "French Kiss" is an effect the patch's LFO makes.
- **A slide is not a chord.** The engine holds a slid note `SLIDE_OVERLAP` (0.05 of a step, 0.0125 of a beat at
  1/16) into the next one so a mono synth glides. The batch test's mono check read that overlap as two notes at once,
  so it now leaves it out, for a slid note only. A slide's own gate is a half step; the engine stretches it, so a swung
  slide overlaps by no more.
- **One artist has two spellings.** "Mr Oizo" and "Mr. Oizo" are the same artist, and the test's roster lists both;
  the rename is housekeeping's, as t-163's duo and t-164's band were.
- **Octaves went twice** for the "Headhunter" bass (for the Pro-One EBM bass) and the "Strings of Life" stabs (the
  Neutron's top two notes, an octave up).

**The tenth batch (t-166): 90s electronic, big beat, IDM and downtempo.** Every sound by 35 artists, from Alabama 3 (8
sounds) and Jon Hopkins and Portishead (5 each) to one each by Bicep, Darude and Wiley. The task counted about 73; there
were 82. 79 got one of 66 patterns, and 3 got a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t166-90s-electronic-big-beat-idm-and-downtempo.json`. It found:

- **The hits are covered; the albums and the underground are not.** 29 patterns came from 24 Songsterr transcriptions:
  "Sexy Boy", "La Femme d'Argent", "Kelly Watch the Stars", "Rhubarb", "Levels", "Sandstorm", "L'amour toujours",
  "Roads", "The Rip", "Girls", "Out of Space", "Hey Boy Hey Girl", "Block Rockin' Beats", "Born Slippy", "Scary
  Monsters and Nice Sprites", "Ghosts 'n' Stuff" and "Woke Up This Morning" among them. Four came from BitMIDI files:
  "Eple", "For an Angel", "Strobe" and Orbital's "Belfast". Nothing was found for "Open Eye Signal", "Glue", "Kerala",
  "Re-Rewind", "Eskimo", "Horizons", "Delta", "Two Thousand and Seventeen", "Vision One", "The Big Jump", "Terrorist",
  76:14, Lifeforms, Pop or A Strangely Isolated Place, nor for any Alabama 3 record but "Woke Up This Morning".
- **33 patterns are best guesses**, on 40 sounds: five Alabama 3 basses, all five Jon Hopkins sounds, three Orbital ones,
  and the pads and basses of the less-transcribed artists. Sounds naming one work share its guess (the two "Ain't Goin'
  to Goa" basses, the two Open Eye Signal basses, the two Zero 7 leads), and an artist's sound naming no work shares
  the guess of one that does (the Bonobo keys, the Prydz sweep, the Tycho pad, the Underworld rolling bass).
- **Five patterns came from transcriptions Songsterr made by machine**: "A New Error" (two), "Archangel", "Awake" and the
  "For an Angel" pluck. Three more machine-made ones gave nothing a pattern could use: "Opus" and "Chime" have only
  bass and drums, and "Halcyon + On + On" is a guitar arrangement. The "Woke Up This Morning" transcription marks every track "retranscribed", and both its
  patterns say so.
- **Three sounds have no part to write**, all effects: the two Autechre glitch sounds, whose pitch the patch's sample
  and hold throws at random, and the Burial rain.
- **Patches that make their own rhythm from a held key got held notes** again, as in t-163 and t-165: the Opus, Four
  Tet, Halcyon and Tycho arps take their chords held; the Gas pulse, the Big Jump squiggle, the Röyksopp wind-up, the
  Neutron's Open Eye Signal pulse and the SynTrx build take held notes; and the Super Gemini Hopkins drone takes held
  fifths. The Take 5 Open Eye Signal pulse plays its sequence as notes, so it shares the bass.
- **Tempos are the transcriptions'.** "Block Rockin' Beats" is written at 210 in eighths, so its pattern plays it at
  105 in sixteenths. "La Femme d'Argent" (160), "A New Error" (166) and "Awake" (176) may be written at twice the
  record's pulse too; their notes say so, for the owner's listen to settle.
- **The vocal is still never taken.** The "Levels" transcription's "Vox" track is the sampled vocal; the riff came from
  its "Layer 1" track instead. The "In the Waiting Line" melody track reads as the sung tune, so the Zero 7 leads are
  best guesses.
- **A part was found on the wrong instrument often.** The "La Femme d'Argent" bass is a bass guitar, "Alone in Kyoto"
  and "Awake" are guitars, and the Mysterons line is written for synth strings where the record has a theremin. The
  pad sound for "Strobe" took the file's organ, the nearest part to a pad it has, and the Moderat stab took the
  transcription's broken piano chords.
- **6/8 and 5/4 loop whole**: "A New Error" is four bars of 6/8, and "Rhubarb" two of 5/4. Orbital's "Belfast" figure
  is three notes in eighths, so its pattern is three bars, eight turns of the figure.
- **Octaves went twice** for the "Woke Up This Morning" bass (for the TD-3) and the Open Eye Signal roots (for the
  SynTrx).

**The eleventh batch (t-167): electronic pioneers, Berlin school and krautrock.** Every sound by 33 artists, from Wendy
Carlos (7 sounds) and the BBC Radiophonic Workshop, Isao Tomita and Terry Riley (6 each) to one each by Roger Payne and
Pierre Schaeffer. The task counted about 68; there were 79, because the library had grown (Riley 6, Delia Derbyshire 4)
and the one "Cluster & Eno" sound was in no batch. 55 got one of 43 patterns, and 24 got a reason. The batch is
`prisma/seeds/app-knowyoursynth/data/patterns/t167-electronic-pioneers-berlin-school-and-krautrock.json`. It found:

- **The classical works have free scores.** The Mutopia Project publishes typeset editions of public-domain scores
  with MIDI files, which the scratch MIDI reader reads. Eight patterns came from them: three Bach two-part inventions
  (F, both hands, D minor and B♭) and the "Wachet auf" chorale for the Carlos sounds; Debussy's "Arabesque No. 1" and "Clair de
  lune", and Holst's own hymn setting of the Jupiter tune ("Thaxted"), for the Tomita ones. Fan MIDI files on BitMIDI
  gave three more: Purcell's funeral march (Carlos's Clockwork Orange title music), the "Mars" ostinato and "The Swan"
  (Clara Rockmore's cello line).
- **A score does not make a pattern _Transcribed_.** The task asked whether these could be the library's first
  _Transcribed_ or _Reconstructed_ patterns. They can't yet. A public-domain score is tier 1 for Bach's or Debussy's
  notes, but the part on the record is Carlos's or Tomita's: the octaves, the ornaments, the tempo and the voicing
  are theirs, and only a listen can say how far the record departs from the score. So the score is a lead like any
  other, and every pattern from one is _In the style of_. The rights rule is unchanged: the recording and the arrangement
  belong to their rights holders even when the composition is free, so one part and 8 bars still hold. The Invention
  in F's left hand went on the two-part Switched-On Bach sound as its own pattern, not merged with the right hand.
  It is the subject an octave down, and the pattern takes it down a second octave, so all of it falls below the
  Solar's split at F♯4 and plays on the left plates; it is checked as a two-octave copy. The subject's own lowest F
  is F4, below the split, so on the Solar those notes play on the bass side.
- **The rest of the ground is barely transcribed.** Songsterr had five of the works the sounds name: the 1960s "Doctor
  Who" theme (its gallop and its melody), "Ghost Rider" (the riff, and its root for the SynTrx sound), "Hallogallo"
  (the low E pulse), "Plantasia" (machine-made) and "E2-E4" (marked "regenerated", with the chords as stabs and no
  sequencer part, so its pattern breaks the lead's chords into an arpeggio and says so). Nothing was found for
  Schulze, Riley, Kaitlyn Aurelia Smith, Cluster, Sun Ra, Laurie Spiegel, Nils Frahm, Caterina Barbieri, Popol Vuh,
  Patrick Gleeson's Sextant, Silver Apples' "Oscillations", "Baroque Hoedown" or Music for 18 Musicians.
- **25 patterns are best guesses**, on 31 sounds. Sounds naming one work share its guess (the two Cluster "Sowiesoso"
  sounds, the two "Baroque Hoedown" sounds), and an artist's sound naming no work shares one that does (the SynTrx
  Riley, Spiegel and Schulze sounds).
- **24 sounds have no part to write**, the most since t-129. Fifteen are effects: five of the six Radiophonic Workshop
  sounds, the Sonic Seasonings crickets, Schaeffer's train, Czukay's shortwave radio, the Forbidden Planet circuit,
  Raymond Scott's robot, Daphne Oram's bird, the three Ciani sounds and Derbyshire's tape-loop bells. Seven play
  themselves, their pitch thrown at random or set by the patch's own sequencer: Raymond Scott's random bleeps, the
  three Subotnick sounds, Charles Cohen's Easel and the two Reich phasing sounds. The
  humpback whales are a recording, and the "O Superman" "ah" is the vocal.
- **Patches that make their own pattern from a held key got held notes** again: the Schulze drones, the Cluster &
  Eno overtone steps, the Silver Apples drone, the SynTrx Suicide pulse, and two chords for the Riley arpeggio and
  tremolo sounds. The Curved Air sequence on the Solar got only the two keys its riff gives it. The Silver Apples
  arpeggiator sound got a single line, because the batch test holds a sound whose riff has no chords to one note at a
  time.
- **The tempo of a score's MIDI file is the engraver's**, not the composer's marking. The patterns keep it, as they
  keep a transcription's, and their notes say so where it matters (the Arabesque at 144).

**The twelfth batch (t-168): ambient, classical, jazz and world.** Every sound by 52 artists under 54 names, from Joe
Zawinul and Éliane Radigue (5 each) and La Monte Young (4) to one each by Abing, Kodo and Yo-Yo Ma. The task counted
about 77; there were 90, because Radigue and Young had grown. 83 got one of 73 patterns, and 7 got a reason. The batch
is `prisma/seeds/app-knowyoursynth/data/patterns/t168-ambient-classical-jazz-and-world.json`. It found:

- **Jazz is well transcribed; ambient is not.** 19 Songsterr transcriptions gave a pattern each: Birdland (the tenor's
  theme, since the transcription's synthesizer tracks hold the counter-line there), Black Market and A Remark You Made
  (Zawinul's ARP 2600), Continuum, So What (the bass call), Bags' Groove (the vibes head), My Favorite Things,
  Libertango, Foggy Mountain Breakdown, Scotland the Brave, Orinoco Flow, Danse Macabre (the xylophone track), the
  Mr. Lawrence opening figure, the Duel of the Jester theme, First Light and the Sunn O))) drone. Three were made by
  Songsterr's machine: The Trans-Love Express, Rising and Near Light. Four BitMIDI files gave Sugar Plum Fairy (the
  celesta theme and the pizzicato), Storms in Africa, Are You Going with Me? and Juke. Nothing was found for Biosphere,
  Yoshimura, Roach, Basinski, Hassell, Radigue, Young, Stars of the Lid, Kali Malone, Sakamoto's async or any of the
  world-music sounds but Rising, Scotland the Brave and Libertango.
- **Only two of the classical works had a free score.** The Mutopia Project has Bach's Toccata and Fugue in D minor and
  the first cello suite; as in t-167, a score is a lead, so both are _In the style of_. The Toccata's run is in
  sixty-fourth notes, finer than the sequencer's grid, so its pattern doubles every value and the tempo, which plays
  the same. Nothing free was found for Mozart's Adagio for glass harmonica (K. 356), though its score is in the public
  domain, nor for Pérotin; Ligeti, Messiaen, Leroy Anderson and Richter are in copyright.
- **47 patterns are best guesses**, on 50 sounds. The three Fripp & Eno loop sounds share one, as do the two
  Basinski sounds. An artist's sound naming no work got its artist's lead where one was found (the Ponty violin, the
  Arnalds pad) and a guess where not.
- **Seven sounds have no part to write.** Six are Solar classic drones: their pitches are set on the generators' TUNE
  knobs and the keyboard only opens the gate, so a pattern can change when they sound but not what. The seventh is
  Yoshimura's raindrops, whose pitch the sample and hold throws at random.
- **Drones got held notes**, as in t-167, wherever the key sets the pitch: the Radigue, Young, Roach, Hecker and Ligeti
  drones, the khoomei fundamental and the Biosphere tones. The arpeggiator sounds (Storms in Africa, The Pearl) got
  chords.
- **One pattern is written for its sound's keyboard.** The Black Market sound mirrors the keys around middle C, as
  Zawinul's inverted ARP 2600 did, so its pattern holds 120 minus each pitch the transcription gives. On it the theme
  comes out as written; on any other sound it would play upside down, so it sits on that one alone.
- **A key a transcription doesn't share with the sound.** Scotland the Brave is written as the pipes sound, near B♭;
  the pipe sound's drone is tuned to A, as pipe music is written, so the pattern is a semitone down.
- **Swing is written out.** So What's bass is marked swung; with the pattern's own swing, each delayed off-beat ran
  into the next note, which the batch test reads as two at once. The pattern puts each off-beat eighth two-thirds into
  its beat on the triplet grid instead.
- **Two artists have two spellings**: "Tchaikovsky" and "Pyotr Ilyich Tchaikovsky", and "Fripp & Eno" and "Robert
  Fripp and Brian Eno". The test's roster lists both; the renames are housekeeping's.

**Best guesses for the first three batches (t-169).** t-127, t-128 and t-129 ran before the owner's 2026-11-02 ruling,
so they left 97 sounds with a reason, 72 of them for want of a free lead. t-169 gave those 72 one of 66 patterns, in the
batch files they were already in, and left 25 reasons: the sounds with no part to write. It found:

- **Two more free sites have something, and two have nothing readable.** Hooktheory's TheoryTab has the key, tempo and
  chords of "La Petite Fille de la Mer" and "Love on a Real Train", which gave the Vangelis pluck and the Tangerine Dream
  wah pad their chords; both cite it as a lead, so neither is a best guess. MuseScore and Noteflight can't be read
  without signing in. See the table above.
- **64 patterns are best guesses**, written without a lead. Sounds naming one work share its guess (the two Music for
  Airports "1/1" sounds; five "2/1" loop and pad sounds). A sound naming no work got a guess at its artist's style (the
  Depeche Mode bell lead, the Tangerine Dream drone, the Eno and Lanois shimmer pad), as the task asked.
- **The older batches' date doesn't change.** The batch test lets a best guess sit only in a batch researched after
  the ruling. These patterns sit in batches dated 2026-11-01, so each one's notes say "Written by t-169 on 2026-11-02",
  and the test reads that date when it is there. It checks the task and date against its own list of tasks that added
  guesses later, so a pattern can't give itself a date.
- **Patches that play themselves split two ways**, as in t-167 and t-168. Where the key still sets the pitch (the Model
  D pulse and ostinato, the System 55 sequence, the Neroli tones, the White Eagle arpeggio, the Phaedra arpeggio) the
  pattern holds the keys or the chord. Some patches change what a written key does, so the pattern is written for the
  patch: the "Pocket Calculator" bleeps stay within a fourth of middle C, because the cable triples each interval from
  it, and "The Maker" strikes a low A with each phrase for the CAT's drone and swell. Where the pitch is random or set
  by the patch (the Berlin sequence on the 2600, the SynTrx bells, the Solar generative bells and its Zeit classic
  drone), the sound keeps a reason, reworded to say so.
- **Mono sounds named for chord parts got a line**: the Oxygène strings on the Solar a top line, "The Big Ship" its
  roots, "Pocket Calculator" a bleep line and a plucked figure. Only the poly sounds got chords.
- **The 25 reasons left** are the 14 effects (the Jarre wind and surf, the "Contact" riser, the three Eno treatments),
  the four patches above, the two random Jarre sounds, the "Boing Boom Tschak" voices, the "Computer World" vocoder,
  the "Tour de France" breath and the two Depeche Mode metal-percussion sounds, which were sampled metal.

**Sounds added after the batches (t-191 on).** A library that grows (the `library-150` sweep) adds sounds by artists a
batch already covers, and the roster test fails until the batch looks at each one. The TB-303, TD-3 and Donner B1
added 99 such sounds:

- **A pattern where the batch has one of the part the sound plays**: the work it names, or for a sound naming no work,
  a part of the same kind (a bass line for a bass, an arpeggio for a sequence, percussion for percussion) by its
  artist or carried by peer sounds with the same credit. The part comes first and the register second: a riff in five
  takes the five-four Halloween figure, not an ostinato in four that sits nearer, and a sequence takes a sequence, not
  the held keys written for a patch that sequences itself. 74 of the 99.
- **In the sound's register**: the pattern's median note (the middle note, or halfway between the two middle notes)
  within six semitones of the riff's. Where the closest of a pattern and its copies is further, a `-low` or `-high`
  copy carries it, written as the batches' own copies are: the same leads, its part saying where it plays, and its
  notes saying it was moved from the pattern and by how much. 40 copies, each an octave or two. The batch tests hold
  this: no sound is on both a pattern and its copy; the earlier batches' 131 placements further than six semitones
  can't grow; and every copy is held to its pattern, moved evenly the way its key says, by whole octaves unless the
  test names it as retuned, with the same timing, grid, leads and work, and the same role and credit unless the test
  names it as recast.
- **A reason otherwise**, saying which: the batch has no pattern of the part the sound plays, the work it names has no
  pattern yet, it is an effect, or its riff already plays the public-domain score. 25 of the 99.

The Mantis and Malevolent sounds of t-190 were placed before these rules, and merged first. Held to them: six that
were on both a pattern and its copy keep the one in their register, the five-four Mantis ostinato keeps the Halloween
figure and leaves the held low strings, and 25 more placements move to 24 copies (the two Lucky Man sounds share one).

**The Jupiters' sounds (t-192)**, placed by the same rules after t-191 merged. The Jupiter-8, Jupiter-6 and Jupiter-4
added 131 sounds by artists a batch covers:

- **86 sit on a pattern**: the work the sound names, or, for a sound naming no work, a part of the same kind that its
  artist or a peer with the same credit already has. The part comes first and the register second: within six
  semitones of the riff, median to median. A sound whose arpeggiator plays from held chords takes held chords, never a
  part written out, which the arpeggiator would play over again; a sound without one never takes chords written for an
  arpeggiator.
- **27 of those 86 sit on an octave copy**, carrying a pattern that would otherwise sit out of the sound's register: 22
  copies are new, and 5 sounds join a copy t-191 had made of the same pattern by the same move. Each copy is made from its source
  and nothing else: its name and part are the source's plus where it moved ("…, an octave down"), and its
  notes say where it moved from and point to the source for the research, keeping only the source's "Written by" line
  and its closing _In the style of_ passage. A copy never carries what its source says about the source's own sounds.
  The five shared copies were written this way too, since the part each gave as where t-191's sound plays now carries
  two.
- **45 keep a reason**, saying which applies: its arpeggiator plays the line from the chords it holds, and the work or
  artist has only parts written out; the work's pattern is another part; the work has no pattern yet; the artist's
  patterns are other kinds of part; it is an effect; or its riff already plays Bach's score.
- **Shared patterns' notes now hold for every sound on them.** 27 sentences that counted or described only their first
  sounds ("Both sounds are single-voiced", "The sound names the album") were reworded, and two say which sound they
  were written for.

**The K-2, 2600, Kobol and WASP Deluxe sounds (t-196)**, placed by the same rules. Of their 344 new sounds, 5 are by
artists a batch covers, four on the 2600 and one on the WASP Deluxe; the rest name artists, genres and traditions no
batch lists.

- **None sits on a pattern.** The DUO line naming "Birdland" would fit Birdland's theme by register, but it plays
  every note as a pair, one key for each oscillator, and on the theme's single line both would play the same note.
- **5 keep a reason**: the DUO line, for that; the WASP Deluxe's Vince Clarke arpeggio naming "Oh L'amour", whose work
  has only its bass line; two name works that have no pattern yet ("Blue Wind", "Oxygène (Part II)"); and the fifth is
  a sample-and-hold effect whose riff only holds two long keys in turn.

**The DeepMind 12D, UB-Xa D, PRO-800 and Poly D sounds (t-194).** Of their 358 new sounds, one is by an artist a batch
covers: the Poly D's Vince Clarke sequence naming "Oh L'amour". It keeps a reason, as the WASP Deluxe's arpeggio does,
because the work has only its bass line; t-161's count moves to 97. The rest name artists, genres and traditions no
batch lists.

**The Grandmother, 2-XM, CAT and PRO-1 sounds (t-195)**, placed by the same rules. Of their 431 new sounds, 188 are by
artists a batch covers, in all twelve batches. A sound's artist is spelled as its batch's roster spells it ("Booker T. &
the M.G.’s", "CHVRCHES"), since the roster test matches names exactly and a variant spelling leaves the sound unchecked.

- **96 sit on a pattern**: the work the sound names (or, for one naming an album, that album's part: "Creek" for
  Green), the part first and the register second. A Grandmother sound whose arpeggiator plays from held chords takes
  held chords ("Oxygène IV: pad chords", "A Rainbow in Curved Air: held chords"); a patch that steps by itself from
  one held key takes the held keys written for one ("Rubycon: ostinato keys" on the sample-and-hold sound).
- **31 of those sit on an octave copy**: 21 copies are new, one sound each, written as the sweep's are, and 10 sounds
  join a copy the batches already had. One new copy is `spastik-pings-high-2`, an octave up, because the plain `-high`
  is t-191's copy two octaves up.
- **92 keep a reason**: the work has no pattern yet; the work's pattern is another part; the batch has the part as
  chords and the sound plays one line, or as three-note chords and the CAT or 2-XM plays two, or rings two notes at
  once and the 2-XM plays in unison; the work's pattern holds one root for a patch that tunes its own fifth, and the
  CAT holds its fifth as a second key; its arpeggiator would play a written part over again; its sample and hold or
  LFO plays the line from one held key; or it is an effect.
- Thirteen patterns' notes that spoke of "the sound" or "both sounds" now say "the sounds", and two say which patch a
  sentence was written for. Rubycon's part no longer describes one patch's line, and Clair de Lune's closing passage
  now opens "_In the style of_:", so its octave copy keeps a whole sentence.

**The Polivoks, 0-COAST, minilogue xd and JP-8080 sounds (t-250)**, placed by the same rules. Of their 433 new sounds,
169 are by artists a batch covers, in all twelve batches.

- **86 sit on a pattern**: the work the sound names (or, for one naming an album, a part of the same kind on it:
  "Speak to Me" for The Dark Side of the Moon, "I'm Only Sleeping" for Revolver's reversed swells), the part first and
  the register second. The minilogue xd's and JP-8080's arpeggiator sounds take held chords ("Chase: chords",
  "Stranger Things: the arpeggio as a chord"). A two-voice Polivoks sound may sit on a single line, as its riff plays
  both voices from one keyboard.
- **22 of those sit on an octave copy**, 21 copies new, an octave each, written as the sweep's are; the two Jan Hammer
  leads share "Miami Vice Theme: lead, an octave up". The Halloween figure's copy is `halloween-piano-figure-low-2`,
  since the plain `-low` is two octaves down. The Biosphere drone names Substrata and takes "Poa Alpina", a track on
  it, an octave down, as the sweep copies move one octave only.
- **61 keep a reason**: the work has no pattern yet; the work's pattern is another part; the batch has the part as
  chords and the sound plays one line, or as written chords where the minilogue xd's CHORD mode builds a chord from
  each key; the work's chords have more notes than the minilogue xd's four voices; its arpeggiator would play a written
  part over again; it plays its own rhythm from a held key (the 0-COAST's EOC and clock patches, the Polivoks's
  repeating envelopes and stepped modulator, the JP-8080's gate and sample and hold); or it is an effect.
- Twenty-five patterns' notes that spoke of "the sound" now say "the sounds" where it holds for all of them, and name
  the patch otherwise ("The 2600's “Funk Solo Lead” names no work").

## Rights

_Proposed. The owner's call; goes to the `f-launch` legal review._ The owner dropped one proposed limit on
2026-11-01: that a work's main hook, if it fits in 8 bars, is never taken whole. A hook may now be recreated within the
limits below.

A recreated part is still a reproduction of a melody, however short, so the library limits how much it takes and says
what it is:

Here a _part_ is a part of the work: the bass line, the lead, the arpeggio. The sequencer's parts A and B are something
else (see [Reducing a part to a loop](#reducing-a-part-to-a-loop)).

- **One part of a work**, never two parts of the same work together, and never the vocal melody.
- **At most 8 bars**, and no longer than the passage that repeats on the record. The 8 bars count the chain played
  through once. Parts A and B with a chain of `[0, 0, 0, 1]` and 2-bar parts are 8 bars.
- **Labelled every time**: "Inspired by" with the work and artist, the fidelity, and, on the pattern's detail, the line
  _"A short recreation for learning. Not the original recording; the work belongs to its rights holders."_
- **No downloadable copy**: a library pattern plays in the app, and can be copied into My patterns. It is not offered
  as a MIDI file.
- **No samples, ever.** Patterns are notes played through our synths.

The pattern library is named in `f-launch`'s legal-review scope on the Hub (added by t-121).

## Admin control

_Asked for by the owner on 2026-10-31, the rights statuses ruled on that day, and built by t-156 on t-122's table and
t-126's admin page. As built: [Admin control as built](#admin-control-as-built)._

Admins can see where every library pattern came from and control it without a deploy. Each pattern carries four
things beside its [provenance](#provenance): its origin, its rights risk, its status and admin comments.

### Origin

Who or what made the pattern's notes. Exactly one of:

| Origin               | Means                                                  |
| -------------------- | ------------------------------------------------------ |
| **AI-generated**     | Written or transcribed by an agent                     |
| **Human-authored**   | Written by the owner or an admin                       |
| **User-contributed** | Came from a user's My patterns, taken into the library |

With it, the pattern records who or what made it (the agent and session, or the user) and when. _Owner ruling,
2026-10-31:_ every current riff is _AI-generated_. Research batches (t-127 on) record _AI-generated_ and the
agent that wrote each pattern.

Origin is separate from fidelity. An _AI-generated_ pattern can be _Transcribed_ if its sources support it, and a
_Human-authored_ one can be _In the style of_.

### Rights risk

An admin-set status, always with a reason. _Owner ruling, 2026-10-31:_ the statuses are:

| Status           | Means                                                       |
| ---------------- | ----------------------------------------------------------- |
| **None**         | Nothing in it is taken from a specific work                 |
| **Needs review** | It recreates a specific part, and no one has checked it yet |
| **Cleared**      | Checked against the [rights rule](#rights), and it fits     |
| **Blocked**      | It must not be shown. A blocked pattern is always disabled  |

A pattern starts at **Needs review** if it is _Transcribed_ or _Reconstructed_, and at **None** if it is _In the style
of_. An admin can raise or lower it, with a reason. The `f-launch` legal review works from this list.

### Status

**Enabled** or **disabled**. A disabled pattern is hidden from every user-facing place: the synth page's picker
(t-123), suggestions (t-125) and the public pattern reads. It is never deleted, so the
[no-delete rule](#reviewing-the-current-riffs) still holds. It stays in the admin list and can be enabled again.

- If a sound's default is disabled, the sound plays its next enabled pattern that can be a riff, and its riff is
  rewritten to it. Enabling the pattern again gives the sound back.
- A sound keeps at least one enabled pattern it can play. A change that would leave one with none warns the admin
  first. If they go ahead, the sound keeps the riff it has.
- Copies a user has already taken into My patterns are theirs, and are not touched.

### Comments

A dated thread on each pattern, with each comment attributed to the admin who wrote it, shown only in admin. Use it for
why a status changed, what a reviewer heard, or what still needs checking.

### The provenance panel

Each pattern's admin page shows everything about where it came from in one place: origin, Inspired by, fidelity,
sources, who researched it, when the owner listened, rights risk, status and comments. Under that is its audit history:
who changed what, and when.

The admin list filters by origin, rights risk and status, and can enable, disable or set the rights risk of several
patterns at once, with one reason for all of them. Every change is audited.

## Reviewing the current riffs

No riff is deleted. When t-122 moves the library into its own table, every current riff becomes a library pattern with:

- the role the [default role rule](#the-vocabulary) gives it
- fidelity _In the style of_
- origin _AI-generated_, rights risk _None_ and status _enabled_ ([Admin control](#admin-control))
- Inspired by, from the sound's `artist`:
  - a `BankArtist` → that artist
  - a catalogue synth or a maker ("Oberheim SEM", "Behringer") → the synth the sound was written for
  - "Classic technique" (393) or "Various" (87) → the synth the sound was written for, until a housekeeping pass names
    a player or genre for it
  - anything else ("Ambient", "Berlin school", "Sound effects") → that text, as a genre
- a place as its sound's first, and default, pattern

The owner reviews riffs per sound, in the admin editor (t-126), and marks each one:

- **Keep**: it stays the default.
- **Demote**: another of the sound's patterns becomes the default. The demoted riff stays in the sound's list and in the
  library, and can still be chosen and suggested.

Demoting is the only way a riff stops being a default. A researched pattern becomes a sound's default only after the
owner has listened to it, and the riff it replaces is demoted, never removed.

## The library as built

t-122 built the table, moved every riff into it, and added the read and admin APIs.

### Where it lives

| Table               | Holds                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LibraryPattern`    | A `Pattern` (with its `version`), its name, role, tempo range, Inspired by, fidelity, sources and origin. `key` is the seed's natural key.           |
| `SynthSoundPattern` | A sound's place for a pattern. The lowest `order` is the sound's default. A pattern can be on any number of sounds, and a sound can list any number. |

Both are in `prisma/schema/app.prisma`, classified global config with the catalogue (`lib/app/tenancy-classification.ts`), and
excluded from the data export (`CATALOGUE_MODELS` in `lib/app/data-export.ts`): no row has a user foreign key.

- **Inspired by** is `inspiration` (work, artist, synth or genre), the label shown (`inspiredBy`), and a link to the
  `BankSong`, `BankSongPart`, `BankArtist` or `Synth`. The label is kept beside the link, so it still reads if the
  linked row goes (the link is `SetNull`).
- **The facts** (register, density, note length, voices, bars, slides) are not stored. `patternFacts` in
  `lib/app/patterns/library-facts.ts` reads them from the first loop on every read, so they cannot drift from the notes.
  The role and the tempo range are stored, because a person can set them.
- **Who made it, rights risk, status and comments** are t-156's: [Admin control as built](#admin-control-as-built).

### A sound's riff is its default pattern

`SynthSound.phrase` stays. It is always the sound's default pattern played for its first loop, so the panel, the
probe, lessons, the tutor, sharing and the content template all still read the one column, and none of them changed.
`lib/app/patterns/library.ts` keeps the two together:

- **Every sound gets its riff as a pattern**, keyed `riff:<synthId>/<slug>`, through `importPhrase`, at the head of an
  empty list (`syncRiffPatterns`). The seed, a new admin sound and a content upload all go through it. A riff that
  `importPhrase` refuses is refused by the seed's checks and by the admin API, before anything is written.
- **An unedited riff pattern follows its sound's riff** while it is still the sound's default. A changed seed file
  reaches both.
- **Whatever an admin does to a default marks the sound edited** (`syncSoundPhrases`): any edit to a pattern that
  is a sound's default (its name alone included), or a new pattern at the head of a sound's list. The riff is
  rewritten where the notes differ, and the sound is marked edited either way, so the seed and an upload then leave
  it alone. Otherwise a reseed could write a riff the admin's default no longer matches. A riff that already plays
  the pattern's notes is not rewritten.
- **A default plays whole as a riff** (`riffProblem`). A riff is the first loop, frozen: one part, looping where its
  last note ends, the same every time, moving no controls. So a pattern whose chain has a second part, that ends in
  rests, that plays nothing on its first loop, that uses probability or conditions, that plays in a random, Brownian
  or pendulum direction, or that has mod lanes cannot be a sound's default. It can still be in the library and on a sound's list behind the default. Playing a pattern in full
  is the sequencer's job (t-123).
- **A sound's riff is edited directly only while it leads** (`riffLeadsDefault`): while the default is the sound's own
  riff pattern, that pattern is still exactly what the riff imports to, and it is _In the style of_. An admin may have
  changed its name or role. A new riff whose bpm falls outside the pattern's tempo range clears the range.
  Then `PATCH …/sounds/:slug` with `phrase` gives the riff pattern the new notes (`followSoundRiff`), keeping the
  admin's name and role, and any other sound an admin put it first on follows, marked edited and audited. An upload
  that changes a riff does the same, and its audit entry names the sounds that followed (`riffsFollowed`). Once the
  default is another pattern, or its own with something a riff cannot say (swing, a scale, a second part), a new
  `phrase` is refused: the admin changes the pattern instead, so nothing they added is flattened into a riff.
- **An edit that leaves the riff, the name and the credit alone** does not touch the riff pattern.

Placement is content here, unlike the catalogue's: a new order that changes a sound's default changes its riff, so it
marks the sound edited. A new order behind the same default writes only the list. A sound's list is written holding
its synth's row, as a reorder of its sounds is.

### The seed

`prisma/seeds/app-knowyoursynth/005-library-patterns.ts` runs `syncRiffPatterns` over every sound, after the catalogue
and the databank. It reads the stored sounds, not the data files, so a sound an admin edited gives its pattern the riff
the admin left. Each rule is tested in `tests/unit/lib/app/patterns/library.test.ts`:

- **A re-run writes nothing.** Measured on the dev database: 2,293 sounds, 2,293 patterns, 2,293 places, and a second
  run reports 2,293 unchanged.
- **Safe on empty.** No sounds, no writes. It never deletes a pattern or a place.
- **An admin's pattern is never written**, nor one that is no longer its sound's default.
- **A new riff pattern goes at the end** of a list that already has patterns, so it never takes a default an admin
  chose.

The migrated riffs, as measured: roles exactly as the [table](#the-vocabulary) above; Inspired by 577 artists, 537
synths and 1,179 genres; all _In the style of_ and _AI-generated_. The test that every default still plays its riff,
and that none is missing, runs over the real seed data.

#### Researched patterns

The same unit then runs `syncResearchedPatterns` (`lib/app/patterns/library-researched.ts`) over the research batches
under `prisma/seeds/app-knowyoursynth/data/patterns/`, read by `pattern-data.ts`. A batch file is checked by
`ResearchBatchSchema`. It records the task, who researched it and when, its patterns, and the sounds it looked at and
wrote no pattern for, each with a reason. Each pattern has:

- its name, role, tempo range, Inspired by (a databank song by id, with its part by place in the song's list, an
  artist, a synth or a genre), fidelity, sources and notes
- the sounds it is for, as `<synthId>/<slug>`
- `research`: the record kept per pattern ([above](#the-record-kept-per-pattern)). It stays in the file and is not
  stored, so it never drifts from the batch it came with.

The schema refuses what the admin API refuses: a pattern that plays nothing on its first loop, a tempo range that
leaves out its own bpm, and a _Transcribed_ or _Reconstructed_ pattern that names no work or lists no sources. Every
batch pattern is stored as _AI-generated_.

The rules, each tested in `tests/unit/lib/app/patterns/library-researched.test.ts`:

- **Behind, never in front.** Each pattern goes at the end of each of its sounds' lists, so every riff stays its sound's
  default and nothing a sound plays changes. A researched pattern becomes a default only when an admin reorders the
  sound after the owner's listen.
- **A re-run writes nothing, and nor does an empty batch.** Measured on the dev database: the pilot created 17
  patterns and 26 places, and left the 2,293 riffs unchanged. The second batch (t-128) created 20 and 33, left the
  pilot's 17 unchanged, and skipped nothing. The hooks (t-159) created 15 and 26, which brought the totals to 52 and 85, and
  left every riff its sound's default. The third batch (t-129) created 17 and 36, its own 16 and Digital Love's intro,
  which brought the totals to 69 and 121 and again left every riff its sound's default. The fourth (t-160) created 59
  and 88, which brought them to 128 and 209, left the 69 unchanged and every riff its sound's default, and skipped
  nothing. The fifth (t-161) created 57 and 73, which brought them to 185 and 282, and skipped nothing. It also updated
  13 of t-160's patterns, whose review fixes the dev database hadn't had yet, and left the other 115 and every riff
  unchanged. Its review fixes then created 3 and 4, the octave copies, and updated 8: the four relinked, the three
  whose sounds moved and the renamed hi-hat genre. The sixth (t-162) created 54 and 86, which brought them to 242 and
  372, left the 188 and every riff unchanged, and skipped nothing. The seventh (t-163) created 45 and 70, which brought
  them to 287 and 442, left the 242 and every riff unchanged, and skipped nothing. Its review fixes created 1 and 1,
  the Perturbator bass roots; the two patterns they took out of the file stay in the library, as the rule below says.
  The eighth (t-164) created 64 and 77, which brought them to 352 and 520, left the 288 and every riff unchanged, and
  skipped nothing. Its review fixes updated 7: the fuller Itchycoo Park chords, the two Wakeman links and four
  research notes. The ninth (t-165) created 50 and 76, which brought them to 402 and 596, left the 352 and every riff
  unchanged, and skipped nothing. The tenth (t-166) created 66 and 79, which brought them to 468 and 675, and skipped
  nothing. It also updated 8 of t-165's patterns, whose review fixes the dev database hadn't had yet, and left the rest
  and every riff unchanged. The eleventh (t-167) created 43 and 56, which brought them to 511 and 731, left the rest
  and every riff unchanged, and skipped nothing. The twelfth (t-168) created 73 and 83, which brought them to 584 and
  814, left the rest and every riff unchanged, and skipped nothing.
- **An admin's pattern is never written**: one an admin edited, or made any sound's default.
- **Nothing is moved or removed.** A sound newly named in a batch gets the pattern at the end of its list. A pattern
  taken out of a batch file stays in the library and on its sounds.
- **A key is used once across every batch file.** The loader refuses one in two files and names both, so the seed
  never creates a pattern twice.
- **A new pattern none of whose sounds has its riff yet is not created**, so it is never left in the library on no
  sound. It waits, reported, for the riff pass.
- **A pattern that names something not there is skipped and reported**, and nothing is written for it: a sound, song,
  part, artist or synth. So the seed is safe on an empty catalogue. The seed logs each skip as a warning; with the
  batch's test checking every name against the seed data, a skip means a row was removed or not seeded yet.

Over the real data, the same test checks that every sound a batch names is in the catalogue, that each batch looks at
every sound by its artists exactly once (Kraftwerk and Depeche Mode for t-127; Daft Punk, Jean-Michel Jarre and
Tangerine Dream for t-128; Brian Eno, Daniel Lanois, Vangelis and Boards of Canada for t-129; 31 funk, soul and R&B
artists for t-160; 29 synth-pop and post-punk artists for t-161; 30 80s pop and arena artists for t-162; 30 film, TV,
game and synthwave artists, under 31 names, for t-163; 41 prog, psychedelic and rock artists, under 42 names, for t-164; 33 disco, acid, house, techno and industrial
artists, under 34 names, for t-165; 35 90s electronic, big beat, IDM and downtempo artists for t-166; 33 electronic pioneers, Berlin school and krautrock artists for t-167; 52 ambient, classical, jazz and world artists, under 54 names, for t-168), that every link resolves in the databank, and that every pattern plays. It also checks that no pattern runs past the rights rule's 8 bars, that
a sound whose own riff plays no chords gets a single line, that the Just Can't Get Enough bass and the Blade Runner End
Titles theme play the notes both of their leads give, that the Da Funk break figure plays its lead's notes in both
octaves, as does the Da Funk main riff, that Digital Love's intro plays its lead's notes, that the Flash Light
bass and the Superstition clavinet (in both octaves) play theirs, that the Blue Monday bass, the Are 'Friends'
Electric? riff, the Take On Me riff, the Sweet Dreams riff, the Axel F theme, the Stranger Things arpeggio, the On the
Run sequence, the Tom Sawyer growl, the I Feel Love bass, the Popcorn theme, the Sexy Boy bass, the Levels riff, the subject of Bach's Invention in F (from the score), the
Ghost Rider riff, the Birdland theme and the Prelude of Bach's first cello suite (from the score) play theirs, that the
Black Market theme holds the keys that play it on the upside-down-keys sound (each the transcription's pitch mirrored
around middle C), and that t-161's, t-162's, t-163's, t-164's, t-165's, t-166's and t-167's octave copies sit one or two octaves from the part they copy, as each copy's check says, and that every later copy (the `library-150` sweep's, t-192 on) is its source rebuilt, field by field, moved by what its notes say. A pattern with no lead must say it is a best guess. A sound can be on more
than one pattern of a batch, but a sound with a pattern never also has a reason.

The catalogue unit's hash leaves the `patterns/` folder out, as it does `bank/`, so a batch edit re-runs only this
unit.

### The API

Public, no session needed, in `lib/app/patterns/library-read.ts`. A pattern is served only when it is on a sound of
a synth the catalogue serves (listed, and in the registry). So hiding a synth hides its riffs, and a pattern on no
sound yet (an admin's, still being written) is admin only.

| Route                                             | Does                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/v1/synths/:id/sounds/:slug/patterns`    | A sound's patterns, default first, with their facts.                                    |
| `GET /api/v1/library-patterns?role=&page=&limit=` | A page of the library by name, optionally one role.                                     |
| `GET /api/v1/library-patterns/:id`                | One pattern.                                                                            |
| `POST /api/v1/library-patterns/suggest`           | Patterns that suit a reading of a patch, with why. See [Suggestions](#suggestions).     |
| `POST /api/v1/library-patterns/rank`              | Every pattern, by role, best suited first. See [The whole library](#the-whole-library). |

Admin, in `lib/app/patterns/library-edit.ts`, over the catalogue's guard and audit (`lib/app/catalogue/admin-route.ts`).
Every write is `writesSharedSettings` and audited: a pattern as `library_pattern`, a sound's list or riff as
`synth_sound`. Tested in `tests/unit/app/api/v1/library-patterns.test.ts`.

| Route                                                                  | Does                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/admin/library-patterns?role=&synth=&artist=&fidelity=&q=` | Every pattern, hidden synths' included, with when it was edited and every sound that lists it. `synth`: on a sound of that synth. `artist`: inspired by them, or by a work they are credited on. |
| `GET /api/v1/admin/library-patterns/choices`                           | Every synth, databank artist and work (each with its parts), by name: what Inspired by and the filters choose from.                                                                              |
| `POST /api/v1/admin/library-patterns`                                  | A new pattern, on no sound yet. Origin defaults to _Human-authored_.                                                                                                                             |
| `GET /api/v1/admin/library-patterns/:id`                               | One pattern, as above.                                                                                                                                                                           |
| `PATCH /api/v1/admin/library-patterns/:id`                             | Any field but its key. Rewrites the riff of every sound it is the default of.                                                                                                                    |
| `GET /api/v1/admin/synths/:id/sounds/:slug/patterns`                   | A sound's patterns, default first, each as above.                                                                                                                                                |
| `PUT /api/v1/admin/synths/:id/sounds/:slug/patterns`                   | `{ patternIds }`, default first. Must keep every pattern the sound has; may add any.                                                                                                             |

The `/api/v1/patterns` routes are users' own patterns (My patterns), a different table. The library's routes are named
apart so the two never meet.

The checks on a write, merged into the stored pattern first:

- The pattern passes `PatternSchema` and plays at least one note on its first loop.
- A pattern that is, or is being made, a sound's default plays whole as a riff (`riffProblem`, above).
- A tempo range includes the bpm the pattern is written at.
- A _Transcribed_ or _Reconstructed_ pattern is inspired by a work in the databank and lists at least one source.
- Inspired by links to a row that exists (a part must be of the song named), and takes its label from that row.
- An edit that changes nothing writes and audits nothing.
- A sound's new list is refused while the sound was made on an older definition, as an edit to the sound is.

### The picker

t-123. On the synth page, the sequencer's patterns strip has **Patterns** while a library sound is on the panel as it
came. One of the user's sounds, a shared sound, a lesson's or the tutor's has no patterns of its own, so it has none.

- **One read per sound.** `useSoundPatterns` (`components/app/sequencer/use-sound-patterns.ts`) reads
  `GET /api/v1/synths/:id/sounds/:slug/patterns` the first time the sequencer is open with the sound on the panel,
  and keeps it for the visit, a read still in flight included. Nothing is read per pattern, and nothing while the
  sequencer stays closed. One of the user's sounds whose list is still loading is not taken for the library's. A read that
  failed is tried again when Patterns is pressed.
- **The default opens first.** When the list arrives and the sequencer still holds the sound's riff as it came, the
  default takes its place, named and with its own settings (`SynthSound.phrase` is its first loop). There is no Undo
  back to the riff, because it is the same music. An edit made while the list was being read is left alone, and so is an Undo back to a riff once the
  default has opened for the sound. A sound whose list is empty says so.
- **The list** (`sound-pattern-picker.tsx`) is in the sound's order. Each pattern shows its name (the first marked
  _Default_), its role (`ROLE_LABELS`, `lib/app/patterns/library-labels.ts`) and its length. Where it has an Inspired
  by, it shows _Inspired by_ and the label, then the fidelity's label (`FIDELITY_LABELS`), with what it means as the
  tooltip. A pattern with no Inspired by label shows neither.
- **The link** (`inspiredHref`) goes to the databank's page: a work to its song (a part too, which has no page of its
  own), an artist to theirs. A synth links to its synth page unless it is the one on the panel. A genre, or a link
  whose row has gone, is plain text.
- **Picking one** opens it in the sequencer as a library riff opens, with Undo back to what was held. From there it is
  edited and saved to My patterns like any pattern. Copying its Inspired by and fidelity into the saved copy is not
  done yet.
- **Groups.** The picker takes a list of groups, and the sound's own is the first. Suggestions for the patch on the
  panel ("Suits this sound", [Suggestions](#suggestions)) are the second.
- **Phones.** Below `lg` the sequencer is a bottom sheet, and the picker is in it with the rest of the module.

Tested in `tests/unit/components/app/sequencer/sound-pattern-picker.test.tsx`.

### The Play deck's picker

t-213 (`f-pattern-picker`). Beside Play, at the head of the Play deck, a second picker chooses what Play plays with
the sequencer closed (`components/app/synth/pattern-picker.tsx`; where it sits and how Play follows it are in
[`synth-page.md`](./synth-page.md#the-player)). The sequencer's own strip above is unchanged.

- **The sound's own first.** `useSoundPatterns` reads them while this picker is open as well as while the sequencer
  is shown, so they show at once, default marked, before anything is ranked.
- **Then the whole library**, from [`/rank`](#the-whole-library), in its sections. `useRankedPatterns`
  (`components/app/synth/use-ranked-patterns.ts`) reads the patch once the panel has settled (`SETTLE_MS` since it
  last changed, waiting again if it changes before then, as a patch's glide does), in the probe worker
  (`createKindReader`), and asks `/rank` with the features and the library sound
  the patch started as, which leaves that sound's own out. There is no `movedFar` gate: the sound's own lead the list
  anyway. A panel unchanged since it was last read is not read again, and each reading's answer is kept for the
  visit (up to 50).
- **While it is read**, the sound's own show and a line says the patch is being listened to. A reading that fails is
  asked for without features, which `/rank` lists by role and name, so the sections always come. A read of `/rank`
  that fails says so; closing and opening the picker tries again. While one of the user's sounds is still loading, a
  line says the picker is waiting for it.
- **The order holds while it is open.** The panel is read when the picker opens, not as it changes, so nothing moves
  under the pointer. Opened again after the patch has moved, it is ranked again.
- **Each section shows its best five** (`SECTION_FEW`), its count in its heading, and **Show all N**. An empty section
  is not drawn. Above the sections, a line says what the patch was heard as (the reading's summary).
- **The search** filters the sound's own and every section by name and Inspired by: every word typed has to be in
  one or the other. A section with no match is not drawn, and Show all counts the matches. Escape with words in it
  clears them; the next Escape closes the popover.
- **A row** is the strip's (`PatternCredit` and `patternLength`, shared from `sound-pattern-picker.tsx`): name,
  length, and its Inspired by, linked, with its fidelity. A library row's reason (`why`) is its tooltip, and one that
  needs more voices than the patch says so.
- **Picking** a library row reads its one pattern (`GET /api/v1/library-patterns/:id`); one of the sound's own
  carries its notes already. It loads with `seq.load` as the strip's picker does (named, `libraryId` set, Undo back),
  and the picker closes. Only the latest of two picks loads. A pattern that could not be read says so and stays open.
  A pick that waits on a read starts the pattern if the riff is playing when the read lands, not when the row was
  pressed. The row held as it came is marked, and picking it again only closes the picker. With nothing loaded, the
  riff as it came is the sound's default pattern (the sequencer's library puts the one in the other's place), so the
  default is the row marked. Play shows whenever the sequencer holds a loaded pattern, so a picked one can be played.

Tested in `tests/unit/components/app/synth/pattern-picker.test.tsx` (own first, sections, Show all, search, picks, the
lines while reading and on failure, closing, the sheet) and `tests/unit/components/app/synth/synth-page-pattern-picker.test.tsx`
(on the page: Play with the sequencer closed playing a picked pattern and a user sound's pattern, a pick taking over
from the riff, and the riff back after another patch).

### The admin page

t-126. Synths → Patterns in the admin nav. Thin server shells over the admin routes above, fetched with `serverFetch`
as the catalogue's pages are. The components are in `components/app/admin/patterns/`.

- **`/admin/synths/patterns`** lists the library, 50 to a page, by name (`pattern-table.tsx`). Filter by name or
  Inspired by, synth, role, artist and fidelity. The filters are a plain GET form whose query string is the API's, so
  the server filters the whole library and a filtered list is a link. Each row shows the role, Inspired by, fidelity,
  origin, how many patches list it and how many play it by default, and whether an admin has edited it. A stored row
  that no longer parses is listed with its problem.
- **`/admin/synths/patterns/:id`** edits one pattern (`pattern-form.tsx`): its name, role, fidelity, origin, tempo
  range, Inspired by (kind, then the work and part, artist, synth or genre) and sources. Every non-trivial field has a
  `<FieldHelp>`. The notes are edited in the sequencer module itself, the same component players have, with no
  engine, so it is silent. Hearing a pattern means opening a patch that lists it. Save sends only the fields that
  changed (the notes as a whole `pattern`), and each problem the server names lands on its field. The page lists the
  patches the pattern is on, marking those it is the default of. Saving rewrites their riffs, and the form says so
  before and after.
- **`/admin/synths/patterns/sounds/:synthId/:slug`** puts one patch's patterns in order (`sound-patterns-editor.tsx`),
  reached from a pattern's patches and from the catalogue's patch page. Move a pattern up or down, or **Make default**,
  then **Save order** sends the whole list. Nothing on the page takes a pattern off. A riff is demoted by another
  pattern going first, and stays on the patch marked _Was the default_ until saved. The server refuses a default that
  could not be a riff, and the page shows why.

Not on the page yet: adding a new pattern (`POST`) or adding a library pattern to a patch's list. The API takes both.
Rights risk, status, comments and history are on both pages: [Admin control as built](#admin-control-as-built).

### Admin control as built

t-156. The design is [Admin control](#admin-control).

**What each pattern stores** (`LibraryPattern`, migration `20261101223122_library_pattern_admin_control`):

| Column                       | Holds                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `origin`                     | _AI-generated_, _Human-authored_ or _User-contributed_ (t-122's column).                                                                   |
| `madeBy`                     | Who or what made it when no account did: the agent and its task. Every riff is `RIFF_MADE_BY`; a batch's pattern is `researchedBy (task)`. |
| `madeByUserId`               | The person who made it: the admin who added it with `POST`. A hand-written FK to `user`, `SET NULL`.                                       |
| `madeAt`                     | When: a batch's `researchedAt`, or when an admin added it. Null for the riffs.                                                             |
| `research`                   | A batch's research record and its task, the owner's listen (`listenedAt`) included. Null for a pattern no batch wrote.                     |
| `rightsRisk`, `rightsReason` | _None_, _Needs review_, _Cleared_ or _Blocked_, and why. A null reason means no admin has set it.                                          |
| `status`, `statusReason`     | _Enabled_ or _disabled_, and why.                                                                                                          |

Comments are `LibraryPatternComment`: the pattern, the body, the author (a hand-written FK to `user`, `SET NULL`) and
when. A comment goes with its pattern (`Cascade`), though nothing deletes one.

**The rules**, each tested in `tests/unit/app/api/v1/library-patterns.test.ts` and `library-researched.test.ts`:

- **The migration** set every _Transcribed_ or _Reconstructed_ pattern to _Needs review_ (there were none: every
  pattern on 2026-11-01 was _In the style of_) and every riff's `madeBy`. The seed sets both from then on.
- **A rights risk no admin has set follows the fidelity**: changing the fidelity, by an admin's edit or a batch's,
  changes it. Once an admin sets one (with a reason), neither does. Setting the value it already has counts: the new
  reason replaces the old, audited.
- **Rights risk and status are not edits to the pattern.** They don't set `editedAt`, so the seed still brings an
  unedited pattern's notes up to date. The seed never writes them.
- **A sound's default is its first enabled pattern that can be a riff** (`headOf` in `library.ts`). Every reader of
  "the default" uses it: the riff sync, the seed, an admin's reorder and edit, and the admin page's _Default_ mark. An
  admin's reorder still refuses a first enabled pattern that can't be a riff, as before.
- **Disabling** rewrites the riff of each sound whose default changes, marks those sounds edited, and audits each
  as a `synth_sound.update`. A change that would leave a sound with no default is refused, naming each sound on the
  `acknowledge` path, until it is sent again with `acknowledge: true`. The refusal writes nothing.
- **A blocked pattern is disabled** in the same change, and enabling one is refused unless the same change lowers its
  rights risk.
- **The public reads** (`library-read.ts`) serve enabled patterns only. A sound's list leads with its default. The
  suggestions' kept library is the same read. The pattern library's own writes (an edit, a reorder, rights risk or
  status) drop it in the process that made them; a catalogue edit (a sound's riff, a synth listed or hidden) and
  another instance's copy last out the minute.
- **The seed leaves alone a researched pattern that is a sound's default, or disabled ahead of it**, since enabling it
  makes its notes the riff again.

**The API**, admin only, each write `writesSharedSettings` and audited on the pattern:

| Route                                                    | Does                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/library-patterns`                     | Also takes `origin=`, `rights=` and `status=`. Each row carries who made it, its research, rights risk and status, with their reasons. |
| `PATCH /api/v1/admin/library-patterns/:id`               | Also takes `madeBy`. A fidelity change moves a rights risk no admin has set.                                                           |
| `POST /api/v1/admin/library-patterns/control`            | `{ ids, rightsRisk?, status?, reason, acknowledge? }`: one pattern or up to 100. `library_pattern.control`.                            |
| `GET`/`POST /api/v1/admin/library-patterns/:id/comments` | The comments, oldest first, with their authors; add one as the signed-in admin. `library_pattern.comment`.                             |
| `GET /api/v1/admin/library-patterns/:id/history`         | The last 100 audit entries on the pattern, newest first: the action, who, when and what changed.                                       |

**The admin page.** The list filters by origin, rights risk and status, shows each row's rights risk and status, and has
a bar above it that sets either for the rows ticked, with one reason (`pattern-bulk-bar.tsx`). Each pattern's page opens
with its provenance panel (`provenance-panel.tsx`): origin and who made it, Inspired by, fidelity, sources, the
research and the owner's listen, rights risk and status with their reasons, the form that changes them
(`pattern-control-form.tsx`), comments and history. A disable that would leave a patch with nothing lists the patches
and asks **Disable anyway** or **Cancel**.

**Privacy.** Both user links are on the subject-data manifest (`lib/app/data-export.ts`): the patterns a person made as
attribution (id, name, date), and the comments they wrote in full. Both FKs are pinned by drift probes
(`lib/app/db-drift.ts`). `LibraryPatternComment` is global config, beside the library.

Tested also in `tests/unit/components/app/admin/patterns/provenance-panel.test.tsx` and
`tests/unit/app/admin/synths/patterns/pages.test.tsx`.

Tested in `tests/unit/components/app/admin/patterns/` and, for the reads it added, `tests/unit/app/api/v1/library-patterns.test.ts`.

### The sound detector

t-124. To suggest patterns for a patch someone has changed, the app has to know what that patch sounds like now. A
library sound's category is a tag someone wrote, and an edited patch has no tag that is still true. The detector
(`lib/app/synths/lib/soundkind.ts`) plays probe notes through the real voice and reads the answer off the audio.
Nothing in it is written per synth.

`soundKind(engineParams)` and `panelSoundKind(def, values, cables)` return null for a silent patch. Otherwise they
return:

- **`categories`**: a share for each of the 12 sound categories, summing to 1, and **`category`**, the largest.
- **`roles`**: a share for each of the eight pattern roles, summing to 1, and **`role`**, the largest.
- **`register`**: `low`, `mid` or `high`.
- **`features`**: what it read, below.

It is deterministic. The renderer seeds `Math.random`, so the same patch always reads the same.

#### The probe

`renderHeld` (`audio/probe.ts`) is new for the detector. It holds one note, lets it go, and listens to the release,
through the same `createSynth` voice, at the same rate and with the same seed as the sound map's probe and the predicted
scope. It adds a function and changes none, so `check:synths --compare` and the goldens are unchanged.

Each patch gets three notes, about 1.25 s of audio and about 80 ms of rendering:

- **G3 (55)**, held for 0.55 s, then 0.3 s of release.
- **C2 (36)** and **D5 (74)**, 0.2 s each, for level and pitch.

The detector does not tap a separate short note. Whether a sound stops when the key comes up is read from the held
note's release instead, and that saved a quarter of the cost.

#### The features

| Feature    | What it is                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------- |
| attack     | Time to 90% of the peak (capped by the 0.55 s hold, so a slower swell reads as about 0.5)          |
| decay      | Time from there to half the peak while held                                                        |
| sustain    | Level over the last 0.1 s of the hold, against the peak                                            |
| release    | Time from letting go to 40 dB below the peak (0 if already there, 0.3 if still sounding)           |
| pulses     | Rises of 6 dB or more after the attack while held, above −40 dB: a sequencer, an arpeggio, an LFO  |
| wobble     | Mean change of the level's slope per 10 ms frame, in dB: a tremolo moves it, a plain decay doesn't |
| brightness | Spectral centroid, in octaves above the played note                                                |
| brightMove | How far that moves from the start of the note to the end of the hold (a filter sweep)              |
| noise      | Spectral flatness, with each bin counted at 40 dB below the loudest at most                        |
| clarity    | How cleanly it repeats at its pitch (YIN, down to 13 Hz)                                           |
| pitch      | Where the mid note sounds against its key, in octaves (−1 is an octave down)                       |
| tracking   | How the pitch follows the keys from C2 to D5: 1 tracks, 0 is a fixed pitch                         |
| drift      | How far the pitch wanders while held, in semitones                                                 |
| levels     | The low, mid and high notes' peaks, in dB below the loudest of the three                           |
| voices     | Notes the patch can play at once, from the engine parameters (`voicesOf`, which says how)          |

The pitch detector is its own YIN, not the scope's `detectPeriod`. The scope's detector stops at 38 Hz, and many bass
patches sound an octave or two below their key: on C2, that is below 38 Hz. `pitch` turned out to be the strongest
single sign of a bass.

#### The scores

**Categories** come from a multinomial logistic regression over the features, fitted to the library's own
categories (the first tag). Each feature is put on a scale where a step means about the same everywhere: times on a
log scale, counts capped (`kindInputs`). The inputs are then standardised. The fitted weights are generated, not
written: `npx tsx scripts/fit-soundkind.ts` renders the library (`scripts/soundkind-sweep.ts`, on worker threads),
fits it (`soundkind-fit.ts`) and writes `soundkind-model.ts`.

A fitted model, rather than hand-written rules, because the categories overlap. Pluck, keys and lead differ by degree
in every feature, not in any one, and hand-placed thresholds would be guesses with the library's answers sitting there
unused. The cost is that the model learns the labels' mistakes as well as their sense. The cross-validated figure
below shows how much of the fit carries over to sounds it wasn't fitted to, and nearly all of it does.

**Roles** are not fitted separately. A role's share is how often library sounds of each category carry that role
(the share of their riffs the default role rule gives it, `model.roles`), weighted by how much this patch sounds like
each category. So the roles follow what the library pairs sounds of this kind with, and they move when the patch does:
a pad changed to start and stop at once loses most of its _Drone_ share (tested). The voices filter (a pattern is never
suggested to a patch with fewer voices than it needs) is applied by [suggestions](#suggestions), not here. A mono patch still
shows the chord roles its category's sounds carry.

**Register**: `low` if the patch sounds most like a bass, or sounds more than half an octave below its key (the
octave down a bass patch is usually set to, with room for a detuned oscillator). `high` if it sounds more than half an
octave above its key, or is thin at the bottom (the low note 9 dB or more below the loudest). Otherwise `mid`.

#### Agreement with the library

Measured on 2026-11-12 over the library's 5,024 sounds:

- **The detector reads the sound's own category for 2,445 of them (48.7%).** Picking the commonest category, bass, every
  time would get 17.3%.
- **Cross-validated: 2,402 (47.8%).** Each fifth of the library is measured on a model fitted to the other four fifths.
- **5 sounds are silent on the probe notes**: `model-d/just-intonation-drone`, `model-d/slow-breaking-waves`,
  `pro-1/filter-clave`, `malevolent/mal-extreme` and `grandmother/gm-ringing-ladder-ping`. `check:synths` hears each one play its riff, so they do make sound, but not on a held G3 within
  the probe's 0.85 s. The two filter pings (the clave and the Grandmother's) have no oscillator in the mixer, only a
  filter struck by a short envelope. Why has not been looked into. They count as disagreements.

When it was last measured there (t-191), CI's Linux x64 read one fx sound as lead instead: the renders are seeded, but
the platforms' maths can differ in the last bit, and a sound near a feature's threshold can tip. The figures here are
the macOS ones.

`soundkind-library.test.ts` pins the 48.7% (its floor is one sound below the macOS count, for that tip), so a change to the probe, the engine, the features or the library can't
make the detector worse without someone deciding it should. It renders the whole library, about three minutes of CPU,
so it is the slowest test in the app. It sweeps on two worker threads rather than one per core: a sweep across every
core starved the tests vitest runs alongside it into timeouts. It runs when something it imports changes (the probe
and `predict.ts` are imported widely, so that is often), and in the full suite.

The confusion table: one row per category the sound is tagged with, and the categories the detector read across. No
sound was read as strings or wind, so those columns are left out.

| Label   |    bass |    lead |     pad |  pluck |    keys |      fx |  drone |    perc |     seq | brass | silent | Agree |
| ------- | ------: | ------: | ------: | -----: | ------: | ------: | -----: | ------: | ------: | ----: | -----: | ----: |
| bass    | **700** |      54 |       5 |      8 |      36 |       3 |      9 |      18 |      32 |     2 |      · |   81% |
| lead    |      94 | **545** |      48 |      9 |      69 |      25 |      4 |       6 |      15 |     3 |      · |   67% |
| pad     |       2 |      39 | **375** |      · |      18 |      12 |     11 |       1 |      14 |     · |      · |   79% |
| pluck   |      45 |      22 |       7 | **77** |     113 |       4 |      · |      17 |      18 |     · |      · |   25% |
| keys    |      71 |      85 |      28 |     43 | **270** |      11 |      4 |      18 |      41 |     5 |      · |   47% |
| fx      |      44 |     125 |      31 |     12 |      18 | **151** |     14 |      39 |      37 |     · |      2 |   32% |
| drone   |      19 |      45 |      66 |      · |       8 |      18 | **41** |       · |       8 |     · |      1 |   20% |
| perc    |      56 |      17 |       · |     20 |      41 |      23 |      2 | **162** |      16 |     · |      2 |   48% |
| seq     |     102 |      46 |      38 |     33 |      69 |      25 |      4 |      17 | **117** |     · |      · |   26% |
| brass   |      33 |      52 |      41 |      · |      39 |       · |      · |       · |       · | **7** |      · |    4% |
| strings |      12 |      36 |      99 |      · |      19 |       1 |      2 |       · |       5 |     · |      · |    0% |
| wind    |      16 |     118 |      14 |      · |       3 |      14 |      1 |       · |       1 |     6 |      · |    0% |

#### The disagreements

The review on 2026-10-31 sorted the disagreements by how sure the detector was. Most of the ones it was surest about
are not a wrong detector. They are a label on a different axis from the sound:

- **Orchestral names.** _Strings_, _wind_ and _brass_ name the instrument a patch imitates, not how it behaves. A string
  ensemble swells and holds like a pad (99 of 174 read as pad), and a synth flute plays like a lead (118 of 173). The
  detector hears timbre the way a filter shapes it, and none of its features can hear formants. These three
  categories are where it is weakest, and suggestions lose almost nothing by it, because the roles that suit a string
  pad are the roles that suit a pad.
- **Labels for what a sound is for.** _Seq_ says the patch runs a sequence. A sequenced bass (`model-d/octave-sequence-bass`,
  `pro-1/pulsing-seq-bass`) still sounds like a bass, and the detector says so. A tuba (`super-gemini/sg-tuba`, brass)
  and a bass clarinet (`neutron/bitches-brew-bass-clarinet`, wind) read as bass too.
- **Drones that are pads.** A slow-attack, held, polyphonic drone (`deepmind-12d/cosmic-drone`, `pro-800/p8-drone`)
  reads as pad. Drone and pad suit much the same roles, led by _Drone_ (see [Category to role](#category-to-role)).
- **Pluck against keys.** 113 of the 303 plucks read as keys. A pluck and an electric piano both start at once and decay
  while held, and the probe can't tell a decay that is the sound from one that is the player's.

The detector is plainly wrong on a few kinds:

- **Tonal kick drums** read as bass (`model-d/techno-kick-909`, `behringer-syncussion/electro-kick`, `neutron/taiko-drum`).
  A kick is a pitched sine an octave or two down, so it scores like a sub bass. What gives it away is how short it is,
  and the features don't weigh that enough.
- **Organs with a 16′ stop** read as bass (`model-d/jimmy-smith-organ`), because the lowest footage is the loudest.

None of these labels has been changed. Which category a sound should carry is the content review's call (see
[Reviewing the current riffs](#reviewing-the-current-riffs)). The table is where to start.

#### Refitting

Refit when the features change or the library grows. Run `npx tsx scripts/fit-soundkind.ts`, then move the floor in
`soundkind-library.test.ts` and the figures above together. `--report` prints the committed model's figures without
writing anything.

The model records the inputs it was fitted to. If the features change without a refit, the model test fails before
the agreement test does.

Tested in `tests/unit/lib/app/synths/lib/soundkind.test.ts`, on hand-built patches the model was never fitted to: a
plucked bass reads as bass for a bass line in the low register, a long-attack pad as pad for drones, a noise sweep
as fx. Also tested there: the same patch twice, a pad edited into a pluck, and silence. The fit is tested in
`soundkind-fit.test.ts`, and the library in `soundkind-library.test.ts`.

### Suggestions

t-125. A user who changes a patch a lot, or opens a sound of their own, is left with patterns that may no longer fit.
So the picker offers library patterns that suit what the patch sounds like now, as a second group, **Suits this
sound**.

#### Which side does what

| Where                                   | What                                                                                 | Why                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| The browser, in the probe worker        | Plays the probe notes through the voice and reads the features (`soundFeatures`)     | Only the browser has the panel, and about 80 ms of rendering a reading stays off the server |
| `POST /api/v1/library-patterns/suggest` | Scores the features with the model (`kindOf`) and ranks the library (`rankPatterns`) | Only the server has the whole library; the scoring is pure and costs nothing                |

The worker is the sound map's (`PROBE_WORKER_URL`): a `kind` message, answered with the features. Where a host blocks
workers, or the worker doesn’t answer its first reading within 15 s, the page reads on its own thread instead (`suggest-detect.ts`).
`PATTERN_ROLES` lives in `library-roles.ts`, which imports nothing, so the worker doesn't bundle the sequencer.

The endpoint takes `{ synthId, sound?, features, limit? }`. `features` is validated field by field
(`SoundFeaturesSchema`), and `sound` is the library sound the patch started as. It returns what the patch sounds like
(category, role, register, traits and a summary) and up to `limit` suggestions (8 by default, 20 at most). Each one has
the pattern itself, its score and its reason, so the picker reads nothing per pattern. It writes nothing. It sits under
the `/api/v1/**` section cap (100 a minute) with no work in the handler. It reads the sound, if one is named, and the
public library. The library is the same for every caller and costs about 80 ms to read and work out the facts of, so
it is kept for a minute: an admin's edit, or a pattern disabled (t-156), reaches suggestions within that.

#### When to suggest

- **A library sound as it came** shows its own patterns only.
- **Once it has moved far from how it came**, Suits this sound appears under them. Far is a `kindDistance` of
  **0.4** or more between the patch now and the sound as it came (`presetState`, at the lesson step on the panel if it is on one, so following a lesson is not moving away from the sound), both read by the detector.
  `kindDistance` is the root mean square of the difference over the model's inputs, each in its standard deviations
  across the library (`KIND_MODEL.scale`). Measured over every 12th library sound on 2026-10-31: a knob moved a tenth
  of its travel crosses 0.4 9% of the time, a knob moved a third of its travel 17%, and another sound of the same synth
  96% (the median distance between two sounds of one synth is 1.1). Most single knob moves change the reading by
  nothing at all, because the knob isn't in the sound's path.
- **A library sound whose list is empty** brought no patterns of its own, so it is offered them at once.
- **Anything else on the panel** (one of the user's sounds, a shared one, the tutor's) shows Suits this sound at once,
  under a Patterns button of its own.
- **Only while the picker is open**, and only once the panel settles: 800 ms after the last change
  (`useSuggestedPatterns`). A knob turned and turned again asks once, when it stops. The detector is deterministic, so
  the same patch reads the same, and an answer is kept for the visit: a patch that comes back to where it was asks
  nothing.

#### The ranking

`rankPatterns` (`lib/app/patterns/suggest.ts`):

1. **Voices is a filter.** A pattern that starts more notes together than the patch can play is never offered, so a
   mono patch gets no chords. A pattern with no notes isn't offered, nor are the sound's own patterns.
2. **Roles take places in proportion to their share.** A role with less than 5% of the sound's role shares isn't
   offered. Each place goes to the role with the highest quotient: its share times its next pattern's fit, over the
   places it already has plus one (D'Hondt). So the best-suited role leads, and the others come in as its quotient
   falls. A bass gets mostly bass lines, a pad a mix of drones, chord changes and ambient lines.
3. **Within a role, fit orders them**, from 0 to 1:
   - **Register.** How far the pattern's median note is from the register's centre (D2, D4, E5 for low, mid, high), as
     a bell curve one octave wide: 0.61 an octave away, 0.14 two.
   - **Slow attack** (0.15 s or more to 90%). A line denser than one onset a beat is weighed down by
     `exp(−(density − 1) / 2)`, because the attack smears it.
   - **Dies away** (sustain under 0.1). Notes longer than a beat are weighed down by `exp(−(length − 1) / 2)`, because
     the sound is gone before the note ends.
4. **Researched patterns of the same artist or synth are lifted** by 1.3: _Transcribed_ or _Reconstructed_, inspired by
   the artist of the sound the patch started as or by the synth on the panel. Only where they fit, because the lift is
   on the fit within a role the sound suits: a researched chord part is still never offered to a bass. Ties go to a
   researched pattern, then by name.

Each suggestion's **reason** is the sound's traits and the part: `slow attack, holds, plays chords → drone`, with
` · same artist` or ` · this synth` when it was lifted. The traits are at most three of: slow or sharp attack, holds or
dies away, a low or high register, pulses, mono or plays chords, noisy. The picker shows the summary under the group's
title (the traits and the three roles that suit it most) and each reason as its row's tooltip.

What it doesn't weigh yet: tempo range, and slides against a synth with no glide (the features don't say whether the
patch glides).

#### The whole library

t-212 (`f-pattern-picker`). The Play deck's pattern picker lists the patch's own patterns, then every other public
pattern, in a section per role, best suited first. `/suggest` returns at most 20, so the whole library has its own
endpoint, `POST /api/v1/library-patterns/rank`.

It takes `{ synthId, sound?, features? }`, validated as `/suggest`'s are (`RankBodySchema`, `rank-read.ts`).
`features` is optional, because the picker asks before the detector has read the patch. An unknown synth, or a sound
not on a listed synth, is a 404. It writes nothing, and sits under the `/api/v1/**` section cap with no handler cap.
It shares `/suggest`'s reads (`suggest-read.ts`): the sound, if one is named, and the public library kept for a minute
(`publicLibrary`). So one read serves both, and `forgetSuggestLibrary` clears it for both.

It returns the reading, as `/suggest` gives it (null with no features, or a silent patch), and **every role's section**,
empty or not. A section has its role, its label (`ROLE_LABELS`), the patch's share of the role (null with no reading)
and its patterns. A pattern is a lean row, without its notes, which a pick reads from
`GET /api/v1/library-patterns/:id`:

| Field           | What                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `id`, `name`    |                                                                                                        |
| `role`          | The section it is in.                                                                                  |
| `bars`          | Its length, in bars of four beats (`facts.bars`).                                                      |
| `inspiredBy`    | The label and the link ids, as a view has them, so the picker links it as the strip's does.            |
| `fidelity`      |                                                                                                        |
| `why`           | The reason `/suggest` would give it: `slow attack, holds → drone · same artist`. Null with no reading. |
| `tooManyVoices` | It starts more notes together than the patch can play.                                                 |

The order, in `rankLibrary` (`lib/app/patterns/rank.ts`):

1. **Every enabled public pattern once**, except the sound's own, which the picker lists first. Nothing else is left
   out: where `/suggest` drops a role under 5% and a pattern needing more voices, the whole library lists both.
2. **Sections by the patch's share** of each role, largest first. A role the patch barely suits comes last, still
   listed.
3. **Within a section, by fit** with the researched lift, the order `rankPatterns` gives a role
   (`liftedFit`, `byFit`, shared from `suggest.ts`). A pattern needing more voices than the patch has comes after
   every one it can play, marked, in fit order among themselves.
4. **With no reading** (no features yet, or a silent patch), the sections are in `PATTERN_ROLES` order and each by name,
   so the picker is never empty.

Measured against the dev DB on 2026-11-08: 4,469 patterns, about 1.3 MB of JSON, 160 KB gzipped.

Tested in `tests/unit/lib/app/patterns/rank.test.ts`, over every library riff: every candidate once, the sections in
share order, the same order and reasons as `rankPatterns` within a role, the lift, the sound's own left out, a mono
patch's chords last and marked, and the order with no reading. The endpoint is tested in
`tests/unit/app/api/v1/library-patterns-rank.test.ts` (validation, the 404s, the lean rows, no features and silent, the
library kept with suggestions', the section cap).

Tested in `tests/unit/lib/app/patterns/suggest.test.ts`, over every library riff and hand-built patches: a bass patch
gets bass lines first, a pad drones, chord changes and ambient lines, a noise hit percussive patterns, and a mono
patch no pattern with chords, of 200 asked for. Also the lift, the threshold on a real Model D sound, and the schema.
The endpoint is tested in `tests/unit/app/api/v1/library-patterns-suggest.test.ts` (validation, the reads, the kept
library, the section cap), the picker group in `tests/unit/components/app/sequencer/suggested-patterns.test.tsx` (as it
came, moved far, another patch, the settle, an error), and the worker reader in `suggest-detect.test.ts`.
