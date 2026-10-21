#!/usr/bin/env python3
"""Assemble the Pearl Syncussion SY-1 (1979) and Behringer Syncussion SY-1 device files.

Built from one shared voice, as with the TB-303 and TD-3; the differences are explicit.

A recreation of the Pearl Syncussion SY-1 (1979): two identical drum synth channels,
each with two oscillators arranged by a six-position mode switch, pitch sweep, LFO
with sample and hold, low-pass filter (WIDTH), decay envelope and VCA. Triggered by
pads/external sources, the panel buttons, or MIDI. Source is the quick start guide.
"""
import json

S10 = {"min": 0, "max": 10}
D, M, P, J, C = {}, [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", ref=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    if ref:
        p["manual_ref"] = ref
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, direction, signal, node, fn, connector, location, ref, **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn, "manual_ref": ref}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


def modes(ch, *ms):
    return {"any": [eq(f"{ch}.mode", m) for m in ms]} if len(ms) > 1 else eq(f"{ch}.mode", ms[0])



def build(V):
    """V is 'behringer' or 'pearl'. Shared voice; differences are explicit below."""
    global D, M, P, J, C
    D = {"schema_version": "0.10.0"}
    M, P, J, C = [], [], [], []
    B = V == "behringer"
    D["device"] = {
        "id": "behringer-syncussion-sy-1", "manufacturer": "Behringer", "model": "SYNCUSSION SY-1",
        "category": "two-channel analogue percussion synthesizer, desktop or 80 HP Eurorack",
        "based_on": "Pearl Syncussion SY-1 (1979).",
        "sources": [{"id": "qsg", "title": "Behringer SYNCUSSION SY-1 Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer_SYNCUSSION-SY-1.pdf", "pages": 40,
                     "note": "Multilingual; English controls (46 callouts), MIDI operation, calibration, Eurorack installation and specifications used. Patch sheets are blank."},
            {"id": "pearl", "title": "Pearl Syncussion-1 brochure and operating guide (1979)", "kind": "user_manual", "file": "Syncussion_2_1979.pdf", "pages": 4,
             "note": "Original control descriptions (TUNE sets both oscillators and the filter; WIDTH sets the filter sweep range; LFO and S&H move pitch), mode character, specifications."},
            {"id": "bergfotron", "title": "Bergfotron, 'Super Syncussion' (from the original schematics)", "kind": "other", "file": "http://bergfotron.synth.net/Percussion/super%20syncussion.html",
             "note": "Per-voice structure (two VCOs, LPF, decay EG on the VCA, sweep EG, noise, LFO, S&H), fixed oscillator interval, mode routing for B, C and D."},
            {"id": "alyjames", "title": "AlyJamesLab, SY-4X technical overview of the original", "kind": "other", "file": "https://www.alyjameslab.com/alyjameslabsy4x.html",
             "note": "Two envelopes per voice; envelope 2 drives VCA, filter and (by mode) tuning; trigger strength sets envelope level."},
            {"id": "sy05", "title": "Mod Wiggler, 'Sy0.5 10HP Syncussion clone'", "kind": "other", "file": "https://www.modwiggler.com/forum/viewtopic.php?t=207564",
             "note": "Original oscillators calibrated at 440 and 450 Hz."}],
    }
    if not B:
        D["device"] = {
            "id": "pearl-syncussion-sy-1", "manufacturer": "Pearl", "model": "Syncussion SY-1 (Syncussion-1) control board",
            "category": "two-channel analogue percussion synthesizer, played from CU-1 drum pads",
            "based_on": "Original design, 1979; recreated by the Behringer Syncussion SY-1 (modelled separately).",
            "sources": [s_ for s_ in D["device"]["sources"] if s_["id"] != "qsg"],
        }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 2, "polyphony_mode": "two independent monophonic channels",
        "poly_chain_max_units": None, "patch_memory": False, "semi_modular": False, "panel_counts": {"channels": 2, "eurorack_hp": 80} if B else {"channels": 2, "faders_per_channel": 8},
        "summary": ("Two identical channels. Each has two oscillators set by a six-position mode switch (single, FM, mix, velocity-swept mix, FM plus noise, "
                    "noise only), a pitch sweep up or down with speed and range, an LFO (square or triangle, 0.4-50 Hz) with sample and hold, a "
                    "low-pass filter (WIDTH), a decay from 6 ms to 2.5 s and an output level. Triggered by pads or pulses at the rear, the panel "
                    "buttons, or MIDI in two modes.") if B else
                   ("Two identical channels. Each has two oscillators set by a six-position mode switch (single, FM, mix, velocity-swept mix, FM plus noise, "
                    "noise only), a pitch sweep up or down with speed and range, an LFO (square or triangle) with sample and hold, a low-pass filter swept by "
                    "the decay envelope over the WIDTH range, a decay and an output level. Played from CU-1 drum pads or microphones, with dynamics from "
                    "how hard each pad is hit; both channels share one output. No MIDI."),
    }

    if B:
        mod("midi", "midi_to_cv", "MIDI", "(rear panel)", "Mode 1: notes 36 and 38 trigger channels 1 and 2 on one channel. Mode 2: each channel on its own MIDI channel, pitched by notes 21-84. CC 80/81 set decay.",
            [], ["midi.trig1", "midi.trig2", "midi.pitch1", "midi.pitch2", "midi.decay1", "midi.decay2"])
    if not B:
        mod("outmix", "summer", "Output mix", "(rear panel)", "Sums both channels to the single OUTPUT.", ["outmix.in1", "outmix.in2"], ["outmix.out"])
    mod("mute", "gate_logic", "Mute", "(top panel)" if B else "(rear panel)", "Footswitch input that cuts off the decay on both channels.", ["mute.in"], ["mute.out"])

    for n, base in ((1, 12), (2, 26)):
        c = f"ch{n}"
        rj = 0 if n == 1 else 4   # rear/side jack offsets: 1-4 for ch1, 5-8 for ch2
        mod(f"{c}_trig", "envelope_follower", f"Channel {n} trigger", f"CHANNEL {n}", ("Trigger from the TRIGGER jack (with SENSE threshold), the panel button, or MIDI; also measures trigger strength." if B else
             "Trigger from the INPUT (CU-1 pad or microphone) past the SENSITIVITY threshold; also measures how hard the pad was hit."),
            [f"{c}_trig.ext"] + ([f"{c}_trig.midi"] if B else []), [f"{c}_trig.gate", f"{c}_trig.strength"])
        mod(f"{c}_noise", "noise", f"Channel {n} noise", f"CHANNEL {n}", "White noise for modes E and F (the original's is fairly soft).", [], [f"{c}_noise.out"])
        mod(f"{c}_tune", "pitch_control", f"Channel {n} tune", f"CHANNEL {n}", "TUNE fader and fine knob plus the TUNE jack and MIDI pitch: sets both oscillators and the filter cutoff together.",
            [f"{c}_tune.ext"] + ([f"{c}_tune.midi"] if B else []), [f"{c}_tune.cv"])
        mod(f"{c}_osc1", "oscillator", f"Channel {n} oscillator 1", f"CHANNEL {n}", "Oscillator 1: heard alone in mode A, mixed in C and D, and the FM modulator in B and E.",
            [f"{c}_osc1.pitch_cv"], [f"{c}_osc1.out"], {"calibration_hz": 440})
        mod(f"{c}_osc2", "oscillator", f"Channel {n} oscillator 2", f"CHANNEL {n}", "Oscillator 2: the frequency-modulated output in B and E, mixed in C and D. Its interval to oscillator 1 is fixed by an internal trimmer.",
            [f"{c}_osc2.pitch_cv", f"{c}_osc2.fm"], [f"{c}_osc2.out"], {"calibration_hz": 450, "interval": "fixed by trimmer; not user adjustable on the original"})
        mod(f"{c}_mix", "mixer", f"Channel {n} source mix", f"CHANNEL {n}", "Combines oscillators and noise according to OSC MODE.", [f"{c}_mix.osc1", f"{c}_mix.osc2", f"{c}_mix.noise"], [f"{c}_mix.out"])
        mod(f"{c}_sweep", "envelope", f"Channel {n} sweep", f"CHANNEL {n}", "Pitch sweep on each trigger, up or down, at SWEEP SPEED over SWEEP RANGE; in mode D its depth follows trigger strength.",
            [f"{c}_sweep.gate", f"{c}_sweep.depth_cv"], [f"{c}_sweep.out"])
        mod(f"{c}_lfo", "lfo", f"Channel {n} LFO", f"CHANNEL {n}", "Square or triangle LFO, 0.4-50 Hz, or off; also clocks the sample and hold.", [], [f"{c}_lfo.out", f"{c}_lfo.clock"],
            {"rate_hz": [0.4, 50]})
        mod(f"{c}_snh", "sample_hold", f"Channel {n} sample and hold", f"CHANNEL {n}", "Random steps on pitch at the LFO rate, even with the LFO wave switched off.", [f"{c}_snh.in", f"{c}_snh.clock"], [f"{c}_snh.out"])
        mod(f"{c}_vcf", "filter", f"Channel {n} filter", f"CHANNEL {n}", "Low-pass filter. Cutoff follows TUNE; the decay envelope sweeps it down from high, over a range set by WIDTH.", [f"{c}_vcf.in", f"{c}_vcf.cutoff_cv"], [f"{c}_vcf.out"])
        mod(f"{c}_env", "envelope", f"Channel {n} decay", f"CHANNEL {n}", "Decay-only envelope (envelope 2 on the original), 6 ms to 2.5 s depending on tuning; its level follows trigger strength. Drives the VCA, the filter and, in mode D, oscillator 2's pitch.",
            [f"{c}_env.gate", f"{c}_env.mute", f"{c}_env.level_cv"] + ([f"{c}_env.decay_cv"] if B else []), [f"{c}_env.out"],
            {"decay_s": [0.006, 2.5]})
        mod(f"{c}_vca", "vca", f"Channel {n} VCA", f"CHANNEL {n}", "Shapes the channel with its decay; OUTPUT sets the level.", [f"{c}_vca.in", f"{c}_vca.cv"], [f"{c}_vca.out"])

        par(f"{c}.mode", f"{c}_osc1", "OSC MODE", "enum", "Oscillator structure.", "rotary_switch", base,
            values=[{"value": "A", "meaning": "single oscillator"}, {"value": "B", "meaning": "two-oscillator FM: metallic"}, {"value": "C", "meaning": "two-oscillator mix: vibraphone-like"},
                    {"value": "D", "meaning": "two-oscillator mix, sweep depth from trigger strength"}, {"value": "E", "meaning": "two-oscillator FM plus white noise: struck thin metal"},
                    {"value": "F", "meaning": "white noise only"}])
        if B:
            par(f"{c}.trigger", f"{c}_trig", "TRIGGER", "boolean", "Triggers the channel; its LED shows any trigger.", "push_button", base + 1)
        par(f"{c}.tune", f"{c}_tune", "TUNE (coarse)", "continuous", "Coarse tuning of both oscillators and the filter cutoff.", "fader", base + 2, panel_scale=S10)
        if B:
            par(f"{c}.tune_fine", f"{c}_tune", "TUNE (fine)", "continuous", "Fine tuning.", "knob", base + 2, panel_scale=S10)
        par(f"{c}.decay", f"{c}_env", "DECAY", "continuous", "Decay time; also set by MIDI CC.", "fader", base + 3, physical={"min": 0.006, "max": 2.5, "unit": "s"},
            access=[{"type": "panel", "control": "fader"}] + ([{"type": "midi", "message": f"CC {79 + n}"}] if B else []))
        par(f"{c}.width", f"{c}_vcf", "WIDTH", "continuous", "Range of the filter sweep: wide starts bright and falls; narrow stays near the TUNE cutoff.", "fader", base + 4, panel_scale=S10)
        par(f"{c}.sweep_speed", f"{c}_sweep", "SWEEP SPEED", "continuous", "Rate of travel from the struck pitch to the final pitch.", ("knob" if B else "fader"), base + 5, panel_scale=S10)
        par(f"{c}.sweep_dir", f"{c}_sweep", "SWEEP", "enum", "Sweep up, down or off.", "toggle_switch", base + 6, values=[{"value": "up"}, {"value": "off"}, {"value": "down"}])
        par(f"{c}.sweep_range", f"{c}_sweep", "SWEEP RANGE", "continuous", "Final pitch the sweep reaches; tracks TUNE.", ("knob" if B else "fader"), base + 7, panel_scale=S10)
        par(f"{c}.lfo_speed", f"{c}_lfo", "LFO SPEED", "continuous", "LFO and S&H rate.", ("knob" if B else "fader"), base + 8, physical={"min": 0.4, "max": 50, "unit": "Hz"})
        par(f"{c}.lfo_wave", f"{c}_lfo", "LFO WAVE", "enum", "Square, triangle or off.", "toggle_switch", base + 9, values=[{"value": "square"}, {"value": "off"}, {"value": "triangle"}])
        par(f"{c}.lfo_depth", f"{c}_lfo", "LFO DEPTH", "continuous", "Amount of LFO pitch movement (vibrato).", ("knob" if B else "fader"), base + 11, panel_scale=S10)
        par(f"{c}.snh", f"{c}_snh", "S&H", "boolean", "Random pitch on each hit, sampled at the LFO SPEED rate; works with the LFO off.", "toggle_switch", base + 12)
        par(f"{c}.output", f"{c}_vca", "OUTPUT", "continuous", "Channel output level.", ("knob" if B else "fader"), base + 13, panel_scale=S10)
        if B:
            par(f"{c}.sense", f"{c}_trig", "SENSE", "continuous", "Trigger input sensitivity, to prevent mis-triggering.", "knob", 4 + rj, panel_scale=S10)
        else:
            par(f"{c}.sense", f"{c}_trig", "SENSITIVITY", "continuous", "Adjust so the channel's trigger light comes on when the pad is struck, to suit the player.",
                access=[{"type": "rear_panel", "control": "knob"}], panel_scale=S10)

        if B:
          jack(f"jack.{c}_out_mini", f"CH {n} OUTPUT", "out", "audio", f"{c}_vca.out", f"Channel {n} output.", "3.5 mm TRS (unbalanced)", "top", 1 + rj)
          jack(f"jack.{c}_tune", f"CH {n} TUNE", "in", "cv", f"{c}_tune.ext", "Tuning from an external device such as a pedal (the original's TP-01); the jack supplies no voltage.", "3.5 mm TS", "top", 2 + rj, combine="sum")
          jack(f"jack.{c}_trig", f"CH {n} TRIGGER", "in", "gate", f"{c}_trig.ext", "External trigger (pad, drum trigger, pulse).", "3.5 mm TS", "top", 3 + rj)
          jack(f"jack.{c}_out", f"CHANNEL {n} OUTPUT", "out", "audio", f"{c}_vca.out", f"Channel {n} output, unbalanced; same as the top-panel socket.", "6.35 mm TS", "rear", 39 + n)
        else:
            jack(f"jack.{c}_input", f"INPUT CH-{n}", "in", "gate", f"{c}_trig.ext", "CU-1 drum pad pickup or a microphone; 200 mV minus peak sensitivity.", "6.35 mm TS", "rear", None,
                 confidence="inferred", note="Connector size not stated.")
            con(f"{c}_vca.out", f"outmix.in{n}", "audio")

        if B:
            con(f"midi.trig{n}", f"{c}_trig.midi", "gate")
        if B:
            con(f"midi.pitch{n}", f"{c}_tune.midi", "cv", eq("sys.midi_mode", 2), note="Mode 2 only: notes 21-84; outside that range they clamp.")
        con(f"{c}_tune.cv", f"{c}_osc1.pitch_cv", "cv")
        con(f"{c}_tune.cv", f"{c}_osc2.pitch_cv", "cv", note="Fixed interval: original calibrated 440 / 450 Hz.")
        con(f"{c}_tune.cv", f"{c}_vcf.cutoff_cv", "cv")
        con(f"{c}_env.out", f"{c}_vcf.cutoff_cv", "cv", amount=f"{c}.width")
        con(f"{c}_trig.strength", f"{c}_env.level_cv", "cv", note="Harder hits give a louder, brighter note.")
        con(f"{c}_env.out", f"{c}_osc2.pitch_cv", "cv", modes(c, "D"), note="Mode D: the decay envelope moves oscillator 2 while the sweep moves oscillator 1.")
        if B:
            con(f"midi.decay{n}", f"{c}_env.decay_cv", "cv", note=f"CC {79 + n}; set the DECAY fader to midway for best results.")
        con("mute.out", f"{c}_env.mute", "gate")
        con(f"{c}_trig.gate", f"{c}_env.gate", "gate")
        con(f"{c}_trig.gate", f"{c}_sweep.gate", "gate")
        con(f"{c}_trig.strength", f"{c}_sweep.depth_cv", "cv", modes(c, "D"), note="In mode D the sweep depth follows how hard the channel is hit.")
        con(f"{c}_sweep.out", f"{c}_osc1.pitch_cv", "cv", {"param": f"{c}.sweep_dir", "not_equals": "off"}, amount=f"{c}.sweep_range")
        con(f"{c}_sweep.out", f"{c}_osc2.pitch_cv", "cv", {"all": [{"param": f"{c}.sweep_dir", "not_equals": "off"}, {"param": f"{c}.mode", "not_equals": "D"}]}, amount=f"{c}.sweep_range")
        for o in ("osc1", "osc2"):
            con(f"{c}_lfo.out", f"{c}_{o}.pitch_cv", "cv", {"param": f"{c}.lfo_wave", "not_equals": "off"}, amount=f"{c}.lfo_depth")
            con(f"{c}_snh.out", f"{c}_{o}.pitch_cv", "cv", eq(f"{c}.snh", True))
        con(f"{c}_lfo.clock", f"{c}_snh.clock", "clock")
        con(f"{c}_noise.out", f"{c}_snh.in", "cv", confidence="inferred", note="Sample source not stated in either manual.")
        con(f"{c}_osc1.out", f"{c}_osc2.fm", "audio", modes(c, "B", "E"))
        con(f"{c}_osc1.out", f"{c}_mix.osc1", "audio", modes(c, "A", "C", "D"), note="In mode C oscillator 1 is mixed at a reduced level.")
        con(f"{c}_osc2.out", f"{c}_mix.osc2", "audio", modes(c, "B", "C", "D", "E"))
        con(f"{c}_noise.out", f"{c}_mix.noise", "audio", modes(c, "E", "F"))
        con(f"{c}_mix.out", f"{c}_vcf.in", "audio")
        con(f"{c}_vcf.out", f"{c}_vca.in", "audio")
        con(f"{c}_env.out", f"{c}_vca.cv", "cv", amount=f"{c}.output")

    if not B:
        par("sys.power", "mute", "POWER", "boolean", "Power switch; the LED lights.", "toggle_switch", 9)
        jack("jack.output", "OUTPUT", "out", "audio", "outmix.out", "To amplifier: both channels mixed, 1 Vpp, 10 kohm.", "6.35 mm TS", "rear", None, confidence="inferred",
             note="One output for both channels, per the brochure's hook-up drawing and owners' stereo-output mods.")
        jack("jack.tune_pedal", "TUNE", "in", "cv", "ch1_tune.ext", "TP-01 tune pedal: tunes channel 1 and/or channel 2.", "6.35 mm TRS", "rear", None, confidence="inferred",
             note="One jack for both channels; tip to channel 1 and ring to channel 2 is inferred from owners' mods.")
        jack("jack.tune_pedal_ring", "TUNE (ring)", "in", "cv", "ch2_tune.ext", "Channel 2 side of the TUNE pedal jack.", "6.35 mm TRS", "rear", None, confidence="inferred")
        jack("jack.mute", "MUTE", "in", "gate", "mute.in", "MP-01 on/off mute pedal.", "6.35 mm TS", "rear", None, confidence="inferred", note="Connector size not stated.")
        jack("jack.dc_in", "AC", "in", "power", None, "AC adaptor, DC 12 V 300 mA.", "DC barrel", "rear", None)
    if B:
      par("sys.midi_channel", "midi", "MIDI CHANNEL", "integer", "MIDI channel 1-16 (mode 2: channel 2 listens one higher, or 15 if set to 16).", ref=42, range={"min": 1, "max": 16},
        access=[{"type": "rear_panel", "control": "dip_switches_x4"}])
      par("sys.midi_mode", "midi", "MIDI mode", "enum", "Mode 1: one channel, fixed notes 36/38, no pitch. Mode 2: one channel per voice, pitch by note.", values=[{"value": 1}, {"value": 2}],
        access=[{"type": "app", "note": "SynthTribe; remembered at power-off"},
                {"type": "gesture", "gesture": "hold CH 1 TRIG (mode 1) or CH 2 TRIG (mode 2) while powering up", "when": "power_on"}])
      par("sys.calibrate", "midi", "Calibration / DFU", "enum", "Hold both TRIG buttons at power-up, then CH 1 TRIG to calibrate the oscillators or CH 2 TRIG for DFU firmware mode.",
        values=[{"value": "calibrate"}, {"value": "dfu"}], access=[{"type": "gesture", "gesture": "hold CH 1 + CH 2 TRIG at power-up, then press CH 1 or CH 2 TRIG", "when": "power_on"}])
      par("sys.power", "mute", "POWER", "boolean", "Power switch (cased use).", ref=45, access=[{"type": "rear_panel", "control": "push_button"}])

      jack("jack.phones", "PHONES", "out", "audio", None, "Headphones, stereo, 5 mW into 32 ohm; channel panning not stated.", "3.5 mm TRS", "top", 9)
      jack("jack.mute", "MUTE", "in", "gate", "mute.in", "Footswitch to cut off the decay.", "3.5 mm TS", "top", 10, confidence="inferred", note="Connector size not stated.")
      jack("jack.midi_in", "MIDI IN", "in", "midi", None, "MIDI in.", "5-pin DIN", "top", 11)
      jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "Passes MIDI IN on.", "5-pin DIN", "rear", 43)
      jack("jack.usb", "USB", "bidirectional", "midi", None, "USB MIDI, SynthTribe and firmware.", "USB 2.0 type B", "rear", 44)
      jack("jack.dc_in", "DC INPUT", "in", "power", None, "12 V DC, 1000 mA, cased use.", "DC barrel", "rear", 46)
      jack("jack.eurorack", "Eurorack power", "in", "power", None, "10-pin header with a 10-to-16-pin ribbon; 1 A at 12 V.", "10-pin IDC header", "rear", 46)

    D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
    D["indicators"] = [{"id": f"ch{n}.trig_led", "module": f"ch{n}_trig", "label": f"CH {n} TRIGGER LED" if B else f"CH.{n} TRIG.IND.", "kind": "led",
                        "function": "Lights on any trigger; flashes during calibration." if B else "Lights when a strong enough hit arrives; shows which channel is playing."} for n in (1, 2)] + \
        ([{"id": f"ch{n}.lfo_led", "module": f"ch{n}_lfo", "label": f"CH {n} LFO LED", "kind": "led", "function": "Flashes at the LFO rate.", "manual_ref": 22 if n == 1 else 36} for n in (1, 2)] if B else []) + \
        [{"id": "power_led", "module": "mute", "label": "POWER LED", "kind": "led", "function": "Power on."}]
    D["behaviours"] = [
        {"id": "b01", "name": "Oscillator modes", "applies_to": ["ch1_osc1", "ch2_osc1"],
         "rule": "A: oscillator 1 alone, the classic drum-synth sweep. B: oscillator 1 frequency-modulates oscillator 2, which is heard; metallic. C: both mixed, oscillator 1 lower; vibraphone-like. "
                 "D: both mixed; soft or hard hits sweep low to high, independent of SWEEP SPEED and RANGE (the sweep moves oscillator 1, the decay envelope oscillator 2). "
                 "E: FM as B plus noise; struck thin metal. F: noise only. Both channels at once (A plus F) give an 808-style snare."},
        {"id": "b02", "name": "Pitch sweep", "applies_to": ["ch1_sweep", "ch2_sweep"],
         "rule": "Each trigger sweeps the pitch up or down at SWEEP SPEED over SWEEP RANGE: the classic synth-tom and laser sounds. OFF holds the tuned pitch."},
        {"id": "b03", "name": "LFO and sample and hold", "applies_to": ["ch1_lfo", "ch2_lfo", "ch1_snh", "ch2_snh"],
         "rule": "The LFO (square or triangle) modulates at LFO DEPTH. S&H adds random steps at the LFO SPEED rate, and keeps working with the LFO wave switched off."},
        {"id": "b04", "name": "Decay, filter and dynamics", "applies_to": ["ch1_env", "ch2_env", "ch1_vcf", "ch2_vcf"],
         "rule": "One decay envelope shapes the VCA and sweeps the filter down from high over the WIDTH range; TUNE moves the oscillators and filter cutoff together. Trigger strength sets the envelope level, so hard hits are louder and brighter. "
                 "Decay runs from 6 ms to 2.5 s depending on tuning; MUTE cuts it off."},
        {"id": "b07", "name": "Fixed oscillator interval", "applies_to": ["ch1_osc2", "ch2_osc2"], "rule": "The interval between the two oscillators is set by an internal trimmer (originally 440 and 450 Hz), not by a panel control."},
        {"id": "b05", "name": "MIDI modes", "applies_to": ["midi"],
         "rule": "Mode 1: one MIDI channel; note 36 triggers channel 1, note 38 channel 2; pitch from the panel only. Mode 2: channel 1 on the set MIDI channel, channel 2 on the next one up; "
                 "notes 21-84 set pitch (clamped outside). Both modes: CC 80 and 81 set decay. Chosen in SynthTribe or by holding a TRIG button at power-up; remembered."},
        {"id": "b06", "name": "Trigger sensitivity", "applies_to": ["ch1_trig", "ch2_trig"], "rule": "SENSE sets the trigger threshold for pads and other external sources to avoid false triggers."},
    ]
    if not B:
        D["behaviours"] = [b for b in D["behaviours"] if b["id"] != "b05"]
        for b in D["behaviours"]:
            if b["id"] == "b06":
                b["rule"] = "Each channel's rear SENSITIVITY knob is set so its trigger light comes on when the pad is struck, matching the player's style."
        D["behaviours"].append({"id": "b08", "name": "Playing from pads", "applies_to": ["ch1_trig", "ch2_trig"],
                                "rule": "Each channel is played from a CU-1 drum pad (same pickup as Pearl's drum units, head tension adjustable with a drum key) or a microphone. "
                                        "Volume and brilliance follow how hard the pad is hit."})
        D["behaviours"].append({"id": "b09", "name": "Pedals", "applies_to": ["ch1_tune", "ch2_tune", "mute"],
                                "rule": "The TP-01 tune pedal bends the pitch of channel 1 and/or 2 while playing; the MP-01 mute pedal cuts notes off."})
    D["midi"] = {
        "receives": [{"message": "note_on", "mode_1": {"36": "channel 1", "38": "channel 2"}, "mode_2": "notes 21-84 pitch and trigger each channel"},
                     {"message": "control_change", "cc": 80, "parameter": "ch1.decay"}, {"message": "control_change", "cc": 81, "parameter": "ch2.decay"}],
        "transmits": [], "channel_note": "Base channel 1-16 by rear DIP switches; in mode 2, channel 2 uses the next channel up (15 when set to 16).",
        "note": "MIDI THRU and USB MIDI; settings via SynthTribe."} if B else {"receives": [], "transmits": [], "note": "None: the original predates MIDI."}
    PEARL_SPECS = {"input_sensitivity": "200 mV minus peak", "output": "1 Vpp, 10 kohm", "power": "DC 12 V 300 mA", "dimensions_mm": {"w": 320, "h": 95, "d": 200}, "weight_kg": 2.5,
                   "accessories": ["CU-1 drum outfit (8\" x 4.5\" wood shell, Syncussion head)", "TP-01 tune pedal", "MP-01 mute pedal", "SYC-01 aluminium case"],
                   "supplied": ["AC adaptor", "connection cords x 3", "carrying case"]}
    D["specifications"] = {
        "voices": 2, "type": "analogue", "oscillators": "2 VCO", "lfos": 2, "filters": "2 LPF", "envelopes": "decay only", "lfo_rate_hz": [0.4, 50], "decay_s": [0.006, 2.5],
        "connectivity": {"midi": "5-pin DIN in and thru, 16 channels", "usb": "USB 2.0 type B, class compliant", "phones": "3.5 mm TRS stereo, 5 mW into 32 ohm",
                         "outputs": "2 x 3.5 mm (top) and 2 x 6.35 mm (rear), unbalanced", "inputs": "trigger x 2, tune x 2, mute"},
        "power": {"adaptor": "12 V DC, 1000 mA", "eurorack": "1 A at 12 V"},
        "eurorack_hp": 80, "dimensions_mm": {"h": 95, "w": 424, "d": 136}, "weight_kg": 1.9,
    }
    if not B:
        D["specifications"] = dict({"voices": 2, "type": "analogue", "oscillators": "2 per channel", "lfos": 2, "filters": "2 LPF", "envelopes": "decay, plus sweep",
                                    "decay_s": [0.006, 2.5], "lfo_rate_hz": [0.4, 50]}, **PEARL_SPECS)
        D["specifications"]["note"] = "Decay and LFO ranges are from the Behringer recreation; the Pearl brochure gives none."
    D["omitted_from_source"] = ["safety and warranty text", "hook-up diagrams", "non-English translations", "Eurorack installation steps beyond power", "blank patch sheets"] if B else \
        ["the CU-1 drum and stand descriptions, beyond their use as trigger sources", "accessory set-up drawings"]
    D["not_in_source"] = ["the sample and hold's source (noise assumed)", "filter slope", "how the headphone output pans the channels", "sweep speed and range values",
                          "whether Behringer kept the original 440/450 Hz oscillator interval"] if B else \
        ["the sample and hold's source (noise assumed)", "filter slope", "control ranges in Hz or seconds", "connector sizes", "LFO indicator (none visible on the panel)"]
    D["source_inconsistencies"] = [
        "The Behringer specifications list '2 VCO' for two channels; the Pearl manual and schematic-based sources confirm two oscillators per channel (four in all).",
        "The Behringer guide says WIDTH sets filter cutoff; the Pearl manual says it sets the range of a falling filter sweep, with cutoff following TUNE.",
        "The Pearl text says the sweep's 'DEPTH control tracks the TUNE control'; there is no sweep DEPTH, so this means RANGE.",
        "Mode B is described in both manuals as one oscillator modulating the other; the schematic-based Bergfotron notes give oscillator 1 modulating oscillator 2, which is heard.",
        "The MIDI CHANNEL dipswitch is callout 42, but the MIDI operation text calls it 'dipswitch 43' (MIDI THRU).",
        "Mode 2's channel rule says channel 2 follows on the next MIDI channel up, yet at 16 it drops to 15.",
    ]
    if not B:
        D["source_inconsistencies"] = [x for x in D["source_inconsistencies"] if "Pearl" in x and "Behringer guide" not in x and "Behringer specifications" not in x] + \
            ["One forum description gives the LFO as square or sawtooth; the Pearl panel and text show square and triangle."]
    D["modelling_gaps"] = ([
        {"topic": "Behringer versus Pearl", "detail": "Routing follows the Pearl manual and schematic-based notes; the Behringer guide does not contradict it, but a hands-on check would confirm Behringer kept it."},
        {"topic": "Pair", "detail": "The Pearl original is modelled in pearl-syncussion-sy-1_synth.json from the same base."},
    ] if B else [
        {"topic": "Brochure, not a service manual", "detail": "Four-page brochure; voice routing comes from schematic-based notes (Bergfotron, AlyJamesLab)."},
        {"topic": "Output and pedal jacks", "detail": "One mixed output and a single TRS tune jack covering both channels are inferred from the hook-up drawing and owners' modifications."},
        {"topic": "Pair", "detail": "The Behringer recreation is modelled in behringer-syncussion-sy-1_synth.json from the same base."},
    ])
    order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
             "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
    path = f"/mnt/user-data/outputs/{'behringer' if B else 'pearl'}-syncussion-sy-1_synth.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("written", path)


for variant in ("pearl", "behringer"):
    build(variant)
