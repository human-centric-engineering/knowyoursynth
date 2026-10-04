// Helpers that work on a SynthDef + values: formatting, building a preset's target state, validating AI output.
import { CABLE_COLORS } from '@/lib/modules.js';

export const cleanLabel = (c) => (c.label || c.id).replace(/\n/g, ' ');

/**
 * Whether a control is on the faceplate right now. `show: { id, eq }` (or a list of them, all of which must hold) ties a
 * control to a panel mode: the DeepMind's four envelope faders are twelve controls deep, and which ones they are depends on
 * the VCA / VCF / MOD buttons. A hidden control keeps its value and is still part of the sound; it just is not drawn.
 * `{ id, in: [...] }` holds when the other control is at any of those values.
 */
export function isShown(c, values) {
  if (!c.show) return true;
  const list = Array.isArray(c.show) ? c.show : [c.show];
  return list.every((w) => (w.in ? w.in.includes(values[w.id]) : values[w.id] === w.eq));
}

export function controlMap(def) {
  if (!def._cmap) def._cmap = Object.fromEntries(def.controls.map((c) => [c.id, c]));
  return def._cmap;
}
export function jackMap(def) {
  if (!def._jmap) def._jmap = Object.fromEntries(def.jacks.map((j) => [j.id, j]));
  return def._jmap;
}

export function formatValue(c, v) {
  if (v == null) return '—';
  if (c.kind === 'bool') return v ? 'On' : 'Off';
  if (c.kind === 'enum') {
    const o = c.options.find((x) => x.v === v);
    return (o && o.label) || WAVE_NAMES[v] || String(v);
  }
  const n = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '').replace('-', '−');
  if (c.fmt) {
    try { return `${n} · ${c.fmt(v)}`; } catch { return n; }
  }
  return n;
}
const WAVE_NAMES = {
  tri: 'Triangle', shark: 'Triangle-saw', saw: 'Sawtooth', rsaw: 'Reverse saw', sq: 'Square', wide: 'Wide pulse', narrow: 'Narrow pulse',
  pulse: 'Pulse', sine: 'Sine', tmod: 'Tone mod',
};

/** init + steps[0..upto] → { values, cables }. `upto` omitted = the whole sound. */
export function presetState(def, preset, upto) {
  const values = { ...def.init };
  const cables = [];
  if (!preset) return { values, cables };
  // A synth whose TEMPO knob sets the riff's speed (SynthDef `tempo`) starts each sound at its own riff's BPM.
  if (def.tempo && preset.phrase && preset.phrase.bpm) values[def.tempo] = preset.phrase.bpm;
  const last = upto == null ? preset.steps.length - 1 : upto;
  preset.steps.forEach((s, i) => {
    if (i > last) return;
    Object.assign(values, s.set || {});
    (s.cables || []).forEach(([from, to]) => {
      if (!cables.some((c) => c.from === from && c.to === to)) cables.push({ from, to, color: CABLE_COLORS[cables.length % CABLE_COLORS.length] });
    });
  });
  return { values, cables };
}

/** How much an output jack scales what it sends (its `gain`, a number or a function of the values; default 1). */
export const jackGain = (j, values) => (typeof j.gain === 'function' ? j.gain(values) : j.gain == null ? 1 : j.gain);

/** Cables → engine cable routes, using the jack definitions. */
export function cablesToEngine(def, cables, values) {
  const jm = jackMap(def);
  const out = [];
  for (const cb of cables) {
    const a = jm[cb.from];
    const b = jm[cb.to];
    if (!a || !b || !a.signal || !b.dest) continue;
    // An output jack may carry a `gain` (the VCS3's numbered level knobs scale a matrix row wherever it is pinned).
    const amt = (typeof b.amt === 'function' ? b.amt(values) : b.amt == null ? 1 : b.amt) * jackGain(a, values);
    // Jacks of a two-module synth carry `part` (0 or 1): the engine sends the cable to that module's voice.
    const part = a.part || b.part ? { sp: a.part || 0, dp: b.part || 0 } : {};
    out.push({ src: a.signal, dst: b.dest, amt, add: !!b.add, ...part });
  }
  return out;
}

/** Keep only settings that are real controls with legal values. Used on anything that comes back from the AI. */
export function sanitizeSet(def, set) {
  const cm = controlMap(def);
  const clean = {};
  if (!set || typeof set !== 'object') return clean;
  for (const [id, raw] of Object.entries(set)) {
    const c = cm[id];
    if (!c) continue;
    if (c.kind === 'cont') {
      const n = Number(raw);
      if (Number.isFinite(n)) clean[id] = Math.round(Math.max(c.min, Math.min(c.max, n)) * 100) / 100;
    } else if (c.kind === 'bool') {
      clean[id] = raw === true || raw === 'true' || raw === 'on' || raw === 1;
    } else {
      const o = c.options.find((x) => x.v === raw || String(x.v) === String(raw));
      if (o) clean[id] = o.v;
    }
  }
  return clean;
}

export function sanitizeCables(def, list) {
  const jm = jackMap(def);
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    let [a, b] = pair;
    if (jm[a] && jm[b] && jm[a].dir === 'in' && jm[b].dir === 'out') [a, b] = [b, a];
    if (jm[a] && jm[b] && jm[a].dir === 'out' && jm[b].dir === 'in') out.push([a, b]);
  }
  return out;
}

const MODS = ['osc', 'mixer', 'filter', 'env', 'amp', 'mod', 'lfo', 'glide', 'util', 'fx', 'out', 'mode', 'patch'];

export function sanitizePreset(def, raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) return null;
  const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
  const steps = raw.steps.slice(0, 9).map((s) => ({
    title: str(s.title, 90) || 'Step',
    module: MODS.includes(s.module) ? s.module : 'osc',
    why: str(s.why, 1500),
    set: sanitizeSet(def, s.set),
    cables: sanitizeCables(def, s.cables),
  })).filter((s) => Object.keys(s.set).length || s.cables.length);
  if (!steps.length) return null;
  const cm = controlMap(def);
  const context = {};
  if (raw.context && typeof raw.context === 'object') {
    for (const [id, t] of Object.entries(raw.context)) if (cm[id] && typeof t === 'string') context[id] = t.slice(0, 400);
  }
  const tweaks = Array.isArray(raw.tweaks)
    ? raw.tweaks.filter((t) => t && cm[t.id]).slice(0, 5).map((t) => ({ id: t.id, try: str(t.try, 200), hear: str(t.hear, 300) }))
    : [];
  let phrase = null;
  if (raw.phrase && Array.isArray(raw.phrase.steps)) {
    const ps = raw.phrase.steps
      .filter((p) => Array.isArray(p) && p.length >= 3 && p.every((n) => Number.isFinite(Number(n))))
      .slice(0, 32)
      .map(([b, n, l]) => [Math.max(0, Math.min(16, Number(b))), Math.max(24, Math.min(96, Math.round(Number(n)))), Math.max(0.05, Math.min(16, Number(l)))]);
    if (ps.length) phrase = { bpm: Math.max(40, Math.min(180, Number(raw.phrase.bpm) || 100)), loop: true, steps: ps };
  }
  return {
    id: `ai-${Date.now().toString(36)}`,
    name: str(raw.name, 60) || 'AI sound',
    ref: 'Designed by the AI tutor from your description',
    artist: 'AI tutor',
    tags: [str(Array.isArray(raw.tags) ? raw.tags[0] : '', 16) || 'ai', 'ai'],
    level: [1, 2, 3].includes(raw.level) ? raw.level : 2,
    blurb: str(raw.blurb, 200),
    how: str(raw.how, 900),
    phrase: phrase || { bpm: 100, loop: true, steps: [[0, 48, 0.9], [1, 55, 0.9], [2, 60, 0.9], [3, 55, 0.9]] },
    steps, context, tweaks, ai: true,
  };
}

/** Compact, model-readable description of every control and jack, with current values. */
export function describeSynth(def, values, cables) {
  const lines = def.controls.map((c) => {
    const range = c.kind === 'cont' ? `number ${c.min}..${c.max}` : c.kind === 'bool' ? 'true|false' : `one of ${c.options.map((o) => JSON.stringify(o.v)).join(', ')}`;
    return `${c.id} | ${cleanLabel(c)} | ${c.module} | ${range} | now ${JSON.stringify(values[c.id])}`;
  });
  const jl = def.jacks.filter((j) => (j.dir === 'out' ? j.signal : j.dest)).map((j) => `${j.id} | ${j.label} | ${j.dir}`);
  const cl = cables.length ? cables.map((c) => `${c.from} -> ${c.to}`).join(', ') : 'none';
  return `CONTROLS (id | panel label | section | legal values | current value)\n${lines.join('\n')}\n\nPATCH JACKS (id | label | direction)\n${jl.join('\n')}\n\nCABLES NOW: ${cl}`;
}

const PREFIX_NAMES = { fenv: 'filter env', aenv: 'loudness env', env1: 'env 1', env2: 'env 2', mix: 'mixer', mixer: 'mixer', osc1: 'osc 1', osc2: 'osc 2', osc3: 'osc 3', oscA: 'osc A', oscB: 'osc B',
  vcaEnv: 'VCA env', vcfEnv: 'VCF env', modEnv: 'MOD env', attackCurve: 'attack curve', decayCurve: 'decay curve', releaseCurve: 'release curve',
  lfo1: 'LFO 1', lfo2: 'LFO 2', vcf: 'VCF', hpf: 'HPF', vca: 'VCA', arp: 'arp' };

/** Panel label, made unambiguous when several controls share it (three "VOLUME" knobs, two "ATTACK"s…). */
export function displayName(def, c) {
  if (c.name) return c.name;
  const label = cleanLabel(c);
  if (!def._dupes) {
    const seen = {};
    def.controls.forEach((x) => { const l = cleanLabel(x); seen[l] = (seen[l] || 0) + 1; });
    def._dupes = seen;
  }
  if (def._dupes[label] < 2) return label;
  const lower = label.toLowerCase();
  const hint = c.id.split(/[._]/).filter((s) => !lower.includes(s.toLowerCase().slice(0, 4))).map((s) => PREFIX_NAMES[s] || s).join(' ');
  return hint ? `${label} · ${hint}` : label;
}
