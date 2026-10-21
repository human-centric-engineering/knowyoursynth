#!/usr/bin/env python3
"""Assemble the Yamaha DX7 device file (schema 0.11.0).

Six operators per voice, 16 voices, 32 algorithms. The algorithms section carries the
operator routing; connections carry everything else (keyboard, pitch EG, LFO and
controller modulation, carrier summing). Every parameter is marked with where it lives:
patch (the 155-byte voice), global (FUNCTION mode) or none (live or edit-only).

Sources: the DX7 operation manual (1983, supplied), Ken Shirriff's reverse engineering
of the algorithm ROM (which confirms all 32 routings, carriers and feedback loops),
the DX7 MIDI data format sheet as transcribed online (SysEx layout), and factory voice
lists for ROM 1A.
"""
import json

D = {"schema_version": "0.11.0"}
M, P, J, C = [], [], [], []
OPS = [f"op{i}" for i in range(1, 7)]


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory, access, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
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


def edit(button, sysex=None, presses=None):
    """EDIT-mode access: select with a violet-labelled button, set with DATA ENTRY."""
    a = [{"type": "menu", "control": "push_button", "mode": "edit", "button": button,
          "note": f"EDIT, button {button}" + (f" (press {presses})" if presses else "") + ", then DATA ENTRY slider or -1/+1"}]
    if sysex is not None:
        a.append({"type": "sysex", "message": "parameter change, group 0", "parameter_number": sysex})
    return a


def func(button, sysex=None, note=None):
    a = [{"type": "menu", "control": "push_button", "mode": "function", "button": button,
          "note": note or f"FUNCTION, button {button}, then DATA ENTRY"}]
    if sysex is not None:
        a.append({"type": "sysex", "message": "parameter change, group 2", "parameter_number": sysex})
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


# ---------------------------------------------------------------- algorithms
# (carriers, modulation links as (from, to) operator numbers, feedback loop in signal order)
ALG = {
    1: ([1, 3], [(2, 1), (4, 3), (5, 4), (6, 5)], [6]),
    2: ([1, 3], [(2, 1), (4, 3), (5, 4), (6, 5)], [2]),
    3: ([1, 4], [(2, 1), (3, 2), (5, 4), (6, 5)], [6]),
    4: ([1, 4], [(2, 1), (3, 2), (5, 4), (6, 5)], [6, 5, 4]),
    5: ([1, 3, 5], [(2, 1), (4, 3), (6, 5)], [6]),
    6: ([1, 3, 5], [(2, 1), (4, 3), (6, 5)], [6, 5]),
    7: ([1, 3], [(2, 1), (4, 3), (5, 3), (6, 5)], [6]),
    8: ([1, 3], [(2, 1), (4, 3), (5, 3), (6, 5)], [4]),
    9: ([1, 3], [(2, 1), (4, 3), (5, 3), (6, 5)], [2]),
    10: ([1, 4], [(2, 1), (3, 2), (5, 4), (6, 4)], [3]),
    11: ([1, 4], [(2, 1), (3, 2), (5, 4), (6, 4)], [6]),
    12: ([1, 3], [(2, 1), (4, 3), (5, 3), (6, 3)], [2]),
    13: ([1, 3], [(2, 1), (4, 3), (5, 3), (6, 3)], [6]),
    14: ([1, 3], [(2, 1), (4, 3), (5, 4), (6, 4)], [6]),
    15: ([1, 3], [(2, 1), (4, 3), (5, 4), (6, 4)], [2]),
    16: ([1], [(2, 1), (3, 1), (4, 3), (5, 1), (6, 5)], [6]),
    17: ([1], [(2, 1), (3, 1), (4, 3), (5, 1), (6, 5)], [2]),
    18: ([1], [(2, 1), (3, 1), (4, 1), (5, 4), (6, 5)], [3]),
    19: ([1, 4, 5], [(2, 1), (3, 2), (6, 4), (6, 5)], [6]),
    20: ([1, 2, 4], [(3, 1), (3, 2), (5, 4), (6, 4)], [3]),
    21: ([1, 2, 4, 5], [(3, 1), (3, 2), (6, 4), (6, 5)], [3]),
    22: ([1, 3, 4, 5], [(2, 1), (6, 3), (6, 4), (6, 5)], [6]),
    23: ([1, 2, 4, 5], [(3, 2), (6, 4), (6, 5)], [6]),
    24: ([1, 2, 3, 4, 5], [(6, 3), (6, 4), (6, 5)], [6]),
    25: ([1, 2, 3, 4, 5], [(6, 4), (6, 5)], [6]),
    26: ([1, 2, 4], [(3, 2), (5, 4), (6, 4)], [6]),
    27: ([1, 2, 4], [(3, 2), (5, 4), (6, 4)], [3]),
    28: ([1, 3, 6], [(2, 1), (4, 3), (5, 4)], [5]),
    29: ([1, 2, 3, 5], [(4, 3), (6, 5)], [6]),
    30: ([1, 2, 3, 6], [(4, 3), (5, 4)], [5]),
    31: ([1, 2, 3, 4, 5], [(6, 5)], [6]),
    32: ([1, 2, 3, 4, 5, 6], [], [6]),
}
op = lambda n: f"op{n}"

D["device"] = {
    "id": "yamaha-dx7", "manufacturer": "Yamaha", "model": "DX7 Digital Programmable Algorithm Synthesizer",
    "category": "16-voice digital FM synthesizer, 61 keys with velocity and aftertouch",
    "based_on": "Original design, 1983, using John Chowning's FM synthesis licensed from Stanford; two custom chips (YM21280 OPS, YM21290 EGS).",
    "sources": [
        {"id": "manual", "title": "Yamaha DX7 Operation Manual", "kind": "user_manual", "file": "Yamaha_DX-7_Manual.pdf", "pages": 72,
         "note": "Controls, all EDIT and FUNCTION parameters with ranges, programming tutorial, memory, MIDI (in general terms) and specifications. "
                 "Shows only a few algorithms (3 to 6); the voice data list page is blank in this scan."},
        {"id": "righto", "title": "Ken Shirriff, 'Yamaha DX7 chip reverse-engineering, part 4: how algorithms are implemented'", "kind": "other",
         "file": "http://www.righto.com/2021/12/yamaha-dx7-chip-reverse-engineering.html",
         "note": "Full algorithm ROM: per-operator modulation source, feedback register and output count (COM). Used to confirm all 32 routings, carriers and feedback loops, and the output level compensation."},
        {"id": "sysex", "title": "DX7 MIDI data format (DX7 data sheet and Keyboard, Jan 1987), as transcribed on YamahaMusicians.com", "kind": "other",
         "file": "https://yamahamusicians.com/forum/viewtopic.php?t=7759",
         "note": "Single-voice and 32-voice bulk dump headers, 155-byte voice layout, function parameter numbers 64-77."},
        {"id": "rom1a", "title": "DX7 Librarian voice list and ROM 1 cartridge listing", "kind": "other", "file": "https://dx7.roundsquare.net/voice-list",
         "note": "Names and order of the 32 ROM 1A voices."},
        {"id": "dx7ii_chart", "title": "Yamaha DX7 II FD MIDI implementation chart", "kind": "other", "file": "https://www.manualslib.com/manual/802737/Yamaha-Dx7-Ii-Fd.html?page=88",
         "note": "Comparable controller numbers; the original DX7 manual gives none."},
    ],
}
D["architecture"] = {
    "synthesis": "fm", "signal_path": "digital", "voices": 16, "polyphony_mode": "16-note polyphonic or monophonic",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "32 internal voices (battery-backed RAM), 32 on a RAM cartridge, 64 on a ROM cartridge (two banks of 32). Function settings are global, not per voice.",
    "semi_modular": False, "panel_counts": {"keys": 61, "voice_select_buttons": 32, "data_entry_sliders": 1, "data_entry_buttons": 2, "lcd_lines": 2, "lcd_characters": 16},
    "summary": ("Each of 16 voices has six sine-wave operators, each with its own frequency (ratio to the key or fixed in Hz), detune, eight-stage "
                "rate/level envelope, output level, keyboard level and rate scaling, velocity and amplitude-modulation sensitivity. One of 32 "
                "algorithms decides which operators are heard (carriers) and which modulate others, with one adjustable feedback loop. A pitch "
                "envelope moves all six together. One LFO (six waves) gives pitch and amplitude modulation, scaled by the mod wheel, foot and breath "
                "controllers and aftertouch, which can also bias the envelopes. All programming runs through 32 multi-function buttons and one data entry slider."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "KEYBOARD", "61 keys (C1-C6) with initial (velocity) and after (pressure) touch; 16-note poly or mono, portamento or glissando, key transpose.",
    ["kbd.sustain", "kbd.porta_sw", "kbd.midi_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch"], scope="common", props={"keys": 61, "range": "C1-C6"})
mod("wheels", "manual_controller", "Pitch and modulation wheels", "LEFT OF KEYBOARD", "Spring-return pitch wheel and modulation wheel.", [], ["wheels.bend", "wheels.mod"], scope="common")
mod("lfo", "lfo", "LFO", "EDIT: LFO", "One LFO: triangle, saw down, saw up, square, sine or sample and hold; speed, delay, pitch and amplitude depths, key sync.",
    ["lfo.key_sync"], ["lfo.out"], scope="common", props={"waveforms": ["triangle", "saw_down", "saw_up", "square", "sine", "sample_hold"]})
mod("modbus", "modulation_bus", "Modulation controllers", "FUNCTION: MODULATION",
    "Combines the LFO's programmed depths (PMD, AMD) with the mod wheel, foot controller, breath controller and aftertouch. Each controller has a RANGE "
    "and switches for PITCH (adds LFO pitch modulation), AMPLITUDE (adds LFO amplitude modulation) and EG BIAS (lowers operator levels directly, without the LFO).",
    ["modbus.lfo", "modbus.wheel", "modbus.foot", "modbus.breath", "modbus.aftertouch"], ["modbus.pitch_mod", "modbus.amp_mod", "modbus.eg_bias"], scope="common")
mod("peg", "envelope", "Pitch EG", "EDIT: PITCH EG", "Four-rate, four-level pitch envelope moving all six operators equally, ±4 octaves (level 50 is no change).",
    ["peg.gate"], ["peg.out"], props={"range_octaves": [-4, 4]})
for i in range(1, 7):
    mod(op(i), "operator", f"Operator {i}", "EDIT: OSCILLATOR / EG / KEYBOARD SCALING / OPERATOR",
        f"Sine oscillator with its own frequency, envelope and level. Carrier or modulator by algorithm; modulation links are in the algorithms section.",
        [f"{op(i)}.pitch", f"{op(i)}.gate", f"{op(i)}.velocity", f"{op(i)}.amp_mod"], [f"{op(i)}.out"],
        props={"frequency_ratio": [0.5, 61.69], "fixed_hz": [1, 9772], "eg": "4 rates, 4 levels"})
mod("sum", "summer", "Carrier sum", "(internal)", "Sums the carriers of the current algorithm, each scaled down by the number of carriers so all algorithms play at similar volume.",
    [f"sum.in{i}" for i in range(1, 7)], ["sum.out"])
mod("out", "output", "Output", "VOLUME / rear panel", "DAC and VOLUME slider to the line output and headphones; the VOLUME foot controller jack scales the level.",
    ["out.in", "out.foot_volume"], ["out.line", "out.phones"], scope="common")

# ---------------------------------------------------------------- parameters
# voice-wide (patch)
par("voice.algorithm", "sum", "ALGORITHM", "integer", "Selects one of 32 operator arrangements; see algorithms.", "patch", edit(7, 134), range={"min": 1, "max": 32})
par("voice.feedback", "sum", "FEEDBACK", "integer", "Depth of the algorithm's feedback loop.", "patch", edit(8, 135), range={"min": 0, "max": 7})
par("lfo.wave", "lfo", "LFO WAVE", "enum", "LFO waveform.", "patch", edit(9, 142),
    values=[{"value": v} for v in ["triangle", "saw_down", "saw_up", "square", "sine", "sample_hold"]])
par("lfo.speed", "lfo", "LFO SPEED", "integer", "LFO rate, 0 slowest to 99 fastest.", "patch", edit(10, 137), range={"min": 0, "max": 99})
par("lfo.delay", "lfo", "LFO DELAY", "integer", "Delay before LFO modulation starts after a key.", "patch", edit(11, 138), range={"min": 0, "max": 99})
par("lfo.pmd", "lfo", "LFO PMD", "integer", "Programmed pitch modulation depth (needs pitch mod sensitivity above 0).", "patch", edit(12, 139), range={"min": 0, "max": 99})
par("lfo.amd", "lfo", "LFO AMD", "integer", "Programmed amplitude modulation depth (needs operator amplitude sensitivity above 0).", "patch", edit(13, 140), range={"min": 0, "max": 99})
par("lfo.sync", "lfo", "LFO SYNC", "boolean", "Restarts the LFO waveform on each key.", "patch", edit(14, 141))
par("voice.pms", "modbus", "MOD SENSITIVITY PITCH", "integer", "Voice's sensitivity to LFO pitch modulation.", "patch", edit(15, 143), range={"min": 0, "max": 7})
par("voice.osc_sync", "sum", "OSC KEY SYNC", "boolean", "Starts every operator at the beginning of its sine cycle on each key.", "patch", edit(17, 136, "twice: SYNC"),
    note="The panel reaches it per operator, but the voice data stores a single value for all six.")
for k in range(1, 5):
    par(f"peg.rate{k}", "peg", f"PITCH EG RATE {k}", "integer", f"Pitch EG rate {k}.", "patch", edit(29, 125 + k, f"{k} times"), range={"min": 0, "max": 99})
for k in range(1, 5):
    par(f"peg.level{k}", "peg", f"PITCH EG LEVEL {k}", "integer", f"Pitch EG level {k}; 50 is no change, 0 is 4 octaves down, 99 is 4 octaves up.", "patch", edit(30, 129 + k, f"{k} times"),
        range={"min": 0, "max": 99}, default=50)
par("voice.transpose", "kbd", "KEY TRANSPOSE", "integer", "Pitch heard from middle C, set by pressing a key: up to 2 octaves either way.", "patch", edit(31, 144),
    range={"min": -24, "max": 24}, note="Stored as 0-48 with 24 = no transpose (C3).")
# per operator (patch); SysEx numbers: op6 0-20, op5 21-41 ... op1 105-125
for i in range(1, 7):
    o, b = op(i), (6 - i) * 21
    par(f"{o}.on", o, f"OPERATOR ON-OFF {i}", "boolean", "Mutes the operator while editing; not stored (set output level to 0 to keep it off).", "none",
        [{"type": "menu", "control": "push_button", "mode": "edit", "button": i, "note": f"EDIT, button {i}"}, {"type": "sysex", "message": "parameter change, group 0", "parameter_number": 155}],
        default=True)
    par(f"{o}.osc_mode", o, "OSC MODE", "enum", "Ratio: frequency follows the key. Fixed: a set frequency in Hz regardless of key.", "patch", edit(17, b + 17, "once: MODE"),
        values=[{"value": "ratio"}, {"value": "fixed"}])
    par(f"{o}.freq_coarse", o, "FREQUENCY COARSE", "integer", "Ratio 0.50, 1.00, then whole numbers to 31; fixed 1, 10, 100 or 1000 Hz.", "patch", edit(18, b + 18), range={"min": 0, "max": 31})
    par(f"{o}.freq_fine", o, "FREQUENCY FINE", "integer", "Raises the frequency up to just under twice the coarse value (1.00-1.99 x).", "patch", edit(19, b + 19), range={"min": 0, "max": 99})
    par(f"{o}.detune", o, "DETUNE", "integer", "Very fine tuning for beating between operators.", "patch", edit(20, b + 20), range={"min": -7, "max": 7})
    for k in range(1, 5):
        par(f"{o}.eg_rate{k}", o, f"EG RATE {k}", "integer", f"Envelope rate {k} (99 fastest).", "patch", edit(21, b + k - 1, f"{k} times"), range={"min": 0, "max": 99})
    for k in range(1, 5):
        par(f"{o}.eg_level{k}", o, f"EG LEVEL {k}", "integer", f"Envelope level {k}.", "patch", edit(22, b + k + 3, f"{k} times"), range={"min": 0, "max": 99})
    par(f"{o}.break_point", o, "BREAK POINT", "integer", "Key where level scaling pivots, A-1 to C8.", "patch", edit(23, b + 8), range={"min": 0, "max": 99}, note="0 = A-1, 39 = C3.")
    for side, n in (("left", 11), ("right", 12)):
        par(f"{o}.curve_{side}", o, f"CURVE ({side.upper()[0]})", "enum", f"Scaling curve {side} of the break point.", "patch", edit(24, b + n, "once: L" if side == "left" else "twice: R"),
            values=[{"value": "-LIN"}, {"value": "-EXP"}, {"value": "+EXP"}, {"value": "+LIN"}])
    for side, n in (("left", 9), ("right", 10)):
        par(f"{o}.depth_{side}", o, f"DEPTH ({side.upper()[0]})", "integer", f"Scaling depth {side} of the break point; -LIN at 99 rolls off 22 dB/oct.", "patch",
            edit(25, b + n, "once: L" if side == "left" else "twice: R"), range={"min": 0, "max": 99})
    par(f"{o}.rate_scaling", o, "KEYBOARD RATE SCALING", "integer", "Speeds up envelope rates on higher keys.", "patch", edit(26, b + 13), range={"min": 0, "max": 7})
    par(f"{o}.ams", o, "MOD SENSITIVITY AMPLITUDE", "integer", "Operator's sensitivity to amplitude modulation and EG bias.", "patch", edit(16, b + 14), range={"min": 0, "max": 3})
    par(f"{o}.velocity_sens", o, "KEY VELOCITY SENSITIVITY", "integer", "How much key speed raises this operator's level (louder on a carrier, brighter on a modulator).", "patch",
        edit(28, b + 15), range={"min": 0, "max": 7})
    par(f"{o}.output_level", o, "OPERATOR OUTPUT LEVEL", "integer", "Operator level; roughly logarithmic, so 50 is far less than half of 99.", "patch", edit(27, b + 16), range={"min": 0, "max": 99})

# function (global)
par("sys.master_tune", "kbd", "MASTER TUNE ADJ", "continuous", "Overall tuning, ±75 cents (slider only).", "global", func(1, note="FUNCTION, button 1, then DATA ENTRY slider"),
    physical={"min": -75, "max": 75, "unit": "cents"})
par("sys.poly_mono", "kbd", "POLY/MONO", "enum", "16-note poly or one-note mono.", "global", func(2, 64), values=[{"value": "poly"}, {"value": "mono"}])
par("sys.pb_range", "wheels", "PITCH BEND RANGE", "integer", "Pitch wheel range in semitones each way; fixed at 12 when STEP is above 0.", "global", func(3, 65), range={"min": 0, "max": 12})
par("sys.pb_step", "wheels", "PITCH BEND STEP", "integer", "0 is smooth; otherwise the bend jumps in steps of this many semitones.", "global", func(4, 66), range={"min": 0, "max": 12})
par("sys.porta_mode", "kbd", "PORTAMENTO MODE", "enum", "Poly: sustain-key pitch retain or follow. Mono: fingered or full time.", "global", func(5, 67),
    values=[{"value": "retain_or_fingered"}, {"value": "follow_or_full_time"}])
par("sys.glissando", "kbd", "PORTAMENTO GLISSANDO", "boolean", "Stepped (semitone) glide instead of smooth.", "global", func(6, 68))
par("sys.porta_time", "kbd", "PORTAMENTO TIME", "integer", "Glide time; 0 is off, 99 slowest.", "global", func(7, 69), range={"min": 0, "max": 99})
par("sys.midi_channel", "kbd", "MIDI CH", "integer", "MIDI channel for sending and receiving.", "global", func(8, note="FUNCTION, button 8 (press until MIDI CH), then DATA ENTRY"),
    range={"min": 1, "max": 16})
par("sys.sys_info", "kbd", "SYS INFO AVAIL", "boolean", "Whether voice and function data are sent and received as SysEx.", "global",
    func(8, note="FUNCTION, button 8 (press until SYS INFO), then ON/OFF"), default=False)
for base, src, num in ((17, "MODULATION WHEEL", 70), (21, "FOOT CONTROL", 72), (25, "BREATH CONTROL", 74), (29, "AFTER TOUCH", 76)):
    key = {"MODULATION WHEEL": "wheel", "FOOT CONTROL": "foot", "BREATH CONTROL": "breath", "AFTER TOUCH": "aftertouch"}[src]
    par(f"sys.{key}_range", "modbus", f"{src} RANGE", "integer", f"Maximum modulation from the {src.lower()}.", "global", func(base, num), range={"min": 0, "max": 99})
    for off, dest in ((1, "pitch"), (2, "amplitude"), (3, "eg_bias")):
        par(f"sys.{key}_{dest}", "modbus", f"{src} {dest.upper().replace('_', ' ')}", "boolean",
            {"pitch": "Controller adds LFO pitch modulation.", "amplitude": "Controller adds LFO amplitude modulation.",
             "eg_bias": "Controller lowers operator levels directly (no LFO), by each operator's amplitude sensitivity."}[dest], "global",
            func(base + off, num + 1, note=f"FUNCTION, button {base + off}, then ON/OFF; sent over SysEx as one assign value (parameter {num + 1})"))
par("sys.memory_protect_int", "kbd", "MEMORY PROTECT INTERNAL", "boolean", "Blocks writing to the internal memory.", "global",
    [{"type": "panel", "control": "push_button", "note": "then ON/OFF"}], default=True)
par("sys.memory_protect_cart", "kbd", "MEMORY PROTECT CARTRIDGE", "boolean", "Blocks writing to a RAM cartridge (which also has its own switch).", "global",
    [{"type": "panel", "control": "push_button", "note": "then ON/OFF"}], default=True)
# live / utility (none)
par("out.volume", "out", "VOLUME", "continuous", "Output and headphone level.", "none", [{"type": "panel", "control": "fader"}], panel_scale={"min": 0, "max": 10})
par("data.slider", "kbd", "DATA ENTRY", "continuous", "Sets whichever parameter was last selected; also keeps adjusting the last FUNCTION parameter in play mode.", "none",
    [{"type": "panel", "control": "fader"}, {"type": "midi", "message": "CC 6", "confidence": "inferred"}], panel_scale={"min": 0, "max": 99})
par("data.dec_inc", "kbd", "DATA ENTRY -1/+1 (NO/YES, OFF/ON, </>)", "enum", "Steps the current value, answers prompts, switches functions, moves the name cursor.", "none",
    [{"type": "panel", "control": "push_button"}], values=[{"value": "minus"}, {"value": "plus"}])
par("wheels.bend", "wheels", "PITCH wheel", "continuous", "Spring-return pitch bend.", "none", [{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "pitch bend"}],
    panel_scale={"min": -1, "max": 1})
par("wheels.mod", "wheels", "MODULATION wheel", "continuous", "Modulation as set in FUNCTION mode.", "none", [{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "CC 1"}],
    panel_scale={"min": 0, "max": 99})
par("sys.memory_select", "kbd", "MEMORY SELECT", "enum", "Plays internal or cartridge voices; the 32 VOICE SELECT buttons pick the voice.", "none",
    [{"type": "panel", "control": "push_button"}, {"type": "midi", "message": "program change"}], values=[{"value": "internal"}, {"value": "cartridge"}])
par("sys.voice_select", "kbd", "VOICE SELECT 1-32", "integer", "Selects a voice in play mode.", "none", [{"type": "panel", "control": "push_button"}, {"type": "midi", "message": "program change"}],
    range={"min": 1, "max": 32})
for pid, label, fn, btn in (("util.edit_recall", "EDIT RECALL", "Recovers the edit buffer after leaving EDIT by mistake.", 9),
                            ("util.voice_init", "VOICE INIT", "Initialises the edit buffer: algorithm 1, operator 1 at 99, others off, square envelopes, ratios 1.00.", 10),
                            ("util.cart_format", "CART FORM", "Initialises every voice on a RAM cartridge.", 13),
                            ("util.battery_check", "BATTERY CHECK", "Shows the backup battery voltage (2.3-3.5 V acceptable).", 14),
                            ("util.save", "CARTRIDGE SAVE", "Writes all 32 internal voices to a RAM cartridge (about 20 seconds).", 15),
                            ("util.load", "CARTRIDGE LOAD", "Loads 32 voices from a RAM or ROM cartridge into internal memory.", 16)):
    par(pid, "kbd", label, "boolean", fn + " Asks for YES twice where it overwrites.", "none", func(btn, note=f"FUNCTION, button {btn}, then YES"),
        **({"confidence": "inferred", "note": "Button number inferred: the manual names the function but not its button."} if btn in (13, 14) else {}))
par("util.midi_transmit", "kbd", "MIDI TRANSMIT", "boolean", "Sends all 32 internal voices as a SysEx bulk dump (SYS INFO AVAIL must be on).", "none",
    func(8, note="FUNCTION, button 8 (press until MIDI TRANSMIT?), then YES"))
for pid, label, fn in (("util.store", "STORE", "Stores the edit buffer to an internal or RAM cartridge slot; with EG COPY, copies an envelope between operators."),
                       ("util.operator_select", "OPERATOR SELECT", "Chooses the operator being edited."),
                       ("util.edit_compare", "EDIT/COMPARE (CHARACTER)", "Enters EDIT mode; compares the edit with the stored voice; in VOICE NAME, enters characters."),
                       ("util.function", "FUNCTION", "Enters FUNCTION mode.")):
    par(pid, "kbd", label, "boolean", fn, "none", [{"type": "panel", "control": "push_button"}])

# ---------------------------------------------------------------- ports
jack("jack.output", "OUTPUT", "out", "audio", "out.line", "Line output, unbalanced, -10 dBm, 600 ohm.", "6.35 mm TS", electrical={"level_dbm": -10, "impedance_ohm": 600})
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Mono or stereo headphones, 8-150 ohm.", "6.35 mm TS", location="front")
jack("jack.breath", "BREATH CONTROLLER", "in", "cv", "modbus.breath", "Yamaha BC-1 breath controller.", "3.5 mm TRS", location="front")
jack("jack.fs_sustain", "FOOT SWITCH SUSTAIN", "in", "gate", "kbd.sustain", "FC-4 or FC-5 sustain switch.", "6.35 mm TS")
jack("jack.fs_porta", "FOOT SWITCH PORTAMENTO", "in", "gate", "kbd.porta_sw", "FC-4 or FC-5: switches portamento on.", "6.35 mm TS")
jack("jack.fc_volume", "FOOT CONTROL VOLUME", "in", "cv", "out.foot_volume", "FC-3A pedal on volume (0 to maximum).", "6.35 mm TS")
jack("jack.fc_mod", "FOOT CONTROL MODULATION", "in", "cv", "modbus.foot", "FC-3A pedal as a modulation source (FUNCTION foot control settings).", "6.35 mm TS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "Notes, controllers, program change and SysEx.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "Keyboard, controllers, program change, SysEx voice and function data.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "Copy of MIDI IN.", "5-pin DIN")
jack("jack.power", "AC power", "in", "power", None, "Mains, with rear power switch.", "mains cord")

# ---------------------------------------------------------------- connections
for i in range(1, 7):
    o = op(i)
    con("kbd.pitch", f"{o}.pitch", "cv", eq(f"{o}.osc_mode", "ratio"), note="Fixed-frequency operators ignore the key.")
    con("peg.out", f"{o}.pitch", "cv", note="The pitch EG moves all six operators equally.")
    con("wheels.bend", f"{o}.pitch", "cv", amount="sys.pb_range")
    con("modbus.pitch_mod", f"{o}.pitch", "cv", amount="voice.pms")
    con("modbus.amp_mod", f"{o}.amp_mod", "cv", amount=f"{o}.ams")
    con("modbus.eg_bias", f"{o}.amp_mod", "cv", amount=f"{o}.ams", note="EG bias lowers the level directly, scaled by amplitude sensitivity.")
    con("kbd.gate", f"{o}.gate", "gate")
    con("kbd.velocity", f"{o}.velocity", "cv", amount=f"{o}.velocity_sens")
    carrier_in = [n for n, (car, _, _) in ALG.items() if i in car]
    con(f"{o}.out", f"sum.in{i}", "audio", {"any": [eq("voice.algorithm", n) for n in carrier_in]}, note=f"Operator {i} is a carrier in {len(carrier_in)} of 32 algorithms.")
con("kbd.gate", "peg.gate", "gate")
con("kbd.gate", "lfo.key_sync", "gate", eq("lfo.sync", True))
con("lfo.out", "modbus.lfo", "cv")
con("wheels.mod", "modbus.wheel", "cv", amount="sys.wheel_range")
con("kbd.aftertouch", "modbus.aftertouch", "cv", amount="sys.aftertouch_range")
con("sum.out", "out.in", "audio")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["algorithms"] = {
    "selector_param": "voice.algorithm", "feedback_param": "voice.feedback", "operators": OPS,
    "entries": [{"number": n, "carriers": [op(x) for x in car], "modulation": [{"from": op(a), "to": op(b)} for a, b in links],
                 "feedback": {"loop": [op(x) for x in fb], **({"note": "Feedback returns from the bottom of the stack to its top modulator."} if len(fb) > 1 else {})}}
                for n, (car, links, fb) in ALG.items()],
    "source": "Routings from the DX7 panel chart, cross-checked against the algorithm ROM decoded by Ken Shirriff (modulation source, feedback register and output count per operator).",
    "note": "Operators are only modulated by higher-numbered operators, and every algorithm has exactly one feedback loop. Carrier outputs are scaled by 1/number of carriers.",
    "confidence": "stated",
}
D["indicators"] = [
    {"id": "voice_led", "module": "kbd", "label": "voice number LED", "kind": "display", "function": "Two-digit voice number; a decimal point means the voice is being edited; blinks during EDIT/COMPARE."},
    {"id": "lcd", "module": "kbd", "label": "LCD", "kind": "display", "function": "16 x 2 characters: voice name and source, or the current EDIT/FUNCTION parameter, the operator on/off pattern and the current operator."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Modes", "applies_to": ["kbd"],
     "rule": "PLAY (MEMORY SELECT INTERNAL or CARTRIDGE, then VOICE SELECT 1-32), EDIT (violet labels: voice parameters, DATA ENTRY sets the selected one) and FUNCTION (brown labels: "
             "global settings and utilities). Each of the 32 buttons has up to five labels. In EDIT, OPERATOR SELECT chooses which operator per-operator parameters apply to."},
    {"id": "b02", "name": "Carriers and modulators", "applies_to": OPS,
     "rule": "In each algorithm, carriers are heard and modulators change their timbre. Raising a modulator's level or envelope brightens the carrier it feeds; key velocity on a modulator "
             "changes tone, on a carrier changes volume. Changing algorithm swaps which operators are carriers, so a voice can change completely."},
    {"id": "b03", "name": "Operator frequency", "applies_to": OPS,
     "rule": "Ratio mode: frequency = key pitch x (coarse, 0.50 or 1-31) x (1 + fine/100), plus detune ±7. Fixed mode: coarse picks 1, 10, 100 or 1000 Hz and fine multiplies it, ignoring the key. "
             "Whole-number ratios give harmonic tones; non-integer ratios give bell-like inharmonic ones."},
    {"id": "b04", "name": "Envelopes", "applies_to": OPS + ["peg"],
     "rule": "Each envelope moves to level 1 at rate 1, then level 2 at rate 2, then level 3 at rate 3 and holds there while the key is down; on release it moves to level 4 at rate 4. "
             "Rates run 0 (slowest) to 99 (fastest). With all levels at 99 except level 4 at 0 and all rates at 99 the envelope is a square gate. Keyboard rate scaling speeds rates on higher keys."},
    {"id": "b05", "name": "Keyboard level scaling", "applies_to": OPS,
     "rule": "Either side of the break point, an operator's level can fall or rise along a linear or exponential curve of set depth: realistic tone changes across the range, or split effects. "
             "A boost needs headroom below output level 99."},
    {"id": "b06", "name": "Modulation controllers", "applies_to": ["modbus", "lfo"],
     "rule": "LFO pitch modulation = PMD plus any controller set to PITCH, scaled by the voice's pitch sensitivity; amplitude modulation likewise with AMD, AMPLITUDE and each operator's amplitude sensitivity. "
             "EG BIAS lets a controller lower operator levels directly. With zero sensitivity in the voice, the controllers do nothing; with EG BIAS or AMPLITUDE on and a low RANGE, some voices go silent."},
    {"id": "b07", "name": "Memory", "applies_to": ["kbd"],
     "rule": "Voices are edited in a buffer and kept only after STORE to an internal or RAM cartridge slot (memory protect off). ROM cartridges hold 64 voices in two banks of 32. Function settings are global and stay "
             "when voices change. The internal memory is battery-backed (lithium, 3-5 years)."},
    {"id": "b08", "name": "Voice name", "applies_to": ["kbd"],
     "rule": "Up to 10 characters, entered with VOICE NAME (button 32): hold CHARACTER and press the buttons carrying the letters. Stored in voice data bytes 145-154.",
     "note": "Not modelled as a parameter: the schema has no text parameter kind."},
    {"id": "b09", "name": "MIDI", "applies_to": ["kbd"],
     "rule": "Notes with velocity, pitch bend, controllers and program changes are always sent and received on the MIDI channel. Voice and function data travel as SysEx only with SYS INFO AVAIL on; "
             "MIDI TRANSMIT sends all 32 voices. A second DX7 or a DX9 can be played and programmed from the first."},
]
ROM1A = [{"number": i, "name": n} for i, n in enumerate(
    ["BRASS 1", "BRASS 2", "BRASS 3", "STRINGS 1", "STRINGS 2", "STRINGS 3", "ORCHESTRA", "PIANO 1", "PIANO 2", "PIANO 3", "E.PIANO 1", "GUITAR 1", "GUITAR 2", "SYN-LEAD 1",
     "BASS 1", "BASS 2", "E.ORGAN 1", "PIPES 1", "HARPSICH 1", "CLAV 1", "VIBE 1", "MARIMBA", "KOTO", "FLUTE 1", "ORCH-CHIME", "TUB BELLS", "STEEL DRUM", "TIMPANI",
     "REFS WHISL", "VOICE 1", "TRAIN", "TAKE OFF"], start=1)]
D["midi"] = {
    "receives": [{"message": "note_on", "velocity": True}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"},
                 {"message": "program_change", "range": [0, 31]},
                 {"message": "control_change", "cc": 1, "parameter": "mod wheel", "confidence": "inferred"}, {"message": "control_change", "cc": 2, "parameter": "breath", "confidence": "inferred"},
                 {"message": "control_change", "cc": 4, "parameter": "foot controller", "confidence": "inferred"}, {"message": "control_change", "cc": 5, "parameter": "portamento time", "confidence": "inferred"},
                 {"message": "control_change", "cc": 6, "parameter": "data entry", "confidence": "inferred"}, {"message": "control_change", "cc": 64, "parameter": "sustain", "confidence": "inferred"},
                 {"message": "control_change", "cc": 65, "parameter": "portamento on/off", "confidence": "inferred"},
                 {"message": "sysex", "header": "F0 43 1n", "note": "parameter change: group 0 voice (0-155), group 2 function (64-77); needs SYS INFO AVAIL"},
                 {"message": "sysex", "header": "F0 43 0n 00 01 1B", "note": "single voice dump: 155 bytes + checksum + F7"},
                 {"message": "sysex", "header": "F0 43 0n 09 20 00", "note": "32-voice bulk dump: 4096 packed bytes + checksum + F7"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change"},
                  {"message": "control_change", "note": "wheel, breath, foot, sustain, portamento, data entry (inferred)"}, {"message": "sysex", "note": "voice, bulk and function data"}],
    "channel_note": "One channel 1-16 (FUNCTION, button 8).",
    "voice_data_layout": "Per operator (operator 6 first, 21 bytes each): rates 1-4, levels 1-4, break point, left depth, right depth, left curve, right curve, rate scaling, amplitude sensitivity, "
                         "velocity sensitivity, output level, osc mode, coarse, fine, detune. Then pitch EG rates 1-4 and levels 1-4, algorithm, feedback, osc key sync, LFO speed, delay, PMD, AMD, sync, wave, "
                         "pitch mod sensitivity, transpose, name (10).",
    "note": "The manual describes MIDI in general terms only; controller numbers follow the DX7 II implementation chart and the original data sheet."}
D["specifications"] = {
    "keyboard": "61 keys, C1-C6, velocity and aftertouch", "polyphony": 16, "sound_source": "6 operators, 32 algorithms", "lfo_waves": 6,
    "memory": {"internal": "32 voices, battery-backed RAM", "ram_cartridge": "32 voices, EEPROM", "rom_cartridge": "64 voices (2 x 32)"},
    "displays": {"lcd": "16 x 2 characters", "led": "2 digits with decimal point"}, "master_tune_cents": [-75, 75], "pitch_bend_semitones": [0, 12],
    "outputs": {"line": "6.35 mm TS, -10 dBm, 600 ohm", "phones": "6.35 mm, 8-150 ohm"},
    "control_inputs": ["foot switch: sustain, portamento", "foot control: volume, modulation", "breath controller (BC-1)"], "midi": ["in", "out", "thru"],
    "dimensions_mm": {"w": 1012, "d": 329, "h": 102}, "weight_kg": 14.2, "operating_temp_c": [0, 40],
    "internal": {"sample_rate_khz": 49.096, "chips": ["YM21280 OPS", "YM21290 EGS"]},
    "factory_voices": {"bank": "ROM 1A (also the factory internal memory outside the USA)", "voices": ROM1A,
                       "note": "Names and order from online voice lists; parameter values are not in this source, so they are not example patches."},
}
D["omitted_from_source"] = ["the step-by-step programming tutorial, beyond the facts it establishes", "setup and connection diagrams", "maintenance and troubleshooting", "the glossary"]
D["not_in_source"] = [
    "the full 32-algorithm chart (taken from the panel chart via the reverse-engineered algorithm ROM)",
    "the factory voice list and voice parameter values (names from online lists; values not modelled)",
    "the SysEx data format and controller numbers (taken from the data sheet transcription and the DX7 II chart)",
    "envelope rates in seconds and LFO speed in Hz",
    "the panel numbers of CART FORM and BATTERY CHECK",
]
D["source_inconsistencies"] = [
    "The manual describes OSC KEY SYNC per operator under MODE/SYNC, but the voice data holds one sync value for the whole voice.",
    "The manual says feedback returns to the same operator 'except in algorithms 4 and 6'; the algorithm ROM shows those loops run through three and two operators respectively.",
    "The feature summary gives Key Transpose 'over a 4 octave range'; the specifications say ±2 octaves. Both describe the same span.",
]
D["modelling_gaps"] = [
    {"topic": "Voice name", "detail": "Ten characters per voice; the schema has no text parameter kind, so it is described in behaviours."},
    {"topic": "Factory voice values", "detail": "ROM 1A voices are listed by name only; their 155 values would come from the factory SysEx bank."},
    {"topic": "Timing and response curves", "detail": "Rate-to-time and level-to-dB curves are nonlinear and undocumented here; values stay on the instrument's 0-99 scales."},
    {"topic": "Cartridge slot", "detail": "Not a signal port; described under memory rather than ports."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "algorithms", "midi",
         "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/yamaha-dx7_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
