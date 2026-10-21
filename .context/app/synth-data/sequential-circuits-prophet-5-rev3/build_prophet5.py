#!/usr/bin/env python3
"""Assemble the Sequential Circuits Prophet-5 (Model 1000, Rev 3.3) device file.

Five identical analogue voices (two VCOs, noise, mixer, 24 dB low-pass VCF with ADSR,
VCA with ADSR) patched in parallel by one panel; Poly-Mod (filter envelope and OSC B
per voice to OSC A frequency, OSC A pulse width and filter); Wheel-Mod (LFO and pink
noise through the mod wheel); 120 programs in three files of 40; Scale Mode; cassette
interface; monophonic sequencer interface and SCI digital interface (pre-MIDI).

Source: Prophet-5 Operation Manual, Revision 3.3, CM1000D, February 1982 (OCR scan),
which also gives the 24-byte program format confirming every programmable control.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def pot(id, module, label, fn, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, "patch", "knob", **kw)


def swp(id, module, label, fn, **kw):
    par(id, module, label, "boolean", fn, "patch", "push_button", **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "cv", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def on(p):
    return {"param": p, "equals": True}


D["device"] = {
    "id": "sequential-circuits-prophet-5-rev3", "manufacturer": "Sequential Circuits", "model": "Prophet-5 (Model 1000), Revision 3.3",
    "category": "5-voice programmable polyphonic analogue synthesizer, 61 keys",
    "based_on": "Original design, January 1978 (Dave Smith and John Bowen); Rev 3.3 (serial 4064 up) has 120 programs in three files.",
    "sources": [{"id": "manual", "title": "Prophet-5 Synthesizer Operation Manual, Revision 3.3 (CM1000D, February 1982), by Stanley Jungleib", "kind": "user_manual",
                 "file": "Prophet-5_Owner_s_Manual.pdf", "pages": 94,
                 "note": "Internet Archive scan with an imperfect OCR layer. Basic operation, front and back panel, cassette, Scale Mode, system interface (with the 24-byte program format), factory programs. Panel figures are images."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 5, "polyphony_mode": "5-voice polyphonic, last-note priority (same key reuses its voice); UNISON stacks all five on the lowest key",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "120 programs as three files of 40 (five banks of eight); one file active at a time, in non-volatile RAM. Each location holds a patch or a Scale program. Files and banks save to cassette.",
    "semi_modular": False, "panel_counts": {"keys": 61, "programmable_knobs": 24, "programmable_switches": 22},
    "summary": ("Each of five voices has OSC A (saw and/or pulse, sync to B), OSC B (saw, triangle and/or pulse, fine tune, low-frequency and keyboard switches), white noise, a mixer, "
                "a resonant 24 dB/oct low-pass filter with its own ADSR and keyboard tracking, and a VCA with ADSR. One panel patches all five. Poly-Mod sends the filter envelope and OSC B, "
                "per voice, to OSC A frequency, OSC A pulse width and the filter. Wheel-Mod sends a mix of the LFO (saw, triangle, square) and pink noise, scaled by the mod wheel, to either "
                "oscillator's frequency or pulse width and the filter. Microcomputer tuning, 120 programs, Scale Mode for alternative tunings."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "KEYBOARD / MISCELLANEOUS",
    "61 keys (C0-C5) under microcomputer scanning; assigns five voices, or all five to the lowest key in UNISON (with GLIDE). Voice 5 can be handed to the sequencer interface.",
    ["kbd.ext_cv", "kbd.ext_gate", "kbd.release_fs", "kbd.digital_in"], ["kbd.cv", "kbd.gate", "kbd.cv_out", "kbd.gate_out"], scope="common", props={"keys": 61, "range": "C0-C5"})
mod("wheels", "manual_controller", "Pitch and mod wheels", "LEFT OF KEYBOARD", "Pitch wheel (centre detent, about a fifth either way) and mod wheel (sets Wheel-Mod depth). Remote CVs via the ANALOG jack.",
    ["wheels.pitch_cv_in", "wheels.mod_cv_in"], ["wheels.pitch", "wheels.mod"], scope="common")
mod("osc_a", "oscillator", "Oscillator A", "OSCILLATOR A", "Audio VCO always on the keyboard: frequency stepped in semitones over four octaves, sawtooth and/or pulse (width about 1-99%), hard sync to OSC B.",
    ["osc_a.pitch_cv", "osc_a.pw_cv", "osc_a.sync_in"], ["osc_a.out"])
mod("osc_b", "oscillator", "Oscillator B", "OSCILLATOR B", "VCO with sawtooth, triangle (centred on ground) and/or pulse; FINE (up a semitone); LO FREQ (about 0.4-30 Hz); keyboard control on or off (drone).",
    ["osc_b.pitch_cv", "osc_b.pw_cv"], ["osc_b.out"], props={"lo_freq_hz": [0.4, 30]})
mod("noise", "noise", "White noise", "MIXER", "White noise source for the voice mixer.", [], ["noise.out"], scope="common",
    props={"note": "Whether one source feeds all voices is not stated."})
mod("mixer", "mixer", "Mixer", "MIXER", "OSC A, OSC B and noise levels into the filter; also used to balance program volumes.", ["mixer.a", "mixer.b", "mixer.noise"], ["mixer.out"])
mod("vcf", "filter", "Filter", "FILTER", "Resonant 24 dB/oct (4-pole) low-pass; self-oscillates as a sine above resonance 7; keyboard tracking on or off.", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"],
    props={"slope_db_per_oct": 24})
mod("env_f", "envelope", "Filter envelope", "FILTER", "ADSR, about 1 ms-30 s per stage (exponential knob response: 5 is about 0.5 s); also a Poly-Mod source.", ["env_f.gate"], ["env_f.out"], props={"time_s": [0.001, 30]})
mod("env_a", "envelope", "Amplifier envelope", "AMPLIFIER", "ADSR, about 1 ms-30 s per stage.", ["env_a.gate"], ["env_a.out"], props={"time_s": [0.001, 30]})
mod("vca", "vca", "VCA", "AMPLIFIER", "Shapes each voice with the amplifier envelope.", ["vca.in", "vca.cv"], ["vca.out"])
mod("pmod", "modulation_bus", "Poly-Mod", "POLY-MOD", "Per-voice: filter envelope (FILT ENV amount) plus OSC B (OSC B amount) to OSC A frequency, OSC A pulse width and/or filter, by switch. Different in each voice, so effects vary note to note.",
    ["pmod.env", "pmod.osc_b"], ["pmod.out"])
mod("lfo", "lfo", "LFO", "LFO", "Single LFO, about 0.04-20 Hz, sawtooth, triangle and/or square.", [], ["lfo.out"], scope="common", props={"rate_hz": [0.04, 20]})
mod("pink", "noise", "Pink noise (modulation)", "WHEEL-MOD", "Pink noise as a Wheel-Mod source.", [], ["pink.out"], scope="common")
mod("wmod", "modulation_bus", "Wheel-Mod", "WHEEL-MOD", "SOURCE MIX blends LFO (0) and pink noise (10); the mod wheel sets depth; switches send it to OSC A/B frequency, OSC A/B pulse width and the filter, the same for every voice.",
    ["wmod.lfo", "wmod.noise", "wmod.wheel"], ["wmod.out"], scope="common")
mod("out", "output", "Output", "VOLUME / back panel", "Five voices summed; VOLUME and the AMPLIFIER CV input set the level.", ["out.in", "out.cv"], ["out.audio"], scope="common")
mod("programmer", "cv_source_selector", "Programmer", "PROGRAMMER", "Preset/manual, record, bank and program select, three files, tune, A-440 reference, cassette save/load, Scale Mode.", [], [], scope="common")

# ---------------------------------------------------------------- programmable parameters (24 pots, 22 switches)
pot("osc_a.frequency", "osc_a", "OSC A FREQUENCY", "Pitch in semitone steps over four octaves.", physical={"min": 0, "max": 48, "unit": "semitones"})
swp("osc_a.saw", "osc_a", "OSC A SAWTOOTH", "Full-level sawtooth on.")
swp("osc_a.pulse", "osc_a", "OSC A PULSE", "Full-level pulse on.")
pot("osc_a.pw", "osc_a", "OSC A PULSE WIDTH", "Duty cycle about 1-99%; about 5 is square; extremes thin to nothing.")
swp("osc_a.sync", "osc_a", "OSC A SYNC", "Hard-syncs OSC A to OSC B.")
pot("osc_b.frequency", "osc_b", "OSC B FREQUENCY", "Pitch in semitone steps over four octaves.", physical={"min": 0, "max": 48, "unit": "semitones"})
pot("osc_b.fine", "osc_b", "OSC B FINE", "Raises pitch continuously by up to a semitone; 0 for no detune.")
swp("osc_b.saw", "osc_b", "OSC B SAWTOOTH", "Sawtooth on.")
swp("osc_b.tri", "osc_b", "OSC B TRIANGLE", "Triangle on.")
swp("osc_b.pulse", "osc_b", "OSC B PULSE", "Pulse on.")
pot("osc_b.pw", "osc_b", "OSC B PULSE WIDTH", "Duty cycle about 1-99%.")
swp("osc_b.lo_freq", "osc_b", "OSC B LO FREQ", "Low-frequency range, about 0.4-30 Hz.")
swp("osc_b.keyboard", "osc_b", "OSC B KEYBOARD", "Keyboard control of OSC B (off: drone).")
pot("mixer.osc_a", "mixer", "MIXER OSC A", "OSC A level.")
pot("mixer.osc_b", "mixer", "MIXER OSC B", "OSC B level.")
pot("mixer.noise", "mixer", "MIXER NOISE", "White noise level.")
pot("vcf.cutoff", "vcf", "FILTER CUTOFF", "Cutoff frequency.")
pot("vcf.resonance", "vcf", "FILTER RESONANCE", "Emphasis; self-oscillation above about 7.")
pot("vcf.env_amount", "vcf", "FILTER ENVELOPE AMOUNT", "Depth of the filter envelope.")
swp("vcf.keyboard", "vcf", "FILTER KEYBOARD", "Keyboard tracking of cutoff on or off.")
for e, lab in (("env_f", "FILTER"), ("env_a", "AMPLIFIER")):
    pot(f"{e}.attack", e, f"{lab} ATTACK", "Attack about 1 ms-30 s (5 is about 0.5 s).")
    pot(f"{e}.decay", e, f"{lab} DECAY", "Decay to sustain.")
    pot(f"{e}.sustain", e, f"{lab} SUSTAIN", "Sustain level.")
    pot(f"{e}.release", e, f"{lab} RELEASE", "Release time.")
swp("kbd.release", "env_a", "RELEASE", "Off: filter and amplifier release set to minimum (and the release footswitch then works).")
swp("kbd.unison", "kbd", "UNISON", "All five voices on the lowest key held (four with the sequencer interface).")
pot("kbd.glide", "kbd", "GLIDE", "Portamento time, in UNISON only.")
pot("pmod.filt_env", "pmod", "POLY-MOD FILT ENV", "Amount of filter envelope in Poly-Mod.")
pot("pmod.osc_b", "pmod", "POLY-MOD OSC B", "Amount of OSC B in Poly-Mod.")
swp("pmod.freq_a", "pmod", "POLY-MOD FREQ A", "Poly-Mod to OSC A frequency.")
swp("pmod.pw_a", "pmod", "POLY-MOD PW A", "Poly-Mod to OSC A pulse width.")
swp("pmod.filter", "pmod", "POLY-MOD FILTER", "Poly-Mod to filter cutoff.")
pot("lfo.frequency", "lfo", "LFO FREQUENCY", "Rate about 0.04-20 Hz.", physical={"min": 0.04, "max": 20, "unit": "Hz"})
swp("lfo.saw", "lfo", "LFO SAWTOOTH", "Sawtooth on.")
swp("lfo.tri", "lfo", "LFO TRIANGLE", "Triangle on.")
swp("lfo.square", "lfo", "LFO SQUARE", "Square on.")
pot("wmod.source_mix", "wmod", "WHEEL-MOD SOURCE MIX", "0 all LFO, 10 all pink noise.")
for k, lab, dest in (("freq_a", "FREQ A", "OSC A frequency"), ("freq_b", "FREQ B", "OSC B frequency"), ("pw_a", "PW A", "OSC A pulse width"),
                     ("pw_b", "PW B", "OSC B pulse width"), ("filter", "FILTER", "filter cutoff")):
    swp(f"wmod.{k}", "wmod", f"WHEEL-MOD {lab}", f"Wheel-Mod to {dest}.")
# ---------------------------------------------------------------- non-programmable
par("out.volume", "out", "VOLUME", "continuous", "Overall level (silver knob).", "none", panel_scale=S10)
par("kbd.master_tune", "kbd", "MASTER TUNE", "continuous", "Exact pitch of all oscillators (silver knob).", "none", panel_scale={"min": -5, "max": 5})
par("wheels.pitch", "wheels", "PITCH wheel", "continuous", "Bend of all voices, about a fifth either way; centre detent.", "none", "wheel", panel_scale={"min": -1, "max": 1})
par("wheels.mod", "wheels", "MOD wheel", "continuous", "Wheel-Mod depth.", "none", "wheel", panel_scale=S10)
for pid, label, fn in (("programmer.preset", "PRESET", "Preset mode (programs) or manual mode (panel as set)."),
                       ("programmer.record", "RECORD", "Records the current patch: then choose file, bank and program (needs the back-panel switch at ENABLE)."),
                       ("programmer.bank", "BANK SELECT", "Steps through banks 1-5; held with PROGRAM SELECT 1-3 selects the file."),
                       ("programmer.program", "PROGRAM SELECT 1-8", "Selects a program in the bank."),
                       ("programmer.tune", "TUNE", "Microcomputer retunes the oscillators (2-8 s, panel dark)."),
                       ("programmer.a440", "A-440", "Crystal-referenced A-440 Hz tone for tuning."),
                       ("programmer.save_tape", "SAVE TO TAPE", "With RECORD held: saves the file (or bank, with BANK held) to cassette."),
                       ("programmer.load_tape", "LOAD FROM TAPE", "With RECORD held: loads a file or bank; on its own, verifies a save.")):
    par(pid, "programmer", label, "boolean", fn, "none", "push_button")
par("programmer.file", "programmer", "Program file", "enum", "Active 40-program file (display decimal points show 2 or 3).", "global", values=[{"value": 1}, {"value": 2}, {"value": 3}],
    access=[{"type": "gesture", "gesture": "hold BANK and press PROGRAM SELECT 1, 2 or 3", "when": "any_time"}])
par("programmer.scale_mode", "programmer", "Scale Mode", "boolean", "Turns the twelve middle-row knobs into ±half-semitone adjusters for C to B; scale programs live in program locations.", "none",
    access=[{"type": "gesture", "gesture": "hold a PROGRAM SELECT and press TUNE (toggles Patch and Scale Mode)", "when": "any_time"}])
par("programmer.voice_defeat", "kbd", "Voice defeat", "boolean", "Removes a faulty voice from assignment until power-off.", "none",
    access=[{"type": "gesture", "gesture": "hold the key the voice is playing, hold PROGRAM SELECT 1 and press PROGRAM SELECT 8", "when": "any_time"}])
par("programmer.record_enable", "programmer", "RECORD ENABLE/DISABLE", "enum", "Back-panel memory protect; DISABLE for saving to tape, ENABLE for recording or loading.", "none",
    values=[{"value": "enable"}, {"value": "disable"}], access=[{"type": "rear_panel", "control": "toggle_switch"}])
par("sys.line_voltage", "out", "Line voltage selector", "enum", "115 or 230 V AC (change the fuse too).", "none", values=[{"value": "115V"}, {"value": "230V"}],
    access=[{"type": "rear_panel", "control": "slide_switch"}])

# ---------------------------------------------------------------- ports
jack("jack.audio_out", "AUDIO OUT", "out", "audio", "out.audio", "Mono audio output.", "6.35 mm TS")
jack("jack.release_fs", "RELEASE FOOTSWITCH", "in", "gate", "kbd.release_fs", "Supplied footswitch: acts as the RELEASE switch when RELEASE is programmed off (like a sustain pedal).", "6.35 mm TS")
jack("jack.amp_cv", "AMPLIFIER", "in", "cv", "out.cv", "Volume control voltage up to +10 V (e.g. Model 840 pedal); VOLUME still works.", "6.35 mm TS")
jack("jack.filter_cv", "FILTER", "in", "cv", "vcf.cutoff_cv", "Added to CUTOFF, up to +10 V.", "6.35 mm TS", combine="sum")
jack("jack.seq_voltage_in", "VOLTAGE IN", "in", "cv", "kbd.ext_cv", "1 V/oct to voice 5 (digitised on each new gate, so no glide).", "6.35 mm TS")
jack("jack.seq_voltage_out", "VOLTAGE OUT", "out", "cv", "kbd.cv_out", "1 V/oct of each note played, for the Model 800 sequencer or other synths.", "6.35 mm TS")
jack("jack.seq_gate_in", "GATE IN", "in", "gate", "kbd.ext_gate", "Gate above +3.5 V; any plug here takes voice 5 off the keyboard.", "6.35 mm TS")
jack("jack.seq_trigger_out", "TRIGGER OUT", "out", "gate", "kbd.gate_out", "Actually a +15 V gate.", "6.35 mm TS")
jack("jack.analog", "ANALOG", "in", "cv", "wheels.pitch_cv_in", "5-pin connector: pitch wheel CV (pin 4, ± about 0 V for A-440), mod wheel CV (pin 2, 0 to +10 V), ±22 V supplies; for the Model 1001 remote keyboard.",
     "5-pin Switchcraft SL-17-5F")
jack("jack.analog_mod", "ANALOG (mod wheel pin)", "in", "cv", "wheels.mod_cv_in", "Pin 2 of the ANALOG connector: mod wheel CV, 0 to +10 V; never negative.", "5-pin Switchcraft SL-17-5F")
jack("jack.digital", "DIGITAL", "bidirectional", "midi", "kbd.digital_in", "SCI serial interface, 5 V TTL, up to 625 kbaud, for the Model 1005 polyphonic sequencer: keyboard, program, transpose and program-file transfer. Not RS-232, not MIDI.",
     "4-pin Switchcraft SL-17-4F")
jack("jack.cassette_out", "CASSETTE OUT", "out", "audio", None, "To a recorder's MIC or LINE input.", "3.5 mm TS", confidence="inferred", note="Connector size not stated.")
jack("jack.cassette_in", "CASSETTE IN", "in", "audio", None, "From a recorder's EAR or MONITOR output.", "3.5 mm TS", confidence="inferred")
jack("jack.power", "AC power", "in", "power", None, "115/230 V AC, three-prong grounded; fuse 3A slow-blow (115 V) or 1/2 A slow-blow (230 V).", "IEC or captive cord", confidence="inferred",
     note="Connector type not stated.")

# ---------------------------------------------------------------- connections
con("kbd.cv", "osc_a.pitch_cv", note="Includes GLIDE in unison.")
con("kbd.cv", "osc_b.pitch_cv", on("osc_b.keyboard"))
con("kbd.cv", "vcf.cutoff_cv", on("vcf.keyboard"))
con("wheels.pitch", "osc_a.pitch_cv")
con("wheels.pitch", "osc_b.pitch_cv")
con("kbd.gate", "env_f.gate", "gate")
con("kbd.gate", "env_a.gate", "gate")
con("osc_b.out", "osc_a.sync_in", "sync", on("osc_a.sync"))
con("osc_a.out", "mixer.a", "audio", amount="mixer.osc_a")
con("osc_b.out", "mixer.b", "audio", amount="mixer.osc_b")
con("noise.out", "mixer.noise", "audio", amount="mixer.noise")
con("mixer.out", "vcf.in", "audio")
con("env_f.out", "vcf.cutoff_cv", amount="vcf.env_amount")
con("vcf.out", "vca.in", "audio")
con("env_a.out", "vca.cv")
con("env_f.out", "pmod.env", amount="pmod.filt_env")
con("osc_b.out", "pmod.osc_b", amount="pmod.osc_b")
con("pmod.out", "osc_a.pitch_cv", on("pmod.freq_a"))
con("pmod.out", "osc_a.pw_cv", on("pmod.pw_a"))
con("pmod.out", "vcf.cutoff_cv", on("pmod.filter"))
con("lfo.out", "wmod.lfo")
con("pink.out", "wmod.noise")
con("wheels.mod", "wmod.wheel", note="Depth from 0 (wheel down) to maximum.")
for k, dst in (("freq_a", "osc_a.pitch_cv"), ("freq_b", "osc_b.pitch_cv"), ("pw_a", "osc_a.pw_cv"), ("pw_b", "osc_b.pw_cv"), ("filter", "vcf.cutoff_cv")):
    con("wmod.out", dst, on(f"wmod.{k}"))
con("vca.out", "out.in", "audio", amount="out.volume", note="All five voices summed.")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "display", "module": "programmer", "label": "numeric display", "kind": "display", "function": "Bank and program; decimal points show file 2 (after bank) or 3 (after program)."},
    {"id": "switch_leds", "module": "programmer", "label": "switch LEDs", "kind": "led", "function": "Programmed switch states; program select and record status; cassette status (LOAD FROM TAPE blinks on error)."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Preset, manual and edit", "applies_to": ["programmer"],
     "rule": "PRESET plays stored programs; moving a knob takes that parameter live (others keep the program's values, so knob positions do not show the program). Pressing the program again restores it. MANUAL plays the panel exactly as set. Black controls are programmable; silver knobs and grey switches are not."},
    {"id": "b02", "name": "Recording programs", "applies_to": ["programmer"],
     "rule": "Back-panel switch to ENABLE, press RECORD, choose file and bank if needed, then press a PROGRAM SELECT to store; RECORD off cancels."},
    {"id": "b03", "name": "Voice assignment", "applies_to": ["kbd"],
     "rule": "Last-note priority: a sixth key steals the earliest-used voice; a repeated key reuses its voice. UNISON puts all five voices on the lowest key (four with the sequencer interface), with GLIDE. A plug in GATE IN takes voice 5 for the sequencer."},
    {"id": "b04", "name": "Poly-Mod", "applies_to": ["pmod", "osc_a", "osc_b", "env_f"],
     "rule": "Within each voice, the filter envelope and OSC B (often in LO FREQ) modulate OSC A frequency, OSC A pulse width and/or the filter. Small differences between voices make each note slightly different; audio-rate OSC B gives bells, clangs and ring-mod-like sounds."},
    {"id": "b05", "name": "Wheel-Mod", "applies_to": ["wmod", "lfo", "pink"],
     "rule": "SOURCE MIX blends LFO and pink noise; the mod wheel sets the amount, the same for every voice, to any of OSC A frequency, OSC B frequency, OSC A pulse width, OSC B pulse width and filter."},
    {"id": "b06", "name": "Tuning", "applies_to": ["kbd", "osc_a", "osc_b"],
     "rule": "The microcomputer tunes all oscillators at power-on and when TUNE is pressed; allow about 20 minutes to stabilise. A-440 gives a crystal reference. Extreme oscillator FREQUENCY settings are quantised in semitones; MASTER TUNE sets exact pitch."},
    {"id": "b07", "name": "Program files", "applies_to": ["programmer"],
     "rule": "120 programs in three files of 40 (banks 1-5 x programs 1-8); one file at a time. Hold BANK and press PROGRAM SELECT 1-3 to change file. Files or single banks save to and load from cassette (about 40 s, with verification)."},
    {"id": "b08", "name": "Scale Mode", "applies_to": ["programmer"],
     "rule": "Hold a PROGRAM SELECT and press TUNE: the twelve middle-row knobs (LFO FREQ to AMP RELEASE) retune C to B by up to half a semitone each; the result is stored as a Scale program in an ordinary location. Select an equal-tempered Scale program before returning to Patch Mode."},
    {"id": "b09", "name": "Release footswitch", "applies_to": ["env_a"], "rule": "With RELEASE programmed off, the footswitch turns the programmed release on while held, like a sustain pedal."},
]
D["midi"] = {
    "receives": [], "transmits": [],
    "note": ("No MIDI (pre-dates it). The SCI DIGITAL interface (synchronous serial, odd parity, up to 625 kHz) answers 13 status bytes from a sequencer: send or receive the 61-key keyboard map plus "
             "bank/program, transpose, and program-file transfer (40 programs x 24 bytes)."),
    "program_format": {
        "bytes_per_program": 24, "file_bytes": 960,
        "pots_7bit": ["FILT ATK", "FILT DEC", "FILT SUS", "FILT REL", "AMP ATK", "AMP DEC", "AMP SUS", "AMP REL", "FILTER CUTOFF", "FILT ENV AMT", "MIX OSC B", "OSC B PW", "MIX OSC A", "OSC A PW",
                      "MIX NOISE", "FILT RESONANCE", "GLIDE", "LFO FREQ", "W-MOD SOURCE MIX", "P-MOD OSC B", "P-MOD FILT ENV", "OSC A FREQ", "OSC B FREQ", "OSC B FINE"],
        "switch_bits": ["OSC A PULSE", "OSC A SAW", "OSC A SYNC", "OSC B SAW", "OSC B TRI", "OSC B PULSE", "OSC B KBD", "UNISON", "POLY-MOD FREQ A", "POLY-MOD PW A", "POLY-MOD FILT", "LFO SAW",
                        "LFO TRI", "LFO SQUARE", "FILT KBD", "RELEASE", "W-MOD FREQ A", "W-MOD FREQ B", "W-MOD PW A", "W-MOD PW B", "W-MOD FILT", "OSC B LO FREQ"],
        "note": "Each byte holds one pot value (bits 0-6) and one switch (bit 7); the exact byte pairing is in the manual's table, partly garbled by OCR, so the lists are given in order."},
}
D["specifications"] = {
    "voices": 5, "keyboard": "61 keys, C0-C5", "oscillators_per_voice": 2, "filter": "24 dB/oct resonant low-pass", "envelopes": "2 x ADSR per voice, about 1 ms-30 s",
    "lfo_hz": [0.04, 20], "osc_b_lo_freq_hz": [0.4, 30], "pitch_wheel": "about a fifth either way", "programs": "120 (3 files x 40)",
    "inputs": ["release footswitch", "amplifier CV (to +10 V)", "filter CV (to +10 V)", "sequencer voltage in and gate in (+3.5 V)", "ANALOG (pitch and mod wheel CVs)", "DIGITAL", "cassette in"],
    "outputs": ["audio out", "sequencer voltage out (1 V/oct) and trigger out (+15 V gate)", "cassette out"],
    "power": "115/230 V AC selectable; fuse 3A slow-blow or 1/2 A slow-blow",
}
D["omitted_from_source"] = ["bibliography", "panel blanks", "factory program diagrams (images)", "cassette troubleshooting beyond the procedure", "keyboard intonation history"]
D["not_in_source"] = ["voice chips and circuit revisions", "dimensions and weight", "audio output level", "whether noise is generated per voice", "factory program names (images in the scan)",
                      "Wheel-Mod and Poly-Mod panel labels (taken from the program format, as the panel figures are images)"]
D["source_inconsistencies"] = [
    "Voice defeat cross-references 'paragraph 18' for the sequencer interface; the manual numbers it 1-8.",
    "The bank-save procedure says to select the bank before the one to save, and 'to record BANK 1, select BANK 5', relying on wrap-around.",
    "The loading procedure's step 7 says 'if saving a bank only' in a loading section.",
    "OSC A SYNC: the text says OSC A follows OSC B; in a sync patch OSC A is the one heard, so OSC B sets the pitch range.",
]
D["modelling_gaps"] = [
    {"topic": "OCR quality", "detail": "The scan's text layer is rough; values are taken where legible, and the program byte table is listed in order rather than byte by byte."},
    {"topic": "Later revisions", "detail": "Rev 1 and 2 (40 programs, SSM chips) and the 2020 Rev 4 differ; this file models Rev 3.3 as the manual describes."},
    {"topic": "Scale Mode", "detail": "Scale programs reuse twelve knob values as tuning offsets; modelled as a mode, not separate parameters."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/sequential-circuits-prophet-5-rev3_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
