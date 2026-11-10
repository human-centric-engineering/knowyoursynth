// @vitest-environment happy-dom

/**
 * The Play deck's pattern picker (`f-pattern-picker` t-213): the patch's own patterns first, then the library's
 * sections, each its best few with "Show all N"; a search that filters every section; and a pick that reads a library
 * pattern's notes and loads them. The component is real; the API is a fake behind `apiClient`, and `load` is a spy
 * standing in for the sequencer's.
 *
 * @see components/app/synth/pattern-picker.tsx
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  PatternPicker,
  SECTION_FEW,
  type PatternPickerProps,
} from '@/components/app/synth/pattern-picker';
import type { RankedPatterns } from '@/components/app/synth/use-ranked-patterns';
import type { SoundPatterns } from '@/components/app/sequencer/use-sound-patterns';
import { apiClient } from '@/lib/api/client';
import { newPattern } from '@/lib/app/sequencer/pattern';
import { patternFacts } from '@/lib/app/patterns/library-facts';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import type { RankedPattern, RankSection } from '@/lib/app/patterns/rank';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));

const get = apiClient.get as Mock;
type LoadFn = PatternPickerProps['load'];

const NO_CREDIT: LibraryPatternView['inspiredBy'] = {
  kind: 'genre',
  label: '',
  songId: null,
  partId: null,
  artistId: null,
  synthId: null,
};

function view(
  id: string,
  name: string,
  over: Partial<LibraryPatternView> = {}
): LibraryPatternView {
  const pattern = newPattern(8);
  pattern.parts[0].steps[0] = { on: true, notes: [{ note: 36, gate: 1 }] };
  return {
    id,
    key: `k:${id}`,
    name,
    pattern,
    role: 'bass_line',
    tempo: null,
    inspiredBy: NO_CREDIT,
    fidelity: 'in_the_style_of',
    sources: [],
    origin: 'ai_generated',
    facts: patternFacts(pattern),
    ...over,
  };
}

const row = (id: string, name: string, over: Partial<RankedPattern> = {}): RankedPattern => ({
  id,
  name,
  role: 'lead_line',
  bars: 2,
  inspiredBy: NO_CREDIT,
  fidelity: 'in_the_style_of',
  why: 'bright, fast attack → lead line',
  tooManyVoices: false,
  ...over,
});

const OWN_A = view('patown00000000000000000a', 'Fat riff');
const OWN_B = view('patown00000000000000000b', 'Octave walk');
const OWN: SoundPatterns = {
  sound: { synthId: 'model-d', slug: 'fat-bass', name: 'Fat bass' },
  patterns: [OWN_A, OWN_B],
  error: false,
  retry: vi.fn(),
};

// More lead lines than a section shows at first, one of them credited to an artist the search can find.
const LEADS = Array.from({ length: SECTION_FEW + 3 }, (_, i) =>
  row(`patlead${String(i).padStart(17, '0')}`, `Lead ${i + 1}`)
);
LEADS[6] = row(LEADS[6].id, 'Lucky line', {
  inspiredBy: { ...NO_CREDIT, kind: 'artist', label: 'Emerson Lake', artistId: 'cmartist1' },
  fidelity: 'reconstructed',
});
const HELD = row('patheld00000000000000001', 'Long note', { role: 'held', why: null });
const CHORD = row('patchord0000000000000001', 'Big stab', {
  role: 'chord_stabs',
  tooManyVoices: true,
});
const SECTIONS: RankSection[] = [
  { role: 'lead_line', label: 'Lead line', share: 0.6, patterns: LEADS },
  { role: 'held', label: 'Held', share: 0.3, patterns: [HELD] },
  { role: 'arp', label: 'Arpeggio', share: 0.05, patterns: [] },
  { role: 'chord_stabs', label: 'Chord stabs', share: 0.05, patterns: [CHORD] },
];
const READY: RankedPatterns = {
  state: 'ready',
  result: {
    reading: {
      category: 'lead',
      role: 'lead_line',
      register: 'mid',
      traits: ['bright', 'fast attack'],
      summary: 'bright, fast attack → lead line',
    },
    sections: SECTIONS,
  },
};

function Picker({
  own = OWN,
  ranked = READY,
  load = vi.fn<LoadFn>(() => newPattern(8)),
  onPicked,
  sheet = false,
  startOpen = true,
}: {
  own?: SoundPatterns | null;
  ranked?: RankedPatterns;
  load?: Mock<LoadFn>;
  onPicked?: () => void;
  sheet?: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <PatternPicker
      synthId="model-d"
      plays="Fat bass"
      open={open}
      onOpenChange={setOpen}
      sheet={sheet}
      own={own}
      ranked={ranked}
      current={null}
      load={load}
      onPicked={onPicked}
    />
  );
}

const dialog = () => screen.getByRole('dialog', { name: 'Patterns' });
const sectionNames = () =>
  within(dialog())
    .getAllByRole('region')
    .map((r) => r.getAttribute('aria-label'));
const names = (section: string) =>
  within(within(dialog()).getByRole('list', { name: section }))
    .getAllByRole('button')
    .map((b) => b.querySelector('.kys-patpick-row-name')?.textContent);
const search = (text: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search the patterns' }), {
    target: { value: text },
  });

beforeEach(() => {
  get.mockReset();
});

describe('the pattern picker beside Play', () => {
  it('names what Play plays, and opens a list from the button', () => {
    render(<Picker startOpen={false} />);
    const btn = screen.getByRole('button', {
      name: 'Choose what Play plays (now: Fat bass)',
    });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(dialog()).toBeTruthy();
    // the search has focus as it opens
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('lists the sound’s own patterns first, the default marked, then the library’s sections in their order', () => {
    render(<Picker />);
    // an empty section is not drawn
    expect(sectionNames()).toEqual(['Fat bass’s patterns', 'Lead line', 'Held', 'Chord stabs']);
    expect(names('Fat bass’s patterns')).toEqual(['Fat riffDefault', 'Octave walk']);
    expect(within(dialog()).getByText(/Heard: bright, fast attack → lead line/)).toBeTruthy();
    // a pattern that needs more voices than the patch says so, and a row's reason is its tooltip
    expect(within(dialog()).getByText(/needs more voices/)).toBeTruthy();
    expect(
      within(dialog())
        .getByRole('button', { name: /Lead 1/ })
        .getAttribute('title')
    ).toBe('Bright, fast attack → lead line');
  });

  it('shows a section’s best few, and all of it after Show all N', () => {
    render(<Picker />);
    expect(names('Lead line')).toEqual(['Lead 1', 'Lead 2', 'Lead 3', 'Lead 4', 'Lead 5']);
    fireEvent.click(within(dialog()).getByRole('button', { name: `Show all ${LEADS.length}` }));
    expect(names('Lead line')).toEqual(LEADS.map((p) => p.name));
    expect(within(dialog()).queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('filters every section by name and by Inspired by, and says when nothing matches', () => {
    render(<Picker />);
    search('walk');
    expect(sectionNames()).toEqual(['Fat bass’s patterns']);
    expect(names('Fat bass’s patterns')).toEqual(['Octave walk']);

    // found by its Inspired by, beyond the first few of its section, and with no Show all for one match
    search('emerson');
    expect(names('Lead line')).toEqual(['Lucky line']);
    expect(within(dialog()).getByRole('link', { name: 'Emerson Lake' })).toBeTruthy();
    expect(within(dialog()).getByText('None of these matches the search.')).toBeTruthy();

    // every word has to match: two words from different patterns name neither
    search('long stab');
    expect(within(dialog()).queryByRole('list', { name: 'Held' })).toBeNull();
    expect(within(dialog()).getByText(/No pattern matches that/)).toBeTruthy();

    search('');
    expect(sectionNames()).toEqual(['Fat bass’s patterns', 'Lead line', 'Held', 'Chord stabs']);
  });

  it('picks a library pattern by reading its notes and loading them, and closes', async () => {
    const load = vi.fn<LoadFn>(() => newPattern(8));
    const onPicked = vi.fn();
    const picked = view(HELD.id, 'Long note', { role: 'held' });
    get.mockResolvedValue(picked);
    render(<Picker load={load} onPicked={onPicked} />);
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /Long note/ }));
    });
    expect(get).toHaveBeenCalledWith(`/api/v1/library-patterns/${HELD.id}`);
    expect(load).toHaveBeenCalledWith(picked.pattern, {
      id: null,
      name: 'Long note',
      libraryId: HELD.id,
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('picks one of the sound’s own without a read: it carries its notes', async () => {
    const load = vi.fn<LoadFn>(() => newPattern(8));
    render(<Picker load={load} />);
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /Octave walk/ }));
    });
    expect(get).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(OWN_B.pattern, {
      id: null,
      name: 'Octave walk',
      libraryId: OWN_B.id,
    });
  });

  it('says so when a pattern could not be read, loads nothing and stays open', async () => {
    const load = vi.fn<LoadFn>(() => newPattern(8));
    get.mockRejectedValue(new Error('Server error'));
    render(<Picker load={load} />);
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /Long note/ }));
    });
    expect(within(dialog()).getByRole('alert').textContent).toBe(
      'Long note could not be read. Try again.'
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('loads only the last of two picks made while the first was being read', async () => {
    const load = vi.fn<LoadFn>(() => newPattern(8));
    let first: (v: LibraryPatternView) => void = () => undefined;
    get.mockImplementationOnce(() => new Promise((r) => (first = r)));
    get.mockResolvedValueOnce(view(CHORD.id, 'Big stab'));
    render(<Picker load={load} />);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Long note/ }));
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /Big stab/ }));
    });
    await act(async () => first(view(HELD.id, 'Long note')));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1]).toEqual({ id: null, name: 'Big stab', libraryId: CHORD.id });
  });

  it('loads through the page as it is once a read lands, not as it was when the row was pressed', async () => {
    let answer: (v: LibraryPatternView) => void = () => undefined;
    get.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const before = vi.fn();
    const after = vi.fn();
    const { rerender } = render(<Picker onPicked={before} />);
    fireEvent.click(within(dialog()).getByRole('button', { name: /Long note/ }));
    // the riff stopped (or started) while the pattern was read
    rerender(<Picker onPicked={after} />);
    await act(async () => answer(view(HELD.id, 'Long note')));
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('lets go of the row being read when one of the sound’s own is picked meanwhile', async () => {
    get.mockImplementationOnce(() => new Promise(() => undefined));
    const load = vi.fn<LoadFn>(() => null);
    render(<Picker load={load} />);
    const long = within(dialog()).getByRole('button', { name: /Long note/ });
    fireEvent.click(long);
    expect(long.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /Octave walk/ }));
    });
    expect(within(dialog()).getByRole('alert').textContent).toBe('Octave walk cannot be played.');
    expect(long.getAttribute('aria-busy')).toBeNull();
  });

  it('says it is waiting while the sound on the panel is still loading', () => {
    render(<Picker own={null} ranked={{ state: 'off', result: null }} />);
    expect(within(dialog()).getByRole('status').textContent).toMatch(/Waiting for the sound/);
  });

  it('shows the sound’s own at once while the patch is read, and a line saying so', () => {
    render(<Picker ranked={{ state: 'reading', result: null }} />);
    expect(sectionNames()).toEqual(['Fat bass’s patterns']);
    expect(within(dialog()).getByRole('status').textContent).toMatch(/Listening to the patch/);
  });

  it('says the library could not be read, and lists it by part and name with no reading', () => {
    const { unmount } = render(<Picker ranked={{ state: 'error', result: null }} />);
    expect(within(dialog()).getByText(/The library could not be read/)).toBeTruthy();
    unmount();
    render(
      <Picker
        own={null}
        ranked={{ state: 'ready', result: { reading: null, sections: SECTIONS } }}
      />
    );
    expect(within(dialog()).getByText(/listed by part and name/)).toBeTruthy();
    expect(sectionNames()).toEqual(['Lead line', 'Held', 'Chord stabs']);
  });

  it('says the sound’s own are being read, and offers a retry when they could not be', () => {
    const retry = vi.fn();
    const { unmount } = render(<Picker own={{ ...OWN, patterns: null }} />);
    expect(within(dialog()).getByText('Reading Fat bass’s patterns…')).toBeTruthy();
    unmount();
    render(<Picker own={{ ...OWN, patterns: null, error: true, retry }} />);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, giving focus back to its button, and on a press outside it', async () => {
    render(<Picker />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const btn = screen.getByRole('button', { name: /Choose what Play plays/ });
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    expect(dialog()).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clears the search on Escape first, and closes on the next', () => {
    render(<Picker />);
    search('walk');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(dialog()).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('');
    expect(sectionNames()).toEqual(['Fat bass’s patterns', 'Lead line', 'Held', 'Chord stabs']);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a bottom sheet below lg', () => {
    render(<Picker sheet />);
    const sheet = dialog();
    expect(sheet.closest('.kys-patpick')).toBeNull();
    expect(within(sheet).getByRole('searchbox', { name: 'Search the patterns' })).toBeTruthy();
    expect(within(sheet).getByRole('list', { name: 'Fat bass’s patterns' })).toBeTruthy();
  });
});
