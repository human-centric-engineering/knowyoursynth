#!/usr/bin/env python3
"""Assemble the Moog Grandmother device file.

A 32-key semi-modular built from Moog modular circuits: two VCOs, noise, mixer, ladder
filter, static high-pass filter, ADSR, VCA with three modes, LFO with sample and hold,
attenuator, four-jack mult, a real spring reverb, and an arpeggiator and sequencer.

The owner's manual documents every normal, so connections here are stated, not
inferred. The Behringer Model 15 copies this layout; see its file for differences.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.10.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
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


def enum(id, module, label, fn, vals, control="toggle_switch", **kw):
    par(id, module, label, "enum", fn, control, values=[v if isinstance(v, dict) else {"value": v} for v in vals], **kw)


def gset(id, module, label, fn, vals, key, default=None, cc=None):
    acc = [{"type": "gesture", "gesture": f"global settings (hold HOLD + SYNC), then key {key}", "when": "any_time"}]
    if cc:
        acc.append({"type": "midi", "message": f"CC {cc}"})
    kw = {"default": default} if default is not None else {}
    par(id, module, label, "enum", fn, values=[v if isinstance(v, dict) else {"value": v} for v in vals], access=acc, **kw)


def jack(id, label, direction, signal, node, fn, location=None, connector="3.5 mm TS", **kw):
    j = {"id": id, "label": label, "location": location or ("patch_in" if direction == "in" else "patch_out"), "direction": direction,
         "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="audio", when=None, **kw):
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "normalled" if "broken_by" in kw else ("switched" if when else "fixed")}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


D["device"] = {
    "id": "moog-grandmother", "manufacturer": "Moog Music", "model": "Grandmother",
    "category": "monophonic semi-modular analogue synthesizer with 32-key keyboard, spring reverb, arpeggiator and sequencer",
    "based_on": "Moog modular (Model 15) and Minimoog circuits; released 2018.",
    "sources": [{"id": "manual", "title": "Moog Grandmother Owner's Manual", "kind": "user_manual", "file": "Grandmother_Manual.pdf", "pages": 56,
                 "note": "Full controls, patch point index with impedances and ranges, normals, arpeggiator and sequencer, global settings, MIDI CC table, specifications."}],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic; note priority low, high or last",
    "poly_chain_max_units": None, "patch_memory": False, "patch_memory_note": "No sound memory; three sequences of up to 256 steps, kept with power off.",
    "semi_modular": True, "panel_counts": {"keys": 32, "patch_inputs": 21, "patch_outputs": 16, "mult_jacks": 4, "patch_points": 41},
    "summary": ("Two VCOs (triangle, saw, square, narrow pulse) with hard sync and linear FM on Oscillator 2, white noise and an instrument input "
                "into a DC-coupled mixer that overdrives above 1 o'clock, a 24 dB Moog ladder filter, a separate static 6 dB high-pass filter, one "
                "ADSR, a VCA set to ENV, KB RLS or DRONE, an LFO from 0.07 Hz to 1.3 kHz with sample and hold, a bipolar attenuator, a four-jack "
                "mult and a real spring reverb tank. Plays without patching; 41 jacks extend or override the normals."),
}

# ---------------- modules ----------------
mod("kbd", "voice_allocator", "Keyboard and left-hand controller", "KEYBOARD / LEFT HAND CONTROLLER",
    "32-key velocity-sensing keyboard with pitch and mod wheels, glide, octave transpose and the ARP/SEQ transport buttons. Produces pitch CV, gate and velocity, "
    "routed through the arpeggiator or sequencer when playing.", ["kbd.clock_in", "kbd.on_in", "kbd.reset_in"], ["kbd.cv", "kbd.gate", "kbd.velocity", "kbd.clock_out", "kbd.bend"],
    {"keys": 32, "velocity": "not hard-wired; KB VEL OUT and MIDI only"})
mod("osc1", "oscillator", "Oscillator 1", "OSCILLATORS", "Triangle, saw, square or narrow pulse (25%) at 32'-4'. Tuned by the rear FINE TUNE.",
    ["osc1.pitch_cv", "osc1.pwm"], ["osc1.out"])
mod("osc2", "oscillator", "Oscillator 2", "OSCILLATORS", "Triangle, saw, square or narrow pulse at 16'-2', detunable ±7 semitones, hard sync to Oscillator 1 and linear FM.",
    ["osc2.pitch_cv", "osc2.fm", "osc2.pwm", "osc2.sync_in"], ["osc2.out"])
mod("noise", "noise", "Noise", "MIXER", "White noise generator.", [], ["noise.out"])
mod("instr", "preamp", "Instrument input", "REAR PANEL", "High-gain preamp for the 1/4\" INSTRUMENT IN, bringing guitar-level signals to 10 Vpp in the mixer; no gain control.",
    ["instr.in"], ["instr.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "DC-coupled three-channel mixer plus the instrument input; levels above 1 o'clock overdrive gently, higher settings harder.",
    ["mixer.in1", "mixer.in2", "mixer.in3", "mixer.ext"], ["mixer.out"])
mod("vcf", "filter", "Low pass filter", "FILTER", "Moog 24 dB/oct ladder, 10 Hz-20 kHz, self-oscillating, with bipolar envelope amount and key tracking.",
    ["vcf.in", "vcf.cutoff_cv", "vcf.env_amt_cv", "vcf.env_in", "vcf.key_cv"], ["vcf.out"], {"slope_db_per_oct": 24, "cutoff_hz": [10, 20000], "key_tracking_1_1": "1 V/oct"})
mod("hpf", "filter", "High pass filter", "UTILITIES", "Static 6 dB/oct (one-pole) high-pass, only in the path when patched.", ["hpf.in"], ["hpf.out"], {"slope_db_per_oct": 6})
mod("env", "envelope", "Envelope", "ENVELOPE", "ADSR with normal and inverted outputs; retriggers above 1.2 V.", ["env.trig"], ["env.pos", "env.neg"])
mod("vca", "vca", "VCA", "OUTPUT", "ENV follows the envelope; KB RLS opens fully on key down and closes with the release; DRONE stays open. VCA AMT IN multiplies (or, in DRONE, sets) the level.",
    ["vca.in", "vca.cv", "vca.env_in"], ["vca.out"])
mod("lfo", "lfo", "Modulation", "MODULATION", "LFO from 0.07 Hz to 1.3 kHz (sine, sawtooth, ramp, square), 1 V/oct rate input, reset input, and sample and hold.",
    ["lfo.rate_cv", "lfo.sync"], ["lfo.out"], {"rate_hz": [0.07, 1300]})
mod("snh", "sample_hold", "Sample and hold", "MODULATION", "Samples the noise source at each zero crossing of the LFO. No internal routing: patch S/H OUT.",
    ["snh.in", "snh.clock"], ["snh.out"])
mod("att", "attenuator", "Attenuator", "UTILITIES", "Bipolar attenuator: centre off, clockwise up to unity, anticlockwise up to unity inverted. Input normalled to a positive voltage, so unpatched it is a ±8 V DC source.",
    ["att.in"], ["att.out"])
mod("ref", "cv_source_selector", "Attenuator reference", "UTILITIES", "Internal positive voltage normalled to the attenuator input.", [], ["ref.pos"])
mod("mult", "mult", "Mult", "UTILITIES", "Four unbuffered parallel jacks; any can be an input or output. Can merge two AC-coupled audio signals.", ["mult.in"], ["mult.out"])
mod("reverb", "reverb", "Spring reverb", "OUTPUT", "6-inch analogue spring reverb tank, with its own input and 100% wet rear output; sensitive to vibration and interference.",
    ["reverb.in"], ["reverb.out"], {"tank": "6-inch spring"})
mod("out", "output", "Output", "OUTPUT", "Reverb MIX blends dry VCA and wet reverb; VOLUME then sets the main/headphone level. The Eurorack out is taken after MIX, before VOLUME.",
    ["out.dry", "out.wet"], ["out.main", "out.eurorack"])

# ---------------- parameters ----------------
par("kbd.pitch_wheel", "kbd", "PITCH", "continuous", "Spring-loaded pitch bend; range 1-12 semitones (default 2) in global settings.", "wheel", panel_scale={"min": -1, "max": 1})
par("kbd.mod_wheel", "kbd", "MOD", "continuous", "Scales the Modulation section from off to the PITCH AMT, CUTOFF AMT and PULSE WIDTH AMT settings.", "wheel", panel_scale=S10,
    access=[{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "CC 1"}])
par("kbd.glide", "kbd", "GLIDE", "continuous", "Glide time; minimum is off. HOLD (or SHIFT) + GLIDE right/left turns legato glide on/off.", panel_scale=S10,
    access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 5"}])
par("kbd.play", "kbd", "PLAY (TIE)", "boolean", "Starts the ARP/SEQ; enters a tie when recording.", "push_button")
par("kbd.hold", "kbd", "HOLD (REST)", "boolean", "Keeps the ARP/SEQ playing after keys are released; enters a rest when recording.", "push_button")
par("kbd.tap", "kbd", "TAP (ACCENT)", "boolean", "Three or more taps set the tempo (hold one second to exit); adds an accent when recording.", "push_button")
par("kbd.octave", "kbd", "<KB / KB>", "integer", "Keyboard octave transpose, with SHIFT.", "push_button", range={"min": -2, "max": 2},
    access=[{"type": "gesture", "gesture": "hold SHIFT and press <KB or KB>", "when": "any_time"}, {"type": "midi", "message": "CC 89"}])
par("arpseq.rate", "kbd", "RATE", "continuous", "ARP/SEQ tempo 20-280 BPM; when synced, selects divisions (SHIFT for triplets).",
    physical={"min": 20, "max": 280, "unit": "BPM"}, access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 8"}])
enum("arpseq.mode", "kbd", "MODE", "Arpeggiator, sequencer, or sequencer record.", ["arp", "seq", "rec"])
enum("arpseq.direction", "kbd", "DIRECTION", "Order played / start to end; forward then backward; random.", ["ordr", "fwd_bkwd", "rndm"])
enum("arpseq.oct_seq", "kbd", "OCT / SEQ", "Arpeggio range in octaves, or sequence 1-3.", [1, 2, 3])
enum("osc1.octave", "osc1", "OCTAVE", "Oscillator 1 footage.", ["32'", "16'", "8'", "4'"], "rotary_switch")
enum("osc1.waveform", "osc1", "WAVEFORM", "Oscillator 1 waveform.", ["triangle", "saw", "square", "narrow_pulse"], "rotary_switch")
par("osc2.sync", "osc2", "SYNC", "boolean", "Hard-syncs Oscillator 2 to Oscillator 1 (lit button).", "push_button", access=[{"type": "panel", "control": "push_button"}, {"type": "midi", "message": "CC 77"}])
enum("osc2.octave", "osc2", "OCTAVE", "Oscillator 2 footage.", ["16'", "8'", "4'", "2'"], "rotary_switch")
par("osc2.frequency", "osc2", "FREQUENCY", "continuous", "Detune ±7 semitones; with sync on, a much wider range that sweeps the sync timbre.", panel_scale={"min": -7, "max": 7},
    access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 12"}])
enum("osc2.waveform", "osc2", "WAVEFORM", "Oscillator 2 waveform.", ["triangle", "saw", "square", "narrow_pulse"], "rotary_switch")
par("osc.fine_tune", "osc1", "FINE TUNE", "continuous", "Rear panel: fine tuning of both oscillators.", panel_scale={"min": -5, "max": 5}, access=[{"type": "rear_panel", "control": "knob"}])
for n, lbl in ((1, "OSCILLATOR 1"), (2, "OSCILLATOR 2"), (3, "NOISE")):
    par(f"mixer.level{n}", "mixer", lbl, "continuous", f"Level of {lbl.lower()} (or whatever is patched in its place); overdrives above 1 o'clock.", panel_scale=S10)
par("vcf.cutoff", "vcf", "CUTOFF", "continuous", "Cutoff frequency.", physical={"min": 10, "max": 20000, "unit": "Hz"})
enum("vcf.kbd_track", "vcf", "KBD TRACK", "Keyboard tracking of cutoff.", [{"value": "1:2", "meaning": "half"}, {"value": "off"}, {"value": "1:1", "meaning": "1 V/oct"}])
par("vcf.env_amt", "vcf", "ENVELOPE AMT", "continuous", "Bipolar envelope depth on cutoff.", panel_scale={"min": -5, "max": 5})
par("vcf.resonance", "vcf", "RESONANCE", "continuous", "Feedback to self-oscillation; may reduce level and bass.", panel_scale=S10)
for k in ("attack", "decay", "release"):
    par(f"env.{k}", "env", k.upper(), "continuous", f"Envelope {k} time.", panel_scale=S10)
par("env.sustain", "env", "SUSTAIN", "continuous", "Sustain level.", "fader", panel_scale=S10)
par("lfo.rate", "lfo", "RATE", "continuous", "LFO rate; SHIFT for fine adjustment.", physical={"min": 0.07, "max": 1300, "unit": "Hz"},
    access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 3"}])
enum("lfo.waveform", "lfo", "WAVEFORM", "LFO waveform.", ["sine", "sawtooth", "ramp", "square"], "rotary_switch")
par("lfo.pitch_amt", "lfo", "PITCH AMT", "continuous", "Maximum LFO depth on both oscillators' pitch, at full MOD wheel.", panel_scale=S10)
par("lfo.cutoff_amt", "lfo", "CUTOFF AMT", "continuous", "Maximum LFO depth on cutoff, at full MOD wheel.", panel_scale=S10)
par("lfo.pw_amt", "lfo", "PULSE WIDTH AMT", "continuous", "Maximum LFO depth on square and narrow pulse width, at full MOD wheel.", panel_scale=S10)
par("hpf.cutoff", "hpf", "HIGH PASS", "continuous", "High-pass cutoff.", panel_scale=S10)
par("att.amount", "att", "ATTENUATOR", "continuous", "Centre off; clockwise to unity, anticlockwise to unity inverted.", panel_scale={"min": -5, "max": 5})
par("out.volume", "out", "VOLUME", "continuous", "Main and headphone level, after the reverb MIX.", panel_scale=S10)
enum("vca.mode", "vca", "VCA MODE", "Envelope, keyboard release, or drone.", ["env", "kb_rls", "drone"])
par("reverb.mix", "reverb", "MIX", "continuous", "Dry to fully wet spring reverb.", panel_scale=S10)
par("kbd.shift", "kbd", "SHIFT", "boolean", "Second functions: octave transpose, fine LFO rate, triplet divisions, legato glide.", "push_button")
gset("sys.midi_channel", "kbd", "MIDI channel", "Send and receive channel.", list(range(1, 17)), "F#0 then F0-G2", default=1)
gset("sys.midi_clock_in", "kbd", "MIDI clock input", "Follow MIDI clock and start/stop, clock only, or ignore.", ["clock_and_start_stop", "clock_only", "ignore"], "G#0")
gset("sys.midi_clock_out", "kbd", "MIDI clock output", "Send MIDI clock and start/stop, clock only, or nothing.", ["clock_and_start_stop", "clock_only", "none"], "A#0")
gset("sys.note_priority", "kbd", "Note priority", "Which note wins on the mono keyboard.", ["low", "high", "last"], "C#1", default="last")
gset("sys.bend_range", "kbd", "Pitch bend range", "Bend range in semitones.", list(range(1, 13)), "D#1", default=2)
gset("sys.ext_clock_mode", "kbd", "External clock mode", "CLOCK IN sets tempo, or advances one step per pulse.", ["clock", "step_advance"], "F#1", default="clock")
PPQN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 48]
gset("sys.clock_in_ppqn", "kbd", "Clock input PPQN", "Pulses per quarter note expected at CLOCK IN.", PPQN, "G#1", default=2)
gset("sys.clock_out_ppqn", "kbd", "Clock output PPQN", "Pulses per quarter note sent at CLOCK OUT.", PPQN, "A#1", default=2)
gset("sys.kb_out_range", "kbd", "KB OUT range", "Pitch CV range at KB OUT.", ["-5_to_5", "0_to_10"], "C#2", default="-5_to_5")
gset("sys.local", "kbd", "Local control", "Off: keyboard, wheel and arpeggiator only reach the CV jacks and MIDI.", ["off", "on"], "D#2", default="on")
par("kbd.glide_type", "kbd", "Glide type", "enum", "Linear constant rate, linear constant time, or exponential.", values=[{"value": "lcr"}, {"value": "lct"}, {"value": "exponential"}],
    access=[{"type": "midi", "message": "CC 85"}])
par("kbd.gated_glide", "kbd", "Gated glide", "boolean", "Glide only while a key is held.", access=[{"type": "midi", "message": "CC 103"}])
par("kbd.legato_glide", "kbd", "Legato glide", "boolean", "Glide only between overlapping notes.", default=False,
    access=[{"type": "gesture", "gesture": "hold HOLD (or SHIFT) and turn GLIDE right to enable, left to disable", "when": "any_time"}, {"type": "midi", "message": "CC 94"}])

# ---------------- ports ----------------
jack("jack.gate_out", "GATE OUT", "out", "gate", "kbd.gate", "Gate from keyboard, arpeggiator or sequencer, +8 V.")
jack("jack.kb_out", "KB OUT", "out", "cv", "kbd.cv", "Pitch CV, 1 V/oct, -5 to +5 V (or 0 to 10 V).")
jack("jack.kb_vel_out", "KB VEL OUT", "out", "cv", "kbd.velocity", "Velocity CV 0 to +5 V; during sequencer playback, an accent envelope on accented steps.")
jack("jack.osc1_wave", "OSC 1 WAVE OUT", "out", "audio", "osc1.out", "Oscillator 1, 10 Vpp, AC coupled.")
jack("jack.osc1_pitch", "OSC 1 PITCH IN", "in", "cv", "osc1.pitch_cv", "Summed with the keyboard pitch CV. -5 to +5 V.", combine="sum")
jack("jack.osc1_pwm", "OSC 1 PWM IN", "in", "cv", "osc1.pwm", "Pulse width of square (from 50%) or narrow pulse (from 25%). 0 to +5 V.")
jack("jack.osc2_wave", "OSC 2 WAVE OUT", "out", "audio", "osc2.out", "Oscillator 2, 10 Vpp, AC coupled.")
jack("jack.osc2_pitch", "OSC 2 PITCH IN", "in", "cv", "osc2.pitch_cv", "Summed with the keyboard pitch CV.", combine="sum")
jack("jack.osc2_fm", "OSC 2 LIN FM IN", "in", "cv_or_audio", "osc2.fm", "Linear FM of Oscillator 2.")
for n, nm, src in ((1, "OSC 1 IN", "Oscillator 1"), (2, "OSC 2 IN", "Oscillator 2"), (3, "NOISE IN", "the noise generator")):
    jack(f"jack.mix_in{n}", nm, "in", "cv_or_audio", f"mixer.in{n}", f"Replaces {src} in the mixer; the same level knob applies.")
jack("jack.mixer_out", "MIXER OUTPUT", "out", "cv_or_audio", "mixer.out", "Mixer output.")
for k in (1, 2, 3, 4):
    jack(f"jack.mult_{k}", f"MULT {k}", "in" if k == 1 else "out", "cv_or_audio", "mult.in" if k == 1 else "mult.out",
         "Unbuffered parallel jack; usable as input or output (modelled with jack 1 as the input).")
jack("jack.hpf_in", "HIGH PASS FILTER INPUT", "in", "audio", "hpf.in", "Into the high-pass filter.")
jack("jack.hpf_out", "HIGH PASS FILTER OUTPUT", "out", "audio", "hpf.out", "High-pass output, AC coupled.")
jack("jack.att_in", "ATTENUATOR INPUT", "in", "cv_or_audio", "att.in", "Attenuator input; unpatched, it reads a positive reference.")
jack("jack.att_out", "ATTENUATOR OUTPUT", "out", "cv_or_audio", "att.out", "Attenuator output.")
jack("jack.filter_in", "FILTER INPUT", "in", "audio", "vcf.in", "Replaces the mixer feed to the filter.")
jack("jack.filter_out", "FILTER OUTPUT", "out", "audio", "vcf.out", "Low-pass output, AC coupled.")
jack("jack.env_amt_in", "ENV AMT IN", "in", "cv", "vcf.env_amt_cv", "Summed with ENVELOPE AMT. -8 to +8 V.")
jack("jack.cutoff_in", "CUTOFF IN", "in", "cv", "vcf.cutoff_cv", "Summed into cutoff. -5 to +5 V.", combine="sum")
jack("jack.trigger_in", "TRIGGER IN", "in", "gate", "env.trig", "Replaces the keyboard gate as envelope trigger (above 1.2 V).")
jack("jack.env_pos", "+ ENV OUT", "out", "cv", "env.pos", "Envelope, 10 Vpp.")
jack("jack.env_neg", "– ENV OUT", "out", "cv", "env.neg", "Inverted envelope.")
jack("jack.vca_amt_in", "VCA AMT IN", "in", "cv", "vca.cv", "Multiplies the level in ENV and KB RLS; sets it alone in DRONE (0 to +8 V).")
jack("jack.vca_in", "VCA IN", "in", "audio", "vca.in", "Replaces the filter feed to the VCA.")
jack("jack.reverb_in", "REVERB IN", "in", "audio", "reverb.in", "Replaces the VCA feed to the reverb.")
jack("jack.rate_in", "RATE IN", "in", "cv", "lfo.rate_cv", "Added to RATE, 1 V/oct; patch KB OUT here to play the LFO.")
jack("jack.lfo_sync", "SYNC IN", "in", "gate", "lfo.sync", "Resets the LFO on a rising edge; steps the S/H.")
jack("jack.lfo_out", "WAVE OUT", "out", "cv", "lfo.out", "LFO, 10 Vpp, DC coupled.")
jack("jack.snh_out", "S/H OUT", "out", "cv", "snh.out", "Sampled noise, -5 to +5 V.")
jack("jack.clock_in", "CLOCK IN", "in", "clock", "kbd.clock_in", "External clock (or step advance) on rising edges.", location="rear", combine="replace")
jack("jack.on_off_in", "ON / OFF IN", "in", "gate", "kbd.on_in", "Above 2.5 V runs the ARP/SEQ, below stops it.", location="rear")
jack("jack.reset_in", "RESET IN", "in", "gate", "kbd.reset_in", "Above 2.5 V resets the pattern without stopping.", location="rear")
jack("jack.clock_out", "CLOCK OUT", "out", "clock", "kbd.clock_out", "Clock at the ARP/SEQ rate, 0 to +5 V.", location="rear")
jack("jack.eurorack_out", "EURORACK OUT", "out", "audio", "out.eurorack", "Main signal at Eurorack level, after MIX, before VOLUME.", location="rear")
jack("jack.reverb_out", "REVERB OUT", "out", "audio", "reverb.out", "Reverb only, 100% wet.", location="rear")
jack("jack.main_out", "MAIN OUT / HEADPHONE OUT", "out", "audio", "out.main", "Mono line or headphones; use a TS cable for line.", location="rear", connector="6.35 mm TRS")
jack("jack.instrument_in", "INSTRUMENT IN", "in", "audio", "instr.in", "Guitar or other external audio into the mixer; no gain control.", location="rear", connector="6.35 mm TS")
for nm, d in (("midi_in", "in"), ("midi_out", "out"), ("midi_thru", "out")):
    jack(f"jack.{nm}", nm.replace("_", " ").upper(), d, "midi", None, f"MIDI {nm.split('_')[1]}.", location="rear", connector="5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "MIDI over USB.", location="rear", connector="USB type B")
jack("jack.dc_in", "POWER", "in", "power", None, "12 V DC, 2 A, positive tip.", location="rear", connector="DC barrel")

# ---------------- normals and internal wiring ----------------
LOCAL = {"param": "sys.local", "equals": "on"}
con("kbd.cv", "osc1.pitch_cv", "cv", LOCAL)
con("kbd.cv", "osc2.pitch_cv", "cv", LOCAL)
con("kbd.bend", "osc1.pitch_cv", "cv", amount="sys.bend_range")
con("kbd.bend", "osc2.pitch_cv", "cv", amount="sys.bend_range")
con("kbd.cv", "vcf.key_cv", "cv", {"param": "vcf.kbd_track", "not_equals": "off"}, note="Full at 1:1, half at 1:2.")
con("kbd.gate", "env.trig", "gate", broken_by="jack.trigger_in")
con("osc1.out", "osc2.sync_in", "sync", {"param": "osc2.sync", "equals": True})
con("osc1.out", "mixer.in1", broken_by="jack.mix_in1")
con("osc2.out", "mixer.in2", broken_by="jack.mix_in2")
con("noise.out", "mixer.in3", broken_by="jack.mix_in3")
con("instr.out", "mixer.ext")
con("mixer.out", "vcf.in", broken_by="jack.filter_in")
con("vcf.out", "vca.in", broken_by="jack.vca_in")
con("env.pos", "vcf.env_in", "cv", amount="vcf.env_amt")
con("env.pos", "vca.env_in", "cv", {"param": "vca.mode", "not_equals": "drone"}, note="In KB RLS only the release stage shapes the level.")
con("vca.out", "reverb.in", broken_by="jack.reverb_in")
con("vca.out", "out.dry")
con("reverb.out", "out.wet", amount="reverb.mix")
for dst, amt in (("osc1.pitch_cv", "lfo.pitch_amt"), ("osc2.pitch_cv", "lfo.pitch_amt"), ("osc1.pwm", "lfo.pw_amt"), ("osc2.pwm", "lfo.pw_amt"), ("vcf.cutoff_cv", "lfo.cutoff_amt")):
    con("lfo.out", dst, "cv", amount_expr=f"{amt} * kbd.mod_wheel")
con("noise.out", "snh.in", "cv")
con("lfo.out", "snh.clock", "clock", note="Samples at each zero crossing of the LFO.")
con("ref.pos", "att.in", "cv", broken_by="jack.att_in")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "arpseq.led", "module": "kbd", "label": "RATE LED", "kind": "led", "function": "Flashes at the ARP/SEQ rate."},
    {"id": "lfo.led", "module": "lfo", "label": "RATE LED", "kind": "led", "function": "Flashes at the LFO rate."},
    {"id": "kbd.tap_led", "module": "kbd", "label": "TAP light", "kind": "led", "function": "Lit while tap tempo is active."},
    {"id": "osc2.sync_led", "module": "osc2", "label": "SYNC", "kind": "led", "function": "Lit when sync is on; blinks in global settings."},
    {"id": "kbd.midi_led", "module": "kbd", "label": "MIDI LED", "kind": "led", "function": "Blinks on MIDI input."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Default signal path", "applies_to": ["osc1", "osc2", "noise", "mixer", "vcf", "vca", "reverb", "out"],
     "rule": "Oscillators and noise (plus the instrument input) into the mixer, then the ladder filter, VCA, spring reverb and output. Keyboard CV to both "
             "oscillators and, by KBD TRACK, the filter; gate to the envelope. Patching OSC 1/2 IN, NOISE IN, FILTER INPUT, VCA IN, REVERB IN or TRIGGER IN "
             "breaks that normal. The high-pass filter, attenuator, mult and S/H are unpatched resources."},
    {"id": "b02", "name": "Pitch inputs sum", "applies_to": ["osc1", "osc2"],
     "rule": "OSC PITCH IN, LIN FM IN and the LFO add to the keyboard pitch; nothing breaks the keyboard normal except Local off."},
    {"id": "b03", "name": "MOD wheel", "applies_to": ["lfo", "kbd"],
     "rule": "PITCH AMT, CUTOFF AMT and PULSE WIDTH AMT set maximum depths; the MOD wheel sets how much is applied. At minimum MOD, no LFO modulation is heard. PWM needs a square or narrow pulse selected."},
    {"id": "b04", "name": "VCA modes", "applies_to": ["vca", "env"],
     "rule": "ENV: envelope sets the level. KB RLS: full level on key down, then the envelope release on key up (a variant of the Moog KB GATE). DRONE: always on; a VCA AMT IN connection then sets the level alone."},
    {"id": "b05", "name": "Mixer drive", "applies_to": ["mixer"],
     "rule": "The mixer is DC coupled, so it also sums CVs. Levels above 1 o'clock add gentle distortion, higher settings overdrive."},
    {"id": "b06", "name": "Sample and hold", "applies_to": ["snh", "lfo"],
     "rule": "Noise is sampled at each zero crossing of the LFO. Patching GATE OUT to SYNC IN with RATE at minimum steps the S/H with each key."},
    {"id": "b07", "name": "Arpeggiator", "applies_to": ["kbd"],
     "rule": "Plays held notes in order, forward then backward, or randomly, over 1-3 octaves, at 20-280 BPM or synced divisions (MIDI, CLOCK IN, tap). HOLD latches; notes added while holding join the pattern."},
    {"id": "b08", "name": "Sequencer", "applies_to": ["kbd"],
     "rule": "Three sequences of up to 256 steps, kept without power. REC then play notes; HOLD adds a rest, PLAY a tie, TAP an accent, overlapping keys give legato. "
             "SEQ ends recording; PLAY then a key starts it, and keys transpose. Edit only while playing (switch to REC during playback); a key in REC while stopped erases the sequence. "
             "Accents leave on KB VEL OUT as a fast envelope; patch it to CUTOFF IN to hear them."},
    {"id": "b09", "name": "Velocity", "applies_to": ["kbd"], "rule": "The keyboard senses velocity but it is not wired internally; use KB VEL OUT or MIDI."},
    {"id": "b10", "name": "Stuck notes", "applies_to": ["kbd"], "rule": "Holding all three left-hand buttons for about a second clears the note stack and sends All Notes Off."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "control_change", "cc": 1, "parameter": "kbd.mod_wheel"},
                 {"message": "control_change", "cc": 3, "parameter": "lfo.rate"}, {"message": "control_change", "cc": 5, "parameter": "kbd.glide"},
                 {"message": "control_change", "cc": 8, "parameter": "arpseq.rate"}, {"message": "control_change", "cc": 12, "parameter": "osc2.frequency"},
                 {"message": "control_change", "cc": 64, "parameter": "sustain pedal"}, {"message": "control_change", "cc": 65, "parameter": "glide on/off"},
                 {"message": "control_change", "cc": 69, "parameter": "arp/seq hold"}, {"message": "control_change", "cc": 73, "parameter": "arp/seq play"},
                 {"message": "control_change", "cc": 74, "parameter": "osc 1 octave"}, {"message": "control_change", "cc": 75, "parameter": "osc 2 octave"},
                 {"message": "control_change", "cc": 77, "parameter": "osc2.sync"}, {"message": "control_change", "cc": 85, "parameter": "kbd.glide_type"},
                 {"message": "control_change", "cc": 89, "parameter": "kbd.octave"}, {"message": "control_change", "cc": 90, "parameter": "arp/seq clock division"},
                 {"message": "control_change", "cc": 91, "parameter": "arpseq.mode"}, {"message": "control_change", "cc": 92, "parameter": "arpseq.direction"},
                 {"message": "control_change", "cc": 93, "parameter": "arpseq.oct_seq"}, {"message": "control_change", "cc": 94, "parameter": "kbd.legato_glide"},
                 {"message": "control_change", "cc": 103, "parameter": "kbd.gated_glide"}, {"message": "control_change", "cc": 107, "parameter": "pitch bend up amount"},
                 {"message": "control_change", "cc": 108, "parameter": "pitch bend down amount"}, {"message": "control_change", "cc": 119, "parameter": "keyboard transpose (semitones)"},
                 {"message": "control_change", "cc": 120, "parameter": "all sounds off"}, {"message": "control_change", "cc": 122, "parameter": "local control"},
                 {"message": "control_change", "cc": 123, "parameter": "all notes off"},
                 {"message": "rpn", "number": 0, "parameter": "pitch bend amount"}, {"message": "rpn", "number": 1, "parameter": "fine tuning"},
                 {"message": "rpn", "number": 2, "parameter": "coarse tuning"}, {"message": "clock"}, {"message": "start"}, {"message": "stop"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "clock", "note": "per global setting"}, {"message": "start"}, {"message": "stop"}],
    "channel_note": "Channel 1-16 in global settings; default 1. 14-bit pairs available for CC 1, 3, 5, 8 and 12.",
    "note": "Only CC 1, 3, 5, 8 and 12 address analogue controls; switch-position CCs cover octaves, sync and the ARP/SEQ."}
D["specifications"] = {
    "keys": "32 full-size, velocity sensing", "polyphony": "monophonic", "oscillators": 2, "noise": "white", "filters": {"vcf": "-24 dB/oct ladder, self-oscillating, 10 Hz-20 kHz", "hpf": "-6 dB/oct static"},
    "lfo_rate_hz": [0.07, 1300], "envelope": "ADSR", "arp_seq": {"steps": 256, "sequences": 3, "tempo_bpm": [20, 280]}, "effects": "6-inch spring reverb",
    "patch_points": {"total": 41, "inputs": 21, "outputs": 16, "mults": 4}, "audio_in": "1/4\" TS instrument (rear)", "audio_out": "1/4\" TRS main/headphones (rear)",
    "midi": "5-pin DIN in, out, thru; USB", "dimensions_mm": {"w": 548.2, "d": 361.9, "h": 139.7}, "weight_kg": 7.25,
    "power": {"adaptor": "12 V DC, 2 A, positive tip; 100-240 V AC"},
}
D["omitted_from_source"] = ["unpacking, safety and warranty text", "the waveform and envelope primer text", "the full clock division table values for CC 90", "pitch bend and transpose CC value tables"]
D["not_in_source"] = ["envelope stage times", "LFO and oscillator pitch ranges in Hz beyond the panel footages", "the attenuator reference voltage's exact value (output reaches ±8 V)", "oscillator 2 FREQUENCY range options in global settings"]
D["source_inconsistencies"] = [
    "The overview page counts 41 patch points as 21 inputs and 20 outputs; the specifications give 21 inputs, 16 outputs and 4 mults.",
    "The feature summary and CUTOFF text give a 10 Hz lower cutoff; the panel scale starts at 20 Hz.",
    "Legato glide is toggled with HOLD + GLIDE in the left-hand controller section and with SHIFT + GLIDE in the sequencing tip.",
    "MIDI CC 74 and 75 both list 32' as a value, but Oscillator 2's octave switch runs 16' to 2'.",
]
D["modelling_gaps"] = [
    {"topic": "Mult", "detail": "Four bidirectional parallel jacks are modelled as one input and three outputs on a shared bus."},
    {"topic": "Spring reverb", "detail": "A physical tank; its decay and colour are not documented."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/moog-grandmother_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
