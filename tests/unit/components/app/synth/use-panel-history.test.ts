// @vitest-environment happy-dom

/**
 * The panel's undo history as the page wires it (`usePanelHistory`): what is recorded, what starts it afresh, and an
 * undo or redo pressed, or a change made, while the one before is still being shown. The page's own tests drive the
 * buttons and the animation; these drive the hook over a plain session, each step finished by the next press.
 *
 * @see components/app/synth/use-panel-history.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
import {
  ARRIVE_MS,
  HISTORY_TURN_MS,
  MOVE_LIGHT_MS,
  usePanelHistory,
} from '@/components/app/synth/use-panel-history';
import { glideMotion } from '@/components/app/synth/motion';
import { defaultPatchState } from '@/lib/app/synths/default-patch';
import { stepMoves, type PanelSnap } from '@/lib/app/synths/lib/history';
import { highlightStore, moveStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { ControlValues, PatchCable } from '@/lib/app/synths/contract';

const modelD = getSynthDef('model-d');
if (!modelD) throw new Error('model-d is not registered');
const def = modelD;

interface Sess {
  values: ControlValues;
  cables: PatchCable[];
  presetId: string | null;
  soundId: string | null;
  step: number | null;
}

const at = (cutoff: number): ControlValues => ({ ...def.init, 'filter.cutoff': cutoff });
const START: Sess = { values: at(0), cables: [], presetId: null, soundId: null, step: null };

// The history groups by `performance.now()`: each change is set far enough apart to be its own, unless a test says.
let clock = 0;
beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

function setup() {
  const onTakeOver = vi.fn();
  const onLoad = vi.fn<(loading: boolean) => void>();
  const { result } = renderHook(() => {
    const [stored, setStored] = useState<Sess>(START);
    return { stored, setStored, ...usePanelHistory(stored, setStored, def, onTakeOver, onLoad) };
  });
  const cutoff = () => result.current.stored.values['filter.cutoff'];
  /** A change through `patch`, a while after the last. */
  const turn = (v: number, gap = 1000) => {
    clock += gap;
    act(() => result.current.patch((s) => ({ ...s, values: at(v) })));
  };
  /** Finishes the undo or redo being shown, as any change through `patch` does; this one changes nothing. */
  const settle = () => act(() => result.current.patch((s) => s));
  return { result, cutoff, turn, settle, onTakeOver, onLoad };
}

describe('usePanelHistory', () => {
  it('goes back from where an undo lands when Undo is pressed again while it is shown, and forward again the same way', () => {
    const { result, cutoff, turn, settle } = setup();
    turn(1);
    turn(2);
    turn(3);
    act(() => result.current.undo());
    // Pressed again before the first has moved the panel: it lands at 2, and this one goes on from there.
    act(() => result.current.undo());
    settle();
    expect(cutoff()).toBe(1);

    act(() => result.current.redo());
    act(() => result.current.redo());
    settle();
    expect(cutoff()).toBe(3);
    expect(result.current.canRedo).toBe(false);
  });

  it('records a change made while an undo is shown as made from where the undo lands', () => {
    const { result, cutoff, turn, settle } = setup();
    turn(1);
    turn(2);
    act(() => result.current.undo());
    turn(9);
    act(() => result.current.undo());
    settle();
    expect(cutoff()).toBe(1);
  });

  it('records nothing for a change or a new patch that changes nothing, nor for the session landing after it', () => {
    const { result } = setup();
    act(() => result.current.patch((s) => s));
    act(() => result.current.setStored((s) => ({ ...s, values: at(4) })));
    act(() => result.current.glide((s) => s));
    act(() => result.current.setStored((s) => ({ ...s, values: at(5) })));
    expect(result.current.canUndo).toBe(false);
  });

  it('records a change followed in the same moment by one that changes nothing', () => {
    const { result } = setup();
    clock += 1000;
    act(() => {
      result.current.patch((s) => ({ ...s, values: at(1) }));
      result.current.patch((s) => s);
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('keeps the history through a save, and starts it afresh for another patch', () => {
    const { result, turn } = setup();
    turn(1);
    act(() => result.current.patch((s) => ({ ...s, soundId: 'mine-1' })));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.glide((s) => ({ ...s, presetId: 'wobble', values: at(2) })));
    expect(result.current.canUndo).toBe(false);
  });

  it('starts afresh when a sound deleted takes its lesson step with it, though the panel stays', () => {
    const { result, turn } = setup();
    act(() => result.current.setStored((s) => ({ ...s, soundId: 'mine-1', step: 2 })));
    turn(1);
    act(() => result.current.patch((s) => ({ ...s, soundId: null, step: null })));
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps a new patch set apart from the moves just before and just after it', () => {
    const { result, cutoff, turn, settle } = setup();
    turn(1);
    clock += 100;
    act(() => result.current.glide((s) => ({ ...s, values: at(2) })));
    turn(3, 100);
    act(() => result.current.undo());
    settle();
    expect(cutoff()).toBe(2);
    act(() => result.current.undo());
    settle();
    expect(cutoff()).toBe(1);
  });

  it('tells the page an undo or a new patch is beginning, so what it has under way stops; not a change, nor a step to nowhere', () => {
    const { result, turn, onTakeOver } = setup();
    turn(1);
    act(() => result.current.redo());
    expect(onTakeOver).not.toHaveBeenCalled();
    act(() => result.current.undo());
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    act(() => result.current.glide((s) => ({ ...s, values: at(2) })));
    expect(onTakeOver).toHaveBeenCalledTimes(2);
  });

  it('leaves ⌘Z in the sequencer’s View all dialog to it, and takes it in a docked sheet', () => {
    const { result, turn } = setup();
    turn(1);
    const inside = (className: string) => {
      const box = document.createElement('div');
      box.setAttribute('role', 'dialog');
      box.className = className;
      const button = document.createElement('button');
      box.appendChild(button);
      document.body.appendChild(box);
      return button;
    };
    const lanes = inside('kys-seq-skin');
    fireEvent.keyDown(lanes, { key: 'z', metaKey: true });
    lanes.parentElement?.remove();
    expect(result.current.canUndo).toBe(true);
    const sheet = inside('kys-sheet');
    act(() => {
      fireEvent.keyDown(sheet, { key: 'z', metaKey: true });
    });
    sheet.parentElement?.remove();
    expect(result.current.canUndo).toBe(false);
  });
});

describe('usePanelHistory loads (f-default-patch t-172)', () => {
  const DEFAULT = defaultPatchState(def);
  const WOBBLE: Pick<Sess, 'values' | 'cables'> = {
    values: at(3),
    cables: [{ from: 'j.lfoTri', to: 'j.cutCv', color: '#e8b04a' }],
  };
  // Off for every other test (`tests/setup.ts`).
  beforeEach(() => vi.mocked(glideMotion).mockReturnValue(true));
  afterEach(() => vi.mocked(glideMotion).mockReturnValue(false));

  it('arrives loading, on the Default patch', () => {
    const { result, settle } = setup();
    expect(result.current.sess.values).toEqual(DEFAULT.values);
    expect(result.current.loading).toBe(true);
    settle();
    expect(result.current.loading).toBe(false);
    expect(result.current.sess.values).toEqual(START.values);
  });

  it('sets the Default patch at once, whatever was on the panel, and is loading until the new patch is set', () => {
    const { result, cutoff, turn, settle, onLoad } = setup();
    settle();
    turn(1);
    expect(result.current.sess.values['filter.cutoff']).toBe(1);
    onLoad.mockClear();

    act(() => result.current.glide((s) => ({ ...s, ...WOBBLE })));
    // The session holds the new patch; the panel shows the Default patch, cables and all, until the glide is done.
    expect(cutoff()).toBe(3);
    expect(result.current.sess.values).toEqual(DEFAULT.values);
    expect(result.current.sess.cables).toEqual(DEFAULT.cables);
    expect(result.current.loading).toBe(true);
    expect(result.current.isLoading()).toBe(true);
    expect(onLoad.mock.calls).toEqual([[true]]);

    // A change through `patch` finishes it at once, and so ends the load.
    settle();
    expect(result.current.sess.values['filter.cutoff']).toBe(3);
    expect(result.current.sess.cables).toEqual(WOBBLE.cables);
    expect(result.current.loading).toBe(false);
    expect(onLoad.mock.calls).toEqual([[true], [false]]);
  });

  it('starts again from the Default patch when another patch is loaded during a load', () => {
    const { result, settle } = setup();
    settle();
    act(() => result.current.glide((s) => ({ ...s, ...WOBBLE })));
    act(() => result.current.glide((s) => ({ ...s, values: at(7), cables: [] })));
    expect(result.current.sess.values).toEqual(DEFAULT.values);
    expect(result.current.loading).toBe(true);
  });

  it('waits out the arrival before setting a patch loaded while the synth arrives', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    try {
      const { result } = setup();
      // As `?sound=` does, on arrival.
      act(() => result.current.glide((s) => ({ ...s, ...WOBBLE })));
      act(() => {
        vi.advanceTimersByTime(ARRIVE_MS - 1);
      });
      expect(frames).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(frames).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends a load with Undo', () => {
    const { result, settle } = setup();
    settle();
    act(() => result.current.glide((s) => ({ ...s, ...WOBBLE })));
    act(() => result.current.undo());
    expect(result.current.loading).toBe(false);
  });

  it('is no load when the new patch changes nothing', () => {
    const { result, settle, onLoad } = setup();
    settle();
    onLoad.mockClear();
    act(() => result.current.glide((s) => s));
    expect(onLoad).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('with reduced motion, snaps to the new patch, the load beginning and ending in the same moment', () => {
    vi.mocked(glideMotion).mockReturnValue(false);
    const { result, onLoad } = setup();
    expect(result.current.loading).toBe(false);
    onLoad.mockClear();
    act(() => result.current.glide((s) => ({ ...s, ...WOBBLE })));
    expect(result.current.sess.values['filter.cutoff']).toBe(3);
    expect(result.current.loading).toBe(false);
    expect(onLoad.mock.calls).toEqual([[true], [false]]);
  });
});

describe('usePanelHistory showing a lesson step’s moves (f-step-moves t-178)', () => {
  // The step before, and the step: the cutoff opened, then the emphasis turned up, in the order the lesson numbers them.
  const FROM: PanelSnap = { values: at(0), cables: [] };
  const TO: PanelSnap = { values: { ...at(8), 'filter.emphasis': 7 }, cables: [] };
  const STEP = {
    title: 'Open the filter',
    module: 'filter' as const,
    why: '',
    set: { 'filter.cutoff': 8, 'filter.emphasis': 7 },
  };
  const MOVES = stepMoves(FROM, TO, STEP);
  const toStep = (s: Sess): Sess => ({ ...s, step: 1, values: TO.values, cables: TO.cables });
  const EMPHASIS = def.init['filter.emphasis'];
  // One move: lit, then turned, and a frame over to land.
  const ONE_MOVE = MOVE_LIGHT_MS + HISTORY_TURN_MS + 50;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      highlightStore.set([]);
      moveStore.set(null);
    });
  });
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  const shown = (r: ReturnType<typeof setup>['result']) => r.current.sess.values;

  it('holds the step from the first moment, and shows each move lit and then turned, one after the other', () => {
    const { result } = setup();
    const onEnd = vi.fn();
    let walked = false;
    act(() => {
      walked = result.current.walk(toStep, FROM, MOVES, onEnd);
    });
    expect(walked).toBe(true);
    // Saved, recorded and played from as the step at once; the panel shows the step before.
    expect(result.current.stored.step).toBe(1);
    expect(result.current.stored.values).toEqual(TO.values);
    expect(shown(result)['filter.cutoff']).toBe(0);

    advance(0);
    // Move 1 is lit before it turns.
    expect(moveStore.get()?.id).toBe('filter.cutoff');
    expect(highlightStore.get()).toEqual(['filter.cutoff']);
    advance(MOVE_LIGHT_MS - 1);
    expect(shown(result)['filter.cutoff']).toBe(0);

    advance(ONE_MOVE - MOVE_LIGHT_MS + 1);
    // Move 1 is in place; move 2 is lit and has not moved. Made together, the emphasis would be at 7 already.
    expect(shown(result)['filter.cutoff']).toBe(8);
    expect(shown(result)['filter.emphasis']).toBe(EMPHASIS);
    expect(moveStore.get()?.id).toBe('filter.emphasis');
    expect(highlightStore.get()).toEqual(['filter.emphasis']);
    expect(onEnd).not.toHaveBeenCalled();

    advance(ONE_MOVE);
    expect(shown(result)).toEqual(TO.values);
    expect(moveStore.get()).toBeNull();
    // What was lit before the moves began is put back.
    expect(highlightStore.get()).toEqual([]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('finishes at once on a change to the panel, or another walk, which starts again from its own step before', () => {
    const { result } = setup();
    const onEnd = vi.fn();
    act(() => void result.current.walk(toStep, FROM, MOVES, onEnd));
    advance(ONE_MOVE);
    act(() => result.current.patch((s) => s));
    expect(shown(result)).toEqual(TO.values);
    expect(moveStore.get()).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);

    act(() => void result.current.walk(toStep, FROM, MOVES, onEnd));
    advance(ONE_MOVE);
    expect(shown(result)['filter.cutoff']).toBe(8);
    // Replay pressed again: back to the step before, move 1 to come.
    act(() => void result.current.walk(toStep, FROM, MOVES, onEnd));
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(shown(result)['filter.cutoff']).toBe(0);
    advance(0);
    expect(moveStore.get()?.id).toBe('filter.cutoff');
  });

  it('finishes at once on Undo, and when a session lands from elsewhere', () => {
    const { result, turn } = setup();
    turn(3);
    // Replay on the step the panel is at puts back what was changed on it, which Undo can take back.
    act(() => void result.current.walk((s) => ({ ...s, values: TO.values }), FROM, MOVES));
    advance(0);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(moveStore.get()).toBeNull();

    act(() => void result.current.walk(toStep, FROM, MOVES));
    advance(0);
    act(() => result.current.setStored((s) => ({ ...s, values: at(4) })));
    expect(moveStore.get()).toBeNull();
    expect(shown(result)['filter.cutoff']).toBe(4);
  });

  it('sets the step at once with reduced motion, or with no moves to show', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );
    const { result } = setup();
    const onEnd = vi.fn();
    let walked = true;
    act(() => {
      walked = result.current.walk(toStep, FROM, MOVES, onEnd);
    });
    expect(walked).toBe(false);
    expect(shown(result)).toEqual(TO.values);
    expect(moveStore.get()).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    const other = setup();
    act(() => {
      walked = other.result.current.walk(toStep, FROM, [], onEnd);
    });
    expect(walked).toBe(false);
    expect(other.result.current.sess.values).toEqual(TO.values);
  });
});
