// @vitest-environment happy-dom

/**
 * What plays along with the sequencer (`f-step-sequencer` t-266, t-267): the count-in a start asks the player for, a
 * pattern opened while one plays starting again from its top, and the Metronome, Count-in and Drums controls with what
 * they send the player. The engine is a fake that records what it is sent; the pattern model is real.
 *
 * @see components/app/sequencer/use-backing.ts
 * @see components/app/sequencer/use-sequencer.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import {
  COUNT_IN_BEATS,
  useSequencer,
  type Sequencer as SeqState,
} from '@/components/app/sequencer/use-sequencer';
import { useBacking } from '@/components/app/sequencer/use-backing';
import { importPhrase } from '@/lib/app/sequencer/import';
import { DRUM_VOICES } from '@/lib/app/synths/audio/backing';
import type { Phrase } from '@/lib/app/synths/contract';
import type { SynthMessage } from '@/lib/app/synths/audio/dsp-core';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const RIFF: Phrase = { bpm: 120, loop: true, steps: [[0, 48, 0.25]] };

let sent: SynthMessage[];
const engine = {
  send: (m: SynthMessage) => void sent.push(m),
  frame: 0,
  ctx: { sampleRate: 48000 },
};
let state: SeqState;

function Harness({ riff = RIFF }: { riff?: Phrase }) {
  const seq = useSequencer({ engine, ensureAudio: async () => true, riff });
  const backing = useBacking(seq);
  state = seq;
  return (
    <Sequencer
      seq={seq}
      playing={seq.playing}
      onPlay={() => void seq.play()}
      onStop={seq.stop}
      transport
      backing={backing}
    />
  );
}

const sentOf = <T extends SynthMessage['type']>(type: T) =>
  sent.filter((m): m is Extract<SynthMessage, { type: T }> => m.type === type);
const lastOf = <T extends SynthMessage['type']>(type: T) => sentOf(type).at(-1);
const button = (name: string) => screen.getByRole('button', { name });
const play = async () => {
  await act(async () => {
    fireEvent.click(button('Play'));
  });
};
const pickDrums = (option: string | RegExp) => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Drums' }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};

beforeEach(() => {
  sent = [];
  window.localStorage.clear();
});

describe('count-in', () => {
  it('counts in a bar when Play starts the pattern, with nothing else playing along to begin with', async () => {
    render(<Harness />);
    await play();
    const start = lastOf('pattern');
    expect(start?.countIn).toBe(COUNT_IN_BEATS);
    expect(start?.backing).toBeUndefined();
  });

  it('plays straight away with Count-in off, and keeps that choice in this browser', async () => {
    const first = render(<Harness />);
    fireEvent.click(button('Count-in'));
    first.unmount();
    render(<Harness />);
    await play();
    expect(lastOf('pattern')?.countIn).toBeUndefined();
    expect(window.localStorage.getItem('kys.backing')).toContain('"countIn":false');
  });

  it('does not count in when asked not to (a lesson’s Replay)', async () => {
    render(<Harness />);
    await act(async () => {
      await state.play({ countIn: false });
    });
    expect(lastOf('pattern')?.countIn).toBeUndefined();
  });

  it('starts a pattern opened while one plays from its first step, counted in, as a new run', async () => {
    render(<Harness />);
    await play();
    const run = lastOf('pattern')?.run ?? 0;
    act(() => {
      state.load(
        { ...importPhrase({ bpm: 120, loop: true, steps: [[0, 36, 1]] }) },
        { id: null, name: 'Other', libraryId: 'lib-1', inspiredBy: 'House' }
      );
    });
    const restart = lastOf('pattern');
    expect(restart).toMatchObject({ run: run + 1, countIn: COUNT_IN_BEATS });
    expect(restart).not.toHaveProperty('index');
    expect(restart).not.toHaveProperty('beat');
    expect(restart?.loop.notes).toEqual([[0, 36, 1]]);
  });

  it('does not count in for another sound’s riff arriving while it plays', async () => {
    const { rerender } = render(<Harness />);
    await play();
    rerender(<Harness riff={{ bpm: 90, loop: true, steps: [[0, 40, 1]] }} />);
    const restart = lastOf('pattern');
    expect(restart?.loop.notes).toEqual([[0, 40, 1]]);
    expect(restart?.countIn).toBeUndefined();
  });
});

describe('metronome', () => {
  it('is off to begin with, and turned on while it plays is sent at once', async () => {
    render(<Harness />);
    expect(button('Metronome').getAttribute('aria-pressed')).toBe('false');
    await play();
    fireEvent.click(button('Metronome'));
    expect(lastOf('patternBacking')).toEqual({
      type: 'patternBacking',
      backing: { click: true, drums: null },
    });
  });

  it('goes with the next start, and sends nothing while stopped', async () => {
    render(<Harness />);
    fireEvent.click(button('Metronome'));
    expect(sentOf('patternBacking')).toEqual([]);
    await play();
    expect(lastOf('pattern')?.backing).toEqual({ click: true, drums: null });
  });
});

describe('drums', () => {
  it('are off to begin with; a beat chosen while it plays is sent, swung as the pattern is', async () => {
    render(<Harness />);
    await play();
    expect(screen.getByRole('combobox', { name: 'Drums' }).textContent).toContain('Off');
    pickDrums('Funk');
    const drums = lastOf('patternBacking')?.backing.drums;
    expect(drums?.swing).toBe(state.pattern.swing);
    const kick = DRUM_VOICES.indexOf('kick');
    expect(drums?.hits.filter(([, v]) => v === kick).map(([s]) => s)).toEqual([0, 3, 11, 14]);
  });

  it('matches the beat to what the pattern was inspired by, and follows another pattern opened', async () => {
    render(<Harness />);
    act(() => {
      state.load(importPhrase(RIFF), {
        id: null,
        name: 'Deep one',
        libraryId: 'lib-1',
        inspiredBy: 'Deep house',
      });
    });
    pickDrums(/^Match: Four on the floor/);
    await play();
    const kick = DRUM_VOICES.indexOf('kick');
    expect(
      lastOf('pattern')
        ?.backing?.drums?.hits.filter(([, v]) => v === kick)
        .map(([s]) => s)
    ).toEqual([0, 4, 8, 12]);
    act(() => {
      state.load(importPhrase(RIFF), {
        id: null,
        name: 'Rubber',
        libraryId: 'lib-2',
        inspiredBy: 'Dub',
      });
    });
    expect(screen.getByRole('combobox', { name: 'Drums' }).textContent).toContain(
      'Match: One drop'
    );
  });

  it('plays no beat for a style that has none, and says so', () => {
    render(<Harness />);
    act(() => {
      state.load(importPhrase(RIFF), {
        id: null,
        name: 'Haze',
        libraryId: 'lib-3',
        inspiredBy: 'Ambient',
      });
    });
    pickDrums('Match: none suits it');
    expect(screen.getByRole('combobox', { name: 'Drums' }).textContent).toContain(
      'Match: none suits it'
    );
  });
});
