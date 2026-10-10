// @vitest-environment happy-dom

/**
 * The synth page over Model D's real catalogue content, as `getSynthDetail()` serves it to the route: every sound
 * opens from the library onto the panel, lessons step the panel through a sound, and the tour, lineage and "What is
 * not modelled" open from the synth bar with what the API sent. The router and the audio engine are fakes; the panel,
 * library, lesson and dialogs are real.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { findStore, focusStore, highlightStore } from '@/components/app/synth/stores';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { CatalogueSound, SynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { modelDRows } from '@/tests/helpers/model-d-detail';
import { expectedParams, lastParams } from '@/tests/helpers/synth-engine';

const { router, engine } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
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

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
let detail: SynthDetail;

beforeAll(async () => {
  // The page loads its definition on its own (`defs/load.ts`). Loaded here, it renders without suspending.
  await loadSynthDef('model-d');
  // happy-dom has no SVG geometry or pointer capture; the panel only needs the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
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
});

afterEach(() => {
  act(() => {
    focusStore.set(null);
    findStore.set(null);
    highlightStore.set([]);
  });
});

function page() {
  return render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;
const library = () => {
  const section = screen.getByRole('heading', { name: 'Sound library' }).closest('section');
  if (!section) throw new Error('no library');
  return section;
};
describe('the library on the page', () => {
  it('opens every one of Model D’s 99 sounds onto the panel', () => {
    page();
    expect(detail.sounds).toHaveLength(99);
    // Every sound but the first, which is loaded, then the first again.
    const order = [...detail.sounds.slice(1), detail.sounds[0]];
    for (const p of order) {
      const row = within(library())
        .getAllByRole('button')
        .find((b) => b.querySelector('.font-semibold')?.textContent === p.name);
      if (!row) throw new Error(`${p.name} is not in the library`);
      fireEvent.click(row);
      expect(loadedName()).toBe(p.name);
      expect(row.getAttribute('aria-current')).toBe('true');
      expect(screen.getByRole('heading', { level: 2, name: p.name })).toBeTruthy();
      expect(lastParams(engine.send)).toEqual(expectedParams(def, p));
    }
    // 99 full re-renders of the panel: ~11s alone, past the 30s default under coverage on a loaded machine.
  }, 90_000);
});

describe('the lesson on the page', () => {
  const pickSound = () => {
    const p = detail.sounds.find((s) => s.steps.length > 2);
    if (!p) throw new Error('no sound with several steps');
    return p;
  };
  const open = (p: CatalogueSound) => {
    const row = within(library())
      .getAllByRole('button')
      .find((b) => b.querySelector('.font-semibold')?.textContent === p.name);
    if (!row) throw new Error(`${p.name} is not in the library`);
    fireEvent.click(row);
  };

  it('steps the panel through a sound, one step at a time, then back to the finished sound', () => {
    page();
    const p = pickSound();
    open(p);
    fireEvent.click(button('Build it step by step'));
    expect(screen.getByText(`step 1 of ${p.steps.length}`)).toBeTruthy();
    expect(lastParams(engine.send)).toEqual(expectedParams(def, p, 0));
    expect(highlightStore.get().length).toBeGreaterThan(0);

    const next = screen.getAllByRole('button').find((b) => b.textContent === 'Next step');
    if (!next) throw new Error('no Next step');
    fireEvent.click(next);
    expect(screen.getByText(`step 2 of ${p.steps.length}`)).toBeTruthy();
    expect(lastParams(engine.send)).toEqual(expectedParams(def, p, 1));

    fireEvent.click(button(`Step ${p.steps.length}: ${p.steps[p.steps.length - 1].title}`));
    fireEvent.click(button('Finish'));
    expect(screen.queryByText(/^step \d+ of/)).toBeNull();
    expect(lastParams(engine.send)).toEqual(expectedParams(def, p));
  });

  it('leaves the walkthrough when another sound is picked', () => {
    page();
    const p = pickSound();
    open(p);
    fireEvent.click(button('Build it step by step'));
    const other = detail.sounds.find((s) => s.id !== p.id);
    if (!other) throw new Error('only one sound');
    open(other);
    expect(screen.queryByText(/^step \d+ of/)).toBeNull();
    expect(lastParams(engine.send)).toEqual(expectedParams(def, other));
  });
});

describe('the synth bar’s tour, lineage and limits', () => {
  it('opens the tour from its switch, and Explain sections closes it', () => {
    page();
    expect(screen.queryByRole('dialog', { name: /Orientation tour/ })).toBeNull();
    fireEvent.click(button('Orientation tour'));
    expect(button('Orientation tour').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Orientation tour of the Model D' })).toBeTruthy();
    fireEvent.click(button('Explain sections'));
    expect(screen.queryByRole('dialog', { name: /Orientation tour/ })).toBeNull();
  });

  it('shows the API’s unusual notes in the tour', () => {
    page();
    fireEvent.click(button('Orientation tour'));
    const tour = screen.getByRole('dialog', { name: 'Orientation tour of the Model D' });
    // The naming stop is made only of unusual notes; find it by moving through.
    const texts = Object.values(detail.notes.unusual);
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) {
      seen = texts.some((t) => tour.textContent?.includes(t));
      if (!seen) fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    }
    expect(seen).toBe(true);
  });

  it('closes the tour with ×', () => {
    page();
    fireEvent.click(button('Orientation tour'));
    fireEvent.click(button('End the tour'));
    expect(screen.queryByRole('dialog', { name: /Orientation tour/ })).toBeNull();
    expect(button('Orientation tour').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens the lineage with the API’s lineage, from History › and from About', () => {
    page();
    const lineageTitle = detail.lineage?.title ?? '';
    const dialog = screen
      .getByRole('heading', { name: lineageTitle, hidden: true })
      .closest('dialog');
    if (!dialog) throw new Error('no lineage dialog');
    expect(dialog.open).toBe(false);
    fireEvent.click(button('History ›'));
    expect(dialog.open).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog.open).toBe(false);
    fireEvent.click(button('Where it comes from: the Model D’s lineage'));
    expect(dialog.open).toBe(true);
    // The same dialog both times, not a second copy of it.
    expect(screen.getAllByRole('heading', { name: lineageTitle, hidden: true })).toHaveLength(1);
  });

  it('opens "What is not modelled" with the API’s limits, from the bar and from About', () => {
    page();
    const dialog = screen
      .getByRole('heading', { name: 'What is not modelled', hidden: true })
      .closest('dialog');
    if (!dialog) throw new Error('no limits dialog');
    fireEvent.click(button('What is not modelled ›'));
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByText(detail.notes.limits.intro ?? '')).toBeTruthy();
    expect(within(dialog).getByText(detail.notes.limits.items[0].title)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(button('What this app does not model on the Model D'));
    expect(dialog.open).toBe(true);
  });

  it('offers no History for a synth with no lineage', () => {
    render(
      <SynthPage detail={{ ...detail, lineage: null }} synths={[detail.synth]} viewParam={null} />
    );
    expect(screen.queryByRole('button', { name: 'History ›' })).toBeNull();
    expect(screen.queryByRole('button', { name: /lineage/ })).toBeNull();
  });
});
