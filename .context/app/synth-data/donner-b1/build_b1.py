#!/usr/bin/env python3
"""Assemble the Donner Essential B1 device file (schema 0.11.0).

A TB-303-style analogue bass voice (one VCO, resonant low-pass VCF, decay envelope,
accent) with saturation and delay, a 16-step sequencer storing 128 patterns, an
arpeggiator, a 26-key touch keyboard whose white keys double as step buttons, MIDI,
USB and sync. Knob settings are not stored or MIDI-controllable; pattern data is.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.11.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory, access, ref=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    p["access"] = access
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


KNOB = [{"type": "panel", "control": "knob"}]
SW = [{"type": "panel", "control": "toggle_switch"}]
BTN = [{"type": "panel", "control": "push_button"}]


def app_sysex(packet, power_on=None):
    a = [{"type": "app", "note": "Donner / Rantion MIDI Center app"}, {"type": "sysex", "message": f"packet {packet}", "header": "F0 00 60 50 00 00 05 DID"}]
    if power_on:
        a.append({"type": "gesture", "gesture": power_on, "when": "power_on"})
    return a


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "donner-b1", "manufacturer": "Donner", "model": "Essential B1 Analog Bass Sequencer",
    "category": "monophonic analogue bass synthesizer with 16-step sequencer, arpeggiator, saturation and delay",
    "based_on": "Inspired by the Roland TB-303 (modelled separately as roland-tb-303), with a redesigned sequencer and keyboard; released 2022.",
    "sources": [
        {"id": "manual", "title": "Donner B1 Analog Bass Sequencer User Manual (Rev 2.0)", "kind": "user_manual", "file": "Donner_B1_User_Manual.pdf", "pages": 112,
         "note": "Multilingual; English pages 1-18: panel, octave and tempo, pattern creation, playback, step edit, arpeggiator, MIDI, sync, power-on commands, app, SysEx table, specifications."},
        {"id": "sos", "title": "Sound On Sound, 'Donner Essential B1' review", "kind": "other", "file": "https://www.soundonsound.com/reviews/donner-essential-b1",
         "note": "One VCO, low-pass VCF, VCA with a simple decay envelope that runs filter and VCA; delay up to about half a second."},
        {"id": "musicradar", "title": "MusicRadar, 'Donner B1 Analog Bass Sequencer review'", "kind": "other", "file": "https://www.musicradar.com/reviews/donner-b1-analog-bass-sequencer",
         "note": "Filter and resonance behave like a TB-303's; the delay is a tape delay emulation."},
        {"id": "hilowitz", "title": "David Hilowitz review (transcript on Donner's site)", "kind": "other",
         "file": "https://uk.donnermusic.com/blogs/buying-guide/donner-b1-synthesizer-review-by-david-hilowitz-an-impressive-bass-synth",
         "note": "Four-octave note range; MIDI notes above velocity 96 play accented; class-compliant USB MIDI, not USB powered."},
        {"id": "donner_reviews", "title": "Customer reviews on Donner's product pages", "kind": "other", "file": "https://us.donnermusic.com/products/donner-synthesizer-and-sequencer-analog-bass-b1",
         "note": "Panel knobs send and receive no MIDI CCs."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 1, "polyphony_mode": "monophonic; key priority low, high or last",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "128 patterns store the sequence: per-step note, gate length, accent, slide and ratchet, plus tempo, length and transpose. Knob settings are not stored.",
    "semi_modular": False, "panel_counts": {"knobs": 12, "switches": 3, "buttons": 15, "keys": 26, "step_keys": 16, "display_digits": 3},
    "summary": ("An analogue TB-303-style voice: one VCO (saw or square) with a ±fifth pitch knob, a resonant low-pass VCF, one decay envelope to the filter (DEPTH) "
                "and VCA, and accent. After it, a saturation stage (drive, tone) and a delay (level, time, feedback), each switchable, then MASTER. An AUX input "
                "mixes with the output. A 26-key touch keyboard plays it directly, drives an eight-mode arpeggiator, or enters patterns into a 16-step sequencer with "
                "gate length, accent, slide and ratchet per step; the 16 white keys are also the step buttons."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and note control", "KEYBOARD",
    "26 touch keys (B1-C4) with octave shift; plays the voice, transposes the sequencer live (C3 centre, ±12) and feeds the arpeggiator. Mono with key priority and multi-trigger, slide or legato.",
    ["kbd.midi_in", "kbd.seq_in"], ["kbd.pitch", "kbd.gate", "kbd.accent"], props={"keys": 26, "note_range_octaves": 4})
mod("seq", "sequencer", "Sequencer and arpeggiator", "SEQUENCER",
    "16-step sequencer, 128 patterns, with per-step note, gate length (0-8 eighths), accent, slide and ratchet (1-4); live accent, slide, ratchet, gate and mute while playing. "
    "Eight-mode arpeggiator. Clock internal, MIDI, USB, sync input, or automatic.",
    ["seq.clock_in"], ["seq.notes", "seq.clock_out"], props={"steps": 16, "patterns": 128, "tempo_bpm": [40, 240]})
mod("vco", "oscillator", "VCO", "VOICE", "One analogue oscillator, sawtooth or square, with a centre-detented PITCH knob spanning a fifth either way.", ["vco.pitch_cv"], ["vco.out"])
mod("vcf", "filter", "VCF", "VOICE", "Resonant analogue low-pass filter with TB-303-like character; the envelope sweeps it by DEPTH and accent brightens it.", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"])
mod("env", "envelope", "Envelope", "VOICE", "One decay envelope, retriggered by each note, driving the filter (by DEPTH) and the VCA; no release stage.", ["env.gate"], ["env.out"])
mod("vca", "vca", "VCA", "VOICE", "Shapes each note with the envelope; accented steps play louder.", ["vca.in", "vca.cv"], ["vca.out"])
mod("sat", "overdrive", "Saturation", "EFFECTS", "Switchable distortion with DRIVE (gain) and TONE (brightness).", ["sat.in"], ["sat.out"])
mod("dly", "delay", "Delay", "EFFECTS", "Switchable delay with LEVEL, TIME (up to about 0.5 s) and FEEDBACK (one repeat at minimum).", ["dly.in"], ["dly.out"],
    props={"type": "digital, tape-style (MusicRadar)", "time_s_max": 0.5})
mod("out", "output", "Output", "MASTER", "MASTER sets the level at MAIN OUT and PHONES; the AUX input is mixed in.", ["out.in", "out.aux"], ["out.main", "out.phones"])

# ---------------------------------------------------------------- parameters: panel (not stored)
par("vco.wave", "vco", "WAVE", "enum", "Sawtooth or square.", "none", SW, 5, values=[{"value": "saw"}, {"value": "square"}])
par("vco.pitch", "vco", "PITCH", "continuous", "Oscillator tuning, up to a fifth down (left) or up (right); centre detent.", "none", KNOB, 6, physical={"min": -7, "max": 7, "unit": "semitones"})
par("vcf.cutoff", "vcf", "CUTOFF", "continuous", "Filter cutoff.", "none", KNOB, 7, panel_scale=S10)
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Emphasis at cutoff.", "none", KNOB, 8, panel_scale=S10)
par("vcf.depth", "vcf", "DEPTH", "continuous", "Envelope depth on cutoff.", "none", KNOB, 9, panel_scale=S10)
par("env.decay", "env", "DECAY", "continuous", "Envelope decay time.", "none", KNOB, 10, panel_scale=S10)
par("vca.accent", "vca", "ACCENT", "continuous", "Strength of accent on accented notes (volume and brightness).", "none", KNOB, 11, panel_scale=S10)
par("sat.on", "sat", "SATURATION", "boolean", "Saturation on or off.", "none", SW, 12)
par("sat.drive", "sat", "DRIVE", "continuous", "Distortion gain.", "none", KNOB, 13, panel_scale=S10)
par("sat.tone", "sat", "TONE", "continuous", "Distortion brightness.", "none", KNOB, 14, panel_scale=S10)
par("dly.on", "dly", "DELAY", "boolean", "Delay on or off.", "none", SW, 15)
par("dly.level", "dly", "LEVEL", "continuous", "Delay level.", "none", KNOB, 16, panel_scale=S10)
par("dly.time", "dly", "TIME", "continuous", "Delay time.", "none", KNOB, 17, panel_scale=S10)
par("dly.feedback", "dly", "FEEDBACK", "continuous", "Number of repeats; one at minimum.", "none", KNOB, 18, panel_scale=S10)
par("out.master", "out", "MASTER", "continuous", "Output and headphone level.", "none", KNOB, 19, panel_scale=S10)
par("sys.power", "out", "POWER", "boolean", "Power switch.", "none", [{"type": "rear_panel", "control": "slide_switch"}], 6)
# buttons (live)
for pid, label, fn in (("kbd.octave", "OCT", "Enters octave mode; ▲/▼ shift the keyboard range."),
                       ("seq.tap", "TEMPO TAP", "Tap 2-4 times for tempo, or press once and set 40-240 BPM with ▲/▼."),
                       ("seq.up", "▲", "Raises the value being set; otherwise steps to the next step."),
                       ("seq.down", "▼", "Lowers the value being set; otherwise steps to the previous step."),
                       ("kbd.hold", "HOLD", "Keyboard: holds the note. Sequencer: repeats the current step while held. Arpeggiator: latches."),
                       ("seq.rec_edit", "REC/EDIT", "Record mode (step-write); hold with a step key for step edit."),
                       ("seq.clear_rest", "CLEAR/REST", "Enters a rest; hold 2 s to initialise the pattern; hold while playing to mute."),
                       ("seq.play_stop", "PLAY/STOP", "Starts or stops the sequencer."),
                       ("seq.pattern", "PATTERN", "Pattern select, 1-128; hold 2 s to reload the current pattern."),
                       ("seq.save", "SAVE", "Saves the pattern to the current or a chosen slot (press SAVE twice); hold 2 s to cancel."),
                       ("seq.arp", "ARP", "Arpeggiator on or off; ▲/▼ choose the mode.")):
    par(pid, "seq" if pid.startswith("seq") else "kbd", label, "boolean", fn, "none", BTN)
par("kbd.accent_btn", "kbd", "ACCENT (button)", "boolean", "Keyboard: accent on played notes. Record: accent on the step. Playback: hold for live accent. Arpeggiator: accent on every step.",
    "none", BTN)
par("seq.slide_btn", "seq", "SLIDE (button)", "boolean", "Record: slide from this step to the next. Playback: hold for live slide.", "none", BTN)
par("seq.gate_btn", "seq", "GATE LENGTH (button)", "boolean", "Opens gate length setting; hold while playing for live gate length.", "none", BTN)
par("seq.ratchet_btn", "seq", "RATCHET (button)", "boolean", "Opens ratchet setting; hold while playing for live ratchet.", "none", BTN)
par("seq.arp_mode", "seq", "Arpeggio order", "enum", "Arpeggiator pattern.", "none", [{"type": "panel", "control": "push_button", "note": "ARP, then ▲/▼"}],
    values=[{"value": v} for v in ["up", "down", "down_up", "random", "up_plus_1oct", "down_plus_1oct", "up_minus_1oct", "down_minus_1oct"]],
    note="The manual labels the last four UP 2 (+1 Oct), DOWN 2 (+1 Oct), UP 3 (-1 Oct), DOWN 3 (-1 Oct).")
par("seq.arp_gate", "seq", "Arpeggio gate length", "integer", "Gate length for arpeggio notes, 1/8 to 8/8.", "none", [{"type": "panel", "control": "push_button", "note": "GATE LENGTH, then ▲/▼"}],
    range={"min": 1, "max": 8})
# pattern data (stored)
STEP = [{"type": "panel", "control": "push_button", "note": "REC/EDIT, then per step"}]
par("seq.step_note", "seq", "Step note", "integer", "Note of each step, entered from the keyboard (step-write advances automatically).", "patch", STEP, range={"min": 0, "max": 127},
    note="One value per step, 16 steps.")
par("seq.step_gate", "seq", "Step gate length", "integer", "Gate length per step in eighths: 0 = rest, 8 = tie (legato into the next step).", "patch", STEP, range={"min": 0, "max": 8})
par("seq.step_accent", "seq", "Step accent", "boolean", "Accent on the step.", "patch", STEP)
par("seq.step_slide", "seq", "Step slide", "boolean", "Slide from this step's pitch into the next.", "patch", STEP)
par("seq.step_ratchet", "seq", "Step ratchet", "integer", "Repeats within the step; ignored on slide or tie steps.", "patch", STEP, range={"min": 1, "max": 4})
par("seq.tempo", "seq", "Tempo", "integer", "Pattern tempo.", "patch", [{"type": "panel", "control": "push_button", "note": "TEMPO TAP"}, {"type": "app"}],
    range={"min": 40, "max": 240})
par("seq.length", "seq", "Sequence length", "integer", "Pattern length in steps.", "patch", [{"type": "app", "note": "SEQ length"}], range={"min": 1, "max": 16})
par("seq.transpose", "seq", "Pattern transpose", "integer", "Stored transpose for the pattern (live transpose from the keyboard is not saved).", "patch", [{"type": "app"}], range={"min": -12, "max": 12})
# global settings
par("sys.midi_tx", "kbd", "MIDI OUT channel", "integer", "Transmit channel.", "global", app_sysex("0E", "hold step key 1-16 while powering on (sets in and out)"), range={"min": 1, "max": 16})
par("sys.midi_rx", "kbd", "MIDI IN channel", "integer", "Receive channel (16 in SysEx = all channels).", "global", app_sysex("0E", "hold step key 1-16 while powering on (sets in and out)"),
    range={"min": 1, "max": 16})
par("sys.midi_in_transpose", "kbd", "MIDI IN transpose", "integer", "Transposes incoming notes.", "global", app_sysex("0F"), range={"min": -12, "max": 12})
par("sys.key_priority", "kbd", "Key priority", "enum", "Which held key sounds.", "global", app_sysex("12", "hold F#3 (low), G#3 (high) or A#3 (last) while powering on"),
    values=[{"value": "low"}, {"value": "high"}, {"value": "last"}])
par("sys.multi_trigger", "kbd", "Multi trigger", "enum", "Overlapping notes retrigger (on), glide (off, slide) or play legato (off, legato).", "global",
    app_sysex("14", "hold F#2 (slide), G#2 (on) or A#2 (legato) while powering on"), values=[{"value": "off_slide"}, {"value": "on"}, {"value": "off_legato"}])
par("sys.forwarding", "kbd", "MIDI forwarding", "enum", "Where keyboard, sequencer, arpeggiator and real-time (clock) messages are sent; set separately for each.", "global", app_sysex("17"),
    values=[{"value": "off"}, {"value": "din"}, {"value": "usb"}, {"value": "both"}], default="both")
par("sys.sync_polarity", "seq", "Sync polarity", "enum", "Edge used at SYNC IN and SYNC OUT.", "global", app_sysex("19"), values=[{"value": "fall"}, {"value": "rise"}], default="rise")
par("sys.sync_rate", "seq", "Sync rate", "enum", "Pulses per step or quarter note at SYNC IN/OUT.", "global", app_sysex("1A"),
    values=[{"value": "1PPS"}, {"value": "2PPQ"}, {"value": "24PPQ"}, {"value": "48PPQ"}], default="24PPQ")
par("sys.clock_source", "seq", "Clock source", "enum", "Internal, MIDI DIN, USB, SYNC IN (TRG) or automatic.", "global",
    app_sysex("1B", "hold C#2 (internal), D#2 (DIN), C#3 (USB) or D#3 (TRG) while powering on"),
    values=[{"value": "internal"}, {"value": "midi"}, {"value": "usb"}, {"value": "trig"}, {"value": "automatic"}], default="automatic")
par("sys.accent_threshold", "kbd", "Accent velocity threshold", "integer", "Incoming notes above this velocity play accented; 127 disables.", "global", app_sysex("1C"),
    range={"min": 0, "max": 127}, default=96)
par("sys.soft_thru", "kbd", "MIDI soft through", "enum", "Forwarding of incoming MIDI between ports (each enabled separately).", "global", app_sysex("28"),
    values=[{"value": "din_to_usb"}, {"value": "din_to_din"}, {"value": "usb_to_din"}])
par("sys.local", "kbd", "Local control", "enum", "Whether the keyboard, DIN input and USB input play the internal voice (each enabled separately).", "global", app_sysex("2F"),
    values=[{"value": "keyboard"}, {"value": "din"}, {"value": "usb"}])
par("sys.pattern_wait", "seq", "Pattern waiting", "boolean", "A newly chosen pattern waits for the current one to finish.", "global", app_sysex("32"), default=True)
par("sys.device_id", "kbd", "SysEx device ID", "integer", "Device ID in SysEx messages; 0 addresses all.", "global", [{"type": "app"}], range={"min": 0, "max": 127})
par("util.factory_reset", "kbd", "Factory reset", "enum", "Resets settings, optionally erasing all patterns.", "none",
    [{"type": "gesture", "gesture": "hold B1, C2, D2 and E2 while powering on (settings only)", "when": "power_on"},
     {"type": "gesture", "gesture": "hold G3, A3 and C4 while powering on (settings and all patterns)", "when": "power_on"},
     {"type": "sysex", "message": "packet 7D (settings)"}, {"type": "app"}], values=[{"value": "settings"}, {"value": "settings_and_patterns"}])

# ---------------------------------------------------------------- ports
jack("jack.main_out", "MAIN OUT", "out", "audio", "out.main", "Line output, unbalanced, max +16 dBu, 1.5 kohm.", "6.35 mm TS")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones, max 125 mW into 32 ohm.", "3.5 mm TRS", location="front")
jack("jack.aux_in", "AUX IN", "in", "audio", "out.aux", "External audio mixed with the B1 at the outputs; max +5 dBu.", "3.5 mm TS", location="front")
jack("jack.sync_in", "SYNC IN", "in", "clock", "seq.clock_in", "Clock or start/stop pulses, above 2.5 V; needs clock source TRG or AUTO.", "3.5 mm TS", location="front")
jack("jack.sync_out", "SYNC OUT", "out", "clock", "seq.clock_out", "Clock pulses, always on.", "3.5 mm TS", location="front")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "Notes, clock and SysEx.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "Keyboard, sequencer and arpeggiator notes and clock.", "5-pin DIN")
jack("jack.usb", "USB-C", "bidirectional", "midi", None, "Class-compliant USB MIDI and firmware updates; does not power the unit.", "USB-C")
jack("jack.power", "POWER INPUT", "in", "power", None, "9 V DC 500 mA, centre positive.", "DC barrel")

# ---------------------------------------------------------------- connections
con("seq.notes", "kbd.seq_in", "cv", note="Sequencer or arpeggiator notes, transposed live from the keyboard.")
con("kbd.pitch", "vco.pitch_cv", "cv", note="Slide steps and multi-trigger off (slide) glide between pitches.")
con("kbd.gate", "env.gate", "gate")
con("env.out", "vcf.cutoff_cv", "cv", amount="vcf.depth")
con("env.out", "vca.cv", "cv", confidence="inferred", note="Sound On Sound: the envelope runs the filter and VCA.")
con("kbd.accent", "vcf.cutoff_cv", "cv", amount="vca.accent", note="Accent adds brightness.")
con("kbd.accent", "vca.cv", "cv", amount="vca.accent", note="Accent adds volume.")
con("vco.out", "vcf.in", "audio")
con("vcf.out", "vca.in", "audio")
con("vca.out", "sat.in", "audio", note="Passes unchanged with SATURATION off.", confidence="inferred")
con("sat.out", "dly.in", "audio", note="Passes dry with DELAY off.", confidence="inferred")
con("dly.out", "out.in", "audio", amount="out.master", confidence="inferred")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "display", "module": "seq", "label": "LED display", "kind": "display", "function": "Tempo, pattern, octave, gate length, ratchet and arpeggio mode."},
    {"id": "step_leds", "module": "seq", "label": "step LEDs 1-16", "kind": "led", "function": "Current step flashes; dark steps are rests."},
    {"id": "button_leds", "module": "seq", "label": "button indicators", "kind": "led", "function": "Lit or flashing on OCT, TEMPO TAP, ACCENT, HOLD, REC/EDIT, GATE LENGTH, SLIDE, RATCHET, SAVE, PATTERN, PLAY/STOP and ARP."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Voice", "applies_to": ["vco", "vcf", "env", "vca"],
     "rule": "One VCO (saw or square) into a resonant low-pass filter and VCA. One decay envelope opens the filter by DEPTH and shapes the VCA; there is no release. "
             "Accented notes are louder and brighter by ACCENT. The filter passes some mid-range even at its lowest cutoff, as on a TB-303 (MusicRadar)."},
    {"id": "b02", "name": "Pattern entry (step-write)", "applies_to": ["seq"],
     "rule": "REC/EDIT, then each key enters a note and advances; CLEAR/REST enters a rest. Before each note set GATE LENGTH (0 rest to 8 tie), ACCENT, SLIDE (into the next step) "
             "or RATCHET (1-4 repeats). A new note takes the previous step's gate length. Hold REC/EDIT with a step key to edit one step, playing or not."},
    {"id": "b03", "name": "Playback", "applies_to": ["seq", "kbd"],
     "rule": "PLAY/STOP loops the pattern. Keys transpose live (C3 centre, ±12, notes out of range muted). Holding HOLD repeats the step; holding ACCENT, SLIDE, RATCHET or GATE LENGTH "
             "applies that to every step; holding CLEAR/REST mutes. Holding a step key 2 s toggles its rest. None of the live changes are saved."},
    {"id": "b04", "name": "Saving and loading", "applies_to": ["seq"],
     "rule": "Edits are lost unless saved: SAVE, choose 1-128 with ▲/▼, SAVE again. The last pattern loads at power-on. A pattern chosen while playing starts after the current one ends, unless pattern waiting is off."},
    {"id": "b05", "name": "Arpeggiator", "applies_to": ["seq"],
     "rule": "ARP on: held keys play in one of eight orders at the set tempo and octave; HOLD latches, GATE LENGTH sets note length (1-8), ACCENT accents every step."},
    {"id": "b06", "name": "Sync", "applies_to": ["seq"],
     "rule": "SYNC OUT always sends clock. SYNC IN needs clock source TRG or AUTO. Rate 1PPS (one step per pulse), 2PPQ (Korg), 24PPQ or 48PPQ; polarity rise or fall."},
    {"id": "b07", "name": "MIDI", "applies_to": ["kbd"],
     "rule": "Notes in play the voice; above the accent threshold (default 96) they are accented. Keyboard, sequencer and arpeggiator notes and clock are sent to DIN, USB or both. "
             "Local control can disconnect the keyboard or either input from the voice. Panel knobs send and receive no MIDI."},
    {"id": "b08", "name": "Effects order", "applies_to": ["sat", "dly", "out"],
     "rule": "Saturation then delay, each switchable, then MASTER; AUX IN is mixed at the output.", "confidence": "inferred",
     "note": "The manual does not state the order; it follows the panel layout."},
]
D["midi"] = {
    "receives": [{"message": "note_on", "note": "velocity above the accent threshold sets accent"}, {"message": "note_off"}, {"message": "clock", "note": "when clock source is MIDI, USB or automatic"},
                 {"message": "start"}, {"message": "stop"},
                 {"message": "sysex", "header": "F0 00 60 50 00 00 05 DID", "packets": {"0E": "MIDI channels", "0F": "MIDI in transpose", "12": "key priority", "14": "multi trigger",
                                                                                         "17": "MIDI forwarding", "19": "sync polarity", "1A": "sync rate", "1B": "clock source",
                                                                                         "1C": "accent threshold", "28": "soft through", "2F": "local control", "32": "pattern waiting",
                                                                                         "7D": "factory reset"}}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "clock"}],
    "channel_note": "Separate in and out channels 1-16; set in the app, by SysEx, or with a step key at power-on.",
    "note": "No control changes: the panel is not on MIDI. Start/stop handling is assumed from the clock source options; the manual lists no MIDI implementation chart."}
D["specifications"] = {
    "voices": 1, "type": "analogue", "oscillators": 1, "vcf": "1 low-pass", "envelopes": 1, "keyboard": "26 touch keys, B1-C4, 4-octave range with octave shift",
    "sequencer": {"steps": 16, "patterns": 128, "tempo_bpm": [40, 240], "gate_eighths": [0, 8], "ratchet": [1, 4]}, "arpeggiator_modes": 8,
    "outputs": {"line": "1/4\", unbalanced, max +16 dBu, 1.5 kohm", "phones": "3.5 mm TRS, max 125 mW into 32 ohm, 10 ohm"},
    "inputs": {"aux": "3.5 mm TS, max +5 dBu", "sync_in": "3.5 mm TS, above 2.5 V"},
    "connectivity": {"midi": "5-pin DIN in and out", "usb": "USB 2.0 type C, class compliant"},
    "power": {"adaptor": "9 V DC 500 mA, centre positive", "consumption_w": 2.25}, "dimensions_mm": {"h": 54, "w": 323, "d": 130}, "weight_kg": 0.66,
}
D["omitted_from_source"] = ["safety, FCC and warranty text", "non-English translations", "app screenshots beyond the settings they show"]
D["not_in_source"] = ["filter slope and circuit", "VCO frequency range and the pitch range the keyboard covers in Hz", "envelope and delay times (delay about 0.5 s per Sound On Sound)",
                      "whether the delay is analogue or digital (reviewers say digital, tape-style)", "effects order", "MIDI start/stop and song position handling", "the per-step data layout"]
D["source_inconsistencies"] = [
    "MAIN OUT is a 1/4\" TS mono connector in the panel description but '1/4\" TRS, unbalanced' in the specifications.",
    "The arpeggiator gate length runs 1-8, the sequencer step gate length 0-8 (0 being a rest).",
    "The live gate length note says 'Live ratchet will not be saved', a copy of the line above it.",
    "The spec sheet lists the power switch as a slide switch; the panel description just says power on/off.",
]
D["modelling_gaps"] = [
    {"topic": "Per-step data", "detail": "Step note, gate, accent, slide and ratchet are modelled as one parameter each, standing for 16 values per pattern."},
    {"topic": "Settings with several flags", "detail": "MIDI forwarding, soft through and local control hold one value per port or source; modelled as single enums with notes."},
    {"topic": "TB-303 comparison", "detail": "Not a circuit copy: the sequencer, keyboard and effects are Donner's own; reviewers find the filter close to a TB-303's."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/donner-b1_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
