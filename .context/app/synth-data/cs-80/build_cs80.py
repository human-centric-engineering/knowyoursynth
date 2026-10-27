#!/usr/bin/env python3
"""Assemble the Yamaha CS-80 device file (schema 0.13.0).

Eight-note polyphonic analogue synth (1977): each note sounds two complete channels
(16 VCOs in all). Per channel: sawtooth VCO with wave shape converter (square with
PWM, saw, sine) and noise; HPF and LPF with separate resonance under an IL/AL/A/D/R
filter envelope; sine bypassing the filter into the VCA; ADSR VCA envelope; initial
(velocity) and after (pressure) touch on brilliance and level. Shared: preset/memory
tone selectors, mix, detune, brilliance/resonance offsets, keyboard scaling, touch
pitchbend and aftertouch sub-oscillator routing, sub oscillator, ring modulator,
sustain, portamento/glissando, tremolo/chorus, ribbon controller.

Source: Yamaha CS-80 Instruction Manual (scan with rough OCR; Section IV control
descriptions, specifications and the ribbon controller section read).
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
CH = (("ch1", "I"), ("ch2", "II"))
PRESETS = ["STRING 1", "STRING 2", "STRING 3", "STRING 4", "BRASS 1", "BRASS 2", "BRASS 3", "FLUTE", "ELECTRIC PIANO", "BASS", "CLAVICHORD", "HARPSICHORD 1", "HARPSICHORD 2",
           "ORGAN 1", "ORGAN 2", "GUITAR 1", "GUITAR 2", "FUNKY 1", "FUNKY 2", "FUNKY 3", "FUNKY 4"]


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="fader", ref=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref is not None:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = kw.pop("memory", "none")
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("how")} if "how" in kw else {})}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def lever(id, module, label, fn, ref, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, ref=ref, **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
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


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "yamaha-cs-80", "manufacturer": "Yamaha", "model": "CS-80 Polyphonic Synthesizer",
    "category": "8-note polyphonic analogue synthesizer, 61 keys with velocity and per-key aftertouch, two channels per note, ribbon controller",
    "based_on": "Original design, 1977; Yamaha's flagship of the CS series (CS-50, CS-60, CS-80) after the GX-1.",
    "sources": [{"id": "manual", "title": "Yamaha CS-80 Polyphonic Synthesizer Instruction Manual", "kind": "user_manual", "file": "Yamaha_CS-80_Owner_s_Manual.pdf", "pages": 56,
                 "note": "Scanned with a rough OCR layer; Section IV (technical control descriptions, controls [1]-[46]), block diagrams text, specifications and ribbon section read."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 8,
    "polyphony_mode": "8 notes; each note drives channel I and channel II together (16 VCOs, VCFs, VCAs and EG sets), blended by the MIX lever",
    "poly_chain_max_units": None, "patch_memory": False,
    "patch_memory_note": "No electronic memory. Each channel offers 11 fixed presets, two memories and one programmable panel; the four memories are miniature physical copies of the panel controls under a cover, so 'storing' means setting tiny sliders by hand.",
    "semi_modular": False, "panel_counts": {"keys": 61, "programmable_panels": 2, "memory_panels": 4, "tone_selector_rows": 2},
    "summary": ("Two channels per note. Each channel: a sawtooth VCO whose wave shape converter gives square (with PWM from its own sub oscillator), sawtooth and sine, plus white "
                "noise; a high-pass and a low-pass filter in series with separate resonance, moved by an IL/AL/A/D/R envelope; the sine bypasses the filter into the VCA, which "
                "has an ADSR. Velocity (INITIAL) and per-key pressure (AFTER) raise brilliance and level. Shared controls blend the channels, detune channel II, offset brilliance "
                "and resonance, scale brightness and level across the keyboard, add velocity pitchbend and pressure-controlled sub-oscillator modulation, plus a global sub oscillator, "
                "ring modulator, sustain, portamento/glissando, tremolo/chorus (rotary-speaker-like in stereo) and a ribbon controller."),
}

# ---------------------------------------------------------------- per-channel voice modules
for c_, n in CH:
    sec = f"PROGRAMMABLE PANEL {n}"
    mod(f"{c_}_vco", "oscillator", f"Channel {n} VCO", f"{sec} VCO", "Sawtooth VCO with wave shape converter: square (variable PW, PWM), sawtooth, sine; FEET sets the range.",
        [f"{c_}_vco.pitch_cv", f"{c_}_vco.pwm_cv"], [f"{c_}_vco.square", f"{c_}_vco.saw", f"{c_}_vco.sine"])
    mod(f"{c_}_pwm", "lfo", f"Channel {n} PWM oscillator", f"{sec} VCO", "Pulse-width modulation oscillator (SPEED, PWM depth).", [], [f"{c_}_pwm.out"])
    mod(f"{c_}_noise", "noise", f"Channel {n} noise", f"{sec} VCO", "White noise into the VCO mix.", [], [f"{c_}_noise.out"])
    mod(f"{c_}_mix", "mixer", f"Channel {n} VCO mix", f"{sec} VCO", "Square and sawtooth (switched on/off) plus noise level into the filters.", [f"{c_}_mix.square", f"{c_}_mix.saw", f"{c_}_mix.noise"], [f"{c_}_mix.out"])
    mod(f"{c_}_vcf", "filter", f"Channel {n} VCF (HPF + LPF)", f"{sec} VCF", "High-pass then low-pass filter, each with cutoff and resonance (RES H, RES L); cutoffs moved together by the filter EG, brilliance and touch.",
        [f"{c_}_vcf.in", f"{c_}_vcf.cutoff_cv", f"{c_}_vcf.res_cv"], [f"{c_}_vcf.out"], props={"stages": ["HPF", "LPF"]})
    mod(f"{c_}_fenv", "envelope", f"Channel {n} filter EG (IL-AL-A-D-R)", f"{sec} VCF", "Starts from IL (below the set cutoffs), rises over A to AL (above), decays over D to the set cutoffs, releases over R back to IL. Attack 1 ms-1 s; decay and release 10 ms-10 s.",
        [f"{c_}_fenv.gate"], [f"{c_}_fenv.out"], props={"attack_s": [0.001, 1], "decay_s": [0.01, 10], "release_s": [0.01, 10]})
    mod(f"{c_}_vca", "vca", f"Channel {n} VCA", f"{sec} VCA", "Mixes the filtered signal (VCF LEVEL) with the unfiltered sine (SINE WAVE LEVEL); ADSR envelope; LEVEL sets the maximum.",
        [f"{c_}_vca.filtered", f"{c_}_vca.sine", f"{c_}_vca.cv"], [f"{c_}_vca.out"])
    mod(f"{c_}_aenv", "envelope", f"Channel {n} VCA EG (ADSR)", f"{sec} VCA", "Attack 1 ms-1 s, decay and release 10 ms-10 s, sustain level.", [f"{c_}_aenv.gate", f"{c_}_aenv.touch"], [f"{c_}_aenv.out"],
        props={"attack_s": [0.001, 1], "decay_s": [0.01, 10], "release_s": [0.01, 10]})
mod("kbd", "voice_allocator", "Keyboard and note assigner", "KEYBOARD", "61 keys with velocity (INITIAL) and individual key pressure (AFTER); digital assignment of 8 notes to the voice boards; sustain and portamento/glissando.",
    ["kbd.sustain_fs"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.pressure"], scope="common", props={"keys": 61})
mod("ribbon", "manual_controller", "Ribbon controller", "above the keyboard", "Touch anywhere as the reference and slide: up to about an octave sharp to the right, far wider downward (into sub-audio).", [], ["ribbon.out"], scope="common")
mod("chmix", "mixer", "Channel MIX", "MIX lever [4]", "Blends channel I and II for each note into the shared processing.", ["chmix.ch1", "chmix.ch2"], ["chmix.out"])
mod("subosc", "lfo", "Sub oscillator", "SUB OSCILLATOR [11]", "Sine, sawtooth, inverted sawtooth, square, white noise or external input, applied equally to all voices' VCO, VCF and VCA by depth levers.",
    ["subosc.ext", "subosc.rate_cv"], ["subosc.out"], scope="common")
mod("ringmod", "ring_modulator", "Ring modulator", "RING MODULATOR [16]", "Sine-wave ring modulation of both channels and all notes; SPEED, MODULATION depth, and an attack/decay envelope (DEPTH) on the speed.", ["ringmod.in"],
    ["ringmod.out"], scope="common")
mod("tremolo", "chorus", "Tremolo / chorus", "TREMOLO [15]", "Amplitude and phase modulation: TREMOLO, or slower CHORUS; with the L and R outputs, a rotary-speaker-like effect.", ["tremolo.in"], ["tremolo.out_l", "tremolo.out_r"], scope="common")
mod("out", "output", "Outputs", "VOLUME [2] / rear panel", "VOLUME and foot controller (expression or expression/wah); LEFT, RIGHT and GENERAL (mono) outputs, headphones; HIGH/LOW level switch.", ["out.l", "out.r", "out.exp"],
    ["out.left", "out.right", "out.general", "out.phones"], scope="common")
mod("pedal", "manual_controller", "Foot controller", "FOOT PEDAL SELECTOR [17]", "Expression pedal: volume (EXP), or volume plus a resonant HPF/LPF sweep (EXP/WAH).", ["pedal.in"], ["pedal.out"], scope="common")

# ---------------------------------------------------------------- per-channel parameters
for c_, n in CH:
    v, f, a = f"{c_}_vco", f"{c_}_vcf", f"{c_}_vca"
    lever(f"{c_}.pwm_speed", f"{c_}_pwm", f"SPEED (PWM) {n}", "PWM rate.", 20)
    lever(f"{c_}.pwm_depth", f"{c_}_pwm", f"PWM {n}", "PWM depth; 0 none.", 21)
    lever(f"{c_}.pw", v, f"PW {n}", "Square duty cycle, 50% to a 90% pulse.", 22, physical={"min": 50, "max": 90, "unit": "%"})
    par(f"{c_}.square", v, f"SQUARE WAVE {n}", "boolean", "Square wave on.", control="toggle_switch", ref=23)
    par(f"{c_}.saw", v, f"SAWTOOTH WAVE {n}", "boolean", "Sawtooth on.", control="toggle_switch", ref=24)
    lever(f"{c_}.noise", f"{c_}_noise", f"NOISE {n}", "White noise level.", 25)
    lever(f"{c_}.hpf", f, f"HPF {n}", "High-pass cutoff (LOW = wide open).", 26)
    lever(f"{c_}.res_h", f, f"RES H {n}", "High-pass resonance.", 27)
    lever(f"{c_}.lpf", f, f"LPF {n}", "Low-pass cutoff (HIGH = wide open).", 28)
    lever(f"{c_}.res_l", f, f"RES L {n}", "Low-pass resonance.", 29)
    lever(f"{c_}.fenv_il", f"{c_}_fenv", f"IL {n}", "Initial level: how far below the set cutoffs the filters start.", 30, panel_scale={"min": -5, "max": 0})
    lever(f"{c_}.fenv_al", f"{c_}_fenv", f"AL {n}", "Attack level: how far above the set cutoffs the filters rise.", 31, panel_scale={"min": 0, "max": 5})
    lever(f"{c_}.fenv_a", f"{c_}_fenv", f"A (VCF) {n}", "Filter attack time.", 32)
    lever(f"{c_}.fenv_d", f"{c_}_fenv", f"D (VCF) {n}", "Filter decay time.", 33)
    lever(f"{c_}.fenv_r", f"{c_}_fenv", f"R (VCF) {n}", "Filter release time.", 34)
    lever(f"{c_}.vcf_level", a, f"VCF LEVEL {n}", "Filtered square/saw/noise into the VCA.", 35)
    lever(f"{c_}.sine_level", a, f"SINE WAVE LEVEL {n}", "Unfiltered sine into the VCA.", 36)
    lever(f"{c_}.aenv_a", f"{c_}_aenv", f"A (VCA) {n}", "Amplitude attack.", 37)
    lever(f"{c_}.aenv_d", f"{c_}_aenv", f"D (VCA) {n}", "Amplitude decay.", 38)
    lever(f"{c_}.aenv_s", f"{c_}_aenv", f"S (VCA) {n}", "Sustain level.", 39)
    lever(f"{c_}.aenv_r", f"{c_}_aenv", f"R (VCA) {n}", "Amplitude release.", 40)
    lever(f"{c_}.level", a, f"LEVEL {n}", "Maximum VCA level (master for the channel).", 41)
    lever(f"{c_}.init_brill", f, f"INITIAL-BRILLIANCE {n}", "Velocity raises the filter cutoffs.", 42)
    lever(f"{c_}.init_level", a, f"INITIAL-LEVEL {n}", "Velocity raises the level.", 43)
    lever(f"{c_}.after_brill", f, f"AFTER-BRILLIANCE {n}", "Key pressure raises the filter cutoffs.", 44)
    lever(f"{c_}.after_level", a, f"AFTER-LEVEL {n}", "Key pressure raises the level.", 45)
    par(f"{c_}.tone", f"{c_}_vco", f"TONE SELECTOR {n}", "enum", "Selects the channel's voice: a preset, a memory or the programmable panel (lit button; one per row).", control="push_button", ref=3,
        values=[{"value": x} for x in PRESETS + ["MEMORY (2 per channel)", "PANEL"]], note="21 preset names across both rows; 11 presets per row per the specifications.")
    par(f"{c_}.feet", v, f"FEET {n}", "enum", "Keyboard range: 16' to 2'.", control="slide_switch", ref=5, values=[{"value": x} for x in ["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"]],
        confidence="inferred", note="Range 16'-2' from the specifications; intermediate footages (e.g. 5-1/3') are mentioned.")
# shared
par("chmix.mix", "chmix", "MIX I - II", "continuous", "Channel I only, a blend, or channel II only.", ref=4, panel_scale={"min": -5, "max": 5})
par("tune.detune_ch2", "ch2_vco", "DETUNE CH II", "continuous", "Detunes channel II by about ±1 semitone against channel I.", control="knob", ref=6, physical={"min": -100, "max": 100, "unit": "cents"})
par("global.brilliance", "ch1_vcf", "BRILLIANCE", "continuous", "Offsets both filters' cutoffs for all voices (pull down = brighter).", ref=7, panel_scale={"min": -5, "max": 5})
par("global.resonance", "ch1_vcf", "RESONANCE", "continuous", "Adds resonance to both filters (pull down = more).", ref=8, panel_scale=S10)
for k, ref in (("brill_low", 9), ("brill_high", 9), ("level_low", 10), ("level_high", 10)):
    par(f"kbdctl.{k}", "kbd", f"KEYBOARD CONTROL {k.split('_')[0].upper()} {k.split('_')[1].upper()}", "continuous",
        f"Gradually {'brightens or darkens' if 'brill' in k else 'raises or lowers the level of'} the {'lower' if 'low' in k else 'upper'} end of the keyboard.", ref=ref, panel_scale={"min": -5, "max": 5})
par("touch.pitchbend", "kbd", "TOUCH RESPONSE PITCHBEND", "continuous", "Velocity-sensitive: notes start flat and slide up to pitch; harder playing bends more.", ref=12, panel_scale=S10)
for k, fn in (("speed", "Pressure raises the sub oscillator speed."), ("vco", "Pressure adds sub-oscillator modulation to the VCOs (vibrato)."), ("vcf", "Pressure adds sub-oscillator modulation to the filters.")):
    par(f"touch.after_{k}", "subosc", f"TOUCH RESPONSE {k.upper()} (after)", "continuous", fn, ref=12, panel_scale=S10)
par("subosc.function", "subosc", "SUB OSCILLATOR FUNCTION", "enum", "Modulation source.", control="rotary_switch", ref=11,
    values=[{"value": x} for x in ["sine", "sawtooth", "inverted_sawtooth", "square", "white_noise", "ext"]])
par("subosc.speed", "subosc", "SUB OSCILLATOR SPEED", "continuous", "Rate of the sine, saw or square.", ref=11, panel_scale=S10)
for k in ("vco", "vcf", "vca"):
    par(f"subosc.{k}", "subosc", f"SUB OSCILLATOR {k.upper()}", "continuous", f"Modulation depth to the {k.upper()}s (vibrato, wah, tremolo).", ref=11, panel_scale=S10)
for k, fn in (("modulation", "Ring modulation depth."), ("speed", "Ring modulator frequency."), ("attack", "Speed envelope attack."), ("decay", "Speed envelope decay."), ("depth", "Amount of envelope on the speed.")):
    par(f"ringmod.{k}", "ringmod", f"RING MODULATOR {k.upper()}", "continuous", fn, ref=16, panel_scale=S10)
par("sustain.time", "kbd", "SUSTAIN", "continuous", "Die-away after release, up to about 10 s.", ref=13, physical={"min": 0, "max": 10, "unit": "s"})
par("sustain.fs_assign", "kbd", "SUSTAIN FOOT SWITCH", "boolean", "On: the foot switch turns sustain on/off; off: sustain always on.", control="toggle_switch", ref=13)
par("sustain.mode", "kbd", "SUSTAIN I - II", "enum", "I: each note sustains independently; II: a new note or chord ends the previous sustain.", control="toggle_switch", ref=13, values=[{"value": "I"}, {"value": "II"}],
    note="The manual's description of modes I and II is partly illegible in the scan.", confidence="inferred")
par("porta.time", "kbd", "PORTAMENTO / GLISSANDO", "continuous", "Glide time, up to 10 s across the keyboard.", ref=14, physical={"min": 0, "max": 10, "unit": "s"})
par("porta.fs_assign", "kbd", "P/G FOOT SWITCH", "boolean", "On: the foot switch turns the effect on/off; off: always on.", control="toggle_switch", ref=14)
par("porta.mode", "kbd", "PORTAMENTO / GLISSANDO mode", "enum", "Continuous slide or semitone steps.", control="toggle_switch", ref=14, values=[{"value": "portamento"}, {"value": "glissando"}])
par("tremolo.on", "tremolo", "TREMOLO ON/OFF", "boolean", "Effect on (output drops slightly).", control="toggle_switch", ref=15)
par("tremolo.mode", "tremolo", "TREMOLO / CHORUS", "enum", "Tremolo or slower chorus.", control="toggle_switch", ref=15, values=[{"value": "tremolo"}, {"value": "chorus"}])
par("tremolo.speed", "tremolo", "TREMOLO SPEED", "continuous", "Rate.", ref=15, panel_scale=S10)
par("tremolo.depth", "tremolo", "TREMOLO DEPTH", "continuous", "Depth.", ref=15, panel_scale=S10)
par("pedal.select", "pedal", "FOOT PEDAL SELECTOR", "enum", "EXP (volume) or EXP/WAH (volume plus resonant filter sweep).", control="push_button", ref=17, values=[{"value": "exp"}, {"value": "exp_wah"}])
par("tune.pitch_coarse", "kbd", "PITCH (outer ring)", "continuous", "Coarse tuning, about -500 to +700 cents.", control="knob", ref=18, physical={"min": -500, "max": 700, "unit": "cents"})
par("tune.pitch_fine", "kbd", "PITCH (inner ring)", "continuous", "Fine tuning, about ±30 cents.", control="knob", ref=18, physical={"min": -30, "max": 30, "unit": "cents"})
par("out.volume", "out", "VOLUME", "continuous", "Level of all three outputs.", control="knob", ref=2, panel_scale=S10)
par("out.level_switch", "out", "HIGH / LOW", "enum", "Output level: 0 dBm or -20 dBm.", access=[{"type": "rear_panel", "control": "toggle_switch"}], values=[{"value": "high"}, {"value": "low"}])
par("ribbon.position", "ribbon", "RIBBON CONTROLLER", "continuous", "Pitch bend for all notes while held.", control="ribbon", ref=19, panel_scale={"min": -1, "max": 1}, confidence="inferred", note="Callout number not legible in the scan.")
par("sys.power", "out", "POWER", "boolean", "AC power, red indicator.", control="toggle_switch", ref=1)

# ---------------------------------------------------------------- ports
jack("jack.left", "OUTPUT LEFT", "out", "audio", "out.left", "Left output, 600 ohm, 0 / -20 dBm.", "6.35 mm TS")
jack("jack.right", "OUTPUT RIGHT", "out", "audio", "out.right", "Right output.", "6.35 mm TS")
jack("jack.general", "OUTPUT GENERAL", "out", "audio", "out.general", "Mono output.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones, 250 mV; physically on the bottom panel.", "6.35 mm TRS", location="front")
jack("jack.ext_in", "EXT IN", "in", "audio", "subosc.ext", "External signal as the sub-oscillator source (50 kohm, 10 mV rms nominal), with level control.", "6.35 mm TS")
jack("jack.foot_switch", "FOOT SWITCH", "in", "gate", "kbd.sustain_fs", "Sustain and/or portamento on/off (per the assigners).", "6.35 mm TS", confidence="inferred", note="Connector type not stated.")
jack("jack.foot_controller", "FOOT CONTROLLER", "in", "cv", "pedal.in", "Expression / wah pedal.", "6.35 mm TRS", confidence="inferred", note="Connector type not stated.")
jack("jack.power", "AC", "in", "power", None, "AC 50/60 Hz, 180 W; cord stored under the instrument.", "captive cord")

# ---------------------------------------------------------------- connections
for c_, n in CH:
    con("kbd.pitch", f"{c_}_vco.pitch_cv", "cv")
    con("ribbon.out", f"{c_}_vco.pitch_cv", "cv")
    con("kbd.velocity", f"{c_}_vco.pitch_cv", "cv", amount="touch.pitchbend", note="Velocity pitchbend: start flat, slide to pitch.")
    con("subosc.out", f"{c_}_vco.pitch_cv", "cv", amount="subosc.vco")
    con("subosc.out", f"{c_}_vco.pitch_cv", "cv", amount_expr="touch.after_vco * kbd.pressure", note="Pressure-controlled vibrato.")
    con(f"{c_}_pwm.out", f"{c_}_vco.pwm_cv", "cv", amount=f"{c_}.pwm_depth")
    con(f"{c_}_vco.square", f"{c_}_mix.square", eq(f"{c_}.square", True))
    con(f"{c_}_vco.saw", f"{c_}_mix.saw", eq(f"{c_}.saw", True))
    con(f"{c_}_noise.out", f"{c_}_mix.noise", amount=f"{c_}.noise")
    con(f"{c_}_mix.out", f"{c_}_vcf.in")
    con("kbd.gate", f"{c_}_fenv.gate", "gate")
    con(f"{c_}_fenv.out", f"{c_}_vcf.cutoff_cv", "cv", note="Moves HPF and LPF together.")
    con("kbd.velocity", f"{c_}_vcf.cutoff_cv", "cv", amount=f"{c_}.init_brill")
    con("kbd.pressure", f"{c_}_vcf.cutoff_cv", "cv", amount=f"{c_}.after_brill")
    con("subosc.out", f"{c_}_vcf.cutoff_cv", "cv", amount="subosc.vcf")
    con("subosc.out", f"{c_}_vcf.cutoff_cv", "cv", amount_expr="touch.after_vcf * kbd.pressure")
    con("kbd.pitch", f"{c_}_vcf.cutoff_cv", "cv", note="Keyboard control brilliance tilts the cutoffs across the keyboard.", amount="kbdctl.brill_high")
    con("pedal.out", f"{c_}_vcf.cutoff_cv", "cv", eq("pedal.select", "exp_wah"), note="Wah: sweeps HPF and LPF and adds resonance.")
    con("pedal.out", f"{c_}_vcf.res_cv", "cv", eq("pedal.select", "exp_wah"))
    con(f"{c_}_vcf.out", f"{c_}_vca.filtered", amount=f"{c_}.vcf_level")
    con(f"{c_}_vco.sine", f"{c_}_vca.sine", amount=f"{c_}.sine_level", note="The sine bypasses the filters.")
    con("kbd.gate", f"{c_}_aenv.gate", "gate")
    con("kbd.velocity", f"{c_}_aenv.touch", "cv", amount=f"{c_}.init_level")
    con("kbd.pressure", f"{c_}_aenv.touch", "cv", amount=f"{c_}.after_level")
    con(f"{c_}_aenv.out", f"{c_}_vca.cv", "cv", amount=f"{c_}.level")
    con("subosc.out", f"{c_}_vca.cv", "cv", amount="subosc.vca")
    con(f"{c_}_vca.out", f"chmix.{c_}")
con("kbd.pressure", "subosc.rate_cv", "cv", amount="touch.after_speed", note="Pressure raises the sub-oscillator speed.")
con("chmix.out", "ringmod.in", amount="chmix.mix", note="Eight notes summed.")
con("ringmod.out", "tremolo.in")
con("tremolo.out_l", "out.l")
con("tremolo.out_r", "out.r")
con("pedal.out", "out.exp", "cv", note="Expression (volume) in both pedal modes.")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [{"id": "tone_lamps", "module": "kbd", "label": "TONE SELECTOR lamps", "kind": "lamp", "function": "Show the selected voice in each row."},
                   {"id": "power_lamp", "module": "out", "label": "POWER lamp", "kind": "lamp", "function": "Power on."}]
D["behaviours"] = [
    {"id": "b01", "name": "Two channels per note", "applies_to": ["chmix", "kbd"],
     "rule": "Every key sounds channel I and channel II (each a full VCO-VCF-VCA voice) on its own voice board; up to 8 notes and 16 voices. Each channel picks a preset, memory or the panel; MIX balances them; DETUNE CH II thickens them."},
    {"id": "b02", "name": "Filter envelope", "applies_to": ["ch1_fenv", "ch2_fenv"],
     "rule": "IL-AL-A-D-R: on a key the HPF and LPF start IL below their set cutoffs, move over the attack time to AL above, decay to the set cutoffs and, on release, move back to IL over the release time. With IL and AL at zero the envelope does nothing."},
    {"id": "b03", "name": "Sine bypass", "applies_to": ["ch1_vca", "ch2_vca"], "rule": "Square, sawtooth and noise pass the filters (VCF LEVEL); the sine goes straight to the VCA (SINE WAVE LEVEL), so pure fundamentals can be mixed with filtered tones."},
    {"id": "b04", "name": "Touch response", "applies_to": ["kbd"],
     "rule": "Per channel: velocity (INITIAL) and per-key pressure (AFTER) raise brilliance and level. Shared: velocity pitchbend (notes slide up into pitch), and pressure raising the sub-oscillator speed or its modulation of the VCOs and VCFs, note by note."},
    {"id": "b05", "name": "Ribbon controller", "applies_to": ["ribbon"], "rule": "Touch anywhere as the reference and slide: about an octave sharp at most, but much further flat (down to sub-audio). In sustain mode II the ribbon also bends sustaining notes after release."},
    {"id": "b06", "name": "Sustain and portamento", "applies_to": ["kbd"],
     "rule": "Sustain up to about 10 s; portamento or semitone glissando up to 10 s across the keyboard. Foot-switch assigners decide which the switch controls (or leave them always on)."},
    {"id": "b07", "name": "Memories", "applies_to": ["kbd"],
     "rule": "No electronic memory: four miniature control panels (two per channel) under the memory cover duplicate the programmable panel's controls; patches are copied by eye and fine-tuned by ear."},
    {"id": "b08", "name": "Global effects", "applies_to": ["subosc", "ringmod", "tremolo"],
     "rule": "The sub oscillator (sine, saw, inverted saw, square, noise or external input) modulates all voices' VCO, VCF and VCA; the ring modulator processes the summed output with an envelope on its speed; tremolo/chorus adds amplitude and phase modulation, rotary-like in stereo."},
]
D["midi"] = {"receives": [], "transmits": [], "note": "None: the CS-80 predates MIDI (retrofits exist)."}
D["specifications"] = {
    "keyboard": "61 keys, C-C, velocity and polyphonic pressure", "polyphony": "8 notes x 2 channels (16 voices)", "frequency_range_hz": [32, 8000], "extended_range_hz": [2, 11000],
    "pitch": {"coarse_cents": [-500, 700], "fine_cents": [-30, 30], "detune_ch2": "±1 semitone"}, "envelopes": "attack 1 ms-1 s, decay/release 10 ms-10 s", "glide_s_max": 10,
    "presets": "11 per channel (STRING 1-4, BRASS 1-3, FLUTE, ELECTRIC PIANO, BASS, CLAVICHORD, HARPSICHORD 1-2, ORGAN 1-2, GUITAR 1-2, FUNKY 1-4)",
    "outputs": {"left_right_general": "1/4\", 600 ohm, 0 dBm or -20 dBm", "phones": "1/4\" TRS, 250 mV"}, "ext_in": "1/4\", 50 kohm, 10 mV rms nominal",
    "power": "AC 50/60 Hz, 180 W", "dimensions_cm": {"w": 120.5, "h_case": 30.4, "d": 70.2, "h_assembled": 96.5}, "weight_kg": 100,
}
D["omitted_from_source"] = ["Section II/III non-technical descriptions", "Section V synthesis primer (beyond the block diagram facts)", "patch charts and appendix", "setup, care and transport"]
D["not_in_source"] = ["clear text for some callout numbers (OCR)", "exact FEET positions", "the keyboard control's exact scaling law", "connector types for the foot pedals"]
D["source_inconsistencies"] = [
    "The specifications say each channel has 11 presets (22 in all) but the legible list gives 21 names; a stray '(1 & 2)' in the scan suggests one name was lost to OCR.",
    "The specifications say 'Each channel is provided with 11 different preset patches, two memory-programmable patches', while the memory section describes 'Memories 1-4'; these are two per channel.",
    "The overview says the CS-80 has 16 sets of VCO/VCF/VCA/EG; the block diagram labels the voice boards M1-M8 (one board per note carrying both channels).",
]
D["modelling_gaps"] = [
    {"topic": "OCR quality", "detail": "The scan's text layer is rough; values are taken where legible and some callout numbers are inferred."},
    {"topic": "Memories", "detail": "Memory panels are physical miniature controls; modelled as a tone-selector choice, not as stored parameters."},
    {"topic": "Per-voice modules", "detail": "Channel I and II voice modules are per_voice (one per note); MIX, sub oscillator, ring mod, tremolo and outputs are common."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/yamaha-cs-80_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
