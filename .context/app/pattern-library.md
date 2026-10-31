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
detector t-124, suggestions t-125, the admin editor t-126 and admin control t-156.

**Awaiting the owner's sign-off on the PR:** the role vocabulary, the fidelity labels, the rights rule and admin
control. Each is marked _Proposed_ below until it is signed off.

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
- its origin ([Admin control](#admin-control)). Rights risk, status and comments are admin edits, kept in the database
  and never overwritten by a reseed

## Rights

_Proposed. The owner's call; goes to the `f-launch` legal review._

A recreated part is still a reproduction of a melody, however short, so the library limits how much it takes and says
what it is:

Here a _part_ is a part of the work: the bass line, the lead, the arpeggio. The sequencer's parts A and B are something
else (see [Reducing a part to a loop](#reducing-a-part-to-a-loop)).

- **One part of a work**, never two parts of the same work together, and never the vocal melody.
- **At most 8 bars**, and no longer than the passage that repeats on the record. The 8 bars count the chain played
  through once. Parts A and B with a chain of `[0, 0, 0, 1]` and 2-bar parts are 8 bars.
- **Never the whole of a part** that is itself short enough to fit in 8 bars and is the work's main hook. In that case
  take the passage under it instead, or write it _In the style of_. _(Open for the owner: whether the hook rule goes too
  far for learning use.)_
- **Labelled every time**: "Inspired by" with the work and artist, the fidelity, and, on the pattern's detail, the line
  _"A short recreation for learning. Not the original recording; the work belongs to its rights holders."_
- **No downloadable copy**: a library pattern plays in the app, and can be copied into My patterns. It is not offered
  as a MIDI file.
- **No samples, ever.** Patterns are notes played through our synths.

The pattern library is named in `f-launch`'s legal-review scope on the Hub (added by t-121).

## Admin control

_Proposed. Asked for by the owner on 2026-10-31 and built by t-156, on t-122's table and t-126's admin page._

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

- If a sound's default is disabled, the sound plays its next enabled pattern.
- A sound keeps at least one enabled pattern. Disabling its last one warns the admin first.
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
- **Rights risk, status and comments** are not here yet. They are t-156's. Origin is here, because the migration sets
  it.

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
- **A default plays whole as a riff** (`riffProblem`). A riff has one part and loops where its last note ends, so a
  pattern whose chain has a second part, that ends in rests, or that plays nothing on its first loop cannot be a
  sound's default. It can still be in the library and on a sound's list behind the default. Playing a pattern in full
  is the sequencer's job (t-123).
- **A sound's riff is edited directly only while it leads** (`riffLeadsDefault`): while the default is the sound's own
  riff pattern and that pattern is still exactly what the riff imports to. An admin may have changed its name or role.
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

Researched patterns (t-127 on) come from their own seed data, planned beside the riffs. The loader for that is the
pilot's to add, since there is nothing to load yet.

### The API

Public, no session needed, in `lib/app/patterns/library-read.ts`. A pattern is served only when it is on a sound of
a synth the catalogue serves (listed, and in the registry). So hiding a synth hides its riffs, and a pattern on no
sound yet (an admin's, still being written) is admin only.

| Route                                             | Does                                                 |
| ------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/v1/synths/:id/sounds/:slug/patterns`    | A sound's patterns, default first, with their facts. |
| `GET /api/v1/library-patterns?role=&page=&limit=` | A page of the library by name, optionally one role.  |
| `GET /api/v1/library-patterns/:id`                | One pattern.                                         |

Admin, in `lib/app/patterns/library-edit.ts`, over the catalogue's guard and audit (`lib/app/catalogue/admin-route.ts`).
Every write is `writesSharedSettings` and audited: a pattern as `library_pattern`, a sound's list or riff as
`synth_sound`. Tested in `tests/unit/app/api/v1/library-patterns.test.ts`.

| Route                                                | Does                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/library-patterns?role=&q=`        | Every pattern, hidden synths' included, with when it was edited and every sound that lists it. |
| `POST /api/v1/admin/library-patterns`                | A new pattern, on no sound yet. Origin defaults to _Human-authored_.                           |
| `GET /api/v1/admin/library-patterns/:id`             | One pattern, as above.                                                                         |
| `PATCH /api/v1/admin/library-patterns/:id`           | Any field but its key. Rewrites the riff of every sound it is the default of.                  |
| `PUT /api/v1/admin/synths/:id/sounds/:slug/patterns` | `{ patternIds }`, default first. Must keep every pattern the sound has; may add any.           |

The `/api/v1/patterns` routes are users' own patterns (My patterns), a different table. The library's routes are named
apart so the two never meet.

The checks on a write, merged into the stored pattern first:

- The pattern passes `PatternSchema` and plays at least one note on its first loop.
- A pattern that is, or is being made, a sound's default plays whole as a riff (`riffProblem`, above).
- A tempo range includes the bpm the pattern is written at.
- A _Transcribed_ or _Reconstructed_ pattern is inspired by a work in the databank and lists at least one source.
- Inspired by links to a row that exists (a part must be of the song named), and takes its label from that row.
- An edit that changes nothing writes and audits nothing.
