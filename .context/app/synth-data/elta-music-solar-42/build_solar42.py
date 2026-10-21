#!/usr/bin/env python3
"""Assemble the Elta Music SOLAR 42 device file (schema 0.12.0).

Original SOLAR 42 (2023), an analogue microtonal 'ambient machine': four 'classic' drone
voices (1, 2, 6, 7: five sawtooth generators each, with photosensor and VOLT detune/FM),
two 'Papa Srapa' noise/drone voices (3, 8), two AS3340 VCO voices (4, 5) played from a
12-plate capacitive keyboard; per-voice envelopes; two LFOs, two noise and S&H sources,
5-step sequencer with pulser, joystick, contact mic with envelope follower; 10-channel
stereo mixer, dual Polivoks filter, dual cartridge effector. No MIDI, no presets.

Sources: the user-supplied specification list; the SOLAR 42 user manual (Elta's PDF was
too large to fetch; its text was read via indexed excerpts on ManualsLib and Scribd);
retailer and press coverage; and the AmbientModules VCV Rack recreation (based on the
later 42F) for control-level detail, marked inferred where it is the only source.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []
DRONES_CLASSIC = (1, 2, 6, 7)
DRONES_SRAPA = (3, 8)
VCOS = (4, 5)
INF = {"confidence": "inferred"}


def mod(id, type, name, section, desc, inputs, outputs, props=None, **kw):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    m.update(kw)
    M.append(m)


def par(id, module, label, kind, fn, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = kw.pop("memory", "none")
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


def jack(id, label, direction, signal, node, fn, connector="3.5 mm TS", location=None, **kw):
    j = {"id": id, "label": label, "location": location or ("patch_in" if direction == "in" else "patch_out"), "direction": direction, "signal": signal,
         "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "audio", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "normalled" if "broken_by" in kw else ("switched" if when else "fixed")}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


D["device"] = {
    "id": "elta-music-solar-42", "manufacturer": "Elta Music", "model": "SOLAR 42 Ambient Machine",
    "category": "analogue microtonal drone synthesizer with touch keyboard, 8 voices, dual Polivoks filter and cartridge effects; desktop, no MIDI",
    "based_on": "Successor to the Elta SOLAR 50 (2021); designed by Arseny Tokarev, made in Riga, Latvia; launched 2023. Followed by the SOLAR 42F and 42N (renumbered voices, added distortion and sub-oscillators).",
    "sources": [
        {"id": "user_specs", "title": "Specification list supplied by the user (from the SOLAR 42 manual)", "kind": "spec_sheet", "file": "conversation",
         "note": "Output voltage ranges, power, weight, size."},
        {"id": "manual", "title": "Elta Music SOLAR 42 User Manual (28 pages)", "kind": "user_manual", "file": "https://www.eltamusic.com/_files/ugd/12d408_d4c9881033524945ae276dc3559589ff.pdf",
         "note": "Elta's PDF exceeds the fetch limit; read through ManualsLib page summaries (https://www.manualslib.com/manual/3351553/Elta-Music-Solar-42.html) and Scribd excerpts. The second supplied PDF (panel graphic) has no text layer."},
        {"id": "press", "title": "Resident Advisor, gearnews, Sonicstate and Perfect Circuit coverage", "kind": "other", "file": "https://ra.co/news/79473",
         "note": "Eight voices (six drones, two playable), two Polivoks filters, 5-step sequencer, two noise and two S&H; no MIDI, no presets; voices 4 and 5 have individual outputs."},
        {"id": "elta_page", "title": "Elta Music SOLAR 42F/42N product page", "kind": "other", "file": "https://www.eltamusic.com/solar-42f",
         "note": "Elta's feature list ('Two LFO's and 3 Square pulse generators') and the specification block, which still uses the original voice numbering."},
        {"id": "modwiggler", "title": "Mod Wiggler 'Elta Music Solar 42' thread", "kind": "other", "file": "https://www.modwiggler.com/forum/viewtopic.php?p=4249186",
         "note": "Owners note the 42F manual mixes updated and original SOLAR 42 names (e.g. buttons 3 and 8)."},
        {"id": "ambientmodules", "title": "neilbgr/AmbientModules (VCV Rack modules of SOLAR 42F parts)", "kind": "other", "file": "https://github.com/neilbgr/AmbientModules",
         "note": "Control-level descriptions of each section; based on the 42F (different voice numbering), used only for detail not found elsewhere."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 8, "polyphony_mode": "eight independent voices: six drones on push-buttons or gates, two VCO voices on the touch keyboard (single or split)",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No sound presets; the touch keyboard stores its own settings and sequencer presets.",
    "semi_modular": True, "panel_counts": {"voices": 8, "touch_plates": 12, "drone_buttons": 6, "cartridge_slots": 2},
    "summary": ("Four 'classic' drone voices (1, 2, 6, 7), each five independently tuned sawtooth generators (no V/oct) spanning about B0-D7, with a VOLT knob that detunes them down "
                "together and then cross-modulates them, and a photosensor driven by a red LED for pitch modulation. Two 'Papa Srapa' voices (3, 8): an audio square cross-modulated "
                "(FM/AM) by a low-frequency square, blended with white noise, with sample and hold. Two AS3340 VCO voices (4, 5) with six waveforms including two morphing shapes, "
                "voice 4 normalled into voice 5's FM. Every voice has an envelope (AR on the drones) with CV in and out and HOLD. A 10-channel stereo mixer (8 voices, external audio, "
                "preamp) feeds a dual 12 dB Polivoks filter and a dual cartridge effector with X/Y/Z CV. Two LFOs, a 5-step sequencer with pulser, a joystick and a contact-mic envelope follower provide CV."),
}

# ---------------------------------------------------------------- modules
mod("keys", "voice_allocator", "Touch keyboard and drone buttons", "TOUCH SENSITIVE CONTROLLER / DRONE VOICES",
    "12 capacitive plates with V/oct, gate and pressure outputs (single or split), arpeggiator, sequencer, quantiser, portamento, vibrato and presets; six push-buttons gate the drone voices.",
    ["keys.clock_in"], ["keys.cv_l", "keys.gate_l", "keys.cv_r", "keys.gate_r", "keys.pressure", "keys.drone_gates"], props={"plates": 12, "clock_bpm": [10, 300]})
for v in DRONES_CLASSIC:
    mod(f"v{v}", "oscillator", f"Voice {v} (classic drone)", f"VOICE {v}",
        "Five sawtooth generators, each with its own TUNE knob and on/off key: 1st C0-G2, 2nd B1-G3, 3rd D3-B4, 4th E4-C6, 5th G5-D7. VOLT transposes all five down together, then makes them frequency-modulate each other. "
        "A photosensor lit by a red LED (from LFO or CV) bends the pitch. Envelope (attack/release, HOLD) into the voice VCA.",
        [f"v{v}.photo_cv", f"v{v}.volt_cv", f"v{v}.gate"], [f"v{v}.out", f"v{v}.env"], props={"generators": 5, "range": "B0-D7"})
for v in DRONES_SRAPA:
    mod(f"v{v}", "oscillator", f"Voice {v} (Papa Srapa drone)", f"VOICE {v}",
        "After Papa Srapa's DIY noise synths: two Schmitt-trigger square oscillators. The low-frequency one is a modulator (RATE knob, x1/x10 switch, CV OUT); the other is the tone, C0-E7 (PITCH). "
        "FM AMOUNT and DIVIDER set the modulation depth; FM and AM toggles choose frequency modulation, interruption (AM) or both. White noise and a sample and hold sit alongside; attack/release envelope with HOLD, gated by its push-button. Sirens, birds, gunfire, surf, wind.",
        [f"v{v}.pitch_cv", f"v{v}.gate", f"v{v}.sh_clock"], [f"v{v}.out", f"v{v}.env", f"v{v}.mod_out", f"v{v}.sh_out", f"v{v}.noise_out"])
for v in VCOS:
    mod(f"v{v}", "oscillator", f"Voice {v} (VCO)", f"VOICE {v}",
        "AS3340 triangle-core VCO: six waveforms (including saw-to-inverted-saw and sine-to-triangle morphs with SHAPE), octave switch and tune, 1 V/oct input, envelope (ADSR/ASR/AD/looped AD per manual excerpts) into its VCA."
        + (" Has a VCO output." if v == 4 else " Has a SYNC input; voice 4's VCO output is normalled to its FM input."),
        [f"v{v}.voct", f"v{v}.fm", f"v{v}.gate"] + (["v5.sync"] if v == 5 else []), [f"v{v}.out", f"v{v}.env"] + (["v4.vco_out"] if v == 4 else []),
        props={"chip": "AS3340", "waveforms": 6})
mod("lfo", "lfo", "LFO A and B", "LFOs", "Two LFOs, A slow and B fast, each blending square and triangle (centre = mix); positive-only output so they can drive the drone photosensors' red LEDs.", [], ["lfo.a", "lfo.b"],
    props={"output_v": [0, 10]})
mod("seq", "sequencer", "Sequencer and pulser", "SEQUENCER", "Buchla-inspired 5-stage sequential voltage source: per-step 0-5 V level and gate, 3/4/5 stages, internal PULSER clock or external clock.", ["seq.clock_in"],
    ["seq.cv", "seq.gate", "seq.pulser"], props={"steps": 5})
mod("joy", "manual_controller", "Joystick", "JOYSTICK", "Two-axis CV with an offset per axis selecting -10..0 V (left), -5..+5 V (middle) or 0..+10 V (right).", [], ["joy.x", "joy.y"])
mod("preamp", "preamp", "Contact mic, preamp and envelope follower", "CONTACT MIC + ENVELOPE FOLLOWER",
    "Built-in piezo under the keyboard (the case becomes a microphone) or an external source; preamp gain; envelope follower (attack, release) with envelope and gate outputs; audio to the mixer.",
    ["preamp.ext"], ["preamp.out", "preamp.env", "preamp.gate"])
mod("mixer", "mixer", "Mixer", "MIXER", "Volume and pan for voices 1-8, external audio and preamp: ten channels to a stereo bus.",
    [f"mixer.v{v}" for v in range(1, 9)] + ["mixer.ext", "mixer.preamp"], ["mixer.out_l", "mixer.out_r"])
mod("vcf", "filter", "Dual Polivoks filter", "FILTERS", "Two 12 dB/oct lo-fi filters on the classic Soviet Polivoks chip (left and right), frequency and resonance each, CV on frequency, LINK.", ["vcf.in_l", "vcf.in_r", "vcf.cv"],
    ["vcf.out_l", "vcf.out_r"], props={"slope_db_per_oct": 12})
mod("fx", "effects", "Dual cartridge effector", "EFFECTOR", "Two cartridge effect circuits (left and right, as in the Elta Console pedal and SOLAR 50); BLEND sets the effect level; X, Y, Z parameters under CV (-10..+10 V).",
    ["fx.in_l", "fx.in_r", "fx.x_cv", "fx.y_cv", "fx.z_cv"], ["fx.out_l", "fx.out_r"])
mod("out", "output", "Outputs", "OUTPUTS", "Wet L/R (MASTER VOLUME), dry outputs for the keyboard voices, headphones.", ["out.wet_l", "out.wet_r", "out.dry_4", "out.dry_5"],
    ["out.wet_out_l", "out.wet_out_r", "out.dry_out_l", "out.dry_out_r", "out.phones"])

# ---------------------------------------------------------------- parameters
for v in DRONES_CLASSIC:
    for g, rng in enumerate(("C0-G2", "B1-G3", "D3-B4", "E4-C6", "G5-D7"), start=1):
        knob(f"v{v}.tune{g}", f"v{v}", f"V{v} TUNE {g}", f"Generator {g} pitch, {rng}.")
        par(f"v{v}.on{g}", f"v{v}", f"V{v} GEN {g} ON", "boolean", f"Generator {g} on/off.", control="push_button")
    knob(f"v{v}.volt", f"v{v}", f"V{v} VOLT", "Transposes all five generators down together (each at a different rate, so chords re-tune); further on, they cross-modulate.")
    knob(f"v{v}.attack", f"v{v}", f"V{v} ATTACK", "Envelope attack.")
    knob(f"v{v}.release", f"v{v}", f"V{v} RELEASE", "Envelope release.")
    par(f"v{v}.hold", f"v{v}", f"V{v} HOLD", "boolean", "Keeps the voice open without a gate.", control="toggle_switch")
for v in DRONES_SRAPA:
    knob(f"v{v}.pitch", f"v{v}", f"V{v} PITCH", "Tone oscillator, about C0-E7.")
    knob(f"v{v}.rate", f"v{v}", f"V{v} RATE", "Modulator (low-frequency square) rate.")
    par(f"v{v}.x10", f"v{v}", f"V{v} RATE SWITCH x1/x10", "enum", "Modulator rate range.", control="toggle_switch", values=[{"value": "x1"}, {"value": "x10"}])
    knob(f"v{v}.divider", f"v{v}", f"V{v} DIVIDER", "Sets modulation depth (deviation) together with FM AMOUNT.")
    knob(f"v{v}.depth", f"v{v}", f"V{v} FM AMOUNT (amt)", "Modulation depth (deviation).")
    par(f"v{v}.fm", f"v{v}", f"V{v} FM", "boolean", "Modulator to frequency (up = on).", control="toggle_switch")
    par(f"v{v}.am", f"v{v}", f"V{v} AM", "boolean", "Modulator interrupts the tone (up = on); with FM down and AM up the tone is chopped at RATE.", control="toggle_switch")
    knob(f"v{v}.noise", f"v{v}", f"V{v} NOISE", "White noise level.", confidence="inferred", note="Two white noise generators are listed; the control layout is from the 42F recreation.")
    knob(f"v{v}.attack", f"v{v}", f"V{v} ATTACK", "Envelope attack.")
    knob(f"v{v}.release", f"v{v}", f"V{v} RELEASE", "Envelope release.")
    par(f"v{v}.hold", f"v{v}", f"V{v} HOLD", "boolean", "Keeps the voice open without a gate.", control="toggle_switch")
for v in VCOS:
    par(f"v{v}.wave", f"v{v}", f"V{v} WAVE", "enum", "Six waveforms including two morphing shapes.", control="rotary_switch",
        values=[{"value": w} for w in ["sine", "triangle", "saw", "square", "saw_to_inverted_saw", "sine_to_triangle"]], confidence="inferred", note="Exact list from the 42F recreation; the manual names the two morphs.")
    knob(f"v{v}.shape", f"v{v}", f"V{v} SHAPE", "Pulse width or morph position.")
    par(f"v{v}.octave", f"v{v}", f"V{v} OCTAVE", "enum", "8-position octave switch for coarse tuning.", control="rotary_switch",
        values=[{"value": o} for o in ["LO", "64'", "32'", "16'", "8'", "4'", "2'", "1'"]], note="Eight positions read from the panel legend in the manual (LO, 64' to 1').")
    knob(f"v{v}.tune", f"v{v}", f"V{v} TUNE", "Fine tune.")
    knob(f"v{v}.fm_amt", f"v{v}", f"V{v} FM", "FM depth (voice 5: from voice 4 by default).")
    for k in ("attack", "decay", "sustain", "release"):
        knob(f"v{v}.{k}", f"v{v}", f"V{v} {k.upper()}", f"Envelope {k}.")
    par(f"v{v}.env_mode", f"v{v}", f"V{v} ENV MODE", "enum", "Envelope type.", control="toggle_switch", values=[{"value": m} for m in ["ASR", "AD", "LOOP"]],
        note="The manual lists ASR, AD and looped AD envelope types; the VCO panel legend shows PW, ATTACK, DECAY, SUSTAIN, RELEASE with HOLD and LOOP switches.")
    par(f"v{v}.hold", f"v{v}", f"V{v} HOLD", "boolean", "Keeps the voice open.", control="toggle_switch")
for l in ("a", "b"):
    knob(f"lfo.{l}_rate", "lfo", f"LFO {l.upper()} RATE", f"LFO {l.upper()} rate ({'slow' if l == 'a' else 'fast'}).")
    knob(f"lfo.{l}_wave", "lfo", f"LFO {l.upper()} WAVE", "Square (one side) to triangle (other side); centre mixes both.")
knob("seq.pulser", "seq", "PULSER", "Internal clock rate.")
par("seq.stages", "seq", "STAGES", "enum", "Sequence length.", control="toggle_switch", values=[{"value": s} for s in ["4", "5", "3"]], note="Switch order 4-5-3 per the 42F recreation.", confidence="inferred")
for s in range(1, 6):
    knob(f"seq.step{s}", "seq", f"STEP {s}", "Step level 0-5 V.", physical={"min": 0, "max": 5, "unit": "V"})
    par(f"seq.gate{s}", "seq", f"GATE {s}", "boolean", "Step gate on/off.", control="push_button")
par("joy.stick", "joy", "JOYSTICK", "continuous", "X/Y position.", control="joystick", panel_scale={"min": -1, "max": 1})
for a in ("x", "y"):
    par(f"joy.{a}_offset", "joy", f"JOYSTICK {a.upper()} OFFSET", "enum", "Output range: left -10..0 V, middle -5..+5 V, right 0..+10 V.", control="knob",
        values=[{"value": "-10..0V"}, {"value": "-5..+5V"}, {"value": "0..+10V"}])
knob("preamp.gain", "preamp", "GAIN", "Preamp gain for the piezo or external source.")
par("preamp.source", "preamp", "SOURCE", "enum", "Internal piezo or external source.", control="toggle_switch", values=[{"value": "piezo"}, {"value": "external"}])
knob("preamp.attack", "preamp", "EF ATTACK", "Envelope follower attack.")
knob("preamp.release", "preamp", "EF RELEASE", "Envelope follower release.")
for ch in [f"v{v}" for v in range(1, 9)] + ["ext", "preamp"]:
    knob(f"mixer.{ch}_vol", "mixer", f"{ch.upper().replace('V', 'VOICE ')} VOLUME", "Channel level.")
    knob(f"mixer.{ch}_pan", "mixer", f"{ch.upper().replace('V', 'VOICE ')} PAN", "Channel panorama.", panel_scale={"min": -5, "max": 5})
for side in ("l", "r"):
    knob(f"vcf.freq_{side}", "vcf", f"FILTER {side.upper()} FREQ", "Cutoff.")
    knob(f"vcf.res_{side}", "vcf", f"FILTER {side.upper()} RES", "Resonance.")
par("vcf.link", "vcf", "FREQ LINK", "boolean", "Right filter follows the left filter's frequency.", control="toggle_switch")
knob("vcf.cv_amt", "vcf", "FILTER CV", "Depth of the frequency CV input.")
knob("fx.blend", "fx", "BLEND", "Effect level.")
knob("fx.master", "fx", "MASTER VOLUME", "Wet output level.")
for p_ in ("x", "y", "z"):
    knob(f"fx.{p_}", "fx", f"EFFECT {p_.upper()}", f"Cartridge parameter {p_.upper()}; also under CV.")
par("fx.cartridge", "fx", "CARTRIDGES (L/R)", "enum", "Effect cartridges, each with two programs.", control="push_button",
    values=[{"value": c} for c in ["Cathedral (reverbs: shimmer...)", "Magic (pitched delays)", "Time (mod delays)", "Pitch Shifter (octave, pitch)", "Infinity (big ambient)", "String Ringer (audio-rate modulation)"]])
par("fx.bypass", "fx", "BYPASS", "boolean", "Effector bypass per channel.", control="toggle_switch", confidence="inferred")
KB = "touch keyboard menu (encoder)"
for pid, label, fn, vals in (("keys.behaviour", "BEHAVIOUR", "Single or split (each side plays one VCO voice).", ["single", "split"]),
                             ("keys.mode", "MODE", "Keyboard, arpeggiator or sequencer (per side in split).", ["keyboard", "arpeggiator", "sequencer"]),
                             ("keys.quantiser", "QUANTISER", "Quantise to notes, or play microtonally with plates as pressure/position.", ["on", "off"]),
                             ("keys.pressure_mode", "PRESSURE MODE", "What the pressure output carries.", ["pressure", "other"]),
                             ("keys.clock_src", "CLOCK", "Internal 10-300 BPM or external (switches automatically on an incoming clock).", ["internal", "external"])):
    par(pid, "keys", label, "enum", fn, memory="global", access=[{"type": "menu", "note": KB}], values=[{"value": x} for x in vals])
par("keys.portamento", "keys", "PORTAMENTO", "integer", "Glide time.", memory="global", access=[{"type": "menu", "note": KB}], range={"min": 0, "max": 127})
for k in ("speed", "depth", "delay"):
    par(f"keys.vibrato_{k}", "keys", f"VIBRATO {k.upper()}", "integer", f"Keyboard vibrato {k} (0-127).", memory="global", access=[{"type": "menu", "note": KB}], range={"min": 0, "max": 127})
par("keys.seq_length", "keys", "SEQUENCER LENGTH", "integer", "Keyboard sequencer steps.", memory="global", access=[{"type": "menu", "note": KB}], range={"min": 2, "max": 16})
par("keys.arp_div", "keys", "ARP CLOCK DIV/MULT", "enum", "Arpeggiator clock ratio.", memory="global", access=[{"type": "menu", "note": KB}], values=[{"value": "ratios"}])
par("keys.presets", "keys", "PRESETS", "enum", "Stored keyboard settings and sequences.", memory="global", access=[{"type": "menu", "note": KB}], values=[{"value": "slots"}])
par("keys.octave_buttons", "keys", "OCTAVE BUTTONS", "integer", "Transpose: octave range (quantised) or offset (unquantised).", control="push_button", range={"min": -4, "max": 4})
par("keys.drone_buttons", "keys", "DRONE KEYS 1-3, 6-8", "boolean", "Push-buttons gating the six drone voices.", control="push_button")
par("sys.power", "out", "POWER", "boolean", "Power switch.", access=[{"type": "rear_panel", "control": "toggle_switch"}], confidence="inferred")

# ---------------------------------------------------------------- ports (main patch points named in the sources)
for v in DRONES_CLASSIC + DRONES_SRAPA + VCOS:
    jack(f"jack.v{v}_env_out", f"V{v} ENV OUT", "out", "cv", f"v{v}.env", "Voice envelope out (can trigger the next voice or modulate filter/effector).")
    jack(f"jack.v{v}_gate", f"V{v} GATE / ENV IN", "in", "gate", f"v{v}.gate", "External gate or CV triggers the voice envelope (5 V).")
for v in DRONES_CLASSIC:
    jack(f"jack.v{v}_photo", f"V{v} PHOTO CV", "in", "cv", f"v{v}.photo_cv", "Positive CV lights the voice's red LED over its photosensor.", **INF)
    jack(f"jack.v{v}_volt", f"V{v} VOLT CV", "in", "cv", f"v{v}.volt_cv", "Adds to VOLT.", **INF)
for v in DRONES_SRAPA:
    jack(f"jack.v{v}_mod_out", f"V{v} MOD OUT", "out", "cv", f"v{v}.mod_out", "Modulator square, 0 to +12 V.")
    jack(f"jack.v{v}_sh_out", f"V{v} S&H OUT", "out", "cv", f"v{v}.sh_out", "Sample and hold, -5 to +5 V.")
    jack(f"jack.v{v}_sh_clock", f"V{v} S&H CLOCK", "in", "clock", f"v{v}.sh_clock", "Sample clock.", **INF)
    jack(f"jack.v{v}_noise", f"V{v} NOISE OUT", "out", "audio", f"v{v}.noise_out", "White noise.", **INF)
    jack(f"jack.v{v}_pitch", f"V{v} PITCH CV", "in", "cv", f"v{v}.pitch_cv", "Pitch CV.", **INF)
for v in VCOS:
    jack(f"jack.v{v}_voct", f"V{v} V/OCT", "in", "cv", f"v{v}.voct", "1 V/oct pitch; normalled from the touch keyboard.")
    jack(f"jack.v{v}_fm", f"V{v} FM", "in", "cv_or_audio", f"v{v}.fm", "FM input" + (" (voice 4 VCO normalled here)." if v == 5 else "."))
jack("jack.v4_vco", "V4 VCO OUT", "out", "audio", "v4.vco_out", "Raw voice 4 oscillator, -5 to +5 V.")
jack("jack.v5_sync", "V5 SYNC", "in", "sync", "v5.sync", "Hard sync input.")
jack("jack.lfo_a", "LFO A OUT", "out", "cv", "lfo.a", "0 to +10 V.")
jack("jack.lfo_b", "LFO B OUT", "out", "cv", "lfo.b", "0 to +10 V.")
jack("jack.seq_cv", "SEQ CV OUT", "out", "cv", "seq.cv", "0 to +5 V.")
jack("jack.seq_gate", "SEQ GATE OUT", "out", "gate", "seq.gate", "0 to +10 V.")
jack("jack.pulser", "PULSER OUT", "out", "clock", "seq.pulser", "-10 to +10 V.")
jack("jack.seq_clock", "SEQ EXT CLOCK", "in", "clock", "seq.clock_in", "External clock replaces the pulser.")
jack("jack.joy_x", "JOYSTICK X", "out", "cv", "joy.x", "-10 to +10 V by offset range.")
jack("jack.joy_y", "JOYSTICK Y", "out", "cv", "joy.y", "-10 to +10 V by offset range.")
jack("jack.ef_env", "ENV FOLLOWER OUT", "out", "cv", "preamp.env", "0 to +10 V.")
jack("jack.ef_gate", "ENV FOLLOWER GATE", "out", "gate", "preamp.gate", "0 to +8 V.")
jack("jack.ef_ext", "EXT.SOURCE", "in", "audio", "preamp.ext", "External source replaces the piezo.", **INF)
jack("jack.kb_cv_l", "KEYBOARD CV (L)", "out", "cv", "keys.cv_l", "V/oct out, left side / single.")
jack("jack.kb_gate_l", "KEYBOARD GATE (L)", "out", "gate", "keys.gate_l", "Gate out.")
jack("jack.kb_cv_r", "KEYBOARD CV (R)", "out", "cv", "keys.cv_r", "V/oct out, right side in split.", **INF)
jack("jack.kb_gate_r", "KEYBOARD GATE (R)", "out", "gate", "keys.gate_r", "Gate out, right side.", **INF)
jack("jack.kb_pressure", "PRESSURE OUT", "out", "cv", "keys.pressure", "Plate pressure CV.")
jack("jack.kb_clock", "KEYBOARD CLOCK IN", "in", "clock", "keys.clock_in", "External clock for arpeggiator/sequencer.")
jack("jack.vcf_cv", "FILTER CV", "in", "cv", "vcf.cv", "Filter frequency CV.")
for p_ in ("x", "y", "z"):
    jack(f"jack.fx_{p_}", f"EFFECTOR {p_.upper()} CV", "in", "cv", f"fx.{p_}_cv", "Cartridge parameter CV, -10 to +10 V.")
jack("jack.ext_audio", "EXT AUDIO IN", "in", "audio", "mixer.ext", "External audio into the mixer.", connector="6.35 mm TS", location="rear", **INF)
jack("jack.wet_l", "WET OUT L", "out", "audio", "out.wet_out_l", "Stereo wet output (effector, MASTER VOLUME).", connector="6.35 mm TS", location="rear", **INF)
jack("jack.wet_r", "WET OUT R", "out", "audio", "out.wet_out_r", "Stereo wet output.", connector="6.35 mm TS", location="rear", **INF)
jack("jack.dry_l", "DRY OUT L", "out", "audio", "out.dry_out_l", "Dry output for the left-hand keyboard voice.", connector="6.35 mm TS", location="rear", **INF)
jack("jack.dry_r", "DRY OUT R", "out", "audio", "out.dry_out_r", "Dry output for the right-hand keyboard voice.", connector="6.35 mm TS", location="rear", **INF)
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones.", connector="3.5 mm TRS", location="rear", **INF)
jack("jack.power", "DC 12V", "in", "power", None, "12 V DC, 1-2 A (2 A supply included).", connector="DC barrel", location="rear")

# ---------------------------------------------------------------- connections
con("keys.drone_gates", "v1.gate", "gate", note="Drone push-buttons 1, 2, 3, 6, 7, 8 gate their voices (one shown per voice).")
for v in (2, 3, 6, 7, 8):
    con("keys.drone_gates", f"v{v}.gate", "gate")
con("keys.cv_l", "v4.voct", "cv", note="In split mode the left plates play voice 4 and the right plates voice 5; in single mode both follow.", **INF)
con("keys.cv_r", "v5.voct", "cv", **INF)
con("keys.gate_l", "v4.gate", "gate", **INF)
con("keys.gate_r", "v5.gate", "gate", **INF)
con("v4.vco_out", "v5.fm", broken_by="jack.v5_fm", note="Voice 4's VCO normalled to voice 5's FM input (FM attenuator).")
for v in range(1, 9):
    con(f"v{v}.out", f"mixer.v{v}", amount=f"mixer.v{v}_vol")
con("preamp.out", "mixer.preamp", amount="mixer.preamp_vol")
con("mixer.out_l", "vcf.in_l")
con("mixer.out_r", "vcf.in_r")
con("vcf.out_l", "fx.in_l")
con("vcf.out_r", "fx.in_r")
con("fx.out_l", "out.wet_l", amount="fx.master")
con("fx.out_r", "out.wet_r", amount="fx.master")
con("v4.out", "out.dry_4", note="Dry outputs for the keyboard voices.", **INF)
con("v5.out", "out.dry_5", **INF)

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "photo_leds", "module": "v1", "label": "photosensor LEDs (voices 1, 2, 6, 7)", "kind": "led", "function": "Red LEDs over globe photoresistors; brightness from LFO or CV sets the pitch bend."},
    {"id": "env_leds", "module": "v4", "label": "envelope LEDs", "kind": "led", "function": "Show each voice's envelope (inferred)."},
    {"id": "seq_leds", "module": "seq", "label": "step LEDs", "kind": "led", "function": "Current step."},
    {"id": "kb_display", "module": "keys", "label": "keyboard display and encoder", "kind": "display", "function": "Keyboard menu, calibration (hold encoder at power-up)."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Classic drone voices", "applies_to": [f"v{v}" for v in DRONES_CLASSIC],
     "rule": "Five sawtooth generators per voice (no V/oct), tuned by ear into chords, triads or clusters across about B0-D7 and switched in or out individually. VOLT lowers all five at different rates, so the chord drifts as it falls, then turns into cross-FM. "
             "Photosensors (red LEDs, positive voltage only) give pitch modulation from the LFOs or any positive CV."},
    {"id": "b02", "name": "Papa Srapa voices", "applies_to": [f"v{v}" for v in DRONES_SRAPA],
     "rule": "Two Schmitt-trigger squares: a low-frequency modulator (RATE, x1/x10, CV OUT 0 to +12 V) and a tone oscillator (PITCH, about C0-E7). FM AMOUNT and DIVIDER set the depth. FM up gives frequency modulation; FM down with AM up chops the tone at RATE; both up combine them. "
             "Noise and sample and hold alongside. Sirens, bird calls, space monsters, gunfire, surf and wind."},
    {"id": "b03", "name": "VCO voices", "applies_to": [f"v{v}" for v in VCOS],
     "rule": "AS3340 oscillators with six waveforms (two morphing with SHAPE), 1 V/oct, FM and sync; voice 4's oscillator is normalled into voice 5's FM. Played from the touch keyboard (single or split) or external CV."},
    {"id": "b04", "name": "Envelopes", "applies_to": [f"v{v}" for v in range(1, 9)],
     "rule": "Each voice opens its VCA from an envelope triggered by its button, the keyboard or an external 5 V gate; HOLD keeps it open. Envelope outputs can trigger the next voice or modulate the filter and effector."},
    {"id": "b05", "name": "Touch keyboard", "applies_to": ["keys"],
     "rule": "12 capacitive plates with V/oct, gate and pressure outputs; single or split behaviour; keyboard, arpeggiator or sequencer (2-16 steps) modes; quantiser on (notes) or off (microtonal); portamento; vibrato (speed, depth, delay); internal clock 10-300 BPM or external; presets; calibration by holding the encoder at power-up."},
    {"id": "b06", "name": "Signal path", "applies_to": ["mixer", "vcf", "fx", "out"],
     "rule": "Eight voices, external audio and the preamp are mixed and panned to stereo, filtered by two Polivoks 12 dB filters (left and right) and processed by two cartridge effect circuits; BLEND and MASTER VOLUME set the wet outputs. The two circuits differ slightly, giving a live stereo image."},
    {"id": "b07", "name": "Modulation sources", "applies_to": ["lfo", "seq", "joy", "preamp"],
     "rule": "Elta lists 'two LFOs and three square pulse generators' (the 'five LFO generators' of the manual): LFO A (slow) and B (fast), square-to-triangle, 0 to +10 V; plus the PULSER and the two Papa Srapa modulators, each with an output. 5-step sequencer (0-5 V steps, gates, pulser or external clock); joystick (-10..0, -5..+5 or 0..+10 V per axis); contact mic or external source to an envelope follower (0-10 V) and gate (0-8 V)."},
]
D["midi"] = {"receives": [], "transmits": [], "note": "No MIDI: control is by the panel, touch keyboard and CV/gate."}
D["specifications"] = {
    "voices": 8, "drone_voices": "4 classic (5 saw generators each) + 2 Papa Srapa", "vco_voices": "2 x AS3340", "filter": "dual 12 dB Polivoks", "effects": "dual cartridge effector",
    "cv_levels": {"vco_out": "10 Vpp (-5..+5 V)", "eg": "0..+8 V", "env_out_voices_1_2_3_6_7_8": "-10..+10 V", "lfos": "0..+10 V", "pulser_out": "-10..+10 V",
                  "env_follower": "0..+10 V, gate 0..+8 V", "joystick": "-10..+10 V (left -10..0, middle -5..+5, right 0..+10)", "s_and_h": "-5..+5 V",
                  "voice_3_5_modulator_out": "0..+12 V", "sequencer": "CV 0..+5 V, gate 0..+10 V"},
    "modulation_generators": "2 LFOs + 3 square pulse generators (pulser, two Papa Srapa modulators)",
    "power": "12 V DC, 1-2 A", "weight_kg": 5.4, "dimensions_cm": {"l": 49.5, "d": 32, "h": 2.9, "h_with_knobs": 5.6},
    "box_contents": ["SOLAR 42", "Infinity cartridge", "12 V 2 A supply", "instructions", "5 minijack patch cables", "sticker pack"],
}
D["omitted_from_source"] = ["introduction and safety text", "cartridge program details beyond names", "calibration procedure detail"]
D["not_in_source"] = ["full jack list and exact panel positions (manual PDF not readable here)", "VCO envelope switch positions", "LFO rates in Hz", "filter cutoff range", "audio connector sizes"]
D["source_inconsistencies"] = [
    "Elta's specification says 'VOICE 3, 5 modulator out 0...+12V'. The manual places the modulator CV OUT on the Papa Srapa voices, 3 and 8 in this numbering (3 and 6 on the 42F/42N); voice 5 is a VCO. "
    "The same specification block, still listing 'ENV OUT VOICES 1,2,3,6,7,8', is reused unchanged on Elta's 42F/42N page, so the '3, 5' error is in Elta's published text, not a transcription slip. Modelled on voices 3 and 8.",
    "The mixer page calls the instrument 'SOLAR 52' (a typo; no SOLAR 52 exists).",
    "The manual's 'five LFO generators' are, per Elta's own feature list, two LFOs plus three square pulse generators: the pulser and the two Papa Srapa modulators (resolved).",
    "Later 42F/42N material renumbers the voices (classic drones 1, 2, 4, 5; Papa Srapa 3, 6; VCO A/B), and owners report the 42F manual mixes old and new names, which can be confused with this original layout.",
]
D["modelling_gaps"] = [
    {"topic": "Source access", "detail": "Elta's manual PDF was too large to fetch and the panel PDF has no text; the model uses indexed manual excerpts, the supplied specs and secondary sources. Uploading the PDFs would allow a full check."},
    {"topic": "Patch points", "detail": "Jacks are those named in the sources; the full panel likely has more (per-voice VOLT/photo/shape CV), marked inferred where assumed."},
    {"topic": "42F detail", "detail": "Control detail taken from the 42F-based VCV recreation is marked inferred."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/elta-music-solar-42_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
