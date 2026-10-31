// @vitest-environment happy-dom

/**
 * The pattern picker (`f-pattern-library` t-123): with a library sound on the panel, the sequencer reads its patterns
 * once, opens on the default in place of the riff, and lists them default first, each with its role and, where it has
 * one, its Inspired by (linked to the databank) and fidelity. Picking one opens it. The module, the sequencer's state
 * and the patterns hook are real; the API is a fake behind `apiClient`.
 *
 * @see components/app/sequencer/sound-pattern-picker.tsx
 * @see components/app/sequencer/use-sound-patterns.ts
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer, type Sequencer as SeqState } from '@/components/app/sequencer/use-sequencer';
import { useMyPatterns } from '@/components/app/sequencer/use-my-patterns';
import { useSoundPatterns } from '@/components/app/sequencer/use-sound-patterns';
import { inspiredHref } from '@/components/app/sequencer/sound-pattern-picker';
import { apiClient } from '@/lib/api/client';
import { importPhrase } from '@/lib/app/sequencer/import';
import { patternFacts } from '@/lib/app/patterns/library-facts';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { Phrase } from '@/lib/app/synths/contract';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const server = vi.hoisted(() => ({
  sounds: {},
  /** A read that has not come back yet, for the test to settle. */
  hold: null as null | { resolve: () => void },
  fail: false,
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(async (path: string) => {
      const m = /^\/api\/v1\/synths\/([^/]+)\/sounds\/([^/]+)\/patterns$/.exec(path);
      if (!m) throw new Error(`unexpected GET ${path}`);
      if (server.hold) await new Promise<void>((resolve) => (server.hold = { resolve }));
      if (server.fail) throw new Error('Server error');
      const list = server.sounds[`${m[1]}/${m[2]}`];
      if (!list) throw new Error('Patch not found');
      return structuredClone(list);
    }),
  },
}));

/** C3, D♯3, G3: the sound's riff. */
const RIFF: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 48, 0.25],
    [0.5, 51, 0.25],
    [1, 55, 0.25],
  ],
};
const OTHER: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 36, 0.5],
    [1, 43, 0.5],
  ],
};

/** The riff as its default pattern, with the swing a riff cannot say: what tells it apart from the imported riff. */
const DEFAULT: Pattern = { ...importPhrase(RIFF), swing: 62 };
const SECOND: Pattern = importPhrase(OTHER);

function view(
  id: string,
  pattern: Pattern,
  over: Partial<LibraryPatternView> & { inspiredBy?: Partial<LibraryPatternView['inspiredBy']> }
): LibraryPatternView {
  const { inspiredBy, ...rest } = over;
  return {
    id,
    key: `k:${id}`,
    name: id,
    pattern,
    role: 'lead_line',
    tempo: null,
    inspiredBy: {
      kind: 'genre',
      label: '',
      songId: null,
      partId: null,
      artistId: null,
      synthId: null,
      ...inspiredBy,
    },
    fidelity: 'in_the_style_of',
    sources: [],
    origin: 'ai_generated',
    facts: patternFacts(pattern),
    ...rest,
  };
}

const PATTERNS = [
  view('patdefault000000000001', DEFAULT, {
    name: 'Fat bass',
    role: 'bass_line',
    inspiredBy: { kind: 'artist', label: 'Kraftwerk', artistId: 'kraftwerk' },
  }),
  view('patsecond0000000000002', SECOND, {
    name: 'The Model, verse',
    role: 'arp',
    fidelity: 'transcribed',
    inspiredBy: { kind: 'work', label: 'The Model', songId: 'the-model', partId: 'part1' },
  }),
  view('patplain00000000000003', SECOND, { name: 'Plain', role: 'held' }),
];

let state: SeqState;

function Page({ enabled = true, slug = 'fat-bass' }: { enabled?: boolean; slug?: string }) {
  const seq = useSequencer({ engine: null, ensureAudio: async () => false, riff: RIFF });
  const mine = useMyPatterns();
  const soundPatterns = useSoundPatterns({ synthId: 'model-d', slug, name: 'Fat bass' }, enabled);
  state = seq;
  return (
    <Sequencer
      seq={seq}
      playing={false}
      onPlay={() => undefined}
      onStop={() => undefined}
      library={{
        signedIn: true,
        signInHref: '/login',
        synthId: 'model-d',
        synths: [{ id: 'model-d', name: 'Model D' }],
        mine,
        sound: null,
        soundPatterns,
      }}
    />
  );
}

const strip = () => within(screen.getByRole('toolbar', { name: 'Patterns' }));
const items = () =>
  within(screen.getByRole('list', { name: 'Fat bass’s patterns' })).getAllByRole('listitem');

async function openPicker() {
  await act(async () =>
    fireEvent.click(strip().getByRole('button', { name: 'Fat bass’s patterns' }))
  );
  return items();
}

beforeEach(() => {
  vi.clearAllMocks();
  server.sounds = { 'model-d/fat-bass': PATTERNS };
  server.hold = null;
  server.fail = false;
});

describe('opening on the default', () => {
  it('reads the sound’s patterns once and holds its default in place of the riff, with no Undo to the riff', async () => {
    render(<Page />);
    await waitFor(() => expect(state.loaded?.libraryId).toBe('patdefault000000000001'));
    expect(state.pattern).toEqual(DEFAULT);
    expect(state.loaded).toEqual({
      id: null,
      name: 'Fat bass',
      libraryId: 'patdefault000000000001',
    });
    expect(state.canUndo).toBe(false);
    expect(state.edited).toBe(false);
    expect(apiClient.get as Mock).toHaveBeenCalledTimes(1);
    expect(apiClient.get as Mock).toHaveBeenCalledWith(
      '/api/v1/synths/model-d/sounds/fat-bass/patterns'
    );

    const [first] = await openPicker();
    expect(first.textContent).toContain('Fat bass');
    expect(within(first).getByText('Default')).toBeTruthy();
    expect(within(first).getByRole('button').getAttribute('aria-current')).toBe('true');
    expect(strip().getByRole('button', { name: 'Fat bass’s patterns' }).textContent).toContain(
      'Patterns (3)'
    );
  });

  it('lists them in the sound’s order, each with its role', async () => {
    render(<Page />);
    const list = await openPicker();
    expect(list.map((li) => within(li).getByRole('button').textContent)).toEqual([
      'Fat bassDefaultBass line · 2 beats',
      'The Model, verseArp / sequence · 2 beats',
      'PlainHeld · 2 beats',
    ]);
  });

  it('reads nothing while the sequencer is closed', () => {
    render(<Page enabled={false} />);
    expect(apiClient.get as Mock).not.toHaveBeenCalled();
    expect(state.loaded).toBeNull();
  });

  it('leaves an edit made while the patterns were being read', async () => {
    server.hold = { resolve: () => undefined };
    render(<Page />);
    // an edit: the riff swung
    act(() => {
      state.edit((p) => ({ ...p, swing: 55 }));
    });
    const edited = state.pattern;
    await act(async () => server.hold?.resolve());
    await openPicker();
    expect(state.pattern).toEqual(edited);
    expect(state.loaded).toBeNull();
  });

  it('says so when they cannot be read, and Patterns reads them again', async () => {
    server.fail = true;
    render(<Page />);
    await act(async () =>
      fireEvent.click(strip().getByRole('button', { name: 'Fat bass’s patterns' }))
    );
    expect(await screen.findByText(/patterns could not be read/)).toBeTruthy();
    expect(state.loaded).toBeNull();

    server.fail = false;
    const toggle = strip().getByRole('button', { name: 'Fat bass’s patterns' });
    await act(async () => fireEvent.click(toggle)); // closes
    await act(async () => fireEvent.click(toggle)); // opens, and reads again
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(state.loaded?.libraryId).toBe('patdefault000000000001');
  });
});

describe('picking a pattern', () => {
  it('opens it in the sequencer, and Undo goes back to the default', async () => {
    render(<Page />);
    await waitFor(() => expect(state.loaded?.libraryId).toBe('patdefault000000000001'));
    const [, second] = await openPicker();
    await act(async () => fireEvent.click(within(second).getByRole('button')));

    expect(state.pattern).toEqual(SECOND);
    expect(state.loaded).toEqual({
      id: null,
      name: 'The Model, verse',
      libraryId: 'patsecond0000000000002',
    });
    expect(screen.getByRole('status').textContent).toBe(
      'Opened The Model, verse. Undo goes back to what was here.'
    );
    // it can be saved to My patterns from here, under its own name
    expect(strip().getByRole('button', { name: 'Save to My patterns' })).toBeTruthy();

    act(() => state.undo());
    expect(state.pattern).toEqual(DEFAULT);
    expect(state.loaded?.libraryId).toBe('patdefault000000000001');
  });
});

describe('Inspired by and fidelity', () => {
  it('shows them where a pattern has an inspiration, linked to the databank, and not where it has none', async () => {
    render(<Page />);
    const [first, second, plain] = await openPicker();

    expect(first.textContent).toContain('Inspired by Kraftwerk');
    expect(within(first).getByRole('link', { name: 'Kraftwerk' }).getAttribute('href')).toBe(
      '/bank/artists/kraftwerk'
    );
    expect(within(first).getByText('In the style of')).toBeTruthy();

    expect(within(second).getByRole('link', { name: 'The Model' }).getAttribute('href')).toBe(
      '/bank/songs/the-model'
    );
    const fidelity = within(second).getByText('Transcribed');
    expect(fidelity.getAttribute('title')).toMatch(/score or the original recording/);

    expect(plain.textContent).not.toContain('Inspired by');
    expect(within(plain).queryByText('In the style of')).toBeNull();
    expect(within(plain).queryByRole('link')).toBeNull();
  });
});

describe('inspiredHref', () => {
  const by = (o: Partial<LibraryPatternView['inspiredBy']>): LibraryPatternView['inspiredBy'] => ({
    kind: 'genre',
    label: 'x',
    songId: null,
    partId: null,
    artistId: null,
    synthId: null,
    ...o,
  });

  it('links a work to its song’s page, part or not, and an artist to theirs', () => {
    expect(inspiredHref(by({ kind: 'work', songId: 'oxygene' }), 'model-d')).toBe(
      '/bank/songs/oxygene'
    );
    expect(inspiredHref(by({ kind: 'work', songId: 'oxygene', partId: 'p' }), 'model-d')).toBe(
      '/bank/songs/oxygene'
    );
    expect(inspiredHref(by({ kind: 'artist', artistId: 'eno' }), 'model-d')).toBe(
      '/bank/artists/eno'
    );
  });

  it('links another synth to its page, and not the synth the page is for', () => {
    expect(inspiredHref(by({ kind: 'synth', synthId: 'tb-303' }), 'model-d')).toBe(
      '/synths/tb-303'
    );
    expect(inspiredHref(by({ kind: 'synth', synthId: 'model-d' }), 'model-d')).toBeNull();
  });

  it('links nothing for a genre, or a link whose row has gone', () => {
    expect(inspiredHref(by({ kind: 'genre' }), 'model-d')).toBeNull();
    expect(inspiredHref(by({ kind: 'work', songId: null }), 'model-d')).toBeNull();
    expect(inspiredHref(by({ kind: 'artist', artistId: null }), 'model-d')).toBeNull();
  });
});
