#!/usr/bin/env python3
"""Assemble the Behringer UB-Xa D device file."""
import json

D = {"schema_version": "0.7.0"}

D["device"] = {
    "id": "behringer-ub-xa-d",
    "manufacturer": "Behringer",
    "model": "UB-Xa D",
    "category": "16-voice bi-timbral analogue polyphonic synthesizer, desktop, digitally controlled",
    "based_on": "Oberheim OB-Xa. The Behringer guide does not name it; the panel layout, control set, the OSC 2 HALF/FULL "
                "switches and the two-LFO modulation panel are the OB-Xa's, and the guide's pedal descriptions are lifted "
                "almost verbatim from the Oberheim owner's manual.",
    "sources": [
        {"id": "ubxa", "title": "UB-Xa D Quick Start Guide", "kind": "quick_start_guide",
         "file": "Behringer_UB-Xa_D_Manual.pdf", "pages": 34,
         "note": "Numbered controls 1 to 92 with one-line descriptions, a hook-up page and a specifications table. No "
                 "CC or NRPN map, no envelope times, no description of the menus behind the SHIFT functions."},
        {"id": "panel", "title": "UB-Xa D front panel image", "kind": "measurement", "file": "Behringer_UB-Xa_D.png",
         "note": "Used for the secondary (SHIFT) labels printed under each control, which the guide mostly does not describe."},
        {"id": "obxa", "title": "Oberheim OB-Xa Owner's Manual", "kind": "user_manual",
         "file": "Obherheim_obxa_ownersmanual.pdf", "pages": 34,
         "note": "A scan with no text layer, not mined for this pass. The obvious source for control ranges, the HALF/FULL "
                 "levels, envelope times and the modulation panel's routing."},
    ],
}

D["architecture"] = {
    "synthesis": "subtractive",
    "signal_path": "hybrid",
    "signal_path_note": "analogue voices under digital control; no effects engine",
    "voices": 16,
    "timbrality": 2,
    "polyphony_mode": "16-voice polyphonic, bi-timbral: two patches (lower and upper) in split or double, unison per layer",
    "poly_chain_max_units": None,
    "patch_memory": True,
    "semi_modular": False,
    "panel_counts": {"knobs": 30, "switches": 56, "encoder": 1},
    "summary": (
        "Sixteen analogue voices arranged as two independent layers, lower and upper, each running its own patch: "
        "played together in DOUBLE or either side of a split point in SPLIT. Each voice has two oscillators with "
        "sawtooth and pulse switches (triangle by combination), a shared pulse width, oscillator sync and filter-envelope "
        "to OSC 2 pitch, a noise source, a mixer where OSC 2 enters at half or full level, a low-pass filter switchable "
        "between 2-pole and 4-pole with keyboard tracking, and separate filter and loudness ADSR envelopes. Two LFOs: "
        "the modulation LFO with two depth controls, one for pitch and filter destinations and one for pulse width and "
        "volume, and a performance LFO with its own depth and layer enables. Polyphonic portamento, per-layer unison, "
        "OSC 2 detune and a pitch bend section with OSC 2 only and range switches. Arpeggiator and step sequencer. "
        "Every control is a stored value, so settings live in presets recalled from the programmer or the four "
        "assignable recall switches."
    ),
}

M = []


def mod(id, type, name, section, scope, description, inputs, outputs, properties=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": description}
    if properties:
        m["properties"] = properties
    m["inputs"] = inputs
    m["outputs"] = outputs
    M.append(m)


mod("kbd", "midi_to_cv", "MIDI and keyboard section", "KEYBOARD", "common",
    "Notes arrive over MIDI or USB; there is no keyboard on the D model. This block also holds the layer logic: SPLIT "
    "divides the range at a chosen key with the lower patch below and the upper above, DOUBLE plays both patches at "
    "once or on two MIDI channels, LOWER and UPPER choose which patch the panel edits, CHORD memorises a chord and "
    "transposes it from any key, TRANSPOSE shifts by octaves. Vibrato and filter pedals and the sustain, hold and "
    "program-advance footswitches arrive here.",
    ["kbd.vibrato_pedal_in", "kbd.filter_pedal_in", "kbd.sustain_in"], ["kbd.note", "kbd.gate", "kbd.bend", "kbd.filter_pedal_cv"])

mod("voices", "voice_allocator", "Voice allocation", "CONTROL", "common",
    "Shares sixteen voices between the two layers and assigns them to notes. UNISON plays all of a layer's voices "
    "from one key with low-note priority, independently per layer in split mode. The SHIFT functions VOICES, VOICE "
    "DETUNE and VINTAGE on the panel suggest a voice-count, per-voice detune and vintage-drift setting; the guide "
    "does not describe them.",
    ["voices.note_in", "voices.gate_in"], ["voices.pitch", "voices.gate"],
    {"voice_count": 16, "layers": 2})

mod("portamento", "pitch_control", "Portamento", "CONTROL", "per_voice",
    "Polyphonic glide: each voice slides from its previous pitch to its new one independently.",
    ["portamento.in"], ["portamento.out"])

mod("osc1", "oscillator", "Oscillator 1", "OSCILLATORS", "per_voice",
    "Sawtooth and pulse, each switchable; both on gives a triangle. Frequency in octave steps over four octaves. "
    "Sync master for OSC 2. Pulse width is shared with OSC 2.",
    ["osc1.pitch_in", "osc1.fm_in", "osc1.pwm_in"], ["osc1.out", "osc1.sync_out"],
    {"waveforms": ["sawtooth", "pulse", "triangle (saw and pulse together)"], "range_octaves": 4})

mod("osc2", "oscillator", "Oscillator 2", "OSCILLATORS", "per_voice",
    "Sawtooth and pulse, each switchable; both on sums them, both off gives a triangle, so OSC 2 always sounds. "
    "Frequency stepped in semitones over four octaves, plus a fine detune. Can be hard-synced to OSC 1 and have its "
    "pitch driven by the filter envelope, which with sync on is the classic OB-Xa sync sweep.",
    ["osc2.pitch_in", "osc2.fm_in", "osc2.env_in", "osc2.pwm_in", "osc2.sync_in"], ["osc2.out"],
    {"waveforms": ["sawtooth", "pulse", "both", "triangle (neither)"], "range_octaves": 4, "step": "semitone"})

mod("noise", "noise", "Noise", "FILTER", "per_voice",
    "Noise source with a level control in the filter section. Per voice by inference.",
    [], ["noise.out"])

mod("mixer", "mixer", "Voice mixer", "FILTER", "per_voice",
    "Three switched sources into the filter: OSC 1 on or off, OSC 2 at half level (about 5 dB down), full level or "
    "off, and noise at a continuous level. There are no continuous level controls for the oscillators.",
    ["mixer.in_osc1", "mixer.in_osc2", "mixer.in_noise"], ["mixer.out"])

mod("vcf", "filter", "Filter", "FILTER", "per_voice",
    "Low-pass filter, 2-pole by default and 4-pole with the switch, with resonance. Cutoff is modulated by the filter "
    "envelope, the modulation LFO through the MODULATION knob, keyboard tracking when TRACK is on, and the filter pedal.",
    ["vcf.in", "vcf.env_in", "vcf.lfo_in", "vcf.kbd_in", "vcf.pedal_in"], ["vcf.out"],
    {"slope_db_per_octave": [12, 24], "poles": [2, 4], "modes": ["lowpass"]})

mod("env_filter", "envelope", "Filter envelope", "ENVELOPES", "per_voice",
    "ADSR driving filter cutoff and, with F-ENV on, OSC 2 pitch. The SHIFT labels MOD 1 DELAY, MOD 1 ATTACK and TRIG "
    "POINT sit under its knobs but belong to the modulation LFO and the sequencer, not the envelope.",
    ["env_filter.gate_in"], ["env_filter.out"],
    {"stages": ["attack", "decay", "sustain", "release"]})

mod("env_loud", "envelope", "Loudness envelope", "ENVELOPES", "per_voice",
    "ADSR driving the VCA. The sustain footswitch replaces both envelopes' release with a programmed pedal release "
    "time, whose SHIFT label PEDAL RELEASE sits under this envelope's RELEASE knob.",
    ["env_loud.gate_in"], ["env_loud.out"],
    {"stages": ["attack", "decay", "sustain", "release"]})

mod("vca", "vca", "VCA", "ENVELOPES", "per_voice",
    "Per-voice amplifier driven by the loudness envelope, with tremolo from the modulation LFO when VOLUME MOD is on.",
    ["vca.in", "vca.env_in", "vca.lfo_in"], ["vca.out"])

mod("mod_lfo", "lfo", "Modulation LFO", "MODULATION", "per_voice",
    "The main LFO. Rate 0.06 to 50 Hz, seven waveform positions of which two are modes rather than shapes: TRIG "
    "re-syncs the LFO to each key and SMP samples the performance LFO instead of running its own shape. Two depth "
    "knobs feed two groups of routing switches: DEPTH 1 to OSC 1 pitch, OSC 2 pitch and filter cutoff, DEPTH 2 to OSC "
    "1 pulse width, OSC 2 pulse width and VCA volume. Per voice by inference from the MOD LFO PHASE shift function, "
    "which only makes sense if each voice has its own.",
    ["mod_lfo.sample_in"], ["mod_lfo.out"],
    {"rate_hz": {"min": 0.06, "max": 50},
     "shapes": ["sine", "sawtooth", "square", "ramp", "sample_hold"], "modes": ["trig", "smp"]})

mod("perf_lfo", "lfo", "Performance LFO", "PERF LFO", "common",
    "A second LFO for vibrato under performance control. Rate 0.06 to 50 Hz, six shapes, one depth, routable to OSC 1 "
    "and OSC 2 pitch and enabled per layer. Its depth is what the vibrato pedal scales. Also the source the modulation "
    "LFO samples in SMP mode.",
    [], ["perf_lfo.out"],
    {"rate_hz": {"min": 0.06, "max": 50}, "shapes": ["sine", "sawtooth", "square", "ramp", "noise", "sample_hold"]})

mod("bend", "modulation_bus", "Pitch bend", "BEND", "common",
    "Pitch bend from MIDI. OSC 2 ONLY restricts it to the second oscillator, which against a synced OSC 2 bends the "
    "timbre rather than the pitch. AMOUNT (the guide calls it NARROW) switches the range between a whole tone and an "
    "octave. The BEND shift function under PORTAMENTO suggests a finer range setting the guide does not describe.",
    ["bend.in"], ["bend.osc1_out", "bend.osc2_out"])

mod("arp", "arpeggiator", "Arpeggiator", "ARPEGGIATOR", "common",
    "On, hold, and a settings menu the guide does not describe. Shift labels AUTO and SETTINGS.",
    ["arp.notes_in"], ["arp.notes_out"])

mod("seq", "sequencer", "Sequencer", "SEQUENCER", "common",
    "Step sequencer recorded from played notes: RECORD, REST/TIE, STOP, PLAY/PAUSE, with shift functions SETTINGS, "
    "APPEND, CLR LAST and RESTART. Step count, clock and quantisation are not described.",
    ["seq.notes_in"], ["seq.notes_out"])

mod("output", "output", "Output", "MANUAL", "common",
    "Master VOLUME, BALANCE between the two layers, MASTER TUNE, and the balanced left, right, mono and headphone outputs.",
    ["output.in_lower", "output.in_upper"], ["output.left", "output.right", "output.mono", "output.phones"])

D["modules"] = M

# --------------------------------------------------------------------------
P = []
KN = [{"type": "panel", "control": "knob"}]
BT = [{"type": "panel", "control": "button"}]
ONOFF = [{"value": False, "label": "Off"}, {"value": True, "label": "On"}]


def shift(label):
    return [{"type": "gesture", "gesture": f"SHIFT + {label}", "when": "any_time"}]


def par(id, module, label, kind, function, ref=None, access=None, **kw):
    p = {"id": id, "module": module, "label": label}
    if ref is not None:
        p["manual_ref"] = ref
    p["kind"] = kind
    for k in ("panel_scale", "physical", "range", "values", "bipolar", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = access or (KN if kind == "continuous" else BT)
    p["function"] = function
    for k in ("confidence", "note", "led_colour"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


S10 = {"min": 0, "max": 10}

# keyboard
par("kbd.split", "kbd", "SPLIT", "boolean", "Splits the range at a chosen key, lower patch below and upper above. Hold SPLIT and play the key to set the point.", ref=1, values=ONOFF)
par("kbd.double", "kbd", "DOUBLE", "boolean", "Plays both patches at once, as one sound or on two MIDI channels.", ref=2, values=ONOFF)
par("kbd.edit_layer", "kbd", "LOWER / UPPER", "enum", "Which of the two patches the panel is editing.", ref=3,
    values=[{"value": "lower", "label": "LOWER"}, {"value": "upper", "label": "UPPER"}], note="Items 3 and 4 in the guide.")
par("kbd.transpose", "kbd", "TRANSPOSE DOWN / UP", "integer", "Shifts the keyboard by an octave per press.", ref=5,
    range={"min": -4, "max": 4}, note="Items 5 and 6. The limit is not stated; four octaves each way is a guess.", confidence="speculative")
par("kbd.chord", "kbd", "CHORD", "boolean", "Hold a chord and press CHORD; any key then plays that chord transposed. Independent for upper and lower.", ref=7, values=ONOFF)

# manual
par("output.volume", "output", "VOLUME", "continuous", "Master volume, 0 to 100%. SHIFT function PRESET VOLUME stores a level with the preset.", ref=11, panel_scale=S10)
par("output.balance", "output", "BALANCE", "continuous", "Level between the two patches in a split or double.", ref=12, panel_scale={"min": -5, "max": 5, "unit": "lower to upper"}, bipolar=True)
par("output.master_tune", "output", "MASTER TUNE", "continuous", "Overall tuning.", ref=13, panel_scale={"min": -5, "max": 5, "unit": "unspecified"}, bipolar=True)

# performance LFO
par("perf_lfo.rate", "perf_lfo", "LFO RATE", "continuous", "Performance LFO speed. SHIFT function TEMPO SYNC locks it to tempo.", ref=14,
    panel_scale=S10, physical={"min": 0.06, "max": 50, "unit": "Hz", "taper": "unknown"})
par("perf_lfo.waveform", "perf_lfo", "WAVEFORM", "enum", "Cycles through six shapes.", ref=15,
    values=[{"value": "sine"}, {"value": "sawtooth"}, {"value": "square"}, {"value": "ramp"}, {"value": "noise"}, {"value": "sample_hold", "label": "S/H"}])
par("perf_lfo.depth", "perf_lfo", "DEPTH", "continuous", "Performance LFO modulation depth. The vibrato pedal scales it from nothing up to this value. SHIFT function TEMPO.", ref=16, panel_scale=S10)
par("perf_lfo.osc1", "perf_lfo", "OSC 1", "boolean", "Routes the performance LFO to OSC 1 pitch. The guide says 'control of OSC 1 via MIDI CC'.", ref=22, values=ONOFF, note="The guide's wording is odd; read as the OSC 1 routing switch the panel shows.", confidence="inferred")
par("perf_lfo.osc2", "perf_lfo", "OSC 2", "boolean", "Routes the performance LFO to OSC 2 pitch.", ref=23, values=ONOFF, confidence="inferred")
par("perf_lfo.lower", "perf_lfo", "LOWER", "boolean", "Enables the performance LFO for the lower layer.", ref=24, values=ONOFF)
par("perf_lfo.upper", "perf_lfo", "UPPER", "boolean", "Enables the performance LFO for the upper layer.", ref=25, values=ONOFF)

# control
par("portamento.time", "portamento", "PORTAMENTO", "continuous", "Glide rate, applied per voice.", ref=17, panel_scale=S10)
par("voices.unison", "voices", "UNISON", "boolean", "All of the layer's voices on one key, low-note priority. Independent per layer in split. SHIFT function VOICES.", ref=18, values=ONOFF)
par("osc2.detune", "osc2", "OSC 2 DETUNE", "continuous", "Fine detune of OSC 2 against OSC 1; the LED lights when detuned. SHIFT function VOICE DETUNE.", ref=19, panel_scale=S10, led_colour="red")

# bend
par("bend.osc2_only", "bend", "OSC 2 ONLY", "boolean", "Pitch bend reaches only OSC 2.", ref=20, values=ONOFF)
par("bend.narrow", "bend", "AMOUNT (NARROW)", "boolean", "On: bend range is a whole tone. Off: an octave.", ref=21, values=ONOFF,
    note="Labelled AMOUNT on the panel, NARROW in the guide.")

# oscillators
par("osc1.frequency", "osc1", "FREQUENCY (OSC 1)", "continuous", "OSC 1 frequency in octave steps over a four-octave range.", ref=26, panel_scale={"min": 0, "max": 4, "unit": "octaves"})
par("osc1.pulse_width", "osc1", "PULSE WIDTH (OSC 1+2)", "continuous", "Pulse width of both oscillators together.", ref=27, panel_scale=S10)
par("osc2.frequency", "osc2", "FREQUENCY (OSC 2)", "continuous", "OSC 2 frequency stepped in semitones over a four-octave range.", ref=28, panel_scale={"min": 0, "max": 48, "unit": "semitones"})
par("osc1.saw", "osc1", "SAW (OSC 1)", "boolean", "OSC 1 sawtooth on. With PULSE also on, OSC 1 produces a triangle.", ref=29, values=ONOFF)
par("osc1.pulse", "osc1", "PULSE (OSC 1)", "boolean", "OSC 1 pulse on.", ref=30, values=ONOFF)
par("osc2.sync", "osc2", "SYNC", "boolean", "Locks OSC 2 to OSC 1. SHIFT function FREQ.", ref=31, values=ONOFF)
par("osc2.f_env", "osc2", "F-ENV", "boolean", "Filter envelope modulates OSC 2 pitch. SHIFT function PW.", ref=32, values=ONOFF)
par("osc2.saw", "osc2", "SAW (OSC 2)", "boolean", "OSC 2 sawtooth on.", ref=33, values=ONOFF)
par("osc2.pulse", "osc2", "PULSE (OSC 2)", "boolean", "OSC 2 pulse on. Both on: both waves. Both off: triangle.", ref=34, values=ONOFF)
par("osc1.lfo_invert", "osc1", "OSC 1 LFO INVERT", "boolean", "Inverts the LFO into OSC 1. Panel shift label only.", access=shift("OSC 2 (SYNC/F-ENV)"), values=ONOFF, confidence="inferred")

# modulation LFO
par("mod_lfo.rate", "mod_lfo", "LFO RATE", "continuous", "Modulation LFO speed. SHIFT function TEMPO SYNC.", ref=35,
    panel_scale=S10, physical={"min": 0.06, "max": 50, "unit": "Hz", "taper": "unknown"})
par("mod_lfo.waveform", "mod_lfo", "WAVEFORM", "enum",
    "Seven positions: five shapes plus TRIG (LFO restarts on each key, long press to engage) and SMP (samples the performance LFO).",
    ref=40, values=[{"value": "sine"}, {"value": "sawtooth"}, {"value": "square"}, {"value": "ramp"}, {"value": "sample_hold", "label": "S/H"},
                    {"value": "trig", "label": "TRIG", "meaning": "key sync"}, {"value": "smp", "label": "SMP", "meaning": "sampled from the performance LFO"}])
par("mod_lfo.depth1", "mod_lfo", "DEPTH 1", "continuous", "Depth for the OSC 1 FREQ, OSC 2 FREQ and FILTER FREQ switches. SHIFT function MOD LFO PHASE.", ref=44, panel_scale=S10,
    note="The guide assigns DEPTH 1 to the PWM and volume switches and DEPTH 2 to the frequency switches, the reverse of the panel. This file follows the panel.")
par("mod_lfo.depth2", "mod_lfo", "DEPTH 2", "continuous", "Depth for the OSC 1 PWM, OSC 2 PWM and VOLUME MOD switches.", ref=39, panel_scale=S10)
par("mod_lfo.to_osc1_freq", "mod_lfo", "OSC 1 FREQ", "boolean", "Routes the LFO to OSC 1 pitch. SHIFT function QUANTIZE.", ref=41, values=ONOFF, led_colour="red")
par("mod_lfo.to_osc2_freq", "mod_lfo", "OSC 2 FREQ", "boolean", "Routes the LFO to OSC 2 pitch. SHIFT function INVERT.", ref=42, values=ONOFF, led_colour="red")
par("mod_lfo.to_filter", "mod_lfo", "FILTER FREQ", "boolean", "Routes the LFO to filter cutoff. SHIFT function TRACK.", ref=43, values=ONOFF, led_colour="red")
par("mod_lfo.to_osc1_pwm", "mod_lfo", "OSC 1 PWM", "boolean", "Routes the LFO to OSC 1 pulse width. SHIFT function QUANTIZE.", ref=36, values=ONOFF, led_colour="red")
par("mod_lfo.to_osc2_pwm", "mod_lfo", "OSC 2 PWM", "boolean", "Routes the LFO to OSC 2 pulse width. SHIFT function INVERT.", ref=37, values=ONOFF, led_colour="red")
par("mod_lfo.to_volume", "mod_lfo", "VOLUME MOD", "boolean", "Routes the LFO to the VCA for tremolo. SHIFT function ENV MOD.", ref=38, values=ONOFF, led_colour="red")
par("mod_lfo.delay1", "mod_lfo", "MOD 1 DELAY", "continuous", "Delay before DEPTH 1 modulation begins. Panel shift label only.", access=shift("FILTER ENVELOPE ATTACK"), panel_scale=S10, confidence="inferred")
par("mod_lfo.attack1", "mod_lfo", "MOD 1 ATTACK", "continuous", "Fade-in of DEPTH 1 modulation. Panel shift label only.", access=shift("FILTER ENVELOPE DECAY"), panel_scale=S10, confidence="inferred")
par("mod_lfo.delay2", "mod_lfo", "MOD 2 DELAY", "continuous", "Delay before DEPTH 2 modulation begins. Panel shift label only.", access=shift("LOUDNESS ENVELOPE ATTACK"), panel_scale=S10, confidence="inferred")
par("mod_lfo.attack2", "mod_lfo", "MOD 2 ATTACK", "continuous", "Fade-in of DEPTH 2 modulation. Panel shift label only.", access=shift("LOUDNESS ENVELOPE DECAY"), panel_scale=S10, confidence="inferred")

# filter
par("vcf.frequency", "vcf", "FREQUENCY", "continuous", "Low-pass cutoff.", ref=45, panel_scale=S10)
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Emphasis around the cutoff.", ref=46, panel_scale=S10)
par("vcf.modulation", "vcf", "MODULATION", "continuous", "Amount of filter envelope applied to cutoff.", ref=47, panel_scale=S10,
    note="The guide says 'set by the LFO', but on the OB-Xa this knob is the envelope amount and the LFO reaches the filter through the modulation panel's FILTER FREQ switch. Modelled as envelope amount.", confidence="inferred")
par("noise.level", "noise", "NOISE", "continuous", "Noise into the filter, 0 to 100%.", ref=48, panel_scale=S10)
par("mixer.osc1_on", "mixer", "OSC 1", "boolean", "OSC 1 into the filter on or off.", ref=49, values=ONOFF, led_colour="red")
par("mixer.osc2_level", "mixer", "HALF / FULL (OSC 2)", "enum", "OSC 2 into the filter at about 5 dB below full, at full, or off.", ref=50,
    values=[{"value": "off"}, {"value": "half", "meaning": "about 5 dB below full"}, {"value": "full"}], note="Items 50 and 51.", led_colour="red")
par("vcf.four_pole", "vcf", "4 POLE", "boolean", "Switches the filter from 2-pole to 4-pole.", ref=52, values=ONOFF)
par("vcf.track", "vcf", "TRACK", "boolean", "Keyboard voltage applied to cutoff so the filter follows pitch.", ref=53, values=ONOFF)

# envelopes
for e, lab, refs in [("env_filter", "filter", (54, 55, 56, 57)), ("env_loud", "loudness", (58, 59, 60, 61))]:
    for st, r in zip(("attack", "decay", "sustain", "release"), refs):
        par(f"{e}.{st}", e, st.upper(), "continuous", f"{st.title()} {'level' if st == 'sustain' else 'time'} of the {lab} envelope. No time scale is given.", ref=r, panel_scale=S10)
par("env_loud.pedal_release", "env_loud", "PEDAL RELEASE", "continuous",
    "Release time used when the sustain footswitch is down, same range as the panel release. Programmed per patch. Panel shift label; the function is described under the SUSTAIN pedal.",
    access=shift("LOUDNESS ENVELOPE RELEASE"), panel_scale=S10)
par("seq.trig_point", "seq", "TRIG POINT", "continuous", "Panel shift label under the filter envelope RELEASE; not described.", access=shift("FILTER ENVELOPE RELEASE"), panel_scale=S10, confidence="speculative")

# arp / seq / programmer
par("arp.on", "arp", "ON", "boolean", "Arpeggiator on or off.", ref=9, values=ONOFF, led_colour="red")
par("arp.hold", "arp", "HOLD", "boolean", "Latches the arpeggiated chord after release. Mirrored by the rear HOLD footswitch.", ref=10, values=ONOFF)
par("arp.settings", "arp", "SETTINGS", "boolean", "Opens the arpeggiator settings menu on the display. Contents not described.", ref=8, values=ONOFF)
par("seq.rest_tie", "seq", "REST/TIE", "boolean", "Ties notes or enters an empty step while recording.", ref=63, values=ONOFF)
par("seq.record", "seq", "RECORD", "boolean", "Enter note data into a sequence from played notes.", ref=64, values=ONOFF)
par("seq.stop", "seq", "STOP", "boolean", "Stops the sequencer.", ref=65, values=ONOFF)
par("seq.play_pause", "seq", "PLAY/PAUSE", "boolean", "Plays or pauses the sequence.", ref=66, values=ONOFF)
par("voices.manual_mode", "voices", "MANUAL", "boolean", "The sound reflects the physical control positions rather than the stored preset. Not available in split or double.", ref=68, values=ONOFF)
par("voices.shift", "voices", "SHIFT", "boolean", "Held to reach the secondary function printed under each control.", ref=62, values=ONOFF)
par("voices.compare", "voices", "COMPARE", "boolean", "Compares the edited sound with the stored patch.", ref=67, values=ONOFF)
par("voices.write", "voices", "WRITE", "boolean", "Stores a patch; held, stores a split or double program. SELECT chooses the destination.", ref=69, values=ONOFF)
par("voices.select", "voices", "SELECT", "integer", "Rotary encoder for values and menus; push to enter.", ref=71, access=[{"type": "panel", "control": "encoder"}], range={"min": 0, "max": 127}, note="Range not stated.")
par("voices.preset_value", "voices", "- / + PRESET/VALUE", "integer", "Steps the preset or value down or up by one. Items 72 and 73. SHIFT gives BANK/PAGE.", ref=72, range={"min": -1, "max": 1})
par("voices.recall", "voices", "ASSIGNABLE PRESET RECALL 1-4", "integer", "Four switches that recall assigned presets, alone or in combination. With SHIFT: 1 USB/MIDI menu, 2 velocity and aftertouch menu, 3 voice menu, 4 mod menu. Items 74 to 77.", ref=74, range={"min": 1, "max": 4}, led_colour="red")
par("output.power", "output", "POWER", "boolean", "Mains switch.", ref=78, access=[{"type": "rear_panel", "control": "toggle_switch"}], values=ONOFF)

D["parameters"] = P

D["indicators"] = [
    {"id": "osc2.detune_led", "module": "osc2", "label": "OSC 2 DETUNE", "kind": "led", "led_colour": "red", "manual_ref": 19,
     "function": "Lit when OSC 2 is detuned from OSC 1."},
    {"id": "perf_lfo.shape_leds", "module": "perf_lfo", "label": "Performance LFO waveform", "kind": "led", "led_colour": "red", "manual_ref": 15,
     "function": "Six LEDs, one per shape, showing the selected waveform."},
    {"id": "mod_lfo.shape_leds", "module": "mod_lfo", "label": "Modulation LFO waveform", "kind": "led", "led_colour": "red", "manual_ref": 40,
     "function": "Seven LEDs: five shapes, TRIG and SMP."},
    {"id": "output.display", "module": "output", "label": "LCD DISPLAY", "kind": "display", "manual_ref": 70,
     "function": "2-line, 16-character display showing the preset and menu values."},
]

D["led_legend"] = {
    "rule": "Every switch carries a red LED and every LED means the same thing: the switch is on. There is no colour "
            "code on this panel.",
    "colours": [{"colour": "red", "meaning": "switch engaged, or the selected LFO shape, or OSC 2 detuned"}],
    "confidence": "stated",
    "note": "From the panel image; the guide describes only the OSC 2 DETUNE LED.",
}

# --------------------------------------------------------------------------
J = []


def jack(id, label, direction, signal, node, function, ref, connector, electrical=None):
    j = {"id": id, "label": label, "manual_ref": ref, "location": "rear", "direction": direction, "signal": signal,
         "connector": connector, "node": node}
    if electrical:
        j["electrical"] = electrical
    j["function"] = function
    J.append(j)


jack("jack.mains", "AC IN", "in", "power", None, "IEC mains inlet, 100 to 240 V auto-ranging, 40 W maximum, 3.15 A fuse.", 79, "IEC C14")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI to a computer.", 80, "USB-B")
jack("jack.midi_in", "MIDI IN", "in", "midi", None, "MIDI from a sequencer, DAW or keyboard. Split and double can use two channels.", 81, "DIN-5")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI to external devices.", 82, "DIN-5")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "Direct copy of MIDI IN for chaining.", 83, "DIN-5")
jack("jack.vibrato_pedal", "VIBRATO", "in", "cv", "kbd.vibrato_pedal_in", "Vibrato pedal: scales the programmed performance LFO depth from off to its programmed maximum.", 84, "6.35mm TRS")
jack("jack.filter_pedal", "FILTER", "in", "cv", "kbd.filter_pedal_in", "Master filter pedal: moves every voice's cutoff from slightly below its panel setting to significantly above it.", 85, "6.35mm TRS")
jack("jack.sustain", "SUSTAIN", "in", "gate", "kbd.sustain_in", "Sustain footswitch: replaces both envelopes' release with the programmed pedal release time, per patch.", 86, "6.35mm TS")
jack("jack.program_advance", "PROGRAM ADVANCE", "in", "gate", None, "Footswitch that steps to the next program.", 87, "6.35mm TS")
jack("jack.hold", "HOLD", "in", "gate", None, "Footswitch mirroring the front-panel HOLD button.", 88, "6.35mm TS")
jack("jack.out_left", "LEFT", "out", "audio", "output.left", "Main left output.", 89, "6.35mm TRS balanced", {"max_level_dbu": 22, "impedance_ohm": 50})
jack("jack.out_mono", "MONO", "out", "audio", "output.mono", "Mono output.", 90, "6.35mm TRS balanced", {"max_level_dbu": 22, "impedance_ohm": 50})
jack("jack.out_right", "RIGHT", "out", "audio", "output.right", "Main right output.", 91, "6.35mm TRS balanced", {"max_level_dbu": 22, "impedance_ohm": 50})
jack("jack.phones", "PHONES", "out", "audio", "output.phones", "Headphones.", 92, "6.35mm TRS", {"max_power_mw": 25, "impedance_ohm": 25})

D["ports"] = J

# --------------------------------------------------------------------------
C = []


def con(id, frm, to, signal, kind, **kw):
    c = {"id": id, "from": frm, "to": to, "signal": signal, "kind": kind}
    c.update(kw)
    C.append(c)


con("c01", "kbd.note", "voices.note_in", "cv", "fixed")
con("c02", "kbd.gate", "voices.gate_in", "gate", "fixed")
con("c03", "kbd.note", "arp.notes_in", "cv", "fixed")
con("c04", "arp.notes_out", "voices.note_in", "cv", "switched", enabled_when={"param": "arp.on", "equals": True})
con("c05", "kbd.note", "seq.notes_in", "cv", "switched", enabled_when={"param": "seq.record", "equals": True})
con("c06", "seq.notes_out", "voices.note_in", "cv", "switched", enabled_when={"param": "seq.play_pause", "equals": True})
con("c07", "voices.pitch", "portamento.in", "cv", "fixed", amount="portamento.time")
con("c08", "portamento.out", "osc1.pitch_in", "cv", "fixed", amount="osc1.frequency")
con("c09", "portamento.out", "osc2.pitch_in", "cv", "fixed", amount="osc2.frequency")
con("c10", "voices.gate", "env_filter.gate_in", "gate", "fixed")
con("c11", "voices.gate", "env_loud.gate_in", "gate", "fixed")
con("c12", "kbd.bend", "bend.in", "cv", "fixed")
con("c13", "bend.osc1_out", "osc1.fm_in", "cv", "switched", enabled_when={"param": "bend.osc2_only", "equals": False})
con("c14", "bend.osc2_out", "osc2.fm_in", "cv", "fixed")
con("c15", "osc1.sync_out", "osc2.sync_in", "sync", "switched", enabled_when={"param": "osc2.sync", "equals": True})
con("c16", "env_filter.out", "osc2.env_in", "cv", "switched", enabled_when={"param": "osc2.f_env", "equals": True})

con("c20", "mod_lfo.out", "osc1.fm_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_osc1_freq", "equals": True}, amount="mod_lfo.depth1")
con("c21", "mod_lfo.out", "osc2.fm_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_osc2_freq", "equals": True}, amount="mod_lfo.depth1")
con("c22", "mod_lfo.out", "vcf.lfo_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_filter", "equals": True}, amount="mod_lfo.depth1")
con("c23", "mod_lfo.out", "osc1.pwm_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_osc1_pwm", "equals": True}, amount="mod_lfo.depth2")
con("c24", "mod_lfo.out", "osc2.pwm_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_osc2_pwm", "equals": True}, amount="mod_lfo.depth2")
con("c25", "mod_lfo.out", "vca.lfo_in", "cv", "switched", enabled_when={"param": "mod_lfo.to_volume", "equals": True}, amount="mod_lfo.depth2")
con("c26", "perf_lfo.out", "osc1.fm_in", "cv", "switched", enabled_when={"param": "perf_lfo.osc1", "equals": True}, amount="perf_lfo.depth")
con("c27", "perf_lfo.out", "osc2.fm_in", "cv", "switched", enabled_when={"param": "perf_lfo.osc2", "equals": True}, amount="perf_lfo.depth")
con("c28", "perf_lfo.out", "mod_lfo.sample_in", "cv", "switched", enabled_when={"param": "mod_lfo.waveform", "equals": "smp"},
    note="In SMP mode the modulation LFO samples the performance LFO instead of generating its own shape.")

con("c30", "osc1.out", "mixer.in_osc1", "audio", "switched", enabled_when={"param": "mixer.osc1_on", "equals": True})
con("c31", "osc2.out", "mixer.in_osc2", "audio", "switched", enabled_when={"param": "mixer.osc2_level", "not_equals": "off"}, amount="mixer.osc2_level")
con("c32", "noise.out", "mixer.in_noise", "audio", "fixed", amount="noise.level")
con("c33", "mixer.out", "vcf.in", "audio", "fixed")
con("c34", "env_filter.out", "vcf.env_in", "cv", "fixed", amount="vcf.modulation")
con("c35", "portamento.out", "vcf.kbd_in", "cv", "switched", enabled_when={"param": "vcf.track", "equals": True})
con("c36", "kbd.filter_pedal_cv", "vcf.pedal_in", "cv", "fixed")
con("c37", "vcf.out", "vca.in", "audio", "fixed")
con("c38", "env_loud.out", "vca.env_in", "cv", "fixed")
con("c39", "vca.out", "output.in_lower", "audio", "fixed", note="Voices assigned to the lower layer sum here; upper-layer voices to output.in_upper. BALANCE sets the ratio.")
con("c40", "vca.out", "output.in_upper", "audio", "fixed")
C = [c for c in C if c]

# pulse width is one knob feeding both oscillators; represent as a parameter on osc1 and a note
D["connections"] = C

D["behaviours"] = [
    {"id": "b01", "name": "Two layers, sixteen voices", "applies_to": ["voices", "kbd", "output"],
     "rule": "The instrument holds two complete patches, lower and upper. In single mode one patch uses all sixteen voices. "
             "SPLIT assigns the lower patch below the split key and the upper above it; DOUBLE stacks both on every note or "
             "puts them on two MIDI channels. How the sixteen voices are divided between layers is not stated; eight each "
             "is the OB-Xa's arrangement. LOWER and UPPER choose which patch the panel edits, and BALANCE mixes the two."},
    {"id": "b02", "name": "Unison per layer", "applies_to": ["voices"],
     "rule": "UNISON puts all of a layer's voices on one key with low-note priority. In split mode each layer's unison is "
             "independent. OSC 2 DETUNE and the VOICE DETUNE shift function spread the stacked voices."},
    {"id": "b03", "name": "Oscillator waveform switches", "applies_to": ["osc1", "osc2"],
     "rule": "OSC 1: SAW on, PULSE on, or both on for a triangle; both off is silence. OSC 2: SAW on, PULSE on, both on "
             "for both, both off for a triangle, so OSC 2 always produces something. Pulse width is one knob shared by both."},
    {"id": "b04", "name": "Sync and F-ENV", "applies_to": ["osc1", "osc2", "env_filter"],
     "rule": "SYNC locks OSC 2 to a harmonic of OSC 1. F-ENV routes the filter envelope to OSC 2 pitch. With both on, the "
             "envelope sweeps the synced harmonic content rather than the pitch: the OB-Xa's signature sync sweep. OSC 2 "
             "ONLY on the bend section does the same with the bend lever."},
    {"id": "b05", "name": "Modulation LFO routing", "applies_to": ["mod_lfo"],
     "rule": "One LFO, two depths. DEPTH 1 scales the three frequency destinations (OSC 1, OSC 2, filter) and DEPTH 2 the "
             "three width and volume destinations (OSC 1 PWM, OSC 2 PWM, VCA), each destination gated by its own switch. "
             "Delay and fade-in for each depth group are on the shift functions MOD 1/2 DELAY and MOD 1/2 ATTACK. The "
             "guide swaps which depth serves which group; the panel and the OB-Xa agree on the assignment used here.",
     "confidence": "inferred"},
    {"id": "b06", "name": "TRIG and SMP", "applies_to": ["mod_lfo", "perf_lfo"],
     "rule": "TRIG restarts the modulation LFO on every key, held long to engage. SMP makes the modulation LFO sample the "
             "performance LFO, so a sampled vibrato at the performance LFO's shape and speed reaches the modulation panel's "
             "destinations."},
    {"id": "b07", "name": "Performance LFO and the vibrato pedal", "applies_to": ["perf_lfo", "kbd"],
     "rule": "The performance LFO reaches OSC 1 and OSC 2 pitch through its own switches and is enabled per layer. The "
             "vibrato pedal scales its DEPTH from nothing up to the programmed value, so the programmed depth is a ceiling."},
    {"id": "b08", "name": "Mixer levels", "applies_to": ["mixer"],
     "rule": "OSC 1 is on or off. OSC 2 is off, HALF (about 5 dB below full) or FULL. Noise is continuous. There is no "
             "oscillator level knob; balance between oscillators is done with HALF."},
    {"id": "b09", "name": "Filter modulation sum", "applies_to": ["vcf"],
     "rule": "Cutoff = FREQUENCY + filter envelope x MODULATION + modulation LFO x DEPTH 1 when FILTER FREQ is on + keyboard "
             "pitch when TRACK is on + filter pedal. The pedal moves cutoff from slightly below the panel value to "
             "significantly above it. Summation law not stated.",
     "confidence": "inferred"},
    {"id": "b10", "name": "Sustain pedal as release", "applies_to": ["env_filter", "env_loud", "kbd"],
     "rule": "The sustain footswitch does not hold notes; it substitutes a programmed PEDAL RELEASE time for both envelopes' "
             "release, with the same range as the panel release. In split or double each patch dies away by its own pedal "
             "release."},
    {"id": "b11", "name": "Manual mode", "applies_to": ["voices"],
     "rule": "MANUAL makes the sound follow the physical positions of the controls rather than the stored preset. Not "
             "available in split or double, because two patches cannot both be read from one set of knobs."},
    {"id": "b12", "name": "Presets and recall", "applies_to": ["voices"],
     "rule": "Every control is a stored value. WRITE stores a patch, or held, a split or double program. COMPARE audits the "
             "edit against the stored version. Four ASSIGNABLE PRESET RECALL switches bring up presets, and with SHIFT open "
             "the USB/MIDI, velocity and aftertouch, voice and mod menus."},
    {"id": "b13", "name": "Menus not described", "applies_to": ["voices", "arp", "seq"],
     "rule": "The panel's shift labels and the four menus imply a vintage mode, a mod matrix, velocity and aftertouch "
             "routing, voice settings, arpeggiator settings, sequencer settings, tempo sync and quantise. The quick start "
             "guide names none of their contents."},
]

D["midi"] = {
    "receives": ["note_on", "note_off", "pitch_bend", "program_change", "cc (map not published in this guide)"],
    "transmits": ["MIDI OUT", "MIDI THRU pass-through", "USB MIDI"],
    "channel": {"range": [1, 16], "set_by": "USB/MIDI menu (SHIFT + recall switch 1); split and double can use two channels"},
    "cc_map": None, "nrpn": None, "sysex": None, "clock": "TEMPO SYNC shift functions exist; clock source not stated",
    "usb": {"class_compliant": True, "os": "Windows 7 or higher, Mac OS X 10.10 or higher"},
}

D["specifications"] = {
    "voices": {"count": 16, "timbrality": "bi-timbral", "type": "analogue", "oscillators": 32},
    "lfos": 2,
    "vcf": "1 low pass per voice, 2-pole or 4-pole (12 or 24 dB/oct), switchable",
    "envelopes": ["VCF", "VCA"],
    "outputs": {"main": "2 x 1/4-inch TRS balanced, max +22 dBu, 50 ohm", "mono": "1/4-inch TRS balanced",
                "phones": "1/4-inch TRS, 25 mW, 25 ohm"},
    "pedals": {"cv": ["vibrato", "filter"], "switch": ["sustain", "program advance", "hold"]},
    "midi": "In, Out, Thru on DIN; USB 2.0 type B class compliant",
    "display": "2 x 16 character LCD",
    "power": {"mains": "IEC, auto-ranging 100 to 240 V", "consumption_w_max": 40, "fuse_a": 3.15},
    "dimensions_mm": {"h": 119, "w": 460.75, "d": 224.1},
    "weight_kg": 4.8,
    "operating_temperature_c": {"min": 5, "max": 45},
}

D["omitted_from_source"] = [
    "safety and legal text in nine languages",
    "warranty and FCC/EU declarations",
    "hook-up diagrams",
    "non-English duplicates of the controls section",
]

D["not_in_source"] = [
    "a MIDI CC or NRPN map; the guide mentions that OSC 1 and OSC 2 MOD are 'via MIDI CC' and gives no numbers",
    "envelope times in seconds for either envelope, and the pedal release range beyond 'the same as the panel'",
    "the contents of any menu: arpeggiator settings, sequencer settings, globals, vintage mode, the mod menu, voice menu, velocity and aftertouch menu, USB/MIDI menu",
    "the meaning of most shift functions printed on the panel: PRESET VOLUME, TEMPO SYNC, BEND, VOICES, TEMPO, VOICE DETUNE, QUANTIZE, INVERT, TRACK, MOD LFO PHASE, TRIG POINT, ENV MOD, OSC 1 LFO INVERT, FREQ, PW, AUTO, APPEND, CLR LAST, RESTART, INITIAL, BANK/PAGE",
    "how the sixteen voices are divided between the two layers",
    "whether the modulation LFO is per voice or shared; the MOD LFO PHASE shift function implies per voice",
    "the exact level of HALF OSC 2 beyond 'approximately 5 dB below full'",
    "the sequencer's step count, clock and quantisation; the arpeggiator's modes and range",
    "the pitch bend curve, and what the BEND shift function under PORTAMENTO adjusts",
    "the number of presets and banks",
]

D["source_inconsistencies"] = [
    "Item 39 assigns DEPTH 1 to the PWM and VOLUME MOD switches (36 to 38) and item 44 assigns DEPTH 2 to the frequency switches (41 to 43); the panel prints DEPTH 1 above the frequency row and DEPTH 2 above the PWM row. This file follows the panel.",
    "Item 47 says the MODULATION knob sets filter modulation 'by the LFO'; the LFO reaches the filter through the FILTER FREQ switch and DEPTH 1, so this knob is the envelope amount, as on the OB-Xa.",
    "Item 21 is called NARROW in the guide and AMOUNT on the panel.",
    "Items 22 and 23 (performance LFO OSC 1 and OSC 2) are described as 'turns on control of OSC via MIDI CC', which does not describe a routing switch.",
    "The guide's page layout scatters the item numbers so that several descriptions are printed out of order and two (5 and 6, 3 and 4) share one heading.",
    "Item 15 lists the performance LFO shapes as sine, sawtooth, square, ramp, noise and sample and hold; the specifications list triangle, square, ramp up, sawtooth, random and sample and hold.",
    "The specifications say 'VCA, VCF' for envelopes and '32' oscillators without saying per voice; both are per voice.",
    "The headphone output is specified as 'max 25mW dBu', mixing two units.",
]

D["modelling_gaps"] = [
    {"topic": "Thin source", "detail": "A quick start guide. The full UB-Xa manual and the OB-Xa owner's manual would resolve most of not_in_source; the OB-Xa scan is uploaded but unread."},
    {"topic": "Envelope times", "detail": "None given. The OB-Xa manual gives ranges for its envelopes and the UB-Xa is designed to match; that is the first thing to OCR."},
    {"topic": "Control tapers", "detail": "Every knob is 0 to 10. OSC 1 frequency is in octave steps and OSC 2 in semitone steps; the LFOs have a stated Hz range; nothing else has physical end points."},
    {"topic": "Filter", "detail": "No cutoff range, no resonance law, no self-oscillation statement, and nothing on what distinguishes the 2-pole and 4-pole modes beyond slope. The OB-Xa's two filter modes sound very different and this is the heart of the instrument."},
    {"topic": "Vintage mode", "detail": "A VINTAGE shift function exists and is undescribed. The UB-Xa is known to model several OB-Xa revisions; none of that is in this guide."},
    {"topic": "Modulation matrix", "detail": "A MOD menu exists behind SHIFT + recall switch 4. Nothing about slots, sources or destinations is given, so unlike the DeepMind this file has no mod_matrix section."},
    {"topic": "Pulse width", "detail": "One knob for both oscillators; modelled as osc1.pulse_width with osc2 following it, and PWM per oscillator switched separately."},
    {"topic": "Pedal scaling", "detail": "The vibrato pedal scales a depth parameter and the filter pedal offsets cutoff; the first is a behaviour and the second a connection, because the schema has no way to say a jack scales a parameter."},
]

with open("/mnt/user-data/outputs/behringer-ub-xa-d.synth.json", "w", encoding="utf-8") as f:
    json.dump(D, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
