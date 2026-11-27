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
with ("ARP Odyssey Mk II" by ARP Instruments is "Odyssey Mk II", "EDP Wasp" by Electronic Dream Plant is "Wasp"), as
the catalogue names synths. A name that would be left without a letter keeps its maker ("ARP 2600").

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

The box finds a row by its name, maker, brand or family name, by its maker or brand and name together, or by its full
databank name, so "moog" finds every Moog, "arp odyssey" finds the Odyssey Mk II and "tb-303" finds every member of
the TB-303 family. Enter opens the first match; the arrow keys move through the rows of every group; typing
on the list carries on in the box.

## Thumbnails

`/synths/<id>/thumbnail.png` is the synth's panel as the page opens it (every control at its starting value, nothing
patched) in its `Synth.design`, fitted to 240×100: twice the row's 92×38 slot. It is drawn by the share card's
renderer (`panelPng`) and waits in the same queue as the card (`drawing.ts`: two drawings at once between them).

It is a page route, beside the share card's `opengraph-image`, not an `/api/v1` one: the picker asks for every synth's
at once, which the API's per-visitor limit is not sized for, and it is a picture of a page rather than data; what it
draws from is already served by `GET /api/v1/synths`. Repeats are cheap: each picture is kept in memory under a hash of
the synth, its definition version, its design, the box and a drawing version (`THUMBNAIL_DRAWING`, bumped when the
faceplate's drawing changes), which is also its ETag. A browser revalidates it on every use (`no-cache`), so the usual
answer is an empty 304, and a design turned back to neutral (D11, the maker's approval withdrawn) takes the maker's
marks off the picker at once.

A synth the catalogue does not serve is a 404. A panel that will not draw is a 404 too, remembered for ten minutes
(`NOT_DRAWN_SECONDS`) so a picker opened meanwhile does not queue it again ahead of the share card, and cached by the
browser for as long. The row shows its empty box instead.

## How it lists, and who chooses (t-329)

How the list is grouped and ordered, which kinds it lists and whether rows show a thumbnail are **choices**
(`PickerChoices`, `lib/app/picker/settings.ts`):

- **Group by**: under each maker's brand (the default), one list by name, or by **lineage**: each family's original
  (its earliest member) with the rest under it, oldest first, each marked a **Revision** (same brand) or a
  **Recreation** (another brand). A synth in no family stands alone. A member the box or a kind finds keeps its
  original over it. Lineage reads the families only; the databank's `recreationOf` links join it with t-330, when the
  list holds every instrument.
- **Order**: A to Z, newest first or oldest first. By maker the brands stay A to Z.
- **Kinds**: only the kinds chosen; none chosen lists every kind, and a synth with no kind is listed only then.
- **Thumbnails** on or off.

Three layers decide them:

| Layer                | Where                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The defaults in code | `FACTORY_PICKER`: by maker, A to Z, every kind, thumbnails, visitors may change them                             |
| The site's settings  | `SynthPickerSettings`, one row (`site`), admin config; no row is the defaults                                    |
| A visitor's changes  | `picker` on `/api/v1/me/settings` and `kys.picker`: only the choices that differ from the site's (`PickerPrefs`) |

A visitor's settings hold only what they changed, so one who changed the grouping still follows the admin's order. A
choice changed back to the site's is dropped rather than kept (`withChoice`), so it follows the site again. **Advanced
search** in the picker (`picker-advanced.tsx`) changes them, says whether the site's settings are in use, counts the
visitor's changes on its button, and resets to the site's (`{}`). They sync between the browser and the account as
every synth page setting does (`components/app/synth/settings.ts`, [`sounds.md`](./sounds.md)).

The site's settings also say whether **visitors may change** them: off, the picker has no Advanced search and lists by
the site's settings for everyone; a visitor's own are kept, unused. And whether **All synths ever made** is offered,
which t-330 brings.

- `GET /api/v1/synths/picker-settings`: the site's settings, public, with an ETag. The synth pages read them in process
  (`sitePickerForPage`), which serves the defaults if the read fails.
- `GET`/`PUT /api/v1/admin/synths/picker`: admin only. `PUT` takes the whole settings (`SitePickerSettingsSchema`),
  writes the one row (`writesSharedSettings`: product config every org shares) and audits the change
  (`synth_picker.update`).
- The admin page is `/admin/synths/catalogue/picker`, linked from the catalogue page.

## Still to come

**All synths ever made** (`f-synth-picker` t-330): the whole databank as a full-size browser, where a synth nobody has
modelled shows what the databank knows in the panel's place.
