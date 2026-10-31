/**
 * The two off-main-thread entry points, loaded into stand-in global scopes: the AudioWorklet processor registers
 * itself and renders the synth into its outputs, and the probe Worker answers jobs for the session it was started
 * with only.
 *
 * @see lib/app/synths/audio/worklet-entry.ts
 * @see lib/app/synths/audio/probe-worker-entry.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import type { SynthEvent } from '@/lib/app/synths/audio/dsp-core';
import type { ProbeWorkerReply, ProbeWorkerRequest } from '@/lib/app/synths/audio/probe';
import { soundFeatures } from '@/lib/app/synths/lib/soundkind';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worklet-entry', () => {
  interface Processor {
    port: {
      onmessage: ((m: { data: unknown }) => void) | null;
      postMessage: (e: SynthEvent) => void;
    };
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  }

  it('registers kys-voice, which takes messages from its port and renders the synth into every output channel', async () => {
    const posted: SynthEvent[] = [];
    class AudioWorkletProcessor {
      port = {
        onmessage: null as ((m: { data: unknown }) => void) | null,
        postMessage: (e: SynthEvent) => posted.push(e),
      };
    }
    const registered: [string, new () => Processor][] = [];
    vi.stubGlobal('AudioWorkletProcessor', AudioWorkletProcessor);
    vi.stubGlobal('sampleRate', 48000);
    vi.stubGlobal('currentFrame', 0);
    vi.stubGlobal('registerProcessor', (name: string, ctor: new () => Processor) =>
      registered.push([name, ctor])
    );

    await import('@/lib/app/synths/audio/worklet-entry');

    expect(registered.map(([n]) => n)).toEqual(['kys-voice']);
    const proc = new registered[0][1]();
    proc.port.onmessage!({ data: { type: 'params', p: monoParams() } });
    proc.port.onmessage!({ data: { type: 'noteOn', n: 60 } });
    const out = [new Float32Array(128), new Float32Array(128), new Float32Array(128)];
    let alive = true;
    for (let i = 0; i < 4; i++) alive = proc.process([], [out]) && alive;
    expect(alive).toBe(true);
    expect(out[0].some((x) => x !== 0)).toBe(true);
    expect(Array.from(out[1])).toEqual(Array.from(out[0]));
    // a third channel gets a copy of the first
    expect(Array.from(out[2])).toEqual(Array.from(out[0]));
    // the synth's events go back up the port
    expect(posted).toContainEqual({ type: 'note', n: 60, on: true });
  });

  it("moves a pattern's loop events onto the context's clock, from the frame each block plays at", async () => {
    const posted: SynthEvent[] = [];
    class AudioWorkletProcessor {
      port = {
        onmessage: null as ((m: { data: unknown }) => void) | null,
        postMessage: (e: SynthEvent) => posted.push(e),
      };
    }
    const registered: (new () => Processor)[] = [];
    vi.resetModules();
    vi.stubGlobal('AudioWorkletProcessor', AudioWorkletProcessor);
    vi.stubGlobal('sampleRate', 48000);
    // The context had been running 5,000 frames before this node's first render
    vi.stubGlobal('currentFrame', 5000);
    vi.stubGlobal('registerProcessor', (_: string, ctor: new () => Processor) =>
      registered.push(ctor)
    );

    await import('@/lib/app/synths/audio/worklet-entry');

    const proc = new registered[0]();
    proc.port.onmessage!({ data: { type: 'params', p: monoParams() } });
    const out = [new Float32Array(128), new Float32Array(128)];
    proc.process([], [out]);
    // The context skipped a block (an underrun): its clock is 256 frames on, the synth's count only 128
    vi.stubGlobal('currentFrame', 5256);
    proc.port.onmessage!({
      data: { type: 'pattern', loop: { notes: [[0, 60, 0.5]], beats: 1 }, bpm: 120 },
    });
    proc.process([], [out]);
    // The pattern started at the synth's frame 128, which this block plays at the context's 5,256
    expect(posted).toContainEqual(expect.objectContaining({ type: 'loop', index: 0, frame: 5256 }));
    expect(posted).toContainEqual({ type: 'note', n: 60, on: true });
  });
});

describe('probe-worker-entry', () => {
  it('starts a session, answers its jobs, and ignores jobs for an old session or before a start', async () => {
    const replies: ProbeWorkerReply[] = [];
    const scope = {
      onmessage: null as ((m: { data: ProbeWorkerRequest }) => void) | null,
      postMessage: (r: ProbeWorkerReply) => replies.push(r),
    };
    vi.stubGlobal('self', scope);

    await import('@/lib/app/synths/audio/probe-worker-entry');

    const darker = monoParams({
      filter: {
        type: 'ladder',
        mode: 'lp',
        cutoff: 300,
        res: 0.3,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 0,
      },
    });
    scope.onmessage!({ data: { type: 'job', run: 1, job: { key: 'early', far: [darker] } } });
    expect(replies).toEqual([]);

    scope.onmessage!({ data: { type: 'start', run: 2, baseline: monoParams(), notes: [57, 64] } });
    expect(replies).toEqual([{ type: 'ready', run: 2 }]);

    scope.onmessage!({ data: { type: 'job', run: 1, job: { key: 'stale', far: [darker] } } });
    expect(replies).toHaveLength(1);

    scope.onmessage!({ data: { type: 'job', run: 2, job: { key: 'cutoff', nudges: [darker] } } });
    expect(replies[1]).toMatchObject({
      type: 'result',
      run: 2,
      result: { key: 'cutoff', live: true },
    });

    // The sound detector's question (t-125), with or without a session: what a patch sounds like.
    scope.onmessage!({ data: { type: 'kind', id: 7, params: darker } });
    expect(replies[2]).toEqual({ type: 'kind', id: 7, features: soundFeatures(darker) });
    // A patch it cannot read fails that reading alone, and the worker answers the next one.
    scope.onmessage!({ data: { type: 'kind', id: 8, params: null as never } });
    expect(replies[3]).toEqual({ type: 'kind', id: 8, features: null });
    scope.onmessage!({ data: { type: 'kind', id: 9, params: darker } });
    expect(replies[4]).toMatchObject({ type: 'kind', id: 9 });
  });
});
