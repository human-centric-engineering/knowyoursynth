// @vitest-environment happy-dom

/**
 * The sequencer on the synth page (`f-step-sequencer` t-80): opened from the player bar, it holds the sound's riff,
 * and the bar's Play and the sequencer are one transport. From `lg` up it is in the dock; below it, in a bottom sheet.
 * The audio engine is a fake that records what it is sent; the page, the panel and the sequencer are real.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/sequencer/sequencer.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { tallScreen } from '@/tests/helpers/synth-side';

const { router, engine, events } = vi.hoisted(() => ({
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
  events: { fn: null as ((e: { type: string }) => void) | null },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client', () => ({ useSession: () => ({ data: null, isPending: false }) }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: (f: (e: { type: string }) => void) => {
    events.fn = f;
    return () => {
      if (events.fn === f) events.fn = null;
    };
  },
}));

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

const FAT_BASS = sound({
  id: 'fat-bass',
  name: 'Fat bass',
  phrase: {
    bpm: 90,
    loop: true,
    steps: [
      [0, 36, 1],
      [1, 43, 1],
    ],
  },
});
const WOBBLE = sound({ id: 'wobble', name: 'Wobble lead' });

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
};

const page = () => render(<SynthPage detail={detail} synths={[MODEL_D]} viewParam={null} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const sent = () => engine.send.mock.calls.map((c) => c[0] as { type: string });
const lastSent = (type: string) =>
  sent()
    .filter((m) => m.type === type)
    .at(-1);
const sequencer = () => screen.getByRole('region', { name: 'Sequencer' });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};

/** Media queries answered as a phone would: narrower than `lg`, with a touch screen. */
function phone() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(max-width: 1023px)' || query === '(pointer: coarse)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
  );
}

beforeEach(() => {
  window.localStorage.clear();
  tallScreen();
  engine.send.mockReset();
  engine.resume.mockReset().mockResolvedValue(undefined);
  engine.suspend.mockReset().mockResolvedValue(undefined);
  engine.running = false;
  events.fn = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sequencer on the synth page', () => {
  it('opens from the bar, in the dock, holding the sound’s riff', () => {
    page();
    expect(screen.queryByRole('region', { name: 'Sequencer' })).toBeNull();
    fireEvent.click(button('Sequencer'));
    expect(button('Sequencer').getAttribute('aria-pressed')).toBe('true');
    const keys = within(sequencer()).getAllByRole('button', { name: /^Step \d+:/ });
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual([
      'Step 1: C2, on',
      'Step 2: rest',
      'Step 3: rest',
      'Step 4: rest',
      'Step 5: G2, on',
      'Step 6: rest',
      'Step 7: rest',
      'Step 8: rest',
    ]);
    fireEvent.click(button('Sequencer'));
    expect(screen.queryByRole('region', { name: 'Sequencer' })).toBeNull();
  });

  it('takes the Learn sound design strip’s place in the dock while it is open', () => {
    page();
    expect(screen.getByRole('heading', { name: 'Learn sound design' })).toBeTruthy();
    fireEvent.click(button('Sequencer'));
    expect(screen.queryByRole('heading', { name: 'Learn sound design' })).toBeNull();
    fireEvent.click(button('Sequencer'));
    expect(screen.getByRole('heading', { name: 'Learn sound design' })).toBeTruthy();
  });

  it('makes Play play the pattern while it is open: the riff’s notes, as the pattern player plays them', async () => {
    page();
    fireEvent.click(button('Sequencer'));
    await press('Play');
    expect(lastSent('phrase')).toBeUndefined();
    expect(lastSent('pattern')).toEqual({
      type: 'pattern',
      bpm: 90,
      loop: { notes: FAT_BASS.phrase.steps, beats: 2 },
    });
    // One transport, on the bar: the dock has no Play of its own.
    expect(within(sequencer()).queryByRole('button', { name: /^(Play|Stop)$/ })).toBeNull();
    await press('Stop');
    expect(lastSent('stopPattern')).toEqual({ type: 'stopPattern' });
    expect(button('Play')).toBeTruthy();
  });

  it('hands the engine’s loop events to the sequencer, which queues the next loop', async () => {
    page();
    fireEvent.click(button('Sequencer'));
    await press('Play');
    act(() =>
      events.fn?.({
        type: 'loop',
        index: 0,
        start: true,
        beat: 0,
        beats: 2,
        bpm: 90,
        frame: 0,
      } as { type: string })
    );
    expect(lastSent('patternNext')).toEqual({
      type: 'patternNext',
      loop: { notes: FAT_BASS.phrase.steps, beats: 2 },
    });
    act(() => events.fn?.({ type: 'patternEnd' }));
    expect(button('Play')).toBeTruthy();
  });

  it('takes over from a riff playing when it is opened, and a riff started stops the pattern', async () => {
    page();
    await press('Play');
    expect(lastSent('phrase')).toBeTruthy();
    await act(async () => {
      fireEvent.click(button('Sequencer'));
    });
    expect(lastSent('pattern')).toBeTruthy();
    expect(button('Stop')).toBeTruthy();
    // Closed, the bar plays the riff again: the pattern is told it has stopped.
    fireEvent.click(button('Sequencer'));
    await press('Stop');
    await press('Play');
    expect(sent().at(-1)?.type).toBe('phrase');
    expect(button('Stop')).toBeTruthy();
  });

  it('loads the next sound’s riff when another sound is chosen', () => {
    page();
    fireEvent.click(button('Sequencer'));
    fireEvent.click(button(/^Choose a patch/));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Patches' }))
        .getAllByRole('button')
        .filter((b) => b.textContent?.includes('Wobble lead'))[0]
    );
    const keys = within(sequencer()).getAllByRole('button', { name: /^Step \d+:/ });
    expect(keys[0].getAttribute('aria-label')).toBe('Step 1: C2, on');
    expect(keys).toHaveLength(4);
  });

  it('keeps the pattern’s edits when it is closed and opened again', () => {
    page();
    fireEvent.click(button('Sequencer'));
    fireEvent.click(within(sequencer()).getByRole('button', { name: 'Copy, paste and clear' }));
    fireEvent.click(within(sequencer()).getByRole('menuitem', { name: 'Clear' }));
    fireEvent.click(button('Sequencer'));
    fireEvent.click(button('Sequencer'));
    const keys = within(sequencer()).getAllByRole('button', { name: /^Step \d+:/ });
    expect(keys.every((k) => k.getAttribute('aria-label')?.endsWith('rest'))).toBe(true);
  });

  it('puts a note played on the computer keyboard on the chosen step while it is open, and only then', () => {
    page();
    // Closed, a key plays and changes nothing.
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    fireEvent.click(button('Sequencer'));
    const first = () =>
      within(sequencer())
        .getAllByRole('button', { name: /^Step \d+:/ })[0]
        .getAttribute('aria-label');
    expect(first()).toBe('Step 1: C2, on');
    // A is C3 at the keyboard's octave.
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    expect(first()).toBe('Step 1: C3, on');
  });

  it('in arp mode, plays a key through the pattern instead of sounding it, and lets it go there', async () => {
    page();
    fireEvent.click(button('Sequencer'));
    fireEvent.click(within(sequencer()).getByRole('combobox', { name: 'Keys' }));
    fireEvent.click(screen.getByRole('option', { name: 'Arp' }));
    engine.send.mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    });
    // A is C3: the pattern starts with it on every step that plays, and the page sends no note of its own
    const types = sent().map((m) => m.type);
    expect(types).toContain('pattern');
    expect(types).not.toContain('noteOn');
    const start = sent().find(
      (m): m is { type: 'pattern'; loop: { notes: number[][] } } => m.type === 'pattern'
    );
    const pitches = start?.loop.notes.map((n) => n[1]) ?? [];
    expect(pitches.length).toBeGreaterThan(0);
    expect(pitches.every((n) => n === 48)).toBe(true);
    engine.send.mockClear();
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    // letting go stops what the press started, and sends no note-off for a note the page never played
    const after = sent().map((m) => m.type);
    expect(after).toContain('stopPattern');
    expect(after).not.toContain('noteOff');
  });

  it('in arp mode, keeps a note playing while another input still holds it', async () => {
    page();
    fireEvent.click(button('Sequencer'));
    fireEvent.click(within(sequencer()).getByRole('combobox', { name: 'Keys' }));
    fireEvent.click(screen.getByRole('option', { name: 'Arp' }));
    // C3 on the computer keyboard and on the piano
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    });
    fireEvent.pointerDown(button('Note 48'));
    engine.send.mockClear();
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    // the piano still holds C3: the arp plays on, and the page sounds nothing of its own
    expect(sent().map((m) => m.type)).not.toContain('stopPattern');
    expect(sent().map((m) => m.type)).not.toContain('noteOff');
    fireEvent.pointerUp(button('Note 48'));
    expect(sent().map((m) => m.type)).toContain('stopPattern');
    expect(sent().map((m) => m.type)).not.toContain('noteOff');
  });

  it('opens in a docked bottom sheet on a phone, with the panel live above it', () => {
    phone();
    page();
    fireEvent.click(button('Sequencer'));
    const sheet = screen.getByRole('dialog', { name: 'Sequencer' });
    expect(within(sheet).getAllByRole('button', { name: /^Step \d+:/ })).toHaveLength(8);
    // The sheet can cover the bar, so it carries a Play of its own.
    expect(within(sheet).getByRole('button', { name: 'Play' })).toBeTruthy();
    // Docked, not modal: the bar beside the panel is still in reach.
    expect(screen.getByRole('navigation', { name: 'Beside the panel' })).toBeTruthy();
    fireEvent.click(button('Sequencer'));
    expect(screen.queryByRole('dialog', { name: 'Sequencer' })).toBeNull();
  });
});
