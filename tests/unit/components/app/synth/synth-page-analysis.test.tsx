// @vitest-environment happy-dom

/**
 * The synth page's analysis tools on Model D's real catalogue content: the sound map behind "Dim unused parts" and
 * "Show sensitive controls" (worked out in the probe workers, or on the main thread where workers are blocked), the
 * harmonics strip, and the big scope view. The router and the audio engine are fakes; the probe's measurement is a
 * fake so a map takes milliseconds, but the mapper, its worker protocol and the page are real.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { MAP_OFF, findStore, focusStore, mapStore } from '@/components/app/synth/stores';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { SynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { createProbe, PROBE_WORKER_URL } from '@/lib/app/synths/audio/probe';
import type { ProbeJob, ProbeResult } from '@/lib/app/synths/audio/probe';
import { controlMap, displayName, presetState } from '@/lib/app/synths/lib/patch';
import { modelDRows } from '@/tests/helpers/model-d-detail';

const { router, engine } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
    analyser: null,
    ctx: null,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findFirst: vi.fn() }, synthNote: { findMany: vi.fn() } },
}));
// The real probe renders every job through the voice: hundreds of renders per map. Its measurement is replaced; its
// renderer (which `predict` uses) and its worker URL are the real ones.
vi.mock('@/lib/app/synths/audio/probe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/synths/audio/probe')>()),
  createProbe: vi.fn(),
}));

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;
const cm = controlMap(def);

const CUTOFF = 'filter.cutoff';
const GLIDE = 'ctl.glide';
if (!cm[CUTOFF] || !cm[GLIDE]) throw new Error('Model D controls moved; update the fixtures');

/** The fake measurement: glide does nothing, cutoff is the most sensitive knob, everything else is live. */
const measure = (job: ProbeJob): ProbeResult => {
  if (job.key === GLIDE) return { key: job.key, live: false };
  return { key: job.key, live: true, d: job.key === CUTOFF ? 4 : 0.5 };
};

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
let detail: SynthDetail;

beforeAll(async () => {
  // The page loads its definition on its own (`defs/load.ts`). Loaded here, it renders without suspending.
  await loadSynthDef('model-d');
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
  // No canvas in happy-dom: the scope's loops see no context and draw nothing, which is all this file needs.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  });
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const d = await getSynthDetail('model-d');
  if (!d) throw new Error('no Model D detail');
  detail = d;
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  engine.send.mockReset();
  vi.mocked(createProbe).mockReset();
  vi.mocked(createProbe).mockReturnValue({ rms: 0.1, measure });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  act(() => {
    focusStore.set(null);
    findStore.set(null);
    mapStore.set(MAP_OFF);
  });
});

function page() {
  return render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);
}
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const pressed = (name: string) => button(name).getAttribute('aria-pressed');
const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** A probe worker that answers the mapper's protocol with the fake measurement, and remembers where it was loaded from. */
const loaded: string[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string | URL) {
    loaded.push(String(url));
  }
  terminate() {}
  postMessage(msg: { type: string; run: number; job?: ProbeJob }) {
    const reply = (data: unknown) => queueMicrotask(() => this.onmessage?.({ data }));
    if (msg.type === 'start') reply({ type: 'ready', run: msg.run });
    else if (msg.type === 'job' && msg.job)
      reply({ type: 'result', run: msg.run, result: measure(msg.job) });
  }
}

/** A probe worker that holds its answers until told to send them, so a run can be overtaken mid-flight. */
const held: (() => void)[] = [];
class HoldingWorker extends FakeWorker {
  postMessage(msg: { type: string; run: number; job?: ProbeJob }) {
    held.push(() => super.postMessage(msg));
  }
}
/** Send every held answer, and the answers those prompt, until the workers go quiet. */
async function release() {
  for (let i = 0; i < 1000 && held.length; i++) {
    held.splice(0).forEach((f) => f());
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the panel switches', () => {
  it('remembers Dim unused parts, Show sensitive controls and Show harmonics in browser storage', () => {
    vi.stubGlobal('Worker', undefined);
    const { unmount } = page();
    for (const name of ['Dim unused parts', 'Show sensitive controls', 'Show harmonics']) {
      expect(pressed(name)).toBe('false');
      fireEvent.click(button(name));
      expect(pressed(name)).toBe('true');
    }
    expect(['kys.dim', 'kys.heat', 'kys.harm'].map((k) => window.localStorage.getItem(k))).toEqual([
      'true',
      'true',
      'true',
    ]);
    unmount();
    page();
    expect(pressed('Dim unused parts')).toBe('true');
    expect(pressed('Show harmonics')).toBe('true');
  });
});

describe('the sound map', () => {
  it('runs in its probe workers, loaded from the static worker file', async () => {
    loaded.length = 0;
    vi.stubGlobal('Worker', FakeWorker);
    page();
    fireEvent.click(button('Show sensitive controls'));
    await settle(400);
    expect(loaded.length).toBeGreaterThan(0);
    expect(new Set(loaded)).toEqual(new Set([PROBE_WORKER_URL]));
    // Measured in the workers, not here.
    expect(createProbe).not.toHaveBeenCalled();
    expect(mapStore.get().status).toBe('ready');
    expect(mapStore.get().ranked[0]).toBe(CUTOFF);
    const cutoff = cm[CUTOFF];
    if (!cutoff) throw new Error('no cutoff');
    expect(button(`1 ${displayName(def, cutoff)}`)).toBeTruthy();
  });

  it('falls back to the main thread when workers are unavailable, and the map still arrives', async () => {
    vi.stubGlobal('Worker', undefined);
    page();
    fireEvent.click(button('Dim unused parts'));
    expect(mapStore.get().status).toBe('working');
    await settle(400 + 40 * 400);
    expect(createProbe).toHaveBeenCalled();
    const map = mapStore.get();
    expect(map.status).toBe('ready');
    expect(map.state?.[GLIDE]).toBe('dead');
    expect(map.state?.[CUTOFF]).toBe('on');
    expect(screen.getByText('Bright:')).toBeTruthy();
  });

  it('says in the inspector what the map found for the control pointed at', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    page();
    fireEvent.click(button('Dim unused parts'));
    await settle(400);
    act(() => focusStore.set({ kind: 'control', id: GLIDE, x: 0, y: 0, tip: false }));
    expect(
      screen.getAllByText(/Does nothing at the moment: wherever you set it/).length
    ).toBeGreaterThan(0);
  });

  it('drops the map of a sound that was replaced while it was still being worked out', async () => {
    held.length = 0;
    vi.stubGlobal('Worker', HoldingWorker);
    page();
    fireEvent.click(button('Dim unused parts'));
    await settle(300); // the first sound's analysis is under way, its answers held
    const other = detail.sounds[1];
    const library = screen.getByRole('heading', { name: 'Sound library' }).closest('section');
    if (!library) throw new Error('no library');
    fireEvent.click(within(library).getByText(other.name));
    const replaced = mapStore.get().key;
    expect(replaced).toContain(other.id);
    // The first analysis finishes inside the new sound's 300 ms wait, before the new one has started.
    await release();
    expect(mapStore.get().key).toBe(replaced);
    expect(mapStore.get().state).toBeNull();
    await settle(300);
    await release();
    expect(mapStore.get()).toMatchObject({ status: 'ready', key: replaced });
  });

  it('works the map out again for another sound, and clears it when both switches go off', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    page();
    fireEvent.click(button('Dim unused parts'));
    await settle(400);
    const first = mapStore.get().key;
    const other = detail.sounds[1];
    fireEvent.click(
      within(
        screen.getByRole('heading', { name: 'Sound library' }).closest('section') ?? document.body
      ).getByText(other.name)
    );
    await settle(400);
    expect(mapStore.get().key).not.toBe(first);
    expect(mapStore.get().key).toContain(other.id);
    fireEvent.click(button('Dim unused parts'));
    expect(mapStore.get().status).toBe('off');
    expect(screen.queryByText('Bright:')).toBeNull();
  });
});

describe('the harmonics strip and the big view', () => {
  const khz = (f: number) => (f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(1)} kHz`);

  it('shows Model D’s predicted sound and its cutoff under the panel', async () => {
    vi.stubGlobal('Worker', undefined);
    page();
    expect(screen.queryByRole('region', { name: 'Harmonics of the sound' })).toBeNull();
    fireEvent.click(button('Show harmonics'));
    await settle(100);
    const strip = within(screen.getByRole('region', { name: 'Harmonics of the sound' }));
    expect(strip.getByText('Predicted · C3')).toBeTruthy();
    expect(strip.getByText(/^Sounds at /)).toBeTruthy();
    const { values, cables } = presetState(def, detail.sounds[0]);
    const patched = Object.fromEntries(
      cables.flatMap((c) => [
        [c.to, true],
        [c.from, true],
      ])
    );
    const cutoff = def.toEngine(values, { wheel: 0, patched }).filter.cutoff;
    expect(strip.getByText(khz(cutoff))).toBeTruthy();
  });

  it('opens the big view from the scope strip and from the harmonics strip', async () => {
    vi.stubGlobal('Worker', undefined);
    page();
    const dialog = () =>
      screen.getByRole('heading', { name: 'The wave this patch is making' }).closest('dialog');
    expect(screen.queryByRole('heading', { name: 'The wave this patch is making' })).toBeNull();
    fireEvent.click(button(/Oscilloscope and harmonics of the sound/));
    expect(dialog()?.open).toBe(true);
    fireEvent.click(within(dialog() ?? document.body).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'The wave this patch is making' })).toBeNull();
    fireEvent.click(button('Show harmonics'));
    fireEvent.click(button('Big view ›'));
    expect(dialog()?.open).toBe(true);
    await settle(100);
    expect(screen.getByRole('region', { name: 'The shape itself' })).toBeTruthy();
  });

  it('plays notes from the computer keys while the big view is open', () => {
    vi.stubGlobal('Worker', undefined);
    page();
    fireEvent.click(button(/Oscilloscope and harmonics of the sound/));
    const inside = screen.getByRole('button', { name: 'Close' });
    fireEvent.keyDown(inside, { key: 'a', code: 'KeyA' });
    expect(engine.send).toHaveBeenCalledWith({ type: 'noteOn', n: 48, v: 0.85 });
  });

  it('still keeps the computer keys out of the other dialogs', () => {
    vi.stubGlobal('Worker', undefined);
    page();
    fireEvent.click(button('What is not modelled ›'));
    const limits = screen.getByRole('heading', { name: 'What is not modelled' }).closest('dialog');
    if (!limits) throw new Error('no limits dialog');
    fireEvent.keyDown(within(limits).getByRole('button', { name: 'Close' }), {
      key: 'a',
      code: 'KeyA',
    });
    expect(engine.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'noteOn' }));
  });
});
