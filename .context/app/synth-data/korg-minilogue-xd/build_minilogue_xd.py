#!/usr/bin/env python3
"""Assemble the Korg minilogue xd device file (schema 0.12.0).

Four analogue voices after the Korg prologue: two VCOs (square, triangle, saw with
shape) with sync, ring and cross mod; a digital MULTI ENGINE per voice (noise, VPM
oscillator, user oscillators); mixer; low-pass VCF with drive and keytrack; amp ADSR,
a second AD envelope and an LFO; digital modulation, delay and reverb; 500 programs,
four voice modes, 16-step polyphonic sequencer with four motion lanes, joystick, two
CV inputs, sync in/out, MIDI and USB. The keyboardless xd module shares the engine.

Source: minilogue xd / minilogue xd module owner's manual.
"""
import json

D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []
K1023 = {"min": 0, "max": 1023}


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", **kw):
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


def knob(id, module, label, fn, rng=(0, 1023), **kw):
    par(id, module, label, "integer", fn, range={"min": rng[0], "max": rng[1]}, **kw)


def sw(id, module, label, fn, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control=control, values=[{"value": v} for v in vals], **kw)


def edit(id, module, label, kind, fn, mode, button, memory="patch", **kw):
    acc = [{"type": "menu", "note": f"EDIT MODE: {mode}, button {button}", "mode": mode, "button": button}]
    par(id, module, label, kind, fn, memory=memory, access=acc, **kw)


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


def eq(p, v):
    return {"param": p, "equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


JOY_TARGETS = ["GATE TIME", "PORTAMENTO", "VOICE MODE DEPTH", "VCO1 PITCH", "VCO1 SHAPE", "VCO2 PITCH", "VCO2 SHAPE", "CROSS MOD", "MULTI SHAPE", "VCO1 LEVEL", "VCO2 LEVEL",
               "MULTI LEVEL", "CUTOFF", "RESONANCE", "A.EG ATTACK", "A.EG DECAY", "A.EG SUSTAIN", "A.EG RELEASE", "EG ATTACK", "EG DECAY", "EG INT", "LFO RATE", "LFO INT",
               "MOD TIME", "MOD DEPTH", "REVERB TIME", "REVERB DEPTH", "DELAY TIME", "DELAY DEPTH"]

D["device"] = {
    "id": "korg-minilogue-xd", "manufacturer": "Korg", "model": "minilogue xd",
    "category": "4-voice analogue polyphonic synthesizer with digital multi engine and effects, 37 keys (also as the keyboardless xd module)",
    "based_on": "Analogue voice after the Korg prologue; successor to the minilogue (2016); released 2019.",
    "sources": [{"id": "manual", "title": "Korg minilogue xd / minilogue xd module Owner's Manual", "kind": "user_manual", "file": "Korg_Minilogue_XD.pdf", "pages": 68,
                 "note": "Panel, program architecture, every basic and edit-mode parameter, sequencer and motion sequencing, global settings, CV and sync, MIDI overview, effects list, program list, specifications."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 4, "polyphony_mode": "4-voice polyphonic; POLY (with DUO stacking), UNISON, CHORD or ARP/LATCH voice modes; poly-chain with a second unit",
    "poly_chain_max_units": 2, "patch_memory": True,
    "patch_memory_note": "500 programs (200 preset, 300 user by default), each with voice mode, effects and a 16-step sequence with up to four motion lanes; MASTER and joystick position not stored. Favourites on buttons 1-16.",
    "semi_modular": False, "panel_counts": {"keys": 37, "knobs": 24, "step_buttons": 16},
    "summary": ("Per voice: two analogue VCOs (square, triangle or saw with a SHAPE control) with sync, ring and cross mod; a digital MULTI ENGINE (four filtered noises, a 16-type VPM "
                "oscillator, or up to 16 user oscillators via the logue SDK) mixed before or after the filter; a low-pass VCF with three-stage drive and keytrack; an ADSR on the VCA, "
                "an AD envelope to pitch or cutoff, and an LFO to cutoff, shape or pitch. Digital modulation (chorus, ensemble, phaser, flanger, user), delay and reverb. Voice modes, "
                "arpeggiator, 16-step polyphonic sequencer with motion, joystick, two CV inputs, oscilloscope display."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "VOICE MODE / KEYBOARD",
    "37 slim velocity keys (buttons 1-16 on the module); assigns four voices per VOICE MODE; octave shift, portamento, microtuning, CV/gate input, damper.",
    ["kbd.midi_in", "kbd.seq_in", "kbd.damper", "kbd.ext_cv", "kbd.ext_gate"], ["kbd.pitch", "kbd.gate", "kbd.velocity"], scope="common", props={"keys": 37})
mod("joy", "manual_controller", "Joystick", "left of keyboard", "X: pitch bend (range per direction). Y+ and Y-: any of 29 assignable parameters at set ranges.", [], ["joy.x"], scope="common")
mod("arpseq", "sequencer", "Sequencer and arpeggiator", "SEQUENCER / VOICE MODE", "16-step polyphonic sequencer (step, real-time and motion recording, four motion lanes) and 13-type arpeggiator; 10-300 BPM, MIDI, USB or SYNC IN clock.",
    ["arpseq.sync_in"], ["arpseq.notes", "arpseq.sync_out"], scope="common", props={"steps": 16, "motion_lanes": 4})
for n in (1, 2):
    mod(f"vco{n}", "oscillator", f"VCO {n}", f"VCO {n}", "Analogue oscillator: square, triangle or saw, 16'-2', pitch ±1200 cents, SHAPE (duty cycle or waveshaping)."
        + (" Can be synced to, ring-modulated by and cross-modulated by VCO 1." if n == 2 else ""),
        [f"vco{n}.pitch_cv", f"vco{n}.shape_cv"] + (["vco2.sync_in", "vco2.ring_in", "vco2.xmod"] if n == 2 else []), [f"vco{n}.out"])
mod("multi", "oscillator", "MULTI ENGINE", "MULTI ENGINE", "Digital engine: noise (High, Low, Peak, Decim), VPM oscillator (16 types, carrier and modulator with internal EG), or user oscillator (up to 16, logue SDK).",
    ["multi.pitch_cv", "multi.shape_cv"], ["multi.out"], props={"vpm_types": 16, "user_slots": 16})
mod("mixer", "mixer", "Mixer", "MIXER", "VCO 1, VCO 2 and MULTI levels (0-1023) into the filter.", ["mixer.vco1", "mixer.vco2", "mixer.multi"], ["mixer.out"])
mod("vcf", "filter", "VCF", "FILTER", "Analogue low-pass with resonance, three-step drive and three-step keytrack (centred on C4).", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"])
mod("post", "summer", "Post-VCF mix", "(internal)", "Adds the MULTI ENGINE after the filter when Multi Routing is Post VCF.", ["post.vcf", "post.multi"], ["post.out"])
mod("amp_eg", "envelope", "AMP EG", "AMP EG", "ADSR on the VCA.", ["amp_eg.gate"], ["amp_eg.out"])
mod("eg", "envelope", "EG", "EG", "Attack/decay envelope with bipolar EG INT to pitch (all oscillators), pitch 2 (VCO 2) or cutoff.", ["eg.gate"], ["eg.out"])
mod("lfo", "lfo", "LFO", "LFO", "Square, triangle or saw; 1-SHOT, NORMAL (0.05-28 Hz) or BPM-synced; to cutoff, shape or pitch.", ["lfo.key_sync"], ["lfo.out"], props={"rate_hz": [0.05, 28]})
mod("vca", "vca", "VCA", "AMP EG", "Shapes each voice with the amp envelope and velocity.", ["vca.in", "vca.cv"], ["vca.out"])
mod("fx", "effects", "Effects", "EFFECTS", "Digital MOD (chorus, ensemble, phaser, flanger, user), DELAY (11 sub-types) and REVERB (10 sub-types), each with on/off, time, depth and wet/dry (delay, reverb).",
    ["fx.in"], ["fx.out_l", "fx.out_r"], scope="common")
mod("out", "output", "Output", "MASTER / rear panel", "MASTER sets stereo output and headphone level.", ["out.l", "out.r"], ["out.main_l", "out.main_r", "out.phones"], scope="common")
mod("cvin", "cv_source_selector", "CV inputs", "rear panel", "CV IN 1 and 2: modulation of assignable parameters (-5 to +5 V), or pitch CV and gate (CV/Gate mode).", ["cvin.in1", "cvin.in2"],
    ["cvin.pitch", "cvin.gate"], scope="common")

# ---------------------------------------------------------------- panel parameters
par("out.master", "out", "MASTER", "continuous", "Output level (not stored).", memory="none", panel_scale={"min": 0, "max": 10})
par("kbd.octave", "kbd", "OCTAVE", "integer", "Keyboard octave shift.", memory="none", control="push_button", range={"min": -2, "max": 2})
par("arpseq.tempo", "arpseq", "TEMPO", "continuous", "Program tempo for sequencer and arpeggiator.", physical={"min": 56, "max": 240, "unit": "BPM"})
knob("kbd.portamento", "kbd", "PORTAMENTO", "Portamento time.", (0, 127))
knob("kbd.voice_mode_depth", "kbd", "VOICE MODE DEPTH", "POLY: towards DUO stacking and detune. UNISON: detune 0-50 cents. CHORD: chord type. ARP: arpeggio type.")
sw("kbd.voice_mode", "kbd", "VOICE MODE TYPE", "Voice mode (ARP/LATCH down again for latch).", ["arp_latch", "chord", "unison", "poly"])
for n in (1, 2):
    sw(f"vco{n}.wave", f"vco{n}", f"VCO {n} WAVE", "Waveform.", ["sqr", "tri", "saw"])
    sw(f"vco{n}.octave", f"vco{n}", f"VCO {n} OCTAVE", "Footage.", ["16'", "8'", "4'", "2'"], "rotary_switch")
    knob(f"vco{n}.pitch", f"vco{n}", f"VCO {n} PITCH", "Tuning in cents.", (-1200, 1200))
    knob(f"vco{n}.shape", f"vco{n}", f"VCO {n} SHAPE", "Duty cycle (square) or waveshape.")
sw("vco2.sync", "vco2", "SYNC", "VCO 2 phase synced to VCO 1.", ["off", "on"])
sw("vco2.ring", "vco2", "RING", "VCO 1 ring-modulates VCO 2.", ["off", "on"])
knob("vco2.cross_mod", "vco2", "CROSS MOD DEPTH", "VCO 1 modulates VCO 2's pitch.")
sw("multi.engine", "multi", "NOISE/VPM/USR", "Engine type.", ["noise", "vpm", "usr"])
par("multi.type", "multi", "TYPE (multi engine)", "enum", "Noise: High, Low, Peak, Decim. VPM: Sin1-4, Saw1-2, Squ1-2, Fat1-2, Air1-2, Decay1-2, Creep, Throat. USR: user oscillator.",
    control="knob", values=[{"value": v} for v in ["High", "Low", "Peak", "Decim", "Sin1", "Sin2", "Sin3", "Sin4", "Saw1", "Saw2", "Squ1", "Squ2", "Fat1", "Fat2", "Air1", "Air2",
                                                    "Decay1", "Decay2", "Creep", "Throat", "user 1-16"]])
knob("multi.shape", "multi", "SHAPE (multi engine)", "Noise: cutoff (10 Hz-21 kHz), bandwidth (110-880 Hz) or sample rate (240 Hz-48 kHz). VPM: modulation depth. USR: per oscillator.")
par("multi.shift_shape", "multi", "SHIFT + SHAPE", "continuous", "Decim key track (0-100%), VPM ratio offset, or a user oscillator parameter.",
    access=[{"type": "gesture", "gesture": "hold SHIFT and turn the MULTI ENGINE SHAPE knob", "when": "any_time"}], panel_scale={"min": 0, "max": 100})
for k, lab in (("vco1", "VCO 1"), ("vco2", "VCO 2"), ("multi", "MULTI")):
    knob(f"mixer.{k}", "mixer", f"{lab} (mixer)", f"{lab} level.")
knob("vcf.cutoff", "vcf", "CUTOFF", "Low-pass cutoff.")
knob("vcf.resonance", "vcf", "RESONANCE", "Emphasis at cutoff.")
sw("vcf.drive", "vcf", "DRIVE", "Drive circuit amount.", ["0%", "50%", "100%"])
sw("vcf.keytrack", "vcf", "KEYTRACK", "Keyboard tracking of cutoff, centred on C4.", ["0%", "50%", "100%"])
for k in ("attack", "decay", "sustain", "release"):
    knob(f"amp_eg.{k}", "amp_eg", f"AMP EG {k.upper()}", f"Amp envelope {k}.")
knob("eg.attack", "eg", "EG ATTACK", "EG attack.")
knob("eg.decay", "eg", "EG DECAY", "EG decay.")
par("eg.int", "eg", "EG INT", "continuous", "Bipolar EG intensity.", physical={"min": -100, "max": 100, "unit": "%"})
sw("eg.target", "eg", "EG TARGET", "EG destination.", ["pitch", "pitch2", "cutoff"])
sw("lfo.wave", "lfo", "LFO WAVE", "LFO waveform.", ["sqr", "tri", "saw"])
sw("lfo.mode", "lfo", "LFO MODE", "One half-cycle per note, free 0.05-28 Hz, or BPM-synced.", ["1_shot", "normal", "bpm"])
knob("lfo.rate", "lfo", "LFO RATE", "Rate, or a note division in BPM mode.")
knob("lfo.int", "lfo", "LFO INT", "Intensity; SHIFT + turn inverts (0 to -511).", (-511, 511))
sw("lfo.target", "lfo", "LFO TARGET", "LFO destination.", ["cutoff", "shape", "pitch"])
sw("fx.select", "fx", "DEL/REV/MOD", "Which effect the controls edit.", ["del", "rev", "mod"])
sw("fx.state", "fx", "OFF/ON/SELECT", "Effect off or on; SELECT steps types (SHIFT + SELECT for sub-types).", ["off", "on", "select"])
par("fx.time", "fx", "TIME (effects)", "continuous", "Delay time, reverb time or modulation speed (per effect).", panel_scale={"min": 0, "max": 100})
par("fx.depth", "fx", "DEPTH (effects)", "continuous", "Effect depth; SHIFT + DEPTH sets delay or reverb wet/dry.", physical={"min": 0, "max": 100, "unit": "%"})
for e, subs in (("mod", ["chorus", "ensemble", "phaser", "flanger", "user"]),
                ("delay", ["Stereo", "Mono", "Ping Pong", "Hipass", "Tape", "One Tap", "Stereo BPM", "Mono BPM", "Ping BPM", "Hipass BPM", "Tape BPM", "Doubling"]),
                ("reverb", ["Hall", "Smooth", "Arena", "Plate", "Room", "Early Ref", "Space", "Riser", "Submarine", "Horror"])):
    par(f"fx.{e}_type", "fx", f"{e.upper()} type", "enum", f"{e.title()} type or sub-type, stored per effect with its on/off, time and depth.",
        access=[{"type": "panel", "control": "toggle_switch", "note": f"DEL/REV/MOD at {e.upper()[:3]}, then SELECT"}], values=[{"value": v} for v in subs])
for pid, label, fn in (("ui.edit", "EDIT MODE", "Cycles PROGRAM, SEQ and GLOBAL edit modes."), ("ui.write", "WRITE", "Saves the program; SHIFT + WRITE loads the panel."),
                       ("ui.exit", "EXIT", "Leaves edit pages."), ("ui.shift", "SHIFT", "Second functions."), ("arpseq.motion", "MOTION MODE", "Motion view and recording."),
                       ("arpseq.play", "PLAY", "Plays the sequence."), ("arpseq.rec", "REC", "Step or real-time recording."), ("arpseq.rest", "REST", "Rest or tie (with a key held)."),
                       ("ui.buttons", "Buttons 1-16", "Steps, favourites, edit pages; keyboard on the module.")):
    par(pid, "arpseq" if pid.startswith("arpseq") else "kbd", label, "boolean", fn, memory="none", control="push_button")
par("ui.program", "kbd", "PROGRAM/VALUE", "integer", "Selects programs 1-500 and edits values.", memory="none", control="encoder", range={"min": 1, "max": 500})
par("joy.position", "joy", "Joystick", "continuous", "X bend, Y assignable.", memory="none", control="joystick", panel_scale={"min": -1, "max": 1})
# program edit
edit("joy.x_plus", "joy", "X+ Bend Range", "enum", "Upward bend range.", "PROGRAM EDIT", 4, values=[{"value": "off"}] + [{"value": f"{i} note"} for i in range(1, 13)])
edit("joy.x_minus", "joy", "X- Bend Range", "enum", "Downward bend range.", "PROGRAM EDIT", 4, values=[{"value": "off"}] + [{"value": f"{i} note"} for i in range(1, 13)])
for d in ("plus", "minus"):
    edit(f"joy.y_{d}_assign", "joy", f"Y{'+' if d == 'plus' else '-'} Assign", "enum", "Parameter the joystick moves in this direction.", "PROGRAM EDIT", 4, values=[{"value": v} for v in JOY_TARGETS])
    edit(f"joy.y_{d}_range", "joy", f"Y{'+' if d == 'plus' else '-'} Range", "integer", "Amount, -100 to +100%.", "PROGRAM EDIT", 4, range={"min": -100, "max": 100})
edit("cvin.mode", "cvin", "CV IN Mode", "enum", "Modulation (assignable, -5..5 V) or CV/Gate (IN1 pitch -3..5 V, 1 V = C4; IN2 gate 0-5 V).", "PROGRAM EDIT", 5,
     values=[{"value": "modulation"}, {"value": "cv_gate"}])
for n in (1, 2):
    edit(f"cvin.assign{n}", "cvin", f"CV IN{n} Assign", "enum", "Parameter controlled in Modulation mode.", "PROGRAM EDIT", 5, values=[{"value": v} for v in JOY_TARGETS])
    edit(f"cvin.range{n}", "cvin", f"CV IN{n} Range", "integer", "Amount, -100 to +100%.", "PROGRAM EDIT", 5, range={"min": -100, "max": 100})
edit("kbd.microtuning", "kbd", "Microtuning", "enum", "Equal Temp, Pure Major/Minor, Pythagorean, Werckmeister, Kirnberger, Slendro, Pelog, modes, Reverse, AFX 001-006, DC 001-003, User Scale 1-6, User Octave 1-6.",
     "PROGRAM EDIT", 6, values=[{"value": "Equal Temp"}, {"value": "others"}])
edit("kbd.scale_key", "kbd", "Scale Key", "integer", "Key of the microtuning, ±12 notes.", "PROGRAM EDIT", 6, range={"min": -12, "max": 12})
edit("kbd.program_tuning", "kbd", "Program Tuning", "integer", "±50 cents.", "PROGRAM EDIT", 6, range={"min": -50, "max": 50})
edit("kbd.transpose", "kbd", "Transpose", "integer", "±12 semitones.", "PROGRAM EDIT", 6, range={"min": -12, "max": 12})
edit("lfo.target_osc", "lfo", "LFO Target OSC", "enum", "Oscillators the LFO's shape or pitch modulation reaches.", "PROGRAM EDIT", 7, values=[{"value": v} for v in ["all", "vco1_2", "vco2", "multi"]])
edit("lfo.key_sync", "lfo", "LFO Key Sync", "boolean", "Resets LFO phase on each note.", "PROGRAM EDIT", 7)
edit("lfo.voice_sync", "lfo", "LFO Voice Sync", "boolean", "Same LFO phase in all voices.", "PROGRAM EDIT", 7)
edit("eg.velocity", "eg", "EG Velocity", "integer", "Velocity control of EG INT (cutoff).", "PROGRAM EDIT", 8, range={"min": 0, "max": 127})
edit("vca.velocity", "vca", "Amp Velocity", "integer", "Velocity control of volume.", "PROGRAM EDIT", 8, range={"min": 0, "max": 127})
edit("kbd.aftertouch", "kbd", "MIDI Aftertouch", "enum", "Parameter controlled by incoming MIDI aftertouch.", "PROGRAM EDIT", 8, values=[{"value": v} for v in JOY_TARGETS])
edit("multi.octave", "multi", "Multi Octave", "enum", "MULTI ENGINE octave.", "PROGRAM EDIT", 9, values=[{"value": v} for v in ["16'", "8'", "4'", "2'"]])
edit("multi.routing", "multi", "Multi Routing", "enum", "Mix the MULTI ENGINE before the VCF or after it.", "PROGRAM EDIT", 9, values=[{"value": "pre_vcf"}, {"value": "post_vcf"}])
edit("eg.legato", "eg", "EG Legato", "boolean", "UNISON/CHORD: no EG retrigger on legato notes.", "PROGRAM EDIT", 9)
edit("kbd.portamento_mode", "kbd", "Portamento Mode", "enum", "Legato only (Auto) or always (On).", "PROGRAM EDIT", 9, values=[{"value": "auto"}, {"value": "on"}])
edit("kbd.portamento_bpm", "kbd", "Portamento BPM", "boolean", "Portamento time synced to BPM.", "PROGRAM EDIT", 9)
edit("out.program_level", "out", "Program Level", "integer", "-18 to +6 dB.", "PROGRAM EDIT", 9, range={"min": -18, "max": 6})
for i, nm in enumerate(["Feedback", "Noise Depth", "Shape Mod Int", "Mod Attack", "Mod Decay", "Mod Key Track"], start=1):
    edit(f"multi.vpm_p{i}", "multi", f"Parameter {i} ({nm})", "integer", f"VPM {nm.lower()} offset, -100 to +100% (user oscillators: per SDK).", "PROGRAM EDIT", 10, range={"min": -100, "max": 100})
# seq edit
edit("arpseq.bpm", "arpseq", "BPM", "continuous", "Sequencer tempo.", "SEQ EDIT", 5, physical={"min": 10, "max": 300, "unit": "BPM"})
edit("arpseq.arp_rate", "arpseq", "Rate (ARP)", "enum", "Arpeggio step length.", "SEQ EDIT", 6, values=[{"value": v} for v in ["64th", "48th", "24th", "16th", "16.th", "12th", "8th", "8.th", "6th", "4th"]])
edit("arpseq.arp_gate", "arpseq", "Gate Time (ARP)", "integer", "Arpeggio gate 0-100%.", "SEQ EDIT", 6, range={"min": 0, "max": 100})
edit("arpseq.step_length", "arpseq", "Step Length", "integer", "Sequence length.", "SEQ EDIT", 7, range={"min": 1, "max": 16})
edit("arpseq.step_resolution", "arpseq", "Step Resolution", "enum", "Step note value.", "SEQ EDIT", 7, values=[{"value": "1/16"}, {"value": "other values"}], note="Values not read.")
edit("arpseq.swing", "arpseq", "Swing", "integer", "Swing amount.", "SEQ EDIT", 7, range={"min": -75, "max": 75}, confidence="inferred", note="Range not read from the manual.")
edit("arpseq.default_gate", "arpseq", "Default Gate Time", "integer", "Gate time for recorded notes (and the arpeggiator).", "SEQ EDIT", 7, range={"min": 0, "max": 100})
# global
for pid, label, fn, vals, btn in (("sys.local", "Local SW", "Keyboard plays the engine.", ["off", "on"], 3), ("sys.velocity_curve", "Velocity Curve", "Keyboard velocity response.", ["curves"], 3),
                                  ("sys.knob_mode", "Knob Mode", "Jump, Catch or Scale.", ["jump", "catch", "scale"], 3), ("sys.sync_in_unit", "Sync In Unit", "Steps per SYNC IN pulse.", ["16th", "8th"], 5),
                                  ("sys.sync_out_unit", "Sync Out Unit", "SYNC OUT pulse spacing.", ["16th", "8th"], 5), ("sys.sync_in_pol", "Sync In Polarity", "Edge.", ["rise", "fall"], 5),
                                  ("sys.sync_out_pol", "Sync Out Polarity", "Edge.", ["rise", "fall"], 5), ("sys.midi_route", "MIDI Route", "USB and DIN, or USB only.", ["usb_midi", "usb"], 6),
                                  ("sys.clock_source", "Clock Source", "Auto (USB), Auto (MIDI) or Internal; SYNC IN overrides.", ["auto_usb", "auto_midi", "internal"], 6),
                                  ("sys.rx_transport", "En Rx Transport", "Receive start/stop/continue.", ["off", "on"], 6), ("sys.poly_chain", "Poly Chain", "Chain with another unit.", ["off", "master", "slave"], 6)):
    edit(pid, "kbd", label, "enum", fn, "GLOBAL EDIT", btn, memory="global", values=[{"value": v} for v in vals])
edit("sys.midi_ch", "kbd", "MIDI Ch", "integer", "MIDI channel.", "GLOBAL EDIT", 6, memory="global", range={"min": 1, "max": 16})
edit("sys.master_tune", "kbd", "Master Tune", "integer", "Global tuning in cents.", "GLOBAL EDIT", 3, memory="global", range={"min": -50, "max": 50}, confidence="inferred", note="Range not read.")
for f in ("rx_prog_chg", "rx_cc", "rx_pitch_bend", "tx_prog_chg", "tx_cc", "tx_pitch_bend"):
    edit(f"sys.midi_{f}", "kbd", f"MIDI {f.replace('_', ' ').title().replace('Rx', 'Rx').replace('Cc', 'CC')}", "boolean", "MIDI filter.", "GLOBAL EDIT", 7, memory="global", default=True)

# ---------------------------------------------------------------- ports
jack("jack.out_l", "OUTPUT L/MONO", "out", "audio", "out.main_l", "Unbalanced; mono when R is unplugged.", "6.35 mm TS")
jack("jack.out_r", "OUTPUT R", "out", "audio", "out.main_r", "Unbalanced.", "6.35 mm TS")
jack("jack.phones", "Headphones", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS")
jack("jack.damper", "DAMPER", "in", "gate", "kbd.damper", "DS-1H damper (no half-damper).", "6.35 mm TS")
jack("jack.sync_in", "SYNC IN", "in", "clock", "arpseq.sync_in", "Analogue clock (20 V max); overrides MIDI clock when patched.", "3.5 mm TRS")
jack("jack.sync_out", "SYNC OUT", "out", "clock", "arpseq.sync_out", "Clock pulses, 5 V.", "3.5 mm TRS")
jack("jack.cv_in1", "CV IN 1", "in", "cv", "cvin.in1", "Assignable modulation (-5..5 V) or pitch CV (-3..5 V, 1 V/oct, 1 V = C4).", "3.5 mm TS")
jack("jack.cv_in2", "CV IN 2", "in", "cv", "cvin.in2", "Assignable modulation (-5..5 V) or gate (0-5 V).", "3.5 mm TS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.usb", "USB B", "bidirectional", "midi", None, "USB MIDI, librarian, user oscillators and effects, firmware.", "USB type B")
jack("jack.dc", "DC 9V", "in", "power", None, "AC adapter, 9 V DC; power switch beside it.", "DC barrel")

# ---------------------------------------------------------------- connections
con("arpseq.notes", "kbd.seq_in", note="Sequencer and arpeggiator notes.")
con("cvin.pitch", "kbd.ext_cv", eq("cvin.mode", "cv_gate"))
con("cvin.gate", "kbd.ext_gate", "gate", eq("cvin.mode", "cv_gate"))
con("joy.x", "vco1.pitch_cv", amount="joy.x_plus", note="Range per direction (X+ / X-).")
con("joy.x", "vco2.pitch_cv", amount="joy.x_plus")
con("joy.x", "multi.pitch_cv", amount="joy.x_plus")
for o in ("vco1", "vco2", "multi"):
    con("kbd.pitch", f"{o}.pitch_cv")
    con("eg.out", f"{o}.pitch_cv", eq("eg.target", "pitch") if o != "vco2" else anyof("eg.target", "pitch", "pitch2"), amount="eg.int")
    tgt = {"vco1": ["all", "vco1_2"], "vco2": ["all", "vco1_2", "vco2"], "multi": ["all", "multi"]}[o]
    con("lfo.out", f"{o}.pitch_cv", {"all": [eq("lfo.target", "pitch"), anyof("lfo.target_osc", *tgt)]}, amount="lfo.int")
    con("lfo.out", f"{o}.shape_cv", {"all": [eq("lfo.target", "shape"), anyof("lfo.target_osc", *tgt)]}, amount="lfo.int")
con("vco1.out", "vco2.sync_in", "sync", eq("vco2.sync", "on"))
con("vco1.out", "vco2.ring_in", "audio", eq("vco2.ring", "on"))
con("vco1.out", "vco2.xmod", "audio", amount="vco2.cross_mod")
con("vco1.out", "mixer.vco1", "audio", amount="mixer.vco1")
con("vco2.out", "mixer.vco2", "audio", amount="mixer.vco2")
con("multi.out", "mixer.multi", "audio", eq("multi.routing", "pre_vcf"), amount="mixer.multi")
con("multi.out", "post.multi", "audio", eq("multi.routing", "post_vcf"), amount="mixer.multi")
con("mixer.out", "vcf.in", "audio")
con("eg.out", "vcf.cutoff_cv", eq("eg.target", "cutoff"), amount="eg.int", note="Velocity scales the EG INT by EG Velocity.")
con("lfo.out", "vcf.cutoff_cv", eq("lfo.target", "cutoff"), amount="lfo.int")
con("kbd.pitch", "vcf.cutoff_cv", {"param": "vcf.keytrack", "not_equals": "0%"})
con("vcf.out", "post.vcf", "audio")
con("post.out", "vca.in", "audio")
con("kbd.gate", "amp_eg.gate", "gate")
con("kbd.gate", "eg.gate", "gate")
con("kbd.gate", "lfo.key_sync", "gate", eq("lfo.key_sync", True))
con("amp_eg.out", "vca.cv")
con("kbd.velocity", "vca.cv", amount="vca.velocity")
con("vca.out", "fx.in", "audio", note="Four voices summed.")
con("fx.out_l", "out.l", "audio")
con("fx.out_r", "out.r", "audio")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "oled", "module": "kbd", "label": "Main display", "kind": "display", "function": "Organic EL with real-time oscilloscope: program, parameter values, edit pages, motion view."},
    {"id": "multi_display", "module": "multi", "label": "MULTI ENGINE display", "kind": "display", "function": "6-character 7-segment display of the engine type."},
    {"id": "button_leds", "module": "arpseq", "label": "button and step LEDs", "kind": "led", "function": "Steps, motion, favourites, edit pages; latch state blinks."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Voice modes", "applies_to": ["kbd"],
     "rule": "POLY: four voices, DEPTH moves towards DUO (two stacked, detuned voices per key). UNISON: all four on one note, DEPTH sets detune (0-50 cents). CHORD: DEPTH picks mono or one of 14 chord types. "
             "ARP/LATCH: arpeggiator (13 types), switch down again to latch."},
    {"id": "b02", "name": "Signal path", "applies_to": ["vco1", "vco2", "multi", "mixer", "vcf", "vca", "fx"],
     "rule": "Per voice: VCO 1, VCO 2 and the MULTI ENGINE into the mixer, the low-pass VCF and VCA (MULTI optionally after the filter). Four voices summed into the digital effects, then the stereo outputs."},
    {"id": "b03", "name": "Oscillator interaction", "applies_to": ["vco2"], "rule": "SYNC resets VCO 2 from VCO 1; RING ring-modulates VCO 2 by VCO 1; CROSS MOD lets VCO 1 frequency-modulate VCO 2."},
    {"id": "b04", "name": "MULTI ENGINE", "applies_to": ["multi"],
     "rule": "Noise: high-pass, low-pass, peak or decimated noise, SHAPE setting cutoff, bandwidth or sample rate. VPM: one carrier and one modulator, 16 types, SHAPE = modulation depth, SHIFT + SHAPE = ratio, six offsets in edit mode. "
             "USR: oscillators loaded with the logue SDK."},
    {"id": "b05", "name": "Modulation", "applies_to": ["eg", "lfo", "joy", "cvin"],
     "rule": "EG to pitch (all), pitch 2 (VCO 2) or cutoff. LFO to cutoff, shape or pitch, with the target oscillators set in edit mode. Joystick X bends; Y+ and Y-, CV IN 1/2 and MIDI aftertouch each control one of 29 parameters at a set range."},
    {"id": "b06", "name": "Effects", "applies_to": ["fx"],
     "rule": "One modulation, one delay and one reverb at once, each storing its own on/off, type, time and depth; DEL/REV/MOD chooses which the controls edit. User effects load via the SDK (delay and reverb user effects not together)."},
    {"id": "b07", "name": "Sequencer", "applies_to": ["arpseq"],
     "rule": "16-step polyphonic: step recording (keys, REST for rests, REST with a key held for ties), real-time overdub, and up to four motion sequences of knobs and switches (not MASTER, TEMPO, OCTAVE, USR type, DRIVE, DEL/REV/MOD or SELECT). "
             "Step edit by holding step buttons. Saved with the program."},
    {"id": "b08", "name": "Programs", "applies_to": ["kbd"], "rule": "Edits are lost without WRITE. SHIFT + WRITE loads the current panel as the sound. Program edit and seq edit settings save with the program; global settings save automatically."},
    {"id": "b09", "name": "CV inputs", "applies_to": ["cvin"], "rule": "Modulation mode: two assignable CVs (-5 to +5 V). CV/Gate mode: CV IN 1 pitch (1 V/oct, 1 V = C4, -3 to +5 V), CV IN 2 gate (0-5 V)."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure", "note": "to the MIDI Aftertouch target"}, {"message": "program_change"},
                 {"message": "control_change", "note": "main sound parameters; CC 1 mod wheel and CC 64 damper always; numbers in Korg's separate MIDI implementation"}, {"message": "clock"},
                 {"message": "start"}, {"message": "stop"}, {"message": "continue"}, {"message": "sysex", "note": "program, scale and all-data dumps; user oscillator and effect loading"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "program_change"}, {"message": "control_change"}, {"message": "clock"}, {"message": "sysex"}],
    "channel_note": "One channel 1-16; DIN and USB or USB only; filters for program change, CC and pitch bend in each direction.", "note": "The CC number table is not in this manual."}
D["specifications"] = {
    "keyboard": "37 slim keys, velocity (module: buttons 1-16)", "polyphony": 4, "sound_generation": "2 VCO, MULTI ENGINE, 1 VCF, 2 EG, 1 LFO, 1 VCA per voice",
    "programs": "500 (200 preset, 300 user)", "voice_modes": ["ARP/LATCH", "CHORD", "UNISON", "POLY"], "sequencer": "16-step polyphonic, 4 motion lanes",
    "effects": ["DELAY", "REVERB", "MOD (chorus, ensemble, phaser, flanger, user)"], "lfo_hz": [0.05, 28],
    "displays": {"main": "organic EL with oscilloscope", "multi_engine": "7-segment, 6 characters"},
    "connections": {"outputs": "L/MONO, R: 6.3 mm unbalanced", "phones": "6.3 mm stereo", "damper": "6.3 mm", "sync": "3.5 mm in (20 V max) and out (5 V)",
                    "cv_in": "2 x 3.5 mm, -5..5 V (modulation) or -3..5 V (CV/gate)", "midi": "DIN in, out", "usb": "type B"},
    "power": {"adaptor": "9 V DC", "consumption_w": 8}, "dimensions_mm": {"keyboard": {"w": 500, "d": 300, "h": 85}, "module": {"w": 500, "d": 179, "h": 85}},
    "weight_kg": {"keyboard": 2.8, "module": 2.6},
}
D["omitted_from_source"] = ["safety notes", "the 200-program preset list", "microtuning editing steps", "user scale and dump procedures", "librarian and SDK instructions"]
D["not_in_source"] = ["filter slope", "envelope times in seconds", "the MIDI CC number table", "VCO frequency range in Hz", "some edit-page value ranges (swing, step resolution, master tune)"]
D["source_inconsistencies"] = [
    "The TEMPO knob range is 56-240 BPM; the SEQ EDIT BPM parameter is 10-300.",
    "MIDI Aftertouch lists its range as 'BALANCE...GATE TIME', but BALANCE is not in the assignable parameter list (GATE TIME to DELAY DEPTH).",
    "The CV IN mode description calls the jacks 'CV1 IN1' and 'CV2 IN2'.",
    "The manual says 'Favorrite' in the step-edit text.",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); effects, sequencer and controllers are common."},
    {"topic": "MIDI CCs", "detail": "Korg publishes the CC table separately; parameters carry panel and edit access only."},
    {"topic": "xd module", "detail": "The keyboardless module (buttons 1-16 as a keyboard) shares this engine and is not modelled separately."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/korg-minilogue-xd_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
