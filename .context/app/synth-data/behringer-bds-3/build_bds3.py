#!/usr/bin/env python3
"""Assemble the Behringer BDS-3 device file.

Four identical drum channels plus a master/effects section. The channels are modelled
as separate modules (ch1_* to ch4_*) because each has its own jacks, trigger and
output, rather than as one per-voice template. Source is the Quick Start Guide, so
the internal structure is partly inferred and not_in_source lists what it leaves out.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.10.0"}
M, P, J, C, B, I = [], [], [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def jack(id, label, location, direction, signal, node, fn, connector, **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal,
         "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "behringer-bds-3", "manufacturer": "Behringer",
    "model": "BDS-3 Classic 4-Channel Analog Drum Synthesizer with Special Effects Channel and Eurorack Format",
    "category": "4-channel analogue drum synthesizer, desktop or 70 HP Eurorack",
    "based_on": "Simmons SDS-3 (late 1970s), per retailer descriptions; Behringer's own copy says only 'a classic drum synthesizer from the late 1970s'. Some early units are printed SDS-3.",
    "sources": [
        {"id": "qsg", "title": "Behringer BDS-3 Quick Start Guide", "kind": "quick_start_guide", "file": "Behringer-BDS-3.pdf", "pages": 51,
         "note": "Multilingual; English controls, getting started, Eurorack installation and specifications used. The patch sheets are blank templates."},
        {"id": "retail", "title": "Thomann and Musicorp product pages", "kind": "other", "file": "https://www.musicorp.com.au/keyboards/behringer-bds-3-4-channel-analog-drum-synthesizer-w-fx-channel-eurorack-format/1072615-6886658/",
         "note": "Original instrument (SDS-3), release (December 2025), and a user report of SDS-3 printed on early units."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 4, "polyphony_mode": "4 independent monophonic drum channels",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No memory; settings are the panel. SynthTribe sets per-channel options.",
    "semi_modular": False, "panel_counts": {"knobs": 30, "faders": 6, "toggle_switches": 20, "jacks_top": 15, "eurorack_hp": 70},
    "summary": ("Four identical channels, each triggered by a microphone or other audio at its MIC IN (velocity sensitive) or by its own MIDI note. "
                "Each channel's tone comes from a self-oscillating diode ladder filter, mixed with filtered white noise, with an impact click, a "
                "pitch bend up or down into the set pitch, and a decay from 50 ms to 7 s. A master section holds overall pitch (with a pitch "
                "pedal), an LFO with an audio-rate FAST range, and RUN, a sample-and-hold stepped by channel triggers; each channel chooses "
                "whether these reach it and how strongly. Individual and mix outputs, MIDI and USB MIDI, decay kill footswitch."),
}

# ---------------- channels ----------------
for n in range(1, 5):
    c = f"ch{n}"
    mod(f"{c}_trig", "envelope_follower", f"Channel {n} trigger", f"CHANNEL {n}",
        "Turns sound at MIC IN into a velocity-sensitive trigger once it passes MIC SENSITIVITY, or takes the channel's MIDI note. "
        "MIC OUT passes the microphone signal on.", [f"{c}_trig.mic_in", f"{c}_trig.midi_in"], [f"{c}_trig.gate", f"{c}_trig.mic_thru"])
    mod(f"{c}_env", "envelope", f"Channel {n} decay envelope", f"CHANNEL {n}",
        "Decay from 50 ms to 7 s on each trigger; also drives the bend and the impact click. Cut short by DECAY KILL.",
        [f"{c}_env.gate", f"{c}_env.kill"], [f"{c}_env.out"], props={"decay_s": [0.05, 7]})
    mod(f"{c}_osc", "oscillator", f"Channel {n} tone", f"CHANNEL {n}",
        "A self-oscillating diode ladder filter used as the tone oscillator, from below 20 Hz to over 30 kHz.",
        [f"{c}_osc.pitch_cv"], [f"{c}_osc.out"], props={"frequency_hz": [20, 30000], "circuit": "self-oscillating diode ladder filter"})
    mod(f"{c}_noise", "noise", f"Channel {n} noise", f"CHANNEL {n}", "White noise source.", [], [f"{c}_noise.out"])
    mod(f"{c}_nflt", "filter", f"Channel {n} noise filter", f"CHANNEL {n}", "Filters the noise; PITCH opens it as it raises the tone.",
        [f"{c}_nflt.in", f"{c}_nflt.cutoff_cv"], [f"{c}_nflt.out"])
    mod(f"{c}_mix", "mixer", f"Channel {n} balance", f"CHANNEL {n}", "Balances tone and noise; equal at 12 o'clock.",
        [f"{c}_mix.tone", f"{c}_mix.noise"], [f"{c}_mix.out"])
    mod(f"{c}_lpf", "filter", f"Channel {n} click filter", f"CHANNEL {n}",
        "Low-pass filter opened at the start of each hit by IMPACT CLICK, giving a stick-strike transient.",
        [f"{c}_lpf.in", f"{c}_lpf.cutoff_cv"], [f"{c}_lpf.out"])
    mod(f"{c}_vca", "vca", f"Channel {n} VCA", f"CHANNEL {n}", "Shapes the channel with its decay; CHANNEL LEVEL sets both the channel output and its share of the mix.",
        [f"{c}_vca.in", f"{c}_vca.cv"], [f"{c}_vca.out"])

    par(f"{c}.mic_sens", f"{c}_trig", "MIC SENSITIVITY", "continuous", "Trigger sensitivity of MIC IN.", panel_scale=S10, manual_ref=4)
    par(f"{c}.mic_on", f"{c}_trig", "MIC ON/OFF", "boolean", "Bypasses the sensitivity control.", control="toggle_switch", manual_ref=5,
        note="The guide's wording ('bypass the mic sensitivity controls') is ambiguous: it may disable the mic input.")
    par(f"{c}.click", f"{c}_lpf", "IMPACT CLICK", "continuous", "Strike transient at the start of the sound; clockwise opens the low-pass cutoff for a louder click.",
        panel_scale=S10, manual_ref=6)
    par(f"{c}.decay", f"{c}_env", "DECAY TIME", "continuous", "Decay time.", panel_scale=S10, physical={"min": 0.05, "max": 7, "unit": "s"}, manual_ref=7)
    par(f"{c}.bend_dir", f"{c}_osc", "UP/DOWN", "enum", "Whether the pitch bends up to, or down to, the PITCH setting.", control="toggle_switch",
        values=[{"value": "up"}, {"value": "down"}], manual_ref=9)
    par(f"{c}.bend", f"{c}_osc", "BEND LEVEL", "continuous", "Amount of bend into the set pitch; fully anticlockwise is none.", panel_scale=S10, manual_ref=10)
    par(f"{c}.pitch", f"{c}_osc", "PITCH", "continuous", "Tone frequency and noise filter cutoff together.", panel_scale=S10,
        physical={"min": 20, "max": 30000, "unit": "Hz", "note": "'below 20 Hz to over 30 kHz'"}, manual_ref=11,
        access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": f"CC {19 + n}"}, {"type": "app", "note": "SynthTribe"}])
    par(f"{c}.balance", f"{c}_mix", "BALANCE", "continuous", "Anticlockwise favours noise, clockwise the tone.", panel_scale={"min": -5, "max": 5}, manual_ref=12)
    par(f"{c}.lfo_on", f"{c}_osc", "LFO ON/OFF", "boolean", "Lets the master LFO reach this channel.", control="toggle_switch", manual_ref=13)
    par(f"{c}.effect_range", f"{c}_osc", "EFFECT RANGE", "continuous", "Depth of the LFO and RUN effects on this channel.", panel_scale=S10, manual_ref=14)
    par(f"{c}.run_on", f"{c}_osc", "RUN ON/OFF", "boolean", "Lets RUN reach this channel; its triggers also step RUN.", control="toggle_switch", manual_ref=15)
    par(f"{c}.level", f"{c}_vca", "CHANNEL LEVEL", "continuous", "Level at the channel output and in the mix.", control="fader", panel_scale=S10, manual_ref=16)
    par(f"{c}.velocity", f"{c}_vca", "velocity", "boolean", "Whether trigger velocity sets the channel's loudness.", default=True,
        access=[{"type": "app", "note": "SynthTribe"}])
    par(f"{c}.decay_kill", f"{c}_env", "decay kill enable", "boolean", "Whether DECAY KILL acts on this channel.",
        access=[{"type": "app", "note": "SynthTribe"}])

    con(f"{c}_trig.gate", f"{c}_env.gate", "gate")
    con(f"midi.trig{n}", f"{c}_trig.midi_in", "gate", note=f"MIDI note {['C1', 'D1', 'E1', 'F1'][n - 1]}.")
    con("pitch.cv", f"{c}_osc.pitch_cv", "cv", amount="pitch.overall")
    con("pitch.cv", f"{c}_nflt.cutoff_cv", "cv", amount="pitch.overall", confidence="inferred")
    con(f"{c}_env.out", f"{c}_osc.pitch_cv", "cv", amount=f"{c}.bend", note="Polarity set by UP/DOWN.", confidence="inferred")
    con(f"{c}_noise.out", f"{c}_nflt.in")
    con(f"{c}_osc.out", f"{c}_mix.tone")
    con(f"{c}_nflt.out", f"{c}_mix.noise")
    con(f"{c}_mix.out", f"{c}_lpf.in", confidence="inferred")
    con(f"{c}_env.out", f"{c}_lpf.cutoff_cv", "cv", amount=f"{c}.click", confidence="inferred")
    con(f"{c}_lpf.out", f"{c}_vca.in")
    con(f"{c}_env.out", f"{c}_vca.cv", "cv", amount=f"{c}.level")
    con("lfo.out", f"{c}_osc.pitch_cv", "cv", {"all": [eq("lfo.on", True), eq(f"{c}.lfo_on", True)]}, amount=f"{c}.effect_range",
        confidence="inferred", note="The guide says the LFO 'affects the channel'; pitch is the assumed destination.")
    con("run.out", f"{c}_osc.pitch_cv", "cv", {"all": [eq("run.on", True), eq(f"{c}.run_on", True)]}, amount=f"{c}.effect_range", confidence="inferred")
    con(f"{c}_trig.gate", "run.trig", "gate", {"all": [eq("run.on", True), eq(f"{c}.run_on", True)]})
    con("kill.out", f"{c}_env.kill", "gate", eq(f"{c}.decay_kill", True))
    con(f"{c}_vca.out", "out.mix_in", amount="out.level")

    jack(f"jack.{c}_mic_in", f"MIC IN {n}", "top", "in", "audio", f"{c}_trig.mic_in", "Microphone or other trigger source; velocity sensitive.", "3.5 mm TS", manual_ref=1)
    jack(f"jack.{c}_out", f"CHANNEL OUT {n}", "top", "out", "audio", f"{c}_vca.out", "Individual channel output.", "3.5 mm TS", manual_ref=2)
    jack(f"jack.{c}_mic_out", f"MIC OUT {n}", "top", "out", "audio", f"{c}_trig.mic_thru", "Passes the MIC IN signal on.", "3.5 mm TS", manual_ref=3)
    I.append({"id": f"{c}.trigger_led", "module": f"{c}_trig", "label": f"TRIGGER LED {n}", "kind": "led",
              "function": "Lights on a trigger from the mic input or MIDI."})

# ---------------- master ----------------
mod("pitch", "pitch_control", "Overall pitch", "MASTER/EFFECTS", "Scales all channels' pitch from 25% to 400%; at the centre the PITCH PEDAL takes over.",
    ["pitch.pedal"], ["pitch.cv"], props={"range_pct": [25, 400]})
mod("lfo", "lfo", "LFO", "MASTER/EFFECTS", "Square or sine LFO, 0.1-20 Hz (SLOW) or 20 Hz-4.3 kHz (FAST, usable for basic FM).",
    [], ["lfo.out"], props={"rate_hz": {"slow": [0.1, 20], "fast": [20, 4300]}, "waveforms": ["square", "sine"]})
mod("run", "sample_hold", "RUN", "MASTER/EFFECTS",
    "Sample and hold that takes a new sample each time a RUN-enabled channel is triggered. RUN TIME sets how many samples are taken before the sampled wave resets.",
    ["run.trig"], ["run.out"])
mod("kill", "gate_logic", "Decay kill", "(rear panel)", "Footswitch or MIDI CC 80 that cuts the decay short on enabled channels.", ["kill.in"], ["kill.out"])
mod("midi", "midi_to_cv", "MIDI and USB MIDI", "(rear panel)", "Triggers channels from notes C1, D1, E1, F1; pitch by CC 20-23; decay kill by CC 80.",
    [], ["midi.trig1", "midi.trig2", "midi.trig3", "midi.trig4"])
mod("out", "output", "Output", "MASTER/EFFECTS", "Mix of the four channels at OUTPUT LEVEL, on the top MIX OUT and rear OUTPUT.", ["out.mix_in"], ["out.mix"])

par("pitch.overall", "pitch", "OVERALL PITCH", "continuous", "Base pitch of all channels, 25% to 400%; centre hands control to the pitch pedal.", control="fader",
    panel_scale={"min": -5, "max": 5}, physical={"min": 25, "max": 400, "unit": "%"}, manual_ref=20)
par("lfo.rate", "lfo", "LFO RATE", "continuous", "LFO rate within the selected range.", panel_scale=S10, manual_ref=21)
par("lfo.range", "lfo", "LFO RANGE", "enum", "SLOW 0.1-20 Hz or FAST 20 Hz-4.3 kHz.", control="toggle_switch", values=[{"value": "slow"}, {"value": "fast"}], manual_ref=22)
par("lfo.shape", "lfo", "LFO SHAPE", "enum", "LFO waveform.", control="toggle_switch", values=[{"value": "square"}, {"value": "sine"}], manual_ref=23)
par("lfo.on", "lfo", "LFO ON/OFF", "boolean", "Master LFO on or off.", control="toggle_switch", manual_ref=24)
par("run.on", "run", "RUN ON/OFF", "boolean", "RUN effect on or off.", control="toggle_switch", manual_ref=25)
par("run.time", "run", "RUN TIME", "continuous", "How many samples RUN takes before resetting.", panel_scale=S10, manual_ref=26)
par("out.level", "out", "OUTPUT LEVEL", "continuous", "Master level at MIX OUT and OUTPUT.", control="fader", panel_scale=S10, manual_ref=27)
par("midi.channel", "midi", "MIDI CHANNEL SELECT", "integer", "MIDI receive channel, 1-16.", range={"min": 1, "max": 16},
    access=[{"type": "rear_panel", "control": "dip_switches_x4"}], manual_ref=31)
par("kill.cc", "kill", "decay kill (MIDI)", "boolean", "Decay kill by MIDI.", access=[{"type": "midi", "message": "CC 80"}])

jack("jack.mix_out", "MIX OUT", "top", "out", "audio", "out.mix", "Mix of the four channels; same as the rear OUTPUT.", "3.5 mm TS", manual_ref=17)
jack("jack.output", "OUTPUT", "rear", "out", "audio", "out.mix", "Master output, unbalanced.", "6.35 mm TS", manual_ref=28)
for jid, loc, conn, ref in (("jack.pitch_pedal_top", "top", "3.5 mm TRS", 18), ("jack.pitch_pedal_rear", "rear", "6.35 mm TRS", 29)):
    jack(jid, "PITCH PEDAL", loc, "in", "cv", "pitch.pedal",
         "Expression pedal (e.g. FC600): the tip sends an internal voltage to the pedal, the ring returns it. Acts when OVERALL PITCH is centred.",
         conn, manual_ref=ref, combine="replace")
jack("jack.decay_kill", "DECAY KILL", "rear", "in", "gate", "kill.in", "Footswitch that cuts off the decay.", "6.35 mm TS", manual_ref=30)
jack("jack.midi_in", "MIDI IN", "top", "in", "midi", None, "Channel triggering and pitch over MIDI.", "5-pin DIN", manual_ref=19)
jack("jack.midi_thru", "MIDI THRU", "rear", "out", "midi", None, "Mirrors MIDI IN.", "5-pin DIN", manual_ref=32)
jack("jack.usb", "USB", "rear", "bidirectional", "midi", None, "Class-compliant USB MIDI, SynthTribe and firmware updates.", "USB 2.0 type B", manual_ref=33)
jack("jack.dc_in", "DC INPUT", "rear", "in", "power", None, "12 V DC, 1000 mA supply.", "DC barrel", manual_ref=35)
jack("jack.eurorack", "Eurorack power", "rear", "in", "power", None, "10-pin header; a 10-to-16-pin ribbon is supplied. Draws 800 mA from +12 V.", "10-pin IDC header")
par("sys.power", "out", "POWER BUTTON", "boolean", "Power on or off.", access=[{"type": "rear_panel", "control": "push_button"}], manual_ref=34)

D["modules"], D["parameters"], D["ports"], D["connections"], D["indicators"] = M, P, J, C, I
D["behaviours"] = [
    {"id": "b01", "name": "Triggering", "applies_to": ["ch1_trig", "ch2_trig", "ch3_trig", "ch4_trig", "midi"],
     "rule": "Each channel fires from sound at its MIC IN once it passes MIC SENSITIVITY, louder sound giving a louder hit, or from its MIDI note "
             "(C1, D1, E1, F1 on the DIP-switch channel), with velocity setting loudness unless disabled in SynthTribe. MIC OUT passes the "
             "microphone on so the acoustic drum can still be recorded."},
    {"id": "b02", "name": "Tone and noise", "applies_to": ["ch1_osc", "ch2_osc", "ch3_osc", "ch4_osc"],
     "rule": "The tone is a self-oscillating diode ladder filter. PITCH sets its frequency and opens the noise filter together, so higher "
             "pitches give brighter noise. BALANCE mixes the two, from noise only to tone only."},
    {"id": "b03", "name": "Bend", "applies_to": ["ch1_osc", "ch2_osc", "ch3_osc", "ch4_osc"],
     "rule": "Each hit starts above (DOWN) or below (UP) the PITCH setting by BEND LEVEL and sweeps to it: the classic falling or rising "
             "synth-tom sweep. Fully anticlockwise gives a steady pitch.", "confidence": "inferred",
     "note": "The guide says the pitch bends 'until the required frequency is reached'; the sweep following the decay envelope is assumed."},
    {"id": "b04", "name": "Impact click", "applies_to": ["ch1_lpf", "ch2_lpf", "ch3_lpf", "ch4_lpf"],
     "rule": "Adds a stick-like attack. Turning it up opens the low-pass cutoff at the start of the sound, making the click louder and brighter."},
    {"id": "b05", "name": "Master effects", "applies_to": ["lfo", "run", "pitch"],
     "rule": "OVERALL PITCH scales every channel from 25% to 400%; at its centre the pitch pedal takes over. The LFO (square or sine, SLOW to "
             "20 Hz or FAST to 4.3 kHz for FM-like tones) and RUN reach only channels with their switches on, by each channel's EFFECT RANGE."},
    {"id": "b06", "name": "RUN", "applies_to": ["run"],
     "rule": "A sample and hold clocked by the triggers of RUN-enabled channels: each hit takes a new sample, so successive hits step through "
             "values. RUN TIME sets how many samples are taken before the sampled wave resets.", "confidence": "inferred",
     "note": "What is sampled is not stated."},
    {"id": "b07", "name": "Decay kill", "applies_to": ["kill", "ch1_env", "ch2_env", "ch3_env", "ch4_env"],
     "rule": "The DECAY KILL footswitch or MIDI CC 80 overrides DECAY TIME and cuts the sound off, on channels enabled in SynthTribe."},
    {"id": "b08", "name": "Warm-up", "applies_to": ["ch1_osc", "ch2_osc", "ch3_osc", "ch4_osc"],
     "rule": "Allow 15 minutes or more, longer from cold, before recording or performance."},
]
D["midi"] = {
    "receives": [
        {"message": "note_on", "note_numbers": {"C1": "channel 1", "D1": "channel 2", "E1": "channel 3", "F1": "channel 4"}, "velocity": "loudness (can be disabled)"},
        {"message": "control_change", "cc": 20, "parameter": "ch1.pitch"}, {"message": "control_change", "cc": 21, "parameter": "ch2.pitch"},
        {"message": "control_change", "cc": 22, "parameter": "ch3.pitch"}, {"message": "control_change", "cc": 23, "parameter": "ch4.pitch"},
        {"message": "control_change", "cc": 80, "parameter": "decay kill"}],
    "transmits": [], "channel_note": "Receive channel 1-16 set by rear DIP switches; MIDI THRU mirrors MIDI IN; USB MIDI is class compliant.",
    "note": "Note-number octave convention for C1 is not stated (36 under the C1 = 36 convention, 24 under C-1 = 0)."}
D["specifications"] = {
    "voices": "4 x monophonic", "type": "analogue", "oscillators": "4 self-oscillating diode ladder filters / 4 x white noise", "lfo": 1, "run": "1 S&H",
    "decay_s": [0.05, 7], "pitch_hz": "below 20 to over 30000", "overall_pitch_pct": [25, 400], "lfo_hz": {"slow": [0.1, 20], "fast": [20, 4300]},
    "connectivity": {"midi": "In and Thru, 5-pin DIN", "usb": "USB 2.0 type B, class compliant",
                     "audio_out": "3.5 mm TS mix, 4 x 3.5 mm TS channel, 6.35 mm TS rear", "mic_in": "4 x 3.5 mm TS", "mic_out": "4 x 3.5 mm TS",
                     "pitch_pedal": "3.5 mm TRS top / 6.35 mm TRS rear", "decay_kill": "6.35 mm TS rear"},
    "power": {"psu": "12 V DC, 1000 mA", "eurorack": "800 mA on +12 V"}, "eurorack_hp": 70,
    "dimensions_mm": {"h": 95, "w": 375, "d": 136}, "weight_kg": 1.51, "operating_temp_c": [5, 45],
}
D["omitted_from_source"] = ["safety, warranty and legal text", "hook-up diagrams", "Eurorack installation steps beyond power requirements",
                            "the blank patch sheet templates", "non-English translations"]
D["not_in_source"] = [
    "what LFO and RUN modulate (pitch is assumed) and what RUN samples",
    "how the bend is generated and its time",
    "whether the tone and noise share one diode ladder filter or use two",
    "the impact click circuit and the click filter's slope",
    "trigger threshold behaviour, velocity curve and MIDI note-off handling",
    "MIDI CC value scaling and whether panel moves are sent anywhere",
    "the noise filter's type and slope",
]
D["source_inconsistencies"] = [
    "The title promises a 'Special Effects Channel', but the guide describes four channels and a master/effects section, not a fifth channel.",
    "The TRIGGER LED description refers to triggers 'over MIDI (3)', but callout 3 is the MIC OUT socket.",
    "Dimensions are 95 x 375 x 136 mm in the guide and 374 x 136 x 93 mm on Thomann.",
]
D["modelling_gaps"] = [
    {"topic": "Thin source", "detail": "A quick start guide only. The signal order (mix, click filter, VCA) and the modulation destinations are inferred from control descriptions."},
    {"topic": "Original instrument", "detail": "The Simmons SDS-3 attribution comes from retailers, not Behringer; an original SDS-3 manual or schematic would settle the inferred structure."},
    {"topic": "SynthTribe", "detail": "Per-channel pitch, velocity and decay kill settings exist in the app; further app-only options may follow firmware updates."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi",
         "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/behringer-bds-3_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
