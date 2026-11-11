#!/usr/bin/env python3
"""Assemble the Make Noise 0-Coast device file (schema 0.13.0).

Single-voice patchable analogue synthesizer, "no coast" synthesis: a triangle-core VCO
(triangle and square), OVERTONE (one added harmonic, odd to even, then Slope blended
in), MULTIPLY (adds overtones; wavefolding), BALANCE (fundamental to overtones),
DYNAMICS (transistor low-pass gate), SLOPE (rise/fall function, triggered or cycling,
LFO to audio rate) and CONTOUR (onset/sustain/decay envelope), with Voltage MATH (sum,
offset, attenuverter, mult), clock with tap tempo, stepped random, and a two-channel
MIDI-to-CV converter with arpeggiator and clock-synced portamento. Normalled so it plays
without cables; 29 patch points at Eurorack levels.

Source: Make Noise 0-Coast manual (REV 7, 5.19.16; PDF dated 2017), 44 pages, written by
Tony Rolando and Walker Farrell. Knob positions are given as clock positions; this file
maps 7:00 = 0 to 5:00 = 10 (12:00 = 5), and attenuverters 7:00 = -5 to 5:00 = +5.
"""
import json

S10 = {"min": 0, "max": 10, "note": "unmarked knob; 7:00 = 0, 12:00 = 5, 5:00 = 10"}
AV = {"min": -5, "max": 5, "note": "attenuverter; 12:00 = 0 (no effect), full CCW = full inversion"}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", memory=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    if memory:
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


def atv(id, module, label, fn, **kw):
    par(id, module, label, "continuous", fn, panel_scale=AV, **kw)


def pgm(id, label, kind, fn, where, cc=None, **kw):
    acc = [{"type": "gesture", "gesture": where, "when": "any_time"}] if where else []
    if cc is not None:
        acc.append({"type": "midi", "message": f"CC {cc}", **({"note": kw.pop("cc_note")} if "cc_note" in kw else {})})
    if "vals" in kw:
        kw["values"] = [v if isinstance(v, dict) else {"value": v} for v in kw.pop("vals")]
    par(id, "midi", label, kind, fn, memory=kw.pop("memory", "global"), access=acc, **kw)


def jack(id, label, direction, signal, node, fn, ref, location=None, **kw):
    j = {"id": id, "label": label, "location": location or ("patch_in" if direction == "in" else "patch_out"), "direction": direction, "signal": signal,
         "connector": "3.5 mm jack", "node": node, "function": fn, "manual_ref": ref}
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


def norm(frm, to, jack_id, signal="cv", **kw):
    con(frm, to, signal, kind="normalled", broken_by=jack_id, **kw)


def eq(p, v):
    return {"param": p, "equals": v}


# ======================================================================== device
D["device"] = {
    "id": "make-noise-0-coast", "manufacturer": "Make Noise", "model": "0-COAST",
    "category": "single-voice patchable (semi-modular) analogue synthesizer with MIDI-to-CV, desktop, Eurorack signal levels",
    "based_on": "Original Make Noise design (manual REV 7, May 2016) mixing Moog ('East Coast') and Buchla ('West Coast') techniques without following either: 'no coast synthesis'. Retail $499. Current firmware 1.6.8.",
    "sources": [
        {"id": "manual", "title": "Make Noise 0-COAST manual, REV 7 (5.19.16)", "kind": "user_manual", "file": "0_Coast_Manual.pdf", "pages": 44,
         "note": "Normalisation diagram, numbered panel legend (1-61), default sounds, MIDI and program pages, MIDI CC list, every circuit with patching examples, open "
                 "patch points, overriding normals, Voltage MATH, signal levels, patch ideas (drawn) and MIDI pin-out. Knob settings are given as clock positions."},
        {"id": "makenoise_product", "title": "Make Noise, 0-COAST product page", "kind": "spec_sheet", "url": "https://www.makenoisemusic.com/synthesizers-and-controllers/0-coast/",
         "note": "Dimensions; firmware 1.6.8 download; Max for Live programmer; patch sheets."},
        {"id": "retail_specs", "title": "Retailer specifications (Reverb / Chuck Levin's, Milk Audio Store, Midwest Modular)", "kind": "other",
         "url": "https://www.milkaudiostore.com/shop/make-noise-0-coast",
         "note": "Weight 1.7 lb / 771 g; 15 V DC at 1 A on a 2.1 mm tip-positive plug; 45 HP wide; 13 patch sources and 14 destinations; retail $499."},
        {"id": "sonicstate_fw", "title": "Sonicstate, 'Makenoise 0-Coast Firmware Update Adds Easier Editing' (17 Nov 2016)", "kind": "other",
         "url": "https://sonicstate.com/news/2016/11/17/makenoise-0-coast-firmware-update-adds-easier-editing/",
         "note": "The November 2016 update added clock-synced portamento and program-page editing by CC."},
        {"id": "lines_coast_express", "title": "Coast Express (lines forum and web app)", "kind": "other", "url": "https://llllllll.co/t/coast-express-0-coast-midi-settings-manager-for-web-and-max/33922",
         "note": "From firmware 1.6.8, settings CCs are accepted only while in the program pages."},
        {"id": "subsystem_midi", "title": "Subsystem, Make Noise 0-COAST MIDI implementation (firmware 1.6.8)", "kind": "other",
         "url": "https://subsystem.co/supplemental/definitions/midi/instruments/make_noise/zero_coast",
         "note": "Quotes the 1.6.8 updater note: the only MIDI change listed is a fix to MIDI B CV range for velocity and mod wheel."},
        {"id": "sos_review", "title": "Sound On Sound, Make Noise 0-Coast review", "kind": "other", "url": "https://www.soundonsound.com/reviews/make-noise-0-coast",
         "note": "No filter; VCO tracks about four octaves; oscillator sync by triggering Slope from the square."},
        {"id": "modwiggler_retrigger", "title": "ModWiggler, 'No Coast slope/contour subharmonics - why?'", "kind": "other", "url": "https://www.modwiggler.com/forum/viewtopic.php?t=247211",
         "note": "Forum explanation: the function generator ignores triggers during its rise but retriggers during its fall, which divides an audio-rate trigger into subharmonics."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "synthesis_note": "Hybrid East/West: one triangle-core VCO, additive harmonics from OVERTONE and MULTIPLY (wavefolding), a BALANCE crossfade and a low-pass gate (DYNAMICS); no conventional filter.",
    "signal_path": "analogue", "signal_path_note": "100 % analogue signal path; the MIDI circuit is digital.", "voices": 1, "polyphony_mode": "monophonic; legato or retrigger gate",
    "poly_chain_max_units": None, "patch_memory": False,
    "patch_memory_note": "No sound memory. Program page settings are kept; holding PGM_A and PGM_B at power-on restores their defaults.",
    "semi_modular": True,
    "panel_counts": {"knobs": 18, "trimmers": 1, "buttons": 3, "patch_points": 29, "patch_sources": 13, "patch_destinations": 14, "activity_windows": 12},
    "panel_counts_note": "29 = 13 patchable sources + 14 destinations (Make Noise's own figures, matching this file's ports) + MIDI IN + LINE OUT.",
    "summary": ("MIDI A sets the oscillator pitch (always, summed with the 1V/OCT input) and gates CONTOUR. The VCO's triangle and square feed OVERTONE, which adds one "
                "harmonic (odd, then even, then blends in SLOPE at full clockwise); MULTIPLY folds that into more overtones, modulated by SLOPE through a normal. BALANCE "
                "crossfades the plain triangle (FUND) against the overtone path (OVRTN) into DYNAMICS, a low-pass gate opened by CONTOUR, then the line output. SLOPE is "
                "a 0-8 V rise/fall function, triggered or cycling up to audio rate. Voltage MATH, a clock with tap tempo, stepped random and MIDI B (CV and gate from "
                "note, velocity, mod wheel or LFOs) are free to patch."),
}

# ======================================================================== modules
mod("midi", "midi_to_cv", "MIDI A / MIDI B (MIDI-to-CV)", "CTRL [MIDI IN, PGM_A, PGM_B]",
    "Two-channel MIDI-to-CV converter on a TRS minijack MIDI input (all channels by default). MIDI A CV is hardwired to the oscillator; MIDI A Gate is normalled to CONTOUR. "
    "MIDI B CV and Gate have jacks and selectable sources. Also hosts the arpeggiator (MIDI only) and clock-synced portamento.",
    ["midi.in", "midi.arp_clock"], ["midi.a_cv", "midi.a_gate", "midi.b_cv", "midi.b_gate", "midi.clock"],
    {"channels": ["A", "B"], "default_channel": "all", "arp_max_notes": 20, "dac": "calibrated to the internal VCO; MIDI B calibratable to an external VCO"})
mod("clock", "gate_logic", "Clock", "CTRL [TEMPO, CLK]", "Clock whose tempo comes from tapping PGM_B, pulses at TEMPO input and MIDI clock (if enabled), combined. Drives CLK OUT, stepped random, arpeggio and portamento timing.",
    ["clock.tempo_in", "clock.midi_in"], ["clock.out"])
mod("random", "sample_hold", "Stepped random", "CTRL [random output]", "A new random voltage (0 to +10 V) on each clock cycle.", ["random.clock"], ["random.out"], {"range_v": [0, 10]})
mod("vmath", "summer", "Voltage MATH", "CTRL [Voltage MATH]",
    "CH1 (unity) plus CH2 (through an attenuverter; normalled to an offset) summed to two identical outputs: mixer, offset generator, inverter, attenuator and mult.",
    ["vmath.ch1", "vmath.ch2"], ["vmath.out1", "vmath.out2", "vmath.offset"])
mod("osc", "oscillator", "Oscillator", "OSCILLATOR", "Triangle-core VCO with triangle and square outputs (about 10 Vpp). Pitch from coarse and fine knobs, MIDI A, the 1V/OCT input (tracks about 4 octaves) and AC-coupled linear FM.",
    ["osc.pitch_cv", "osc.fm_in"], ["osc.tri", "osc.square"], {"waveforms": ["triangle", "square"], "core": "triangle", "voct_tracking_octaves": 4, "lin_fm": "AC coupled; overdrives above about 80 %"})
mod("overtone", "effects", "Overtone", "OVERTONE", "Uses the square to add a single harmonic to the triangle: odd harmonic counter-clockwise, a transitional state, even harmonic, and at full clockwise the SLOPE signal is blended into the audio path.",
    ["overtone.tri_in", "overtone.square_in", "overtone.slope_in", "overtone.cv"], ["overtone.out"], {"kind": "harmonic waveshaper", "regions": ["odd", "transitional", "even", "slope blend"]})
mod("multiply", "effects", "Multiply", "MULTIPLY", "Multiplies the single overtone into more overtones (a wave multiplier/folder): adds harmonics as it turns clockwise, the opposite of a low-pass filter.",
    ["multiply.in", "multiply.cv"], ["multiply.out"], {"kind": "wave multiplier (folder)"})
mod("slope", "envelope", "Slope", "SLOPE", "Rise/fall function generator, 0 to +8 V, triggered once (no sustain) or self-cycling as an LFO up to audio rate. Vari-Response shapes the segments log, linear or expo. EOC is high except during the fall.",
    ["slope.trig", "slope.time_cv"], ["slope.out", "slope.eoc"], {"stages": ["rise", "fall"], "range_v": [0, 8], "modes": ["triggered", "cycle"], "responses": ["log", "linear", "expo"],
     "retrigger": "ignored during rise, accepted during fall (ModWiggler explanation)"})
mod("contour", "envelope", "Contour", "CONTOUR", "Four-stage envelope, 0 to +8 V: ONSET (attack), DECAY (decay and release), SUSTAIN level, Vari-Response linear to expo. EON goes high at the end of onset until the decay finishes.",
    ["contour.gate", "contour.decay_cv"], ["contour.out", "contour.eon"], {"stages": ["onset", "decay", "sustain", "release (= decay)"], "range_v": [0, 8], "responses": ["linear", "expo"]})
mod("balance", "mixer", "Balance", "BALANCE", "Crossfades FUND (normalled oscillator triangle, or the BALANCE input) against OVRTN (Multiply output). The combo pot sets the blend, or attenuates CV patched to BALANCE CV.",
    ["balance.fund", "balance.ovrtn", "balance.cv"], ["balance.out", "balance.offset"])
mod("dynamics", "vca", "Dynamics", "DYNAMICS", "Low-pass gate: one control makes the sound both louder and brighter, like a Buchla 292 but with transistors instead of vactrols. CV from CONTOUR (normalled); the knob attenuates it.",
    ["dynamics.in", "dynamics.cv"], ["dynamics.out"], {"lowpass_gate": True, "element": "transistor (not vactrol)"})
mod("out", "output", "Line output", "DYNAMICS [LINE OUT, LEVEL]", "Line-level stereo TRS output (3 Vpp) with LEVEL, clean to about 80 % then clipping (OVL lights). The DYNMC output gives the same signal at 10 Vpp.",
    ["out.in"], ["out.line"])
D["modules"] = M

# ======================================================================== parameters
par("midi.pgm_a", "midi", "PGM_A", "boolean", "Hold: enter program pages (and in a page, reset it to default). Press: next page. Tap twice or more (outside pages): MIDI B LFO rate.",
    control="push_button", manual_ref=1)
par("midi.pgm_b", "midi", "PGM_B", "boolean", "Tap: clock tempo (and arpeggio rate). Hold: panic (stops MIDI and arp notes; clears Latch & Shift). In a page: step the value; hold to exit.",
    control="push_button", manual_ref=7)
pgm("midi.arp_on", "Arpeggiator run/stop", "boolean", "Plays held MIDI notes at the clock rate (PGM_B lit).", "press PGM_A and PGM_B together", cc=117, memory="none")
pgm("midi.arp_type", "Page 1: Arpeggiator type", "enum", "Traditional (held notes in played order) or Latch & Shift (notes added and kept after release; replay removes; up to 20, oldest dropped).",
    "program page 1 (PGM_A lit), PGM_B off/on", cc=119, vals=[{"value": "traditional"}, {"value": "latch_shift"}], default="traditional")
pgm("midi.legato", "Page 2: Legato", "boolean", "On: MIDI A gate stays high until all notes are released (one Contour). Off: retrigger on every new note.", "program page 2, PGM_B on/off", cc=118, default=True)
pgm("midi.ch_a", "Page 3: MIDI A channel", "enum", "Receive channel for MIDI A (learned).", "program page 3 (MIDI Learn), play on the channel, hold PGM_B", cc=102, vals=[{"value": "1..16"}, {"value": "all"}], default="all",
    cc_note="0-15 = channel 1-16; 16-127 = all")
pgm("midi.ch_b", "Page 3: MIDI B channel", "enum", "Receive channel for MIDI B (learned).", "program page 3 (MIDI Learn), play on the channel, hold PGM_B", cc=103, vals=[{"value": "1..16"}, {"value": "all"}], default="all",
    cc_note="0-15 = channel 1-16; 16-127 = all")
pgm("midi.b_cv_src", "Page 4: MIDI B CV source", "enum", "What MIDI B CV outputs.", "program page 4, PGM_B off/on/pulse/flash", cc=105,
    vals=[{"value": "note"}, {"value": "velocity"}, {"value": "mod_wheel"}, {"value": "lfo", "meaning": "triangle; rate tapped on PGM_A"}], default="velocity")
pgm("midi.b_gate_src", "Page 5: MIDI B gate source", "enum", "What MIDI B Gate outputs.", "program page 5, PGM_B off/on/pulse/flash", cc=107,
    vals=[{"value": "note_on"}, {"value": "velocity_gt_50"}, {"value": "mod_wheel_gt_50"}, {"value": "lfo", "meaning": "square; same rate as the MIDI B triangle"}], default="mod_wheel_gt_50")
pgm("midi.midi_clock", "Page 6: MIDI clock", "boolean", "Clock follows incoming MIDI clock (1/1), added to tap and TEMPO input.", "program page 6, PGM_B off/on", cc=114, default=False)
pgm("midi.calibrate", "Page 7: Calibrate", "boolean", "Calibrates MIDI A to the VCO (about 3 min) or MIDI B to an external VCO via the TEMPO input (about 6 min). Warm up 20 minutes first.",
    "program page 7, press PGM_B", memory="none")
pgm("midi.a_cv_src", "MIDI A CV source", "enum", "What MIDI A CV sends (normally note); CC only, while in program pages.", None, cc=104,
    vals=[{"value": "note"}, {"value": "velocity"}, {"value": "mod_wheel"}, {"value": "lfo", "meaning": "rate set by clock"}], default="note")
pgm("midi.a_gate_src", "MIDI A gate source", "enum", "What MIDI A Gate sends (normally note on); CC only, while in program pages.", None, cc=106,
    vals=[{"value": "note_on"}, {"value": "velocity_gt_50"}, {"value": "mod_wheel_gt_50"}, {"value": "lfo"}], default="note_on")
for ch, cb, ca, cv in (("a", 108, 110, 112), ("b", 109, 111, 113)):
    pgm(f"midi.bend_{ch}", f"Pitch bend scale {ch.upper()}", "integer", "Bend range in semitones, centred on the active pitch; CC only, in program pages.", None, cc=cb, range={"min": 0, "max": 127})
    pgm(f"midi.after_{ch}", f"Aftertouch scale {ch.upper()}", "integer", "Aftertouch amount in semitones; CC only, in program pages.", None, cc=ca, range={"min": 0, "max": 127})
    pgm(f"midi.vel_{ch}", f"Velocity scale {ch.upper()}", "integer", "Minimum velocity value; CC only, in program pages.", None, cc=cv, range={"min": 0, "max": 127})
pgm("clock.tempo_div", "TEMPO IN divisor", "integer", "Divides pulses at the TEMPO input; CC only, in program pages.", None, cc=116, range={"min": 0, "max": 127})
pgm("midi.portamento", "Portamento on/off", "boolean", "Analogue portamento on MIDI A pitch.", None, cc=65, cc_note="0 off, 1-127 on", memory="none")
pgm("midi.portamento_time", "Portamento time", "integer", "Glide time in 64ths of the clock; 50 % takes one whole clock pulse; follows clock changes. 0 is off.", None, cc=5, range={"min": 0, "max": 127}, memory="none")
atv("vmath.ch2_level", "vmath", "Voltage MATH CH2 attenuverter", "Scales and inverts CH2, or sets the offset when CH2 is unpatched.", manual_ref=14)
knob("osc.pitch", "osc", "PITCH", "Coarse frequency (large grey knob).", manual_ref=20)
knob("osc.fine", "osc", "FINE", "Fine tune.", manual_ref=21)
knob("osc.linfm", "osc", "LIN FM attenuator", "Depth (index) of linear FM from the LIN FM input; over about 80 % the FM bus overdrives and tracking suffers.", manual_ref=22)
knob("osc.calibration", "osc", "Calibration trimmer", "Oscillator calibration trimmer.", manual_ref=61, access=[{"type": "panel", "control": "knob", "note": "trimmer"}])
knob("overtone.amount", "overtone", "OVERTONE", "Odd harmonic (CCW) through a transitional state to even, then blends in SLOPE at full clockwise.", manual_ref=25)
knob("overtone.cv_amount", "overtone", "OVERTONE CV attenuator", "Depth of CV at the OVERTONE input; zero at full CCW. Full CW gives 50 % modulation depth from the panel's centre.", manual_ref=26)
knob("multiply.amount", "multiply", "MULTIPLY", "Amount of added overtones.", manual_ref=27)
atv("multiply.cv_amount", "multiply", "MULTIPLY CV attenuverter", "Depth and direction of CV at the MULTIPLY input (normally SLOPE).", manual_ref=28)
par("slope.cycle", "slope", "CYCLE", "boolean", "Self-cycles SLOPE as an LFO or audio-rate oscillator (button lit white).", control="push_button", manual_ref=32)
knob("slope.rise", "slope", "RISE", "Time to reach +8 V; clockwise is slower.", manual_ref=33)
knob("slope.fall", "slope", "FALL", "Time back to 0 V; clockwise is slower.", manual_ref=34)
knob("slope.response", "slope", "Vari-Response", "Segment shape from log through linear to expo; more expo is also faster.", manual_ref=36)
knob("contour.onset", "contour", "ONSET", "Attack time to +8 V.", manual_ref=42)
knob("contour.sustain", "contour", "SUSTAIN", "Sustain level; full CCW gives an AD shape, full CW an ASR.", manual_ref=43)
knob("contour.decay", "contour", "DECAY", "Decay time to the sustain level, and release time after the gate ends.", manual_ref=44)
knob("contour.response", "contour", "Vari-Response", "Segment shape from linear to expo; more expo is faster and more percussive.", manual_ref=46)
knob("balance.amount", "balance", "BALANCE", "FUND (CCW) to OVRTN (CW); with a cable in BALANCE CV it attenuates that CV instead.", manual_ref=54)
knob("dynamics.amount", "dynamics", "DYNAMICS", "Attenuates the CV opening the low-pass gate (normally CONTOUR); set to at least 3:00 for the default sound.", manual_ref=55)
knob("out.level", "out", "LEVEL", "Line output volume; clean to about 80 %, then clips (OVL).", manual_ref=57)
D["parameters"] = P

# ======================================================================== ports
jack("midi.in", "MIDI IN", "in", "midi", "midi.in", "MIDI on a TRS minijack (Korg-style); DIN adapter included.", 3, location="top", connector="3.5 mm TRS (MIDI)")
jack("jack.midi_b_cv", "MIDI B CV (Ext. CV Output)", "out", "cv", "midi.b_cv", "MIDI B CV: note, velocity, mod wheel or triangle LFO.", 5)
jack("jack.midi_b_gate", "MIDI B GATE (Ext. Gate Output)", "out", "gate", "midi.b_gate", "MIDI B gate: note, velocity or mod wheel over 50 %, or square LFO.", 6)
jack("jack.tempo", "TEMPO", "in", "clock", "clock.tempo_in", "Clock pulses (any hard edge) set the tempo, combined with tapping and MIDI clock. Also the calibration input for an external VCO.", 8)
jack("jack.clock_out", "CLK OUT", "out", "clock", "clock.out", "Gates at the clock tempo.", 10)
jack("jack.random", "Stepped random OUT", "out", "cv", "random.out", "New random voltage each clock (0 to +10 V).", 11)
jack("jack.vmath_ch1", "Voltage MATH CH1", "in", "cv_or_audio", "vmath.ch1", "Unity input to the sum.", 12)
jack("jack.vmath_ch2", "Voltage MATH CH2", "in", "cv_or_audio", "vmath.ch2", "Attenuverted input; normalled to an offset.", 13)
jack("jack.vmath_out1", "Voltage MATH OUT 1", "out", "cv_or_audio", "vmath.out1", "CH1 + CH2.", 16)
jack("jack.vmath_out2", "Voltage MATH OUT 2", "out", "cv_or_audio", "vmath.out2", "Identical copy of OUT 1.", 17)
jack("jack.tri", "Oscillator TRIANGLE", "out", "audio", "osc.tri", "Triangle, about 10 Vpp; patching it leaves the normal to BALANCE in place.", 18)
jack("jack.square", "Oscillator SQUARE", "out", "audio", "osc.square", "Square, about 10 Vpp.", 19)
jack("jack.voct", "1V/OCT", "in", "cv", "osc.pitch_cv", "Pitch CV, summed with MIDI A; tracks reasonably over 4 octaves.", 23, combine="sum")
jack("jack.linfm", "LIN FM", "in", "cv_or_audio", "osc.fm_in", "AC-coupled linear FM at the LIN FM attenuator's depth.", 24)
jack("jack.overtone_cv", "OVERTONE CV", "in", "cv", "overtone.cv", "Modulates OVERTONE through its attenuator.", 30, combine="sum")
jack("jack.multiply_cv", "MULTIPLY CV", "in", "cv", "multiply.cv", "Modulates MULTIPLY through its attenuverter; normalled to SLOPE.", 31)
jack("jack.slope_time", "SLOPE TIME", "in", "cv", "slope.time_cv", "Modulates rise and fall time equally.", 38, combine="sum")
jack("jack.eoc", "EOC", "out", "gate", "slope.eoc", "End of cycle: high except while SLOPE falls.", 39)
jack("jack.slope_trig", "SLOPE TRIG", "in", "gate", "slope.trig", "Rising edge fires one rise/fall function.", 40)
jack("jack.slope_out", "SLOPE OUT", "out", "cv", "slope.out", "SLOPE function, 0 to +8 V.", 41)
jack("jack.decay_cv", "CONTOUR DECAY", "in", "cv", "contour.decay_cv", "Modulates decay time.", 47, combine="sum")
jack("jack.contour_gate", "CONTOUR GATE", "in", "gate", "contour.gate", "Gate for CONTOUR; normalled to MIDI A gate.", 49)
jack("jack.eon", "EON", "out", "gate", "contour.eon", "End of onset: high from the end of onset until the decay finishes.", 50)
jack("jack.contour_out", "CONTOUR OUT", "out", "cv", "contour.out", "CONTOUR function, 0 to +8 V.", 51)
jack("jack.balance_in", "BALANCE EXT input", "in", "audio", "balance.fund", "Replaces the triangle on the FUND side.", 52)
jack("jack.balance_cv", "BALANCE CV", "in", "cv", "balance.cv", "CV for the blend; the combo pot becomes its attenuator.", 53)
jack("jack.line_out", "LINE OUT", "out", "audio", "out.line", "Stereo TRS line output, 3 Vpp, for headphones or a mixer (use TS into balanced inputs).", 58, connector="3.5 mm TRS")
jack("jack.dynamics_cv", "DYNAMICS CV", "in", "cv", "dynamics.cv", "Opens the low-pass gate; normalled to CONTOUR.", 59)
jack("jack.dynamics_out", "DYNMC OUT", "out", "audio", "dynamics.out", "Modular-level output, 10 Vpp; not for line equipment or headphones.", 60)
jack("power.dc", "DC IN", "in", "power", None, "15 V DC, tip positive; Make Noise adapter only.", None, location="rear", connector="DC barrel")
D["ports"] = J

# ======================================================================== connections
con("midi.a_cv", "osc.pitch_cv", "cv", note="Hardwired: MIDI A always sets pitch; the 1V/OCT input adds to it. Portamento applies here when enabled.")
norm("midi.a_gate", "contour.gate", "jack.contour_gate", "gate")
con("osc.tri", "overtone.tri_in", note="Hardwired.")
con("osc.square", "overtone.square_in", note="Hardwired.")
con("slope.out", "overtone.slope_in", "cv_or_audio", note="Hardwired; heard only near full-clockwise OVERTONE.")
con("overtone.out", "multiply.in", note="Hardwired.")
norm("slope.out", "multiply.cv", "jack.multiply_cv", amount="multiply.cv_amount")
con("multiply.out", "balance.ovrtn", note="Hardwired to the OVRTN side.")
norm("osc.tri", "balance.fund", "jack.balance_in", "audio")
norm("balance.offset", "balance.cv", "jack.balance_cv", amount="balance.amount", note="Internal offset, so the combo pot sets the blend with nothing patched.")
con("balance.out", "dynamics.in", note="Hardwired.")
norm("contour.out", "dynamics.cv", "jack.dynamics_cv", amount="dynamics.amount")
con("dynamics.out", "out.in", amount="out.level", note="Hardwired; DYNMC OUT carries the same signal at modular level.")
norm("vmath.offset", "vmath.ch2", "jack.vmath_ch2", amount="vmath.ch2_level")
con("clock.out", "random.clock", "clock", note="A new random value each clock cycle.")
con("clock.out", "midi.arp_clock", "clock", note="Arpeggio rate and portamento timing follow the clock.")
con("midi.clock", "clock.midi_in", "clock", eq("midi.midi_clock", True))
D["connections"] = C

# ======================================================================== indicators
D["indicators"] = [
    {"id": "pgm_a", "module": "midi", "label": "PGM_A", "kind": "led", "led_colour": "white", "function": "Lit in program pages and as a page indicator.", "manual_ref": 1},
    {"id": "midi_a", "module": "midi", "label": "MIDI A", "kind": "led", "led_colour": "red", "function": "MIDI A activity; flashes twice on page entry or reset.", "manual_ref": 2},
    {"id": "midi_b", "module": "midi", "label": "MIDI B", "kind": "led", "led_colour": "red", "function": "MIDI B activity; page indicator.", "manual_ref": 4},
    {"id": "pgm_b", "module": "midi", "label": "PGM_B", "kind": "led", "led_colour": "white", "function": "Lit when the arpeggiator runs; shows the page value.", "manual_ref": 7},
    {"id": "tempo", "module": "clock", "label": "TEMPO", "kind": "led", "led_colour": "red", "function": "Flashes at the clock rate.", "manual_ref": 9},
    {"id": "random", "module": "random", "label": "Stepped random", "kind": "led", "function": "Stepped random activity.", "confidence": "inferred", "note": "Mentioned in the calibration text; not in the panel legend."},
    {"id": "vmath", "module": "vmath", "label": "Voltage MATH", "kind": "led", "led_colour": "multi", "function": "Red/green for the output's polarity and level.", "manual_ref": 15},
    {"id": "multiply", "module": "multiply", "label": "MULTIPLY", "kind": "led", "led_colour": "amber", "function": "Multiply activity (printed as orange).", "manual_ref": 29},
    {"id": "slope", "module": "slope", "label": "SLOPE", "kind": "led", "led_colour": "green", "function": "Slope level.", "manual_ref": 35},
    {"id": "eoc", "module": "slope", "label": "EOC", "kind": "led", "led_colour": "yellow", "function": "End of cycle gate.", "manual_ref": 37},
    {"id": "cycle", "module": "slope", "label": "CYCLE", "kind": "led", "led_colour": "white", "function": "Lit when SLOPE self-cycles.", "manual_ref": 32},
    {"id": "contour", "module": "contour", "label": "CONTOUR", "kind": "led", "led_colour": "green", "function": "Contour level.", "manual_ref": 45},
    {"id": "eon", "module": "contour", "label": "EON", "kind": "led", "led_colour": "yellow", "function": "End of onset gate.", "manual_ref": 48},
    {"id": "dynamics", "module": "dynamics", "label": "DYNAMICS", "kind": "led", "led_colour": "amber", "function": "Gate opening (printed as orange).", "manual_ref": 56},
    {"id": "ovl", "module": "out", "label": "OVL", "kind": "led", "function": "Line output clipping."},
]
D["led_legend"] = {"rule": "Activity windows by colour.", "colours": [
    {"colour": "red", "meaning": "MIDI activity, clock rate, negative Voltage MATH", "modules": ["midi", "clock", "vmath"]},
    {"colour": "green", "meaning": "function levels; positive Voltage MATH", "modules": ["slope", "contour", "vmath"]},
    {"colour": "yellow", "meaning": "EOC and EON gates", "modules": ["slope", "contour"]},
    {"colour": "amber", "meaning": "MULTIPLY and DYNAMICS activity (printed as orange)", "modules": ["multiply", "dynamics"]},
    {"colour": "white", "meaning": "illuminated buttons", "modules": ["midi", "slope"]}], "confidence": "stated"}

# ======================================================================== behaviours
B = [
    ("Normalled voice", ["midi", "osc", "overtone", "multiply", "balance", "dynamics", "contour", "slope"],
     "With no cables: MIDI A pitch to the VCO, triangle and square into OVERTONE then MULTIPLY (modulated by SLOPE), BALANCE between triangle and overtones, DYNAMICS opened by CONTOUR, which MIDI A gates. Gold panel lines show the flow; arrows mark normals that a cable breaks."),
    ("Patching rules", ["osc"], "Every jack is an input or an output. Input to input does nothing; output to output is unpredictable but harmless. Patching an output never breaks its normals; patching an input does."),
    ("Signal levels", ["osc", "slope", "contour", "dynamics"], "Eurorack levels: audio about 10 Vpp, functions 0 to +8 V, gates +8 V, random 0 to +10 V, everything within ±10 V. Gate inputs respond to anything rising above about 2 V. Line out 3 Vpp; DYNMC out 10 Vpp."),
    ("Overtone", ["overtone"], "Turning OVERTONE clockwise moves the added harmonic from odd through a transitional state to even; at full clockwise SLOPE is blended into the audio path (inharmonic, ring-mod-like unless SLOPE is tuned to the VCO)."),
    ("Multiply", ["multiply"], "Adds overtones above the one from OVERTONE as it turns clockwise; additive (West Coast), the reverse of sweeping a low-pass filter."),
    ("Balance", ["balance"], "FUND (CCW) is the plain triangle, almost a sub-octave to the overtone side; OVRTN (CW) is the processed signal. Sweeping it is like opening a low-pass filter. A cable in BALANCE CV turns the knob into that CV's attenuator."),
    ("Low-pass gate", ["dynamics", "contour"], "DYNAMICS raises level and brightness together, like a Buchla 292 but with transistors, so it responds faster than a vactrol gate. CONTOUR opens it through the DYNAMICS knob; patch an offset to DYNAMICS CV for a drone."),
    ("Slope", ["slope"], "Trigger: one 0 V to +8 V rise and fall, no sustain (only the rising edge counts). A forum explanation adds that triggers are ignored during the rise but accepted during the fall, so an audio-rate trigger divides into subharmonics. CYCLE: repeats as an LFO, fast enough for audio. RISE and FALL set times and shape (fast rise, slow fall gives a saw). Vari-Response bends segments log, linear or expo, and expo also speeds it up. TIME CV scales both."),
    ("Contour", ["contour"], "Onset to +8 V, decay to SUSTAIN while the gate is high, then back to 0 V at the DECAY rate. SUSTAIN at minimum gives AD, at maximum ASR, between ADSR. Vari-Response from linear to expo, faster towards expo."),
    ("Voltage MATH", ["vmath"], "OUT 1 and OUT 2 both carry CH1 + attenuverted CH2. With CH2 unpatched the attenuverter sets a ±offset. Uses: mix two CVs, invert (e.g. Contour falling Overtone), scale (vibrato depth into 1V/OCT), and mult one source to two destinations."),
    ("Clock and random", ["clock", "random"], "Clock tempo is tapped on PGM_B, taken from TEMPO input pulses, or follows MIDI clock when enabled; the sources combine. Each clock gives a new stepped random value. Patching EOC to TEMPO syncs random to the slope cycle."),
    ("MIDI A", ["midi", "osc", "contour"], "Receives on all channels by default. CV is always on the oscillator and adds to 1V/OCT, which can act as transpose. Gate normals to CONTOUR; legato keeps one gate until all notes are released, retrigger regates each note."),
    ("MIDI B", ["midi"], "A second converter with jacks: CV from note, velocity (default), mod wheel or a triangle LFO; gate from note on, velocity or mod wheel above 50 % (default), or a square LFO; the LFOs share a rate tapped on PGM_A. Separate channels make the 0-Coast a two-channel MIDI-to-CV interface."),
    ("Arpeggiator", ["midi"], "MIDI only. Traditional: held notes in played order at the clock rate. Latch & Shift: notes are added and kept after release, replaying a note removes it, up to 20 notes."),
    ("Portamento", ["midi"], "CC 65 switches analogue portamento, CC 5 sets its time in 64ths of the clock (50 % takes a full pulse); it follows clock and CC changes, so it can be automated."),
    ("Program pages and CC", ["midi"], "Hold PGM_A to enter seven pages (arp type, legato, MIDI learn, MIDI B CV source, MIDI B gate source, MIDI clock, calibrate). PGM_B steps values; hold PGM_A to reset a page; hold PGM_B to exit. CC 102-119 set these and more, but only while in the pages. PGM_A + PGM_B at power-on restores defaults."),
    ("Calibration", ["midi", "osc"], "Calibrate MIDI A to the VCO (pitch full CCW, fine 10:00, about 3 min) or MIDI B to an external VCO via the TEMPO input (about 6 min); warm up 20 minutes, no cables."),
    ("Firmware", ["midi"], "The November 2016 update added clock-synced portamento (CC 5, 65) and program-page editing by CC (Sonicstate). From 1.6.8, settings CCs are accepted only in the program pages (Coast Express); its release note lists a fix to MIDI B CV range for velocity and mod wheel (as quoted by Subsystem)."),
    ("Oscillator sync", ["osc", "slope"], "Patching the square to SLOPE TRIG restarts the cycling Slope on every oscillator cycle; RISE, FALL and Vari-Response then shape a synced tone (Sound On Sound; the manual's Sync Bass patch)."),
    ("FM", ["osc", "slope"], "LIN FM is AC-coupled and keeps pitch tracking; cycling SLOPE at audio rate is the obvious modulator. Above about 80 % the FM bus overdrives. For exponential FM patch into 1V/OCT, through Voltage MATH for depth."),
]
D["behaviours"] = [{"id": f"b{i + 1:02d}", "name": n, "applies_to": a, "rule": r} for i, (n, a, r) in enumerate(B)]

# ======================================================================== example patches
D["example_patches"] = [
    {"id": "default_sound", "name": "Default Sound (Figure 8)", "source": "manual p.9", "settings": {"dynamics.amount": 8},
     "description": "No cables; played from MIDI or CV/gate. Knob positions are drawn; the text asks for DYNAMICS at 3:00 or more.", "confidence": "stated"},
    {"id": "drone", "name": "Drone (Figure 9)", "source": "manual pp.9, 20", "cords": [["jack.vmath_out1", "jack.dynamics_cv"]], "settings": {"vmath.ch2_level": 3},
     "description": "Voltage MATH offset holds DYNAMICS open. The attenuverter position is drawn; any positive setting opens the gate.", "confidence": "inferred"},
    {"id": "square_fund", "name": "Square as the fundamental", "source": "manual p.22", "cords": [["jack.square", "jack.balance_in"]], "settings": {"balance.amount": 0},
     "description": "Square replaces the triangle on the FUND side of BALANCE.", "confidence": "stated"},
    {"id": "overtone_mixer_drone", "name": "Hearing DYNAMICS", "source": "manual p.26", "cords": [["jack.vmath_out1", "jack.dynamics_cv"]],
     "settings": {"dynamics.amount": 0, "balance.amount": 8, "multiply.amount": 5}, "description": "On the drone, sweep DYNAMICS up from zero: louder and brighter together. OVERTONE at even.", "confidence": "stated"},
    {"id": "random_overtone", "name": "Random overtone", "source": "manual p.31", "cords": [["jack.random", "jack.overtone_cv"]], "settings": {"overtone.amount": 0, "balance.amount": 5},
     "description": "Raise the OVERTONE attenuator for more depth; tap PGM_B for the rate.", "confidence": "stated"},
    {"id": "vibrato", "name": "Variable-depth vibrato", "source": "manual p.20", "cords": [["jack.slope_out", "jack.vmath_ch2"], ["jack.vmath_out1", "jack.voct"]], "settings": {"slope.cycle": True},
     "description": "Cycling SLOPE through the CH2 attenuverter into 1V/OCT; MIDI still plays the pitch.", "confidence": "stated"},
    {"id": "inverted_overtone", "name": "Overtone falling with Contour", "source": "manual p.20", "cords": [["jack.contour_out", "jack.vmath_ch2"], ["jack.vmath_out1", "jack.overtone_cv"]],
     "settings": {"overtone.amount": 10, "vmath.ch2_level": -5, "overtone.cv_amount": 10}, "description": "Overtone moves opposite to the level.", "confidence": "stated"},
    {"id": "slope_fm", "name": "Slope FM", "source": "manual p.32", "cords": [["jack.slope_out", "jack.linfm"]], "settings": {"slope.cycle": True, "slope.rise": 2, "slope.fall": 2},
     "description": "Audio-rate SLOPE into LIN FM, Vari-Response linear; raise the LIN FM attenuator for a brighter timbre.", "confidence": "stated"},
    {"id": "random_time", "name": "Random slope time", "source": "manual p.33", "cords": [["jack.random", "jack.slope_time"], ["jack.eoc", "jack.tempo"]], "settings": {"slope.cycle": True},
     "description": "Each SLOPE cycle picks a new random speed.", "confidence": "stated"},
    {"id": "random_start", "name": "Randomised Multiply modulation", "source": "manual p.35",
     "cords": [["jack.slope_out", "jack.vmath_ch1"], ["jack.random", "jack.vmath_ch2"], ["jack.vmath_out1", "jack.multiply_cv"]],
     "settings": {"vmath.ch2_level": 0, "multiply.amount": 0, "multiply.cv_amount": 3, "slope.cycle": True}, "description": "Turn the CH2 attenuverter up to add random to the SLOPE sweep.", "confidence": "stated"},
    {"id": "key_brightness", "name": "Key tracking brightness", "source": "manual p.14", "cords": [["jack.midi_b_cv", "jack.balance_cv"]], "settings": {"midi.b_cv_src": "note"},
     "description": "Higher notes are brighter; the combo pot sets depth.", "confidence": "stated"},
    {"id": "velocity_timbre", "name": "Velocity timbre", "source": "manual p.14", "cords": [["jack.midi_b_cv", "jack.multiply_cv"]], "settings": {"midi.b_cv_src": "velocity"},
     "description": "Harder notes are brighter.", "confidence": "stated"},
    {"id": "simple_bass", "name": "Simple Bass with Brightness (Tony Rolando)", "source": "manual p.37", "settings": {"balance.amount": 4, "dynamics.amount": 7},
     "description": "Balance up to 11:00 for brighter; DYNAMICS from 2:00 to 5:00 for more aggression. Cables and other knobs drawn, not transcribed.", "confidence": "stated"},
    {"id": "fluttering_arps", "name": "Fluttering Arpeggios (Tony Rolando)", "source": "manual p.37", "settings": {"slope.cycle": True, "midi.arp_on": True},
     "description": "Start from Simple Bass; drawn cables not transcribed.", "confidence": "stated"},
    {"id": "pitched_noise", "name": "Pitched Noise Orbit (Tony Rolando)", "source": "manual p.38", "settings": {"osc.linfm": 10, "dynamics.amount": 5},
     "description": "LIN FM from full CCW (plain tone) to full CW (only noise); DYNAMICS 12:00 upwards. Drawn cables not transcribed.", "confidence": "stated"},
    {"id": "wobble_bass", "name": "Wobble Bass (Walker Farrell)", "source": "manual p.39", "settings": {"midi.b_cv_src": "note"},
     "description": "SLOPE on amplitude, CONTOUR on OVERTONE; wobble speed follows pitch. Drawn cables not transcribed.", "confidence": "stated"},
    {"id": "sync_bass", "name": "Sync Bass (Walker Farrell)", "source": "manual p.39", "settings": {"midi.b_cv_src": "lfo"},
     "description": "SLOPE as a sawtooth VCO synced to the oscillator; tap a very slow PGM_A rate. Drawn cables not transcribed.", "confidence": "stated"},
    {"id": "hard_sync", "name": "Slope synced to the oscillator", "source": "Sound On Sound review", "cords": [["jack.square", "jack.slope_trig"]], "settings": {"slope.cycle": True},
     "description": "Slope restarts on each oscillator cycle; patch SLOPE OUT to the audio path (BALANCE input or OVERTONE full CW) and play with RISE, FALL and Vari-Response.", "confidence": "stated"},
    {"id": "krell", "name": "Krell (Walker Farrell, after Todd Barton)", "source": "manual p.40", "settings": {"vmath.ch2_level": 3},
     "description": "Self-playing; clear MIDI by holding PGM_B; reverb recommended. Drawn cables not transcribed.", "confidence": "stated"},
]

# ======================================================================== MIDI, specs, honesty
D["midi"] = {
    "receives": [{"message": "note_on", "note": "MIDI A and B by channel (default all)"}, {"message": "note_off"}, {"message": "pitch_bend", "note": "scaled per channel by CC 108/109"},
                 {"message": "channel_pressure", "note": "scaled per channel by CC 110/111"}, {"message": "control_change", "cc": 1, "parameter": "mod wheel: MIDI B CV/gate source"},
                 {"message": "control_change", "cc": 5, "parameter": "midi.portamento_time"}, {"message": "control_change", "cc": 65, "parameter": "midi.portamento"},
                 {"message": "clock", "note": "when MIDI clock is enabled"}, {"message": "sysex", "note": "mentioned as a programming method; not documented"}],
    "transmits": [],
    "channel_note": "MIDI A and MIDI B each learn a channel or receive all (default).",
    "cc_map": {"5": "midi.portamento_time", "65": "midi.portamento", "102": "midi.ch_a", "103": "midi.ch_b", "104": "midi.a_cv_src", "105": "midi.b_cv_src", "106": "midi.a_gate_src",
               "107": "midi.b_gate_src", "108": "midi.bend_a", "109": "midi.bend_b", "110": "midi.after_a", "111": "midi.after_b", "112": "midi.vel_a", "113": "midi.vel_b",
               "114": "midi.midi_clock", "116": "clock.tempo_div", "117": "midi.arp_on", "118": "midi.legato", "119": "midi.arp_type"},
    "cc_map_note": "CC 102-119 act only while the unit is in the program pages; CC 5 and 65 work at any time. A Max for Live 'Page Programmer' device is offered.",
    "note": "MIDI in only, on a TRS minijack: P1 pin 1, 2, 3 connect to DIN pins 5, 4, 2 (manual p.44).",
}
D["specifications"] = {
    "voices": 1, "patch_points": 29, "oscillator": {"waveforms": ["triangle", "square"], "level_vpp": 10, "voct_tracking_octaves": 4},
    "functions_v": [0, 8], "gate_high_v": 8, "gate_threshold_v": 2, "random_v": [0, 10], "signal_range_v": [-10, 10],
    "outputs": {"line": "3.5 mm TRS stereo, 3 Vpp, LEVEL with OVL", "dynamics": "10 Vpp modular level"},
    "midi": "TRS minijack in, DIN adapter included",
    "power": {"supply": "15 V DC, tip positive, 2.1 mm plug", "current_a": 1, "source": "retail specifications"},
    "dimensions": {"inches": "5.5 x 9 x 0.75 (Make Noise)", "mm": {"depth": 140, "width": 225, "height": 19}, "width_hp": 45, "source": "Make Noise; mm and HP from Milk Audio Store"},
    "weight": {"lb": 1.7, "g": 771}, "enclosure": "steel",
    "includes": ["power adapter", "MIDI adapter", "mini to 1/4 inch adapter cable", "patch cables"], "retail_price_usd": 499, "firmware_current": "1.6.8",
}
D["omitted_from_source"] = [
    "the drawn knob positions of the default sounds and the cable routes and knob positions of the patch ideas (only text-stated settings are recorded)",
    "warranty, FCC and safety text; the conceptual primers on signals, attenuation and FM beyond what behaviours need",
]
D["not_in_source"] = [
    "the oscillator frequency range", "SLOPE and CONTOUR time ranges", "the DYNAMICS cutoff range and response", "circuit detail for OVERTONE and MULTIPLY",
    "the MIDI B CV scaling per source", "the tempo range and TEMPO IN divisor values", "SysEx format (mentioned in the manual; nothing found online)",
    "Research filled: dimensions, weight, power rating, firmware history, source/destination counts and Slope retrigger behaviour; oscillator and time ranges were not found.",
]
D["source_inconsistencies"] = [
    "The CONTOUR AD description says gate length is ignored and only the rising edge counts (p.27), but sustain is held for as long as the gate is high (pp.27-28).",
    "The Control Voltage Range page refers to 'the grey Frequency pot for VCO A' and a Voltage MATH attenuator on 1V/OCT while discussing MULTIPLY (p.21), apparently from another Make Noise manual.",
    "MIDI B CV can be assigned to aftertouch according to p.17, but the program page offers only note, velocity, mod wheel and LFO (p.14).",
    "The panel legend calls MIDI B's jacks 'Ext. CV Output' and 'Ext. Gate Output' (p.8); the text calls them MIDI B CV and Gate.",
    "Contour and Slope are described as reaching +8 V, but the figures draw a +10 V axis (pp.27-28, 33).",
    "The DYNMC output is 'more than 3 times' line level on p.29 and the triangle 'over 4 times hotter' on p.10, both about 10 Vpp.",
    "MIDI A CV in LFO mode has its rate 'set by CLocK OUT' (CC 104), while MIDI B's LFO rate is tapped on PGM_A (p.15).",
    "The contents list a '???' page (p.43) with no title.",
    "Between sources: retailers say firmware 1.6.8 'adds Portamento and other MIDI features', but portamento arrived in the November 2016 update and the 1.6.8 note lists only a MIDI B range fix (Sonicstate, Subsystem).",
    "Between sources: Make Noise gives 5.5 x 9 x 0.75 inches; a retailer gives 14 x 22.5 x 1.9 cm (5.5 x 8.9 x 0.75 in), consistent within rounding.",
]
D["modelling_gaps"] = [
    {"topic": "Waveshaper types", "detail": "OVERTONE and MULTIPLY are typed 'effects' with a kind property; a 'wavefolder' or 'waveshaper' module type (schema 0.14.0) would describe them better."},
    {"topic": "Low-pass gate", "detail": "DYNAMICS is a 'vca' with lowpass_gate: true; its filtering is described, not modelled as a cutoff."},
    {"topic": "Knob scales", "detail": "Unmarked knobs mapped 7:00 = 0 to 5:00 = 10, attenuverters -5 to +5; manual clock positions are converted on that basis."},
    {"topic": "Patch ideas", "detail": "Cable routes are drawn too small to transcribe reliably; a higher-resolution manual would allow full cords."},
]

order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "led_legend", "behaviours", "example_patches", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/make-noise-0-coast_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written", len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")
