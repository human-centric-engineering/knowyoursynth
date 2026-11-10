#!/usr/bin/env python3
"""Assemble the Formanta Polivoks device file (schema 0.13.0).

Soviet duophonic analogue synthesizer (Formanta factory, 1982; designer Vladimir Kuzmin):
two generators with five ranges and five shapes (Generator II detunable and able to FM
Generator I), noise, external input; mixer; Kuzmin's 2-pole filter on K140UD12
programmable op-amps (low-pass 12 dB / band-pass 6 dB) with its own envelope; amplifier
with envelope; one modulator (triangle, square, noise, stepped); glissando; 49-key
magnetic-reed keyboard, mono or duophonic (top key to Generator I, bottom key to II).

Sources: the original Polivoks operating manual (Russian scan; re-OCRed in Russian for
this build, including the 40-item front panel legend and specifications); Polynominal,
Vintage Synth Explorer, MATRIXSYNTH, monosounds.studio (duophonic scheme), Elta Music
(filter response); Erica Synths' Polivoks VCA/Envelope manual noted as a modern derivative.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []
SHAPES = ["triangle", "sawtooth", "square", "pulse_1", "pulse_2"]
RANGES = ["32'", "16'", "8'", "4'", "2'"]


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, ref, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind, "manual_ref": ref}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = "none"
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, ref, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, ref, **kw)


def sw(id, module, label, fn, ref, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, ref, control=control, values=[{"value": v} for v in vals], **kw)


def jack(id, label, direction, signal, node, fn, connector="5-pin DIN", **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
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
    "id": "formanta-polivoks", "manufacturer": "Formanta (Formanta Radio Factory, Ufa, USSR)", "model": "Polivoks (Поливокс) electronic music synthesizer",
    "category": "duophonic analogue synthesizer, 49 keys (F-E), portable",
    "based_on": "Original Soviet design by Vladimir Kuzmin; produced from 1982, sold only in the USSR. Technical conditions 3.849.014 TU.",
    "sources": [
        {"id": "manual", "title": "Polivoks Operating Manual (Руководство по эксплуатации), Russian original", "kind": "user_manual", "file": "Polivoks_Owners_Manual.pdf", "pages": 7,
         "note": "Scanned with a broken text layer; re-OCRed in Russian. General notes, delivery set, safety, specifications, short description, front panel legend (controls 1-40), rear panel, tuning procedure, functional blocks (generators, modulator, mixer, filter, amplifier), fault table, warranty."},
        {"id": "online", "title": "Polynominal, Vintage Synth Explorer, MATRIXSYNTH (English panel translation), monosounds.studio", "kind": "other", "file": "https://www.polynominal.com/Polivoks-formanta/",
         "note": "Five ranges 32'-2' and five shapes per generator; 49-key F-E magnetic keyboard; DIN connections; duophonic assignment (Generator I top key, II bottom key per Russian Wikipedia and Kuzmin)."},
        {"id": "elta", "title": "Elta Music Polivoks-8 description", "kind": "other", "file": "https://www.eltamusic.com/polivoks-8",
         "note": "Kuzmin's filter on K140UD12 ICs: 12 dB/oct low-pass, 6 dB/oct band-pass."},
        {"id": "erica_vca", "title": "Erica Synths Polivoks VCA/Envelope (Eurorack) manual", "kind": "other", "file": "Polivoks_VCA_Manual.pdf", "pages": 1,
         "note": "Modern Polivoks-inspired module (ADSR with repeat, speed and delays); not part of the original instrument, cited for context only."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 2,
    "polyphony_mode": "monophonic (1-voice) or duophonic (2-voice): Generator I follows the highest key held, Generator II the lowest; one filter and amplifier shared",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No memory.", "semi_modular": False, "panel_counts": {"keys": 49, "controls": 40},
    "summary": ("Two wide-range generators (triangle, sawtooth, square and two pulse widths; 32' to 2'), Generator II detunable by about two tones and able to frequency-modulate Generator I; "
                "white noise and an external input; a mixer with four levels. The filter (Kuzmin's design on K140UD12 programmable op-amps) is low-pass or band-pass with cutoff, resonance "
                "('characteristic harshness' at high settings), envelope and modulator depth, and pedal control. Filter and amplifier each have an envelope with attack, decay, pedestal "
                "(sustain level), after-sound (release) and a single or repeating ('накат') mode. One modulator: triangle, square, noise (random pulses) or stepped (sample and hold), "
                "routed to both generators, the filter and the amplifier. Glissando on Generator I; key-memory switch."),
}

mod("kbd", "voice_allocator", "Keyboard", "keyboard / switches 2, 15", "49-key (F-E) keyboard with magnetically controlled reed contacts; duophonic scanner gives top and bottom key; mono or duo; key memory (ВКЛ.) holds the last key.",
    ["kbd.pedal_in"], ["kbd.pitch_top", "kbd.pitch_bottom", "kbd.gate", "kbd.pedal"], scope="common", props={"keys": 49, "range": "F-E"})
mod("gen1", "oscillator", "Generator I (ГЕНЕРАТОР I)", "ГЕНЕРАТОР I", "Wide-range oscillator: range (ДИАПАЗОН, octave steps), shape (ФОРМА), modulator depth (МОДУЛЯЦИЯ), FM from Generator II (ГЕНЕРАТОР II); glissando.",
    ["gen1.pitch_cv", "gen1.fm"], ["gen1.out"], props={"ranges": RANGES, "shapes": SHAPES})
mod("gen2", "oscillator", "Generator II (ГЕНЕРАТОР II)", "ГЕНЕРАТОР II", "Wide-range oscillator: range, shape, modulator depth and detune (РАССТРОЙКА, ±25 %, about ±2 tones) against Generator I.",
    ["gen2.pitch_cv"], ["gen2.out"], props={"ranges": RANGES, "shapes": SHAPES})
mod("noise", "noise", "Noise generator", "МИКШЕР", "White noise for non-musical sounds (wind, surf, steam engine).", [], ["noise.out"], scope="common")
mod("extin", "preamp", "External input", "rear panel", "External source (guitar, electric piano, organ) into the mixer.", ["extin.in"], ["extin.out"], scope="common")
mod("mixer", "mixer", "Mixer (МИКШЕР)", "МИКШЕР", "Generator I, Generator II, noise and external levels, independent.", ["mixer.gen1", "mixer.gen2", "mixer.noise", "mixer.ext"], ["mixer.out"])
mod("modulator", "lfo", "Modulator (МОДУЛЯТОР)", "МОДУЛЯТОР", "Triangle, square, noise (chaotic pulses) or stepped (sample and hold) at ЧАСТОТА rate, with LED; feeds both generators, the filter and the amplifier.", [], ["modulator.out"],
    scope="common")
mod("vcf", "filter", "Filter (ФИЛЬТР)", "ФИЛЬТР", "Kuzmin's state-variable filter on K140UD12 programmable op-amps: low-pass 12 dB/oct or band-pass 6 dB/oct (ПФ/ФНЧ); cutoff 100 Hz-10 kHz; resonance gives the characteristic harshness and self-oscillation.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"modes": ["low_pass_12dB", "band_pass_6dB"], "cutoff_hz": [100, 10000], "ic": "K140UD12 (uA776 equivalent)"})
mod("fenv", "envelope", "Filter envelope", "ФИЛЬТР", "Attack, decay (ЗАТУХАНИЕ), pedestal (ПЬЕДЕСТАЛ, sustain level), after-sound (ПОСЛЕЗВУЧАНИЕ, release); single or repeating (накат) mode.", ["fenv.gate"], ["fenv.out"])
mod("aenv", "envelope", "Amplifier envelope", "УСИЛИТЕЛЬ", "Attack, decay, pedestal, after-sound; single or repeating mode.", ["aenv.gate"], ["aenv.out"])
mod("vca", "vca", "Amplifier (УСИЛИТЕЛЬ)", "УСИЛИТЕЛЬ", "Final stage: loudness under the amplifier envelope, plus modulator tremolo.", ["vca.in", "vca.cv"], ["vca.out"])
mod("out", "output", "Output", "left panel / rear panel", "Output level and output switch; low (0.025 V) and high (0.25 V) level outputs into 10 kohm; headphones.", ["out.in"], ["out.main", "out.phones"], scope="common")

par("sys.power", "out", "СЕТЬ (power)", "boolean", "Mains power button.", 1, control="push_button")
sw("kbd.key_memory", "kbd", "ВКЛ. (key memory)", "Back position: generators hold the last key pressed while the envelopes keep working.", 2, ["off", "hold_last_key"])
knob("vca.mod", "vca", "МОДУЛЯЦИЯ (amplifier)", "Depth of modulator on loudness (tremolo).", 3)
sw("vcf.mode", "vcf", "ПФ/ФНЧ", "Band-pass (switch away) or low-pass.", 4, ["low_pass", "band_pass"])
knob("vcf.resonance", "vcf", "РЕЗОНАНС", "Resonance at cutoff; towards the right gives the characteristic harshness.", 5)
knob("vcf.env", "vcf", "ОГИБАЮЩАЯ (filter envelope depth)", "Range of cutoff movement by the filter envelope.", 6)
knob("vcf.mod", "vcf", "МОДУЛЯЦИЯ (filter)", "Depth of modulator on cutoff (timbral vibrato).", 7)
knob("gen2.detune", "gen2", "РАССТРОЙКА", "Generator II detune against Generator I, at least ±25 % (±2 tones).", 8, panel_scale={"min": -5, "max": 5})
knob("mixer.ext", "mixer", "ВНЕШ. (external)", "External source level.", 9)
knob("mixer.noise", "mixer", "ШУМ", "Noise level.", 10)
knob("gen2.mod", "gen2", "МОДУЛЯЦИЯ (Generator II)", "Depth of modulator on Generator II pitch.", 11)
knob("mixer.gen2", "mixer", "ГЕНЕРАТОР II (mixer)", "Generator II level.", 12)
knob("mixer.gen1", "mixer", "ГЕНЕРАТОР I (mixer)", "Generator I level.", 13)
sw("out.enable", "out", "ВЫХОД (output switch)", "Output on/off.", 14, ["off", "on"])
sw("kbd.voices", "kbd", "1-ГОЛ. / 2-ГОЛ.", "Monophonic or duophonic.", 15, ["1_voice", "2_voice"])
knob("out.level", "out", "Output level", "Synthesizer output level.", 16)
knob("gen1.glide", "gen1", "ГЛИССАНДО", "Rate of pitch change of Generator I between notes.", 17)
knob("out.level2", "out", "Output level (second)", "Second output level control.", 18, confidence="inferred", note="Legend item 18 is partly illegible in the scan ('регулятор выходного сигнала ...').")
knob("gen.tune", "gen1", "НАСТРОЙКА (tune)", "Master tuning of both generators, at least ±12 % (±1 tone).", 19, panel_scale={"min": -5, "max": 5})
knob("modulator.rate", "modulator", "ЧАСТОТА (modulator)", "Modulator rate (LED 21).", 20)
sw("modulator.shape", "modulator", "РЕЖИМ (modulator)", "Modulator shape.", 22, ["triangle", "square", "noise", "stepped"], control="rotary_switch")
knob("gen1.mod", "gen1", "МОДУЛЯЦИЯ (Generator I)", "Depth of modulator on Generator I pitch.", 23)
sw("gen1.range", "gen1", "ДИАПАЗОН (Generator I)", "Octave range.", 24, RANGES, control="rotary_switch")
knob("gen1.fm", "gen1", "ГЕНЕРАТОР II (FM depth)", "Frequency modulation of Generator I by Generator II (Generator II should be in a lower range).", 25)
sw("gen1.shape", "gen1", "ФОРМА (Generator I)", "Waveform.", 26, SHAPES, control="rotary_switch")
sw("gen2.range", "gen2", "ДИАПАЗОН (Generator II)", "Octave range.", 27, RANGES, control="rotary_switch")
sw("gen2.shape", "gen2", "ФОРМА (Generator II)", "Waveform.", 28, SHAPES, control="rotary_switch")
knob("vcf.cutoff", "vcf", "ЧАСТОТА СРЕЗА", "Cutoff; at 0 there is no sound.", 29, physical={"min": 100, "max": 10000, "unit": "Hz"})
knob("fenv.decay", "fenv", "ЗАТУХАНИЕ (filter)", "Fall from the attack peak to the pedestal.", 30)
knob("fenv.attack", "fenv", "АТАКА (filter)", "Rise time.", 31)
knob("fenv.pedestal", "fenv", "ПЬЕДЕСТАЛ (filter)", "Sustain level; fully right makes decay inactive.", 32)
sw("fenv.mode", "fenv", "РЕЖИМ ГЕНЕРАТОРА ОГИБАЮЩЕЙ (filter)", "Single or repeating (накат) while the key is held.", 33, ["single", "repeat"])
knob("fenv.release", "fenv", "ПОСЛЕЗВУЧАНИЕ (filter)", "Return after key release.", 34)
knob("aenv.attack", "aenv", "АТАКА (amplifier)", "Rise of loudness.", 35)
knob("aenv.pedestal", "aenv", "ПЬЕДЕСТАЛ (amplifier)", "Sustain level; fully right makes decay inactive.", 36)
knob("aenv.decay", "aenv", "ЗАТУХАНИЕ (amplifier)", "Fall to the pedestal.", 37)
knob("aenv.release", "aenv", "ПОСЛЕЗВУЧАНИЕ (amplifier)", "Fall to zero after key release.", 38)
sw("aenv.mode", "aenv", "РЕЖИМ ГЕНЕРАТОРА ОГИБАЮЩЕЙ (amplifier)", "Single or repeating while the key is held.", 39, ["single", "repeat"])
for pid, lab in (("trim.offset1", "СМЕЩЕНИЕ I"), ("trim.tune1", "СТРОЙ I"), ("trim.reg1", "РЕГИСТРЫ I"), ("trim.offset2", "СМЕЩЕНИЕ II"), ("trim.tune2", "СТРОЙ II"), ("trim.reg2", "РЕГИСТРЫ II")):
    par(pid, "gen1" if pid.endswith("1") else "gen2", f"{lab} (trimmer)", "continuous", "Tuning trimmer (offset, scale or register) used in the tuning procedure.", "Fig. 3",
        panel_scale=S10, access=[{"type": "panel", "control": "knob", "note": "screwdriver trimmer under the removable front-panel cover"}])

jack("jack.out", "ВЫХОД", "out", "audio", "out.main", "Audio output (low and high level).")
jack("jack.phones", "Headphones", "out", "audio", "out.phones", "Headphone output.", confidence="inferred", note="From online panel translations; not on the manual's rear-panel drawing text.")
jack("jack.in", "ВХОД", "in", "audio", "extin.in", "External signal input.")
jack("jack.pedal", "ПЕДАЛЬ", "in", "cv", "kbd.pedal_in", "Pedal: pressing moves the filter cutoff upward.")
jack("jack.mains", "СЕТЬ", "in", "power", None, "220 V AC mains; fuse holder (ПРЕДОХР.).", connector="captive cord")

con("kbd.pitch_top", "gen1.pitch_cv", "cv", note="Glissando applies here; in 1-voice mode both generators take the same key.")
con("kbd.pitch_bottom", "gen2.pitch_cv", "cv", eq("kbd.voices", "2_voice"))
con("kbd.pitch_top", "gen2.pitch_cv", "cv", eq("kbd.voices", "1_voice"))
con("gen2.out", "gen1.fm", amount="gen1.fm")
con("modulator.out", "gen1.pitch_cv", "cv", amount="gen1.mod")
con("modulator.out", "gen2.pitch_cv", "cv", amount="gen2.mod")
con("gen1.out", "mixer.gen1", amount="mixer.gen1")
con("gen2.out", "mixer.gen2", amount="mixer.gen2")
con("noise.out", "mixer.noise", amount="mixer.noise")
con("extin.out", "mixer.ext", amount="mixer.ext")
con("mixer.out", "vcf.in")
con("fenv.out", "vcf.cutoff_cv", "cv", amount="vcf.env")
con("modulator.out", "vcf.cutoff_cv", "cv", amount="vcf.mod")
con("kbd.pedal", "vcf.cutoff_cv", "cv", note="Pedal raises the cutoff.")
con("kbd.gate", "fenv.gate", "gate")
con("kbd.gate", "aenv.gate", "gate")
con("vcf.out", "vca.in")
con("aenv.out", "vca.cv", "cv")
con("modulator.out", "vca.cv", "cv", amount="vca.mod")
con("vca.out", "out.in", amount="out.level")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [{"id": "mod_led", "module": "modulator", "label": "modulator rate indicator (21)", "kind": "led", "function": "Flashes at the modulator rate."},
                   {"id": "power_led", "module": "out", "label": "power indicator (40)", "kind": "lamp", "function": "Power on."}]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["gen1", "gen2", "mixer", "vcf", "vca"], "rule": "Generators, noise and external input mixed into one filter and one amplifier; both voices share them in duophonic mode."},
    {"id": "b02", "name": "Duophonic keyboard", "applies_to": ["kbd"],
     "rule": "2-ГОЛ.: Generator I follows the highest key held and Generator II the lowest (glissando on Generator I only). 1-ГОЛ.: both follow one key. ВКЛ. in the back position holds the last key's pitch while the envelopes keep working."},
    {"id": "b03", "name": "Envelopes", "applies_to": ["fenv", "aenv"],
     "rule": "Each key: rise at the attack rate, fall at the decay rate to the pedestal, and on release fall at the after-sound rate. Pedestal fully right disables the decay; pedestal at 0 returns to the start, and in repeat (накат) mode the cycle repeats until the key is released."},
    {"id": "b04", "name": "Filter", "applies_to": ["vcf"],
     "rule": "Low-pass or band-pass; cutoff 0 silences everything; resonance gives the famous harshness; the envelope moves the cutoff up from the ЧАСТОТА СРЕЗА setting; the pedal raises the cutoff."},
    {"id": "b05", "name": "Modulator", "applies_to": ["modulator"], "rule": "Triangle, square, noise or stepped waveform to Generator I and II pitch, filter cutoff and loudness, each with its own depth."},
    {"id": "b06", "name": "Tuning", "applies_to": ["gen1", "gen2"],
     "rule": "Warm up 10 minutes; remove the cover to reach eight trimmers; tune Generator I with СМЕЩЕНИЕ and СТРОЙ on the upper and lower A, then РЕГИСТРЫ across ranges; then Generator II against Generator I."},
]
D["midi"] = {"receives": [], "transmits": [], "note": "No MIDI or CV as built; retrofits for CV/gate and MIDI are common."}
D["specifications"] = {
    "voices": 2, "keyboard": "49 keys F-E, magnetic reed contacts", "generators": "2 (5 ranges, 5 shapes)", "filter": "low-pass 12 dB / band-pass 6 dB, 100 Hz-10 kHz",
    "tuning_range": "±12 % (±1 tone)", "gen2_detune": "±25 % (±2 tones)", "frequency_drift": "≤0.5 % over 4 hours", "dynamic_range_db": ">60",
    "output": "0.025 V (low) / 0.25 V (high) into 10 kohm", "power": "220 V AC, 10 VA max", "operating_temp_c": "+10 to +35",
    "dimensions_mm": {"synth": "780 x 490 x 195", "pedal": "273 x 93 x 52"}, "weight_kg": "≤20 (complete set)",
    "delivery_set": ["synthesizer", "pedal", "amplifier cable", "pedal cable", "spare fuses", "spare knobs", "manual", "box"],
}
D["omitted_from_source"] = ["warranty and safety text", "fault table detail", "precious metal content"]
D["not_in_source"] = ["circuit schematic (not freely confirmed online)", "envelope and modulator time ranges", "mono-mode key priority", "exact output connector pinouts"]
D["source_inconsistencies"] = [
    "Polynominal lists 48 keys and a 'Lowpass / High pass' filter; the manual and other sources give 49 keys (F-E) and low-pass / band-pass.",
    "Vintage Synth Explorer lists the modulator as triangle, saw, square and random; the manual describes triangle, square, noise (chaotic pulses) and stepped (sample and hold).",
    "Kuzmin's article says only that one generator follows the top key and one the bottom; Russian Wikipedia assigns the top key to Generator I.",
    "The manual's operating-temperature line OCRs as '+10...+35'; an English translation gives '-10 / +35'.",
    "The manual describes generator shapes as triangle, sawtooth and 'rectangular with various duty cycles'; online sources name five shapes (triangle, saw, square, pulse 1, pulse 2).",
]
D["modelling_gaps"] = [
    {"topic": "Scan quality", "detail": "Russian OCR of a poor scan; legend items 16 and 18 are partly illegible (18 inferred as a second output level)."},
    {"topic": "Not a build guide", "detail": "This models the instrument's controls and signal flow; a working clone needs the service schematic, which was not available."},
    {"topic": "Trimmers", "detail": "Six of the eight tuning trimmers are named in Fig. 3; the other two are not legible."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/formanta-polivoks_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
