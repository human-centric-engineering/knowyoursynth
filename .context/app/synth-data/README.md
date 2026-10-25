# Synth data

The owner’s research for each synth, one folder per synth: the spec (`<id>.synth.json`, in the
synth-blueprint schema) and the script that built it, which are committed, and the manuals, photos and
older spec versions it was built from, which are local only.

- **Committed:** each folder’s spec, build script(s) and `README.md`; here, the newest
  `synth-blueprint.schema.json` (0.13.0; specs at earlier versions remain valid), `synth-effects.schema.json`
  and `validate_synth.py`.
- **Local only:** each folder’s `raw/`, ignored by `.gitignore` and `.prettierignore`. The repo is public, and
  the manuals and photos are the makers’ copyright, so they are never pushed. A fresh clone has the specs
  but not `raw/`; the originals are in `~/Documents/Synth Models and raw data/`.
- A synth in the app has a folder named by its app id; one not in the app yet, by its spec’s device id.

Check every spec:

```bash
cd .context/app/synth-data
python3 validate_synth.py --schema synth-blueprint.schema.json */*.synth.json
```

Without `jsonschema` installed it runs the referential checks only.

## In the app (27)

| Folder                                     | Synth                                                                                                                                                            | Spec schema |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [`2-xm`](./2-xm/README.md)                 | Behringer 2-XM                                                                                                                                                   | 0.7.0       |
| [`b2600`](./b2600/README.md)               | Behringer 2600                                                                                                                                                   | 0.5.0       |
| [`buchla-easel`](./buchla-easel/README.md) | Buchla and Associates (Berkeley, California) Music Easel: Model 208 Stored Program Sound Source and Model 218 Touch Activated Voltage Source (original, 1973-74) | 0.10.0      |
| [`cat`](./cat/README.md)                   | Behringer CAT                                                                                                                                                    | 0.7.0       |
| [`deepmind-12d`](./deepmind-12d/README.md) | Behringer DeepMind 12D                                                                                                                                           | 0.7.0       |
| [`donner-b1`](./donner-b1/README.md)       | Donner Essential B1 Analog Bass Sequencer                                                                                                                        | 0.11.0      |
| [`ems-vcs3`](./ems-vcs3/README.md)         | EMS (Electronic Music Studios, London) VCS3 Mk 1 (Voltage Controlled Studio Mk 3)                                                                                | 0.9.0       |
| [`grandmother`](./grandmother/README.md)   | Moog Music Grandmother                                                                                                                                           | 0.10.0      |
| [`jupiter-4`](./jupiter-4/README.md)       | Roland Jupiter-4 Compuphonic (JP-4)                                                                                                                              | 0.10.0      |
| [`jupiter-6`](./jupiter-6/README.md)       | Roland Jupiter-6 (JP-6) Programmable Polyphonic Synthesizer                                                                                                      | 0.10.0      |
| [`jupiter-8`](./jupiter-8/README.md)       | Roland Jupiter-8 (JP-8) 8 Voice Polyphonic Synthesizer                                                                                                           | 0.10.0      |
| [`k2`](./k2/README.md)                     | Behringer K-2                                                                                                                                                    | 0.5.0       |
| [`kobol`](./kobol/README.md)               | Behringer Kobol Expander                                                                                                                                         | 0.7.0       |
| [`model-15`](./model-15/README.md)         | Behringer MODEL 15 Analog Semi-Modular Synthesizer                                                                                                               | 0.10.0      |
| [`model-d`](./model-d/README.md)           | Behringer MODEL D                                                                                                                                                | 0.1.0       |
| [`neutron`](./neutron/README.md)           | Behringer NEUTRON                                                                                                                                                | 0.2.0       |
| [`poly-d`](./poly-d/README.md)             | Behringer Poly D                                                                                                                                                 | 0.7.0       |
| [`pro-1`](./pro-1/README.md)               | Behringer PRO-1                                                                                                                                                  | 0.5.0       |
| [`pro-800`](./pro-800/README.md)           | Behringer PRO-800                                                                                                                                                | 0.7.0       |
| [`system-15`](./system-15/README.md)       | Behringer System 15                                                                                                                                              | 0.10.0      |
| [`system-35`](./system-35/README.md)       | Behringer System 35                                                                                                                                              | 0.10.0      |
| [`system-55`](./system-55/README.md)       | Behringer System 55                                                                                                                                              | 0.10.0      |
| [`tb-303`](./tb-303/README.md)             | Roland TB-303 Computer Controlled Bass Line                                                                                                                      | 0.10.0      |
| [`take-5`](./take-5/README.md)             | Sequential Take 5                                                                                                                                                | 0.13.0      |
| [`td-3`](./td-3/README.md)                 | Behringer TD-3 Analog Bass Line Synthesizer                                                                                                                      | 0.10.0      |
| [`ub-xa-d`](./ub-xa-d/README.md)           | Behringer UB-Xa D                                                                                                                                                | 0.7.0       |
| [`wasp-deluxe`](./wasp-deluxe/README.md)   | Behringer WASP Deluxe                                                                                                                                            | 0.7.0       |

## Not in the app yet (26)

| Folder                                                                                 | Synth                                                                                                      | Spec schema |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| [`behringer-bds-3`](./behringer-bds-3/README.md)                                       | Behringer BDS-3 Classic 4-Channel Analog Drum Synthesizer with Special Effects Channel and Eurorack Format | 0.10.0      |
| [`behringer-jn-80`](./behringer-jn-80/README.md)                                       | Behringer JN-80 Classic Analog 8-Voice Programmable Polyphonic Synth                                       | 0.12.0      |
| [`behringer-odyssey`](./behringer-odyssey/README.md)                                   | Behringer ODYSSEY                                                                                          | 0.10.0      |
| [`behringer-syncussion-sy-1`](./behringer-syncussion-sy-1/README.md)                   | Behringer SYNCUSSION SY-1                                                                                  | 0.10.0      |
| [`behringer-wave`](./behringer-wave/README.md)                                         | Behringer WAVE Legendary 8-Voice Multi-Timbral Hybrid Synthesizer                                          | 0.13.0      |
| [`dreadbox-nymphes`](./dreadbox-nymphes/README.md)                                     | Dreadbox Nymphes                                                                                           | 0.12.0      |
| [`elta-music-solar-42`](./elta-music-solar-42/README.md)                               | Elta Music SOLAR 42 Ambient Machine                                                                        | 0.12.0      |
| [`erica-synths-syntrx-ii`](./erica-synths-syntrx-ii/README.md)                         | Erica Synths SYNTRX II                                                                                     | 0.12.0      |
| [`gamechanger-audio-motor-synth-mkii`](./gamechanger-audio-motor-synth-mkii/README.md) | Gamechanger Audio MOTOR Synth MKII                                                                         | 0.13.0      |
| [`gs-music-e7`](./gs-music-e7/README.md)                                               | GS Music e7 Polyphonic Analog Synthesizer                                                                  | 0.12.0      |
| [`korg-minilogue-xd`](./korg-minilogue-xd/README.md)                                   | Korg minilogue xd                                                                                          | 0.12.0      |
| [`moog-matriarch`](./moog-matriarch/README.md)                                         | Moog Music Matriarch                                                                                       | 0.12.0      |
| [`moog-sub-37`](./moog-sub-37/README.md)                                               | Moog Music Sub 37 Tribute Edition                                                                          | 0.11.0      |
| [`morphor-echon-6`](./morphor-echon-6/README.md)                                       | Morphor ECHON 6                                                                                            | 0.12.0      |
| [`novation-bass-station-ii`](./novation-bass-station-ii/README.md)                     | Novation Bass Station II                                                                                   | 0.11.0      |
| [`novation-peak`](./novation-peak/README.md)                                           | Novation Peak                                                                                              | 0.12.0      |
| [`oberheim-teo-5`](./oberheim-teo-5/README.md)                                         | Oberheim TEO-5                                                                                             | 0.12.0      |
| [`pearl-syncussion-sy-1`](./pearl-syncussion-sy-1/README.md)                           | Pearl Syncussion SY-1 (Syncussion-1) control board                                                         | 0.10.0      |
| [`pwm-malevolent`](./pwm-malevolent/README.md)                                         | PWM (Paul Whittington Group) Malevolent Modular Pure Analogue Synthesiser                                  | 0.13.0      |
| [`pwm-mantis`](./pwm-mantis/README.md)                                                 | PWM (Paul Whittington Group) Mantis Hybrid-Analogue Synthesiser                                            | 0.13.0      |
| [`sequential-circuits-prophet-5-rev3`](./sequential-circuits-prophet-5-rev3/README.md) | Sequential Circuits Prophet-5 (Model 1000), Revision 3.3                                                   | 0.12.0      |
| [`sequential-fourm`](./sequential-fourm/README.md)                                     | Sequential Fourm                                                                                           | 0.12.0      |
| [`udo-audio-super-6`](./udo-audio-super-6/README.md)                                   | UDO Audio Super 6                                                                                          | 0.12.0      |
| [`udo-audio-super-gemini`](./udo-audio-super-gemini/README.md)                         | UDO Audio Super Gemini                                                                                     | 0.13.0      |
| [`yamaha-cs-80`](./yamaha-cs-80/README.md)                                             | Yamaha CS-80 Polyphonic Synthesizer                                                                        | 0.13.0      |
| [`yamaha-dx7`](./yamaha-dx7/README.md)                                                 | Yamaha DX7 Digital Programmable Algorithm Synthesizer                                                      | 0.11.0      |

## Not synths

- [`_shared`](./_shared/README.md): older schemas, validators and download packs.
- [`_other`](./_other/README.md): the electronics component data model.
