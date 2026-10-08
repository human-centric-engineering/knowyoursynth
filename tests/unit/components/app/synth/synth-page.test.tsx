// @vitest-environment happy-dom

/**
 * The synth page: the provider that holds the panel's state and lays out the regions. The panel, inspector,
 * keyboard, effects rack and search are real; the router and the audio engine are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import {
  findStore,
  focusStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { SESSION_WRITE_DELAY_MS, readStored } from '@/components/app/synth/storage';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';

const { router, engine, events } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    start: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
    ctx: null as object | null,
  },
  /** The page's engine listener, so a test can fire engine events. */
  events: { fn: null as ((e: { type: string }) => void) | null },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: (f: (e: { type: string }) => void) => {
    events.fn = f;
    return () => {
      if (events.fn === f) events.fn = null;
    };
  },
}));

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(() => {
  // happy-dom has no SVG geometry or pointer capture; the panel only needs the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
  if (typeof globalThis.DOMPoint === 'undefined' || !('matrixTransform' in DOMPoint.prototype)) {
    class Point {
      constructor(
        public x = 0,
        public y = 0
      ) {}
      matrixTransform() {
        return this;
      }
    }
    Object.assign(globalThis, { DOMPoint: Point });
  }
});

// ── fixtures ────────────────────────────────────────────────────────────────

const sound = (
  over: Partial<CatalogueSound> & Pick<CatalogueSound, 'id' | 'name'>
): CatalogueSound => ({
  ref: 'In the style of nobody',
  artist: 'Nobody',
  tags: ['bass'],
  level: 1,
  blurb: 'A test sound.',
  how: 'Because.',
  phrase: { bpm: 100, loop: false, steps: [[0, 36, 1]] },
  steps: [],
  context: {},
  tweaks: [],
  version: def.version,
  ...over,
});

const FAT_BASS = sound({
  id: 'fat-bass',
  name: 'Fat bass',
  phrase: {
    bpm: 90,
    loop: false,
    steps: [
      [0, 36, 1],
      [1, 43, 1],
    ],
  },
  steps: [
    {
      title: 'Close the filter',
      module: 'filter',
      why: 'Dark.',
      set: { 'filter.cutoff': -2, 'mix.osc1': 9 },
    },
  ],
  context: { 'filter.cutoff': 'Almost shut for a dull thud.' },
});
const WOBBLE = sound({
  id: 'wobble',
  name: 'Wobble lead',
  steps: [
    {
      title: 'Wobble the filter',
      module: 'filter',
      why: 'Wobbly.',
      set: { 'filter.cutoff': 2 },
      cables: [['j.lfoTri', 'j.cutCv']],
    },
  ],
});

const OTHER_SYNTH: CatalogueSynth = {
  id: 'ob-x',
  name: 'OB-X',
  maker: 'Oberheim',
  year: 1979,
  heritage: 'Polyphonic and bold',
  summary: 'Six voices.',
  definitionVersion: 1,
  soundCount: 0,
};
const MODEL_D_SYNTH: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'Three oscillators and noise feed a mixer, then a ladder filter.',
  definitionVersion: def.version,
  soundCount: 2,
};

const UNUSUAL = 'Moog numbered the cutoff knob, not Hz.';
const detail: SynthDetail = {
  synth: MODEL_D_SYNTH,
  sounds: [FAT_BASS, WOBBLE],
  lineage: null,
  notes: {
    unusual: { 'filter.cutoff': UNUSUAL },
    limits: { intro: null, items: [], shared: [] },
  },
};

const SESSION_KEY = 'kys.session.model-d';

function page(over: Partial<SynthPageProps> = {}) {
  return render(
    <SynthPage detail={detail} synths={[MODEL_D_SYNTH, OTHER_SYNTH]} viewParam={null} {...over} />
  );
}

/** A stored session as `storedSession()` writes it. */
const storeSession = (s: object) => window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const paramsSent = () =>
  engine.send.mock.calls
    .map((c) => c[0] as { type: string; p?: Record<string, unknown> })
    .filter((m) => m.type === 'params');

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  engine.send.mockReset();
  engine.setFx.mockReset();
  engine.start.mockReset().mockResolvedValue(undefined);
  engine.resume.mockReset().mockResolvedValue(undefined);
  engine.suspend.mockReset().mockResolvedValue(undefined);
  engine.running = false;
  engine.ctx = null;
  events.fn = null;
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => {
    focusStore.set(null);
    findStore.set(null);
    pendingStore.set(null);
    notesStore.set([]);
    meterStore.set({ gate: false, lfo: 0, overload: 0, power: false });
  });
});

// ── layout ──────────────────────────────────────────────────────────────────

describe('SynthPage layout', () => {
  it('renders nothing for a synth the registry does not have', () => {
    const { container } = page({
      detail: { ...detail, synth: { ...MODEL_D_SYNTH, id: 'not-a-synth' } },
    });
    expect(container.firstChild).toBeNull();
  });

  it('shows the synth heading, the loaded sound and the About summary', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Behringer Model D · Modelled on the 1970 Minimoog Model D'
    );
    expect(screen.getByText('Fat bass')).toBeTruthy();
    expect(screen.getByText('Loaded:')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'About this Model D' })).toBeTruthy();
    expect(screen.getByText(MODEL_D_SYNTH.summary)).toBeTruthy();
  });

  it('draws the panel in the neutral design: its own faceplate colours, no maker mark', () => {
    page();
    const face = screen.getByRole('group', { name: 'Behringer Model D front panel' });
    const panel = face.closest('svg') ?? face;
    const svg = panel.outerHTML.toLowerCase();
    expect(svg).toContain('#222630'); // the neutral faceplate
    expect(svg).not.toContain('#1b1c1e'); // Model D's own
    expect(panel.textContent?.toLowerCase()).not.toContain('behringer'); // no printed maker mark
  });

  it('opens on the first sound with its steps applied and nothing moved', () => {
    page();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(button('Blank patch')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore sound' })).toBeNull();
    // Fat bass closes the filter: the panel's cutoff knob reads the sound's value.
    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      '-2'
    );
  });

  it('does not offer a modular layout switch for a synth with no modular spec', () => {
    page();
    expect(screen.queryByRole('group', { name: 'Panel layout' })).toBeNull();
  });
});

// ── the audio engine ────────────────────────────────────────────────────────

describe('SynthPage engine', () => {
  it("sends the sound's parameters to the engine on mount", () => {
    page();
    const first = paramsSent()[0];
    expect(first.p).toMatchObject({ wheel: 0, cables: [] });
    expect(engine.setFx).toHaveBeenCalledTimes(1);
  });

  it('sends cables from the sound as engine routes', () => {
    storeSession({ presetId: 'wobble', step: null, values: {}, cables: [['j.lfoTri', 'j.cutCv']] });
    page();
    const last = paramsSent().at(-1)?.p;
    expect(last?.cables).toHaveLength(1);
  });

  it('sends fresh parameters when the patch changes', () => {
    page();
    const before = paramsSent().at(-1)?.p;

    fireEvent.click(button('Blank patch'));

    const after = paramsSent().at(-1)?.p;
    expect(after).not.toEqual(before);
  });

  it('starts the audio on "Turn sound on", then reads "Sound on"', async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Turn sound on'));
    });
    // `resume` starts the engine the first time (Engine.resume); the page does not choose.
    expect(engine.resume).toHaveBeenCalledTimes(1);
    const on = button('Sound on');
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(meterStore.get().power).toBe(true);
  });

  it('reads "Sound unavailable" when the audio cannot start', async () => {
    engine.resume.mockRejectedValue(new Error('no audio'));
    page();
    await act(async () => {
      fireEvent.click(button('Turn sound on'));
    });
    expect(button('Sound unavailable')).toBeTruthy();
  });

  it('opens already on when the engine was left running by another synth', () => {
    engine.running = true;
    page();
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('true');
  });

  it('suspends the engine and clears the held notes when sound is turned off', async () => {
    engine.running = true;
    page();
    act(() => notesStore.set([60]));

    await act(async () => {
      fireEvent.click(button('Sound on'));
    });

    expect(engine.suspend).toHaveBeenCalledTimes(1);
    expect(button('Turn sound on')).toBeTruthy();
    expect(notesStore.get()).toEqual([]);
    expect(meterStore.get().power).toBe(false);
  });

  it("plays the sound's riff, starting audio first, and stops it", async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Play riff'));
    });
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(engine.send).toHaveBeenCalledWith({ type: 'phrase', phrase: FAT_BASS.phrase });

    fireEvent.click(button('Stop riff'));
    expect(engine.send).toHaveBeenCalledWith({ type: 'stopPhrase' });
    expect(button('Play riff')).toBeTruthy();
  });

  it('plays the riff of the sound that is loaded, not the first', async () => {
    storeSession({ presetId: 'wobble', step: null, values: {}, cables: [] });
    page();
    await act(async () => {
      fireEvent.click(button('Play riff'));
    });
    expect(engine.send).toHaveBeenCalledWith({ type: 'phrase', phrase: WOBBLE.phrase });
  });

  it('stops what it was playing when the page unmounts, and clears what it pointed at', () => {
    const { unmount } = page();
    act(() => {
      focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false });
      findStore.set({ kind: 'control', id: 'filter.cutoff' });
      pendingStore.set('j.lfoTri');
    });
    engine.send.mockClear();

    unmount();

    expect(engine.send).toHaveBeenCalledExactlyOnceWith({ type: 'panic' });
    expect(focusStore.get()).toBeNull();
    expect(findStore.get()).toBeNull();
    expect(pendingStore.get()).toBeNull();
  });
});

// ── editing the patch ───────────────────────────────────────────────────────

describe('SynthPage patch', () => {
  it('counts the controls moved off the sound, and restores the sound', () => {
    page();
    fireEvent.click(button('A-440'));
    expect(screen.getByText('1 control moved')).toBeTruthy();

    fireEvent.click(button('MAIN OUT'));
    expect(screen.getByText('2 controls moved')).toBeTruthy();

    fireEvent.click(button('Restore sound'));

    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore sound' })).toBeNull();
    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      '-2'
    );
  });

  it('puts one control back from the inspector with "Put it back"', () => {
    page();
    fireEvent.click(button('A-440'));
    act(() => focusStore.set({ kind: 'control', id: 'out.a440', x: 0, y: 0, tip: false }));

    fireEvent.click(button('Put it back'));

    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('offers no "Put it back" during a lesson step, as the panel and the card do not', () => {
    storeSession({ presetId: 'fat-bass', step: 0, values: { 'filter.cutoff': 5 }, cables: [] });
    page();
    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false }));
    expect(screen.getByText(UNUSUAL)).toBeTruthy(); // the inspector is showing the control
    expect(screen.queryByRole('button', { name: 'Put it back' })).toBeNull();
  });

  it('keeps an unsaved move when the route re-renders with an equal synth', () => {
    // Something is stored, so a second read of storage would have a panel to put back.
    storeSession({
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': -2, 'mix.osc1': 9 }, // the sound as it is: nothing moved
      cables: [],
    });
    const { rerender } = page();
    fireEvent.click(button('A-440'));
    expect(screen.getByText('1 control moved')).toBeTruthy();

    // A refresh hands a new detail object, so a new definition with notes: the panel must not be re-read from
    // storage, which does not have the move yet.
    rerender(
      <SynthPage
        detail={{ ...detail, notes: { ...detail.notes, unusual: { ...detail.notes.unusual } } }}
        synths={[MODEL_D_SYNTH, OTHER_SYNTH]}
        viewParam={null}
      />
    );
    expect(screen.getByText('1 control moved')).toBeTruthy();
  });

  it('shows the inspector note the catalogue attached to a control', () => {
    page();
    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false }));
    expect(screen.getByText(UNUSUAL)).toBeTruthy();
    expect(screen.getByText('Almost shut for a dull thud.')).toBeTruthy();
  });

  it('Blank patch sets every control to its init and unplugs everything, leaving the sound named', () => {
    storeSession({
      presetId: 'wobble',
      step: null,
      values: { 'filter.cutoff': 2 },
      cables: [['j.lfoTri', 'j.cutCv']],
    });
    page();
    expect(button('Unplug all')).toBeTruthy();
    expect(screen.queryByText(/controls? moved/)).toBeNull();

    fireEvent.click(button('Blank patch'));

    expect(screen.queryByRole('button', { name: 'Unplug all' })).toBeNull();
    expect(screen.getByText('Wobble lead')).toBeTruthy();
    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      String(def.init['filter.cutoff'])
    );
    expect(screen.getByText('1 control moved')).toBeTruthy(); // the sound has cutoff at 2
  });

  it('offers "Unplug all" only when there are cables, and it removes them but keeps the knobs', () => {
    const { unmount } = page();
    expect(screen.queryByRole('button', { name: 'Unplug all' })).toBeNull();
    unmount();

    storeSession({
      presetId: 'wobble',
      step: null,
      values: { 'filter.cutoff': 2 },
      cables: [['j.lfoTri', 'j.cutCv']],
    });
    page();
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();

    fireEvent.click(button('Unplug all'));

    expect(screen.queryByRole('button', { name: 'Unplug all' })).toBeNull();
    expect(screen.queryByText(/Cables in this patch/)).toBeNull();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('plugs a cable in from the inspector and lists it', () => {
    page();
    act(() =>
      focusStore.set({
        kind: 'cable',
        id: 'j.lfoTri>j.cutCv',
        from: 'j.lfoTri',
        to: 'j.cutCv',
        x: 0,
        y: 0,
        tip: false,
      })
    );

    fireEvent.click(button('Plug it in'));

    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
    expect(button('Unplug all')).toBeTruthy();
    expect(paramsSent().at(-1)?.p?.cables).toHaveLength(1);
  });

  it('plugs the same cable in only once', () => {
    page();
    const focusCable = () =>
      act(() =>
        focusStore.set({
          kind: 'cable',
          id: 'j.lfoTri>j.cutCv',
          from: 'j.lfoTri',
          to: 'j.cutCv',
          x: 0,
          y: 0,
          tip: false,
        })
      );
    focusCable();
    fireEvent.click(button('Plug it in'));
    // The inspector now shows it plugged in; plugging in again is a no-op in the page.
    expect(screen.queryByRole('button', { name: 'Plug it in' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
  });

  it('unplugs one cable from the cable list with its ×', () => {
    storeSession({
      presetId: 'wobble',
      step: null,
      values: {},
      cables: [
        ['j.lfoTri', 'j.cutCv'],
        ['j.filtCont', 'j.loudCv'],
      ],
    });
    page();
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 2' })).toBeTruthy();

    fireEvent.click(button('Unplug LFO (triangle) → CUT CV'));

    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unplug FILT CONT → LOUD CV' })).toBeTruthy();
  });

  it('turns the Explain sections switch into a note that locks the knobs, and clears area focus', () => {
    page();
    act(() => focusStore.set({ kind: 'area', id: 'filter', x: 0, y: 0, tip: true }));

    fireEvent.click(button('Explain sections'));

    expect(screen.getByText(/Explain sections is on/)).toBeTruthy();
    expect(button('Explain sections').getAttribute('aria-pressed')).toBe('true');
    expect(focusStore.get()).toBeNull();
  });

  it('turns info cards off and on, and remembers it', () => {
    page();
    fireEvent.click(button(/Info cards: on/));
    expect(button(/Info cards: off/).getAttribute('aria-pressed')).toBe('false');
    expect(readStored('kys.tips')).toBe(false);

    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 5, y: 5, tip: true }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

// ── the view ────────────────────────────────────────────────────────────────

describe('SynthPage view', () => {
  const outline = () => screen.getByRole('button', { name: 'Outline' });

  it('starts in the hardware view', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    page();
    expect(outline().getAttribute('aria-pressed')).toBe('false');
    expect(replace).not.toHaveBeenCalled();
  });

  it('the Outline switch stores the view and puts it in the URL without a navigation', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    page();

    fireEvent.click(outline());

    expect(outline().getAttribute('aria-pressed')).toBe('true');
    expect(readStored('kys.view')).toEqual({ outline: true, long: false });
    expect(replace).toHaveBeenCalledExactlyOnceWith(null, '', '/synths/model-d?view=outline');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('switching back to Hardware drops the query', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    page({ viewParam: 'outline' });
    fireEvent.click(screen.getByRole('button', { name: 'Hardware' }));
    expect(replace).toHaveBeenLastCalledWith(null, '', '/synths/model-d');
    expect(readStored('kys.view')).toEqual({ outline: false, long: false });
  });

  it('starts in outline when the URL says so', () => {
    page({ viewParam: 'outline' });
    expect(outline().getAttribute('aria-pressed')).toBe('true');
  });

  it('applies the stored view when the URL has none, and writes it back to the URL', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: true, long: false }));
    const replace = vi.spyOn(window.history, 'replaceState');

    page();

    expect(outline().getAttribute('aria-pressed')).toBe('true');
    expect(replace).toHaveBeenCalledWith(null, '', '/synths/model-d?view=outline');
  });

  it('lets the URL win over the stored view', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: true, long: false }));
    page({ viewParam: 'long' });
    expect(outline().getAttribute('aria-pressed')).toBe('false');
  });

  it('ignores a stored view that is not a view', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: 'yes' }));
    page();
    expect(outline().getAttribute('aria-pressed')).toBe('false');
  });
});

// ── arrival, the picker and the URL ─────────────────────────────────────────

describe('SynthPage navigation', () => {
  const openPicker = () => fireEvent.click(screen.getByRole('button', { name: /Synth\s*Model D/ }));

  it('remembers the synth it opened on, for /synths to reopen', () => {
    page();
    expect(readStored('kys.synth')).toBe('model-d');
  });

  it('navigates to another synth from the picker, carrying the view', () => {
    page({ viewParam: 'outline' });
    openPicker();

    fireEvent.click(screen.getByRole('option', { name: /OB-X/ }));

    expect(router.push).toHaveBeenCalledExactlyOnceWith('/synths/ob-x?view=outline');
  });

  it('does not navigate when the current synth is chosen again', () => {
    page();
    openPicker();
    fireEvent.click(screen.getByRole('option', { name: /Model D/ }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('takes the view from a hash link to this synth, in place: a navigation would keep the old view', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    window.location.hash = '#model-d/outline';
    page();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(replace).toHaveBeenLastCalledWith(null, '', '/synths/model-d?view=outline');
    expect(readStored('kys.synth')).toBe('model-d');
  });

  it('follows a hash link to another listed synth, and does not store the synth it is leaving', () => {
    window.location.hash = '#ob-x';
    page();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/synths/ob-x');
    expect(readStored('kys.synth')).toBeNull();
  });

  it('leaves a hash that is not a listed synth alone', () => {
    window.location.hash = '#bank/moog';
    page();
    expect(router.replace).not.toHaveBeenCalled();
    expect(readStored('kys.synth')).toBe('model-d');
  });
});

// ── playing from the computer keyboard ──────────────────────────────────────

describe('SynthPage computer keyboard', () => {
  const notes = () =>
    engine.send.mock.calls
      .map((c) => c[0] as { type: string; n?: number; v?: number })
      .filter((m) => m.type === 'noteOn' || m.type === 'noteOff');

  it('plays a note from a QWERTY key: "a" is MIDI 48, at velocity 0.85, and releases on key up', () => {
    page();
    fireEvent.keyDown(window, { key: 'a' });
    expect(notes()).toEqual([{ type: 'noteOn', n: 48, v: 0.85 }]);

    fireEvent.keyUp(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 48 });
  });

  it('plays the right semitone for another key, whatever the case', () => {
    page();
    fireEvent.keyDown(window, { key: 'K' });
    expect(notes()).toEqual([{ type: 'noteOn', n: 60, v: 0.85 }]);
  });

  it('does not repeat a note while the key is held', () => {
    page();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    expect(notes()).toHaveLength(1);
  });

  it('shifts the octave with z and x, clamped to -1..+2', () => {
    page();
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'z' }); // already at the bottom (-1)
    fireEvent.keyDown(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOn', n: 48 - 12, v: 0.85 });
    fireEvent.keyUp(window, { key: 'a' });

    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOn', n: 48 + 24, v: 0.85 });
  });

  it('shows the octave on the keyboard strip', () => {
    page();
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('ignores keys typed into the search box', () => {
    page();
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.keyDown(input, { key: 'a' });
    fireEvent.keyDown(input, { key: 'z' });
    expect(notes()).toEqual([]);
    expect(screen.queryByText('-1')).toBeNull();
  });

  it('ignores keys pressed with a modifier', () => {
    page();
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    expect(notes()).toEqual([]);
  });

  it('plays from the on-screen keys too', () => {
    page();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 60' }));
    expect(notes()).toEqual([{ type: 'noteOn', n: 60, v: 0.85 }]);
    fireEvent.pointerUp(window);
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 60 });
  });

  it('holds notes with Hold: release does not stop them, the next note replaces them', () => {
    page();
    fireEvent.click(button('Hold'));

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyUp(window, { key: 'a' });
    expect(notes()).toEqual([{ type: 'noteOn', n: 48, v: 0.85 }]);

    fireEvent.keyDown(window, { key: 's' });
    expect(notes()).toEqual([
      { type: 'noteOn', n: 48, v: 0.85 },
      { type: 'noteOff', n: 48 },
      { type: 'noteOn', n: 50, v: 0.85 },
    ]);

    fireEvent.click(button('Hold')); // switching hold off lets the held note go
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 50 });
  });

  it('releases the note a key started, even after the octave moved while it was held', () => {
    page();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyUp(window, { key: 'a' });
    expect(notes()).toEqual([
      { type: 'noteOn', n: 48, v: 0.85 },
      { type: 'noteOff', n: 48 },
    ]);
  });

  it('lets every held key go when the window loses focus, since their key-ups go elsewhere', () => {
    page();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent(window, new Event('blur'));
    expect(notes().slice(-2)).toEqual([
      { type: 'noteOff', n: 48 },
      { type: 'noteOff', n: 52 },
    ]);
    // And the keys play again on return, rather than being stuck as "down".
    fireEvent.keyDown(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOn', n: 48, v: 0.85 });
  });

  it('releases a note that was already sounding when Hold went on', () => {
    page();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.click(button('Hold'));
    fireEvent.keyUp(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 48 });
  });

  it('starts the audio on the first note, since a browser only allows it after a gesture', async () => {
    page();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a' });
    });
    expect(engine.resume).toHaveBeenCalledTimes(1);
  });

  it('sends the mod wheel to the engine with the next parameters', () => {
    page();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mod wheel' }), { key: 'ArrowUp' });
    expect(paramsSent().at(-1)?.p?.wheel).toBe(0.05);
  });
});

// ── remembering the panel ───────────────────────────────────────────────────

describe('SynthPage session', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('writes the panel to kys.session.model-d once it has been still for the write delay', () => {
    page();
    fireEvent.click(button('A-440'));

    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS - 1);
    });
    expect(readStored(SESSION_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readStored(SESSION_KEY)).toMatchObject({
      presetId: 'fat-bass',
      step: null,
      values: { 'out.a440': true, 'filter.cutoff': -2 },
      cables: [],
    });
  });

  it('writes a drag as one change, not many', () => {
    page();
    fireEvent.click(button('A-440'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS - 50);
    });
    fireEvent.click(button('A-440'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS - 50);
    });
    // The second change restarted the clock, so nothing has been written yet.
    expect(readStored(SESSION_KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(readStored(SESSION_KEY)).toMatchObject({ values: { 'out.a440': false } });
  });

  it('writes cables as [from, to] pairs', () => {
    page();
    act(() =>
      focusStore.set({
        kind: 'cable',
        id: 'j.lfoTri>j.cutCv',
        from: 'j.lfoTri',
        to: 'j.cutCv',
        x: 0,
        y: 0,
        tip: false,
      })
    );
    fireEvent.click(button('Plug it in'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    expect(readStored(SESSION_KEY)).toMatchObject({ cables: [['j.lfoTri', 'j.cutCv']] });
  });

  it('restores the panel on a fresh mount', () => {
    const first = page();
    fireEvent.click(button('A-440'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    first.unmount();

    page();

    expect(screen.getByText('1 control moved')).toBeTruthy();
    expect(paramsSent().at(-1)?.p).toBeDefined();
  });

  it('restores the loaded sound and its cables', () => {
    storeSession({
      presetId: 'wobble',
      step: null,
      values: { 'filter.cutoff': 2, 'mix.osc1': 3 },
      cables: [['j.lfoTri', 'j.cutCv']],
    });
    page();
    expect(screen.getByText('Wobble lead')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
    expect(screen.getByText('1 control moved')).toBeTruthy(); // mix.osc1 is 3, the sound leaves it at 8
  });

  it('starts from the first sound when the stored session is not usable', () => {
    window.localStorage.setItem(SESSION_KEY, '{"presetId": 7}');
    page();
    expect(screen.getByText('Fat bass')).toBeTruthy();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('drops stored values the synth does not have', () => {
    storeSession({
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': -2, 'mix.osc1': 9, 'no.such': 5, 'out.a440': true },
      cables: [],
    });
    page();
    expect(screen.getByText('1 control moved')).toBeTruthy();
  });

  it("keeps each synth's panel under its own key", () => {
    page();
    fireEvent.click(button('A-440'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    expect(readStored('kys.session.model-d')).not.toBeNull();
    expect(readStored('kys.session.ob-x')).toBeNull();
  });
});

// ── the effects rack on the page ────────────────────────────────────────────

describe('SynthPage effects', () => {
  it('sends a rack change to the engine and stores it', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: /^Effects off$/ }));

    expect(engine.setFx).toHaveBeenLastCalledWith(expect.objectContaining({ on: true }));
    expect(readStored('kys.fx')).toMatchObject({ on: true });
  });
});

// The regions the page lays out.
describe('SynthPage regions', () => {
  it('has the Keyboard, the rack and the inspector in the one section', () => {
    page();
    const stage = screen.getByRole('region', { name: 'Model D panel' });
    expect(within(stage).getByRole('slider', { name: 'Mod wheel' })).toBeTruthy();
    expect(within(stage).getByRole('heading', { name: /Effects rack/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Control inspector' })).toBeTruthy();
  });
});

// ── edge behaviours ─────────────────────────────────────────────────────────

describe('SynthPage riff and engine events', () => {
  const fire = (e: { type: string }) => act(() => events.fn?.(e));

  it('goes back to "Play riff" when the engine says the phrase ended', async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Play riff'));
    });
    expect(button('Stop riff')).toBeTruthy();

    fire({ type: 'phraseEnd' });

    expect(button('Play riff')).toBeTruthy();
  });

  it('keeps playing through any other engine event', async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Play riff'));
    });
    fire({ type: 'meter' });
    expect(button('Stop riff')).toBeTruthy();
  });

  it('plays the riff again when "Restore sound" is pressed while it plays', async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Play riff'));
    });
    fireEvent.click(button('A-440'));
    engine.send.mockClear();

    await act(async () => {
      fireEvent.click(button('Restore sound'));
    });

    expect(engine.send).toHaveBeenCalledWith({ type: 'phrase', phrase: FAT_BASS.phrase });
  });

  it('does not start a riff when "Restore sound" is pressed while none plays', () => {
    page();
    fireEvent.click(button('A-440'));
    engine.send.mockClear();
    fireEvent.click(button('Restore sound'));
    expect(engine.send.mock.calls.some((c) => (c[0] as { type: string }).type === 'phrase')).toBe(
      false
    );
  });
});

describe('SynthPage engine errors', () => {
  const failing = () => {
    const real = def.toEngine;
    const state = { fail: undefined as unknown };
    vi.spyOn(def, 'toEngine').mockImplementation((v, c) => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the page must cope with a non-Error thrown
      if (state.fail !== undefined) throw state.fail;
      return real(v, c);
    });
    return state;
  };

  it('shows the error text in an alert when toEngine throws, and clears it on the next good send', () => {
    const state = failing();
    state.fail = new Error('cutoff out of range');
    page();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'This panel setting could not be turned into sound: cutoff out of range'
    );

    state.fail = undefined;
    fireEvent.click(button('A-440'));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a thrown non-Error as text', () => {
    const state = failing();
    state.fail = 'plain string';
    page();
    expect(screen.getByRole('alert').textContent).toContain(': plain string');
  });

  it('sends nothing to the engine for the failing patch', () => {
    const state = failing();
    state.fail = new Error('boom');
    page();
    expect(paramsSent()).toHaveLength(0);
  });
});

describe('SynthPage sounds', () => {
  const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;

  it('with no sounds it opens on a blank patch with nothing to restore or play', () => {
    page({ detail: { ...detail, sounds: [] } });
    expect(loadedName()).toBe('Blank patch');
    expect(screen.queryByRole('button', { name: 'Restore sound' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play riff' })).toBeNull();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('with no sounds the fresh session has no sound id, a moved control counts against the init, and there is still nothing to restore', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    page({ detail: { ...detail, sounds: [] } });
    fireEvent.click(button('A-440'));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    expect(readStored(SESSION_KEY)).toMatchObject({ presetId: null, step: null });
    expect(screen.getByText('1 control moved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore sound' })).toBeNull();
  });

  it('falls back to the first sound when the stored sound is not in the list', () => {
    storeSession({ presetId: 'gone', step: null, values: {}, cables: [] });
    page();
    expect(loadedName()).toBe('Fat bass');
    // The first sound is the target: the stored cutoff (init 1) is off its -2.
    expect(screen.getByText(/moved/)).toBeTruthy();

    fireEvent.click(button('Restore sound'));

    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      '-2'
    );
    expect(screen.queryByText(/moved/)).toBeNull();
  });

  it("puts a control back to the first sound's value when the stored sound is unknown", () => {
    storeSession({ presetId: 'gone', step: null, values: { 'filter.cutoff': 3 }, cables: [] });
    page();
    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false }));

    fireEvent.click(button('Put it back'));

    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      '-2'
    );
  });
});

describe('SynthPage patch edge cases', () => {
  const focusLfoCable = () =>
    act(() =>
      focusStore.set({
        kind: 'cable',
        id: 'j.lfoTri>j.cutCv',
        from: 'j.lfoTri',
        to: 'j.cutCv',
        x: 0,
        y: 0,
        tip: false,
      })
    );

  it('does not duplicate a cable plugged in twice in one go', () => {
    page();
    focusLfoCable();
    const plug = button('Plug it in');

    act(() => {
      plug.click();
      plug.click();
    });

    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
  });

  it('ignores a control set to the value it already has', () => {
    storeSession({
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': -2, 'mix.osc1': 10 },
      cables: [],
    });
    page();
    const sent = paramsSent().length;
    const knob = screen.getAllByRole('slider', { name: 'VOLUME' })[0];

    fireEvent.keyDown(knob, { key: 'ArrowUp' }); // already at 10

    expect(paramsSent()).toHaveLength(sent);
    expect(screen.getByText('1 control moved')).toBeTruthy();

    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    expect(paramsSent()).toHaveLength(sent + 1);
  });

  describe('dragging a plug', () => {
    const at = (id: string) => {
      const j = def.jacks.find((x) => x.id === id);
      if (!j) throw new Error(`no jack ${id}`);
      return { clientX: j.x, clientY: j.y };
    };
    const plugs = () => document.querySelectorAll<SVGGElement>('g[style*="grab"]');
    const drag = (plug: SVGGElement, from: string, to: string) => {
      fireEvent.pointerDown(plug, { ...at(from), pointerId: 1 });
      fireEvent.pointerMove(plug, at(to));
      fireEvent.pointerUp(plug, at(to));
    };

    it('moves one end of a cable to another jack', () => {
      storeSession({
        presetId: 'fat-bass',
        step: null,
        values: {},
        cables: [['j.lfoTri', 'j.cutCv']],
      });
      page();

      drag(plugs()[0], 'j.lfoTri', 'j.mix');

      expect(screen.getByRole('button', { name: 'Unplug MIX → CUT CV' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Unplug LFO (triangle) → CUT CV' })).toBeNull();
      expect(paramsSent().at(-1)?.p?.cables).toHaveLength(1);
    });

    it('ignores a move that would duplicate another cable', () => {
      storeSession({
        presetId: 'fat-bass',
        step: null,
        values: {},
        cables: [
          ['j.lfoTri', 'j.cutCv'],
          ['j.lfoSq', 'j.cutCv'],
        ],
      });
      page();
      expect(plugs()).toHaveLength(4);

      drag(plugs()[2], 'j.lfoSq', 'j.lfoTri'); // the second cable's source onto the first's

      expect(screen.getByRole('button', { name: 'Unplug LFO (square) → CUT CV' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Unplug LFO (triangle) → CUT CV' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Cables in this patch · 2' })).toBeTruthy();
    });
  });

  it('sends no noteOff for a key that was never pressed, or for a key with no note', () => {
    page();
    fireEvent.keyUp(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'q' });
    fireEvent.keyUp(window, { key: 'q' });
    const sentNotes = engine.send.mock.calls.filter((c) =>
      ['noteOn', 'noteOff'].includes((c[0] as { type: string }).type)
    );
    expect(sentNotes).toEqual([]);
  });

  it('Explain sections clears an area focus but keeps a control focus', () => {
    page();
    const control = { kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false } as const;
    act(() => focusStore.set(control));

    fireEvent.click(button('Explain sections'));
    expect(focusStore.get()).toEqual(control);

    act(() => focusStore.set({ kind: 'area', id: 'filter', x: 0, y: 0, tip: true }));
    fireEvent.click(button('Explain sections'));
    expect(focusStore.get()).toBeNull();
  });

  it('leaves the URL alone for a stored view that is the default', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: false, long: false }));
    const replace = vi.spyOn(window.history, 'replaceState');
    page();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });
});
