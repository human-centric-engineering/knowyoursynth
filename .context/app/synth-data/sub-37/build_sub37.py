#!/usr/bin/env python3
"""Assemble the Moog Sub 37 device file (schema 0.11.0).

Paraphonic (duo) analogue synth: two variable-waveshape oscillators, square sub, pink
noise and a feedback/external channel into a mixer that drives a 6-24 dB Moog ladder
filter, then MultiDrive, VCA and output. Two mod buses (each with its own LFO, five
waves plus filter EG/programmable source), two looping DAHDSR envelopes, glide,
arpeggiator and 64-step sequencer, 256 presets, CV and gate inputs.

Source: Moog Sub 37 owner's manual (2015). Parameters carry their CC (and NRPN where
the chart gives one); memory marks patch, global or live.
"""
import json

S10 = {"min": 0, "max": 10}
BI = {"min": -5, "max": 5}
D = {"schema_version": "0.11.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
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


def panel(control, cc=None, nrpn=None, note=None):
    a = [{"type": "panel", "control": control, **({"note": note} if note else {})}]
    if cc is not None:
        a.append({"type": "midi", "message": f"CC {cc}"})
    if nrpn is not None:
        a.append({"type": "midi", "message": f"NRPN {nrpn}"})
    return a


def menu(path, cc=None, nrpn=None):
    a = [{"type": "menu", "note": path}]
    if cc is not None:
        a.append({"type": "midi", "message": f"CC {cc}"})
    if nrpn is not None:
        a.append({"type": "midi", "message": f"NRPN {nrpn}"})
    return a


def ev(v):
    return [{"value": x} for x in v]


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


def eq(p, v):
    return {"param": p, "equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


CLOCK_DIVS = ["4 whole", "3 whole", "2 whole", "whole + 1/2", "whole", "1/2 dot", "whole T", "1/2", "1/4 dot", "1/2 T", "1/4", "1/8 dot", "1/4 T", "1/8", "1/16 dot",
              "1/8 T", "1/16", "1/16 T", "1/32", "1/32 T", "1/64 T"]

D["device"] = {
    "id": "moog-sub-37", "manufacturer": "Moog Music", "model": "Sub 37 Tribute Edition",
    "category": "2-note paraphonic analogue synthesizer, 37 keys, with arpeggiator, 64-step sequencer and 256 presets",
    "based_on": "Development of the Moog Sub Phatty (2013), adding duo mode, a second mod bus, looping DAHDSR envelopes and the sequencer; released 2014.",
    "sources": [{"id": "manual", "title": "Moog Sub 37 Owner's Manual (2015)", "kind": "user_manual", "file": "Moog_Sub_37.pdf", "pages": 64,
                 "note": "Connections, every panel section, step sequencer and step edit, MIDI, preset edit, global and controllers menus, CC chart, NRPN chart (partly read), specifications."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic or duophonic (duo mode: each oscillator plays its own note through one filter)",
    "poly_chain_max_units": 16, "patch_memory": True,
    "patch_memory_note": "256 presets (16 banks x 16), each with its own 64-step sequence; a PANEL mode plays the knobs live.",
    "semi_modular": False, "panel_counts": {"keys": 37, "knobs": 40, "switches": 74},
    "summary": ("Two oscillators with continuously variable waveshape (triangle to narrow pulse), hard sync and duo mode; a square sub oscillator an octave below Osc 1; pink noise; "
                "and a feedback channel (mixer output back into the mixer) that becomes an external input when EXT IN is used. Levels above 5 overdrive the 20 Hz-20 kHz Moog ladder "
                "filter (6, 12, 18 or 24 dB/oct), followed by MultiDrive, the VCA and output. Two mod buses each pair an LFO (or the filter EG, or a programmable source) with pitch, "
                "filter and switched destinations, scaled by mod wheel, velocity, aftertouch and a fourth controller. Two looping DAHDSR envelopes, glide, arpeggiator, 64-step sequencer."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and note control", "KEYBOARD / KB OCTAVE",
    "37 semi-weighted keys with velocity and aftertouch, KB octave ±2, transpose ±12, note priority; in duo mode Osc 1 and Osc 2 take separate notes per KB CTRL.",
    ["kbd.midi_in", "kbd.seq_in", "kbd.gate_in", "kbd.pitch_cv_in"], ["kbd.pitch1", "kbd.pitch2", "kbd.gate", "kbd.velocity", "kbd.aftertouch"], props={"keys": 37})
mod("wheels", "manual_controller", "Pitch and Mod wheels", "LEFT OF KEYBOARD", "Pitch bend (range and destination per preset) and mod wheel (default depth of MOD 1).", [], ["wheels.bend", "wheels.mod"])
mod("arp", "arpeggiator", "Arpeggiator and sequencer", "ARPEGGIATOR",
    "Arpeggiator (up, down, order, random; range ±2 octaves; back/forth, invert) at 2-280 BPM, synced divisions or tap tempo; 1-64 step paraphonic sequencer with rests, ties, ratchets, skips and per-step mod values.",
    [], ["arp.notes", "arp.seq_mod"], props={"tempo_bpm": [2, 280], "steps": 64})
for n in (1, 2):
    mod(f"lfo{n}", "lfo", f"LFO {n}", f"MOD {n}", f"LFO for mod bus {n}: triangle, square, saw, ramp or sample and hold; 0.1-100 Hz, x10 with HI RANGE; sync, KB reset, keyboard tracking, swing.",
        [f"lfo{n}.rate_cv", f"lfo{n}.reset"], [f"lfo{n}.out"], props={"rate_hz": [0.1, 1000]})
    mod(f"mod{n}", "modulation_bus", f"Mod bus {n}", f"MOD {n}",
        f"Picks the LFO wave or F.EG/PGM source and sends it to oscillator pitch (PITCH AMT, chosen oscillators), filter cutoff (FILTER AMT) and one switched destination (MOD AMT). "
        f"Overall depth from mod wheel, velocity, aftertouch and CTRL4 amounts" + (" (mod wheel by default)." if n == 1 else "."),
        [f"mod{n}.lfo", f"mod{n}.pgm", f"mod{n}.depth"], [f"mod{n}.out"])
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATORS", "Waveshape continuously variable from triangle through saw and square to narrow pulse; 16'-2'.", ["osc1.pitch_cv", "osc1.wave_cv"], ["osc1.out"])
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATORS", "As Osc 1, plus FREQUENCY (±7 semitones, ±3 octaves when droning), BEAT (±3.5 Hz) and hard sync to Osc 1.",
    ["osc2.pitch_cv", "osc2.wave_cv", "osc2.sync_in"], ["osc2.out"])
mod("sub", "oscillator", "Sub oscillator", "MIXER", "Square wave exactly one octave below Osc 1.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "MIXER", "Analogue pink noise.", ["noise.level_cv"], ["noise.out"])
mod("fbext", "electronic_switch", "Feedback / external input", "MIXER", "Feeds the mixer output back into its fifth channel; a plug in EXT IN replaces the feedback with the external signal.",
    ["fbext.feedback", "fbext.ext"], ["fbext.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Five channels with level and mute: Osc 1, Sub, Osc 2, Noise, FDBK/EXT. Above 5 a channel overdrives the filter input.",
    ["mixer.osc1", "mixer.sub", "mixer.osc2", "mixer.noise", "mixer.fbext"], ["mixer.out"])
mod("vcf", "filter", "Ladder filter", "FILTER", "Moog low-pass ladder, 20 Hz-20 kHz, slope 6, 12, 18 or 24 dB/oct; self-oscillates above resonance 7; EG amount and keyboard tracking (1:1 at half, 2:1 at full).",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"cutoff_hz": [20, 20000], "slopes_db_per_oct": [6, 12, 18, 24]})
mod("drive", "overdrive", "MultiDrive", "FILTER", "OTA and FET drive stages between filter and VCA, from tube-like warmth to hard clipping.", ["drive.in"], ["drive.out"])
for e, nm in (("env_f", "Filter envelope"), ("env_a", "Amplifier envelope")):
    mod(e, "envelope", nm, "ENVELOPES", "DAHDSR (delay and hold via KNOB SHIFT), 1 ms-10 s stages, velocity and key tracking amounts, multi-trigger, reset, clock sync, loop, latch; gate source and exponential attack in PRESET EDIT.",
        [f"{e}.gate", f"{e}.velocity", f"{e}.time_cv"], [f"{e}.out"], props={"stages": "DAHDSR", "time_s": [0.001, 10]})
mod("vca", "vca", "VCA", "OUTPUT", "Driven by the amplifier envelope; modulatable (VCA LEVEL destination) and by the VOL CV input.", ["vca.in", "vca.cv"], ["vca.out"])
mod("out", "output", "Output", "OUTPUT", "MASTER VOLUME to AUDIO OUT (with MUTE) and the headphone output (own volume, unaffected by MUTE); mono.", ["out.in"], ["out.main", "out.phones"])

# ---------------------------------------------------------------- parameters: modulation
for n, cc in ((1, {"rate": 3, "pitch": 4, "filt": 11, "pgm": 20, "osc": 70, "src": 71, "dest": 91, "range": 76, "kbr": 93}),
              (2, {"rate": 8, "pitch": 15, "filt": 16, "pgm": 17, "osc": 88, "src": 72, "dest": 92, "range": 78, "kbr": 95})):
    m_, l_ = f"mod{n}", f"lfo{n}"
    other = 2 if n == 1 else 1
    par(f"{l_}.rate", l_, f"LFO {n} RATE", "continuous", "LFO rate, or clock division when SYNC is on.", "patch", panel("knob", f"{cc['rate']}:{cc['rate'] + 32}"), panel_scale=S10,
        physical={"min": 0.1, "max": 100, "unit": "Hz"})
    par(f"{m_}.source", m_, f"MOD {n} SOURCE", "enum", "Modulation source: one of five LFO waves, or F.EG/PGM (filter EG by default, or the programmable source).", "patch",
        panel("rotary_switch", cc["src"]), values=ev(["triangle", "square", "saw", "ramp", "sample_hold", "feg_pgm"]))
    par(f"{l_}.hi_range", l_, f"MOD {n} HI RANGE", "boolean", "Multiplies the LFO rate by 10 (1-1000 Hz).", "patch", panel("push_button", cc["range"]),
        note="The CC chart offers Low, Med and Hi ranges.")
    par(f"{l_}.sync", l_, f"MOD {n} SYNC", "boolean", "Syncs the LFO to internal or MIDI clock; RATE then picks a division.", "patch", panel("push_button"))
    par(f"{l_}.kb_reset", l_, f"MOD {n} KB RESET", "boolean", "Restarts the LFO on each new note.", "patch", panel("push_button", cc["kbr"]))
    par(f"{m_}.pitch_amt", m_, f"MOD {n} PITCH AMT", "continuous", "Bipolar depth on oscillator pitch.", "patch", panel("knob", f"{cc['pitch']}:{cc['pitch'] + 32}"), panel_scale=BI)
    par(f"{m_}.pitch_osc", m_, f"MOD {n} OSC", "enum", "Which oscillators PITCH AMT reaches.", "patch", panel("push_button", cc["osc"]), values=ev(["both", "osc1", "osc2"]), default="both")
    par(f"{m_}.filter_amt", m_, f"MOD {n} FILTER AMT", "continuous", "Bipolar depth on filter cutoff.", "patch", panel("knob", f"{cc['filt']}:{cc['filt'] + 32}"), panel_scale=BI)
    par(f"{m_}.mod_amt", m_, f"MOD {n} MOD AMT", "continuous", "Bipolar depth on the switched destination.", "patch", panel("knob", f"{cc['pgm']}:{cc['pgm'] + 32}"), panel_scale=BI)
    par(f"{m_}.dest", m_, f"MOD {n} DEST", "enum", f"Switched destination; LFO RATE means LFO {other}.", "patch", panel("push_button", cc["dest"]),
        values=ev(["lfo_rate", "vca_level", "osc1_wave", "osc1_osc2_wave", "osc2_wave", "noise_level", "eg_time_pgm"]))
    base = 0  # controllers menu
    for k, lab in (("mod_wheel", "MOD WHEEL"), ("velocity", "VELOCITY"), ("aftertouch", "AFTERTOUCH"), ("ctrl4", "CTRL4 AMT")):
        par(f"{m_}.{k}_depth", m_, f"MOD {n} {lab}", "integer", f"How much {lab.lower()} sets the bus depth at its maximum.", "patch", menu(f"CONTROLLERS, MOD {n} CONTROL"),
            range={"min": -100, "max": 100}, default=(100 if (n == 1 and k == "mod_wheel") else 0), note="Percent." + (" Default 100% for MOD 1 is inferred from 'by default, the overall depth of MOD 1 is determined by the MODULATION wheel'." if n == 1 and k == "mod_wheel" else ""))
    par(f"{m_}.ctrl4_src", m_, f"MOD {n} CTRL4 SRC", "enum", "Source of the fourth depth controller.", "patch", menu(f"CONTROLLERS, MOD {n} CONTROL"),
        values=ev(["breath_cc2", "filter_eg", "amp_eg", "lfo1", "lfo2"]), default="breath_cc2")
    par(f"{m_}.pgm_src", m_, f"MOD {n} PGM SRC", "enum", "Source used at the F.EG/PGM position.", "patch", menu(f"CONTROLLERS, MOD {n} EDIT"),
        values=ev(["filter_eg", "amp_eg", "sine_lfo", "noise_lfo", "osc1_pitch", "osc2_pitch", "seq_note", "seq_vel", "seq_mod", "pressure", "velocity", "kb_track", "const_on"]),
        default="filter_eg")
    par(f"{m_}.pgm_dst", m_, f"MOD {n} PGM DST", "enum", "Destination used at the EG TIME/PGM position (default EG TIME); almost any parameter.", "patch", menu(f"CONTROLLERS, MOD {n} EDIT"),
        values=ev(["eg_time", "filter_res", "filter_drive", "filter_slope", "feg_amt", "fkb_amt", "osc_levels", "glide", "arp", "lfo", "osc", "envelope", "volume_bend_swing"]),
        default="eg_time", note="About 80 destinations in the manual's list, grouped here.")
    par(f"{l_}.kb_track", l_, f"LFO {n} KBTRACK", "integer", "LFO rate rises with key number.", "patch", menu(f"CONTROLLERS, MOD {n} CONTROL"), range={"min": 0, "max": 200}, note="Percent.")
    par(f"{l_}.swing", l_, f"LFO {n} SWING", "boolean", "Synced LFO follows the arpeggiator swing.", "patch", menu(f"CONTROLLERS, MOD {n} CONTROL"), default=True)
# oscillators
par("osc1.octave", "osc1", "OSC 1 OCTAVE", "enum", "Footage.", "patch", panel("rotary_switch", 74, "3:95"), values=ev(["16'", "8'", "4'", "2'"]))
par("osc1.wave", "osc1", "OSC 1 WAVE", "continuous", "Triangle - saw - square - narrow pulse, continuously.", "patch", panel("knob", "9:41", "3:96"), panel_scale=S10)
par("osc2.octave", "osc2", "OSC 2 OCTAVE", "enum", "Footage.", "patch", panel("rotary_switch", 75, "3:99"), values=ev(["16'", "8'", "4'", "2'"]))
par("osc2.wave", "osc2", "OSC 2 WAVE", "continuous", "Triangle - saw - square - narrow pulse, continuously.", "patch", panel("knob", "14:46", "3:100"), panel_scale=S10)
par("osc2.frequency", "osc2", "OSC 2 FREQUENCY", "continuous", "Tuning against Osc 1, ±7 semitones (fully clockwise is a fifth); ±3 octaves with KB CTRL off.", "patch", panel("knob", "12:44", "3:103"),
    physical={"min": -7, "max": 7, "unit": "semitones"})
par("osc2.beat", "osc2", "OSC 2 BEAT FREQ", "continuous", "Constant detune of ±3.5 Hz, so beating is the same at every pitch.", "patch", panel("knob", "13:45", "3:104"), physical={"min": -3.5, "max": 3.5, "unit": "Hz"})
par("osc2.hard_sync", "osc2", "HARD SYNC", "boolean", "Osc 1 resets Osc 2 each cycle.", "patch", panel("push_button", 77, "3:97"))
par("osc.kb_reset", "osc1", "OSC KB RESET", "boolean", "Both oscillators restart their cycle on each note.", "patch", panel("push_button", 81, "3:98"))
par("osc.duo", "kbd", "DUO MODE", "boolean", "Osc 1 and Osc 2 play separate notes.", "patch", panel("push_button", 110, "3:102"))
par("osc2.kb_ctrl", "osc2", "KB CTRL", "enum", "In duo mode: Osc 2 takes the high or low note, or drones (OFF).", "patch", panel("push_button", 111, "3:101"), values=ev(["off", "lo", "hi"]))
par("osc.fine_tune", "osc1", "FINE TUNE", "continuous", "Both oscillators ±1 semitone; also edits menu values.", "global", panel("knob"), physical={"min": -100, "max": 100, "unit": "cents"})
# mixer
for src, label, cc, nr_lvl, nr_on in (("osc1", "OSC 1", 114, "3:105", "3:106"), ("sub", "SUB OSC", 115, "3:108", "3:107"), ("osc2", "OSC 2", 116, "3:109", "3:110"),
                                      ("noise", "NOISE", 117, "3:112", "3:111"), ("fbext", "FDBK/EXT IN", 118, "3:113", "3:114")):
    par(f"mixer.{src}", "mixer", label, "continuous", f"{label} level; above 5 overdrives the filter.", "patch", panel("knob", cc, nr_lvl), panel_scale=S10)
    par(f"mixer.{src}_on", "mixer", f"{label} ON", "boolean", f"Mutes or unmutes {label} without moving its level.", "patch", panel("push_button", None, nr_on), default=True)
# filter
par("vcf.cutoff", "vcf", "CUTOFF", "continuous", "Cutoff 20 Hz-20 kHz.", "patch", panel("knob", "19:51", "3:115"), physical={"min": 20, "max": 20000, "unit": "Hz"})
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Self-oscillates above 7.", "patch", panel("knob", "21:53", "3:116"), panel_scale=S10)
par("drive.amount", "drive", "MULTIDRIVE", "continuous", "Drive of the post-filter OTA and FET stages.", "patch", panel("knob", "18:50", "3:117"), panel_scale=S10)
par("vcf.slope", "vcf", "SLOPE", "enum", "Filter slope; switchable while playing.", "patch", panel("push_button", 109, "3:118"), values=ev(["-6", "-12", "-18", "-24"]), default="-24",
    note="dB per octave.")
par("vcf.eg_amt", "vcf", "EG AMOUNT", "continuous", "Bipolar filter EG depth.", "patch", panel("knob", "27:59", "3:119"), panel_scale=BI)
par("vcf.kb_track", "vcf", "KB TRACK", "continuous", "Cutoff tracking: none, 1:1 at half (around C3), 2:1 at full.", "patch", panel("knob", "22:54", "3:120"), panel_scale=S10)
# envelopes
for e, lab, cc, nr in (("env_f", "FILTER", {"a": 23, "d": 24, "s": 25, "r": 26, "dly": 103, "hld": 105, "vel": 86, "kb": 79, "mt": 112, "rst": 82}, {"a": "3:121", "d": "3:122", "s": "3:123", "r": "3:124", "dly": "3:125", "hld": "3:126", "vel": "3:127", "kb": "4:0", "mt": "4:1", "rst": "4:2", "sync": "4:3", "loop": "4:4", "latch": "4:5"}),
                       ("env_a", "AMP", {"a": 28, "d": 29, "s": 30, "r": 31, "dly": 104, "hld": 106, "vel": 87, "kb": 80, "mt": 113, "rst": 83}, {})):
    g = lambda k: nr.get(k)
    par(f"{e}.attack", e, f"{lab} ATTACK", "continuous", "Attack 1 ms-10 s.", "patch", panel("knob", f"{cc['a']}:{cc['a'] + 32}", g("a")), physical={"min": 0.001, "max": 10, "unit": "s"})
    par(f"{e}.decay", e, f"{lab} DECAY", "continuous", "Decay 1 ms-10 s.", "patch", panel("knob", f"{cc['d']}:{cc['d'] + 32}", g("d")), physical={"min": 0.001, "max": 10, "unit": "s"})
    par(f"{e}.sustain", e, f"{lab} SUSTAIN", "continuous", "Sustain level 0-100%.", "patch", panel("knob", f"{cc['s']}:{cc['s'] + 32}", g("s")), panel_scale=S10)
    par(f"{e}.release", e, f"{lab} RELEASE", "continuous", "Release 1 ms-10 s.", "patch", panel("knob", f"{cc['r']}:{cc['r'] + 32}", g("r")), physical={"min": 0.001, "max": 10, "unit": "s"})
    par(f"{e}.delay", e, f"{lab} DELAY (shift)", "continuous", "Delay before attack, 0-10 s" + ("; amp delay only works with LOOP on." if e == "env_a" else "."), "patch",
        panel("knob", cc["dly"], g("dly"), "KNOB SHIFT + ATTACK knob"), physical={"min": 0, "max": 10, "unit": "s"})
    par(f"{e}.hold", e, f"{lab} HOLD (shift)", "continuous", "Hold at peak after attack, 0-10 s.", "patch", panel("knob", cc["hld"], g("hld"), "KNOB SHIFT + DECAY knob"), physical={"min": 0, "max": 10, "unit": "s"})
    par(f"{e}.vel_amt", e, f"{lab} VEL AMT (shift)", "continuous", "Velocity scaling of the envelope amount, 0-100%.", "patch", panel("knob", cc["vel"], g("vel"), "KNOB SHIFT + SUSTAIN knob"), panel_scale=S10)
    par(f"{e}.kb_track", e, f"{lab} KB TRACK (shift)", "continuous", "Shortens decay and release on higher keys; 1:1 at centre, 2:1 at full.", "patch",
        panel("knob", cc["kb"], g("kb"), "KNOB SHIFT + RELEASE knob"), panel_scale=S10)
    par(f"{e}.multi_trig", e, f"{lab} MULTI TRIG", "boolean", "Retriggers on every note, legato or not.", "patch", panel("push_button", cc["mt"], g("mt")))
    par(f"{e}.reset", e, f"{lab} RESET", "boolean", "Attack starts from zero rather than the current level.", "patch", panel("push_button", cc["rst"], g("rst")))
    par(f"{e}.sync", e, f"{lab} SYNC", "boolean", "Retriggers at the envelope's clock division.", "patch", panel("push_button", None, g("sync")))
    par(f"{e}.loop", e, f"{lab} LOOP", "boolean", "Loops delay, attack, hold, decay and release while the note is held: a multi-stage LFO.", "patch", panel("push_button", None, g("loop")))
    par(f"{e}.latch", e, f"{lab} LATCH ON", "boolean", "Holds the envelope at sustain as if gated; with the amp envelope, passes external audio without keys.", "patch", panel("push_button", None, g("latch")))
    par(f"{e}.gate_src", e, f"{lab} EG GATE SRC", "enum", "What triggers the envelope.", "patch", menu(f"PRESET EDIT, {lab} EG"), values=ev(["both", "notes", "ext"]), default="both")
    par(f"{e}.exp_attack", e, f"{lab} EG EXP. ATTACK", "boolean", "Exponential rather than linear attack.", "patch", menu(f"PRESET EDIT, {lab} EG"), default=False)
    par(f"{e}.clock_div", e, f"{lab} EG CLOCK DIV", "enum", "Retrigger division when SYNC is on.", "patch", menu(f"PRESET EDIT, {lab} EG"), values=ev(CLOCK_DIVS))
par("env.knob_shift", "env_f", "KNOB SHIFT", "boolean", "Turns the envelope knobs into DELAY, HOLD, VEL AMT and KB TRACK.", "none", panel("push_button"))
# glide
par("glide.time", "kbd", "GLIDE TIME", "continuous", "Glide time.", "patch", panel("knob", "5:37", "3:33"), panel_scale=S10)
par("glide.osc", "kbd", "GLIDE OSC", "enum", "Oscillators that glide.", "patch", panel("push_button", 102, "3:34"), values=ev(["both", "osc1", "osc2"]))
par("glide.type", "kbd", "GLIDE TYPE", "enum", "Linear constant rate, linear constant time, or exponential.", "patch", panel("push_button", 85, "3:35"), values=ev(["LCR", "LCT", "EXP"]))
par("glide.gated", "kbd", "GLIDE GATED", "boolean", "Glides only while a key is held.", "patch", panel("push_button", None, "3:36"))
par("glide.legato", "kbd", "GLIDE LEGATO", "boolean", "Glides only between overlapping notes.", "patch", panel("push_button", 94, "3:37"))
par("glide.on", "kbd", "GLIDE ON", "boolean", "Glide on or off without changing the time.", "patch", panel("push_button", 65, "3:38"))
# arpeggiator / sequencer
par("arp.on", "arp", "ARP ON (REST)", "boolean", "Runs the arpeggiator or sequence; enters a rest while recording.", "patch", panel("push_button", 73, "3:26"))
par("arp.latch", "arp", "LATCH (TIE)", "boolean", "Keeps the arpeggio or sequence playing; enters a tie while recording.", "patch", panel("push_button", 69, "3:27"))
par("arp.rate", "arp", "ARP RATE", "continuous", "2-280 BPM, or division when synced.", "patch", panel("knob", None, "3:19"), physical={"min": 2, "max": 280, "unit": "BPM"})
par("arp.sync", "arp", "ARP SYNC (TAP)", "boolean", "Syncs to MIDI clock; hold 1 s for tap tempo.", "patch", panel("push_button", None, "3:20"))
par("arp.range", "arp", "ARP RANGE", "enum", "Octaves above or below; extra presses add a 3-octave back-and-forth.", "patch", panel("push_button", None, "3:21"),
    values=ev(["-2", "-1", "0", "+1", "+2", "0/-2", "0/+2"]))
par("arp.back_forth", "arp", "BACK/FORTH", "boolean", "Bidirectional patterns.", "patch", panel("push_button", None, "3:22"))
par("arp.invert", "arp", "INVERT", "boolean", "Plays each note in successive octaves before moving on.", "patch", panel("push_button", None, "3:24"))
par("arp.pattern", "arp", "PATTERN", "enum", "Arpeggio order, or step sequencer playback/record.", "patch", panel("rotary_switch", None, "3:25"), values=ev(["up", "down", "order", "random", "seq", "rec"]))
par("arp.gate_length", "arp", "ARP GATE LENGTH", "integer", "Note length, off to 100% (legato); default 50%.", "patch", menu("PRESET EDIT, ARPEGGIATOR", None, "3:28"), range={"min": 0, "max": 100}, default=50)
par("arp.clock_div", "arp", "ARP CLOCK DIV", "enum", "Note length against the clock.", "patch", menu("PRESET EDIT, ARPEGGIATOR", None, "3:29"), values=ev(CLOCK_DIVS))
par("arp.swing", "arp", "SWING", "integer", "50% straight; lower moves off-beats earlier, higher later.", "patch", menu("PRESET EDIT, ARPEGGIATOR"), range={"min": 0, "max": 100}, default=50)
par("arp.step1_reset", "arp", "STEP 1 RESET", "boolean", "KB RESET functions act only on the first note of the pattern.", "patch", menu("PRESET EDIT, ARPEGGIATOR", None, "3:32"))
par("arp.end_notes", "arp", "END NOTES", "enum", "Turnaround notes played once or twice in back/forth.", "patch", menu("PRESET EDIT, ARPEGGIATOR", None, "3:23"), values=ev(["once", "twice"]))
par("seq.mod_dst", "arp", "SEQ MOD DST", "enum", "Parameter driven by the per-step mod values (any parameter).", "patch", menu("PRESET EDIT, SEQUENCER"), values=ev(["off", "any_parameter"]), default="off")
par("seq.mod_amt", "arp", "SEQ MOD AMT", "integer", "Scales the per-step mod values.", "patch", menu("PRESET EDIT, SEQUENCER"), range={"min": 0, "max": 100}, default=0)
par("seq.mod_only", "arp", "SEQ MOD ONLY", "boolean", "Sequencer sends only mod values, no notes.", "patch", menu("PRESET EDIT, SEQUENCER"), default=False)
par("seq.modwhl_ctrl", "arp", "MODWHL CTRL", "boolean", "Mod wheel scales the sequence mod values live.", "patch", menu("PRESET EDIT, SEQUENCER"), default=False)
par("seq.ratchet_count", "arp", "RATCHET CNT", "integer", "Repeats within a ratcheted step (shared by all ratcheted steps).", "patch", menu("PRESET EDIT, SEQUENCER"), range={"min": 1, "max": 8}, default=2)
# preset-level
par("kbd.transpose", "kbd", "KB TRANSPOSE", "integer", "Keyboard transpose; also set by holding both KB OCTAVE buttons and pressing a key.", "patch", menu("PRESET EDIT 1.5", 119), range={"min": -12, "max": 12}, default=0)
par("kbd.priority", "kbd", "KB PRIORITY", "enum", "Note priority (overridden by the global setting unless that is PRST).", "patch", menu("PRESET EDIT 2.1"), values=ev(["low", "high", "last"]), default="last")
par("wheels.bend_up", "wheels", "BEND UP", "integer", "Upward bend in semitones.", "patch", menu("PRESET EDIT 2.2", 107), range={"min": 0, "max": 24}, default=2)
par("wheels.bend_down", "wheels", "BEND DOWN", "integer", "Downward bend in semitones.", "patch", menu("PRESET EDIT 2.3", 108), range={"min": 0, "max": 24}, default=2)
par("wheels.bend_dest", "wheels", "BEND DEST", "enum", "Oscillators the pitch wheel reaches.", "patch", menu("PRESET EDIT 2.4"), values=ev(["none", "osc1", "osc2", "both"]), default="both")
par("out.preset_vol", "out", "PRESET VOL", "integer", "Per-preset level scaling.", "patch", menu("PRESET EDIT 2.5"), range={"min": 0, "max": 100}, default=100)
# output / live
par("out.volume", "out", "MASTER VOLUME", "continuous", "Main output level.", "none", panel("knob", "7:39"), panel_scale=S10)
par("out.mute", "out", "MUTE", "boolean", "Mutes AUDIO OUT only (headphones unaffected).", "none", panel("push_button"))
par("out.phones", "out", "HEADPHONE VOLUME", "continuous", "Headphone level relative to MASTER VOLUME.", "none", panel("knob"), panel_scale=S10)
par("kbd.octave", "kbd", "KB OCTAVE", "integer", "Keyboard octave shift; both buttons reset, hold both for MIDI panic.", "none", panel("push_button", 89), range={"min": -2, "max": 2}, default=0)
par("wheels.bend", "wheels", "PITCH wheel", "continuous", "Pitch bend.", "none", [{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "pitch bend"}], panel_scale={"min": -1, "max": 1})
par("wheels.mod", "wheels", "MOD wheel", "continuous", "Mod wheel; also records per-step sequence mod values.", "none", [{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "CC 1:33"}], panel_scale=S10)
for pid, label, fn in (("util.preset", "PRESET (EDIT)", "Preset mode; hold for the PRESET EDIT menu."), ("util.panel", "PANEL (INIT)", "Panel mode (knobs live); hold to initialise the panel."),
                       ("util.compare", "COMPARE", "Auditions the stored preset without losing edits."), ("util.save", "SAVE", "Names, categorises and stores a preset."),
                       ("util.bank", "BANK", "Bank select; with LATCH, enters step edit."), ("util.preset_buttons", "PRESET 1-16", "Preset select; step buttons in step edit."),
                       ("util.midi", "MIDI", "MIDI menu."), ("util.global", "GLOBAL", "Global menu."), ("util.cursor", "CURSOR / DEC / INC", "Menu navigation and value entry.")):
    par(pid, "kbd", label, "boolean", fn, "none", panel("push_button"))
# global
for pid, label, fn, vals, dflt in (("sys.midi_in_ch", "IN CHANNEL", "MIDI receive channel (ALL = omni).", [str(i) for i in range(1, 17)] + ["all"], "1"),
                                   ("sys.midi_out_ch", "OUT CHANNEL", "MIDI transmit channel.", [str(i) for i in range(1, 17)], "1"),
                                   ("sys.in_ports", "IN PORTS", "Ports that receive MIDI.", ["off", "din", "usb", "both"], "both"),
                                   ("sys.out_ports", "OUT PORTS", "Ports that send MIDI.", ["off", "din", "usb", "both"], "both"),
                                   ("sys.knob_out", "KNB NRPN/CC", "Panel controls send CCs or NRPNs.", ["cc", "nrpn"], "cc"),
                                   ("sys.cc_format", "CC FORMAT", "7-bit or 14-bit CCs.", ["7bit", "14bit"], "7bit"),
                                   ("sys.send_clock", "SEND CLOCK", "When MIDI clock is sent.", ["off", "arp", "on"], "off"),
                                   ("sys.kb_priority", "GLOBAL KB PRIORITY", "Overrides per-preset priority unless PRST.", ["low", "high", "last", "prst"], "prst"),
                                   ("sys.pot_mode", "POT MODE", "Knob pickup: jump, pass-through or relative.", ["abs", "thru", "rltv"], "abs"),
                                   ("sys.ref_note", "SEQ REF NOTE", "Sequence transposition from the first note or Middle C.", ["first", "mid_c"], "first")):
    par(pid, "kbd", label, "enum", fn, "global", menu("MIDI menu" if pid in ("sys.midi_in_ch", "sys.midi_out_ch", "sys.in_ports", "sys.out_ports", "sys.knob_out", "sys.cc_format", "sys.send_clock") else "GLOBAL menu"),
        values=ev(vals), default=dflt)
par("sys.poly_number", "kbd", "POLY NUMBER", "integer", "Voice number in a poly chain of compatible Moog synths (0 = off).", "global", menu("MIDI menu 3.1"), range={"min": 0, "max": 16}, default=0)
par("sys.poly_max", "kbd", "POLY MAX", "integer", "Number of voices in the poly chain.", "global", menu("MIDI menu 3.2"), range={"min": 1, "max": 16}, default=3)
par("sys.tuning_scale", "kbd", "TUNING SCALE", "integer", "0 equal temperament, 1-31 custom scales (Phatty Tuner).", "global", menu("GLOBAL 1.1") + [{"type": "midi", "message": "RPN 0:3 then data entry"}],
    range={"min": 0, "max": 31}, default=0)
par("sys.variance", "kbd", "VARIANCE", "continuous", "Random per-note detune, opposite on each oscillator.", "global", menu("GLOBAL 1.2"), physical={"min": 0, "max": 40, "unit": "cents"})
par("sys.local", "kbd", "LOCAL CONTROL", "enum", "Disconnect all controls, keys, wheels or panel from the engine (MIDI still sent).", "global", menu("GLOBAL 1.5", 122), values=ev(["all", "keys", "wheels", "panel"]))
par("sys.cv_map_pitch", "kbd", "CV MAPPING PITCH", "enum", "Target of the PITCH CV input: pitch by default, or almost any parameter, SEQ MOD AMT, ratchet count or step 1 reset.", "global", menu("GLOBAL 2.1"),
    values=ev(["pitch", "any_parameter", "sqmodamt", "rtcht_ct", "st1_reset"]), default="pitch")
par("sys.cv_map_volume", "kbd", "CV MAPPING VOLUME", "enum", "Target of the VOL CV input.", "global", menu("GLOBAL 2.1"), values=ev(["volume", "any_parameter", "sqmodamt", "rtcht_ct", "st1_reset"]), default="volume")
par("sys.cv_map_gate", "kbd", "CV MAPPING GATE", "enum", "Target of the KB GATE input: gate, any on/off parameter, step advance or sustain pedal.", "global", menu("GLOBAL 2.1"),
    values=ev(["gate", "any_switch", "step_adv", "sust_ped"]), default="gate")

# ---------------------------------------------------------------- ports
jack("jack.audio_out", "AUDIO OUT", "out", "audio", "out.main", "Main mono output; muted by MUTE.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Mono signal on both sides.", "6.35 mm TRS", location="front")
jack("jack.ext_in", "EXT IN", "in", "audio", "fbext.ext", "Line-level external audio into the FDBK/EXT mixer channel (needs a gate or AMP LATCH ON to pass).", "6.35 mm TS")
jack("jack.pitch_cv", "PITCH CV", "in", "cv", "kbd.pitch_cv_in", "0 to +5 V, 1 V/oct (remappable); expression pedal or CV.", "6.35 mm TRS")
jack("jack.filter_cv", "FILTER CV", "in", "cv", "vcf.cutoff_cv", "0 to +5 V on cutoff; expression pedal or CV.", "6.35 mm TRS", combine="sum")
jack("jack.vol_cv", "VOL CV", "in", "cv", "vca.cv", "0 to +5 V on volume (remappable); expression pedal or CV.", "6.35 mm TRS")
jack("jack.kb_gate", "KB GATE", "in", "gate", "kbd.gate_in", "+5 V gate triggers the envelopes (remappable to a switch, step advance or sustain).", "6.35 mm TS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out (can echo DIN or USB input).", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI (no audio).", "USB type B")
jack("jack.power", "AC power", "in", "power", None, "IEC mains, 100-240 V AC, 13 W, with switch.", "IEC C14")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.seq_in", note="Arpeggio or sequence notes, transposed from the keyboard.")
con("kbd.pitch1", "osc1.pitch_cv")
con("kbd.pitch2", "osc2.pitch_cv", {"param": "osc2.kb_ctrl", "not_equals": "off"}, note="In duo mode Osc 2 takes the high or low note; with KB CTRL off it drones.")
con("kbd.pitch1", "sub.pitch_cv", note="One octave below Osc 1.")
con("kbd.pitch1", "vcf.cutoff_cv", amount="vcf.kb_track")
con("wheels.bend", "osc1.pitch_cv", anyof("wheels.bend_dest", "osc1", "both"))
con("wheels.bend", "osc2.pitch_cv", anyof("wheels.bend_dest", "osc2", "both"))
con("osc1.out", "osc2.sync_in", "sync", eq("osc2.hard_sync", True))
for n in (1, 2):
    m_, other = f"mod{n}", 2 if n == 1 else 1
    con(f"lfo{n}.out", f"{m_}.lfo")
    con("env_f.out", f"{m_}.pgm", eq(f"{m_}.pgm_src", "filter_eg"), note="F.EG/PGM position; other PGM SRC choices replace the filter EG.")
    con("arp.seq_mod", f"{m_}.pgm", eq(f"{m_}.pgm_src", "seq_mod"), note="Per-step mod values recorded from the mod wheel.")
    con("wheels.mod", f"{m_}.depth", amount=f"{m_}.mod_wheel_depth")
    con("kbd.velocity", f"{m_}.depth", amount=f"{m_}.velocity_depth")
    con("kbd.aftertouch", f"{m_}.depth", amount=f"{m_}.aftertouch_depth")
    con(f"{m_}.out", "osc1.pitch_cv", anyof(f"{m_}.pitch_osc", "both", "osc1"), amount=f"{m_}.pitch_amt")
    con(f"{m_}.out", "osc2.pitch_cv", anyof(f"{m_}.pitch_osc", "both", "osc2"), amount=f"{m_}.pitch_amt")
    con(f"{m_}.out", "vcf.cutoff_cv", amount=f"{m_}.filter_amt")
    con(f"{m_}.out", f"lfo{other}.rate_cv", eq(f"{m_}.dest", "lfo_rate"), amount=f"{m_}.mod_amt")
    con(f"{m_}.out", "vca.cv", eq(f"{m_}.dest", "vca_level"), amount=f"{m_}.mod_amt")
    con(f"{m_}.out", "osc1.wave_cv", anyof(f"{m_}.dest", "osc1_wave", "osc1_osc2_wave"), amount=f"{m_}.mod_amt")
    con(f"{m_}.out", "osc2.wave_cv", anyof(f"{m_}.dest", "osc2_wave", "osc1_osc2_wave"), amount=f"{m_}.mod_amt")
    con(f"{m_}.out", "noise.level_cv", eq(f"{m_}.dest", "noise_level"), amount=f"{m_}.mod_amt")
    for e in ("env_f", "env_a"):
        con(f"{m_}.out", f"{e}.time_cv", {"all": [eq(f"{m_}.dest", "eg_time_pgm"), eq(f"{m_}.pgm_dst", "eg_time")]}, amount=f"{m_}.mod_amt",
            note="Lengthens or shortens all envelope times without changing their shape.")
    con("kbd.gate", f"lfo{n}.reset", "gate", eq(f"lfo{n}.kb_reset", True))
for src in ("osc1", "sub", "osc2", "noise"):
    con(f"{src}.out", f"mixer.{src}", "audio", eq(f"mixer.{src}_on", True), amount=f"mixer.{src}")
con("mixer.out", "fbext.feedback", "audio", broken_by="jack.ext_in", note="Mixer feedback; replaced by EXT IN when a plug is inserted.")
con("fbext.out", "mixer.fbext", "audio", eq("mixer.fbext_on", True), amount="mixer.fbext")
con("mixer.out", "vcf.in", "audio")
con("env_f.out", "vcf.cutoff_cv", amount="vcf.eg_amt")
con("vcf.out", "drive.in", "audio")
con("drive.out", "vca.in", "audio", amount="drive.amount")
con("kbd.gate", "env_f.gate", "gate", {"param": "env_f.gate_src", "not_equals": "ext"})
con("kbd.gate", "env_a.gate", "gate", {"param": "env_a.gate_src", "not_equals": "ext"}, note="KB GATE input joins in unless gate source is NOTES.")
con("kbd.velocity", "env_f.velocity", amount="env_f.vel_amt")
con("kbd.velocity", "env_a.velocity", amount="env_a.vel_amt")
con("env_a.out", "vca.cv")
con("vca.out", "out.in", "audio", amount="out.preset_vol")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "lcd", "module": "kbd", "label": "LCD display", "kind": "display", "function": "Preset name, bank, number and category; menus; step edit status (play state, current and last step, page)."},
    {"id": "step_leds", "module": "arp", "label": "PRESET 1-16 (step view)", "kind": "led", "function": "In step edit: dim active steps, dark rests, bright current step; BANK pulses."},
    {"id": "button_leds", "module": "kbd", "label": "button LEDs", "kind": "led", "function": "State of every switch; KB OCTAVE dim for one octave, bright for two; RANGE, OSC and KB CTRL position LEDs."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["mixer", "vcf", "drive", "vca"],
     "rule": "Five mixer channels into the ladder filter (levels above 5 overdrive its input, per source), then MultiDrive, the VCA and the output. The fifth channel is mixer feedback until EXT IN is used."},
    {"id": "b02", "name": "Duo mode", "applies_to": ["kbd", "osc1", "osc2"],
     "rule": "With DUO MODE on, KB CTRL HI gives Osc 2 the highest note and Osc 1 the lowest; LO the reverse; OFF makes Osc 2 drone with FREQUENCY widened to ±3 octaves. Both share the filter and VCA."},
    {"id": "b03", "name": "Mod buses", "applies_to": ["mod1", "mod2", "lfo1", "lfo2"],
     "rule": "Each bus takes one source (five LFO waves, or F.EG/PGM) to pitch, filter and one switched destination at once, with separate bipolar amounts. Overall depth comes from mod wheel, velocity, "
             "aftertouch and CTRL4 amounts; MOD 1 follows the mod wheel by default. MOD 1's LFO RATE destination is LFO 2 and vice versa. Hold MOD DEST and touch a control to make it the PGM destination."},
    {"id": "b04", "name": "Envelopes", "applies_to": ["env_f", "env_a"],
     "rule": "DAHDSR with KNOB SHIFT for delay, hold, velocity and key tracking. Single trigger by default (no retrigger on legato); MULTI TRIG, RESET, SYNC to a clock division, LOOP (a multi-stage LFO) and LATCH ON. "
             "Amp delay only works with LOOP on."},
    {"id": "b05", "name": "Glide", "applies_to": ["kbd"], "rule": "LCR (time grows with interval), LCT (fixed time) or EXP; GATED glides only while keys are held; LEGATO only between overlapping notes; per-oscillator assignment."},
    {"id": "b06", "name": "Arpeggiator", "applies_to": ["arp"],
     "rule": "UP, DWN, ORDR or RND over -2 to +2 octaves; BACK/FORTH makes patterns bidirectional (END NOTES once or twice); INVERT plays each note in successive octaves; LATCH keeps it going; SYNC follows MIDI clock "
             "(no playback without clock unless tap tempo); swing and gate length in PRESET EDIT."},
    {"id": "b07", "name": "Step sequencer", "applies_to": ["arp"],
     "rule": "PATTERN to REC with the arp off: keys enter steps (up to 64), ON adds rests, LATCH ties; duo mode records two notes per step. PATTERN to SEQ and ON to play, transposed by the key pressed. "
             "Step edit (BANK + LATCH): per-step notes, rests, ties, skips, ratchets (1-8x shared count), first/last step, rotate, page through 4 x 16 steps. The mod wheel position is stored per step for SEQ MOD."},
    {"id": "b08", "name": "Preset and panel modes", "applies_to": ["kbd"],
     "rule": "PRESET plays stored values until a knob moves (pickup per POT MODE); PANEL plays the knobs live with non-knob settings in a buffer. COMPARE auditions the stored preset. Each preset stores its own sequence."},
    {"id": "b09", "name": "CV inputs", "applies_to": ["kbd", "vcf", "vca"],
     "rule": "PITCH CV (1 V/oct), FILTER CV and VOL CV take 0-5 V or expression pedals; KB GATE takes a +5 V gate. PITCH, VOL and GATE can be remapped in GLOBAL to other parameters, step advance, step 1 reset or sustain."},
    {"id": "b10", "name": "Warm-up and calibration", "applies_to": ["osc1", "osc2"],
     "rule": "Up to 60 s to stabilise from cold. Note calibration (MIDI notes 15-116), aftertouch and CV input calibration are in GLOBAL 3.1."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change"},
                 {"message": "control_change", "note": "panel controls, 7- or 14-bit (paired MSB/LSB CCs 1-31 + 33-63); see parameter access entries"},
                 {"message": "control_change", "cc": 0, "parameter": "bank select MSB (send 0)"}, {"message": "control_change", "cc": 32, "parameter": "bank select LSB: 0 banks 1-8, 1 banks 9-16"},
                 {"message": "control_change", "cc": 64, "parameter": "sustain"}, {"message": "control_change", "cc": 2, "parameter": "breath (CTRL4)"},
                 {"message": "nrpn", "note": "every panel parameter (MSB 3/4), for full control"}, {"message": "rpn", "number": 3, "parameter": "tuning scale select"},
                 {"message": "clock"}, {"message": "start"}, {"message": "stop"}, {"message": "song_position", "note": "followed when FOLLOW SPP is on"},
                 {"message": "sysex", "note": "edit buffer, sequence, current preset, all presets, bulk dump; MIDI Tuning Standard single-note and bulk"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "control_change"}, {"message": "nrpn"},
                  {"message": "program_change"}, {"message": "clock", "note": "per SEND CLOCK"}, {"message": "start"}, {"message": "stop"}, {"message": "sysex"}],
    "channel_note": "Separate in (1-16 or omni) and out channels; ports selectable DIN, USB or both; DIN and USB input can be echoed to the outputs.",
    "note": "Every knob and switch sends and receives MIDI. Moog's free editor/librarian is available on registration."}
D["specifications"] = {
    "type": "programmable paraphonic analogue synthesizer", "keys": "37 semi-weighted, velocity and aftertouch", "polyphony": "mono or duo",
    "sound_sources": "2 variable-waveshape oscillators, square sub, pink noise, external input / feedback", "oscillator_calibration": "22 Hz-6.8 kHz; guaranteed notes 18-116 at 8'",
    "filter": "20 Hz-20 kHz Moog ladder, 6/12/18/24 dB/oct, MultiDrive", "lfo_hz": [0.01, 1000], "envelopes": "2 x DAHDSR, 1 ms-10 s", "presets": "256 (16 banks x 16)",
    "sequencer_steps": 64, "arp_tempo_bpm": [2, 280], "transposition": "±2 octaves",
    "connections": {"audio": "1 x TS out, 1 x TRS headphones, 1 x TS external input", "cv_gate_in": ["pitch", "filter", "volume", "KB gate"], "midi": "DIN in and out, USB"},
    "power": "100-240 V AC, 50-60 Hz, 13 W", "dimensions_cm": {"h": 17, "w": 68, "d": 37.5}, "weight_kg": 10, "operating_temp_c": [10, 35],
}
D["omitted_from_source"] = ["the basics of sound chapter", "unpacking and warranty", "the full NRPN chart (only the arpeggiator, glide, oscillator, mixer, filter and filter EG entries were read)",
                            "clock division CC value ranges"]
D["not_in_source"] = ["output level and impedance", "SysEx data format", "CC numbers for many switches (NRPN only)", "envelope and LFO curves"]
D["source_inconsistencies"] = [
    "The LFO range is 0.1-100 Hz (x10 with HI RANGE) in the panel text, 0.01-1000 Hz in the specifications, and Low/Med/Hi ranges in the CC chart.",
    "The filter envelope's VEL AMT is said to use the DECAY knob, but the overview (and the amp envelope text) give it to the SUSTAIN knob.",
    "The CC chart calls the envelope sustain controls 'SUSTAIN TIME'; sustain is a level.",
    "The Programming section says the menus are on 'page 35 (MIDI) and page 43 (GLOBAL)'; the PRESET EDIT reference points to page 39 while its contents start on page 39-40.",
    "The specifications list 'Osc 2' as a mod destination without 'pitch'.",
    "Amp hold is described as between 'attack and sustain stages', filter hold as between attack and decay.",
]
D["modelling_gaps"] = [
    {"topic": "Programmable destinations", "detail": "About 80 PGM destinations are grouped into a short list; SEQ MOD DST and CV mapping accept almost any parameter."},
    {"topic": "Sequence data", "detail": "Up to 64 steps per preset (notes, velocity, rests, ties, skips, ratchets, mod values) are described, not modelled as parameters."},
    {"topic": "Poly chain", "detail": "Up to 16 units via POLY NUMBER/POLY MAX with compatible Moog synths; modelled as a global setting."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/moog-sub-37_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
