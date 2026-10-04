> **In this repo** this folder is the original single-file artefact, kept as the reference the
> app is built from. Start with [`BRIEF.md`](./BRIEF.md). The commands below run from this
> folder and use the repo root's `node_modules` (run `npm install` at the root first).

# KnowYourSynth

Learning app for sound design on hardware synths (Behringer Model D, Neutron, Pro-1, K-2, 2600, DeepMind 12D, UB-Xa D, 2-XM, Kobol Expander, CAT, WASP Deluxe, Poly D, PRO-800, EMS VCS3, Buchla Music Easel, Roland TB-303, Behringer TD-3, Roland Jupiter-4, Jupiter-6 and Jupiter-8, the Behringer System 15, 35 and 55 modulars, the Behringer Model 15 and the Moog Grandmother). Published as a Claude artifact.

- `CONTRACT.md` – the data contract every synth definition follows (controls, jacks, engine params, presets).
- `src/synths/*.js` – one file per synth: panel layout, engine mapping, first sounds. `src/synths/sounds/*.js` – the rest of each sound library. Add a synth by adding a file and listing it in `src/synths/index.js`.
- `src/bank/` – the databank: artists, songs, instruments and the innovators who built them, joined by id (`src/bank/index.js`). Every synth's "Heard on" list is read from `songs.js`, and `src/ui/Bank.jsx` is the Artists & innovators section (`index.html#bank/artists/kraftwerk`). `check.mjs` fails on any broken reference.
- `src/audio/dsp-core.js` – the sound engine (oscillators with hard sync, ladder + state-variable filters, envelopes, LFO, patch routing, overdrive, delay), plus the opt-in polyphonic wrapper (voice allocation, unison, arpeggiator) used by the DeepMind, and the two-voice `dual` wrapper (two differently set voices, unison/split/duo, stereo, cables between them) used by the 2-XM.
- `src/audio/moog-core.js` – the Moog 900-series modular sound path (separate modules, everything in volts, every connection a cable), used by the System 15, 35 and 55. Their panels are built from shared module builders in `src/synths/moog900/`, and their cables are explained by `src/lib/explain-moog.js`.
- `src/audio/dm-fx.js` – the DeepMind 12D's own effects engine (four slots, 35 algorithms, ten routings, stereo), run after the voices inside the synth. Its parameter catalogue, transcribed from the manual's tables with their parse errors mended, is `src/synths/fx/deepmind-12d.js`.
- `src/audio/fx.js` – the outboard effects rack after the voice (drive, chorus, delay, reverb) as plain Web Audio nodes. The scope reads the voice before it. `src/ui/FxRack.jsx` is its UI.
- `src/lib/midi.js` – Web MIDI input (notes on any channel, velocity, mod wheel CC 1). Whether it works inside the artifact depends on the host frame allowing `midi`; the UI reports it if not.
- `src/lib/explain.js` – plain-English explanation of any patch cable (what the output carries, what the input does with it, what you hear), generated from the jack defs and the live engine parameters.
- `src/lib/soundmap.js` + `src/audio/probe.js` – the sound map: which controls are part of the sound right now and which knobs it is most sensitive to, measured by re-rendering the sound through the DSP with each control moved (Dim unused parts / Show sensitive controls), and for a dark control, which other control(s) would bring it in. `src/lib/cells.js` splits the faceplate into one cell per control for the dimming.
- `src/lib/tour.js` + `src/ui/Tour.jsx` – the Orientation tour: a guided walk round one panel, derived from that synth's
  areas, their `help`, and the `unusual/` notes. Nothing is written per synth, so a new synth gets a tour for free.
- `src/lib/layout.js` – the modular layout: a long keyboard faceplate (the Jupiters) cut into modules and stacked in rows, shown by default with a Modular / Long switch.
- `src/panel/` – SVG faceplate renderer (hardware and outline views), plus the layers over it: Explain sections, the search spotlight and the magnifier (`layers.jsx`). `src/lib/areas.js` – section lookup and the panel search index. `src/ui/` – library, lesson, inspector, keyboard, scope, AI tutor.

Check the sound library (validates every sound and renders it through the DSP):

    node check.mjs [synth] [idFilter]

Build (uses the toolchain installed at the repo root — esbuild, React 19, Tailwind 4):

    node build.mjs <outDir>      # writes one self-contained index.html

Preview locally: serve the out dir and open `index.html#neutron` or `index.html#model-d/outline`.
The AI tutor only works inside Claude (artifact `sample` capability).
