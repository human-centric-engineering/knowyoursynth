// @vitest-environment happy-dom

/**
 * Every listed synth opens on its page: the definition the page loads for the id, the catalogue content the API
 * serves for it, the panel drawn with all of its jacks and none of its maker's marks, and the library's sounds playing
 * as the definition says. Model D's page is tested sound by sound in `synth-page-content.test.tsx`; this is the same
 * page over each of the others. The router and the audio engine are fakes; the panel and the library are real.
 *
 * @see components/app/synth/synth-page.tsx
 * @see lib/app/synths/defs/load.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import type { SynthDetail } from '@/lib/app/catalogue/read';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { expectedParams, lastParams } from '@/tests/helpers/synth-engine';
import { catalogueData, synthRows } from '@/tests/helpers/synth-detail';

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

/** Every synth the catalogue lists: each one must open. */
const LISTED = catalogueData().listing.synths.map((s) => s.id);

/**
 * Listed synths whose panel prints no maker's marks. Every other definition must tag its marks `brand`, so a port that
 * forgot to tag them fails here; a synth with no marks is named here rather than given a tag it has no mark for.
 */
const UNBRANDED = new Set<string>([]);

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(() => {
  // happy-dom has no SVG geometry or pointer capture; the panel only needs the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  engine.send.mockReset();
});

const library = () => {
  const section = screen.getByRole('heading', { name: 'Sound library' }).closest('section');
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

describe.each(LISTED)('the %s page', (id) => {
  let def: AppSynthDef;
  let detail: SynthDetail;

  beforeAll(async () => {
    const loading = loadSynthDef(id);
    if (!loading) throw new Error(`${id} is listed but has no definition to load`);
    def = await loading;
    const { prisma } = await import('@/lib/db/client');
    const { stored, noteRows } = synthRows(id);
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
    vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
    const d = await getSynthDetail(id);
    if (!d) throw new Error(`no ${id} detail`);
    detail = d;
  });

  const page = () => render(<SynthPage detail={detail} synths={[detail.synth]} viewParam={null} />);

  it('opens with every sound in the library and every jack on the panel', () => {
    const { container } = page();
    expect(screen.getByRole('heading', { name: `About this ${def.name}` })).toBeTruthy();
    expect(soundRows().map((r) => r.querySelector('.font-semibold')?.textContent)).toEqual(
      detail.sounds.map((s) => s.name)
    );
    const jacks = container.querySelectorAll(
      '[aria-label$=" input jack"], [aria-label$=" output jack"]'
    );
    expect(jacks).toHaveLength(def.jacks.length);
  });

  it('draws the neutral panel without the maker’s marks it tags', () => {
    page();
    const marks = def.decor.filter((d) => d.brand);
    expect(marks.length > 0, 'brand marks are tagged, or the synth is UNBRANDED').toBe(
      !UNBRANDED.has(id)
    );
    // The panel's own SVG (the picker above it draws an icon first), read as whole lines of lettering: a mark such
    // as the TB-303's "R" is also a letter of RESONANCE.
    const panel = screen.getByRole('group', { name: `${def.maker} ${def.name} front panel` });
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
