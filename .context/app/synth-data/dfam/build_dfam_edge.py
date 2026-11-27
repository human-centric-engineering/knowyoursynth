#!/usr/bin/env python3
"""Assemble the Moog DFAM and Behringer EDGE device files (schema 0.13.0).

Both are semi-modular analogue percussion synthesizers with the same voice: two VCOs
(triangle/square) with hard sync and 1->2 linear FM, noise (or external audio) into a
three-channel mixer, a 4-pole ladder filter switchable LP/HP, three decay envelopes (VCO
pitch, VCF, VCA) with voltage-controlled decay and per-step velocity, a VCA with fast or
slow attack, an analogue 8-step sequencer with PITCH and VELOCITY knobs per step and a
voltage-controlled clock, and a 24-point patchbay (15 inputs, 9 outputs) with the same
jacks. The EDGE (Behringer, 2021) recreates the DFAM (Moog, 2017) and adds pink noise,
MIDI/USB clock with a SCALE control, MIDI DIN in and out/thru, USB MIDI, a 16-voice
"poly chain", a power switch and a 3.5 mm phones output in place of the rear 1/4 inch jack.

Sources: Moog DFAM manual (44 pages, 2017), with ten preset patch sheets whose cables are
read from the drawings; Behringer EDGE Quick Start Guide V1.0 (35 pages, 2021).
Knob positions given as clock positions map 7:00 = 0 to 5:00 = 10; bipolar AMOUNT knobs
map 7:00 = -5, 12:00 = 0, 5:00 = +5 (the EDGE specifications use the same 0-10 and -5..+5).
"""
import json

S10 = {"min": 0, "max": 10, "note": "7:00 = 0, 12:00 = 5, 5:00 = 10"}
BI = {"min": -5, "max": 5, "note": "bipolar; centre = no effect"}


def build(edge):
    D = {"schema_version": "0.13.0"}
    M, P, J, C = [], [], [], []
    N = (lambda d, e: e if edge else d)          # name chooser: DFAM label, EDGE label
    osc = N("VCO", "OSC")

    def mod(id, type, name, section, desc, inputs, outputs, props=None):
        m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
        if props:
            m["properties"] = props
        m.update({"inputs": inputs, "outputs": outputs})
        M.append(m)

    def par(id, module, label, kind, fn, control="knob", **kw):
        p = {"id": id, "module": module, "label": label, "kind": kind}
        for k in ("panel_scale", "physical", "range", "values", "default", "memory", "manual_ref"):
            if k in kw:
                p[k] = kw.pop(k)
        p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
        p["function"] = fn
        for k in ("confidence", "note"):
            if k in kw:
                p[k] = kw.pop(k)
        assert not kw, kw
        P.append(p)

    def knob(id, module, label, fn, scale=S10, **kw):
        par(id, module, label, "continuous", fn, panel_scale=scale, **kw)

    def sw(id, module, label, fn, vals, control="toggle_switch", **kw):
        par(id, module, label, "enum", fn, control=control, values=[v if isinstance(v, dict) else {"value": v} for v in vals], **kw)

    def btn(id, module, label, fn, **kw):
        par(id, module, label, "boolean", fn, control="push_button", **kw)

    def jack(id, label, d, sig, node, fn, **kw):
        j = {"id": id, "label": label, "location": "patch_in" if d == "in" else "patch_out", "direction": d, "signal": sig, "connector": "3.5 mm jack", "node": node, "function": fn}
        j.update(kw)
        J.append(j)

    def con(frm, to, sig="audio", when=None, **kw):
        c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": sig, "kind": "switched" if when else "fixed"}
        if when:
            c["enabled_when"] = when
        c.update(kw)
        C.append(c)

    def norm(frm, to, jid, sig="cv", **kw):
        con(frm, to, sig, kind="normalled", broken_by=jid, **kw)

    def eq(p, v):
        return {"param": p, "equals": v}

    # ------------------------------------------------------------------ device
    if not edge:
        D["device"] = {
            "id": "moog-dfam", "manufacturer": "Moog Music", "model": "DFAM (Drummer From Another Mother)",
            "category": "semi-modular analogue percussion synthesizer with 8-step sequencer, desktop or 60HP Eurorack",
            "based_on": "Original Moog design (2017), part of the Mother-32 family; recreated by the Behringer EDGE (modelled separately).",
            "sources": [{"id": "manual", "title": "Moog DFAM Owner's Manual (2017)", "kind": "user_manual", "file": "Moog_DFAM_Manual.pdf", "pages": 44,
                         "note": "Signal flow, guided exploration with clock positions, every control with typical settings, patchbay levels and normals, sync with DFAM/Mother-32, Eurorack install, "
                                 "ten preset patch sheets (cables legible, knobs drawn) and specifications."},
                        {"id": "sos", "title": "Sound On Sound, Moog DFAM review", "kind": "other", "url": "https://www.soundonsound.com/reviews/moog-dfam",
                         "note": "High-pass mode cuts lows but is not a smooth sweep over the whole range."},
                        {"id": "bh", "title": "B&H Photo, Moog DFAM specifications", "kind": "other", "url": "https://www.bhphotovideo.com/c/product/1379246-REG/moog_mod_dfam_01_drummer_from_another_mother.html",
                         "note": "Filter described as a 4-pole transistor ladder; VCOs ±5 octaves."}],
        }
    else:
        D["device"] = {
            "id": "behringer-edge", "manufacturer": "Behringer (Music Tribe)", "model": "EDGE",
            "category": "semi-modular analogue percussion synthesizer with 8-step sequencer, MIDI/USB and 16-voice poly chain, desktop or Eurorack",
            "based_on": "Recreation of the Moog DFAM (2017, modelled separately), which the guide does not name; same voice, sequencer and patchbay, with pink noise, MIDI/USB clock and poly chain added. Guide V1.0, November 2021.",
            "sources": [{"id": "guide", "title": "Behringer EDGE Quick Start Guide V1.0 (2021)", "kind": "quick_start_guide", "file": "Behringer_Edge_Manual.pdf", "pages": 35,
                         "note": "Multilingual; English used. Hook-up diagrams (including poly chain), numbered controls 1-63, getting started, three patch ideas, default patch drawing, SynthTribe note and specifications."},
                        {"id": "behringer_product", "title": "Behringer, EDGE product page", "kind": "spec_sheet", "url": "https://www.behringer.com/en/products/0718-ABM",
                         "note": "'MIDI plays the sounds, and MIDI, USB or an external clock can drive the sequencer'; 'dual 8-step sequencer' meaning the pitch and velocity rows."},
                        {"id": "modwiggler", "title": "ModWiggler, 'Behringer EDGE' thread (owner reports)", "kind": "other", "url": "https://www.modwiggler.com/forum/viewtopic.php?t=254597&start=250",
                         "note": "MIDI notes play the voice; VELOCITY OUT follows MIDI note velocity as well as the velocity row; holding ADVANCE lets each MIDI note step the sequencer, with PITCH OUT following the pitch row; one owner hears less low-end roundness than the DFAM."},
                        {"id": "synthtribe", "title": "Sweetwater, 'Getting Started with Behringer SYNTHTRIBE'", "kind": "other", "url": "https://www.sweetwater.com/sweetcare/articles/getting-started-with-behringer-synthtribe/",
                         "note": "Generic SynthTribe settings across Behringer synths: MIDI channel (overrides DIP switches), pitch bend, key priority, MIDI transpose, multi trigger; Poly Chain tab with device count, voice mode and Enable."},
                        {"id": "bh_edge", "title": "B&H Photo, Behringer EDGE listing", "kind": "other", "url": "https://www.bhphotovideo.com/c/product/1816411-REG/behringer_edge_analog_percussion_synthesizer_with.html",
                         "note": "Describes a '15x10 I/O matrix' and '44 real-time controls'."}],
        }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 1,
        "polyphony_mode": "monophonic percussion voice" + ("; up to 16 voices by chaining units over MIDI THRU (poly chain)" if edge else ""),
        "poly_chain_max_units": 16 if edge else None, "patch_memory": False,
        "patch_memory_note": "No memory; the sequencer is analogue (knob per step)." + (" MIDI channel set by rear DIP switches or SynthTribe." if edge else ""),
        "semi_modular": True,
        "panel_counts": ({"knobs": 33, "switches": 6, "buttons": 3, "patch_points": 24, "patch_inputs": 15, "patch_outputs": 9} if not edge else
                         {"knobs": 33, "scale_selector": 1, "switches": 9, "buttons": 4, "patch_points": 24, "patch_inputs": 15, "patch_outputs": 9, "dip_switches": 4}),
        "summary": ("Two VCOs (10-octave range, triangle or square) with hard sync and VCO 1 -> VCO 2 linear FM; a pitch envelope shared by both VCOs at separate bipolar depths. "
                    "VCO 1, VCO 2 and noise (or EXT AUDIO) are mixed into a 4-pole ladder filter, low- or high-pass, 20 Hz to 20 kHz, moved by its own envelope and by noise (or "
                    "the VCF MOD input). The VCA envelope (1 ms or 100 ms attack) shapes the output. Every envelope is a decay with voltage-controlled time, its peak set by the "
                    "step's VELOCITY. The 8-step sequencer has PITCH (±5 V) and VELOCITY (0-5 V) per step and a voltage-controlled clock VCO (10 to 10,000 BPM)."
                    + (" The EDGE adds pink noise, MIDI or USB clock with a SCALE division, MIDI in and out/thru, USB MIDI and poly chaining." if edge else "")),
    }

    # ------------------------------------------------------------------ modules
    mod("clock", "gate_logic", "Sequencer clock VCO", "SEQUENCER [TEMPO]", "Clock oscillator, 0.7 Hz to 700 Hz (about 10 to 10,000 BPM at 16ths); 1 V/oct TEMPO input reaches audio rate."
        + (" CLOCK switch selects INT/EXT, MIDI or USB; MIDI/USB clock is divided by SCALE (10-300 BPM)." if edge else ""),
        ["clock.tempo_cv", "clock.run", "clock.midi_in"] if edge else ["clock.tempo_cv", "clock.run"], ["clock.out"], {"rate_hz": [0.7, 700], "bpm": [10, 10000]})
    mod("seq", "sequencer", "8-step sequencer", "SEQUENCER", "Analogue 8-step sequencer: PITCH (±5 V, about 10 octaves) and VELOCITY (0-5 V) per step, step LEDs, RUN/STOP, ADVANCE, TRIGGER.",
        ["seq.clock"], ["seq.pitch", "seq.velocity", "seq.trig"], {"steps": 8, "pitch_v": [-5, 5], "velocity_v": [0, 5]})
    mod("trig", "gate_logic", "Trigger bus", "patchbay TRIGGER", "Sequencer triggers (normalled to the TRIGGER input) fire all three envelopes and the TRIGGER output (about 1 ms, +5 V).", ["trig.in"], ["trig.out"])
    mod("vel", "mult", "Velocity bus", "patchbay VELOCITY", "Step velocity (normalled to the VELOCITY input) sets the peak, and slightly lengthens the decay, of all three envelopes.", ["vel.in"], ["vel.to_vco", "vel.to_vcf", "vel.to_vca"])
    for e, nm, sec, a in (("vco_eg", f"{osc} EG", f"{osc} DECAY", "1 ms"), ("vcf_eg", "VCF EG", "VCF DECAY", "1 ms"), ("vca_eg", "VCA EG", "VCA DECAY", "1 ms or 100 ms (VCA EG switch)")):
        mod(e, "envelope", nm, sec, f"Attack {a}; decay set by its knob plus a ±5 V CV; peak and decay scaled by velocity. Output 0 to +8 V.", [f"{e}.trig", f"{e}.velocity", f"{e}.decay_cv"], [f"{e}.out"],
            {"stages": ["attack", "decay"], "output_v": [0, 8]} | ({"decay_s": [0.01, 10]} if e == "vcf_eg" else {}))
    for v in (1, 2):
        mod(f"vco{v}", "oscillator", f"{osc} {v}", f"{osc} {v}", f"Analogue VCO, 10-octave range, triangle or square." + (" Hard sync to VCO 1 and linear FM from VCO 1." if v == 2 else ""),
            [f"vco{v}.pitch_cv"] + (["vco2.sync_in", "vco2.fm_in", "vco2.fm_amt_cv"] if v == 2 else []), [f"vco{v}.out"], {"waveforms": ["triangle", "square"], "range_octaves": 10})
    mod("noise", "noise", "Noise generator", "MIXER [NOISE / EXT]", "White noise" + (", or pink with the NOISE COLOR switch" if edge else "") + "; mixer source (unless EXT AUDIO is patched) and the default VCF modulation source.",
        [], ["noise.out"], {"colours": ["white", "pink"] if edge else ["white"]})
    mod("mixer", "mixer", "Mixer", "MIXER", "VCO 1, noise/external and VCO 2 levels into the filter; high levels clip pleasantly. The noise/ext channel has a CV-controlled level (NOISE LEVEL input).",
        ["mixer.vco1", "mixer.noise", "mixer.vco2", "mixer.noise_cv"], ["mixer.out"])
    mod("vcfmod", "attenuator", "VCF modulation", "VCF [NOISE / VCF MOD]", "Scales noise (or the VCF MOD input, which replaces it) into the cutoff; the only direct CV path to the cutoff.", ["vcfmod.in"], ["vcfmod.out"])
    mod("vcf", "filter", "VCF (ladder)", "VCF", "4-pole (-24 dB/octave) ladder filter, low-pass or high-pass, 20 Hz to 20 kHz; self-oscillates above about 3:00 resonance in LP (in HP only near 1 kHz).",
        ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], {"modes": ["lp", "hp"], "slope_db_per_octave": 24, "cutoff_hz": [20, 20000], "self_oscillates": "LP above 3:00 resonance; HP only around 1 kHz"})
    mod("vca", "vca", "VCA", "VCA", "Output VCA driven by the VCA EG, summed with the VCA CV input.", ["vca.in", "vca.cv"], ["vca.out"])
    mod("out", "output", "Output", "VOLUME / rear" if not edge else "VOLUME / PHONES",
        "VOLUME to the VCA patch output (Eurorack level) and " + ("the rear 1/4 inch output (TS line or TRS headphones)." if not edge else "a 3.5 mm stereo phones jack."),
        ["out.in"], ["out.modular", "out.main"] if not edge else ["out.modular", "out.phones"])
    if edge:
        mod("midi", "midi_to_cv", "MIDI / USB", "rear [MIDI IN, OUT/THRU, USB, MIDI CHANNEL]", "MIDI DIN in, DIN out or thru, and class-compliant USB MIDI: clock (with SCALE), note input, poly chaining.",
            ["midi.in", "midi.usb"], ["midi.clock", "midi.thru", "midi.note", "midi.gate", "midi.velocity"])
    D["modules"] = M

    # ------------------------------------------------------------------ parameters
    for v in (1, 2):
        knob(f"vco{v}.freq", f"vco{v}", f"{osc} {v} FREQUENCY", "Starting pitch over 10 octaves; centre matches the PITCH knobs' centre.")
        sw(f"vco{v}.wave", f"vco{v}", f"{osc} {v} WAVE" if not edge else f"OSC {v} SHAPE", "Waveform.", ["triangle", "square"])
        knob(f"vco{v}.eg_amt", f"vco{v}", f"{osc} {v} EG AMOUNT" if not edge else f"OSC {v} ENVELOPE", "Bipolar pitch envelope depth: right for spikes, left for dips.", scale=BI)
        knob(f"mix.vco{v}", "mixer", f"{osc} {v} LEVEL", f"{osc} {v} level into the filter.")
    knob("vco_eg.decay", "vco_eg", f"{osc} DECAY" if not edge else "EG (VCO 1&2) DECAY", "Decay time of the pitch envelope (no audible effect with both EG amounts centred).")
    sw("seq.pitch_mod", "seq", "SEQ PITCH MOD", "Which VCOs the PITCH knobs move; OFF leaves them for the PITCH output.",
       [{"value": "vco12", "label": f"{osc} 1&2"}, {"value": "off"}, {"value": "vco2", "label": f"{osc} 2"}])
    sw("vco2.sync", "vco2", "HARD SYNC", "Locks VCO 2's phase to VCO 1; below VCO 1's pitch VCO 2 may fall silent.", ["off", "on"])
    knob("vco2.fm_amt", "vco2", "1→2 FM AMOUNT", "Depth of linear FM of VCO 2 by VCO 1.")
    knob("mix.noise", "mixer", "NOISE / EXT LEVEL", "Level of noise, or of EXT AUDIO when patched.")
    if edge:
        sw("noise.color", "noise", "NOISE COLOR", "White (bright) or pink (darker) noise.", ["white", "pink"])
    sw("vcf.mode", "vcf", "VCF" if not edge else "VCF SELECT", "Low-pass or high-pass.", [{"value": "lp", "label": "LP"}, {"value": "hp", "label": "HP"}])
    knob("vcf.cutoff", "vcf", "CUTOFF", "Cutoff, 20 Hz to 20 kHz.", physical={"min": 20, "max": 20000, "unit": "Hz"})
    knob("vcf.resonance", "vcf", "RESONANCE", "Resonant peak; self-oscillates above about 3:00 in LP.")
    knob("vcf_eg.decay", "vcf_eg", "VCF DECAY" if not edge else "DECAY (FILTER)", "Filter envelope decay, 10 ms to 10 s.", physical={"min": 0.01, "max": 10, "unit": "s"})
    knob("vcf_eg.amt", "vcf", "VCF EG AMOUNT" if not edge else "ENVELOPE (FILTER)", "Bipolar filter envelope depth (raises or lowers cutoff in either mode).", scale=BI)
    knob("vcfmod.amt", "vcfmod", "NOISE / VCF MOD", "Depth of noise (or the VCF MOD input) on cutoff.")
    sw("vca_eg.attack", "vca_eg", "VCA EG" if not edge else "VCA MODE", "Attack of the VCA envelope.", [{"value": "fast", "meaning": "1 ms"}, {"value": "slow", "meaning": "100 ms"}])
    knob("vca_eg.decay", "vca_eg", "VCA DECAY" if not edge else "DECAY (VCA)", "VCA envelope decay.")
    knob("out.volume", "out", "VOLUME", "Output level.")
    knob("clock.tempo", "clock", "TEMPO", "Clock rate, 0.7 to 700 Hz (about 10 to 10,000 BPM); ignored when ADV/CLOCK is used." + (" Internal only; MIDI/USB clock gives 10-300 BPM." if edge else ""),
         physical={"min": 0.7, "max": 700, "unit": "Hz"})
    for s in range(1, 9):
        knob(f"seq.pitch{s}", "seq", f"PITCH {s}", "Step pitch offset, ±5 V (about 10 octaves); centre none.", scale=BI)
        knob(f"seq.vel{s}", "seq", f"VELOCITY {s}" if not edge else f"VEL {s}", "Step velocity 0-5 V: envelope peaks (louder, punchier) and slightly longer decays; zero is silent.")
    btn("seq.run", "seq", "RUN / STOP" if not edge else "PLAY/STOP", "Starts or stops the sequencer from the current step.")
    btn("seq.advance", "seq", "ADVANCE", "With the sequencer stopped, steps forward without triggering.")
    btn("seq.trigger", "seq", "TRIGGER", "With the sequencer stopped, plays the current step without advancing.")
    if edge:
        sw("clock.source", "clock", "CLOCK", "Clock source: internal TEMPO (or ADV/CLOCK input), MIDI or USB.", [{"value": "int_ext", "label": "INT/EXT"}, "midi", "usb"])
        par("clock.scale", "clock", "SCALE", "enum", "Sequencer step length against incoming MIDI or USB clock.", control="rotary_switch",
            values=[{"value": v} for v in ["1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T", "1/16T", "1/32T"]])
        sw("midi.out_thru", "midi", "OUT/THRU", "MIDI DIN acts as output or thru.", ["out", "thru"])
        par("midi.channel", "midi", "MIDI CHANNEL SELECT", "integer", "MIDI channel 1-16 on rear DIP switches; also settable in SynthTribe.", range={"min": 1, "max": 16}, memory="global",
            access=[{"type": "rear_panel", "control": "dip_switches_x4"}, {"type": "app", "note": "SynthTribe"}])
        par("midi.poly_mode", "midi", "Poly Chain", "boolean", "Chains units for up to 16 voices via MIDI THRU; the power LED turns red when active. Set the number of units and voice mode, then Enable, in SynthTribe's Poly Chain tab.", memory="global",
            access=[{"type": "app", "note": "SynthTribe, Poly Chain tab"}], confidence="inferred", note="Procedure from Behringer's generic SynthTribe guidance (Sweetwater; 2-XM and PRO-1 guides); not confirmed for the EDGE specifically.")
        par("midi.key_priority", "midi", "Key Priority", "enum", "Which held MIDI note plays.", memory="global", values=[{"value": "low"}, {"value": "high"}, {"value": "last"}],
            access=[{"type": "app", "note": "SynthTribe, General tab"}], confidence="inferred", note="A standard SynthTribe General setting (Sweetwater); not confirmed for the EDGE.")
        btn("out.power", "out", "ON/OFF", "Power switch.", access=[{"type": "rear_panel", "control": "push_button"}])
    D["parameters"] = P

    # ------------------------------------------------------------------ ports
    jk = [("jack.trigger_in", "TRIGGER", "in", "gate", "trig.in", "Fires all three envelopes at the current step's velocity without advancing; normalled to the sequencer clock. 0-5 V pulse or gate (10 V tolerant)."),
          ("jack.vca_cv", "VCA CV", "in", "cv", "vca.cv", "Volume CV, 0 to +8 V, summed with the VCA EG (may clip)."),
          ("jack.vca_out", "VCA", "out", "audio", "out.modular", "Main audio output after VOLUME, Eurorack level (±5 V)" + ("; max +14.5 dBu, unbalanced." if edge else ".")),
          ("jack.velocity_in", "VELOCITY", "in", "cv", "vel.in", "Envelope peak level, 0-5 V; normalled to the step VELOCITY knobs."),
          ("jack.vca_decay", "VCA DECAY", "in", "cv", "vca_eg.decay_cv", "VCA decay CV, ±5 V, summed with the knob (centre it for full range)."),
          ("jack.vca_eg_out", "VCA EG", "out", "cv", "vca_eg.out", "VCA envelope, 0 to +8 V."),
          ("jack.ext_audio", "EXT AUDIO", "in", "audio", "mixer.noise", "External audio replaces noise in the mixer at NOISE/EXT LEVEL; unity gain, expects 10 Vpp (TS cable)."),
          ("jack.vcf_decay", "VCF DECAY", "in", "cv", "vcf_eg.decay_cv", "VCF decay CV, ±5 V."),
          ("jack.vcf_eg_out", "VCF EG", "out", "cv", "vcf_eg.out", "VCF envelope, 0 to +8 V."),
          ("jack.noise_level", "NOISE LEVEL", "in", "cv", "mixer.noise_cv", "Adds to NOISE/EXT LEVEL, 0 to +8 V (may clip)."),
          ("jack.vco_decay", f"{osc} DECAY", "in", "cv", "vco_eg.decay_cv", "Pitch envelope decay CV, ±5 V."),
          ("jack.vco_eg_out", f"{osc} EG" if not edge else "OSC EG", "out", "cv", "vco_eg.out", "Pitch envelope, 0 to +8 V."),
          ("jack.vcf_mod", "VCF MOD", "in", "cv", "vcfmod.in", "Replaces noise as the VCF modulation source, ±5 V, depth by NOISE/VCF MOD (full CW for full CV control)."),
          ("jack.vco1_cv", f"{osc} 1 CV", "in", "cv", "vco1.pitch_cv", "1 V/oct, ±5 V, summed with knob, EG and sequencer (for clean 1 V/oct: FREQ and EG centred, SEQ PITCH MOD off or VCO 2)."),
          ("jack.vco1_out", f"{osc} 1", "out", "audio", "vco1.out", "VCO 1, ±5 V."),
          ("jack.fm_amt", "1→2 FM AMT", "in", "cv", "vco2.fm_amt_cv", "Adds to the FM amount, 0 to +8 V."),
          ("jack.vco2_cv", f"{osc} 2 CV", "in", "cv", "vco2.pitch_cv", "1 V/oct, ±5 V, summed with knob, EG and sequencer."),
          ("jack.vco2_out", f"{osc} 2", "out", "audio", "vco2.out", "VCO 2, ±5 V."),
          ("jack.tempo", "TEMPO", "in", "cv", "clock.tempo_cv", "1 V/oct control of the clock VCO, ±5 V, summed with TEMPO; can reach audio rate."),
          ("jack.run_stop", "RUN / STOP" if not edge else "PLAY/STOP", "in", "gate", "clock.run", "High runs, low stops the sequencer at its current step (0-5 V, 10 V tolerant)."),
          ("jack.adv_clock", "ADV / CLOCK", "in", "clock", "seq.clock", "Each rising edge advances one step; TEMPO is then ignored. Slow edges may be missed."),
          ("jack.trigger_out", "TRIGGER", "out", "gate", "trig.out", "About 1 ms +5 V pulse per sequencer step."),
          ("jack.velocity_out", "VELOCITY", "out", "cv", "seq.velocity", "Current step velocity, 0-5 V."),
          ("jack.pitch_out", "PITCH", "out", "cv", "seq.pitch", "Current step pitch, ±5 V.")]
    for i, (jid, lab, d, sig, node, fn) in enumerate(jk):
        jack(jid, lab, d, sig, node, fn, manual_ref=f"patchbay row {i // 3 + 1}" if not edge else None)
        if edge:
            J[-1].pop("manual_ref")
    if not edge:
        jack("jack.audio_out", "AUDIO OUT", "out", "audio", "out.main", "1/4 inch: TS instrument cable or TRS headphones (not balanced line).", location="rear", connector="1/4 inch jack")
        jack("power.dc", "12VDC", "in", "power", None, "12 V DC 1,200 mA centre-positive adapter; no power switch. Eurorack: 230 mA max from +12 V.", location="rear", connector="DC barrel")
    else:
        jack("jack.phones", "PHONES", "out", "audio", "out.phones", "3.5 mm TRS headphones, 450 µW into 64 ohm, 470 ohm source impedance; follows VOLUME.", connector="3.5 mm TRS")
        jack("midi.in", "MIDI IN", "in", "midi", "midi.in", "Notes from an external MIDI device and MIDI clock.", location="rear", connector="5-pin DIN")
        jack("midi.out", "MIDI OUT/THRU", "out", "midi", "midi.thru", "Output or thru per the OUT/THRU switch; used to chain units.", location="rear", connector="5-pin DIN")
        jack("usb", "USB", "in", "midi", "midi.usb", "Class-compliant USB MIDI; SynthTribe settings and firmware.", location="rear", connector="USB-B")
        jack("power.dc", "DC INPUT", "in", "power", None, "12 V DC 1,000 mA supplied adapter; 4 W max.", location="rear", connector="DC barrel")
    D["ports"] = J

    # ------------------------------------------------------------------ connections
    norm("clock.out", "seq.clock", "jack.adv_clock", "clock", note="ADV/CLOCK replaces the clock VCO; TEMPO is ignored.")
    if edge:
        con("midi.clock", "clock.midi_in", "clock", {"any": [eq("clock.source", "midi"), eq("clock.source", "usb")]}, note="Divided by SCALE.")
        con("midi.note", "vco1.pitch_cv", "cv", confidence="inferred", note="MIDI notes play the voice (Behringer; ModWiggler owners); which VCOs follow is not stated.")
        con("midi.note", "vco2.pitch_cv", "cv", confidence="inferred")
        con("midi.gate", "trig.in", "gate", confidence="inferred", note="Notes fire the envelopes; with ADVANCE held they also step the sequencer (ModWiggler).")
        con("midi.velocity", "vel.in", "cv", note="VELOCITY OUT follows MIDI note velocity as well as the velocity row (ModWiggler owner report).")
    norm("seq.trig", "trig.in", "jack.trigger_in", "gate")
    for e in ("vco_eg", "vcf_eg", "vca_eg"):
        con("trig.out", f"{e}.trig", "gate")
    norm("seq.velocity", "vel.in", "jack.velocity_in")
    for e, o in (("vco_eg", "vel.to_vco"), ("vcf_eg", "vel.to_vcf"), ("vca_eg", "vel.to_vca")):
        con(o, f"{e}.velocity", "cv")
    con("seq.pitch", "vco1.pitch_cv", "cv", eq("seq.pitch_mod", "vco12"))
    con("seq.pitch", "vco2.pitch_cv", "cv", {"any": [eq("seq.pitch_mod", "vco12"), eq("seq.pitch_mod", "vco2")]})
    con("vco_eg.out", "vco1.pitch_cv", "cv", amount="vco1.eg_amt")
    con("vco_eg.out", "vco2.pitch_cv", "cv", amount="vco2.eg_amt")
    con("vco1.out", "vco2.fm_in", amount="vco2.fm_amt", note="Linear FM.")
    con("vco1.out", "vco2.sync_in", "sync", eq("vco2.sync", "on"))
    con("vco1.out", "mixer.vco1", amount="mix.vco1")
    con("vco2.out", "mixer.vco2", amount="mix.vco2")
    norm("noise.out", "mixer.noise", "jack.ext_audio", "audio", amount="mix.noise")
    norm("noise.out", "vcfmod.in", "jack.vcf_mod", "cv_or_audio")
    con("vcfmod.out", "vcf.cutoff_cv", "cv", amount="vcfmod.amt")
    con("mixer.out", "vcf.in")
    con("vcf_eg.out", "vcf.cutoff_cv", "cv", amount="vcf_eg.amt")
    con("vcf.out", "vca.in")
    con("vca_eg.out", "vca.cv", "cv")
    con("vca.out", "out.in", amount="out.volume")
    D["connections"] = C

    # ------------------------------------------------------------------ indicators, behaviours
    D["indicators"] = [{"id": "step_leds", "module": "seq", "label": "step LEDs (8)", "kind": "led", "led_colour": "red", "function": "Current step."},
                       {"id": "run_led", "module": "seq", "label": "RUN/STOP LED", "kind": "led", "led_colour": "red", "function": "Lit while the sequencer runs."}]
    if edge:
        D["indicators"].append({"id": "power_led", "module": "midi", "label": "POWER LED", "kind": "led", "led_colour": "multi", "function": "On with power; red when poly mode is active."})
    B = [
        ("Signal path", ["vco1", "vco2", "noise", "mixer", "vcf", "vca", "out"], "VCO 1, noise/ext and VCO 2 are mixed into the LP/HP ladder filter, then the VCA (VCA EG), then VOLUME."),
        ("Velocity and envelopes", ["vel", "vco_eg", "vcf_eg", "vca_eg"], "Each step's VELOCITY sets the peak of all three decay envelopes (and slightly lengthens their decay), so it shapes loudness, punch and accent; zero velocity is silent."),
        ("Pitch envelope", ["vco_eg", "vco1", "vco2"], "One pitch envelope reaches both VCOs at separate bipolar depths; positive for spikes (kicks), negative for dips. With both depths centred its decay does nothing. Typical decay 9-10:00 for drum punch."),
        ("Sequencer pitch", ["seq"], "SEQ PITCH MOD sends the PITCH knobs to both VCOs, VCO 2 only, or neither (PITCH output only, e.g. to VCA DECAY for hi-hat variation)."),
        ("Oscillator interaction", ["vco1", "vco2"], "HARD SYNC locks VCO 2 to VCO 1 (VCO 2 below VCO 1 may be near silent, especially square). 1→2 FM is linear, clearest with sync off."),
        ("Noise roles", ["noise", "mixer", "vcfmod"], "Noise is a sound source (snares, hats, attack) and the default cutoff modulator (dirt, sizzle). EXT AUDIO replaces it in the mixer; VCF MOD replaces it as modulator."),
        ("Filter", ["vcf"], "LP or HP, 20 Hz to 20 kHz; EG amount raises or lowers cutoff in either mode. Self-oscillation above about 3:00 resonance in LP; in HP only near 1 kHz." + (" Sound On Sound finds HP mode is not a smooth sweep across the range." if not edge else "")),
        ("VCA attack", ["vca_eg"], "FAST: 1 ms (as the other envelopes). SLOW: 100 ms, softer attacks and a glide-like effect on bass lines."),
        ("Clock and sync", ["clock", "seq"], "The clock is a VCO (TEMPO CV is 1 V/oct, to audio rate). ADV/CLOCK steps the sequencer per rising edge and overrides TEMPO; RUN/STOP input runs while high. Sync units by TRIGGER OUT into ADV/CLOCK (start the follower first)."),
        ("Stopped-sequencer editing", ["seq"], "With the sequencer stopped, ADVANCE steps without sounding and TRIGGER replays the current step."),
        ("Pitch safety", ["vco1", "vco2"], "Several pitch sources sum, so VCOs can leave the audible range; recover by centring FREQ, then EG amounts, then SEQ PITCH MOD off."),
    ]
    if not edge:
        B.append(("Eurorack", ["out"], "Removes from its case as a 60HP module (26 mm deep), 230 mA from +12 V, no -12 V."))
    else:
        B += [("MIDI and USB clock", ["clock", "midi"], "CLOCK selects INT/EXT (TEMPO or ADV/CLOCK), MIDI or USB; with external clock SCALE sets step length (1/4 to 1/32, straight or triplet) and the tempo range is 10-300 BPM."),
              ("Poly chain", ["midi"], "Up to 16 units chained by MIDI THRU act as a 16-voice instrument; the power LED turns red in poly mode. Generic SynthTribe procedure: set all units to one channel, chain THRU to IN, choose the unit count and voice mode in the Poly Chain tab, press Enable."),
              ("Playing from MIDI", ["midi", "seq"], "MIDI notes play the voice. Owners report the sequencer section then idles, but holding ADVANCE makes each note step the sequencer, so the PITCH row (via PITCH OUT) can modulate per note; VELOCITY OUT then follows note velocity rather than the velocity row."),
              ("Noise colour", ["noise"], "White noise is bright; pink is darker."),
              ("Warm-up", ["vco1", "vco2"], "Allow 15 minutes (longer from cold) for tuning to settle.")]
    D["behaviours"] = [{"id": f"b{i + 1:02d}", "name": n, "applies_to": a, "rule": r} for i, (n, a, r) in enumerate(B)]

    # ------------------------------------------------------------------ example patches
    if not edge:
        EX = [("music_box", "Music Box", 33, [["jack.pitch_out", "jack.vco1_cv"]], "PITCH knobs set VCO 1; small pitch tweaks change tonality; try VCO 2 FREQUENCY."),
              ("quick_hats", "Quick Hats", 33, [["jack.pitch_out", "jack.vca_decay"]], "PITCH knobs set each step's tightness."),
              ("fm_toys", "FM Toys", 34, [["jack.vco2_out", "jack.vcf_mod"]], "VCO 2 modulates the cutoff; compare LP and HP."),
              ("kick_snare", "Kick / Snare / FM Osc 2", 35, [["jack.pitch_out", "jack.noise_level"]], "PITCH knobs set voicing and snare level; VELOCITY knobs shape the kick pattern."),
              ("filter_osc", "Filter as an Oscillator", 35, [["jack.pitch_out", "jack.vcf_mod"]], "PITCH knobs play the self-oscillating filter; add VCO 2 for wobble, noise for a ghostly tone."),
              ("insane_toms", "Insane Toms", 36, [["jack.vco2_out", "jack.trigger_in"], ["jack.pitch_out", "jack.vca_decay"]], "VCO 2 adds extra triggers; PITCH knobs set each hit's ring."),
              ("swing_time", "Swing Time", 36, [["jack.pitch_out", "jack.tempo"]], "PITCH knobs set each step's length."),
              ("seq_osc", "Sequencer as an Oscillator", 37, [["jack.pitch_out", "jack.ext_audio"], ["jack.vco1_out", "jack.adv_clock"]], "VCO 1 clocks the sequencer at audio rate; PITCH knobs draw the waveform."),
              ("talking_drum", "Talking Drum", 37, [["jack.vco2_out", "jack.vcf_mod"]], "NOISE/VCF MOD sets how vocal it is; lower resonance for more thump.")]
        D["example_patches"] = [{"id": i, "name": n, "source": f"manual p.{p}", "cords": c, "description": d + " Knob settings drawn, not transcribed.", "confidence": "stated"} for i, n, p, c, d in EX]
        D["example_patches"].append({"id": "sequenced_bass", "name": "Sequenced Bass", "source": "manual p.34", "settings": {"vca_eg.attack": "slow", "seq.pitch_mod": "vco12"},
                                     "description": "No cables. Tune VCO 1 and 2 in unison; small PITCH moves add motion; SLOW VCA emulates glide.", "confidence": "inferred"})
        D["example_patches"].append({"id": "exploring", "name": "Exploring the DFAM (end state)", "source": "manual pp.8-12",
                                     "settings": {"vco1.eg_amt": 3, "vco_eg.decay": 2, "seq.pitch_mod": "vco12", "vco1.wave": "square", "mix.vco2": 10, "vco2.sync": "on", "vco2.fm_amt": 5,
                                                  "vcf.cutoff": 4, "vcf_eg.amt": 3, "vcf_eg.decay": 3, "mix.noise": 6, "vcfmod.amt": 2, "vca_eg.attack": "slow", "vca_eg.decay": 2.5},
                                     "description": "Settings reached by the guided tour (clock positions converted); VCO 1 FREQUENCY around 10-11:00.", "confidence": "stated"})
    else:
        D["example_patches"] = [
            {"id": "osc_fm", "name": "OSC 1 into OSC 2 CV", "source": "guide p.38", "cords": [["jack.vco1_out", "jack.vco2_cv"]], "description": "Exponential cross-modulation.", "confidence": "stated"},
            {"id": "pitch_decay", "name": "PITCH into VCA DECAY", "source": "guide p.38", "cords": [["jack.pitch_out", "jack.vca_decay"]], "description": "Sequencer PITCH knobs vary each step's decay.", "confidence": "stated"},
            {"id": "vel_fm", "name": "VELOCITY into 1-2 FM AMT", "source": "guide p.38", "cords": [["jack.velocity_out", "jack.fm_amt"]], "description": "Velocity row varies the FM per step.", "confidence": "stated"},
            {"id": "first_sounds", "name": "First sounds", "source": "guide p.38", "settings": {"clock.source": "int_ext", "seq.run": True},
             "description": "Volume up, CLOCK to INT, controls to the default patch drawing (not transcribed), PLAY/STOP.", "confidence": "stated"}]

    # ------------------------------------------------------------------ MIDI, specs, honesty
    if not edge:
        D["midi"] = {"receives": [], "transmits": [], "note": "None. Sync by ADV/CLOCK, TRIGGER and RUN/STOP; a Mother-32's assignable output can clock it."}
        D["specifications"] = {
            "sources": "VCO 1, VCO 2, white noise", "filter": "selectable HP/LP 4-pole (-24 dB/oct) ladder, 20 Hz to 20 kHz",
            "envelopes": "VCO EG, VCF EG (10 ms to 10 s), VCA EG (1 ms or 100 ms attack), all with voltage-controlled decay",
            "sequencer": {"steps": 8, "tempo_bpm": [10, 10000], "clock_hz": [0.7, 700]}, "patchbay": {"jacks": 24, "inputs": 15, "outputs": 9, "connector": "3.5 mm"},
            "levels": {"audio_v": [-5, 5], "eg_out_v": [0, 8], "pitch_v": [-5, 5], "velocity_v": [0, 5], "trigger_out": "+5 V, about 1 ms"},
            "rear": "1/4 inch TRS headphone or TS instrument; 12 VDC", "dimensions_in": {"width": 12.57, "depth": 4.21, "height": 5.24}, "weight_lb": 3.5,
            "power": {"adapter": "100-240 V AC, +12 V DC 1,200 mA, centre positive", "typical_w": 3.0}, "eurorack": {"width_hp": 60, "depth_mm": 26, "current_ma_plus12": 230}}
        D["omitted_from_source"] = ["knob settings drawn on the ten preset patch sheets (cables are transcribed)", "safety, warranty and accessory lists"]
        D["not_in_source"] = ["VCO and VCA decay ranges (only the VCF's 10 ms to 10 s is given; not found in research)", "how much velocity lengthens decays", "the RUN/STOP input's behaviour with a clock beyond the note given"]
        D["source_inconsistencies"] = [
            "The RUN/STOP input note says an external clock there advances steps 'in the same way repeatedly pressing the RUN/STOP button does', while RUN/STOP is described as start/stop, not step (p.29).",
            "Velocity is said to set the envelopes' amplitude (p.22) and also their decay time (pp.15, 19, 21).",
            "The signal flow diagram labels VCO 2's knob 'VC0 2 FREQ' (letter O for zero) (p.7).",
            "Sequenced Bass's notes imply sequenced pitch on both VCOs but the switch position is only drawn; recorded as inferred (p.34).",
        ]
        D["modelling_gaps"] = [{"topic": "Knob scales", "detail": "Clock positions converted 7:00 = 0 to 5:00 = 10, bipolar -5..+5."},
                               {"topic": "Envelope velocity", "detail": "Velocity's effect on decay time is described qualitatively; modelled only as the velocity input to each envelope."}]
    else:
        D["midi"] = {"receives": [{"message": "note_on", "note": "plays the voice and fires the envelopes; note velocity reaches the velocity bus (owner reports)"}, {"message": "pitch_bend", "note": "SynthTribe pitch bend range (generic, unconfirmed)"}, {"message": "clock", "note": "with CLOCK on MIDI or USB, divided by SCALE"}],
                     "transmits": [{"message": "thru", "note": "OUT/THRU switch"}], "channel_note": "1-16 by rear DIP switches or SynthTribe.", "note": "No CC or SysEx details in the guide."}
        D["specifications"] = {
            "voices": 1, "oscillators": 2, "filter": "HP/LP 4-pole (-24 dB/oct) ladder, 20 Hz to 20 kHz", "envelopes": "1 per VCO (shared), 1 VCF, 1 VCA decay", "noise": ["white", "pink"],
            "sequencer": {"steps": 8, "pitch_v": [-5, 5], "velocity_v": [0, 5], "scale": ["1/4", "1/8", "1/16", "1/32", "1/4T", "1/8T", "1/16T", "1/32T"], "clock": ["MIDI", "USB", "INT/EXT"]},
            "tempo_bpm": {"internal": [10, 10000], "midi_usb": [10, 300]},
            "inputs": {"osc_cv_v": [-5, 5], "osc_decay_v": [-5, 5], "adv_clock": ">3.2 V (10 V max)", "trigger": "0-5 V pulse or gate (10 V max)", "velocity_v": [0, 5], "noise_level_v": [0, 8],
                       "fm_amt_v": [0, 8], "ext_audio": "10 V max", "tempo_v": [-5, 5], "play_stop": ">3.2 V (10 V max)", "vcf_mod_v": [-5, 5], "vcf_decay_v": [-5, 5], "vca_cv_v": [0, 8], "vca_decay_v": [-5, 5]},
            "outputs": {"osc_v": [-5, 5], "eg_v": [0, 8], "trigger": "0-5 V pulse", "velocity_v": [0, 5], "pitch_v": [-5, 5], "vca": "3.5 mm TS, max +14.5 dBu", "phones": "3.5 mm TRS, 450 µW @ 64 ohm"},
            "connectivity": {"midi": "5-pin DIN in, out/thru", "usb": "USB 2.0 type B, class compliant (Windows 10+, macOS 10.14+)"},
            "power": {"adapter": "12 V DC 1,000 mA", "max_w": 4, "switch": "push on/off"}, "operating_temp_c": [5, 40],
            "dimensions_mm": {"height": 45, "width": 321, "depth": 164}, "weight_kg": 1.4}
        D["omitted_from_source"] = ["non-English sections", "the default patch drawing's knob positions", "hook-up diagrams beyond the poly chain arrangement", "safety and compliance text"]
        D["not_in_source"] = ["which VCOs MIDI note pitch reaches (both inferred)", "how notes are distributed across chained units", "which SynthTribe General settings the EDGE actually offers",
                              "decay ranges (not found in research)", "Eurorack mounting details",
                              "Research filled: MIDI notes play the voice and carry velocity; ADVANCE-hold stepping; generic SynthTribe poly chain procedure and settings; see sources."]
        D["source_inconsistencies"] = [
            "EG (VCO 1&2) DECAY is described as modulating the pitch of both oscillators and increasing 'the amount of modulation', i.e. as a depth rather than a decay time (control 6).",
            "The title promises a 'Dual 8-Step Sequencer'; there is one 8-step sequencer with pitch and velocity rows.",
            "Getting Started calls the waveforms 'pulse or triangle'; the controls list and specifications say square or triangle.",
            "Getting Started refers to an 'OSC 1&2 CV input'; the patchbay has separate OSC 1 CV and OSC 2 CV jacks.",
            "Getting Started says NOISE/VCF MOD 'will add noise if no audio is present in the EXT AUDIO input', conflating the mixer's EXT AUDIO with the VCF MOD input.",
            "The OSC EG output is labelled 'OSG EG' (control 52); 'OCILLATOR' heading typo.",
            "Control numbers 23-25 are printed out of order against their descriptions, so ENVELOPE (FILTER), NOISE/VCF MOD and TEMPO cannot be matched to numbers with certainty.",
            "Between sources: B&H describes a '15x10 I/O matrix'; the guide's patchbay has 15 inputs and 9 outputs plus PHONES.",
        ]
        D["modelling_gaps"] = [{"topic": "MIDI notes and poly chain", "detail": "The guide gives only an outline; note pitch, gate and velocity paths come from owner reports and are marked inferred where unconfirmed. Poly chain and key priority settings follow Behringer's generic SynthTribe guidance."},
                               {"topic": "Shared structure", "detail": "Built on the same module graph as the DFAM file; differences are additions (noise colour, clock source, SCALE, MIDI/USB, phones, power switch)."}]

    order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "example_patches", "midi", "specifications",
             "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
    fn = "/mnt/user-data/outputs/" + ("behringer-edge_synth.json" if edge else "moog-dfam_synth.json")
    with open(fn, "w", encoding="utf-8") as f:
        json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(fn, len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")


build(False)
build(True)
