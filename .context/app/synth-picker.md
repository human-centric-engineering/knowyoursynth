# The synth picker

The picker is the dropdown in the player's caption that chooses the synth (`f-synth-picker`). People look for a synth
by its name or by who made it, so every row leads with both, and the list is grouped under each maker. It lists every
synth that plays and every member of a synth family nobody has modelled yet, each a row of its own: the EDGE is found
as the EDGE, not inside a "DFAM" entry.

This page is the binding design. The owner chose it from a clickable mockup with real catalogue and databank rows
(https://claude.ai/artifact/JrUXrbsQ2UF3qvHfxD5nZi); the rulings are in the feature's journal (2026-11-27).

| What                             | Where                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ |
| The list, which opens            | `components/app/synth/picker-entries.ts` (`pickerGroups`, `familyOpens`) |
| The dropdown and its rows        | `components/app/synth/synth-picker.tsx`                                  |
| Brands, names without the maker  | `lib/app/catalogue/makers.ts` (`makerGroup`, `nameWithoutMaker`)         |
| A synth's kind                   | `kind` on `CatalogueSynth` and `FamilyInstrumentRef`, from the databank  |
| Thumbnails                       | `/synths/<id>/thumbnail.png` (`app/(panel)/synths/[id]/thumbnail.png/`)  |
| Drawing them                     | `components/app/sharing/panel-thumbnail.ts`, queue in `drawing.ts`       |
| What the page does with a choice | `pickSynth`, `pickMember` in `components/app/synth/synth-page.tsx`       |

## A row

Name and maker first, then the year and kind (`mono`, `poly`, `module`…), a **Plays** or **Not modelled** mark, and one
line of description, cut at two lines: a synth's heritage, or what an unmodelled member changed from the rest of its
family. A synth that plays has a thumbnail of its panel to the left; an unmodelled member has an empty box saying so.

A synth's kind is the databank's, from the first instrument it models (by id). A synth that models none has no kind,
and its row shows the year alone. An unmodelled member's name is its databank instrument's without the maker it starts
with ("ARP Odyssey Mk II" by ARP Instruments is "Odyssey Mk II"), as the catalogue names synths.

## Grouped by brand

Rows are grouped under their maker's **brand**, brands A to Z and rows A to Z within each. The catalogue and the
databank name makers as each instrument was sold, so one brand arrives under several names ("Moog", "Moog Music",
"R. A. Moog Co."). `makerGroup` joins those under one heading; each row still prints its own maker. Only spellings that
would otherwise split a brand are listed there: a maker not in it is its own group, and needs no entry until a second
spelling of it appears.

## Choosing

- **A synth that plays** opens as itself. One in the same family as the synth you are on is reached as the version
  toggle reaches it, with the panel carried across; any other is a plain navigation. Choosing the synth you are on
  closes the list, or leaves a blank panel for it.
- **An unmodelled member** opens as its family's blank panel (`.context/app/synth-families.md`): over this page when
  the member is in this synth's family, else over the family's member the signed-in user owns, else the family's
  default (`familyOpens`). Its row shows as selected while its blank panel does.
- A page that cannot show a blank panel (it passes no `onSelectMember`) lists no unmodelled members.

The box finds a row by its name, maker, brand or family name, so "moog" finds every Moog and "tb-303" finds every
member of the TB-303 family. Enter opens the first match; the arrow keys move through the rows of every group; typing
on the list carries on in the box.

## Thumbnails

`/synths/<id>/thumbnail.png` is the synth's panel as the page opens it (every control at its starting value, nothing
patched) in its `Synth.design`, fitted to 240×100: twice the row's 92×38 slot. It is drawn by the share card's
renderer (`panelPng`) and waits in the same queue as the card (`drawing.ts`: two drawings at once between them).

It is a page route, beside the share card's `opengraph-image`, not an `/api/v1` one: the picker asks for every synth's
at once, which the API's per-visitor limit is not sized for, and it is a picture of a page rather than data. Repeats
are cheap: each picture is kept in memory under a hash of the synth, its definition version and its design, which is
also its ETag; the response is cached for an hour, then revalidated, and a design change or a new definition is a new
picture. A synth the catalogue does not serve, or a panel that will not draw, is a 404, and the row shows no picture.

## Still to come

The owner's design has more than this first task (`f-synth-picker` t-329, t-330): an **Advanced search** window where a
visitor chooses grouping (name, maker, lineage), order, kinds and thumbnails, kept with their account, from defaults an
admin sets; and **All synths ever made**, the whole databank as a full-size browser, where a synth nobody has modelled
shows what the databank knows in the panel's place.
