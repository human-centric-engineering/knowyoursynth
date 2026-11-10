#!/usr/bin/env python3
"""Assemble the Roland JP-8080 device file (schema 0.13.0).

2U rack/desktop virtual analogue sound module, the JP-8000's engine without a keyboard.
Two parts (Upper and Lower), each playing a full patch: OSC 1 (super saw, triangle mod,
noise, feedback osc, square/PWM, saw, triangle) and OSC 2 (square/PWM, saw, triangle,
noise, or external audio) with sync, ring and cross mod; AD pitch envelope; HPF/BPF/LPF
at 12 or 24 dB with ADSR; amp with ADSR, LFO and auto/manual pan; LFO 1 and the mod-wheel
LFO 2; tone control, multi-effects and delay per patch. 10 voices (8 with the Voice
Modulator on), shared by the parts in Single, Dual or Split key modes. Voice Modulator
(two 12-band filter sets as formant filter or filter bank, robot oscillator, noise,
own ensemble and delay, vocal morph control), velocity and control morphing, motion
control, arpeggiator and RPS pattern player. 128 user and 384 preset patches, 64 user
and 192 preset performances.

Source: Roland JP-8080 Owner's Manual (English, 220 pages, MIDI implementation v1.00,
April 1998), including the parameter lists, transmit/receive table and specifications.
"""
import json

K127 = {"min": 0, "max": 127}
BI = {"min": -64, "max": 63}
D = {"schema_version": "0.13.0"}
M, P, J, C = [], [], [], []

PERF_NOTE = "Stored in the performance, not the patch."
VMP = "Voice Modulator panel (hold SHIFT and press PANEL SELECT [UPPER]; both PANEL SELECT LEDs blink)"


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, cc2=None, **kw):
    """cc: MODE1 control change (the factory Tx/Rx mode). cc2: the MODE2 default where MODE1 uses SysEx."""
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("panel_note")} if "panel_note" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}", "note": "Tx/Rx Edit Mode MODE1 (factory) and MODE2 default"}]
    if cc2 is not None:
        acc = acc + [{"type": "sysex", "note": "MODE1 sends and receives this control as SysEx"},
                     {"type": "midi", "message": f"CC {cc2}", "note": "MODE2 default assignment"}]
    p["access"] = acc
    p["function"] = fn
    if kw.pop("perf", False):
        kw["note"] = (PERF_NOTE + " " + kw["note"]) if "note" in kw else PERF_NOTE
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, rng=K127, **kw):
    par(id, module, label, "integer", fn, range=rng, **kw)


def fader(id, module, label, fn, rng=K127, **kw):
    par(id, module, label, "integer", fn, control="fader", range=rng, **kw)


def btn(id, module, label, fn, **kw):
    par(id, module, label, "boolean", fn, control="push_button", **kw)


def sel(id, module, label, fn, vals, **kw):
    vv = [v if isinstance(v, dict) else {"value": v} for v in vals]
    par(id, module, label, "enum", fn, control="push_button", values=vv, **kw)


def menu(id, module, label, kind, fn, page, memory="patch", **kw):
    if "vals" in kw:
        kw["values"] = [v if isinstance(v, dict) else {"value": v} for v in kw.pop("vals")]
    par(id, module, label, kind, fn, memory=memory, access=[{"type": "menu", "note": f"EDIT, {page}"}] + kw.pop("extra_access", []), **kw)


def vmpanel(id, module, label, fn, phys, kind="integer", rng=K127, control="knob", **kw):
    par(id, module, label, kind, fn, range=rng, perf=True,
        access=[{"type": "panel", "control": control, "note": f"{VMP}: the {phys}"}], **kw)


def jack(id, label, location, direction, signal, node, fn, connector, **kw):
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


def ne(p, v):
    return {"param": p, "not_equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


def allof(*cs):
    return {"all": list(cs)}


SYNC_FULL = ["off", "1/16", "1/8T", "1/16.", "1/8", "1/4T", "1/8.", "1/4", "1/2T", "1/4.", "1/2", "1/1T", "1/2.", "1/1", "2/1T", "1/1.", "2/1",
             "3_measures", "4_measures", "5_measures", "6_measures", "7_measures", "8_measures"]
SYNC_DELAY = SYNC_FULL[:11]
VM_ASSIGNABLE = ["ensemble_level", "v_delay_time", "v_delay_feedback", "v_delay_level", "vocal_mix", "v_resonance", "v_release", "v_pan", "v_level",
                 "v_noise_cutoff", "v_noise_level", "gate_threshold", "robot_pitch", "robot_control", "robot_level"] + [f"character{i}" for i in range(1, 13)]
MFX = ["super_chorus_slw", "super_chorus_mid", "super_chorus_fst", "super_chorus_clr", "flanger_slow", "flanger_deep", "flanger_fast", "deep_phasing_slw",
       "jet_phasing", "twisting", "freeze_phase_1", "freeze_phase_2", "distortion"]
DLY = ["panning_l_r", "panning_r_l", "panning_short", "mono_short", "mono_long"]
BEATS = (["1/4", "1/6", "1/8", "1/12", "1/16", "1/32"] + [f"PORTA-A{i}" for i in range(1, 12)] + [f"PORTA-B{i}" for i in range(1, 16)]
         + [f"SEQUENCE-A{i}" for i in range(1, 8)] + [f"SEQUENCE-B{i}" for i in range(1, 6)] + [f"SEQUENCE-C{i}" for i in range(1, 3)]
         + [f"SEQUENCE-D{i}" for i in range(1, 9)] + [f"ECHO{i}" for i in range(1, 4)] + [f"MUTE{i}" for i in range(1, 17)]
         + [f"STRUMMING{i}" for i in range(1, 9)] + ["REFRAIN1", "REFRAIN2"] + [f"PERCUSSION{i}" for i in range(1, 5)] + ["WALKING BASS", "HARP", "RANDOM"])
assert len(BEATS) == 90

# ======================================================================== device
D["device"] = {
    "id": "roland-jp-8080", "manufacturer": "Roland", "model": "JP-8080",
    "category": "10-voice virtual analogue synthesizer module (2U rack or desktop), two parts, with voice modulator (vocoder), arpeggiator, RPS phrase player and motion control",
    "based_on": "The JP-8000 keyboard's analogue modelling engine (1996) in a module, released 1998; adds the Voice Modulator, external input synthesis, unison, distortion and 10-voice polyphony. Contains the JP-8000's 64 preset performances and 128 preset patches.",
    "sources": [
        {"id": "manual", "title": "Roland JP-8080 Owner's Manual (English, JP-8080_e3)", "kind": "user_manual", "file": "JP-8080_Manual.pdf", "pages": 220,
         "note": "Panel guide, every sound parameter, performance functions, arpeggiator, RPS, motion control, Voice Modulator, edit-menu parameters, memory, "
                 "initialise values, parameter lists, transmit/receive table, Voice Modulator initialise table, MIDI implementation (v1.00, April 1998), chart and specifications. "
                 "Blue Voice Modulator panel legends read from the front panel drawing on page 12."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive",
    "synthesis_note": "Virtual analogue: DSP models of analogue oscillators, filter and amplifier, plus four DSP waveforms with no analogue equivalent (super saw, triangle mod, feedback osc, filtered noise on OSC 1).",
    "signal_path": "digital", "voices": 10,
    "polyphony_mode": "10 voices (8 with the Voice Modulator on), newest note priority. Per patch: poly, MONO, LEGATO, UNISON or legato unison. Per performance: SINGLE, DUAL or SPLIT key mode, with Voice Assign splitting the voices between the parts in DUAL and SPLIT.",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": ("Two tiers. A patch is one sound (128 user, 384 preset in 3 groups of A/B banks of 64). A performance (64 user, 192 preset) holds complete copies of "
                          "its Upper and Lower patches plus part, key mode, arpeggiator/RPS and Voice Modulator settings, so editing a stored patch does not change performances that "
                          "used it. Edits go to a temporary area and must be written. RPS patterns (48), motions (2 sets of 2) and system settings are written directly. "
                          "SmartMedia cards hold up to 64 x 64 performances and 128 x 64 patches."),
    "semi_modular": False,
    "panel_counts": {"knobs": 30, "sliders": 14, "display": "16 x 2 backlit LCD"},
    "summary": (
        "Per voice: OSC 1 offers seven waveforms, each with two waveform-specific CONTROL knobs; OSC 2 offers square, saw, triangle or noise (controls only for square and noise) "
        "or external audio, with RANGE, FINE/WIDE, SYNC to OSC 1 and RING modulation. OSC 2 can cross modulate OSC 1's frequency. An AD pitch envelope and LFO 1 act on both "
        "oscillators, OSC 2 only, or the cross mod depth. OSC BALANCE mixes the two into a 12/24 dB HPF, BPF or LPF with key follow, ADSR envelope and LFO 1; then the amp with "
        "ADSR, level and LFO 1 as tremolo, auto pan or manual pan. LFO 2 (triangle) is brought in by the mod wheel on pitch, filter and amp. Each patch has its own tone control, "
        "13-type multi-effects and 5-type delay. Two parts play two patches; a Voice Modulator can turn them, external inputs or a robot oscillator into a vocoded or "
        "filter-banked signal. Velocity, aftertouch/breath (Control Up/Down), the voice (vocal morph) and recorded motions can each move almost every knob at once by preset widths."
    ),
}

# ======================================================================== modules
mod("kbd", "voice_allocator", "MIDI input and voice assigner", "KEY MODE / PANEL SELECT / CONTROL",
    "There is no keyboard. Notes arrive at MIDI IN (on each Part MIDI channel) or REMOTE KBD IN (treated like the panel). The assigner gives Upper and Lower parts their voices "
    "per KEY MODE and Voice Assign, handles MONO/LEGATO/UNISON, and turns velocity, mod wheel, bend, aftertouch and breath into control signals. In Preview the BANK and "
    "NUMBER buttons play C4 to C5 at velocity 80.",
    ["kbd.notes_in", "kbd.remote_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.mod_wheel", "kbd.bend", "kbd.control_up", "kbd.control_down", "kbd.trigger", "kbd.remote_notes", "kbd.midi_out"],
    scope="common", props={"voices": 10, "voices_voice_mod_on": 8, "parts": ["upper", "lower"], "standard_velocity": 80, "steal": "newest note priority, oldest note released"})
mod("pitch", "pitch_control", "Pitch processing", "PORTAMENTO / OSC COMMON",
    "Sums note pitch, portamento, OSC SHIFT, part transpose, part detune, bend, unison detune and master tune into the pitch both oscillators follow.",
    ["pitch.note", "pitch.bend"], ["pitch.cv"])
mod("osc1", "oscillator", "Oscillator 1", "OSC 1",
    "Seven waveforms, each with its own meaning for CONTROL 1 and CONTROL 2 (see properties). Receives cross modulation from OSC 2 on its frequency, except with super saw or noise.",
    ["osc1.pitch_cv", "osc1.fm_in", "osc1.shape_cv"], ["osc1.out"],
    props={"waveforms": {
        "super_saw": {"control1": "DETUNE: spread of the detuned saws", "control2": "MIX: level of the detuned saws against the centre one", "note": "Sounds like seven sawtooths"},
        "triangle_mod": {"control1": "OFFSET: how far the triangle is reshaped; more overtones, little fundamental (like a high-passed square)", "control2": "LFO 1 DEPTH on Offset"},
        "noise": {"control1": "CUTOFF FREQ of a low-pass on noise; also raises level; tracks the key", "control2": "RESONANCE; at 127 a sine (CUTOFF 64 = played pitch, one step per semitone)"},
        "feedback_osc": {"control1": "HARMONICS", "control2": "FEEDBACK AMOUNT: level of the harmonics", "note": "Guitar-feedback tone; forces MONO or LEGATO and blocks UNISON"},
        "square": {"control1": "PULSE WIDTH", "control2": "PWM DEPTH from LFO 1"},
        "saw": {"control1": "SHAPE: strong fundamental at either end, thin (high-passed) at centre", "control2": "LFO 1 DEPTH on Shape"},
        "triangle": {"control1": "SHAPE: towards a low-passed square", "control2": "LFO 1 DEPTH on Shape"}}})
mod("osc2", "oscillator", "Oscillator 2", "OSC 2",
    "Square (PWM), saw, triangle or noise, pitched relative to OSC 1 by RANGE and FINE/WIDE. Hard sync to OSC 1 (not with noise or EXT). With EXT on the waveform is replaced by "
    "external audio, gated by note-on and GATE THRESHOLD and not pitched.",
    ["osc2.pitch_cv", "osc2.sync_in", "osc2.shape_cv", "osc2.ext_in"], ["osc2.out"],
    props={"waveforms": {
        "square": {"control1": "PULSE WIDTH", "control2": "PWM DEPTH from LFO 1"},
        "saw": {"control1": None, "control2": None}, "triangle": {"control1": None, "control2": None},
        "noise": {"control1": "CUTOFF FREQ (does not track the key)", "control2": "RESONANCE; at 127 a sine (CUTOFF 64 = C4 on every key)"},
        "ext": {"control1": "GATE THRESHOLD: minimum input level let through", "control2": None}},
        "range_semitones": [-24, 24], "fine_cents": [-50, 50], "wide_octaves": [-4, 4]})
mod("ring", "ring_modulator", "Ring modulator", "OSC 2 [RING]",
    "Multiplies OSC 1 by OSC 2; the result replaces OSC 2's output in the mix, so it is heard as OSC BALANCE moves towards OSC 2.",
    ["ring.in_a", "ring.in_b"], ["ring.out"])
mod("mixer", "mixer", "Oscillator balance", "OSC COMMON [OSC BALANCE]",
    "Crossfades OSC 1 and the OSC 2 path (OSC 2, ring or external input); equal at centre.", ["mixer.in1", "mixer.in2"], ["mixer.out"])
mod("env_pitch", "envelope", "Pitch envelope", "PITCH ENVELOPE", "Attack-decay envelope to pitch or cross mod depth, chosen by LFO 1 & ENV DESTINATION; bipolar DEPTH.",
    ["env_pitch.gate"], ["env_pitch.out"], props={"stages": ["attack", "decay"]})
mod("vcf", "filter", "Filter", "FILTER", "Multimode HPF, BPF or LPF at -12 or -24 dB/octave, resonant to self-oscillation, with key follow.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"modes": ["hpf", "bpf", "lpf"], "slopes_db_per_octave": [12, 24], "self_oscillates": True})
mod("env_filter", "envelope", "Filter envelope", "FILTER ENVELOPE", "ADSR to cutoff with bipolar DEPTH; release time follows note-off velocity when assigned.",
    ["env_filter.gate", "env_filter.trigger"], ["env_filter.out"], props={"stages": ["attack", "decay", "sustain", "release"]})
mod("vca", "vca", "Amplifier", "AMP", "Patch level, amp envelope, LFO 1 as tremolo, auto pan or manual pan position.",
    ["vca.in", "vca.gain_cv", "vca.pan_cv"], ["vca.out"])
mod("env_amp", "envelope", "Amp envelope", "AMP ENVELOPE", "ADSR to the amplifier; release time follows note-off velocity when assigned. With Env Type in Solo = ANALOG a new note continues from the current level.",
    ["env_amp.gate", "env_amp.trigger"], ["env_amp.out"], props={"stages": ["attack", "decay", "sustain", "release"]})
mod("lfo1", "lfo", "LFO 1", "LFO 1", "Triangle, saw, square or sample and hold, with FADE (time to full depth after key-on). Depth is set where it is used: OSC COMMON, FILTER, AMP and the OSC 1/OSC 2 CONTROL 2 knobs. Rate can follow tempo (LFO Sync).",
        ["lfo1.trigger"], ["lfo1.out"], props={"waveforms": ["triangle", "saw", "square", "sample_hold"]})
mod("lfo2", "lfo", "LFO 2 (MODULATION)", "MODULATION (LFO 2)", "Triangle LFO with its own rate, applied to pitch, filter and amp at three separate depths, scaled by the mod wheel (CC 1) of the controlling keyboard.",
    ["lfo2.depth_cv"], ["lfo2.out"], props={"waveforms": ["triangle"]})
mod("tone", "effects", "Tone control", "EFFECTS [TONE CONTROL]", "Bass and treble shelving boost/cut on the patch output.", ["tone.in"], ["tone.out"], scope="common")
mod("mfx", "effects", "Multi-effects", "EFFECTS [MULTI-FX LEVEL]", "One of 13 types (super chorus x4, flanger x3, deep phasing, jet phasing, twisting, freeze phase x2, distortion) at MULTI-FX LEVEL. Chorus rate can follow tempo or LFO 1 (Chorus Sync).",
    ["mfx.in"], ["mfx.out"], scope="common", props={"types": MFX})
mod("delay", "delay", "Delay", "EFFECTS [DELAY]", "Five types (panning L>R, R>L, short; mono short, long) with TIME, FEEDBACK and LEVEL. Time can follow tempo (Delay Sync).",
    ["delay.in"], ["delay.out_l", "delay.out_r"], scope="common",
    props={"types": DLY, "max_time_ms": {"mono_long": 1250, "panning_l_r": 625, "panning_r_l": 625, "panning_short": 156, "mono_short": 156}})
mod("ext", "external_input", "External inputs", "EXTERNAL INPUT / rear EXT IN",
    "INST/LOWER and VOCAL/UPPER line inputs and the front MIC input (through the mic amp, chosen by REAR/FRONT), each with a level knob and a limiter. INST/LOWER feeds the Lower "
    "part's OSC 2 and the Voice Modulator's Inst Input; VOCAL/UPPER or MIC feeds the Upper part's OSC 2 and the Vocal Input. With only INST/LOWER plugged (REAR), it feeds both parts.",
    ["ext.inst_in", "ext.vocal_in", "ext.mic_in"], ["ext.to_osc2", "ext.inst", "ext.vocal", "ext.trigger"], scope="common",
    props={"input_level_dbm": {"inst_lower": [-30, 4], "vocal_upper": [-30, 4], "mic": [-60, -20]}, "limiter": True})
mod("morph", "modulation_bus", "Morphing and motion", "CONTROL [VELOCITY] / MORPHING / MOTION CONTROL",
    "Adds offsets to almost every patch knob and slider at once. Velocity Assign and Control Assign store a width of change per parameter in the patch; Control Up (aftertouch by "
    "default) moves each parameter by its width and Control Down (breath) by the mirror image. Vocal morph control and motion playback add their own changes. Overlapping sources sum, "
    "except that Control Assign and vocal morph take the last message received.",
    ["morph.velocity_in", "morph.up_in", "morph.down_in", "morph.vocal_in", "morph.motion_in"], ["morph.out"], scope="common")
mod("arp", "arpeggiator", "Arpeggiator", "ARPEGGIATOR/RPS", "UP, DOWN, UP&DOWN or RANDOM over 1 to 4 octaves with 90 beat patterns, at TEMPO or MIDI clock. Driven only from REMOTE KBD IN or Preview; its notes go to MIDI OUT.",
    ["arp.notes_in"], ["arp.notes_out"], scope="common", props={"modes": ["up", "down", "up_down", "random"], "beat_patterns": 90, "tempo_bpm": [20, 250]})
mod("rps", "sequencer", "RPS (Realtime Phrase Sequence)", "ARPEGGIATOR/RPS", "48 one-key patterns on C#2 to C6, each up to 4 measures of 4/4 at 24 ticks per quarter, up to 10 notes at once; loop-mix recording with quantise and gate time.",
    ["rps.notes_in"], ["rps.notes_out"], scope="common", props={"patterns": 48, "keys": "C#2 (37) to C6 (84)", "max_measures": 4, "ppq": 24})
mod("motion", "sequencer", "Motion control", "MOTION CONTROL [1]/[2]", "Records and plays back knob and slider moves (or controllers from REMOTE KBD IN) on the part chosen by PANEL SELECT: two sets (A, B) of two motions, loops of 1 to 8 measures or one pass up to 99.",
    [], ["motion.out"], scope="common", props={"motions": 4, "loop_measures": [1, 8], "play_once_measures": 99, "switch_points_per_control": 11})
mod("vm_inst", "mixer", "Voice Modulator Inst Input", "VOICE MODULATOR (internal)", "Sums what the formant filter imposes the voice on: the part output (VOICE MOD SEND), INST/LOWER (Ext->Inst Send), the robot oscillator and noise.",
    ["vm_inst.patch", "vm_inst.ext", "vm_inst.robot", "vm_inst.noise"], ["vm_inst.out"], scope="common")
mod("vm_robot", "oscillator", "Robot oscillator", "VOICE MODULATOR", "Internal carrier so the formant filter talks with no instrument input; ROBOT PITCH and ROBOT CONTROL (thick to intelligible).",
    [], ["vm_robot.out"], scope="common")
mod("vm_noise", "noise", "Voice Modulator noise", "VOICE MODULATOR", "Noise through a high-pass (V NOISE CUTOFF) mixed into the Inst Input for husky voices.", [], ["vm_noise.out"], scope="common")
mod("vm", "effects", "Voice Modulator (formant filter / filter bank)", "VOICE MODULATOR",
    "Two identical sets of 12 band-pass filters. Formant filter (SOLID, SMOOTH, WIDE): the Vocal Input is analysed band by band and the detected levels shape the Inst Input in the same bands, "
    "with consonants (VOCAL MIX) added back, CHARACTER 1-12 band levels, RESONANCE, RELEASE, GATE THRESHOLD and VOCAL HOLD. Filter bank (FLT BANK WIDE, NARROW): both sets are 12-band "
    "graphic level controls, Inst Input left and Vocal Input right.",
    ["vm.inst_in", "vm.vocal_in"], ["vm.out"], scope="common",
    props={"bands": 12, "filter_sets": 2, "algorithms": {"solid": "formant: tight, strong", "smooth": "formant: clean, smooth", "wide": "formant: wider bands, for non-voice modulators",
                                                          "flt_bank_wide": "filter bank: wide bands", "flt_bank_narrow": "filter bank: narrow bands, AM radio"}})
mod("vm_morph", "envelope_follower", "Vocal morph detector", "VOICE MODULATOR (Vocal Morph Ctrl)", "Measures the Vocal Input around 1.2 kHz (so the vowel 'a' controls most) above a threshold and sends it as the Control Up or Control Down message by the sign of the sensitivity.",
    ["vm_morph.in"], ["vm_morph.out"], scope="common", props={"detection_band_hz": 1200})
mod("vm_ens", "chorus", "Voice Modulator ensemble", "VOICE MODULATOR", "Ensemble, chorus, flanger or phaser types dedicated to the Voice Modulator output, deeper than the multi-effects chorus.", ["vm_ens.in"], ["vm_ens.out"], scope="common")
mod("vm_dly", "delay", "Voice Modulator delay", "VOICE MODULATOR", "Delay dedicated to the Voice Modulator output, same five types and limits as the patch delay.", ["vm_dly.in"], ["vm_dly.out"], scope="common")
mod("out", "output", "Output", "OUTPUT / VOLUME", "Mixes both parts and the Voice Modulator to L and R (MIX OUT), or Lower to L and Upper to R (PARALLEL OUT); headphones carry the same; VOLUME LEVEL is not stored.",
    ["out.in_l", "out.in_r", "out.vm_in"], ["out.main_l", "out.main_r", "out.phones"], scope="common")

D["modules"] = M

# ======================================================================== parameters
# ---- effects
knob("fx.bass", "tone", "TONE CONTROL BASS", "Low-frequency boost (right) or cut (left).", rng=BI, cc=92)
knob("fx.treble", "tone", "TONE CONTROL TREBLE", "High-frequency boost (right) or cut (left).", rng=BI, cc=95)
knob("fx.mfx_level", "mfx", "MULTI-FX LEVEL", "Amount of the multi-effect.", cc=93)
knob("fx.delay_time", "delay", "DELAY TIME", "Delay time; maximum depends on Delay Type.", cc=12)
knob("fx.delay_feedback", "delay", "DELAY FEEDBACK", "Number of repeats.", cc=13)
knob("fx.delay_level", "delay", "DELAY LEVEL", "Delay level against the dry sound.", cc=94)
btn("fx.vm_send", "vm_inst", "VOICE MOD SEND", "Sends this part's patch to the Voice Modulator (Inst Input for formant algorithms; both inputs for filter bank). No effect unless the Voice Modulator is on.")
menu("fx.mfx_type", "mfx", "Multi-FX Type", "enum", "Multi-effect type.", "[PATCH] (BANK 4)", vals=MFX, default="super_chorus_slw")
menu("fx.delay_type", "delay", "Delay Type", "enum", "Delay type. Panning types fall back to mono with a mono output or PARALLEL OUT.", "[PATCH] (BANK 4)", vals=DLY, default="panning_l_r")
# ---- LFO 1
sel("lfo1.waveform", "lfo1", "LFO 1 WAVEFORM", "LFO 1 shape.", ["triangle", "saw", {"value": "square", "meaning": "alternates between two settings"}, {"value": "sample_hold", "meaning": "random steps"}])
knob("lfo1.rate", "lfo1", "LFO 1 RATE", "LFO 1 speed (ignored when LFO Sync is on).", cc=16)
knob("lfo1.fade", "lfo1", "LFO 1 FADE", "Time from key-on until LFO 1 reaches full depth; no effect on auto pan.", cc2=20)
# ---- LFO 2
knob("lfo2.rate", "lfo2", "MODULATION RATE", "LFO 2 speed, common to its three depths.", cc=17)
sel("lfo2.depth_select", "lfo2", "DEPTH SELECT", "Which of the three LFO 2 depths the DEPTH knob edits. Not a routing: all three depths act together.", ["pitch", "filter", "amp"], memory="none")
for k, lab, cc2, fx in (("pitch", "PITCH", 22, "vibrato"), ("filter", "FILTER", 23, "wah"), ("amp", "AMP", 24, "tremolo")):
    par(f"lfo2.depth_{k}", "lfo2", f"MODULATION DEPTH ({lab})", "integer", f"LFO 2 depth on {k} ({fx}) at full mod wheel; left of centre inverts.", range=BI,
        access=[{"type": "panel", "control": "knob", "note": f"DEPTH knob with DEPTH SELECT on {lab}"}, {"type": "sysex", "note": "MODE1"}, {"type": "midi", "message": f"CC {cc2}", "note": "MODE2 default"}])
# ---- portamento
btn("pitch.portamento", "pitch", "PORTAMENTO ON", "Portamento on/off.", access=[{"type": "panel", "control": "push_button"}, {"type": "midi", "message": "CC 65"}])
knob("pitch.portamento_time", "pitch", "PORTAMENTO TIME", "Glide time.", cc=5)
# ---- OSC 1
sel("osc1.waveform", "osc1", "OSC 1 WAVEFORM", "OSC 1 waveform; sets what CONTROL 1 and 2 do.", ["super_saw", "triangle_mod", "noise", "feedback_osc", {"value": "square", "label": "SQR (PWM)"}, "saw", "triangle"])
knob("osc1.control1", "osc1", "OSC 1 CONTROL 1", "Super saw DETUNE, triangle mod OFFSET, noise CUTOFF, feedback HARMONICS, square PULSE WIDTH, saw or triangle SHAPE.", cc=4)
knob("osc1.control2", "osc1", "OSC 1 CONTROL 2", "Super saw MIX, triangle mod LFO 1 DEPTH, noise RESONANCE, feedback FEEDBACK AMOUNT, square PWM DEPTH, saw or triangle LFO 1 DEPTH.", cc=76)
# ---- OSC 2
sel("osc2.waveform", "osc2", "OSC 2 WAVEFORM", "OSC 2 waveform. Pressing it also turns EXT off.", [{"value": "square", "label": "SQR (PWM)"}, "saw", "triangle", "noise"])
btn("osc2.ext", "osc2", "EXT", "Replaces the OSC 2 waveform with external audio for this part (Upper: VOCAL/UPPER or MIC; Lower: INST/LOWER). Turned off by pressing WAVEFORM.")
btn("osc2.sync", "osc2", "SYNC", "Resets OSC 2 at each OSC 1 cycle. Not with noise or EXT.")
par("osc2.range", "osc2", "OSC 2 RANGE", "enum", "OSC 2 pitch from OSC 1 in semitones; at the ends, -WIDE or +WIDE hands coarse range to FINE/WIDE. -24, -12, 0, +12, +24 have wider detents.",
    values=[{"value": "-wide"}] + [{"value": i} for i in range(-24, 25)] + [{"value": "+wide"}], access=[{"type": "panel", "control": "knob"}, {"type": "sysex", "note": "MODE1"}, {"type": "midi", "message": "CC 21", "note": "MODE2 default"}])
par("osc2.fine_wide", "osc2", "OSC 2 FINE/WIDE", "integer", "±50 cents when RANGE is -24 to +24; -4 to 0 octaves at -WIDE, 0 to +4 octaves at +WIDE (wider centre detent).", range=K127,
    physical={"min": -50, "max": 50, "unit": "cent", "note": "or -4 to 0 / 0 to +4 octaves in the WIDE positions"}, access=[{"type": "panel", "control": "knob"}, {"type": "midi", "message": "CC 77"}])
knob("osc2.control1", "osc2", "OSC 2 CONTROL 1", "Square PULSE WIDTH, noise CUTOFF, or GATE THRESHOLD with EXT on; nothing for saw or triangle.", cc=78)
knob("osc2.control2", "osc2", "OSC 2 CONTROL 2", "Square PWM DEPTH or noise RESONANCE; nothing for saw, triangle or EXT.", cc=79)
btn("osc2.ring", "ring", "RING", "Ring modulation of OSC 1 by OSC 2, heard on the OSC 2 side of OSC BALANCE.")
# ---- OSC COMMON and pitch envelope
knob("mix.balance", "mixer", "OSC BALANCE", "OSC 1 (left) to OSC 2 (right); equal at centre.", rng={"min": -64, "max": 63}, cc=8)
knob("osc.xmod_depth", "osc1", "X-MOD DEPTH", "Depth of OSC 2 modulating OSC 1's frequency. No effect on super saw or noise.", cc=70)
sel("osc.lfo_env_dest", "pitch", "LFO 1 & ENV DESTINATION", "Where the pitch envelope and the OSC COMMON LFO 1 depth act.",
    [{"value": "osc1_2", "label": "OSC1+2"}, {"value": "osc2", "label": "OSC2"}, {"value": "xmod", "label": "X-MOD", "meaning": "cross mod depth instead of pitch"}])
knob("osc.lfo1_depth", "pitch", "OSC COMMON LFO 1 DEPTH", "LFO 1 on pitch (or cross mod depth); left of centre inverts.", rng=BI, cc=18)
par("osc.shift", "pitch", "OSC SHIFT", "enum", "Octave shift of the patch. LEDs: -2 red/dark, -1 orange/dark, 0 dark/dark, +1 dark/orange, +2 dark/red.",
    values=[{"value": v} for v in (-2, -1, 0, 1, 2)], access=[{"type": "panel", "control": "push_button", "note": "-OCT and +OCT buttons"}])
fader("env_pitch.depth", "env_pitch", "PITCH ENVELOPE DEPTH", "Envelope depth; below centre inverts; centre is none.", rng=BI, cc2=25)
fader("env_pitch.attack", "env_pitch", "PITCH ENVELOPE A", "Time to the peak change.", cc2=26)
fader("env_pitch.decay", "env_pitch", "PITCH ENVELOPE D", "Time back to normal pitch.", cc2=27)
# ---- filter
sel("vcf.type", "vcf", "FILTER TYPE", "Filter type. High HPF or BPF cutoffs can silence some waveforms.", ["hpf", "bpf", "lpf"])
btn("vcf.slope", "vcf", "-12dB/-24dB", "LED off: -12 dB/octave. LED on: -24 dB/octave.")
fader("vcf.cutoff", "vcf", "CUTOFF FREQ", "Cutoff frequency.", cc=74)
fader("vcf.resonance", "vcf", "RESONANCE", "Emphasis at cutoff; high settings self-oscillate.", cc=71)
knob("vcf.key_follow", "vcf", "KEY FOLLOW", "Cutoff tracking: centre none, +32 = 100 % (equal brightness across keys), +63 about 200 %; left lowers cutoff for higher notes.", rng=BI, cc2=30)
knob("vcf.lfo1_depth", "vcf", "FILTER LFO 1 DEPTH", "LFO 1 on cutoff; left of centre inverts.", rng=BI, cc=19)
fader("env_filter.depth", "env_filter", "FILTER ENVELOPE DEPTH", "Envelope depth on cutoff; below centre inverts.", rng=BI, cc=81)
fader("env_filter.attack", "env_filter", "FILTER ENVELOPE A", "Attack time.", cc=82)
fader("env_filter.decay", "env_filter", "FILTER ENVELOPE D", "Decay time.", cc=83)
fader("env_filter.sustain", "env_filter", "FILTER ENVELOPE S", "Sustain level.", cc2=28)
fader("env_filter.release", "env_filter", "FILTER ENVELOPE R", "Release time.", cc2=29)
# ---- amp
knob("amp.level", "vca", "AMP LEVEL", "Patch volume (VOLUME LEVEL is the whole unit).", cc=7)
sel("amp.pan", "vca", "PAN", "What AMP LFO 1 DEPTH does.", [{"value": "off", "meaning": "LFO 1 tremolo"}, {"value": "auto", "meaning": "LFO 1 auto pan"}, {"value": "manual", "meaning": "fixed pan position"}])
knob("amp.lfo1_depth", "vca", "AMP LFO 1 DEPTH", "Tremolo or auto-pan depth (left inverts); with PAN on MANUAL, the pan position (-64 left to +63 right).", rng=BI, cc=80)
fader("env_amp.attack", "env_amp", "AMP ENVELOPE A", "Attack time.", cc=73)
fader("env_amp.decay", "env_amp", "AMP ENVELOPE D", "Decay time.", cc=75)
fader("env_amp.sustain", "env_amp", "AMP ENVELOPE S", "Sustain level.", cc2=31)
fader("env_amp.release", "env_amp", "AMP ENVELOPE R", "Release time.", cc=72)
# ---- control section
btn("kbd.mono", "kbd", "SOLO SW MONO", "Monophonic, each note re-articulated. Forced on (or LEGATO) by feedback osc.", access=[{"type": "panel", "control": "push_button"}, {"type": "midi", "message": "CC 126 (on) / CC 127 (off)"}])
btn("kbd.legato", "kbd", "SOLO SW LEGATO", "Monophonic; overlapping notes glide without re-attack. With UNISON (press both): legato unison.")
btn("kbd.unison", "kbd", "SOLO SW UNISON", "All voices (or the part's Voice Assign share) on one note, spread by Unison Detune. Not with feedback osc.")
btn("morph.velocity", "morph", "VELOCITY", "Velocity on; off plays everything at 80 (note-on and note-off).")
btn("morph.velocity_assign", "morph", "MORPHING VELOCITY ASSIGN",
    "Enters velocity assign: knob moves set each parameter's width from velocity 80 to 127 (mirrored to 0). WRITE clears all. LED lit when any widths are stored.", memory="none")
btn("morph.control_assign", "morph", "MORPHING CONTROL ASSIGN",
    "Enters control assign: knob moves set each parameter's width for Control Up 0-127; Control Down gets the mirror. WRITE clears all (and Morph Bend Assign). LED lit when widths are stored.", memory="none")
par("morph.velocity_widths", "morph", "Velocity Assign widths", "integer", "Per-parameter width of change from velocity; filter and amp R follow note-off velocity. Stored in the patch.",
    range={"min": -127, "max": 127}, access=[{"type": "gesture", "gesture": "hold VELOCITY ASSIGN mode and move each knob or slider to its maximum-velocity position", "when": "any_time"}],
    note="Value list shows -127 to +127, -100 to +100 or -50 to +50 by parameter range.")
par("morph.control_widths", "morph", "Control Assign widths", "integer", "Per-parameter width of change from Control Up (and mirrored from Control Down). Stored in the patch.",
    range={"min": -127, "max": 127}, access=[{"type": "gesture", "gesture": "hold CONTROL ASSIGN mode and move each knob or slider to its full-aftertouch position", "when": "any_time"}],
    note="Value list shows -127 to +127, -100 to +100 or -50 to +50 by parameter range.")
# ---- [PATCH] menu
PM = "[PATCH] (BANK 4)"
menu("patch.name", "kbd", "Patch Name", "enum", "Up to 16 ASCII characters.", PM, vals=[{"value": "text", "meaning": "16 characters; INIT PATCH after initialise"}])
menu("pitch.bend_up", "pitch", "Bend Range Up", "integer", "Semitones at full upward bend; also the pitch rise from Control Up when Morph Bend Assign is on.", PM, range={"min": 0, "max": 24}, default=2,
     extra_access=[{"type": "midi", "message": "RPN 0 (sets both ranges)"}])
menu("pitch.bend_down", "pitch", "Bend Range Down", "integer", "Semitones at full downward bend; also the drop from Control Down when Morph Bend Assign is on.", PM, range={"min": -24, "max": 0}, default=-2)
menu("morph.bend_assign", "morph", "Morph Bend Assign", "boolean", "Control Up/Down also bend pitch by the bend ranges (from REMOTE KBD IN only).", PM, default=False)
menu("kbd.unison_detune", "kbd", "Unison Detune", "integer", "Spread between highest and lowest unison voice, up to 50 cents.", PM, range={"min": 0, "max": 50}, default=5)
menu("kbd.env_type_solo", "kbd", "Env Type in Solo", "enum", "STANDARD: envelopes restart from zero in MONO/LEGATO/UNISON. ANALOG: a new note continues from the current envelope level.", PM,
     vals=["standard", "analog"], default="standard")
menu("vca.patch_gain", "vca", "Patch Gain", "enum", "Output boost for quiet mono patches: +6 dB doubles, +12 dB quadruples the amplitude; may distort.", PM, vals=["0dB", "+6dB", "+12dB"], default="0dB")
menu("ext.trig_switch", "ext", "Ext Trig Switch", "boolean", "The part's external input (above OSC 2 GATE THRESHOLD) starts the chosen envelopes; keys alone then do not.", PM, default=False)
menu("ext.trig_dest", "ext", "Ext Trig Dest", "enum", "Envelopes started by the external trigger.", PM, vals=["filter", "amp", "filter_amp"], default="filter")
# ---- performance: panel
sel("perf.panel_select", "kbd", "PANEL SELECT", "Which part the panel edits and, in SINGLE, plays: LOWER, UPPER, both (press together; panel shows Upper), or the Voice Modulator panel (SHIFT + UPPER).",
    ["lower", "upper", "lower_upper", "voice_mod"], perf=True)
sel("perf.key_mode", "kbd", "KEY MODE", "SINGLE: the PANEL SELECT part. DUAL: both layered. SPLIT: Lower below the split point, Upper from it.", ["single", "dual", "split"], perf=True)
btn("arp.on", "arp", "ARPEGGIATOR/RPS ON", "Arpeggiator on, or RPS on when MODE is RPS.", perf=True)
sel("arp.mode", "arp", "ARPEGGIATOR/RPS MODE", "Arpeggio order, or RPS. UP&DOWN lights both LEDs.", ["up", "down", "up_down", "random", "rps"], perf=True)
sel("arp.range", "arp", "ARPEGGIO RANGE", "Octave span.", ["1oct", "2oct", "3oct", "4oct"], perf=True)
btn("arp.hold", "arp", "HOLD", "Arpeggio or pattern continues after release; a new chord or key changes it.", perf=True)
knob("arp.tempo", "arp", "TEMPO", "Internal tempo for arpeggio, RPS, motion and synced effects (ignored while MIDI clock is followed). Not affected by morphing or motion.",
     rng={"min": 20, "max": 250}, perf=True, physical={"min": 20, "max": 250, "unit": "BPM"})
btn("vm.on", "vm", "VOICE MODULATOR ON", "Enables the formant filter, filter bank and vocal morph; reduces polyphony to 8.", perf=True)
btn("ext.rear_front", "ext", "REAR/FRONT", "Vocal source: off = rear VOCAL/UPPER jack, on = front MIC.", perf=True)
par("ext.inst_level", "ext", "INST/LOWER level", "continuous", "Input level of INST/LOWER, before the limiter. Not stored, not recordable in motion.", memory="none", access=[{"type": "panel", "control": "knob"}])
par("ext.vocal_level", "ext", "VOCAL/UPPER level", "continuous", "Input level of VOCAL/UPPER or MIC, before the limiter. Not stored, not recordable in motion.", memory="none", access=[{"type": "panel", "control": "knob"}])
for n in (1, 2):
    par(f"vm.control{n}", "vm", f"VOICE MODULATOR CONTROL {n}", "integer",
        f"Live control of the Voice Modulator parameter chosen by Control{n} Assign; always active while the Voice Modulator is on. Not affected by morphing or motion.",
        range=K127, memory="none", access=[{"type": "panel", "control": "knob"}])
par("out.volume", "out", "VOLUME LEVEL", "continuous", "Master volume of the unit; not stored.", memory="none", access=[{"type": "panel", "control": "knob"}])
# ---- performance: [PFM COMMON]
PC = "[PFM COMMON] (BANK 1)"
menu("perf.name", "kbd", "Performance Name", "enum", "Up to 16 ASCII characters.", PC, vals=[{"value": "text", "meaning": "16 characters; INIT PERFORMANCE after initialise"}], perf=True)
menu("perf.part_detune", "pitch", "Part Detune", "integer", "DUAL only: + raises Upper and lowers Lower by up to 50 cents (minus the reverse).", PC, range={"min": -50, "max": 50}, perf=True, default=0)
menu("perf.output_assign", "out", "Output Assign", "enum", "MIX OUT: both parts to L and R. PARALLEL OUT: Lower to L, Upper to R (disables pan and panning delay).", PC, vals=["mix_out", "parallel_out"], perf=True, default="mix_out")
menu("perf.voice_assign", "kbd", "Voice Assign", "enum", "DUAL and SPLIT: Lower-Upper voices with the Voice Modulator off (on in brackets).", PC, perf=True, default="5-5",
     vals=[{"value": "8-2", "meaning": "VM on 6-2"}, {"value": "7-3", "meaning": "VM on 5-3"}, {"value": "6-4", "meaning": "VM on 4-4"}, {"value": "5-5", "meaning": "VM on 4-4"},
           {"value": "4-6", "meaning": "VM on 4-4"}, {"value": "3-7", "meaning": "VM on 3-5"}, {"value": "2-8", "meaning": "VM on 2-6"}])
menu("perf.split_point", "kbd", "Split Point", "integer", "SPLIT only: lowest note of the Upper part (C-1 to G9 as MIDI 0-127).", PC, range=K127, perf=True, default=60)
menu("arp.dest", "arp", "Arpeggio Dest", "enum", "DUAL only: which parts the arpeggio plays.", PC, vals=["lower_upper", "lower", "upper"], perf=True, default="lower_upper")
menu("arp.beat_pattern", "arp", "Arp Beat Pattern", "enum", "Accent and note-length pattern; 90 types.", PC, vals=BEATS, perf=True, default="1/16")
menu("kbd.indv_trig", "kbd", "Indv Trig Switch", "boolean", "Notes on the trigger channel (or below the split point from REMOTE KBD IN) start the chosen envelopes of held notes.", PC, perf=True, default=False)
menu("kbd.indv_trig_dest", "kbd", "Indv Trig Dest", "enum", "Envelopes the individual trigger starts.", PC, vals=["filter", "amp", "filter_amp"], perf=True, default="filter")
menu("kbd.indv_trig_ch", "kbd", "Indv Trig Src CH", "integer", "MIDI channel of trigger notes; must differ from the Part MIDI channels.", PC, range={"min": 1, "max": 16}, perf=True, default=15)
menu("kbd.indv_trig_note", "kbd", "IndvTrigSrc Note", "enum", "Which note number acts as the trigger, or ALL.", PC, vals=[{"value": "C-1..G9"}, {"value": "all"}], perf=True, default="all")
# ---- performance: [VOICE MOD]
VM = "[VOICE MOD] (BANK 2)"
menu("vm.algorithm", "vm", "Algorithm", "enum", "Formant filter or filter bank type; also sets the internal routing.", VM, vals=["solid", "smooth", "wide", "flt_bank_wide", "flt_bank_narrow"], perf=True, default="solid")
menu("vm.control1_assign", "vm", "Control1 Assign", "enum", "Parameter on Voice Modulator CONTROL 1.", VM, vals=VM_ASSIGNABLE, perf=True, default="vocal_mix")
menu("vm.control2_assign", "vm", "Control2 Assign", "enum", "Parameter on Voice Modulator CONTROL 2.", VM, vals=VM_ASSIGNABLE, perf=True, default="ensemble_level")
menu("vm.ext_inst_send", "vm_inst", "Ext->Inst Send", "boolean", "INST/LOWER directly into the Inst Input.", VM, perf=True, default=True)
menu("vm.ext_vocal_send", "vm", "Ext->Vocal Send", "boolean", "VOCAL/UPPER or MIC into the Vocal Input; needed for the formant filter and vocal morph.", VM, perf=True, default=True)
menu("vm.delay_type", "vm_dly", "V Delay Type", "enum", "Voice Modulator delay type.", VM, vals=DLY, perf=True, default="panning_l_r")
menu("vm.delay_sync", "vm_dly", "V Delay Sync", "enum", "Voice Modulator delay time from tempo; OFF uses V DELAY TIME. Halved when longer than the type allows.", VM, vals=SYNC_DELAY, perf=True, default="off")
menu("vm.ensemble_type", "vm_ens", "Ensemble Type", "enum", "Voice Modulator ensemble effect.", VM, perf=True, default="ensemble_mild",
     vals=["ensemble_mild", "ensemble_clean", "ensemble_fast"] + MFX[:-1])
menu("vm.ensemble_sync", "vm_ens", "Ensemble Sync", "enum", "Ensemble rate from tempo or MIDI clock.", VM, vals=SYNC_FULL, perf=True, default="off")
menu("vm.morph_ctrl", "vm_morph", "Vocal Morph Ctrl", "boolean", "Vocal morph control on.", VM, perf=True, default=False)
menu("vm.morph_sens", "vm_morph", "Vocal Morph Sens", "integer", "+ sends Control Up, - sends Control Down; 0 none; ±32 typical (±10-20 with V RESONANCE raised).", VM, range=BI, perf=True, default=32)
menu("vm.morph_threshold", "vm_morph", "VocalMorph Thrsh", "integer", "Minimum voice level that controls.", VM, range=K127, perf=True, default=10)
# ---- performance: Voice Modulator panel (blue legends)
vmpanel("vm.ensemble_level", "vm_ens", "ENSEMBLE LEVEL", "Ensemble depth.", "MULTI-FX LEVEL knob (ENSEMBLE)")
vmpanel("vm.delay_time", "vm_dly", "V DELAY TIME", "Voice Modulator delay time.", "DELAY TIME knob")
vmpanel("vm.delay_feedback", "vm_dly", "V DELAY FEEDBACK", "Voice Modulator delay repeats.", "DELAY FEEDBACK knob")
vmpanel("vm.delay_level", "vm_dly", "V DELAY LEVEL", "Voice Modulator delay level.", "DELAY LEVEL knob")
vmpanel("vm.vocal_mix", "vm", "VOCAL MIX", "Consonants extracted from the Vocal Input mixed into the output (formant only).", "CUTOFF FREQ slider", control="fader")
vmpanel("vm.resonance", "vm", "V RESONANCE", "Emphasis on all 12 bands; also raises vocal morph sensitivity.", "RESONANCE slider", control="fader")
vmpanel("vm.release", "vm", "V RELEASE", "Decay of the output after the voice stops (formant only).", "FILTER LFO 1 DEPTH knob (RELEASE)")
par("vm.vocal_hold", "vm", "VOCAL HOLD", "boolean", "Freezes the current analysis so the formant persists without voice; forced off for filter bank; not stored (off on performance select).",
    memory="none", access=[{"type": "panel", "control": "push_button", "note": f"{VMP}: the AMP PAN button"}, {"type": "midi", "message": "CC 64 on the Performance Control channel"}])
vmpanel("vm.pan", "vm", "V PAN", "Output pan (formant); L/R balance of Inst and Vocal sides (filter bank).", "AMP LFO 1 DEPTH knob (PAN)", rng=BI)
vmpanel("vm.level", "vm", "V LEVEL", "Voice Modulator output level.", "AMP LEVEL knob")
vmpanel("vm.noise_cutoff", "vm_noise", "V NOISE CUTOFF", "High-pass cutoff of the noise (formant only).", "MODULATION RATE knob (NOISE CUTOFF)")
vmpanel("vm.noise_level", "vm_noise", "V NOISE LEVEL", "Noise mixed into the Inst Input (formant only).", "MODULATION DEPTH knob (NOISE LEVEL)")
vmpanel("vm.gate_threshold", "vm", "GATE THRESHOLD", "Vocal level below which the formant filter closes; full right never opens (formant only).", "PORTAMENTO TIME knob (GATE THRESHOLD)")
vmpanel("vm.robot_pitch", "vm_robot", "ROBOT PITCH", "Robot oscillator pitch; low for mechanical voices (formant only).", "OSC BALANCE knob (ROBOT PITCH)")
vmpanel("vm.robot_control", "vm_robot", "ROBOT CONTROL", "Robot tone: thick (left) to intelligible (right); centre is the classic sound (formant only).", "X-MOD DEPTH knob (ROBOT CONTROL)")
vmpanel("vm.robot_level", "vm_robot", "ROBOT LEVEL", "Robot oscillator level into the Inst Input (formant only).", "OSC COMMON LFO 1 DEPTH knob (ROBOT LEVEL)")
SL = ["PITCH ENV DEPTH", "PITCH ENV A", "PITCH ENV D", "FILTER ENV DEPTH", "FILTER ENV A", "FILTER ENV D", "FILTER ENV S", "FILTER ENV R", "AMP ENV A", "AMP ENV D", "AMP ENV S", "AMP ENV R"]
for i in range(1, 13):
    vmpanel(f"vm.character{i}", "vm", f"CHARACTER {i}", f"Level of band {i} of 12 (low to high), on the vocal analysis (formant) or on both inputs (filter bank).", f"{SL[i - 1]} slider ({i})", control="fader")
# ---- performance part: [PART]
PP = "[PART] (BANK 3), per part"
menu("part.transpose", "pitch", "Part Transpose", "integer", "±24 semitones per part; MIDI OUT notes are not transposed.", PP, range={"min": -24, "max": 24}, perf=True, default=0,
     extra_access=[{"type": "midi", "message": "RPN 2 (coarse tuning) on the Part MIDI channel"}])
menu("part.midi_ch", "kbd", "Part MIDI CH", "enum", "MIDI IN/OUT channel of each part (Lower 2, Upper 1 by default).", PP, vals=[{"value": "1..16"}, {"value": "off"}], perf=True)
menu("part.chorus_sync", "mfx", "Chorus Sync", "enum", "Multi-effect rate from tempo, MIDI clock or LFO 1 rate.", PP, vals=SYNC_FULL + ["lfo1"], perf=True, default="off")
menu("part.delay_sync", "delay", "Delay Sync", "enum", "Delay time from tempo or MIDI clock; halved if over the type's limit.", PP, vals=SYNC_DELAY, perf=True, default="off")
menu("part.lfo_sync", "lfo1", "LFO Sync", "enum", "LFO 1 rate from tempo or MIDI clock.", PP, vals=SYNC_FULL, perf=True, default="off")
# ---- system: [MIDI]
SM = "[MIDI] (BANK 5)"
menu("sys.local", "kbd", "Local Switch", "boolean", "Panel and REMOTE KBD IN control the engine; forced on at power-up.", SM, memory="global", default=True)
menu("sys.midi_sync", "arp", "MIDI Sync", "enum", "Follow MIDI clock from MIDI IN or REMOTE KBD IN, or internal TEMPO.", SM, memory="global", vals=["off", "midi_in", "remote_kbd_in"])
menu("sys.device_id", "kbd", "Device ID", "integer", "SysEx device ID.", SM, memory="global", range={"min": 17, "max": 32}, default=17)
menu("sys.rx_exclusive", "kbd", "Rx Exclusive SW", "boolean", "Receive SysEx at MIDI IN (REMOTE KBD IN always takes temporary-area SysEx).", SM, memory="global")
menu("sys.perform_ctrl_ch", "kbd", "Perform Ctrl CH", "enum", "Channel for performance program changes, volume and Vocal Hold; wins over a matching Part channel.", SM, memory="global", vals=[{"value": "1..16"}, {"value": "off"}])
menu("sys.remote_kbd_ch", "kbd", "Remote KBD CH", "enum", "Channel accepted at REMOTE KBD IN.", SM, memory="global", vals=[{"value": "1..16"}, {"value": "all"}])
menu("sys.midi_thru", "kbd", "MIDI Thru", "enum", "Echo MIDI IN to MIDI OUT.", SM, memory="global", vals=["off", "on_without_sysex", "on_all"])
menu("sys.tx_rx_edit", "kbd", "Tx/Rx Edit SW", "boolean", "Send and receive panel edits as MIDI.", SM, memory="global")
menu("sys.tx_rx_mode", "kbd", "Tx/Rx Edit Mode", "enum", "MODE1: fixed CC/SysEx per control. MODE2: user CC per control (non-standard MIDI).", SM, memory="global", vals=["mode1", "mode2"], default="mode1")
menu("sys.tx_rx_setting", "kbd", "Tx/Rx Setting", "enum", "MODE2 message for the control last moved: off, CC 1-31 or 33-95, aftertouch, or SysEx.", SM, memory="global",
     vals=[{"value": "off"}, {"value": "cc1..31"}, {"value": "cc33..95"}, {"value": "aftertouch"}, {"value": "exclusive"}])
menu("sys.prog_change", "kbd", "Tx/Rx ProgChg SW", "enum", "Program change and bank select handling.", SM, memory="global", vals=["off", "pc", "bank_sel_pc"])
menu("sys.control_up", "morph", "Control Up", "enum", "Message driving Control Assign upwards (and vocal morph +).", SM, memory="global", default="aftertouch",
     vals=[{"value": "off"}, {"value": "cc1..31"}, {"value": "cc33..95"}, {"value": "aftertouch"}])
menu("sys.control_down", "morph", "Control Down", "enum", "Message driving the mirrored Control Assign (and vocal morph -); factory setting CC 2 (breath).", SM, memory="global",
     vals=[{"value": "off"}, {"value": "cc1..31"}, {"value": "cc33..95"}, {"value": "aftertouch"}])
# ---- system: [SETUP]
SS = "[SETUP] (BANK 6)"
menu("sys.lcd_contrast", "kbd", "LCD Contrast", "integer", "Display contrast.", SS, memory="global", range={"min": 1, "max": 8})
menu("sys.master_tune", "pitch", "Master Tune", "continuous", "A4 reference, 1-cent steps over ±50 cents.", SS, memory="global", physical={"min": 427.5, "max": 452.9, "unit": "Hz"},
     extra_access=[{"type": "midi", "message": "RPN 1 (fine tuning) on the Performance Control channel"}])
menu("sys.power_up", "kbd", "Power Up Mode", "enum", "Start on performance U:11 or the last state.", SS, memory="global", vals=["perform_u11", "last_set"])
menu("rps.trigger_quantize", "rps", "Pattern Trig Qtz", "enum", "When a newly pressed key switches pattern.", SS, memory="global", vals=["off", "beat", "measure"])
menu("motion.restart", "motion", "Motion Restart", "boolean", "Restart a playing motion on each new key after all are released.", SS, memory="global")
# ---- recording parameters (written directly to memory)
REC = [{"type": "panel", "control": "push_button", "note": "In RPS or motion record standby: NUMBER buttons LOOP LENGTH, QUANTIZE, GATE TIME, METRONOME"}]
par("rps.loop_length", "rps", "Pattern Loop Length", "integer", "Measures looped while recording and playing.", memory="global", range={"min": 1, "max": 4}, access=REC,
    note="Stored with each pattern rather than in a patch.")
par("rps.quantize", "rps", "Input Quantize", "enum", "Recording quantise.", memory="global", values=[{"value": v} for v in ["off", "1/16T", "1/16", "1/8T", "1/8", "1/4T", "1/4"]], access=REC)
par("rps.gate_time", "rps", "Gate Time Ratio", "enum", "Recorded note length against the quantise step (ignored with quantise off).", memory="global",
    values=[{"value": v} for v in ["real", "staccato", "33%", "50%", "66%", "100%"]], access=REC)
par("rps.metronome", "rps", "Metronome (pattern)", "enum", "Metronome sound and level.", memory="global", values=[{"value": v} for v in ["beep_4..1", "off", "click_1..4"]], access=REC)
par("motion.loop_length", "motion", "Motion Loop Length", "enum", "1-8 measures looped, or 99 = record up to 99 measures and play once.", memory="global",
    values=[{"value": i} for i in range(1, 9)] + [{"value": 99, "label": "99 (PLAY ONCE)"}], access=REC)
par("motion.metronome", "motion", "Metronome (motion)", "enum", "Metronome sound and level.", memory="global", values=[{"value": v} for v in ["beep_4..1", "off", "click_1..4"]], access=REC)
par("motion.play", "motion", "MOTION CONTROL 1 / 2", "enum", "Start or stop motion 1 or 2 of the current set; blinking while playing. Stopping leaves the sound as it stands.", memory="none",
    values=[{"value": "off"}, {"value": 1}, {"value": 2}], access=[{"type": "panel", "control": "push_button"}])
par("motion.set", "motion", "Motion set", "enum", "USER, CARD 1 or CARD 2, set A or B.", memory="global", values=[{"value": v} for v in ["user_a", "user_b", "card1_a", "card1_b", "card2_a", "card2_b"]],
    access=[{"type": "panel", "control": "push_button", "note": "SHIFT + NUMBER 3/4/5 (USER, CARD 1, CARD 2) and 7/8 (SET A, B)"}])
D["parameters"] = P

# ======================================================================== ports
jack("jack.out_l", "OUTPUT L (MONO)", "rear", "out", "audio", "out.main_l", "Left output; mono sum when R is unplugged (disables pan and panning delay).", "1/4 inch phone",
     electrical={"output_impedance_ohm": 2200})
jack("jack.out_r", "OUTPUT R", "rear", "out", "audio", "out.main_r", "Right output.", "1/4 inch phone", electrical={"output_impedance_ohm": 2200})
jack("jack.phones", "PHONES", "front", "out", "audio", "out.phones", "Headphones; the main outputs stay live.", "stereo 1/4 inch phone", electrical={"output_impedance_ohm": 100})
jack("jack.ext_inst", "EXT IN INST/LOWER (MONO)", "rear", "in", "audio", "ext.inst_in", "Line input to the Lower OSC 2 and the Inst Input; feeds both parts alone with REAR selected.", "1/4 inch phone",
     electrical={"input_impedance_ohm": 24000, "level_dbm": [-30, 4]})
jack("jack.ext_vocal", "EXT IN VOCAL/UPPER", "rear", "in", "audio", "ext.vocal_in", "Line input to the Upper OSC 2 and the Vocal Input (with REAR/FRONT off).", "1/4 inch phone",
     electrical={"input_impedance_ohm": 24000, "level_dbm": [-30, 4]})
jack("jack.mic", "MIC", "front", "in", "audio", "ext.mic_in", "Microphone through the mic amp, to the Upper OSC 2 and the Vocal Input (with REAR/FRONT on).", "1/4 inch phone",
     electrical={"input_impedance_ohm": 5000, "level_dbm": [-60, -20]})
jack("midi.in", "MIDI IN", "rear", "in", "midi", "kbd.notes_in", "Notes per Part MIDI channel, controllers, program changes, clock, SysEx. Cannot drive the arpeggiator, RPS or motion recording.", "5-pin DIN")
jack("midi.remote", "REMOTE KBD IN", "rear", "in", "midi", "kbd.remote_in", "Treated like the panel: drives arpeggiator, RPS, Preview-style playing and motion recording of incoming controllers.", "5-pin DIN")
jack("midi.out", "MIDI OUT", "rear", "out", "midi", "kbd.midi_out", "Panel edits, arpeggio, RPS and motion data, remote keyboard notes, MIDI thru.", "5-pin DIN")
jack("power.ac", "AC IN", "rear", "in", "power", None, "AC 117, 230 or 240 V, 17 W.", "IEC inlet")
D["ports"] = J

# ======================================================================== connections
# note routing
NOT_RPS = ne("arp.mode", "rps")
con("kbd.remote_notes", "arp.notes_in", "midi", allof(eq("arp.on", True), NOT_RPS), note="REMOTE KBD IN notes (or Preview); with ARP off they play the parts directly inside the assigner.")
con("kbd.remote_notes", "rps.notes_in", "midi", allof(eq("arp.on", True), eq("arp.mode", "rps")))
con("arp.notes_out", "kbd.notes_in", "midi", note="Arpeggiated notes; also sent to MIDI OUT.")
con("rps.notes_out", "kbd.notes_in", "midi", note="Pattern notes; also sent to MIDI OUT.")
# pitch
con("kbd.pitch", "pitch.note", "cv")
con("kbd.bend", "pitch.bend", "cv", amount="pitch.bend_up", note="Bend Range Down below centre.")
con("pitch.cv", "osc1.pitch_cv", "cv")
con("pitch.cv", "osc2.pitch_cv", "cv", note="Offset by RANGE and FINE/WIDE.")
D12 = eq("osc.lfo_env_dest", "osc1_2")
D2 = anyof("osc.lfo_env_dest", "osc1_2", "osc2")
DX = eq("osc.lfo_env_dest", "xmod")
con("env_pitch.out", "osc1.pitch_cv", "cv", D12, amount="env_pitch.depth")
con("env_pitch.out", "osc2.pitch_cv", "cv", D2, amount="env_pitch.depth")
con("lfo1.out", "osc1.pitch_cv", "cv", D12, amount="osc.lfo1_depth")
con("lfo1.out", "osc2.pitch_cv", "cv", D2, amount="osc.lfo1_depth")
con("lfo2.out", "osc1.pitch_cv", "cv", amount="lfo2.depth_pitch", amount_expr="lfo2.depth_pitch * mod_wheel", confidence="inferred",
    note="The manual says LFO 2 modulates pitch; that it reaches both oscillators is inferred.")
con("lfo2.out", "osc2.pitch_cv", "cv", amount="lfo2.depth_pitch", amount_expr="lfo2.depth_pitch * mod_wheel", confidence="inferred")
con("kbd.mod_wheel", "lfo2.depth_cv", "cv", note="CC 1 scales all three LFO 2 depths.")
# cross mod, sync, ring
XM_OK = {"all": [ne("osc1.waveform", "super_saw"), ne("osc1.waveform", "noise")]}
con("osc2.out", "osc1.fm_in", XM_OK, amount="osc.xmod_depth")
con("env_pitch.out", "osc1.fm_in", "cv", DX, amount="env_pitch.depth", note="Envelope moves cross mod depth instead of pitch.")
con("lfo1.out", "osc1.fm_in", "cv", DX, amount="osc.lfo1_depth")
con("osc1.out", "osc2.sync_in", "sync", allof(eq("osc2.sync", True), ne("osc2.waveform", "noise"), eq("osc2.ext", False)))
con("lfo1.out", "osc1.shape_cv", "cv", anyof("osc1.waveform", "triangle_mod", "square", "saw", "triangle"), amount="osc1.control2", note="Shape, offset or pulse width modulation.")
con("lfo1.out", "osc2.shape_cv", "cv", allof(eq("osc2.waveform", "square"), eq("osc2.ext", False)), amount="osc2.control2", note="PWM.")
con("ext.to_osc2", "osc2.ext_in", eq("osc2.ext", True), amount="osc2.control1", note="Gated by GATE THRESHOLD (CONTROL 1) and by note-on; not pitched.")
con("osc1.out", "ring.in_a", eq("osc2.ring", True))
con("osc2.out", "ring.in_b", eq("osc2.ring", True))
# mixer and filter
con("osc1.out", "mixer.in1", amount="mix.balance")
con("osc2.out", "mixer.in2", eq("osc2.ring", False), amount="mix.balance")
con("ring.out", "mixer.in2", eq("osc2.ring", True), amount="mix.balance")
con("mixer.out", "vcf.in")
con("env_filter.out", "vcf.cutoff_cv", "cv", amount="env_filter.depth")
con("lfo1.out", "vcf.cutoff_cv", "cv", amount="vcf.lfo1_depth")
con("lfo2.out", "vcf.cutoff_cv", "cv", amount="lfo2.depth_filter", amount_expr="lfo2.depth_filter * mod_wheel")
con("kbd.pitch", "vcf.cutoff_cv", "cv", amount="vcf.key_follow")
con("vcf.out", "vca.in")
# amp
con("env_amp.out", "vca.gain_cv", "cv", amount="amp.level")
con("lfo1.out", "vca.gain_cv", "cv", eq("amp.pan", "off"), amount="amp.lfo1_depth", note="Tremolo.")
con("lfo1.out", "vca.pan_cv", "cv", eq("amp.pan", "auto"), amount="amp.lfo1_depth", note="Auto pan; LFO 1 FADE does not apply.")
con("lfo2.out", "vca.gain_cv", "cv", amount="lfo2.depth_amp", amount_expr="lfo2.depth_amp * mod_wheel")
# gates and triggers
con("kbd.gate", "env_pitch.gate", "gate")
con("kbd.gate", "env_filter.gate", "gate", note="With Individual or External Trigger on the chosen envelopes wait for their trigger instead.")
con("kbd.gate", "env_amp.gate", "gate")
con("kbd.gate", "lfo1.trigger", "gate", note="Starts the FADE time.")
FIL = anyof("kbd.indv_trig_dest", "filter", "filter_amp")
AMP = anyof("kbd.indv_trig_dest", "amp", "filter_amp")
con("kbd.trigger", "env_filter.trigger", "gate", allof(eq("kbd.indv_trig", True), FIL))
con("kbd.trigger", "env_amp.trigger", "gate", allof(eq("kbd.indv_trig", True), AMP))
con("ext.trigger", "env_filter.trigger", "gate", allof(eq("ext.trig_switch", True), anyof("ext.trig_dest", "filter", "filter_amp")), note="Input above OSC 2 GATE THRESHOLD; release when it falls below.")
con("ext.trigger", "env_amp.trigger", "gate", allof(eq("ext.trig_switch", True), anyof("ext.trig_dest", "amp", "filter_amp")))
# morph sources
con("kbd.velocity", "morph.velocity_in", "cv", eq("morph.velocity", True), note="Off: fixed at 80.")
con("kbd.control_up", "morph.up_in", "cv", note="Message chosen by Control Up (aftertouch by default).")
con("kbd.control_down", "morph.down_in", "cv", note="Message chosen by Control Down (breath, CC 2, by default).")
con("vm_morph.out", "morph.vocal_in", "cv", allof(eq("vm.on", True), eq("vm.morph_ctrl", True)))
con("motion.out", "morph.motion_in", "cv", ne("motion.play", "off"))
con("morph.out", "vcf.cutoff_cv", "cv", note="Representative: morph.out reaches every assigned parameter, not only cutoff (see behaviours b14).", confidence="inferred")
# patch effects
con("vca.out", "tone.in", note="All voices of the part sum here; the effects are per part.")
con("tone.out", "mfx.in", confidence="inferred", note="Order tone, multi-effects, delay inferred from the patch diagram (p.55); not stated.")
con("mfx.out", "delay.in", confidence="inferred")
NOVM = {"any": [eq("vm.on", False), eq("fx.vm_send", False)]}
VMS = allof(eq("vm.on", True), eq("fx.vm_send", True))
con("delay.out_l", "out.in_l", NOVM, note="Lower only to L with PARALLEL OUT.")
con("delay.out_r", "out.in_r", NOVM, note="Upper only to R with PARALLEL OUT.")
con("delay.out_l", "vm_inst.patch", VMS, confidence="inferred", note="Send point after the patch effects inferred from the switch's place in the EFFECTS section.")
con("delay.out_r", "vm.vocal_in", allof(eq("vm.on", True), eq("fx.vm_send", True), anyof("vm.algorithm", "flt_bank_wide", "flt_bank_narrow")),
    note="Filter bank: the patch feeds both inputs.", confidence="inferred")
# external inputs and Voice Modulator
con("ext.inst", "vm_inst.ext", allof(eq("vm.on", True), eq("vm.ext_inst_send", True)))
con("ext.vocal", "vm.vocal_in", allof(eq("vm.on", True), eq("vm.ext_vocal_send", True)))
con("ext.vocal", "vm_morph.in", eq("vm.morph_ctrl", True), amount="vm.morph_sens")
con("vm_robot.out", "vm_inst.robot", eq("vm.on", True), amount="vm.robot_level")
con("vm_noise.out", "vm_inst.noise", eq("vm.on", True), amount="vm.noise_level")
con("vm_inst.out", "vm.inst_in", eq("vm.on", True))
con("vm.out", "vm_ens.in", eq("vm.on", True), amount="vm.level")
con("vm_ens.out", "vm_dly.in", eq("vm.on", True))
con("vm_dly.out", "out.vm_in", eq("vm.on", True), amount="vm.level")
D["connections"] = C

# ======================================================================== indicators
D["indicators"] = [
    {"id": "lcd", "module": "kbd", "label": "display", "kind": "display", "function": "16 x 2 backlit LCD: performance or patch number and name, edit pages, scope values; '*' marks an unsaved edit."},
    {"id": "sig_limiter", "module": "ext", "label": "SIG/LIMITER (x2)", "kind": "led", "led_colour": "multi", "function": "Per input: green with any signal, red when the limiter acts (aim for occasional red)."},
    {"id": "osc_shift", "module": "pitch", "label": "OSC SHIFT -OCT/+OCT", "kind": "led", "led_colour": "multi", "function": "Orange = one octave, red = two; in Preview the buttons blink and show green/orange/red for keyboard shift."},
    {"id": "wave_leds", "module": "osc1", "label": "waveform, type and mode LEDs", "kind": "led", "function": "Selected OSC 1/OSC 2 and LFO 1 waveform, filter type, pan mode, LFO 2 depth target, LFO 1 & ENV destination, key mode, arpeggio mode and range."},
    {"id": "button_leds", "module": "kbd", "label": "switch LEDs", "kind": "led", "function": "SYNC, RING, EXT, -24dB, SOLO, VELOCITY, PORTAMENTO, VOICE MOD SEND and ON, REAR/FRONT, ARP ON/HOLD: lit when on."},
    {"id": "morph_leds", "module": "morph", "label": "VELOCITY ASSIGN / CONTROL ASSIGN", "kind": "led", "function": "Blink while assigning; lit when widths are stored; dark when none."},
    {"id": "panel_select_leds", "module": "kbd", "label": "PANEL SELECT LOWER/UPPER", "kind": "led", "function": "Lit for the edited part; both blink for the Voice Modulator panel."},
    {"id": "motion_leds", "module": "motion", "label": "MOTION CONTROL 1/2", "kind": "led", "function": "Blink while playing; lit after a play-once motion ends; blink with REC in record standby."},
    {"id": "bank_number_leds", "module": "kbd", "label": "BANK / NUMBER LEDs", "kind": "led", "function": "Selected bank and number; BANK LEDs blink in EDIT; in Preview they show the playable keys."},
]
D["led_legend"] = {"rule": "LEDs show state; the only colour codes are SIG/LIMITER (green signal, red limiting) and OSC SHIFT (orange one octave, red two).",
                   "colours": [{"colour": "green", "meaning": "signal present", "modules": ["ext"]}, {"colour": "red", "meaning": "limiter active, or two-octave shift", "modules": ["ext", "pitch"]},
                               {"colour": "amber", "meaning": "one-octave shift (printed as orange)", "modules": ["pitch"]}],
                   "confidence": "stated"}

# ======================================================================== behaviours
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc1", "osc2", "ring", "mixer", "vcf", "vca", "tone", "mfx", "delay", "out"],
     "rule": "Per voice: OSC 1 and the OSC 2 path (OSC 2, ring or external input) through OSC BALANCE, filter, amp. All voices of a part then pass that patch's tone control, "
             "multi-effect and delay. The two parts, and the Voice Modulator, mix at the outputs."},
    {"id": "b02", "name": "Two parts, one voice pool", "applies_to": ["kbd"],
     "rule": "A performance always holds an Upper and a Lower patch, each with its own effects. SINGLE plays the PANEL SELECT part; DUAL layers both (Part Detune spreads them); "
             "SPLIT puts Lower below the split point and Upper from it. In DUAL and SPLIT, Voice Assign fixes each part's share of the 10 voices (8 with the Voice Modulator on). "
             "New notes steal the oldest. On MIDI IN each part answers its own Part MIDI channel."},
    {"id": "b03", "name": "Waveform-dependent controls", "applies_to": ["osc1", "osc2"],
     "rule": "CONTROL 1 and 2 change meaning with the waveform (see module properties); the display names the parameter as you turn. OSC 2 saw and triangle have no controls; with EXT on, "
             "CONTROL 1 is the gate threshold. Noise with RESONANCE at 127 becomes a sine: on OSC 1 CUTOFF 64 gives the played pitch, on OSC 2 it gives C4 on every key; each step is a semitone."},
    {"id": "b04", "name": "Feedback osc forces mono", "applies_to": ["osc1", "kbd"], "rule": "Selecting FEEDBACK OSC turns MONO or LEGATO on, locks it on, and blocks UNISON."},
    {"id": "b05", "name": "Sync, ring and cross mod", "applies_to": ["osc1", "osc2", "ring"],
     "rule": "Sync resets OSC 2 at each OSC 1 cycle (not with noise or EXT); the tone changes with RANGE or FINE/WIDE while the pitch stays. Ring multiplies OSC 1 by OSC 2 and appears on "
             "the OSC 2 side of the balance. X-MOD lets OSC 2 frequency-modulate OSC 1 (not super saw or noise); sweep OSC 2 pitch for timbre changes. With LFO 1 & ENV DESTINATION "
             "on X-MOD the pitch envelope and LFO 1 move the cross mod depth: a positive envelope works best with low X-MOD DEPTH, a negative one with high."},
    {"id": "b06", "name": "Centre-zero depths", "applies_to": ["env_pitch", "env_filter", "vcf", "vca", "lfo2", "pitch"],
     "rule": "Envelope and LFO depths are bipolar: centre is none, below or left inverts. Velocity, Control Assign and vocal morph move these depths only away from zero on the side the "
             "control sits; they cannot cross zero."},
    {"id": "b07", "name": "Filter key follow", "applies_to": ["vcf"],
     "rule": "Centre fixes the cutoff; +32 tracks fully (100 %, equal brightness, also for HPF and BPF); +63 about 200 %; -64 about -100 %. Most audible with CUTOFF at centre."},
    {"id": "b08", "name": "Amp pan modes", "applies_to": ["vca"],
     "rule": "PAN off: AMP LFO 1 DEPTH is tremolo. AUTO: LFO 1 pans (FADE ignored). MANUAL: the knob sets a fixed position. Pan and panning delays are lost with a mono output or PARALLEL OUT."},
    {"id": "b09", "name": "LFO 2 on the mod wheel", "applies_to": ["lfo2", "kbd"],
     "rule": "LFO 2 is a triangle with one rate and three stored depths (pitch, filter, amp); DEPTH SELECT only picks which depth the knob edits. Nothing is heard until CC 1 arrives; "
             "CC 1 resets on a performance change but not a patch change."},
    {"id": "b10", "name": "Solo modes", "applies_to": ["kbd", "env_filter", "env_amp"],
     "rule": "MONO re-attacks every note; LEGATO glides overlapping notes without re-attack; UNISON stacks the part's voices with Unison Detune up to 50 cents; LEGATO+UNISON together give "
             "legato unison. Env Type in Solo ANALOG continues envelopes from their current level. Patch Gain compensates the lower level of mono patches."},
    {"id": "b11", "name": "Velocity morphing", "applies_to": ["morph"],
     "rule": "Set the sound for velocity 80, press VELOCITY ASSIGN, move controls to the velocity-127 sound, then return them. Each parameter then moves by its width above 80 and by the "
             "mirror below 80, relative to the current knob position. Filter and amp R follow note-off velocity, everything else note-on. Excluded: VOLUME, TEMPO, Voice Modulator "
             "CONTROL 1/2, input levels and the Voice Modulator panel."},
    {"id": "b12", "name": "Control assign (aftertouch and breath)", "applies_to": ["morph", "kbd"],
     "rule": "Set the sound for no controller, press CONTROL ASSIGN, move controls to the full-aftertouch sound, return them. Control Up 0-127 adds the width; Control Down adds its mirror, so "
             "one gesture can push a sound two ways (the JP-8000 ribbon sends aftertouch on its right, breath on its left). With Morph Bend Assign the pitch follows by the bend ranges "
             "(REMOTE KBD IN only). Control Up/Down can be any CC 1-31, 33-95 or aftertouch."},
    {"id": "b13", "name": "Motion control", "applies_to": ["motion", "morph"],
     "rule": "Record knob and slider moves in loops (1-8 measures, layered pass by pass) or one pass of up to 99 measures; moving a recorded control overwrites it. Playback applies to the "
             "PANEL SELECT part. Turning a knob during playback takes over once it passes one of its 11 switch points, until the motion loops. Stopping a motion leaves the sound changed; "
             "reselect the patch to restore it. Motion Restart can restart it with the first key, aligning it with a pattern."},
    {"id": "b14", "name": "Summing of morph sources", "applies_to": ["morph"],
     "rule": "Velocity, Control Assign, vocal morph and motion offsets add on overlapping parameters, except Control Assign and vocal morph, which share the same messages: the last one "
             "received sets the value. morph.out stands for an offset onto every assigned parameter."},
    {"id": "b15", "name": "Which part the controllers move", "applies_to": ["kbd", "morph", "lfo2"],
     "rule": "From REMOTE KBD IN: SINGLE and SPLIT act on the PANEL SELECT part, DUAL on both. From MIDI IN: the part whose Part MIDI channel matches the message."},
    {"id": "b16", "name": "Arpeggiator and RPS", "applies_to": ["arp", "rps", "kbd"],
     "rule": "Driven only from REMOTE KBD IN or Preview. SINGLE: the PANEL SELECT part; DUAL: per Arpeggio Dest (arpeggio) or both parts (RPS); SPLIT: Lower only. RPS assigns a 1-4 "
             "measure pattern to each key C#2-C6, recorded by loop-mix with quantise and gate time; Pattern Trig Qtz times switching; HOLD keeps playing; keys outside the range stop a "
             "held pattern. Results go out on MIDI OUT. Lower needs enough voices for the pattern's chords."},
    {"id": "b17", "name": "Tempo sync and halving", "applies_to": ["delay", "vm_dly", "mfx", "vm_ens", "lfo1"],
     "rule": "Chorus, delay, LFO 1, ensemble and Voice Modulator delay can follow TEMPO or MIDI clock (per MIDI Sync). Delays never exceed 1250 ms mono or 625 ms panning; a longer synced "
             "time is halved, repeating at half the interval."},
    {"id": "b18", "name": "Formant filter", "applies_to": ["vm", "vm_inst", "vm_robot", "vm_noise"],
     "rule": "Needs both an instrument (part via VOICE MOD SEND, INST/LOWER via Ext->Inst, or the robot oscillator) and a voice (VOCAL/UPPER or MIC via Ext->Vocal). 12 bands of the voice set "
             "the levels of the same 12 bands of the instrument. Sustained, bright sounds work best; percussion as the modulator also works (WIDE). GATE THRESHOLD closes it under a level; "
             "VOCAL HOLD freezes it. Parameters marked formant-only show 'x' and are ignored in filter-bank algorithms."},
    {"id": "b19", "name": "Filter bank", "applies_to": ["vm"],
     "rule": "FLT BANK WIDE/NARROW make both sets 12-band level controls (CHARACTER 1-12) for stereo use: Inst Input left, Vocal Input right; VOICE MOD SEND feeds both; V PAN balances them. "
             "VOCAL HOLD is forced off."},
    {"id": "b20", "name": "Vocal morph control", "applies_to": ["vm_morph", "morph"],
     "rule": "The Vocal Input's level around 1.2 kHz above Vocal Morph Thrsh becomes the Control Up (sensitivity +) or Control Down (-) message, moving the patch by its Control Assign "
             "widths. 'a' controls most; alternating vowels gives large and small changes. Does not need VOICE MOD SEND."},
    {"id": "b21", "name": "Voice Modulator initialise", "applies_to": ["vm"],
     "rule": "Nine set-ups write recommended performance values: F.FLT VINTAGE, SILKY, HUSKYVOICE, BREAKBEATS, ROBOT, HUSKYROBOT; F.BANK STANDARD, RADIO; VOCAL MORPH CTRL. "
             "INIT PERFORMANCE uses F.FLT VINTAGE."},
    {"id": "b22", "name": "External input synthesis", "applies_to": ["ext", "osc2"],
     "rule": "With EXT on, the part's input replaces OSC 2: heard only during note-on and above GATE THRESHOLD, at the filter and amp, without pitch. Set OSC BALANCE fully to OSC 2 to hear "
             "only the input. INST/LOWER goes to Lower; VOCAL/UPPER or MIC to Upper; INST/LOWER alone (REAR) to both."},
    {"id": "b23", "name": "Individual and external trigger", "applies_to": ["kbd", "ext", "env_filter", "env_amp"],
     "rule": "Held notes wait for a trigger to start the filter and/or amp envelope: a note on Indv Trig Src CH (MIDI IN, SINGLE or DUAL) or below the split point (REMOTE KBD IN, SPLIT, "
             "Upper only), or the part's external input crossing GATE THRESHOLD (attack on rising, release on falling). Without triggers those envelopes do not run."},
    {"id": "b24", "name": "Memory and editing", "applies_to": ["kbd"],
     "rule": "Selecting a performance or patch loads it into the temporary area; edits mark '*' and are lost on reselection unless written. Patches inside performances are copies. "
             "MANUAL (SHIFT) sets the part's patch to the physical knob positions. Temporary and Edit Scope show values; Velocity and Control Scope show widths."},
    {"id": "b25", "name": "Panel MIDI", "applies_to": ["kbd"],
     "rule": "With Tx/Rx Edit on, MODE1 sends each knob as the CC in its access list, or SysEx where none is assigned; MODE2 lets each knob use any CC 1-31, 33-95, aftertouch or SysEx "
             "(non-standard). Both ends must use the same mode. VOLUME, TEMPO, Voice Modulator CONTROL 1/2, input levels and the Voice Modulator panel are never sent."},
]

# ======================================================================== MIDI
D["midi"] = {
    "receives": [
        {"message": "note_on", "note": "per Part MIDI channel; trigger notes per Indv Trig settings"}, {"message": "note_off", "note": "release velocity used"},
        {"message": "pitch_bend", "note": "per patch bend ranges"},
        {"message": "channel_pressure", "note": "Control Up by default; or a MODE2 knob"},
        {"message": "program_change", "note": "Perform Ctrl CH selects performances; Part MIDI CH selects that part's patch"},
        {"message": "control_change", "cc": 0, "parameter": "bank select MSB: 50H user, 51H preset, 52H card"},
        {"message": "control_change", "cc": 32, "parameter": "bank select LSB: preset group or card number"},
        {"message": "control_change", "cc": 1, "parameter": "modulation: LFO 2 depths"}, {"message": "control_change", "cc": 2, "parameter": "breath: Control Down by default"},
        {"message": "control_change", "cc": 5, "parameter": "portamento time"}, {"message": "control_change", "cc": 7, "parameter": "volume (performance or part)"},
        {"message": "control_change", "cc": 10, "parameter": "pan"}, {"message": "control_change", "cc": 11, "parameter": "expression (performance or part)"},
        {"message": "control_change", "cc": 64, "parameter": "hold 1 (Vocal Hold on the Performance Control channel)"}, {"message": "control_change", "cc": 65, "parameter": "portamento on/off"},
        {"message": "control_change", "cc": 84, "parameter": "portamento control (glide from a source note)"},
        {"message": "control_change", "note": "panel knobs per Tx/Rx Edit Mode (see parameter access); any CC 1-31 or 33-95 may serve as Control Up/Down"},
        {"message": "rpn", "number": 0, "parameter": "pitch bend sensitivity (sets both bend ranges)"}, {"message": "rpn", "number": 1, "parameter": "fine tuning"},
        {"message": "rpn", "number": 2, "parameter": "coarse tuning (Part Transpose)"},
        {"message": "channel_mode", "note": "120 all sound off, 121 reset all controllers, 123-125 all notes off, 126 mono (MONO on), 127 poly (MONO off)"},
        {"message": "clock", "note": "with MIDI Sync on"}, {"message": "start"}, {"message": "continue"}, {"message": "stop"}, {"message": "song_position"},
        {"message": "active_sensing"}, {"message": "sysex", "note": "Roland; device ID 17-32; patch, performance, pattern, motion and system data, bulk dump"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "channel_pressure"}, {"message": "pitch_bend"},
                  {"message": "control_change", "note": "panel edits per Tx/Rx Edit Mode; bank select"}, {"message": "program_change"},
                  {"message": "sysex"}, {"message": "active_sensing"}, {"message": "note", "note": "arpeggio, RPS and motion data and REMOTE KBD IN playing go to MIDI OUT; MIDI Thru optional"}],
    "channel_note": "Part MIDI CH per part (default Upper 1, Lower 2); Perform Ctrl CH for performance changes; Remote KBD CH (or ALL) for REMOTE KBD IN; Indv Trig Src CH for trigger notes. Mode 3.",
    "cc_map": {"92": "fx.bass", "95": "fx.treble", "93": "fx.mfx_level", "12": "fx.delay_time", "13": "fx.delay_feedback", "94": "fx.delay_level", "16": "lfo1.rate",
               "17": "lfo2.rate", "5": "pitch.portamento_time", "4": "osc1.control1", "76": "osc1.control2", "77": "osc2.fine_wide", "78": "osc2.control1", "79": "osc2.control2",
               "8": "mix.balance", "70": "osc.xmod_depth", "18": "osc.lfo1_depth", "74": "vcf.cutoff", "71": "vcf.resonance", "19": "vcf.lfo1_depth", "81": "env_filter.depth",
               "82": "env_filter.attack", "83": "env_filter.decay", "80": "amp.lfo1_depth", "7": "amp.level", "73": "env_amp.attack", "75": "env_amp.decay", "72": "env_amp.release",
               "65": "pitch.portamento"},
    "cc_map_note": "MODE1 (factory). In MODE2's factory table the SysEx-only controls gain CC 20-31: LFO 1 fade 20, OSC 2 range 21, LFO 2 depths 22-24, pitch envelope 25-27, filter S/R 28-29, key follow 30, amp S 31.",
    "note": "From the MIDI implementation v1.00 (16 April 1998) and chart (14 April 1998). Every control is also addressable by Roland SysEx (address map pp.194-207, not transcribed)."}

# ======================================================================== specifications
D["specifications"] = {
    "polyphony": {"voice_modulator_off": 10, "voice_modulator_on": 8}, "parts": 2, "key_modes": ["single", "dual", "split"],
    "waveforms": {"osc1": ["super saw", "triangle mod", "noise", "feedback osc", "square (PWM)", "saw", "triangle"], "osc2": ["square (PWM)", "saw", "triangle", "noise"]},
    "effects": {"tone_control": True, "multi_fx_types": 13, "delay_types": 5, "voice_modulator": "two 12-band band-pass filter sets, noise, robot oscillator, dedicated ensemble and delay"},
    "memory": {"performances": {"user": 64, "preset": 192}, "patches": {"user": 128, "preset": 384}, "rps_patterns": 48, "motions": "2 x 2 sets (A, B)"},
    "memory_card": {"type": "SmartMedia", "S2M-5": "2 MB: 64 x 32 performances, 128 x 32 patches, 48 patterns, 2 x 4 motions, system", "S4M-5": "4 MB: 64 x 64 performances, 128 x 64 patches"},
    "arpeggiator": {"modes": 4, "beat_patterns": 90, "range_octaves": [1, 4], "tempo_bpm": [20, 250]},
    "rps": {"patterns": 48, "max_loop_measures": 4, "ppq": 24, "quantize": ["off", "1/16T", "1/16", "1/8T", "1/8", "1/4T", "1/4"], "gate_time": ["real", "staccato", "33%", "50%", "66%", "100%"]},
    "motion": {"max_loop_measures": 8, "max_record_measures": 99, "recording": "realtime loop and one-shot"},
    "display": "16 characters x 2 lines, backlit LCD",
    "connectors": {"midi": ["REMOTE KBD IN", "IN", "OUT"], "outputs": "L (MONO), R: 1/4 inch phone", "ext_in": "INST/LOWER (MONO), VOCAL/UPPER: 1/4 inch phone",
                   "mic": "1/4 inch phone", "headphones": "stereo 1/4 inch phone"},
    "input_level_dbm": {"inst_lower": [-30, 4], "vocal_upper": [-30, 4], "mic": [-60, -20]},
    "input_impedance_ohm": {"inst_lower": 24000, "vocal_upper": 24000, "mic": 5000},
    "output_impedance_ohm": {"outputs": 2200, "headphones": 100},
    "power": {"ac_v": [117, 230, 240], "consumption_w": 17},
    "dimensions_mm": {"width": 482, "height": 88, "depth": 264, "note": "Printed as 482 (W) x 88 (D) x 264 (H); see source_inconsistencies."},
    "weight_kg": 4.5,
    "delay_max_ms": {"mono_long": 1250, "panning": 625, "short": 156},
}
D["omitted_from_source"] = [
    "the Performance List (192 presets) and Patch List (384 presets), pp.176-181",
    "the Roland SysEx address map and bulk dump formats, pp.194-207",
    "memory card, bulk dump, copy and factory-reset procedures (chapters 10 and 11), beyond what behaviours need",
    "the sound-making examples and Voice Modulator application examples (chapter 12 onward), the 'Understanding Sound' and 'What is MIDI?' primers, troubleshooting and error messages",
    "the INIT PATCH knob and slider positions, which are drawn rather than listed",
    "step-by-step button procedures for each edit page",
]
D["not_in_source"] = [
    "envelope times, LFO rates, portamento times and filter cutoff in physical units; every control is 0-127 only",
    "the band centre frequencies of the Voice Modulator's 12 filters",
    "tone control frequencies and gain range",
    "the order of tone control, multi-effects and delay (taken from the patch diagram)",
    "the point where VOICE MOD SEND takes the patch (before or after its effects), and whether the dry patch is muted when sent",
    "whether LFO 1 and LFO 2 run per voice or once per part",
    "the super saw's detune curve and the internals of triangle mod and feedback osc",
    "the robot oscillator's pitch range and waveform",
    "how the JP-8080 handles a CC 10 pan message against the patch PAN setting",
]
D["source_inconsistencies"] = [
    "OSC SHIFT is described as 'set independently for each performance' (p.71), but it sits in the patch section of the panel and in the Patch Parameters list (p.182); modelled as a patch parameter.",
    "The RPS range is C#2 (note 37) to C6 (note 84) on p.92 and p.95, but the HOLD text on p.92 gives C#2 as note 36.",
    "OSC 2 RANGE detents are listed as '24, -12, 0, +12 and +24' (p.69); -24 is presumably meant.",
    "RPN 0 accepts 0-24 semitones (00H-18H) but the same entry says up to one octave can be set (p.192).",
    "Ensemble Type lists FLANGER SLOW/DEEP/FAST in the parameter list (p.185) but only FLANGER SLOW and FAST in the Voice Modulator chapter (p.110); modelled with all three.",
    "Dimensions are printed as 482 (W) x 88 (D) x 264 (H) mm; for a 2U rack unit 88 mm is the height and 264 mm the depth.",
    "The LFO 2 and Bend Range pages (pp.87, 89) tell you to 'erase the control assign settings of the other Patch' to limit them to one part, apparently copied from the Control Assign page.",
    "p.11 says motions can record 'nearly all' sliders and knobs 'for up to 99 measures, in four separate memories'; p.210 gives 99 measures as the recording length and 8 as the loop length, consistent only if 99 is the play-once mode.",
]
D["modelling_gaps"] = [
    {"topic": "Two parts", "detail": "The schema has no per-part scope. One patch's voice architecture is modelled; at run time the Upper and Lower parts each run it with their own patch and their own "
     "tone control, multi-effect and delay (scope 'common' here means once per part). Part assignment of the external inputs is folded into ext.to_osc2."},
    {"topic": "Performance memory tier", "detail": "Schema memory values are patch, global or none. Performance-level settings are marked memory 'patch' with the note 'Stored in the performance, "
     "not the patch.' A 'performance' value (schema 0.14.0) would make this explicit."},
    {"topic": "Morphing", "detail": "Velocity Assign and Control Assign are per-parameter width tables stored in the patch, not slot-based routings, so they are not a mod_matrix. They are modelled "
     "as the morph module, two width parameters and behaviours b11-b14; morph.out is wired to cutoff only as a representative."},
    {"topic": "Dual-function controls", "detail": "Eighteen knobs and sliders also edit Voice Modulator parameters on the Voice Modulator panel. These are separate parameters whose access notes "
     "name the physical control (read from the blue legends on p.12)."},
    {"topic": "DSP waveforms", "detail": "Super saw (seven detuned saws), triangle mod, feedback osc and filtered noise are described only by their sound. A model needs measurements or the JP-8000's later documentation."},
    {"topic": "Physical scaling", "detail": "No times, rates or frequencies are given; all panel parameters are 0-127 or -64 to +63 as stored."},
    {"topic": "MODE2 MIDI", "detail": "Access lists record MODE1 and the MODE2 factory CCs; user MODE2 reassignment is a global table not enumerated."},
    {"topic": "Presets", "detail": "Preset performance and patch names are not included; the lists are in the manual (pp.176-181) if wanted."},
]

order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "led_legend", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/roland-jp-8080_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written", len(M), "modules", len(P), "parameters", len(J), "ports", len(C), "connections")
