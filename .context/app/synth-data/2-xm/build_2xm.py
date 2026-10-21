#!/usr/bin/env python3
"""Assemble the Behringer 2-XM device file.

Two identical synthesizer expander modules (XM1, XM2) plus a master section.
Each module has its own full set of controls, so they are modelled as two sets
of modules generated from one table, not as per-voice instances of one set.
"""
import json

D = {"schema_version": "0.7.0"}

D["device"] = {
    "id": "behringer-2-xm",
    "manufacturer": "Behringer",
    "model": "2-XM",
    "category": "duophonic analogue synthesizer: two expander modules in one desktop / Eurorack (80 HP) case",
    "based_on": "Oberheim Two Voice, which paired two SEMs (Synthesizer Expander Modules). The guide never names Oberheim; "
                "the module name, the notch-sweeping 12 dB state-variable filter and the bipolar mix controls are the SEM's.",
    "sources": [
        {"id": "xm", "title": "2-XM Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_2-XM_Manual.pdf", "pages": 31,
         "note": "108 numbered controls on pages 22 to 23 (1 to 28 for XM1, 29 to 56 for XM2, 70 to 85 and 86 to 101 for the "
                 "two patchbays), a poly chain note and a specifications table. Unusually for a quick start guide it gives "
                 "envelope times and the LFO range."},
        {"id": "panel", "title": "2-XM front panel image", "kind": "measurement", "file": "Behringer_2-XM.png",
         "note": "Used for switch position labels and the patchbay layout."},
    ],
}

D["architecture"] = {
    "synthesis": "subtractive",
    "signal_path": "analogue",
    "voices": 2,
    "timbrality": 2,
    "polyphony_mode": "duophonic: unison, split or duo across the two modules; poly chain across units",
    "poly_chain_max_units": None,
    "patch_memory": False,
    "semi_modular": True,
    "panel_counts": {"knobs": 48, "switches": 16, "jacks_3_5mm": 33},
    "summary": (
        "Two complete, independent synthesizer voices side by side, each with its own panel: two VCOs with sawtooth and "
        "pulse (VCO2 syncable to VCO1), a bipolar modulation knob per VCO that gives frequency modulation one way and pulse "
        "width modulation the other, a 12 dB/octave multimode filter whose NOTCH knob sweeps continuously from low-pass "
        "through notch to high-pass (or switches to band-pass), bipolar crossfade controls that mix each VCO's saw against "
        "its pulse and external audio against white noise, two ADS envelopes, an LFO and a VCA. Each module has a 16-jack "
        "patchbay. A master section sets each module's level, pan, external input level and portamento, and assigns the "
        "two voices as unison, split or duo."
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


def jack(id, label, ref, loc, direction, signal, node, function, connector="3.5mm TS", combine=None, confidence=None, note=None, electrical=None):
    j = {"id": id, "label": label, "manual_ref": ref, "location": loc, "direction": direction, "signal": signal,
         "connector": connector, "node": node}
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


SW = [{"type": "panel", "control": "slide_switch"}]
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]
S10 = {"min": 0, "max": 10}
BI = {"min": -5, "max": 5}

# --------------------------------------------------------------------------
# master section
# --------------------------------------------------------------------------
mod("alloc", "voice_allocator", "Voice assignment", "MASTER SECTION",
    "Receives MIDI and hands notes to the two modules. UNISON: both play one note; a second note goes to one module by the "
    "priority set in SynthTRIBE (highest, lowest or last for XM1, XM2 takes the other). SPLIT: XM1 below the split point "
    "(default C4), XM2 above, XM2 on the next MIDI channel up. DUO: both modules on one channel duophonically, or on "
    "separate channels. Also produces each module's MIDI-derived CV, gate and velocity.",
    [], ["alloc.xm1_pitch", "alloc.xm1_gate", "alloc.xm2_pitch", "alloc.xm2_gate", "alloc.velocity"],
    {"voice_count": 2})
mod("noise", "noise", "White noise", "VCF (EXT)",
    "White noise source reached through each module's EXT crossfade control. Shared between the modules by inference; the "
    "guide does not say.", [], ["noise.white"])
mod("tuning_ref", "oscillator", "A440 tuning reference", "VCF (EXT)",
    "A fixed 440 Hz tone that replaces the external input when nothing is patched into a module's EXT jack, for tuning.",
    [], ["tuning_ref.out"], {"frequency_hz": {"min": 440, "max": 440}})
mod("output", "output", "Master output", "MASTER SECTION",
    "Sums the two modules with their own level and pan into a stereo pair, then master volume, to the 3.5 mm stereo jack on "
    "top and two 6.35 mm jacks on the rear.",
    ["output.in_xm1", "output.in_xm2"], ["output.left", "output.right", "output.stereo"])

par("output.master", "output", "MASTER", "continuous", "Master output level.", ref=59, panel_scale=S10)
par("alloc.assign", "alloc", "ASSIGN", "enum", "How the two modules share incoming notes.", ref=60, access=SW,
    values=[{"value": "unison", "label": "UNI"}, {"value": "split", "label": "SPLIT", "meaning": "XM1 below the split point, default C4"},
            {"value": "duo", "label": "DUO"}])
par("alloc.portamento_on", "alloc", "ON (portamento)", "boolean", "Turns portamento on for both modules.", ref=65, access=SW, values=ONOFF)
par("alloc.priority", "alloc", "Note priority", "enum", "Which note XM1 takes when two are held in unison; XM2 takes the other. Set in SynthTRIBE.",
    access=[{"type": "app", "note": "SynthTRIBE"}], values=[{"value": "highest"}, {"value": "lowest"}, {"value": "last"}])
par("alloc.split_point", "alloc", "Split point", "integer", "Split note, default C4 (MIDI 60). How it is changed is not described.",
    access=[{"type": "app", "note": "SynthTRIBE, by inference"}], range={"min": 0, "max": 127}, default=60, confidence="inferred")
par("alloc.poly_chain", "alloc", "Poly chain", "boolean", "Passes unhandled notes to the next 2-XM. Set in SynthTRIBE; the power LED turns red.",
    access=[{"type": "app", "note": "SynthTRIBE"}], values=ONOFF)
par("alloc.midi_channel", "alloc", "CHANNEL", "integer", "MIDI receive channel. In split, XM1 uses it and XM2 the next channel up (15 if 16 is set).", ref=104,
    range={"min": 1, "max": 16}, access=[{"type": "rear_panel", "control": "dip_switches_x4"}])
par("output.power", "output", "POWER SWITCH", "boolean", "Rear push-button power switch.", ref=107, access=[{"type": "rear_panel", "control": "button"}], values=ONOFF)

jack("jack.stereo_out", "STEREO OUT", 57, "top", "out", "audio", "output.stereo", "Stereo output of both modules, placed by their pan controls.", connector="3.5mm TRS")
jack("jack.midi_in", "MIDI IN", 58, "top", "in", "midi", None, "MIDI from an external source.", connector="DIN-5")
jack("jack.out_l", "AUDIO OUTPUT L", 102, "rear", "out", "audio", "output.left", "Duplicates the stereo output, left.", connector="6.35mm TS unbalanced")
jack("jack.out_r", "AUDIO OUTPUT R", 103, "rear", "out", "audio", "output.right", "Duplicates the stereo output, right.", connector="6.35mm TS unbalanced")
jack("jack.midi_thru", "MIDI THRU", 105, "rear", "out", "midi", None, "Retransmits MIDI IN.", connector="DIN-5")
jack("jack.usb", "USB", 106, "rear", "bidirectional", "midi", None, "USB MIDI, SynthTRIBE settings and firmware updates.", connector="USB-B")
jack("jack.power", "POWER SOCKET", 108, "rear", "in", "power", None, "12 V DC from the supplied 2000 mA adaptor.", connector="barrel",
     electrical={"voltage_v": 12, "current_ma": 2000})

# --------------------------------------------------------------------------
# the two expander modules
# --------------------------------------------------------------------------
ENV1_TIMES = {"attack_s": [0.003, 6], "decay_s": [0.014, 18], "release_s": [0.010, 15]}
MASTER_REFS = {1: {"level": 61, "pan": 62, "ext": 63, "porta": 64}, 2: {"level": 66, "pan": 67, "ext": 68, "porta": 69}}

for n in (1, 2):
    x = f"xm{n}"
    r = 0 if n == 1 else 28            # control numbering offset
    q = 70 if n == 1 else 86           # patchbay numbering start
    sec = f"SYNTHESIZER EXPANDER MODULE {n}"

    mod(f"{x}_pitch", "pitch_control", f"XM{n} pitch", sec,
        "Takes this module's MIDI pitch through portamento, and the two pitch patch points. VCO1 CV drives VCO1, and VCO2 as "
        "well unless VCO2 CV is patched.",
        [f"{x}_pitch.midi_in", f"{x}_pitch.cv1_in", f"{x}_pitch.cv2_in"], [f"{x}_pitch.to_vco1", f"{x}_pitch.to_vco2"])
    mod(f"{x}_gate", "gate_logic", f"XM{n} envelope gate", sec,
        "Gate that fires both envelopes: MIDI by default, ENV GATE jack when patched.", [f"{x}_gate.in"], [f"{x}_gate.out"])
    for v in (1, 2):
        ins = [f"{x}_vco{v}.pitch_in", f"{x}_vco{v}.fm_in", f"{x}_vco{v}.pwm_in"] + ([f"{x}_vco2.sync_in"] if v == 2 else [])
        outs = [f"{x}_vco{v}.saw", f"{x}_vco{v}.pulse", f"{x}_vco{v}.out"] + ([f"{x}_vco1.sync_out"] if v == 1 else [])
        mod(f"{x}_vco{v}", "oscillator", f"XM{n} VCO {v}", f"{sec} / VCO {v}",
            "Sawtooth and pulse, both always running, mixed into the filter by a bipolar crossfade. Coarse tuning over five "
            "octaves, fine tuning, pulse width 10 to 90%. One bipolar MODULATION knob: counter-clockwise frequency modulation, "
            "clockwise pulse width modulation, from the source on its switch." + (" Syncable to VCO1." if v == 2 else ""),
            ins, outs, {"waveforms": ["sawtooth", "pulse"], "simultaneous_outputs": True, "coarse_range_octaves": 5})
    mod(f"{x}_lfo", "lfo", f"XM{n} LFO", sec, "LFO, 0.1 to 55 Hz, one rate control, retriggerable from the LFO TRIG jack. Shape not stated.",
        [f"{x}_lfo.trig_in"], [f"{x}_lfo.out"], {"rate_hz": {"min": 0.1, "max": 55}})
    mod(f"{x}_env1", "envelope", f"XM{n} ENV 1 (VCA)", f"{sec} / ENV 1 (VCA)",
        "Attack, decay, sustain envelope for the VCA and VCO1's modulation. DECAY also sets release. Times are specified.",
        [f"{x}_env1.gate_in", f"{x}_env1.velocity_in"], [f"{x}_env1.out"], {"stages": ["attack", "decay (also release)", "sustain"], **ENV1_TIMES})
    mod(f"{x}_env2", "envelope", f"XM{n} ENV 2", f"{sec} / ENV 2",
        "Attack, decay, sustain envelope for the filter and VCO2's modulation. DECAY also sets release.",
        [f"{x}_env2.gate_in", f"{x}_env2.velocity_in"], [f"{x}_env2.out"], {"stages": ["attack", "decay (also release)", "sustain"], **ENV1_TIMES})
    mod(f"{x}_vcf", "filter", f"XM{n} VCF", f"{sec} / VCF",
        "12 dB/octave multimode filter. With RESPONSE at LP-HP, the NOTCH knob sweeps continuously from low-pass (fully "
        "counter-clockwise) through a notch (centre) to high-pass (fully clockwise); at BP it is band-pass. Inputs are the "
        "two VCO crossfades and the external/noise crossfade. Bipolar modulation depth from ENV 2, an external CV or velocity, "
        "or the LFO.",
        [f"{x}_vcf.in_vco1", f"{x}_vcf.in_vco2", f"{x}_vcf.in_ext", f"{x}_vcf.in_noise", f"{x}_vcf.mod_in", f"{x}_vcf.ext_mod_in"],
        [f"{x}_vcf.out"],
        {"slope_db_per_octave": 12, "modes": ["lowpass", "notch", "highpass", "bandpass"], "continuous_mode_sweep": "lowpass -> notch -> highpass"})
    mod(f"{x}_vca", "vca", f"XM{n} VCA", sec,
        "Output amplifier, driven by ENV 1, by ENV 1 scaled by velocity, or held open (ON/EXT), in which case a CV in VCA CV "
        "takes control.", [f"{x}_vca.in", f"{x}_vca.env_in", f"{x}_vca.cv_in"], [f"{x}_vca.out"])

    # --- parameters -------------------------------------------------------
    for v, (fine, coarse, modk, src, pw) in {1: (1, 2, 3, 4, 5), 2: (7, 8, 9, 10, 11)}.items():
        env = "env1" if v == 1 else "env2"
        par(f"{x}_vco{v}.fine", f"{x}_vco{v}", "FREQUENCY (fine)", "continuous", f"Fine tuning of VCO {v}.", ref=fine + r, panel_scale=BI, bipolar=True)
        par(f"{x}_vco{v}.coarse", f"{x}_vco{v}", "FREQUENCY (coarse)", "continuous", f"Coarse tuning of VCO {v} over five octaves.", ref=coarse + r,
            panel_scale=S10, physical={"min": 0, "max": 5, "unit": "octaves"})
        par(f"{x}_vco{v}.modulation", f"{x}_vco{v}", "MODULATION", "continuous",
            "Centre: none. Counter-clockwise: frequency modulation. Clockwise: pulse width modulation. Source on the switch below.",
            ref=modk + r, panel_scale={"min": -5, "max": 5, "unit": "FREQ to PW"}, bipolar=True)
        par(f"{x}_vco{v}.mod_source", f"{x}_vco{v}", "MODULATION SOURCE", "enum", f"Source for VCO {v} modulation.", ref=src + r, access=SW,
            values=[{"value": env, "label": f"ENV {v}"}, {"value": f"{env}_vel", "label": "E+V", "meaning": f"ENV {v} scaled by MIDI velocity"},
                    {"value": "lfo", "label": "LFO"}])
        par(f"{x}_vco{v}.pulse_width", f"{x}_vco{v}", "PULSE WIDTH", "continuous", "Pulse width; 50% is square.", ref=pw + r,
            panel_scale={"min": 10, "max": 90, "unit": "%"}, physical={"min": 10, "max": 90, "unit": "% duty"})
    par(f"{x}_vco2.sync", f"{x}_vco2", "SYNC", "boolean", "Hard-syncs VCO2 to VCO1.", ref=6 + r, access=SW, values=ONOFF)
    par(f"{x}_lfo.rate", f"{x}_lfo", "LFO", "continuous", "LFO rate.", ref=12 + r, panel_scale=S10, physical={"min": 0.1, "max": 55, "unit": "Hz", "taper": "unknown"})
    for e, (a, d, s) in {"env1": (13, 14, 15), "env2": (17, 18, 19)}.items():
        par(f"{x}_{e}.attack", f"{x}_{e}", "ATTACK", "continuous", "Attack time.", ref=a + r, panel_scale=S10,
            physical={"min": 0.003, "max": 6, "unit": "s", "taper": "unknown"})
        par(f"{x}_{e}.decay", f"{x}_{e}", "DECAY", "continuous", "Decay time, 14 ms to 18 s, and release time, 10 ms to 15 s.", ref=d + r, panel_scale=S10,
            physical={"min": 0.014, "max": 18, "unit": "s", "taper": "unknown", "note": "release follows the same knob over 0.010 to 15 s"})
        par(f"{x}_{e}.sustain", f"{x}_{e}", "SUSTAIN", "continuous", "Sustain level.", ref=s + r, panel_scale=S10)
    par(f"{x}_vca.mode", f"{x}_vca", "VCA", "enum", "What opens the VCA.", ref=16 + r, access=SW,
        values=[{"value": "env", "label": "ENV"}, {"value": "env_vel", "label": "E+V", "meaning": "ENV 1 scaled by velocity"},
                {"value": "on_ext", "label": "ON/EXT", "meaning": "held open, or controlled by the VCA CV jack when patched"}])
    par(f"{x}_vcf.frequency", f"{x}_vcf", "FREQUENCY", "continuous", "Filter cutoff.", ref=20 + r, panel_scale=S10)
    par(f"{x}_vcf.resonance", f"{x}_vcf", "RESONANCE", "continuous", "Emphasis around cutoff.", ref=21 + r, panel_scale=S10)
    par(f"{x}_vcf.modulation", f"{x}_vcf", "MODULATION", "continuous", "Bipolar cutoff modulation: centre none, counter-clockwise subtracts, clockwise adds.",
        ref=22 + r, panel_scale=BI, bipolar=True)
    par(f"{x}_vcf.notch", f"{x}_vcf", "NOTCH", "continuous",
        "With RESPONSE at LP-HP: centre is a narrow notch; counter-clockwise widens it to low-pass, clockwise narrows it to high-pass.",
        ref=23 + r, panel_scale={"min": -5, "max": 5, "unit": "LP to HP"}, bipolar=True)
    par(f"{x}_vcf.mod_source", f"{x}_vcf", "MODULATION SOURCE", "enum", "Source for filter modulation.", ref=24 + r, access=SW,
        values=[{"value": "env2", "label": "ENV 2"}, {"value": "ext", "label": "EXT", "meaning": "VCF CV jack if patched, otherwise ENV 2 scaled by velocity"},
                {"value": "lfo", "label": "LFO"}])
    par(f"{x}_vcf.response", f"{x}_vcf", "RESPONSE", "enum", "LP-HP (swept by NOTCH) or band-pass.", ref=25 + r, access=SW,
        values=[{"value": "lp_hp", "label": "LP-HP"}, {"value": "bp", "label": "BP"}])
    par(f"{x}_vcf.mix_vco1", f"{x}_vcf", "VCO 1", "continuous", "Crossfade into the filter: centre silent, counter-clockwise VCO1 saw, clockwise VCO1 pulse.",
        ref=26 + r, panel_scale={"min": -5, "max": 5, "unit": "SAW to PUL"}, bipolar=True)
    par(f"{x}_vcf.mix_vco2", f"{x}_vcf", "VCO 2", "continuous", "As VCO 1, for VCO2.", ref=27 + r, panel_scale={"min": -5, "max": 5, "unit": "SAW to PUL"}, bipolar=True)
    par(f"{x}_vcf.mix_ext", f"{x}_vcf", "EXT", "continuous",
        "Crossfade: centre silent, counter-clockwise the external input (or the A440 tuning tone), clockwise white noise.",
        ref=28 + r, panel_scale={"min": -5, "max": 5, "unit": "IN to NOISE"}, bipolar=True)
    mr = MASTER_REFS[n]
    par(f"{x}.level", f"{x}_vca", f"XM{n} LEVEL", "continuous", f"Level of XM{n} in the master mix.", ref=mr["level"], panel_scale=S10)
    par(f"{x}.pan", f"{x}_vca", f"XM{n} PAN", "continuous", f"Position of XM{n} in the stereo field.", ref=mr["pan"], panel_scale=BI, bipolar=True)
    par(f"{x}.ext_level", f"{x}_vcf", f"XM{n} EXT LVL", "continuous", f"Level of the external source on XM{n}'s EXT jack, or of the A440 tone.", ref=mr["ext"], panel_scale=S10)
    par(f"{x}_pitch.portamento", f"{x}_pitch", f"XM{n} PORTAMENTO", "continuous", f"Portamento amount for XM{n}.", ref=mr["porta"], panel_scale=S10)

    # --- patchbay ---------------------------------------------------------
    jack(f"jack.{x}_ext", f"EXT (XM{n})", q, PI := "patch_in", "in", "audio", f"{x}_vcf.in_ext", "External audio into the filter via the EXT crossfade.", combine="replace")
    jack(f"jack.{x}_vcf_cv", f"VCF CV (XM{n})", q + 1, PI, "in", "cv", f"{x}_vcf.ext_mod_in", "External CV for filter modulation, used when the source switch is at EXT.", combine="replace")
    jack(f"jack.{x}_vca_cv", f"VCA CV (XM{n})", q + 2, PI, "in", "cv", f"{x}_vca.cv_in", "External CV for the VCA, used when the VCA switch is at ON/EXT.")
    jack(f"jack.{x}_vco1_cv", f"VCO1 CV (XM{n})", q + 3, PI, "in", "cv", f"{x}_pitch.cv1_in", "External pitch CV for VCO1, and for VCO2 unless VCO2 CV is patched.", combine="replace", confidence="inferred")
    jack(f"jack.{x}_vco2_cv", f"VCO2 CV (XM{n})", q + 4, PI, "in", "cv", f"{x}_pitch.cv2_in", "External pitch CV for VCO2 only.", combine="replace", confidence="inferred")
    jack(f"jack.{x}_lfo_trig", f"LFO TRIG (XM{n})", q + 5, PI, "in", "gate", f"{x}_lfo.trig_in", "Retriggers the LFO from an external trigger, with external CV and gate. Not available under MIDI.")
    jack(f"jack.{x}_env_gate", f"ENV GATE (XM{n})", q + 6, PI, "in", "gate", f"{x}_gate.in", "External gate for both envelopes.", combine="replace")
    OUTS = [("cv", "CV", f"alloc.xm{n}_pitch", "cv", "MIDI-derived pitch CV.", 7),
            ("vca", "VCA", f"{x}_vca.out", "audio", "VCA output.", 8), ("vcf", "VCF", f"{x}_vcf.out", "audio", "Filter output.", 9),
            ("vco1", "VCO1", f"{x}_vco1.out", "audio", "VCO1 output.", 10), ("vco2", "VCO2", f"{x}_vco2.out", "audio", "VCO2 output.", 11),
            ("env1", "ENV1", f"{x}_env1.out", "cv", "ENV 1 output.", 12), ("env2", "ENV2", f"{x}_env2.out", "cv", "ENV 2 output.", 13),
            ("lfo", "LFO", f"{x}_lfo.out", "cv", "LFO output.", 14), ("gate", "GATE", f"alloc.xm{n}_gate", "gate", "MIDI-derived gate, paired with CV.", 15)]
    for key, lab, node, sig, fn, off in OUTS:
        extra = {}
        if key == "cv":
            extra = {"note": "Printed in the IN column on the panel; the guide lists it under OUTPUTS."}
        if key in ("vco1", "vco2"):
            extra = {"note": "Which waveform, or mix, appears here is not stated."}
        jack(f"jack.{x}_{key}_out", f"{lab} {n if key in ('cv', 'gate') else ''} (XM{n})".replace("  ", " "), q + off, "patch_out", "out", sig, node, fn, **extra)

    # --- connections ------------------------------------------------------
    b = f"{x}_"
    con(f"{b}c01", f"alloc.xm{n}_pitch", f"{x}_pitch.midi_in", "cv", "fixed", amount=f"{x}_pitch.portamento")
    con(f"{b}c02", f"{x}_pitch.to_vco1", f"{x}_vco1.pitch_in", "cv", "fixed", amount=f"{x}_vco1.coarse")
    con(f"{b}c03", f"{x}_pitch.to_vco2", f"{x}_vco2.pitch_in", "cv", "fixed", amount=f"{x}_vco2.coarse")
    con(f"{b}c04", f"alloc.xm{n}_gate", f"{x}_gate.in", "gate", "normalled", broken_by=f"jack.{x}_env_gate")
    con(f"{b}c05", f"{x}_gate.out", f"{x}_env1.gate_in", "gate", "fixed")
    con(f"{b}c06", f"{x}_gate.out", f"{x}_env2.gate_in", "gate", "fixed")
    con(f"{b}c08", "alloc.velocity", f"{x}_env1.velocity_in", "cv", "fixed",
        note="Velocity scales ENV 1 only where a switch is in its E+V position (VCO1 modulation, VCA); elsewhere ENV 1 is used unscaled.")
    con(f"{b}c09", "alloc.velocity", f"{x}_env2.velocity_in", "cv", "fixed",
        note="Velocity scales ENV 2 only in the E+V or EXT positions of the VCO2 and filter modulation switches.")
    con(f"{b}c07", f"{x}_vco1.sync_out", f"{x}_vco2.sync_in", "sync", "switched", enabled_when={"param": f"{x}_vco2.sync", "equals": True})
    k = 10
    for v in (1, 2):
        env = f"{x}_env{v}"
        for src, node in [(f"env{v}", f"{env}.out"), (f"env{v}_vel", f"{env}.out"), ("lfo", f"{x}_lfo.out")]:
            note = {"note": "Envelope scaled by MIDI velocity."} if src.endswith("_vel") else {}
            con(f"{b}c{k}", node, f"{x}_vco{v}.fm_in", "cv", "switched", enabled_when={"param": f"{x}_vco{v}.mod_source", "equals": src},
                amount_expr=f"max(0, -{x}_vco{v}.modulation)", **note); k += 1
            con(f"{b}c{k}", node, f"{x}_vco{v}.pwm_in", "cv", "switched", enabled_when={"param": f"{x}_vco{v}.mod_source", "equals": src},
                amount_expr=f"max(0, {x}_vco{v}.modulation)"); k += 1
        con(f"{b}c{k}", f"{x}_vco{v}.saw", f"{x}_vcf.in_vco{v}", "audio", "fixed", amount_expr=f"max(0, -{x}_vcf.mix_vco{v})"); k += 1
        con(f"{b}c{k}", f"{x}_vco{v}.pulse", f"{x}_vcf.in_vco{v}", "audio", "fixed", amount_expr=f"max(0, {x}_vcf.mix_vco{v})"); k += 1
    con(f"{b}c30", "tuning_ref.out", f"{x}_vcf.in_ext", "audio", "normalled", broken_by=f"jack.{x}_ext",
        amount_expr=f"{x}.ext_level * max(0, -{x}_vcf.mix_ext)", note="With nothing patched into EXT, the A440 tuning tone takes its place.")
    con(f"{b}c31", "noise.white", f"{x}_vcf.in_noise", "audio", "fixed", amount_expr=f"max(0, {x}_vcf.mix_ext)")
    con(f"{b}c32", f"{x}_env2.out", f"{x}_vcf.mod_in", "cv", "switched", enabled_when={"param": f"{x}_vcf.mod_source", "equals": "env2"}, amount=f"{x}_vcf.modulation")
    con(f"{b}c33", f"{x}_lfo.out", f"{x}_vcf.mod_in", "cv", "switched", enabled_when={"param": f"{x}_vcf.mod_source", "equals": "lfo"}, amount=f"{x}_vcf.modulation")
    con(f"{b}c34", f"{x}_env2.out", f"{x}_vcf.ext_mod_in", "cv", "normalled", broken_by=f"jack.{x}_vcf_cv",
        note="Velocity-scaled ENV 2, reaching the cutoff only with the source switch at EXT; the VCF CV jack replaces it.", confidence="inferred")
    con(f"{b}c35", f"{x}_vcf.out", f"{x}_vca.in", "audio", "fixed")
    con(f"{b}c36", f"{x}_env1.out", f"{x}_vca.env_in", "cv", "switched",
        enabled_when={"any": [{"param": f"{x}_vca.mode", "equals": "env"}, {"param": f"{x}_vca.mode", "equals": "env_vel"}]})
    con(f"{b}c37", f"{x}_vca.out", f"output.in_xm{n}", "audio", "fixed", amount=f"{x}.level", note="Panned by the module's PAN control.")

D["modules"] = M
D["parameters"] = P
D["ports"] = J
D["connections"] = C

D["indicators"] = [
    {"id": "output.power_led", "module": "output", "label": "Power", "kind": "led", "led_colour": "multi", "manual_ref": None,
     "function": "Power indicator. Turns red when poly chain is enabled; its normal colour is not stated."},
]
D["led_legend"] = {
    "rule": "One LED. Red means poly chain is enabled.",
    "colours": [{"colour": "red", "meaning": "poly chain enabled"}],
    "confidence": "stated",
    "note": "From the poly chaining paragraph. The normal colour is not given.",
}

D["behaviours"] = [
    {"id": "b01", "name": "Two independent voices", "applies_to": ["alloc", "output"],
     "rule": "XM1 and XM2 are complete, separately-controlled voices, not two instances of one patch. The ASSIGN switch sets "
             "how notes reach them: UNISON (both on one note), SPLIT (XM1 low, XM2 high, split at C4 by default, XM2 on the next "
             "MIDI channel) or DUO (one note each, same or separate channels). Each module has its own level and pan."},
    {"id": "b02", "name": "Bipolar VCO modulation", "applies_to": ["xm1_vco1", "xm1_vco2", "xm2_vco1", "xm2_vco2"],
     "rule": "Each VCO's MODULATION knob does nothing at 12 o'clock, frequency modulation as it turns counter-clockwise and "
             "pulse width modulation as it turns clockwise, from the source on its switch. VCO1's switch offers ENV 1, ENV 1 x "
             "velocity or the LFO; VCO2's offers ENV 2, ENV 2 x velocity or the LFO. Recorded with amount_expr on the connections."},
    {"id": "b03", "name": "Bipolar mix crossfades", "applies_to": ["xm1_vcf", "xm2_vcf"],
     "rule": "There are no level knobs in the usual sense. VCO 1 and VCO 2 each crossfade saw (counter-clockwise) against pulse "
             "(clockwise) with silence at 12 o'clock; EXT crossfades the external input against white noise the same way."},
    {"id": "b04", "name": "Notch-sweeping filter", "applies_to": ["xm1_vcf", "xm2_vcf"],
     "rule": "A 12 dB/octave state-variable filter. At LP-HP, NOTCH morphs the response: fully counter-clockwise low-pass, "
             "centre a narrow notch, fully clockwise high-pass; between them the notch widens or narrows. BP switches to band-pass. "
             "This continuous mode sweep is the defining sound of the SEM."},
    {"id": "b05", "name": "Velocity through E+V", "applies_to": ["xm1_vca", "xm2_vca", "xm1_vcf", "xm2_vcf"],
     "rule": "The middle position of the VCO modulation, VCA and filter modulation switches scales the envelope by MIDI "
             "velocity. On the filter this position is labelled EXT: a CV in the VCF CV jack replaces the velocity-scaled envelope."},
    {"id": "b06", "name": "VCA ON/EXT", "applies_to": ["xm1_vca", "xm2_vca"],
     "rule": "At ON/EXT the VCA is held fully open, making the module a drone, unless a CV is patched into VCA CV, which then "
             "controls it."},
    {"id": "b07", "name": "A440 tuning tone", "applies_to": ["tuning_ref", "xm1_vcf", "xm2_vcf"],
     "rule": "With nothing in a module's EXT jack, its external input carries a 440 Hz reference tone, heard through the EXT "
             "crossfade and the module's EXT LVL. Useful for tuning, and a surprise if the EXT knob is not centred."},
    {"id": "b08", "name": "Pitch normalling", "applies_to": ["xm1_pitch", "xm2_pitch"],
     "rule": "MIDI pitch drives both VCOs. VCO1 CV replaces it for VCO1 and also for VCO2 unless VCO2 CV is patched, so one "
             "cable plays both oscillators and a second separates them."},
    {"id": "b09", "name": "ADS envelopes", "applies_to": ["xm1_env1", "xm1_env2", "xm2_env1", "xm2_env2"],
     "rule": "Attack 3 ms to 6 s. DECAY sets decay (14 ms to 18 s) and release (10 ms to 15 s) together. Sustain level."},
    {"id": "b10", "name": "Poly chain", "applies_to": ["alloc"],
     "rule": "Units with the same MIDI channel and poly chain on in SynthTRIBE pass unhandled notes down the chain; the first "
             "unit plays the first note and so on. With poly chain on in the last unit, notes beyond the chain are dropped; "
             "with it off, the last unit steals its last note. The guide adds that a 2-XM in paraphonic mode handles two notes, "
             "without describing a paraphonic mode."},
]

D["midi"] = {
    "receives": ["note_on", "note_off", "velocity (through the E+V switch positions)"],
    "transmits": ["MIDI THRU pass-through", "USB MIDI"],
    "channel": {"range": [1, 16], "set_by": "rear DIP switches or SynthTRIBE; XM2 uses channel + 1 in split"},
    "cc_map": None, "nrpn": None, "sysex": None,
    "usb": {"class_compliant": True, "os": "Windows 7 or higher, Mac OS 10.10 or higher"},
    "app": "SynthTRIBE: note priority, poly chain, firmware",
}

D["specifications"] = {
    "voices": "2 (duophonic)", "oscillators": 4, "lfos": 2, "vcf": "2 x 12 dB/octave", "envelopes": "4 ADS",
    "envelope_times_s": ENV1_TIMES, "lfo_hz": {"min": 0.1, "max": 55},
    "patchbay": "32 x 3.5 mm TR", "outputs": {"top": "3.5 mm TRS stereo", "rear": "2 x 6.35 mm TR"},
    "power": {"adaptor": "12 V DC, 2000 mA"}, "dimensions_mm": {"h": 91.4, "w": 424.4, "d": 135.6},
    "eurorack_hp": 80, "weight_kg": 1.8, "operating_temperature_c": {"min": 5, "max": 45},
}

D["omitted_from_source"] = ["safety and legal text in several languages", "warranty and compliance declarations", "hook-up diagrams",
                            "non-English duplicates", "Eurorack installation instructions", "the MIDI channel DIP switch table"]
D["not_in_source"] = [
    "the LFO waveform; there is no shape control and none is stated",
    "which waveform or mix appears at each VCO OUT jack",
    "whether the white noise source is shared between the two modules",
    "how the split point is changed from its C4 default",
    "what 'paraphonic mode' refers to; no such setting is described",
    "filter cutoff range and resonance behaviour, including self-oscillation",
    "pitch CV scaling; 1 V/octave is likely but not stated",
    "the normal colour of the power LED",
    "any MIDI implementation beyond notes and velocity",
]
D["source_inconsistencies"] = [
    "CV 1 and CV 2 are printed in the IN column of each patchbay but the guide lists them as outputs (77, 93).",
    "The VCF modulation source middle position is EXT on the panel and 'External/ENV2 controlled by MIDI velocity' in the guide.",
    "Item 24 refers the VCF modulation knob to 'switches 22 & 52'; the switches are 24 and 52.",
    "The specifications list the filters as '2 LPF 12 dB/octave'; the controls describe low-pass, notch, high-pass and band-pass.",
    "Items 63 and 68 say 'Where no external source is present a tuning tone of A 440 Hz will be heard' and item 28 says it 'will be routed'; consistent in meaning, but the level control and the crossfade both claim it.",
    "Item 73 contains the typo 'no jack ios inserted'.",
]
D["modelling_gaps"] = [
    {"topic": "Filter", "detail": "The notch sweep is described qualitatively. No cutoff range, resonance law, or statement of how the notch width maps to the knob."},
    {"topic": "Tapers", "detail": "Envelope and LFO end points are given; the mapping from knob position to time or rate is not."},
    {"topic": "Bipolar controls", "detail": "Modelled with amount_expr as max(0, -x) and max(0, x). The actual crossfade law (linear, equal-power, overlap at centre) is not stated."},
    {"topic": "Original instrument", "detail": "No Oberheim SEM or Two Voice documentation was supplied; it would settle filter behaviour and the VCO output waveforms."},
]

with open("/mnt/user-data/outputs/behringer-2-xm.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
