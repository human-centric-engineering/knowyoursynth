#!/usr/bin/env python3
"""Assemble the EMS VCS3 device file.

The VCS3 has almost no fixed routing: every device's inputs and outputs meet on a
16 x 16 resistive pin matrix. The matrix is modelled in patch_matrix (schema 0.9.0, which adds
level_param on rows and offset_param on columns);
connections holds only the little internal wiring there is.

The file models the Mk 1 (1969 to about 1972), the version the manual describes. Later
versions and common modifications are recorded in modelling_gaps, not modelled.
"""
import json

D = {"schema_version": "0.9.0"}
D["device"] = {
    "id": "ems-vcs3", "manufacturer": "EMS (Electronic Music Studios, London)", "model": "VCS3 Mk 1 (Voltage Controlled Studio Mk 3)",
    "category": "self-contained analogue 'compact electronic music studio': three oscillators, treatments, pin-matrix patching, joystick, speakers",
    "based_on": "Original design by David Cockerell for EMS, introduced 1969; the source of the Synthi A and AKS.",
    "sources": [
        {"id": "manual", "title": "VCS3 Compact Electronic Music Studio Users Manual (EMS)", "kind": "user_manual", "file": "EMS_VCS3_Manual.pdf",
         "pages": 48,
         "note": "Scanned; read by OCR at 300 dpi. Full specification with dial calibration tables and control sensitivities, a matrix "
                 "tutorial with labelled matrix diagram, a description of every device, external equipment and maintenance sections, "
                 "15 specimen patch sheets (knob settings drawn as dials, not readable by OCR) and a glossary. The matrix layout (separate "
                 "rows for each Osc 1 and Osc 2 waveform) is the Mk 1's."},
        {"id": "sos", "title": "Sound On Sound: 'All About EMS: Part 1' and 'EMS VCS3 [Retrozone]'", "kind": "other",
         "file": "https://www.soundonsound.com/music-business/all-about-ems-part-1",
         "note": "Pin colours and tolerances, the DK1 keyboard connection and its control voltage scaling, a worked matrix patch."},
        {"id": "musicradar", "title": "MusicRadar, 'Vintage music tech icons: EMS VCS3'", "kind": "other",
         "file": "https://www.musicradar.com/news/vintage-music-tech-icons-EMS-VCS3",
         "note": "Filter as a diode ladder; Mk 1 against Mk 2 oscillator outputs; the unbuffered matrix's interactions."},
        {"id": "forums", "title": "Mod Wiggler EMS pin threads; Hinton Instruments EMS modifications; synthi.co.uk CV interface manual", "kind": "other",
         "file": "https://modwiggler.com/forum/viewtopic.php?t=123313",
         "note": "Pin resistor values (white and red 2.7 kohm, green 68 kohm attenuating), Mk 1 and Mk 2 Jones socket differences, common modifications."},
        {"id": "digitana", "title": "Digitana Electronics, Synthi VCS3 CV & Gate Interface instruction manual (2010)", "kind": "other",
         "file": "https://www.synthi.co.uk/wp-content/uploads/sites/5/2017/01/VCS3_CV_unit_Manual.pdf",
         "note": "Jones socket pinout; envelope trigger voltage; inverting input amplifiers and negative-going pitch control; Mk 1 has no sequencer input on row 16."},
        {"id": "portabella", "title": "Portabella (portabellabz.be), PCBs for Synthi, VCS3, DK1, Cricklewood", "kind": "other",
         "file": "https://www.portabellabz.be/synthipcbs.html",
         "note": "Meter on matrix column A on Mk 1 and new Cornwall units, column B on Mk 2."},
        {"id": "modwiggler_mk", "title": "Mod Wiggler, 'VCS3 or synthi?' and 'Ems vcs3 sonic differences mk1 to mk2'", "kind": "other",
         "file": "https://modwiggler.com/forum/viewtopic.php?t=7935&start=30",
         "note": "Mk 1 matrix has separate Osc 1 and 2 waveform rows and no output channel rows; Mk 2 the reverse. Yellow pins as standard 2.7 kohm. Mk 1 power amplifier IC and reverb tank."},
        {"id": "sos_xils", "title": "Sound On Sound, review of XILS Lab XILS 3", "kind": "other",
         "file": "https://www.soundonsound.com/reviews/xils-lab-xils-3",
         "note": "Filter slope change in 1974; output filter low-pass below 5 and high-pass above 5."},
        {"id": "rlmusic", "title": "RL Music, EMS VCS3 Mk2 sales listing (EMS-modified unit, 1972)", "kind": "other",
         "file": "https://www.rlmusic.co.uk/rlm3/ems-vcs3-mk2-3/",
         "note": "List of EMS factory modifications; used only to identify controls that are not part of a stock Mk 1."},
        {"id": "photos", "title": "Photographs supplied by the user: a Mk 2 matrix, and a modified Mk 2 with its matrix rewired to Mk 1 rows", "kind": "other",
         "file": "EMS_VCS3_Mk_II_Routing_Matrix.jpg; EMS_VCS3_II.jpg",
         "note": "Panel legends tying each level knob to its matrix row and each control knob to its matrix column; Mk 2 matrix layout for comparison."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive",
    "synthesis_note": "subtractive at heart, with ring modulation and FM by patching audio into control inputs", "signal_path": "analogue", "voices": 1,
    "polyphony_mode": "none as such: three free-running oscillators that can sound together as a chord; no keyboard (EMS DK1 or DK2 optional)",
    "poly_chain_max_units": None, "patch_memory": False, "semi_modular": False,
    "routing": "pin matrix",
    "panel_counts": {"knobs": 30, "slow_motion_dials": 3, "switches": 4, "joystick": 1, "push_button": 1, "matrix_points": 256},
    "summary": (
        "Not a keyboard synthesizer but a small studio. Nothing is connected until pins are placed in a 16 x 16 matrix: rows are the "
        "outputs of every device (three oscillators' waveforms, noise, two input amplifiers, filter, envelope trapezoid and signal, "
        "ring modulator, reverb, joystick X and Y) and columns are inputs, signal inputs on the left (meter, two output amplifiers, "
        "envelope, ring modulator A and B, reverb, filter) and control inputs on the right (three oscillator frequencies, envelope "
        "decay, reverb mix, filter frequency, two output amplifier levels). Each pin holds a 2.7 kohm resistor, so several pins in one "
        "column mix, and any output can drive any input, signal or control. Oscillator 1 gives sine (with a shape control) and ramp; "
        "Oscillators 2 and 3 give square/pulse and triangle/ramp from one shape control; Oscillator 3 runs from about one cycle a "
        "minute to 500 Hz and is the main control source. The filter doubles as a sine oscillator. The envelope shaper is a "
        "self-repeating trapezoid generator with its own VCA. Two output amplifiers with voltage-controlled level, tone and pan feed "
        "internal speakers and rear outputs. A joystick gives two control voltages."
    ),
}

M, P, J, C = [], [], [], []


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, function, access=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = access or [{"type": "panel", "control": "knob"}]
    p["function"] = function
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, direction, signal, node, function, connector="6.35mm TS (2-way)", combine=None, electrical=None, note=None, confidence=None):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node}
    if combine:
        j["combine"] = combine
    if electrical:
        j["electrical"] = electrical
    j["function"] = function
    if note:
        j["note"] = note
    if confidence:
        j["confidence"] = confidence
    J.append(j)


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


S10 = {"min": 0, "max": 10}
DIAL = [{"type": "panel", "control": "slow_motion_dial"}]
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
OSC12_CAL = {"0": 0.6, "1": 1.7, "2": 4.4, "3": 11.6, "4": 32.7, "5": 92.5, "6": 261.6, "7": 740, "8": 2093, "9": 5920, "10": 16750}
OSC3_CAL = {"0": 0.015, "1": 0.043, "2": 0.122, "3": 0.344, "4": 0.975, "5": 2.76, "6": 7.82, "7": 22.2, "8": 62.5, "9": 177, "10": 500}

# --------------------------------------------------------------------------
# modules
# --------------------------------------------------------------------------
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATOR 1",
    "Sine and ramp outputs, each with its own level, on rows 1 and 2. The shape control acts on the sine output only: at its centre "
    "point it is a pure sine, either side it distorts towards a rectified shape. 1 Hz to 10 kHz on the slow-motion dial, 1.5 octaves "
    "per major division. Frequency control on column I.",
    ["osc1.freq_cv"], ["osc1.sine", "osc1.ramp"],
    {"frequency_hz": {"min": 1, "max": 10000}, "dial_calibration_hz": OSC12_CAL, "octaves_per_division": 1.5,
     "cv_sensitivity_v_per_octave": 0.32, "max_output_vpp": {"sine": 3, "ramp": 4}})
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATOR 2",
    "Square and triangle outputs, each with its own level, on rows 3 and 4. One shape control acts on both: off centre the triangle "
    "becomes a ramp and the square a pulse, so changing one changes the other. At the extremes the pulse vanishes and the output is "
    "effectively DC. Same range as Oscillator 1. Frequency control on column J.",
    ["osc2.freq_cv"], ["osc2.square", "osc2.triangle"],
    {"frequency_hz": {"min": 1, "max": 10000}, "dial_calibration_hz": OSC12_CAL, "octaves_per_division": 1.5,
     "cv_sensitivity_v_per_octave": 0.32, "max_output_vpp": {"square": 4, "triangle": 3, "triangle_as_ramp": 6}})
mod("osc3", "oscillator", "Oscillator 3", "OSCILLATOR 3",
    "As Oscillator 2 but about 20 times slower: from more than 40 seconds per cycle to 500 Hz. Intended mainly as a control source "
    "(the role an LFO plays elsewhere), audible only at the top of its range, roughly dial 7 to 10. Rows 5 and 6; frequency control on column K.",
    ["osc3.freq_cv"], ["osc3.square", "osc3.triangle"],
    {"role": "control (LFO) and low audio", "frequency_hz": {"min": 0.015, "max": 500}, "dial_calibration_hz": OSC3_CAL,
     "cv_sensitivity_v_per_octave": 0.26, "max_output_vpp": {"square": 4, "triangle": 3, "triangle_as_ramp": 6}})
mod("noise", "noise", "Noise Generator", "NOISE GENERATOR",
    "Not voltage controlled. Colour control from dark (low-pass) through white (centre) to light (high-pass), and a level, on row 7. "
    "Takes 20 to 30 seconds to start after power-on.", [], ["noise.out"], {"max_output_vpp": 3, "warm_up_s": [20, 30],
     "colour_circuit": "passive balance between a low-pass and a high-pass network of the same turnover frequency (inferred from a DIY circuit described as derived from the VCS3)"})
for n in (1, 2):
    mod(f"in_amp{n}", "preamp", f"Input Amplifier {n}", "INPUT AMPLIFIERS",
        f"Brings an external signal or control voltage onto row {7 + n}. Fed by the MIC {n} jack, the HI LEVEL INPUT {n} jack (DC coupled, "
        "so usable for control voltages) or a low-level DC input on the KEYBOARD socket, one at a time. Voltage gain of 2, inverting.",
        [f"in_amp{n}.in"], [f"in_amp{n}.out"], {"voltage_gain": -2, "inverting": True, "inverting_source": "Digitana"})
mod("ring_mod", "ring_modulator", "Ring Modulator", "RING MODULATOR",
    "Transformerless IC ring modulator: output only when both inputs (columns E and F) carry signal, sum and difference frequencies "
    "with the inputs suppressed. AC coupled, so slow inputs are differentiated and DC has no effect. One output level control, row 13.",
    ["ring_mod.in_a", "ring_mod.in_b"], ["ring_mod.out"],
    {"max_input_vpp_undistorted": 1.5, "max_output_vpp": 6, "breakthrough_db": -60, "coupling": "AC"})
mod("vcf", "filter", "Filter/Oscillator", "FILTER/OSCILLATOR",
    "Low-pass filter whose RESPONSE control narrows it into a resonant peak (high-Q at about 5 to 6) and then, a little beyond, into "
    "a low-distortion sine oscillator, the purest sine in the instrument. Cut-off falls at 12 dB in the first octave and 18 dB per "
    "octave beyond. 5 Hz to 10 kHz. Signal in on column H, frequency control on column N, output on row 10.",
    ["vcf.in", "vcf.freq_cv"], ["vcf.out"],
    {"modes": ["lowpass", "resonator", "sine oscillator"], "slope": "12 dB first octave, then 18 dB/octave", "cutoff_hz": {"min": 5, "max": 10000},
     "max_stable_q": 20, "cv_sensitivity_v_per_octave": 0.2, "topology": "diode ladder (MusicRadar)", "self_oscillates": True,
     "version_note": "12/18 dB slope applies to units sold 1969 to 1974; EMS changed the filter to 24 dB/octave in 1974 (Sound On Sound)"})
mod("env", "envelope", "Envelope Shaper", "ENVELOPE SHAPER",
    "A trapezoid generator with its own amplifier. Four times (attack, on, decay, off) form a cycle that repeats on its own, up to "
    "about 60 Hz with all times at minimum and down to about 20 seconds per cycle; with OFF turned past about 5 to 7 the cycle stops "
    "after each decay and waits for the ATTACK button or a keyboard trigger. Signal in on column D comes out shaped on row 12; the "
    "control shape itself is on row 11 (the trapezoid). Decay time is voltage controlled from column L, which also changes the "
    "repetition rate. A lamp shows bright for attack and on, dim for decay and off.",
    ["env.signal_in", "env.decay_cv", "env.trigger_in"], ["env.trapezoid", "env.signal_out"],
    {"stages": ["attack", "on", "decay", "off"], "attack_s": [0.002, 1], "on_s": [0, 2.5], "decay_s": [0.003, 15], "off_s": [0.010, 5],
     "max_repetition_hz": 60, "decay_cv_v_per_doubling": 0.4, "trapezoid_v": {"on": -3, "off": 3},
     "trigger": {"source": "ATTACK button or Jones socket pin 5", "polarity": "positive", "threshold_v": [4, 5], "source_ref": "Digitana"}})
mod("reverb", "reverb", "Reverberation Unit", "REVERBERATION UNIT",
    "Twin spring line (25 and 30 ms delays, over 2 seconds' reverberation) with a MIX control from dry to almost all spring, voltage "
    "controlled from column M (-2 V dry, +2 V full). Signal in on column G, output on row 14. Sensitive to knocks and to acoustic "
    "feedback from the internal speakers.",
    ["reverb.in", "reverb.mix_cv"], ["reverb.out"],
    {"spring_delays_ms": [25, 30], "reverb_time_s_min": 2, "mix_cv_v": {"dry": -2, "full": 2}})
mod("joystick", "manual_controller", "Joystick", "JOYSTICK (lower panel)",
    "Two potentiometers at right angles, moved in a square. Each axis has a RANGE control; output is 0 V at centre, negative down and "
    "left, positive up and right, up to plus or minus 2 V. Horizontal on row 15, vertical on row 16. Effective on control columns; on "
    "signal columns only the ring modulator 'bowing' trick uses it.",
    [], ["joystick.x", "joystick.y"], {"range_v": [-2, 2]})
mod("meter", "meter", "Meter and scope tap", "METER",
    "1 mA moving-coil meter on column A. CONTROL VOLTAGES: centre-zero DC, plus or minus 1 V. SIGNAL LEVELS: left-zero AC, 4 V p-p full "
    "scale. The SCOPE jack is connected to the same column, so column A is also a third route out of the matrix.",
    ["meter.in"], ["meter.scope"])
for n, (col, cv) in {1: ("B", "O"), 2: ("C", "P")}.items():
    mod(f"out_amp{n}", "vca", f"Output Amplifier {n}", "OUTPUT AMPLIFIERS",
        f"Voltage-controlled output amplifier: signal in on column {col}, level control on column {cv}. The large level knob is itself a "
        "control voltage, so with nothing on the control column the signal only appears at about half travel, and added control can "
        "make the signal impossible to cut. Bass and treble roll-off filter, flat at 5. Feeds the internal speaker (through its muting "
        f"switch), the headphones and, through its PAN control, the signal outputs. The CONTROL OUTPUT {n} jack taps column {col} before "
        "the amplifier, DC coupled.",
        [f"out_amp{n}.in", f"out_amp{n}.level_cv"], [f"out_amp{n}.out", f"out_amp{n}.control_tap"])
mod("output", "output", "Outputs and speakers", "OUTPUTS",
    "Two 1 W amplifiers and 5-inch internal speakers (non-panning), the stereo headphone socket (non-panning, high level), and the "
    "L and R signal outputs (panned).", ["output.in1", "output.in2"], ["output.signal_l", "output.signal_r", "output.phones"])
D["modules"] = M

# --------------------------------------------------------------------------
# parameters
# --------------------------------------------------------------------------
for n in (1, 2):
    par(f"osc{n}.frequency", f"osc{n}", "FREQUENCY", "continuous", "Slow-motion dial; numbers are for logging, not Hz. 1.5 octaves per major division.",
        access=DIAL, panel_scale=S10, physical={"min": 1, "max": 10000, "unit": "Hz", "taper": "exponential, 1.5 octaves per division",
                                                "note": "calibration table on the module; extremes (0.6 Hz, 16.75 kHz) may be outside tolerance"})
par("osc3.frequency", "osc3", "FREQUENCY", "continuous", "Slow-motion dial, about 20 times slower than Oscillators 1 and 2 at the same setting.",
    access=DIAL, panel_scale=S10, physical={"min": 0.015, "max": 500, "unit": "Hz", "taper": "exponential", "note": "calibration table on the module"})
par("osc1.shape", "osc1", "SHAPE", "continuous", "Applies to the sine output only. Centre: pure sine. Either side: progressively rectified and asymmetric.", panel_scale=S10)
par("osc1.sine_level", "osc1", "SINE LEVEL", "continuous", "Amount of sine at row 1.", panel_scale=S10)
par("osc1.ramp_level", "osc1", "RAMP LEVEL", "continuous", "Amount of ramp at row 2. In phase with the sine, so the two can be mixed with two pins.", panel_scale=S10)
for n in (2, 3):
    par(f"osc{n}.shape", f"osc{n}", "SHAPE", "continuous", "Acts on both outputs: centre is square and triangle; off centre gives pulse and ramp. At the extremes the pulse disappears.", panel_scale=S10)
    par(f"osc{n}.square_level", f"osc{n}", "SQUARE LEVEL", "continuous", f"Amount of square or pulse at row {2 * n - 1}.", panel_scale=S10)
    par(f"osc{n}.triangle_level", f"osc{n}", "TRIANGLE LEVEL", "continuous", f"Amount of triangle or ramp at row {2 * n}.", panel_scale=S10)
par("noise.colour", "noise", "COLOUR", "continuous", "Left dark (low-pass), centre white, right light (high-pass).", panel_scale={"min": 0, "max": 10, "unit": "dark to light"})
par("noise.level", "noise", "LEVEL", "continuous", "Amount of noise at row 7.", panel_scale=S10)
for n in (1, 2):
    par(f"in_amp{n}.level", f"in_amp{n}", f"INPUT LEVEL CHANNEL {n}", "continuous", f"Gain of input channel {n} onto row {7 + n}. Start at zero with unknown inputs.", panel_scale=S10)
par("ring_mod.level", "ring_mod", "LEVEL", "continuous", "Ring modulator output at row 13.", panel_scale=S10)
par("vcf.frequency", "vcf", "FREQUENCY", "continuous", "Large knob: cut-off, centre or oscillator frequency across the audio range.", panel_scale=S10,
    physical={"min": 5, "max": 10000, "unit": "Hz", "taper": "exponential"})
par("vcf.response", "vcf", "RESPONSE", "continuous", "0: low-pass. About 5 to 6: high-Q resonator. A little beyond, and higher: oscillates as a sine source.",
    panel_scale={"min": 0, "max": 10, "unit": "low pass to oscillation"})
par("vcf.level", "vcf", "LEVEL", "continuous", "Filter output at row 10.", panel_scale=S10)
par("env.attack", "env", "ATTACK", "continuous", "Rise time, 2 ms to 1 s. Interacts slightly with ON: if attack exceeds on, decay begins before attack ends.", panel_scale=S10,
    physical={"min": 0.002, "max": 1, "unit": "s"})
par("env.on", "env", "ON", "continuous", "Hold time at full, 0 to 2.5 s.", panel_scale=S10, physical={"min": 0, "max": 2.5, "unit": "s"})
par("env.decay", "env", "DECAY", "continuous", "Fall time, 3 ms to 15 s. Voltage controlled from column L at 0.4 V per doubling; also changes the repeat rate.", panel_scale=S10,
    physical={"min": 0.003, "max": 15, "unit": "s"})
par("env.off", "env", "OFF", "continuous", "First half: off time 10 ms to about 5 s, auto-repeating. Somewhere between 5 and 7 (later if decay is long) the cycle stops and waits for a trigger.",
    panel_scale=S10, physical={"min": 0.010, "max": 5, "unit": "s", "note": "beyond about 5 to 7 on the dial: manual (triggered) mode"})
par("env.signal_level", "env", "SIGNAL LEVEL", "continuous", "Level of the shaped signal at row 12.", panel_scale=S10)
par("env.trapezoid_level", "env", "TRAPEZOID LEVEL", "continuous", "Level of the trapezoid control shape at row 11.", panel_scale=S10)
par("env.attack_button", "env", "ATTACK BUTTON", "boolean", "Starts the cycle in manual mode; ON lasts as long as it is held, then decay runs.",
    access=[{"type": "panel", "control": "push_button", "note": "lower panel, right of the joystick"}], values=ONOFF)
par("reverb.mix", "reverb", "MIX", "continuous", "Direct to reverberated. Left: dry (an amplifier). Right: nearly all spring.", panel_scale=S10)
par("reverb.level", "reverb", "LEVEL", "continuous", "Reverb unit output at row 14.", panel_scale=S10)
par("joystick.x", "joystick", "JOYSTICK (horizontal)", "continuous", "Left-right position.", access=[{"type": "panel", "control": "joystick"}],
    panel_scale={"min": -1, "max": 1}, bipolar=True)
par("joystick.y", "joystick", "JOYSTICK (vertical)", "continuous", "Up-down position.", access=[{"type": "panel", "control": "joystick"}],
    panel_scale={"min": -1, "max": 1}, bipolar=True)
par("joystick.range_x", "joystick", "RANGE (horizontal)", "continuous", "Depth of the horizontal axis: 0 none, 10 plus or minus 2 V.", panel_scale=S10, physical={"min": 0, "max": 2, "unit": "V peak"})
par("joystick.range_y", "joystick", "RANGE (vertical)", "continuous", "Depth of the vertical axis.", panel_scale=S10, physical={"min": 0, "max": 2, "unit": "V peak"})
par("meter.mode", "meter", "METER", "enum", "Meter range.", access=[{"type": "panel", "control": "toggle_switch"}],
    values=[{"value": "control_voltages", "meaning": "centre-zero DC, plus or minus 1 V; 0.5 on the scale is 0 V"},
            {"value": "signal_levels", "meaning": "left-zero AC, 4 V p-p full scale"}])
for n in (1, 2):
    par(f"out_amp{n}.level", f"out_amp{n}", f"OUTPUT LEVEL CHANNEL {n}", "continuous",
        "Large knob on the lower panel. Sets the amplifier's control voltage, so the signal appears only at about half travel unless column "
        f"{'O' if n == 1 else 'P'} carries control; added control can make the signal impossible to cut.", panel_scale=S10)
    par(f"out_amp{n}.filter", f"out_amp{n}", f"OUTPUT FILTER CHANNEL {n}", "continuous", "Tone: 5 flat, left cuts treble, right cuts bass. Reset to 5 for each new patch.",
        panel_scale={"min": 0, "max": 10, "unit": "treble cut to bass cut"}, default=5)
    par(f"out_amp{n}.pan", f"out_amp{n}", f"PAN CHANNEL {n} (EXT)", "continuous", "Position between the L and R signal outputs. Does not affect the internal speakers or headphones.",
        panel_scale={"min": 0, "max": 10, "unit": "L to R"}, default=0 if n == 1 else 10)
    par(f"out_amp{n}.mute", f"out_amp{n}", f"MUTING SWITCH CHANNEL {n}", "boolean", "Up: internal speaker on.", access=[{"type": "panel", "control": "toggle_switch"}], values=ONOFF)
par("output.mains", "output", "MAINS ON/OFF", "boolean", "Power. The red neon beside it lights.", access=[{"type": "panel", "control": "toggle_switch"}], values=ONOFF)
D["parameters"] = P

# --------------------------------------------------------------------------
# ports (rear panel)
# --------------------------------------------------------------------------
for n in (1, 2):
    jack(f"jack.mic{n}", f"MIC INPUT {n}", "in", "audio", f"in_amp{n}.in", f"Microphone into input channel {n}: 5 mV into 600 ohms.",
         combine="replace", electrical={"sensitivity_mv": 5, "impedance_ohm": 600}, note="Only one input per channel at a time.")
    jack(f"jack.hi{n}", f"HI LEVEL INPUT {n}", "in", "cv_or_audio", f"in_amp{n}.in", f"Line or DC control input to channel {n}: 1.8 V AC rms or plus or minus 2.5 V DC into 50 kohm; DC coupled.",
         combine="replace", electrical={"max_vac_rms": 1.8, "max_vdc": 2.5, "impedance_ohm": 50000})
    jack(f"jack.control_out{n}", f"CONTROL OUTPUT {n}", "out", "cv_or_audio", f"out_amp{n}.control_tap",
         f"DC output taken from column {'B' if n == 1 else 'C'} at the output amplifier's input. Best load 10 kohm, not below 2 kohm.",
         electrical={"load_ohm_optimum": 10000, "load_ohm_min": 2000})
jack("jack.signal_l", "SIGNAL OUTPUT L", "out", "audio", "output.signal_l", "Panned line output, 2 V p-p into 600 ohms.", electrical={"max_vpp": 2, "load_ohm": 600})
jack("jack.signal_r", "SIGNAL OUTPUT R", "out", "audio", "output.signal_r", "Panned line output, 2 V p-p into 600 ohms.", electrical={"max_vpp": 2, "load_ohm": 600})
jack("jack.phones", "HEADPHONES (STEREO)", "out", "audio", "output.phones", "High-level non-panning stereo output, 10 V p-p into 50 ohms. Tip left, ring right; a 2-way plug shorts one side.",
     connector="6.35mm TRS (3-way)", electrical={"max_vpp": 10, "load_ohm": 50})
jack("jack.scope", "SCOPE", "out", "cv_or_audio", "meter.scope", "Connected to matrix column A, so it carries whatever is pinned to the meter. Usable for an oscilloscope or to feed a signal back in through an input amplifier.")
jack("jack.keyboard", "KEYBOARD (Jones socket)", "in", "gate", "env.trigger_in",
     "8-pin socket for EMS devices such as the DK1 and DK2 keyboards: two low-level DC inputs (to the input channels), a trigger for the "
     "envelope shaper, stabilised supplies and a meter connection. Supplies must not be shorted.",
     connector="Jones 8-pin", note="Pinout (Digitana, written for the Mk 2): 1 input channel 1, 2 -9 V, 3 ground, 4 +12 V, 5 envelope shaper trigger "
     "(positive, about 4 to 5 V), 6 input channel 2, 7 meter, 8 matrix row 16 on the Mk 2 only. On the Mk 1 pin 8 is not connected to the matrix. "
     "The low-level DC inputs on pins 1 and 6 (150 uA into 500 ohm) reach in_amp1 and in_amp2.",
     confidence="inferred")
jack("jack.mains", "MAINS INPUT", "in", "power", None, "Miniature 3-pin mains input, 220 to 245 V or 105 to 115 V AC by internal tapping; 1 A fuse beside it.", connector="3-pin mains")
D["ports"] = J

# --------------------------------------------------------------------------
# fixed internal wiring (the only connections that exist without pins)
# --------------------------------------------------------------------------
con("c01", "out_amp1.out", "output.in1", "audio", "fixed", amount="out_amp1.level", note="To speaker 1 (via mute), headphone left and, panned, the signal outputs.")
con("c02", "out_amp2.out", "output.in2", "audio", "fixed", amount="out_amp2.level", note="To speaker 2 (via mute), headphone right and, panned, the signal outputs.")
D["connections"] = C

# --------------------------------------------------------------------------
# the matrix
# --------------------------------------------------------------------------
ROWS = [("1", "Osc 1 sine", "osc1.sine"), ("2", "Osc 1 ramp", "osc1.ramp"), ("3", "Osc 2 square", "osc2.square"), ("4", "Osc 2 triangle", "osc2.triangle"),
        ("5", "Osc 3 square", "osc3.square"), ("6", "Osc 3 triangle", "osc3.triangle"), ("7", "Noise", "noise.out"), ("8", "Input amp 1", "in_amp1.out"),
        ("9", "Input amp 2", "in_amp2.out"), ("10", "Filter", "vcf.out"), ("11", "Trapezoid", "env.trapezoid"), ("12", "Envelope signal", "env.signal_out"),
        ("13", "Ring modulator", "ring_mod.out"), ("14", "Reverb", "reverb.out"), ("15", "Joystick horizontal", "joystick.x"), ("16", "Joystick vertical", "joystick.y")]
COLS = [("A", "Meter (and SCOPE)", "meter.in", "monitor"), ("B", "Output amp 1", "out_amp1.in", "signal"), ("C", "Output amp 2", "out_amp2.in", "signal"),
        ("D", "Envelope shaper in", "env.signal_in", "signal"), ("E", "Ring mod input A", "ring_mod.in_a", "signal"), ("F", "Ring mod input B", "ring_mod.in_b", "signal"),
        ("G", "Reverb in", "reverb.in", "signal"), ("H", "Filter in", "vcf.in", "signal"), ("I", "Osc 1 frequency", "osc1.freq_cv", "control"),
        ("J", "Osc 2 frequency", "osc2.freq_cv", "control"), ("K", "Osc 3 frequency", "osc3.freq_cv", "control"), ("L", "Envelope decay", "env.decay_cv", "control"),
        ("M", "Reverb mix", "reverb.mix_cv", "control"), ("N", "Filter frequency", "vcf.freq_cv", "control"), ("O", "Output amp 1 level", "out_amp1.level_cv", "control"),
        ("P", "Output amp 2 level", "out_amp2.level_cv", "control")]
# The panel prints the matching row number beside each level knob and the column letter beside
# each control column's manual knob, so the knob-to-matrix link is printed on the instrument.
ROW_LEVEL = {"1": "osc1.sine_level", "2": "osc1.ramp_level", "3": "osc2.square_level", "4": "osc2.triangle_level",
             "5": "osc3.square_level", "6": "osc3.triangle_level", "7": "noise.level", "8": "in_amp1.level", "9": "in_amp2.level",
             "10": "vcf.level", "11": "env.trapezoid_level", "12": "env.signal_level", "13": "ring_mod.level", "14": "reverb.level",
             "15": "joystick.range_x", "16": "joystick.range_y"}
COL_OFFSET = {"I": "osc1.frequency", "J": "osc2.frequency", "K": "osc3.frequency", "L": "env.decay", "M": "reverb.mix",
              "N": "vcf.frequency", "O": "out_amp1.level", "P": "out_amp2.level"}
D["patch_matrix"] = {
    "kind": "resistive_pin", "size": "16 x 16 (256 points)",
    "rows": [dict({"id": r, "label": l, "node": n}, **({"level_param": ROW_LEVEL[r]} if r in ROW_LEVEL else {})) for r, l, n in ROWS],
    "columns": [dict({"id": c, "label": l, "node": n, "class": k}, **({"offset_param": COL_OFFSET[c]} if c in COL_OFFSET else {}))
                for c, l, n, k in COLS],
    "pins": [
        {"name": "white", "resistance_ohm": 2700, "tolerance_pct": 5, "purpose": "standard pin for any connection", "source": "manual (2.7 kohm); tolerance from Sound On Sound"},
        {"name": "red", "resistance_ohm": 2700, "tolerance_pct": 2, "purpose": "precision pin for oscillator pitch control, so two oscillators track together",
         "confidence": "inferred", "source": "Sound On Sound and Hinton Instruments; Mod Wiggler posters say 1%"},
        {"name": "green", "resistance_ohm": 68000, "tolerance_pct": None, "purpose": "attenuating pin, roughly halving or less a signal's effect",
         "confidence": "inferred", "source": "Mod Wiggler; not in the manual"},
        {"name": "yellow", "resistance_ohm": 2700, "tolerance_pct": None, "purpose": "standard pin, used like white",
         "confidence": "inferred", "source": "Mod Wiggler; Digitana groups yellow with white as standard pins"},
    ],
    "combine": "sum",
    "electrical": {"input_impedance_ohm": 10000, "pin_resistor_ohm": 2700, "input_sensitivity_vpp_full_range": 1.5, "output_impedance_ohm": [300, 3000],
                   "typical_output_vpp": 2, "inter_row_capacitance_pf": 50, "crosstalk_note": "small HF crosstalk to open inputs, about 12 dB less once an input is in use"},
    "note": ("Rows carry device outputs and columns device inputs; the manual marks signal inputs with round boxes and control inputs with "
             "square boxes. Pins in the same column sum; pins in the same row distribute one output to several inputs. The matrix is "
             "unbuffered, so adding pins or changing output levels alters other connections. Any row can go to any column: audio into "
             "control columns gives FM or AM, and control into signal columns is mostly ineffective except at the AC-coupled ring modulator. "
             "Each row's level_param is the knob that scales that output before it reaches the matrix, and each control column's "
             "offset_param is the manual knob the pinned voltages add to; the panel prints the row number or column letter beside each one. "
             "Signal columns have no offset; their module's panel heading carries the column letter (D envelope, E and F ring modulator, "
             "G reverb, H filter). This is the Mk 1 layout: separate rows for each Osc 1 and Osc 2 waveform, no output channel rows, "
             "meter on column A (confirmed by Portabella), and row 16 is the joystick only."),
}

# --------------------------------------------------------------------------
# patches from the manual
# --------------------------------------------------------------------------
D["example_patches"] = [
    {"id": "swept_noise", "name": "Swept coloured noise (Specimen Patch 1)", "source": "manual Section III and Section VII sheet 1",
     "pins": ["H7", "D10", "B12", "C12", "L2", "L4", "N6", "O16", "P15"],
     "description": "Noise through the filter and envelope shaper to both outputs. Osc 1 ramp and Osc 2 triangle, tuned close to beat, modulate the "
                    "envelope decay; Osc 3 triangle sweeps the filter; the joystick controls both output levels. Variants: L1, L3, N5.",
     "confidence": "stated"},
    {"id": "ring_octave", "name": "Ring modulator octave", "source": "manual, Ring Modulator", "pins": ["E1", "F10", "B13"],
     "settings": {"osc1.frequency": 6, "vcf.frequency": 5, "vcf.level": 10, "vcf.response": 7},
     "description": "Osc 1 sine and the self-oscillating filter, tuned to unison, into the ring modulator: an octave above. Retuning Osc 1 an octave down gives "
                    "one note an octave below and its twelfth.", "confidence": "stated"},
    {"id": "bowing", "name": "Joystick 'bowing'", "source": "manual, Ring Modulator", "pins": ["E1", "E4", "I15", "J15", "F16", "B13"],
     "settings": {"joystick.range_x": 6, "joystick.range_y": 6},
     "description": "Oscillators 1 and 2 into ring mod input A and the joystick's vertical axis into input B. Because the modulator is AC coupled, sound "
                    "appears only while the stick moves: bow up and down, change pitch left and right.", "confidence": "stated"},
    {"id": "bells", "name": "Bell tones", "source": "manual, Ring Modulator",
     "pins": ["E1", "F3", "F4", "I16", "J15", "H13", "D10", "G10", "C12", "B14"],
     "settings": {"osc1.frequency": 7.5, "osc2.frequency": 7.5, "joystick.range_x": 4, "joystick.range_y": 4, "vcf.frequency": 7, "vcf.response": 0,
                  "vcf.level": 10, "env.attack": 0, "env.on": 0, "env.decay": 6, "env.off": 3, "reverb.mix": 5, "reverb.level": 10},
     "description": "Rich ring modulation filtered, struck by the envelope shaper and reverberated; the joystick retunes both oscillators.", "confidence": "stated"},
    {"id": "harmonic_series", "name": "Filter extracts harmonics", "source": "manual, Filter/Oscillator", "pins": ["H2", "B10", "N6"],
     "description": "A low Osc 1 ramp through the filter while an Osc 3 rising ramp sweeps cut-off; the harmonics sound one by one.", "confidence": "stated"},
    {"id": "stereo_swing", "name": "Amplitude swing between channels", "source": "manual, Output Amplifiers", "pins": ["B1", "B2", "C1", "C2", "O4", "P6"],
     "description": "Osc 1 to both outputs, with Osc 2 and Osc 3, both slow and slightly out of step, on the two output amplifier levels.", "confidence": "stated"},
    {"id": "clangs", "name": "Ring-modulated clangs", "source": "manual, Reverberation Unit", "pins": ["E2", "F4", "D13", "G12", "B14", "I15", "J16"],
     "settings": {"reverb.mix": 5},
     "description": "Ring modulator into the repeating envelope shaper, then reverb; the joystick changes the clang. The manual prints the envelope pin as B13; read as D13.",
     "confidence": "inferred"},
]

D["indicators"] = [
    {"id": "output.mains_lamp", "module": "output", "label": "MAINS", "kind": "lamp", "led_colour": "red", "function": "Red neon, lit when mains is on."},
    {"id": "env.lamp", "module": "env", "label": "Envelope lamp", "kind": "lamp", "led_colour": "red",
     "function": "Bright during attack and on, dim during decay and off. May glow or flicker at switch-on."},
    {"id": "meter.meter", "module": "meter", "label": "METER", "kind": "meter", "function": "Moving-coil meter on matrix column A; DC centre-zero or AC left-zero by switch."},
]
D["led_legend"] = {"rule": "Two red lamps. The envelope lamp's brightness, not colour, shows the cycle: bright for attack and on, dim for decay and off.",
                   "colours": [{"colour": "red", "meaning": "mains on; envelope cycle state by brightness"}], "confidence": "stated"}

D["behaviours"] = [
    {"id": "b01", "name": "Nothing sounds until pinned", "applies_to": ["out_amp1", "out_amp2"],
     "rule": "There is no default patch. Every route is a pin, and every patch must end at column B or C (or both) to be heard. Many settings "
             "produce silence: a sub- or supersonic oscillator, a level at zero, an output level below half way, a muted speaker."},
    {"id": "b02", "name": "Resistive, unbuffered matrix", "applies_to": ["out_amp1", "vcf", "env", "osc1"],
     "rule": "Each pin is a 2.7 kohm resistor into a 10 kohm input, so pins in one column sum, and every extra pin or level change slightly "
             "alters the others. Pin tolerance matters: two white pins carrying the same pitch voltage to two oscillators can make them track "
             "differently, which is what the red precision pins are for. Several pins in column A join their signals together."},
    {"id": "b03", "name": "Signal and control are the same thing", "applies_to": ["osc1", "osc2", "osc3", "vcf", "out_amp1", "out_amp2", "env", "reverb"],
     "rule": "Any row can feed any column. Audio into a control column gives FM (oscillators, filter) or AM (output amplifiers); slow sources "
             "into control columns give vibrato, sweeps and pan. The manual's own idioms: Osc 3 ramp on Osc 1 frequency for rising note patterns, "
             "Osc 2 and Osc 3 ramps summed into a staircase for scales, circular modulation between oscillators for pseudo-random patterns."},
    {"id": "b04", "name": "Control voltage scaling", "applies_to": ["osc1", "osc2", "osc3", "vcf", "env", "reverb", "in_amp1", "in_amp2"],
     "rule": "Not 1 V/octave. Through a pin: Osc 1 and 2 at 0.32 V/octave, Osc 3 at 0.26 V/octave, the filter at 0.2 V/octave, envelope decay "
             "doubles per 0.4 V. Through an input amplifier (gain 2) an external voltage needs half as much: 0.16 V/octave for Osc 1 and 2. "
             "Reverb mix runs from -2 V (dry) to +2 V (full). Joystick and range controls set intervals by ear, and an interval set at one pitch "
             "should hold at others. The input amplifiers invert, and the oscillators rise in pitch as their control voltage goes negative, "
             "so a conventional positive-going pitch voltage plays the right way round through an input amplifier but backwards if pinned "
             "in directly (Digitana)."},
    {"id": "b05", "name": "Envelope shaper cycle", "applies_to": ["env"],
     "rule": "Attack, on, decay and off run in a loop. With all four at minimum it buzzes at about 50 to 60 Hz; with attack, on and decay at 10 "
             "and off at half it repeats about every 20 seconds. Turning OFF past roughly 5 to 7 stops it after each decay, waiting for the "
             "ATTACK button (which holds ON while pressed) or a keyboard trigger. Attack longer than on makes decay start early, for gentle "
             "undulation. Decay control voltage (column L) changes both note length and repetition rate."},
    {"id": "b06", "name": "Inverted trapezoid", "applies_to": ["env", "out_amp1", "out_amp2"],
     "rule": "The trapezoid runs from -3 V when ON to +3 V when OFF. Applied to an output amplifier level it therefore fades the signal during "
             "attack and restores it during decay: an inverted envelope. Applied to an oscillator it bends pitch through the note."},
    {"id": "b07", "name": "Filter as oscillator", "applies_to": ["vcf"],
     "rule": "RESPONSE 0 is low-pass; about 5 to 6 is a sharp resonator; a little further it oscillates as a pure sine, and continues to oscillate "
             "to the right. The oscillation point varies with frequency. While oscillating it still filters, so a noise input gives howling wind. "
             "Its frequency control then works like an oscillator's."},
    {"id": "b08", "name": "AC-coupled ring modulator", "applies_to": ["ring_mod"],
     "rule": "Output exists only when both inputs carry signal, and DC is ignored: slow inputs pass only their changes. That makes it a switch "
             "(remove one input), an octave doubler (same sine into both inputs), and with the joystick on one input a 'bow' that sounds only while "
             "the stick moves."},
    {"id": "b09", "name": "Output amplifier level is a control voltage", "applies_to": ["out_amp1", "out_amp2"],
     "rule": "The large level knob biases a VCA rather than attenuating. With nothing on its control column the signal appears around half travel; "
             "with control pinned, the knob's lower half backs the control off, and some settings cannot be silenced."},
    {"id": "b10", "name": "Three ways out of the matrix", "applies_to": ["meter", "out_amp1", "out_amp2"],
     "rule": "CONTROL OUTPUTS 1 and 2 tap columns B and C before the output amplifiers, DC coupled, and SCOPE taps column A. Pinning a control "
             "source to B or C is how a control voltage leaves the VCS3; SCOPE can feed a signal back in through an input amplifier."},
    {"id": "b11", "name": "Noise warm-up", "applies_to": ["noise"],
     "rule": "The noise generator does not start for 20 to 30 seconds after power-on."},
    {"id": "b12", "name": "Reverb overload and feedback", "applies_to": ["reverb"],
     "rule": "The springs' output varies 10 to 1 with frequency, so peaks can overload even at modest average levels, especially with slowly "
             "swept tones. Acoustic feedback can occur through the internal speakers; reduce MIX slightly. Knocking the cabinet excites the springs."},
    {"id": "b13", "name": "Panel legends map knobs to the matrix", "applies_to": ["osc1", "osc2", "osc3", "noise", "in_amp1", "in_amp2", "vcf", "env",
                                                                             "ring_mod", "reverb", "joystick", "out_amp1", "out_amp2"],
     "rule": "Every source has a level knob numbered with its matrix row (1 to 14; the joystick RANGE knobs are 15 and 16), and every "
             "control column has a manual knob lettered with its column (I to P). Turning a numbered knob to 0 removes that row from every "
             "pin in it. The lettered knob sets the starting point that pinned voltages move up or down; with nothing pinned it is the "
             "whole setting. patch_matrix records both links as level_param and offset_param.", "confidence": "inferred"},
]

D["midi"] = {"receives": [], "transmits": [], "note": "No MIDI and no digital control of any kind. External control is by voltages through the HI LEVEL inputs and the KEYBOARD socket."}
D["specifications"] = {
    "oscillators": {"osc1_osc2_hz": [1, 10000], "osc3_hz": [0.025, 500], "cv_v_per_octave": {"osc1_osc2": 0.32, "osc3": 0.26}},
    "filter": {"range_hz": [5, 10000], "slope": "12 dB first octave, 18 dB/octave after", "max_q": 20, "cv_v_per_octave": 0.2},
    "envelope": {"attack_s": [0.002, 1], "on_s": [0, 2.5], "decay_s": [0.003, 15], "off_s": [0.010, 5], "max_rate_hz": 60},
    "reverb": {"delays_ms": [25, 30], "time_s": ">2"},
    "ring_modulator": {"max_input_vpp": 1.5, "max_output_vpp": 6, "breakthrough_db": -60},
    "inputs": {"mic": "2 x 5 mV into 600 ohms", "hi_level": "2 x 1.8 V AC rms or 2.5 V DC into 50 kohms", "low_level": "2 x 150 uA into 500 ohms (keyboard socket)"},
    "outputs": {"signal": "2 x 2 V p-p into 600 ohms (panned)", "headphones": "stereo 10 V p-p into 50 ohms", "control": "2 x DC, load 10 kohm"},
    "matrix": "16 x 16 pin board, 2.7 kohm pins, 10 kohm inputs",
    "meter": "1 mA movement: plus or minus 1 V DC centre-zero, or 4 V p-p AC full scale",
    "joystick_v": [-2, 2], "speakers": "2 x 5-inch, 1 W amplifiers",
    "power": {"mains": "220 to 245 V or 105 to 115 V AC, 50 or 60 Hz", "fuse_a": 1},
    "dimensions_mm": {"h": 438, "w": 444, "d": 419}, "weight_kg": 10.2, "cabinet": "solid afrormosia wood, aluminium panels",
}
D["omitted_from_source"] = [
    "the general introduction to sources, treatments and voltage control, and the glossary",
    "soldering, jack-plug and earth-loop advice, external studio set-ups and mixer suggestions",
    "maintenance, faultfinding, the ring modulator balance and oscillator calibration procedures, and the printed circuit board layouts",
    "the knob settings on the 15 specimen patch sheets, which are drawn as dials and not readable from the scan",
]
D["not_in_source"] = [
    "the Jones socket pinout (the scan is partly unreadable); now taken from Digitana's interface manual, written for the Mk 2",
    "pin colours other than the 2.7 kohm standard; red, green and yellow pins come from later sources",
    "envelope trigger voltage and polarity; now taken from Digitana (positive, about 4 to 5 V)",
    "the panel legends linking knobs to matrix rows and columns; taken from a photograph of a later unit whose matrix was rewired to Mk 1 rows",
    "the pulse width at each SHAPE setting on Oscillators 2 and 3",
    "the shape of the Osc 1 sine shaper's distortion, beyond 'rectified' sketches",
    "noise colour filter slopes",
    "output amplifier tone control slopes and turnover frequencies",
    "a filter topology; MusicRadar describes it as a diode ladder",
]
D["source_inconsistencies"] = [
    "Maximum envelope repetition rate is 60 Hz in the specification and 'about 50 Hz' in the Envelope Shaper text.",
    "Osc 3's lower limit is 0.025 Hz (40 s) in the text and 0.015 Hz (65 s) at dial 0 in the calibration table, which notes the extreme varies. "
    "A later panel prints 0.05 Hz.",
    "Osc 1 and 2 are 1 Hz to 10 kHz in the text; the calibration table runs 0.6 Hz to 16.75 kHz at the dial ends, marked as possibly outside tolerance.",
    "The matrix walkthrough lists a pin as B10 where its diagram shows D10 (filter into envelope shaper); the reverb example prints B13 where D13 is meant.",
    "Wikipedia and several retailers call the filter 24 dB/octave; the manual specifies 12 dB in the first octave and 18 dB/octave beyond. "
    "Not a contradiction: Sound On Sound reports that EMS changed the filter to 24 dB/octave in 1974, after the Mk 1.",
    "A Mk 2 matrix legend prints Output ch1, meter, Output ch2 across columns A to C, while the Mk 1 manual and panel put the meter on A "
    "and the outputs on B and C. Portabella confirms the meter moved to column B on the Mk 2; this file keeps the Mk 1 order.",
    "Sound On Sound's 'All About EMS' places Osc 1 on row 3 and output channel 1 on column A. That is the Mk 2 layout; on the Mk 1 they are rows 1 and 2 and column B.",
    "Red pins are given as 2% tolerance by Sound On Sound and Hinton Instruments, and 1% by forum posters describing modern replacements.",
]
D["modelling_gaps"] = [
    {"topic": "Matrix loading", "detail": "The matrix sums through 2.7 kohm into 10 kohm inputs with no buffering, so the gain of any pin depends on every other pin in its column and row. The file records the values; a simulation would need to solve the resistor network."},
    {"topic": "Version", "detail": "Modelled on the Mk 1 (1969 to about 1972), as the manual describes it. The Mk 2 differs: rows 1 and 2 "
     "become Output ch 1 and 2, rows 3 and 4 carry Osc 1 and Osc 2 as single mixed outputs, the meter moves to column B and output "
     "channel 1 to column A, and row 16 doubles as a sequencer input from Jones pin 8 (selected by clicking the vertical RANGE knob to "
     "'seq'). From 1974 the filter became 24 dB/octave. Mk 1 units used a GE PA234 power amplifier IC and an inexpensive Japanese "
     "spring tank; new Cornwall units use an Accutronics tank. None of this is modelled here."},
    {"topic": "Common modifications", "detail": "Many surviving units carry EMS or third-party modifications that are not part of a stock "
     "Mk 1 and are not modelled: HI/LO range switches on Osc 2 and 3, an envelope trigger source switch (keyboard socket or external gate), "
     "input channel SI/MULT switches, voltage-controlled shape jacks for the three oscillators, a dual patchable inverter, a four-way "
     "multiple, extra input channels with an EXT CV/STICK switch, oscillator sync, matrix buffering, and Mk 2 matrices rewired to Mk 1 rows."},
    {"topic": "Oscillator stability", "detail": "The VCS3 is famous for drift. Nothing in the manual quantifies it beyond warm-up and calibration advice."},
    {"topic": "Filter and waveshapes", "detail": "Slopes and Q are specified; the diode-ladder character, the sine shaper's curve and the pulse width at each shape setting are not."},
    {"topic": "No MIDI, no memory", "detail": "There is nothing digital. The midi section is empty; every patch is pins plus knob positions, which example_patches records where the manual gives them."},
]

with open("/mnt/user-data/outputs/ems-vcs3.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
