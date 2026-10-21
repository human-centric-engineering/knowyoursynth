#!/usr/bin/env python3
"""Assemble the Behringer System 15, System 35 and System 55 device files.

All three are fully modular systems built from the same Behringer 900-series Eurorack
modules (recreations of the Moog 900 series), so the build has two layers:

  CATALOGUE  each module type defined once: controls, jacks, nodes and behaviour,
             taken from that module's own Behringer quick start guide
  SYSTEMS    each system is a list of module instances by row, plus the example
             patches from its quick start guide, written as patch cords

There is no fixed internal wiring between modules: every connection is a patch cord, so
connections are empty and the example patches carry the routing. Each module is atomic:
its jacks expose its nodes, and its internal signal flow is a behaviour.
"""
import json

S10 = {"min": 0, "max": 10}
TS = "3.5 mm TS"

# ---------------------------------------------------------------------------
# catalogue
# ---------------------------------------------------------------------------
# jack spec: (jack_id, label, direction, signal, node, function[, count])
# param spec: (param_id, label, kind, control, function, extra dict)


def P(pid, label, kind, control, fn, **extra):
    return (pid, label, kind, control, fn, extra)


def Jk(jid, label, direction, signal, node, fn, count=1):
    return (jid, label, direction, signal, node, fn, count)


CAT = {}


def cat(key, model, type, name, hp, desc, inputs, outputs, params, jacks, props=None, source=None):
    CAT[key] = dict(model=model, type=type, name=name, hp=hp, desc=desc, inputs=inputs, outputs=outputs,
                    params=params, jacks=jacks, props=props or {}, source=source or f"{model} quick start guide")


cat("921b", "921B", "oscillator", "921B Oscillator", 8,
    "VCO driven from a 921A over the frequency and width link jacks. RANGE sets the octave (LO for sub-audio), FREQUENCY offsets it in "
    "semitones. Sine, triangle, sawtooth and rectangular outputs; hard sync from SYNC IN; AC and DC frequency modulation inputs.",
    ["freq_link", "width_link", "sync_in", "ac_mod", "dc_mod"], ["freq_thru", "width_thru", "sine", "triangle", "sawtooth", "rectangular"],
    [P("frequency", "FREQUENCY", "continuous", "knob", "Semitone offset, ±12.", panel_scale={"min": -12, "max": 12}),
     P("range", "RANGE", "enum", "rotary_switch", "Octave range in organ footages; LO for sub-audio.",
       values=[{"value": v} for v in ["LO", "32'", "16'", "8'", "4'", "2'"]]),
     P("sync", "SYNC", "enum", "toggle_switch", "How closely the oscillator follows SYNC IN.", values=[{"value": "weak"}, {"value": "off"}, {"value": "strong"}])],
    [Jk("freq_link", "921AB LINK FREQ", "in", "cv", "freq_link", "Frequency CV from a 921A, 1 V/oct."),
     Jk("freq_link_thru", "921AB LINK FREQ (parallel)", "out", "cv", "freq_thru", "Parallel jack passing the frequency link on to the next 921B."),
     Jk("width_link", "921AB LINK WIDTH", "in", "cv", "width_link", "Pulse width CV from a 921A, 1 V/16%, 0 to +6 V."),
     Jk("width_link_thru", "921AB LINK WIDTH (parallel)", "out", "cv", "width_thru", "Parallel jack passing the width link on."),
     Jk("sync", "SYNC IN", "in", "sync", "sync_in", "Sync source, sawtooth recommended; locks within ±6 semitones."),
     Jk("ac_mod", "AC MOD", "in", "cv_or_audio", "ac_mod", "AC-coupled frequency modulation input."),
     Jk("dc_mod", "DC MOD", "in", "cv", "dc_mod", "DC-coupled frequency modulation input."),
     Jk("sine", "SINE", "out", "audio", "sine", "Sine output."), Jk("triangle", "TRIANGLE", "out", "audio", "triangle", "Triangle output."),
     Jk("sawtooth", "SAWTOOTH", "out", "audio", "sawtooth", "Sawtooth output."), Jk("rectangular", "RECTANGULAR", "out", "audio", "rectangular", "Rectangular output, width from the link.")],
    props={"frequency_hz": [1, 40000], "width_pct": [10, 90], "tuning": "2' = 640 Hz, 32' = 40 Hz, 1 V/oct", "current_ma": [45, 45]})

cat("921a", "921A", "pitch_control", "921A Oscillator Driver", 8,
    "Master controller for up to twelve 921Bs. FREQUENCY (±6 octaves or ±12 semitones, by the rocker) and WIDTH (10-90%) are summed "
    "with two CV inputs each and sent as high-current frequency and width link outputs.",
    ["freq_in", "width_in"], ["freq_out", "width_out"],
    [P("frequency", "FREQUENCY", "continuous", "knob", "Frequency offset for all linked 921Bs.", panel_scale={"min": -6, "max": 6}),
     P("scale", "SEMITONE/OCTAVE", "enum", "toggle_switch", "FREQUENCY spans ±12 semitones or ±6 octaves.", values=[{"value": "semitone"}, {"value": "octave"}]),
     P("width", "WIDTH OF RECTANGULAR WAVE", "continuous", "knob", "Pulse width for linked 921Bs.", physical={"min": 10, "max": 90, "unit": "%"})],
    [Jk("freq_in", "CONTROL INPUT FREQUENCY", "in", "cv", "freq_in", "Frequency CV, summed with the knob.", 2),
     Jk("width_in", "CONTROL INPUT WIDTH", "in", "cv", "width_in", "Width CV, summed with the knob.", 2),
     Jk("freq_out", "OUTPUT TO 921B FREQ", "out", "cv", "freq_out", "Frequency link to 921Bs, 1 V/oct."),
     Jk("width_out", "OUTPUT TO 921B WIDTH", "out", "cv", "width_out", "Width link to 921Bs, 1 V/16%.")],
    props={"drives_921b": 12, "current_ma": [15, 15]})

cat("921", "921", "oscillator", "921 Voltage Controlled Oscillator", 14,
    "Stand-alone VCO that doubles as an LFO (COARSE RNG sub-audio, typically 0.01-800 Hz; audio 1 Hz-80 kHz). Rectangular width with CV, "
    "a clamping point that resets the waveform from a V- or S-trigger, and an AUX output whose waveform and level are selectable.",
    ["freq_cv", "width_cv", "trig_v", "trig_s"], ["sine", "triangle", "sawtooth", "rectangular", "aux"],
    [P("frequency", "FREQUENCY", "continuous", "knob", "Frequency within RANGE, scaled by SCALE.", panel_scale={"min": -6, "max": 6}),
     P("range", "RANGE", "enum", "rotary_switch", "Octave range.", values=[{"value": v} for v in ["32'", "16'", "8'", "4'", "2'", "1'"]]),
     P("scale", "SCALE", "enum", "toggle_switch", "FREQUENCY spans ±6 octaves or ±12 semitones.", values=[{"value": "octave"}, {"value": "semitone"}]),
     P("coarse", "COARSE RNG", "enum", "toggle_switch", "Audio range or sub-audio (LFO) range.", values=[{"value": "audio"}, {"value": "sub"}]),
     P("width", "RECTANGULAR WIDTH", "continuous", "knob", "Default rectangular width.", physical={"min": 10, "max": 90, "unit": "%"}),
     P("clamp", "CLAMPING POINT", "continuous", "knob", "Point in the cycle where a trigger resets the waveform.", physical={"min": 10, "max": 90, "unit": "%"}),
     P("aux_wave", "AUX OUT WAVEFORM", "enum", "rotary_switch", "Waveform at the AUX output.",
       values=[{"value": v} for v in ["sine", "triangle", "inverted_sawtooth", "sawtooth", "rectangular", "inverted_rectangular"]]),
     P("aux_level", "AUX OUT LEVEL", "continuous", "knob", "AUX output level, off to +10 dBu.", panel_scale=S10)],
    [Jk("freq_cv", "FREQUENCY CONTROL INPUT", "in", "cv", "freq_cv", "Frequency CV, summed, 1 V/oct.", 3),
     Jk("width_cv", "CNTRL IN (width)", "in", "cv", "width_cv", "Width CV, summed, 1 V/15%.", 2),
     Jk("trig_v", "TRIG V", "in", "gate", "trig_v", "V-trigger to the clamping point."),
     Jk("trig_s", "TRIG S", "in", "gate", "trig_s", "S-trigger to the clamping point."),
     Jk("sine", "SINE", "out", "cv_or_audio", "sine", "Sine output."), Jk("triangle", "TRIANGLE", "out", "cv_or_audio", "triangle", "Triangle output."),
     Jk("sawtooth", "SAWTOOTH", "out", "cv_or_audio", "sawtooth", "Sawtooth output."), Jk("rectangular", "RECTANGULAR", "out", "cv_or_audio", "rectangular", "Rectangular output."),
     Jk("aux", "AUXILIARY OUTPUT", "out", "cv_or_audio", "aux", "Selected waveform at AUX LEVEL, up to +10 dBu.")],
    props={"frequency_hz": {"sub": [0.01, 800], "audio": [1, 80000]}, "current_ma": [50, 50]})

for key, model, name, rng, extra_p, desc_extra, imp in (
        ("904a", "904A", "904A Voltage Controlled Low Pass Filter",
         [{"value": 1, "meaning": "1 Hz-5 kHz"}, {"value": 2, "meaning": "4 Hz-20 kHz"}, {"value": 3, "meaning": "16 Hz-80 kHz"}],
         [P("regeneration", "REGENERATION", "continuous", "knob", "Feedback to a resonant peak; self-oscillates at high settings.", panel_scale=S10)],
         "24 dB/oct low-pass ladder with REGENERATION (resonance to self-oscillation).", "low"),
        ("904b", "904B", "904B Voltage Controlled High Pass Filter",
         [{"value": "low", "meaning": "4 Hz-20 kHz"}, {"value": "high", "meaning": "10 Hz-50 kHz"}], [],
         "24 dB/oct high-pass filter.", "high")):
    cat(key, model, "filter", name, 8,
        f"{desc_extra} FIXED CONTROL VOLTAGE sets the cutoff within the FREQUENCY RANGE; three summed control inputs at 1 V/oct.",
        ["sig_in", "cv"], ["sig_out"],
        [P("fixed_cv", "FIXED CONTROL VOLTAGE", "continuous", "knob", "Manual cutoff, ±6 V summed with the control inputs.", panel_scale={"min": -6, "max": 6}),
         P("range", "FREQUENCY RANGE", "enum", "rotary_switch" if key == "904a" else "toggle_switch", "Band in which the fixed control voltage acts.", values=rng)] + extra_p,
        [Jk("sig_in", "SIGNAL INPUT", "in", "audio", "sig_in", "Signal in, DC coupled."), Jk("sig_out", "SIGNAL OUTPUT", "out", "audio", "sig_out", "Filtered output."),
         Jk("cv", "CONTROL INPUT", "in", "cv", "cv", "Cutoff CV, summed, 1 V/oct over 12 octaves.", 3)],
        props={"slope_db_per_oct": 24, "type": f"{imp}-pass"})

cat("902", "902", "vca", "902 Voltage Controlled Amplifier", 8,
    "VCA with linear or exponential response and a fixed control voltage. Two signal inputs and two outputs, labelled positive and negative.",
    ["sig_in_pos", "sig_in_neg", "cv"], ["out_pos", "out_neg"],
    [P("mode", "CONTROL MODE", "enum", "toggle_switch", "Linear or exponential response.", values=[{"value": "lin"}, {"value": "exp"}]),
     P("fixed_cv", "FIXED CONTROL VOLTAGE", "continuous", "knob", "Manual gain offset, 0 to 6 V.", panel_scale={"min": 0, "max": 6})],
    [Jk("sig_in_pos", "SIG IN (+)", "in", "cv_or_audio", "sig_in_pos", "Signal input."), Jk("sig_in_neg", "SIG IN (-)", "in", "cv_or_audio", "sig_in_neg", "Signal input, inverted."),
     Jk("out_pos", "SIG OUT (+)", "out", "cv_or_audio", "out_pos", "Output."), Jk("out_neg", "SIG OUT (-)", "out", "cv_or_audio", "out_neg", "Inverted output."),
     Jk("cv", "CONTROL INPUT", "in", "cv", "cv", "Gain CV, summed, -6 to +6 V.", 3)],
    props={"current_ma": [50, 45], "polarity_note": "Behringer labels the inputs and outputs + and - (Zoe Blade); the quick start guide only says 'dual'"})

cat("911", "911", "envelope", "911 Envelope Generator", 8,
    "Three-time-constant envelope: T1 attack, T2 initial decay, T3 final decay after release, with sustain level E SUS. Fired and held "
    "by an S-trigger (active low).", ["strig"], ["out"],
    [P("t1", "T1 (attack)", "continuous", "knob", "Attack time.", physical={"min": 0.002, "max": 10, "unit": "s"}),
     P("t2", "T2 (decay)", "continuous", "knob", "Decay time to the sustain level.", physical={"min": 0.002, "max": 10, "unit": "s"}),
     P("t3", "T3 (release)", "continuous", "knob", "Release time after the trigger ends.", physical={"min": 0.002, "max": 10, "unit": "s"}),
     P("esus", "E SUS", "continuous", "knob", "Sustain level, 0 to +5.5 V.", panel_scale=S10, physical={"min": 0, "max": 5.5, "unit": "V"})],
    [Jk("strig", "S-TRIG IN", "in", "gate", "strig", "S-trigger: hold low for the note."), Jk("out", "OUT", "out", "cv", "out", "Envelope, 0 to +6 V.")],
    props={"current_ma": [30, 30]})

cat("911a", "911A", "gate_logic", "911A Dual Trigger Delay", 8,
    "Two S-trigger delays of 2 ms to 10 s, used independently, in parallel from the top input, or in series.",
    ["strig_1", "strig_2"], ["strig_out_1", "strig_out_2"],
    [P("delay_1", "DELAY TIME (upper)", "continuous", "knob", "Upper delay.", physical={"min": 0.002, "max": 10, "unit": "s"}),
     P("delay_2", "DELAY TIME (lower)", "continuous", "knob", "Lower delay.", physical={"min": 0.002, "max": 10, "unit": "s"}),
     P("coupling", "COUPLING MODE", "enum", "toggle_switch", "Off (independent), parallel (top input starts both) or series (top then bottom).",
       values=[{"value": "off"}, {"value": "parallel"}, {"value": "series"}])],
    [Jk("strig_1", "S-TRIG IN (upper)", "in", "gate", "strig_1", "Trigger in; must stay low for the delay time."),
     Jk("strig_2", "S-TRIG IN (lower)", "in", "gate", "strig_2", "Trigger in."),
     Jk("strig_out_1", "S-TRIG OUT (upper)", "out", "gate", "strig_out_1", "Delayed S-trigger."),
     Jk("strig_out_2", "S-TRIG OUT (lower)", "out", "gate", "strig_out_2", "Delayed S-trigger.")])

FFB = ["low_pass", "125", "175", "250", "350", "500", "700", "1000", "1400", "2000", "2800", "4000", "5600", "high_pass"]
cat("914", "914", "filter", "914 Fixed Filter Bank", 28,
    "Fourteen parallel fixed filters: a low-pass, twelve high-Q band-pass filters from 125 Hz to 5.6 kHz, and a high-pass, each with a level knob.",
    ["in"], ["out"],
    [P(f"band_{b}", "LOW PASS" if b == "low_pass" else "HIGH PASS" if b == "high_pass" else f"{b} Hz", "continuous", "knob",
       f"Level of the {b.replace('_', ' ')} filter." if "pass" in b else f"Level of the {b} Hz band-pass filter.", panel_scale=S10) for b in FFB],
    [Jk("in", "INPUT", "in", "audio", "in", "Signal input (parallel jacks).", 2), Jk("out", "OUTPUT", "out", "audio", "out", "Filtered output.", 2)],
    props={"bands_hz": [int(b) for b in FFB[1:-1]]})

cat("923", "923", "filter", "923 Filters (and noise)", 8,
    "A 6 dB/oct low-pass and a 6 dB/oct high-pass filter (10 Hz-10 kHz each), usable in series as a band-pass, plus white and pink noise.",
    ["lp_in", "hp_in"], ["lp_out", "hp_out", "white", "pink"],
    [P("lp", "LOW PASS", "continuous", "knob", "Low-pass cutoff, 10 Hz-10 kHz.", physical={"min": 10, "max": 10000, "unit": "Hz"}),
     P("hp", "HIGH PASS", "continuous", "knob", "High-pass cutoff, 10 Hz-10 kHz.", physical={"min": 10, "max": 10000, "unit": "Hz"})],
    [Jk("lp_in", "LOW PASS IN", "in", "audio", "lp_in", "Low-pass input."), Jk("lp_out", "LOW PASS OUT", "out", "audio", "lp_out", "Low-pass output."),
     Jk("hp_in", "HIGH PASS IN", "in", "audio", "hp_in", "High-pass input."), Jk("hp_out", "HIGH PASS OUT", "out", "audio", "hp_out", "High-pass output."),
     Jk("white", "NOISE WHITE", "out", "cv_or_audio", "white", "White noise, 0 dBu.", 2), Jk("pink", "NOISE PINK", "out", "cv_or_audio", "pink", "Pink noise, +4 dBu.", 2)],
    props={"slope_db_per_oct": 6})

cat("903a", "903A", "noise", "903A Random Signal Generator", 4, "White and pink noise source.", [], ["white", "pink"], [],
    [Jk("white", "WHITE", "out", "cv_or_audio", "white", "White noise, 0 dBu.", 2), Jk("pink", "PINK", "out", "cv_or_audio", "pink", "Pink noise, +4 dBu.", 2)])

cat("cp3am", "CP3A-M", "mixer", "CP3A-M Mixer", 14,
    "Four-channel mixer with a master gain and positive and negative outputs, plus two passive four-jack multiples. Handles audio and CV.",
    ["in1", "in2", "in3", "in4", "mult_a", "mult_b"], ["out_pos", "out_neg", "mult_a_out", "mult_b_out"],
    [P(f"gain{i}", f"CHANNEL GAIN {i}", "continuous", "knob", f"Level of input {i}.", panel_scale=S10) for i in range(1, 5)] +
    [P("master", "MASTER GAIN", "continuous", "knob", "Output level.", panel_scale=S10)],
    [Jk(f"in{i}", f"CHANNEL INPUT {i}", "in", "cv_or_audio", f"in{i}", f"Mixer input {i}.") for i in range(1, 5)] +
    [Jk("out_pos", "OUTPUT (+)", "out", "cv_or_audio", "out_pos", "Mixed output.", 2), Jk("out_neg", "OUTPUT (-)", "out", "cv_or_audio", "out_neg", "Inverted mixed output.", 2),
     Jk("mult_a", "MULTIPLE A", "in", "cv_or_audio", "mult_a", "First jack of multiple A; all four jacks are one passive bus."),
     Jk("mult_a_out", "MULTIPLE A", "out", "cv_or_audio", "mult_a_out", "Copies of multiple A.", 3),
     Jk("mult_b", "MULTIPLE B", "in", "cv_or_audio", "mult_b", "First jack of multiple B."),
     Jk("mult_b_out", "MULTIPLE B", "out", "cv_or_audio", "mult_b_out", "Copies of multiple B.", 3)])

cat("cp3ao", "CP3A-O", "cv_source_selector", "CP3A-O Oscillator Controller", 8,
    "Front trunk lines for oscillator control: three control inputs and an attenuated EXT INPUT, each with a routing switch, summed to three parallel outputs.",
    ["in1", "in2", "in3", "ext"], ["out"],
    [P(f"route{i}", f"ROUTING SWITCH {i}", "boolean", "slide_switch", f"Up: input {i} reaches the outputs." if i < 4 else "Up: EXT INPUT reaches the outputs.") for i in range(1, 5)] +
    [P("attenuator", "ATTENUATOR", "continuous", "knob", "Level of EXT INPUT, -inf to unity.", panel_scale=S10)],
    [Jk(f"in{i}", f"CONTROL INPUT {i}", "in", "cv", f"in{i}", f"Control input {i}, 1 V/oct.") for i in range(1, 4)] +
    [Jk("ext", "EXT INPUT", "in", "cv", "ext", "Attenuated external input."),
     Jk("out", "FREQUENCY CONTROL TO OSC", "out", "cv", "out", "Summed control voltage, parallel jacks.", 3)])

cat("992", "992", "cv_source_selector", "992 Control Voltages", 8,
    "CV router for filters: three switched control inputs and an EXT INPUT through an inverting attenuator (-10 to +10), summed to three parallel outputs.",
    ["in1", "in2", "in3", "ext"], ["out"],
    [P(f"switch{i}", f"CV SWITCH {i}", "boolean", "slide_switch", f"Up: input {i} reaches the outputs." if i < 4 else "Up: EXT INPUT reaches the outputs.") for i in range(1, 5)] +
    [P("attenuator", "ATTENUATOR", "continuous", "knob", "EXT INPUT level; anticlockwise inverts, centre is off.", panel_scale={"min": -10, "max": 10})],
    [Jk(f"in{i}", f"CONTROL INPUT {i}", "in", "cv", f"in{i}", f"Control input {i}.") for i in range(1, 4)] +
    [Jk("ext", "EXT INPUT", "in", "cv", "ext", "Input to the inverting attenuator (the guide's 'input 4')."),
     Jk("out", "CONTROL OUTPUT", "out", "cv", "out", "Summed CV, parallel jacks.", 3)])

cat("cp35", "CP35", "attenuator", "CP35 Attenuators / Voltage Source / Multiple", 21,
    "Four passive attenuators with half-normalled inputs (input 1 feeds all four until later inputs are patched), +6 V and -6 V references, and two four-jack multiples.",
    ["att_in1", "att_in2", "att_in3", "att_in4", "mult_a", "mult_b"], ["att_out1", "att_out2", "att_out3", "att_out4", "pos6", "neg6", "mult_a_out", "mult_b_out"],
    [P(f"att{i}", f"ATTENUATOR {i}", "continuous", "knob", f"Attenuator {i}, -inf to unity.", panel_scale=S10) for i in range(1, 5)],
    [Jk(f"att_in{i}", f"IN {i}", "in", "cv_or_audio", f"att_in{i}", "Attenuator input; " + ("feeds all four attenuators while the others are empty." if i == 1 else f"breaks the normal from the input above."))
     for i in range(1, 5)] +
    [Jk(f"att_out{i}", f"OUT {i}", "out", "cv_or_audio", f"att_out{i}", f"Attenuator {i} output.") for i in range(1, 5)] +
    [Jk("pos6", "+6 V", "out", "cv", "pos6", "+6 V reference.", 2), Jk("neg6", "-6 V", "out", "cv", "neg6", "-6 V reference.", 2),
     Jk("mult_a", "MULTIPLE A", "in", "cv_or_audio", "mult_a", "First jack of multiple A; all four jacks are one passive bus."),
     Jk("mult_a_out", "MULTIPLE A", "out", "cv_or_audio", "mult_a_out", "Copies of multiple A.", 3),
     Jk("mult_b", "MULTIPLE B", "in", "cv_or_audio", "mult_b", "First jack of multiple B."),
     Jk("mult_b_out", "MULTIPLE B", "out", "cv_or_audio", "mult_b_out", "Copies of multiple B.", 3)])

cat("995", "995", "attenuator", "995 Attenuators", 8, "Passive attenuators.",
    ["in1", "in2", "in3"], ["out1", "out2", "out3"],
    [P(f"att{i}", f"ATTENUATOR {i}", "continuous", "knob", f"Attenuator {i}.", panel_scale=S10) for i in range(1, 4)],
    [Jk(f"in{i}", f"IN {i}", "in", "cv_or_audio", f"in{i}", f"Attenuator {i} input.") for i in range(1, 4)] +
    [Jk(f"out{i}", f"OUT {i}", "out", "cv_or_audio", f"out{i}", f"Attenuator {i} output.") for i in range(1, 4)],
    source="inferred from the Moog 995; the Behringer 995 guide was not read")

cat("961", "961", "gate_logic", "961 Interface", 21,
    "Trigger converter: audio to V-trigger (with SENSITIVITY), two S-to-V converters, and two V-to-S converters, each taking six direct (A) "
    "and six timed (B, SWITCH-ON TIME 40 ms-4 s) V-trigger inputs.",
    ["audio_in", "strig_in_l", "strig_in_r", "vtrig_a_l", "vtrig_b_l", "vtrig_a_r", "vtrig_b_r"],
    ["vtrig_audio", "vtrig_out_l", "vtrig_out_r", "strig_out_l", "strig_out_r"],
    [P("sensitivity", "SENSITIVITY", "continuous", "knob", "Gain of AUDIO IN before conversion.", panel_scale=S10),
     P("on_time_l", "SWITCH-ON TIME (left)", "continuous", "knob", "On time for V-TRIG IN B (left).", physical={"min": 0.04, "max": 4, "unit": "s"}),
     P("on_time_r", "SWITCH-ON TIME (right)", "continuous", "knob", "On time for V-TRIG IN B (right).", physical={"min": 0.04, "max": 4, "unit": "s"})],
    [Jk("audio_in", "AUDIO IN", "in", "audio", "audio_in", "Audio to convert to a V-trigger."),
     Jk("vtrig_audio", "V-TRIG OUT (audio)", "out", "gate", "vtrig_audio", "V-trigger from AUDIO IN.", 2)] +
    [j for s in ("l", "r") for j in (
        Jk(f"strig_in_{s}", f"S-TRIG IN ({'left' if s == 'l' else 'right'})", "in", "gate", f"strig_in_{s}", "S-trigger to convert to V-trigger."),
        Jk(f"vtrig_out_{s}", f"V-TRIG OUT ({'left' if s == 'l' else 'right'})", "out", "gate", f"vtrig_out_{s}", "Converted V-trigger, +5 V.", 2),
        Jk(f"vtrig_a_{s}", f"V-TRIG IN A ({'left' if s == 'l' else 'right'})", "in", "gate", f"vtrig_a_{s}", "Direct V-trigger inputs.", 6),
        Jk(f"vtrig_b_{s}", f"V-TRIG IN B ({'left' if s == 'l' else 'right'})", "in", "gate", f"vtrig_b_{s}", "V-trigger inputs timed by SWITCH-ON TIME.", 6),
        Jk(f"strig_out_{s}", f"S-TRIG OUT ({'left' if s == 'l' else 'right'})", "out", "gate", f"strig_out_{s}", "S-trigger from the V-trigger inputs."))])

cat("cm1a", "CM1A", "midi_to_cv", "CM1A MIDI to CV Converter", 6,
    "MIDI and USB to CV and trigger. CV range switchable for System 15/35/55 (-5.3 to +4.7 V) or System 100/2500; mono or duophonic. "
    "TRIG MODE gives V-trig, S-trig, or one of each.",
    [], ["cv_1", "cv_2", "trig_upper", "trig_lower"],
    [P("trig_mode", "TRIG MODE", "enum", "toggle_switch", "Trigger type at the TRIG outputs; centre makes the upper S-trig and the lower V-trig.",
       values=[{"value": "v_trig"}, {"value": "both"}, {"value": "s_trig"}]),
     P("mode", "MODE SELECT", "enum", "push_button", "Rear button: short press switches CV range, long press mono/duophonic.",
       values=[{"value": "s55_mono", "meaning": "System 15/35/55 range, mono (red/red)"}, {"value": "s100_mono", "meaning": "System 100/2500 range, mono (green/red)"},
               {"value": "s55_duo", "meaning": "System 15/35/55 range, duophonic (red/green)"}, {"value": "s100_duo", "meaning": "System 100/2500 range, duophonic (green/green)"}]),
     P("midi_channel", "MIDI channel", "integer", None, "MIDI channel 1-16, set in SynthTribe.", range={"min": 1, "max": 16})],
    [Jk("cv_1", "CV 1", "out", "cv", "cv_1", "Pitch CV, 1 V/oct."), Jk("cv_2", "CV 2", "out", "cv", "cv_2", "Second CV (duophonic)."),
     Jk("trig_upper", "TRIG (upper)", "out", "gate", "trig_upper", "Trigger; S-trig in the centre TRIG MODE position."),
     Jk("trig_lower", "TRIG (lower)", "out", "gate", "trig_lower", "Trigger; V-trig in the centre TRIG MODE position."),
     Jk("midi_in", "MIDI IN", "in", "midi", None, "MIDI in, 5-pin DIN."), Jk("midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru, 5-pin DIN."),
     Jk("usb", "USB", "bidirectional", "midi", None, "USB MIDI, SynthTribe, firmware.")],
    props={"cv_range_v": {"system_55": [-5.3, 4.7], "system_100": [-1, 9]}, "note_range": "C0 to C9"})

cat("960", "960", "sequencer", "960 Sequential Controller", 56,
    "Eight-stage, three-row analogue sequencer with its own clock oscillator. Each stage can play, skip or stop; row outputs scale x1, x2 "
    "or x4; the third row can set each stage's duration instead of a voltage.",
    ["osc_on", "osc_off", "osc_cv", "shift"] + [f"stage_in_{i}" for i in range(1, 9)],
    ["osc_out", "row_a", "row_b", "row_c"] + [f"stage_out_{i}" for i in range(1, 9)],
    [P("freq_range", "FREQUENCY RANGE", "enum", "rotary_switch", "Clock range.", values=[
        {"value": 1, "meaning": "0.04-0.5 Hz"}, {"value": 2, "meaning": "2.75-30 Hz"}, {"value": 3, "meaning": "0.17-2 Hz"},
        {"value": 4, "meaning": "11-130 Hz"}, {"value": 5, "meaning": "0.7-8 Hz"}, {"value": 6, "meaning": "44-500 Hz"}]),
     P("vernier", "FREQUENCY VERNIER", "continuous", "knob", "Fine clock rate over 3 octaves.", panel_scale=S10),
     P("osc_on_btn", "OSC ON", "boolean", "push_button", "Starts the clock."), P("osc_off_btn", "OSC OFF", "boolean", "push_button", "Stops the clock."),
     P("timing", "3RD ROW CONTROL OF TIMING", "boolean", "toggle_switch", "Row C knobs set each stage's duration."),
     P("shift_btn", "SHIFT", "boolean", "push_button", "Advances one stage.")] +
    [P(f"row_{r}_{s}", f"ROW {r.upper()} STAGE {s}", "continuous", "knob", f"Voltage of row {r.upper()} at stage {s}.", panel_scale=S10) for r in "abc" for s in range(1, 9)] +
    [P(f"mode_{s}", f"STAGE {s} MODE", "enum", "toggle_switch", "Normal, skip or stop.", values=[{"value": "normal"}, {"value": "skip"}, {"value": "stop"}]) for s in range(1, 9)] +
    [P(f"set_{s}", f"SET {s}", "boolean", "push_button", f"Selects stage {s}.") for s in range(1, 9)] +
    [P(f"range_{r}", f"ROW {r.upper()} RANGE", "enum", "rotary_switch", "Maximum output.", values=[{"value": "x1", "meaning": "+2 V"}, {"value": "x2", "meaning": "+4 V"}, {"value": "x4", "meaning": "+8 V"}])
     for r in "abc"],
    [Jk("osc_on", "OSC ON (input)", "in", "gate", "osc_on", "Gate that starts the clock."), Jk("osc_off", "OSC OFF (input)", "in", "gate", "osc_off", "Gate that stops the clock."),
     Jk("osc_cv", "CONTROL INPUT", "in", "cv", "osc_cv", "Clock rate CV, 1 V/oct."), Jk("osc_out", "OSCILLATOR OUTPUT", "out", "clock", "osc_out", "Clock pulses (V-trig, 90% duty)."),
     Jk("shift", "SHIFT (input)", "in", "clock", "shift", "External advance.")] +
    [Jk(f"row_{r}", f"ROW {r.upper()} OUTPUT", "out", "cv", f"row_{r}", f"Row {r.upper()} voltage.", 2) for r in "abc"] +
    [Jk(f"stage_in_{s}", f"STAGE {s} IN", "in", "gate", f"stage_in_{s}", f"V-trigger that jumps to stage {s}.") for s in range(1, 9)] +
    [Jk(f"stage_out_{s}", f"STAGE {s} OUT", "out", "gate", f"stage_out_{s}", f"V-trigger while stage {s} is active.") for s in range(1, 9)])

cat("962", "962", "electronic_switch", "962 Sequential Switch", 8,
    "Three-way switch that routes one of three signal inputs to the output; SHIFT steps through them, and each stage can be selected by trigger or button.",
    ["sig_1", "sig_2", "sig_3", "shift"] + [f"trig_in_{i}" for i in range(1, 4)], ["out"] + [f"trig_out_{i}" for i in range(1, 4)],
    [P(f"button_{i}", f"TRIGGER BUTTON {i}", "boolean", "push_button", f"Selects stage {i}.") for i in range(1, 4)],
    [Jk(f"sig_{i}", f"SIG IN {i}", "in", "cv_or_audio", f"sig_{i}", f"Signal input {i}.") for i in range(1, 4)] +
    [Jk("shift", "SHIFT", "in", "clock", "shift", "Advances to the next stage; usually 960 stage 1 OUT."), Jk("out", "OUTPUT", "out", "cv_or_audio", "out", "Selected input.", 2)] +
    [Jk(f"trig_in_{i}", f"TRIGGER INPUT {i}", "in", "gate", f"trig_in_{i}", f"Selects stage {i}.") for i in range(1, 4)] +
    [Jk(f"trig_out_{i}", f"TRIGGER OUTPUT {i}", "out", "gate", f"trig_out_{i}", f"High while stage {i} is active.") for i in range(1, 4)])

BEHAVIOUR = {
    "921b": "Pitch is the 921A link voltage plus RANGE and FREQUENCY, at 1 V/oct; pulse width follows the width link (0 to +6 V; outside that the "
            "rectangular output stops). Linked 921Bs track together and can be detuned with their own FREQUENCY knobs. LO turns a 921B into a sweep source.",
    "921a": "One 921A sets the pitch and pulse width of every 921B daisy-chained from it; with SEMITONE/OCTAVE at octave the FREQUENCY knob moves all of them by octaves.",
    "921": "Set COARSE RNG to sub for LFO duty ('Sub' in the patches). The clamping point resets the waveform on a trigger, for sync-like or key-synced LFOs. AUX gives any waveform, inverted if wanted, at a set level.",
    "904a": "Cutoff = FIXED CONTROL VOLTAGE plus the three control inputs, 1 V per octave within the selected range. REGENERATION at 9-10 makes it self-oscillate, as in Space Rock.",
    "904b": "Cutoff = FIXED CONTROL VOLTAGE plus the three control inputs, 1 V per octave, within LOW or HIGH range.",
    "902": "Gain = FIXED CONTROL VOLTAGE plus the control inputs, linear or exponential. Equally happy with audio or CV, so a 902 fed with an LFO and an envelope makes delayed vibrato.",
    "911": "S-trigger held low starts T1, then T2 to E SUS while held; release starts T3. Times 2 ms to 10 s.",
    "911a": "Delays an S-trigger, which must stay low longer than the delay to pass. Coupled in series or parallel for two-stage delays.",
    "914": "All fourteen filters run in parallel; their levels shape a fixed formant, independent of pitch.",
    "923": "Low-pass then high-pass in series gives a band-pass; both are gentle 6 dB/oct.",
    "903a": "Free-running noise; pink noise into a filter makes wind effects.",
    "cp3am": "Four inputs summed through MASTER to + and - outputs. The multiples are passive and separate from the mixer.",
    "cp3ao": "Each switch adds its input to the outputs; the EXT input passes through the attenuator first. In the patches it feeds a vibrato signal to several oscillators' DC MOD inputs.",
    "992": "Each switch adds its input to the three outputs; EXT runs through an attenuverter. In the Harmonic Sequence patch it mixes LFO and envelope to drive both filters.",
    "cp35": "Attenuator inputs are half-normalled: input 1 feeds all four outputs until a lower input is patched, which takes over from there down. The multiples are passive buses.",
    "995": "Passive attenuation.",
    "961": "Converts between Moog S-triggers (switch to ground) and V-triggers (+5 V), and from audio to V-triggers. Not needed with the CM1A in S-trig mode.",
    "cm1a": "Select S-trig for the 911s. In System 55 range the pitch CV runs -5.3 to +4.7 V. MIDI channel, bend range and note range are set in SynthTribe.",
    "960": "Runs from its own clock or SHIFT; stage triggers can jump to stages or fire other modules. Stage 9 with SKIP continues or with STOP halts and turns the clock off. With the 962, rows chain to 16 or 24 steps.",
    "962": "SHIFT steps through the connected inputs (2 or 3). Patch 960 stage 1 OUT to SHIFT and rows A-C to the inputs for 24 steps.",
}

# ---------------------------------------------------------------------------
# instance builder
# ---------------------------------------------------------------------------


def build_system(modules):
    M, P_, J, I = [], [], [], []
    for inst, key, row, pos in modules:
        c = CAT[key]
        props = {"model": c["model"], "hp": c["hp"], "row": row, "position": pos}
        props.update(c["props"])
        M.append({"id": inst, "type": c["type"], "name": c["name"] + (f" ({inst.split('_')[-1]})" if "_" in inst else ""),
                  "panel_section": f"{row} row, position {pos}", "description": c["desc"], "properties": props,
                  "inputs": [f"{inst}.{n}" for n in c["inputs"]], "outputs": [f"{inst}.{n}" for n in c["outputs"]]})
        for pid, label, kind, control, fn, extra in c["params"]:
            p = {"id": f"{inst}.{pid}", "module": inst, "label": label, "kind": kind}
            p.update(extra)
            if control is None:
                p["access"] = [{"type": "app", "note": "SynthTribe"}]
            elif key == "cm1a" and pid == "mode":
                p["access"] = [{"type": "rear_panel", "control": control}]
            else:
                p["access"] = [{"type": "panel", "control": control}]
            p["function"] = fn
            if key == "995":
                p["confidence"] = "inferred"
            P_.append(p)
        for jid, label, direction, signal, node, fn, count in c["jacks"]:
            for k in range(1, count + 1):
                pid = f"{inst}.{jid}" + (f"_{k}" if count > 1 else "")
                j = {"id": pid, "label": label + (f" {k}" if count > 1 else ""), "location": "rear" if signal == "midi" else ("patch_in" if direction == "in" else "patch_out"),
                     "direction": direction, "signal": signal, "connector": "5-pin DIN" if signal == "midi" and jid != "usb" else ("USB type B" if jid == "usb" else TS),
                     "node": f"{inst}.{node}" if node else None, "function": fn}
                if count > 1 and direction == "in":
                    j["combine"] = "sum"
                if key == "995":
                    j["confidence"] = "inferred"
                J.append(j)
        if key == "960":
            I.append({"id": f"{inst}.stage_leds", "module": inst, "label": "stage LEDs", "kind": "led", "function": "Light the active stage."})
        if key == "962":
            I.append({"id": f"{inst}.stage_leds", "module": inst, "label": "stage LEDs", "kind": "led", "function": "Light the active stage."})
        if key == "cm1a":
            I.append({"id": f"{inst}.mode_leds", "module": inst, "label": "mode LEDs (underside)", "kind": "led", "led_colour": "multi",
                      "function": "Red/red System 55 mono; green/red System 100 mono; red/green System 55 duophonic; green/green System 100 duophonic."})
    beh = []
    keys = sorted({k for _, k, _, _ in modules}, key=list(CAT).index)
    for key in keys:
        beh.append({"id": f"b{len(beh) + 1:02d}", "name": CAT[key]["name"], "applies_to": [i for i, k, _, _ in modules if k == key], "rule": BEHAVIOUR[key],
                    **({"confidence": "inferred"} if key == "995" else {})})
    return M, P_, J, I, beh


def cords(*pairs):
    return [list(p) for p in pairs]


SOURCES_COMMON = [
    {"id": "module_guides", "title": "Behringer quick start guides for the 921, 921A, 921B, 902, 904A, 904B, 911, 911A, 914, 923, 903A, 960, 961, 962, 992, CM1A, CP3A-M, CP3A-O and CP35",
     "kind": "user_manual", "file": "https://notebook.zoeblade.com/900_Series_Behringer.html",
     "note": "Module controls, jacks and specifications. Read from Zoe Blade's mirror; the 962, 992 and 903A partly from search extracts. The 995 guide was not read."},
    {"id": "zoeblade", "title": "Zoe Blade, '900 Series (Behringer)' notes", "kind": "other", "file": "https://notebook.zoeblade.com/900_Series_Behringer.html",
     "note": "Module HP list, VCO drift and recalibration, labelled 902 polarities, recommended modifications."},
]

COMMON_BEH = [
    {"name": "Triggers", "rule": "The system uses Moog S-triggers (switch to ground, held for the note) for the 911 envelopes and 911A. The CM1A can output S-triggers "
     "directly; the 961 converts V-triggers (from the 960 or other gear) to S-triggers and back."},
    {"name": "Pitch", "rule": "1 V/oct throughout. A 921A drives any number of 921Bs through daisy-chained link jacks; set the CM1A to System 15/35/55 CV range."},
    {"name": "Warm-up and drift", "rule": "Allow 30 minutes or more before playing. The oscillators are not temperature compensated, so offset and scaling drift until warm (Zoe Blade).",
     "confidence": "stated"},
]


def assemble(sysname, count, rows_desc, modules, patches, extra_sources, specs, not_in, incons, gaps, based_on, power):
    M, P_, J, I, beh = build_system(modules)
    for b in COMMON_BEH:
        beh.append({"id": f"b{len(beh) + 1:02d}", "name": b["name"], "applies_to": [m["id"] for m in M if m["type"] in ("envelope", "gate_logic", "midi_to_cv", "oscillator", "pitch_control")],
                    "rule": b["rule"]})
    D = {"schema_version": "0.10.0"}
    D["device"] = {"id": f"behringer-system-{count}", "manufacturer": "Behringer", "model": f"System {count}",
                   "category": f"complete modular synthesizer, {len(M)} Eurorack modules, MIDI-to-CV converter included",
                   "based_on": based_on,
                   "sources": [{"id": "qsg", "title": f"Behringer System {count} Quick Start Guide", "kind": "quick_start_guide", "file": sysname,
                                "note": "Module layout and example patches; module details deferred to each module's own guide."}] + SOURCES_COMMON + extra_sources}
    D["architecture"] = {"synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic as patched (CM1A can run duophonic)",
                         "poly_chain_max_units": None, "patch_memory": False, "semi_modular": False,
                         "routing": "fully patched: no internal connections between modules",
                         "panel_counts": {"modules": len(M), "rows": int(rows_desc[0]), "jacks": len(J), "controls": len(P_)},
                         "summary": f"Behringer's recreation of a Moog System {count} in Eurorack modules: " + rows_desc_text(modules) + " Every connection is a patch cord."}
    D["modules"], D["parameters"], D["ports"], D["connections"], D["indicators"], D["behaviours"] = M, P_, J, [], I, beh
    for p in patches:
        if "note" in p:
            p["description"] += " Note: " + p.pop("note")
    D["example_patches"] = patches
    D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend", "note": "range set in SynthTribe"}],
                 "transmits": [], "note": "Via the CM1A module only; channel set in SynthTribe. MIDI THRU on the CM1A."}
    D["specifications"] = dict(specs, power=power)
    D["omitted_from_source"] = ["safety and warranty text", "non-English translations", "module power connection and installation steps", "module tuning procedures, beyond the reference frequencies"]
    D["not_in_source"] = not_in
    D["source_inconsistencies"] = incons
    D["modelling_gaps"] = gaps
    return D


def rows_desc_text(modules):
    rows = {}
    for _, k, r, _ in modules:
        rows.setdefault(r, []).append(CAT[k]["model"])
    return " ".join(f"{r} row: {', '.join(v)}." for r, v in rows.items())


def finish(D, path):
    order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "example_patches",
             "midi", "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("written", path)


# ---------------------------------------------------------------------------
# shared patch fragments
# ---------------------------------------------------------------------------
def keyboard_chain(cm, a, bs):
    """CM1A CV into a 921A, then its frequency link daisy-chained through 921Bs."""
    out = [(f"{cm}.cv_1", f"{a}.freq_in_1"), (f"{a}.freq_out", f"{bs[0]}.freq_link")]
    out += [(f"{bs[i]}.freq_link_thru", f"{bs[i + 1]}.freq_link") for i in range(len(bs) - 1)]
    return out


def width_chain(a, bs):
    out = [(f"{a}.width_out", f"{bs[0]}.width_link")]
    out += [(f"{bs[i]}.width_link_thru", f"{bs[i + 1]}.width_link") for i in range(len(bs) - 1)]
    return out


def strig_to(cm, mult, egs):
    out = [(f"{cm}.trig_upper", f"{mult}.mult_a")]
    out += [(f"{mult}.mult_a_out_{i + 1}", f"{eg}.strig") for i, eg in enumerate(egs)]
    return out


S_TRIG = {"cm1a.trig_mode": "s_trig", "cm1a.mode": "s55_mono"}
PERC_EG = {"t1": 0.002, "t2": 0.2, "t3": 0.2, "esus": 4}
PERC_EG2 = {"t1": 1, "t2": 0.05, "t3": 4, "esus": 9}
FFB_ORGAN = dict(zip(FFB, [0, 4, 4, 0, 5, 3.5, 0, 0, 1, 0, 0, 0, 0, 0]))


def eg(inst, vals):
    return {f"{inst}.{k}": v for k, v in vals.items()}


def space_rock(b1, b2, a="m921a_1"):
    return {"id": "space_rock", "name": "Space Rock",
            "description": "Two classic space rock sounds mixed: a self-oscillating 904A swept by a slow 921 sine and the first 921B (LO), "
                           "and pink noise through the 904B swept by the second 921B for wind. Both benefit from lots of echo.",
            "cords": cords(("m921.sine", "m904a.cv_1"), (f"{a}.freq_out", f"{b1}.freq_link"), (f"{b1}.freq_link_thru", f"{b2}.freq_link"),
                           (f"{b1}.sine", "m904a.cv_2"), (f"{b2}.sine", "m904b.cv_1"), ("m923.pink_1", "m904b.sig_in"),
                           ("m904a.sig_out", "cp3am_1.in1"), ("m904b.sig_out", "cp3am_1.in2")),
            "settings": {"m904a.regeneration": 9.5, f"{a}.scale": "octave", f"{a}.frequency": -6, f"{b1}.range": "LO", f"{b2}.range": "LO", "m921.coarse": "sub"},
            "source": "quick start guide", "confidence": "stated"}


def percussive_lead(cm, a, b1, b2, mult, mix="cp3am_1"):
    return {"id": "percussive_lead", "name": "Percussive Lead",
            "description": "Two 921Bs (triangle and sawtooth, one slightly detuned) into the 904A and a 902; a hard envelope front and filter movement from a slow 921 sine and a second 911. Suits melodic sequencing.",
            "cords": cords(*keyboard_chain(cm, a, [b1, b2]), (f"{b1}.triangle", f"{mix}.in1"), (f"{b2}.sawtooth", f"{mix}.in2"), (f"{mix}.out_pos_1", "m904a.sig_in"),
                           ("m904a.sig_out", "m902_1.sig_in_pos"), *strig_to(cm, mult, ["m911_1", "m911_2"]), ("m911_1.out", "m902_1.cv_1"),
                           ("m921.sine", "m904a.cv_1"), ("m911_2.out", "m904a.cv_2")),
            "settings": {**S_TRIG, **eg("m911_1", PERC_EG), **eg("m911_2", PERC_EG2), "m921.coarse": "sub"},
            "source": "quick start guide", "confidence": "stated",
            "note": "The guide gives E SUS in seconds ('4 seconds') for the first 911 and as 9 for the second; E SUS is a level."}


def lead2(cm, a, b1, b2, mult, with_923=False):
    c = keyboard_chain(cm, a, [b1, b2]) + width_chain(a, [b1, b2]) + [(f"{b1}.rectangular", "cp3am_1.in1"), (f"{b2}.rectangular", "cp3am_1.in2")]
    c += strig_to(cm, mult, ["m911_1", "m911_2"]) + [("m921.sine", f"{a}.width_in_1")]
    if with_923:
        c += [("cp3am_1.out_pos_1", "m904a.sig_in"), ("cp3am_1.out_pos_2", "m923.hp_in"), ("m923.hp_out", "m923.lp_in"), ("m904a.sig_out", "m902_1.sig_in_pos"),
              ("m923.lp_out", "m902_2.sig_in_pos"), ("m902_1.out_pos", "cp3am_2.in1"), ("m902_2.out_pos", "cp3am_2.in2"), ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m902_2.cv_1")]
        desc = ("Pulse width modulation of two 921Bs (one slightly detuned) from a 921 sine. Main sound through the 904A; a second, quieter band-pass part "
                "through the 923's high-pass then low-pass filters, each with its own 902 and 911, mixed in a second CP3A-M.")
    else:
        c += [("cp3am_1.out_pos_1", "m904a.sig_in"), ("m904a.sig_out", "m902_1.sig_in_pos"), ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m904a.cv_1")]
        desc = "Pulse width modulation of two 921Bs (one slightly detuned) from a 921 sine, through the 904A with the second 911 on cutoff and the first 911 on the 902."
    return {"id": "expressive_lead_2", "name": "Expressive Lead #2", "description": desc, "cords": cords(*c),
            "settings": {**S_TRIG, "m921.coarse": "sub"}, "source": "quick start guide", "confidence": "stated"}


def organ(cm, bs, mult):
    a1, a2 = "m921a_1", "m921a_2"
    c = [(f"{cm}.cv_1", f"{mult}.mult_b"), (f"{mult}.mult_b_out_1", f"{a1}.freq_in_1"), (f"{mult}.mult_b_out_2", f"{a2}.freq_in_1"),
         (f"{a1}.freq_out", f"{bs[0]}.freq_link"), (f"{bs[0]}.freq_link_thru", f"{bs[1]}.freq_link"), (f"{bs[1]}.freq_link_thru", f"{bs[2]}.freq_link"),
         (f"{a2}.freq_out", f"{bs[3]}.freq_link"),
         (f"{bs[0]}.triangle", "cp3am_1.in1"), (f"{bs[1]}.rectangular", "cp3am_1.in2"), (f"{bs[2]}.sine", "cp3am_1.in3"), ("cp3am_1.out_pos_1", "m914.in_1"),
         (f"{bs[3]}.sine", "m904a.sig_in"), ("m923.pink_1", "m904b.sig_in"), ("m914.out_1", "m902_1.sig_in_pos"), ("m904a.sig_out", "m902_2.sig_in_pos"),
         ("m904b.sig_out", "m902_3.sig_in_pos"), ("m902_1.out_pos", "cp3am_2.in1"), ("m902_2.out_pos", "cp3am_2.in2"), ("m902_3.out_pos", "cp3am_2.in3"),
         *strig_to(cm, mult, ["m911_1", "m911_2", "m911_3"]), ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m902_2.cv_1"), ("m911_3.out", "m902_3.cv_1")]
    st = {**S_TRIG, **{f"m914.band_{k}": v for k, v in FFB_ORGAN.items()}, "m921a_1.width": 50,
          **eg("m911_1", {"t1": 0.002, "t2": 10, "t3": 0.002, "esus": 10}), **eg("m911_2", {"t1": 0.002, "t2": 0.5, "t3": 0.002, "esus": 0}),
          **eg("m911_3", {"t1": 0.002, "t2": 0.005, "t3": 0.002, "esus": 0})}
    return {"id": "mellow_organ", "name": "Mellow Organ",
            "description": "Three parts: an organ tone from three 921Bs (triangle, square, sine) through the 914 fixed filter bank; a tuned percussive "
                           "click from the fourth 921B's sine through the 904A (500 ms decay); and an untuned click from pink noise through the 904B "
                           "(5 ms decay), kept low in the mix. Raising the 921A width above 50% makes it more nasal.",
            "cords": cords(*c), "settings": st, "source": "quick start guide", "confidence": "stated",
            "note": "Envelope times given as 'minimum' and 'long' are set here to 2 ms and 10 s."}


# ---------------------------------------------------------------------------
# systems
# ---------------------------------------------------------------------------
def system15():
    mods = [("m914", "914", "top", 1), ("m923", "923", "top", 2), ("m904b", "904b", "top", 3), ("m904a", "904a", "top", 4),
            ("m902_1", "902", "top", 5), ("m902_2", "902", "top", 6), ("m911_1", "911", "top", 7), ("m911_2", "911", "top", 8),
            ("m921a_1", "921a", "bottom", 1), ("m921b_1", "921b", "bottom", 2), ("m921b_2", "921b", "bottom", 3), ("m921", "921", "bottom", 4),
            ("cp3am_1", "cp3am", "bottom", 5), ("cp35", "cp35", "bottom", 6), ("m961", "961", "bottom", 7), ("cm1a", "cm1a", "bottom", 8)]
    lead1 = {"id": "expressive_lead_1", "name": "Expressive Lead #1",
             "description": "Two 921Bs through the CP3A-M and 904A to a 902 under the first 911. A delayed vibrato fades in on held notes: the 921 LFO runs "
                            "through the second 902, opened by the second 911 (long attack, full sustain), into both 921Bs' DC MOD inputs. Legato playing keeps it out.",
             "cords": cords(*keyboard_chain("cm1a", "m921a_1", ["m921b_1", "m921b_2"]), ("m921b_1.sawtooth", "cp3am_1.in1"), ("m921b_2.sawtooth", "cp3am_1.in2"),
                            ("cp3am_1.out_pos_1", "m904a.sig_in"), ("m904a.sig_out", "m902_1.sig_in_pos"), *strig_to("cm1a", "cp35", ["m911_1", "m911_2"]),
                            ("m911_1.out", "m902_1.cv_1"), ("m921.aux", "m902_2.sig_in_pos"), ("m902_2.out_pos", "cp35.mult_b"),
                            ("cp35.mult_b_out_1", "m921b_1.dc_mod"), ("cp35.mult_b_out_2", "m921b_2.dc_mod"), ("m911_2.out", "m902_2.cv_1")),
             "settings": {**S_TRIG, "m921.coarse": "sub", "m921.aux_wave": "sine", "m911_2.t1": 3, "m911_2.esus": 10},
             "source": "quick start guide", "confidence": "inferred",
             "note": "The guide lists 'three of four' 921B waveforms, copied from the System 35 text; with two 921Bs one waveform each (sawtooth) is assumed."}
    patches = [lead1, lead2("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35"), space_rock("m921b_1", "m921b_2"),
               percussive_lead("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35")]
    D = assemble("Behringer_SYSTEM_15.pdf", 15, "2 (top 8, bottom 8)", mods, patches, [],
                 {"modules": 16, "warm_up_min": 30},
                 ["power supply and consumption", "case and dimensions", "how many patch cables are supplied"],
                 ["The Expressive Lead #1 audio list says 'three of four' 921B waveforms, but the System 15 has two 921Bs; the line is copied from the System 35 guide.",
                  "The 911's E SUS is a sustain level (0 to +5.5 V), but its guide calls it a sustain time and the system guides give it in seconds.",
                  "The system guides say the 921 should be in 'Sub' mode; the 921's switch is labelled COARSE RNG with sub-audio and audio positions."],
                 [{"topic": "Module internals", "detail": "Each module is modelled as one block whose jacks expose its nodes; internal circuits are described, not wired."},
                  {"topic": "Multiples and normals", "detail": "Passive multiples are modelled as one input jack and three output jacks on a shared bus; the CP35's half-normalled inputs are a behaviour."}],
                 "Moog System 15 (1973), recreated with Behringer 900-series modules.", "not stated in the quick start guide")
    return D


def system35():
    mods = [("m921a_1", "921a", "top", 1), ("m921b_1", "921b", "top", 2), ("m921b_2", "921b", "top", 3), ("m921a_2", "921a", "top", 4),
            ("m921b_3", "921b", "top", 5), ("m921b_4", "921b", "top", 6), ("m921", "921", "top", 7), ("m914", "914", "top", 8), ("m923", "923", "top", 9),
            ("m904b", "904b", "top", 10), ("m904a", "904a", "top", 11), ("m992", "992", "top", 12), ("cm1a", "cm1a", "top", 13),
            ("cp3ao_1", "cp3ao", "bottom", 1), ("cp3am_1", "cp3am", "bottom", 2), ("cp3ao_2", "cp3ao", "bottom", 3), ("cp3am_2", "cp3am", "bottom", 4),
            ("cp35", "cp35", "bottom", 5), ("m961", "961", "bottom", 6), ("m911_1", "911", "bottom", 7), ("m911_2", "911", "bottom", 8), ("m911_3", "911", "bottom", 9),
            ("m902_1", "902", "bottom", 10), ("m902_2", "902", "bottom", 11), ("m902_3", "902", "bottom", 12)]
    bs3 = ["m921b_1", "m921b_2", "m921b_3"]
    lead1 = {"id": "expressive_lead_1", "name": "Expressive Lead #1",
             "description": "Three 921Bs through the CP3A-M and 904A to a 902 under the first 911, with the second 911 on cutoff. The 921 LFO, gated by the second "
                            "902 under the third 911 (long attack, full sustain), reaches the 921Bs' DC MOD inputs through the CP3A-O's attenuated EXT input: a delayed vibrato on held notes.",
             "cords": cords(*keyboard_chain("cm1a", "m921a_1", bs3), *[(f"{b}.sawtooth", f"cp3am_1.in{i + 1}") for i, b in enumerate(bs3)],
                            ("cp3am_1.out_pos_1", "m904a.sig_in"), ("m904a.sig_out", "m902_1.sig_in_pos"), *strig_to("cm1a", "cp35", ["m911_1", "m911_2", "m911_3"]),
                            ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m904a.cv_1"), ("m921.aux", "m902_2.sig_in_pos"), ("m902_2.out_pos", "cp3ao_1.ext"),
                            *[(f"cp3ao_1.out_{i + 1}", f"{b}.dc_mod") for i, b in enumerate(bs3)], ("m911_3.out", "m902_2.cv_1")),
             "settings": {**S_TRIG, "m921.coarse": "sub", "m921.aux_wave": "sine", "cp3ao_1.route4": True, "m911_3.t1": 3, "m911_3.esus": 10},
             "source": "quick start guide", "confidence": "inferred", "note": "Which of the four waveforms each 921B uses is not specified; sawtooth is assumed."}
    perc = percussive_lead("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35")
    perc["confidence"] = "inferred"
    perc["note"] += " The English System 35 guide omits this patch; it appears only under other languages' headings, matching the System 15 and 55 versions."
    patches = [lead1, space_rock("m921b_1", "m921b_2"), organ("cm1a", ["m921b_1", "m921b_2", "m921b_3", "m921b_4"], "cp35"),
               lead2("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35", with_923=True), perc]
    return assemble("Behringer_System-35.pdf", 35, "2 (top 13, bottom 12)", mods, patches, [],
                    {"modules": 25, "warm_up_min": 30},
                    ["power supply and consumption", "case and dimensions", "how many patch cables are supplied"],
                    ["The Mellow Organ wiring lists the fourth 921B's pitch only via 'two 921A outputs'; the second 921A is assumed to drive it.",
                     "The 911's E SUS is a sustain level, but the guides give it in seconds.",
                     "The guide refers to the 'C3PA-O' and 'CPO3A-M'; these are the CP3A-O and CP3A-M."],
                    [{"topic": "Module internals", "detail": "Each module is one block; internal circuits are described, not wired."},
                     {"topic": "Multiples and normals", "detail": "Passive multiples are one input and three outputs on a bus; CP35 normalling is a behaviour."}],
                    "Moog System 35 (1973), recreated with Behringer 900-series modules.", "not stated in the quick start guide")


def system55():
    mods = [("m914", "914", "top", 1), ("m923", "923", "top", 2), ("m904a", "904a", "top", 3), ("m961", "961", "top", 4), ("m992", "992", "top", 5),
            ("m902_1", "902", "top", 6), ("m902_2", "902", "top", 7), ("m911_1", "911", "top", 8), ("m911_2", "911", "top", 9),
            ("m902_3", "902", "top", 10), ("m902_4", "902", "top", 11), ("m902_5", "902", "top", 12), ("m911a", "911a", "top", 13),
            ("m911_3", "911", "top", 14), ("m911_4", "911", "top", 15),
            ("m921a_1", "921a", "middle", 1), ("m921b_1", "921b", "middle", 2), ("m921b_2", "921b", "middle", 3), ("m921b_3", "921b", "middle", 4),
            ("m921a_2", "921a", "middle", 5), ("m921b_4", "921b", "middle", 6), ("m921b_5", "921b", "middle", 7), ("m921b_6", "921b", "middle", 8),
            ("m921", "921", "middle", 9), ("m960", "960", "middle", 10), ("cm1a", "cm1a", "middle", 11),
            ("cp3ao_1", "cp3ao", "bottom", 1), ("cp3am_1", "cp3am", "bottom", 2), ("m995_1", "995", "bottom", 3), ("cp3ao_2", "cp3ao", "bottom", 4),
            ("cp3am_2", "cp3am", "bottom", 5), ("m995_2", "995", "bottom", 6), ("cp3ao_3", "cp3ao", "bottom", 7), ("cp3am_3", "cp3am", "bottom", 8),
            ("m903a", "903a", "bottom", 9), ("m904b", "904b", "bottom", 10), ("cp35", "cp35", "bottom", 11), ("m962", "962", "bottom", 12)]
    bs3 = ["m921b_1", "m921b_2", "m921b_3"]
    lead1 = {"id": "expressive_lead_1", "name": "Expressive Lead #1",
             "description": "Full three-oscillator lead with delayed vibrato. As the System 35 version, but the 911A delays the trigger to the third 911, so the "
                            "vibrato only starts after the delay (two seconds or more) and never on legato notes.",
             "cords": cords(*keyboard_chain("cm1a", "m921a_1", bs3), *[(f"{b}.sawtooth", f"cp3am_1.in{i + 1}") for i, b in enumerate(bs3)],
                            ("cp3am_1.out_pos_1", "m904a.sig_in"), ("m904a.sig_out", "m902_1.sig_in_pos"), *strig_to("cm1a", "cp35", ["m911_1", "m911_2", "m911a"]),
                            ("m911a.strig_out_1", "m911_3.strig"), ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m904a.cv_1"), ("m921.aux", "m902_2.sig_in_pos"),
                            ("m902_2.out_pos", "cp3ao_1.ext"), *[(f"cp3ao_1.out_{i + 1}", f"{b}.dc_mod") for i, b in enumerate(bs3)], ("m911_3.out", "m902_2.cv_1")),
             "settings": {**S_TRIG, "m921.coarse": "sub", "m921.aux_wave": "sine", "cp3ao_1.route4": True, "m911a.delay_1": 2, "m911_3.t1": 3, "m911_3.esus": 10},
             "source": "quick start guide", "confidence": "inferred", "note": "The multiple's first output goes to '2 x 911 s-trigger Input & 911A s-trigger Input'; 921B waveforms assumed sawtooth."}
    lead1["cords"] = [c for c in lead1["cords"] if c != ["cp35.mult_a_out_3", "m911a.strig"]] + [["cp35.mult_a_out_3", "m911a.strig_1"]]
    harmonic = {"id": "harmonic_sequence", "name": "Harmonic Sequence",
                "description": "The 960 plays two harmonically related eight-note sequences: row A drives the first 921A and its three 921Bs into the 904A, row B the "
                               "second block into the 904B. A 921 sine and the third 911 (attenuated) are summed in the 992 to drive both filters, so the two sequences "
                               "swap places as one opens and the other closes. The 960 clock goes through the 961 to S-triggers. Row C is spare.",
                "cords": cords(("m960.row_a_1", "m921a_1.freq_in_1"), ("m960.row_b_1", "m921a_2.freq_in_1"),
                               ("m921a_1.freq_out", "m921b_1.freq_link"), ("m921b_1.freq_link_thru", "m921b_2.freq_link"), ("m921b_2.freq_link_thru", "m921b_3.freq_link"),
                               ("m921a_2.freq_out", "m921b_4.freq_link"), ("m921b_4.freq_link_thru", "m921b_5.freq_link"), ("m921b_5.freq_link_thru", "m921b_6.freq_link"),
                               *[(f"m921b_{i}.sawtooth", f"cp3am_1.in{i}") for i in (1, 2, 3)], *[(f"m921b_{i + 3}.sawtooth", f"cp3am_2.in{i}") for i in (1, 2, 3)],
                               ("cp3am_1.out_pos_1", "m904a.sig_in"), ("cp3am_2.out_pos_1", "m904b.sig_in"), ("m904a.sig_out", "m902_1.sig_in_pos"),
                               ("m904b.sig_out", "m902_2.sig_in_pos"), ("m902_1.out_pos", "cp3am_3.in1"), ("m902_2.out_pos", "cp3am_3.in2"),
                               ("m960.osc_out", "m961.vtrig_a_l_1"), ("m961.strig_out_l", "cp35.mult_a"), ("cp35.mult_a_out_1", "m911_1.strig"),
                               ("cp35.mult_a_out_2", "m911_2.strig"), ("cp35.mult_a_out_3", "m911_3.strig"), ("m911_1.out", "m902_1.cv_1"), ("m911_2.out", "m902_2.cv_1"),
                               ("m911_3.out", "m992.ext"), ("m921.aux", "m992.in1"), ("m992.out_1", "m904a.cv_1"), ("m992.out_2", "m904b.cv_1")),
                "settings": {"m921.coarse": "sub", "m921.aux_wave": "sine", "m992.switch1": True, "m992.switch4": True},
                "source": "quick start guide", "confidence": "inferred",
                "note": "Which 921B waveforms are used is not stated (sawtooth assumed). The guide says the outputs of the filters cross-fade 'as one opens'; with both filters on the same CV, the low-pass and high-pass move in opposite senses."}
    patches = [lead1, space_rock("m921b_1", "m921b_2"), organ("cm1a", ["m921b_1", "m921b_2", "m921b_3", "m921b_4"], "cp35"),
               lead2("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35", with_923=True), percussive_lead("cm1a", "m921a_1", "m921b_1", "m921b_2", "cp35"), harmonic]
    return assemble("Behringer_System-55.pdf", 55, "3 (top 15, middle 11, bottom 12)", mods, patches, [],
                    {"modules": 38, "warm_up_min": 30},
                    ["case and dimensions", "how many patch cables are supplied", "the 995's controls (its guide was not read; modelled from the Moog 995)"],
                    ["The 911's E SUS is a sustain level, but the guides give it in seconds.",
                     "The Expressive Lead #1 text says the 911A feeds the third 911; its table lists '911A Output → 3rd 911'.",
                     "Perfect Circuit lists two outputs on the 962; its guide shows parallel OUTPUT jacks."],
                    [{"topic": "Module internals", "detail": "Each module is one block; internal circuits are described, not wired."},
                     {"topic": "995", "detail": "Controls and jacks inferred from the Moog 995 (three attenuators); not confirmed against Behringer's guide."},
                     {"topic": "Multiples and normals", "detail": "Passive multiples are one input and three outputs on a bus; CP35 normalling is a behaviour."}],
                    "Moog System 55 (1973), recreated with Behringer 900-series modules.", {"adaptor": "13 V DC, 5 A, two supplied", "consumption_w": 65})


for fn, name in ((system15, "behringer-system-15_synth.json"), (system35, "behringer-system-35_synth.json"), (system55, "behringer-system-55_synth.json")):
    finish(fn(), "/mnt/user-data/outputs/" + name)
