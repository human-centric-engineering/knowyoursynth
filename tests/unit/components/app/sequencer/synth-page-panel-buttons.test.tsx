// @vitest-environment happy-dom

/**
 * The TB-303, TD-3 and Donner B1's own sequencer buttons driving the sequencer (`f-step-sequencer` t-85): RUN/STOP
 * (PLAY/STOP) is its transport, the step buttons work on the chosen step, and the B1's ARP, REC/EDIT and HOLD set how
 * notes are played into it. The audio engine is a fake that records what it is sent; the page, the panel and the
 * sequencer are real.
 *
 * @see components/app/synth/synth-page.tsx
 * @see components/app/sequencer/panel-buttons.ts
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

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const IDS = ['tb-303', 'td-3', 'donner-b1'] as const;

beforeAll(async () => {
  for (const id of IDS) await loadSynthDef(id);
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

/** A synth's page holding one sound, whose riff is C2 on beat 0 and G2 on beat 1: steps 1 and 5 at 1/16. */
function page(id: (typeof IDS)[number]) {
  const def = getSynthDef(id);
  if (!def) throw new Error(`${id} is not registered`);
  const synth: CatalogueSynth = {
    id,
    name: id,
    maker: 'Nobody',
    year: 1981,
    heritage: 'A test heritage',
    summary: 'A test synth.',
    design: 'neutral',
    definitionVersion: def.version,
    soundCount: 1,
  };
  const riff: CatalogueSound = {
    id: 'acid',
    name: 'Acid line',
    ref: 'In the style of nobody',
    artist: 'Nobody',
    tags: ['bass'],
    level: 1,
    blurb: 'A test sound.',
    how: 'Because.',
    phrase: {
      bpm: 120,
      loop: true,
      steps: [
        [0, 36, 0.25],
        [1, 43, 0.25],
      ],
    },
    steps: [],
    context: {},
    tweaks: [],
    version: def.version,
  };
  const detail: SynthDetail = {
    synth,
    sounds: [riff],
    lineage: null,
    notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
  };
  return render(<SynthPage detail={detail} synths={[synth]} viewParam={null} />);
}

/** A button on the panel, by its printed label: the first, where two share one (the 303's two C keys). */
const panelButton = (name: string) =>
  within(screen.getByTestId('panel-frame')).getAllByRole('button', { name })[0];
const pressPanel = async (name: string) => {
  await act(async () => {
    fireEvent.click(panelButton(name));
  });
};
const sequencer = () => screen.getByRole('region', { name: 'Sequencer' });
const seqOpen = () => screen.queryByRole('region', { name: 'Sequencer' }) !== null;
const stepKeys = () => within(sequencer()).getAllByRole('button', { name: /^Step \d+:/ });
const stepKey = (n: number) => stepKeys()[n - 1].getAttribute('aria-label');
const chosenKey = () =>
  stepKeys()
    .find((k) => k.getAttribute('aria-current') === 'true')
    ?.getAttribute('aria-label');
const inspectorToggle = (name: string) =>
  within(sequencer()).getByRole('button', { name }).getAttribute('aria-pressed');
const sent = () => engine.send.mock.calls.map((c) => c[0] as { type: string });
const lastSent = (type: string) =>
  sent()
    .filter((m) => m.type === type)
    .at(-1);

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

describe.each([
  ['tb-303', 'RUN/STOP'],
  ['td-3', 'START/STOP'],
  ['donner-b1', 'PLAY/STOP'],
] as const)('%s: the transport button', (id, run) => {
  it(`${run} starts the sequencer’s pattern and stops it, without opening it`, async () => {
    page(id);
    await pressPanel(run);
    expect(lastSent('pattern')).toMatchObject({
      type: 'pattern',
      loop: {
        notes: [
          [0, 36, 0.25],
          [1, 43, 0.25],
        ],
      },
    });
    expect(lastSent('phrase')).toBeUndefined();
    expect(seqOpen()).toBe(false);
    engine.send.mockClear();
    await pressPanel(run);
    expect(lastSent('stopPattern')).toEqual({ type: 'stopPattern' });
    expect(lastSent('pattern')).toBeUndefined();
  });
});

describe.each(['tb-303', 'td-3'] as const)('%s: the step buttons', (id) => {
  it('TIME MODE opens the sequencer and turns the chosen step off, then on', async () => {
    page(id);
    expect(seqOpen()).toBe(false);
    await pressPanel('TIME MODE');
    expect(stepKey(1)).toBe('Step 1: C2, off');
    await pressPanel('TIME MODE');
    expect(stepKey(1)).toBe('Step 1: C2, on');
  });

  it('a key puts its note on the chosen step in that step’s octave, and moves on', async () => {
    page(id);
    await pressPanel('TIME MODE'); // opens it on step 1
    await pressPanel('TIME MODE');
    await pressPanel('E');
    expect(stepKey(1)).toBe('Step 1: E2, on');
    expect(chosenKey()).toBe('Step 2: rest');
    // a rest takes the octave of the note nearest it
    await pressPanel('G');
    expect(stepKey(2)).toBe('Step 2: G2, on');
  });

  it('DOWN and UP move the chosen step an octave; BACK and WRITE/NEXT choose the step before and after', async () => {
    page(id);
    await pressPanel('UP');
    expect(stepKey(1)).toBe('Step 1: C3, on');
    await pressPanel('DOWN');
    await pressPanel('DOWN');
    expect(stepKey(1)).toBe('Step 1: C1, on');
    await pressPanel('WRITE/NEXT');
    expect(chosenKey()).toBe('Step 2: rest');
    await pressPanel('BACK');
    await pressPanel('BACK');
    expect(chosenKey()).toBe('Step 8: rest');
  });

  it('ACCENT and SLIDE mark the chosen step while the sequencer is open, and leave the panel’s own value alone', async () => {
    page(id);
    await pressPanel('TIME MODE'); // opens it
    await pressPanel('TIME MODE');
    engine.send.mockClear();
    await pressPanel('ACCENT');
    await pressPanel('SLIDE');
    expect(inspectorToggle('Accent')).toBe('true');
    expect(inspectorToggle('Slide')).toBe('true');
    // the voice's live accent and slide are not switched on: no new settings went to the engine
    expect(lastSent('params')).toBeUndefined();
    await pressPanel('ACCENT');
    expect(inspectorToggle('Accent')).toBe('false');
  });

  it('ACCENT plays live, on the panel, while the sequencer is closed', async () => {
    page(id);
    engine.send.mockClear();
    await pressPanel('ACCENT');
    expect(seqOpen()).toBe(false);
    expect(lastSent('params')).toBeDefined();
  });

  it('PATTERN CLEAR clears the pattern, and the sequencer’s Undo brings it back', async () => {
    page(id);
    await pressPanel(id === 'tb-303' ? 'PATTERN CLEAR' : 'CLEAR');
    expect(stepKey(1)).toBe('Step 1: rest');
    expect(stepKey(5)).toBe('Step 5: rest');
    fireEvent.click(within(sequencer()).getByRole('button', { name: 'Undo' }));
    expect(stepKey(5)).toBe('Step 5: G2, on');
  });

  it('leaves MODE, TRACK, PITCH MODE and FUNCTION to the panel: they open nothing', async () => {
    page(id);
    await pressPanel('PITCH MODE');
    await pressPanel('FUNCTION');
    expect(seqOpen()).toBe(false);
  });
});

describe('donner-b1: the step keys and the function buttons', () => {
  it('a white key chooses its step, and a second press turns it on or off', async () => {
    page('donner-b1');
    await pressPanel('E2'); // step 4
    expect(chosenKey()).toBe('Step 4: rest');
    await pressPanel('E2');
    expect(stepKey(4)).toMatch(/^Step 4: \w+\d, on$/);
    await pressPanel('B1'); // step 1, C2
    await pressPanel('B1');
    expect(stepKey(1)).toBe('Step 1: C2, off');
  });

  it('▼ and ▲ choose the step before and after, and CLEAR/REST makes a rest and moves on', async () => {
    page('donner-b1');
    await pressPanel('▲');
    expect(chosenKey()).toBe('Step 2: rest');
    await pressPanel('▼');
    expect(chosenKey()).toBe('Step 1: C2, on');
    await pressPanel('CLEAR/REST');
    expect(stepKey(1)).toBe('Step 1: rest');
    expect(chosenKey()).toBe('Step 2: rest');
  });

  it('RATCHET counts the chosen step up to four plays and round to one', async () => {
    page('donner-b1');
    await pressPanel('RATCHET');
    const ratchet = () =>
      within(sequencer())
        .getByRole('slider', { name: /Ratchet/ })
        .getAttribute('aria-valuenow');
    expect(ratchet()).toBe('2');
    await pressPanel('RATCHET');
    await pressPanel('RATCHET');
    expect(ratchet()).toBe('4');
    await pressPanel('RATCHET');
    expect(ratchet()).toBe('1');
  });

  it('ARP turns arp mode on: a key held plays through the pattern and is not sounded by the page', async () => {
    page('donner-b1');
    await pressPanel('ARP');
    expect(within(sequencer()).getByRole('combobox', { name: 'Keys' }).textContent).toContain(
      'Arp'
    );
    engine.send.mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    });
    const types = sent().map((m) => m.type);
    expect(types).toContain('pattern');
    expect(types).not.toContain('noteOn');
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    // and off again: back to editing the chosen step
    await pressPanel('ARP');
    expect(within(sequencer()).getByRole('combobox', { name: 'Keys' }).textContent).toContain(
      'Edit step'
    );
  });

  it('REC/EDIT turns step record on and off', async () => {
    page('donner-b1');
    await pressPanel('REC/EDIT');
    const keys = () => within(sequencer()).getByRole('combobox', { name: 'Keys' }).textContent;
    expect(keys()).toContain('Step record');
    await pressPanel('REC/EDIT');
    expect(keys()).toContain('Edit step');
  });

  it('HOLD is the page’s Hold, with the sequencer closed', async () => {
    page('donner-b1');
    await pressPanel('HOLD');
    expect(seqOpen()).toBe(false);
    expect(screen.getByRole('button', { name: /^Hold/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves TEMPO TAP, PATTERN, SAVE and GATE LENGTH to the panel: they open nothing', async () => {
    page('donner-b1');
    for (const b of ['TEMPO TAP', 'PATTERN', 'SAVE', 'GATE LENGTH']) await pressPanel(b);
    expect(seqOpen()).toBe(false);
  });
});
