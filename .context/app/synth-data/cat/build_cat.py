#!/usr/bin/env python3
"""Assemble the Behringer CAT device file."""
import json

D = {"schema_version": "0.7.0"}
D["device"] = {
    "id": "behringer-cat", "manufacturer": "Behringer", "model": "CAT",
    "category": "duophonic analogue synthesizer, desktop / Eurorack (70 HP)",
    "based_on": "Octave CAT (USA, 1976). The guide never names Octave; the name, layout, duophonic keyboard assignment and "
                "switch-selected modulation groups are the original's.",
    "sources": [
        {"id": "cat", "title": "CAT Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_CAT_Manual.pdf", "pages": 53,
         "version": "V 4.0",
         "note": "59 numbered controls with prose descriptions (pages 14 to 19), a poly chain LED table, a MIDI message table "
                 "and a specifications table with every jack voltage. No envelope times."},
        {"id": "panel", "title": "CAT front panel image", "kind": "measurement", "file": "Behringer_CAT.jpeg",
         "note": "Used for the modulation switch positions (the guide only says 'patch different waveforms'), the three-position "
                 "SYNC switch and the panel ranges."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 2,
    "polyphony_mode": "duophonic (VCO1 highest note, VCO2 lowest, one filter and one VCA shared) or monophonic; poly chain across units",
    "poly_chain_max_units": 16, "patch_memory": False, "semi_modular": True,
    "panel_counts": {"knobs": 13, "sliders": 21, "switches": 16, "jacks_3_5mm": 13},
    "summary": (
        "Two VCOs, each a set of simultaneous waveforms with its own level sliders (VCO1: sub-octave, sawtooth, triangle, "
        "pulse; VCO2: sub-octave, square, sawtooth), feeding one 24 dB/octave low-pass filter with white noise and an "
        "external input, then a VCA. In duophonic mode VCO1 plays the highest held note and VCO2 the lowest, sharing the "
        "filter and VCA. Modulation is by three-way switches, each feeding a depth knob: every VCO and the filter has one "
        "group choosing LFO sine, LFO square or sample-and-hold, and one choosing ADSR, AR or the other VCO. VCO1 also has "
        "switched pulse width modulation. Two envelopes (ADSR and AR), a delayed LFO, a sample-and-hold of VCO1 or noise, "
        "and an ADSR repeat mode clocked by the LFO."
    ),
}

M, P, J, C = [], [], [], []


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, function, ref=None, access=None, **kw):
    p = {"id": id, "module": module, "label": label}
    if ref is not None:
        p["manual_ref"] = ref
    p["kind"] = kind
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = access or [{"type": "panel", "control": "fader"}]
    p["function"] = function
    for k in ("confidence", "note", "led_colour"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, ref, loc, direction, signal, node, function, connector="3.5mm TS", combine=None, electrical=None, confidence=None, note=None):
    j = {"id": id, "label": label, "manual_ref": ref, "location": loc, "direction": direction, "signal": signal, "connector": connector, "node": node}
    if combine:
        j["combine"] = combine
    if electrical:
        j["electrical"] = electrical
    j["function"] = function
    if confidence:
        j["confidence"] = confidence
    if note:
        j["note"] = note
    J.append(j)


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


KN = [{"type": "panel", "control": "knob"}]
SW = [{"type": "panel", "control": "slide_switch"}]
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
S10 = {"min": 0, "max": 10}

# modules -------------------------------------------------------------------
mod("kbd", "midi_to_cv", "MIDI and keyboard assignment", "KEYBOARD",
    "MIDI notes in, split into a lowest-note and a highest-note pitch for duophonic playing, plus gate and pitch bend. "
    "There is no keyboard on this model.", [], ["kbd.low_note", "kbd.high_note", "kbd.gate", "kbd.bend"])
mod("pitch", "pitch_control", "Pitch, glide and bend", "KEYBOARD",
    "Glide, octave shift and pitch bend applied to both note pitches, and the VCO CV patch points. The KEYBOARD CONTROL "
    "switch decides which note VCO1 follows.",
    ["pitch.low_in", "pitch.high_in", "pitch.bend_in", "pitch.cv1_in", "pitch.cv2_in"], ["pitch.to_vco1_low", "pitch.to_vco1_high", "pitch.to_vco2"])
mod("gate_bus", "gate_logic", "Gate and ADSR repeat", "TRANSIENT GENERATORS",
    "Delivers the gate to both envelopes. ADSR REPEAT set to GATED retriggers the envelopes at the LFO rate while a key is held; "
    "AUTO retriggers them continuously, key or no key. The GATE input jack feeds the GATED mode.",
    ["gate_bus.midi_in", "gate_bus.ext_in", "gate_bus.clock_in"], ["gate_bus.out"])
mod("lfo", "lfo", "LFO", "KEYBOARD / TRANSIENT GENERATORS",
    "0.03 to 30 Hz, with simultaneous sine and square. The sine fades in after each key by the LFO DELAY time (0 to 5 s). "
    "Also clocks the sample-and-hold and the ADSR repeat.", [], ["lfo.sine", "lfo.square", "lfo.clock"],
    {"rate_hz": {"min": 0.03, "max": 30}, "shapes": ["sine", "square"], "delay_s": {"min": 0, "max": 5}})
mod("sample_hold", "sample_hold", "Sample and hold", "TRANSIENT GENERATORS",
    "Samples VCO1's mixed output or the noise generator at the LFO rate; its stepped output is one of the modulation choices.",
    ["sample_hold.in_vco1", "sample_hold.in_noise", "sample_hold.clock_in"], ["sample_hold.out"])
mod("noise", "noise", "Noise", "NOISE LEVEL", "White noise, mixed into the filter by NOISE LEVEL and available to the sample-and-hold.", [], ["noise.out"])
mod("vco1", "oscillator", "VCO 1", "VCO 1",
    "Four waveforms at once, each on its own level slider: sub-octave square, sawtooth, triangle and pulse. Coarse (0.2 Hz "
    "to 2 kHz on the panel) and fine tuning. Two modulation groups and switched pulse width modulation. Its 'out' node is "
    "the mix of its four level sliders.",
    ["vco1.pitch_in", "vco1.fm1_in", "vco1.fm2_in", "vco1.pwm_in", "vco1.sync_in"], ["vco1.out"],
    {"waveforms": ["sub_octave_square", "sawtooth", "triangle", "pulse"], "simultaneous_outputs": True,
     "frequency_hz": {"min": 1, "max": 38500, "note": "specifications: 1 Hz to 38.5 kHz in 6 overlapping ranges"}})
mod("vco2", "oscillator", "VCO 2", "VCO 2",
    "Three waveforms at once on level sliders: sub-octave square, square and sawtooth. Fine tuning only; it always plays "
    "the lowest held note. Two modulation groups. Sync master for VCO1.",
    ["vco2.pitch_in", "vco2.fm1_in", "vco2.fm2_in"], ["vco2.out", "vco2.sync_out"],
    {"waveforms": ["sub_octave_square", "square", "sawtooth"], "simultaneous_outputs": True})
mod("vcf", "filter", "VCF", "VCF",
    "4-pole 24 dB/octave low-pass filter that self-oscillates at full Q, silencing everything else. Inputs: VCO1 (switchable), "
    "VCO2, noise and the external audio input. Keyboard tracking, two modulation groups and CV inputs for cutoff and Q.",
    ["vcf.in_vco1", "vcf.in_vco2", "vcf.in_noise", "vcf.in_ext", "vcf.kbd_in", "vcf.fm1_in", "vcf.fm2_in", "vcf.fc_cv_in", "vcf.q_cv_in"],
    ["vcf.out"], {"slope_db_per_octave": 24, "poles": 4, "modes": ["lowpass"], "self_oscillates": True})
mod("adsr", "envelope", "ADSR", "TRANSIENT GENERATORS", "Attack, decay, sustain, release. A modulation choice everywhere and a VCA source.",
    ["adsr.gate_in"], ["adsr.out"], {"stages": ["attack", "decay", "sustain", "release"], "output_v": {"min": 0, "max": 8.8}})
mod("ar", "envelope", "AR", "TRANSIENT GENERATORS", "Attack and release only. A modulation choice everywhere and a VCA source.",
    ["ar.gate_in"], ["ar.out"], {"stages": ["attack", "release"], "output_v": {"min": 0, "max": 6.5}})
mod("vca", "vca", "VCA", "VCA", "Output amplifier driven by the ADSR or AR, or bypassed for a constant level. VCA CV input.",
    ["vca.in", "vca.env_in", "vca.cv_in"], ["vca.out"])
mod("output", "output", "Output", "VCA", "Volume, 3.5 mm main out and phones on top, high and low level 1/4-inch outputs on the rear.",
    ["output.in"], ["output.main", "output.phones", "output.high", "output.low"])
D["modules"] = M

# parameters ----------------------------------------------------------------
par("pitch.bend", "pitch", "PITCH BEND", "continuous", "Bends pitch up or down by an octave.", ref=1, panel_scale={"min": -1, "max": 1, "unit": "octaves"}, bipolar=True)
par("pitch.octave_shift", "pitch", "OCTAVE SHIFT", "enum", "Shifts pitch by up to 2 octaves.", ref=2, access=SW,
    values=[{"value": 2, "label": "+2"}, {"value": 0, "label": "0"}, {"value": -2, "label": "-2"}])
par("pitch.glide", "pitch", "GLIDE", "continuous", "Glide time between notes; none at MIN.", ref=3, panel_scale=S10)
par("lfo.rate", "lfo", "LFO FREQ", "continuous", "LFO rate, which also sets the ADSR repeat rate and the sample-and-hold rate.", ref=4,
    panel_scale=S10, physical={"min": 0.03, "max": 30, "unit": "Hz", "taper": "unknown"})
par("vco1.coarse", "vco1", "FREQUENCY (COARSE)", "continuous", "Approximate tuning of VCO1.", ref=6, access=KN, panel_scale=S10,
    physical={"min": 0.2, "max": 2000, "unit": "Hz", "note": "panel scale; the specifications give 1 Hz to 38.5 kHz overall"})
par("vco1.fine", "vco1", "FREQUENCY (FINE)", "continuous", "Exact tuning of VCO1.", ref=6, access=KN, panel_scale={"min": -5, "max": 5}, bipolar=True)
par("pitch.keyboard_control", "pitch", "KEYBOARD CONTROL", "enum", "Which note VCO1 follows. VCO2 always plays the lowest note.", ref=7, access=SW,
    values=[{"value": "poly", "label": "POLY", "meaning": "VCO1 plays the highest note, duophonic"},
            {"value": "off", "label": "OFF", "meaning": "VCO1 ignores the keyboard"},
            {"value": "mono", "label": "MONO", "meaning": "VCO1 plays the lowest note, like VCO2"}])

GROUP1 = [{"value": "sine", "label": "sine", "meaning": "LFO sine, delayed"}, {"value": "square", "label": "square", "meaning": "LFO square"},
          {"value": "sh", "label": "S+H", "meaning": "sample and hold"}]


def group2(other):
    return [{"value": "adsr", "label": "ADSR"}, {"value": "ar", "label": "AR"}, {"value": other, "label": other.upper()}]


for tgt, refs in [("vco1", (8, 9)), ("vco2", (17, 18)), ("vcf", (24, 25))]:
    other = "vco2" if tgt == "vco1" else "vco1"
    par(f"{tgt}.mod1_source", tgt, "MODULATION SOURCE (LFO group)", "enum", "LFO sine, LFO square or sample-and-hold, into the left depth knob.",
        ref=refs[0], access=SW, values=GROUP1, note="Positions read from the panel; the guide says only that the switches patch different waveforms in.")
    par(f"{tgt}.mod1_depth", tgt, "MODULATION DEPTH (LFO group)", "continuous", "Depth of the LFO-group source.", ref=refs[1], access=KN, panel_scale=S10)
    par(f"{tgt}.mod2_source", tgt, "MODULATION SOURCE (envelope group)", "enum", f"ADSR, AR or {other.upper()}, into the right depth knob.",
        ref=refs[0], access=SW, values=group2(other))
    par(f"{tgt}.mod2_depth", tgt, "MODULATION DEPTH (envelope group)", "continuous", "Depth of the envelope-group source.", ref=refs[1], access=KN, panel_scale=S10)
par("vco1.pwm_source", "vco1", "PULSE WIDTH SOURCE", "enum", "Source for VCO1 pulse width: LFO sine, ADSR, or DC (the knob sets a fixed width).", ref=10, access=SW,
    values=[{"value": "sine"}, {"value": "adsr", "label": "ADSR"}, {"value": "dc", "label": "DC", "meaning": "no modulation; PULSE WIDTH sets the width"}])
par("vco1.pulse_width", "vco1", "PULSE WIDTH", "continuous", "Pulse width modulation depth, or the fixed width with DC selected.", ref=10, access=KN, panel_scale=S10)
for lab, key, r in [("SUB OCTAVE", "sub", 11), ("SAWTOOTH", "saw", 12), ("TRIANGLE", "tri", 13), ("PULSE", "pulse", 14)]:
    par(f"vco1.{key}_level", "vco1", lab, "continuous", f"Level of VCO1's {lab.lower()} in its mix.", ref=r, panel_scale=S10)
par("vco2.fine", "vco2", "FINE TUNE", "continuous", "VCO2 pitch.", ref=15, access=KN, panel_scale={"min": -5, "max": 5}, bipolar=True)
par("vco1.sync", "vco1", "SYNC", "enum", "Locks VCO1 to VCO2 so VCO1 follows VCO2's frequency. The panel shows two sync modes the guide does not explain.", ref=16, access=SW,
    values=[{"value": "mode_a", "label": "MODE A"}, {"value": "off", "label": "OFF"}, {"value": "mode_b", "label": "MODE B"}],
    note="Placed on VCO1 because VCO1 is the synced oscillator; the switch sits in the VCO2 section.")
for lab, key, r in [("SUB OCTAVE", "sub", 19), ("SQUARE WAVE", "square", 20), ("SAWTOOTH", "saw", 21)]:
    par(f"vco2.{key}_level", "vco2", lab, "continuous", f"Level of VCO2's {lab.lower()} in its mix.", ref=r, panel_scale=S10)
par("vcf.vco1_audio", "vcf", "VCO1 AUDIO", "boolean", "Off takes VCO1 out of the audio path entirely, leaving it free as a modulator.", ref=22, access=SW, values=ONOFF)
par("vcf.keyboard_control", "vcf", "KEYBOARD CONTROL", "continuous", "How closely cutoff follows the keyboard.", ref=23, access=KN, panel_scale={"min": 0, "max": 10, "unit": "OFF to MAX"})
par("vcf.fc", "vcf", "Fc", "continuous", "Cutoff; fully up passes all treble.", ref=26, panel_scale=S10)
par("vcf.q", "vcf", "Q", "continuous", "Resonance; fully up the filter oscillates and nothing else passes.", ref=27, panel_scale=S10)
for st, r in [("attack", 28), ("decay", 29), ("sustain", 30), ("release", 31)]:
    par(f"adsr.{st}", "adsr", st[0].upper(), "continuous", f"ADSR {st}. No time scale is given.", ref=r, panel_scale=S10)
par("ar.attack", "ar", "A (AR)", "continuous", "AR attack.", ref=32, panel_scale=S10)
par("ar.release", "ar", "R (AR)", "continuous", "AR release.", ref=32, panel_scale=S10)
par("gate_bus.repeat", "gate_bus", "ADSR REPEAT", "enum", "Retriggers the envelopes at the LFO rate.", ref=33, access=SW,
    values=[{"value": "gated", "label": "GATED", "meaning": "repeats only while a key is held"}, {"value": "off", "label": "OFF"},
            {"value": "auto", "label": "AUTO", "meaning": "repeats continuously"}])
par("sample_hold.source", "sample_hold", "SAMPLE + HOLD", "enum", "What the sample-and-hold samples.", ref=34, access=SW,
    values=[{"value": "vco1", "label": "VCO 1", "meaning": "VCO1's mix"}, {"value": "noise", "label": "NOISE", "meaning": "random steps"}])
par("lfo.delay", "lfo", "LFO DELAY", "continuous", "Time for the LFO sine to reach full depth after a key.", ref=35, panel_scale=S10,
    physical={"min": 0, "max": 5, "unit": "s", "note": "panel scale"})
par("vca.mode", "vca", "VCA", "enum", "What drives the VCA.", ref=50, access=SW,
    values=[{"value": "adsr", "label": "ADSR"}, {"value": "ar", "label": "AR"}, {"value": "bypass", "label": "BYPASS", "meaning": "constant level"}])
par("output.volume", "output", "VOLUME", "continuous", "Final output volume.", ref=51, access=KN, panel_scale=S10)
par("noise.level", "noise", "NOISE LEVEL", "continuous", "White noise into the filter.", ref=52, panel_scale=S10)
par("kbd.midi_channel", "kbd", "MIDI CHANNEL", "integer", "MIDI channel. Rear DIP switches, SysEx (for Eurorack use, where the switches are gone), or SynthTool.", ref=57,
    range={"min": 1, "max": 16}, access=[{"type": "rear_panel", "control": "dip_switches_x4"}, {"type": "sysex"}, {"type": "app", "note": "SynthTool.exe"}])
par("kbd.poly_chain", "kbd", "Poly chain", "boolean", "Chains CATs for more voices. Configured in SynthTool.exe.", access=[{"type": "app", "note": "SynthTool.exe"}], values=ONOFF)
par("output.power", "output", "POWER", "boolean", "Power switch.", ref=58, access=[{"type": "rear_panel", "control": "toggle_switch"}], values=ONOFF)
D["parameters"] = P

# ports ---------------------------------------------------------------------
jack("jack.vco1_cv", "VCO1 CV", 42, "patch_in", "in", "cv", "pitch.cv1_in", "External CV for VCO1 and VCO2 frequency.", combine="unknown", electrical={"min_v": -5, "max_v": 5})
jack("jack.gate_in", "GATE", 41, "patch_in", "in", "gate", "gate_bus.ext_in", "External gate, used by the GATED setting of ADSR REPEAT.", combine="unknown",
     electrical={"threshold_v": 2.1}, note="The guide ties this input to the GATED repeat mode only; whether it also gates the envelopes normally is not stated.")
jack("jack.vco2_cv", "VCO2 CV", 43, "patch_in", "in", "cv", "pitch.cv2_in", "External CV for VCO2 frequency.", combine="unknown", electrical={"min_v": -5, "max_v": 5})
jack("jack.vcf_fc", "VCF Fc", 44, "patch_in", "in", "cv", "vcf.fc_cv_in", "External CV for cutoff.", combine="sum", confidence="inferred", electrical={"min_v": -5, "max_v": 5})
jack("jack.vcf_q", "VCF Q", 45, "patch_in", "in", "cv", "vcf.q_cv_in", "External CV for resonance.", combine="sum", confidence="inferred", electrical={"min_v": 0, "max_v": 5})
jack("jack.ext_audio", "EXT AUDIO", 46, "patch_in", "in", "audio", "vcf.in_ext", "Line-level external audio into the filter.", combine="sum", electrical={"impedance_ohm": 100000})
jack("jack.vca_cv", "VCA CV", 47, "patch_in", "in", "cv", "vca.cv_in", "External CV for the VCA.", combine="sum", confidence="inferred", electrical={"min_v": 0, "max_v": 5})
jack("jack.kb_cv", "KB CV", 37, "patch_out", "out", "cv", "pitch.to_vco2", "Keyboard pitch CV for external devices.", electrical={"min_v": 0, "max_v": 8},
     note="Which of the two notes it carries is not stated; modelled as the low note, which VCO2 always plays.", confidence="inferred")
jack("jack.gate_out", "GATE", 38, "patch_out", "out", "gate", "gate_bus.out", "Gate output.", electrical={"low_v": 0, "high_v": 12})
jack("jack.adsr_out", "ADSR", 39, "patch_out", "out", "cv", "adsr.out", "ADSR output.", electrical={"min_v": 0, "max_v": 8.8})
jack("jack.ar_out", "AR", 40, "patch_out", "out", "cv", "ar.out", "AR output.", electrical={"min_v": 0, "max_v": 6.5})
jack("jack.phones", "PHONES", 48, "top", "out", "audio", "output.phones", "Headphones.", connector="3.5mm TRS", electrical={"max_level_dbu": -10.4, "impedance_ohm": 8})
jack("jack.main_out", "MAIN OUT", 49, "top", "out", "audio", "output.main", "Main output on 3.5 mm; the only output when fitted in Eurorack.", electrical={"max_level_dbu": 9.4})
jack("jack.usb", "USB", 53, "top", "bidirectional", "midi", None, "Class-compliant USB MIDI in and out.", connector="USB-B")
jack("jack.midi_in", "MIDI IN", 54, "top", "in", "midi", None, "MIDI from a keyboard, sequencer or computer.", connector="DIN-5")
jack("jack.midi_thru", "MIDI THRU", 55, "top", "out", "midi", None, "Passes MIDI IN on, for poly chain or other gear.", connector="DIN-5")
jack("jack.out_high", "MAIN OUT HIGH", 56, "rear", "out", "audio", "output.high", "Line-level mono output.", connector="6.35mm TS", electrical={"max_level_dbu": 10, "impedance_ohm": 1000})
jack("jack.out_low", "MAIN OUT LOW", 56, "rear", "out", "audio", "output.low", "Instrument-level mono output, 30 dB below HIGH, for guitar amplifiers.", connector="6.35mm TS", electrical={"impedance_ohm": 750})
jack("jack.dc_in", "DC INPUT", 59, "rear", "in", "power", None, "12 V DC, 1000 mA, from the supplied adaptor.", connector="barrel", electrical={"voltage_v": 12, "current_ma": 1000})
D["ports"] = J

# connections ---------------------------------------------------------------
con("c01", "kbd.low_note", "pitch.low_in", "cv", "fixed", amount="pitch.glide")
con("c02", "kbd.high_note", "pitch.high_in", "cv", "fixed", amount="pitch.glide")
con("c03", "kbd.bend", "pitch.bend_in", "cv", "fixed", amount="pitch.bend")
con("c04", "pitch.to_vco1_high", "vco1.pitch_in", "cv", "switched", enabled_when={"param": "pitch.keyboard_control", "equals": "poly"}, amount="vco1.coarse")
con("c05", "pitch.to_vco1_low", "vco1.pitch_in", "cv", "switched", enabled_when={"param": "pitch.keyboard_control", "equals": "mono"}, amount="vco1.coarse")
con("c06", "pitch.to_vco2", "vco2.pitch_in", "cv", "fixed", amount="vco2.fine")
con("c07", "pitch.to_vco2", "vcf.kbd_in", "cv", "fixed", amount="vcf.keyboard_control",
    note="Which note drives filter tracking in duophonic mode is not stated; the low note is assumed.", confidence="inferred")
con("c08", "vco2.sync_out", "vco1.sync_in", "sync", "switched", enabled_when={"param": "vco1.sync", "not_equals": "off"})
con("c10", "kbd.gate", "gate_bus.midi_in", "gate", "fixed")
con("c11", "lfo.clock", "gate_bus.clock_in", "clock", "switched", enabled_when={"param": "gate_bus.repeat", "not_equals": "off"})
con("c12", "gate_bus.out", "adsr.gate_in", "gate", "fixed")
con("c13", "gate_bus.out", "ar.gate_in", "gate", "fixed")
con("c14", "lfo.clock", "sample_hold.clock_in", "clock", "fixed")
con("c15", "vco1.out", "sample_hold.in_vco1", "cv_or_audio", "switched", enabled_when={"param": "sample_hold.source", "equals": "vco1"})
con("c16", "noise.out", "sample_hold.in_noise", "cv_or_audio", "switched", enabled_when={"param": "sample_hold.source", "equals": "noise"})
k = 20
for tgt in ("vco1", "vco2", "vcf"):
    other = "vco2" if tgt == "vco1" else "vco1"
    for src, node in [("sine", "lfo.sine"), ("square", "lfo.square"), ("sh", "sample_hold.out")]:
        con(f"c{k}", node, f"{tgt}.fm1_in", "cv", "switched", enabled_when={"param": f"{tgt}.mod1_source", "equals": src}, amount=f"{tgt}.mod1_depth"); k += 1
    for src, node in [("adsr", "adsr.out"), ("ar", "ar.out"), (other, f"{other}.out")]:
        con(f"c{k}", node, f"{tgt}.fm2_in", "cv_or_audio", "switched", enabled_when={"param": f"{tgt}.mod2_source", "equals": src}, amount=f"{tgt}.mod2_depth"); k += 1
con("c40", "lfo.sine", "vco1.pwm_in", "cv", "switched", enabled_when={"param": "vco1.pwm_source", "equals": "sine"}, amount="vco1.pulse_width")
con("c41", "adsr.out", "vco1.pwm_in", "cv", "switched", enabled_when={"param": "vco1.pwm_source", "equals": "adsr"}, amount="vco1.pulse_width")
con("c50", "vco1.out", "vcf.in_vco1", "audio", "switched", enabled_when={"param": "vcf.vco1_audio", "equals": True})
con("c51", "vco2.out", "vcf.in_vco2", "audio", "fixed")
con("c52", "noise.out", "vcf.in_noise", "audio", "fixed", amount="noise.level")
con("c53", "vcf.out", "vca.in", "audio", "fixed")
con("c54", "adsr.out", "vca.env_in", "cv", "switched", enabled_when={"param": "vca.mode", "equals": "adsr"})
con("c55", "ar.out", "vca.env_in", "cv", "switched", enabled_when={"param": "vca.mode", "equals": "ar"})
con("c56", "vca.out", "output.in", "audio", "fixed", amount="output.volume")
D["connections"] = C

D["indicators"] = [
    {"id": "lfo.led", "module": "lfo", "label": "LFO", "kind": "led", "led_colour": "red", "manual_ref": 5, "function": "Blinks at the LFO rate."},
    {"id": "output.power_led", "module": "output", "label": "POWER", "kind": "led", "led_colour": "multi", "manual_ref": 36,
     "function": "Power, and the poly chain state: amber in normal mode, red in poly chain mode while not playing, green in poly chain mode while playing."},
]
D["led_legend"] = {
    "rule": "The POWER LED reports system mode by colour. The LFO LED is a plain rate blinker.",
    "colours": [{"colour": "amber", "meaning": "normal mode"}, {"colour": "red", "meaning": "poly chain mode, not playing"},
                {"colour": "green", "meaning": "poly chain mode, playing"}],
    "confidence": "stated", "note": "From the System Mode table on the poly chain page.",
}

D["behaviours"] = [
    {"id": "b01", "name": "Duophonic assignment", "applies_to": ["kbd", "pitch", "vco1", "vco2"],
     "rule": "VCO2 always plays the lowest held note. KEYBOARD CONTROL on POLY sends VCO1 the highest held note, so two notes sound "
             "through one filter and VCA; on MONO VCO1 also plays the lowest; on OFF VCO1 ignores the keyboard and holds its own pitch. "
             "The envelopes and filter are shared, so this is paraphonic duophony, not two voices."},
    {"id": "b02", "name": "Switch-selected modulation groups", "applies_to": ["vco1", "vco2", "vcf"],
     "rule": "VCO1, VCO2 and the filter each have two three-way switches feeding two depth knobs. The left group picks LFO sine, "
             "LFO square or sample-and-hold; the right picks ADSR, AR or the other oscillator (VCO2 for VCO1, VCO1 for VCO2 and the "
             "filter). Audio-rate cross-modulation between the VCOs is therefore on the panel without patching."},
    {"id": "b03", "name": "Oscillator mixes", "applies_to": ["vco1", "vco2"],
     "rule": "Each VCO's waveforms are always running and each has a level slider; the oscillator's output is the sum. That sum is "
             "what reaches the filter, what the sample-and-hold samples in its VCO1 position, and what the other oscillator uses as "
             "a modulation source. Internal summing is recorded here rather than as connections."},
    {"id": "b04", "name": "VCO1 as a modulator", "applies_to": ["vco1", "vcf"],
     "rule": "VCO1 AUDIO off removes VCO1 from the filter while leaving it running, so with KEYBOARD CONTROL off it becomes a free "
             "audio-rate or sub-audio modulator for VCO2 and the filter."},
    {"id": "b05", "name": "Pulse width", "applies_to": ["vco1"],
     "rule": "Only VCO1 has variable pulse width. Its switch picks LFO sine, ADSR or DC; at DC the PULSE WIDTH knob sets a fixed "
             "width, otherwise it sets modulation depth."},
    {"id": "b06", "name": "LFO does three jobs", "applies_to": ["lfo", "sample_hold", "gate_bus"],
     "rule": "LFO FREQ sets the LFO, the sample-and-hold clock and the ADSR repeat rate together. LFO DELAY fades in the sine output "
             "only, after each key."},
    {"id": "b07", "name": "ADSR repeat", "applies_to": ["gate_bus", "adsr", "ar"],
     "rule": "GATED retriggers the envelopes at the LFO rate while a key is held; AUTO retriggers them continuously, which with the "
             "VCA on ADSR gives a self-playing pulse. The GATE input supplies the gate for GATED mode."},
    {"id": "b08", "name": "Filter self-oscillation", "applies_to": ["vcf"],
     "rule": "At full Q the filter oscillates and no other sound passes."},
    {"id": "b09", "name": "Sync", "applies_to": ["vco1", "vco2"],
     "rule": "VCO1 is locked to VCO2 and follows its frequency. The panel switch has MODE A, OFF and MODE B; the guide describes sync "
             "as a single on/off function and does not explain the two modes."},
]
D["midi"] = {
    "receives": ["note_on", "note_off", "cc123_all_notes_off", "pitch_bend", "sysex (MIDI channel)"],
    "transmits": ["MIDI THRU pass-through", "USB MIDI"],
    "channel": {"range": [1, 16], "set_by": "rear DIP switches, SysEx, or SynthTool.exe"},
    "message_table": [{"status": "8n", "description": "note off"}, {"status": "9n", "description": "note on"},
                      {"status": "Bn 7B", "description": "all notes off"}, {"status": "En", "description": "pitch bend, 0 to 3FFF"}],
    "cc_map": None, "nrpn": None, "sysex": "used for MIDI channel; the tables the guide refers to are not in this document",
    "usb": {"class_compliant": True, "os": "Windows XP or higher, Mac OS X 10.6.8 or higher"},
    "app": "SynthTool.exe: poly chain and MIDI channel",
}
D["specifications"] = {
    "voices": "duophonic", "oscillators": {"count": 2, "range_hz": {"min": 1, "max": 38500}, "ranges": "6 overlapping",
    "second_range_quoted_hz": {"min": 8, "max": 900, "note": "a second range in the table without a label"}},
    "lfo_hz": {"min": 0.03, "max": 30}, "vcf": "1 x 4-pole low pass, 24 dB/octave", "envelopes": ["ADSR", "AR"],
    "control_inputs_v": {"vco1_cv": [-5, 5], "vco2_cv": [-5, 5], "gate_threshold": 2.1, "vcf_fc": [-5, 5], "vcf_q": [0, 5], "vca_cv": [0, 5]},
    "control_outputs_v": {"kb_cv": [0, 8], "gate": [0, 12], "adsr": [0, 8.8], "ar": [0, 6.5]},
    "outputs": {"high": "1/4-inch TS, max +10 dBu, 1 kohm", "low": "1/4-inch TS, 30 dB below high, 750 ohm",
                "main_3_5mm": "max +9.4 dBu", "phones": "1/8-inch TRS, -10.4 dBu, 8 ohm"},
    "power": {"adaptor": "12 V DC, 1000 mA", "consumption_w_max": 6.2},
    "dimensions_mm": {"h": 93, "w": 374, "d": 136}, "eurorack_hp": 70, "weight_kg": 1.6,
}
D["omitted_from_source"] = ["safety and legal text in several languages", "warranty and compliance declarations", "Eurorack installation",
                            "non-English duplicates", "the MIDI channel DIP switch table"]
D["not_in_source"] = [
    "envelope times in seconds for either envelope",
    "what the MODE A and MODE B sync positions do",
    "which note drives KB CV and filter tracking in duophonic mode",
    "whether the GATE input gates the envelopes outside the GATED repeat mode",
    "whether VCO CV inputs sum with MIDI pitch or replace it",
    "the SysEx tables the guide refers to",
    "what the unlabelled 8 Hz to 900 Hz range in the specifications is",
    "the modulation switch positions, which appear only on the panel",
]
D["source_inconsistencies"] = [
    "Items 8, 17 and 24 describe the modulation switches only as patching 'different waveforms'; the positions (sine, square, S+H; ADSR, AR, VCO) are on the panel alone.",
    "Item 16 describes SYNC as on/off; the panel switch has MODE A, OFF and MODE B.",
    "The specifications quote two oscillator ranges, 1 Hz to 38.5 kHz and 8 Hz to 900 Hz, the second without a label; the coarse knob is marked 0.2 Hz to 2 kHz.",
    "Item 57 refers to 'MIDI SysEx tables later in this manual'; there are none.",
    "Item 50 expands AR as 'Attack=Release'.",
    "The poly chain page says the POWER LED turns red in poly chain mode; its own table adds green while playing.",
]
D["modelling_gaps"] = [
    {"topic": "Envelope times", "detail": "None given; sliders are marked only by their graphic."},
    {"topic": "Sync modes", "detail": "Two unexplained modes on the panel. The Octave CAT had one sync; the second is a Behringer addition or a hard/soft choice."},
    {"topic": "Cross-modulation depth", "detail": "VCO-to-VCO and VCO-to-filter modulation are on depth knobs with no scaling given."},
    {"topic": "Original instrument", "detail": "No Octave CAT documentation was supplied."},
]

# ---------------------------------------------------------------------------
# Octave CAT / CAT SRM owner's manual (OCR). Values apply to the original; the
# Behringer is assumed to follow the SRM, so they are marked inferred.
# ---------------------------------------------------------------------------
D["device"]["sources"].append({
    "id": "octave", "title": "Octave CAT Instruction Manual (with CAT SRM modifications and specifications)", "kind": "user_manual",
    "file": "Octave_Cat_Instruction_Manual.pdf", "pages": 38,
    "note": "Scanned, read by OCR at 300 dpi. Covers the original CAT (model 1853) and the later CAT SRM, with a separate "
            "specification sheet for each and a page of SRM changes. The Behringer matches the SRM (sine LFO, LFO delay, "
            "0.03 to 30 Hz, two-note memory), so SRM figures are used. Where OCR was unclear the value is noted."})
OCT = "Octave CAT SRM specification; assumed to carry over to the Behringer."
byid = {p["id"]: p for p in P}


def phys(pid, mn, mx, unit, extra=None):
    p = byid[pid]
    p["physical"] = {"min": mn, "max": mx, "unit": unit, "taper": "unknown", "note": OCT + (" " + extra if extra else "")}
    p["confidence"] = "inferred"
    p["function"] = p["function"].replace(" No time scale is given.", "")


phys("adsr.attack", 0.003, 6, "s", "The original CAT: 2 ms to 5 s.")
phys("adsr.decay", 0.002, 7, "s")
phys("adsr.sustain", 0, 100, "% of peak")
phys("adsr.release", 0.002, 7, "s")
phys("ar.attack", 0.003, 7, "s", "The original CAT: 2 ms to 7 s.")
phys("ar.release", 0.002, 7, "s", "The original CAT: 1 ms to 7 s.")
phys("vcf.keyboard_control", 0, 1, "V/octave", "At MAX the cutoff tracks at 1 V/octave, parallel to the oscillators, so a self-oscillating filter plays in tune.")
phys("vcf.fc", 5, 27000, "Hz", "OCR reads '52 = 27KHz'; read as about 5 Hz to 27 kHz. The original CAT: about 20 Hz to 20 kHz.")
phys("vcf.q", 0, 40, "Q (approximate maximum usable)")
phys("pitch.bend", -1, 1, "octaves", "Calibrated, with a click-stop dead band at centre.")
phys("pitch.glide", 0, 1.5, "s per octave", "Maximum about 1.5 s per octave. Glide completes even if the key is released.")
phys("vco2.fine", -1.25, 1.25, "octaves", "VCO2 tuning range about 2.5 octaves in total.")
byid["vco1.coarse"]["physical"] = {"min": 0.2, "max": 24000, "unit": "Hz", "taper": "unknown",
    "note": OCT + " 0.2 Hz to 24 kHz with keyboard control off (OCR '241Khe'), 0.2 Hz to 16 kHz with it on; coarse span about 12 octaves. "
            "The Behringer panel marks 0.2 Hz to 2 kHz and its specifications say 1 Hz to 38.5 kHz."}
byid["vco1.coarse"]["confidence"] = "inferred"
byid["vco1.pulse_width"]["function"] = ("With the switch at DC, sets a fixed width from square (fully counter-clockwise) to a narrow pulse "
                                        "(fully clockwise). Otherwise sets modulation depth; LFO sine PWM gives the classic chorus effect.")
byid["vco1.sync"]["function"] = ("Locks VCO1 to VCO2: VCO1 is forced to multiples of VCO2's frequency and VCO2 is unaffected. If VCO1 is tuned "
    "below VCO2 in sync, VCO1 produces no output. The Octave original had a single on/off sync; the Behringer's MODE A and MODE B are not explained.")
byid["sample_hold.source"]["values"][1]["meaning"] = "random steps; the SRM sampled pink noise"
byid["lfo.delay"]["physical"]["note"] = "Panel scale and the SRM manual both give 0 to 5 s."
byid["lfo.delay"]["function"] = ("Delayed vibrato: after each new note the LFO sine is silenced and fades up to full over this time. Trigger-"
    "sensitive, so every new note restarts it, and it applies at every sine position, including filter and PWM.")
for pid in ("vco1.mod1_source", "vco2.mod1_source", "vcf.mod1_source"):
    byid[pid]["note"] += " The Octave SRM manual confirms the LFO outputs are sine and square; the original CAT used triangle and square."

M_by = {m["id"]: m for m in M}
M_by["adsr"]["properties"].update({"attack_s": [0.003, 6], "decay_s": [0.002, 7], "sustain_pct": [0, 100], "release_s": [0.002, 7],
                                   "source_note": OCT})
M_by["ar"]["properties"].update({"attack_s": [0.003, 7], "release_s": [0.002, 7], "source_note": OCT})
M_by["vcf"]["properties"].update({"cutoff_hz": {"min": 5, "max": 27000, "note": OCT + " OCR uncertain at the low end."},
                                  "max_q": 40, "keyboard_tracking_v_per_oct": [0, 1]})
M_by["vco1"]["properties"]["frequency_hz_original"] = {"keyboard_off": [0.2, 24000], "keyboard_on": [0.2, 16000], "coarse_octaves": 12}
M_by["vco2"]["properties"]["tuning_range_octaves"] = 2.5

B = {b["id"]: b for b in D["behaviours"]}
B["b01"]["rule"] = (
    "VCO2 always plays the lowest held note. KEYBOARD CONTROL on POLY sends VCO1 the highest held note; on MONO both oscillators "
    "share one note memory with low-note priority; on OFF VCO1 ignores the keyboard. In POLY the SRM keyboard has a two-note "
    "memory: with one key down both VCOs play it; with two keys down VCO1 takes the upper and VCO2 the lower; release the upper "
    "key first and the interval is held after both are released; release the lower first and VCO2 jumps to the upper, so both "
    "play the same note, which makes fast trills possible. Because each oscillator has its own analogue memory, a single note held "
    "for a long time in POLY slowly drifts into beating; MONO avoids this. The filter and VCA are shared, so this is paraphonic.")
B["b01"]["confidence"] = "inferred"
B["b01"]["note"] = "Two-note memory behaviour from the Octave CAT SRM manual; assumed to be reproduced by the Behringer's firmware."
B["b09"]["rule"] = (
    "VCO1 is locked to VCO2 and forced to multiples of its frequency; VCO2 is unaffected. Each VCO1 waveform has its own sync "
    "timbre, so the audio level sliders shape the sync sound. Modulating VCO1 while synced steps through harmonics; the ADSR into "
    "VCO1 gives a vocal, filter-like sweep. If VCO1 is tuned below VCO2 while synced there is no VCO1 output. The Octave had one "
    "sync mode; the Behringer's MODE A and MODE B remain unexplained.")
D["behaviours"].extend([
    {"id": "b10", "name": "Sample and hold depends on the VCO1 mix", "applies_to": ["sample_hold", "vco1"],
     "rule": "In its VCO1 position the sample-and-hold samples VCO1's mixed output, so with all VCO1 level sliders down there is no "
             "S+H output. Raising one slider picks which waveform is sampled; mixing several makes stepped patterns from their sum.",
     "note": "From the Octave manual."},
    {"id": "b11", "name": "Reference tuning", "applies_to": ["pitch", "vco1", "vco2"],
     "rule": "With PITCH BEND and OCTAVE SHIFT at 0 and both VCO tuning controls at 12 o'clock, the second-octave A is about 440 Hz.",
     "confidence": "inferred", "note": "From the Octave manual."},
    {"id": "b12", "name": "Filter as an oscillator", "applies_to": ["vcf"],
     "rule": "At full Q the filter produces a low-distortion sine at the cutoff frequency. With KEYBOARD CONTROL at 1 V/octave it plays "
             "in tune from the keyboard. Intermediate keyboard settings give microtonal tracking, for example one octave of cutoff "
             "per two octaves of keyboard.", "note": "From the Octave manual."},
    {"id": "b13", "name": "Audio mix as a four-note sequencer", "applies_to": ["vco1", "sample_hold"],
     "rule": "The Octave manual describes mixing VCO1's sub-octave square with its pulse at sub-audio rates and sampling the result to "
             "get a repeating four-step pattern, which is why the oscillator mix is also a control source.",
     "note": "From the Octave manual; exact recipe on page 24, partly unreadable in the scan."},
])

D["not_in_source"] = [
    "what the MODE A and MODE B sync positions do; the Octave original had one sync mode",
    "which note drives KB CV and filter tracking in duophonic mode; the Octave manual does not say either",
    "whether the GATE input gates the envelopes outside the GATED repeat mode",
    "whether VCO CV inputs sum with MIDI pitch or replace it",
    "the SysEx tables the Behringer guide refers to",
    "what the unlabelled 8 Hz to 900 Hz range in the Behringer specifications is; nothing in the Octave specifications matches it",
    "envelope and filter figures for the Behringer itself: the values now in this file are the Octave SRM's",
]
D["source_inconsistencies"] += [
    "The Behringer panel marks VCO1 coarse as 0.2 Hz to 2 kHz, its specifications say 1 Hz to 38.5 kHz, and the Octave SRM gives 0.2 Hz to 24 kHz (16 kHz with keyboard on).",
    "The original CAT's LFO was triangle and square; the SRM and the Behringer use sine and square.",
    "The Octave SRM sample-and-hold sampled pink noise; the Behringer guide says the noise generator, which elsewhere is white.",
    "The Octave manual's two specification sheets differ: ADSR attack 2 ms to 5 s (CAT) against 3 ms to 6 s (SRM), glide 2 s per octave against 1.5, filter 20 Hz to 20 kHz against about 5 Hz to 27 kHz.",
]
D["modelling_gaps"] = [
    {"topic": "Carried-over figures", "detail": "Envelope times, filter range and Q, tracking scale, glide and bend now come from the "
     "Octave CAT SRM. They describe the original circuit; Behringer's reproduction is likely close but unconfirmed."},
    {"topic": "Tapers", "detail": "End points are known for most controls now; the slider laws between them are not."},
    {"topic": "Sync modes", "detail": "The Behringer adds a second sync mode not present on the Octave. Likely a hard/soft choice; unconfirmed."},
    {"topic": "Two-note memory", "detail": "Modelled as the SRM's behaviour. Whether the Behringer's digital note handling reproduces "
     "the slow drift and beating of the analogue memories is unknown."},
    {"topic": "OCR", "detail": "The Octave manual was read by OCR. The low end of the filter range and the VCO1 maximum are the least certain readings."},
]

# ---------------------------------------------------------------------------
# Online research, 24 September 2026. Community and retailer sources: every
# fact taken from them is marked inferred and cites its source id.
# ---------------------------------------------------------------------------
D["device"]["sources"] += [
    {"id": "maffez", "title": "Some Modifications for the Behringer CAT Synthesizer (maffez, V1, May 2022)", "kind": "circuit_analysis",
     "file": "https://maffez.com/wp-content/uploads/2022/05/Behringer_Cat_Modifications_V1.pdf",
     "note": "A modder's circuit notes from opening a Behringer CAT and comparing it with the CAT SRM service manual. Source for the filter "
             "and VCA chips, the digital glide, the summing of the VCO CV inputs and the S&H clocking."},
    {"id": "forums", "title": "Gearspace 'Behringer - The Cat' thread and Mod Wiggler 'Introducing the CAT Synthesizer' thread", "kind": "other",
     "file": "https://gearspace.com/threads/behringer-the-cat.1226541/ ; https://www.modwiggler.com/forum/viewtopic.php?t=225491",
     "note": "Owner reports, including a former Behringer tester. Source for what the two sync modes do, the SRM II lineage, and the "
             "note priority setting."},
    {"id": "retail", "title": "Behringer product page and retailer descriptions (Perfect Circuit, B&H, ModularGrid)", "kind": "other",
     "file": "https://www.behringer.com/en/products/0718-AAH ; https://www.perfectcircuit.com/behringer-cat.html",
     "note": "Confirm the SRM II basis and describe the GATE input as triggering the envelopes."},
]
D["device"]["based_on"] = (
    "Octave CAT SRM II (USA, early 1980s), the last CAT revision, with CEM3340 VCOs and an SSM2044 filter. Behringer's own product "
    "text calls it an 'authentic reproduction of original CAT SRM II circuitry'. The Octave manual supplied covers the earlier CAT "
    "and CAT SRM, so figures carried over from it are one revision removed.")

byid = {p["id"]: p for p in P}
M_by = {m["id"]: m for m in M}

sync = byid["vco1.sync"]
sync["values"] = [
    {"value": "mode_a", "label": "MODE A", "meaning": "hard sync with VCO1 switched off for half of each VCO2 cycle: harsher and glitchier"},
    {"value": "off", "label": "OFF"},
    {"value": "mode_b", "label": "MODE B", "meaning": "conventional hard sync, the original CAT's single mode"}]
sync["function"] = ("Locks VCO1 to VCO2: VCO1 is forced to multiples of VCO2's frequency and VCO2 is unaffected; VCO1 tuned below VCO2 gives "
    "no output. MODE B is conventional hard sync. MODE A additionally gates VCO1 off for half of every VCO2 cycle, which is why owners "
    "describe it as glitchy. The second mode arrived with a later Octave revision.")
sync["confidence"] = "inferred"
sync["note"] = ("Mode descriptions from owner reports on Gearspace and a demonstration video they quote; Behringer has published nothing. One "
                "early video called A hard and B soft sync, which the later and more detailed reports contradict. Placed on VCO1 because VCO1 "
                "is the synced oscillator; the switch sits in the VCO2 section.")

g = byid["pitch.glide"]
g["function"] = ("Glide between MIDI notes. Implemented digitally in the MIDI-to-CV converter, so it has no effect on pitch arriving at the "
                 "VCO CV inputs. Maximum about 1.5 s per octave on the Octave original; completes even if the key is released.")
g["note"] = "Digital, MIDI-only glide from the maffez circuit notes (the slider sends 0 to 3.3 V to the CPU) and owner reports on Mod Wiggler."

P.append({"id": "kbd.note_priority", "module": "kbd", "label": "Note priority (held note setting)", "kind": "enum",
          "access": [{"type": "app", "note": "SynthTool / SynthTRIBE"}],
          "values": [{"value": "low", "label": "Low note", "meaning": "default"}, {"value": "last", "label": "Last note"}],
          "default": "low",
          "function": "Note priority in duophonic (POLY) mode, set in Behringer's app. MONO stays low-note priority regardless.",
          "confidence": "inferred",
          "note": "From an owner report on Mod Wiggler and Behringer's 'Voice Priority selection' marketing line; the guide does not mention it."})

M_by["vcf"]["properties"]["chip"] = "V2044 (CoolAudio SSM2044 clone), 4-pole"
M_by["vcf"]["description"] += " The filter chip is a V2044, CoolAudio's SSM2044 clone, as on the SRM II."
M_by["vco1"]["properties"]["chip"] = "CEM3340 type (CoolAudio V3340)"
M_by["vco2"]["properties"]["chip"] = "CEM3340 type (CoolAudio V3340)"
M_by["vca"]["properties"] = {"chip": "V13700 OTA (in place of the original CA3080)"}
M_by["lfo"]["description"] += (" Internally it also generates a triangle, which is not brought out. The square swings about plus and minus "
                               "12 V, and its rising edge clocks the sample-and-hold.")
M_by["gate_bus"]["description"] = (
    "Delivers the gate to both envelopes. ADSR REPEAT set to GATED retriggers the envelopes at the LFO rate while a key is held; AUTO "
    "retriggers them continuously. The GATE input jack feeds external gates into the same circuit, so it triggers the envelopes from "
    "a sequencer; the guide mentions it only in connection with GATED repeat.")

for jid in ("jack.vco1_cv", "jack.vco2_cv"):
    j = next(x for x in J if x["id"] == jid)
    j["combine"] = "sum"
    j["confidence"] = "inferred"
    j["note"] = "The jacks reach the oscillators through 100 kohm summing resistors (maffez circuit notes), so external CV adds to the MIDI pitch."
jg = next(x for x in J if x["id"] == "jack.gate_in")
jg["function"] = "External gate for the envelopes, for example from a sequencer. The guide ties it to the GATED repeat mode; retailers and the circuit notes describe it as a general envelope gate."
jg["confidence"] = "inferred"
jg.pop("note", None)

B = {b["id"]: b for b in D["behaviours"]}
B["b09"]["rule"] = (
    "VCO1 is locked to VCO2 and forced to multiples of its frequency; VCO2 is unaffected. Each VCO1 waveform has its own sync timbre, so "
    "the level sliders shape the sync sound. MODE B is conventional hard sync; MODE A also gates VCO1 off for half of each VCO2 cycle, "
    "giving a rougher, gappier tone. If VCO1 is tuned below VCO2 while synced there is no VCO1 output. Owners find CAT sync less "
    "'classic' than a Minimoog or Prophet sweep; that is the design, not a fault.")
B["b09"]["confidence"] = "inferred"
D["behaviours"].append({
    "id": "b14", "name": "MIDI-only functions", "applies_to": ["pitch", "lfo"],
    "rule": "Glide is applied digitally to the MIDI note CV, so pitch arriving at the VCO CV inputs does not glide. Owners also report LFO "
            "DELAY having no effect under external CV and gate, consistent with it being restarted by MIDI note triggers.",
    "confidence": "inferred", "note": "Glide from the maffez circuit notes; LFO delay from a single owner report, less certain."})

D["not_in_source"] = [
    "which note drives KB CV and filter tracking in duophonic mode; neither manual nor any online source found says",
    "what the unlabelled 8 Hz to 900 Hz range in the Behringer specifications refers to; not found online",
    "official Behringer documentation of the two sync modes; the descriptions in this file are from owner reports",
    "the SysEx tables the Behringer guide refers to",
    "SRM II figures specifically: the envelope, filter and range values in this file are from the earlier CAT SRM",
]
D["source_inconsistencies"].append(
    "Sources disagree on which Octave revisions had which parts: one Gearspace post gives the SRM an SSM2044 filter, a former Behringer tester "
    "on Mod Wiggler gives the SRM I an SSM2040. All agree the SRM II, which Behringer copied, used CEM3340 VCOs and an SSM2044 filter.")
D["source_inconsistencies"].append("Early video demonstrations called sync MODE A hard and MODE B soft; later owner reports describe A as gated hard sync and B as normal hard sync.")
gaps = {gp["topic"]: gp for gp in D["modelling_gaps"]}
gaps["Sync modes"]["detail"] = ("MODE A (gated hard sync) and MODE B (hard sync) are now described from owner reports. The gating duty cycle and "
                                 "which VCO2 edge resets VCO1 are not documented.")
gaps["Carried-over figures"]["detail"] += (" They are also from the SRM, not the SRM II Behringer copied; the SRM II changed the VCOs to CEM3340s, "
                                           "which changes range and tracking behaviour.")

with open("/mnt/user-data/outputs/behringer-cat.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
