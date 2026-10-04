// Validate every sound in the library and render it through the real DSP, so a sound can be judged by numbers.
//   node check.mjs                 all synths
//   node check.mjs neutron         one synth
//   node check.mjs neutron reese   one synth, only sounds whose id contains "reese"
// Exit code 1 if anything is wrong (unknown control, value out of range, bad cable, NaN, silent sound).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const TOOLCHAIN = process.env.KYS_TOOLCHAIN || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(TOOLCHAIN, 'package.json'));
const esbuild = require('esbuild');
const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');

const entry = `
import { SYNTHS } from '@/synths/index.js';
import { presetState, cablesToEngine, controlMap, jackMap } from '@/lib/patch.js';
import { explainCable } from '@/lib/explain.js';
import { createSynth, SIGNALS, DESTS } from '@/audio/dsp-core.js';
import { limitsFor } from '@/lib/limits.js';
import { modularDef } from '@/lib/layout.js';
import { checkBank } from '@/bank/index.js';
export { checkBank, modularDef, SYNTHS, presetState, cablesToEngine, controlMap, jackMap, explainCable, createSynth, SIGNALS, DESTS, limitsFor };
`;
const outFile = path.join(root, '.cache', `check.${process.pid}.out.mjs`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await esbuild.build({
  stdin: { contents: entry, resolveDir: src, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: outFile, alias: { '@': src }, loader: { '.js': 'jsx' }, logLevel: 'warning',
});
const { checkBank, modularDef, SYNTHS, presetState, cablesToEngine, controlMap, jackMap, explainCable, createSynth, SIGNALS, DESTS, limitsFor } = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
fs.rmSync(outFile, { force: true });

const [onlySynthArg, onlyPreset] = process.argv.slice(2);
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const onlySynth = onlySynthArg ? (SYNTHS.find((d) => norm(d.id) === norm(onlySynthArg)) || {}).id : null;
if (onlySynthArg && !onlySynth) { console.log(`ERR no synth "${onlySynthArg}" – use one of: ${SYNTHS.map((d) => d.id).join(', ')}`); process.exit(1); }
const CATS = ['bass', 'lead', 'pad', 'pluck', 'keys', 'fx', 'drone', 'perc', 'seq', 'brass', 'strings', 'wind'];
let errs = 0;
let rendered = 0;
const E = (m) => { errs++; console.log('ERR', m); };
const SR = 48000;

// The databank: every id resolves and every linked sound exists.
for (const m of checkBank((id) => SYNTHS.find((d) => d.id === id)?.presets.map((p) => p.id) || null)) E(`bank: ${m}`);

/** Rough brightness: zero crossings per second over a window, as Hz. */
const zcr = (buf, from, to) => {
  let n = 0;
  for (let i = from + 1; i < to; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) n++;
  return Math.round((n / 2) / ((to - from) / SR));
};
const rmsOf = (buf, from, to) => { let s = 0; for (let i = from; i < to; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (to - from)); };

for (const def of SYNTHS) {
  if (onlySynth && def.id !== onlySynth) continue;
  const cm = controlMap(def), jm = jackMap(def);
  for (const j of def.jacks) {
    if (j.signal && !SIGNALS.includes(j.signal)) E(`${def.id} jack ${j.id} bad signal ${j.signal}`);
    if (j.dest && !DESTS.includes(j.dest)) E(`${def.id} jack ${j.id} bad dest ${j.dest}`);
  }
  for (const c of def.controls) if (def.init[c.id] === undefined) E(`${def.id} init missing ${c.id}`);
  const seenIds = new Set();
  for (const x of [...def.controls, ...def.jacks]) { if (seenIds.has(x.id)) E(`${def.id} duplicate control/jack id ${x.id}`); seenIds.add(x.id); }
  // Areas: every control and jack sits in exactly one (the search and the section cards rely on it).
  const areasAt = (p) => (def.areas || []).filter((a) => a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h));
  if (!def.areas || !def.areas.length) E(`${def.id} has no areas`);
  else for (const p of [...def.controls, ...def.jacks]) { const n = areasAt(p).map((a) => a.id); if (n.length !== 1) E(`${def.id} ${p.id} is in ${n.length} areas${n.length ? ` (${n.join(', ')})` : ''}`); }
  // The modular layout must keep every control in one area of its own, inside the case, with no areas overlapping.
  if (def.modular) {
    let m = null;
    try { m = modularDef(def); } catch (err) { E(err.message); }
    if (m) {
      const at = (p) => m.areas.filter((a) => a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)).map((a) => a.id);
      for (const p of [...m.controls, ...m.jacks]) {
        const was = areasAt(def.controls.find((c) => c.id === p.id) || def.jacks.find((j) => j.id === p.id)).map((a) => a.id);
        const n = at(p);
        if (n.length !== 1 || n[0] !== was[0]) E(`${def.id} modular: ${p.id} is in ${n.join(', ') || 'no area'}, was ${was.join(', ')}`);
        if (p.x < 0 || p.y < 0 || p.x > m.view.w || p.y > m.view.h) E(`${def.id} modular: ${p.id} is outside the case`);
      }
      const rs = m.areas.flatMap((a) => a.rects.map((r) => ({ ...r, id: a.id })));
      rs.forEach((a, i) => rs.slice(i + 1).forEach((b) => {
        if (a.id !== b.id && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5) E(`${def.id} modular: areas ${a.id} and ${b.id} overlap`);
      }));
    }
  }
  const ids = new Set();
  // The "What is not modelled" dialog is keyed on the synth id, and silently shows nothing if it is missing.
  const lim = limitsFor(def.id);
  if (!lim) E(`${def.id} has no entry in src/lib/limits.js`);
  else if (!lim.intro || !Array.isArray(lim.items)) E(`${def.id} limits entry needs an intro and an items array`);
  if (!def.lineage) E(`${def.id} has no lineage`);
  else for (const h of def.lineage.heard) if (h.sound && !def.presets.some((p) => p.id === h.sound)) E(`${def.id} lineage "${h.who}" points at unknown sound ${h.sound}`);
  const all = [{ id: '(init)', name: 'init', tags: ['lead'], level: 1, steps: [], phrase: { bpm: 120, steps: [[0, 48, 1], [1, 60, 1]] } }, ...def.presets];
  console.log(`\n${def.name} — ${def.presets.length} sounds`);
  console.log(`${'id'.padEnd(24)} peak  rms   rms per 0.5 s window              bright@0.05s → @1s   cpu`);
  for (const p of all) {
    if (onlyPreset && !p.id.includes(onlyPreset)) continue;
    const tag = `${def.id}/${p.id}`;
    if (ids.has(p.id)) E(`${tag} duplicate id`);
    ids.add(p.id);
    if (p.id !== '(init)') {
      for (const k of ['name', 'ref', 'artist', 'blurb', 'how']) if (typeof p[k] !== 'string' || !p[k]) E(`${tag} missing ${k}`);
      if (!Array.isArray(p.tags) || !CATS.includes(p.tags[0])) E(`${tag} first tag must be a category (${CATS.join(' ')})`);
      if (![1, 2, 3].includes(p.level)) E(`${tag} level must be 1, 2 or 3`);
      if (!p.steps.length) E(`${tag} has no steps`);
      if (!p.phrase || !Array.isArray(p.phrase.steps) || !p.phrase.steps.length) E(`${tag} has no phrase`);
    }
    const touched = new Set();
    for (const s of p.steps) {
      if (p.id !== '(init)' && (!s.title || !s.why || !s.module)) E(`${tag} step needs title, module and why`);
      for (const [id, v] of Object.entries(s.set || {})) {
        touched.add(id);
        const c = cm[id];
        if (!c) { E(`${tag} unknown control ${id}`); continue; }
        if (c.kind === 'cont' && (typeof v !== 'number' || v < c.min || v > c.max)) E(`${tag} ${id}=${v} out of range ${c.min}..${c.max}`);
        if (c.kind === 'enum' && !c.options.some((o) => o.v === v)) E(`${tag} ${id}=${JSON.stringify(v)} not one of ${c.options.map((o) => JSON.stringify(o.v)).join(' ')}`);
        if (c.kind === 'bool' && typeof v !== 'boolean') E(`${tag} ${id} must be true/false`);
      }
      for (const [a, b] of s.cables || []) {
        if (!jm[a] || !jm[b] || jm[a].dir !== 'out' || jm[b].dir !== 'in') E(`${tag} bad cable ${a} > ${b} (must be [outJackId, inJackId])`);
        else if (!jm[a].signal || !jm[b].dest) E(`${tag} cable ${a} > ${b} uses a jack that is not modelled`);
      }
    }
    for (const t of p.tweaks || []) if (!cm[t.id]) E(`${tag} tweak unknown control ${t.id}`);
    for (const id of Object.keys(p.context || {})) if (!cm[id]) E(`${tag} context unknown control ${id}`);

    const st = presetState(def, p);
    const patched = Object.fromEntries(st.cables.flatMap((c) => [[c.to, true], [c.from, true]]));
    let ep;
    try { ep = def.toEngine(st.values, { wheel: 0, patched }); } catch (e) { E(`${tag} toEngine threw ${e.message}`); continue; }
    ep.cables = cablesToEngine(def, st.cables, st.values);
    for (const r of [...(ep.routes || []), ...ep.cables]) {
      if (!SIGNALS.includes(r.src)) E(`${tag} route src ${r.src}`);
      if (!DESTS.includes(r.dst)) E(`${tag} route dst ${r.dst}`);
      if (!Number.isFinite(r.amt)) E(`${tag} route amt ${r.amt}`);
    }
    for (const c of st.cables) {
      try {
        const x = explainCable(def, c.from, c.to, st.values, st.cables);
        if (!x || !x.hear) E(`${tag} no explanation for ${c.from} > ${c.to}`);
      } catch (e) { E(`${tag} explainCable threw for ${c.from} > ${c.to}: ${e.message}`); }
    }

    rendered++;
    const syn = createSynth(SR, () => {});
    syn.handle({ type: 'params', p: JSON.parse(JSON.stringify(ep)) });
    syn.handle({ type: 'phrase', phrase: p.phrase });
    const buf = new Float32Array(SR * 3);
    const t0 = performance.now();
    for (let o = 0; o < buf.length; o += 128) syn.process(buf.subarray(o, o + 128), 128);
    const ms = performance.now() - t0;
    let peak = 0, nan = false;
    for (const x of buf) { if (!Number.isFinite(x)) nan = true; peak = Math.max(peak, Math.abs(x)); }
    const rms = rmsOf(buf, 0, buf.length);
    const wins = [0, 1, 2, 3, 4, 5].map((k) => rmsOf(buf, k * SR / 2, (k + 1) * SR / 2).toFixed(2)).join(' ');
    // `silentInit`: a synth with nothing connected until it is patched (the VCS3) is meant to be silent as initialised.
    const quietOk = p.id === '(init)' && !!def.silentInit;
    const flag = nan ? 'NaN!' : rms < 0.004 ? (quietOk ? 'silent (as designed)' : 'SILENT?') : peak > 0.98 ? 'hot' : rms < 0.03 ? 'quiet' : '';
    if (nan || (rms < 0.004 && !quietOk)) errs++;
    console.log(`${p.id.padEnd(24)} ${peak.toFixed(2)}  ${rms.toFixed(3)} ${wins}   ${String(zcr(buf, SR * 0.02, SR * 0.08)).padStart(5)} → ${String(zcr(buf, SR * 1.0, SR * 1.1)).padEnd(5)} Hz     ${(ms / 30).toFixed(1)}% ${flag}`);
  }
}
if (!rendered) { console.log('ERR nothing matched – no sounds were checked'); process.exit(1); }
console.log(errs ? `\n${errs} errors` : `\nno errors (${rendered} sounds rendered)`);
process.exit(errs ? 1 : 0);
