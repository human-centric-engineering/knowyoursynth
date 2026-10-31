// @vitest-environment happy-dom

/**
 * The sound detector in the browser (`f-pattern-library` t-125): it asks the probe worker, reads its answer as the
 * endpoint will, and reads on the page's thread where the host blocks workers or the worker never answers.
 *
 * The worker is a fake that answers with the real detector, so the features are real either way.
 *
 * @see lib/app/patterns/suggest-detect.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKindReader, KIND_WORKER_TIMEOUT_MS } from '@/lib/app/patterns/suggest-detect';
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
});
