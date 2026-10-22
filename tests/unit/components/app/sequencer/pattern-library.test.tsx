// @vitest-environment happy-dom

/**
 * The sequencer's patterns strip (`f-step-sequencer` t-81): a pattern edited in the module is saved to My patterns,
 * reopened after a reload from what the API holds (not from anything the page kept), renamed, saved over and deleted;
 * any synth's library riff opens as a starting point; and with one of the user's sounds open, the sound is pointed at
 * the saved pattern. The module, the sequencer's state and the My patterns hook are real; the API is a small stateful
 * fake behind `apiClient`, so what a reload reads is what an earlier render wrote.
 *
 * @see components/app/sequencer/pattern-library.tsx
 * @see components/app/sequencer/use-my-patterns.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer, type Sequencer as SeqState } from '@/components/app/sequencer/use-sequencer';
import { useMyPatterns } from '@/components/app/sequencer/use-my-patterns';
import type { OpenSoundDefault } from '@/components/app/sequencer/pattern-library';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { Phrase } from '@/lib/app/synths/contract';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** The API: patterns kept between renders, and two synths' libraries. */
const server = vi.hoisted(() => ({
  patterns: new Map<string, { id: string; name: string; pattern: unknown; synthId: string }>(),
  n: 0,
  libraries: {},
}));

vi.mock('@/lib/api/client', () => {
  const detail = (p: { id: string; name: string; pattern: unknown; synthId: string }) => ({
    ...p,
    steps: 0,
    parts: 1,
    problems: [],
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  });
  const idOf = (path: string) => decodeURIComponent(path.split('/').pop() ?? '');
  return {
    apiClient: {
      get: vi.fn(async (path: string) => {
        if (path === '/api/v1/patterns')
          return [...server.patterns.values()].reverse().map(({ pattern: _p, ...s }) => ({
            ...detail({ ...s, pattern: null }),
            pattern: undefined,
          }));
        if (path.startsWith('/api/v1/patterns/')) {
          const p = server.patterns.get(idOf(path));
          if (!p) throw new Error('Pattern not found');
          return detail(structuredClone(p));
        }
        if (path.startsWith('/api/v1/synths/'))
          return { sounds: server.libraries[idOf(path)] ?? [] };
        throw new Error(`unexpected GET ${path}`);
      }),
      post: vi.fn(
        async (
          _path: string,
          { body }: { body: { name: string; pattern: unknown; synthId: string } }
        ) => {
          const p = { id: `pat${++server.n}`, ...structuredClone(body) };
          server.patterns.set(p.id, p);
          return detail(p);
        }
      ),
      patch: vi.fn(async (path: string, { body }: { body: Record<string, unknown> }) => {
        const p = server.patterns.get(idOf(path));
        if (!p) throw new Error('Pattern not found');
        Object.assign(p, structuredClone(body));
        return detail(p);
      }),
      delete: vi.fn(async (path: string) => {
        server.patterns.delete(idOf(path));
      }),
    },
  };
});

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
/** A TB-303 library riff with a triplet: nothing like the sound's. */
const ACID: Phrase = {
  bpm: 132,
  loop: true,
  steps: [
    [0, 36, 0.5],
    [0.67, 39, 0.25],
    [1.5, 43, 0.5],
  ],
};

let state: SeqState;

function Page({ sound = null }: { sound?: OpenSoundDefault | null }) {
  const seq = useSequencer({ engine: null, ensureAudio: async () => false, riff: RIFF });
  const mine = useMyPatterns();
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
        synths: [
          { id: 'model-d', name: 'Model D' },
          { id: 'tb-303', name: 'TB-303' },
        ],
        mine,
        sound,
      }}
    />
  );
}

const strip = () => within(screen.getByRole('toolbar', { name: 'Patterns' }));
const button = (name: string | RegExp) => strip().getByRole('button', { name });
const held = () => screen.getByText(/^(The sound’s riff|.+)$/, { selector: '.kys-seq-lib-value' });

/** Chooses step `n` (a rest in the riff) and turns it on: an edit anyone could make. */
const editStep = (n: number) => {
  const keys = within(screen.getByRole('group', { name: /^Steps of part/ })).getAllByRole('button');
  fireEvent.click(keys[n - 1]);
  fireEvent.click(keys[n - 1]);
};
const editStep2 = () => editStep(2);

async function saveAs(name: string) {
  await act(async () => fireEvent.click(button('Save to My patterns')));
  fireEvent.change(screen.getByLabelText('Name the pattern'), { target: { value: name } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
}

beforeEach(() => {
  vi.clearAllMocks();
  server.patterns.clear();
  server.n = 0;
  server.libraries = {
    'model-d': [{ id: 'bass', name: 'Fat bass', phrase: RIFF }],
    'tb-303': [{ id: 'acid', name: 'Acid line', phrase: ACID }],
  };
});

describe('saving to My patterns', () => {
  it('names the edited pattern and saves it through the API, as it is in the sequencer', async () => {
    render(<Page />);
    expect(held().textContent).toBe('The sound’s riff');
    editStep2();
    const edited: Pattern = state.pattern;
    expect(screen.getByText('edited')).toBeTruthy();

    await saveAs('  My acid  ');

    const stored = [...server.patterns.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'My acid', synthId: 'model-d' });
    expect(stored[0].pattern).toEqual(edited);
    expect(held().textContent).toBe('My acid');
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Saved My acid/);
  });

  it('refuses a blank name and sends nothing', async () => {
    render(<Page />);
    await act(async () => fireEvent.click(button('Save to My patterns')));
    fireEvent.change(screen.getByLabelText('Name the pattern'), { target: { value: '   ' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(screen.getByRole('alert').textContent).toBe('Name the pattern');
    expect(server.patterns.size).toBe(0);
  });

  it('saves a further edit over the saved one, and renames it without losing an edit', async () => {
    render(<Page />);
    await saveAs('First');
    expect((button(/^Save First$/) as HTMLButtonElement).disabled).toBe(true);
    editStep2();
    await act(async () => fireEvent.click(button(/^Save First$/)));
    expect(server.patterns.get('pat1')?.pattern).toEqual(state.pattern);
    expect(server.patterns.size).toBe(1);

    editStep(4);
    await act(async () => fireEvent.click(button('Rename')));
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'Second' } });
    const form = screen.getByLabelText('New name').closest('form')!;
    await act(async () => fireEvent.click(within(form).getByRole('button', { name: 'Rename' })));
    expect(server.patterns.get('pat1')?.name).toBe('Second');
    expect(held().textContent).toBe('Second');
    // the rename sent no steps, so the edit since the save is still unsaved
    expect(screen.getByText('edited')).toBeTruthy();
  });
});

describe('after a reload', () => {
  it('opens the saved pattern from the API, not from anything the page kept', async () => {
    const first = render(<Page />);
    editStep2();
    const saved = state.pattern;
    await saveAs('Keeper');
    first.unmount();

    // a fresh page: the sound's riff again, and My patterns not read yet
    render(<Page />);
    expect(held().textContent).toBe('The sound’s riff');
    expect(state.pattern).not.toEqual(saved);

    await act(async () => fireEvent.click(button('My patterns')));
    const list = await screen.findByRole('list', { name: 'My patterns' });
    await act(async () => fireEvent.click(within(list).getByRole('button', { name: /Keeper/ })));

    expect(state.pattern).toEqual(saved);
    expect(state.loaded).toEqual({ id: 'pat1', name: 'Keeper' });
    expect(held().textContent).toBe('Keeper');
    // what it replaced is one Undo away
    expect(state.canUndo).toBe(true);
  });

  it('deletes it, and keeps holding it until something else opens', async () => {
    render(<Page />);
    await saveAs('Brief');
    await act(async () => fireEvent.click(button('Delete')));
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Delete the pattern' })).getByRole('button', {
          name: 'Delete',
        })
      )
    );
    expect(server.patterns.size).toBe(0);
    expect(state.loaded).toEqual({ id: null, name: 'Brief' });
    expect(button('Save to My patterns')).toBeTruthy();
  });
});

describe('the library', () => {
  it("opens another synth's riff as the pattern, without changing a note", async () => {
    render(<Page />);
    await act(async () => fireEvent.click(button('Library')));
    // the synth on the panel's library first
    expect(await screen.findByRole('button', { name: 'Fat bass' })).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Synth' }));
    fireEvent.click(screen.getByRole('option', { name: 'TB-303' }));
    const list = await screen.findByRole('list', { name: 'The TB-303’s library riffs' });
    await act(async () => fireEvent.click(within(list).getByRole('button', { name: 'Acid line' })));

    expect(state.pattern).toEqual(importPhrase(ACID));
    expect(state.loaded).toEqual({ id: null, name: 'Acid line (TB-303)' });
    expect(held().textContent).toBe('Acid line (TB-303)');
    // a starting point, saved nowhere yet
    expect(button('Save to My patterns')).toBeTruthy();
  });
});

describe('a sound playing a pattern by default', () => {
  it('needs a saved pattern, then points the sound at it, and back at its own riff', async () => {
    const setPattern = vi.fn(async () => undefined);
    const sound: OpenSoundDefault = { name: 'Night bass', patternId: null, setPattern };
    const { rerender } = render(<Page sound={sound} />);
    expect((button('Play with Night bass') as HTMLButtonElement).disabled).toBe(true);

    await saveAs('For the bass');
    await act(async () => fireEvent.click(button('Play with Night bass')));
    expect(setPattern).toHaveBeenLastCalledWith('pat1');

    rerender(<Page sound={{ ...sound, patternId: 'pat1' }} />);
    await waitFor(() =>
      expect(button('Play with Night bass').getAttribute('aria-pressed')).toBe('true')
    );
    await act(async () => fireEvent.click(button('Play with Night bass')));
    expect(setPattern).toHaveBeenLastCalledWith(null);
  });
});
