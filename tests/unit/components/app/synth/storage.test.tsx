// @vitest-environment happy-dom

/**
 * What the synth page keeps in browser storage.
 *
 * @see components/app/synth/storage.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { z } from 'zod';
import {
  PanelViewSchema,
  SESSION_WRITE_DELAY_MS,
  STORAGE_KEYS,
  parseSession,
  readStored,
  sessionKey,
  storedSession,
  useStoredPref,
  useStoredSession,
  writeStored,
} from '@/components/app/synth/storage';
import type { Session } from '@/components/app/synth/storage';
import { getSynthDef } from '@/lib/app/synths/defs';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import type { SynthDef } from '@/lib/app/synths/contract';
import { logger } from '@/lib/logging';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const def: SynthDef = (() => {
  const d = getSynthDef('model-d');
  if (!d) throw new Error('model-d is not registered');
  return d;
})();

const fresh = (): Session => ({ presetId: null, step: null, values: { ...def.init }, cables: [] });

// A plain in-memory Storage whose methods are spies, swapped in for window.localStorage.
const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
let data: Map<string, string>;
let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  data = new Map();
  getItem = vi.fn((k: string) => data.get(k) ?? null);
  setItem = vi.fn((k: string, v: string) => void data.set(k, v));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem,
      setItem,
      removeItem: (k: string) => data.delete(k),
      clear: () => data.clear(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (realStorage) Object.defineProperty(window, 'localStorage', realStorage);
});

describe('sessionKey', () => {
  it('is per synth, under the prototype namespace', () => {
    expect(sessionKey('model-d')).toBe('kys.session.model-d');
    expect(STORAGE_KEYS.synth).toBe('kys.synth');
  });
});

describe('parseSession', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    presetId: 'bass',
    step: 2,
    values: {},
    cables: [],
    ...over,
  });

  it('keeps the preset and step, and fills every missing control from def.init', () => {
    const s = parseSession(def, stored());
    expect(s).toEqual({ presetId: 'bass', step: 2, values: def.init, cables: [] });
  });

  it('takes a stored value over the init', () => {
    const s = parseSession(def, stored({ values: { 'ctl.tune': 1.25 } }));
    expect(s?.values['ctl.tune']).toBe(1.25);
    expect(def.init['ctl.tune']).not.toBe(1.25);
  });

  it('drops controls the synth does not have', () => {
    const s = parseSession(def, stored({ values: { 'no.such.control': 5, 'ctl.tune': 1 } }));
    expect(s?.values).not.toHaveProperty('no.such.control');
    expect(s?.values['ctl.tune']).toBe(1);
  });

  it('clamps out-of-range values to the control range', () => {
    const s = parseSession(def, stored({ values: { 'ctl.tune': 99, 'ctl.glide': -4 } }));
    expect(s?.values['ctl.tune']).toBe(2.5);
    expect(s?.values['ctl.glide']).toBe(0);
  });

  it('drops an enum value that is not one of the options, keeping the init', () => {
    const s = parseSession(def, stored({ values: { 'mod.srcA': 'not-an-option' } }));
    expect(s?.values['mod.srcA']).toBe(def.init['mod.srcA']);
  });

  it('keeps cables from an output to an input, coloured by order and not as stored', () => {
    const s = parseSession(
      def,
      stored({
        cables: [
          ['j.lfoTri', 'j.oscCv'],
          ['j.lfoSq', 'j.cutCv'],
        ],
      })
    );
    expect(s?.cables).toEqual([
      { from: 'j.lfoTri', to: 'j.oscCv', color: CABLE_COLORS[0] },
      { from: 'j.lfoSq', to: 'j.cutCv', color: CABLE_COLORS[1] },
    ]);
  });

  it('reverses an in-to-out pair', () => {
    const s = parseSession(def, stored({ cables: [['j.oscCv', 'j.lfoTri']] }));
    expect(s?.cables).toEqual([{ from: 'j.lfoTri', to: 'j.oscCv', color: CABLE_COLORS[0] }]);
  });

  it('drops cables between things that are not a usable pair of jacks', () => {
    const s = parseSession(
      def,
      stored({
        cables: [
          ['j.main', 'j.phones'], // out to out
          ['j.oscCv', 'j.cutCv'], // in to in
          ['nope', 'j.oscCv'], // not a jack
          ['j.lfoTri'], // not a pair
          'j.lfoTri>j.oscCv', // not an array
          ['j.lfoTri', 'j.oscCv'], // the only good one
        ],
      })
    );
    expect(s?.cables).toEqual([{ from: 'j.lfoTri', to: 'j.oscCv', color: CABLE_COLORS[0] }]);
  });

  it('starts the colours again after the palette runs out', () => {
    const pair = ['j.lfoTri', 'j.oscCv'];
    const s = parseSession(
      def,
      stored({ cables: Array.from({ length: CABLE_COLORS.length + 1 }, () => pair) })
    );
    expect(s?.cables.at(-1)?.color).toBe(CABLE_COLORS[0]);
  });

  it('accepts a null preset and step', () => {
    expect(parseSession(def, stored({ presetId: null, step: null }))).toMatchObject({
      presetId: null,
      step: null,
    });
  });

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['an array', []],
    ['no preset', { step: null, values: {}, cables: [] }],
    ['a numeric preset', { presetId: 3, step: null, values: {}, cables: [] }],
    ['a negative step', { presetId: null, step: -1, values: {}, cables: [] }],
    ['a fractional step', { presetId: null, step: 1.5, values: {}, cables: [] }],
  ])('is null for malformed input: %s', (_name, raw) => {
    expect(parseSession(def, raw)).toBeNull();
  });

  it('survives values and cables of the wrong type', () => {
    const s = parseSession(def, stored({ values: 'oops', cables: 7 }));
    expect(s).toEqual({ presetId: 'bass', step: 2, values: def.init, cables: [] });
  });
});

describe('storedSession', () => {
  it('stores cables as [from, to] pairs, without colours', () => {
    const out = storedSession({
      ...fresh(),
      cables: [{ from: 'j.lfoTri', to: 'j.oscCv', color: '#123456' }],
    });
    expect(out).toMatchObject({ cables: [['j.lfoTri', 'j.oscCv']] });
    expect(JSON.stringify(out)).not.toContain('#123456');
  });

  it('round-trips through JSON and parseSession', () => {
    const session: Session = {
      presetId: 'lead',
      step: 3,
      values: { ...def.init, 'ctl.tune': -1.5, 'mod.srcA': 'eg' },
      cables: [
        { from: 'j.lfoTri', to: 'j.oscCv', color: CABLE_COLORS[0] },
        { from: 'j.lfoSq', to: 'j.cutCv', color: CABLE_COLORS[1] },
      ],
    };
    const roundTripped = parseSession(def, JSON.parse(JSON.stringify(storedSession(session))));
    expect(roundTripped).toEqual(session);
  });
});

describe('readStored / writeStored', () => {
  it('writes JSON and reads it back', () => {
    writeStored('k', { a: [1, 2] });
    expect(window.localStorage.getItem('k')).toBe('{"a":[1,2]}');
    expect(readStored('k')).toEqual({ a: [1, 2] });
  });

  it('reads null for a missing key', () => {
    expect(readStored('missing')).toBeNull();
  });

  it('reads null for stored text that is not JSON', () => {
    window.localStorage.setItem('k', '{not json');
    expect(readStored('k')).toBeNull();
  });

  it('reads null when storage throws', () => {
    getItem.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStored('k')).toBeNull();
  });

  it('logs and carries on when storage throws on write', () => {
    setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStored('k', 1)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not write'),
      expect.objectContaining({ key: 'k', err: expect.stringContaining('quota') })
    );
  });
});

describe('useStoredPref', () => {
  it('uses the fallback when nothing is stored', () => {
    const { result } = renderHook(() => useStoredPref('p', z.boolean(), true));
    expect(result.current[0]).toBe(true);
  });

  it('picks up a stored value after mount', () => {
    window.localStorage.setItem('p', 'false');
    const { result } = renderHook(() => useStoredPref('p', z.boolean(), true));
    expect(result.current[0]).toBe(false);
  });

  it('falls back on a stored value that fails the schema', () => {
    window.localStorage.setItem('p', '"yes"');
    const { result } = renderHook(() => useStoredPref('p', z.boolean(), true));
    expect(result.current[0]).toBe(true);
  });

  it('checks a structured value with its schema', () => {
    const fallback = { outline: false, long: false };
    window.localStorage.setItem('v', JSON.stringify({ outline: 'yes', long: true }));
    const { result } = renderHook(() => useStoredPref('v', PanelViewSchema, fallback));
    expect(result.current[0]).toBe(fallback);
  });

  it('updates and stores a new value', () => {
    const { result } = renderHook(() => useStoredPref('p', z.boolean(), true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('p')).toBe('false');
  });
});

describe('useStoredSession', () => {
  const writesTo = (key: string) => setItem.mock.calls.filter(([k]) => k === key);

  it('starts fresh when nothing is stored', () => {
    const { result } = renderHook(() => useStoredSession(def, fresh));
    expect(result.current[0]).toEqual(fresh());
  });

  it('restores a stored session after mount', () => {
    window.localStorage.setItem(
      sessionKey(def.id),
      JSON.stringify({
        presetId: 'bass',
        step: 1,
        values: { 'ctl.tune': 2 },
        cables: [['j.lfoTri', 'j.oscCv']],
      })
    );
    const { result } = renderHook(() => useStoredSession(def, fresh));
    expect(result.current[0]).toEqual({
      presetId: 'bass',
      step: 1,
      values: { ...def.init, 'ctl.tune': 2 },
      cables: [{ from: 'j.lfoTri', to: 'j.oscCv', color: CABLE_COLORS[0] }],
    });
  });

  it("keeps the stored panel through React's development remount, writing nothing back", () => {
    // StrictMode mounts, unmounts and mounts again: an unmount before the restore has re-rendered must not save the
    // fresh panel over the stored one.
    const stored = { presetId: 'bass', step: null, values: { 'ctl.tune': 2 }, cables: [] };
    window.localStorage.setItem(sessionKey(def.id), JSON.stringify(stored));
    setItem.mockClear();

    const { result } = renderHook(() => useStoredSession(def, fresh), { wrapper: StrictMode });

    expect(result.current[0]).toMatchObject({ presetId: 'bass', values: { 'ctl.tune': 2 } });
    expect(writesTo(sessionKey(def.id))).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(sessionKey(def.id)) ?? 'null')).toEqual(stored);
  });

  it('stays fresh when the stored session is unusable', () => {
    window.localStorage.setItem(sessionKey(def.id), '{"presetId":5}');
    const { result } = renderHook(() => useStoredSession(def, fresh));
    expect(result.current[0]).toEqual(fresh());
  });

  it('writes a change back only after the delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStoredSession(def, fresh));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    setItem.mockClear();

    act(() => result.current[1]((s) => ({ ...s, step: 4 })));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS - 1);
    });
    expect(writesTo(sessionKey(def.id))).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(writesTo(sessionKey(def.id))).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(sessionKey(def.id)) ?? 'null')).toMatchObject({
      step: 4,
    });
  });

  it('writes a change still inside the delay when the page goes, so a last move is kept', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useStoredSession(def, fresh));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    setItem.mockClear();

    act(() => result.current[1]((s) => ({ ...s, step: 7 })));
    unmount();

    const writes = writesTo(sessionKey(def.id));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]?.[1]))).toMatchObject({ step: 7 });
  });

  it('writes it when the tab is hidden for good (pagehide), and not twice', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStoredSession(def, fresh));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    setItem.mockClear();

    act(() => result.current[1]((s) => ({ ...s, step: 2 })));
    window.dispatchEvent(new Event('pagehide'));
    expect(writesTo(sessionKey(def.id))).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    // The delayed write still lands, with the same session; nothing is lost and nothing stale is written.
    expect(JSON.parse(window.localStorage.getItem(sessionKey(def.id)) ?? 'null')).toMatchObject({
      step: 2,
    });
  });

  it('writes nothing on unmount when everything is already saved', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useStoredSession(def, fresh));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    setItem.mockClear();
    unmount();
    expect(writesTo(sessionKey(def.id))).toHaveLength(0);
  });

  it('writes a burst of changes once, with the last one', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStoredSession(def, fresh));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    setItem.mockClear();

    for (const step of [1, 2, 3]) {
      act(() => result.current[1]((s) => ({ ...s, step })));
      act(() => {
        vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS - 100);
      });
    }
    expect(writesTo(sessionKey(def.id))).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    const writes = writesTo(sessionKey(def.id));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]?.[1]))).toMatchObject({ step: 3 });
  });

  it('keeps each synth in its own key', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStoredSession(def, fresh));
    act(() => result.current[1]((s) => ({ ...s, step: 9 })));
    act(() => {
      vi.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
    });
    expect(window.localStorage.getItem('kys.session.other')).toBeNull();
    expect(window.localStorage.getItem(sessionKey(def.id))).not.toBeNull();
  });
});
