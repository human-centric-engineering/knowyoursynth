#!/usr/bin/env python3
"""Assemble the Behringer 2600 device file.

Written as a generator rather than by hand because the 2600 repeats itself:
three near-identical VCOs and roughly thirty pre-wired attenuator sliders that
all follow the same shape. The tables below are the source of truth.
"""
import json

D = {}
D["schema_version"] = "0.4.0"

D["device"] = {
    "id": "behringer-2600",
    "manufacturer": "Behringer",
    "model": "2600",
    "category": "semi-modular analogue synthesizer, 19-inch rack / Eurorack",
    "based_on": "ARP 2600. The Behringer manual does not name it; the panel layout, module set and pre-wiring are the ARP's.",
    "sources": [
        {"id": "b2600", "title": "2600 Quick Start Guide", "kind": "user_manual",
         "file": "Behringer_2600_manual.pdf", "pages": 62,
         "note": "Titled Quick Start Guide but is a full controls manual: 100 numbered items with descriptions, plus a complete specifications table. Nine languages; English is pages 6 to 10, specifications pages 56 to 57."},
        {"id": "panel", "title": "Behringer 2600 front panel photograph", "kind": "measurement",
         "file": "behringer-2600.jpg",
         "note": "Used for the pre-wired source labels, the unnumbered attenuator sliders, and every LED colour. None of this is in the manual."},
        {"id": "arp", "title": "ARP 2600 Owner's Manual", "kind": "user_manual",
         "file": "Arp_2600_Manual.pdf", "pages": 112,
         "note": "Scanned images with no text layer, so not mined for this pass. It is the obvious source for the gaps listed in modelling_gaps: slider tapers, voltage laws, filter behaviour."},
    ],
}

D["architecture"] = {
    "synthesis": "subtractive",
    "signal_path": "analogue",
    "voices": 1,
    "polyphony_mode": "monophonic, or two voices in DUO keyboard mode. The specifications say 'Multiphonic', the ARP term for duophonic.",
    "poly_chain_max_units": None,
    "patch_memory": False,
    "semi_modular": True,
    "panel_counts": {"sliders": 62, "switches": 12, "buttons": 3, "rotary": 2, "jacks_3_5mm": 60},
    "summary": (
        "A fully normalled modular. 3 VCOs (each switchable to LFO range, VCO2 and VCO3 syncable to VCO1) "
        "plus a noise generator and a ring modulator feed a 4-pole low-pass VCF through five attenuator sliders. "
        "The VCF and the ring modulator feed a VCA in parallel, and VCF and VCA outputs are then blended in a "
        "two-channel mixer, panned, sent through reverb and out in stereo. Two envelope generators (AR and ADSR) "
        "are triggered from the keyboard, the sample and hold clock, or external gate and trigger jacks. "
        "A dedicated LFO with delayed vibrato, a preamp and envelope follower, a sample and hold with an internal "
        "clock, an electronic switch, a voltage processor (two inverting summers and a lag processor) and a 4-way "
        "mult complete the set. Every pre-wired connection has a jack above its slider that breaks the "
        "normal when a plug is inserted."
    ),
}

# --------------------------------------------------------------------------
# modules
# --------------------------------------------------------------------------
M = []


def mod(id, type, name, section, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": description}
    if properties:
        m["properties"] = properties
    m["inputs"] = inputs
    m["outputs"] = outputs
    M.append(m)


mod("kbd", "midi_to_cv", "Keyboard interface", "KEYBOARD",
    "Turns incoming MIDI into pitch CV, gate and trigger. MONO plays one voice; DUO splits the held notes so the "
    "lowest drives the main keyboard CV and the highest drives the UPPER VOICE output. REPEAT and TRIG MODE decide "
    "how triggers are generated. There is no physical keyboard on this model; the section is driven over MIDI or USB.",
    [], ["kbd.cv", "kbd.upper_cv", "kbd.gate", "kbd.trig"])

mod("portamento", "pitch_control", "Portamento", "PORTAMENTO",
    "Slews the keyboard CV so one pitch slides to the next. Switched on by the panel switch, momentarily by the "
    "MOMEN button, or by a footswitch on the rear.",
    ["portamento.in"], ["portamento.out"])

for n, has_tri, has_sine, has_sync, has_pwm in [(1, False, False, False, False), (2, True, True, True, True), (3, True, True, True, True)]:
    outs = [f"vco{n}.saw", f"vco{n}.pulse"] + ([f"vco{n}.tri"] if has_tri else []) + ([f"vco{n}.sine"] if has_sine else [])
    ins = [f"vco{n}.kbd_in", f"vco{n}.fm1", f"vco{n}.fm2", f"vco{n}.fm3"] + ([f"vco{n}.pwm_in"] if has_pwm else []) + ([f"vco{n}.sync_in"] if has_sync else [])
    mod(f"vco{n}", "oscillator", f"Voltage Controlled Oscillator {n}", f"VOLTAGE CONTROLLED OSCILLATOR {n}",
        ("Analogue VCO. The AUDIO/LF switch moves it between four audio ranges and four sub-audio ranges; in LF it "
         "becomes an LFO and keyboard control is disabled automatically. "
         + ("Outputs sawtooth and pulse." if n == 1 else "Outputs triangle, sawtooth, sine and pulse, all simultaneously available.")
         + (" SYNC locks it to VCO1 so the pair behaves as one oscillator following VCO1's frequency." if has_sync else "")),
        ins, outs,
        {"frequency_hz": {"min": 0.03, "max": 40000, "note": "specifications give 0.03 Hz to 40 kHz across four overlapping ranges for the three VCOs together"},
         "audio_ranges_hz": [10, 100, 1000, 10000],
         "lf_ranges_hz": [0.03, 0.3, 3.0, 30],
         "waveforms": (["sawtooth", "pulse"] if n == 1 else ["triangle", "sawtooth", "sine", "pulse"]),
         "simultaneous_outputs": True})

mod("vcf", "filter", "Voltage Controlled Filter / Resonator", "VOLTAGE CONTROLLED FILTER / RESONATOR VCF",
    "4-pole low-pass filter with variable cutoff and resonance. A switch picks between two filter circuits, the "
    "4012 and the 4072. Five audio attenuators and three control attenuators feed it.",
    ["vcf.audio_ring", "vcf.audio_vco1", "vcf.audio_vco2", "vcf.audio_vco3", "vcf.audio_noise",
     "vcf.ctrl_kbd", "vcf.ctrl_adsr", "vcf.ctrl_vco2"],
    ["vcf.out"],
    {"slope_db_per_octave": 24, "poles": 4, "modes": ["lowpass"], "circuits": ["4012", "4072"]})

mod("vca", "vca", "Voltage Controlled Amplifier", "VOLTAGE CONTROLLED AMPLIFIER",
    "Amplifier sitting in parallel with the VCF rather than after it; both are blended in the mixer. At maximum "
    "gain it passes signal at unity; at minimum it passes nothing. INITIAL GAIN sets the standing gain, and the two "
    "control inputs add to it, one linear and one exponential.",
    ["vca.audio_vcf", "vca.audio_ring", "vca.ctrl_lin", "vca.ctrl_exp"], ["vca.out"])

mod("ar", "envelope", "AR Envelope Generator", "AR ENV GEN",
    "Attack and release transient generator, fired by the gate or trigger chosen at its routing switch or by the "
    "MANUAL button. TIME FACTOR scales both times.",
    ["ar.gate_in"], ["ar.out"],
    {"stages": ["attack", "release"], "output_v": {"min": 0, "max": 10}})

mod("adsr", "envelope", "ADSR Envelope Generator", "ADSR ENVELOPE GENERATOR",
    "Four-stage transient generator, fired by the gate or trigger chosen at its routing switch or by the MANUAL "
    "button. TIME FACTOR scales the times.",
    ["adsr.gate_in"], ["adsr.out"],
    {"stages": ["attack", "decay", "sustain", "release"], "output_v": {"min": 0, "max": 10}})

mod("trigger_bus", "gate_logic", "Envelope trigger routing", "AR / ADSR ENVELOPE GENERATOR",
    "Selects what fires the envelopes. Each generator has a three-position routing switch choosing the pre-wired "
    "S/H CLOCK, the GATE IN jack or the TRIG IN jack, and the manual says the chosen signal is passed on to the "
    "ADSR as well. The keyboard gate and trigger and the MANUAL buttons also reach the envelopes.",
    ["trigger_bus.kbd_gate_in", "trigger_bus.kbd_trig_in", "trigger_bus.sh_clock_in",
     "trigger_bus.gate_jack_in", "trigger_bus.trig_jack_in"],
    ["trigger_bus.out"])

mod("mixer", "mixer", "Mixer", "MIXER",
    "Two attenuators, pre-wired from the VCF and the VCA, summed to one signal which is then panned into the stereo "
    "output. The summed signal also feeds the reverb over a separate pre-wired connection that the POST-MIXER jack "
    "does not break.",
    ["mixer.in_vcf", "mixer.in_vca", "mixer.pan_in"],
    ["mixer.sum_out", "mixer.post_atten_vcf", "mixer.post_atten_vca"])

mod("reverb", "reverb", "Reverb", "REVERB",
    "Stereo reverb fed from the mixer sum, with its own left and right level sliders and two input jacks that sum "
    "extra signal hard left and hard right. Digital on the 2600; the BLUE MARVIN edition has a real spring tank.",
    ["reverb.in", "reverb.left_in", "reverb.right_in"], ["reverb.left", "reverb.right"])

mod("output", "output", "Stereo output", "OUTPUT",
    "Final left and right outputs on parallel 1/4-inch and 3.5 mm jacks, plus the headphone amplifier, which is fed "
    "from the mixer output.",
    ["output.left_in", "output.right_in"], ["output.left", "output.right", "output.phones"])

mod("lfo", "lfo", "Low Frequency Oscillator", "LFO",
    "Dedicated LFO intended to work with the keyboard. Sawtooth, square and sine are all available at once on "
    "separate jacks; the sine is pre-wired to VCO1 and is the one that carries the vibrato delay and depth.",
    ["lfo.ext_vib_in"], ["lfo.saw", "lfo.square", "lfo.sine", "lfo.sine_delayed"],
    {"rate_hz": {"min": 0.25, "max": 25}, "shapes": ["sawtooth", "square", "sine"]})

mod("noise", "noise", "Noise Generator", "NOISE GENERATOR",
    "Noise source sweepable through low frequency, pink and white with one slider, followed by a level slider.",
    [], ["noise.out"], {"colours": ["low_freq", "pink", "white"], "continuous_colour": True})

mod("ring_mod", "ring_modulator", "Ring Modulator", "RING MOD",
    "Voltage multiplier combining two inputs. Pre-wired from VCO1 sawtooth and VCO2 sine; each input jack blends an "
    "external signal with the pre-wired one rather than replacing it, and the adjacent slider sets the combined gain. "
    "An AUDIO/DC switch optimises the VCO1 path for audio or control voltages.",
    ["ring_mod.in_a", "ring_mod.in_b"], ["ring_mod.out"])

mod("preamp", "preamp", "Preamp", "PREAMP",
    "Switchable-gain preamp bringing an external signal up to synth level, in three ranges of x10, x100 and x1000 "
    "(20, 40 and 60 dB). Pre-wired into the envelope follower.",
    ["preamp.in"], ["preamp.out"])

mod("env_follower", "envelope_follower", "Envelope Follower", "ENV FOLLOWER",
    "Produces a control voltage tracking the average amplitude of its input. Fed from the preamp over a pre-wired "
    "connection, or directly through its own input, which blends rather than replaces. Its output has no pre-wired "
    "destination anywhere in the synth, so it needs a cable.",
    ["env_follower.in"], ["env_follower.out"])

mod("sample_hold", "sample_hold", "Sample & Hold", "SAMPLE & HOLD",
    "Samples its input on each clock tick and holds the value until the next, turning a smooth signal into a stepped "
    "one. Pre-wired from the noise generator, which makes it a random voltage source by default. Runs on its own "
    "internal clock unless EXT CLK IN is patched, which disables the internal clock and the RATE slider with it.",
    ["sample_hold.in", "sample_hold.clock_in"], ["sample_hold.out", "sample_hold.clock_out"])

mod("elec_switch", "electronic_switch", "Electronic Switch", "ELEC SWITCH",
    "Bidirectional two-way switch clocked by the sample and hold internal clock. It can alternate one input at C "
    "between outputs A and B, or alternate the C output between two inputs at A and B.",
    ["elec_switch.a_in", "elec_switch.b_in", "elec_switch.c_in"],
    ["elec_switch.a_out", "elec_switch.b_out", "elec_switch.c_out"])

mod("inverter1", "inverter", "Inverter 1", "VOLTAGE PROCESSOR",
    "Sums four inputs and inverts the result. A +10 V input leaves as -10 V; audio leaves with its phase reversed. "
    "Three of the four inputs have attenuator sliders.",
    ["inverter1.in1", "inverter1.in2", "inverter1.in3", "inverter1.in4"], ["inverter1.out"])

mod("inverter2", "inverter", "Inverter 2", "VOLTAGE PROCESSOR",
    "Sums two inputs and inverts the result.",
    ["inverter2.in5", "inverter2.in6"], ["inverter2.out"])

mod("lag", "slew_limiter", "Lag Processor", "VOLTAGE PROCESSOR",
    "Slows down sudden changes in the input voltage by an amount set by its slider. On audio it behaves as a "
    "low-pass filter, rolling off treble as the lag increases.",
    ["lag.in"], ["lag.out"])

mod("mult", "mult", "Mult", "MULT",
    "Four jacks wired in parallel, usable in any combination of inputs and outputs, for splitting one signal to "
    "several destinations or passively combining several.",
    ["mult.bus_in"], ["mult.bus_out"])

D["modules"] = M

# --------------------------------------------------------------------------
# parameters
# --------------------------------------------------------------------------
P = []


def par(id, module, label, kind, function, ref=None, led=None, **kw):
    p = {"id": id, "module": module, "label": label}
    if ref is not None:
        p["manual_ref"] = ref
    p["kind"] = kind
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default", "weight"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", [{"type": "panel", "control": "fader"}])
    p["function"] = function
    if led:
        p["led_colour"] = led
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


SL = [{"type": "panel", "control": "fader"}]
SW = [{"type": "panel", "control": "slide_switch"}]
BT = [{"type": "panel", "control": "button"}]
KN = [{"type": "rear_panel", "control": "knob"}]

# --- VCOs -----------------------------------------------------------------
VCO_LED = {1: "blue", 2: "green", 3: "blue"}
for n in (1, 2, 3):
    c = VCO_LED[n]
    par(f"vco{n}.initial_frequency", f"vco{n}", "INITIAL OSCILLATOR FREQUENCY", "continuous",
        "Coarse operating frequency. The scale is marked in four audio decades (10 Hz, 100 Hz, 1 kHz, 10 kHz) and, "
        "for LF mode, four sub-audio ones (.03, .3, 3.0, 30 Hz). The ranges overlap, so the marks locate a region "
        "rather than switch between fixed bands.",
        ref=1, led=c, panel_scale={"min": 0, "max": 10, "unit": "decade marks"},
        physical={"min": 0.03, "max": 40000, "unit": "Hz", "taper": "approximately logarithmic, about one decade per marked division"})
    par(f"vco{n}.fine_tune", f"vco{n}", "FINE TUNE", "continuous",
        "Trims the frequency up or down from the coarse setting. The span is not stated.",
        ref=2, led=c, panel_scale={"min": -5, "max": 5, "unit": "unspecified"}, bipolar=True)
    par(f"vco{n}.pulse_width", f"vco{n}", "PULSE WIDTH", "continuous",
        "Duty cycle of the pulse output, marked 10%, 50% and 90%. This is the standing width before any PWM.",
        ref=3, led=c, panel_scale={"min": 10, "max": 90, "unit": "%"},
        physical={"min": 10, "max": 90, "unit": "% duty", "taper": "linear (panel marks are evenly spaced)"})
    par(f"vco{n}.audio_lf", f"vco{n}", "AUDIO (KYBD ON) / LF (KYBD OFF)", "enum",
        "AUDIO puts the oscillator in the audio ranges with keyboard control enabled. LF moves it to the sub-audio "
        "ranges and disables keyboard control automatically, turning it into an LFO.",
        ref=6, access=SW,
        values=[{"value": "audio", "label": "AUDIO KYBD ON"}, {"value": "lf", "label": "LF KYBD OFF"}])
    if n in (2, 3):
        par(f"vco{n}.sync", f"vco{n}", "SYNC ON/OFF", "boolean",
            f"Hard-syncs VCO{n} to VCO1, so the pair behaves as one oscillator following VCO1's frequency.",
            ref=4, access=SW)

# --- VCO attenuator sliders (unnumbered on the panel) ----------------------
# (param id, module, label, source module, LED colour, manual ref, note)
ATTEN = [
    ("vco1.fm_sh", "vco1", "S/H OUT (FM)", "sample_hold", "yellow", "vco1.fm1"),
    ("vco1.fm_adsr", "vco1", "ADSR (FM)", "adsr", "red", "vco1.fm2"),
    ("vco1.fm_lfo", "vco1", "LFO (FM)", "lfo", "yellow", "vco1.fm3"),
    ("vco2.fm_sh", "vco2", "S/H OUT (FM)", "sample_hold", "yellow", "vco2.fm1"),
    ("vco2.fm_adsr", "vco2", "ADSR (FM)", "adsr", "red", "vco2.fm2"),
    ("vco2.fm_vco1", "vco2", "VCO 1 pulse (FM)", "vco1", "blue", "vco2.fm3"),
    ("vco2.pwm_noise", "vco2", "NOISE GEN (PWM)", "noise", "green", "vco2.pwm_in"),
    ("vco3.fm_noise", "vco3", "NOISE GEN (FM)", "noise", "green", "vco3.fm1"),
    ("vco3.fm_adsr", "vco3", "ADSR (FM)", "adsr", "red", "vco3.fm2"),
    ("vco3.fm_vco2", "vco3", "VCO 2 sine (FM)", "vco2", "green", "vco3.fm3"),
    ("vco3.pwm_adsr", "vco3", "ADSR (PWM)", "adsr", "red", "vco3.pwm_in"),
    ("vcf.lvl_ring", "vcf", "RING MOD (audio)", "ring_mod", "green", "vcf.audio_ring"),
    ("vcf.lvl_vco1", "vcf", "VCO 1 pulse (audio)", "vco1", "blue", "vcf.audio_vco1"),
    ("vcf.lvl_vco2", "vcf", "VCO 2 pulse (audio)", "vco2", "green", "vcf.audio_vco2"),
    ("vcf.lvl_vco3", "vcf", "VCO 3 saw (audio)", "vco3", "blue", "vcf.audio_vco3"),
    ("vcf.lvl_noise", "vcf", "NOISE GEN (audio)", "noise", "green", "vcf.audio_noise"),
    ("vcf.lvl_kbd", "vcf", "KYBD CV (control)", "kbd", "white", "vcf.ctrl_kbd"),
    ("vcf.lvl_adsr", "vcf", "ADSR (control)", "adsr", "red", "vcf.ctrl_adsr"),
    ("vcf.lvl_vco2_sine", "vcf", "VCO 2 sine (control)", "vco2", "green", "vcf.ctrl_vco2"),
    ("vca.lvl_vcf", "vca", "VCF (audio)", "vcf", "white", "vca.audio_vcf"),
    ("vca.lvl_ring", "vca", "RING MOD (audio)", "ring_mod", "green", "vca.audio_ring"),
    ("vca.lvl_ar", "vca", "AR (control, linear)", "ar", "red", "vca.ctrl_lin"),
    ("vca.lvl_adsr", "vca", "ADSR (control, exponential)", "adsr", "red", "vca.ctrl_exp"),
    ("mixer.lvl_vcf", "mixer", "VCF (audio)", "vcf", "white", "mixer.in_vcf"),
    ("mixer.lvl_vca", "mixer", "VCA (audio)", "vca", "white", "mixer.in_vca"),
]
for pid, m, label, src, led, node in ATTEN:
    par(pid, m, label, "continuous",
        f"Attenuator for the pre-wired signal from {src.replace('_', ' ')} into {node}. Unnumbered on the panel: the "
        "manual describes the pre-wiring scheme and the specifications list the slider, but neither gives it a number. "
        "The jack immediately below breaks the pre-wired connection when a plug is inserted; the slider then sets the "
        "level of whatever is patched in.",
        led=led, panel_scale={"min": 0, "max": 10})

# --- VCF ------------------------------------------------------------------
par("vcf.initial_frequency", "vcf", "INITIAL FILTER FREQUENCY", "continuous",
    "Coarse cutoff, marked at 10 Hz, 100 Hz, 1 kHz and 10 kHz.",
    ref=9, led="white", panel_scale={"min": 0, "max": 10, "unit": "decade marks"},
    physical={"min": 10, "max": 10000, "unit": "Hz", "taper": "approximately logarithmic",
              "note": "end points read from the panel scale; the manual gives no measured range"})
par("vcf.fine_tune", "vcf", "FINE TUNE", "continuous",
    "Trims the cutoff up or down from the coarse setting.",
    ref=10, led="white", panel_scale={"min": -5, "max": 5, "unit": "unspecified"}, bipolar=True)
par("vcf.resonance", "vcf", "RESONANCE", "continuous",
    "Filter Q. At MAX the response around cutoff becomes sharp and the filter rings in response to pulses passing "
    "through it. The manual stops short of saying it self-oscillates.",
    ref=11, led="white", panel_scale={"min": 0, "max": 10, "unit": "MIN to MAX"})
par("vcf.mode", "vcf", "MODE (4012 / 4072)", "enum",
    "Chooses between two filter circuits. The manual's description of them is garbled: it calls the 4012 the "
    "original design with a 16 Hz maximum cutoff and the 4072 a lower maximum at 11 Hz, which cannot be right for a "
    "filter whose panel is marked to 10 kHz. Read as 16 kHz and 11 kHz.",
    ref=12, access=SW,
    values=[{"value": "4012", "label": "4012", "meaning": "the earlier ARP filter"},
            {"value": "4072", "label": "4072", "meaning": "the later ARP filter"}],
    confidence="inferred",
    note="The kHz reading is an inference from the panel scale and from the two circuits being audio filters.")

# --- envelopes ------------------------------------------------------------
par("ar.attack", "ar", "ATTACK TIME", "continuous",
    "Time to rise to the fixed peak when a key is pressed or a gate or trigger arrives.",
    ref=16, led="red", panel_scale={"min": 0, "max": 10})
par("ar.release", "ar", "RELEASE TIME", "continuous",
    "Fall time after the key or the gate is released.",
    ref=17, led="red", panel_scale={"min": 0, "max": 10})
par("ar.manual", "ar", "MANUAL", "boolean",
    "Produces a gate by hand, firing both the AR and the ADSR.",
    ref=18, access=BT)
par("ar.time_factor", "ar", "TIME FACTOR (x2 / x1 / x0.5)", "enum",
    "Multiplies the whole envelope's timing.",
    ref=19, access=SW,
    values=[{"value": 2, "label": "x2"}, {"value": 1, "label": "x1"}, {"value": 0.5, "label": "x0.5"}])
par("ar.trigger_source", "ar", "ROUTING SWITCH", "enum",
    "Chooses what fires the envelope: the pre-wired S/H CLOCK, the GATE IN jack or the TRIG IN jack. The manual adds "
    "that the chosen signal is passed on to the ADSR generator as well.",
    ref=20, access=SW,
    values=[{"value": "sh_clock", "label": "S/H CLOCK"}, {"value": "gate_in", "label": "GATE IN"}, {"value": "trig_in", "label": "TRIG IN"}])

par("adsr.attack", "adsr", "ATTACK TIME", "continuous",
    "Time to rise to the fixed peak when a key is pressed or a gate or trigger arrives.",
    ref=25, led="red", panel_scale={"min": 0, "max": 10})
par("adsr.decay", "adsr", "DECAY TIME", "continuous",
    "How quickly the envelope falls from the peak to the sustain level.",
    ref=26, led="red", panel_scale={"min": 0, "max": 10})
par("adsr.sustain", "adsr", "SUS LEVEL", "continuous",
    "Level held after the decay, for as long as the gate is held.",
    ref=27, led="red", panel_scale={"min": 0, "max": 10})
par("adsr.release", "adsr", "REL TIME", "continuous",
    "Fall time after the key or the gate is released.",
    ref=28, led="red", panel_scale={"min": 0, "max": 10})
par("adsr.time_factor", "adsr", "TIME FACTOR (x2 / x1 / x0.5)", "enum",
    "Multiplies the whole envelope's timing.",
    ref=29, access=SW,
    values=[{"value": 2, "label": "x2"}, {"value": 1, "label": "x1"}, {"value": 0.5, "label": "x0.5"}])
par("adsr.manual", "adsr", "MANUAL", "boolean",
    "Produces a gate by hand, firing both the AR and the ADSR. The manual lists a MANUAL button under both "
    "generators; the panel has one button in the AR block and one in the ADSR block.",
    ref=32, access=BT)
par("adsr.trigger_source", "adsr", "ROUTING SWITCH", "enum",
    "Chooses what fires the envelope: the pre-wired S/H CLOCK, the GATE IN jack or the TRIG IN jack.",
    ref=33, access=SW,
    values=[{"value": "sh_clock", "label": "S/H CLOCK"}, {"value": "gate_in", "label": "GATE IN"}, {"value": "trig_in", "label": "TRIG IN"}])

# --- VCA, mixer, reverb, output -------------------------------------------
par("vca.initial_gain", "vca", "INITIAL GAIN", "continuous",
    "Standing gain of the VCA before any control voltage is added. At maximum the VCA passes signal at unity gain; "
    "at minimum it passes nothing.",
    ref=34, led="white", panel_scale={"min": 0, "max": 10})
par("mixer.pan", "mixer", "PAN", "continuous",
    "Places the summed mixer signal in the stereo field before the final output.",
    ref=41, led="white", panel_scale={"min": -5, "max": 5, "unit": "L to R"}, bipolar=True,
    access=[{"type": "panel", "control": "fader", "note": "horizontal"}])
par("reverb.level_left", "reverb", "REVERB L", "continuous",
    "Left reverb level. Unnumbered on the panel; listed in the specifications as one of the mixer and reverb sliders.",
    led="green", panel_scale={"min": 0, "max": 10})
par("reverb.level_right", "reverb", "REVERB R", "continuous",
    "Right reverb level. Unnumbered on the panel; listed in the specifications as one of the mixer and reverb sliders.",
    led="green", panel_scale={"min": 0, "max": 10})
par("output.phones_level", "output", "PHONES level", "continuous",
    "Headphone volume. The headphone feed is taken from the mixer output.",
    ref=91, panel_scale={"min": 0, "max": 10}, access=[{"type": "panel", "control": "knob"}])
par("output.power", "output", "POWER", "boolean",
    "Turns the synthesizer on and off. Make the connections before switching on.",
    ref=92, access=[{"type": "panel", "control": "toggle_switch"}])

# --- keyboard, portamento, LFO --------------------------------------------
par("kbd.voice_mode", "kbd", "VOICE MODE (MONO / DUO)", "enum",
    "MONO plays one voice at a time. DUO plays two: the main keyboard CV and the separate UPPER VOICE output.",
    ref=51, access=SW,
    values=[{"value": "mono", "label": "MONO"}, {"value": "duo", "label": "DUO"}])
par("kbd.repeat", "kbd", "REPEAT (KYBD / OFF / AUTO)", "enum",
    "How triggers are generated. KYBD sends repeating trigger pulses for as long as a key is held. AUTO sends a "
    "stream of triggers at the LFO rate. OFF gives one trigger per key press, which is normal keyboard behaviour.",
    ref=52, access=SW,
    values=[{"value": "kybd", "label": "KYBD"}, {"value": "off", "label": "OFF"}, {"value": "auto", "label": "AUTO"}])
par("kbd.trig_mode", "kbd", "TRIG MODE (SINGLE / MULT)", "enum",
    "SINGLE generates a trigger only when a key is played with no other key down, which is legato behaviour. MULT "
    "generates a trigger on every key press even while other keys are held.",
    ref=53, access=SW,
    values=[{"value": "single", "label": "SINGLE"}, {"value": "mult", "label": "MULT"}])
par("portamento.on", "portamento", "ON / OFF", "boolean",
    "Turns portamento on or off.",
    ref=54, access=SW)
par("portamento.momentary", "portamento", "MOMEN", "boolean",
    "Turns portamento on for as long as the button is held.",
    ref=55, access=BT)
par("portamento.amount", "portamento", "MAX / MIN", "continuous",
    "Strength of the portamento. MAX is the most gradual glide.",
    ref=56, led="white", panel_scale={"min": 0, "max": 10, "unit": "MIN to MAX"})
par("lfo.speed", "lfo", "LFO SPEED", "continuous",
    "Base rate of the LFO, and therefore of the AUTO repeat trigger stream.",
    ref=61, led="yellow", panel_scale={"min": 0, "max": 10},
    physical={"min": 0.25, "max": 25, "unit": "Hz", "taper": "unknown"})
par("lfo.vib_delay", "lfo", "VIB DELAY", "continuous",
    "How long the delayed sine output takes to come in.",
    ref=62, led="yellow", panel_scale={"min": 0, "max": 10})
par("lfo.vib_depth", "lfo", "VIB DEPTH", "continuous",
    "Intensity of the vibrato produced by the delayed sine.",
    ref=63, led="yellow", panel_scale={"min": 0, "max": 10})

# --- preamp, envelope follower, ring mod, noise ---------------------------
par("preamp.range", "preamp", "RANGE (x1000 / x100 / x10)", "enum",
    "Base amplification applied before the GAIN slider: 20, 40 or 60 dB.",
    ref=65, access=SW,
    values=[{"value": "x10", "label": "x10", "meaning": "20 dB"},
            {"value": "x100", "label": "x100", "meaning": "40 dB"},
            {"value": "x1000", "label": "x1000", "meaning": "60 dB"}])
par("preamp.gain", "preamp", "GAIN", "continuous",
    "How strongly the input signal is amplified within the selected range.",
    ref=66, led="white", panel_scale={"min": 0, "max": 10, "unit": "MIN to MAX"})
par("env_follower.sensitivity", "env_follower", "SENSITIVITY", "continuous",
    "Sensitivity of the envelope follower. Listed in the specifications as the input gain slider.",
    ref=69, led="white", panel_scale={"min": 0, "max": 10})
par("ring_mod.level_a", "ring_mod", "VCO 1 level", "continuous",
    "Gain of the VCO1 sawtooth input, combined with anything patched into the VCO1 jack. Unnumbered; the manual "
    "describes it under item 71.",
    led="green", panel_scale={"min": 0, "max": 10})
par("ring_mod.level_b", "ring_mod", "VCO 2 level", "continuous",
    "Gain of the VCO2 sine input, combined with anything patched into the VCO2 jack. Unnumbered; the manual "
    "describes it under item 72.",
    led="green", panel_scale={"min": 0, "max": 10})
par("ring_mod.audio_dc", "ring_mod", "AUDIO / DC", "enum",
    "Optimises the VCO1 input path for audio or for control voltages.",
    ref=73, access=SW,
    values=[{"value": "audio", "label": "AUDIO"}, {"value": "dc", "label": "DC"}])
par("noise.colour", "noise", "COLOR", "continuous",
    "Sweeps the noise spectrum continuously between low frequency, pink and white. A slider, not a switch, so "
    "intermediate settings are valid.",
    ref=75, led="green", panel_scale={"min": 0, "max": 10, "unit": "LOW FREQ to WHITE"})
par("noise.level", "noise", "LEVEL", "continuous",
    "Attenuates the noise signal before its output.",
    ref=76, led="green", panel_scale={"min": 0, "max": 10, "unit": "MIN to MAX"})

# --- voltage processor, S&H ----------------------------------------------
par("inverter1.gain_minus10", "inverter1", "-10 V gain", "continuous",
    "Attenuator on the -10 V input of Inverter 1. Horizontal slider, unnumbered; the jack is item 79.",
    led="white", panel_scale={"min": 0, "max": 10},
    access=[{"type": "panel", "control": "fader", "note": "horizontal"}])
par("inverter1.gain_kbd", "inverter1", "KYBD CV gain", "continuous",
    "Attenuator on the keyboard CV input of Inverter 1. Horizontal slider, unnumbered; the jack is item 80.",
    led="white", panel_scale={"min": 0, "max": 10},
    access=[{"type": "panel", "control": "fader", "note": "horizontal"}])
par("inverter2.gain_plus10", "inverter2", "+10 V gain", "continuous",
    "Attenuator on the +10 V input of Inverter 2. Horizontal slider, unnumbered; the jack is item 81.",
    led="white", panel_scale={"min": 0, "max": 10},
    access=[{"type": "panel", "control": "fader", "note": "horizontal"}])
par("lag.time", "lag", "INCREASE LAG TIME", "continuous",
    "How much the lag processor slows changes at its input. On audio it acts as a low-pass filter.",
    led="white", panel_scale={"min": 0, "max": 10},
    access=[{"type": "panel", "control": "fader", "note": "horizontal"}])
par("sample_hold.level", "sample_hold", "LEVEL", "continuous",
    "Attenuates the input before it reaches the sample and hold circuit.",
    ref=88, led="yellow", panel_scale={"min": 0, "max": 10})
par("sample_hold.rate", "sample_hold", "RATE", "continuous",
    "Speed of the internal clock, and so how often a sample is taken. Does nothing while EXT CLK IN is patched.",
    ref=89, led="yellow", panel_scale={"min": 0, "max": 10})

# --- rear panel -----------------------------------------------------------
par("output.led_brightness", "output", "LED", "continuous",
    "Rear-panel knob setting the brightness of every LED on the front panel. It does not change their colours.",
    ref=93, panel_scale={"min": 0, "max": 10, "unit": "min to max"}, access=KN)
par("kbd.midi_channel", "kbd", "MIDI CHANNEL SWITCHES", "integer",
    "MIDI receive channel, 1 to 16, set by four rear DIP switches. The combinations are printed both in the manual "
    "and on the rear panel itself.",
    ref=94, range={"min": 1, "max": 16},
    access=[{"type": "rear_panel", "control": "dip_switches_x4"}])

D["parameters"] = P

# --------------------------------------------------------------------------
# indicators
# --------------------------------------------------------------------------
D["indicators"] = [
    {"id": "output.power_led", "module": "output", "label": "POWER", "kind": "led", "led_colour": "amber",
     "manual_ref": 92, "function": "Lit when the unit is on."},
    {"id": "panel.slider_leds", "module": "output", "label": "Slider LEDs", "kind": "led", "led_colour": "multi",
     "manual_ref": 93, "function":
        "Every slider cap carries a lit LED. The colour is fixed per slider and is not adjustable; the rear LED knob "
        "changes brightness only. See led_legend for what the colours appear to encode, and the led_colour field on "
        "each parameter for the observed colour of that slider."},
]

D["led_legend"] = {
    "rule": ("A slider's LED takes the colour of the module the signal in it comes from. A module's own sliders "
             "(its frequency, its envelope times, its gain) carry that module's colour, and an attenuator slider for "
             "a pre-wired input carries the colour of the source at the other end. So the five VCF audio sliders read "
             "green, blue, green, blue, green from left to right, matching ring modulator, VCO1, VCO2, VCO3 and noise, "
             "and the pattern repeats wherever those sources appear."),
    "colours": [
        {"colour": "blue", "meaning": "VCO 1 and VCO 3", "modules": ["vco1", "vco3"]},
        {"colour": "green", "meaning": "VCO 2, noise generator, ring modulator, reverb", "modules": ["vco2", "noise", "ring_mod", "reverb"]},
        {"colour": "red", "meaning": "the two envelope generators, AR and ADSR", "modules": ["ar", "adsr"]},
        {"colour": "yellow", "meaning": "the clock and modulation sources: LFO and sample and hold", "modules": ["lfo", "sample_hold"]},
        {"colour": "white", "meaning": "the signal-path and control blocks: VCF, VCA, mixer, keyboard CV, portamento, preamp, envelope follower, voltage processor",
         "modules": ["vcf", "vca", "mixer", "kbd", "portamento", "preamp", "env_follower", "inverter1", "inverter2", "lag"]},
    ],
    "exceptions": [
        "The ring modulator's two sliders are both green although their sources are VCO1 (blue) and VCO2 (green). "
        "This fits the rule rather than breaking it: the manual says those sliders set the gain of the combined "
        "pre-wired and patched signal, so they are the module's own gain controls, not per-source attenuators.",
        "VCO1 and VCO3 share blue, so colour distinguishes signal families rather than individual modules.",
    ],
    "confidence": "inferred",
    "note": ("Read off the front panel photograph. The manual documents the LEDs only as something whose brightness "
             "the rear knob controls; it contains no colour legend at all, and neither do the specifications. Every "
             "observation here is consistent, but the rule itself is a reading, not a documented fact."),
}

# --------------------------------------------------------------------------
# ports
# --------------------------------------------------------------------------
J = []


def jack(id, label, loc, direction, signal, node, function, ref=None, connector="3.5mm TS",
         electrical=None, combine=None, normalled_from=None, confidence=None, note=None):
    j = {"id": id, "label": label}
    if ref is not None:
        j["manual_ref"] = ref
    j["location"] = loc
    j["direction"] = direction
    j["signal"] = signal
    j["connector"] = connector
    j["node"] = node
    if normalled_from:
        j["normalled_from"] = normalled_from
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


CV10 = {"min_v": -10, "max_v": 10}

# VCO inputs
FM_JACKS = [
    ("vco1", "kbd", "KYBD CV", "vco1.kbd_in"), ("vco1", "sh", "S/H OUT", "vco1.fm1"),
    ("vco1", "adsr", "ADSR", "vco1.fm2"), ("vco1", "lfo", "LFO", "vco1.fm3"),
    ("vco2", "kbd", "KYBD CV", "vco2.kbd_in"), ("vco2", "sh", "S/H OUT", "vco2.fm1"),
    ("vco2", "adsr", "ADSR", "vco2.fm2"), ("vco2", "vco1", "VCO 1", "vco2.fm3"),
    ("vco3", "kbd", "KYBD CV", "vco3.kbd_in"), ("vco3", "noise", "NOISE GEN", "vco3.fm1"),
    ("vco3", "adsr", "ADSR", "vco3.fm2"), ("vco3", "vco2", "VCO 2", "vco3.fm3"),
]
for m, src, label, node in FM_JACKS:
    jack(f"jack.{m}_fm_{src}", f"FM CONTROL {label}", "patch_in", "in", "cv", node,
         f"Frequency modulation input on {m.upper()}, pre-wired from {label}. Inserting a plug breaks that "
         "pre-wired connection, as the panel graphic below the jack shows.",
         ref=7, electrical=CV10, combine="replace")
jack("jack.vco2_pwm", "PWM (NOISE GEN)", "patch_in", "in", "cv", "vco2.pwm_in",
     "Pulse width modulation input on VCO2, pre-wired from the noise generator. Inserting a plug breaks the "
     "pre-wire and the incoming voltage takes over from the PULSE WIDTH slider.",
     ref=8, electrical={"min_v": -5, "max_v": 5, "scaling": "1 V per 10% duty"}, combine="replace")
jack("jack.vco3_pwm", "PWM (ADSR)", "patch_in", "in", "cv", "vco3.pwm_in",
     "Pulse width modulation input on VCO3, pre-wired from the ADSR.",
     ref=8, electrical={"min_v": -5, "max_v": 5, "scaling": "1 V per 10% duty"}, combine="replace")

# VCO outputs
for m, waves in [("vco1", ["saw", "pulse"]), ("vco2", ["tri", "saw", "sine", "pulse"]), ("vco3", ["tri", "saw", "sine", "pulse"])]:
    for w in waves:
        imp = {"saw": 1000, "pulse": 800, "tri": 1000, "sine": 1000}[w]
        jack(f"jack.{m}_{w}", f"OUTPUT ({w.upper()})", "patch_out", "out", "cv_or_audio", f"{m}.{w}",
             f"{w.title()} output of {m.upper()}. Carries audio or, with the oscillator in LF, a modulation signal."
             + (" The manual adds that the PULSE outputs can also be used to mix in a signal from another section." if w == "pulse" else ""),
             ref=5, electrical={"impedance_ohm": imp})

# VCF
for src, node, label in [("ring", "vcf.audio_ring", "RING MOD"), ("vco1", "vcf.audio_vco1", "VCO 1"),
                         ("vco2", "vcf.audio_vco2", "VCO 2"), ("vco3", "vcf.audio_vco3", "VCO 3"),
                         ("noise", "vcf.audio_noise", "NOISE GEN")]:
    jack(f"jack.vcf_audio_{src}", f"AUDIO ({label})", "patch_in", "in", "audio", node,
         f"Audio input to the VCF, pre-wired from {label}. Inserting a plug breaks the pre-wire.",
         ref=14, electrical={"impedance_ohm": 50000}, combine="replace")
for src, node, label in [("kbd", "vcf.ctrl_kbd", "KYBD CV"), ("adsr", "vcf.ctrl_adsr", "ADSR"), ("vco2", "vcf.ctrl_vco2", "VCO 2 sine")]:
    jack(f"jack.vcf_ctrl_{src}", f"CONTROL ({label})", "patch_in", "in", "cv", node,
         f"Cutoff control input, pre-wired from {label}. Inserting a plug breaks the pre-wire.",
         ref=15, electrical=CV10, combine="replace")
jack("jack.vcf_out", "OUTPUT", "patch_out", "out", "audio", "vcf.out",
     "VCF output, for use anywhere the pre-wired VCF signal is not available.",
     ref=13, electrical={"impedance_ohm": 1000})

# envelopes
jack("jack.ar_out", "OUTPUT (AR)", "patch_out", "out", "cv", "ar.out",
     "AR envelope output, for use where no pre-wired AR connection exists.",
     ref=21, electrical={"min_v": 0, "max_v": 10})
jack("jack.sh_clock_in", "S&H CLOCK", "patch_in", "in", "clock", "trigger_bus.sh_clock_in",
     "Substitutes an external signal for the sample and hold output feeding the envelope routing switch.",
     ref=22, electrical={"threshold_v": 6})
jack("jack.trig_in", "TRIG IN", "patch_in", "in", "gate", "trigger_bus.trig_jack_in",
     "External trigger into the envelope routing switches.",
     ref=23, electrical={"threshold_v": 5})
jack("jack.gate_in_ar", "GATE IN (AR)", "patch_in", "in", "gate", "trigger_bus.gate_jack_in",
     "External gate into the AR and ADSR circuits.",
     ref=24, electrical={"threshold_v": 4})
jack("jack.adsr_out", "OUTPUT (ADSR)", "patch_out", "out", "cv", "adsr.out",
     "ADSR envelope output, for use where no pre-wired ADSR connection exists.",
     ref=30, electrical={"min_v": 0, "max_v": 10})
jack("jack.gate_in_adsr", "GATE IN (ADSR)", "patch_in", "in", "gate", "trigger_bus.gate_jack_in",
     "Gate input in the ADSR block. The manual numbers two separate GATE IN jacks (24 and 31) while the "
     "specifications count only one.",
     ref=31, electrical={"threshold_v": 4},
     note="Modelled as a second jack onto the same node, following the manual rather than the specifications.")

# VCA
jack("jack.vca_audio_vcf", "AUDIO (VCF)", "patch_in", "in", "audio", "vca.audio_vcf",
     "Audio into the VCA, pre-wired from the VCF. Inserting a plug disables that pre-wire.",
     ref=35, electrical={"impedance_ohm": 50000}, combine="replace")
jack("jack.vca_audio_ring", "AUDIO (RING MOD)", "patch_in", "in", "audio", "vca.audio_ring",
     "Audio into the VCA, pre-wired from the ring modulator.",
     ref=35, electrical={"impedance_ohm": 50000}, combine="replace")
jack("jack.vca_ctrl_lin", "CNTRL (LIN)", "patch_in", "in", "cv", "vca.ctrl_lin",
     "Linear gain control input, pre-wired from the AR. Inserting a plug disables that pre-wire.",
     ref=36, electrical=CV10, combine="replace")
jack("jack.vca_ctrl_exp", "CNTRL (EXP'L)", "patch_in", "in", "cv", "vca.ctrl_exp",
     "Exponential gain control input, pre-wired from the ADSR.",
     ref=36, electrical=CV10, combine="replace")
jack("jack.vca_out", "OUTPUT", "patch_out", "out", "audio", "vca.out",
     "VCA output, for use where the pre-wired VCA signal is not available.",
     ref=37, electrical={"impedance_ohm": 1000})

# mixer / reverb / output
jack("jack.mixer_audio_vcf", "AUDIO (VCF)", "patch_in", "in", "audio", "mixer.in_vcf",
     "Audio into the mixer, pre-wired from the VCF. Inserting a plug disables that pre-wire.",
     ref=38, electrical={"impedance_ohm": 50000}, combine="replace")
jack("jack.mixer_audio_vca", "AUDIO (VCA)", "patch_in", "in", "audio", "mixer.in_vca",
     "Audio into the mixer, pre-wired from the VCA.",
     ref=38, electrical={"impedance_ohm": 50000}, combine="replace")
jack("jack.post_atten_vcf", "POST-ATTENUATOR OUTPUT (VCF)", "patch_out", "out", "cv_or_audio", "mixer.post_atten_vcf",
     "Taps the mixer's VCF channel immediately after its attenuator slider, so the slider can be used to scale audio "
     "or control voltage for use elsewhere.",
     ref=39, electrical={"impedance_ohm": 1000},
     note="An output taken from an input node. The attenuator output is a tap, not a separate stage.")
jack("jack.post_atten_vca", "POST-ATTENUATOR OUTPUT (VCA)", "patch_out", "out", "cv_or_audio", "mixer.post_atten_vca",
     "Taps the mixer's VCA channel immediately after its attenuator slider.",
     ref=39, electrical={"impedance_ohm": 1000})
jack("jack.post_mixer", "POST-MIXER OUTPUT", "patch_in", "in", "audio", "mixer.pan_in",
     "Breaks the connection from the mixer sum to the PAN slider and substitutes whatever is patched in. The mixer "
     "sum still reaches the reverb over its own pre-wired connection.",
     ref=40, electrical={"impedance_ohm": 1000}, combine="replace")
jack("jack.mixer_out", "MIXER OUT", "patch_out", "out", "audio", "mixer.sum_out",
     "Extra mixer output, tapping the pre-wired feed into the reverb.",
     ref=42, electrical={"impedance_ohm": 1000})
jack("jack.reverb_out", "REVERB OUT", "patch_out", "out", "audio", "reverb.right",
     "Taps the right reverb signal for use elsewhere.",
     ref=43, electrical={"impedance_ohm": 1000})
jack("jack.reverb_left_in", "LEFT INPUT", "patch_in", "in", "audio", "reverb.left_in",
     "Adds a signal to the reverb's left output, summed there and panned hard left.",
     ref=44, electrical={"impedance_ohm": 50000}, combine="sum")
jack("jack.reverb_right_in", "RIGHT INPUT", "patch_in", "in", "audio", "reverb.right_in",
     "Adds a signal to the reverb's right output, summed there and panned hard right.",
     ref=45, electrical={"impedance_ohm": 50000}, combine="sum")
jack("jack.out_l_quarter", "L OUTPUT (1/4\")", "top", "out", "audio", "output.left",
     "Main left output for amplifiers, speakers or outboard.",
     ref=46, connector="6.35mm TS, unbalanced", electrical={"impedance_ohm": 500})
jack("jack.out_r_quarter", "R OUTPUT (1/4\")", "top", "out", "audio", "output.right",
     "Main right output.",
     ref=46, connector="6.35mm TS, unbalanced", electrical={"impedance_ohm": 500})
jack("jack.out_l_mini", "L OUTPUT (3.5 mm)", "patch_out", "out", "audio", "output.left",
     "Left output in parallel with the 1/4-inch jack, for sending the final mix back into other parts of the synth.",
     ref=46, electrical={"impedance_ohm": 500})
jack("jack.out_r_mini", "R OUTPUT (3.5 mm)", "patch_out", "out", "audio", "output.right",
     "Right output in parallel with the 1/4-inch jack.",
     ref=46, electrical={"impedance_ohm": 500})
jack("jack.phones", "PHONES", "top", "out", "audio", "output.phones",
     "Headphone socket, fed from the mixer output, with its own level knob below.",
     ref=91, connector="3.5mm TRS", electrical={"max_level_dbu": 5, "impedance_ohm": 8})

# keyboard / LFO
jack("jack.trig_out", "TRIG OUT", "patch_out", "out", "gate", "kbd.trig",
     "Keyboard trigger output.", ref=47, electrical={"level_v": 14})
jack("jack.gate_out", "GATE OUT", "patch_out", "out", "gate", "kbd.gate",
     "Keyboard gate output.", ref=48, electrical={"level_v": 10})
jack("jack.upper_voice", "UPPER VOICE", "patch_out", "out", "cv", "kbd.upper_cv",
     "Control voltage for the highest note held, active in DUO voice mode.",
     ref=49, electrical={"max_v": 10})
jack("jack.kybd_cv", "KYBD CV", "patch_out", "out", "cv", "kbd.cv",
     "The full keyboard control voltage, for use elsewhere.",
     ref=50, electrical={"max_v": 7, "scaling": "1 V/octave", "note": "the 1 V/octave scaling is the ARP convention and is not stated in this manual"},
     confidence="inferred")
jack("jack.lfo_saw", "LFO (SAW)", "patch_out", "out", "cv", "lfo.saw",
     "Sawtooth LFO output.", ref=57, electrical={"impedance_ohm": 1000},
     note="The specifications label this output triangle while the panel and the controls list both say sawtooth.")
jack("jack.lfo_square", "LFO (SQUARE)", "patch_out", "out", "cv", "lfo.square",
     "Square LFO output.", ref=58, electrical={"impedance_ohm": 1800})
jack("jack.ext_vib_in", "EXT VIB IN", "patch_in", "in", "cv", "lfo.ext_vib_in",
     "Routes an external LFO in to blend with the delayed sine.",
     ref=59, electrical={"impedance_ohm": 50000}, combine="sum")
jack("jack.lfo_sine_delayed", "LFO (SINE) DELAYED", "patch_out", "out", "cv", "lfo.sine_delayed",
     "Copy of the LFO's pre-wired sine output, delayed by the VIB DELAY slider.",
     ref=60, electrical={"impedance_ohm": 1000})

# preamp / env follower / ring mod / noise
jack("jack.preamp_in", "PREAMP INPUT", "patch_in", "in", "audio", "preamp.in",
     "External signal into the preamp.", ref=64, electrical={"impedance_ohm": 100000})
jack("jack.preamp_out", "PREAMP OUTPUT", "patch_out", "out", "audio", "preamp.out",
     "Copy of the preamp signal for use elsewhere. Maximum gain depends on the RANGE switch: +20, +40 or +60 dBu.",
     ref=67, electrical={"max_gain_dbu": [20, 40, 60]})
jack("jack.env_follower_in", "PREAMP INPUT (env follower)", "patch_in", "in", "audio", "env_follower.in",
     "Bypasses the preamp and feeds the envelope follower directly, or blends with the pre-wired preamp signal.",
     ref=68, electrical={"impedance_ohm": 100000}, combine="sum")
jack("jack.env_follower_out", "OUTPUT (ENV FOLLOWER)", "patch_out", "out", "cv", "env_follower.out",
     "Envelope follower output. There is no pre-wired destination for it, so it only does anything when patched.",
     ref=70, electrical={"max_v": 14})
jack("jack.ring_in_a", "VCO 1", "patch_in", "in", "cv_or_audio", "ring_mod.in_a",
     "External signal blended with the pre-wired VCO1 sawtooth. Unlike most jacks on this panel it adds to the "
     "pre-wire rather than breaking it.",
     ref=71, electrical={"impedance_ohm": 100000}, combine="sum")
jack("jack.ring_in_b", "VCO 2", "patch_in", "in", "cv_or_audio", "ring_mod.in_b",
     "External signal blended with the pre-wired VCO2 sine.",
     ref=72, electrical={"impedance_ohm": 100000}, combine="sum")
jack("jack.ring_out", "RING MOD OUTPUT", "patch_out", "out", "audio", "ring_mod.out",
     "Ring modulator output.", ref=74, electrical={"min_v": -10, "max_v": 10})
jack("jack.noise_out", "NOISE GENERATOR OUTPUT", "patch_out", "out", "audio", "noise.out",
     "Noise output, for use where no pre-wired noise connection exists.",
     ref=77, electrical={"min_v": -10, "max_v": 10})

# voltage processor
jack("jack.vp_in1", "Input 1", "patch_in", "in", "cv_or_audio", "inverter1.in1",
     "Unattenuated input to Inverter 1.", ref="1", electrical={"max_v": 10}, combine="sum")
jack("jack.vp_minus10", "-10 V", "patch_in", "in", "cv_or_audio", "inverter1.in2",
     "Attenuated input to Inverter 1. The manual says it attenuates the input by 10 V; the panel marking and the "
     "specifications describe it as the -10 V input with its own gain slider.",
     ref=79, electrical={"max_v": 10}, combine="sum")
jack("jack.vp_in3", "Input 3", "patch_in", "in", "cv_or_audio", "inverter1.in3",
     "Unattenuated input to Inverter 1.", ref="3", electrical={"max_v": 10}, combine="sum")
jack("jack.vp_kbd", "KYBD CV", "patch_in", "in", "cv", "inverter1.in4",
     "Input to Inverter 1 optimised for keyboard control voltage, with its own gain slider.",
     ref=80, electrical={"max_v": 10}, combine="sum")
jack("jack.vp_in5", "Input 5", "patch_in", "in", "cv_or_audio", "inverter2.in5",
     "Unattenuated input to Inverter 2.", ref="5", electrical={"max_v": 10}, combine="sum")
jack("jack.vp_plus10", "+10 V", "patch_in", "in", "cv_or_audio", "inverter2.in6",
     "Attenuated input to Inverter 2, with its own gain slider.",
     ref=81, electrical={"max_v": 10}, combine="sum")
jack("jack.vp_env_foll", "ENV FOLL", "patch_in", "in", "cv_or_audio", "lag.in",
     "Input to the lag processor. Accepts control voltages or audio but is set up for the envelope follower output.",
     ref=82, electrical={"max_v": 10})
jack("jack.inverter1_out", "Inverter 1 output", "patch_out", "out", "cv_or_audio", "inverter1.out",
     "Sum of inputs 1 to 4, inverted.", electrical={"min_v": -10, "max_v": 10})
jack("jack.inverter2_out", "Inverter 2 output", "patch_out", "out", "cv_or_audio", "inverter2.out",
     "Sum of inputs 5 and 6, inverted.", electrical={"min_v": -10, "max_v": 10})
jack("jack.lag_out", "LAG", "patch_out", "out", "cv_or_audio", "lag.out",
     "Lag processor output.", ref=83, electrical={"min_v": -10, "max_v": 10})
for i in (1, 2, 3, 4):
    jack(f"jack.mult{i}", f"MULT {i}", "patch_in" if i in (1, 2) else "patch_out",
         "in" if i in (1, 2) else "out", "cv_or_audio",
         "mult.bus_in" if i in (1, 2) else "mult.bus_out",
         "One of four jacks wired directly in parallel. Any of them can be an input or an output; the split into "
         "inputs and outputs here is a modelling convenience, not a property of the hardware.",
         ref=78, confidence="inferred")

# sample & hold / electronic switch
jack("jack.sh_noise_in", "NOISE GENERATOR", "patch_in", "in", "cv_or_audio", "sample_hold.in",
     "Interrupts the pre-wired noise feed into the sample and hold and substitutes whatever is patched in.",
     ref=84, electrical={"impedance_ohm": 50000}, combine="replace")
jack("jack.sh_int_clock_out", "INT CLOCK OUT", "patch_out", "out", "clock", "sample_hold.clock_out",
     "Exports the internally generated clock.", ref=85, electrical={"max_v": 10})
jack("jack.sh_out", "S/H OUT", "patch_out", "out", "cv", "sample_hold.out",
     "Sample and hold output, for use where no pre-wired connection exists.",
     ref=86, electrical={"max_v": 14})
jack("jack.sh_ext_clock", "EXT CLK IN", "patch_in", "in", "clock", "sample_hold.clock_in",
     "Runs the sample and hold from an external clock. Inserting a plug disables the internal clock generator and "
     "the RATE slider with it. Any square or pulse wave, or a keyboard gate or trigger, will do.",
     ref=87, electrical={"threshold_v": 3}, combine="replace")
jack("jack.elec_a", "ELEC SWITCH A", "patch_in", "in", "cv_or_audio", "elec_switch.a_in",
     "Electronic switch terminal A. Bidirectional: an input when C is the output, an output when C is the input.",
     ref=90, confidence="inferred",
     note="Modelled with separate in and out jack entries per terminal because the schema's direction field is "
          "single-valued; the hardware has one jack per terminal.")
jack("jack.elec_a_out", "ELEC SWITCH A (out)", "patch_out", "out", "cv_or_audio", "elec_switch.a_out",
     "The same physical A jack acting as an output.", ref=90, confidence="inferred")
jack("jack.elec_b", "ELEC SWITCH B", "patch_in", "in", "cv_or_audio", "elec_switch.b_in",
     "Electronic switch terminal B.", ref=90, confidence="inferred")
jack("jack.elec_b_out", "ELEC SWITCH B (out)", "patch_out", "out", "cv_or_audio", "elec_switch.b_out",
     "The same physical B jack acting as an output.", ref=90, confidence="inferred")
jack("jack.elec_c", "ELEC SWITCH C", "patch_in", "in", "cv_or_audio", "elec_switch.c_in",
     "Electronic switch terminal C, the common side.", ref=90, confidence="inferred")
jack("jack.elec_c_out", "ELEC SWITCH C (out)", "patch_out", "out", "cv_or_audio", "elec_switch.c_out",
     "The same physical C jack acting as an output.", ref=90, confidence="inferred")

# rear panel
jack("jack.interval_latch", "INTERVAL LATCH", "rear", "in", "gate", None,
     "Footswitch input. In DUO voice mode, holding two notes and pressing the footswitch keeps that interval while "
     "you carry on playing single notes.",
     ref=95, connector="6.35mm TRS")
jack("jack.portamento_footswitch", "PORTAMENTO FOOTSWITCH", "rear", "in", "gate", None,
     "Footswitch input turning portamento on and off.", ref=96, connector="6.35mm TRS")
jack("jack.midi_in", "MIDI IN", "rear", "in", "midi", None,
     "MIDI from a keyboard, sequencer or computer.", ref=97, connector="DIN-5")
jack("jack.midi_thru", "MIDI THRU", "rear", "out", "midi", None,
     "Passes through the data arriving at MIDI IN.", ref=98, connector="DIN-5")
jack("jack.usb", "USB PORT", "rear", "bidirectional", "midi", None,
     "Class-compliant USB MIDI, in and out.", ref=99, connector="USB-B")
jack("jack.dc_in", "DC INPUT", "rear", "in", "power", None,
     "12 V DC from the supplied adaptor, which runs on 100 to 240 V at 50 or 60 Hz.",
     ref=100, connector="barrel", electrical={"voltage_v": 12, "current_ma": 2000})

D["ports"] = J

# --------------------------------------------------------------------------
# connections
# --------------------------------------------------------------------------
C = []


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


# keyboard and portamento
con("c01", "kbd.cv", "portamento.in", "cv", "fixed")
con("c02", "kbd.gate", "trigger_bus.kbd_gate_in", "gate", "fixed")
con("c03", "kbd.trig", "trigger_bus.kbd_trig_in", "gate", "fixed")

# pre-wired normals, all breakable at the jack above the slider
PREWIRE = [
    ("c10", "portamento.out", "vco1.kbd_in", "cv", "jack.vco1_fm_kbd", None),
    ("c11", "sample_hold.out", "vco1.fm1", "cv", "jack.vco1_fm_sh", "vco1.fm_sh"),
    ("c12", "adsr.out", "vco1.fm2", "cv", "jack.vco1_fm_adsr", "vco1.fm_adsr"),
    ("c13", "lfo.sine", "vco1.fm3", "cv", "jack.vco1_fm_lfo", "vco1.fm_lfo"),
    ("c14", "portamento.out", "vco2.kbd_in", "cv", "jack.vco2_fm_kbd", None),
    ("c15", "sample_hold.out", "vco2.fm1", "cv", "jack.vco2_fm_sh", "vco2.fm_sh"),
    ("c16", "adsr.out", "vco2.fm2", "cv", "jack.vco2_fm_adsr", "vco2.fm_adsr"),
    ("c17", "vco1.pulse", "vco2.fm3", "cv", "jack.vco2_fm_vco1", "vco2.fm_vco1"),
    ("c18", "noise.out", "vco2.pwm_in", "cv", "jack.vco2_pwm", "vco2.pwm_noise"),
    ("c19", "portamento.out", "vco3.kbd_in", "cv", "jack.vco3_fm_kbd", None),
    ("c20", "noise.out", "vco3.fm1", "cv", "jack.vco3_fm_noise", "vco3.fm_noise"),
    ("c21", "adsr.out", "vco3.fm2", "cv", "jack.vco3_fm_adsr", "vco3.fm_adsr"),
    ("c22", "vco2.sine", "vco3.fm3", "cv", "jack.vco3_fm_vco2", "vco3.fm_vco2"),
    ("c23", "adsr.out", "vco3.pwm_in", "cv", "jack.vco3_pwm", "vco3.pwm_adsr"),
    ("c24", "ring_mod.out", "vcf.audio_ring", "audio", "jack.vcf_audio_ring", "vcf.lvl_ring"),
    ("c25", "vco1.pulse", "vcf.audio_vco1", "audio", "jack.vcf_audio_vco1", "vcf.lvl_vco1"),
    ("c26", "vco2.pulse", "vcf.audio_vco2", "audio", "jack.vcf_audio_vco2", "vcf.lvl_vco2"),
    ("c27", "vco3.saw", "vcf.audio_vco3", "audio", "jack.vcf_audio_vco3", "vcf.lvl_vco3"),
    ("c28", "noise.out", "vcf.audio_noise", "audio", "jack.vcf_audio_noise", "vcf.lvl_noise"),
    ("c29", "portamento.out", "vcf.ctrl_kbd", "cv", "jack.vcf_ctrl_kbd", "vcf.lvl_kbd"),
    ("c30", "adsr.out", "vcf.ctrl_adsr", "cv", "jack.vcf_ctrl_adsr", "vcf.lvl_adsr"),
    ("c31", "vco2.sine", "vcf.ctrl_vco2", "cv", "jack.vcf_ctrl_vco2", "vcf.lvl_vco2_sine"),
    ("c32", "vcf.out", "vca.audio_vcf", "audio", "jack.vca_audio_vcf", "vca.lvl_vcf"),
    ("c33", "ring_mod.out", "vca.audio_ring", "audio", "jack.vca_audio_ring", "vca.lvl_ring"),
    ("c34", "ar.out", "vca.ctrl_lin", "cv", "jack.vca_ctrl_lin", "vca.lvl_ar"),
    ("c35", "adsr.out", "vca.ctrl_exp", "cv", "jack.vca_ctrl_exp", "vca.lvl_adsr"),
    ("c36", "vcf.out", "mixer.in_vcf", "audio", "jack.mixer_audio_vcf", "mixer.lvl_vcf"),
    ("c37", "vca.out", "mixer.in_vca", "audio", "jack.mixer_audio_vca", "mixer.lvl_vca"),
    ("c38", "noise.out", "sample_hold.in", "cv_or_audio", "jack.sh_noise_in", "sample_hold.level"),
    ("c39", "preamp.out", "env_follower.in", "audio", "jack.env_follower_in", None),
    ("c40", "mixer.sum_out", "mixer.pan_in", "audio", "jack.post_mixer", None),
]
for cid, frm, to, sig, brk, amount in PREWIRE:
    kw = {"broken_by": brk}
    if amount:
        kw["amount"] = amount
    con(cid, frm, to, sig, "normalled", **kw)
C[-2]["note"] = "The envelope follower input jack blends rather than replaces, so this normal is only partly broken."
C[-1]["note"] = "Breaking this normal does not stop the mixer sum reaching the reverb; that is a separate pre-wire."

# ring modulator inputs blend rather than break
con("c41", "vco1.saw", "ring_mod.in_a", "audio", "fixed", amount="ring_mod.level_a",
    note="Pre-wired, but the VCO1 jack sums with it rather than breaking it, so this is not a normalled connection.")
con("c42", "vco2.sine", "ring_mod.in_b", "audio", "fixed", amount="ring_mod.level_b",
    note="Pre-wired, but the VCO2 jack sums with it rather than breaking it.")

# sync
con("c43", "vco1.saw", "vco2.sync_in", "sync", "switched",
    enabled_when={"param": "vco2.sync", "equals": True},
    confidence="inferred",
    note="The manual says SYNC locks VCO2 to VCO1 but does not say which VCO1 output drives the sync input.")
con("c44", "vco1.saw", "vco3.sync_in", "sync", "switched",
    enabled_when={"param": "vco3.sync", "equals": True}, confidence="inferred")

# envelope triggering
con("c50", "sample_hold.clock_out", "trigger_bus.sh_clock_in", "clock", "normalled", broken_by="jack.sh_clock_in")
con("c51", "trigger_bus.out", "ar.gate_in", "gate", "fixed")
con("c52", "trigger_bus.out", "adsr.gate_in", "gate", "fixed")

# signal path onwards
# internal routing that the graph does not carry, recorded as behaviours below:
# mixer pan, LFO vibrato delay, electronic switch crosspoints, voltage processor summing, mult bus.
con("c60", "mixer.sum_out", "output.left_in", "audio", "fixed", amount="mixer.pan",
    note="Panned feed to the left output. PAN is modelled as the amount on both output legs.")
con("c61", "mixer.sum_out", "output.right_in", "audio", "fixed", amount="mixer.pan")
con("c62", "mixer.sum_out", "reverb.in", "audio", "fixed",
    note="Separate pre-wire from the mixer sum into the reverb, which the POST-MIXER jack does not break.")
con("c65", "reverb.left", "output.left_in", "audio", "fixed", amount="reverb.level_left")
con("c66", "reverb.right", "output.right_in", "audio", "fixed", amount="reverb.level_right")

# LFO and clocks
con("c71", "sample_hold.clock_out", "elec_switch.c_in", "clock", "fixed",
    note="The switching rate of the electronic switch is set by the sample and hold internal clock. The clock gates "
         "the switch rather than passing through it; modelled as a connection for want of a clock-control node.",
    confidence="inferred")

D["connections"] = C

# --------------------------------------------------------------------------
# behaviours
# --------------------------------------------------------------------------
D["behaviours"] = [
    {"id": "b01", "name": "Pre-wiring and normalling", "applies_to": ["vco1", "vco2", "vco3", "vcf", "vca", "mixer", "sample_hold"],
     "rule": "Every pre-wired connection is drawn on the panel as an orange line ending in a labelled box. Directly "
             "above the box is a jack, and directly above that a slider. The slider attenuates whatever reaches that "
             "input. Inserting a plug into the jack breaks the factory connection and substitutes the patched signal, "
             "which the slider then attenuates instead. The ring modulator and envelope follower inputs are the "
             "exceptions: they blend with the pre-wired signal rather than replacing it."},
    {"id": "b02", "name": "Parallel VCF and VCA", "applies_to": ["vcf", "vca", "mixer"],
     "rule": "Unlike a conventional subtractive voice, the VCA does not sit after the filter. The VCF feeds the VCA, "
             "but the mixer takes both the VCF output and the VCA output as separate channels, so the two are blended "
             "rather than cascaded. Dialling the mixer's VCF channel up gives unshaped filter output alongside the "
             "amplitude-shaped path."},
    {"id": "b03", "name": "VCO as LFO", "applies_to": ["vco1", "vco2", "vco3"],
     "rule": "Moving a VCO's AUDIO/LF switch to LF shifts all four frequency ranges down to 0.03, 0.3, 3.0 and 30 Hz "
             "and disables keyboard control automatically. The oscillator keeps all of its outputs, so it becomes a "
             "multi-waveform modulation source with the same panel controls."},
    {"id": "b04", "name": "Envelope triggering", "applies_to": ["trigger_bus", "ar", "adsr", "kbd"],
     "rule": "Each envelope has a three-way routing switch choosing the pre-wired S/H CLOCK, the GATE IN jack or the "
             "TRIG IN jack, and a MANUAL button that fires both generators by hand. The keyboard's own gate and "
             "trigger also reach them. How these sources combine, and whether the routing switch replaces the "
             "keyboard or sits alongside it, is not stated.",
     "confidence": "inferred"},
    {"id": "b05", "name": "Keyboard repeat and trigger modes", "applies_to": ["kbd", "lfo"],
     "rule": "REPEAT set to KYBD sends repeating triggers while a key is held; AUTO sends a stream at the LFO rate; "
             "OFF gives one trigger per press. Independently, TRIG MODE SINGLE only triggers when no other key is "
             "held (legato), while MULT triggers on every press. Together they decide whether held notes re-fire the "
             "envelopes."},
    {"id": "b06", "name": "Duophonic keyboard", "applies_to": ["kbd"],
     "rule": "In DUO mode the keyboard produces two control voltages: the main KYBD CV and the UPPER VOICE output "
             "for the highest note held. The rear INTERVAL LATCH footswitch freezes the interval between the two so "
             "that further single notes keep it. Only the main CV is pre-wired to the oscillators; using the second "
             "voice means patching UPPER VOICE somewhere."},
    {"id": "b07", "name": "Sample and hold clocking", "applies_to": ["sample_hold", "elec_switch"],
     "rule": "The internal clock drives the sampling, the electronic switch's alternation, and, through the envelope "
             "routing switches, the envelopes. Patching EXT CLK IN disables the internal clock entirely, which also "
             "makes the RATE slider inert."},
    {"id": "b08", "name": "Voltage processor summing", "applies_to": ["inverter1", "inverter2", "lag"],
     "rule": "Inverter 1 sums its four inputs and inverts the result, so +10 V in gives -10 V out and audio comes out "
             "180 degrees out of phase. Inverter 2 does the same for two inputs. The lag processor slews its input; "
             "on audio that reads as a low-pass filter. None of the three has a pre-wired destination, so the "
             "voltage processor only does anything when patched."},
    {"id": "b09", "name": "Mult is passive", "applies_to": ["mult"],
     "rule": "The four MULT jacks are wired directly together with no buffering, so they work in any combination of "
             "inputs and outputs. Loading and mixing behave as passive parallel connections do: several sources "
             "joined at a mult sum and interact rather than staying independent."},
    {"id": "b10", "name": "Envelope times", "applies_to": ["ar", "adsr"],
     "rule": "Both generators output 0 to +10 V. The TIME FACTOR switch multiplies the whole envelope's timing by "
             "0.5, 1 or 2. No absolute times in seconds are given anywhere in the manual or specifications."},
    {"id": "b11", "name": "Composite oscillator outputs", "applies_to": ["vco1", "vco2", "vco3"],
     "rule": "The manual states that each VCO's PULSE output can also be used to mix in a signal from another "
             "section: the LFO for VCO1, the noise generator for VCO2, the ADSR for VCO3. This reads as the "
             "modulation source appearing at the pulse jack alongside the oscillator, but the mechanism is not "
             "explained and no slider is identified.",
     "confidence": "speculative"},
    {"id": "b12", "name": "Electronic switch crosspoints", "applies_to": ["elec_switch", "sample_hold"],
     "rule": "The three terminals are bidirectional. Either C is the input and the signal alternates between the A "
             "and B outputs, or A and B are two inputs and C alternates between them. The alternation rate is the "
             "sample and hold internal clock, so it follows the RATE slider unless EXT CLK IN is patched. The "
             "crosspoints are internal to the module and so do not appear in connections."},
    {"id": "b13", "name": "LFO vibrato delay", "applies_to": ["lfo", "vco1"],
     "rule": "VIB DELAY sets how long the sine takes to fade in and VIB DEPTH its intensity. The manual describes "
             "both as acting on the delayed sine, and describes the LFO (SINE) DELAYED jack as a delayed copy of the "
             "LFO's pre-wired sine output. Whether the pre-wire to VCO1 carries the delayed sine or the plain one is "
             "therefore unclear; this file wires the plain sine to VCO1 and exposes the delayed copy at the jack.",
     "confidence": "inferred"},
    {"id": "b14", "name": "Pan and the stereo output", "applies_to": ["mixer", "reverb", "output"],
     "rule": "The mixer sum passes through PAN into the left and right outputs, and separately into the reverb, whose "
             "left and right levels are set by their own sliders and summed into the same outputs. The POST-MIXER "
             "jack breaks the feed into PAN but not the feed into the reverb, so patching it leaves the reverb still "
             "hearing the mixer."},
]

# --------------------------------------------------------------------------
# midi, specifications, provenance
# --------------------------------------------------------------------------
D["midi"] = {
    "receives": ["note_on", "note_off"],
    "transmits": ["MIDI THRU: pass-through of MIDI IN", "USB: in and out, class compliant"],
    "channel": {"range": [1, 16], "set_by": "four rear DIP switches, table printed on the rear panel and in the manual"},
    "note_to_cv": {"kybd_cv_max_v": 7, "scaling": "1 V/octave (ARP convention; not stated in this manual)",
                   "zero_volt_note": None},
    "usb": {"class_compliant": True, "spec": "USB 2.0, type B",
            "os": "Windows 7 or higher, Mac OS X 10.6.8 or higher"},
    "cc_map": None,
    "sysex": None,
    "pitch_bend": "not mentioned",
    "clock": "not stated whether MIDI clock can drive the sample and hold clock or the repeat function",
}

D["specifications"] = {
    "voices": "Multiphonic (ARP's term; mono or duo in practice)",
    "vco": {"count": 3, "frequency_hz": {"min": 0.03, "max": 40000}, "ranges": "4 overlapping"},
    "lfo_hz": {"min": 0.25, "max": 25},
    "vcf": "1 x 4-pole low pass, 24 dB/octave, switchable 4012 or 4072 circuit",
    "envelopes": ["AR", "ADSR"],
    "effects": "digital spring reverb (the BLUE MARVIN edition has a real spring tank)",
    "envelope_output_v": {"min": 0, "max": 10},
    "impedances": {"vcf_audio_in_ohm": 50000, "vca_audio_in_ohm": 50000, "ring_mod_in_ohm": 100000,
                   "preamp_in_ohm": 100000, "vco_out_saw_ohm": 1000, "vco_out_pulse_ohm": 800,
                   "main_out_ohm": 500, "phones_ohm": 8},
    "thresholds_v": {"gate_in": 4, "trig_in": 5, "sh_clock": 6, "ext_clock": 3},
    "power": {"adaptor": "12 V DC, 2000 mA", "consumption_w_max": 15},
    "dimensions_mm": {"w": 482, "h": 356, "d": 108},
    "rack": {"units": "19 inch", "eurorack_hp": 95},
    "weight_kg": 5.1,
}

D["omitted_from_source"] = [
    "safety and legal text in nine languages",
    "warranty, registration and FCC/EU declarations",
    "non-English duplicates of the controls section (Spanish, French, German, Portuguese, Italian, Dutch, Swedish, Polish, Japanese, Chinese)",
    "the MIDI channel DIP switch table, which is reproducible from the rear panel silk-screen",
]

D["not_in_source"] = [
    "any legend for the LED colours; the manual mentions the LEDs only as something the rear knob dims",
    "numbering for the roughly thirty pre-wired attenuator sliders, which the specifications list but the controls section never numbers",
    "envelope times in seconds, for either generator, at any TIME FACTOR setting",
    "cutoff frequency range of the VCF in Hz, and any statement on self-oscillation at maximum resonance",
    "what actually differs between the 4012 and 4072 filter circuits, beyond a garbled sentence about maximum cutoff",
    "the 1 V/octave scaling of the keyboard CV, which is assumed here from the ARP original",
    "how the keyboard gate and trigger combine with the envelope routing switch selection",
    "which VCO1 output drives the sync inputs of VCO2 and VCO3",
    "the mechanism behind the composite PULSE outputs described in item 5",
    "any MIDI implementation detail: CC map, pitch bend, MIDI clock, SysEx, note priority, global settings",
    "patch examples or a signal flow diagram of any kind",
]

D["source_inconsistencies"] = [
    "Item 12 describes the 4012 as having a 16 Hz maximum cutoff and the 4072 an 11 Hz maximum. Both figures must be "
    "kHz for a filter whose panel is marked to 10 kHz.",
    "The specifications list SYNC as 'VCO 2 / 3 only' under controls and 'VCO 1 / 2 only' under switches. Item 4 and "
    "the panel agree it is on VCO2 and VCO3.",
    "The specifications count 11 FM control jacks; the panel has twelve, four on each VCO.",
    "The specifications count one GATE IN jack; the manual numbers two, items 24 and 31, and the panel has two.",
    "The LFO sawtooth output is item 57 and is marked SAW on the panel, but the specifications call it triangle.",
    "Item 79 says the -10 V input 'attenuates the input signal by 10 V', which is not what an attenuator does. The "
    "panel and specifications treat it as a -10 V source input with a gain slider.",
    "Items 20 and 33 are the same routing switch description repeated for both generators, each saying the chosen "
    "signal is also routed to the ADSR, which cannot be true of the ADSR's own switch.",
    "Item 5 says the type of waveform is shown by the silk-screening 'depending on the specific VCO in use', without "
    "saying that VCO1 has only two outputs while VCO2 and VCO3 have four.",
    "The manual is titled Quick Start Guide throughout but is a full controls manual.",
]

D["modelling_gaps"] = [
    {"topic": "Slider tapers", "detail": "Every slider is 0 to 10 or MIN to MAX on the panel. Only the oscillator and "
     "filter frequency sliders have marked physical scales, and those are decade marks rather than a stated law."},
    {"topic": "Envelope times", "detail": "No times in seconds for attack, decay or release, so the TIME FACTOR "
     "multiplier has nothing to multiply. This is the largest single gap for anyone trying to make the model sound right."},
    {"topic": "Filter behaviour", "detail": "No cutoff range in Hz, no resonance law, and no account of what "
     "distinguishes the 4012 from the 4072 beyond the garbled sentence in item 12. The two circuits differ audibly on "
     "real hardware; this file cannot say how."},
    {"topic": "Modulation depth", "detail": "FM inputs accept -10 V to +10 V and the PWM inputs work at 1 V per 10% "
     "duty, but no volts-per-octave figure is given for the FM path, so full-slider modulation depth is unknown."},
    {"topic": "Oscillator range overlap", "detail": "The four ranges are described as overlapping and the panel marks "
     "one decade per division, but the actual span of each range is not given."},
    {"topic": "Ring modulator law", "detail": "Described as a voltage multiplier with a -10 V to +10 V output. Whether "
     "it is a true four-quadrant multiplier, and how the AUDIO/DC switch changes the VCO1 path, is not stated."},
    {"topic": "Noise colour sweep", "detail": "COLOR is a continuous slider through low frequency, pink and white, "
     "but the spectral shape at intermediate positions is not described."},
    {"topic": "Reverb", "detail": "A digital emulation of a spring on this model and a real tank on the BLUE MARVIN. "
     "No decay time, no controls beyond left and right level, no statement of how the two differ."},
    {"topic": "Envelope follower", "detail": "No attack or release time constant and no transfer function from input "
     "amplitude to output voltage, only a maximum of +14 V."},
    {"topic": "Lag processor", "detail": "Described qualitatively as slew on CV and low-pass on audio. No time "
     "constant range and no statement of whether it is linear or exponential slew."},
    {"topic": "Mult loading", "detail": "Passive and unbuffered, so patching several sources together has real "
     "electrical consequences that a naive model will not reproduce."},
    {"topic": "Non-linearities", "detail": "Nothing anywhere on VCA headroom, filter saturation, or what happens when "
     "attenuator sliders are driven hard. On a 2600 these are much of the character."},
    {"topic": "ARP 2600 manual", "detail": "The uploaded original manual is a 112-page scan with no text layer. "
     "Running OCR over it is the obvious next move: it is likely to settle the filter circuits, the envelope times, "
     "the keyboard CV scaling and the sync source."},
]

with open("/mnt/user-data/outputs/behringer-2600.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
