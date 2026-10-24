// @vitest-environment happy-dom

/**
 * The panel's undo history as the page wires it (`usePanelHistory`): what is recorded, what starts it afresh, and an
 * undo or redo pressed, or a change made, while the one before is still being shown. The page's own tests drive the
 * buttons and the animation; these drive the hook over a plain session, each step finished by the next press.
 *
 * @see components/app/synth/use-panel-history.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { usePanelHistory } from '@/components/app/synth/use-panel-history';
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
  const onStep = vi.fn();
  const { result } = renderHook(() => {
    const [stored, setStored] = useState<Sess>(START);
    return { stored, setStored, ...usePanelHistory(stored, setStored, def, onStep) };
  });
  const cutoff = () => result.current.stored.values['filter.cutoff'];
  /** A change through `patch`, a while after the last. */
  const turn = (v: number, gap = 1000) => {
    clock += gap;
    act(() => result.current.patch((s) => ({ ...s, values: at(v) })));
  };
  /** Finishes the undo or redo being shown, as any change through `patch` does; this one changes nothing. */
  const settle = () => act(() => result.current.patch((s) => s));
  return { result, cutoff, turn, settle, onStep };
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

  it('records nothing for a change that changes nothing, nor for the session landing after it', () => {
    const { result } = setup();
    act(() => result.current.patch((s) => s));
    act(() => result.current.setStored((s) => ({ ...s, values: at(4) })));
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps the history through a save, and starts it afresh for another patch', () => {
    const { result, turn } = setup();
    turn(1);
    act(() => result.current.patch((s) => ({ ...s, soundId: 'mine-1' })));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.glide((s) => ({ ...s, presetId: 'wobble', values: at(2) })));
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

  it('tells the page an undo is beginning, so what it has under way stops', () => {
    const { result, turn, onStep } = setup();
    turn(1);
    act(() => result.current.undo());
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('leaves ⌘Z in a dialog to the dialog, and takes it on the page', () => {
    const { result, turn } = setup();
    turn(1);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    fireEvent.keyDown(inside, { key: 'z', metaKey: true });
    dialog.remove();
    expect(result.current.canUndo).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
    });
    expect(result.current.canUndo).toBe(false);
  });
});
