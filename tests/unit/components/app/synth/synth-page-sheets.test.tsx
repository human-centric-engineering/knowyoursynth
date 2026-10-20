// @vitest-environment happy-dom

/**
 * The synth page below `lg` (`f-phone-and-tablet` t-66): the library, lesson, inspector and tutor open from a bar as
 * bottom sheets, and at `lg` and up they sit in the grid as before. A tap on the panel opens the Inspector on what was
 * tapped; the Lesson sheet drops to half height on a new step and scrolls the step's controls into the band above it.
 * The panel, lesson, library and inspector are real; the router and the audio engine are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/ui/bottom-sheet.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import {
  findStore,
  focusStore,
  meterStore,
  notesStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { revealDelta, screenBox } from '@/components/app/synth/reveal';
import { HALF_HEIGHT } from '@/components/app/ui/bottom-sheet';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
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

function page(over: Partial<SynthPageProps> = {}) {
  return render(
    <SynthPage detail={detail} synths={[MODEL_D_SYNTH, OTHER_SYNTH]} viewParam={null} {...over} />
  );
}

/** The sound named after "Loaded:" over the panel. The library and the lesson name it too. */
const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;
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

/** Media queries answered as a phone would: narrower than `lg`, with a touch screen. */
function phone() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(max-width: 1023px)' || query === '(pointer: coarse)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
  );
}

const bar = () => screen.getByRole('navigation', { name: 'Beside the panel' });
const sheet = (name: string) => screen.getByRole('dialog', { name });
const cutoffKnob = () => screen.getAllByRole('slider', { name: /CUTOFF/ })[0];
const notesOn = () =>
  engine.send.mock.calls.filter((c) => (c[0] as { type: string }).type === 'noteOn');
/** A tap on the panel, as a first finger makes one: over the part, then down and up in the same place. */
function tap(el: Element) {
  const at = { clientX: 50, clientY: 50, pointerId: 1, pointerType: 'touch', isPrimary: true };
  fireEvent.pointerOver(el, at);
  fireEvent.pointerDown(el, at);
  fireEvent.pointerUp(el, at);
}

describe('at lg and up', () => {
  it('lays the regions out beside the panel as before, with no bar and no sheets', () => {
    page();
    expect(screen.queryByRole('navigation', { name: 'Beside the panel' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Sound library' })).toBeTruthy();
    expect(screen.getByRole('article', { name: /Fat bass/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Control inspector' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'About this Model D' })).toBeTruthy();
  });

  it('opens no Inspector sheet on a tap, and leaves the floating cards on', () => {
    page();
    tap(cutoffKnob());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('below lg', () => {
  it('puts the four regions behind a bar, each opening as its own sheet, and keeps About on the page', () => {
    phone();
    page();
    expect(
      within(bar())
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Library', 'Lesson', 'Inspector', 'Tutor']);
    expect(screen.queryByRole('region', { name: 'Sound library' })).toBeNull();
    expect(screen.queryByRole('article', { name: /Fat bass/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'About this Model D' })).toBeTruthy();

    fireEvent.click(within(bar()).getByRole('button', { name: 'Library' }));
    expect(within(sheet('Library')).getByRole('region', { name: 'Sound library' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Library', expanded: true, hidden: true }).closest('nav')
    ).not.toBeNull();

    // modal, it hides the page, the bar with it, until it is closed
    expect(screen.queryByRole('navigation', { name: 'Beside the panel' })).toBeNull();
    fireEvent.click(within(sheet('Library')).getByRole('button', { name: 'Close Library' }));

    // docked, the bar stays in reach, and one sheet at a time: its Library replaces the Lesson
    fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
    expect(within(sheet('Lesson')).getByRole('article', { name: /Fat bass/ })).toBeTruthy();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Library' }));
    expect(screen.queryByRole('dialog', { name: 'Lesson' })).toBeNull();
    expect(sheet('Library')).toBeTruthy();
    fireEvent.click(within(sheet('Library')).getByRole('button', { name: 'Close Library' }));

    // and pressing the open one again closes it
    fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the Library sheet when a sound is chosen from it, with the sound on the panel', () => {
    phone();
    page();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Library' }));
    fireEvent.click(within(sheet('Library')).getByRole('button', { name: /Wobble lead/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(loadedName()).toBe('Wobble lead');
  });

  it('plays no notes from the computer keys inside a modal sheet, and does inside a docked one', () => {
    phone();
    page();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Library' }));
    const inLibrary = within(sheet('Library')).getByRole('button', { name: 'Close Library' });
    fireEvent.keyDown(inLibrary, { key: 'a', code: 'KeyA' });
    expect(notesOn()).toHaveLength(0);
    fireEvent.click(inLibrary);

    fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
    fireEvent.keyDown(sheet('Lesson'), { key: 'a', code: 'KeyA' });
    expect(notesOn()).toHaveLength(1);
  });

  describe('a tap on the panel', () => {
    it("opens the Inspector, docked, on the tapped control's help, in place of the floating card", async () => {
      phone();
      page();
      tap(cutoffKnob());

      const inspector = await screen.findByRole('dialog', { name: 'Inspector' });
      expect(inspector.getAttribute('data-kys-sheet')).toBe('docked');
      expect(within(inspector).getByText(UNUSUAL)).toBeTruthy();
      // the card that would float at the finger is not drawn
      expect(screen.queryByRole('tooltip')).toBeNull();
      // and the panel stays where it is, live, above the sheet
      expect(cutoffKnob().closest('[aria-hidden="true"]')).toBeNull();
    });

    it('opens nothing when the finger moved: that was a turn of the knob, not a tap', async () => {
      phone();
      page();
      const knob = cutoffKnob();
      fireEvent.pointerDown(knob, {
        clientX: 50,
        clientY: 50,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      fireEvent.pointerUp(knob, {
        clientX: 50,
        clientY: 90,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens nothing on the first tap of a cable being plugged in, which the second tap needs', async () => {
      phone();
      page();
      tap(cutoffKnob());
      fireEvent.click(
        within(await screen.findByRole('dialog', { name: 'Inspector' })).getByRole('button', {
          name: 'Close Inspector',
        })
      );
      // a jack pressed once: the cable waits for its other end
      act(() => pendingStore.set('j.lfoTri'));
      tap(cutoffKnob());
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens nothing on a tap on bare panel, though the control touched before is still in focus', async () => {
      phone();
      page();
      tap(cutoffKnob());
      fireEvent.click(
        within(await screen.findByRole('dialog', { name: 'Inspector' })).getByRole('button', {
          name: 'Close Inspector',
        })
      );
      const bare = screen.getByTestId('panel-frame').querySelector('svg');
      expect(bare).not.toBeNull();
      if (bare) tap(bare);
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens nothing for a finger of a two-finger gesture, though it lifts where it landed', async () => {
      phone();
      page();
      const knob = cutoffKnob();
      const one = { clientX: 50, clientY: 50, pointerId: 1, pointerType: 'touch', isPrimary: true };
      const two = {
        clientX: 120,
        clientY: 50,
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: false,
      };
      fireEvent.pointerOver(knob, one);
      fireEvent.pointerDown(knob, one);
      fireEvent.pointerDown(knob, two);
      fireEvent.pointerUp(knob, two);
      fireEvent.pointerUp(knob, { ...one, clientY: 120 });
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('leaves the Lesson open rather than swapping it for the Inspector', async () => {
      phone();
      page();
      fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
      tap(cutoffKnob());
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(sheet('Lesson')).toBeTruthy();
      expect(screen.queryByRole('dialog', { name: 'Inspector' })).toBeNull();
    });
  });

  describe('the Lesson sheet', () => {
    it('drops from full to half height on a new step, and scrolls the step’s controls above it', async () => {
      phone();
      // a short screen: the band above the half-height sheet ends 55 px down, above the step's controls
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100);
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
      page();
      fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
      const lesson = sheet('Lesson');
      expect(lesson.getAttribute('data-snap')).toBe('half');
      fireEvent.click(within(lesson).getByRole('button', { name: 'Make Lesson taller' }));
      expect(lesson.getAttribute('data-snap')).toBe('full');
      expect(scrollBy).not.toHaveBeenCalled();

      fireEvent.click(within(lesson).getByRole('button', { name: 'Build it step by step' }));

      expect(sheet('Lesson').getAttribute('data-snap')).toBe('half');
      // Fat bass's first step sets CUTOFF and OSC 1's level: the box round both, brought into the band above the
      // half-height sheet, which is worked out rather than measured while the sheet is still shrinking
      const svg = screen.getByTestId('panel-frame').querySelector('svg');
      const box = svg && screenBox(svg, def, ['filter.cutoff', 'mix.osc1']);
      expect(box).not.toBeNull();
      const band = { start: 0, end: window.innerHeight * (1 - HALF_HEIGHT) };
      const dy = box ? revealDelta(box.y, band) : 0;
      expect(dy).not.toBe(0);
      await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ top: dy, behavior: 'smooth' }));
    });

    it('scrolls nothing when the Lesson sheet is made full height, which covers the panel', async () => {
      phone();
      // a short screen: the band above the half-height sheet ends 55 px down, above the step's controls
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100);
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
      page();
      fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
      const lesson = sheet('Lesson');
      fireEvent.click(within(lesson).getByRole('button', { name: 'Build it step by step' }));
      await waitFor(() => expect(scrollBy).toHaveBeenCalled());
      scrollBy.mockClear();

      fireEvent.click(within(lesson).getByRole('button', { name: 'Make Lesson taller' }));
      expect(lesson.getAttribute('data-snap')).toBe('full');
      // the frame a reveal would be scrolled in has been and gone
      await act(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(scrollBy).not.toHaveBeenCalled();
    });

    it('scrolls nothing for a step with the sheet closed', async () => {
      phone();
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
      page();
      fireEvent.click(within(bar()).getByRole('button', { name: 'Lesson' }));
      fireEvent.click(
        within(sheet('Lesson')).getByRole('button', { name: 'Build it step by step' })
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close Lesson' }));
      scrollBy.mockClear();
      // the lesson stays mounted while its sheet is closed, so the step is still lit on the panel
      expect(screen.getByText('step 1 of 1')).toBeTruthy();
      await act(() => new Promise((r) => setTimeout(r, 20)));
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });
});
