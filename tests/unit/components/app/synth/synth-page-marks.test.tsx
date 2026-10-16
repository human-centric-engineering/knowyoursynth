// @vitest-environment happy-dom

/**
 * The synth page with lesson progress and favourites (`f-my-sounds` s4): steps recorded as a signed-in user walks a
 * lesson, Finish from the last step finishing it, progress shown in the library and the lesson, and the stars on the
 * chooser, the library and My sounds. The panel, library and lesson are real; the router, the audio engine, the session
 * and the API client are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/synth/progress.ts
 * @see components/app/synth/favourites.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { APIClientError } from '@/lib/api/client';
import { SynthPage } from '@/components/app/synth/synth-page';
import { useLessonProgress } from '@/components/app/synth/progress';
import { focusStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { UserSoundSummary } from '@/lib/app/sounds/data';

const { router, engine, auth, api } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
  },
  auth: { signedIn: false },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
// The account's settings and last panel (s3) answer "nothing kept yet", and their writes are dropped, so `api` sees
// only the sounds, progress and favourites calls. They are tested in synth-page-account.test.tsx.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const s3 = (path: string) =>
    path === '/api/v1/me/settings' || path.startsWith('/api/v1/me/panels/');
  return {
    ...real,
    apiClient: {
      ...api,
      get: (path: string, opts?: unknown) =>
        s3(path)
          ? Promise.resolve(
              path === '/api/v1/me/settings'
                ? { tips: null, dim: null, heat: null, harm: null, fx: null }
                : null
            )
          : api.get(path, opts),
      put: (path: string, opts?: unknown) =>
        s3(path) ? Promise.resolve(null) : api.put(path, opts),
      patch: () => Promise.resolve(null),
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

const step = (title: string, cutoff: number) => ({
  title,
  module: 'filter' as const,
  why: 'Listen.',
  set: { 'filter.cutoff': cutoff },
});

const FAT_BASS = sound({
  id: 'fat-bass',
  name: 'Fat bass',
  steps: [step('One', -2), step('Two', 0), step('Three', 2)],
});
const WOBBLE = sound({ id: 'wobble', name: 'Wobble lead', steps: [step('Open it', 3)] });

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

const MINE: UserSoundSummary = {
  id: 'cmmine1',
  synthId: 'model-d',
  name: 'Night bass',
  notes: null,
  definitionVersion: def.version,
  source: null,
  playable: true,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

const entry = (slug: string, furthestStep: number, completedAt: string | null = null) => ({
  synthId: 'model-d',
  slug,
  name: slug,
  steps: 3,
  furthestStep,
  completedAt,
  updatedAt: '2026-10-16T10:00:00.000Z',
  available: true,
});

const page = () => render(<SynthPage detail={detail} synths={[MODEL_D_SYNTH]} viewParam={null} />);
/** The walkthrough's own button by its text: the step bar's arrows carry the same labels. */
const walk = (text: string) => {
  const b = screen.getAllByRole('button').find((el) => el.textContent === text);
  if (!b) throw new Error(`no ${text} button`);
  return b;
};
const library = () => screen.getByRole('region', { name: 'Sound library' });
const lesson = () => screen.getByRole('article', { name: 'Fat bass' });

/** The API's answers: the user's sounds, their progress and their favourites. */
function serve({
  progress = [] as unknown[],
  favourites = [] as unknown[],
}: { progress?: unknown[]; favourites?: unknown[] } = {}) {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/v1/sounds') return [MINE];
    if (path === '/api/v1/me/progress') return progress;
    if (path === '/api/v1/me/favourites') return favourites;
    throw new Error(`unexpected GET ${path}`);
  });
}

const progressPuts = () =>
  api.put.mock.calls
    .filter(([path]) => String(path).startsWith('/api/v1/me/progress/'))
    .map(([path, opts]) => [path, (opts as { body: unknown }).body]);

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/synths/model-d');
  auth.signedIn = true;
  for (const f of Object.values(api)) f.mockReset();
  serve();
  api.put.mockImplementation(
    async (path: string, opts: { body: { step: number; completed?: boolean } }) => {
      const slug = decodeURIComponent(String(path).split('/').pop() ?? '');
      return entry(slug, opts.body.step, opts.body.completed ? '2026-10-16T11:00:00.000Z' : null);
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => focusStore.set(null));
});

describe('signed out', () => {
  it('shows no stars and records no steps', async () => {
    auth.signedIn = false;
    page();
    fireEvent.click(walk('Build it step by step'));
    fireEvent.click(walk('Next step'));
    expect(screen.queryByRole('button', { name: /favourites$/ })).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('lesson progress', () => {
  it('reads this synth’s progress, and shows it in the library and the lesson with a way to continue', async () => {
    serve({ progress: [entry('fat-bass', 1), entry('wobble', 0, '2026-10-01T10:00:00.000Z')] });
    page();
    await waitFor(() => expect(within(library()).getByText('Reached step 2 of 3')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/api/v1/me/progress', { params: { synthId: 'model-d' } });
    expect(within(library()).getByText('✓ Finished')).toBeTruthy();
    expect(within(lesson()).getByText('You reached step 2 of 3')).toBeTruthy();

    fireEvent.click(within(lesson()).getByRole('button', { name: 'Continue from step 2' }));
    // On step 2 of 3 now; it is no further than they had got, so nothing is sent.
    expect(within(lesson()).getByRole('tab', { name: /Build it/ }).textContent).toContain('2/3');
    expect(progressPuts()).toEqual([]);
  });

  it('records each step further than the user had got, and Finish from the last step finishes it', async () => {
    page();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/v1/me/progress', expect.anything())
    );
    fireEvent.click(walk('Build it step by step'));
    fireEvent.click(walk('Next step'));
    fireEvent.click(walk('Back'));
    fireEvent.click(walk('Next step'));
    fireEvent.click(walk('Next step'));
    fireEvent.click(walk('Finish'));
    await waitFor(() =>
      expect(within(lesson()).getByText('✓ You finished this lesson')).toBeTruthy()
    );

    expect(progressPuts()).toEqual([
      ['/api/v1/me/progress/model-d/fat-bass', { step: 0 }],
      ['/api/v1/me/progress/model-d/fat-bass', { step: 1 }],
      ['/api/v1/me/progress/model-d/fat-bass', { step: 2 }],
      ['/api/v1/me/progress/model-d/fat-bass', { step: 2, completed: true }],
    ]);
  });

  it('keeps a lesson cut shorter since within it: the last step, and Continue goes there', async () => {
    serve({ progress: [entry('fat-bass', 7)] });
    page();
    await waitFor(() => expect(within(library()).getByText('Reached step 3 of 3')).toBeTruthy());
    expect(within(lesson()).getByText('You reached step 3 of 3')).toBeTruthy();
    fireEvent.click(within(lesson()).getByRole('button', { name: 'Continue from step 3' }));
    expect(within(lesson()).getByRole('tab', { name: /Build it/ }).textContent).toContain('3/3');
  });

  it('does not write a step answered after the synth changed into the new synth’s progress', async () => {
    let answer: (v: unknown) => void = () => undefined;
    api.put.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const { result, rerender } = renderHook(
      ({ synthId }: { synthId: string }) => useLessonProgress(synthId, 'user-1'),
      { initialProps: { synthId: 'model-d' } }
    );
    await waitFor(() => expect(result.current.marks).not.toBeNull());
    act(() => result.current.record('bass', 1));
    rerender({ synthId: 'other-synth' });
    await waitFor(() => expect(result.current.marks).not.toBeNull());
    await act(async () => answer({ ...entry('bass', 1), synthId: 'model-d' }));
    expect(result.current.marks?.get('bass')).toBeUndefined();
  });

  it('forgets a step the account did not keep, so the next one that far sends it again', async () => {
    page();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/v1/me/progress', expect.anything())
    );
    api.put.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(walk('Build it step by step'));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    // Back to the finished sound, then the first step again: it was never kept, so it goes again.
    fireEvent.click(within(library()).getByRole('button', { name: /^Fat bass/ }));
    fireEvent.click(walk('Start from a blank patch'));
    await waitFor(() => expect(progressPuts()).toHaveLength(2));
    expect(progressPuts().map(([, body]) => body)).toEqual([{ step: 0 }, { step: 0 }]);
  });
});

describe('favourites', () => {
  it('stars and unstars the synth from beside the chooser', async () => {
    api.post.mockResolvedValue({
      id: 'cmfav1',
      kind: 'synth',
      synthId: 'model-d',
      slug: null,
      soundId: null,
    });
    page();
    const add = await screen.findByRole('button', { name: 'Add Model D to favourites' });
    expect(add.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(add);
    expect(api.post).toHaveBeenCalledWith('/api/v1/me/favourites', {
      body: { kind: 'synth', synthId: 'model-d' },
    });
    const remove = await screen.findByRole('button', { name: 'Remove Model D from favourites' });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    // Once the star has its id, pressing again removes it.
    await act(async () => undefined);
    fireEvent.click(remove);
    expect(api.delete).toHaveBeenCalledWith('/api/v1/me/favourites/cmfav1');
    expect(await screen.findByRole('button', { name: 'Add Model D to favourites' })).toBeTruthy();
  });

  it('shows the stars the account has on library sounds and the user’s own, and stars another', async () => {
    serve({
      favourites: [
        { id: 'cmfav2', kind: 'sound', synthId: 'model-d', slug: 'wobble', soundId: null },
        { id: 'cmfav3', kind: 'mine', synthId: 'model-d', slug: null, soundId: 'cmmine1' },
      ],
    });
    api.post.mockResolvedValue({
      id: 'cmfav4',
      kind: 'sound',
      synthId: 'model-d',
      slug: 'fat-bass',
      soundId: null,
    });
    page();
    expect(
      (
        await within(library()).findByRole('button', { name: 'Remove Wobble lead from favourites' })
      ).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      await screen.findByRole('button', { name: 'Remove Night bass from favourites' })
    ).toBeTruthy();

    fireEvent.click(within(library()).getByRole('button', { name: 'Add Fat bass to favourites' }));
    expect(api.post).toHaveBeenCalledWith('/api/v1/me/favourites', {
      body: { kind: 'sound', synthId: 'model-d', slug: 'fat-bass' },
    });
  });

  it('leaves a star off when it was already removed elsewhere, and puts one back that could not be', async () => {
    serve({
      favourites: [
        { id: 'cmfav1', kind: 'synth', synthId: 'model-d', slug: null, soundId: null },
        { id: 'cmfav2', kind: 'sound', synthId: 'model-d', slug: 'wobble', soundId: null },
      ],
    });
    api.delete.mockImplementation(async (path: string) => {
      if (path.endsWith('/cmfav1'))
        throw new APIClientError('Favourite not found', 'NOT_FOUND', 404);
      throw new APIClientError('Something went wrong', 'INTERNAL_ERROR', 500);
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Model D from favourites' }));
    fireEvent.click(
      within(library()).getByRole('button', { name: 'Remove Wobble lead from favourites' })
    );
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
    expect(
      await within(library()).findByRole('button', { name: 'Remove Wobble lead from favourites' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Model D to favourites' })).toBeTruthy();
  });

  it('removes a star pressed again the moment it was added, before the page has drawn it', async () => {
    let answer: (v: unknown) => void = () => undefined;
    api.post.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    api.delete.mockResolvedValue({ id: 'cmfav1' });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Model D to favourites' }));
    const star = screen.getByRole('button', { name: 'Remove Model D from favourites' });
    // The reply lands and the press follows in the same task, before React has drawn it.
    answer({ id: 'cmfav1', kind: 'synth', synthId: 'model-d', slug: null, soundId: null });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fireEvent.click(star);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/v1/me/favourites/cmfav1'));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('puts a star back when the account did not take it', async () => {
    api.post.mockRejectedValue(new Error('refused'));
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Model D to favourites' }));
    expect(screen.getByRole('button', { name: 'Remove Model D from favourites' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Add Model D to favourites' })).toBeTruthy();
  });
});
