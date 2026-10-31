// @vitest-environment happy-dom

/**
 * "Suits this sound" in the pattern picker (`f-pattern-library` t-125): a library sound as it came shows only its own
 * patterns, and one moved far from how it came shows patterns that suit it as well; any other patch shows them at once.
 * The module, the sequencer's state, both hooks and the detector are real (reading on the page's thread, as it does
 * where the host blocks workers); the API is a fake behind `apiClient`.
 *
 * @see components/app/sequencer/use-suggested-patterns.ts
 * @see components/app/sequencer/pattern-library.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer } from '@/components/app/sequencer/use-sequencer';
import { useMyPatterns } from '@/components/app/sequencer/use-my-patterns';
import { useSoundPatterns } from '@/components/app/sequencer/use-sound-patterns';
import {
  SETTLE_MS,
  useSuggestedPatterns,
  type PanelState,
  type SuggestState,
} from '@/components/app/sequencer/use-suggested-patterns';
import { apiClient } from '@/lib/api/client';
import { importPhrase } from '@/lib/app/sequencer/import';
import { patternFacts } from '@/lib/app/patterns/library-facts';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import type { SuggestResult } from '@/lib/app/patterns/suggest-read';
import type { Phrase, Preset, SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const server = vi.hoisted(() => ({ fail: false, own: [] as unknown[], suits: [] as unknown[] }));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(async () => structuredClone(server.own)),
    post: vi.fn(async (path: string) => {
      if (path !== '/api/v1/library-patterns/suggest') throw new Error(`unexpected POST ${path}`);
      if (server.fail) throw new Error('Server error');
      const result: SuggestResult = {
        reading: {
          category: 'pad',
          role: 'held',
          register: 'mid',
          traits: ['slow attack', 'holds'],
          summary: 'slow attack, holds → held, chord changes',
        },
        suggestions: (server.suits as LibraryPatternView[]).map((pattern) => ({
          id: pattern.id,
          role: pattern.role,
          score: 0.4,
          reason: `slow attack, holds → ${pattern.role}`,
          pattern,
        })),
      };
      return structuredClone(result);
    }),
  },
}));

const DEF: SynthDef = (() => {
  const def = getSynthDef('model-d');
  if (!def) throw new Error('no Model D');
  return def;
})();

/** A Model D library sound of this category, as the catalogue serves it. */
function sound(category: string): Preset {
  const file = loadCatalogueData().sounds.find((f) => f.synth === 'model-d');
  const raw = file?.sounds.find((s) => Array.isArray(s.tags) && s.tags[0] === category);
  const checked = raw && validatePreset(DEF, raw);
  if (!checked || !checked.ok) throw new Error(`no Model D ${category}`);
  return checked.value;
}
const BASS = sound('bass');
const PAD = sound('pad');

function view(id: string, name: string, phrase: Phrase, role: LibraryPatternView['role']) {
  const pattern = importPhrase(phrase);
  const v: LibraryPatternView = {
    id,
    key: `k:${id}`,
    name,
    pattern,
    role,
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
}
const OWN = view('patown000000000000000001', 'Funk riff', BASS.phrase, 'bass_line');
const HELD = view(
  'patheld00000000000000002',
  'Long note',
  { bpm: 90, loop: true, steps: [[0, 60, 4]] },
  'held'
);

let suggestState: SuggestState = 'off';
const START = { slug: BASS.id, panel: () => presetState(DEF, BASS) };

/** A library sound (`fromLibrary`) or another patch on the panel, at `panel`. */
function Page({
  panel,
  fromLibrary = true,
  open = true,
  start = START,
}: {
  panel: PanelState;
  fromLibrary?: boolean;
  /** Whether the sequencer is on the page. */
  open?: boolean;
  /** What the panel started as: the sound as it came, unless a test says otherwise. */
  start?: typeof START;
}) {
  const seq = useSequencer({ engine: null, ensureAudio: async () => false, riff: BASS.phrase });
  const mine = useMyPatterns();
  const soundPatterns = useSoundPatterns(
    fromLibrary ? { synthId: 'model-d', slug: BASS.id, name: BASS.name } : null,
    true
  );
  const suggested = useSuggestedPatterns({
    synthId: 'model-d',
    def: DEF,
    panel,
    start: fromLibrary ? start : null,
    ownPatterns: soundPatterns?.patterns?.length ?? null,
  });
  suggestState = suggested.state;
  if (!open) return null;
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
        suggested,
      }}
    />
  );
}

const strip = () => within(screen.getByRole('toolbar', { name: 'Patterns' }));
const post = () => apiClient.post as Mock;
const AS_IT_CAME: PanelState = presetState(DEF, BASS);
const FAR: PanelState = presetState(DEF, PAD);

async function open(name: string) {
  await act(async () => fireEvent.click(strip().getByRole('button', { name })));
}
const waitForState = (state: SuggestState) =>
  waitFor(() => expect(suggestState).toBe(state), { timeout: 5000 });

beforeEach(() => {
  vi.clearAllMocks();
  // No Worker here: the detector reads on the page's thread, as it does where a host blocks workers.
  vi.stubGlobal('Worker', undefined);
  server.fail = false;
  server.own = [OWN];
  server.suits = [HELD];
  suggestState = 'off';
});
afterEach(() => {
  vi.unstubAllGlobals();
  // The glide tests silence console.error to read it; the rest of the file keeps React's warnings.
  vi.restoreAllMocks();
});

describe('Suits this sound', () => {
  it('shows only a library sound’s own patterns while it is as it came, and asks nothing', async () => {
    render(<Page panel={AS_IT_CAME} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('near');
    expect(screen.getByRole('list', { name: `${BASS.name}’s patterns` })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Suits this sound' })).toBeNull();
    expect(post()).not.toHaveBeenCalled();
  });

  it('adds patterns that suit a library sound moved far from how it came, under its own, with what it heard', async () => {
    render(<Page panel={FAR} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('ready');
    const groups = screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'));
    expect(groups).toEqual([`${BASS.name}’s patterns`, 'Suits this sound']);
    const suits = within(screen.getByRole('list', { name: 'Suits this sound' }));
    expect(suits.getByRole('button', { name: /Long note/ }).getAttribute('title')).toBe(
      'Slow attack, holds → held'
    );
    expect(screen.getByText('Slow attack, holds → held, chord changes')).toBeTruthy();
    expect(post()).toHaveBeenCalledTimes(1);
    const [, options] = post().mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body).toMatchObject({ synthId: 'model-d', sound: BASS.id });
    expect(options.body.features).toMatchObject({ silent: false, voices: 1 });
  });

  it('opens a suggestion in the sequencer', async () => {
    render(<Page panel={FAR} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('ready');
    const suits = within(screen.getByRole('list', { name: 'Suits this sound' }));
    await act(async () => fireEvent.click(suits.getByRole('button', { name: /Long note/ })));
    expect(screen.getByText('Opened Long note. Undo goes back to what was here.')).toBeTruthy();
  });

  it('offers any other patch patterns that suit it at once, under a Patterns button of its own', async () => {
    render(<Page panel={AS_IT_CAME} fromLibrary={false} />);
    await open('Patterns that suit this sound');
    await waitForState('ready');
    expect(screen.getByRole('list', { name: 'Suits this sound' })).toBeTruthy();
    const [, options] = post().mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body).not.toHaveProperty('sound');
  });

  it('reads nothing while the picker is closed, and asks once the panel settles, not on every move', async () => {
    const { rerender } = render(<Page panel={FAR} fromLibrary={false} />);
    await new Promise((r) => setTimeout(r, SETTLE_MS + 200));
    expect(suggestState).toBe('off');
    expect(post()).not.toHaveBeenCalled();

    await open('Patterns that suit this sound');
    // Five moves inside the settle time: one question, about where the panel stopped.
    for (const sound of [BASS, PAD, BASS, PAD, BASS]) {
      rerender(<Page panel={presetState(DEF, sound)} fromLibrary={false} />);
      await new Promise((r) => setTimeout(r, SETTLE_MS / 4));
    }
    await waitForState('ready');
    expect(post()).toHaveBeenCalledTimes(1);

    // Back to a patch it has already asked about: the answer is kept.
    rerender(<Page panel={presetState(DEF, PAD)} fromLibrary={false} />);
    await waitFor(() => expect(post()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    rerender(<Page panel={presetState(DEF, BASS)} fromLibrary={false} />);
    await new Promise((r) => setTimeout(r, SETTLE_MS + 400));
    await waitForState('ready');
    expect(post()).toHaveBeenCalledTimes(2);
  });

  it('says when they could not be worked out, and tries again when Patterns is pressed', async () => {
    server.fail = true;
    render(<Page panel={FAR} fromLibrary={false} />);
    await open('Patterns that suit this sound');
    await waitForState('error');
    expect(
      screen.getByText(
        'Patterns that suit this sound could not be worked out. Close Patterns and open it again to try again.'
      )
    ).toBeTruthy();
    server.fail = false;
    await open('Patterns that suit this sound'); // closes
    await open('Patterns that suit this sound'); // opens, and tries again
    await waitForState('ready');
    expect(screen.getByRole('list', { name: 'Suits this sound' })).toBeTruthy();
  });

  it('offers a library sound with no patterns of its own patterns that suit it at once', async () => {
    server.own = [];
    render(<Page panel={AS_IT_CAME} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('ready');
    expect(screen.getByText(`${BASS.name} has no patterns yet.`)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Suits this sound' })).toBeTruthy();
    const [, options] = post().mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body).not.toHaveProperty('sound');
  });

  it('stops working them out when the sequencer closes with the picker open', async () => {
    const { rerender } = render(<Page panel={FAR} fromLibrary={false} />);
    await open('Patterns that suit this sound');
    await waitForState('ready');
    rerender(<Page panel={FAR} fromLibrary={false} open={false} />);
    await waitForState('off');
    rerender(<Page panel={AS_IT_CAME} fromLibrary={false} open={false} />);
    await new Promise((r) => setTimeout(r, SETTLE_MS + 300));
    expect(post()).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing suits a sound with no patterns of its own', async () => {
    server.own = [];
    server.suits = [];
    render(<Page panel={AS_IT_CAME} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('ready');
    expect(screen.getByText('No library pattern suits this sound yet.')).toBeTruthy();
  });

  it('takes away what suited the patch before while the new one is read', async () => {
    const { rerender } = render(<Page panel={FAR} fromLibrary={false} />);
    await open('Patterns that suit this sound');
    await waitForState('ready');
    rerender(<Page panel={AS_IT_CAME} fromLibrary={false} />);
    expect(suggestState).toBe('reading');
    expect(screen.queryByRole('list', { name: 'Suits this sound' })).toBeNull();
    await waitForState('ready');
  });

  it('takes a lesson step of a library sound as it came, not as moved far from the finished sound', async () => {
    const step = { slug: BASS.id, panel: () => presetState(DEF, BASS, 0) };
    // The first step is far from the finished sound, so comparing against that would offer more.
    render(<Page panel={presetState(DEF, BASS, 0)} start={step} />);
    await open(`${BASS.name}’s patterns`);
    await waitForState('near');
    expect(post()).not.toHaveBeenCalled();
  });

  // A glide moves the panel every frame (`use-panel-history.ts`), outside any act. A state update on each move, even to
  // the state it already is, chains an update onto every frame, which React reports as "Maximum update depth exceeded"
  // a second or so in (t-157).
  it.each([
    ['closed', false],
    ['reading', true],
  ])(
    'chains no update onto each frame of a glide, with the picker %s',
    async (_, picker) => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const FRAMES = 120;
      let frame = 0;
      let state: SuggestState = 'off';
      function Gliding() {
        const [panel, setPanel] = useState(FAR);
        const suggested = useSuggestedPatterns({
          synthId: 'model-d',
          def: DEF,
          panel,
          start: null,
        });
        state = suggested.state;
        const { want } = suggested;
        useEffect(() => {
          want(picker);
          let raf = 0;
          const turn = () => {
            frame += 1;
            setPanel({
              values: { ...FAR.values, 'filter.cutoff': frame / FRAMES },
              cables: FAR.cables,
            });
            if (frame < FRAMES) raf = requestAnimationFrame(turn);
          };
          raf = requestAnimationFrame(turn);
          return () => cancelAnimationFrame(raf);
        }, [want]);
        return null;
      }
      render(<Gliding />);
      await waitFor(() => expect(frame).toBe(FRAMES), { timeout: 10_000 });
      await new Promise((r) => setTimeout(r, 100));
      expect(state).toBe(picker ? 'reading' : 'off');
      const loops = err.mock.calls.filter((c) => String(c[0]).includes('Maximum update depth'));
      expect(loops).toEqual([]);
    },
    15_000
  );
});
