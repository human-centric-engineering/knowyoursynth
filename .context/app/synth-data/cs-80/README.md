# Yamaha CS-80 Polyphonic Synthesizer

In the app as `cs-80` (`/synths/cs-80`).

## Committed

| File               | What                | Copied from                            |
| ------------------ | ------------------- | -------------------------------------- |
| `cs-80.synth.json` | spec, schema 0.13.0 | `Yamaha CS-80/yamaha-cs-80_synth.json` |
| `build_cs80.py`    | build script        | `Yamaha CS-80/build_cs80.py`           |

## Local only (`raw/`, git-ignored)

On the owner’s machine, copied from `~/Documents/Synth Models and raw data/`. Never pushed: the
repo is public, and the manuals and photos are the makers’ copyright.

| File                              | Size   | Copied from                                    |
| --------------------------------- | ------ | ---------------------------------------------- |
| `Yamaha CS-80 Owner's Manual.pdf` | 5.4 MB | `Yamaha CS-80/Yamaha CS-80 Owner's Manual.pdf` |
| `Yamaha CS-80.jpg`                | 1.2 MB | `Yamaha CS-80/Yamaha CS-80.jpg`                |

The manual is a 56-page scan whose text layer is rough OCR; its page images read well. The panel
layout follows its straight-on photograph inside the front cover (p. 3) and the colours of the
photo. The 22 presets in `lib/app/synths/defs/cs-80-presets.ts` are its charts on pp. 28–30,
measured from the scan.
