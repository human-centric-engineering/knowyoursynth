// @vitest-environment happy-dom

/**
 * The tutor panel on the synth page (`f-tutor` t-56): a proposal applied and undone, a stale one dropped, a designed
 * sound opened with its lesson and saved with it, the allowance closing the composer, failures kept to the panel, the
 * conversation resumed, and the library's "ask the tutor".
 *
 * The page, panel, library, lesson and tutor panel are real, and so are the tools: each turn's results are what
 * `propose_panel_change` and `design_sound` return for the panel the page sent, so the panel's own checks are run on the
 * server's real output. The stream is Sunrise's SSE framing over a fake `fetch`; the router, the audio engine, the
 * session and the API client are fakes.
 *
 * @see components/app/tutor/tutor-panel.tsx
 * @see components/app/tutor/use-tutor-chat.ts
 * @see components/app/synth/synth-page.tsx
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SynthPage } from '@/components/app/synth/synth-page';
import type { SynthPageProps } from '@/components/app/synth/synth-page';
import { focusStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import { TUTOR_ERRORS } from '@/components/app/tutor/use-tutor-chat';
import { MAX_TUTOR_MESSAGE_CHARS } from '@/lib/app/tutor/request';
import type { CatalogueSound, CatalogueSynth, SynthDetail } from '@/lib/app/catalogue/read';
import type { UserSoundDetail } from '@/lib/app/sounds/data';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import { darkBassDesign, panelContext } from '@/tests/helpers/tutor';

const { router, engine, auth, api } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  engine: {
    send: vi.fn(),
    setFx: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    running: false,
  },
  auth: { signedIn: true, pending: false },
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/app/synth/engine', () => ({
  getEngine: () => engine,
  listen: () => () => undefined,
}));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: auth.signedIn ? { user: { id: 'user-1' }, session: { id: 's-1' } } : null,
    isPending: auth.pending,
  }),
}));
// The account's settings and last panel answer "nothing kept yet", so `api` sees the tutor's and the sounds' requests.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const account = (path: string) => path.startsWith('/api/v1/me/');
  return {
    ...real,
    apiClient: {
      ...api,
      get: (path: string, opts?: unknown) =>
        account(path)
          ? Promise.resolve(
              path === '/api/v1/me/settings'
                ? { tips: null, dim: null, heat: null, harm: null, fx: null }
                : null
            )
          : api.get(path, opts),
      put: (path: string) => (account(path) ? Promise.resolve(null) : api.put(path)),
      patch: (path: string, opts?: unknown) =>
        account(path) ? Promise.resolve(null) : api.patch(path, opts),
    },
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

// ── fixtures ────────────────────────────────────────────────────────────────

const sound = (
  over: Partial<CatalogueSound> & Pick<CatalogueSound, 'id' | 'name'>
): CatalogueSound => ({
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
  ...over,
});

/** The sound the page opens with: the filter at 1, which neither the proposal nor the design leaves it at. */
const OPEN_BASS = sound({
  id: 'open-bass',
  name: 'Open bass',
  steps: [{ title: 'Open it', module: 'filter', why: 'Bright.', set: { 'filter.cutoff': 1 } }],
});
const WOBBLE = sound({
  id: 'wobble',
  name: 'Wobble lead',
  steps: [{ title: 'Open it', module: 'filter', why: 'Bright.', set: { 'filter.cutoff': 4 } }],
});

const MODEL_D_SYNTH: CatalogueSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary: 'Three oscillators.',
  design: 'neutral',
  definitionVersion: def.version,
  soundCount: 2,
};

const detail: SynthDetail = {
  synth: MODEL_D_SYNTH,
  sounds: [OPEN_BASS, WOBBLE],
  lineage: null,
  notes: { unusual: {}, limits: { intro: null, items: [], shared: [] } },
};

const ALLOWANCE = { limit: 30, used: 4, remaining: 26, resetsAt: '2026-10-19T00:00:00.000Z' };
const SPENT = { ...ALLOWANCE, used: 30, remaining: 0 };
const CONVERSATION_ID = 'cmconv0000000000000000001';

// ── the stream ──────────────────────────────────────────────────────────────

type Event = { type: string } & Record<string, unknown>;
/** One SSE frame, as `sseResponse` writes it. */
const frame = (e: Event) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;

interface TurnBody {
  synthId: string;
  panel: { values: ControlValues; cables: CablePair[] };
  message: string;
  conversationId?: string;
}

/** A stream the test writes to as it goes. */
function liveStream() {
  let ctl: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
    },
  });
  const enc = new TextEncoder();
  return {
    body,
    send: (...events: Event[]) => events.forEach((e) => ctl?.enqueue(enc.encode(frame(e)))),
    /** Bytes as they are, for what `sseResponse` sends that is not an event (a keepalive). */
    raw: (text: string) => ctl?.enqueue(enc.encode(text)),
    close: () => ctl?.close(),
    fail: () => ctl?.error(new TypeError('network error')),
  };
}

const okResponse = (body: ReadableStream<Uint8Array>) => ({
  ok: true,
  status: 200,
  body,
  json: () => Promise.resolve(null),
});
const refusal = (status: number, error: { code: string; message: string; details?: unknown }) => ({
  ok: false,
  status,
  body: null,
  json: () => Promise.resolve({ success: false, error }),
});

const fetchMock = vi.fn();
const sentBodies = (): TurnBody[] =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as { body: string }).body) as TurnBody);

const proposeTool = new ProposePanelChangeCapability();
const designTool = new DesignSoundCapability();
/** What a tool returns for the panel a turn sent. */
const toolOn = (body: TurnBody) => panelContext(def, body.panel);
const proposalFor = (body: TurnBody, args: unknown) =>
  proposeTool.execute(proposeTool.validate(args), toolOn(body));
const designFor = (body: TurnBody) =>
  designTool.execute(designTool.validate(darkBassDesign()), toolOn(body));

/** Every turn answers with these frames, worked out from what it sent, then closes. */
function answer(frames: (body: TurnBody) => Promise<Event[]> | Event[]) {
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as TurnBody;
    const s = liveStream();
    s.send(...(await frames(body)));
    s.close();
    return okResponse(s.body);
  });
}

const start = { type: 'start', conversationId: CONVERSATION_ID, messageId: 'msg-1' };
const done = { type: 'done' };

// ── the page ────────────────────────────────────────────────────────────────

function page(over: Partial<SynthPageProps> = {}) {
  return render(<SynthPage detail={detail} synths={[MODEL_D_SYNTH]} viewParam={null} {...over} />);
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const tutor = () => screen.getByRole('region', { name: 'AI tutor' });
const loadedName = () => screen.getByText('Loaded:').nextElementSibling?.textContent;
const cutoff = () =>
  screen.getAllByRole('slider', { name: /CUTOFF/ })[0].getAttribute('aria-valuenow');
const lessonPanel = () => screen.getByRole('article', { name: /./ });
const library = () => screen.getByRole('region', { name: 'Sound library' });

/** What the allowance route answers now: a test spends the day's turns by changing it. */
const served = { allowance: ALLOWANCE };

/** The API's answers: the allowance, the conversation to carry on (none, unless given), and the sounds list. */
function serve({
  allowance = ALLOWANCE,
  conversation = null,
}: {
  allowance?: typeof ALLOWANCE;
  conversation?: { conversationId: string; messages: { role: string; content: string }[] } | null;
} = {}) {
  served.allowance = allowance;
  api.get.mockImplementation(async (path: string) => {
    if (path === '/api/v1/tutor/allowance') return served.allowance;
    if (path === '/api/v1/tutor/conversation') return { conversation };
    if (path === '/api/v1/sounds') return [];
    throw new Error(`unexpected GET ${path}`);
  });
}

/** Ask the tutor, once its panel is ready. */
async function ask(text = 'Make this sound darker') {
  const input = within(tutor()).getByRole('textbox', { name: /Ask the tutor/ });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(within(tutor()).getByRole('button', { name: 'Ask' }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/synths/model-d');
  auth.signedIn = true;
  auth.pending = false;
  for (const f of Object.values(api)) f.mockReset();
  serve();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  router.push.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => focusStore.set(null));
});

// ── signed out ──────────────────────────────────────────────────────────────

describe('signed out', () => {
  it('asks the visitor to sign in, coming back to this synth, and sends nothing', () => {
    auth.signedIn = false;
    page();

    const signIn = within(tutor()).getByRole('link', { name: 'Sign in' });
    expect(signIn.getAttribute('href')).toBe(
      `/login?callbackUrl=${encodeURIComponent('/synths/model-d')}`
    );
    expect(within(tutor()).queryByRole('textbox')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── a turn ──────────────────────────────────────────────────────────────────

describe('a turn', () => {
  it('sends the synth, the panel as it is and the question, and streams the answer in', async () => {
    answer(() => [
      start,
      { type: 'content', delta: 'Turn CUTOFF ' },
      { type: 'content', delta: 'down.' },
      done,
    ]);
    page();
    await ask();

    await waitFor(() => expect(within(tutor()).getByText('Turn CUTOFF down.')).toBeTruthy());
    expect(within(tutor()).getByText('Make this sound darker')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tutor/stream', expect.anything());
    const [body] = sentBodies();
    expect(body).toMatchObject({ synthId: 'model-d', message: 'Make this sound darker' });
    expect(body.panel.values['filter.cutoff']).toBe(1);
    expect(body).not.toHaveProperty('conversationId');
    // the allowance is read again after the turn
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([p]) => p === '/api/v1/tutor/allowance')).toHaveLength(2)
    );
    expect(within(tutor()).getByText('26 of 30 questions left today')).toBeTruthy();
  });

  it("carries on the synth's latest conversation, showing what was said", async () => {
    serve({
      conversation: {
        conversationId: CONVERSATION_ID,
        messages: [
          { role: 'user', content: 'What does EMPHASIS do?' },
          { role: 'assistant', content: 'It makes the filter ring.' },
        ],
      },
    });
    answer(() => [start, { type: 'content', delta: 'Yes.' }, done]);
    page();

    expect(await within(tutor()).findByText('It makes the filter ring.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/api/v1/tutor/conversation', {
      params: { synthId: 'model-d' },
    });
    await ask('And CUTOFF?');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBodies()[0].conversationId).toBe(CONVERSATION_ID);
  });

  it('starts a new conversation, once, when the one it carried on has gone', async () => {
    serve({ conversation: { conversationId: CONVERSATION_ID, messages: [] } });
    fetchMock
      .mockResolvedValueOnce(
        refusal(404, {
          code: 'TUTOR_CONVERSATION_NOT_FOUND',
          message: "That conversation isn't about this synth, or has gone. Start a new one.",
        })
      )
      .mockImplementationOnce(async () => {
        const s = liveStream();
        s.send(start, { type: 'content', delta: 'Here goes.' }, done);
        s.close();
        return okResponse(s.body);
      });
    page();
    await ask();

    await waitFor(() => expect(within(tutor()).getByText('Here goes.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = sentBodies();
    expect(first.conversationId).toBe(CONVERSATION_ID);
    expect(second).not.toHaveProperty('conversationId');
    expect(second.message).toBe(first.message);
    expect(within(tutor()).getByText(/starts a new one/)).toBeTruthy();
  });
});

// ── Apply and Undo ──────────────────────────────────────────────────────────

describe('a proposal', () => {
  /** "Make this sound darker": the filter down to -3, from whatever the panel sent. */
  const darker = () =>
    answer(async (body) => [
      start,
      { type: 'content', delta: 'Close the filter a little.' },
      {
        type: 'capability_result',
        capabilitySlug: 'propose_panel_change',
        result: await proposalFor(body, { set: { 'filter.cutoff': -3 } }),
      },
      done,
    ]);

  it('applies, and Undo puts the panel back', async () => {
    darker();
    page();
    expect(cutoff()).toBe('1');
    await ask();

    const apply = await within(tutor()).findByRole('button', { name: 'Apply 1 change' });
    expect(within(tutor()).getByText('CUTOFF FREQUENCY: 1 · 1.3 kHz → −3 · 80 Hz')).toBeTruthy();
    // nothing moves until the learner applies it
    expect(cutoff()).toBe('1');
    fireEvent.click(apply);
    expect(cutoff()).toBe('-3');
    expect(screen.getByText('1 control moved')).toBeTruthy();
    expect(loadedName()).toBe('Open bass');

    fireEvent.click(within(tutor()).getByRole('button', { name: 'Undo' }));
    expect(cutoff()).toBe('1');
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    // the panel is the one it was made for again, so it can go back on
    expect(within(tutor()).getByRole('button', { name: 'Apply 1 change' })).toBeEnabled();
  });

  it('holds Undo back once the panel has moved on', async () => {
    darker();
    page();
    await ask();
    fireEvent.click(await within(tutor()).findByRole('button', { name: 'Apply 1 change' }));
    const undo = within(tutor()).getByRole('button', { name: 'Undo' });
    expect(undo).toBeEnabled();

    fireEvent.click(button('A-440'));
    expect(undo).toBeDisabled();
    // Undo would have thrown the A-440 change away along with the tutor's
    fireEvent.click(undo);
    expect(cutoff()).toBe('-3');
    expect(screen.getByText('2 controls moved')).toBeTruthy();
  });

  it('is dropped, and says so, when the panel changed while the tutor worked it out', async () => {
    const s = liveStream();
    let sent: TurnBody | null = null;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body) as TurnBody;
      return okResponse(s.body);
    });
    page();
    await ask();
    await waitFor(() => expect(sent).not.toBeNull());

    // the learner turns something on while the tutor is still answering
    fireEvent.click(button('A-440'));
    const result = await proposalFor(sent!, { set: { 'filter.cutoff': -3 } });
    await act(async () => {
      s.send(
        start,
        { type: 'capability_result', capabilitySlug: 'propose_panel_change', result },
        done
      );
      s.close();
    });

    expect(await within(tutor()).findByText(/The panel has changed since/)).toBeTruthy();
    expect(within(tutor()).queryByRole('button', { name: /^Apply/ })).toBeNull();
    expect(cutoff()).toBe('1');
  });

  it('offers only the last step’s proposal, with the calls of one step combined', async () => {
    answer(async (body) => [
      start,
      {
        type: 'capability_result',
        capabilitySlug: 'propose_panel_change',
        result: await proposalFor(body, { set: { 'filter.cutoff': -3 } }),
      },
      {
        type: 'capability_results',
        results: [
          {
            capabilitySlug: 'propose_panel_change',
            result: await proposalFor(body, { set: { 'filter.cutoff': -1 } }),
          },
          {
            capabilitySlug: 'propose_panel_change',
            result: await proposalFor(body, { set: { 'filter.emphasis': 4 } }),
          },
        ],
      },
      done,
    ]);
    page();
    await ask();

    fireEvent.click(await within(tutor()).findByRole('button', { name: 'Apply 2 changes' }));
    expect(cutoff()).toBe('-1');
    expect(
      screen.getAllByRole('slider', { name: /EMPHASIS/ })[0].getAttribute('aria-valuenow')
    ).toBe('4');
  });
});

// ── a designed sound ────────────────────────────────────────────────────────

describe('a designed sound', () => {
  const designs = () =>
    answer(async (body) => [
      start,
      { type: 'content', delta: 'Here is a dark, round bass. Trust your ears.' },
      { type: 'capability_result', capabilitySlug: 'design_sound', result: await designFor(body) },
      done,
    ]);

  it('opens on the panel with its lesson, and Undo goes back to what was there', async () => {
    designs();
    page();
    await ask('Design a dark round bass');

    await waitFor(() => expect(loadedName()).toBe('Dark round bass'));
    expect(cutoff()).toBe('-2');
    expect(screen.getByText('from the tutor')).toBeTruthy();
    const lesson = lessonPanel();
    expect(within(lesson).getByRole('heading', { level: 2 }).textContent).toBe('Dark round bass');
    expect(within(lesson).getByText('AI designed · check by ear')).toBeTruthy();
    expect(within(lesson).getByText(darkBassDesign().blurb)).toBeTruthy();
    expect(within(lesson).getByRole('tab', { name: /Build it/ }).textContent).toContain('3 steps');
    expect(within(library()).queryAllByRole('button', { current: true })).toHaveLength(0);
    expect(within(tutor()).getByText(/Opened on the panel/)).toBeTruthy();

    fireEvent.click(within(tutor()).getByRole('button', { name: 'Undo' }));
    expect(loadedName()).toBe('Open bass');
    expect(cutoff()).toBe('1');
    expect(within(lessonPanel()).getByRole('heading', { level: 2 }).textContent).toBe('Open bass');
    expect(within(tutor()).getByText(/Undone/)).toBeTruthy();
  });

  it('steps through its own lesson, and Restore builds it again', async () => {
    designs();
    page();
    await ask('Design a dark round bass');
    await waitFor(() => expect(loadedName()).toBe('Dark round bass'));

    fireEvent.click(button('Build it step by step'));
    expect(screen.getByText('step 1 of 3')).toBeTruthy();
    expect(loadedName()).toBe('Dark round bass');
    expect(cutoff()).not.toBe('-2'); // the filter is the second step
    // the header's Next step, not the step bar's arrow of the same name
    const next = () => screen.getAllByRole('button').find((b) => b.textContent === 'Next step');
    fireEvent.click(next()!);
    fireEvent.click(next()!);
    expect(screen.getByText('step 3 of 3')).toBeTruthy();
    fireEvent.click(button('Finish'));
    expect(cutoff()).toBe('-2');
    fireEvent.click(button('A-440'));
    fireEvent.click(button('Restore sound'));
    expect(screen.queryByText(/controls? moved/)).toBeNull();
    expect(loadedName()).toBe('Dark round bass');
  });

  it('saves as one of the user’s sounds with its lesson and the tutor’s mark', async () => {
    let saved: UserSoundDetail | null = null;
    api.post.mockImplementation(
      async (_path: string, { body }: { body: Record<string, unknown> }) => {
        saved = {
          id: 'cmsaved',
          synthId: 'model-d',
          name: String(body.name),
          notes: null,
          definitionVersion: def.version,
          source: null,
          basedOn: null,
          fromTutor: true,
          lesson: body.lesson as UserSoundDetail['lesson'],
          visibility: 'private',
          slug: null,
          publishedAt: null,
          tags: [],
          unlisted: false,
          playable: true,
          createdAt: '2026-10-18T10:00:00.000Z',
          updatedAt: '2026-10-18T10:00:00.000Z',
          panel: body.panel as UserSoundDetail['panel'],
          problems: [],
          fitted: null,
        };
        return saved;
      }
    );
    designs();
    page();
    await ask('Design a dark round bass');
    await waitFor(() => expect(loadedName()).toBe('Dark round bass'));

    fireEvent.click(button('Save…'));
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Dark round bass');
    expect(screen.getByText(/keeps the tutor's lesson/)).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Save this sound' })).getByRole('button', {
        name: 'Save',
      })
    );

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, { body }] = api.post.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(path).toBe('/api/v1/sounds');
    expect(body).toMatchObject({
      synthId: 'model-d',
      name: 'Dark round bass',
      fromTutor: true,
      lesson: {
        category: 'bass',
        level: 1,
        blurb: darkBassDesign().blurb,
        how: darkBassDesign().how,
        phrase: { bpm: 96, steps: darkBassDesign().phrase.steps },
      },
    });
    expect((body.lesson as { steps: unknown[] }).steps).toHaveLength(3);
    expect(body).not.toHaveProperty('source');
    // it is one of theirs now, and its lesson is the one it was saved with
    await waitFor(() => expect(screen.getByText('mine')).toBeTruthy());
    expect(screen.queryByText('from the tutor')).toBeNull();
    expect(within(lessonPanel()).getByText(darkBassDesign().blurb)).toBeTruthy();
    expect(saved).not.toBeNull();
  });
});

// ── the allowance ───────────────────────────────────────────────────────────

describe('the allowance', () => {
  it('closes the composer at zero', async () => {
    serve({ allowance: SPENT });
    page();

    expect(await within(tutor()).findByText('0 of 30 questions left today')).toBeTruthy();
    expect(within(tutor()).getByText(/That's all of today's questions/)).toBeTruthy();
    expect(within(tutor()).getByRole('textbox', { name: /Ask the tutor/ })).toBeDisabled();
    expect(within(tutor()).getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('closes it when a turn is refused for the day', async () => {
    const message =
      "That's all 30 of today's questions for the tutor. They come back at midnight UTC. The synth and everything else on the page still work.";
    fetchMock.mockImplementation(async () => {
      // spent elsewhere since the page read it, as another tab would
      served.allowance = SPENT;
      return refusal(429, { code: 'TUTOR_ALLOWANCE_SPENT', message, details: SPENT });
    });
    page();
    expect(await within(tutor()).findByText('26 of 30 questions left today')).toBeTruthy();
    await ask();

    expect(await within(tutor()).findByText(message)).toBeTruthy();
    await waitFor(() =>
      expect(within(tutor()).getByRole('textbox', { name: /Ask the tutor/ })).toBeDisabled()
    );
  });
});

// ── failures stay in the panel ──────────────────────────────────────────────

describe('a failed turn', () => {
  const failures: [string, () => void, RegExp][] = [
    [
      'a provider error',
      () =>
        answer(() => [
          start,
          { type: 'error', code: 'http_500', message: 'Provider returned HTTP 500' },
        ]),
      /could not answer just now/,
    ],
    [
      'a 429',
      () =>
        fetchMock.mockResolvedValue(
          refusal(429, { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' })
        ),
      /Too many questions in a short time/,
    ],
    [
      'a stream that closes before it is done',
      () => answer(() => [start, { type: 'content', delta: 'Turn the' }]),
      /answer was cut off/,
    ],
    [
      'a stream that breaks',
      () =>
        fetchMock.mockImplementation(async () => {
          const s = liveStream();
          s.send(start);
          s.fail();
          return okResponse(s.body);
        }),
      /answer was cut off/,
    ],
  ];

  it.each(failures)(
    '%s ends the turn with a line in the panel and leaves the page working',
    async (_, fail, line) => {
      fail();
      page();
      await ask();

      expect(await within(tutor()).findByText(line)).toBeTruthy();
      expect(within(tutor()).getByRole('alert')).toBeTruthy();
      // tried once: a turn counts once its message is saved, so it is not sent again behind the learner's back
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // the composer takes the next question
      await waitFor(() =>
        expect(within(tutor()).getByRole('textbox', { name: /Ask the tutor/ })).toBeEnabled()
      );
      // and the rest of the page never waited on the turn
      fireEvent.click(within(library()).getByRole('button', { name: /Wobble lead/ }));
      expect(loadedName()).toBe('Wobble lead');
      expect(cutoff()).toBe('4');
      fireEvent.click(button('A-440'));
      expect(screen.getByText('1 control moved')).toBeTruthy();
    }
  );
});

// ── the library's hint ──────────────────────────────────────────────────────

describe("the library's empty search", () => {
  it('puts a request for that sound in the tutor’s composer, for the learner to send', async () => {
    page();
    const tutorInput = within(tutor()).getByRole('textbox', { name: /Ask the tutor/ });
    await waitFor(() => expect(tutorInput).toBeEnabled());
    fireEvent.change(within(library()).getByRole('searchbox'), {
      target: { value: 'glassy bell' },
    });

    fireEvent.click(within(library()).getByRole('button', { name: 'ask the tutor to design one' }));

    expect(tutorInput).toHaveValue('Design a sound: glassy bell');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── what the learner is told ────────────────────────────────────────────────

describe('what a failed turn tells the learner', () => {
  // Sunrise's own messages are written for an admin; none of them reaches the learner.
  const streamed: [string, Event, string][] = [
    [
      'an answer the content policy blocked',
      {
        type: 'error',
        code: 'output_blocked',
        message: 'Response blocked by content policy. Please rephrase your question.',
      },
      TUTOR_ERRORS.refused,
    ],
    [
      'a turn out of tool steps',
      { type: 'error', code: 'tool_loop_cap', message: 'Exceeded maximum tool iterations (5)' },
      TUTOR_ERRORS.steps,
    ],
    [
      "the tutor's monthly budget spent",
      {
        type: 'error',
        code: 'budget_exceeded',
        message:
          'This agent has reached its monthly budget of $50.00. Contact an admin to increase the limit or switch to a local model.',
      },
      TUTOR_ERRORS.budget,
    ],
    [
      'no more conversations for this account',
      {
        type: 'error',
        code: 'conversation_cap_reached',
        message: 'You have reached the maximum number of conversations (10) for this agent.',
      },
      TUTOR_ERRORS.conversations,
    ],
    [
      'an answer over the per-turn cost cap',
      {
        type: 'budget_exceeded_per_turn',
        code: 'budget_exceeded_per_turn',
        message:
          "This response cost $0.2500, which exceeded the agent's per-turn cost limit of $0.2000. Ask an admin to raise the cap or pick a cheaper model.",
        usedUsd: 0.25,
        limitUsd: 0.2,
      },
      TUTOR_ERRORS.turnCost,
    ],
  ];

  it.each(streamed)('%s', async (_, event, line) => {
    answer(() => [start, event]);
    page();
    await ask();

    expect(await within(tutor()).findByText(line)).toBeTruthy();
    expect(within(tutor()).queryByText(String(event.message))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const refused: [string, number, { code: string; message: string }, string][] = [
    [
      'a session that has ended',
      401,
      { code: 'UNAUTHORIZED', message: 'Authentication required' },
      TUTOR_ERRORS.signedOut,
    ],
    [
      'a panel the synth refuses',
      400,
      { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      TUTOR_ERRORS.badPanel,
    ],
    [
      'the tutor switched off, in the route’s own words',
      503,
      {
        code: 'TUTOR_UNAVAILABLE',
        message:
          "The tutor isn't available right now. The synth and everything else on the page still work.",
      },
      "The tutor isn't available right now. The synth and everything else on the page still work.",
    ],
    [
      'anything else',
      500,
      { code: 'INTERNAL_ERROR', message: 'Database connection refused' },
      TUTOR_ERRORS.generic,
    ],
  ];

  it.each(refused)('%s', async (_, status, error, line) => {
    fetchMock.mockResolvedValue(refusal(status, error));
    page();
    await ask();

    expect(await within(tutor()).findByText(line)).toBeTruthy();
    if (line !== error.message) expect(within(tutor()).queryByText(error.message)).toBeNull();
  });
});

describe('the conversation', () => {
  it('starts a new one, once, when the one it carried on is full, and carries that one on', async () => {
    serve({ conversation: { conversationId: CONVERSATION_ID, messages: [] } });
    const FRESH = 'cmconv0000000000000000002';
    let turns = 0;
    answer(() =>
      turns++ === 0
        ? [
            {
              type: 'error',
              code: 'conversation_length_cap_reached',
              message:
                'This conversation has reached the maximum length (50 messages). Please start a new conversation.',
            },
          ]
        : [{ ...start, conversationId: FRESH }, { type: 'content', delta: 'A fresh start.' }, done]
    );
    page();
    await ask();

    expect(await within(tutor()).findByText('A fresh start.')).toBeTruthy();
    expect(within(tutor()).queryByRole('alert')).toBeNull();
    expect(within(tutor()).getByText(/starts a new one/)).toBeTruthy();
    const [first, second] = sentBodies();
    expect(first.conversationId).toBe(CONVERSATION_ID);
    expect(second).not.toHaveProperty('conversationId');

    await ask('And then?');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(sentBodies()[2].conversationId).toBe(FRESH);
  });

  it('opens the composer when the conversation cannot be read, and the first question starts one', async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path === '/api/v1/tutor/allowance') return ALLOWANCE;
      if (path === '/api/v1/tutor/conversation') throw new Error('offline');
      return [];
    });
    answer(() => [start, done]);
    page();
    await ask();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBodies()[0]).not.toHaveProperty('conversationId');
  });
});

describe('the composer', () => {
  it('starts from a suggested question, and Enter sends it', async () => {
    answer(() => [start, done]);
    page();
    const input = within(tutor()).getByRole('textbox', { name: /Ask the tutor/ });
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.click(
      within(tutor()).getByRole('button', { name: 'How do I make it darker and rounder?' })
    );
    expect(input).toHaveValue('How do I make it darker and rounder?');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBodies()[0].message).toBe('How do I make it darker and rounder?');
  });

  it('shows what the tutor is doing while it works, and starts the answer again when told to', async () => {
    const s = liveStream();
    fetchMock.mockResolvedValue(okResponse(s.body));
    page();
    await ask();

    await act(async () => s.send(start, { type: 'status', message: 'Looking up the filter…' }));
    expect(await within(tutor()).findByText('Looking up the filter…')).toBeTruthy();
    await act(async () => {
      s.raw(': keepalive\n\n');
      s.send(
        { type: 'content', delta: 'First try' },
        { type: 'content_reset' },
        { type: 'content', delta: 'Second try' },
        done
      );
      s.close();
    });

    expect(await within(tutor()).findByText('Second try')).toBeTruthy();
    expect(within(tutor()).queryByText(/First try/)).toBeNull();
    expect(within(tutor()).queryByText('Looking up the filter…')).toBeNull();
    expect(within(tutor()).queryByRole('alert')).toBeNull();
  });

  it('stops a turn on Stop, and says so', async () => {
    const s = liveStream();
    fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => {
      // as a real response body does, the stream breaks when its request is aborted
      init.signal.addEventListener('abort', () => s.fail());
      return okResponse(s.body);
    });
    page();
    await ask();
    await act(async () => s.send(start, { type: 'content', delta: 'Turn the' }));

    fireEvent.click(await within(tutor()).findByRole('button', { name: 'Stop' }));

    expect(await within(tutor()).findByText(TUTOR_ERRORS.stopped)).toBeTruthy();
    expect(within(tutor()).getByText('Turn the')).toBeTruthy();
    expect(within(tutor()).getByRole('button', { name: 'Ask' })).toBeTruthy();
  });
});

// ── review round 1 ──────────────────────────────────────────────────────────

describe('a turn still answering', () => {
  it('holds Apply until the turn ends, so a later step can still replace the proposal', async () => {
    const s = liveStream();
    let sent: TurnBody | null = null;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body) as TurnBody;
      return okResponse(s.body);
    });
    page();
    await ask();
    await waitFor(() => expect(sent).not.toBeNull());
    const body = sent!;

    const first = await proposalFor(body, { set: { 'filter.cutoff': -3 } });
    await act(async () =>
      s.send(start, {
        type: 'capability_result',
        capabilitySlug: 'propose_panel_change',
        result: first,
      })
    );
    const held = await within(tutor()).findByRole('button', { name: 'Apply 1 change' });
    expect(held).toBeDisabled();
    // not called stale while it waits
    expect(within(tutor()).queryByText(/The panel has changed since/)).toBeNull();
    fireEvent.click(held);
    expect(cutoff()).toBe('1');

    const second = await proposalFor(body, { set: { 'filter.cutoff': -1 } });
    await act(async () => {
      s.send(
        { type: 'capability_result', capabilitySlug: 'propose_panel_change', result: second },
        done
      );
      s.close();
    });
    await waitFor(() =>
      expect(within(tutor()).getByRole('button', { name: 'Apply 1 change' })).toBeEnabled()
    );
    fireEvent.click(within(tutor()).getByRole('button', { name: 'Apply 1 change' }));
    expect(cutoff()).toBe('-1');
    fireEvent.click(within(tutor()).getByRole('button', { name: 'Undo' }));
    expect(cutoff()).toBe('1');
  });

  it("keeps a design's Undo its own when the same turn also proposed a change", async () => {
    answer(async (body) => [
      start,
      {
        type: 'capability_result',
        capabilitySlug: 'propose_panel_change',
        result: await proposalFor(body, { set: { 'filter.cutoff': -3 } }),
      },
      { type: 'capability_result', capabilitySlug: 'design_sound', result: await designFor(body) },
      done,
    ]);
    page();
    await ask('Design a dark round bass');
    await waitFor(() => expect(loadedName()).toBe('Dark round bass'));

    // the proposal was for the panel before the design opened
    expect(await within(tutor()).findByText(/The panel has changed since/)).toBeTruthy();
    const undo = within(tutor()).getByRole('button', { name: 'Undo' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(loadedName()).toBe('Open bass');
    expect(cutoff()).toBe('1');
    // back on the panel it was made for, so the proposal can go on now
    fireEvent.click(within(tutor()).getByRole('button', { name: 'Apply 1 change' }));
    expect(cutoff()).toBe('-3');
  });

  it('says when an answer stopped at the token cap', async () => {
    answer(() => [
      start,
      { type: 'content', delta: 'Turn CUTOFF down and' },
      { type: 'done', finishReason: 'length' },
    ]);
    page();
    await ask();

    expect(await within(tutor()).findByText(TUTOR_ERRORS.dropped)).toBeTruthy();
    expect(within(tutor()).getByText('Turn CUTOFF down and')).toBeTruthy();
  });
});

describe('asking the tutor from the library', () => {
  it('keeps the category advice when a category is chosen, and fits the question to what the route takes', async () => {
    page();
    const tutorInput = within(tutor()).getByRole('textbox', { name: /Ask the tutor/ });
    await waitFor(() => expect(tutorInput).toBeEnabled());
    fireEvent.click(within(library()).getByRole('button', { name: 'bass' }));
    fireEvent.change(within(library()).getByRole('searchbox'), {
      target: { value: `lead ${'x'.repeat(5000)}` },
    });

    expect(within(library()).getByText(/pick another category/)).toBeTruthy();
    fireEvent.click(within(library()).getByRole('button', { name: 'ask the tutor to design one' }));

    expect((tutorInput as HTMLTextAreaElement).value).toHaveLength(MAX_TUTOR_MESSAGE_CHARS);
    expect((tutorInput as HTMLTextAreaElement).value.startsWith('Design a sound: lead x')).toBe(
      true
    );
  });
});
