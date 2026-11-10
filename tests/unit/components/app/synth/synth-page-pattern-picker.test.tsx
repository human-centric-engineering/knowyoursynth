// @vitest-environment happy-dom

/**
 * The pattern picker in the Play deck (`f-pattern-picker` t-213), on the synth page: a pattern picked beside Play is
 * what Play plays with the sequencer closed, one of the user's sounds that points at a pattern plays it the same way,
 * and another patch puts back its riff. The page, the panel and the sequencer are real; the audio engine records what
 * it is sent, the API is a fake behind `apiClient`, and the sound detector answers at once, since what it hears is not
 * what these tests are about.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/synth/pattern-picker.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { comeBackTo, storeSound } from '@/tests/helpers/synth-session';
import { tallScreen } from '@/tests/helpers/synth-side';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { newPattern } from '@/lib/app/sequencer/pattern';
import { patternFacts } from '@/lib/app/patterns/library-facts';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import type { RankResult } from '@/lib/app/patterns/rank-read';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';

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
  api: { get: vi.fn(), post: vi.fn() },
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
vi.mock('@/lib/app/patterns/suggest-detect', () => ({
  createKindReader: () => ({
    read: async () => ({ silent: false, attack: 0.01 }),
    dispose: () => undefined,
  }),
}));
// The account's settings and last panel, and the tutor's reads, answer "nothing yet", and their writes are dropped, so
// `api` sees only the sounds and patterns this file is about.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const quiet = (path: string) =>
    path.startsWith('/api/v1/me/') || path.startsWith('/api/v1/tutor/');
  return {
    ...real,
    apiClient: {
      get: (path: string, opts?: unknown) =>
        quiet(path)
          ? Promise.resolve(
              path === '/api/v1/me/settings'
                ? { tips: null, dim: null, heat: null, harm: null, fx: null }
                : path === '/api/v1/tutor/allowance'
                  ? { limit: 30, used: 0, remaining: 30, resetsAt: '2026-11-09T00:00:00.000Z' }
                  : path.startsWith('/api/v1/tutor/')
                    ? { conversation: null }
                    : null
            )
          : api.get(path, opts),
      post: (path: string, opts?: unknown) => api.post(path, opts),
      put: () => Promise.resolve(null),
      patch: () => Promise.resolve(null),
      delete: () => Promise.resolve(null),
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
  phrase: { bpm: 90, loop: true, steps: [[0, 36, 1]] },
  steps: [],
  context: {},
  tweaks: [],
  version: def.version,
  ...over,
});
const FAT_BASS = sound({
  id: 'fat-bass',
  name: 'Fat bass',
  steps: [{ title: 'Close it', module: 'filter', why: 'Dark.', set: { 'filter.cutoff': -2 } }],
});
const WOBBLE = sound({
  id: 'wobble',
  name: 'Wobble lead',
  phrase: { bpm: 120, loop: true, steps: [[0, 48, 1]] },
  steps: [{ title: 'Open it', module: 'filter', why: 'Bright.', set: { 'filter.cutoff': 3 } }],
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
const detail: SynthDetail = {
  synth: MODEL_D,
  sounds: [FAT_BASS, WOBBLE],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  links: { count: 0, kinds: [] },
  soundLinks: {},
  instruments: [],
};

/** A library pattern at 140 bpm, nothing like either sound's riff. */
const ROLLING = (() => {
  const pattern = { ...newPattern(8), bpm: 140 };
  pattern.parts[0].steps[2] = { on: true, notes: [{ note: 40, gate: 1 }] };
  const v: LibraryPatternView = {
    id: 'patroll00000000000000001',
    key: 'k:roll',
    name: 'Rolling eighths',
    pattern,
    role: 'bass_line',
    tempo: null,
    inspiredBy: {
      kind: 'genre',
      label: '',
      songId: null,
      partId: null,
      artistId: null,
      synthId: null,
    },
    fidelity: 'in_the_style_of',
    sources: [],
    origin: 'ai_generated',
    facts: patternFacts(pattern),
  };
  return v;
})();
const RANKED: RankResult = {
  reading: null,
  sections: [
    {
      role: 'bass_line',
      label: 'Bass line',
      share: null,
      patterns: [
        {
          id: ROLLING.id,
          name: ROLLING.name,
          role: 'bass_line',
          bars: 0.5,
          inspiredBy: ROLLING.inspiredBy,
          fidelity: ROLLING.fidelity,
          why: null,
          tooManyVoices: false,
        },
      ],
    },
  ],
};

/** The API: the library's answers, and the user's sounds when a test serves them. */
function serve(extra: Record<string, unknown> = {}) {
  api.get.mockImplementation(async (path: string) => {
    if (path in extra) return extra[path];
    if (path === '/api/v1/sounds') return [];
    if (path === '/api/v1/synths/model-d/sounds/fat-bass/patterns') return [];
    if (path === `/api/v1/library-patterns/${ROLLING.id}`) return ROLLING;
    throw new Error(`unexpected GET ${path}`);
  });
  api.post.mockImplementation(async (path: string) => {
    if (path === '/api/v1/library-patterns/rank') return structuredClone(RANKED);
    throw new Error(`unexpected POST ${path}`);
  });
}

const page = (shown: SynthDetail = detail) => {
  storeSound(def, FAT_BASS);
  return render(<SynthPage detail={shown} synths={[MODEL_D]} viewParam={null} />);
};
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const sent = () => engine.send.mock.calls.map((c) => c[0] as { type: string; bpm?: number });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};
const picker = () => button(/^Choose what Play plays/);
const chooseSound = (name: string) => {
  fireEvent.click(button(/^Choose a patch/));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Patches' }))
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes(name))[0]
  );
};

beforeEach(() => {
  window.localStorage.clear();
  comeBackTo('model-d');
  tallScreen();
  auth.signedIn = false;
  api.get.mockReset();
  api.post.mockReset();
  serve();
  engine.send.mockReset();
  engine.resume.mockReset().mockResolvedValue(undefined);
  engine.suspend.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the pattern picker beside Play', () => {
  it('names the riff by its sound until a pattern is picked, and Play plays the riff', async () => {
    page();
    expect(picker().getAttribute('aria-label')).toBe('Choose what Play plays (now: Fat bass)');
    await press('Play');
    expect(sent().at(-1)?.type).toBe('phrase');
  });

  it('makes a picked pattern what Play plays with the sequencer closed', async () => {
    page();
    fireEvent.click(picker());
    const pick = await within(screen.getByRole('dialog', { name: 'Patterns' })).findByRole(
      'button',
      { name: /Rolling eighths/ },
      { timeout: 3000 }
    );
    // the sound's own are read for it, and the library ranked without the sound's own
    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/synths/model-d/sounds/fat-bass/patterns',
      undefined
    );
    expect(api.post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', features: { silent: false, attack: 0.01 } },
    });
    await act(async () => {
      fireEvent.click(pick);
    });
    expect(screen.queryByRole('dialog', { name: 'Patterns' })).toBeNull();
    expect(picker().getAttribute('aria-label')).toBe(
      'Choose what Play plays (now: Rolling eighths)'
    );
    expect(screen.queryByRole('region', { name: 'Sequencer' })).toBeNull();

    engine.send.mockClear();
    await press('Play');
    expect(sent().some((m) => m.type === 'phrase')).toBe(false);
    expect(
      sent()
        .filter((m) => m.type === 'pattern')
        .at(-1)
    ).toMatchObject({ bpm: 140 });
  });

  it('takes over from the riff when a pattern is picked while the riff plays', async () => {
    page();
    await press('Play');
    expect(sent().at(-1)?.type).toBe('phrase');
    fireEvent.click(picker());
    const pick = await screen.findByRole('button', { name: /Rolling eighths/ }, { timeout: 3000 });
    await act(async () => {
      fireEvent.click(pick);
    });
    expect(
      sent()
        .filter((m) => m.type === 'pattern')
        .at(-1)
    ).toMatchObject({ bpm: 140 });
    expect(button('Stop')).toBeTruthy();
  });

  it('marks the sound’s default as what plays while the riff is held, and picking it loads nothing', async () => {
    serve({ '/api/v1/synths/model-d/sounds/fat-bass/patterns': [ROLLING] });
    // The catalogue sends the sound with its default pattern's name (t-224).
    page({ ...detail, sounds: [{ ...FAT_BASS, riffName: ROLLING.name }, WOBBLE] });
    // The riff is named for its default before the picker is opened, and naming it reads none of its patterns.
    expect(picker().getAttribute('aria-label')).toBe(
      'Choose what Play plays (now: Rolling eighths)'
    );
    expect(api.get).not.toHaveBeenCalledWith(
      '/api/v1/synths/model-d/sounds/fat-bass/patterns',
      undefined
    );
    fireEvent.click(picker());
    const own = await screen.findByRole('list', { name: 'Fat bass’s patterns' }, { timeout: 3000 });
    const dflt = within(own).getByRole('button', { name: /Rolling eighths/ });
    expect(dflt.getAttribute('aria-current')).toBe('true');
    await act(async () => {
      fireEvent.click(dflt);
    });
    expect(screen.queryByRole('dialog', { name: 'Patterns' })).toBeNull();
    expect(picker().getAttribute('aria-label')).toBe(
      'Choose what Play plays (now: Rolling eighths)'
    );
  });

  it('goes back to the new patch’s riff, by name, when another patch is chosen', async () => {
    page();
    fireEvent.click(picker());
    const pick = await screen.findByRole('button', { name: /Rolling eighths/ }, { timeout: 3000 });
    await act(async () => {
      fireEvent.click(pick);
    });
    chooseSound('Wobble lead');
    await waitFor(() =>
      expect(picker().getAttribute('aria-label')).toBe('Choose what Play plays (now: Wobble lead)')
    );
    engine.send.mockClear();
    await press('Play');
    await waitFor(() => expect(sent().some((m) => m.type === 'phrase')).toBe(true));
    expect(sent().some((m) => m.type === 'pattern')).toBe(false);
    expect(sent().find((m) => m.type === 'phrase')).toMatchObject({
      phrase: { steps: WOBBLE.phrase.steps },
    });
  });
});

describe('one of the user’s sounds that plays a pattern', () => {
  const summary: UserSoundSummary = {
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
    patternId: 'cmpat1',
    links: [],
    playable: true,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
  };
  const NIGHT_BASS: UserSoundDetail = {
    ...summary,
    panel: { values: { ...def.init, 'filter.cutoff': 4 }, cables: [] },
    problems: [],
    fitted: null,
  };
  const SAVED = {
    id: 'cmpat1',
    name: 'Night groove',
    synthId: 'model-d',
    steps: 8,
    parts: 1,
    pattern: { ...newPattern(8), bpm: 132 },
    problems: [],
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:00:00.000Z',
  };
  SAVED.pattern.parts[0].steps[0] = { on: true, notes: [{ note: 36, gate: 1 }] };

  it('plays it with the sequencer closed, as Play names it', async () => {
    auth.signedIn = true;
    serve({
      '/api/v1/sounds': [summary],
      '/api/v1/sounds/cmmine1': NIGHT_BASS,
      '/api/v1/patterns/cmpat1': SAVED,
    });
    page();
    fireEvent.click(button(/^Choose a patch/));
    const patches = screen.getByRole('dialog', { name: 'Patches' });
    fireEvent.click(await within(patches).findByRole('button', { name: /Night bass/ }));
    await waitFor(() =>
      expect(picker().getAttribute('aria-label')).toBe('Choose what Play plays (now: Night groove)')
    );
    expect(screen.queryByRole('region', { name: 'Sequencer' })).toBeNull();
    engine.send.mockClear();
    await press('Play');
    expect(sent().some((m) => m.type === 'phrase')).toBe(false);
    expect(
      sent()
        .filter((m) => m.type === 'pattern')
        .at(-1)
    ).toMatchObject({ bpm: 132 });
  });
});
