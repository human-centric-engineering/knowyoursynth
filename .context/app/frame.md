# The app frame

How Know Your Synth dresses Sunrise: the synth page's own route group, the consumer palette,
the faces, and the nav seams. f-app-frame (§4) in [`planning/app-plan.md`](./planning/app-plan.md).

## The `(panel)` route group

```
app/(panel)/
├── layout.tsx            the faces, the frame, maintenance mode
├── error.tsx             inside the frame, so the header stays
└── synths/
    ├── page.tsx          reopens the last synth opened (see synth-page.md)
    ├── loading.tsx       the skeleton while a synth is read
    └── [id]/page.tsx     the synth page (synth-page.md)
```

A group of its own because a synth panel is a full-window instrument. `(public)` and
`(protected)` put their pages in a centred `container`, and a nested layout cannot escape its
parent. Public: a synth opens without an account, so nothing here is in `protected-routes.ts`.

The frame is `components/app/shell/`:

| File               | What it is                                                                |
| ------------------ | ------------------------------------------------------------------------- |
| `panel-header.tsx` | Wordmark, `PublicNav`, `HeaderActions`; `AppHeader` without its container |
| `panel-footer.tsx` | One slim line: legal links, **Cookie Preferences**, the attribution line  |
| `panel-frame.css`  | The frame's type: Instrument Sans for text, Michroma for the wordmark     |

The footer must keep Cookie Preferences. A fork that supplies its own footer frame has to render
a real one (`lib/app/footer.ts`).

## The faces

The prototype's five faces (Archivo Narrow, Barlow Semi Condensed, Instrument Sans, JetBrains
Mono, Michroma) come from **Fontsource**, imported by the `(panel)` layout, Latin subset only.

**Not `next/font`.** `next/font` renames each family to a hash (`'__Michroma_1a2b3c'`), and the
ported panel names its faces literally in SVG attributes (`fontFamily="'Michroma', …"`), as the
prototype did. Fontsource declares the real names, self-hosted from the bundle: no third-party
request, no CSP change. Once the layout's CSS is on the page the faces are document-wide, so a
body-portaled dialog can use them too. A page outside `(panel)` that wants them imports the same
CSS.

## The palette

`app/brand-theme.css` dresses the **consumer** surface, which is everything but `/admin`: the
frame, the marketing pages, the dashboard, the auth pages and every portaled overlay. Admin
keeps Sunrise's defaults. The surface split is the platform's default `classifySurface`; the
seam is not filled.

It holds the prototype's palette twice over:

- **`--kys-*`** are the prototype's roles (ground, desk, surface, raised, line, text, muted,
  faint, accent, accent-ink, good, warn), with light and dark values. The synth page's
  components (m3) were written against these.
- **`--color-*`** are Sunrise's tokens, mapped onto them: ground → background, surface → card
  and popover, raised → secondary, muted and accent, line → border, accent → primary, warn →
  destructive.

Change a colour in the `--kys-*` block; the `--color-*` mapping follows it.

**One copy is not a variable.** The neutral panel design (D11) paints the faceplate in the dark
`--kys-raised`, `--kys-surface` and `--kys-text`, copied as hex into `NEUTRAL_PANEL` in
`components/app/panel/synth-panel.tsx`, because SVG presentation attributes do not reliably
resolve `var()`. Change those three roles and you change `NEUTRAL_PANEL` too.

**Light and dark** are Sunrise's `.dark` class and its toggle, replacing the prototype's
`kys.theme`. Sunrise saves the first preference it sees and stops following the device
(sunrise#756). Lelañea's divergence ledger, row 2, is the worked fix, if the app wants it before
upstream does.

## The nav seams

- `lib/app/protected-nav.ts`: Sunrise's four links, with `/dashboard` called **My synths**.
- `lib/app/auth-landing.ts`: the label only. The landing stays `/dashboard`.
- `lib/app/public-nav.ts` and `lib/app/footer.ts` stay `null`. Their defaults are what the site
  has today, and a filled copy of a default stops tracking upstream.

**A nav link joins when its route exists.** `/synths`, `/bank` and `/explore` (plan §4, route
map) are added by the features that build them. A link to a 404 is worse than none.
