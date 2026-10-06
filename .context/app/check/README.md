# The synth check baseline

One JSON file per synth: a fingerprint of every sound in the prototype's library, rendered
through the prototype's own DSP. It is the safety net for the port (D3). While an engine,
library or synth file is transliterated, the ported code must reproduce these numbers.

## What a fingerprint is

Each sound plays its phrase for 3 s at 48 kHz. `Math.random` is reset to the same seed before
every sound, so a sound's numbers depend only on its own settings, not on run order or on
which sounds were selected.

| Field    | What it is                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| `peak`   | largest absolute sample                                                                          |
| `rms`    | loudness over the whole 3 s                                                                      |
| `win`    | loudness of each 0.5 s window, which shows the envelope and the phrase                           |
| `bright` | zero crossings as Hz at 0.05 s and at 1 s, a rough brightness                                    |
| `bands`  | share of energy in nine octave bands (below 63 Hz up to above 8 kHz), in dB, over four frames    |
| `hash`   | FNV-1a over the raw samples. It separates an exact match from one that only agrees when rounded. |

`--compare` fails on any difference in the rounded fields. A different `hash` with equal
fields is reported but does not fail: the samples moved below the fingerprint's precision.

## Commands

Run these from `prototype/`:

```bash
node check.mjs --compare                 # every synth against its baseline, one process per synth
node check.mjs model-d --compare         # one synth
node check.mjs model-d funk --compare    # only sounds whose id contains "funk"
node check.mjs --write-baseline          # re-record every file (only when a sound is meant to change)
```

`--seed=N` changes the seed, and a baseline recorded with another seed refuses to compare.
`--jobs=N` caps the number of processes.

A full run renders 1,086 sounds (at the time of recording). On one core that takes about half
an hour, so the check runs one process per synth, as many at a time as there are cores: 621 s
on eight. It is not part of CI.

## Checking the ported engine

`npm run check:synths` is the same check run through the app's ported engine
(`lib/app/synths/audio/`) and libraries, from the repo root:

```bash
npm run check:synths -- --compare              # every synth
npm run check:synths -- model-d --compare      # one synth
npm run check:synths -- model-d funk --compare # only sounds whose id contains "funk"
```

It reads these files and never writes them (there is no `--write-baseline`), and under
`--compare` a different `hash` is an error, not a note: the port has to be exact. Until the
definitions are ported (m1) it takes them from the prototype's source, bundled when it runs.
It skips the limits (m2) and databank (b1) checks. A full `--compare` run: 1,086 sounds, every
one identical, 260 s on eight processes.

**Re-record only on purpose.** A baseline rewritten to make a port pass loses the only thing
that would have shown that the port changed a sound.
