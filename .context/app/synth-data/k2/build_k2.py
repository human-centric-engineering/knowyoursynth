#!/usr/bin/env python3
"""Assemble the Behringer K-2 device file."""
import json

D = {"schema_version": "0.5.0"}

D["device"] = {
    "id": "behringer-k-2",
    "manufacturer": "Behringer",
    "model": "K-2",
    "category": "semi-modular analogue synthesizer, desktop / Eurorack (80 HP)",
    "based_on": "Korg MS-20. The Behringer manual never names it; the module set, the patch panel and the "
                "high-pass plus low-pass filter pair are the MS-20's.",
    "sources": [
        {"id": "k2", "title": "K-2 Quick Start Guide", "kind": "quick_start_guide",
         "file": "Behringer_K-2_Quick_Start.pdf", "pages": 72, "version": "V 3.0", "year": 2022,
         "note": "Titled Quick Start Guide but carries 83 numbered controls, a Getting Started chapter that states "
                 "the default modulation routings, a patch-panel block diagram, a MIDI message table, poly chain "
                 "instructions and a full specifications table with envelope times and jack voltages."},
        {"id": "ms20", "title": "Korg MS-20 Owner's Manual", "kind": "user_manual",
         "file": "Korg_-_MS20_E.pdf", "pages": 44,
         "note": "A 44-page scan with no text layer, so not mined for this pass. It is the source that would settle "
                 "the Hz/V keyboard scaling, the two filter circuits and the patch-panel normalling."},
    ],
}

D["architecture"] = {
    "synthesis": "subtractive",
    "signal_path": "analogue",
    "voices": 1,
    "polyphony_mode": "monophonic; poly chain across multiple units",
    "poly_chain_max_units": 16,
    "patch_memory": False,
    "semi_modular": True,
    "panel_counts": {"knobs": 26, "switches": 5, "buttons": 1, "jacks_3_5mm": 27},
    "summary": (
        "Two VCOs (VCO1 triangle / reverse saw / pulse / noise, VCO2 reverse saw / square / narrow pulse / ring) "
        "into a two-channel mixer, then through a high-pass filter and a low-pass filter in series, then a VCA. "
        "Both filters are 24 dB/octave and a single switch picks between two filter circuits. Modulation comes from "
        "a modulation generator (LFO) with two simultaneous morphing waveform outputs, and two envelope generators: "
        "EG1 (delay, attack, release) is normalled to oscillator pitch, EG2 (hold, attack, decay, sustain, release) "
        "to both filter cutoffs and to the VCA. A 27-jack patch panel exposes the whole thing, plus a sample and "
        "hold, a spare VCA, pink and white noise, a manual trigger switch, and an external signal processor that "
        "band-passes an incoming signal and converts it to pitch CV, an envelope and a trigger."
    ),
}

# --------------------------------------------------------------------------
M = []


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m["inputs"] = inputs
    m["outputs"] = outputs
    M.append(m)


mod("kbd", "midi_to_cv", "Keyboard interface", "MIDI IN",
    "Turns incoming MIDI into pitch CV and a trigger. There is no keyboard on this model; notes arrive over the "
    "5-pin DIN or USB. The keyboard CV output is specified as 0 to +8 V and exponential, which is the MS-20's "
    "Hz per volt convention rather than the 1 V per octave used by most of the rest of the market.",
    [], ["kbd.cv", "kbd.trig"])

mod("portamento", "pitch_control", "Portamento", "CONTROLLERS",
    "Glide between successive notes, plus the master tune trim for the whole instrument.",
    ["portamento.in"], ["portamento.out"])

mod("pitch_bus", "pitch_control", "Oscillator pitch bus", "PATCH BAY",
    "Where keyboard CV meets the two pitch patch points. VCO 1+2 CV IN drives both oscillators; VCO 2 CV IN drives "
    "only VCO2, which is how you detune or sequence the second oscillator on its own.",
    ["pitch_bus.kbd_in", "pitch_bus.cv_1_2_in", "pitch_bus.cv_2_in"],
    ["pitch_bus.to_vco1", "pitch_bus.to_vco2"])

mod("vco1", "oscillator", "Voltage Controlled Oscillator 1", "VOLTAGE CONTROLLED OSCILLATOR 1",
    "Primary oscillator. One waveform at a time from a four-position switch, one position of which is noise rather "
    "than a wave. Pulse width is adjustable when pulse is selected. Four octave scales from 32' to 4'.",
    ["vco1.pitch_in", "vco1.fm_mg_in", "vco1.fm_eg1_in", "vco1.noise_in"], ["vco1.out"],
    {"waveforms": ["triangle", "reverse_sawtooth", "pulse", "noise"], "scales": ["32'", "16'", "8'", "4'"],
     "frequency_hz": {"min": 16, "max": 1500, "note": "specifications give 16 Hz to 1.5 kHz at 8' with four overlapping ranges"}})

mod("vco2", "oscillator", "Voltage Controlled Oscillator 2", "VOLTAGE CONTROLLED OSCILLATOR 2",
    "Second oscillator, one octave up in scale range. Its fourth waveform position is RING, which is not a waveform "
    "at all but a ring modulation of the two oscillators. Its pitch can be offset independently of VCO1.",
    ["vco2.pitch_in", "vco2.fm_mg_in", "vco2.fm_eg1_in", "vco2.ring_in"], ["vco2.out"],
    {"waveforms": ["reverse_sawtooth", "square", "narrow_pulse", "ring"], "scales": ["16'", "8'", "4'", "2'"]})

mod("mixer", "mixer", "VCO Mixer", "VCO MIXER",
    "Two level controls, one per oscillator, summed into the filter chain.",
    ["mixer.in_vco1", "mixer.in_vco2"], ["mixer.out"])

mod("mod_bus", "modulation_bus", "Modulation depth controls",
    "FREQUENCY MODULATION / CUTOFF FREQUENCY MODULATION",
    "Six depth knobs in two panel sections. Each knob has a fixed source and a patch point that substitutes for it: "
    "the MG knobs take the modulation generator unless TOTAL is patched, the EG1 knob takes envelope 1 unless FREQ "
    "is patched, and each filter's EG2 knob takes envelope 2 unless that filter's CUTOFF FREQ jack is patched. "
    "TOTAL substitutes for the modulation generator in all four MG knobs at once, which is why it is called TOTAL.",
    ["mod_bus.mg_in", "mod_bus.eg1_in", "mod_bus.eg2_hp_in", "mod_bus.eg2_lp_in"],
    ["mod_bus.mg_out", "mod_bus.eg1_out", "mod_bus.eg2_hp_out", "mod_bus.eg2_lp_out"])

mod("vcf_hp", "filter", "High-pass filter", "VOLTAGE CONTROLLED FILTER",
    "24 dB/octave high-pass, attenuating below its cutoff. First filter in the chain, so it thins the fundamental "
    "and the lower harmonics before the low-pass gets the signal. PEAK is its resonance.",
    ["vcf_hp.in", "vcf_hp.cutoff_mg_in", "vcf_hp.cutoff_eg2_in"], ["vcf_hp.out"],
    {"slope_db_per_octave": 24, "modes": ["highpass"], "cutoff_hz": {"min": 10, "max": 20000}})

mod("vcf_lp", "filter", "Low-pass filter", "VOLTAGE CONTROLLED FILTER",
    "24 dB/octave low-pass, attenuating above its cutoff. The FILTER 1/2 switch selects between two filter circuits; "
    "the manual does not say what distinguishes them.",
    ["vcf_lp.in", "vcf_lp.cutoff_mg_in", "vcf_lp.cutoff_eg2_in"], ["vcf_lp.out"],
    {"slope_db_per_octave": 24, "modes": ["lowpass"], "cutoff_hz": {"min": 10, "max": 20000},
     "circuits": ["filter 1", "filter 2"]})

mod("vca", "vca", "Voltage Controlled Amplifier", "VOLTAGE CONTROLLED AMPLIFIER",
    "Main amplifier at the end of the chain, opened by envelope 2. The INITIAL GAIN patch point is its modulation "
    "input.",
    ["vca.in", "vca.gain_in"], ["vca.out"])

mod("vca_patch", "vca", "Patch panel VCA", "PATCH BAY",
    "A second amplifier reachable only from the patch panel, with its own in, control in and out. The manual lists "
    "it separately from the main VCA block and the block diagram draws it as its own box in the lower row, so this "
    "file treats it as a distinct module.",
    ["vca_patch.in", "vca_patch.ctrl_in"], ["vca_patch.out"])

mod("mg", "lfo", "Modulation Generator", "MODULATION GENERATOR",
    "The LFO. Two outputs run at once and one WAVEFORM knob shapes both: the first sweeps reverse sawtooth to "
    "triangle to sawtooth, the second sweeps wide pulse to square to narrow pulse. The first is bipolar at "
    "plus and minus 2.5 V, the second unipolar 0 to +5 V.",
    [], ["mg.tri_saw_out", "mg.pulse_out"],
    {"rate_hz": {"min": 0.1, "max": 22}, "simultaneous_outputs": 2})

mod("eg1", "envelope", "Envelope Generator 1", "ENVELOPE GENERATOR",
    "Delay, attack and release. Normalled to oscillator pitch, so its natural job is pitch sweeps. It has its own "
    "trigger input on the patch panel, separate from the global one.",
    ["eg1.gate_in"], ["eg1.out", "eg1.rev_out"],
    {"stages": ["delay", "attack", "release"], "output_v": {"min": 0, "max": 5}})

mod("eg2", "envelope", "Envelope Generator 2", "ENVELOPE GENERATOR",
    "Hold, attack, decay, sustain and release. Normalled to both filter cutoffs and to the VCA, so it is the main "
    "shaping envelope. Only its reversed output appears on the patch panel.",
    ["eg2.gate_in"], ["eg2.out", "eg2.rev_out"],
    {"stages": ["hold", "attack", "decay", "sustain", "release"], "output_v": {"min": -2.5, "max": 2.5}})

mod("trigger_bus", "gate_logic", "Trigger routing", "PATCH BAY",
    "Distributes the trigger that fires both envelopes. The keyboard trigger is the default source, the TRIG IN jack "
    "substitutes for it, TRIG OUT taps it for other gear, and the TRIG SW button generates one by hand. TRIG SW is "
    "also how poly chain mode is entered.",
    ["trigger_bus.kbd_in"], ["trigger_bus.out", "trigger_bus.sw_out"])

mod("noise", "noise", "Noise Generator", "NOISE GENERATOR",
    "Pink and white noise on separate outputs, both always available. White noise is also one of VCO1's four "
    "waveform positions.",
    [], ["noise.pink", "noise.white"])

mod("sample_hold", "sample_hold", "Sample & Hold", "SAMPLE & HOLD",
    "Samples whatever is at its input each time a clock arrives and holds that value. Patch-only: the manual shows "
    "no pre-wired source for either its input or its clock, so it does nothing until cabled.",
    ["sample_hold.in", "sample_hold.clock_in"], ["sample_hold.out"])

mod("esp_preamp", "preamp", "External Signal Processor preamp", "EXTERNAL SIGNAL PROCESSOR",
    "Brings an external signal up to synth level. SIGNAL LEVEL sets the gain and its output is available before the "
    "band-pass filter.",
    ["esp_preamp.in"], ["esp_preamp.out"])

mod("esp_bpf", "filter", "External Signal Processor band-pass", "EXTERNAL SIGNAL PROCESSOR",
    "Band-pass made from a low cut and a high cut control, used to isolate the part of the external signal that the "
    "pitch and envelope extractors should follow. Its output is available on its own jack.",
    ["esp_bpf.in"], ["esp_bpf.out"],
    {"modes": ["bandpass"], "controls": ["low cut", "high cut"]})

mod("esp_fv", "frequency_to_voltage", "Frequency to voltage converter", "EXTERNAL SIGNAL PROCESSOR",
    "Tracks the pitch of the band-passed external signal and produces a control voltage from it, so an external "
    "instrument can play the oscillators. CV ADJUST scales the result.",
    ["esp_fv.in"], ["esp_fv.out"],
    {"output_v": {"min": 0, "max": 8}})

mod("esp_env", "envelope_follower", "Envelope follower", "EXTERNAL SIGNAL PROCESSOR",
    "Produces a control voltage tracking the amplitude of the external signal. The PEAK LED shows when the input is "
    "peaking.",
    ["esp_env.in"], ["esp_env.out"],
    {"output_v": {"min": 0, "max": 5}})

mod("esp_trig", "gate_logic", "External signal trigger extractor", "EXTERNAL SIGNAL PROCESSOR",
    "Fires a trigger whenever the external signal crosses the threshold set by THRESHOLD LEVEL, turning a drum "
    "track or a played note into something that can fire the envelopes. Its own LED shows the trigger.",
    ["esp_trig.in"], ["esp_trig.out"])

mod("output", "output", "Output", "GENERAL",
    "Master volume feeding the 3.5 mm SIGNAL OUT, the rear 1/4-inch OUTPUT and the headphone socket.",
    ["output.in"], ["output.main", "output.phones"])

D["modules"] = M

# --------------------------------------------------------------------------
P = []


def par(id, module, label, kind, function, ref=None, **kw):
    p = {"id": id, "module": module, "label": label}
    if ref is not None:
        p["manual_ref"] = ref
    p["kind"] = kind
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", [{"type": "panel", "control": "knob"}])
    p["function"] = function
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


KN = [{"type": "panel", "control": "knob"}]
SW = [{"type": "panel", "control": "rotary_switch"}]
SL = [{"type": "panel", "control": "slide_switch"}]
BT = [{"type": "panel", "control": "button"}]
S10 = {"min": 0, "max": 10}

par("vco1.waveform", "vco1", "WAVEFORM", "enum",
    "Selects the VCO1 waveform. The fourth position is noise rather than a wave, which replaces the oscillator with "
    "the noise generator in the mix.",
    ref=1, access=SW,
    values=[{"value": "triangle", "label": "triangular"}, {"value": "reverse_sawtooth", "label": "reverse sawtooth"},
            {"value": "pulse", "label": "pulse"}, {"value": "noise", "label": "noise"}])
par("vco1.pulse_width", "vco1", "PW", "continuous",
    "Pulse width, from square at one end to a narrow pulse at the other. Only has an effect with the pulse waveform "
    "selected. There is no pulse width modulation input anywhere on the instrument.",
    ref=2, panel_scale={"min": 0, "max": 10, "unit": "square to narrow"})
par("vco1.scale", "vco1", "SCALE", "enum",
    "Octave range for VCO1.",
    ref=3, access=SW,
    values=[{"value": "32'"}, {"value": "16'"}, {"value": "8'"}, {"value": "4'"}])
par("vco2.waveform", "vco2", "WAVEFORM", "enum",
    "Selects the VCO2 waveform. The RING position is not a waveform: it replaces VCO2's output with the ring "
    "modulation of the two oscillators, so both are used to make one sound.",
    ref=4, access=SW,
    values=[{"value": "reverse_sawtooth", "label": "reverse sawtooth"}, {"value": "square", "label": "square"},
            {"value": "narrow_pulse", "label": "narrow pulse"},
            {"value": "ring", "label": "RING", "meaning": "ring modulation of VCO1 and VCO2"}])
par("vco2.pitch", "vco2", "PITCH", "continuous",
    "Offsets VCO2's pitch relative to VCO1, for detuning or interval tuning. The span in semitones is not stated.",
    ref=5, panel_scale={"min": -5, "max": 5, "unit": "unspecified"}, bipolar=True)
par("vco2.scale", "vco2", "SCALE", "enum",
    "Octave range for VCO2, one octave higher across the board than VCO1's.",
    ref=6, access=SW,
    values=[{"value": "16'"}, {"value": "8'"}, {"value": "4'"}, {"value": "2'"}])

par("portamento.time", "portamento", "PORTAMENTO", "continuous",
    "Glide time between notes.",
    ref=7, panel_scale=S10)
par("portamento.master_tune", "portamento", "MASTER TUNE", "continuous",
    "Overall tuning of the instrument.",
    ref=8, panel_scale={"min": -5, "max": 5, "unit": "unspecified"}, bipolar=True)

par("mixer.vco1_level", "mixer", "VCO1 LEVEL", "continuous", "VCO1 level into the mixer.", ref=9, panel_scale=S10)
par("mixer.vco2_level", "mixer", "VCO2 LEVEL", "continuous", "VCO2 level into the mixer.", ref=10, panel_scale=S10)

par("mod_bus.freq_mg", "mod_bus", "MG/T.EXT (frequency)", "continuous",
    "Depth of oscillator frequency modulation from the modulation generator, or from whatever is patched into "
    "TOTAL, which substitutes for it.",
    ref=11, panel_scale=S10)
par("mod_bus.freq_eg1", "mod_bus", "EG1/EXT (frequency)", "continuous",
    "Depth of oscillator frequency modulation from envelope 1, or from whatever is patched into FREQ.",
    ref=12, panel_scale=S10)
par("mod_bus.hp_mg", "mod_bus", "MG/T.EXT (high-pass cutoff)", "continuous",
    "Depth of high-pass cutoff modulation from the modulation generator, or from TOTAL.",
    ref=18, panel_scale=S10)
par("mod_bus.hp_eg2", "mod_bus", "EG2/EXT (high-pass cutoff)", "continuous",
    "Depth of high-pass cutoff modulation from envelope 2, or from the high-pass CUTOFF FREQ jack.",
    ref=19, panel_scale=S10)
par("mod_bus.lp_mg", "mod_bus", "MG/T.EXT (low-pass cutoff)", "continuous",
    "Depth of low-pass cutoff modulation from the modulation generator, or from TOTAL.",
    ref=20, panel_scale=S10)
par("mod_bus.lp_eg2", "mod_bus", "EG2/EXT (low-pass cutoff)", "continuous",
    "Depth of low-pass cutoff modulation from envelope 2, or from the low-pass CUTOFF FREQ jack.",
    ref=21, panel_scale=S10)

par("vcf_hp.cutoff", "vcf_hp", "CUTOFF FREQUENCY (high-pass)", "continuous",
    "High-pass cutoff. Everything below it is attenuated, which thins out the fundamental.",
    ref=13, panel_scale=S10, physical={"min": 10, "max": 20000, "unit": "Hz", "taper": "unknown"})
par("vcf_hp.peak", "vcf_hp", "PEAK (high-pass)", "continuous",
    "High-pass resonance: emphasis at the cutoff frequency.",
    ref=14, panel_scale=S10)
par("vcf_lp.cutoff", "vcf_lp", "CUTOFF FREQUENCY (low-pass)", "continuous",
    "Low-pass cutoff. Everything above it is attenuated.",
    ref=15, panel_scale=S10, physical={"min": 10, "max": 20000, "unit": "Hz", "taper": "unknown"})
par("vcf_lp.peak", "vcf_lp", "PEAK (low-pass)", "continuous",
    "Low-pass resonance: emphasis at the cutoff frequency.",
    ref=16, panel_scale=S10)
par("vcf_lp.filter_type", "vcf_lp", "FILTER 1/2", "enum",
    "Selects between two filter circuits. The manual says only 'filter type 1 or 2' and never explains the "
    "difference; on the MS-20 this is the early Korg 35 design versus the later one, and they sound audibly "
    "different at high resonance. The switch governs both filters, not just the low-pass.",
    ref=17, access=SL,
    values=[{"value": "1", "label": "FILTER 1"}, {"value": "2", "label": "FILTER 2"}],
    confidence="inferred",
    note="That it applies to both filters, and what the two circuits are, are both inferred; the manual says neither.")

par("mg.waveform", "mg", "WAVEFORM", "morph",
    "One knob shapes both modulation generator outputs at once. Sweeping it takes the first output from reverse "
    "sawtooth through triangle to sawtooth, and simultaneously takes the second from wide pulse through square to "
    "narrow pulse. The two outputs are always both live on their own jacks.",
    ref=24, panel_scale=S10,
    values=[{"value": "reverse_sawtooth", "meaning": "output 1 fully counter-clockwise; output 2 is a wide pulse"},
            {"value": "triangle", "meaning": "output 1 at centre; output 2 is a square"},
            {"value": "sawtooth", "meaning": "output 1 fully clockwise; output 2 is a narrow pulse"}])
par("mg.frequency", "mg", "FREQUENCY", "continuous",
    "Modulation generator rate.",
    ref=25, panel_scale=S10, physical={"min": 0.1, "max": 22, "unit": "Hz", "taper": "unknown"})

par("eg1.delay", "eg1", "DELAY TIME", "continuous",
    "Time between the trigger arriving and the attack starting.",
    ref=26, panel_scale=S10, physical={"min": 0, "max": 5.5, "unit": "s", "taper": "unknown"})
par("eg1.attack", "eg1", "ATTACK TIME", "continuous",
    "Time for envelope 1 to reach maximum after a note is played.",
    ref=27, panel_scale=S10, physical={"min": 0.003, "max": 16, "unit": "s", "taper": "unknown"})
par("eg1.release", "eg1", "RELEASE TIME", "continuous",
    "Fall time after the note is released.",
    ref=28, panel_scale=S10, physical={"min": 0.03, "max": 16, "unit": "s", "taper": "unknown"})
par("eg2.hold", "eg2", "HOLD TIME", "continuous",
    "The manual describes this as extending how long the trigger signal is held, which would affect both envelopes; "
    "the specifications list it as envelope generator 2's hold time. Modelled here on EG2, following the "
    "specifications.",
    ref=29, panel_scale=S10, physical={"min": 0, "max": 14, "unit": "s", "taper": "unknown"},
    note="The two statements in the manual disagree about what HOLD acts on. See source_inconsistencies.")
par("eg2.attack", "eg2", "ATTACK TIME", "continuous",
    "Attack time of envelope 2.",
    ref=30, panel_scale=S10, physical={"min": 0.0054, "max": 9, "unit": "s", "taper": "unknown"})
par("eg2.decay", "eg2", "DECAY TIME", "continuous",
    "Decay time after the attack completes.",
    ref=31, panel_scale=S10, physical={"min": 0.0005, "max": 15, "unit": "s", "taper": "unknown"})
par("eg2.sustain", "eg2", "SUSTAIN LEVEL", "continuous",
    "Level held after attack and decay for as long as the note is held.",
    ref=32, panel_scale=S10)
par("eg2.release", "eg2", "RELEASE TIME", "continuous",
    "Fall time after the note is released.",
    ref=33, panel_scale=S10, physical={"min": 0.04, "max": 18, "unit": "s", "taper": "unknown"})

par("output.volume", "output", "VOLUME", "continuous",
    "Overall output level of the synthesizer.",
    ref=35, panel_scale=S10)
par("trigger_bus.manual_switch", "trigger_bus", "TRIG SW", "boolean",
    "Generates a trigger by hand, available at TRIG SW OUT. Pressing it four times quickly after power-up, while "
    "the ON LED is flashing, toggles poly chain mode.",
    ref=64, access=BT)

par("esp_preamp.signal_level", "esp_preamp", "SIGNAL LEVEL", "continuous",
    "Input gain for the external signal.",
    ref=73, panel_scale=S10)
par("esp_bpf.low_cut", "esp_bpf", "LOW CUT FREQ", "continuous",
    "Lower edge of the external signal processor's band-pass filter.",
    ref=74, panel_scale=S10)
par("esp_bpf.high_cut", "esp_bpf", "HIGH CUT FREQ", "continuous",
    "Upper edge of the band-pass filter.",
    ref=75, panel_scale=S10)
par("esp_fv.cv_adjust", "esp_fv", "CV ADJUST", "continuous",
    "Scales the control voltage produced by the frequency to voltage converter, which is how you get an external "
    "instrument to track in tune when driving the oscillators.",
    ref=76, panel_scale=S10)
par("esp_trig.threshold", "esp_trig", "THRESHOLD LEVEL", "continuous",
    "Level the external signal must cross before a trigger is produced.",
    ref=77, panel_scale=S10)

par("kbd.midi_channel", "kbd", "MIDI CHANNEL", "integer",
    "MIDI receive channel, set by four rear DIP switches. The 16 combinations are printed in the manual.",
    ref=79, range={"min": 1, "max": 16},
    access=[{"type": "rear_panel", "control": "dip_switches_x4"}])
par("output.power", "output", "POWER", "boolean",
    "Turns the synthesizer on and off. Make all connections before switching on.",
    ref=82, access=[{"type": "rear_panel", "control": "toggle_switch"}])
par("kbd.poly_chain", "kbd", "Poly chain mode", "boolean",
    "Chains several units so they share notes. Entered or left by pressing TRIG SW four times quickly after "
    "power-up while the ON LED is flashing, and also configurable with Behringer's SynthTool application. The ON "
    "LED turns red while it is active.",
    access=[{"type": "gesture", "gesture": "press TRIG SW four times quickly after power-up, while the ON LED flashes", "when": "power_on"},
            {"type": "app", "note": "SynthTool.exe"}])

D["parameters"] = P

# --------------------------------------------------------------------------
D["indicators"] = [
    {"id": "output.on_led", "module": "output", "label": "ON", "kind": "led", "led_colour": "multi",
     "manual_ref": 34, "function":
        "Shows that power is applied and the rear switch is on, and doubles as the system mode display: amber for "
        "normal mode, red for poly chain mode. It flashes for a moment after power-up, which is the window in which "
        "TRIG SW toggles poly chain."},
    {"id": "mg.rate_led", "module": "mg", "label": "LED (modulation generator)", "kind": "led", "led_colour": "amber",
     "manual_ref": 23, "function": "Blinks at the modulation generator rate.",
     "led_colour_note": None},
    {"id": "eg.action_led", "module": "eg2", "label": "LED (envelope generator)", "kind": "led", "led_colour": "amber",
     "manual_ref": None, "function":
        "Shows envelope generator action. Listed in the specifications only; the numbered controls do not mention it."},
    {"id": "esp_env.peak_led", "module": "esp_env", "label": "PEAK", "kind": "led", "led_colour": "red",
     "manual_ref": 69, "function": "Lights when the external input signal is peaking."},
    {"id": "esp_trig.led", "module": "esp_trig", "label": "LED (trigger)", "kind": "led", "led_colour": "amber",
     "manual_ref": 71, "function": "Lights when the external signal processor is producing a trigger."},
]
for i in D["indicators"]:
    i.pop("led_colour_note", None)

D["led_legend"] = {
    "rule": "Only one LED on the K-2 carries a colour code: the ON LED, which reports the system mode as well as "
            "power. Every other indicator is single-colour and means only that the thing it sits next to is active.",
    "colours": [
        {"colour": "amber", "meaning": "normal mode", "modules": ["output"]},
        {"colour": "red", "meaning": "poly chain mode", "modules": ["output"]},
    ],
    "confidence": "stated",
    "note": "Taken from the System Mode LED table printed beside the poly chain instructions. The colours of the "
            "other LEDs are read from the panel artwork, not documented.",
}

# --------------------------------------------------------------------------
J = []


def jack(id, label, loc, direction, signal, node, function, ref=None, connector="3.5mm TS",
         electrical=None, combine=None, confidence=None, note=None):
    j = {"id": id, "label": label}
    if ref is not None:
        j["manual_ref"] = ref
    j.update({"location": loc, "direction": direction, "signal": signal, "connector": connector, "node": node})
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


V5 = {"min_v": -5, "max_v": 5}

jack("jack.midi_in", "MIDI IN", "top", "in", "midi", None,
     "Receives MIDI from a keyboard, sequencer or computer on the channel set at the rear.",
     ref=22, connector="DIN-5")
jack("jack.signal_out", "SIGNAL OUT", "top", "out", "audio", "output.main",
     "Main line-level audio output on a 3.5 mm jack.",
     ref=36, electrical={"max_level_dbu": 0, "impedance_ohm": 1000})
jack("jack.phones", "PHONES", "top", "out", "audio", "output.phones",
     "Headphone output. Turn the volume down before putting them on.",
     ref=37, connector="3.5mm TRS", electrical={"max_level_dbu": 6, "impedance_ohm": 22})

jack("jack.total", "TOTAL", "patch_in", "in", "cv", "mod_bus.mg_in",
     "Substitutes for the modulation generator in all four MG/T.EXT depth knobs at once, so one cable re-sources "
     "both oscillators and both filters.",
     ref=38, electrical=V5, combine="replace")
jack("jack.freq", "FREQ", "patch_in", "in", "cv", "mod_bus.eg1_in",
     "Substitutes for envelope 1 in the EG1/EXT frequency depth knob, modulating both oscillators.",
     ref=39, electrical={"min_v": -3, "max_v": 3,
                         "note": "specifications say -3 V to +3 V for the VCO 1+2 frequency input while the panel is printed -5 V to +5 V"},
     combine="replace")
jack("jack.ext_signal_in", "EXT SIGNAL IN", "patch_in", "in", "audio", "vcf_hp.in",
     "Injects external audio into the filter chain, joining the oscillator mix at the high-pass input.",
     ref=40, electrical={"max_vpp": 3}, combine="sum", confidence="inferred",
     note="The block diagram puts this jack on the line between the mixer and the high-pass filter. Whether it sums "
          "with the mixer or breaks it is not stated.")
jack("jack.cutoff_hp", "CUTOFF FREQ (high-pass)", "patch_in", "in", "cv", "mod_bus.eg2_hp_in",
     "Substitutes for envelope 2 in the high-pass EG2/EXT depth knob.",
     ref=41, electrical=V5, combine="replace")
jack("jack.cutoff_lp", "CUTOFF FREQ (low-pass)", "patch_in", "in", "cv", "mod_bus.eg2_lp_in",
     "Substitutes for envelope 2 in the low-pass EG2/EXT depth knob.",
     ref=42, electrical=V5, combine="replace")
jack("jack.initial_gain", "INITIAL GAIN", "patch_in", "in", "cv", "vca.gain_in",
     "Modulation input for the main VCA.",
     ref=43, electrical={"min_v": 0, "max_v": 5}, combine="unknown",
     note="The manual calls it a modulation input but does not say whether it adds to envelope 2 or replaces it.")

jack("jack.mg_out_tri", "MG OUT (reverse saw / triangle / saw)", "patch_out", "out", "cv", "mg.tri_saw_out",
     "First modulation generator output, shaped by the WAVEFORM knob. Bipolar.",
     ref=44, electrical={"min_v": -2.5, "max_v": 2.5, "vpp": 5})
jack("jack.mg_out_pulse", "MG OUT (wide pulse / square / narrow)", "patch_out", "out", "cv", "mg.pulse_out",
     "Second modulation generator output, shaped by the same WAVEFORM knob. Unipolar, so useful as a clock or gate.",
     ref=45, electrical={"min_v": 0, "max_v": 5})
jack("jack.eg1_out", "EG 1 OUT", "patch_out", "out", "cv", "eg1.out",
     "Envelope 1 output.", ref=46, electrical={"min_v": 0, "max_v": 5})
jack("jack.eg1_rev_out", "EG 1 REV OUT", "patch_out", "out", "cv", "eg1.rev_out",
     "Envelope 1 inverted: falls from +5 V to 0 where the normal output rises.",
     ref=47, electrical={"min_v": 0, "max_v": 5})
jack("jack.eg1_trig_in", "EG1 TRIG IN", "patch_in", "in", "gate", "eg1.gate_in",
     "Fires envelope 1 on its own, independently of the global trigger.",
     ref=48, electrical={"threshold": "to GND"})
jack("jack.eg2_rev_out", "EG 2 REV OUT", "patch_out", "out", "cv", "eg2.rev_out",
     "Envelope 2 inverted. There is no jack for envelope 2's normal output.",
     ref=49, electrical={"min_v": -2.5, "max_v": 2.5})
jack("jack.vco2_cv", "VCO 2 CV IN", "patch_in", "in", "cv", "pitch_bus.cv_2_in",
     "Pitch CV for VCO2 alone, which is how the second oscillator is played or sequenced separately.",
     ref=50, electrical={"min_v": 0, "max_v": 8}, combine="replace", confidence="inferred")
jack("jack.vco1_2_cv", "VCO 1+2 CV IN", "patch_in", "in", "cv", "pitch_bus.cv_1_2_in",
     "Pitch CV for both oscillators, substituting for the keyboard.",
     ref=51, electrical={"min_v": 0, "max_v": 8}, combine="replace", confidence="inferred")
jack("jack.kbd_cv_out", "KBD CV OUT", "patch_out", "out", "cv", "kbd.cv",
     "The keyboard control voltage, for driving other gear or patching back in.",
     ref=52, electrical={"min_v": 0, "max_v": 8, "response": "exponential",
                         "scaling": "Hz per volt (inferred from 'exponential' and from the MS-20 original; not stated)"},
     confidence="inferred")
jack("jack.trig_out", "TRIG OUT", "patch_out", "out", "gate", "trigger_bus.out",
     "The trigger that fires the envelopes, tapped for other gear.",
     ref=53, electrical={"level": "to GND"})
jack("jack.trig_in", "TRIG IN", "patch_in", "in", "gate", "trigger_bus.kbd_in",
     "External trigger, substituting for the keyboard's own.",
     ref=54, electrical={"level": "to GND"}, combine="replace")

jack("jack.sh_in", "S&H IN", "patch_in", "in", "cv_or_audio", "sample_hold.in",
     "Signal to be sampled.", ref=55, electrical={"vpp": 5})
jack("jack.sh_clock", "CLOCK", "patch_in", "in", "clock", "sample_hold.clock_in",
     "Clock telling the sample and hold when to take a reading.",
     ref=56, electrical={"level": "to GND"})
jack("jack.sh_out", "S&H OUT", "patch_out", "out", "cv", "sample_hold.out",
     "Stepped output of the sample and hold.", ref=57, electrical={"vpp": 5})

jack("jack.vca_in", "VCA IN", "patch_in", "in", "cv_or_audio", "vca_patch.in",
     "Input of the patch panel VCA.", ref=58, electrical=V5)
jack("jack.vca_ctrl", "VCA CONTROL INPUT", "patch_in", "in", "cv", "vca_patch.ctrl_in",
     "Gain control for the patch panel VCA.", ref=59, electrical={"min_v": 0, "max_v": 5})
jack("jack.vca_out", "VCA OUT", "patch_out", "out", "cv_or_audio", "vca_patch.out",
     "Output of the patch panel VCA. The manual calls it a control output, which does not match the block diagram "
     "or the specifications.",
     ref=60, electrical=V5)

jack("jack.noise_pink", "PINK", "patch_out", "out", "audio", "noise.pink",
     "Pink noise output.", ref=61, electrical={"vpp": 5})
jack("jack.noise_white", "WHITE", "patch_out", "out", "audio", "noise.white",
     "White noise output.", ref=62, electrical={"vpp": 5})
jack("jack.trig_sw_out", "TRIG SW OUT", "patch_out", "out", "gate", "trigger_bus.sw_out",
     "Output of the manual trigger switch.", ref=63, electrical={"level": "to GND"})

jack("jack.esp_in", "SIGNAL IN", "patch_in", "in", "audio", "esp_preamp.in",
     "External audio into the signal processor.", ref=65, electrical={"vpp": 3, "note": "auto pad system"})
jack("jack.esp_out_pre", "OUT (pre-filter)", "patch_out", "out", "audio", "esp_preamp.out",
     "The amplified external signal before the band-pass filter.",
     ref=66, electrical={"max_level_dbu": 0})
jack("jack.esp_out_post", "OUT (post-filter)", "patch_out", "out", "audio", "esp_bpf.out",
     "The external signal after the band-pass filter.",
     ref=67, electrical={"max_level_dbu": 0})
jack("jack.esp_fv_out", "F-V CV OUT", "patch_out", "out", "cv", "esp_fv.out",
     "Pitch CV extracted from the external signal, for playing the oscillators from an instrument or a voice.",
     ref=68, electrical={"min_v": 0, "max_v": 8})
jack("jack.esp_env_out", "ENV OUT", "patch_out", "out", "cv", "esp_env.out",
     "Envelope follower output tracking the loudness of the external signal.",
     ref=70, electrical={"min_v": 0, "max_v": 5})
jack("jack.esp_trig_out", "TRIG OUT (ESP)", "patch_out", "out", "gate", "esp_trig.out",
     "Trigger produced whenever the external signal crosses the threshold.",
     ref=72, electrical={"level": "to GND"})

jack("jack.output_quarter", "OUTPUT", "rear", "out", "audio", "output.main",
     "Main output on a 1/4-inch jack, for amplifiers and interfaces.",
     ref=78, connector="6.35mm TS, unbalanced", electrical={"max_level_dbu": 0, "impedance_ohm": 1000})
jack("jack.midi_thru", "MIDI THRU", "rear", "out", "midi", None,
     "Passes through whatever arrives at MIDI IN. This is how units are daisy-chained for poly chain.",
     ref=80, connector="DIN-5")
jack("jack.usb", "USB PORT", "rear", "bidirectional", "midi", None,
     "Class-compliant USB MIDI in and out, no driver needed on Windows or macOS.",
     ref=81, connector="USB-B")
jack("jack.dc_in", "DC INPUT", "rear", "in", "power", None,
     "12 V DC from the supplied adaptor only, which takes 100 to 240 V at 50 or 60 Hz.",
     ref=83, connector="barrel", electrical={"voltage_v": 12})

D["ports"] = J

# --------------------------------------------------------------------------
C = []


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


con("c01", "kbd.cv", "portamento.in", "cv", "fixed", amount="portamento.time")
con("c02", "portamento.out", "pitch_bus.kbd_in", "cv", "normalled", broken_by="jack.vco1_2_cv",
    note="Keyboard CV is the default pitch source for both oscillators. Patching VCO 1+2 CV IN takes over; patching "
         "VCO 2 CV IN takes over for VCO2 only. How the two patch points interact with each other is not documented.",
    confidence="inferred")
con("c03", "pitch_bus.to_vco1", "vco1.pitch_in", "cv", "fixed")
con("c04", "pitch_bus.to_vco2", "vco2.pitch_in", "cv", "fixed", amount="vco2.pitch")

con("c10", "mg.tri_saw_out", "mod_bus.mg_in", "cv", "normalled", broken_by="jack.total",
    note="The modulation generator's first output is the default source for all four MG/T.EXT knobs.")
con("c11", "eg1.out", "mod_bus.eg1_in", "cv", "normalled", broken_by="jack.freq")
con("c12", "eg2.out", "mod_bus.eg2_hp_in", "cv", "normalled", broken_by="jack.cutoff_hp")
con("c13", "eg2.out", "mod_bus.eg2_lp_in", "cv", "normalled", broken_by="jack.cutoff_lp")

con("c20", "mod_bus.mg_out", "vco1.fm_mg_in", "cv", "fixed", amount="mod_bus.freq_mg")
con("c21", "mod_bus.mg_out", "vco2.fm_mg_in", "cv", "fixed", amount="mod_bus.freq_mg")
con("c22", "mod_bus.mg_out", "vcf_hp.cutoff_mg_in", "cv", "fixed", amount="mod_bus.hp_mg")
con("c23", "mod_bus.mg_out", "vcf_lp.cutoff_mg_in", "cv", "fixed", amount="mod_bus.lp_mg")
con("c24", "mod_bus.eg1_out", "vco1.fm_eg1_in", "cv", "fixed", amount="mod_bus.freq_eg1")
con("c25", "mod_bus.eg1_out", "vco2.fm_eg1_in", "cv", "fixed", amount="mod_bus.freq_eg1")
con("c26", "mod_bus.eg2_hp_out", "vcf_hp.cutoff_eg2_in", "cv", "fixed", amount="mod_bus.hp_eg2")
con("c27", "mod_bus.eg2_lp_out", "vcf_lp.cutoff_eg2_in", "cv", "fixed", amount="mod_bus.lp_eg2")

con("c30", "vco1.out", "mixer.in_vco1", "audio", "fixed", amount="mixer.vco1_level")
con("c31", "vco2.out", "mixer.in_vco2", "audio", "fixed", amount="mixer.vco2_level")
con("c32", "vco1.out", "vco2.ring_in", "audio", "switched",
    enabled_when={"param": "vco2.waveform", "equals": "ring"},
    note="With RING selected, VCO2's output becomes the ring modulation of the two oscillators, so VCO1 feeds it.")
con("c33", "noise.white", "vco1.noise_in", "audio", "switched",
    enabled_when={"param": "vco1.waveform", "equals": "noise"},
    note="The noise position on VCO1's waveform switch substitutes noise for the oscillator. Which noise colour it "
         "uses is not stated; white is assumed.",
    confidence="inferred")
con("c34", "mixer.out", "vcf_hp.in", "audio", "fixed")
con("c35", "vcf_hp.out", "vcf_lp.in", "audio", "fixed")
con("c36", "vcf_lp.out", "vca.in", "audio", "fixed")
con("c37", "eg2.out", "vca.gain_in", "cv", "normalled", broken_by="jack.initial_gain",
    note="Envelope 2 opens the VCA. Whether the INITIAL GAIN jack replaces it or sums with it is not stated.",
    confidence="inferred")
con("c38", "vca.out", "output.in", "audio", "fixed", amount="output.volume")

con("c40", "kbd.trig", "trigger_bus.kbd_in", "gate", "normalled", broken_by="jack.trig_in")
con("c41", "trigger_bus.out", "eg1.gate_in", "gate", "fixed")
con("c42", "trigger_bus.out", "eg2.gate_in", "gate", "fixed")

con("c50", "esp_preamp.out", "esp_bpf.in", "audio", "fixed", amount="esp_preamp.signal_level")
con("c51", "esp_bpf.out", "esp_fv.in", "audio", "fixed")
con("c52", "esp_bpf.out", "esp_env.in", "audio", "fixed")
con("c53", "esp_bpf.out", "esp_trig.in", "audio", "fixed")

D["connections"] = C

# --------------------------------------------------------------------------
D["behaviours"] = [
    {"id": "b01", "name": "Patch panel overrides the internal wiring", "applies_to": ["mod_bus", "pitch_bus", "vca", "trigger_bus"],
     "rule": "The manual describes the patch panel as an interactive block diagram: the printed lines between blocks "
             "are the internal connections, and patching a cable into a jack overrides the connection drawn into it. "
             "Nothing needs patching for the instrument to make a sound."},
    {"id": "b02", "name": "Default modulation sources", "applies_to": ["mod_bus", "mg", "eg1", "eg2"],
     "rule": "With nothing patched, oscillator frequency is modulated by the modulation generator and envelope 1, "
             "and both filter cutoffs by the modulation generator and envelope 2. Each depth knob is labelled with "
             "both its internal source and the EXT that replaces it, which is why the knobs read MG/T.EXT and "
             "EG1/EXT rather than just MG and EG1."},
    {"id": "b03", "name": "TOTAL is a four-way substitution", "applies_to": ["mod_bus"],
     "rule": "One cable into TOTAL replaces the modulation generator as the source for all four MG/T.EXT knobs at "
             "once: VCO1, VCO2, high-pass cutoff and low-pass cutoff. The individual FREQ and CUTOFF FREQ jacks "
             "replace only their own knob's source."},
    {"id": "b04", "name": "Two filters in series", "applies_to": ["vcf_hp", "vcf_lp"],
     "rule": "The high-pass comes first and the low-pass second, both 24 dB/octave. Setting the high-pass above the "
             "low-pass narrows the passband to nothing; setting them close together with both PEAK controls up gives "
             "the band-pass scream the MS-20 is known for. The manual's phrase 'emphasis at the crossover frequency' "
             "points at the same thing."},
    {"id": "b05", "name": "RING is not a waveform", "applies_to": ["vco1", "vco2"],
     "rule": "Selecting RING on VCO2's waveform switch replaces its output with the ring modulation of VCO1 and "
             "VCO2, so both oscillators are consumed to produce one inharmonic voice. Detuning VCO2 then changes the "
             "character rather than the interval."},
    {"id": "b06", "name": "Noise as an oscillator waveform", "applies_to": ["vco1", "noise"],
     "rule": "VCO1's fourth waveform position substitutes noise for the oscillator. Noise is therefore available two "
             "ways: mixed and filtered through VCO1's channel, or straight off the pink and white jacks on the patch "
             "panel. The manual does not say which colour the VCO1 position uses.",
     "confidence": "inferred"},
    {"id": "b07", "name": "Envelope division of labour", "applies_to": ["eg1", "eg2"],
     "rule": "EG1 has delay, attack and release only, and is normalled to pitch. EG2 has hold, attack, decay, "
             "sustain and release, and is normalled to both cutoffs and to the VCA. Both fire from the same trigger "
             "unless EG1 TRIG IN is patched, which gives EG1 its own."},
    {"id": "b08", "name": "Inverted envelope outputs", "applies_to": ["eg1", "eg2"],
     "rule": "Both envelopes have a reversed output on the patch panel: EG1 falls from +5 V to 0 where the normal "
             "output rises, and EG2's reversed output swings between -2.5 V and +2.5 V. EG1's normal output has a "
             "jack; EG2's does not, so envelope 2 is only available inverted unless you use its internal routings."},
    {"id": "b09", "name": "Keyboard CV is Hz per volt", "applies_to": ["kbd", "pitch_bus"],
     "rule": "The keyboard CV output is specified as 0 to +8 V and exponential, and the oscillator CV inputs accept "
             "0 to +8 V. An exponential response means volts map to frequency rather than to pitch, which is the "
             "MS-20's Hz per volt standard. This matters when patching to other synthesizers: a 1 V/octave module "
             "will not track correctly without a converter. The manual never uses the phrase Hz per volt.",
     "confidence": "inferred"},
    {"id": "b10", "name": "Modulation generator morphing", "applies_to": ["mg"],
     "rule": "There is one waveform knob and two outputs, and the knob shapes both at the same time. It is a "
             "continuous sweep, not a switch, so intermediate shapes between reverse sawtooth and triangle, or "
             "between square and narrow pulse, are valid settings."},
    {"id": "b11", "name": "External signal processor", "applies_to": ["esp_preamp", "esp_bpf", "esp_fv", "esp_env", "esp_trig"],
     "rule": "An external signal is amplified, band-passed, and then split three ways: a frequency to voltage "
             "converter produces pitch CV, an envelope follower produces a loudness CV, and a threshold comparator "
             "produces triggers. Patch those three into pitch, cutoff and the envelopes and the synthesizer plays "
             "from a guitar, a voice or a drum track. None of the three outputs has an internal destination, so the "
             "section does nothing until it is cabled.",
     "confidence": "inferred",
     "note": "That the three outputs have no internal destination is read off the block diagram, not stated."},
    {"id": "b12", "name": "Poly chain", "applies_to": ["kbd"],
     "rule": "Units share a MIDI channel and are daisy-chained through MIDI THRU, with notes distributed between "
             "them. Mode is toggled by pressing TRIG SW four times quickly during the post-power-up window while the "
             "ON LED flashes, or set with Behringer's SynthTool application. The ON LED shows red while poly chain "
             "is active and amber otherwise. The manual does not say how many units can be chained; the cover claims "
             "16 voices."},
    {"id": "b13", "name": "Warm-up", "applies_to": ["vco1", "vco2"],
     "rule": "The manual asks for 15 minutes or more of warm-up before recording or playing live, longer from cold, "
             "for the analogue circuits to reach tuning stability. A faithful model may want slow pitch drift that "
             "settles over that period."},
    {"id": "b14", "name": "Patch point voltage limits", "applies_to": ["esp_preamp", "sample_hold", "vca_patch"],
     "rule": "The manual warns twice that the 3.5 mm inputs must not be overloaded and that outputs should only "
             "reach inputs that can take their voltage, on pain of damage. The ranges are in the specifications: "
             "mostly -5 V to +5 V, 0 to +8 V on the oscillator and keyboard CV paths, and 3 Vpp on the external "
             "signal input."},
]

D["midi"] = {
    "receives": ["note_on", "note_off", "pitch_bend", "cc123_all_notes_off"],
    "transmits": ["MIDI THRU: pass-through of MIDI IN", "USB MIDI out to an application"],
    "channel": {"range": [1, 16], "set_by": "four rear DIP switches, table printed in the manual"},
    "message_table": [
        {"status": "8n", "second": "kk", "third": "vv", "parameter": "[0, 7F]", "description": "note off"},
        {"status": "9n", "second": "kk", "third": "vv", "parameter": "[0, 7F]", "description": "note on"},
        {"status": "Bn", "second": "7B", "third": None, "parameter": None, "description": "all notes off"},
        {"status": "En", "second": "bb", "third": "bb", "parameter": "[0, 3FFF]", "description": "pitch bend"},
    ],
    "note_to_cv": {"kbd_cv_v": [0, 8], "response": "exponential",
                   "scaling": "Hz per volt (inferred; see behaviour b09)", "zero_volt_note": None},
    "usb": {"class_compliant": True, "spec": "USB 2.0, type B",
            "os": "Windows 7 or higher, Mac OS X 10.6.8 or higher"},
    "cc_map": None,
    "sysex": None,
    "clock": "not mentioned",
    "firmware": "Updatable; file and instructions from behringer.com. SynthTool is also used to configure poly chain.",
}

D["specifications"] = {
    "voices": "monophonic",
    "oscillators": {"count": 2, "range_hz": {"min": 16, "max": 1500, "at": "8'"}, "ranges": "4 overlapping"},
    "lfo_hz": {"min": 0.1, "max": 22},
    "vcf": "1 low pass, 1 high pass, 24 dB/octave, switchable between two filter circuits",
    "envelopes": {
        "eg1": {"delay_s": [0, 5.5], "attack_s": [0.003, 16], "release_s": [0.03, 16], "out_v": [0, 5]},
        "eg2": {"hold_s": [0, 14], "attack_s": [0.0054, 9], "decay_s": [0.0005, 15], "release_s": [0.04, 18],
                "out_v": [-2.5, 2.5]},
    },
    "patch_voltages": {
        "total_in_v": [-5, 5], "freq_in_v": [-3, 3], "cutoff_in_v": [-5, 5], "initial_gain_in_v": [0, 5],
        "vco_cv_in_v": [0, 8], "kbd_cv_out_v": [0, 8], "ext_signal_in_vpp": 3,
        "sample_hold_vpp": 5, "vca_patch_v": [-5, 5], "vca_patch_ctrl_v": [0, 5],
        "noise_out_vpp": 5, "mg_tri_saw_vpp": 5, "mg_pulse_v": [0, 5],
        "esp_fv_out_v": [0, 8], "esp_env_out_v": [0, 5],
    },
    "outputs": {"main_quarter_inch": "1/4\" TS unbalanced, max 0 dBu", "signal_out": "3.5 mm TS unbalanced, max 0 dBu",
                "impedance_ohm": 1000, "phones": "3.5 mm TRS, max +6 dBu, 22 ohm"},
    "power": {"adaptor": "12 V DC", "consumption_w_max": 12},
    "dimensions_mm": {"h": 95, "w": 424, "d": 136},
    "eurorack_hp": 80,
    "weight_kg": 1.8,
    "operating_temperature_c": {"min": 5, "max": 40},
}

D["omitted_from_source"] = [
    "safety and legal text in nine languages",
    "warranty, registration and FCC/EU declarations",
    "non-English duplicates of the controls and getting-started chapters",
    "hook-up diagrams for studio, band, live and poly chain setups",
    "the blank patch sheet and the default patch illustration",
    "the MIDI channel DIP switch table, reproducible from the rear panel",
]

D["not_in_source"] = [
    "any statement that the keyboard CV is Hz per volt, although the specifications call it exponential and the "
    "MS-20 heritage makes it near certain",
    "what distinguishes filter 1 from filter 2, or whether the switch affects one filter or both",
    "whether the INITIAL GAIN jack sums with envelope 2 or replaces it",
    "how VCO 2 CV IN and VCO 1+2 CV IN interact when both are patched",
    "which noise colour VCO1's noise waveform position uses",
    "whether the patch panel VCA is a separate amplifier or a tap on the main one",
    "cutoff frequency ranges in Hz for the external signal processor's band-pass filter",
    "the modulation depth produced at full knob travel, for any of the six depth controls",
    "pulse width range in percent, and any way to modulate it",
    "how many units a poly chain supports, and how notes are distributed between them",
    "any MIDI implementation beyond note on, note off, pitch bend and all notes off: no CC map, no clock, no SysEx",
]

D["source_inconsistencies"] = [
    "Item 29 describes HOLD TIME as extending the trigger signal, which would affect both envelopes, while the "
    "specifications list it as envelope generator 2's hold time. This file follows the specifications.",
    "The panel prints -5 V to +5 V beside the FREQ jack, but the specifications give the VCO 1+2 frequency input as "
    "-3 V to +3 V.",
    "The specifications list an 'EG 2 out' at -2.5 V to +2.5 V, but there is no EG 2 OUT jack; only EG 2 REV OUT "
    "exists on the panel and in the numbered controls.",
    "Item 60 calls VCA OUT a control output, while the block diagram and the specifications treat it as the "
    "amplifier's signal output.",
    "The Envelope Generator Section heading in the numbered controls has no numbered item for the EG action LED, "
    "which the specifications do list.",
    "The manual is titled Quick Start Guide throughout but contains a full controls reference and specifications.",
    "Item 23 is described as indicating 'the current rate' of the modulation generator in English and 'the active "
    "state' in Spanish; it is a rate blinker.",
]

D["modelling_gaps"] = [
    {"topic": "Hz per volt", "detail": "If the keyboard CV really is Hz/V, every pitch calculation in a model of this "
     "instrument differs from the 1 V/octave assumption used in the other files in this collection. Confirming it "
     "from the MS-20 manual should be the first job."},
    {"topic": "Filter circuits", "detail": "Two selectable filters and no description of either. On the MS-20 the "
     "difference is audible and mostly in the resonance behaviour, which is exactly what is unspecified here."},
    {"topic": "Resonance and self-oscillation", "detail": "PEAK is described only as emphasis at cutoff. Nothing on "
     "whether either filter self-oscillates, which on the MS-20 both do."},
    {"topic": "Control tapers", "detail": "Every knob is 0 to 10. Physical end points exist only for the envelope "
     "times, the LFO rate and the filter cutoff sweep; the mapping between knob position and value is never given."},
    {"topic": "Oscillator range", "detail": "16 Hz to 1.5 kHz at 8' with four overlapping ranges, but no statement of "
     "what each scale position does to that, and no fine tune beyond VCO2's PITCH knob."},
    {"topic": "Pulse width", "detail": "Described as square to narrow with no percentages and no modulation input, "
     "so PWM is not available on this instrument at all."},
    {"topic": "Ring modulator", "detail": "No statement of whether it is a true four-quadrant multiplier, and no "
     "level relationship between the RING position and the other three waveforms."},
    {"topic": "External signal processor tuning", "detail": "No frequency range for the band-pass, no tracking range "
     "or latency for the frequency to voltage converter, no time constants for the envelope follower."},
    {"topic": "Envelope curves", "detail": "Times are given but not segment shapes. Exponential RC is likely."},
    {"topic": "Korg MS-20 manual", "detail": "The uploaded original is a 44-page scan with no text layer. OCR would "
     "likely settle the Hz/V scaling, the filter circuits, the patch panel normalling and the ring modulator, in "
     "the same way the ARP 2600 manual would for the 2600 file."},
]

with open("/mnt/user-data/outputs/behringer-k-2.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
