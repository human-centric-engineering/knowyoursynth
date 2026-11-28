#!/usr/bin/env python3
"""Assemble the Black Corporation Deckard's Dream MK2 device file (schema 0.13.0).

8-voice, two-layer analogue polysynth module inspired by the Yamaha CS-80. Built on the CS-80
model (build_cs80.py): parameter and module ids are kept the same wherever the control does
the same job (ch1/ch2 = Layer I/II), so the two files can be compared directly.

What carries over from the CS-80: per-layer VCO (square with PWM LFO, saw, sine, noise), HPF and
LPF with separate resonance under an IL/AL/A/D/R envelope, sine bypassing the filters, ADSR VCA,
initial/after brilliance and level; shared mix, detune, brilliance, resonance, keyboard control,
touch response, sub oscillator, portamento/glissando, sustain modes.

What is different: desktop/rack module with no keyboard, ribbon, ring modulator, tremolo/chorus,
fixed preset tone selector, foot pedals or external input (MK1 only); 1152 stored presets; MIDI
with poly aftertouch and MPE; coarse/fine/detune and FEET are sliders; sub oscillator has
random and S&H; 3-way P/off/G switch; master SUSTAIN slider; menu settings for voice mode,
unison, cards per voice, LFO/PWM ranges, envelope time ranges, tracking, microtuning.

Source: Deckard's Dream MK2 Operation Manual (file 2.3.3, cover 2.3.0), 57 pages, including a
panel graphic and MIDI CC chart. manual_ref values are manual page numbers.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
CH = (("ch1", "I", "A"), ("ch2", "II", "B"))
CC = {}


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="fader", ref=None, cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref is not None:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = kw.pop("memory", "patch")
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("how")} if "how" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
        CC[str(cc)] = id
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def lever(id, module, label, fn, ref, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, ref=ref, **kw)


def menu(path):
    return [{"type": "menu", "note": f"SHIFT + CANCEL (STNG) > {path}"}]


def setting(id, module, label, kind, fn, path, ref, memory="global", **kw):
    par(id, module, label, kind, fn, ref=ref, memory=memory, access=menu(path), **kw)


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


def vals(xs):
    return [{"value": x} if isinstance(x, str) else {"value": x[0], "label": x[1], **({"meaning": x[2]} if len(x) > 2 else {})} for x in xs]


D["device"] = {
    "id": "black-corporation-deckards-dream-mk2", "manufacturer": "Black Corporation", "model": "Deckard's Dream MK2",
    "category": "8-voice two-layer analogue polyphonic synthesiser module (desktop or 19-inch 4U rack), MIDI/MPE with polyphonic aftertouch",
    "based_on": ("Inspired by the Yamaha CS-80 (see yamaha-cs-80); the manual says it is 'not a clone' but a revival of its sound design. Per-layer voice and shared "
                 "controls follow the CS-80 programmable panel; CS-80 parameter ids are reused here for matching controls. MK1 differs mainly in lacking the SUSTAIN slider, "
                 "SUSTAIN I/II switch and PANEL button, and in having an external CV input for the sub oscillator."),
    "sources": [{"id": "manual", "title": "Deckard's Dream MK2 Operation Manual", "kind": "user_manual", "file": "Deckards_Dream_MK2_Manual_2.3.3.pdf", "pages": 57,
                 "note": "File named 2.3.3; the cover says 2.3.0. Covers MK2 and most of MK1. Includes a full panel graphic (p.9) and a MIDI CC chart (pp.54-56)."},
        {"id": "sos", "title": "Sound On Sound review, 'Black Corporation Deckard's Dream' (MK1)", "kind": "other", "url": "https://www.soundonsound.com/reviews/black-corporation-deckards-dream",
         "note": "MK1 detail: CEM3340-style VCOs (On Chip recreations); envelopes and LFO digitally generated; filter contour is IL-AL-A-D-R with zero sustain; LFO waves sine, saw, ramp, square, noise, external; coarse +6/-7 semitones; noise whiter and quieter than the CS-80; HPF less CS-80-like than the LPF; pressure less sensitive with no curve; layer II bleeds slightly into layer I; 12 V 5.8 A supply; separate Expander adds ring mod, chorus/vibrato, master sustain and CV inputs."},
        {"id": "synthtopia", "title": "Synthtopia, 'Black Corporation Intros Deckard's Dream MK2 Synthesizer' (13 Feb 2020)", "kind": "other",
         "url": "https://www.synthtopia.com/content/2020/02/13/black-corporation-intros-deckards-dream-mk2-synthesizer/", "note": "MK2 is a sleeker, lighter version keeping the MK1 engine, adding sustain mode and length controls; US$3,749; 128 presets per bank, 3 banks at launch."},
        {"id": "bonedo", "title": "Bonedo, 'Black Corporation Deckard's Dream MK2: Der Traum geht weiter' (2020)", "kind": "other",
         "url": "https://www.bonedo.de/artikel/black-corporation-deckards-dream-mk2-der-traum-geht-weiter", "note": "Flat desktop case, rack ears by removing the cheeks; only new control vs MK1 is the Sustain slider; 384 patches at launch."},
        {"id": "perfect_circuit", "title": "Perfect Circuit, Black Corporation Deckard's Dream Mk2", "kind": "other", "url": "https://www.perfectcircuit.com/black-corp-deckards-dream-mk2.html",
         "note": "12 V DC 2 A centre-positive supply; dimensions 'TBD'."},
        {"id": "thomann", "title": "Thomann UK, Black Corporation Deckard's Dream MKII", "kind": "other", "url": "https://thomann.co.uk/black_corporation_deckards_dream_mkii.htm",
         "note": "483 x 178 mm (19-inch 4U, depth not given); 256 presets (older figure); available since December 2020; GBP 4,199."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "signal_path_note": "Fully analogue audio path (per the manual); digitally scanned sliders, stored presets and MIDI.",
    "voices": 8,
    "polyphony_mode": ("8 voice cards, each with layer I and layer II (one VCO, HPF+LPF and VCA per layer). Voice mode Poly (1-8 voices), Mono or Unison (up to 8 voices on one note). "
                       "CARDS PER VOICE 2 pairs two cards per note (4-note polyphony)."),
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "9 banks x 128 = 1152 presets: Factory (fixed), Banks 1-3 (pre-loaded, overwritable), Banks 4-8 user; 1024 writable slots. A preset stores all slider and switch positions and per-patch menu settings. PANEL mode plays the current panel.",
    "semi_modular": False,
    "panel_counts": {"sliders": 71, "switches": 6, "buttons": 6, "knobs": 1, "power_switch": 1, "display": "128 x 64 OLED", "keys": 0},
    "panel_counts_note": ("From the panel graphic: per layer 24 sliders and 2 waveform switches; master section 23 sliders (coarse, fine, detune, FEET I and II, sub-osc FUNCTION, "
                          "SPEED, VCO, VCF, VCA, MIX, BRIL, RESO, touch P.BEND, SPEED, VCO, VCF, keyboard control x4, PORT/GLISS, SUSTAIN), P/G and SUSTAIN I/II switches, "
                          "TONE SELECTOR buttons UP, DOWN, ENTER, CANCEL, SHIFT, PANEL, VOLUME knob, front PHONES jack and POWER switch. FEET and FUNCTION are stepped sliders."),
    "summary": ("A CS-80 style voice without the keyboard: each of 8 voices has two layers, each with a VCO (square with its own PWM LFO, saw, sine) plus noise through a 12 dB "
                "HPF and LPF with separate resonance and an IL/AL/A/D/R filter envelope; the sine bypasses the filters into an ADSR VCA. Velocity and (poly) aftertouch "
                "raise brilliance and level per layer. Shared sliders mix and detune the layers, offset brilliance and resonance, scale brightness and level across the "
                "keyboard, add velocity pitch bend and aftertouch-driven sub-oscillator modulation, set portamento/glissando and master sustain. Controlled by MIDI, poly AT or MPE."),
}

# ---------------------------------------------------------------- per-layer voice modules (same ids as the CS-80 model)
for c_, n, ab in CH:
    sec = f"LAYER {n}"
    mod(f"{c_}_vco", "oscillator", f"Layer {n} VCO", f"{sec} VCO", "VCO with square/pulse (PW 50-90%, PWM), saw and sine outputs; FEET sets octave or fifth. SOS (MK1) reports CEM3340-style VCO chips (On Chip recreations); MK2 keeps the MK1 engine per launch reports.",
        [f"{c_}_vco.pitch_cv", f"{c_}_vco.pwm_cv"], [f"{c_}_vco.square", f"{c_}_vco.saw", f"{c_}_vco.sine"])
    mod(f"{c_}_pwm", "lfo", f"Layer {n} PWM LFO", f"{sec} VCO", "Sine PWM LFO (SPEED, PWM depth); range 0.7-70 Hz by default (TIME menu). PWM MODE SYNC runs both layers from layer I SPEED.",
        [f"{c_}_pwm.rate_cv"], [f"{c_}_pwm.out"], props={"default_range_hz": [0.7, 70], "note": "SOS (MK1): maximum PWM depth is lower than the CS-80's."})
    mod(f"{c_}_noise", "noise", f"Layer {n} noise", f"{sec} VCO", "White noise into the filters.", [], [f"{c_}_noise.out"])
    mod(f"{c_}_mix", "mixer", f"Layer {n} VCO mix", f"{sec} VCO", "Square and saw (switched) plus noise level into the filters.", [f"{c_}_mix.square", f"{c_}_mix.saw", f"{c_}_mix.noise"], [f"{c_}_mix.out"])
    mod(f"{c_}_vcf", "filter", f"Layer {n} VCF (HPF + LPF)", f"{sec} VCF", "Discrete 12 dB/oct high-pass then low-pass filters, each with resonance (RESH, RESL); neither self-oscillates. Cutoffs moved by the filter EG, brilliance, touch, sub oscillator and keyboard control.",
        [f"{c_}_vcf.in", f"{c_}_vcf.cutoff_cv"], [f"{c_}_vcf.out"], props={"stages": ["HPF", "LPF"], "slope_db_per_oct": 12, "self_oscillation": False, "note": "SOS (MK1): LPF closely matches the CS-80; HPF has a less pronounced effect."})
    mod(f"{c_}_fenv", "envelope", f"Layer {n} filter EG (IL-AL-A-D-R)", f"{sec} VCF", "Digitally generated (SOS, MK1). Starts IL below the set cutoffs, moves over A to AL, decays over D to the set cutoffs, releases over R. Maximum attack 1 s and decay/release 15 s by default (TIME menu, up to 100 s and 150 s).",
        [f"{c_}_fenv.gate"], [f"{c_}_fenv.out"], props={"attack_max_s": [1, 100], "decay_release_max_s": [15, 150]})
    mod(f"{c_}_vca", "vca", f"Layer {n} VCA", f"{sec} VCA", "Mixes the filtered signal (VCF LEVEL) with the unfiltered sine; ADSR; LEVEL sets the layer volume (0 is quiet, not silent).",
        [f"{c_}_vca.filtered", f"{c_}_vca.sine", f"{c_}_vca.cv"], [f"{c_}_vca.out"])
    mod(f"{c_}_aenv", "envelope", f"Layer {n} VCA EG (ADSR)", f"{sec} VCA", "ADSR; time ranges set in the TIME menu (as the filter EG).", [f"{c_}_aenv.gate", f"{c_}_aenv.touch"], [f"{c_}_aenv.out"])
mod("kbd", "voice_allocator", "MIDI input and voice assigner", "rear MIDI / USB", "Receives notes, velocity, channel or poly aftertouch or MPE, pitch bend, mod wheel, CCs and program/bank changes; assigns notes to 8 voice cards (mono, poly, unison; 1 or 2 cards per voice); portamento/glissando and sustain modes.",
    ["kbd.din_in", "kbd.usb"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.pressure", "kbd.bend", "kbd.modwheel", "kbd.thru", "kbd.midi_out"], scope="common",
    props={"midi_modes": ["channel pressure", "poly aftertouch", "MPE"]})
mod("chmix", "mixer", "Layer MIX", "TONE [MIX I / II]", "Crossfades layer I and II for each voice (centre detent = equal).", ["chmix.ch1", "chmix.ch2"], ["chmix.out"])
mod("subosc", "lfo", "Sub oscillator (LFO)", "SUB OSCILLATOR", "Sine, saw, reverse saw, square, random or sample-and-hold; per-note (POLY) or shared phase (MONO); 0.7-25 Hz by default (TIME menu 0.1-45 Hz). Depth levers to VCO, VCF and VCA; CLASSIC or EXTENDED depth.",
    ["subosc.rate_cv", "subosc.depth_cv"], ["subosc.out"], scope="common", props={"default_range_hz": [0.7, 25]})
mod("out", "output", "Output", "VOLUME / rear AUDIO OUT / front PHONES", "Sum of all voices; preset volume -6 to +6 dB; VOLUME to the balanced mono AUDIO OUT and the front headphone jack (mono on both sides).",
    ["out.in"], ["out.main", "out.phones"], scope="common")

# ---------------------------------------------------------------- per-layer parameters (CS-80 ids)
CCA = dict(pwm_speed=40, pwm_depth=41, pw=42, square=43, saw=44, noise=45, hpf=46, res_h=47, lpf=48, res_l=49, fenv_il=50, fenv_al=51, fenv_a=52, fenv_d=53, fenv_r=54,
           vcf_level=55, sine_level=56, aenv_a=57, aenv_d=58, aenv_s=59, aenv_r=60, level=61, init_brill=62, init_level=63, after_brill=65, after_level=66)
CCB = dict(pwm_speed=67, pwm_depth=68, pw=69, saw=70, square=71, noise=72, hpf=73, res_h=119, lpf=75, res_l=76, fenv_il=77, fenv_al=78, fenv_a=79, fenv_d=80, fenv_r=81,
           vcf_level=82, sine_level=83, aenv_a=84, aenv_d=85, aenv_s=86, aenv_r=87, level=88, init_brill=89, init_level=90, after_brill=91, after_level=92)
for c_, n, ab in CH:
    cc = CCA if ab == "A" else CCB
    v, f, a = f"{c_}_vco", f"{c_}_vcf", f"{c_}_vca"
    lever(f"{c_}.pwm_speed", f"{c_}_pwm", f"SPEED {n}", "PWM LFO rate (top FAST); default 0.7-70 Hz.", 20, cc=cc["pwm_speed"])
    lever(f"{c_}.pwm_depth", f"{c_}_pwm", f"PWM {n}", "PWM depth; 0 none.", 20, cc=cc["pwm_depth"])
    lever(f"{c_}.pw", v, f"PW {n}", "Pulse width 50% (square) to 90%; centre width when PWM is on.", 21, physical={"min": 50, "max": 90, "unit": "%"}, cc=cc["pw"])
    par(f"{c_}.square", v, f"SQUARE {n}", "boolean", "Square/pulse on (switch down). SPEED, PWM and PW do nothing when off.", control="toggle_switch", ref=21, cc=cc["square"])
    par(f"{c_}.saw", v, f"SAW {n}", "boolean", "Saw on (switch down).", control="toggle_switch", ref=21, cc=cc["saw"])
    lever(f"{c_}.noise", f"{c_}_noise", f"NOISE {n}", "White noise level.", 21, cc=cc["noise"])
    lever(f"{c_}.hpf", f, f"HPF {n}", "High-pass cutoff: LOW fully open, HIGH closed.", 22, cc=cc["hpf"])
    lever(f"{c_}.res_h", f, f"RESH {n}", "High-pass resonance (no self-oscillation).", 22, cc=cc["res_h"])
    lever(f"{c_}.lpf", f, f"LPF {n}", "Low-pass cutoff: HIGH fully open, LOW closed.", 22, cc=cc["lpf"])
    lever(f"{c_}.res_l", f, f"RESL {n}", "Low-pass resonance (no self-oscillation).", 23, cc=cc["res_l"])
    lever(f"{c_}.fenv_il", f"{c_}_fenv", f"IL {n}", "Initial level: how far below the set cutoffs the envelope starts (top = -5).", 23, panel_scale={"min": -5, "max": 0}, cc=cc["fenv_il"])
    lever(f"{c_}.fenv_al", f"{c_}_fenv", f"AL {n}", "Attack level: envelope peak above the set cutoffs (top = +5); loosely the envelope amount.", 23, panel_scale={"min": 0, "max": 5}, cc=cc["fenv_al"])
    lever(f"{c_}.fenv_a", f"{c_}_fenv", f"A (VCF) {n}", "Filter attack time (top LONG).", 23, cc=cc["fenv_a"])
    lever(f"{c_}.fenv_d", f"{c_}_fenv", f"D (VCF) {n}", "Filter decay time.", 23, cc=cc["fenv_d"])
    lever(f"{c_}.fenv_r", f"{c_}_fenv", f"R (VCF) {n}", "Filter release time.", 24, cc=cc["fenv_r"])
    lever(f"{c_}.vcf_level", a, f"VCF LEVEL {n}", "Filtered square/saw/noise into the VCA.", 24, cc=cc["vcf_level"])
    lever(f"{c_}.sine_level", a, f"SINE {n}", "Unfiltered sine into the VCA.", 24, cc=cc["sine_level"])
    lever(f"{c_}.aenv_a", f"{c_}_aenv", f"A (VCA) {n}", "Amplitude attack.", 25, cc=cc["aenv_a"])
    lever(f"{c_}.aenv_d", f"{c_}_aenv", f"D (VCA) {n}", "Amplitude decay.", 25, cc=cc["aenv_d"])
    lever(f"{c_}.aenv_s", f"{c_}_aenv", f"S (VCA) {n}", "Sustain level.", 25, cc=cc["aenv_s"])
    lever(f"{c_}.aenv_r", f"{c_}_aenv", f"R (VCA) {n}", "Amplitude release.", 25, cc=cc["aenv_r"])
    lever(f"{c_}.level", a, f"LEVEL {n}", "Layer volume (0 is very quiet, not silent).", 25, cc=cc["level"])
    lever(f"{c_}.init_brill", f, f"INITIAL BRILLIANCE {n}", "Velocity opens the filters.", 26, cc=cc["init_brill"])
    lever(f"{c_}.init_level", a, f"INITIAL LEVEL {n}", "Velocity raises the level.", 26, cc=cc["init_level"])
    lever(f"{c_}.after_brill", f, f"AFTER BRILLIANCE {n}", "Aftertouch opens the filters.", 26, cc=cc["after_brill"])
    lever(f"{c_}.after_level", a, f"AFTER LEVEL {n}", "Aftertouch raises the level.", 27, cc=cc["after_level"])
    par(f"{c_}.feet", v, f"FEET {n}", "enum", "Layer pitch by organ footage (top lowest).", control="fader", how="6-position stepped slider", ref=29,
        values=vals(["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"]), cc=102 if ab == "A" else 103, note="CC ranges 0-21, 22-42, 43-63, 64-84, 85-105, 106-127.")
# ---------------------------------------------------------------- master parameters
par("tune.pitch_coarse", "kbd", "COARSE PITCH", "continuous", "Coarse pitch of both layers, about +/-5 semitones (top lower; centre detent).", ref=28, physical={"min": -500, "max": 500, "unit": "cents"},
    panel_scale={"min": -1, "max": 1}, cc=93)
par("tune.pitch_fine", "kbd", "FINE PITCH", "continuous", "Fine pitch of both layers, about +/-1 semitone (centre detent).", ref=28, physical={"min": -100, "max": 100, "unit": "cents"}, panel_scale={"min": -1, "max": 1}, cc=94)
par("tune.detune_ch2", "ch2_vco", "DETUNE CH II", "continuous", "Detunes layer II about +/-1 semitone against layer I (centre detent).", ref=28, physical={"min": -100, "max": 100, "unit": "cents"},
    panel_scale={"min": -1, "max": 1}, cc=32)
par("subosc.function", "subosc", "SUB OSCILLATOR FUNCTION", "enum", "LFO waveform (top to bottom).", control="fader", how="6-position stepped slider", ref=30, cc=104,
    values=vals([("sine", "Sine"), ("sawtooth", "Saw (rising)"), ("inverted_sawtooth", "Reverse saw (ramp)"), ("square", "Square"), ("random", "RND"), ("sample_hold", "S/H")]),
    note="Panel graphic positions. SOS lists the MK1 waves as sine, saw, ramp, square, noise and external, so RND is the MK1 'noise' position and MK2 swaps EXT for S/H.")
lever("subosc.speed", "subosc", "SUB OSC SPEED", "LFO rate; bottom fastest. Range set by LFO MIN/MAX (default 0.7-25 Hz).", 30, cc=105)
for k, d_, c_ in (("vco", "Vibrato depth to both layers' VCOs.", 106), ("vcf", "Modulation of both layers' filter cutoffs.", 107), ("vca", "Tremolo depth on both layers' VCAs.", 108)):
    lever(f"subosc.{k}", "subosc", f"SUB OSC {k.upper()}", d_ + " Bottom = maximum.", 30, cc=c_)
par("chmix.mix", "chmix", "MIX I - II", "continuous", "Top layer I only, centre equal, bottom layer II only.", ref=32, panel_scale={"min": -5, "max": 5}, cc=8)
par("global.brilliance", "ch1_vcf", "BRIL.", "continuous", "Offsets all HPF and LPF cutoffs on both layers; centre detent no change, down brighter.", ref=32, panel_scale={"min": -5, "max": 5}, cc=109)
lever("global.resonance", "ch1_vcf", "RESO.", "Adds resonance to all filters (bottom = maximum).", 32, cc=110)
lever("touch.pitchbend", "kbd", "TOUCH P.BEND (initial)", "Velocity pitch bend: notes start flat and slide up; range set by TR PITCHBEND RANGE (default 1 semitone).", 33, cc=111)
lever("touch.after_speed", "subosc", "TOUCH SPEED", "Raises the sub-oscillator speed per note (panel: aftertouch; one text section says velocity).", 33, cc=112,
      note="Panel graphic groups SPEED with VCO and VCF under 'SUB OSC AFTER', as on the CS-80.")
lever("touch.after_vco", "subosc", "TOUCH VCO (after)", "Aftertouch adds sub-oscillator vibrato per note.", 34, cc=113)
lever("touch.after_vcf", "subosc", "TOUCH VCF (after)", "Aftertouch adds sub-oscillator filter modulation per note.", 34, cc=114)
for k, c_ in (("brill_low", 115), ("brill_high", 116), ("level_low", 117), ("level_high", 118)):
    par(f"kbdctl.{k}", "kbd", f"KEYBOARD CONTROL {k.split('_')[0].upper()} {k.split('_')[1].upper()}", "continuous",
        f"{'Filter cutoff' if 'brill' in k else 'Level'} for notes {'below' if 'low' in k else 'above'} the centre key, on a curve; centre detent no effect, down increases.",
        ref=35, panel_scale={"min": -5, "max": 5}, cc=c_)
lever("porta.time", "kbd", "PORT/GLISS", "Glide or glissando time (top LONG); about 10 s across the range at maximum.", 37, cc=5)
par("porta.mode", "kbd", "P / G", "enum", "Pitch transition.", control="slide_switch", ref=37, values=vals([("portamento", "P"), ("off", "centre", "no glide"), ("glissando", "G", "semitone steps")]),
    note="Text: 3-position switch; the panel graphic shows only P and G.")
lever("sustain.time", "kbd", "SUSTAIN", "Master sustain: changes the release of both layers, independent of the VCA R sliders (top LONG).", 38, cc=10)
par("sustain.mode", "kbd", "SUSTAIN I / II", "enum", "Voice playback mode.", control="slide_switch", ref=12, cc=9,
    values=vals([("I", "I", "round-robin: every note sustains and releases independently"), ("II", "II", "new notes cut off released notes; the last notes carry the release (CS-80 behaviour)")]))
par("out.volume", "out", "VOLUME", "continuous", "Output and headphone level.", control="knob", ref=39, panel_scale=S10, memory="none")
par("sys.power", "out", "POWER", "boolean", "Power rocker switch (front panel).", control="toggle_switch", ref=9, memory="none")
par("ui.preset", "kbd", "TONE SELECTOR", "integer", "Preset 1-128 in the current bank (UP/DOWN; SHIFT+UP/DOWN changes bank); ENTER saves; PANEL plays the current panel; SHIFT+CANCEL opens settings.",
    control="push_button", ref=16, range={"min": 1, "max": 128}, memory="none",
    access=[{"type": "panel", "control": "push_button", "note": "UP, DOWN, ENTER, CANCEL, SHIFT, PANEL"}, {"type": "midi", "message": "program change; bank select CC 0 (0-8)"}])
par("ui.panel", "kbd", "PANEL", "boolean", "Panel mode: plays the physical slider positions ('PNL'). MK1: SHIFT+ENTER.", control="push_button", ref=17, memory="none")
# ---------------------------------------------------------------- menu settings
setting("midi.mode", "kbd", "MIDI MODE", "enum", "Expression source type.", "MIDI > MODE", 41, values=vals([("channel_pressure", "CHANNEL PRESSURE"), ("poly_at", "POLY AFTERTOUCH"), ("mpe", "MPE")]))
setting("midi.channel", "kbd", "CHANNEL", "integer", "Receive channel; in MPE the master channel (1-8), with following channels for the 8 voices.", "MIDI > CHANNEL", 41, range={"min": 1, "max": 16}, default=1)
setting("midi.out_channel", "kbd", "OUT CHANNEL", "integer", "Transmit channel.", "MIDI > OUT CHANNEL", 42, range={"min": 1, "max": 16})
setting("midi.cc_receive", "kbd", "CC RECEIVE", "boolean", "Accept incoming CCs (needed for bank select).", "MIDI > CC RECEIVE", 42)
setting("midi.cc74", "kbd", "CC74 REPLACE", "enum", "Destination for MPE CC 74 (vertical key movement).", "MIDI > CC74 REPLACE", 42,
        values=vals([("lfo_speed", "LFO SPEED (CC 105)"), ("lfo_vco", "LFO TO VCO (CC 106)"), ("lfo_vcf", "LFO TO VCF (CC 107)"), ("lfo_vca", "LFO TO VCA (CC 108)"), ("brilliance", "BRILLIANCE (CC 109)"),
                     ("lpf_a", "LPF A (CC 48)"), ("lpf_b", "LPF B (CC 75)"), ("hpf_a", "HPF A (CC 46)"), ("hpf_b", "HPF B (CC 73)")]))
setting("midi.slider_mode", "kbd", "SLIDERS", "enum", "How a moved slider takes over from the stored value.", "MIDI > SLIDERS", 43, values=vals(["pick_up", "merge", "instant"]))
setting("midi.cc_mode", "kbd", "CC", "enum", "How an incoming CC takes over from the stored value.", "MIDI > CC", 43, values=vals(["pick_up", "merge", "instant"]))
setting("midi.modwheel_dest", "kbd", "MOD WHEEL DESTINATION", "enum", "What the mod wheel (CC 1) controls.", "MIDI > MOD WHEEL DESTINATION", 44, memory="patch",
        values=vals([("lfo_vco", "LFO DEPTH - VCO (CC 106)"), ("lfo_vcf", "LFO DEPTH - VCF (CC 107)"), ("lfo_vca", "LFO DEPTH - VCA (CC 108)"), ("brilliance", "BRILLIANCE (CC 109)"),
                     ("portamento", "PORTAMENTO LEVEL (CC 5)"), ("pwm_speed_1", "PWM SPEED 1 (CC 40)"), ("pwm_speed_2", "PWM SPEED 2 (CC 67)"), ("pwm_speed_12", "PWM SPEED 1+2"),
                     ("detune", "DETUNE (CC 95)"), ("feet_1", "FEET 1 (CC 102)"), ("feet_2", "FEET 2 (CC 103)"), ("noise_1", "Noise 1"), ("noise_2", "Noise 2")]))
setting("midi.modwheel_polarity", "kbd", "MOD WHEEL POLARITY", "enum", "Wheel adds to or subtracts from the destination.", "MIDI > MOD WHEEL POLARITY", 44, memory="patch", values=vals(["positive", "negative"]))
setting("midi.pc_send", "kbd", "PC SEND", "boolean", "Send program change when changing presets.", "MIDI > PC SEND", 44)
setting("voice.mode", "kbd", "VOICE MODE", "enum", "Voice assignment.", "VOICE > MODE", 44, memory="patch",
        values=vals([("mono", "MONOPHONIC", "one voice, last-note priority"), ("poly", "POLYPHONIC", "up to NUMBER OF VOICES"), ("unison", "UNISON", "all voices on one note, last-note priority")]))
setting("voice.count", "kbd", "NUMBER OF VOICES", "integer", "Maximum voices in poly mode (unison per the mode text).", "VOICE > NUMBER OF VOICES", 45, range={"min": 1, "max": 8}, default=8)
setting("voice.drift", "kbd", "DETUNE (drift)", "continuous", "Random pitch drift per voice, 0.1 Hz steps up to 3.0 Hz.", "VOICE > DETUNE", 45, memory="patch", physical={"min": 0, "max": 3, "unit": "Hz"})
setting("voice.cards", "kbd", "CARDS PER VOICE", "integer", "1: 8-note poly; 2: two voice cards per note, 4-note poly (mono and poly modes).", "VOICE > CARDS PER VOICE", 46, range={"min": 1, "max": 2}, default=1)
setting("voice.hpf_mod", "kbd", "HPF MOD", "enum", "Filter envelope polarity on the HPF.", "VOICE > HPF MOD", 46,
        values=vals([("normal", "NORMAL", "HPF envelope opposite to the LPF"), ("inverted", "INVERTED", "HPF envelope moves the same way as the LPF")]))
for pid, lbl, fn, path, rng, dflt, mem in (
        ("time.lfo_max", "LFO MAX", "Sub-oscillator speed at the fast end.", "TIME > LFO MAX", {"min": 10, "max": 45, "unit": "Hz"}, 25, "patch"),
        ("time.lfo_min", "LFO MIN", "Sub-oscillator speed at the slow end.", "TIME > LFO MIN", {"min": 0.1, "max": 5, "unit": "Hz"}, 0.7, "patch"),
        ("time.pwm_max", "PWM MAX", "PWM LFO fastest rate.", "TIME > PWM MAX", {"min": 10, "max": 100, "unit": "Hz"}, 70, "patch"),
        ("time.pwm_min", "PWM MIN", "PWM LFO slowest rate.", "TIME > PWM MIN", {"min": 0.1, "max": 5, "unit": "Hz"}, 0.7, "patch"),
        ("time.attack_max", "ATTACK TIME", "Maximum attack of both envelopes (1 s steps to 10 s, then 10 s steps).", "TIME > ATTACK TIME", {"min": 1, "max": 100, "unit": "s"}, 1, "patch"),
        ("time.decrel_max", "DEC/REL TIME", "Maximum decay and release of both envelopes.", "TIME > DEC/REL TIME", {"min": 15, "max": 150, "unit": "s"}, 15, "patch")):
    setting(pid, "subosc" if "lfo" in pid else ("ch1_pwm" if "pwm" in pid else "ch1_fenv"), lbl, "continuous", fn, path, 46, memory=mem, physical=rng, default=dflt)
setting("time.pwm_mode", "ch1_pwm", "PWM MODE", "enum", "Layer PWM LFOs independent, or both at layer I SPEED (depths stay separate).", "TIME > PWM MODE", 47, values=vals(["separate", "sync"]))
setting("time.lfo_depth", "subosc", "LFO DEPTH", "enum", "Maximum sub-oscillator depth.", "TIME > LFO DEPTH", 48, memory="patch", values=vals([("classic", "CLASSIC", "default"), ("extended", "EXTENDED")]), default="classic")
setting("time.lfo_mode", "subosc", "LFO MODE", "enum", "Sub-oscillator phase per note or shared.", "TIME > LFO MODE", 48,
        values=vals([("poly", "POLY", "independent per note"), ("mono", "MONO", "one phase for all notes, set by the first note")]))
setting("tuning.micro", "kbd", "MICROTUNING", "boolean", "Enable a microtuning loaded as MTS SysEx (e.g. OddSound MTS-ESP); TUNING PROGRAM selects which.", "MICROTUNING", 49)
setting("kbd.bend_range", "kbd", "PITCHBEND RANGE", "integer", "MIDI pitch bend range in semitones.", "KEYBOARD > PITCHBEND RANGE", 50, range={"min": 1, "max": 99}, default=3)
setting("kbd.tr_bend_range", "kbd", "TR PITCHBEND RANGE", "integer", "Range of the touch-response P.BEND slider in semitones.", "KEYBOARD > TR PITCHBEND RANGE", 50, range={"min": 1, "max": 20}, default=1)
setting("kbd.tracking_width", "kbd", "TRACKING WIDTH", "integer", "Octave span over which KEYBOARD CONTROL acts.", "KEYBOARD > TRACKING WIDTH", 50, range={"min": 1, "max": 10}, default=4)
setting("kbd.middle_octave", "kbd", "MIDDLE OCTAVE", "integer", "Centre octave for TRACKING WIDTH.", "KEYBOARD > MIDDLE OCTAVE", 51, range={"min": 0, "max": 9, "note": "values not listed"}, confidence="inferred")
setting("kbd.kc_amount", "kbd", "AMOUNT", "enum", "KEYBOARD CONTROL range: as the CS-80 or extended.", "KEYBOARD > AMOUNT", 51, values=vals(["normal", "extended"]))
setting("out.preset_volume", "out", "PRESET VOLUME", "continuous", "Per-patch gain.", "PRESET VOLUME", 51, memory="patch", physical={"min": -6, "max": 6, "unit": "dB"})
setting("ui.screensaver", "kbd", "SCREENSAVER", "enum", "Screensaver delay.", "SCREENSAVER", 52, values=vals(["never", "5_min", "10_min", "30_min", "1_hour"]))

# ---------------------------------------------------------------- ports
jack("jack.audio_out", "AUDIO OUT", "out", "audio", "out.main", "Mono audio output, balanced on MK2.3 and later (unbalanced before).", "6.35 mm TRS")
jack("jack.phones", "PHONES", "out", "audio", "out.phones", "Headphones; the mono signal on both sides.", "6.35 mm TRS", location="front", confidence="inferred", note="Size inferred from the panel graphic.")
jack("midi.in", "MIDI IN", "in", "midi", "kbd.din_in", "MIDI input.", "5-pin DIN")
jack("midi.thru", "MIDI THRU", "out", "midi", "kbd.thru", "MIDI thru.", "5-pin DIN")
jack("midi.out", "MIDI OUT", "out", "midi", "kbd.midi_out", "MIDI output (program change send).", "5-pin DIN")
jack("usb", "USB", "in", "midi", "kbd.usb", "USB MIDI; USB drive mode (hold SHIFT at power-on) for preset backup and firmware.", "USB-B")
jack("power.dc", "POWER", "in", "power", None, "12 V DC (2 A rating on the unit; 12 V 2.5 A supply included).", "DC barrel")

# ---------------------------------------------------------------- connections (CS-80 routing minus keyboard, ribbon, ring mod, tremolo, pedal)
for c_, n, ab in CH:
    con("kbd.pitch", f"{c_}_vco.pitch_cv", "cv", note="Includes glide or glissando per P/G.")
    con("kbd.bend", f"{c_}_vco.pitch_cv", "cv", amount="kbd.bend_range", note="MIDI pitch bend (per note in MPE).")
    con("kbd.velocity", f"{c_}_vco.pitch_cv", "cv", amount="touch.pitchbend", note="Velocity pitch bend: start flat, slide to pitch.")
    con("subosc.out", f"{c_}_vco.pitch_cv", "cv", amount="subosc.vco")
    con("subosc.out", f"{c_}_vco.pitch_cv", "cv", amount_expr="touch.after_vco * kbd.pressure", note="Aftertouch vibrato.")
    con(f"{c_}_pwm.out", f"{c_}_vco.pwm_cv", "cv", amount=f"{c_}.pwm_depth")
    con(f"{c_}_vco.square", f"{c_}_mix.square", eq(f"{c_}.square", True))
    con(f"{c_}_vco.saw", f"{c_}_mix.saw", eq(f"{c_}.saw", True))
    con(f"{c_}_noise.out", f"{c_}_mix.noise", amount=f"{c_}.noise")
    con(f"{c_}_mix.out", f"{c_}_vcf.in")
    con("kbd.gate", f"{c_}_fenv.gate", "gate")
    con(f"{c_}_fenv.out", f"{c_}_vcf.cutoff_cv", "cv", note="Moves HPF and LPF; HPF polarity set by HPF MOD.")
    con("kbd.velocity", f"{c_}_vcf.cutoff_cv", "cv", amount=f"{c_}.init_brill")
    con("kbd.pressure", f"{c_}_vcf.cutoff_cv", "cv", amount=f"{c_}.after_brill")
    con("subosc.out", f"{c_}_vcf.cutoff_cv", "cv", amount="subosc.vcf")
    con("subosc.out", f"{c_}_vcf.cutoff_cv", "cv", amount_expr="touch.after_vcf * kbd.pressure")
    con("kbd.pitch", f"{c_}_vcf.cutoff_cv", "cv", amount="kbdctl.brill_high", note="Keyboard control brilliance low/high curve around MIDDLE OCTAVE over TRACKING WIDTH.")
    con("kbd.modwheel", f"{c_}_vcf.cutoff_cv", "cv", eq("midi.modwheel_dest", "brilliance"), note="polarity per MOD WHEEL POLARITY")
    con(f"{c_}_vcf.out", f"{c_}_vca.filtered", amount=f"{c_}.vcf_level")
    con(f"{c_}_vco.sine", f"{c_}_vca.sine", amount=f"{c_}.sine_level", note="The sine bypasses the filters.")
    con("kbd.gate", f"{c_}_aenv.gate", "gate")
    con("kbd.velocity", f"{c_}_aenv.touch", "cv", amount=f"{c_}.init_level")
    con("kbd.pressure", f"{c_}_aenv.touch", "cv", amount=f"{c_}.after_level")
    con(f"{c_}_aenv.out", f"{c_}_vca.cv", "cv", amount=f"{c_}.level")
    con("subosc.out", f"{c_}_vca.cv", "cv", amount="subosc.vca")
    con(f"{c_}_vca.out", f"chmix.{c_}")
con("kbd.modwheel", "ch1_pwm.rate_cv", "cv", {"any": [eq("midi.modwheel_dest", "pwm_speed_1"), eq("midi.modwheel_dest", "pwm_speed_12")]})
con("kbd.modwheel", "ch2_pwm.rate_cv", "cv", {"any": [eq("midi.modwheel_dest", "pwm_speed_2"), eq("midi.modwheel_dest", "pwm_speed_12")]})
con("kbd.pressure", "subosc.rate_cv", "cv", amount="touch.after_speed", note="Aftertouch raises the sub-oscillator speed.")
con("kbd.modwheel", "subosc.depth_cv", "cv", {"any": [eq("midi.modwheel_dest", "lfo_vco"), eq("midi.modwheel_dest", "lfo_vcf"), eq("midi.modwheel_dest", "lfo_vca")]},
    note="Other wheel destinations (portamento, detune, FEET, noise) act on those parameters directly.")
con("chmix.out", "out.in", amount="chmix.mix", note="All voices summed.")
D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C

D["indicators"] = [{"id": "oled", "module": "kbd", "label": "OLED (128 x 64)", "kind": "display", "function": "Bank, preset number or PNL, active voices (8 boxes), MIDI/USB activity, soft-button labels, settings menus."}]
D["behaviours"] = [
    {"id": "b01", "name": "Two layers per voice", "applies_to": ["chmix", "kbd"], "rule": "Every note sounds layer I and layer II on its voice card; MIX crossfades them; DETUNE CH II thickens them; CARDS PER VOICE 2 doubles the cards per note (4-note poly)."},
    {"id": "b02", "name": "Filter envelope", "applies_to": ["ch1_fenv", "ch2_fenv"], "rule": "IL-AL-A-D-R: start IL below the set cutoffs, move over A to AL, decay to the set cutoffs, release over R. With IL and AL at 0 it does nothing. HPF MOD sets whether the HPF follows the LPF or moves opposite."},
    {"id": "b03", "name": "Sine bypass", "applies_to": ["ch1_vca", "ch2_vca"], "rule": "Square, saw and noise pass the filters (VCF LEVEL); the sine goes straight to the VCA (SINE)."},
    {"id": "b04", "name": "Touch response", "applies_to": ["kbd", "subosc"], "rule": "Per layer: velocity and aftertouch raise brilliance and level. Shared: velocity pitch bend, and aftertouch raising sub-oscillator speed and its VCO and VCF depth, note by note in poly AT or MPE mode."},
    {"id": "b05", "name": "Sustain I / II", "applies_to": ["kbd"], "rule": "I: round-robin, every note releases independently. II: new notes cut off released ones and carry the release (as the CS-80), useful for legato lines over held chords; affects glide behaviour."},
    {"id": "b06", "name": "Master sustain", "applies_to": ["ch1_aenv", "ch2_aenv"], "rule": "The SUSTAIN slider changes the release of both layers independently of the VCA R sliders."},
    {"id": "b07", "name": "Inverted sliders", "applies_to": ["subosc", "kbd"], "rule": "Like the CS-80, some sliders are at maximum at the bottom (sub-osc and touch response sections, RESO, SUSTAIN short at bottom); centre-detent sliders (pitch, detune, MIX, BRIL, keyboard control) are neutral at centre."},
    {"id": "b08", "name": "Stored presets and panel", "applies_to": ["kbd"], "rule": "A preset stores all sliders, switches and per-patch settings. Moving a slider takes over by PICK UP, MERGE or INSTANT; PANEL plays the physical panel."},
    {"id": "b09", "name": "Adjustable ranges", "applies_to": ["subosc", "ch1_pwm", "ch2_pwm", "ch1_fenv", "ch1_aenv"], "rule": "Per patch: sub-oscillator 0.1-45 Hz limits (default 0.7-25), PWM LFO 0.1-100 Hz (default 0.7-70), maximum attack 1-100 s and decay/release 15-150 s, LFO depth CLASSIC or EXTENDED."},
    {"id": "b11", "name": "Footage and MIDI keyboards", "applies_to": ["ch1_vco", "ch2_vco"], "rule": "To match CS-80 pitch from a standard 61-note MIDI keyboard, set FEET one octave lower (SOS)."},
    {"id": "b12", "name": "Mono LFO", "applies_to": ["subosc"], "rule": "LFO MODE MONO uses one LFO started by the first note, not free-running (SOS); POLY gives each voice its own LFO."},
    {"id": "b10", "name": "Warm-up", "applies_to": ["ch1_vco", "ch2_vco"], "rule": "Oscillators take a few minutes to settle; RETUNE takes 10-20 s; full calibration after 20 minutes warm-up takes 10-15 minutes."},
]
CCX = {"0": "bank select (0-8)", "1": "mod wheel (destination per patch)", "64": "sustain pedal", "74": "brilliance (MPE CC74 default; see CC74 REPLACE)"}
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "control_change", "note": "if CC RECEIVE is on"}, {"message": "program_change"},
                 {"message": "poly_pressure"}, {"message": "channel_pressure"}, {"message": "pitch_bend"}, {"message": "mpe", "note": "master channel 1-8 plus one channel per voice"},
                 {"message": "sysex", "note": "MTS microtuning"}],
    "transmits": [{"message": "program_change", "note": "if PC SEND is on"}],
    "cc_map": {k: v for k, v in sorted({**CC, **CCX}.items(), key=lambda kv: int(kv[0]))},
    "channel_note": "Receive channel 1-16 (MPE master 1-8); separate out channel.",
    "note": "Two-state switches use 0-64 / 65-127; centre-detent sliders 0-64-127; FEET and FUNCTION six ranges of about 21. The MIDI out does not send slider CCs per the manual.",
}
D["specifications"] = {
    "voices": "8 voice cards x 2 layers", "filters": "12 dB/oct HPF and LPF per layer, discrete, no self-oscillation", "presets": {"total": 1152, "writable": 1024, "banks": 9},
    "pw_percent": [50, 90], "coarse_tune": "about +/-5 semitones", "fine_tune": "about +/-1 semitone", "detune_ch2": "about +/-1 semitone",
    "sub_osc_hz": {"default": [0.7, 25], "settable": [0.1, 45]}, "pwm_lfo_hz": {"default": [0.7, 70], "settable": [0.1, 100]}, "attack_max_s": [1, 100], "decay_release_max_s": [15, 150],
    "glide_s_max": 10, "pitchbend_semitones": [1, 99], "drift_hz_max": 3,
    "outputs": "1/4 inch mono AUDIO OUT (balanced from MK2.3), front headphone jack", "midi": "DIN in, thru, out; USB-B", "display": "128 x 64 OLED",
    "power": "12 V DC, 2 A, centre positive (12 V 2.5 A 30 W supply)", "power_mk1": "12 V DC 5.8 A (SOS)",
    "release": "Announced 13 February 2020 (Synthtopia), shipping from mid-2020; US$3,749 assembled; also sold as a kit",
    "envelopes_lfo": "digitally generated control signals (SOS, MK1)", "dimensions_mm": {"w": 461, "h": 178, "d": 50}, "dimensions_note": "Manual. Thomann gives 483 x 178 mm (the 19-inch rack width with ears); no other source gives depth.", "rack": "19 inch, 4U (rack ears supplied)", "weight_kg": 2.35,
}
D["omitted_from_source"] = ["safety and compliance text", "package contents beyond the supply", "OddSound plugin step-by-step", "firmware update and USB drive steps beyond the summary", "MK1 CV input details"]
D["not_in_source"] = [
    "Research filled: release date and price, supply polarity, MK1 engine details (VCO chips, digital envelopes and LFO, filter character), LFO waveform history (EXT replaced by S/H), footage offset for MIDI keyboards, mono LFO behaviour. Still open: depth, VCO range, whether TOUCH SPEED is velocity or aftertouch on MK2 firmware, P/G centre position.","VCO frequency range", "envelope minimum times", "exact keyboard control curve", "MIDDLE OCTAVE values", "headphone jack size", "audio output level", "which mod wheel destinations noise 1/2 use as CCs"]
D["source_inconsistencies"] = [
    "Manual version: file named 2.3.3; the cover says 2.3.0.",
    "Sub-oscillator waveforms: features list 'sine, saw, ramp, square and stepped random' (5); panel list 'sine, saw, ramp, square, random (Sample & Hold), or External'; FUNCTION section 'sine, saw, reverse saw, square, random, sample & hold, and external' (7); panel graphic and CC 104 have six positions (sine, saw, reverse saw, square, RND, S/H).",
    "Touch response SPEED: panel list (41) says aftertouch speeds up the LFO; the TOUCH RESPONSE section says velocity. The panel graphic groups SPEED under 'SUB OSC AFTER', so aftertouch is modelled.",
    "LPF: panel list (9) says 'Set to Low, the filter is completely open'; the VCF section says top is open and bottom closed.",
    "P/G switch: described as 3-position (P, no glide, G) but drawn with only P and G.",
    "FEET: the panel list gives '2 1/3'' for a fifth above 4'; the FEET section and graphic give 2 2/3'.",
    "PWM MAX/MIN are said to set the top and bottom of the 'PWM slider'; they are rate limits, so they apply to the SPEED slider.",
    "IL and AL: the text says both 'have no effect if the VCF attack is at minimum', and describes AL as 'reducing fundamentals'; elsewhere AL is the envelope peak above the cutoffs.",
    "SINE: described as 'generated by the VCF'; it comes from the VCO and bypasses the VCF.",
    "Presets: '1152 presets' and '128 factory presets and 8 user banks', '1,024 editable', versus 'Editing ... BANKs 1 or 2' and backup files 'dd_bank_1.p and dd_bank_2.p' (older two-bank wording).",
    "Bank select: CC 0 range 0-8 in the chart, but the text says '0 = User Bank 1, 1 = User Bank 2, 2 = Factory Bank'.",
    "CC chart: CC 74 is listed as BRILLIANCE while global BRIL is CC 109 and HPF B is CC 73; RESH B is CC 119 out of sequence; square and saw switch order differs between layers (A 43/44, B 71/70).",
    "Mod wheel destination DETUNE is given as CC 95, but the CC chart has DETUNE on CC 32 and nothing on CC 95.",
    "Panel numbering restarts at 1 after control 45, while the text refers to 'switch 49' and 'slider 48'.",
    "NUMBER OF VOICES 'does not affect MONOPHONIC or UNISON, as they are limited to 1 voice', while the UNISON text says it uses up to NUMBER OF VOICES voices.",
    "Power: DC input listed as 12 V / 2 A; the supplied adapter is 12 V 2.5 A.",
    "Between sources: preset count is 384 (3 banks) in 2020 launch reports, 256 on Thomann's page and 1152 in this manual; later firmware added banks.",
    "Between sources: SOS (MK1) gives coarse tuning +6/-7 semitones; this manual says about +/-5.",
    "Between sources: SOS calls the filter contour IL-AL-A-D-R with zero sustain and says the manual's ADR/ADSR labels are wrong; the MK2 manual still calls it ADR.",
    "Between sources: Bonedo describes portamento as a slider only; the manual and panel show a P/G switch plus slider. Whether the switch has a centre off position is still unconfirmed.",
    "Between sources: Bank 2 holds 'recreations of the original 14 CS-80 presets'; the CS-80 manual lists 11 presets per channel (21-22 names).",
]
D["modelling_gaps"] = [
    {"topic": "Shared ids with the CS-80", "detail": "Layer I/II reuse the CS-80 'ch1'/'ch2' ids and the shared controls keep their CS-80 ids so the files can be diffed. Labels follow the Deckard's Dream panel."},
    {"topic": "Removed CS-80 sections", "detail": "No keyboard, ribbon, ring modulator, tremolo/chorus, preset tone selector, memory panels, foot controller or external input. The MIDI input replaces the keyboard as 'kbd'."},
    {"topic": "Keyboard control curve", "detail": "Low and high halves act on a curve around MIDDLE OCTAVE across TRACKING WIDTH; modelled as one connection with the curve described in notes."},
    {"topic": "Mod wheel", "detail": "The per-patch wheel destination is modelled with switched connections for LFO depth, brilliance and PWM speed; the remaining destinations act on parameters directly."},
    {"topic": "Physical depth", "detail": "The manual gives 50 mm depth; recorded as stated though it looks small for a unit with eight voice cards."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/black-corporation-deckards-dream-mk2_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written", len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")
