// @vitest-environment happy-dom

/**
 * The oscilloscope: the strip beside the keyboard, the harmonics strip under the panel and the big view, drawn on
 * Model D. happy-dom has no canvas, so each canvas gets a 2D context that records what was drawn, and the engine is
 * a fake analyser playing a 220 Hz sine. Animation frames are stepped by hand.
 *
 * @see components/app/synth/scope.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  HarmonicsStrip,
  Scope,
  ScopeDialog,
  createMeasureStore,
} from '@/components/app/synth/scope';
import type { ScopeDialogProps, ScopeSource } from '@/components/app/synth/scope';
import { findStore, notesStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { predict } from '@/lib/app/synths/lib/predict';
import { waveStory } from '@/lib/app/synths/lib/wavestory';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

const W = 400;
const H = 100;
const SR = 48000;
const TONE = 220;

// ── a canvas that records, and frames stepped by hand ───────────────────────

interface Drawn {
  fn: string;
  args: unknown[];
  strokeStyle: unknown;
}
/** Every call made on every canvas, with the stroke colour current at the time. */
let drawn: Drawn[] = [];
let frames: FrameRequestCallback[] = [];

function recordingContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      return (...args: unknown[]) => {
        drawn.push({ fn: String(k), args, strokeStyle: t.strokeStyle });
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Run the pending animation frames `n` times over. Each frame queues the next. */
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    const run = frames;
    frames = [];
    act(() => run.forEach((f) => f(performance.now())));
  }
}

/** The y of every point drawn in `colour` since the last reset. */
const ys = (colour: string) =>
  drawn.filter((d) => d.fn === 'lineTo' && d.strokeStyle === colour).map((d) => Number(d.args[1]));
const spread = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
const texts = () => drawn.filter((d) => d.fn === 'fillText').map((d) => String(d.args[0]));

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => recordingContext(),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => W,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => H,
  });
});

beforeEach(() => {
  drawn = [];
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // The fallback colours (no --kys-* on happy-dom's root): accent, muted, faint are what the traces are drawn in.
  window.devicePixelRatio = 1;
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => notesStore.set([]));
  findStore.set(null);
});

const ACCENT = '#f6a63a';
const MUTED = '#979eac';

/** An analyser playing a sine at `TONE` Hz, as the engine's would. */
function sineSource(amp = 0.5): ScopeSource {
  let t0 = 0;
  const an = {
    fftSize: 4096,
    frequencyBinCount: 2048,
    getFloatTimeDomainData(buf: Float32Array) {
      for (let i = 0; i < buf.length; i++)
        buf[i] = amp * Math.sin((2 * Math.PI * TONE * (t0 + i)) / SR);
      t0 += 800;
    },
    getByteFrequencyData(buf: Uint8Array) {
      buf.fill(0);
      buf[Math.round((TONE * 2 * buf.length) / SR)] = 200;
    },
  };
  return { analyser: an as unknown as AnalyserNode, ctx: { sampleRate: SR } };
}

// ── the strip beside the keyboard ───────────────────────────────────────────

describe('Scope (the strip beside the keyboard)', () => {
  it('draws the live sound as a wave and measures its pitch', () => {
    const measure = createMeasureStore();
    render(
      <Scope
        source={sineSource()}
        running
        onExpand={vi.fn()}
        measureStore={measure}
        changeKey={{}}
      />
    );
    step(8);
    // A 0.5 sine drawn at gain 1 spans 0.46 of the height each way: nearly half the box, not a flat line.
    expect(spread(ys(ACCENT))).toBeGreaterThan(H * 0.4);
    expect(measure.get().freq).toBeCloseTo(TONE, 0);
    expect(measure.get().peak).toBeCloseTo(0.5, 2);
  });

  it('draws a flat line through the middle while the sound is off, and measures nothing', () => {
    const measure = createMeasureStore();
    render(
      <Scope
        source={sineSource()}
        running={false}
        onExpand={vi.fn()}
        measureStore={measure}
        changeKey={{}}
      />
    );
    step(8);
    expect(ys(ACCENT).length).toBeGreaterThan(0);
    expect(new Set(ys(ACCENT))).toEqual(new Set([H / 2]));
    expect(measure.get().freq).toBe(0);
    // Drawn once, then nothing animates until the sound comes on.
    expect(frames).toHaveLength(0);
  });

  it('holds the shape from before a panel move behind the new one, labelled before and now', () => {
    const source = sineSource();
    const { rerender } = render(
      <Scope source={source} running onExpand={vi.fn()} changeKey={{ v: 1 }} />
    );
    step(20); // past the lag buffers' first roll, so there is an earlier shape to hold
    expect(texts()).not.toContain('before');
    rerender(<Scope source={source} running onExpand={vi.fn()} changeKey={{ v: 2 }} />);
    step(1);
    expect(texts()).toEqual(expect.arrayContaining(['before', 'now']));
    expect(spread(ys(MUTED))).toBeGreaterThan(H * 0.4);
  });

  it('says to hold a note when the panel moves with nothing sounding', () => {
    const silent = sineSource(0);
    const { rerender } = render(
      <Scope source={silent} running onExpand={vi.fn()} changeKey={{ v: 1 }} />
    );
    step(2);
    rerender(<Scope source={silent} running onExpand={vi.fn()} changeKey={{ v: 2 }} />);
    step(1);
    expect(texts()).toContain('Hold a note to see the change');
  });

  it('is the button that opens the big view', () => {
    const onExpand = vi.fn();
    render(<Scope source={null} running={false} onExpand={onExpand} changeKey={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /Oscilloscope and harmonics/ }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

// ── the harmonics strip under the panel ─────────────────────────────────────

describe('HarmonicsStrip (under the panel)', () => {
  const pred = predict(def, def.init, [], 0);
  if (!pred) throw new Error('Model D did not predict');

  const strip = (over: Partial<Parameters<typeof HarmonicsStrip>[0]> = {}) => (
    <HarmonicsStrip
      cutoff={1200}
      pred={pred}
      source={sineSource()}
      running
      playing={false}
      measureStore={createMeasureStore()}
      onExpand={vi.fn()}
      {...over}
    />
  );

  it('shows Model D’s predicted wave in grey, with where it sounds, while nothing is playing', () => {
    render(strip());
    expect(screen.getByText('Predicted · C3')).toBeTruthy();
    expect(screen.getByText(`Sounds at ${Math.round(pred.freq)} Hz`)).toBeTruthy();
    step(2);
    // The predicted wave is Model D's own sawtooth stack: it has a shape, not a line.
    expect(spread(ys(MUTED))).toBeGreaterThan(H * 0.2);
    expect(ys(ACCENT)).toHaveLength(0);
  });

  it('switches to the live sound, in orange, while a key is down', () => {
    render(strip());
    act(() => notesStore.set([48]));
    expect(screen.getByText('Playing')).toBeTruthy();
    step(2);
    expect(spread(ys(ACCENT))).toBeGreaterThan(H * 0.4);
  });

  it('counts the riff as playing, though it never touches the held notes', () => {
    render(strip({ playing: true }));
    expect(screen.getByText('Playing')).toBeTruthy();
  });

  it('says when a patch makes no sound as it is set', () => {
    const silent = predict(
      def,
      { ...def.init, 'mix.osc1': 0, 'mix.osc2': 0, 'mix.osc3': 0 },
      [],
      0
    );
    render(strip({ pred: silent, running: false }));
    // Off with no hold to run down: straight to the model.
    step(1);
    expect(silent?.silent).toBe(true);
    expect(texts()).toContain('This patch makes no sound as it is set');
  });

  it('marks the cutoff on the harmonics and shows it in the heading', () => {
    render(strip({ cutoff: 1200 }));
    expect(screen.getByText('1.2 kHz')).toBeTruthy();
    step(1);
    expect(texts()).toContain('cutoff');
  });
});

// ── the big view ────────────────────────────────────────────────────────────

describe('ScopeDialog (the big view)', () => {
  beforeAll(() => {
    // happy-dom's <dialog> does not open modally; open is what the page relies on.
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
      close(this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    });
  });

  const phrase = { bpm: 100, loop: false, steps: [[0, 36, 1]] as [number, number, number][] };
  const props = (over: Partial<ScopeDialogProps> = {}): ScopeDialogProps => ({
    open: true,
    onClose: vi.fn(),
    source: sineSource(),
    running: true,
    def,
    values: def.init,
    cables: [],
    phrase,
    playing: false,
    onPlay: vi.fn(),
    onStop: vi.fn(),
    wheel: 0,
    onWheel: vi.fn(),
    octave: 0,
    onOctave: vi.fn(),
    hold: false,
    onHold: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    changeKey: {},
    ...over,
  });

  it('renders nothing inside while closed, so its canvases do not run', () => {
    render(<ScopeDialog {...props({ open: false })} />);
    expect(screen.queryByText('The wave this patch is making')).toBeNull();
    expect(frames).toHaveLength(0);
  });

  it('reads the live pitch, cycle and level of what is playing', () => {
    render(<ScopeDialog {...props()} />);
    step(8);
    const readings = within(screen.getByRole('group', { name: 'Readings' }));
    expect(readings.getByText(/^220 Hz/)).toBeTruthy();
    expect(readings.getByText('A3')).toBeTruthy();
    expect(readings.getByText('4.55 ms')).toBeTruthy(); // one cycle of 220 Hz
    expect(readings.getByText('-6.0 dB')).toBeTruthy(); // a 0.5 peak
  });

  it('says the sound is off, and reads nothing, when it is', () => {
    render(<ScopeDialog {...props({ running: false })} />);
    step(8);
    expect(screen.getByText(/Sound is off, so there is nothing to draw/)).toBeTruthy();
    const readings = within(screen.getByRole('group', { name: 'Readings' }));
    expect(readings.getByText('Pitch').nextElementSibling?.textContent).toBe('—');
  });

  it('blanks every reading once the sound goes off, rather than keeping the last note’s', () => {
    const { rerender } = render(<ScopeDialog {...props()} />);
    step(8);
    const readings = () => within(screen.getByRole('group', { name: 'Readings' }));
    expect(readings().getByText('-6.0 dB')).toBeTruthy();
    rerender(<ScopeDialog {...props({ running: false })} />);
    for (const label of ['Pitch', 'One cycle', 'On screen', 'Peak', 'Brightness'])
      expect(readings().getByText(label).nextElementSibling?.textContent).toBe('—');
  });

  it('tells Model D’s wave story down the signal chain, with the filter’s cutoff and what moves it', async () => {
    vi.useFakeTimers();
    try {
      render(<ScopeDialog {...props()} />);
      expect(screen.getByRole('status').textContent).toBe('Reading the panel…');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      const story = waveStory(def, def.init, [], 0);
      expect(story.error).toBe('');
      for (const s of story.stages)
        expect(screen.getByRole('region', { name: s.title })).toBeTruthy();
      const filter = story.stages.find((s) => s.id === 'filter');
      if (!filter || story.cutoff == null) throw new Error('Model D has no filter stage');
      expect(filter.on.length).toBeGreaterThan(0);
      const movedBy = screen.getByText('Moved by').parentElement;
      if (!movedBy) throw new Error('no Moved by row');
      for (const e of filter.on) expect(within(movedBy).getByText(e.name)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('finds a control on the panel from the story, and closes so it can be seen', async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<ScopeDialog {...props({ onClose })} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      const filter = waveStory(def, def.init, [], 0).stages.find((s) => s.id === 'filter');
      const entry = filter?.on.find((e) => e.kind === 'control');
      if (!entry) throw new Error('no control in the filter stage');
      const movedBy = screen.getByText('Moved by').parentElement;
      if (!movedBy) throw new Error('no Moved by row');
      fireEvent.click(within(movedBy).getByText(entry.name));
      expect(findStore.get()).toEqual({ kind: 'control', id: entry.key });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays and stops the riff, and freezes the trace', () => {
    const onPlay = vi.fn();
    const { rerender } = render(<ScopeDialog {...props({ onPlay })} />);
    fireEvent.click(screen.getByRole('button', { name: '▶ Play riff' }));
    expect(onPlay).toHaveBeenCalledWith(phrase);
    const onStop = vi.fn();
    rerender(<ScopeDialog {...props({ playing: true, onStop })} />);
    fireEvent.click(screen.getByRole('button', { name: '■ Stop riff' }));
    expect(onStop).toHaveBeenCalledTimes(1);

    step(8);
    fireEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    step(1);
    drawn = [];
    step(3);
    // Frozen: the same trace is redrawn, so every frame's points are the same.
    const perFrame = ys(ACCENT).length / 3;
    const frame = (k: number) => ys(ACCENT).slice(k * perFrame, (k + 1) * perFrame);
    expect(perFrame).toBeGreaterThan(0);
    expect(frame(2)).toEqual(frame(0));
  });

  it('has no Play button for a synth with no sounds', () => {
    render(<ScopeDialog {...props({ phrase: null })} />);
    expect(screen.queryByRole('button', { name: '▶ Play riff' })).toBeNull();
  });

  it('carries its own keyboard, and lets the page’s computer keys play (data-plays)', () => {
    const noteOn = vi.fn();
    const { container } = render(<ScopeDialog {...props({ noteOn })} />);
    expect(container.querySelector('dialog')?.hasAttribute('data-plays')).toBe(true);
    expect(within(container).getByRole('slider', { name: 'Mod wheel' })).toBeTruthy();
  });
});
