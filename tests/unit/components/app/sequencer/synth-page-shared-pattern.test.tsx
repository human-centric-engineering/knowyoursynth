// @vitest-environment happy-dom

/**
 * A shared pattern's page (`f-step-sequencer` t-83): the synth page with the pattern in its sequencer, open, and a strip
 * saying whose it is. Pins:
 *
 * - signed out, the sequencer opens holding the pattern, not the sound's riff, and Play plays the pattern's notes;
 *   choosing another sound changes the panel and leaves the pattern;
 * - Play it on moves to the same pattern on another synth;
 * - signed in on someone else's, Save a copy sends the steps as they are with the shared pattern as its source, and the
 *   sequencer then holds the copy as theirs; while it holds the shared one, the sequencer's own Save gives way to it;
 * - on the visitor's own, no Save a copy and no Report.
 *
 * The page, the panel and the sequencer are real; the router, the audio engine, the session and the API are fakes.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/sharing/shared-pattern-strip.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { PublicPattern, UserPatternDetail } from '@/lib/app/patterns/data';
import { importPhrase } from '@/lib/app/sequencer/import';
import { tallScreen } from '@/tests/helpers/synth-side';

const { router, engine, auth, api } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
    frame: 0,
    ctx: { sampleRate: 48000 },
  },
  auth: { signedIn: false },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: auth.signedIn ? { user: { id: 'user-1' }, session: { id: 's-1' } } : null,
    isPending: false,
  }),
}));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
// The account's settings and last panel answer "nothing kept yet", so `api` sees only the patterns API.
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

const sound = (
  over: Partial<CatalogueSound> & Pick<CatalogueSound, 'id' | 'name'>
): CatalogueSound => ({
  ref: 'In the style of nobody',
  artist: 'Nobody',
  tags: ['bass'],
  level: 1,
  blurb: 'A test sound.',
  how: 'Because.',
  phrase: { bpm: 100, loop: true, steps: [[0, 36, 1]] },
  steps: [],
  context: {},
  tweaks: [],
  version: def.version,
  ...over,
});
const FAT_BASS = sound({ id: 'fat-bass', name: 'Fat bass' });
const WOBBLE = sound({
  id: 'wobble',
  name: 'Wobble lead',
  phrase: { bpm: 140, loop: true, steps: [[0, 60, 2]] },
});

const MODEL_D: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'A test synth.',
  design: 'neutral',
  definitionVersion: def.version,
  soundCount: 2,
};
const PRO_ONE = { ...MODEL_D, id: 'pro-1', name: 'Pro-One' };
const detail: SynthDetail = {
  synth: MODEL_D,
  sounds: [FAT_BASS, WOBBLE],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
};

const SLUG = 'abcdefghjk';
const NOTES: [number, number, number][] = [
  [0, 40, 1],
  [1, 47, 1],
  [2, 52, 1],
];
const SHARED: PublicPattern = {
  slug: SLUG,
  visibility: 'published',
  name: 'Acid walk',
  synthId: 'model-d',
  publishedAt: '2026-10-22T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  basedOn: null,
  pattern: importPhrase({ bpm: 128, loop: true, steps: NOTES }),
  problems: [],
  steps: 12,
  parts: 1,
};

const page = () =>
  render(
    <SynthPage
      detail={detail}
      synths={[MODEL_D, PRO_ONE]}
      viewParam={null}
      sharedPattern={SHARED}
    />
  );
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const sent = () => engine.send.mock.calls.map((c) => c[0] as { type: string });
const lastSent = (type: string) =>
  sent()
    .filter((m) => m.type === type)
    .at(-1);
const sequencer = () => screen.getByRole('region', { name: 'Sequencer' });
const strip = () => screen.getByRole('region', { name: 'Shared pattern' });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};

const detailOf = (over: Partial<UserPatternDetail>): UserPatternDetail => ({
  id: 'cmpat1',
  name: 'Acid walk',
  synthId: 'model-d',
  steps: 12,
  parts: 1,
  visibility: 'private',
  slug: null,
  publishedAt: null,
  unlisted: false,
  basedOn: null,
  pattern: SHARED.pattern,
  problems: [],
  createdAt: '2026-10-22T10:00:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', `/synths/model-d/p/${SLUG}`);
  tallScreen();
  auth.signedIn = false;
  for (const f of Object.values(api)) f.mockReset();
  api.get.mockResolvedValue([]);
  router.push.mockReset();
  engine.send.mockReset();
  engine.resume.mockReset().mockResolvedValue(undefined);
  engine.suspend.mockReset().mockResolvedValue(undefined);
  engine.running = false;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('signed out', () => {
  it('opens the sequencer on the pattern, says whose it is, and plays its notes', async () => {
    page();
    expect(within(strip()).getByRole('heading', { name: 'Acid walk' })).toBeTruthy();
    expect(within(strip()).getByText(/patchwork/)).toBeTruthy();
    expect(within(strip()).getByRole('link', { name: 'Sign in to save a copy' })).toBeTruthy();
    expect(within(strip()).queryByRole('button', { name: 'Report' })).toBeNull();

    expect(within(sequencer()).getByText('Acid walk')).toBeTruthy();
    expect(within(sequencer()).getByRole('button', { name: 'Step 1: E2, on' })).toBeTruthy();

    await press('Play');
    expect(lastSent('pattern')).toEqual({
      type: 'pattern',
      bpm: 128,
      loop: { notes: NOTES, beats: 3 },
    });
  });

  it('keeps the pattern when another sound is chosen', async () => {
    page();
    fireEvent.click(button(/^Choose a sound/));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Sounds' }))
        .getAllByRole('button')
        .filter((b) => b.textContent?.includes('Wobble lead'))[0]
    );
    expect(within(sequencer()).getByText('Acid walk')).toBeTruthy();
    expect(within(sequencer()).getByRole('button', { name: 'Step 1: E2, on' })).toBeTruthy();
  });

  it('plays the same pattern on another synth', () => {
    page();
    fireEvent.change(within(strip()).getByLabelText('Play it on'), {
      target: { value: 'pro-1' },
    });
    expect(router.push).toHaveBeenCalledWith(`/synths/pro-1/p/${SLUG}`);
  });
});

describe('signed in', () => {
  it("saves a copy of someone else's, crediting it, which the sequencer then holds as theirs", async () => {
    auth.signedIn = true;
    api.post.mockResolvedValue(
      detailOf({ basedOn: { name: 'Acid walk', username: 'patchwork', slug: SLUG } })
    );
    page();
    await waitFor(() =>
      expect(within(strip()).getByRole('button', { name: 'Save a copy' })).toBeTruthy()
    );
    expect(within(strip()).getByRole('button', { name: 'Report' })).toBeTruthy();
    // the sequencer's own Save would keep it uncredited, so it gives way while the shared pattern is held
    expect(within(sequencer()).queryByRole('button', { name: 'Save to My patterns' })).toBeNull();

    await act(async () => {
      fireEvent.click(within(strip()).getByRole('button', { name: 'Save a copy' }));
    });
    expect(api.post).toHaveBeenCalledWith('/api/v1/patterns', {
      body: { source: { shared: SLUG }, pattern: SHARED.pattern, synthId: 'model-d' },
    });
    expect(within(strip()).getByText(/Saved a copy to My patterns/)).toBeTruthy();
    expect(within(sequencer()).getByRole('button', { name: 'Save Acid walk' })).toBeTruthy();
  });

  it('offers no copy or report on their own, but opens it as theirs', async () => {
    auth.signedIn = true;
    const own = detailOf({ visibility: 'published', slug: SLUG });
    api.get.mockImplementation(async (path: string) =>
      path === '/api/v1/patterns' ? [own] : path.startsWith('/api/v1/patterns/') ? own : []
    );
    page();
    await waitFor(() =>
      expect(within(strip()).getByText('This is one of your patterns.')).toBeTruthy()
    );
    expect(within(strip()).queryByRole('button', { name: 'Save a copy' })).toBeNull();
    expect(within(strip()).queryByRole('button', { name: 'Report' })).toBeNull();
    await act(async () => {
      fireEvent.click(within(strip()).getByRole('button', { name: 'Open it to edit' }));
    });
    expect(within(sequencer()).getByRole('button', { name: 'Save Acid walk' })).toBeTruthy();
  });
});
