#!/usr/bin/env python3
"""Assemble the Novation Peak device file (schema 0.12.0).

Eight-voice hybrid polysynth: three digital (NCO) oscillators per voice with shape and
60 wavetables, noise and ring mod into an analogue mixer, pre-filter overdrive, analogue
multimode filter, post-filter drive, VCA, then analogue distortion on the voice sum and
digital chorus, delay and reverb. Four LFOs, three DAHDSR envelopes, a 16-slot mod matrix
with two sources per slot, and a 4-slot FX mod matrix. A desktop module: no keyboard.

Source: Novation's online Peak user guide (in detail, hardware overview, appendix).
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []
BASE = "https://userguides.novationmusic.com/hc/en-gb/articles/"


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory, access, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    p["access"] = access
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def acc(control=None, midi=None, menu=None, note=None):
    a = []
    if control:
        a.append({"type": "panel", "control": control, **({"note": note} if note else {})})
    if menu:
        a.append({"type": "menu", "note": menu})
    if midi:
        a.append({"type": "midi", "message": midi})
    return a


def ev(v):
    return [{"value": x} for x in v]


def jack(id, label, direction, signal, node, fn, connector, location="rear", **kw):
    j = {"id": id, "label": label, "location": location, "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
    j.update(kw)
    J.append(j)


def con(frm, to, signal="cv", when=None, **kw):
    if isinstance(signal, dict):
        signal, when = "cv", signal
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


D["device"] = {
    "id": "novation-peak", "manufacturer": "Novation", "model": "Peak",
    "category": "8-voice hybrid polyphonic synthesizer (digital oscillators, analogue filters and VCAs), desktop",
    "based_on": "Original design, 2017; the Summit is two Peak engines with a keyboard.",
    "sources": [
        {"id": "guide_detail", "title": "Novation, 'Novation Peak in detail' (online user guide)", "kind": "user_manual", "file": BASE + "25494693870354-Novation-Peak-in-detail",
         "note": "Oscillators, LFOs, mixer, envelopes, filter, mod matrix, voices, arpeggiator, effects, settings (read up to the pedal pages)."},
        {"id": "guide_hardware", "title": "Novation, 'Peak hardware overview'", "kind": "user_manual", "file": BASE + "25494651161362-Peak-hardware-overview",
         "note": "Every top panel control (61 callouts) and the rear panel."},
        {"id": "guide_appendix", "title": "Novation, 'Peak appendix'", "kind": "user_manual", "file": BASE + "25494651392146-Peak-appendix",
         "note": "Sync tables, 60 wavetables, init patch, mod matrix and FX matrix sources and destinations, full CC/NRPN list."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 8, "polyphony_mode": "8-voice polyphonic (Poly, Poly2) or monophonic (Mono, MonoLG, Mono2); unison 1-8",
    "poly_chain_max_units": None, "patch_memory": True, "patch_memory_note": "Patches in banks (Banks C and D initially Init patches); FX saved with the patch; 16 tuning tables and user wavetables.",
    "semi_modular": False, "panel_counts": {"keys": 0, "display_rows": 4, "display_characters": 20, "voice_leds": 8},
    "summary": ("Per voice: three NCO oscillators (sine, triangle, saw, pulse or one of 60 five-wave wavetables) with shape, virtual sync and saw density; noise with "
                "its own low and high-pass filters; ring mod of Osc 1 x Osc 2; an analogue mixer and VCA gain; pre-filter overdrive; an analogue LP/BP/HP 12/24 dB filter; "
                "post-filter drive; and a VCA. Three DAHDSR envelopes, two per-voice LFOs and two global LFOs. Then analogue distortion on all eight voices and digital chorus, "
                "delay and reverb in any order or parallel. A 16-slot mod matrix multiplies two sources per slot; a 4-slot FX matrix modulates the effects. Two Animate buttons, CV mod input, two pedal inputs."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Voice assigner (MIDI)", "VOICE", "Receives MIDI notes (no keyboard) and allocates eight voices: poly, mono or unison, with glide and pre-glide. AUDITION plays middle C.",
    ["kbd.midi_in", "kbd.sustain"], ["kbd.pitch", "kbd.gate", "kbd.velocity"], scope="common", props={"voices": 8})
mod("ctrl", "manual_controller", "Performance controls", "ANIMATE / rear panel", "Animate 1 and 2 (momentary, with Hold), expression pedals, CV mod input, and MIDI mod wheel, aftertouch and bend as matrix sources.",
    ["ctrl.pedal1", "ctrl.pedal2", "ctrl.cv_in"], ["ctrl.animate1", "ctrl.animate2", "ctrl.expr1", "ctrl.expr2", "ctrl.cv"], scope="common")
mod("arp", "arpeggiator", "Arpeggiator", "ARP", "Up, down, up-down 1/2, played, random or chord; 33 rhythms; 1-6 octaves; swing; chance; synced to the internal clock (40-240 BPM) or MIDI/USB.",
    [], ["arp.notes"], scope="common", props={"rhythms": 33, "tempo_bpm": [40, 240]})
for n in (1, 2, 3):
    o = f"osc{n}"
    mod(o, "oscillator", f"Oscillator {n}", f"OSCILLATOR {n}", "NCO oscillator: sine, triangle, saw, pulse or 'more' (60 wavetables of five waves). Shape amount from manual, Mod Env 1 and LFO 1 at once; virtual sync; saw density.",
        [f"{o}.pitch_cv", f"{o}.shape_cv"], [f"{o}.out"], props={"wavetables": 60})
mod("noise", "noise", "Noise", "MIXER", "Noise generator with its own low-pass and high-pass filters (NoiseLPF, NoiseHPF).", [], ["noise.out"])
mod("ring", "ring_modulator", "Ring modulator", "MIXER", "Osc 1 x Osc 2.", ["ring.a", "ring.b"], ["ring.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Five-into-one analogue mixer (Osc 1-3, Ring 1*2, Noise); VCA GAIN sets its output into the envelope stage.",
    ["mixer.osc1", "mixer.osc2", "mixer.osc3", "mixer.ring", "mixer.noise"], ["mixer.out"])
mod("drive", "overdrive", "Overdrive", "FILTER", "Pre-filter analogue overdrive.", ["drive.in"], ["drive.out"])
mod("vcf", "filter", "Filter", "FILTER", "Analogue LP, BP or HP at 12 or 24 dB/oct, with resonance, key tracking (1:1 at 127), envelope, LFO 1 and Osc 3 modulation (up to eight octaves).",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"shapes": ["LP", "BP", "HP"], "slopes_db_per_oct": [12, 24]})
mod("postdrive", "overdrive", "Filter post drive", "VOICE menu", "Per-voice distortion after the filter, before the VCA, so it does not change with the amp envelope.", ["postdrive.in"], ["postdrive.out"])
mod("vca", "vca", "VCA", "AMP ENVELOPE", "Per-voice analogue VCA under the amp envelope.", ["vca.in", "vca.cv"], ["vca.out"])
for e, nm, sec in (("env_amp", "Amp envelope", "AMP ENVELOPE"), ("env_m1", "Mod envelope 1", "MOD ENVELOPES"), ("env_m2", "Mod envelope 2", "MOD ENVELOPES")):
    mod(e, "envelope", nm, sec, "DAHDSR: attack to 18 s, decay to 22 s, release to 24 s; delay to 10 s and hold to 500 ms in the menu; velocity, legato or re-trigger, looping repeats.",
        [f"{e}.gate", f"{e}.velocity"], [f"{e}.out"], props={"attack_s_max": 18, "decay_s_max": 22, "release_s_max": 24, "delay_s_max": 10, "hold_s_max": 0.5})
for n in (1, 2):
    mod(f"lfo{n}", "lfo", f"LFO {n}", f"LFO {n}", "Per-voice LFO: triangle, falling saw, square or S&H; Low (0-200 Hz), High (0-1.6 kHz) or Sync; fade in/out or gate, phase, slew, repeats, common sync.",
        [f"lfo{n}.reset"], [f"lfo{n}.out"], props={"rate_hz": {"low": [0, 200], "high": [0, 1600]}})
for n in (3, 4):
    mod(f"lfo{n}", "lfo", f"LFO {n}", "LFO menu", "Global LFO (menu only): triangle, saw, square or random S&H, free or synced; a matrix and FX matrix source.", [], [f"lfo{n}.out"], scope="common")
mod("dist", "overdrive", "Distortion", "EFFECTS", "Analogue distortion on the sum of all eight voices, after the VCAs.", ["dist.in"], ["dist.out"], scope="common")
mod("fx", "effects", "Digital effects", "EFFECTS", "Chorus (3 types; chorus, flanger, phlanger modes), delay (to 1.4 s, sync, ping-pong ratios, time modes) and reverb (3 sizes), parallel or in any series order; wet/dry; bypass.",
    ["fx.in"], ["fx.out"], scope="common")
mod("out", "output", "Output", "MASTER", "Stereo outputs and headphones; VOLUME sets both.", ["out.in"], ["out.left", "out.right", "out.phones"], scope="common")

# ---------------------------------------------------------------- oscillators
OSC_CC = {1: dict(rng="CC 3", coarse="CC 14:46", fine="CC 15:47", menv2="CC 9", lfo2="CC 16:48", wave="NRPN 0:14", more="NRPN 0:15", src="NRPN 0:16", man="CC 12", m1="CC 119", l1="CC 33",
                  vs="CC 34", sd="NRPN 0:17", dd="NRPN 0:18", fx="NRPN 0:19", bend="NRPN 0:20"),
          2: dict(rng="CC 37", coarse="CC 17:49", fine="CC 18:50", menv2="CC 38", lfo2="CC 19:51", wave="NRPN 0:23", more="NRPN 0:24", src="NRPN 0:25", man="CC 39", m1="CC 40", l1="CC 41",
                  vs="CC 42", sd="NRPN 0:26", dd="NRPN 0:27", fx="NRPN 0:28", bend="NRPN 0:29"),
          3: dict(rng="CC 65", coarse="CC 20:52", fine="CC 21:53", menv2="CC 43", lfo2="CC 22:54", wave="NRPN 0:32", more="NRPN 0:33", src="NRPN 0:34", man="CC 71", m1="CC 72", l1="CC 73",
                  vs="CC 44", sd="NRPN 0:35", dd="NRPN 0:36", fx="NRPN 0:37", bend="NRPN 0:38")}
for n, c in OSC_CC.items():
    o = f"osc{n}"
    menu = f"OSC menu, Osc {n} pages"
    par(f"{o}.range", o, "RANGE", "enum", "Footage; 8' is concert pitch.", "patch", acc("push_button", c["rng"]), values=ev(["16'", "8'", "4'", "2'"]), default="8'")
    par(f"{o}.coarse", o, "COARSE", "continuous", "Pitch ±1 octave.", "patch", acc("knob", c["coarse"]), physical={"min": -12, "max": 12, "unit": "semitones"})
    par(f"{o}.fine", o, "FINE", "continuous", "Pitch ±100 cents.", "patch", acc("knob", c["fine"]), physical={"min": -100, "max": 100, "unit": "cents"})
    par(f"{o}.wave", o, "WAVE", "enum", "Waveform, or 'more' for the selected wavetable.", "patch", acc("push_button", c["wave"]), values=ev(["sine", "triangle", "saw", "pulse", "more"]), default="saw")
    par(f"{o}.menv2_depth", o, "MOD ENV 2 DEPTH (pitch)", "integer", "Mod Env 2 on pitch; 30 = one octave at full envelope.", "patch", acc("knob", c["menv2"]), range={"min": -63, "max": 63})
    par(f"{o}.lfo2_depth", o, "LFO 2 DEPTH (pitch)", "integer", "LFO 2 on pitch, finer near zero; up to five octaves.", "patch", acc("knob", c["lfo2"]), range={"min": -127, "max": 127})
    par(f"{o}.shape_source", o, "SOURCE (shape)", "enum", "Which shape amount the SHAPE AMOUNT knob edits; all three act together.", "patch", acc("push_button", c["src"]),
        values=ev(["manual", "mod_env1", "lfo1"]), default="manual")
    par(f"{o}.shape_manual", o, "SHAPE AMOUNT (manual)", "integer", "Pulse width, wavefolding on sine/triangle/saw, or position across the wavetable's five waves.", "patch",
        acc("knob", c["man"], note="SOURCE at MANUAL"), range={"min": -64, "max": 63})
    par(f"{o}.shape_menv1", o, "SHAPE AMOUNT (Mod Env 1)", "integer", "Mod Env 1 on shape.", "patch", acc("knob", c["m1"], note="SOURCE at MOD ENV 1"), range={"min": -64, "max": 63})
    par(f"{o}.shape_lfo1", o, "SHAPE AMOUNT (LFO 1)", "integer", "LFO 1 on shape.", "patch", acc("knob", c["l1"], note="SOURCE at LFO 1"), range={"min": -64, "max": 63})
    par(f"{o}.wave_more", o, "WaveMore", "enum", "Wavetable used by 'more' (60 factory, plus user wavetables).", "patch", acc(menu=menu, midi=c["more"]), values=ev(["60 wavetables"]), default="60 wavetables",
        note="BS Sine, Random, Zing, Tubey, Octaves, Wobbler, Chords, Didgery, Harsh, Organ, E. Piano, VoxOooEe, VoxYahEe, Winds, SoftClav, String, BassOrgn, Acid, Buzzy, Carousel, Choral, Climbing, CoinFlip, Deep, Dub, Eee, Eris, Flame, Further, GlassSaw, Glassy, Granular, Grime, Drow, Heavy, Hedge, Hungry, Ladders, Lead, Modeling, Modem, Monster, Screech, SeaBase, Shmorgan, Sprials, Steel, Sunrise, Swell, Thicker, Thinner, Tides, Tokyo, Tops, V.Chord, Variance, Vocaloid, Vowelled, WeirdVox, Yeah.")
    par(f"{o}.vsync", o, "VSync", "integer", "Virtual-oscillator sync; multiples of 16 step up the harmonic series.", "patch", acc(menu=menu, midi=c["vs"]), range={"min": 0, "max": 127}, default=0)
    par(f"{o}.saw_density", o, "SawDense", "integer", "Adds two virtual copies of a saw for thickness.", "patch", acc(menu=menu, midi=c["sd"]), range={"min": 0, "max": 127}, default=0)
    par(f"{o}.density_detune", o, "DenseDet", "integer", "Detunes the density copies.", "patch", acc(menu=menu, midi=c["dd"]), range={"min": 0, "max": 127}, default=64)
    par(f"{o}.fixed_note", o, "FixedNote", "enum", "Off, or a fixed pitch for every key (C-2 to D#5).", "patch", acc(menu=menu, midi=c["fx"]), values=ev(["off", "C-2..D#5"]), default="off")
    par(f"{o}.bend_range", o, "BendRange", "integer", "Pitch bend range in semitones; negative reverses.", "patch", acc(menu=menu, midi=c["bend"]), range={"min": -24, "max": 24}, default=12)
for pid, label, fn, nr, dflt in (("osc.diverge", "Diverge", "Fixed small pitch differences across all 24 oscillators.", "NRPN 0:9", 0),
                                 ("osc.drift", "Drift", "Slow meandering detune from a dedicated LFO.", "NRPN 0:10", 0),
                                 ("noise.lpf", "NoiseLPF", "Noise low-pass filter; 127 fully open.", "NRPN 0:11", 127),
                                 ("noise.hpf", "NoiseHPF", "Noise high-pass filter; 0 fully open.", "NRPN 0:12", 0)):
    par(pid, "noise" if pid.startswith("noise") else "osc1", label, "integer", fn, "patch", acc(menu="OSC menu, common pages", midi=nr), range={"min": 0, "max": 127}, default=dflt)
par("osc.key_sync", "osc1", "KeySync", "boolean", "Oscillators restart their cycle on each note.", "patch", acc(menu="OSC menu, common pages"), default=False)
par("osc.tuning_table", "kbd", "TuningTable", "integer", "0 standard (fixed), 1-16 user tables.", "patch", acc(menu="OSC menu, common pages"), range={"min": 0, "max": 16}, default=0)
# mixer
for src, label, cc, dflt in (("osc1", "OSC 1", "CC 23:55", 255), ("osc2", "OSC 2", "CC 24:56", 0), ("osc3", "OSC 3", "CC 25:57", 0), ("ring", "RING 1*2", "CC 26:58", 0), ("noise", "NOISE", "CC 27:59", 0)):
    par(f"mixer.{src}", "mixer", label, "integer", f"{label} level.", "patch", acc("knob", cc), range={"min": 0, "max": 255}, default=dflt)
par("mixer.vca_gain", "mixer", "VCA GAIN", "integer", "Mixer output level into the envelope/VCA stage; lower it to avoid clipping.", "patch", acc("knob", "NRPN 0:42"), range={"min": 0, "max": 127}, default=127)
# filter
par("vcf.shape", "vcf", "SHAPE", "enum", "Filter type.", "patch", acc("push_button", "NRPN 0:46"), values=ev(["LP", "BP", "HP"]), default="LP")
par("vcf.slope", "vcf", "SLOPE", "enum", "dB per octave.", "patch", acc("push_button", "NRPN 0:45"), values=ev(["12", "24"]), default="24")
par("vcf.frequency", "vcf", "FREQUENCY", "integer", "Cutoff (LP/HP) or centre (BP).", "patch", acc("knob", "CC 29:61"), range={"min": 0, "max": 255}, default=255)
par("vcf.resonance", "vcf", "RESONANCE", "integer", "Emphasis at the frequency; raises level.", "patch", acc("knob", "CC 79"), range={"min": 0, "max": 127}, default=0)
par("drive.amount", "drive", "OVERDRIVE", "integer", "Pre-filter overdrive.", "patch", acc("knob", "CC 80"), range={"min": 0, "max": 127}, default=0)
par("vcf.env_source", "vcf", "SOURCE (filter env)", "enum", "Which envelope ENV DEPTH edits; both can act together.", "patch", acc("push_button", "NRPN 0:47"), values=ev(["mod_env1", "amp_env"]), default="mod_env1")
par("vcf.menv1_depth", "vcf", "ENV DEPTH (Mod Env 1)", "integer", "Mod Env 1 on frequency.", "patch", acc("knob", "CC 78", note="SOURCE at MOD ENV 1"), range={"min": -63, "max": 63})
par("vcf.ampenv_depth", "vcf", "ENV DEPTH (Amp Env)", "integer", "Amp envelope on frequency.", "patch", acc("knob", "CC 77", note="SOURCE at AMP ENV"), range={"min": -63, "max": 63})
par("vcf.lfo1_depth", "vcf", "LFO 1 DEPTH (filter)", "integer", "LFO 1 on frequency.", "patch", acc("knob", "CC 28:60"), range={"min": -127, "max": 127})
par("vcf.osc3_mod", "vcf", "OSC 3 FILTER MOD", "integer", "Osc 3 modulates frequency at audio rate.", "patch", acc("knob", "CC 76"), range={"min": 0, "max": 127}, default=0)
par("vcf.key_tracking", "vcf", "KEY TRACKING", "integer", "Keyboard tracking; 127 is 1:1.", "patch", acc("knob", "CC 75"), range={"min": 0, "max": 127}, default=127)
par("postdrive.amount", "postdrive", "FltPostDrv", "integer", "Per-voice post-filter, pre-VCA distortion.", "patch", acc(menu="VOICE menu page 4", midi="CC 36"), range={"min": 0, "max": 127}, default=0)
par("vcf.diverge", "vcf", "FltDiverge", "integer", "Fixed per-voice filter detune, like poor calibration.", "patch", acc(menu="VOICE menu page 4", midi="NRPN 0:48"), range={"min": 0, "max": 127}, default=0)
# envelopes
ENV_CC = {"env_amp": dict(a="CC 86", d="CC 87", s="CC 88", r="CC 89", vel="NRPN 0:55", trig="NRPN 0:56", adef=2, ddef=90, sdef=127, rdef=40, trigdef="legato"),
          "env_m1": dict(a="CC 90", d="CC 91", s="CC 92", r="CC 93", vel="NRPN 0:60", trig="NRPN 0:61", adef=2, ddef=75, sdef=35, rdef=45, trigdef="retrig"),
          "env_m2": dict(a="CC 94", d="CC 95", s="CC 117", r="CC 103", vel="NRPN 0:64", trig="NRPN 0:65", adef=2, ddef=75, sdef=35, rdef=45, trigdef="retrig")}
for e, c in ENV_CC.items():
    lab = {"env_amp": "AMP", "env_m1": "MOD 1", "env_m2": "MOD 2"}[e]
    note = None if e == "env_amp" else f"Mod envelope sliders with SELECT at {lab}"
    par(f"{e}.attack", e, f"{lab} ATTACK", "integer", "Attack, up to over 18 s.", "patch", acc("fader", c["a"], note=note), range={"min": 0, "max": 127}, default=c["adef"])
    par(f"{e}.decay", e, f"{lab} DECAY", "integer", "Decay to sustain, up to about 22 s.", "patch", acc("fader", c["d"], note=note), range={"min": 0, "max": 127}, default=c["ddef"])
    par(f"{e}.sustain", e, f"{lab} SUSTAIN", "integer", "Sustain level.", "patch", acc("fader", c["s"], note=note), range={"min": 0, "max": 127}, default=c["sdef"])
    par(f"{e}.release", e, f"{lab} RELEASE", "integer", "Release, up to over 24 s, non-linear.", "patch", acc("fader", c["r"], note=note), range={"min": 0, "max": 127}, default=c["rdef"])
    par(f"{e}.velocity", e, f"{lab} Velocity", "integer", "Velocity sensitivity of the envelope's effect.", "patch", acc(menu="ENV menu", midi=c["vel"]), range={"min": -64, "max": 63}, default=0)
    par(f"{e}.mono_trig", e, f"{lab} MonoTrig", "enum", "Legato (mono modes only) or re-trigger.", "patch", acc(menu="ENV menu", midi=c["trig"]), values=ev(["legato", "retrig"]), default=c["trigdef"])
    par(f"{e}.delay", e, f"{lab} Delay", "integer", "Delay before attack, to 10 s (85 is about 1 s).", "patch", acc(menu="ENV menu"), range={"min": 0, "max": 127}, default=0)
    par(f"{e}.hold", e, f"{lab} HoldTime", "integer", "Hold at peak, to 500 ms.", "patch", acc(menu="ENV menu"), range={"min": 0, "max": 127}, default=0)
    par(f"{e}.repeats", e, f"{lab} Repeats", "enum", "With LOOP on: attack-hold-decay repeats 1-126 times, or continuously (On).", "patch", acc(menu="ENV menu"), values=ev(["1..126", "on"]), default="on")
    par(f"{e}.loop", e, f"{lab} LOOP", "boolean", "Enables envelope looping.", "patch", acc("push_button"), default=False)
par("env.select", "env_m1", "SELECT (mod env)", "enum", "Which mod envelope the sliders edit.", "patch", acc("push_button", "NRPN 0:59"), values=ev(["mod1", "mod2"]), default="mod1")
# LFOs
LFO_CC = {1: dict(rng="NRPN 0:68", rate="CC 30:62", sync="CC 81", wave="NRPN 0:69", phase="NRPN 0:70", slew="NRPN 0:71", fade="CC 82", fmode="NRPN 0:72", oneshot="NRPN 0:75", common="NRPN 0:76"),
          2: dict(rng="CC 83", rate="CC 31:63", sync="CC 84", wave="NRPN 0:78", phase="NRPN 0:79", slew="NRPN 0:80", fade="CC 85", fmode="NRPN 0:81", oneshot="NRPN 0:84", common="NRPN 0:85")}
for n, c in LFO_CC.items():
    l = f"lfo{n}"
    m_ = f"LFO menu, LFO {n} pages"
    par(f"{l}.type", l, f"LFO {n} TYPE", "enum", "Waveform.", "patch", acc("push_button", c["wave"]), values=ev(["triangle", "saw_down", "square", "sample_hold"]), default="triangle")
    par(f"{l}.range", l, f"LFO {n} RANGE", "enum", "Low (0-200 Hz), High (0-1.6 kHz) or Sync.", "patch", acc("push_button", c["rng"]), values=ev(["low", "high", "sync"]), default="low")
    par(f"{l}.rate", l, f"LFO {n} RATE", "integer", "Rate, or sync division (35 values) in Sync.", "patch", acc("knob", c["rate"]), range={"min": 0, "max": 255})
    par(f"{l}.rate_sync", l, f"LFO {n} RateSync", "integer", "Sync division index (8 beats to 32nd triplet).", "patch", acc(midi=c["sync"]), range={"min": 0, "max": 34})
    par(f"{l}.fade_time", l, f"LFO {n} FADE TIME", "integer", "Fade or gate time per FadeMode.", "patch", acc("knob", c["fade"]), range={"min": 0, "max": 127}, default=0)
    par(f"{l}.fade_mode", l, f"LFO {n} FadeMode", "enum", "Fade in, fade out, gate in, gate out.", "patch", acc(menu=m_, midi=c["fmode"]), values=ev(["fade_in", "fade_out", "gate_in", "gate_out"]), default="fade_in")
    par(f"{l}.phase", l, f"LFO {n} Phase", "enum", "Free-running, or restart at 0-357 degrees on each note.", "patch", acc(menu=m_, midi=c["phase"]), values=ev(["free", "0..357"]), default="free")
    par(f"{l}.slew", l, f"LFO {n} Slew", "integer", "Rounds the waveform's edges.", "patch", acc(menu=m_, midi=c["slew"]), range={"min": 0, "max": 127}, default=0)
    par(f"{l}.repeats", l, f"LFO {n} Repeats", "enum", "Off or 1-127 cycles per trigger.", "patch", acc(menu=m_, midi=c["oneshot"]), values=ev(["off", "1..127"]), default="off",
        note="The MIDI chart calls this 'One Shot' with range 0-1.")
    par(f"{l}.common", l, f"LFO {n} Common", "boolean", "Same LFO phase for every voice (early analogue poly feel).", "patch", acc(menu=m_, midi=c["common"]), default=False)
    par(f"{l}.mono_trig", l, f"LFO {n} MonoTrig", "enum", "Mono modes: retrigger on legato notes or not.", "patch", acc(menu=m_), values=ev(["legato", "retrig"]), default="legato")
    par(f"{l}.fade_sync", l, f"LFO {n} FadeSync", "boolean", "Mono modes: restart fade on each note.", "patch", acc(menu=m_), default=True)
for n in (3, 4):
    l = f"lfo{n}"
    par(f"{l}.wave", l, f"L{n}Waveform", "enum", "Waveform.", "patch", acc(menu=f"LFO menu, LFO {n}"), values=ev(["triangle", "sawtooth", "square", "rand_sh"]), default="triangle")
    par(f"{l}.rate", l, f"L{n}Rate", "integer", "Rate (wider range than LFO 1/2).", "patch", acc(menu=f"LFO menu, LFO {n}"), range={"min": 0, "max": 127}, default=64)
    par(f"{l}.rate_sync", l, f"L{n}RateSync", "enum", "Off, or a sync division (overrides Rate).", "patch", acc(menu=f"LFO menu, LFO {n}"), values=ev(["off", "divisions"]), default="off")
# voice, glide
par("kbd.mode", "kbd", "Mode", "enum", "Voice mode.", "patch", acc(menu="VOICE menu page 3", midi="NRPN 0:2"), values=ev(["mono", "monolg", "mono2", "poly", "poly2"]), default="poly")
par("kbd.unison", "kbd", "Unison", "enum", "Voices per note.", "patch", acc(menu="VOICE menu page 1", midi="NRPN 0:3"), values=ev(["1", "2", "3", "4", "8"]), default="1")
par("kbd.unison_detune", "kbd", "UniDetune", "integer", "Detune between unison voices.", "patch", acc(menu="VOICE menu page 1", midi="NRPN 0:4"), range={"min": 0, "max": 127}, default=25)
par("kbd.spread", "kbd", "Spread", "integer", "Stereo spread of voices.", "patch", acc(menu="VOICE menu page 2", midi="NRPN 0:5"), range={"min": 0, "max": 127}, default=0)
par("kbd.spread_mode", "kbd", "SpreadMode", "enum", "How voices are panned.", "patch", acc(menu="VOICE menu page 2"), values=ev(["diverge", "alternate", "diverge2", "noteval"]), default="diverge")
par("kbd.pan_position", "kbd", "PanPosn", "integer", "Pan offset for the voices.", "patch", acc(menu="VOICE menu page 2"), range={"min": -64, "max": 63}, default=0)
par("kbd.octave", "kbd", "Keyboard octave", "integer", "Octave shift of incoming notes.", "patch", acc(midi="NRPN 0:6"), range={"min": -3, "max": 3}, default=0)
par("kbd.glide_time", "kbd", "GLIDE TIME", "integer", "Glide time (90 is about 1 s).", "patch", acc("knob", "CC 5"), range={"min": 0, "max": 127}, default=60)
par("kbd.glide_on", "kbd", "GLIDE ON", "boolean", "Glide on or off.", "patch", acc("push_button", "CC 35"), default=False)
par("kbd.pre_glide", "kbd", "PreGlide", "integer", "Each note starts up to an octave away and glides to pitch (needs GLIDE ON).", "patch", acc(menu="VOICE menu page 3", midi="NRPN 0:7"), range={"min": -12, "max": 12}, default=0)
par("out.patch_level", "out", "PatchLevel", "integer", "Patch trim: 0 halves, 127 doubles.", "patch", acc(menu="VOICE menu page 3", midi="NRPN 0:41"), range={"min": 0, "max": 127}, default=64)
# arp
par("arp.on", "arp", "ARP ON", "boolean", "Arpeggiator on.", "patch", acc("push_button", "NRPN 0:121"), default=False)
par("arp.key_latch", "arp", "KEY LATCH", "boolean", "Holds the arpeggio after release; new held keys add notes.", "patch", acc("push_button", "NRPN 0:122"), default=False)
par("arp.gate", "arp", "GATE", "integer", "Note length; 64 is half the step, 127 legato.", "patch", acc("knob", "CC 116"), range={"min": 0, "max": 127}, default=64)
par("arp.clock_rate", "arp", "ClockRate", "integer", "Internal tempo for arp, delay sync and LFO sync.", "patch", acc(menu="ARP/CLOCK menu page 1"), range={"min": 40, "max": 240}, default=120)
par("arp.type", "arp", "Type", "enum", "Note order.", "patch", acc(menu="ARP/CLOCK menu", midi="NRPN 0:117"), values=ev(["up", "down", "updown1", "updown2", "played", "random", "chord"]), default="up")
par("arp.rhythm", "arp", "Rhythm", "integer", "One of 33 rhythms.", "patch", acc(menu="ARP/CLOCK menu", midi="NRPN 0:118"), range={"min": 1, "max": 33}, default=1)
par("arp.octaves", "arp", "Octaves", "integer", "Octave range.", "patch", acc(menu="ARP/CLOCK menu", midi="NRPN 0:119"), range={"min": 1, "max": 6}, default=1)
par("arp.swing", "arp", "Swing", "integer", "50 straight.", "patch", acc(menu="ARP/CLOCK menu", midi="NRPN 0:120"), range={"min": 20, "max": 80}, default=50)
par("arp.sync_rate", "arp", "SyncRate", "integer", "Step length (8 beats to 32nd triplet).", "patch", acc(menu="ARP/CLOCK menu page 3", midi="NRPN 0:116"), range={"min": 0, "max": 18})
par("arp.key_sync", "arp", "KeySync", "boolean", "With Key Latch: new keys restart the pattern.", "patch", acc(menu="ARP/CLOCK menu", midi="NRPN 0:123"), default=False)
par("arp.chance", "arp", "ArpChance", "integer", "Probability of each step playing.", "patch", acc(menu="ARP/CLOCK menu"), range={"min": 10, "max": 100}, default=100, note="Percent; the text gives 0-100% then 10-100%.")
par("arp.clock_source", "arp", "Source", "enum", "Clock source.", "patch", acc(menu="ARP/CLOCK menu page 1"), values=ev(["auto", "internal", "ext_auto", "midi", "usb"]), default="auto",
    note="Listed as Auto in the clock text and Internal in the init patch table.")
# effects
par("dist.level", "dist", "DISTORTION LEVEL", "integer", "Analogue distortion on the voice sum.", "patch", acc("knob", "CC 104"), range={"min": 0, "max": 127}, default=0)
par("fx.bypass", "fx", "BYPASS", "boolean", "Bypasses chorus, delay and reverb (not distortion).", "patch", acc("push_button", "NRPN 0:88"), default=False)
par("fx.routing", "fx", "Routing", "enum", "Parallel or series order of the time-domain effects.", "patch", acc(menu="FX menu page 1", midi="NRPN 0:89"),
    values=ev(["parallel", "D>R>C", "D>C>R", "R>D>C", "R>C>D", "C>D>R", "C>R>D"]), default="parallel")
par("fx.wet", "fx", "WetLevel", "integer", "Effect return level.", "patch", acc(menu="FX menu page 1", midi="NRPN 0:44"), range={"min": 0, "max": 127}, default=127)
par("fx.dry", "fx", "DryLevel", "integer", "Dry level.", "patch", acc(menu="FX menu page 1", midi="NRPN 0:43"), range={"min": 0, "max": 127}, default=127)
for pid, label, kind, fn, ctl, midi, extra in (
        ("fx.chorus_level", "CHORUS LEVEL", "integer", "Chorus amount.", "knob", "CC 105", {"range": {"min": 0, "max": 127}, "default": 0}),
        ("fx.chorus_rate", "CHORUS RATE", "integer", "Chorus LFO rate.", "knob", "CC 118", {"range": {"min": 0, "max": 127}, "default": 20}),
        ("fx.chorus_type", "CHORUS TYPE", "enum", "2-tap, 4-tap or ensemble.", "push_button", "NRPN 0:111", {"values": ev(["1", "2", "3"]), "default": "2"}),
        ("fx.delay_time", "DELAY TIME", "integer", "Delay time, to about 1.4 s.", "knob", "CC 109", {"range": {"min": 0, "max": 127}, "default": 64}),
        ("fx.delay_sync", "DELAY SYNC", "boolean", "Syncs delay time to the clock.", "push_button", "NRPN 0:93", {"default": False}),
        ("fx.delay_feedback", "DELAY FEEDBACK", "integer", "Repeats; 64 gives 5-6 echoes.", "knob", "CC 110", {"range": {"min": 0, "max": 127}, "default": 64}),
        ("fx.delay_level", "DELAY LEVEL", "integer", "Echo level.", "knob", "CC 108", {"range": {"min": 0, "max": 127}, "default": 0}),
        ("fx.reverb_time", "REVERB TIME", "integer", "Decay time.", "knob", "CC 113", {"range": {"min": 0, "max": 127}, "default": 90}),
        ("fx.reverb_type", "REVERB TYPE", "enum", "Size preset 1-3 (RevSize 0, 64, 127).", "push_button", "NRPN 0:101", {"values": ev(["1", "2", "3"]), "default": "2"}),
        ("fx.reverb_level", "REVERB LEVEL", "integer", "Reverb amount.", "knob", "CC 112", {"range": {"min": 0, "max": 127}, "default": 0})):
    par(pid, "fx", label, kind, fn, "patch", acc(ctl, midi), **extra)
for pid, label, fn, midi, rng, dflt in (
        ("fx.chorus_depth", "Chorus Depth", "Chorus modulation depth.", "NRPN 0:112", (0, 127), 64), ("fx.chorus_feedback", "Chorus Feedback", "Feedback; low depth plus feedback flanges.", "CC 107", (-64, 63), 0),
        ("fx.chorus_lopass", "Chorus LoPass", "Chorus HF filter.", "NRPN 0:113", (0, 127), 90), ("fx.chorus_hipass", "Chorus HiPass", "Chorus LF filter.", "NRPN 0:114", (0, 127), 2),
        ("fx.delay_lp_damp", "Delay LP Damp", "Darkens later echoes.", "NRPN 0:95", (0, 127), 85), ("fx.delay_hp_damp", "Delay HP Damp", "Thins later echoes.", "NRPN 0:96", (0, 127), 0),
        ("fx.delay_slew", "Delay SlewRate", "Pitch-shift smoothing when TIME moves.", "NRPN 0:97", (0, 127), 32), ("fx.delay_width", "Delay Width", "Stereo width of echoes.", "NRPN 0:92", (0, 127), 127),
        ("fx.reverb_predelay", "Reverb PreDelay", "Up to about 0.5 s.", "NRPN 0:109", (1, 127), 40), ("fx.reverb_lp_damp", "Reverb LP Damp", "HF absorption.", "NRPN 0:102", (0, 127), 50),
        ("fx.reverb_hp_damp", "Reverb HP Damp", "LF absorption.", "NRPN 0:103", (0, 127), 1), ("fx.reverb_size", "RevSize", "Space size.", "NRPN 0:104", (0, 127), 64),
        ("fx.reverb_mod_depth", "Reverb ModDepth", "Reverb modulation depth.", "NRPN 0:105", (0, 127), 64), ("fx.reverb_mod_rate", "Reverb ModRate", "Reverb modulation rate.", "NRPN 0:106", (0, 127), 4),
        ("fx.reverb_lopass", "Reverb LoPass", "Reverb HF EQ.", "NRPN 0:107", (0, 127), 74), ("fx.reverb_hipass", "Reverb HiPass", "Reverb LF EQ.", "NRPN 0:108", (0, 127), 0)):
    par(pid, "fx", label, "integer", fn, "patch", acc(menu="FX menu", midi=midi), range={"min": rng[0], "max": rng[1]}, default=dflt)
for pid, label, vals, dflt in (("fx.chorus_mode", "Chorus Mode", ["chorus", "flanger", "phlanger"], "chorus"),
                               ("fx.delay_lr_ratio", "Delay LR Ratio", ["1/1", "4/3", "3/4", "3/2", "2/3", "2/1", "1/2", "3/1", "1/3", "4/1", "1/4"], "1/1"),
                               ("fx.delay_time_mode", "Delay TimeMode", ["normal", "double", "treble", "quadlofi", "hexvlofi"], "normal"),
                               ("fx.delay_type", "Delay Type", ["original", "crossfed", "dual"], "original"), ("fx.delay_output", "Delay Output", ["predamp", "postdamp"], "predamp"),
                               ("fx.delay_sync_rate", "DelaySync", ["4 beats..32nd T"], "4th T")):
    par(pid, "fx", label, "enum", f"{label} setting.", "patch", acc(menu="FX menu", midi="NRPN 0:94" if pid == "fx.delay_sync_rate" else None), values=ev(vals if pid != "fx.delay_sync_rate" else vals + ["4th T"]), default=dflt)
# mod matrix slots
for s in range(1, 17):
    par(f"mm.{s}.source_a", "kbd", f"Mod slot {s} source A", "enum", "First source.", "patch", acc(menu=f"MOD menu page {s}", midi=f"NRPN {s}:0"), values=ev(["see mod_matrix sources"]), default="see mod_matrix sources")
    par(f"mm.{s}.source_b", "kbd", f"Mod slot {s} source B", "enum", "Second source, multiplied with A.", "patch", acc(menu=f"MOD menu page {s}", midi=f"NRPN {s}:1"), values=ev(["see mod_matrix sources"]), default="see mod_matrix sources")
    par(f"mm.{s}.destination", "kbd", f"Mod slot {s} destination", "enum", "Destination parameter.", "patch", acc(menu=f"MOD menu page {s}", midi=f"NRPN {s}:3"), values=ev(["see mod_matrix destinations"]), default="see mod_matrix destinations")
    par(f"mm.{s}.depth", "kbd", f"Mod slot {s} depth", "integer", "Combined depth; with both sources Direct it is a fixed offset.", "patch", acc(menu=f"MOD menu page {s}", midi=f"NRPN {s}:2"), range={"min": -64, "max": 63}, default=0)
for s in range(1, 5):
    par(f"fxm.{s}.source_a", "fx", f"FX mod slot {s} source A", "enum", "First source.", "patch", acc(menu=f"FX menu, FX mod page {s}"), values=ev(["see FX matrix sources"]), default="see FX matrix sources")
    par(f"fxm.{s}.source_b", "fx", f"FX mod slot {s} source B", "enum", "Second source.", "patch", acc(menu=f"FX menu, FX mod page {s}"), values=ev(["see FX matrix sources"]), default="see FX matrix sources")
    par(f"fxm.{s}.destination", "fx", f"FX mod slot {s} destination", "enum", "FX parameter.", "patch", acc(menu=f"FX menu, FX mod page {s}"), values=ev(["see FX matrix destinations"]), default="see FX matrix destinations")
    par(f"fxm.{s}.depth", "fx", f"FX mod slot {s} depth", "integer", "Combined depth.", "patch", acc(menu=f"FX menu, FX mod page {s}"), range={"min": -64, "max": 63}, default=0)
# performance and global
par("ctrl.animate1", "ctrl", "ANIMATE 1", "boolean", "Momentary performance change, set per patch via the matrix.", "none", acc("push_button", "CC 114", note="with HOLD to latch"))
par("ctrl.animate2", "ctrl", "ANIMATE 2", "boolean", "Momentary performance change, set per patch via the matrix.", "none", acc("push_button", "CC 115", note="with HOLD to latch"))
par("ctrl.hold", "ctrl", "HOLD", "boolean", "Latches the Animate buttons.", "none", acc("push_button"))
par("out.volume", "out", "VOLUME", "continuous", "Master and headphone level.", "none", acc("knob"), panel_scale=S10)
for pid, label, fn in (("util.initialise", "INITIALISE", "Loads the Init patch (optionally with current panel settings)."), ("util.compare", "COMPARE", "Hold to hear the unmodified patch."),
                       ("util.audition", "AUDITION", "Plays middle C."), ("util.save", "SAVE", "Saves the patch (or settings, or a tuning table)."), ("util.patch", "PATCH select / +/-", "Selects a patch."),
                       ("util.menus", "Menu buttons", "Patch, Osc, Env, LFO, Arp/Clock, Mod, Voice, FX, Settings."), ("util.value", "VALUE knob and +/-", "Edits the selected row.")):
    par(pid, "kbd", label, "boolean", fn, "none", acc("push_button"))
for pid, label, kind, fn, extra in (
        ("sys.midi_channel", "MidiChan", "integer", "MIDI channel.", {"range": {"min": 1, "max": 16}, "default": 1}),
        ("sys.local", "Local", "boolean", "Panel controls affect the engine (or only send MIDI).", {"default": True}),
        ("sys.arp_midi", "Arp>Midi", "boolean", "Arpeggiator notes are sent over MIDI.", {"default": True}),
        ("sys.cc_nrpn", "CC/NRPN", "enum", "Send and/or receive control data.", {"values": ev(["disabled", "receive", "transmit", "rec_tran"]), "default": "rec_tran"}),
        ("sys.bank_patch", "Bank/Patch", "enum", "Send and/or receive program and bank changes.", {"values": ev(["disabled", "receive", "transmit", "rec_tran"]), "default": "rec_tran"}),
        ("sys.protect", "Protect", "boolean", "Blocks patch saving.", {"default": False}),
        ("sys.pickup", "Pickup", "boolean", "Knobs act only once they pass the stored value.", {"default": False}),
        ("sys.vel_shape", "VelShape", "integer", "Velocity response curve; 64 linear.", {"range": {"min": 0, "max": 127}, "default": 64}),
        ("sys.tune", "TuneCents", "integer", "Master tuning in cents (A = 440 Hz at 0).", {"range": {"min": -50, "max": 50}, "default": 0}),
        ("sys.transpose", "Transpose", "integer", "Shifts received MIDI notes (not arp notes).", {"range": {"min": -12, "max": 12}, "default": 0}),
        ("sys.pedal_config", "Pedal settings", "enum", "Function of switch pedals on PEDAL 1 and 2.", {"values": ev(["sustain", "other"]), "default": "sustain"})):
    par(pid, "kbd", label, kind, fn, "global", acc(menu="SETTINGS menu (press SAVE there to keep after power-off)"), **extra,
        **({"confidence": "inferred", "note": "The guide's pedal pages were not read."} if pid == "sys.pedal_config" else {}))

# ---------------------------------------------------------------- ports
jack("jack.out_l", "OUTPUTS L/MONO", "out", "audio", "out.left", "Left, or mono sum if RIGHT is unplugged; pseudo-balanced.", "6.35 mm TRS")
jack("jack.out_r", "OUTPUTS RIGHT", "out", "audio", "out.right", "Right; pseudo-balanced.", "6.35 mm TRS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones; level from VOLUME.", "6.35 mm TRS")
jack("jack.cv_in", "CV MOD IN", "in", "cv", "ctrl.cv_in", "±5 V control voltage as a mod matrix source (alias-free to just over 1 kHz).", "3.5 mm TS")
jack("jack.pedal1", "PEDAL 1", "in", "cv", "ctrl.pedal1", "Switch (sustain) or expression pedal, auto-detected.", "6.35 mm TRS")
jack("jack.pedal2", "PEDAL 2", "in", "cv", "ctrl.pedal2", "Switch or expression/breath pedal, auto-detected.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB MIDI (no audio); Components librarian and firmware.", "USB type B")
jack("jack.dc", "12V DC", "in", "power", None, "Supplied 12 V DC PSU; power switch beside it.", "DC barrel")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.midi_in", "midi", note="Arpeggiated notes replace held notes.")
con("ctrl.expr1", "kbd.sustain", "gate", {"param": "sys.pedal_config", "equals": "sustain"}, confidence="inferred", note="A switch pedal on PEDAL 1 as sustain.")
for n in (1, 2, 3):
    o = f"osc{n}"
    con("kbd.pitch", f"{o}.pitch_cv")
    con("lfo2.out", f"{o}.pitch_cv", amount=f"{o}.lfo2_depth")
    con("env_m2.out", f"{o}.pitch_cv", amount=f"{o}.menv2_depth")
    con("env_m1.out", f"{o}.shape_cv", amount=f"{o}.shape_menv1")
    con("lfo1.out", f"{o}.shape_cv", amount=f"{o}.shape_lfo1")
    con(f"{o}.out", f"mixer.{o}", "audio", amount=f"mixer.{o}")
con("osc1.out", "ring.a", "audio")
con("osc2.out", "ring.b", "audio")
con("ring.out", "mixer.ring", "audio", amount="mixer.ring")
con("noise.out", "mixer.noise", "audio", amount="mixer.noise")
con("mixer.out", "drive.in", "audio", amount="mixer.vca_gain")
con("drive.out", "vcf.in", "audio")
con("env_m1.out", "vcf.cutoff_cv", amount="vcf.menv1_depth")
con("env_amp.out", "vcf.cutoff_cv", amount="vcf.ampenv_depth")
con("lfo1.out", "vcf.cutoff_cv", amount="vcf.lfo1_depth")
con("osc3.out", "vcf.cutoff_cv", "audio", amount="vcf.osc3_mod")
con("kbd.pitch", "vcf.cutoff_cv", amount="vcf.key_tracking")
con("vcf.out", "postdrive.in", "audio")
con("postdrive.out", "vca.in", "audio")
for e in ("env_amp", "env_m1", "env_m2"):
    con("kbd.gate", f"{e}.gate", "gate")
    con("kbd.velocity", f"{e}.velocity", amount=f"{e}.velocity")
con("env_amp.out", "vca.cv")
con("kbd.gate", "lfo1.reset", "gate", {"param": "lfo1.phase", "not_equals": "free"})
con("kbd.gate", "lfo2.reset", "gate", {"param": "lfo2.phase", "not_equals": "free"})
con("vca.out", "dist.in", "audio", note="All eight voices summed.")
con("dist.out", "fx.in", "audio", amount="dist.level")
con("fx.out", "out.in", "audio", amount="out.patch_level")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C

MM_SOURCES = [("Direct", "The Depth value alone (fixed offset)", None), ("ModWheel", "Mod wheel (MIDI)", None), ("AftTouch", "Channel or polyphonic aftertouch", None),
              ("ExprPED1", "Expression pedal on PEDAL 1", "ctrl.expr1"), ("BrthPED2", "Expression/breath pedal on PEDAL 2", "ctrl.expr2"), ("Velocity", "Note velocity", "kbd.velocity"),
              ("Keyboard", "Note number", "kbd.pitch"), ("LFO1+", "LFO 1, unipolar", "lfo1.out"), ("LFO1+/-", "LFO 1, bipolar", "lfo1.out"), ("LFO2+", "LFO 2, unipolar", "lfo2.out"),
              ("LFO2+/-", "LFO 2, bipolar", "lfo2.out"), ("AmpEnv", "Amp envelope", "env_amp.out"), ("ModEnv1", "Mod envelope 1", "env_m1.out"), ("ModEnv2", "Mod envelope 2", "env_m2.out"),
              ("Animate1", "Animate button 1", "ctrl.animate1"), ("Animate2", "Animate button 2", "ctrl.animate2"), ("CV +/-", "CV MOD IN, bipolar", "ctrl.cv"),
              ("LFO3 +", "LFO 3, unipolar", "lfo3.out"), ("LFO3 +/-", "LFO 3, bipolar", "lfo3.out"), ("LFO4 +", "LFO 4, unipolar", "lfo4.out"), ("LFO4 +/-", "LFO 4, bipolar", "lfo4.out"),
              ("BndWhl+", "Pitch bend up increases", None), ("BndWhl-", "Pitch bend up decreases", None), ("Noise", "Noise generator", "noise.out")]
MM_DEST = [("O123Ptch", "Pitch of all three oscillators", None), ("Osc1Ptch", "Osc 1 pitch", None), ("Osc2Ptch", "Osc 2 pitch", None), ("Osc3Ptch", "Osc 3 pitch", None),
           ("Osc1VSnc", "Osc 1 VSync", "osc1.vsync"), ("Osc2VSnc", "Osc 2 VSync", "osc2.vsync"), ("Osc3VSnc", "Osc 3 VSync", "osc3.vsync"),
           ("Osc1Shpe", "Osc 1 shape", "osc1.shape_manual"), ("Osc2Shpe", "Osc 2 shape", "osc2.shape_manual"), ("Osc3Shpe", "Osc 3 shape", "osc3.shape_manual"),
           ("Osc1 Lev", "Osc 1 level", "mixer.osc1"), ("Osc2 Lev", "Osc 2 level", "mixer.osc2"), ("Osc3 Lev", "Osc 3 level", "mixer.osc3"), ("NoiseLev", "Noise level", "mixer.noise"),
           ("Ring Lev", "Ring mod level", "mixer.ring"), ("VcaLevel", "Overall output level", None), ("Filt Drv", "Pre-filter overdrive", "drive.amount"), ("FiltDist", "Post-filter drive", "postdrive.amount"),
           ("FiltFreq", "Filter frequency", "vcf.frequency"), ("Filt Res", "Filter resonance", "vcf.resonance"), ("LFO1Rate", "LFO 1 rate", "lfo1.rate"), ("LFO2Rate", "LFO 2 rate", "lfo2.rate"),
           ("AmpEnv A", "Amp attack", "env_amp.attack"), ("AmpEnv D", "Amp decay", "env_amp.decay"), ("AmpEnv R", "Amp release", "env_amp.release"),
           ("ModEnv1A", "Mod Env 1 attack", "env_m1.attack"), ("ModEnv1D", "Mod Env 1 decay", "env_m1.decay"), ("ModEnv1R", "Mod Env 1 release", "env_m1.release"),
           ("ModEnv2A", "Mod Env 2 attack", "env_m2.attack"), ("ModEnv2D", "Mod Env 2 decay", "env_m2.decay"), ("ModEnv2R", "Mod Env 2 release", "env_m2.release"),
           ("FM O1>O2", "FM of Osc 2 by Osc 1", None), ("FM O2>O3", "FM of Osc 3 by Osc 2", None), ("FM O3>O1", "FM of Osc 1 by Osc 3", None), ("FM Ns>O1", "Noise FM of Osc 1", None),
           ("O3>FiltF", "Osc 3 on filter frequency", "vcf.osc3_mod"), ("Ns>FiltF", "Noise on filter frequency", None), ("Pan Posn", "Voice pan", "kbd.pan_position"),
           ("O123Shpe", "Shape of all three oscillators", None), ("AEnv Del", "Amp delay", "env_amp.delay"), ("AEnv Hld", "Amp hold", "env_amp.hold"), ("AEnv Sus", "Amp sustain", "env_amp.sustain"),
           ("MEnv1Del", "Mod Env 1 delay", "env_m1.delay"), ("MEnv1Hld", "Mod Env 1 hold", "env_m1.hold"), ("MEnv1Sus", "Mod Env 1 sustain", "env_m1.sustain"),
           ("MEnv2Del", "Mod Env 2 delay", "env_m2.delay"), ("MEnv2Hld", "Mod Env 2 hold", "env_m2.hold"), ("MEnv2Sus", "Mod Env 2 sustain", "env_m2.sustain")]
D["mod_matrix"] = {
    "name": "Modulation matrix", "module": "kbd", "slots": 16, "combine": "multiply",
    "slot_parameters": [{"slot": s, "source": f"mm.{s}.source_a", "source_b": f"mm.{s}.source_b", "destination": f"mm.{s}.destination", "depth": f"mm.{s}.depth"} for s in range(1, 17)],
    "sources": [{"id": i, "name": n, "description": d_, **({"node": nd} if nd else {}), "per_voice": nd not in (None, "ctrl.animate1", "ctrl.animate2", "ctrl.cv", "ctrl.expr1", "ctrl.expr2", "lfo3.out", "lfo4.out")}
                for i, (n, d_, nd) in enumerate(MM_SOURCES)],
    "destinations": [{"id": i, "name": n, "description": d_, **({"parameter": p_} if p_ else {})} for i, (n, d_, p_) in enumerate(MM_DEST)],
    "depth_range": {"min": -64, "max": 63},
    "note": "Two sources per slot are multiplied (either at zero gives no modulation); slots on the same destination add. The MIDI chart limits source to 0-16 and destination to 0-36, fewer than the listed 24 sources and 49 destinations added by later firmware.",
}
FX_SOURCES = [s for s in MM_SOURCES if s[0] in ("Direct", "ModWheel", "AftTouch", "ExprPED1", "BrthPED2", "Velocity", "Keyboard", "Animate1", "Animate2", "CV +/-", "LFO3 +", "LFO3 +/-",
                                                 "LFO4 +", "LFO4 +/-", "BndWhl+", "BndWhl-", "Noise")]
FX_DEST = [("Dist Lev", "dist.level"), ("Chor Lev", "fx.chorus_level"), ("ChorRate", "fx.chorus_rate"), ("Chor Dep", "fx.chorus_depth"), ("Chor FB", "fx.chorus_feedback"),
           ("Del Lev", "fx.delay_level"), ("Del Time", "fx.delay_time"), ("Del FB", "fx.delay_feedback"), ("Rev Lev", "fx.reverb_level"), ("Rev Time", "fx.reverb_time"),
           ("RevLdamp", "fx.reverb_hp_damp"), ("RevHdamp", "fx.reverb_lp_damp"), ("Rev Size", "fx.reverb_size"), ("RevLpass", "fx.reverb_lopass"), ("RevHpass", "fx.reverb_hipass"),
           ("Del Slew", "fx.delay_slew"), ("DelLdamp", "fx.delay_hp_damp"), ("DelHdamp", "fx.delay_lp_damp"), ("DelWidth", "fx.delay_width"), ("DelRatio", "fx.delay_lr_ratio"),
           ("Lfo3Rate", "lfo3.rate"), ("Lfo4Rate", "lfo4.rate"), ("NoiseLPF", "noise.lpf"), ("NoiseHPF", "noise.hpf")]
D["additional_mod_matrices"] = [{
    "name": "FX modulation matrix", "module": "fx", "slots": 4, "combine": "multiply",
    "slot_parameters": [{"slot": s, "source": f"fxm.{s}.source_a", "source_b": f"fxm.{s}.source_b", "destination": f"fxm.{s}.destination", "depth": f"fxm.{s}.depth"} for s in range(1, 5)],
    "sources": [{"id": i, "name": n, "description": d_, **({"node": nd} if nd else {}), "per_voice": False} for i, (n, d_, nd) in enumerate(FX_SOURCES)],
    "destinations": [{"id": i, "name": n, "parameter": p_, "common_to_all_voices": True} for i, (n, p_) in enumerate(FX_DEST)],
    "depth_range": {"min": -64, "max": 63}, "note": "Global sources only (no per-voice LFOs or envelopes), since the effects act on the voice sum."}]
D["indicators"] = [
    {"id": "oled", "module": "kbd", "label": "OLED display", "kind": "display", "function": "4 x 20 characters: patch, menus, and the value of any control being moved."},
    {"id": "voice_leds", "module": "kbd", "label": "ACTIVE VOICE LEDs", "kind": "led", "function": "Show which of the eight voices are sounding."},
    {"id": "section_leds", "module": "osc1", "label": "selector LEDs", "kind": "led", "function": "Range, wave, shape source, LFO type and range, filter shape and slope, chorus and reverb type."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["mixer", "drive", "vcf", "postdrive", "vca", "dist", "fx"],
     "rule": "Per voice: oscillators, ring and noise into the analogue mixer, VCA GAIN, overdrive, filter, post drive, VCA. Then all eight voices into analogue distortion (after the VCAs, so it changes with level and voice count), then chorus, delay and reverb."},
    {"id": "b02", "name": "Panel routings", "applies_to": ["lfo1", "lfo2", "env_m1", "env_m2", "env_amp"],
     "rule": "LFO 1: oscillator shape and filter. LFO 2: oscillator pitch. Mod Env 1: shape and filter. Mod Env 2: pitch. Amp Env: VCA and (optionally) filter. Osc 3 can modulate the filter. Everything else goes through the matrix."},
    {"id": "b03", "name": "Shape", "applies_to": ["osc1", "osc2", "osc3"],
     "rule": "SHAPE AMOUNT sets pulse width on pulse, wavefolding on sine, triangle and saw, or position across the five waves of a wavetable. Manual, Mod Env 1 and LFO 1 amounts add; SOURCE picks which the knob edits."},
    {"id": "b04", "name": "Mod matrix", "applies_to": ["kbd"],
     "rule": "16 slots, each multiplying source A by source B into one destination at a set depth; both Direct makes a fixed offset. Slots add on a shared destination. A separate four-slot FX matrix uses global sources only."},
    {"id": "b05", "name": "Voice modes", "applies_to": ["kbd"],
     "rule": "Mono (glide always), MonoLG (glide only on legato), Mono2 (voices rotate so envelopes finish), Poly (every note a new voice), Poly2 (repeated notes reuse their voice). Unison 1, 2, 3, 4 or 8 voices per note."},
    {"id": "b06", "name": "LFO behaviour", "applies_to": ["lfo1", "lfo2", "lfo3", "lfo4"],
     "rule": "LFO 1 and 2 run per voice (independent phase unless Common), with fade in/out or gate, phase reset, slew and a repeat count. LFO 3 and 4 are global and also reach the FX matrix."},
    {"id": "b07", "name": "Envelopes", "applies_to": ["env_amp", "env_m1", "env_m2"],
     "rule": "DAHDSR: delay and hold in the menu. LOOP repeats attack-hold-decay up to 126 times or continuously before sustain. Legato triggering applies only in Mono and MonoLG modes."},
    {"id": "b08", "name": "Effects", "applies_to": ["fx", "dist"],
     "rule": "Distortion is analogue on the sum. Chorus (2-tap, 4-tap, ensemble; chorus, flanger, phlanger modes), delay (to 1.4 s, sync truncated to fit) and reverb (three sizes) run in parallel or in any series order. BYPASS removes the three digital effects only. All FX settings are saved per patch."},
    {"id": "b09", "name": "Settings", "applies_to": ["kbd"], "rule": "Settings are global; pressing SAVE in the Settings menu keeps them over power-off and also stores the current patch as the start-up patch."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "poly_pressure", "note": "per-note aftertouch source"},
                 {"message": "program_change"}, {"message": "bank_select"}, {"message": "control_change", "note": "panel controls (paired CCs give 0-255); see parameter access entries"},
                 {"message": "nrpn", "note": "menu parameters and mod matrix slots (MSB 1-16 per slot)"}, {"message": "clock"}, {"message": "sysex", "note": "patch import; patch banks load back to their original locations"}],
    "transmits": [{"message": "note_on", "note": "arpeggiator notes with Arp>Midi on"}, {"message": "control_change"}, {"message": "nrpn"}, {"message": "program_change"}, {"message": "bank_select"}],
    "channel_note": "One channel 1-16 (Settings).", "note": "Clock rate itself has no MIDI address. Components (web) manages patches, wavetables and firmware."}
D["specifications"] = {
    "voices": 8, "oscillators_per_voice": 3, "oscillator_type": "NCO (digital) with 60 wavetables", "filter": "analogue LP/BP/HP, 12/24 dB", "envelopes": "3 x DAHDSR per voice",
    "lfos": "2 per voice + 2 global", "mod_matrix": "16 slots x 2 sources; FX matrix 4 slots", "effects": "analogue distortion; digital chorus, delay (1.4 s), reverb",
    "envelope_times_s": {"attack_max": 18, "decay_max": 22, "release_max": 24, "delay_max": 10, "hold_max": 0.5}, "lfo_hz": {"low": [0, 200], "high": [0, 1600]},
    "connections": {"outputs": "2 x 1/4\" TRS pseudo-balanced", "phones": "1/4\" TRS", "cv_in": "3.5 mm, ±5 V", "pedals": "2 x 1/4\" TRS", "midi": "DIN in, out, thru", "usb": "type B, MIDI only"},
    "power": "12 V DC external PSU",
}
D["omitted_from_source"] = ["synthesis tutorial", "getting started steps", "block diagram image (path taken from the text)", "sync rate tables (summarised)", "pedal settings pages (not read)"]
D["not_in_source"] = ["dimensions, weight and power draw", "output levels", "SysEx format", "filter circuit details", "oscillator sample rate"]
D["source_inconsistencies"] = [
    "Several passages are carried over from the Summit guide: 'each of Peak's two Parts', 'each of the two Peak synths has 16 slots', and a link to the Summit block diagram.",
    "Filter section: Env Depth is said to follow 'Modulation Envelope 2' with Source at Mod Env, but the panel and envelope text give Mod Env 1.",
    "The noise is 'white noise' in the hardware overview; the noise HPF text repeats a sentence about voice tuning.",
    "The MIDI chart lists matrix sources 0-16 and destinations 0-36, but the appendix lists 24 sources and 49 destinations.",
    "Clock source defaults to Auto in the menu text and Internal in the init patch table.",
    "LFO Repeats (Off, 1-127) appears in the MIDI chart as 'One Shot', range 0-1.",
    "Arp chance is 0-100% in one line and 10-100% in the next.",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice structure", "detail": "Voice modules are modelled once (scope per_voice); LFO 3/4, distortion and effects are common."},
    {"topic": "Matrix enumerations", "detail": "Slot source and destination parameters point to the mod_matrix lists rather than repeating them as enum values."},
    {"topic": "Settings pages", "detail": "Pedal configuration, tuning table editing and further settings pages were not read."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "additional_mod_matrices", "indicators", "behaviours", "midi",
         "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/novation-peak_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
