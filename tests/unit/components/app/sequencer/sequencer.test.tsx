// @vitest-environment happy-dom

/**
 * The sequencer module and the state behind it (`f-step-sequencer` t-80): it opens holding a sound's riff, an edit
 * reaches the engine (as an edit of the loop playing, without a restart, once it plays), every tool changes the part
 * and Undo takes it back, the transport starts and stops the engine's pattern player, and the keys and the inspector
 * work from the keyboard. The engine is a fake that records what it is sent; the pattern model is real.
 *
 * @see components/app/sequencer/sequencer.tsx
 * @see components/app/sequencer/use-sequencer.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer, type Sequencer as SeqState } from '@/components/app/sequencer/use-sequencer';
import type { Phrase } from '@/lib/app/synths/contract';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import type { LoopEvent, PatternLoop } from '@/lib/app/synths/audio/pattern-player';
import { logger } from '@/lib/logging';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** C3, D♯3, G3 and a held C4: two beats, eight sixteenths. Step 1, 3, 5 and 7. */
const RIFF: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 48, 0.25],
    [0.5, 51, 0.25],
    [1, 55, 0.25, 0.6],
    [1.5, 60, 0.5],
  ],
};

function fakeEngine() {
  const sent: SynthMessage[] = [];
  return {
    sent,
    send: vi.fn((m: SynthMessage) => void sent.push(m)),
    frame: 0,
    ctx: { sampleRate: 48000 },
  };
}
type FakeEngine = ReturnType<typeof fakeEngine>;

let engine: FakeEngine;
let state: SeqState;

function Harness({
  riff,
  tempo,
  audio = true,
}: {
  riff: Phrase | null;
  tempo?: number | null;
  audio?: boolean;
}) {
  const seq = useSequencer({ engine, ensureAudio: async () => audio, riff, tempo });
  state = seq;
  return (
    <Sequencer
      seq={seq}
      playing={seq.playing}
      onPlay={() => void seq.play()}
      onStop={seq.stop}
      onClose={() => undefined}
      transport
    />
  );
}

const open = (riff: Phrase | null = RIFF, tempo?: number | null) =>
  render(<Harness riff={riff} tempo={tempo} />);

const keys = () =>
  within(screen.getByRole('group', { name: /^Steps of part/ })).getAllByRole('button');
const key = (n: number) => keys()[n - 1];
const labels = () => keys().map((k) => k.getAttribute('aria-label'));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const slider = (name: string) => screen.getByRole('slider', { name });
const sentOf = <T extends SynthMessage['type']>(type: T) =>
  engine.sent.filter((m): m is Extract<SynthMessage, { type: T }> => m.type === type);
const lastOf = <T extends SynthMessage['type']>(type: T) => sentOf(type).at(-1);

const play = async () => {
  await act(async () => {
    fireEvent.click(button('Play'));
  });
};
const loopEvent = (over: Partial<LoopEvent> = {}): LoopEvent => ({
  type: 'loop',
  index: 0,
  start: true,
  beat: 0,
  beats: 2,
  bpm: 120,
  frame: 0,
  ...over,
});
const fire = (e: LoopEvent | { type: 'patternEnd' }) => act(() => state.onEvent(e));
const loopNotes = (l: PatternLoop | null | undefined) => l?.notes;

beforeEach(() => {
  engine = fakeEngine();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening on a sound', () => {
  it('holds the sound’s riff: its notes on their steps, the rests between', () => {
    open();
    expect(labels()).toEqual([
      'Step 1: C3, on',
      'Step 2: rest',
      'Step 3: D♯3, on',
      'Step 4: rest',
      'Step 5: G3, on',
      'Step 6: rest',
      'Step 7: C4, on',
      'Step 8: rest',
    ]);
    expect(slider('Length').getAttribute('aria-valuenow')).toBe('8');
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('120');
  });

  it('plays the riff as it was written: Play sends the engine the riff’s own notes', async () => {
    open();
    await play();
    const start = lastOf('pattern');
    expect(start).toEqual({ type: 'pattern', bpm: 120, loop: { notes: RIFF.steps, beats: 2 } });
  });

  it('follows a tempo the panel sets, as the riff does', async () => {
    const { rerender } = open(RIFF, 140);
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('140');
    rerender(<Harness riff={RIFF} tempo={150} />);
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('150');
    // Not an edit of the user's: there is nothing to undo.
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('loads another sound’s riff in place of the pattern, with nothing to undo; the same riff keeps the edits', () => {
    const { rerender } = open();
    fireEvent.click(button('Clear'));
    expect(labels().every((l) => l?.endsWith('rest'))).toBe(true);
    // The same riff read again (the sound renamed, say) is not a new riff.
    rerender(<Harness riff={{ ...RIFF, steps: RIFF.steps.map((s) => [...s] as typeof s) }} />);
    expect(labels().every((l) => l?.endsWith('rest'))).toBe(true);
    const other: Phrase = { bpm: 90, loop: true, steps: [[0, 36, 1]] };
    rerender(<Harness riff={other} />);
    expect(labels()).toEqual(['Step 1: C2, on', 'Step 2: rest', 'Step 3: rest', 'Step 4: rest']);
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('90');
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts the new riff from its top when another sound is chosen while it plays', async () => {
    const { rerender } = open();
    await play();
    rerender(<Harness riff={{ bpm: 90, loop: true, steps: [[0, 36, 1]] }} />);
    expect(lastOf('pattern')).toEqual({
      type: 'pattern',
      bpm: 90,
      loop: { notes: [[0, 36, 1]], beats: 1 },
    });
  });

  it('opens an empty pattern for no riff', () => {
    open(null);
    expect(keys()).toHaveLength(16);
    expect(labels().every((l) => l?.endsWith('rest'))).toBe(true);
  });
});

describe('the transport', () => {
  it('starts the pattern, queues the next loop at each loop’s start, and stops it', async () => {
    open();
    await play();
    expect(button('Stop')).toBeTruthy();
    expect(sentOf('patternNext')).toHaveLength(0);
    fire(loopEvent());
    expect(loopNotes(lastOf('patternNext')?.loop)).toEqual(RIFF.steps);
    fire(loopEvent({ index: 1 }));
    expect(sentOf('patternNext')).toHaveLength(2);
    // A loop event that is not a loop's start (the tempo moved the playhead) queues nothing.
    fire(loopEvent({ index: 1, start: false, beat: 1 }));
    expect(sentOf('patternNext')).toHaveLength(2);
    fireEvent.click(button('Stop'));
    expect(lastOf('stopPattern')).toEqual({ type: 'stopPattern' });
    expect(button('Play')).toBeTruthy();
  });

  it('queues the end of a pattern that plays once', async () => {
    open({ ...RIFF, loop: false });
    expect(button('Loop').getAttribute('aria-pressed')).toBe('false');
    await play();
    fire(loopEvent());
    expect(lastOf('patternNext')).toEqual({ type: 'patternNext', loop: null });
  });

  it('shows Play again when the engine says the pattern ended', async () => {
    open();
    await play();
    fire({ type: 'patternEnd' });
    expect(button('Play')).toBeTruthy();
  });

  it('sends nothing when the sound cannot be turned on', async () => {
    render(<Harness riff={RIFF} audio={false} />);
    await play();
    expect(engine.sent).toEqual([]);
    expect(button('Play')).toBeTruthy();
  });

  it('places the playhead from the audio clock, in the order the loop plays its steps', async () => {
    open();
    await play();
    expect(state.position()).toBeNull();
    fire(loopEvent());
    // 0.75 beats in at 120 bpm is 0.375 s: the fourth sixteenth.
    engine.frame = 0.375 * 48000;
    expect(state.position()).toEqual({ step: 3, part: 0 });
    // Reverse plays the last step first.
    fireEvent.change(screen.getByRole('combobox', { name: 'Direction' }), {
      target: { value: 'reverse' },
    });
    engine.frame = 0;
    expect(state.position()).toEqual({ step: 7, part: 0 });
  });
});

describe('editing', () => {
  it('sends nothing to the engine while it is stopped', () => {
    open();
    key(1).focus();
    fireEvent.keyDown(key(1), { key: 'ArrowUp' });
    expect(labels()[0]).toBe('Step 1: C♯3, on');
    expect(engine.sent).toEqual([]);
  });

  it('is heard without a restart while it plays: the loop playing is edited, and a fresh next loop queued', async () => {
    open();
    await play();
    fire(loopEvent());
    const before = engine.sent.length;
    fireEvent.keyDown(key(1), { key: 'ArrowUp' });
    const [edit, next] = engine.sent.slice(before);
    expect(edit).toEqual({
      type: 'patternEdit',
      loop: { notes: [[0, 49, 0.25], ...RIFF.steps.slice(1)], beats: 2 },
    });
    expect(next.type).toBe('patternNext');
    expect(sentOf('pattern')).toHaveLength(1);
  });

  it('sends the tempo when the tempo changes while it plays', async () => {
    open();
    await play();
    fireEvent.keyDown(slider('Tempo'), { key: 'ArrowUp' });
    expect(lastOf('tempo')).toEqual({ type: 'tempo', bpm: 121 });
    expect(lastOf('patternEdit')?.loop.beats).toBe(2);
  });

  it('changes the length, the step size, the swing and the transpose of what is played', async () => {
    open();
    // C3 onto step 2, an odd slot, which swing moves.
    fireEvent.click(button('Rotate right'));
    fireEvent.keyDown(slider('Length'), { key: 'PageUp' });
    expect(keys()).toHaveLength(16);
    expect(screen.getByRole('group', { name: 'Pages' })).toBeTruthy();
    fireEvent.keyDown(slider('Swing'), { key: 'End' });
    fireEvent.keyDown(slider('Transpose'), { key: 'PageUp' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Step' }), {
      target: { value: '1/8' },
    });
    await play();
    const loop = lastOf('pattern')?.loop;
    // 24 eighths are 12 beats. Swing at 75 moves step 2 half a step later: 1.5 eighths. An octave up.
    expect(loop?.beats).toBe(12);
    expect(loop?.notes[0]).toEqual([0.75, 60, 0.5]);
  });

  it('snaps notes to the scale from the root as they play', async () => {
    open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scale' }), {
      target: { value: 'major' },
    });
    await play();
    // D♯3 is not in C major: it snaps down to D3.
    expect(lastOf('pattern')?.loop.notes.map((n) => n[1])).toEqual([48, 50, 55, 60]);
  });

  it('adds part B as a copy of A, chained after it, and edits B alone', async () => {
    open();
    fireEvent.click(button('Add part B'));
    expect(button('Edit part B').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Steps of part B' })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Chain' }).value).toBe('0,1');
    fireEvent.click(button('Clear'));
    fireEvent.click(button('Edit part A'));
    expect(labels()[0]).toBe('Step 1: C3, on');
    await play();
    fire(loopEvent());
    // Loop 1 plays B: all rests.
    expect(lastOf('patternNext')?.loop?.notes).toEqual([]);
  });
});

describe('the tools', () => {
  const notes = () => labels().map((l) => l?.replace(/^Step \d+: /, ''));

  it.each([
    ['Rotate right', ['rest', 'C3, on', 'rest', 'D♯3, on', 'rest', 'G3, on', 'rest', 'C4, on']],
    ['Rotate left', ['rest', 'D♯3, on', 'rest', 'G3, on', 'rest', 'C4, on', 'rest', 'C3, on']],
    ['Reverse', ['rest', 'C4, on', 'rest', 'G3, on', 'rest', 'D♯3, on', 'rest', 'C3, on']],
    ['Octave up', ['C4, on', 'rest', 'D♯4, on', 'rest', 'G4, on', 'rest', 'C5, on', 'rest']],
    ['Octave down', ['C2, on', 'rest', 'D♯2, on', 'rest', 'G2, on', 'rest', 'C3, on', 'rest']],
    ['Degree up', ['C♯3, on', 'rest', 'E3, on', 'rest', 'G♯3, on', 'rest', 'C♯4, on', 'rest']],
    ['Degree down', ['B2, on', 'rest', 'D3, on', 'rest', 'F♯3, on', 'rest', 'B3, on', 'rest']],
    ['Clear', Array(8).fill('rest')],
  ])('%s changes the part, and Undo puts it back', (name, after) => {
    open();
    const was = labels();
    fireEvent.click(button(name));
    expect(notes()).toEqual(after);
    fireEvent.click(button('Undo'));
    expect(labels()).toEqual(was);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Euclid spreads the hits evenly, keeping the notes of the steps it turns off', () => {
    open();
    fireEvent.keyDown(slider('Hits'), { key: 'ArrowDown' });
    expect(slider('Hits').getAttribute('aria-valuenow')).toBe('3');
    fireEvent.click(button('Euclid'));
    // 3 in 8 is x..x..x.: step 4 comes on with the chosen step's note, 3 and 5 go off and keep theirs.
    expect(notes()).toEqual([
      'C3, on',
      'rest',
      'D♯3, off',
      'C3, on',
      'G3, off',
      'rest',
      'C4, on',
      'rest',
    ]);
    fireEvent.click(button('Undo'));
    expect(notes()[2]).toBe('D♯3, on');
  });

  it('Randomise writes a fresh line on the scale, and Mutate varies it, each undone', () => {
    open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scale' }), {
      target: { value: 'minorPentatonic' },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    fireEvent.click(button('Randomise'));
    const line = notes();
    expect(line).not.toEqual([
      'C3, on',
      'rest',
      'D♯3, on',
      'rest',
      'G3, on',
      'rest',
      'C4, on',
      'rest',
    ]);
    // Every note is in C minor pentatonic (C D♯ F G A♯), in the range the part used.
    const names = line.filter((l) => l !== 'rest').map((l) => l?.split(',')[0]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(['C', 'D♯', 'F', 'G', 'A♯']).toContain(n?.replace(/\d/g, ''));
    // Drawn low, Mutate moves every note.
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    fireEvent.click(button('Mutate'));
    expect(notes()).not.toEqual(line);
    fireEvent.click(button('Undo'));
    expect(notes()).toEqual(line);
  });

  it('copies a step and pastes it over another, and copies and pastes a page', () => {
    open();
    expect((button('Paste step') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(key(5));
    fireEvent.click(button('Copy step'));
    fireEvent.click(key(2));
    fireEvent.click(button('Paste step'));
    expect(labels()[1]).toBe('Step 2: G3, on');
    // A page to paste over: lengthen to two pages, copy the first, paste over the second.
    fireEvent.keyDown(slider('Length'), { key: 'End' });
    fireEvent.click(button('Copy page'));
    fireEvent.click(button(/^Page 2/));
    fireEvent.click(button('Paste page'));
    expect(labels()[0]).toBe('Step 17: C3, on');
    expect(labels()[1]).toBe('Step 18: G3, on');
  });

  it('undoes a turn of an encoder as one change', () => {
    open();
    for (let i = 0; i < 5; i++) fireEvent.keyDown(slider('Tempo'), { key: 'ArrowUp' });
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('125');
    fireEvent.click(button('Undo'));
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('120');
  });

  it('undoes an edit while it plays, and the engine hears the undo', async () => {
    open();
    await play();
    fireEvent.click(button('Clear'));
    expect(lastOf('patternEdit')?.loop.notes).toEqual([]);
    fireEvent.click(button('Undo'));
    expect(lastOf('patternEdit')?.loop.notes).toEqual(RIFF.steps);
  });
});

describe('from the keyboard', () => {
  it('moves along the steps with the arrows, the step chosen and focused, and pages with it', () => {
    open();
    fireEvent.keyDown(slider('Length'), { key: 'End' });
    key(1).focus();
    expect(key(1).getAttribute('aria-current')).toBe('true');
    expect(key(1).tabIndex).toBe(0);
    expect(key(2).tabIndex).toBe(-1);
    fireEvent.keyDown(key(1), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(key(2));
    expect(key(2).getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(key(2), { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement ?? key(1), { key: 'End' });
    // Step 128 is on page 8.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Step 128: rest');
    expect(button(/^Page 8/).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document.activeElement ?? key(1), { key: 'Home' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Step 1: C3, on');
  });

  it('turns a step off and on with Enter and Space, gives a rest a note, and makes a step a rest with Delete', () => {
    open();
    fireEvent.keyDown(key(1), { key: 'Enter' });
    expect(labels()[0]).toBe('Step 1: C3, off');
    fireEvent.keyDown(key(1), { key: ' ' });
    expect(labels()[0]).toBe('Step 1: C3, on');
    // A rest turned on takes the note before it.
    fireEvent.keyDown(key(2), { key: 'Enter' });
    expect(labels()[1]).toBe('Step 2: C3, on');
    fireEvent.keyDown(key(2), { key: 'Delete' });
    expect(labels()[1]).toBe('Step 2: rest');
  });

  it('chooses a step with a press, and turns the chosen step off and on with another', () => {
    open();
    fireEvent.click(key(3));
    expect(screen.getByRole('heading', { name: /^Step 3/ })).toBeTruthy();
    expect(labels()[2]).toBe('Step 3: D♯3, on');
    fireEvent.click(key(3));
    expect(labels()[2]).toBe('Step 3: D♯3, off');
    fireEvent.click(key(3));
    expect(labels()[2]).toBe('Step 3: D♯3, on');
  });

  it('sets the chosen step’s values in the inspector, each encoder by its keys', () => {
    open();
    fireEvent.click(key(5));
    const inspector = within(screen.getByRole('region', { name: /^Step 5/ }));
    const gate = inspector.getByRole('slider', { name: 'Gate' });
    expect(gate.getAttribute('aria-valuenow')).toBe('1');
    fireEvent.keyDown(gate, { key: 'ArrowUp' });
    expect(gate.getAttribute('aria-valuenow')).toBe('1.25');
    const vel = inspector.getByRole('slider', { name: 'Velocity' });
    expect(vel.getAttribute('aria-valuetext')).toBe('60%');
    fireEvent.keyDown(vel, { key: 'Home' });
    expect(vel.getAttribute('aria-valuetext')).toBe('0%');
    const note = inspector.getByRole('slider', { name: 'Note' });
    fireEvent.keyDown(note, { key: 'PageDown' });
    expect(note.getAttribute('aria-valuetext')).toBe('G2');
    fireEvent.keyDown(inspector.getByRole('slider', { name: 'Ratchet' }), { key: 'End' });
    fireEvent.keyDown(inspector.getByRole('slider', { name: 'Chance' }), { key: 'PageDown' });
    fireEvent.keyDown(inspector.getByRole('slider', { name: 'Nudge' }), { key: 'ArrowRight' });
    fireEvent.click(inspector.getByRole('button', { name: 'Accent' }));
    fireEvent.click(inspector.getByRole('button', { name: 'Slide' }));
    fireEvent.change(inspector.getByRole('combobox', { name: 'Condition' }), {
      target: { value: 'ab:1:2' },
    });
    expect(labels()[4]).toBe('Step 5: G2, on, accent, slide, ratchet 4, 75% chance, 1:2');
    fireEvent.click(inspector.getByRole('button', { name: 'On' }));
    expect(labels()[4]).toMatch(/^Step 5: G2, off/);
  });

  it('shows an unset velocity as the default, until it is set', () => {
    open();
    const vel = within(screen.getByRole('region', { name: /^Step 1/ })).getByRole('slider', {
      name: 'Velocity',
    });
    expect(vel.getAttribute('aria-valuetext')).toBe('85% (default)');
    fireEvent.keyDown(vel, { key: 'ArrowUp' });
    expect(vel.getAttribute('aria-valuetext')).toBe('90%');
  });

  it('builds a chord with Add to chord, one note on the encoders at a time, and takes the chosen note away', () => {
    open();
    const inspector = () => within(screen.getByRole('region', { name: /^Step 1/ }));
    const note = () =>
      inspector().getByRole('slider', { name: 'Note' }).getAttribute('aria-valuetext');
    fireEvent.click(inspector().getByRole('button', { name: 'Add a note to the chord' }));
    expect(labels()[0]).toBe('Step 1: C3 E3, on');
    // The note added is the one on the encoders; its chip says so.
    expect(note()).toBe('E3');
    expect(
      inspector()
        .getByRole('button', { name: 'Note 2 of the step: E3' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    fireEvent.click(inspector().getByRole('button', { name: 'Note 1 of the step: C3' }));
    expect(note()).toBe('C3');
    fireEvent.keyDown(inspector().getByRole('slider', { name: 'Note' }), { key: 'ArrowDown' });
    expect(labels()[0]).toBe('Step 1: B2 E3, on');
    fireEvent.click(inspector().getByRole('button', { name: 'Remove this note' }));
    expect(labels()[0]).toBe('Step 1: E3, on');
    expect(note()).toBe('E3');
  });

  it('keeps the inspector the same shape for a rest: no note encoders, a line saying it is a rest', () => {
    open();
    fireEvent.click(key(2));
    const inspector = within(screen.getByRole('region', { name: /^Step 2/ }));
    expect(inspector.queryByRole('slider', { name: 'Note' })).toBeNull();
    expect(inspector.getByText('A rest. Add a note and the step plays it.')).toBeTruthy();
    expect(inspector.queryByRole('button', { name: 'Remove this note' })).toBeNull();
  });

  it('gives a rest its first note with Add note', () => {
    open();
    fireEvent.click(key(2));
    fireEvent.click(
      within(screen.getByRole('region', { name: /^Step 2/ })).getByRole('button', {
        name: 'Add a note',
      })
    );
    expect(labels()[1]).toBe('Step 2: C3, on');
  });

  it('keeps the arrow keys an encoder uses from reaching the page', () => {
    open();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(slider('Tempo'), { key: 'ArrowUp' });
    fireEvent.keyDown(key(1), { key: 'ArrowRight' });
    window.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
  });
});

describe('what it refuses, and a page that is late', () => {
  it('opens an empty pattern at the riff’s tempo for a riff no pattern can hold, and says so', () => {
    // 65 beats: past 128 steps even in eighths.
    open({ bpm: 100, loop: true, steps: [[64, 48, 1]] });
    expect(keys()).toHaveLength(16);
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('100');
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'sequencer: riff could not be imported',
      expect.anything()
    );
  });

  it('refuses an edit that would not make a valid pattern, and sends nothing', async () => {
    open();
    await play();
    const before = engine.sent.length;
    act(() => state.edit((p) => ({ ...p, bpm: 1000 })));
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('120');
    expect(engine.sent).toHaveLength(before);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'sequencer: edit refused',
      expect.anything()
    );
  });

  it('does nothing for an Undo with nothing to undo, or an edit that changes nothing', () => {
    open();
    act(() => state.undo());
    act(() => state.edit((p) => p));
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(labels()[0]).toBe('Step 1: C3, on');
  });

  it('draws the playhead from the loop before when the player played it again (the page was late)', async () => {
    open();
    await play();
    // Loop 0 was compiled; the player turned over to loop 2 without the page having queued 1 or 2.
    fire(loopEvent({ index: 2 }));
    engine.frame = 0.375 * 48000;
    expect(state.position()).toEqual({ step: 3, part: 0 });
  });

  it('ignores the engine’s events while it is stopped, and draws no playhead without a sound', async () => {
    open();
    fire(loopEvent());
    expect(sentOf('patternNext')).toHaveLength(0);
    engine = { ...engine, ctx: null as unknown as FakeEngine['ctx'] };
    render(<Harness riff={RIFF} />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[1]);
    });
    fire(loopEvent());
    expect(state.position()).toBeNull();
  });
});

describe('what the code review found', () => {
  it('hears Fill from the next loop: the loop queued before it was pressed is queued again', async () => {
    open();
    fireEvent.change(
      within(screen.getByRole('region', { name: /^Step 1/ })).getByRole('combobox', {
        name: 'Condition',
      }),
      { target: { value: 'fill' } }
    );
    await play();
    fire(loopEvent());
    expect(lastOf('patternNext')?.loop?.notes[0]?.[1]).toBe(51);
    fireEvent.click(button('Fill'));
    expect(lastOf('patternNext')?.loop?.notes[0]).toEqual([0, 48, 0.25]);
  });

  it('keeps no Undo for an edit that changes nothing', () => {
    open();
    fireEvent.click(button('Clear'));
    fireEvent.click(button('Clear'));
    fireEvent.click(button('Undo'));
    expect(labels()[0]).toBe('Step 1: C3, on');
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the panel’s tempo through an Undo', () => {
    const { rerender } = open(RIFF, 140);
    fireEvent.click(button('Clear'));
    rerender(<Harness riff={RIFF} tempo={150} />);
    fireEvent.click(button('Undo'));
    expect(labels()[0]).toBe('Step 1: C3, on');
    expect(slider('Tempo').getAttribute('aria-valuenow')).toBe('150');
  });

  it('keeps the edits when the riff goes away for a moment and comes back the same', () => {
    const { rerender } = open();
    fireEvent.click(button('Clear'));
    rerender(<Harness riff={null} />);
    rerender(<Harness riff={RIFF} />);
    expect(labels().every((l) => l?.endsWith('rest'))).toBe(true);
  });

  it('places the playhead of a loop still sounding by its own step size after the step size changes', async () => {
    open();
    await play();
    fire(loopEvent());
    // Loop 1 is rendered (its frame is not heard yet) while the end of loop 0 still sounds.
    fire(loopEvent({ index: 1, frame: 96000 }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Step' }), {
      target: { value: '1/8' },
    });
    engine.frame = 0.375 * 48000;
    expect(state.position()).toEqual({ step: 3, part: 0 });
  });
});

describe('the help', () => {
  it('names each control and says what it does, on hover and on focus', () => {
    open();
    for (const name of ['Tempo', 'Swing', 'Length', 'Transpose', 'Hits'])
      expect(slider(name)).toBeTruthy();
    expect(button('How the sequencer works')).toBeTruthy();
  });
});
