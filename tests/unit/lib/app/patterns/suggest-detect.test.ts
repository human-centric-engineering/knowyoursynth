// @vitest-environment happy-dom

/**
 * The sound detector in the browser (`f-pattern-library` t-125): it asks the probe worker, reads its answer as the
 * endpoint will, and reads on the page's thread where the host blocks workers or the worker never answers.
 *
 * The worker is a fake that answers with the real detector, so the features are real either way.
 *
 * @see lib/app/patterns/suggest-detect.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createKindReader,
  createPatchReadings,
  KIND_WORKER_TIMEOUT_MS,
  ReadSkipped,
  samePanel,
  type KindReader,
} from '@/lib/app/patterns/suggest-detect';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { ProbeWorkerRequest } from '@/lib/app/synths/audio/probe';
import { soundFeatures } from '@/lib/app/synths/lib/soundkind';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

const mockLog = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

const PATCH = monoParams();
const FEATURES = soundFeatures(PATCH);

/** How the fake worker behaves: answer properly, send nonsense, or never answer. */
let mode: 'answer' | 'nonsense' | 'silent' = 'answer';
const sent: ProbeWorkerRequest[] = [];
const workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((m: MessageEvent<unknown>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(readonly url: string) {
    workers.push(this);
  }
  postMessage(msg: ProbeWorkerRequest) {
    sent.push(msg);
    if (msg.type !== 'kind' || mode === 'silent') return;
    const features = mode === 'answer' ? soundFeatures(msg.params) : { attack: 'soon' };
    setTimeout(() =>
      this.onmessage?.({ data: { type: 'kind', id: msg.id, features } } as MessageEvent)
    );
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mode = 'answer';
  sent.length = 0;
  workers.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createKindReader', () => {
  it('asks the probe worker, one worker for every reading, and returns what it heard', async () => {
    const reader = createKindReader();
    expect(await reader.read(PATCH)).toEqual(FEATURES);
    expect(await reader.read(PATCH)).toEqual(FEATURES);
    expect(workers).toHaveLength(1);
    expect(workers[0].url).toBe('/worklets/kys-probe.js');
    expect(sent.map((m) => m.type)).toEqual(['kind', 'kind']);
    reader.dispose();
    expect(workers[0].terminated).toBe(true);
  });

  it('refuses an answer that is not a reading', async () => {
    mode = 'nonsense';
    await expect(createKindReader().read(PATCH)).rejects.toThrow('not a reading');
  });

  it('reads on the page’s thread where the host blocks workers', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked');
        }
      }
    );
    expect(await createKindReader().read(PATCH)).toEqual(FEATURES);
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Sound detector worker blocked; reading on the main thread',
      expect.objectContaining({ error: 'blocked' })
    );
  });

  it('gives up on a worker that never answers, and reads what was waiting on the page’s thread', async () => {
    vi.useFakeTimers();
    mode = 'silent';
    const reader = createKindReader();
    const reading = reader.read(PATCH);
    await vi.advanceTimersByTimeAsync(KIND_WORKER_TIMEOUT_MS + 10);
    expect(await reading).toEqual(FEATURES);
    expect(workers[0].terminated).toBe(true);
    // From then on it does not try the worker again.
    const again = reader.read(PATCH);
    await vi.advanceTimersByTimeAsync(10);
    expect(await again).toEqual(FEATURES);
    expect(sent).toHaveLength(1);
  });

  it('gives up on a worker that fails to load', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const reading = reader.read(PATCH);
    workers[0].onerror?.({ message: 'failed to load' } as ErrorEvent);
    expect(await reading).toEqual(FEATURES);
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Sound detector worker failed; reading on the main thread',
      expect.objectContaining({ error: 'failed to load' })
    );
  });

  it('ignores what is not a kind answer, and an answer nobody is waiting for', async () => {
    const reader = createKindReader();
    const reading = reader.read(PATCH);
    const w = workers[0];
    w.onmessage?.({ data: 'noise' } as MessageEvent);
    w.onmessage?.({ data: { type: 'result', id: 0 } } as MessageEvent);
    w.onmessage?.({ data: { type: 'kind', id: 99, features: FEATURES } } as MessageEvent);
    expect(await reading).toEqual(FEATURES);
  });

  it('names a load failure with no message as an error, and gives up only once', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const reading = reader.read(PATCH);
    workers[0].onerror?.({ message: '' } as ErrorEvent);
    workers[0].onerror?.({ message: 'again' } as ErrorEvent);
    expect(await reading).toEqual(FEATURES);
    const failed = mockLog.warn.mock.calls.filter(
      ([m]) => m === 'Sound detector worker failed; reading on the main thread'
    );
    expect(failed).toEqual([[expect.any(String), expect.objectContaining({ error: 'error' })]]);
  });

  it('rejects a reading that throws on the page’s thread', async () => {
    vi.stubGlobal('Worker', undefined);
    await expect(createKindReader().read(null as never)).rejects.toThrow();
  });

  it('gives up from the first unanswered reading, however many follow it', async () => {
    vi.useFakeTimers();
    mode = 'silent';
    const reader = createKindReader();
    const first = reader.read(PATCH);
    await vi.advanceTimersByTimeAsync(KIND_WORKER_TIMEOUT_MS - 1000);
    const second = reader.read(PATCH);
    await vi.advanceTimersByTimeAsync(1010);
    expect(workers[0].terminated).toBe(true);
    expect(await first).toEqual(FEATURES);
    expect(await second).toEqual(FEATURES);
  });

  it('rejects the readings still waiting when it is disposed', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const reading = reader.read(PATCH);
    reader.dispose();
    await expect(reading).rejects.toThrow('disposed');
  });
});

describe('one reading at a time (t-263)', () => {
  it('sends the next reading only once the one before it has answered', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const first = reader.read(PATCH);
    const second = reader.read(PATCH);
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    workers[0].onmessage?.({ data: { type: 'kind', id: 0, features: FEATURES } } as MessageEvent);
    expect(await first).toEqual(FEATURES);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    workers[0].onmessage?.({ data: { type: 'kind', id: 1, features: FEATURES } } as MessageEvent);
    expect(await second).toEqual(FEATURES);
  });

  it('skips a reading still waiting its turn once its signal is aborted', async () => {
    const reader = createKindReader();
    const ctl = new AbortController();
    const first = reader.read(PATCH);
    const second = reader.read(PATCH, { signal: ctl.signal });
    ctl.abort();
    expect(await first).toEqual(FEATURES);
    await expect(second).rejects.toEqual(new ReadSkipped('aborted'));
    expect(sent).toHaveLength(1);
  });

  it('knows a host blocks workers once warmed, before anything is read', () => {
    vi.stubGlobal('Worker', undefined);
    const reader = createKindReader();
    expect(reader.onPageThread).toBe(false);
    reader.warm();
    expect(reader.onPageThread).toBe(true);
  });

  it('starts its worker when warmed, and reads through that one', async () => {
    const reader = createKindReader();
    reader.warm();
    expect(workers).toHaveLength(1);
    expect(await reader.read(PATCH)).toEqual(FEATURES);
    expect(workers).toHaveLength(1);
  });

  it('skips background work rather than read it on the page’s thread', async () => {
    vi.stubGlobal('Worker', undefined);
    const reader = createKindReader();
    await expect(reader.read(PATCH, { background: true })).rejects.toBeInstanceOf(ReadSkipped);
    expect(reader.onPageThread).toBe(true);
    // what someone is waiting on is still read
    expect(await reader.read(PATCH)).toEqual(FEATURES);
  });

  it('skips background work waiting on a worker that gives up', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const reading = reader.read(PATCH, { background: true });
    workers[0].onerror?.({ message: 'failed to load' } as ErrorEvent);
    await expect(reading).rejects.toEqual(new ReadSkipped('page-thread'));
  });

  it('rejects what was waiting its turn when disposed, and reads in a new worker after', async () => {
    mode = 'silent';
    const reader = createKindReader();
    const first = reader.read(PATCH);
    const second = reader.read(PATCH);
    reader.dispose();
    await expect(first).rejects.toThrow('disposed');
    await expect(second).rejects.toThrow('disposed');
    mode = 'answer';
    expect(await reader.read(PATCH)).toEqual(FEATURES);
    expect(workers).toHaveLength(2);
    expect(reader.onPageThread).toBe(false);
  });
});

describe('createPatchReadings', () => {
  const def = getSynthDef('model-d');
  if (!def) throw new Error('model-d is not registered');
  beforeAll(async () => {
    await loadSynthDef('model-d');
  });
  const PANEL = { values: { ...def.init }, cables: [] };
  const fake = (): KindReader & { read: ReturnType<typeof vi.fn> } => ({
    read: vi.fn(async () => FEATURES),
    warm: vi.fn(),
    dispose: vi.fn(),
    onPageThread: false,
  });

  it('reads a panel once, whatever object holds the same values and cables', async () => {
    const reader = fake();
    const readings = createPatchReadings(reader);
    await readings.panel(def, PANEL);
    await readings.panel(def, { values: { ...def.init }, cables: [] });
    expect(reader.read).toHaveBeenCalledTimes(1);
    await readings.panel(def, { values: { ...def.init, 'filter.cutoff': 3 }, cables: [] });
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it('reads the start sound once per start, and works out its panel once', async () => {
    const reader = fake();
    const readings = createPatchReadings(reader);
    const panel = vi.fn(() => PANEL);
    const start = { slug: 'fat-bass', panel };
    await readings.start(def, start);
    await readings.start(def, start);
    expect(readings.startPanel(start)).toBe(PANEL);
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(panel).toHaveBeenCalledTimes(1);
  });

  it('tries a reading that failed again on the next ask', async () => {
    const reader = fake();
    reader.read.mockRejectedValueOnce(new Error('no audio'));
    const readings = createPatchReadings(reader);
    await expect(readings.panel(def, PANEL)).rejects.toThrow('no audio');
    expect(await readings.panel(def, PANEL)).toEqual(FEATURES);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it('reads again for a caller waiting on a reading someone else called off', async () => {
    const reader = fake();
    reader.read.mockRejectedValueOnce(new ReadSkipped('aborted'));
    const readings = createPatchReadings(reader);
    const ctl = new AbortController();
    const theirs = readings.panel(def, PANEL, { background: true, signal: ctl.signal });
    const mine = readings.panel(def, PANEL);
    ctl.abort();
    await expect(theirs).rejects.toBeInstanceOf(ReadSkipped);
    expect(await mine).toEqual(FEATURES);
  });

  it('lets the reader go, and forgets what it read', async () => {
    const reader = fake();
    const readings = createPatchReadings(reader);
    await readings.panel(def, PANEL);
    readings.dispose();
    expect(reader.dispose).toHaveBeenCalledTimes(1);
    await readings.panel(def, PANEL);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });
});

describe('samePanel', () => {
  it('compares values and cables, not the objects that hold them', () => {
    const cable = { from: 'a', to: 'b', color: 'red' };
    expect(
      samePanel({ values: { x: 1 }, cables: [cable] }, { values: { x: 1 }, cables: [{ ...cable }] })
    ).toBe(true);
    expect(samePanel({ values: { x: 1 }, cables: [] }, { values: { x: 2 }, cables: [] })).toBe(
      false
    );
    expect(
      samePanel({ values: { x: 1 }, cables: [] }, { values: { x: 1, y: 2 }, cables: [] })
    ).toBe(false);
    expect(samePanel({ values: { x: 1 }, cables: [] }, { values: { x: 1 }, cables: [cable] })).toBe(
      false
    );
  });
});
