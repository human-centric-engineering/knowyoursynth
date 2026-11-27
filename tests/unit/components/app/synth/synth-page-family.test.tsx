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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { readStored } from '@/components/app/synth/storage';
import { takeCarry } from '@/components/app/synth/family-carry';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { SynthFamily } from '@/lib/app/families/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { defaultPatchState } from '@/lib/app/synths/default-patch';
import { tallScreen } from '@/tests/helpers/synth-side';
import { comeBackTo } from '@/tests/helpers/synth-session';
import { TB_303_FAMILY } from '@/tests/helpers/synth-family';
import { FACTORY_PICKER } from '@/lib/app/picker/settings';

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
  window.history.replaceState(null, '', '/');
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
    kind: null,
    soundCount: 0,
  };
};
const SYNTHS = [synth('td-3', 'Behringer', 2019), synth('tb-303', 'Roland', 1981)];

/** A library sound on the TB-303, to open over a carried panel. */
const SQUELCH: CatalogueSound = {
  id: 'squelch',
  name: 'Squelch',
  ref: 'A test sound',
  artist: 'Nobody',
  tags: ['bass'],
  level: 1,
  blurb: 'A test sound.',
  how: 'Because.',
  phrase: { bpm: 120, loop: false, steps: [[0, 36, 1]] },
  steps: [{ title: 'Open the filter', module: 'filter', why: 'Bright.', set: { 'filter.res': 2 } }],
  context: {},
  tweaks: [],
  version: tb303.version,
};

const detailOf = (s: CatalogueSynth, family: SynthFamily | null): SynthDetail => ({
  synth: s,
  sounds: s.id === 'tb-303' ? [SQUELCH] : [],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  links: { count: 0, kinds: [] },
  soundLinks: {},
  siblingSounds: [],
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
    ).toEqual(['TD-3', 'TB-303', 'Unmodelled']);
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

  it('names no control the panel left at its Default patch (t-326)', async () => {
    // The distortion is left off, and its knobs where the Default patch has them: nothing of it is lost.
    comeBackTo('td-3');
    window.localStorage.setItem(
      'kys.session.td-3',
      JSON.stringify({
        presetId: null,
        step: null,
        soundId: null,
        ...defaultPatchState(td3),
        values: { ...defaultPatchState(td3).values, 'filter.res': 7, 'osc.tune': 10 },
      })
    );
    const first = page(0);
    fireEvent.click(screen.getByRole('button', { name: 'TB-303' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    first.unmount();

    page(1);
    const note = await screen.findByText(/Panel carried over from the TD-3/);
    const items = within(note.closest('[role="status"]') as HTMLElement)
      .queryAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items.some((r) => r?.includes('became 5'))).toBe(true);
    expect(items).not.toContain('The TB-303 has no distortion');
  });

  it('lets the note go once another sound opens over the carried panel', async () => {
    leaveTd3();
    const first = page(0);
    fireEvent.click(screen.getByRole('button', { name: 'TB-303' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    first.unmount();
    page(1);
    await screen.findByText(/Panel carried over from the TD-3/);

    fireEvent.click(screen.getByRole('button', { name: /^Choose a patch/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Patches' }))
        .getAllByRole('button')
        .filter((b) => b.textContent?.includes('Squelch'))[0]
    );
    await waitFor(() => expect(screen.queryByText(/Panel carried over/)).toBeNull());
  });

  it('leaves nothing for a later visit when the switch went somewhere else', async () => {
    leaveTd3();
    const first = page(0);
    fireEvent.click(screen.getByRole('button', { name: 'TB-303' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    // The visitor follows a link away instead, and the TD-3's page goes with nothing to take the carry.
    first.unmount();
    await new Promise((r) => setTimeout(r));
    page(1);
    expect(screen.queryByText(/Panel carried over/)).toBeNull();
  });

  it('leaves a carry alone on an arrival that opens its own sound', async () => {
    leaveTd3();
    const first = page(0);
    fireEvent.click(screen.getByRole('button', { name: 'TB-303' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    first.unmount();
    render(
      <SynthPage
        detail={detailOf(SYNTHS[1], TB_303_FAMILY)}
        synths={SYNTHS}
        families={[TB_303_FAMILY]}
        viewParam={null}
        soundParam="squelch"
      />
    );
    await waitFor(() =>
      expect(readStored('kys.session.tb-303')).toMatchObject({ presetId: 'squelch' })
    );
    expect(screen.queryByText(/Panel carried over/)).toBeNull();
  });

  it('opens a member reached any other way on its Default patch, with no note', () => {
    leaveTd3();
    page(1);
    expect(screen.queryByText(/Panel carried over/)).toBeNull();
  });
});

/** A note the page sent the engine, as the keys play it. */
const noteOns = () =>
  engine.send.mock.calls.map(([m]) => m as { type: string }).filter((m) => m.type === 'noteOn');
/** Shown, or hidden under the blank panel: the page leaves them in place, so they keep their state. */
const shown = (el: Element | null) => !!el && (el as HTMLElement).style.display !== 'none';
const instrument = () => screen.getByTestId('panel-frame').closest('.kys-instrument');
const dock = () => document.querySelector('.kys-dock');
const blankFace = () => screen.queryByRole('region', { name: 'Nobody Unmodelled, not modelled' });

describe('an unmodelled member (t-321)', () => {
  it('shows a blank panel with its name, maker, year and differences, at its own address, and nothing plays', () => {
    page(0);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyUp(window, { key: 'a' });
    const played = noteOns().length;
    expect(played).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Unmodelled' }));
    const face = blankFace();
    expect(face).not.toBeNull();
    expect(within(face as HTMLElement).getByRole('heading').textContent).toBe('Nobody Unmodelled');
    expect(face?.textContent).toContain('1997');
    expect(face?.textContent).toContain('Not modelled.');
    // Its address, written without a navigation: the page under it is not rendered again.
    expect(window.location.pathname + window.location.search).toBe('/synths/td-3?member=rebirth');
    expect(router.push).not.toHaveBeenCalled();

    // The panel, the keyboard, the sequencer's bar and the sound's controls are hidden, not drawn dead.
    expect(shown(instrument())).toBe(false);
    expect(shown(dock())).toBe(false);
    expect(screen.queryByRole('button', { name: /^Choose a patch/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask AI tutor' })).toBeNull();
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyUp(window, { key: 's' });
    expect(noteOns()).toHaveLength(played);
    expect(
      within(screen.getByRole('group', { name: 'TB-303 versions' }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-pressed'))
    ).toEqual(['false', 'false', 'true']);
  });

  it('comes back to the panel that was open, from the toggle or the way back on the blank panel', async () => {
    leaveTd3();
    window.history.replaceState(null, '', '/synths/td-3');
    page(0);
    await waitFor(() =>
      expect(readStored('kys.session.td-3')).toMatchObject({ values: { 'filter.res': 7 } })
    );
    const panel = instrument();
    // The way back steps back to the entry the blank panel was pushed over, rather than pushing another.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const push = vi.spyOn(window.history, 'pushState');

    fireEvent.click(screen.getByRole('button', { name: 'Unmodelled' }));
    expect(push).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the TD-3' }));
    expect(blankFace()).toBeNull();
    expect(back).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
    // The same panel, never taken down, and with what was on it.
    expect(instrument()).toBe(panel);
    expect(shown(panel)).toBe(true);
    expect(shown(dock())).toBe(true);
    expect(readStored('kys.session.td-3')).toMatchObject({
      values: { 'filter.res': 7, 'osc.tune': 10, 'dist.on': true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unmodelled' }));
    fireEvent.click(screen.getByRole('button', { name: 'TD-3' }));
    expect(back).toHaveBeenCalledTimes(2);
    expect(blankFace()).toBeNull();
    expect(shown(instrument())).toBe(true);
    expect(instrument()).toBe(panel);
    fireEvent.keyDown(window, { key: 'a' });
    expect(noteOns()).toHaveLength(1);
    back.mockRestore();
    push.mockRestore();
  });

  it('leaves an address it arrived on in place on the way back, with no entry pushed', () => {
    window.history.replaceState(null, '', '/synths/td-3?member=rebirth');
    const back = vi.spyOn(window.history, 'back');
    render(
      <SynthPage
        detail={detailOf(SYNTHS[0], TB_303_FAMILY)}
        synths={SYNTHS}
        families={[TB_303_FAMILY]}
        viewParam={null}
        memberParam="rebirth"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to the TD-3' }));
    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/synths/td-3');
    back.mockRestore();
  });

  it('stays on the page from a second blank panel chosen on an address it arrived on', () => {
    const second = {
      ...TB_303_FAMILY,
      members: [
        ...TB_303_FAMILY.members,
        { ...TB_303_FAMILY.members[2], slug: 'other', label: 'Other' },
      ],
    };
    window.history.replaceState(null, '', '/synths/td-3?member=rebirth');
    const back = vi.spyOn(window.history, 'back');
    render(
      <SynthPage
        detail={detailOf(SYNTHS[0], second)}
        synths={SYNTHS}
        families={[second]}
        viewParam={null}
        memberParam="rebirth"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(window.location.search).toBe('?member=other');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the TD-3' }));
    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/synths/td-3');
    back.mockRestore();
  });

  it('steps back from an entry it pushed, after Back and Forward too', () => {
    window.history.replaceState(null, '', '/synths/td-3');
    page(0);
    fireEvent.click(screen.getByRole('button', { name: 'Unmodelled' }));
    const marked: unknown = window.history.state;
    // Back, then Forward onto the same entry, as the browser would make them.
    act(() => {
      window.history.replaceState(null, '', '/synths/td-3');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    act(() => {
      window.history.replaceState(marked, '', '/synths/td-3?member=rebirth');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(blankFace()).not.toBeNull();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the TD-3' }));
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it("follows the browser's Back and Forward between the panel and the blank panel", () => {
    window.history.replaceState(null, '', '/synths/td-3');
    page(0);
    fireEvent.click(screen.getByRole('button', { name: 'Unmodelled' }));
    expect(blankFace()).not.toBeNull();
    const pop = (href: string) =>
      act(() => {
        window.history.replaceState(null, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    pop('/synths/td-3');
    expect(blankFace()).toBeNull();
    expect(shown(instrument())).toBe(true);
    // Reached by Forward, the blank panel stops what was playing and lets every note go, as the toggle does.
    engine.send.mockClear();
    pop('/synths/td-3?member=rebirth');
    expect(blankFace()).not.toBeNull();
    expect(engine.send).toHaveBeenCalledWith({ type: 'panic' });
    // Another page's address is the router's to follow, not this page's.
    pop('/synths/tb-303');
    expect(blankFace()).not.toBeNull();
  });

  it('opens onto the member its address names when the router restores the page without it', () => {
    // Back from another page: the page comes from the router's cache, rendered before the address named the member.
    window.history.replaceState(null, '', '/synths/td-3?member=rebirth');
    page(0);
    expect(blankFace()).not.toBeNull();
    expect(shown(instrument())).toBe(false);
  });

  it('keeps the member in the address when the view the visitor last chose is restored on arrival', () => {
    window.localStorage.setItem('kys.view', JSON.stringify({ outline: true, long: false }));
    window.history.replaceState(null, '', '/synths/td-3?member=rebirth');
    page(0);
    expect(blankFace()).not.toBeNull();
    expect(new URL(window.location.href).searchParams.get('member')).toBe('rebirth');
    expect(new URL(window.location.href).searchParams.get('view')).toBe('outline');
  });

  it("writes its own address without the router's history keys, so the router follows it", () => {
    window.history.replaceState({ __NA: true }, '', '/synths/td-3?member=rebirth');
    const replace = vi.spyOn(window.history, 'replaceState');
    page(0);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the TD-3' }));
    expect(replace).toHaveBeenLastCalledWith(null, '', '/synths/td-3');
    replace.mockRestore();
  });

  it('closes the dialogs over the page as the blank panel comes', () => {
    page(0);
    fireEvent.click(screen.getByRole('button', { name: 'About ›' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => {
      window.history.replaceState(null, '', '/synths/td-3?member=rebirth');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(blankFace()).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens straight onto the member its address names, and a slug it does not have opens the synth', () => {
    const at = (memberParam: string) =>
      render(
        <SynthPage
          key={memberParam}
          detail={detailOf(SYNTHS[0], TB_303_FAMILY)}
          synths={SYNTHS}
          families={[TB_303_FAMILY]}
          viewParam={null}
          memberParam={memberParam}
        />
      );
    const first = at('rebirth');
    expect(blankFace()).not.toBeNull();
    expect(shown(instrument())).toBe(false);
    first.unmount();
    // A modelled member's slug is not a blank panel either: it has a page of its own.
    for (const slug of ['nope', 'tb-303']) {
      const other = at(slug);
      expect(blankFace()).toBeNull();
      expect(shown(instrument())).toBe(true);
      other.unmount();
    }
  });
});

describe('the synth picker on a family member (f-synth-picker t-328)', () => {
  const openPicker = () => {
    const trigger = document.querySelector<HTMLElement>('[aria-haspopup="listbox"]');
    if (!trigger) throw new Error('no picker on the page');
    fireEvent.click(trigger);
    return within(screen.getByRole('listbox', { name: 'Choose a synth' }));
  };
  const pickRow = (name: string) => {
    const row = openPicker()
      .getAllByRole('option')
      .find((o) => [...o.querySelectorAll('span')].some((s) => s.textContent === name));
    if (!row) throw new Error(`no row for ${name}`);
    fireEvent.click(row);
  };

  it("shows a member nobody has modelled as this page's blank panel, without a navigation", () => {
    page(0);
    pickRow('Unmodelled');
    expect(blankFace()).not.toBeNull();
    expect(window.location.pathname + window.location.search).toBe('/synths/td-3?member=rebirth');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('reaches a sibling as the toggle does, with the panel carried across', async () => {
    leaveTd3();
    const first = page(0);
    pickRow('TB-303');
    await waitFor(() => expect(router.push).toHaveBeenCalledOnce());
    expect(router.push.mock.calls[0][0]).toMatch(/^\/synths\/tb-303(\?|$)/);
    first.unmount();
    page(1);
    expect(await screen.findByText(/Panel carried over from the TD-3/)).toBeTruthy();
  });

  it('leaves the blank panel for the synth under it when that synth is chosen', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    page(0);
    pickRow('Unmodelled');
    expect(blankFace()).not.toBeNull();
    pickRow('TD-3');
    expect(blankFace()).toBeNull();
    expect(shown(instrument())).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    vi.mocked(window.history.back).mockRestore();
  });

  it("opens a member of another family over that family's synth, by navigation", () => {
    const tb303Only: SynthFamily = {
      ...TB_303_FAMILY,
      id: 'other',
      defaultMember: 'tb-303',
      members: TB_303_FAMILY.members.filter((m) => m.synthId !== 'td-3'),
    };
    render(
      <SynthPage
        detail={detailOf(SYNTHS[0], null)}
        synths={SYNTHS}
        families={[tb303Only]}
        viewParam={null}
      />
    );
    pickRow('Unmodelled');
    expect(router.push).toHaveBeenCalledOnce();
    expect(router.push.mock.calls[0][0]).toBe('/synths/tb-303?member=rebirth');
    expect(blankFace()).toBeNull();
  });
});

describe('the picker’s settings on the page (f-synth-picker t-329)', () => {
  const listbox = () => screen.getByRole('listbox', { name: 'Choose a synth' });
  const openPicker = () => {
    const trigger = document.querySelector<HTMLElement>('[aria-haspopup="listbox"]');
    if (!trigger) throw new Error('no picker on the page');
    fireEvent.click(trigger);
  };

  it("lists by the site's settings, and keeps a visitor's change in the browser", () => {
    render(
      <SynthPage
        detail={detailOf(SYNTHS[0], TB_303_FAMILY)}
        synths={SYNTHS}
        families={[TB_303_FAMILY]}
        pickerSite={{ ...FACTORY_PICKER, group: 'name' }}
        viewParam={null}
      />
    );
    openPicker();
    // By name: one list, no brand headings.
    expect(within(listbox()).getAllByRole('group')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /^Advanced/ }));
    const groupBy = (name: string) =>
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Group by' })).getByRole('button', { name })
      );
    groupBy('Lineage');
    expect(readStored('kys.picker')).toEqual({ group: 'lineage' });
    expect(
      within(listbox())
        .getAllByRole('option')
        .some((o) => o.textContent?.includes('Recreation'))
    ).toBe(true);
    // The site's again: nothing of the visitor's to keep.
    groupBy('Name A–Z');
    expect(readStored('kys.picker')).toEqual({});
  });
});
