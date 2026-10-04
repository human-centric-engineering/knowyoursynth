# KnowYourSynth — internal contract

Single-page learning app, published as a Claude artifact. React 19 + Tailwind 4, bundled
with esbuild from Sunrise's `node_modules` (see `build.mjs`). Audio is a custom DSP voice
(`src/audio/dsp-core.js`) run in an AudioWorklet (ScriptProcessor fallback).

Each synth is ONE data module: `src/synths/<id>.js`, default-exporting a **SynthDef**.
The renderer (`src/panel/*`) and the engine know nothing synth-specific: everything comes
from the SynthDef. Keep SynthDefs as plain data + one pure `toEngine()` function.

## SynthDef

```js
export default {
  id: 'model-d', name: 'Model D', maker: 'Behringer', year: 2018,
  heritage: 'Based on the 1970 Minimoog Model D',          // one line
  summary: '3 VCOs → mixer → 24 dB ladder filter → VCA …', // one or two sentences
  view: { w: 2000, h: 780 },           // SVG viewBox. Use image pixel space of the panel crop.
  theme: {
    panel: '#17181a',                  // faceplate colour
    panel2: '#0f1011',                 // darker shade for the faceplate gradient
    ink: '#e9e9e6',                    // silkscreen colour (labels, frames, ticks)
    font: 'din' | 'helv',              // 'din' = Barlow Semi Condensed, 'helv' = Archivo Narrow
    cheeks: 'wood' | 'metal' | 'none', // end cheeks drawn outside the faceplate
    cheekW: 40,                        // width of each cheek in view units (inside view.w)
    // Optional faceplate looks (hardware view only; all default off – the Neutron uses every one):
    weight: 600,                       // lettering weight for the 'din' font (default 500)
    tabs: true,                        // section names on a solid label plate (ink plate, panel-colour letters)
    knobRing: true,                    // print an unnumbered tick ring round every knob that has no `scale`
    outPlates: true,                   // output-jack names on a solid plate, so ins and outs read apart
    bezel: true,                       // 'button' controls get a black bezel
    jack: 'black',                     // round black sockets instead of hex nuts
    button: 'black',                   // plain 'button' caps in black instead of light grey (UB-Xa D)
  },
  decor: [ …Decor ],                   // silkscreen + hardware that is not a control
  areas: [ …Area ],                    // named regions for the "Explain sections" view and the search
  controls: [ …Control ],
  jacks: [ …Jack ],
  init: { [controlId]: value },        // the "init patch" – a plain audible saw/square tone
  toEngine(v, ctx) { return EngineParams },   // v = { [controlId]: value }, ctx = { wheel: 0..1 }
  presets: [ …Preset ],
}
```

### Decor (all coordinates in view units; colours default to theme.ink)

```js
{ t: 'frame', x, y, w, h, r: 14, label: 'MIXER', labelAt: 'top'|'bottom'|'none', labelSize: 26, gapW: 140 }
      // rounded silkscreen frame; the label sits ON the frame line in a gap (like the hardware)
{ t: 'text', x, y, text: 'CUTOFF\nFREQUENCY', size: 17, anchor: 'middle'|'start'|'end', weight: 500|700, fill?, spacing? }
{ t: 'line', x1, y1, x2, y2, w: 2 }
{ t: 'path', d: 'M…', w: 2, fill?: 'none' }
{ t: 'rect', x, y, w, h, r, fill?, stroke?, sw? }
{ t: 'wave', x, y, size: 22, shape: 'tri'|'shark'|'saw'|'rsaw'|'sq'|'pulse'|'npulse'|'sine'|'tmod'|'noise'|'adsr'|'ar', stroke?, w? }
      // waveform (or envelope-shape) glyph centred at x,y; `stroke` is a print colour, e.g. white on one of the 2600's orange boxes
{ t: 'screw', x, y, r: 9 }
{ t: 'din', x, y, r: 44 }             // MIDI DIN socket
{ t: 'usb', x, y, w: 60, h: 56 }
{ t: 'led', x, y, r: 6, color: 'red'|'amber'|'blue'|'green'|'white', litWhen?: { id: controlId, eq: value } | 'gate' | 'lfo' | 'power' }
      // `litWhen: { id, morph: n }` is one lamp of a row that a continuous knob fades across (Neutron SHAPE): fully lit with the
      // knob at n, shared with the neighbouring lamp in between, off a whole step away
      // `litWhen: { id, eq, near, not: true }` inverts the test: lit whenever the control is NOT at that value (UB-Xa D OSC 2 DETUNE)
{ t: 'logo', x, y, size: 40, text: 'behringer', style: 'behringer'|'plate'|'outline-d'|'neutron' }
{ t: 'arrow', x, y, dir: 'down'|'up', size: 8 }   // little jack in/out arrow
{ t: 'tab', x, y, text: 'OSC 1', size: 14, line?: true, gap?: false }
      // a section name centred on (x, y), for names that are not a frame's own label. With `theme.tabs` it is a solid plate
      // (`line: true` = outlined plate, ink letters); otherwise plain lettering with a gap knocked out of the line behind it
      // (`gap: false` when there is no line behind it). A frame's `label` on its top/bottom line is drawn the same way.
{ t: 'arc', x, y, r, a0, a1, w: 2, cap?: 'round'|'butt', opacity? }   // printed arc; degrees, 0 = 12 o'clock, clockwise, a0 < a1
```

Any decor item may carry `hw: true`: it is faceplate artwork printed in the hardware view only and left out of the outline
view. `line`, `path` and `arc` take `opacity`; `path` takes `stroke` and `w: 0` (for a filled, unstroked shape). A `rect` or
`path` `fill` may be one of the renderer's print patterns: `url(#kysPatStripes)`, `url(#kysPatDots)`, `url(#kysPatFine)`,
`url(#kysPatMesh)`, `url(#kysPatWaves)`, `url(#kysPatScales)`, `url(#kysPatBay)` (defined in `PanelDefs`, `src/panel/parts.jsx`).

### Area

```js
{ id: 'vcf', label: 'Filter (VCF)', module: 'filter', keywords: 'cutoff resonance brightness',
  rects: [{ x, y, w, h }, …],          // one or more rects in view units; rects of one area may touch but must not overlap
  help: 'Two to four plain sentences: what this part of the synth is for and what its main controls do.' }
```

* Every control and every jack must sit inside exactly one area (its x, y inside one of the rects) – the search uses this
  to say where a control is, and the area card lists what is in it. Areas must not overlap each other.
* `module` colours the area and its card. `keywords` are extra search words that are not in the label or help
  (synonyms, the effect's common name: `echo`, `pwm`, `vibrato`).
* Same writing rules as control `help`: plain English, what it does to the sound, name the controls as printed.
* Areas are also the Orientation tour (`src/lib/tour.js`): it groups them by `module` and walks them in signal-flow
  order – oscillators, mixer, filter, envelopes, amplifier, then the modulation sources and the edges – reading each
  area's `help` and `unusual` aloud. Nothing is written per synth for it, so a new SynthDef gets a tour as soon as its
  areas are in place. Every area must belong to exactly one `module` from the list above or the tour will skip it.

### Unusual notes

A control, jack or area may carry `unusual: '…'`: one to three sentences on how this synth names or does the thing differently
from most synths, tied to something a synth user already knows ("EMPHASIS is Moog’s word for resonance", "A is synced to B,
the reverse of most synths"). The hover card and the inspector show it under the general help as "Unusual on the <name>", and
the panel search reads it, so a familiar word (`legato`, `retrigger`, `lag`) finds the control this synth calls something else.

* Keep them in `src/synths/unusual/<id>.js` as `{ [controlId | jackId | areaId]: text }` and attach them with
  `annotate(unusual, controls, jacks, areas)` from `@/lib/maps.js` (it throws on an id that matches nothing).
* Only write one where there is a real difference in naming, layout or circuit. A standard control gets none.
* State facts about the hardware, not opinions, and do not repeat what `help` already says.

### Control

Common: `{ id, type, x, y, kind, label?, labelPos?: 'top'|'bottom'|'left'|'right'|'none', labelSize?, labelGap?, module, help }`

* `id` is `module.param` (e.g. `filter.cutoff`). `module` is one of
  `osc | mixer | filter | env | amp | mod | lfo | glide | util | fx | out | mode` – it drives colour coding in lessons.
* `help` – one or two plain sentences: what the control does to the sound in general.
* `kind`:
  * `'cont'` → `{ min, max, def }` in PANEL units (what is printed on the hardware, usually 0–10). Optional `unit`, `fmt(v)` → string for the readout (e.g. `'420 ms'`).
  * `'enum'` → `{ options: [{ v, label, a? }], def }` (`a` = pointer angle in degrees for knobs, 0 = 12 o'clock, clockwise positive)
  * `'bool'` → `{ def }`
* `type`:
  * `'knob'` → `{ r, style, scale? }`
    * `style`: `'d-silver'` (black skirt, silver cap – Model D), `'d-chicken'` (black winged selector – Model D range/waveform),
      `'pro1'` (black knurled cap with white line), `'neutron'` (black knurled skirt, silver cap, white pointer on the skirt),
      `'neutron-big'` (the same, large, for the tune knobs), `'obxa'` (black knurled skirt, smooth black cap, white triangle
      pointer on the rim – UB-Xa D), `'kobol'` (black knurled knob, flat black top, white dot pointer – Kobol Expander)
    * `ring: false` leaves one knob out of `theme.knobRing` (e.g. a knob that has its own printed arc as decor).
    * `scale` (cont knobs): `{ nums: [0,2,4,6,8,10], ticks: 11, numR?: 1.75, tickR?: 1.35, size?: 15 }`. `nums` are panel values printed
      round the knob at their true angle; sweep is always −150°…+150°. For labels that are not the value (e.g. `'10 M-SEC'`) use
      `{ labels: [{ at: 0, text: '10' }, …] }` where `at` is a panel value.
      enum knobs print each option's `label` at its angle automatically (set `label: ''` to suppress and use a `wave` decor instead).
  * `'rocker'` → `{ w, h, color: 'red'|'blue'|'white'|'black', orient?: 'h'|'v' }` bool, or enum with 2 options (first option = left/top pressed).
  * `'slide'` → `{ w, h, orient: 'v'|'h' }` bool or enum of 2–3 options. Option order = top→bottom (v) or left→right (h).
      For bool: `true` is the top/left position unless `onAt: 'bottom'`. Position labels are NOT drawn automatically – add `text` decor.
  * `'button'` → `{ w, h }` momentary-look square button. bool toggles, enum cycles. Pair with `led` decor using `litWhen`.
  * `'fader'` → `{ len, orient: 'v'|'h', led?: 'red'|'green'|'blue'|'yellow'|'white'|'amber', ticks?, tickSide?: 'left', tickEnds?: false, pad? }` cont slider. (x, y) is the middle of
      the travel; vertical faders have max at the top, horizontal at the right. `led` colours the lamp in the cap (the 2600 colours each
      slider by the module its signal comes from). `ticks` defaults to 5 (vertical) / 0 (horizontal); `tickEnds: false` leaves out the first and last mark
      (where the panel prints MAX / MIN instead). `pad` (default 12) is how far the slot runs on past each end of the travel –
      every 2600 slider is `len: 186, pad: 22`, measured from the photo. The level marks are printed hard against the slot
      (15–23.5 units from the centre line, on the right unless `tickSide: 'left'`), so printed wiring and section lines must keep
      clear of that strip: run a wire straight up out of the top of a slot, never across one.
  * `'wheel'` → reserved (the mod wheel lives in the app's keyboard strip, not on the panel).

### Jack

```js
{ id: 'j.lfo_tri', x, y, r: 17, label: 'LFO', labelPos: 'top'|'bottom', dir: 'out', signal: 'lfoTri', help }
{ id: 'j.cut_cv',  x, y, r: 17, label: 'CUT CV', dir: 'in', dest: 'cutoff', amt: 5, help }
```
`signal` / `dest` use the engine vocabulary below. A jack the engine cannot model sets `signal: null` / `dest: null`
and says so in `help` (cables can still be drawn; they just do nothing audible).
`amt` = how far a full-scale source moves the destination, in the destination's unit. An `in` jack may set `add: true`
if inserting a cable does NOT break the destination's normalled source (most CV inputs sum; audio inputs & gates break).

### Jack fields used by the patch explainer (`src/lib/explain.js`)

When a cable is started, plugged in or hovered, the app explains it: what the output carries right now, what the input does
with it, and what you will hear. That text is generated from `signal` / `dest` / `amt` / `add`, the live `toEngine()` result
(LFO rate and shape, envelope times, attenuator gains, `normals`) and the engine's routing rules – not written per cable.
A SynthDef only supplies the facts the generic text cannot know:

* `name` – unambiguous jack name when two jacks share a panel `label` (`'LFO (triangle)'`). Defaults to `label`.
* `check: (v) => string | null` – a plain-English reason this jack's cable cannot be heard with the panel as it is, naming the
  control to move (`'MOD DEPTH is at 0 … Turn MOD DEPTH up.'`). Use it for depth knobs, level knobs and on/off switches that gate the jack.
* `hear: (v, x) => string` – replaces the generated "what you will hear" sentence for an input whose effect depends on panel
  routing the engine vocabulary cannot express (Model D `MOD SOURCE`). `x.src` is the source's name, `x.kind` its type.
* SynthDef `signalNames: { env1: 'the filter contour', osc1: 'Oscillator A' }` – what this synth calls an engine signal, in running text.
* SynthDef `destNames: { delayIn: 'the mixer' }` – what this synth calls an engine destination, used when the explainer lists where a
  panel routing (`routes`) sends a signal.
* Jack `labelPos: 'none'` hides the printed label (for jacks whose source is printed in a box below them, as on the 2600).

## Addenda (read these – they override anything above)

* **Reference implementation: `src/synths/model-d.js`.** Follow its structure: small local helpers (`knob()`, `text()`, `jack()`)
  pushing into `controls` / `decor` / `jacks`, `init` generated from each control's `def`, presets at the bottom.
* Imports use the `@/` alias with the `.js` extension: `import { expMap } from '@/lib/maps.js'`. Only import from `@/lib/maps.js`
  (plus the synth's own `sounds/`, `lineage/` and `unusual/` files).
* `toEngine(v, ctx)`: `ctx = { wheel: 0..1, patched: { [jackId]: true } }` – `patched` tells you which jacks have a cable, inputs and
  outputs alike (an output flag is for insert jacks such as the Kobol's VCO 2 OUT, which cuts VCO 2 from the filter when used).
* A `\n` label at `labelPos: 'left'|'right'` is stacked and centred on the control (Neutron `KEY\nTRK`).
* Control `label` may contain `\n`. `labelSize` defaults to 17 (knobs) / 12 (switches). `fmt(v)` is optional and returns the readout string.
* Frame `labelAt` also accepts `'inside-bottom'` and `'inside-top'` (label inside the frame, not on the line).
* `led` decor `litWhen` also accepts `'overload'`.
* Jack `amt` may be a function of the control values: `amt: (v) => (v['filter.modDepth'] / 10) * 5`.
* `normals` values may carry a gain: `{ pw1: ['att2', 0.45], amp: 'env1' }` (plain string = unit gain). `amt` functions and normal gains
  are how a panel depth knob scales whatever is patched into (or normalled to) its jack.
* `vca.envSrc` may be `'none'` – then loudness comes only from `vca.bias` + the `amp` destination (use `normals.amp = 'env1'`
  when the hardware has a VCA CV jack normalled to an envelope).
* Signal `mult` is a copy of whatever reaches `multIn`. Signal `kbd` doubles as a pitch-CV / "assign" source.
* Engine extras: `a440: bool` (reference tone). `pitchAll` only reaches oscillators with `kbd: true`.
* `view.h` should be the faceplate height only (crop the photo's background). Put cheeks inside `view.w`.
* Knob sweep is always −150°…+150°. Panel silkscreen text is drawn by the renderer in the theme font, upper-case as you supply it.
* `line`, `path` and `circle` decor take a `stroke` colour (print colour, e.g. the 2600's orange); the outline view draws it in ink.
* **Opt-in engine features (all off unless set; added for the 2600):**
  * `oscOuts: true` fills separate waveform signals `o1saw o1pulse o1tri o1sine … o3sine`, whatever the oscillator's `mix`.
  * `pwSplit: true` gives oscillator 3 its own pulse-width destination `pw3` (otherwise osc 3 shares `pw2`).
  * `duo: true` – duophonic keyboard: `kbd` is the lowest held key, signal `kbd2` the highest. Osc 2 follows `kbd2` only via a cable
    (unlike `paraphonic`, which moves osc 2 itself).
  * `trig.src: [env1Src, env2Src]`, each `'gate'|'trig'|'sh'`: fires each envelope from dest `gateIn`, from a short pulse on each rise
    of `trigIn` (or each new note), or from `envClk`. `trig.auto: true` fires the envelopes from the LFO square with no key held.
  * `lfo.vibDelay` (s) / `lfo.vibDepth` (0..1) shape signal `vib`: the LFO sine faded in after each note, plus dest `vibIn`.
    Signals `lfoSine`, `lfoSaw` are the LFO's own shapes.
  * `noise.tone` 0..1 (low-frequency → pink → white, replaces `color`) and `noise.gain` (scales the `noise` signal everywhere).
  * `filter.drive` – input gain before the ladder's saturation (default 0.8).
  * `ring: { ac }` – signal `ring` = `ringA` × `ringB` (`ac` blocks DC on A). `preamp: { gain }` – signal `preamp` = tanh(`preampIn` × gain).
    `envf: { sens }` – signal `envf` follows the level of `envfIn`.
  * `rev: { on, mix, decay, damp }` – spring reverb on dest `revIn`; signal `rev` is its output. The final output is dest `dryIn`
    (builtin normal `out`) plus `rev` × mix; signal `master` is that final output.
  * `hpf: { cutoff /*Hz*/, res /*0..1.1*/, envAmt /*octaves*/, envSrc, kbd }` – a resonant 24 dB high-pass stage in series
    **before** the main filter, for the MS-20 pair (added for the K-2). Omit it and there is no stage at all. Its cutoff has its
    own destination `cutoffHp` (octaves) and its output is signal `vcfHp`.
  * Signal `shClk` is the sample-and-hold clock (0/1 square). `inv1` = −(`inv1In` + `inv1A` + `inv1B`), `inv2` = −(`inv2In` + `inv2A`),
    `esw` = `eswA` while `shClk` is high, else `eswB`. Dest `ampExp` is an exponential VCA control input, added to `amp`.

* **Panel modes and polyphony (added for the DeepMind 12D):**
  * Control `show: { id, eq }` (or a list, all of which must hold) draws the control only while another control has that
    value. Several controls may share one position this way: the DeepMind's A D S R faders are twelve controls deep,
    chosen by `env.select` and `env.curves`, and each display page is a set of menu rows. A hidden control keeps its
    value and stays part of the sound, the search and the lessons; it just has no place on the faceplate until shown.
    A lesson step that sets a hidden control should also set the mode that shows it (press VCF, then set the faders).
  * Control `ui: true` marks a panel mode: it changes what the panel shows, never the sound. The sound map skips it and
    never dims it, and the scope's explanation leaves it out. `toEngine()` must ignore it.
  * `type: 'select'` – an enum drawn as a row of backlit buttons, one per option, each at the option's own `x, y` with
    printed `text` above it; `w, h`, `lamp: 'white'|'blue'|'amber'` (or per option). The control's own `x, y` decides its area.
  * `type: 'button'` with `lamp` – a backlit button that lights when it is on (bool) or not at its first option (enum).
  * `type: 'menu'` – one row of a display page: `label` on the left, the value in an inverted box on the right (`w, h,
    size, vw`). Click cycles an enum, drag moves a cont. Pair with an `lcd` decor.
  * Decor `{ t: 'lcd', x, y, w, h, page: controlId, titles: { [pageValue]: 'TITLE' }, notes: { [pageValue]: 'text\nlines' } }`
    – a backlit screen that prints the title of the page the `page` control is on, and a note for pages with no rows.
  * Decor `led` `litWhen: { voice: n }` – lit while voice n of a polyphonic synth is sounding.
  * EngineParams `poly: { voices, stack, mono, detune /*semitones*/ }` turns the engine into a pool of voices, each a full
    copy of the voice below, behind a note allocator (free voices first, then ones still releasing, then the oldest held
    note is stolen). `stack` voices play each note, spread ±`detune`; `mono` sends every key to one stack, so it plays
    legato like a mono synth. Without `poly` the engine is exactly the single voice it always was.
  * `arp: { on, bpm, gate, mode: 'up'|'down'|'updown'|'random'|'played', octaves, hold }` (poly only) – sixteenth notes.
  * `post: { hpf /*Hz*/, boost }` (poly only) – 6 dB high-pass and a +12 dB shelf below ~110 Hz on the sum of the voices.
  * `env3` – a third envelope, signal `env3`, fired with the loudness envelope. Any envelope may carry
    `curve: { a, d, r }` (0..1, 0.5 = straight): it then runs timed stages of exactly a / d / r seconds, each shaped by its curve.
  * `lfo2: { rate, mix, keySync, delay }` – a second LFO, signals `lfo2` and `lfo2Uni`. Both LFOs take `delay` (s: silent
    for 40 %, then a fade-in) and the mix shapes `sh` (sample and hold) and `shg` (sample and glide).
  * `vca.gain` – level after the VCA (default 1). `drift: { depth /*semitones*/, rate /*s*/ }` – slow random pitch per voice.
  * Oscillator mix `notch` – the DeepMind OSC 2 TONE MOD wave: a square whose half cycles each start with a gap of `pw` (0..0.6).

* **Effects engine and deep menus (added for the DeepMind's FX):**
  * EngineParams `fx: { mode: 'insert'|'send'|'bypass', routing: 1..10, slots: [{ alg, level, p: { REF: value } } | { alg: null }] × 4 }`
    (poly only) – the effects processor in `src/audio/dm-fx.js`, after `post` and before the volume. `alg` is an algorithm id
    and `p` its parameters in display units, as listed in `src/synths/fx/deepmind-12d.js` (a SynthDef may import its own
    `fx/` file). Return `{ mode: 'bypass' }` alone when nothing is loaded, so the effects settings count as unused.
  * With `fx` the synth is stereo: `process(out, n, outR)`. Without `outR` it writes the mono sum. The sound-map probe
    renders such a synth in stereo (left then right), so pan and width controls are not reported dead.
  * Control `show` entries may be `{ id, in: [values] }`.
  * Control `name` – the name used everywhere the control is listed (search, cards), instead of `label` made unique.
  * Control `taper: 'log'` – dragging a cont control moves it by ratio (frequencies, times). `step` rounds its values.
  * Control `deep: true` – one of many parameters behind a menu: a section card lists it only while it is on screen.
    `find: false` leaves it out of the panel search (a copy of a control already indexed, e.g. slot 2–4 effect settings).

* **Two different voices (added for the 2-XM):**
  * EngineParams `dual: { b, assign: 'unison'|'split'|'duo', split /*MIDI note*/, level: [a, b], pan: [a, b] /*−1..1*/ }` – the
    top-level params are the first voice and `b` (a full EngineParams voice) the second, each with its own settings, mixed to
    stereo by their own level and equal-power pan. UNISON plays each key on both, and a second held key on the second voice;
    SPLIT gives keys below `split` to the first voice; DUO gives each new key to the voice that has been free longest, else
    takes the older note. The synth is stereo, like one with `fx`, and the sound-map probe renders it in stereo.
  * Jack `part: 0 | 1` – which voice a jack belongs to. `cablesToEngine()` adds `sp` / `dp` to each cable and the engine sends
    it to voice `dp`. A cable between the voices reads the other voice's signal a sample late (the voices then run sample by
    sample). The cable explainer reads each jack against its own voice's params.
  * Filter `mode: 'morph'` with `morph` 0..1 (SVF only) – low-pass fading into high-pass, with a notch halfway (the SEM's NOTCH knob).
  * Signals `env1v` / `env2v` – the envelopes scaled by key velocity. Either may be `vca.envSrc` or `filter.envSrc`.
  * Decor `frame` takes `dash` (an SVG dash pattern, e.g. `'8 5'`) for a dashed frame.

* **Morphing oscillators and per-oscillator VCAs (added for the Kobol Expander):**
  * Oscillator `morph: 0..1` replaces `mix`: one continuous waveform, 0 triangle → 0.5 sawtooth → 2/3 square → 1 a pulse
    narrowed to 20 %. Over the last third the pulse-width destination (`pw1` / `pw2`) fades in, so PWM is only heard at the
    pulse end. Destinations `wave1` / `wave2` (0..1 units of the morph) move it.
  * Destinations `lvl1` / `lvl2` add to oscillator 1 / 2's `level` (clamped at 0): a VCA per oscillator with a CV input.

* **Duophonic oscillators and sub octaves (added for the CAT):**
  * Oscillator `mix.sub` – a square an octave below the oscillator, from a flip-flop that changes state each time the
    oscillator's cycle restarts (so it follows sync resets too).
  * EngineParams `note2Osc` (default 1) – which oscillator follows the second note when `paraphonic` is on. With `duo: true`
    the second note is the highest key held, so `note2Osc: 0` puts oscillator 1 on the high key and oscillator 2 on the low.
  * Oscillator `syncGate: true` – as well as the hard sync (`syncTo`), the oscillator is silent for the second half of each
    master cycle (the CAT's SYNC MODE A).
  * `sh.clock: 'lfo'` – the sample and hold is clocked by each rising edge of the LFO square instead of its own `sh.rate`
    (a cable into `shClock` still wins).
  * Fader `cap: 'white'|'red'|'grey'` – a round coloured cap instead of the lamp cap. Knob style `'cat'` – a black cap in a
    white serrated skirt with a white tab pointer.

* **Repeating envelopes, HOLD and faceplate bits (added for the WASP Deluxe):**
  * Envelope `loop: true` – while the gate is held the envelope rises over `a`, falls to silence over `d`, and starts
    again (the Wasp's REPEAT). `s` is ignored while it loops. Letting go releases over `r` as usual.
  * Envelope `freeze: true` – the level stops where it is (the Wasp's HOLD). Gate changes are still noted, so a key let go
    while frozen releases once the envelope is thawed.
  * Theme `knobRing: 'dots'` prints a ring of dots instead of a line with ticks. Knob style `'wasp'` – a yellow cap on a
    black ribbed skirt with a black line pointer.
  * Control `type: 'toggle'` – a small bat-handle toggle seen from above, `{ w }` (the diameter), bool; the bat leans up for
    `true` unless `onAt: 'bottom'`. `orient: 'h'` throws it left – centre – right instead (first option left), and `lean`
    sets how far the bat reaches from the nut, in radii (default 0.42) (added for the Grandmother).

* **Four oscillators, a note per oscillator, and a chorus (added for the Poly D):**
  * `osc` may have four entries. The fourth has signal `osc4` and destination `pitch4`, and shares `pw2`; `oscOuts` covers
    only the first three.
  * EngineParams `oscAssign: { mode: 'poly' | 'unison', damp }` – each oscillator following the keyboard plays a note of its
    own through the one filter and pair of envelopes (paraphonic). 'poly': each new key takes the next free oscillator in
    rotation after the one that took the last key (Korg Mono/Poly), so single notes step round them; when all are busy the
    oldest note is taken over; a let-go note rings until the next new key, or with `damp` stops at once while other keys
    are held (the last key always releases through the envelope). 'unison': the newest four held keys are dealt round the
    oscillators. Oscillators with `kbd: false` are left out. Filter tracking follows the note on the first oscillator.
    Omit it for the usual behaviour (every oscillator on the newest key).
  * Meter events carry `oscs`, a bit mask of the oscillators sounding a note; decor `led` `litWhen: { osc: n }` shows it.
  * EngineParams `chorus: { on, mode: 1 | 2 | 3 }` (poly wrapper only) – a Juno-60-style stereo bucket-brigade chorus after
    `fx`: 1 slow, 2 deeper, 3 (both buttons) fast and shallow. The synth is then stereo, and the probe renders it so.
    A one-voice synth that needs the arpeggiator or the chorus uses `poly: { voices: 1, stack: 1, mono: true }`.
  * Rocker `color` may also be `'orange' | 'teal' | 'green'`; a rocker with three options draws as one three-segment
    paddle (`orient: 'v'` stands it up). Button `lamp: 'red'`, and `lit: 'always'` for an enum button that steps through
    a list and is lit whatever it is on.

* **Modular layout (added for the Jupiters, whose long keyboard faceplates are hard to use on a small screen):**
  * SynthDef `modular: { brand, rows: [[{ cut: [x0, y0, x1, y1] }, …], …] }` – the same panel cut into modules and stacked in
    rows like a modular case. Each `cut` is a rect on the long panel (view units), normally one printed section; put the cuts
    on section edges so no control's own printing is cut off. Rows are laid out left to right; a row a little short of the
    widest is spread out, a row well short gets a blank panel printed with `brand`. With `modular` set the app shows this
    layout by default and adds a Modular / Long switch (`#id/long` opens the long panel).
  * `modularDef(def)` (`src/lib/layout.js`) builds it: every control, select option, jack and decor item moves with the cut
    its (x, y) falls in (half-open: x0 ≤ x < x1); `line`, `rect` and `frame` decor and area rects that cross a cut are
    clipped, one piece per module; a `path` moves by its first point (decor `path` takes `shift: [dx, dy]`). Decor in no
    cut is left out (vent grilles, the long header), and a control or jack in no cut is an error. Nothing about the sound
    changes: the engine, the sound map and the presets use the SynthDef as written.
  * `check.mjs` checks the modular layout: every control and jack still in its own area, and no two areas overlapping.

## EngineParams (what `toEngine` returns)

```js
{
  osc: [ { level, mix: { tri, shark, saw, rsaw, pulse, sine, tmod }, pw, semi, kbd, fixedNote?, syncTo } … up to 3 ],
      // level 0..1 into the filter. mix = gain per waveform (omit or 0 = silent). pw 0.03..0.97.
      // semi = offset in semitones from the played note (octave + detune, fractional ok).
      // kbd false → pitch = fixedNote (default 60) + semi, ignores keyboard. syncTo = index of master osc or -1.
  noise: { level, color: 'white'|'pink' },
  ext: { level },                                  // gain on the `extIn` audio destination (into the mixer)
  filter: { type: 'ladder'|'svf', mode: 'lp'|'hp'|'bp', mode2?: 'lp'|'hp'|'bp', cutoff /*Hz*/, res /*0..1.1, ≥1 self-oscillates*/,
            envAmt /*octaves, may be negative*/, envSrc: 'env1'|'env2', kbd /*0..1 tracking*/ },
  env1: { a, d, s, r, dly?, hold? }, env2: { … },  // a,d,r seconds; s 0..1
      // dly = seconds to wait after the gate before the attack starts; hold = seconds held at the peak before the decay.
      // Both default to 0 (no extra stage). Added for the K-2's EG1 DELAY TIME and EG2 HOLD TIME.
  vca: { envSrc: 'env1'|'env2', bias /*0..1 constant open*/ },
  lfo: { rate /*Hz*/, mix: { tri, saw, rsaw, sq, sine }, keySync },
  glide: { time /*s*/, legato /*bool: glide only on overlapping notes*/ },
  trig: { retrig, drone, repeat },                 // repeat = envelopes gated by the LFO square
  paraphonic: false,                               // true: osc index 1 follows the 2nd held note
  routes: [ { src, dst, amt } ],                   // PANEL modulation routings (summing, never break normals)
  normals: { [dest]: signal },                     // what feeds a dest when no cable is in its jack
  od: { on, drive, tone, level }, delay: { on, time /*s*/, fb, mix },
  sh: { rate /*Hz*/, glide /*s*/ }, slew: { time /*s*/ }, att: [g1, g2],
  tune /*semitones*/, volume /*0..1*/,
}
```
Cables are NOT handled in `toEngine` – the app converts cables → routes from the Jack defs.

**Signals** (`src`): bipolar −1..1: `osc1 osc2 osc3 oscMix noise vcfHp vcf1 vcf2 od vca out lfo lfoTri lfoSq sh slew att1 att2 sum1 sum2 invert mult`;
unipolar 0..1: `env1 env2 lfoUni gate wheel vel one`; `kbd` = (note−60)/12 octaves.

**Destinations** (`dst`) and units: `pitchAll pitch1 pitch2 pitch3` semitones · `pw1 pw2` ±duty · `cutoff` `cutoffHp` octaves · `res` 0..1 ·
`amp` linear gain · `lfoRate` octaves · `delayTime` octaves · `lfoTrig gate1 gate2 shClock` gate (>0.5) ·
audio/utility inputs at unit gain: `extIn vcfIn odIn vcaIn delayIn shIn slewIn att1In att1CV att2In sum1A sum1B sum2A sum2B invertIn multIn`.
Audio normals the engine always has unless overridden in `normals`: vcfIn←mixer, odIn←vcf1, vcaIn←od, delayIn←vca, gate1/gate2←gate, shIn←noise.

## Sound map (nothing to write per synth)

The two panel toggles **Dim unused parts** and **Show sensitive controls** are worked out from the SynthDef alone, so a new synth
gets them for free and a SynthDef must not carry any data for them.

* `src/lib/soundmap.js` moves each control in turn (a knob ±5 % of its travel, then to its ends; a switch to its other
  positions), pulls each cable out, and turns every variant into EngineParams with the usual `toEngine()` + `cablesToEngine()`.
  A variant whose EngineParams equal the baseline needs no rendering: that control does nothing.
* `src/audio/probe.js` renders a fixed gesture (two notes of the sound's riff, the second played legato, then the release;
  0.84 s at 24 kHz, `Math.random` seeded) through the real voice and compares it with the baseline. Sample-identical output
  = the control is **dead**. Otherwise the distance (mean dB change over third-octave bands, weighted by loudness) is the
  knob's sensitivity. It runs in a small pool of Workers (`src/audio/probe-worker-entry.js`, embedded by `build.mjs` as
  `__PROBE_SRC__`), or on the main thread if the host blocks Workers.
* States: `on` · `zero` (it can be heard if moved, but every engine parameter it changes is 0 / false / absent as it stands:
  a level at 0, a depth at 0, a switch that is off) · `dead`. Jacks follow their cable. The mod wheel counts as it is set.
* **Why is it dark?** Pointing at a dead control asks `mapper.explain(id)` for the way in (`doorSearch` in `soundmap.js`):
  a *door* is any move of another control that switches on an engine parameter that was 0 / false / absent (a level up
  from zero, a switch on, a mix knob turned the other way, a wave that was not in use, the mod wheel up). Round 1 opens
  each door alone, nearest first, and re-tests the dead control with one big move (a half-length gesture, yes/no only).
  Round 2 tries pairs: a door plus a door that only exists behind it (mixer switch AND its volume; wheel AND the
  modulation switch), then pairs of nearby doors. Budgets: 18 single and 14 pair renderings per control; it stops soon
  after the first answer and keeps at most two. The answer goes to `mapStore.why[id]`; the cards word it
  ("It comes in if you turn X up and switch Y on") and the panel rings the doors. No answer = it needs a cable or more
  than two changes, and the card says so.
* What this asks of `toEngine()`: keep it **pure** and keep "nothing" as a real `0` / `false` (a level knob at 0 must give
  `level: 0`, not `0.0001`), or the `zero` state cannot be told from `on`.
* `src/lib/cells.js` gives every control its patch of the faceplate (a power diagram inside each area, grown a little into the
  gutters so a section name on the frame line goes with its section). Empty jacks in an area that has controls go with the
  nearest control; a patched jack, and every jack of a jacks-only area, has its own cell. Areas are what keep a label with
  the right control, so an area should hold the controls together with their own silkscreen.

## Lineage

`src/synths/lineage/<id>.js`, attached to the SynthDef as `lineage`. Shown as its own section under the lesson.

```js
{
  title: 'From the Moog modular to the Model D', intro: 'Two or three sentences.',
  timeline: [ { year: '1970', name: 'Minimoog Model D', tag?: 'The original' | 'This synth' | …, text: 'What it introduced and how that shows on this panel.' } ],
  relatives: [ { name, years, text } ],                       // closely related instruments (and honest rivals, labelled as such)
  // heard: filled in by src/synths/index.js from the databank (heardFor) – add records to src/bank/songs.js, not here
  users?: [ 'Dave Greenfield (The Stranglers)', … ],            // players known to have owned or used one, with no single record to list
  note?: 'Any caveat about the list.',
}
```
The "Heard on" tab lists every work in `src/bank/songs.js` with a part played on an instrument this synth models
(`instruments.js` → `app`), plus any part that names the synth in `synths`. Only list a record where the instrument is well
documented, and name the real instrument in `on` (the "Lucky Man" solo was a Moog modular, not a Minimoog). A part's
`sounds[synthId]` links it to a library sound in that style; `check.mjs` fails if the id does not exist.

## Preset

```js
{
  id: 'taurus-bass', name: 'Pedal Bass', ref: 'In the style of Rush — "Tom Sawyer"', artist: 'Rush',
  tags: ['bass', 'prog', '70s'],            // first tag = category: bass | lead | pad | pluck | keys | fx | drone | perc | seq | brass | strings | wind
  level: 1,                                 // 1 beginner · 2 intermediate · 3 advanced
  blurb: 'One sentence describing the sound.',
  how: 'Two to four sentences: the idea behind the sound – which module does what and why it sounds the way it does.',
  phrase: { bpm: 96, loop: true, steps: [[beat, midiNote, lengthBeats], …] },   // short riff that shows the sound off (not a copy of the song)
  steps: [                                   // ordered build, applied cumulatively on top of `init`
    { title: 'Two saws, an octave apart', module: 'osc', why: 'Plain-English reason. What to listen for.',
      set: { 'osc1.range': '16', … }, cables: [['j.out_id', 'j.in_id']] },
  ],
  context: { 'filter.cutoff': 'In this sound: …what this control is doing here and what happens if you move it.' },
  tweaks: [ { id: 'filter.cutoff', try: 'Sweep between 3 and 7 while the riff plays', hear: 'Brighter and buzzier as it opens.' } ],
}
```
The library is split in two files per synth: the original sounds at the bottom of `src/synths/<id>.js` and the rest in
`src/synths/sounds/<id>.js` (same shape, spread into `presets`). Run `node check.mjs [synth] [idFilter]` after adding one: it validates
every id, value and cable, checks each cable can be explained, and renders the riff through the real DSP (peak, rms, brightness).

Copy rules: plain English, concrete actions, British spelling, no hype, no metaphors-for-their-own-sake. Say "in the style of",
never claim to be the exact patch. Every control touched by `steps` should have a `context` line if it matters to the sound.

* **Buttons with printed caps (added for the PRO-800):**
  * Button `face: 'ring'` – a square cap with a white printed rim, its name printed on the cap (`caption`, `\n` for a second
    line, `captionSize`, default 11) and a small lamp in the top-left corner that lights when the button is on (bool) or not
    at its first option (enum). `faceColor: 'red'` gives a red cap. Printed-only buttons of the same look are plain `rect`,
    `led` and `text` decor.

* **Pin matrix, joystick and a studio with nothing wired (added for the EMS VCS3):**
  * SynthDef `matrix: { x, y, pitch, rows: [outJackId…], cols: [inJackId…], legend: { row: [w, h], col: [w, h] } }` – a pin
    board. (x, y) is the hole of the first row and column. Rows are output jacks and columns input jacks, placed at their
    printed legends (decor draws the legend text; `legend` sizes the hit boxes centred on each jack). A pin IS a cable from
    a row jack to a column jack, so presets list pins under `cables` and the explainer, sound map and lessons need nothing
    new. Matrix jacks are not drawn as sockets, and pins are drawn in the holes instead of as cables. Clicking a hole adds
    or removes the pin; pointing at one shows its card (focus `pin: true`).
  * Output jack `gain` (number or `(v) => number`) scales what the jack sends wherever it is patched. `cablesToEngine()` and
    the explainer multiply it in. The VCS3's numbered LEVEL knobs are row gains.
  * Jack `hear` may return null to fall back to the generated text for that source. Jack `does` (string or `(v) => string`)
    replaces the generic first sentence about depth.
  * SynthDef `silentInit: 'reason'` – the synth is silent with no cables, by design. `check.mjs` then accepts a silent init.
  * Control `type: 'joystick'` – a two-axis stick drawn at (x, y) with radius `r`. It is two cont −1..1 controls: the drawn one
    (left-right) names the other in `pair`, and the other (up-down) carries `pairOf` and is not drawn. Put the second a
    pixel off the first so the cells stay distinct.
  * Knob styles `'vcs3'` (black fluted knob, coloured cap from `cap`) and `'vcs3-dial'` (chrome slow-motion dial with a
    rotating 0–10 ring read against a fixed mark). Decor `text` takes `rotate` (degrees). Decor `led` `litWhen: 'env1'`
    glows with Envelope 1 over a dim floor.
  * EngineParams (all opt-in): oscillator `skew` 0..1 (the triangle output leans into a ramp) and `sineShape` −1..1 (the
    sine output folds towards a rectified sine); `noise.tilt` −1..1 (dark … white … light); `ring.acB` (AC-couple input B
    too); `rev.unit: true` (signal `rev` is the dry/wet blend itself, set by `rev.mix` plus dest `revMix`, and is not added
    to the output); `trap: { a, on, d, off, auto, hold }` replaces Envelope 1 with a trapezoid generator (linear rise, hold,
    fall scaled by 2^`decayCv`, rest; repeats while `auto`, otherwise waits for a key or `hold`), and signal `trap` = 1 − 2 × env1;
    `joy: [x, y]` gives signals `joyX`, `joyY`; `outAmps: [{ level, tone, pan }, {…}]` – two output amplifiers fed by dests
    `out1In` / `out2In`, level = `level` + dests `out1Lvl` / `out2Lvl`, tone −1..1, pan 0..1. With `outAmps` the voice is
    stereo and is the whole output (the probe renders it in stereo). New dests: `out1In out2In out1Lvl out2Lvl decayCv revMix`.

* **West Coast voice: the Buchla Music Easel (EngineParams `easel`, opt-in):**
  * With `easel` set, the voice runs its own sound path in place of the oscillators, mixer, filter, overdrive, VCA and delay
    (`easelStep()` in `dsp-core.js`); the LFO, preamp, envelope follower and reverb still run. `osc: []` and the usual stubs
    (`filter`, `vca`, `lfo`, `glide`, `trig` with `retrig: true`, …) are still required. Control voltages are 0..1 for the
    Easel's 0..10.
  * `easel: { cosc, mosc, pulser, env, seq, rvs, gates, mix, porta, add, preset, arp }`:
    `cosc { note, kbd, sign, shape 0..1 (sine → wave), wave: 'spike'|'sq'|'tri', timbre 0..1 (folds sine and triangle) }` ·
    `mosc { hz, kbd, wave: 'saw'|'sq'|'tri', mode: 'fm'|'am'|'bal', index 0..1, fmIn }` ·
    `pulser { v (period slider 0..10), trig: 'kbd'|'self'|'seq', mode: 'sus'|'trans'|'off', fire (a change fires it once) }` ·
    `env { a, s, d (time sliders 0..10, .002 s at 10 to 10 s at 0), trig: 'kbd'|'pulser'|'seq', mode: 'sus'|'trans'|'self' }` ·
    `seq { levels[5] 0..1, stages, pulses[5], trig: 'kbd'|'pulser'|'off' }` · `rvs { trig: 'kbd'|'pulser'|'seq' }` ·
    `gates: [{ mode: 'lp'|'combo'|'vca', level 0..1 } × 2]` (vactrol lowpass gates; each turns its signal upside down) ·
    `mix: [a, b]` · `porta` (s, linear glide across the 28-key span) · `add` (semitones added to the key voltage) ·
    `preset` 0..1 · `arp { on, mode: 'up'|'random', rate /*Hz*/ }` (steps through the held keys; each step is a new touch).
  * Signals: `keyv` ((key − 48 + add) / 28), `kpulse` (the key gate, dropping out for 2 ms at each touch), `press`, `pressV`,
    `preset`, `pulser`, `seq`, `rnd1`…`rnd4`, `inv10` (1 − `inv10In`), `lpg1`, `lpg2`, `ezMix`, `ezBal`; `osc1` / `osc2`
    are the complex / modulation oscillators, `o1sine` the plain sine, `env1` the envelope.
  * Dests: `ezPulse ezPress ezPitch` (the 208's keyboard inputs; normal them to `kpulse press keyv`), `lpg1In lpg2In`
    (normal them to `osc1` and the gate 2 source), `gate1Lvl gate2Lvl index fold` (0..1 units), `period envA envS envD`
    (tenths of a slider: 1 = the whole scale towards fast), `portaIn`, `fmIn` (audio FM of the modulation oscillator),
    `inv10In`; `pitch1` / `pitch2` in semitones. Normal `dryIn` and `revIn` to `ezMix`.
  * Meter events carry `seq` (the stage) and `pulser` (the ramp); decor `led` takes `litWhen: { seq: n }` and `'pulser'`.
  * Renderer: Jack `banana: 'black'|'orange'|'yellow'|'blue'|'white'|'violet'|'green'|'red'` (or a colour) draws a banana
    socket. Fader `cap` also takes `'blue'|'green'|'yellow'|'black'`. `toggle` takes an enum of three options (up, centre,
    down) and `tip` (a colour for the bat). Decor `path` takes `dash`.

* **Sequencer synths: accent, slide and tempo (added for the TB-303 and TD-3):**
  * Phrase steps may carry a velocity as a fourth item: `[beat, midiNote, lengthBeats, velocity]` (default 0.85). Build
    303-style riffs with `acidPhrase(bpm, pattern, gate?)` from `@/lib/maps.js` (one token per sixteenth: `C2`, `.` rest,
    `-` tie, suffix `a` accent = velocity 1, `s` slide = the note is held over the next one's start).
  * SynthDef `tempo: controlId` – that control's value is the riff's BPM. `presetState()` sets it from each sound's
    `phrase.bpm`, the riff plays at it, and moving it while the riff plays sends the engine a `tempo` message (mono voice).
  * EngineParams `acid: { thresh, force, decay, rise, fall, cut, amp }` (opt-in, mono voice) – TB-303 accent. A note whose
    velocity is ≥ `thresh` (or any note while `force`) is accented: Envelope 1 decays over `decay` s instead of its own
    time, an accent sweep charges from Envelope 1 (rising over `rise`, falling over `fall` s, so runs of accents climb)
    and lifts the cutoff by `cut` octaves at full charge, and Envelope 1 × `amp` is added to the VCA. Slide is the usual
    `glide` with `legato: true` and `trig.retrig: false`: overlapping notes glide and do not restart the envelopes.
  * Button `cap: 'black'` – a black cap on one button whatever `theme.button` says (the 303's black keys).

* **Roland Jupiters: key follow, a gentle high-pass, envelope-scaled routes (added for the Jupiter-4, -6 and -8):**
  * Envelope `kf` 0..1.2 – key follow: the attack, decay and release times shorten on higher notes and lengthen on
    lower ones, halving every two octaves above middle C at `kf: 1`. The note is taken each time a key starts the envelope.
  * `hpf.poles: 1` – the high-pass stage is a plain 6 dB one-pole filter with no resonance (`res` is ignored), for the
    Jupiter-8's and Jupiter-4's non-resonant HPF. Without it the stage is the resonant 24 dB pair as before.
  * Route `by: signal` – the route's depth is multiplied by a second signal, e.g. `{ src: 'osc2', dst: 'pitch1', amt: 24,
    by: 'env1' }` is cross modulation that Envelope 1 opens and closes (Jupiter-6 CROSS MOD ENV-1).
  * `arp.mode: 'downup'` – down then up, the turn notes not repeated (Jupiter-6 D&U).
  * Button `capColor: '#rrggbb'` – a plain `button` with a flat cap of that colour (the Jupiters' orange, yellow, white,
    green, teal and blue caps). Pair it with `led` decor (`litWhen`) for the lamp above it.
  * `select` options may carry `capColor` (or the select itself): coloured square caps with a lamp in the top edge, lit
    when chosen. An option with `hide: true` has no button (give it the first option's x, y); `offValue` on the select
    makes pressing the lit button again set that value (the Jupiter-8 arpeggio MODE buttons switch it off).
  * A `capColor` button with `capLamp: true` draws its own lamp in the cap, lit when on (decor lamps sit under controls).

* **Moog 900-series modulars (EngineParams `moog`, added for the Behringer System 15, 35 and 55):**
  * With `moog` set, the voice runs `moog.step()` from `src/audio/moog-core.js` in place of the oscillators, mixer, filter,
    overdrive, VCA and delay (the same `break core` hook as the Easel). The output stage and reverb still run. The usual stubs
    (`osc: []`, `filter`, `vca`, `lfo`, `glide`, `trig`, `env1`, `env2`) are still required. Nothing is wired inside: every
    connection is a cable, so the SynthDef sets `silentInit`.
  * **Every signal is in volts.** Pitch and cutoff inputs are 1 V per octave, the 911 envelopes rise to +6 V, audio swings
    about ±5 V, and a 902 is fully open at +6 V. Jack `amt` is 1, except the app's OUTPUT jacks (dest `dryIn`, `amt: 0.2`).
  * **Triggers.** A V-trigger is +5 V while on. An S-trigger idles at +5 V and is pulled to 0 V while on; an unplugged
    S-trigger input is idle. A V-trigger patched into an S-trigger input (or the reverse) therefore runs upside down, as
    on the hardware.
  * Modules come in numbered slots (`MOOG_SLOTS`: 7 oscillators, 2 drivers, 5 VCAs, 4 envelopes, 3 mixers, 10
    multiples), and the signal and destination names are generated per slot (`v1saw`, `v1lf`, `a2cv`, `e3st`, `mu4In` …;
    the full lists are `MOOG_SIGNALS` / `MOOG_DESTS`). A module whose outputs no cable reads is not run.
  * `moog: { vco: [{ kind: 'b'|'921', semi, sync: 'off'|'weak'|'strong', width?, clamp?, aux?, auxLevel? }], drv: [{ v, w }],
    lp904: { lo, v, regen }, hp904: { lo, v }, fb914: { g[14] }, f923: { lp, hp }, vca: [{ v, exp }], env: [{ t1, t2, t3, sus }],
    mix: [{ g[4], m }], att[4], i961: { sens, onL, onR }, cm1a: { trig: 'v'|'s'|'both' } }`. `semi` is the oscillator's
    offset from middle C (0 V on its pitch inputs plays middle C at 8').
  * The panels are built from shared module builders in `src/synths/moog900/` (`modules.js`: one function per module type
    that places its controls, jacks, silkscreen and area and writes its part of `moog`; `cables.js`, `unusual.js`,
    `lineage.js`). A System SynthDef is a list of builder calls in rack order. These synths may import from that folder.
  * The cable explainer for these synths is `src/lib/explain-moog.js` (in volts), chosen by `explainCable()` whenever
    `toEngine()` returns `moog`.

* **Sub-oscillator output, pink noise and a separate high-pass (added for the Model 15):**
  * Oscillator `subLevel` – the oscillator's sub-octave square (the same flip-flop as `mix.sub`) goes straight into the
    mixer at this level, not into the oscillator's own output, so it has a mixer channel of its own.
  * EngineParams `subOut: true` fills signal `sub` with Oscillator 2's sub-octave square whatever the mixer does with it.
  * Signal `pink` – the noise generator's pink noise (scaled by `noise.gain`), alongside `noise`.
  * EngineParams `hp6: { cutoff /*Hz*/ }` – a 6 dB one-pole high-pass utility with nothing wired in: dest `hp6In` →
    signal `hp6`. Unlike `hpf` it is not in series with the main filter; it is in the sound only when patched.
  * Decor `arc` takes `stroke` (a print colour; the outline view draws it in ink), for coloured printed rings.

## Databank (`src/bank/`)

The artists, records, instruments and the people who built them, stored once and joined by id. Every synth's
"Heard on" list and the Artists & innovators section (`src/ui/Bank.jsx`) are read from it; nothing about a record is
written in a synth's lineage file any more.

* `instruments.js` – real instruments (the synths named on records, and the originals the panels copy):
  `{ id, name, maker, year, kind, people?: [makerId], app?: [synthId], text }`. `app` lists the app synths that
  model the instrument, so a record made on it shows in their "Heard on" list automatically. `kind` is one of
  `mono | poly | paraphonic | modular | semi-modular | module | sequencer`.
* `songs.js` – one record per work (`kind: song | album | score | body | performance`; `body` = a body of work with no
  single record to name):
  ```js
  { id, title, kind, year, album?, artists: [artistId], credit?: 'printed credit when the names alone lose something',
    parts: [ { instruments: [instrumentId], on: 'Roland Jupiter-8 (the lead), with …', player?: artistId,
               synths?: [synthId],              // extra app synths to list it under (relatives the instrument map misses)
               sounds?: { [synthId]: presetId }, // a library sound in this style, per synth
               text: 'What the synth plays on the record.',
               notes?: { [synthId]: 'text shown in that synth’s list instead of `text`' } } ] }
  ```
  `title` keeps its quotes for a song (`'"Axel F"'`) and none for an album or score.
* `artists.js` – players, bands, producers, composers and sound designers:
  `{ id, name, kind: 'person' | 'group', members?: [artistId], memberOf?: [artistId], country, active, eras: ['1980s'],
     genres: [], roles: [], summary, story, innovations: [], instruments?: [instrumentId] }`.
  `instruments` are synths they are known to have used beyond the records listed in `songs.js` (those are joined in).
* `makers.js` – the innovators: designers, engineers and founders.
  `{ id, name, born?, died?, country, companies: [], summary, story, innovations: [] }`. What they made is read from
  `instruments.js` (`people`), not repeated here.
* `index.js` – the joins (`heardFor(synthId)`, `songsBy(artistId)`, `instrumentsOf(artistId)`, …) and `checkBank()`,
  which `check.mjs` runs: every id must resolve, ids are unique across artists and makers, and every `sounds` preset
  must exist in that synth's library.

Same rules as Lineage: list a record only where the instrument is well documented, name the real instrument in `on`,
and write plain English with British spelling. `story` is three to five sentences of fact – how they came to the
synth, what they did with it – with no praise words. `innovations` are one sentence each, on something they did first
or differently with synthesizers, and only where that is a matter of record.
