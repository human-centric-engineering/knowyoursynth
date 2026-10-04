// Sound map: which controls and cables are part of the sound right now, and which knobs it is most sensitive to.
// Nothing here is written per synth. Each control is moved, the panel is turned into engine parameters the usual
// way, and the probe (src/audio/probe.js) renders the result through the real voice and compares it with the
// sound as it stands.
/* global __PROBE_SRC__ */
import { cablesToEngine } from '@/lib/patch.js';
import { createProbe } from '@/audio/probe.js';

export const NUDGE = 0.05; // a "slight adjustment": this fraction of a knob's travel, each way

const round = (x) => Math.round(x * 1000) / 1000;

/** True if every engine parameter that differs between `a` and `b` is zero, false or absent in `a`. */
export function onlyFromZero(a, b) {
  if (a === b) return true;
  const objA = a && typeof a === 'object';
  const objB = b && typeof b === 'object';
  if (!objA && !objB) return !a;
  if (objA !== objB && a != null) return false;
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if (!onlyFromZero(a ? a[k] : undefined, b ? b[k] : undefined)) return false;
  return true;
}

/** True if some engine parameter that is zero, false or absent in `a` is switched on in `b`. */
function someFromZero(a, b) {
  if (a === b) return false;
  const objA = a && typeof a === 'object';
  const objB = b && typeof b === 'object';
  if (!objB) return !objA && !a && !!b;
  if (!objA && a) return false;
  return Object.keys(b).some((k) => someFromZero(a ? a[k] : undefined, b[k]));
}

/** The two notes the probe plays: the first two different notes of the sound's own riff. */
export function probeNotes(preset) {
  const steps = (preset && preset.phrase && preset.phrase.steps) || [];
  const first = steps.length ? steps[0][1] : 48;
  const other = steps.find((s) => s[1] !== first);
  return [first, other ? other[1] : first + 7];
}

/**
 * Every question the probe has to answer for this panel state.
 * → { baseline, jobs: [{ key, nudges, far }], inert: [key] } – `inert` are controls whose every move leaves the
 * engine parameters unchanged (a knob behind a switch that is off), which needs no rendering to know.
 */
/** Panel state → EngineParams, exactly as the app does it for the live voice. */
const engineFor = (def) => (v, cbl, wheel) => {
  const patched = Object.fromEntries(cbl.flatMap((c) => [[c.to, true], [c.from, true]]));
  const p = def.toEngine(v, { wheel, patched });
  p.cables = cablesToEngine(def, cbl, v);
  p.wheel = wheel;
  return p;
};

export function buildJobs(def, values, cables, wheel) {
  const make = engineFor(def);
  const engine = (v, cbl) => make(v, cbl, wheel);
  const baseJson = JSON.stringify(engine(values, cables));
  const baseline = JSON.parse(baseJson);
  const jobs = [];
  const inert = [];
  const variants = (list, make) => {
    const seen = new Set([baseJson]);
    const out = [];
    for (const x of list) {
      let p;
      try { p = make(x); } catch { continue; }
      const json = JSON.stringify(p);
      if (seen.has(json)) continue;
      seen.add(json);
      out.push(JSON.parse(json));
    }
    return out;
  };

  for (const c of def.controls) {
    if (c.ui) continue; // a panel mode (which envelope the faders show) is not part of any sound
    const cur = values[c.id];
    const withValue = (x) => engine({ ...values, [c.id]: x }, cables);
    let nudges = [];
    let far = [];
    if (c.kind === 'cont') {
      const span = c.max - c.min;
      const near = [cur - span * NUDGE, cur + span * NUDGE].filter((x) => x >= c.min && x <= c.max).map(round);
      nudges = variants(near, withValue);
      far = variants([c.max, c.min].filter((x) => Math.abs(x - cur) > span * NUDGE), withValue);
    } else {
      const others = c.kind === 'bool' ? [!cur] : c.options.map((o) => o.v).filter((x) => x !== cur);
      // A switch with many positions: the two ends and the middle are enough to tell whether it does anything.
      const pick = others.length > 3 ? [others[0], others[others.length - 1], others[others.length >> 1]] : others;
      far = variants(pick, withValue);
    }
    // "At zero": the control can be heard if it is moved, but everything it feeds the engine is zero or off as it
    // stands (a level at 0, a depth at 0, a switch that is off). It adds nothing yet; it is the way in.
    const moves = nudges.length ? nudges : far;
    // A many-position switch is never "off": a position that happens to feed the engine a 0 (an octave switch at 8') is still a choice.
    const zero = c.kind !== 'enum' && moves.length > 0 && moves.every((p) => onlyFromZero(baseline, p));
    if (moves.length) jobs.push({ key: c.id, nudges, far, zero }); else inert.push(c.id);
  }
  // A cable is part of the sound if pulling it out changes the sound.
  cables.forEach((cb) => {
    const key = `${cb.from}>${cb.to}`;
    const far = variants([0], () => engine(values, cables.filter((x) => x !== cb)));
    if (far.length) jobs.push({ key, nudges: [], far }); else inert.push(key);
  });
  return { baseline, jobs, inert };
}

// ── why is it dark? ─────────────────────────────────────────────────────────
// For every dead control, look for the way in: another control (a "door") that, once opened, makes the dead one
// audible. An opening move is any move that switches on an engine parameter that was zero, false or absent: a level
// or depth brought up from zero, a switch switched on, a mix knob turned towards the other side, a waveform switch
// moved to a wave that was not in use, the mod wheel pushed up. Round 1 tries every door alone. Round 2
// takes what is still unexplained and tries two doors: one, plus a door that only exists once the first is open
// (the mod wheel AND the modulation switch; an oscillator's mixer switch AND its volume).
// Every (dead control, door) pair is a rendering, so doors are tried nearest first, each dead control has a budget,
// and the search for a control stops soon after its first answer (see `stale` in the mapper).

export const WHEEL = '@wheel';
const SINGLE_BUDGET = 18;
const PAIR_BUDGET = 14;

const applyDoors = (world, combo) => {
  const next = { values: { ...world.values }, wheel: world.wheel };
  combo.forEach((d) => { if (d.id === WHEEL) next.wheel = 1; else next.values[d.id] = d.v; });
  return next;
};
const doorKey = (combo) => combo.map((d) => (d.id === WHEEL ? WHEEL : `${d.id}=${d.v}`)).sort().join('&');

/** The move that would open a control, if it has one: [{ id, v }] (several for a many-way switch). */
function openings(c, cur) {
  if (c.kind === 'bool') return cur ? [] : [{ id: c.id, v: true }];
  if (c.kind === 'enum') return c.options.map((o) => o.v).filter((x) => x !== cur).map((v) => ({ id: c.id, v }));
  const span = c.max - c.min;
  const up = Math.min(c.max, cur + span * 0.6);
  return [{ id: c.id, v: round(up - cur >= span * 0.3 ? up : Math.max(c.min, cur - span * 0.6)) }];
}

/**
 * The doors of a panel state. A move counts if it turns engine parameters on from nothing; with `latent` (a set of
 * control ids) a move of one of those counts even if it changes no parameter by itself, as long as the control looks
 * off (a switch that is off, a knob at zero) – it may be one half of a pair. `only` limits which controls are looked at.
 */
function doorsOf(def, world, cables, { latent = null, only = null } = {}) {
  const make = engineFor(def);
  const baseJson = JSON.stringify(make(world.values, cables, world.wheel));
  const baseline = JSON.parse(baseJson);
  const kind = (d) => {
    try {
      const w = applyDoors(world, [d]);
      const json = JSON.stringify(make(w.values, cables, w.wheel));
      if (json === baseJson) return 'same';
      return someFromZero(baseline, JSON.parse(json)) ? 'opens' : 'changes';
    } catch { return 'changes'; }
  };
  const doors = [];
  for (const c of def.controls) {
    if (c.ui || (only && !only.has(c.id))) continue;
    const cur = world.values[c.id];
    const looksOff = c.kind === 'bool' ? cur === false : c.kind === 'cont' ? cur === c.min || cur === 0
      : /^(off|none|0|false)$/i.test(String(cur)) || /^off$/i.test(((c.options.find((o) => o.v === cur) || {}).label || '').trim());
    const found = [];
    for (const d of openings(c, cur)) {
      const k = kind(d);
      if (k === 'opens') found.push(d);
      else if (k === 'same' && latent && latent.has(c.id) && looksOff) found.push({ ...d, latent: true });
    }
    found.slice(0, 5).forEach((d) => doors.push(d));
  }
  if (world.wheel < 0.5 && (!only || only.has(WHEEL)) && kind({ id: WHEEL }) !== 'changes') doors.push({ id: WHEEL });
  return doors;
}

/** One big move of a dead control, to see whether it can be heard once a door is open. */
function bigMove(c, cur) {
  if (c.kind === 'bool') return !cur;
  if (c.kind === 'enum') { const o = c.options.map((x) => x.v); return o[o.length - 1] !== cur ? o[o.length - 1] : o[0]; }
  return c.max - cur >= cur - c.min ? c.max : c.min;
}

/**
 * Jobs asking "with this combination of doors open, can this dead control be heard?", for each dead control its
 * nearest combinations first, up to `budget`. A combination that cannot matter to a control (the same EngineParams
 * either way) costs nothing. The list comes back interleaved: every control's first try, then every second try…
 */
function doorJobs(def, world, cables, deadIds, combos, budget) {
  const make = engineFor(def);
  const cm = Object.fromEntries(def.controls.map((c) => [c.id, c]));
  const areaOf = (p) => (def.areas || []).find((a) => a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h));
  const far = (a, b) => (!a || !b ? 0 : Math.hypot(a.x - b.x, a.y - b.y) * (areaOf(a) === areaOf(b) ? 0.5 : 1));
  const bases = combos.map((combo) => {
    const w = applyDoors(world, combo);
    try { return { combo, w, json: JSON.stringify(make(w.values, cables, w.wheel)), key: doorKey(combo) }; } catch { return null; }
  }).filter(Boolean);
  const perControl = deadIds.map((id) => {
    const c = cm[id];
    const list = bases.filter((b) => !b.combo.some((d) => d.id === id))
      .map((b) => ({ b, dist: b.combo.reduce((sum, d) => sum + far(c, cm[d.id]), 0) }))
      .sort((x, y) => (x.b.combo.tier || 0) - (y.b.combo.tier || 0) || x.dist - y.dist);
    const jobs = [];
    for (const { b } of list) {
      if (jobs.length >= budget) break;
      let json;
      try { json = JSON.stringify(make({ ...b.w.values, [id]: bigMove(c, world.values[id]) }, cables, b.w.wheel)); } catch { continue; }
      if (json !== b.json) jobs.push({ key: `${id}|${b.key}`, dead: id, combo: b.combo, rank: jobs.length, short: true, baseKey: b.key, base: JSON.parse(b.json), far: [JSON.parse(json)] });
    }
    return jobs;
  });
  const out = [];
  for (let rank = 0; rank < budget; rank++) perControl.forEach((jobs) => { if (jobs[rank]) out.push(jobs[rank]); });
  return out;
}

/**
 * The two rounds of the search, as job lists. Each result says `live` for one (dead control, door combination) pair.
 * `ids` = the dead controls to explain (default: all of them; the app asks for one at a time, when it is pointed at).
 */
export function doorSearch(def, values, cables, wheel, state, ids) {
  const world = { values, wheel };
  const latent = new Set(def.controls.filter((c) => state[c.id] === 'dead').map((c) => c.id));
  const dead = ids || [...latent];
  let singles = [];
  return {
    dead,
    firstRound() {
      singles = doorsOf(def, world, cables, { latent });
      return doorJobs(def, world, cables, dead, singles.map((d) => [d]), SINGLE_BUDGET);
    },
    secondRound(unexplained) {
      if (!unexplained.length) return [];
      const known = new Set(singles.filter((d) => !d.latent).map((d) => d.id)); // already tried alone
      const only = new Set([...latent, WHEEL]); // a door behind a door is itself a dead control (or the wheel)
      const seen = new Set();
      const combos = [];
      for (const first of singles) {
        let behind = [];
        try { behind = doorsOf(def, applyDoors(world, [first]), cables, { only }); } catch { /* this door cannot be opened */ }
        for (const second of behind) {
          if (second.id === first.id || known.has(second.id)) continue;
          const key = doorKey([first, second]);
          if (!seen.has(key)) { seen.add(key); combos.push([first, second]); }
        }
      }
      // Then pairs of doors that each failed alone but sit close together (an oscillator's mix knob AND its wave
      // knob). At least one of the two has to be dead itself, or each would already have worked alone.
      const cm = Object.fromEntries(def.controls.map((c) => [c.id, c]));
      const near = (a, b) => a.id === WHEEL || b.id === WHEEL || Math.hypot(cm[a.id].x - cm[b.id].x, cm[a.id].y - cm[b.id].y) < def.view.w * 0.2;
      const firstTwo = singles.filter((d, i) => singles.filter((x, k) => k < i && x.id === d.id).length < 2);
      for (let i = 0; i < firstTwo.length; i++) {
        for (let k = i + 1; k < firstTwo.length; k++) {
          const [a, b] = [firstTwo[i], firstTwo[k]];
          if (a.id === b.id || !(latent.has(a.id) || latent.has(b.id)) || !near(a, b)) continue;
          const key = doorKey([a, b]);
          if (!seen.has(key)) { seen.add(key); combos.push(Object.assign([a, b], { tier: 1 })); }
        }
      }
      return doorJobs(def, world, cables, unexplained, combos, PAIR_BUDGET);
    },
  };
}

/** Probe results → what the panel draws. `heat` is 0..1 for knobs and sliders only; switches are just in or out. */
export function summarise(def, jobs, results, inert) {
  const state = {}; // id → 'on' | 'zero' | 'dead'
  const raw = {};
  const zero = Object.fromEntries(jobs.map((j) => [j.key, j.zero]));
  inert.forEach((k) => { state[k] = 'dead'; });
  results.forEach((r) => { state[r.key] = !r.live ? 'dead' : zero[r.key] ? 'zero' : 'on'; raw[r.key] = r.d; });
  const cont = def.controls.filter((c) => c.kind === 'cont' && state[c.id] !== 'dead' && raw[c.id] >= 0.25);
  // Against the most sensitive knob in this sound, on a log scale so one pitch knob does not flatten the rest.
  // A sound where nothing moves much shows nothing as hot.
  const top = Math.max(2, ...cont.map((c) => raw[c.id]));
  const heat = {};
  cont.forEach((c) => { heat[c.id] = Math.log(1 + raw[c.id]) / Math.log(1 + top); });
  const ranked = cont.sort((a, b) => raw[b.id] - raw[a.id]).map((c) => c.id);
  return { state, heat, ranked, zero };
}

// ── running it ──────────────────────────────────────────────────────────────
// A few Workers share the jobs (a 2600 panel is about 200 renderings). If the host page blocks Workers, the same
// probe runs here on the main thread, one job per tick. One analysis = one session: the workers hold its baseline,
// and the "why is it dark?" questions that follow are more jobs for the same session, one question at a time.
const POOL = Math.max(1, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1));

export function createMapper() {
  let workers = null; // null = not tried, [] = blocked
  let run = 0;
  let timer = null;
  let session = null;

  const spawn = () => {
    if (workers) return workers;
    workers = [];
    try {
      const url = URL.createObjectURL(new Blob([__PROBE_SRC__], { type: 'application/javascript' }));
      for (let i = 0; i < POOL; i++) workers.push(new Worker(url));
    } catch {
      workers.forEach((w) => w.terminate());
      workers = [];
    }
    return workers;
  };

  const endPhase = (sess) => { const done = sess.resolve; sess.resolve = null; if (done) done(); };

  /** Hand out jobs until the queue is empty. Jobs the phase calls stale (the question is already answered) are dropped unrendered. */
  function pump(sess) {
    if (sess.id !== run) return;
    const next = () => {
      while (sess.queue.length) { const job = sess.queue.shift(); if (!sess.stale || !sess.stale(job)) return job; }
      return null;
    };
    if (sess.mode === 'pool') {
      while (sess.idle.length) {
        const job = next();
        if (!job) break;
        const w = sess.idle.pop();
        sess.inflight.set(w, job);
        w.postMessage({ type: 'job', run: sess.id, job });
      }
      if (!sess.queue.length && !sess.inflight.size) endPhase(sess);
    } else if (!sess.ticking) {
      sess.ticking = true;
      const tick = () => {
        if (sess.id !== run) return;
        if (!sess.probe) sess.probe = createProbe(sess.baseline, sess.notes);
        const job = next();
        if (job && sess.onResult) sess.onResult(sess.probe.measure(job), job);
        if (sess.queue.length) timer = setTimeout(tick, 4); else { sess.ticking = false; endPhase(sess); }
      };
      timer = setTimeout(tick, 4);
    }
  }

  // Workers that never answer (or fail to load) are blocked by the host: stop using them for good.
  function fallBack(sess) {
    if (sess.answered || sess.mode !== 'pool' || sess.id !== run) return;
    (workers || []).forEach((w) => w.terminate());
    workers = [];
    sess.mode = 'main';
    sess.queue.unshift(...sess.inflight.values());
    sess.inflight.clear();
    pump(sess);
  }

  function open(sess) {
    const pool = spawn();
    if (!pool.length) { sess.mode = 'main'; return; }
    sess.mode = 'pool';
    pool.forEach((w) => {
      w.onerror = () => fallBack(sess);
      w.onmessage = (m) => {
        if (m.data.run !== sess.id || sess.id !== run) return;
        sess.answered = true;
        if (m.data.type === 'result') {
          const job = sess.inflight.get(w);
          sess.inflight.delete(w);
          if (sess.onResult) sess.onResult(m.data.result, job);
        }
        sess.idle.push(w);
        pump(sess);
      };
      w.postMessage({ type: 'start', run: sess.id, baseline: sess.baseline, notes: sess.notes });
    });
    setTimeout(() => fallBack(sess), 2500);
  }

  const phase = (sess, jobs, onResult, stale) => new Promise((resolve) => {
    if (sess.id !== run || !jobs.length) { resolve(); return; }
    Object.assign(sess, { queue: jobs.slice(), onResult, stale, resolve });
    pump(sess);
  });

  const close = () => { run++; clearTimeout(timer); if (session) endPhase(session); session = null; };

  return {
    /** Analyse one panel state. Calling it again (or `cancel`) drops whatever is still running. */
    analyse(def, values, cables, wheel, notes, onProgress, onDone) {
      close();
      const id = run;
      const { baseline, jobs, inert } = buildJobs(def, values, cables, wheel);
      const sess = { id, def, values, cables, wheel, notes, baseline, queue: [], idle: [], inflight: new Map(), asked: new Set(), state: null };
      session = sess;
      open(sess);
      const results = [];
      sess.tail = phase(sess, jobs, (r) => { results.push(r); onProgress(results.length / jobs.length); }).then(() => {
        if (id !== run) return;
        const map = summarise(def, jobs, results, inert);
        sess.state = map.state;
        onDone(map);
      });
    },
    /**
     * Why is this control dead? → onDone(id, [combo, …]): up to two ways in, each a list of doors ({ id, v } or
     * { id: '@wheel' }) to open together; empty if one or two doors are not enough. Asked once per control per analysis.
     */
    explain(controlId, onDone) {
      const sess = session;
      if (!sess || sess.id !== run || !sess.state || sess.state[controlId] !== 'dead' || sess.asked.has(controlId)) return;
      sess.asked.add(controlId);
      sess.tail = sess.tail.then(async () => {
        if (sess.id !== run) return;
        const search = doorSearch(sess.def, sess.values, sess.cables, sess.wheel, sess.state, [controlId]);
        const found = [];
        const each = (r, job) => { if (r.live && job) found.push(job); };
        // Doors are tried nearest first; a little past the first answer is far enough to look for a second.
        const stale = (job) => found.length >= 2 || (found.length > 0 && job.rank > Math.min(...found.map((f) => f.rank)) + 4);
        await phase(sess, search.firstRound(), each, stale);
        if (!found.length) await phase(sess, search.secondRound([controlId]), each, stale);
        if (sess.id === run) onDone(controlId, found.sort((a, b) => a.rank - b.rank).slice(0, 2).map((f) => f.combo));
      }).catch(() => { if (sess.id === run) onDone(controlId, []); });
    },
    cancel: close,
    dispose() { close(); (workers || []).forEach((w) => w.terminate()); workers = null; },
  };
}
