#!/usr/bin/env python3
"""Assemble the Roland TB-303 and Behringer TD-3 device files from one shared base.

The TD-3 is a recreation of the TB-303, so the voice, sequencer and memory structure
are built once. Each device then applies its own differences: panel layout, connectors,
tuning range, the TD-3's distortion, FILTER IN, clock options, MIDI and USB, and the
TB-303's MIX IN, DIN sync and battery power. Anything that differs lives in the
variant functions at the bottom, so the two files can be compared line by line.

Voice behaviour the manuals leave out (two envelopes, the accent sweep circuit, slide)
comes from Robin Whittle's Devil Fish manual and is marked inferred where used.
"""
import copy
import json

S10 = {"min": 0, "max": 10}
PB = [{"type": "panel", "control": "push_button"}]
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C (upper)"]


def par(P, id, module, label, kind, function, control="knob", **kw):
    p = {"id": id, "module": module, "label": label, "kind": kind}
    for k in ("manual_ref", "panel_scale", "physical", "range", "values", "default"):
        if k in kw:
            p[k] = kw.pop(k)
    p["access"] = kw.pop("access", None) or [{"type": "panel", "control": control}]
    p["function"] = function
    for k in ("confidence", "note"):
        if k in kw:
            p[k] = kw.pop(k)
    assert not kw, kw
    P.append(p)


def base():
    D = {"schema_version": "0.10.0"}
    M = [
        {"id": "seq", "type": "sequencer", "name": "Sequencer", "panel_section": "SEQUENCER",
         "description": "16-step pattern sequencer with track (song) chaining. Each step stores pitch (one of 13 keys plus octave transpose), "
                        "timing as note, tie or rest, accent and slide. It drives the voice with pitch CV, gate, accent and slide.",
         "inputs": ["seq.clock_in"], "outputs": ["seq.cv", "seq.gate", "seq.accent"]},
        {"id": "vco", "type": "oscillator", "name": "VCO", "panel_section": "TONE CONTROL",
         "description": "Single oscillator, sawtooth or square, chosen by the WAVEFORM switch. Pitch from the sequencer, with TUNING setting the reference.",
         "inputs": ["vco.pitch_cv"], "outputs": ["vco.out"],
         "properties": {"waveforms": ["sawtooth", "square"], "pitch_reference": "A key plays about 220 Hz with TUNING centred"}},
        {"id": "vcf", "type": "filter", "name": "VCF", "panel_section": "TONE CONTROL",
         "description": "Resonant low-pass filter. CUTOFF sets the base frequency, ENV MOD the depth of the main envelope, RESONANCE the emphasis "
                        "(to self-oscillation on the TD-3). On accented notes the accent sweep circuit adds a further rise.",
         "inputs": ["vcf.in", "vcf.cutoff_cv"], "outputs": ["vcf.out"],
         "properties": {"type": "low-pass", "topology": "4-pole diode-style ladder (transistors wired as diodes)",
                        "slope_note": "four poles with the first mismatched; often heard as about 18 dB/octave",
                        "topology_source": "circuit analyses (Whittle; Gearspace; Olney); neither manual says"}},
        {"id": "meg", "type": "envelope", "name": "Main envelope generator", "panel_section": "TONE CONTROL",
         "description": "Sharp attack, exponential decay, retriggered by each gate. Drives the filter cutoff through ENV MOD and, on accented "
                        "notes, the accent sweep circuit. DECAY sets its time on unaccented notes; accented notes force the shortest decay.",
         "inputs": ["meg.trigger", "meg.accent"], "outputs": ["meg.out"],
         "properties": {"decay_s": [0.2, 2], "accent_decay_s": 0.2, "source": "Whittle, Devil Fish manual"}},
        {"id": "veg", "type": "envelope", "name": "Volume envelope generator", "panel_section": "(internal)",
         "description": "Fixed attack-decay envelope for the VCA, retriggered by each gate. No panel control.",
         "inputs": ["veg.trigger"], "outputs": ["veg.out"], "properties": {"decay_s": [3, 4], "source": "Whittle, Devil Fish manual"}},
        {"id": "acc", "type": "slew_limiter", "name": "Accent sweep circuit", "panel_section": "TONE CONTROL",
         "description": "On accented steps, passes the main envelope through a smoothing network to add to filter cutoff and VCA level. "
                        "The ACCENT knob sets the amount; the RESONANCE knob also sets how much of the sweep reaches the filter. "
                        "It does not fully discharge between steps, so consecutive accents climb higher.",
         "inputs": ["acc.env_in", "acc.gate"], "outputs": ["acc.out"]},
        {"id": "vca", "type": "vca", "name": "VCA", "panel_section": "(internal)",
         "description": "Shapes the filtered signal with the volume envelope, boosted on accented notes.",
         "inputs": ["vca.in", "vca.cv"], "outputs": ["vca.out"]},
        {"id": "out", "type": "output", "name": "Output", "panel_section": "VOLUME",
         "description": "Line output and headphones at the VOLUME setting.",
         "inputs": ["out.in"], "outputs": ["out.line", "out.phones"]},
    ]
    P = []
    par(P, "vco.waveform", "vco", "WAVEFORM", "enum", "Selects the oscillator waveform.", control="slide_switch",
        values=[{"value": "sawtooth"}, {"value": "square"}])
    par(P, "vcf.cutoff", "vcf", "CUTOFF FREQ", "continuous", "Filter cutoff. Lower removes upper harmonics, softening the tone and lowering the level.", panel_scale=S10)
    par(P, "vcf.resonance", "vcf", "RESONANCE", "continuous", "Emphasis at the cutoff. Also scales the accent sweep's effect on the filter.", panel_scale=S10)
    par(P, "vcf.env_mod", "vcf", "ENV MOD", "continuous", "Depth of the main envelope on filter cutoff: how much each note's tone moves.", panel_scale=S10)
    par(P, "meg.decay", "meg", "DECAY", "continuous", "Decay time of the main envelope on unaccented notes.", panel_scale=S10,
        physical={"min": 0.2, "max": 2, "unit": "s", "taper": "unknown", "source": "Whittle"})
    par(P, "acc.amount", "acc", "ACCENT", "continuous", "How strongly accented steps stand out. No effect on unaccented steps.", panel_scale=S10)
    par(P, "seq.tempo", "seq", "TEMPO", "continuous", "Playback rate of patterns and tracks, slow to fast.", panel_scale=S10)
    par(P, "seq.mode", "seq", "MODE", "enum", "Operating mode of the sequencer.", control="rotary_switch",
        values=[{"value": "pattern_write"}, {"value": "pattern_play"}, {"value": "track_write"}, {"value": "track_play"}])
    par(P, "seq.track_group", "seq", "TRACK / PATTERN GROUP", "enum",
        "In track modes selects TRACK 1 to 7; in pattern modes selects PATTERN GROUP I to IV. Tracks 1-2 use group I, 3-4 group II, 5-6 group III, 7 group IV.",
        control="rotary_switch", values=[{"value": f"track_{i}", "meaning": f"track {i}, pattern group {['I','I','II','II','III','III','IV'][i-1]}"} for i in range(1, 8)])
    par(P, "seq.key", "seq", "13-note keyboard", "enum",
        "Enters pitches in PITCH MODE; with PITCH MODE held, transposes the playing pattern or selects the tuning note. The lower eight keys double as the PATTERN 1-8 selectors, and C# and D# as DEL and INS in track editing.",
        control="push_button", values=[{"value": n} for n in NOTES])
    par(P, "seq.pattern_select", "seq", "PATTERN 1-8", "enum", "Selects the pattern number (the lower eight note keys), or the measure number while BAR is held.",
        control="push_button", values=[{"value": i} for i in range(1, 9)])
    for id, lbl, fn in (
        ("seq.pitch_mode", "PITCH MODE", "Enters pitch entry; held with a key, transposes or selects the tuning note."),
        ("seq.time_mode", "TIME MODE", "Enters timing entry: note, tie or rest per step."),
        ("seq.function", "FUNCTION", "Returns to normal mode; held, gives second functions (step count, pattern position in a track, insert, delete)."),
        ("seq.back", "BACK", "Steps back one note while checking or editing a pattern."),
        ("seq.write_next", "WRITE/NEXT (TAP)", "Writes a pattern into a track, steps to the next note, and enters timing by tapping (hold for sustain)."),
        ("seq.clear", "CLEAR / BAR RESET / D.C.", "Clears a pattern, resets a track to its first measure, marks the last pattern of a track (D.C.); starts the metronome for tap writing."),
        ("seq.run_stop", "RUN/STOP", "Starts and stops patterns and tracks."),
        ("seq.down_note_step", "TRANSPOSE DOWN / NOTE / STEP", "Octave down in PITCH MODE; a note in TIME MODE; with FUNCTION, counts the steps in a pattern."),
        ("seq.up_tie_triplet", "TRANSPOSE UP / TIE / TRIPLET", "Octave up in PITCH MODE; a tie in TIME MODE; sets triplet step mode."),
        ("seq.accent_a", "ACCENT / PATTERN A", "Adds or removes an accent on the current step; selects the A bank."),
        ("seq.slide_b", "SLIDE / PATTERN B", "Adds or removes a slide on the current step; selects the B bank."),
    ):
        par(P, id, "seq", lbl, "boolean", fn, access=PB)
    J = []
    C = [
        {"id": "c01", "from": "seq.cv", "to": "vco.pitch_cv", "signal": "cv", "kind": "fixed", "note": "Through the slide circuit: slewed when the step has slide, near-instant otherwise."},
        {"id": "c03", "from": "vcf.out", "to": "vca.in", "signal": "audio", "kind": "fixed"},
        {"id": "c04", "from": "seq.gate", "to": "meg.trigger", "signal": "gate", "kind": "fixed", "note": "Not retriggered across a slide."},
        {"id": "c05", "from": "seq.gate", "to": "veg.trigger", "signal": "gate", "kind": "fixed"},
        {"id": "c06", "from": "meg.out", "to": "vcf.cutoff_cv", "signal": "cv", "kind": "fixed", "amount": "vcf.env_mod"},
        {"id": "c07", "from": "seq.accent", "to": "meg.accent", "signal": "gate", "kind": "fixed", "note": "Forces the shortest decay on accented steps.", "confidence": "inferred"},
        {"id": "c08", "from": "meg.out", "to": "acc.env_in", "signal": "cv", "kind": "fixed", "confidence": "inferred"},
        {"id": "c09", "from": "seq.accent", "to": "acc.gate", "signal": "gate", "kind": "fixed", "confidence": "inferred"},
        {"id": "c10", "from": "acc.out", "to": "vcf.cutoff_cv", "signal": "cv", "kind": "fixed", "amount_expr": "acc.amount * vcf.resonance", "confidence": "inferred"},
        {"id": "c11", "from": "acc.out", "to": "vca.cv", "signal": "cv", "kind": "fixed", "amount": "acc.amount", "confidence": "inferred"},
        {"id": "c12", "from": "veg.out", "to": "vca.cv", "signal": "cv", "kind": "fixed"},
    ]
    B = [
        {"id": "b01", "name": "Pattern memory", "applies_to": ["seq"],
         "rule": "64 patterns: four groups (I to IV), each with PATTERN 1 to 8 in banks A and B. A pattern holds up to 16 steps of sixteenths, or 15 in "
                 "triplet step mode (the TB-303 manual), and stores pitch, timing, accent and slide. The sound itself is not stored: the knobs "
                 "always play live."},
        {"id": "b02", "name": "Two-pass pattern writing", "applies_to": ["seq"],
         "rule": "Pitches go in first, in PITCH MODE, using the 13 keys with TRANSPOSE held for octaves. Timing follows in TIME MODE: each step is a "
                 "note (takes the next pitch), a tie (extends the previous note) or a rest. Accent and slide are added last, by stepping through "
                 "with WRITE/NEXT held and pressing ACCENT or SLIDE. Timing can instead be tapped against a metronome started with CLEAR; "
                 "holding TAP adds sustain. Clearing timing while running keeps the pitches."},
        {"id": "b03", "name": "Step modes", "applies_to": ["seq"],
         "rule": "Normal step mode divides a beat into four sixteenths. Triplet mode divides it into three, for 12/8 and shuffle feels. The step "
                 "count (FUNCTION plus STEP pressed repeatedly) sets bar length, so 12 steps of sixteenths give 3/4."},
        {"id": "b04", "name": "Slide", "applies_to": ["seq", "vco", "meg"],
         "rule": "A slide ties the step to the next one: the gate stays high, the envelopes are not retriggered, and the pitch glides at a fixed, "
                 "short rate. A slide on a pattern's last note carries into the next pattern, or the pattern's own start if it repeats. Two "
                 "slid notes of the same pitch simply tie. A slide into a rest does nothing."},
        {"id": "b05", "name": "Accent", "applies_to": ["acc", "meg", "vca", "vcf"],
         "rule": "An accented step does three things: the main envelope's decay drops to its shortest, the accent sweep circuit adds a rise to the "
                 "filter cutoff (scaled by both ACCENT and RESONANCE, which is where the 'wow' comes from), and the VCA gets louder. The sweep "
                 "does not fully discharge, so runs of accents climb. Accent is not sent to the CV output.", "confidence": "inferred",
         "note": "From Whittle's Devil Fish manual; the owner's manuals say only that ACCENT affects accented notes."},
        {"id": "b06", "name": "Envelopes", "applies_to": ["meg", "veg", "vcf", "vca"],
         "rule": "The main envelope (DECAY, about 0.2 to 2 s) moves the filter; ENV MOD sets how far. The volume envelope's decay is fixed at about "
                 "3 to 4 s, so note length is mostly set by gate time and the filter closing.", "confidence": "inferred"},
        {"id": "b07", "name": "Tracks", "applies_to": ["seq"],
         "rule": "Seven tracks, each built from patterns in its own group (1-2 group I, 3-4 II, 5-6 III, 7 IV). A track stores the order of patterns, "
                 "a transpose per measure (hold PITCH MODE and press a key while writing), and a D.C. marker on the last measure, after which it "
                 "loops. Measures can be inserted, deleted and overwritten; a shorter new track simply ends at its D.C."},
        {"id": "b08", "name": "Chaining and live transpose", "applies_to": ["seq"],
         "rule": "Holding one pattern switch and pressing another selects that range, played in order. While playing, holding PITCH MODE and pressing "
                 "a key transposes the pattern from its next repeat. A newly chosen pattern starts when the current one ends."},
        {"id": "b09", "name": "Tuning", "applies_to": ["vco"],
         "rule": "In PATTERN PLAY, hold PITCH MODE and press A, then each TAP (WRITE/NEXT) sounds that note so TUNING can be set to 220 Hz, or to "
                 "another instrument. Any other key can be used as the reference."},
        {"id": "b10", "name": "CV and gate", "applies_to": ["seq"],
         "rule": "CV follows the played note at 1 V/octave between +1 and +5 V, and glides on slides. The gate is high for slightly less than the "
                 "written note, stays high across slides, and is off for rests. Accent does not reach the CV."},
    ]
    return D, M, P, J, C, B


# --------------------------------------------------------------------------
# TB-303
# --------------------------------------------------------------------------
def tb303():
    D, M, P, J, C, B = base()
    D["device"] = {
        "id": "roland-tb-303", "manufacturer": "Roland", "model": "TB-303 Computer Controlled Bass Line",
        "category": "monophonic analogue bass synthesizer with built-in step sequencer",
        "based_on": "Original design, 1981-84.",
        "sources": [
            {"id": "manual", "title": "Roland TB-303 Owner's Manual (April 1982)", "kind": "user_manual", "file": "Roland_TB-303_Owners_Manual.pdf", "pages": 96,
             "note": "Scanned; read by OCR at 150 dpi. Basic, intermediate and advanced courses, sync and CV/gate section, sample bass lines and specifications. "
                     "Sample sound knob settings are drawn as dials and not readable by OCR."},
            {"id": "devilfish", "title": "Robin Whittle, Devil Fish TB-303 modification manual", "kind": "circuit_analysis",
             "file": "https://manualzz.com/doc/1172463/roland-tb-303-user-manual",
             "note": "The two envelopes and their times, the accent sweep circuit, fixed slide."},
            {"id": "filter_refs", "title": "Gearspace TB-303 filter thread; Olney, 'Computational Thinking in Modular', ch. 13", "kind": "other",
             "file": "https://olney.ai/ct-modular-book/tb-303.html", "note": "Filter as a mismatched 4-pole diode-style ladder."},
        ],
    }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic", "poly_chain_max_units": None,
        "patch_memory": False, "patch_memory_note": "Stores sequences only (64 patterns, 7 tracks); the sound is set live on the knobs.", "semi_modular": False,
        "panel_counts": {"knobs": 8, "rotary_switches": 2, "slide_switches": 1},
        "summary": ("A one-oscillator bass voice (saw or square into a resonant low-pass filter and VCA, with a decay envelope and accent) driven by "
                    "a 16-step sequencer with accent and slide per step. Patterns chain into seven tracks. Runs on batteries or an adaptor, syncs "
                    "to Roland rhythm machines over DIN, and can play other synthesizers from its CV and gate outputs."),
    }
    M.append({"id": "mix", "type": "mixer", "name": "MIX IN", "panel_section": "(rear edge)",
              "description": "Mixes an external audio signal, such as a rhythm machine, with the bass at unity gain before the output and headphones. Works only with the power on.",
              "inputs": ["mix.ext_in", "mix.bass_in"], "outputs": ["mix.out"]})
    C += [
        {"id": "c02", "from": "vco.out", "to": "vcf.in", "signal": "audio", "kind": "fixed"},
        {"id": "c13", "from": "vca.out", "to": "mix.bass_in", "signal": "audio", "kind": "fixed"},
        {"id": "c14", "from": "mix.out", "to": "out.in", "signal": "audio", "kind": "fixed"},
    ]
    P[0]["access"] = [{"type": "panel", "control": "slide_switch", "note": "on the rear edge beside SYNC IN"}]
    par(P, "vco.tuning", "vco", "TUNING", "continuous", "Pitch reference, about 500 cents either way.", panel_scale={"min": -5, "max": 5},
        physical={"min": -500, "max": 500, "unit": "cents"}, note="Printed as '±500 overcents'.")
    next(p for p in P if p["id"] == "seq.tempo")["physical"] = {"min": 40, "max": 300, "unit": "BPM"}
    par(P, "out.volume", "out", "VOLUME / POWER SW", "continuous", "Power switch and volume on one knob: click on, then turn clockwise for level.", panel_scale=S10)
    par(P, "seq.ds", "seq", "D.S.", "boolean", "Marks or jumps to the D.S. (segno) measure, so a track can repeat a section.", access=PB)
    J += [
        {"id": "jack.output", "label": "OUTPUT", "location": "top", "direction": "out", "signal": "audio", "connector": "6.35 mm jack", "node": "out.line",
         "function": "Line output to an amplifier.", "electrical": {"output_impedance_ohm": 10000}},
        {"id": "jack.phones", "label": "HEADPHONE", "location": "top", "direction": "out", "signal": "audio", "connector": "6.35 mm stereo jack", "node": "out.phones",
         "function": "Stereo headphones, 8 to 300 ohm. Do not use the output jack at the same time.", "electrical": {"load_ohm": [8, 300]}},
        {"id": "jack.cv_out", "label": "CV", "location": "top", "direction": "out", "signal": "cv", "connector": "3.5 mm mini jack", "node": "seq.cv",
         "function": "Pitch CV for another synthesizer, 1 V/octave, +1 to +5 V. A 32' VCO setting matches the TB-303's register.", "electrical": {"range_v": [1, 5], "scaling": "1 V/octave"}},
        {"id": "jack.gate_out", "label": "GATE", "location": "top", "direction": "out", "signal": "gate", "connector": "3.5 mm mini jack", "node": "seq.gate",
         "function": "Gate for another synthesizer: 0 V off, +12 V on.", "electrical": {"off_v": 0, "on_v": 12}},
        {"id": "jack.sync_in", "label": "SYNC IN", "location": "top", "direction": "in", "signal": "clock", "connector": "5-pin DIN", "node": "seq.clock_in",
         "function": "Tempo, start and stop from a TR-606, TR-808, CR-8000, CSQ-600, MC-4 or EP-11. The TR-606 can also trigger D.S. from its TAP button.",
         "combine": "replace"},
        {"id": "jack.mix_in", "label": "MIX IN", "location": "top", "direction": "in", "signal": "audio", "connector": "6.35 mm jack", "node": "mix.ext_in",
         "function": "External audio mixed with the bass at 1:1; its level is set at the source.", "electrical": {"impedance_ohm": 100000}},
        {"id": "jack.dc_in", "label": "DC 9V", "location": "top", "direction": "in", "signal": "power", "connector": "BOSS ACA-type adaptor jack", "node": None,
         "function": "9 V adaptor (BOSS ACA-100 or equivalent)."},
    ]
    D["indicators"] = [
        {"id": "seq.run_led", "module": "seq", "label": "BATTERY CHECK / RUN", "kind": "led", "function": "Lit while running; also the battery check."},
        {"id": "seq.pitch_led", "module": "seq", "label": "PITCH MODE", "kind": "led", "function": "Lit in pitch mode."},
        {"id": "seq.normal_led", "module": "seq", "label": "NORMAL MODE", "kind": "led", "function": "Lit in normal mode."},
        {"id": "seq.time_led", "module": "seq", "label": "TIME MODE", "kind": "led", "function": "Lit in time mode."},
        {"id": "seq.key_leds", "module": "seq", "label": "key and selector LEDs", "kind": "led",
         "function": "Show the current note, pattern, bank and step state; a flashing pattern LED marks the pattern being selected or written."},
    ]
    D["led_legend"] = {"rule": "Single-colour LEDs: lit means active, flashing means selected and waiting.", "colours": [{"colour": "red", "meaning": "state indicators"}],
                       "confidence": "inferred"}
    B += [
        {"id": "b11", "name": "DIN sync", "applies_to": ["seq"],
         "rule": "With SYNC IN connected, tempo, start and stop come from the master; press CLEAR/RESET on both units first. Sequencers such as the "
                 "CSQ-600 and MC-4 must not be stopped and continued mid-way. Write patterns with the units disconnected."},
        {"id": "b12", "name": "D.C. and D.S.", "applies_to": ["seq"],
         "rule": "D.C. on a track's last measure makes it loop from the first. D.S. marks a segno measure that playback can jump back to. Measures "
                 "are addressed with BAR held and the selector switches as digits. Do not insert after the D.C. measure."},
        {"id": "b13", "name": "Headphone pitch", "applies_to": ["out"],
         "rule": "The manual warns that bass through headphones can sound out of tune and suggests adjusting the tone or using a speaker."},
    ]
    D["midi"] = {"receives": [], "transmits": [], "note": "None. Sync is DIN (Roland 24 pulses per quarter note) and external control is CV and gate out only."}
    D["specifications"] = {
        "patterns": "64 (groups I-IV x 8 x A/B)", "pattern_contents": ["pitch", "length of note", "accent", "slide"],
        "steps_per_pattern": {"sixteenths": [1, 16], "triplets": [1, 15]}, "sound_range_octaves": {"pattern": 3, "track": 4},
        "tracks": "7, 64 measures each, 256 measures maximum", "track_contents": ["order of patterns", "shift (transpose)", "D.C.", "D.S."],
        "tuning_cents": [-500, 500], "tempo_bpm": [40, 300],
        "outputs": {"line": "jack, 10 kohm", "headphones": "stereo jack, 8-300 ohm", "cv": "mini jack, +1 to +5 V, 1 V/octave", "gate": "mini jack, 0 / +12 V"},
        "inputs": {"sync": "5-pin DIN", "mix_in": "jack, 100 kohm, 1:1"},
        "power": {"battery": "6 V (4 x 1.5 V)", "adaptor": "9 V", "current_ma": [80, 120]},
        "dimensions_mm": {"w": 300, "d": 146, "h": 55}, "weight_kg": 1.0,
        "accessories": ["SC-303 soft case", "PJ-1 connection cord"],
    }
    D["omitted_from_source"] = [
        "the step-by-step procedure tables for each worked example, condensed into behaviours",
        "the sample bass lines and their track scores (pp. 81-88)",
        "the four sample sound settings, whose knob positions are drawn as dials and not readable from the scan",
        "the measure-number indication rules for BAR, beyond the summary in b12",
    ]
    D["not_in_source"] = [
        "any description of the voice circuit: filter type and slope, envelope count and times, how accent works; taken from circuit analyses",
        "slide time",
        "the TEMPO and knob tapers",
        "the oscillator's pitch range in Hz, beyond A at about 220 Hz and a 3-octave pattern range",
        "DIN sync pulse rate",
    ]
    D["source_inconsistencies"] = [
        "The manual says DECAY lengthens both the volume and the tone's fade; Whittle's circuit analysis says the volume envelope is fixed at about 3 to 4 s and DECAY acts on the filter envelope only.",
        "The tuning range is printed as '±500 overcents'; read as ±500 cents.",
        "The manual's step diagram shows 5/4 as 20 sixteenth steps, but the specification limits a pattern to 16 steps.",
    ]
    D["modelling_gaps"] = [
        {"topic": "Filter response", "detail": "The mismatched first pole gives a response between 18 and 24 dB/octave; exact pole positions and the resonance-cutoff interaction need measurement."},
        {"topic": "Accent sweep", "detail": "Its time constant and the resonance pot's part in it are described qualitatively only."},
        {"topic": "Slide", "detail": "Fixed and short; the RC value is in the service notes, not here."},
        {"topic": "Square wave", "detail": "The square's pulse width shifts with pitch on the original; not quantified."},
    ]
    return D, M, P, J, C, B


# --------------------------------------------------------------------------
# TD-3
# --------------------------------------------------------------------------
def td3():
    D, M, P, J, C, B = base()
    D["device"] = {
        "id": "behringer-td-3", "manufacturer": "Behringer", "model": "TD-3 Analog Bass Line Synthesizer",
        "category": "monophonic analogue bass synthesizer with built-in step sequencer, distortion and patch bay",
        "based_on": "Roland TB-303 (1981): same voice, sequencer and memory layout, with added distortion, FILTER IN, clock options, MIDI, USB and poly chain.",
        "sources": [
            {"id": "qsg", "title": "Behringer TD-3 Quick Start Guide, V 5.0", "kind": "quick_start_guide", "file": "Behringer_TD-3.pdf", "pages": 55,
             "note": "Multilingual; English controls, getting started, operation, poly chain, MIDI and specifications pages used."},
            {"id": "tb303_manual", "title": "Roland TB-303 Owner's Manual (April 1982)", "kind": "user_manual", "file": "Roland_TB-303_Owners_Manual.pdf",
             "note": "Used for the shared sequencer behaviour the quick start guide only outlines."},
            {"id": "devilfish", "title": "Robin Whittle, Devil Fish TB-303 modification manual", "kind": "circuit_analysis",
             "file": "https://manualzz.com/doc/1172463/roland-tb-303-user-manual", "note": "Envelope, accent and slide behaviour of the circuit the TD-3 recreates."},
        ],
    }
    D["architecture"] = {
        "synthesis": "subtractive", "signal_path": "analogue", "voices": 1, "polyphony_mode": "monophonic; up to 16 units in poly chain",
        "poly_chain_max_units": 16, "patch_memory": False, "patch_memory_note": "Stores sequences only; the sound is set live on the knobs.", "semi_modular": False,
        "panel_counts": {"knobs": 11, "rotary_switches": 2, "slide_switches": 2, "patch_points": 5},
        "summary": ("A recreation of the TB-303: saw or square VCO, resonant low-pass VCF, decay envelope, accent and slide, driven by the same "
                    "16-step pattern and seven-track sequencer. Adds a distortion stage before the output, a FILTER IN for external audio, "
                    "a 3.5 mm patch bay with sync input and CV and gate outputs, selectable clock source and rate, MIDI and USB MIDI, and poly chain."),
    }
    M.append({"id": "dist", "type": "overdrive", "name": "Distortion", "panel_section": "DISTORTION",
              "description": "Distortion just before the volume control and output, with DRIVE, TONE and LEVEL. Bypassed when switched off.",
              "inputs": ["dist.in"], "outputs": ["dist.out"]})
    M.append({"id": "midi", "type": "midi_to_cv", "name": "MIDI and USB interface", "panel_section": "(rear panel)",
              "description": "Receives notes, pitch bend and clock on MIDI IN and USB; MIDI OUT/THRU sends data and passes MIDI IN through.",
              "inputs": [], "outputs": ["midi.clock"]})
    C += [
        {"id": "c02", "from": "vco.out", "to": "vcf.in", "signal": "audio", "kind": "normalled", "broken_by": "jack.filter_in",
         "note": "FILTER IN replaces the VCO as the filter's source."},
        {"id": "c13", "from": "vca.out", "to": "dist.in", "signal": "audio", "kind": "switched", "enabled_when": {"param": "dist.on", "equals": True}},
        {"id": "c14", "from": "dist.out", "to": "out.in", "signal": "audio", "kind": "switched", "enabled_when": {"param": "dist.on", "equals": True}, "amount": "dist.level"},
        {"id": "c15", "from": "vca.out", "to": "out.in", "signal": "audio", "kind": "switched", "enabled_when": {"param": "dist.on", "equals": False}},
        {"id": "c16", "from": "midi.clock", "to": "seq.clock_in", "signal": "clock", "kind": "switched",
         "enabled_when": {"any": [{"param": "seq.clock_source", "equals": "midi"}, {"param": "seq.clock_source", "equals": "usb"}]}},
    ]
    par(P, "vco.tuning", "vco", "TUNE", "continuous", "Pitch reference, about one octave either side of centre.", panel_scale={"min": -1, "max": 1},
        physical={"min": -1200, "max": 1200, "unit": "cents", "note": "'approximately one octave either side'"})
    par(P, "out.volume", "out", "VOLUME", "continuous", "Level at the rear output and headphones.", panel_scale=S10)
    par(P, "dist.on", "dist", "DISTORTION ON/OFF", "boolean", "Off bypasses the distortion; DRIVE, TONE and LEVEL then do nothing.", control="slide_switch",
        values=[{"value": False, "label": "OFF"}, {"value": True, "label": "ON"}])
    par(P, "dist.drive", "dist", "DRIVE", "continuous", "Amount of distortion.", panel_scale=S10)
    par(P, "dist.tone", "dist", "TONE", "continuous", "Tone of the distortion.", panel_scale=S10)
    par(P, "dist.level", "dist", "LEVEL", "continuous", "Output level of the distortion.", panel_scale=S10)
    next(p for p in P if p["id"] == "seq.write_next")["label"] = "D.S. / WRITE/NEXT / TAP"
    next(p for p in P if p["id"] == "seq.write_next")["function"] += " Also D.S. With BACK, enters the sync and clock settings."
    next(p for p in P if p["id"] == "seq.run_stop")["label"] = "START/STOP"
    P.append({"id": "seq.clock_source", "module": "seq", "label": "clock source", "kind": "enum",
              "values": [{"value": "int"}, {"value": "midi"}, {"value": "usb"}, {"value": "trig", "meaning": "SYNC IN jack"}], "default": "int",
              "access": [{"type": "gesture", "gesture": "FUNCTION, then BACK and WRITE/NEXT together while stopped, then selector 1 to 4 within 3 s", "when": "any_time"}],
              "function": "Where the sequencer takes its clock. Must be INT without an external clock."})
    P.append({"id": "seq.clock_rate", "module": "seq", "label": "clock rate", "kind": "enum",
              "values": [{"value": "1pps", "label": "1PPS"}, {"value": "2ppq", "label": "2PPQ"}, {"value": "24ppq", "label": "24PPQ"}, {"value": "48ppq", "label": "48PPQ"}],
              "access": [{"type": "gesture", "gesture": "in the sync setting mode, selector 5 to 8", "when": "any_time"}],
              "function": "Pulses per quarter note expected from the external clock; 24 or 48 recommended."})
    P.append({"id": "sys.poly_chain", "module": "midi", "label": "poly chain", "kind": "boolean", "access": [{"type": "app", "note": "SynthTool"}],
              "function": "Chains up to 16 units for polyphony; configured from Behringer's SynthTool software."})
    J += [
        {"id": "jack.filter_in", "label": "FILTER IN", "location": "patch_in", "direction": "in", "signal": "audio", "connector": "3.5 mm TS", "node": "vcf.in",
         "normalled_from": "vco.out", "function": "External audio into the filter in place of the VCO.", "electrical": {"max_dbu": 12}},
        {"id": "jack.sync_in", "label": "SYNC IN", "location": "patch_in", "direction": "in", "signal": "clock", "connector": "3.5 mm TS", "node": "seq.clock_in",
         "function": "External clock and start/stop when the clock source is TRIG.", "electrical": {"threshold_v": 2.5}, "combine": "replace"},
        {"id": "jack.cv_out", "label": "CV OUT", "location": "patch_out", "direction": "out", "signal": "cv", "connector": "3.5 mm TS", "node": "seq.cv",
         "function": "Pitch CV, 1 V/octave, +1 to +5 V.", "electrical": {"range_v": [1, 5], "scaling": "1 V/octave"}},
        {"id": "jack.gate_out", "label": "GATE OUT", "location": "patch_out", "direction": "out", "signal": "gate", "connector": "3.5 mm TS", "node": "seq.gate",
         "function": "Gate: 0 V off, +12 V on.", "electrical": {"off_v": 0, "on_v": 12}},
        {"id": "jack.phones", "label": "PHONES", "location": "patch_out", "direction": "out", "signal": "audio", "connector": "3.5 mm TRS", "node": "out.phones",
         "function": "Headphones, up to 50 mW into 32 ohm.", "electrical": {"max_mw_32ohm": 50, "output_impedance_ohm": 15}},
        {"id": "jack.output", "label": "OUTPUT", "location": "rear", "direction": "out", "signal": "audio", "connector": "6.35 mm TS", "node": "out.line",
         "function": "Line output, up to +8 dBu.", "electrical": {"max_dbu": 8, "output_impedance_ohm": 1500}},
        {"id": "jack.midi_in", "label": "MIDI IN", "location": "rear", "direction": "in", "signal": "midi", "connector": "5-pin DIN", "node": None, "function": "MIDI from a keyboard, sequencer or computer."},
        {"id": "jack.midi_out", "label": "MIDI OUT/THRU", "location": "rear", "direction": "out", "signal": "midi", "connector": "5-pin DIN", "node": None,
         "function": "Sends MIDI and passes through MIDI IN."},
        {"id": "jack.usb", "label": "USB", "location": "rear", "direction": "bidirectional", "signal": "midi", "connector": "USB 2.0 type B", "node": None,
         "function": "Class-compliant USB MIDI in and out; also firmware updates and SynthTool."},
        {"id": "jack.dc_in", "label": "DC INPUT", "location": "rear", "direction": "in", "signal": "power", "connector": "DC barrel", "node": None,
         "function": "Supplied 9 V DC, 670 mA adaptor."},
    ]
    D["indicators"] = [
        {"id": "sys.power_led", "module": "midi", "label": "POWER LED", "kind": "led", "led_colour": "multi",
         "function": "Amber in normal mode; red in poly chain mode when stopped; green in poly chain mode when playing."},
        {"id": "seq.run_led", "module": "seq", "label": "START/STOP LED", "kind": "led", "function": "Lit while playing."},
        {"id": "seq.pitch_led", "module": "seq", "label": "PITCH MODE LED", "kind": "led", "function": "Lit in pitch mode."},
        {"id": "seq.normal_led", "module": "seq", "label": "NORMAL MODE LED", "kind": "led", "function": "Lit in normal mode."},
        {"id": "seq.time_led", "module": "seq", "label": "TIME MODE LED", "kind": "led", "function": "Lit in time mode."},
        {"id": "seq.key_leds", "module": "seq", "label": "key and selector LEDs", "kind": "led",
         "function": "Show note, pattern, bank and step state; in sync setting mode they show the clock source (1-4) and rate (5-8)."},
    ]
    D["led_legend"] = {"rule": "The POWER LED's colour shows the system mode.", "confidence": "stated",
                       "colours": [{"colour": "amber", "meaning": "normal mode"}, {"colour": "red", "meaning": "poly chain, not playing"},
                                   {"colour": "green", "meaning": "poly chain, playing"}]}
    B += [
        {"id": "b11", "name": "Clock source and rate", "applies_to": ["seq", "midi"],
         "rule": "Clock comes from the internal tempo, MIDI, USB or the SYNC IN jack (TRIG), at 1 pulse per step, 2, 24 or 48 PPQ. Set with "
                 "FUNCTION, then BACK and WRITE/NEXT together while stopped; selectors 1-4 pick the source, 5-8 the rate, and the choice saves "
                 "after 3 seconds."},
        {"id": "b12", "name": "Distortion", "applies_to": ["dist", "out"],
         "rule": "Sits after the VCA and before VOLUME. When switched off its knobs do nothing."},
        {"id": "b13", "name": "Tuning mode octave", "applies_to": ["vco"],
         "rule": "The tuning procedure plays notes an octave higher than normal."},
        {"id": "b14", "name": "Warm-up", "applies_to": ["vco", "vcf"],
         "rule": "Allow 15 minutes or more before recording or performance, longer from cold, for the analogue circuits to settle."},
        {"id": "b15", "name": "MIDI playing", "applies_to": ["midi", "seq"],
         "rule": "Note on and off, all notes off and pitch bend are received, along with clock, start, continue and stop. The quick start guide's "
                 "example uses channel 1.", "confidence": "inferred",
         "note": "The guide lists received messages; that notes play the voice is inferred from MIDI IN being described as for a keyboard."},
    ]
    D["midi"] = {
        "receives": [
            {"message": "note_on", "status": "9n", "data": ["note", "velocity"]}, {"message": "note_off", "status": "8n", "data": ["note", "velocity"]},
            {"message": "all_notes_off", "status": "Bn 7B"}, {"message": "pitch_bend", "status": "En", "range": [0, 16383]},
            {"message": "clock", "status": "F8"}, {"message": "start", "status": "FA"}, {"message": "continue", "status": "FB"}, {"message": "stop", "status": "FC"}],
        "transmits": [], "channel_note": "Examples use MIDI input channel 1; channel selection is not described.",
        "note": "MIDI OUT/THRU sends MIDI OUT data and passes MIDI IN through; what is transmitted is not listed."}
    D["specifications"] = {
        "voices": 1, "oscillators": 1, "vcf": "1 low-pass", "envelopes": 1,
        "patterns": "64 (groups I-IV x 8 x A/B)", "steps_per_pattern": 16, "tracks": 7,
        "outputs": {"line": "1/4\" TS, unbalanced, max +8 dBu, 1.5 kohm", "headphones": "3.5 mm TRS, 50 mW / 32 ohm, 15 ohm",
                    "cv": "+1 to +5 V, 1 V/octave", "gate": "0 / +12 V"},
        "inputs": {"filter_in": "+12 dBu max", "sync_in": "above 2.5 V"},
        "connectivity": {"midi": "In and Out/Thru, 5-pin DIN", "usb": "class-compliant USB 2.0 type B"},
        "power": {"adaptor": "9 V DC, 670 mA", "consumption_w": 2},
        "dimensions_mm": {"h": 56, "w": 305, "d": 165}, "weight_kg": 0.8, "operating_temp_c": [5, 45],
    }
    D["omitted_from_source"] = [
        "safety notices, warranty and registration text",
        "the studio and live hook-up diagrams",
        "the non-English translations",
    ]
    D["not_in_source"] = [
        "the voice circuit: filter type and slope, envelope times, how accent and slide work; shared behaviour taken from the TB-303 manual and circuit analyses",
        "TEMPO range and knob tapers",
        "track length limits (the TB-303 allows 64 measures per track, 256 in total)",
        "triplet step limits",
        "the MIDI channel setting and what MIDI OUT transmits",
        "poly chain behaviour beyond its configuration in SynthTool",
        "the distortion circuit",
    ]
    D["source_inconsistencies"] = [
        "The guide's specifications list one envelope; the TB-303 circuit the TD-3 recreates has two (a filter envelope and a fixed volume envelope).",
        "The guide calls the oscillator waveforms reverse sawtooth and pulse; the TB-303 manual and the TD-3 panel show sawtooth and square.",
    ]
    D["modelling_gaps"] = [
        {"topic": "Shared voice", "detail": "Envelope times, accent sweep and slide are taken from analyses of the original TB-303 and assumed to carry over."},
        {"topic": "Distortion", "detail": "Character and gain structure not documented."},
        {"topic": "Firmware", "detail": "Behaviour can change with firmware updates; this file follows quick start guide V 5.0."},
    ]
    return D, M, P, J, C, B


def finish(parts, path):
    D, M, P, J, C, B = parts
    C.sort(key=lambda c: int(c["id"][1:]))
    D["modules"], D["parameters"], D["ports"], D["connections"], D["behaviours"] = M, P, J, C, B
    order = ["schema_version", "device", "architecture", "modules", "parameters", "ports", "connections", "indicators", "led_legend",
             "behaviours", "midi", "specifications", "omitted_from_source", "not_in_source", "source_inconsistencies", "modelling_gaps"]
    out = {k: D[k] for k in order if k in D}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("written", path)


finish(tb303(), "/mnt/user-data/outputs/roland-tb-303_synth.json")
finish(td3(), "/mnt/user-data/outputs/behringer-td-3_synth.json")
