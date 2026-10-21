#!/usr/bin/env python3
"""Assemble the Behringer WASP Deluxe device file."""
import json

D = {"schema_version": "0.7.0"}
D["device"] = {
    "id": "behringer-wasp-deluxe", "manufacturer": "Behringer", "model": "WASP Deluxe",
    "category": "monophonic hybrid synthesizer (digital oscillators, analogue filter and VCA), desktop / Eurorack (70 HP)",
    "based_on": "EDP (Electronic Dream Plant) Wasp Deluxe, UK, late 1970s. The guide never names EDP; the layout, the digitally "
                "generated oscillators, the multimode filter and the repeat envelopes are the Wasp's.",
    "sources": [
        {"id": "wasp", "title": "WASP DELUXE Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_WASP-DELUXE_Manual.pdf",
         "pages": 29,
         "note": "37 numbered controls with one-line descriptions (pages 17 to 19), a getting-started chapter, a SysEx data format and "
                 "command examples table, and a short specifications table. Two panel knobs and two panel jacks are not numbered."},
        {"id": "panel", "title": "WASP Deluxe front panel image", "kind": "measurement", "file": "behringer-wasp_deluxe.jpg",
         "note": "Source for the two FILTER CONTROL knobs, the OSC1 and OSC2 output jacks, the REPEAT ends of the envelope knobs and "
                 "the WIDTH and FT scales."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid",
    "signal_path_note": "digitally controlled oscillators feeding an analogue multimode filter and VCA",
    "voices": 1, "polyphony_mode": "monophonic; poly chain across units", "poly_chain_max_units": 16,
    "patch_memory": False, "semi_modular": False,
    "panel_counts": {"knobs": 26, "switches": 1, "jacks_3_5mm": 5},
    "summary": (
        "Two oscillators, each off, sawtooth, square or ENH, pitched in foot ranges from 32' to 2', with a pulse width control on "
        "the upper oscillator and a relative PITCH control on the lower. A mixer blends the two oscillators, white noise and an "
        "external input, which with nothing patched carries the WASP's own output back in for feedback. One multimode filter "
        "(low-pass, band-pass, notch, high-pass) whose Q sets slope in the pass modes and width in the band modes. A control "
        "oscillator (LFO, 0.5 to 100 Hz, six shapes including noise and random) modulates oscillator pitch and, through a bipolar "
        "knob, the filter. Two envelopes: a VCA envelope with attack, decay and a sustain knob that turns into a repeat at its end "
        "stop, plus a HOLD switch; and a control envelope for the filter with attack, decay and a delay that also becomes a "
        "repeat, reaching the filter through its own bipolar knob."
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
    for k in ("confidence", "note"):
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


S10 = {"min": 0, "max": 10}
BI = {"min": -5, "max": 5}
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
SYSEX = lambda main, note=None: {"type": "sysex", "message": f"F0 00 20 32 00 <dev> 0A {main:02X} <value> F7", **({"note": note} if note else {})}
FEET = [{"value": "32'"}, {"value": "16'"}, {"value": "8'"}, {"value": "4'"}, {"value": "2'"}]
WAVES = [{"value": "off", "label": "OFF", "meaning": "oscillator silent"}, {"value": "saw", "label": "sawtooth"},
         {"value": "square", "label": "square"}, {"value": "enh", "label": "ENH", "meaning": "enhanced: adds punch, bite and clarity"}]

# modules -------------------------------------------------------------------
mod("kbd", "midi_to_cv", "MIDI interface", "MIDI", "MIDI note, gate and pitch bend. No keyboard on this model.", [], ["kbd.note", "kbd.gate", "kbd.bend"])
mod("pitch", "pitch_control", "Keyboard section", "KEYBOARD", "Bend, tune and glide applied to the note pitch before both oscillators.",
    ["pitch.note_in", "pitch.bend_in"], ["pitch.to_osc1", "pitch.to_osc2"])
mod("osc1", "oscillator", "Upper oscillator (OSC 1)", "OSCILLATORS",
    "Digitally controlled oscillator: off, sawtooth, square or ENH, pitched in five foot ranges, with a pulse WIDTH control from 10% to 50%.",
    ["osc1.pitch_in", "osc1.pm_in"], ["osc1.out"], {"waveforms": ["saw", "square", "enh"], "ranges": ["32'", "16'", "8'", "4'", "2'"], "digital": True})
mod("osc2", "oscillator", "Lower oscillator (OSC 2)", "OSCILLATORS",
    "Digitally controlled oscillator: off, sawtooth, square or ENH, five foot ranges, and a PITCH control that sets its interval against OSC 1.",
    ["osc2.pitch_in", "osc2.pm_in"], ["osc2.out"], {"waveforms": ["saw", "square", "enh"], "ranges": ["32'", "16'", "8'", "4'", "2'"], "digital": True})
mod("noise", "noise", "Noise", "OSCILLATORS / MIX", "White noise, mixed by NOISE SIGNAL.", [], ["noise.out"])
mod("mixer", "mixer", "Mix", "OSCILLATORS / MIX", "Levels for OSC 1, OSC 2, EXT and NOISE, summed into the filter.",
    ["mixer.in_osc1", "mixer.in_osc2", "mixer.in_ext", "mixer.in_noise"], ["mixer.out"])
mod("ctrl_osc", "lfo", "Control oscillator", "CONTROL OSC",
    "A modulation oscillator that makes no sound itself: sine, rising sawtooth, falling sawtooth, square, noise or random, 0.5 to 100 Hz. "
    "Drives oscillator pitch through PITCH MOD and the filter through its FILTER CONTROL knob.",
    [], ["ctrl_osc.out"], {"rate_hz": {"min": 0.5, "max": 100},
                           "shapes": ["sine", "rising_saw", "falling_saw", "square", "noise", "random"]})
mod("vcf", "filter", "Filter", "FILTER",
    "Multimode filter: low-pass, band-pass, notch or high-pass. Q sets slope in low-pass and high-pass, and width in band-pass and notch. "
    "Cutoff modulated bipolarly by the control oscillator and the control envelope.",
    ["vcf.in", "vcf.osc_mod_in", "vcf.env_mod_in"], ["vcf.out"], {"modes": ["lowpass", "bandpass", "notch", "highpass"]})
mod("vca_env", "envelope", "VCA envelope", "ENVELOPE GENERATORS / VCA ENV",
    "Attack, decay and sustain; decay also sets the fade after release. At its fully counter-clockwise end the sustain knob switches the "
    "envelope into repeat, cycling at the attack and decay times. HOLD freezes the envelope where it is.",
    ["vca_env.gate_in"], ["vca_env.out"], {"stages": ["attack", "decay (also release)", "sustain"], "repeat": True})
mod("ctrl_env", "envelope", "Control envelope", "ENVELOPE GENERATORS / CONTROL ENV",
    "Attack and decay for the filter, with a delay of up to 1 s before the attack starts. The delay knob's other end is REPEAT.",
    ["ctrl_env.gate_in"], ["ctrl_env.out"], {"stages": ["delay", "attack", "decay"], "delay_s": {"min": 0, "max": 1}, "repeat": True})
mod("vca", "vca", "VCA", "ENVELOPE GENERATORS", "Output amplifier opened by the VCA envelope.", ["vca.in", "vca.env_in"], ["vca.out"])
mod("output", "output", "Output", "OUTPUT", "Volume to the MAIN AUDIO and rear outputs; separate headphone level.",
    ["output.in"], ["output.main", "output.phones", "output.high", "output.low"])
D["modules"] = M

# parameters ----------------------------------------------------------------
par("pitch.bend", "pitch", "BEND", "continuous", "Bends the keyboard pitch up (clockwise) or down.", ref=1, panel_scale=BI, bipolar=True)
par("pitch.tune", "pitch", "TUNE", "continuous", "Fine tuning of the keyboard pitch.", ref=2, panel_scale=BI, bipolar=True)
par("pitch.glide", "pitch", "GLIDE", "continuous", "Glide rate between notes; clockwise is slower.", ref=3, panel_scale=S10)
par("osc1.ft", "osc1", "FT (upper)", "enum", "Foot range of the upper oscillator.", ref=4, values=FEET,
    access=[{"type": "panel", "control": "rotary_switch"}])
par("osc1.width", "osc1", "WIDTH %", "continuous", "Pulse width of the upper oscillator's square, 10% to 50%.", ref=5,
    panel_scale={"min": 10, "max": 50, "unit": "%"}, physical={"min": 10, "max": 50, "unit": "% duty"},
    note="The guide says 'the width of the oscillator's sound'. Whether it also affects OSC 2 or the ENH shape is not stated.")
par("osc1.waveform", "osc1", "WAVEFORM (upper)", "enum", "Upper oscillator waveform, or off.", ref=6, values=WAVES, access=[{"type": "panel", "control": "rotary_switch"}])
par("osc2.ft", "osc2", "FT (lower)", "enum", "Foot range of the lower oscillator.", ref=7, values=FEET, access=[{"type": "panel", "control": "rotary_switch"}])
par("osc2.pitch", "osc2", "PITCH", "continuous", "Pitch of the lower oscillator against the upper, for intervals and detuning. Span not stated.", ref=8, panel_scale=S10)
par("osc2.waveform", "osc2", "WAVEFORM (lower)", "enum", "Lower oscillator waveform, or off.", ref=9, values=WAVES, access=[{"type": "panel", "control": "rotary_switch"}])
par("mixer.osc1", "mixer", "MIX OSC 1", "continuous", "Level of the upper oscillator.", ref=10, panel_scale=S10)
par("mixer.osc2", "mixer", "MIX OSC 2", "continuous", "Level of the lower oscillator.", ref=10, panel_scale=S10)
par("mixer.ext", "mixer", "EXT", "continuous", "Level of the EXT audio input, or with nothing patched, of the WASP's own output fed back.", ref=11, panel_scale=S10)
par("mixer.noise", "mixer", "NOISE SIGNAL", "continuous", "White noise level.", ref=12, panel_scale=S10)
par("ctrl_osc.freq", "ctrl_osc", "FREQ", "continuous", "Control oscillator speed.", ref=13, panel_scale=S10, physical={"min": 0.5, "max": 100, "unit": "Hz", "taper": "unknown"})
par("ctrl_osc.pitch_mod", "ctrl_osc", "PITCH MOD", "continuous",
    "Depth of control oscillator modulation on oscillator pitch. The guide words it as varying the pitch difference between the oscillators.", ref=14, panel_scale=S10)
par("ctrl_osc.waveform", "ctrl_osc", "WAVEFORM (control)", "enum", "Control oscillator shape.", ref=15, access=[{"type": "panel", "control": "rotary_switch"}],
    values=[{"value": "sine"}, {"value": "rising_saw"}, {"value": "falling_saw"}, {"value": "square"}, {"value": "noise", "label": "NOISE"},
            {"value": "random", "label": "RND"}])
par("vcf.freq", "vcf", "FREQ", "continuous", "Filter cutoff or centre frequency.", ref=16, panel_scale=S10)
par("vcf.q", "vcf", "Q", "continuous", "Width in band-pass and notch; slope in low-pass and high-pass.", ref=17, panel_scale=S10)
par("vcf.mode", "vcf", "FILTER", "enum", "Filter response.", ref=18, access=[{"type": "panel", "control": "rotary_switch"}],
    values=[{"value": "lowpass", "label": "LO"}, {"value": "bandpass", "label": "BAND"}, {"value": "notch", "label": "NOTCH"}, {"value": "highpass", "label": "HI"}])
par("vcf.ctrl_osc_amount", "vcf", "FILTER CONTROL (osc)", "continuous",
    "Bipolar depth of the control oscillator on the filter: centre none, clockwise positive, counter-clockwise inverted. Unnumbered in the guide.",
    panel_scale=BI, bipolar=True, confidence="inferred", note="Read from the panel, where a bracket links this knob to the control oscillator.")
par("vcf.ctrl_env_amount", "vcf", "FILTER CONTROL (env)", "continuous",
    "Bipolar depth of the control envelope on the filter: centre none, clockwise rising, counter-clockwise falling. Unnumbered in the guide.",
    panel_scale=BI, bipolar=True, confidence="inferred", note="Read from the panel, where a bracket links this knob to the control envelope.")
par("vca_env.attack", "vca_env", "ATTACK", "continuous", "Speed of note onset.", ref=19, panel_scale=S10)
par("vca_env.decay", "vca_env", "DECAY", "continuous", "Decay while the key is held, and fade after release.", ref=20, panel_scale=S10)
par("vca_env.sustain", "vca_env", "SUSTAIN LEVEL / REPEAT", "continuous",
    "Sustain level. At fully counter-clockwise the note repeats, with ATTACK and DECAY setting the repeat speed.", ref=21, panel_scale={"min": 0, "max": 10, "unit": "REPEAT to SUSTAIN LEVEL"})
par("vca_env.hold", "vca_env", "HOLD", "boolean", "Freezes the note indefinitely at whatever point the envelope has reached when switched.", ref=22,
    access=[{"type": "panel", "control": "toggle_switch"}], values=ONOFF)
par("ctrl_env.attack", "ctrl_env", "ATTACK (control)", "continuous", "Speed of the filter envelope's onset.", ref=23, panel_scale=S10)
par("ctrl_env.decay", "ctrl_env", "DECAY (control)", "continuous", "How quickly the filter envelope falls.", ref=24, panel_scale=S10)
par("ctrl_env.delay", "ctrl_env", "DELAY / REPEAT", "continuous",
    "Delays the start of the filter envelope by up to 1 s. The panel labels the other end REPEAT, which by analogy with the VCA envelope makes it cycle.",
    ref=25, panel_scale={"min": 0, "max": 10, "unit": "REPEAT to DELAY"}, physical={"min": 0, "max": 1, "unit": "s", "note": "delay end"},
    confidence="inferred", note="The guide describes only the delay; the repeat end is read from the panel.")
par("output.volume", "output", "VOLUME", "continuous", "Final level at MAIN AUDIO and the rear outputs.", ref=26, panel_scale=S10)
par("output.phones", "output", "PHONES", "continuous", "Headphone level.", ref=27, panel_scale=S10)
par("kbd.midi_channel", "kbd", "MIDI CHANNEL", "integer", "MIDI channel, by rear DIP switches or SysEx; defaults to 1 in Eurorack.", ref=35,
    range={"min": 1, "max": 16}, access=[{"type": "rear_panel", "control": "dip_switches_x4"}, SYSEX(0x00)])
par("output.power", "output", "POWER", "boolean", "Power switch.", ref=36, access=[{"type": "rear_panel", "control": "toggle_switch"}], values=ONOFF)

SX = [("kbd.key_priority", "Key priority", "enum", 0x01, "Note priority when several keys are held.",
       {"values": [{"value": 0, "label": "low", "meaning": "inferred"}, {"value": 1, "label": "high", "meaning": "inferred"}, {"value": 2, "label": "last", "meaning": "stated"}]}),
      ("kbd.multi_trigger", "Multi trigger", "boolean", 0x02, "Retrigger the envelopes on every new note, or only on detached notes.", {"values": ONOFF}),
      ("kbd.bend_range", "Pitch bend range", "integer", 0x03, "MIDI pitch bend range in semitones.", {"range": {"min": 0, "max": 24}}),
      ("kbd.transpose", "MIDI IN transpose", "integer", 0x06, "Transposes incoming notes; a table in the guide maps data values to semitones.", {"range": {"min": 0, "max": 24}}),
      ("kbd.zero_volt_note", "Zero-volt note", "integer", 0x07, "The MIDI note treated as zero volts, for example C5 (72).", {"range": {"min": 0, "max": 127}}),
      ("kbd.poly_chain", "Poly chain", "boolean", 0x08, "Poly chain on or off. The guide recommends an undocumented 'A-440 method' instead.", {"values": ONOFF}),
      ("kbd.device_id", "Device ID", "integer", 0x09, "SysEx and poly chain device ID, 0 to 15. Set per unit when chaining by SysEx.", {"range": {"min": 0, "max": 15}}),
      ("kbd.disable_channel_switches", "Disable MIDI channel switches", "boolean", 0x0A, "Ignore the rear DIP switches so SysEx can set the channel.", {"values": ONOFF}),
      ("kbd.modulation_curve", "Modulation curve", "integer", 0x0B, "Response curve for modulation; 1 is Medium. Other values not listed.", {"range": {"min": 0, "max": 2}}),
      ("kbd.bend_range_effective", "Make pitch bend range effective", "boolean", 0x0C, "Applies the SysEx pitch bend range.", {"values": ONOFF}),
      ("kbd.poly_chain_style", "Poly chain style", "enum", 0x0D, "Old (firmware 1.0.5) or new (1.0.6) note distribution and retriggering.",
       {"values": [{"value": 0, "label": "new"}, {"value": 1, "label": "old"}]})]
for pid, lab, kind, main, fn, extra in SX:
    par(pid, "kbd", lab, kind, fn, access=[SYSEX(main)], **extra,
        confidence="inferred" if pid in ("kbd.key_priority", "kbd.bend_range", "kbd.transpose", "kbd.modulation_curve") else "stated",
        note=f"SysEx main parameter 0x{main:02X}; ranges beyond the guide's single example are inferred." if pid in ("kbd.key_priority", "kbd.bend_range", "kbd.transpose", "kbd.modulation_curve") else f"SysEx main parameter 0x{main:02X}.")
D["parameters"] = P

# ports ---------------------------------------------------------------------
jack("jack.osc1_out", "OSC1", None, "top", "out", "audio", "osc1.out", "Upper oscillator output. On the panel; not described in the guide.", confidence="inferred")
jack("jack.osc2_out", "OSC2", None, "top", "out", "audio", "osc2.out", "Lower oscillator output. On the panel; not described in the guide.", confidence="inferred")
jack("jack.ext", "EXT AUDIO", 31, "top", "in", "audio", "mixer.in_ext", "Line-level audio into the mix via EXT. With nothing patched the main output is fed back here.", combine="replace")
jack("jack.main_audio", "MAIN AUDIO", 33, "top", "out", "audio", "output.main", "Main output on 3.5 mm; the only output when in Eurorack.", connector="3.5mm TRS", electrical={"max_level_dbu": 0})
jack("jack.phones", "PHONES", 27, "top", "out", "audio", "output.phones", "Headphones.", connector="3.5mm TRS", electrical={"max_level_dbu": -2, "load_ohm": 32, "impedance_ohm": 25})
jack("jack.usb", "USB", 28, "top", "bidirectional", "midi", None, "Class-compliant USB MIDI in and out; also the route for SysEx.", connector="USB-B")
jack("jack.midi_in", "MIDI IN", 29, "top", "in", "midi", None, "MIDI from a keyboard, sequencer or computer.", connector="DIN-5")
jack("jack.midi_thru", "MIDI THRU", 30, "top", "out", "midi", None, "Passes MIDI IN on, for poly chain or other gear.", connector="DIN-5")
jack("jack.out_high", "MAIN OUT HIGH", 34, "rear", "out", "audio", "output.high", "Line-level mono output.", connector="6.35mm TS", electrical={"max_level_dbu": 0, "impedance_ohm": 1300})
jack("jack.out_low", "MAIN OUT LOW", 34, "rear", "out", "audio", "output.low", "Instrument-level mono output, 27 dB below HIGH.", connector="6.35mm TS", electrical={"impedance_ohm": 1000})
jack("jack.dc_in", "DC INPUT", 37, "rear", "in", "power", None, "12 V DC, 1000 mA, from the supplied adaptor.", connector="barrel", electrical={"voltage_v": 12, "current_ma": 1000})
D["ports"] = J

# connections ---------------------------------------------------------------
con("c01", "kbd.note", "pitch.note_in", "cv", "fixed", amount="pitch.glide")
con("c02", "kbd.bend", "pitch.bend_in", "cv", "fixed", amount="pitch.bend")
con("c03", "pitch.to_osc1", "osc1.pitch_in", "cv", "fixed")
con("c04", "pitch.to_osc2", "osc2.pitch_in", "cv", "fixed", amount="osc2.pitch")
con("c05", "ctrl_osc.out", "osc1.pm_in", "cv", "fixed", amount="ctrl_osc.pitch_mod",
    note="The guide says PITCH MOD varies the pitch difference between the oscillators, which may mean it acts on one oscillator only.", confidence="inferred")
con("c06", "ctrl_osc.out", "osc2.pm_in", "cv", "fixed", amount="ctrl_osc.pitch_mod", confidence="inferred")
con("c10", "osc1.out", "mixer.in_osc1", "audio", "switched", enabled_when={"param": "osc1.waveform", "not_equals": "off"}, amount="mixer.osc1")
con("c11", "osc2.out", "mixer.in_osc2", "audio", "switched", enabled_when={"param": "osc2.waveform", "not_equals": "off"}, amount="mixer.osc2")
con("c12", "noise.out", "mixer.in_noise", "audio", "fixed", amount="mixer.noise")
con("c13", "output.main", "mixer.in_ext", "audio", "normalled", broken_by="jack.ext", amount="mixer.ext",
    note="With nothing in EXT AUDIO the main output is fed back into the mix, so EXT becomes a feedback control.")
con("c14", "mixer.out", "vcf.in", "audio", "fixed")
con("c15", "ctrl_osc.out", "vcf.osc_mod_in", "cv", "fixed", amount="vcf.ctrl_osc_amount")
con("c16", "ctrl_env.out", "vcf.env_mod_in", "cv", "fixed", amount="vcf.ctrl_env_amount")
con("c17", "vcf.out", "vca.in", "audio", "fixed")
con("c18", "kbd.gate", "vca_env.gate_in", "gate", "fixed")
con("c19", "kbd.gate", "ctrl_env.gate_in", "gate", "fixed")
con("c20", "vca_env.out", "vca.env_in", "cv", "fixed")
con("c21", "vca.out", "output.in", "audio", "fixed", amount="output.volume")
D["connections"] = C

D["indicators"] = [{"id": "output.power_led", "module": "output", "label": "POWER", "kind": "led", "led_colour": "green", "manual_ref": 32,
                    "function": "Lit when the unit is on."}]
D["led_legend"] = {"rule": "One LED, power only.", "colours": [{"colour": "green", "meaning": "power on"}], "confidence": "inferred",
                   "note": "Colour from the panel image; the guide says only that it lights."}

D["behaviours"] = [
    {"id": "b01", "name": "Digital oscillators, analogue filter", "applies_to": ["osc1", "osc2", "vcf", "vca"],
     "rule": "The oscillators are digitally generated, as on the original Wasp, which gives the instrument its buzzy, aliased edge; the "
             "filter and VCA are analogue. The ENH waveform position adds bite and clarity beyond plain sawtooth or square."},
    {"id": "b02", "name": "Feedback through EXT", "applies_to": ["mixer", "output"],
     "rule": "With nothing patched into EXT AUDIO, the main output is normalled back into the mixer's EXT channel. Turning EXT up feeds "
             "the filtered, amplified signal back into the filter, from thickening to overdrive and self-oscillating howl."},
    {"id": "b03", "name": "Multimode filter and Q", "applies_to": ["vcf"],
     "rule": "One filter with four responses. Q means different things by mode: slope in low-pass and high-pass, width of the band or "
             "notch in band-pass and notch."},
    {"id": "b04", "name": "Bipolar filter control", "applies_to": ["vcf", "ctrl_osc", "ctrl_env"],
     "rule": "The control oscillator and control envelope each reach the filter through a knob with zero at centre: clockwise adds, "
             "counter-clockwise inverts. Combining a rising envelope with a falling oscillator, or the reverse, is how the WASP gets its "
             "movement. The guide suggests these also affect the oscillators; the panel links them to the filter only."},
    {"id": "b05", "name": "Repeating envelopes", "applies_to": ["vca_env", "ctrl_env"],
     "rule": "Both envelopes have a knob whose end stop is REPEAT. On the VCA envelope, sustain at fully counter-clockwise makes the "
             "note retrigger continuously at the attack and decay times. The control envelope's DELAY knob has REPEAT at its other end, "
             "by the same logic cycling the filter envelope."},
    {"id": "b06", "name": "HOLD", "applies_to": ["vca_env"],
     "rule": "HOLD freezes the VCA envelope at whatever level it has reached when switched, so a note can be caught mid-decay and held "
             "indefinitely."},
    {"id": "b07", "name": "Control oscillator shapes", "applies_to": ["ctrl_osc"],
     "rule": "Six shapes: sine, rising and falling sawtooth, square, noise and random. At 100 Hz the control oscillator reaches low audio "
             "rates, so on pitch or the filter it gives rough FM-like tones as well as vibrato and sweeps."},
    {"id": "b08", "name": "SysEx configuration", "applies_to": ["kbd"],
     "rule": "Channel, key priority, multi-trigger, bend range, transpose, the zero-volt note, poly chain on, device ID, modulation curve and "
             "poly chain style are set by SysEx on main parameter 0x0A, with the sub-parameter selecting the setting. There is no app "
             "mentioned. Firmware 1.0.6 changed the poly chain and retrigger behaviour; the old style can be restored."},
    {"id": "b09", "name": "Poly chain styles", "applies_to": ["kbd"],
     "rule": "Old style (1.0.5): every unit plays note 1 until its own note number arrives. New style (1.0.6): a unit is silent until "
             "enough notes are held to reach it. Retriggering also changed: releasing the first of two overlapping notes no longer "
             "retriggers the second."},
]

D["midi"] = {
    "receives": ["note_on", "note_off", "cc123_all_notes_off", "pitch_bend", "timing_clock", "start", "continue", "stop", "sysex"],
    "transmits": ["MIDI THRU pass-through", "USB MIDI"],
    "channel": {"range": [1, 16], "set_by": "rear DIP switches or SysEx; channel 1 when in Eurorack"},
    "sysex": {"format": "F0 00 20 32 00 <device id or 7F> 0A <sub> <msb> <lsb> F7", "manufacturer_id": "00 20 32 (Behringer)",
              "note": "Device ID is the poly chain ID, not the MIDI channel. Sub-parameters are recorded on each kbd parameter."},
    "cc_map": None, "nrpn": None,
    "clock": "Timing clock, start, continue and stop are listed as received; what they drive is not stated",
    "usb": {"class_compliant": True, "os": "Windows XP or higher, Mac OS X 10.6.8 or higher"},
}
D["specifications"] = {
    "voices": "monophonic", "oscillators": "2 digitally controlled", "lfo_hz": {"min": 0.5, "max": 100},
    "vcf": "1, switchable low, band, notch and high", "envelopes": ["VCA", "VCF"],
    "outputs": {"high": "1/4-inch TS, max 0 dBu, 1.3 kohm", "low": "1/4-inch TS, 27 dB below high, 1 kohm",
                "main_audio": "3.5 mm TRS, max 0 dBu", "phones": "3.5 mm TRS, -2 dBu into 32 ohm, 25 ohm"},
    "power": {"adaptor": "12 V DC, 1000 mA", "consumption_w_max": 2}, "dimensions_mm": {"h": 87, "w": 374, "d": 136},
    "eurorack_hp": 70, "weight_kg": 1.6, "operating_temperature_c": {"min": 5, "max": 45},
}
D["omitted_from_source"] = ["safety and legal text in several languages", "warranty and compliance declarations", "hook-up diagrams",
                            "non-English duplicates", "Eurorack installation", "the MIDI channel DIP switch table", "the MIDI transpose value table"]
D["not_in_source"] = [
    "the two FILTER CONTROL knobs, which the numbered controls skip",
    "the OSC1 and OSC2 output jacks, which are on the panel but not in the guide",
    "the 'A-440 method' the guide recommends for turning on poly chain",
    "envelope times, apart from the control envelope's 1 s delay",
    "what the ENH waveform is electrically",
    "whether WIDTH affects OSC 2 or the ENH shape",
    "the span of the OSC 2 PITCH control",
    "filter cutoff range and resonance behaviour",
    "what MIDI clock drives; the transport messages are listed as received",
    "the full ranges of the SysEx parameters; only one example value each is given",
]
D["source_inconsistencies"] = [
    "Item 6 and 9 name the second and third waveform positions sawtooth and square; the panel symbols show a ramp and a square with a notch that may be a pulse.",
    "The MIDI table lists both 8n and 9n as 'Note Off'; 9n is note on.",
    "Item 30 says MIDI THRU would commonly feed 'another MODEL D synthesizer'; copied from the Model D guide.",
    "Item 35 refers to 'the table on page 13'; the table is on page 17.",
    "The getting-started chapter mentions a 'loudness decay switch'; the only switch is HOLD.",
    "The getting-started chapter says FILTER CONTROL affects 'the oscillators and filter'; the panel links both knobs to the filter.",
    "The SysEx examples show 'Nonte on' and 'Nonte off'.",
]
D["modelling_gaps"] = [
    {"topic": "Envelope times", "detail": "None given apart from the control envelope delay of up to 1 s."},
    {"topic": "Filter", "detail": "The original Wasp filter is a distinctive CMOS-based design. No cutoff range, resonance behaviour or statement of how Q maps to slope is given."},
    {"topic": "Digital oscillators", "detail": "Waveform generation and aliasing character are not documented; the ENH shape is described only by its effect."},
    {"topic": "Feedback", "detail": "The normalled output-to-EXT loop is stated; its gain structure, and where in the output chain the feedback is taken, are not."},
    {"topic": "Original instrument", "detail": "No EDP Wasp documentation was supplied."},
]

with open("/mnt/user-data/outputs/behringer-wasp-deluxe.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
