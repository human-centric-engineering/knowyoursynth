// @vitest-environment happy-dom

/**
 * The performance wheels' lanes on the synth page (`f-performance-wheels`):
 *
 * - the panel as a pattern plays it (t-314): while a lane sets a control or the wheel, the routing view, the live
 *   glow and the harmonics strip's cutoff line read the panel with the lane's values in place, as the wheel's label
 *   and the panel already do;
 * - a controller's mod wheel in from MIDI while a wheel lane is sent out (t-313): the hand's wheel follows it, and only
 *   the output's own CC 1 coming back is dropped.
 *
 * The sequencer and MIDI hooks are the real ones, with what a playing pattern would make of them given straight to
 * the page: what the lanes set on the step heard now (`modShown`), that a wheel lane plays and is sent, and which
 * values MIDI out has just sent. The live glow's layer and the harmonics strip draw from a frame loop and a canvas, so
 * they are stand-ins that show what the page hands them.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ControlValues } from '@/lib/app/synths/contract';
import { storeSound } from '@/tests/helpers/synth-session';
import { SynthPage } from '@/components/app/synth/synth-page';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import { tallScreen } from '@/tests/helpers/synth-side';
import { turnSignal } from '@/tests/helpers/signal-switches';

const { router, engine, lane } = vi.hoisted(() => ({
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
  lane: {
    shown: null as ControlValues | null,
    /** Both wheels' lanes playing and sent over MIDI out, and the values MIDI out has just sent on each. */
    sending: false,
    sent: new Set<number>(),
    sentBend: new Set<number>(),
    onWheel: null as ((v: number) => void) | null,
    onBend: null as ((v: number) => void) | null,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/auth/client', () => ({ useSession: () => ({ data: null, isPending: false }) }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
vi.mock('@/components/app/sequencer/use-sequencer', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/app/sequencer/use-sequencer')>();
  return {
    ...real,
    useSequencer: (...args: Parameters<typeof real.useSequencer>) => {
      const seq = real.useSequencer(...args);
      return {
        ...seq,
        modShown: lane.shown,
        ...(lane.sending && {
          playing: true,
          pattern: { ...seq.pattern, lanes: ['@wheel', '@bend'] },
        }),
      };
    },
  };
});
vi.mock('@/components/app/synth/use-midi', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/app/synth/use-midi')>();
  return {
    ...real,
    useMidi: (...args: Parameters<typeof real.useMidi>) => {
      lane.onWheel = args[0].onWheel ?? null;
      lane.onBend = args[0].onBend ?? null;
      return real.useMidi(...args);
    },
  };
});
vi.mock('@/components/app/sequencer/use-midi-out', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/app/sequencer/use-midi-out')>();
  return {
    ...real,
    useMidiOut: (...args: Parameters<typeof real.useMidiOut>) => {
      const out = real.useMidiOut(...args);
      return lane.sending
        ? {
            ...out,
            sending: true,
            echoed: (kind: 'wheel' | 'bend', v: number) =>
              (kind === 'wheel' ? lane.sent : lane.sentBend).has(v),
          }
        : out;
    },
  };
});
vi.mock('@/components/app/panel/live-layer', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/app/panel/live-layer')>();
  return {
    ...real,
    LiveLayer: ({ live }: { live: { state: { edges: Record<string, boolean> } } }) => (
      <div data-testid="live-glow" data-filter-mod={String(live.state.edges.c33)} />
    ),
  };
});
vi.mock('@/components/app/synth/scope', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/app/synth/scope')>();
  return {
    ...real,
    HarmonicsStrip: ({ cutoff }: { cutoff: number | null }) => (
      <div data-testid="harmonics" data-cutoff={String(cutoff)} />
    ),
  };
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

const BASS: CatalogueSound = {
  id: 'fat-bass',
  name: 'Fat bass',
  ref: 'In the style of nobody',
  artist: 'Nobody',
  tags: ['bass'],
  level: 1,
  blurb: 'A test sound.',
  how: 'Because.',
  phrase: { bpm: 90, loop: true, steps: [[0, 36, 1]] },
  steps: [],
  context: {},
  tweaks: [],
  version: def.version,
};
const MODEL_D: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'A test synth.',
  design: 'neutral',
  definitionVersion: def.version,
  kind: null,
  soundCount: 1,
};
const detail: SynthDetail = {
  synth: MODEL_D,
  sounds: [BASS],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  links: { count: 0, kinds: [] },
  soundLinks: {},
  siblingSounds: [],
  instruments: [],
  family: null,
};

const page = (shown: ControlValues | null) => {
  lane.shown = shown;
  storeSound(def, BASS);
  return render(<SynthPage detail={detail} synths={[MODEL_D]} viewParam={null} />);
};
const press = (name: string) => {
  const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!b) throw new Error(`no ${name} button on the page`);
  fireEvent.click(b);
};
/** The modulation bus to the filter's cutoff, in the routing view: lit, and lit by the wheel. */
const filterMod = () => document.querySelector('[data-edge="c33"]');

/** FILTER MODULATION on, and the mod wheel all the way up: both from the lanes, the panel's own left as they are. */
const LANE = { 'mod.toFilter': true, '@wheel': 1 };

beforeEach(() => {
  window.localStorage.clear();
  tallScreen();
  engine.send.mockReset();
  engine.resume.mockReset().mockResolvedValue(undefined);
  engine.suspend.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  lane.shown = null;
  lane.sending = false;
  lane.sent.clear();
  lane.sentBend.clear();
  lane.onWheel = null;
  lane.onBend = null;
  vi.restoreAllMocks();
});

describe('the panel as the lanes play it (t-314)', () => {
  it('lights the filter path in the routing view on a step where a lane sets FILTER MODULATION on', () => {
    page(LANE);
    press('Signal diagram');
    expect(filterMod()?.getAttribute('data-live')).toBe('true');
    expect(filterMod()?.getAttribute('data-wheel')).toBe('true');
  });

  it('leaves it dark with no lane setting it, as the panel has it', () => {
    page(null);
    press('Signal diagram');
    expect(filterMod()?.getAttribute('data-live')).toBe('false');
  });

  it('lights the filter path in the live glow on that step too', () => {
    page(LANE);
    turnSignal('Live signal', true);
    expect(screen.getByTestId('live-glow')).toHaveAttribute('data-filter-mod', 'true');
  });

  it('draws the harmonics’ cutoff line where a lane has the filter and the wheel', () => {
    // A synth whose wheel opens the filter: here, all the way up opens it to 1234 Hz.
    const real = def.toEngine.bind(def);
    vi.spyOn(def, 'toEngine').mockImplementation((v, ctx) => {
      const p = real(v, ctx);
      return ctx?.wheel === 1 ? { ...p, filter: { ...p.filter, cutoff: 1234 } } : p;
    });
    page({ '@wheel': 1 });
    press('Show harmonics');
    expect(screen.getByTestId('harmonics')).toHaveAttribute('data-cutoff', '1234');
  });

  it('draws it where a lane sets the cutoff knob', () => {
    const drawn = (cutoff: number) => {
      const { unmount } = page({ 'filter.cutoff': cutoff });
      press('Show harmonics');
      const hz = Number(screen.getByTestId('harmonics').getAttribute('data-cutoff'));
      unmount();
      return hz;
    };
    const low = drawn(2);
    window.localStorage.clear();
    expect(drawn(8)).toBeGreaterThan(low);
  });
});

describe('a controller’s wheels while their lanes are sent out (t-313)', () => {
  const handWheel = () =>
    document
      .querySelector('[role="slider"][aria-label="Mod wheel"]')
      ?.getAttribute('aria-valuenow');
  const wheelIn = (v: number) => act(() => lane.onWheel?.(v));

  it('moves the hand’s wheel, which the steps the lane leaves alone send', () => {
    lane.sending = true;
    page(null);
    wheelIn(0.5);
    expect(handWheel()).toBe('50');
  });

  it('drops the output’s own CC 1 coming back in, and nothing else', () => {
    lane.sending = true;
    lane.sent.add(0.9);
    page(null);
    wheelIn(0.3);
    wheelIn(0.9);
    expect(handWheel()).toBe('30');
  });

  it('moves the hand’s pitch wheel too, dropping only the output’s own pitch bend coming back', () => {
    const range = def.performance?.bend?.range ?? 0;
    const pitchWheel = () =>
      Number(
        document
          .querySelector('[role="slider"][aria-label="Pitch wheel"]')
          ?.getAttribute('aria-valuenow')
      );
    lane.sending = true;
    lane.sentBend.add(1);
    page(null);
    act(() => lane.onBend?.(0.5));
    act(() => lane.onBend?.(1));
    expect(range).toBeGreaterThan(0);
    expect(pitchWheel()).toBeCloseTo(0.5 * range, 1);
  });
});
