#!/usr/bin/env python3
"""Assemble the Behringer Poly D device file."""
import json

D = {"schema_version": "0.7.0"}
D["device"] = {
    "id": "behringer-poly-d", "manufacturer": "Behringer", "model": "Poly D",
    "category": "4-voice paraphonic analogue synthesizer with 37-key keyboard, chorus, distortion, sequencer and arpeggiator",
    "based_on": "Moog Minimoog Model D, extended to four oscillators assignable one per note. The guide never names Moog; the "
                "controller, oscillator bank, mixer, ladder filter and contour layout, the decay switch and the keyboard control "
                "switches are the Minimoog's.",
    "sources": [
        {"id": "qsg", "title": "POLY D Quick Start Guide", "kind": "quick_start_guide", "file": "Poly_D_Quick_Start.pdf", "pages": 49,
         "note": "57 numbered controls, 15 numbered sequencer controls, a getting-started chapter with voice assignment and arpeggiator "
                 "modes, a sequencer chapter, a full SysEx command table and a specifications table with envelope times, ranges and "
                 "jack voltages."},
        {"id": "cal_osc", "title": "User Support Bulletin: POLY D Oscillator Calibration", "kind": "service_manual",
         "file": "User_Support_Bulletin_POLY-D_Oscillator_Calibration.pdf", "pages": 5,
         "note": "Rear-panel trimpot procedure for oscillator range, scale and octave calibration; confirms the reference tuning notes."},
        {"id": "cal_wheels", "title": "User Support Bulletin: POLY D Wheels and Aftertouch Calibration", "kind": "service_manual",
         "file": "Poly_D_Calibration_Wheels_and_Aftertouch_Guides.pdf", "pages": 10,
         "note": "Hidden calibration mode entered at power-on; documents the power LED blinking red in that mode."},
        {"id": "panel", "title": "Poly D front panel photograph", "kind": "measurement", "file": "Poly_D.jpg",
         "note": "Switch backlight colours and panel scales."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue",
    "signal_path_note": "analogue voice; the chorus is a BBD (bucket brigade) circuit and the distortion analogue; digitally scanned keyboard and sequencer",
    "voices": 4,
    "polyphony_mode": "paraphonic: four oscillators assigned one per note in POLY, all four on one note in UNISON, or one note in MONO, "
                      "sharing one filter and one pair of contours",
    "poly_chain_max_units": None, "patch_memory": False, "semi_modular": False,
    "panel_counts": {"knobs": 30, "switches": 28, "wheels": 2, "keys": 37},
    "summary": (
        "A four-oscillator Minimoog. Each oscillator has six ranges from LO to 2' and six waveforms; oscillators 2 to 4 have "
        "a frequency offset of plus or minus 7 semitones, and oscillator 4 can be freed from the keyboard to act as a modulator. "
        "In POLY mode each new note takes the next oscillator, so four notes play through a single 24 dB/octave ladder filter "
        "(low-pass or high-pass) and a single loudness contour: paraphonic, not polyphonic. A mixer with on switches blends the "
        "four oscillators, pink or white noise and an external input. Modulation is the Minimoog's: a mix knob between OSC 4 or "
        "the filter envelope and noise (or an external source) or the LFO, scaled by the mod wheel and switched onto the "
        "oscillators and filter. Then distortion, a BBD stereo chorus, a 32-step sequencer with 64 pattern memories, and an "
        "eight-mode arpeggiator. Velocity and aftertouch keyboard with CV outputs."
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
    p["access"] = access or [{"type": "panel", "control": "knob"}]
    p["function"] = function
    for k in ("confidence", "note", "led_colour"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, ref, loc, direction, signal, node, function, connector="6.35mm TS", combine=None, electrical=None, confidence=None, note=None):
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


S10 = {"min": 0, "max": 10}
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
BTN = lambda colour: [{"type": "panel", "control": "button", "note": f"backlit {colour}"}]
ROCK = lambda colour: [{"type": "panel", "control": "toggle_switch", "note": f"backlit {colour} rocker"}]
ROT = [{"type": "panel", "control": "rotary_switch"}]


def sx(packet, extra=""):
    return {"type": "sysex", "message": f"F0 00 20 32 00 01 0C <DID> {packet:02X} ... F7", "note": ("Packet 0x%02X. " % packet + extra).strip()}


RANGES = [{"value": "lo", "label": "LO", "meaning": "sub-audio, for use as a modulator"}, {"value": "32'"}, {"value": "16'"},
          {"value": "8'"}, {"value": "4'"}, {"value": "2'"}]
W123 = [{"value": "triangle"}, {"value": "tri_saw", "label": "triangle/sawtooth"}, {"value": "saw", "label": "sawtooth"},
        {"value": "square"}, {"value": "wide_pulse"}, {"value": "narrow_pulse"}]
W4 = [{"value": "triangle"}, {"value": "reverse_saw", "label": "reverse sawtooth"}, {"value": "saw", "label": "sawtooth"},
      {"value": "square"}, {"value": "wide_pulse"}, {"value": "narrow_pulse"}]
DEST = [{"value": 0, "label": "off"}, {"value": 1, "label": "DIN"}, {"value": 2, "label": "USB"}, {"value": 3, "label": "both"}]

# modules -------------------------------------------------------------------
mod("kbd", "midi_to_cv", "Keyboard and MIDI", "KEYBOARD",
    "37 semi-weighted full-size keys with velocity and aftertouch, pitch and mod wheels, and MIDI in over DIN and USB. "
    "Transposes by an octave either way. Produces note, gate, trigger, velocity and aftertouch, all also available as CV.",
    ["kbd.ext_trig_in"], ["kbd.note", "kbd.gate", "kbd.trig", "kbd.velocity", "kbd.aftertouch", "kbd.bend", "kbd.mod_wheel"])
mod("voices", "voice_allocator", "Voice assignment", "CONTROLLERS",
    "Assigns notes to the four oscillators. POLY: the first note plays OSC 1, a second adds OSC 2, and so on to four. UNISON: "
    "all four on one note. MONO: one note. Key priority and multi-trigger are SysEx settings. AUTO DAMP decides whether "
    "released chord notes keep sounding until the next note.",
    ["voices.note_in", "voices.gate_in"], ["voices.pitch1", "voices.pitch2", "voices.pitch3", "voices.pitch4", "voices.gate"],
    {"voice_count": 4, "paraphonic": True})
mod("pitch", "pitch_control", "Tune, glide and bend", "CONTROLLERS",
    "Master tune, glide (switchable on the left of the keyboard), pitch wheel and the external OSCILLATOR CV, applied to the "
    "oscillators' pitch. OSC 4 is exempt from all of it when OSC 4 CONTROL is off.",
    ["pitch.in1", "pitch.in2", "pitch.in3", "pitch.in4", "pitch.bend_in", "pitch.cv_in"],
    ["pitch.to_osc1", "pitch.to_osc2", "pitch.to_osc3", "pitch.to_osc4"])
for n in (1, 2, 3, 4):
    mod(f"osc{n}", "oscillator", f"Oscillator {n}", "OSCILLATOR BANK",
        f"Analogue VCO with six ranges (LO to 2') and six waveforms." + (" Frequency offset of plus or minus 7 semitones." if n > 1 else " The pitch reference; no frequency offset.")
        + (" Can be released from the keyboard and used as a modulation source, like the Minimoog's third oscillator." if n == 4 else ""),
        [f"osc{n}.pitch_in", f"osc{n}.mod_in"], [f"osc{n}.out"],
        {"frequency_hz": {"min": 0.1, "max": 20000}, "ranges": ["LO", "32'", "16'", "8'", "4'", "2'"],
         "waveforms": [w["value"] for w in (W4 if n == 4 else W123)]})
mod("noise", "noise", "Noise", "MIXER", "Pink or white noise into the mixer, and the default modulation source.", [], ["noise.out"])
mod("lfo", "lfo", "LFO", "KEYBOARD", "Triangle or square, 0.05 to 200 Hz. A modulation source; also shown by a rate LED.",
    [], ["lfo.out"], {"rate_hz": {"min": 0.05, "max": 200}, "shapes": ["triangle", "square"]})
mod("mod_bus", "modulation_bus", "Modulation mix", "CONTROLLERS",
    "The Minimoog modulation scheme. One switch picks OSC 4 or the filter envelope, another picks noise (or whatever is in MOD "
    "SOURCE) or the LFO. MODULATION MIX crossfades between the two, the mod wheel sets overall depth, and the OSCILLATOR "
    "MODULATION and FILTER MODULATION switches send the result to the oscillators and the filter.",
    ["mod_bus.osc4_in", "mod_bus.feg_in", "mod_bus.noise_in", "mod_bus.lfo_in", "mod_bus.wheel_in"], ["mod_bus.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Volume and on switch for each of four oscillators, external input and noise. Overload LED on the external input.",
    ["mixer.in1", "mixer.in2", "mixer.in3", "mixer.in4", "mixer.in_ext", "mixer.in_noise"], ["mixer.out"])
mod("vcf", "filter", "Filter", "FILTER",
    "24 dB/octave ladder filter, switchable low-pass or high-pass. Cutoff, emphasis (resonance) and amount of contour; keyboard "
    "tracking in thirds by two switches; modulation from the mix bus; external CV at 1 V/octave.",
    ["vcf.in", "vcf.env_in", "vcf.kbd_in", "vcf.mod_in", "vcf.cv_in"], ["vcf.out"],
    {"slope_db_per_octave": 24, "modes": ["lowpass", "highpass"], "topology": "transistor ladder"})
mod("filter_env", "envelope", "Filter contour", "FILTER", "Attack, decay and sustain shaping the cutoff. Release follows decay when DECAY is on.",
    ["filter_env.gate_in"], ["filter_env.out"], {"stages": ["attack", "decay", "sustain"], "attack_s": [0.001, 10], "decay_s": [0.004, 35]})
mod("loud_env", "envelope", "Loudness contour", "LOUDNESS CONTOUR", "Attack, decay and sustain shaping the VCA. Release follows decay when DECAY is on, otherwise it is immediate.",
    ["loud_env.gate_in"], ["loud_env.out"], {"stages": ["attack", "decay", "sustain"], "attack_s": [0.001, 10], "decay_s": [0.004, 35]})
mod("vca", "vca", "VCA", "LOUDNESS CONTOUR", "Single amplifier for all four notes, opened by the loudness contour and the LOUDNESS CV input.",
    ["vca.in", "vca.env_in", "vca.cv_in"], ["vca.out"])
mod("distortion", "overdrive", "Distortion", "DISTORTION", "Drive, tone and level, switchable in or out.", ["distortion.in"], ["distortion.out"])
mod("chorus", "chorus", "Chorus", "CHORUS", "BBD stereo chorus with two modes, usable together for a deeper effect. Mono in, stereo out.",
    ["chorus.in"], ["chorus.left", "chorus.right"])
mod("seq", "sequencer", "Sequencer", "SEQUENCER",
    "32-step note sequencer (four pages of eight), 64 patterns in 8 banks of 8. Per-step gate length, tie, rest, accent, glide and "
    "ratchet (1 to 4 repeats); swing per pattern. Keyboard recording or step editing. Runs on the internal tempo or external sync.",
    ["seq.notes_in", "seq.clock_in"], ["seq.notes_out"], {"steps": 32, "patterns": 64, "banks": 8})
mod("arp", "arpeggiator", "Arpeggiator", "SEQUENCER", "Arpeggiates held notes in eight orders, with hold, at the sequencer tempo.",
    ["arp.notes_in", "arp.clock_in"], ["arp.notes_out"], {"modes": 8})
mod("clock", "gate_logic", "Tempo and sync", "SEQUENCER",
    "Internal tempo from TEMPO/GATE LENGTH, or external clock from DIN, USB or the SYNC IN jack. Clock rate and polarity for the "
    "jacks are SysEx settings. SYNC OUT carries the internal clock.",
    ["clock.sync_in"], ["clock.out"])
mod("output", "output", "Output", "OUTPUT", "Master volume and headphone volume; stereo main outputs after the chorus.",
    ["output.left_in", "output.right_in"], ["output.left", "output.right", "output.phones"])
D["modules"] = M

# parameters ----------------------------------------------------------------
par("kbd.mod_wheel", "kbd", "MOD WHEEL", "continuous", "Modulation depth from off to maximum.", ref=2, access=[{"type": "panel", "control": "wheel"}], panel_scale=S10)
par("kbd.pitch_wheel", "kbd", "PITCH WHEEL", "continuous", "Lowers or raises pitch; range set by SysEx, default one octave.", ref=3,
    access=[{"type": "panel", "control": "wheel"}], panel_scale={"min": -5, "max": 5}, bipolar=True)
par("pitch.glide_on", "pitch", "GLIDE ON/OFF", "boolean", "Turns glide on or off.", ref=4, access=BTN("white"), values=ONOFF)
par("lfo.rate", "lfo", "LFO RATE", "continuous", "LFO frequency.", ref=5, panel_scale=S10, physical={"min": 0.05, "max": 200, "unit": "Hz", "taper": "unknown"})
par("lfo.shape", "lfo", "WAVE SHAPE", "enum", "LFO wave shape.", ref=6, access=[{"type": "panel", "control": "toggle_switch"}],
    values=[{"value": "triangle"}, {"value": "square"}])
par("kbd.transpose", "kbd", "TRANSPOSE", "enum", "Shifts the keyboard an octave up or down.", ref=7, access=[{"type": "panel", "control": "toggle_switch"}],
    values=[{"value": 1, "label": "UP"}, {"value": 0, "label": "NORM"}, {"value": -1, "label": "DOWN"}])
par("mod_bus.src_b", "mod_bus", "NOISE (MOD SRC) / LFO", "enum", "Second modulation source: noise, or the MOD SOURCE jack when patched, or the LFO.", ref=8,
    access=[{"type": "panel", "control": "toggle_switch"}], values=[{"value": "noise", "label": "NOISE (MOD SRC)"}, {"value": "lfo", "label": "LFO"}])
par("mod_bus.src_a", "mod_bus", "OSC4 / FILTER EG", "enum", "First modulation source: oscillator 4 or the filter contour.", ref=9,
    access=[{"type": "panel", "control": "toggle_switch"}], values=[{"value": "osc4", "label": "OSC 4"}, {"value": "filter_eg", "label": "FILTER EG"}])
par("mod_bus.mix", "mod_bus", "MODULATION MIX", "continuous", "Crossfade between the OSC4/FILTER EG source (counter-clockwise) and the NOISE/LFO source (clockwise).", ref=10,
    panel_scale={"min": 0, "max": 10, "unit": "OSC4/FILTER EG to NOISE/LFO"})
par("pitch.glide", "pitch", "GLIDE", "continuous", "Glide time between notes.", ref=11, panel_scale=S10)
par("voices.mode", "voices", "MODE", "enum", "Voice assignment.", ref=12, access=BTN("green"),
    values=[{"value": "mono", "label": "MONO"}, {"value": "unison", "label": "UNI", "meaning": "all four oscillators on one note"},
            {"value": "poly", "label": "POLY", "meaning": "one oscillator per note, up to four"}])
par("voices.auto_damp", "voices", "AUTO DAMP", "boolean",
    "Off: a released chord keeps sounding until all its notes are released or a new note is played. On: released notes are damped and only held notes continue.",
    ref=13, access=BTN("green"), values=ONOFF)
par("pitch.tune", "pitch", "TUNE", "continuous", "Master tuning of all four oscillators, marked in semitones; OSC 4 exempt when OSC 4 CONTROL is off.", ref=14,
    panel_scale={"min": -2, "max": 2, "unit": "semitones"}, bipolar=True)
par("mod_bus.osc_mod", "mod_bus", "OSCILLATOR MODULATION", "boolean", "Sends the modulation mix to the oscillators.", ref=15, access=BTN("white"), values=ONOFF)
par("pitch.osc4_control", "pitch", "OSC 4 CONTROL", "boolean", "On: OSC 4 follows the keyboard, pitch wheel and mod wheel. Off: it ignores all three.", ref=16, access=BTN("white"), values=ONOFF)
for n in (1, 2, 3, 4):
    par(f"osc{n}.range", f"osc{n}", f"RANGE (OSC {n})", "enum", f"Range of oscillator {n}.", ref=17, access=ROT, values=RANGES)
    if n > 1:
        par(f"osc{n}.frequency", f"osc{n}", f"OSCILLATOR-{n} FREQUENCY", "continuous", f"Offset of oscillator {n} against oscillator 1, marked in semitones.", ref=18,
            panel_scale={"min": -7, "max": 7, "unit": "semitones"}, bipolar=True)
    par(f"osc{n}.waveform", f"osc{n}", f"WAVEFORM (OSC {n})", "enum", f"Waveform of oscillator {n}.", ref=19, access=ROT, values=W4 if n == 4 else W123)
    par(f"mixer.vol{n}", "mixer", f"VOLUME (OSC {n})", "continuous", f"Level of oscillator {n}.", ref=20, panel_scale=S10)
    par(f"mixer.on{n}", "mixer", f"ON (OSC {n})", "boolean", f"Oscillator {n} into the mixer.", ref=21, access=ROCK("orange"), values=ONOFF)
par("mixer.ext_on", "mixer", "ON (EXT IN)", "boolean", "External input into the mixer.", ref=21, access=ROCK("orange"), values=ONOFF)
par("mixer.noise_on", "mixer", "ON (NOISE)", "boolean", "Noise into the mixer.", ref=21, access=ROCK("orange"), values=ONOFF)
par("mixer.noise_vol", "mixer", "NOISE VOLUME", "continuous", "Noise level.", ref=22, panel_scale=S10)
par("noise.colour", "noise", "WHITE / PINK", "enum", "Noise colour.", ref=23, access=ROCK("orange"), values=[{"value": "white"}, {"value": "pink"}])
par("mixer.ext_vol", "mixer", "EXT IN VOLUME", "continuous", "External input level. Turn down if the OVERLOAD LED lights.", ref=24, panel_scale=S10)
par("loud_env.decay_switch", "loud_env", "DECAY", "boolean",
    "On: after a note or external trigger is released, the sound decays over the DECAY TIME. Off: it stops immediately. As on the Minimoog, this governs release on both contours.",
    ref=26, access=BTN("white"), values=ONOFF, confidence="inferred", note="The guide describes it under the loudness contour; applying it to the filter contour too follows the Minimoog.")
par("vcf.kbd_control", "vcf", "KEYBOARD CONTROL 1 / 2", "enum", "Keyboard tracking of cutoff, by two switches.", ref=27, access=BTN("teal"),
    values=[{"value": 0, "label": "both off", "meaning": "none"}, {"value": 1, "label": "1 on", "meaning": "1/3 of maximum"},
            {"value": 2, "label": "2 on", "meaning": "2/3 of maximum"}, {"value": 3, "label": "both on", "meaning": "maximum"}])
par("mod_bus.filter_mod", "mod_bus", "FILTER MODULATION", "boolean", "Sends the modulation mix to the filter.", ref=28, access=BTN("teal"), values=ONOFF)
par("vcf.mode", "vcf", "FILTER MODE", "enum", "Low-pass or high-pass.", ref=29, access=BTN("teal"), values=[{"value": "lowpass", "label": "LO"}, {"value": "highpass", "label": "HI"}])
for e, refs, name in [("filter_env", (30, 30, 30), "filter"), ("loud_env", (32, 32, 32), "loudness")]:
    par(f"{e}.attack", e, "ATTACK", "continuous", f"Attack time of the {name} contour.", ref=refs[0], panel_scale=S10,
        physical={"min": 0.001, "max": 10, "unit": "s", "taper": "logarithmic (panel marked 200, 600 ms, 5, 10 s)"})
    par(f"{e}.decay", e, "DECAY TIME", "continuous", f"Decay time of the {name} contour, and release when DECAY is on.", ref=refs[1], panel_scale=S10,
        physical={"min": 0.004, "max": 35, "unit": "s", "taper": "logarithmic", "note": "specifications say 4 ms to more than 35 s"})
    par(f"{e}.sustain", e, "SUSTAIN", "continuous", f"Sustain level of the {name} contour.", ref=refs[2], panel_scale=S10)
par("vcf.cutoff", "vcf", "CUTOFF FREQUENCY", "continuous", "Filter cutoff.", ref=31, panel_scale={"min": -4, "max": 4, "unit": "octaves (Minimoog marking)"}, bipolar=True)
par("vcf.emphasis", "vcf", "FILTER EMPHASIS", "continuous", "Resonance at cutoff.", ref=31, panel_scale=S10)
par("vcf.contour_amount", "vcf", "AMOUNT OF CONTOUR", "continuous", "Depth of the filter contour on cutoff.", ref=31, panel_scale=S10)
par("chorus.mode1", "chorus", "CHORUS I", "boolean", "Chorus mode I.", ref=33, access=BTN("yellow"), values=ONOFF)
par("chorus.mode2", "chorus", "CHORUS II", "boolean", "Chorus mode II, deeper; both together deeper still.", ref=33, access=BTN("yellow"), values=ONOFF)
par("chorus.on", "chorus", "ON (chorus)", "boolean", "Chorus in or out.", ref=33, access=ROCK("orange"), values=ONOFF)
par("distortion.drive", "distortion", "DIST", "continuous", "Amount of distortion.", ref=34, panel_scale=S10)
par("distortion.tone", "distortion", "TONE", "continuous", "Distortion tone.", ref=34, panel_scale=S10)
par("distortion.level", "distortion", "LEVEL", "continuous", "Distortion output level.", ref=34, panel_scale=S10)
par("distortion.on", "distortion", "ON (distortion)", "boolean", "Distortion in or out.", ref=34, access=ROCK("orange"), values=ONOFF)
par("output.volume", "output", "VOLUME", "continuous", "Overall output level.", ref=36, panel_scale=S10)
par("output.phones", "output", "VOLUME (HEADPHONE)", "continuous", "Headphone level.", ref=37, panel_scale=S10)
par("output.power", "output", "POWER", "boolean", "Power switch.", ref=39, access=[{"type": "panel", "control": "toggle_switch"}], values=ONOFF)
par("kbd.aftertouch_trim", "kbd", "AFTER PRESSURE (trim)", "continuous", "Scales the AFTER PRESSURE CV output.", ref=43, access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)
par("kbd.velocity_trim", "kbd", "VELOCITY (trim)", "continuous", "Scales the VELOCITY CV output.", ref=48, access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)

# sequencer section, numbered S1 to S15 in the guide
SQ = [("seq.tempo", "clock", "TEMPO / GATE LENGTH", "continuous", "Sequencer and arpeggiator tempo; gate length in step editing; swing with SHIFT.", "S1", [{"type": "panel", "control": "knob"}]),
      ("seq.hold_rest", "seq", "HOLD / REST", "boolean", "Holds the current step in playback; enters a rest in editing. SHIFT mutes.", "S2", BTN("red")),
      ("seq.reset_accent", "seq", "RESET / ACCENT", "boolean", "Returns to step 1 in playback; adds an accent in editing. SHIFT accents all steps.", "S3", BTN("red")),
      ("arp.on", "arp", "ARP (SET END)", "boolean", "Starts the arpeggiator; with HOLD it latches. With SHIFT, sets the pattern end step.", "S4", BTN("red")),
      ("seq.pattern", "seq", "PATTERN (BANK)", "integer", "Selects the pattern 1 to 8; with SHIFT, the bank 1 to 8.", "S5", BTN("red")),
      ("seq.shift", "seq", "SHIFT", "boolean", "Reaches secondary functions.", "S6", BTN("red")),
      ("seq.page", "seq", "PAGE", "integer", "Pages 1 to 4 of eight steps.", "S7", BTN("red")),
      ("seq.play", "seq", "PLAY / STOP", "boolean", "Starts or stops playback; held with SHIFT, starts saving.", "S8", BTN("red")),
      ("seq.rec", "seq", "REC", "boolean", "Records a pattern from the keyboard.", "S9", BTN("red")),
      ("seq.kybd_mode", "seq", "KYBD", "boolean", "SHIFT + KYBD: keyboard (record) mode. Steps down through options elsewhere.", "S11", BTN("red")),
      ("seq.step_mode", "seq", "STEP", "boolean", "SHIFT + STEP: step-edit mode. Steps up through options elsewhere.", "S12", BTN("red")),
      ("seq.steps", "seq", "STEP SWITCHES 1-8", "integer", "Select steps, patterns and banks; show playback position.", "S13", BTN("red")),
      ("seq.ratchet", "seq", "GLIDE KNOB (ratchet)", "integer", "In step editing with SHIFT, splits the step into 1 to 4 ratchets.", "S14", [{"type": "panel", "control": "knob", "note": "the GLIDE knob, with SHIFT"}]),
      ("seq.step_glide", "seq", "GLIDE SWITCH (step)", "boolean", "Turns glide on for a step; not needed for ratchet.", "S15", BTN("white"))]
for pid, m, lab, kind, fn, ref, acc in SQ:
    extra = {"range": {"min": 1, "max": {"seq.pattern": 8, "seq.page": 4, "seq.steps": 8, "seq.ratchet": 4}[pid]}} if kind == "integer" else ({"values": ONOFF} if kind == "boolean" else {"panel_scale": S10})
    par(pid, m, lab, kind, fn, ref=ref, access=acc, **extra)
par("arp.mode", "arp", "Arpeggiator order", "enum", "Changed with <KYBD and STEP> while the arpeggiator runs; shown on the LOCATION LEDs.",
    access=[{"type": "gesture", "gesture": "<KYBD or STEP> while the arpeggiator is playing", "when": "any_time"}],
    values=[{"value": 1, "label": "UP 1"}, {"value": 2, "label": "DOWN 1"}, {"value": 3, "label": "DOWN and UP"}, {"value": 4, "label": "RANDOM"},
            {"value": 5, "label": "UP (+1 OCT)"}, {"value": 6, "label": "DOWN (+1 OCT)"}, {"value": 7, "label": "UP (-1 OCT)"}, {"value": 8, "label": "DOWN (-1 OCT)"}])
par("seq.swing", "seq", "SWING", "continuous", "Centre none; down plays only off-beats; up plays only on-beats. Saved with the pattern.",
    access=[{"type": "gesture", "gesture": "SHIFT + TEMPO/GATE LENGTH", "when": "any_time"}], panel_scale={"min": -5, "max": 5}, bipolar=True)
par("seq.gate_length", "seq", "Gate length", "integer", "Per step, 1 to 8; 8 ties to the next step.",
    access=[{"type": "gesture", "gesture": "TEMPO/GATE LENGTH during step editing", "when": "any_time"}], range={"min": 1, "max": 8})

# SysEx-only settings
SXP = [("kbd.device_id", "kbd", "Device ID", "integer", 0x00, "SysEx device ID, 0 to 127; 0 addresses any.", {"range": {"min": 0, "max": 127}, "default": 0}),
       ("kbd.midi_channel", "kbd", "MIDI channel (TX and RX)", "integer", 0x0E, "Separate transmit and receive channels, 0 (any) to 16. Also set in Synthtool.", {"range": {"min": 0, "max": 16}, "default": 1}),
       ("kbd.midi_transpose", "kbd", "MIDI IN transpose", "integer", 0x0F, "0 to 24, where 12 is no transpose (-12 to +12).", {"range": {"min": 0, "max": 24}, "default": 12}),
       ("kbd.velocity", "kbd", "Velocity settings", "integer", 0x10, "Fixed note-on and note-off velocity (0 = dynamic) and velocity curve (0 soft, 1 medium, 2 hard).", {"range": {"min": 0, "max": 127}, "default": 0}),
       ("kbd.bend_range", "kbd", "Pitch bend range", "integer", 0x11, "0 to 24 semitones; default 12 (one octave).", {"range": {"min": 0, "max": 24}, "default": 12}),
       ("voices.key_priority", "voices", "Key priority", "enum", 0x12, "Note priority.", {"values": [{"value": 0, "label": "low"}, {"value": 1, "label": "high"}, {"value": 2, "label": "last"}], "default": 2}),
       ("voices.multi_trigger", "voices", "Multi trigger", "boolean", 0x14, "Retrigger the contours on every new note.", {"values": ONOFF, "default": True}),
       ("mod_bus.curve", "mod_bus", "Modulation curve", "enum", 0x15, "Mod wheel sensitivity curve.", {"values": [{"value": 0, "label": "soft"}, {"value": 1, "label": "medium"}, {"value": 2, "label": "hard"}], "default": 0}),
       ("kbd.zero_cv_note", "kbd", "Note at zero CV", "integer", 0x16, "MIDI note giving 0 V at the PITCH CV output; default C2 (36).", {"range": {"min": 0, "max": 127}, "default": 36}),
       ("clock.midi_clock_out", "clock", "MIDI clock output", "enum", 0x17, "Where MIDI clock is sent.", {"values": DEST, "default": 3}),
       ("clock.ext_polarity", "clock", "External clock polarity", "enum", 0x19, "SYNC IN edge.", {"values": [{"value": 0, "label": "falling"}, {"value": 1, "label": "rising"}], "default": 1}),
       ("clock.sync_rate", "clock", "Sync clock rate", "enum", 0x1A, "Pulses per quarter note on the sync jacks.",
        {"values": [{"value": 0, "label": "1 PPQ (printed '1 PPS')"}, {"value": 1, "label": "2 PPQ"}, {"value": 2, "label": "24 PPQ"}, {"value": 3, "label": "48 PPQ"}], "default": 2}),
       ("clock.source", "clock", "Sync clock source", "enum", 0x1B, "Clock source for the sequencer and arpeggiator.",
        {"values": [{"value": 0, "label": "internal"}, {"value": 1, "label": "DIN"}, {"value": 2, "label": "USB"}, {"value": 3, "label": "TRIG (SYNC IN jack)"}], "default": 0}),
       ("mod_bus.wheel_range", "mod_bus", "Mod wheel range", "integer", 0x20, "0 to 4; default 2 (100%).", {"range": {"min": 0, "max": 4}, "default": 2}),
       ("kbd.out_modwheel", "kbd", "MIDI output: mod wheel", "enum", 0x21, "Where mod wheel MIDI goes.", {"values": DEST, "default": 3}),
       ("kbd.out_pitchwheel", "kbd", "MIDI output: pitch wheel", "enum", 0x22, "Where pitch wheel MIDI goes.", {"values": DEST, "default": 3}),
       ("kbd.out_keyboard", "kbd", "MIDI output: keyboard", "enum", 0x23, "Where keyboard notes go.", {"values": DEST, "default": 3}),
       ("kbd.out_aftertouch", "kbd", "MIDI output: aftertouch", "enum", 0x24, "Where aftertouch goes.", {"values": DEST, "default": 3}),
       ("seq.midi_out", "seq", "MIDI output: sequencer", "enum", 0x25, "Where sequencer notes go.", {"values": DEST, "default": 3}),
       ("arp.midi_out", "arp", "MIDI output: arpeggiator", "enum", 0x26, "Where arpeggiator notes go.", {"values": DEST, "default": 3})]
for pid, m, lab, kind, pk, fn, extra in SXP:
    par(pid, m, lab, kind, fn, access=[sx(pk), {"type": "app", "note": "Synthtool.exe"}], **extra)
par("kbd.calibration", "kbd", "Wheel and aftertouch calibration mode", "boolean",
    "Hidden service mode: hold KYBD + STEP while powering on, then press 3 while the LEDs run. Step switches 1 to 5 calibrate pitch wheel range and dead zone, mod wheel range, and aftertouch minimum and maximum. SHIFT + STEP saves; SHIFT + KYBD cancels.",
    access=[{"type": "gesture", "gesture": "hold KYBD + STEP at power on, then press step 3", "when": "power_on"}], values=ONOFF)
D["parameters"] = P

# ports ---------------------------------------------------------------------
jack("jack.phones", "PHONES", 38, "top", "out", "audio", "output.phones", "Headphones.", connector="6.35mm TRS", electrical={"max_level_dbu": -4, "impedance_ohm": 110})
jack("jack.dc_in", "DC INPUT", 40, "rear", "in", "power", None, "12 V DC, 1000 mA adaptor.", connector="barrel", electrical={"voltage_v": 12, "current_ma": 1000})
jack("jack.usb", "USB", 41, "rear", "bidirectional", "midi", None, "Class-compliant USB MIDI in and out.", connector="USB-B")
jack("jack.midi_in", "MIDI IN", 42, "rear", "in", "midi", None, "MIDI in.", connector="DIN-5")
jack("jack.midi_out", "MIDI OUT", 42, "rear", "out", "midi", None, "MIDI out: keyboard, wheels, aftertouch, sequencer, arpeggiator and clock, each routable by SysEx.", connector="DIN-5")
jack("jack.midi_thru", "MIDI THRU", 42, "rear", "out", "midi", None, "Passes MIDI IN.", connector="DIN-5")
jack("jack.aftertouch_out", "AFTER PRESSURE", 44, "rear", "out", "cv", "kbd.aftertouch", "Aftertouch CV, scaled by its trim.", electrical={"min_v": 0, "max_v": 5})
jack("jack.pitch_out", "PITCH", 45, "rear", "out", "cv", "kbd.note", "Pitch CV; C2 is 0 V by default.", electrical={"min_v": -3, "max_v": 7, "scaling": "1 V/octave"}, confidence="inferred",
     note="1 V/octave is inferred from the -3 to +7 V range spanning the keyboard; the guide states only the zero-volt note.")
jack("jack.vtrig_out", "V-TRIG", 46, "rear", "out", "gate", "kbd.trig", "Trigger voltage when a note is played.", electrical={"level_v": 5})
jack("jack.velocity_out", "VELOCITY", 47, "rear", "out", "cv", "kbd.velocity", "Velocity CV, scaled by its trim.", electrical={"min_v": 0, "max_v": 5})
jack("jack.ext_in", "EXT SIGNAL IN", 49, "rear", "in", "audio", "mixer.in_ext", "External line-level audio into the mixer.", electrical={"impedance_ohm": 1000000})
jack("jack.sync_in", "SYNC IN", 50, "rear", "in", "clock", "clock.sync_in", "External sync or clock; rate and polarity set by SysEx.", electrical={"level_v": 5})
jack("jack.sync_out", "SYNC OUT", 51, "rear", "out", "clock", "clock.out", "Internal sync or clock.", electrical={"level_v": 5})
jack("jack.out_l", "MAIN OUTPUT L", 52, "rear", "out", "audio", "output.left", "Left main output.", connector="6.35mm TRS servo-balanced", electrical={"max_level_dbu": -16, "impedance_ohm": 100})
jack("jack.out_r", "MAIN OUTPUT R", 52, "rear", "out", "audio", "output.right", "Right main output.", connector="6.35mm TRS servo-balanced", electrical={"max_level_dbu": -16, "impedance_ohm": 100})
jack("jack.ext_vtrig", "EXT V-TRIGGER INPUT", 53, "rear", "in", "gate", "kbd.ext_trig_in", "External trigger for both contours.", combine="sum", electrical={"level_v": 5}, confidence="inferred")
jack("jack.loudness_cv", "LOUDNESS", 54, "rear", "in", "cv", "vca.cv_in", "External CV or expression pedal on the loudness contour.", connector="6.35mm TRS", electrical={"min_v": 0, "max_v": 5})
jack("jack.filter_cv", "FILTER", 55, "rear", "in", "cv", "vcf.cv_in", "External CV or expression pedal on cutoff.", connector="6.35mm TRS", electrical={"min_v": 0, "max_v": 5, "scaling": "1 V/octave"}, combine="sum", confidence="inferred")
jack("jack.osc_cv", "OSCILLATOR", 56, "rear", "in", "cv", "pitch.cv_in", "External CV or expression pedal on all four oscillators' frequency.", connector="6.35mm TRS", electrical={"min_v": -5, "max_v": 5}, combine="sum", confidence="inferred")
jack("jack.mod_source", "MOD SOURCE", 57, "rear", "in", "cv", "mod_bus.noise_in", "External modulation source; replaces noise in the modulation mix when patched.", combine="replace")
D["ports"] = J

# connections ---------------------------------------------------------------
con("c01", "kbd.note", "voices.note_in", "cv", "fixed")
con("c02", "kbd.gate", "voices.gate_in", "gate", "fixed")
con("c03", "kbd.note", "arp.notes_in", "cv", "switched", enabled_when={"param": "arp.on", "equals": True})
con("c04", "arp.notes_out", "voices.note_in", "cv", "switched", enabled_when={"param": "arp.on", "equals": True})
con("c05", "kbd.note", "seq.notes_in", "cv", "switched", enabled_when={"param": "seq.rec", "equals": True})
con("c06", "seq.notes_out", "voices.note_in", "cv", "switched", enabled_when={"param": "seq.play", "equals": True})
con("c07", "clock.out", "seq.clock_in", "clock", "fixed", amount="seq.tempo")
con("c08", "clock.out", "arp.clock_in", "clock", "fixed")
for n in (1, 2, 3, 4):
    con(f"c1{n}", f"voices.pitch{n}", f"pitch.in{n}", "cv", "fixed", amount="pitch.glide", note="Glide applies when GLIDE ON/OFF is on.")
    kw = {"enabled_when": {"param": "pitch.osc4_control", "equals": True}} if n == 4 else {}
    con(f"c2{n}", f"pitch.to_osc{n}", f"osc{n}.pitch_in", "cv", "switched" if n == 4 else "fixed", amount=f"osc{n}.frequency" if n > 1 else "pitch.tune", **kw)
    con(f"c3{n}", "mod_bus.out", f"osc{n}.mod_in", "cv", "switched", enabled_when={"param": "mod_bus.osc_mod", "equals": True},
        **({"note": "OSC 4 is also exempt from modulation when OSC 4 CONTROL is off."} if n == 4 else {}))
    con(f"c4{n}", f"osc{n}.out", f"mixer.in{n}", "audio", "switched", enabled_when={"param": f"mixer.on{n}", "equals": True}, amount=f"mixer.vol{n}")
con("c50", "kbd.bend", "pitch.bend_in", "cv", "fixed", amount="kbd.pitch_wheel")
con("c51", "osc4.out", "mod_bus.osc4_in", "cv", "switched", enabled_when={"param": "mod_bus.src_a", "equals": "osc4"})
con("c52", "filter_env.out", "mod_bus.feg_in", "cv", "switched", enabled_when={"param": "mod_bus.src_a", "equals": "filter_eg"})
con("c53", "noise.out", "mod_bus.noise_in", "cv", "normalled", broken_by="jack.mod_source",
    note="Noise is the default; used when the NOISE (MOD SRC)/LFO switch is at NOISE.")
con("c54", "lfo.out", "mod_bus.lfo_in", "cv", "switched", enabled_when={"param": "mod_bus.src_b", "equals": "lfo"})
con("c55", "kbd.mod_wheel", "mod_bus.wheel_in", "cv", "fixed", amount="kbd.mod_wheel")
con("c60", "noise.out", "mixer.in_noise", "audio", "switched", enabled_when={"param": "mixer.noise_on", "equals": True}, amount="mixer.noise_vol")
con("c61", "mixer.out", "vcf.in", "audio", "fixed")
con("c62", "filter_env.out", "vcf.env_in", "cv", "fixed", amount="vcf.contour_amount")
con("c63", "pitch.to_osc1", "vcf.kbd_in", "cv", "switched", enabled_when={"param": "vcf.kbd_control", "not_equals": 0},
    note="Which note drives tracking in POLY mode is not stated; OSC 1's pitch is assumed.", confidence="inferred")
con("c64", "mod_bus.out", "vcf.mod_in", "cv", "switched", enabled_when={"param": "mod_bus.filter_mod", "equals": True})
con("c65", "voices.gate", "filter_env.gate_in", "gate", "fixed")
con("c66", "voices.gate", "loud_env.gate_in", "gate", "fixed")
con("c67", "vcf.out", "vca.in", "audio", "fixed")
con("c68", "loud_env.out", "vca.env_in", "cv", "fixed")
con("c69", "vca.out", "distortion.in", "audio", "fixed", note="Distortion bypassed when off.")
con("c70", "distortion.out", "chorus.in", "audio", "fixed", note="Chorus bypassed when off; order of distortion and chorus follows the panel, left to right.", confidence="inferred")
con("c71", "chorus.left", "output.left_in", "audio", "fixed", amount="output.volume")
con("c72", "chorus.right", "output.right_in", "audio", "fixed", amount="output.volume")
D["connections"] = C

D["indicators"] = [
    {"id": "mixer.overload_led", "module": "mixer", "label": "OVERLOAD", "kind": "led", "led_colour": "red", "manual_ref": 25, "function": "Lights when the external input is overloading the mixer."},
    {"id": "lfo.rate_led", "module": "lfo", "label": "LFO rate", "kind": "led", "led_colour": "red", "manual_ref": None, "function": "Blinks at the LFO rate."},
    {"id": "output.power_led", "module": "output", "label": "POWER", "kind": "led", "led_colour": "multi", "manual_ref": 39,
     "function": "Lit when powered on (amber). Blinks red in the wheel and aftertouch calibration mode."},
    {"id": "osc.range_leds", "module": "voices", "label": "Oscillator LEDs", "kind": "led", "led_colour": "red", "manual_ref": None,
     "function": "One red LED beside each oscillator's RANGE knob. Not described; likely shows which oscillators are sounding in POLY mode.", },
    {"id": "seq.location_leds", "module": "seq", "label": "LOCATION 1-8", "kind": "led", "led_colour": "multi", "manual_ref": "S10",
     "function": "Multi-coloured LEDs for pattern, bank, page, gate length, ratchet and step flags."},
    {"id": "seq.step_leds", "module": "seq", "label": "STEP 1-8", "kind": "led", "led_colour": "red", "manual_ref": "S13",
     "function": "Active steps steady red, current step flashing."},
]
D["led_legend"] = {
    "rule": "Two colour systems. The sequencer's LOCATION LEDs use colour for what they are showing: green in keyboard mode and "
            "for pages, patterns and saving; yellow in step mode and for ratchet counts; red for gate length. In step editing, "
            "individual LOCATION LEDs flag step properties: 5 glide, 6 ratchet, 7 accent, 8 rest. Separately, the backlit panel "
            "switches are coloured by function group: orange for signal on/off (mixer sources, distortion, chorus), teal for the "
            "filter, white for pitch and modulation routing and the DECAY switch, green for voice mode, yellow for the chorus modes.",
    "colours": [
        {"colour": "green", "meaning": "LOCATION: keyboard mode, page, pattern, bank; switches: voice mode and auto damp"},
        {"colour": "yellow", "meaning": "LOCATION: step mode, ratchet count; switches: chorus I and II"},
        {"colour": "red", "meaning": "LOCATION: gate length; step LEDs and sequencer buttons; power LED in calibration mode"},
        {"colour": "amber", "meaning": "power on"},
    ],
    "exceptions": ["The backlit switch groupings (orange, teal, white) are read from the panel photograph and are not documented."],
    "confidence": "stated",
    "note": "LOCATION colours from the sequencer chapter; power LED red from the calibration bulletin; switch colours from the panel.",
}

D["behaviours"] = [
    {"id": "b01", "name": "Paraphonic, not polyphonic", "applies_to": ["voices", "vcf", "vca", "filter_env", "loud_env"],
     "rule": "In POLY mode each new note takes the next oscillator: one note plays OSC 1, two notes OSC 1 and 2, up to four. All four "
             "share one filter, one filter contour, one loudness contour and one VCA. The contours retrigger on new notes (multi-trigger "
             "is on by default), so chords play through a single envelope. The specifications call this '4 voices polyphonic'."},
    {"id": "b02", "name": "Auto damp", "applies_to": ["voices"],
     "rule": "Off: releasing some notes of a chord leaves them all sounding until every note is released or a new one played. On: "
             "released notes stop and only held notes continue. This exists because the shared envelope cannot release notes individually."},
    {"id": "b03", "name": "Minimoog modulation bus", "applies_to": ["mod_bus", "osc4", "lfo", "noise", "filter_env"],
     "rule": "Two switches pick a source each (OSC 4 or filter contour; noise/MOD SOURCE jack or LFO), MODULATION MIX crossfades "
             "them, the mod wheel sets depth, and two switches send the result to the oscillators and the filter. Setting OSC 4 to LO, "
             "freeing it with OSC 4 CONTROL off and selecting it here makes it a second LFO, as on the Minimoog."},
    {"id": "b04", "name": "Decay switch", "applies_to": ["loud_env", "filter_env"],
     "rule": "The contours are attack, decay, sustain. With DECAY on, release takes the DECAY TIME; off, release is instant. Minimoog "
             "behaviour, applying to both contours.", "confidence": "inferred"},
    {"id": "b05", "name": "Keyboard tracking in thirds", "applies_to": ["vcf"],
     "rule": "Two switches: neither for no tracking, 1 for a third of full, 2 for two thirds, both for full."},
    {"id": "b06", "name": "Effects chain", "applies_to": ["distortion", "chorus", "output"],
     "rule": "After the VCA: distortion (drive, tone, level) and a BBD stereo chorus with modes I, II or both. The chorus turns the mono "
             "voice into the stereo output. Their order is not stated; the panel runs distortion then chorus.", "confidence": "inferred"},
    {"id": "b07", "name": "Sequencer", "applies_to": ["seq", "clock"],
     "rule": "Up to 32 steps in four pages of eight, 64 patterns in 8 banks. Per step: note, rest, gate length 1 to 8 (8 ties), accent, "
             "glide and ratchet 1 to 4. Per pattern: swing, from off-beats only through straight to on-beats only. Keyboard mode "
             "records; step mode edits but cannot save until switched back. Live, SHIFT with the same controls applies ratchet, swing, "
             "mute or accent to the whole pattern without saving."},
    {"id": "b08", "name": "Arpeggiator", "applies_to": ["arp"],
     "rule": "Eight orders (up, down, down and up, random, and up or down with an octave added or removed), at the TEMPO rate, with HOLD "
             "to latch. Order is changed with <KYBD and STEP> while playing."},
    {"id": "b09", "name": "Clocking", "applies_to": ["clock", "seq", "arp"],
     "rule": "Clock source is internal, DIN, USB or the SYNC IN jack, at 1, 2, 24 or 48 PPQ, rising or falling edge; all SysEx settings "
             "with defaults of internal, 24 PPQ, rising. MIDI clock is sent to DIN and USB by default."},
    {"id": "b10", "name": "Calibration", "applies_to": ["osc1", "osc2", "osc3", "osc4", "kbd"],
     "rule": "Each oscillator has RANGE and SCALE trimpots on the rear panel, tuned at A5 and A2 against a tuner with the instrument warm "
             "for 30 minutes, plus an octave-range trimpot matched by ear at C6. The wheels and aftertouch have a firmware calibration "
             "mode reached at power-on."},
]

D["midi"] = {
    "receives": ["note_on", "note_off", "velocity", "channel_aftertouch", "pitch_bend", "mod_wheel", "midi_clock", "sysex"],
    "transmits": ["keyboard notes", "aftertouch", "pitch and mod wheels", "sequencer and arpeggiator notes", "midi_clock", "each routable to DIN, USB, both or off by SysEx"],
    "channel": {"range": [0, 16], "set_by": "Synthtool.exe or SysEx; separate TX and RX channels; 0 is any"},
    "sysex": {"format": "F0 00 20 32 00 01 0C <device id> <packet> <payload> F7", "model_id": "00 01 0C",
              "note": "Packets recorded on each SysEx-only parameter. Packet 0x7D restores factory settings."},
    "cc_map": None, "nrpn": None,
    "usb": {"class_compliant": True, "os": "Windows XP or higher, Mac OS X 10.6.8 or higher"},
    "app": "Synthtool.exe",
}
D["specifications"] = {
    "voices": "4, mono / unison / poly (paraphonic)", "oscillators": {"count": 4, "range_hz": [0.1, 20000], "ranges": 6},
    "lfo_hz": [0.05, 200], "vcf": "1 x low / high pass, 24 dB/octave", "envelopes": {"attack_s": [0.001, 10], "decay_s": [0.004, 35]},
    "sequencer": {"steps": 32, "patterns": 64, "banks": 8}, "keyboard": "37 semi-weighted full-size keys with velocity and aftertouch",
    "outputs": {"main": "2 x 1/4-inch TRS servo-balanced, max -16 dBu, 100 ohm", "phones": "1/4-inch TRS, -4 dBu, 110 ohm"},
    "cv_inputs_v": {"loudness": [0, 5], "filter": [0, 5], "oscillator": [-5, 5]},
    "cv_outputs_v": {"aftertouch": [0, 5], "pitch": [-3, 7], "v_trigger": 5, "velocity": [0, 5]},
    "power": {"adaptor": "12 V DC, 1000 mA", "consumption_w_max": 10},
    "dimensions_mm": {"h": 90, "w": 648, "d": 361}, "weight_kg": 10.2, "operating_temperature_c": {"min": 5, "max": 45},
}
D["omitted_from_source"] = ["safety and legal text in several languages", "warranty and compliance declarations", "hook-up diagrams",
                            "non-English duplicates", "the patch sheet", "the calibration bulletins' step-by-step screenshots"]
D["not_in_source"] = [
    "what the red LEDs beside the four RANGE knobs show",
    "which oscillator's pitch drives filter keyboard tracking in POLY mode",
    "the order of distortion and chorus in the signal path",
    "whether the DECAY switch governs the filter contour as well as the loudness contour",
    "the filter cutoff range in Hz and resonance behaviour, including self-oscillation",
    "whether the CV inputs sum with the panel controls or replace them",
    "the pulse widths of the wide and narrow pulse waveforms",
    "a CC map; the guide covers SysEx only",
    "the mod wheel range values 0 to 4 other than 2 (100%)",
]
D["source_inconsistencies"] = [
    "The specifications describe '4 voices polyphonic'; the controls describe one filter, one pair of contours and one VCA, so the instrument is paraphonic.",
    "The specifications list 'Amount of contour' under the loudness contour; the panel and controls have no such control there.",
    "SysEx packet 0x1A lists '1 PPS', read as 1 PPQ alongside 2, 24 and 48 PPQ.",
    "SysEx packet 0x0F gives the MIDI transpose default as [1], while its note says 12 is no transpose.",
    "SysEx packet 0x19 prints 'RISSING'.",
    "Item 14 says TUNE adjusts oscillators 1 to 4; the specifications give it as -2 to +2 and the getting-started chapter says the TUNE and OSC 2 to 4 FREQUENCY knobs are marked in semitones.",
    "Item 25 says OVERLOAD warns about the EXT IN volume; the Spanish text says it shows the mixer overloading.",
    "The sequencer control list numbers 1 to 15 restart the main numbering, and the item for SEQUENCER (35) points to pages 15 and 38, which are not where the sequencer chapter is.",
]
D["modelling_gaps"] = [
    {"topic": "Filter", "detail": "A Minimoog ladder with a Behringer-added high-pass mode. No cutoff range, resonance law or self-oscillation statement."},
    {"topic": "Paraphonic envelope behaviour", "detail": "How the shared contours respond to overlapping notes depends on multi-trigger and auto damp; the exact rules for legato chords are not documented."},
    {"topic": "Oscillator tapers", "detail": "Frequency offsets are marked in semitones; the knob law between the marks is not given."},
    {"topic": "Effects", "detail": "Distortion and chorus are described only by their controls. Retailers describe the distortion as modelled on a Boss DS-1; not in these sources."},
    {"topic": "Original instrument", "detail": "No Minimoog documentation was supplied; it would settle the filter, contour curves and oscillator behaviour."},
]

# ---------------------------------------------------------------------------
# Online research, 24 September 2026. Every fact from these sources is marked
# inferred and cites its source id.
# ---------------------------------------------------------------------------
D["device"]["sources"] += [
    {"id": "sonicstate", "title": "Sonic State, 'Sonic LAB: Behringer Poly D' (25 November 2019), with Behringer's design Q&A",
     "kind": "other", "file": "https://sonicstate.com/news/2019/11/25/sonic-lab-behringer-poly-d-4-voice-analog-/",
     "note": "Hands-on review plus Behringer's answers: the voice logic is adapted from the Korg Mono/Poly. Source for how UNISON divides oscillators."},
    {"id": "mamosa", "title": "Mamosa synth notes: Behringer Poly D", "kind": "other",
     "file": "http://www.mamosa.org/jenfi.home/english/behringerpolyd_EN.php", "note": "Owner's walkthrough. Source for the RANGE LED meaning."},
    {"id": "forums", "title": "Gearspace Poly D threads and Sweetwater owner reviews", "kind": "other",
     "file": "https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/1288438-behringer-poly-d-warp-drive-108.html",
     "note": "Owner reports on the effects chain and POLY mode behaviour."},
]
byid = {p["id"]: p for p in P}
M_by = {m["id"]: m for m in M}

byid["voices.mode"]["values"] = [
    {"value": "mono", "label": "MONO", "meaning": "all oscillators that are on play one note"},
    {"value": "unison", "label": "UNI", "meaning": "oscillators shared among held notes: one note gets all four, two notes two each, four notes one each"},
    {"value": "poly", "label": "POLY", "meaning": "one oscillator per note, up to four, in order"}]
byid["voices.mode"]["note"] = ("UNI behaviour from Sonic State's review, where Behringer says the voice logic is adapted from the Korg Mono/Poly; the "
                               "guide describes only POLY. How three notes are divided in UNI is not stated.")
byid["voices.mode"]["confidence"] = "inferred"
M_by["voices"]["description"] = (
    "Assigns notes to the four oscillators, using logic Behringer says it adapted from the Korg Mono/Poly. MONO: every oscillator that "
    "is switched on plays one note. UNISON: the oscillators are shared among the notes held, all four on one note, two each on two, one "
    "each on four. POLY: the first note takes OSC 1, the next OSC 2, up to four. Key priority and multi-trigger are SysEx settings. AUTO "
    "DAMP decides whether released chord notes keep sounding until the next note.")

led = next(i for i in D["indicators"] if i["id"] == "osc.range_leds")
led["function"] = "One red LED beside each oscillator's RANGE knob, showing that oscillator's activity, so in POLY or UNISON you can see which oscillators the current notes have taken."
led["function"] += " Meaning from an owner's walkthrough (mamosa.org); not documented by Behringer."

c70 = next(c for c in C if c["id"] == "c70")
c70["note"] = ("Distortion before chorus. The panel reads left to right that way and a Gearspace owner presumes the same; no source states it. "
               "Behringer calls the whole path, effects included, pure analogue.")
M_by["distortion"]["description"] = ("Drive, tone and level, switchable in or out. Described by Wikipedia and owners as derived from the Boss DS-1 "
                                     "circuit, and by Sonic State as Neutron-style; unlike the Neutron, TONE has no effect without some drive.")
M_by["chorus"]["description"] = ("BBD stereo chorus with two modes, usable together, closely modelled on the Juno-60 chorus (an owner compared "
                                 "the two directly); the stereo spread is reportedly wider than the Juno's. Mono in, stereo out. The low "
                                 "-16 dBu main output level is attributed by owners to the chorus stage.")

D["behaviours"].append({
    "id": "b11", "name": "POLY needs the oscillators switched on", "applies_to": ["voices", "mixer"],
    "rule": "Because POLY hands each note to a specific oscillator, a note assigned to an oscillator whose mixer switch is off is silent. "
            "For full four-note chords all four oscillators must be on; owners describe this as the most common surprise with the instrument.",
    "confidence": "inferred", "note": "From Sweetwater owner reviews; follows from the guide's description of POLY."})
b06 = next(b for b in D["behaviours"] if b["id"] == "b06")
b06["rule"] = ("After the VCA: distortion (drive, tone, level; DS-1 derived) then a BBD stereo chorus modelled on the Juno-60, with modes I, "
               "II or both. The chorus turns the mono voice into the stereo output. The order is inferred from the panel and one owner's "
               "presumption; Behringer has not documented it.")

D["not_in_source"] = [
    "which oscillator's pitch drives filter keyboard tracking in POLY and UNISON; not found in the guide or online",
    "a confirmed order of distortion and chorus; inferred from the panel layout only",
    "how UNISON divides the oscillators among three held notes",
    "whether the DECAY switch governs the filter contour as well as the loudness contour",
    "the filter cutoff range in Hz and resonance behaviour, including self-oscillation",
    "whether the CV inputs sum with the panel controls or replace them",
    "the pulse widths of the wide and narrow pulse waveforms",
    "a CC map; the guide covers SysEx only",
    "the mod wheel range values 0 to 4 other than 2 (100%)",
]
D["source_inconsistencies"].append(
    "The guide describes UNISON only by name; Wikipedia and Sonic State describe it as dividing the oscillators among held notes, while "
    "Sweetwater's support article says it triggers all oscillators that are on, which matches only the single-note case.")

with open("/mnt/user-data/outputs/behringer-poly-d.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
