# Synth families

An original, its revisions and the instruments that copy it are one **family** (`f-synth-families`).
The TD-3 and the TB-303 are one, as are the Model 15 and the Grandmother, and the System 15, 35 and 55
as sizes of one system. The synth picker shows a family as one entry. A version toggle on the player
switches between its members. A member nobody has modelled yet still appears, as a blank panel saying
what that member changed.

This page is the binding design. The research behind it (which app synths pair with which originals,
how each clone differs, and the sources) is the Hub document `synth-families-originals-and-clones`.
The owner's rulings (2026-11-26) are in the feature's journal.

| What                            | Where                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| Tables                          | `SynthFamily`, `SynthFamilyMember` in `prisma/schema/app.prisma`          |
| Shapes and the check            | `lib/app/families/data.ts` (`FamilyFileSchema`, `checkFamilies`)          |
| Seed                            | `lib/app/families/seed.ts`, unit `007-families.ts`                        |
| Seed data                       | `prisma/seeds/app-knowyoursynth/data/families/<id>.json`                  |
| Read                            | `lib/app/families/read.ts` (`listFamilies`, `getFamilyOf`)                |
| Public API                      | `GET /api/v1/synths/families`, and `family` on `GET /api/v1/synths/:id`   |
| Carrying a panel across (t-319) | `lib/app/synths/families/`                                                |
| Picker entries, which opens     | `components/app/synth/family-entries.ts` (`pickerEntries`, `familyOpens`) |
| The toggle and its note         | `components/app/synth/family-toggle.tsx`                                  |
| The carry across the navigation | `components/app/synth/family-carry.ts`                                    |
| An unmodelled member's panel    | `components/app/synth/unmodelled-member.tsx`, `memberHref` in `routes.ts` |

## The model

A **family** has an id (`tb-303`), a name (`TB-303`) and a **default member**, the one it opens on.
A **member** has a slug that is stable within the family (`td-3`, `mk-1`), a label the toggle shows,
the **databank instrument** it is, an optional **app synth** that models it, a **differences** text and
an order.

- **Modelled** members name an app synth, and play.
- **Unmodelled** members name only their instrument. They are shown as a blank panel with their
  differences (t-321). They are rows of their own, not catalogue `Synth` rows, because the catalogue
  serves only a synth with a definition (`lib/app/catalogue/read.ts`). A synth row with nothing to
  play would be a broken page.

Every member names its own instrument, so a TD-3 member is `behringer-td-3`, not the `roland-tb-303`
the databank links the `td-3` synth to. That instrument is what the owned-synth rule matches against
(t-320), and what membership is checked by.

## The rules

Every family passes `checkFamilies` before it is written, from the seed or from an admin's save (t-323):

1. **Two members or more**, with distinct slugs.
2. **One original.** Each member's instrument is traced through `recreationOf` to the original its
   chain ends at, and all of them must reach the same one. The System 15, 35 and 55 all reach
   `moog-modular`. A family of sizes is the same rule, not an exception.
3. **The databank agrees.** A modelled member's synth must be linked in the databank (`app` on an
   instrument, `BankInstrumentSynth`) to an instrument that reaches that same original. A family
   cannot say the K-2 is a TB-303.
4. **One family per synth.** A synth sits in at most one member of any family (`synthId` is unique).
5. **The default member is modelled.** A family never opens on a blank panel. It is the member most
   people are likely to own (owner ruling), which is usually the clone because clones are cheaper and
   more widely owned. A signed-in user who owns a member opens on that one instead (t-320).

## What is served

The read follows the catalogue's rule for what a synth page can show:

- A **modelled member is served only while its synth is**: listed, and its definition in the registry.
  A hidden synth's member is left out, just as the synth is left out of the catalogue.
- An **unmodelled member is always served.**
- A **family is served only while it has a modelled member and a second member beside it.** Otherwise
  there is nothing to toggle between.
- If its default member is not served, the family opens on its **first modelled member that is**, and
  logs it at debug level (the seed reports a stored default without a synth once, as
  `defaultWithoutSynth`). The served `defaultMember` is therefore always a served, modelled member.

`GET /api/v1/synths/families` is its own route rather than a field on `GET /api/v1/synths`, because the
latter's `data` is the list of synths itself and adding a field there would change its shape for
every client. The picker reads both and groups members by `synthId`.

## Seeding

`007-families` runs after the catalogue and the databank, whose rows a member names. It keeps the
catalogue seed's rules:

- **Checked first**, against the tables as they stand. One problem and it throws with them all, having
  written nothing.
- **Idempotent.** A row that matches is not written.
- **An admin's edit stands.** A row with `editedAt` set is never written again.
- **A member's place is set once.** A new member goes after the family's last one, and an admin's
  reorder stands.
- **Never deletes, but for a replaced member.** An unedited member the data has dropped, while
  giving its synth to another member (a re-slug, or a synth moved), is deleted rather than left in the
  toggle as a blank copy, and reported (`replaced`). An empty or partial source deletes nothing.
- **A synth moves with the data.** Before writing any member, every unedited member the data no
  longer gives its synth lets go of it, so a synth the data moves, swaps or re-slugs lands on its new
  member whichever comes first. A synth is never freed for a member an admin has edited, which the
  seed does not write.
- **A synth another member already has stays there.** The seeded member is written without it and
  reported (`synthTaken`), rather than the seed taking the synth back from where an admin put it.
- **A family whose stored default member ends up without a synth is reported** (`defaultWithoutSynth`).

The databank admin checks the stored families too (`checkFamilies`). An instrument change that would
add a family problem is refused, naming each one, as any other broken reference is. So an instrument a
member is cannot be removed, and an instrument cannot be re-pointed so that a family's members stop
tracing back to one original.

The unit is on `APP_UNCHECKED_SEEDS` (`lib/app/capability-seed-pairs.ts`), because the capability
parity test's mock client has no databank to check against.

## Carrying a panel across

`translate(values, cables, from, to)` (`lib/app/synths/families/translate.ts`) carries a panel from
one member's definition to another's. It is pure, and returns:

- `values` and `cables`: what carried, under the ids of the member it went to. The caller lays them
  over the other member's own panel. Pass the whole panel: a rule can read one control to decide
  another, and anything left out is read as the member's Default patch.
- `dropped`: each control and cable that did not carry, in the order given, with the reason
  ("The TB-303 has no distortion"). A `ui` control, a panel mode that never changes the sound, is
  never listed.
- `changed`: each value that carried, but not as it was, or that a dropped control set (the Grandmother's NOISE to 0). A number past the other member's range is
  clamped (the TD-3's TUNE goes 12 semitones either way, the TB-303's TUNING 5), and an option can
  lose part of itself (the Model 15's `saw+sub` is a Grandmother's `saw`).

A family's **map** (`FamilyMap`, one file per family beside `translate.ts`, listed in `maps.ts`) is
one-way links between its members. A link is identity plus what it names: a control or jack renamed,
an option renamed, a control dropped while the panel is set a certain way (the Model 15's MIX 3,
which is the sub's level while OSC 2 is under its SUB bracket; the Grandmother's NOISE then goes to 0,
since the Model 15 has no noise there), and why something the other member
lacks does not carry. A value that is not legal on the other member is dropped, never forced. The
System 15, 35 and 55 map needs no renames: a module one size lacks drops with its knobs and its
cables, named by its area ("The System 15 has no 921B Oscillator (5)").

Ids are never renamed in a definition to make two members match. The map does that, and ids stay
stable (`synths.md`). A family with no map still translates, under shared ids only, and
`check:synths` fails until it has one. What it checks is in `.context/app/check/README.md`.

## The picker and the toggle

The picker (`synth-picker.tsx`) lists a family as one entry, where its first member is in the catalogue's order, with
each member's maker and year. Choosing it opens the first member, in toggle order, that the signed-in user owns
(`GET /api/v1/me/instruments`, matched on each member's instrument), else the family's default. Choosing the family
you are already on keeps the member you have open: the toggle is what moves between them. The box over the list
finds a synth by its name or maker, so a member is found as itself and opens as itself. A family is found by its name
only when none of its members match on their own.

The **version toggle** sits by the caption on a synth with a family, one segment per modelled member the catalogue
serves, then one per unmodelled member. A switch to a modelled member navigates to `/synths/<member>`, so the URL, saved
sounds, favourites, progress and `SynthPreference` stay each member's own.

The page is keyed by synth, so the panel is carried across the navigation by hand:

1. The toggle loads the other member's definition and calls `translate()` on the panel as it stands, where this
   member's definition is at hand.
2. It leaves the result in `family-carry.ts`: module state, which a client navigation keeps, keyed by the member it
   goes to. Not the URL, which would make a carried panel a link, and not storage, which outlives the one arrival it
   is for.
3. The member's page takes it in its arrival effect, where a synth switched to would get its Default patch, and lays
   the values over that Default patch with the carried cables in place of the default's. It lands as a change the
   visitor made, so the account's older panel does not replace it.
4. Its note, under the patch's name, names each reason something did not carry or changed, once each.

A carry is taken only by the member it was made for, and taking it clears it. The member takes it in the same commit
that unmounts the page it came from; that page lets go of it as it unmounts (`releaseCarry`), on a timer that fires
after the commit, so a link away or a navigation cut short leaves nothing for a later visit. `CARRY_TTL_MS` (60
seconds) is the backstop. The note goes once anything else opens on the panel. A full reload, or the member opened in a new tab, opens as any arrival
does. If the definition cannot be loaded, the switch goes ahead with nothing carried.

## An unmodelled member

An unmodelled member has no synth id, so it has no page of its own. Its address is the page of the modelled member it was
chosen from, with its slug in the query: `/synths/model-d?member=minimoog` (`memberHref`). Any modelled member of the
family names it as well, so the address holds while that member is in the family. A slug that is not one of the family's
unmodelled members opens the synth itself.

Choosing it in the toggle shows a blank faceplate in the panel's place (`unmodelled-member.tsx`): its maker, name and
year, its differences text a paragraph to each blank line, and a way back to the member whose page it is.

- **The page stays mounted under it.** The address is written with `history.pushState`, not the router, so the server
  does not render the page again for what is only its own state, and the panel, the dock and their state are hidden
  rather than taken down. Going back, through the toggle, the faceplate's button or the browser's Back (`popstate`),
  shows the panel as it was.
- **Nothing plays.** Choosing it stops the riff or pattern and lets every note go. While it shows, `noteOn` drops every
  note, from the keys, MIDI in and the scope's keyboard alike.
- **What needs a definition is hidden, not shown dead:** the panel and its rails, the patch's name and Save, the dock
  (lesson strip, bar, keyboard, sequencer), the sequencer rack, the tutor, the tips, the tour, the description's links
  and the videos and links section. What was open over the panel (the library, the lesson card, the tutor, a phone's
  sheet) closes.
- **Switching on to another modelled member** carries the panel left underneath, as any switch does.
- On a shared sound's or pattern's page the blank panel shows the same way, but the address stays the shared one, since
  a member's address is a synth's own page.

A shared sound's or pattern's page passes no families, so its picker lists every synth alone; its toggle still shows.

## Not here

- **One model for several members.** Where a new member's definition would otherwise repeat an
  existing one's voice, follow `defs/syncussion-kit.ts`. The TB-303 and TD-3 were deliberately not
  moved onto a kit (journal, 2026-11-26).
- **Playable panels for originals** (Minimoog, MS-20 and the rest) are synths of their own
  (`f-next-synths`). Each one joins its family as data: a member row gains a `synthId`.
