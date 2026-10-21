// @vitest-environment happy-dom

/**
 * The synth page: the provider that holds the panel's state and lays out the regions. The panel, inspector,
 * keyboard, effects rack and search are real; the router and the audio engine are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import {
  findStore,
  focusStore,
  highlightStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { SESSION_WRITE_DELAY_MS, readStored } from '@/components/app/synth/storage';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { openSide, stepShown, tallScreen } from '@/tests/helpers/synth-side';

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
// Signed out. The real client's session-refresh timer can fire after jsdom tears down ("window is not defined").
vi.mock('@/lib/auth/client', () => ({ useSession: () => ({ data: null, isPending: false }) }));
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

beforeAll(async () => {
  // The page loads its definition on its own (`defs/load.ts`). Loaded here, it renders without suspending.
  await loadSynthDef('model-d');
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
  design: 'neutral',
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
  design: 'neutral',
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
/** A control in the panel settings under the panel (t-72). */
const setting = (name: string | RegExp) =>
  within(screen.getByRole('group', { name: 'Panel settings' })).getByRole('button', { name });
/** The sound named after "Loaded:" over the panel. The library and the lesson name it too. */
const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;
const paramsSent = () =>
  engine.send.mock.calls
    .map((c) => c[0] as { type: string; p?: Record<string, unknown> })
    .filter((m) => m.type === 'params');

beforeEach(() => {
  window.localStorage.clear();
  tallScreen();
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

  it('waits for a definition that has not loaded yet, then shows the synth', async () => {
    // Every other test here has the definition loaded already. A fresh module graph has not, as on a first visit,
    // so the page has to suspend on the load (`use()`) rather than find it at hand.
    vi.resetModules();
    const fresh = await import('@/components/app/synth/synth-page');
    const { loadedSynthDef: freshLoaded } = await import('@/lib/app/synths/defs/load');
    expect(freshLoaded('model-d')).toBeUndefined();

    // A component that suspends is only retried inside an awaited act().
    await act(async () => {
      render(
        <Suspense fallback={<p>Waiting for the panel</p>}>
          <fresh.SynthPage detail={detail} synths={[MODEL_D_SYNTH, OTHER_SYNTH]} viewParam={null} />
        </Suspense>
      );
    });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Behringer Model D · Modelled on the 1970 Minimoog Model D'
    );
    expect(screen.queryByText('Waiting for the panel')).toBeNull();
    expect(freshLoaded('model-d')).toBeDefined();
  });

  it('shows the synth heading, the loaded sound, and About › for the summary', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Behringer Model D · Modelled on the 1970 Minimoog Model D'
    );
    expect(loadedName()).toBe('Fat bass');
    expect(screen.getByText('Loaded:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About ›' })).toBeTruthy();
    expect(screen.getByText(MODEL_D_SYNTH.summary)).toBeTruthy();
  });

  /** The panel's outer SVG, lower-cased, and its printed text. */
  const drawn = () => {
    const face = screen.getByRole('group', { name: 'Behringer Model D front panel' });
    const panel = face.closest('svg') ?? face;
    return { svg: panel.outerHTML.toLowerCase(), text: panel.textContent?.toLowerCase() ?? '' };
  };

  it('draws a neutral synth in its own faceplate colours with no maker mark (D11 revised)', () => {
    page();
    const { svg, text } = drawn();
    expect(svg).toContain('#1b1c1e'); // Model D's own faceplate
    expect(text).not.toContain('behringer'); // no printed maker mark
  });

  it("draws the maker's marks when the synth's design is faithful", () => {
    page({ detail: { ...detail, synth: { ...MODEL_D_SYNTH, design: 'faithful' } } });
    const { svg, text } = drawn();
    expect(svg).toContain('#1b1c1e');
    expect(text).toContain('behringer');
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

  it('fits the panel to the page, and zooms it in its scroller with the controls still live', () => {
    page();
    const frame = screen.getByTestId('panel-frame');
    // The width the screen gives it, capped at 1560px and by the screen's height (see `panelFrameStyle`), times the scale.
    expect(frame.style.width).toMatch(/^calc\(1 \* min\(100%, min\(1560px, /);
    expect(frame.className).not.toContain('min-w-');

    fireEvent.click(button('Zoom in'));
    fireEvent.click(button('Zoom in'));
    expect(frame.style.width).toMatch(/^calc\(1\.2 \* min\(100%, min\(1560px, /);

    // Laid out bigger, not magnified: a knob still turns from the keyboard.
    const cutoff = screen.getAllByRole('slider', { name: /CUTOFF/ })[0];
    const before = cutoff.getAttribute('aria-valuenow');
    fireEvent.keyDown(cutoff, { key: 'ArrowUp' });
    expect(cutoff.getAttribute('aria-valuenow')).not.toBe(before);

    fireEvent.click(button('Fit the panel to the page'));
    expect(frame.style.width).toMatch(/^calc\(1 \* min\(100%, min\(1560px, /);
  });

  it('puts the rotate note above the panel on a small screen, and not on a wide one', () => {
    const { unmount } = page();
    expect(screen.queryByRole('note')).toBeNull();
    unmount();

    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(max-width: 1023px)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );
    page();
    expect(screen.getByRole('note').textContent).toMatch(/a landscape tablet or a bigger screen/);
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

  it('starts the audio on "Unmute", then offers "Mute"', async () => {
    page();
    await act(async () => {
      fireEvent.click(button('Unmute'));
    });
    // `resume` starts the engine the first time (Engine.resume); the page does not choose.
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(button('Mute')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
    expect(meterStore.get().power).toBe(true);
  });

  it('reads "Sound unavailable" when the audio cannot start', async () => {
    engine.resume.mockRejectedValue(new Error('no audio'));
    page();
    await act(async () => {
      fireEvent.click(button('Unmute'));
    });
    expect(button('Sound unavailable')).toBeTruthy();
  });

  it('opens already on when the engine was left running by another synth', () => {
    engine.running = true;
    page();
    expect(button('Mute')).toBeTruthy();
  });

  it('suspends the engine and clears the held notes when sound is turned off', async () => {
    engine.running = true;
    page();
    act(() => notesStore.set([60]));

    await act(async () => {
      fireEvent.click(button('Mute'));
    });

    expect(engine.suspend).toHaveBeenCalledTimes(1);
    expect(button('Unmute')).toBeTruthy();
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
  // At `lg` and up the region these use is in its drawer (t-70).

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
    openSide('Inspect');
    fireEvent.click(button('A-440'));
    act(() => focusStore.set({ kind: 'control', id: 'out.a440', x: 0, y: 0, tip: false }));

    fireEvent.click(button('Put it back'));

    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('offers no "Put it back" during a lesson step, as the panel and the card do not', () => {
    storeSession({ presetId: 'fat-bass', step: 0, values: { 'filter.cutoff': 5 }, cables: [] });
    page();
    openSide('Inspect');
    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false }));
    expect(screen.getByText(UNUSUAL)).toBeTruthy(); // the inspector is showing the control
    expect(screen.queryByRole('button', { name: 'Put it back' })).toBeNull();
  });

  it('reads a stored step past the end of its sound as the finished sound', () => {
    expect(FAT_BASS.steps).toHaveLength(1);
    storeSession({ presetId: 'fat-bass', step: 3, values: {}, cables: [] });
    page();
    expect(loadedName()).toBe('Fat bass');
    expect(stepShown()).toBeNull();
    openSide('Lesson');
    const card = screen.getByTestId('lesson-card');
    expect(card.textContent).toContain('The finished sound');
    expect(within(card).getByRole('button', { name: /Build it step by step/ })).toBeTruthy();
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
    openSide('Inspect');
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
    expect(loadedName()).toBe('Wobble lead');
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
    openSide('Inspect');
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();

    fireEvent.click(button('Unplug all'));

    expect(screen.queryByRole('button', { name: 'Unplug all' })).toBeNull();
    expect(screen.queryByText(/Cables in this patch/)).toBeNull();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('plugs a cable in from the inspector and lists it', () => {
    page();
    openSide('Inspect');
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
    openSide('Inspect');
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
    openSide('Inspect');
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

  it('turns hover cards off and on, and remembers it', () => {
    page();
    const cards = () => within(screen.getByRole('group', { name: 'Hover help' }));
    expect(cards().getByRole('button', { name: 'On' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cards().getByRole('button', { name: 'Off' }));
    expect(cards().getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true');
    expect(readStored('kys.tips')).toBe(false);

    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 5, y: 5, tip: true }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

// ── the view ────────────────────────────────────────────────────────────────

describe('SynthPage view', () => {
  const outline = () => setting('Outline');

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
    fireEvent.click(setting('Hardware'));
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
    expect(setting('Outline').getAttribute('aria-pressed')).toBe('true');
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
    window.location.hash = '#unlisted/outline';
    page();
    expect(router.replace).not.toHaveBeenCalled();
    expect(readStored('kys.synth')).toBe('model-d');
  });

  it("sends a databank link to the databank's page, and does not store the synth", () => {
    window.location.hash = '#bank/artists/kraftwerk';
    page();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/bank/artists/kraftwerk');
    expect(readStored('kys.synth')).toBeNull();
  });
});

describe('SynthPage ?sound=', () => {
  it('opens with that sound loaded, over the one stored, and takes it out of the URL', () => {
    storeSession({ presetId: 'fat-bass', step: null, values: { 'filter.cutoff': 5 }, cables: [] });
    window.history.replaceState(null, '', '/synths/model-d?sound=wobble');
    const replace = vi.spyOn(window.history, 'replaceState');

    page({ soundParam: 'wobble' });

    expect(loadedName()).toBe(WOBBLE.name);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/synths/model-d');
  });

  it('keeps the view the URL or the last choice gave it', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: true, long: false }));
    window.history.replaceState(null, '', '/synths/model-d?sound=wobble');
    const replace = vi.spyOn(window.history, 'replaceState');

    page({ soundParam: 'wobble' });

    expect(loadedName()).toBe(WOBBLE.name);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/synths/model-d?view=outline');
  });

  it.each(['#bank/artists/kraftwerk', '#ob-x'])(
    'leaves the stored panel alone when %s sends the visitor elsewhere',
    (hash) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      storeSession({ presetId: 'fat-bass', step: null, values: {}, cables: [] });
      window.location.hash = hash;
      page({ soundParam: 'wobble' });
      expect(router.replace).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS * 2);
      });
      expect(readStored(SESSION_KEY)).toMatchObject({ presetId: 'fat-bass' });
      vi.useRealTimers();
    }
  );

  it('opens as it would have for a sound the library does not have', () => {
    storeSession({ presetId: 'wobble', step: null, values: {}, cables: [] });
    window.history.replaceState(null, '', '/synths/model-d?sound=nope');
    page({ soundParam: 'nope' });
    expect(loadedName()).toBe(WOBBLE.name);
    expect(window.location.search).toBe('');
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

  it('ignores keys pressed inside a modal dialog over the page', () => {
    page();
    const dialog = document.createElement('dialog');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    try {
      fireEvent.keyDown(inside, { key: 'a' });
      fireEvent.keyDown(inside, { key: 'z' });
      expect(notes()).toEqual([]);
      expect(screen.queryByText('-1')).toBeNull();
    } finally {
      dialog.remove();
    }
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
    fireEvent.keyUp(window, { key: 's' });

    fireEvent.click(button('Hold')); // switching hold off lets the held note go
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 50 });
  });

  it('holds a chord with Hold: keys pressed together all stay, the next fresh press replaces them all', () => {
    page();
    fireEvent.click(button('Hold'));

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyUp(window, { key: 'a' });
    fireEvent.keyUp(window, { key: 'd' });
    expect(notes()).toEqual([
      { type: 'noteOn', n: 48, v: 0.85 },
      { type: 'noteOn', n: 52, v: 0.85 },
    ]);

    fireEvent.keyDown(window, { key: 's' });
    expect(notes().slice(2)).toEqual([
      { type: 'noteOff', n: 48 },
      { type: 'noteOff', n: 52 },
      { type: 'noteOn', n: 50, v: 0.85 },
    ]);
  });

  it('holds a chord played with two fingers on the on-screen keys', () => {
    page();
    fireEvent.click(button('Hold'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 60' }), { pointerId: 1 });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 64' }), { pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(notes()).toEqual([
      { type: 'noteOn', n: 60, v: 0.85 },
      { type: 'noteOn', n: 64, v: 0.85 },
    ]);
  });

  it('keeps a note whose key is still down when Hold goes off, and stops it on release', () => {
    page();
    fireEvent.click(button('Hold'));
    fireEvent.keyDown(window, { key: 'a' }); // still down
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyUp(window, { key: 's' }); // held by Hold alone

    fireEvent.click(button('Hold'));
    expect(notes().slice(2)).toEqual([{ type: 'noteOff', n: 50 }]);
    fireEvent.keyUp(window, { key: 'a' });
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 48 });
  });

  it('starts Hold clean after a release that never arrived: the next press replaces, not joins', () => {
    page();
    fireEvent.click(button('Hold'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 60' }), { pointerId: 1 });
    // Released outside the window: no pointer up, and turning Hold off and on forgets it.
    fireEvent.click(button('Hold'));
    fireEvent.click(button('Hold'));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyUp(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    expect(notes().slice(-2)).toEqual([
      { type: 'noteOff', n: 48 },
      { type: 'noteOn', n: 50, v: 0.85 },
    ]);
  });

  it('under Hold, a note two inputs press stays down until both let go', () => {
    page();
    fireEvent.click(button('Hold'));
    fireEvent.keyDown(window, { key: 'k' }); // 60 from the computer keys
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 60' }), { pointerId: 1 });
    fireEvent.keyUp(window, { key: 'k' }); // the finger still holds 60
    fireEvent.keyDown(window, { key: 'l' }); // joins the chord rather than replacing it
    expect(notes().filter((m) => m.type === 'noteOff')).toEqual([]);
  });

  it('keeps a note two inputs press sounding until both let go', () => {
    page();
    fireEvent.keyDown(window, { key: 'k' }); // 60 from the computer keys
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Note 60' }), { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(notes().filter((m) => m.type === 'noteOff')).toEqual([]);
    fireEvent.keyUp(window, { key: 'k' });
    expect(notes().at(-1)).toEqual({ type: 'noteOff', n: 60 });
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

  it('releases a key whose character changed before it was let go (Shift turns ; into :)', () => {
    page();
    fireEvent.keyDown(window, { key: ';', code: 'Semicolon' });
    fireEvent.keyUp(window, { key: ':', code: 'Semicolon', shiftKey: true });
    expect(notes()).toEqual([
      { type: 'noteOn', n: 64, v: 0.85 },
      { type: 'noteOff', n: 64 },
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
  // At `lg` and up the region these use is in its drawer (t-70).

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
    openSide('Inspect');
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
    openSide('Inspect');
    expect(loadedName()).toBe('Wobble lead');
    expect(screen.getByRole('heading', { name: 'Cables in this patch · 1' })).toBeTruthy();
    expect(screen.getByText('1 control moved')).toBeTruthy(); // mix.osc1 is 3, the sound leaves it at 8
  });

  it('starts from the first sound when the stored session is not usable', () => {
    window.localStorage.setItem(SESSION_KEY, '{"presetId": 7}');
    page();
    expect(loadedName()).toBe('Fat bass');
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

describe('SynthPage piano', () => {
  it('has the piano out on a tall screen and put away on a short one, until the Piano button says otherwise', () => {
    const { unmount } = page();
    expect(screen.getByRole('slider', { name: 'Mod wheel' })).toBeTruthy();
    unmount();

    tallScreen(800);
    page();
    expect(screen.queryByRole('slider', { name: 'Mod wheel' })).toBeNull();
    expect(button('Piano').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button('Piano'));
    expect(screen.getByRole('slider', { name: 'Mod wheel' })).toBeTruthy();
    // The choice is kept, and wins over the screen's height from then on.
    expect(readStored('kys.deck')).toBe(true);
  });
});

describe('SynthPage effects', () => {
  it('sends a rack change to the engine and stores it', () => {
    page();
    // The rack opens in the card over the panel from the player bar (t-74).
    fireEvent.click(button('Effects'));
    fireEvent.click(screen.getByRole('button', { name: /^Effects off$/ }));

    expect(engine.setFx).toHaveBeenLastCalledWith(expect.objectContaining({ on: true }));
    expect(readStored('kys.fx')).toMatchObject({ on: true });
  });
});

// The regions the page lays out.
describe('SynthPage regions', () => {
  it('has the keyboard in the player, and the rack and the inspector in its card, one at a time', () => {
    page();
    const stage = screen.getByRole('region', { name: 'Model D panel' });
    expect(within(stage).getByRole('slider', { name: 'Mod wheel' })).toBeTruthy();
    fireEvent.click(button('Effects'));
    expect(within(stage).getByRole('heading', { name: /Effects rack/ })).toBeTruthy();
    openSide('Inspect');
    expect(within(stage).getByRole('heading', { name: 'Control inspector' })).toBeTruthy();
    expect(within(stage).queryByRole('heading', { name: /Effects rack/ })).toBeNull();
  });
});

// ── the player (`f-player` t-69) ────────────────────────────────────────────

describe('SynthPage player', () => {
  const TWO_STEPS = sound({
    id: 'two-steps',
    name: 'Two steps',
    ref: 'In the style of two people',
    blurb: 'A sound in two moves.',
    steps: [
      { title: 'Open the mixer', module: 'mixer', why: 'Loud.', set: { 'mix.osc1': 9 } },
      { title: 'Close the filter', module: 'filter', why: 'Dark.', set: { 'filter.cutoff': -2 } },
    ],
  });
  const twoSteps = () => page({ detail: { ...detail, sounds: [TWO_STEPS] } });
  const cutoff = () =>
    screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow');
  const player = () => screen.getByRole('region', { name: 'Model D panel' });

  it('names the synth in the page heading and puts its picker on the stage', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Behringer Model D · Modelled on the 1970 Minimoog Model D'
    );
    expect(within(player()).getByRole('button', { name: /Synth\s*Model D/ })).toBeTruthy();
  });

  it('draws one chapter per lesson step and one for the finished sound, and goes to the one clicked', () => {
    twoSteps();
    const chapters = within(player()).getByRole('list', { name: 'Lesson steps' });
    expect(
      within(chapters)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual([
      'Lesson step 1: Open the mixer',
      'Lesson step 2: Close the filter',
      'The finished sound',
    ]);
    // The finished sound is where it opens.
    expect(button('The finished sound').getAttribute('aria-current')).toBe('step');

    // The finished sound has the second step's cutoff on the panel.
    expect(cutoff()).toBe('-2');

    fireEvent.click(button('Lesson step 1: Open the mixer'));
    expect(stepShown()).toBe('step 1 of 2');
    expect(button('Lesson step 1: Open the mixer').getAttribute('aria-current')).toBe('step');
    expect(button('The finished sound').getAttribute('aria-current')).toBeNull();
    // The panel is at the first step: the cutoff the second step sets is not on it yet.
    expect(cutoff()).not.toBe('-2');

    fireEvent.click(button('The finished sound'));
    expect(stepShown()).toBeNull();
    expect(cutoff()).toBe('-2');
  });

  it('opens a chapter in the card over the panel, saying which step it is, only while walking', () => {
    twoSteps();
    expect(within(player()).queryByText('Loud.')).toBeNull();
    fireEvent.click(button('Lesson step 1: Open the mixer'));
    const card = within(player()).getByTestId('lesson-card');
    expect(card.textContent).toMatch(/Step 1 of 2 · Mixer/);
    expect(card.textContent).toMatch(/Open the mixer/);
    expect(within(card).getByText('Loud.')).toBeTruthy();
  });

  it('starts, steps through and finishes the lesson from the card', () => {
    twoSteps();
    fireEvent.click(button('The finished sound'));
    fireEvent.click(button('Build it step by step'));
    expect(stepShown()).toBe('step 1 of 2');
    expect(button('Previous lesson step').hasAttribute('disabled')).toBe(true);

    fireEvent.click(button('Next lesson step'));
    expect(stepShown()).toBe('step 2 of 2');

    fireEvent.click(button('Previous lesson step'));
    expect(stepShown()).toBe('step 1 of 2');

    fireEvent.click(button('Next lesson step'));
    fireEvent.click(button('Finish the lesson'));
    expect(stepShown()).toBeNull();
    expect(button('Build it step by step')).toBeTruthy();
  });

  it('heads the steps as Sound design and labels each with the part of the synth it works on', () => {
    twoSteps();
    const strip = within(player()).getByRole('region', { name: 'Learn sound design' });
    const chapters = within(strip).getByRole('list', { name: 'Lesson steps' });
    const labels = within(chapters)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(labels).toEqual([
      '1MixerOpen the mixer',
      '2FilterClose the filter',
      'FinishedHow it works',
    ]);
  });

  it('keeps the step in a card between Previous and Next, and invites a start with the finished sound on', () => {
    twoSteps();
    fireEvent.click(button('The finished sound'));
    const card = within(player()).getByTestId('lesson-card');
    expect(card.textContent).toMatch(/The finished sound/);
    fireEvent.click(within(card).getByRole('button', { name: /Build it step by step/ }));
    expect(card.textContent).toMatch(/Step 1 of 2 · Mixer/);
    expect(card.textContent).toMatch(/Loud\./);
    expect(within(card).getByRole('button', { name: 'Previous lesson step' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Next lesson step' })).toBeTruthy();
  });

  it('opens the library over the bar from the sound’s name, and closes it from there again', async () => {
    twoSteps();
    const pick = within(player()).getByRole('button', { name: 'Choose a sound (now: Two steps)' });
    expect(pick.getAttribute('title')).toContain('In the style of two people');
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(pick);
    expect(pick.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
    fireEvent.click(pick);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('lights a chapter’s controls on the panel while it is pointed at, but not while a lesson is walked', () => {
    twoSteps();
    fireEvent.pointerEnter(button('Lesson step 2: Close the filter'));
    expect(highlightStore.get()).toEqual(['filter.cutoff']);
    fireEvent.pointerLeave(button('Lesson step 2: Close the filter'));
    expect(highlightStore.get()).toEqual([]);

    // Walking, the lesson lights the step the panel is at, and pointing at another chapter leaves it lit.
    fireEvent.click(button('Lesson step 1: Open the mixer'));
    const lit = highlightStore.get();
    fireEvent.pointerEnter(button('Lesson step 2: Close the filter'));
    fireEvent.pointerLeave(button('Lesson step 2: Close the filter'));
    expect(highlightStore.get()).toEqual(lit);
  });

  it('has no chapters or step buttons for a sound with no steps', () => {
    page({ detail: { ...detail, sounds: [{ ...FAT_BASS, steps: [] }] } });
    expect(screen.queryByRole('list', { name: 'Lesson steps' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start the lesson' })).toBeNull();
    expect(button('Play riff')).toBeTruthy();
  });

  it('describes the library sound on the panel under the player', () => {
    twoSteps();
    const about = screen.getByRole('region', { name: 'About the sound' });
    expect(within(about).getByText('In the style of two people')).toBeTruthy();
    expect(within(about).getByText('A sound in two moves.')).toBeTruthy();
  });

  it('puts the player full screen where the browser can, and draws no button where it cannot', () => {
    const { unmount } = page();
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
    unmount();

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    const was = HTMLElement.prototype.requestFullscreen;
    HTMLElement.prototype.requestFullscreen = request;
    try {
      page();
      fireEvent.click(button('Full screen'));
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.contexts[0]).toBe(player());

      // The browser says the player is full screen: the button leaves it.
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: player(),
      });
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      fireEvent.click(button('Leave full screen'));
      expect(exit).toHaveBeenCalledTimes(1);
    } finally {
      // Own properties shadow jsdom's, so removing them puts its defaults back.
      Reflect.deleteProperty(document, 'fullscreenElement');
      Reflect.deleteProperty(document, 'fullscreenEnabled');
      Reflect.deleteProperty(document, 'exitFullscreen');
      HTMLElement.prototype.requestFullscreen = was;
    }
  });

  it('opens the tour inside the player, so it shows with the player full screen', () => {
    page();
    fireEvent.click(button(/Orientation tour/));
    const tour = screen.getByRole('dialog', { name: 'Orientation tour of the Model D' });
    expect(player().contains(tour)).toBe(true);
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
  // At `lg` and up the region these use is in its drawer (t-70).

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
    openSide('Inspect');
    act(() => focusStore.set({ kind: 'control', id: 'filter.cutoff', x: 0, y: 0, tip: false }));

    fireEvent.click(button('Put it back'));

    expect(screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow')).toBe(
      '-2'
    );
  });
});

describe('SynthPage patch edge cases', () => {
  // At `lg` and up the region these use is in its drawer (t-70).

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
    openSide('Inspect');
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
      openSide('Inspect');

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
      openSide('Inspect');
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
    expect(setting('Outline').getAttribute('aria-pressed')).toBe('false');
  });
});
