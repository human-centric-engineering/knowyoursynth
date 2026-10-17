// @vitest-environment happy-dom

/**
 * A shared sound's page (`f-sharing` h2): the synth page with a sound someone shared loaded, and the strip saying whose
 * it is. Pins:
 *
 * - signed out, the shared sound is on the panel, and Save a copy is a sign-in that comes back to this address;
 * - signed in on someone else's, Save a copy sends the panel as it is with the shared sound as its source, and the
 *   copy then opens as theirs;
 * - on the visitor's own, no Save a copy: open it as theirs instead;
 * - while the session or the visitor's own list is unknown, no action at all;
 * - opening another sound leaves it, Load it again puts it back, and changing the view keeps the shared address.
 *
 * The panel is real; the router, the audio engine, the session and the API client are fakes, as in
 * synth-page-mine.test.tsx.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/sharing/shared-sound-strip.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import { focusStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { presetState } from '@/lib/app/synths/lib/patch';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { PublicSound, UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';

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
  visibility: 'private',
  slug: null,
  publishedAt: null,
  tags: [],
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
  window.history.replaceState(null, '', SHARED_PATH);
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

const SLUG = 'abcdefghjk';
const SHARED_PATH = `/synths/model-d/s/${SLUG}`;

/** Someone's link share of a panel with the filter at -3 and no cables. */
const SHARED: PublicSound = {
  slug: SLUG,
  synthId: 'model-d',
  visibility: 'published',
  name: 'Glass pluck',
  notes: 'Short and bright.',
  tags: ['bass'],
  publishedAt: '2026-10-16T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  source: null,
  basedOn: null,
  definitionVersion: def.version,
  playable: true,
  panel: { values: { ...def.init, 'filter.cutoff': -3 }, cables: [] },
  problems: [],
  fitted: null,
};

const shared = (over: Partial<SynthPageProps> = {}) => page({ shared: SHARED, ...over });
const strip = () => screen.getByRole('region', { name: 'Shared sound' });

describe('signed out', () => {
  it('opens with the shared sound on the panel, and says whose it is', () => {
    shared();
    expect(loadedName()).toBe('Glass pluck');
    expect(cutoff()).toBe('-3');
    expect(within(strip()).getByRole('link', { name: '@patchwork' }).getAttribute('href')).toBe(
      '/u/patchwork'
    );
    expect(within(strip()).getByText('Short and bright.')).toBeTruthy();
    expect(within(strip()).getByText('bass')).toBeTruthy();
  });

  it('offers Save a copy as sign-in that comes back to the shared address, and asks nothing of the API', () => {
    shared();
    const link = within(strip()).getByRole('link', { name: 'Sign in to save a copy' });
    expect(link.getAttribute('href')).toBe(`/login?callbackUrl=${encodeURIComponent(SHARED_PATH)}`);
    expect(within(strip()).queryByRole('button', { name: 'Save a copy' })).toBeNull();
    // the panel's own Save a copy would make an uncredited copy, so it is not offered over a shared sound
    expect(screen.queryByRole('link', { name: 'Save a copy…' })).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('replaces the panel that was stored for this synth', () => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ presetId: 'wobble', step: null, soundId: null, ...presetState(def, WOBBLE) })
    );
    shared();
    expect(loadedName()).toBe('Glass pluck');
  });

  it('counts controls moved from the shared sound, and Restore puts it back', () => {
    shared();
    fireEvent.click(button('A-440'));
    expect(screen.getByText('1 control moved')).toBeTruthy();
    fireEvent.click(button('Restore sound'));
    expect(screen.queryByText(/control moved/)).toBeNull();
    expect(cutoff()).toBe('-3');
  });

  it('leaves it when another sound is opened, and Load it again puts it back', () => {
    shared();
    expect(within(strip()).queryByRole('button', { name: 'Load it again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Wobble lead/ }));
    expect(loadedName()).toBe('Wobble lead');
    fireEvent.click(within(strip()).getByRole('button', { name: 'Load it again' }));
    expect(loadedName()).toBe('Glass pluck');
    expect(cutoff()).toBe('-3');
  });

  it('keeps the shared address when the view changes', () => {
    shared();
    fireEvent.click(button(/Outline/));
    expect(window.location.pathname).toBe(SHARED_PATH);
    expect(window.location.search).toContain('view=');
  });

  it('opens a sound the synth has moved on from with what still fits, and says so', () => {
    shared({
      shared: {
        ...SHARED,
        playable: false,
        panel: null,
        problems: ['Saved on an older version.'],
        fitted: { values: { ...def.init, 'filter.cutoff': 2 }, cables: [] },
      },
    });
    expect(cutoff()).toBe('2');
    expect(screen.getByText(/no longer fits this synth/)).toBeTruthy();
  });

  it('says who made a link share only as the read gives it', () => {
    shared({ shared: { ...SHARED, visibility: 'link', author: null, authorProfile: false } });
    expect(within(strip()).getByText('Shared sound')).toBeTruthy();
    expect(within(strip()).getByText('Shared by its maker')).toBeTruthy();
    expect(within(strip()).queryByRole('link', { name: /^@/ })).toBeNull();
  });
});

describe('signed in', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it("offers Save a copy on someone else's, which sends the panel as it is with the shared sound as source", async () => {
    serve([]);
    const COPY: UserSoundDetail = {
      ...NIGHT_BASS,
      id: 'cmcopy1',
      name: 'Glass pluck',
      panel: { values: { ...def.init, 'filter.cutoff': -3, 'out.a440': true }, cables: [] },
    };
    api.post.mockResolvedValue(COPY);
    shared();
    fireEvent.click(button('A-440'));
    const save = await within(strip()).findByRole('button', { name: 'Save a copy' });
    await act(async () => fireEvent.click(save));

    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, opts] = api.post.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(path).toBe('/api/v1/sounds');
    expect(opts.body).toMatchObject({ synthId: 'model-d', source: { shared: SLUG } });
    expect((opts.body.panel as { values: Record<string, unknown> }).values).toMatchObject({
      'filter.cutoff': -3,
      'out.a440': true,
    });
    // the copy is theirs now, open on the panel, with nothing moved since it was saved
    await waitFor(() => expect(screen.getByText('mine')).toBeTruthy());
    expect(loadedName()).toBe('Glass pluck');
    expect(screen.queryByText(/control moved/)).toBeNull();
    expect(within(strip()).getByText(/Saved a copy to My sounds/)).toBeTruthy();
    // and is not offered again, so a second click is not a second copy
    expect(within(strip()).queryByRole('button', { name: 'Save a copy' })).toBeNull();
  });

  it('says so when the copy cannot be saved, and leaves the panel as it was', async () => {
    serve([]);
    api.post.mockRejectedValue(new Error('500'));
    shared();
    const save = await within(strip()).findByRole('button', { name: 'Save a copy' });
    await act(async () => fireEvent.click(save));
    expect(within(strip()).getByRole('alert').textContent).toMatch(/could not be saved/);
    expect(loadedName()).toBe('Glass pluck');
  });

  it('on their own, offers to open it as theirs instead of a copy', async () => {
    const OWN: UserSoundDetail = {
      ...NIGHT_BASS,
      name: 'Glass pluck',
      visibility: 'published',
      slug: SLUG,
    };
    serve([{ ...summary(), name: 'Glass pluck', visibility: 'published', slug: SLUG }], {
      [OWN.id]: OWN,
    });
    shared();
    const open = await within(strip()).findByRole('button', { name: 'Open it to edit' });
    expect(within(strip()).queryByRole('button', { name: 'Save a copy' })).toBeNull();
    await act(async () => fireEvent.click(open));
    await waitFor(() => expect(screen.getByText('mine')).toBeTruthy());
    expect(cutoff()).toBe('4');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('offers nothing until the session and their own list are both known', async () => {
    let answer: (list: UserSoundSummary[]) => void = () => undefined;
    api.get.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          if (path === '/api/v1/sounds') answer = resolve;
        })
    );
    shared();
    expect(within(strip()).queryByRole('button', { name: 'Save a copy' })).toBeNull();
    expect(within(strip()).queryByRole('link', { name: /Sign in/ })).toBeNull();
    await act(async () => answer([]));
    expect(await within(strip()).findByRole('button', { name: 'Save a copy' })).toBeTruthy();
  });
});
