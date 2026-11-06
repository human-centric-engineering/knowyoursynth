#!/usr/bin/env python3
"""Assemble the PWM Malevolent device file (schema 0.13.0).

Semi-modular analogue monosynth (signal path by Future Sound Systems): two 4046-based
VCOs (saw, triangle, pulse outputs plus a selectable-wave mix output, shape, two FM
inputs), LFO (triangle, square), noise and aux in a mixer, an opto-FET 2-pole Sallen-Key
multimode filter (separate LP/BP/HP inputs), two ADSRs, VCA with drive and two AM
inputs, 19 inputs and 19 outputs with printed normals. 32 velocity mini-keys, joystick
(bend, glide, vibrato, hold), arpeggiator, MIDI/USB-to-CV, analogue clock in/out.

Sources: PWM Getting Started Guide v4.1; PWM specifications and connectivity pages; the
top-panel graphic on Suren Forward's eight patch sheets (labels and normals read from it,
patches transcribed); Sound On Sound, MusicRadar, Molten, Synth and Software and Gearnews
reviews for the joystick and arpeggiator.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
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


def jack(id, label, direction, signal, node, fn, location=None, connector="3.5 mm TS", **kw):
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
    "id": "pwm-malevolent", "manufacturer": "PWM (Paul Whittington Group)", "model": "Malevolent Modular Pure Analogue Synthesiser",
    "category": "semi-modular analogue monosynth, 32 velocity-sensitive mini keys, 19 inputs and 19 outputs",
    "based_on": "Original design (UK, 2022); analogue signal path by Future Sound Systems.",
    "sources": [
        {"id": "guide", "title": "PWM Malevolent Getting Started Guide (doc v4.1)", "kind": "quick_start_guide", "file": "PWM_Malevolent_Getting_Started_Guide.pdf", "pages": 12,
         "note": "Box contents, power, outputs, first sound, tuning (octave stretch), USB-MIDI, channel select, local off, resets."},
        {"id": "specs", "title": "PWM, 'Malevolent Specifications' and 'Connectivity' pages", "kind": "spec_sheet", "file": "https://www.1pwm.com/malevolentspecifications",
         "note": "Section list, 19/19 patch points, arpeggiator, keyboard, dimensions, weight, price; rear panel connections."},
        {"id": "patch_sheets", "title": "Suren Forward patch sheets (8)", "kind": "other", "file": "Suren_Forward_Patch_Sheets.zip",
         "note": "Full top-panel graphic: every control and jack label and the printed normal under each input; eight patches transcribed as example patches."},
        {"id": "paul_patches", "title": "Paul Whittington patch sheets (3)", "kind": "other", "file": "Pauls_Patches.zip",
         "note": "Nasty Bass FX, Reece Bass, Sweet Lead: cables, wave buttons and knob positions."},
        {"id": "reviews", "title": "Sound On Sound, MusicRadar, Molten Music Technology, Synth and Software, Gearnews reviews", "kind": "other", "file": "https://www.soundonsound.com/reviews/pwm-malevolent",
         "note": "Joystick functions (bend, glide, vibrato, hold, latch), arpeggiator mode selection, dedicated vibrato LFO."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic (sends polyphonic MIDI as a controller)",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No presets; MIDI channel, octave stretch, bend range and hold mode are remembered.",
    "semi_modular": True, "panel_counts": {"keys": 32, "patch_inputs": 19, "patch_outputs": 19},
    "summary": ("Two 4046-core VCOs with saw, triangle and pulse outputs plus an OUT that mixes whichever waves are selected by three buttons; shape (pulse width / wave shaping) with "
                "mod amount, and two FM inputs with amounts, normalled to LFO triangle, Env 1 and LFO triangle. A mixer adds noise and an aux input (VCO levels sit in the VCO sections). "
                "The opto-FET 2-pole Sallen-Key filter has separate low-pass, band-pass and high-pass inputs (low-pass normalled from the mix) and two FM inputs. Two ADSRs with separate "
                "gates; a VCA with drive, two AM inputs (Env 2, LFO triangle) and a drone/gated switch. Keys output pitch, velocity and gate; the joystick bends, glides, adds vibrato and holds."),
}

mod("keys", "voice_allocator", "Keyboard, joystick and arpeggiator", "KEYS / keyboard section", "32 velocity-sensitive mini keys (octave ±4); MIDI/USB to 1V/oct CV and gate (analogue pitch and gate path); arpeggiator; hold; local off.",
    ["keys.midi_in", "keys.clock_in", "keys.joy"], ["keys.pitch", "keys.velocity", "keys.gate", "keys.clock_out"], props={"keys": 32})
mod("joy", "manual_controller", "Joystick", "left of the keyboard", "X: pitch bend. Y up: glide (more = slower), or vibrato depth with VIBRATO on (dedicated ~5 Hz vibrato LFO). Y down: momentary hold; click: latching hold.",
    [], ["joy.out"])
mod("lfo", "lfo", "LFO", "LFO", "Analogue LFO with triangle and square outputs and RATE; LED.", [], ["lfo.tri", "lfo.square"])
for n in (1, 2):
    mod(f"vco{n}", "oscillator", f"VCO {n}", f"VCO {n}", "4046-based VCO: saw, triangle, pulse outputs; OUT mixes the waves selected by the three buttons; shape with mod amount; two FM inputs with amounts; coarse, fine; level to the mixer.",
        [f"vco{n}.voct", f"vco{n}.shape", f"vco{n}.fm1", f"vco{n}.fm2"], [f"vco{n}.saw", f"vco{n}.tri", f"vco{n}.pulse", f"vco{n}.out"])
mod("noise", "noise", "Noise", "MIXER", "Noise source with output jack and mixer level.", [], ["noise.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Sums VCO 1 and VCO 2 (levels in the VCO sections), noise and the aux input.", ["mixer.vco1", "mixer.vco2", "mixer.noise", "mixer.aux"], ["mixer.out"])
mod("vcf", "filter", "VCF", "VCF", "Opto-FET controlled 2-pole Sallen-Key multimode filter: separate low-pass, band-pass and high-pass inputs into one output; cutoff, resonance (self-oscillates early); two FM inputs.",
    ["vcf.lp", "vcf.bp", "vcf.hp", "vcf.fm1", "vcf.fm2"], ["vcf.out"], props={"poles": 2, "topology": "Sallen-Key", "control": "opto-FET"})
for n in (1, 2):
    mod(f"env{n}", "envelope", f"Envelope {n}", f"ENV {n}", "ADSR with its own gate input and output.", [f"env{n}.gate"], [f"env{n}.out"])
mod("vca", "vca", "VCA", "ENVS (unlabelled VCA section)", "VCA with input (normalled from the filter), DRIVE (overdrive), AM 1 (Env 2) and AM 2 (LFO triangle) inputs with amounts, and a DRONE / GATED switch.",
    ["vca.in", "vca.am1", "vca.am2"], ["vca.out"])
mod("out", "output", "Output", "OUT / rear panel", "Top-panel OUT (3.5 mm, unaffected by MASTER VOL); MASTER VOL to the rear line out and headphones.", ["out.in"], ["out.patch", "out.line", "out.phones"])

# ---------------------------------------------------------------- parameters
knob("keys.arp_rate", "keys", "ARP RATE / SYNC", "Arpeggiator rate, or division when a clock is detected.")
par("keys.arp", "keys", "ARP", "boolean", "Arpeggiator on; hold ARP and circle the joystick to choose the mode.", control="push_button")
par("keys.arp_mode", "keys", "Arp mode", "enum", "Note order.", values=[{"value": v} for v in ["up", "down", "up_down_1", "up_down_2", "played", "random"]],
    access=[{"type": "gesture", "gesture": "hold ARP and move the joystick in a circle", "when": "any_time"}])
par("keys.arp_range", "keys", "Arp range", "integer", "Octave range.", range={"min": 1, "max": 6}, access=[{"type": "gesture", "gesture": "ARP with the OCTAVE buttons", "when": "any_time"}], confidence="inferred",
    note="Reviews say range is set with the octave buttons; the exact gesture is undocumented.")
par("keys.octave", "keys", "OCTAVE - / +", "integer", "Keyboard shift ±4 octaves; with VIBRATO held during tuning, stretches the octave.", control="push_button", range={"min": -4, "max": 4})
par("keys.vibrato", "joy", "VIBRATO", "boolean", "Joystick up gives vibrato instead of glide; hold and play a key for the tuning routine.", control="push_button")
par("joy.position", "joy", "JOYSTICK", "continuous", "Bend (X), glide or vibrato (Y up), hold (Y down), latch toggle (click).", control="joystick", panel_scale={"min": -1, "max": 1})
par("keys.hold_mode", "keys", "Hold mode", "enum", "Momentary or latching hold (click the joystick); remembered.", values=[{"value": "momentary"}, {"value": "latching"}], memory="global",
    access=[{"type": "gesture", "gesture": "click the joystick", "when": "any_time"}])
knob("lfo.rate", "lfo", "LFO RATE", "LFO speed.")
for n in (1, 2):
    v = f"vco{n}"
    knob(f"{v}.coarse", v, f"VCO {n} COARSE", "Coarse tuning.")
    knob(f"{v}.fine", v, f"VCO {n} FINE", "Fine tuning.")
    knob(f"{v}.shape", v, f"VCO {n} SHAPE", "Pulse width / wave shape.")
    knob(f"{v}.shape_mod", v, f"VCO {n} SHAPE MOD", "Depth of the SHAPE input (normalled LFO triangle).")
    knob(f"{v}.fm1", v, f"VCO {n} FM 1", "Depth of FM 1 (normalled Env 1).")
    knob(f"{v}.fm2", v, f"VCO {n} FM 2", "Depth of FM 2 (normalled LFO triangle).")
    knob(f"{v}.level", v, f"VCO {n} LEVEL", "Level into the mixer.")
    for w in ("saw", "tri", "pulse"):
        par(f"{v}.sel_{w}", v, f"VCO {n} {w.upper()} button", "boolean", f"Adds the {w} to OUT and the mixer (LED lit).", control="push_button")
knob("mixer.aux", "mixer", "AUX LEVEL", "Aux input level.")
knob("mixer.noise", "mixer", "NOISE LEVEL", "Noise level.")
knob("vcf.cutoff", "vcf", "CUT OFF", "Cutoff.")
knob("vcf.resonance", "vcf", "RESONANCE", "Resonance; self-oscillates.")
knob("vcf.fm1", "vcf", "VCF FM 1", "Depth of FM 1 (normalled Env 1).")
knob("vcf.fm2", "vcf", "VCF FM 2", "Depth of FM 2 (normalled LFO triangle).")
for n in (1, 2):
    for k in ("attack", "decay", "sustain", "release"):
        knob(f"env{n}.{k}", f"env{n}", f"ENV {n} {k.upper()}", f"Envelope {k}.")
par("vca.mode", "vca", "DRONE / GATED", "enum", "Drone holds the VCA open; gated follows AM 1 (Env 2).", control="toggle_switch", values=[{"value": "drone"}, {"value": "gated"}], default="gated")
knob("vca.drive", "vca", "DRIVE", "VCA overdrive.")
knob("vca.am1", "vca", "AM 1", "Depth of AM 1 (normalled Env 2).")
knob("vca.am2", "vca", "AM 2", "Depth of AM 2 (normalled LFO triangle).")
knob("out.master", "out", "MASTER VOL", "Line out and headphones (not the top-panel OUT).")
par("sys.midi_channel", "keys", "MIDI channel", "integer", "1-16 (default 1): hold a key while powering on (lowest F = 1, highest G = 16).", memory="global", range={"min": 1, "max": 16},
    access=[{"type": "gesture", "gesture": "hold a key while powering on", "when": "power_on"}])
par("sys.local_off", "keys", "Local Off", "boolean", "Hold ARP while powering on (not saved).", access=[{"type": "gesture", "gesture": "hold ARP while powering on", "when": "power_on"}])
par("sys.stretch", "keys", "Octave stretch tuning", "integer", "Hold VIBRATO, press a key, tap OCTAVE +/- (both resets); saved.", memory="global",
    access=[{"type": "gesture", "gesture": "hold VIBRATO, play a key, tap OCTAVE +/-", "when": "any_time"}], range={"min": -64, "max": 63}, confidence="inferred", note="Step range not stated.")
par("sys.reset", "keys", "Reset to defaults", "boolean", "Hold the top C while powering on: MIDI channel, stretch, bend range and hold mode.", access=[{"type": "gesture", "gesture": "hold top C while powering on", "when": "power_on"}])
par("sys.power", "out", "POWER", "boolean", "Power switch.", access=[{"type": "rear_panel", "control": "toggle_switch"}])

# ---------------------------------------------------------------- patch points (19 in, 19 out)
for nm, node, fn, sig in (("PITCH", "keys.pitch", "Keyboard/MIDI pitch, 1V/oct.", "cv"), ("VELOCITY", "keys.velocity", "Key velocity CV.", "cv"), ("GATE", "keys.gate", "Key gate.", "gate")):
    jack(f"jack.keys_{nm.lower()}", f"KEYS {nm}", "out", sig, node, fn)
jack("jack.lfo_tri", "LFO TRIANGLE", "out", "cv", "lfo.tri", "LFO triangle.")
jack("jack.lfo_sq", "LFO SQUARE", "out", "cv", "lfo.square", "LFO square.")
for n in (1, 2):
    for w, lab in (("saw", "SAW"), ("tri", "TRIANGLE"), ("pulse", "PULSE"), ("out", "OUT")):
        jack(f"jack.vco{n}_{w}", f"VCO {n} {lab}", "out", "audio", f"vco{n}.{w}", "Mix of the selected waves." if w == "out" else f"{lab.title()} wave.")
    for i, (lab, node, fn) in enumerate((("1V/OCT", f"vco{n}.voct", "Pitch; normalled from KEY PITCH."), ("SHAPE", f"vco{n}.shape", "Shape CV; normalled from LFO TRIANGLE."),
                                         ("FM 1", f"vco{n}.fm1", "Normalled from ENV 1."), ("FM 2", f"vco{n}.fm2", "Normalled from LFO TRIANGLE."))):
        jack(f"jack.vco{n}_{lab.lower().replace(' ', '').replace('/', '')}", f"VCO {n} {lab}", "in", "cv", node, fn)
jack("jack.noise", "NOISE", "out", "audio", "noise.out", "Noise.")
jack("jack.mix_out", "MIX OUT", "out", "audio", "mixer.out", "Mixer output.")
jack("jack.aux", "AUX", "in", "audio", "mixer.aux", "External or patched audio into the mixer.")
jack("jack.vcf_lp", "LOW PASS", "in", "audio", "vcf.lp", "Low-pass input; normalled from MIX OUT.")
jack("jack.vcf_bp", "BAND PASS", "in", "audio", "vcf.bp", "Band-pass input.")
jack("jack.vcf_hp", "HIGH PASS", "in", "audio", "vcf.hp", "High-pass input.")
jack("jack.vcf_fm1", "VCF FM 1", "in", "cv", "vcf.fm1", "Normalled from ENV 1.")
jack("jack.vcf_fm2", "VCF FM 2", "in", "cv", "vcf.fm2", "Normalled from LFO TRIANGLE.")
jack("jack.vcf_out", "VCF OUT", "out", "audio", "vcf.out", "Filter output.")
jack("jack.env1_out", "ENV 1 OUT", "out", "cv", "env1.out", "Envelope 1.")
jack("jack.env2_out", "ENV 2 OUT", "out", "cv", "env2.out", "Envelope 2.")
jack("jack.vca_in", "INPUT (VCA)", "in", "audio", "vca.in", "VCA input; normalled from VCF OUT.")
jack("jack.env1_gate", "GATE (ENV 1)", "in", "gate", "env1.gate", "Normalled from KEY GATE.")
jack("jack.env2_gate", "GATE (ENV 2)", "in", "gate", "env2.gate", "Normalled from KEY GATE.")
jack("jack.vca_am1", "AM 1", "in", "cv", "vca.am1", "Normalled from ENV 2.")
jack("jack.vca_am2", "AM 2", "in", "cv", "vca.am2", "Normalled from LFO TRIANGLE.")
jack("jack.out", "OUT", "out", "audio", "out.patch", "VCA output for modular gear (not affected by MASTER VOL).")
jack("jack.line_out", "LINE OUT", "out", "audio", "out.line", "Rear 1/4\" TS line output.", location="rear", connector="6.35 mm TS")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Rear 1/4\" TRS headphones.", location="rear", connector="6.35 mm TRS")
jack("jack.clock_in", "CLOCK IN", "in", "clock", "keys.clock_in", "Analogue clock; the arpeggiator syncs automatically.", location="rear")
jack("jack.clock_out", "CLOCK OUT", "out", "clock", "keys.clock_out", "Clock out while the arpeggiator runs.", location="rear")
jack("jack.midi_in", "MIDI IN", "in", "midi", "keys.midi_in", "MIDI in.", location="rear", connector="5-pin DIN", confidence="inferred", note="Connector type not stated.")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", location="rear", connector="5-pin DIN", confidence="inferred")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB-C: class-compliant MIDI; bus power.", location="rear", connector="USB-C")
jack("jack.power", "POWER", "in", "power", None, "9 V DC 600 mA.", location="rear", connector="DC barrel")

# ---------------------------------------------------------------- normals and internal wiring
con("joy.out", "keys.joy", "cv")
for n in (1, 2):
    v = f"vco{n}"
    con("keys.pitch", f"{v}.voct", "cv", broken_by=f"jack.{v}_1voct")
    con("lfo.tri", f"{v}.shape", "cv", broken_by=f"jack.{v}_shape", amount=f"{v}.shape_mod")
    con("env1.out", f"{v}.fm1", "cv", broken_by=f"jack.{v}_fm1", amount=f"{v}.fm1")
    con("lfo.tri", f"{v}.fm2", "cv", broken_by=f"jack.{v}_fm2", amount=f"{v}.fm2")
    con(f"{v}.out", f"mixer.vco{n}", amount=f"{v}.level", note="Selected waves.")
con("noise.out", "mixer.noise", amount="mixer.noise")
con("mixer.out", "vcf.lp", broken_by="jack.vcf_lp")
con("env1.out", "vcf.fm1", "cv", broken_by="jack.vcf_fm1", amount="vcf.fm1")
con("lfo.tri", "vcf.fm2", "cv", broken_by="jack.vcf_fm2", amount="vcf.fm2")
con("vcf.out", "vca.in", broken_by="jack.vca_in")
con("keys.gate", "env1.gate", "gate", broken_by="jack.env1_gate")
con("keys.gate", "env2.gate", "gate", broken_by="jack.env2_gate")
con("env2.out", "vca.am1", "cv", broken_by="jack.vca_am1", amount="vca.am1")
con("lfo.tri", "vca.am2", "cv", broken_by="jack.vca_am2", amount="vca.am2")
con("vca.out", "out.in", amount="vca.drive")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
SHEET = "Suren Forward patch sheet (transcribed from the drawing)"
PAUL = "Paul Whittington (PWM) patch sheet; knob values read from the drawn pointers on a 0-10 scale (7 o'clock = 0, 12 = 5, 5 o'clock = 10), approximate to about half a unit"
D["example_patches"] = [
    {"id": "chordal", "name": "Chordal", "source": SHEET, "confidence": "stated",
     "cords": [["jack.keys_pitch", "jack.vco2_shape"], ["jack.lfo_tri", "jack.vco1_shape"], ["jack.vco1_saw", "jack.aux"], ["jack.keys_velocity", "jack.vcf_fm1"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_pulse": True, "vco2.sel_saw": True}},
    {"id": "extreme", "name": "Extreme", "source": SHEET, "confidence": "stated",
     "cords": [["jack.keys_pitch", "jack.vca_am1"], ["jack.vco1_tri", "jack.vco1_shape"], ["jack.lfo_sq", "jack.vco1_1voct"]],
     "settings": {"vco1.sel_pulse": True, "vco2.sel_tri": True}, "description": "VCO 1 shapes itself; the LFO square jumps VCO 1's pitch (replacing key pitch)."},
    {"id": "fm_phasers", "name": "FM Phasers", "source": SHEET, "confidence": "stated",
     "cords": [["jack.keys_pitch", "jack.vca_am2"], ["jack.keys_velocity", "jack.vcf_fm1"], ["jack.vco1_saw", "jack.vco1_shape"], ["jack.env2_out", "jack.vca_am1"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_tri": True, "vco1.sel_pulse": True, "vco2.sel_saw": True, "vco2.sel_tri": True, "vco2.sel_pulse": True}},
    {"id": "plink", "name": "Plink", "source": SHEET, "confidence": "stated",
     "cords": [["jack.keys_velocity", "jack.vco2_shape"], ["jack.lfo_tri", "jack.vco1_shape"], ["jack.vco2_saw", "jack.vcf_fm1"], ["jack.mix_out", "jack.vcf_bp"]],
     "settings": {"vco1.sel_saw": True, "vco2.sel_saw": True}, "description": "Mix into the band-pass input (breaking nothing: the low-pass keeps its normal)."},
    {"id": "sentient_bass", "name": "Sentient Bass", "source": SHEET, "confidence": "stated",
     "cords": [["jack.lfo_tri", "jack.vco1_shape"], ["jack.keys_velocity", "jack.vcf_fm2"], ["jack.mix_out", "jack.vcf_hp"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_tri": True, "vco2.sel_saw": True, "vco2.sel_tri": True}},
    {"id": "tangerine", "name": "Tangerine", "source": SHEET, "confidence": "stated",
     "cords": [["jack.keys_pitch", "jack.vcf_fm1"], ["jack.lfo_tri", "jack.vco1_shape"], ["jack.keys_velocity", "jack.env2_gate"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_tri": True, "vco2.sel_saw": True}, "description": "Pitch tracks the filter; velocity gates the amp envelope."},
    {"id": "twin", "name": "Twin", "source": SHEET, "confidence": "stated",
     "cords": [["jack.lfo_tri", "jack.vco1_shape"], ["jack.keys_velocity", "jack.vcf_hp"], ["jack.env2_out", "jack.vco1_fm2"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_tri": True, "vco1.sel_pulse": True, "vco2.sel_tri": True},
     "description": "Also an external clock into ENV 1's GATE (drawn as 'Clock In', outside the panel)."},
    {"id": "waves", "name": "Waves", "source": SHEET, "confidence": "stated",
     "cords": [["jack.lfo_tri", "jack.vco1_shape"], ["jack.keys_pitch", "jack.vcf_fm1"], ["jack.keys_velocity", "jack.env2_gate"]],
     "settings": {"vco1.sel_saw": True, "vco1.sel_tri": True, "vco2.sel_saw": True}},
    {"id": "nasty_bass_fx", "name": "Nasty Bass FX", "source": PAUL, "confidence": "stated",
     "cords": [["jack.vco1_tri", "jack.vco2_fm2"], ["jack.mix_out", "jack.vcf_hp"]],
     "settings": {"vco2.sel_saw": True, "keys.arp_rate": 4.5, "lfo.rate": 4.3,
                  "vco1.coarse": 1, "vco1.fine": 1, "vco1.shape": 5, "vco1.shape_mod": 1, "vco1.fm1": 1, "vco1.fm2": 1, "vco1.level": 1,
                  "vco2.coarse": 4.3, "vco2.fine": 5, "vco2.shape": 5, "vco2.shape_mod": 4.3, "vco2.fm1": 5.5, "vco2.fm2": 5.4, "vco2.level": 8.3,
                  "env1.attack": 1, "env1.decay": 5, "env1.sustain": 0.5, "env1.release": 1, "env2.attack": 1, "env2.decay": 1, "env2.sustain": 9.5, "env2.release": 8.3,
                  "mixer.aux": 1, "mixer.noise": 1, "vcf.fm1": 3.3, "vcf.fm2": 1, "vcf.cutoff": 3.3, "vcf.resonance": 9, "vca.am2": 1, "out.master": 1.7},
     "description": "VCO 1 (no waves selected, so silent) is used purely as an FM source for VCO 2's FM 2; the mix also feeds the high-pass input. Drive and AM 1 are drawn without pointers."},
    {"id": "reece_bass", "name": "Reece Bass", "source": PAUL, "confidence": "stated",
     "cords": [["jack.keys_velocity", "jack.vcf_fm2"], ["jack.vco2_out", "jack.vco1_fm1"]],
     "settings": {"vco1.sel_saw": True, "vco2.sel_pulse": True, "keys.arp_rate": 4.5, "lfo.rate": 4.3,
                  "vco1.coarse": 1.7, "vco1.fine": 4.8, "vco1.shape": 5, "vco1.shape_mod": 1, "vco1.fm1": 5.7, "vco1.fm2": 1, "vco1.level": 9.4,
                  "vco2.coarse": 4, "vco2.fine": 9.5, "vco2.shape": 5, "vco2.shape_mod": 1, "vco2.fm1": 1, "vco2.fm2": 1, "vco2.level": 9.3,
                  "env1.attack": 1, "env1.decay": 5, "env1.sustain": 0.5, "env1.release": 1, "env2.attack": 1, "env2.decay": 1, "env2.sustain": 9.5, "env2.release": 1.7,
                  "mixer.noise": 1, "vcf.fm1": 1.2, "vcf.fm2": 6.7, "vcf.cutoff": 1.7, "vcf.resonance": 9.5, "vca.drive": 1, "vca.am1": 9.5, "vca.am2": 1, "out.master": 3.3},
     "description": "VCO 2 (pulse, fine tuned up for the Reece detune) cross-modulates VCO 1 (saw) through FM 1; velocity opens the filter via FM 2. Aux Level is drawn without a pointer."},
    {"id": "sweet_lead", "name": "Sweet Lead", "source": PAUL, "confidence": "stated",
     "cords": [["jack.keys_velocity", "jack.vcf_fm2"], ["jack.vco1_pulse", "jack.aux"]],
     "settings": {"vco1.sel_tri": True, "vco2.sel_tri": True, "keys.arp_rate": 4.5, "lfo.rate": 4.3,
                  "vco1.coarse": 1.5, "vco1.fine": 4.6, "vco1.shape": 5, "vco1.shape_mod": 1, "vco1.fm1": 1, "vco1.fm2": 1, "vco1.level": 6.9,
                  "vco2.coarse": 3.3, "vco2.fine": 7.2, "vco2.shape": 5, "vco2.shape_mod": 1, "vco2.fm1": 1, "vco2.fm2": 1, "vco2.level": 8.3,
                  "env1.attack": 1, "env1.decay": 5, "env1.sustain": 0.5, "env1.release": 1, "env2.attack": 0.6, "env2.decay": 1, "env2.sustain": 9.5, "env2.release": 1.5,
                  "mixer.aux": 5, "mixer.noise": 1, "vcf.fm1": 1, "vcf.fm2": 7.2, "vcf.cutoff": 3.5, "vcf.resonance": 9.5, "vca.drive": 1, "vca.am1": 9.5, "vca.am2": 1, "out.master": 3.3},
     "description": "Both VCOs on triangle; VCO 1's pulse output is added through the aux input as an extra voice; velocity opens the filter via FM 2."},
]
D["indicators"] = [
    {"id": "wave_leds", "module": "vco1", "label": "wave select LEDs", "kind": "led", "function": "Selected waves per VCO."},
    {"id": "section_leds", "module": "keys", "label": "KEYBOARD, LFO, FILTER, ENV 1, ENV 2, OUT LEDs", "kind": "led", "function": "Activity of keyboard gate, LFO rate, filter, envelopes and output."},
    {"id": "octave_leds", "module": "keys", "label": "octave LEDs", "kind": "led", "function": "Octave shift (inferred)."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Normalled signal path", "applies_to": ["vco1", "vco2", "mixer", "vcf", "vca"],
     "rule": "With nothing patched: key pitch to both VCOs, LFO triangle to shape and FM 2, Env 1 to FM 1 (VCOs and filter), mix into the low-pass input, filter into the VCA, key gate to both envelopes, Env 2 and LFO triangle to the VCA's AM inputs. A VCO sounds only when a wave button is lit and its LEVEL is up."},
    {"id": "b02", "name": "Multimode filter inputs", "applies_to": ["vcf"], "rule": "Separate LOW PASS (normalled from the mix), BAND PASS and HIGH PASS inputs into one 2-pole output; different sources can be filtered differently at once."},
    {"id": "b03", "name": "Joystick", "applies_to": ["joy", "keys"],
     "rule": "Left/right bends pitch. Up: glide (a little = quick, more = slower), or vibrato depth when VIBRATO is on (a dedicated ~5 Hz vibrato LFO). Down: momentary hold; click: toggle latching hold (also latches the arpeggio). Transmits mod and vibrato over MIDI."},
    {"id": "b04", "name": "Arpeggiator", "applies_to": ["keys"],
     "rule": "Six modes (up, down, up/down 1 and 2, played, random) chosen by holding ARP and circling the joystick; up to six octaves; auto-syncs to analogue, MIDI or USB clock with selectable divisions; outputs clock while running."},
    {"id": "b05", "name": "MIDI and CV", "applies_to": ["keys"],
     "rule": "Class-compliant USB and DIN MIDI on channel 1 by default; analogue pitch and gate conversion; usable as a polyphonic MIDI controller; local off at power-up."},
    {"id": "b06", "name": "Tuning", "applies_to": ["vco1", "vco2"], "rule": "Temperature-compensated; warm up a minute or two. The VIBRATO tuning routine plays a note with octaves above and below while OCTAVE +/- stretches the octave scaling."},
]
D["midi"] = {"receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "control_change", "note": "mod/vibrato"}, {"message": "clock"}],
             "transmits": [{"message": "note_on", "note": "velocity; polyphonic as a controller"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "control_change", "note": "joystick modulation and vibrato"}, {"message": "clock", "note": "while the arpeggiator runs"}],
             "channel_note": "Channel 1-16 chosen at power-up (default 1).", "note": "No CC control of panel parameters (all analogue)."}
D["specifications"] = {
    "voices": 1, "oscillators": "2 VCOs (4046 core), saw/triangle/pulse + mix", "filter": "2-pole Sallen-Key multimode, opto-FET", "envelopes": "2 ADSR", "lfo": "triangle, square",
    "patch_points": {"inputs": 19, "outputs": 19}, "keyboard": "32 velocity-sensitive mini keys, octave ±4", "arpeggiator": "6 modes, 6 octaves, clock sync",
    "connections": {"patch": "3.5 mm", "line_out": "1/4\" TS", "phones": "1/4\" TRS", "midi": "in, out", "usb": "USB-C (bus power)", "clock": "in, out"},
    "power": "9 V DC 600 mA or USB bus power", "dimensions_mm": {"w": 490, "d": 250, "h": 80}, "weight_kg": 2.61, "price": "USD 629.99 / EUR 629.99 / GBP 559.99",
}
D["omitted_from_source"] = ["first-sound knob diagram", "warranty text", "patch sheet knob positions (cables and wave buttons only)"]
D["not_in_source"] = ["control voltage ranges", "LFO and envelope time ranges", "the arp range gesture and the joystick-to-mode map", "pitch bend range adjustment method"]
D["source_inconsistencies"] = [
    "Gearnews describes the VCOs as offering square waves; the panel and specifications say pulse (with shape).",
    "Synth and Software says the joystick's down position duplicates the Drone/Hold function; other reviews and the guide describe it as keyboard hold, separate from the VCA's DRONE switch.",
    "The guide says the reset clears the 'Pitch Bend range', but no method for setting the bend range is documented.",
    "Reviewers note pitch bend appears to stop working while VIBRATO is on (observed behaviour, not documented).",
]
D["modelling_gaps"] = [
    {"topic": "Thin documentation", "detail": "PWM provides only a getting started guide; panel details come from the patch-sheet graphic and control behaviour from reviews."},
    {"topic": "Joystick", "detail": "Modelled as one controller feeding the keyboard logic; its glide/vibrato/hold split is a behaviour."},
    {"topic": "Patch knob settings", "detail": "Suren Forward patches record cables and wave buttons only; Paul's patches also record knob positions (approximate, read from the drawings)."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "example_patches", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/pwm-malevolent_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
