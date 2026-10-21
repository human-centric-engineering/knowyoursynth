#!/usr/bin/env python3
"""Assemble the Novation Bass Station II device file (schema 0.11.0).

A digitally controlled analogue monosynth (paraphonic option): two oscillators plus a
sub oscillator, noise, ring mod and external input into a mixer, pre-filter overdrive,
Classic (LP/BP/HP, 12/24 dB) or Acid (24 dB diode ladder) filter, post-filter
distortion, VCA with limiter, two ADSRs, two LFOs, arpeggiator and 4 x 32-step
sequencer, 128 patches, AFX overlays and micro-tuning.

Source: the online user guide (v5.0, 2025): introduction, in detail and appendix,
including the full CC/NRPN chart. Every patch parameter carries its MIDI address.
"""
import json

S10 = {"min": 0, "max": 10}
D = {"schema_version": "0.11.0"}
M, P, J, C = [], [], [], []
BASE = "https://userguides.novationmusic.com/hc/en-gb/articles/"


def mod(id, type, name, section, desc, inputs, outputs, props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory, access, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
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


def panel(control, midi=None, note=None):
    a = [{"type": "panel", "control": control, **({"note": note} if note else {})}]
    if midi:
        a.append({"type": "midi", "message": midi})
    return a


def onkey(key, midi=None, presses=1):
    a = [{"type": "gesture", "gesture": f"hold FUNCTION/EXIT and press {key}" + (f" {presses} times" if presses > 1 else "") + ", then PATCH/VALUE buttons",
          "when": "any_time"}]
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
    c = {"id": f"c{len(C) + 1:02d}", "from": frm, "to": to, "signal": signal, "kind": "switched" if when else "fixed"}
    if when:
        c["enabled_when"] = when
    c.update(kw)
    C.append(c)


def eq(p, v):
    return {"param": p, "equals": v}


D["device"] = {
    "id": "novation-bass-station-ii", "manufacturer": "Novation", "model": "Bass Station II",
    "category": "digitally controlled analogue monosynth (paraphonic option), 25 keys, with arpeggiator, sequencer and patch memory",
    "based_on": "Successor to the 1993 Novation Bass Station; released 2013, extended by firmware (AFX Station and Swifty editions share it).",
    "sources": [
        {"id": "guide_intro", "title": "Novation, 'Introduction to the Bass Station II' (user guide v5.0)", "kind": "user_manual",
         "file": BASE + "25494285871890-Introduction-to-the-Bass-Station-II", "note": "Features, hardware overview (top and rear panel callouts), power."},
        {"id": "guide_detail", "title": "Novation, 'Bass Station II in detail'", "kind": "user_manual", "file": BASE + "25494313827986-Bass-Station-II-in-detail",
         "note": "Every section, firmware additions (paraphonic, oscillator error, sub tuning, filter tracking, envelope retrigger and fixed duration, glide divergence), AFX mode and on-key functions."},
        {"id": "guide_appendix", "title": "Novation, 'Bass Station II appendix'", "kind": "user_manual", "file": BASE + "25494271270930-Bass-Station-II-appendix",
         "note": "LFO sync values, init patch table, settings kept at power-off, full CC/NRPN list, AFX SysEx, micro-tuning, greeting message."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "hybrid", "voices": 1,
    "polyphony_mode": "monophonic; paraphonic mode gives two notes (one per oscillator) through the shared filter and VCA",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "128 patches: 0-63 factory, 64-127 user (initially Init patches). Four global 32-step sequences; the selected one is stored in the patch. "
                         "Eight banks of 25 AFX overlays, the selected bank stored in the patch. Nine tuning tables.",
    "semi_modular": False, "panel_counts": {"keys": 25, "knobs": 18, "faders": 4, "wheels": 2, "display_characters": 3},
    "summary": ("Analogue signal path under digital control. Two oscillators (sine, triangle, saw, pulse) share one set of controls via OSC SELECT; a sub oscillator "
                "locks to Osc 1. Noise, ring mod (Osc 1 x Osc 2) and an external input share a fourth mixer level. Overdrive feeds a Classic multimode filter "
                "(LP/BP/HP, 12 or 24 dB) or an Acid 24 dB diode ladder; distortion follows the filter, then the VCA and limiter. Two ADSRs (Amp and Mod) share "
                "four faders; two LFOs have dedicated routings. Mod wheel, aftertouch and velocity reach set destinations via on-key functions. "
                "Arpeggiator, 4 x 32-step sequencer, AFX per-key overlays and micro-tuning."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice control", "KEYBOARD / OCTAVE / TRANSPOSE",
    "25 velocity-sensitive keys with aftertouch, octave shift -5/+4, transpose ±12 semitones, portamento with glide divergence, paraphonic mode, micro-tuning tables.",
    ["kbd.midi_in", "kbd.sustain", "kbd.seq_in"], ["kbd.pitch1", "kbd.pitch2", "kbd.gate", "kbd.velocity", "kbd.aftertouch"], props={"keys": 25, "octave_shift": [-5, 4]})
mod("wheels", "manual_controller", "Pitch and Mod wheels", "LEFT OF KEYBOARD", "Spring-centred pitch wheel and mod wheel, both lit.", [], ["wheels.bend", "wheels.mod"])
mod("arp", "arpeggiator", "Arpeggiator and sequencer", "ARPEGGIATOR",
    "Arpeggiator with 32 rhythms, 6 note orders and 1-4 octaves, 40-240 BPM or MIDI clock; also records and plays four 32-step sequences.",
    [], ["arp.notes"], props={"rhythms": 32, "sequences": 4, "sequence_steps": 32, "tempo_bpm": [40, 240]})
for n in (1, 2):
    o = f"osc{n}"
    mod(o, "oscillator", f"Oscillator {n}", "OSCILLATOR", f"Analogue oscillator: sine, triangle, rising saw or pulse; range 16'-2', coarse ±12 semitones, fine ±100 cents; pulse width manual or modulated."
        + (" Can be hard-synced to Osc 1, and can modulate the filter at audio rate (Osc Filter Mod)." if n == 2 else ""),
        [f"{o}.pitch_cv", f"{o}.pwm_cv"] + ([f"{o}.sync_in"] if n == 2 else []), [f"{o}.out"])
mod("sub", "oscillator", "Sub oscillator", "OSCILLATOR", "One or two octaves below Osc 1 (and detunable from it); sine, narrow pulse or square.", ["sub.pitch_cv"], ["sub.out"])
mod("noise", "noise", "Noise", "MIXER", "White noise.", [], ["noise.out"])
mod("ring", "ring_modulator", "Ring modulator", "MIXER", "Ring modulation of Osc 1 and Osc 2.", ["ring.a", "ring.b"], ["ring.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Six sources into one: Osc 1, Osc 2 and Sub with their own knobs; Noise, Ring and Ext share the fourth knob, chosen by switch, each keeping its own level.",
    ["mixer.osc1", "mixer.osc2", "mixer.sub", "mixer.noise", "mixer.ring", "mixer.ext"], ["mixer.out"])
mod("drive", "overdrive", "Overdrive", "FILTER", "Pre-filter overdrive.", ["drive.in"], ["drive.out"])
mod("vcf", "filter", "Filter", "FILTER",
    "Classic: variable LP, BP or HP at 12 or 24 dB/oct. Acid: fixed 4-pole (24 dB/oct) low-pass diode ladder, after early-1980s designs; Shape and Slope inactive.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"modes": {"classic": ["LP", "BP", "HP"], "classic_slopes_db": [12, 24], "acid": "24 dB/oct diode ladder LP"}})
mod("dist", "overdrive", "Distortion", "EFFECTS", "Post-filter, pre-VCA distortion, so its character does not change with the amplitude envelope.", ["dist.in"], ["dist.out"])
mod("env_amp", "envelope", "Amp Env", "ENVELOPES", "ADSR always routed to the VCA; velocity sensitivity, triggering mode, optional retrigger loop and fixed-duration sustain.",
    ["env_amp.gate", "env_amp.velocity"], ["env_amp.out"], props={"attack_s_max": 5, "release_s_max": 10})
mod("env_mod", "envelope", "Mod Env", "ENVELOPES", "ADSR for oscillator pitch, pulse width and filter frequency; same options as Amp Env.",
    ["env_mod.gate", "env_mod.velocity"], ["env_mod.out"], props={"attack_s_max": 5, "release_s_max": 10})
for n in (1, 2):
    mod(f"lfo{n}", "lfo", f"LFO {n}", "LFO", f"Triangle, falling saw, square or sample and hold; 0 to about 190 Hz or synced; delay, slew and key sync. "
        + ("Routed to oscillator pitch." if n == 1 else "Routed to pulse width and filter frequency; aftertouch can change its speed."),
        [f"lfo{n}.key_sync"] + (["lfo2.rate_cv"] if n == 2 else []), [f"lfo{n}.out"], props={"rate_hz": [0, 190], "sync_values": 35})
mod("vca", "vca", "VCA", "OUTPUT", "Driven by Amp Env (scaled by velocity); includes a simple limiter.", ["vca.in", "vca.cv"], ["vca.out"])
mod("out", "output", "Output", "MASTER", "VOLUME sets line and headphone level; output is mono.", ["out.in"], ["out.line", "out.phones"])

# ---------------------------------------------------------------- oscillator parameters (patch)
for n, cc in ((1, {"fine": "CC 26:58", "range": "CC 70", "coarse": "CC 27:59", "wave": "NRPN 0:72", "menv": "CC 71", "lfo1": "CC 28:60", "pwm_env": "CC 72", "pwm_lfo": "CC 73", "pw": "CC 74"}),
              (2, {"fine": "CC 29:61", "range": "CC 75", "coarse": "CC 30:62", "wave": "NRPN 0:82", "menv": "CC 76", "lfo1": "CC 31:63", "pwm_env": "CC 77", "pwm_lfo": "CC 78", "pw": "CC 79"})):
    o = f"osc{n}"
    sel = f"with OSC SELECT at {n}"
    par(f"{o}.range", o, "RANGE", "enum", "Footage; 8' is concert pitch.", "patch", panel("push_button", cc["range"], sel), values=ev(["16'", "8'", "4'", "2'"]), default="8'")
    par(f"{o}.waveform", o, "WAVEFORM", "enum", "Oscillator waveform.", "patch", panel("push_button", cc["wave"], sel), values=ev(["sine", "triangle", "saw", "pulse"]), default="saw")
    par(f"{o}.coarse", o, "COARSE", "continuous", "Pitch over ±1 octave.", "patch", panel("knob", cc["coarse"], sel), physical={"min": -12, "max": 12, "unit": "semitones"})
    par(f"{o}.fine", o, "FINE", "continuous", "Pitch over ±1 semitone.", "patch", panel("knob", cc["fine"], sel), physical={"min": -100, "max": 100, "unit": "cents"})
    par(f"{o}.modenv_depth", o, "MOD ENV DEPTH (pitch)", "integer", "Mod Env on pitch; 8 = one octave at full envelope, maximum eight octaves; negative inverts.", "patch",
        panel("knob", cc["menv"], sel), range={"min": -63, "max": 63})
    par(f"{o}.lfo1_depth", o, "LFO 1 DEPTH (pitch)", "integer", "LFO 1 on pitch, finer near zero: 6 semitone, 12 tone, 22 fifth, 32 octave, 56 two octaves, 80 three.", "patch",
        panel("knob", cc["lfo1"], sel), range={"min": -127, "max": 127})
    par(f"{o}.pw_source", o, "PULSE WIDTH source switch", "enum", "Which source the PULSE WIDTH knob sets: manual width, Mod Env depth or LFO 2 depth (all three can be active at once).", "none",
        panel("toggle_switch", note=sel), values=ev(["mod_env", "lfo2", "manual"]), note="A panel routing switch; the three amounts it reveals are stored.")
    par(f"{o}.pw_manual", o, "PULSE WIDTH (manual)", "integer", "Duty cycle; 50 is square.", "patch", panel("knob", cc["pw"], sel + ", source MANUAL"),
        range={"min": 5, "max": 95}, default=50)
    par(f"{o}.pw_modenv", o, "PULSE WIDTH (Mod Env depth)", "integer", "Mod Env on pulse width.", "patch", panel("knob", cc["pwm_env"], sel + ", source MOD ENV"), range={"min": -63, "max": 63})
    par(f"{o}.pw_lfo2", o, "PULSE WIDTH (LFO 2 depth)", "integer", "LFO 2 on pulse width.", "patch", panel("knob", cc["pwm_lfo"], sel + ", source LFO 2"), range={"min": -90, "max": 90})
par("osc.select", "osc1", "OSC SELECT", "enum", "Which oscillator the shared controls adjust.", "none", panel("toggle_switch"), values=ev(["1", "2"]))
par("sub.octave", "sub", "SUB OCTAVE", "enum", "Sub pitch below Osc 1.", "patch", panel("push_button", "CC 81"), values=ev(["-1", "-2"]), default="-1")
par("sub.wave", "sub", "SUB WAVE", "enum", "Sub waveform.", "patch", panel("push_button", "CC 80"), values=ev(["sine", "narrow_pulse", "square"]), default="sine")
par("sub.coarse", "sub", "Sub coarse detune", "continuous", "Detunes the sub from Osc 1 (0 follows Osc 1).", "patch",
    [{"type": "gesture", "gesture": "hold FUNCTION/EXIT and turn COARSE", "when": "any_time"}, {"type": "midi", "message": "NRPN 0:84"}], physical={"min": -12, "max": 12, "unit": "semitones"})
par("sub.fine", "sub", "Sub fine detune", "continuous", "Fine detune of the sub.", "patch",
    [{"type": "gesture", "gesture": "hold FUNCTION/EXIT and turn FINE", "when": "any_time"}, {"type": "midi", "message": "NRPN 0:77"}], physical={"min": -100, "max": 100, "unit": "cents"})
par("osc.sync", "osc2", "Osc 1-2 sync", "boolean", "Osc 1 resets Osc 2's cycle; lights SYNC 1-2.", "patch", onkey("upper D", "CC 110"))
par("osc.paraphonic", "kbd", "Paraphonic mode", "boolean", "Two keys play the two oscillators separately through the shared filter and VCA.", "patch", onkey("upper D (Osc 1-2 sync)", "NRPN 0:107", 2), default=False)
par("osc.error", "kbd", "Oscillator error", "integer", "Random detune per key press, up to about a semitone at 7.", "patch", onkey("upper C# (Pitch Bend Range)", "NRPN 0:111", 2), range={"min": 0, "max": 7}, default=0)
par("osc.bend_range", "wheels", "Pitch Bend Range", "integer", "Pitch wheel range in semitones; negative reverses the wheel.", "patch", onkey("upper C#", "CC 107"), range={"min": -24, "max": 24}, default=12,
    note="The MIDI chart gives 1 to 12.")
# mixer
for src, label, ccn, default in (("osc1", "OSC 1", "CC 20:52", 255), ("osc2", "OSC 2", "CC 21:53", 0), ("sub", "SUB", "CC 22:54", 0)):
    par(f"mixer.{src}", "mixer", label, "integer", f"Level of {label}.", "patch", panel("knob", ccn), range={"min": 0, "max": 255}, default=default)
par("mixer.select", "mixer", "NOISE/RING/EXT", "enum", "Assigns the fourth level knob.", "patch", panel("toggle_switch"), values=ev(["noise", "ring", "ext"]))
for src, ccn in (("noise", "CC 23:55"), ("ring", "CC 24:56"), ("ext", "CC 25:57")):
    par(f"mixer.{src}", "mixer", f"{src.upper()} level", "integer", f"Level of {src}; set with the shared knob when the switch is at {src.upper()}.", "patch",
        panel("knob", ccn, f"NOISE/RING/EXT at {src.upper()}"), range={"min": 0, "max": 255}, default=0)
# filter
par("vcf.type", "vcf", "TYPE", "enum", "Classic multimode or Acid diode ladder.", "patch", panel("toggle_switch", "CC 83"), values=ev(["classic", "acid"]), default="classic")
par("vcf.shape", "vcf", "SHAPE", "enum", "Classic only.", "patch", panel("toggle_switch", "CC 84"), values=ev(["LP", "BP", "HP"]), default="LP")
par("vcf.slope", "vcf", "SLOPE", "enum", "Classic only: dB per octave.", "patch", panel("toggle_switch", "CC 106"), values=ev(["12", "24"]), default="24")
par("vcf.frequency", "vcf", "FREQUENCY", "integer", "Cutoff (LP/HP) or centre (BP).", "patch", panel("knob", "CC 16:48"), range={"min": 0, "max": 255}, default=255)
par("vcf.resonance", "vcf", "RESONANCE", "integer", "Emphasis at the frequency.", "patch", panel("knob", "CC 82"), range={"min": 0, "max": 127})
par("drive.amount", "drive", "OVERDRIVE", "integer", "Pre-filter overdrive.", "patch", panel("knob", "CC 114"), range={"min": 0, "max": 127})
par("vcf.modenv_depth", "vcf", "MOD ENV DEPTH (filter)", "integer", "Mod Env on frequency, up to eight octaves; negative sweeps the other way.", "patch", panel("knob", "CC 85"), range={"min": -63, "max": 63})
par("vcf.lfo2_depth", "vcf", "LFO 2 DEPTH (filter)", "integer", "LFO 2 on frequency (16 = one octave).", "patch", panel("knob", "CC 17:49"), range={"min": -127, "max": 127})
par("vcf.tracking", "vcf", "Filter tracking", "integer", "Keyboard tracking of cutoff: 0 full, 7 none.", "patch", onkey("Filter Freq key", "NRPN 0:108", 2), range={"min": 0, "max": 7}, default=0)
# envelopes
par("env.select", "env_amp", "ENV SELECT", "enum", "Which envelope the four faders and TRIGGERING adjust.", "none", panel("toggle_switch"), values=ev(["amp", "mod", "amp_and_mod"]))
for e, ccs, nr, key in (("env_amp", (90, 91, 92, 93), {"trig": "NRPN 0:73", "retrig": "NRPN 0:109", "fixed": "NRPN 0:114", "count": "NRPN 0:117"}, "Amp Env key"),
                        ("env_mod", (102, 103, 104, 105), {"trig": "NRPN 0:105", "retrig": "NRPN 0:110", "fixed": "NRPN 0:115", "count": "NRPN 0:118"}, "Mod Env key")):
    lab = "AMP" if e == "env_amp" else "MOD"
    which = "amp" if e == "env_amp" else "mod"
    note = f"ENV SELECT at {which.upper()} or AMP+MOD"
    par(f"{e}.attack", e, f"ATTACK ({lab})", "integer", "Attack: instant to over 5 s (about 250 ms at mid-travel).", "patch", panel("fader", f"CC {ccs[0]}", note), range={"min": 0, "max": 127})
    par(f"{e}.decay", e, f"DECAY ({lab})", "integer", "Decay to sustain (about 150 ms at mid-travel); in fixed-duration mode, sets the sustain duration.", "patch", panel("fader", f"CC {ccs[1]}", note), range={"min": 0, "max": 127})
    par(f"{e}.sustain", e, f"SUSTAIN ({lab})", "integer", "Sustain level.", "patch", panel("fader", f"CC {ccs[2]}", note), range={"min": 0, "max": 127}, default=127)
    par(f"{e}.release", e, f"RELEASE ({lab})", "integer", "Release: up to over 10 s (about 360 ms at mid-travel), non-linear.", "patch", panel("fader", f"CC {ccs[3]}", note), range={"min": 0, "max": 127})
    par(f"{e}.triggering", e, f"TRIGGERING ({lab})", "enum", "Single: no retrigger on legato. Multi: always retrigger. Autoglide: as Single, glide only on legato.", "patch",
        panel("toggle_switch", nr["trig"], note), values=ev(["single", "multi", "autoglide"]), default="multi")
    par(f"{e}.retrigger", e, f"{lab} Env retrigger", "boolean", "Loops the envelope after decay.", "patch", onkey(key, nr["retrig"], 2), default=False)
    par(f"{e}.retrigger_count", e, f"{lab} Env retrigger count", "integer", "Loops; 0 loops forever (needs retrigger on).", "patch", onkey(key, nr["count"], 3), range={"min": 0, "max": 16}, default=0)
    par(f"{e}.fixed_duration", e, f"{lab} Env fixed-duration sustain", "boolean", "Moves to release a set time after sustain starts, held key or not; removes decay; overrides retrigger.", "patch",
        onkey(key, nr["fixed"], 4), default=False)
par("env_amp.velocity", "env_amp", "Velocity: Amp Env", "integer", "Velocity sensitivity of volume; about +40 feels natural.", "patch", onkey("upper D#", "CC 112"), range={"min": -63, "max": 63}, default=0)
par("env_mod.velocity", "env_mod", "Velocity: Mod Env", "integer", "Velocity sensitivity of Mod Env effects.", "patch", onkey("upper E", "CC 113"), range={"min": -63, "max": 63}, default=0)
# LFOs
par("lfo.delay_speed", "lfo1", "LFO DELAY/SPEED", "enum", "Whether the two LFO knobs set speed or delay.", "none", panel("toggle_switch"), values=ev(["delay", "speed"]))
for n, ccs in ((1, {"speed": "CC 18:50", "delay": "CC 86", "wave": "CC 88", "sync": "NRPN 0:87", "keysync": "NRPN 0:89", "slew": "NRPN 0:86",
                    "k_sync": "lower A", "k_key": "lower G", "k_slew": "lower B", "speed_def": 75}),
               (2, {"speed": "CC 19:51", "delay": "CC 87", "wave": "CC 89", "sync": "NRPN 0:91", "keysync": "NRPN 0:93", "slew": "NRPN 0:90",
                    "k_sync": "lower A#", "k_key": "lower G#", "k_slew": "middle C", "speed_def": 52})):
    l = f"lfo{n}"
    par(f"{l}.speed", l, f"LFO {n} SPEED", "integer", "Rate, 0 to about 190 Hz (init 75 = 7.9 Hz for LFO 1, 52 = 3 Hz for LFO 2); in sync mode, picks one of 35 note values.", "patch",
        panel("knob", ccs["speed"], "LFO DELAY/SPEED at SPEED"), range={"min": 0, "max": 255}, default=ccs["speed_def"])
    par(f"{l}.delay", l, f"LFO {n} DELAY", "integer", "Fade-in time after a key.", "patch", panel("knob", ccs["delay"], "LFO DELAY/SPEED at DELAY"), range={"min": 0, "max": 127})
    par(f"{l}.wave", l, f"LFO {n} WAVE", "enum", "LFO waveform.", "patch", panel("push_button", ccs["wave"]), values=ev(["triangle", "saw_down", "square", "sample_hold"]), default="triangle")
    par(f"{l}.speed_sync", l, f"Speed/Sync LFO {n}", "enum", "Free speed or sync to internal/MIDI clock.", "patch", onkey(ccs["k_sync"], ccs["sync"]), values=ev(["speed", "sync"]), default="speed")
    par(f"{l}.keysync", l, f"Keysync LFO {n}", "boolean", "Restarts the LFO on each key.", "patch", onkey(ccs["k_key"], ccs["keysync"]), default=(n == 2))
    par(f"{l}.slew", l, f"Slew LFO {n}", "integer", "Rounds the waveform's edges.", "patch", onkey(ccs["k_slew"], ccs["slew"]), range={"min": 0, "max": 127}, default=0)
# controllers (on-key)
for pid, label, key, nr, fn, dflt in (
        ("ctl.mw_filter", "Mod Wh: Filter Freq", "bottom C", None, "Mod wheel directly on filter frequency.", 0),
        ("ctl.mw_lfo1_pitch", "Mod Wh: LFO 1 to Osc Pitch", "lower C#", "NRPN 0:70", "Mod wheel brings in LFO 1 on both oscillators' pitch (up to 8 octaves).", 10),
        ("ctl.mw_lfo2_filter", "Mod Wh: LFO 2 to Filter Freq", "lower D", "NRPN 0:71", "Mod wheel brings in LFO 2 on filter frequency.", 0),
        ("ctl.mw_osc2_pitch", "Mod Wh: Osc 2 Pitch", "lower D#", "NRPN 0:78", "Mod wheel on Osc 2 pitch (up to 8 octaves).", 0),
        ("ctl.at_filter", "Aftertouch: Filter Freq", "lower E", "NRPN 0:74", "Aftertouch on filter frequency.", 10),
        ("ctl.at_lfo1_pitch", "Aftertouch: LFO 1 to Osc Pitch", "lower F", "NRPN 0:75", "Aftertouch brings in LFO 1 on oscillator pitch.", 0),
        ("ctl.at_lfo2_speed", "Aftertouch: LFO 2 Speed", "lower F#", "NRPN 0:76", "Aftertouch changes LFO 2 speed.", 0)):
    par(pid, "wheels" if pid.startswith("ctl.mw") else "kbd", label, "integer", fn, "patch", onkey(key, nr), range={"min": -63, "max": 63}, default=dflt,
        **({"note": "No MIDI address listed for this on-key function."} if nr is None else {}))
# effects, VCA, portamento
par("dist.amount", "dist", "DISTORTION", "integer", "Post-filter distortion.", "patch", panel("knob", "CC 94"), range={"min": 0, "max": 127})
par("fx.osc_filter_mod", "vcf", "OSC FILTER MOD", "integer", "Osc 2 modulates filter frequency directly (audio-rate FM of the filter).", "patch", panel("knob", "CC 115"), range={"min": 0, "max": 127})
par("vca.limiter", "vca", "VCA: Limiter", "integer", "Output limiting; higher is more compressed and quieter.", "patch", onkey("upper F", "CC 95"), range={"min": 0, "max": 127}, default=0)
par("kbd.glide_time", "kbd", "GLIDE TIME", "integer", "Portamento time; fully anticlockwise is off.", "patch", panel("knob", "CC 5"), range={"min": 0, "max": 127})
par("kbd.glide_divergence", "kbd", "Glide divergence", "integer", "How much slower Osc 2 glides than Osc 1.", "patch", onkey("upper B (Input Gain)", "NRPN 0:113", 2), range={"min": 0, "max": 15}, default=0)
par("out.patch_volume", "out", "Patch volume", "integer", "Stored patch level.", "patch", [{"type": "midi", "message": "CC 7"}], range={"min": 0, "max": 127}, default=100)
par("out.volume", "out", "VOLUME", "continuous", "Line and headphone level.", "none", panel("knob"), panel_scale=S10)
# arpeggiator / sequencer
par("arp.on", "arp", "ON (LEGATO)", "boolean", "Arpeggiator on; in sequence record, ties/legatos the step.", "patch", panel("push_button", "CC 108"))
par("arp.latch", "arp", "LATCH (REST)", "boolean", "Latches the arpeggio; key hold when the arp is off; in sequence record, enters a rest.", "patch", panel("push_button", "CC 109"))
par("arp.tempo", "arp", "TEMPO", "integer", "40-240 BPM; disabled while external MIDI clock is detected.", "none", panel("knob"), range={"min": 40, "max": 240})
par("arp.rhythm", "arp", "RHYTHM", "integer", "One of 32 rhythms, from crotchets to semiquaver patterns; also sets sequence rhythm.", "patch", panel("knob", "CC 119"), range={"min": 1, "max": 32}, default=32)
par("arp.mode", "arp", "ARP MODE", "enum", "Note order, or sequencer Record and Play.", "patch", panel("rotary_switch", "CC 118"),
    values=ev(["up", "down", "updn", "updn2", "played", "random", "record", "play"]), default="up")
par("arp.octaves", "arp", "ARP OCTAVES / SEQ", "integer", "Octaves for the arpeggio; in Record/Play, selects sequence 1-4.", "patch", panel("rotary_switch", "CC 111"), range={"min": 1, "max": 4}, default=1)
par("arp.swing", "arp", "Arp: Swing", "integer", "Swing; 50 is straight.", "patch", onkey("upper F#", "CC 116"), range={"min": 1, "max": 99}, default=50)
par("arp.seq_retrig", "arp", "Arp: Seq Retrig", "boolean", "Restarts the sequence every two bars to match the rhythm.", "patch", onkey("upper G", "NRPN 106"), default=True)
# AFX and tuning
par("afx.bank", "kbd", "AFX overlay bank", "integer", "0 = no overlays, 1-8 = bank of 25 per-key overlays loaded on top of the patch.", "patch", onkey("upper F# (Arp Swing)", "NRPN 0:112", 2),
    range={"min": 0, "max": 8}, default=0)
par("afx.protect", "kbd", "AFX overlay write-protect", "boolean", "Prevents overlay changes while performing.", "global", onkey("upper G (Seq Retrig)", "NRPN 0:116", 2), default=False)
par("kbd.tuning_table", "kbd", "Tuning table", "integer", "0 standard, 1-8 stored tables; morphs live with glide.", "patch",
    onkey("upper A# (Tune)", "RPN 3 (tuning program change)", 2), range={"min": 0, "max": 8}, default=0)
# global
par("sys.midi_channel", "kbd", "Global: MIDI Channel", "integer", "Send and receive channel; kept at power-off.", "global", onkey("upper G#"), range={"min": 1, "max": 16}, default=1)
par("sys.local", "kbd", "Global: Local", "boolean", "Keyboard plays the synth; resets to On at power-up.", "none", onkey("upper A"), default=True)
par("sys.tune", "kbd", "Global: Tune", "integer", "Master tuning; kept at power-off.", "global", onkey("upper A#"), range={"min": -50, "max": 50}, default=0, note="Cents.")
par("sys.input_gain", "mixer", "Global: Input Gain", "integer", "Gain of EXT IN; kept at power-off.", "global", onkey("upper B"), range={"min": -10, "max": 60}, default=0, note="dB.")
par("util.dump", "kbd", "Global: Dump", "enum", "Sends the current patch or all 128 as SysEx over USB and MIDI OUT.", "none", onkey("top C"), values=ev(["one", "all"]))
# performance controls (live)
par("kbd.octave", "kbd", "OCTAVE", "integer", "Keyboard octave shift.", "none", panel("push_button"), range={"min": -5, "max": 4}, default=0)
par("kbd.transpose", "kbd", "TRANSPOSE", "integer", "Semitone transpose.", "none", panel("push_button"), range={"min": -12, "max": 12}, default=0)
par("wheels.bend", "wheels", "PITCH wheel", "continuous", "Spring-centred bend.", "none", panel("wheel", "pitch bend"), panel_scale={"min": -1, "max": 1})
par("wheels.mod", "wheels", "MOD wheel", "continuous", "Mod wheel, routed by the Mod Wh on-key functions.", "none", panel("wheel", "CC 1"), panel_scale={"min": 0, "max": 127},
    note="The guide's MIDI chart lists mod as CC 0; standard mod wheel is CC 1.")
par("util.patch", "kbd", "PATCH/VALUE", "integer", "Selects patch 0-127; sets on-key values.", "none", panel("push_button", "program change"), range={"min": 0, "max": 127})
par("util.save", "kbd", "SAVE", "boolean", "Saves the patch (or overlay bank, or tuning table, on their pages).", "none", panel("push_button"))
par("util.function", "kbd", "FUNCTION/EXIT", "boolean", "Hold with a key for on-key functions.", "none", panel("push_button"))
par("sys.power", "out", "Power switch", "enum", "Off, external DC or USB power.", "none", [{"type": "rear_panel", "control": "slide_switch"}], values=ev(["usb", "off", "ext_dc"]))

# ---------------------------------------------------------------- ports
jack("jack.power", "POWER IN", "in", "power", None, "9 V DC 500 mA, centre positive.", "DC barrel")
jack("jack.usb", "USB", "bidirectional", "midi", None, "USB 1.1 (2.0 compatible), class compliant: MIDI, patch dump, power.", "USB type B")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out, including patch dumps.", "5-pin DIN")
jack("jack.sustain", "SUSTAIN", "in", "gate", "kbd.sustain", "Sustain pedal, N/O or N/C (sensed at power-up).", "6.35 mm TS")
jack("jack.ext_in", "EXT IN", "in", "audio", "mixer.ext", "Mic, instrument or line into the mixer (unbalanced); gain -10 to +60 dB.", "6.35 mm TS")
jack("jack.line_out", "LINE OUTPUT (MONO)", "out", "audio", "out.line", "Unbalanced mono output.", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "Stereo headphones (mono signal), level from VOLUME.", "6.35 mm TRS")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.seq_in", "cv", note="Arpeggio or sequence notes, transposed from the keyboard.")
con("kbd.pitch1", "osc1.pitch_cv")
con("kbd.pitch2", "osc2.pitch_cv", note="Same note as Osc 1 unless paraphonic mode splits them.")
con("kbd.pitch1", "sub.pitch_cv", note="Locked to Osc 1, one or two octaves down.")
for o in ("osc1", "osc2", "sub"):
    con("wheels.bend", f"{o}.pitch_cv", amount="osc.bend_range")
for o in ("osc1", "osc2"):
    con("lfo1.out", f"{o}.pitch_cv", amount=f"{o}.lfo1_depth")
    con("env_mod.out", f"{o}.pitch_cv", amount=f"{o}.modenv_depth")
    con("lfo1.out", f"{o}.pitch_cv", amount_expr="ctl.mw_lfo1_pitch * wheels.mod")
    con("lfo1.out", f"{o}.pitch_cv", amount_expr="ctl.at_lfo1_pitch * kbd.aftertouch")
    con("env_mod.out", f"{o}.pwm_cv", amount=f"{o}.pw_modenv")
    con("lfo2.out", f"{o}.pwm_cv", amount=f"{o}.pw_lfo2")
con("wheels.mod", "osc2.pitch_cv", amount="ctl.mw_osc2_pitch")
con("osc1.out", "osc2.sync_in", "sync", eq("osc.sync", True))
con("osc1.out", "ring.a", "audio")
con("osc2.out", "ring.b", "audio")
for src in ("osc1", "osc2", "sub", "noise", "ring"):
    con(f"{src}.out", f"mixer.{src}", "audio", amount=f"mixer.{src}")
con("mixer.out", "drive.in", "audio", amount="drive.amount")
con("drive.out", "vcf.in", "audio")
con("env_mod.out", "vcf.cutoff_cv", amount="vcf.modenv_depth")
con("lfo2.out", "vcf.cutoff_cv", amount="vcf.lfo2_depth")
con("lfo2.out", "vcf.cutoff_cv", amount_expr="ctl.mw_lfo2_filter * wheels.mod")
con("wheels.mod", "vcf.cutoff_cv", amount="ctl.mw_filter")
con("kbd.aftertouch", "vcf.cutoff_cv", amount="ctl.at_filter")
con("kbd.pitch1", "vcf.cutoff_cv", amount="vcf.tracking", note="Tracking scale is inverted: 0 full, 7 none.")
con("osc2.out", "vcf.cutoff_cv", "audio", amount="fx.osc_filter_mod")
con("kbd.aftertouch", "lfo2.rate_cv", amount="ctl.at_lfo2_speed")
con("vcf.out", "dist.in", "audio")
con("dist.out", "vca.in", "audio", amount="dist.amount")
con("kbd.gate", "env_amp.gate", "gate")
con("kbd.gate", "env_mod.gate", "gate")
con("kbd.velocity", "env_amp.velocity", amount="env_amp.velocity")
con("kbd.velocity", "env_mod.velocity", amount="env_mod.velocity")
con("env_amp.out", "vca.cv")
con("kbd.gate", "lfo1.key_sync", "gate", eq("lfo1.keysync", True))
con("kbd.gate", "lfo2.key_sync", "gate", eq("lfo2.keysync", True))
con("vca.out", "out.in", "audio", amount="out.patch_volume")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["indicators"] = [
    {"id": "display", "module": "kbd", "label": "LED display", "kind": "display", "function": "Three characters: patch number, parameter values, octave, tempo, on-key codes (P-, E-, F-, r-, c-, d-, g-, o-, t-)."},
    {"id": "org_value", "module": "kbd", "label": "ORG. VALUE LEDs", "kind": "led", "function": "Show which way to turn a control to return to its stored value."},
    {"id": "sync_led", "module": "osc2", "label": "SYNC 1-2", "kind": "led", "function": "Lit when Osc 1-2 sync is on."},
    {"id": "lfo_leds", "module": "lfo1", "label": "LFO LEDs", "kind": "led", "function": "Show each LFO's waveform and speed."},
    {"id": "section_leds", "module": "osc1", "label": "range, waveform and sub LEDs", "kind": "led", "function": "Confirm the selected setting of each stepping control."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Shared controls", "applies_to": ["osc1", "osc2", "env_amp", "env_mod", "lfo1", "lfo2", "mixer"],
     "rule": "OSC SELECT points the oscillator controls at Osc 1 or Osc 2 without changing the other. ENV SELECT points the faders and TRIGGERING at Amp, Mod or both. "
             "LFO DELAY/SPEED points the two LFO knobs at speed or delay. NOISE/RING/EXT points the fourth mixer knob at one of three sources, each keeping its level. "
             "The PULSE WIDTH switch picks whether the knob sets manual width, Mod Env depth or LFO 2 depth; all three act together."},
    {"id": "b02", "name": "Signal path", "applies_to": ["mixer", "drive", "vcf", "dist", "vca"],
     "rule": "Mixer, overdrive (before the filter), filter, distortion (after the filter, before the VCA, so it does not change with the envelope), VCA with limiter, VOLUME."},
    {"id": "b03", "name": "Filter types", "applies_to": ["vcf"],
     "rule": "Classic: LP, BP or HP at 12 or 24 dB/oct, FREQUENCY being cutoff or band centre. Acid: 24 dB/oct diode-ladder low-pass; SHAPE and SLOPE do nothing."},
    {"id": "b04", "name": "Modulation routing", "applies_to": ["lfo1", "lfo2", "env_mod", "wheels"],
     "rule": "LFO 1 only reaches oscillator pitch; LFO 2 reaches pulse width and filter frequency; Mod Env reaches pitch, pulse width and filter. The mod wheel and aftertouch "
             "reach their destinations by on-key amounts (-63 to +63); velocity scales Amp and Mod Env."},
    {"id": "b05", "name": "Envelope triggering", "applies_to": ["env_amp", "env_mod", "kbd"],
     "rule": "Single: retriggers only on detached notes, glide on every note if GLIDE TIME is up. Multi: retriggers on every note. Autoglide: as Single but glides only on legato notes. "
             "Optional looping after decay (1-16 times or forever) and fixed-duration sustain for drum sounds."},
    {"id": "b06", "name": "Paraphonic mode", "applies_to": ["kbd", "osc1", "osc2"],
     "rule": "Two held keys play Osc 1 and Osc 2 separately through one filter and VCA. Oscillator error then differs per oscillator."},
    {"id": "b07", "name": "Arpeggiator and sequencer", "applies_to": ["arp"],
     "rule": "Held notes play in the chosen order over 1-4 octaves to one of 32 rhythms; LATCH holds them. In RECORD, notes, rests (LATCH/REST) and ties/legato (ON/LEGATO) fill up to 32 steps in one of four "
             "sequences (lengths not recorded: RHYTHM sets the rhythm). In PLAY, the first key played sets the transposition. SEQ RETRIG restarts the sequence every two bars. Follows incoming MIDI clock automatically."},
    {"id": "b08", "name": "AFX mode", "applies_to": ["kbd"],
     "rule": "An overlay bank gives each of the 25 home-octave keys its own set of parameter changes, recalled when the key plays: a different patch per key. Hold a key and move controls to edit its overlay; "
             "save the bank on its page. Eight banks (1-4 preset); FUNCTION + TRANSPOSE copies overlays between keys. Arpeggiator and global settings are not in overlays."},
    {"id": "b09", "name": "On-key functions", "applies_to": ["kbd"],
     "rule": "Hold FUNCTION/EXIT and press a key (some keys pressed 2-4 times for extended functions), release, set with PATCH/VALUE, then FUNCTION/EXIT or a 10-second timeout. The keyboard keeps playing meanwhile."},
    {"id": "b10", "name": "Memory", "applies_to": ["kbd"],
     "rule": "Edits are lost on patch change unless saved. MIDI channel, master tune and input gain are kept at power-off; Local resets to On; the synth starts on patch 0. A single patch received by SysEx loads into the edit buffer."},
    {"id": "b11", "name": "Micro-tuning", "applies_to": ["kbd"],
     "rule": "Nine tuning tables (0 standard, 1-8 saved: prime, harmonic series, Indian shruti, Ptolemy, Bianzhong, Turkish, slendro/pelog, Carlos super just), editable by MIDI Tuning Standard SysEx; "
             "switching tables with glide up morphs between them."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "program_change", "range": [0, 127]},
                 {"message": "control_change", "note": "every panel control and many on-key functions; see parameter access entries"},
                 {"message": "control_change", "cc": 64, "parameter": "sustain"},
                 {"message": "nrpn", "note": "waveforms, triggering, retrigger, fixed duration, LFO sync/keysync/slew, mod wheel and aftertouch amounts, paraphonic, error, glide divergence, sub tuning, filter tracking, overlays"},
                 {"message": "rpn", "number": 3, "parameter": "tuning program (table select)"}, {"message": "clock"},
                 {"message": "sysex", "header": "F0 00 20 29 00 33 00", "commands": {"47": "greeting message", "48": "save tuning tables", "49": "clear overlay bank", "4A": "save overlay bank",
                                                                                     "4B": "copy overlay", "4C": "clear overlay", "4D": "move overlay", "4E": "import overlay", "4F": "export overlay request"}},
                 {"message": "sysex", "header": "F0 7F id 08 02", "note": "MIDI Tuning Standard note change"}],
    "transmits": [{"message": "note_on"}, {"message": "note_off"}, {"message": "control_change"}, {"message": "nrpn"}, {"message": "sysex", "note": "patch dumps (one or all 128), overlay exports"}],
    "channel_note": "One channel 1-16 (upper G# on-key), kept at power-off.",
    "high_resolution": "Paired CCs (e.g. 16:48 for filter frequency) give 8-bit values (0-255) for oscillator, mixer, filter and LFO speed controls.",
    "note": "Novation Components (web or desktop) manages patches, overlays, tuning tables, the greeting message and firmware."}
D["specifications"] = {
    "keyboard": "25 keys, velocity and aftertouch", "polyphony": "mono, paraphonic option (2 notes)", "oscillators": "2 + sub", "lfos": 2, "envelopes": 2,
    "filter": {"classic": "LP/BP/HP, 12 or 24 dB/oct", "acid": "24 dB/oct diode ladder LP"}, "lfo_rate_hz": [0, 190], "envelope_times_s": {"attack_max": 5, "release_max": 10},
    "patches": {"factory": 64, "user": 64}, "sequencer": "4 x 32 steps", "arp_rhythms": 32, "afx_overlay_banks": 8, "tuning_tables": 9,
    "connections": {"midi": "5-pin DIN in and out", "usb": "type B, USB 1.1 (2.0 compatible), class compliant, bus power",
                    "audio": "1/4\" mono line out, 1/4\" stereo headphones, 1/4\" external input", "sustain": "1/4\", N/O or N/C"},
    "power": {"adaptor": "9 V DC 500 mA, centre positive, 100-240 V AC", "alternative": "USB bus power"},
}
D["omitted_from_source"] = ["the synthesis tutorial", "block diagram images (signal path taken from the text)", "Novation notices", "getting started steps beyond patch save/load",
                            "the per-character mapping for greeting messages"]
D["not_in_source"] = ["dimensions and weight", "output level and impedance", "filter and oscillator circuit details", "the tempo control's MIDI address", "SysEx patch dump format"]
D["source_inconsistencies"] = [
    "The box contents list a 12 V DC PSU; the power section and supplied PSU are 9 V DC 500 mA.",
    "The envelope section says Mod Env reaches filter frequency 'when the filter is in Classic mode'; the filter section applies Mod Env depth to both types.",
    "Aftertouch LFO 1 to Osc Pitch gives a maximum of 95 semitones 'or 8 octaves'; the mod wheel version gives 96.",
    "Pitch Bend Range runs -24 to +24 on the panel but 1 to 12 in the MIDI chart.",
    "The MIDI chart lists the mod wheel as CC 0 (bank select) rather than CC 1.",
    "The init patch table has LFO 2 sync value 'on' but Speed/Sync LFO 2 'speed'.",
    "Osc 2 manual pulse width runs 5 to 94.3 in the MIDI chart; Osc 1 runs 5 to 95.",
    "Oscillators use a rising sawtooth; the LFOs use a falling one.",
]
D["modelling_gaps"] = [
    {"topic": "AFX overlays", "detail": "Overlay contents (per-key parameter sets) are described, not modelled; the overlay parameter list is in the guide's appendix."},
    {"topic": "Shared panel controls", "detail": "Each oscillator and envelope parameter is modelled separately, with the selector switch noted in its access."},
    {"topic": "Sequences", "detail": "Four global sequences of up to 32 steps are described in behaviours; their step data is not modelled as parameters."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/novation-bass-station-ii_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
