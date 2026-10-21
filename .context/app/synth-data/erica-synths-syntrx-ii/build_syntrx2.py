#!/usr/bin/env python3
"""Assemble the Erica Synths SYNTRX II device file (schema 0.12.0).

A matrix-patched analogue synth in the tradition of the EMS Synthi AKS: three
oscillators, filter, noise, sample and hold, ring modulator, Trapezoid envelope with
VCA, two instrument inputs (one with an envelope follower), DSP delay/reverb, joystick,
and a digitally controlled 16 x 16 analogue matrix with three gain levels per point,
256 patch memories and a piano-roll sequencer drawn on the matrix.

Matrix rows and columns are lettered and numbered here for reference (A-P, 1-16); the
panel labels them by name. Source: the SYNTRX II user manual (March 2023).
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="none", control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
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


def knob(id, module, label, fn, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, **kw)


def sw(id, module, label, fn, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control=control, values=[{"value": v} for v in vals], **kw)


def cfg(id, module, label, fn, kind, scope, **kw):
    access = [{"type": "menu", "note": f"configuration screen (SHIFT + < PATCH), {label}"}]
    par(id, module, label, kind, fn, memory="patch" if scope == "patch" else "global", access=access, **kw)


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


D["device"] = {
    "id": "erica-synths-syntrx-ii", "manufacturer": "Erica Synths", "model": "SYNTRX II",
    "category": "matrix-patched analogue synthesizer with digital patch memory, piano-roll sequencer and DSP effects",
    "based_on": "Successor to the Erica Synths SYNTRX (a re-imagining of the EMS Synthi AKS, approved by Peter Zinovieff; 1056 units).",
    "sources": [{"id": "manual", "title": "Erica Synths SYNTRX II User Manual (March 2023)", "kind": "user_manual", "file": "Syntrx_II_Manual_Mar_2023.pdf", "pages": 27,
                 "note": "Features, connections, every 'module', matrix connections, patch memory, sequencer and stepped modulation, six example patches, MIDI and configuration settings."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 1, "polyphony_mode": "monophonic; paraphonic patches with CV2 on Oscillator 2",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "256 matrix patches (connections and gain levels, sequence, stepped modulation and per-patch settings); knob positions are not stored. The last patch is autosaved every 30 s.",
    "semi_modular": False, "routing": "16 x 16 analogue matrix under digital control; three gain levels per point",
    "panel_counts": {"matrix_points": 256, "matrix_rows": 16, "matrix_columns": 16},
    "summary": ("Sources (matrix rows): Osc 1 pulse and sine, Osc 2 (pulse and saw mixed), Osc 3 triangle/ramp, Osc 3 pulse or S&H, noise, Input 1, envelope follower, Input 2, "
                "filter, Trapezoid CV, Trapezoid VCA output, ring mod, effects, and joystick Y and X. Destinations (matrix columns): Ch1 and Ch2 outputs, scope, Trapezoid VCA input, "
                "ring mod A, effects, filter, the three oscillator pitches, oscillator shape, S&H input, envelope decay, filter frequency and both output levels. Nothing sounds until a patch "
                "is made. The matrix also becomes a 16-step piano-roll sequencer with two stepped modulation lanes added to the joystick."),
}

# ---------------------------------------------------------------- modules
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATOR 1", "Audio oscillator, about C0-C8, with sine and pulse each on its own matrix row; shape for each (pulse width; sine to sharkfin either way), octave ±3, tune about two octaves.",
    ["osc1.pitch_cv", "osc1.shape_cv"], ["osc1.pulse", "osc1.sine"], props={"range": "C0-C8"})
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATOR 2", "Audio oscillator with pulse and saw (to 'dual super saw') mixed to one row; shape, octave ±3, tune; hard sync to Osc 1; CV2 input takes over its pitch.",
    ["osc2.pitch_cv", "osc2.shape_cv", "osc2.sync_in"], ["osc2.out"], props={"range": "C0-C8"})
mod("osc3", "oscillator", "Oscillator 3", "OSCILLATOR 3", "LFO into audio range (0.05-500 Hz): triangle/ramp and pulse with shape; free or keyboard-following.",
    ["osc3.pitch_cv"], ["osc3.tri", "osc3.pulse"], props={"rate_hz": [0.05, 500]})
mod("snh", "sample_hold", "Random (sample and hold)", "RANDOM", "Samples the matrix S&H input at its own rate or on each gate; shares a matrix row with Osc 3 pulse.", ["snh.in", "snh.gate"], ["snh.out"])
mod("osc3sel", "electronic_switch", "Osc 3 / S&H selector", "RANDOM", "Chooses whether row 5 carries Osc 3 pulse or the S&H output.", ["osc3sel.osc3", "osc3sel.snh"], ["osc3sel.out"])
mod("noise", "noise", "Noise generator", "NOISE", "Zener-diode white noise with a tone (colour) control.", [], ["noise.out"])
mod("in1", "preamp", "Input 1 and envelope follower", "INPUT 1 / E.F.", "External audio input with level, and an envelope follower giving a CV (attenuverted) and a gate (threshold, to the gate OR).",
    ["in1.in"], ["in1.out", "in1.env", "in1.gate"])
mod("in2", "preamp", "Input 2", "INPUT 2", "DC-coupled external input, line or mic gain, level (overdrives at high settings), direct or inverted.", ["in2.in"], ["in2.out"])
mod("vcf", "filter", "Filter", "FILTER", "High-pass and low-pass in series: LPF fully open gives HP, HPF fully closed gives LP, anything else band-pass. Resonance self-oscillates (pure sine) from 7.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"])
mod("ring", "ring_modulator", "Ring modulator", "RINGMODULATOR", "Four-quadrant multiplier: A from the matrix; B (the carrier) chosen internally by the SOURCE B rotary switch, whose positions the manual does not list.", ["ring.a"], ["ring.out"])
mod("shapebus", "cv_source_selector", "Oscillator shape CV", "OSCILLATOR 1 / 2", "Matrix Oscillator Shape input, sent to Osc 1 and Osc 2 according to their shape switches.", ["shapebus.in"], ["shapebus.out"])
mod("trap", "envelope", "Trapezoid envelope", "TRAPEZOID", "Looping attack (6-850 ms), on (0-1.5 s), decay (16 ms-2 s, voltage controlled) and off (14 ms-1.3 s). OFF above 9 stops looping: then gates or the GATE button fire it.",
    ["trap.gate", "trap.decay_cv"], ["trap.out"], props={"attack_s": [0.006, 0.85], "on_s": [0, 1.5], "decay_s": [0.016, 2], "off_s": [0.014, 1.3]})
mod("trapvca", "vca", "Trapezoid VCA", "TRAPEZOID", "VCA driven by the Trapezoid; its input is the 'Envelope Signal' matrix column.", ["trapvca.in", "trapvca.cv"], ["trapvca.out"])
mod("fx", "effects", "Effects", "EFFECTS", "DSP delay or reverb (with 112dB): time or size, feedback (self-oscillating delay; looping reverb), level; wet only. Time knob motion recordable for 8 s.",
    ["fx.in"], ["fx.out"], props={"delay_s": {"short": [0.005, 0.5], "long": [0.005, 3]}})
mod("joy", "manual_controller", "Joystick", "JOYSTICK", "Two bipolar CVs (±5 V) with X and Y levels; motion and gate patterns recordable for 8 s; MIDI CCs and the sequencer's stepped lanes add to it.",
    ["joy.cc_x", "joy.cc_y", "joy.step_x", "joy.step_y"], ["joy.x", "joy.y"])
mod("ctl", "voice_allocator", "CV, gate, MIDI and sequencer", "CONNECTIONS / SEQUENCER", "CV1 (all oscillators), CV2 (Osc 2), gate input, MIDI note (high-note priority, added to CV), GATE button and the piano-roll sequencer, ORed gates.",
    ["ctl.cv1_in", "ctl.cv2_in", "ctl.gate_in", "ctl.midi_in"], ["ctl.cv1", "ctl.cv2", "ctl.gate", "ctl.velocity", "ctl.modwheel", "ctl.cc_x", "ctl.cc_y", "ctl.step_x", "ctl.step_y"])
mod("scope", "output", "Scope (meter) and scope output", "SCOPE", "Meter for audio or CV, with its own output jack, normalled to both inputs.", ["scope.in"], ["scope.out"])
mod("out1", "vca", "Output channel 1", "OUTPUT AMPLIFIERS", "Output VCA with level (plus matrix CV), tone filter and pan.", ["out1.in", "out1.cv"], ["out1.out"])
mod("out2", "vca", "Output channel 2", "OUTPUT AMPLIFIERS", "Output VCA with level (plus matrix CV), tone filter and pan.", ["out2.in", "out2.cv"], ["out2.out"])
mod("master", "output", "Outputs", "rear panel", "Panned sum of both channels to outputs 1 and 2 and headphones.", ["master.ch1", "master.ch2"], ["master.out1", "master.out2", "master.phones"])

# ---------------------------------------------------------------- parameters
sw("osc1.octave", "osc1", "OCTAVE (Osc 1)", "Octave offset.", ["-3", "-2", "-1", "0", "+1", "+2", "+3"], "rotary_switch")
knob("osc1.tune", "osc1", "TUNE (Osc 1)", "Fine pitch over about two octaves.")
knob("osc1.shape", "osc1", "SHAPE (Osc 1)", "Pulse width, and sine to inverted sharkfin (left) or sharkfin (right).", panel_scale={"min": -5, "max": 5})
sw("osc1.shape_cv_target", "osc1", "OSC1 SHAPE", "Which wave the Oscillator Shape CV changes.", ["pwm", "both", "sine"])
knob("osc1.pulse_level", "osc1", "LEVEL (pulse)", "Pulse level into the matrix.")
knob("osc1.sine_level", "osc1", "LEVEL (sine)", "Sine level into the matrix.")
sw("osc2.octave", "osc2", "OCTAVE (Osc 2)", "Octave offset.", ["-3", "-2", "-1", "0", "+1", "+2", "+3"], "rotary_switch")
knob("osc2.tune", "osc2", "TUNE (Osc 2)", "Fine pitch over about two octaves.")
knob("osc2.shape", "osc2", "SHAPE (Osc 2)", "Pulse width, and saw to dual super saw.")
sw("osc2.shape_cv_target", "osc2", "OSC2 SHAPE", "Which wave the Oscillator Shape CV changes (centre: none).", ["pwm", "none", "saw"])
knob("osc2.pulse_level", "osc2", "LEVEL (pulse)", "Pulse level into the Osc 2 mix.")
knob("osc2.saw_level", "osc2", "LEVEL (saw)", "Saw level into the Osc 2 mix.")
sw("osc2.sync", "osc2", "SYNC", "Free or hard-synced to Osc 1.", ["free", "sync"])
knob("osc3.tune", "osc3", "TUNE (Osc 3)", "Rate 0.05-500 Hz.", physical={"min": 0.05, "max": 500, "unit": "Hz"})
knob("osc3.shape", "osc3", "SHAPE (Osc 3)", "Shapes both waves (triangle towards ramp).")
knob("osc3.tri_level", "osc3", "LEVEL (triangle)", "Triangle/ramp level into the matrix.")
knob("osc3.pulse_level", "osc3", "LEVEL (pulse)", "Pulse level into the matrix.")
sw("osc3.key_follow", "osc3", "FREE / KEY FOL", "Free-running, or following CV1.", ["free", "key_follow"])
knob("snh.rate", "snh", "S&H RATE", "Internal sampling rate.")
knob("snh.level", "snh", "LEVEL (S&H)", "S&H output level.")
sw("snh.clock", "snh", "FREE / GATE", "Sample on the internal clock or on each gate.", ["free", "gate"])
sw("osc3sel.select", "osc3sel", "OSC 3 / S&H", "Which signal goes to matrix row 5.", ["osc3", "snh"])
knob("noise.tone", "noise", "NOISE TONE", "Colour from low (left) to high (right).", panel_scale={"min": -5, "max": 5})
knob("noise.level", "noise", "LEVEL (noise)", "Noise level into the matrix.")
knob("in1.level", "in1", "LEVEL (Input 1)", "Input 1 level.")
knob("in1.thresh", "in1", "THRESH", "Gate detection threshold.")
knob("in1.decay", "in1", "DECAY", "Envelope follower decay.")
knob("in1.ef_level", "in1", "EF LEVEL", "Envelope follower output, attenuverted (left inverts, for ducking).", panel_scale={"min": -5, "max": 5})
par("in1.to_gate", "in1", "TO GATE", "boolean", "Adds the extracted gate to the gate OR.", control="toggle_switch")
sw("in2.gain", "in2", "MIC / LINE", "Input 2 gain range.", ["mic", "line"])
knob("in2.level", "in2", "LEVEL (Input 2)", "Input 2 level; overdrives at high settings.")
sw("in2.polarity", "in2", "DIRECT / INVERT", "Inverts Input 2.", ["direct", "invert"])
knob("vcf.hpf", "vcf", "HPF", "High-pass cutoff (0 fully open).")
knob("vcf.lpf", "vcf", "LPF", "Low-pass cutoff (10 fully open).")
knob("vcf.resonance", "vcf", "RESONANCE", "Emphasis; self-oscillates from 7.")
sw("vcf.cv_target", "vcf", "HPF / LPF", "Which cutoff the Filter Frequency CV moves (centre: both).", ["hpf", "both", "lpf"])
knob("vcf.level", "vcf", "LEVEL (filter)", "Filter output level into the matrix.")
sw("ring.source_b", "ring", "SOURCE B", "Ring mod carrier source.", ["unspecified"], "rotary_switch", confidence="inferred", note="Positions not listed in the manual.")
knob("ring.level", "ring", "LEVEL (ring mod)", "Ring mod output level.")
knob("trap.attack", "trap", "ATTACK", "Attack 6-850 ms.", physical={"min": 0.006, "max": 0.85, "unit": "s"})
knob("trap.on", "trap", "ON", "On time 0-1.5 s (ignored with an external gate).", physical={"min": 0, "max": 1.5, "unit": "s"})
knob("trap.decay", "trap", "DECAY", "Decay 16 ms-2 s.", physical={"min": 0.016, "max": 2, "unit": "s"})
knob("trap.off", "trap", "OFF", "Off time 14 ms-1.3 s; above 9 stops looping.", physical={"min": 0.014, "max": 1.3, "unit": "s"})
knob("trap.level", "trap", "TRAPEZOID", "Envelope CV level into the matrix.")
knob("trapvca.signal", "trapvca", "SIGNAL", "VCA output level into the matrix.")
sw("fx.type", "fx", "DELAY / REVERB", "Effect type.", ["delay", "reverb"])
knob("fx.time", "fx", "TIME", "Delay time, or reverb size; motion recordable.")
knob("fx.feedback", "fx", "FEEDBACK", "Repeats (self-oscillates), or reverb feedback (loops at maximum).")
knob("fx.level", "fx", "LEVEL (effects)", "Wet level into the matrix.")
knob("joy.x_level", "joy", "X LEVEL", "Range of the X CV.")
knob("joy.y_level", "joy", "Y LEVEL", "Range of the Y CV.")
par("joy.stick", "joy", "JOYSTICK", "continuous", "Two-axis bipolar CV, ±5 V.", control="joystick", panel_scale={"min": -1, "max": 1})
for n in (1, 2):
    knob(f"out{n}.filter", f"out{n}", f"OUTPUT FILTER (ch {n})", "Tone: flat at 5, bass boost left, treble right.", panel_scale={"min": -5, "max": 5})
    knob(f"out{n}.level", f"out{n}", f"LEVEL (ch {n})", "Output level, plus the matrix CV.")
    knob(f"out{n}.pan", f"out{n}", f"PAN (ch {n})", "Stereo position.", panel_scale={"min": -5, "max": 5})
sw("scope.mode", "scope", "AUDIO / CV", "Meter scale: audio (to about 4.5 V) or bipolar CV.", ["audio", "cv"])
for pid, label, fn in (("ui.gate", "GATE/SEQ", "Fires the Trapezoid; SHIFT + it opens the sequencer."), ("ui.rec", "REC/CLEAR", "Records joystick, gate or TIME motion; double tap clears."),
                       ("ui.save", "SAVE", "Saves the patch."), ("ui.recall", "RECALL", "Recalls a patch; SHIFT + it turns the matrix off (or resets the sequencer note)."),
                       ("ui.patch", "< PATCH >", "Steps through saved patches; SHIFT + > randomises; sequencer start/stop."), ("ui.shift", "SHIFT", "Second functions."),
                       ("ui.encoders", "X / Y encoders", "Move around the matrix; push to set points (left: gain 1, 0.7, 0.3, off; right: 1 or off).")):
    par(pid, "ctl", label, "boolean", fn, control="push_button" if "encoders" not in pid else "encoder")
cfg("cfg.portamento", "ctl", "P-TM", "Portamento time for sequencer and MIDI, 0-100 (100 = 1 s).", "integer", "patch", range={"min": 0, "max": 100}, default=0)
cfg("cfg.rnd_density", "ctl", "RNDD", "Random patch density, 0-80%.", "integer", "patch", range={"min": 0, "max": 80})
cfg("cfg.rnd_area", "ctl", "RNDA", "Area of the matrix used for random patches.", "enum", "patch", values=[{"value": "area"}])
cfg("cfg.seq_gate", "ctl", "SQGL", "Default sequencer gate length.", "enum", "global", values=[{"value": v} for v in ["15%", "30%", "50%", "65%", "80%", "100%"]])
cfg("cfg.delay_length", "fx", "DELL", "Delay time range.", "enum", "global", values=[{"value": "short"}, {"value": "long"}], default="short")
cfg("cfg.reverb_feedback", "fx", "REV F", "Reverb FEEDBACK knob gives feedback (looping) instead of tone.", "boolean", "global", default=False)
cfg("cfg.fx_mode", "fx", "FX BD", "Effects in BBD mode (on) or tape mode (off).", "boolean", "global", default=False)
cfg("cfg.midi_channel", "ctl", "M-CH", "MIDI channel; 0 = omni.", "integer", "global", range={"min": 0, "max": 16})
cfg("cfg.clock_source", "ctl", "CLKS", "Sequencer clock.", "enum", "global", values=[{"value": "midi"}, {"value": "int"}])
cfg("cfg.clock_div", "ctl", "CLKD", "MIDI clock division.", "enum", "global", values=[{"value": v} for v in ["1", "/2", "/4", "/8"]])
cfg("cfg.bend_range", "ctl", "M-PB", "Pitch bend range in semitones.", "integer", "global", range={"min": 0, "max": 12})
cfg("cfg.note_offset", "ctl", "M-NO", "MIDI note offset, up to 3 octaves.", "integer", "global", range={"min": -36, "max": 36}, note="Direction of the offset range not stated.")
cfg("cfg.vel_cutoff", "vcf", "VELC", "Velocity to filter cutoff depth.", "integer", "global", range={"min": 0, "max": 10})
cfg("cfg.key_cutoff", "vcf", "KEYC", "Keyboard tracking depth of the filter.", "integer", "global", range={"min": 0, "max": 10})
cfg("cfg.cc_x", "joy", "CC X", "MIDI CC added to joystick X.", "integer", "global", range={"min": 0, "max": 127}, default=70)
cfg("cfg.cc_y", "joy", "CC Y", "MIDI CC added to joystick Y.", "integer", "global", range={"min": 0, "max": 127}, default=71)
cfg("cfg.patch_view", "ctl", "P-VW", "Patch memory shown as a grid or numbers.", "enum", "global", values=[{"value": "mtx"}, {"value": "num"}])
cfg("cfg.matrix_dim", "ctl", "MX D", "Dims the matrix LEDs.", "boolean", "global", default=False)
par("seq.steps", "ctl", "Sequencer last step", "integer", "Sequence length.", memory="patch", range={"min": 1, "max": 16}, default=16,
    access=[{"type": "gesture", "gesture": "sequencer screen: SHIFT + turn X encoder", "when": "any_time"}])
par("seq.bpm", "ctl", "Sequencer BPM", "integer", "Internal tempo.", memory="patch", access=[{"type": "gesture", "gesture": "sequencer screen: SHIFT + turn Y encoder", "when": "any_time"}],
    confidence="inferred", note="Whether BPM is stored per patch is not stated.")
par("seq.direction", "ctl", "Play direction", "enum", "Forward, backward, ping-pong, random, or manual step advance.", memory="patch", values=[{"value": v} for v in ["fwd", "bwd", "pp", "rnd", "man"]],
    access=[{"type": "gesture", "gesture": "sequencer screen: hold < PATCH and turn X (direction) or Y (manual)", "when": "any_time"}])
par("sys.power", "master", "Power switch", "boolean", "Power on or off.", access=[{"type": "rear_panel", "control": "toggle_switch"}])

# ---------------------------------------------------------------- ports
jack("jack.out1", "OUTPUT 1", "out", "audio", "master.out1", "Line output 1.", "6.35 mm TS", confidence="inferred", note="Connector size not stated.")
jack("jack.out2", "OUTPUT 2", "out", "audio", "master.out2", "Line output 2.", "6.35 mm TS", confidence="inferred")
jack("jack.phones", "HEADPHONES", "out", "audio", "master.phones", "Headphones.", "6.35 mm TRS", confidence="inferred")
jack("jack.scope_out", "SCOPE OUT", "out", "cv_or_audio", "scope.out", "Whatever is patched to the Scope column; normalled to both inputs.", "3.5 mm TS", confidence="inferred")
jack("jack.in1", "INPUT 1", "in", "audio", "in1.in", "External audio with envelope follower; normalled from SCOPE OUT.", "6.35 mm TS", confidence="inferred")
jack("jack.in2", "INPUT 2", "in", "cv_or_audio", "in2.in", "DC-coupled external input; normalled from SCOPE OUT.", "6.35 mm TS", confidence="inferred")
jack("jack.cv1", "CV1 IN", "in", "cv", "ctl.cv1_in", "1 V/oct to all three oscillators (Osc 2 unless CV2 is used); MIDI note CV adds to it.", "3.5 mm TS", confidence="inferred")
jack("jack.cv2", "CV2 IN", "in", "cv", "ctl.cv2_in", "1 V/oct to Osc 2 only, overriding CV1 there.", "3.5 mm TS", confidence="inferred")
jack("jack.gate", "GATE IN", "in", "gate", "ctl.gate_in", "Fires the Trapezoid (set non-looping).", "3.5 mm TS", confidence="inferred")
jack("jack.midi_in", "MIDI IN", "in", "midi", "ctl.midi_in", "Notes, gate, pitch wheel, mod wheel, velocity and two CCs; SysEx firmware.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "Copy of MIDI IN.", "5-pin DIN")
jack("jack.power", "12V DC", "in", "power", None, "Supplied 12 V DC adaptor, centre positive.", "DC barrel")

# ---------------------------------------------------------------- fixed wiring and normals
con("ctl.cv1", "osc1.pitch_cv")
con("ctl.cv1", "osc2.pitch_cv", broken_by="jack.cv2", note="CV2 takes over Osc 2.")
con("ctl.cv2", "osc2.pitch_cv")
con("ctl.cv1", "osc3.pitch_cv", eq("osc3.key_follow", "key_follow"))
con("ctl.gate", "trap.gate", "gate")
con("ctl.gate", "snh.gate", "gate", eq("snh.clock", "gate"))
con("in1.gate", "ctl.gate_in", "gate", eq("in1.to_gate", True), note="ORed with the other gates.")
con("ctl.cc_x", "joy.cc_x")
con("ctl.cc_y", "joy.cc_y")
con("ctl.step_x", "joy.step_x", note="Sequencer stepped modulation lane, added to the joystick.")
con("ctl.step_y", "joy.step_y")
con("ctl.modwheel", "vcf.cutoff_cv")
con("ctl.velocity", "vcf.cutoff_cv", amount="cfg.vel_cutoff")
con("ctl.cv1", "vcf.cutoff_cv", amount="cfg.key_cutoff")
con("osc1.pulse", "osc2.sync_in", "sync", eq("osc2.sync", "sync"))
con("osc3.pulse", "osc3sel.osc3", "cv")
con("snh.out", "osc3sel.snh", "cv")
con("trap.out", "trapvca.cv")
con("shapebus.out", "osc1.shape_cv", note="Pulse width, sine shape or both, per OSC1 SHAPE.")
con("shapebus.out", "osc2.shape_cv", {"param": "osc2.shape_cv_target", "not_equals": "none"}, note="Pulse width or saw shape, per OSC2 SHAPE; centre gives none.")
con("scope.out", "in1.in", "cv_or_audio", broken_by="jack.in1")
con("scope.out", "in2.in", "cv_or_audio", broken_by="jack.in2")
con("out1.out", "master.ch1", "audio", amount="out1.level")
con("out2.out", "master.ch2", "audio", amount="out2.level")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
ROWS = [("1", "Oscillator 1 pulse", "osc1.pulse", "osc1.pulse_level"), ("2", "Oscillator 1 sine", "osc1.sine", "osc1.sine_level"), ("3", "Oscillator 2", "osc2.out", None),
        ("4", "Oscillator 3 triangle/ramp", "osc3.tri", "osc3.tri_level"), ("5", "Oscillator 3 pulse / S&H", "osc3sel.out", None), ("6", "Noise", "noise.out", "noise.level"),
        ("7", "Input 1", "in1.out", "in1.level"), ("8", "Envelope follower", "in1.env", "in1.ef_level"), ("9", "Input 2", "in2.out", "in2.level"), ("10", "Filter", "vcf.out", "vcf.level"),
        ("11", "Trapezoid (CV)", "trap.out", "trap.level"), ("12", "Env. signal (VCA out)", "trapvca.out", "trapvca.signal"), ("13", "Ring mod", "ring.out", "ring.level"),
        ("14", "Effects", "fx.out", "fx.level"), ("15", "Joystick Y (vertical) + MIDI CC Y", "joy.y", "joy.y_level"), ("16", "Joystick X (horizontal) + MIDI CC X", "joy.x", "joy.x_level")]
COLS = [("A", "Ch1 Output", "out1.in", "signal", None), ("B", "Ch2 Output", "out2.in", "signal", None), ("C", "Scope", "scope.in", "monitor", None),
        ("D", "Envelope Signal (VCA in)", "trapvca.in", "signal", None), ("E", "Ringmod A", "ring.a", "signal", None), ("F", "Effects", "fx.in", "signal", None), ("G", "Filter", "vcf.in", "signal", None),
        ("H", "Oscillator frequency 1", "osc1.pitch_cv", "control", "osc1.tune"), ("I", "Oscillator frequency 2", "osc2.pitch_cv", "control", "osc2.tune"),
        ("J", "Oscillator frequency 3", "osc3.pitch_cv", "control", "osc3.tune"), ("K", "Oscillator Shape", "shapebus.in", "control", "osc1.shape"),
        ("L", "S&H Input", "snh.in", "signal", None), ("M", "Decay", "trap.decay_cv", "control", "trap.decay"), ("N", "Filter Frequency", "vcf.cutoff_cv", "control", "vcf.lpf"),
        ("O", "Output ch. level 1", "out1.cv", "control", "out1.level"), ("P", "Output ch. level 2", "out2.cv", "control", "out2.level")]
D["patch_matrix"] = {
    "kind": "switch", "size": "16 x 16 (256 points)",
    "rows": [{"id": i, "label": l, "node": n, **({"level_param": lp} if lp else {})} for i, l, n, lp in ROWS],
    "columns": [{"id": i, "label": l, "node": n, "class": c, **({"offset_param": op} if op else {})} for i, l, n, c, op in COLS],
    "pins": [{"name": "gain 1", "resistance_ohm": None, "purpose": "full-level connection (first push of either encoder)"},
             {"name": "gain 0.7", "resistance_ohm": None, "purpose": "attenuated connection (second push of the left encoder)"},
             {"name": "gain 0.3", "resistance_ohm": None, "purpose": "attenuated connection (third push of the left encoder)"}],
    "combine": "sum", "electrical": {"internal_audio_vpp": 3.7, "cv_range_v": [-5, 5]},
    "note": ("Digitally controlled analogue mixer/buffered multiple: up to 16 inputs mix into one column without loss, one row feeds up to 16 columns. Letters A-P and numbers 1-16 are "
             "for reference; the panel labels rows and columns by name. Column order follows the panel; the order of S&H Input and Decay is read from the panel art. Oscillator Shape "
             "reaches Osc 1 and Osc 2 according to their shape switches; Filter Frequency reaches HPF, LPF or both per its switch. Row 3 carries Osc 2's pulse and saw already mixed by their levels."),
}
D["example_patches"] = [
    {"id": "basic", "name": "Basic patch", "pins": ["A1", "A2"], "description": "Osc 1 pulse and sine to channel 1. Set channel 1 level, pan centre.", "source": "manual p.19", "confidence": "stated"},
    {"id": "filtered", "name": "Filtered oscillator", "pins": ["G1", "A10"], "description": "Osc 1 pulse through the filter to channel 1.", "source": "manual p.19", "confidence": "stated"},
    {"id": "trapezoid_vca", "name": "Looping VCA", "pins": ["G1", "D10", "A12"], "description": "Osc 1 pulse, filter, Trapezoid VCA, channel 1: the looping envelope pulses the level.",
     "source": "manual p.20", "confidence": "stated"},
    {"id": "modulation", "name": "Modulation madness", "pins": ["G1", "D10", "A12", "N4", "K16", "H15"],
     "description": "As the looping VCA patch, with Osc 3 triangle/ramp on filter frequency, joystick X on oscillator shape (Osc 1 pulse width) and joystick Y on Osc 1 pitch. Record joystick motion for automation.",
     "source": "manual p.21", "confidence": "stated"},
    {"id": "stereo_pan", "name": "Stereo panning", "pins": ["A1", "B1", "C4", "O4", "P9"],
     "description": "Osc 1 pulse to both channels (ch 1 panned left, ch 2 right). Osc 3 triangle to the scope and channel 1 level; the scope output is normalled to Input 2, set to LINE and INVERT, which drives channel 2 level: an auto-pan.",
     "settings": {"in2.gain": "line", "in2.polarity": "invert", "out1.pan": -5, "out2.pan": 5}, "source": "manual p.22", "confidence": "stated"},
    {"id": "effects", "name": "Dry/wet effects", "pins": ["D1", "A12", "F12", "A14"], "description": "Osc 1 pulse through the Trapezoid VCA to channel 1 (dry) and to the effects, whose wet output also goes to channel 1.",
     "source": "manual p.23", "confidence": "stated"},
]
D["indicators"] = [
    {"id": "matrix_leds", "module": "ctl", "label": "matrix LEDs", "kind": "led", "function": "Patch points at three brightness levels (gain 1, 0.7, 0.3); also patch memory, sequencer notes, gate lengths, BPM and configuration text."},
    {"id": "trap_led", "module": "trap", "label": "Trapezoid LED", "kind": "led", "function": "Envelope state."},
    {"id": "ef_led", "module": "in1", "label": "envelope follower gate LED", "kind": "led", "function": "Lit when a gate is detected."},
    {"id": "joy_leds", "module": "joy", "label": "joystick LEDs", "kind": "led", "led_colour": "multi", "function": "Bicolour feedback of the recorded CVs."},
    {"id": "meter", "module": "scope", "label": "SCOPE meter", "kind": "meter", "function": "Audio level (to about 4.5 V) or bipolar CV."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Patching", "applies_to": ["ctl"],
     "rule": "No sound until a patch is made. Move with the X/Y encoders (or SHIFT + joystick); the left encoder cycles gain 1, 0.7, 0.3, off; the right toggles gain 1 or off. SHIFT + encoder previews a point while held; SHIFT + right encoder + joystick draws points."},
    {"id": "b02", "name": "Patch memory", "applies_to": ["ctl"],
     "rule": "256 patches: SAVE, choose a slot, push an encoder; RECALL to load; < PATCH > to step through; SHIFT + PATCH > for a random patch within the set density and area. Autosaves every 30 s. Knob positions are not stored."},
    {"id": "b03", "name": "Trapezoid", "applies_to": ["trap", "trapvca"],
     "rule": "Loops attack, on, decay, off by default; OFF above 9 makes it one-shot, fired by gates, the envelope follower or the GATE button. With an external gate, ON is the gate length. Decay is voltage controlled; the built-in VCA takes the Envelope Signal column."},
    {"id": "b04", "name": "Filter", "applies_to": ["vcf"], "rule": "HPF and LPF in series: LPF at 10 is pure high-pass, HPF at 0 pure low-pass, otherwise band-pass with adjustable width and centre. Audio-rate modulation works; resonance from 7 makes a sine oscillator."},
    {"id": "b05", "name": "Effects are wet only", "applies_to": ["fx"], "rule": "Send the dry signal and the effects row to the same output for a mix. TIME knob motion can be recorded (8 s, not saved)."},
    {"id": "b06", "name": "Sequencer", "applies_to": ["ctl"],
     "rule": "SHIFT + GATE/SEQ turns the matrix into a 16-step piano roll: rows 1-12 semitones (three octaves by brightness), row 13 length, rows 14-16 gate length (15-100%). The CV goes to all oscillators. Two stepped modulation lanes (21 levels, ±5 V) add to joystick Y and X. Saved with the patch."},
    {"id": "b07", "name": "Joystick and MIDI CCs", "applies_to": ["joy"], "rule": "Joystick X and Y (±5 V by their levels) appear on rows 16 and 15; MIDI CCs (default 70 and 71) and the stepped lanes add to them. Motion and gate patterns record for 8 s and overdub."},
    {"id": "b08", "name": "MIDI and CV", "applies_to": ["ctl"],
     "rule": "One MIDI note at a time, high-note priority; MIDI note CV adds to CV1/CV2. Mod wheel and velocity reach the filter cutoff; pitch bend range 0-12. SHIFT + REC/CLEAR for 3 s sends MIDI panic."},
]
D["midi"] = {
    "receives": [{"message": "note_on", "note": "high-note priority; velocity to filter cutoff (VELC)"}, {"message": "note_off"}, {"message": "pitch_bend", "note": "0-12 semitones"},
                 {"message": "control_change", "cc": 1, "parameter": "filter cutoff (mod wheel)"}, {"message": "control_change", "cc": 70, "parameter": "joystick X (assignable)"},
                 {"message": "control_change", "cc": 71, "parameter": "joystick Y (assignable)"}, {"message": "clock", "note": "sequencer clock with division 1, /2, /4, /8"},
                 {"message": "sysex", "note": "firmware update only"}],
    "transmits": [], "channel_note": "Channel 1-16 or 0 (omni); MIDI THRU passes input on.", "note": "No patch dumps over MIDI."}
D["specifications"] = {
    "oscillators": "3 (two audio C0-C8, one 0.05-500 Hz)", "filter": "HP and LP in series, resonant", "envelope": "Trapezoid: attack 6-850 ms, on 0-1.5 s, decay 16 ms-2 s, off 14 ms-1.3 s",
    "matrix": "16 x 16, 3 gain levels, 256 patch memories", "sequencer": "16 steps, 3 octaves, 6 gate lengths", "effects": "delay (to 0.5 s or 3 s) and reverb, tape or BBD mode",
    "inputs": ["Input 1 with envelope follower", "Input 2 line/mic, DC coupled", "CV1", "CV2", "gate", "MIDI in"], "outputs": ["Output 1", "Output 2", "headphones", "scope out", "MIDI thru"],
    "power": "12 V DC, centre positive", "internal_levels": "audio about 3.7 Vpp; CV ±5 V",
}
D["omitted_from_source"] = ["safety, disposal and warranty", "interface illustration labels beyond control names", "firmware update procedure steps", "MIDI DAC calibration steps"]
D["not_in_source"] = ["ring mod SOURCE B positions", "jack sizes", "dimensions, weight and power draw", "output levels", "matrix column order beyond the panel art"]
D["source_inconsistencies"] = [
    "Input 1's normalling text says the scope output is routed 'if nothing is patched into the INPUT 2 jack', copied from the Input 2 text.",
    "The factory reset text says the 'firmware update screen will appear' and 'proceed with the FW update', in a reset procedure.",
    "The joystick is on 'pins 15 and 16' of the matrix; the matrix list gives vertical then horizontal, taken here as rows 15 (Y) and 16 (X).",
    "The modulation example calls Osc 3's output a sawtooth; its row is the triangle/ramp wave.",
]
D["modelling_gaps"] = [
    {"topic": "Matrix references", "detail": "Letters and numbers are added for reference; the panel uses names only."},
    {"topic": "Sequencer and lanes", "detail": "Step data (notes, gates, stepped lanes) is described, not modelled as parameters."},
    {"topic": "Recordable motion", "detail": "Joystick, gate and TIME recordings (8 s each) are performance data and not saved."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "patch_matrix", "example_patches", "indicators", "behaviours", "midi",
         "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/erica-synths-syntrx-ii_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
