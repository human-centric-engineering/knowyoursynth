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
- how admins see and control each pattern's origin, rights risk and status
- how the current riffs are reviewed

Each later task updates its section as it lands. The table, the migration, the seed and the API are t-122 and are
described as built in [The library as built](#the-library-as-built). The picker on the synth page is t-123, the sound
detector t-124, suggestions t-125, the admin editor t-126 and admin control t-156. The research batches and their seed are
t-127 on ([Researched patterns](#researched-patterns), [The method as practised](#the-method-as-practised)).

**Awaiting the owner's sign-off on the PR:** the role vocabulary, the fidelity labels and the rights rule. Each is
marked _Proposed_ below until it is signed off.

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
copied from the category.

### The vocabulary

_Proposed._ There are eight roles, derived from the 2,293 riffs rather than invented. The counts come from the rule
under the table, run on every riff.

| Role               | What the part does                                                               | Riffs today |
| ------------------ | -------------------------------------------------------------------------------- | ----------: |
| **Lead line**      | A melody or riff of single notes, about a note a beat or faster                  |         605 |
| **Held**           | One held note or chord. The patch does the moving: drones, fx, a synth's own seq |         525 |
| **Bass line**      | A low line of single notes                                                       |         364 |
| **Slow melody**    | Single notes held for a beat and a half or more                                  |         226 |
| **Percussive**     | One or two pitches, short: hits and rhythms                                      |         173 |
| **Chord changes**  | Chords that are held and move: pad and string parts                              |         156 |
| **Arp / sequence** | A fast repeating figure of single notes: an arpeggio or an ostinato              |         148 |
| **Chord stabs**    | Short chords on the beat or off it                                               |          96 |

Some names the owner suggested in 2026-10 are folded into other roles:

- **Drone** is _Held_. A drone's riff is a held note (95 of the 121 drone sounds), and the drone itself is in the patch.
  "Drone" stays a sound category.
- **Sequence/ostinato and arp** share one role. They can't be told apart from the notes alone, and they suit the same
  sounds.
- **Fx** is not a role. An fx sound's riff is a trigger: a held note, or a few hits.

The **default role rule** proposes a role for a pattern and for each current riff. A person can always override it.
The terms are exact, so t-122 can implement the rule and reproduce the counts above:

- The **loop** is `phraseBeats`: the last note's end, rounded up to a whole beat.
- An **onset** is a distinct start time, so a chord is one onset. A **chord** is an onset with two or more notes.
- The **average note** is the mean length, in beats, of every note.
- The **median pitch** is the median over every note.

The rules are checked in order, and the first that fits wins:

1. At most 2 onsets, and every note lasts at least 40% of the loop → **Held**.
2. At most 2 distinct pitches, with an average note of half a beat or less → **Percussive**.
3. Half the onsets or more are chords, with an average note of a beat or less → **Chord stabs**.
4. Half the onsets or more are chords → **Chord changes**.
5. The median pitch is below C3 (MIDI 48) → **Bass line**.
6. At least 2 onsets per beat of the loop, with an average note of half a beat or less → **Arp / sequence**.
7. An average note of 1.5 beats or more → **Slow melody**.
8. Anything else → **Lead line**.

### Category to role

This shows which roles suit which kind of sound. It comes from the cross-tab of the current riffs' categories and roles.
Suggestions (t-125) use the same pairing, measured rather than read off this table: the detector's role shares are how
often library sounds of each category carry each role (see [The scores](#the-scores)). A change to the riffs' roles
moves them at the next refit.

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
| Voices      | The most notes that start together (1 = no chords)            | A mono synth can't play chords. Never offered them      |
| Tempo range | The bpm it is written at, and the range it still works in     | A Held pattern works at any tempo; a bass line doesn't  |
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

| Tried                                                                    | Result                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Songsterr                                                                | **Worked.** Its public API (`/api/songs?pattern=`, `/api/meta/:id`) and its CDN serve every track of a transcription as JSON: pitches from string and fret, durations, bars, section markers and tempo. Most of the batch came from here. It had 16 of the 25 works searched. |
| BitMIDI                                                                  | **Worked.** A search API and direct `.mid` downloads, read with a small parser. Fan MIDI, often with echoes or played-in timing written as notes.                                                                                                                             |
| Ultimate Guitar                                                          | Tabs are drawn by JavaScript; a fetch gets the title only.                                                                                                                                                                                                                    |
| MusicRadar, Computer Music (Readly), MusicTech                           | How-to articles behind sign-ups or paywalls.                                                                                                                                                                                                                                  |
| Publisher sheet music (Musicnotes, Sheet Music Direct)                   | Paid. These would be real sources (tier 3 or better) if bought.                                                                                                                                                                                                               |
| Audio analysers (SongBPM, AcousticBrainz)                                | Key and tempo guesses that disagree, by up to 40 bpm on Autobahn. Not used.                                                                                                                                                                                                   |
| Gear write-ups (Mixdown's Gear Rundown, Syntorial's patch recipes, etc.) | Name the synth and describe the part, but give no notes.                                                                                                                                                                                                                      |

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

- Start from Songsterr and BitMIDI, and record a work with neither as not recreated rather than searching further.
- Read the record kept per pattern before listening: it says which bars were taken, which lead they came from, and
  what was changed.
- If the owner wants _Reconstructed_ or _Transcribed_ patterns, a source has to come from outside the free web:
  bought sheet music, or the owner's own ear on the leads.

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
2026-10-31:_ every current riff is _AI-generated_. Research batches (t-127, t-128, t-129) record _AI-generated_ and the
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

Both are in `prisma/schema/app.prisma`, on `GLOBAL_CONFIG_MODELS` with the catalogue (the same divergence row), and
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
  which brought the totals to 69 and 121 and again left every riff its sound's default.
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
Tangerine Dream for t-128; Brian Eno, Daniel Lanois, Vangelis and Boards of Canada for t-129), that every link resolves
in the databank, and that every pattern plays. It also checks that no pattern runs past the rights rule's 8 bars, that
a sound whose own riff plays no chords gets a single line, that the Just Can't Get Enough bass and the Blade Runner End
Titles theme play the notes both of their leads give, that the Da Funk break figure plays its lead's notes in both
octaves, as does the Da Funk main riff, and that Digital Love's intro plays its lead's notes. A sound can be on more
than one pattern of a batch, but a sound with a pattern never also has a reason.

The catalogue unit's hash leaves the `patterns/` folder out, as it does `bank/`, so a batch edit re-runs only this
unit.

### The API

Public, no session needed, in `lib/app/patterns/library-read.ts`. A pattern is served only when it is on a sound of
a synth the catalogue serves (listed, and in the registry). So hiding a synth hides its riffs, and a pattern on no
sound yet (an admin's, still being written) is admin only.

| Route                                             | Does                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/synths/:id/sounds/:slug/patterns`    | A sound's patterns, default first, with their facts.                                |
| `GET /api/v1/library-patterns?role=&page=&limit=` | A page of the library by name, optionally one role.                                 |
| `GET /api/v1/library-patterns/:id`                | One pattern.                                                                        |
| `POST /api/v1/library-patterns/suggest`           | Patterns that suit a reading of a patch, with why. See [Suggestions](#suggestions). |

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
  changes it. Once an admin sets one (with a reason), neither does. Setting the value it already has counts: the reason
  is recorded.
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
  suggestions' kept library is the same read: a change drops it in the process that made it, and another instance's
  copy lasts out its minute.
- **The seed leaves alone a researched pattern at the head of a list** even while it is disabled, since enabling it
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
a pad changed to start and stop at once loses most of its _Held_ share (tested). The voices filter (a pattern is never
suggested to a patch with fewer voices than it needs) is applied by [suggestions](#suggestions), not here. A mono patch still
shows the chord roles its category's sounds carry.

**Register**: `low` if the patch sounds most like a bass, or sounds more than half an octave below its key (the
octave down a bass patch is usually set to, with room for a detuned oscillator). `high` if it sounds more than half an
octave above its key, or is thin at the bottom (the low note 9 dB or more below the loudest). Otherwise `mid`.

#### Agreement with the library

Measured on 2026-10-31 over the library's 2,293 sounds:

- **The detector reads the sound's own category for 1,147 of them (50.0%).** Picking the commonest category, lead, every
  time would get 16.6%.
- **Cross-validated: 1,122 (48.9%).** Each fifth of the library is measured on a model fitted to the other four fifths.
- **3 sounds are silent on the probe notes**: `model-d/just-intonation-drone`, `model-d/slow-breaking-waves` and
  `pro-1/filter-clave`. `check:synths` hears each one play its riff, so they do make sound, but not on a held G3 within
  the probe's 0.85 s. Why has not been looked into. They count as disagreements.

`soundkind-library.test.ts` pins the 50.0%, so a change to the probe, the engine, the features or the library can't
make the detector worse without someone deciding it should. It renders the whole library, about three minutes of CPU,
so it is the slowest test in the app. It sweeps on two worker threads rather than one per core: a sweep across every
core starved the tests vitest runs alongside it into timeouts. It runs when something it imports changes (the probe
and `predict.ts` are imported widely, so that is often), and in the full suite.

The confusion table: one row per category the sound is tagged with, and the categories the detector read across. No
sound was read as strings or wind, so those columns are left out.

| Label   |    bass |    lead |     pad | pluck |    keys |      fx |  drone |    perc |    seq | brass | silent | Agree |
| ------- | ------: | ------: | ------: | ----: | ------: | ------: | -----: | ------: | -----: | ----: | -----: | ----: |
| bass    | **251** |      25 |       2 |     · |      21 |       2 |      5 |      11 |      8 |     1 |      · |   77% |
| lead    |      31 | **258** |      27 |     1 |      35 |      18 |      3 |       5 |      3 |     · |      · |   68% |
| pad     |       1 |      20 | **182** |     · |       8 |      11 |      8 |       1 |      8 |     · |      · |   76% |
| pluck   |       3 |      14 |       5 | **8** |      62 |       1 |      · |      13 |      5 |     · |      · |    7% |
| keys    |      27 |      39 |      16 |     6 | **161** |       6 |      3 |       9 |     11 |     3 |      · |   57% |
| fx      |      20 |      63 |      18 |     1 |      15 | **107** |      9 |      27 |     12 |     · |      1 |   39% |
| drone   |       8 |      29 |      30 |     · |       4 |      12 | **32** |       · |      5 |     · |      1 |   26% |
| perc    |      22 |      10 |       · |     1 |      25 |      16 |      2 | **111** |      2 |     · |      1 |   58% |
| seq     |      26 |      14 |      13 |     4 |      29 |      15 |      4 |       8 | **36** |     · |      · |   24% |
| brass   |       6 |      18 |      27 |     · |      21 |       · |      · |       1 |      · | **3** |      · |    4% |
| strings |       3 |      18 |      49 |     · |       6 |       1 |      1 |       · |      1 |     · |      · |    0% |
| wind    |       2 |      50 |       2 |     · |       6 |       4 |      1 |       · |      1 |     1 |      · |    0% |

#### The disagreements

The review on 2026-10-31 sorted the disagreements by how sure the detector was. Most of the ones it was surest about
are not a wrong detector. They are a label on a different axis from the sound:

- **Orchestral names.** _Strings_, _wind_ and _brass_ name the instrument a patch imitates, not how it behaves. A string
  ensemble swells and holds like a pad (49 of 79 read as pad), and a synth flute plays like a lead (50 of 67). The
  detector hears timbre the way a filter shapes it, and none of its features can hear formants. These three
  categories are where it is weakest, and suggestions lose almost nothing by it, because the roles that suit a string
  pad are the roles that suit a pad.
- **Labels for what a sound is for.** _Seq_ says the patch runs a sequence. A sequenced bass (`model-d/octave-sequence-bass`,
  `pro-1/pulsing-seq-bass`) still sounds like a bass, and the detector says so. A tuba (`super-gemini/sg-tuba`, brass)
  and a bass clarinet (`neutron/bitches-brew-bass-clarinet`, wind) read as bass too.
- **Drones that are pads.** A slow-attack, held, polyphonic drone (`deepmind-12d/cosmic-drone`, `pro-800/p8-drone`)
  reads as pad. Drone and pad suit much the same roles, led by _Held_ (see [Category to role](#category-to-role)).
- **Pluck against keys.** 62 of the 111 plucks read as keys. A pluck and an electric piano both start at once and decay
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
plucked bass reads as bass for a bass line in the low register, a long-attack pad as pad for held parts, a noise sweep
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
   falls. A bass gets mostly bass lines, a pad a mix of held parts, chord changes and slow melodies.
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

Each suggestion's **reason** is the sound's traits and the part: `slow attack, holds, plays chords → held`, with
` · same artist` or ` · this synth` when it was lifted. The traits are at most three of: slow or sharp attack, holds or
dies away, a low or high register, pulses, mono or plays chords, noisy. The picker shows the summary under the group's
title (the traits and the three roles that suit it most) and each reason as its row's tooltip.

What it doesn't weigh yet: tempo range, and slides against a synth with no glide (the features don't say whether the
patch glides).

Tested in `tests/unit/lib/app/patterns/suggest.test.ts`, over every library riff and hand-built patches: a bass patch
gets bass lines first, a pad held parts, chord changes and slow melodies, a noise hit percussive patterns, and a mono
patch no pattern with chords, of 200 asked for. Also the lift, the threshold on a real Model D sound, and the schema.
The endpoint is tested in `tests/unit/app/api/v1/library-patterns-suggest.test.ts` (validation, the reads, the kept
library, the section cap), the picker group in `tests/unit/components/app/sequencer/suggested-patterns.test.tsx` (as it
came, moved far, another patch, the settle, an error), and the worker reader in `suggest-detect.test.ts`.
