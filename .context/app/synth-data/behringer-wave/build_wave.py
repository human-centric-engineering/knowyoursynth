#!/usr/bin/env python3
"""Assemble the Behringer WAVE device file (schema 0.13.0).

8-voice, bi-timbral hybrid wavetable synth after the PPG Wave 2.2/2.3: per voice a main
and a sub digital wavetable oscillator (30 factory PPG wavetables of 64 waves, 64 user
wavetables, 32 user transients), into an analogue 24 dB low-pass (V2044A, SSM2044 clone)
and analogue VCA; three envelopes (EG 1 filter/waves ADSR, EG 2 loudness ADSR, EG 3 AD
with attenuation for pitch or waves); one LFO; two sounds per program (groups A and B)
in ten keyboard modes; polyphonic sequencer and two arpeggiators; 200 programs; eight
individual voice outputs, CV/gate in.

Sources: Behringer WAVE Quick Start Guide and User Manual (firmware 1.0.11, April 2025),
Long & McQuade specifications, and retailer/press coverage.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", ref=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref:
        p["manual_ref"] = ref
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


def knob(id, module, label, fn, ref, **kw):
    kw.setdefault("panel_scale", S10)
    kw.setdefault("note", "Stored as 00-63 (ANALOG menu); editable there by keypad or data control.")
    par(id, module, label, "continuous", fn, ref=ref, **kw)


def menu(id, module, label, fn, menu_name, code, vals=None, rng=None, memory="patch", **kw):
    acc = [{"type": "menu", "note": f"{menu_name} menu, {code}"}]
    if vals:
        par(id, module, f"{code}: {label}", "enum", fn, memory=memory, access=acc, values=[{"value": v} for v in vals], **kw)
    else:
        par(id, module, f"{code}: {label}", "integer", fn, memory=memory, access=acc, range=rng, **kw)


def jack(id, label, direction, signal, node, fn, connector, ref=None, **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    if ref:
        j["manual_ref"] = ref
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


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


D["device"] = {
    "id": "behringer-wave", "manufacturer": "Behringer", "model": "WAVE Legendary 8-Voice Multi-Timbral Hybrid Synthesizer",
    "category": "8-voice bi-timbral hybrid wavetable synthesizer, 49 keys with velocity and channel aftertouch",
    "based_on": "PPG Wave 2.2 / 2.3 (Wolfgang Palm, 1982-84); released 2024 after four years in development (announced as the 'BBG Wave').",
    "sources": [
        {"id": "qsg", "title": "Behringer WAVE Quick Start Guide (firmware 1.0.11, April 2025)", "kind": "quick_start_guide", "file": "Behringer_Wave.pdf", "pages": 92,
         "note": "Multilingual; English pages 16-21: controls (57 callouts), menu shortcuts for the Program, Sequencer, Digital and Tuning menus, getting started."},
        {"id": "manual", "title": "Behringer WAVE User Manual V1.0 (firmware 1.0.11, April 2025)", "kind": "user_manual", "file": "https://www.behringerwave.com/downloads/Manual_BE_0722-ABD_WAVE.pdf",
         "note": "Read via the community-hosted PDF (to page 29) and the ManualsLib HTML edition (later sections: rear panel, calibration, MIDI, SysEx, troubleshooting, glossary). CC and NRPN tables are images; only their text summaries were readable."},
        {"id": "manual_2022", "title": "Behringer WAVE User Manual (July 2022 edition, supplied)", "kind": "user_manual", "file": "Behringer_WAVE_Manual_July_2022.pdf", "pages": 52,
         "note": "MIDI CC table (page 34), NRPN table 0-46 (pages 35-36) and SysEx preset map as text."},
        {"id": "lm", "title": "Long & McQuade WAVE specifications", "kind": "other", "file": "https://www.long-mcquade.com/415649/Keyboards/Synthesizers-Drum-Machines/Behringer/Wave-Legendary-8-Voice-Multi-Timbral-Hybrid-Synthesizer.htm",
         "note": "Connector types: sync TRS, CV and gate 1/4\" TS, expression TRS (voltage on tip), sustain TS."},
        {"id": "press", "title": "Gearnews, Audiofanzine, MusicRadar, Synth Anatomy reviews; Music Store, B&H, Perfect Circuit specifications", "kind": "other",
         "file": "https://www.gearnews.com/behringer-wave-review-synthesizer/",
         "note": "49 keys with channel aftertouch; V2044A (SSM2044 clone) 24 dB filter; 30 factory wavetables of 64 waves; 64 user wavetables (23 filled); 32 transients; dimensions and weight."},
    ],
}
D["architecture"] = {
    "synthesis": "wavetable", "signal_path": "hybrid", "voices": 8,
    "polyphony_mode": "two sounds per program (groups A and B); ten keyboard modes: Poly 8, Quad (4 x A+B layered), Duo, Mono unison, Quad A/B split, mono/quad/poly split combinations, and A poly with B mono on CV/gate",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "200 programs (2 banks of 100), each with group A and B sounds and a sequence; 64 user wavetables and 32 transients loaded via SynthTribe.",
    "semi_modular": False, "panel_counts": {"keys": 49, "knobs": 24, "voice_outputs": 8},
    "summary": ("Per voice: a MAIN and a SUB digital oscillator reading the same wavetable (64 waves; WAVES OSC and WAVES SUB set positions; the last four waves of PPG tables are saw, pulse, "
                "square and triangle), or a transient (short sample, 128/2048/8192 samples). The sub can follow the main, use its own waves, be off, sync or ring-modulate the main, or become noise. "
                "The summed digital signal feeds an analogue 24 dB resonant low-pass (V2044A) and an analogue VCA. EG 1 (ADSR) sweeps the filter and the wavetable, EG 2 (ADSR) is loudness, "
                "EG 3 (attack/decay with attenuation) bends pitch or sweeps waves. One LFO (four shapes, 0.2-12 Hz, delay). Behaviour is set in PPG-style numeric menus (Digital, Tuning). "
                "Stereo BASIS spread, eight individual voice outputs, polyphonic sequencer, two arpeggiators."),
}

mod("kbd", "voice_allocator", "Keyboard, groups and keyboard modes", "GROUP / PROGRAM menu", "49 keys (velocity, channel aftertouch), octave -2..+1; groups A/B; ten keyboard modes and split point; CV/gate drive group B monophonically in mode 9.",
    ["kbd.midi_in", "kbd.cv_in", "kbd.gate_in", "kbd.sustain", "kbd.pedal_in", "kbd.seq_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend", "kbd.pedal"],
    scope="common", props={"keys": 49})
mod("osc_main", "oscillator", "Main oscillator", "MODIFIERS / DIGITAL", "Digital wavetable oscillator: position 00-63 in the selected wavetable (or transient start point); 8-bit (2.2) or enhanced (2.3) quality; keyboard, EG 1, EG 3, LFO, wheel, aftertouch and bend can move the position.",
    ["osc_main.pitch_cv", "osc_main.wave_cv", "osc_main.sync_in"], ["osc_main.out"], props={"factory_wavetables": 30, "user_wavetables": 64, "user_transients": 32, "waves_per_table": 64})
mod("osc_sub", "oscillator", "Sub oscillator", "MODIFIERS / DIGITAL", "Second digital oscillator on the same wavetable: follows the main waves, uses its own WAVES SUB position, swaps EG 1 for EG 3, off, sync source for the main, ring modulator, or noise.",
    ["osc_sub.pitch_cv", "osc_sub.wave_cv"], ["osc_sub.out"])
mod("dac", "summer", "Digital sum / DAC", "(internal)", "Main and sub summed digitally and converted to analogue, without level controls (apart from the noise mode).", ["dac.main", "dac.sub"], ["dac.out"])
mod("vcf", "filter", "VCF", "MODIFIERS", "Analogue 4-pole 24 dB/oct resonant low-pass (Cool Audio V2044A, SSM2044 clone).", ["vcf.in", "vcf.cutoff_cv", "vcf.res_cv"], ["vcf.out"], props={"slope_db_per_oct": 24, "chip": "V2044A"})
mod("vca", "vca", "VCA", "ENVELOPE GENERATOR 2", "Analogue VCA under EG 2; ENV 2 LOUDNESS sets the group's level.", ["vca.in", "vca.cv"], ["vca.out"])
mod("env1", "envelope", "EG 1 (filter / waves)", "ENVELOPE GENERATOR 1", "ADSR to filter cutoff (ENV 1 VCF) and wavetable position (ENV 1 WAVES); attack above 47 completes even if the key is released.", ["env1.gate"], ["env1.out"])
mod("env2", "envelope", "EG 2 (loudness)", "ENVELOPE GENERATOR 2", "ADSR on the VCA (same attack-completion behaviour above 47).", ["env2.gate"], ["env2.out"])
mod("env3", "envelope", "EG 3 (pitch / waves)", "ENVELOPE GENERATOR 3", "Attack/decay with attenuation: bipolar on pitch (5 = none), or 0-63 wave steps added to WAVES SUB.", ["env3.gate"], ["env3.out"])
mod("lfo", "lfo", "LFO", "LOW FREQUENCY OSCILLATOR", "Triangle, ramp, sawtooth or square, 0.2-12 Hz, with delay (up to 10 s); to waves, filter, loudness and pitch per the menus.", ["lfo.depth_cv"], ["lfo.out"],
    scope="common", props={"rate_hz": [0.2, 12]})
mod("seq", "sequencer", "Sequencer and arpeggiators", "SEQUENCER BUTTONS / Sequencer menu", "Polyphonic step sequencer (record, rest/tie, append, clear last, overdub, transpose) and two arpeggiators (up, down, up/down, random, moving); 40-240 BPM or MIDI/USB/analogue clock.",
    ["seq.sync_in"], ["seq.notes", "seq.sync_out"], scope="common", props={"tempo_bpm": [40, 240]})
mod("out", "output", "Outputs", "MASTER / rear panel", "BASIS spreads notes between channel 1 and 2 (alternating at maximum, mono at minimum); MASTER VOLUME; eight individual voice outputs also keep feeding the mains; headphones.",
    ["out.in"], ["out.ch1", "out.ch2", "out.voice", "out.phones"], scope="common")

# ---------------------------------------------------------------- panel
knob("out.basis", "out", "BASIS", "Stereo spread: minimum mono to both outputs, maximum alternates notes between outputs.", 1)
knob("out.volume", "out", "MASTER VOLUME", "Output level (MIDI CC 7).", 2, memory="none", access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 7"}])
knob("lfo.delay", "lfo", "LFO DELAY", "Delay before modulation, up to 10 s.", 3, physical={"min": 0, "max": 10, "unit": "s"})
par("lfo.wave", "lfo", "WAVESHAPE (LFO)", "enum", "LFO waveform.", control="rotary_switch", ref=4, values=[{"value": v} for v in ["triangle", "ramp", "sawtooth", "square"]])
knob("lfo.rate", "lfo", "RATE (LFO)", "0.2-12 Hz.", 5, physical={"min": 0.2, "max": 12, "unit": "Hz"})
for k, ref, fn in (("attack", 6, "Filter envelope attack (above 47 it completes regardless of key release)."), ("decay", 7, "Decay."), ("sustain", 8, "Sustain level."), ("release", 9, "Release.")):
    knob(f"env1.{k}", "env1", f"EG 1 {k.upper()}", fn, ref)
knob("vcf.cutoff", "vcf", "VCF CUTOFF", "Low-pass cutoff.", 10)
knob("vcf.emphasis", "vcf", "VCF EMPHASIS", "Resonance.", 11)
par("osc_main.waves", "osc_main", "WAVES OSC", "integer", "Main oscillator wave 00-63 in the wavetable (or transient start).", ref=12, range={"min": 0, "max": 63})
par("osc_sub.waves", "osc_sub", "WAVES SUB", "integer", "Sub oscillator wave 00-63 (or transient start).", ref=13, range={"min": 0, "max": 63})
knob("env3.attack", "env3", "EG 3 ATTACK", "Attack.", 14)
knob("env3.decay", "env3", "EG 3 DECAY", "Decay.", 15)
knob("env3.attenuation", "env3", "EG 3 ATTENUATION", "Pitch: 5 = none, below negative, above positive. Waves: 0 none to 10 = 63 steps.", 16)
for k, ref, fn in (("attack", 17, "Loudness attack (above 47 it completes)."), ("decay", 18, "Decay."), ("sustain", 19, "Sustain level."), ("release", 20, "Release.")):
    knob(f"env2.{k}", "env2", f"EG 2 {k.upper()}", fn, ref)
par("kbd.group", "kbd", "GROUP", "enum", "Which sound (A, B or both) the panel and menus edit.", control="push_button", ref=21, values=[{"value": v} for v in ["A", "B", "A_and_B"]])
knob("vcf.env1", "vcf", "ENV 1 VCF", "Filter envelope amount.", 22)
knob("vca.level", "vca", "ENV 2 LOUDNESS", "Group output level (balances A and B).", 23)
knob("osc_main.env1", "osc_main", "ENV 1 WAVES", "EG 1 sweep through the wavetable (or transient loop point).", 24)
for pid, lab, ref, fn in (("ui.data", "DATA CONTROL", 25, "Encoder: push and turn to enter values."), ("ui.keypad", "NUMERIC KEYPAD", 28, "Numbers and cursor."),
                          ("ui.program", "PROGRAM (twice: USER)", 29, "Program menu (default); twice for the User menu."), ("ui.digital", "DIGITAL", 30, "Digital menu."),
                          ("ui.tuning", "TUNING", 31, "Tuning menu."), ("ui.analog", "ANALOG", 32, "Analog menu (panel values)."), ("ui.shift", "SHIFT", 34, "Shifted sequencer functions."),
                          ("seq.rest_tie", "REST/TIE (SHIFT: SETTINGS)", 35, "Rest, tie; sequencer settings."), ("seq.record", "RECORD (SHIFT: APPEND)", 36, "Record; append to a step."),
                          ("seq.stop", "STOP (SHIFT: CLR LST)", 37, "Stop and reset; clear last step(s)."), ("seq.play", "PLAY/PAUSE (SHIFT: RESTART)", 38, "Play, pause, resume; restart.")):
    par(pid, "kbd" if pid.startswith("ui") else "seq", lab, "boolean", fn, memory="none", control="encoder" if pid == "ui.data" else "push_button", ref=ref)
par("kbd.bend_wheel", "kbd", "PITCH WHEEL", "continuous", "Assignable via BD; springs to centre.", memory="none", control="wheel", ref=39, panel_scale={"min": -1, "max": 1})
par("kbd.mod_wheel", "kbd", "MODULATION WHEEL", "continuous", "Modulation per MW/MF/ML/TM settings; position stored per preset and group.", control="wheel", ref=40, panel_scale=S10)
par("kbd.octave", "kbd", "OCTAVE DOWN/UP", "integer", "Keyboard transpose -2 to +1 octaves.", memory="none", control="push_button", ref=41, range={"min": -2, "max": 1})
par("sys.power", "out", "POWER SWITCH", "boolean", "Power.", memory="none", ref=42, access=[{"type": "rear_panel", "control": "toggle_switch"}])
# Program / User menu
menu("prog.bank", "kbd", "Bank", "Bank 0 or 1.", "Program", "BANK", rng={"min": 0, "max": 1}, memory="none")
menu("prog.number", "kbd", "Program", "Program 00-99.", "Program", "PROG", rng={"min": 0, "max": 99}, memory="none")
menu("prog.wavetable", "osc_main", "Wavetable", "Wavetable 00-127 (factory, user, transients).", "Program", "WAVE", rng={"min": 0, "max": 127})
menu("prog.split", "kbd", "Split point", "Keyboard split point.", "Program", "SPLT", rng={"min": 0, "max": 127})
menu("prog.keyb", "kbd", "Keyboard mode", "Voice and group allocation.", "Program", "KEYB",
     ["0_poly8", "1_quad_AB", "2_duo", "3_mono_unison", "4_quad_split_AB", "5_A_mono_B_quad", "6_A_mono_B_poly", "7_A_poly_B_mono", "8_A_mono_B_mono", "9_A_poly_B_mono_cv_in"])
menu("prog.dtf", "kbd", "Data transfer function", "Copy edit buffers, initialise (keeps user wavetables) or store (9).", "Program", "DTF", [f"{i}" for i in range(10)], memory="none")
menu("sys.midi", "kbd", "MIDI channel", "00 (off) to 16.", "Program", "MIDI", rng={"min": 0, "max": 16}, memory="global")
menu("sys.tune", "kbd", "Tuning", "A = 400-499 Hz (default 440).", "Program", "TUNE", rng={"min": 400, "max": 499}, memory="global")
menu("sys.sysex", "kbd", "SysEx dump", "Send edit buffer, program, bank or sequencer data.", "Program", "SYSEX", [f"{i}" for i in range(7)], memory="none")
menu("sys.exp_ped", "kbd", "Expression pedal", "Pedal destination.", "User", "EXP-PED", ["disabled", "loudness", "filter_frequency", "filter_emphasis", "wave", "modulation"], memory="global")
menu("sys.local", "kbd", "Local control", "0 off, 1 on.", "Program", "LOC", ["off", "on"], memory="global")
menu("sys.touch", "kbd", "Channel aftertouch", "Disabled, transmit, receive, both.", "User", "TOUCH", ["disabled", "tx", "rx", "tx_rx"], memory="global")
menu("sys.par_com", "kbd", "MIDI CC parameters", "Disabled, transmit, receive, both.", "User", "PAR-COM", ["disabled", "tx", "rx", "tx_rx"], memory="global")
menu("sys.firm", "env1", "Firmware emulation", "Original, or enhanced with linear or exponential envelopes.", "User", "FIRM", ["original", "linear_envelopes", "exponential_envelopes"], memory="global")
menu("sys.osc", "osc_main", "Oscillator quality", "Original or enhanced.", "User", "OSC", ["original", "enhanced"], memory="global")
menu("sys.lfo", "lfo", "LFO precision", "Original or improved.", "User", "LFO", ["original", "improved"], memory="global")
menu("sys.brt", "kbd", "LCD brightness", "00-99.", "User", "BRT", rng={"min": 0, "max": 99}, memory="global")
# Digital menu
menu("dig.uw", "osc_main", "Upper wavetable", "Wavetable: wrap, best-of tables 1-30, no wrap. Transient: 128, 2048 or 8192 samples.", "Digital", "UW", ["0", "1", "2"])
menu("dig.sw", "osc_sub", "Sub-oscillator wave", "Sub role.", "Digital", "SW", ["0_main_waves", "1_own_waves", "2_swap_env1_env3", "3_off", "4_sync_main", "5_ring_mod", "6_noise"])
menu("dig.kw", "osc_main", "Keyboard control of wavetable", "Off; higher notes take higher waves; own wave per note (with skips).", "Digital", "KW", rng={"min": 0, "max": 7})
menu("dig.kf", "vcf", "Keyboard filter tracking", "0 none, 3 about 100%, 7 about 200%.", "Digital", "KF", rng={"min": 0, "max": 7})
menu("dig.kl", "vca", "Keyboard loudness tracking", "0-3 higher louder, 4 equal, 5-7 lower louder.", "Digital", "KL", rng={"min": 0, "max": 7})
menu("dig.mw", "osc_main", "Wavetable modulation", "Off; LFO via wheel; wheel sweeps waves; LFO sweeps waves (3-9).", "Digital", "MW", rng={"min": 0, "max": 9})
menu("dig.mf", "vcf", "Filter modulation", "Off; LFO via wheel; wheel to frequency; wheel to emphasis; LFO depths (4-9).", "Digital", "MF", rng={"min": 0, "max": 9})
menu("dig.ml", "vca", "Loudness modulation", "LFO tremolo off/on.", "Digital", "ML", ["off", "on"])
menu("dig.bd", "kbd", "Pitch bend destination", "Off, oscillators, filter, wavetable, sub only, and combinations.", "Digital", "BD", rng={"min": 0, "max": 7})
menu("dig.bi", "kbd", "Pitch bend range", "2 semitones, major third, fifth, octave, two octaves, octave stepped.", "Digital", "BI", ["2_semitones", "major_third", "fifth", "octave", "two_octaves", "octave_stepped"])
menu("tun.mo", "osc_main", "Main oscillator pitch modulation", "LFO vibrato on the main oscillator (via the mod wheel) off/on.", "Tuning", "MO", ["off", "on"])
menu("dig.tw", "osc_main", "Aftertouch to waves", "Off, wavetable sweep, LFO waveform modulation.", "Digital", "TW", ["off", "sweep", "lfo_mod"])
menu("dig.tf", "vcf", "Aftertouch to filter", "Off, frequency, LFO modulation of frequency.", "Digital", "TF", ["off", "frequency", "lfo_mod"])
menu("dig.tl", "vca", "Aftertouch to loudness", "Off, loudness, LFO modulation of loudness.", "Digital", "TL", ["off", "loudness", "lfo_mod"])
menu("dig.tm", "kbd", "Aftertouch as mod wheel", "Off/on.", "Digital", "TM", ["off", "on"])
menu("dig.vf", "vcf", "Velocity to filter", "Off, low, medium, high.", "Digital", "VF", ["off", "low", "medium", "high"])
menu("dig.vl", "vca", "Velocity to loudness", "Off, low, medium, high.", "Digital", "VL", ["off", "low", "medium", "high"])
# Tuning menu
menu("tun.detu", "osc_sub", "Sub detune", "0 none, 1-4 slight to strong, 5 +5 semitones, 6 +1 octave, 7 +2 octaves, 8 -1 octave, 9 -2 octaves.", "Tuning", "DETU", rng={"min": 0, "max": 9})
menu("tun.ms", "osc_sub", "Sub pitch modulation", "LFO vibrato on the sub off/on.", "Tuning", "MS", ["off", "on"])
menu("tun.eo", "osc_main", "EG 3 to main pitch", "0 off, 1 on, 2-9 polyphonic portamento with increasing glide time.", "Tuning", "EO", rng={"min": 0, "max": 9})
menu("tun.es", "osc_sub", "EG 3 to sub pitch", "Off/on.", "Tuning", "ES", ["off", "on"])
menu("tun.semit", "osc_main", "Voice semitone detune", "Upward semitone offset per voice (eight values): 0-63 entered manually, or 0-48 from the keyboard; used e.g. to put group B an octave or two above A.", "Tuning", "SEMIT", rng={"min": 0, "max": 63})
# Sequencer menu
menu("seq.clk", "seq", "Clock source and rate", "Internal, DIN, USB or analogue; 1 pulse per step, 2, 24 or 48 ppqn.", "Sequencer", "CLK", rng={"min": 0, "max": 33}, memory="global")
menu("seq.gat", "seq", "Gate duration", "1-99.", "Sequencer", "GAT", rng={"min": 1, "max": 99})
menu("seq.div", "seq", "Clock division", "1/4, 1/8, 1/16, 1/32, triplets.", "Sequencer", "DIV", ["1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T", "1/16T"])
menu("seq.bpm", "seq", "Tempo", "40-240 BPM.", "Sequencer", "BPM", rng={"min": 40, "max": 240})
menu("seq.mtn", "seq", "Metronome", "Off/on.", "Sequencer", "MTN", ["off", "on"], memory="global")
menu("seq.ovp", "seq", "Overdub / transposition", "Overdub on/off; transpose sequence or keyboard independent.", "Sequencer", "OVP", rng={"min": 0, "max": 11})
menu("seq.mod", "seq", "Mode", "Sequencer, arpeggiator 1 or 2; up, down, up/down, random, moving.", "Sequencer", "MOD", rng={"min": 0, "max": 25})

# ---------------------------------------------------------------- ports
jack("jack.ch1", "CHANNEL 1 OUTPUT", "out", "audio", "out.ch1", "Left (or mono with BASIS at minimum).", "6.35 mm TS", 48)
jack("jack.ch2", "CHANNEL 2 OUTPUT", "out", "audio", "out.ch2", "Right; duplicates channel 1 in mono.", "6.35 mm TS", 49)
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Stereo headphones.", "6.35 mm TRS", 50)
jack("jack.voice_outs", "CHANNEL OUTPUTS 1-8", "out", "audio", "out.voice", "Individual voice outputs (voices still feed the mains).", "6.35 mm TS", 51, note="Eight jacks, modelled as one port.")
jack("jack.sync_in", "SYNC IN", "in", "clock", "seq.sync_in", "Clock (tip) and start/stop (ring) for sequencer/arpeggiator.", "6.35 mm TRS", 52)
jack("jack.sync_out", "SYNC OUT", "out", "clock", "seq.sync_out", "Clock (tip) and start/stop (ring).", "6.35 mm TRS", 53)
jack("jack.cv_in", "CV IN", "in", "cv", "kbd.cv_in", "1 V/oct, -5 to +5 V; plays group B monophonically in keyboard mode 9 (calibratable).", "6.35 mm TS", 54)
jack("jack.gate_in", "GATE IN", "in", "gate", "kbd.gate_in", "Gate for the envelopes in keyboard mode 9.", "6.35 mm TS", 55)
jack("jack.exp", "EXPRESSION PEDAL", "in", "cv", "kbd.pedal_in", "Expression pedal (e.g. FC600), voltage on tip; per EXP-PED.", "6.35 mm TRS", 56)
jack("jack.sustain", "SUSTAIN PEDAL", "in", "gate", "kbd.sustain", "Holds notes at EG 2 sustain.", "6.35 mm TS", 57)
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN", 45)
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN", 46)
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN", 47)
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant MIDI; firmware, wavetables and transients via SynthTribe.", "USB type B", 44)
jack("jack.power", "IEC POWER", "in", "power", None, "100-240 V AC.", "IEC C14", 43)

# ---------------------------------------------------------------- connections
con("seq.notes", "kbd.seq_in", "cv")
for o in ("osc_main", "osc_sub"):
    con("kbd.pitch", f"{o}.pitch_cv", "cv")
con("kbd.bend", "osc_main.pitch_cv", "cv", anyof("dig.bd", 1, 5, 6), note="Per BD.")
con("lfo.out", "osc_main.pitch_cv", "cv", eq("tun.mo", "on"))
con("lfo.out", "osc_sub.pitch_cv", "cv", eq("tun.ms", "on"))
con("env3.out", "osc_main.pitch_cv", "cv", {"param": "tun.eo", "not_equals": 0}, amount="env3.attenuation")
con("env3.out", "osc_sub.pitch_cv", "cv", eq("tun.es", "on"), amount="env3.attenuation")
con("env1.out", "osc_main.wave_cv", "cv", amount="osc_main.env1")
con("env3.out", "osc_sub.wave_cv", "cv", amount="env3.attenuation", note="EG 3 adds 0-63 wave steps to WAVES SUB.")
con("lfo.out", "osc_main.wave_cv", "cv", {"param": "dig.mw", "not_equals": 0}, note="Per MW (wheel- or LFO-swept).")
con("kbd.pitch", "osc_main.wave_cv", "cv", {"param": "dig.kw", "not_equals": 0}, note="Keyboard wavetable control.")
con("kbd.aftertouch", "osc_main.wave_cv", "cv", eq("dig.tw", "sweep"))
con("osc_sub.out", "osc_main.sync_in", "sync", eq("dig.sw", "4_sync_main"))
con("osc_main.out", "dac.main")
con("osc_sub.out", "dac.sub", {"param": "dig.sw", "not_equals": "3_off"}, note="Ring mod and noise modes also arrive here.")
con("dac.out", "vcf.in")
con("env1.out", "vcf.cutoff_cv", "cv", amount="vcf.env1")
con("kbd.pitch", "vcf.cutoff_cv", "cv", {"param": "dig.kf", "not_equals": 0})
con("lfo.out", "vcf.cutoff_cv", "cv", {"param": "dig.mf", "not_equals": 0})
con("kbd.aftertouch", "vcf.cutoff_cv", "cv", eq("dig.tf", "frequency"))
con("kbd.velocity", "vcf.cutoff_cv", "cv", {"param": "dig.vf", "not_equals": "off"})
con("kbd.modwheel", "vcf.res_cv", "cv", eq("dig.mf", 3))
con("vcf.out", "vca.in")
con("env2.out", "vca.cv", "cv", amount="vca.level")
con("lfo.out", "vca.cv", "cv", eq("dig.ml", "on"))
con("kbd.velocity", "vca.cv", "cv", {"param": "dig.vl", "not_equals": "off"})
con("kbd.modwheel", "lfo.depth_cv", "cv", eq("dig.mw", 1))
con("kbd.pedal", "vca.cv", "cv", eq("sys.exp_ped", "loudness"))
for e in ("env1", "env2", "env3"):
    con("kbd.gate", f"{e}.gate", "gate")
con("vca.out", "out.in", note="Eight voices, spread by BASIS; each also to its own output.")

CC_MAP = {"kbd.mod_wheel": 1, "out.basis": 8, "lfo.delay": 12, "lfo.wave": 13, "lfo.rate": 14, "env3.attack": 15, "env3.decay": 16, "env3.attenuation": 17,
          "env1.attack": 18, "env1.decay": 19, "env1.sustain": 20, "env1.release": 21, "env2.attack": 22, "env2.decay": 23, "env2.sustain": 24, "env2.release": 25,
          "osc_main.waves": 26, "osc_sub.waves": 27, "vcf.env1": 28, "vca.level": 29, "osc_main.env1": 30, "kbd.group": 31, "vcf.emphasis": 71, "vcf.cutoff": 74, "sys.local": 122}
NRPN_MAP = {"prog.wavetable": 0, "prog.split": 1, "prog.keyb": 2, "prog.dtf": 3, "sys.tune": 4, "sys.exp_ped": 5, "sys.touch": 6, "sys.brt": 7, "sys.firm": 9, "sys.osc": 10, "sys.lfo": 11,
            "dig.uw": 12, "dig.sw": 13, "dig.kw": 14, "dig.kf": 15, "dig.kl": 16, "dig.mw": 17, "dig.mf": 18, "dig.ml": 19, "dig.bd": 20, "dig.bi": 21, "dig.tw": 22, "dig.tf": 23,
            "dig.tl": 24, "dig.tm": 25, "dig.vf": 26, "dig.vl": 27, "tun.detu": 28, "tun.mo": 29, "tun.ms": 30, "tun.eo": 31, "tun.es": 32, "tun.semit": "33-40 (voices 1-8)",
            "seq.mod": 42, "seq.clk": 43, "seq.gat": 44, "seq.div": 45, "seq.bpm": 46}
for p in P:
    if p["id"] in CC_MAP:
        p["access"].append({"type": "midi", "message": f"CC {CC_MAP[p['id']]}", "note": "when PAR-COM = 1 (tx), 2 (rx) or 3"})
    if p["id"] in NRPN_MAP:
        p["access"].append({"type": "midi", "message": f"NRPN 0:{NRPN_MAP[p['id']]}", "note": "Bn 63 00, Bn 62 ParNum, Bn 06 Value"})
par("seq.state", "seq", "Sequencer state", "enum", "Stop, play, record, overdub.", memory="none", access=[{"type": "midi", "message": "NRPN 0:41"}],
    values=[{"value": v} for v in ["stop", "play", "rec", "overdub"]])
par("sys.cnt", "kbd", "CNT: LCD contrast", "integer", "00-99.", memory="global", access=[{"type": "menu", "note": "User menu, CNT"}, {"type": "midi", "message": "NRPN 0:8"}], range={"min": 0, "max": 99})

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "lcd", "module": "kbd", "label": "LCD DISPLAY", "kind": "display", "function": "2 x 40 characters: program, menus and values."},
    {"id": "oled", "module": "out", "label": "OLED DISPLAY", "kind": "display", "function": "Oscilloscope of the output; calibration; wavetable/transient names; SynthTribe transfer confirmation."},
    {"id": "group_leds", "module": "kbd", "label": "GROUP LEDs", "kind": "led", "function": "Group A, B or both."},
    {"id": "octave_leds", "module": "kbd", "label": "octave LEDs", "kind": "led", "function": "Octave transpose."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc_main", "osc_sub", "dac", "vcf", "vca"],
     "rule": "Per voice: main and sub wavetable oscillators summed digitally, converted to analogue, into the V2044A 24 dB low-pass and analogue VCA; eight voices spread by BASIS and available at individual outputs."},
    {"id": "b02", "name": "Wavetables and transients", "applies_to": ["osc_main", "osc_sub"],
     "rule": "Each wavetable has 64 waves (PPG tables end with saw, pulse, square, triangle); WAVES OSC/SUB pick positions and EG 1, EG 3, keyboard, LFO, wheel, aftertouch, bend or pedal move them. With a transient, WAVES set start points and ENV 1 WAVES the loop point; UW sets 128, 2048 or 8192 samples."},
    {"id": "b03", "name": "Sub oscillator roles", "applies_to": ["osc_sub"], "rule": "SW: follow the main's waves, own waves, swap EG 1 for EG 3, off, sync source for the main, ring modulator, or noise generator."},
    {"id": "b04", "name": "Groups and keyboard modes", "applies_to": ["kbd"],
     "rule": "Every program holds sounds A and B. KEYB 0 plays one group with 8 voices; 1 layers A and B with 4 voices; 2 duo; 3 mono unison; 4 splits A (right) and B (left) at SPLT; 5-8 mix mono/quad/poly per side; 9 plays A polyphonically and B monophonically from CV/gate. GROUP chooses what the panel edits (both when both LEDs are lit)."},
    {"id": "b05", "name": "Envelopes", "applies_to": ["env1", "env2", "env3"],
     "rule": "EG 1 and EG 2 are ADSR; attack above 47 completes even after key release (for sweeps). EG 3 is attack/decay with attenuation (bipolar for pitch). FIRM chooses original or enhanced linear/exponential envelopes."},
    {"id": "b06", "name": "Sequencer and arpeggiators", "applies_to": ["seq"],
     "rule": "Polyphonic step recording with rest/tie, append, clear last, overdub and transpose; arpeggiator 1 or 2 with up, down, up/down, random, moving; clock internal 40-240 BPM, DIN, USB or analogue (1 per step to 48 ppqn); saved with the program."},
]
D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure", "note": "per TOUCH"}, {"message": "program_change"},
                          {"message": "control_change", "cc": 0, "parameter": "bank select MSB"}, {"message": "control_change", "cc": 32, "parameter": "bank select LSB: bank 0 or 1"},
                          {"message": "control_change", "cc": 1, "parameter": "mod wheel"}, {"message": "control_change", "cc": 7, "parameter": "master volume"},
                          {"message": "control_change", "cc": 8, "parameter": "BASIS (balance)"}, {"message": "control_change", "cc": 11, "parameter": "expression pedal"},
                          {"message": "control_change", "note": "panel: 12-14 LFO, 15-17 EG 3, 18-21 EG 1, 22-25 EG 2, 26/27 waves osc/sub, 28 ENV 1 VCF, 29 ENV 2 loudness, 30 ENV 1 waves, 31 group, 71 emphasis, 74 cutoff (per PAR-COM)"},
                          {"message": "control_change", "cc": 64, "parameter": "sustain"}, {"message": "control_change", "cc": 122, "parameter": "local control"},
                          {"message": "control_change", "note": "120 all sound off, 121 reset controllers, 123 all notes off"},
                          {"message": "nrpn", "note": "MSB 0, LSB 0-46: program, user, digital and tuning menu parameters, per-voice SEMIT (33-40), arp/seq state, mode, clock, gate, division, BPM"},
                          {"message": "clock"}, {"message": "start"}, {"message": "stop"},
                          {"message": "sysex", "header": "F0 00 20 32 00 01 39 00", "note": "preset (121 values), edit buffer, sequencer (578 values), global (20 values) dumps; calibration; user wavetable/transient transfer (16-byte name + 128 x 16-bit PCM, 7-bit packed to 309 bytes); slot name list"}],
             "transmits": [{"message": "note_on", "note": "including arpeggiator/sequencer notes"}, {"message": "note_off"}, {"message": "channel_pressure"}, {"message": "control_change", "note": "per PAR-COM"},
                           {"message": "nrpn"}, {"message": "sysex"}],
             "channel_note": "Channel 1-16 (MIDI mode 3) or 0 (off).",
             "note": "From the manual's MIDI CC and NRPN tables (pages 34-36). Panel controls use CCs; menu parameters use NRPNs."}
D["specifications"] = {
    "voices": 8, "timbres": 2, "oscillators": "2 digital wavetable oscillators per voice", "wavetables": "30 factory (64 waves each), 64 user (23 preloaded), 32 user transients",
    "filter": "analogue 24 dB/oct resonant low-pass (V2044A)", "envelopes": "3 per voice", "lfo_hz": [0.2, 12], "keyboard": "49 keys, velocity, channel aftertouch", "programs": 200,
    "displays": {"lcd": "2 x 40 characters", "oled": "oscilloscope"}, "outputs": "channel 1/2, 8 voice outputs, phones", "power": "100-240 V AC, internal", "dimensions_mm": {"w": 796, "d": 257, "h": 112},
    "weight_kg": 7.26, "firmware": "1.0.11 (April 2025)",
    "wavetable_slots": {"0-29": "factory PPG wavetables", "30": "upper wavetable", "31": "preset transient", "32-63": "user transients (32-48 preloaded)", "64-127": "user wavetables (64-86 preloaded)"},
    "factory_wavetables": ["Harmonic Bliss", "Harmonic Bliss2", "Bells", "WindSweep ResoFlute", "Churchy", "Harmonic MixBlend", "WoodwindSweep ResoVibe", "SylvanSweep ResoWind", "PercuStrings", "VoxEnsemble",
                           "Reso", "Chiaroscuro", "SweepingHigh", "HarmonicStrike", "OrganicRegisters", "HarmonicSaw Accordionizer", "SweepFrenzy", "Spectrum Shift", "Harmonic Sweep Oscillation", "ElectricP",
                           "Robotic", "StrongHrm", "EchoScape Spectrum", "HighHarmonic Emphasis", "Organic Ascend Sweep", "EchoColor Spectrum Shift", "BrassForm SawVariants", "VoxForm", "PhaseString Ensemble",
                           "PulseShift Modulation"],
    "preloaded_user_wavetables": ["Pipes Xfade", "PD_Saw PWM", "DX_Tubular", "DX_E.Guitar", "DX_FullTine", "Vibe-rant", "DX_Bass", "StratoSweep", "FormantPad", "FairVox", "SpaceSweep", "SoundTrack",
                                  "PWMstringer", "Hoover", "PD_Saw", "PD_SQU", "PD_TPL", "PD_DBL", "PD_SPL", "PD_RES", "Wurli Wave", "Rhodos", "Vorcode"],
    "preset_transients": ["PanFlute", "Pizzi", "Steel Guitar", "Elec. Cello", "Xylophon", "Harp", "Pizzagogo", "Soft Bell EP", "Medium EP", "Trumpet", "Mute Trumpet", "Duuhh", "Pipe Brass", "Hammer Harp",
                          "Cath. Choir", "ChoirVerse", "Breathy Vox"],
    "wavetable_format": "64 waves x 128 samples; imported as 8- or 16-bit via SynthTribe",
    "sequencer": "64 steps, up to 8 notes per step, per program",
    "calibration": ["VCA/VCF (hold ANALOG + GROUP at power-up, about 200 s)", "CV input", "mod wheel", "pitch wheel"],
}
D["omitted_from_source"] = ["non-English translations", "safety and hook-up pages"]
D["not_in_source"] = ["envelope time ranges"]
D["source_inconsistencies"] = [
    "The BD (pitch bend destination) list repeats options 6 and 7 with meanings ('one octave detune', 'two octave detune') that belong with the detune settings.",
    "Keyboard modes 7 and 9 are both 'A poly, B mono' (9 adds CV in).",
    "TUNE is given as 'A 400 - A499'.",
    "The DIV list includes '1/18 note triplet', presumably 1/8.",
    "Retailers give 8- and 16-bit resolution; Gearspace and MusicRadar say 8- and 12-bit (Wave 2.2 and 2.3 modes).",
    "The cover calls it 'Multi-Timbral'; it is bi-timbral (groups A and B).",
    "The full manual's BD list is correct (0-7); the repeated 6/7 detune entries are a quick start guide error.",
    "Transient slots: the panel text says 'transient (31-63)'; the program menu says 31 is a preset transient and 32-63 are user transients. The preloaded wavetables are said to be in 'slots 64-83' but the list runs to 86.",
    "The ManualsLib edition says the transient loop size is fixed at 128 samples; firmware 1.0.11 adds 128, 2048 and 8192.",
    "Troubleshooting says 'make sure ENV1->Loudness is not zero' (it is ENV 2) and refers to MO/SO/EO/ES 'in the Digital menu' (they are in Tuning, and SO is MS); it also calls master volume control (1) rather than (2).",
    "The filter modulation list gives aftertouch as 'Option TL' (filter aftertouch is TF).",
    "The glossary describes '64 128 bit waveshapes' (128-sample waves).",
    "The NRPN notes say 'ParNum = 0 - 37' but the table runs to 46 (SEMIT V1-V8 33-40, then arp/seq 41-46).",
    "The MIDI tables call MW, MF and ML 'Mod Wheel ->' modulation; the menu text defines M as LFO modulation (with the wheel as one option). ES is labelled 'Env3 -> Main Sub Pitch'.",
    "The DIV range in the sequencer is labelled 'Sequencer Time' and BPM 'Speed (MSB/LSB)', though its 40-240 range exceeds a single 7-bit value.",
    "SynthTribe offers 8- or 16-bit import, matching retailers' '8- and 16-bit'; the '12-bit' figure appears only in press coverage.",
]
D["modelling_gaps"] = [
    {"topic": "Groups", "detail": "Panel and menu parameters apply to the selected group (A, B or both); modelled once with group selection as a parameter."},
    {"topic": "Menu-driven routings", "detail": "PPG-style numeric menus set many routings; connections show their main effects."},
    {"topic": "MIDI tables", "detail": "CC and NRPN numbers come from the July 2022 manual; later firmware (1.0.11) may add parameters not in these tables (e.g. FIRM option 2)."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/behringer-wave_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
