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
  original over it (muted: Enter in the box passes over it). Once the databank's instruments are read (every synth
  ever made, below), lineage also follows what each row recreates.
- **Order**: A to Z, newest first or oldest first. By maker the brands stay A to Z.
- **Kinds**: only the kinds chosen; none chosen lists every kind, and a synth with no kind is listed only then.
- **Thumbnails** on or off.

Three layers decide them:

| Layer                | Where                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The defaults in code | `FACTORY_PICKER`: the synths that play, by maker, A to Z, every kind, thumbnails, visitors may change them       |
| The site's settings  | `SynthPickerSettings`, one row (`site`), admin config; no row is the defaults                                    |
| A visitor's changes  | `picker` on `/api/v1/me/settings` and `kys.picker`: only the choices that differ from the site's (`PickerPrefs`) |

A visitor's settings hold only what they changed, so one who changed the grouping still follows the admin's order. A
choice changed back to the site's is dropped rather than kept (`withChoice`), so it follows the site again. **Advanced
search** in the picker (`picker-advanced.tsx`) changes them, says whether the site's settings are in use, counts the
visitor's kept choices on its button (one kept while it matches the site's still counts, since it holds when the
site's changes), and resets to the site's (`{}`). They sync between the browser and the account as
every synth page setting does (`components/app/synth/settings.ts`, [`sounds.md`](./sounds.md)).

The site's settings also say whether **visitors may change** them: off, the picker has no Advanced search and lists by
the site's settings for everyone; a visitor's own are kept, unused. And whether **All synths ever made** is offered
(below).

- `GET /api/v1/synths/picker-settings`: the site's settings, public, with an ETag. The synth pages read them in process
  (`sitePickerForPage`), which serves the defaults if the read fails.
- `GET`/`PUT /api/v1/admin/synths/picker`: admin only. `PUT` takes the whole settings (`SitePickerSettingsSchema`),
  writes the one row (`writesSharedSettings`: product config every org shares) and audits the change
  (`synth_picker.update`).
- The admin page is `/admin/synths/catalogue/picker`, linked from the catalogue page.

## Every synth ever made (t-330)

The fifth choice, **Show**: the synths that play (the default), or **all synths ever made**, every instrument in the
databank. It is offered only while the site's settings say so (`offerAll`); off, every visitor lists the synths that
play, whatever they or the site chose, and Advanced does not show it. An admin can make it the site's default.

- **One list.** The picker reads `GET /api/v1/bank/instruments` once, when it first opens on everything
  (`bank-instruments.ts`), checked with `PickerInstrumentSchema`, and keeps it for the page's life; a failed read
  lists the synths that play, says so, and is tried again the next time the list opens. Each instrument carries its
  description and the synths that model it.
- **Rows.** Every synth and family member learns the databank instrument it is. Each other instrument is a row of its
  own (`bank:<id>`): one a listed synth models, or a family member already listed, is not listed twice.
- **Full size.** With everything, the list opens over the page (a scrim behind it; a click on it closes the list),
  not as a dropdown.
- **Lineage** follows what each row recreates (the databank's `recreationOf`) as well as its family, up to the first
  row with neither: the EDGE sits under the DFAM, the K-2 under the MS-20.

### An instrument nobody has modelled

Choosing one opens **`/synths/about/<id>`** (`app/(panel)/synths/about/[instrument]/page.tsx`,
`instrument-about.tsx`), read in process from the databank in one load. An instrument a listed synth models is that
synth: its address redirects to the synth's page. In the panel's place:

- maker, year, kind and the databank's description, with "Not modelled yet";
- what it recreates and what recreates it, each a link to its synth's page when it plays, or its own page here;
- who played it, and the records it is heard on;
- **Play the nearest**: what it recreates, else the first of what recreates it, that plays;
- **I own this** (`/api/v1/me/instruments`: on the owned list, moved there from the wishlist, or taken off);
- **Ask for it to be modelled** (below), with how many have asked;
- **Open in the databank** (its `/bank/instruments/<id>` page).

Signed out, the two that need an account say to sign in. The picker sits in the caption, naming the instrument; its
row is the selected one once every synth ever made is listed. A family member nobody has modelled is not shown here: its
address goes to its blank panel, over the family's default member.

### Asking for one to be modelled

`ModelRequest` is one row per user and instrument (`lib/app/picker/model-requests.ts`): asking again changes nothing,
withdrawing removes it, and an instrument the databank does not have is a 404. It is about a person: its user FK is
written by hand in the migration, `ON DELETE CASCADE`, pinned by a drift probe, and it is declared for subject export
(`modelRequests`), owner classification and tenancy (user-owned), as `OwnedInstrument` is.

- `GET /api/v1/me/model-requests`: the instruments the caller asked for.
- `GET`/`PUT`/`DELETE /api/v1/me/model-requests/:instrumentId`: `{ instrumentId, asked, count }`.
- `GET /api/v1/admin/synths/model-requests`: each instrument anyone asked for, how many asked and when the last did,
  the most asked first. It names nobody. The admin page is `/admin/synths/catalogue/model-requests`.
