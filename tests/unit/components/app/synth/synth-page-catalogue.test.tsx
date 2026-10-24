// @vitest-environment happy-dom

/**
 * Every listed synth opens on its page: the definition the page loads for the id, the catalogue content the API
 * serves for it, the panel drawn with all of its controls and jacks and none of its maker's marks, and the library's sounds playing
 * as the definition says. Model D's page is tested sound by sound in `synth-page-content.test.tsx`; this is the same
 * page over each of the others. The router and the audio engine are fakes; the panel and the library are real.
 *
 * @see components/app/synth/synth-page.tsx
 * @see lib/app/synths/defs/load.ts
 */

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { SynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { faceView, isShown, presetState } from '@/lib/app/synths/lib/patch';
import type { SynthDef } from '@/lib/app/synths/contract';
import { importPhrase } from '@/lib/app/sequencer/import';
import { patternLength } from '@/lib/app/sequencer/pattern';
import { expectedParams, lastParams } from '@/tests/helpers/synth-engine';
import { catalogueData, synthRows } from '@/tests/helpers/synth-detail';
import { openSide, tallScreen } from '@/tests/helpers/synth-side';

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
  prisma: {
    synth: { findFirst: vi.fn() },
    synthNote: { findMany: vi.fn() },
    // "Heard on" (the databank): none, unless a test says otherwise.
    bankInstrument: { findMany: vi.fn(async () => []) },
    bankSong: { findMany: vi.fn(async () => []) },
  },
}));

/** Every synth the catalogue lists: each one must open. */
const LISTED = catalogueData().listing.synths.map((s) => s.id);

/** Listed synths with a modular layout: they open as modules, and switch to the long faceplate and back. */
const MODULAR = LISTED.filter((id) => getSynthDef(id)?.modular);

/**
 * Listed synths whose panel prints no maker's marks. Every other definition must tag its marks `brand`, so a port that
 * forgot to tag them fails here; a synth with no marks is named here rather than given a tag it has no mark for.
 */
const UNBRANDED = new Set<string>(['ems-vcs3']);

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(() => {
  // happy-dom has no SVG geometry or pointer capture; the panel only needs the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

// Yield a macrotask after each test, so V8 can free the page it drew. happy-dom holds its nodes through WeakRefs, and
// V8 keeps a WeakRef's target alive until the microtask queue drains — which, as the runner chains tests on promises,
// it otherwise never does in this file. Without it every page drawn stays live: ~4 GB over 25 synths, past the heap of
// a CI worker.
afterEach(() => new Promise<void>((r) => setTimeout(r)));

beforeEach(() => {
  window.localStorage.clear();
  tallScreen();
  window.location.hash = '';
  window.history.replaceState(null, '', window.location.pathname);
  engine.send.mockReset();
});

// The library opens over the bar from the sound picker (t-74).
const library = () => {
  openSide('Sounds');
  const section = screen.getByRole('heading', { name: 'Patch library' }).closest('section');
  if (!section) throw new Error('no library');
  return section;
};
const soundRows = () =>
  within(library())
    .getAllByRole('button')
    .filter((b) => b.querySelector('.font-semibold'));
it('lists more than Model D, so the cases below are not one synth', () => {
  expect(LISTED.length).toBeGreaterThan(1);
});

/** The definition the page loads for a listed synth, and its detail built through the real read layer. */
const loadPage = async (id: string): Promise<{ def: AppSynthDef; detail: SynthDetail }> => {
  const loading = loadSynthDef(id);
  if (!loading) throw new Error(`${id} is listed but has no definition to load`);
  const def = await loading;
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = synthRows(id);
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail(id);
  if (!detail) throw new Error(`no ${id} detail`);
  return { def, detail };
};

const frontPanel = (def: AppSynthDef) =>
  screen.getByRole('group', { name: `${def.maker} ${def.name} front panel` });

/**
 * The ids of the controls the opening sound shows that the panel does not draw: each is found by the accessible name
 * it is drawn with (a button row's options as `name: option`, a joystick's two axes as one "Joystick").
 */
const undrawn = (panel: HTMLElement, def: AppSynthDef, sound: SynthDetail['sounds'][number]) => {
  const { values } = presetState(def, sound);
  const names = [...panel.querySelectorAll('[aria-label]')].map((e) =>
    (e.getAttribute('aria-label') ?? '').replace(/\n/g, ' ')
  );
  return def.controls
    .filter((c) => isShown(c, values) && !(c.type === 'joystick' && c.pairOf))
    .filter((c) => {
      const name = c.type === 'joystick' ? 'Joystick' : (c.label || c.id).replace(/\n/g, ' ');
      return !names.some((n) => n === name || n.startsWith(`${name}: `));
    })
    .map((c) => c.id);
};

describe.each(LISTED)('the %s page', (id) => {
  let def: AppSynthDef;
  let detail: SynthDetail;

  beforeAll(async () => {
    ({ def, detail } = await loadPage(id));
  });

  const page = () => render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);

  it('opens with every sound in the library and every control and jack on the panel', () => {
    const { container } = page();
    expect(
      screen.getByRole('heading', { name: `About this ${def.name}`, hidden: true })
    ).toBeTruthy();
    expect(soundRows().map((r) => r.querySelector('.font-semibold')?.textContent)).toEqual(
      detail.sounds.map((s) => s.name)
    );
    // A pin matrix's jacks are its row and column legends.
    const jacks = container.querySelectorAll(
      '[aria-label$=" input jack"], [aria-label$=" output jack"], [aria-label$=" matrix row"], [aria-label$=" matrix column"]'
    );
    expect(jacks).toHaveLength(def.jacks.length);
    expect(def.controls.length).toBeGreaterThan(0);
    expect(undrawn(frontPanel(def), def, detail.sounds[0])).toEqual([]);
  });

  it('opens the sequencer under the panel holding the first sound’s riff, and plays it as a pattern', async () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Sequencer' }));
    const seq = screen.getByRole('region', { name: 'Sequencer' });
    const riff = detail.sounds[0].phrase;
    // Sixteen keys to a page: the first page of the riff's steps.
    const steps = patternLength(importPhrase(riff));
    expect(within(seq).getAllByRole('button', { name: /^Step \d+:/ })).toHaveLength(
      Math.min(16, steps)
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
    const start = engine.send.mock.calls
      .map((c) => c[0] as { type: string; loop?: { notes: unknown[] } })
      .find((m) => m.type === 'pattern');
    expect(start?.loop?.notes).toHaveLength(riff.steps.length);
  });

  it('draws the neutral panel without the maker’s marks it tags', () => {
    page();
    const marks = def.decor.filter((d) => d.brand);
    expect(marks.length > 0, 'brand marks are tagged, or the synth is UNBRANDED').toBe(
      !UNBRANDED.has(id)
    );
    // The panel's own SVG (the picker above it draws an icon first), read as whole lines of lettering: a mark such
    // as the TB-303's "R" is also a letter of RESONANCE.
    const panel = frontPanel(def);
    const drawn = new Set(
      [...panel.querySelectorAll('text, tspan')].map((t) => t.textContent?.trim())
    );
    const lines = (t: unknown): string[] =>
      typeof t === 'string'
        ? t
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
    const unbranded = def.decor
      .filter((d) => !d.brand)
      .flatMap((d) => lines('text' in d && d.text));
    expect(
      unbranded.some((l) => drawn.has(l)),
      'the panel draws its other printed lettering'
    ).toBe(true);
    // A line a mark shares with untagged print or a label (the 2600's "2600" is not printed elsewhere, but a
    // future mark might be) is not evidence either way.
    const shared = new Set([
      ...unbranded,
      ...def.controls.flatMap((c) => lines(c.label)),
      ...def.jacks.flatMap((j) => lines(j.label)),
    ]);
    for (const mark of marks)
      for (const line of lines('text' in mark && mark.text))
        if (!shared.has(line)) expect(drawn.has(line), line).toBe(false);
  });

  it('plays the first sound on opening, and the last when it is picked', () => {
    page();
    expect(lastParams(engine.send)).toEqual(expectedParams(def, detail.sounds[0]));
    const last = detail.sounds[detail.sounds.length - 1];
    const row = soundRows().find(
      (b) => b.querySelector('.font-semibold')?.textContent === last.name
    );
    if (!row) throw new Error(`${last.name} is not in the library`);
    fireEvent.click(row);
    expect(lastParams(engine.send)).toEqual(expectedParams(def, last));
  });
});

describe.each(MODULAR)('the %s page’s panel layout', (id) => {
  let def: AppSynthDef;
  let detail: SynthDetail;

  beforeAll(async () => {
    ({ def, detail } = await loadPage(id));
  });

  it('opens as modules, switches to the long faceplate, and back, drawing every control in each', () => {
    render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);
    // The front panel only: the long faceplate's view leaves its end cheeks out (the case has none).
    const viewBox = (d: SynthDef) => {
      const f = faceView(d);
      return `${f.x} 0 ${f.w} ${f.h}`;
    };
    const modules = viewBox(modularDef(def));
    const long = viewBox(def);
    expect(modules).not.toBe(long);
    const panel = () => frontPanel(def);
    const first = detail.sounds[0];
    const layout = within(screen.getByRole('group', { name: 'Panel layout' }));
    const pressed = (name: string) =>
      layout.getByRole('button', { name }).getAttribute('aria-pressed');

    expect(panel().getAttribute('viewBox')).toBe(modules);
    expect(pressed('Modular')).toBe('true');
    expect(undrawn(panel(), def, first)).toEqual([]);

    fireEvent.click(layout.getByRole('button', { name: 'Long' }));
    expect(panel().getAttribute('viewBox')).toBe(long);
    expect(pressed('Long')).toBe('true');
    expect(window.location.search).toBe('?view=long');
    expect(undrawn(panel(), def, first)).toEqual([]);

    fireEvent.click(layout.getByRole('button', { name: 'Modular' }));
    expect(panel().getAttribute('viewBox')).toBe(modules);
    expect(pressed('Modular')).toBe('true');
    expect(window.location.search).toBe('');
  });
});

it('switches the layout on every Jupiter, the synths that have one', () => {
  expect(MODULAR).toEqual(expect.arrayContaining(['jupiter-4', 'jupiter-6', 'jupiter-8']));
});

describe('the VCS3 page’s pin matrix', () => {
  it('puts a pin in a hole, and the engine hears the new route', async () => {
    const { def, detail } = await loadPage('ems-vcs3');
    render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);
    const m = def.matrix;
    if (!m) throw new Error('the VCS3 has no matrix');
    // Row 7 (noise) into column G (the reverb's input): a hole the opening sound leaves empty.
    const [row, col] = [m.rows.indexOf('r.noise'), m.cols.indexOf('c.rev')];
    expect([row, col]).toEqual([6, 6]);
    const route = expect.objectContaining({ src: 'noise', dst: 'revIn' });
    const before = lastParams(engine.send)?.cables;
    expect(before).not.toContainEqual(route);

    // The panel's CTM is the identity, so a client point is a point on the faceplate.
    fireEvent.click(screen.getByRole('grid'), {
      clientX: m.x + col * m.pitch,
      clientY: m.y + row * m.pitch,
    });

    const after = lastParams(engine.send)?.cables;
    expect(after).toEqual([...(Array.isArray(before) ? before : []), route]);
  });
});
