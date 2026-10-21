#!/usr/bin/env python3
"""Assemble the Morphor ECHON 6 device file (schema 0.12.0).

Six analogue voices, each an exciter (VCO morphing sine-triangle-ramp-pulse-square,
S&H noise, external input, DADSR envelope and VCA) driving a BBD resonator (12 dB input
LPF, 1024-stage BBD clocked from the note, feedback with a 6 dB in-loop LPF and polarity
invert), then dry/wet, pan and level. Four LFO + random generators per voice. A dense
9 x 32 modulation matrix with per-source attenuverters. Voices are organised into up to
six voice groups (multitimbral); 216 presets; no display.

Source: Morphor ECHON 6 Owner's Manual, revision 1.2 (April 2026), including the full
MIDI CC chart and modulation source/destination tables.
"""
import json

D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []
K127 = {"min": 0, "max": 127}


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, cc=None, **kw):
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, cc=cc, **kw)


def btn(id, module, label, fn, cc=None, memory="patch", **kw):
    par(id, module, label, "boolean", fn, memory=memory, control="push_button", cc=cc, **kw)


def setting(id, module, label, kind, fn, page, key, memory="patch", **kw):
    acc = [{"type": "gesture", "gesture": f"UNISON + WRITE (settings), page {page} (NUMBER key {key}), then NUMBER keys or RANDOM / WAVE MIX", "when": "any_time"}]
    par(id, module, label, kind, fn, memory=memory, access=acc, **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "audio", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "morphor-echon-6", "manufacturer": "Morphor", "model": "ECHON 6",
    "category": "6-voice multitimbral analogue BBD-resonator synthesizer (desktop, 19-inch rack or VESA), no keyboard or display",
    "based_on": "Original design (Belgium, 2026) by Eli Clement, Matthew Philpott and Boris Uytterhaegen; billed as the first analogue BBD synthesizer.",
    "sources": [{"id": "manual", "title": "Morphor ECHON 6 Owner's Manual, revision 1.2 (April 2026)", "kind": "user_manual", "file": "Echon_6_Owners_Manual_V1_2.pdf", "pages": 130,
                 "note": "Features and specifications, voice architecture (exciter, BBD resonator, output), Quad LFO, modulation matrix, voice groups and MIDI channels, settings menu, MIDI implementation with full CC chart and modulation source/destination tables."}],
}
D["architecture"] = {
    "synthesis": "physical_modelling", "signal_path": "analogue", "voices": 6,
    "polyphony_mode": "6-voice polyphonic; up to 6 voice groups (multitimbral), each with its own sound, MIDI channel, unison and voice allocation",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "216 presets (6 banks x 6 sub-banks x 6), each holding all voice groups; a scratch pad saved at power-off by an internal UPS. MIDI channels and system settings are global.",
    "semi_modular": False, "panel_counts": {"display": 0, "number_keys": 6, "modulation_sources": 6, "modulation_destinations_per_voice": 32},
    "summary": ("Each voice is an exciter feeding a resonator. The exciter is a small subtractive synth: an analogue VCO whose WAVE knob morphs sine, triangle, ramp, 5% pulse and square "
                "(or crossfades from the external input), analogue noise through a sample-and-hold, and a DADSR envelope on a VCA. Its output passes a 12 dB/oct low-pass INPUT FILTER into "
                "a 1024-stage BBD whose clock always follows the note (NOTE OFFSET, FINE TUNE, GLIDE). FEEDBACK through a 6 dB/oct in-loop filter, optionally inverted, makes the delay "
                "resonate like a struck, bowed or blown body, up to self-oscillation. DRY/WET blends exciter and resonator before pan and level. Four LFO + random generators per voice; "
                "a dense 9-source x 32-destination modulation matrix."),
    "synthesis_note": "Analogue modal-style synthesis: one BBD resonator (one mode) per voice; unison stacks six into a multi-mode body.",
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "MIDI and voice groups", "CONTROL SECTION",
    "Receives MIDI (no keyboard) on a preset channel and up to six voice-group channels; allocates voices per group (five priority modes, unison). The six NUMBER keys can also play voices.",
    ["kbd.midi_in"], ["kbd.note", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend"], scope="common")
mod("extin", "preamp", "External input", "rear panel", "Mono +4 dBu input, available to each voice group's exciter when enabled; LED white when present, red when clipping.", ["extin.in"], ["extin.out"], scope="common")
mod("vco", "oscillator", "Exciter VCO", "EXCITER", "Analogue VCO, about 16 Hz-4.2 kHz (8 octaves). WAVE morphs sine > triangle > ramp > 5% pulse > square (or ext in > waves). Follows the keyboard only through KEY FOLLOW modulation.",
    ["vco.ext"], ["vco.out"], props={"frequency_hz": [16, 4200]})
mod("noise", "noise", "Exciter noise", "EXCITER", "Analogue transistor white noise through a sample-and-hold; NOISE S&H RATE tracks COARSE FREQ for most of its range, then rises to continuous white noise.", [], ["noise.out"])
mod("xmix", "mixer", "Wave / noise mix", "EXCITER", "Crossfade from VCO (or ext in blend) to noise.", ["xmix.wave", "xmix.noise"], ["xmix.out"])
mod("env", "envelope", "Envelope", "EXCITER", "DADSR: onset delay 0-2 s, logarithmic attack, exponential decay and release; short (to ~250 ms), medium or long (to ~25 s) ranges; HOLD, LEGATO, LOOP.",
    ["env.gate"], ["env.out"], props={"onset_delay_s": [0, 2], "time_ranges": ["short (~0-250 ms)", "medium", "long (~25 s)"]})
mod("xvca", "vca", "Exciter VCA", "EXCITER", "Envelope-controlled amplitude; LEVEL sets how hard the resonator is driven (above about 3 o'clock, sustained signals distort the BBD).", ["xvca.in", "xvca.cv"], ["xvca.out"])
mod("inflt", "filter", "Input filter", "BBD RESONATOR", "12 dB/oct low-pass, 32.7 Hz-21 kHz; its output feeds both the BBD and the dry path.", ["inflt.in"], ["inflt.out"],
    props={"slope_db_per_oct": 12, "cutoff_hz": [32.7, 21000]})
mod("clock", "pitch_control", "Resonator pitch chain", "BBD RESONATOR", "MIDI note (and bend) plus NOTE OFFSET (±12 st), FINE TUNE (±3 st) and GLIDE (0-1 s) set the BBD clock; the result is also the KEY FOLLOW source (C0-C8 = 0-1).",
    ["clock.note"], ["clock.bbd_clock", "clock.key_follow"])
mod("bbd", "delay", "BBD resonator", "BBD RESONATOR", "1024-stage bucket-brigade delay with pitch-compensated clocking; with feedback it resonates at a pitch set by the clock. Higher clock: tighter, shorter rings; lower: longer sustain.",
    ["bbd.in", "bbd.clock"], ["bbd.out"], props={"stages": 1024})
mod("fbflt", "filter", "Feedback filter", "BBD RESONATOR", "6 dB/oct low-pass inside the feedback loop: damping, and a lower perceived pitch as it closes.", ["fbflt.in"], ["fbflt.out"],
    props={"slope_db_per_oct": 6})
mod("fb", "vca", "Feedback amount and polarity", "BBD RESONATOR", "FEEDBACK level back into the BBD, normal or INVERTed (a different resonant mode); safe up to self-oscillation.", ["fb.in"], ["fb.out"])
mod("drywet", "mixer", "Dry / wet", "OUTPUT", "Blend of the filtered exciter and the resonator; with a self-oscillating resonator it acts as the resonator's VCA.", ["drywet.dry", "drywet.wet"], ["drywet.out"])
mod("vout", "vca", "Voice pan and level", "OUTPUT", "Per-voice PANNING (kept on the individual outputs) and voice-group LEVEL.", ["vout.in"], ["vout.out"])
for n in range(1, 5):
    mod(f"lfo{n}", "lfo", f"LFO {n}", "QUAD LFO", "Periodic wave (sine, triangle, ramp, square; 20 s to 50 Hz, or 19 MIDI-clock divisions) mixed with a stepped random generator (with smoothing); amplitude, uni/bipolar, KB reset or single-shot.",
        [f"lfo{n}.reset"], [f"lfo{n}.out"], props={"rate": "20 s per cycle to 50 Hz"})
mod("master", "output", "Outputs", "OUTPUT / rear panel", "Main stereo mix (MASTER), headphones (PHONES, independent), and six individual voice outputs; a voice plugged into its individual output leaves the main mix.",
    ["master.in"], ["master.main_l", "master.main_r", "master.phones", "master.voice_out"], scope="common")

# ---------------------------------------------------------------- parameters (CC per the manual's chart)
knob("vco.wave", "vco", "WAVE", "Morph sine > triangle > ramp > 5% pulse > square (ext in at minimum when present).", 15)
btn("vco.kb_reset", "vco", "KB RESET (exciter)", "Restart the VCO phase on each note.", 16)
knob("vco.coarse", "vco", "COARSE FREQ", "Eight octaves; summed with FINE FREQ (same modulation destination).", 17)
knob("vco.fine", "vco", "FINE FREQ", "±3 semitones.", 18, note="63 = centre.")
knob("noise.sh_rate", "noise", "NOISE S&H RATE", "Sample-and-hold clock; fully clockwise is white noise.", 19)
knob("xmix.mix", "xmix", "WAVE / NOISE MIX", "VCO (anticlockwise) to noise (clockwise).", 20)
knob("xvca.level", "xvca", "LEVEL (exciter)", "Exciter output and resonator drive.", 21)
knob("env.onset", "env", "ONSET DELAY", "0-2 s before the attack.", 22, physical={"min": 0, "max": 2, "unit": "s"})
knob("env.attack", "env", "ATTACK", "Logarithmic rise.", 23)
knob("env.decay", "env", "DECAY", "Exponential fall to sustain.", 24)
knob("env.sustain", "env", "SUSTAIN", "Sustain level.", 25)
knob("env.release", "env", "RELEASE", "Exponential fall after note-off.", 26)
par("env.range", "env", "ENV RANGE", "enum", "Short, medium or long stage times (LED brightness).", control="push_button", cc=27, values=[{"value": "short"}, {"value": "medium"}, {"value": "long"}])
btn("env.hold", "env", "HOLD (long press ENV RANGE)", "Ignores note-off; NUMBER keys toggle held voices.", 28)
btn("env.legato", "env", "LEGATO", "Envelope continues from its current level instead of zero.", 29)
btn("env.loop", "env", "LOOP (long press LEGATO)", "Loops onset delay, attack and decay while held (implies legato).", 30)
knob("inflt.cutoff", "inflt", "INPUT FILTER", "Cutoff 32.7 Hz-21 kHz.", 31, physical={"min": 32.7, "max": 21000, "unit": "Hz"})
knob("fbflt.cutoff", "fbflt", "FEEDBACK FILTER", "In-loop low-pass: damping and pitch drop.", 40)
btn("fb.invert", "fb", "INVERT", "Inverts feedback polarity: a different tonal centre and harmonics.", 41)
knob("fb.amount", "fb", "FEEDBACK", "Amount of BBD output fed back; self-oscillates past the damping threshold.", 43)
knob("clock.glide", "clock", "GLIDE", "Resonator portamento 0-1 s.", 5, physical={"min": 0, "max": 1, "unit": "s"})
knob("clock.fine_tune", "clock", "FINE TUNE", "±3 semitones, continuous.", 46)
knob("clock.note_offset", "clock", "NOTE OFFSET", "±12 semitones in steps.", 47, range={"min": -12, "max": 12})
knob("drywet.mix", "drywet", "DRY WET", "Filtered exciter (anticlockwise) to resonator (clockwise).", 48)
knob("vout.pan", "vout", "PANNING", "Stereo position of each voice.", 10)
knob("vout.level", "vout", "LEVEL (voice group)", "Voice group output level.", 7)
par("master.level", "master", "MASTER", "continuous", "Main output level.", memory="none", panel_scale={"min": 0, "max": 10})
par("master.phones", "master", "PHONES", "continuous", "Headphone level, independent of MASTER.", memory="none", panel_scale={"min": 0, "max": 10})
LFO_CC = {1: [49, 50, 51, 52, 53, 54, 55, 56, 57, 58], 2: [59, 60, 61, 62, 63, 70, 71, 72, 73, 74], 3: [75, 76, 77, 78, 79, 80, 81, 82, 83, 85], 4: [86, 87, 88, 89, 90, 91, 92, 93, 94, 95]}
for n, cc in LFO_CC.items():
    l = f"lfo{n}"
    sel = f"SELECT at LFO {n}"
    par(f"{l}.wave", l, f"LFO {n} WAVE", "enum", "Periodic waveform.", control="push_button", cc=cc[0], values=[{"value": v} for v in ["sine", "triangle", "ramp", "square"]], note=sel)
    knob(f"{l}.random_rate", l, f"LFO {n} RANDOM RATE", "S&H clock; fully anticlockwise holds the last value (a per-voice random offset).", cc[1], note=sel)
    knob(f"{l}.amplitude", l, f"LFO {n} AMPLITUDE", "Output level (hold AMPLITUDE and turn RANDOM / WAVE MIX).", cc[2], note=sel)
    btn(f"{l}.smooth", l, f"LFO {n} SMOOTH", "Glides between random steps.", cc[3], note=sel)
    knob(f"{l}.mix", l, f"LFO {n} RANDOM / WAVE MIX", "Random only (anticlockwise) to wave only (clockwise).", cc[4], note=sel)
    btn(f"{l}.kb_reset", l, f"LFO {n} KB RESET", "Restarts the wave (and picks a new random value) on each note.", cc[5], note=sel)
    btn(f"{l}.single", l, f"LFO {n} SINGLE (long press)", "One cycle per note (implies KB reset).", cc[6], note=sel)
    knob(f"{l}.rate", l, f"LFO {n} RATE", "20 s per cycle to 50 Hz, or a clock division.", cc[7], note=sel)
    par(f"{l}.polarity", l, f"LFO {n} POLARITY (long press WAVE)", "enum", "Bipolar (red LED) or unipolar (white).", control="push_button", cc=cc[8], values=[{"value": "bipolar"}, {"value": "unipolar"}], note=sel)
    btn(f"{l}.clock_sync", l, f"LFO {n} CLOCK SYNC (long press SELECT)", "Sync wave and random rates to MIDI clock (19 divisions, 2 bars to 1/32 triplet).", cc[9], note=sel)
par("lfo.select", "lfo1", "SELECT (LFO)", "enum", "Which LFO the section edits (and, with QUAD LFO source key, which LFO is the modulation source).", memory="none", control="push_button", cc=115,
    values=[{"value": f"lfo{n}"} for n in range(1, 5)])
SOURCES = [("env", "ENVELOPE", "env.out", 102), ("quad_lfo", "QUAD LFO", None, 103), ("modwheel", "MODWHEEL", "kbd.modwheel", 104), ("velocity", "VELOCITY", "kbd.velocity", 105),
           ("aftertouch", "AFTERTOUCH", "kbd.aftertouch", 106), ("key_follow", "KEY FOLLOW", "clock.key_follow", 107)]
for sid, lab, _, cc in SOURCES:
    knob(f"modsrc.{sid}_macro", "kbd", f"{lab} SOURCE MACRO", "Attenuverter for the source (centre off, clockwise +1, anticlockwise -1); when detached, a manual control for its destinations.", cc,
         note="64 = no modulation.")
    btn(f"modsrc.{sid}_select", "kbd", f"{lab} SOURCE SELECTION", "Shows the source's destinations; hold and turn a destination knob to assign; press to detach or attach the input.", "9 (detach/attach)")
par("mod.source", "kbd", "Modulation source select", "integer", "Source for matrix editing over MIDI (0 envelope, 1-4 LFO, 5 modwheel, 6 velocity, 7 aftertouch, 8 key follow).", control="push_button", cc=109,
    range={"min": 0, "max": 8})
par("mod.destination", "kbd", "Modulation destination select", "integer", "Destination for matrix editing (0-31).", control="push_button", cc=110, range={"min": 0, "max": 31})
par("mod.depth", "kbd", "Destination depth", "integer", "Depth of the selected source on the selected destination (turn the destination knob while holding the source key).", control="knob", cc=111, range=K127)
par("mod.polarity", "kbd", "Destination depth polarity", "enum", "Red (positive) or blue (negative); SOURCE key + DESTINATION button flips it.", control="push_button", cc=112, values=[{"value": "negative"}, {"value": "positive"}])
par("mod.enable", "kbd", "Modulation enable", "boolean", "DESTINATION button mutes or unmutes; hold to delete; SOURCE + hold DESTINATION for full depth.", control="push_button", cc=113)
for pid, label, fn in (("ui.preset", "PRESET", "Preset mode; hold with three NUMBER keys to load (bank, sub-bank, slot)."), ("ui.voice_group", "VOICE GROUP", "Voice group mode; hold with a NUMBER key for voice group edit."),
                       ("ui.init", "INIT", "Hold to load the INIT preset (or INIT voice group)."), ("ui.reload", "RELOAD", "Restores the saved preset (A/B compare); INIT + RELOAD syncs the panel."),
                       ("ui.write", "WRITE", "Saves (hold, or WRITE + three NUMBER keys); copy/paste voice groups."), ("ui.number", "NUMBER keys 1-6", "Voices, voice groups, preset digits, settings and playing notes.")):
    btn(pid, "kbd", label, fn, memory="none")
btn("kbd.unison", "kbd", "UNISON", "Preset mode: notes go to all voice groups. Voice group mode: all the group's voices play each note.", 126, note="CC 126 mono (unison on), CC 127 poly.")
setting("sys.preset_channel", "kbd", "MIDI CH (preset)", "integer", "Preset (master) MIDI channel; voice groups default to 2-7 and never share it.", "MIDI CH", 1, memory="global", range={"min": 1, "max": 16}, default=1)
setting("vg.midi_channel", "kbd", "MIDI CH (voice group)", "integer", "MIDI channel of the selected voice group.", "MIDI CH", 1, memory="global", range={"min": 1, "max": 16})
setting("sys.cc_in", "kbd", "CC in", "boolean", "Receive CCs.", "CONTROL", 2, default=True)
setting("sys.cc_out", "kbd", "CC out", "boolean", "Send CCs from the panel.", "CONTROL", 2, default=True)
setting("vg.ext_in", "extin", "EXT IN (voice group)", "boolean", "External input enabled for the voice group.", "EXT IN", 3, cc=14)
setting("vg.bend_range", "kbd", "PITCHBEND", "enum", "Pitch bend range of the voice group.", "PITCHBEND", 4, values=[{"value": f"±{v}"} for v in (1, 2, 3, 5, 7, 12)], cc="108")
setting("vg.priority", "kbd", "PRIORITY", "enum", "Voice allocation (and, in preset mode, voice group allocation).", "PRIORITY", 5, cc=116,
        values=[{"value": v} for v in ["first_available_steal", "first_available_no_steal", "round_robin_steal", "least_recently_used", "reuse_same_note"]])
for pid, label, fn in (("sys.local", "Local control", "Panel and NUMBER keys drive the engine (CC 122)."), ("sys.pc_in", "Program change in", "Receive program changes."),
                       ("sys.pc_out", "Program change out", "Send program changes."), ("sys.catch_up", "Control catch-up", "Knobs act only after passing the stored value.")):
    setting(pid, "kbd", label, "boolean", fn, "SYSTEM", 6, memory="global", default=pid != "sys.catch_up")
setting("sys.led_brightness", "kbd", "LED brightness", "integer", "Five levels.", "SYSTEM", 6, memory="global", range={"min": 1, "max": 5})
setting("sys.vco_tuning", "vco", "VCO tuning", "boolean", "Auto-tunes all six exciter VCOs (several minutes, silent; warm up 10 minutes first). Also MIDI Tune Request.", "SYSTEM", 6, memory="none")

# ---------------------------------------------------------------- ports
jack("jack.main_l", "MAIN OUT L", "out", "audio", "master.main_l", "Balanced +4 dBu; mono (sums right) if only L is used.", "6.35 mm TRS")
jack("jack.main_r", "MAIN OUT R", "out", "audio", "master.main_r", "Balanced +4 dBu.", "6.35 mm TRS")
jack("jack.phones", "PHONES", "out", "audio", "master.phones", "Stereo headphones, pre-master monitoring with its own level.", "6.35 mm TRS")
for n in range(1, 7):
    jack(f"jack.voice{n}", f"OUT {n}", "out", "audio", "master.voice_out", f"Voice {n} in stereo (tip left, ring right), +4 dBu; removes voice {n} from the main mix.", "6.35 mm TRS")
jack("jack.ext_in", "EXT IN", "in", "audio", "extin.in", "Mono line input, +4 dBu; a voice output can be patched back here for cross-feedback.", "6.35 mm TS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out (CCs, program changes, SysEx dumps).", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB-C (MIDI)", "bidirectional", "midi", None, "Class-compliant USB MIDI (no bus power); SysEx, configurator, firmware.", "USB-C")
jack("jack.power", "POWER", "in", "power", None, "USB-C power supply, 9 V 3 A; power switch beside it.", "USB-C")

# ---------------------------------------------------------------- connections
con("kbd.note", "clock.note", "cv", note="The resonator always tracks the keyboard.")
con("kbd.bend", "clock.note", "cv", amount="vg.bend_range", note="Pitch bend joins the note in the pitch chain (and so in KEY FOLLOW).")
con("kbd.gate", "env.gate", "gate")
con("kbd.gate", "lfo1.reset", "gate", eq("lfo1.kb_reset", True))
con("kbd.gate", "lfo2.reset", "gate", eq("lfo2.kb_reset", True))
con("kbd.gate", "lfo3.reset", "gate", eq("lfo3.kb_reset", True))
con("kbd.gate", "lfo4.reset", "gate", eq("lfo4.kb_reset", True))
con("clock.bbd_clock", "bbd.clock", "clock")
con("extin.out", "vco.ext", eq("vg.ext_in", True), note="At WAVE minimum the exciter outputs the external input instead of a sine, crossfading into the other waves.")
con("vco.out", "xmix.wave")
con("noise.out", "xmix.noise")
con("xmix.out", "xvca.in")
con("env.out", "xvca.cv", "cv")
con("xvca.out", "inflt.in", amount="xvca.level")
con("inflt.out", "bbd.in")
con("inflt.out", "drywet.dry")
con("bbd.out", "fbflt.in")
con("fbflt.out", "fb.in")
con("fb.out", "bbd.in", amount="fb.amount", note="Positive feedback loop; INVERT flips polarity.")
con("bbd.out", "drywet.wet")
con("drywet.out", "vout.in", amount="drywet.mix")
con("vout.out", "master.in", amount="vout.level", note="Voices patched to their individual outputs leave the main mix.")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
MM_SOURCES = [(0, "Envelope", "env.out", True), (1, "Random/LFO 1", "lfo1.out", True), (2, "Random/LFO 2", "lfo2.out", True), (3, "Random/LFO 3", "lfo3.out", True),
              (4, "Random/LFO 4", "lfo4.out", True), (5, "Modwheel", "kbd.modwheel", False), (6, "Velocity", "kbd.velocity", True), (7, "Aftertouch", "kbd.aftertouch", True),
              (8, "Key Follow", "clock.key_follow", True)]
MM_DEST = [(0, "Exciter Wave / Ext In", "vco.wave"), (1, "Exciter Noise S&H Rate", "noise.sh_rate"), (2, "Exciter Wave / Noise Mix", "xmix.mix"), (3, "Exciter Frequency", "vco.coarse"),
           (4, "Exciter Level", "xvca.level"), (5, "Envelope Onset Delay", "env.onset"), (6, "Envelope Attack", "env.attack"), (7, "Envelope Decay", "env.decay"),
           (8, "Resonator Input Filter", "inflt.cutoff"), (9, "Resonator Feedback Filter", "fbflt.cutoff"), (10, "Resonator Feedback", "fb.amount"), (11, "Resonator Glide", "clock.glide"),
           (12, "Resonator Fine Tune", "clock.fine_tune"), (13, "Resonator Dry/Wet", "drywet.mix"), (14, "Resonator Panning", "vout.pan"), (15, "Resonator Level", "vout.level")]
for n in range(1, 5):
    for k, (nm, p) in enumerate((("LFO Rate", "rate"), ("Mix", "mix"), ("Amplitude", "amplitude"), ("Random Rate", "random_rate"))):
        MM_DEST.append((16 + (n - 1) * 4 + k, f"LFO {n} {nm}", f"lfo{n}.{p}"))
D["mod_matrix"] = {
    "name": "Modulation matrix (dense)", "module": "kbd", "slots": 288, "combine": "single",
    "sources": [{"id": i, "name": n, "node": nd, "per_voice": pv, "midi": f"CC 109 value {i}"} for i, n, nd, pv in MM_SOURCES],
    "destinations": [{"id": i, "name": n, "parameter": p} for i, n, p in MM_DEST],
    "depth_range": {"min": -127, "max": 127},
    "note": ("Every source/destination pair (9 x 32 = 288) has its own depth, polarity and mute, set by holding a SOURCE SELECTION key and turning the destination knob; multiple sources sum on a "
             "destination. Each source also passes through its SOURCE MACRO attenuverter (the Quad LFO macro scales all four LFOs). Unipolar sources push from the knob's value, bipolar LFOs swing "
             "around it; results clip at the control's range. Over MIDI: CC 109 source, CC 110 destination, CC 111 depth, CC 112 polarity, CC 113 enable. LFOs can cross-modulate each other's "
             "rate, mix, amplitude and random rate."),
}
D["indicators"] = [
    {"id": "number_leds", "module": "kbd", "label": "NUMBER LEDs", "kind": "led", "function": "Active voices, voice groups, preset digits, settings values."},
    {"id": "dest_leds", "module": "kbd", "label": "DESTINATION LEDs", "kind": "led", "led_colour": "multi", "function": "Red positive, blue negative; brightness shows depth; blinking when muted."},
    {"id": "source_leds", "module": "kbd", "label": "SOURCE LEDs", "kind": "led", "function": "Selected source; also an original-value bar while turning a knob."},
    {"id": "lfo_leds", "module": "lfo1", "label": "SELECT and WAVE LEDs", "kind": "led", "led_colour": "multi", "function": "Selected LFO (brightness = amplitude), waveform, polarity (red bipolar, white unipolar), sync blink; MIDI channel display."},
    {"id": "ext_led", "module": "extin", "label": "EXT IN LED", "kind": "led", "led_colour": "multi", "function": "White when the input is present and enabled, red when clipping."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Exciter and resonator", "applies_to": ["vco", "noise", "env", "xvca", "inflt", "bbd", "fbflt", "fb", "drywet"],
     "rule": "The exciter (VCO, S&H noise or external input under a DADSR) passes the INPUT FILTER into the BBD and the dry path. With feedback the BBD reinforces frequencies tied to its delay "
             "and resonates: short exciter bursts strike it, sustained ones bow or blow it. FEEDBACK past the damping threshold self-oscillates with no input; FEEDBACK FILTER damps the loop "
             "and lowers the perceived pitch; INVERT locks onto a different mode. DRY/WET blends exciter and resonance."},
    {"id": "b02", "name": "Pitch", "applies_to": ["clock", "vco"],
     "rule": "The resonator always follows the note through NOTE OFFSET, FINE TUNE and GLIDE. The VCO follows only via KEY FOLLOW modulation (full depth in INIT), so exciter and resonator pitch "
             "can be detached for beating, moiré and inharmonic textures."},
    {"id": "b03", "name": "Envelope modes", "applies_to": ["env"],
     "rule": "Short, medium or long ranges; HOLD ignores note-off (NUMBER keys toggle held voices); LEGATO continues from the current level; LOOP repeats onset delay, attack and decay while held."},
    {"id": "b04", "name": "Quad LFO", "applies_to": ["lfo1", "lfo2", "lfo3", "lfo4"],
     "rule": "Each of four per-voice LFOs mixes a periodic wave with stepped random (optionally smoothed). Free (20 s to 50 Hz) or MIDI-clock synced (19 divisions), uni or bipolar, KB reset or single-shot. "
             "RANDOM RATE at zero holds a per-voice random offset."},
    {"id": "b05", "name": "Modulation", "applies_to": ["kbd"],
     "rule": "Six source sections (envelope, Quad LFO = four sources, modwheel, velocity, aftertouch, key follow) to 32 destinations per voice in a dense matrix. Hold SOURCE SELECTION and turn a "
             "destination knob to assign; DESTINATION button mutes, long press deletes. Detached sources turn their SOURCE MACRO into a manual control. Polyphonic aftertouch works per voice."},
    {"id": "b06", "name": "Voice groups", "applies_to": ["kbd"],
     "rule": "A preset holds up to six voice groups, each with its own sound, MIDI channel (default 2-7), unison, priority, bend range and external input setting. Voices are assigned to groups in "
             "voice group edit mode. The preset channel (default 1) plays groups by unison (all groups) or by preset priority. CCs on the preset channel edit the group selected with CC 114."},
    {"id": "b07", "name": "Presets", "applies_to": ["kbd"],
     "rule": "216 presets in 6 banks x 6 sub-banks x 6, loaded with PRESET + three NUMBER keys, saved with WRITE. RELOAD compares with the saved version. An internal UPS saves the scratch pad at power-off. "
             "Program change: CC 0 (bank) + CC 32 (sub-bank) + PC (slot), or CC 0 + PC 0-35, or PC 0-127 alone (banks 0-3)."},
    {"id": "b08", "name": "Playing without MIDI", "applies_to": ["kbd"], "rule": "In preset mode each NUMBER key plays its voice (middle C, velocity 127 by default; note, velocity, modwheel and aftertouch per key are editable)."},
    {"id": "b09", "name": "Individual outputs", "applies_to": ["master"], "rule": "A voice patched to its individual output (stereo TRS, panning kept) leaves the main mix; voice outputs can feed EXT IN for cross-feedback and chained resonators."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend", "note": "14-bit"}, {"message": "channel_pressure"}, {"message": "poly_pressure"},
                 {"message": "program_change", "note": "preset channel; with CC 0 / CC 32 bank select"}, {"message": "control_change", "note": "full parameter set (see parameter access), on preset or voice group channels"},
                 {"message": "clock", "note": "24 ppqn for LFO sync"}, {"message": "start"}, {"message": "continue"}, {"message": "stop"}, {"message": "active_sensing"},
                 {"message": "tune_request", "note": "starts VCO tuning"}, {"message": "system_reset", "note": "reboots"}, {"message": "sysex", "header": "F0 00 22 17", "note": "preset and complete dumps"}],
    "transmits": [{"message": "control_change", "note": "when CC out is on"}, {"message": "program_change", "note": "when PC out is on"}, {"message": "sysex", "note": "preset or complete dump"}],
    "channel_note": "One preset (master) channel plus up to six voice group channels; groups may share a channel, but never the preset channel.",
    "special_ccs": {"1": "modwheel (all groups)", "9": "detach/attach sources", "11-13, 2, 3": "NUMBER key note, velocity, modwheel and aftertouch setup", "114": "select active voice group",
                    "115": "LFO select", "116": "note priority", "117": "remove voice from group", "118": "add voice to group", "120": "all sounds off", "121": "reset (init) controls",
                    "122": "local control", "123": "all notes off", "126": "unison", "127": "poly"},
    "note": "Every panel control has a CC; the manual's chart lists ranges, accepted channels and whether each is modulatable."}
D["specifications"] = {
    "voices": 6, "multitimbral_parts": 6, "exciter": "analogue VCO (sine, triangle, ramp, pulse, square), analogue S&H noise, external input, DADSR + VCA",
    "resonator": "1024-stage BBD, 12 dB/oct input LPF, 6 dB/oct feedback LPF, polarity invert", "lfos": "4 per voice (24 total) with random generators",
    "modulation": "9 sources x 32 destinations per voice", "presets": "216 (6 x 6 x 6)",
    "audio": {"main": "2 x 1/4\" TRS balanced, +4 dBu", "voice_outs": "6 x 1/4\" TRS stereo, +4 dBu", "ext_in": "1/4\" mono, +4 dBu", "phones": "1/4\" stereo, independent level"},
    "midi": "DIN in, out, thru; USB-C class compliant", "power": "USB-C 9 V 3 A, 15 W", "dimensions_mm": {"h": 53, "w": 450, "d": 185}, "rack": "19\", 4U (+1U for cables)", "weight_kg": 2.3,
    "sysex_id": "00 22 17", "operating_temp_c_max": 32,
}
D["omitted_from_source"] = ["foreword and dedication", "safety, warranty and regulatory text", "rack and VESA mounting details", "UI diagrams", "original value indicator details"]
D["not_in_source"] = ["envelope times beyond the range end points", "LFO waveform shapes in voltage", "exact VCO and BBD clock ranges in Hz beyond the VCO's ~16 Hz-4.2 kHz", "SysEx data format"]
D["source_inconsistencies"] = [
    "In the CC chart, LFO 4's mix, KB reset, single shot, rate, polarity and clock sync (CC 90-95) are labelled 'LFO 3'.",
    "CC 46 FINE TUNE lists 'Short / Medium / Long' values and CC 47 NOTE OFFSET lists 'Off / On', both copied from other rows.",
    "CC 43 FEEDBACK and CC 5 GLIDE are marked not modulatable, but both are matrix destinations (10 and 11); CC 41 INVERT is marked modulatable but is not a destination.",
    "LFO 1 WAVE (CC 49) is marked not modulatable, LFO 2-4 WAVE are marked modulatable; no LFO wave appears in the destination table.",
    "Key features list 'ADSR with onset delay' and 'DADSR'; the envelope is DADSR throughout the manual.",
    "Key features call the WAVE morph a 'blend between 2 VCO waveforms'; the WAVE control text describes a morph through five shapes.",
    "Sustain and release are not modulation destinations (the destination list has onset delay, attack and decay only).",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); voice groups are described in behaviours."},
    {"topic": "Dense matrix", "detail": "288 source/destination pairs each hold depth, polarity and mute; modelled as a matrix with 288 slots and no per-slot parameters."},
    {"topic": "Synthesis type", "detail": "Recorded as physical_modelling: analogue modal-style synthesis with one BBD resonator per voice (see synthesis_note)."},
    {"topic": "Matrix-only modulation", "detail": "Modulation reaches parameters through the matrix (destinations name parameters), so exciter, filter and output modules carry no separate CV input nodes."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/morphor-echon-6_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
