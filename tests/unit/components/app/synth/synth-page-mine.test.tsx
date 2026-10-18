// @vitest-environment happy-dom

/**
 * The synth page with the user's own sounds (`f-my-sounds` s2): Save, Save as, Rename, Delete and Save a copy over the
 * panel, My sounds beside the library, `?mine=` from the dashboard, and the trip through sign-in when signed out. A
 * sound saved with its lesson (`f-tutor` t-55) shows that lesson in the Lesson panel. The panel, library and lesson are
 * real; the router, the audio engine, the session and the API client are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/synth/my-sounds.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import { focusStore } from '@/components/app/synth/stores';
import { readStored } from '@/components/app/synth/storage';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { presetState } from '@/lib/app/synths/lib/patch';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';
import type { SoundLesson } from '@/lib/app/sounds/lesson';

const { router, engine, auth, api } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
  },
  auth: { signedIn: false, pending: false },
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
    isPending: auth.pending,
  }),
}));
// The account's settings and last panel (`f-my-sounds` s3) answer "nothing kept yet" here, and their writes are
// dropped, so `api` sees only the sounds API this file is about. They are tested in synth-page-account.test.tsx.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const account = (path: string) => path.startsWith('/api/v1/me/');
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
          : api.get(path, opts),
      put: (path: string) => (account(path) ? Promise.resolve(null) : api.put(path)),
      patch: (path: string, opts?: unknown) =>
        account(path) ? Promise.resolve(null) : api.patch(path, opts),
    },
  };
});

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(async () => {
  await loadSynthDef('model-d');
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
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
  steps: [
    { title: 'Close the filter', module: 'filter', why: 'Dark.', set: { 'filter.cutoff': -2 } },
  ],
});
const WOBBLE = sound({
  id: 'wobble',
  name: 'Wobble lead',
  steps: [{ title: 'Open it', module: 'filter', why: 'Bright.', set: { 'filter.cutoff': 3 } }],
});

const MODEL_D_SYNTH: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'Three oscillators.',
  design: 'neutral',
  definitionVersion: def.version,
  soundCount: 2,
};

const detail: SynthDetail = {
  synth: MODEL_D_SYNTH,
  sounds: [FAT_BASS, WOBBLE],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
};

const SESSION_KEY = 'kys.session.model-d';

const summary = (over: Partial<UserSoundSummary> = {}): UserSoundSummary => ({
  id: 'cmmine1',
  synthId: 'model-d',
  name: 'Night bass',
  notes: null,
  definitionVersion: def.version,
  source: null,
  basedOn: null,
  fromTutor: false,
  lesson: null,
  visibility: 'private',
  slug: null,
  publishedAt: null,
  tags: [],
  unlisted: false,
  playable: true,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  ...over,
});

/** A user sound whose panel has the filter at 4 and one cable in. */
const NIGHT_BASS: UserSoundDetail = {
  ...summary(),
  panel: {
    values: { ...def.init, 'filter.cutoff': 4 },
    cables: [['j.lfoTri', 'j.cutCv']],
  },
  problems: [],
  fitted: null,
};

function page(over: Partial<SynthPageProps> = {}) {
  return render(<SynthPage detail={detail} synths={[MODEL_D_SYNTH]} viewParam={null} {...over} />);
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;
const cutoff = () =>
  screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow');
const mySounds = () => screen.getByRole('region', { name: 'My sounds' });

/** The API's answers: the list, and each sound by id. */
function serve(list: UserSoundSummary[], byId: Record<string, UserSoundDetail> = {}) {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/v1/sounds') return list;
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    const d = byId[id];
    if (!d) throw new Error(`no sound ${id}`);
    return d;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/synths/model-d');
  auth.signedIn = false;
  auth.pending = false;
  for (const f of Object.values(api)) f.mockReset();
  serve([]);
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => focusStore.set(null));
});

// ── signed out ──────────────────────────────────────────────────────────────

describe('signed out', () => {
  it('offers Save a copy as sign-in that comes back to this synth, and asks nothing of the API', () => {
    page();
    const save = screen.getByRole('link', { name: 'Save a copy…' });
    expect(save.getAttribute('href')).toBe(
      `/login?callbackUrl=${encodeURIComponent('/synths/model-d')}`
    );
    const signIn = within(mySounds()).getByRole('link', { name: 'Sign in' });
    expect(signIn.getAttribute('href')).toBe(save.getAttribute('href'));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps the view in the address it comes back to', () => {
    page({ viewParam: 'outline' });
    expect(screen.getByRole('link', { name: 'Save a copy…' }).getAttribute('href')).toBe(
      `/login?callbackUrl=${encodeURIComponent('/synths/model-d?view=outline')}`
    );
  });

  it('comes back from sign-in to the same panel', async () => {
    const first = page();
    fireEvent.click(button('A-440'));
    expect(screen.getByText('1 control moved')).toBeTruthy();
    // Following the link leaves the page before the write delay is up: leaving writes the panel.
    first.unmount();
    expect(readStored(SESSION_KEY)).toMatchObject({
      presetId: 'fat-bass',
      values: { 'out.a440': true },
    });

    // Back from sign-in, signed in now: the same panel, the change still counted.
    auth.signedIn = true;
    page();
    expect(loadedName()).toBe('Fat bass');
    expect(screen.getByText('1 control moved')).toBeTruthy();
    await waitFor(() =>
      expect(within(mySounds()).getByText(/None on this synth yet/)).toBeTruthy()
    );
  });

  it('shows neither the buttons nor sign-in while the session is still being read', () => {
    auth.pending = true;
    page();
    expect(screen.queryByRole('link', { name: 'Save a copy…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save a copy…' })).toBeNull();
    expect(within(mySounds()).getByText('Loading your sounds…')).toBeTruthy();
  });
});

// ── signed in ───────────────────────────────────────────────────────────────

describe('My sounds', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it("lists this synth's sounds from one request", async () => {
    serve([
      summary(),
      summary({
        id: 'cmmine2',
        name: 'Copy of wobble',
        source: { soundId: 's1', slug: 'wobble', name: 'Wobble lead', ref: 'x' },
      }),
    ]);
    page();
    await waitFor(() => expect(within(mySounds()).getByText('Night bass')).toBeTruthy());
    expect(within(mySounds()).getByText('Copied from Wobble lead')).toBeTruthy();
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds', {
      params: { synthId: 'model-d' },
    });
  });

  it('says who can open each, and links a shared one to its page', async () => {
    serve([
      summary(),
      summary({ id: 'cmmine2', name: 'Glass pluck', visibility: 'link', slug: 'abcdefghjk' }),
      summary({ id: 'cmmine3', name: 'Brass', visibility: 'published', slug: 'mnpqrstvwx' }),
      summary({
        id: 'cmmine4',
        name: 'Taken down',
        visibility: 'published',
        slug: 'zzzzzzzzzz',
        unlisted: true,
      }),
    ]);
    page();
    const item = async (name: string) =>
      (await within(mySounds()).findByRole('button', { name: new RegExp(name) })).closest('li')!;
    expect((await item('Night bass')).textContent).toMatch(/Private/);
    expect(within(await item('Night bass')).queryByRole('link')).toBeNull();
    expect((await item('Glass pluck')).textContent).toMatch(/Shared by link/);
    expect(
      within(await item('Glass pluck'))
        .getByRole('link', { name: 'Glass pluck: its shared page' })
        .getAttribute('href')
    ).toBe('/synths/model-d/s/abcdefghjk');
    expect((await item('Brass')).textContent).toMatch(/Published/);
    expect(
      within(await item('Brass'))
        .getByRole('link', { name: 'Brass: its shared page' })
        .getAttribute('href')
    ).toBe('/synths/model-d/s/mnpqrstvwx');
    // unlisted by moderators (f-sharing h4): said so, and no link to a page nobody can open
    expect((await item('Taken down')).textContent).toMatch(/Unlisted by moderators/);
    expect(within(await item('Taken down')).queryByRole('link')).toBeNull();
  });

  it('says so when the list cannot be read', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    page();
    await waitFor(() => expect(within(mySounds()).getByRole('alert')).toBeTruthy());
  });

  it('opens one over the panel, as choosing a library sound does', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    page();
    expect(cutoff()).toBe('-2');
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));

    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    expect(screen.getByText('mine')).toBeTruthy();
    expect(cutoff()).toBe('4');
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(
      within(mySounds())
        .getByRole('button', { name: /Night bass/ })
        .getAttribute('aria-current')
    ).toBe('true');
    // Its own buttons replace Save a copy.
    for (const name of ['Save', 'Save as…', 'Rename…', 'Delete…'])
      expect(button(name)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save a copy…' })).toBeNull();
  });

  it('counts moves from the sound as saved, and Restore puts it back', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));

    fireEvent.click(button('A-440'));
    expect(screen.getByText('1 control moved')).toBeTruthy();
    fireEvent.click(button('Restore sound'));
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(cutoff()).toBe('4');
  });

  it('opens one the synth has moved on from with what fits, and says what did not', async () => {
    const fitted: UserSoundDetail = {
      ...NIGHT_BASS,
      playable: false,
      panel: null,
      problems: [
        'Saved on version 0 of model-d, which is now at version 1, and there is no mapping between them',
      ],
      fitted: { values: { ...def.init, 'filter.cutoff': 1 }, cables: [] },
    };
    serve([summary({ playable: false })], { cmmine1: fitted });
    page();
    expect(
      await within(mySounds()).findByText('Opens with what still fits this synth')
    ).toBeTruthy();
    fireEvent.click(within(mySounds()).getByRole('button', { name: /Night bass/ }));

    await waitFor(() => expect(cutoff()).toBe('1'));
    expect(
      screen.getByText(/no longer fits this synth as it is now, so it opened with what does/)
    ).toBeTruthy();
    expect(screen.getByText(/no mapping between them/)).toBeTruthy();
  });

  it('opens nothing, and says so, when the sound was saved on another synth', async () => {
    serve([summary()], { cmmine1: { ...NIGHT_BASS, synthId: 'ob-x' } });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    expect(await screen.findByText(/saved on another synth/)).toBeTruthy();
    expect(loadedName()).toBe('Fat bass');
    expect(cutoff()).toBe('-2');
    expect(within(mySounds()).getAllByRole('button')).toHaveLength(1);
  });

  it('opens the one clicked last when an earlier answer arrives after it', async () => {
    const other = summary({ id: 'cmmine2', name: 'Day lead' });
    const DAY_LEAD: UserSoundDetail = {
      ...NIGHT_BASS,
      ...other,
      panel: { values: { ...def.init, 'filter.cutoff': 2 }, cables: [] },
    };
    let answerNight: (d: UserSoundDetail) => void = () => undefined;
    api.get.mockImplementation(async (path: string) => {
      if (path === '/api/v1/sounds') return [summary(), other];
      if (path.endsWith('cmmine1'))
        return new Promise<UserSoundDetail>((r) => {
          answerNight = r;
        });
      return DAY_LEAD;
    });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    fireEvent.click(within(mySounds()).getByRole('button', { name: /Day lead/ }));
    await waitFor(() => expect(loadedName()).toBe('Day lead'));
    await act(async () => answerNight(NIGHT_BASS));
    expect(loadedName()).toBe('Day lead');
    expect(cutoff()).toBe('2');
  });

  it('does not open over a library sound chosen while it was being fetched', async () => {
    let answerNight: (d: UserSoundDetail) => void = () => undefined;
    api.get.mockImplementation(async (path: string) => {
      if (path === '/api/v1/sounds') return [summary()];
      return new Promise<UserSoundDetail>((r) => {
        answerNight = r;
      });
    });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Sound library' })).getByRole('button', {
        name: /Wobble lead/,
      })
    );
    await act(async () => answerNight(NIGHT_BASS));
    expect(loadedName()).toBe('Wobble lead');
    expect(screen.queryByText('mine')).toBeNull();
  });

  it('leaves the open sound when a lesson step is chosen, since the step replaces the panel', async () => {
    const copy = {
      ...NIGHT_BASS,
      source: { soundId: 's0', slug: 'fat-bass', name: 'Fat bass', ref: 'x' },
    };
    serve([summary({ source: copy.source })], { cmmine1: copy });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    fireEvent.click(button('Build it step by step'));

    expect(loadedName()).toBe('Fat bass');
    expect(screen.queryByText('mine')).toBeNull();
    expect(screen.getByText('step 1 of 1')).toBeTruthy();
    // Save no longer writes to Night bass: it makes a new copy of the library sound.
    expect(button('Save a copy…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('credits no library sound for one that is not a copy, whatever was on the panel before', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    const view = page();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Sound library' })).getByRole('button', {
        name: /Wobble lead/,
      })
    );
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    view.unmount();
    expect(readStored(SESSION_KEY)).toMatchObject({ presetId: null, soundId: 'cmmine1' });
  });

  it('opens nothing, and says so, when the sound has gone', async () => {
    serve([summary()], {});
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    expect(await screen.findByText(/could not be opened/)).toBeTruthy();
    expect(loadedName()).toBe('Fat bass');
  });
});

describe('saving', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it('saves a copy of the library sound with credit and the panel as it is now', async () => {
    serve([]);
    api.post.mockImplementation(async (_path: string, { body }: { body: { name: string } }) => ({
      ...NIGHT_BASS,
      id: 'cmnew1',
      name: body.name,
      panel: null,
      source: { soundId: 's0', slug: 'fat-bass', name: 'Fat bass', ref: 'x' },
    }));
    page();
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Save a copy…'));
    expect(screen.getByText(/keeps the credit to Fat bass/)).toBeTruthy();
    const name = screen.getByRole('textbox', { name: /^Name/ });
    expect(name).toHaveProperty('value', 'Fat bass');
    fireEvent.change(name, { target: { value: 'My fat bass' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Notes/ }), {
      target: { value: 'for the intro' },
    });
    fireEvent.click(button('Save'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const fat = presetState(def, FAT_BASS);
    expect(api.post).toHaveBeenCalledWith('/api/v1/sounds', {
      body: {
        synthId: 'model-d',
        name: 'My fat bass',
        notes: 'for the intro',
        panel: { values: { ...fat.values, 'out.a440': true }, cables: [] },
        source: { slug: 'fat-bass' },
      },
    });
    // It is now the sound on the panel, in the list, with nothing moved since it was saved.
    await waitFor(() => expect(loadedName()).toBe('My fat bass'));
    expect(within(mySounds()).getByRole('button', { name: /My fat bass/ })).toBeTruthy();
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Saved My fat bass to My sounds.');
  });

  it('refuses an empty name before sending anything', () => {
    page();
    fireEvent.click(button('Save a copy…'));
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: '   ' } });
    fireEvent.click(button('Save'));
    expect(screen.getByText('Name the sound')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('says what the API said when a new sound is refused as not found, not that a sound has gone', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    api.post.mockRejectedValue(new APIClientError('Synth not found', 'NOT_FOUND', 404));
    page();
    fireEvent.click(button('Save a copy…'));
    fireEvent.click(button('Save'));
    expect((await screen.findByRole('alert')).textContent).toBe('Synth not found');
  });

  it('keeps a sound saved before the list arrived, when the list was read without it', async () => {
    let answerList: (l: UserSoundSummary[]) => void = () => undefined;
    api.get.mockImplementation(
      () =>
        new Promise<UserSoundSummary[]>((r) => {
          answerList = r;
        })
    );
    api.post.mockResolvedValue({ ...NIGHT_BASS, id: 'cmnew1', name: 'Fat bass' });
    page();
    fireEvent.click(button('Save a copy…'));
    fireEvent.click(button('Save'));
    await waitFor(() => expect(loadedName()).toBe('Fat bass'));
    await waitFor(() => expect(screen.getByText('mine')).toBeTruthy());
    await act(async () => answerList([summary()]));

    expect(screen.getByText('mine')).toBeTruthy();
    const names = within(mySounds())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/Fat bass/);
    expect(names[1]).toMatch(/Night bass/);
  });

  it('says what went wrong when the save is refused', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    api.post.mockRejectedValue(new APIClientError('Too many requests', 'RATE_LIMITED', 429));
    page();
    fireEvent.click(button('Save a copy…'));
    fireEvent.click(button('Save'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Too many changes at once/);
    // The form stays, with what was typed, to try again.
    expect(screen.getByRole('textbox', { name: /^Name/ })).toBeTruthy();
  });

  it('saves over the open sound with the panel as it is now', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    api.patch.mockResolvedValue({ ...NIGHT_BASS, updatedAt: '2026-10-15T11:00:00.000Z' });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Save'));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/api/v1/sounds/cmmine1', {
      body: {
        panel: {
          values: { ...NIGHT_BASS.panel!.values, 'out.a440': true },
          cables: [['j.lfoTri', 'j.cutCv']],
        },
      },
    });
    await waitFor(() => expect(screen.queryByText(/controls? moved/)).toBeNull());
  });

  it('saves the open sound as a new one, keeping its credit while the library has the sound', async () => {
    const copy = {
      ...NIGHT_BASS,
      source: { soundId: 's1', slug: 'wobble', name: 'Wobble lead', ref: 'x' },
    };
    serve([summary({ source: copy.source })], { cmmine1: copy });
    api.post.mockResolvedValue({ ...copy, id: 'cmnew2', name: 'Night bass (copy)' });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));
    fireEvent.click(button('Save as…'));
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveProperty(
      'value',
      'Night bass (copy)'
    );
    fireEvent.click(button('Save as new'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1]).toMatchObject({
      body: { name: 'Night bass (copy)', source: { slug: 'wobble' } },
    });
    await waitFor(() => expect(loadedName()).toBe('Night bass (copy)'));
    expect(within(mySounds()).getAllByRole('button')).toHaveLength(2);
  });

  it('renames the open sound and clears its notes, leaving the panel alone', async () => {
    serve([summary({ notes: 'old' })], { cmmine1: { ...NIGHT_BASS, notes: 'old' } });
    api.patch.mockResolvedValue({ ...NIGHT_BASS, name: 'Deep night' });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Rename…'));
    expect(screen.getByRole('textbox', { name: /^Notes/ })).toHaveProperty('value', 'old');
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Deep night' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^Notes/ }), { target: { value: '' } });
    fireEvent.click(button('Rename'));

    await waitFor(() => expect(loadedName()).toBe('Deep night'));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { name: 'Deep night', notes: null },
    });
    // The move made before the rename is still a move: the rename saved no panel.
    expect(screen.getByText('1 control moved')).toBeTruthy();
  });

  it('shares the open sound with a link, and My sounds says so, leaving the panel alone', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    api.patch.mockResolvedValue({ ...NIGHT_BASS, visibility: 'link', slug: 'abcdefghjk' });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Share with a link'));

    await waitFor(() => expect(within(mySounds()).getByText('Shared by link')).toBeTruthy());
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1', {
      body: { visibility: 'link' },
    });
    // still theirs, open, and the move made before sharing is still a move: sharing saved no panel
    expect(loadedName()).toBe('Night bass');
    expect(screen.getByText('1 control moved')).toBeTruthy();
    expect(button('Copy link')).toBeTruthy();
  });

  it('deletes the open sound after asking, and the panel stays as it is', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    api.delete.mockResolvedValue({ id: 'cmmine1' });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(cutoff()).toBe('4'));
    fireEvent.click(button('Delete…'));
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(button('Delete it'));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledExactlyOnceWith('/api/v1/sounds/cmmine1')
    );
    await waitFor(() =>
      expect(within(mySounds()).getByText(/None on this synth yet/)).toBeTruthy()
    );
    expect(cutoff()).toBe('4');
    expect(screen.queryByText('mine')).toBeNull();
    // Night bass was not a copy, so what is left on the panel credits no library sound.
    expect(button('Save…')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Deleted Night bass.');
  });

  it('forgets the open sound when a library sound is chosen', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Night bass/ }));
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Sound library' })).getByRole('button', {
        name: /Wobble lead/,
      })
    );
    expect(loadedName()).toBe('Wobble lead');
    expect(button('Save a copy…')).toBeTruthy();
  });
});

describe('?mine=', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it('opens that sound on arrival and takes it out of the URL', async () => {
    serve([summary()], { cmmine1: NIGHT_BASS });
    window.history.replaceState(null, '', '/synths/model-d?mine=cmmine1');
    const replace = vi.spyOn(window.history, 'replaceState');
    page({ mineParam: 'cmmine1' });
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    expect(cutoff()).toBe('4');
    expect(replace).toHaveBeenCalledWith(null, '', '/synths/model-d');
  });

  it('waits for the session, and signed out opens nothing', async () => {
    auth.pending = true;
    auth.signedIn = false;
    window.history.replaceState(null, '', '/synths/model-d?mine=cmmine1');
    const view = page({ mineParam: 'cmmine1' });
    expect(window.location.search).toBe('?mine=cmmine1');
    auth.pending = false;
    view.rerender(
      <SynthPage detail={detail} synths={[MODEL_D_SYNTH]} viewParam={null} mineParam="cmmine1" />
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(api.get).not.toHaveBeenCalled();
    expect(loadedName()).toBe('Fat bass');
  });

  it.each(['#bank/artists/kraftwerk', '#ob-x'])(
    'opens nothing when the address sends the visitor elsewhere (%s)',
    async (hash) => {
      serve([summary()], { cmmine1: NIGHT_BASS });
      const ob: CatalogueSynth = { ...MODEL_D_SYNTH, id: 'ob-x', name: 'OB-X' };
      window.history.replaceState(null, '', `/synths/model-d?mine=cmmine1${hash}`);
      page({ mineParam: 'cmmine1', synths: [MODEL_D_SYNTH, ob] });
      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      await act(async () => undefined);
      expect(api.get).not.toHaveBeenCalledWith('/api/v1/sounds/cmmine1');
      expect(loadedName()).toBe('Fat bass');
    }
  );
});

describe('a reload with one of theirs open', () => {
  const reload = () =>
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        presetId: null,
        step: null,
        soundId: 'cmmine1',
        values: { 'filter.cutoff': 4 },
        cables: [],
      })
    );

  it('offers no Save until the list says which sound is open, so Save cannot make a new one', async () => {
    auth.signedIn = true;
    api.get.mockImplementation(() => new Promise(() => undefined));
    reload();
    page();
    await waitFor(() => expect(within(mySounds()).getByText('Loading your sounds…')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('counts no moves while the sound as saved is still being fetched', async () => {
    auth.signedIn = true;
    api.get.mockImplementation(async (path: string) =>
      path === '/api/v1/sounds' ? [summary()] : new Promise(() => undefined)
    );
    reload();
    page();
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    expect(screen.queryByText(/controls? moved/)).toBeNull();
  });

  it('offers no Save when the list cannot be read', async () => {
    auth.signedIn = true;
    api.get.mockRejectedValue(new Error('offline'));
    reload();
    page();
    await waitFor(() => expect(within(mySounds()).getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('counts moves from the sound as saved', async () => {
    auth.signedIn = true;
    serve([summary()], { cmmine1: NIGHT_BASS });
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        presetId: 'fat-bass',
        step: null,
        soundId: 'cmmine1',
        values: { 'filter.cutoff': 4, 'out.a440': true },
        cables: [['j.lfoTri', 'j.cutCv']],
      })
    );
    page();
    await waitFor(() => expect(loadedName()).toBe('Night bass'));
    await waitFor(() => expect(screen.getByText('1 control moved')).toBeTruthy());
  });
});

// ── a sound saved with its lesson (f-tutor t-55) ────────────────────────────

describe('a sound saved with its lesson', () => {
  const LESSON: SoundLesson = {
    blurb: 'A dark, round bass the tutor built.',
    level: 2,
    category: 'bass',
    how: 'The filter is nearly shut, and the LFO moves it.',
    steps: [
      {
        title: 'Shut the filter',
        module: 'filter',
        why: 'Dark first.',
        set: { 'filter.cutoff': -1 },
      },
      {
        title: 'Let the LFO move it',
        module: 'patch',
        why: 'Movement.',
        cables: [['j.lfoTri', 'j.cutCv']],
      },
    ],
    context: { 'filter.cutoff': 'How much of the top gets through.' },
    tweaks: [{ id: 'filter.cutoff', try: 'Open it to 2', hear: 'The bass gets a bite.' }],
    phrase: { bpm: 96, steps: [[0, 36, 1]] },
  };
  const tutorSummary = summary({
    id: 'cmtutor',
    name: 'Tutor bass',
    fromTutor: true,
    lesson: LESSON,
  });
  /** Saved after a tweak: the filter at 4, where the lesson leaves it at -1. */
  const TUTOR_BASS: UserSoundDetail = { ...NIGHT_BASS, ...tutorSummary };
  const lessonPanel = () => screen.getByRole('article', { name: /./ });

  beforeEach(() => {
    auth.signedIn = true;
  });

  async function openIt() {
    serve([tutorSummary], { cmtutor: TUTOR_BASS });
    page();
    fireEvent.click(await within(mySounds()).findByRole('button', { name: /Tutor bass/ }));
    await waitFor(() => expect(loadedName()).toBe('Tutor bass'));
    await waitFor(() => expect(cutoff()).toBe('4'));
  }

  it("shows its own lesson in the Lesson panel, with the tutor's mark, in place of the library's", async () => {
    await openIt();
    const lesson = lessonPanel();
    expect(within(lesson).getByRole('heading', { level: 2 }).textContent).toBe('Tutor bass');
    expect(within(lesson).getByText('Designed by the AI tutor')).toBeTruthy();
    expect(within(lesson).getByText('AI designed · check by ear')).toBeTruthy();
    expect(within(lesson).getByText(LESSON.blurb)).toBeTruthy();
    expect(within(lesson).getByText(LESSON.how)).toBeTruthy();
    expect(within(lesson).getByRole('tab', { name: /Build it/ }).textContent).toContain('2 steps');
    expect(within(lesson).getByRole('tab', { name: /Make it yours/ })).toBeTruthy();
    expect(within(lesson).queryByText('Fat bass')).toBeNull();
    // No library sound is the one on show.
    const library = screen.getByRole('region', { name: 'Sound library' });
    expect(within(library).queryAllByRole('button', { current: true })).toHaveLength(0);
  });

  it('steps through its lesson with the sound still open, and Finish builds the sound as designed', async () => {
    await openIt();
    fireEvent.click(button('Build it step by step'));
    expect(screen.getByText('step 1 of 2')).toBeTruthy();
    expect(loadedName()).toBe('Tutor bass');
    expect(screen.getByText('mine')).toBeTruthy();
    expect(cutoff()).toBe('-1');
    // Still the open sound's buttons, since its lesson is its own, but Save waits for the lesson to finish: the panel is
    // a step of it, not the sound.
    expect(button('Save')).toBeDisabled();
    expect(button('Save as…')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Save a copy…' })).toBeNull();

    // the header's Next step, not the step bar's arrow of the same name
    const next = screen.getAllByRole('button').find((b) => b.textContent === 'Next step');
    if (!next) throw new Error('no Next step');
    fireEvent.click(next);
    expect(screen.getByText('step 2 of 2')).toBeTruthy();
    fireEvent.click(button('Finish'));
    expect(screen.queryByText(/^step \d+ of/)).toBeNull();
    expect(button('Save')).toBeEnabled();
    // The lesson builds the sound as the tutor designed it; the sound as saved differs, and Restore puts it back.
    expect(cutoff()).toBe('-1');
    expect(screen.getByText('1 control moved')).toBeTruthy();
    fireEvent.click(button('Restore sound'));
    expect(cutoff()).toBe('4');
  });

  it('keeps the lesson on Save over, and Save as carries it with the mark', async () => {
    api.patch.mockResolvedValue({ ...TUTOR_BASS, updatedAt: '2026-10-15T11:00:00.000Z' });
    api.post.mockResolvedValue({ ...TUTOR_BASS, id: 'cmnew3', name: 'Tutor bass (copy)' });
    await openIt();
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Save'));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    // Only the panel: the lesson stays with the sound as it was designed.
    expect(Object.keys((api.patch.mock.calls[0][1] as { body: object }).body)).toEqual(['panel']);
    expect(within(lessonPanel()).getByText(LESSON.blurb)).toBeTruthy();

    fireEvent.click(button('Save as…'));
    fireEvent.click(button('Save as new'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1]).toMatchObject({
      body: { name: 'Tutor bass (copy)', lesson: LESSON, fromTutor: true },
    });
  });

  it('leaves no step behind when the sound is deleted part-way through its lesson', async () => {
    api.delete.mockResolvedValue(undefined);
    await openIt();
    fireEvent.click(button('Build it step by step'));
    expect(screen.getByText('step 1 of 2')).toBeTruthy();
    fireEvent.click(button('Delete…'));
    fireEvent.click(button('Delete it'));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('mine')).toBeNull());
    // not read against a library lesson the panel never followed
    expect(screen.queryByText(/^step \d+ of/)).toBeNull();
    expect(cutoff()).toBe('-1');
  });

  it('reads a stored step of its lesson only once the list says the sound is theirs', async () => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        presetId: null,
        // step 0: the library's first sound has one step, so it would read as "step 1 of 1" against that
        step: 0,
        soundId: 'cmtutor',
        values: { ...def.init, 'filter.cutoff': -1 },
        cables: [{ from: 'j.lfoTri', to: 'j.cutCv', color: '#fff' }],
      })
    );
    let answer: (list: UserSoundSummary[]) => void = () => undefined;
    api.get.mockImplementation((path: string) =>
      path === '/api/v1/sounds'
        ? new Promise((resolve) => (answer = resolve))
        : Promise.resolve(TUTOR_BASS)
    );
    page();
    // the list has not answered: no library lesson is walked with this panel
    expect(screen.queryByText(/^step \d+ of/)).toBeNull();
    await act(async () => answer([tutorSummary]));
    expect(await screen.findByText('step 1 of 2')).toBeTruthy();
    expect(loadedName()).toBe('Tutor bass');
  });

  it("shows the library's lesson again once a library sound is chosen", async () => {
    await openIt();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Sound library' })).getByRole('button', {
        name: /Wobble lead/,
      })
    );
    expect(within(lessonPanel()).getByRole('heading', { level: 2 }).textContent).toBe(
      'Wobble lead'
    );
    expect(within(lessonPanel()).queryByText('AI designed · check by ear')).toBeNull();
  });
});
