// @vitest-environment happy-dom

/**
 * The version toggle on the synth page (`f-synth-families` t-320): shown only on a family member, switching lands on
 * the sibling's URL, and the sibling's page opens with the panel carried across and a note on what did not carry. The
 * definitions, the translation and the panel are real; the router and the audio engine are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/synth/family-carry.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { readStored } from '@/components/app/synth/storage';
import { takeCarry } from '@/components/app/synth/family-carry';
import type { CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { SynthFamily } from '@/lib/app/families/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { defaultPatchState } from '@/lib/app/synths/default-patch';
import { tallScreen } from '@/tests/helpers/synth-side';
import { comeBackTo } from '@/tests/helpers/synth-session';
import { TB_303_FAMILY } from '@/tests/helpers/synth-family';

const { router, engine } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    start: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
    ctx: null,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
// Signed out. The real client's session-refresh timer can fire after jsdom tears down ("window is not defined").
vi.mock('@/lib/auth/client', () => ({ useSession: () => ({ data: null, isPending: false }) }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));

const td3 = getSynthDef('td-3');
const tb303 = getSynthDef('tb-303');
if (!td3 || !tb303) throw new Error('the TB-303 family is not registered');

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(async () => {
  // Loaded here, each page renders without suspending, and the toggle finds the sibling at hand.
  await loadSynthDef('td-3');
  await loadSynthDef('tb-303');
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

beforeEach(() => {
  window.localStorage.clear();
  tallScreen();
  window.location.hash = '';
  router.push.mockReset();
  router.replace.mockReset();
  takeCarry('');
});

const synth = (id: 'td-3' | 'tb-303', maker: string, year: number): CatalogueSynth => {
  const def = id === 'td-3' ? td3 : tb303;
  return {
    id,
    name: def.name,
    maker,
    year,
    heritage: `${def.name} heritage`,
    summary: 'A bass line.',
    design: 'neutral',
    definitionVersion: def.version,
    soundCount: 0,
  };
};
const SYNTHS = [synth('td-3', 'Behringer', 2019), synth('tb-303', 'Roland', 1981)];

const detailOf = (s: CatalogueSynth, family: SynthFamily | null): SynthDetail => ({
  synth: s,
  sounds: [],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  links: { count: 0, kinds: [] },
  soundLinks: {},
  instruments: [],
  family,
});

const page = (i: 0 | 1, family: SynthFamily | null = TB_303_FAMILY) =>
  render(
    <SynthPage
      key={SYNTHS[i].id}
      detail={detailOf(SYNTHS[i], family)}
      synths={SYNTHS}
      families={family ? [family] : []}
      viewParam={null}
    />
  );

/** A TD-3 panel left with its resonance up, its tuning past the TB-303's range and its distortion on. */
const leaveTd3 = () => {
  comeBackTo('td-3');
  window.localStorage.setItem(
    'kys.session.td-3',
    JSON.stringify({
      presetId: null,
      step: null,
      soundId: null,
      ...defaultPatchState(td3),
      values: {
        ...defaultPatchState(td3).values,
        'filter.res': 7,
        'osc.tune': 10,
        'dist.on': true,
      },
    })
  );
};

describe('the version toggle', () => {
  it('shows only on a synth with a family', () => {
    const { unmount } = page(0, null);
    expect(screen.queryByRole('group', { name: /versions$/ })).toBeNull();
    unmount();
    page(0);
    const toggle = screen.getByRole('group', { name: 'TB-303 versions' });
    expect(
      within(toggle)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['TD-3', 'TB-303']);
  });

  it("lands on the sibling's URL with the panel carried across, naming what did not carry", async () => {
    leaveTd3();
    const first = page(0);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'TB-303 versions' })).getByRole('button', {
        name: 'TB-303',
      })
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    expect(router.push.mock.calls[0][0]).toMatch(/^\/synths\/tb-303(\?|$)/);
    first.unmount();

    // The navigation, as the router would make it: the TB-303's page, keyed afresh.
    page(1);
    const note = await screen.findByText(/Panel carried over from the TD-3/);
    const items = within(note.closest('[role="status"]') as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toContain('The TB-303 has no distortion');
    expect(items.some((r) => r?.includes('became 5'))).toBe(true);

    // What it keeps: the resonance as it was, and the tuning clamped to the TB-303's range.
    await waitFor(() =>
      expect(readStored('kys.session.tb-303')).toMatchObject({
        values: { 'filter.res': 7, 'osc.tuning': 5 },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Panel carried over/)).toBeNull();
  });

  it('opens a member reached any other way on its Default patch, with no note', () => {
    leaveTd3();
    page(1);
    expect(screen.queryByText(/Panel carried over/)).toBeNull();
  });
});
