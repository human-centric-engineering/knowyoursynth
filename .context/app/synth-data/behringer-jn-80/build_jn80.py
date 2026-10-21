#!/usr/bin/env python3
"""Assemble the Behringer JN-80 device file (schema 0.12.0).

Eight-voice recreation of the Roland Juno-60: per voice a DCO (saw, pulse with PWM,
square sub, noise), 24 dB 3109-type VCF and 662-type VCA under one ADSR; one global LFO,
high-pass filter and BBD chorus; arpeggiator; 49 keys with velocity and aftertouch;
LCD programmer with 400 user slots and 200 factory presets; MIDI CC and 14-bit NRPN.

Sources: JN-80 Quick Start Guide (controls, menus, CC/NRPN charts, specifications) plus
online coverage (release, voice modes, preset counts, filter/VCA chips).
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


def par(id, module, label, kind, fn, memory="patch", control="fader", ref=None, cc=None, nrpn=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    if nrpn is not None:
        acc = acc + [{"type": "midi", "message": f"NRPN 0:{nrpn} (14-bit, 0-4095)"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def slider(id, module, label, fn, ref, cc=None, nrpn=None, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, ref=ref, cc=cc, nrpn=nrpn, **kw)


def sw(id, module, label, fn, vals, ref, cc=None, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control=control, ref=ref, cc=cc, values=[{"value": v} for v in vals], **kw)


def menu(id, module, label, kind, fn, path, memory="patch", cc=None, **kw):
    par(id, module, label, kind, fn, memory=memory, access=[{"type": "menu", "note": path}], cc=cc, **kw)


def jack(id, label, direction, signal, node, fn, connector, ref=None, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    if ref:
        j["manual_ref"] = ref
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


D["device"] = {
    "id": "behringer-jn-80", "manufacturer": "Behringer", "model": "JN-80 Classic Analog 8-Voice Programmable Polyphonic Synth",
    "category": "8-voice analogue polyphonic synthesizer, 49 keys, with BBD chorus, arpeggiator and patch memory",
    "based_on": "Roland Juno-60 (1982), extended to eight voices; announced February 2026 (begun as the 'Phat-12' project in 2010).",
    "sources": [
        {"id": "qsg", "title": "Behringer JN-80 Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_JN-80_User_Guide.pdf", "pages": 57,
         "note": "Multilingual; English pages: hook-up, controls (61 callouts), shift-function menus, MIDI CC and NRPN charts, specifications."},
        {"id": "sonicstate", "title": "Sonicstate, 'Behringer Releases The JN-80' (5 February 2026)", "kind": "other", "file": "https://sonicstate.com/news/2026/02/05/-behringer-releases-the-jn-80-/",
         "note": "3109 VCFs, BBD chorus, poly/unison/dual modes, 200 presets (100 by Ultimate Patches in banks A-E), up to 400 user presets."},
        {"id": "musicradar", "title": "MusicRadar, 'Behringer's supercharged Roland Juno-60 clone is now available for pre-order'", "kind": "other",
         "file": "https://www.musicradar.com/music-tech/behringer-officially-releases-its-supercharged-roland-juno-60-clone-the-jn-80",
         "note": "Eight voices, 49 velocity keys with channel aftertouch, five voice modes (poly, mono, unison, quad, duo), tempo-synced LFO, polyphonic portamento; $569 / £479."},
        {"id": "bh", "title": "B&H and Alto Music product listings", "kind": "other", "file": "https://www.bhphotovideo.com/c/product/1950174-REG/behringer_0722_aap86_us1_analog_8_voice_programmable_polyphonic.html",
         "note": "3109 VCF and 662 VCA designs; one listing gives 256 user program memories."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 8, "polyphony_mode": "poly, duo, unison, quad or mono voice assignment; panel selector cycles poly, duo, unison",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "400 user slots (banks A-T, 20 per bank by inference) and 200 factory presets, 100 by Ultimate Patches in banks A-E; four assignable preset recall buttons; compare and match.",
    "semi_modular": False, "panel_counts": {"keys": 49, "lcd_lines": 2, "lcd_characters": 16},
    "summary": ("Juno-60 layout: per voice one DCO with sawtooth and pulse (PWM from the LFO, the envelope or manual), a square sub an octave down and noise; a 24 dB/oct resonant 3109-type "
                "low-pass VCF with envelope (invertible), LFO and keyboard modulation; a 662-type VCA under the envelope or gated. One ADSR, one LFO (with delay and manual trigger) and a "
                "high-pass filter. Two-level BBD chorus. Arpeggiator, hold, transpose, portamento, bender to DCO and VCF; velocity, aftertouch, mod wheel and pedal modulation."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "FUNCTIONS / KEYBOARD", "49 keys with velocity and aftertouch; voice modes, note priority, transpose, octave, hold, portamento (polyphonic), unison detune, voice spread, voice kill.",
    ["kbd.midi_in", "kbd.sustain", "kbd.arp_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel"], scope="common", props={"keys": 49})
mod("arp", "arpeggiator", "Arpeggiator", "ARPEGGIATOR", "Seven modes, eight divisions, 1-3 octaves, note length, swing; 10-265 BPM, MIDI, USB or SYNC input.", ["arp.sync_in"], ["arp.notes"], scope="common",
    props={"tempo_bpm": [10, 265]})
mod("lfo", "lfo", "LFO", "LFO", "Global LFO: 0.3-22 Hz, delay 0-6 s (auto) or fade-in (manual trigger); shapes triangle, pulse, ramp, saw, sine; sync to the arpeggiator clock.",
    ["lfo.trig", "lfo.rate_cv"], ["lfo.out"], scope="common", props={"rate_hz": [0.3, 22], "delay_s": [0, 6]})
mod("dco", "oscillator", "DCO", "DCO", "Digitally controlled oscillator: sawtooth and pulse (each on/off), PWM from LFO, envelope or manual.", ["dco.pitch_cv", "dco.pwm_cv"], ["dco.saw", "dco.pulse"])
mod("sub", "oscillator", "Sub oscillator", "DCO", "Square one octave below the DCO, on/off with level.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "DCO", "White noise with level.", [], ["noise.out"], props={"note": "Described as a global noise source in the announcement."})
mod("mixer", "mixer", "Source mix", "DCO", "Saw and pulse (switched), sub and noise (levels).", ["mixer.saw", "mixer.pulse", "mixer.sub", "mixer.noise"], ["mixer.out"])
mod("vcf", "filter", "VCF", "VCF", "4-pole 24 dB/oct resonant low-pass (3109 design), about 10 Hz-16 kHz, self-oscillating; envelope (normal or inverted), LFO and keyboard modulation (centred on C4).",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"slope_db_per_oct": 24, "cutoff_hz": [10, 16000], "chip": "3109 design"})
mod("env", "envelope", "Envelope", "ENV", "One ADSR per voice for VCF, VCA and PWM: attack to ~3 s, decay and release to 12 s; exponential or linear decay/release.", ["env.gate", "env.velocity"], ["env.out"],
    props={"attack_s_max": 3, "decay_s_max": 12, "release_s_max": 12})
mod("vca", "vca", "VCA", "VCA", "662-design VCA under the envelope or gate; LEVEL sets the voice level.", ["vca.in", "vca.cv"], ["vca.out"], props={"chip": "662 design"})
mod("hpf", "filter", "HPF", "HPF", "High-pass filter (band-pass with the VCF); placed after the voice sum as on the Juno-60.", ["hpf.in"], ["hpf.out"], scope="common")
mod("chorus", "chorus", "Chorus", "CHORUS", "Analogue BBD chorus, off, I or II (a third setting appears in the CC chart).", ["chorus.in"], ["chorus.out_l", "chorus.out_r"], scope="common")
mod("bender", "manual_controller", "Bender and pedal", "OUTPUT AND MODULATION", "Bender to DCO and/or VCF by its level controls; pedal CV and expression as modulation sources.", ["bender.pedal_in"], ["bender.out", "bender.pedal"], scope="common")
mod("out", "output", "Output", "VOLUME / rear panel", "Stereo main outputs (chorus), headphones; VOLUME not stored.", ["out.l", "out.r"], ["out.main_l", "out.main_r", "out.phones"], scope="common")

# ---------------------------------------------------------------- panel
sw("kbd.assign", "kbd", "POLY / DUO / UNISON", "Voice mode selector (quad and mono via the VOICE menu).", ["poly", "duo", "unison"], 1, cc=47, control="push_button",
   note="CC 47: 0 poly, 32 duo, 64 uni, 96 quad, 127 mono.")
par("kbd.transpose", "kbd", "TRANSPOSITION", "boolean", "Press then a key to transpose (C or a second press resets).", control="push_button", ref=2, cc=92)
par("kbd.hold", "kbd", "HOLD", "boolean", "Holds notes at sustain, or the arpeggio, after release.", control="push_button", ref=3)
par("arp.set", "arp", "ARP SET", "boolean", "Steps through arpeggiator settings (chosen with SELECT).", control="push_button", ref=4)
par("arp.on", "arp", "ARP ON", "boolean", "Arpeggiator on/off.", control="push_button", ref=5, cc=51)
slider("arp.rate", "arp", "ARP RATE", "10-265 BPM (disabled when SYNC is patched).", 6, cc=15, nrpn=15, physical={"min": 10, "max": 265, "unit": "BPM"})
slider("lfo.rate", "lfo", "LFO RATE", "0.3-22 Hz.", 7, cc=8, nrpn=8, physical={"min": 0.3, "max": 22, "unit": "Hz"})
slider("lfo.delay", "lfo", "DELAY TIME", "Auto: delay before the LFO acts; manual: fade-in time. 0-6 s.", 8, cc=9, nrpn=9, physical={"min": 0, "max": 6, "unit": "s"})
sw("lfo.trig_mode", "lfo", "TRIG MODE", "Auto (keys trigger) or manual (LFO TRIG button).", ["auto", "manual"], 9, cc=39)
slider("dco.lfo", "dco", "LFO (DCO)", "LFO depth on pitch, 0-12 semitones.", 10, cc=10, nrpn=10, physical={"min": 0, "max": 12, "unit": "semitones"})
slider("dco.pwm", "dco", "PWM", "Pulse width (manual, about 50-95%) or PWM depth.", 11, cc=12, nrpn=12)
sw("dco.pwm_source", "dco", "PWM MODULATION SOURCE", "Envelope, manual or LFO.", ["env", "manual", "lfo"], 12, cc=45, note="CC 45: 0 LFO, 64 manual, 127 envelope.")
par("dco.sub_on", "sub", "SUB", "boolean", "Sub oscillator on/off.", control="push_button", ref=13, cc=42)
par("dco.saw", "dco", "SAWTOOTH", "boolean", "Sawtooth on/off.", control="push_button", ref=14, cc=41)
par("dco.pulse", "dco", "PULSE", "boolean", "Pulse on/off.", control="push_button", ref=15, cc=40)
slider("sub.level", "sub", "SUB OSC", "Sub level.", 16, cc=13, nrpn=13)
slider("noise.level", "noise", "NOISE", "Noise level.", 17, cc=14, nrpn=14)
slider("hpf.freq", "hpf", "HPF FREQ", "High-pass cutoff.", 18, cc=26, nrpn=26)
slider("vcf.freq", "vcf", "VCF FREQ", "Cutoff, about 10 Hz-16 kHz.", 19, cc=25, nrpn=25, physical={"min": 10, "max": 16000, "unit": "Hz"})
slider("vcf.res", "vcf", "RES", "Resonance; self-oscillates at high settings.", 20, cc=16, nrpn=16)
sw("vcf.env_invert", "vcf", "ENV INVERT", "Normal or inverted envelope to the VCF.", ["normal", "inverted"], 21, cc=43)
slider("vcf.env", "vcf", "ENV (VCF)", "Envelope depth on cutoff.", 22, cc=17, nrpn=17)
slider("vcf.lfo", "vcf", "LFO (VCF)", "LFO depth on cutoff.", 23, cc=18, nrpn=18)
slider("vcf.kybd", "vcf", "KYBD", "Keyboard tracking (opens above C4, closes below).", 24, cc=19, nrpn=19)
sw("vca.mode", "vca", "VCA SWITCH", "Envelope or gate (on at LEVEL).", ["env", "gate"], 25, cc=44)
slider("vca.level", "vca", "VCA LEVEL", "Voice level.", 26, cc=20, nrpn=20)
slider("env.attack", "env", "ATTACK", "Near instant to about 3 s.", 27, cc=21, nrpn=21, physical={"min": 0, "max": 3, "unit": "s"})
slider("env.decay", "env", "DECAY", "To 12 s.", 28, cc=22, nrpn=22, physical={"min": 0, "max": 12, "unit": "s"})
slider("env.sustain", "env", "SUSTAIN", "Sustain level.", 29, cc=23, nrpn=23)
slider("env.release", "env", "RELEASE", "To 12 s.", 30, cc=24, nrpn=24, physical={"min": 0, "max": 12, "unit": "s"})
sw("chorus.mode", "chorus", "CHORUS", "Off, I or II.", ["off", "I", "II"], 31, cc=46, control="push_button", note="CC 46 also lists III.")
for pid, label, fn, ref in (("ui.shift", "SHIFT", "Shift functions of buttons 33-42 (menus).", 32), ("ui.compare", "COMPARE", "Edited versus stored program.", 33),
                            ("ui.manual", "MANUAL", "Sound from the panel as set.", 34), ("ui.write", "WRITE", "Store to a bank and slot.", 35),
                            ("ui.recall", "ASSIGNABLE PRESET RECALL 1-4", "Instant recall of four patches (per RECALL MODE).", 36),
                            ("ui.select", "SELECT", "Encoder: programs, menus; press to enter.", 40), ("ui.minus", "PRESET/VALUE -", "Step down (Shift: bank/page down).", 41),
                            ("ui.plus", "PRESET/VALUE +", "Step up (Shift: bank/page up).", 42), ("lfo.trig", "LFO TRIG", "Triggers the LFO in manual mode.", 48)):
    par(pid, "lfo" if pid == "lfo.trig" else "kbd", label, "boolean", fn, memory="none", control="encoder" if pid == "ui.select" else "push_button", ref=ref)
par("out.volume", "out", "VOLUME", "continuous", "Output level (not stored).", memory="none", control="knob", ref=43, panel_scale=S10)
sw("kbd.octave", "kbd", "OCTAVE TRANSPOSE", "Keyboard ±1 octave (stored).", ["-1", "0", "+1"], 44, cc=91)
sw("kbd.porta", "kbd", "PORTA", "Portamento off, auto (legato) or on.", ["off", "auto", "on"], 45, cc=50)
slider("bender.dco", "bender", "DCO (bend)", "Bender depth to pitch.", 46, cc=34, nrpn=34, control="knob")
slider("bender.vcf", "bender", "VCF (bend)", "Bender depth to cutoff.", 47, cc=35, nrpn=35, control="knob")
par("bender.lever", "bender", "BENDER", "continuous", "Raises or lowers pitch and/or cutoff.", memory="none", control="joystick", ref=49, panel_scale={"min": -1, "max": 1})
par("kbd.tune", "kbd", "TUNE", "continuous", "Master tuning (rear).", memory="global", ref=61, access=[{"type": "rear_panel", "control": "knob"}], panel_scale={"min": -5, "max": 5})
par("sys.power", "out", "POWER", "boolean", "Power switch.", memory="none", ref=50, access=[{"type": "rear_panel", "control": "toggle_switch"}])
# arp settings (SET menu)
ARP = "ARP SET, then SELECT"
menu("arp.mode", "arp", "Arpeggio Mode", "enum", "Note order.", ARP, cc=52, values=[{"value": v} for v in ["up", "up_down", "up_down_excl", "down", "down_up", "down_up_excl", "random"]])
menu("arp.division", "arp", "Sub Division", "enum", "Step length.", ARP, cc=54, values=[{"value": v} for v in ["1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32", "1/32T"]])
menu("arp.range", "arp", "Range", "enum", "Held notes or 1-3 octaves up.", ARP, cc=53, values=[{"value": v} for v in ["held", "1_oct", "2_oct", "3_oct"]])
menu("arp.note_length", "arp", "Note Length", "integer", "0-100.", ARP, cc=32, range={"min": 0, "max": 100})
menu("arp.swing", "arp", "Swing", "integer", "50-75%.", ARP, cc=33, range={"min": 50, "max": 75})
menu("arp.sync_source", "arp", "Sync Source", "enum", "Clock source.", ARP, memory="global", values=[{"value": v} for v in ["internal", "midi", "usb", "sync_in"]])
menu("arp.sync_in", "arp", "Sync In", "enum", "Pulses per step or quarter.", ARP, memory="global", values=[{"value": v} for v in ["1PPS", "1PPQN", "2PPQN", "4PPQN", "24PPQN", "48PPQN"]])
menu("arp.sync_polarity", "arp", "Sync Polarity", "enum", "Edge.", ARP, memory="global", values=[{"value": v} for v in ["rising", "falling", "both"]])
menu("arp.start_stop", "arp", "Start/Stop", "boolean", "Follow start/stop.", ARP, memory="global")
# shift menus (patch-level)
VOICE = "SHIFT + VOICE (button 38)"
menu("kbd.voice_assign", "kbd", "Voice Assign", "enum", "Voice mode.", VOICE, cc=47, values=[{"value": v} for v in ["poly", "duo", "uni", "quad", "mono"]],
     note="The guide's menu lists Poly, Duo, Uni, Mono; the CC chart adds Quad.")
menu("kbd.note_priority", "kbd", "Note Priority", "enum", "High, low, new or old.", VOICE, cc=85, values=[{"value": v} for v in ["high", "low", "new", "old"]])
menu("kbd.unison_detune", "kbd", "Unison Detune", "integer", "0-100 (% of 0.2 note).", VOICE, cc=55, range={"min": 0, "max": 100})
menu("kbd.voice_spread", "kbd", "Voice Spread", "integer", "Random per-voice detune, 0-100 (% of 0.2 note).", VOICE, cc=62, range={"min": 0, "max": 100})
menu("kbd.note_reassign", "kbd", "Note Reassign", "enum", "Same voice or next voice for a repeated note.", VOICE, cc=86, values=[{"value": "same_voice"}, {"value": "next_voice"}])
menu("kbd.voice_kill", "kbd", "Voice Setup", "enum", "Kill or restore individual voices.", VOICE, memory="global", values=[{"value": "killed"}, {"value": "not_killed"}])
PORTA = "SHIFT + PORTA (button 34)"
menu("kbd.legato_threshold", "kbd", "AUTO Legato Time Threshold", "integer", "50-250 ms.", PORTA, range={"min": 50, "max": 250})
menu("kbd.glide_mode", "kbd", "Glide Mode", "enum", "Fixed time or fixed speed.", PORTA, cc=56, values=[{"value": "time"}, {"value": "speed"}])
menu("kbd.glide_time", "kbd", "Glide Time / Speed", "integer", "0-5 s (fixed time) or semitones per second.", PORTA, cc=37, range=K127)
MODM = "SHIFT + MOD (button 39)"
menu("lfo.shape", "lfo", "LFO Shape", "enum", "LFO waveform.", MODM, cc=49, values=[{"value": v} for v in ["triangle", "pulse", "ramp", "sawtooth", "sine"]])
menu("lfo.delay_ramp", "lfo", "LFO Delay Ramp speed", "integer", "0%: full depth after the delay; 100%: fade in over the delay time.", MODM, cc=27, range={"min": 0, "max": 100})
menu("lfo.retrigger", "lfo", "LFO Retrigger", "boolean", "Restart the LFO on a new key or LFO TRIG.", MODM, cc=87)
menu("lfo.sync", "lfo", "LFO Sync", "enum", "Sync to the arpeggiator clock.", MODM, cc=48, values=[{"value": v} for v in ["off", "8", "4", "2", "1", "12/16", "8/16", "4/16", "2/16", "1/16", "1/3"]])
menu("env.curve", "env", "Envelope Decay/Release Mode", "enum", "Exponential or linear.", MODM, cc=89, values=[{"value": "exponential"}, {"value": "linear"}])
menu("env.retrigger", "env", "Envelope Retrigger", "boolean", "Retrigger the envelope on legato notes.", "SHIFT + MOD (by CC)", cc=93, confidence="inferred", note="Listed in the CC chart only.")
VA = "SHIFT + VEL/AFT (button 37)"
for pid, label, cc in (("mod.vel_vca", "Velocity to VCA", 90), ("mod.vel_vcf", "Velocity to VCF", 58), ("mod.vel_env", "Velocity to envelope", 28), ("mod.at_vcf", "After Touch to VCF", 57),
                       ("mod.at_vca", "After Touch to VCA", None), ("mod.at_pwm", "After Touch to PWM", None), ("mod.at_lfo_dco", "After Touch to LFO > DCO", 30),
                       ("mod.at_lfo_vcf", "After Touch to LFO > VCF", 59), ("mod.at_lfo_rate", "After Touch to LFO Rate", 31), ("mod.at_lfo_pwm", "After Touch to LFO > PWM", 63),
                       ("mod.at_env", "After Touch to envelope", 29), ("mod.mw_lfo_dco", "Mod Wheel LFO > DCO", 60), ("mod.mw_lfo_vcf", "Mod Wheel LFO > VCF", 61),
                       ("mod.pedal_vcf", "Pedal/CV to VCF amount", 94), ("mod.pedal_vca", "Pedal/CV to VCA amount", None), ("mod.pedal_env", "Expression to envelope", 95)):
    menu(pid, "kbd", label, "integer", f"{label} depth, 0-100%.", MODM if pid.startswith(("mod.mw", "mod.pedal")) else VA, cc=cc, range={"min": 0, "max": 100})
# globals
GLOB = "SHIFT + GLOBAL (button 33)"
for pid, label, vals in (("sys.param_update", "Parameter Update", ["join", "immediate"]), ("sys.recall_mode", "Recall Mode", ["global", "per_bank", "first_4"]),
                         ("sys.fan", "Fan Speed", ["auto", "slow", "mid", "fast", "off"]), ("sys.pedal_polarity", "Pedal Polarity", ["active_high", "active_low", "auto"]),
                         ("sys.local", "Local Enable", ["off", "on"]), ("sys.soft_thru", "Soft Thru", ["off", "on"]), ("sys.hold_mode", "Hold Mode", ["refresh", "add"]),
                         ("sys.at_sensitivity", "Aftertouch Sensitivity", ["very_low", "low", "medium", "high", "very_high"])):
    menu(pid, "kbd", label, "enum", f"{label}.", GLOB, memory="global", values=[{"value": v} for v in vals])
menu("sys.key_hardness", "kbd", "Key bed hardness", "integer", "Velocity response, 0-100%.", GLOB, memory="global", range={"min": 0, "max": 100})
USBM = "SHIFT + USB/MIDI (button 36)"
menu("sys.midi_rx", "kbd", "Receive channel", "enum", "1-16 or all.", USBM, memory="global", values=[{"value": "1..16"}, {"value": "all"}])
menu("sys.midi_tx", "kbd", "Transmit channel", "enum", "1-16 or off.", USBM, memory="global", values=[{"value": "1..16"}, {"value": "off"}])
menu("sys.cc_mode", "kbd", "CC Settings", "enum", "CC receive/transmit.", USBM, memory="global", values=[{"value": v} for v in ["off", "rx", "tx", "rx_tx"]])
menu("sys.pc_mode", "kbd", "Program Change Settings", "enum", "Program change receive/transmit.", USBM, memory="global", values=[{"value": v} for v in ["off", "rx", "tx", "rx_tx"]])
menu("sys.kbd_forward", "kbd", "Keyboard Forward", "enum", "Where keyboard notes are sent.", USBM, memory="global", values=[{"value": v} for v in ["off", "usb", "midi", "usb_midi"]])

# ---------------------------------------------------------------- ports
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI over 5-pin DIN.", "5-pin DIN", 53)
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI from the JN-80.", "5-pin DIN", 54)
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "Mirrors MIDI IN and USB.", "5-pin DIN", 55)
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI; SysEx dumps; firmware via SynthTribe.", "USB 2.0 type B", 52)
jack("jack.pedal_cv", "PEDAL CV", "in", "cv", "bender.pedal_in", "Expression pedal or CV to the Mod menu destinations (tip supplies voltage).", "6.35 mm TRS", 56)
jack("jack.sustain", "SUSTAIN", "in", "gate", "kbd.sustain", "Footswitch duplicating HOLD.", "6.35 mm TS", 57)
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS", 58)
jack("jack.out_l", "MAIN OUT L (MONO)", "out", "audio", "out.main_l", "Main left / mono.", "6.35 mm TRS", 59)
jack("jack.out_r", "MAIN OUT R", "out", "audio", "out.main_r", "Main right.", "6.35 mm TRS", 59)
jack("jack.sync", "SYNC", "in", "clock", "arp.sync_in", "External arpeggiator clock (overrides RATE).", "6.35 mm TS", 60)
jack("jack.ac", "AC INPUT", "in", "power", None, "100-240 V, 50/60 Hz, IEC.", "IEC C14", 51)

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.arp_in", note="Arpeggiated notes.")
con("kbd.pitch", "dco.pitch_cv")
con("kbd.pitch", "sub.pitch_cv")
con("kbd.gate", "env.gate", "gate")
con("kbd.velocity", "env.velocity", amount="mod.vel_env")
con("kbd.gate", "lfo.trig", "gate", eq("lfo.trig_mode", "auto"))
con("lfo.out", "dco.pitch_cv", amount="dco.lfo")
con("lfo.out", "sub.pitch_cv", amount="dco.lfo", confidence="inferred")
con("lfo.out", "dco.pwm_cv", eq("dco.pwm_source", "lfo"), amount="dco.pwm")
con("env.out", "dco.pwm_cv", eq("dco.pwm_source", "env"), amount="dco.pwm")
con("bender.out", "dco.pitch_cv", amount="bender.dco")
con("bender.out", "vcf.cutoff_cv", amount="bender.vcf")
con("kbd.modwheel", "lfo.rate_cv", amount="mod.mw_lfo_dco", note="Mod wheel brings in LFO depth to DCO/VCF; modelled on the LFO.", confidence="inferred")
con("kbd.aftertouch", "vcf.cutoff_cv", amount="mod.at_vcf")
con("bender.pedal", "vcf.cutoff_cv", amount="mod.pedal_vcf")
con("dco.saw", "mixer.saw", "audio", eq("dco.saw", True))
con("dco.pulse", "mixer.pulse", "audio", eq("dco.pulse", True))
con("sub.out", "mixer.sub", "audio", eq("dco.sub_on", True), amount="sub.level")
con("noise.out", "mixer.noise", "audio", amount="noise.level")
con("mixer.out", "vcf.in", "audio")
con("env.out", "vcf.cutoff_cv", amount="vcf.env", note="Polarity per ENV INVERT; velocity to VCF scales it.")
con("lfo.out", "vcf.cutoff_cv", amount="vcf.lfo")
con("kbd.pitch", "vcf.cutoff_cv", amount="vcf.kybd")
con("vcf.out", "vca.in", "audio")
con("env.out", "vca.cv", eq("vca.mode", "env"), amount="vca.level")
con("kbd.gate", "vca.cv", "gate", eq("vca.mode", "gate"), amount="vca.level")
con("kbd.velocity", "vca.cv", amount="mod.vel_vca")
con("vca.out", "hpf.in", "audio", note="Eight voices summed.")
con("hpf.out", "chorus.in", "audio")
con("chorus.out_l", "out.l", "audio")
con("chorus.out_r", "out.r", "audio")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "lcd", "module": "kbd", "label": "LCD display", "kind": "display", "function": "2 x 16 characters: patch name, arpeggiator settings, menus, compare and match."},
    {"id": "button_leds", "module": "kbd", "label": "button LEDs", "kind": "led", "function": "Voice mode, transpose (flashes), hold, arp, sub/saw/pulse, chorus level, portamento, recall."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["dco", "mixer", "vcf", "vca", "hpf", "chorus"],
     "rule": "Per voice: DCO sawtooth and pulse (switched), sub and noise into the 24 dB VCF and the VCA. Voices summed into the high-pass filter and BBD chorus, then stereo out."},
    {"id": "b02", "name": "One envelope", "applies_to": ["env", "vcf", "vca", "dco"],
     "rule": "A single ADSR drives the VCF (normal or inverted), the VCA (unless gated) and, if selected, PWM; decay/release can be exponential or linear."},
    {"id": "b03", "name": "LFO", "applies_to": ["lfo"],
     "rule": "One global LFO to pitch, PWM and cutoff. AUTO: starts after DELAY TIME on key press; MANUAL: fades in over DELAY TIME when LFO TRIG is pressed. Five shapes and tempo sync in the MOD menu; mod wheel and aftertouch can add depth."},
    {"id": "b04", "name": "Voice modes", "applies_to": ["kbd"],
     "rule": "Poly (8), duo, unison (with detune), quad and mono; note priority, same/next voice reassignment, voice spread and voice kill in the VOICE menu. Portamento is polyphonic (off, auto/legato, on)."},
    {"id": "b05", "name": "Arpeggiator", "applies_to": ["arp", "kbd"],
     "rule": "Seven modes, eight divisions, held notes or 1-3 octaves, note length, swing; internal 10-265 BPM, MIDI, USB or SYNC (1 PPS to 48 PPQN). HOLD latches."},
    {"id": "b06", "name": "Programs", "applies_to": ["kbd"],
     "rule": "WRITE to a bank and slot; COMPARE switches between edited and stored versions (compare and match aligns panel controls); MANUAL plays the panel. Four recall buttons by recall mode. Factory presets restorable in the INITIAL menu; presets dump as SysEx."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change"},
                 {"message": "control_change", "cc": 0, "parameter": "bank select (0-19 = banks A-T)"}, {"message": "control_change", "cc": 1, "parameter": "mod wheel"},
                 {"message": "control_change", "cc": 11, "parameter": "expression"}, {"message": "control_change", "cc": 64, "parameter": "sustain"}, {"message": "control_change", "cc": 66, "parameter": "sostenuto"},
                 {"message": "control_change", "note": "full panel and menu set: see parameter access entries"}, {"message": "nrpn", "note": "14-bit (0-4095) for continuous controls; data entry CC 6/38, inc/dec 96/97"},
                 {"message": "control_change", "cc": 120, "parameter": "all sounds off"}, {"message": "control_change", "cc": 123, "parameter": "all notes off"}, {"message": "clock"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "control_change"}, {"message": "nrpn"}, {"message": "program_change"}, {"message": "sysex", "note": "preset dump"}],
    "channel_note": "Receive 1-16 or all; transmit 1-16 or off; DIN and USB.", "note": "CCs work when enabled in the USB/MIDI menu."}
D["specifications"] = {
    "voices": 8, "oscillators": "1 DCO per voice + sub + noise", "vcf": "4-pole 24 dB/oct low-pass (3109 design)", "vca": "662 design", "hpf": 1, "envelopes": "1 ADSR per voice", "lfo": 1,
    "keyboard": "49 full-size keys, velocity and aftertouch", "presets": {"factory": 200, "user": 400}, "lcd": "2 x 16 characters",
    "connectivity": {"midi": "DIN in, out, thru", "usb": "USB 2.0 type B, class compliant", "main_out": "2 x 6.35 mm TRS balanced, max +22 dBu, 50 ohm", "phones": "6.35 mm TRS, 25 mW, 25 ohm",
                     "pedal_cv": "6.35 mm TS/TRS", "sustain": "6.35 mm TS", "sync": "6.35 mm TS"},
    "power": "internal PSU 100-240 V, 36 W", "dimensions_mm": {"h": 108.7, "w": 826.3, "d": 261.1}, "weight_kg": 7.28, "price": "USD 569 / GBP 479 (launch)",
}
D["omitted_from_source"] = ["safety and legal text", "non-English translations", "hook-up diagrams", "calibration and LCD sub-menus beyond their names"]
D["not_in_source"] = ["programs per bank (20 inferred from 400 slots in banks A-T)", "the HPF's position in the signal path (after the voice sum, as on the Juno-60)", "LFO and envelope curve detail",
                      "chorus III behaviour", "SysEx format"]
D["source_inconsistencies"] = [
    "MAIN OUT is 'unbalanced 6.35 mm TS' in the controls list but 'TRS, balanced' in the specifications.",
    "Chorus has 'two levels' on the panel but the CC chart lists off, I, II and III.",
    "LFO rate is 0.3-22 Hz on the panel and about 0.3-20 Hz in the NRPN chart; LFO delay is 0-6 s on the panel and 0-8 s in the NRPN chart.",
    "The Voice Assign menu lists Poly, Duo, Uni, Mono; the CC chart (and launch coverage) add Quad.",
    "Voice Setup steps through voices 1-7 on an 8-voice synth.",
    "The specifications say polyphonic aftertouch; MusicRadar reports channel aftertouch.",
    "Retailers give 400 user presets and, in one listing, 256 user program memories.",
    "The CC chart repeats hex 23 for CC 35 and 36 (CC 36 should be 24), and lists CC 64 and 69 both as 'Sustain pedal'.",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); LFO, HPF, chorus and arpeggiator are common, as on the Juno-60."},
    {"topic": "Modulation menus", "detail": "Velocity, aftertouch, mod wheel and pedal depths are modelled as parameters; only the main routes are drawn as connections."},
    {"topic": "Original", "detail": "The Roland Juno-60 itself is not modelled; its service notes would allow a TB-303/TD-3 style pair."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/behringer-jn-80_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
