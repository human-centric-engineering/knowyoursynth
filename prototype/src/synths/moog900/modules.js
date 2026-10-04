// Behringer 900-series modules (the Moog System 15 / 35 / 55 recreations), shared by the three System SynthDefs.
// Each builder places one module on a rack at (x, y), its top-left corner: its controls, jacks, silkscreen, its area,
// the names the cable explainer uses, and its part of the engine settings (EngineParams `moog`, src/audio/moog-core.js).
//
// Faceplates are measured from Behringer's System 15 photo: 14 view units per HP, 353 units tall. Local coordinates
// below are offsets from the module's top-left corner.
import { expMap, fmtTime, fmtHz, fmtSemi } from '@/lib/maps.js';

export const HP = 14;
export const ROW_H = 353;
const S10 = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, numR: 1.72, tickR: 1.3, size: 9 };
const S10ALL = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 11, numR: 1.62, tickR: 1.3, size: 9 };
const SPM6 = { nums: [-6, -4, -2, 0, 2, 4, 6], ticks: 13, numR: 1.62, tickR: 1.3, size: 10 };
const SWIDTH = { labels: [10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => ({ at: (p - 10) / 8, text: String(p) })), ticks: 9, numR: 1.6, tickR: 1.3, size: 9 };

/** The 911's time knobs: 2 ms at 0 to 10 s at 10, equal ratios per step (the panel prints M SEC and SEC scales). */
export const time911 = (v) => expMap(v / 10, 0.002, 10);
const atTime = (t) => (10 * Math.log(t / 0.002)) / Math.log(5000);
const STIME = { labels: [[0.002, '2'], [0.02, '20'], [0.2, '200'], [2, '2'], [10, '10']].map(([t, text]) => ({ at: atTime(t), text })), ticks: 11, numR: 1.6, tickR: 1.3, size: 9 };
/** The 923's cutoff knobs: 10 Hz at 0 to 10 kHz at 10. */
export const hz923 = (v) => expMap(v / 10, 10, 10000);
const atHz = (hz) => (10 * Math.log(hz / 10)) / Math.log(1000);
const SHZ = { labels: [[12, '12'], [20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1'], [2000, '2'], [5000, '5']].map(([h, text]) => ({ at: atHz(h), text })), ticks: 0, numR: 1.62, size: 9 };
/** The 961's SWITCH-ON TIME: 40 ms to 4 s. */
export const time961 = (v) => expMap(v / 10, 0.04, 4);
const atT961 = (t) => (10 * Math.log(t / 0.04)) / Math.log(100);
const S961 = { labels: [[0.04, '40'], [0.06, '60'], [0.1, '100'], [0.25, '250'], [0.5, '500'], [1, '1'], [2, '2.0'], [4, '4.0']].map(([t, text]) => ({ at: atT961(t), text })), ticks: 0, numR: 1.6, size: 9 };

const FOOT = { LO: -8, "32'": -2, "16'": -1, "8'": 0, "4'": 1, "2'": 2, "1'": 3 };
const RANGE_B = ['LO', "32'", "16'", "8'", "4'", "2'"].map((v, i) => ({ v, label: v, a: -100 + i * 40 }));
const RANGE_921 = ["32'", "16'", "8'", "4'", "2'", "1'"].map((v, i) => ({ v, label: v, a: -100 + i * 40 }));

/**
 * A rack: the lists a SynthDef is made of, plus slot counters for the engine and the per-module engine writers.
 * `finish()` returns the parts of the SynthDef that the rack owns.
 */
export function createRack() {
  const r = {
    controls: [], jacks: [], decor: [], areas: [], signalNames: {}, destNames: {}, eng: [],
    slots: { vco: 0, drv: 0, vca: 0, env: 0, mix: 0, mult: 0, ctl: 0 },
    next(kind) { r.slots[kind] += 1; return r.slots[kind]; },
  };
  return r;
}

/** The engine settings for the whole rack, from the panel values. */
export function rackEngine(r, v) {
  const m = { vco: [], drv: [], vca: [], env: [], mix: [], ctl: [], att: [0, 0, 0, 0], cm1a: { trig: 's' } };
  for (const f of r.eng) f(v, m);
  return m;
}

/** Shared drawing helpers for one module at (x0, y0), `w` units wide. */
function mod(r, x0, y0, hp, id, title, area) {
  const w = hp * HP;
  const P = (x, y) => [x0 + x, y0 + y];
  const d = r.decor;
  d.push({ t: 'rect', x: x0 + 1, y: y0, w: w - 2, h: ROW_H, r: 3, fill: '#1b1b1c', stroke: '#050505', sw: 2, hw: true });
  d.push({ t: 'rect', x: x0 + 1, y: y0, w: w - 2, h: ROW_H, r: 3, fill: 'none', stroke: '#3a3a3c', sw: 1.4 });
  [[13, 7], [w - 13, 7], [13, ROW_H - 7], [w - 13, ROW_H - 7]].forEach(([sx, sy]) => d.push({ t: 'screw', x: x0 + sx, y: y0 + sy, r: 5, hw: true }));
  const t = (x, y, text, size = 11, rest = {}) => { const [px, py] = P(x, y); d.push({ t: 'text', x: px, y: py, text, size, anchor: 'middle', weight: 600, ...rest }); };
  const line = (x1, y1, x2, y2, w2 = 1.5) => { const [a, b] = P(x1, y1); const [c, e] = P(x2, y2); d.push({ t: 'line', x1: a, y1: b, x2: c, y2: e, w: w2 }); };
  const wave = (x, y, shape, size = 8) => { const [px, py] = P(x, y); d.push({ t: 'wave', x: px, y: py, size, shape }); };
  if (title) t(w / 2, 24, title, title.length > 15 && hp <= 8 ? 9.5 : 11, { weight: 700 });
  t(w / 2, ROW_H - 19, id.label, 11, { weight: 700 });
  d.push({ t: 'text', x: x0 + w / 2, y: y0 + ROW_H - 7, text: 'behringer', size: 10, anchor: 'middle', weight: 500, hw: true });
  r.areas.push({ id: area.id, label: area.label, module: area.module, keywords: area.keywords || '', rects: [{ x: x0 + 2, y: y0 + 1, w: w - 4, h: ROW_H - 2 }], help: area.help });
  const knob = (cid, x, y, rr, rest) => { const [px, py] = P(x, y); r.controls.push({ id: cid, type: 'knob', x: px, y: py, r: rr, style: 'd-silver', labelPos: 'none', ...rest }); };
  const sw = (cid, x, y, rest) => { const [px, py] = P(x, y); r.controls.push({ id: cid, x: px, y: py, labelPos: 'none', ...rest }); };
  const jack = (jid, x, y, rest) => { const [px, py] = P(x, y); r.jacks.push({ id: jid, x: px, y: py, r: 9, labelPos: 'none', ...rest }); };
  return { w, t, line, wave, knob, sw, jack, P };
}

/** Blank panel (BP2 … BP56): just the plate and its name. */
export function blank(r, x0, y0, hp, label) {
  const w = hp * HP;
  r.decor.push({ t: 'rect', x: x0 + 1, y: y0, w: w - 2, h: ROW_H, r: 3, fill: '#1b1b1c', stroke: '#050505', sw: 2, hw: true });
  r.decor.push({ t: 'rect', x: x0 + 1, y: y0, w: w - 2, h: ROW_H, r: 3, fill: 'none', stroke: '#3a3a3c', sw: 1.4 });
  [[13, 7], [w - 13, 7], [13, ROW_H - 7], [w - 13, ROW_H - 7]].forEach(([sx, sy]) => r.decor.push({ t: 'screw', x: x0 + sx, y: y0 + sy, r: 5, hw: true }));
  if (hp >= 4) {
    r.decor.push({ t: 'text', x: x0 + w / 2, y: y0 + ROW_H - 19, text: label, size: 11, anchor: 'middle', weight: 700 });
    r.decor.push({ t: 'text', x: x0 + w / 2, y: y0 + ROW_H - 7, text: 'behringer', size: 10, anchor: 'middle', weight: 500, hw: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 914 Fixed Filter Bank (28 HP)
export function m914(r, x0, y0, id = 'm914') {
  const m = mod(r, x0, y0, 28, { label: '914' }, 'FIXED FILTER BANK', {
    id, label: '914 Fixed Filter Bank', module: 'filter', keywords: 'formant eq equaliser equalizer bands resonances fixed filter bank vocal',
    help: 'Fourteen filters side by side, each at a fixed frequency: a low-pass, twelve narrow band-passes from 125 Hz to 5.6 kHz, and a high-pass. Each knob sets how much of its band reaches the output. Because the bands do not move with the note, they print a fixed set of resonances on the sound, like the body of an acoustic instrument.',
  });
  const lvl = (cid, x, y, label, help) => m.knob(cid, x, y, 14, { kind: 'cont', min: 0, max: 10, def: 10, label, module: 'filter', scale: S10, help });
  m.t(39, 83, 'LOW PASS', 10);
  lvl(`${id}.band_low_pass`, 39, 120, 'LOW PASS', 'Level of everything below about 100 Hz. Turn it down to thin the bottom end; up to keep the body of a bass.');
  const cols = [100, 160, 222, 285], rows = [80, 164, 248];
  [[125, 175, 250], [350, 500, 700], [1000, 1400, 2000], [2800, 4000, 5600]].forEach((col, ci) => col.forEach((hz, ri) => {
    m.t(cols[ci], rows[ri] - 39, String(hz), 10);
    lvl(`${id}.band_${hz}`, cols[ci], rows[ri], `${hz} Hz`, `Level of the narrow band around ${hz} Hz. Turn neighbouring bands up and others down to give the sound fixed peaks, like the formants of a voice.`);
  }));
  m.t(350, 83, 'HIGH PASS', 10);
  lvl(`${id}.band_high_pass`, 350, 120, 'HIGH PASS', 'Level of everything above about 7 kHz: the hiss and sparkle at the top of the sound.');
  m.t(37, 266, 'INPUT', 10); m.t(353, 266, 'OUTPUT', 10);
  [1, 2].forEach((k) => {
    m.jack(`j.${id}.in_${k}`, 37, 253 + 30 * k, { label: 'INPUT', name: `914 INPUT ${k}`, dir: 'in', dest: 'fb914In', amt: 1, add: true,
      help: 'Signal into the filter bank. The two INPUT jacks are joined, so two signals plugged in are added together.' });
    m.jack(`j.${id}.out_${k}`, 353, 253 + 30 * k, { label: 'OUTPUT', name: `914 OUTPUT ${k}`, dir: 'out', signal: 'fb914',
      help: 'The sum of all fourteen filters, each at its knob’s level. Both OUTPUT jacks carry the same signal.' });
  });
  r.signalNames.fb914 = 'the 914 filter bank';
  r.destNames.fb914In = 'the 914 filter bank';
  const ids = ['low_pass', 125, 175, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600, 'high_pass'];
  r.eng.push((v, e) => { e.fb914 = { g: ids.map((b) => v[`${id}.band_${b}`] / 10) }; });
}

// 923 Filters and noise (8 HP)
export function m923(r, x0, y0, id = 'm923') {
  const m = mod(r, x0, y0, 8, { label: '923' }, 'FILTERS', {
    id, label: '923 Filters and noise', module: 'filter', keywords: 'noise white pink hiss band-pass bandpass 6 db gentle tone',
    help: 'Two gentle 6 dB/oct filters, a low-pass and a high-pass, each set by hand (no voltage control), plus the noise source. Patch the low-pass into the high-pass for a band-pass. WHITE noise is bright hiss; PINK has less top and sounds more like wind or surf.',
  });
  m.t(56, 41, 'LOW PASS', 10);
  m.knob(`${id}.lp`, 56, 80, 14, { kind: 'cont', min: 0, max: 10, def: 10, label: 'LOW PASS', module: 'filter', scale: SHZ, fmt: (v) => fmtHz(hz923(v)),
    help: 'Cutoff of the low-pass filter, 10 Hz to 10 kHz. It takes away the top of whatever is patched to its IN, gently.' });
  m.t(56, 155, 'HIGH PASS', 10);
  m.knob(`${id}.hp`, 56, 194, 14, { kind: 'cont', min: 0, max: 10, def: 0, label: 'HIGH PASS', module: 'filter', scale: SHZ, fmt: (v) => fmtHz(hz923(v)),
    help: 'Cutoff of the high-pass filter, 10 Hz to 10 kHz. It takes away the bottom of whatever is patched to its IN.' });
  [[111, 126, 'lp'], [225, 240, 'hp']].forEach(([ly, jy, k]) => {
    m.t(34, ly, 'IN', 9); m.t(85, ly, 'OUT', 9);
    const nm = k === 'lp' ? 'LOW PASS' : 'HIGH PASS';
    m.jack(`j.${id}.${k}_in`, 34, jy, { label: 'IN', name: `923 ${nm} IN`, dir: 'in', dest: `${k}923In`, amt: 1, help: `Signal into the 923’s ${nm.toLowerCase()} filter.` });
    m.jack(`j.${id}.${k}_out`, 85, jy, { label: 'OUT', name: `923 ${nm} OUT`, dir: 'out', signal: `${k}923`, help: `The 923’s ${nm.toLowerCase()} filter output.` });
  });
  m.line(4, 143, 108, 143); m.line(4, 258, 108, 258);
  m.t(56, 266, 'NOISE SOURCE', 9); m.t(56, 276, 'WHITE', 9); m.t(56, 304, 'PINK', 9);
  m.line(44, 283, 75, 283); m.line(44, 313, 75, 313);
  [1, 2].forEach((k) => {
    m.jack(`j.${id}.white_${k}`, k === 1 ? 34 : 85, 283, { label: 'WHITE', name: `WHITE NOISE ${k}`, dir: 'out', signal: 'white', help: 'White noise: equal energy at every frequency, a bright hiss. Both jacks carry the same noise.' });
    m.jack(`j.${id}.pink_${k}`, k === 1 ? 34 : 85, 313, { label: 'PINK', name: `PINK NOISE ${k}`, dir: 'out', signal: 'pink', help: 'Pink noise: less top than white, so it sounds deeper, like wind or surf. Both jacks carry the same noise.' });
  });
  Object.assign(r.signalNames, { lp923: 'the 923 low-pass', hp923: 'the 923 high-pass', white: 'white noise', pink: 'pink noise' });
  Object.assign(r.destNames, { lp923In: 'the 923 low-pass', hp923In: 'the 923 high-pass' });
  r.eng.push((v, e) => { e.f923 = { lp: hz923(v[`${id}.lp`]), hp: hz923(v[`${id}.hp`]) }; });
}

// 904B high-pass and 904A low-pass (8 HP each)
function vcf(r, x0, y0, id, hi) {
  const nm = hi ? '904B' : '904A';
  const m = mod(r, x0, y0, 8, { label: nm }, null, hi ? {
    id, label: '904B Voltage Controlled High Pass Filter', module: 'filter', keywords: 'hpf high-pass highpass thin bass cut',
    help: 'A 24 dB/oct high-pass filter: it removes everything below its cutoff, steeply. FIXED CONTROL VOLTAGE sets the cutoff within the FREQUENCY RANGE, and the three CONTROL INPUTS move it at 1 V per octave.',
  } : {
    id, label: '904A Voltage Controlled Low Pass Filter', module: 'filter', keywords: 'vcf lpf low-pass lowpass ladder cutoff resonance emphasis moog filter',
    help: 'The Moog ladder filter: 24 dB/oct low-pass. FIXED CONTROL VOLTAGE sets the cutoff within the FREQUENCY RANGE; the three CONTROL INPUTS add to it at 1 V per octave, so an envelope here makes the classic sweep and the keyboard CV makes it track. REGENERATION is resonance; near the top it rings on its own.',
  });
  m.t(57, 24, 'VOLTAGE CONTROLLED', 10, { weight: 700 });
  m.t(57, 34, hi ? 'HIGH PASS FILTER' : 'LOW PASS FILTER', 10, { weight: 700 });
  m.t(57, 44, 'FIXED CONTROL VOLTAGE', 8);
  m.knob(`${id}.fixed_cv`, 55, 80, 14, { kind: 'cont', min: -6, max: 6, def: 0, label: 'FIXED CONTROL VOLTAGE', name: `${nm} FIXED CONTROL VOLTAGE`, module: 'filter', scale: SPM6, unit: 'V',
    help: `Sets the cutoff by hand: ±6 V, an octave per volt, so the knob sweeps 12 octaves. ${hi ? 'Higher removes more of the bottom.' : 'Higher lets more of the top through.'} It adds to the CONTROL INPUTS.` });
  m.t(57, 114, 'FREQUENCY RANGE', 9);
  if (hi) {
    m.t(46, 123, 'LOW', 8); m.t(70, 123, 'HIGH', 8);
    m.sw(`${id}.range`, 55, 158, { type: 'knob', r: 15, style: 'd-chicken', kind: 'enum', def: 'low', label: 'FREQUENCY RANGE', name: '904B FREQUENCY RANGE', module: 'filter',
      options: [{ v: 'low', label: '', a: -30 }, { v: 'high', label: '', a: 30 }],
      help: 'LOW puts the cutoff range at 4 Hz–20 kHz, HIGH at 10 Hz–50 kHz, for the same knob and control voltages.' });
  } else {
    m.sw(`${id}.range`, 54, 156, { type: 'knob', r: 15, style: 'd-chicken', kind: 'enum', def: 2, label: 'FREQUENCY RANGE', name: '904A FREQUENCY RANGE', module: 'filter',
      options: [{ v: 1, label: '1', a: -40 }, { v: 2, label: '2', a: 0 }, { v: 3, label: '3', a: 40 }],
      help: 'Moves the whole cutoff range by two octaves: 1 is 1 Hz–5 kHz, 2 is 4 Hz–20 kHz, 3 is 16 Hz–80 kHz. Use 1 for dark bass, 3 to keep things bright.' });
    m.t(57, 192, 'REGENERATION', 9);
    m.knob(`${id}.regeneration`, 53, 225, 14, { kind: 'cont', min: 0, max: 10, def: 0, label: 'REGENERATION', module: 'filter', scale: S10,
      help: 'Resonance: feeds the output back to make a peak at the cutoff. Higher is more whistling and squelch; from about 9 the filter rings on its own as a sine wave.' });
  }
  m.t(22, 262, 'SIG IN', 8); m.t(94, 262, 'SIG OUT', 8);
  const k = hi ? 'hp904' : 'lp904';
  m.jack(`j.${id}.sig_in`, 22, 280, { label: 'SIG IN', name: `${nm} SIG IN`, dir: 'in', dest: `${k}In`, amt: 1, help: `The signal to be filtered. DC coupled, so a control voltage can be filtered too (that smooths it).` });
  m.jack(`j.${id}.sig_out`, 94, 280, { label: 'SIG OUT', name: `${nm} SIG OUT`, dir: 'out', signal: k, help: `The filtered signal.` });
  m.t(57, 296, 'CONTROL INPUTS', 9);
  [22, 57, 92].forEach((x, i) => m.jack(`j.${id}.cv_${i + 1}`, x, 313, { label: `CONTROL INPUT ${i + 1}`, name: `${nm} CONTROL INPUT ${i + 1}`, dir: 'in', dest: `${k}Cv`, amt: 1, add: true,
    help: 'Moves the cutoff at 1 V per octave, adding to FIXED CONTROL VOLTAGE and the other two inputs. An envelope here sweeps the filter; the CM1A CV here makes it follow the keyboard.' }));
  r.signalNames[k] = hi ? 'the 904B high-pass filter' : 'the 904A low-pass filter';
  r.destNames[`${k}In`] = r.signalNames[k];
  r.destNames[`${k}Cv`] = `the ${nm} cutoff`;
  r.eng.push((v, e) => {
    if (hi) e.hp904 = { lo: v[`${id}.range`] === 'high' ? 12 : 4, v: v[`${id}.fixed_cv`] };
    else e.lp904 = { lo: [1, 4, 16][v[`${id}.range`] - 1], v: v[`${id}.fixed_cv`], regen: (v[`${id}.regeneration`] / 10) * 1.16 };
  });
}
export const m904b = (r, x0, y0, id = 'm904b') => vcf(r, x0, y0, id, true);
export const m904a = (r, x0, y0, id = 'm904a') => vcf(r, x0, y0, id, false);

// 902 Voltage Controlled Amplifier (8 HP)
export function m902(r, x0, y0, n, id = `m902_${n}`) {
  const s = r.next('vca');
  const m = mod(r, x0, y0, 8, { label: '902' }, null, {
    id, label: `902 Voltage Controlled Amplifier (${n})`, module: 'amp', keywords: 'vca amplifier loudness volume gain tremolo',
    help: 'An amplifier whose gain is set by a voltage: FIXED CONTROL VOLTAGE plus whatever arrives at the CONTROL INPUTS. Patch an envelope into a control input and the amplifier opens for each note. It handles control voltages as well as audio, so it can also fade an LFO in and out. LIN or EXP sets how the gain follows the voltage.',
  });
  m.t(57, 24, 'VOLTAGE CONTROLLED', 10, { weight: 700 });
  m.t(57, 34, 'AMPLIFIER', 10, { weight: 700 });
  m.t(55, 59, 'CONTROL MODE', 9);
  m.t(23, 78, 'LIN', 9); m.t(88, 78, 'EXP', 9);
  m.sw(`${id}.mode`, 55, 78, { type: 'rocker', w: 38, h: 20, color: 'black', kind: 'enum', def: 'lin', label: 'CONTROL MODE', name: `902 (${n}) CONTROL MODE`, module: 'amp',
    options: [{ v: 'lin', label: 'LIN' }, { v: 'exp', label: 'EXP' }],
    help: 'LIN: the gain rises evenly with the control voltage, which suits envelopes. EXP: the gain rises slowly at first and fast near the top (about 12 dB per volt), which gives a snappier, more percussive shape from the same envelope.' });
  m.t(55, 123, 'FIXED CONTROL VOLTAGE', 8);
  m.knob(`${id}.fixed_cv`, 53, 160, 14, { kind: 'cont', min: 0, max: 6, def: 0, label: 'FIXED CONTROL VOLTAGE', name: `902 (${n}) FIXED CONTROL VOLTAGE`, module: 'amp', unit: 'V',
    scale: { nums: [1, 2, 3, 4, 5], ticks: 7, numR: 1.62, tickR: 1.3, size: 10 },
    help: 'A steady control voltage, 0 to 6 V, added to the CONTROL INPUTS. At 0 the amplifier is shut until an envelope opens it; turn it up and the signal passes all the time (6 V is full level).' });
  m.line(4, 191, 108, 191); m.line(4, 258, 108, 258); m.line(55, 191, 55, 258);
  m.t(31, 199, 'SIG IN', 8); m.t(80, 199, 'SIG OUT', 8);
  m.t(13, 205, '+', 10); m.t(13, 246, '−', 10); m.t(99, 205, '−', 10); m.t(99, 246, '+', 10);
  m.jack(`j.${id}.sig_in_pos`, 27, 214, { label: 'SIG IN +', name: `902 (${n}) SIG IN +`, dir: 'in', dest: `a${s}ip`, amt: 1, add: true, help: 'Signal in. What arrives here comes out of SIG OUT + at the gain the control voltage sets.' });
  m.jack(`j.${id}.sig_in_neg`, 27, 246, { label: 'SIG IN −', name: `902 (${n}) SIG IN −`, dir: 'in', dest: `a${s}in`, amt: 1, add: true, help: 'Inverting signal in: what arrives here comes out upside down. Feed the same signal to both inputs and they cancel.' });
  m.jack(`j.${id}.out_neg`, 80, 214, { label: 'SIG OUT −', name: `902 (${n}) SIG OUT −`, dir: 'out', signal: `a${s}n`, help: 'The amplified signal, turned upside down.' });
  m.jack(`j.${id}.out_pos`, 80, 246, { label: 'SIG OUT +', name: `902 (${n}) SIG OUT +`, dir: 'out', signal: `a${s}p`, help: 'The amplified signal.' });
  m.t(55, 267, 'CONTROL INPUTS', 9);
  [[29, 283], [80, 283], [55, 313]].forEach(([x, y], i) => m.jack(`j.${id}.cv_${i + 1}`, x, y, { label: `CONTROL INPUT ${i + 1}`, name: `902 (${n}) CONTROL INPUT ${i + 1}`, dir: 'in', dest: `a${s}cv`, amt: 1, add: true,
    help: 'Gain control, added to FIXED CONTROL VOLTAGE and the other inputs: 6 V opens the amplifier fully, 0 V or less shuts it. Patch a 911 envelope here to shape each note.' }));
  r.signalNames[`a${s}p`] = `902 amplifier ${n}`;
  r.signalNames[`a${s}n`] = `902 amplifier ${n} (inverted)`;
  r.destNames[`a${s}ip`] = `902 amplifier ${n}`;
  r.destNames[`a${s}in`] = `902 amplifier ${n}`;
  r.eng.push((v, e) => { e.vca[s - 1] = { v: v[`${id}.fixed_cv`], exp: v[`${id}.mode`] === 'exp' }; });
}

// 911 Envelope Generator (8 HP)
export function m911(r, x0, y0, n, id = `m911_${n}`) {
  const s = r.next('env');
  const m = mod(r, x0, y0, 8, { label: '911' }, 'ENVELOPE GENERATOR', {
    id, label: `911 Envelope Generator (${n})`, module: 'env', keywords: 'adsr envelope contour attack decay sustain release t1 t2 t3',
    help: 'The Moog envelope: a voltage that rises and falls once for each note. It starts when its S-TRIG IN is pulled low and runs T1 (attack) up to the peak, T2 (initial decay) down to E SUS (sustain level) while the trigger is held, and T3 (final decay) back to zero after it ends. Patch OUT to a 902 to shape loudness, or to the 904A to sweep the filter.',
  });
  const tk = (cid, y, label, help) => {
    m.t(56, y - 31, label, 9, { weight: 700 });
    m.t(24, y - 24, 'M SEC', 6); m.t(89, y - 24, 'SEC', 6);
    m.knob(cid, 56, y, 12, { kind: 'cont', min: 0, max: 10, def: 3, label, name: `911 (${n}) ${label}`, module: 'env', scale: STIME, fmt: (x) => fmtTime(time911(x)), help });
  };
  tk(`${id}.t1`, 80, 'T1', 'Attack: how long the envelope takes to rise to its peak, 2 ms to 10 s. Short for a sharp start, long for a slow swell.');
  tk(`${id}.t2`, 143, 'T2', 'Initial decay: how long it takes to fall from the peak to the E SUS level while the trigger is held, 2 ms to 10 s.');
  tk(`${id}.t3`, 208, 'T3', 'Final decay: how long it takes to fall to zero once the trigger ends (the key is let go), 2 ms to 10 s. This is the release.');
  m.t(51, 241, 'E SUS', 9, { weight: 700 });
  m.knob(`${id}.esus`, 51, 266, 12, { kind: 'cont', min: 0, max: 10, def: 7, label: 'E SUS', name: `911 (${n}) E SUS`, module: 'env', scale: S10, fmt: (x) => `${(x * 0.55).toFixed(1)} V`,
    help: 'Sustain level: where the envelope rests while the trigger is held, 0 to +5.5 V. At 0 every note dies away after T2 even if you keep holding the key.' });
  m.t(31, 296, 'S-TRIG IN', 8); m.t(83, 296, 'OUT', 8);
  m.jack(`j.${id}.strig`, 31, 313, { label: 'S-TRIG IN', name: `911 (${n}) S-TRIG IN`, dir: 'in', dest: `e${s}st`, amt: 1,
    help: 'Starts the envelope. It is an S-trigger input: the envelope runs while this line is pulled down to 0 V. Patch the CM1A’s TRIG here with TRIG MODE on S-TRIG.' });
  m.jack(`j.${id}.out`, 83, 313, { label: 'OUT', name: `911 (${n}) OUT`, dir: 'out', signal: `e${s}`, help: 'The envelope voltage, 0 to +6 V.' });
  r.signalNames[`e${s}`] = `911 envelope ${n}`;
  r.destNames[`e${s}st`] = `911 envelope ${n}`;
  r.eng.push((v, e) => { e.env[s - 1] = { t1: time911(v[`${id}.t1`]), t2: time911(v[`${id}.t2`]), t3: time911(v[`${id}.t3`]), sus: v[`${id}.esus`] * 0.55 }; });
}

// 921A Oscillator Driver (8 HP)
export function m921a(r, x0, y0, n, id = `m921a_${n}`) {
  const s = r.next('drv');
  const m = mod(r, x0, y0, 8, { label: '921A' }, null, {
    id, label: `921A Oscillator Driver (${n})`, module: 'osc', keywords: 'master tune pitch driver link expo converter pulse width pwm',
    help: 'The controller for a bank of 921B oscillators. It makes no sound itself: it adds its FREQUENCY knob to its control inputs and sends the result to the 921Bs through CONTROL OUTPUTS TO 921B, and likewise the pulse WIDTH. Patch the CM1A CV into a FREQUENCY input and every linked 921B plays from the keyboard.',
  });
  m.t(55, 24, 'OSCILLATOR DRIVER', 11, { weight: 700 });
  m.t(55, 33, 'FREQUENCY', 9);
  m.knob(`${id}.frequency`, 52, 74, 18, { kind: 'cont', min: -6, max: 6, def: 0, label: 'FREQUENCY', name: `921A (${n}) FREQUENCY`, module: 'osc', scale: SPM6,
    help: 'Tunes every linked 921B together. With the switch on OCTAVE the knob spans ±6 octaves; on SEMITONE it spans ±12 semitones, for fine tuning.' });
  m.t(55, 112, 'OCTAVE', 7); m.t(55, 119, 'SEMITONE', 7);
  m.t(22, 130, 'SEMI', 8); m.t(22, 138, 'TONE', 8); m.t(92, 134, 'OCTAVE', 8);
  m.sw(`${id}.scale`, 52, 134, { type: 'rocker', w: 30, h: 18, color: 'white', kind: 'enum', def: 'octave', label: 'SEMITONE / OCTAVE', name: `921A (${n}) SEMITONE / OCTAVE`, module: 'osc',
    options: [{ v: 'semitone', label: 'SEMITONE' }, { v: 'octave', label: 'OCTAVE' }],
    help: 'Sets what FREQUENCY covers: SEMITONE for ±12 semitones (fine tuning), OCTAVE for ±6 octaves (big jumps).' });
  m.t(55, 154, 'WIDTH OF RECTANGULAR WAVE', 7);
  m.knob(`${id}.width`, 50, 189, 14, { kind: 'cont', min: 0, max: 10, def: 5, label: 'WIDTH OF RECTANGULAR WAVE', name: `921A (${n}) WIDTH`, module: 'osc', scale: SWIDTH,
    fmt: (x) => `${Math.round(10 + x * 8)} %`, help: 'Pulse width of the linked 921Bs’ RECTANGULAR outputs, 10 % to 90 %. 50 % is a hollow square wave; narrower is thinner and more nasal.' });
  m.t(55, 226, 'CONTROL INPUTS', 8); m.t(29, 234, 'FREQUENCY', 7); m.t(79, 234, 'WIDTH', 7);
  [1, 2].forEach((k) => {
    m.jack(`j.${id}.freq_in_${k}`, 29, 221 + 30 * k, { label: 'FREQUENCY', name: `921A (${n}) FREQUENCY IN ${k}`, dir: 'in', dest: `d${s}fi`, amt: 1, add: true,
      help: 'Pitch control for every linked 921B, 1 V per octave, added to the FREQUENCY knob. Patch the CM1A CV here to play them from the keyboard.' });
    m.jack(`j.${id}.width_in_${k}`, 79, 221 + 30 * k, { label: 'WIDTH', name: `921A (${n}) WIDTH IN ${k}`, dir: 'in', dest: `d${s}wi`, amt: 1, add: true,
      help: 'Pulse-width control, added to the WIDTH knob. A slow oscillator here sweeps the width of every linked rectangular wave (PWM).' });
  });
  m.t(55, 296, 'CONTROL OUTPUTS TO 921B', 7);
  m.jack(`j.${id}.freq_out`, 29, 311, { label: 'FREQUENCY', name: `921A (${n}) FREQUENCY TO 921B`, dir: 'out', signal: `d${s}f`,
    help: 'The pitch voltage for the 921Bs. Patch it to a 921B’s 921AB LINK FREQ, then chain on to the next 921B from that one’s second link jack.' });
  m.jack(`j.${id}.width_out`, 79, 311, { label: 'WIDTH', name: `921A (${n}) WIDTH TO 921B`, dir: 'out', signal: `d${s}w`,
    help: 'The pulse-width voltage for the 921Bs. Patch it to a 921B’s 921AB LINK WIDTH.' });
  r.signalNames[`d${s}f`] = `921A driver ${n} (frequency)`;
  r.signalNames[`d${s}w`] = `921A driver ${n} (width)`;
  r.eng.push((v, e) => {
    const f = v[`${id}.frequency`];
    e.drv[s - 1] = { v: v[`${id}.scale`] === 'octave' ? f : f / 6, w: (10 + v[`${id}.width`] * 8) / 16 };
  });
}

// 921B Oscillator (8 HP)
export function m921b(r, x0, y0, n, id = `m921b_${n}`) {
  const s = r.next('vco');
  const m = mod(r, x0, y0, 8, { label: '921B' }, 'OSCILLATOR', {
    id, label: `921B Oscillator (${n})`, module: 'osc', keywords: 'vco oscillator sine triangle saw sawtooth square pulse sync fm detune',
    help: 'A voltage-controlled oscillator with four waveforms out at once. Its pitch comes from a 921A over the 921AB LINK FREQ jack; RANGE picks the octave and FREQUENCY detunes it by up to an octave either way. SYNC IN locks it to another oscillator, and AC MOD and DC MOD bend its pitch.',
  });
  m.t(55, 40, 'FREQUENCY', 9);
  m.knob(`${id}.frequency`, 52, 70, 15, { kind: 'cont', min: -12, max: 12, def: 0, label: 'FREQUENCY', name: `921B (${n}) FREQUENCY`, module: 'osc',
    scale: { nums: [-12, -6, 0, 6, 12], ticks: 13, numR: 1.62, tickR: 1.3, size: 9 }, fmt: fmtSemi,
    help: 'Fine tuning, ±12 semitones from the RANGE setting. Set two linked 921Bs a few cents apart for a thick, beating sound, or seven semitones apart for a fifth.' });
  m.t(55, 103, 'SEMITONES', 7);
  m.t(55, 114, 'RANGE', 8);
  m.sw(`${id}.range`, 52, 154, { type: 'knob', r: 13, style: 'd-chicken', kind: 'enum', def: "8'", label: 'RANGE', name: `921B (${n}) RANGE`, module: 'osc', options: RANGE_B,
    help: 'The octave, in organ footages: 32’ is lowest, 2’ highest, and each step is an octave. LO drops it far below hearing, so the 921B becomes a slow modulation source (an LFO).' });
  m.t(19, 188, 'SYNC', 8); m.t(10, 196, 'WEAK', 7); m.t(36, 222, 'STRONG', 7);
  m.sw(`${id}.sync`, 17, 209, { type: 'toggle', w: 14, kind: 'enum', def: 'off', label: 'SYNC', name: `921B (${n}) SYNC`, module: 'osc',
    options: [{ v: 'weak', label: 'WEAK' }, { v: 'off', label: 'OFF' }, { v: 'strong', label: 'STRONG' }],
    help: 'How SYNC IN works: OFF ignores it; WEAK nudges this oscillator into step with the one patched in (it locks within a few semitones); STRONG restarts its cycle with every cycle of the other one (hard sync).' });
  m.t(19, 232, 'SYNC IN', 7); m.t(19, 264, 'AC MOD', 7); m.t(19, 295, 'DC MOD', 7);
  m.jack(`j.${id}.sync`, 17, 250, { label: 'SYNC IN', name: `921B (${n}) SYNC IN`, dir: 'in', dest: `v${s}sy`, amt: 1,
    help: 'Patch another oscillator’s SAWTOOTH here to sync this one to it (set SYNC to WEAK or STRONG).' });
  m.jack(`j.${id}.ac_mod`, 17, 280, { label: 'AC MOD', name: `921B (${n}) AC MOD`, dir: 'in', dest: `v${s}ac`, amt: 1, add: true,
    help: 'Pitch modulation that ignores steady voltages: only changes get through. Use it for audio-rate FM from another oscillator.' });
  m.jack(`j.${id}.dc_mod`, 17, 311, { label: 'DC MOD', name: `921B (${n}) DC MOD`, dir: 'in', dest: `v${s}dc`, amt: 1, add: true,
    help: 'Pitch control at 1 V per octave, added to the link voltage. Vibrato, pitch envelopes, or a second keyboard CV go here.' });
  [['sin', 'sine', 'SINE'], ['tri', 'tri', 'TRIANGLE'], ['saw', 'saw', 'SAWTOOTH'], ['rect', 'sq', 'RECTANGULAR']].forEach(([k, shape, nm], i) => {
    m.wave(55, 203 + 31 * i, shape, 7);
    m.jack(`j.${id}.${k === 'sin' ? 'sine' : k === 'tri' ? 'triangle' : k === 'saw' ? 'sawtooth' : 'rectangular'}`, 55, 219 + 31 * i - (i > 1 ? 1 : 0), {
      label: nm, name: `921B (${n}) ${nm}`, dir: 'out', signal: `v${s}${k}`,
      help: {
        sin: 'Sine wave: the pure fundamental with no overtones. A soft flute-like tone, or a smooth LFO in the LO range.',
        tri: 'Triangle wave: a few soft odd harmonics. Mellow, slightly brighter than the sine.',
        saw: 'Sawtooth wave: every harmonic, bright and buzzy. The usual start for brass, strings and bass.',
        rect: 'Rectangular (pulse) wave, at the width set on the 921A. Hollow at 50 %, thinner and more nasal when narrow.',
      }[k] });
    r.signalNames[`v${s}${k}`] = `921B oscillator ${n} ${nm.toLowerCase()}`;
  });
  m.t(90, 182, '921AB', 7); m.t(90, 190, 'LINK', 7); m.t(90, 198, 'FREQ', 7); m.t(90, 265, 'WIDTH', 7);
  m.line(90, 228, 90, 241); m.line(90, 289, 90, 302);
  m.jack(`j.${id}.freq_link`, 90, 219, { label: '921AB LINK FREQ', name: `921B (${n}) LINK FREQ`, dir: 'in', dest: `v${s}lf`, amt: 1,
    help: 'Pitch from a 921A (or the previous 921B’s second link jack), 1 V per octave. With nothing here the oscillator sits at the RANGE and FREQUENCY setting.' });
  m.jack(`j.${id}.freq_link_thru`, 90, 250, { label: '921AB LINK FREQ', name: `921B (${n}) LINK FREQ (to next)`, dir: 'out', signal: `v${s}lft`,
    help: 'The same pitch voltage passed on, to link the next 921B to the same 921A.' });
  m.jack(`j.${id}.width_link`, 90, 280, { label: '921AB LINK WIDTH', name: `921B (${n}) LINK WIDTH`, dir: 'in', dest: `v${s}lw`, amt: 1,
    help: 'Pulse width from a 921A, about 16 % per volt. With nothing here the rectangular wave is square (50 %); outside 0–6 V it stops.' });
  m.jack(`j.${id}.width_link_thru`, 90, 311, { label: '921AB LINK WIDTH', name: `921B (${n}) LINK WIDTH (to next)`, dir: 'out', signal: `v${s}lwt`,
    help: 'The same width voltage passed on, to the next 921B.' });
  r.signalNames[`v${s}lft`] = `the link voltage through 921B ${n}`;
  r.signalNames[`v${s}lwt`] = `the width voltage through 921B ${n}`;
  r.destNames[`v${s}lf`] = `921B oscillator ${n} pitch`;
  r.eng.push((v, e) => {
    e.vco[s - 1] = { kind: 'b', semi: FOOT[v[`${id}.range`]] * 12 + v[`${id}.frequency`], sync: v[`${id}.sync`] };
  });
}

// 921 Voltage Controlled Oscillator (14 HP)
const AUX = ['sine', 'tri', 'rsaw', 'saw', 'rect', 'nrect'];
export function m921(r, x0, y0, id = 'm921') {
  const s = r.next('vco');
  const m = mod(r, x0, y0, 14, { label: '921' }, null, {
    id, label: '921 Voltage Controlled Oscillator', module: 'lfo', keywords: 'lfo vco oscillator modulation vibrato sub audio clamp aux',
    help: 'A stand-alone oscillator with its own tuning and control inputs. With COARSE RNG on SUB it runs below hearing and is the system’s LFO: patch its SINE into a 921B’s DC MOD for vibrato, or into the 904A for a filter sweep. The CLAMPING POINT and TRIG inputs restart its cycle from a trigger, and AUX OUT gives any one of its waveforms at a set level.',
  });
  m.t(97, 24, 'VOLTAGE CONTROLLED OSCILLATOR', 10, { weight: 700 });
  m.t(83, 33, 'FREQUENCY', 9); m.t(156, 33, 'RANGE', 9);
  m.t(25, 42, 'SCALE', 7); m.t(25, 50, '±12 SEMI', 6); m.t(34, 74, '±6 OCT', 6);
  m.sw(`${id}.scale`, 16, 61, { type: 'toggle', w: 12, kind: 'enum', def: 'octave', label: 'SCALE', name: '921 SCALE', module: 'lfo',
    options: [{ v: 'semitone', label: '±12 SEMI' }, { v: 'octave', label: '±6 OCT' }],
    help: 'Sets what FREQUENCY covers: ±12 semitones, or ±6 octaves.' });
  m.t(12, 81, 'SUB', 7); m.t(38, 85, 'COARSE', 6); m.t(38, 92, 'RNG', 6); m.t(25, 108, 'AUDIO', 7);
  m.sw(`${id}.coarse`, 16, 94, { type: 'toggle', w: 12, kind: 'enum', def: 'sub', label: 'COARSE RNG', name: '921 COARSE RNG', module: 'lfo',
    options: [{ v: 'sub', label: 'SUB' }, { v: 'audio', label: 'AUDIO' }],
    help: 'SUB runs the oscillator about 100 times slower, from one cycle every couple of minutes to a few hundred hertz: the LFO setting. AUDIO is a normal audio oscillator.' });
  m.knob(`${id}.frequency`, 77, 64, 17, { kind: 'cont', min: -6, max: 6, def: 0, label: 'FREQUENCY', name: '921 FREQUENCY', module: 'lfo', scale: SPM6,
    help: 'Tuning, ±6 octaves (or ±12 semitones with SCALE on SEMI). On SUB, this is the LFO speed.' });
  m.sw(`${id}.range`, 151, 66, { type: 'knob', r: 15, style: 'd-chicken', kind: 'enum', def: "8'", label: 'RANGE', name: '921 RANGE', module: 'lfo', options: RANGE_921,
    help: 'The octave, 32’ (lowest) to 1’ (highest), one octave per step.' });
  m.t(26, 114, 'CTRL IN', 7);
  [1, 2].forEach((k) => m.jack(`j.${id}.width_cv_${k}`, 24, 102 + 32 * k, { label: 'CTRL IN', name: `921 WIDTH CTRL IN ${k}`, dir: 'in', dest: `v${s}wc`, amt: 1, add: true,
    help: 'Moves the rectangular width, about 15 % per volt, added to the RECTANGULAR WIDTH knob.' }));
  m.t(80, 114, 'RECTANGULAR WIDTH', 7);
  m.knob(`${id}.width`, 79, 150, 15, { kind: 'cont', min: 0, max: 10, def: 5, label: 'RECTANGULAR WIDTH', name: '921 RECTANGULAR WIDTH', module: 'lfo', scale: SWIDTH,
    fmt: (x) => `${Math.round(10 + x * 8)} %`, help: 'Width of the RECTANGULAR wave, 10 % to 90 %. As an LFO, it sets how long the square sits high against low.' });
  m.line(118, 112, 118, 256);
  m.t(157, 114, 'AUX OUT WAVEFORM', 7);
  m.sw(`${id}.aux_wave`, 152, 143, { type: 'knob', r: 15, style: 'd-chicken', kind: 'enum', def: 'sine', label: 'AUX OUT WAVEFORM', name: '921 AUX OUT WAVEFORM', module: 'lfo',
    options: AUX.map((v, i) => ({ v, label: '', a: -100 + i * 40 })),
    help: 'Which waveform the AUXILIARY OUTPUTS give: sine, triangle, falling or rising ramp, rectangular, or rectangular upside down.' });
  [['sine', -100], ['tri', -60], ['rsaw', -20], ['saw', 20], ['sq', 60], ['sq', 100]].forEach(([shape, a], i) => {
    const rad = (a * Math.PI) / 180;
    m.wave(152 + Math.sin(rad) * 27, 143 - Math.cos(rad) * 27, shape, 6);
    if (i === 5) m.t(152 + Math.sin(rad) * 27 + 7, 143 - Math.cos(rad) * 27 - 6, '−', 7);
  });
  m.t(26, 189, 'TRIG', 8); m.t(42, 210, 'V', 8); m.t(42, 239, 'S', 8);
  m.jack(`j.${id}.trig_v`, 24, 207, { label: 'TRIG V', name: '921 TRIG V', dir: 'in', dest: `v${s}tv`, amt: 1,
    help: 'A V-trigger here jumps the waveform to the CLAMPING POINT. Fed from the keyboard trigger it restarts the LFO with every note.' });
  m.jack(`j.${id}.trig_s`, 24, 236, { label: 'TRIG S', name: '921 TRIG S', dir: 'in', dest: `v${s}ts`, amt: 1,
    help: 'The same as TRIG V, for an S-trigger (it fires when the line is pulled to 0 V).' });
  m.t(80, 190, 'CLAMPING POINT', 7);
  m.knob(`${id}.clamp`, 79, 220, 15, { kind: 'cont', min: 0, max: 10, def: 0, label: 'CLAMPING POINT', name: '921 CLAMPING POINT', module: 'lfo', scale: SWIDTH,
    fmt: (x) => `${Math.round(10 + x * 8)} %`, help: 'Where in its cycle the oscillator restarts when a trigger arrives at TRIG V or TRIG S.' });
  m.t(157, 190, 'AUX OUT LEVEL', 7);
  m.knob(`${id}.aux_level`, 152, 221, 15, { kind: 'cont', min: 0, max: 10, def: 5, label: 'AUX OUT LEVEL', name: '921 AUX OUT LEVEL', module: 'lfo', scale: S10,
    help: 'Level of the AUXILIARY OUTPUTS, from off to full. A ready-made depth control: set it low and patch AUX into a pitch input for a gentle vibrato.' });
  m.line(4, 256, 192, 256);
  m.t(60, 264, 'FREQUENCY CONTROL INPUTS', 7); m.t(155, 264, 'AUXILIARY OUTPUTS', 7);
  [24, 56, 89].forEach((x, i) => m.jack(`j.${id}.freq_cv_${i + 1}`, x, 280, { label: 'FREQUENCY CONTROL INPUT', name: `921 FREQUENCY CONTROL INPUT ${i + 1}`, dir: 'in', dest: `v${s}dc`, amt: 1, add: true,
    help: 'Pitch control at 1 V per octave, added to the FREQUENCY knob. On SUB it changes the LFO speed.' }));
  [128, 176].forEach((x, i) => m.jack(`j.${id}.aux_${i + 1}`, x, 280, { label: 'AUXILIARY OUTPUT', name: `921 AUX OUT ${i + 1}`, dir: 'out', signal: `v${s}aux`,
    help: 'The waveform chosen by AUX OUT WAVEFORM, at the AUX OUT LEVEL. Both jacks carry the same signal.' }));
  m.line(4, 296, 192, 296);
  [['sin', 'sine', 'SINE'], ['tri', 'tri', 'TRIANGLE'], ['saw', 'saw', 'SAWTOOTH'], ['rect', 'sq', 'RECTANGULAR']].forEach(([k, shape, nm], i) => {
    const x = [24, 72, 120, 174][i];
    m.wave(x, 331, shape, 6);
    m.jack(`j.${id}.${k === 'sin' ? 'sine' : k === 'tri' ? 'triangle' : k === 'saw' ? 'sawtooth' : 'rectangular'}`, x, 313, { label: nm, name: `921 ${nm}`, dir: 'out', signal: `v${s}${k}`,
      help: `The 921’s ${nm.toLowerCase()} wave, at full level. On SUB, a full-strength LFO.` });
    r.signalNames[`v${s}${k}`] = `the 921 oscillator ${nm.toLowerCase()}`;
  });
  r.signalNames[`v${s}aux`] = 'the 921 oscillator AUX output';
  r.eng.push((v, e) => {
    const f = v[`${id}.frequency`];
    e.vco[s - 1] = {
      kind: '921', semi: FOOT[v[`${id}.range`]] * 12 + (v[`${id}.scale`] === 'octave' ? f * 12 : f * 2) + (v[`${id}.coarse`] === 'sub' ? -79.7 : 0),
      sync: 'off', width: (10 + v[`${id}.width`] * 8) / 100, clamp: (10 + v[`${id}.clamp`] * 8) / 100, aux: v[`${id}.aux_wave`], auxLevel: Math.pow(v[`${id}.aux_level`] / 10, 3),
    };
  });
}

// CP3A-M Mixer (14 HP)
export function cp3am(r, x0, y0, n, id = `cp3am_${n}`) {
  const s = r.next('mix');
  const ma = r.next('mult'), mb = r.next('mult');
  const m = mod(r, x0, y0, 14, { label: 'CP3A-M' }, 'MIXER', {
    id, label: `CP3A-M Mixer (${n})`, module: 'mixer', keywords: 'mixer mix sum levels multiple mult split',
    help: 'Four inputs, each with its own level knob, mixed and sent through MASTER GAIN to two + outputs and two − (upside-down) outputs. It mixes control voltages as happily as audio. The two MULTIPLEs on the right are separate: four joined jacks each, for sending one signal to several places.',
  });
  m.t(99, 60, 'INPUTS', 8);
  [74, 144, 216, 288].forEach((y, i) => {
    m.knob(`${id}.gain${i + 1}`, 43, y, 15, { kind: 'cont', min: 0, max: 10, def: 0, label: `CHANNEL GAIN ${i + 1}`, name: `CP3A-M (${n}) GAIN ${i + 1}`, module: 'mixer', scale: S10ALL,
      help: `Level of input ${i + 1} in the mix.` });
    m.line(68, y, 88, y);
    m.jack(`j.${id}.in${i + 1}`, 99, y, { label: `INPUT ${i + 1}`, name: `CP3A-M (${n}) INPUT ${i + 1}`, dir: 'in', dest: `x${s}i${i + 1}`, amt: 1, help: `Mixer input ${i + 1}, at the level of the knob beside it.` });
  });
  m.t(151, 42, 'MASTER GAIN', 8);
  m.knob(`${id}.master`, 151, 74, 15, { kind: 'cont', min: 0, max: 10, def: 10, label: 'MASTER GAIN', name: `CP3A-M (${n}) MASTER GAIN`, module: 'mixer', scale: S10ALL,
    help: 'Overall level of the mix at the outputs. Turned right up with several loud inputs, the mix clips and adds grit.' });
  [['MULTIPLE', 117, ma], ['MULTIPLE', 190, mb]].forEach(([lb, y, mu], k) => {
    m.t(151, y, lb, 8);
    const pts = [[136, y + 15], [167, y + 15], [136, y + 48], [167, y + 48]];
    m.line(136, y + 15, 167, y + 15); m.line(136, y + 48, 167, y + 48); m.line(136, y + 15, 136, y + 48); m.line(167, y + 15, 167, y + 48);
    const ab = k ? 'b' : 'a';
    m.jack(`j.${id}.mult_${ab}`, pts[0][0], pts[0][1], { label: 'MULTIPLE', name: `CP3A-M (${n}) MULTIPLE ${ab.toUpperCase()} (in)`, dir: 'in', dest: `mu${mu}In`, amt: 1, add: true,
      help: 'Plug a signal in here and take copies from the other three jacks of this MULTIPLE.' });
    [1, 2, 3].forEach((j) => m.jack(`j.${id}.mult_${ab}_out_${j}`, pts[j][0], pts[j][1], { label: 'MULTIPLE', name: `CP3A-M (${n}) MULTIPLE ${ab.toUpperCase()} ${j}`, dir: 'out', signal: `mu${mu}`,
      help: 'A copy of what is plugged into the first jack of this MULTIPLE.' }));
    r.signalNames[`mu${mu}`] = `CP3A-M ${n} multiple ${ab.toUpperCase()}`;
  });
  m.t(151, 263, 'OUTPUTS', 8); m.t(151, 283, '+', 10); m.t(151, 314, '−', 10);
  [1, 2].forEach((k) => {
    m.jack(`j.${id}.out_pos_${k}`, k === 1 ? 136 : 167, 280, { label: 'OUTPUT +', name: `CP3A-M (${n}) OUTPUT + ${k}`, dir: 'out', signal: `x${s}p`, help: 'The mix.' });
    m.jack(`j.${id}.out_neg_${k}`, k === 1 ? 136 : 167, 311, { label: 'OUTPUT −', name: `CP3A-M (${n}) OUTPUT − ${k}`, dir: 'out', signal: `x${s}n`, help: 'The mix, turned upside down. Useful for control voltages: an envelope from here sweeps down instead of up.' });
  });
  r.signalNames[`x${s}p`] = `the CP3A-M mixer ${n}`;
  r.signalNames[`x${s}n`] = `the CP3A-M mixer ${n} (inverted)`;
  r.eng.push((v, e) => { e.mix[s - 1] = { g: [1, 2, 3, 4].map((k) => v[`${id}.gain${k}`] / 10), m: v[`${id}.master`] / 10 }; });
}

// CP35 Attenuators / voltage source / multiples (21 HP)
export function cp35(r, x0, y0, id = 'cp35') {
  const ma = r.next('mult'), mb = r.next('mult');
  const m = mod(r, x0, y0, 21, { label: 'CP35' }, 'ATTENUATORS', {
    id, label: 'CP35 Attenuators', module: 'util', keywords: 'attenuator depth level scale voltage source offset +6 -6 multiple mult',
    help: 'Four attenuators to turn a signal down before it goes somewhere sensitive (a pitch input, say). Their inputs are half-normalled: IN 1 feeds all four until you patch the ones below it. Below them are steady +6 V and −6 V sources and two MULTIPLEs for splitting signals.',
  });
  m.t(149, 60, 'INPUTS', 8); m.t(149, 172, 'OUTPUTS', 8);
  [44, 114, 184, 253].forEach((x, i) => {
    if (i < 3) { m.line(x + 12, 76, x + 58, 76); m.t(x + 56, 72, '›', 12); }
    m.line(x, 86, x, 112);
    m.jack(`j.${id}.att_in${i + 1}`, x, 76, { label: `IN ${i + 1}`, name: `CP35 IN ${i + 1}`, dir: 'in', dest: `t${i + 1}In`, amt: 1,
      help: i === 0 ? 'Attenuator input. Until you patch IN 2, IN 3 or IN 4, this signal also feeds those attenuators.' : 'Attenuator input. Patching here takes over from the input above, for this attenuator and the ones below it.' });
    m.knob(`${id}.att${i + 1}`, x - 3, 130, 15, { kind: 'cont', min: 0, max: 10, def: 10, label: `ATTENUATOR ${i + 1}`, name: `CP35 ATTENUATOR ${i + 1}`, module: 'util', scale: S10ALL,
      help: 'How much of the input reaches this OUT: 0 is nothing, 10 is all of it.' });
    m.line(x, 152, x, 178);
    m.jack(`j.${id}.att_out${i + 1}`, x, 189, { label: `OUT ${i + 1}`, name: `CP35 OUT ${i + 1}`, dir: 'out', signal: `t${i + 1}`, help: 'The input, turned down by the knob above.' });
    r.signalNames[`t${i + 1}`] = `CP35 attenuator ${i + 1}`;
  });
  m.line(4, 221, 290, 221); m.line(4, 280, 290, 280); m.line(147, 221, 147, 280);
  m.t(80, 234, '−6 V', 9); m.t(220, 234, '+6 V', 9);
  m.line(61, 250, 99, 250); m.line(200, 250, 240, 250);
  [[61, 'neg6_1', 'n6', '−6 V'], [99, 'neg6_2', 'n6', '−6 V'], [200, 'pos6_1', 'p6', '+6 V'], [240, 'pos6_2', 'p6', '+6 V']].forEach(([x, k, sg, nm], i) =>
    m.jack(`j.${id}.${k}`, x, 250, { label: nm, name: `CP35 ${nm} ${(i % 2) + 1}`, dir: 'out', signal: sg,
      help: `A steady ${nm}. Through an attenuator it is a hand-set control voltage: patch it to a pitch input to transpose, or to a 902 to hold it open.` }));
  m.t(77, 295, 'MULTIPLE', 8); m.t(219, 295, 'MULTIPLE', 8);
  [[[25, 60, 95, 130], ma, 'a'], [[165, 200, 238, 272], mb, 'b']].forEach(([xs, mu, ab]) => {
    m.line(xs[0], 311, xs[3], 311);
    m.jack(`j.${id}.mult_${ab}`, xs[0], 311, { label: 'MULTIPLE', name: `CP35 MULTIPLE ${ab.toUpperCase()} (in)`, dir: 'in', dest: `mu${mu}In`, amt: 1, add: true,
      help: 'Plug a signal in here and take copies from the other three jacks of this MULTIPLE.' });
    [1, 2, 3].forEach((j) => m.jack(`j.${id}.mult_${ab}_out_${j}`, xs[j], 311, { label: 'MULTIPLE', name: `CP35 MULTIPLE ${ab.toUpperCase()} ${j}`, dir: 'out', signal: `mu${mu}`,
      help: 'A copy of what is plugged into the first jack of this MULTIPLE.' }));
    r.signalNames[`mu${mu}`] = `CP35 multiple ${ab.toUpperCase()}`;
  });
  Object.assign(r.signalNames, { p6: 'the CP35 +6 V source', n6: 'the CP35 −6 V source' });
  r.eng.push((v, e) => { e.att = [1, 2, 3, 4].map((k) => v[`${id}.att${k}`] / 10); });
}

// 961 Interface (21 HP)
export function m961(r, x0, y0, id = 'm961') {
  const m = mod(r, x0, y0, 21, { label: '961' }, 'INTERFACE', {
    id, label: '961 Interface', module: 'util', keywords: 'trigger converter s-trig v-trig gate audio to trigger envelope follower switch-on',
    help: 'Converts between the two kinds of trigger. Moog modules use S-triggers (a line pulled down to 0 V while on); most other gear, and the 960 sequencer, use V-triggers (+5 V while on). Each half converts S to V and V to S. The B column of V-TRIG inputs makes a trigger of a set length (SWITCH-ON TIME), and AUDIO IN turns a loud sound into a V-trigger.',
  });
  m.t(61, 60, 'AUDIO IN', 8);
  m.jack(`j.${id}.audio_in`, 61, 76, { label: 'AUDIO IN', name: '961 AUDIO IN', dir: 'in', dest: 'i9au', amt: 1, help: 'A sound to turn into triggers: each time it gets loud enough (set by SENSITIVITY), V-TRIG OUT fires.' });
  m.t(147, 42, 'SENSITIVITY', 8);
  m.knob(`${id}.sensitivity`, 147, 72, 15, { kind: 'cont', min: 0, max: 10, def: 5, label: 'SENSITIVITY', name: '961 SENSITIVITY', module: 'util', scale: S10ALL,
    help: 'How loud AUDIO IN must be to fire a trigger. Higher fires on quieter sounds.' });
  m.t(234, 60, 'V-TRIG OUT', 8); m.line(217, 76, 252, 76);
  [217, 252].forEach((x, i) => m.jack(`j.${id}.vtrig_audio_${i + 1}`, x, 76, { label: 'V-TRIG OUT', name: `961 V-TRIG OUT (audio) ${i + 1}`, dir: 'out', signal: 'i9a', help: 'A V-trigger each time AUDIO IN gets loud enough.' }));
  m.line(4, 100, 290, 100); m.line(147, 100, 147, 335);
  [['L', 0, 'left'], ['R', 144, 'right']].forEach(([side, dx, word]) => {
    m.t(27 + dx, 108, 'S-TRIG IN', 7); m.t(80 + dx, 108, 'V-TRIG OUT', 7);
    m.jack(`j.${id}.strig_in_${side.toLowerCase()}`, 27 + dx, 124, { label: 'S-TRIG IN', name: `961 S-TRIG IN (${word})`, dir: 'in', dest: `i9si${side}`, amt: 1,
      help: 'An S-trigger to convert: while it is pulled low, the V-TRIG OUTs beside it are at +5 V.' });
    m.line(63 + dx, 124, 97 + dx, 124);
    [63, 97].forEach((x, i) => m.jack(`j.${id}.vtrig_out_${side.toLowerCase()}_${i + 1}`, x + dx, 124, { label: 'V-TRIG OUT', name: `961 V-TRIG OUT (${word}) ${i + 1}`, dir: 'out', signal: `i9v${side}`,
      help: 'The S-TRIG IN beside it, converted to a V-trigger.' }));
    m.line(4 + dx, 139, 143 + dx, 139);
    m.t(45 + dx, 147, 'V-TRIG IN', 7);
    [159, 189, 220, 250, 281, 311].forEach((y, i) => {
      m.jack(`j.${id}.vtrig_a_${side.toLowerCase()}_${i + 1}`, 27 + dx, y, { label: 'V-TRIG IN A', name: `961 V-TRIG IN A (${word}) ${i + 1}`, dir: 'in', dest: `i9a${side}`, amt: 1, add: true,
        help: 'V-trigger in. While any A input is on, the S-TRIG OUT below is pulled low: a straight V-to-S conversion.' });
      m.jack(`j.${id}.vtrig_b_${side.toLowerCase()}_${i + 1}`, 63 + dx, y, { label: 'V-TRIG IN B', name: `961 V-TRIG IN B (${word}) ${i + 1}`, dir: 'in', dest: `i9b${side}`, amt: 1, add: true,
        help: 'V-trigger in. Each new trigger here holds the S-TRIG OUT on for the SWITCH-ON TIME, however short the incoming trigger is.' });
    });
    m.t(27 + dx, 329, 'A', 8); m.t(63 + dx, 329, 'B', 8);
    m.t(110 + dx, 148, 'M SEC', 6); m.t(130 + dx, 148, 'SEC', 6);
    m.knob(`${id}.on_time_${side.toLowerCase()}`, 110 + dx, 174, 14, { kind: 'cont', min: 0, max: 10, def: 3, label: 'SWITCH-ON TIME', name: `961 SWITCH-ON TIME (${word})`, module: 'util', scale: S961,
      fmt: (x) => fmtTime(time961(x)), help: 'How long the S-TRIG OUT stays on after each trigger at a B input, 40 ms to 4 s.' });
    m.t(112 + dx, 216, 'SWITCH-ON TIME', 7); m.t(112 + dx, 224, 'B COLUMN', 7); m.t(112 + dx, 232, 'ONLY', 7);
    m.t(112 + dx, 278, 'S-TRIG OUT', 7);
    m.jack(`j.${id}.strig_out_${side.toLowerCase()}`, 112 + dx, 295, { label: 'S-TRIG OUT', name: `961 S-TRIG OUT (${word})`, dir: 'out', signal: `i9s${side}`,
      help: 'An S-trigger, on while any A input is on or a B trigger is still timing. Patch it to a 911’s S-TRIG IN.' });
  });
  Object.assign(r.signalNames, { i9a: 'the 961 audio trigger', i9vL: 'the 961 left V-trigger', i9vR: 'the 961 right V-trigger', i9sL: 'the 961 left S-trigger', i9sR: 'the 961 right S-trigger' });
  r.eng.push((v, e) => { e.i961 = { sens: v[`${id}.sensitivity`] / 2.5, onL: time961(v[`${id}.on_time_l`]), onR: time961(v[`${id}.on_time_r`]) }; });
}

// CM1A MIDI to CV (6 HP)
export function cm1a(r, x0, y0, id = 'cm1a') {
  const m = mod(r, x0, y0, 6, { label: 'CM1A' }, 'MIDI - CV', {
    id, label: 'CM1A MIDI to CV', module: 'mod', keywords: 'keyboard midi cv gate trigger pitch keys s-trig v-trig',
    help: 'Where the keyboard comes in. Each note becomes a pitch voltage at CV (1 V per octave, patch it to a 921A FREQUENCY input) and a trigger at TRIG (patch it to the 911 envelopes). TRIG MODE decides whether TRIG is a V-trigger or the S-trigger Moog modules need.',
  });
  m.t(41, 48, 'USB', 8);
  r.decor.push({ t: 'usb', x: x0 + 41, y: y0 + 70, w: 26, h: 24 });
  m.t(41, 96, 'MIDI IN', 7); m.t(41, 161, 'MIDI THRU', 7);
  r.decor.push({ t: 'din', x: x0 + 41, y: y0 + 127, r: 20 }, { t: 'din', x: x0 + 41, y: y0 + 192, r: 20 });
  m.t(24, 228, 'CV', 8); m.t(59, 228, 'TRIG', 8); m.t(24, 297, 'CV', 8); m.t(59, 297, 'TRIG', 8);
  m.jack(`j.${id}.cv_1`, 24, 243, { label: 'CV', name: 'CM1A CV 1', dir: 'out', signal: 'kcv1',
    help: 'The keyboard pitch as a voltage: 0 V at middle C, 1 V more per octave. Patch it to a 921A FREQUENCY input, or to a filter control input for key tracking.' });
  m.jack(`j.${id}.cv_2`, 24, 312, { label: 'CV', name: 'CM1A CV 2', dir: 'out', signal: 'kcv2',
    help: 'A second pitch CV. In this app it carries the same note as CV 1 (the hardware’s duophonic mode is set with a button on the back).' });
  m.jack(`j.${id}.trig_upper`, 59, 243, { label: 'TRIG', name: 'CM1A TRIG (upper)', dir: 'out', signal: 'ktrU',
    help: 'On while a key is held. An S-trigger or a V-trigger, as TRIG MODE sets; with BOTH, this upper jack is the S-trigger.' });
  m.jack(`j.${id}.trig_lower`, 59, 312, { label: 'TRIG', name: 'CM1A TRIG (lower)', dir: 'out', signal: 'ktrL',
    help: 'On while a key is held. An S-trigger or a V-trigger, as TRIG MODE sets; with BOTH, this lower jack is the V-trigger.' });
  m.t(58, 255, 'V-TRIG', 6); m.t(58, 262, 'BOTH', 6); m.t(58, 293, 'S-TRIG', 6); m.t(22, 270, 'TRIG', 7); m.t(22, 278, 'MODE', 7);
  m.sw(`${id}.trig_mode`, 58, 277, { type: 'toggle', w: 13, kind: 'enum', def: 's_trig', label: 'TRIG MODE', name: 'CM1A TRIG MODE', module: 'mod',
    options: [{ v: 'v_trig', label: 'V-TRIG' }, { v: 'both', label: 'BOTH' }, { v: 's_trig', label: 'S-TRIG' }],
    help: 'What kind of trigger TRIG gives: V-TRIG (+5 V while on), S-TRIG (pulled to 0 V while on, what the 911s need), or BOTH (upper S, lower V).' });
  Object.assign(r.signalNames, { kcv1: 'the CM1A CV 1', kcv2: 'the CM1A CV 2', ktrU: 'the CM1A upper TRIG', ktrL: 'the CM1A lower TRIG' });
  r.eng.push((v, e) => { e.cm1a = { trig: { v_trig: 'v', both: 'both', s_trig: 's' }[v[`${id}.trig_mode`]] }; });
}

/** The app's own output, printed on a blank panel. Not part of the hardware. */
export function appOut(r, x0, y0, hp, label) {
  blank(r, x0, y0, hp, label);
  const w = hp * HP, cx = x0 + w / 2;
  r.decor.push({ t: 'rect', x: cx - 52, y: y0 + 96, w: 104, h: 150, r: 8, fill: 'none', stroke: '#e0a040', sw: 1.6, dash: '6 4' });
  [['OUTPUT', 116, 12, 700], ['THIS APP ONLY', 132, 8, 600], ['NOT ON THE', 228, 7, 500], ['HARDWARE', 237, 7, 500]].forEach(([text, y, size, weight]) =>
    r.decor.push({ t: 'text', x: cx, y: y0 + y, text, size, anchor: 'middle', weight, fill: '#e0a040' }));
  [['L', cx - 24], ['R', cx + 24]].forEach(([s, x]) => {
    r.decor.push({ t: 'text', x, y: y0 + 160, text: s, size: 9, anchor: 'middle', weight: 600, fill: '#e0a040' });
    r.jacks.push({ id: `j.out.${s.toLowerCase()}`, x, y: y0 + 182, r: 10, labelPos: 'none', label: `OUTPUT ${s}`, name: `OUTPUT ${s} (app)`, dir: 'in', dest: 'dryIn', amt: 0.2, add: true,
      help: 'What you hear. This socket is not on the hardware: there you would patch to a mixer or audio interface. Both jacks go to the same mono output.' });
  });
  r.areas.push({ id: 'appout', label: 'Output (app only)', module: 'out', keywords: 'output speaker audio out volume hear',
    rects: [{ x: x0 + 2, y: y0 + 1, w: w - 4, h: ROW_H - 2 }],
    help: 'The app’s own output, printed on a blank panel: nothing is heard until a cable reaches it. The real system has no master output; you patch whatever you want to hear to your mixer, and this is that cable’s other end.' });
}

// CP3A-O Oscillator Controller (8 HP) and 992 Control Voltages (8 HP): the same circuit, one for oscillators, one for the
// filter. Rockers 1–3 switch CONTROL INPUTS 1–3 in; rocker 4 switches in the EXT INPUT through its attenuator. The sum
// goes to three parallel outputs.
function controller(r, x0, y0, n, id, lpf) {
  const s = r.next('ctl');
  const nm = lpf ? '992' : `CP3A-O (${n})`;
  const m = mod(r, x0, y0, 8, { label: lpf ? '992' : 'CP3A-O' }, null, lpf ? {
    id, label: '992 Control Voltages', module: 'mod', keywords: 'cv summer switch filter control lpf attenuator',
    help: 'A switched control-voltage mixer for the filter. Up to three control voltages and an attenuated EXT INPUT are added together and sent to three FREQUENCY CONTROL TO LPF outputs. The four rockers switch each source in or out, so you can change what moves the filter without re-patching.',
  } : {
    id, label: `CP3A-O Oscillator Controller (${n})`, module: 'mod', keywords: 'cv summer switch oscillator pitch control attenuator',
    help: 'A switched control-voltage mixer for oscillator pitch. Up to three control voltages and an attenuated EXT INPUT are added together and sent to three FREQUENCY CONTROL TO OSC outputs, ready for 921A or 921B pitch inputs. The four rockers switch each source in or out: a vibrato or a second keyboard can be brought in with a switch.',
  });
  if (lpf) m.t(57, 24, 'CONTROL VOLTAGES', 10, { weight: 700 });
  else { m.t(57, 24, 'OSCILLATOR', 10, { weight: 700 }); m.t(57, 34, 'CONTROLLER', 10, { weight: 700 }); }
  const rk = lpf ? [[34, 78], [82, 78], [34, 143], [82, 143]] : [[32, 79], [70, 79], [32, 139], [79, 139]];
  rk.forEach(([x, y], i) => {
    m.t(x + (i === 3 ? -14 : 14), y + 1, String(i + 1), 9);
    m.sw(`${id}.${lpf ? 'switch' : 'route'}${i + 1}`, x, y, { type: 'rocker', orient: 'v', w: 14, h: 26, color: i === 3 ? 'blue' : 'red', kind: 'bool', def: i < 3,
      label: lpf ? `CV SWITCH ${i + 1}` : `ROUTING SWITCH ${i + 1}`, name: `${nm} SWITCH ${i + 1}`, module: 'mod',
      help: i === 3 ? 'Switches the EXT INPUT (through the attenuator) in or out of the sum.' : `Switches CONTROL INPUT ${i + 1} in or out of the sum, without unplugging it.` });
  });
  if (!lpf) m.t(82, 162, 'ATTENUATOR', 7);
  const ext = lpf ? [34, 208, 79, 205, 190] : [32, 204, 74, 201, 189];
  m.t(ext[0], ext[4], 'EXT INPUT', 7);
  m.jack(`j.${id}.ext`, ext[0], ext[1], { label: 'EXT INPUT', name: `${nm} EXT INPUT`, dir: 'in', dest: `c${s}x`, amt: 1,
    help: 'A control voltage to add in at a level set by the knob beside it, when switch 4 is on. Good for vibrato depth or an envelope amount.' });
  m.knob(`${id}.attenuator`, ext[2], ext[3], 14, lpf
    ? { kind: 'cont', min: -10, max: 10, def: 0, label: 'ATTENUATOR', name: '992 ATTENUATOR', module: 'mod', scale: { nums: [-10, -5, 0, 5, 10], ticks: 11, numR: 1.72, tickR: 1.3, size: 9 },
      help: 'How much of the EXT INPUT reaches the outputs, and which way up: clockwise passes it, anticlockwise turns it upside down, and the centre is off. An inverted envelope here closes the filter on each note instead of opening it.' }
    : { kind: 'cont', min: 0, max: 10, def: 10, label: 'ATTENUATOR', name: `${nm} ATTENUATOR`, module: 'mod', scale: S10,
      help: 'How much of the EXT INPUT reaches the outputs: 0 is none, 10 is all of it.' });
  const yIn = lpf ? 280 : 276, yOut = lpf ? 313 : 311, xs = lpf ? [20, 57, 94] : [17, 54, 90];
  m.t(57, yIn - 24, 'CONTROL INPUTS', 7);
  xs.forEach((x, i) => {
    m.t(x, yIn - 15, String(i + 1), 7);
    m.jack(`j.${id}.in${i + 1}`, x, yIn, { label: `CONTROL INPUT ${i + 1}`, name: `${nm} CONTROL INPUT ${i + 1}`, dir: 'in', dest: `c${s}i${k(i)}`, amt: 1,
      help: `A control voltage to add in when switch ${i + 1} is on.` });
    m.jack(`j.${id}.out_${i + 1}`, x, yOut, { label: lpf ? 'FREQUENCY CONTROL TO LPF' : 'FREQUENCY CONTROL TO OSC', name: `${nm} OUTPUT ${i + 1}`, dir: 'out', signal: `c${s}`,
      help: lpf ? 'The sum of the switched-in voltages, for a 904A CONTROL INPUT. All three outputs carry the same voltage.' : 'The sum of the switched-in voltages, for a 921A FREQUENCY input or a 921B DC MOD. All three outputs carry the same voltage.' });
  });
  m.t(57, yOut - 15, lpf ? 'FREQUENCY CONTROL TO LPF' : 'FREQUENCY CONTROL TO OSC', 6);
  r.signalNames[`c${s}`] = lpf ? 'the 992 control voltages' : `CP3A-O controller ${n}`;
  const sw = lpf ? 'switch' : 'route';
  r.eng.push((v, e) => { e.ctl[s - 1] = { on: [1, 2, 3].map((k2) => !!v[`${id}.${sw}${k2}`]), x: v[`${id}.${sw}4`] ? v[`${id}.attenuator`] / 10 : 0 }; });
}
const k = (i) => i + 1;
export const cp3ao = (r, x0, y0, n, id = `cp3ao_${n}`) => controller(r, x0, y0, n, id, false);
export const m992 = (r, x0, y0, id = 'm992') => controller(r, x0, y0, 1, id, true);

// 960 Sequential Controller (64 HP here: Behringer's panel, spread to fill the middle row)
const RANGE960 = [[0.04, 0.5], [2.75, 30], [0.17, 2], [11, 130], [0.7, 8], [44, 500]];
export function m960(r, x0, y0, hp = 64, id = 'm960') {
  const m = mod(r, x0, y0, hp, { label: '960' }, 'SEQUENTIAL CONTROLLER', {
    id, label: '960 Sequential Controller', module: 'mod', keywords: 'sequencer step sequence pattern clock stages rows arpeggio berlin school',
    help: 'An eight-step analogue sequencer with its own clock. Each stage has three knobs, one per row (A, B and C), and the rows send those voltages out in turn: patch a row into a 921A and the oscillators play a tune. The clock (FREQUENCY RANGE and VERNIER) moves it on; each stage can play NORMAL, be skipped (SKIP) or stop the sequence (STOP). OSCILLATOR OUTPUT gives a V-trigger on every step, for the envelopes (through the 961).',
  });
  // the clock
  m.t(50, 40, 'OSCILLATOR ON', 7);
  r.decor.push({ t: 'led', x: x0 + 50, y: y0 + 52, r: 5, color: 'red', litWhen: 'power' });
  m.t(50, 72, 'FREQUENCY RANGE', 7);
  m.sw(`${id}.freq_range`, 50, 104, { type: 'knob', r: 15, style: 'd-chicken', kind: 'enum', def: 5, label: 'FREQUENCY RANGE', name: '960 FREQUENCY RANGE', module: 'mod',
    options: [1, 2, 3, 4, 5, 6].map((v, i) => ({ v, label: String(v), a: -100 + i * 40 })),
    help: 'The clock’s range: 1 is 0.04–0.5 Hz, 3 is 0.17–2 Hz, 5 is 0.7–8 Hz (steady tempos), and 2, 4 and 6 are 2.75–30, 11–130 and 44–500 Hz: fast enough to turn a sequence into a buzzing tone.' });
  m.t(50, 140, 'FREQUENCY VERNIER', 7);
  m.knob(`${id}.vernier`, 50, 170, 14, { kind: 'cont', min: 0, max: 10, def: 5, label: 'FREQUENCY VERNIER', name: '960 FREQUENCY VERNIER', module: 'mod', scale: S10,
    fmt: (x) => '', help: 'Fine clock speed across the chosen range: this is the tempo knob.' });
  m.t(28, 199, 'OSC ON', 7); m.t(72, 199, 'OSC OFF', 7);
  m.sw(`${id}.osc_on_btn`, 28, 214, { type: 'button', w: 18, h: 18, capColor: '#c8262b', kind: 'bool', def: false, label: 'OSC ON', name: '960 OSC ON', module: 'mod',
    help: 'Starts the clock.' });
  m.sw(`${id}.osc_off_btn`, 72, 214, { type: 'button', w: 18, h: 18, capColor: '#222', kind: 'bool', def: false, label: 'OSC OFF', name: '960 OSC OFF', module: 'mod',
    help: 'Stops the clock. The sequence stays on the stage it reached.' });
  m.jack(`j.${id}.osc_on`, 28, 244, { label: 'OSC ON', name: '960 OSC ON (input)', dir: 'in', dest: 's960on', amt: 1, help: 'A V-trigger here starts the clock.' });
  m.jack(`j.${id}.osc_off`, 72, 244, { label: 'OSC OFF', name: '960 OSC OFF (input)', dir: 'in', dest: 's960off', amt: 1, help: 'A V-trigger here stops the clock.' });
  m.t(50, 266, 'CONTROL INPUT', 7);
  m.jack(`j.${id}.osc_cv`, 50, 282, { label: 'CONTROL INPUT', name: '960 CONTROL INPUT', dir: 'in', dest: 's960cv', amt: 1, add: true,
    help: 'Changes the clock speed at 1 V per octave: one volt more doubles the tempo.' });
  m.t(50, 300, 'OSCILLATOR OUTPUT', 6);
  m.jack(`j.${id}.osc_out`, 50, 316, { label: 'OSCILLATOR OUTPUT', name: '960 OSCILLATOR OUTPUT', dir: 'out', signal: 's960clk',
    help: 'The clock as V-triggers, one per step, high for most of each step. Convert it to S-triggers with the 961 to fire the 911 envelopes.' });
  m.line(100, 34, 100, 334);
  // the eight stages
  const xs = Array.from({ length: 8 }, (_, i) => 135 + i * 76);
  xs.forEach((x, i) => {
    const n = i + 1;
    r.decor.push({ t: 'led', x: x0 + x - 8, y: y0 + 42, r: 5, color: 'red', litWhen: { seq: i } });
    m.t(x + 8, 46, String(n), 10, { weight: 700 });
    ['a', 'b', 'c'].forEach((row, k) => m.knob(`${id}.row_${row}_${n}`, x, 82 + k * 50, 15, { kind: 'cont', min: 0, max: 10, def: 5, label: `ROW ${row.toUpperCase()} STAGE ${n}`,
      name: `960 ROW ${row.toUpperCase()} STAGE ${n}`, module: 'mod', scale: { nums: [], ticks: 11, numR: 1.68, tickR: 1.3, size: 8 },
      help: `The voltage row ${row.toUpperCase()} sends while stage ${n} is playing, from 0 to the row’s RANGE.${row === 'c' ? ' With 3RD ROW CONTROL OF TIMING on, it sets how long this stage lasts instead.' : ''}` }));
    m.t(x - 20, 218, 'SKIP', 6); m.t(x, 211, 'NORMAL', 6); m.t(x + 20, 218, 'STOP', 6);
    m.sw(`${id}.mode_${n}`, x, 230, { type: 'slide', orient: 'h', w: 46, h: 14, kind: 'enum', def: 'normal', label: `STAGE ${n} MODE`, name: `960 STAGE ${n} MODE`, module: 'mod',
      options: [{ v: 'skip', label: 'SKIP' }, { v: 'normal', label: 'NORMAL' }, { v: 'stop', label: 'STOP' }],
      help: `NORMAL plays stage ${n}; SKIP passes over it; STOP halts the sequence when it reaches this stage (press OSC ON to go on).` });
    m.t(x, 248, 'SET', 6);
    m.sw(`${id}.set_${n}`, x, 262, { type: 'button', w: 15, h: 15, capColor: '#c8262b', kind: 'bool', def: false, label: `SET ${n}`, name: `960 SET ${n}`, module: 'mod',
      help: `Jumps the sequence to stage ${n}. With the clock stopped, use it to set each stage’s knobs by ear.` });
    m.t(x - 15, 290, 'IN', 6); m.t(x + 15, 290, 'OUT', 6);
    m.jack(`j.${id}.stage_in_${n}`, x - 15, 306, { label: 'IN', name: `960 STAGE ${n} IN`, dir: 'in', dest: `s960i${n}`, amt: 1, help: `A V-trigger here jumps the sequence to stage ${n}.` });
    m.jack(`j.${id}.stage_out_${n}`, x + 15, 306, { label: 'OUT', name: `960 STAGE ${n} OUT`, dir: 'out', signal: `s960o${n}`,
      help: `+5 V while stage ${n} is playing: a V-trigger to fire something on this step only, or to jump another stage.` });
    r.signalNames[`s960o${n}`] = `the 960 stage ${n} trigger`;
  });
  const xr = hp * HP - 150;
  m.line(xr - 20, 34, xr - 20, 334);
  ['a', 'b', 'c'].forEach((row, k) => {
    const y = 82 + k * 50;
    m.t(xr + 22, y - 14, row.toUpperCase(), 8, { weight: 700 });
    m.line(xr + 4, y, xr + 40, y);
    [1, 2].forEach((j) => m.jack(`j.${id}.row_${row}_out_${j}`, xr + (j === 1 ? 4 : 40), y, { label: `ROW ${row.toUpperCase()}`, name: `960 ROW ${row.toUpperCase()} OUTPUT ${j}`, dir: 'out', signal: `s960${row}`,
      help: `Row ${row.toUpperCase()}’s voltage for the stage that is playing. Both jacks carry the same voltage.` }));
    m.sw(`${id}.range_${row}`, xr + 98, y, { type: 'knob', r: 14, style: 'd-chicken', kind: 'enum', def: 'x1', label: `ROW ${row.toUpperCase()} RANGE`, name: `960 ROW ${row.toUpperCase()} RANGE`, module: 'mod',
      options: [{ v: 'x1', label: 'X1', a: -45 }, { v: 'x2', label: 'X2', a: 0 }, { v: 'x4', label: 'X4', a: 45 }],
      help: 'The row’s top voltage: X1 is 2 V (two octaves across the knobs), X2 is 4 V and X4 is 8 V.' });
  });
  m.t(xr + 60, 232, '3RD ROW', 6); m.t(xr + 60, 240, 'CONTROL OF TIMING', 6);
  m.t(xr + 30, 260, 'OFF', 6); m.t(xr + 90, 260, 'ON', 6);
  m.sw(`${id}.timing`, xr + 60, 260, { type: 'rocker', w: 30, h: 16, color: 'black', kind: 'bool', def: false, label: '3RD ROW CONTROL OF TIMING', name: '960 3RD ROW CONTROL OF TIMING', module: 'mod',
    help: 'When on, row C’s knobs set how long each stage lasts (higher is shorter), so the sequence gets its own rhythm.' });
  m.t(xr + 40, 290, 'SHIFT', 7);
  m.sw(`${id}.shift_btn`, xr + 20, 306, { type: 'button', w: 16, h: 16, capColor: '#c8262b', kind: 'bool', def: false, label: 'SHIFT', name: '960 SHIFT', module: 'mod', help: 'Moves the sequence on one stage.' });
  m.jack(`j.${id}.shift`, xr + 60, 306, { label: 'SHIFT', name: '960 SHIFT (input)', dir: 'in', dest: 's960sh', amt: 1, help: 'A V-trigger here moves the sequence on one stage: clock it from outside.' });
  Object.assign(r.signalNames, { s960a: 'the 960 row A', s960b: 'the 960 row B', s960c: 'the 960 row C', s960clk: 'the 960 clock' });
  r.eng.push((v, e) => {
    const [lo, hi] = RANGE960[v[`${id}.freq_range`] - 1];
    e.s960 = {
      hz: lo * Math.pow(hi / lo, v[`${id}.vernier`] / 10), timing: !!v[`${id}.timing`],
      rows: ['a', 'b', 'c'].map((row) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v[`${id}.row_${row}_${n}`])),
      range: ['a', 'b', 'c'].map((row) => ({ x1: 2, x2: 4, x4: 8 }[v[`${id}.range_${row}`]])),
      mode: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v[`${id}.mode_${n}`]),
      btn: { on: v[`${id}.osc_on_btn`], off: v[`${id}.osc_off_btn`], shift: v[`${id}.shift_btn`], set: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v[`${id}.set_${n}`]) },
    };
  });
}

// 962 Sequential Switch (8 HP)
export function m962(r, x0, y0, id = 'm962') {
  const m = mod(r, x0, y0, 8, { label: '962' }, null, {
    id, label: '962 Sequential Switch', module: 'util', keywords: 'switch sequencer chain 16 24 steps selector',
    help: 'A three-way switch: one of its three SIG IN jacks reaches the OUTPUT at a time. A trigger at SHIFT moves it on to the next, so with the 960’s stage 1 OUT on SHIFT and the 960’s three rows on the inputs, the eight steps become 24. The buttons and TRIGGER INPUTs pick a stage directly.',
  });
  m.t(57, 24, 'SEQUENTIAL SWITCH', 9, { weight: 700 });
  m.t(57, 42, 'TRIGGER OUTPUTS', 7);
  [28, 57, 86].forEach((x, k) => {
    m.jack(`j.${id}.trig_out_${k + 1}`, x, 60, { label: 'TRIGGER OUTPUT', name: `962 TRIGGER OUTPUT ${k + 1}`, dir: 'out', signal: `sw962t${k + 1}`, help: `+5 V while stage ${k + 1} is selected.` });
    m.t(x - 10, 82, String(k + 1), 7);
    m.sw(`${id}.button_${k + 1}`, x, 96, { type: 'button', w: 15, h: 15, capColor: '#c8262b', kind: 'bool', def: false, label: `TRIGGER BUTTON ${k + 1}`, name: `962 BUTTON ${k + 1}`, module: 'util', help: `Selects stage ${k + 1}: SIG IN ${k + 1} reaches the output.` });
    r.decor.push({ t: 'led', x: x0 + x + 9, y: y0 + 84, r: 3.5, color: 'red' });
    m.jack(`j.${id}.trig_in_${k + 1}`, x, 134, { label: 'TRIGGER INPUT', name: `962 TRIGGER INPUT ${k + 1}`, dir: 'in', dest: `sw962s${k + 1}`, amt: 1, help: `A V-trigger here selects stage ${k + 1}.` });
  });
  m.t(57, 118, 'TRIGGER INPUTS', 7);
  m.t(57, 158, 'SHIFT', 8);
  m.jack(`j.${id}.shift`, 57, 176, { label: 'SHIFT', name: '962 SHIFT', dir: 'in', dest: 'sw962sh', amt: 1, help: 'A V-trigger here moves the switch on to the next input (of the two or three that are patched). Usually the 960’s stage 1 OUT.' });
  m.line(4, 194, 108, 194);
  m.t(30, 206, 'SIG IN', 8); m.t(84, 206, 'OUTPUT', 8);
  [1, 2, 3].forEach((k) => m.jack(`j.${id}.sig_${k}`, 30, 196 + k * 30, { label: `SIG IN ${k}`, name: `962 SIG IN ${k}`, dir: 'in', dest: `sw962i${k}`, amt: 1, help: `Input ${k}: it reaches the output while stage ${k} is selected.` }));
  [1, 2].forEach((k) => m.jack(`j.${id}.out_${k}`, 84, 196 + k * 30, { label: 'OUTPUT', name: `962 OUTPUT ${k}`, dir: 'out', signal: 'sw962', help: 'The selected input. Both jacks carry the same signal.' }));
  Object.assign(r.signalNames, { sw962: 'the 962 switch', sw962t1: 'the 962 stage 1 trigger', sw962t2: 'the 962 stage 2 trigger', sw962t3: 'the 962 stage 3 trigger' });
  r.eng.push((v, e) => { e.s962 = { btn: [1, 2, 3].map((k) => v[`${id}.button_${k}`]) }; });
}

// 911A Dual Trigger Delay (8 HP)
export function m911a(r, x0, y0, id = 'm911a') {
  const m = mod(r, x0, y0, 8, { label: '911A' }, 'DUAL TRIGGER DELAY', {
    id, label: '911A Dual Trigger Delay', module: 'env', keywords: 'delay trigger late delayed envelope s-trig echo',
    help: 'Delays an S-trigger: a trigger that stays on for longer than DELAY TIME comes out late, and ends when the incoming trigger ends. Use it to start a second envelope part-way into a note, for a delayed vibrato or a second stage of a sound. COUPLING MODE runs the two delays separately, both from the top input (PARALLEL), or one after the other (SERIES).',
  });
  const dk = (k, y) => {
    m.t(57, y - 34, 'DELAY TIME', 8, { weight: 700 }); m.t(24, y - 24, 'M SEC', 6); m.t(89, y - 24, 'SEC', 6);
    m.knob(`${id}.delay_${k}`, 57, y, 13, { kind: 'cont', min: 0, max: 10, def: 6, label: `DELAY TIME (${k === 1 ? 'upper' : 'lower'})`, name: `911A DELAY TIME ${k === 1 ? 'UPPER' : 'LOWER'}`,
      module: 'env', scale: STIME, fmt: (x) => fmtTime(time911(x)), help: 'How long the incoming S-trigger must stay on before it is passed on, 2 ms to 10 s.' });
  };
  dk(1, 78);
  m.t(28, 108, 'S-TRIG IN', 6); m.t(86, 108, 'S-TRIG OUT', 6);
  m.jack(`j.${id}.strig_1`, 28, 124, { label: 'S-TRIG IN', name: '911A S-TRIG IN (upper)', dir: 'in', dest: 'dtI1', amt: 1, help: 'The S-trigger to delay. With COUPLING on PARALLEL it starts both delays.' });
  m.jack(`j.${id}.strig_out_1`, 86, 124, { label: 'S-TRIG OUT', name: '911A S-TRIG OUT (upper)', dir: 'out', signal: 'dtO1', help: 'The delayed S-trigger. Patch it to a 911’s S-TRIG IN.' });
  m.line(4, 142, 108, 142);
  m.t(57, 152, 'COUPLING MODE', 7);
  m.t(24, 166, 'OFF', 6); m.t(57, 160 + 0, '', 6); m.t(90, 166, 'SERIES', 6); m.t(57, 192, 'PARALLEL', 6);
  m.sw(`${id}.coupling`, 57, 176, { type: 'knob', r: 12, style: 'd-chicken', kind: 'enum', def: 'off', label: 'COUPLING MODE', name: '911A COUPLING MODE', module: 'env',
    options: [{ v: 'off', label: '', a: -60 }, { v: 'parallel', label: '', a: 180 }, { v: 'series', label: '', a: 60 }],
    help: 'OFF: two separate delays. PARALLEL: the upper input starts both, each with its own time. SERIES: the upper delay’s output starts the lower one, so the times add up.' });
  m.line(4, 202, 108, 202);
  dk(2, 248);
  m.t(28, 278, 'S-TRIG IN', 6); m.t(86, 278, 'S-TRIG OUT', 6);
  m.jack(`j.${id}.strig_2`, 28, 294, { label: 'S-TRIG IN', name: '911A S-TRIG IN (lower)', dir: 'in', dest: 'dtI2', amt: 1, help: 'The S-trigger for the lower delay, when COUPLING is OFF.' });
  m.jack(`j.${id}.strig_out_2`, 86, 294, { label: 'S-TRIG OUT', name: '911A S-TRIG OUT (lower)', dir: 'out', signal: 'dtO2', help: 'The lower delayed S-trigger.' });
  Object.assign(r.signalNames, { dtO1: 'the 911A upper delayed trigger', dtO2: 'the 911A lower delayed trigger' });
  r.eng.push((v, e) => { e.d911a = { d: [time911(v[`${id}.delay_1`]), time911(v[`${id}.delay_2`])], mode: v[`${id}.coupling`] }; });
}

// 995 Attenuators (8 HP): three passive attenuators
export function m995(r, x0, y0, n, id = `m995_${n}`) {
  const base = (n - 1) * 3;
  const m = mod(r, x0, y0, 8, { label: '995' }, 'ATTENUATORS', {
    id, label: `995 Attenuators (${n})`, module: 'util', keywords: 'attenuator depth level scale',
    help: 'Three plain attenuators: each turns down whatever is plugged into its IN before it leaves its OUT. Use them to set the depth of a modulation going into a pitch or filter input, where a full-size signal would be far too much.',
  });
  [0, 1, 2].forEach((k) => {
    const y = 66 + k * 92;
    m.knob(`${id}.att${k + 1}`, 56, y, 15, { kind: 'cont', min: 0, max: 10, def: 10, label: `ATTENUATOR ${k + 1}`, name: `995 (${n}) ATTENUATOR ${k + 1}`, module: 'util', scale: S10,
      help: 'How much of the IN reaches the OUT: 0 is nothing, 10 is all of it.' });
    m.t(24, y + 32, 'IN', 7); m.t(88, y + 32, 'OUT', 7);
    m.jack(`j.${id}.in${k + 1}`, 24, y + 48, { label: 'IN', name: `995 (${n}) IN ${k + 1}`, dir: 'in', dest: `q${base + k + 1}In`, amt: 1, help: 'Attenuator input.' });
    m.jack(`j.${id}.out${k + 1}`, 88, y + 48, { label: 'OUT', name: `995 (${n}) OUT ${k + 1}`, dir: 'out', signal: `q${base + k + 1}`, help: 'The input, turned down by the knob.' });
    m.line(36, y + 48, 76, y + 48);
    r.signalNames[`q${base + k + 1}`] = `995 attenuator ${n}.${k + 1}`;
  });
  r.eng.push((v, e) => { e.q995 = e.q995 || [0, 0, 0, 0, 0, 0]; [0, 1, 2].forEach((k) => { e.q995[base + k] = v[`${id}.att${k + 1}`] / 10; }); });
}

// 903A Random Signal Generator (4 HP): white and pink noise
export function m903a(r, x0, y0, id = 'm903a') {
  const m = mod(r, x0, y0, 4, { label: '903A' }, null, {
    id, label: '903A Random Signal Generator', module: 'util', keywords: 'noise white pink hiss random',
    help: 'A noise source with nothing to set: two WHITE and two PINK outputs. White noise is bright hiss, pink is darker, like surf or wind. Through a filter, noise makes wind, breath and drum sounds; through a slow filter or a sample-and-hold it can be a random control voltage.',
  });
  m.t(28, 24, 'RANDOM', 7, { weight: 700 }); m.t(28, 33, 'SIGNAL', 7, { weight: 700 }); m.t(28, 42, 'GENERATOR', 7, { weight: 700 });
  m.t(28, 96, 'WHITE', 7); m.t(28, 104, 'NOISE', 7);
  m.t(28, 206, 'PINK', 7); m.t(28, 214, 'NOISE', 7);
  [1, 2].forEach((k) => {
    m.jack(`j.${id}.white_${k}`, 28, 100 + k * 30, { label: 'WHITE', name: `903A WHITE ${k}`, dir: 'out', signal: 'white', help: 'White noise: a bright hiss with every frequency at once.' });
    m.jack(`j.${id}.pink_${k}`, 28, 210 + k * 30, { label: 'PINK', name: `903A PINK ${k}`, dir: 'out', signal: 'pink', help: 'Pink noise: less top than white, so it sounds deeper.' });
  });
}
