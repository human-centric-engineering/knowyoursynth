#!/usr/bin/env python3
"""Assemble the GS Music e7 device file (schema 0.12.0).

Seven-voice, four-part multitimbral analogue synth from Argentina (2022): per voice two
VCOs (triangle, tri-saw or sawtooth plus a variable pulse) with square subs, noise or
external input, a 24 dB/oct resonant low-pass VCF and a VCA; digitally generated
controls (two ADSRs per voice, three LFOs); stereo spread and motion; DSP chorus and
delay; 512 single and 128 multitimbral presets; MIDI, USB, MPE and CV inputs.

Sources: GS e7 user manual (English), plus Synthtopia's launch coverage and the
midi.guide CC chart (the manual mentions CCs but gives no chart).
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []
K127 = {"min": 0, "max": 127}


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, shift=False, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": "SHIFT (secondary label)"} if shift else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, cc, **kw):
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, cc=cc, **kw)


def menu(id, module, label, kind, fn, path, memory="global", **kw):
    par(id, module, label, kind, fn, memory=memory, access=[{"type": "menu", "note": path}], **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "cv", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "normalled" if "broken_by" in kw else ("switched" if when else "fixed")}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


D["device"] = {
    "id": "gs-music-e7", "manufacturer": "GS Music", "model": "e7 Polyphonic Analog Synthesizer",
    "category": "7-voice, 4-part multitimbral analogue desktop synthesizer with digital chorus and delay",
    "based_on": "Original design (Buenos Aires, 2022), described as the first polyphonic and multitimbral analogue synthesizer made in Argentina.",
    "sources": [
        {"id": "manual", "title": "GS Music e7 User Manual (English)", "kind": "user_manual", "file": "GS_E7_Users_Manual.pdf", "pages": 32,
         "note": "Overview, panels, every section, polyphony modes, global configuration, panel/preset/multitimbral modes, CV, specifications. No CC chart."},
        {"id": "synthtopia", "title": "Synthtopia, 'GS Music Intros e7 Multitimbral Analog Polyphonic Synthesizer' (May 2022)", "kind": "other",
         "file": "https://www.synthtopia.com/content/2022/05/02/gs-music-intros-e7-multitimbral-analog-polyphonic-synthesizer/",
         "note": "4-pole low-pass VCF; chorus Basic uses two delay lines and Ensemble four, each with its own LFO; LFO 1, LFO 2 and delay clock-syncable."},
        {"id": "midi_impl", "title": "GS Music, 'GS-e7 MIDI Implementation' (22 September 2022)", "kind": "spec_sheet", "file": "https://www.gsmusic.com/s/GS-e7_MIDI_implementation.pdf",
         "note": "Official: implementation chart, every CC and value map, program/bank change scheme, SysEx commands, MPE, memory map and 128-byte preset structure."},
        {"id": "product_page", "title": "GS Music e7 product page", "kind": "other", "file": "https://www.gsmusic.com/synth-store/p/gs-e7-analog-polyphonic-synthesizer-black-blue",
         "note": "4-pole ladder filter, LFO frequencies 0.1-100 Hz, stereo motion by an LFO, US$1,899, 3.8 kg."},
        {"id": "musicradar", "title": "MusicRadar, 'GS Music e7 review' (Andy Jones)", "kind": "other", "file": "https://www.musicradar.com/reviews/gs-music-e7-review",
         "note": "One control per function (40+ dials) plus SHIFT; per-oscillator LFO 1/LFO 2 pitch knobs with LFO 3/EG 1 on SHIFT; dedicated LFO waveshape switches."},
        {"id": "sos", "title": "Sound On Sound, 'GS Music e7' review", "kind": "other", "file": "https://www.soundonsound.com/reviews/gs-music-e7",
         "note": "Near one-to-one panel with SHIFT and a few menus; screen shows filter, envelope and oscillator graphics; Voices LEDs follow the VCA envelope."},
        {"id": "midiguide", "title": "midi.guide, 'GS Music e7 MIDI CCs and NRPNs'", "kind": "other", "file": "https://midi.guide/d/gs-music/e7/",
         "note": "Community CC chart; matches the official implementation."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 7, "polyphony_mode": "polyphonic (7), mono single or multi trigger, unison single or multi trigger; up to 4 multitimbral parts sharing the 7 voices; MPE",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "512 single presets (1.1.1-8.8.8, 56 factory at 1.1.1-1.7.8) and 128 multitimbral presets (1.1.1-2.8.8, 8 factory). Panel mode plays the knobs live.",
    "semi_modular": False, "panel_counts": {"knobs": 40, "preset_buttons": 8, "voices": 7, "parts": 4},
    "panel_note": "Near one control per function (40+ knurled knobs) with a SHIFT layer for secondary labels; dedicated waveshape switches per oscillator and LFO; display and voice LEDs.",
    "summary": ("Per voice: two VCOs (over 7 octaves) each with triangle, tri-saw or sawtooth and a switchable variable pulse (10-50%), a square sub one octave down, and white noise or the "
                "external input, into a 24 dB/oct resonant low-pass VCF (10 Hz-25 kHz) and a VCA. Audio is fully analogue; controls are digital: two ADSRs per voice (velocity and key "
                "tracking on times) and three LFOs, the first two with six sync modes. Voices can be spread and moved across the stereo field, then pass DSP chorus (basic or ensemble) and "
                "delay (to 1.35 s, ping-pong, clock sync)."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "MIDI, voice and part allocation", "PORTAMENTO / POLYPHONY MODES", "Receives MIDI (DIN, USB) and CV pitch; assigns 7 voices per mode, voice option and multitimbral part (channel, key and velocity zones).",
    ["kbd.midi_in", "kbd.pitch_cv"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend"], scope="common")
for n in (1, 2):
    mod(f"vco{n}", "oscillator", f"VCO {n}", "OSCILLATORS (VCO)", "Analogue VCO: triangle, tri-saw or sawtooth (or none) plus a variable pulse (10-50%); transpose ±24 st, tune ±½ st."
        + (" Can be hard-synced to VCO 1." if n == 2 else ""),
        [f"vco{n}.pitch_cv", f"vco{n}.pwm_cv"] + (["vco2.sync_in"] if n == 2 else []), [f"vco{n}.out", f"vco{n}.sub"])
mod("noise", "noise", "Noise / external", "MIXER", "White noise, replaced by the external input when a plug is inserted.", ["noise.ext"], ["noise.out"], scope="common")
mod("extin", "preamp", "External input", "rear panel", "Instrument or line input (TS).", ["extin.in"], ["extin.out"], scope="common")
mod("mixer", "mixer", "Mixer", "MIXER", "OSC1, SUB1, OSC2, SUB2 and NOISE/EXT levels.", ["mixer.osc1", "mixer.sub1", "mixer.osc2", "mixer.sub2", "mixer.noise"], ["mixer.out"])
mod("vcf", "filter", "VCF", "FILTER (VCF)", "4-pole ladder 24 dB/oct resonant low-pass, 10 Hz-25 kHz, self-oscillating; exponential CV input.", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"],
    props={"slope_db_per_oct": 24, "cutoff_hz": [10, 25000]})
mod("env1", "envelope", "EG 1", "ENVELOPE GENERATORS", "ADSR (filter-oriented; also pitch, PWM and LFO 2 rate); velocity on attack and release, keyboard tracking on times.", ["env1.gate", "env1.velocity"], ["env1.out"])
mod("env2", "envelope", "EG 2", "ENVELOPE GENERATORS", "ADSR on the VCA; velocity on attack and release, keyboard tracking.", ["env2.gate", "env2.velocity"], ["env2.out"])
mod("vca", "vca", "VCA", "AMPLIFIER (VCA)", "EG 2 (with velocity depth), LFO tremolo and keyboard tracking; linear CV gain input. LEVEL sets the preset or part level.", ["vca.in", "vca.cv"], ["vca.out"])
for n in (1, 2):
    mod(f"lfo{n}", "lfo", f"LFO {n}", "LFOs", "Triangle, ramp up, ramp down, pulse or S&H; monophonic, polyphonic, keyboard tracking, keyboard sync, clock sync or keyboard + clock sync."
        + (" EG 1 can modulate its rate." if n == 2 else ""), [f"lfo{n}.reset"] + (["lfo2.rate_cv"] if n == 2 else []), [f"lfo{n}.out"])
mod("lfo3", "lfo", "LFO 3", "LFOs", "Triangle, ramp up, ramp down or pulse; amplitude zero until mod wheel or aftertouch bring it in.", ["lfo3.depth_cv"], ["lfo3.out"], scope="common")
mod("stereo", "mixer", "Stereo spread and motion", "AMPLIFIER (VCA)", "Places the seven voices across the stereo field (spread) and moves them with an internal fixed-rate LFO (motion).", ["stereo.in"], ["stereo.out_l", "stereo.out_r"], scope="common")
mod("chorus", "chorus", "Chorus", "EFFECTS", "DSP (24-bit, 48 kHz): Basic (two delay lines) or Ensemble (four), each with its own LFO; rate, depth, mix.", ["chorus.in_l", "chorus.in_r"], ["chorus.out_l", "chorus.out_r"], scope="common")
mod("delay", "delay", "Delay", "EFFECTS", "Stereo or ping-pong, 50 ms-1.35 s, or clock-synced divisions; feedback, mix.", ["delay.in_l", "delay.in_r"], ["delay.out_l", "delay.out_r"], scope="common",
    props={"time_s": [0.05, 1.35]})
mod("out", "output", "Output", "OUTPUT / rear panel", "Master volume to balanced L/mono and R outputs and headphones.", ["out.l", "out.r"], ["out.main_l", "out.main_r", "out.phones"], scope="common")

# ---------------------------------------------------------------- oscillators
SHAPES = ["triangle", "saw_tri", "sawtooth", "off", "triangle_pulse", "saw_tri_pulse", "sawtooth_pulse", "pulse"]
CC = {1: dict(tr=3, tune=9, shape=14, pw=15, l1=22, l2=23, l3=24, e1=25, l1p=26, l2p=27, l3p=28, e1p=29, lvl=20, sub=21),
      2: dict(tr=30, tune=31, shape=34, pw=35, l1=39, l2=40, l3=41, e1=42, l1p=43, l2p=44, l3p=45, e1p=46, lvl=36, sub=37)}
for n, c in CC.items():
    o = f"vco{n}"
    par(f"{o}.shape", o, f"WAVEFORM SELECTOR + PULSE (VCO {n})", "enum", "Main waveform (or none) and pulse on/off, combined in one CC value.", control="push_button", cc=c["shape"],
        values=[{"value": v} for v in SHAPES], note="Panel has a waveform selector with LEDs and a PULSE GENERATOR switch; the CC combines them.")
    knob(f"{o}.tune", o, f"TUNE (VCO {n})", "±½ semitone.", c["tune"])
    knob(f"{o}.transpose", o, f"TRANSPOSE (VCO {n})", "±24 semitones from the MIDI or CV note.", c["tr"], shift=True)
    knob(f"{o}.lfo1", o, f"LFO1 MOD (VCO {n})", "LFO 1 depth on pitch.", c["l1"])
    knob(f"{o}.eg1", o, f"EG1 MOD (VCO {n})", "EG 1 depth on pitch.", c["e1"], shift=True)
    knob(f"{o}.lfo2", o, f"LFO2 MOD (VCO {n})", "LFO 2 depth on pitch.", c["l2"])
    knob(f"{o}.lfo3", o, f"LFO3 MOD (VCO {n})", "LFO 3 depth on pitch.", c["l3"], shift=True)
    knob(f"{o}.pw", o, f"PULSE WIDTH (VCO {n})", "Pulse duty cycle 10-50%.", c["pw"], physical={"min": 10, "max": 50, "unit": "%"})
    knob(f"{o}.eg1_pwm", o, f"EG1 PWM (VCO {n})", "EG 1 depth on pulse width.", c["e1p"])
    knob(f"{o}.lfo1_pwm", o, f"LFO1 PWM (VCO {n})", "LFO 1 depth on pulse width.", c["l1p"])
    knob(f"{o}.lfo2_pwm", o, f"LFO 2 PWM (VCO {n})", "LFO 2 depth on pulse width.", c["l2p"], access=[{"type": "none", "note": "no panel control described"}], confidence="inferred",
         note="In the CC chart; no panel control described.")
    knob(f"{o}.lfo3_pwm", o, f"LFO 3 PWM (VCO {n})", "LFO 3 depth on pulse width.", c["l3p"], access=[{"type": "none", "note": "no panel control described"}], confidence="inferred",
         note="In the CC chart; no panel control described.")
    knob(f"mixer.osc{n}", "mixer", f"OSC{n}", f"VCO {n} level.", c["lvl"])
    knob(f"mixer.sub{n}", "mixer", f"SUB{n}", f"Sub {n} level (square, one octave below VCO {n}).", c["sub"])
par("vco2.sync", "vco2", "SYNC", "boolean", "Hard-syncs VCO 2 to VCO 1.", control="push_button", cc=51, shift=True)
par("vco.autotune", "vco1", "AUTOTUNING", "boolean", "Runs oscillator calibration (about 2 s), referencing the PITCH CV input voltage.", memory="none", control="push_button")
knob("mixer.noise", "mixer", "NOISE/EXT", "Noise or external input level.", 52)
# filter
knob("vcf.cutoff", "vcf", "CUTOFF", "10 Hz-25 kHz.", 74, physical={"min": 10, "max": 25000, "unit": "Hz"})
par("vcf.resonance", "vcf", "RESONANCE", "integer", "Emphasis; self-oscillates at maximum (some bass loss as it rises, per a user review).", range=K127,
    access=[{"type": "panel", "control": "knob"}, {"type": "sysex", "message": "preset byte 71 (Write Memory, command 0x0F)"}],
    note="No CC: the official MIDI implementation has none for resonance.")
knob("vcf.eg1", "vcf", "EG1 MOD (VCF)", "EG 1 depth on cutoff.", 89)
knob("vcf.vel_eg1", "vcf", "VELOCITY EG1 MOD", "Velocity scaling of the EG 1 depth.", 86, shift=True)
knob("vcf.lfo1", "vcf", "LFO1 MOD (VCF)", "LFO 1 depth on cutoff.", 90)
knob("vcf.lfo2", "vcf", "LFO2 MOD (VCF)", "LFO 2 depth on cutoff.", 91, shift=True)
knob("vcf.lfo3", "vcf", "LFO3 MOD (VCF)", "LFO 3 depth on cutoff.", 92, shift=True)
knob("vcf.kbd", "vcf", "KEYBOARD TRACKING (VCF)", "Cutoff follows the note.", 85)
knob("vcf.modwheel", "vcf", "MOD WHEEL (VCF)", "Mod wheel depth on cutoff.", 88, shift=True)
knob("vcf.aftertouch", "vcf", "AFTERTOUCH (VCF)", "Aftertouch depth on cutoff.", 87, shift=True)
# amplifier
knob("vca.level", "vca", "LEVEL", "Level before the effects (per part in multitimbral mode).", 11)
knob("vca.lfo1", "vca", "LFO1 MOD (VCA)", "Tremolo from LFO 1.", 103)
knob("vca.lfo2", "vca", "LFO2 MOD (VCA)", "Tremolo from LFO 2.", 104, shift=True)
knob("vca.lfo3", "vca", "LFO3 MOD (VCA)", "Tremolo from LFO 3.", 105, shift=True)
knob("vca.kbd", "vca", "KEYBOARD TRACKING (VCA)", "Amplitude follows the note.", 93)
knob("vca.vel_eg2", "vca", "VELOCITY EG2 MOD", "Velocity scaling of the EG 2 amplitude.", 94, shift=True)
knob("stereo.spread", "stereo", "STEREO SPREAD", "Centre: all voices centred; turn to spread voices 1-3 and 5-7 to opposite sides.", 10, panel_scale={"min": -5, "max": 5})
knob("stereo.motion", "stereo", "STEREO MOTION", "Fixed-rate movement of voices across the stereo field (largest with spread centred).", 119, shift=True)
# envelopes
for n, c in ((1, (16, 17, 18, 19, 106, 107, 117)), (2, (80, 81, 82, 83, 108, 109, 118))):
    e = f"env{n}"
    for k, nm, fn in ((0, "attack", "Attack time."), (1, "decay", "Decay time."), (2, "sustain", "Sustain level."), (3, "release", "Release time.")):
        knob(f"{e}.{nm}", e, f"EG{n} {nm.upper()}", fn, c[k])
    knob(f"{e}.vel_attack", e, f"EG{n} VELOCITY MOD (attack)", "Harder notes give faster attack.", c[4], shift=True)
    knob(f"{e}.vel_release", e, f"EG{n} VELOCITY MOD (release)", "Harder notes give shorter release.", c[5], shift=True)
    knob(f"{e}.kbd", e, f"EG{n} KEYBOARD TRACKING", "Higher notes shorten attack, decay and release.", c[6], shift=True)
# LFOs
LFO_SHAPES = ["triangle", "ramp_up", "ramp_down", "pulse", "sample_hold"]
MODES = ["monophonic", "polyphonic", "kb_tracking", "kb_sync", "clock_sync", "kb_clock_sync"]
for n, (sh, rate, mode) in ((1, (53, 76, 60)), (2, (61, 62, 70))):
    l = f"lfo{n}"
    par(f"{l}.shape", l, f"LFO{n} WAVESHAPE", "enum", "LFO waveform.", control="push_button", cc=sh, values=[{"value": v} for v in LFO_SHAPES])
    knob(f"{l}.rate", l, f"LFO{n} RATE", "0.1-100 Hz, or clock division in sync modes (whole to 1/32, dotted and triplets).", rate, physical={"min": 0.1, "max": 100, "unit": "Hz"})
    par(f"{l}.mode", l, f"LFO{n} MODE", "enum", "Phase/sync behaviour across voices.", control="push_button", cc=mode, values=[{"value": v} for v in MODES], shift=True)
par("lfo1.eg1", "lfo1", "LFO 1 EG1 mod", "integer", "EG 1 depth on LFO 1 rate.", range=K127,
    access=[{"type": "sysex", "message": "preset byte 55"}], confidence="inferred",
    note="Present in the official preset structure; no panel control or CC is documented.")
knob("lfo2.eg1", "lfo2", "EG1 MOD (LFO 2 rate)", "EG 1 depth on LFO 2 rate (not in monophonic or clock sync modes).", 67, shift=True)
par("lfo3.shape", "lfo3", "LFO3 WAVESHAPE", "enum", "LFO 3 waveform (no S&H).", control="push_button", cc=72, values=[{"value": v} for v in LFO_SHAPES[:4]])
knob("lfo3.rate", "lfo3", "LFO3 RATE", "0.1-100 Hz.", 73, physical={"min": 0.1, "max": 100, "unit": "Hz"})
knob("lfo3.modwheel", "lfo3", "MODWHEEL (LFO 3)", "Mod wheel brings in LFO 3.", 79, shift=True)
knob("lfo3.aftertouch", "lfo3", "AFTERTOUCH (LFO 3)", "Aftertouch brings in LFO 3.", 78, shift=True)
# effects
par("chorus.type", "chorus", "CHORUS TYPE", "enum", "Basic (two lines) or Ensemble (four).", control="push_button", cc=113, values=[{"value": "basic"}, {"value": "ensemble"}], shift=True)
knob("chorus.rate", "chorus", "CHORUS RATE", "Modulation rate.", 114)
knob("chorus.depth", "chorus", "CHORUS DEPTH", "Modulation depth.", 115, shift=True)
knob("chorus.mix", "chorus", "CHORUS MIX", "Dry/wet.", 13)
par("delay.type", "delay", "DELAY TYPE", "enum", "Stereo, ping-pong, or their clock-synced versions.", control="push_button", cc=110, values=[{"value": v} for v in ["stereo", "ping_pong", "stereo_sync", "ping_pong_sync"]], shift=True)
knob("delay.time", "delay", "DELAY TIME", "50 ms-1.35 s, or a division when synced.", 111, physical={"min": 0.05, "max": 1.35, "unit": "s"})
knob("delay.feedback", "delay", "DELAY FEEDBACK", "Repeats.", 112, shift=True)
knob("delay.mix", "delay", "DELAY MIX", "Dry/wet.", 12)
# portamento / modes
knob("kbd.portamento", "kbd", "PORTAMENTO TIME", "Glide between notes on the same voice.", 5)
par("kbd.portamento_on", "kbd", "Portamento switch", "boolean", "Portamento on/off.", access=[{"type": "midi", "message": "CC 65"}])
knob("kbd.bend_range", "kbd", "BEND RANGE / VALUE", "Pitch bend range in semitones; also edits menu values.", 50)
par("kbd.mode", "kbd", "MODE / ENTER", "enum", "Polyphony mode (unison not in multitimbral patches); confirms menu steps.", control="push_button", cc=116,
    values=[{"value": v} for v in ["poly", "mono_single", "mono_multi", "unison_single", "unison_multi"]])
par("kbd.voices", "kbd", "Voices", "enum", "Poly voice set (all, even, odd, 1-7, 7-1) and mono voice (free or 1-7); CC value = 16 x poly option + mono voice.",
    access=[{"type": "menu", "note": "SHIFT + 5 (MENU), Voices"}, {"type": "midi", "message": "CC 97"}], values=[{"value": v} for v in ["all", "even", "odd", "1_to_7", "7_to_1"]])
par("kbd.transpose", "kbd", "Preset transpose", "integer", "±48 semitones.", access=[{"type": "menu", "note": "SHIFT + 5 (MENU), Transpose"}], range={"min": -48, "max": 48})
par("out.volume", "out", "OUTPUT (master volume)", "continuous", "Master level.", memory="none", cc=7, panel_scale=S10)
for pid, label, fn in (("ui.shift", "SHIFT", "Toggles the secondary (white) labels."), ("ui.buttons", "Buttons 1-8", "Preset positions; with SHIFT: parts 1-4, MENU (5), MULTI (6), PANEL (7), CONFIG (8)."),
                       ("ui.bank_save", "BANK / SAVE", "Bank entry for three-digit addresses; SHIFT + BANK/SAVE saves.")):
    par(pid, "kbd", label, "boolean", fn, memory="none", control="push_button")
# multitimbral part settings
MT = "Multitimbral mode: SHIFT + 5 (MENU)"
menu("part.channel", "kbd", "Part MIDI channel", "enum", "1-16, off, all, or the global channel (learn by holding ENTER and playing).", f"{MT}, CH/TRANSP", memory="patch",
     values=[{"value": v} for v in ["1..16", "off", "all", "global"]])
menu("part.transpose", "kbd", "Part transpose", "integer", "±48 semitones.", f"{MT}, CH/TRANSP", memory="patch", range={"min": -48, "max": 48})
menu("part.filters", "kbd", "Part PB/CC/AT", "enum", "Which of pitch bend, CC and aftertouch the part accepts.", f"{MT}, PB/CC/AT", memory="patch", values=[{"value": "per message on/off"}])
menu("part.level", "kbd", "Part level", "integer", "Part mix level.", f"{MT}, MIXER", memory="patch", range=K127)
menu("part.key_zone", "kbd", "Keyboard zone", "enum", "Lowest and highest note accepted.", f"{MT}, KEYBOARD ZONE", memory="patch", values=[{"value": "low..high"}])
menu("part.vel_zone", "kbd", "Velocity zone", "enum", "Velocity range accepted.", f"{MT}, VELOCITY ZONE", memory="patch", values=[{"value": "min..max"}])
# global configuration
GC = "SHIFT + 8 (CONFIG)"
menu("sys.rx_channel", "kbd", "Rx channel", "enum", "Receive channel 1-16 or omni (default 1).", f"{GC}, RX/TX", values=[{"value": "1..16"}, {"value": "omni"}])
menu("sys.tx_channel", "kbd", "Tx channel", "enum", "CC transmit channel 1-16 or off.", f"{GC}, RX/TX", values=[{"value": "1..16"}, {"value": "off"}])
menu("sys.pb", "kbd", "Pitch bend", "boolean", "Pitch bend on/off.", f"{GC}, PB/PC/CC")
menu("sys.pc", "kbd", "Program change", "boolean", "Receive program changes.", f"{GC}, PB/PC/CC")
menu("sys.cc", "kbd", "Control change", "boolean", "Receive CCs.", f"{GC}, PB/PC/CC")
menu("sys.clock", "kbd", "Clock source", "enum", "USB or MIDI DIN.", f"{GC}, CLK/MPE", values=[{"value": "usb"}, {"value": "midi"}])
menu("sys.mpe", "kbd", "MPE", "boolean", "MIDI Polyphonic Expression (not with multitimbral patches; off at power-up).", f"{GC}, CLK/MPE", memory="none")
menu("sys.soft_thru", "kbd", "Soft thru", "enum", "Echo routes, each on/off.", f"{GC}, SOFT THRU 1/2", values=[{"value": v} for v in ["in_out", "in_usb", "usb_out", "usb_usb"]])
menu("sys.factory_restore", "kbd", "Factory restore", "enum", "Presets, configuration (MIDI and calibration) or all; confirm with button 1.", f"{GC}, FACTORY RESTORE", memory="none",
     values=[{"value": v} for v in ["presets", "config", "all"]])

# ---------------------------------------------------------------- ports
jack("jack.out_l", "L/MONO", "out", "audio", "out.main_l", "Balanced main output (mono when R is unused).", "6.35 mm TRS")
jack("jack.out_r", "R", "out", "audio", "out.main_r", "Balanced main output.", "6.35 mm TRS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS")
jack("jack.ext_in", "EXTERNAL INPUT", "in", "audio", "extin.in", "Instrument or line input; disables the noise generator.", "6.35 mm TS")
jack("jack.cv_pitch", "PITCH (CV)", "in", "cv", "kbd.pitch_cv", "1 V/oct, 0 to +5 V; read by autotune as the reference.", "3.5 mm TS", confidence="inferred", note="Connector size not stated.")
jack("jack.cv_cutoff", "CUTOFF (CV)", "in", "cv", "vcf.cutoff_cv", "Exponential, 0 to +5 V.", "3.5 mm TS", confidence="inferred", combine="sum")
jack("jack.cv_gain", "GAIN (CV)", "in", "cv", "vca.cv", "Linear, 0 to +5 V.", "3.5 mm TS", confidence="inferred", combine="sum")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "CC transmission and soft thru.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB MIDI.", "USB", note="Connector type not stated.")
jack("jack.power", "DC 12V", "in", "power", None, "12 V DC 3 A supply (100-240 V AC).", "DC barrel")

# ---------------------------------------------------------------- connections
for n in (1, 2):
    o = f"vco{n}"
    con("kbd.pitch", f"{o}.pitch_cv", note="Plus transpose, bend and the PITCH CV input.")
    con("kbd.bend", f"{o}.pitch_cv", amount="kbd.bend_range")
    con("lfo1.out", f"{o}.pitch_cv", amount=f"{o}.lfo1")
    con("lfo2.out", f"{o}.pitch_cv", amount=f"{o}.lfo2")
    con("lfo3.out", f"{o}.pitch_cv", amount=f"{o}.lfo3")
    con("env1.out", f"{o}.pitch_cv", amount=f"{o}.eg1")
    con("env1.out", f"{o}.pwm_cv", amount=f"{o}.eg1_pwm")
    con("lfo1.out", f"{o}.pwm_cv", amount=f"{o}.lfo1_pwm")
    con("lfo2.out", f"{o}.pwm_cv", amount=f"{o}.lfo2_pwm")
    con("lfo3.out", f"{o}.pwm_cv", amount=f"{o}.lfo3_pwm")
    con(f"{o}.out", f"mixer.osc{n}", "audio", amount=f"mixer.osc{n}")
    con(f"{o}.sub", f"mixer.sub{n}", "audio", amount=f"mixer.sub{n}")
con("vco1.out", "vco2.sync_in", "sync", {"param": "vco2.sync", "equals": True})
con("extin.out", "noise.ext", "audio", note="A plug in EXTERNAL INPUT replaces the noise.")
con("noise.out", "mixer.noise", "audio", amount="mixer.noise")
con("mixer.out", "vcf.in", "audio")
con("env1.out", "vcf.cutoff_cv", amount="vcf.eg1", note="Velocity scales this by VELOCITY EG1 MOD.")
con("lfo1.out", "vcf.cutoff_cv", amount="vcf.lfo1")
con("lfo2.out", "vcf.cutoff_cv", amount="vcf.lfo2")
con("lfo3.out", "vcf.cutoff_cv", amount="vcf.lfo3")
con("kbd.pitch", "vcf.cutoff_cv", amount="vcf.kbd")
con("kbd.modwheel", "vcf.cutoff_cv", amount="vcf.modwheel")
con("kbd.aftertouch", "vcf.cutoff_cv", amount="vcf.aftertouch")
con("vcf.out", "vca.in", "audio")
con("env2.out", "vca.cv", note="Velocity scales this by VELOCITY EG2 MOD.")
con("lfo1.out", "vca.cv", amount="vca.lfo1")
con("lfo2.out", "vca.cv", amount="vca.lfo2")
con("lfo3.out", "vca.cv", amount="vca.lfo3")
con("kbd.pitch", "vca.cv", amount="vca.kbd")
con("kbd.gate", "env1.gate", "gate")
con("kbd.gate", "env2.gate", "gate")
con("kbd.velocity", "env1.velocity", amount="env1.vel_attack")
con("kbd.velocity", "env2.velocity", amount="env2.vel_attack")
con("kbd.gate", "lfo1.reset", "gate", {"any": [{"param": "lfo1.mode", "equals": "kb_sync"}, {"param": "lfo1.mode", "equals": "kb_clock_sync"}]})
con("kbd.gate", "lfo2.reset", "gate", {"any": [{"param": "lfo2.mode", "equals": "kb_sync"}, {"param": "lfo2.mode", "equals": "kb_clock_sync"}]})
con("env1.out", "lfo2.rate_cv", amount="lfo2.eg1")
con("kbd.modwheel", "lfo3.depth_cv", amount="lfo3.modwheel")
con("kbd.aftertouch", "lfo3.depth_cv", amount="lfo3.aftertouch")
con("vca.out", "stereo.in", "audio", amount="vca.level", note="Seven voices placed in stereo.")
con("stereo.out_l", "chorus.in_l", "audio")
con("stereo.out_r", "chorus.in_r", "audio")
con("chorus.out_l", "delay.in_l", "audio", confidence="inferred", note="Effects order not stated; panel order (chorus, then delay).")
con("chorus.out_r", "delay.in_r", "audio", confidence="inferred")
con("delay.out_l", "out.l", "audio")
con("delay.out_r", "out.r", "audio")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "display", "module": "kbd", "label": "display", "kind": "display", "function": "Preset name and address, menus, LFO frequency, values; graphics of filter and resonance, envelope curves and oscillator frequencies."},
    {"id": "voice_leds", "module": "kbd", "label": "Voices LEDs", "kind": "led", "function": "One per voice; follow each voice's VCA envelope."},
    {"id": "midi_led", "module": "kbd", "label": "MIDI activity LED", "kind": "led", "function": "Lights on DIN or USB MIDI."},
    {"id": "wave_leds", "module": "vco1", "label": "waveform selector LEDs", "kind": "led", "function": "Selected oscillator and LFO waveforms (none lit = no main waveform)."},
    {"id": "shift_led", "module": "kbd", "label": "SHIFT LED", "kind": "led", "function": "Secondary functions active."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["vco1", "vco2", "mixer", "vcf", "vca", "stereo", "chorus", "delay"],
     "rule": "Per voice: two VCOs and their subs, plus noise or the external input, into the 24 dB low-pass VCF and the VCA (fully analogue). The seven voices are placed by stereo spread and motion, then pass the DSP chorus and delay."},
    {"id": "b02", "name": "Waveforms", "applies_to": ["vco1", "vco2"],
     "rule": "Each VCO selects triangle, tri-saw, sawtooth or none, and the pulse generator mixes in at equal level when on. With no main waveform and pulse on, only the pulse sounds. Subs are squares an octave down."},
    {"id": "b03", "name": "Envelopes", "applies_to": ["env1", "env2"],
     "rule": "EG 1 is aimed at the filter (also pitch, PWM, LFO 2 rate); EG 2 at the VCA. Velocity shortens attack and release; keyboard tracking shortens times for higher notes."},
    {"id": "b04", "name": "LFO modes", "applies_to": ["lfo1", "lfo2", "lfo3"],
     "rule": "LFO 1 and 2: monophonic (one phase), polyphonic (slightly different rate per key), keyboard tracking (rate follows the note), keyboard sync (phase per key), clock sync (MIDI clock divisions, 120 BPM without clock) or keyboard + clock sync. LFO 3 is silent until the mod wheel or aftertouch bring it in."},
    {"id": "b05", "name": "Polyphony modes", "applies_to": ["kbd"],
     "rule": "Poly (7 voices), mono single or multi trigger, unison single or multi trigger (all seven detuned; not in multitimbral patches). Last-note priority in mono and unison. Voice options pick which voices are used (all, even, odd, left-to-right, right-to-left, or a fixed mono voice)."},
    {"id": "b06", "name": "Multitimbral mode", "applies_to": ["kbd"],
     "rule": "Up to four parts share the seven voices, each with its own sound, MIDI channel, transpose, PB/CC/AT filter, level, key zone and velocity zone. Effects and stereo spread/motion are global. SHIFT + 1-4 selects the part being edited."},
    {"id": "b07", "name": "Presets", "applies_to": ["kbd"],
     "rule": "Panel mode plays the knobs; buttons 1-8 select positions, BANK + three digits any address. SHIFT + BANK/SAVE, choose address and name, SAVE. Factory presets can be edited but saved only elsewhere. Copy preset/part options copy patch, patch + FX or FX only."},
    {"id": "b08", "name": "CV inputs", "applies_to": ["kbd", "vcf", "vca"], "rule": "PITCH (1 V/oct), CUTOFF (exponential) and GAIN (linear) accept 0 to +5 V; autotune takes the PITCH CV voltage as its reference."},
]
D["midi"] = {
    "receives": [{"message": "note_on", "range": [20, 114], "velocity": True}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"},
                 {"message": "program_change", "note": "with bank select: MSB 0 single presets (LSB 0-3 = 128-preset blocks 1.1.1-8.8.8), MSB 1 multitimbral presets"},
                 {"message": "control_change", "note": "every panel parameter except resonance (see parameter access); 1 mod wheel, 7 master volume, 11 expression (part level), 64 hold, 65 portamento, 50 bend range"},
                 {"message": "rpn", "number": 0, "parameter": "pitch bend sensitivity"}, {"message": "rpn", "number": 6, "parameter": "MPE configuration (lower zone only; 0 channels disables)"},
                 {"message": "clock"}, {"message": "start", "note": "LFO synchronisation"}, {"message": "tune_request"},
                 {"message": "sysex", "header": "F0 00 21 62 01 10", "commands": {"0x0A": "read autotuning status", "0x0C": "read configuration", "0x0D": "write configuration",
                                                                                "0x0E": "read memory (16 bytes, nibbles)", "0x0F": "write memory (also lock/unlock presets)", "0x10": "initialise preset",
                                                                                "0x13": "all LEDs on", "0x14": "factory reset", "0x20": "read serial number"}}],
    "transmits": [{"message": "control_change", "note": "panel moves on the Tx channel"}, {"message": "sysex", "note": "replies to read commands"}],
    "channel_note": "Rx 1-16 or omni (default 1); Tx 1-16 or off; parts may use their own channels. MIDI modes 1-4 and multi mode supported.",
    "memory_map": {"preset_flash": "0x000000-0x01FFFF (512 single presets x 128 bytes, then 128 multis x 512 bytes = 4 parts)", "configuration_eeprom": "0x020000-0x0203FF",
                   "volatile_ram": "0x030000-0x030FFF (read only)", "preset_address": "((A-1) x 64 + (B-1) x 8 + (C-1)) x 128", "lock_byte": "byte 127 (1 = locked from the panel; factory presets locked)"},
    "note": "From GS Music's official MIDI implementation (September 2022). No NRPNs, poly aftertouch, active sensing or song position."}
D["specifications"] = {
    "voices": 7, "parts": 4, "oscillators_per_voice": "2 VCOs + 2 subs, noise or external input", "waveforms": ["triangle", "saw-tri", "sawtooth", "pulse 10-50%"],
    "filter": "24 dB/oct (4-pole) low-pass, 10 Hz-25 kHz, resonant", "envelopes": "2 ADSR per voice", "lfos": 3, "effects": "chorus, delay (DSP 24-bit, 48 kHz)",
    "presets": "640 (512 single incl. 56 factory, 128 multitimbral incl. 8 factory)", "cv_inputs": ["pitch (1 V/oct)", "cutoff", "gain"],
    "connections": {"audio_in": "1/4\" TS unbalanced", "outputs": "L/mono and R, 1/4\" TRS balanced", "phones": "1/4\" TRS stereo", "midi": "DIN in, out, thru; USB"},
    "power": "12 V DC 3 A external supply, 12 W", "dimensions_mm": {"w": 520, "d": 190, "h": 108}, "weight_kg": 3.75,
}
D["omitted_from_source"] = ["credits and introduction", "safety and warranty text", "basic connection diagram", "signal path diagram image"]
D["not_in_source"] = ["envelope time ranges (not found in the manual, MIDI implementation, product page or reviews)", "the full SHIFT layout beyond the pairs described by the manual and MusicRadar",
                      "CV jack sizes and USB connector type", "effects order (chorus then delay inferred from the panel)"]
D["source_inconsistencies"] = [
    "The filter's LFO1 MOD is described as 'modulation from the EG1 to the cutoff frequency'.",
    "SUB2 is described as 'Sub-oscillator 1 level (derived from OSC2)'.",
    "The manual says 'more than 600 presets'; the specifications give 640 and the preset sections 512 + 128.",
    "The specifications list the LFO waveform 'Square'; the LFO section calls it 'Pulse'.",
    "The CC chart has LFO 2 and LFO 3 pulse width depths for both oscillators; the manual describes only EG1 PWM and LFO1 PWM.",
    "The rear panel heading is spelled 'Raer panel' in the contents.",
    "The official preset structure has an LFO 1 EG1 mod byte (55); the manual and CC chart only give EG 1 control of LFO 2's rate.",
    "Weight is 3.75 kg in the manual, 3.8 kg on the product page and '4.6 kg (estimated)' in an early listing.",
    "The product page lists 'Velocity to Attack' for the envelopes; the manual and MIDI implementation also have velocity to release.",
]
D["modelling_gaps"] = [
    {"topic": "SHIFT layer", "detail": "Secondary controls are marked from the manual's paired labels and MusicRadar's description; a few pairings are assumed."},
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); LFO 3, stereo, effects and output are common. LFO 1/2 run per voice in their polyphonic modes."},
    {"topic": "Hidden parameters", "detail": "Preset bytes without panel or CC access (LFO 1 EG1 mod) are modelled with SysEx access only."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/gs-music-e7_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
