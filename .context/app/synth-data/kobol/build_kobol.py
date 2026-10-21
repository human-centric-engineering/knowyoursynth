#!/usr/bin/env python3
"""Assemble the Behringer Kobol Expander device file."""
import json

D = {"schema_version": "0.7.0"}

D["device"] = {
    "id": "behringer-kobol-expander",
    "manufacturer": "Behringer",
    "model": "Kobol Expander",
    "category": "monophonic analogue synthesizer, semi-modular, desktop / Eurorack",
    "based_on": "RSF Kobol Expander (France, late 1970s). The Behringer guide never names it; the panel layout, the "
                "morphing oscillator waveforms and the per-oscillator VCAs are the Kobol's.",
    "sources": [
        {"id": "kobol", "title": "KOBOL EXPANDER Quick Start Guide", "kind": "quick_start_guide",
         "file": "Behringer_KOBOL-EXPANDER_manual.pdf", "pages": 38,
         "note": "66 numbered controls with one-line descriptions, a Hints and Tips box, a getting-started page and a "
                 "specifications table. English controls are on pages 26 to 28. No CC map, no envelope times."},
        {"id": "panel", "title": "Kobol Expander front panel image", "kind": "measurement",
         "file": "Behringer_KOBOL-EXPANDER.png",
         "note": "Used for control ranges printed on the panel (VCO 10 Hz to 10 kHz, VCF 16 Hz to 16 kHz, voltage "
                 "processor gains 0 to 2), the signal-flow lines, and the LED colours."},
    ],
}

D["architecture"] = {
    "synthesis": "subtractive",
    "signal_path": "analogue",
    "voices": 1,
    "polyphony_mode": "monophonic; poly chain across multiple units through the SynthTRIBE app",
    "poly_chain_max_units": None,
    "patch_memory": False,
    "semi_modular": True,
    "panel_counts": {"knobs": 25, "switches": 6, "jacks_3_5mm": 36},
    "summary": (
        "Two VCOs, each with a waveform control that morphs continuously from triangle through ramp and sawtooth to "
        "square and pulse, with pulse width modulation from the LFO, the filter envelope or both at the pulse end. "
        "Each VCO has its own VCA for level, and both feed a 24 dB/octave low-pass filter that self-oscillates. A "
        "second VCA shaped by its own ADS envelope follows the filter. One LFO (triangle or square, 0.01 to 100 Hz) "
        "is normalled to both oscillators' pitch, with a switch to exempt VCO1. A noise generator, a two-input voltage "
        "processor with a normal and an inverted output, and 30 CV and audio patch points: almost every knob has a "
        "matching CV input, including both waveform controls and all six envelope stages."
    ),
}

M = []


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m["inputs"] = inputs
    m["outputs"] = outputs
    M.append(m)


mod("kbd", "midi_to_cv", "MIDI interface", "MIDI IN",
    "Converts MIDI notes to pitch and gate. There is no keyboard; notes arrive on the top-panel MIDI IN or over USB.",
    [], ["kbd.pitch", "kbd.gate"])
mod("pitch_bus", "pitch_control", "Pitch and tune", "TUNE",
    "Combines the MIDI pitch with the external 1 V/octave CV IN and the master tune, and feeds both oscillators and "
    "the filter's keyboard tracking.",
    ["pitch_bus.midi_in", "pitch_bus.cv_in"], ["pitch_bus.out"])
mod("gate_bus", "gate_logic", "Gate routing", "GATE IN",
    "Delivers the gate that fires both envelopes. MIDI note gate by default; the GATE IN jack substitutes an external "
    "gate, for example from an analogue sequencer. Polarity can be inverted in SynthTRIBE. The GATE LED shows it.",
    ["gate_bus.in"], ["gate_bus.out"])
mod("lfo", "lfo", "LFO", "LFO",
    "Triangle or square, 0.01 to 100 Hz, with a rate CV input. One output is scaled by the LFO VOLUME knob, the other "
    "is unattenuated. The scaled output is normalled to the oscillators' modulation input.",
    ["lfo.rate_cv_in"], ["lfo.out", "lfo.out_raw"],
    {"rate_hz": {"min": 0.01, "max": 100}, "shapes": ["triangle", "square"]})
mod("mod_bus", "modulation_bus", "VCO modulation routing", "VCO MOD IN",
    "Distributes the pitch modulation (the LFO via LFO VOLUME unless VCO MOD IN is patched) to both oscillators, with "
    "VCO 1 MOD OFF removing VCO1 from it. Also holds the switch that picks the pulse-width modulation source.",
    ["mod_bus.in"], ["mod_bus.out"])
for n in (1, 2):
    ins = [f"vco{n}.pitch_in", f"vco{n}.freq_cv_in", f"vco{n}.fm_in", f"vco{n}.wave_cv_in", f"vco{n}.pwm_in"]
    outs = [f"vco{n}.out"]
    if n == 1:
        outs.append("vco1.sync_out")
    else:
        ins.append("vco2.sync_in")
    mod(f"vco{n}", "oscillator", f"VCO {n}", f"VCO {n}",
        "Analogue VCO whose single WAVEFORM control morphs continuously from triangle through ramp and sawtooth to "
        "square and pulse; at fully clockwise the pulse width follows the selected PWM source. Frequency, waveform "
        "and level each have a CV input." + (" Can be hard-synced to VCO1, and has the fine BEAT control against it." if n == 2 else ""),
        ins, outs,
        {"waveform_morph": ["triangle", "ramp", "sawtooth", "square", "pulse"],
         "frequency_hz": {"min": 10, "max": 10000, "note": "panel scale, 440 Hz at centre; the guide says plus or minus 2 octaves"}})
    mod(f"vca{n}", "vca", f"VCO {n} VCA", f"VCA (VCO {n})",
        f"Level control for VCO {n} before the filter, set by its VOLUME knob and a CV input. This is how the two "
        "oscillators are mixed, and why the mix can be voltage controlled.",
        [f"vca{n}.in", f"vca{n}.cv_in"], [f"vca{n}.out"])
mod("vcf", "filter", "VCF", "VCF",
    "24 dB/octave low-pass filter. Self-oscillates at the top of the resonance range. Keyboard tracking from 0 to "
    "200%, envelope depth from ADS 2, and CV inputs for frequency, resonance and envelope depth. Takes both VCO VCAs "
    "and an external audio input.",
    ["vcf.in_vco1", "vcf.in_vco2", "vcf.in_ext", "vcf.kbd_in", "vcf.env_in", "vcf.freq_cv_in", "vcf.res_cv_in", "vcf.env_amount_cv_in"],
    ["vcf.out"],
    {"slope_db_per_octave": 24, "modes": ["lowpass"], "cutoff_hz": {"min": 16, "max": 16000, "note": "panel scale"},
     "self_oscillates": True})
for n, role in [(1, "the output VCA"), (2, "the filter")]:
    mod(f"ads{n}", "envelope", f"ADS {n}", f"ADS {n}",
        f"Attack, decay and sustain envelope driving {role}. There is no release control: DECAY sets both the decay and "
        "the release time. Every stage has its own CV input." + (" DECAY OFF forces decay and release to zero." if n == 1 else ""),
        [f"ads{n}.gate_in", f"ads{n}.attack_cv_in", f"ads{n}.decay_cv_in", f"ads{n}.sustain_cv_in"], [f"ads{n}.out"],
        {"stages": ["attack", "decay (also release)", "sustain"]})
mod("vca", "vca", "Output VCA", "VCA",
    "Amplifier after the filter, opened by ADS 1.",
    ["vca.in", "vca.env_in"], ["vca.out"])
mod("noise", "noise", "Noise generator", "NOISE GENERATOR",
    "White or pink noise, patch-only: the panel draws its line to the NOISE OUT jack and nowhere else.",
    [], ["noise.out"])
mod("volt_proc", "summer", "Voltage processor", "VOLTAGE PROCESSOR",
    "Two-input voltage processor. Input 1 carries +10 V DC unless something is patched, scaled by IN 1 GAIN; input 2 "
    "has a fixed gain of 2. The sum is scaled by OUT GAIN and available normal and inverted. With nothing patched it "
    "is a manual offset voltage source.",
    ["volt_proc.in1", "volt_proc.in2"], ["volt_proc.out", "volt_proc.rev_out"])
mod("output", "output", "Output", "VOLUME",
    "Master volume feeding the 3.5 mm front and 6.35 mm rear audio outputs and the headphone socket.",
    ["output.in"], ["output.main", "output.phones"])

D["modules"] = M

P = []
KN = [{"type": "panel", "control": "knob"}]
SW = [{"type": "panel", "control": "slide_switch"}]
BT = [{"type": "panel", "control": "button"}]
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
S10 = {"min": 0, "max": 10}


def par(id, module, label, kind, function, ref=None, access=None, **kw):
    p = {"id": id, "module": module, "label": label}
    if ref is not None:
        p["manual_ref"] = ref
    p["kind"] = kind
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = access or KN
    p["function"] = function
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


par("lfo.rate", "lfo", "RATE", "continuous", "LFO rate.", ref=17, panel_scale=S10,
    physical={"min": 0.01, "max": 100, "unit": "Hz", "taper": "logarithmic (panel marked 0.01, 0.1, 1, 10, 100)"})
par("lfo.volume", "lfo", "VOLUME (LFO)", "continuous", "Attenuates the LFO's modulation of the VCOs and its OUT 1 output.", ref=18, panel_scale=S10)
par("lfo.waveform", "lfo", "LFO", "enum", "LFO waveform.", ref=29, access=SW,
    values=[{"value": "triangle"}, {"value": "square"}])
par("pitch_bus.tune", "pitch_bus", "TUNE", "continuous", "Master tune, plus or minus 50 cents.", ref=19,
    panel_scale={"min": -5, "max": 5}, physical={"min": -50, "max": 50, "unit": "cents"}, bipolar=True)
par("mod_bus.vco1_mod_off", "mod_bus", "VCO 1 MOD OFF", "boolean", "Removes VCO1 from the pitch modulation, leaving it on VCO2 only.", ref=30, access=SW, values=ONOFF)
par("mod_bus.pwm_source", "mod_bus", "LFO / BOTH / ADS", "enum", "Source of pulse width modulation for both VCOs at the pulse end of their waveform controls.", ref=32, access=SW,
    values=[{"value": "lfo", "label": "LFO"}, {"value": "both", "label": "Both"}, {"value": "ads", "label": "ADS", "meaning": "the VCF envelope, ADS 2"}])
for n in (1, 2):
    par(f"vco{n}.frequency", f"vco{n}", "FREQUENCY", "continuous", f"Base frequency of VCO {n}.", ref=20, panel_scale=S10,
        physical={"min": 10, "max": 10000, "unit": "Hz", "taper": "logarithmic", "note": "panel scale 10 Hz to 10 kHz with 440 Hz at centre; the guide says plus or minus 2 octaves"})
    par(f"vco{n}.waveform", f"vco{n}", "WAVEFORM", "morph",
        f"Morphs VCO {n}'s wave continuously from triangle through ramp and sawtooth to square and pulse. At fully clockwise the pulse width follows the PWM source switch.",
        ref=21, panel_scale=S10,
        values=[{"value": "triangle"}, {"value": "ramp"}, {"value": "sawtooth"}, {"value": "square"}, {"value": "pulse", "meaning": "fully clockwise; width modulated by the selected PWM source"}])
    par(f"vca{n}.level", f"vca{n}", "VOLUME", "continuous", f"Level of VCO {n} into the filter.", ref=22, panel_scale=S10)
par("vco2.beat", "vco2", "VCO 2 BEAT", "continuous", "Fine tuning of VCO2 against VCO1, for beating and detune.", ref=37, panel_scale={"min": -5, "max": 5}, bipolar=True)
par("vco2.sync", "vco2", "SYNCHRO", "boolean", "Hard-syncs VCO2 to VCO1.", ref=31, access=SW, values=ONOFF)
par("vcf.frequency", "vcf", "VCF FREQ", "continuous", "Filter cutoff.", ref=23, panel_scale=S10,
    physical={"min": 16, "max": 16000, "unit": "Hz", "taper": "logarithmic"})
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Emphasis at cutoff; self-oscillates at the top of the range, marked OSC on the panel.", ref=24, panel_scale=S10)
par("vcf.keyb_ctrl", "vcf", "KEYB CTRL / STEP LENGTH", "continuous", "Keyboard tracking of cutoff from 0 to 200% (2 V/octave). The STEP LENGTH half of the label is not explained.", ref=38,
    panel_scale={"min": 0, "max": 2, "unit": "V/octave"}, physical={"min": 0, "max": 200, "unit": "%"})
par("vcf.ads_ctrl", "vcf", "ADS CONTROL", "continuous", "Depth of ADS 2 on cutoff. The panel scale runs 5 to 0 to 5, which suggests a bipolar control; the guide does not say.", ref=39,
    panel_scale={"min": -5, "max": 5}, bipolar=True, confidence="inferred")
for n, refs, env in [(1, (25, 26, 27), "VCA"), (2, (40, 41, 42), "VCF")]:
    par(f"ads{n}.attack", f"ads{n}", "ATTACK", "continuous", f"Attack time of the {env} envelope. No time scale given.", ref=refs[0], panel_scale={"min": 1, "max": 10})
    par(f"ads{n}.decay", f"ads{n}", "DECAY", "continuous", f"Decay and release time of the {env} envelope.", ref=refs[1], panel_scale={"min": 1, "max": 10})
    par(f"ads{n}.sustain", f"ads{n}", "SUSTAIN", "continuous", f"Sustain level of the {env} envelope.", ref=refs[2], panel_scale=S10)
par("ads1.decay_off", "ads1", "DECAY OFF", "boolean", "Temporarily sets the VCA envelope's decay (and so release) to zero.", ref=33, access=SW, values=ONOFF,
    note="The specifications call this 'ADS 2 Decay Off'. The guide assigns it to the VCA envelope, which is ADS 1.")
par("output.volume", "output", "VOLUME", "continuous", "Overall output level.", ref=34, panel_scale=S10)
par("volt_proc.in1_gain", "volt_proc", "IN 1 GAIN", "continuous", "Scales voltage processor input 1, which is +10 V unless patched.", ref=35, panel_scale={"min": 0, "max": 2, "unit": "gain"})
par("volt_proc.out_gain", "volt_proc", "OUT GAIN", "continuous", "Scales the voltage processor's output.", ref=36, panel_scale={"min": 0, "max": 2, "unit": "gain"})
par("noise.colour", "noise", "WHITE / PINK", "enum", "Noise colour.", ref=28, access=SW, values=[{"value": "white"}, {"value": "pink"}])
par("gate_bus.invert", "gate_bus", "Gate polarity", "boolean", "Inverts the GATE IN polarity for sequencers that use inverted gates. Set in SynthTRIBE only.",
    access=[{"type": "app", "note": "SynthTRIBE"}], values=ONOFF)
par("kbd.poly_chain", "kbd", "Poly chain", "boolean", "Chains multiple Expanders for polyphony. Set up in SynthTRIBE.", access=[{"type": "app", "note": "SynthTRIBE"}], values=ONOFF)
par("kbd.midi_channel", "kbd", "MIDI CHANNEL DIP SWITCH", "integer", "MIDI receive channel, four rear DIP switches; table in the guide.", ref=62,
    range={"min": 1, "max": 16}, access=[{"type": "rear_panel", "control": "dip_switches_x4"}])
par("output.power", "output", "POWER SWITCH", "boolean", "Power on and off. The specifications describe both a top-panel slider and a rear push button.", ref=65,
    access=[{"type": "rear_panel", "control": "button"}], values=ONOFF)

D["parameters"] = P

D["indicators"] = [
    {"id": "lfo.rate_led", "module": "lfo", "label": "LFO rate", "kind": "led", "led_colour": "red", "manual_ref": None, "function": "Blinks at the LFO rate. Shown on the panel, not described in the guide."},
    {"id": "gate_bus.gate_led", "module": "gate_bus", "label": "Gate", "kind": "led", "led_colour": "red", "manual_ref": None, "function": "Lit while a gate is present."},
    {"id": "output.power_led", "module": "output", "label": "Power", "kind": "led", "led_colour": "green", "manual_ref": None, "function": "Lit when the unit is on."},
]
D["led_legend"] = {
    "rule": "Green is power; red is activity (LFO rate, gate).",
    "colours": [{"colour": "green", "meaning": "power"}, {"colour": "red", "meaning": "activity: LFO cycle, gate present"}],
    "confidence": "inferred",
    "note": "From the panel image. The guide lists a power LED in the specifications and describes none of the others.",
}

J = []


def jack(id, label, ref, loc, direction, signal, node, function, connector="3.5mm TS", combine=None, electrical=None, confidence=None, note=None):
    j = {"id": id, "label": label, "manual_ref": ref, "location": loc, "direction": direction, "signal": signal,
         "connector": connector, "node": node}
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


PI, PO = "patch_in", "patch_out"
jack("jack.lfo_rate_in", "LFO RATE", 1, PI, "in", "cv", "lfo.rate_cv_in", "CV control of LFO rate.", combine="sum", confidence="inferred")
jack("jack.lfo_out1", "LFO OUT 1", 2, PO, "out", "cv", "lfo.out", "LFO output, scaled by LFO VOLUME.")
jack("jack.lfo_out2", "LFO OUT 2", 3, PO, "out", "cv", "lfo.out_raw", "Unattenuated LFO output.")
jack("jack.vco_mod_in", "VCO MOD IN", 4, PI, "in", "cv", "mod_bus.in", "External modulation of both VCOs, replacing the LFO normal.", combine="replace")
for n, (f, w, v, o) in {1: (5, 6, 7, 8), 2: (49, 50, 51, 52)}.items():
    jack(f"jack.vco{n}_freq_in", f"VCO {n} FREQ", f, PI, "in", "cv", f"vco{n}.freq_cv_in", f"CV control of VCO {n} frequency.", combine="sum", confidence="inferred")
    jack(f"jack.vco{n}_wave_in", f"VCO {n} WAVEFORM", w, PI, "in", "cv", f"vco{n}.wave_cv_in", f"CV control of VCO {n}'s waveform morph.", combine="sum", confidence="inferred")
    jack(f"jack.vco{n}_vol_in", f"VCO {n} VOLUME", v, PI, "in", "cv", f"vca{n}.cv_in", f"CV control of VCO {n}'s level into the filter.", combine="sum", confidence="inferred")
jack("jack.vco1_out", "VCO 1 OUT", 8, PO, "out", "audio", "vco1.out", "Unprocessed VCO1. Patching it does not interrupt VCO1's feed to the filter.")
jack("jack.vco2_insert_send", "VCO 2 OUT (tip)", 52, PO, "out", "audio", "vco2.out",
     "Unprocessed VCO2. Unlike VCO 1 OUT, plugging in cuts VCO2's feed to the filter. The jack is a TRS insert: tip is the VCO2 send.",
     note="One physical jack, modelled as a send and a return because the schema's direction is single-valued.")
jack("jack.vco2_insert_return", "VCO 2 OUT (ring)", 52, PI, "in", "audio", "vca2.in",
     "Ring of the VCO 2 OUT insert: a return into VCO2's path to the filter, per the guide's Y-cable tip. A mono plug grounds it, which is why patching cuts the feed.",
     combine="replace", confidence="inferred", note="Whether the return enters before or after VCO2's VCA is not stated; modelled before, since the send is 'unprocessed'.")
jack("jack.vcf_freq_in", "VCF FREQUENCY", 9, PI, "in", "cv", "vcf.freq_cv_in", "CV control of cutoff.", combine="sum", confidence="inferred")
jack("jack.res_in", "RESONANCE", 10, PI, "in", "cv", "vcf.res_cv_in", "CV control of resonance.", combine="sum", confidence="inferred")
jack("jack.gate_in", "GATE IN", 11, PI, "in", "gate", "gate_bus.in", "External gate for both envelopes, for example from an analogue sequencer.", combine="replace", confidence="inferred")
for n, (a, d, s, o) in {1: (12, 13, 14, 15), 2: (57, 58, 59, 56)}.items():
    env = "VCA" if n == 1 else "VCF"
    jack(f"jack.ads{n}_attack_in", f"ATTACK (ADS {n})", a, PI, "in", "cv", f"ads{n}.attack_cv_in", f"CV control of the {env} envelope attack time.", combine="sum", confidence="inferred")
    jack(f"jack.ads{n}_decay_in", f"DECAY (ADS {n})", d, PI, "in", "cv", f"ads{n}.decay_cv_in", f"CV control of the {env} envelope decay and release times.", combine="sum", confidence="inferred")
    jack(f"jack.ads{n}_sustain_in", f"SUSTAIN (ADS {n})", s, PI, "in", "cv", f"ads{n}.sustain_cv_in", f"CV control of the {env} envelope sustain level.", combine="sum", confidence="inferred")
    jack(f"jack.ads{n}_out", f"ADS {n} OUT", o, PO, "out", "cv", f"ads{n}.out", f"{env} envelope output.")
jack("jack.midi_in", "MIDI IN", 16, "top", "in", "midi", None, "MIDI into the Expander. Poly chain is set up in SynthTRIBE.", connector="DIN-5")
jack("jack.phones", "PHONES", 43, "top", "out", "audio", "output.phones", "Headphones.", connector="3.5mm TRS")
jack("jack.vp_in1", "IN 1", 44, PI, "in", "cv", "volt_proc.in1", "Voltage processor input 1, scaled by IN 1 GAIN. +10 V DC is present unless a jack is inserted.", combine="replace",
     electrical={"normalled_voltage_v": 10})
jack("jack.vp_in2", "IN 2", 45, PI, "in", "cv", "volt_proc.in2", "Voltage processor input 2, fixed gain of 2.", electrical={"gain": 2})
jack("jack.vp_out", "OUT", 46, PO, "out", "cv", "volt_proc.out", "Voltage processor output, scaled by OUT GAIN.")
jack("jack.vp_rev_out", "REV OUT", 47, PO, "out", "cv", "volt_proc.rev_out", "Inverted voltage processor output.")
jack("jack.noise_out", "NOISE OUT", 48, PO, "out", "audio", "noise.out", "Noise generator output.")
jack("jack.vcf_audio_in", "VCF AUDIO IN", 53, PI, "in", "audio", "vcf.in_ext", "External audio into the filter, alongside the VCOs.", combine="sum", confidence="inferred")
jack("jack.cv_in", "CV IN 1V/OCT", 54, PI, "in", "cv", "pitch_bus.cv_in", "External 1 V/octave pitch for both VCOs and the filter tracking.", combine="unknown")
jack("jack.ads_ctrl_in", "ADS CTRL", 55, PI, "in", "cv", "vcf.env_amount_cv_in", "CV control of the filter envelope depth.", combine="sum", confidence="inferred")
jack("jack.audio_out_mini", "AUDIO OUT", 60, "top", "out", "audio", "output.main", "Line-level output, 3.5 mm TS, front panel.")
jack("jack.audio_out_quarter", "AUDIO OUT", 61, "rear", "out", "audio", "output.main", "Line-level output, 6.35 mm TS, rear panel.", connector="6.35mm TS")
jack("jack.midi_thru", "MIDI THRU", 63, "rear", "out", "midi", None, "Mirror of MIDI IN.", connector="DIN-5")
jack("jack.usb", "USB", 64, "rear", "bidirectional", "midi", None, "USB MIDI, firmware updates and SynthTRIBE.", connector="USB-B",
     note="The specifications say USB Micro; the controls list says type B.")
jack("jack.dc_in", "DC IN", 66, "rear", "in", "power", None, "12 V DC from the supplied adaptor, 1000 mA.", connector="barrel", electrical={"voltage_v": 12, "current_ma": 1000})
D["ports"] = J

C = []


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


con("c01", "kbd.pitch", "pitch_bus.midi_in", "cv", "fixed", amount="pitch_bus.tune")
con("c02", "pitch_bus.out", "vco1.pitch_in", "cv", "fixed", amount="vco1.frequency")
con("c03", "pitch_bus.out", "vco2.pitch_in", "cv", "fixed", amount="vco2.frequency")
con("c04", "pitch_bus.out", "vcf.kbd_in", "cv", "fixed", amount="vcf.keyb_ctrl")
con("c05", "kbd.gate", "gate_bus.in", "gate", "normalled", broken_by="jack.gate_in")
con("c06", "gate_bus.out", "ads1.gate_in", "gate", "fixed")
con("c07", "gate_bus.out", "ads2.gate_in", "gate", "fixed")
con("c10", "lfo.out", "mod_bus.in", "cv", "normalled", broken_by="jack.vco_mod_in", note="The LFO reaches the VCOs through LFO VOLUME unless VCO MOD IN is patched.")
con("c11", "mod_bus.out", "vco1.fm_in", "cv", "switched", enabled_when={"param": "mod_bus.vco1_mod_off", "equals": False})
con("c12", "mod_bus.out", "vco2.fm_in", "cv", "fixed")
for n in (1, 2):
    con(f"c1{3 + (n - 1) * 2}", "lfo.out", f"vco{n}.pwm_in", "cv", "switched",
        enabled_when={"any": [{"param": "mod_bus.pwm_source", "equals": "lfo"}, {"param": "mod_bus.pwm_source", "equals": "both"}]},
        note="Only audible at the pulse end of the WAVEFORM control.")
    con(f"c1{4 + (n - 1) * 2}", "ads2.out", f"vco{n}.pwm_in", "cv", "switched",
        enabled_when={"any": [{"param": "mod_bus.pwm_source", "equals": "ads"}, {"param": "mod_bus.pwm_source", "equals": "both"}]})
con("c17", "vco1.sync_out", "vco2.sync_in", "sync", "switched", enabled_when={"param": "vco2.sync", "equals": True})
con("c20", "vco1.out", "vca1.in", "audio", "fixed")
con("c21", "vco2.out", "vca2.in", "audio", "normalled", broken_by="jack.vco2_insert_return", note="Broken by any plug in VCO 2 OUT; see the insert-jack ports.")
con("c22", "vca1.out", "vcf.in_vco1", "audio", "fixed", amount="vca1.level")
con("c23", "vca2.out", "vcf.in_vco2", "audio", "fixed", amount="vca2.level")
con("c24", "ads2.out", "vcf.env_in", "cv", "fixed", amount="vcf.ads_ctrl")
con("c25", "vcf.out", "vca.in", "audio", "fixed")
con("c26", "ads1.out", "vca.env_in", "cv", "fixed")
con("c27", "vca.out", "output.in", "audio", "fixed", amount="output.volume")
D["connections"] = C

D["behaviours"] = [
    {"id": "b01", "name": "Morphing waveforms", "applies_to": ["vco1", "vco2"],
     "rule": "Each VCO has one WAVEFORM knob and one waveform CV input that sweep continuously through triangle, ramp, "
             "sawtooth, square and pulse. Intermediate positions are valid timbres, not detents. At fully clockwise the pulse "
             "width is modulated by the source chosen on the LFO/BOTH/ADS switch."},
    {"id": "b02", "name": "Per-oscillator VCAs", "applies_to": ["vca1", "vca2", "vcf"],
     "rule": "Each VCO has its own VCA before the filter, set by its VOLUME knob and a CV input. The oscillator mix is "
             "therefore voltage controllable: an envelope or LFO into VCO 1 VOLUME and VCO 2 VOLUME crossfades them."},
    {"id": "b03", "name": "Pitch modulation normal", "applies_to": ["lfo", "mod_bus", "vco1", "vco2"],
     "rule": "The LFO, scaled by LFO VOLUME, is normalled to both VCOs' modulation input. VCO MOD IN replaces it. VCO 1 "
             "MOD OFF exempts VCO1, which with SYNCHRO on gives sync sweeps with a stable fundamental."},
    {"id": "b04", "name": "Asymmetric VCO outputs", "applies_to": ["vco1", "vco2"],
     "rule": "VCO 1 OUT is a tap; VCO1 still feeds the filter. VCO 2 OUT is a TRS insert: a mono plug takes VCO2 out and "
             "cuts it from the filter; a Y-cable (tip send, ring return) lets VCO2 be processed externally and returned."},
    {"id": "b05", "name": "ADS envelopes", "applies_to": ["ads1", "ads2"],
     "rule": "Both envelopes are attack, decay, sustain; DECAY also sets the release, as on a Minimoog. DECAY OFF on the "
             "VCA envelope zeroes decay and release for an organ-style gate. The gate input description calls them ASR."},
    {"id": "b06", "name": "Voltage processor", "applies_to": ["volt_proc"],
     "rule": "Out = OUT GAIN x (IN 1 GAIN x in1 + 2 x in2), with REV OUT its inverse. With nothing patched, in1 is +10 V, "
             "so OUT and REV OUT are manual positive and negative offsets. Gains are marked 0 to 2 on the panel.",
     "confidence": "inferred"},
    {"id": "b07", "name": "Everything is voltage controllable", "applies_to": ["vco1", "vco2", "vcf", "ads1", "ads2", "lfo"],
     "rule": "Almost every knob has a matching CV input: VCO frequency, waveform and level, filter frequency, resonance and "
             "envelope depth, every envelope stage, LFO rate. The guide suggests external modulation sources such as the "
             "Behringer Abacus. Whether each input sums with its knob or replaces it is not stated; sum is assumed."},
    {"id": "b08", "name": "Self-oscillating filter", "applies_to": ["vcf"],
     "rule": "The filter self-oscillates at the top of the resonance range. With KEYB CTRL at 100% (1 V/octave) it tracks "
             "pitch as a sine source. KEYB CTRL goes to 200%."},
    {"id": "b09", "name": "Refiltering and fuzz", "applies_to": ["vcf"],
     "rule": "The guide suggests feeding one of the Expander's own outputs back into VCF AUDIO IN to refilter, and "
             "overdriving that input for fuzz before the filter."},
]

D["midi"] = {
    "receives": ["note_on", "note_off"],
    "transmits": ["MIDI THRU pass-through", "USB MIDI"],
    "channel": {"range": [1, 16], "set_by": "four rear DIP switches"},
    "cc_map": None, "nrpn": None, "sysex": None,
    "note_to_cv": {"scaling": "1 V/octave (CV IN is 1 V/octave; MIDI is assumed to match)"},
    "usb": {"class_compliant": True, "os": "Windows 7 or higher, Mac OS X 10.10 or higher"},
    "app": "SynthTRIBE: firmware, poly chain, gate polarity",
}

D["specifications"] = {
    "voices": "monophonic", "oscillators": 2, "lfo": 1, "vcf": "LPF 24 dB/octave", "envelopes": "2 ADS",
    "outputs": {"front": "3.5 mm TS", "rear": "6.35 mm TS"},
    "midi": "In (top panel), Thru (rear), 5-pin DIN, 16 channels by DIP switch; USB",
    "power": {"adaptor": "12 V DC, 1000 mA"},
    "dimensions_mm": {"h": 94, "w": 424, "d": 136},
    "weight_kg": 1.65,
    "operating_temperature_c": {"min": 5, "max": 45},
}

D["omitted_from_source"] = [
    "safety and legal text in nine languages", "warranty and FCC/EU declarations", "hook-up diagrams",
    "non-English duplicates", "Eurorack installation instructions", "the MIDI channel DIP switch table",
]
D["not_in_source"] = [
    "envelope times in seconds for either envelope",
    "whether the CV inputs sum with their knobs or replace them",
    "whether CV IN sums with MIDI pitch or overrides it",
    "the meaning of STEP LENGTH on the KEYB CTRL knob",
    "the ADS CONTROL polarity; the panel scale suggests bipolar",
    "whether the VCO 2 OUT return enters before or after VCO2's VCA",
    "any MIDI implementation beyond note on and off",
    "the number of units a poly chain supports",
    "the sample-and-hold LFO shape that the specifications list",
]
D["source_inconsistencies"] = [
    "The LFO waveform switch (29) offers triangle and square; the specifications list square, S&H and triangle.",
    "DECAY OFF (33) acts on the VCA envelope, which is ADS 1; the specifications call it ADS 2 Decay Off.",
    "GATE IN (11) calls the envelopes ASR; everywhere else they are ADS.",
    "VCO FREQUENCY (20) is described as plus or minus 2 octaves; the panel scale runs 10 Hz to 10 kHz, about ten octaves.",
    "USB (64) is type B in the controls list and USB Micro in the specifications.",
    "The specifications describe a top-panel slider power switch and a rear push button; the controls list has one POWER SWITCH.",
    "LFO OUTPUT 2 is printed as 'LFO OUTPUT 1' in the Chinese section.",
]
D["modelling_gaps"] = [
    {"topic": "Envelope times", "detail": "None given anywhere; the knobs are marked 1 to 10."},
    {"topic": "Waveform morph law", "detail": "The order of shapes is stated; where each shape sits on the knob, and what the in-between shapes are, is not."},
    {"topic": "Filter", "detail": "Self-oscillation is stated; resonance law, cutoff taper and filter topology are not."},
    {"topic": "CV scaling", "detail": "Only CV IN (1 V/octave) and KEYB CTRL (0 to 2 V/octave) have stated scaling. No input voltage ranges are given for any other jack."},
    {"topic": "Original instrument", "detail": "No RSF Kobol documentation was supplied; it would be the source for ranges and the waveform morph."},
]

with open("/mnt/user-data/outputs/behringer-kobol-expander.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
