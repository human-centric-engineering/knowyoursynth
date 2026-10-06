# Synth definitions

How a synth is described to the app: one **`SynthDef`** per instrument, plain data plus one
pure `toEngine()` function. The panel renderer, the sound engine, the cable explainer, the
sound map and the lessons know nothing synth-specific; everything they draw, play or say comes
from the definition.

| What                                                   | Where                                                     |
| ------------------------------------------------------ | --------------------------------------------------------- |
| The shapes (source of truth)                           | `lib/app/synths/contract.ts`                              |
| The definitions                                        | `lib/app/synths/defs/<id>.ts` (ported from the prototype) |
| Sound validator (unknown controls, ranges, bad cables) | `lib/app/synths/validate.ts`                              |
| Reference implementation                               | `prototype/src/synths/model-d.js` → `defs/model-d.ts`     |
| Prototype prose this replaces                          | `prototype/CONTRACT.md`                                   |

This page is the guidance the types cannot carry. For the fields themselves, read
`contract.ts`: every type and field is doc-commented. Where `CONTRACT.md` and the prototype
code disagreed, the types follow the code (see [Where the code won](#where-the-code-won)).

## Rules that break things when ignored

- **`toEngine()` is pure.** Same values and context in, same params out. No randomness, no
  module state. The sound map renders hundreds of variants through it.
- **"Nothing" is a real `0` / `false` / absent.** A level knob at 0 gives `level: 0`, not
  `0.0001`. Otherwise the sound map cannot tell a control that is off (`zero`) from one that is
  on, and "Dim unused parts" lies.
- **Cables are not `toEngine()`'s job.** The app turns cables into engine routes from the jack
  definitions (`signal` / `dest` / `amt` / `add` / `gain`). `toEngine()` may read
  `ctx.patched[jackId]` to change panel routing when a jack is in use (an insert jack, a
  normalled source).
- **`ui: true` controls change what the panel shows, never the sound.** `toEngine()` must
  ignore them.
- **Every control and every jack sits inside exactly one area**, and areas do not overlap (the
  rects of one area may touch). The search, the cards, the cell map and the tour depend on it.
  With a `modular` layout this must still hold after the cut.
- **Ids are stable.** Sounds, lessons, unusual notes and the databank refer to control and jack
  ids; renaming one orphans them. `annotate()` throws on an unusual note whose id matches
  nothing; `validate.ts` refuses a sound that names a control or jack the synth does not have
  (`validateSound` / `validatePreset` return every problem with its path; the lenient
  `sanitize*` helpers in `lib/patch.ts`, used on AI output, drop them instead).
- **No per-synth data for the sound map.** "Dim unused parts" and "Show sensitive controls" are
  worked out from the definition alone.

## Authoring a definition

Follow `model-d`: small local helpers (`knob()`, `text()`, `jack()`) push into `controls`,
`decor` and `jacks`; `init` is built from each control's `def`; `toEngine()` comes last.

- **Coordinates** are view units: the pixel space of the cropped panel photo. `view.h` is the
  faceplate height only; cheeks sit inside `view.w`. Angles are degrees, 0 = 12 o'clock,
  clockwise. Knob sweep is always −150°…+150°.
- **Control ids** are `module.param` (`filter.cutoff`). `module` is one of `SYNTH_MODULES`
  (`patch` is for areas and sound steps only).
- **`cont` values are panel units**: what the hardware prints, usually 0–10. Convert to Hz,
  seconds and gains inside `toEngine()` with the helpers in the ported `maps` library
  (`expMap`, `pwl`, `level10`, `fmtTime`, `fmtHz`, `fmtSemi`).
- **Labels** are drawn upper-case as supplied, in the theme font. `\n` breaks a line; a `\n`
  label at `labelPos: 'left' | 'right'` is stacked and centred. Switch position names are not
  drawn for you: add `text` decor. When several controls share a printed label, give each a
  `name` for search and cards.
- **Help copy**: one or two plain sentences on what the control does to the sound. British
  spelling, concrete, no hype. Areas get two to four sentences and `keywords` for synonyms not
  already in the text.
- **Unusual notes** (one to three sentences) only where this synth names, lays out or wires
  something differently from most synths, tied to something a synth user already knows
  ("EMPHASIS is Moog's word for resonance"). Facts, not opinions; never a repeat of `help`.

### Controls: which `type` takes which `kind`

`Control` is a union on `type`, each member allowing only the kinds below. Narrow on `kind`
for values (`cont` → `min/max/def: number`, `enum` → `options/def`, `bool` → `def: boolean`).

| `type`     | kinds      | Notes                                                                                 |
| ---------- | ---------- | ------------------------------------------------------------------------------------- |
| `knob`     | cont, enum | `style` picks the cap; `scale` prints numbers or labels; enum options carry angle `a` |
| `slide`    | enum, bool | 2–3 positions, order top→bottom / left→right; bool `true` is top/left unless `onAt`   |
| `rocker`   | bool, enum | First option = left/top pressed; three options draw as one three-segment paddle       |
| `button`   | bool, enum | bool toggles, enum cycles; light it with `lamp`, `capLamp`, or `led` decor            |
| `fader`    | cont       | (x, y) is mid-travel; max at top / right                                              |
| `select`   | enum       | One backlit button per option, at the option's own x, y                               |
| `menu`     | enum, cont | One row of a display page; pair with `lcd` decor and `show`                           |
| `toggle`   | bool, enum | Bat handle seen from above; enum of three = up–centre–down                            |
| `joystick` | cont       | Two cont −1..1 controls; the drawn one names the other in `pair`, which has `pairOf`  |

**Panel modes** (DeepMind): `show: { id, eq }` or `{ id, in: [...] }` (a list must all hold)
draws a control only while another control has that value, so several controls can share one
position. A hidden control keeps its value and stays in the sound. A lesson step that sets a
hidden control should also set the mode that shows it. `deep: true` lists a menu parameter on
a card only while it is on screen; `find: false` keeps a duplicate out of search.

### Jacks

`Jack` is a union on `dir`. An input names an engine **destination** (`dest`), an output an
engine **signal**; `null` means the engine cannot model it, and `help` must say so (cables still
draw, they just do nothing audible).

- `amt` (inputs): how far a full-scale source moves the destination, in the destination's unit.
  A function of the panel when a depth knob scales the jack. `gain` (outputs) scales whatever
  the jack sends.
- `add: true` (inputs): the cable sums with the normalled source instead of breaking it (most
  CV inputs). Audio inputs and gates break the normal.
- The **cable explainer** writes its text from `signal` / `dest` / `amt` / `add`, the live
  `toEngine()` result and the engine's routing rules. A definition supplies only what it cannot
  know: `name` (when labels repeat), `check(v)` (why the cable is inaudible right now, naming
  the control to move), `hear(v, x)` (replaces the "what you will hear" sentence when panel
  routing decides it; return `null` to fall back), `does` (replaces the depth sentence), and the
  synth-level `signalNames` / `destNames` for running text.
- `part: 0 | 1` assigns a jack to one voice of a `dual` synth.

### Decor

Silkscreen and hardware that is not a control: `Decor` is a union on `t` (`frame`, `text`,
`line`, `path`, `rect`, `circle`, `wave`, `screw`, `din`, `usb`, `led`, `logo`, `arrow`,
`tab`, `arc`, `lcd`). Colours default to `theme.ink`; a coloured `stroke` / `fill` is print
colour, and the outline view draws it in ink. `hw: true` prints an item in the hardware view
only. `rect` and `path` fills may use the renderer's print patterns (`url(#kysPatMesh)` and
friends, listed on `DecorFill`). `led` lights by `litWhen` (see `LitWhen`).

## `toEngine()` and `EngineParams`

The required core is one subtractive voice: `osc[]` (up to four), `noise`, `ext`, `filter`,
`env1`, `env2`, `vca`, `lfo`, `glide`, `trig`, `volume`. Everything else is **opt-in and off
when absent**, added synth by synth:

| Feature                                | Fields                                                                   | Added for          |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| Panel modulation and normals           | `routes`, `normals`, `att`, `sh`, `slew`, `od`, `delay`                  | Model D, Neutron   |
| Separate waves, duophony, utilities    | `oscOuts`, `pwSplit`, `duo`, `trig.src`, `ring`, `preamp`, `envf`, `rev` | 2600               |
| Series high-pass                       | `hpf`                                                                    | K-2, Jupiters      |
| Polyphony, arpeggiator, effects        | `poly`, `arp`, `post`, `env3`, `lfo2`, `drift`, `fx`                     | DeepMind 12D       |
| Two voices                             | `dual` (stereo)                                                          | 2-XM               |
| Morphing oscillators, sub, paraphony   | osc `morph`, `syncGate`, `mix.sub`, `note2Osc`, `oscAssign`, `chorus`    | Kobol, CAT, Poly D |
| Accent                                 | `acid`                                                                   | TB-303, TD-3       |
| VCS3                                   | osc `skew` / `sineShape`, `trap`, `joy`, `outAmps`, `rev.unit`           | EMS VCS3           |
| West Coast voice                       | `easel` (replaces the fixed voice)                                       | Music Easel        |
| Moog 900 modular, in volts             | `moog` (replaces the fixed voice)                                        | System 15/35/55    |
| Sub out, pink noise, utility high-pass | osc `subLevel`, `subOut`, `hp6`                                          | Model 15           |

A synth whose sound path is `easel` or `moog` still returns the core stubs (`osc: []` etc.).
`fx`, `dual`, `chorus` and `outAmps` make the synth stereo, and the sound-map probe renders it
in stereo. A one-voice synth that needs the arpeggiator or chorus uses
`poly: { voices: 1, stack: 1, mono: true }`. The app adds `cables` and `wheel` to the params
after `toEngine()`; a definition never returns them.

**Engine vocabulary.** Signals and destinations are the engine's `SIGNALS` / `DESTS` lists
(typed as strings, because the Moog 900 names are generated per slot). Units at a destination:
pitch in semitones, `cutoff` / `cutoffHp` / `lfoRate` / `delayTime` in octaves, `pw*` ± duty,
`amp` linear gain, gates above 0.5, audio and utility inputs at unit gain. Bipolar signals run
−1..1, envelopes and gates 0..1, `kbd` is (note − 60) / 12 octaves. On the Moog systems every
signal is in volts and jack `amt` is 1 (0.2 into the app's OUTPUT jacks).

**Normals** are what feeds a destination with no cable in its jack: a signal, `[signal, gain]`,
or `null` to remove one of the engine's built-ins (`vcfIn←mixer`, `odIn←vcf1`, `vcaIn←od`,
`delayIn←vca`, `gate1/gate2←gate`, `shIn←noise`, `dryIn←out`). Normal gains and jack `amt`
functions are how a panel depth knob scales whatever is patched into (or normalled to) its
jack. **Routes** are panel routings: they sum and never break a normal; `by` multiplies a
route's depth by a second signal.

## Sounds

A `Preset` is built step by step: each step's `set` and `cables` apply cumulatively on top of
`init`, with a `why` that says what to listen for. The first tag is the category
(`PRESET_CATEGORIES`); `phrase` is a short riff that shows the sound off, not a copy of the song
(TB-303-style riffs carry a velocity as a fourth item). Every control a step touches that
matters to the sound gets a `context` line.

- In the app, sounds are rows in the catalogue tables, not part of the definition (the prototype
  kept them on it; `SynthDef.presets` is optional for that reason). Every stored sound passes
  `validate.ts` against its definition.
- Copy: plain English, British spelling, concrete actions, no hype. Say "in the style of",
  never claim to be the exact patch.
- Run the synth check after adding or changing one (see `.context/app/check/README.md`): it
  validates every id, value and cable, checks each cable can be explained, and renders the riff
  through the real DSP.

## Lineage and the databank

A synth's history (`Lineage`: title, intro, timeline, relatives, optional users and note) is
shown under the lesson. Its "Heard on" list is **never written per synth**: it is joined from
the databank (`BankSong` parts whose instruments are modelled by the synth via
`BankInstrument.app`, or that name it in `synths`). List a record only where the instrument is
well documented, and name the real instrument in `on`. Artist `story` is three to five
sentences of fact; `innovations` are one sentence each and only where a matter of record.

## Where the code won

`contract.ts` was checked against every key the 25 prototype definitions, their `toEngine()`
output for every sound, and the databank actually use. Where the prose was silent or wrong:

- Decor `circle` exists (nuts, holes, rings) though the prose only mentions it in passing; frame
  takes `labelX` and `sw`; logo takes `sub`; text `spacing` may be a number; `lcd` takes `titleH`.
- An `led`'s `litWhen: { id, … }` may combine `eq` with `in`.
- Controls: knobs take `cap` (VCS3 colours); menus take `size` and `vw` and may be `cont`;
  enum controls may carry `fmt`; select options take `text`, `x`, `y`, `lamp`.
- Jacks: `labelSize`, `module` and `banana` appear; `hear` may be `null`; Kobol's unmodelled
  inputs carry `signal: null` beside `dest: null`.
- Areas use module `patch`, which the control module list leaves out.
- `EngineParams`: the 2-XM's second voice (`dual.b`) has no `volume`; `chorus.mode` may be `0`;
  `noise.tilt`, `sh.clock`, `trig.auto`, `vca.gain`, `env*.kf/loop/freeze`, Moog `ctl`, `s960`,
  `s962`, `d911a`, `q995` are all in use; `easel.cosc.note` is the complex oscillator's pitch.
  Many fields the prose lists as required have engine defaults and are optional in the type
  (`osc[].pw`, `kbd`, `syncTo`, `noise.color`).
