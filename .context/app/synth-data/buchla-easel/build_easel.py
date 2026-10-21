#!/usr/bin/env python3
"""Assemble the Buchla Music Easel device file (Model 208 Stored Program Sound Source
plus Model 218 Touch Activated Voltage Source).

Modelled on the original 1973-74 instrument described in Allen Strange's operating
manual. Routing has three layers:
  - fixed and switched internal wiring (connections)
  - banana and miniphone patch cords between front-panel ports (ports, with stackable
    banana outputs; example patches record cords)
  - the plug-in program card, a resistor matrix plus coded switch fields (program_card,
    new in schema 0.10.0)

Panel controls follow the Easel's own convention: each voltage-controlled parameter has
an offset slider (the starting value) and a processing slider (attenuation of the
patched control voltage). Ports carry these as offset_param and amount_param.
"""
import json

D = {"schema_version": "0.10.0"}
D["device"] = {
    "id": "buchla-music-easel",
    "manufacturer": "Buchla and Associates (Berkeley, California)",
    "model": "Music Easel: Model 208 Stored Program Sound Source and Model 218 Touch Activated Voltage Source (original, 1973-74)",
    "category": "portable analogue performance synthesizer: complex and modulation oscillators, dual lowpass gate, control voltage sources, touch keyboard, program cards",
    "based_on": "Designed by Don Buchla; a consolidation of Buchla 200 series concepts in one case. Reissued from 2013 and again as the 208C/Easel Command.",
    "sources": [
        {"id": "manual", "title": "Programming and Metaprogramming in the Electro-Organism: An Operating Directive for the Music Easel (Allen Strange, Buchla and Associates, 1974)",
         "kind": "user_manual", "file": "buchla_music_easel_owners_manual.pdf", "pages": 34,
         "note": "Tutorial rather than reference. Covers every control with numbered callouts, around 19 patch charts drawn as panel diagrams, "
                 "and the program card in full (conductance table, field encodings, worked card realisations). No specification section."},
        {"id": "modsynth", "title": "Dave Brown, ModularSynthesis.com: Buchla 208 Stored Program Sound Source (service notes on a 1973-74 unit)",
         "kind": "measurement", "file": "https://modularsynthesis.com/buchla/208/buchla_208.htm",
         "note": "Card-by-card layout, measured oscillator ranges, scope photos, and the early timbre circuit as cross-modulation of two tracking triangle oscillators."},
        {"id": "buchlatech", "title": "Buchla Tech blog, 'The Good Thing About Standards' (2008); Sound On Sound, 'Buchla 200e: Part 1' (2005)",
         "kind": "other", "file": "http://buchlatech.blogspot.com/2008/10/good-thing-about-standards-so-many-to.html",
         "note": "Voltage standards of early 1970s 200 series modules: 0-15 V CVs, 15 V pulses, +4 dBu audio, separate connector types for each class."},
        {"id": "buchla_guides", "title": "Buchla USA user guides: 218e/208 card doubler, 200e, 218e v3; Easel Command product page",
         "kind": "other", "file": "https://buchla.com/guides/218e_FC_208CDblr_Guide_v2.0.pdf",
         "note": "The 1.2 V/octave Buchla pitch standard; later 0-10 V CVs and 10 V/5 V pulses; 208C changes from the original."},
        {"id": "synthdb", "title": "Synth DB, Buchla Music Easel", "kind": "other", "file": "http://synth-db.com/synths/Buchla/Music%20Easel/Music%20Easel.php",
         "note": "Program output 1 V rms, 2 W monitor output, battery pack of about three hours, original card supply, key count."},
        {"id": "reviews", "title": "Gearspace review of the 2013 reissue; Perfect Circuit and Buchla product pages", "kind": "other",
         "file": "https://gearspace.com/board/reviews/1087060-buchla-music-easel.html",
         "note": "Vactrol lowpass gates, spring reverb, wavefolding timbre circuit; reissue details used only to separate later features."},
    ],
}
D["architecture"] = {
    "synthesis": "hybrid",
    "synthesis_note": "West Coast: a complex oscillator with harmonic addition (timbre folding and waveshape mixing), FM and AM from a modulation oscillator, and vactrol lowpass gates in place of a separate filter and VCA. No subtractive filter as such.",
    "signal_path": "analogue", "voices": 1,
    "polyphony_mode": "monophonic; the modulation oscillator can sound as a second, independent voice through Gate 2",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "Hardwired program cards: resistors soldered on a plug-in board replicate switch positions, slider levels and control routings.",
    "semi_modular": True,
    "routing": "internal wiring set by switches, banana-cord patch field, and the program card",
    "panel_counts": {"sliders": 22, "knobs": 12, "switches": 25, "touch_plates": 32, "banana_jacks_208": 31, "banana_jacks_218": 11},
    "summary": (
        "Two units in one case. The 208 holds the sound sources and processors: a complex oscillator (sine mixed with spike, square or "
        "triangle, plus a timbre control that adds harmonics), a modulation oscillator that frequency or amplitude modulates it or "
        "ring modulates an external signal, a dual lowpass gate (each half a vactrol VCA, lowpass filter or both), a preamp with "
        "envelope detector, and an output section with reverb. Its control sources are a five-stage sequential voltage source, "
        "an attack-duration-decay envelope generator, a pulser (triggered ramp and trigger source), a four-output random voltage source "
        "and an inverter. Every voltage-controlled parameter has an offset slider and a processing slider for the patched voltage. "
        "The 218 is a capacitive touch keyboard giving key voltage, pressure, pulse, portamento and three preset voltages. "
        "Control voltages and pulses travel on stackable banana cords; audio stays internal apart from the preamp input and outputs. "
        "A plug-in program card, built from resistors, can replace or add to the front panel."
    ),
}

M, P, J, C = [], [], [], []
FP = {"param": "card.selector", "not_equals": "prog_board"}   # front-panel switches are live


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, function, control="fader", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if "manual_ref" in kw:
        p["manual_ref"] = kw.pop("manual_ref")
    for k in ("panel_scale", "physical", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = function
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, direction, signal, node, function, connector="4 mm banana", **kw):
    j = {"id": id, "label": label, "location": "patch_in" if direction == "in" else "patch_out",
         "direction": direction, "signal": signal, "connector": connector, "node": node, "function": function}
    if kw.pop("power", False):
        j["location"] = "rear"
    for k in ("manual_ref", "combine", "amount_param", "offset_param", "stackable", "colour", "electrical", "confidence", "note"):
        if k in kw:
            j[k] = kw.pop(k)
    if connector == "4 mm banana" and direction == "out":
        j.setdefault("stackable", True)
    assert not kw, kw
    J.append(j)


def con(id, frm, to, signal, kind="fixed", when=None, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    if when is not None:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def sw(param, value, front=True):
    leaf = {"param": param, "equals": value}
    return {"all": [leaf, FP]} if front else leaf


S10 = {"min": 0, "max": 10}
TIME_CAL = {"10": 0.002, "8": 0.02, "6": 0.2, "4": 1, "2": 3, "0": 10}
MOSC_CAL = {"0": 0.16, "2": 0.5, "4": 1.6, "6": 5, "8": 16, "10": 50}
PITCH_CAL = {"0": 55, "2": 110, "4": 220, "6": 440, "8": 880, "10": 1760}

# --------------------------------------------------------------------------
# modules
# --------------------------------------------------------------------------
mod("kbd", "manual_controller", "Touch Activated Voltage Source (Model 218)", "MODEL 218",
    "Capacitive touch keyboard with no moving parts. 29 voltage keys give equal steps, held after release until another key is "
    "touched; a PRESSURE voltage follows how much finger surface is on any key; a PULSE marks each touch. A PORTAMENTO output "
    "glides linearly between key voltages at a rate set by SLOPE and a control input. Three preset plates, each with its own "
    "level knob, give a separate PRESET output, and the SHIFT selector can use them to transpose the key voltage. Every output "
    "appears on two paralleled banana jacks. Nothing reaches the 208 except by patch cord.",
    ["kbd.portamento_cv"], ["kbd.key_voltage", "kbd.pressure", "kbd.pulse", "kbd.portamento", "kbd.preset"],
    {"voltage_keys": 29, "preset_plates": 3, "key_voltage_steps": 29, "outputs_per_function": 2})
mod("kbd_in", "external_input", "Signals from Keyboard (208)", "SIGNALS FROM KEYBOARD",
    "Three banana inputs on the 208 (pulse, pressure, voltage) that bring the 218 into the sound source. VOLTAGE reaches the "
    "oscillators through their KEYBOARD switches, PULSE reaches every trigger-source selector set to 'keyboard', and PRESSURE "
    "is redistributed to the violet jacks on the patch field.",
    ["kbd_in.pulse_in", "kbd_in.pressure_in", "kbd_in.voltage_in"], ["kbd_in.pulse", "kbd_in.pressure", "kbd_in.voltage"])
mod("seq", "sequencer", "Sequential Voltage Source", "SEQUENTIAL VOLTAGE SOURCE",
    "Five stages, each with a preset output level, advanced one stage per trigger from the keyboard or the pulser (or not at all, "
    "holding the last stage). STAGES limits the cycle to three, four or five; the program card adds two. As each stage is reached "
    "it emits a pulse unless its PULSE SEQUENCE switch is down; those pulses can fire the pulser or envelope generator. "
    "Voltage on the blue jacks.",
    ["seq.trigger_in"], ["seq.out", "seq.pulse"], {"stages": 5, "card_stages": [2, 3, 4, 5]})
mod("env", "envelope", "Envelope Generator", "ENVELOPE GENERATOR",
    "Attack, duration and decay, each 2 ms to 10 s. In 'transient' mode the duration slider sets the hold; in 'sustained' mode "
    "the envelope holds for as long as the trigger lasts, then decays. Triggered by the keyboard, pulser or sequencer. Output "
    "on three orange jacks.",
    ["env.trigger_in"], ["env.out"], {"stages": ["attack", "duration", "decay"], "time_s": [0.002, 10], "slider_calibration_s": TIME_CAL})
mod("pulser", "envelope", "Pulser", "PULSER",
    "On each trigger generates a linearly falling ramp, available on the yellow jacks, and when the ramp reaches zero emits a "
    "trigger to every trigger-source selector set to 'pulser'. The ramp's length is the PERIOD, 2 ms to 10 s, voltage controlled "
    "(more voltage, shorter period). In 'self' mode its own end trigger restarts it, so it runs continuously once started.",
    ["pulser.trigger_in", "pulser.period_cv"], ["pulser.ramp", "pulser.pulse"], {"period_s": [0.002, 10], "slider_calibration_s": TIME_CAL})
mod("rvs", "sample_hold", "Random Voltage Source", "RANDOM VOLTAGE",
    "On each trigger from the keyboard or pulser (or the sequencer, from the card only), four new uncorrelated random voltages "
    "appear on the four white jacks and hold until the next trigger.",
    ["rvs.trigger_in"], ["rvs.out1", "rvs.out2", "rvs.out3", "rvs.out4"], {"outputs": 4})
mod("mosc", "oscillator", "Modulation Oscillator", "MODULATION OSCILLATOR",
    "Sawtooth, square or triangle, 0.16 to 50 Hz on the panel and much higher under voltage control. Its MODULATION switch "
    "decides what it does to the sound: FM of the complex oscillator, AM of the complex oscillator, or balanced (ring) "
    "modulation of the preamp signal, all at a depth set by INDEX (0 to 1.0). It can also sound in its own right through Gate 2, "
    "and a copy of its waveform leaves on the 'mod c.v. out' jack as a control voltage.",
    ["mosc.key_cv", "mosc.index_cv", "mosc.freq_cv"], ["mosc.out", "mosc.cv_out"],
    {"frequency_hz_panel": [0.16, 50], "frequency_hz_measured": [0.13, 70], "slider_calibration_hz": MOSC_CAL,
     "index_range": [0, 1.0], "waveshapes": ["sawtooth", "square", "triangle"]})
mod("balmod", "ring_modulator", "Balanced Modulator", "MODULATION OSCILLATOR (internal)",
    "Internal multiplier, on its own card in the original, that the modulation oscillator uses for AM of the complex oscillator "
    "and for balanced modulation of the preamp signal. Index 1.0 gives full ring modulation: the carrier is suppressed and only "
    "sidebands remain.",
    ["balmod.carrier_in", "balmod.mod_in"], ["balmod.out"], {"source": "card 5 in Dave Brown's service notes"})
mod("cosc", "oscillator", "Complex Oscillator", "COMPLEX OSCILLATOR",
    "The main sound source. PITCH covers 55 to 1760 Hz (five octaves, calibrated in octaves and half octaves) with a fine tuning "
    "knob of half an octave. A WAVESHAPE knob mixes a sine with the waveform chosen on the WAVESHAPE selector: spike, square or "
    "triangle. TIMBRE adds and accentuates harmonics (the opposite of filtering) and acts only on the sine and triangle, so it "
    "does nothing with the knob fully at spike or square. A KEYBOARD switch connects the key voltage directly; the SIGN switch "
    "sets whether a patched pitch voltage raises or lowers the pitch. Always feeds Gate 1.",
    ["cosc.key_cv", "cosc.pitch_cv", "cosc.timbre_cv", "cosc.fm_in"], ["cosc.out"],
    {"frequency_hz_panel": [55, 1760], "frequency_hz_measured": [38, 3500], "slider_calibration_hz": PITCH_CAL,
     "fine_tune_octaves": 0.5, "waveshapes": ["sine", "spike", "square", "triangle"],
     "timbre_circuit": "early 208: a second triangle oscillator tracks the first and is cross-modulated by it as timbre rises (Dave Brown)"})
mod("inverter", "inverter", "Inverter", "INVERTER",
    "Turns a control voltage upside down on the 0 to 10 scale: 10 becomes 0, 9 becomes 1, 6 becomes 4. Rising envelopes become "
    "falling ones.", ["inverter.in"], ["inverter.out"])
mod("preamp", "preamp", "Preamp", "PREAMP / ENVELOPE DETECTOR",
    "External signal in on a miniphone jack, with a three-position gain switch: lo for line sources (tape, tuners, other "
    "Easels), mid for instrument pickups, hi for contact and high-impedance microphones. Reaches Gate 2 when SIGNAL ROUTING "
    "is up, the balanced modulator in 'balanced external' mode, and always the envelope detector.",
    ["preamp.in"], ["preamp.out"], {"gain_positions": ["lo", "mid", "hi"]})
mod("envdet", "envelope_follower", "Envelope Detector", "PREAMP / ENVELOPE DETECTOR",
    "Produces a control voltage proportional to the amplitude of the preamp signal, on the 'c.v. out' jack.",
    ["envdet.in"], ["envdet.cv"])
for n, other in ((1, "the complex oscillator (or, in AM, the balanced modulator)"), (2, "the source chosen by SIGNAL ROUTING")):
    mod(f"gate{n}", "vca", f"Lopass Gate {n}", "DUAL LOPASS GATE",
        f"Vactrol lowpass gate fed by {other}. MODE SELECT makes it a voltage-controlled amplifier (no gain at 0, full at 10), a "
        "12 dB/octave lowpass filter whose cut-off follows the LEVEL, or both at once ('combination'), where lowering the level "
        "dulls as it quietens. The lowpass element responds more slowly than the amplifier, which gives struck, resonant decays. "
        f"Output to channel {'A' if n == 1 else 'B'} of the output section.",
        [f"gate{n}.in", f"gate{n}.level_cv"], [f"gate{n}.out"],
        {"modes": ["voltage controlled amp", "lowpass filter", "combination"], "lowpass_slope_db_per_octave": 12, "element": "vactrol (lamp and photocell)"})
mod("reverb", "reverb", "Reverberation", "OUTPUT SECTION", "Spring reverb on the mixed signal, returned at REVERBERATION LEVEL.",
    ["reverb.in"], ["reverb.out"], {"type": "spring", "type_source": "reissue documentation; the 1974 manual does not say"})
mod("out", "output", "Output Section", "OUTPUT SECTION",
    "Mixes Gate 1 (channel A) and Gate 2 (channel B), adds reverb, and drives the program outputs at OUTPUT LEVEL (nominally "
    "1 V) and the headset output at MONITOR LEVEL, independently. Not controlled by the program card.",
    ["out.in_a", "out.in_b", "out.reverb_return"], ["out.reverb_send", "out.signal", "out.phones"],
    {"program_output_v_rms": 1, "monitor_output_w": 2})
mod("card", "modulation_bus", "Program Card interface", "PROGRAM BOARD and CONTROL",
    "The slot, the CONTROL selector and the card buses. The OFFSET line is a fixed reference that card resistors turn into "
    "offset levels. Two buses are reached through front-panel jacks: the card's INV column leaves on the inverter's 'from prog' "
    "jack, and the inverter's and envelope detector's 'to prog' jacks feed the card's INV and ENV DET rows. Jumpers between "
    "these jacks put the inverter, envelope detector, modulation oscillator or a preset voltage onto the card.",
    ["card.inv_column", "card.inv_return", "card.envdet_return"], ["card.offset", "card.inv_send", "card.inv_row", "card.envdet_row"])
D["modules"] = M

# --------------------------------------------------------------------------
# parameters
# --------------------------------------------------------------------------
TOG = "toggle_switch"
par("card.selector", "card", "CONTROL", "enum", "Chooses whether the instrument is defined by the program card, the front panel, or both added together.",
    control=TOG, manual_ref=1, values=[{"value": "prog_board", "label": "prog board"}, {"value": "front_panel", "label": "front panel"}, {"value": "both", "label": "both"}])

par("seq.trigger_source", "seq", "TRIGGER SOURCE", "enum", "What advances the sequencer. 'off' holds the current stage.", control=TOG, manual_ref=56,
    values=[{"value": "keyboard"}, {"value": "pulser"}, {"value": "off"}])
par("seq.stages", "seq", "STAGES", "enum", "Length of the cycle.", control=TOG, manual_ref=55, values=[{"value": 3}, {"value": 4}, {"value": 5}])
for i in range(1, 6):
    par(f"seq.pulse_{i}", "seq", f"PULSE SEQUENCE {i}", "boolean", f"Up: stage {i} sends a pulse when reached. Down: it stays silent, used to place rests.",
        control=TOG, manual_ref=57, values=[{"value": True, "label": "up"}, {"value": False, "label": "down"}])
for i in range(1, 6):
    par(f"seq.level_{i}", "seq", f"OUTPUT VOLTAGE LEVEL {i}", "continuous", f"Voltage of stage {i}.", manual_ref=54, panel_scale=S10)

par("env.trigger_source", "env", "TRIGGER SOURCE", "enum", "What fires the envelope.", control=TOG, manual_ref=44,
    values=[{"value": "keyboard"}, {"value": "pulser"}, {"value": "sequencer"}])
par("env.mode", "env", "MODE SELECT", "enum", "Sustained: holds while the trigger lasts. Transient: holds for the DURATION setting regardless. Off: does not respond.",
    control=TOG, manual_ref=45, values=[{"value": "sustained"}, {"value": "transient"}, {"value": "off"}])
for k, lbl, ref in (("attack", "attack", 41), ("duration", "duration", 42), ("decay", "decay", 43)):
    par(f"env.{k}", "env", lbl, "continuous", f"{lbl.capitalize()} time. Marked in seconds, reversed: the top of the slider is fastest.",
        manual_ref=ref, panel_scale=S10, physical={"min": 0.002, "max": 10, "unit": "s", "taper": "exponential, reversed", "calibration": TIME_CAL})

par("pulser.trigger", "pulser", "TRIGGER", "enum", "What starts the ramp. 'self' restarts it from its own end trigger.", control=TOG, manual_ref=50,
    values=[{"value": "keyboard"}, {"value": "self"}, {"value": "sequencer"}])
par("pulser.mode", "pulser", "MODE", "enum", "Triggered: responds to the chosen trigger. Off: ignores triggers. One: spring-loaded, fires once by hand; needed to start 'self' mode.",
    control=TOG, manual_ref=49, values=[{"value": "triggered"}, {"value": "off"}, {"value": "one", "meaning": "momentary"}])
par("pulser.period", "pulser", "PERIOD (offset)", "continuous", "Initial, and longest, period of the ramp.", manual_ref=51, panel_scale=S10,
    physical={"min": 0.002, "max": 10, "unit": "s", "taper": "exponential, reversed", "calibration": TIME_CAL})
par("pulser.period_processing", "pulser", "PERIOD (processing)", "continuous", "How far a patched voltage can shorten the period.", manual_ref=52, panel_scale=S10)

par("mosc.keyboard", "mosc", "KEYBOARD", "enum", "Connects the key voltage directly to the modulation oscillator's frequency.", control=TOG,
    values=[{"value": "in"}, {"value": "out", "label": "out (trim)"}])
par("mosc.waveshape", "mosc", "WAVESHAPE", "enum", "Waveform of the modulation oscillator and of its 'mod c.v. out'.", control=TOG, manual_ref=21,
    values=[{"value": "sawtooth", "label": "upper"}, {"value": "square", "label": "middle"}, {"value": "triangle", "label": "lower"}])
par("mosc.mode", "mosc", "MODULATION", "enum", "What the modulation oscillator does to the sound.", control=TOG,
    values=[{"value": "balanced_external", "meaning": "ring modulates the preamp signal"}, {"value": "am", "label": "a.m. oscillator", "meaning": "amplitude modulates the complex oscillator"},
            {"value": "fm", "label": "f.m. oscillator", "meaning": "frequency modulates the complex oscillator"}])
par("mosc.fine_tune", "mosc", "fine tuning", "continuous", "Fine frequency adjustment. Not affected by the program card.", control="knob")
par("mosc.index", "mosc", "INDEX (offset)", "continuous", "Modulation depth, 0 to 1.0 (panel level divided by 10). In AM, above about .5 the fundamental is suppressed; 1.0 is full ring modulation.",
    manual_ref=25, panel_scale=S10, physical={"min": 0, "max": 1.0, "unit": "index", "taper": "linear"})
par("mosc.index_processing", "mosc", "INDEX (processing)", "continuous", "Attenuates a voltage patched to the INDEX input.", manual_ref=30, panel_scale=S10)
par("mosc.frequency", "mosc", "FREQUENCY (offset)", "continuous", "Frequency of the modulation oscillator.", manual_ref=22, panel_scale=S10,
    physical={"min": 0.16, "max": 50, "unit": "Hz", "taper": "exponential", "calibration": MOSC_CAL})
par("mosc.frequency_processing", "mosc", "FREQUENCY (processing)", "continuous", "Attenuates a voltage patched to the FREQUENCY input.", panel_scale=S10)

par("cosc.keyboard", "cosc", "KEYBOARD", "enum", "Connects the key voltage directly to the complex oscillator's pitch: equal-tempered half steps over 2 1/3 octaves.",
    control=TOG, manual_ref=14, values=[{"value": "in"}, {"value": "out", "label": "out (trim)"}])
par("cosc.sign", "cosc", "sign", "enum", "Polarity of a patched pitch voltage: '+' raises the pitch above the offset, '-' lowers it below.", control=TOG, manual_ref=46,
    values=[{"value": "+"}, {"value": "-"}])
par("cosc.fine_tune", "cosc", "fine tuning", "continuous", "Half an octave of fine tuning. Not affected by the program card.", control="knob", manual_ref=16)
par("cosc.waveshape", "cosc", "waveshape (knob)", "continuous", "Mix between a sine (fully anticlockwise) and the waveform on the selector (fully clockwise).", control="knob",
    manual_ref=19, panel_scale=S10)
par("cosc.waveshape_select", "cosc", "waveshape (selector)", "enum", "Waveform mixed with the sine.", control=TOG, manual_ref=18,
    values=[{"value": "spike", "label": "upper"}, {"value": "square", "label": "middle"}, {"value": "triangle", "label": "lower"}])
par("cosc.pitch", "cosc", "PITCH (offset)", "continuous", "Pitch, 55 to 1760 Hz, two divisions per octave.", manual_ref=15, panel_scale=S10,
    physical={"min": 55, "max": 1760, "unit": "Hz", "taper": "exponential, 2 divisions per octave", "calibration": PITCH_CAL})
par("cosc.pitch_processing", "cosc", "PITCH (processing)", "continuous", "Attenuates a voltage patched to the PITCH input. About 1.0 divides a whole step into the 29 key voltages, about 3 an octave, about 7 the full 2 1/3 octaves.",
    panel_scale=S10)
par("cosc.timbre", "cosc", "TIMBRE (offset)", "continuous", "Minimum amount of added harmonics. Acts on the sine and triangle only.", manual_ref=17, panel_scale=S10)
par("cosc.timbre_processing", "cosc", "TIMBRE (processing)", "continuous", "Attenuates a voltage patched to the TIMBRE input.", manual_ref=36, panel_scale=S10)

par("preamp.gain", "preamp", "gain", "enum", "Preamp gain for the external source.", control=TOG, manual_ref=24,
    values=[{"value": "lo", "meaning": "tape, tuners, other Easels"}, {"value": "mid", "meaning": "instrument pickups"}, {"value": "hi", "meaning": "contact and high-impedance microphones"}])
par("gate2.routing", "gate2", "SIGNAL ROUTING", "enum", "What Gate 2 receives.", control=TOG, manual_ref=12,
    values=[{"value": "preamp", "label": "upper"}, {"value": "mod_osc", "label": "centre"}, {"value": "series", "label": "lower", "meaning": "Gate 1's output, so the gates are in series"}])
for n, ref_off in ((1, 13), (2, 20)):
    par(f"gate{n}.mode", f"gate{n}", "MODE SELECT", "enum", f"Behaviour of Gate {n}.", control=TOG, manual_ref=4,
        values=[{"value": "lowpass"}, {"value": "combination"}, {"value": "vca", "label": "voltage controlled amp"}])
    par(f"gate{n}.level", f"gate{n}", "LEVEL (offset)", "continuous", f"Initial gain, cut-off, or both, of Gate {n}.", manual_ref=ref_off, panel_scale=S10)
    par(f"gate{n}.level_processing", f"gate{n}", "LEVEL (processing)", "continuous", f"Attenuates a voltage patched to Gate {n}'s LEVEL input.",
        manual_ref=35 if n == 1 else None, panel_scale=S10)
par("rvs.trigger_source", "rvs", "TRIGGER SOURCE", "enum", "What calls up new random voltages. 'off' holds the last ones.", control=TOG, manual_ref=58,
    values=[{"value": "keyboard"}, {"value": "pulser"}, {"value": "off"}])

par("out.mix_a", "out", "channel A", "continuous", "Gate 1's level in the mix.", control="knob", manual_ref=6, panel_scale=S10)
par("out.mix_b", "out", "channel B", "continuous", "Gate 2's level in the mix.", control="knob", manual_ref=6, panel_scale=S10)
par("out.reverb_level", "out", "REVERBERATION LEVEL", "continuous", "Amount of spring reverb added to the mix.", control="knob", manual_ref=7, panel_scale=S10)
par("out.monitor_level", "out", "MONITOR LEVEL", "continuous", "Headset level, independent of OUTPUT LEVEL. Can drive a small speaker.", control="knob", manual_ref=8, panel_scale=S10)
par("out.output_level", "out", "OUTPUT LEVEL", "continuous", "Level at the two signal outputs, nominally 1 V.", control="knob", manual_ref=10, panel_scale=S10)
par("out.power", "out", "power", "enum", "Power switch beside the keyboard: up for the mains cord, down for the 12 V power pack.", control=TOG,
    values=[{"value": "mains", "label": "up"}, {"value": "off"}, {"value": "battery", "label": "down"}], confidence="inferred",
    note="The manual gives up and down; a centre off position is assumed.")

par("kbd.portamento", "kbd", "PORTAMENTO SLOPE", "continuous", "Maximum glide time between successive key voltages; a voltage at the portamento input speeds it up.",
    control="knob", manual_ref=33, panel_scale=S10)
par("kbd.shift", "kbd", "SHIFT", "enum", "How the preset plates act on the key voltage.", control=TOG, manual_ref=31,
    values=[{"value": "octave", "meaning": "the three plates select the lowest, middle (+12 keys) or top (+24 keys) register"},
            {"value": "none", "meaning": "presets have no effect on the key voltage"},
            {"value": "preset", "meaning": "the selected preset level is added to the key voltage: any transposition from a microtone to a major ninth"}])
for i in range(1, 4):
    par(f"kbd.preset_{i}", "kbd", f"PRESET VOLTAGE SOURCE {i}", "continuous", f"Level produced when preset plate {i} is touched; full control voltage range.", control="knob", panel_scale=S10)
P.append({"id": "kbd.key", "module": "kbd", "label": "voltage keys", "kind": "integer", "range": {"min": 1, "max": 29},
          "access": [{"type": "gesture", "gesture": "touch one of the 29 key plates", "when": "any_time"}],
          "function": "Sets the key voltage to that key's step and sends a pulse; the voltage is held after release."})
P.append({"id": "kbd.pressure_gesture", "module": "kbd", "label": "key pressure", "kind": "continuous", "panel_scale": S10,
          "access": [{"type": "gesture", "gesture": "vary finger pressure, in practice the area of finger on the plate, by rolling the finger", "when": "any_time"}],
          "function": "Sets the PRESSURE voltage. Falls back as the finger lifts."})
P.append({"id": "kbd.preset_select", "module": "kbd", "label": "preset plates", "kind": "enum", "values": [{"value": 1}, {"value": 2}, {"value": 3}],
          "access": [{"type": "gesture", "gesture": "touch one of the three preset plates", "when": "any_time"}],
          "function": "Selects which preset level appears at the PRESET outputs and, per SHIFT, how the key voltage is transposed."})
D["parameters"] = P

# --------------------------------------------------------------------------
# ports
# --------------------------------------------------------------------------
MINI = "3.5 mm miniphone"
jack("jack.signal_out_1", "signal output", "out", "audio", "out.signal", "Program output, nominally 1 V.", connector=MINI, manual_ref=11, confidence="inferred",
     note="Connector type not stated in the manual; miniphone as on the preamp input.")
jack("jack.signal_out_2", "signal output", "out", "audio", "out.signal", "Second program output, same signal.", connector=MINI, manual_ref=11, confidence="inferred")
jack("jack.phones", "phones", "out", "audio", "out.phones", "Headset output at MONITOR LEVEL; can drive a low-level speaker (2 W).", connector="unknown", manual_ref=9)
jack("jack.preamp_in", "signal in", "in", "audio", "preamp.in", "External signal into the preamp.", connector=MINI, manual_ref=23)
jack("jack.envdet_out", "c.v. out", "out", "cv", "envdet.cv", "Envelope detector output.", manual_ref=59)
jack("jack.envdet_to_prog", "to prog", "in", "cv", "card.envdet_return", "Feeds the program card's ENV DET row. Jumper from 'c.v. out' to use the detector on the card, or patch any other voltage here.",
     colour="black", combine="replace")
jack("jack.inverter_in", "in", "in", "cv", "inverter.in", "Inverter input.", colour="black", manual_ref=47)
jack("jack.inverter_out", "out", "out", "cv", "inverter.out", "Inverted voltage.", manual_ref=48)
jack("jack.from_prog", "from prog", "out", "cv", "card.inv_send", "The program card's INV column, so card voltages can be patched into the inverter.")
jack("jack.inv_to_prog", "to prog", "in", "cv", "card.inv_return", "Feeds the program card's INV row. Jumper from the inverter output, or patch any voltage here to put it on the card.",
     colour="black", combine="replace")
jack("jack.mod_cv_out", "mod c.v. out", "out", "cv", "mosc.cv_out", "The modulation oscillator's waveform as a control voltage.", manual_ref=53)
for nm, node, lbl, ref in (("pulse", "kbd_in.pulse_in", "pulse", 40), ("pressure", "kbd_in.pressure_in", "pressure", 38), ("voltage", "kbd_in.voltage_in", "voltage", 27)):
    jack(f"jack.kbd_{nm}_in", lbl, "in", "gate" if nm == "pulse" else "cv", node, f"Signals from keyboard: {lbl} from the 218.", colour="black", manual_ref=ref)
for nm, node, amt, off, ref in (("period", "pulser.period_cv", "pulser.period_processing", "pulser.period", None),
                                ("index", "mosc.index_cv", "mosc.index_processing", "mosc.index", None),
                                ("frequency", "mosc.freq_cv", "mosc.frequency_processing", "mosc.frequency", 29),
                                ("pitch", "cosc.pitch_cv", "cosc.pitch_processing", "cosc.pitch", 28),
                                ("timbre", "cosc.timbre_cv", "cosc.timbre_processing", "cosc.timbre", 36),
                                ("level1", "gate1.level_cv", "gate1.level_processing", "gate1.level", None),
                                ("level2", "gate2.level_cv", "gate2.level_processing", "gate2.level", None)):
    extra = {"note": "The SIGN switch sets this input's polarity."} if nm == "pitch" else {}
    jack(f"jack.{nm}_in", f"{nm.upper()} input", "in", "cv", node, f"Control voltage input below the {nm} sliders; scaled by the processing slider and added to the offset.",
         colour="black", combine="sum", amount_param=amt, offset_param=off, manual_ref=ref, **extra)
for i in range(1, 5):
    jack(f"jack.random_{i}", f"random voltage {i}", "out", "cv", f"rvs.out{i}", f"Random voltage {i}.", colour="white")
for i in range(1, 4):
    jack(f"jack.envelope_{i}", f"envelope {i}", "out", "cv", "env.out", "Envelope generator output.", colour="orange")
for i in range(1, 4):
    jack(f"jack.pulser_{i}", f"pulser ramp {i}", "out", "cv", "pulser.ramp", "Pulser ramp output.", colour="yellow", confidence="inferred",
         note="The manual says yellow jacks without a count; three is inferred from the 16 small jacks on the patch field.")
for i in range(1, 4):
    jack(f"jack.sequencer_{i}", f"sequencer {i}", "out", "cv", "seq.out", "Sequential voltage source output.", colour="blue", confidence="inferred",
         note="The manual says blue jacks without a count; three is inferred.")
for i in range(1, 4):
    jack(f"jack.pressure_{i}", f"pressure {i}", "out", "cv", "kbd_in.pressure", "Keyboard pressure, redistributed from the 'pressure' input.", colour="violet", confidence="inferred",
         note="The manual says violet jacks without a count; three is inferred.")
for nm, node, lbl, sig, ref in (("pulse", "kbd.pulse", "PULSE output", "gate", 39), ("pressure", "kbd.pressure", "PRESSURE output", "cv", 37),
                                ("portamento", "kbd.portamento", "PORTAMENTO output", "cv", 32), ("key_voltage", "kbd.key_voltage", "KEY VOLTAGE output", "cv", 26),
                                ("preset", "kbd.preset", "PRESET VOLTAGE SOURCE output", "cv", None)):
    for i in (1, 2):
        jack(f"kbd.{nm}_out_{i}", lbl, "out", sig, node, f"218 {lbl.lower()}, one of a paralleled pair.", manual_ref=ref)
jack("kbd.portamento_in", "PORTAMENTO in", "in", "cv", "kbd.portamento_cv", "Control voltage that shortens the portamento time set by SLOPE.", colour="black", combine="sum", manual_ref=34)
jack("jack.mains", "line cord", "in", "power", None, "115 V mains.", connector="mains cord", power=True)
jack("jack.power_pack", "12 V power pack", "in", "power", None, "Optional rechargeable 12 V pack, about three hours; observe polarity.", connector="unknown", power=True)
D["ports"] = J

# --------------------------------------------------------------------------
# internal wiring
# --------------------------------------------------------------------------
NOT_AM = {"all": [{"param": "mosc.mode", "not_equals": "am"}]}
con("c01", "cosc.out", "gate1.in", "audio", "switched", NOT_AM, note="Direct unless the modulation oscillator is in AM mode.")
con("c02", "balmod.out", "gate1.in", "audio", "switched", {"param": "mosc.mode", "equals": "am"}, confidence="inferred")
con("c03", "cosc.out", "balmod.carrier_in", "audio", "switched", {"param": "mosc.mode", "equals": "am"}, confidence="inferred")
con("c04", "preamp.out", "balmod.carrier_in", "audio", "switched", {"param": "mosc.mode", "equals": "balanced_external"})
con("c05", "mosc.out", "balmod.mod_in", "audio", "switched", {"any": [{"param": "mosc.mode", "equals": "am"}, {"param": "mosc.mode", "equals": "balanced_external"}]},
    amount="mosc.index")
con("c06", "mosc.out", "cosc.fm_in", "audio", "switched", {"param": "mosc.mode", "equals": "fm"}, amount="mosc.index")
con("c07", "preamp.out", "gate2.in", "audio", "switched", {"all": [sw("gate2.routing", "preamp", False), {"param": "mosc.mode", "not_equals": "balanced_external"}]})
con("c08", "balmod.out", "gate2.in", "audio", "switched", {"all": [sw("gate2.routing", "preamp", False), {"param": "mosc.mode", "equals": "balanced_external"}]},
    confidence="inferred", note="Where the ring-modulated preamp signal goes is not stated; taken as replacing the preamp feed to Gate 2.")
con("c09", "mosc.out", "gate2.in", "audio", "switched", sw("gate2.routing", "mod_osc", False))
con("c10", "gate1.out", "gate2.in", "audio", "switched", sw("gate2.routing", "series", False), note="Gate 1 still reaches channel A as well.")
con("c11", "gate1.out", "out.in_a", "audio", amount="out.mix_a")
con("c12", "gate2.out", "out.in_b", "audio", amount="out.mix_b")
con("c13", "out.reverb_send", "reverb.in", "audio")
con("c14", "reverb.out", "out.reverb_return", "audio", amount="out.reverb_level")
con("c15", "preamp.out", "envdet.in", "audio")
con("c16", "kbd_in.voltage", "cosc.key_cv", "cv", "switched", sw("cosc.keyboard", "in"))
con("c17", "kbd_in.voltage", "mosc.key_cv", "cv", "switched", sw("mosc.keyboard", "in"))
con("c18", "kbd_in.pulse", "seq.trigger_in", "gate", "switched", sw("seq.trigger_source", "keyboard"))
con("c19", "pulser.pulse", "seq.trigger_in", "gate", "switched", sw("seq.trigger_source", "pulser"))
con("c20", "kbd_in.pulse", "env.trigger_in", "gate", "switched", sw("env.trigger_source", "keyboard"))
con("c21", "pulser.pulse", "env.trigger_in", "gate", "switched", sw("env.trigger_source", "pulser"))
con("c22", "seq.pulse", "env.trigger_in", "gate", "switched", sw("env.trigger_source", "sequencer"))
con("c23", "kbd_in.pulse", "pulser.trigger_in", "gate", "switched", sw("pulser.trigger", "keyboard"))
con("c24", "seq.pulse", "pulser.trigger_in", "gate", "switched", sw("pulser.trigger", "sequencer"))
con("c25", "kbd_in.pulse", "rvs.trigger_in", "gate", "switched", sw("rvs.trigger_source", "keyboard"))
con("c26", "pulser.pulse", "rvs.trigger_in", "gate", "switched", sw("rvs.trigger_source", "pulser"))
D["connections"] = C

# --------------------------------------------------------------------------
# program card
# --------------------------------------------------------------------------
TRIG = [{"conductance": 3, "value": True, "meaning": "connected"}, {"conductance": 0, "value": False, "meaning": "open"}]
F = []


def fld(id, label, section, parameter=None, encoding=None, **kw):
    f = {"id": id, "label": label, "section": section}
    if parameter:
        f["parameter"] = parameter
    if encoding:
        f["encoding"] = encoding
    f.update(kw)
    F.append(f)


for i in range(1, 6):
    fld(f"seq_level_{i}", f"voltage level {i}", "SEQUENCER", f"seq.level_{i}", note="Conductance equals the 0 to 10 level; 0 is no resistor.")
fld("seq_stages", "n.", "SEQUENCER", "seq.stages", [{"conductance": 10, "value": 2}, {"conductance": 6, "value": 3}, {"conductance": 3, "value": 4}, {"conductance": 0, "value": 5}],
    note="Two stages are card-only. A voltage fed through a resistor sets the stage count dynamically: more voltage, fewer stages.")
for i in range(1, 6):
    fld(f"seq_pulse_{i}", f"pulse sequence {i}", "SEQUENCER", f"seq.pulse_{i}", TRIG)
for sec, prefix, param in (("SEQUENCER", "seq", "seq.trigger_source"), ("RAND", "rvs", "rvs.trigger_source"), ("PULSR", "pulser", "pulser.trigger")):
    for code, src in (("k", "keyboard"), ("p", "pulser")):
        fld(f"{prefix}_trig_{code}", f"{code.upper()} trig", sec, param, TRIG, note=f"Trigger from the {src}; K and P may both be fitted, summing the sources.")
    if prefix != "seq":
        fld(f"{prefix}_trig_s", "S trig", sec, None, TRIG, card_only=(prefix == "rvs"),
            note="Trigger from the sequencer's stage pulses." + (" Not available from the front panel." if prefix == "rvs" else ""))
for code, src in (("k", "keyboard"), ("p", "pulser"), ("s", "sequencer")):
    fld(f"env_trig_{code}", f"{code.upper()} trig", "ENVELOPE", "env.trigger_source",
        [{"conductance": 3, "value": "transient"}, {"conductance": 10, "value": "sustained"}, {"conductance": 0, "value": "off"}],
        note=f"Trigger from the {src}; the resistor value also sets the envelope mode.")
for k in ("attack", "duration", "decay"):
    fld(f"env_{k}", k, "ENVELOPE", f"env.{k}", note="Conductance is the slider level read on the 0 to 10 scale: .002 s is 10, 1 s is 4, 10 s is 0.")
fld("mosc_key", "key", "MOD", "mosc.keyboard", [{"conductance": 6, "value": "in"}, {"conductance": 0, "value": "out"}],
    confidence="inferred", note="The manual's figures for 'in' are hand-corrected between 3 and 6; see source_inconsistencies.")
fld("mosc_mode", "mod", "MOD", "mosc.mode", [{"conductance": 6, "value": "balanced_external"}, {"conductance": 3, "value": "am"}, {"conductance": 0, "value": "fm"}])
fld("mosc_ws", "w.s.", "MOD", "mosc.waveshape", [{"conductance": 6, "value": "sawtooth"}, {"conductance": 3, "value": "square"}, {"conductance": 0, "value": "triangle"}])
fld("cosc_key", "key", "CMPLX", "cosc.keyboard", [{"conductance": 3, "value": "in"}, {"conductance": 0, "value": "out"}],
    note="3 per the worked example (Figure 14); the summary text is hand-corrected between 3 and 6.")
fld("cosc_ws_pot", "w. (pot)", "CMPLX", "cosc.waveshape", note="Waveshape knob position, 0 to 10.")
fld("cosc_ws_switch", "w. (switch)", "CMPLX", "cosc.waveshape_select", [{"conductance": 6, "value": "spike"}, {"conductance": 3, "value": "square"}, {"conductance": 0, "value": "triangle"}])
for n in (1, 2):
    fld(f"gate{n}_mode", f"{n} mode", "GATE", f"gate{n}.mode", [{"conductance": 10, "value": "lowpass"}, {"conductance": 3, "value": "combination"}, {"conductance": 0, "value": "vca"}])
fld("gate_routing", "s.r.", "GATE", "gate2.routing", [{"conductance": 6, "value": "preamp"}, {"conductance": 3, "value": "mod_osc"}, {"conductance": 0, "value": "series"}])

D["program_card"] = {
    "kind": "resistor_card", "selector_param": "card.selector",
    "rows": [
        {"id": "OFFSET", "label": "OFFSET", "node": "card.offset", "note": "Fixed reference: a resistor from OFFSET to an input sets that parameter's offset."},
        {"id": "INV", "label": "INV", "node": "card.inv_row", "note": "Whatever is patched to the inverter's 'to prog' jack, normally the inverter output by jumper."},
        {"id": "SEQ", "label": "SEQ", "node": "seq.out"},
        {"id": "RAN", "label": "RAN", "node": "rvs.out1", "note": "Two random voltages reach the card, identical to the two left-hand front-panel outputs; the card layout for the second is unclear in the scan.",
         "confidence": "inferred"},
        {"id": "KEY", "label": "KEY", "node": "kbd_in.voltage"},
        {"id": "ENVDET", "label": "ENV DET", "node": "card.envdet_row", "note": "Whatever is patched to the envelope detector's 'to prog' jack: the detector, the modulation oscillator's c.v. out, or a preset voltage."},
        {"id": "ENVGEN", "label": "ENV GEN", "node": "env.out"},
        {"id": "PULSER", "label": "PULSER", "node": "pulser.ramp"},
        {"id": "PRES", "label": "PRES.", "node": "kbd_in.pressure"},
    ],
    "columns": [
        {"id": "PERIOD", "label": "PERIOD", "node": "pulser.period_cv", "offset_param": "pulser.period"},
        {"id": "INDEX", "label": "INDEX", "node": "mosc.index_cv", "offset_param": "mosc.index"},
        {"id": "FREQ", "label": "FREQ.", "node": "mosc.freq_cv", "offset_param": "mosc.frequency"},
        {"id": "PITCH", "label": "PITCH", "node": "cosc.pitch_cv", "offset_param": "cosc.pitch"},
        {"id": "TIMBRE", "label": "TIMBRE", "node": "cosc.timbre_cv", "offset_param": "cosc.timbre"},
        {"id": "LEVEL1", "label": "LEVEL 1", "node": "gate1.level_cv", "offset_param": "gate1.level"},
        {"id": "LEVEL2", "label": "LEVEL 2", "node": "gate2.level_cv", "offset_param": "gate2.level"},
        {"id": "INV", "label": "INV", "node": "card.inv_column", "note": "Leaves on the inverter's 'from prog' jack."},
    ],
    "conductance_table": [
        {"level": 10, "resistance_ohm": 120000, "colour_code": "brown-red-yellow"}, {"level": 8, "resistance_ohm": 150000, "colour_code": "brown-green-yellow"},
        {"level": 6, "resistance_ohm": 200000, "colour_code": "red-black-yellow"}, {"level": 4, "resistance_ohm": 300000, "colour_code": "orange-black-yellow"},
        {"level": 3, "resistance_ohm": 390000, "colour_code": "orange-white-yellow"}, {"level": 2, "resistance_ohm": 620000, "colour_code": "blue-red-yellow"},
        {"level": 1.5, "resistance_ohm": 820000, "colour_code": "grey-red-yellow"}, {"level": 1, "resistance_ohm": 1200000, "colour_code": "brown-red-green"},
        {"level": 0.5, "resistance_ohm": 2400000, "colour_code": "red-yellow-green"}, {"level": 0.25, "resistance_ohm": 4700000, "colour_code": "yellow-violet-green"},
    ],
    "fields": F,
    "combine": ("Resistors in parallel sum their conductances. A resistor between a row and a column is both the connection and its processing level, "
                "so one input can take several sources, each scaled differently, which the front panel cannot do. With CONTROL at 'both', card and "
                "front-panel values add: offsets and processing levels sum, card and panel triggers both act, and switch codes sum too."),
    "saturation": "Inputs saturate above a total conductance of 10. Switch fields saturate above 6, so summed codes can select a mode in between: gate codes 3 (card) plus 3 (panel) give a combination mode the panel cannot reach.",
    "not_programmable": ["pulser.mode", "cosc.fine_tune", "mosc.fine_tune", "out.mix_a", "out.mix_b", "out.reverb_level", "out.monitor_level", "out.output_level"],
    "note": "Cards came blank with a supply of programming resistors; the manual describes bending, soldering and stacking them on copper strips. All slider calibrations line up across the panel so any setting can be read on the 0 to 10 scale.",
}

# --------------------------------------------------------------------------
# patches from the manual
# --------------------------------------------------------------------------
KEYS = [["kbd.key_voltage_out_1", "jack.kbd_voltage_in"]]
PULSE = [["kbd.pulse_out_1", "jack.kbd_pulse_in"]]
D["example_patches"] = [
    {"id": "pc2_basic", "name": "Complex oscillator alone (Patch-chart 2)", "source": "manual pp. 4-5",
     "settings": {"card.selector": "front_panel", "cosc.keyboard": "out", "gate2.routing": "series", "gate1.mode": "vca", "gate1.level": 8.5, "out.reverb_level": 0,
                  "cosc.pitch": 3, "cosc.timbre": 0, "cosc.waveshape_select": "spike", "cosc.waveshape": 0},
     "description": "A sine; turn the waveshape knob towards spike, square or triangle, then raise TIMBRE with the knob at sine.", "confidence": "stated"},
    {"id": "pc3_mod_osc", "name": "Modulation oscillator heard through Gate 2 (Patch-chart 3)", "source": "manual p. 5",
     "settings": {"gate2.routing": "mod_osc", "out.mix_b": 10, "gate2.level": 10, "mosc.waveshape": "square", "mosc.frequency": 0},
     "description": "Square wave clicks at 0.16 Hz that merge into a tone above about 16 Hz.", "confidence": "stated"},
    {"id": "pc4_fm_vibrato", "name": "FM vibrato (Patch-chart 4)", "source": "manual p. 8",
     "settings": {"mosc.mode": "fm", "cosc.pitch": 6, "mosc.index": 2, "mosc.frequency": 4},
     "description": "Index .2 swings the 440 Hz complex oscillator about a semitone. Raising index and frequency gives sirens, then clangorous spectra.", "confidence": "inferred"},
    {"id": "pc5_keyboard", "name": "Keyboard to complex oscillator (Patch-chart 5)", "source": "manual p. 10", "cords": KEYS,
     "settings": {"cosc.keyboard": "in"}, "description": "Equal-tempered half steps over 2 1/3 octaves; PITCH and fine tuning set the reference.", "confidence": "stated"},
    {"id": "pc6_preset_index", "name": "Preset voltages set the modulation index (Patch-chart 6)", "source": "manual p. 12",
     "cords": KEYS + [["kbd.preset_out_1", "jack.index_in"]],
     "settings": {"cosc.keyboard": "in", "mosc.keyboard": "in", "mosc.mode": "am", "mosc.index_processing": 10},
     "description": "Both oscillators track the keys while the three preset plates switch instantly between modulation depths.", "confidence": "stated"},
    {"id": "pc7_portamento", "name": "Portamento drives modulation frequency (Patch-chart 7)", "source": "manual p. 13",
     "cords": KEYS + [["kbd.preset_out_1", "kbd.portamento_in"], ["kbd.portamento_out_1", "jack.frequency_in"]],
     "settings": {"cosc.keyboard": "in", "mosc.mode": "am", "kbd.shift": "octave"},
     "description": "Higher registers glide the AM spectrum faster, because the presets also set the portamento rate.", "confidence": "inferred"},
    {"id": "pc10_env_timbre", "name": "Envelope on timbre (Patch-chart 10)", "source": "manual pp. 16-17",
     "cords": KEYS + PULSE + [["jack.envelope_1", "jack.timbre_in"]],
     "settings": {"cosc.keyboard": "in", "env.trigger_source": "keyboard"},
     "description": "Each new note brings a transient surge of harmonics.", "confidence": "stated"},
    {"id": "pc13_pulser", "name": "Pulser drives index and, inverted, modulation frequency (Patch-chart 13)", "source": "manual p. 19",
     "cords": KEYS + [["jack.pulser_1", "jack.index_in"], ["jack.pulser_2", "jack.inverter_in"], ["jack.inverter_out", "jack.frequency_in"],
                      ["kbd.pressure_out_1", "jack.kbd_pressure_in"], ["jack.pressure_1", "jack.period_in"], ["jack.envelope_1", "jack.timbre_in"]],
     "settings": {"pulser.trigger": "self", "pulser.period": 0, "env.trigger_source": "pulser", "mosc.index": 0, "mosc.index_processing": 5},
     "description": "Every 10 seconds the index falls from .5 to 0 while the modulating frequency rises again; finger pressure shortens the cycle.", "confidence": "inferred"},
    {"id": "pc16_random", "name": "Random pitch, timbre and level (Patch-chart 16)", "source": "manual p. 21",
     "cords": [["jack.random_1", "jack.pitch_in"], ["jack.random_2", "jack.timbre_in"], ["jack.random_3", "jack.level1_in"]],
     "settings": {"pulser.trigger": "self", "rvs.trigger_source": "pulser"},
     "description": "The self-running pulser calls up a new pitch, timbre and loudness on each cycle.", "confidence": "stated"},
    {"id": "pc17_voice", "name": "Voice controls loudness and timbre (envelope detector)", "source": "manual pp. 21-22",
     "cords": [["jack.envdet_out", "jack.level1_in"], ["jack.envdet_out", "jack.timbre_in"]],
     "settings": {"gate2.routing": "preamp", "gate1.level": 0, "gate1.level_processing": 10, "cosc.timbre": 0, "cosc.timbre_processing": 8},
     "description": "A microphone in the preamp opens Gate 1 and brightens the complex oscillator; singing along makes it seem to follow the vowels. Uses a stacked banana plug.",
     "confidence": "stated"},
    {"id": "card_fig14", "name": "Simple performance instrument on a card (Patch-chart 18, Figure 14)", "source": "manual pp. 26-27",
     "cords": KEYS + PULSE,
     "card": {"fields": {"env_trig_k": 10, "env_attack": 8, "env_duration": 10, "env_decay": 2, "cosc_key": 3, "cosc_ws_pot": 10, "cosc_ws_switch": 0, "gate1_mode": 3},
              "points": [{"row": "OFFSET", "column": "TIMBRE", "conductance": 6}, {"row": "ENVGEN", "column": "LEVEL1", "conductance": 8}]},
     "settings": {"card.selector": "prog_board"},
     "description": "Keyboard-played complex oscillator, triangle mix, through Gate 1 in combination mode, shaped by a sustained envelope. The pitch offset resistor's value is not given.",
     "confidence": "stated"},
    {"id": "card_fig15", "name": "AM vibrato with pressure on frequency (Patch-chart 19, Figure 15)", "source": "manual p. 28",
     "cords": KEYS + PULSE + [["kbd.pressure_out_1", "jack.kbd_pressure_in"]],
     "card": {"fields": {"mosc_key": 0, "mosc_ws": 0},
              "points": [{"row": "OFFSET", "column": "INDEX", "conductance": 3}, {"row": "OFFSET", "column": "FREQ", "conductance": 6}, {"row": "PRES", "column": "FREQ", "conductance": 2}]},
     "settings": {"card.selector": "prog_board"},
     "description": "Adds to card_fig14: modulation oscillator in AM at 5 Hz and index .3, with key pressure raising the rate.", "confidence": "inferred"},
    {"id": "card_fig16", "name": "Simulated echo with changing timbre (Figure 16)", "source": "manual p. 29",
     "card": {"fields": {"seq_level_1": 10, "seq_level_2": 8, "seq_level_3": 5, "seq_level_4": 3, "seq_level_5": 0.5, "seq_stages": 0, "seq_trig_p": 3,
                         "pulser_trig_p": 3, "gate_routing": 0},
              "points": [{"row": "SEQ", "column": "TIMBRE", "conductance": 8}, {"row": "OFFSET", "column": "PERIOD", "conductance": 4},
                         {"row": "PULSER", "column": "LEVEL2", "conductance": 10}]},
     "settings": {"card.selector": "prog_board", "out.mix_a": 0},
     "description": "Gates in series; the self-running pulser (1 s) re-strikes Gate 2 and steps the sequencer, so each echo has a different timbre. Start with the pulser's 'one' position.",
     "confidence": "stated"},
]

# --------------------------------------------------------------------------
# indicators, behaviours, provenance
# --------------------------------------------------------------------------
D["indicators"] = [
    {"id": "env.lamp", "module": "env", "label": "envelope lamp", "kind": "lamp", "function": "Inferred: a panel symbol beside MODE SELECT, presumably lit by the envelope."},
    {"id": "pulser.lamp", "module": "pulser", "label": "pulser lamp", "kind": "lamp", "function": "Inferred: a panel symbol beside MODE, presumably lit by the ramp or pulse."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Offset plus processed control voltage", "applies_to": ["pulser", "mosc", "cosc", "gate1", "gate2"],
     "rule": "Every voltage-controlled parameter has two sliders. The right-hand offset sets the starting value; the left-hand processing slider "
             "scales whatever is patched to the black input below them, and the result adds upward from the offset. Processing at 0 removes the "
             "input entirely. To let a patched voltage define the whole range, set the offset to 0 and processing to 10."},
    {"id": "b02", "name": "Three signal classes, separate connectors", "applies_to": ["kbd", "kbd_in", "seq", "env", "pulser", "rvs", "inverter", "envdet", "card"],
     "rule": "Control voltages and pulses travel on banana cords; audio stays inside apart from the preamp input and the outputs, on miniphone jacks. "
             "Audio cannot be patched into a control input, except the modulation oscillator's 'mod c.v. out', which carries its waveform as a voltage. "
             "Banana plugs stack, so one output can feed several inputs."},
    {"id": "b03", "name": "Jack colours", "applies_to": ["kbd_in", "seq", "env", "pulser", "rvs", "cosc", "mosc", "gate1", "gate2"],
     "rule": "Black jacks are control inputs. Outputs are coded by source: orange envelope, yellow pulser, blue sequencer, white random, violet pressure."},
    {"id": "b04", "name": "Lowpass gate modes", "applies_to": ["gate1", "gate2"],
     "rule": "VCA mode: LEVEL is gain. Lowpass mode: LEVEL is a 12 dB/octave cut-off; with a 220 Hz square about 3 leaves a near sine, lower goes silent. "
             "Combination: both together, so quieter is also duller. The filter element lags the amplifier, so very short envelopes in combination mode "
             "give resonant, drum-like strikes. Response follows the illumination of the vactrol lamp."},
    {"id": "b05", "name": "Gates in series, out of phase", "applies_to": ["gate1", "gate2"],
     "rule": "With SIGNAL ROUTING at 'series', Gate 1 feeds Gate 2 and also channel A. The gates are 180 degrees out of phase, so mixing both "
             "cancels: Gate 1 as amplifier and Gate 2 as lowpass leaves a highpass-like sound, and moving Gate 2 between about 4 and 8 gives phasing. "
             "With channel A down, both gates must open for any sound: double enveloping and echoes."},
    {"id": "b06", "name": "Harmonic addition", "applies_to": ["cosc"],
     "rule": "The WAVESHAPE knob crossfades a sine with the selected spike, square or triangle; it never changes the oscillator itself. TIMBRE adds and "
             "accentuates harmonics, the opposite of filtering, and acts only on the sine and triangle components. In the early 208 a second "
             "triangle oscillator tracks the first and is cross-modulated by it as timbre rises."},
    {"id": "b07", "name": "Modulation modes", "applies_to": ["mosc", "cosc", "balmod"],
     "rule": "FM: index sets the deviation around the centre pitch; .2 is about a semitone at 440 Hz, and near 1.0 the centre is lost. AM: tremolo at low "
             "rates, sidebands at audio rates; above about .5 the fundamental fades and 1.0 is complete ring modulation. Balanced external: the same on "
             "the preamp signal. The modulator's waveshape determines the sideband density. FM index can also come from the complex oscillator's PITCH "
             "processing when 'mod c.v. out' is patched to PITCH, giving AM and FM at once."},
    {"id": "b08", "name": "Envelope generator", "applies_to": ["env"],
     "rule": "Attack, then hold, then decay. Transient: hold is DURATION, independent of trigger length. Sustained: hold lasts as long as the trigger. "
             "With all three at minimum the envelope is under 1/100 s. The trapezoid can be inverted by the inverter or, for pitch, by the SIGN switch."},
    {"id": "b09", "name": "Pulser and self-triggering", "applies_to": ["pulser"],
     "rule": "Each trigger starts a falling ramp; the trigger out comes at the end. In 'self' mode the end trigger restarts the ramp, but it needs a first "
             "trigger: flick MODE to 'one' and back. 'one' still works under card control. More voltage at the PERIOD input shortens the period."},
    {"id": "b10", "name": "Sequencer", "applies_to": ["seq"],
     "rule": "Advances one stage per trigger from keyboard or pulser; STAGES sets 3, 4 or 5, the card adds 2. Each stage sends a pulse unless its switch "
             "is down, to fire the envelope or pulser and so place rests. Patching the sequencer voltage into the self-running pulser's PERIOD makes "
             "rhythms, since each stage sets the next period. Tune each level using the keyboard as trigger source."},
    {"id": "b11", "name": "Key voltages", "applies_to": ["kbd", "cosc", "mosc"],
     "rule": "29 equal steps, held until the next key. Through a KEYBOARD switch they give equal-tempered half steps; through a PITCH or FREQUENCY input "
             "the processing slider sets the interval, from tiny divisions of a whole step to 2 1/3 octaves, for other tunings. Both oscillators on the same "
             "voltage track at a fixed ratio, so modulation timbres stay similar across the keyboard."},
    {"id": "b12", "name": "Presets and shift", "applies_to": ["kbd"],
     "rule": "Three preset plates give independent voltages at the PRESET outputs. SHIFT 'octave' makes them select registers 12 keys apart (an octave only "
             "when the oscillator is tuned to 12-note steps); 'preset' adds the touched preset's level to the key voltage, for any transposition up to "
             "a major ninth; 'none' leaves the key voltage alone."},
    {"id": "b13", "name": "Program card and front panel together", "applies_to": ["card"],
     "rule": "CONTROL selects card, panel or both. In 'both', offsets, processing levels and switch codes add, and card and panel triggers both act. "
             "Card routings can feed one input from several sources with separate levels, keep inputs below a total of 10, and expose card-only "
             "features: a two-stage sequence, sequencer pulses triggering the random source, and a voltage-controlled stage count. The fine tuning "
             "knobs, the pulser 'one' position and the whole output section stay under manual control."},
    {"id": "b14", "name": "Inverter", "applies_to": ["inverter"],
     "rule": "Output is 10 minus input on the 0 to 10 scale. Its card jacks can be borrowed: a third random voltage can reach the card through the "
             "inverter's 'to prog' jack, and a fourth through the envelope detector's."},
    {"id": "b15", "name": "Random voltages", "applies_to": ["rvs"],
     "rule": "Four uncorrelated levels, renewed on each trigger and held between. Processing near 1 gives slight variation around the offset; higher "
             "processing gives wider jumps."},
]
D["midi"] = {"receives": [], "transmits": [], "note": "None. External control is by banana control voltages and pulses and the preamp input."}
D["specifications"] = {
    "complex_oscillator_hz": {"panel": [55, 1760], "measured_fine_centred": [38, 3500]},
    "modulation_oscillator_hz": {"panel": [0.16, 50], "measured_fine_centred": [0.13, 70]},
    "envelope_times_s": [0.002, 10], "pulser_period_s": [0.002, 10],
    "lowpass_gate": "vactrol; 12 dB/octave in lowpass mode",
    "outputs": {"program": "2 x nominally 1 V rms", "monitor": "headset or low-level speaker, about 2 W"},
    "voltage_standards": {"pitch": "1.2 V/octave Buchla standard (inferred for the original; manual gives no figure)",
                          "control_voltage_v": "0 to 15 on early 1970s 200 series modules; 0 to 10 later (Easel-specific value not documented)",
                          "pulse_v": "about 15 on early 200 series (Easel-specific value not documented)",
                          "audio": "+4 dBu on early 200 series; the manual gives a nominal 1 V program output"},
    "connectors": {"control_and_pulse": "4 mm banana, stackable", "audio": "miniphone (preamp input; outputs inferred)"},
    "keyboard": "capacitive touch plates: 29 voltage keys and 3 preset plates",
    "power": {"mains": "115 V", "battery": "optional 12 V pack, about 3 hours"},
    "program_card_resistors": "10 values, 120 kohm (level 10) to 4.7 Mohm (level .25)",
}
D["omitted_from_source"] = [
    "the foreword, introduction and the 'Onward' note on the Easel Weasel newsletter",
    "the step-by-step resistor bending, soldering and stacking instructions, beyond the summary in program_card.note",
    "the score extracts showing 3, 4 and 5 stage rhythmic patterns from Patch-chart 14",
    "patch charts 1, 8, 9, 11, 12, 14, 15 and Figure 17 to 21 card examples, whose slider positions are hard to read in the scan; their techniques are in behaviours",
]
D["not_in_source"] = [
    "any electrical specification: control voltage range, pitch scaling, pulse levels, impedances; general Buchla figures are given in specifications, marked as not Easel-specific",
    "which small jack on the patch field carries which colour; only white (4) and orange (3) are counted in the text",
    "the connector type of the signal outputs and phones",
    "where the balanced-modulated preamp signal goes in 'balanced external' mode",
    "what the lamp symbols beside the envelope and pulser mode switches indicate",
    "the reverb type; spring comes from reissue documentation",
    "the curve of the timbre circuit and the lowpass gate's response times",
    "the meaning of 'trim' on the oscillators' KEYBOARD 'out' position",
]
D["source_inconsistencies"] = [
    "The complex oscillator's panel range is 55 to 1760 Hz; Dave Brown measured 38 to 3500 Hz with the fine tuning centred.",
    "The modulation oscillator's panel range is 0.16 to 50 Hz; Dave Brown measured 0.13 to 70 Hz.",
    "The program card text gives the oscillator 'key' fields as 3 or 6 with hand corrections for both oscillators; the Figure 14 worked example uses 3 for the complex oscillator.",
    "The card summary says the complex oscillator's waveshape switch codes spike, square and sine as 6, 3 and 0; the panel and pages 4 to 5 call the third position triangle.",
    "The card text codes AM as 3, but the Figure 15 example programs 'a.m. oscillator' with no resistor, which would be FM.",
    "Patch-chart 4 describes the vibrato as 1 1/2 times a second and also as repeating every 1 1/2 seconds.",
    "The manual says the Easel comes with 10 program cards; Synth DB says six blank cards.",
    "The manual counts 29 voltage keys; Synth DB says 32 keys, consistent with 29 plus the 3 preset plates.",
]
D["modelling_gaps"] = [
    {"topic": "Version", "detail": "Modelled on the original 1973-74 Easel. The 2013 reissue and the 208C/Easel Command differ: MIDI, an aux input, extra audio and banana "
     "connections, a green modulation oscillator section, trimmable 1 V/octave scaling, card-bus inputs that add to banana inputs, and the iProgram and later card "
     "interfaces. None of this is modelled."},
    {"topic": "Vactrol response", "detail": "The lowpass gates' character comes from the lamp and photocell's slow, level-dependent decay. The manual gives only the qualitative "
     "difference between the filter and amplifier elements."},
    {"topic": "Timbre circuit", "detail": "Known only as cross-modulated tracking triangle oscillators in the early 208. A model needs a measured transfer curve."},
    {"topic": "Card electrical model", "detail": "Conductance values are recorded as levels, not currents into a summing node; the saturation points (10 for inputs, 6 for "
     "switches) are as stated, not measured."},
    {"topic": "Jack allocation", "detail": "Counts for yellow, blue and violet jacks are inferred. A clear photograph of an original 208 panel would settle them."},
]

with open("/mnt/user-data/outputs/buchla-music-easel_synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
