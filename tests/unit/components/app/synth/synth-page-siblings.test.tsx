// @vitest-environment happy-dom

/**
 * A family sibling's sounds on the synth page (`f-synth-families` t-322): the TB-303's library lists a TD-3 sound,
 * loading it sets the TB-303's panel to the sound as it came across and says what did not, and saving it makes a sound
 * of the user's on the TB-303. The definitions, the translation and the panel are real; the router, the audio engine
 * and the API are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/synth/library.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { readStored } from '@/components/app/synth/storage';
import type {
  CatalogueSound,
  CatalogueSynth,
  SiblingSound,
  SynthDetail,
} from '@/lib/app/catalogue/read';
import type { CablePair } from '@/lib/app/synths/contract';
import type { UserSoundDetail } from '@/lib/app/sounds/data';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { presetState } from '@/lib/app/synths/lib/patch';
import { departures, translate } from '@/lib/app/synths/families/translate';
import { openSide, tallScreen } from '@/tests/helpers/synth-side';
import { comeBackTo } from '@/tests/helpers/synth-session';
import { TB_303_FAMILY } from '@/tests/helpers/synth-family';

const { router, engine, auth, api } = vi.hoisted(() => ({
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
  auth: { signedIn: false },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: auth.signedIn ? { user: { id: 'user-1' }, session: { id: 's-1' } } : null,
    isPending: false,
  }),
}));
// The account's settings, last panel and instruments, and the tutor's reads, answer "nothing yet", so `api` sees only
// the sounds API this file is about.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const account = (path: string) => path.startsWith('/api/v1/me/');
  const tutor = (path: string) => path.startsWith('/api/v1/tutor/');
  return {
    ...real,
    apiClient: {
      ...api,
      get: (path: string, opts?: unknown) =>
        account(path)
          ? Promise.resolve(
              path === '/api/v1/me/settings'
                ? { tips: null, dim: null, heat: null, harm: null, fx: null }
                : null
            )
          : tutor(path)
            ? Promise.resolve(
                path === '/api/v1/tutor/allowance'
                  ? { limit: 30, used: 0, remaining: 30, resetsAt: '2026-10-19T00:00:00.000Z' }
                  : { conversation: null }
              )
            : api.get(path, opts),
      put: (path: string) => (account(path) ? Promise.resolve(null) : api.put(path)),
      patch: (path: string, opts?: unknown) =>
        account(path) ? Promise.resolve(null) : api.patch(path, opts),
    },
  };
});

const defOf = (id: string) => {
  const def = getSynthDef(id);
  if (!def) throw new Error(`${id} is not registered`);
  return def;
};
const td3 = defOf('td-3');
const tb303 = defOf('tb-303');

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(async () => {
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
  comeBackTo('tb-303');
  window.history.replaceState(null, '', '/synths/tb-303');
  auth.signedIn = false;
  for (const f of Object.values(api)) f.mockReset();
  api.get.mockResolvedValue([]);
  router.push.mockReset();
  router.replace.mockReset();
});

const TB303: CatalogueSynth = {
  id: 'tb-303',
  name: tb303.name,
  maker: 'Roland',
  year: 1981,
  heritage: 'The bass line',
  summary: 'A bass line.',
  design: 'neutral',
  definitionVersion: tb303.version,
  kind: null,
  soundCount: 0,
};

/** A TD-3 sound with its resonance up and its distortion on, which the TB-303 lacks. */
const GRIT: CatalogueSound = {
  id: 'td-grit',
  name: 'Gritty Acid',
  ref: 'A test sound',
  artist: 'Nobody',
  tags: ['bass'],
  level: 2,
  blurb: 'A gritty line.',
  how: 'Because.',
  phrase: { bpm: 126, loop: true, steps: [[0, 36, 1]] },
  steps: [
    {
      title: 'Open it up',
      module: 'filter',
      why: 'Bright.',
      set: { 'filter.res': 8, 'dist.on': true },
    },
  ],
  context: {},
  tweaks: [],
  version: td3.version,
};

/** A second TD-3 sound, its resonance down, to load after `GRIT`. Its default pattern comes with a delay (t-326). */
const SOFT: CatalogueSound = {
  ...GRIT,
  id: 'td-soft',
  name: 'Soft Line',
  steps: [{ title: 'Close it', module: 'filter', why: 'Dark.', set: { 'filter.res': 1 } }],
  defaultPattern: {
    id: 'p-soft',
    name: 'Soft line',
    style: 'Acid house',
    fx: { delay: { time: 0.4, feedback: 0.3, mix: 0.3 } },
  },
};

/** `GRIT` as the detail serves it on the TB-303: carried as `carriedSound` in `lib/app/catalogue/read.ts` does. */
function carried(sound: CatalogueSound = GRIT): SiblingSound {
  const panel = presetState(td3, sound);
  const carry = translate(
    panel.values,
    panel.cables.map((c): CablePair => [c.from, c.to]),
    td3,
    tb303
  );
  const base = presetState(tb303).cables.map((c): CablePair => [c.from, c.to]);
  return {
    ...sound,
    version: tb303.version,
    steps: [
      {
        title: 'Set the panel as it was on the TD-3',
        module: 'filter',
        why: 'Made on the TD-3.',
        set: carry.values,
        ...(base.length ? { unplug: base } : {}),
        ...(carry.cables.length ? { cables: carry.cables } : {}),
      },
    ],
    from: { synthId: 'td-3', name: 'TD-3' },
    ...departures(td3, carry),
  };
}

const detail = (): SynthDetail => ({
  synth: TB303,
  sounds: [],
  siblingSounds: [carried(), carried(SOFT)],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  links: { count: 0, kinds: [] },
  soundLinks: {},
  instruments: [],
  family: TB_303_FAMILY,
});

const page = () =>
  render(
    <SynthPage detail={detail()} synths={[TB303]} families={[TB_303_FAMILY]} viewParam={null} />
  );

const loadSibling = (name: RegExp) => {
  openSide('Sounds');
  const library = screen.getByRole('region', { name: 'Patch library' });
  const list = within(library).getByRole('list', { name: 'From other versions' });
  fireEvent.click(within(list).getByRole('button', { name }));
};
const loadGrit = () => loadSibling(/Gritty Acid/);
const loadedName = () => screen.getByText('Patch:').nextElementSibling?.textContent;

describe("a family sibling's sound", () => {
  it('lists it under its own heading in the library, with the member it was made on', () => {
    page();
    openSide('Sounds');
    const library = screen.getByRole('region', { name: 'Patch library' });
    const list = within(library).getByRole('list', { name: 'From other versions' });
    expect(within(list).getByRole('button', { name: /Gritty Acid/ }).textContent).toContain(
      'Made on the TD-3'
    );
  });

  it('loads onto the TB-303 as it came across, and says what did not', async () => {
    page();
    loadGrit();

    await waitFor(() => expect(loadedName()).toBe('Gritty Acid'));
    expect(screen.getByText('made on the TD-3')).toBeTruthy();
    const note = screen.getByText(/Gritty Acid was made on the TD-3\. What did not come across/);
    const reasons = within(note.closest('[role="status"]') as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(reasons).toContain('The TB-303 has no distortion');
    // The panel the TB-303 plays is the sound as it came across: the resonance kept, under the TB-303's own ids.
    const sibling = carried();
    await waitFor(() =>
      expect(readStored('kys.session.tb-303')).toMatchObject({
        presetId: null,
        soundId: null,
        values: presetState(tb303, sibling).values,
      })
    );
    expect(presetState(tb303, sibling).values['filter.res']).toBe(8);
  });

  it("saves as a sound of the user's on the TB-303, named for it and crediting no library sound", async () => {
    auth.signedIn = true;
    api.post.mockImplementation(
      async (_path: string, { body }: { body: { name: string } }): Promise<UserSoundDetail> =>
        ({
          id: 'cmnew1',
          synthId: 'tb-303',
          slug: 'cmnew1',
          name: body.name,
          notes: null,
          definitionVersion: tb303.version,
          source: null,
          fromTutor: false,
          lesson: null,
          published: null,
          links: [],
          createdAt: '2026-11-26T00:00:00.000Z',
          updatedAt: '2026-11-26T00:00:00.000Z',
          panel: null,
        }) as never
    );
    page();
    loadGrit();
    await waitFor(() => expect(loadedName()).toBe('Gritty Acid'));

    fireEvent.click(screen.getByRole('button', { name: 'Save a copy…' }));
    expect(screen.getByText(/Gritty Acid stays in the TD-3's library/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveProperty('value', 'Gritty Acid');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const panel = presetState(tb303, carried());
    expect(api.post).toHaveBeenCalledWith('/api/v1/sounds', {
      body: {
        synthId: 'tb-303',
        name: 'Gritty Acid',
        panel: {
          values: panel.values,
          cables: panel.cables.map((c) => [c.from, c.to]),
        },
      },
    });
  });

  it('starts the undo history afresh for each one loaded, as for any other patch', async () => {
    page();
    loadGrit();
    await waitFor(() => expect(loadedName()).toBe('Gritty Acid'));
    loadSibling(/Soft Line/);
    await waitFor(() => expect(loadedName()).toBe('Soft Line'));

    // Undo would put Gritty Acid's panel back under Soft Line's name.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await waitFor(() =>
      expect(readStored('kys.session.tb-303')).toMatchObject({
        values: { 'filter.res': 1 },
      })
    );
  });

  it("turns the rack to the effects its default pattern comes with, as one of the member's own does (t-326)", async () => {
    page();
    loadSibling(/Soft Line/);
    await waitFor(() => expect(loadedName()).toBe('Soft Line'));
    expect(readStored('kys.fx')).toMatchObject({
      on: true,
      delay: { on: true, time: 0.4, feedback: 0.3, mix: 0.3 },
    });

    // one that brings none turns it off
    loadGrit();
    await waitFor(() => expect(loadedName()).toBe('Gritty Acid'));
    expect(readStored('kys.fx')).toMatchObject({ on: false });
  });

  it('keeps its undo history when the sound on the panel is picked again, as a library sound does (t-326)', async () => {
    page();
    loadGrit();
    await waitFor(() => expect(loadedName()).toBe('Gritty Acid'));
    const panelUndo = within(screen.getByRole('group', { name: 'History' })).getByRole('button', {
      name: 'Undo',
    });
    expect(panelUndo).toBeDisabled();
    // a turn of a knob, then the same sound picked again: Restore, not another patch
    const res = screen.getAllByRole('slider', { name: /RESONANCE/ })[0];
    fireEvent.keyDown(res, { key: 'ArrowLeft' });
    await waitFor(() => expect(panelUndo).toBeEnabled());
    loadGrit();
    await waitFor(() =>
      expect(readStored('kys.session.tb-303')).toMatchObject({ values: { 'filter.res': 8 } })
    );
    expect(panelUndo).toBeEnabled();
  });
});
