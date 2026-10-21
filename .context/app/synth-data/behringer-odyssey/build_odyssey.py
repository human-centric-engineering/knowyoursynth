#!/usr/bin/env python3
"""Assemble the Behringer Odyssey device file.

A recreation of the ARP Odyssey: duophonic two-VCO voice with a selectable three-mode
filter (ARP 4023, 4035, 4075), ADSR and AR envelopes, sample and hold with its own mixer,
ring modulator, and the Odyssey's fader-and-switch modulation routing. Behringer adds
a 32-step sequencer and arpeggiator, Klark Teknik effects, drive, MIDI and CV/gate.

Routing on the Odyssey is internal and switch-selected, so most connections here are
switched rather than patched. Source is the quick start guide.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.10.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="fader", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def fader(id, module, label, fn, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, "fader", **kw)


def switch(id, module, label, fn, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control, values=[v if isinstance(v, dict) else {"value": v} for v in vals], **kw)


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
    "id": "behringer-odyssey", "manufacturer": "Behringer", "model": "ODYSSEY",
    "category": "duophonic analogue synthesizer, 37 keys, with sequencer, arpeggiator and effects",
    "based_on": "ARP Odyssey (1972-81), including its three filter revisions (4023, 4035, 4075).",
    "sources": [{"id": "qsg", "title": "Behringer ODYSSEY Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_Odyssey.pdf", "pages": 57,
                 "note": "Multilingual; English controls (68 callouts), getting started, sequencer, parameter set, SysEx, MIDI, effects and specifications used."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "signal_path_note": "analogue voice; digital Klark Teknik effects", "voices": 1,
    "polyphony_mode": "duophonic: VCO-1 plays the lowest held note, VCO-2 the highest", "poly_chain_max_units": None,
    "patch_memory": False, "patch_memory_note": "No sound memory; 64 sequencer patterns (8 banks of 8), up to 32 steps each.", "semi_modular": False,
    "panel_counts": {"keys": 37, "fx_programs": 32},
    "summary": ("Two VCOs (sawtooth and pulse) with sync, a ring modulator, white or pink noise, and a sample and hold fed by its own two-channel "
                "mixer. A low-pass filter switchable between the ARP 4023 (2-pole), 4035 and 4075 (4-pole), a high-pass filter and drive, an "
                "ADSR and an AR envelope, and a VCA. Modulation is set by paired faders and source switches throughout, ARP style. Adds proportional "
                "pitch pads, a 32-step sequencer with 64 patterns, an eight-mode arpeggiator, 32 Klark Teknik effects, MIDI, USB and CV/gate/trigger."),
}

# ---------------- modules ----------------
mod("kbd", "voice_allocator", "Keyboard", "KEYBOARD / CONTROLLER", "37 semi-weighted keys with velocity; duophonic: low note to VCO-1, high note to VCO-2. Transpose ±2 octaves, portamento.",
    ["kbd.cv_in", "kbd.gate_in", "kbd.trig_in", "kbd.seq_in", "kbd.porta_fs"], ["kbd.cv_low", "kbd.cv_high", "kbd.gate", "kbd.trig"],
    {"keys": 37, "note_priority": {"vco1": "lowest", "vco2": "highest"}})
mod("ppc", "manual_controller", "Proportional pitch control", "CONTROLLER", "Three pressure-sensitive pads: pitch down, pitch up, and LFO modulation; harder pressure, more effect.",
    [], ["ppc.bend", "ppc.vibrato"])
mod("seq", "sequencer", "Sequencer and arpeggiator", "SEQUENCER", "32-step sequencer (64 patterns in 8 banks) with keyboard and step modes, ratchet, accent, swing and gate length; eight-mode arpeggiator.",
    [], ["seq.notes"], {"steps": 32, "patterns": 64, "banks": 8})
mod("midi", "midi_to_cv", "MIDI", "(rear panel)", "MIDI and USB MIDI notes, pitch bend and clock.", [], ["midi.notes"])
mod("lfo", "lfo", "LFO", "LFO AND S/H", "Sine and square outputs; also clocks the S/H and the LFO repeat.", [], ["lfo.sine", "lfo.square"])
mod("vco1", "oscillator", "VCO-1", "VCO-1", "Sawtooth and pulse; coarse and fine frequency; can drop to a low, keyboard-independent frequency (LF KYBD OFF).",
    ["vco1.pitch_cv", "vco1.fm", "vco1.pwm"], ["vco1.saw", "vco1.pulse"])
mod("vco2", "oscillator", "VCO-2", "VCO-2", "Sawtooth and pulse; coarse and fine frequency; hard sync to VCO-1.", ["vco2.pitch_cv", "vco2.fm", "vco2.pwm", "vco2.sync_in"], ["vco2.saw", "vco2.pulse"])
mod("noise", "noise", "Noise generator", "LFO AND S/H", "White or pink noise.", [], ["noise.out"])
mod("ring", "ring_modulator", "Ring modulator", "AUDIO MIXER", "Ring modulation of the two VCOs; turn sync off when using it.", ["ring.a", "ring.b"], ["ring.out"])
mod("snh", "sample_hold", "Sample and hold", "LFO AND S/H",
    "Two-channel S/H mixer (VCO-1 saw or pulse; noise or VCO-2 pulse) sampled on LFO or keyboard triggers, with output lag. The S/H mixer output is also a modulation source in its own right.",
    ["snh.in1", "snh.in2", "snh.clock"], ["snh.out", "snh.mix_out"])
mod("mixer", "mixer", "Audio mixer", "AUDIO MIXER", "Three faders: noise or ring mod, VCO-1 saw or pulse, VCO-2 saw or pulse.", ["mixer.in1", "mixer.in2", "mixer.in3", "mixer.ext"], ["mixer.out"])
mod("vcf", "filter", "VCF", "VCF", "Resonant low-pass in three modes: 2-pole 4023 (12 dB/oct), 4-pole 4035 and 4-pole 4075 (24 dB/oct).", ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"],
    {"modes": {"4023": "2-pole, 12 dB/oct", "4035": "4-pole, 24 dB/oct", "4075": "4-pole, 24 dB/oct"}})
mod("hpf", "filter", "HPF", "VCF", "High-pass filter after the VCF.", ["hpf.in"], ["hpf.out"])
mod("drive", "overdrive", "Drive", "VCA", "Switchable drive stage.", ["drive.in"], ["drive.out"], {"confidence_note": "position in the chain inferred"})
mod("adsr", "envelope", "ADSR", "ADSR", "Attack 5 ms-5 s, decay 10 ms-10 s, sustain 0-100%, release 15 ms-10 s.", ["adsr.gate"], ["adsr.out"])
mod("ar", "envelope", "AR", "AR", "Attack 5 ms-5 s, release 10 ms-10 s; like the ADSR with decay at zero and sustain at maximum.", ["ar.gate"], ["ar.out"])
mod("repeat", "gate_logic", "Keyboard/LFO repeat", "KYBD/LFO REPEAT", "Lets either envelope be gated by the keyboard or retriggered at the LFO rate, on key press or continuously.",
    ["repeat.kbd_gate", "repeat.lfo"], ["repeat.adsr_gate", "repeat.ar_gate"])
mod("vca", "vca", "VCA", "VCA", "Amplitude from the ADSR or AR envelope, plus a GAIN fader for a level not triggered by the keyboard.", ["vca.in", "vca.cv"], ["vca.out"])
mod("fx", "effects", "Klark Teknik effects", "FX", "32 programs (reverbs, delays, echo, chorus, flanger, phaser, pan/tremolo, detune and more), three parameters each, tap tempo, FX SEND level.",
    ["fx.in"], ["fx.out"], {"programs": 32})
mod("out", "output", "Output", "(rear panel)", "Main outputs (high and low level) and headphones.", ["out.in"], ["out.main", "out.phones"])
mod("pedal", "manual_controller", "Pedal input", "(rear panel)", "Optional volume pedal as a modulation source for VCO-2 FM and the VCF.", ["pedal.in"], ["pedal.out"])

# ---------------- parameters ----------------
fader("seq.tempo", "seq", "TEMPO/GATE LENGTH", "Sequencer and arpeggiator tempo (internal clock); gate length while step editing; with SHIFT, swing or arpeggio gate length.", manual_ref=9)
fader("kbd.portamento", "kbd", "PORTAMENTO", "Glide time; with SHIFT during step editing, splits the step into 1-4 ratchets.", manual_ref=10)
par("kbd.porta_mode", "kbd", "MODE (recessed)", "boolean", "Pressed: portamento also applies to TRANSPOSE changes.", "push_button")
switch("kbd.transpose", "kbd", "TRANSPOSE", "Keyboard range up or down two octaves.", ["down_2", "normal", "up_2"], manual_ref=8)
for pad in ("down", "up", "lfo"):
    par(f"ppc.{pad}", "ppc", f"PROPORTIONAL PITCH ({pad})", "continuous", {"down": "Lowers pitch with pressure.", "up": "Raises pitch with pressure.", "lfo": "Adds LFO modulation with pressure."}[pad],
        "pad", panel_scale=S10)
fader("vco1.coarse", "vco1", "FREQUENCY COARSE", "Wide-range VCO-1 frequency.")
fader("vco1.fine", "vco1", "FREQUENCY FINE", "Fine VCO-1 frequency.")
switch("vco1.kybd", "vco1", "AUDIO KYBD ON / LF KYBD OFF", "Normal, or a low frequency unaffected by the keyboard.", ["audio_kybd_on", "lf_kybd_off"])
fader("vco1.fm1", "vco1", "FM (LFO)", "Depth of LFO FM on VCO-1.")
switch("vco1.fm1_src", "vco1", "FM source", "LFO waveform for FM.", ["lfo_sine", "lfo_square"])
fader("vco1.fm2", "vco1", "FM (S/H or ADSR)", "Depth of S/H or ADSR FM on VCO-1.")
switch("vco1.fm2_src", "vco1", "FM source", "S/H or ADSR.", ["snh", "adsr"])
fader("vco1.pw", "vco1", "PULSE WIDTH", "Pulse width from square (50%) to minimum.")
fader("vco1.pwm", "vco1", "PULSE WIDTH MODULATION", "Depth of pulse width modulation.")
switch("vco1.pwm_src", "vco1", "PWM source", "LFO sine or ADSR.", ["lfo_sine", "adsr"])
fader("vco2.coarse", "vco2", "FREQUENCY COARSE", "Wide-range VCO-2 frequency.")
fader("vco2.fine", "vco2", "FREQUENCY FINE", "Fine VCO-2 frequency.")
par("vco2.sync", "vco2", "SYNC ON/OFF", "boolean", "Syncs VCO-2 to VCO-1; turn off for ring modulation.", "toggle_switch")
fader("vco2.fm1", "vco2", "FM (LFO / S/H mixer / pedal)", "Depth of FM on VCO-2 from the selected source.")
switch("vco2.fm1_src", "vco2", "FM source", "LFO sine, S/H mixer, or pedal.", ["lfo_sine", "snh_mixer", "pedal"])
fader("vco2.fm2", "vco2", "FM (S/H or ADSR)", "Depth of S/H or ADSR FM on VCO-2.")
switch("vco2.fm2_src", "vco2", "FM source", "S/H or ADSR.", ["snh", "adsr"])
fader("vco2.pw", "vco2", "PULSE WIDTH", "Pulse width from square (50%) to minimum.")
fader("vco2.pwm", "vco2", "PULSE WIDTH MODULATION", "Depth of pulse width modulation.")
switch("vco2.pwm_src", "vco2", "PWM source", "LFO sine or ADSR.", ["lfo_sine", "adsr"])
fader("lfo.freq", "lfo", "LFO FREQ", "LFO rate; also the repeat rate.", manual_ref=27)
fader("snh.mix1", "snh", "S/H MIXER (VCO-1)", "Level of the first S/H mixer input.", manual_ref=28)
switch("snh.mix1_src", "snh", "S/H source 1", "VCO-1 sawtooth or pulse.", ["vco1_saw", "vco1_pulse"])
fader("snh.mix2", "snh", "S/H MIXER (noise/VCO-2)", "Level of the second S/H mixer input.", manual_ref=29)
switch("snh.mix2_src", "snh", "S/H source 2", "Noise or VCO-2 pulse.", ["noise", "vco2_pulse"])
switch("snh.trigger", "snh", "S/H TRIGGER", "Sampled at the LFO rate or on each key.", ["lfo", "kybd"], manual_ref=30)
switch("noise.colour", "noise", "NOISE GEN", "White or pink.", ["white", "pink"], manual_ref=31)
par("snh.lag", "snh", "OUTPUT LAG", "continuous", "Slews the S/H output.", "knob", manual_ref=32, panel_scale=S10)
fader("vcf.freq", "vcf", "VCF FREQ", "Cutoff.", manual_ref=33)
fader("vcf.resonance", "vcf", "VCF RESONANCE", "Emphasis at cutoff.", manual_ref=34)
switch("vcf.mode", "vcf", "VCF MODE", "Filter type.", [{"value": "4023", "meaning": "2-pole, 12 dB/oct"}, {"value": "4035", "meaning": "4-pole, 24 dB/oct"}, {"value": "4075", "meaning": "4-pole, 24 dB/oct"}],
       "rotary_switch", manual_ref=35)
fader("hpf.cutoff", "hpf", "HPF CUTOFF FREQ", "High-pass cutoff.", manual_ref=36)
par("drive.on", "drive", "DRIVE ON/OFF", "boolean", "Drive on or off.", "toggle_switch", manual_ref=37)
fader("vca.gain", "vca", "VCA GAIN", "Base level, not triggered by the keyboard.", manual_ref=38)
fader("mixer.noise_ring", "mixer", "NOISE/RING MOD", "Level of noise or ring mod.", manual_ref=39)
switch("mixer.noise_ring_src", "mixer", "noise/ring switch", "Noise or ring modulator.", ["noise", "ring_mod"])
fader("mixer.vco1", "mixer", "VCO-1", "Level of VCO-1.", manual_ref=40)
switch("mixer.vco1_src", "mixer", "VCO-1 wave", "Sawtooth or pulse.", ["saw", "pulse"])
fader("mixer.vco2", "mixer", "VCO-2", "Level of VCO-2.", manual_ref=41)
switch("mixer.vco2_src", "mixer", "VCO-2 wave", "Sawtooth or pulse.", ["saw", "pulse"])
fader("vcf.mod1", "vcf", "KYBD CV / S/H MIXER / PEDAL", "Depth of the selected source on cutoff.", manual_ref=42)
switch("vcf.mod1_src", "vcf", "VCF source 1", "Keyboard CV, S/H mixer, or pedal.", ["kybd_cv", "snh_mixer", "pedal"])
fader("vcf.mod2", "vcf", "S/H or LFO", "Depth of S/H or LFO on cutoff.", manual_ref=43)
switch("vcf.mod2_src", "vcf", "VCF source 2", "S/H or LFO sine.", ["snh", "lfo_sine"])
fader("vcf.env", "vcf", "ADSR or AR", "Envelope depth on cutoff.", manual_ref=44)
switch("vcf.env_src", "vcf", "VCF envelope", "ADSR or AR.", ["adsr", "ar"])
fader("vca.env", "vca", "AR or ADSR", "Envelope level on the VCA.", manual_ref=45)
switch("vca.env_src", "vca", "VCA envelope", "AR or ADSR.", ["ar", "adsr"])
fader("ar.attack", "ar", "A-ATTACK", "AR attack.", manual_ref=46, physical={"min": 0.005, "max": 5, "unit": "s"})
fader("ar.release", "ar", "R-RELEASE", "AR release.", manual_ref=47, physical={"min": 0.01, "max": 10, "unit": "s"})
fader("adsr.attack", "adsr", "A-ATTACK", "ADSR attack.", manual_ref=48, physical={"min": 0.005, "max": 5, "unit": "s"})
fader("adsr.decay", "adsr", "D-DECAY", "ADSR decay.", manual_ref=49, physical={"min": 0.01, "max": 10, "unit": "s"})
fader("adsr.sustain", "adsr", "S-SUSTAIN", "ADSR sustain level.", manual_ref=50, physical={"min": 0, "max": 100, "unit": "%"})
fader("adsr.release", "adsr", "R-RELEASE", "ADSR release.", manual_ref=51, physical={"min": 0.015, "max": 10, "unit": "s"})
switch("repeat.adsr", "repeat", "ADSR KYBD GATE / LFO REPEAT", "Keyboard gate, or retriggered at the LFO rate.", ["kybd_gate", "lfo_repeat"], manual_ref=52)
switch("repeat.mode", "repeat", "KYBD REPEAT / AUTO REPEAT", "Repeats while a key is held, or continuously.", ["kybd_repeat", "auto_repeat"], manual_ref=53)
switch("repeat.ar", "repeat", "AR KYBD GATE / LFO REPEAT", "Keyboard gate, or retriggered at the LFO rate.", ["kybd_gate", "lfo_repeat"], manual_ref=54)
par("fx.on", "fx", "FX ON/OFF", "boolean", "Engages the effects.", "push_button", manual_ref=2)
par("fx.program", "fx", "PROGRAM/VALUE", "integer", "Selects one of 32 programs (press to load) and sets parameter values.", "encoder", manual_ref=7, range={"min": 1, "max": 32})
par("fx.param12", "fx", "PARAMETER 1/2", "boolean", "Shows parameter 1, then 2, for editing.", "push_button", manual_ref=3)
par("fx.param3", "fx", "PARAMETER 3 (TAP)", "boolean", "Shows parameter 3; taps tempo for tempo parameters.", "push_button", manual_ref=4)
par("fx.send", "fx", "FX SEND", "continuous", "Amount of effect.", "knob", manual_ref=18, panel_scale=S10)
for b in ("hold_rest", "reset_accent", "arp_set_end", "pattern_bank", "shift", "page", "play_stop", "rec", "kybd", "step"):
    par(f"seq.{b}", "seq", b.replace("_", "/").upper(), "boolean",
        {"hold_rest": "Holds a note or step; enters a rest in step editing; with ARP, latches the arpeggio.",
         "reset_accent": "Resets to step 1; adds an accent in step editing; on the keyboard, holds accent.",
         "arp_set_end": "Starts the arpeggiator (twice to latch); with SHIFT and a step, sets the pattern end.",
         "pattern_bank": "Shows or selects pattern 1-8; with SHIFT, bank 1-8.", "shift": "Second functions.",
         "page": "Steps through the four 8-step pages.", "play_stop": "Starts or stops; with SHIFT, begins saving.",
         "rec": "Records a new pattern; with SHIFT, saves.", "kybd": "<KYBD: with SHIFT, keyboard mode; decrements values.",
         "step": "STEP>: with SHIFT, step mode; increments values."}[b], "push_button")
par("seq.step_switches", "seq", "STEP 1-8", "enum", "Select steps, patterns, banks and setting values.", "push_button", values=[{"value": i} for i in range(1, 9)])
switch("seq.arp_mode", "seq", "Arpeggio order", "Arpeggio pattern, changed with <KYBD/STEP> while playing.",
       ["up", "down", "down_up", "random", "up_plus_1oct", "down_plus_1oct", "up_minus_1oct", "down_minus_1oct"], "push_button")
par("out.led_brightness", "out", "LED", "continuous", "Fader LED brightness, bright to off.", access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)
par("out.phones", "out", "PHONES VOLUME", "continuous", "Headphone level.", access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)
for k, lbl, vals in (("midi_in", "MIDI input channel", list(range(1, 17))), ("midi_out", "MIDI output channel", list(range(1, 17))),
                     ("clock", "Clock source", ["internal", "midi_din", "midi_usb", "auto"])):
    par(f"sys.{k}", "midi", lbl, "enum", f"{lbl}; AUTO priority is USB, then DIN, then internal." if k == "clock" else f"{lbl}.",
        values=[{"value": v} for v in vals], access=[{"type": "gesture", "gesture": "SHIFT + HOLD/REST + 8, then page with <KYBD/STEP>, value with STEP 1-8 (SHIFT for 9-16)", "when": "any_time"},
                                                     {"type": "sysex"}, {"type": "app", "note": "SynthTool"}])
par("sys.accent_threshold", "midi", "Accent velocity threshold", "integer", "Velocity above which keyboard notes are accented; can be disabled.", access=[{"type": "app", "note": "SynthTool"}, {"type": "sysex"}])

# ---------------- ports ----------------
for kind, sig, fn_in, fn_out in (("cv", "cv", "Pitch CV in, 1 V/oct.", "Pitch CV out, 1 V/oct."), ("gate", "gate", "Gate in, +3 V minimum.", "Gate out, +10 V."),
                                 ("trig", "gate", "Trigger in, +3 V pulse minimum.", "Trigger out, +10 V pulse.")):
    jack(f"jack.{kind}_in", f"{kind.upper()} IN", "in", sig, f"kbd.{kind}_in", fn_in, "3.5 mm TS", confidence="inferred", note="The guide groups CV/GATE/TRIGGER inputs and outputs without listing each jack.")
    jack(f"jack.{kind}_out", f"{kind.upper()} OUT", "out", sig, {"cv": "kbd.cv_high", "gate": "kbd.gate", "trig": "kbd.trig"}[kind], fn_out, "3.5 mm TS", confidence="inferred")
jack("jack.ext_audio", "EXT AUDIO INPUT", "in", "audio", "mixer.ext", "Line-level audio, max -10 dBu; sounds when notes or the sequencer play.", "6.35 mm TS")
jack("jack.pedal", "PEDAL", "in", "cv", "pedal.in", "Volume pedal for VCO-2 FM and the VCF when their switches are at PEDAL.", "6.35 mm TS")
jack("jack.porta_fs", "PORTAMENTO", "in", "gate", "kbd.porta_fs", "Footswitch to engage or disengage portamento.", "6.35 mm TS")
jack("jack.out_low", "MAIN OUTPUT LOW", "out", "audio", "out.main", "Low level, unbalanced, max -20 dBu.", "6.35 mm TS")
jack("jack.out_high", "MAIN OUTPUT HIGH", "out", "audio", "out.main", "Line level, balanced, max +4 dBu.", "XLR")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones, 50 mW + 50 mW.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", None, "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI; SynthTool; firmware.", "USB 2.0 type B")
jack("jack.dc_in", "DC INPUT", "in", "power", None, "9 V DC supply.", "DC barrel")

# ---------------- internal routing ----------------
con("midi.notes", "kbd.seq_in", "midi")
con("seq.notes", "kbd.seq_in", "cv", note="Sequencer and arpeggiator notes play the voice.")
con("kbd.cv_low", "vco1.pitch_cv", when={"param": "vco1.kybd", "equals": "audio_kybd_on"})
con("kbd.cv_high", "vco2.pitch_cv")
con("ppc.bend", "vco1.pitch_cv")
con("ppc.bend", "vco2.pitch_cv")
con("ppc.vibrato", "vco1.fm", note="LFO depth set by pad pressure.", confidence="inferred")
con("ppc.vibrato", "vco2.fm", confidence="inferred")
con("vco1.saw", "vco2.sync_in", "sync", eq("vco2.sync", True))
for v in ("vco1", "vco2"):
    con("lfo.sine", f"{v}.fm", when=eq(f"{v}.fm1_src", "lfo_sine"), amount=f"{v}.fm1")
    con("snh.out", f"{v}.fm", when=eq(f"{v}.fm2_src", "snh"), amount=f"{v}.fm2")
    con("adsr.out", f"{v}.fm", when=eq(f"{v}.fm2_src", "adsr"), amount=f"{v}.fm2")
    con("lfo.sine", f"{v}.pwm", when=eq(f"{v}.pwm_src", "lfo_sine"), amount=f"{v}.pwm")
    con("adsr.out", f"{v}.pwm", when=eq(f"{v}.pwm_src", "adsr"), amount=f"{v}.pwm")
con("lfo.square", "vco1.fm", when=eq("vco1.fm1_src", "lfo_square"), amount="vco1.fm1")
con("snh.mix_out", "vco2.fm", when=eq("vco2.fm1_src", "snh_mixer"), amount="vco2.fm1")
con("pedal.out", "vco2.fm", when=eq("vco2.fm1_src", "pedal"), amount="vco2.fm1")
con("vco1.pulse", "ring.a", "audio", confidence="inferred", note="Ring mod inputs not stated; the VCO pulse waves as on the ARP Odyssey.")
con("vco2.pulse", "ring.b", "audio", confidence="inferred")
con("vco1.saw", "snh.in1", "audio", eq("snh.mix1_src", "vco1_saw"), amount="snh.mix1")
con("vco1.pulse", "snh.in1", "audio", eq("snh.mix1_src", "vco1_pulse"), amount="snh.mix1")
con("noise.out", "snh.in2", "audio", eq("snh.mix2_src", "noise"), amount="snh.mix2")
con("vco2.pulse", "snh.in2", "audio", eq("snh.mix2_src", "vco2_pulse"), amount="snh.mix2")
con("lfo.square", "snh.clock", "clock", eq("snh.trigger", "lfo"))
con("kbd.trig", "snh.clock", "gate", eq("snh.trigger", "kybd"))
con("noise.out", "mixer.in1", "audio", eq("mixer.noise_ring_src", "noise"), amount="mixer.noise_ring")
con("ring.out", "mixer.in1", "audio", eq("mixer.noise_ring_src", "ring_mod"), amount="mixer.noise_ring")
con("vco1.saw", "mixer.in2", "audio", eq("mixer.vco1_src", "saw"), amount="mixer.vco1")
con("vco1.pulse", "mixer.in2", "audio", eq("mixer.vco1_src", "pulse"), amount="mixer.vco1")
con("vco2.saw", "mixer.in3", "audio", eq("mixer.vco2_src", "saw"), amount="mixer.vco2")
con("vco2.pulse", "mixer.in3", "audio", eq("mixer.vco2_src", "pulse"), amount="mixer.vco2")
con("mixer.out", "vcf.in", "audio")
con("kbd.cv_high", "vcf.cutoff_cv", when=eq("vcf.mod1_src", "kybd_cv"), amount="vcf.mod1", confidence="inferred", note="Which of the duophonic CVs tracks the filter is not stated.")
con("snh.mix_out", "vcf.cutoff_cv", when=eq("vcf.mod1_src", "snh_mixer"), amount="vcf.mod1")
con("pedal.out", "vcf.cutoff_cv", when=eq("vcf.mod1_src", "pedal"), amount="vcf.mod1")
con("snh.out", "vcf.cutoff_cv", when=eq("vcf.mod2_src", "snh"), amount="vcf.mod2")
con("lfo.sine", "vcf.cutoff_cv", when=eq("vcf.mod2_src", "lfo_sine"), amount="vcf.mod2")
con("adsr.out", "vcf.cutoff_cv", when=eq("vcf.env_src", "adsr"), amount="vcf.env")
con("ar.out", "vcf.cutoff_cv", when=eq("vcf.env_src", "ar"), amount="vcf.env")
con("vcf.out", "hpf.in", "audio")
con("hpf.out", "drive.in", "audio", confidence="inferred")
con("drive.out", "vca.in", "audio", confidence="inferred")
con("adsr.out", "vca.cv", when=eq("vca.env_src", "adsr"), amount="vca.env")
con("ar.out", "vca.cv", when=eq("vca.env_src", "ar"), amount="vca.env")
con("kbd.gate", "repeat.kbd_gate", "gate")
con("lfo.square", "repeat.lfo", "clock")
con("repeat.adsr_gate", "adsr.gate", "gate")
con("repeat.ar_gate", "ar.gate", "gate")
con("vca.out", "fx.in", "audio", note="Dry signal passes; FX SEND sets the effect amount.", confidence="inferred")
con("fx.out", "out.in", "audio", confidence="inferred")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "lfo.rate_led", "module": "lfo", "label": "RATE LED", "kind": "led", "function": "Flashes at the LFO rate.", "manual_ref": 26},
    {"id": "fx.display", "module": "fx", "label": "FX DISPLAY", "kind": "display", "function": "LCD: program, parameters, values and level bars with an OL overload segment. Hold PARAMETER 1/2 and tap PARAMETER 3 for contrast."},
    {"id": "seq.location_leds", "module": "seq", "label": "LOCATION LEDs", "kind": "led", "led_colour": "multi",
     "function": "Pattern, bank, page, ratchet, gate length and setting values; green keyboard mode, yellow step mode, red values 9-16."},
    {"id": "seq.step_leds", "module": "seq", "label": "STEP LEDs", "kind": "led", "function": "Active steps solid red; current step flashes."},
    {"id": "out.fader_leds", "module": "out", "label": "fader LEDs", "kind": "led", "function": "Lit faders; brightness on the rear LED knob."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Duophonic voicing", "applies_to": ["kbd", "vco1", "vco2"],
     "rule": "With one key held both VCOs play it. With two or more, VCO-1 takes the lowest note and VCO-2 the highest. LF KYBD OFF frees VCO-1 from the keyboard as a low-frequency source."},
    {"id": "b02", "name": "Fader-and-switch modulation", "applies_to": ["vco1", "vco2", "vcf", "vca"],
     "rule": "Each modulation fader sets a depth and its switch picks the source, as on the ARP Odyssey: VCO FM from the LFO, S/H, ADSR, S/H mixer or pedal; PWM from the LFO or ADSR; "
             "VCF from keyboard CV, S/H mixer, pedal, S/H, LFO, ADSR or AR; VCA from the ADSR or AR. VCF and VCA can use different envelopes."},
    {"id": "b03", "name": "Sample and hold", "applies_to": ["snh"],
     "rule": "Two mixer channels (VCO-1 saw or pulse; noise or VCO-2 pulse) are summed and sampled on each LFO cycle or key. The unsampled S/H mixer output is a separate modulation source. OUTPUT LAG slews the steps."},
    {"id": "b04", "name": "Repeat", "applies_to": ["repeat", "adsr", "ar"],
     "rule": "Either envelope can be gated by the keyboard or retriggered at the LFO rate. KYBD REPEAT retriggers only while a key is held; AUTO REPEAT runs continuously."},
    {"id": "b05", "name": "Filter modes", "applies_to": ["vcf"],
     "rule": "The three ARP Odyssey filter revisions: 4023 (2-pole, 12 dB/oct, Mk I), 4035 (4-pole, 24 dB/oct, Mk II) and 4075 (4-pole, 24 dB/oct, Mk III)."},
    {"id": "b06", "name": "Arpeggiator", "applies_to": ["seq"],
     "rule": "ARP once plays while keys are held; twice, or with HOLD, latches. Eight orders: up, down, down and up, random, and up or down with one octave added above or below, changed with <KYBD/STEP>."},
    {"id": "b07", "name": "Sequencer", "applies_to": ["seq"],
     "rule": "Up to 32 steps over four pages; 64 patterns in 8 banks. Keyboard mode records from the keys (REC); step mode edits steps freely (SHIFT + step). Steps take notes, rests, accents, "
             "gate length, portamento and ratchets (1-4). Live: SHIFT + PORTAMENTO ratchets all steps, SHIFT + TEMPO adds swing, SHIFT + HOLD/REST mutes, SHIFT + RESET/ACCENT accents all, TRANSPOSE shifts octave. "
             "Save with SHIFT + PLAY/STOP (two seconds), choose pattern and bank, then SHIFT + REC."},
    {"id": "b08", "name": "Accent", "applies_to": ["kbd", "seq"],
     "rule": "On the keyboard, velocity above a threshold (set or disabled in SynthTool) triggers accent; holding RESET/ACCENT forces it, a double press latches it."},
    {"id": "b09", "name": "No sound check", "applies_to": ["seq", "kbd"],
     "rule": "If the keyboard is silent, SHIFT + <KYBD returns to keyboard mode (step mode ignores the keys), and REC should be off."},
    {"id": "b10", "name": "Warm-up", "applies_to": ["vco1", "vco2", "vcf"], "rule": "Allow 15 minutes or more, longer from cold."},
]
D["midi"] = {
    "receives": [{"message": "note_on", "range": [0, 120]}, {"message": "note_off"}, {"message": "all_notes_off", "status": "Bn 7B 00"}, {"message": "pitch_bend"},
                 {"message": "clock"}, {"message": "start"}, {"message": "continue"}, {"message": "stop"},
                 {"message": "sysex", "header": "F0 00 20 32 00 01 03", "commands": {"0E": "MIDI channels", "10": "velocity", "11": "pitch bend range", "17": "MIDI clock",
                                                                                      "1B": "clock source", "1C": "accent threshold", "1D": "sequencer", "76": "configuration parameters", "78": "sequencer data"}}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "clock"}],
    "channel_note": "Separate input and output channels, 1-16; set on the panel, by SysEx or in SynthTool.",
    "note": "No control changes are listed: the panel faders are not on MIDI."}
D["specifications"] = {
    "keyboard": "37 semi-weighted full-size keys, velocity", "polyphony": "duophonic", "filters": {"vcf": "4023 12 dB/oct; 4035 and 4075 24 dB/oct", "hpf": "yes"},
    "envelopes": {"adsr": {"attack_s": [0.005, 5], "decay_s": [0.01, 10], "sustain_pct": [0, 100], "release_s": [0.015, 10]}, "ar": {"attack_s": [0.005, 5], "release_s": [0.01, 10]}},
    "sequencer": {"steps": 32, "patterns": 64, "banks": 8}, "effects": "32 Klark Teknik programs",
    "cv_gate": {"inputs": "3.5 mm TS: CV 1 V/oct, gate +3 V min, trigger +3 V pulse min", "outputs": "3.5 mm TS: CV 1 V/oct, gate +10 V, trigger +10 V pulse"},
    "audio": {"main_low": "1/4\" TS, max -20 dBu", "main_high": "XLR balanced, max +4 dBu", "phones": "1/4\" TRS, 50 mW + 50 mW", "ext_in": "1/4\" TS, max -10 dBu"},
    "connectivity": {"midi": "5-pin DIN in and out, 16 channels", "usb": "USB 2.0 type B, class compliant"},
    "power": {"adaptor": "9 V DC, 1700 mA (also given as 1300 mA)", "consumption_w": 12}, "dimensions_mm": {"h": 133, "w": 589, "d": 409}, "weight_kg": 8.1,
}
D["omitted_from_source"] = ["safety and warranty text", "hook-up diagrams", "non-English translations", "the full FX parameter table (program names and three parameters each)", "SysEx data byte layouts"]
D["not_in_source"] = ["LFO and VCO frequency ranges", "the individual rear CV/gate/trigger jacks", "ring modulator inputs", "where drive and the effects sit in the chain",
                      "which duophonic CV the filter tracks", "the arpeggiator's clock divisions"]
D["source_inconsistencies"] = [
    "The power adaptor is 9 V DC 1700 mA in one specifications table and 9 V DC 1300 mA in another.",
    "The specifications call the pulse waveforms 'square wave' in the mixer and S/H lists; the controls call them pulse.",
    "VCO-1's first FM switch is labelled 'LFO sine or square' in the controls and 'LFO sinewave, LFO square wave' in the specifications; VCO-2's equivalent adds S/H mixer and pedal.",
]
D["modelling_gaps"] = [
    {"topic": "Thin source", "detail": "A quick start guide; signal order after the filter and the CV jack list are inferred."},
    {"topic": "Effects", "detail": "32 programs are recorded by count; their algorithms are not modelled."},
    {"topic": "Original", "detail": "The ARP Odyssey itself is not modelled; an original manual would allow a TB-303/TD-3 style pair."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/behringer-odyssey_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
