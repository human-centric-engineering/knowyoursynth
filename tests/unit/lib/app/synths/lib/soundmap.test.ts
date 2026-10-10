/**
 * Sound map tests: `onlyFromZero`/`probeNotes` (pure helpers), `buildJobs` (panel state → the probe's job list),
 * `doorSearch` (why a dead control is dark — first and second rounds), `summarise` (probe results → the panel's
 * heat/ranked/state) and `createMapper` (the runner: main-thread fallback, the Worker pool, progress, explain,
 * cancel/dispose).
 *
 * `@/lib/app/synths/audio/probe` is mocked throughout the `createMapper` tests — `createProbe` is the only thing
 * soundmap reads from it, and the real DSP it wraps has its own test. `buildJobs`, `doorSearch` and `summarise`
 * are pure (no probe involved) and run unmocked.
 *
 * @see lib/app/synths/lib/soundmap.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildJobs,
  createMapper,
  doorSearch,
  NUDGE,
  onlyFromZero,
  probeNotes,
  PROBE_WORKER_URL,
  summarise,
  WHEEL,
  WORKER_TIMEOUT_MS,
  type DoorJob,
  type ProbeResult,
} from '@/lib/app/synths/lib/soundmap';
import { makeMiniD, miniToEngine } from '@/tests/fixtures/synths/mini-d';
import { logger } from '@/lib/logging';
import type { ControlState } from '@/lib/app/synths/lib/soundmap';
import type { ControlValues, EngineContext } from '@/lib/app/synths/contract';
import type {
  ProbeJob as RealProbeJob,
  ProbeResult as RealProbeResult,
} from '@/lib/app/synths/audio/probe';

vi.mock('@/lib/app/synths/audio/probe', () => ({
  PROBE_WORKER_URL: '/worklets/kys-probe.js',
  createProbe: vi.fn(),
}));

describe('constants', () => {
  it('re-exports the probe worker URL, and keeps the nudge fraction and wheel key stable', () => {
    expect(PROBE_WORKER_URL).toBe('/worklets/kys-probe.js');
    expect(NUDGE).toBe(0.05);
    expect(WHEEL).toBe('@wheel');
  });
});

describe('onlyFromZero', () => {
  it('is true when the differing leaf is zero, false or absent in a', () => {
    expect(onlyFromZero(0, 5)).toBe(true);
    expect(onlyFromZero({ x: 0 }, { x: 5 })).toBe(true);
    expect(onlyFromZero(undefined, { x: 1 })).toBe(true);
    expect(onlyFromZero(false, true)).toBe(true);
  });

  it('is false when a already holds a real value', () => {
    expect(onlyFromZero(5, 0)).toBe(false);
    expect(onlyFromZero({ x: 5 }, { x: 0 })).toBe(false);
    expect(onlyFromZero({ x: 1 }, undefined)).toBe(false);
  });

  it('is true for identical values, including matching objects key by key', () => {
    expect(onlyFromZero(3, 3)).toBe(true);
    expect(onlyFromZero({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });
});

describe('probeNotes', () => {
  it('falls back to C3 and a fifth above when there is no preset', () => {
    expect(probeNotes(null)).toEqual([48, 55]);
    expect(probeNotes(undefined)).toEqual([48, 55]);
  });

  it('plays the first step and the first step that differs from it', () => {
    expect(
      probeNotes({
        phrase: {
          bpm: 120,
          loop: true,
          steps: [
            [0, 60, 1],
            [0.25, 60, 1],
            [0.5, 64, 1],
          ],
        },
      })
    ).toEqual([60, 64]);
  });

  it('plays a fifth above the first note when every step repeats it', () => {
    expect(probeNotes({ phrase: { bpm: 120, loop: true, steps: [[0, 60, 1]] } })).toEqual([60, 67]);
  });
});

describe('buildJobs', () => {
  const def = makeMiniD();

  it('leaves the ui control out of both the jobs and the inert list', () => {
    const { jobs, inert } = buildJobs(def, def.init, [], 0);

    expect(jobs.find((j) => j.key === 'view.help')).toBeUndefined();
    expect(inert).not.toContain('view.help');
  });

  it('gives a muted level knob a job with zero: true, and leaves its mutually-gated partner inert', () => {
    const { jobs, inert } = buildJobs(def, def.init, [], 0);

    const mixOsc2 = jobs.find((j) => j.key === 'mix.osc2');
    expect(mixOsc2?.zero).toBe(true);
    // mod.depth and mod.toOsc each gate the other (routes only fire when BOTH are set), so moving either alone
    // at the default panel changes nothing in the engine params at all — not even a "from zero" job.
    expect(inert).toEqual(expect.arrayContaining(['mod.depth', 'mod.toOsc']));
  });

  it('never marks a many-position switch as zero, even when every move starts something from nothing', () => {
    // osc2.wave only reaches the mixer once mix.osc2 is raised, but it is an enum, and the comment on buildJobs is
    // explicit that an enum's "it happens to read as 0" is still a real choice, not a dormant one.
    const { jobs } = buildJobs(def, def.init, [], 0);

    const osc2Wave = jobs.find((j) => j.key === 'osc2.wave');
    expect(osc2Wave).toBeDefined();
    expect(osc2Wave?.zero).toBe(false);
  });

  it('keys a cable job "from>to" and gives it the engine params with that cable removed', () => {
    const { jobs } = buildJobs(def, def.init, [{ from: 'lfo.tri', to: 'cutoff.in' }], 0);

    const cableJob = jobs.find((j) => j.key === 'lfo.tri>cutoff.in');
    expect(cableJob).toBeDefined();
    expect(cableJob?.nudges).toEqual([]);
    expect(cableJob?.far).toHaveLength(1);
    // with the cable pulled, nothing feeds `pitchAll`/`cutoff` from the LFO any more
    expect(cableJob?.far[0].cables).toEqual([]);
  });

  it('gives a continuous control both near nudges and far ends to try', () => {
    const { jobs } = buildJobs(def, def.init, [], 0);

    const cutoff = jobs.find((j) => j.key === 'filter.cutoff');
    expect(cutoff?.nudges.length).toBeGreaterThan(0);
    expect(cutoff?.far.length).toBeGreaterThan(0);
    expect(cutoff?.zero).toBe(false); // the filter always has a real cutoff; it is never "off"
  });
});

describe('doorSearch', () => {
  const def = makeMiniD();
  const allOn: Record<string, ControlState> = Object.fromEntries(
    def.controls.map((c) => [c.id, 'on'])
  );

  it('first round: finds a latent door for a control that is dead only because its partner is off', () => {
    // mod.depth is dark at the default panel because mod.toOsc is off; opening mod.toOsc alone changes nothing
    // either (depth is still 0) — "same", but mod.toOsc is marked dead/latent, and looks off (it is a false
    // bool), so doorsOf keeps it as a candidate single door for mod.depth.
    const state: Record<string, ControlState> = {
      ...allOn,
      'mod.depth': 'dead',
      'mod.toOsc': 'dead',
    };
    const search = doorSearch(def, def.init, [], 0, state, ['mod.depth']);

    const found = search.firstRound();

    expect(found).toHaveLength(1);
    expect(found[0].dead).toBe('mod.depth');
    expect(found[0].combo).toEqual([{ id: 'mod.toOsc', v: true, latent: true }]);
    // the raised depth plus the opened switch together produce a real routing that was not there before
    expect(found[0].far[0].routes).toEqual([{ src: 'lfoTri', dst: 'pitchAll', amt: 2 }]);
    expect(found[0].base.routes).toEqual([]);
  });

  it('defaults `dead` to every control the caller marked dead, when no explicit id list is given', () => {
    const state: Record<string, ControlState> = {
      ...allOn,
      'mod.depth': 'dead',
      'mod.toOsc': 'dead',
    };
    const search = doorSearch(def, def.init, [], 0, state);

    expect(search.dead.sort()).toEqual(['mod.depth', 'mod.toOsc']);
  });

  it('second round: returns nothing once the caller says everything is already explained', () => {
    const state: Record<string, ControlState> = {
      ...allOn,
      'mod.depth': 'dead',
      'mod.toOsc': 'dead',
    };
    const search = doorSearch(def, def.init, [], 0, state, ['mod.depth']);
    search.firstRound();

    expect(search.secondRound([])).toEqual([]);
  });

  it('second round: finds a door behind a door when two controls must open together', () => {
    // A contrived gate (not mini-d's real engine): env1's attack only reaches the engine once BOTH
    // filter.emphasis and filter.contour are raised above zero — a pair neither single door can open alone, which
    // only the second round's door-behind-a-door search (or its near-pair fallback) can find.
    const gatedDef = makeMiniD({
      toEngine: (v: ControlValues, _ctx: EngineContext) => {
        const p = miniToEngine(v);
        const open = Number(v['filter.emphasis']) > 0 && Number(v['filter.contour']) > 0;
        return { ...p, env1: { ...p.env1, a: open ? Number(v['env1.attack']) / 10 : 0.003 } };
      },
    });
    const state: Record<string, ControlState> = {
      ...allOn,
      'filter.emphasis': 'dead',
      'filter.contour': 'dead',
      'env1.attack': 'dead',
    };
    const search = doorSearch(gatedDef, gatedDef.init, [], 0, state, ['env1.attack']);

    const first = search.firstRound();
    expect(first.filter((j) => j.dead === 'env1.attack')).toEqual([]); // neither door alone opens it

    const second = search.secondRound(['env1.attack']);
    expect(second).toHaveLength(1);
    expect(second[0].dead).toBe('env1.attack');
    expect(second[0].combo.map((d) => d.id).sort()).toEqual(['filter.contour', 'filter.emphasis']);
  });
});

describe('summarise', () => {
  const def = makeMiniD();

  it('marks an inert control dead, and a live result dead/zero/on from its job and liveness', () => {
    const { jobs, inert } = buildJobs(def, def.init, [], 0);
    const results: ProbeResult[] = jobs.map((j) =>
      j.key === 'osc2.detune'
        ? { key: j.key, live: false } // structurally a "from zero" job, but inaudible while osc 2 is muted
        : { key: j.key, live: true, d: 0.1 }
    );

    const map = summarise(def, jobs, results, inert);

    expect(map.state['mod.depth']).toBe('dead'); // from `inert`, never even probed
    expect(map.state['osc2.detune']).toBe('dead'); // probed, but not live
    expect(map.state['mix.osc2']).toBe('zero'); // live, and its job says zero: true
    expect(map.state['filter.cutoff']).toBe('on'); // live, and never "from zero"
  });

  it('heats continuous controls on a log scale against max(2, the top sensitivity), and ranks by sensitivity', () => {
    const { jobs, inert } = buildJobs(def, def.init, [], 0);
    const results: ProbeResult[] = jobs.map((j) => {
      if (j.key === 'filter.cutoff') return { key: j.key, live: true, d: 0.8 };
      if (j.key === 'out.volume') return { key: j.key, live: true, d: 0.4 };
      return { key: j.key, live: true, d: 0.1 }; // below the 0.25 sensitivity floor
    });

    const map = summarise(def, jobs, results, inert);

    // top = max(2, 0.8, 0.4, ...) = 2, since nothing here is hot enough to raise the ceiling
    expect(map.heat['filter.cutoff']).toBeCloseTo(Math.log(1.8) / Math.log(3), 10);
    expect(map.heat['out.volume']).toBeCloseTo(Math.log(1.4) / Math.log(3), 10);
    // below the 0.25 floor: left out of heat and ranked entirely, not just zeroed
    expect(map.heat).not.toHaveProperty('env1.attack');
    expect(map.ranked).toEqual(['filter.cutoff', 'out.volume']);
  });

  it('raises the heat ceiling once a knob is more than twice as sensitive as the floor', () => {
    const { jobs, inert } = buildJobs(def, def.init, [], 0);
    const results: ProbeResult[] = jobs.map((j) =>
      j.key === 'filter.cutoff'
        ? { key: j.key, live: true, d: 5 }
        : { key: j.key, live: true, d: 0.1 }
    );

    const map = summarise(def, jobs, results, inert);

    expect(map.ranked).toEqual(['filter.cutoff']);
    expect(map.heat['filter.cutoff']).toBeCloseTo(1, 10); // the top knob is always heat 1 against its own ceiling
  });
});

describe('createMapper', () => {
  // Typed against the real probe module's (looser) ProbeJob/ProbeResult, since that is the shape `createProbe`'s
  // mocked return value must satisfy — soundmap hands this `measure` its own, stricter ProbeJob/DoorJob at
  // runtime, which is a structurally compatible superset.
  const measure = (job: RealProbeJob): RealProbeResult => {
    if (job.key === 'osc2.detune' || job.key === 'osc2.wave') {
      return { key: job.key, live: false }; // inaudible while osc 2 is muted, however the params differ on paper
    }
    const doorJob = job as unknown as Partial<DoorJob>;
    if (doorJob.dead) {
      const ids = (doorJob.combo || [])
        .map((d) => d.id)
        .sort()
        .join(',');
      return { key: job.key, live: ids === 'mod.toOsc' };
    }
    if (job.nudges?.length) return { key: job.key, live: true, d: 0.5 };
    if (job.far?.length) return { key: job.key, live: true, d: 0, far: 0.3 };
    return { key: job.key, live: false };
  };

  async function getCreateProbe() {
    const probeModule = await import('@/lib/app/synths/audio/probe');
    return vi.mocked(probeModule.createProbe);
  }

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { Worker?: unknown }).Worker;
  });

  it('runs on the main thread (Worker is undefined in node), reporting rising progress then a summarised map', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    const onProgress = vi.fn();
    const onDone = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], onProgress, onDone, vi.fn());
    await vi.advanceTimersByTimeAsync(4 * 40);

    expect(onDone).toHaveBeenCalledTimes(1);
    const map = onDone.mock.calls[0][0];
    expect(map.state['mix.osc2']).toBe('zero');
    expect(map.state['mod.depth']).toBe('dead');
    expect(map.state['osc2.detune']).toBe('dead');

    const fractions: number[] = onProgress.mock.calls.map((c) => c[0] as number);
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[fractions.length - 1]).toBe(1);
    for (let i = 1; i < fractions.length; i++)
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
  });

  it('explains a dead control by finding its door, once analysis has set the session state', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    mapper.analyse(
      def,
      def.init,
      [],
      0,
      [48, 55],
      () => {},
      () => {},
      vi.fn()
    );
    await vi.advanceTimersByTimeAsync(4 * 40);

    const onExplain = vi.fn();
    mapper.explain('mod.depth', onExplain);
    await vi.advanceTimersByTimeAsync(4 * 60);

    expect(onExplain).toHaveBeenCalledTimes(1);
    const [id, combos] = onExplain.mock.calls[0] as [string, { id: string }[][]];
    expect(id).toBe('mod.depth');
    expect(combos).toEqual([[{ id: 'mod.toOsc', v: true, latent: true }]]);
  });

  it('does nothing for a control that is not dead, and asks only once per control per analysis', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    mapper.analyse(
      def,
      def.init,
      [],
      0,
      [48, 55],
      () => {},
      () => {},
      vi.fn()
    );
    await vi.advanceTimersByTimeAsync(4 * 40);

    const onLive = vi.fn();
    mapper.explain('filter.cutoff', onLive); // state is 'on', not 'dead'
    await vi.advanceTimersByTimeAsync(4 * 10);
    expect(onLive).not.toHaveBeenCalled();

    const onDead = vi.fn();
    mapper.explain('mod.depth', onDead);
    await vi.advanceTimersByTimeAsync(4 * 60);
    mapper.explain('mod.depth', onDead); // already asked this analysis
    await vi.advanceTimersByTimeAsync(4 * 60);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('drops a stale run when analyse is called again before the first one finishes', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    const onDoneFirst = vi.fn();
    const onDoneSecond = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], () => {}, onDoneFirst, vi.fn());
    await vi.advanceTimersByTimeAsync(4); // let one tick of the first run fire
    mapper.analyse(def, def.init, [], 0, [48, 55], () => {}, onDoneSecond, vi.fn());
    await vi.advanceTimersByTimeAsync(4 * 60);

    expect(onDoneFirst).not.toHaveBeenCalled();
    expect(onDoneSecond).toHaveBeenCalledTimes(1);
  });

  it('cancel drops whatever analysis is running, so its onDone never fires', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    const onDone = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], () => {}, onDone, vi.fn());
    await vi.advanceTimersByTimeAsync(4);
    mapper.cancel();
    await vi.advanceTimersByTimeAsync(4 * 60);

    expect(onDone).not.toHaveBeenCalled();
  });

  it('dispose cancels and clears the worker pool, so explain is a no-op with no session left', () => {
    const mapper = createMapper();
    mapper.dispose();

    const onExplain = vi.fn();
    mapper.explain('mod.depth', onExplain);

    expect(onExplain).not.toHaveBeenCalled();
  });

  it('skips straight to onDone, with no progress calls, when there is nothing to probe', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    vi.useFakeTimers();
    const mapper = createMapper();
    // Every control reaches the engine in some way in mini-d, so force an empty job list the simple way: a
    // definition with no non-ui controls and no cables at all.
    const def = makeMiniD({ controls: [] });
    const onProgress = vi.fn();
    const onDone = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], onProgress, onDone, vi.fn());
    await vi.advanceTimersByTimeAsync(4 * 5);

    expect(onProgress).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].state).toEqual({});
  });

  it('waits out slow-loading workers, then falls back to the main thread and says so', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    class SilentWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage(): void {}
    }
    (globalThis as { Worker?: unknown }).Worker = SilentWorker;
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    const onDone = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), onDone, vi.fn());
    // The prototype's 2.5 s, sized for Blob-URL workers, is no longer enough for a network fetch.
    await vi.advanceTimersByTimeAsync(3000);
    expect(onDone).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS - 3000 + 4 * 40);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('did not answer'),
      expect.objectContaining({ url: PROBE_WORKER_URL })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('counts the wait from the pool spawning, so repeated analyses on a silent host still fall back', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    class SilentWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage(): void {}
    }
    (globalThis as { Worker?: unknown }).Worker = SilentWorker;
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();
    const onDone = vi.fn();

    // A user changing the panel every 4 s: each change starts a new analysis.
    for (let t = 0; t < WORKER_TIMEOUT_MS; t += 4000) {
      mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), onDone, vi.fn());
      await vi.advanceTimersByTimeAsync(4000);
    }
    await vi.advanceTimersByTimeAsync(4 * 40);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not answer'), expect.anything());
    expect(onDone).toHaveBeenCalled();
  });

  it('takes an answer for a cancelled run as proof the pool works, and keeps it past the deadline', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    // Workers that take 5 s to load, then answer every start, for whichever run it was.
    class SlowWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage(msg: { type: string; run: number }): void {
        if (msg.type === 'start')
          setTimeout(() => this.onmessage?.({ data: { type: 'ready', run: msg.run } }), 5000);
      }
    }
    (globalThis as { Worker?: unknown }).Worker = SlowWorker;
    vi.useFakeTimers();
    const mapper = createMapper();
    const def = makeMiniD();

    mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    mapper.cancel(); // the 5 s answer arrives for a run nobody is waiting on
    await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS * 6);
    mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(100);

    expect(warn).not.toHaveBeenCalled();
    mapper.dispose();
  });

  it('logs a worker that fails to load with its error, and one the host refuses to construct', async () => {
    vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    class BrokenWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: { message: string }) => void) | null = null;
      terminate = vi.fn();
      postMessage(): void {
        queueMicrotask(() => this.onerror?.({ message: 'Not found' }));
      }
    }
    (globalThis as { Worker?: unknown }).Worker = BrokenWorker;
    vi.useFakeTimers();
    const def = makeMiniD();
    createMapper().analyse(def, def.init, [], 0, [48, 55], vi.fn(), vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({ url: PROBE_WORKER_URL, error: 'Not found' })
    );

    warn.mockClear();
    (globalThis as { Worker?: unknown }).Worker = class {
      constructor() {
        throw new Error('blocked by CSP');
      }
    };
    createMapper().analyse(def, def.init, [], 0, [48, 55], vi.fn(), vi.fn(), vi.fn());
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('blocked'),
      expect.objectContaining({ error: 'blocked by CSP' })
    );
  });

  it('runs the Worker pool when a Worker constructor is available, falling back to it from the mocked main-thread probe', async () => {
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage(msg: { type: string; run: number; job?: RealProbeJob }): void {
        if (msg.type === 'start') {
          this.onmessage?.({ data: { type: 'ready', run: msg.run } });
        } else if (msg.type === 'job' && msg.job) {
          const job = msg.job;
          const live = Boolean(job.nudges?.length || job.far?.length);
          this.onmessage?.({
            data: {
              type: 'result',
              run: msg.run,
              result: { key: job.key, live, d: live ? 0.5 : undefined },
            },
          });
        }
      }
    }
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;

    const mapper = createMapper();
    const def = makeMiniD();
    const onDone = vi.fn();
    const onProgress = vi.fn();

    mapper.analyse(def, def.init, [], 0, [48, 55], onProgress, onDone, vi.fn());
    // the whole pool exchange above is synchronous Worker↔mapper messaging; only the final phase→analyse
    // continuation is a microtask away.
    await Promise.resolve();
    await Promise.resolve();

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalled();
    const map = onDone.mock.calls[0][0];
    expect(map.state['mod.depth']).toBe('dead');
    expect(map.state['filter.cutoff']).toBe('on');
  });

  describe('when an analysis throws part-way', () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    beforeEach(() => {
      unhandled.length = 0;
      process.on('unhandledRejection', onUnhandled);
    });
    afterEach(() => {
      process.off('unhandledRejection', onUnhandled);
    });

    it('ends a main-thread analysis with onError, logged, and never onDone', async () => {
      let n = 0;
      const throwing = (job: RealProbeJob): RealProbeResult => {
        if (++n === 3) throw new Error('render blew up');
        return measure(job);
      };
      vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure: throwing });
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
      vi.useFakeTimers();
      const mapper = createMapper();
      const def = makeMiniD();
      const onDone = vi.fn();
      const onError = vi.fn();

      mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), onDone, onError);
      await vi.advanceTimersByTimeAsync(4 * 40);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toEqual(new Error('render blew up'));
      expect(onDone).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        'Sound-map analysis failed',
        expect.objectContaining({ synth: def.id, error: 'render blew up' })
      );
      // It stopped there: no more jobs were measured after the throw.
      expect(n).toBe(3);
      await Promise.resolve();
      expect(unhandled).toEqual([]);
      error.mockRestore();
    });

    it('ends a pooled analysis with onError when handling a worker reply throws', async () => {
      class ReplyingWorker {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        onerror: (() => void) | null = null;
        terminate = vi.fn();
        postMessage(msg: { type: string; run: number; job?: RealProbeJob }): void {
          if (msg.type === 'start') this.onmessage?.({ data: { type: 'ready', run: msg.run } });
          else if (msg.type === 'job' && msg.job)
            this.onmessage?.({ data: { type: 'result', run: msg.run, result: measure(msg.job) } });
        }
      }
      (globalThis as { Worker?: unknown }).Worker = ReplyingWorker;
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const mapper = createMapper();
      const def = makeMiniD();
      const onDone = vi.fn();
      const onError = vi.fn();
      const onProgress = vi.fn(() => {
        throw new Error('progress handler broke');
      });

      mapper.analyse(def, def.init, [], 0, [48, 55], onProgress, onDone, onError);
      await Promise.resolve();
      await Promise.resolve();

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onDone).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        'Sound-map analysis failed',
        expect.objectContaining({ error: 'progress handler broke' })
      );
      expect(unhandled).toEqual([]);
      mapper.dispose();
      error.mockRestore();
    });

    it('does not report a throw from the caller’s own onDone as a failed analysis', async () => {
      vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure });
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
      vi.useFakeTimers();
      const mapper = createMapper();
      const def = makeMiniD();
      const onError = vi.fn();
      const onDone = vi.fn(() => {
        throw new Error('caller broke');
      });

      mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), onDone, onError);
      await vi.advanceTimersByTimeAsync(4 * 40);

      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      // The caller's bug is left loud, as an unhandled rejection, rather than swallowed.
      await Promise.resolve();
      expect(unhandled).toEqual([new Error('caller broke')]);
      error.mockRestore();
    });

    it('answers an explanation that throws with no ways in, and logs it', async () => {
      let explaining = false;
      const throwing = (job: RealProbeJob): RealProbeResult => {
        if (explaining) throw new Error('door render blew up');
        return measure(job);
      };
      vi.mocked(await getCreateProbe()).mockReturnValue({ rms: 0, measure: throwing });
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
      vi.useFakeTimers();
      const mapper = createMapper();
      const def = makeMiniD();
      const onDone = vi.fn();
      mapper.analyse(def, def.init, [], 0, [48, 55], vi.fn(), onDone, vi.fn());
      await vi.advanceTimersByTimeAsync(4 * 40);
      expect(onDone).toHaveBeenCalledTimes(1);

      explaining = true;
      const onExplain = vi.fn();
      mapper.explain('mod.depth', onExplain);
      await vi.advanceTimersByTimeAsync(4 * 60);

      expect(onExplain).toHaveBeenCalledWith('mod.depth', []);
      expect(error).toHaveBeenCalledWith(
        'Sound-map explanation failed',
        expect.objectContaining({ control: 'mod.depth', error: 'door render blew up' })
      );
      expect(unhandled).toEqual([]);
      error.mockRestore();
    });
  });
});
