// @vitest-environment happy-dom

/**
 * The sound map's words on Model D: the legend under the panel, the "why is it dark?" question put to the mapper,
 * the mod wheel's cue, and the line in the cards. The map is written into the store directly, as the mapper would.
 *
 * @see components/app/synth/sound-map.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MapLegend, MapNote, WhyAsker, useWheelWanted } from '@/components/app/synth/sound-map';
import { MAP_OFF, findStore, focusStore, mapStore } from '@/components/app/synth/stores';
import type { Door, MapCellState, SoundMap } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { controlMap, displayName } from '@/lib/app/synths/lib/patch';
import { WHEEL } from '@/lib/app/synths/lib/soundmap';
import type { Mapper } from '@/lib/app/synths/lib/soundmap';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;
const cm = controlMap(def);
const name = (id: string) => {
  const c = cm[id];
  if (!c) throw new Error(`no control ${id}`);
  return displayName(def, c);
};

const CUTOFF = 'filter.cutoff';
const EMPHASIS = 'filter.emphasis';
const GLIDE = 'ctl.glide';
const OSC2 = 'mix.osc2';

for (const id of [CUTOFF, EMPHASIS, GLIDE, OSC2])
  if (!cm[id]) throw new Error(`Model D has no ${id}; the fixtures below need updating`);

const ready = (over: Partial<SoundMap> = {}): SoundMap => ({
  status: 'ready',
  progress: 1,
  key: 'model-d/x/null',
  state: {
    [CUTOFF]: 'on',
    [EMPHASIS]: 'on',
    [GLIDE]: 'dead',
    [OSC2]: 'zero',
  } satisfies Record<string, MapCellState>,
  heat: { [CUTOFF]: 1, [EMPHASIS]: 0.3 },
  ranked: [CUTOFF, EMPHASIS],
  why: {},
  ...over,
});

const pointAt = (id: string) =>
  act(() => focusStore.set({ kind: 'control', id, x: 0, y: 0, tip: false }));

afterEach(() => {
  act(() => {
    mapStore.set(MAP_OFF);
    focusStore.set(null);
    findStore.set(null);
  });
});

const legend = (over: Partial<Parameters<typeof MapLegend>[0]> = {}) => (
  <MapLegend def={def} values={def.init} dimOn heatOn outline={false} {...over} />
);

describe('MapLegend', () => {
  it('shows nothing while the map is off', () => {
    const { container } = render(legend());
    expect(container.textContent).toBe('');
  });

  it('counts progress while the first map is worked out', () => {
    act(() => mapStore.set({ ...MAP_OFF, status: 'working', progress: 0.42 }));
    render(legend());
    expect(screen.getByRole('status').textContent).toBe('Working out what is in this patch… 42%');
  });

  it('says the map could not be worked out, with no key and no progress', () => {
    act(() => mapStore.set({ ...MAP_OFF, status: 'failed', key: 'model-d/x/null' }));
    render(legend());
    expect(screen.getByRole('status').textContent).toBe(
      'Could not work out what is in this patch. Changing the patch tries again.'
    );
    expect(screen.queryByText(/Working out/)).toBeNull();
    expect(screen.queryByText('Bright:')).toBeNull();
    expect(screen.queryByText(/Why is it dark/)).toBeNull();
  });

  it('says it could not work out what brings in the dark control being pointed at, not that nothing does', () => {
    act(() => mapStore.set(ready({ why: { [GLIDE]: 'failed' } })));
    render(legend());
    pointAt(GLIDE);
    const line = screen.getByText(`${name(GLIDE)} is dark.`).parentElement;
    expect(line?.textContent).toContain('Could not work out what would bring it in.');
    expect(line?.textContent).not.toContain('No one or two controls');
    expect(line?.textContent).not.toContain('ringed');
  });

  it('keys the dimming, and names it for the hardware or the paper outline', () => {
    act(() => mapStore.set(ready()));
    const { rerender } = render(legend());
    expect(screen.getByText('Bright:')).toBeTruthy();
    expect(screen.getByText('Dark:')).toBeTruthy();
    rerender(legend({ outline: true }));
    expect(screen.getByText('Full ink:')).toBeTruthy();
    expect(screen.getByText('Faded:')).toBeTruthy();
  });

  it('numbers the most sensitive controls, and each finds its control on the panel', () => {
    act(() => mapStore.set(ready()));
    render(legend({ dimOn: false }));
    expect(screen.queryByText('Bright:')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `2 ${name(EMPHASIS)}` }));
    expect(findStore.get()).toEqual({ kind: 'control', id: EMPHASIS });
  });

  it('says so when no control changes the sound much', () => {
    act(() => mapStore.set(ready({ ranked: [] })));
    render(legend({ dimOn: false }));
    expect(screen.getByText('No control changes this patch much with a small move.')).toBeTruthy();
  });

  it('keeps the old map up, marked as updating, while a new one is worked out', () => {
    act(() => mapStore.set(ready({ status: 'working' })));
    render(legend());
    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(screen.getByText('Bright:')).toBeTruthy();
  });

  it('does not say a door is ringed on the panel when the only way in is the mod wheel', () => {
    act(() => mapStore.set(ready({ why: { [GLIDE]: [[{ id: WHEEL }]] } })));
    render(legend());
    pointAt(GLIDE);
    const line = screen.getByText(`${name(GLIDE)} is dark.`).parentElement;
    expect(line?.textContent).toContain('push the mod wheel up.');
    expect(line?.textContent).not.toContain('ringed');
  });

  it('says what would bring the dark control being pointed at into the sound', () => {
    const ways: Door[][] = [[{ id: CUTOFF, v: 10 }], [{ id: WHEEL }]];
    act(() => mapStore.set(ready({ why: { [GLIDE]: ways } })));
    render(legend());
    expect(screen.getByText(/Why is it dark\?/)).toBeTruthy();
    pointAt(GLIDE);
    const line = screen.getByText(`${name(GLIDE)} is dark.`).parentElement;
    expect(line?.textContent).toContain('It comes in if you turn');
    expect(line?.textContent).toContain('up.');
    expect(line?.textContent).toContain('Or push the mod wheel up.');
    expect(line?.textContent).toContain('They are ringed on the panel.');
    fireEvent.click(screen.getByRole('button', { name: name(CUTOFF) }));
    expect(findStore.get()).toEqual({ kind: 'control', id: CUTOFF });
  });
});

describe('WhyAsker', () => {
  const fakeMapper = () => {
    const explain = vi.fn<Mapper['explain']>(() => true);
    const mapper: Mapper = { analyse: vi.fn(), explain, cancel: vi.fn(), dispose: vi.fn() };
    return { mapper, explain, ref: { current: mapper } };
  };

  it('asks the mapper once why a dark control is dark, and files the answer under the same map', () => {
    const { explain, ref } = fakeMapper();
    act(() => mapStore.set(ready()));
    render(<WhyAsker mapperRef={ref} />);
    pointAt(CUTOFF); // on: nothing to ask
    expect(explain).not.toHaveBeenCalled();
    pointAt(GLIDE);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explain.mock.calls[0][0]).toBe(GLIDE);
    const ways = [[{ id: CUTOFF, v: 10 }]];
    act(() => explain.mock.calls[0][1](GLIDE, ways));
    expect(mapStore.get().why[GLIDE]).toEqual(ways);
    // Answered: pointing again asks nothing more.
    pointAt(CUTOFF);
    pointAt(GLIDE);
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it('files a failed explanation as failed, and asks again the next time the control is pointed at', () => {
    const { explain, ref } = fakeMapper();
    act(() => mapStore.set(ready()));
    render(<WhyAsker mapperRef={ref} />);
    pointAt(GLIDE);
    expect(explain).toHaveBeenCalledTimes(1);
    act(() => explain.mock.calls[0][2](GLIDE, new Error('door render blew up')));
    expect(mapStore.get().why[GLIDE]).toBe('failed');
    // Still pointed at: no retry loop.
    expect(explain).toHaveBeenCalledTimes(1);
    // Pointed at again, within the same map: asked again, and back to "Looking for…" meanwhile.
    pointAt(CUTOFF);
    pointAt(GLIDE);
    expect(explain).toHaveBeenCalledTimes(2);
    expect(GLIDE in mapStore.get().why).toBe(false);
    const ways = [[{ id: CUTOFF, v: 10 }]];
    act(() => explain.mock.calls[1][1](GLIDE, ways));
    expect(mapStore.get().why[GLIDE]).toEqual(ways);
  });

  it('leaves a failed answer in place when the mapper does not take the question up again', () => {
    const { explain, ref } = fakeMapper();
    act(() => mapStore.set(ready({ why: { [GLIDE]: 'failed' } })));
    explain.mockReturnValue(false); // the mapper has nothing to ask, e.g. its session is out of step with the store
    render(<WhyAsker mapperRef={ref} />);
    pointAt(GLIDE);
    expect(explain).toHaveBeenCalledTimes(1);
    // Not "Looking for…" with nothing looking.
    expect(mapStore.get().why[GLIDE]).toBe('failed');
  });

  it('drops an answer that arrives after the sound has changed', () => {
    const { explain, ref } = fakeMapper();
    act(() => mapStore.set(ready()));
    render(<WhyAsker mapperRef={ref} />);
    pointAt(GLIDE);
    act(() => mapStore.set(ready({ key: 'model-d/other/null' })));
    act(() => explain.mock.calls[0][1](GLIDE, [[{ id: CUTOFF, v: 10 }]]));
    expect(mapStore.get().why[GLIDE]).toBeUndefined();
  });

  it('asks nothing while the map is still being worked out', () => {
    const { explain, ref } = fakeMapper();
    act(() => mapStore.set(ready({ status: 'working' })));
    render(<WhyAsker mapperRef={ref} />);
    pointAt(GLIDE);
    expect(explain).not.toHaveBeenCalled();
  });
});

describe('useWheelWanted', () => {
  it('is true only while the dark control pointed at would come in with the mod wheel', () => {
    act(() =>
      mapStore.set(
        ready({
          state: { ...ready().state, [EMPHASIS]: 'dead' },
          why: { [GLIDE]: [[{ id: WHEEL }]], [OSC2]: [], [EMPHASIS]: 'failed' },
        })
      )
    );
    const { result } = renderHook(() => useWheelWanted());
    expect(result.current).toBe(false);
    pointAt(GLIDE);
    expect(result.current).toBe(true);
    pointAt(CUTOFF);
    expect(result.current).toBe(false);
    pointAt(EMPHASIS); // dark, but what brings it in could not be worked out
    expect(result.current).toBe(false);
  });
});

describe('MapNote', () => {
  const note = (id: string, link = false) => {
    const c = cm[id];
    if (!c) throw new Error(`no control ${id}`);
    return <MapNote def={def} c={c} values={def.init} link={link} />;
  };

  it('says nothing while the map is off', () => {
    const { container } = render(note(CUTOFF));
    expect(container.textContent).toBe('');
  });

  it('says a control is shaping the sound, and how much a small move does', () => {
    act(() => mapStore.set(ready()));
    const { container } = render(note(CUTOFF));
    expect(container.textContent).toBe(
      'Sound map: Shaping the sound. Effect of a small move: very high.'
    );
  });

  it('says a level at zero adds nothing yet', () => {
    act(() => mapStore.set(ready()));
    const { container } = render(note(OSC2));
    expect(container.textContent).toMatch(
      /so it adds nothing yet\. Moving it brings something new/
    );
  });

  it('says a dark control does nothing, and what would bring it in, once that is known', () => {
    act(() => mapStore.set(ready()));
    const { container } = render(note(GLIDE));
    expect(container.textContent).toContain('Does nothing at the moment');
    expect(container.textContent).toContain('Looking for what would bring it in…');
    act(() => mapStore.set((m) => ({ ...m, why: { [GLIDE]: [] } })));
    expect(container.textContent).toContain('No one or two controls bring it in.');
  });

  it('says a dark control could not be explained when the search failed, rather than that nothing brings it in', () => {
    act(() => mapStore.set(ready({ why: { [GLIDE]: 'failed' } })));
    const { container } = render(note(GLIDE));
    expect(container.textContent).toContain('Does nothing at the moment');
    expect(container.textContent).toContain('Could not work out what would bring it in.');
    expect(container.textContent).not.toContain('No one or two controls');
  });
});
