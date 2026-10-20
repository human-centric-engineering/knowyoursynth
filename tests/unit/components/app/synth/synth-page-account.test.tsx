// @vitest-environment happy-dom

/**
 * The synth page keeping a signed-in user's settings and last panel in their account (`f-my-sounds` s3). The panel,
 * library and storage hooks are real; the router, the audio engine, the session and the API client are fakes, and the
 * API answers from two small in-memory records.
 *
 * Pins:
 * - signed out, the page never calls the account and works from browser storage alone;
 * - signed in, the newer of the account's last panel and the browser's wins, and the account's settings beat the
 *   browser's; a restored panel is written to the browser too;
 * - where the account has nothing yet, the browser's fills it, once; a change made before the account answered wins,
 *   including one made before the session said who is signed in;
 * - a panel or settings another user left in the browser are never sent to this one's account, nor shown as theirs;
 *   and when one user gives way to another without a reload, the next one's are read and nothing waiting goes to them;
 * - the two copies are weighed on the server's clock, however far the device's is off;
 * - the account is written after the panel goes still, never at the browser's pace: continuous play stays well under
 *   the section's 100 a minute, and leaving the page sends what is waiting with `keepalive`.
 *
 * @see components/app/synth/account-storage.ts
 * @see components/app/synth/settings.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import {
  ACCOUNT_WRITE_DELAY_MS,
  ACCOUNT_WRITE_MAX_WAIT_MS,
} from '@/components/app/synth/account-storage';
import { readStored } from '@/components/app/synth/storage';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { AccountSettings, PanelPref } from '@/lib/app/sounds/preference-data';

const { router, engine, auth, api } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
  },
  auth: { signedIn: false, pending: false, userId: 'user-1' },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: auth.signedIn ? { user: { id: auth.userId }, session: { id: 's-1' } } : null,
    isPending: auth.pending,
  }),
}));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...real, apiClient: api };
});

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

// ── fixtures ────────────────────────────────────────────────────────────────

const FAT_BASS: CatalogueSound = {
  id: 'fat-bass',
  name: 'Fat bass',
  ref: 'In the style of nobody',
  artist: 'Nobody',
  tags: ['bass'],
  level: 1,
  blurb: 'A test sound.',
  how: 'Because.',
  phrase: { bpm: 100, loop: false, steps: [[0, 36, 1]] },
  steps: [],
  context: {},
  tweaks: [],
  version: def.version,
};

const MODEL_D_SYNTH: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'Three oscillators.',
  design: 'neutral',
  definitionVersion: def.version,
  soundCount: 1,
};

const detail: SynthDetail = {
  synth: MODEL_D_SYNTH,
  sounds: [FAT_BASS],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
};

const SESSION_KEY = 'kys.session.model-d';
const PANEL_PATH = '/api/v1/me/panels/model-d';
const SETTINGS_PATH = '/api/v1/me/settings';

/** The account's settings as kept; the route adds the server's time as it answers ({@link served}). */
type KeptSettings = Omit<AccountSettings, 'now'>;

const NO_SETTINGS: KeptSettings = {
  tips: null,
  dim: null,
  heat: null,
  harm: null,
  fx: null,
  updatedAt: null,
};
const KEPT_AT = '2026-10-16T08:00:00.000Z';

/** What the account holds, as the API serves it. `null` panel: none kept on Model D yet. */
let account: { settings: KeptSettings; panel: PanelPref | null };

/** How far the server's clock is ahead of the page's (ms). */
let serverAhead = 0;
const serverNow = () => new Date(Date.now() + serverAhead).toISOString();

/** What each route answers with: what is kept, and the server's time. */
const served = {
  settings: (s: KeptSettings): AccountSettings => ({ ...s, now: serverNow() }),
  panel: (panel: PanelPref | null) => ({ panel, now: serverNow() }),
};

const accountPanel = (cutoff: number): PanelPref => ({
  synthId: 'model-d',
  presetId: 'fat-bass',
  step: null,
  soundId: null,
  values: { ...def.init, 'filter.cutoff': cutoff },
  cables: [],
  updatedAt: '2026-10-16T08:00:00.000Z',
});

function storeLocal(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

const synthPage = () => <SynthPage detail={detail} synths={[MODEL_D_SYNTH]} viewParam={null} />;
const page = () => render(synthPage());

/** A panel as the browser keeps it, changed at `savedAt` while `owner` was signed in. */
const browserPanel = (cutoff: number, savedAt?: string, owner?: string | null) => ({
  presetId: 'fat-bass',
  step: null,
  values: { 'filter.cutoff': cutoff },
  cables: [],
  ...(savedAt !== undefined && { savedAt: Date.parse(savedAt) }),
  ...(owner !== undefined && { owner }),
});

const cutoffSlider = () => screen.getAllByRole('slider', { name: /CUTOFF/ })[0];
const cutoff = () => cutoffSlider().getAttribute('aria-valuenow');
const pressed = (label: string | RegExp) =>
  screen.getByRole('button', { name: label }).getAttribute('aria-pressed');

const accountGets = () =>
  api.get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith('/api/v1/me/'));
const panelPuts = () => api.put.mock.calls.filter((c) => c[0] === PANEL_PATH);
const settingsPatches = () => api.patch.mock.calls.filter((c) => c[0] === SETTINGS_PATH);

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/synths/model-d');
  auth.signedIn = false;
  auth.pending = false;
  auth.userId = 'user-1';
  serverAhead = 0;
  for (const f of Object.values(api)) f.mockReset();
  account = { settings: { ...NO_SETTINGS }, panel: null };
  api.get.mockImplementation(async (path: string) => {
    if (path === SETTINGS_PATH) return served.settings(account.settings);
    if (path === PANEL_PATH) return served.panel(account.panel);
    if (path === '/api/v1/sounds') return [];
    throw new Error(`unexpected GET ${path}`);
  });
  api.put.mockResolvedValue(null);
  api.patch.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── signed out ──────────────────────────────────────────────────────────────

describe('signed out', () => {
  it('never calls the account, and works from browser storage as before', async () => {
    storeLocal('kys.dim', true);
    storeLocal(SESSION_KEY, {
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': 3 },
      cables: [],
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { unmount } = page();
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(cutoff()).toBe('3');
    expect(pressed('Dim unused parts')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Dim unused parts' }));
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    const moved = Number(cutoff());
    window.dispatchEvent(new Event('pagehide'));
    unmount();

    expect(readStored('kys.dim')).toBe(false);
    expect(readStored(SESSION_KEY)).toMatchObject({
      values: expect.objectContaining({ 'filter.cutoff': moved }),
    });
    expect(moved).not.toBe(3);
    expect(accountGets()).toEqual([]);
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

// ── signed in: reading ──────────────────────────────────────────────────────

describe('signed in, opening a synth', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it("restores the account's last panel over the browser's", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    storeLocal(SESSION_KEY, {
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': 3 },
      cables: [],
    });
    account.panel = accountPanel(-4);
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe('-4');
    // Restoring is not a change: nothing is written back.
    expect(api.put).not.toHaveBeenCalled();
    // The browser keeps it too, stamped with the account's time, so signed out the page reopens it.
    expect(readStored(SESSION_KEY)).toMatchObject({
      values: expect.objectContaining({ 'filter.cutoff': -4 }),
      savedAt: Date.parse(accountPanel(-4).updatedAt),
      owner: 'user-1',
    });
  });

  it("keeps the browser's panel when it is newer than the account's, and sends it", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Changed an hour after the account's was kept: signed out since, or a last request that did not land.
    storeLocal(SESSION_KEY, browserPanel(3, '2026-10-16T09:00:00.000Z', null));
    account.panel = accountPanel(-4);
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe('3');

    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({
      body: { panel: { values: expect.objectContaining({ 'filter.cutoff': 3 }) } },
    });
  });

  it.each([
    ['restores the account’s, however new the other is', accountPanel(-4), '-4'],
    ['sends nothing when the account has none', null, '3'],
  ])('with a panel another user left in the browser, %s', async (_, kept, shown) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    storeLocal(SESSION_KEY, browserPanel(3, '2026-10-16T09:00:00.000Z', 'user-2'));
    account.panel = kept;
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe(shown);
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("writes the account's settings to the browser, stamped with the account's time", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    account.settings = { ...NO_SETTINGS, dim: true, updatedAt: KEPT_AT };
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(pressed('Dim unused parts')).toBe('true');
    expect(readStored('kys.dim')).toBe(true);
    expect(readStored('kys.settingsAt')).toBe(Date.parse(KEPT_AT));
    expect(readStored('kys.settingsBy')).toBe('user-1');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps settings changed in the browser after the account’s were kept, and sends them', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // A change an hour later whose request did not land.
    storeLocal('kys.harm', true);
    storeLocal('kys.settingsAt', Date.parse('2026-10-16T09:00:00.000Z'));
    storeLocal('kys.settingsBy', 'user-1');
    account.settings = { ...NO_SETTINGS, harm: false, updatedAt: KEPT_AT };
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(pressed('Show harmonics')).toBe('true');
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { harm: true }, options: undefined }],
    ]);
  });

  it('does not fill the account from settings another user changed last', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    storeLocal('kys.heat', true);
    storeLocal('kys.settingsBy', 'user-2');
    page();
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps and sends what was changed while the session was still loading', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    auth.signedIn = false;
    auth.pending = true;
    account.panel = accountPanel(-4);
    account.settings = { ...NO_SETTINGS, harm: false };
    const { rerender } = page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Show harmonics' }));
    const moved = cutoff();

    auth.signedIn = true;
    auth.pending = false;
    rerender(synthPage());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe(moved);
    expect(pressed('Show harmonics')).toBe('true');

    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({
      body: { panel: { values: expect.objectContaining({ 'filter.cutoff': Number(moved) }) } },
    });
    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { harm: true }, options: undefined }],
    ]);
  });

  it("loads the settings from the account, and the account's value beats the browser's", async () => {
    storeLocal('kys.dim', true);
    account.settings = { ...NO_SETTINGS, dim: false, harm: true, tips: false };
    page();
    await waitFor(() => expect(pressed('Show harmonics')).toBe('true'));
    expect(pressed('Dim unused parts')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Panel settings' }));
    const cards = within(screen.getByRole('group', { name: 'Hover cards' }));
    expect(cards.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true');
  });

  it("fills what the account has no value for from the browser's, once", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    storeLocal('kys.heat', true);
    storeLocal(SESSION_KEY, {
      presetId: 'fat-bass',
      step: null,
      values: { 'filter.cutoff': 3 },
      cables: [],
    });
    account.settings = { ...NO_SETTINGS, dim: true };
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(api.patch).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));

    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { heat: true }, options: undefined }],
    ]);
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({
      body: {
        presetId: 'fat-bass',
        panel: { values: expect.objectContaining({ 'filter.cutoff': 3 }) },
      },
    });
    expect(pressed('Show sensitive controls')).toBe('true');
    expect(pressed('Dim unused parts')).toBe('true');

    // Once: nothing more goes while nothing changes.
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(settingsPatches()).toHaveLength(1);
    expect(panelPuts()).toHaveLength(1);
  });

  it('keeps a change made before the account answered, over what it says', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let answer: (s: KeptSettings) => void = () => undefined;
    api.get.mockImplementation(async (path: string) => {
      if (path === SETTINGS_PATH)
        return new Promise((r) => {
          answer = (kept) => r(served.settings(kept));
        });
      if (path === PANEL_PATH) return served.panel(null);
      return [];
    });
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole('button', { name: 'Show harmonics' }));
    await act(async () => answer({ ...NO_SETTINGS, harm: false }));
    expect(pressed('Show harmonics')).toBe('true');

    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { harm: true }, options: undefined }],
    ]);
  });

  it('does not restore over a panel moved before the account answered, and keeps the moved one', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let answer: (p: PanelPref) => void = () => undefined;
    api.get.mockImplementation(async (path: string) => {
      if (path === PANEL_PATH)
        return new Promise((r) => {
          answer = (p) => r(served.panel(p));
        });
      if (path === SETTINGS_PATH) return served.settings(NO_SETTINGS);
      return [];
    });
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    const moved = cutoff();
    await act(async () => answer(accountPanel(-4)));
    expect(cutoff()).toBe(moved);

    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({
      body: { panel: { values: expect.objectContaining({ 'filter.cutoff': Number(moved) }) } },
    });
  });

  it('sends nothing to an account it could not read', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    api.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/me/')) throw new Error('offline');
      return [];
    });
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Dim unused parts' }));
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    // The browser still has both.
    expect(readStored('kys.dim')).toBe(true);
  });
});

// ── signed in: writing ──────────────────────────────────────────────────────

describe('signed in, writing to the account', () => {
  beforeEach(async () => {
    auth.signedIn = true;
    account.panel = accountPanel(0);
    account.settings = {
      tips: true,
      dim: false,
      heat: false,
      harm: false,
      fx: null,
      updatedAt: KEPT_AT,
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe('0');
  });

  /** Minutes of play, each move rendered: slow on a loaded machine, so given room. */
  const PLAY_TIMEOUT_MS = 90_000;

  /** Move the cutoff once every `everyMs` for `minutes`, counting the account writes in each whole minute. */
  async function play(everyMs: number, minutes: number): Promise<number[]> {
    const at: number[] = [];
    let seen = 0;
    for (let t = 0, i = 0; t < minutes * 60_000; t += everyMs, i++) {
      // Up and down, so the knob never stops at an end.
      fireEvent.keyDown(cutoffSlider(), { key: i % 20 < 10 ? 'ArrowUp' : 'ArrowDown' });
      await act(async () => vi.advanceTimersByTimeAsync(everyMs));
      for (; seen < panelPuts().length; seen++) at.push(t + everyMs);
    }
    return Array.from(
      { length: minutes },
      (_, m) => at.filter((t) => t > m * 60_000 && t <= (m + 1) * 60_000).length
    );
  }

  it('writes the browser at its own pace, and the account only once the panel has been still', async () => {
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(readStored(SESSION_KEY)).toMatchObject({
      values: expect.objectContaining({ 'filter.cutoff': Number(cutoff()) }),
    });
    expect(panelPuts()).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS));
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({
      body: { panel: { values: expect.objectContaining({ 'filter.cutoff': Number(cutoff()) }) } },
    });
  });

  it(
    'stays far under the section cap during continuous play, and still keeps the panel every so often',
    async () => {
      // A knob moved twice a second for two minutes: slow enough that the browser is written after every move (its
      // delay is 400 ms), which sent to the server would be 120 a minute, over the section's 100.
      const browserWrites = vi.spyOn(window.localStorage, 'setItem');
      const perMinute = await play(500, 2);
      expect(browserWrites.mock.calls.filter((c) => c[0] === SESSION_KEY).length).toBeGreaterThan(
        200
      );
      expect(perMinute).toHaveLength(2);
      // The account is written only when the max wait runs out: twice a minute, and well under the cap.
      for (const n of perMinute) expect(n).toBeLessThanOrEqual(12);
      expect(perMinute.every((n) => n > 0)).toBe(true);
    },
    PLAY_TIMEOUT_MS
  );

  it(
    'never writes more than once per delay, even when play pauses just long enough each time',
    async () => {
      // One move, then still for just over the delay: the most writes the delay allows.
      const perMinute = await play(ACCOUNT_WRITE_DELAY_MS + 10, 3);
      for (const n of perMinute) expect(n).toBeLessThanOrEqual(12);
      // Every pause did send: the bound is the delay doing its work, not writes going missing.
      expect(perMinute.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(30);
    },
    PLAY_TIMEOUT_MS
  );

  it('sends a setting after the same delay, gathering changes made meanwhile into one', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Dim unused parts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show harmonics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dim unused parts' }));
    expect(readStored('kys.dim')).toBe(false);
    expect(readStored('kys.harm')).toBe(true);
    expect(settingsPatches()).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { dim: false, harm: true }, options: undefined }],
    ]);
  });

  it('sends what is waiting with keepalive when the page goes away', async () => {
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Show harmonics' }));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    window.dispatchEvent(new Event('pagehide'));

    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({ options: { keepalive: true } });
    expect(settingsPatches()).toEqual([
      [SETTINGS_PATH, { body: { harm: true }, options: { keepalive: true } }],
    ]);
    // And not again once the delay has passed.
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS));
    expect(panelPuts()).toHaveLength(1);
    expect(settingsPatches()).toHaveLength(1);
  });
});

// ── another user, another clock, an older panel, a bad answer ───────────────

describe('signed in, guarding the account', () => {
  beforeEach(() => {
    auth.signedIn = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('shows the defaults, not settings another user left, where the account has none; and never sends theirs', async () => {
    storeLocal('kys.heat', true);
    storeLocal('kys.settingsBy', 'user-2');
    storeLocal('kys.settingsAt', Date.parse('2026-10-16T09:00:00.000Z'));
    const { unmount } = page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(pressed('Show sensitive controls')).toBe('false');
    expect(readStored('kys.heat')).toBe(false);
    expect(readStored('kys.settingsBy')).toBe('user-1');
    unmount();

    // The next visit: the browser is now this user's, and holds nothing of the other's to send.
    page();
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    for (const [, req] of settingsPatches())
      expect(req).not.toMatchObject({ body: { heat: true } });
  });

  it('reads the next user’s panel when one user gives way to another, and sends nothing of the first’s to them', async () => {
    account.panel = accountPanel(0);
    const { rerender } = page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(accountGets().filter((p) => p === PANEL_PATH)).toHaveLength(1);
    // A moves the panel and flips a setting, then signs out before either is sent.
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Dim unused parts' }));
    auth.signedIn = false;
    rerender(synthPage());
    await act(async () => vi.advanceTimersByTimeAsync(0));

    auth.signedIn = true;
    auth.userId = 'user-2';
    account.panel = accountPanel(-4);
    rerender(synthPage());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(accountGets().filter((p) => p === PANEL_PATH)).toHaveLength(2);
    expect(cutoff()).toBe('-4');

    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('weighs the panels on the server’s clock when the device’s runs fast', async () => {
    // The account's was kept at 08:00; the browser's was left at 07:57, both by the server's clock. The device runs ten
    // minutes fast, so it stamped its panel 08:07, which taken as it is would look the newer.
    vi.setSystemTime(Date.parse('2026-10-16T08:12:00.000Z'));
    serverAhead = -10 * 60_000;
    storeLocal(SESSION_KEY, browserPanel(3, '2026-10-16T08:07:00.000Z', 'user-1'));
    account.panel = accountPanel(-4);
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe('-4');
    // Stored back on the device's clock, so the next visit weighs it the same way.
    expect(readStored(SESSION_KEY)).toMatchObject({
      savedAt: Date.parse('2026-10-16T08:10:00.000Z'),
    });
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps a stored panel the account would refuse as it stands, without what it would refuse', async () => {
    storeLocal(SESSION_KEY, {
      ...browserPanel(3, '2026-10-16T09:00:00.000Z', 'user-1'),
      presetId: 'Old_Preset',
      step: 5000,
    });
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).toBe('3');
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_DELAY_MS + 1));
    expect(panelPuts()).toHaveLength(1);
    expect(panelPuts()[0][1]).toMatchObject({ body: { presetId: null, step: null } });
  });

  it('takes nothing from, and sends nothing to, an account whose answer is not what it should be', async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path === SETTINGS_PATH)
        return { ...served.settings(NO_SETTINGS), updatedAt: 'yesterday' };
      if (path === PANEL_PATH) return { panel: { ...accountPanel(-4), updatedAt: 'yesterday' } };
      return [];
    });
    storeLocal('kys.dim', true);
    page();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(cutoff()).not.toBe('-4');
    fireEvent.keyDown(cutoffSlider(), { key: 'ArrowUp' });
    await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_WRITE_MAX_WAIT_MS * 2));
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(readStored('kys.dim')).toBe(true);
  });
});
