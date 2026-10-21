#!/usr/bin/env python3
"""Assemble the Behringer Model 15 device file.

A semi-modular voice: two VCOs plus sub, noise, mixer, high-pass filter, 24 dB ladder
VCF, ADSR, VCA with three modes, LFO, sample and hold, attenuverter, spring reverb
emulation, arpeggiator and sequencer, and a 48-point patch bay (25 in, 23 out).

The quick start guide states only one normal (filter into VCA, broken by VCA INPUT).
The rest of the default signal path follows the Moog Grandmother, whose layout the
Model 15 copies, and is marked inferred.
"""
import json

S10 = {"min": 0, "max": 10}
PCT = {"min": 0, "max": 100}
D = {"schema_version": "0.10.0"}
M, P, J, C, B, I = [], [], [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", ref=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def enum(id, module, label, fn, vals, control="toggle_switch", ref=None, **kw):
    par(id, module, label, "enum", fn, control, ref, values=[v if isinstance(v, dict) else {"value": v} for v in vals], **kw)


def jack(id, label, direction, signal, node, fn, ref, connector="3.5 mm TS", **kw):
    j = {"id": id, "label": label, "location": "patch_in" if direction == "in" else "patch_out", "direction": direction, "signal": signal,
         "connector": connector, "node": node, "function": fn, "manual_ref": ref}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "fixed"}
    if when:
        c["kind"], c["enabled_when"] = "switched", when
    c.update(kw)
    if "broken_by" in kw:
        c["kind"] = "normalled"
    C.append(c)


D["device"] = {
    "id": "behringer-model-15", "manufacturer": "Behringer", "model": "MODEL 15 Analog Semi-Modular Synthesizer",
    "category": "monophonic semi-modular analogue synthesizer, desktop or Eurorack, with sequencer and arpeggiator",
    "based_on": "Behringer cites the Moog Model 15 modular circuits; reviewers note the layout and feature set copy the Moog Grandmother (2018), "
                "itself built from Moog modular circuits.",
    "sources": [
        {"id": "qsg", "title": "Behringer MODEL 15 Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_Model_15.pdf", "pages": 43,
         "note": "Multilingual; English controls (93 callouts), getting started, sequencer and specifications used. Patch sheets are blank."},
        {"id": "retail", "title": "B&H Photo, Synthtopia and Synth Anatomy product coverage", "kind": "other",
         "file": "https://www.synthtopia.com/content/2022/03/05/behringers-latest-synth-model-15-copies-the-moog-grandmother/",
         "note": "Grandmother comparison, 25 in / 23 out patch bay, 24 dB ladder filter, spring reverb emulation."},
        {"id": "grandmother", "title": "Moog Grandmother Owner's Manual", "kind": "user_manual", "file": "Grandmother_Manual.pdf",
         "note": "The instrument the Model 15 copies. Its documented normals, summing pitch inputs, S&H source and attenuator reference are applied here as inferred."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic", "poly_chain_max_units": None,
    "patch_memory": False, "patch_memory_note": "No sound memory; three sequencer slots of up to 256 steps each.", "semi_modular": True,
    "panel_counts": {"patch_inputs": 25, "patch_outputs": 23, "patch_points": 48},
    "summary": ("Two VCOs with four waveforms each, sync, PWM and a sub-oscillator, mixed with noise into a 24 dB ladder low-pass filter, with a "
                "separate 6 dB high-pass filter in the patch bay. One ADSR, a VCA that follows the envelope, the key release or stays open, an LFO "
                "reaching 1.3 kHz, sample and hold, an attenuverter, spring reverb emulation, and an arpeggiator and three-slot sequencer. "
                "Plays without patching; 48 jacks override or extend the internal routing."),
}

# ---------------- modules ----------------
mod("midi", "midi_to_cv", "MIDI to CV", "MIDI", "Converts MIDI notes (DIN or USB) to note CV, gate and velocity, through the arpeggiator/sequencer when running.",
    [], ["midi.note_cv", "midi.gate", "midi.velocity"])
mod("arpseq", "sequencer", "Arpeggiator / sequencer", "ARP/SEQ",
    "Arpeggiator over 1-3 octaves, or a step sequencer with three slots of up to 256 steps (notes, ties, rests, accents), transposed from the keyboard. "
    "Runs from its RATE, tap tempo or an external clock, and sends clock out.",
    ["arpseq.sync_in", "arpseq.reset_in", "arpseq.on_in"], ["arpseq.clock_out"], props={"slots": 3, "max_steps": 256})
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATOR", "Triangle, sawtooth, square or narrow pulse at 32', 16', 8' or 4'.",
    ["osc1.pitch_cv", "osc1.pwm_cv"], ["osc1.out"])
mod("osc2", "oscillator", "Oscillator 2 and sub", "OSCILLATOR",
    "Triangle, sawtooth, square or narrow pulse at 16'-2', detunable ±7 semitones, with hard sync to Oscillator 1, linear FM input and a sub-oscillator output.",
    ["osc2.pitch_cv", "osc2.fm", "osc2.pwm_cv", "osc2.sync_in"], ["osc2.out", "osc2.sub"])
mod("noise", "noise", "Noise", "MIXER", "White and pink noise.", [], ["noise.white", "noise.pink"])
mod("mixer", "mixer", "Mixer", "MIXER", "Three channels: Oscillator 1, Oscillator 2, and sub/white noise.",
    ["mixer.in1", "mixer.in2", "mixer.in3"], ["mixer.out"])
mod("hpf", "filter", "High-pass filter", "UTILITIES", "6 dB/oct high-pass, active only when patched.", ["hpf.in"], ["hpf.out"], props={"slope_db_per_oct": 6})
mod("vcf", "filter", "Ladder filter", "FILTER", "24 dB/oct resonant ladder low-pass, 20 Hz-20 kHz, with key tracking and a bipolar envelope amount.",
    ["vcf.in", "vcf.cutoff_cv", "vcf.env_amt_cv", "vcf.env_in", "vcf.key_cv"], ["vcf.out"], props={"slope_db_per_oct": 24, "cutoff_hz": [20, 20000]})
mod("env", "envelope", "Envelope", "ENVELOPE", "ADSR: attack 2 ms-16 s, decay 2 ms-40 s, sustain 0-8 V, release 2 ms-20 s, with normal and inverted outputs.",
    ["env.trig"], ["env.out", "env.inv"])
mod("vca", "vca", "VCA", "OUTPUT", "Follows the envelope, opens only on key release ('KEYBOARD RELEASE'), or stays open (DRONE).",
    ["vca.in", "vca.cv", "vca.env_in"], ["vca.out"])
mod("lfo", "lfo", "LFO", "LFO", "Sine, sawtooth, ramp or square, 0.07 Hz-1.3 kHz, with reset and rate inputs.",
    ["lfo.trig", "lfo.rate_cv"], ["lfo.out"], props={"rate_hz": [0.07, 1300]})
mod("snh", "sample_hold", "Sample and hold", "UTILITIES", "Sample-and-hold output.", ["snh.in", "snh.clock"], ["snh.out"])
mod("att", "attenuator", "Attenuverter", "UTILITIES", "Bipolar attenuator: centre is off, clockwise passes the input, anticlockwise passes it inverted.",
    ["att.in"], ["att.out"])
mod("ref", "cv_source_selector", "Attenuator reference", "UTILITIES", "Internal positive voltage normalled to the attenuator input, as on the Grandmother.", [], ["ref.pos"])
mod("reverb", "reverb", "Reverb", "OUTPUT", "Spring reverb emulation with dry/wet MIX; has its own patch input and output.", ["reverb.in"], ["reverb.out"])
mod("out", "output", "Output", "OUTPUT", "Main volume to the 3.5 mm and 6.35 mm outputs; separate headphone volume.", ["out.in"], ["out.main", "out.phones"])
mod("mult1", "mult", "MULTI 1", "PATCH BAY", "Passive multiple; the specifications count its three jacks as inputs.", ["mult1.bus"], [])
mod("mult2", "mult", "MULTI 2", "PATCH BAY", "Passive multiple; the specifications count its three jacks as outputs.", [], ["mult2.bus"])

# ---------------- parameters ----------------
par("arpseq.rate", "arpseq", "RATE", "continuous", "ARP/SEQ rate.", ref=2, panel_scale=PCT)
enum("arpseq.mode", "arpseq", "MODE", "Arpeggiator, sequencer playback or sequencer record.", ["arp", "seq", "rec"], ref=3)
enum("arpseq.direction", "arpseq", "DIRECTION", "ORDR: order played or start to end. <</>>: forwards then back. RNDM: random.", ["ordr", "back_forth", "rndm"], ref=4)
enum("arpseq.oct_seq", "arpseq", "OCT/SEQ", "Arpeggio range in octaves, or the sequence slot to play or record.", [1, 2, 3], ref=5)
par("arpseq.glide", "arpseq", "GLIDE", "continuous", "Glide time between notes; minimum is off.", ref=6, panel_scale=PCT)
par("arpseq.play_tie", "arpseq", "PLAY/TIE", "boolean", "Starts the ARP/SEQ; enters a tie in sequencer record.", "push_button", 13)
par("arpseq.hold_rest", "arpseq", "HOLD/REST", "boolean", "Keeps the ARP/SEQ playing; enters a rest in sequencer record.", "push_button", 14)
par("arpseq.tap_accent", "arpseq", "TAP/ACCENT", "boolean", "Three or more taps set the tempo (hold to exit); adds an accent step in sequencer record.", "push_button", 15)
par("lfo.rate", "lfo", "RATE", "continuous", "LFO rate.", ref=8, physical={"min": 0.07, "max": 1300, "unit": "Hz"})
par("lfo.pitch_mod", "lfo", "PITCH MOD", "continuous", "Maximum LFO depth on both oscillators' pitch.", ref=9, panel_scale=PCT)
par("lfo.pw_mod", "lfo", "PULSE WIDTH", "continuous", "Maximum LFO depth on the square and narrow pulse widths of both oscillators.", ref=10, panel_scale=PCT)
par("lfo.filter_mod", "lfo", "FILTER MOD", "continuous", "Maximum LFO depth on cutoff.", ref=11, panel_scale=PCT)
enum("lfo.waveform", "lfo", "WAVEFORM", "LFO shape.", ["sine", "sawtooth", "ramp", "square"], "rotary_switch", 12)
enum("osc1.octave", "osc1", "OCTAVE 1", "Oscillator 1 footage.", ["32'", "16'", "8'", "4'"], "rotary_switch", 16)
enum("osc2.octave", "osc2", "OCTAVE 2", "Oscillator 2 footage.", ["16'", "8'", "4'", "2'"], "rotary_switch", 17)
par("osc2.sync", "osc2", "SYNC", "boolean", "Hard-syncs Oscillator 2 to Oscillator 1.", "toggle_switch", 18)
par("osc2.frequency", "osc2", "FREQUENCY", "continuous", "Detunes Oscillator 2 from Oscillator 1, ±7 semitones.", ref=19, panel_scale={"min": -7, "max": 7})
enum("osc1.waveform", "osc1", "WAVEFORM OSC 1", "Oscillator 1 waveform.", ["triangle", "sawtooth", "square", "narrow_pulse"], "rotary_switch", 20)
enum("osc2.waveform", "osc2", "WAVEFORM OSC 2/SUB", "Waveform for Oscillator 2 or the sub-oscillator.", ["triangle", "sawtooth", "square", "narrow_pulse"], "rotary_switch", 21,
     note="The guide says it selects the waveform 'for OSC 2 or the SUB Oscillator' without saying how the choice between them is made.")
par("osc.fine_tune", "osc1", "FINE TUNE", "continuous", "Overall tuning, ±4 semitones.", ref=22, panel_scale={"min": -4, "max": 4})
for n, lbl in ((1, "Oscillator 1"), (2, "Oscillator 2"), (3, "sub/white noise")):
    par(f"mixer.level{n}", "mixer", f"MIXER {n}", "continuous", f"Level of {lbl}.", ref=22 + n, panel_scale=PCT)
par("hpf.cutoff", "hpf", "HI PASS FILTER", "continuous", "High-pass cutoff, when patched.", ref=26, panel_scale=PCT)
par("att.amount", "att", "ATTENUATOR", "continuous", "Centre off; clockwise towards unity, anticlockwise towards unity inverted.", ref=27, panel_scale={"min": -5, "max": 5})
par("mod.amount", "lfo", "MODULATION", "continuous", "Overall amount of LFO modulation reaching cutoff, pitch and pulse width.", ref=28, panel_scale=PCT)
par("vcf.cutoff", "vcf", "CUTOFF", "continuous", "Cutoff frequency.", ref=29, physical={"min": 20, "max": 20000, "unit": "Hz"})
enum("vcf.key_tracking", "vcf", "KEY TRACKING", "Keyboard tracking of cutoff.", [{"value": "1:2", "meaning": "half"}, {"value": "off"}, {"value": "1:1", "meaning": "full"}], ref=30)
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Emphasis at cutoff.", ref=31, panel_scale=PCT)
par("vcf.env_amt", "vcf", "ENV AMT", "continuous", "Bipolar envelope depth on cutoff.", ref=32, panel_scale={"min": -5, "max": 5})
for k, lbl, ref, phys in (("attack", "ATTACK", 33, (0.002, 16, "s")), ("decay", "DECAY", 34, (0.002, 40, "s")), ("sustain", "SUSTAIN", 35, (0, 8, "V")),
                          ("release", "RELEASE", 36, (0.002, 20, "s"))):
    par(f"env.{k}", "env", lbl, "continuous", f"Envelope {k}.", ref=ref, physical={"min": phys[0], "max": phys[1], "unit": phys[2]})
par("out.volume", "out", "VOLUME", "continuous", "Main volume.", ref=39, panel_scale=PCT)
enum("vca.mode", "vca", "VCA MODE", "Envelope, keyboard release, or drone (always open).", ["env", "release", "drone"], ref=40)
par("reverb.mix", "reverb", "REVERB MIX", "continuous", "Dry/wet balance.", ref=41, panel_scale=PCT)
par("out.phones_volume", "out", "PHONES VOLUME", "continuous", "Headphone level.", ref=88, panel_scale=PCT)
par("midi.channel", "midi", "MIDI CHANNEL SELECT", "integer", "Receive channel 1-16.", ref=89, range={"min": 1, "max": 16},
    access=[{"type": "rear_panel", "control": "dip_switches_x4"}, {"type": "app", "note": "SynthTribe"}])
enum("midi.out_thru", "midi", "OUT/THRU", "Whether the MIDI DIN socket sends MIDI out or passes MIDI in through.", ["out", "thru"], ref=90,
     access=[{"type": "app", "note": "SynthTribe output parameters: MIDI (DIN), MIDI (USB) or both"}], confidence="inferred",
     note="The guide does not say how OUT/THRU is chosen.")
par("sys.power", "out", "ON/OFF", "boolean", "Power switch.", ref=92, access=[{"type": "rear_panel", "control": "push_button"}])

# ---------------- ports ----------------
jack("jack.audio_in", "AUDIO INPUT", "in", "audio", "mixer.in3", "External or internal audio; assumed to enter mixer channel 3.", 42, confidence="speculative",
     note="The guide only says 'used to input external or internal audio'.")
for n, ref in ((1, 43), (2, 44), (3, 45)):
    jack(f"jack.mix{n}", f"MIX {n}", "in", "audio", f"mixer.in{n}", f"Mixer channel {n} input; replaces its internal source.", ref)
jack("jack.reverb_in", "REVERB INPUT", "in", "audio", "reverb.in", "Direct into the reverb.", 46)
jack("jack.filter_in", "FILTER INPUT", "in", "audio", "vcf.in", "Into the ladder filter; replaces the mixer feed.", 47)
jack("jack.hpf_in", "HI PASS", "in", "audio", "hpf.in", "Into the high-pass filter.", 48)
jack("jack.osc1_pwm", "OSC 1 PWM", "in", "cv", "osc1.pwm_cv", "Pulse width of Oscillator 1's square or narrow pulse, 0 to +5 V.", 49)
jack("jack.env_amt", "ENV AMT", "in", "cv", "vcf.env_amt_cv", "CV control of the envelope amount, -8 to +8 V.", 50)
jack("jack.cutoff", "CUTOFF", "in", "cv", "vcf.cutoff_cv", "Cutoff CV, -5 to +5 V.", 51, combine="sum")
jack("jack.osc2_fm", "OSC 2 FM", "in", "cv_or_audio", "osc2.fm", "Linear FM of Oscillator 2.", 52)
jack("jack.osc1_cv", "OSC 1 CV", "in", "cv", "osc1.pitch_cv", "Pitch of Oscillator 1; summed with the keyboard CV.", 53, combine="sum", confidence="inferred")
jack("jack.osc2_cv", "OSC 2 CV", "in", "cv", "osc2.pitch_cv", "Pitch of Oscillator 2; summed with the keyboard CV.", 54, combine="sum", confidence="inferred")
jack("jack.env_trig", "ENV TRIG", "in", "gate", "env.trig", "Envelope trigger, above 2.5 V; replaces the keyboard gate.", 55)
jack("jack.vca_in", "VCA INPUT", "in", "audio", "vca.in", "Audio into the VCA; disconnects the filter output.", 56)
jack("jack.vca_cv", "VCA CV", "in", "cv", "vca.cv", "Controls overall volume, 0 to +8 V in DRONE.", 57)
jack("jack.lfo_trig", "LFO TRIG", "in", "gate", "lfo.trig", "Restarts the LFO cycle.", 58)
jack("jack.lfo_rate", "LFO RATE", "in", "cv", "lfo.rate_cv", "LFO rate CV.", 59)
jack("jack.att_in", "ATT INPUT", "in", "cv_or_audio", "att.in", "Attenuverter input, -8 to +8 V; unpatched, it reads an internal positive reference.", 60)
jack("jack.arpseq_sync", "ARP/SEQ SYN", "in", "clock", "arpseq.sync_in", "External clock for the ARP/SEQ, above 2.5 V.", 61, combine="replace")
jack("jack.arpseq_reset", "ARP/SEQ RES", "in", "gate", "arpseq.reset_in", "Resets the pattern to its start.", 62)
jack("jack.arpseq_on", "ARP/SEQ ON", "in", "gate", "arpseq.on_in", "Starts the ARP/SEQ: 0 V off, +5 V on.", 63)
for k in (1, 2, 3):
    jack(f"jack.multi1_{k}", f"MULTI 1 ({k})", "in", "cv_or_audio", "mult1.bus", "Multiple: duplicate or combine signals.", 64)
jack("jack.audio_out", "AUDIO OUTPUT", "out", "audio", "out.main", "Main output, 3.5 mm.", 65)
jack("jack.vca_out", "VCA OUTPUT", "out", "audio", "vca.out", "VCA output.", 66)
jack("jack.mixer_out", "MIXER", "out", "audio", "mixer.out", "Mixer output.", 67)
jack("jack.hpf_out", "HI-PASS", "out", "audio", "hpf.out", "High-pass output.", 68)
jack("jack.filter_out", "FILTER", "out", "audio", "vcf.out", "Ladder filter output.", 69)
jack("jack.reverb_out", "REVERB", "out", "audio", "reverb.out", "Reverb output.", 70)
jack("jack.white", "W NOISE", "out", "cv_or_audio", "noise.white", "White noise, 10 Vpp.", 71)
jack("jack.pink", "P NOISE", "out", "cv_or_audio", "noise.pink", "Pink noise, 10 Vpp.", 72)
jack("jack.osc1_out", "OSC 1", "out", "audio", "osc1.out", "Oscillator 1, 5 Vpp.", 73)
jack("jack.sub_out", "SUB", "out", "audio", "osc2.sub", "Sub-oscillator, +4.6 dBu.", 74)
jack("jack.osc2_out", "OSC 2", "out", "audio", "osc2.out", "Oscillator 2, +4.0 dBu.", 75)
jack("jack.env_out", "ENV", "out", "cv", "env.out", "Envelope, 10 Vpp.", 76)
jack("jack.snh_out", "S&H", "out", "cv", "snh.out", "Sample and hold, 10 Vpp.", 77)
jack("jack.env_inv", "ENV INV", "out", "cv", "env.inv", "Inverted envelope, 12 Vpp.", 78)
jack("jack.att_out", "ATT OUTPUT", "out", "cv_or_audio", "att.out", "Attenuverter output.", 79)
jack("jack.lfo_out", "LFO", "out", "cv", "lfo.out", "LFO, 8 Vpp.", 80)
jack("jack.velocity", "VELOCITY", "out", "cv", "midi.velocity", "MIDI velocity as CV; carries sequencer accents. 0 to +5 V.", 81)
jack("jack.note_cv", "NOTE CV", "out", "cv", "midi.note_cv", "Note CV, -5 to +5 V.", 82)
jack("jack.gate", "GATE", "out", "gate", "midi.gate", "Gate, 0 / +8 V.", 83)
jack("jack.sync_out", "SYNC", "out", "clock", "arpseq.clock_out", "Clock out to slave other gear, 0 to +5 V.", 84)
for k in (1, 2, 3):
    jack(f"jack.multi2_{k}", f"MULTI 2 ({k})", "out", "cv_or_audio", "mult2.bus", "Multiple: duplicate or combine signals.", 85)
jack("jack.audio_out_big", "AUDIO OUTPUT", "out", "audio", "out.main", "Main output, 6.35 mm TS, up to +5.8 dBu.", 86, connector="6.35 mm TS", location="rear")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones, 7.5 mW into 32 ohm.", 87, connector="6.35 mm TRS", location="rear")
jack("jack.midi_in", "MIDI IN", "in", "midi", None, "MIDI in.", 38, connector="5-pin DIN", location="rear")
jack("jack.midi_out", "MIDI OUT/THRU", "out", "midi", None, "MIDI out or thru.", 90, connector="5-pin DIN", location="rear")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI; SynthTribe; firmware.", 91, connector="USB 2.0 type B", location="rear")
jack("jack.dc_in", "DC INPUT", "in", "power", None, "12 V DC 1000 mA supply.", 93, connector="DC barrel", location="rear")

# ---------------- internal normals ----------------
INF = {"confidence": "inferred"}
GM = {"confidence": "inferred"}
con("midi.note_cv", "osc1.pitch_cv", "cv", **GM, note="Fixed, not normalled: on the Grandmother, OSC PITCH IN adds to the keyboard CV.")
con("midi.note_cv", "osc2.pitch_cv", "cv", **GM)
con("midi.note_cv", "vcf.key_cv", "cv", {"param": "vcf.key_tracking", "not_equals": "off"}, note="Full at 1:1, half at 1:2.")
con("midi.gate", "env.trig", "gate", broken_by="jack.env_trig", **INF)
con("osc1.out", "osc2.sync_in", "sync", {"param": "osc2.sync", "equals": True})
con("osc1.out", "mixer.in1", broken_by="jack.mix1", **INF)
con("osc2.out", "mixer.in2", broken_by="jack.mix2", **INF)
con("osc2.sub", "mixer.in3", broken_by="jack.mix3", **INF, note="Mixer 3 is labelled 'OSC 3/White Noise' in the controls and 'Sub / white noise' in the specifications.")
con("mixer.out", "vcf.in", broken_by="jack.filter_in", **INF)
con("vcf.out", "vca.in", broken_by="jack.vca_in", confidence="stated")
con("env.out", "vcf.env_in", "cv", amount="vcf.env_amt")
con("env.out", "vca.env_in", "cv", {"param": "vca.mode", "not_equals": "drone"})
con("vca.out", "reverb.in", broken_by="jack.reverb_in", **INF)
con("reverb.out", "out.in", amount="reverb.mix", note="Dry/wet mix of the VCA signal and reverb.", **INF)
con("lfo.out", "osc1.pitch_cv", "cv", amount_expr="lfo.pitch_mod * mod.amount", **INF)
con("lfo.out", "osc2.pitch_cv", "cv", amount_expr="lfo.pitch_mod * mod.amount", **INF)
con("lfo.out", "osc1.pwm_cv", "cv", amount_expr="lfo.pw_mod * mod.amount", **INF)
con("lfo.out", "osc2.pwm_cv", "cv", amount_expr="lfo.pw_mod * mod.amount", **INF)
con("lfo.out", "vcf.cutoff_cv", "cv", amount_expr="lfo.filter_mod * mod.amount", **INF)
con("ref.pos", "att.in", "cv", broken_by="jack.att_in", **GM, note="Unpatched, the attenuator becomes a DC source of up to ±8 V, as on the Grandmother.")
con("noise.white", "snh.in", "cv", **GM, note="The Grandmother manual states the S&H samples noise; the Model 15 guide does not say, and has white and pink noise.")
con("lfo.out", "snh.clock", "clock", **GM, note="Samples at each zero crossing of the LFO, per the Grandmother manual.")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "arpseq.led", "module": "arpseq", "label": "ARP/SEQ LED", "kind": "led", "function": "Flashes at the ARP/SEQ tempo.", "manual_ref": 1},
    {"id": "lfo.led", "module": "lfo", "label": "LFO LED", "kind": "led", "function": "Flashes at the LFO rate.", "manual_ref": 7},
    {"id": "midi.led", "module": "midi", "label": "MIDI LED", "kind": "led", "function": "Lights on incoming MIDI.", "manual_ref": 37},
    {"id": "arpseq.tap_led", "module": "arpseq", "label": "TAP light", "kind": "led", "function": "Lit while tap tempo is on."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Default signal path", "applies_to": ["osc1", "osc2", "mixer", "vcf", "vca", "reverb", "out"],
     "rule": "Without cables: keyboard CV to both oscillators and (by KEY TRACKING) the filter; gate to the envelope; oscillators and sub/noise "
             "through the mixer into the ladder filter, then the VCA, reverb and output. The high-pass filter, sample and hold and attenuverter "
             "are only in circuit when patched. Patching MIX 1-3, FILTER INPUT, VCA INPUT, REVERB INPUT or ENV TRIG replaces its normal; OSC 1/2 CV add "
             "to the keyboard pitch rather than replacing it. Unpatched, the attenuator outputs a DC voltage set by its knob.", "confidence": "inferred",
     "note": "Only the filter-to-VCA normal is stated in the Model 15 guide; the rest follows the Moog Grandmother owner's manual."},
    {"id": "b02", "name": "VCA modes", "applies_to": ["vca", "env"],
     "rule": "ENV: the VCA follows the envelope. RELEASE ('keyboard release'): the envelope's release shapes the note end. DRONE: the VCA stays open, and VCA CV sets the level."},
    {"id": "b03", "name": "LFO depths", "applies_to": ["lfo"],
     "rule": "PITCH MOD, PULSE WIDTH and FILTER MOD set the maximum LFO depth for each destination; MODULATION sets how much of those depths is applied."},
    {"id": "b04", "name": "Arpeggiator", "applies_to": ["arpseq"],
     "rule": "In ARP mode, held notes play in order played (ORDR), forwards then back (<</>>) or randomly (RNDM), over 1-3 octaves. HOLD keeps it running. "
             "Tempo from RATE, three or more TAPs, or ARP/SEQ SYN."},
    {"id": "b05", "name": "Sequencer", "applies_to": ["arpseq", "midi"],
     "rule": "Three slots of up to 256 steps. MODE to REC, choose the slot with OCT/SEQ, then play notes; REST adds a blank step, TIE joins a repeated "
             "note, overlapping notes play legato, ACCENT marks a step on the VELOCITY output. MODE back to SEQ ends recording. PLAY then a key starts "
             "it, and new keys transpose. Editing only works while playing (switch to REC during playback); pressing a key in REC while stopped erases the slot."},
    {"id": "b06", "name": "Accents", "applies_to": ["midi", "vcf"],
     "rule": "Accents leave on the VELOCITY jack; patch it to CUTOFF (or FILTER IN, per the controls text) to hear them."},
    {"id": "b07", "name": "Warm-up", "applies_to": ["osc1", "osc2", "vcf"], "rule": "Allow 15 minutes or more, longer from cold."},
]
D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "velocity", "note": "to the VELOCITY jack"}],
             "transmits": [], "channel_note": "Receive channel 1-16 by rear DIP switches; MIDI output routing (DIN, USB, both) in SynthTribe.",
             "note": "The quick start guide lists no controller, clock or program messages."}
D["specifications"] = {
    "voices": 1, "oscillators": "2 + sub", "lfo": 1, "vcf": "1, 24 dB ladder", "envelopes": "1 ADSR", "noise": ["white", "pink"],
    "lfo_rate_hz": [0.07, 1300], "osc2_detune_semitones": [-7, 7], "fine_tune_semitones": [-4, 4], "cutoff_hz": [20, 20000],
    "envelope": {"attack_s": [0.002, 16], "decay_s": [0.002, 40], "sustain_v": [0, 8], "release_s": [0.002, 20]},
    "sequencer": {"slots": 3, "steps": 256}, "patch_points": {"inputs": 25, "outputs": 23},
    "outputs": {"main": "1/4\" TS, max +5.8 dBu; 3.5 mm on the patch bay", "phones": "1/4\" TRS, 7.5 mW into 32 ohm"},
    "connectivity": {"midi": "2 x 5-pin DIN (in, out/thru)", "usb": "USB 2.0 type B, class compliant"},
    "power": {"adaptor": "12 V DC, 1000 mA", "consumption_w": 10.5}, "dimensions_mm": {"l": 424.4, "w": 135.6, "h": 94.8}, "weight_kg": 1.76,
}
D["omitted_from_source"] = ["safety and warranty text", "hook-up diagrams", "non-English translations", "blank patch sheets"]
D["not_in_source"] = [
    "the normalled signal path, apart from filter to VCA (taken from the Grandmother manual)", "where AUDIO INPUT enters", "the sample and hold's source and clock (taken from the Grandmother manual)",
    "how the OSC 2/SUB waveform switch chooses between Oscillator 2 and the sub", "the sub-oscillator's octave", "how MULTI 1 and MULTI 2 relate",
    "MIDI implementation beyond notes and velocity", "Eurorack HP and current draw", "poly chain (listed by some retailers, not in the guide)",
]
D["source_inconsistencies"] = [
    "Mixer 3 is 'OSC 3/White Noise' in the controls but 'Sub / white noise' in the specifications; there is no Oscillator 3.",
    "The controls text says to patch VELOCITY to FILTER IN to hear accents; the getting-started text suggests CUTOFF IN, which is the CV input.",
    "The specifications list MULTI 1 as three inputs and MULTI 2 as three outputs; passive multiples have no direction.",
]
D["modelling_gaps"] = [
    {"topic": "Normals", "detail": "Taken from the Moog Grandmother owner's manual. The Model 15 departs from the Grandmother in places (sub-oscillator, pink noise, reverb emulation), so a hands-on check would confirm them."},
    {"topic": "Reverb", "detail": "An emulation of a spring; its character is not documented."},
    {"topic": "Sub-oscillator", "detail": "Waveform selection and octave relationship unclear from the guide."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/behringer-model-15_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
