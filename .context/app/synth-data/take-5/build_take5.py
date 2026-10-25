#!/usr/bin/env python3
"""Assemble the Sequential Take 5 device file (schema 0.13.0).

Five-voice analogue poly (44-key keyboard), sibling of the Oberheim TEO-5 on the same
platform: two VCOs per voice with continuously variable shape (sine-saw-pulse), sub
oscillator, white/pink noise, FM 2>1 and sync; a resonant self-oscillating low-pass
filter with drive; two DADSR envelopes on fixed routings; global and per-voice LFOs;
16-slot mod matrix (19 sources, 54 destinations); overdrive, vintage, one digital
effect plus reverb; unison/chord memory, arpeggiator, 64-step sequencer, 256 programs.

Sources: Take 5 User's Guide 1.1 (supplied) and Sequential's Take 5 MIDI
Implementation V2 (CC, NRPN, SysEx).
"""
import json

S10 = {"min": 0, "max": 10}
K127 = {"min": 0, "max": 127}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, nrpn=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("hold")} if "hold" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    if nrpn is not None:
        acc = acc + [{"type": "midi", "message": f"NRPN {nrpn}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, cc=None, nrpn=None, **kw):
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, cc=cc, nrpn=nrpn, **kw)


def btn(id, module, label, fn, cc=None, nrpn=None, **kw):
    par(id, module, label, "boolean", fn, control="push_button", cc=cc, nrpn=nrpn, **kw)


def enum(id, module, label, fn, vals, control="push_button", cc=None, nrpn=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, nrpn=nrpn, values=[{"value": v} for v in vals], **kw)


def prog(id, module, label, kind, fn, cc=None, nrpn=None, **kw):
    acc = [{"type": "menu", "note": "PROGRAM menu"}]
    if "hold" in kw:
        acc.insert(0, {"type": "panel", "control": "push_button", "note": kw.pop("hold")})
    par(id, module, label, kind, fn, access=acc, cc=cc, nrpn=nrpn, **kw)


def glob(id, label, kind, fn, n, nrpn=None, **kw):
    acc = [{"type": "menu", "note": f"GLOBAL menu, {n}"}] + ([{"type": "midi", "message": f"NRPN {nrpn}"}] if nrpn else [])
    par(id, "kbd", label, kind, fn, memory="global", access=acc, **kw)


def jack(id, label, direction, signal, node, fn, connector, **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
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


D["device"] = {
    "id": "sequential-take-5", "manufacturer": "Sequential", "model": "Take 5",
    "category": "5-voice analogue polyphonic synthesizer, 44-key keyboard, with digital effects",
    "based_on": "Compact sibling of the Prophet-5 Rev 4 (released 2021); shares its platform and front-panel layout with the Oberheim TEO-5 (modelled separately).",
    "sources": [
        {"id": "guide", "title": "Sequential Take 5 User's Guide, version 1.1", "kind": "user_manual", "file": "Take_5_User_s_Guide_1_1.pdf", "pages": 119,
         "note": "Rear panel, globals, every section, mod matrix (Appendix A sources, B destinations), unison, effects, arpeggiator, sequencer, tunings."},
        {"id": "midi_impl", "title": "Sequential, 'Take 5 MIDI Implementation' V2 (July 2025)", "kind": "spec_sheet", "file": "https://sequential.com/wp-content/uploads/2025/07/Take-5-MIDI-Implementation_V2.pdf",
         "note": "Official CC table, program NRPNs 0-171, global NRPNs 4096-4122, sequencer NRPNs 4198-4199, SysEx."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 5, "polyphony_mode": "5-voice polyphonic; unison 1-5 voices with key priority, or chord memory",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "256 programs: 128 user and 128 factory (8 banks of 16 each); sequences, chord memory and effects saved per program.",
    "semi_modular": False, "panel_counts": {"keys": 44, "program_select_buttons": 16},
    "summary": ("Per voice: Osc 1 and Osc 2 with octave (5 ranges), pitch (±7 semitones) and SHAPE morphing sine to saw to pulse (pulse width); Osc 2 can frequency-modulate Osc 1 "
                "(amount from its level) and Osc 1 can sync to Osc 2; a sub oscillator from Osc 1; bipolar noise (white one way, pink the other). A resonant low-pass filter with drive "
                "and key tracking, which self-oscillates. Two DADSR envelopes on fixed routings (filter, amp, aux). LFO 1 global and LFO 2 per voice, each with a direct destination. "
                "16-slot matrix. Overdrive, vintage, one of 11 digital effects plus reverb. Arpeggiator, 64-step polyphonic sequencer, low split."),
}

mod("kbd", "voice_allocator", "Keyboard and voice assigner", "KEYBOARD / UNISON / TRANSPOSE", "44-key keyboard with velocity and aftertouch or MIDI; 5 voices, unison with key mode, chord memory, latch/hold, per-oscillator glide, transpose, low split.",
    ["kbd.midi_in", "kbd.sustain", "kbd.pedal", "kbd.seq_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend", "kbd.pedal_out"], scope="common", props={"keys": 44})
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATORS", "Analogue VCO: SHAPE morphs sine, saw and pulse (pulse width); octave and pitch; key follow switchable; FM from Osc 2 and sync to Osc 2.", ["osc1.pitch_cv", "osc1.fm", "osc1.sync_in"], ["osc1.out"])
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATORS", "Analogue VCO with the same controls; FM source for Osc 1.", ["osc2.pitch_cv"], ["osc2.out"])
mod("sub", "oscillator", "Sub oscillator", "MIXER", "Sub oscillator from Osc 1.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "MIXER", "White (knob clockwise) or pink (counter-clockwise) noise.", [], ["noise.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "OSC 1, OSC 1 SUB, OSC 2 (or FM amount when FM 2-1 is on) and NOISE levels.", ["mixer.osc1", "mixer.sub", "mixer.osc2", "mixer.noise"], ["mixer.out"])
mod("vcf", "filter", "Filter", "FILTER", "Resonant low-pass with drive and key tracking; self-oscillates at high resonance.", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"])
mod("vca", "vca", "VCA", "ENVELOPES", "Voice amplifier with pan.", ["vca.in", "vca.cv"], ["vca.out"])
mod("env1", "envelope", "Envelope 1", "ENVELOPES", "DADSR: filter envelope or auxiliary (direct destination or matrix) per ENV ROUTING; bipolar amount, velocity.", ["env1.gate", "env1.velocity"], ["env1.out"])
mod("env2", "envelope", "Envelope 2", "ENVELOPES", "DADSR: amp; filter + amp; or filter + gated amp, per ENV ROUTING.", ["env2.gate", "env2.velocity"], ["env2.out"])
mod("lfo1", "lfo", "LFO 1 (global)", "LFO", "Monophonic LFO: triangle, saw, reverse saw, square, S&H; clock sync; amount to a direct destination; note reset.", ["lfo1.reset"], ["lfo1.out"], scope="common")
mod("lfo2", "lfo", "LFO 2 (per voice)", "LFO", "Per-voice LFO with the same controls.", ["lfo2.reset"], ["lfo2.out"])
mod("drive", "overdrive", "Overdrive", "OVERDRIVE", "Overdrive on the voice sum, separate from the digital effects.", ["drive.in"], ["drive.out"], scope="common")
mod("fx", "effects", "Effect", "EFFECT", "One digital effect: stereo delay, BBD, tape delay 1/2, chorus, flanger, phaser, HP filter, distortion, ring mod, rotating speaker; delays sync to the clock.", ["fx.in"], ["fx.out"], scope="common")
mod("reverb", "reverb", "Reverb", "REVERB", "Plate reverb: mix, decay, pre-delay, tone, damping.", ["reverb.in"], ["reverb.out"], scope="common")
mod("arp", "sequencer", "Arpeggiator and sequencer", "ARPEGGIATOR / STEP SEQ / CLOCK", "Arpeggiator (up, down, up+down, random, assign; 1-3 octaves; repeats; relatch) and 64-step polyphonic sequencer; 30-250 BPM, tap tempo, MIDI clock.",
    [], ["arp.notes"], scope="common", props={"steps": 64})
mod("out", "output", "Output", "VOLUME / rear panel", "Stereo outputs (or mono), headphones; master and program volume.", ["out.in"], ["out.left", "out.right", "out.phones"], scope="common")

for o, n, ccs, ns in (("osc1", 1, (8, 9, 10), (8, 9, 10)), ("osc2", 2, (13, 14, 15), (13, 14, 15))):
    enum(f"{o}.octave", o, f"OSC {n} OCTAVE", "5-octave range.", ["-2", "-1", "0", "+1", "+2"], control="rotary_switch", cc=ccs[0], nrpn=ns[0])
    knob(f"{o}.pitch", o, f"OSC {n} PITCH", "±7 semitones (NRPN ±700 cents); centre detent.", ccs[1], ns[1], physical={"min": -700, "max": 700, "unit": "cents"})
    knob(f"{o}.shape", o, f"OSC {n} SHAPE", "Sine to saw to pulse, then narrowing pulse width.", ccs[2], ns[2])
    prog(f"{o}.key_follow", o, f"Osc {n} Key Follow", "boolean", "Tracks the keyboard.", 86 + n, 7 if n == 1 else 12, default=True)
    prog(f"{o}.glide", o, f"Osc {n} Glide", "integer", "Glide amount.", 64 + n, 1 + n, range=K127)
btn("osc1.sync", "osc1", "SYNC 2-1", "Osc 1 hard-synced to Osc 2.", 39, 6)
btn("osc.fm", "osc1", "FM 2-1", "Osc 2 frequency-modulates Osc 1; the OSC 2 level knob sets the amount.", 44, 11)
for src, lab, cc, nr in (("osc1", "OSC 1", 40, 36), ("sub", "OSC 1 SUB", 42, 38), ("osc2", "OSC 2", 41, 37)):
    knob(f"mixer.{src}", "mixer", lab, f"{lab} level.", cc, nr)
knob("mixer.noise", "mixer", "NOISE", "Bipolar: clockwise white, counter-clockwise pink.", 43, 39, panel_scale={"min": -5, "max": 5})
knob("vcf.cutoff", "vcf", "CUTOFF", "Cutoff (NRPN 0-1023).", 33, 29)
knob("vcf.resonance", "vcf", "RESONANCE", "Emphasis; self-oscillates.", 34, 31)
knob("vcf.drive", "vcf", "DRIVE", "Filter input level and saturation.", 35, 32)
prog("vcf.key_amt", "vcf", "Key>LPF Freq", "integer", "Key tracking (127 = semitone tracking).", 36, 33, range=K127)
for e, ccs, ns in (("env1", (45, 46, 47, 48, 49, 50, 51), (41, 42, 43, 44, 45, 46, 47)), ("env2", (52, 53, 54, 55, 56, 57, 58), (48, 49, 50, 51, 52, 53, 54))):
    lab = e.upper().replace("ENV", "ENV ")
    prog(f"{e}.delay", e, f"{lab} Delay", "integer", "Delay before the attack.", ccs[0], ns[0], range=K127)
    for k, nm in enumerate(("attack", "decay", "sustain", "release"), start=1):
        knob(f"{e}.{nm}", e, f"{lab} {nm.upper()}", f"{nm.title()}.", ccs[k], ns[k])
    knob(f"{e}.amount", e, f"{lab} AMOUNT", "Bipolar amount (NRPN 0-255).", ccs[5], ns[5], panel_scale={"min": -5, "max": 5})
    btn(f"{e}.vel", e, f"{lab} VELOCITY", "Velocity on/off.", ccs[6], ns[6])
enum("env.routing", "env1", "ENV ROUTING", "Env 1 filter + Env 2 amp; Env 1 aux + Env 2 filter+amp; Env 1 aux + Env 2 filter+gate.", ["env1_filter__env2_amp", "env1_aux__env2_filter_amp", "env1_aux__env2_filter_gate"], cc=69, nrpn=55)
prog("env1.aux_dest", "env1", "Env 1 aux destination", "enum", "Direct destination when Env 1 is aux.", None, 40, values=[{"value": "destinations 0-54"}])
for n, ccs, ns in ((1, (75, 76, 77, 78, 79), (61, 62, 63, 64, 66, 65)), (2, (80, 81, 82, 83, 84), (68, 69, 70, 71, 73, 72))):
    l = f"lfo{n}"
    knob(f"{l}.freq", l, f"LFO {n} FREQUENCY", "Rate, or division when synced.", ccs[0], ns[0])
    knob(f"{l}.amt", l, f"LFO {n} AMOUNT", "Amount to the direct destination (NRPN 0-255).", ccs[1], ns[1])
    enum(f"{l}.shape", l, f"LFO {n} SHAPE", "Waveform.", ["triangle", "saw", "reverse_saw", "square", "sample_hold"], cc=ccs[2], nrpn=ns[2])
    btn(f"{l}.sync", l, f"LFO {n} CLK SYNC", "Clock sync.", ccs[3], ns[3])
    prog(f"{l}.note_reset", l, f"LFO {n} Note Reset", "boolean", "Restart on new notes.", ccs[4], ns[4])
    prog(f"{l}.freq_sync", l, f"LFO {n} Freq Sync", "integer", "Division index.", None, ns[5], range={"min": 0, "max": 15})
    par(f"{l}.dest", l, f"LFO {n} DEST", "enum", "Direct destination (display).", control="push_button", values=[{"value": "destinations 0-54"}])
for s in range(1, 17):
    par(f"mm.{s}.source", "kbd", f"Mod {s} source", "enum", "Source (0 none, 1-19).", access=[{"type": "menu", "note": "MOD: slot, source"}, {"type": "midi", "message": f"NRPN {76 + s}"}], values=[{"value": "see mod_matrix sources"}])
    par(f"mm.{s}.amount", "kbd", f"Mod {s} amount", "integer", "Bipolar amount (NRPN 0-255).", access=[{"type": "menu", "note": "MOD: amount"}, {"type": "midi", "message": f"NRPN {92 + s}"}], range={"min": -127, "max": 127})
    par(f"mm.{s}.dest", "kbd", f"Mod {s} destination", "enum", "Destination (0 none, 1-54).", access=[{"type": "menu", "note": "MOD: destination"}, {"type": "midi", "message": f"NRPN {108 + s}"}], values=[{"value": "see mod_matrix destinations"}])
knob("drive.amount", "drive", "OVERDRIVE", "Overdrive.", 67, 35)
knob("vintage", "kbd", "VINTAGE", "Voice-to-voice variation.", 37, 34)
btn("fx.on", "fx", "EFFECT ON/OFF", "Effect on.", 16, 16)
enum("fx.type", "fx", "TYPE", "Effect type.", ["stereo_delay", "bbd", "tape_delay_1", "tape_delay_2", "chorus", "flanger", "phaser", "hp_filter", "distortion", "ring_mod", "rotating_speaker"], control="encoder", cc=17, nrpn=17,
     note="CC/NRPN range 0-8 in the MIDI document, for 11 listed types.")
knob("fx.time", "fx", "TIME", "Time, rate, frequency, gain, carrier or speed (per type).", 19, 19)
knob("fx.mix", "fx", "DEPTH/MIX", "Mix or depth (per type).", 18, 18)
knob("fx.misc", "fx", "FBACK/MISC", "Feedback, LPF, resonance, tone, pitch track or mic distance (per type).", 20, 20)
prog("fx.sync", "fx", "FX Clock Sync", "boolean", "Sync delays to the clock.", 21, 21)
prog("fx.sync_rate", "fx", "FX Clock Sync Rate", "integer", "Division index.", 22, 22, range={"min": 0, "max": 10})
btn("reverb.on", "reverb", "REVERB ON/OFF", "Reverb on.", 23, 23)
for nm, lab, cc, nr in (("mix", "MIX", 24, 24), ("damping", "DAMPING (Size in MIDI)", 25, 25), ("predelay", "PRE-DELAY", 26, 26), ("decay", "DECAY", 27, 27), ("tone", "TONE", 28, 28)):
    knob(f"reverb.{nm}", "reverb", f"REVERB {lab}", f"Reverb {nm}.", cc, nr)
btn("kbd.unison", "kbd", "UNISON", "Unison or chord memory.", 31, 56)
prog("kbd.unison_voices", "kbd", "Unison voices", "integer", "Voices stacked (hold UNISON, turn VALUE).", 70, 57, hold="hold UNISON and turn VALUE", range={"min": 1, "max": 5})
prog("kbd.unison_detune", "kbd", "Unison Detune", "integer", "0-7.", 71, 58, range={"min": 0, "max": 7})
prog("kbd.key_mode", "kbd", "Unison Key Mode", "enum", "Note priority.", 72, 59, values=[{"value": v} for v in ["low", "high", "last"]])
prog("kbd.unison_retrig", "kbd", "Unison Env Retrig", "boolean", "Retrigger on legato notes.", 73, 60)
btn("kbd.glide_on", "kbd", "GLIDE", "Glide on.", 68, 4)
prog("kbd.glide_mode", "kbd", "Glide Mode", "enum", "Fixed rate, fixed rate A, fixed time, fixed time A.", 5, 5, values=[{"value": v} for v in ["fixed_rate", "fixed_rate_a", "fixed_time", "fixed_time_a"]])
prog("kbd.bend_up", "kbd", "Pitch Bend Up", "integer", "0-12 semitones.", 85, 75, range={"min": 0, "max": 12})
prog("kbd.bend_down", "kbd", "Pitch Bend Down", "integer", "0-24 semitones.", 86, 76, range={"min": 0, "max": 24})
prog("out.prog_volume", "out", "Program Volume", "integer", "Program level.", 12, 1, range=K127)
btn("kbd.split1", "kbd", "LOW SPLIT -1 OCT", "Notes below the split an octave lower.", 29, 169)
btn("kbd.split2", "kbd", "LOW SPLIT -2 OCT", "Two octaves lower.", 30, 171)
prog("kbd.split_note", "kbd", "Key Split Note", "integer", "Split point.", 89, 170, range={"min": 0, "max": 44})
btn("kbd.latch", "kbd", "LATCH / HOLD", "Holds notes; latches the arpeggio.", memory="none")
btn("arp.on", "arp", "ARPEGGIATOR ON", "Arpeggiator on.", 59, 163)
enum("arp.mode", "arp", "MODE", "Note order.", ["up", "down", "up_down", "random", "assign"], cc=60, nrpn=164, note="MIDI range 0-2 for five modes.")
enum("arp.octave", "arp", "OCTAVE", "1-3 octaves.", ["1", "2", "3"], cc=61, nrpn=165)
enum("arp.repeat", "arp", "REPEAT", "Repeats per note.", ["0", "1", "2", "3"], cc=62, nrpn=166)
prog("arp.relatch", "arp", "Arp Relatch", "boolean", "New notes restart the held arpeggio.", None, 168)
knob("arp.bpm", "arp", "BPM / TAP TEMPO", "30-250 BPM.", 3, 0, range={"min": 30, "max": 250})
enum("arp.divide", "arp", "CLK DIVIDE", "Note value.", ["1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/64"], control="encoder", cc=63, nrpn=167)
btn("seq.play", "arp", "STEP SEQ PLAY", "Sequencer play/stop.", None, 4198, memory="none")
btn("seq.record", "arp", "STEP SEQ RECORD", "Step recording (rests, ties); hold with a key to transpose.", None, 4199, memory="none")
par("out.volume", "out", "VOLUME", "continuous", "Master and headphone volume.", memory="none", cc=7, panel_scale=S10)
par("kbd.pitch_wheel", "kbd", "PITCH wheel", "continuous", "Bend.", memory="none", access=[{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "pitch bend"}], panel_scale={"min": -1, "max": 1})
par("kbd.mod_wheel", "kbd", "MOD wheel", "continuous", "Matrix source.", memory="none", control="wheel", cc=1, panel_scale=K127)
for pid, label, fn in (("ui.factory", "FACTORY", "Factory set on/off."), ("ui.bank", "BANK", "Bank select."), ("ui.prog", "PROGRAM 1-16", "Program select."), ("ui.preset", "PRESET", "Preset/live panel."),
                       ("ui.write", "WRITE", "Save."), ("ui.global", "GLOBAL", "Global menu."), ("ui.program", "PROGRAM (settings)", "Program menu."), ("ui.select", "SELECT", "Scroll."), ("ui.value", "VALUE", "Set values.")):
    par(pid, "kbd", label, "boolean", fn, memory="none", control="encoder" if pid in ("ui.select", "ui.value") else "push_button")
G = [("sys.coarse", "Master Coarse", "integer", "±12 semitones.", "1", 4096, {"range": {"min": -12, "max": 12}}), ("sys.fine", "Master Fine", "integer", "±50 cents.", "2", 4097, {"range": {"min": -50, "max": 50}}),
     ("sys.local", "Local Control", "enum", "All off, keys/wheels off, on.", "3", 4111, {"values": [{"value": v} for v in ["all_off", "keys_wheels_off", "on"]]}),
     ("sys.mono", "Mono/Stereo", "enum", "Mono defeats pan.", "4", 4112, {"values": [{"value": "stereo"}, {"value": "mono"}]}),
     ("sys.pot_mode", "Pot Mode", "enum", "Relative, passthru, jump.", "5", 4113, {"values": [{"value": v} for v in ["relative", "passthru", "jump"]]}),
     ("sys.foot_function", "Foot Function", "enum", "Sustain, arp hold, arp hold momentary.", "6", 4116, {"values": [{"value": v} for v in ["sustain", "arp_hold", "arp_hold_mom"]]}),
     ("sys.pedal_polarity", "Pedal Polarity", "enum", "Normal or reversed.", "7", 4115, {"values": [{"value": "normal"}, {"value": "reversed"}]}),
     ("sys.pedal_function", "Pedal Function", "enum", "Expression pedal role.", "8", 4114, {"values": [{"value": v} for v in ["breath_cc2", "foot_cc4", "exp_cc11", "lpf_full", "lpf_half"]]}),
     ("sys.at_on", "Aftertouch On", "boolean", "Aftertouch on/off.", "9", 4118, {"default": True}), ("sys.at_curve", "Aftertouch Curve", "integer", "Curve.", "10", 4119, {"range": {"min": 0, "max": 7}}),
     ("sys.vel_curve", "Velocity Curve", "integer", "Curve.", "11", 4120, {"range": {"min": 0, "max": 6}}),
     ("sys.scale", "Scale (Alt Tuning)", "enum", "Equal temperament or alternative tunings.", "12", 4117, {"values": [{"value": "equal_temperament"}, {"value": "alternative tunings"}]}),
     ("sys.screensaver", "Screen Saver", "boolean", "Display saver.", "13", 4121, {}), ("sys.midi_channel", "MIDI Channel", "enum", "All or 1-16.", "14", 4098, {"values": [{"value": "all"}, {"value": "1..16"}]}),
     ("sys.clock_mode", "Clock Mode", "enum", "Off, out, out no S/S, in, in thru, in no S/S.", "15", 4099, {"values": [{"value": v} for v in ["off", "out", "out_no_ss", "in", "in_thru", "in_no_ss"]]}),
     ("sys.param_send", "MIDI Param Send", "enum", "Off, CC, NRPN.", "18", 4102, {"values": [{"value": v} for v in ["off", "cc", "nrpn"]]}),
     ("sys.param_rcv", "MIDI Param Receive", "enum", "Off, CC, NRPN.", "19", 4103, {"values": [{"value": v} for v in ["off", "cc", "nrpn"]]}),
     ("sys.arp_notes", "MIDI Arp Notes", "boolean", "Arp/seq notes out.", "26", 4110, {}), ("sys.arp_beat_sync", "Arp Beat Sync", "enum", "Off or quantize.", "27", 4122, {"values": [{"value": "off"}, {"value": "quantize"}]})]
for pid, lab, kind, fn, n, nr, extra in G:
    glob(pid, lab, kind, fn, n, nr, **extra)
for n, (pid, lab, fn) in enumerate((("util.basic", "Basic Program", "Loads the Basic Program (also TRANSPOSE down + LATCH)."), ("util.cal_wheels", "Cal Wheels", "Calibrates the wheels."),
                                   ("util.cal_voices", "Cal Voices", "Calibrates VCOs and filters."), ("util.reset", "Reset Globals", "Factory globals.")), start=28):
    par(pid, "kbd", lab, "boolean", fn, memory="none", access=[{"type": "menu", "note": f"GLOBAL menu, {n}"}])
jack("jack.out_l", "AUDIO OUT LEFT", "out", "audio", "out.left", "Unbalanced TS.", "6.35 mm TS")
jack("jack.out_r", "AUDIO OUT RIGHT", "out", "audio", "out.right", "Unbalanced TS.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS")
jack("jack.footswitch", "FOOTSWITCH", "in", "gate", "kbd.sustain", "Sustain or arp hold.", "6.35 mm TS")
jack("jack.pedal", "PEDAL", "in", "cv", "kbd.pedal", "Expression pedal (TRS).", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI.", "USB type B")
jack("jack.power", "AC POWER", "in", "power", None, "IEC mains, universal supply.", "IEC C14")

con("arp.notes", "kbd.seq_in")
con("kbd.pitch", "osc1.pitch_cv", eq("osc1.key_follow", True))
con("kbd.pitch", "osc2.pitch_cv", eq("osc2.key_follow", True))
con("kbd.pitch", "sub.pitch_cv", eq("osc1.key_follow", True))
for o in ("osc1", "osc2"):
    con("kbd.bend", f"{o}.pitch_cv", amount="kbd.bend_up")
con("osc2.out", "osc1.fm", "audio", eq("osc.fm", True), amount="mixer.osc2", note="FM amount from the Osc 2 level knob.")
con("osc2.out", "osc1.sync_in", "sync", eq("osc1.sync", True))
con("osc1.out", "mixer.osc1", "audio", amount="mixer.osc1")
con("sub.out", "mixer.sub", "audio", amount="mixer.sub")
con("osc2.out", "mixer.osc2", "audio", {"param": "osc.fm", "equals": False}, amount="mixer.osc2", note="With FM on, the OSC 2 knob sets FM depth instead.")
con("noise.out", "mixer.noise", "audio", amount="mixer.noise")
con("mixer.out", "vcf.in", "audio", amount="vcf.drive")
con("env1.out", "vcf.cutoff_cv", eq("env.routing", "env1_filter__env2_amp"), amount="env1.amount")
con("env2.out", "vcf.cutoff_cv", anyof("env.routing", "env1_aux__env2_filter_amp", "env1_aux__env2_filter_gate"), amount="env2.amount")
con("kbd.pitch", "vcf.cutoff_cv", amount="vcf.key_amt")
con("vcf.out", "vca.in", "audio")
con("env2.out", "vca.cv", anyof("env.routing", "env1_filter__env2_amp", "env1_aux__env2_filter_amp"), amount="env2.amount")
con("kbd.gate", "vca.cv", "gate", eq("env.routing", "env1_aux__env2_filter_gate"))
for e in ("env1", "env2"):
    con("kbd.gate", f"{e}.gate", "gate")
    con("kbd.velocity", f"{e}.velocity", eq(f"{e}.vel", True))
con("kbd.gate", "lfo1.reset", "gate", eq("lfo1.note_reset", True))
con("kbd.gate", "lfo2.reset", "gate", eq("lfo2.note_reset", True))
con("vca.out", "drive.in", "audio", note="Five voices summed, panned in stereo.")
con("drive.out", "fx.in", "audio", amount="drive.amount")
con("fx.out", "reverb.in", "audio")
con("reverb.out", "out.in", "audio", amount="out.prog_volume")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
SRC = ["No Source", "Osc 2", "Noise", "LFO 1", "LFO 2", "Env 1", "Env 2", "Voice Spread", "Pitch Bend", "Mod Wheel", "Pressure", "Breath", "Foot Pedal", "Expression Pedal", "Velocity", "Note Number",
       "Filter Out", "Random", "DC", "Audio Out"]
SRC_NODE = {"Osc 2": "osc2.out", "Noise": "noise.out", "LFO 1": "lfo1.out", "LFO 2": "lfo2.out", "Env 1": "env1.out", "Env 2": "env2.out", "Pitch Bend": "kbd.bend", "Mod Wheel": "kbd.modwheel",
            "Pressure": "kbd.aftertouch", "Expression Pedal": "kbd.pedal_out", "Velocity": "kbd.velocity", "Note Number": "kbd.pitch", "Filter Out": "vcf.out", "Audio Out": "out.left"}
MONO = {"LFO 1", "Pitch Bend", "Mod Wheel", "Pressure", "Breath", "Foot Pedal", "Expression Pedal", "DC", "Audio Out"}
DST = ["No Dest", "Osc 1 Octave", "Osc 2 Octave", "Osc 1 Fine Freq", "Osc 2 Fine Freq", "Osc All Fine Freq", "Osc 1 Shape", "Osc 2 Shape", "Osc All Shape", "Osc 1 Level", "Osc 2 Level", "Osc FM Level",
       "Sub Level", "Noise", "Drive", "Cutoff", "Resonance", "Overdrive", "Panning", "FX Mix", "FX Time", "FX Misc", "Reverb Mix", "Reverb Size", "Reverb PreDelay", "Reverb Decay", "Reverb Tone",
       "LFO 1 Freq", "LFO 2 Freq", "LFO All Freq", "LFO 1 Amt", "LFO 2 Amt", "LFO All Amt", "Env 1 Amt", "Env 2 Amt", "Env 1 Attack", "Env 2 Attack", "Env 1 Decay", "Env 2 Decay", "Env 1 Release",
       "Env 2 Release"] + [f"Mod {i} Amount" for i in range(1, 17)]
DP = {"Osc 1 Octave": "osc1.octave", "Osc 2 Octave": "osc2.octave", "Osc 1 Fine Freq": "osc1.pitch", "Osc 2 Fine Freq": "osc2.pitch", "Osc 1 Shape": "osc1.shape", "Osc 2 Shape": "osc2.shape",
      "Osc 1 Level": "mixer.osc1", "Osc 2 Level": "mixer.osc2", "Sub Level": "mixer.sub", "Noise": "mixer.noise", "Drive": "vcf.drive", "Cutoff": "vcf.cutoff", "Resonance": "vcf.resonance",
      "Overdrive": "drive.amount", "FX Mix": "fx.mix", "FX Time": "fx.time", "FX Misc": "fx.misc", "Reverb Mix": "reverb.mix", "Reverb Size": "reverb.damping", "Reverb PreDelay": "reverb.predelay",
      "Reverb Decay": "reverb.decay", "Reverb Tone": "reverb.tone", "LFO 1 Freq": "lfo1.freq", "LFO 2 Freq": "lfo2.freq", "LFO 1 Amt": "lfo1.amt", "LFO 2 Amt": "lfo2.amt", "Env 1 Amt": "env1.amount",
      "Env 2 Amt": "env2.amount", "Env 1 Attack": "env1.attack", "Env 2 Attack": "env2.attack", "Env 1 Decay": "env1.decay", "Env 2 Decay": "env2.decay", "Env 1 Release": "env1.release", "Env 2 Release": "env2.release"}
DP.update({f"Mod {i} Amount": f"mm.{i}.amount" for i in range(1, 17)})
D["mod_matrix"] = {
    "name": "Modulation matrix", "module": "kbd", "slots": 16, "combine": "single",
    "slot_parameters": [{"slot": s, "source": f"mm.{s}.source", "destination": f"mm.{s}.dest", "depth": f"mm.{s}.amount"} for s in range(1, 17)],
    "sources": [{"id": i, "name": n, **({"node": SRC_NODE[n]} if n in SRC_NODE else {}), "per_voice": n not in MONO} for i, n in enumerate(SRC)],
    "destinations": [{"id": i, "name": n, **({"parameter": DP[n]} if n in DP else {})} for i, n in enumerate(DST)],
    "depth_range": {"min": -127, "max": 127},
    "note": "16 slots, 19 sources (plus none), 57 destination entries listed (No Dest plus 56); the MIDI document gives destination range 0-54 (55 values). Display marks mono (M) and poly (P) entries.",
}
D["indicators"] = [{"id": "oled", "module": "kbd", "label": "display", "kind": "display", "function": "Program, mod slots, menus, effect name, clock division, sequencer step."},
                   {"id": "led_tap", "module": "arp", "label": "TAP TEMPO LED", "kind": "led", "function": "Flashes at the BPM."}]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc1", "osc2", "mixer", "vcf", "vca", "drive", "fx", "reverb"],
     "rule": "Per voice: oscillators, sub and noise into the driven low-pass filter, then the VCA and pan. Voices summed into overdrive, one digital effect and the reverb, then stereo out."},
    {"id": "b02", "name": "Oscillator shape and FM", "applies_to": ["osc1", "osc2"],
     "rule": "SHAPE morphs sine, saw and pulse continuously, narrowing the pulse beyond. FM 2-1 lets Osc 2 frequency-modulate Osc 1, with the OSC 2 mixer knob as the FM amount; SYNC 2-1 resets Osc 1 from Osc 2."},
    {"id": "b03", "name": "Envelope routing", "applies_to": ["env1", "env2"],
     "rule": "ENV ROUTING cycles Env 1 filter / Env 2 amp; Env 1 aux / Env 2 filter + amp; Env 1 aux / Env 2 filter with gated amp."},
    {"id": "b04", "name": "Global and per-voice LFOs", "applies_to": ["lfo1", "lfo2"], "rule": "LFO 1 is one modulator for all voices; LFO 2 runs per voice. Each has a direct destination and amount; the matrix adds more."},
    {"id": "b05", "name": "Unison and chord memory", "applies_to": ["kbd"], "rule": "Unison stacks 1-5 voices (detune 0-7, low/high/last priority); a held chord pressed with UNISON is memorised and transposed by single keys."},
    {"id": "b06", "name": "Sequencer and arpeggiator", "applies_to": ["arp"], "rule": "64-step polyphonic step sequencer (notes, chords, rests, ties) saved per program; arpeggiator with five orders, 1-3 octaves, repeats and relatch; clock 30-250 BPM or MIDI."},
    {"id": "b07", "name": "Programs", "applies_to": ["kbd"], "rule": "256 programs: 128 user and 128 factory in 8 banks of 16. Basic Program: TRANSPOSE down + LATCH."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "poly_pressure"}, {"message": "channel_pressure"}, {"message": "pitch_bend"}, {"message": "program_change", "note": "programs 1-16 of the selected bank"},
                 {"message": "control_change", "note": "official CC table (see parameter access); 32 bank select 0-7 user, 8-15 factory; 64 damper; 74 brightness"},
                 {"message": "nrpn", "note": "program parameters 0-171, globals 4096-4122, sequencer 4198-4199"}, {"message": "clock"},
                 {"message": "sysex", "note": "device inquiry; program, edit buffer and global dump requests; packed program dumps"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "channel_pressure"}, {"message": "pitch_bend"}, {"message": "program_change"}, {"message": "control_change"}, {"message": "nrpn"}, {"message": "sysex"}],
    "sysex_id": "DSI/Sequential 01, Take 5 35", "channel_note": "One channel or all.", "note": "From Sequential's Take 5 MIDI Implementation V2."}
D["specifications"] = {
    "voices": 5, "keyboard": "44 keys, velocity and aftertouch", "oscillators": "2 VCOs + sub per voice", "filter": "resonant low-pass with drive", "envelopes": "2 DADSR", "lfos": "LFO 1 global, LFO 2 per voice",
    "mod_matrix": "16 slots", "effects": "1 of 11 types + reverb; overdrive", "programs": "256 (128 user, 128 factory)", "sequencer_steps": 64,
    "connections": {"outputs": "L/R 1/4\" unbalanced", "phones": "1/4\" stereo", "pedals": "footswitch, expression", "midi": "DIN in, out, thru; USB"},
}
D["omitted_from_source"] = ["Chapter 3 tutorials", "alternative tuning descriptions", "calibration and import/export procedures", "safety text"]
D["not_in_source"] = ["filter slope and circuit (retailers describe a Prophet-5-style 4-pole low-pass)", "envelope and LFO times", "dimensions and weight", "keyboard action"]
D["source_inconsistencies"] = [
    "The reverb section describes a DAMPING knob; the matrix destinations and MIDI tables call the same control 'Reverb Size'.",
    "The MIDI document gives FX Type 0-8 for 11 listed effects, Arp Mode 0-2 for five modes, and Mod 16 Amount as 0-54 (other amounts 0-255).",
    "The global dump lists Take 5 ID 0011 0001 (31) where every other message uses 35, and '27 nibbles for 32 Global parameters'.",
    "Program parameters 0-171 sit under a 'Control NRPN Data' heading said to be 'not saved as part of a program'.",
    "The guide says transpose settings are global and not saved, then that they can be saved per patch.",
    "Arp Repeat is described as '1, 2, 3' then explained from 'off'.",
    "The destination list has 57 entries (No Dest plus 56); the MIDI document gives 0-54 (55 values).",
]
D["modelling_gaps"] = [
    {"topic": "Shared platform", "detail": "Structure mirrors the Oberheim TEO-5 file (same platform) with the Take 5's oscillators, FM, noise, filter, reverb and program count."},
    {"topic": "Direct destinations", "detail": "LFO 1, LFO 2 and Env 1 (aux) destinations are parameters, not drawn connections."},
    {"topic": "Per-voice modules", "detail": "Voice modules per_voice; LFO 1, overdrive, effects and sequencer common."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/sequential-take-5_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
