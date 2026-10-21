#!/usr/bin/env python3
"""Assemble the Sequential Fourm device file (schema 0.12.0).

Four-voice analogue poly with a Tactive polyphonic-aftertouch keybed (37 slim keys):
two VCOs with simultaneous waves (A: saw, pulse, sync; B: tri, saw, pulse, two LFO
ranges), noise (white/pink/violet), feedback, a Prophet-5 rev 1/2 style 4-pole low-pass
with bass compensation, filter and amp ADSRs, an LFO (multiple simultaneous shapes,
S/H types incl. noise and DC), a Pro-One style modulation section with direct and Mod
Wheel buses, an aftertouch section, unison/chord memory, glide, arpeggiator with 64-step
note/mod sequencer, 512 programs.

Sources: Fourm User Guide v1.2 and Factory Presets v2 (supplied); midi.guide CC chart
(January 2026); Sequential product page and retailer specs for hardware details.
"""
import json

S10 = {"min": 0, "max": 10}
K127 = {"min": 0, "max": 127}
D = {"schema_version": "0.12.0"}
M, P, J, C = [], [], [], []


def mod(id, type, name, section, desc, inputs, outputs, scope="per_voice", props=None):
    m = {"id": id, "type": type, "name": name, "panel_section": section, "scope": scope, "description": desc}
    if props:
        m["properties"] = props
    m.update({"inputs": inputs, "outputs": outputs})
    M.append(m)


def par(id, module, label, kind, fn, memory="patch", control="knob", cc=None, **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["memory"] = memory
    acc = kw.pop("access", None) or [{"type": "panel", "control": control, **({"note": kw.pop("hold")} if "hold" in kw else {})}]
    if cc is not None:
        acc = acc + [{"type": "midi", "message": f"CC {cc}"}]
    p["access"] = acc
    p["function"] = fn
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def knob(id, module, label, fn, cc=None, **kw):
    kw.setdefault("range", K127)
    par(id, module, label, "integer", fn, cc=cc, **kw)


def btn(id, module, label, fn, cc=None, **kw):
    par(id, module, label, "boolean", fn, control="push_button", cc=cc, **kw)


def enum(id, module, label, fn, vals, control="push_button", cc=None, **kw):
    par(id, module, label, "enum", fn, control=control, cc=cc, values=[{"value": v} for v in vals], **kw)


def pmenu(id, module, label, kind, fn, n, cc=None, **kw):
    acc = [{"type": "menu", "note": f"PARAM menu, {n}"}]
    if "hold" in kw:
        acc.insert(0, {"type": "panel", "control": "push_button", "note": kw.pop("hold")})
    par(id, module, label, kind, fn, access=acc, cc=cc, **kw)


def glob(id, label, kind, fn, n, **kw):
    par(id, "kbd", label, kind, fn, memory="global", access=[{"type": "menu", "note": f"GLOBAL menu, {n}"}], **kw)


def jack(id, label, direction, signal, node, fn, connector, **kw):
    j = {"id": id, "label": label, "location": "rear", "direction": direction, "signal": signal, "connector": connector, "node": node, "function": fn}
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


def eq(p, v):
    return {"param": p, "equals": v}


def anyof(p, *vs):
    return {"any": [eq(p, v) for v in vs]}


PRESETS = {"U1/F1": ["A New Legend", "Four Keys", "The Bassics", "Eeee Peeee", "Syncing Pressure", "Sakamo", "Mod My Arp", "Fourmer Brass", "Petite Sweeper", "Hollo Legato", "Bizarre Evolution", "FingerTimbres", "Stringee", "Stairways", "Sensitive SouI", "Lonely Star", "Glass Echo", "Uptight Bass", "Kalimbalalala", "Clavinot", "Club Class", "Leo Sun", "Drum Muhsheen", "Organic Fourm", "Dynamik Pad", "S.Genevieve", "Vibrofoam", "Bon’s Bass", "More Than That", "Unisyncerizer", "Mellow Bells", "Tahoe Blizzard", "Really Swell", "Cello Requiem", "Bass UP", "VibroTouch", "Octaver Lead", "Transmitter Fairies", "Floot", "Guitar Plucks", "Common Era", "Mini Prophet", "Zawilead", "Ryan Reverse", "Sawyer Vibez", "Acids Pro", "Trunk Rattler", "Jovia Luna", "Br0 Presh Bazr", "Game Runner", "Ana-Strangz", "Machine Learning", "Tough Industry", "CT-405", "Zizzle Poly", "Gow Gow Gow", "Pentaphonics", "64 World", "CompOrLead", "Saxemophone", "Mod 3 Modpad", "Seq Mod", "Alien Opportunity", "Old Unreliable", "Sitauwr", "Slow Fourm", "Carillon", "Spitty Lead", "Sin Cussion", "AT Foum Horn", "Seventh Heaven", "PluckyArp", "Las Olas", "Toms", "The Pulse", "PluckyTrill", "Poseidon PWM", "Mr. Thickums", "Clickbell", "Modular Bass", "R2 MW=Litespeed", "Xylo", "A Square Deal", "Hyper Tension", "Kick", "Echo Repeat", "Shamisen", "Narrow Entry", "Rodeo Fog", "Classy Arp", "Gowp", "Jazz Hands", "Hard Sync", "Bassic Fourm", "Velo Harpisi", "Insert Quarter", "Tooba", "PWM Pusher", "Utility Player", "Jet", "Fourm Wow", "Halo Pad", "Echosync", "PluckyBass", "Celeste-ial", "Body Bass", "Mod Wheel XM", "Snare", "Depth Charge MW", "The Pulses", "Ye Olde Poly", "Aggro Feedback", "Chalk Glitch", "8-bit Glitter", "Koto", "Noiseping", "Kinda Choral", "Bottle Service", "This Just In", "Aereal", "Naevin2", "Tiny Bells", "Hats Off", "Swarmish", "Hyper Duck", "Brite Pulses", "Ball Game Lead", "Service Soon"], "F2": ["Cloaked Pulse", "Shapes Emerge", "Bounce Bass", "Sinking", "Cubic Bells", "Silkenh’Arp", "Woodland", "Trooze Schmooze", "Wurly2Clav", "Revolverlution", "DirtStep", "Klangor Tine", "Simplton", "Power Bracelet", "Grey Veil", "Chord Trim", "Bit of Brass", "Marimba Arp", "Canada Bells", "Robust Funk", "Vintage Wow", "DLC Is Coming", "String Cheese", "Nuno Plux", "Thumper", "Squeaky Window", "Fifth Phase", "Rumble SouI", "Sweatband", "Dark HipHop Bass", "Drummy", "B34Tz", "Emetic", "Walk The Plank", "Around The Bend", "Danger Pulse", "Frances", "Clarinoot", "Reverie", "ThunderLine", "Chill and Soulful", "DynoVibe", "Unstable Drops", "Feeling Good", "Cloud Pull", "Spectral Choir", "Agro 808", "Chateau Darling", "Drunk Majestica", "Cat lnterference", "Feedback Cycle", "Carbonation", "Orchnies", "Vibey Triangle Lead", "ModW Verb", "Workmans Comp", "Recorder", "MysteryPong", "Mastiff Bass", "VoxyAftertouch", "Loafers", "Wubbly", "Gramaphone", "Ballistics", "Boxing Match", "Mellow M7", "Oldham Prince", "Faded Memory", "OhmDroner", "Fireside Chat", "Square Echoes", "IDM Builder", "Canadian Squares", "PolyMatrixBrass", "Accordion", "Belial", "TapeCassetteBell", "BuzzPluk", "Chinwag", "Velvet Horns", "Dukey Stick", "Beethorgan", "Harpy Delay Wheel", "Aerodynamic", "KikaBoom", "Archtop", "Bell Breath", "A.I. Opera", "Meanderthal", "Krasnale", "Ponger Poks", "Cheap Flight", "Superbassic chug", "exPress", "Atomic Muffins", "Cozymo", "Scurry", "Bach Rock", "Bell Corridor", "Conchordance", "Wah Key", "Starbright", "Tank Buzzer", "Fuzzy Feeling", "Uber Lead", "Pressure Gate", "Down The Pit", "Broadside", "Sawquenza", "Stand Band", "Deactivate", "Dirty Dancehall", "South Swell", "Coquette Em", "Flurious Lead", "AngryMod", "Slow Flash", "Metallurgy", "Get Froggy", "Soothing EP", "Wheelfool", "Tape Starter", "Gathering", "Brutish Lead", "PolyzModly", "Pan in Pool", "Wubber Wheel", "Cheap Flight"]}

D["device"] = {
    "id": "sequential-fourm", "manufacturer": "Sequential", "model": "Fourm",
    "category": "4-voice analogue polyphonic synthesizer, 37 slim keys with polyphonic aftertouch",
    "based_on": "Prophet-5 voice architecture (envelope curves, rev 1/2 style filter) with a Pro-One style modulation section; released 2025.",
    "sources": [
        {"id": "guide", "title": "Sequential Fourm User Guide, version 1.2", "kind": "user_manual", "file": "Sequential_Fourm-User-Guide_1_2.pdf", "pages": 113,
         "note": "Rear panel, globals (36), every section, modulation, aftertouch, unison/chord, glide, arpeggiator and sequencer, clock, Param menu (30), calibration, SysEx, 65 alternative tunings. No MIDI chart."},
        {"id": "presets", "title": "Sequential Fourm Factory Presets v2", "kind": "other", "file": "Sequential_Fourm-Factory-Presets_v2.pdf", "pages": 2, "note": "Program names for banks U1/F1 and F2."},
        {"id": "midiguide", "title": "midi.guide, 'Sequential Fourm MIDI CCs and NRPNs' (January 2026)", "kind": "other", "file": "https://midi.guide/d/sequential/fourm/",
         "note": "Community CC chart, 101 parameters; NRPNs exist (Param In/Out) but are not listed."},
        {"id": "product", "title": "Sequential Fourm product page; Perfect Circuit and other retailer specifications; Audiofanzine review", "kind": "other",
         "file": "https://sequential.com/modern-analog/fourm/", "note": "37 slim keys, Prophet-5 rev 1/2 4-pole filter with bass compensation, 562 x 251 x 70 mm, 3.97 kg."},
    ],
}
D["architecture"] = {
    "synthesis": "subtractive", "signal_path": "analogue", "voices": 4, "polyphony_mode": "4-voice polyphonic with polyphonic aftertouch; unison 1-4 voices (with key priority) or chord memory",
    "poly_chain_max_units": None, "patch_memory": True,
    "patch_memory_note": "512 programs: User Banks 1-2 (writable; U2 ships as 128 Basic Programs) and Factory Banks 1-2 (permanent), 128 each; sequences and chord memory saved per program; category browsing.",
    "semi_modular": False, "panel_counts": {"keys": 37, "voices": 4},
    "summary": ("Per voice: Oscillator A (saw and/or pulse, sync to B) and Oscillator B (triangle, saw and/or pulse; lo1/lo2 LFO ranges), 5-octave ranges and ±7 semitone fine tune, "
                "pulse widths in the Param menu; a mixer with noise (white, pink, violet) and a soft-clipping feedback path from the filter output; a 4-pole resonant low-pass "
                "(Prophet-5 rev 1/2 style, bass compensated) with filter ADSR, key tracking and velocity; an amp ADSR with velocity. A Pro-One style modulation section routes "
                "filter envelope, Osc B and LFO (any of saw, triangle, square, S/H at 0.021-556 Hz) through a direct bus or the Mod Wheel bus to eight destinations; an aftertouch "
                "section sends poly pressure to up to six. Unison, chord memory, hold, glide (4 modes), arpeggiator with 64-step note and mod sequencer, 65 alternative tunings."),
}

# ---------------------------------------------------------------- modules
mod("kbd", "voice_allocator", "Keyboard and voice assigner", "KEYBOARD / UNISON / TRANSPOSE", "37-key Tactive keybed (velocity, poly aftertouch); 4 voices, unison 1-4 with key priority, chord memory, hold, glide, transpose ±2 octaves, alternative tunings.",
    ["kbd.midi_in", "kbd.pedal", "kbd.arp_in"], ["kbd.pitch", "kbd.gate", "kbd.velocity", "kbd.aftertouch", "kbd.modwheel", "kbd.bend"], scope="common", props={"keys": 37})
mod("osc_a", "oscillator", "Oscillator A", "OSCILLATOR A", "Analogue VCO: sawtooth and pulse, selectable together; hard sync to Osc B; 5-octave range, ±7 semitones fine.", ["osc_a.pitch_cv", "osc_a.pw_cv", "osc_a.sync_in"], ["osc_a.out"])
mod("osc_b", "oscillator", "Oscillator B", "OSCILLATOR B", "Analogue VCO: triangle, sawtooth and pulse, selectable together; lo1 (LFO range, key tracked) and lo2 (LFO range, no tracking); a modulation source.",
    ["osc_b.pitch_cv", "osc_b.pw_cv"], ["osc_b.out"])
mod("noise", "noise", "Noise", "MIXER", "White, pink or violet noise.", [], ["noise.out"])
mod("mixer", "mixer", "Mixer", "MIXER", "Osc A and Osc B levels, noise (on/level) and feedback (on/level) from the filter output through soft-clipping diodes.",
    ["mixer.a", "mixer.b", "mixer.noise", "mixer.feedback"], ["mixer.out"])
mod("vcf", "filter", "Filter", "FILTER", "4-pole resonant low-pass after the Prophet-5 rev 1/2 design, with bass compensation; self-oscillates; key tracking quarter, half or full.",
    ["vcf.in", "vcf.cutoff_cv"], ["vcf.out"], props={"slope_db_per_oct": 24})
mod("env_f", "envelope", "Filter envelope", "FILTER ENVELOPE", "ADSR (Prophet-5 response curves) to cutoff by ENV AMT (bipolar), with velocity; also a modulation source.", ["env_f.gate", "env_f.velocity"], ["env_f.out"])
mod("env_a", "envelope", "Amp envelope", "AMP ENVELOPE", "ADSR to the VCA, with velocity.", ["env_a.gate", "env_a.velocity"], ["env_a.out"])
mod("vca", "vca", "VCA", "AMP ENVELOPE", "Voice amplifier under the amp envelope; a modulation and aftertouch destination.", ["vca.in", "vca.cv"], ["vca.out"])
mod("lfo", "lfo", "LFO", "LFO", "0.021-556 Hz or synced; saw (or reverse), triangle, square and S/H selectable together; S/H types S/H, random, pink, white, violet, DC. Monophonic.",
    ["lfo.rate_cv", "lfo.amount_cv"], ["lfo.out"], scope="common", props={"rate_hz": [0.021, 556]})
mod("modbus", "modulation_bus", "Modulation section", "MODULATION", "Pro-One style: three sources (filter env, Osc B, LFO), each with an amount and a route (direct bus or Mod Wheel bus), to eight destinations each set to direct, Mod Wheel or both.",
    ["modbus.env", "modbus.oscb", "modbus.lfo", "modbus.wheel"], ["modbus.direct", "modbus.mw"])
mod("at", "modulation_bus", "Aftertouch section", "AFTERTOUCH", "Poly pressure with one bipolar amount to up to six destinations (Freq A, Freq B, filter, amp, LFO freq, LFO amount) on three destination buttons.", ["at.in"], ["at.out"])
mod("arp", "sequencer", "Arpeggiator and sequencer", "ARPEGGIATOR", "Arpeggiator (up, down, up+down 1/2, random, assign; 1-3 octaves; repeats; relatch; beat sync) and 64-step Seq Note / Seq Mod modes; 30-250 BPM, clock divisions, MIDI clock.",
    [], ["arp.notes", "arp.seqmod"], scope="common", props={"tempo_bpm": [30, 250], "steps": 64})
mod("out", "output", "Output", "VOLUME / rear panel", "Mono main output and headphones; VOLUME (not stored) and program volume.", ["out.in"], ["out.main", "out.phones"], scope="common")

# ---------------------------------------------------------------- oscillators
enum("osc_a.octave", "osc_a", "OCTAVE (Osc A)", "5-octave range.", ["-2", "-1", "0", "+1", "+2"], "encoder", 12)
knob("osc_a.freq", "osc_a", "FREQUENCY (Osc A)", "±7 semitones; centre detent.", 13, panel_scale={"min": -7, "max": 7})
btn("osc_a.sync", "osc_a", "SYNC", "Hard-syncs Osc A to Osc B.", 14)
btn("osc_a.saw", "osc_a", "SAW (Osc A)", "Sawtooth on.", 15)
btn("osc_a.pulse", "osc_a", "PULSE (Osc A)", "Pulse on.", 16)
pmenu("osc_a.pw", "osc_a", "Pulse Width A", "integer", "-63 to +64: 0 is 50%, extremes narrow to silence; negative inverts phase.", "1", cc=17, hold="hold PULSE (Osc A) and turn select", range={"min": -63, "max": 64})
enum("osc_b.octave", "osc_b", "OCTAVE (Osc B)", "5 octaves plus lo1 (LFO range, key tracked) and lo2 (LFO range, untracked).", ["lo2", "lo1", "-2", "-1", "0", "+1", "+2"], "encoder", 19,
     note="CC 19 runs 0-6; order of the lo positions within it is assumed.")
knob("osc_b.freq", "osc_b", "FREQUENCY (Osc B)", "±7 semitones; centre detent.", 20, panel_scale={"min": -7, "max": 7})
btn("osc_b.tri", "osc_b", "TRI (Osc B)", "Triangle on.", 21)
btn("osc_b.saw", "osc_b", "SAW (Osc B)", "Sawtooth on.", 22)
btn("osc_b.pulse", "osc_b", "PULSE (Osc B)", "Pulse on.", 23)
pmenu("osc_b.pw", "osc_b", "Pulse Width B", "integer", "-63 to +64.", "2", cc=24, hold="hold PULSE (Osc B) and turn select", range={"min": -63, "max": 64})
knob("mixer.osc_a", "mixer", "OSC A (mixer)", "Osc A level.", 18)
knob("mixer.osc_b", "mixer", "OSC B (mixer)", "Osc B level.", 25)
btn("mixer.noise_on", "mixer", "NOISE", "Noise on.", 26)
pmenu("mixer.noise", "mixer", "Noise Level", "integer", "0-127 (127 when first engaged).", "3", cc=27, hold="hold NOISE and turn select", range=K127)
pmenu("noise.type", "noise", "Noise Type", "enum", "Noise colour.", "4", cc=28, values=[{"value": v} for v in ["white", "pink", "violet"]], default="white")
btn("mixer.feedback_on", "mixer", "FEEDBACK", "Post-filter feedback into the filter (soft-clipping diodes).")
pmenu("mixer.feedback", "mixer", "Feedback", "integer", "Feedback level (default 100 when engaged).", "6", hold="hold FEEDBACK and turn select", range=K127, default=100)
# filter and envelopes
knob("vcf.cutoff", "vcf", "CUTOFF", "Low-pass cutoff.", 39)
knob("vcf.resonance", "vcf", "RESONANCE", "Emphasis; self-oscillates at high settings (bass compensated).", 40)
knob("vcf.env_amt", "vcf", "ENV AMT", "Bipolar filter envelope depth.", 49, panel_scale={"min": -5, "max": 5})
btn("vcf.keytrack_on", "vcf", "KEY TRACK", "Key tracking on.", 41)
pmenu("vcf.keytrack", "vcf", "Filt Keytrack", "enum", "Tracking amount (full = semitone steps).", "5", cc=42, hold="hold KEY TRACK and turn select", values=[{"value": v} for v in ["quarter", "half", "full"]])
for e, cc0, vel_on, vel_amt, n in (("env_f", 43, 47, 48, "7"), ("env_a", 50, 54, 55, "8")):
    lab = "FILTER ENV" if e == "env_f" else "AMP ENV"
    for k, nm in enumerate(("attack", "decay", "sustain", "release")):
        knob(f"{e}.{nm}", e, f"{lab} {nm.upper()}", f"{nm.title()}.", cc0 + k)
    btn(f"{e}.vel_on", e, f"VELOCITY ({lab})", "Velocity sensitivity on.", vel_on)
    pmenu(f"{e}.vel_amt", e, f"{'Filter' if e == 'env_f' else 'Amp'} Env Vel", "integer", "Velocity amount (default 127).", n, cc=vel_amt, hold=f"hold VELOCITY ({lab}) and turn select", range=K127, default=127)
pmenu("env.retrig", "env_a", "Env Retrig", "boolean", "Retrigger both envelopes on every key.", "15", cc=37)
pmenu("vintage", "kbd", "Vintage", "integer", "Simulated ageing: voice-to-voice variation of oscillators, filters and envelopes.", "11", range=K127)
# LFO
btn("lfo.sync", "lfo", "SYNC (LFO)", "Sync to the clock.", 56)
knob("lfo.freq", "lfo", "FREQUENCY (LFO)", "0.021-556 Hz.", 57, physical={"min": 0.021, "max": 556, "unit": "Hz"})
pmenu("lfo.sync_freq", "lfo", "LFO Sync Freq", "enum", "Clock division when synced.", "14", cc=58,
      values=[{"value": v} for v in ["32 steps", "16 steps", "8 steps", "6 steps", "4 steps", "3 steps", "2 steps", "1.5 steps", "1 step", "2/3 step", "1/2 step", "1/3 step", "1/4 step", "1/6 step", "1/8 step", "1/16 step"]])
par("lfo.shapes", "lfo", "SHAPE buttons (saw, tri, square, s/h)", "integer", "Any combination of the four shapes (bitmask).", control="push_button", cc=59, range={"min": 0, "max": 15})
pmenu("lfo.rev_saw", "lfo", "LFO Rev Saw", "boolean", "Reverse sawtooth.", "12", cc=60, hold="hold SAW (LFO)")
pmenu("lfo.sh_type", "lfo", "LFO S/H Type", "enum", "What the S/H shape produces.", "13", cc=61, hold="hold S/H (LFO)", values=[{"value": v} for v in ["s_h", "random", "pink", "white", "violet", "dc"]])
# modulation section
for s, lab, rc, ac in (("env", "FILT ENV", 75, 78), ("oscb", "OSC B", 76, 79), ("lfo", "LFO", 77, 80)):
    enum(f"mod.{s}_route", "modbus", f"{lab} ROUTE", "Off, direct bus (red) or Mod Wheel bus (blue).", ["off", "direct", "mw"], cc=rc)
    knob(f"mod.{s}_amt", "modbus", f"{lab} AMOUNT", "Bipolar modulation amount (maximum for the Mod Wheel bus).", ac, panel_scale={"min": -5, "max": 5})
DESTS = [("freq_a", "FREQ A", 81), ("freq_b", "FREQ B", 82), ("pw_a", "PW A", 83), ("pw_b", "PW B", 84), ("cutoff", "CUTOFF", 85), ("amp", "AMP", 86), ("lfo_freq", "LFO FREQ", 87), ("lfo_amt", "LFO AMT", 88)]
for d, lab, cc in DESTS:
    enum(f"mod.dst_{d}", "modbus", f"{lab} (destination)", "Off, direct (red), Mod Wheel (blue) or both (purple).", ["off", "direct", "mw", "both"], cc=cc)
knob("at.amount", "at", "AFTERTOUCH AMOUNT", "One bipolar amount for all aftertouch destinations.", 89, panel_scale={"min": -5, "max": 5})
for i, (pair, cc) in enumerate((("freq_a / freq_b", 92), ("filt / amp", 93), ("lfo freq / lfo amt", 94)), start=1):
    enum(f"at.dest{i}", "at", f"AFTERTOUCH DEST {i} ({pair})", "Off, first, second or both destinations of this button.", ["off", "first", "second", "both"], cc=cc,
         note="Pairing of destinations to the three buttons follows the guide's list order.", confidence="inferred")
# voicing, glide, arp
btn("kbd.unison", "kbd", "UNISON", "Unison on (hold for voices or chord memory).", 29)
pmenu("kbd.unison_voices", "kbd", "Unison Vox", "enum", "1-4 voices, or chord memory (2-4 notes held when UNISON is pressed).", "9", cc=30, hold="hold UNISON and turn select",
      values=[{"value": v} for v in ["1", "2", "3", "4", "chord"]])
pmenu("kbd.unison_detune", "kbd", "Unison Detune", "integer", "0-127.", "10", cc=31, range=K127)
pmenu("kbd.key_priority", "kbd", "Key Priority", "enum", "Unison note priority.", "16", cc=36, values=[{"value": v} for v in ["low", "high", "last"]])
btn("kbd.hold", "kbd", "HOLD", "Sustains held notes (up to four; level from amp sustain); latches the arpeggiator.")
btn("kbd.glide_on", "kbd", "GLIDE", "Glide on.", 33)
knob("kbd.glide_rate", "kbd", "GLIDE RATE", "Glide time (also used for sequencer note glides).", 34)
pmenu("kbd.glide_mode", "kbd", "Glide Mode", "enum", "Fixed Rate (default), Fixed Rate A (legato), Fixed Time, Fixed Time A; A and Time modes need unison.", "17", cc=35, hold="hold GLIDE",
      values=[{"value": v} for v in ["fixed_rate", "fixed_rate_a", "fixed_time", "fixed_time_a"]])
btn("arp.on", "arp", "ON (arpeggiator)", "Arpeggiator or sequencer on.", 65)
pmenu("arp.mode", "arp", "Arp Mode", "enum", "Note order, or Seq Note / Seq Mod.", "21", cc=66, hold="hold MODE|TIE",
      values=[{"value": v} for v in ["up", "down", "up_down_1", "up_down_2", "random", "assign", "seq_note", "seq_mod"]])
pmenu("arp.octave", "arp", "Arp Octave", "enum", "1-3 octaves.", "20", cc=67, hold="hold OCTAVE|REST", values=[{"value": v} for v in ["1", "2", "3"]])
pmenu("arp.repeat", "arp", "Arp Repeat", "enum", "Repeats per note.", "23", cc=68, values=[{"value": v} for v in ["off", "1", "2", "3"]])
pmenu("arp.relatch", "arp", "Arp Relatch", "boolean", "New notes restart the held arpeggio.", "22", cc=69, default=True)
pmenu("arp.beat_sync", "arp", "Arp Beat Sync", "boolean", "Start notes only on the beat.", "24", cc=70)
pmenu("arp.seq_play_mode", "arp", "Seq Play Mode", "enum", "Retrig, continue, one shot or step.", "25", cc=72, values=[{"value": v} for v in ["retrig", "continue", "one_shot", "step"]])
pmenu("arp.seq_mod_dest", "arp", "Seq Mod Dest", "enum", "Mod sequence destination.", "26", cc=73,
      values=[{"value": v} for v in ["osc_freq_a", "osc_freq_b", "filter_cutoff", "mod1_amt", "mod2_amt", "mod3_amt", "lfo_freq", "pw_a", "pw_b", "pw_all", "feedback"]], default="osc_freq_a")
par("arp.seq_length", "arp", "Sequence length (reset step)", "integer", "Steps recorded before the reset step.", control="push_button", cc=71, range={"min": 1, "max": 64})
btn("arp.rec", "arp", "REC", "Arms note or mod sequence recording; OCTAVE|REST adds rests, MODE|TIE ties (hold a key with TIE for a note glide).", memory="none")
pmenu("arp.bpm", "arp", "BPM", "integer", "30-250 (tap 4 times on TAP TEMPO).", "18", cc=102, hold="hold TAP TEMPO|BPM and turn select", range={"min": 30, "max": 250})
pmenu("arp.clock_div", "arp", "Clock Div", "enum", "Note value per step.", "19", cc=103, values=[{"value": v} for v in ["1/2", "1/4", "1/8", "1/8D", "1/8S", "1/8T", "1/16", "1/16S", "1/16T", "1/32", "1/64"]])
# misc
pmenu("kbd.bend_range", "kbd", "Wheel Range", "integer", "Pitch wheel range 0-12 semitones up and down.", "27", cc=3, hold="hold PITCH WHEEL and turn select", range={"min": 0, "max": 12})
pmenu("out.prog_vol", "out", "Program Vol", "integer", "Per-program level (default 100).", "28", cc=95, hold="hold PROG VOL and turn select", range=K127, default=100)
pmenu("kbd.transpose", "kbd", "Transpose (TRANSPOSE up/down)", "integer", "Keyboard octave transpose, saved per program.", "-", cc=105, range={"min": -2, "max": 2})
pmenu("kbd.alt_tune", "kbd", "Alt Tune", "enum", "Use Global, equal temperament or one of 65 tunings per program.", "30", cc=104, values=[{"value": "use_global"}, {"value": "tunings 1-65"}])
pmenu("kbd.category", "kbd", "Category", "enum", "Program category.", "29", cc=106,
      values=[{"value": v} for v in ["Misc", "Pad", "Lead", "Bass", "Poly", "Keys", "String", "Pluck", "Bell", "Arp", "Brass", "Voice", "Organ", "Percussion", "Tuned Percussion", "SFX"]])
par("out.volume", "out", "VOLUME", "continuous", "Main and headphone level (not programmable).", memory="none", cc=7, panel_scale=S10)
par("kbd.pitch_wheel", "kbd", "PITCH wheel", "continuous", "Spring-loaded bend.", memory="none", control="wheel", panel_scale={"min": -1, "max": 1}, access=[{"type": "panel", "control": "wheel"}, {"type": "midi", "message": "pitch bend"}])
par("kbd.mod_wheel", "kbd", "MOD wheel", "continuous", "Scales everything on the Mod Wheel bus.", memory="none", control="wheel", cc=1, panel_scale=K127)
for pid, label, fn in (("ui.program", "PROGRAM", "Program mode; hold to save."), ("ui.param", "PARAM", "Param menu."), ("ui.global", "GLOBAL / NAME", "Global menu; names programs while saving."),
                       ("ui.select", "SELECT encoder", "Scroll and edit; push to change rows."), ("ui.inc_dec", "INC/SAVE, DEC/EXIT", "Step values, confirm or cancel."), ("ui.tap", "TAP TEMPO|BPM", "Tap tempo.")):
    par(pid, "kbd", label, "boolean", fn, memory="none", control="encoder" if "SELECT" in label else "push_button")
# globals
glob("sys.coarse_tune", "Coarse Tune", "integer", "Global transpose ±12 semitones.", "1", range={"min": -12, "max": 12})
glob("sys.fine_tune", "Fine Tune", "integer", "±50 cents.", "2", range={"min": -50, "max": 50})
glob("sys.local", "Local Control", "enum", "All off, keys/wheels off, or on.", "3", values=[{"value": v} for v in ["all_off", "keys_wheels_off", "on"]], default="on")
glob("sys.pot_mode", "Pot Mode", "enum", "Relative, passthru or jump.", "4", values=[{"value": v} for v in ["relative", "passthru", "jump"]])
glob("sys.foot_control", "Foot Control", "enum", "Expression pedal or foot switch.", "5", values=[{"value": "exp_pedal"}, {"value": "foot_switch"}])
glob("sys.ftsw_function", "Ft Switch Function", "enum", "Sustain, arp hold, arp hold momentary, seq start/stop, trigger, gate, trigger+gate (switch or audio signal).", "6",
     values=[{"value": v} for v in ["sustain", "arp_hold", "arp_hold_mom", "seq_start_stop", "trigger", "gate", "t_g"]])
glob("sys.exp_function", "Exp Pedal Function", "enum", "Filter full, filter half, mod filter env, mod Osc B, mod LFO, volume.", "7",
     values=[{"value": v} for v in ["filter_full", "filter_half", "mod_filter_env", "mod_osc_b", "mod_lfo", "volume"]])
glob("sys.ftsw_polarity", "FtSw Polarity", "enum", "Normal or reverse.", "8", values=[{"value": "normal"}, {"value": "reverse"}])
glob("sys.aftertouch", "Aftertouch", "enum", "Off, mono or poly.", "9", values=[{"value": v} for v in ["off", "mono", "poly"]], default="poly")
glob("sys.at_curve", "Atouch Curve", "enum", "Aftertouch response.", "10", values=[{"value": v} for v in ["medium", "hard1", "hard2", "soft1", "soft2"]], default="medium")
glob("sys.vel_curve", "Velocity Curve", "enum", "Velocity response.", "11", values=[{"value": v} for v in ["medium", "hard_plus", "hard", "soft_plus", "soft"]], default="medium")
glob("sys.midi_channel", "MIDI Channel", "enum", "All or 1-16.", "12", values=[{"value": "all"}, {"value": "1..16"}])
glob("sys.clock_mode", "Clock Mode", "enum", "Off, out, in, in/thru.", "13", values=[{"value": v} for v in ["off", "out", "in", "in_thru"]])
glob("sys.clock_in", "Clock Input", "enum", "MIDI or USB.", "14", values=[{"value": "midi"}, {"value": "usb"}])
glob("sys.clock_out", "Clock Output", "enum", "None, MIDI, USB, all.", "15", values=[{"value": v} for v in ["none", "midi", "usb", "all"]])
glob("sys.param_out", "MIDI Param Out", "enum", "Off, CC or NRPN (full resolution).", "16", values=[{"value": v} for v in ["off", "cc", "nrpn"]])
glob("sys.param_in", "MIDI Param In", "enum", "Off, CC or NRPN.", "17", values=[{"value": v} for v in ["off", "cc", "nrpn"]])
glob("sys.midi_control", "MIDI Control", "boolean", "Respond to wheels, pedal, breath, volume, expression.", "18", default=True)
glob("sys.sysex", "MIDI SysX", "boolean", "Receive SysEx.", "19", default=True)
glob("sys.sysex_port", "MIDI SysX Port", "enum", "MIDI or USB.", "20", values=[{"value": "midi"}, {"value": "usb"}])
glob("sys.out_port", "MIDI Out Port", "enum", "Off, MIDI, USB, all.", "21", values=[{"value": v} for v in ["off", "midi", "usb", "all"]])
glob("sys.prog_send", "MIDI Prog Send", "boolean", "Send program changes.", "22")
glob("sys.prog_rcv", "MIDI Prog Rcv", "boolean", "Receive program changes.", "23")
glob("sys.arp_midi", "Arp Xmits MIDI", "boolean", "Arpeggiator/sequencer notes out over MIDI.", "24")
glob("sys.preset_mode", "Preset Mode", "boolean", "Off = live panel mode.", "25", default=True)
glob("sys.category_mode", "Category", "boolean", "Browse by category instead of bank.", "26")
glob("sys.seq_review", "Seq Review", "boolean", "Audible step-through when editing sequences.", "27")
glob("sys.alt_scale", "Alt Scale", "enum", "Equal temperament or one of 64 more tunings (replaceable by SysEx).", "28", values=[{"value": "equal_temperament"}, {"value": "tunings 2-65"}])
for n, (pid, label, fn) in enumerate((("sys.screensaver", "Screen Saver", "OLED off when idle."), ("util.basic", "Basic Program", "Loads the Basic Program (also TRANSPOSE down + PROGRAM)."),
                                     ("util.align_wheels", "Align Wheels", "Calibrates the wheels."), ("util.tune", "Tune Voices", "Calibrates VCOs, VCFs and VCAs."),
                                     ("util.reset", "Reset Globals", "Factory global defaults."), ("util.dump_preset", "Dump Preset", "SysEx dump of the current program."),
                                     ("util.dump_bank", "Dump Bank", "SysEx dump of the current user bank."), ("util.dump_all", "Dump All Banks", "SysEx dump of all user banks.")), start=29):
    par(pid, "kbd", label, "boolean", fn, memory="global" if pid == "sys.screensaver" else "none", access=[{"type": "menu", "note": f"GLOBAL menu, {n}"}])

# ---------------------------------------------------------------- ports
jack("jack.main", "MAIN AUDIO OUTPUT", "out", "audio", "out.main", "Unbalanced mono, 1/4\".", "6.35 mm TS")
jack("jack.phones", "HEADPHONES", "out", "audio", "out.phones", "1/4\" stereo jack; level from VOLUME.", "6.35 mm TRS")
jack("jack.pedal", "FOOTSWITCH / EXP PEDAL", "in", "cv", "kbd.pedal", "Momentary NO/NC footswitch or TRS expression pedal (function in Global menu); also accepts an audio signal for trigger/gate modes.", "6.35 mm TRS")
jack("jack.midi_in", "MIDI IN", "in", "midi", "kbd.midi_in", "MIDI in.", "5-pin DIN")
jack("jack.midi_out", "MIDI OUT", "out", "midi", None, "MIDI out.", "5-pin DIN")
jack("jack.midi_thru", "MIDI THRU", "out", "midi", None, "MIDI thru.", "5-pin DIN")
jack("jack.usb", "USB-C", "bidirectional", "midi", None, "Class-compliant USB MIDI; SysEx and firmware.", "USB-C")
jack("jack.power", "DC POWER", "in", "power", None, "12 V DC 1.25 A wall adapter (100-240 V, 15 W).", "DC barrel")

# ---------------------------------------------------------------- connections
con("arp.notes", "kbd.arp_in", note="Arpeggiated or sequenced notes.")
con("kbd.pitch", "osc_a.pitch_cv")
con("kbd.pitch", "osc_b.pitch_cv", {"param": "osc_b.octave", "not_equals": "lo2"}, note="lo2 disconnects Osc B from the keyboard.")
for o in ("osc_a", "osc_b"):
    con("kbd.bend", f"{o}.pitch_cv", amount="kbd.bend_range")
con("osc_b.out", "osc_a.sync_in", "sync", eq("osc_a.sync", True))
con("osc_a.out", "mixer.a", "audio", amount="mixer.osc_a")
con("osc_b.out", "mixer.b", "audio", amount="mixer.osc_b")
con("noise.out", "mixer.noise", "audio", eq("mixer.noise_on", True), amount="mixer.noise")
con("vcf.out", "mixer.feedback", "audio", eq("mixer.feedback_on", True), amount="mixer.feedback", note="Post-filter feedback through soft-clipping diodes.")
con("mixer.out", "vcf.in", "audio")
con("env_f.out", "vcf.cutoff_cv", amount="vcf.env_amt")
con("kbd.pitch", "vcf.cutoff_cv", eq("vcf.keytrack_on", True), amount="vcf.keytrack")
con("vcf.out", "vca.in", "audio")
con("env_a.out", "vca.cv")
con("kbd.gate", "env_f.gate", "gate")
con("kbd.gate", "env_a.gate", "gate")
con("kbd.velocity", "env_f.velocity", eq("env_f.vel_on", True), amount="env_f.vel_amt")
con("kbd.velocity", "env_a.velocity", eq("env_a.vel_on", True), amount="env_a.vel_amt")
con("env_f.out", "modbus.env", amount="mod.env_amt")
con("osc_b.out", "modbus.oscb", amount="mod.oscb_amt")
con("lfo.out", "modbus.lfo", amount="mod.lfo_amt")
con("kbd.modwheel", "modbus.wheel")
DST_NODE = {"freq_a": "osc_a.pitch_cv", "freq_b": "osc_b.pitch_cv", "pw_a": "osc_a.pw_cv", "pw_b": "osc_b.pw_cv", "cutoff": "vcf.cutoff_cv", "amp": "vca.cv", "lfo_freq": "lfo.rate_cv", "lfo_amt": "lfo.amount_cv"}
for d, node in DST_NODE.items():
    con("modbus.direct", node, anyof(f"mod.dst_{d}", "direct", "both"), note="Sources routed to the direct bus, at their amounts.")
    con("modbus.mw", node, anyof(f"mod.dst_{d}", "mw", "both"), amount_expr="bus * kbd.mod_wheel", note="Sources routed to the Mod Wheel bus, scaled by the wheel.")
con("kbd.aftertouch", "at.in", amount="at.amount")
AT_NODES = [("at.dest1", "osc_a.pitch_cv", "first"), ("at.dest1", "osc_b.pitch_cv", "second"), ("at.dest2", "vcf.cutoff_cv", "first"), ("at.dest2", "vca.cv", "second"),
            ("at.dest3", "lfo.rate_cv", "first"), ("at.dest3", "lfo.amount_cv", "second")]
for p_, node, which in AT_NODES:
    con("at.out", node, anyof(p_, which, "both"), confidence="inferred", note="LFO destinations are monophonic: the hardest-pressed key sets them.")
con("arp.seqmod", "osc_a.pitch_cv", {"all": [eq("arp.mode", "seq_mod"), eq("arp.seq_mod_dest", "osc_freq_a")]}, note="Mod sequence to its destination (Osc Freq A shown; others per Seq Mod Dest).")
con("vca.out", "out.in", "audio", amount="out.prog_vol", note="Four voices summed to mono.")

D["modules"], D["parameters"], D["ports"], D["connections"] = M, P, J, C
D["mod_matrix"] = {
    "name": "Modulation section (Pro-One style, two buses)", "module": "modbus", "slots": 3 * 8, "combine": "single",
    "sources": [{"id": 0, "name": "Filter Envelope", "node": "env_f.out", "per_voice": True}, {"id": 1, "name": "Osc B", "node": "osc_b.out", "per_voice": True},
                {"id": 2, "name": "LFO", "node": "lfo.out", "per_voice": False}, {"id": 3, "name": "Mod Sequence (arpeggiator Seq Mod)", "node": "arp.seqmod", "per_voice": False}],
    "destinations": [{"id": i, "name": lab, "description": f"Destination button; mod.dst_{d}"} for i, (d, lab, cc) in enumerate(DESTS)]
                    + [{"id": 8 + i, "name": n, "description": "Mod Sequence only"} for i, n in enumerate(["Mod 1 Amt", "Mod 2 Amt", "Mod 3 Amt", "Pulse Width All", "Feedback"])],
    "depth_range": {"min": -63, "max": 63},
    "note": ("Each source's ROUTE button picks the direct bus (red) or the Mod Wheel bus (blue); each destination's button picks direct, Mod Wheel or both (purple). A source "
             "reaches every destination listening to its bus, at the source's single bipolar amount; the Mod Wheel bus is scaled by the wheel. The Mod Sequence reaches one destination "
             "chosen by Seq Mod Dest (including the three source amounts, PW A+B and feedback)."),
}
D["indicators"] = [
    {"id": "oled", "module": "kbd", "label": "OLED display", "kind": "display", "function": "Bank/program, parameter values, Param and Global menus, sequencer steps."},
    {"id": "route_leds", "module": "modbus", "label": "route and destination LEDs", "kind": "led", "led_colour": "multi", "function": "Red direct bus, blue Mod Wheel bus, purple both."},
    {"id": "tap_led", "module": "arp", "label": "TAP TEMPO LED", "kind": "led", "function": "Flashes at the BPM."},
    {"id": "transpose_leds", "module": "kbd", "label": "TRANSPOSE LEDs", "kind": "led", "function": "Keyboard transposition."},
]
D["behaviours"] = [
    {"id": "b01", "name": "Signal path", "applies_to": ["osc_a", "osc_b", "mixer", "vcf", "vca"],
     "rule": "Per voice: oscillators, noise and feedback into the 4-pole low-pass, then the VCA under the amp ADSR; voices summed to the mono output. Feedback returns the filter output to its input through soft-clipping diodes."},
    {"id": "b02", "name": "Modulation buses", "applies_to": ["modbus"],
     "rule": "Press a source ROUTE once for the direct bus (red), twice for the Mod Wheel bus (blue). Press a destination once for direct, twice for Mod Wheel, three times for both (purple). Mod Wheel bus modulation is heard only as the wheel rises, up to the source's amount."},
    {"id": "b03", "name": "Osc B as modulator", "applies_to": ["osc_b"],
     "rule": "lo1 keeps key tracking (a polyphonic, note-dependent LFO); lo2 disconnects it from the keyboard. Routed through the OSC B bus it gives per-voice modulation, or audio-rate FM in normal ranges."},
    {"id": "b04", "name": "Polyphonic aftertouch", "applies_to": ["at", "kbd"],
     "rule": "Per-key pressure (Tactive keybed) with one bipolar amount to up to six destinations on three buttons, each cycling first, second, both, off. LFO destinations are monophonic (the hardest key sets them). Global setting: off, mono or poly."},
    {"id": "b05", "name": "Unison and chord memory", "applies_to": ["kbd"],
     "rule": "Unison stacks 1-4 voices with detune and key priority. Chord mode: hold a 2-4 note chord and press UNISON; single keys then play the transposed chord (saved with the program). HOLD sustains up to four notes at the amp sustain level."},
    {"id": "b06", "name": "Arpeggiator and sequencer", "applies_to": ["arp"],
     "rule": "Up, down, up+down 1/2, random, assign over 1-3 octaves with repeats, relatch and beat sync; 30-250 BPM or MIDI clock. Seq Note records up to 64 steps of notes or chords with rests, ties and note glides; Seq Mod records note numbers as mod amounts for one destination. Play modes: retrig, continue, one shot, step. Saved per program."},
    {"id": "b07", "name": "Pedal input", "applies_to": ["kbd"],
     "rule": "Expression pedal (filter full/half, mod amounts, volume) or footswitch (sustain, arp hold, momentary hold, seq start/stop); trigger and gate modes also accept an audio signal to step the arpeggiator or gate the envelopes."},
    {"id": "b08", "name": "Programs", "applies_to": ["kbd"],
     "rule": "512 programs (User 1-2, Factory 1-2). Hold PROGRAM to save (factory edits go to a user bank). Live panel mode via Preset Mode off. Basic Program: TRANSPOSE down + PROGRAM. Category browsing. Entering the Global menu sets the power-on program."},
]
D["midi"] = {
    "receives": [{"message": "note_on"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "channel_pressure"}, {"message": "poly_pressure"}, {"message": "program_change"},
                 {"message": "control_change", "note": "community CC chart: see parameter access entries; 0/32 bank select (0-3), 1 mod wheel, 2 breath, 4 foot, 7 volume, 11 expression, 74 brightness"},
                 {"message": "nrpn", "note": "full-resolution parameter control when MIDI Param In is NRPN (numbers not published here)"}, {"message": "clock"},
                 {"message": "sysex", "note": "programs, banks, alternative tunings"}],
    "transmits": [{"message": "note_on", "note": "including arpeggiator with Arp Xmits MIDI"}, {"message": "note_off"}, {"message": "pitch_bend"}, {"message": "poly_pressure"}, {"message": "control_change"},
                  {"message": "nrpn"}, {"message": "program_change"}, {"message": "clock"}, {"message": "sysex"}],
    "channel_note": "One channel 1-16 or all; DIN or USB per port settings.", "note": "The user guide lists no CC/NRPN numbers; CCs are from midi.guide."}
D["specifications"] = {
    "voices": 4, "keyboard": "37 slim keys, Tactive, velocity and polyphonic aftertouch", "oscillators": "2 analogue VCOs per voice", "filter": "4-pole resonant low-pass, Prophet-5 rev 1/2 style, bass compensated",
    "envelopes": "2 ADSR", "lfo_hz": [0.021, 556], "programs": "512 (2 user + 2 factory banks of 128)", "sequencer_steps": 64, "tunings": 65,
    "connections": {"main_out": "1/4\" unbalanced mono", "phones": "1/4\"", "pedal": "1/4\" TRS footswitch/expression", "midi": "DIN in, out, thru; USB-C"},
    "power": "12 V DC 1.25 A external supply, 100-240 V, 15 W", "dimensions_mm": {"w": 562, "d": 251, "h": 70}, "weight_kg": 3.97,
    "factory_programs": {"U1/F1": PRESETS["U1/F1"], "F2": PRESETS["F2"], "note": "U2 ships as 128 Basic Programs; U1 is a writable copy of F1."},
}
D["omitted_from_source"] = ["safety and warranty text", "Chapter 3 tutorials (beyond facts used)", "alternative tuning ratios (names only)", "SysEx dump procedures beyond their existence"]
D["not_in_source"] = ["CC and NRPN numbers (community chart used; NRPNs not available)", "envelope times in seconds", "exact CC encodings of switch states", "the aftertouch destination pairing per button"]
D["source_inconsistencies"] = [
    "The power supply is 12 V 1.25 A, 15 W in the guide; retailers list 12 V 1.2 A and 14 W.",
    "The guide calls the headphone output stereo; some retailer copy says mono (the signal path is mono).",
    "Arp Repeat is described as '1, 2, 3' in one place and 'Off, 1, 2, 3' in another; Arp Octave in the Param list is given as '30-250' before '1, 2, 3'.",
    "The aftertouch section mentions 'six possible parameters' including 'amp envelope amount', listed elsewhere as 'amp'.",
    "One retailer lists DADSR envelopes; the guide describes ADSR.",
    "The table of contents lists Polyphonic Aftertouch on page 35 after Unison on page 38, and repeats Unison and Hold.",
]
D["modelling_gaps"] = [
    {"topic": "Per-voice modules", "detail": "Voice modules are modelled once (per_voice); the LFO, buses and arpeggiator are common."},
    {"topic": "Bus connections", "detail": "The modulation section is drawn as two buses feeding each destination per its button state; each source joins one bus by its ROUTE setting."},
    {"topic": "Module version", "detail": "The guide mentions a Fourm Module (no keyboard); not modelled separately."},
]
order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "mod_matrix", "indicators", "behaviours", "midi", "specifications",
         "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
with open("/mnt/user-data/outputs/sequential-fourm_synth.json", "w", encoding="utf-8") as f:
    json.dump({k: D[k] for k in order}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("written")
