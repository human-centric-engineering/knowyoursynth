# Synth families

An original, its revisions and the instruments that copy it are one **family** (`f-synth-families`).
The TD-3 and the TB-303 are one, as are the Model 15 and the Grandmother, and the System 15, 35 and 55
as sizes of one system. The synth picker shows a family as one entry. A version toggle on the player
switches between its members. A member nobody has modelled yet still appears, as a blank panel saying
what that member changed.

This page is the binding design. The research behind it (which app synths pair with which originals,
how each clone differs, and the sources) is the Hub document `synth-families-originals-and-clones`.
The owner's rulings (2026-11-26) are in the feature's journal.

| What                            | Where                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| Tables                          | `SynthFamily`, `SynthFamilyMember` in `prisma/schema/app.prisma`        |
| Shapes and the check            | `lib/app/families/data.ts` (`FamilyFileSchema`, `checkFamilies`)        |
| Seed                            | `lib/app/families/seed.ts`, unit `007-families.ts`                      |
| Seed data                       | `prisma/seeds/app-knowyoursynth/data/families/<id>.json`                |
| Read                            | `lib/app/families/read.ts` (`listFamilies`, `getFamilyOf`)              |
| Public API                      | `GET /api/v1/synths/families`, and `family` on `GET /api/v1/synths/:id` |
| Carrying a panel across (t-319) | `lib/app/synths/families/`                                              |

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

## Not here

- **Carrying the panel across a switch**, and the dropped-settings list: t-319, in
  `lib/app/synths/families/`. Ids are not renamed to make two members match. The map does that, and
  ids stay stable (`synths.md`).
- **One model for several members.** Where a new member's definition would otherwise repeat an
  existing one's voice, follow `defs/syncussion-kit.ts`. The TB-303 and TD-3 were deliberately not
  moved onto a kit (journal, 2026-11-26).
- **Playable panels for originals** (Minimoog, MS-20 and the rest) are synths of their own
  (`f-next-synths`). Each one joins its family as data: a member row gains a `synthId`.
