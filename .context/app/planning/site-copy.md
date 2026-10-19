# Know Your Synth — site copy

How Know Your Synth speaks, written once for the owner to sign off before any page changes.
`f-front-door` t-62 writes it; t-63 puts it on the home, about and contact pages, the footer and
the empty states. Privacy and terms are t-64's, and are not here.

The structure is BeatBreaker's `site-copy.md` (`~/code/beatbreaker/.context/app/planning/`). The
reasons are re-derived below rather than copied: BeatBreaker sells a generator, and Know Your Synth
teaches instruments people already own or want to.

---

## House style

**The direction (owner, 2026-10-19).** Plain language, down to earth, not cheesy or salesy. The
copy invites synth owners to get properly acquainted with their gear. It reads the way a
knowledgeable friend talks you through an instrument, not the way a launch page sells one. The app
is a way to learn a synth you own or are curious about. It is not a replacement for the instrument,
and it doesn't pretend to be.

- **Plain English, short sentences.** Say what the thing does and stop. British spelling:
  _synthesiser_ in prose, _colour_, _practise_ the verb and _practice_ the noun. Product names keep
  their own spelling.
- **Banned:** "unlock", "supercharge", "revolutionise", "seamless", "AI-powered", "next-level",
  "journey", "dive in". No exclamation marks, no emoji.
- **"You" is the person at the panel.** "We" is the people who make the app, and appears only on
  About and Contact.
- **The tutor is described by what it does**: it answers questions about the sound on the panel,
  suggests changes you can apply and undo, designs a sound with a lesson, and says where its answers
  came from. Not by what it is built on. It is "the tutor", lower case, and the panel's heading
  "AI tutor" is the one place the word AI appears, because a learner should know what they are
  talking to.
- **Name the instruments.** The app is about them. Makers are named only as fact ("Roland's
  Jupiter-8, 1981"), never in a way that suggests they made, approve of or endorse the app (D11).
  No maker logos or wordmarks anywhere in the site's own pages.
- **Never claim to be the instrument.** Say "the Model D panel", "a model of", "plays like". Not
  "the real thing", "authentic", "every nuance".
- **The words for things**, as the app already uses them: a **synth** (one the app plays), an
  **instrument** (any entry in the databank), a **sound** (library or your own), a **lesson** (a
  sound built step by step), the **panel**, the **databank**, **My synths** (the dashboard),
  **Explore**.

### No counts

**The copy quotes no counts** (owner, 2026-10-19): not how many synths, sounds, lessons,
instruments, artists or records, and not the tutor's daily allowance. The catalogue and the
databank keep growing, so a count is out of date the day a synth is added. Say what is there
("every synth", "a library of sounds", "the databank") and let the pages show how much. The same
goes for counting kinds ("three modular systems") and for the oldest or newest synth.

A fact about one instrument is not a count: "Roland's Jupiter-8, 1981" is fine.

---

## 1. Home — `/`

**Meta title:** Know Your Synth — learn the synths you own
**Meta description:** Play a synth's panel in your browser, find out what every control does, and work
through its sounds one step at a time. Free to use.

### Hero

> # Get to know your synth.
>
> Play the panel in your browser. Point at any control to find out what it does. Then build the sounds
> one step at a time, until you could make them on the hardware without the app.
>
> **[Play the {first synth}]** · [See all the synths]

- `{first synth}` is the first listed synth by name (the Model D today), linking to
  `/synths/{id}`. A signed-out visitor can play it, so the hero goes straight there, not to sign-up.
- "See all the synths" jumps to the synth list on the same page (below).
- Beside or under the hero: that synth's panel, drawn by the app itself (`panel-image.ts`, the
  social card's renderer), in its catalogue design. No stock photo, no illustration of a keyboard.

### The synths

> ## The synths, panel by panel
>
> Monosynths, polysynths, semi-modulars and modular systems, from early classics to instruments
> still in the shops. Each one is laid out like the hardware, with the same controls in the same
> places. More are added as they are ready.

Then the list: every listed synth's name, maker and year, each linking to its page, in the
catalogue's order. The heritage line from the catalogue goes under each name ("Modelled on the 1970
Minimoog Model D"). Nothing is written by hand here; it is the `Synth` table.

> Don't see yours? [Tell us which one](/contact).

### What you can do

Five short sections. Each heading links somewhere real.

> ### Hear what each control does
>
> Point at a knob and the panel tells you what it is for, what it does to the sound on the panel
> now, and anything unusual about it on this synth. Turn it and listen. The sound map shows which
> parts of the panel the current sound is using, and which controls change it most.
>
> [Open a synth →](/synths)

> ### Learn the sounds one step at a time
>
> Each synth comes with a library of sounds, and every one is a lesson. Start from a basic patch and add one change at a time, with a line on why, until you have the whole sound.
> Then the lesson suggests what to try next to make it your own.
>
> [Open a synth →](/synths)

> ### Ask the tutor
>
> The tutor knows the panel in front of you. Ask why a sound behaves the way it does, or how to make
> it darker, and it suggests changes you can apply and undo. Describe a sound and it builds one on
> this synth, with its own lesson. Under each answer it says where the answer came from, or that it came from what the tutor already
> knows.
>
> It can be wrong. Treat what it says as a starting point and trust your ears. It's free with an
> account, up to a daily allowance.
>
> [Create a free account →](/signup)

> ### Look things up in the databank
>
> Instruments, artists and records, joined up. Find out who played what on which
> record, which synths came from which designers, and which modern instruments are modelled on older
> ones. From a record, load a sound in its style on the synth that played it.
>
> [Open the databank →](/bank)

> ### Keep your sounds, and share the good ones
>
> Save sounds to your account and pick up where you left off on any computer. Mark the synths you
> own and the ones you want. Share a sound with a link, or publish it to Explore for other people to
> play and learn from. It appears under a username you choose, never your name or email.
>
> [See what people have made →](/explore)

### A short word on what this is

> ## Not a replacement for the instrument
>
> Each panel is a model of the synth: the same controls and the same signal path, so what you learn
> carries across. It doesn't reproduce the hardware's circuits, and each synth says what it doesn't
> model. If you own the synth, use the app to get to know it, then go and play the real one. If you
> don't own it yet, you will have a good idea of what it does before you buy.
>
> [How the panels are made →](/about)

### Questions

> **Do I need an account?**
> No, to play a synth and work through its lessons. Your panel is kept in your browser. An account
> saves your sounds and your progress, lets you ask the tutor, and lets you share. It's free.
>
> **Do I need the hardware?**
> No. Everything plays in the browser. A MIDI keyboard works in Chrome and Edge if you have one; a
> computer keyboard works if you don't.
>
> **Does it work on a phone?**
> You can read and look things up on a phone. Playing a full panel needs a computer, or a tablet
> held sideways.
>
> **Does it sound exactly like the hardware?**
> No, and it doesn't try to. Every panel drives one shared voice, built so the controls do what they
> do on the hardware. Close enough to learn on, not a substitute for the instrument. Each synth's
> "What is not modelled" list says where it differs.
>
> **Is it made by the synth makers?**
> No. Know Your Synth is independent. [About](/about) says more.

### Closing

> ## Pick a synth and press a key.
>
> **[Play the {first synth}]**

---

## 2. About — `/about`

**Meta title:** About
**Meta description:** Who makes Know Your Synth, how the panels are modelled, and what they don't
model. Independent, and not affiliated with any synth maker.

> # About Know Your Synth
>
> Know Your Synth is for people who own a synth, or are thinking about one, and want to understand
> it properly. Not just which knob does what, but why a sound is made the way it is, and how to make
> your own.
>
> _[OWNER: the origin story, in at most three sentences. Why you built it, and for whom.]_
>
> ## How the panels are made
>
> Each synth is laid out from its published specification and manual: the same controls, switches
> and jacks in the same places, with the same ranges and the same routing. The modular systems are
> patched with cables, as the hardware is.
>
> Behind every panel is one shared digital voice. That is why a sound loads instantly and why the
> controls behave as they do on the hardware. It is also why the panel is a model and not a copy:
> component tolerances, tuning drift and the particular distortion of one circuit are approximated,
> not reproduced.
>
> Every synth has a **What is not modelled** list on its page that says where it differs, and some
> things are true of all of them. There is no microphone or line input, and the hardware's own MIDI
> sockets and power switches are drawn for reference only.
>
> The descriptions, lessons and notes are written for this app, in our own words. We don't copy
> manuals.
>
> ## Two ways a panel can look
>
> Each panel has the same layout, controls, colours and lettering as the hardware. By default it
> leaves out the maker's logos, wordmarks and model badges: the **neutral** design. A synth whose
> maker has agreed to it can show its **faithful** design, with those marks in place. The sounds
> and lessons are the same on both. The app's text names every synth either way, so you know which
> instrument you are learning.
>
> ## The tutor
>
> The tutor is an AI model given the synth on your screen and a few tools: it can read the panel,
> search the databank and search the web. It suggests changes rather than making them, and you
> choose whether to apply each one. What you type to it is sent to an AI provider to be answered,
> and its web searches go to a search service. The [privacy policy](/privacy) names both.
>
> ## The databank
>
> The databank is compiled for this app from facts: who played what on which record, who designed
> which instrument, and when. Instruments added for completeness each link the page their facts were
> checked against. If something is wrong, [tell us](/contact) and we will fix it. Synth people will
> know.
>
> ## Not affiliated with any synth maker
>
> Know Your Synth is an independent learning tool. It is not made, endorsed, sponsored or approved
> by any of the companies whose instruments it models or lists, including ARP, Behringer, Buchla, EMS,
> Korg, Moog, Oberheim, Roland and Sequential, or by the people and estates behind them.
>
> Product names, model names and maker names are trademarks of their owners. They are used here only
> to say which instrument a panel models or a record was played on. Where a panel shows a maker's
> marks, it is because that maker has agreed to it.
>
> The panels are models made for learning. They are not the instruments, and they are not sold as
> substitutes for them. If you are a maker or rights holder and something here concerns you,
> [contact us](/contact) and we will look at it promptly.
>
> ## Who makes it
>
> Know Your Synth is made by HCE Studio. [Get in touch](/contact).

**Notes for t-63.**

- The maker list in the notice is every company a listed synth names as its maker or in its
  heritage line (the `Synth` table today). It is a list of fact, so it is fine to keep it fixed in
  the copy; add a name when a ported synth brings a new one, and the notice still holds without it
  ("including").
- The two-designs paragraph is D11 as revised 2026-10-11. If the legal review changes the
  faithful design's rule, this paragraph changes with it.
- "Some things are true of all of them" summarises the shared `LIMIT` notes
  (`data/notes/shared.json`). Read it from there if the page grows a fuller list.

---

## 3. Contact — `/contact`

Keep Sunrise's contact form. Replace the intro, and the side column's three cards.

**Meta title:** Contact
**Meta description:** Report a mistake, ask for a synth, or tell us something. We read everything.

> # Get in touch
>
> Found a control that doesn't do what it does on the hardware, a wrong fact in the databank, or a
> lesson that loses you halfway? Want a synth added? Tell us here. We read everything, though we
> can't always reply.
>
> To report a published sound, use **Report** on its page. It reaches us faster.

The form's card: **Send a message** · _Say which synth or page, if it's about one._

Side column, replacing "Email", "Response time" and "GitHub":

> **Email**
> _[OWNER: the contact address]_
>
> **Makers and rights holders**
> If you make or own the rights to an instrument the app models, write to us here and say which.
> We will look at it promptly.

No response-time promise and no GitHub card: neither is a commitment the app has made.

---

## 4. The footer line

`footerCopyright` in `lib/app/footer.ts`, verbatim, no year:

> Independent. Not affiliated with any synth maker. Product names are trademarks of their owners.

The full notice is on About; the footer's legal links already reach it. Kept to one line at the
panel footer's width.

---

## 5. Empty states

Every empty, none-yet and nothing-matches message shipped so far, found by grep over
`components/app/**`, `app/(public)/**`, `app/(panel)/**` and `app/(protected)/**` (admin excluded:
operators, not learners). Line numbers are at `3ecf6a64`. **Keep** means the current text already
meets the house style and t-63 leaves it alone.

| File                                                    | Current text                                                                                                                                                                                                        | New text                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/app/synth/reopen-synth.tsx:37`              | No synths are listed yet.                                                                                                                                                                                           | No synths are listed at the moment.                                                                                                                                                                                               |
| `components/app/synth/synth-page.tsx:1428`              | This synth has no sounds yet.                                                                                                                                                                                       | There are no library sounds for the {name} yet, so there's no lesson to show. The panel still plays.                                                                                                                              |
| `components/app/synth/library.tsx:171`                  | No sounds match. Clear the search[, pick another category], or ask the tutor to design one.                                                                                                                         | No library sound matches that. Clear the search[, pick another category], or ask the tutor to design one.                                                                                                                         |
| `components/app/synth/library.tsx:183`                  | No sounds match. Clear the search or pick another category.                                                                                                                                                         | No library sound matches that. Clear the search or pick another category.                                                                                                                                                         |
| `components/app/synth/my-sounds.tsx:156`                | None on this synth yet. Save the panel, or save a copy of a sound below.                                                                                                                                            | You haven't saved a sound on the {name} yet. Save the panel as it is, or save a copy of a library sound below.                                                                                                                    |
| `components/app/synth/search.tsx:136`                   | Nothing on the {name} panel matches “{q}”. Try a plainer word, such as filter, echo or pitch.                                                                                                                       | Keep.                                                                                                                                                                                                                             |
| `components/app/synth/sound-map.tsx:98`                 | No control changes this sound much with a small move.                                                                                                                                                               | Keep.                                                                                                                                                                                                                             |
| `components/app/synth/sound-map.tsx:284`                | No one or two controls bring it in. It may need a patch cable, or several things changed at once.                                                                                                                   | Keep.                                                                                                                                                                                                                             |
| `components/app/tutor/tutor-panel.tsx:74` (signed out)  | The tutor explains the sound on the panel, suggests changes you can apply and undo, and designs new sounds with a lesson. Sign in to ask it.                                                                        | The tutor explains the sound on the panel, suggests changes you can apply and undo, and designs new sounds with a lesson. [Sign in] to ask it. It's free, with a daily allowance.                                                 |
| `components/app/tutor/tutor-panel.tsx:163` (no turns)   | Ask about the sound on the panel, or describe a sound and the tutor builds it on the {name} with a step-by-step lesson. Every change can be undone. Treat what it suggests as a starting point and trust your ears. | Ask about the sound on the panel, or describe one and the tutor builds it on the {name} with a step-by-step lesson. You choose whether to apply each change, and every change can be undone. It can be wrong, so trust your ears. |
| `components/app/dashboard/my-sounds-card.tsx:37`        | None yet. Open a synth from Synths and press Save, or Save a copy of a library sound.                                                                                                                               | You haven't saved a sound yet. Open a [synth], get it sounding the way you like and press **Save**. Or save a copy of a library sound and change it from there.                                                                   |
| `components/app/dashboard/lessons-card.tsx:63`          | None yet. Open a sound in a synth's library and press Build it step by step.                                                                                                                                        | No lessons started yet. Open a sound in a synth's library and press **Build it step by step**. How far you got is kept here.                                                                                                      |
| `components/app/dashboard/favourites-card.tsx:41`       | None yet. Press the star beside a synth's name, or beside a sound in its library.                                                                                                                                   | No favourites yet. Press the star beside a synth's name, or beside a sound in its library, and it will show up here.                                                                                                              |
| `components/app/account/synth-lists.tsx:21` (owned)     | None yet. Search above and choose “I own it”.                                                                                                                                                                       | Keep.                                                                                                                                                                                                                             |
| `components/app/account/synth-lists.tsx:22` (wishlist)  | None yet. Search above and choose “I want it”.                                                                                                                                                                      | Keep.                                                                                                                                                                                                                             |
| `components/app/account/instrument-picker.tsx:122`      | No synth in the databank matches that.                                                                                                                                                                              | No synth in the databank matches that. Try the maker's name, or part of the model name.                                                                                                                                           |
| `components/app/bank/bank-shell.tsx:168`                | Nothing matches “{q}”.                                                                                                                                                                                              | Nothing on this tab matches “{q}”. The counts on the other tabs show where it does turn up.                                                                                                                                       |
| `components/app/profile/public-profile.tsx:51`          | Nothing else here yet.                                                                                                                                                                                              | Nothing shared here yet.                                                                                                                                                                                                          |
| `components/app/profile/public-profile.tsx:63`          | None listed yet.                                                                                                                                                                                                    | Keep.                                                                                                                                                                                                                             |
| `app/(public)/explore/page.tsx:132` (page out of range) | There are not that many pages.                                                                                                                                                                                      | There aren't that many pages. [Back to the first page].                                                                                                                                                                           |
| `app/(public)/explore/page.tsx:134` (filters)           | No published sounds match these filters.                                                                                                                                                                            | No published sound matches these filters. Take one away, or try another synth.                                                                                                                                                    |
| `app/(public)/explore/page.tsx:135` (none at all)       | Nothing published yet.                                                                                                                                                                                              | Nobody has published a sound yet. Open a [synth], make something you like, save it, and publish it from its sharing options.                                                                                                      |

**Notes for t-63.**

- `{name}` is the synth's display name, which `my-sounds.tsx` doesn't hold today; pass it in.
- Bracketed words are links: `[synth]` to `/synths`, `[Sign in]` the existing link,
  `[Back to the first page]` to Explore with the page parameter dropped.
- The tutor's signed-out line says "free, with a daily allowance" and no figure, as above.

---

## 6. Page design notes for t-63

The copy above assumes these. They follow the frame that already exists (`frame.md`) rather than
inventing a second look for the marketing pages.

- **The instrument is the image.** The home hero shows a real panel, rendered by the app, in the
  synth's catalogue design. Nothing else on the marketing pages is a picture: no stock photography,
  no illustrated keyboards, no gradient blobs.
- **Type from the frame.** Michroma for the wordmark only, Instrument Sans for text, JetBrains Mono
  for figures (years, values). Section labels in the panel's `kys-label` style, so headings read
  like the legends printed on a faceplate. The marketing pages import the `(panel)` faces' CSS
  (`frame.md`, "The faces").
- **Colour from `--kys-*`.** The ground and surface roles, with the accent kept for links and the
  one primary button per screen. Light and dark both, through Sunrise's toggle.
- **The synth list reads like a rack**, not a grid of cards: one line per synth, name, maker, year
  and heritage, with the year in the mono face, so the whole list scans as a
  reference, however long it grows.
- **Motion is minimal.** At most a single staggered reveal on the home page, off under
  `prefers-reduced-motion`. Nothing animates on scroll.
- **One primary action per screen**: play a synth. Sign-up is a link, not a banner.

---

## Found while writing

- **A stale shared limit.** `data/notes/shared.json`'s last limit, "MIDI needs its own page", says
  "Claude's artifact viewer does not pass MIDI permission through", which was true of the prototype
  and isn't of the app. Every synth's "What is not modelled" list shows it. Not this task's to fix:
  it is catalogue content, and a seed change.
