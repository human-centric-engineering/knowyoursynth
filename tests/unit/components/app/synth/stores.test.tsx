// @vitest-environment happy-dom

/**
 * The synth page's external stores.
 *
 * @see components/app/synth/stores.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MAP_OFF, createStore, mapStore, useStore } from '@/components/app/synth/stores';
import type { Store } from '@/components/app/synth/stores';

describe('createStore', () => {
  it('replaces the state and tells every subscriber', () => {
    const store = createStore(1);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.set(2);

    expect(store.get()).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('maps the state through a function', () => {
    const store = createStore({ n: 1 });
    store.set((s) => ({ n: s.n + 4 }));
    expect(store.get()).toEqual({ n: 5 });
  });

  it('stays quiet when the state is the same object', () => {
    const store = createStore('x');
    const f = vi.fn();
    store.subscribe(f);
    store.set('x');
    store.set((s) => s);
    expect(f).not.toHaveBeenCalled();
  });

  it('stops telling a subscriber once it unsubscribes', () => {
    const store = createStore(0);
    const f = vi.fn();
    const off = store.subscribe(f);
    off();
    store.set(1);
    expect(f).not.toHaveBeenCalled();
  });
});

function Reader({ store, pick }: { store: Store<{ a: number; b: number }>; pick?: boolean }) {
  const whole = useStore(store);
  const a = useStore(store, (s) => s.a);
  return <p>{pick ? `a=${a}` : `a=${whole.a} b=${whole.b}`}</p>;
}

describe('useStore', () => {
  it('re-renders with the new state, whole or selected', () => {
    const store = createStore({ a: 1, b: 2 });
    render(
      <>
        <Reader store={store} />
        <Reader store={store} pick />
      </>
    );
    expect(screen.getByText('a=1 b=2')).toBeTruthy();

    act(() => store.set({ a: 7, b: 8 }));

    expect(screen.getByText('a=7 b=8')).toBeTruthy();
    expect(screen.getByText('a=7')).toBeTruthy();
  });

  it('renders on the server from the current state', () => {
    const store = createStore({ a: 3, b: 4 });
    expect(renderToString(<Reader store={store} />)).toContain('a=3 b=4');
  });
});

describe('mapStore', () => {
  it('starts off', () => {
    expect(mapStore.get()).toBe(MAP_OFF);
    expect(MAP_OFF).toEqual({
      status: 'off',
      progress: 0,
      state: null,
      heat: null,
      ranked: [],
      why: {},
    });
  });
});
