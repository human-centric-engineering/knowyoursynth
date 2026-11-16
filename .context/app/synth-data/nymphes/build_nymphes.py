#!/usr/bin/env python3
"""Assemble the Dreadbox Nymphes device file (schema 0.12.0).

Six analogue voices, each with a morphing oscillator (saw-square-triangle, pulse width),
square sub, noise, 24 dB resonant low-pass VCF, filter/pitch ADSR, amp ADSR and a
polyphonic LFO 1; after the voice sum, a 6 dB high-pass and a digital reverb. A global
LFO 2 plus mod wheel, velocity and (polyphonic) aftertouch modulate the slider
parameters. 14 sliders x SHIFT = 28 parameters; six play modes with programmable
chords; 49 user + 49 factory presets; USB powered; MIDI in over 3.5 mm TRS or USB; MPE.

Source: Nymphes Owner's Manual V2.0 (the CC list is an image, read by OCR and checked
against the page).
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


def par(id, module, label, kind, fn, memory="patch", access=None, cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = access or [{"type": "panel", "control": "fader"}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def slider(id, module, label, fn, n, shift, cc, **kw):
    acc = [{"type": "panel", "control": "fader", "slider": n, "note": f"slider {n}" + (" with SHIFT lit" if shift else "")}]
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, access=acc, cc=cc, **kw)


def menu(id, module, label, kind, fn, path, memory="patch", cc=None, **kw):
    par(id, module, label, kind, fn, memory=memory, access=[{"type": "menu", "note": path}], cc=cc, **kw)


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


D["device"] = {
    "id": "dreadbox-nymphes", "manufacturer": "Dreadbox", "model": "Nymphes",
    "category": "6-voice analogue polyphonic desktop synthesizer with digital reverb, USB powered",
    "based_on": "Original design (Greece, 2021), inspired by the simplicity of the Sequential Six-Trak.",
    "sources": [{"id": "manual", "title": "Dreadbox Nymphes Owner's Manual V2.0", "kind": "user_manual", "file": "Nymphes_User_Manual.pdf", "pages": 23,
                 "note": "Features, power, quick start, every slider parameter, presets, menu (modes, chords, LFO 2, reverb, mod sources, MIDI/MPE), global settings, SysEx, preset list, CC list (image, read by OCR and checked)."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 6, "polyphony_mode": "POLY (6 voices), UNI A (6 per note), UNI B (4 per note), TRI (3 notes x 2), DUO (2 notes x 3), MONO; chords in the unison-type modes; MPE",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "49 user and 49 factory presets in banks A-G, 1-7 (each location holds both); chords, mod routings and reverb stored per preset.",
    "semi_modular": False, "panel_counts": {"sliders": 14, "slider_parameters": 28, "buttons": 4, "rotary_switch": 1, "keys": 0},
    "summary": ("Per voice: an analogue oscillator whose WAVE morphs saw, square and triangle (with pulse width), a square sub an octave down, white noise, a 24 dB resonant low-pass filter "
                "(32.7 Hz-16.7 kHz, self-oscillating), a filter ADSR (also to pitch), an amp ADSR and a polyphonic LFO 1 to pitch and cutoff. The six voices pass a 6 dB high-pass and a digital "
                "reverb. LFO 2 (monophonic) and mod wheel, velocity and aftertouch reach most slider parameters. Glide, detune and chord sliders; six play modes."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "MIDI and voice assigner", "MENU: MODE / MIDI C", "Receives MIDI over 3.5 mm TRS or USB (no keyboard); assigns six voices per play mode, plays programmed chords, glide (fixed rate, polyphonic), detune; MPE.",
    ["kbd.midi_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel"], scope="common")
mod("osc", "oscillator", "Oscillator", "OSCILLATOR", "Analogue VCO with WAVE morphing saw > square > triangle; pulse width on the pulse part.", ["osc.pitch_cv"], ["osc.out"])
mod("sub", "oscillator", "Sub oscillator", "OSCILLATOR", "Square one octave below the oscillator.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "OSCILLATOR", "White noise.", [], ["noise.out"])
mod("mixer", "mixer", "Source mix", "OSCILLATOR", "LVL, SUB and NOISE levels.", ["mixer.osc", "mixer.sub", "mixer.noise"], ["mixer.out"])
mod("lpf", "filter", "Low-pass filter", "FILTER", "24 dB/oct resonant low-pass, 32.7 Hz-16.7 kHz, self-oscillates at maximum resonance; tracks 1:1 at full TRACK.", ["lpf.in", "lpf.cutoff_cv"], ["lpf.out"],
    props={"slope_db_per_oct": 24, "cutoff_hz": [32.7, 16744]})
mod("env_f", "envelope", "Filter envelope", "ENVELOPE", "ADSR to filter cutoff (EG) and oscillator pitch (oscillator EG); unipolar.", ["env_f.gate"], ["env_f.out"])
mod("env_a", "envelope", "Amp envelope", "ENVELOPE", "ADSR on the voice VCA.", ["env_a.gate"], ["env_a.out"])
mod("vca", "vca", "VCA", "ENVELOPE", "Voice amplitude under the amp envelope.", ["vca.in", "vca.cv"], ["vca.out"])
mod("lfo1", "lfo", "LFO 1", "LFO", "Polyphonic, bipolar: triangle, saw down, saw up, square, random; low, high, track or BPM rate; delay and fade (one-shot with delay 0, fade full); key sync. Fixed to pitch and cutoff.",
    ["lfo1.key_sync"], ["lfo1.out"])
mod("lfo2", "lfo", "LFO 2", "MENU: LFO 2", "Monophonic, bipolar, same controls as LFO 1; assignable to the first 12 sliders' 24 parameters.", [], ["lfo2.out"], scope="common")
mod("hpf", "filter", "High-pass filter", "FILTER", "6 dB/oct non-resonant high-pass on the summed voices (with the low-pass, a band-pass).", ["hpf.in"], ["hpf.out"], scope="common", props={"slope_db_per_oct": 6})
mod("reverb", "reverb", "Reverb", "MENU: REVERB", "Digital reverb: size, decay, low-pass filter, mix; the only digital stage.", ["reverb.in"], ["reverb.out"], scope="common")
mod("out", "output", "Output", "rear panel", "Volume to the line output and headphones.", ["out.in"], ["out.line", "out.phones"], scope="common")

# ---------------------------------------------------------------- slider parameters (14 x 2)
SL = [  # (id, module, label, fn, slider, shift, cc)
    ("osc.wave", "osc", "WAVE", "Morph saw > square > triangle.", 1, False, 70), ("osc.pw", "osc", "PW", "Pulse width of the pulse part of the wave.", 1, True, 12),
    ("osc.level", "mixer", "LVL", "Oscillator level.", 2, False, 9), ("kbd.glide", "kbd", "GLD", "Glide (fixed rate, polyphonic).", 2, True, 5),
    ("sub.level", "mixer", "SUB", "Sub oscillator level.", 3, False, 10), ("kbd.detune", "kbd", "DTN", "Detune between stacked voices.", 3, True, 15),
    ("noise.level", "mixer", "NOISE", "Noise level.", 4, False, 11), ("kbd.chord", "kbd", "CHORD", "Selects chord 1-7 (0 = off); no effect in POLY and MONO.", 4, True, 16),
    ("osc.lfo_depth", "osc", "LFO (pitch)", "LFO 1 depth on pitch.", 5, False, 13), ("osc.eg_depth", "osc", "EG (pitch)", "Filter envelope depth on pitch (unipolar).", 5, True, 14),
    ("lpf.cutoff", "lpf", "CUT", "Low-pass cutoff, 32.7 Hz-16.7 kHz.", 6, False, 74), ("hpf.cutoff", "hpf", "HPF", "High-pass cutoff.", 6, True, 81),
    ("lpf.resonance", "lpf", "RES", "Resonance; self-oscillates at maximum.", 7, False, 71), ("lpf.tracking", "lpf", "TRACK", "Key tracking, 1:1 at maximum.", 7, True, 4),
    ("lpf.eg_depth", "lpf", "EG (filter)", "Filter envelope depth on cutoff.", 8, False, 3), ("lpf.lfo_depth", "lpf", "LFO (filter)", "LFO 1 depth on cutoff.", 8, True, 8),
    ("env_f.attack", "env_f", "A (filter EG)", "Filter envelope attack.", 9, False, 79), ("env_a.attack", "env_a", "A (amp EG)", "Amp envelope attack.", 9, True, 73),
    ("env_f.decay", "env_f", "D (filter EG)", "Filter envelope decay.", 10, False, 80), ("env_a.decay", "env_a", "D (amp EG)", "Amp envelope decay.", 10, True, 84),
    ("env_f.sustain", "env_f", "S (filter EG)", "Filter envelope sustain.", 11, False, 82), ("env_a.sustain", "env_a", "S (amp EG)", "Amp envelope sustain.", 11, True, 85),
    ("env_f.release", "env_f", "R (filter EG)", "Filter envelope release.", 12, False, 83), ("env_a.release", "env_a", "R (amp EG)", "Amp envelope release.", 12, True, 72),
    ("lfo1.rate", "lfo1", "RATE", "LFO 1 rate.", 13, False, 18), ("lfo1.delay", "lfo1", "DELAY", "Delay before LFO 1 amplitude rises.", 13, True, 20),
    ("lfo1.wave", "lfo1", "WAVE (LFO)", "Triangle, saw down, saw up, square, random.", 14, False, 19), ("lfo1.fade", "lfo1", "FADE", "Time before LFO 1 fades out (0 = constant).", 14, True, 21),
]
for pid, m_, lab, fn, n, sh, cc in SL:
    slider(pid, m_, lab, fn, n, sh, cc)
for n, (lab, ccs) in enumerate((("LFO 2", (24, 25, 26, 27)),), start=2):
    for k, (nm, fn) in enumerate((("rate", "LFO 2 rate."), ("wave", "LFO 2 waveform (five shapes)."), ("delay", "LFO 2 delay."), ("fade", "LFO 2 fade."))):
        par(f"lfo2.{nm}", "lfo2", f"LFO 2 {nm.upper()}", "integer", fn, access=[{"type": "menu", "note": f"MENU 2 (LFO 2), slider {13 + (k % 2)}{' with SHIFT' if k >= 2 else ''}"}], cc=ccs[k], range=K127)
for l, ccs in (("lfo1", (22, 23)), ("lfo2", (28, 29))):
    menu(f"{l}.type", l, f"{l.upper()} rate type", "enum", "BPM (MIDI clock; low if no clock), low, high or key track.", "MENU (LFO type and key sync, see menu map)", cc=ccs[0],
         values=[{"value": v} for v in ["bpm", "low", "high", "track"]])
    menu(f"{l}.key_sync", l, f"{l.upper()} key sync", "boolean", "Restarts the LFO on each note.", "MENU (LFO type and key sync, see menu map)", cc=ccs[1])
menu("kbd.mode", "kbd", "MODE", "enum", "Play mode.", "MENU 1 (MODE), then MENU and rotary 1-6", cc=17, values=[{"value": v} for v in ["poly", "uni_a", "uni_b", "tri", "duo", "mono"]])
menu("kbd.chords", "kbd", "CHORD EDIT 1-7", "enum", "Seven chords per preset, programmed by playing them.", "MENU 1, MENU, rotary 7 (CHORD), MENU, then select EDIT 1-7 and play", values=[{"value": f"chord {i}"} for i in range(1, 8)])
menu("kbd.legato", "kbd", "Legato", "boolean", "Glide only on legato notes.", "MENU (see menu map)", cc=68)
for k, (nm, fn, cc) in enumerate((("size", "Reverb space.", 75), ("decay", "Reverb decay.", 76), ("filter", "Reverb low-pass.", 77), ("mix", "Dry/wet.", 78))):
    par(f"reverb.{nm}", "reverb", f"REVERB {nm.upper()}", "integer", fn, access=[{"type": "menu", "note": f"MENU 3 (REVERB), slider {9 + k}"}], cc=cc, range=K127)
par("out.amp_level", "out", "AMP level", "integer", "Patch output level.", access=[{"type": "midi", "message": "CC 7"}], range=K127)
par("out.volume", "out", "VOLUME", "continuous", "Output and headphone volume.", memory="none", access=[{"type": "panel", "control": "knob"}], panel_scale={"min": 0, "max": 10},
    confidence="inferred", note="Mentioned in troubleshooting ('set the volume knob all the way up'); not described elsewhere.")
par("mod.source", "kbd", "Mod source select", "enum", "Which assignable source the menu (or CCs 31-63, 86-89) edits.", memory="none",
    access=[{"type": "menu", "note": "MENU 2 (LFO 2), 4 (MOD W), 5 (VELO) or 6 (AFTER); hold MENU 1 s to clear a source"}, {"type": "midi", "message": "CC 30"}],
    values=[{"value": v} for v in ["lfo2", "modwheel", "velocity", "aftertouch"]])
for pid, lab, fn in (("ui.shift", "SHIFT", "Hold, or double-click to latch: sliders control the top-row parameters."), ("ui.menu", "MENU", "Numeric menu 1-7 with the rotary switch; MENU + LOAD (1 s) auto-tunes."),
                     ("ui.load", "LOAD", "Load: click for user, hold for factory; double-click reloads."), ("ui.save", "SAVE", "SHIFT + SAVE, choose, SAVE."),
                     ("ui.rotary", "Rotary switch", "Bank (with SHIFT) and preset 1-7, menu and submenu items.")):
    par(pid, "kbd", lab, "boolean", fn, memory="none", access=[{"type": "panel", "control": "rotary_switch" if "rotary" in pid else "push_button"}])
GSET = "MENU, rotary 7, SHIFT + MENU (global menu), rotary 1-6, then slider 13 or 14"
menu("sys.midi_channel", "kbd", "MIDI C", "integer", "MIDI channel (learned from incoming MIDI, or 1-7 on the rotary); omni while the page is open.", "MENU 7, MENU, then send MIDI or turn rotary",
     memory="global", range={"min": 1, "max": 16})
menu("sys.mpe", "kbd", "MPE", "boolean", "MPE on or off (hold SHIFT 1 s on the MIDI C page).", "MENU 7, MENU, hold SHIFT 1 s", memory="global")
menu("sys.bend_range", "kbd", "PITCH WHEEL", "integer", "Bend range 0-12 semitones (0-48 with MPE).", GSET, memory="global", range={"min": 0, "max": 48})
menu("sys.fine_tune", "kbd", "FINE TUNE", "continuous", "Global tuning ±4 semitones.", GSET, memory="global", physical={"min": -4, "max": 4, "unit": "semitones"})
menu("sys.sliders", "kbd", "SLIDERS", "enum", "Jump or catch.", GSET, memory="global", values=[{"value": "jump"}, {"value": "catch"}])
menu("sys.load_preview", "kbd", "LOAD PREVIEW", "boolean", "Preview a stored patch before loading.", GSET, memory="global")
menu("sys.cc_in", "kbd", "CC IN", "boolean", "Respond to CCs.", GSET, memory="global")
menu("sys.cc_out", "kbd", "CC OUT", "boolean", "Send CCs.", GSET, memory="global")
menu("sys.pc_in", "kbd", "PROGRAM CHANGE IN", "boolean", "Respond to program changes.", GSET, memory="global")
menu("sys.pc_out", "kbd", "PROGRAM CHANGE OUT", "boolean", "Send program changes.", GSET, memory="global")

# ---------------------------------------------------------------- ports
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in on a 3.5 mm TRS (MIDI.org / Korg wiring; DIN adapter included).", "3.5 mm TRS")
jack("jack.output", "OUTPUT", "out", "audio", "out.line", "Mono line output.", "6.35 mm TS", confidence="inferred", note="Size not stated; drawn as a large jack.")
jack("jack.phones", "Headphones", "out", "audio", "out.phones", "Headphone output.", "3.5 mm TRS", confidence="inferred", note="Size not stated.")
jack("jack.usb", "POWER (USB)", "bidirectional", "midi", None, "USB power (1 A minimum) and USB MIDI in/out; firmware and SysEx.", "USB", note="Connector type not stated.")

# ---------------------------------------------------------------- connections
con("kbd.pitch", "osc.pitch_cv", "cv")
con("kbd.pitch", "sub.pitch_cv", "cv")
con("kbd.pitch", "lpf.cutoff_cv", "cv", amount="lpf.tracking")
con("kbd.gate", "env_f.gate", "gate")
con("kbd.gate", "env_a.gate", "gate")
con("kbd.gate", "lfo1.key_sync", "gate", {"param": "lfo1.key_sync", "equals": True})
con("lfo1.out", "osc.pitch_cv", "cv", amount="osc.lfo_depth")
con("lfo1.out", "sub.pitch_cv", "cv", amount="osc.lfo_depth", confidence="inferred")
con("env_f.out", "osc.pitch_cv", "cv", amount="osc.eg_depth")
con("osc.out", "mixer.osc", amount="osc.level")
con("sub.out", "mixer.sub", amount="sub.level")
con("noise.out", "mixer.noise", amount="noise.level")
con("mixer.out", "lpf.in")
con("env_f.out", "lpf.cutoff_cv", "cv", amount="lpf.eg_depth")
con("lfo1.out", "lpf.cutoff_cv", "cv", amount="lpf.lfo_depth")
con("lpf.out", "vca.in")
con("env_a.out", "vca.cv", "cv")
con("vca.out", "hpf.in", note="Six voices summed, then the high-pass (per the block diagram).")
con("hpf.out", "reverb.in")
con("reverb.out", "out.in", amount="out.amp_level")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
DESTS = [(31, "OSC wave", "osc.wave"), (32, "OSC level", "osc.level"), (33, "Sub level", "sub.level"), (34, "Noise level", "noise.level"), (35, "LFO pitch depth", "osc.lfo_depth"),
         (36, "Pulse width", "osc.pw"), (37, "Glide", "kbd.glide"), (39, "Detune", "kbd.detune"), (40, "Chord selector", "kbd.chord"), (41, "EG pitch depth", "osc.eg_depth"),
         (42, "LPF cutoff", "lpf.cutoff"), (43, "Resonance", "lpf.resonance"), (44, "LPF EG depth", "lpf.eg_depth"), (45, "HPF cutoff", "hpf.cutoff"), (46, "LPF tracking", "lpf.tracking"),
         (47, "LPF cutoff LFO depth", "lpf.lfo_depth"), (48, "Filter EG attack", "env_f.attack"), (49, "Filter EG decay", "env_f.decay"), (50, "Filter EG sustain", "env_f.sustain"),
         (51, "Filter EG release", "env_f.release"), (52, "Amp EG attack", "env_a.attack"), (53, "Amp EG decay", "env_a.decay"), (54, "Amp EG sustain", "env_a.sustain"),
         (55, "Amp EG release", "env_a.release"), (56, "LFO 1 rate", "lfo1.rate"), (57, "LFO 1 wave", "lfo1.wave"), (58, "LFO 1 delay", "lfo1.delay"), (59, "LFO 1 fade", "lfo1.fade"),
         (60, "LFO 2 rate", "lfo2.rate"), (61, "LFO 2 wave", "lfo2.wave"), (62, "LFO 2 delay", "lfo2.delay"), (63, "LFO 2 fade", "lfo2.fade"), (86, "Reverb size", "reverb.size"),
         (87, "Reverb decay", "reverb.decay"), (88, "Reverb filter", "reverb.filter"), (89, "Reverb mix", "reverb.mix")]
POLY = {"osc.lfo_depth", "osc.eg_depth", "kbd.glide", "lpf.cutoff", "lpf.eg_depth", "lpf.tracking", "lpf.lfo_depth", "env_f.attack", "env_a.attack", "env_f.decay", "env_a.decay",
        "env_f.sustain", "env_a.sustain", "env_f.release", "env_a.release", "lfo1.rate", "lfo1.wave", "lfo1.delay", "lfo1.fade"}
D["mod_matrix"] = {
    "name": "Assignable modulation (LFO 2, mod wheel, velocity, aftertouch)", "module": "kbd", "slots": 4 * len(DESTS), "combine": "single",
    "sources": [{"id": 0, "name": "LFO 2", "node": "lfo2.out", "per_voice": False, "midi": "CC 30 = 0"}, {"id": 1, "name": "Mod wheel", "node": "kbd.modwheel", "per_voice": False, "midi": "CC 30 = 1"},
                {"id": 2, "name": "Velocity", "node": "kbd.velocity", "per_voice": True, "midi": "CC 30 = 2"}, {"id": 3, "name": "Aftertouch", "node": "kbd.aftertouch", "per_voice": True, "midi": "CC 30 = 3"}],
    "destinations": [{"id": cc, "name": nm, "parameter": p, "description": f"Depth CC {cc} (for the source chosen by CC 30)" + ("; polyphonic with aftertouch/MPE" if p in POLY else ""),
                      "common_to_all_voices": p not in POLY} for cc, nm, p in DESTS],
    "depth_range": {"min": 0, "max": 127},
    "note": ("Each source has its own depth for every destination, set by moving the slider with the source's menu page open (slider position = depth). Mod wheel, velocity and aftertouch "
             "add to the slider value (clipping at the top); LFO 2 mixes in, so at full depth the slider value no longer matters. LFO 2 cannot modulate LFO 1 or LFO 2 parameters "
             "(24 destinations). Destination IDs are the depth CC numbers (CC 38 is unused). Reverb destinations are reachable by CC; the manual's text lists 28 slider destinations."),
}
D["indicators"] = [
    {"id": "button_leds", "module": "kbd", "label": "SHIFT, MENU, LOAD and SAVE LEDs", "kind": "led", "function": "SHIFT state, menu and submenu (blinking speed), load and save (blink patterns), MPE state on the MIDI page."},
]
D["behaviours"] = [
    {"id": "b01", "name": "SHIFT", "applies_to": ["kbd"], "rule": "14 sliders control 28 parameters: bottom labels normally, top labels while SHIFT is held or latched (double-click)."},
    {"id": "b02", "name": "Signal path", "applies_to": ["osc", "mixer", "lpf", "vca", "hpf", "reverb"],
     "rule": "Per voice: oscillator, sub and noise mixed into the 24 dB low-pass, then the VCA. Voices summed into the 6 dB high-pass (band-pass with the low-pass) and the digital reverb."},
    {"id": "b03", "name": "Fixed modulation", "applies_to": ["lfo1", "env_f"],
     "rule": "LFO 1 (polyphonic) only reaches pitch and cutoff; the filter envelope only reaches cutoff and pitch (unipolar). One-shot LFO: DELAY 0 and FADE full."},
    {"id": "b04", "name": "Assignable modulation", "applies_to": ["kbd", "lfo2"],
     "rule": "Open MENU 2, 4, 5 or 6 and move sliders: each slider position sets that source's depth on that parameter. Hold MENU 1 s on a source page to clear it. Polyphonic aftertouch and MPE reach the listed per-voice targets."},
    {"id": "b05", "name": "Play modes and chords", "applies_to": ["kbd"],
     "rule": "POLY 6 notes; UNI A 6 voices per note; UNI B 4; TRI 3 notes x 2 voices; DUO 2 notes x 3; MONO 1. In UNI A, UNI B, TRI and DUO the CHORD slider picks one of seven chords programmed by playing them; CHORD can be modulated."},
    {"id": "b06", "name": "Presets", "applies_to": ["kbd"],
     "rule": "LOAD, choose bank (SHIFT on) and preset (SHIFT off), then click for the user preset or hold for the factory preset. SHIFT + SAVE, choose, SAVE. Loading sends the preset as SysEx; a full dump sends user then factory presets."},
    {"id": "b07", "name": "Tuning and power", "applies_to": ["osc"],
     "rule": "Warm up 5-10 minutes, then auto-tune with MENU + LOAD (about a minute, audible). Use a good 1 A USB supply on the same mains as the audio gear; poor supplies cause noise, wobbly oscillators or no boot."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "poly_pressure"}, {"message": "program_change"},
                 {"message": "control_change", "note": "every slider parameter, play mode, LFO types, mod source and depths, reverb, legato, sustain (CC 64)"}, {"message": "clock", "note": "LFO BPM mode"},
                 {"message": "mpe"}, {"message": "sysex", "header": "F0 00 21 35 00 06", "note": "preset import (write flag, page, bank, preset, Protobuf data)"}],
    "transmits": [{"message": "control_change", "note": "with CC out on"}, {"message": "program_change", "note": "with PC out on"}, {"message": "sysex", "note": "current preset on load; current or full dump"}],
    "channel_note": "One channel 1-16 (learned or set on MENU 7), or MPE.", "note": "MIDI in on 3.5 mm TRS or USB; MIDI out over USB."}
D["specifications"] = {
    "voices": 6, "oscillators_per_voice": "1 + sub + noise", "filters": {"lpf": "24 dB/oct resonant, 32.7 Hz-16.7 kHz", "hpf": "6 dB/oct non-resonant"},
    "envelopes": "12 (2 per voice)", "lfos": "7 (1 per voice + 1 global)", "play_modes": 6, "effects": "digital reverb", "presets": "98 (49 user, 49 factory)",
    "connections": {"midi_in": "3.5 mm TRS", "audio_out": "line out and headphones", "usb": "power and MIDI"}, "power": "USB, at least 1 A (about 55 hours from a 20,000 mAh power bank)",
    "factory_presets": "A1 Long Pad 1 ... G7 (listed in the manual)",
}
D["omitted_from_source"] = ["the introduction story", "synthesis basics", "menu map graphic (read where the text repeats it)", "the factory preset list with LFO settings"]
D["not_in_source"] = ["envelope and LFO times", "audio jack sizes and output level", "USB connector type", "dimensions and weight", "where the menu sets LFO type and legato (menu map image)", "SysEx Protobuf layout"]
D["source_inconsistencies"] = [
    "Key features say 'MIDI in/out over USB or via MIDI out via DIN5', but the panel has a 3.5 mm MIDI IN and the supplied cable is a DIN-to-3.5 mm input adapter.",
    "The filter text says the high-pass follows the low-pass in series per voice; the block diagram places it after the six voices are summed.",
    "Section 5.9 says each of mod wheel, velocity and aftertouch reaches 28 slider destinations; the CC list adds four reverb destinations (CC 86-89) and LFO 2 delay/fade.",
    "The CC list has no CC 38; destination depths run 31-37 and 39-63.",
    "The CC list labels the amp envelope depth rows 'Mod Source Filter AMP Attack Depth' etc.",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); LFO 2, high-pass, reverb and output are common."},
    {"topic": "Assignable modulation", "detail": "Each of four sources has a depth for each of 36 destinations; modelled as a dense matrix keyed by depth CC."},
    {"topic": "Menu map", "detail": "The menu map is an image; LFO type, key sync and legato are placed in the menu by inference."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/dreadbox-nymphes_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
