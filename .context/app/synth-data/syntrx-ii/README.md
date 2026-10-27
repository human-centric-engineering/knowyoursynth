# Erica Synths SYNTRX II

In the app as `syntrx-ii` (`/synths/syntrx-ii`).

## Committed

| File                   | What                | Copied from                                              |
| ---------------------- | ------------------- | -------------------------------------------------------- |
| `syntrx-ii.synth.json` | spec, schema 0.12.0 | `synths-modeller-pack/erica-synths-syntrx-ii_synth.json` |
| `build_syntrx2.py`     | build script        | `synths-modeller-pack/build_syntrx2.py`                  |

## Local only (`raw/`, git-ignored)

On the owner’s machine, copied from `~/Documents/Synth Models and raw data/`. Never pushed: the
repo is public, and the manuals and photos are the makers’ copyright.

| File                            | Size   | Copied from                                          |
| ------------------------------- | ------ | ---------------------------------------------------- |
| `Syntrx II Manual Mar 2023.pdf` | 4.0 MB | `Syntrx II Manual Mar 2023.pdf`                      |
| `erica-synths-syntrx-ii.jpg`    | 370 KB | `Erica Synths Syntrix II/erica-synths-syntrx-ii.jpg` |

The manual is the User Manual of March 2023, 27 pages with a text layer. The panel follows the
straight-on product photo, 1946 × 1946, measured in its own pixels.

The photo shows an earlier panel than the manual: a DELAY section with a HOLD / ADD switch, and
matrix column M labelled "Delay Time". The app follows the manual: an EFFECTS section with a
DELAY / REVERB switch, and column M the S&H Input.

The matrix columns are drawn in the order of the manual’s panel drawing, which is also the
photo’s: Ch1 Output, Scope, Ch2 Output, … Decay, S&H Input. The spec’s `patch_matrix.columns`
has Ch2 Output before Scope and S&H Input before Decay, and its `example_patches` use those
letters (B for Ch2 Output, C for Scope); the app’s sounds use the panel’s.
