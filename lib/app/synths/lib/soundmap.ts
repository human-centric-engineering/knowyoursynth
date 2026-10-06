// Sound map: which controls and cables are part of the sound right now, and which knobs it is most sensitive to.
// Nothing here is written per synth. Each control is moved, the panel is turned into engine parameters the usual
// way, and the probe (audio/probe) renders the result through the real voice and compares it with the
// sound as it stands.
//
// Transliterated from the prototype file `src/lib/soundmap.js` (decision D3). One change of mechanism: the prototype built its
// probe Workers from source text embedded at build time (`__PROBE_SRC__`); the app serves the probe worker as a
// static file, `PROBE_WORKER_URL` (from the audio module).
import { logger } from '@/lib/logging';
import { cablesToEngine, type CableLike } from '@/lib/app/synths/lib/patch';
import { createProbe, PROBE_WORKER_URL } from '@/lib/app/synths/audio/probe';
import type {
  Control,
  ControlValue,
  ControlValues,
  EngineParams,
  Preset,
  SynthDef,
} from '@/lib/app/synths/contract';

/**
 * How long the probe workers may take to answer before the mapper stops using them. The prototype allowed 2.5 s for
 * workers built from a Blob URL; these are a network fetch first (see `WORKLET_TIMEOUT_MS` in the engine).
 */
export const WORKER_TIMEOUT_MS = 10_000;

/** Where the probe worker is served (built from `audio/probe-worker-entry`); re-exported for the panel. */
export { PROBE_WORKER_URL };

export const NUDGE = 0.05; // a "slight adjustment": this fraction of a knob's travel, each way

const round = (x: number) => Math.round(x * 1000) / 1000;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const field = (x: unknown, k: string): unknown => (isObj(x) ? x[k] : undefined);
/** Our own `JSON.stringify` of an EngineParams, read back (a deep copy with the `undefined`s dropped). */
const reparse = (json: string): EngineParams => JSON.parse(json) as EngineParams;

/** True if every engine parameter that differs between `a` and `b` is zero, false or absent in `a`. */
export function onlyFromZero(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const objA = isObj(a);
  const objB = isObj(b);
  if (!objA && !objB) return !a;
  if (objA !== objB && a != null) return false;
  const keys = new Set([...Object.keys(isObj(a) ? a : {}), ...Object.keys(isObj(b) ? b : {})]);
  for (const k of keys) if (!onlyFromZero(field(a, k), field(b, k))) return false;
  return true;
}

/** True if some engine parameter that is zero, false or absent in `a` is switched on in `b`. */
function someFromZero(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  const objA = isObj(a);
  if (!isObj(b)) return !objA && !a && !!b;
  if (!objA && a) return false;
  return Object.keys(b).some((k) => someFromZero(field(a, k), b[k]));
}

/** The two notes the probe plays: the first two different notes of the sound's own riff. */
export function probeNotes(preset: Pick<Preset, 'phrase'> | null | undefined): [number, number] {
  const steps = (preset && preset.phrase && preset.phrase.steps) || [];
  const first = steps.length ? steps[0][1] : 48;
  const other = steps.find((s) => s[1] !== first);
  return [first, other ? other[1] : first + 7];
}

/** One question for the probe: is this control (or cable) part of the sound, and how much does a nudge move it? */
export interface ProbeJob {
  key: string;
  /** Settings a small move away. */
  nudges: EngineParams[];
  /** Settings a long way away, tried only if no nudge is audible. */
  far: EngineParams[];
  /** Every move only switches something on from nothing. */
  zero?: boolean;
}

/** A door: a move of a control (or the mod wheel, `WHEEL`) that may open the way to a dead control. */
export interface Door {
  id: string;
  v?: ControlValue;
  /** Counts only as one half of a pair: on its own it changes nothing. */
  latent?: boolean;
}
/** Doors opened together; `tier` 1 = a pair of doors that each failed alone. */
export type DoorCombo = Door[] & { tier?: number };

/** "With these doors open, can this dead control be heard?" */
export interface DoorJob extends ProbeJob {
  dead: string;
  combo: DoorCombo;
  rank: number;
  short: true;
  baseKey: string;
  base: EngineParams;
}

/** What the probe says about a job. */
export interface ProbeResult {
  key: string;
  live: boolean;
  /** The largest change a nudge makes (the sensitivity). */
  d?: number;
  far?: number;
}

/**
 * Every question the probe has to answer for this panel state.
 * → { baseline, jobs: [{ key, nudges, far }], inert: [key] } – `inert` are controls whose every move leaves the
 * engine parameters unchanged (a knob behind a switch that is off), which needs no rendering to know.
 */
/** Panel state → EngineParams, exactly as the app does it for the live voice. */
const engineFor = (def: SynthDef) => (v: ControlValues, cbl: CableLike[], wheel: number) => {
  const patched = Object.fromEntries(
    cbl.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );
  const p = def.toEngine(v, { wheel, patched });
  p.cables = cablesToEngine(def, cbl, v);
  p.wheel = wheel;
  return p;
};

export function buildJobs(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[],
  wheel: number
): { baseline: EngineParams; jobs: ProbeJob[]; inert: string[] } {
  const make = engineFor(def);
  const engine = (v: ControlValues, cbl: CableLike[]) => make(v, cbl, wheel);
  const baseJson = JSON.stringify(engine(values, cables));
  const baseline = reparse(baseJson);
  const jobs: ProbeJob[] = [];
  const inert: string[] = [];
  const variants = <T>(list: T[], build: (x: T) => EngineParams) => {
    const seen = new Set([baseJson]);
    const out: EngineParams[] = [];
    for (const x of list) {
      let p: EngineParams;
      try {
        p = build(x);
      } catch {
        continue;
      }
      const json = JSON.stringify(p);
      if (seen.has(json)) continue;
      seen.add(json);
      out.push(reparse(json));
    }
    return out;
  };

  for (const c of def.controls) {
    if (c.ui) continue; // a panel mode (which envelope the faders show) is not part of any sound
    const cur = values[c.id];
    const withValue = (x: ControlValue) => engine({ ...values, [c.id]: x }, cables);
    let nudges: EngineParams[] = [];
    let far: EngineParams[] = [];
    if (c.kind === 'cont') {
      const n = Number(cur);
      const span = c.max - c.min;
      const near = [n - span * NUDGE, n + span * NUDGE]
        .filter((x) => x >= c.min && x <= c.max)
        .map(round);
      nudges = variants(near, withValue);
      far = variants(
        [c.max, c.min].filter((x) => Math.abs(x - n) > span * NUDGE),
        withValue
      );
    } else {
      const others: ControlValue[] =
        c.kind === 'bool' ? [!cur] : c.options.map((o) => o.v).filter((x) => x !== cur);
      // A switch with many positions: the two ends and the middle are enough to tell whether it does anything.
      const pick =
        others.length > 3
          ? [others[0], others[others.length - 1], others[others.length >> 1]]
          : others;
      far = variants(pick, withValue);
    }
    // "At zero": the control can be heard if it is moved, but everything it feeds the engine is zero or off as it
    // stands (a level at 0, a depth at 0, a switch that is off). It adds nothing yet; it is the way in.
    const moves = nudges.length ? nudges : far;
    // A many-position switch is never "off": a position that happens to feed the engine a 0 (an octave switch at 8') is still a choice.
    const zero =
      c.kind !== 'enum' && moves.length > 0 && moves.every((p) => onlyFromZero(baseline, p));
    if (moves.length) jobs.push({ key: c.id, nudges, far, zero });
    else inert.push(c.id);
  }
  // A cable is part of the sound if pulling it out changes the sound.
  cables.forEach((cb) => {
    const key = `${cb.from}>${cb.to}`;
    const far = variants([0], () =>
      engine(
        values,
        cables.filter((x) => x !== cb)
      )
    );
    if (far.length) jobs.push({ key, nudges: [], far });
    else inert.push(key);
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

interface World {
  values: ControlValues;
  wheel: number;
}

const applyDoors = (world: World, combo: Door[]): World => {
  const next = { values: { ...world.values }, wheel: world.wheel };
  combo.forEach((d) => {
    if (d.id === WHEEL) next.wheel = 1;
    else if (d.v !== undefined) next.values[d.id] = d.v;
  });
  return next;
};
const doorKey = (combo: Door[]) =>
  combo
    .map((d) => (d.id === WHEEL ? WHEEL : `${d.id}=${String(d.v)}`))
    .sort()
    .join('&');

/** The move that would open a control, if it has one: [{ id, v }] (several for a many-way switch). */
function openings(c: Control, cur: ControlValue | undefined): Door[] {
  if (c.kind === 'bool') return cur ? [] : [{ id: c.id, v: true }];
  if (c.kind === 'enum')
    return c.options
      .map((o) => o.v)
      .filter((x) => x !== cur)
      .map((v) => ({ id: c.id, v }));
  const n = Number(cur);
  const span = c.max - c.min;
  const up = Math.min(c.max, n + span * 0.6);
  return [{ id: c.id, v: round(up - n >= span * 0.3 ? up : Math.max(c.min, n - span * 0.6)) }];
}

/**
 * The doors of a panel state. A move counts if it turns engine parameters on from nothing; with `latent` (a set of
 * control ids) a move of one of those counts even if it changes no parameter by itself, as long as the control looks
 * off (a switch that is off, a knob at zero) – it may be one half of a pair. `only` limits which controls are looked at.
 */
function doorsOf(
  def: SynthDef,
  world: World,
  cables: CableLike[],
  { latent = null, only = null }: { latent?: Set<string> | null; only?: Set<string> | null } = {}
): Door[] {
  const make = engineFor(def);
  const baseJson = JSON.stringify(make(world.values, cables, world.wheel));
  const baseline = reparse(baseJson);
  const kind = (d: Door) => {
    try {
      const w = applyDoors(world, [d]);
      const json = JSON.stringify(make(w.values, cables, w.wheel));
      if (json === baseJson) return 'same';
      return someFromZero(baseline, reparse(json)) ? 'opens' : 'changes';
    } catch {
      return 'changes';
    }
  };
  const doors: Door[] = [];
  for (const c of def.controls) {
    if (c.ui || (only && !only.has(c.id))) continue;
    const cur = world.values[c.id];
    const looksOff =
      c.kind === 'bool'
        ? cur === false
        : c.kind === 'cont'
          ? cur === c.min || cur === 0
          : /^(off|none|0|false)$/i.test(String(cur)) ||
            /^off$/i.test((c.options.find((o) => o.v === cur)?.label || '').trim());
    const found: Door[] = [];
    for (const d of openings(c, cur)) {
      const k = kind(d);
      if (k === 'opens') found.push(d);
      else if (k === 'same' && latent && latent.has(c.id) && looksOff)
        found.push({ ...d, latent: true });
    }
    found.slice(0, 5).forEach((d) => doors.push(d));
  }
  if (world.wheel < 0.5 && (!only || only.has(WHEEL)) && kind({ id: WHEEL }) !== 'changes')
    doors.push({ id: WHEEL });
  return doors;
}

/** One big move of a dead control, to see whether it can be heard once a door is open. */
function bigMove(c: Control, cur: ControlValue | undefined): ControlValue {
  if (c.kind === 'bool') return !cur;
  if (c.kind === 'enum') {
    const o = c.options.map((x) => x.v);
    return o[o.length - 1] !== cur ? o[o.length - 1] : o[0];
  }
  const n = Number(cur);
  return c.max - n >= n - c.min ? c.max : c.min;
}

/**
 * Jobs asking "with this combination of doors open, can this dead control be heard?", for each dead control its
 * nearest combinations first, up to `budget`. A combination that cannot matter to a control (the same EngineParams
 * either way) costs nothing. The list comes back interleaved: every control's first try, then every second try…
 */
function doorJobs(
  def: SynthDef,
  world: World,
  cables: CableLike[],
  deadIds: string[],
  combos: DoorCombo[],
  budget: number
): DoorJob[] {
  const make = engineFor(def);
  const cm: Record<string, Control | undefined> = Object.fromEntries(
    def.controls.map((c) => [c.id, c])
  );
  const areaOf = (p: { x: number; y: number }) =>
    (def.areas || []).find((a) =>
      a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
    );
  const far = (a: Control | undefined, b: Control | undefined) =>
    !a || !b ? 0 : Math.hypot(a.x - b.x, a.y - b.y) * (areaOf(a) === areaOf(b) ? 0.5 : 1);
  const bases = combos
    .map((combo) => {
      const w = applyDoors(world, combo);
      try {
        return {
          combo,
          w,
          json: JSON.stringify(make(w.values, cables, w.wheel)),
          key: doorKey(combo),
        };
      } catch {
        return null;
      }
    })
    .filter((b): b is NonNullable<typeof b> => !!b);
  const perControl = deadIds.map((id) => {
    const c = cm[id];
    if (!c) return [];
    const list = bases
      .filter((b) => !b.combo.some((d) => d.id === id))
      .map((b) => ({ b, dist: b.combo.reduce((sum, d) => sum + far(c, cm[d.id]), 0) }))
      .sort((x, y) => (x.b.combo.tier || 0) - (y.b.combo.tier || 0) || x.dist - y.dist);
    const jobs: DoorJob[] = [];
    for (const { b } of list) {
      if (jobs.length >= budget) break;
      let json: string;
      try {
        json = JSON.stringify(
          make({ ...b.w.values, [id]: bigMove(c, world.values[id]) }, cables, b.w.wheel)
        );
      } catch {
        continue;
      }
      if (json !== b.json)
        jobs.push({
          key: `${id}|${b.key}`,
          dead: id,
          combo: b.combo,
          rank: jobs.length,
          short: true,
          baseKey: b.key,
          base: reparse(b.json),
          nudges: [],
          far: [reparse(json)],
        });
    }
    return jobs;
  });
  const out: DoorJob[] = [];
  for (let rank = 0; rank < budget; rank++)
    perControl.forEach((jobs) => {
      if (jobs[rank]) out.push(jobs[rank]);
    });
  return out;
}

/** The control states the sound map draws. */
export type ControlState = 'on' | 'zero' | 'dead';

/**
 * The two rounds of the search, as job lists. Each result says `live` for one (dead control, door combination) pair.
 * `ids` = the dead controls to explain (default: all of them; the app asks for one at a time, when it is pointed at).
 */
export function doorSearch(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[],
  wheel: number,
  state: Record<string, ControlState | undefined>,
  ids?: string[]
): {
  dead: string[];
  firstRound: () => DoorJob[];
  secondRound: (unexplained: string[]) => DoorJob[];
} {
  const world: World = { values, wheel };
  const latent = new Set(def.controls.filter((c) => state[c.id] === 'dead').map((c) => c.id));
  const dead = ids || [...latent];
  let singles: Door[] = [];
  return {
    dead,
    firstRound() {
      singles = doorsOf(def, world, cables, { latent });
      return doorJobs(
        def,
        world,
        cables,
        dead,
        singles.map((d) => [d]),
        SINGLE_BUDGET
      );
    },
    secondRound(unexplained) {
      if (!unexplained.length) return [];
      const known = new Set(singles.filter((d) => !d.latent).map((d) => d.id)); // already tried alone
      const only = new Set([...latent, WHEEL]); // a door behind a door is itself a dead control (or the wheel)
      const seen = new Set<string>();
      const combos: DoorCombo[] = [];
      for (const first of singles) {
        let behind: Door[] = [];
        try {
          behind = doorsOf(def, applyDoors(world, [first]), cables, { only });
        } catch {
          /* this door cannot be opened */
        }
        for (const second of behind) {
          if (second.id === first.id || known.has(second.id)) continue;
          const key = doorKey([first, second]);
          if (!seen.has(key)) {
            seen.add(key);
            combos.push([first, second]);
          }
        }
      }
      // Then pairs of doors that each failed alone but sit close together (an oscillator's mix knob AND its wave
      // knob). At least one of the two has to be dead itself, or each would already have worked alone.
      const cm: Record<string, Control | undefined> = Object.fromEntries(
        def.controls.map((c) => [c.id, c])
      );
      const near = (a: Door, b: Door) => {
        if (a.id === WHEEL || b.id === WHEEL) return true;
        const ca = cm[a.id];
        const cb = cm[b.id];
        return !!ca && !!cb && Math.hypot(ca.x - cb.x, ca.y - cb.y) < def.view.w * 0.2;
      };
      const firstTwo = singles.filter(
        (d, i) => singles.filter((x, k) => k < i && x.id === d.id).length < 2
      );
      for (let i = 0; i < firstTwo.length; i++) {
        for (let k = i + 1; k < firstTwo.length; k++) {
          const [a, b] = [firstTwo[i], firstTwo[k]];
          if (a.id === b.id || !(latent.has(a.id) || latent.has(b.id)) || !near(a, b)) continue;
          const key = doorKey([a, b]);
          if (!seen.has(key)) {
            seen.add(key);
            combos.push(Object.assign([a, b], { tier: 1 }));
          }
        }
      }
      return doorJobs(def, world, cables, unexplained, combos, PAIR_BUDGET);
    },
  };
}

/** What the panel draws for one analysis. */
export interface SoundMap {
  state: Record<string, ControlState>;
  /** 0..1, knobs and sliders only. */
  heat: Record<string, number>;
  /** Knobs and sliders, most sensitive first. */
  ranked: string[];
  zero: Record<string, boolean | undefined>;
}

/** Probe results → what the panel draws. `heat` is 0..1 for knobs and sliders only; switches are just in or out. */
export function summarise(
  def: SynthDef,
  jobs: ProbeJob[],
  results: ProbeResult[],
  inert: string[]
): SoundMap {
  const state: Record<string, ControlState> = {}; // id → 'on' | 'zero' | 'dead'
  const raw: Record<string, number | undefined> = {};
  const zero: Record<string, boolean | undefined> = Object.fromEntries(
    jobs.map((j) => [j.key, j.zero])
  );
  inert.forEach((k) => {
    state[k] = 'dead';
  });
  results.forEach((r) => {
    state[r.key] = !r.live ? 'dead' : zero[r.key] ? 'zero' : 'on';
    raw[r.key] = r.d;
  });
  const sens = (id: string) => raw[id] ?? NaN;
  const cont = def.controls.filter(
    (c) => c.kind === 'cont' && state[c.id] !== 'dead' && sens(c.id) >= 0.25
  );
  // Against the most sensitive knob in this sound, on a log scale so one pitch knob does not flatten the rest.
  // A sound where nothing moves much shows nothing as hot.
  const top = Math.max(2, ...cont.map((c) => sens(c.id)));
  const heat: Record<string, number> = {};
  cont.forEach((c) => {
    heat[c.id] = Math.log(1 + sens(c.id)) / Math.log(1 + top);
  });
  const ranked = cont.sort((a, b) => sens(b.id) - sens(a.id)).map((c) => c.id);
  return { state, heat, ranked, zero };
}

// ── running it ──────────────────────────────────────────────────────────────
// A few Workers share the jobs (a 2600 panel is about 200 renderings). If the host page blocks Workers, the same
// probe runs here on the main thread, one job per tick. One analysis = one session: the workers hold its baseline,
// and the "why is it dark?" questions that follow are more jobs for the same session, one question at a time.
const POOL = Math.max(
  1,
  Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1)
);

type Probe = ReturnType<typeof createProbe>;
type OnResult = (r: ProbeResult, job: ProbeJob) => void;

interface Session {
  id: number;
  def: SynthDef;
  values: ControlValues;
  cables: CableLike[];
  wheel: number;
  notes: [number, number];
  baseline: EngineParams;
  queue: ProbeJob[];
  idle: Worker[];
  inflight: Map<Worker, ProbeJob>;
  asked: Set<string>;
  state: Record<string, ControlState> | null;
  mode?: 'pool' | 'main';
  answered?: boolean;
  ticking?: boolean;
  probe?: Probe;
  onResult?: OnResult;
  stale?: (job: ProbeJob) => boolean;
  resolve?: (() => void) | null;
  tail?: Promise<void>;
}

/** A message from the probe worker, read defensively: it crosses a thread boundary. */
interface WorkerMessage {
  type: string;
  run: number;
  result?: ProbeResult;
}
const isWorkerMessage = (x: unknown): x is WorkerMessage =>
  isObj(x) && typeof x.type === 'string' && typeof x.run === 'number';
const isProbeResult = (x: unknown): x is ProbeResult =>
  isObj(x) && typeof x.key === 'string' && typeof x.live === 'boolean';

/** The sound-map runner the panel drives. */
export interface Mapper {
  analyse(
    def: SynthDef,
    values: ControlValues,
    cables: CableLike[],
    wheel: number,
    notes: [number, number],
    onProgress: (fraction: number) => void,
    onDone: (map: SoundMap) => void
  ): void;
  explain(controlId: string, onDone: (id: string, combos: DoorCombo[]) => void): void;
  cancel(): void;
  dispose(): void;
}

export function createMapper(): Mapper {
  let workers: Worker[] | null = null; // null = not tried, [] = blocked
  // One wait per pool, started when it spawns and cleared by the first message from any worker, for any run. Not one
  // per analysis: a user who keeps changing the panel would restart that forever on a host that blocks workers
  // silently, and an answer for a superseded run still proves the pool works.
  let poolTimer: ReturnType<typeof setTimeout> | undefined;
  let proven = false;
  let run = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let session: Session | null = null;

  const spawn = (): Worker[] => {
    if (workers) return workers;
    const pool: Worker[] = [];
    workers = pool;
    proven = false;
    try {
      for (let i = 0; i < POOL; i++) pool.push(new Worker(PROBE_WORKER_URL));
    } catch (err) {
      logger.warn('Sound-map workers blocked; probing on the main thread', {
        url: PROBE_WORKER_URL,
        error: err instanceof Error ? err.message : String(err),
      });
      pool.forEach((w) => w.terminate());
      workers = [];
    }
    if (workers.length) poolTimer = setTimeout(silentPool, WORKER_TIMEOUT_MS);
    return workers;
  };

  const endPhase = (sess: Session) => {
    const done = sess.resolve;
    sess.resolve = null;
    if (done) done();
  };

  /** Hand out jobs until the queue is empty. Jobs the phase calls stale (the question is already answered) are dropped unrendered. */
  function pump(sess: Session) {
    if (sess.id !== run) return;
    const next = () => {
      while (sess.queue.length) {
        const job = sess.queue.shift();
        if (job && (!sess.stale || !sess.stale(job))) return job;
      }
      return null;
    };
    if (sess.mode === 'pool') {
      while (sess.idle.length) {
        const job = next();
        if (!job) break;
        const w = sess.idle.pop();
        if (!w) break;
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
        if (sess.queue.length) timer = setTimeout(tick, 4);
        else {
          sess.ticking = false;
          endPhase(sess);
        }
      };
      timer = setTimeout(tick, 4);
    }
  }

  // Workers that never answer (or fail to load) are blocked by the host: stop using them for good.
  function fallBack(sess: Session, error?: string) {
    if (sess.answered || sess.mode !== 'pool' || sess.id !== run) return;
    logger.warn('Sound-map workers failed; probing on the main thread', {
      url: PROBE_WORKER_URL,
      error,
    });
    dropPool();
    sess.mode = 'main';
    sess.queue.unshift(...sess.inflight.values());
    sess.inflight.clear();
    pump(sess);
  }

  function dropPool() {
    clearTimeout(poolTimer);
    (workers || []).forEach((w) => w.terminate());
    workers = [];
  }

  // The pool's wait ran out with no worker answering: blocked by the host. Move whatever session is waiting on it.
  function silentPool() {
    if (proven || !workers?.length) return;
    logger.warn('Sound-map workers did not answer; probing on the main thread', {
      url: PROBE_WORKER_URL,
    });
    dropPool();
    const sess = session;
    if (!sess || sess.mode !== 'pool' || sess.id !== run) return;
    sess.mode = 'main';
    sess.queue.unshift(...sess.inflight.values());
    sess.inflight.clear();
    pump(sess);
  }

  function open(sess: Session) {
    const pool = spawn();
    if (!pool.length) {
      sess.mode = 'main';
      return;
    }
    sess.mode = 'pool';
    pool.forEach((w) => {
      w.onerror = (e: ErrorEvent) => fallBack(sess, e.message || 'worker error');
      w.onmessage = (m: MessageEvent<unknown>) => {
        const data = m.data;
        if (!isWorkerMessage(data)) return;
        if (!proven) {
          proven = true;
          clearTimeout(poolTimer);
        }
        if (data.run !== sess.id || sess.id !== run) return;
        sess.answered = true;
        if (data.type === 'result') {
          const job = sess.inflight.get(w);
          sess.inflight.delete(w);
          if (sess.onResult && job && isProbeResult(data.result)) sess.onResult(data.result, job);
        }
        sess.idle.push(w);
        pump(sess);
      };
      w.postMessage({ type: 'start', run: sess.id, baseline: sess.baseline, notes: sess.notes });
    });
  }

  const phase = (
    sess: Session,
    jobs: ProbeJob[],
    onResult: OnResult,
    stale?: (job: ProbeJob) => boolean
  ) =>
    new Promise<void>((resolve) => {
      if (sess.id !== run || !jobs.length) {
        resolve();
        return;
      }
      Object.assign(sess, { queue: jobs.slice(), onResult, stale, resolve });
      pump(sess);
    });

  const close = () => {
    run++;
    clearTimeout(timer);
    if (session) endPhase(session);
    session = null;
  };

  return {
    /** Analyse one panel state. Calling it again (or `cancel`) drops whatever is still running. */
    analyse(def, values, cables, wheel, notes, onProgress, onDone) {
      close();
      const id = run;
      const { baseline, jobs, inert } = buildJobs(def, values, cables, wheel);
      const sess: Session = {
        id,
        def,
        values,
        cables,
        wheel,
        notes,
        baseline,
        queue: [],
        idle: [],
        inflight: new Map(),
        asked: new Set(),
        state: null,
      };
      session = sess;
      open(sess);
      const results: ProbeResult[] = [];
      sess.tail = phase(sess, jobs, (r) => {
        results.push(r);
        onProgress(results.length / jobs.length);
      }).then(() => {
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
      if (
        !sess ||
        sess.id !== run ||
        !sess.state ||
        sess.state[controlId] !== 'dead' ||
        sess.asked.has(controlId)
      )
        return;
      const state = sess.state;
      sess.asked.add(controlId);
      sess.tail = (sess.tail ?? Promise.resolve())
        .then(async () => {
          if (sess.id !== run) return;
          const search = doorSearch(sess.def, sess.values, sess.cables, sess.wheel, state, [
            controlId,
          ]);
          const found: DoorJob[] = [];
          const each = (r: ProbeResult, job: ProbeJob) => {
            if (r.live && job) found.push(job as DoorJob);
          };
          // Doors are tried nearest first; a little past the first answer is far enough to look for a second.
          const stale = (job: ProbeJob) =>
            found.length >= 2 ||
            (found.length > 0 && (job as DoorJob).rank > Math.min(...found.map((f) => f.rank)) + 4);
          await phase(sess, search.firstRound(), each, stale);
          if (!found.length) await phase(sess, search.secondRound([controlId]), each, stale);
          if (sess.id === run)
            onDone(
              controlId,
              found
                .sort((a, b) => a.rank - b.rank)
                .slice(0, 2)
                .map((f) => f.combo)
            );
        })
        .catch(() => {
          if (sess.id === run) onDone(controlId, []);
        });
    },
    cancel: close,
    dispose() {
      close();
      clearTimeout(poolTimer);
      (workers || []).forEach((w) => w.terminate());
      workers = null;
    },
  };
}
