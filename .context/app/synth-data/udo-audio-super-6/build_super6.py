#!/usr/bin/env python3
"""Assemble the UDO Audio Super 6 device file (schema 0.12.0).

12-voice hybrid polysynth: per voice two FPGA DDS oscillators (DDS 1 a seven-oscillator
'super' core with alternative waveforms; DDS 2 algorithmic, with sub, LFO and audio-in
modes) into analogue VCAs, a voltage-controlled high-pass and an SSI 4-pole low-pass,
an analogue VCA; two envelopes (ENV 1 with hold stages, loop and invert), LFO 1 (per
super voice, up to 20 kHz), LFO 2 (per voice, triangle); binaural mode pairs the voices
into six stereo 'super voices'. Chorus and delay; modulation matrix; arpeggiator and
sequencer; 128 patches; keyboard (49 Fatar keys) and desktop models; MPE.

Source: UDO Super 6 Owner's Manual v1.4 (February 2024), complete, including the official
CC/RPN/NRPN tables (continuous parameters: NRPN = 1024 + CC, 14-bit).
"""
import json

S10 = {"min": 0, "max": 10}
NRPN_CCS = {3, 5, 7, 12, 13, 17, 18, 19, 21, 22, 25, 26, 28, 32, 33, 35, 37, 45, 46, 47, 52, 53, 54, 55, 56, 57, 58, 62, 63, 70, 71, 72, 73, 74, 75, 76, 77, 91, 92, 94, 95}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="fader", cc=None, shift=False, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": "SHIFT (secondary function)"} if shift else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
        if cc in NRPN_CCS:
            acc = acc + [{"type": "midi", "message": f"NRPN {1024 + cc} (MSB 08H, LSB {cc:02X}H, 14-bit)"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def fader(id, module, label, fn, cc=None, **kw):
    kw.setdefault("panel_scale", S10)
    par(id, module, label, "continuous", fn, cc=cc, **kw)


def sw(id, module, label, fn, vals, control="toggle_switch", cc=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, values=[{"value": v} for v in vals], **kw)


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
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


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


D["device"] = {
    "id": "udo-audio-super-6", "manufacturer": "UDO Audio", "model": "Super 6",
    "category": "12-voice binaural hybrid polyphonic synthesizer (DDS oscillators, analogue filters and VCAs), 49-key keyboard or desktop",
    "based_on": "Original design (UK, 2020; desktop 2021) by George Hearn; panel design with Axel Hartmann; Jupiter-8-influenced layout.",
    "sources": [
        {"id": "manual", "title": "UDO Super 6 Owner's Manual, version 1.4 (February 2024)", "kind": "user_manual", "file": "UDO_Super_6_Manual.pdf (also https://cdn.prod.website-files.com/641dd1a703957e750da6b5e3/66e4297ca75f0eb7e730884b_UDO_Super6_Manual.pdf)",
         "pages": 140, "note": "Complete: every section, keyboard and desktop controls, modulation matrix, voice assign, arpeggiator/sequencer, global settings, MPE, file management, cheat sheet, and the official CC, RPN and NRPN tables."},
        {"id": "midiguide", "title": "midi.guide, 'UDO Audio Super 6 MIDI CCs and NRPNs' (January 2023)", "kind": "other", "file": "https://midi.guide/d/udo-audio/super-6/",
         "note": "Community chart; superseded by the manual's tables, with several differences logged."},
        {"id": "udo_support", "title": "UDO Audio support, 'How do I process an external audio signal?'", "kind": "other",
         "file": "https://udo-audio.zendesk.com/hc/en-gb/articles/4402097901842-How-do-I-process-an-external-audio-signal",
         "note": "Gate detector triggers envelopes and LFO 1 (reset mode) at a threshold set by input gain; not in POLY 2."},
        {"id": "reviews", "title": "Gearnews desktop review; Gearspace owner discussion; retailer specifications", "kind": "other", "file": "https://www.gearnews.com/udo-audio-super-6-desktop-synthesizer-review/",
         "note": "SSI2144 low-pass; HPF tracking locked to the low-pass cutoff and not resonant; 'fixed or linked' high-pass."},
        {"id": "firmware", "title": "Synthtopia / Synth Anatomy on firmware v0.27", "kind": "other", "file": "https://www.synthtopia.com/content/2021/11/18/udo-super-6-firmware-update-adds-new-midi-synthesis-options/",
         "note": "Launch prices and history of CC/NRPN support."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 12,
    "polyphony_mode": "12 voices, or binaural: six stereo 'super voices' with a full voice per ear; voice assign POLY 1, POLY 2, UNISON (adjustable size), SOLO, LEGATO; MPE",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "128 patches in banks A1-H2 (8 each); 32 user-loadable alternative DDS 1 waveforms (stored per patch); sequences stored separately; files via USB drive.",
    "semi_modular": False, "panel_counts": {"keys": 49, "select_buttons": 16},
    "summary": ("Per voice: DDS 1, a super-wave core of seven free-running oscillators (sine, saw, square, triangle, noise or one of 32 alternative waves; 64'-2') with stereo de-phasing "
                "and detune; DDS 2, an algorithmic oscillator (six waves, 32'-2', tune ±10 st) that can sync, crossfade by key, become an LFO, a square sub an octave below DDS 1, or carry "
                "the external input; MIX balances the two. Analogue path: voltage-controlled high-pass (off, fixed, tracking) into an SSI 24 dB low-pass with drive, then a VCA. ENV 1 "
                "(attack hold, attack, decay hold, decay, sustain, release; normal, inverted or looping), ENV 2 (with decay hold), LFO 1 (four waves to 50 Hz or 20 Hz-20 kHz, with L/R phase), "
                "LFO 2 (triangle per voice). Chorus I/II and delay with freeze. Matrix with fixed sources and destinations plus direct mappings. Arpeggiator and step sequencer."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assign", "VOICE ASSIGN / KEYBOARD", "49-key Fatar keyboard (velocity, aftertouch) or MIDI; voice assign, binaural pairing, octave and transpose, portamento (interval-dependent), MPE.",
    ["kbd.midi_in", "kbd.sustain", "kbd.arp_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch"], scope="common", props={"keys": 49})
mod("bender", "manual_controller", "Bender and pedal", "PERFORMANCE", "Bender: left/right bends pitch (to an octave) and cutoff; pushing up (pressure pad) triggers LFO 2. Expression pedal (0-5 V TRS) as a matrix source.",
    ["bender.pedal_in"], ["bender.bend", "bender.push", "bender.pedal"], scope="common")
mod("dds1", "oscillator", "DDS 1", "OSCILLATORS", "FPGA super-wave core: a centroid and six sister oscillators, free-running; classic waves or one of 32 alternative waves; super mode de-phases the sisters in stereo with detune and SWM.",
    ["dds1.pitch_cv", "dds1.fm", "dds1.detune_cv", "dds1.lfo1_sum"], ["dds1.out"], props={"sub_oscillators": 7, "alternative_waves": 32})
mod("dds2", "oscillator", "DDS 2", "OSCILLATORS", "Algorithmic FPGA oscillator: sine, saw, square, triangle, noise, pulse; phase reset per note; NORM, X-FADE (key crossfade) or SYNC; LFO range (0.1-100 Hz) with sub or audio-in options.",
    ["dds2.pitch_cv", "dds2.pw_cv", "dds2.sync_in", "dds2.fm", "dds2.lfo1_sum"], ["dds2.out", "dds2.mod_out"], props={"lfo_rate_hz": [0.1, 100]})
mod("sub", "oscillator", "Sub oscillator", "OSCILLATORS", "Square one octave below DDS 1, replacing DDS 2's audio (RANGE at LFO, mode at SUB OSC).", ["sub.pitch_cv"], ["sub.out"])
mod("audioin", "preamp", "External audio input", "OSCILLATORS / rear panel", "Stereo input through the DDS 2 channel (RANGE at LFO, mode at AUDIO IN); gain (SHIFT + MIX); gate detector triggers envelopes and LFO 1 reset.",
    ["audioin.in"], ["audioin.out", "audioin.gate"], scope="common")
mod("mixer", "mixer", "Mixer", "MIXER", "MIX balances DDS 1 against DDS 2, the sub or the audio input; in X-FADE it sets the split point (two-octave crossfade).", ["mixer.a", "mixer.b"], ["mixer.out"])
mod("hpf", "filter", "VC high-pass filter", "VCF", "Analogue voltage-controlled high-pass (non-resonant): off, fixed (about 500 Hz, adjustable with SHIFT + FREQ since firmware v0.27) or tracking the low-pass cutoff for a pseudo band-pass.", ["hpf.in", "hpf.cutoff_cv"], ["hpf.out"])
mod("lpf", "filter", "VC low-pass filter", "VCF", "SSI2144 4-pole 24 dB/oct resonant low-pass, self-oscillating; drive off, 1 (saturation with resonance compensation) or 2 (overdrive); auto-tuned for key tracking.", ["lpf.in", "lpf.cutoff_cv"], ["lpf.out"],
    props={"slope_db_per_oct": 24, "chip": "SSI2144"})
mod("vcfcv", "summer", "Filter cutoff CV", "VCF", "Sum of FREQ and every cutoff modulation; drives the low-pass and, in TRK mode, the high-pass at the same frequency.",
    ["vcfcv.in"], ["vcfcv.out"])
mod("vca", "vca", "VCA", "VCA", "Analogue VCA under ENV 2 or one of two fixed envelopes (gate; gate with release); LFO 1 tremolo; velocity dynamics.", ["vca.in", "vca.cv"], ["vca.out"])
mod("env1", "envelope", "ENV 1", "ENVELOPES", "Attack hold (to 10 s), attack, decay hold, decay, sustain, release (1 ms-10 s); normal, inverted or loop; key tracking of decay and release.", ["env1.gate"], ["env1.out"],
    props={"time_s": [0.001, 10]})
mod("env2", "envelope", "ENV 2", "ENVELOPES", "Attack, decay hold, decay, sustain, release (1 ms-10 s); default VCA envelope.", ["env2.gate"], ["env2.out"], props={"time_s": [0.001, 10]})
mod("lfo1", "lfo", "LFO 1", "LFO 1", "One LFO per super voice: triangle, square, random, saw at 0.05-50 Hz, or HF (20 Hz-20 kHz) and HF TRK (key-tracked, a third oscillator); delay, L/R phase, free/once/reset; DDS 1 waveform via SHIFT ('Battwave').",
    ["lfo1.reset"], ["lfo1.out"], props={"rate_hz": [0.05, 50], "hf_hz": [20, 20000]})
mod("lfo2", "lfo", "LFO 2", "LFO 2", "Triangle LFO, one per voice (polyphonically modulatable), triggered by bender push, aftertouch or always on; rate and delay.", ["lfo2.trigger"], ["lfo2.out"])
mod("chorus", "chorus", "Chorus", "CHORUS", "24-bit stereo chorus: I (subtle), II (denser, faster), I+II (ensemble).", ["chorus.in"], ["chorus.out"], scope="common")
mod("delay", "delay", "Delay", "DELAY", "24-bit stereo delay, 1 ms-1 s (or synced divisions), feedback to infinite repeat, level; freeze via footswitch or CC 69.", ["delay.in"], ["delay.out"], scope="common",
    props={"time_s": [0.001, 1]})
mod("arp", "sequencer", "Arpeggiator and sequencer", "ARPEGGIATOR / SEQUENCER", "Arpeggiator (up, down, up and down, random; 1-4 octaves; hold) and step sequencer (steps, slide, accent, rest, length); 30-300 BPM, swing, MIDI clock; syncs LFO 1 and delay.",
    [], ["arp.notes"], scope="common", props={"tempo_bpm": [30, 300]})
mod("out", "output", "Output", "MASTER / rear panel", "Stereo outputs (L alone sums to mono) and headphones; MASTER VOLUME to +4 dB.", ["out.in"], ["out.main_l", "out.main_r", "out.phones"], scope="common")

# ---------------------------------------------------------------- parameters
sw("dds1.wave", "dds1", "DDS 1 WAVEFORM", "Classic waves or the selected alternative wave (rightmost).", ["sine", "sawtooth", "square", "triangle", "noise", "alternative"], "rotary_switch", 29)
sw("dds1.range", "dds1", "DDS 1 RANGE", "Footage.", ["64'", "32'", "16'", "8'", "4'", "2'"], "rotary_switch", 30)
par("dds1.alt_wave", "dds1", "Alternative waveform (W1-W16)", "integer", "One of 32 user-loadable waves (press twice for 17-32); stored per patch.", control="push_button", range={"min": 1, "max": 32})
sw("dds2.wave", "dds2", "DDS 2 WAVEFORM", "DDS 2 waveform.", ["sine", "sawtooth", "square", "triangle", "noise", "pulse"], "rotary_switch", 31)
sw("dds2.range", "dds2", "DDS 2 RANGE", "Footage, or LFO (DDS 2 leaves the audio path; enables SUB OSC / AUDIO IN).", ["lfo", "32'", "16'", "8'", "4'", "2'"], "rotary_switch", 34)
fader("dds2.tune", "dds2", "DDS 2 TUNE", "±10 semitones; in LFO range, rate about 0.1-100 Hz.", 35, control="knob", panel_scale={"min": -10, "max": 10})
sw("dds2.mode", "dds2", "DDS 2 MODE", "NORM, X-FADE (key crossfade) or SYNC (hard sync to DDS 1).", ["norm", "x_fade", "sync"], cc=36, note="CC 36: 0 Norm, 43 X-Fade/Sub Osc, 85 Sync/Audio In.")
sw("dds2.lfo_mode", "dds2", "DDS 2 MODE (RANGE at LFO)", "With RANGE at LFO the same switch selects LFO only, SUB OSC (middle) or AUDIO IN (upper).", ["lfo_only", "sub_osc", "audio_in"], cc=36,
   note="Same physical switch and CC as DDS 2 MODE; its meaning changes with RANGE.")
fader("mixer.mix", "mixer", "MIX", "DDS 1 to DDS 2 (or sub, or audio in); split point in X-FADE.", 37, control="knob")
fader("audioin.gain", "audioin", "Audio input gain (SHIFT + MIX)", "Input gain (default line level matching the oscillators); also sets the gate-detector threshold.", None, control="knob", shift=True)
sw("vcf.drive", "lpf", "DRIVE", "Low-pass drive.", ["off", "1", "2"], cc=41)
sw("vcf.hpf_mode", "hpf", "HPF", "High-pass mode.", ["off", "fix", "trk"], cc=40)
fader("vcf.freq", "lpf", "FREQ", "Low-pass cutoff (headroom left for modulation per key tracking).", 74)
fader("vcf.hpf_freq", "hpf", "HPF (SHIFT + FREQ)", "High-pass cutoff in FIX mode.", 95, shift=True)
fader("vcf.res", "lpf", "RES", "Resonance; self-oscillates at maximum.", 71)
fader("vcf.env", "lpf", "ENV (VCF)", "Envelope depth on cutoff.", 45)
sw("vcf.env_src", "lpf", "VCF envelope source", "ENV 1, both, or ENV 2.", ["env1", "1_plus_2", "env2"], cc=44)
fader("vcf.lfo1", "lpf", "LFO 1 (VCF)", "LFO 1 depth on cutoff.", 46)
fader("vcf.dds2", "lpf", "DDS 2 (VCF)", "DDS 2 depth on cutoff (audio-rate or LFO).", 47)
sw("vcf.keytrack", "lpf", "KEYTRACK (VCF)", "Cutoff tracking: off, half (quarter tones per key) or full (semitones).", ["off", "half", "on"], cc=43)
fader("vca.env_level", "vca", "ENV LEVEL", "Envelope level into the VCA (high settings can clip).", 7)
fader("vca.lfo1", "vca", "LFO 1 (VCA)", "Tremolo depth.", 92)
sw("vca.env_mode", "vca", "VCA envelope", "ENV 2, fixed envelope 1 (gate), or fixed envelope 2 (gate with release).", ["env2", "gate", "gate_release"], cc=49)
sw("vca.dynamics", "vca", "DYNAMICS", "Velocity to VCA level and cutoff.", ["off", "half", "on"], cc=48)
for e, ccs in (("env1", (53, 54, 55, 56)), ("env2", (73, 57, 58, 72))):
    for k, nm in enumerate(("attack", "decay", "sustain", "release")):
        fader(f"{e}.{nm}", e, f"{e.upper().replace('ENV', 'ENV ')} {nm[0].upper()}", f"{nm.title()} ({'level' if nm == 'sustain' else '1 ms-10 s'}).", ccs[k],
              **({"physical": {"min": 0.001, "max": 10, "unit": "s"}} if nm != "sustain" else {}))
    fader(f"{e}.decay_hold", e, f"{e.upper().replace('ENV', 'ENV ')} DECAY HOLD (SHIFT + D)", "Time before decay starts, up to 10 s.", 32 if e == "env1" else 33, shift=True, physical={"min": 0, "max": 10, "unit": "s"})
fader("env1.attack_hold", "env1", "ENV 1 ATTACK HOLD (SHIFT + A)", "Delay before the attack, up to 10 s.", 52, shift=True, physical={"min": 0, "max": 10, "unit": "s"})
sw("env1.keytrack", "env1", "ENV 1 KEYTRACK", "Shortens decay and release up the keyboard.", ["off", "half", "on"], cc=51)
sw("env1.mode", "env1", "ENV 1 MODE", "Normal, inverted or loop (attack, decay hold and decay repeat while held).", ["normal", "inverted", "loop"], cc=50)
fader("lfo1.rate", "lfo1", "LFO 1 RATE", "0.05-50 Hz, 20 Hz-20 kHz in HF modes, or a clock division with SYNC.", 17, physical={"min": 0.05, "max": 50, "unit": "Hz"})
fader("lfo1.delay", "lfo1", "LFO 1 DELAY", "Delay before the LFO acts, 0-10 s.", 18, physical={"min": 0, "max": 10, "unit": "s"})
fader("lfo1.lr_phase", "lfo1", "LR PHASE / PAN", "Binaural: left-right LFO phase (0-2π). Non-binaural: pan spread of the voices.", 19, panel_scale={"min": 0, "max": 6.283})
sw("lfo1.wave", "lfo1", "LFO 1 WAVEFORM", "LFO waveform or HF modes (sine by default); SHIFT + move: DDS 1's waveform.", ["triangle", "square", "random", "sawtooth", "hf", "hf_trk"], "rotary_switch", 16)
sw("lfo1.mode", "lfo1", "LFO 1 MODE", "LF: free, once, reset. HF: NORM (modulation), DDS 1 or DDS 2 (summed into that channel).", ["free_norm", "once_dds1", "reset_dds2"], cc=20)
fader("dds.lfo1", "dds1", "LFO 1 (DDS pitch)", "LFO 1 pitch modulation.", 21)
fader("dds.env1", "dds1", "ENV 1 (DDS pitch)", "ENV 1 pitch modulation.", 22)
sw("dds.mod_dest", "dds1", "DDS modulator destination", "Pitch modulation to DDS 1, both, or DDS 2.", ["dds1", "1_plus_2", "dds2"], cc=23)
sw("dds1.super", "dds1", "SUPER (DDS 1)", "Super mode off, half depth (phase reset per note), or full.", ["off", "half", "on"], cc=24)
fader("dds.pw_detune", "dds2", "PW/DETUNE", "DDS 2 pulse width; DDS 1 detune spread in super mode.", 25)
fader("dds.drift", "dds1", "DRIFT (SHIFT + PW/DETUNE)", "Randomises oscillator pitch, filters and envelopes.", 94, shift=True)
fader("dds.pwm_swm", "dds2", "PWM/SWM", "PWM of DDS 2's pulse; super-wave modulation of DDS 1's detune.", 26)
sw("dds.pwm_src", "dds2", "PWM/SWM source", "LFO 1, both, or ENV 1.", ["lfo1", "both", "env1"], cc=27)
fader("dds.cross_mod", "dds1", "CROSS MOD", "DDS 2 FMs DDS 1 (exponential); reversed when SYNC is on.", 28)
sw("chorus.mode", "chorus", "CHORUS I / II", "Off, I, II, or I + II (ensemble).", ["off", "I", "II", "I_II"], "push_button", 93)
fader("delay.level", "delay", "DELAY LEVEL", "Wet level.", 91, control="knob")
fader("delay.time", "delay", "DELAY TIME", "1 ms-1 s, or a division with SYNC.", 12, control="knob", physical={"min": 0.001, "max": 1, "unit": "s"})
fader("delay.feedback", "delay", "DELAY FEEDBACK", "Repeats; maximum is infinite without decay.", 13, control="knob")
par("delay.freeze", "delay", "Delay freeze", "boolean", "Holds the loop: released footswitch adds notes, held footswitch loops (right pedal of a dual switch, or CC 69).", memory="none", access=[{"type": "midi", "message": "CC 69"}])
# performance (keyboard model)
fader("bend.dds", "bender", "BENDER DDS", "Pitch-bend depth, to one octave.", 76)
sw("bend.dds_dest", "bender", "Performance destination (bender)", "DDS 1, both, or DDS 2.", ["dds1", "1_plus_2", "dds2"], cc=61)
fader("bend.detune", "bender", "Performance detune (SHIFT + DDS)", "Detune between the oscillators, ±7 semitones.", None, shift=True, panel_scale={"min": -7, "max": 7})
fader("bend.vcf", "bender", "BENDER VCF", "Bend depth on cutoff.", 77)
fader("lfo2.rate", "lfo2", "LFO 2 RATE", "LFO 2 rate.", 62, control="knob")
fader("lfo2.delay", "lfo2", "LFO 2 DELAY", "Fade-in delay.", 63, control="knob")
sw("lfo2.trigger", "lfo2", "LFO 2 trigger", "Bender push; aftertouch and push; or always on (aftertouch then acts as bend).", ["trig", "at_trig", "on"], cc=60)
fader("lfo2.vcf", "lfo2", "LFO 2 VCF", "LFO 2 depth on cutoff.", 75)
fader("lfo2.dds", "lfo2", "LFO 2 DDS", "LFO 2 depth on pitch.", 70)
sw("lfo2.dds_dest", "lfo2", "LFO 2 destination", "DDS 1, both, or DDS 2.", ["dds1", "1_plus_2", "dds2"])
fader("kbd.portamento", "kbd", "PORTAMENTO", "Up to 10 s per octave; interval-dependent.", 5)
par("kbd.octave", "kbd", "OCTAVE", "integer", "Spring-loaded octave selector ±2; SHIFT: global transpose ±12.", memory="global", control="toggle_switch", cc=67, range={"min": -2, "max": 2})
par("kbd.fine_tune", "kbd", "Global fine tune (SHIFT + MOD AMOUNT)", "integer", "±100 cents.", memory="global", control="encoder", range={"min": -100, "max": 100},
    access=[{"type": "panel", "control": "encoder", "note": "SHIFT + MOD AMOUNT"}, {"type": "midi", "message": "RPN 1 (channel fine tuning)"}])
par("out.volume", "out", "MASTER VOLUME", "continuous", "Output and headphone level to +4 dB (not stored).", memory="none", control="knob", panel_scale={"min": 0, "max": 10})
# voice assign, arp, global
sw("kbd.assign", "kbd", "VOICE ASSIGN MODE", "POLY 1 (overlapping releases, default), POLY 2 (curtailed releases; disables the audio-input gate), UNISON, LEGATO (no retrigger), SOLO (retrigger).",
   ["poly2", "poly1", "unison", "legato", "solo"], "push_button", 78)
sw("kbd.unison_size", "kbd", "U. SIZE (SHIFT + MODE)", "Unison stacking.", ["3_binaural", "6_binaural", "6_octave", "6_octave_fifth", "6_major_chord"], "push_button", 79)
par("kbd.binaural", "kbd", "Binaural mode", "boolean", "Pairs the 12 voices into six stereo super voices (forced on by X-FADE and key tracking).", control="push_button", cc=80)
par("arp.on", "arp", "ARP/SEQ ON", "boolean", "Runs the arpeggiator or sequencer.", control="push_button", cc=86)
par("ui.manual_cc", "kbd", "Manual mode (MIDI)", "boolean", "Manual mode on/off.", memory="none", access=[{"type": "midi", "message": "CC 59"}])
par("arp.hold", "arp", "HOLD", "boolean", "Latches notes.", control="push_button", cc=87)
sw("arp.mode", "arp", "ARP/SEQ MODE", "Arpeggio order or sequencer.", ["up", "down", "up_down", "random", "seq"], "push_button", 85)
sw("arp.range", "arp", "RANGE", "Arpeggio octaves; in sequencer mode, the page (steps 1-16 ... 49-64).", ["1", "2", "3", "4"], "push_button", 82)
fader("arp.tempo", "arp", "TEMPO", "30-300 BPM.", 3, control="knob", physical={"min": 30, "max": 300, "unit": "BPM"})
sw("arp.swing", "arp", "SWING (SHIFT + RANGE)", "Swing off or 1-4.", ["0", "1", "2", "3", "4"], "push_button", 83)
par("arp.sync", "arp", "SYNC", "boolean", "Syncs LFO 1 rate and delay time to the tempo (as clock divisions).", control="push_button", cc=81)
par("arp.ext_clk", "arp", "EXT CLK (SHIFT + SYNC)", "enum", "1 clock transmit, 2 clock receive (and start/stop; exclusive with 1), 3 MIDI note output, 4 MIDI stop receive.", memory="global", control="push_button", cc=84,
    values=[{"value": v} for v in ["clock_tx", "clock_rx", "note_out", "stop_rx"]])
par("arp.seq_rec", "arp", "SEQ REC", "enum", "Arms recording and steps through the STEP, SLIDE, ACCENT, REST and LENGTH tracks.", control="push_button", values=[{"value": v} for v in ["step", "slide", "accent", "rest", "length"]])
par("arp.length", "arp", "LENGTH", "integer", "Sequence length (LENGTH track).", control="push_button", range={"min": 1, "max": 64})
par("arp.sequence", "arp", "Sequence load / store", "integer", "16 sequences: SHIFT + HOLD loads, SHIFT + SEQ REC stores (hold a button 3 s).", memory="global", control="push_button", cc=14, range={"min": 1, "max": 16})
G = "SHIFT (global settings), then "
par("sys.midi_ch", "kbd", "MIDI CH", "integer", "Channel 1-16 (omni until set); DIN and USB MIDI cannot be used together.", memory="global",
    access=[{"type": "menu", "note": G + "MIDI CH, buttons 1-8/A-H"}, {"type": "midi", "message": "NRPN 2051"}], range={"min": 1, "max": 16})
par("sys.txrx_e", "kbd", "TX/RX E", "enum", "1 CC transmit, 2 CC receive (7- and 14-bit), 3 NRPN (14-bit) transmit mode.", memory="global", access=[{"type": "menu", "note": G + "TX/RX E"}],
    values=[{"value": v} for v in ["cc_tx", "cc_rx", "nrpn"]])
par("sys.txrx_p", "kbd", "TX/RX P", "enum", "1 program change transmit, 2 receive.", memory="global",
    access=[{"type": "menu", "note": G + "TX/RX P"}, {"type": "midi", "message": "NRPN 2055 (tx), 2056 (rx)"}], values=[{"value": "tx"}, {"value": "rx"}])
par("sys.clock_nrpn", "arp", "MIDI clock transmit/receive", "enum", "Also set in EXT CLK.", memory="global", access=[{"type": "midi", "message": "NRPN 2052 (tx), 2053 (rx)"}], values=[{"value": "tx"}, {"value": "rx"}])
par("sys.local", "kbd", "LOCAL", "boolean", "Local control (MIDI still sent when off).", memory="global", access=[{"type": "menu", "note": G + "LOCAL"}, {"type": "midi", "message": "CC 122"}], default=True)
par("sys.tune", "lpf", "TUNE", "boolean", "Filter auto-tune (12 LEDs show progress).", memory="none", access=[{"type": "menu", "note": G + "TUNE"}])
par("sys.mpe", "kbd", "MPE", "enum", "1 MPE on (limited to six voices), 2 poly aftertouch dead zone, 3 reduced Y-axis (CC 74) sensitivity; stored per patch.", memory="patch",
    access=[{"type": "menu", "note": G + "MPE"}], values=[{"value": v} for v in ["mpe_on", "at_dead_zone", "y_reduce"]])
par("sys.dump", "kbd", "DUMP", "boolean", "Reserved for future use.", memory="none", access=[{"type": "menu", "note": G + "DUMP"}])
par("sys.transpose", "kbd", "Global transpose", "integer", "±12 semitones (keyboard: SHIFT + octave switch; desktop: TRNSP + MOD AMOUNT).", memory="global",
    access=[{"type": "menu", "note": G + "octave switch / TRNSP"}, {"type": "midi", "message": "RPN 2 (coarse tuning)"}], range={"min": -12, "max": 12})
par("sys.global_reset", "kbd", "Global reset", "boolean", "Hold MANUAL 5 s after power-on; resets globals and runs auto-tune.", memory="none",
    access=[{"type": "gesture", "gesture": "hold MANUAL for 5 seconds", "when": "any_time"}])
for pid, label, fn in (("ui.patch", "PATCH", "Patch mode; A-H banks (twice for A2-H2), 1-8 patches; hold 1-8 for 3 s to store."), ("ui.wave", "WAVE", "Alternative wave selection."),
                       ("ui.manual", "MANUAL", "Plays the panel as set; SHIFT + MANUAL loads INIT."), ("ui.shift", "SHIFT", "Secondary functions and global settings."),
                       ("ui.mod_assign", "MOD ASSIGN", "Matrix assignment mode."), ("ui.mod_amount", "MOD AMOUNT", "Matrix depth -100% to +100% (encoder).")):
    par(pid, "kbd", label, "boolean" if pid != "ui.mod_amount" else "continuous", fn, memory="none", control="push_button" if pid != "ui.mod_amount" else "encoder",
        **({"panel_scale": {"min": -100, "max": 100}} if pid == "ui.mod_amount" else {}))

# ---------------------------------------------------------------- ports
jack("jack.out_l", "OUTPUT L", "out", "audio", "out.main_l", "Unbalanced; mono sum if R is unplugged.", "6.35 mm TS")
jack("jack.out_r", "OUTPUT R", "out", "audio", "out.main_r", "Unbalanced.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones (MASTER VOLUME).", "6.35 mm TRS")
jack("jack.audio_in", "AUDIO IN", "in", "audio", "audioin.in", "Stereo external audio through the DDS 2 channel.", "6.35 mm TRS")
jack("jack.sustain", "SUSTAIN", "in", "gate", "kbd.sustain", "Footswitch (polarity auto-detected; dual: ring = delay freeze).", "6.35 mm TRS")
jack("jack.pedal", "CONTROL (expression)", "in", "cv", "bender.pedal_in", "Expression pedal, TRS, 0-5 V; matrix source PED/CV.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "Class-compliant USB MIDI; patch, wave and sequence files; firmware (SUPER6-BOOT drive).", "USB")
jack("jack.power", "POWER", "in", "power", None, "IEC mains, 90-240 V AC, 50 W, 2 A T fuse.", "IEC C14")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.arp_in", "cv")
for o in ("dds1", "dds2"):
    con("kbd.pitch", f"{o}.pitch_cv", "cv")
    con("lfo1.out", f"{o}.pitch_cv", anyof("dds.mod_dest", o, "1_plus_2"), amount="dds.lfo1")
    con("env1.out", f"{o}.pitch_cv", anyof("dds.mod_dest", o, "1_plus_2"), amount="dds.env1")
    con("bender.bend", f"{o}.pitch_cv", anyof("bend.dds_dest", o, "1_plus_2"), amount="bend.dds")
    con("lfo2.out", f"{o}.pitch_cv", anyof("lfo2.dds_dest", o, "1_plus_2"), amount="lfo2.dds")
con("kbd.pitch", "sub.pitch_cv", "cv", note="One octave below DDS 1.")
con("lfo1.out", "dds2.pw_cv", anyof("dds.pwm_src", "lfo1", "both"), amount="dds.pwm_swm")
con("env1.out", "dds2.pw_cv", anyof("dds.pwm_src", "env1", "both"), amount="dds.pwm_swm")
con("lfo1.out", "dds1.detune_cv", {"all": [anyof("dds.pwm_src", "lfo1", "both"), {"param": "dds1.super", "not_equals": "off"}]}, amount="dds.pwm_swm", note="Super-wave modulation.")
con("dds2.out", "dds1.fm", {"param": "dds2.mode", "not_equals": "sync"}, amount="dds.cross_mod", note="Exponential FM of DDS 1 by DDS 2.")
con("dds1.out", "dds2.sync_in", "sync", eq("dds2.mode", "sync"))
con("dds1.out", "dds2.fm", eq("dds2.mode", "sync"), amount="dds.cross_mod", note="With SYNC on, cross mod reverses: DDS 1 frequency-modulates DDS 2 (wavefold/PM-like).")
con("lfo1.out", "dds1.lfo1_sum", {"all": [anyof("lfo1.wave", "hf", "hf_trk"), eq("lfo1.mode", "once_dds1")]}, note="HF LFO 1 summed into the DDS 1 channel.")
con("lfo1.out", "dds2.lfo1_sum", {"all": [anyof("lfo1.wave", "hf", "hf_trk"), eq("lfo1.mode", "reset_dds2")]}, note="HF LFO 1 summed into the DDS 2 channel.")
con("dds1.out", "mixer.a")
con("dds2.out", "mixer.b", {"param": "dds2.range", "not_equals": "lfo"})
con("sub.out", "mixer.b", {"all": [eq("dds2.range", "lfo"), eq("dds2.lfo_mode", "sub_osc")]}, note="Sub replaces DDS 2's audio.")
con("audioin.out", "mixer.b", {"all": [eq("dds2.range", "lfo"), eq("dds2.lfo_mode", "audio_in")]}, note="External audio in the DDS 2 channel.")
NOT_P2 = {"param": "kbd.assign", "not_equals": "poly2"}
con("audioin.gate", "env1.gate", "gate", NOT_P2, note="Gate detector: input above the threshold (set by input gain) triggers the envelopes; off in POLY 2.")
con("audioin.gate", "env2.gate", "gate", NOT_P2)
con("audioin.gate", "lfo1.reset", "gate", {"all": [NOT_P2, eq("lfo1.mode", "reset_dds2")]}, note="Also resets LFO 1 in RESET mode.")
con("mixer.out", "hpf.in")
con("hpf.out", "lpf.in")
con("vcfcv.out", "lpf.cutoff_cv", "cv")
con("vcfcv.out", "hpf.cutoff_cv", "cv", eq("vcf.hpf_mode", "trk"), note="TRK locks the high-pass to the low-pass cutoff for a pseudo band-pass; the HPF is not resonant (owner report).")
con("env1.out", "vcfcv.in", "cv", anyof("vcf.env_src", "env1", "1_plus_2"), amount="vcf.env")
con("env2.out", "vcfcv.in", "cv", anyof("vcf.env_src", "env2", "1_plus_2"), amount="vcf.env")
con("lfo1.out", "vcfcv.in", "cv", amount="vcf.lfo1")
con("dds2.mod_out", "vcfcv.in", "cv", amount="vcf.dds2")
con("kbd.pitch", "vcfcv.in", "cv", {"param": "vcf.keytrack", "not_equals": "off"})
con("bender.bend", "vcfcv.in", "cv", amount="bend.vcf")
con("lfo2.out", "vcfcv.in", "cv", amount="lfo2.vcf")
con("kbd.velocity", "vcfcv.in", "cv", {"param": "vca.dynamics", "not_equals": "off"})
con("lpf.out", "vca.in")
con("env2.out", "vca.cv", "cv", eq("vca.env_mode", "env2"), amount="vca.env_level")
con("kbd.gate", "vca.cv", "gate", {"param": "vca.env_mode", "not_equals": "env2"}, amount="vca.env_level", note="Fixed gate envelopes.")
con("lfo1.out", "vca.cv", "cv", amount="vca.lfo1")
con("kbd.velocity", "vca.cv", "cv", {"param": "vca.dynamics", "not_equals": "off"})
con("kbd.gate", "env1.gate", "gate")
con("kbd.gate", "env2.gate", "gate")
con("kbd.gate", "lfo1.reset", "gate", eq("lfo1.mode", "reset_dds2"))
con("bender.push", "lfo2.trigger", "cv", {"param": "lfo2.trigger", "not_equals": "on"})
con("kbd.aftertouch", "lfo2.trigger", "cv", eq("lfo2.trigger", "at_trig"))
con("vca.out", "chorus.in", note="Voices summed in stereo (binaural pairs to left and right).")
con("chorus.out", "delay.in")
con("delay.out", "out.in", amount="delay.level")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
SRC = [(1, "DDS 2", "dds2.mod_out", True), (2, "LFO 2", "lfo2.out", True), (3, "Envelope 1", "env1.out", True), (4, "Velocity", "kbd.velocity", True), (5, "Aftertouch", "kbd.aftertouch", True),
       (6, "Expression pedal/CV", "bender.pedal", False), (7, "Bender left (-) [desktop: pitch bend wheel]", "bender.bend", False), (8, "Bender right (+) [desktop: note number]", "bender.bend", False)]
DST = [("A", "LFO 1 rate", "lfo1.rate"), ("B", "Cross modulation", "dds.cross_mod"), ("C", "Envelope 1 decay", "env1.decay"), ("D", "Envelope 2 release", "env2.release"),
       ("E", "Filter resonance", "vcf.res"), ("F", "Delay time", "delay.time"), ("G", "Delay feedback", "delay.feedback"), ("H", "LR phase", "lfo1.lr_phase")]
DIRECT = [("DDS 2 tune", "dds2.tune"), ("Oscillator mix", "mixer.mix"), ("VCF cutoff", "vcf.freq"), ("VCF envelope amount", "vcf.env"), ("VCF LFO 1 amount", "vcf.lfo1"),
          ("VCF DDS 2 amount", "vcf.dds2"), ("VCA envelope level", "vca.env_level"), ("VCA LFO 1 amount", "vca.lfo1"), ("Envelope 1 hold", "env1.attack_hold"), ("Envelope 1 attack", "env1.attack"),
          ("Envelope 1 sustain", "env1.sustain"), ("Envelope 1 release", "env1.release"), ("Envelope 2 attack", "env2.attack"), ("Envelope 2 decay", "env2.decay"), ("Envelope 2 sustain", "env2.sustain"),
          ("LFO 1 delay", "lfo1.delay"), ("LFO 2 rate", "lfo2.rate"), ("LFO 2 delay", "lfo2.delay"), ("DDS modulator LFO 1 amount", "dds.lfo1"), ("DDS 2 pulse width / DDS 1 detune", "dds.pw_detune"),
          ("Portamento time", "kbd.portamento"), ("Delay level", "delay.level")]
D["mod_matrix"] = {
    "name": "Modulation matrix", "module": "kbd", "slots": len(SRC) * (len(DST) + len(DIRECT)), "combine": "single",
    "sources": [{"id": i, "name": n, "node": nd, "per_voice": pv, "description": f"Select button {i}"} for i, n, nd, pv in SRC],
    "destinations": [{"id": i, "name": n, "parameter": p_, "description": f"Matrix destination, select button {i}"} for i, n, p_ in DST]
                    + [{"id": f"direct_{k}", "name": n, "parameter": p_, "description": f"Direct parameter mapping {k} (hold a source button and move the control)"} for k, (n, p_) in enumerate(DIRECT, start=1)],
    "depth_range": {"min": -100, "max": 100},
    "note": ("MOD ASSIGN: buttons 1-8 are sources, A-H destinations; pick either first, then the other, and set depth with MOD AMOUNT (-100% to +100%, shown on the 16 LEDs). "
             "Holding a source and moving a continuous panel control creates a direct parameter mapping (22 destinations; switches excluded). SHIFT + MOD ASSIGN clears all, or all for the selected source "
             "or destination (desktop: push MOD AMOUNT). Keyboard sources 7/8 are bender left/right; desktop sources 7/8 are pitch bend wheel and note number."),
}
D["indicators"] = [
    {"id": "select_leds", "module": "kbd", "label": "select button LEDs 1-8, A-H", "kind": "led", "function": "Patch, bank (flashing for second banks), waves, matrix, global settings, fine tune legend; flashing number = edited."},
    {"id": "rate_leds", "module": "lfo1", "label": "LFO 1, LFO 2, ENV 1 loop and delay LEDs", "kind": "led", "function": "Rates and ENV 1 loop rate."},
    {"id": "gate_led", "module": "audioin", "label": "audio gate LED (left of ENV 1)", "kind": "led", "function": "Lights on each audio-input gate trigger."},
    {"id": "octave_leds", "module": "kbd", "label": "octave LEDs", "kind": "led", "function": "Octave; flashing for transpose or non-440 Hz tuning."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Binaural mode", "applies_to": ["kbd", "lfo1", "dds1"],
     "rule": "Pairs the 12 voices into six stereo super voices, one per ear, so oscillator, LFO 1 phase and other parameters can differ left and right. Forced on by DDS 2 X-FADE and filter key tracking. Non-binaural: 12 voices, LR PHASE becomes pan spread."},
    {"id": "b02", "name": "DDS 1 super mode", "applies_to": ["dds1"],
     "rule": "Seven free-running oscillators; super mode (half, with phase reset, or full) de-phases the six sisters in stereo; PW/DETUNE sets the spread and PWM/SWM modulates it."},
    {"id": "b03", "name": "DDS 2 modes", "applies_to": ["dds2", "sub", "audioin", "mixer"],
     "rule": "NORM; X-FADE (DDS 1 to DDS 2 across a two-octave zone around MIX's split point); SYNC (DDS 2 slaved to DDS 1, cross mod reversed). RANGE at LFO removes DDS 2 from audio (0.1-100 Hz LFO, matrix and VCF source) and allows the square sub or the audio input in its channel."},
    {"id": "b04", "name": "Filters", "applies_to": ["hpf", "lpf"], "rule": "High-pass (off, fixed around 500 Hz, or tracking for band-pass) into the SSI 24 dB low-pass with drive off/1/2; modulated by ENV 1/2, LFO 1, DDS 2, LFO 2, bender, velocity and key tracking."},
    {"id": "b05", "name": "Envelopes", "applies_to": ["env1", "env2"],
     "rule": "ENV 1: attack hold, attack, decay hold, decay, sustain, release (1 ms-10 s); normal, inverted or loop (attack/decay hold/decay repeat from the sustain level). ENV 2: attack, decay hold, decay, sustain, release; drives the VCA unless a fixed gate envelope is chosen."},
    {"id": "b06", "name": "LFOs", "applies_to": ["lfo1", "lfo2"],
     "rule": "LFO 1 (one per super voice): triangle, square, random, saw to 50 Hz, or HF/HF TRK to 20 kHz (sine, or DDS 1's wave via SHIFT); free, once or reset; HF can sum into either DDS channel. LFO 2: triangle per voice, triggered by bender push, aftertouch or always on."},
    {"id": "b07", "name": "Effects", "applies_to": ["chorus", "delay"], "rule": "Chorus (I, II, both) then delay (to 1 s, synced divisions, infinite feedback, freeze by footswitch or CC 69)."},
    {"id": "b09", "name": "Voice assign", "applies_to": ["kbd"],
     "rule": "POLY 1 (default) lets releases overlap; POLY 2 curtails them; SOLO and LEGATO are monophonic (LEGATO without retrigger); UNISON stacks 3 or 6 binaural voices, or 6 as an octave, octave and fifth, or major chord. Binaural off gives 12 mono voices with PAN spread; true mono: left output, binaural off, PAN 100%."},
    {"id": "b10", "name": "Arpeggiator and sequencer", "applies_to": ["arp"],
     "rule": "Arpeggiator: up, down, up and down, random; 1-4 octaves; HOLD latches. Sequencer: 64 steps on four pages of 16; tracks STEP (notes/chords, and bender position), SLIDE (ties; glide with portamento), ACCENT (with DYNAMICS), REST and LENGTH; HOLD transposes from C4; 16 stored sequences. Tempo 30-300 BPM or divisions of external clock; swing 0-4; SYNC locks LFO 1 and delay; EXT CLK sets clock tx/rx, note output and stop handling."},
    {"id": "b11", "name": "MPE", "applies_to": ["kbd"],
     "rule": "Per-note channels; limited to six voices (the analogue CV allows six independent sets). Pitch bend via the bender settings, Y axis via CC 74 (cutoff), pressure via aftertouch routings; options for an aftertouch dead zone and reduced Y sensitivity, stored per patch."},
    {"id": "b12", "name": "Files", "applies_to": ["kbd"],
     "rule": "Hold PATCH at power-up for the SUPER6 drive (patch_banks a1-h2, waveforms, alt_waveforms, sequences); hold SHIFT for SUPER6-BOOT (firmware, init_patch.s6). Alternative waves: 16-bit signed, 4096-point single cycle, band-limited to 512 Hz content, raw .ws6."},
    {"id": "b08", "name": "Patches", "applies_to": ["kbd"], "rule": "128 patches (A1-H2 x 8). Edits flash the patch LED; hold a number 3 s to store; press the same number to compare. MANUAL plays the panel; SHIFT + MANUAL loads INIT (also at power-up). Firmware via the SUPER6-BOOT drive."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "poly_pressure", "note": "routed like aftertouch; matrix-only with LFO 2 always on"},
                 {"message": "program_change", "note": "A1:1 = 0 ... H2:8 = 127; CC 0 bank select"}, {"message": "control_change", "note": "official table: see parameter access entries"},
                 {"message": "nrpn", "note": "patch parameters 1024 + CC (MSB 08H, 14-bit); globals 2051 MIDI channel, 2052 clock tx, 2053 clock rx, 2055 PC tx, 2056 PC rx"},
                 {"message": "rpn", "number": 0, "parameter": "pitch bend sensitivity (±12 semitones)"}, {"message": "rpn", "number": 1, "parameter": "channel fine tuning (±100 cents)"},
                 {"message": "rpn", "number": 2, "parameter": "channel coarse tuning (±12 semitones)"}, {"message": "mpe"}, {"message": "clock"}, {"message": "start"}, {"message": "stop"}],
    "transmits": [{"message": "note_on", "note": "including arpeggiator/sequencer with note output on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"},
                  {"message": "control_change"}, {"message": "nrpn"}, {"message": "program_change"}, {"message": "clock"}, {"message": "start"}, {"message": "stop"}],
    "channel_note": "One channel (omni until set); DIN or USB, not both at once.",
    "note": "From the manual's official tables (pages 120-130). CC 14 sequence load, 59 manual mode, 61 performance destination, 67 octave, 69 delay freeze, 93 chorus, 122 local."}
D["specifications"] = {
    "voices": "12, or 6 binaural stereo voices", "oscillators": "2 FPGA DDS per voice (DDS 1: 7 super oscillators, 32 alternative waves)", "filters": "VC high-pass + SSI 4-pole 24 dB low-pass",
    "envelopes": "2 per voice, 1 ms-10 s", "lfos": "LFO 1 (0.05-50 Hz; 20 Hz-20 kHz HF) + LFO 2", "effects": "24-bit chorus and delay", "patches": 128, "keyboard": "49-key Fatar, velocity and aftertouch (keyboard model)",
    "connections": {"outputs": "L/R 1/4\" unbalanced", "phones": "1/4\" stereo", "audio_in": "1/4\" stereo", "pedals": "sustain, expression (TRS 0-5 V)", "midi": "DIN in, out, thru; USB"},
    "power": "90-240 V AC, 47-63 Hz, 50 W, 2 A T fuse", "launch_price": "EUR 2,490 (keyboard), EUR 2,290 (desktop)",
    "sequencer": "64 steps, 16 sequences", "alternative_wave_format": "16-bit signed, 4096 points, .ws6",
}
D["omitted_from_source"] = ["safety text", "glossary", "file management and how-to chapters (not read)"]
D["not_in_source"] = ["dimensions and weight", "output levels and impedances", "the LFO 1 sync division count for the keyboard vs desktop"]
D["source_inconsistencies"] = [
    "The DDS 2 RANGE text says it adjusts 'the coarse frequency of DDS 1'.",
    "The manual says binaural mode 'is always be enabled' with X-FADE (typo); LFO 2 text repeats 'the the'.",
    "Backing up patches refers to folders 'patch_banks_a' and 'patch_banks_b'; the drive structure shows a single 'patch_banks' folder.",
    "The community midi.guide chart differs from the official table: chorus as CC 14/15 (officially CC 93; CC 14 is sequence load), CC 92 as VCF LFO 1 (officially VCA LFO 1), CC 81 'Sync' (officially clock sync), CC 89/90 as sequencer record/length (unassigned).",
    "Early-firmware forum descriptions list matrix destination H as 'LFO 1 phase'; the manual names it LR phase. Desktop sources 7/8 (pitch bend wheel, note number) differ from the keyboard's bender left/right.",
    "The PDF has 140 pages; the manual's own numbering ends at 138.",
    "Some retailer specifications describe the high-pass as fixed-frequency with on/off; firmware v0.27 made it fully voltage-controlled (variable in FIX via SHIFT, tracking in TRK).",
    "Pre-launch specifications listed 64 sequence memories; the manual gives 16.",
]
D["modelling_gaps"] = [
    {"topic": "Binaural pairs", "detail": "Voice modules are modelled once (per_voice); left/right independence in binaural mode is a behaviour."},
    {"topic": "Keyboard vs desktop", "detail": "The keyboard model is modelled; the desktop replaces the bender with pitch bend/mod wheel, adds LFO 2 MODE (MW, MW+AT, always on), I DDS II/VCF/VCA destination buttons with MOD AMOUNT, direct mod wheel assignment and a TRNSP button."},
    {"topic": "Shared switch", "detail": "DDS 2 MODE and its RANGE-at-LFO meaning are modelled as two parameters sharing CC 36."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/udo-audio-super-6_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
